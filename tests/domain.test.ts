import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEMS, SAVE_KEY, QUESTS, STASH_UPGRADE_COST, STASH_W, STASH_ROWS, STASH_UPGRADED_ROWS, createInventory, addItem, moveItem, transferItem,
  removeItem, count, weight, fits, newSave, migrateSave, beginRun,
  checkpointSafe, settleRun, recoverInterrupted, grantRelief, liquidValue, buyQuantity, equip, unequip, equipRun,
  submitQuest, upgradeStash, reloadMagazine, applyDamage, seededRandom, rollLoot,
} from '../src/domain';
import * as S from '../src/shop';
import { factoryState } from '../src/gunsmith/instance';

/** An equipped slot holding a factory `weapon` (or nothing for null and the knife), as the gun readers take it. */
const held = (weapon: string | null) => weapon && weapon !== 'knife'
  ? { weapon, weaponUid: `held-${weapon}`, gun: factoryState(), relief: false } : { weapon, weaponUid: null, gun: null, relief: false };

test('20 original items, 10 production/RPG items and the gunsmith items have coherent footprints, stacks and prices', () => {
  const original = ['knife', 'pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'bandage', 'medkit', 'antidote', 'water', 'food', 'scrap', 'wire', 'fuse', 'battery', 'watch', 'pearl', 'sample', 'ledger'];
  const production = ['cloth', 'analgesic', 'focus', 'strengthDose', 'constitutionDose', 'techniqueDose', 'luckyCharm', 'unluckyCharm', 'luckySachet', 'unluckySachet'];
  // #28 M2-01 and M2-02: G17, M4A1 and the 20 sample attachments; M3-01 and M3-02: the wave-one seven guns and forty parts;
  // wave two's P0, early: the AUG and six parts; M3-05 and M3-06: the other seven guns, their three ammunition groups
  // and the other 34 parts (tests/gunsmith-items.test.ts ties them to the catalog).
  const gunsmith = ['gb17', 'mb4a1', 'O01', 'O03', 'O08', 'M03', 'M06', 'B01', 'B08', 'H01', 'H05', 'S01', 'S02', 'P01', 'P02', 'F01', 'F03', 'G01', 'G10', 'T01', 'T05', 'A07',
    'pb226', 'mpb5', 'vb9', 'mb870', 'mb1014', 'akb74', 'akb103',
    'A01', 'A02', 'A04', 'A05', 'A06', 'A08', 'B03', 'B05', 'B06', 'B07', 'B09', 'H02', 'H03', 'H04', 'H06', 'H07', 'H08', 'H09', 'S03', 'S04', 'S05', 'S07', 'S08',
    'P03', 'P04', 'P06', 'P07', 'G03', 'G06', 'G07', 'G08', 'G09', 'M01', 'M02', 'M05', 'M07', 'M10', 'M11', 'T04', 'T08',
    'augb', 'O05', 'O10', 'F04', 'F07', 'T02', 'T10',
    'mb1911', 'umpb45', 'pb90', 'svdb', 'mb14', 'mb700', 'rpkb', 'ammo45', 'ammoPDW', 'ammoHeavy',
    'O02', 'O04', 'O06', 'O07', 'O09', 'O11', 'O12', 'M04', 'M08', 'M09', 'M12', 'B02', 'B04', 'B10', 'H10', 'S06', 'S09', 'S10', 'P05', 'P08',
    'F02', 'F05', 'F06', 'F08', 'G02', 'G04', 'G05', 'G11', 'G12', 'T03', 'T06', 'T07', 'T09', 'A03',
    // M4-07: the factory magazines that come off at the workbench.
    'mpb5-mag', 'umpb45-mag', 'akb74-mag', 'akb103-mag', 'mb4a1-mag', 'augb-mag', 'mb14-mag', 'rpkb-mag'];
  assert.equal(original.length, 20); assert.equal(production.length, 10); assert.equal(gunsmith.length, 128);
  assert.deepEqual(new Set(Object.keys(ITEMS)), new Set([...original, ...production, ...gunsmith]));
  assert.equal(Object.keys(ITEMS).length, 158);
  for (const def of Object.values(ITEMS)) {
    assert.ok(def.w > 0 && def.h > 0 && def.stack > 0);
    if (def.buy) assert.ok(def.sell <= def.buy);
  }
});

test('placement respects width, bounds and collisions; rotations are not implicit', () => {
  const inv = createInventory(2, 2);
  assert.equal(addItem(inv, 'shotgun'), 1);
  assert.equal(addItem(inv, 'water'), 0);
  assert.equal(fits(inv, 'pistol', 0, 1), false);
  assert.equal(moveItem(inv, inv.items[0].uid, 1, 0), true);
  assert.equal(moveItem(inv, inv.items[0].uid, 2, 0), false);
  assert.equal(moveItem(inv, inv.items[0].uid, 0.5, 0), false);
  assert.equal(addItem(inv, 'bandage', 8), 0);
  assert.equal(addItem(inv, 'bandage'), 1);
});

test('stacking and weight use per-unit definitions and preserve relief provenance', () => {
  const inv = createInventory(6, 5);
  addItem(inv, 'ammo9', 39);
  addItem(inv, 'ammo9', 5);
  assert.deepEqual(inv.items.map(i => i.qty), [40, 4]);
  addItem(inv, 'ammo9', 12, true);
  assert.equal(inv.items.length, 3);
  assert.equal(weight(inv), 0.672);
  assert.equal(removeItem(inv, 'ammo9', 57), false);
  assert.equal(count(inv, 'ammo9'), 56);
  assert.equal(removeItem(inv, 'ammo9', 42), true);
  assert.equal(count(inv, 'ammo9'), 14);
});

test('transfers are all-or-nothing, including partially fillable stacks', () => {
  const source = createInventory(2, 2), target = createInventory(1, 1);
  addItem(source, 'ammo9', 12);
  addItem(target, 'ammo9', 36);
  const before = JSON.stringify([source, target]);
  assert.equal(transferItem(source, target, source.items[0].uid), false);
  assert.equal(JSON.stringify([source, target]), before);
  removeItem(target, 'ammo9', 8);
  assert.equal(transferItem(source, target, source.items[0].uid, 0, 0), true);
  assert.equal(source.items.length, 0);
  assert.equal(count(target, 'ammo9'), 40);
});

test('moving a complete stack onto a compatible stack merges it', () => {
  const inv = createInventory(2, 1);
  addItem(inv, 'bandage', 5);
  inv.items[0].qty = 2;
  assert.equal(moveItem(inv, inv.items[1].uid, 0, 0), true);
  assert.equal(inv.items.length, 1);
  assert.equal(inv.items[0].qty, 3);
});

test('equipping swaps safely and returns the gun to storage on unequip', () => {
  const save = newSave();
  addItem(save.stash, 'shotgun');
  const gun = save.stash.items.find(i => i.id === 'shotgun')!;
  assert.equal(equip(save, gun.uid), true);
  assert.equal(save.equipment.weapon, 'shotgun');
  assert.equal(count(save.stash, 'pistol'), 1);
  assert.equal(unequip(save), true);
  assert.equal(save.equipment.weapon, null);
  assert.equal(count(save.stash, 'shotgun'), 1);
});

test('reload consumes exactly missing rounds and never invents ammunition', () => {
  const bag = createInventory(6, 5);
  addItem(bag, 'ammo9', 10);
  assert.deepEqual(reloadMagazine(held('pistol'), 3, 0, bag), { ammo: 8, ammoRelief: 0 });
  assert.equal(count(bag, 'ammo9'), 5);
  assert.deepEqual(reloadMagazine(held('pistol'), 8, 0, bag), { ammo: 8, ammoRelief: 0 });
  assert.equal(count(bag, 'ammo9'), 5);
  assert.deepEqual(reloadMagazine(held('pistol'), 0, 0, bag), { ammo: 5, ammoRelief: 0 });
  assert.deepEqual(reloadMagazine(held('pistol'), 0, 0, bag), { ammo: 0, ammoRelief: 0 });
  assert.deepEqual(bag.items, []);
  // Only the gun's own ammunition is taken; the knife has none.
  addItem(bag, 'ammo9', 4);
  assert.deepEqual(reloadMagazine(held('shotgun'), 0, 0, bag), { ammo: 0, ammoRelief: 0 });
  assert.deepEqual(reloadMagazine(held('knife'), 0, 0, bag), { ammo: 0, ammoRelief: 0 });
  assert.equal(count(bag, 'ammo9'), 4);
});

test('damage respects armor and clamps at zero without healing', () => {
  assert.equal(applyDamage(100, 27, 7), 80);
  assert.equal(applyDamage(10, 27), 0);
  assert.equal(applyDamage(100, 4, 8), 100);
  assert.equal(applyDamage(100, -20), 100);
});

test('loot and random streams are reproducible and quantities are valid', () => {
  assert.deepEqual(rollLoot(814, 100), rollLoot(814, 100));
  assert.notDeepEqual(rollLoot(814, 100), rollLoot(815, 100));
  const rng = seededRandom(0);
  for (let i = 0; i < 1000; i++) { const n = rng(); assert.ok(n >= 0 && n < 1); }
  assert.deepEqual(rollLoot(9, 2, []), []);
  assert.deepEqual(rollLoot(9, 2, [{ id: 'sample', min: 1, max: 1, weight: 1 }]), [{ id: 'sample', qty: 1 }, { id: 'sample', qty: 1 }]);
});

test('begin commits gear out of save and extract restores it exactly once', () => {
  const save = newSave(), stash = JSON.stringify(save.stash);
  const loadout = beginRun(save, 123);
  assert.equal(save.bag.items.length, 0);
  assert.equal(save.equipment.weapon, null);
  assert.throws(() => beginRun(save, 456));
  addItem(loadout.bag, 'watch');
  addItem(loadout.safe, 'pearl');
  const summary = settleRun(save, loadout, 'extract', 3)!;
  assert.equal(summary.outcome, 'extract');
  assert.equal(count(save.bag, 'watch'), 1);
  assert.equal(count(save.safe, 'pearl'), 1);
  assert.equal(save.equipment.weapon, 'pistol');
  assert.equal(JSON.stringify(save.stash), stash);
  assert.equal(save.stats.extracts, 1);
  assert.equal(save.stats.kills, 3);
  const before = JSON.stringify(save);
  assert.equal(settleRun(save, loadout, 'extract', 3), null);
  assert.equal(JSON.stringify(save), before);
});

for (const outcome of ['death', 'timeout'] as const) test(`${outcome} loses carried gear and preserves the 2×2 safe`, () => {
  const save = newSave(), stash = JSON.stringify(save.stash);
  const loadout = beginRun(save, 75);
  addItem(loadout.bag, 'watch');
  addItem(loadout.safe, 'sample');
  const result = settleRun(save, loadout, outcome, 2)!;
  assert.equal(save.equipment.weapon, null);
  assert.equal(save.bag.items.length, 0);
  assert.equal(count(save.safe, 'sample'), 1);
  assert.equal(JSON.stringify(save.stash), stash);
  assert.ok(result.lostValue >= 240);
  assert.equal(save.activeRun, null);
});

test('storage round trip and interrupted run keep checkpointed safe without duplicating loadout', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const save = newSave(), loadout = beginRun(save, 17);
  addItem(loadout.safe, 'pearl');
  checkpointSafe(save, loadout.safe);
  storage.setItem(SAVE_KEY, JSON.stringify(save));
  assert.ok(data.has(SAVE_KEY));
  const restored = migrateSave(JSON.parse(storage.getItem(SAVE_KEY)!));
  assert.equal(recoverInterrupted(restored)?.recovered, true);
  assert.equal(count(restored.safe, 'pearl'), 1);
  assert.equal(restored.bag.items.length, 0);
  assert.equal(restored.equipment.weapon, null);
  assert.equal(recoverInterrupted(restored), null);
  assert.equal(settleRun(restored, loadout, 'extract', 0), null);
});

