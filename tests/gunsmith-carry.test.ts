import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { decodeStoredProfile } from '../src/profile-codec';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { organizeStash, transferBagToStash } from '../src/inventory-actions';
import { firstAvailableSlot, moveQuantity, placementError } from '../src/loot';
import * as S from '../src/shop';
import { gunSize, type GunState, type PartNode } from '../src/gunsmith/instance';

// Gunsmith M1-03 (docs/gunsmith/CONTRACTS.md): equipping, unequipping and swapping guns in a raid move one gun instance:
// its uid, its installed parts and its switches go with it, and the magazine's rounds go back as they do today,
// ordinary and relief apart. Parts are installed by hand here (the workbench is M2) to show they travel.
const NOW = 1800000000000;
const part = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid, id, slot, relief: false, children });
/** A carbine with a rifle flash hider and the carbine top base holding an open red dot: three parts, two levels. */
const fitted = (): GunState => ({ parts: [part('p-muzzle', 'M05', 'muzzle'), part('p-base', 'A07', 'base', [part('p-dot', 'O03', 'top')])], devices: { laser: false, light: false } });
/** The same carbine with the compact suppressor instead: one cell longer (4x1). */
const suppressed = (): GunState => ({ parts: [part('p-can', 'M07', 'muzzle')], devices: { laser: false, light: false } });
const factory = (): GunState => ({ parts: [], devices: { laser: false, light: false } });
const gunItem = (uid: string, id: string, x: number, y: number, gun: GunState = factory(), extra: Partial<D.Item> = {}): D.Item =>
    ({ uid, id, qty: 1, x, y, ...extra, gun });
/** Rounds of `id` by origin across inventories and an equipped magazine of that ammunition. */
function rounds(id: string, inventories: D.Inventory[], slot?: D.Equipment) {
    const sum = (relief: boolean) => inventories.flatMap(inv => inv.items).filter(i => i.id === id && !!i.relief === relief).reduce((n, i) => n + i.qty, 0);
    const loaded = slot?.weapon && D.WEAPONS[slot.weapon].ammo === id ? slot : null;
    return { ordinary: sum(false) + (loaded ? loaded.ammo - loaded.ammoRelief : 0), relief: sum(true) + (loaded?.ammoRelief ?? 0) };
}
function origin() {
    const data = new Map<string, string>(), failing = new Set<string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing.has(k)) throw new Error('quota'); data.set(k, v); } };
    return { data, failing, storage };
}
/** A deployed building raid on a fresh save whose loadout is `arm`ed through a committed candidate, and its Runtime. */
function raid(arm: (loadout: D.RunLoadout) => void) {
    const o = origin(), state = createSessionState(), saves = new SaveSession(state, () => o.storage, undefined, () => NOW);
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(4242, true)); state.state = 'run';
    const ticket = saves.prepareExpansionMutation(d => { arm(d.expansion.raid!.loadout); });
    assert.ok(ticket, state.storageError); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    const runtime = new CoastRaidRuntime(state, saves); runtime.freezeAI = true;
    return { o, state, saves, runtime, get record() { return decodeSession(o.data.get(SESSION_KEY)!); } };
}
/** Edits the live raid loadout through the Runtime, as the ?test=1 driver does; the next commit writes it. */
function loadoutEdit(r: ReturnType<typeof raid>) {
    return (change: (loadout: D.RunLoadout) => void) => { const s = r.runtime.snapshotExpansion(); change(s.raid!.loadout); r.runtime.restoreExpansion(s); };
}

