import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { ATTACHMENTS, BRAND_NAMES, GUNS, PREMIUM_BASES, isPremium, partTier, type GunId } from '../src/gunsmith/catalog';
import { checkInstall } from '../src/gunsmith/compat';
import { craftPremium, premiumBases, premiumBlanks, premiumLock, premiumPrice, PREMIUM_BLANK, PREMIUM_BLANKS, PREMIUM_IDS } from '../src/gunsmith/premium';
import { sourceOf } from '../src/gunsmith/bench';
import { newExpansion, validateExpansion, type ExpansionState } from '../src/expansion-state';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { armamentOf, ARMORY, leaderBlank, ARMED_LEADERS } from '../src/enemy-armory';
import { buildingRunConfig } from '../src/building-world';
import { createSessionState, SaveSession } from '../src/session';
import { damageLayerEnemy } from '../src/layer-transition';
import { TILE, WORLD } from '../src/world';
import { behindBase, measured } from '../scripts/build-search';
import { put, yard } from './fixtures/workbench';

// #28 M4-09 (#155, maintainer 2026-10-30): 老栓精工. Twenty parts, each the best of its position, made to order by 老栓
// on the spot from an ordinary part, a 精工件坯 and cash, once the ledger quest is done and the workbench is at level 3.
// No shelf sells them and no raid holds them; the blanks come from leaders' bodies and flooded spots. Rules in
// docs/gunsmith/CONTRACTS.md, 「老栓精工（M4-09）」.

test('the twenty: 老栓精工\'s own tier, each ahead of every part it is made from but in weight, and never free against the factory gun', () => {
    assert.equal(PREMIUM_IDS.length, 20);
    assert.deepEqual([...PREMIUM_IDS].sort(), Object.keys(PREMIUM_BASES).sort());
    for (const id of PREMIUM_IDS) {
        const a = ATTACHMENTS[id];
        assert.deepEqual([BRAND_NAMES[a.brand], partTier(a)], ['老栓精工', 'premium'], id);
        assert.ok(a.buy >= 1500 && a.buy <= 3000 && a.sell < a.buy && premiumPrice(id) === a.buy, `${id}: ${a.buy}`);
        // It costs something on the gun: weight, whatever it is made from.
        assert.ok(a.mods.weight > 0, `${id}: weighs something on the gun`);
        for (const base of PREMIUM_BASES[id]) {
            const b = ATTACHMENTS[base];
            assert.ok(!isPremium(base) && b.mount === a.mount && b.cat === a.cat, `${id} from ${base}: an ordinary part of the same position`);
            // Every gun the base fits, the premium part fits too.
            assert.ok(!b.guns || !!a.guns && b.guns.every(g => a.guns!.includes(g)) || !a.guns, `${id} fits every gun ${base} does`);
            assert.deepEqual(behindBase(id, base), [], `${id} is no worse than ${base} but in weight and length`);
        }
        // Alone on each gun it fits, it changes the gun and still weighs more than nothing.
        for (const gun of Object.keys(GUNS) as GunId[]) {
            const at = checkInstall({ gun, parts: [] }, id);
            if (!at.ok) continue;
            const bare = measured({ gun, parts: [] }), one = measured({ gun, parts: [{ uid: 'x', id, parent: at.at.parent, slot: at.at.slot }] });
            assert.ok(one.kg > bare.kg, `${gun} ${id}: heavier`);
        }
    }
    // Each position a family of guns has gets one: the rails, the muzzles of every family but the .45 and the P90, and
    // the AR's and AK's stock, grip and handguard.
    assert.deepEqual(PREMIUM_IDS.map(id => ATTACHMENTS[id].mount).sort(), ['grip', 'grip', 'grip', 'handguard', 'handguard', 'micro', 'muzzle', 'muzzle', 'muzzle', 'muzzle',
        'side', 'stock', 'stock', 'stock', 'stock', 'stock', 'stock', 'top', 'top', 'under']);
});

