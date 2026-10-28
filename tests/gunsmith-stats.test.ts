import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import { coneOf, handlingOf, recoil, unsteadyAim, type Handling } from '../src/shooting';
import { perkModifiers } from '../src/perks';
import { ATTACHMENTS, GUNS, type GunDef, type GunHandling, type GunId } from '../src/gunsmith/catalog';
import { checkInstall, removalCascade, type Build } from '../src/gunsmith/compat';
import { combineFactors, effectiveHandling, effectiveStats, effectiveWeapon, CONE_FLOOR, GUARDRAILS, type FactorSet, type GunStats } from '../src/gunsmith/stats';

const GUN_IDS = Object.keys(GUNS) as GunId[], PART_IDS = Object.keys(ATTACHMENTS);
const bare = (gun: string): Build => ({ gun, parts: [] });
/** Install `ids` in order where checkInstall places them; each part's uid is its id. */
function fit(build: Build, ...ids: string[]): Build {
    let b = build;
    for (const id of ids) {
        const r = checkInstall(b, id);
        assert.ok(r.ok, `${b.gun} + ${id}: ${r.ok ? '' : r.reason}`);
        b = { gun: b.gun, parts: [...b.parts, { uid: id, id, ...r.at }] };
    }
    return b;
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));

/** mulberry32, as in the compat test: the same walk on every run. */
const seeded = (seed: number) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/**
 * Legal builds from a seeded walk on every gun, made only through compat.ts: each step installs a random part among
 * those checkInstall accepts, or now and then removes one with its cascade. Each build switches a random half of its
 * devices on, sometimes with a stray uid.
 */
const WALK = (() => {
    const random = seeded(2804), out: { build: Build; on: string[] }[] = [];
    for (const gun of GUN_IDS) {
        const fits = PART_IDS.filter(id => ATTACHMENTS[id].guns?.includes(gun) ?? true);
        for (let walk = 0; walk < 8; walk++) {
            let build = bare(gun), serial = 0;
            for (let step = 0; step < 16; step++) {
                if (build.parts.length && random() < .2) {
                    const victim = build.parts[Math.floor(random() * build.parts.length)];
                    const gone = new Set([victim.uid, ...removalCascade(build, victim.uid)]);
                    build = { gun, parts: build.parts.filter(p => !gone.has(p.uid)) };
                } else {
                    const open = fits.flatMap(id => { const r = checkInstall(build, id); return r.ok ? [{ id, at: r.at }] : []; });
                    if (open.length) { const { id, at } = open[Math.floor(random() * open.length)]; build = { gun, parts: [...build.parts, { uid: `p${serial++}`, id, ...at }] }; }
                }
                const devices = build.parts.filter(p => ATTACHMENTS[p.id].cat === 'tactical').map(p => p.uid);
                out.push({ build, on: [...devices.filter(() => random() < .5), ...random() < .1 ? ['stray'] : []] });
            }
        }
    }
    return out;
})();

test('a bare gun is its factory self: all 20 guns, every field, in fresh objects', () => {
    for (const id of GUN_IDS) {
        const gun = GUNS[id], s = effectiveStats(bare(id));
        assert.deepEqual(s, { weapon: gun.stats, handling: gun.handling, braced: null, noise: 1, suppressed: false, view: [1], laser: null, light: null, spot: 1 }, id);
        assert.ok(s.weapon !== gun.stats && s.handling !== gun.handling, `${id}: copies, never the catalog's own objects`);
    }
});

