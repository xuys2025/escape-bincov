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
// 2026-10-27) O01 and G01; the other gunsmith guns and the other common and the rare parts are found, carved out of the
// gun and valuable shares of the loot only. #28 M3 added wave one's seven guns (found, rare ones at high-risk spots)
// and forty parts (the basic ones on the shelf), then wave two's P0: the AUG (found) and six parts (F04 on the shelf),
// and M3-05/06 the other seven guns (found), their three ammunition groups (on the shelf, and carved from gun records)
// and the other 34 parts.

// The catalog's parts; a factory magazine (#28 M4-07) only ever comes off a gun, never from a shelf or a find.
const PARTS = Object.keys(D.ITEMS).filter(id => D.isAttachment(id) && Object.hasOwn(ATTACHMENTS, id));
const BASIC = ['P01', 'F01', 'A07', 'A01', 'A02', 'A04', 'A05', 'A06', 'A08', 'H03', 'P04', 'P07', 'M01', 'M05', 'F04', 'O12', 'P08', 'G02', 'T07', 'A03'];
const RARE = ['O08', 'M03', 'B08', 'G09', 'M07', 'O10', 'T10', 'O09', 'O11', 'M04', 'M08', 'M12', 'B10', 'T03', 'T09'], SHELF_COMMON = ['O01', 'G01'];
/** Wave two's rounds (#28 M3-05): on the shelf, and one pack now and then out of a gun record. */
const NEW_AMMO = ['ammo45', 'ammoPDW', 'ammoHeavy'];
/** The common parts that are found: the shelf's two are not. */
const COMMON = PARTS.filter(id => !BASIC.includes(id) && !RARE.includes(id) && !SHELF_COMMON.includes(id));
/** The found guns by the catalog's tier: every gunsmith gun that is an item but those on the shelf (the G17, and since
 *  the maintainer's 2026-10-28 decision the P226 and the M870). */
const SHELF_GUNS = ['gb17', 'pb226', 'mb870'], GUNS_COMMON = ['mb4a1', 'mpb5', 'akb74', 'akb103', 'augb', 'mb1911', 'umpb45', 'rpkb'];
const GUNS_RARE = ['vb9', 'mb1014', 'pb90', 'svdb', 'mb14', 'mb700'];
const OLD_ARMS = ['pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'scrap', 'wire', 'fuse', 'battery'];
type Unit = { id: string; qty: number };
const records = (c: Pick<RunConfig, 'loot' | 'containers'>): Unit[] => [...c.loot, ...c.containers.flatMap(x => x.items)];
const isFoundGun = (id: string) => GUNS_COMMON.includes(id) || GUNS_RARE.includes(id);
const isFind = (id: string) => isFoundGun(id) || D.isAttachment(id);
const flooded = (p: { x: number; y: number }) => WORLD.tiles[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)] === 4;
const amounts = (units: Unit[]) => units.reduce((a, u) => ({ ...a, [u.id]: (a[u.id] ?? 0) + u.qty }), {} as Record<string, number>);

test('tiers: the price bands of PLAN section 10 sort the 100 parts 20/65/15, and every one is an item', () => {
    const count = { basic: 0, common: 0, rare: 0 };
    for (const a of Object.values(ATTACHMENTS)) count[partTier(a)]++;
    assert.deepEqual(count, { basic: 20, common: 65, rare: 15 });
    // The band edges: 150 is still basic, 450 still common.
    assert.deepEqual([40, 150, 151, 450, 451, 1200].map(buy => partTier({ buy })), ['basic', 'basic', 'common', 'common', 'rare', 'rare']);
    assert.deepEqual(PARTS.filter(id => partTier(ATTACHMENTS[id]) === 'basic'), BASIC);
    assert.deepEqual(PARTS.filter(id => partTier(ATTACHMENTS[id]) === 'rare'), RARE);
    // Since #28 M3-06 every catalog part is an item. 65 common: 63 found, and the G17's O01 and G01 on the shelf (M2
    // review 2026-10-27).
    assert.deepEqual([...PARTS].sort(), Object.keys(ATTACHMENTS).sort());
    assert.deepEqual(PARTS.filter(id => partTier(ATTACHMENTS[id]) === 'common'), PARTS.filter(id => COMMON.includes(id) || SHELF_COMMON.includes(id)));
    assert.deepEqual([COMMON.length, SHELF_COMMON.length], [63, 2]);
    // The found guns follow the catalog's tiers.
    for (const id of GUNS_COMMON) assert.notEqual(GUNS[id as 'mb4a1'].tier, 'rare', id);
    for (const id of GUNS_RARE) assert.equal(GUNS[id as 'vb9'].tier, 'rare', id);
});

