import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import * as Shop from '../src/shop';
import { ATTACHMENTS, GUNS, partTier } from '../src/gunsmith/catalog';
import { factoryState } from '../src/gunsmith/instance';
import { buildingRunConfig, initializeBuildingRaid } from '../src/building-world';
import { initializeMallRaid, mallRunConfig, mallWorldV3 } from '../src/mall-world';
import { newExpansion, validateExpansion } from '../src/expansion-state';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { damageLayerEnemy } from '../src/layer-transition';
import { decodeStoredProfile } from '../src/profile-codec';
import { SaveSession, createSessionState } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { TILE, WORLD, type RunConfig } from '../src/world';

// #28 M2-13 (docs/gunsmith/CONTRACTS.md, 样板获取路径): the shop stocks the G17, the basic parts and (M2 review
// 2026-10-27) O01 and G01; the M4A1 and the other common and the rare parts are found, carved out of the gun and
// valuable shares of the loot only.

const PARTS = Object.keys(D.ITEMS).filter(id => D.isAttachment(id));
const BASIC = ['P01', 'F01', 'A07'], RARE = ['O08', 'M03', 'B08'], SHELF_COMMON = ['O01', 'G01'];
/** The common parts that are found: the shelf's two are not. */
const COMMON = PARTS.filter(id => !BASIC.includes(id) && !RARE.includes(id) && !SHELF_COMMON.includes(id));
const OLD_ARMS = ['pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'scrap', 'wire', 'fuse', 'battery'];
type Unit = { id: string; qty: number };
const records = (c: Pick<RunConfig, 'loot' | 'containers'>): Unit[] => [...c.loot, ...c.containers.flatMap(x => x.items)];
const isFind = (id: string) => id === 'mb4a1' || D.isAttachment(id);
const flooded = (p: { x: number; y: number }) => WORLD.tiles[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)] === 4;
const amounts = (units: Unit[]) => units.reduce((a, u) => ({ ...a, [u.id]: (a[u.id] ?? 0) + u.qty }), {} as Record<string, number>);

test('tiers: the price bands of PLAN section 10 sort the 100 parts 20/65/15, the 20 samples into 3 basic, 14 common and 3 rare', () => {
    const count = { basic: 0, common: 0, rare: 0 };
    for (const a of Object.values(ATTACHMENTS)) count[partTier(a)]++;
    assert.deepEqual(count, { basic: 20, common: 65, rare: 15 });
    // The band edges: 150 is still basic, 450 still common.
    assert.deepEqual([40, 150, 151, 450, 451, 1200].map(buy => partTier({ buy })), ['basic', 'basic', 'common', 'common', 'rare', 'rare']);
    assert.deepEqual(PARTS.filter(id => partTier(ATTACHMENTS[id]) === 'basic'), BASIC);
    assert.deepEqual(PARTS.filter(id => partTier(ATTACHMENTS[id]) === 'rare'), RARE);
    // 14 common samples: 12 found, and the G17's O01 and G01 on the shelf (M2 review 2026-10-27).
    assert.deepEqual(PARTS.filter(id => partTier(ATTACHMENTS[id]) === 'common'), PARTS.filter(id => COMMON.includes(id) || SHELF_COMMON.includes(id)));
    assert.deepEqual([COMMON.length, SHELF_COMMON.length], [12, 2]);
});

test('shop: 老栓 stocks the G17, the three basic sample parts, O01 and G01 after his old goods, at the catalog\'s prices; the doctor is unchanged', () => {
    for (const rpg of [false, true]) {
        assert.deepEqual(Shop.merchantStock('arms', rpg), [...OLD_ARMS, 'gb17', ...BASIC, ...SHELF_COMMON, ...rpg ? ['cloth'] : []]);
        assert.deepEqual(Shop.merchantStock('med', rpg), ['bandage', 'medkit', 'antidote', 'water', 'food', ...rpg ? ['analgesic', 'focus'] : []]);
    }
    // The M4A1, the found common parts and the rare parts are finds only.
    assert.ok(!Shop.merchantStock('arms', true).some(id => id === 'mb4a1' || COMMON.includes(id) || RARE.includes(id)));
    assert.deepEqual([D.ITEMS.gb17.buy, D.ITEMS.gb17.sell], [GUNS.gb17.buy, GUNS.gb17.sell]);
    for (const id of [...BASIC, ...SHELF_COMMON]) assert.deepEqual([D.ITEMS[id].buy, D.ITEMS[id].sell], [ATTACHMENTS[id].buy, ATTACHMENTS[id].sell], id);
    const cart = Shop.createCart(D.newSave(), 'arms');
    for (const id of ['gb17', ...BASIC, ...SHELF_COMMON]) assert.deepEqual(Shop.shopQuote('merchant', cart.catalog.items.find(i => i.id === id)!), { side: 'buy', total: D.ITEMS[id].buy }, id);
});