test('the Runtime adapters give today\'s numbers for a bare build: WEAPONS and handlingOf, the M4A1 its catalog row', () => {
    for (const id of ['pistol', 'shotgun', 'carbine'] as const) {
        assert.deepEqual(effectiveWeapon(bare(id)), D.WEAPONS[id], id);
        assert.deepEqual(effectiveHandling(bare(id)), handlingOf(id), id);
    }
    // The M4A1 (the #39 sample rifle's numbers, pinned in gunsmith-catalog.test.ts) is the WEAPONS row M2-01 made of it.
    assert.deepEqual(effectiveWeapon(bare('mb4a1')), D.WEAPONS.mb4a1);
    assert.deepEqual(effectiveHandling(bare('mb4a1')), GUNS.mb4a1.handling);
    // They fit where the Runtime reads WEAPONS[id] and handlingOf(id) today.
    const weapon: D.WeaponDef = effectiveWeapon(bare('carbine')), grip: Handling = effectiveHandling(bare('carbine'));
    assert.equal(coneOf(unsteadyAim(), weapon, grip), coneOf(unsteadyAim(), D.WEAPONS.carbine, handlingOf('carbine')));
    // The knife and the retired sample id are not catalog guns (the knife stays on WEAPONS and handlingOf); illegal builds throw.
    for (const id of ['knife', 'm4a1', '__proto__']) assert.throws(() => effectiveStats(bare(id)), /^Error: Invalid gun build \(unknown\)/, id);
    assert.throws(() => effectiveWeapon({ gun: 'mb4a1', parts: [{ uid: 'a', id: 'M11', parent: null, slot: 'muzzle' }] }), /\(gun\)/);
});

test('factors on one dimension multiply, and each combined factor scales the factory value once', () => {
    const m4 = GUNS.mb4a1.handling;
    assert.deepEqual(effectiveStats(fit(bare('mb4a1'), 'O03')).handling, { ...m4, raise: m4.raise * .85, precise: m4.precise * .9 });
    const light = effectiveStats(fit(bare('mb4a1'), 'S01', 'P01')).handling;
    assert.equal(light.raise, m4.raise * (.85 * .9));
    assert.deepEqual([light.kick, light.kickMax], [m4.kick * .98, m4.kickMax * .98], 'kick scales the per-shot drift and its cap');
    const brake = effectiveStats(fit(bare('mb4a1'), 'M06'));
    assert.deepEqual([brake.handling.bloom, brake.handling.bloomMax, brake.noise], [m4.bloom * .8, m4.bloomMax * .8, 1.2]);
    // Below a bound nothing is clamped: the M1014 choke and barrel make 0.6396, just over the spread floor.
    assert.equal(effectiveStats(fit(bare('mb1014'), 'M10', 'B06')).weapon.spread, GUNS.mb1014.stats.spread * (.78 * .82));
    // Costs multiply too and are not capped: M870 reloads 1.08 x 1.3 slower with the rail handguard and the long feed.
    assert.equal(effectiveStats(fit(bare('mb870'), 'G06', 'H08')).weapon.reload, GUNS.mb870.stats.reload * (1.08 * 1.3));
    // The slowest raise of any legal build: M4A1 with every slow part, 2.36 times the factory time.
    const slow = effectiveStats(fit(bare('mb4a1'), 'O09', 'M07', 'B08', 'H02', 'S02', 'F07', 'T10')).handling.raise / m4.raise;
    assert.ok(near(slow, 1.3 * 1.12 * 1.1 * 1.08 * 1.1 * 1.15 * 1.08) && slow > 2.36 && slow < 2.37, `${slow}`);
});

