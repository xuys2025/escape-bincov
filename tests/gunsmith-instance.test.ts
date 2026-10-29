import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { identity } from '../src/profile-codec';
import { ATTACHMENTS, GUNS, type GunId } from '../src/gunsmith/catalog';
import { checkInstall, MAX_DEPTH, MAX_PARTS, validateBuild, type Build } from '../src/gunsmith/compat';
import { buildOf, deviceEffects, factoryState, gunSale, gunSize, gunUids, gunWeight, isGunId, nodesOf, repeatedUids, validateGun,
    type GunCheck, type GunFault, type GunInstance, type GunState, type PartNode } from '../src/gunsmith/instance';

const GUN_IDS = Object.keys(GUNS) as GunId[], PART_IDS = Object.keys(ATTACHMENTS);
/** A compat.ts build as an instance tree: every part a node under its parent, in build order. */
function treeOf(build: Build): PartNode[] {
    const nodes = new Map(build.parts.map(p => [p.uid, { uid: p.uid, id: p.id, slot: p.slot, relief: false, children: [] as PartNode[] }]));
    const top: PartNode[] = [];
    for (const p of build.parts) (p.parent === null ? top : nodes.get(p.parent)!.children).push(nodes.get(p.uid)!);
    return top;
}
/** Install `ids` in order where checkInstall places them; each must be accepted. */
function fit(build: Build, ...ids: string[]): Build {
    let b = build;
    for (const id of ids) {
        const r = checkInstall(b, id);
        assert.ok(r.ok, `${b.gun} + ${id}: ${r.ok ? '' : r.reason}`);
        b = { gun: b.gun, parts: [...b.parts, { uid: `${id}-${b.parts.length}`, id, ...r.at }] };
    }
    return b;
}
const gun = (id: GunId, ...ids: string[]): GunInstance =>
    ({ uid: `gun-${id}`, id, relief: false, parts: treeOf(fit({ gun: id, parts: [] }, ...ids)), devices: { laser: false, light: false } });
const stateOf = (g: GunInstance): GunState => ({ parts: g.parts, devices: g.devices });
const check = (g: GunInstance) => validateGun(g.id, g.uid, stateOf(g));
const node = (uid: string, id: string, slot: string, children: unknown[] = []) => ({ uid, id, slot, relief: false, children });
function refused(r: GunCheck, code: GunFault, why = '') {
    assert.equal(r.ok, false, `${why} should be refused`);
    if (!r.ok) assert.equal(r.code, code, `${why}: ${r.reason}`);
}
/** Deterministic xorshift for the seeded walks. */
function rng(seed: number) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

test('a factory gun is a valid instance of every catalog gun, with the catalog size, weight and price', () => {
    for (const id of GUN_IDS) {
        const g: GunInstance = { uid: 'bc-1', id, relief: false, ...factoryState() }, def = GUNS[id];
        assert.deepEqual(check(g), { ok: true }, id);
        assert.deepEqual(gunSize(g), { w: def.w, h: def.h }, id);
        assert.deepEqual(gunSize(g, true), { w: def.h, h: def.w }, id);
        assert.equal(gunWeight(g), def.weight, id);
        assert.deepEqual(gunSale(g), { value: def.sell, restricted: false }, id);
        assert.deepEqual(gunSale({ ...g, relief: true }), { value: 0, restricted: true }, `${id} relief`);
        assert.deepEqual(gunUids(g), ['bc-1']);
    }
    // The old three are today's items: the same cells (rotation as itemSize), weight and sell price.
    for (const id of ['pistol', 'shotgun', 'carbine'] as const) {
        const g = { id, parts: [], relief: false }, item = D.ITEMS[id];
        for (const rotated of [false, true]) assert.deepEqual(gunSize(g, rotated), D.itemSize({ id, rotated }), id);
        assert.equal(gunWeight(g), item.weight); assert.equal(gunSale(g).value, item.sell);
    }
    assert.ok(isGunId('gb17') && isGunId('pistol'));
    for (const id of ['knife', 'm4a1', 'ammo9', 'toString', '__proto__', ['pistol'], 1, null]) assert.equal(isGunId(id), false, String(id));
    assert.notEqual(factoryState(), factoryState(), 'each factory state is a fresh object');
});