test('never on a shelf, never found, never on an enemy\'s gun; the workbench says to have it made', () => {
    const all = { quests: { repair: true, sample: true, ledger: true }, stats: { runs: 0, extracts: 0, kills: 0 } };
    for (let runs = 0; runs < 200; runs++) { all.stats.runs = runs; assert.ok(!D.armsStock(all).some(isPremium), `run ${runs}`); }
    assert.ok(!D.MERCHANTS.arms.stock.some(isPremium) && !D.MERCHANTS.med.stock.some(isPremium) && !D.MERCHANTS.arms.stock.includes(PREMIUM_BLANK));
    for (let seed = 1; seed <= 600; seed++) {
        const config = buildingRunConfig(seed);
        assert.ok(![...config.loot, ...config.containers.flatMap(c => c.items)].some(r => isPremium(r.id)), `seed ${seed}`);
        for (const elite of [false, true]) assert.ok(!D.corpseLoot(seed, 3, elite).some(r => isPremium(r.id) || r.id === PREMIUM_BLANK), `seed ${seed}`);
        for (const id of ARMED_LEADERS) {
            const arms = armamentOf(seed, id, `enemy-${seed}`)!, ids = (nodes: { id: string; children: unknown[] }[]): string[] => nodes.flatMap(n => [n.id, ...ids(n.children as never)]);
            assert.ok(!ids(arms.fit).some(isPremium), `${id} seed ${seed}`);
        }
    }
    for (const id of PREMIUM_IDS) assert.equal(sourceOf(id, all), `只能找老栓定制 · ¥ ${premiumPrice(id)}，另交一件底料和精工件坯`);
    assert.ok(Object.keys(ARMORY).length > 0);
});

/** A profile and an expansion at the base, with the ledger done and the workbench at `level`, stocked by `stock`. */
function base(level: number, stock: (p: D.SaveDataV1) => void, ledger = true) {
    const p = D.newSave(), e = newExpansion(1800000000000) as ExpansionState;
    p.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2);
    p.quests.ledger = ledger; p.cash = 5000; e.base.facilities.workbench = level; e.base.location = 'base';
    stock(p);
    return { p, e };
}

test('an order: the cheapest loose base, one blank and the price go, the part comes into the stash; or nothing changes', () => {
    // J01 from O03 (200) rather than O05 (320); the blank from the bag.
    const { p, e } = base(3, p => { put(p.stash, { uid: 'o5', id: 'O05' }); put(p.safe, { uid: 'o3', id: 'O03' }); D.addItem(p.bag, PREMIUM_BLANK, 2); });
    assert.deepEqual(premiumBases(p, 'J01').map(i => i.uid), ['o3', 'o5']);
    assert.equal(premiumLock(p, e), null);
    assert.equal(craftPremium(p, e, 'J01'), null);
    assert.deepEqual([p.cash, premiumBlanks(p), p.safe.items.length, p.stash.items.map(i => i.id).sort()], [5000 - 1600, 1, 0, ['J01', 'O05']]);
    // The refusals, each leaving everything as it was.
    const refused = (level: number, stock: (p: D.SaveDataV1) => void, id: string, why: string, ledger = true, after?: (s: { p: D.SaveDataV1; e: ExpansionState }) => void) => {
        const s = base(level, stock, ledger); after?.(s);
        const before = structuredClone(s.p);
        assert.equal(craftPremium(s.p, s.e, id), why, `${id} ${why}`); assert.deepEqual(s.p, before);
    };
    const stocked = (p: D.SaveDataV1) => { put(p.stash, { uid: 'o3', id: 'O03' }); D.addItem(p.stash, PREMIUM_BLANK, 1); };
    refused(3, stocked, 'J01', 'locked', false);
    refused(2, stocked, 'J01', 'locked');
    refused(3, p => { D.addItem(p.stash, PREMIUM_BLANK, 1); }, 'J01', 'materials');
    refused(3, p => { put(p.stash, { uid: 'o3', id: 'O03' }); }, 'J01', 'materials');
    // A relief base or blank does not count; nor does a base of another position.
    refused(3, p => { put(p.stash, { uid: 'o3', id: 'O03', relief: true }); D.addItem(p.stash, PREMIUM_BLANK, 1); }, 'J01', 'materials');
    refused(3, p => { put(p.stash, { uid: 'o3', id: 'O03' }); D.addItem(p.stash, PREMIUM_BLANK, 1, true); }, 'J01', 'materials');
    refused(3, p => { put(p.stash, { uid: 'f1', id: 'F01' }); D.addItem(p.stash, PREMIUM_BLANK, 1); }, 'J01', 'materials');
    refused(3, p => { stocked(p); p.cash = 1599; }, 'J01', 'funds');
    refused(3, stocked, 'O03', 'rule');
    refused(3, stocked, 'J01', 'rule', true, s => { s.e.base.location = 'raid'; });
    // A full stash: the long part has no room once its base and blank are out of the way.
    refused(3, p => { p.stash = D.createInventory(2, 1); put(p.stash, { uid: 'o3', id: 'O03' }); D.addItem(p.stash, PREMIUM_BLANK, 1); }, 'J02', 'materials');
    refused(3, p => { p.stash = D.createInventory(1, 1); put(p.bag, { uid: 'o8', id: 'O08' }); D.addItem(p.bag, PREMIUM_BLANK, 1); D.addItem(p.stash, 'water', 1); }, 'J02', 'space');
});

