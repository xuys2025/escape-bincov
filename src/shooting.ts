/**
 * Weapon handling for the raid Runtime (PR #39): how stance, motion, the trigger and recoil decide where a shot goes.
 * Pure rules on plain numbers: no clock, RNG, DOM or save access. The Runtime owns one AimState per raid and never
 * saves it (maintainer, 2026-10-22): a Runtime built from a checkpoint starts from `unsteadyAim()`, so a refresh or a
 * reload can never leave the gun steadier than playing on would have.
 *
 * Every rule is a closed form of elapsed time with the input held constant (linear raise, exponential sway approach,
 * a settle delay, exponential recovery), so splitting an interval into more substeps changes nothing but rounding.
 */
import type { WeaponDef } from './domain';

export type FireMode = 'semi' | 'auto';

/** One weapon's handling. Angles in radians (full cone angles), times in seconds, rates per second. */
export interface Handling {
    mode: FireMode;
    /** Cone at rest from the hip, as a multiple of the weapon's base `spread`. */
    hip: number;
    /** Cone multiple (of the hip cone) once a precise aim is fully raised, and the seconds it takes to raise. */
    precise: number; raise: number;
    /** Extra cone multiple at full sway. */
    sway: number;
    /** Cone added per shot and its cap. */
    bloom: number; bloomMax: number;
    /** Muzzle drift per shot toward the shooter's right (clockwise on the map) and its cap. */
    kick: number; kickMax: number;
    /** Seconds after the last shot before bloom and drift recover, then the share they lose per second (exponential). */
    settle: number; recover: number;
}
/** Body sway rules: targets while walking and sprinting, approach rates, turn and draw impulses. */
export interface SwayRules { walk: number; sprint: number; up: number; down: number; turn: number; draw: number }

export interface AimState {
    /** Precise aim raised, 0 (hip) to 1. */
    raise: number;
    /** Body sway, 0 (settled) to 1. */
    sway: number;
    /** Bloom and drift as shares of the held weapon's caps, 0 to 1, so they carry over a weapon switch. */
    bloom: number; drift: number;
    /** Seconds left before bloom and drift start to recover. */
    settle: number;
}
export const unsteadyAim = (): AimState => ({ raise: 0, sway: 1, bloom: 1, drift: 0, settle: 0 });

/**
 * What the shooter did over an interval: distance walked as a share of walk speed, sprint, the precise button, and the
 * touch aim stick (`hold`: inside the fire ring 'aim', past it 'fire').
 */
export interface Motion { pace: number; sprint: boolean; precise: boolean; hold?: 'aim' | 'fire' }
/** Below this pace the shooter counts as standing still (a share of walk speed). */
const STILL = .05;

/**
 * The handling values (maintainer, 2026-10-22): the steady set of the two built for the playtest, so a stock gun rewards
 * stopping and aiming, pays for moving, turning and long bursts, and leaves gunsmithing (#28) room to improve it. The
 * other set (brisk) is recorded in docs/SHOOTING-SYSTEM-REWORK.md.
 */
export const SWAY: SwayRules = { walk: .7, sprint: 1, up: 10, down: 3, turn: .55, draw: .9 };
const semi = (h: Omit<Handling, 'mode'>): Handling => ({ mode: 'semi', ...h });
const NONE = semi({ hip: 1, precise: 1, raise: .2, sway: 0, bloom: 0, bloomMax: 0, kick: 0, kickMax: 0, settle: 0, recover: 1 });
/**
 * The knife's row, and the old three guns as #39 tuned them. A gun in hand reads its handling from the gunsmith catalog
 * (#28 M1-05, its effective handling), which copies these three exactly (tests/gunsmith-catalog.test.ts); the #39 sample
 * rifle `m4a1` retired in M2-01, when the real M4A1 (`mb4a1`) took its handling over unchanged.
 */