test('each guardrail a real stack can reach clamps it exactly: recoil, precise, raise, sway, recover, braced, hip with a laser', () => {
    const m4 = GUNS.mb4a1.handling, svd = GUNS.svdb.handling;
    // M4A1 recoil parts: bloom .92 x .7 x .8 x .8 = 0.41 and kick .72 x .75 x .85 = 0.46 stop at 0.6, caps included.
    const recoilBuild = effectiveStats(fit(bare('mb4a1'), 'H02', 'F07', 'M06', 'S02')).handling;
    assert.deepEqual([recoilBuild.bloom, recoilBuild.bloomMax, recoilBuild.kick, recoilBuild.kickMax], [m4.bloom * .6, m4.bloomMax * .6, m4.kick * .6, m4.kickMax * .6]);
    // Precise .65 x .85 = 0.55 stops at 0.6; raise .85 x .85 x .9 x .9 = 0.59 stops at 0.65.
    assert.equal(effectiveStats(fit(bare('mb4a1'), 'O09', 'B08')).handling.precise, m4.precise * .6);
    assert.equal(effectiveStats(fit(bare('mb4a1'), 'H01', 'F04', 'O03', 'S01', 'P01')).handling.raise, m4.raise * .65);
    // AK-74 sway .85 x .82 x .85 x .9 = 0.53 stops at 0.6.
    assert.equal(effectiveStats(fit(bare('akb74'), 'A08', 'O05', 'H04', 'F03', 'S03', 'B07')).handling.sway, GUNS.akb74.handling.sway * .6);
    // Recover is a ceiling: SVD with the precision brake and the closed dot, 1.3 x 1.1 = 1.43, stops at 1.4.
    assert.equal(effectiveStats(fit(bare('svdb'), 'M09', 'O04')).handling.recover, svd.recover * 1.4);
    // The bipod's factors count only braced, and there they join the build's: precise .65 x .75, recover 1.3 x 1.35.
    const bipod = effectiveStats(fit(bare('svdb'), 'M09', 'O09', 'F08'));
    assert.deepEqual([bipod.handling.precise, bipod.handling.recover], [svd.precise * .65, svd.recover * 1.3]);
    assert.deepEqual(bipod.braced, { ...bipod.handling, precise: svd.precise * .6, recover: svd.recover * 1.4 });
    // Hip: the hip grip (.8) with the close laser on (.7) makes 0.56 within the laser's range, held at 0.6.
    const lit = effectiveStats(fit(bare('mb4a1'), 'H01', 'F06', 'T01'), ['T01']);
    assert.deepEqual([lit.handling.hip, lit.laser], [m4.hip * .8, { hip: m4.hip * .6, range: 240 }]);
    // The light laser (.82) stays inside the bound: 0.656.
    assert.deepEqual(effectiveStats(fit(bare('mb4a1'), 'H01', 'F06', 'T02'), ['T02']).laser, { hip: m4.hip * (.8 * .82), range: 170 });
});

/** The settled hip and aimed cones (coneOf at rest, aim down and fully raised) as shares of the factory gun's. */
const coneShares = (s: Pick<GunStats, 'weapon' | 'handling'>, gun: GunDef) => [0, 1].map(raise => {
    const calm = { raise, sway: 0, bloom: 0, drift: 0, settle: 0 };
    return coneOf(calm, s.weapon, s.handling) / coneOf(calm, gun.stats, gun.handling);
});

