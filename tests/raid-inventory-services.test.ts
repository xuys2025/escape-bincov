import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { createCoastRaidHost } from '../src/raid-runtime/host';
import { emptyIntent } from '../src/raid-runtime/runtime';
import type { CarriedPlacement, CoastServices, TargetRef } from '../src/raid-runtime/contract';
import { InventoryPanel } from '../src/coast-view/inventory';
import { generateRunBase } from '../src/world';

type World = false | true | 'mall' | 'legacy';
const worlds: World[] = [false, true, 'mall'];
const item = (uid: string, id: string, x = 0, y = 0, qty = 1): D.Item => ({ uid, id, x, y, qty });
function fixture(world: World = true, arm?: (l: D.RunLoadout) => void) {
    const data = new Map<string, string>(); let writes = 0, failed = false;
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failed) throw Error('quota fixture'); data.set(k, v); writes++; } };
    let state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(42, world === 'legacy' ? false : world, { legacyEnemies: true })); state.state = 'run';
    const l = structuredClone(state.loadout!); l.bag.items = [item('water-stack', 'water', 0, 0, 2)]; l.safe.items = []; arm?.(l);
    if (state.expansion?.raid) {
        const e = structuredClone(state.expansion), r = e.raid!, c = r.maps[r.currentMap].containers[0];
        r.loadout = l; r.player.x = c.x; r.player.y = c.y;
        assert.ok(saves.persist(state.save, null, undefined, e), state.storageError); state.loadout = structuredClone(l);
    } else {
        const c = structuredClone(state.checkpoint!); c.loadout = l; c.player.x = c.containers![0].x; c.player.y = c.containers![0].y;
        state.loadout = structuredClone(l); D.checkpointSafe(state.save, l.safe, l.runId!);
        assert.ok(saves.persist(state.save, c), state.storageError);
    }
    if (world === 'legacy') {
        // A real accepted coast-v1 document, resumed through the ordinary decoder before factory creation.
        const record = JSON.parse(data.get(SESSION_KEY)!);
        record.raid.worldVersion = 'coast-v1'; delete record.raid.containers;
        record.raid.player = { ...generateRunBase(42).spawn, rotation: 0 };
        record.raid.loot = generateRunBase(42).loot.map((v, i) => ({ ...v, uid: `loot-${i}`, relief: false, ...D.factoryGun(v.id) }));
        data.set(SESSION_KEY, JSON.stringify(record));
        state = createSessionState(); saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
        assert.ok(saves.initialize(), state.storageError); assert.ok(saves.resumeRun()); state.state = 'run';
    }
    const handle = createCoastRaidHost(state, saves);
    writes = 0;
    return { state, saves, ...handle, fail(v: boolean) { failed = v; }, get writes() { return writes; }, get raw() { return data.get(SESSION_KEY)!; },
        live: () => saves.backupRecord()!, saved: () => decodeSession(data.get(SESSION_KEY)!) };
}
const actions: Record<string, (s: CoastServices) => ReturnType<CoastServices['moveCarried']>> = {
    place: s => s.moveCarried({ from: 'bag', to: 'safe', uid: 'water-stack', x: 0, y: 0, quantity: 1 }),
    quick: s => s.quickTransferCarried('bag', 'water-stack'),
    rotate: s => s.rotateCarried('bag', 'water-stack'),
};

test('production carried services commit each action and the current classic/layered world in one write', () => {
    for (const world of worlds) for (const [name, action] of Object.entries(actions)) {
        const f = fixture(world); f.runtime.advance(0, emptyIntent()); f.runtime.advance(100, emptyIntent());
        const elapsed = f.runtime.current().stamp.simulationTime;
        assert.ok(elapsed > (f.saved().expansion?.raid ?? f.saved().raid)!.elapsed, `${world}/${name}: between checkpoints`);
        assert.equal(action(f.services), 'committed'); assert.equal(f.writes, 1);
        const saved = f.saved(), live = f.live(), raid = saved.expansion?.raid ?? saved.raid!;
        assert.equal(raid.elapsed, elapsed); assert.deepEqual(raid.loadout, f.state.loadout);
        assert.deepEqual(saved.expansion, live.expansion); assert.deepEqual(saved.raid, live.raid);
        assert.deepEqual(saved.profile.safe, f.state.loadout!.safe);
    }
});

