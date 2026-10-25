import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { firstAvailableSlot, moveQuantity, placementError, type LootTransfer } from '../src/loot';
import { organizeStash, transferBagToStash } from '../src/inventory-actions';
import { createSessionState, SaveSession, type ExpansionDraft } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { factoryState } from '../src/gunsmith/instance';

// A gun item is born a factory instance, as D.addItem makes one (record v6).
const item = (uid: string, id: string, x = 0, y = 0, qty = 1, relief = false): D.Item => ({ uid, id, x, y, qty, ...(relief ? { relief: true } : {}), ...D.factoryGun(id) });
const inv = (w: number, h: number, ...items: D.Item[]): D.Inventory => ({ w, h, items });
function contents(...inventories: D.Inventory[]) {
    const totals: Record<string, number> = {};
    for (const entry of inventories.flatMap(value => value.items)) {
        const key = `${entry.id}:${!!entry.relief}`; totals[key] = (totals[key] ?? 0) + entry.qty;
    }
    return Object.entries(totals).sort();
}
function assertPacked(inventory: D.Inventory) {
    for (const entry of inventory.items) assert.ok(D.fits(inventory, entry.id, entry.x, entry.y, entry.uid, !!entry.rotated));
    assert.equal(new Set(inventory.items.map(entry => entry.uid)).size, inventory.items.length);
}
function station(raw?: string) {
    let failed = false, writes = 0;
    const data = new Map<string, string>(); if (raw) data.set(SESSION_KEY, raw);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (failed) throw Error('quota'); data.set(key, value); writes++; } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize()); const runtime = new RealHideoutRuntime(state, saves, () => 1800000000000); assert.ok(runtime.enter().ok);
    const setup = (change: (draft: ExpansionDraft) => void) => {
        const ticket = saves.prepareExpansionMutation(change); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed'); runtime.snapshot();
    };
    return { state, saves, runtime, setup, data, fail: (value = true) => { failed = value; }, get raw() { return data.get(SESSION_KEY)!; }, get writes() { return writes; } };
}