test('shop: 老栓 stocks the G17, wave two\'s rounds, the basic parts, O01 and G01 after his old goods (and the cloth), at the catalog\'s prices; the doctor is unchanged', () => {
    for (const rpg of [false, true]) {
        assert.deepEqual(Shop.merchantStock('arms', rpg), [...OLD_ARMS, ...rpg ? ['cloth'] : [], ...SHELF_GUNS, ...NEW_AMMO, ...BASIC, ...SHELF_COMMON]);
        assert.deepEqual(Shop.merchantStock('med', rpg), ['bandage', 'medkit', 'antidote', 'water', 'food', ...rpg ? ['analgesic', 'focus'] : []]);
    }
    // The found guns, the found common parts and the rare parts are finds only.
    assert.ok(!Shop.merchantStock('arms', true).some(id => isFoundGun(id) || COMMON.includes(id) || RARE.includes(id)));
    for (const id of SHELF_GUNS as ('gb17' | 'pb226' | 'mb870')[]) assert.deepEqual([D.ITEMS[id].buy, D.ITEMS[id].sell], [GUNS[id].buy, GUNS[id].sell], id);
    for (const id of [...BASIC, ...SHELF_COMMON]) assert.deepEqual([D.ITEMS[id].buy, D.ITEMS[id].sell], [ATTACHMENTS[id].buy, ATTACHMENTS[id].sell], id);
    const pages = Shop.catalogPages(Shop.merchantStock('arms'));
    for (const id of [...SHELF_GUNS, ...BASIC, ...SHELF_COMMON]) {
        const cart = Shop.createCart(D.newSave(), 'arms', false, { ...Shop.BROWSE_ALL, page: pages.findIndex(p => p.includes(id)) });
        assert.deepEqual(Shop.shopQuote('merchant', cart.catalog.items.find(i => i.id === id)!), { side: 'buy', total: D.ITEMS[id].buy }, id);
    }
    // Wave two's rounds come in packs like the old three's.
    for (const [id, pack] of [['ammo45', 10], ['ammoPDW', 20], ['ammoHeavy', 5]] as const) {
        assert.equal(D.buyQuantity(id), pack, id);
        const cart = Shop.createCart(D.newSave(), 'arms', false, { ...Shop.BROWSE_ALL, page: pages.findIndex(p => p.includes(id)) });
        assert.deepEqual(Shop.shopQuote('merchant', cart.catalog.items.find(i => i.id === id)!), { side: 'buy', total: D.ITEMS[id].buy * pack }, id);
    }
});