test('stale settlement cannot resolve a newer run, even with the same seed', () => {
  const save = newSave(), first = beginRun(save, 1);
  settleRun(save, first, 'extract', 0);
  const second = beginRun(save, 1);
  assert.equal(settleRun(save, first, 'extract', 99), null);
  assert.ok(save.activeRun);
  assert.ok(settleRun(save, second, 'extract', 0));
});

test('three completed runs and refreshes persist progress with no multiplication', () => {
  let save = newSave();
  for (let round = 0; round < 3; round++) {
    const loadout = beginRun(save, 100 + round);
    addItem(loadout.safe, 'pearl');
    settleRun(save, loadout, 'extract', round);
    save = migrateSave(JSON.parse(JSON.stringify(save)));
  }
  assert.equal(save.stats.runs, 3);
  assert.equal(save.stats.extracts, 3);
  assert.equal(save.stats.kills, 3);
  assert.equal(count(save.safe, 'pearl'), 3);
  assert.equal(count(save.bag, 'ammo9'), 32);
});

test('relief is conditional, cannot be repeatedly claimed and cannot be sold', () => {
  const save = newSave();
  save.cash = 199;
  save.equipment.weapon = null;
  save.bag = createInventory(6, 5);
  assert.equal(grantRelief(save), true);
  assert.equal(save.equipment.weapon, 'pistol');
  assert.equal(save.equipment.relief, true);
  assert.equal(count(save.bag, 'ammo9'), 12);
  assert.equal(count(save.bag, 'bandage'), 1);
  assert.equal(grantRelief(save), false);
  assert.ok(save.bag.items.every(i => i.relief));
  assert.equal(unequip(save), true);
  const pistol = save.stash.items.find(i => i.id === 'pistol')!;
  assert.match(S.shopPlacementError(S.createCart(save, 'arms'), 'stash', 'sell', pistol.uid, 0, 0)!, /不可出售/);
  assert.equal(grantRelief(save), false);
  assert.equal(equip(save, pistol.uid), true);
  assert.equal(save.equipment.relief, true);
});

