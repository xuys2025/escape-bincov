/**
 * Gunsmith effective stats (#28 M0-04): what a gun type plus a build does in combat. Pure rules over catalog.ts and
 * compat.ts; nothing in the game reads them until M1-05. Decisions and open questions are in the M0-04 section of
 * docs/gunsmith/CONTRACTS.md.
 *
 * The order is fixed (PLAN section 6):
 *   1. factory values: the gun type's catalog WeaponDef and handling;
 *   2. replacement: one part per position, as validateBuild guarantees, so a feed module's capacity replaces the
 *      factory one and the one sight's modes replace the factory look-ahead;
 *   3. aggregation: all factors on one dimension multiply, smallest first, so install order cannot change a bit;
 *   4. guardrails: each combined factor is clamped once (GUARDRAILS), then the hip and aimed cones are held to
 *      CONE_FLOOR (M0 review decision 3, see liftCones), and only then do the factors scale the factory values;
 *   5. output: GunStats.
 * The hip factor is hip fire's alone (M0 review decision 9, wired in M2-03): the hip grip and a laser tighten the cone
 * from the hip and fade out as the aim rises, so the aimed cone leaves them out (liftCones, scaled, laserHandling).
 * Character modifiers stay out. The Runtime keeps applying the RPG body multiplier (coneOf and driftOf `body`), the #92
 * recoil perk (recoil `scale`) and the reload perk (reloadTime) where it does today, once each, on top of these numbers.
 * Weight, footprint and value belong to the gun instance (M0-05).
 */
import type { WeaponDef } from '../domain';
import { ATTACHMENTS, GUNS, type GunDef, type GunHandling, type GunId } from './catalog';
import { validateBuild, type Build } from './compat';

/** The dimensions attachments scale: the handling and WeaponDef factors of catalog.ts, and gunshot noise. */
const DIMENSIONS = ['hip', 'precise', 'raise', 'sway', 'bloom', 'kick', 'settle', 'recover', 'spread', 'range', 'reload', 'noise'] as const;
type Dimension = typeof DIMENSIONS[number];
/** One factor per dimension, combined over a build and guarded; 1 where nothing changes it. */
export type FactorSet = Readonly<Record<Dimension, number>>;

/**
 * Combined guardrails (PLAN section 6; proposals until M4 measures them): how far all attachments together may move a
 * dimension the good way. Spread and recoil improve by 40% at most, raise and reload time keep 65%, range gains 25% at
 * most, noise keeps 40%. Bigger is better only for `recover` and `range`, so theirs are ceilings and the rest floors.
 * Costs are not capped. CONE_FLOOR adds one bound across spread, hip and precise.
 */
export const GUARDRAILS: Readonly<Record<Dimension, number>> = {
    hip: .6, precise: .6, sway: .6, spread: .6, bloom: .6, kick: .6, settle: .6, recover: 1.4,
    raise: .65, reload: .65, range: 1.25, noise: .4,
};
const guard = (d: Dimension, f: number) => d === 'recover' || d === 'range' ? Math.min(f, GUARDRAILS[d]) : Math.max(f, GUARDRAILS[d]);
/** The product, smallest factor first: the same factors give the same bits in any order. */
const product = (factors: number[]) => factors.sort((a, b) => a - b).reduce((total, f) => total * f, 1);

/**
 * Cone guardrail (M0 review 2026-10-24, decision 3): on top of the per-dimension clamps, the hip cone (spread x hip)
 * and the aimed cone each keep at least this share of the factory cone. The hip factor is hip fire's alone (decision 9:
 * the hip grip and the laser fade out as the aim rises), so the aimed cone is spread x precise. These are the settled
 * cones coneOf scatters over at rest; sway and bloom widen them and keep only their own clamps.
 */
export const CONE_FLOOR = .6;
/**
 * `floor / base`, one ulp up when rounding left `base` times it under `floor`, so a cone product (spread * hip, or
 * spread * precise) never lands below the floor by rounding. `base` is at least `floor`. At 0.6 the division alone
 * already holds; the step matters only if M4 moves the floor to 0.5 or below, where it can fall short.
 */
function lift(base: number, floor: number): number {
    const f = floor / base;
    return base * f >= floor ? f : f + f * Number.EPSILON;
}
/**
 * The cone guardrail, after the per-dimension clamps. Spread keeps its clamp, since it scales both cones alike; a cone
 * under CONE_FLOOR gives back through its own factor: the hip factor lifts the hip cone to the floor, the precise factor
 * the aimed cone. So a hip grip keeps its whole hip gain while a sight's gain shrinks to what the aimed floor leaves,
 * and neither touches the other's cone. A factor only rises, and never past 1, because spread is at least the floor
 * already: no gain turns into a cost. Reads only the combined factors, so install order changes no bit.
 */
function liftCones(f: Record<Dimension, number>): FactorSet {
    if (f.spread * f.hip < CONE_FLOOR) f.hip = lift(f.spread, CONE_FLOOR);
    if (f.spread * f.precise < CONE_FLOOR) f.precise = lift(f.spread, CONE_FLOOR);
    return f;
}

/**
 * Steps 3 and 4 over any list of modifiers: multiply each dimension's factors, clamp each product once, then hold the
 * two cones to CONE_FLOOR.
 */
export function combineFactors(list: readonly Partial<Record<Dimension, number>>[]): FactorSet {
    return liftCones(Object.fromEntries(DIMENSIONS.map(d => [d, guard(d, product(list.flatMap(m => m[d] ?? [])))])) as Record<Dimension, number>);
}