test('each failed carried write restores raw bytes and the full live world, then the same UID works on fresh references', () => {
    for (const world of worlds) for (const action of Object.values(actions)) {
        const f = fixture(world); f.runtime.advance(0, emptyIntent()); f.runtime.advance(100, emptyIntent());
        const before = f.live(), raw = f.raw, oldBag = f.state.loadout!.bag;
        f.fail(true); assert.equal(action(f.services), 'save-failed');
        assert.equal(f.raw, raw); assert.deepEqual(f.live(), before); assert.equal(f.writes, 0);
        assert.notEqual(f.state.loadout!.bag, oldBag, 'rollback replaces even otherwise equal inventories');
        f.fail(false); assert.equal(action(f.services), 'committed'); assert.equal(f.writes, 1);
        assert.deepEqual((f.saved().expansion?.raid ?? f.saved().raid)!.loadout, f.state.loadout);
    }
});

test('invalid service values reject before persistence; rejection may still replace references', () => {
    const f = fixture(), valid = { from: 'bag', to: 'safe', uid: 'water-stack', x: 0, y: 0 };
    for (const patch of [{ from: 'container' }, { to: '__proto__' }, { uid: ['water-stack'] }, { uid: '' }, { x: NaN }, { x: 1.5 }, { y: -1 }, { quantity: 0 }, { quantity: '1' }, { rotated: 'yes' }]) {
        const raw = f.raw, before = f.live(), old = f.state.loadout;
        assert.equal(f.services.moveCarried({ ...valid, ...patch } as unknown as CarriedPlacement), 'rejected');
        assert.equal(f.raw, raw); assert.deepEqual(f.live(), before); assert.notEqual(f.state.loadout, old);
        assert.equal(f.state.storageOK, true, 'invalid input must not masquerade as a storage error');
    }
    for (const action of [() => f.services.rotateCarried('container' as 'bag', 'water-stack'), () => f.services.quickTransferCarried('bag', [] as unknown as string)]) assert.equal(action(), 'rejected');
    assert.equal(f.writes, 0);
    assert.equal(f.services.rotateCarried('bag', 'water-stack'), 'committed');
});

test('the carried adapter preserves mutate guards, including its existing paused acceptance', () => {
    const f = fixture(); f.runtime.pause('overlay'); const writes = f.writes;
    assert.equal(f.services.rotateCarried('bag', 'water-stack'), 'committed', 'do not silently substitute Runtime.transaction');
    assert.equal(f.writes, writes + 1);
    f.state.conflict = true; const raw = f.raw;
    assert.equal(f.services.quickTransferCarried('bag', 'water-stack'), 'blocked'); assert.equal(f.raw, raw);
    f.state.conflict = false; f.state.pendingSettlement = structuredClone(f.state.save);
    assert.equal(f.services.rotateCarried('bag', 'water-stack'), 'blocked'); assert.equal(f.raw, raw);
});

test('display reads are detached and fresh; periodic readouts clone no inventory or world', t => {
    const f = fixture(), first = f.services.inventoryView()!, before = structuredClone(f.state.loadout);
    assert.deepEqual(Object.keys(first).sort(), ['bag', 'safe', 'weapon', 'weaponUid', 'gun', 'relief'].sort());
    first.bag.items[0].qty = 99; first.gun!.devices.laser = true;
    assert.deepEqual(f.state.loadout, before);
    const next = f.services.inventoryView()!; assert.equal(next.bag.items[0].qty, 2);
    assert.equal(f.services.rotateCarried('bag', 'water-stack'), 'committed');
    assert.equal(f.services.inventoryView()!.bag.items[0].rotated, true); assert.equal(next.bag.items[0].rotated, undefined);
    const clone = globalThis.structuredClone; t.after(() => { globalThis.structuredClone = clone; });
    globalThis.structuredClone = (() => { throw Error('numeric readout must not clone'); }) as typeof structuredClone;
    assert.deepEqual(f.services.inventoryReadout(), { weight: f.services.carriedWeight(), limit: f.services.carryLimit() });
    f.state.loadout = null; assert.equal(f.services.inventoryView(), null); assert.equal(f.services.inventoryReadout(), null);
});

test('inventory quick stays all-or-none while exact placement permits a partial merge', () => {
    const f = fixture(true, l => { l.bag.items = [item('ammo-source', 'ammo9', 0, 0, 10)]; l.safe.items = [item('ammo-target', 'ammo9', 0, 0, 35), item('safe-fill', 'water', 1, 0), item('safe-fill2', 'scrap', 0, 1)]; });
    const raw = f.raw;
    assert.equal(f.services.quickTransferCarried('bag', 'ammo-source'), 'rejected'); assert.equal(f.raw, raw); assert.equal(f.writes, 0);
    assert.equal(f.services.moveCarried({ from: 'bag', to: 'safe', uid: 'ammo-source', x: 0, y: 0 }), 'committed');
    assert.equal(D.count(f.state.loadout!.bag, 'ammo9'), 5); assert.equal(D.count(f.state.loadout!.safe, 'ammo9'), 40);
});