test('a gun inside the safe prevents relief duplication after save recovery', () => {
  let save = newSave();
  save.cash = 0;
  save.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
  save.bag = createInventory(6, 5);
  assert.equal(grantRelief(save), true);
  assert.equal(unequip(save), true);
  const gun = save.stash.items.find(i => i.id === 'pistol')!;
  assert.equal(transferItem(save.stash, save.safe, gun.uid), true);
  assert.equal(grantRelief(save), false);
  const run = beginRun(save, 700);
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.ok(recoverInterrupted(save));
  assert.equal(count(save.safe, 'pistol'), 1);
  assert.equal(save.safe.items[0].relief, true);
  assert.equal(save.equipment.weapon, null);
  assert.equal(count(save.bag, 'ammo9'), 0);
  assert.equal(grantRelief(save), false);
  assert.equal(settleRun(save, run, 'extract', 9), null);
});

test('recovering and persisting a failed poor run grants exactly one relief kit', () => {
  let save = newSave();
  save.cash = 0;
  beginRun(save, 701);
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.ok(recoverInterrupted(save));
  assert.equal(save.equipment.relief, true);
  assert.equal(count(save.bag, 'ammo9'), 12);
  assert.equal(count(save.bag, 'bandage'), 1);
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.equal(recoverInterrupted(save), null);
  assert.equal(grantRelief(save), false);
  assert.equal(count(save.bag, 'ammo9'), 12);
  assert.equal(count(save.bag, 'bandage'), 1);
});