test('shop: every stocked pack shows in the one 6x5 catalog page, both counters, with and without the RPG extras; old goods keep their cells', () => {
    for (const rpg of [false, true]) for (const merchant of ['arms', 'med'] as const) {
        const cart = Shop.createCart(D.newSave(), merchant, rpg);
        assert.deepEqual([cart.catalog.w, cart.catalog.h], [6, 5]);
        // createCart drops a pack that does not fit without a word: none may be missing.
        assert.deepEqual(cart.catalog.items.map(i => [i.id, i.qty]), Shop.merchantStock(merchant, rpg).map(id => [id, D.buyQuantity(id)]), `${merchant} rpg=${rpg}`);
    }
    const cells = Object.fromEntries(Shop.createCart(D.newSave(), 'arms', true).catalog.items.map(i => [i.id, [i.x, i.y]]));
    assert.deepEqual(cells, { pistol: [0, 0], shotgun: [2, 0], carbine: [0, 1], ammo9: [5, 0], shell: [3, 1], ammoR: [4, 1], scrap: [5, 1],
        wire: [0, 2], fuse: [1, 2], battery: [2, 2], gb17: [3, 2], P01: [5, 2], F01: [0, 3], A07: [1, 3], O01: [3, 3], G01: [4, 3], cloth: [5, 3] });
});

test('shop: the G17 and the basic parts settle into the stash at catalog prices: a factory G17 under a new uid, each part its own item', () => {
    const save = D.newSave(); save.cash = 2000;
    const cart = Shop.createCart(save, 'arms'), pick = (id: string) => cart.catalog.items.find(i => i.id === id)!.uid;
    for (const [id, x, y] of [['gb17', 0, 0], ['P01', 2, 0], ['P01', 3, 0], ['F01', 0, 1], ['A07', 1, 1]] as const)
        assert.ok(Shop.moveShopItem(cart, 'merchant', 'buy', pick(id), x, y), id);
    const price = GUNS.gb17.buy + 2 * ATTACHMENTS.P01.buy + ATTACHMENTS.F01.buy + ATTACHMENTS.A07.buy;
    assert.deepEqual(Shop.cartTotals(cart), { buy: price, sell: 0, net: price });
    const owned = new Set(save.stash.items.map(i => i.uid));
    assert.deepEqual(Shop.settleCartResult(save, cart), { ok: true });
    assert.equal(save.cash, 2000 - price);
    const bought = save.stash.items.filter(i => !owned.has(i.uid));
    assert.deepEqual(bought.map(i => i.id).sort(), ['A07', 'F01', 'P01', 'P01', 'gb17']);
    assert.equal(new Set(bought.map(i => i.uid)).size, 5);
    for (const item of bought) {
        assert.equal(item.qty, 1, item.id);
        if (item.id === 'gb17') assert.deepEqual(item.gun, factoryState());
        else assert.ok(!('gun' in item), item.id);
    }
    // The cart's G17 was a display copy: the stash's is a new instance.
    assert.ok(!cart.buy.items.some(i => bought.some(b => b.uid === i.uid)));
    // The profile reads back as written, and a part sells back at its catalog price.
    assert.deepEqual(decodeStoredProfile(structuredClone(save)).stash, save.stash);
    const back = Shop.createCart(save, 'arms'), a07 = back.stash.items.find(i => i.id === 'A07')!;
    assert.ok(Shop.moveShopItem(back, 'stash', 'sell', a07.uid, 0, 0));
    assert.deepEqual(Shop.settleCartResult(save, back), { ok: true });
    assert.equal(save.cash, 2000 - price + ATTACHMENTS.A07.sell);
});