test('same-container placement retains normal no-op commits, reciprocal swaps and split identity', () => {
    const f = fixture(true, l => { l.bag.items.push(item('swap-scrap', 'scrap', 2, 0)); });
    assert.equal(f.services.moveCarried({ from: 'bag', to: 'bag', uid: 'water-stack', x: 0, y: 0 }), 'committed');
    assert.equal(f.writes, 1, 'an allowed same-position placement keeps its original commit semantics');
    assert.equal(f.services.moveCarried({ from: 'bag', to: 'bag', uid: 'water-stack', x: 2, y: 0 }), 'committed');
    assert.deepEqual(Object.fromEntries(f.services.inventoryView()!.bag.items.map(i => [i.uid, [i.x, i.y]])), { 'swap-scrap': [0, 0], 'water-stack': [2, 0] });
    assert.equal(f.services.moveCarried({ from: 'bag', to: 'bag', uid: 'water-stack', x: 4, y: 0, quantity: 1 }), 'committed');
    const bag = f.services.inventoryView()!.bag;
    assert.equal(bag.items.find(i => i.uid === 'water-stack')!.qty, 1);
    assert.equal(D.count(bag, 'water'), 2); assert.equal(new Set(bag.items.map(i => i.uid)).size, 3);
});

test('nested gun instances survive carried move, quick return, rotation, failure and backup', () => {
    const gun: D.Item = { ...item('nested-gun', 'pistol'), gun: { parts: [{ uid: 'part-base', id: 'A01', slot: 'base', relief: false, children: [{ uid: 'part-dot', id: 'O01', slot: 'micro', relief: true, children: [] }] }], devices: { laser: false, light: false } }, relief: true };
    const f = fixture(true, l => { l.bag.items = [structuredClone(gun)]; });
    assert.equal(f.services.moveCarried({ from: 'bag', to: 'safe', uid: gun.uid, x: 0, y: 0 }), 'committed');
    assert.equal(f.services.quickTransferCarried('safe', gun.uid), 'committed');
    const raw = f.raw; f.fail(true); assert.equal(f.services.rotateCarried('bag', gun.uid), 'save-failed'); assert.equal(f.raw, raw);
    f.fail(false); assert.equal(f.services.rotateCarried('bag', gun.uid), 'committed');
    const kept = f.services.inventoryView()!.bag.items[0]; assert.deepEqual(kept.gun, gun.gun); assert.equal(kept.uid, gun.uid); assert.equal(kept.relief, true);
    assert.deepEqual(f.saved().expansion!.raid!.loadout.bag.items[0], kept);
});

test('a decoded coast-v1 raid with no containers still supports its carried inventory and rollback', () => {
    const f = fixture('legacy'); assert.equal(f.runtime.current().frame.containers.length, 0); assert.equal(f.runtime.current().frame.loot.length, 60);
    const raw = f.raw; f.fail(true); assert.equal(f.services.rotateCarried('bag', 'water-stack'), 'save-failed'); assert.equal(f.raw, raw);
    f.fail(false); assert.equal(f.services.quickTransferCarried('bag', 'water-stack'), 'committed'); assert.equal(D.count(f.state.loadout!.safe, 'water'), 2);
});

test('the panel has no session/save capability and routes loot-mode bag/safe moves through real transferLoot', t => {
    const f = fixture(), calls: string[] = [], services = { ...f.services,
        transferLoot: (...args: Parameters<CoastServices['transferLoot']>) => { calls.push('loot'); return f.services.transferLoot(...args); },
        moveCarried: (...args: Parameters<CoastServices['moveCarried']>) => { calls.push('carried'); return f.services.moveCarried(...args); } };
    const b = f.runtime.current(), box = b.frame.containers[0], ref: TargetRef = { runId: b.stamp.world.runId, mapId: b.stamp.world.mapId, kind: 'container', id: box.id };
    assert.equal(f.services.activate(ref), true);
    const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
    t.after(() => { if (prior) Object.defineProperty(globalThis, 'document', prior); else delete (globalThis as Record<string, unknown>).document; });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => null }) } });
    const panel = new InventoryPanel({ querySelectorAll: () => [], isConnected: false } as unknown as HTMLElement,
        { services, lootRef: () => ref, touch: () => false, toast() {}, saveFailed() {}, close() {}, magazine: () => 0 });
    panel.mode = 'loot'; assert.equal(panel.commit('bag', 'safe', 'water-stack', 0, 0, undefined, 1), 'committed');
    assert.deepEqual(calls, ['loot']); assert.equal(f.writes, 1);
    panel.mode = 'inventory'; assert.equal(panel.commit('safe', 'bag', f.state.loadout!.safe.items[0].uid, 2, 0), 'committed');
    assert.deepEqual(calls, ['loot', 'carried']); assert.equal(f.writes, 2);
});