/** What a gun type plus a build does in combat. Every call returns fresh objects. */
export interface GunStats {
    /** The gun as it fires: the factory WeaponDef with spread, range and reload scaled, and the feed module's capacity. */
    weapon: GunDef['stats'];
    /**
     * Every handling field may change except the fire mode. `hip` is the cone multiple from the hip, the hip grip's
     * included; `precise` is the aimed cone's share of that, so the aimed cone leaves the hip grip out (decision 9).
     */
    handling: GunHandling;
    /** Handling while braced on a bipod (standing still), with its factors joining the build's; null without a bipod. */
    braced: GunHandling | null;
    /** Factor on the radius within which enemies hear a shot: SURVIVAL.gunNoiseRange times this (the Runtime, M2-11). */
    noise: number;
    /** A suppressor is installed: the shots sound muffled (M2-11). */
    suppressed: boolean;
    /** Factor on the precise-aim look-ahead for each sight mode; [1] without a sight that changes it (M0-07 sets the cap). */
    view: number[];
    /**
     * A laser switched on: while its beam rests on a target within `range` px, the hip cone multiple is `hip` instead of
     * the handling's (laserHandling). The laser's factor joins the build's hip factors under the one hip guardrail and
     * the hip cone floor. A bipod never changes hip, so it holds braced as well. The aimed cone stays the handling's: the
     * laser fades out as the aim rises (decision 9, M2-03).
     */
    laser: { hip: number; range: number } | null;
    /** A light switched on: interactables within `radius` px across `arc` radians are outlined. */
    light: { radius: number; arc: number } | null;
    /** Factor on how far enemies notice the shooter: the spot factors of the devices switched on multiply; 1 with none. */
    spot: number;
}

/**
 * The factory handling scaled by a factor set. The hip factor scales the hip cone alone: `precise` is the aimed cone's
 * share of the hip cone (coneOf raises from one to the other), so it is divided by the hip factor, which leaves the
 * aimed cone factory hip x factory precise x the precise factor (decision 9). Without a hip factor the division is by 1,
 * which changes no bit.
 */
const scaled = (h: GunHandling, f: FactorSet): GunHandling => ({
    mode: h.mode, hip: h.hip * f.hip, precise: h.precise * f.precise / f.hip, raise: h.raise * f.raise, sway: h.sway * f.sway,
    bloom: h.bloom * f.bloom, bloomMax: h.bloomMax * f.bloom, kick: h.kick * f.kick, kickMax: h.kickMax * f.kick,
    settle: h.settle * f.settle, recover: h.recover * f.recover,
});

/**
 * The handling of a shot while the laser rests on a target within its range (M2-03): the laser's hip cone from the hip
 * and the same aimed cone as `h` once the aim is raised, so the laser's help fades out as the aim rises (decision 9).
 * `h` is the handling in use, the build's or braced on a bipod (no bipod changes hip).
 */
export const laserHandling = (h: GunHandling, laser: { hip: number }): GunHandling =>
    ({ ...h, hip: laser.hip, precise: h.hip * h.precise / laser.hip });

/**
 * The effective stats of a valid build, with the tactical devices whose uids are in `on` switched on. Anything
 * validateBuild refuses throws, the knife and every other id that is no catalog gun included. Uids in `on` that name
 * no installed device count for nothing. Reads only its arguments and the catalog: no character, raid or save state.
 */
export function effectiveStats(build: Build, on: readonly string[] = []): GunStats {
    const valid = validateBuild(build);
    if (!valid.ok) throw new Error(`Invalid gun build (${valid.code}): ${build.gun}`);
    const gun = GUNS[build.gun as GunId], mods = build.parts.map(p => ATTACHMENTS[p.id].mods), factors = combineFactors(mods);
    const bipods = mods.flatMap(m => m.braced ?? []), braced = bipods.length ? combineFactors([...mods, ...bipods]) : null;
    // Step 2: one part per position leaves at most one feed module, one sight, one laser and one light on the gun.
    const feed = mods.find(m => m.magazine !== undefined), sight = mods.find(m => m.view);
    // Without a magazine (its factory one out, none other on: #28 M4-07) it holds nothing and cannot fire.
    const empty = !!build.magOut && !build.parts.some(p => p.slot === 'mag' && p.parent === null);
    const switched = new Set(on), devices = build.parts.filter(p => switched.has(p.uid) && ATTACHMENTS[p.id].cat === 'tactical')
        .map(p => ATTACHMENTS[p.id].mods);
    const laser = devices.find(m => m.laser)?.laser, light = devices.find(m => m.light)?.light;
    return {
        weapon: { ...gun.stats, spread: gun.stats.spread * factors.spread, range: gun.stats.range * factors.range,
            reload: gun.stats.reload * factors.reload, magazine: empty ? 0 : feed?.magazine ?? gun.stats.magazine },
        handling: scaled(gun.handling, factors),
        braced: braced && scaled(gun.handling, braced),
        noise: factors.noise,
        suppressed: mods.some(m => m.suppressor === true),
        view: [...(sight?.view ?? [1])],
        laser: laser ? { hip: gun.handling.hip * combineFactors([...mods, { hip: laser.hip }]).hip, range: laser.range } : null,
        light: light ? { ...light } : null,
        spot: product(devices.flatMap(m => m.spot ?? [])),
    };
}

/**
 * Runtime adapters, for M1-05 to put in place of WEAPONS[id] and handlingOf(id). A bare build gives today's values: the
 * old three equal WEAPONS and handlingOf, and mb4a1 its WEAPONS row (the #39 sample rifle's numbers, M2-01).
 */
export const effectiveWeapon = (build: Build): WeaponDef => effectiveStats(build).weapon;
export const effectiveHandling = (build: Build): GunHandling => effectiveStats(build).handling;