test('the cone floor (M0 review): hip and aimed cones keep 0.6 of factory, given back by the factor each adds last', () => {
    // Lifting hip and precise never takes them past 1 only because each of the three keeps the floor on its own.
    for (const d of ['spread', 'hip', 'precise'] as const) assert.ok(GUARDRAILS[d] >= CONE_FLOOR, d);
    const m4 = GUNS.mb4a1.handling;
    // The hip grip helps only from the hip (decision 9, M2-03): the aimed cone is spread x precise, so `precise` in the
    // handling is the aimed cone's share of the hip cone, divided by the grip's .8.
    // M4A1, hip grip (.8), stable long scope and precision barrel (precise .65 x .85 = .5525, clamped to .6): the hip
    // cone keeps the grip's whole .8, the aimed cone is the clamped .6 without it.
    const m4Stack = effectiveStats(fit(bare('mb4a1'), 'H01', 'F06', 'O09', 'B08'));
    assert.deepEqual([m4Stack.handling.hip, m4Stack.handling.precise], [m4.hip * .8, m4.precise * .6 / .8]);
    assert.ok(near(coneShares(m4Stack, GUNS.mb4a1)[0], .8) && near(coneShares(m4Stack, GUNS.mb4a1)[1], .6));
    // RPK with the hip grip, its bipod and the stable long scope: aimed .65 (the grip no longer counts), braced the
    // bipod's .75 makes .4875, clamped to .6. Before the fade both were .8 x ... lifted to .6, and the bipod added nothing.
    const rpk = effectiveStats(fit(bare('rpkb'), 'H10', 'F06', 'F08', 'A08', 'O09')), rp = GUNS.rpkb.handling;
    assert.deepEqual([rpk.handling.hip, rpk.handling.precise, rpk.braced!.precise], [rp.hip * .8, rp.precise * .65 / .8, rp.precise * .6 / .8]);
    assert.ok(near(coneShares(rpk, GUNS.rpkb)[1], .65) && near(coneShares({ weapon: rpk.weapon, handling: rpk.braced! }, GUNS.rpkb)[1], .6));
    // Double barrel with the choke (.72) and a mid scope (.75): .54 aimed. Spread keeps its .72; precise gives back.
    const db = effectiveStats(fit(bare('shotgun'), 'M11', 'A05', 'O07')), sg = GUNS.shotgun;
    assert.deepEqual([db.weapon.spread, db.handling.hip, db.handling.precise], [sg.stats.spread * .72, sg.handling.hip, sg.handling.precise * (.6 / .72)]);
    assert.ok(near(coneShares(db, sg)[0], .72) && near(coneShares(db, sg)[1], .6));
    // The hip cone: M1014 with choke and barrel (spread .78 x .82 = .6396) and the hip grip (.8) made .51 from the hip.
    // Hip gives back to .6 / .6396. The aimed cone leaves the grip out: .6396 bare, and with a mid scope (.75) .48,
    // lifted to the floor through precise.
    const choke = .78 * .82, m1014 = GUNS.mb1014, hip = .6 / choke;
    for (const [sight, aimed] of [[[], choke], [['O07'], .6]] as const) {
        const s = effectiveStats(fit(bare('mb1014'), 'M10', 'B06', 'H09', 'F06', ...sight));
        assert.deepEqual([s.weapon.spread, s.handling.hip, s.handling.precise], [m1014.stats.spread * choke, m1014.handling.hip * hip,
            m1014.handling.precise * (sight.length ? hip : 1) / hip], sight.join());
        const [hipShare, aimedShare] = coneShares(s, m1014);
        assert.ok(near(hipShare, .6) && near(aimedShare, aimed), `${sight.join()}: ${hipShare} ${aimedShare}`);
    }
    // A laser's in-range hip keeps the hip cone floor too: M870 with the choke (.78) and the close laser (.7) on gives
    // .546 within range, lifted to .6 / .78, with or without the hip grip (whose own hip cone, .624, is above it).
    const m870 = GUNS.mb870.handling;
    for (const grip of [[], ['F06']]) {
        const s = effectiveStats(fit(bare('mb870'), 'M10', 'H08', ...grip, 'T01'), ['T01']);
        assert.deepEqual([s.handling.hip, s.laser], [m870.hip * (grip.length ? .8 : 1), { hip: m870.hip * (.6 / .78), range: 240 }], grip.join());
    }
});

