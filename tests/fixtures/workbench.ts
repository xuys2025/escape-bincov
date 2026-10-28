/**
 * The gunsmith workbench's test yard (#28 M2-04): a page at the upgraded station whose profile is stocked through one
 * committed candidate, with the hideout Runtime and storage that can be made to fail. Shared by gunsmith-edit.test.ts
 * and gunsmith-edit-conservation.test.ts.
 */
import assert from 'node:assert/strict';
import * as D from '../../src/domain';
import { SaveSession, createSessionState } from '../../src/session';
import { SESSION_KEY, decodeSession } from '../../src/recovery-store';
import { RealHideoutRuntime, type HideoutEvent, type Result } from '../../src/hideout-runtime';
import type { Devices, PartNode } from '../../src/gunsmith/instance';

export const OFF: Devices = { laser: false, light: false };
export const node = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = [], relief = false): PartNode => ({ uid, id, slot, relief, children });
/** Put an item at its first free cell, or at x, y when given (asserting it fits there). */
export function put(inv: D.Inventory, item: Partial<D.Item> & Pick<D.Item, 'uid' | 'id'>) {
    const whole: D.Item = { qty: 1, x: 0, y: 0, ...item };
    if (item.x !== undefined) { assert.ok(D.fits(inv, whole, whole.x, whole.y, undefined, !!whole.rotated), `${item.uid} fits`); inv.items.push(whole); }
    else assert.ok(D.placeItem(inv, whole, false), `${item.uid} fits`);
}
/** A gun item with these parts and switches. */
export const gun = (uid: string, id: string, parts: PartNode[] = [], devices: Devices = OFF, extra: Partial<D.Item> = {}) =>
    ({ uid, id, ...extra, gun: { parts, devices: { ...devices } } });
/** The gun in hand with these parts, rounds and switches. */
export function hold(p: D.SaveDataV1, uid: string, id: string, parts: PartNode[] = [], ammo = 0, ammoRelief = 0, devices: Devices = OFF) {
    p.equipment = { weapon: id, weaponUid: uid, gun: { parts, devices: { ...devices } }, relief: false, ammo, ammoRelief };
}
export const reason = (result: Result) => { assert.equal(result.ok, false); return !result.ok && result.reason; };

/** A yard whose stash, bag, safe and hand start empty and are then stocked by `stock`; `fail()` makes writes throw. */
export function yard(stock: (p: D.SaveDataV1) => void) {
    let now = 1800000000000, failed = false, writes = 0;
    const data = new Map<string, string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failed) throw Error('quota'); data.set(k, v); writes++; } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => now);
    assert.ok(saves.initialize());
    const runtime = new RealHideoutRuntime(state, saves, () => now), events: HideoutEvent[] = [];
    assert.ok(runtime.enter().ok);
    const ticket = saves.prepareExpansionMutation(d => {
        d.profile.stash = D.createInventory(10, 6); d.profile.bag = D.createInventory(6, 5); d.profile.safe = D.createInventory(2, 2);
        d.profile.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
        stock(d.profile);
    });
    assert.ok(ticket, state.storageError); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    runtime.snapshot(); runtime.subscribe(e => events.push(e));
    return { state, saves, runtime, events, data, get raw() { return data.get(SESSION_KEY)!; }, get writes() { return writes; },
        get record() { return decodeSession(data.get(SESSION_KEY)!); }, get now() { return now; },
        fail: (v = true) => { failed = v; }, advance: (ms: number) => { now += ms; } };
}
