import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { advanceLayerShots, changeLayer } from '../src/layer-transition';
import { BUILDING_WORLD } from '../src/building-world';
import type { RaidIntent } from '../src/raid-runtime/contract';
import { contains, Revelation, frameView } from '../src/raid-runtime/presentation';
import { resolveLayerShot } from '../src/layer-transition';
import type { ShotObservation } from '../src/layer-transition';
import { entityUid } from '../src/expansion-state';
import { createCoastRaidHost } from '../src/raid-runtime/host';

function fixture(layered = false, seed = 42) {
    const state = createSessionState(), data = new Map<string, string>(); let fail = false, writes = 0;
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (fail) throw Error('test quota'); data.set(k, v); writes++; } };
    const saves = new SaveSession(state, () => storage); assert.equal(saves.initialize(), true);
    state.state = 'hideout'; assert.equal(saves.beginRun(seed, layered), true); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves); const driver = createRuntimeTestDriver(runtime, '?test=1');
    return { state, saves, runtime, driver, storage, data, fail(value: boolean) { fail = value; }, get writes() { return writes; } };
}
const intent = (patch: Partial<RaidIntent> = {}): RaidIntent => ({ ...emptyIntent(), ...patch });
function safe(f: ReturnType<typeof fixture>) { f.driver.freezeAI(true); f.driver.placePlayer({ x: 208, y: 80 }); }

