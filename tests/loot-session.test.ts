import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { LootEndpoint, LootTransfer } from '../src/loot';
import { createSessionState, SaveSession } from '../src/session';
import { RecoveryStore, SESSION_KEY } from '../src/recovery-store';
const read = (storage: D.StorageLike) => new RecoveryStore(storage).load();

function fixture(prepare?: (save: D.SaveDataV1) => void) {
    const state = createSessionState();
    state.state = 'hideout';
    let stored: string | null = null, writes = 0, failWrites = false;
    let beforeWrite: ((value: string) => void) | null = null;
    const storage: D.StorageLike = {
        getItem: key => key === SESSION_KEY ? stored : null,
        setItem: (key, value) => {
            assert.equal(key, SESSION_KEY);
            beforeWrite?.(value);
            if (failWrites) throw new Error('quota exceeded');
            stored = value; writes++;
        },
    };
    const session = new SaveSession(state, () => storage);
    assert.equal(session.initialize(), true); writes = 0;
    state.save.bag.items = []; state.save.safe.items = [];
    prepare?.(state.save);
    assert.equal(session.beginRun(42), true);
    state.state = 'run';
    const container = structuredClone(state.checkpoint!.containers![0]);
    container.inventory.items = [];
    session.attachRaid({
        capture: () => ({ ...structuredClone(state.checkpoint!), loadout: structuredClone(state.loadout!), containers: [structuredClone(container)] }),
        restore: value => { Object.assign(container, structuredClone(value.containers![0])); },
    });
    const request = (from: LootEndpoint, to: LootEndpoint, uid: string, x = 0, y = 0): LootTransfer => ({
        runId: state.loadout!.runId!, containerId: container.id, from, to, uid, x, y,
    });
    return {
        state, session, storage, container, request,
        snapshot: () => structuredClone({ save: state.save, loadout: state.loadout, container }),
        failWrites(value: boolean) { failWrites = value; },
        beforeWrite(callback: (value: string) => void) { beforeWrite = callback; },
        get writes() { return writes; },
        get stored() { return stored; },
    };
}

function add(inv: D.Inventory, id: string, qty = 1, relief = false): string {
    const first = inv.items.length;
    assert.equal(D.addItem(inv, id, qty, relief), 0);
    return inv.items[first].uid;
}

test('container and backpack transfers keep the complete item and its chosen coordinates', () => {
    const f = fixture(), uid = add(f.container.inventory, 'pearl', 2);
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'bag', uid, 2, 1)), 'committed');
    assert.deepEqual(f.state.loadout!.bag.items, [{ uid, id: 'pearl', qty: 2, x: 2, y: 1 }]);
    assert.equal(f.container.inventory.items.length, 0);
    assert.equal(f.session.transferLoot(f.container, f.request('bag', 'container', uid, 3, 2)), 'committed');
    assert.deepEqual(f.container.inventory.items, [{ uid, id: 'pearl', qty: 2, x: 3, y: 2 }]);
    assert.equal(f.state.loadout!.bag.items.length, 0);
    assert.equal(f.writes, 3);
});

test('taking from and returning to a container updates the restored safe and world atomically', () => {
    const f = fixture(), uid = add(f.container.inventory, 'pearl');
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'safe', uid, 1, 1)), 'committed');
    const recovered = read(f.storage).save;
    assert.ok(read(f.storage).raid, 'New session refresh restores a complete world');
    assert.deepEqual(recovered.safe.items, [{ uid, id: 'pearl', qty: 1, x: 1, y: 1 }]);
    assert.equal(f.session.transferLoot(f.container, f.request('safe', 'container', uid, 2, 0)), 'committed');
    const afterReturn = read(f.storage).save;

    assert.equal(D.count(afterReturn.safe, 'pearl'), 0);
    assert.equal(D.count(afterReturn.bag, 'pearl'), 0);
    assert.equal(D.count(f.container.inventory, 'pearl'), 1);
    assert.equal(afterReturn.version, 3);
    assert.equal(read(f.storage).raid!.containers![0].inventory.items[0].uid, uid);
});

for (const direction of ['take', 'return'] as const) test(`the ${direction} write observes the old live container until commit`, () => {
    const f = fixture(save => { if (direction === 'return') D.addItem(save.safe, 'watch'); });
    const uid = direction === 'take' ? add(f.container.inventory, 'watch') : f.state.loadout!.safe.items[0].uid;
    const before = structuredClone(f.container.inventory);
    let observed = false;
    f.beforeWrite(value => {
        observed = true;
        assert.deepEqual(f.container.inventory, before);
        assert.equal(D.count(JSON.parse(value).profile.safe, 'watch'), direction === 'take' ? 1 : 0);
    });
    assert.equal(f.session.transferLoot(f.container, f.request(direction === 'take' ? 'container' : 'safe', direction === 'take' ? 'safe' : 'container', uid)), 'committed');
    assert.equal(observed, true);
    assert.notDeepEqual(f.container.inventory, before);
});