test('gunsmithFind: only guns and valuables are judged, one draw each; the M4A1 only from a gun where allowed; rare only from a high-risk source', () => {
    const stream = (values: number[]) => {
        let i = 0;
        return Object.assign(() => { if (i >= values.length) throw new Error('one draw too many'); return values[i++]; }, { used: () => i });
    };
    for (const id of ['ammo9', 'shell', 'ammoR', 'bandage', 'medkit', 'antidote', 'water', 'food', 'sample', 'ledger', 'scrap', 'wire', 'fuse',
        'battery', 'cloth', 'luckyCharm', 'strengthDose', 'knife', 'O03', 'Z99', 'toString', '__proto__'])
        assert.equal(D.gunsmithFind(id, stream([]), { risky: true, rifle: true }), null, id);
    for (const id of ['pistol', 'shotgun', 'carbine', 'gb17', 'watch', 'pearl']) {
        const random = stream([D.GUNSMITH_FINDS.share]);
        assert.equal(D.gunsmithFind(id, random, { risky: true, rifle: true }), null, id); assert.equal(random.used(), 1, id);
    }
    // Under the share a gun record of a map's loot is the M4A1 under `rifle`; a corpse's gun (rifle false) and a valuable never are.
    assert.equal(D.gunsmithFind('carbine', stream([0, 0]), { risky: false, rifle: true }), 'mb4a1');
    assert.equal(D.gunsmithFind('pistol', stream([0, 0]), { risky: false, rifle: false }), COMMON[0]);
    assert.equal(D.gunsmithFind('watch', stream([0, 0]), { risky: false, rifle: true }), COMMON[0]);
    assert.equal(D.gunsmithFind('pearl', stream([0, .999]), { risky: false, rifle: true }), COMMON.at(-1));
    // A high-risk source: rare under `rare`, common otherwise.
    assert.equal(D.gunsmithFind('pearl', stream([0, 0, 0]), { risky: true, rifle: true }), RARE[0]);
    assert.equal(D.gunsmithFind('pearl', stream([0, D.GUNSMITH_FINDS.rare, 0]), { risky: true, rifle: true }), COMMON[0]);
    assert.equal(D.gunsmithFind('shotgun', stream([0, D.GUNSMITH_FINDS.rifle, 0, .999]), { risky: true, rifle: true }), RARE.at(-1));
});

test('zone finds leave every other record as on main: quest, food, medicine and ammunition per seed, and each config but its gun and valuable ids', () => {
    const before = JSON.parse(readFileSync('tests/fixtures/loot-before-m2-13.json', 'utf8')) as { ids: string[]; units: string[]; masked: string };
    const hash = createHash('sha256');
    for (let seed = 1; seed <= before.units.length; seed++) {
        const config = buildingRunConfig(seed), all = records(config);
        assert.equal(before.ids.map(id => all.filter(r => r.id === id).reduce((n, r) => n + r.qty, 0)).join(','), before.units[seed - 1], `seed ${seed}`);
        const masked = structuredClone(config);
        for (const r of records(masked)) if (['weapon', 'valuable', 'attachment'].includes(D.ITEMS[r.id].kind)) r.id = '*';
        hash.update(JSON.stringify(masked) + '\n');
    }
    // Positions, crates, quantities, exits, enemies and every other id as they were: only gun and valuable ids may differ.
    assert.equal(hash.digest('hex'), before.masked);
});

test('zone finds over 1000 seeds: every common and rare sample part and the M4A1 turn up, rare ones only in flooded caches; about two a raid', () => {
    const seen: Record<string, number> = {};
    let finds = 0;
    for (let seed = 1; seed <= 1000; seed++) {
        const config = buildingRunConfig(seed);
        assert.equal(records(config).length, 60, 'the budget');
        assert.deepEqual(buildingRunConfig(seed), config, 'the same seed, the same finds');
        for (const r of records(config)) if (isFind(r.id)) { seen[r.id] = (seen[r.id] ?? 0) + 1; finds++; assert.equal(r.qty, 1); }
        // A rare part lies on the ground in a flooded cache; crates hold only dry spots.
        for (const r of config.loot) if (RARE.includes(r.id)) assert.ok(flooded(r), `seed ${seed} ${r.id}`);
        for (const r of config.containers.flatMap(c => c.items)) assert.ok(!RARE.includes(r.id), `seed ${seed} ${r.id}`);
    }
    assert.deepEqual(Object.keys(seen).sort(), [...COMMON, ...RARE, 'mb4a1'].sort(), 'no basic part and no G17 among the finds');
    // The proposal's rates (CONTRACTS.md): about 2.1 finds a raid, an M4A1 one raid in four or five, each rare part rarer than each common one.
    assert.ok(finds / 1000 > 1.8 && finds / 1000 < 2.4, String(finds / 1000));
    assert.ok(seen.mb4a1 / 1000 > .17 && seen.mb4a1 / 1000 < .29, String(seen.mb4a1 / 1000));
    assert.ok(Math.max(...RARE.map(id => seen[id])) < Math.min(...COMMON.map(id => seen[id])), JSON.stringify(seen));
});