test('v1 Runtime loads both real routes without DOM and publishes detached immutable batches', () => {
    for (const layered of [false, true]) {
        const f = fixture(layered), before = f.runtime.snapshot(), batch = f.runtime.current();
        assert.equal(batch.frame.actors.length, layered ? 23 : 25);
        assert.equal(batch.stamp.world.worldVersion, layered ? BUILDING_WORLD.id : 'coast-v2');
        assert.equal(batch.map.key.runId, f.state.loadout!.runId);
        assert.throws(() => { (batch.frame.player as { x: number }).x++; }, TypeError);
        assert.throws(() => { (batch.map.cells[0] as string[])[0] = 'floor'; }, TypeError);
        assert.deepEqual(f.runtime.snapshot(), before);
        assert.equal(f.runtime.current(), batch);
        assert.throws(() => new CoastRaidRuntime(f.state, f.saves), /already/);
        assert.equal('test' in f.runtime, false); assert.equal('document' in globalThis, false);
    }
});
test('clock retains 125ms, stalls over 2s, resets on pause, and checkpoints every 2s', () => {
    const f = fixture(); safe(f); const r = f.runtime;
    r.advance(1000, intent()); r.advance(1125, intent()); assert.equal(r.elapsed, .125);
    r.advance(3125, intent()); assert.equal(r.elapsed, 2.125); const writes = f.writes;
    r.advance(5126, intent()); assert.equal(r.elapsed, 2.125); assert.equal(r.current().frame.phase, 'paused'); assert.ok(f.writes > writes);
    r.resume(); r.advance(20000, intent()); assert.equal(r.elapsed, 2.125);
    r.advance(20125, intent()); assert.equal(r.elapsed, 2.25);
});
test('blocked panels advance the world with empty input; pause freezes it; old held controls rearm', () => {
    const f = fixture(); safe(f); const r = f.runtime; r.advance(0, intent({ fireHeld: true, source: 'touch' }));
    r.setBlocked(true); r.advance(20, intent()); const before = r.snapshot();
    r.advance(145, intent({ move: { x: 1, y: 0, sprint: true }, firePressed: true, interactHeld: true }));
    assert.equal(r.elapsed - before.elapsed, .125); assert.deepEqual(r.player, before.player); assert.equal(r.mag, before.loadout.ammo);
    r.setBlocked(false); r.advance(200, intent({ fireHeld: true })); assert.equal(r.mag, before.loadout.ammo);
    r.advance(1000, intent()); r.advance(1016, intent({ fireHeld: true, source: 'touch' })); assert.equal(r.mag, before.loadout.ammo - 1);
    r.pause('blur'); const paused = r.snapshot(); r.advance(10000, intent({ firePressed: true })); assert.deepEqual(r.snapshot(), paused);
});
test('shotgun batches report six actual pellets without additional RNG draws, and aim is continuous', () => {
    const f = fixture(); safe(f); f.driver.weapon('shotgun'); const r = f.runtime;
    const c = r.snapshot(), random = D.seededRandom(c.rng), angle = .2137, spread = D.WEAPONS.shotgun.spread * .35;
    const normalized = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const angles = Array.from({ length: 6 }, () => normalized + (random() - .5) * spread);
    const batch = r.advance(0, intent({ aim: angle, precise: true, firePressed: true }));
    const shot = batch.events.find(e => e.type === 'shot'); assert.ok(shot?.type === 'shot'); assert.equal(shot.pellets.length, 6);
    assert.deepEqual(shot.pellets.map(p => p.angle), angles); assert.equal(r.snapshot().rng, random.getState());
    assert.equal(r.snapshot().nextEntity, c.nextEntity + 6); assert.equal(r.player.rotation, normalized);
    for (const pellet of shot.pellets) { const bullet = r.bullets.find(b => b.uid === pellet.bullet)!;
        assert.ok(Math.abs(bullet.rotation - pellet.angle) < 1e-12); assert.deepEqual(pellet.origin, { x: bullet.x, y: bullet.y }); }
    const mag = r.mag; r.advance(20, intent()); assert.equal(r.mag, mag);
});
test('commands and fireHeld only reach first substep; primary and knife retain actual weapon semantics', () => {
    const f = fixture(); safe(f); const r = f.runtime;
    r.advance(0, intent({ commands: ['knife'] })); assert.equal(r.current().frame.player.weapon, 'knife');
    r.advance(1000, intent({ commands: ['primary'], fireHeld: true, source: 'touch' }));
    assert.equal(r.current().events.filter(e => e.type === 'shot').length, 1);
    assert.equal(r.current().frame.player.weapon, 'pistol');
});
test('map data retains classic water, real door orientation, stable region IDs and half-open revelation', () => {
    const classic = fixture(), f = fixture(true), r = f.runtime;
    assert.equal(classic.runtime.current().map.terrain[0][0], 2); assert.equal(classic.runtime.current().map.cells[0][0], 'floor');
    assert.equal(classic.runtime.current().map.doors.length, 0);
    const map = r.current().map; assert.equal(map.doors.find(d => d.id === 'resident-front')!.wall, 'ew');
    assert.equal(map.doors.find(d => d.id === 'resident-west')!.wall, 'ns');
    assert.equal(map.buildings.find(b => b.regionIds.length)!.w, 9 * 32);
    f.driver.placePlayer({ x: 464, y: 352 }); assert.equal(Object.values(r.current().frame.revealed).every(Boolean), true);
    f.driver.placePlayer({ x: 800, y: 700 }); assert.equal(Object.values(r.current().frame.revealed).some(Boolean), false);
    const id = map.regions[0].id; f.driver.placePlayer({ x: 464, y: 352 }); assert.equal(r.current().map.regions[0].id, id);
});
test('true reload increments epoch; transaction synchronization and repeated view reads do not', () => {
    const f = fixture(true), r = f.runtime; safe(f); const epoch = r.epoch;
    r.advance(0, intent()); r.advance(125, intent()); assert.equal(r.epoch, epoch);
    const snapshot = r.snapshotExpansion(); for (let i = 0; i < 10; i++) r.current(); assert.deepEqual(r.snapshotExpansion(), snapshot);
    assert.equal(r.checkpoint(), true); assert.equal(r.epoch, epoch);
    r.reloadCommitted(); const b = r.current(); assert.equal(b.stamp.epoch, epoch + 1); assert.equal(b.frame.player.vx, 0);
});
test('door mutation failure publishes no success, and retries original candidate exactly once', () => {
    const f = fixture(true), r = f.runtime; f.driver.freezeAI(true); f.driver.placePlayer({ x: 464, y: 432 });
    r.advance(0, intent()); const before = r.snapshotExpansion(); const epoch = r.epoch;
    f.fail(true); const failed = r.advance(16, intent({ interactPressed: true }));
    assert.equal(failed.frame.doors['resident-front'], false); assert.ok(failed.events.some(e => e.type === 'rejected'));
    assert.equal(failed.events.some(e => e.type === 'door'), false); assert.equal(r.epoch, epoch);
    assert.equal(r.snapshotExpansion().raid!.rng, before.raid!.rng);
    f.fail(false); assert.equal(r.retrySave(), true); const committed = r.current();
    assert.equal(committed.frame.doors['resident-front'], true); assert.equal(r.epoch, epoch);
    assert.equal(committed.events.filter(e => e.type === 'door' && e.durability === 'committed').length, 1);
    r.retrySave(); assert.equal(r.current().events.some(e => e.type === 'door'), false);
});
test('layer commit moves epoch once, freezes source time and filters source event stamps', () => {
    const f = fixture(true), r = f.runtime; f.driver.freezeAI(true); f.driver.placePlayer({ x: 560, y: 272 });
    const epoch = r.epoch, source = r.snapshotExpansion().raid!.maps.coast.localTime;
    f.fail(true); r.advance(0, intent({ interactPressed: true })); assert.equal(r.current().stamp.world.mapId, 'coast');
    f.fail(false); assert.equal(r.retrySave(), true); const batch = r.current();
    assert.equal(batch.stamp.world.mapId, 'resident-f2'); assert.equal(batch.stamp.epoch, epoch + 1);
    assert.equal(batch.frame.player.vx, 0); assert.equal(batch.events.filter(e => e.type === 'layer').length, 1);
    r.advance(100, intent()); r.advance(1100, intent()); assert.equal(r.snapshotExpansion().raid!.maps.coast.localTime, source);
});
test('ground pickup and medical failures roll back world, inventory and vitals', () => {
    for (const layered of [false, true]) {
        const f = fixture(layered), r = f.runtime; safe(f);
        const c = r.snapshot(), uid = c.loot[0].uid; c.loot = [{ x: r.player.x + 8, y: r.player.y, uid, id: 'scrap', qty: 1, relief: false }]; c.hp = 40;
        r.restore(c); const before = r.snapshot(); f.fail(true);
        assert.equal(r.pickupLoot(uid), false); assert.deepEqual(r.snapshot(), before);
        assert.equal(r.current().events.some(e => e.type === 'looted'), false);
        r.heal(); assert.deepEqual(r.snapshot(), before);
        f.fail(false); assert.equal(r.retrySave(), true, f.state.storageError); assert.equal(r.pickupLoot(uid), true, f.state.storageError);
        assert.equal(r.current().events.some(e => e.type === 'looted' && e.qty === 1 && e.durability === 'committed'), true);
        decodeSession(f.data.get(SESSION_KEY)!);
    }
});
test('stale container TargetRef cannot select or transfer from a new run/map', () => {
    const f = fixture(true), r = f.runtime, c = r.containers[0];
    f.driver.placePlayer(c); const key = r.current().stamp.world;
    assert.equal(r.selectTarget({ runId: 'wrong', mapId: key.mapId, kind: 'container', id: c.id }), false);
    assert.equal(r.selectTarget({ runId: key.runId, mapId: 'resident-f2', kind: 'container', id: c.id }), false);
    assert.equal(r.selectTarget({ runId: key.runId, mapId: key.mapId, kind: 'container', id: c.id }), true);
});
test('classic corpse rotation and container survive snapshot reconstruction without death replay', () => {
    const f = fixture(), r = f.runtime, enemy = r.enemies[0], angle = .37; enemy.rotation = angle;
    r.damageEnemy(enemy, 10000); const c = r.snapshot(), batch = r.current(), body = batch.frame.actors.find(e => e.uid === enemy.uid)!;
    assert.ok(Math.abs(c.enemies[0].rotation - angle - Math.PI / 2) < 1e-12); assert.ok(Math.abs(body.corpse!.angle - angle) < 1e-12);
    assert.equal(body.corpse!.containerId, `corpse-${enemy.uid}`);
    r.restore(c); assert.deepEqual(r.current().frame.actors.find(e => e.uid === enemy.uid)!.corpse, body.corpse);
    assert.equal(r.snapshot().rng, c.rng);
});
test('all terminal failures preserve pending backup; success precedes disposal and no duplicate rewards', () => {
    for (const reason of ['extract', 'death', 'timeout', 'abandon'] as const) {
        const f = fixture(true), r = f.runtime; f.fail(true); r.finish(reason);
        assert.equal(r.current().frame.phase, 'ending'); assert.equal(r.settlement.committed, false);
        assert.ok(f.saves.backupRecord()!.terminal); assert.throws(() => r.dispose(), /Settlement/);
        const pending = structuredClone(f.state.pendingSettlement); f.fail(false); assert.equal(r.retrySettlement(), true);
        assert.deepEqual(f.state.save, pending); assert.equal(r.settlement.committed, true); assert.equal(r.retrySettlement(), false);
        r.dispose(); assert.throws(() => r.advance(0, intent()), /disposed/);
    }
});
test('extraction needs held 3 seconds, and movement intent interrupts it', () => {
    const f = fixture(), r = f.runtime; f.driver.freezeAI(true); f.driver.placePlayer(r.visibleExits[0]);
    r.advance(0, intent()); for (let t = 100; t <= 2900; t += 100) r.advance(t, intent({ interactHeld: true }));
    assert.equal(r.ending, false); assert.ok(r.extractTime > 2.8);
    r.advance(3000, intent({ interactHeld: true, move: { x: 1, y: 0, sprint: false } })); assert.equal(r.extractTime, 0);
    f.driver.placePlayer(r.visibleExits[0]); for (let t = 3100; t <= 6200 && !r.ending; t += 100) r.advance(t, intent({ interactHeld: true }));
    assert.equal(r.settlement.committed, true); assert.equal(f.state.result!.outcome, 'extract');
});
test('shared layered observation is side-effect-free for hits and departure', () => {
    const f = fixture(true), original = f.runtime.snapshotExpansion();
    original.raid!.currentMap = 'resident-f2'; original.raid!.player = { x: 80, y: 80, rotation: 0 };
    const layer = original.raid!.maps['resident-f2']; layer.enemies[0].x = 160; layer.enemies[0].y = 80;
    layer.bullets = [{ uid: 'entity-test', x: 100, y: 80, rotation: 0, vx: 760, vy: 0, left: 500, damage: 20, enemy: false }];
    const a = structuredClone(original), b = structuredClone(original), events: unknown[] = [];
    advanceLayerShots(a, BUILDING_WORLD, 'resident-f2', .2);
    advanceLayerShots(b, BUILDING_WORLD, 'resident-f2', .2, undefined, undefined, e => events.push(e));
    assert.deepEqual(a, b); assert.ok(events.length);
    a.raid!.player = { x: 304, y: 80, rotation: 0 }; b.raid!.player = { ...a.raid!.player };
    assert.equal(changeLayer(a, BUILDING_WORLD, 'resident-down'), changeLayer(b, BUILDING_WORLD, 'resident-down', e => events.push(e)));
    assert.deepEqual(a, b);
});
test('test fixture capabilities require explicit opt-in', () => {
    assert.throws(() => createRuntimeTestDriver(fixture().runtime, ''), /test=1/);
    assert.throws(() => createRuntimeTestDriver(fixture().runtime, '?test=0'), /test=1/);
});