for (const endpoint of ['bag', 'safe'] as const) for (const direction of ['take', 'return'] as const) {
    test(`failed storage rolls back container ${direction} with ${endpoint} and permits one retry`, () => {
        const f = fixture(save => { if (direction === 'return') D.addItem(save[endpoint], 'pearl'); });
        const uid = direction === 'take' ? add(f.container.inventory, 'pearl') : f.state.loadout![endpoint].items[0].uid;
        const request = f.request(direction === 'take' ? 'container' : endpoint, direction === 'take' ? endpoint : 'container', uid);
        const before = f.snapshot(), durable = f.stored;
        f.failWrites(true);
        assert.equal(f.session.transferLoot(f.container, request), 'save-failed');
        assert.deepEqual(f.snapshot(), before);
        assert.equal(f.stored, durable);
        assert.equal(f.state.storageOK, false);
        f.failWrites(false);
        assert.equal(f.session.transferLoot(f.container, request), 'committed');
        assert.equal(f.session.transferLoot(f.container, request), 'rejected', 'A consumed source UID cannot be replayed');
        assert.equal(D.count(f.container.inventory, 'pearl') + D.count(f.state.loadout![endpoint], 'pearl'), 1);
        assert.equal(f.writes, 2);
    });
}

test('an unexpected exception after a character change rolls back both sides', () => {
    const f = fixture(), uid = add(f.container.inventory, 'pearl'), before = f.snapshot();
    f.session.persist = () => { throw new Error('unexpected transaction exception'); };
    assert.throws(() => f.session.transferLoot(f.container, f.request('container', 'safe', uid)), /unexpected transaction exception/);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.writes, 1);
});

test('container rearrangement supports self-overlap and complete stack merges', () => {
    const f = fixture(), gun = add(f.container.inventory, 'shotgun');
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'container', gun, 1, 0)), 'committed');
    assert.equal(f.container.inventory.items[0].x, 1);
    const ammo = add(f.container.inventory, 'ammo9', 45);
    const target = f.container.inventory.items.find(item => item.uid === ammo)!;
    target.qty = 30;
    const remainder = f.container.inventory.items.find(item => item.id === 'ammo9' && item.uid !== ammo)!;
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'container', remainder.uid, target.x, target.y)), 'committed');
    assert.equal(D.count(f.container.inventory, 'ammo9'), 35);
    assert.equal(f.container.inventory.items.filter(item => item.id === 'ammo9').length, 1);
    assert.equal(f.state.loadout!.bag.items.length, 0);
});

test('bag and safe can exchange items through the same exact-slot transaction', () => {
    const f = fixture(save => D.addItem(save.bag, 'watch')), uid = f.state.loadout!.bag.items[0].uid;
    const beforeContainer = structuredClone(f.container);
    assert.equal(f.session.transferLoot(f.container, f.request('bag', 'safe', uid, 1, 0)), 'committed');
    assert.equal(D.count(read(f.storage).save.safe, 'watch'), 1);
    assert.equal(f.session.transferLoot(f.container, f.request('safe', 'bag', uid, 5, 4)), 'committed');
    assert.equal(D.count(read(f.storage).save.safe, 'watch'), 0);
    assert.deepEqual(f.container, beforeContainer);
});

test('merging consumes the source UID while keeping target identity and relief restrictions', () => {
    const f = fixture(save => { Object.assign(save.equipment, { weapon: null, weaponUid: null, gun: null, ammo: 0, ammoRelief: 0 }); D.addItem(save.bag, 'ammo9', 35); }), uid = add(f.container.inventory, 'ammo9', 5);
    const targetUid = f.state.loadout!.bag.items[0].uid;
    const request = f.request('container', 'bag', uid);
    assert.equal(f.session.transferLoot(f.container, request), 'committed');
    assert.equal(f.state.loadout!.bag.items[0].uid, targetUid);
    assert.equal(f.state.loadout!.bag.items[0].qty, 40);
    assert.equal(f.session.transferLoot(f.container, request), 'rejected');
    const relief = add(f.container.inventory, 'ammo9', 12, true), before = f.snapshot();
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'bag', relief)), 'rejected');
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'bag', relief, 1, 0)), 'committed');
    assert.equal(f.state.loadout!.bag.items.find(item => item.uid === relief)?.relief, true);
});