test('the cone floor holds for any factors to the last bit, moves only hip and precise, and only as far as it must', () => {
    type Cone = 'spread' | 'hip' | 'precise';
    const random = seeded(606), pick = (lo: number, hi: number) => lo + random() * (hi - lo);
    const maybe = (d: Cone): Partial<Record<Cone, number>> => random() < .6 ? { [d]: pick(.45, 1.3) } : {};
    const lifted = { hip: 0, precise: 0 };
    for (let i = 0; i < 20000; i++) {
        const list: Partial<Record<Cone | 'raise', number>>[] = Array.from({ length: 1 + Math.floor(random() * 6) },
            () => ({ ...maybe('spread'), ...maybe('hip'), ...maybe('precise'), raise: pick(.6, 1.4) }));
        const f = combineFactors(list), at = JSON.stringify(list);
        // Each dimension alone: no cone can fall under the floor with the other two at 1, so these are the plain clamps.
        const own = (d: 'spread' | 'hip' | 'precise' | 'raise') => combineFactors(list.map(m => ({ [d]: m[d] })))[d];
        assert.equal(f.spread, own('spread'), at);
        assert.equal(f.raise, own('raise'), at);
        // The hip cone is spread x hip, the aimed cone spread x precise (the hip factor fades out as the aim rises).
        assert.ok(f.spread * f.hip >= CONE_FLOOR && f.spread * f.precise >= CONE_FLOOR, at);
        // Hip moves only when the hip cone was under the floor, precise only when the aimed cone was, and each lands on
        // the floor (within rounding), never past 1 unless it was a cost already.
        assert.equal(f.hip !== own('hip'), own('spread') * own('hip') < CONE_FLOOR, at);
        assert.equal(f.precise !== own('precise'), own('spread') * own('precise') < CONE_FLOOR, at);
        if (f.hip !== own('hip')) assert.ok(f.hip > own('hip') && f.hip <= 1 && near(f.spread * f.hip, CONE_FLOOR), at);
        if (f.precise !== own('precise')) assert.ok(f.precise > own('precise') && f.precise <= 1 && near(f.spread * f.precise, CONE_FLOOR), at);
        lifted.hip += +(f.hip !== own('hip')); lifted.precise += +(f.precise !== own('precise'));
        // The same factors in another order: the same bits.
        assert.deepEqual(combineFactors([...list].reverse()), f, at);
    }
    assert.ok(lifted.hip > 1000 && lifted.precise > 1000, JSON.stringify(lifted));
});

test('the bounds no real stack reaches yet hold for any stack, and costs are never clamped', () => {
    // One part per position keeps these out of reach today: range only on barrels (best 1.15), noise only on muzzles
    // (best 0.5), reload only on feed modules and one handguard (best 0.75), spread only on shotgun chokes and barrels
    // (best 0.64), settle only on two stocks and a grip, each on another gun (best 0.85).
    const f = combineFactors([{ spread: .7 }, { spread: .8 }, { settle: .7, reload: .8 }, { settle: .8, reload: .8 }, { range: 1.2 }, { range: 1.15 },
        { noise: .5 }, { noise: .55 }]);
    assert.deepEqual(f, { hip: 1, precise: 1, raise: 1, sway: 1, bloom: 1, kick: 1, settle: .6, recover: 1, spread: .6, range: 1.25, reload: .65, noise: .4 });
    for (const [d, bound] of Object.entries(GUARDRAILS) as [keyof FactorSet, number][]) {
        // Two parts that each stay inside the bound and pass it together.
        const each = Math.sqrt(bound) * (bound > 1 ? 1.01 : .99), cost = bound > 1 ? .5 : 2;
        assert.equal(combineFactors([{ [d]: each }, { [d]: each }])[d], bound, d);
        assert.equal(combineFactors([{ [d]: cost }, { [d]: cost }])[d], cost * cost, `${d}: a cost`);
    }
    assert.deepEqual(Object.keys(f).sort(), Object.keys(GUARDRAILS).sort());
});

test('install order and part order never change a bit', () => {
    for (const { build, on } of WALK) {
        const s = effectiveStats(build, on);
        assert.deepEqual(effectiveStats({ gun: build.gun, parts: [...build.parts].reverse() }, [...on].reverse()), s);
        assert.deepEqual(effectiveStats({ gun: build.gun, parts: [...build.parts].sort((a, b) => a.id.localeCompare(b.id)) }, on), s);
    }
    // The same parts put on through checkInstall in two orders: the same numbers to the last bit.
    const ids = ['H02', 'F07', 'M06', 'S02', 'O09', 'B08', 'P02', 'G10', 'T01', 'T05'];
    const forward = fit(bare('mb4a1'), ...ids), backward = fit(bare('mb4a1'), 'G10', 'P02', 'B08', 'O09', 'S02', 'M06', 'H02', 'T05', 'T01', 'F07');
    assert.deepEqual(effectiveStats(backward, ['T05', 'T01']), effectiveStats(forward, ['T01', 'T05']));
});