test('a hideout swap moves both guns as themselves: the uid, the parts and the switches go along, the rounds go back apart', () => {
    const save = D.newSave();
    save.equipment = { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 9, ammoRelief: 4 };
    save.bag.items = [gunItem('bag-pistol', 'pistol', 0, 0, undefined, { relief: true })];
    const before = rounds('ammoR', [save.stash, save.bag, save.safe], save.equipment);
    assert.ok(D.equip(save, 'bag-pistol'));
    assert.deepEqual([save.equipment.weapon, save.equipment.weaponUid, save.equipment.relief, save.equipment.ammo], ['pistol', 'bag-pistol', true, 0]);
    const back = save.bag.items.find(i => i.uid === 'eq-carbine')!;
    assert.deepEqual([back.id, back.gun, back.relief], ['carbine', fitted(), undefined], 'the carbine is the same instance, parts and all');
    assert.deepEqual(rounds('ammoR', [save.stash, save.bag, save.safe], save.equipment), before, 'ordinary and relief rounds both kept');
    assert.ok(save.bag.items.some(i => i.id === 'ammoR' && i.relief && i.qty === 4) && save.bag.items.some(i => i.id === 'ammoR' && !i.relief && i.qty === 5));
    // Equipping it again from the bag gives the slot the very same instance; unequipping takes the pistol to the stash as itself.
    assert.ok(D.equip(save, 'eq-carbine'));
    assert.deepEqual([save.equipment.weaponUid, save.equipment.gun], ['eq-carbine', fitted()]);
    assert.ok(save.bag.items.some(i => i.uid === 'bag-pistol' && i.relief));
    D.removeItem(save.bag, 'ammoR', D.count(save.bag, 'ammoR'));
    assert.ok(D.unequip(save)); assert.equal(save.equipment.weapon, null);
    assert.deepEqual(save.stash.items.filter(i => i.uid === 'eq-carbine').map(i => i.gun), [fitted()]);
    // The result is a valid stored profile: one uid space, every gun valid, nothing lost or invented.
    const decoded = decodeStoredProfile({ ...save, activeRun: null });
    assert.deepEqual(decoded.stash.items.find(i => i.uid === 'eq-carbine')!.gun, fitted());
});

test('a swap or unequip that cannot place the old gun or its rounds changes nothing; a longer gun needs its longer gap', () => {
    const save = D.newSave();
    save.equipment = { weapon: 'carbine', weaponUid: 'eq-carbine', gun: suppressed(), relief: false, ammo: 12, ammoRelief: 0 };
    assert.deepEqual(gunSize({ id: 'carbine', parts: suppressed().parts }), { w: 4, h: 1 });
    // A stash full but for one 3x1 gap: the factory carbine would fit, the suppressed one (4x1) does not, in either orientation.
    save.stash.items = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) if (!(y === 0 && x < 3)) save.stash.items.push({ uid: `fill-${x}-${y}`, id: 'watch', qty: 1, x, y });
    const before = structuredClone(save);
    assert.equal(D.unequip(save), false); assert.deepEqual(save, before);
    // Open a 4x1 gap: it goes there, as itself; the rounds then need room of their own (none left), so still nothing moves.
    save.stash.items = save.stash.items.filter(i => !(i.y === 0 && i.x === 3)); const opened = structuredClone(save);
    assert.equal(D.unequip(save), false, 'twelve rounds have nowhere to go'); assert.deepEqual(save, opened);
    save.equipment.ammo = 0; assert.ok(D.unequip(save));
    const placed = save.stash.items.find(i => i.uid === 'eq-carbine')!;
    assert.deepEqual([placed.x, placed.y, placed.rotated, placed.gun], [0, 0, undefined, suppressed()]);
    // The swap in the bag is just as strict: a full bag keeps the loaded gun and both ammo origins.
    const full = D.newSave(); full.bag.items = [gunItem('bag-shotgun', 'shotgun', 0, 0)];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if (y > 0 || x > 2) full.bag.items.push({ uid: `b-${x}-${y}`, id: 'watch', qty: 1, x, y });
    full.equipment = { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 3, ammoRelief: 1 };
    const kept = structuredClone(full);
    assert.equal(D.equip(full, 'bag-shotgun'), false, 'the carbine fits where the shotgun was, its rounds do not'); assert.deepEqual(full, kept);
    full.equipment.ammo = 0; full.equipment.ammoRelief = 0; assert.ok(D.equip(full, 'bag-shotgun'));
    assert.deepEqual(full.bag.items.find(i => i.uid === 'eq-carbine')!.gun, fitted());
});