test('invalid slots, endpoints and unavailable items have no side effects or writes', () => {
    const f = fixture(save => D.addItem(save.bag, 'sample', 2)), uid = add(f.container.inventory, 'shotgun');
    const valid = f.request('container', 'bag', uid), before = f.snapshot();
    const invalid: LootTransfer[] = [
        valid,
        { ...valid, to: 'safe' },
        { ...valid, x: 4 },
        { ...valid, x: NaN },
        { ...valid, x: 0.5 },
        { ...valid, y: -1 },
        { ...valid, uid: 'consumed' },
        { ...valid, from: 'stash' as LootEndpoint },
        { ...valid, to: 'stash' as LootEndpoint },
    ];
    for (const request of invalid) {
        assert.equal(f.session.transferLoot(f.container, request), 'rejected');
        assert.deepEqual(f.snapshot(), before);
    }
    assert.equal(f.writes, 1);
});

test('stale run and mismatched container identities are rejected before any write', () => {
    const f = fixture(), uid = add(f.container.inventory, 'pearl'), valid = f.request('container', 'bag', uid);
    const before = f.snapshot();
    for (const request of [{ ...valid, runId: '' }, { ...valid, runId: 'previous-run' }, { ...valid, containerId: 'other-crate' }]) {
        assert.equal(f.session.transferLoot(f.container, request), 'rejected');
        assert.deepEqual(f.snapshot(), before);
    }
    const old = { ...f.container, runId: 'previous-run' };
    assert.equal(f.session.transferLoot(old, valid), 'rejected');
    f.state.save.activeRun!.runId = 'another-active-run';
    assert.equal(f.session.transferLoot(f.container, valid), 'rejected');
    f.state.save.activeRun!.runId = valid.runId;
    f.state.loadout!.runId = 'another-loadout';
    assert.equal(f.session.transferLoot(f.container, valid), 'rejected');
    assert.equal(f.writes, 1);
});

test('non-running, conflict and pending-settlement sessions block looting', () => {
    const f = fixture(), uid = add(f.container.inventory, 'pearl'), request = f.request('container', 'bag', uid);
    const before = f.snapshot();
    for (const state of ['menu', 'hideout', 'result'] as const) {
        f.state.state = state;
        assert.equal(f.session.transferLoot(f.container, request), 'blocked');
        assert.deepEqual(f.snapshot(), before);
    }
    f.state.state = 'run';
    f.session.markConflict();
    assert.equal(f.session.transferLoot(f.container, request), 'blocked');
    assert.deepEqual(f.snapshot(), before);
    f.state.conflict = false;
    assert.equal(f.session.prepareSettlement('death', 0), true);
    const pending = structuredClone(f.state.pendingSettlement);
    assert.equal(f.session.transferLoot(f.container, request), 'blocked');
    assert.deepEqual(f.snapshot(), before);
    assert.deepEqual(f.state.pendingSettlement, pending);
    assert.equal(f.writes, 1);
});

test('containers from the last raid cannot supply the next raid', () => {
    const f = fixture(), uid = add(f.container.inventory, 'pearl');
    assert.equal(f.session.prepareSettlement('death', 0), true);
    assert.equal(f.session.retrySettlement(), true);
    f.state.state = 'hideout';
    assert.equal(f.session.beginRun(43), true);
    f.state.state = 'run';
    const before = f.snapshot();
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'bag', uid)), 'rejected');
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.writes, 3);
});


test('split with rotation and partial merge persist source remainder atomically and roll back on write failure', () => {
    const f = fixture(), uid = add(f.container.inventory, 'water', 2);
    const req = { ...f.request('container', 'safe', uid, 0, 0), quantity: 1, rotated: true };
    const before = f.snapshot(); f.failWrites(true);
    assert.equal(f.session.transferLoot(f.container, req), 'save-failed'); assert.deepEqual(f.snapshot(), before);
    f.failWrites(false); assert.equal(f.session.transferLoot(f.container, req), 'committed');
    assert.equal(f.container.inventory.items[0].qty, 1); assert.equal(f.container.inventory.items[0].rotated, undefined);
    assert.equal(f.state.loadout!.safe.items[0].rotated, true);
    assert.notEqual(f.state.loadout!.safe.items[0].uid, uid);
    assert.deepEqual(read(f.storage).raid!.containers![0].inventory, f.container.inventory);
    const ammo = add(f.container.inventory, 'ammo9', 12); add(f.state.loadout!.bag, 'ammo9', 35);
    assert.equal(f.session.transferLoot(f.container, f.request('container', 'bag', ammo)), 'committed');
    assert.equal(f.container.inventory.items.find(i => i.uid === ammo)!.qty, 7); assert.equal(D.count(f.state.loadout!.bag, 'ammo9'), 40);
});