test('medical commit failure rolls back an actual available supply and successful retry commits once', () => {
    for (const layered of [false, true]) {
        const f = fixture(layered), r = f.runtime; safe(f);
        const c = r.snapshot(); c.hp = 40; c.bleeding = 1;
        D.addItem(c.loadout.bag, 'bandage', 1); r.restore(c);
        const before = r.snapshot(); f.fail(true); r.heal();
        assert.deepEqual(r.snapshot(), before); assert.equal(r.current().frame.phase, 'paused');
        assert.ok(r.current().events.some(e => e.type === 'rejected' && e.action === 'heal'));
        f.fail(false); assert.equal(r.retrySave(), true); r.heal();
        assert.equal(r.bleeding, 0); assert.equal(D.count(r.snapshot().loadout.bag, 'bandage'), D.count(before.loadout.bag, 'bandage') - 1);
        assert.ok(r.current().events.some(e => e.type === 'notice' && e.durability === 'committed'));
    }
});

test('container transfer is atomic, partial quantity is truthful, and stale requests cannot redirect it', () => {
    for (const layered of [false, true]) {
        const f = fixture(layered), r = f.runtime, c = r.snapshot();
        const container = c.containers![0]; container.inventory.items = []; D.addItem(container.inventory, 'scrap', 3);
        c.loadout.bag.items = []; r.restore(c); f.driver.placePlayer(container);
        const ref = { runId: container.runId, mapId: 'coast', kind: 'container' as const, id: container.id };
        const request = { runId: container.runId, containerId: container.id, from: 'container' as const, to: 'bag' as const,
            uid: container.inventory.items[0].uid, x: 0, y: 0, quantity: 1 };
        const before = r.snapshot(); f.fail(true); assert.equal(r.transferLoot(ref, request), 'save-failed');
        assert.deepEqual(r.snapshot(), before); assert.ok(!r.current().events.some(e => e.type === 'looted'));
        f.fail(false); assert.equal(r.retrySave(), true, f.state.storageError);
        assert.equal(r.transferLoot({ ...ref, mapId: 'resident-f2' }, request), 'rejected');
        assert.equal(r.transferLoot(ref, request), 'committed');
        assert.equal(D.count(r.snapshot().loadout.bag, 'scrap'), 1);
        assert.equal(D.count(r.getLootContainer(ref.id)!.inventory, 'scrap'), 2);
        const event = r.current().events.find(e => e.type === 'looted');
        assert.ok(event?.type === 'looted'); assert.equal(event.qty, 1); assert.equal(event.partial, true);
        assert.equal(event.durability, 'committed');
    }
});