test('a raid swap through the Runtime moves both instances, unloads apart, checkpoints and reloads the same', () => {
    const r = raid(l => {
        Object.assign(l, { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 7, ammoRelief: 2 });
        l.bag.items = l.bag.items.filter(i => i.id !== 'ammoR'); assert.equal(D.addItem(l.bag, 'shotgun'), 0);
    });
    const shotgun = r.state.loadout!.bag.items.find(i => i.id === 'shotgun')!, before = rounds('ammoR', [r.state.loadout!.bag], r.state.loadout!);
    assert.equal(r.runtime.equipItem(shotgun.uid), 'committed');
    const loadout = r.state.loadout!;
    assert.deepEqual([loadout.weapon, loadout.weaponUid, loadout.gun], ['shotgun', shotgun.uid, shotgun.gun]);
    assert.deepEqual(loadout.bag.items.find(i => i.uid === 'eq-carbine')!.gun, fitted());
    assert.deepEqual(rounds('ammoR', [loadout.bag], loadout), before);
    // The committed record holds exactly that; a reopened page resumes it.
    const stored = r.record.expansion!.raid!.loadout;
    assert.deepEqual([stored.weaponUid, stored.bag.items.find(i => i.uid === 'eq-carbine')!.gun], [shotgun.uid, fitted()]);
    // Swapping back restores the carbine slot with its parts; the shotgun returns to the bag as itself.
    assert.equal(r.runtime.equipItem('eq-carbine'), 'committed');
    assert.deepEqual([r.state.loadout!.weaponUid, r.state.loadout!.gun], ['eq-carbine', fitted()]);
    assert.ok(r.state.loadout!.bag.items.some(i => i.uid === shotgun.uid));
});

test('extraction brings the equipped instance home; death loses it and keeps the safe\'s gun as itself', () => {
    for (const outcome of ['extract', 'death'] as const) {
        const r = raid(l => {
            Object.assign(l, { weapon: 'carbine', weaponUid: 'eq-carbine', gun: fitted(), relief: false, ammo: 5, ammoRelief: 0 });
            l.safe.items = [gunItem('safe-pistol', 'pistol', 0, 0)];
        });
        r.runtime.finish(outcome); assert.equal(r.runtime.settlement.committed, true, outcome); r.runtime.dispose();
        const home = r.record.profile;
        assert.deepEqual(home.safe.items.map(i => [i.uid, i.gun]), [['safe-pistol', { parts: [], devices: { laser: false, light: false } }]], outcome);
        if (outcome === 'extract') assert.deepEqual([home.equipment.weaponUid, home.equipment.gun, home.equipment.ammo], ['eq-carbine', fitted(), 5]);
        else assert.deepEqual([home.equipment.weapon, home.equipment.weaponUid, home.equipment.gun], [null, null, null]);
    }
});

// Gunsmith M1-04: moving a gun anywhere keeps its uid and its state; a move that does not fit changes nothing.

test('quick move, secure, stash-all and sorting keep every gun as itself', () => {
    const save = D.newSave();
    save.stash.items = [gunItem('s-carbine', 'carbine', 0, 0, fitted()), gunItem('s-long', 'carbine', 0, 1, suppressed(), { relief: true })];
    save.bag.items = [gunItem('b-shotgun', 'shotgun', 0, 0)];
    // Stash to bag and back without coordinates (the quick move): the same uids and states, a longer gun at its length.
    assert.ok(D.transferItem(save.stash, save.bag, 's-carbine'));
    assert.deepEqual(save.bag.items.find(i => i.uid === 's-carbine')!.gun, fitted());
    assert.ok(D.transferItem(save.bag, save.stash, 's-carbine')); assert.ok(D.transferItem(save.stash, save.bag, 's-long'));
    const long = save.bag.items.find(i => i.uid === 's-long')!;
    assert.deepEqual([long.gun, long.relief, D.itemSize(long)], [suppressed(), true, { w: 4, h: 1 }]);
    const safe = D.createInventory(2, 2), bag = structuredClone(save.bag);
    assert.equal(D.transferItem(save.bag, safe, 'b-shotgun'), false, 'a 3x1 gun never fits a 2x2 safe');
    assert.deepEqual([save.bag, safe.items], [bag, []]);
    // Everything from the bag into the stash, then a sort: still the same guns.
    assert.ok(transferBagToStash(save)); assert.ok(organizeStash(save));
    const guns = save.stash.items.filter(i => D.ITEMS[i.id].kind === 'weapon').map(i => [i.uid, i.gun]).sort();
    assert.deepEqual(guns, [['b-shotgun', factory()], ['s-carbine', fitted()], ['s-long', suppressed()]].sort());
    assert.doesNotThrow(() => decodeStoredProfile({ ...save, activeRun: null }));
});