test('devices count only while switched on; their bulk counts always', () => {
    const m4 = GUNS.mb4a1.handling, b = fit(bare('mb4a1'), 'H02', 'T03', 'T05'), off = effectiveStats(b);
    assert.deepEqual([off.laser, off.light, off.spot], [null, null, 1]);
    // The far laser slows the raise on or off: 1.06, with the long handguard's 1.08.
    assert.equal(off.handling.raise, m4.raise * (1.06 * 1.08));
    const laser = effectiveStats(b, ['T03']), light = effectiveStats(b, ['T05']), both = effectiveStats(b, ['T05', 'T03']);
    assert.deepEqual([laser.laser, laser.light, laser.spot], [{ hip: m4.hip * .72, range: 420 }, null, 1.2]);
    assert.deepEqual([light.laser, light.light, light.spot], [null, { radius: 170, arc: 1.6 }, 1.2]);
    assert.deepEqual([both.laser, both.light, both.spot], [laser.laser, light.light, 1.2 * 1.2]);
    for (const s of [laser, light, both]) assert.deepEqual({ ...s, laser: null, light: null, spot: 1 }, off, 'switches change nothing else');
    // Uids that name no installed device count for nothing: the handguard, a device not on this gun, a typo.
    assert.deepEqual(effectiveStats(b, ['H02', 'T09', 'nobody']), off);
    // A combiner is one device: one switch turns on both its effects.
    const aug = effectiveStats(fit(bare('augb'), 'T09'), ['T09']);
    assert.deepEqual([aug.laser, aug.light, aug.spot], [{ hip: GUNS.augb.handling.hip * .78, range: 300 }, { radius: 200, arc: 1.2 }, 1.2]);
    // No bipod changes hip, so the laser's one in-range hip holds braced too.
    for (const a of Object.values(ATTACHMENTS)) assert.equal(a.mods.braced?.hip, undefined, a.id);
});

test('replacement: a feed module\'s capacity and the sight\'s modes take the factory ones\' place', () => {
    const feeds = Object.values(ATTACHMENTS).filter(a => a.mods.magazine !== undefined);
    assert.equal(feeds.length, 12);
    for (const a of feeds) for (const gun of a.guns!) {
        const factory = GUNS[gun].stats;
        assert.deepEqual(effectiveWeapon(fit(bare(gun), a.id)), { ...factory, magazine: a.mods.magazine, reload: factory.reload * a.mods.reload! }, `${a.id} on ${gun}`);
    }
    assert.deepEqual([fit(bare('mb4a1'), 'G10'), fit(bare('akb103'), 'G09'), fit(bare('gb17'), 'G01')].map(b => effectiveWeapon(b).magazine), [20, 60, 24]);
    // The sight: its modes, or the factory look-ahead when it has none. A fresh array each time.
    assert.deepEqual(['O03', 'O06', 'O10', 'O11'].map(id => effectiveStats(fit(bare('mb4a1'), id)).view), [[1], [1.25], [1.5, 2], [1.5, 2]]); // M0 review decision 7 (#28 M3-11)
    assert.deepEqual(effectiveStats(fit(bare('carbine'), 'A07', 'O09')).view, [2]);
    effectiveStats(fit(bare('mb4a1'), 'O11')).view[0] = 9;
    assert.deepEqual(ATTACHMENTS.O11.mods.view, [1.5, 2]);
});