test('weight and sale count the gun and each installed part once, nested parts included; the footprint grows with suppressors, drums and long magazines', () => {
    // Worked by hand from the catalog rows: M07 adds .35 kg and sells for 306, G10 is .05 kg lighter and sells for 90.
    const light = gun('mb4a1', 'M07', 'G10');
    assert.deepEqual(check(light), { ok: true });
    assert.equal(gunWeight(light), 3.2); assert.deepEqual(gunSale(light), { value: 1476, restricted: false });
    // Two rows for its box magazine (#28 M3-12), one column more for the suppressor.
    assert.deepEqual(gunSize(light), { w: 5, h: 2 });
    // Two levels: H02 holds F01 and T01. 2.9 + .3 + .08 + .1 kg; 1080 + 171 + 54 + 135.
    const nested = gun('mb4a1', 'H02', 'F01', 'T01');
    assert.equal(nested.parts.length, 1); assert.equal(nested.parts[0].children.length, 2);
    assert.equal(gunWeight(nested), 3.38); assert.deepEqual(gunSale(nested), { value: 1440, restricted: false });
    // The general rule over a full build: base plus each node once, whatever the depth.
    const full = gun('mb4a1', 'H02', 'F01', 'T01', 'T05', 'O03', 'M07', 'S02', 'P02', 'G10', 'B08');
    const all = nodesOf(full.parts);
    assert.equal(all.length, 10); assert.equal(new Set(all).size, 10);
    assert.deepEqual(gunUids(full), ['gun-mb4a1', ...all.map(n => n.uid)]);
    assert.equal(gunWeight(full), Math.round((2.9 + all.reduce((kg, n) => kg + ATTACHMENTS[n.id].mods.weight, 0)) * 1000) / 1000);
    assert.equal(gunSale(full).value, 1080 + all.reduce((sum, n) => sum + ATTACHMENTS[n.id].sell, 0));
    assert.deepEqual(gunSize(full), { w: 5, h: 2 });
    // Parts lighter than the factory part they replace make the gun lighter.
    assert.ok(gunWeight(gun('mb700', 'B10', 'S10')) < GUNS.mb700.weight);
    // buildOf gives compat.ts the same build the tree was made from, parents before children.
    const build = fit({ gun: 'mb4a1', parts: [] }, 'H02', 'F01', 'T01', 'T05', 'O03', 'M07', 'S02', 'P02', 'G10', 'B08');
    assert.deepEqual(buildOf(full), build); assert.deepEqual(validateBuild(buildOf(full)), { ok: true });
    assert.deepEqual(gunSize(gun('rpkb', 'M07', 'G09')), { w: 6, h: 3 });
    assert.deepEqual(gunSize(gun('rpkb', 'M07', 'G09'), true), { w: 3, h: 6 });
});

test('relief parts and bodies are worth nothing and flag the gun, so a sale is refused rather than stripped', () => {
    const g = gun('mb4a1', 'H02', 'F01', 'T01'), [handguard] = g.parts, [grip] = handguard.children;
    const normal = gunSale(g).value;
    grip.relief = true;
    assert.deepEqual(gunSale(g), { value: normal - ATTACHMENTS.F01.sell, restricted: true }, 'a relief child');
    grip.relief = false; g.relief = true;
    assert.deepEqual(gunSale(g), { value: normal - GUNS.mb4a1.sell, restricted: true }, 'a relief body with bought parts');
    g.relief = false;
    assert.deepEqual(gunSale(g), { value: normal, restricted: false });
    const reliefBody = { ...g, relief: true };
    assert.deepEqual(check(reliefBody), { ok: true }, 'relief anywhere is legal');
    assert.equal(gunWeight(reliefBody), gunWeight(g), 'relief changes the price, not the weight');
});