test('removing an item from safe and checkpointing cannot resurrect it on refresh', () => {
  let save = newSave();
  addItem(save.safe, 'pearl');
  const run = beginRun(save, 702);
  const pearl = run.safe.items.find(i => i.id === 'pearl')!;
  assert.equal(transferItem(run.safe, run.bag, pearl.uid), true);
  checkpointSafe(save, run.safe);
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  recoverInterrupted(save);
  assert.equal(count(save.safe, 'pearl'), 0);
  assert.equal(count(save.bag, 'pearl'), 0);
});

test('quest submission consumes across inventories atomically and rewards once', () => {
  const save = newSave();
  addItem(save.stash, 'scrap', 2);
  addItem(save.bag, 'scrap', 1);
  addItem(save.safe, 'wire', 2);
  const before = JSON.stringify(save);
  assert.equal(submitQuest(save, 'repair'), false);
  assert.equal(JSON.stringify(save), before);
  addItem(save.stash, 'fuse');
  const cash = save.cash;
  assert.equal(submitQuest(save, 'repair'), true);
  assert.equal(save.cash, cash + QUESTS.repair.reward);
  assert.equal(count(save.bag, 'scrap') + count(save.stash, 'scrap'), 0);
  assert.equal(count(save.safe, 'wire'), 0);
  assert.equal(submitQuest(save, 'repair'), false);
  assert.equal(upgradeStash(save), true);
  assert.equal(save.cash, cash + QUESTS.repair.reward - STASH_UPGRADE_COST);
  assert.equal(save.stash.h, STASH_UPGRADED_ROWS);
  assert.equal(upgradeStash(save), false);
  for (const id of ['sample', 'ledger']) {
    addItem(save.stash, id);
    assert.equal(submitQuest(save, id), true);
    assert.equal(save.quests[id], true);
  }
});

test('version-zero inventory upgrades; corrupt and unknown fields cannot inject items', () => {
  const save = migrateSave({ version: 0, cash: 32, inventory: [{ id: 'bandage', quantity: 2 }], settings: { volume: 8 } });
  assert.equal(save.version, 3);
  assert.equal(save.cash, 32);
  assert.equal(count(save.stash, 'bandage'), 2);
  assert.equal(save.settings.volume, 1);
  const bad = migrateSave({ version: 1, cash: -99, stash: { items: [{ id: 'not-an-item', qty: 1 }, { id: 'ammo9', qty: -2 }, { id: 'water', qty: 1, x: 0, y: 0 }, { id: 'water', qty: 1, x: 0, y: 0 }] }, equipment: { weapon: '__proto__' }, settings: { volume: NaN }, quests: { repair: 'true' } });
  assert.equal(bad.cash, 0);
  assert.equal(bad.equipment.weapon, null);
  assert.equal(bad.quests.repair, false);
  assert.equal(bad.settings.volume, 0.35);
  assert.equal(count(bad.stash, 'water'), 2);
  assert.equal(count(bad.stash, 'ammo9'), 0);
  assert.equal(migrateSave(null).version, 3);
  assert.equal(migrateSave({ version: 99 }).version, 3);
});

test('mixed magazines load relief rounds first without changing ordinary ammo provenance', () => {
  const bag = createInventory(6, 5);
  addItem(bag, 'ammo9', 10);
  addItem(bag, 'ammo9', 3, true);
  const result = reloadMagazine(held('pistol'), 2, 1, bag);
  assert.deepEqual(result, { ammo: 8, ammoRelief: 4 });
  assert.equal(count(bag, 'ammo9'), 7);
  assert.equal(bag.items.every(i => !i.relief), true);
  assert.deepEqual(reloadMagazine(held('pistol'), result.ammo, result.ammoRelief, bag), result);
  assert.equal(count(bag, 'ammo9'), 7);
});

test('a full bag and full stash do not lose loaded rounds on extraction or refresh', () => {
  let save = newSave();
  save.bag = createInventory(6, 5);
  save.stash = createInventory(STASH_W, STASH_ROWS);
  addItem(save.bag, 'watch', 60);
  addItem(save.stash, 'watch', STASH_W * STASH_ROWS * ITEMS.watch.stack);
  save.equipment.ammo = 8;
  save.equipment.ammoRelief = 3;
  const run = beginRun(save, 808);
  assert.equal(save.equipment.ammo, 0);
  assert.equal(run.ammo, 8);
  assert.equal(run.ammoRelief, 3);
  // The first round fired is relief ammunition.
  run.ammo--;
  run.ammoRelief--;
  assert.ok(settleRun(save, run, 'extract', 0));
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.equal(save.equipment.ammo, 7);
  assert.equal(save.equipment.ammoRelief, 2);
  assert.equal(count(save.bag, 'watch'), 60);
  assert.equal(count(save.stash, 'watch'), STASH_W * STASH_ROWS * ITEMS.watch.stack);
  assert.equal(count(save.bag, 'ammo9'), 0);
  const next = beginRun(save, 809);
  assert.equal(next.ammo, 7);
  assert.equal(next.ammoRelief, 2);
  settleRun(save, next, 'death', 0);
  assert.equal(save.equipment.ammo, 0);
  assert.equal(save.equipment.ammoRelief, 0);
});