test('failed departure discards source hit effects; retry emits source stamp and commits original RNG', () => {
    const f = fixture(true), r = f.runtime; f.driver.freezeAI(true); f.driver.placePlayer({ x: 560, y: 272 });
    const c = r.snapshot(), enemy = c.enemies[0];
    Object.assign(enemy, { x: 500, y: 300, home: { x: 500, y: 300 }, target: { x: 500, y: 300 }, hp: 1, path: [] });
    const serial = c.nextEntity++;
    c.bullets = [{ uid: entityUid(r.layered!.raid!, serial), x: 450, y: 300, rotation: 0, vx: 760, vy: 0, left: 100, damage: 1000, enemy: false }];
    r.restore(c); const initial = r.snapshotExpansion(), epoch = r.epoch;
    f.fail(true); const failed = r.advance(0, intent({ interactPressed: true }));
    assert.ok(!failed.events.some(e => e.type === 'death')); assert.equal(r.enemies[0].hp, 1);
    assert.equal(failed.frame.actors[0].state.hurtLeft, 0); assert.equal(r.snapshot().rng, initial.raid!.rng);
    f.fail(false); assert.equal(r.retrySave(), true, f.state.storageError); const batch = r.current();
    const death = batch.events.find(e => e.type === 'death' && e.uid === enemy.uid);
    assert.ok(death); assert.equal(death.stamp.world.mapId, 'coast'); assert.equal(death.stamp.epoch, epoch);
    assert.equal(death.durability, 'committed'); assert.equal(batch.stamp.world.mapId, 'resident-f2');
    assert.equal(batch.stamp.epoch, epoch + 1); assert.equal(r.snapshotExpansion().raid!.maps.coast.enemies[0].hp, 0);
    const rng = r.snapshot().rng; r.retrySave(); assert.equal(r.snapshot().rng, rng); assert.ok(!r.current().events.some(e => e.type === 'death'));
});