test('the largest legal gun still fits the 6x5 bag: every footprint over all builds of the parts that can change it', () => {
    // Only `grow` changes a footprint. Explore every build of those parts plus whatever they need to go on (their
    // prerequisites, the parts that open their slot, the parts granting what they require).
    const grows = PART_IDS.filter(id => ATTACHMENTS[id].mods.grow);
    const helpers = PART_IDS.filter(id => grows.some(g => {
        const a = ATTACHMENTS[g], h = ATTACHMENTS[id];
        return a.needs.some(n => n.part === id) || (h.provides[a.mount] ?? 0) > 0 || a.requires.some(q => h.grants.includes(q));
    }));
    const candidates = [...grows, ...helpers];
    assert.deepEqual(grows.sort(), ['G01', 'G02', 'G04', 'G08', 'G09', 'M03', 'M04', 'M07', 'M08', 'M12']);
    let largest = { gun: '', parts: [] as string[], w: 0, h: 0 }, builds = 0;
    for (const id of GUN_IDS) {
        const visit = (build: Build) => {
            builds++;
            const size = gunSize({ id, parts: treeOf(build) });
            assert.ok(size.w <= 6 && size.h <= 5, `${id} ${build.parts.map(p => p.id)}: ${size.w}x${size.h}`);
            if (size.w * size.h > largest.w * largest.h) largest = { gun: id, parts: build.parts.map(p => p.id), ...size };
            for (const part of candidates) {
                if (build.parts.some(p => p.id === part)) continue;
                const r = checkInstall(build, part);
                if (r.ok) visit({ gun: id, parts: [...build.parts, { uid: `${part}-${build.parts.length}`, id: part, ...r.at }] });
            }
        };
        visit({ gun: id, parts: [] });
    }
    assert.ok(builds > 20);
    assert.deepEqual([largest.gun, largest.parts.sort(), largest.w, largest.h], ['rpkb', ['G09', 'M07'], 6, 3]);
    const bag = D.createInventory(6, 5), size = gunSize(gun('rpkb', 'M07', 'G09'));
    assert.ok(size.w <= bag.w && size.h <= bag.h, 'it lies flat in the bag');
    assert.ok(gunSize(gun('rpkb', 'M07', 'G09'), true).h > bag.h, 'turned on end it does not');
});

test('a seeded walk of legal builds: every one validates after a JSON round trip and stays within the bag', () => {
    const random = rng(2026);
    let checked = 0;
    for (const id of GUN_IDS) for (let round = 0; round < 6; round++) {
        let build: Build = { gun: id, parts: [] };
        for (let step = 0; step < 40; step++) {
            const part = PART_IDS[Math.floor(random() * PART_IDS.length)], r = checkInstall(build, part);
            if (r.ok) build = { gun: id, parts: [...build.parts, { uid: `p${round}-${step}`, id: part, ...r.at }] };
        }
        const g: GunInstance = { uid: `g${round}`, id, relief: false, parts: treeOf(build), devices: { ...deviceEffects(treeOf(build)) } };
        const stored = JSON.parse(JSON.stringify(stateOf(g)));
        assert.deepEqual(validateGun(id, g.uid, stored), { ok: true }, `${id} ${build.parts.map(p => p.id)}`);
        assert.equal(nodesOf(g.parts).length, build.parts.length);
        assert.deepEqual(new Set(buildOf(g).parts.map(p => JSON.stringify(p))), new Set(build.parts.map(p => JSON.stringify(p))));
        const size = gunSize(g);
        assert.ok(size.w <= 6 && size.h <= 5 && gunWeight(g) > 0);
        checked++;
    }
    assert.equal(checked, 120);
});