const HANDLING: Record<string, Handling> = {
    knife: NONE,
    pistol: semi({ hip: 1.8, precise: .22, raise: .3, sway: 1.8, bloom: .016, bloomMax: .07, kick: .009, kickMax: .05, settle: .15, recover: 5 }),
    carbine: semi({ hip: 2.2, precise: .2, raise: .4, sway: 2, bloom: .014, bloomMax: .06, kick: .012, kickMax: .06, settle: .18, recover: 4.5 }),
    shotgun: semi({ hip: 1, precise: .5, raise: .25, sway: 1.2, bloom: .04, bloomMax: .08, kick: .03, kickMax: .06, settle: .25, recover: 4 }),
};
export const handlingOf = (weaponId: string): Handling => HANDLING[weaponId] ?? NONE;

/**
 * What `motion` does to a precise aim: the precise button raises it unless sprinting. On touch, standing with the aim
 * stick inside the fire ring raises it and firing past the ring keeps it; walking lowers it (maintainer, 2026-10-22).
 */
function stance(motion: Motion): 'up' | 'keep' | 'down' {
    const standing = motion.pace < STILL && !motion.sprint;
    return !motion.sprint && (motion.precise || standing && motion.hold === 'aim') ? 'up' : standing && motion.hold === 'fire' ? 'keep' : 'down';
}
/**
 * The precise aim is held over `motion` (raised or kept, as advanceAim moves it): the effective precise aim the breath
 * charge (technique-15-a) needs. Read from the input, never from a raise left over from earlier.
 */
export const preciseHeld = (motion: Motion) => stance(motion) !== 'down';

/** Advance an aim over `seconds` of unchanged motion. Mutates and returns `aim`. */
export function advanceAim(aim: AimState, h: Handling, rules: SwayRules, seconds: number, motion: Motion): AimState {
    if (seconds <= 0) return aim;
    // A precise aim rises over `raise` seconds and drops twice as fast.
    const lift = stance(motion);
    aim.raise = lift === 'up' ? Math.min(1, aim.raise + seconds / h.raise) : lift === 'keep' ? aim.raise : Math.max(0, aim.raise - 2 * seconds / h.raise);
    const target = Math.min(1, Math.min(1, motion.pace) * rules.walk + (motion.sprint ? rules.sprint : 0));
    aim.sway = target + (aim.sway - target) * Math.exp(-(aim.sway < target ? rules.up : rules.down) * seconds);
    const quiet = Math.max(0, seconds - aim.settle);
    aim.settle = Math.max(0, aim.settle - seconds);
    if (quiet > 0) { const k = Math.exp(-h.recover * quiet); aim.bloom *= k; aim.drift *= k; }
    return aim;
}
/** A sharp turn shakes the aim in proportion to the angle swept. */
export function turnAim(aim: AimState, rules: SwayRules, radians: number): void { aim.sway = Math.min(1, aim.sway + rules.turn * Math.abs(radians)); }
/** Drawing another weapon: the aim starts from the hip and the body sways at least `draw`. Bloom and drift carry over. */
export function drawAim(aim: AimState, rules: SwayRules): void { aim.raise = 0; aim.sway = Math.max(aim.sway, rules.draw); }
/** Full cone a shot fired now scatters over. `body` is the character's own multiplier (rpgMultipliers().recoil). */
export const coneOf = (aim: AimState, w: WeaponDef, h: Handling, body = 1) =>
    (w.spread * h.hip * (1 + (h.precise - 1) * aim.raise) * (1 + h.sway * aim.sway) + h.bloomMax * aim.bloom) * body;
/** Where the next shot is centred relative to the aim: radians toward the shooter's right. */
export const driftOf = (aim: AimState, h: Handling, body = 1) => h.kickMax * aim.drift * body;
/**
 * Recoil of one shot: more bloom and drift, and recovery waits for `settle` again. `scale` multiplies only this shot's
 * bloom and drift increments (the recoil-control perks technique-15-b and 25-b); the caps, the settle delay, recovery,
 * the inherent cone and the precise multiplier stay. At 1 the result is bit-identical to having no scale.
 */
export function recoil(aim: AimState, h: Handling, scale = 1): void {
    if (h.bloomMax > 0) aim.bloom = Math.min(1, aim.bloom + h.bloom / h.bloomMax * scale);
    if (h.kickMax > 0) aim.drift = Math.min(1, aim.drift + h.kick / h.kickMax * scale);
    aim.settle = h.settle;
}