test('noise: suppressors cut it, brakes raise it, and nothing goes under 40% of factory', () => {
    const noise = (gun: string, id: string) => effectiveStats(fit(bare(gun), id)).noise;
    assert.deepEqual([noise('mb4a1', 'M07'), noise('mb4a1', 'M05'), noise('mb4a1', 'M06'), noise('svdb', 'M08'), noise('pb90', 'M12')], [.55, .9, 1.2, .5, .5]);
    assert.equal(noise('gb17', 'B01'), 1, 'a barrel leaves the noise alone');
    assert.equal(combineFactors([{ noise: .5 }, { noise: .5 }]).noise, .4);
    for (const { build, on } of WALK) assert.ok(effectiveStats(build, on).noise >= GUARDRAILS.noise);
});

/** WeaponDef fields no attachment changes: normal attachments never add damage or fire rate. */
const UNCHANGED = ['id', 'name', 'ammo', 'damage', 'cooldown', 'pellets', 'crit'] as const;
/** [dimension, effective, factory] for every value a guarded factor scales. */
const scaledValues = (s: GunStats, h: GunHandling, gun: GunDef): [keyof FactorSet, number, number][] => [
    ['hip', h.hip, gun.handling.hip], ['precise', h.precise, gun.handling.precise], ['raise', h.raise, gun.handling.raise], ['sway', h.sway, gun.handling.sway],
    ['bloom', h.bloom, gun.handling.bloom], ['bloom', h.bloomMax, gun.handling.bloomMax], ['kick', h.kick, gun.handling.kick], ['kick', h.kickMax, gun.handling.kickMax],
    ['settle', h.settle, gun.handling.settle], ['recover', h.recover, gun.handling.recover],
    ['spread', s.weapon.spread, gun.stats.spread], ['range', s.weapon.range, gun.stats.range], ['reload', s.weapon.reload, gun.stats.reload], ['noise', s.noise, 1],
];

test('seeded random legal builds: every number finite and inside its bounds, the rest as the factory left it', () => {
    assert.equal(WALK.length, 2560);
    assert.ok(WALK.some(w => w.build.parts.length >= 10), 'the walk reaches nearly full guns');
    const seen = { laser: 0, light: 0, braced: 0, both: 0 };
    for (const { build, on } of WALK) {
        const s = effectiveStats(build, on), gun = GUNS[build.gun as GunId], parts = build.parts.map(p => ATTACHMENTS[p.id]);
        // Step 2 rests on this: at most one feed module and one sight.
        assert.ok(parts.filter(a => a.cat === 'mag').length <= 1 && parts.filter(a => a.cat === 'optic').length <= 1);
        // What attachments never change, and the capacity only a feed module replaces.
        for (const key of UNCHANGED) assert.equal(s.weapon[key], gun.stats[key], key);
        assert.equal(s.handling.mode, gun.handling.mode);
        assert.equal(s.weapon.magazine, parts.find(a => a.cat === 'mag')?.mods.magazine ?? gun.stats.magazine);
        // Finite and positive throughout.
        const numbers = [...Object.values(s.weapon), ...Object.values(s.handling), ...Object.values(s.braced ?? {}), s.noise, s.spot, ...s.view,
            ...Object.values(s.laser ?? {}), ...Object.values(s.light ?? {})].filter(v => typeof v === 'number');
        assert.ok(numbers.every(n => Number.isFinite(n) && n > 0), JSON.stringify(s));
        // Inside the guardrails, braced too; no cost past 2.5 times factory (the worst, the slow M4A1 raise, is 2.36).
        for (const h of [s.handling, ...s.braced ? [s.braced] : []]) for (const [d, value, base] of scaledValues(s, h, gun)) {
            const bound = GUARDRAILS[d], ceiling = d === 'recover' || d === 'range';
            assert.ok(ceiling ? value <= base * bound && value >= base * .4 : value >= base * bound && value <= base * 2.5, `${build.gun} ${d} ${value / base}`);
        }
        // Both settled cones keep the floor, braced and with the laser's in-range hip too (that one as a hip cone).
        const floor = CONE_FLOOR * (1 - 1e-12);
        for (const h of [s.handling, ...s.braced ? [s.braced] : []]) assert.ok(coneShares({ weapon: s.weapon, handling: h }, gun).every(c => c >= floor), build.gun);
        if (s.laser) assert.ok(coneShares({ weapon: s.weapon, handling: { ...s.handling, hip: s.laser.hip } }, gun)[0] >= floor, build.gun);
        // Devices: only those switched on, a laser held to the hip floor and never worse than none.
        const lit = build.parts.filter(p => on.includes(p.uid) && ATTACHMENTS[p.id].cat === 'tactical').map(p => ATTACHMENTS[p.id].mods);
        assert.equal(s.laser === null, !lit.some(m => m.laser));
        assert.equal(s.light === null, !lit.some(m => m.light));
        assert.ok(near(s.spot, lit.reduce((x, m) => x * m.spot!, 1)) && (s.spot === 1) === (lit.length === 0));
        if (s.laser) assert.ok(s.laser.hip >= gun.handling.hip * GUARDRAILS.hip && s.laser.hip <= s.handling.hip);
        assert.equal(s.braced !== null, parts.some(a => a.mods.braced));
        assert.ok(s.view.length >= 1 && s.view.length <= 2 && s.view.every(v => v >= 1 && v <= 2));
        seen.laser += +!!s.laser; seen.light += +!!s.light; seen.braced += +!!s.braced; seen.both += +!!(s.laser && s.light);
    }
    assert.ok(Object.values(seen).every(n => n > 20), JSON.stringify(seen));
});