test('unknown guns and parts are refused, prototype names and arrays included', () => {
    for (const id of ['m4a1', 'knife', 'ammo9', 'toString', '__proto__', ['pistol'], 7, null, undefined]) {
        refused(validateGun(id, 'g', factoryState()), 'unknown', String(id));
    }
    for (const part of ['Z99', 'toString', '__proto__', 'constructor', ['O01'], 3]) {
        refused(validateGun('gb17', 'g', { parts: [node('p', part as string, 'micro')], devices: { laser: false, light: false } }), 'unknown', String(part));
    }
    // The same words compat.ts uses for the same faults.
    const unknown = validateGun('nope', 'g', factoryState()), compat = validateBuild({ gun: 'nope', parts: [] });
    assert.ok(!unknown.ok && !compat.ok && unknown.reason === compat.reason);
});

test('uids are item uids, held once in the gun: a duplicate inside one gun is refused', () => {
    const g = gun('mb4a1', 'H02', 'F01', 'T01'), ok = () => assert.deepEqual(check(g), { ok: true });
    ok();
    for (const bad of ['', 'a b', 'bc/1', 'x'.repeat(101), 'é', 5, null, undefined]) refused(validateGun('mb4a1', bad, stateOf(g)), 'uid', `gun uid ${String(bad)}`);
    assert.deepEqual(validateGun('mb4a1', 'x'.repeat(100), stateOf(g)), { ok: true }, '100 characters is still an item uid');
    // profile-codec's identity() and the instance check agree on what an item uid is.
    for (const sample of ['', 'a', 'a b', 'bc-1_2', 'x'.repeat(100), 'x'.repeat(101), 'bc/1', 'é', '__proto__']) {
        assert.equal(validateGun('pistol', sample, factoryState()).ok, identity(sample), JSON.stringify(sample));
    }
    const [handguard] = g.parts, [grip, laser] = handguard.children;
    const keep = grip.uid;
    grip.uid = laser.uid; refused(check(g), 'uid', 'two siblings share a uid');
    grip.uid = handguard.uid; refused(check(g), 'uid', 'a child shares its parent\'s uid');
    grip.uid = g.uid; refused(check(g), 'uid', 'a part shares the gun\'s uid');
    grip.uid = 'not ok'; refused(check(g), 'uid', 'a part uid that is no item uid');
    grip.uid = keep; ok();
});

test('a duplicate across the record: repeatedUids over every uid of the record finds what one gun cannot see', () => {
    const stash = [{ uid: 'bc-1' }, { uid: 'bc-2' }], carried = gun('mb4a1', 'H02', 'F01'), spare = gun('akb74', 'H04', 'F02');
    spare.uid = 'bc-9';
    const record = () => [...stash.map(i => i.uid), ...gunUids(carried), ...gunUids(spare)];
    assert.deepEqual(repeatedUids(record()), []);
    // Each gun is valid on its own, yet a part uid also names a stash item, or a part of another gun.
    carried.parts[0].children[0].uid = 'bc-2';
    assert.deepEqual(check(carried), { ok: true });
    assert.deepEqual(repeatedUids(record()), ['bc-2']);
    carried.parts[0].children[0].uid = spare.parts[0].uid;
    assert.deepEqual([check(carried).ok, check(spare).ok], [true, true]);
    assert.deepEqual(repeatedUids(record()), [spare.parts[0].uid]);
    carried.parts[0].children[0].uid = 'bc-3'; spare.uid = 'bc-1';
    assert.deepEqual(repeatedUids(record()), ['bc-1'], 'a gun uid that is also an item uid');
    assert.deepEqual(repeatedUids(['a', 'b', 'a', 'a', 'c', 'b']), ['a', 'b']);
});