test('shop: every stocked pack shows on the 6x5 catalog pages, both counters, with and without the RPG extras; old goods keep their cells', () => {
    for (const rpg of [false, true]) for (const merchant of ['arms', 'med'] as const) {
        const save = D.newSave(), first = Shop.catalogPage(save, merchant, rpg, Shop.BROWSE_ALL), shown: (string | number)[][] = [];
        for (let page = 0; page < first.pages; page++) {
            const cart = Shop.createCart(save, merchant, rpg, { ...Shop.BROWSE_ALL, page });
            assert.deepEqual([cart.catalog.w, cart.catalog.h], [6, 5]);
            shown.push(...cart.catalog.items.map(i => [i.id, i.qty]));
        }
        // A pack that does not fit a page starts the next one: none may be missing, and the order is the stock's.
        assert.deepEqual(shown, Shop.merchantStock(merchant, rpg).map(id => [id, D.buyQuantity(id)]), `${merchant} rpg=${rpg}`);
        assert.equal(first.pages, merchant === 'arms' ? 2 : 1, `${merchant} rpg=${rpg}`);
    }
    // The old goods and the cloth keep the first page's cells they had before the gunsmith goods came.
    const cells = Object.fromEntries(Shop.createCart(D.newSave(), 'arms', true).catalog.items.map(i => [i.id, [i.x, i.y]]));
    for (const [id, cell] of Object.entries({ pistol: [0, 0], shotgun: [2, 0], carbine: [0, 1], ammo9: [5, 0], shell: [3, 1], ammoR: [4, 1], scrap: [5, 1],
        wire: [0, 2], fuse: [1, 2], battery: [2, 2], cloth: [3, 2] })) assert.deepEqual(cells[id], cell, id);
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
        assert.equal(D.gunsmithFind(id, stream([]), { risky: true, gun: true }), null, id);
    for (const id of ['pistol', 'shotgun', 'carbine', 'gb17', 'mpb5', 'watch', 'pearl']) {
        const random = stream([D.GUNSMITH_FINDS.share]);
        assert.equal(D.gunsmithFind(id, random, { risky: true, gun: true }), null, id); assert.equal(random.used(), 1, id);
    }
    // Under the share a gun record of a map's loot is a found gun under `gun`; a corpse's gun (gun false) and a valuable never are.
    assert.equal(D.gunsmithFind('carbine', stream([0, 0, D.GUNSMITH_FINDS.rareGun, 0]), { risky: false, gun: true }), GUNS_COMMON[0]);
    assert.equal(D.gunsmithFind('carbine', stream([0, 0, D.GUNSMITH_FINDS.rareGun, .999]), { risky: false, gun: true }), GUNS_COMMON.at(-1));
    // A rare gun under `rareGun`, wherever the record lies.
    assert.equal(D.gunsmithFind('carbine', stream([0, 0, 0, 0]), { risky: false, gun: true }), GUNS_RARE[0]);
    assert.equal(D.gunsmithFind('pistol', stream([0, 0]), { risky: false, gun: false }), COMMON[0]);
    assert.equal(D.gunsmithFind('watch', stream([0, 0]), { risky: false, gun: true }), COMMON[0]);
    assert.equal(D.gunsmithFind('pearl', stream([0, .999]), { risky: false, gun: true }), COMMON.at(-1));
    // A high-risk source: a rare part under `rare`, a common one otherwise.
    assert.equal(D.gunsmithFind('pearl', stream([0, 0, 0]), { risky: true, gun: true }), RARE[0]);
    assert.equal(D.gunsmithFind('pearl', stream([0, D.GUNSMITH_FINDS.rare, 0]), { risky: true, gun: true }), COMMON[0]);
    // A gun record's find that is not a gun is first judged for wave two's rounds (#28 M3-05).
    assert.equal(D.gunsmithFind('shotgun', stream([0, D.GUNSMITH_FINDS.gun, D.GUNSMITH_FINDS.ammo, 0, .999]), { risky: true, gun: true }), RARE.at(-1));
    assert.equal(D.gunsmithFind('carbine', stream([0, D.GUNSMITH_FINDS.gun, 0, 0]), { risky: false, gun: true }), NEW_AMMO[0]);
    assert.equal(D.gunsmithFind('carbine', stream([0, D.GUNSMITH_FINDS.gun, 0, .999]), { risky: true, gun: true }), NEW_AMMO.at(-1));
    assert.deepEqual(NEW_AMMO.map(D.findQuantity), [10, 20, 5]); assert.deepEqual(['O03', 'mb4a1'].map(D.findQuantity), [1, 1]);
    assert.equal(D.gunsmithFind('shotgun', stream([0, 0, 0, .999]), { risky: true, gun: true }), GUNS_RARE.at(-1));
});

test('zone finds leave every other record as on main: quest, food, medicine and ammunition per seed, and each config but its gun and valuable ids', () => {
    const before = JSON.parse(readFileSync('tests/fixtures/loot-before-m2-13.json', 'utf8')) as { ids: string[]; units: string[]; masked: string };
    const hash = createHash('sha256');
    for (let seed = 1; seed <= before.units.length; seed++) {
        const config = buildingRunConfig(seed), all = records(config);
        assert.equal(before.ids.map(id => all.filter(r => r.id === id).reduce((n, r) => n + r.qty, 0)).join(','), before.units[seed - 1], `seed ${seed}`);
        const masked = structuredClone(config);
        // A pack of wave two's rounds replaced a gun record (#28 M3-05), which held one.
        for (const r of records(masked)) {
            if (NEW_AMMO.includes(r.id)) { r.id = '*'; r.qty = 1; }
            else if (['weapon', 'valuable', 'attachment'].includes(D.ITEMS[r.id].kind)) r.id = '*';
        }
        hash.update(JSON.stringify(masked) + '\n');
    }
    // Positions, crates, quantities, exits, enemies and every other id as they were: only gun and valuable ids may differ
    // (and a found pack's quantity).
    assert.equal(hash.digest('hex'), before.masked);
});