test('the yard quick move writes the same instance and reads it back', () => {
    const o = origin(), state = createSessionState(), session = new SaveSession(state, () => o.storage, undefined, () => NOW);
    assert.ok(session.initialize()); const yard = new RealHideoutRuntime(state, session, () => NOW); assert.ok(yard.enter().ok);
    const ticket = session.prepareExpansionMutation(d => { d.profile.stash.items.push(gunItem('y-carbine', 'carbine', 7, 5, fitted())); });
    assert.ok(ticket); assert.equal(session.commitExpansionMutation(ticket), 'committed');
    const stored = () => decodeSession(o.data.get(SESSION_KEY)!).profile;
    assert.ok(yard.quickMove('stash', 'y-carbine').ok);
    assert.deepEqual(stored().bag.items.find(i => i.uid === 'y-carbine')!.gun, fitted());
    assert.ok(yard.quickMove('bag', 'y-carbine').ok);
    assert.deepEqual(stored().stash.items.find(i => i.uid === 'y-carbine')!.gun, fitted());
});

test('a raid drop leaves the gun on the ground as itself and a pickup takes the same gun back; no room leaves it lying', () => {
    const r = raid(l => { l.bag.items = [gunItem('r-carbine', 'carbine', 0, 0, fitted())]; }), edit = loadoutEdit(r);
    assert.equal(r.runtime.dropItem('r-carbine'), 'committed');
    const map = () => r.record.expansion!.raid!.maps[r.record.expansion!.raid!.currentMap];
    const ground = map().loot.find(l => l.uid === 'r-carbine')!;
    assert.deepEqual([ground.id, ground.qty, ground.relief, ground.gun], ['carbine', 1, false, fitted()]);
    assert.equal(r.state.loadout!.bag.items.length, 0);
    // A full bag: the pickup is refused whole and the gun stays on the ground, nothing written.
    edit(l => { for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) l.bag.items.push({ uid: `f-${x}-${y}`, id: 'watch', qty: 1, x, y }); });
    assert.ok(r.runtime.checkpoint()); const raw = r.o.data.get(SESSION_KEY);
    assert.equal(r.runtime.pickupLoot('r-carbine'), false); assert.equal(r.o.data.get(SESSION_KEY), raw);
    assert.ok(r.runtime.loot.some(l => l.uid === 'r-carbine'));
    edit(l => { l.bag.items = []; });
    assert.equal(r.runtime.pickupLoot('r-carbine'), true);
    assert.deepEqual(r.record.expansion!.raid!.loadout.bag.items.map(i => [i.uid, i.gun]), [['r-carbine', fitted()]]);
    assert.equal(map().loot.some(l => l.uid === 'r-carbine'), false);
});

test('a gun born on a layered raid\'s ground keeps its run-scoped entity uid when picked up', () => {
    const r = raid(l => { l.bag.items = []; }), driver = createRuntimeTestDriver(r.runtime, '?test=1');
    const spot = r.state.loadout!.runId!, uid = driver.spawnLoot('shotgun', 1, r.runtime.player);
    assert.ok(uid.startsWith(`entity-${spot}-`)); assert.deepEqual(r.runtime.loot.find(l => l.uid === uid)!.gun, factory());
    assert.equal(r.runtime.pickupLoot(uid), true);
    assert.deepEqual(r.record.expansion!.raid!.loadout.bag.items.map(i => [i.uid, i.gun]), [[uid, factory()]]);
});

test('classic raids: a dropped gun keeps its item uid on the ground; a world-born gun takes a new item uid when picked up', () => {
    const o = origin(), state = createSessionState(), session = new SaveSession(state, () => o.storage, undefined, () => NOW);
    assert.ok(session.initialize()); state.state = 'hideout'; assert.ok(session.beginRun(42)); state.state = 'run';
    state.loadout!.bag.items = [gunItem('c-carbine', 'carbine', 0, 0, fitted())];
    assert.ok(session.persist(), state.storageError);
    const runtime = new CoastRaidRuntime(state, session); runtime.freezeAI = true;
    const driver = createRuntimeTestDriver(runtime, '?test=1'), record = () => decodeSession(o.data.get(SESSION_KEY)!);
    assert.equal(runtime.dropItem('c-carbine'), 'committed');
    assert.deepEqual(record().raid!.loot.find(l => l.uid === 'c-carbine')!.gun, fitted());
    assert.equal(runtime.pickupLoot('c-carbine'), true);
    assert.deepEqual(record().raid!.loadout.bag.items.find(i => i.uid === 'c-carbine')!.gun, fitted());
    // World loot: loot-N uids repeat in every classic raid, so the picked-up gun gets an item uid of its own.
    const born = runtime.loot.find(l => D.ITEMS[l.id].kind === 'weapon')!;
    assert.match(born.uid, /^loot-[0-9]+$/); assert.deepEqual(born.gun, factory());
    let placed = false;
    for (const [dx, dy] of [[0, 0], [0, 12], [12, 0], [-12, 0], [0, -12], [0, 20], [20, 0]]) { try { driver.placePlayer({ x: born.x + dx, y: born.y + dy }); placed = true; break; } catch { /* blocked */ } }
    assert.ok(placed, 'stand by the gun');
    assert.equal(runtime.pickupLoot(born.uid), true);
    const taken = record().raid!.loadout.bag.items.filter(i => i.id === born.id && i.uid !== 'c-carbine');
    assert.equal(taken.length, 1); assert.doesNotMatch(taken[0].uid, /^(loot|entity|enemy)-[0-9]+$/); assert.deepEqual(taken[0].gun, factory());
    assert.equal(record().raid!.loot.some(l => l.uid === born.uid), false);
});