test('the yard: an order is one write that reads back, and the stash holds the part', () => {
    const y = yard(p => { p.cash = 4000; put(p.stash, { uid: 'm7', id: 'M07' }); D.addItem(p.stash, PREMIUM_BLANK, 1); p.quests.ledger = true; });
    // Before the workbench is at level 3, 老栓 says why.
    const early = y.runtime.craftPremium('J07');
    assert.deepEqual([early.ok, !early.ok && early.reason], [false, 'locked']);
    const ticket = y.saves.prepareExpansionMutation(d => { d.expansion.base.facilities.workbench = 3; });
    assert.ok(ticket); assert.equal(y.saves.commitExpansionMutation(ticket), 'committed');
    const writes = y.writes;
    assert.ok(y.runtime.craftPremium('J07').ok);
    assert.equal(y.writes, writes + 1);
    const saved = y.record.profile;
    assert.deepEqual([saved.cash, saved.stash.items.map(i => i.id)], [1000, ['J07']]);
    // Nothing left to make it from: refused, no write.
    const again = y.runtime.craftPremium('J07');
    assert.deepEqual([again.ok, !again.ok && again.reason, y.writes], [false, 'materials', writes + 1]);
});

test('blanks: a tenth of the valuables at flooded spots, half the leaders\' bodies; nowhere else', () => {
    let blanks = 0, valuables = 0;
    const flooded = (p: { x: number; y: number }) => WORLD.tiles[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)] === 4;
    for (let seed = 1; seed <= 2000; seed++) {
        const config = buildingRunConfig(seed);
        for (const r of config.loot) if (r.id === PREMIUM_BLANK) { assert.ok(flooded(r) && r.qty === 1, `seed ${seed}`); blanks++; }
        else if (flooded(r) && D.ITEMS[r.id].kind === 'valuable') valuables++;
        assert.ok(!config.containers.some(c => c.items.some(i => i.id === PREMIUM_BLANK)), `seed ${seed}: crates are dry`);
    }
    assert.ok(Math.abs(blanks / (blanks + valuables) - PREMIUM_BLANKS.flooded) < .02, `${blanks} of ${blanks + valuables}`);
    assert.ok(blanks / 2000 > .2 && blanks / 2000 < .45, `${blanks / 2000} a raid`);
    // Leaders: about half, fixed by the seed and the uid; nobody else.
    let held = 0;
    for (let seed = 1; seed <= 2000; seed++) {
        assert.equal(leaderBlank(seed, 'raider-boss', 'enemy-3'), leaderBlank(seed, 'raider-boss', 'enemy-3'));
        if (leaderBlank(seed, 'recovery-leader', `enemy-${seed % 23}`)) held++;
        assert.equal(leaderBlank(seed, 'scout', 'enemy-3'), false);
    }
    assert.ok(Math.abs(held / 2000 - PREMIUM_BLANKS.leader) < .05, `${held}`);
});

test('a leader\'s body holds the blank its seed and uid say, and the raid still checks', () => {
    let seen = 0;
    for (const seed of [13, 14, 23, 24, 33, 34, 43, 44]) {
        const data = new Map<string, string>(), storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
        const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
        assert.ok(saves.initialize()); state.state = 'hideout';
        assert.ok(saves.beginRun(seed, true), `seed ${seed}`);
        const e = state.expansion!, raid = e.raid!;
        for (const [map, layer] of Object.entries(raid.maps)) for (const x of [...layer.enemies].filter(x => ARMED_LEADERS.has(x.id))) {
            damageLayerEnemy(e, map, x, 1e6);
            const corpse = layer.containers.find(c => c.id === `corpse-${x.uid}`)!;
            const has = corpse.inventory.items.some(i => i.id === PREMIUM_BLANK);
            assert.equal(has, leaderBlank(raid.seed, x.id, x.uid), `${x.id} seed ${seed}`);
            if (has) seen++;
        }
        assert.doesNotThrow(() => validateExpansion(structuredClone(e), state.save, null, resolveExpansionWorld), `seed ${seed}`);
    }
    assert.ok(seen > 0, 'some leader held one');
});