test('environment damage has no direction and consumes no combat RNG', () => {
    const f = fixture(), r = f.runtime; safe(f); r.bleeding = 1;
    r.advance(0, intent()); const rng = r.snapshot().rng;
    const batch = r.advance(125, intent()), event = batch.events.find(e => e.type === 'hurt');
    assert.ok(event?.type === 'hurt'); assert.equal(event.angle, null); assert.ok(event.damage > 0);
    assert.equal(r.snapshot().rng, rng);
});

test('region boundary, sealed overlap and 16px revelation cache retain fail-closed presentation', () => {
    const f = fixture(true), r = f.runtime, base = r.current().map;
    const region = { ...base.regions[0], x: 0, y: 0, w: 100, h: 100, inside: true, sealed: false };
    assert.equal(contains(region, { x: 100, y: 50 }), false); assert.equal(contains(region, { x: 99.9, y: 50 }), true);
    const map = { ...base, regions: [region, { ...region, id: 'sealed', sealed: true }] };
    r.player.x = r.player.y = 50; const revelation = new Revelation();
    const first = revelation.read(r, map); assert.equal(first[region.id], true); assert.equal(first.sealed, false);
    r.player.x++; assert.equal(revelation.read(r, map), first);
    r.revelation.reset(); assert.equal(frameView(r, map, new Map()).player.regionId, 'sealed');
});