test('every sample gun and part can be had: the G17 and the basic parts on the shelf, the rest found within 300 seeds', () => {
    const shelf = new Set(Shop.merchantStock('arms')), found = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) for (const r of records(buildingRunConfig(seed))) if (isFind(r.id)) found.add(r.id);
    for (const id of ['gb17', 'mb4a1', ...PARTS]) assert.ok(shelf.has(id) !== found.has(id), `${id}: on the shelf or found in a raid, not both`);
});

test('the mall deals out the same records, finds included', () => {
    for (let seed = 1; seed <= 60; seed++) {
        const street = buildingRunConfig(seed), mall = mallRunConfig(seed);
        assert.deepEqual([mall.loot, mall.containers], [street.loot, street.containers], `seed ${seed}`);
    }
});

test('deployed street and mall raids: a found M4A1 is a factory instance, a found part one item under its own uid, and the raid validates', () => {
    const totals = { rifles: 0, crated: 0, parts: 0 };
    for (let seed = 1; seed <= 40; seed++) for (const mall of [false, true]) {
        const profile = D.newSave(), loadout = D.beginRun(profile, seed), state = newExpansion(0);
        const config = mall ? mallRunConfig(seed) : buildingRunConfig(seed);
        if (mall) initializeMallRaid(state, loadout, config, mallWorldV3()); else initializeBuildingRaid(state, loadout, config);
        validateExpansion(state, profile, null, resolveExpansionWorld);
        const layers = Object.values(state.raid!.maps), ground = layers.flatMap(m => m.loot), crated = layers.flatMap(m => m.containers.flatMap(c => c.inventory.items));
        const world = [...ground, ...crated], uids = world.map(i => i.uid);
        assert.equal(new Set(uids).size, uids.length, 'one uid each');
        assert.deepEqual(amounts(world.filter(i => isFind(i.id))), amounts(records(config).filter(r => isFind(r.id))), `seed ${seed} mall=${mall}`);
        for (const item of world) {
            if (D.isGun(item.id)) assert.deepEqual(item.gun, factoryState(), `${item.id} ${item.uid}`);
            else assert.ok(!('gun' in item), item.id);
            if (D.isAttachment(item.id)) { assert.equal(item.qty, 1); totals.parts++; }
        }
        totals.rifles += world.filter(i => i.id === 'mb4a1').length; totals.crated += crated.filter(i => i.id === 'mb4a1').length;
    }
    assert.ok(totals.rifles > 0 && totals.crated > 0 && totals.parts > 0, JSON.stringify(totals));
});

test('corpses: a legacy enemy keeps its old roll; now and then a gun or valuable drop is a part instead, rare only on an elite, never the M4A1', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 3000; seed++) for (const elite of [false, true]) {
        const rolls = elite ? 3 : 1, old = D.rollLoot(seed, rolls), now = D.corpseLoot(seed, rolls, elite);
        assert.deepEqual(D.corpseLoot(seed, rolls, elite), now, 'the same seed, the same corpse');
        assert.equal(now.length, old.length);
        now.forEach((drop, i) => {
            if (drop.id === old[i].id) return assert.deepEqual(drop, old[i]);
            assert.ok(D.isGun(old[i].id) || D.ITEMS[old[i].id].kind === 'valuable', `seed ${seed}: ${old[i].id} is neither a gun nor a valuable`);
            assert.ok(D.isAttachment(drop.id) && drop.qty === 1 && !BASIC.includes(drop.id), drop.id);
            assert.ok(elite || !RARE.includes(drop.id), `seed ${seed}: a rare part on an ordinary corpse`);
            seen.add(drop.id);
        });
    }
    assert.deepEqual([...seen].sort(), [...COMMON, ...RARE].sort());
});