test('equipment swaps reject insufficient unloading space without losing gun or ammo', () => {
  const save = newSave();
  save.stash = createInventory(3, 1);
  addItem(save.stash, 'shotgun');
  save.equipment.ammo = 8;
  save.equipment.ammoRelief = 2;
  const before = JSON.stringify(save);
  assert.equal(equip(save, save.stash.items[0].uid), false);
  assert.equal(JSON.stringify(save), before);
  save.stash = createInventory(2, 1);
  const beforeUnequip = JSON.stringify(save);
  assert.equal(unequip(save), false);
  assert.equal(JSON.stringify(save), beforeUnequip);
});

test('full inventories queue one relief kit, persist it, and deliver only when room opens', () => {
  let save = newSave();
  save.cash = 0;
  save.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
  save.bag = createInventory(6, 5);
  save.stash = createInventory(STASH_W, STASH_ROWS);
  addItem(save.bag, 'watch', 60);
  addItem(save.stash, 'watch', STASH_W * STASH_ROWS * ITEMS.watch.stack);
  assert.equal(grantRelief(save), true);
  assert.equal(save.equipment.weapon, 'pistol');
  assert.equal(save.equipment.relief, true);
  assert.deepEqual(save.reliefSupplies, [{ id: 'ammo9', qty: 12 }, { id: 'bandage', qty: 1 }]);
  assert.equal(grantRelief(save), false);
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.equal(grantRelief(save), false);
  assert.equal(count(save.bag, 'watch'), 60);
  assert.equal(count(save.stash, 'watch'), STASH_W * STASH_ROWS * ITEMS.watch.stack);
  removeItem(save.bag, 'watch', 2);
  assert.equal(grantRelief(save), true);
  assert.equal(count(save.bag, 'ammo9'), 12);
  assert.deepEqual(save.reliefSupplies, [{ id: 'bandage', qty: 1 }]);
  removeItem(save.bag, 'watch', 2);
  assert.equal(grantRelief(save), true);
  assert.equal(count(save.bag, 'bandage'), 1);
  assert.equal(save.reliefSupplies, undefined);
  assert.equal(grantRelief(save), false);
  assert.equal(save.bag.items.filter(i => i.id !== 'watch').every(i => i.relief), true);
});

test('relief can use stash space while a full bag remains unchanged', () => {
  const save = newSave();
  save.cash = 0;
  save.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
  save.bag = createInventory(6, 5);
  save.stash = createInventory(STASH_W, STASH_ROWS);
  addItem(save.bag, 'watch', 60);
  assert.equal(grantRelief(save), true);
  assert.equal(count(save.bag, 'watch'), 60);
  assert.equal(count(save.stash, 'ammo9'), 12);
  assert.equal(count(save.stash, 'bandage'), 1);
  assert.equal(save.stash.items.every(i => i.relief), true);
  assert.equal(save.reliefSupplies, undefined);
});

// Issue #26 F12/F04: relief also covers the S1-S3 soft locks found in the scout report.
function brokeSave(cash: number) {
  const save = newSave();
  save.cash = cash;
  save.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
  save.bag = createInventory(6, 5);
  save.stash = createInventory(STASH_W, STASH_ROWS);
  save.safe = createInventory(2, 2);
  return save;
}
const kitDelivered = (save: ReturnType<typeof newSave>) =>
  save.equipment.weapon === 'pistol' && save.equipment.relief && count(save.bag, 'ammo9') === 12 && count(save.bag, 'bandage') === 1
  && save.bag.items.every(i => i.relief) && save.reliefSupplies === undefined;

test('S1: a gunless player who cannot buy a pistol even after selling everything gets the kit', () => {
  for (const cash of [0, 199, 200, 250, 319]) {
    const save = brokeSave(cash);
    assert.equal(grantRelief(save), true, `cash ${cash}`);
    assert.ok(kitDelivered(save), `cash ${cash}`);
    assert.equal(save.cash, cash);
    assert.equal(grantRelief(save), false, `cash ${cash} repeat`);
  }
  // The new boundary is the pistol price, derived from the item data.
  const rich = brokeSave(ITEMS.pistol.buy), before = JSON.stringify(rich);
  assert.equal(grantRelief(rich), false);
  assert.equal(JSON.stringify(rich), before);
  // Sellable goods count: 250 cash plus a watch can buy a pistol after one sale.
  const watch = brokeSave(250);
  addItem(watch.stash, 'watch');
  assert.equal(liquidValue(watch), 250 + ITEMS.watch.sell);
  assert.equal(grantRelief(watch), false);
  assert.equal(watch.equipment.weapon, null);
  // The old cash < 200 rule still applies on its own, so the rule is never stricter than before.
  const old = brokeSave(150);
  addItem(old.stash, 'watch');
  assert.equal(grantRelief(old), true);
  assert.equal(old.equipment.relief, true);
});