test('DDA observes corner, start-blocked, range and transmissive low/window without changing outcomes', () => {
    const f = fixture(true), state = f.runtime.snapshotExpansion(), world = structuredClone(BUILDING_WORLD);
    const map = world.maps.coast; map.doors = [];
    map.cells = Array.from({ length: 5 }, () => Array(5).fill('floor'));
    state.raid!.maps.coast.enemies = []; state.raid!.maps.coast.doors = {};
    const bullet = { uid: 'entity-1', x: 48, y: 48, rotation: 0, vx: 100, vy: 100, left: 80, damage: 1, enemy: false };
    const events: ShotObservation[] = [];
    map.cells[1][2] = 'wall';
    assert.equal(resolveLayerShot(state, world, 'coast', bullet, false, undefined, undefined, e => events.push(e)), true);
    assert.equal(events[0].reason, 'blocked'); assert.equal(events[0].normal, null);
    map.cells[1][1] = 'wall'; events.length = 0;
    resolveLayerShot(state, world, 'coast', bullet, false, undefined, undefined, e => events.push(e));
    assert.equal(events[0].reason, 'start-blocked'); assert.equal(events[0].normal, null);
    map.cells[1][1] = 'floor'; map.cells[1][2] = 'window'; map.cells[2][2] = 'low'; events.length = 0;
    state.raid!.maps.coast.bullets = [{ ...bullet, left: 60 }];
    advanceLayerShots(state, world, 'coast', 1, undefined, undefined, e => events.push(e));
    assert.deepEqual(events.map(e => e.reason), ['range']); assert.equal(events[0].normal, null);
});

test('storage conflict freezes world and blocks all durable effects', () => {
    const f = fixture(true), r = f.runtime; safe(f); r.advance(0, intent()); const before = r.snapshotExpansion(), writes = f.writes;
    f.saves.markConflict(); r.advance(1000, intent({ firePressed: true, commands: ['heal'] }));
    assert.deepEqual(r.snapshotExpansion(), before); assert.equal(f.writes, writes);
    assert.equal(r.checkpoint(), false); assert.equal(r.retrySave(), false); r.finish('abandon'); assert.equal(r.ending, false);
});