test('a legacy enemy killed in a street raid leaves exactly corpseLoot\'s drops, parts included, and the raid validates', () => {
    let parts = 0;
    for (let seed = 1; seed <= 40; seed++) {
        const profile = D.newSave(), loadout = D.beginRun(profile, seed), state = newExpansion(0);
        initializeBuildingRaid(state, loadout, buildingRunConfig(seed));
        const raid = state.raid!;
        for (const [mapId, layer] of Object.entries(raid.maps)) for (const enemy of [...layer.enemies]) {
            const elite = enemy.id === 'elite';
            damageLayerEnemy(state, mapId, enemy, 100000);
            const corpse = layer.containers.find(c => c.id === `corpse-${enemy.uid}`)!;
            assert.deepEqual(amounts(corpse.inventory.items), amounts(D.corpseLoot(raid.seed + raid.kills * 47, elite ? 3 : 1, elite)), `seed ${seed} ${enemy.uid}`);
            parts += corpse.inventory.items.filter(i => D.isAttachment(i.id)).length;
        }
        validateExpansion(state, profile, null, resolveExpansionWorld);
    }
    assert.ok(parts > 0, 'some corpse holds a part');
});

/** A street raid deployed through SaveSession on `seed` (its encounters installed), with a frozen Runtime and the ?test=1 driver. */
function streetRaid(seed: number) {
    const data = new Map<string, string>(), storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(seed, true)); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves); runtime.freezeAI = true;
    return { state, runtime, driver: createRuntimeTestDriver(runtime, '?test=1'), record: () => decodeSession(data.get(SESSION_KEY)!) };
}

test('a found M4A1 and part picked up in a street raid checkpoint, extract and read back: the same factory instance, a plain item', () => {
    // The first seed whose street holds both an M4A1 and a part on dry ground (the first two records go up- and downstairs).
    const dry = (id: (x: string) => boolean) => (config: RunConfig) => config.loot.slice(2).find(r => id(r.id) && !flooded(r));
    const seed = Array.from({ length: 300 }, (_, i) => i + 1).find(s => { const c = buildingRunConfig(s); return dry(id => id === 'mb4a1')(c) && dry(D.isAttachment)(c); })!;
    assert.ok(seed, 'a seed with both finds on dry ground');
    const r = streetRaid(seed), coast = () => r.state.expansion!.raid!.maps.coast.loot;
    const rifle = coast().find(l => l.id === 'mb4a1')!, part = coast().find(l => D.isAttachment(l.id) && !flooded(l))!;
    assert.deepEqual(rifle.gun, factoryState());
    for (const found of [rifle, part]) {
        r.driver.placePlayer({ x: found.x, y: found.y }, 0, 'coast');
        assert.equal(r.runtime.pickupLoot(found.uid), true, found.id);
    }
    const bag = () => r.state.loadout!.bag.items;
    // The rifle keeps its uid and factory state; the part is one item.
    assert.deepEqual(bag().filter(i => i.id === 'mb4a1').map(i => [i.uid, i.gun]), [[rifle.uid, factoryState()]]);
    assert.deepEqual(bag().filter(i => i.id === part.id).map(i => [i.qty, 'gun' in i]), [[1, false]]);
    assert.ok(r.runtime.checkpoint());
    const stored = r.record().expansion!.raid!.loadout.bag.items;
    assert.ok(stored.some(i => i.uid === rifle.uid && i.id === 'mb4a1') && stored.some(i => i.id === part.id));
    r.runtime.finish('extract'); assert.equal(r.runtime.settlement.committed, true); r.runtime.dispose();
    const home = r.record().profile;
    assert.deepEqual(decodeStoredProfile(structuredClone(home)), home);
    const owned = [...home.stash.items, ...home.bag.items, ...home.safe.items];
    assert.deepEqual(owned.filter(i => i.id === 'mb4a1').map(i => [i.uid, i.gun]), [[rifle.uid, factoryState()]]);
    assert.equal(owned.filter(i => i.id === part.id).length, 1);
});

test('a mall raid deployed through SaveSession with finds in it stores and reads back', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
        if (!records(mallRunConfig(seed)).some(r => isFind(r.id))) continue;
        const data = new Map<string, string>(), storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
        const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
        assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(seed, 'mall', { mallLayout: 3 }));
        const raid = decodeSession(data.get(SESSION_KEY)!).expansion!.raid!;
        const world = Object.values(raid.maps).flatMap(m => [...m.loot, ...m.containers.flatMap(c => c.inventory.items)]);
        assert.deepEqual(amounts(world.filter(i => isFind(i.id))), amounts(records(mallRunConfig(seed)).filter(r => isFind(r.id))), `seed ${seed}`);
        for (const gun of world.filter(i => D.isGun(i.id))) assert.deepEqual(gun.gun, factoryState());
        checked++;
    }
    assert.ok(checked > 0);
});