test('crates hand guns over as themselves both ways, and the safe mirror keeps their state through checkpoints', () => {
    const r = raid(l => { l.bag.items = []; l.safe.items = []; }), edit = loadoutEdit(r);
    const box = r.runtime.containers.find(c => c.kind === 'crate')!;
    const ticket = r.saves.prepareExpansionMutation(d => {
        const raid = d.expansion.raid!, crate = raid.maps[raid.currentMap].containers.find(c => c.id === box.id)!;
        crate.inventory.items = [gunItem('k-carbine', 'carbine', 0, 0, fitted())];
    });
    assert.ok(ticket); assert.equal(r.saves.commitExpansionMutation(ticket), 'committed');
    createRuntimeTestDriver(r.runtime, '?test=1').placePlayer({ x: box.x, y: box.y + 12 });
    const mapId = r.record.expansion!.raid!.currentMap, ref = { runId: box.runId, mapId, kind: 'container' as const, id: box.id };
    const request = (from: 'container' | 'bag', to: 'container' | 'bag', x = 0, y = 0) => ({ runId: box.runId, containerId: box.id, from, to, uid: 'k-carbine', x, y });
    assert.equal(r.runtime.transferLoot(ref, request('container', 'bag')), 'committed');
    assert.deepEqual(r.record.expansion!.raid!.loadout.bag.items.map(i => [i.uid, i.gun]), [['k-carbine', fitted()]]);
    // Into the safe through the raid inventory's quick move: the profile's safe mirrors it, state included.
    const pistol = gunItem('k-pistol', 'pistol', 4, 0, { parts: [part('k-muzzle', 'M01', 'muzzle')], devices: { laser: false, light: false } });
    edit(l => { l.bag.items.push(pistol); });
    assert.equal(r.saves.mutate(() => D.transferItem(r.state.loadout!.bag, r.state.loadout!.safe, 'k-pistol')), 'committed');
    const stored = r.record;
    assert.deepEqual(stored.expansion!.raid!.loadout.safe.items.map(i => [i.uid, i.gun]), [['k-pistol', pistol.gun]]);
    assert.deepEqual(stored.profile.safe, stored.expansion!.raid!.loadout.safe);
    assert.equal(r.runtime.transferLoot(ref, request('bag', 'container', 2, 2)), 'committed');
    const crate = r.record.expansion!.raid!.maps[mapId].containers.find(c => c.id === box.id)!;
    assert.deepEqual(crate.inventory.items.find(i => i.uid === 'k-carbine')!.gun, fitted());
});