test('S1: relief goods and copies an unfinished quest still needs are not counted as sellable', () => {
  const sample = brokeSave(250);
  addItem(sample.stash, 'sample');
  assert.equal(liquidValue(sample), 250);
  assert.equal(grantRelief(sample), true);
  const done = brokeSave(250);
  addItem(done.stash, 'sample');
  done.quests.sample = true;
  assert.equal(liquidValue(done), 250 + ITEMS.sample.sell);
  assert.equal(grantRelief(done), false);
  // The repair quest needs 3 pump parts; only surplus copies count, wherever they are kept.
  const parts = brokeSave(250);
  addItem(parts.stash, 'scrap', 2);
  addItem(parts.safe, 'scrap', 2);
  assert.equal(liquidValue(parts), 250 + ITEMS.scrap.sell);
  assert.equal(grantRelief(parts), true);
  const surplus = brokeSave(250);
  addItem(surplus.stash, 'scrap', 5);
  assert.equal(liquidValue(surplus), 250 + 2 * ITEMS.scrap.sell);
  assert.equal(grantRelief(surplus), false);
  const relief = brokeSave(250);
  addItem(relief.stash, 'bandage', 4, true);
  addItem(relief.stash, 'ammo9', 40, true);
  assert.equal(liquidValue(relief), 250);
  assert.equal(grantRelief(relief), true);
  assert.equal(relief.equipment.relief, true);
});

test('S2: a broke player with only a relief pistol and no 9mm anywhere gets 12 relief rounds once', () => {
  const pack = buyQuantity('ammo9') * ITEMS.ammo9.buy;
  const reliefOnly = (cash: number) => {
    const save = brokeSave(cash);
    save.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: true, ammo: 0, ammoRelief: 0 };
    return save;
  };
  const save = reliefOnly(50);
  assert.equal(grantRelief(save), true);
  assert.equal(count(save.bag, 'ammo9'), 12);
  assert.equal(count(save.bag, 'bandage'), 0);
  assert.equal(save.bag.items.every(i => i.relief), true);
  assert.equal(save.reliefSupplies, undefined);
  assert.equal(save.cash, 50);
  assert.equal(grantRelief(save), false);
  assert.equal(count(save.bag, 'ammo9'), 12);
  // Boundary: one pack is ¥84 (12 × ¥7), derived from the shop data.
  assert.equal(pack, 84);
  assert.equal(grantRelief(reliefOnly(pack)), false);
  assert.equal(grantRelief(reliefOnly(pack - 1)), true);
  // Any 9mm round blocks it: loaded, stored (relief or not), or already waiting as relief.
  const loaded = reliefOnly(0);
  loaded.equipment.ammo = 1;
  loaded.equipment.ammoRelief = 1;
  assert.equal(grantRelief(loaded), false);
  const stored = reliefOnly(0);
  addItem(stored.stash, 'ammo9', 1);
  assert.equal(grantRelief(stored), false);
  const storedRelief = reliefOnly(0);
  addItem(storedRelief.safe, 'ammo9', 1, true);
  assert.equal(grantRelief(storedRelief), false);
  const waiting = reliefOnly(0);
  waiting.reliefSupplies = [{ id: 'ammo9', qty: 5 }];
  assert.equal(grantRelief(waiting), true);
  assert.equal(count(waiting.bag, 'ammo9'), 5);
  assert.equal(waiting.reliefSupplies, undefined);
  // An ordinary gun anywhere keeps the old behaviour (no relief), and so does sellable value.
  const ordinary = reliefOnly(0);
  addItem(ordinary.stash, 'shotgun');
  assert.equal(grantRelief(ordinary), false);
  const valuable = reliefOnly(pack - ITEMS.water.sell);
  addItem(valuable.stash, 'water');
  assert.equal(liquidValue(valuable), pack);
  assert.equal(grantRelief(valuable), false);
  const cheap = reliefOnly(pack - ITEMS.water.sell - 1);
  addItem(cheap.stash, 'water');
  assert.equal(grantRelief(cheap), true);
  assert.equal(count(cheap.stash, 'water'), 1);
  assert.equal(count(cheap.bag, 'ammo9'), 12);
  // The relief pistol may be stored rather than equipped.
  const stashed = brokeSave(0);
  addItem(stashed.safe, 'pistol', 1, true);
  assert.equal(grantRelief(stashed), true);
  assert.equal(stashed.equipment.weapon, null);
  assert.equal(count(stashed.bag, 'ammo9'), 12);
  // A kit reissued after death while only a bandage was still waiting now also gets rounds.
  const reissued = brokeSave(0);
  reissued.reliefSupplies = [{ id: 'bandage', qty: 1 }];
  assert.equal(grantRelief(reissued), true);
  assert.ok(kitDelivered(reissued));
});