test('shape: missing or extra keys, wrong types, and shared or cyclic nodes are refused', () => {
    const g = gun('mb4a1', 'H02', 'F01');
    const faults: [string, (s: any) => void][] = [
        ['extra state key', s => { s.extra = 1; }], ['no devices', s => { delete s.devices; }], ['parts not a list', s => { s.parts = {}; }],
        ['devices extra key', s => { s.devices.strobe = false; }], ['device not boolean', s => { s.devices.laser = 0; }],
        ['node extra key', s => { s.parts[0].note = 'x'; }], ['node without children', s => { delete s.parts[0].children; }],
        ['children not a list', s => { s.parts[0].children = null; }], ['relief not boolean', s => { s.parts[0].children[0].relief = 'no'; }],
        ['relief missing', s => { delete s.parts[0].relief; }], ['node is a list', s => { s.parts[0] = []; }], ['node is null', s => { s.parts.push(null); }],
        ['slot unknown', s => { s.parts[0].slot = 'wing'; }], ['slot not text', s => { s.parts[0].slot = 1; }],
    ];
    for (const [why, mutate] of faults) {
        const s = structuredClone(stateOf(g)); mutate(s);
        refused(validateGun(g.id, g.uid, s), 'structure', why);
    }
    for (const bad of [null, [], 'x', { parts: [] }]) refused(validateGun('pistol', 'g', bad), 'structure', JSON.stringify(bad));
    // The same object in two places, and a node inside itself: refused, and the walk ends.
    const shared = node('f', 'F01', 'under'), handguard = node('h', 'H02', 'handguard', [shared]);
    refused(validateGun('mb4a1', 'g', { parts: [handguard, shared], devices: { laser: false, light: false } }), 'structure', 'a shared node');
    const loop: any = node('h', 'H02', 'handguard'); loop.children.push(loop);
    refused(validateGun('mb4a1', 'g', { parts: [loop], devices: { laser: false, light: false } }), 'structure', 'a cycle');
    const unknown = validateGun('mb4a1', 'g', { parts: [node('h', 'H02', 'wing')], devices: { laser: false, light: false } });
    const compat = validateBuild({ gun: 'mb4a1', parts: [{ uid: 'h', id: 'H02', parent: null, slot: 'wing' as never }] });
    assert.ok(!unknown.ok && !compat.ok && unknown.reason === compat.reason, 'the same words as compat.ts');
});

test('limits: more than 12 parts or 3 levels are refused, and the walk stops there however large the value', () => {
    const devices = { laser: false, light: false };
    const flat = (n: number) => Array.from({ length: n }, (_, i) => node(`p${i}`, 'F01', 'under'));
    const many = validateGun('mb4a1', 'g', { parts: flat(MAX_PARTS + 1), devices });
    refused(many, 'count', '13 parts');
    const compatMany = validateBuild({ gun: 'mb4a1', parts: flat(MAX_PARTS + 1).map(p => ({ uid: p.uid, id: p.id, parent: null, slot: 'under' as const })) });
    assert.ok(!many.ok && !compatMany.ok && many.reason === compatMany.reason);
    const chain = (n: number) => { let top: any = null; for (let i = n; i > 0; i--) top = node(`c${i}`, 'H02', 'handguard', top ? [top] : []); return top; };
    const deep = validateGun('mb4a1', 'g', { parts: [chain(MAX_DEPTH + 1)], devices });
    refused(deep, 'depth', 'four levels');
    const compatDeep = validateBuild({ gun: 'mb4a1', parts: Array.from({ length: 4 }, (_, i) => ({ uid: `c${i + 1}`, id: 'H02', parent: i ? `c${i}` : null, slot: 'handguard' as const })) });
    assert.ok(!deep.ok && !compatDeep.ok && deep.reason === compatDeep.reason);
    refused(validateGun('mb4a1', 'g', { parts: flat(100_000), devices }), 'count', 'a huge list');
    refused(validateGun('mb4a1', 'g', { parts: [chain(5000)], devices }), 'depth', 'a deep chain');
    // Nothing past a limit is even read: a value there that throws on any access is never touched.
    const trap = new Proxy({}, Object.fromEntries(['get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf'].map(name =>
        [name, () => { throw new Error(`read past the limit (${name})`); }])));
    refused(validateGun('mb4a1', 'g', { parts: [...flat(MAX_PARTS + 1), trap], devices }), 'count', 'stops at the 13th part');
    const below = node('c1', 'H02', 'handguard', [node('c2', 'H02', 'handguard', [node('c3', 'H02', 'handguard', [trap])])]);
    refused(validateGun('mb4a1', 'g', { parts: [below], devices }), 'depth', 'stops at the fourth level');
    // Three levels are allowed by the tree; the catalog has no part on a part on a part, so compat refuses the slot.
    refused(validateGun('mb4a1', 'g', { parts: [chain(MAX_DEPTH)], devices }), 'place', 'three handguards stacked');
});