test('a gun carried through a layer change stays the same instance; a gun left on a floor stays on that floor', () => {
    const o = origin(), state = createSessionState(), session = new SaveSession(state, () => o.storage, undefined, () => NOW);
    assert.ok(session.initialize()); state.state = 'hideout'; assert.ok(session.beginRun(42, 'mall', { mallLayout: 2 })); state.state = 'run';
    const ticket = session.prepareExpansionMutation(d => {
        const l = d.expansion.raid!.loadout;
        Object.assign(l, { weapon: 'carbine', weaponUid: 'm-carbine', gun: fitted(), ammo: 0, ammoRelief: 0, relief: false });
        l.bag.items = [gunItem('m-shotgun', 'shotgun', 0, 0)];
    });
    assert.ok(ticket); assert.equal(session.commitExpansionMutation(ticket), 'committed');
    const runtime = new CoastRaidRuntime(state, session), driver = createRuntimeTestDriver(runtime, '?test=1'); driver.freezeAI(true);
    assert.equal(runtime.dropItem('m-shotgun'), 'committed');
    const from = runtime.current().map.key.mapId, e = runtime.layeredWorld!.maps[from].entries.find(x => x.id === 'S-N-up')!;
    driver.placePlayer(e.at, 0, from);
    assert.ok(runtime.activate({ runId: runtime.current().map.key.runId, mapId: from, kind: 'entry', id: e.id }));
    const raid = decodeSession(o.data.get(SESSION_KEY)!).expansion!.raid!;
    assert.notEqual(raid.currentMap, from);
    assert.deepEqual([raid.loadout.weaponUid, raid.loadout.gun], ['m-carbine', fitted()]);
    assert.deepEqual(raid.maps[from].loot.find(l => l.uid === 'm-shotgun')!.gun, factory());
    assert.equal(raid.maps[raid.currentMap].loot.some(l => l.uid === 'm-shotgun'), false);
});

test('a gun is moved, swapped, sorted and sold at its own footprint: a part that lengthens it needs the longer gap', () => {
    const long = () => gunItem('long', 'carbine', 0, 0, suppressed());
    // A three-cell-wide grid refuses the 4x1 gun (a factory carbine would fit); four cells take it.
    const from = D.createInventory(6, 5), narrow = D.createInventory(3, 2), to = D.createInventory(4, 1);
    from.items = [long()];
    assert.match(placementError(from, narrow, 'long', 0, 0)!, /超出/); assert.equal(moveQuantity(from, narrow, 'long', 0, 0), false);
    assert.equal(firstAvailableSlot(narrow, from.items[0]), null); assert.deepEqual(narrow.items, []);
    assert.equal(placementError(from, to, 'long', 0, 0), null);
    assert.deepEqual(firstAvailableSlot(to, from.items[0]), { x: 0, y: 0, rotated: false });
    assert.ok(moveQuantity(from, to, 'long', 0, 0)); assert.deepEqual(to.items[0].gun, suppressed());
    // Dropping a watch onto it would swap it into the watch's three-cell row: refused, both sides unchanged.
    const bag = D.createInventory(3, 1), stash = D.createInventory(4, 1);
    bag.items = [{ uid: 'w', id: 'watch', qty: 1, x: 0, y: 0 }]; stash.items = [long()];
    const sides = structuredClone([bag, stash]);
    assert.match(placementError(bag, stash, 'w', 0, 0)!, /原位置放不下/); assert.equal(moveQuantity(bag, stash, 'w', 0, 0), false);
    assert.deepEqual([bag, stash], sides);
    // Sorting and stashing everything pack it at its real length without overlaps.
    const save = D.newSave(); save.bag.items = [long()]; save.stash.items = [];
    for (let x = 0; x < 10; x++) for (let y = 1; y < 6; y++) save.stash.items.push({ uid: `s-${x}-${y}`, id: 'watch', qty: 1, x, y });
    for (let x = 3; x < 10; x++) save.stash.items.push({ uid: `s-${x}-0`, id: 'watch', qty: 1, x, y: 0 });
    const kept = structuredClone(save);
    assert.equal(transferBagToStash(save), false, 'a 4x1 gun does not fit the 3-cell gap, nothing moves'); assert.deepEqual(save, kept);
    save.stash.items = save.stash.items.filter(i => i.uid !== 's-3-0'); assert.ok(transferBagToStash(save)); assert.ok(organizeStash(save));
    assert.deepEqual(save.stash.items.find(i => i.uid === 'long')!.gun, suppressed());
    assert.doesNotThrow(() => decodeStoredProfile({ ...save, activeRun: null }));
    // The sell list (6x2 since #28 M3) takes it only where four cells are free.
    const shop = D.newSave(); shop.stash.items = [gunItem('sell-long', 'carbine', 0, 0, suppressed())]; shop.bag.items = []; shop.safe.items = [];
    const cart = S.createCart(shop, 'arms');
    assert.equal(S.shopPlacementError(cart, 'stash', 'sell', 'sell-long', 3, 0), S.SHOP_SPACE_MESSAGE);
    assert.equal(S.shopPlacementError(cart, 'stash', 'sell', 'sell-long', 0, 0), null);
});