test('S2 by ammunition group (#28 M3-05): each relief gun is fed one pack of its own rounds', () => {
  // Relief guns are pistols today; a relief UMP45 (forged) shows the rule reads each gun's group, not 9mm.
  const ump = brokeSave(0);
  ump.equipment = { weapon: 'umpb45', weaponUid: 'test-ump', gun: factoryState(), relief: true, ammo: 0, ammoRelief: 0 };
  addItem(ump.stash, 'ammo9', 10); // other rounds do not feed it, and ¥30 does not buy a ¥90 pack
  assert.equal(grantRelief(ump), true);
  assert.equal(count(ump.bag, 'ammo45'), buyQuantity('ammo45'));
  assert.ok(ump.bag.items.filter(i => i.id === 'ammo45').every(i => i.relief));
  assert.equal(grantRelief(ump), false, 'once');
  // A relief pistol and a relief UMP45 with no round of either: a pack of each.
  const both = brokeSave(0);
  both.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: true, ammo: 0, ammoRelief: 0 };
  addItem(both.stash, 'umpb45', 1, true);
  assert.equal(grantRelief(both), true);
  assert.deepEqual([count(both.bag, 'ammo9'), count(both.bag, 'ammo45')], [12, 10]);
  // Waiting relief of any group survives the save codec, a pack at most; anything else is dropped.
  const raw = { ...newSave(), reliefSupplies: [{ id: 'ammo45', qty: 25 }, { id: 'Z99', qty: 4 }, { id: 'ammoHeavy', qty: 3 }, { id: 'bandage', qty: 2 }] };
  assert.deepEqual(migrateSave(raw).reliefSupplies, [{ id: 'ammo45', qty: 10 }, { id: 'ammoHeavy', qty: 3 }, { id: 'bandage', qty: 1 }]);
});

test('S2: extracting broke with an empty relief pistol refills it at the hideout, never inside the raid', () => {
  let save = brokeSave(50);
  save.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: true, ammo: 8, ammoRelief: 8 };
  const run = beginRun(save, 905);
  assert.equal(grantRelief(save), false);
  assert.equal(save.reliefSupplies, undefined);
  assert.equal(count(save.bag, 'ammo9'), 0);
  run.ammo = 0;
  run.ammoRelief = 0;
  assert.ok(settleRun(save, run, 'extract', 0));
  assert.deepEqual(save.equipment, { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: true, ammo: 0, ammoRelief: 0 });
  assert.equal(count(save.bag, 'ammo9'), 12);
  assert.equal(save.bag.items.every(i => i.relief), true);
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.equal(grantRelief(save), false);
  assert.equal(count(save.bag, 'ammo9'), 12);
});

test('S3: selling the last ordinary gun to reach ¥210 grants the kit', () => {
  const save = brokeSave(60);
  save.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: false, ammo: 0, ammoRelief: 0 };
  assert.equal(grantRelief(save), false);
  assert.equal(unequip(save), true);
  assert.equal(grantRelief(save), false);
  const gun = save.stash.items.find(i => i.id === 'pistol')!;
  assert.equal(gun.relief, undefined);
  const cart = S.createCart(save, 'arms');
  assert.ok(S.moveShopItem(cart, 'stash', 'sell', gun.uid, 0, 0));
  assert.deepEqual(S.settleCartResult(save, cart), { ok: true });
  assert.equal(save.cash, 60 + ITEMS.pistol.sell);
  assert.equal(save.cash, 210);
  assert.equal(grantRelief(save), true);
  assert.ok(kitDelivered(save));
  assert.equal(save.cash, 210);
  assert.equal(grantRelief(save), false);
});

test('rule B rounds wait once when the bag and stash are full and arrive when space opens', () => {
  let save = brokeSave(0);
  save.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: true, ammo: 0, ammoRelief: 0 };
  // Unsellable relief bandages fill every cell without adding sellable value.
  assert.equal(addItem(save.bag, 'bandage', 120, true), 0);
  assert.equal(addItem(save.stash, 'bandage', STASH_W * STASH_ROWS * ITEMS.bandage.stack, true), 0);
  assert.equal(liquidValue(save), 0);
  assert.equal(grantRelief(save), true);
  assert.deepEqual(save.reliefSupplies, [{ id: 'ammo9', qty: 12 }]);
  assert.equal(count(save.bag, 'ammo9') + count(save.stash, 'ammo9'), 0);
  for (let i = 0; i < 3; i++) assert.equal(grantRelief(save), false);
  assert.deepEqual(save.reliefSupplies, [{ id: 'ammo9', qty: 12 }]);
  save = migrateSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(save.reliefSupplies, [{ id: 'ammo9', qty: 12 }]);
  assert.equal(grantRelief(save), false);
  assert.equal(removeItem(save.bag, 'bandage', 4), true);
  assert.equal(grantRelief(save), true);
  assert.equal(count(save.bag, 'ammo9'), 12);
  assert.equal(count(save.stash, 'ammo9'), 0);
  assert.equal(save.reliefSupplies, undefined);
  assert.equal(save.bag.items.every(i => i.relief), true);
  assert.equal(grantRelief(save), false);
  assert.equal(count(save.bag, 'ammo9'), 12);
});