test('character state stays out: no body or perk input, and the Runtime\'s own factors multiply once on top', () => {
    // The module imports the catalog, compat and a domain type, nothing that reads a body, perks, a raid or a save.
    const imports = [...readFileSync('src/gunsmith/stats.ts', 'utf8').matchAll(/^import (type )?.* from '(.+)';$/gm)].map(m => `${m[1] ?? ''}${m[2]}`);
    assert.deepEqual(imports, ['type ../domain', './catalog', './compat']);
    // A build at its recoil guardrail (0.6), with the strongest technique perks: recoil 0.8 x 0.85, reload 0.85 x 0.8.
    const stats = effectiveStats(fit(bare('mb4a1'), 'H02', 'F07', 'M06', 'S02', 'G10')), perks = perkModifiers(['technique-15-b', 'technique-20-b', 'technique-25-b', 'technique-30-b']);
    assert.deepEqual([perks.recoil, perks.reload], [.8 * .85, .85 * .8]);
    // One shot from rest as the Runtime fires it: recoil(aim, grip, perk scale). The cone it adds carries the
    // attachments' 0.6 and the perks' 0.68 once each.
    const aim = { ...unsteadyAim(), sway: 0, bloom: 0 }, before = coneOf(aim, stats.weapon, stats.handling);
    recoil(aim, stats.handling, perks.recoil);
    assert.ok(near(coneOf(aim, stats.weapon, stats.handling) - before, GUNS.mb4a1.handling.bloom * .6 * .68));
    // reloadTime multiplies the perk factor once: 2.1 s x 0.8 (quick-change magazine) x 0.68, under the 0.65 floor of
    // the attachments alone, because character factors keep their own limits.
    assert.ok(near(stats.weapon.reload * perks.reload, 2.1 * .8 * .68));
    // The RPG body multiplier (pain, technique, mental) scales the whole cone once, in coneOf.
    assert.ok(near(coneOf(aim, stats.weapon, stats.handling, 1.15), 1.15 * coneOf(aim, stats.weapon, stats.handling)));
    // Same build, same switches: the same numbers, whatever character fires it.
    assert.deepEqual(effectiveStats(fit(bare('mb4a1'), 'H02', 'F07', 'M06', 'S02', 'G10')), stats);
});