test('zone finds over 3000 seeds: every found gun and part turns up, rare parts only in flooded caches; about two a raid', () => {
    // 3000 seeds since #28 M3-06: with 63 common and 15 rare parts, 1000 raids leave the two counts overlapping by chance.
    const seen: Record<string, number> = {}, rounds: Record<string, number> = {}, N = 3000;
    let finds = 0;
    for (let seed = 1; seed <= N; seed++) {
        const config = buildingRunConfig(seed);
        assert.equal(records(config).length, 60, 'the budget');
        assert.deepEqual(buildingRunConfig(seed), config, 'the same seed, the same finds');
        for (const r of records(config)) if (isFind(r.id)) { seen[r.id] = (seen[r.id] ?? 0) + 1; finds++; assert.equal(r.qty, 1); }
        // Wave two's rounds lie in packs (#28 M3-05).
        for (const r of records(config)) if (NEW_AMMO.includes(r.id)) { rounds[r.id] = (rounds[r.id] ?? 0) + 1; assert.equal(r.qty, D.buyQuantity(r.id)); }
        // A rare part lies on the ground in a flooded cache; crates hold only dry spots.
        for (const r of config.loot) if (RARE.includes(r.id)) assert.ok(flooded(r), `seed ${seed} ${r.id}`);
        for (const r of config.containers.flatMap(c => c.items)) assert.ok(!RARE.includes(r.id), `seed ${seed} ${r.id}`);
    }
    assert.deepEqual(Object.keys(seen).sort(), [...COMMON, ...RARE, ...GUNS_COMMON, ...GUNS_RARE].sort(), 'no basic part and no G17 among the finds');
    // The proposal's rates (CONTRACTS.md): about 2.1 finds a raid, a gun one raid in four or five, each rare part or gun
    // rarer than each common one.
    const guns = [...GUNS_COMMON, ...GUNS_RARE].reduce((n, id) => n + seen[id], 0);
    finds /= N / 1000;
    // Since #28 M3-05 a third of a gun record's other finds are rounds: guns and parts together are about 1.9 a raid.
    assert.ok(finds / 1000 > 1.6 && finds / 1000 < 2.2, String(finds / 1000));
    const packs = NEW_AMMO.reduce((n, id) => n + (rounds[id] ?? 0), 0);
    assert.deepEqual(Object.keys(rounds).sort(), [...NEW_AMMO].sort());
    assert.ok(packs / N > .12 && packs / N < .35, `rounds ${packs / N} a raid`);
    assert.ok(guns / N > .17 && guns / N < .29, String(guns / N));
    assert.ok(Math.max(...RARE.map(id => seen[id])) < Math.min(...COMMON.map(id => seen[id])), JSON.stringify(seen));
    assert.ok(Math.max(...GUNS_RARE.map(id => seen[id])) < Math.min(...GUNS_COMMON.map(id => seen[id])), JSON.stringify(seen));
});

test('every gun and part can be had: the shelf\'s on the shelf, the rest found within 1000 seeds', () => {
    // 1000 seeds since #28 M3-06: fifteen rare parts share the flooded caches.
    const shelf = new Set(Shop.merchantStock('arms')), found = new Set<string>();
    for (let seed = 1; seed <= 1000; seed++) for (const r of records(buildingRunConfig(seed))) if (isFind(r.id)) found.add(r.id);
    for (const id of [...SHELF_GUNS, ...GUNS_COMMON, ...GUNS_RARE, ...PARTS]) assert.ok(shelf.has(id) !== found.has(id), `${id}: on the shelf or found in a raid, not both`);
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
        totals.rifles += world.filter(i => isFoundGun(i.id)).length; totals.crated += crated.filter(i => isFoundGun(i.id)).length;
    }
    assert.ok(totals.rifles > 0 && totals.crated > 0 && totals.parts > 0, JSON.stringify(totals));
});

test('corpses: a legacy enemy keeps its old roll; now and then a gun or valuable drop is a part instead, rare only on an elite, never a gun', () => {
    const seen = new Set<string>();
    // 63 common parts since #28 M3-06: enough corpses for each to turn up.
    for (let seed = 1; seed <= 12000; seed++) for (const elite of [false, true]) {
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