test('whole-item swaps include non-origin drops and preserve UID, quantity and relief in both directions', () => {
    const from = inv(3, 1, item('sample', 'sample', 0, 0, 1, true)), to = inv(3, 1, item('gun', 'shotgun'));
    const before = structuredClone({ from, to }), total = contents(from, to);
    assert.equal(placementError(from, to, 'sample', 1, 0), null); assert.deepEqual({ from, to }, before);
    assert.ok(moveQuantity(from, to, 'sample', 1, 0));
    assert.deepEqual(from.items, [before.to.items[0]]); assert.deepEqual(to.items, [{ ...before.from.items[0], x: 1 }]);
    assert.deepEqual(contents(from, to), total); assertPacked(from); assertPacked(to);
});
test('reciprocal swap tries the target rotation only when its original orientation cannot fit', () => {
    const from = inv(1, 2, item('water', 'water', 0, 0, 2)), to = inv(2, 2, item('pistol', 'pistol'));
    assert.ok(moveQuantity(from, to, 'water', 0, 0));
    assert.equal(from.items[0].uid, 'pistol'); assert.equal(from.items[0].rotated, true);
    assert.equal(to.items[0].uid, 'water'); assert.equal(to.items[0].qty, 2); assertPacked(from); assertPacked(to);
});
test('same-container swap rejects overlapping final footprints and accepts cleared source space', () => {
    const inventory = inv(5, 1, item('gun', 'shotgun'), item('medkit', 'medkit', 3));
    const before = structuredClone(inventory);
    assert.match(placementError(inventory, inventory, 'gun', 1, 0)!, /原位置/);
    assert.equal(moveQuantity(inventory, inventory, 'gun', 1, 0), false); assert.deepEqual(inventory, before);
    assert.ok(moveQuantity(inventory, inventory, 'gun', 2, 0));
    assert.deepEqual(inventory.items, [{ ...before.items[1], x: 0 }, { ...before.items[0], x: 2 }]); assertPacked(inventory);
});
test('multi-item collisions, split swaps, too-small origins and duplicate reciprocal UIDs fail without mutation', () => {
    const scenarios: { from: D.Inventory; to: D.Inventory; uid: string; x?: number; quantity?: number }[] = [
        { from: inv(3, 1, item('gun', 'shotgun')), to: inv(3, 1, item('a', 'sample'), item('b', 'sample', 1)), uid: 'gun' },
        { from: inv(2, 2, item('water', 'water', 0, 0, 2)), to: inv(2, 2, item('gun', 'pistol')), uid: 'water', quantity: 1 },
        { from: inv(1, 1, item('a', 'sample')), to: inv(3, 1, item('gun', 'shotgun')), uid: 'a' },
        { from: inv(3, 1, item('a', 'sample'), item('gun', 'sample', 1)), to: inv(3, 1, item('gun', 'shotgun')), uid: 'a' },
    ];
    for (const { from, to, uid, x = 0, quantity } of scenarios) {
        const before = structuredClone({ from, to });
        assert.equal(moveQuantity(from, to, uid, x, 0, undefined, quantity), false); assert.deepEqual({ from, to }, before);
    }
});
test('compatible partial merges still win; full stacks and mixed relief never fall back to swapping', () => {
    const from = inv(1, 1, item('a', 'ammo9', 0, 0, 10)), to = inv(1, 1, item('b', 'ammo9', 0, 0, 35));
    assert.ok(moveQuantity(from, to, 'a', 0, 0)); assert.equal(from.items[0].qty, 5); assert.equal(to.items[0].qty, 40);
    const before = structuredClone({ from, to }); assert.equal(moveQuantity(from, to, 'a', 0, 0), false); assert.deepEqual({ from, to }, before);
    to.items[0].qty = 30; to.items[0].relief = true;
    assert.match(placementError(from, to, 'a', 0, 0)!, /救济/);
});
test('quick placement uses compatible partial stacks and rotation but never chooses a swap', () => {
    const water = item('a', 'water', 0, 0, 2), occupied = inv(2, 1, { ...item('b', 'water'), rotated: true });
    assert.deepEqual(firstAvailableSlot(occupied, water), { x: 0, y: 0, rotated: true });
    occupied.items[0].qty = 2; assert.equal(firstAvailableSlot(occupied, water), null);
    assert.deepEqual(firstAvailableSlot(inv(2, 1), water), { x: 0, y: 0, rotated: true });
    assert.equal(firstAvailableSlot(inv(2, 1, item('gun', 'pistol')), water), null);
});
test('bulk deposit is all-or-none even after a candidate partially merged a stack', () => {
    const profile = { bag: inv(3, 1, item('ammo', 'ammo9', 0, 0, 10), item('gun', 'pistol', 1)), stash: inv(1, 1, item('stash-ammo', 'ammo9', 0, 0, 35)) };
    const before = structuredClone(profile); assert.equal(transferBagToStash(profile), false); assert.deepEqual(profile, before);
});
test('bulk deposit keeps equipment and safe untouched, preserves remaining UIDs and does not merge relief into ordinary stock', () => {
    const profile = { bag: inv(4, 2, item('ammo', 'ammo9', 0, 0, 10), item('relief', 'ammo9', 1, 0, 12, true), item('gun', 'pistol', 2)), stash: inv(4, 2, item('stash-ammo', 'ammo9', 0, 0, 35)),
        safe: inv(2, 2, item('safe', 'pearl')), equipment: { weapon: 'shotgun', weaponUid: 'eq-shotgun', gun: factoryState(), ammo: 2, ammoRelief: 1, relief: true } };
    const before = structuredClone(profile), total = contents(profile.bag, profile.stash);
    assert.ok(transferBagToStash(profile)); assert.deepEqual(profile.bag.items, []); assert.deepEqual(profile.safe, before.safe); assert.deepEqual(profile.equipment, before.equipment);
    assert.deepEqual(contents(profile.bag, profile.stash), total); assert.equal(profile.stash.items.find(entry => entry.uid === 'ammo')!.qty, 5);
    assert.equal(profile.stash.items.find(entry => entry.uid === 'relief')!.qty, 12); assert.deepEqual(profile.stash.items[0], { ...before.stash.items[0], qty: 40 }); assertPacked(profile.stash);
    const after = structuredClone(profile); assert.ok(transferBagToStash(profile)); assert.deepEqual(profile, after);
});
test('sorting is deterministic, idempotent and quantity-conserving, with distinct relief stacks and retained item fields', () => {
    const stash = inv(6, 4, item('a', 'ammo9', 4, 3, 25), item('b', 'ammo9', 0, 3, 20), item('c', 'ammo9', 1, 3, 12, true),
        { ...item('gun', 'shotgun', 5, 0), rotated: true, provenance: 'kept' } as D.Item, item('water', 'water', 3, 1));
    const profile = { stash }, reversed = { stash: { ...structuredClone(stash), items: [...structuredClone(stash.items)].reverse() } }, total = contents(stash);
    assert.ok(organizeStash(profile)); assert.ok(organizeStash(reversed)); assert.deepEqual(profile, reversed); assert.deepEqual(contents(stash), total); assertPacked(stash);
    assert.equal((stash.items.find(entry => entry.uid === 'gun') as D.Item & { provenance: string }).provenance, 'kept');
    assert.equal(stash.items.find(entry => entry.uid === 'a')!.qty, 40); assert.equal(stash.items.find(entry => entry.uid === 'b')!.qty, 5); assert.equal(stash.items.find(entry => entry.uid === 'c')!.relief, true);
    const sorted = structuredClone(profile); assert.ok(organizeStash(profile)); assert.deepEqual(profile, sorted);
});
test('invalid batch inventories are rejected before changing coordinates, quantities or identities', () => {
    const profile = { stash: inv(1, 1, item('same', 'sample'), item('same', 'sample')), bag: inv(1, 1, item('bag', 'sample')) }, before = structuredClone(profile);
    assert.equal(organizeStash(profile), false); assert.equal(transferBagToStash(profile), false); assert.deepEqual(profile, before);
});
for (const action of ['stashAll', 'sortStash'] as const) test(`${action} rolls back failed storage, retries without duplicating items and survives reload`, () => {
    const f = station(); f.setup(d => {
        d.profile.stash.items = [item('a', 'ammo9', 8, 4, 25), item('b', 'ammo9', 5, 4, 20), item('gun', 'pistol', 0, 3)];
        d.profile.bag.items = [item('bag', 'water', 0, 0, 2), item('bag-relief', 'ammo9', 3, 0, 12, true)];
    });
    const before = structuredClone(f.state.save), raw = f.raw, total = contents(before.stash, before.bag), writes = f.writes;
    f.fail(); const failed = f.runtime[action](); assert.ok(!failed.ok); assert.equal(failed.reason, 'storage');
    assert.deepEqual(f.state.save, before); assert.equal(f.raw, raw); assert.equal(f.writes, writes);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.deepEqual(f.state.save, before);
    assert.ok(f.runtime[action]().ok); assert.deepEqual(contents(f.state.save.stash, f.state.save.bag), total);
    const committed = structuredClone(f.state.save), committedRaw = f.raw, committedWrites = f.writes;
    assert.ok(f.runtime[action]().ok); assert.deepEqual(f.state.save, committed); assert.equal(f.raw, committedRaw); assert.equal(f.writes, committedWrites);
    assert.deepEqual(station(f.raw).state.save, committed); assert.deepEqual(f.state.save.safe, before.safe); assert.deepEqual(f.state.save.equipment, before.equipment);
});
test('station batch actions respect stale-writer and active-raid guards, and insufficient space writes nothing', () => {
    const f = station(); f.setup(d => { d.profile.stash.items = []; D.addItem(d.profile.stash, 'sample', 60); d.profile.bag.items = [item('bag', 'water')]; });
    const before = structuredClone(f.state.save), raw = f.raw, writes = f.writes, failed = f.runtime.stashAll();
    assert.ok(!failed.ok); assert.equal(failed.reason, 'space'); assert.match(failed.message, /全部留在原处/); assert.deepEqual(f.state.save, before); assert.equal(f.raw, raw); assert.equal(f.writes, writes);
    f.saves.markConflict(); for (const action of ['stashAll', 'sortStash'] as const) { const result = f.runtime[action](); assert.ok(!result.ok); assert.equal(result.reason, 'conflict'); }
    const g = station(); assert.ok(g.runtime.deploy({ world: 'coast', seed: 'issue26' }).ok); const raid = g.raw;
    for (const action of ['stashAll', 'sortStash'] as const) { const result = g.runtime[action](); assert.ok(!result.ok); assert.equal(result.reason, 'locked'); }
    assert.equal(g.raw, raid);
});
test('station equipment rejection explains the occupied return space without losing a loaded gun or either ammo origin', () => {
    const f = station(); f.setup(d => {
        d.profile.bag.items = [item('new-gun', 'pistol')]; D.addItem(d.profile.bag, 'sample', 28);
        d.profile.equipment = { weapon: 'pistol', weaponUid: 'test-gun', gun: factoryState(), ammo: 8, ammoRelief: 3, relief: true };
    });
    const profile = structuredClone(f.state.save), raw = f.raw, writes = f.writes;
    const result = f.runtime.equip('bag', 'new-gun'); assert.ok(!result.ok); assert.equal(result.reason, 'space'); assert.match(result.message, /原武器及弹匣余弹/);
    assert.deepEqual(f.state.save, profile); assert.equal(f.raw, raw); assert.equal(f.writes, writes);
    const missing = f.runtime.equip('bag', 'missing'); assert.ok(!missing.ok); assert.equal(missing.reason, 'missing-item');
    const nonGun = f.runtime.equip('bag', f.state.save.bag.items[1].uid); assert.ok(!nonGun.ok); assert.equal(nonGun.reason, 'rule'); assert.match(nonGun.message, /不能装备/);
    f.setup(d => { D.removeItem(d.profile.bag, 'sample', 2); }); assert.ok(f.runtime.equip('bag', 'new-gun').ok);
    assert.equal(f.state.save.equipment.relief, false); assert.equal(f.state.save.equipment.ammo, 0);
    assert.equal(f.state.save.bag.items.filter(entry => entry.id === 'pistol' && entry.relief).length, 1);
    assert.equal(f.state.save.bag.items.filter(entry => entry.id === 'ammo9' && entry.relief).reduce((n, entry) => n + entry.qty, 0), 3);
    assert.equal(f.state.save.bag.items.filter(entry => entry.id === 'ammo9' && !entry.relief).reduce((n, entry) => n + entry.qty, 0), 5);
});
test('raid swap persists the world container and player inventory in one record and rolls both back on failure', () => {
    const f = station(); f.setup(d => { d.profile.bag.items = [item('bag', 'water', 0, 0, 2, true)]; });
    assert.ok(f.saves.beginRun(26)); f.state.state = 'run';
    const container = structuredClone(f.state.checkpoint!.containers![0]); container.inventory.items = [item('world', 'pistol')];
    f.saves.attachRaid({ capture: () => ({ ...structuredClone(f.state.checkpoint!), loadout: structuredClone(f.state.loadout!), containers: [structuredClone(container)] }),
        restore: checkpoint => Object.assign(container, structuredClone(checkpoint.containers![0])) });
    const request: LootTransfer = { runId: f.state.loadout!.runId!, containerId: container.id, from: 'container', to: 'bag', uid: 'world', x: 0, y: 0 };
    const before = structuredClone({ container, loadout: f.state.loadout, profile: f.state.save }), raw = f.raw;
    f.fail(); assert.equal(f.saves.transferLoot(container, request), 'save-failed');
    assert.deepEqual({ container, loadout: f.state.loadout, profile: f.state.save }, before); assert.equal(f.raw, raw);
    f.fail(false); assert.equal(f.saves.transferLoot(container, request), 'committed');
    assert.equal(container.inventory.items[0].uid, 'bag'); assert.equal(container.inventory.items[0].relief, true); assert.equal(f.state.loadout!.bag.items[0].uid, 'world');
    const saved = decodeSession(f.raw); assert.deepEqual(saved.raid!.containers![0].inventory, container.inventory); assert.deepEqual(saved.raid!.loadout.bag, f.state.loadout!.bag);
    assert.equal(f.saves.transferLoot(container, request), 'rejected');
});