test('migration normalizes magazine bounds and unique item IDs across every container', () => {
  const same = { id: 'ammo9', uid: 'duplicated', qty: 1, x: 0, y: 0 };
  const save = migrateSave({ version: 1, stash: { items: [same] }, bag: { items: [same] }, safe: { items: [same] }, equipment: { weapon: 'pistol', ammo: 999, ammoRelief: 999 } });
  const all = [...save.stash.items, ...save.bag.items, ...save.safe.items];
  assert.equal(all.length, 3);
  assert.equal(new Set(all.map(i => i.uid)).size, 3);
  // The old profile's equipped pistol becomes a factory instance under the migration's uid (gunsmith M0-06).
  assert.deepEqual(save.equipment, { weapon: 'pistol', relief: false, ammo: 8, ammoRelief: 8, weaponUid: 'gun-v6', gun: factoryState() });
  const legacy = migrateSave({ version: 1, equipment: { weapon: 'carbine', relief: false } });
  assert.equal(legacy.equipment.ammo, 0);
  assert.equal(legacy.equipment.ammoRelief, 0);
  const noGun = migrateSave({ version: 1, equipment: { weapon: null, ammo: 3, ammoRelief: 2 } });
  assert.equal(noGun.equipment.ammo, 0);
  assert.equal(noGun.equipment.ammoRelief, 0);
});

test('stale safe checkpoints cannot alter the current run and legacy active runs cannot settle', () => {
  const save = newSave(), first = beginRun(save, 900);
  settleRun(save, first, 'extract', 0);
  const second = beginRun(save, 901);
  addItem(first.safe, 'pearl');
  checkpointSafe(save, first.safe, first.runId);
  assert.equal(count(save.safe, 'pearl'), 0);
  addItem(second.safe, 'sample');
  checkpointSafe(save, second.safe, second.runId);
  assert.equal(count(save.safe, 'sample'), 1);
  const legacy = migrateSave({ ...save, activeRun: { seed: 901 } });
  assert.equal(settleRun(legacy, first, 'extract', 0), null);
  assert.ok(recoverInterrupted(legacy));
});

test('raid gun swaps unload a mixed magazine with both ammo origins preserved', () => {
  const save = newSave();
  save.bag = createInventory(6, 5);
  save.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: true, ammo: 8, ammoRelief: 3 };
  addItem(save.bag, 'carbine');
  addItem(save.safe, 'pistol');
  const run = beginRun(save, 903), beforeSafe = JSON.stringify(run.safe);
  assert.equal(equipRun(run, run.safe.items[0].uid), false);
  assert.equal(equipRun(run, run.bag.items.find(i => i.id === 'carbine')!.uid), true);
  assert.equal(run.weapon, 'carbine');
  assert.equal(run.relief, false);
  assert.equal(run.ammo, 0);
  assert.equal(run.ammoRelief, 0);
  assert.equal(run.bag.items.find(i => i.id === 'pistol')!.relief, true);
  assert.equal(run.bag.items.find(i => i.id === 'ammo9' && !i.relief)!.qty, 5);
  assert.equal(run.bag.items.find(i => i.id === 'ammo9' && i.relief)!.qty, 3);
  assert.equal(JSON.stringify(run.safe), beforeSafe);
});

test('#26 F15: a raid gun swap can take the gun from a container, never from the safe, and refuses atomically', () => {
  const save = newSave();
  save.bag = createInventory(6, 5);
  save.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: false, ammo: 6, ammoRelief: 0 };
  addItem(save.safe, 'pistol');
  const run = beginRun(save, 905), box = createInventory(6, 5);
  box.items.push({ uid: 'crate-carbine', id: 'carbine', qty: 1, x: 0, y: 0, gun: factoryState() }, { uid: 'crate-water', id: 'water', qty: 1, x: 4, y: 0 });
  const safeBefore = JSON.stringify(run.safe);
  assert.equal(equipRun(run, run.safe.items[0].uid, run.safe), false, 'the safe is not a source');
  assert.equal(equipRun(run, 'crate-water', box), false, 'only a gun');
  assert.equal(equipRun(run, run.safe.items[0].uid, box), false, 'the uid must be in the given container');
  assert.equal(equipRun(run, 'crate-carbine', box), true);
  assert.deepEqual(box.items.map(i => i.uid), ['crate-water']);
  assert.equal(run.weapon, 'carbine'); assert.equal(run.weaponUid, 'crate-carbine'); assert.equal(run.ammo, 0);
  assert.equal(run.bag.items.find(i => i.id === 'pistol')!.uid, 'test-gun');
  assert.equal(count(run.bag, 'ammo9'), 6);
  assert.equal(JSON.stringify(run.safe), safeBefore);
  // A full backpack has no room for the carbine: container and loadout stay exactly as they were.
  addItem(run.bag, 'watch', 54);
  const shotgunBox = createInventory(6, 5);
  shotgunBox.items.push({ uid: 'crate-shotgun', id: 'shotgun', qty: 1, x: 0, y: 0, gun: factoryState() });
  const before = JSON.stringify([run, shotgunBox]);
  assert.equal(equipRun(run, 'crate-shotgun', shotgunBox), false);
  assert.equal(JSON.stringify([run, shotgunBox]), before);
});

test('a full raid backpack rejects a loaded gun swap atomically', () => {
  const save = newSave();
  save.bag = createInventory(6, 5);
  addItem(save.bag, 'shotgun');
  addItem(save.bag, 'watch', 54);
  save.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), relief: false, ammo: 8, ammoRelief: 4 };
  const run = beginRun(save, 904), before = JSON.stringify(run);
  assert.equal(equipRun(run, run.bag.items.find(i => i.id === 'shotgun')!.uid), false);
  assert.equal(JSON.stringify(run), before);
});