test('production host exposes no mutable core or fixture controls and preserves terminal retry', () => {
    const state = createSessionState(), data = new Map<string, string>(); let fail = false;
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (fail) throw Error('quota'); data.set(k, v); } }));
    assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42, true), true); state.state = 'run';
    const host = createCoastRaidHost(state, saves);
    assert.deepEqual(Object.keys(host.runtime).sort(), ['advance', 'current', 'dispose', 'pause', 'resume', 'setBlocked']);
    assert.equal('test' in host, false); assert.equal('freezeAI' in host.runtime, false);
    fail = true; host.services.abandon(); assert.equal(host.runtime.current().frame.phase, 'ending');
    assert.equal(host.services.settlement().retryable, true); assert.ok(host.services.backup()!.terminal);
    fail = false; assert.equal(host.services.retrySettlement(), true); host.runtime.dispose();
});

test('warning, tide and timeout use global elapsed with timeout before input', () => {
    for (const layered of [false, true]) {
        const f = fixture(layered), r = f.runtime; safe(f); const initialHigh = r.highTide;
        r.elapsed = 269.95; r.advance(0, intent()); r.advance(100, intent());
        assert.equal(r.warned, true); assert.equal(r.tideChanged, false);
        r.elapsed = 299.95; r.advance(200, intent()); assert.equal(r.tideChanged, true); assert.equal(r.highTide, !initialHigh);
        r.elapsed = 599.95; const mag = r.mag;
        r.advance(300, intent({ firePressed: true, commands: ['heal'], interactHeld: true }));
        assert.equal(r.mag, mag); assert.equal(r.settlement.committed, true); assert.equal(f.state.result!.outcome, 'timeout');
        assert.ok(!r.current().events.some(e => e.type === 'shot'));
    }
});

test('drop and equip failure restore ammunition provenance, inventory, ground and allocator', () => {
    for (const layered of [false, true]) {
        const f = fixture(layered), r = f.runtime; safe(f); const c = r.snapshot();
        c.loadout.bag.items = []; D.addItem(c.loadout.bag, 'carbine', 1); D.addItem(c.loadout.bag, 'bandage', 1, true); r.restore(c);
        const before = r.snapshot(), gun = before.loadout.bag.items.find(i => i.id === 'carbine')!, bandage = before.loadout.bag.items.find(i => i.id === 'bandage')!;
        f.fail(true); assert.equal(r.equipItem(gun.uid), 'save-failed'); assert.deepEqual(r.snapshot(), before);
        f.fail(false); assert.equal(r.retrySave(), true); f.fail(true);
        assert.equal(r.dropItem(bandage.uid), 'save-failed'); assert.deepEqual(r.snapshot(), before);
        f.fail(false); assert.equal(r.retrySave(), true); assert.equal(r.dropItem(bandage.uid), 'committed');
        const ground = r.loot.at(-1)!; assert.equal(ground.id, 'bandage'); assert.equal(ground.relief, true);
        assert.equal(r.snapshot().nextEntity, before.nextEntity + 1); assert.equal(D.count(r.snapshot().loadout.bag, 'bandage'), 0);
    }
});

test('startup cancellation detaches ownership without writing, advancing RNG, or settling the saved raid', () => {
    for (const layered of [false, true]) {
        const f = fixture(layered), before = f.data.get(SESSION_KEY), writes = f.writes;
        const initial = f.runtime.snapshot();
        f.runtime.cancelStart(); f.runtime.cancelStart();
        assert.equal(f.runtime.disposed, true);
        assert.equal(f.data.get(SESSION_KEY), before); assert.equal(f.writes, writes);
        assert.equal(f.state.pendingSettlement, null); assert.equal(f.state.result, null);
        assert.throws(() => f.runtime.current(), /disposed/);
        const next = new CoastRaidRuntime(f.state, f.saves);
        assert.deepEqual(next.snapshot(), initial);
        next.advance(0, intent());
        assert.throws(() => next.cancelStart(), /unstarted/);
        assert.throws(() => next.dispose(), /Settlement/);
        f.fail(true); next.finish('abandon');
        assert.throws(() => next.cancelStart(), /unstarted/);
        assert.throws(() => next.dispose(), /Settlement/);
        f.fail(false); assert.equal(next.retrySettlement(), true);
        next.dispose(); next.dispose();
    }
});