test('legality is compat.ts\'s, with its codes and reasons', () => {
    const devices = { laser: false, light: false };
    const cases: [GunId, PartNode[], GunFault, string][] = [
        ['gb17', [node('m', 'M03', 'muzzle') as PartNode], 'needs', '需要九系精瞄枪管组'],
        ['mb870', [node('m', 'M11', 'muzzle') as PartNode], 'gun', '不适配这把枪'],
        ['mb4a1', [node('o', 'O03', 'muzzle') as PartNode], 'place', '不能装在这个位置'],
        ['mb4a1', [node('o', 'O03', 'top') as PartNode, node('p', 'O04', 'top') as PartNode], 'full', '顶部导轨已被占用'],
        ['umpb45', [node('o', 'O09', 'top') as PartNode], 'scope', '这把枪不能装远距瞄具'],
    ];
    for (const [id, parts, code, reason] of cases) {
        const r = validateGun(id, 'g', { parts, devices });
        assert.deepEqual(r, { ok: false, code, reason }, `${id} ${parts.map(p => p.id)}`);
        assert.deepEqual(r, validateBuild(buildOf({ id, parts })));
    }
    const ak = gun('akb74', 'H04', 'T01');
    ak.parts[0].children.push(node('t2', 'T02', 'side') as PartNode);
    assert.deepEqual(check(ak), { ok: false, code: 'laser', reason: '一把枪只能装一个激光' });
});

test('device switches are on only while an installed part has that effect; a combiner has both', () => {
    const plain = gun('akb74', 'H04');
    for (const devices of [{ laser: true, light: false }, { laser: false, light: true }]) refused(validateGun('akb74', 'g', { parts: plain.parts, devices }), 'devices', JSON.stringify(devices));
    const laser = gun('akb74', 'H04', 'T01'), light = gun('akb74', 'H04', 'T05'), both = gun('akb74', 'H04', 'T09'), pair = gun('akb74', 'H04', 'T01', 'T05');
    assert.deepEqual([laser, light, both, pair].map(g => deviceEffects(g.parts)),
        [{ laser: true, light: false }, { laser: false, light: true }, { laser: true, light: true }, { laser: true, light: true }]);
    assert.deepEqual(validateGun('akb74', 'g', { parts: laser.parts, devices: { laser: true, light: false } }), { ok: true });
    refused(validateGun('akb74', 'g', { parts: laser.parts, devices: { laser: true, light: true } }), 'devices', 'a light switched on with only a laser');
    assert.deepEqual(validateGun('akb74', 'g', { parts: light.parts, devices: { laser: false, light: true } }), { ok: true });
    for (const g of [both, pair]) assert.deepEqual(validateGun('akb74', 'g', { parts: g.parts, devices: { laser: true, light: true } }), { ok: true });
    // A pistol's side mount takes the micro combiner.
    assert.deepEqual(validateGun('gb17', 'g', { parts: gun('gb17', 'T08').parts, devices: { laser: true, light: true } }), { ok: true });
});
