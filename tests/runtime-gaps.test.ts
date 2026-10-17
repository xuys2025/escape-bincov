import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { wrapCoastRuntime } from '../src/raid-runtime/host';

function fixture(layered = false) {
    const data = new Map<string, string>(); let fail = false, writes = 0;
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (fail) throw Error('quota'); data.set(k, v); writes++; } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(42, layered)); state.state = 'run';
    const r = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(r, '?test=1'); driver.freezeAI(true);
    const host = wrapCoastRuntime(r, state, saves);
    return { state, saves, data, r, driver, host, fail: (v: boolean) => { fail = v; }, get writes() { return writes; } };
}
for (const layered of [false, true]) {
    test(`healing refusal preserves explanation, state and held movement (${layered})`, () => {
        const f = fixture(layered), { r } = f;
        f.driver.placePlayer({ x: 208, y: 80 });
        const c = r.snapshot(); c.hp = r.limits.hp; c.bleeding = 0; D.addItem(c.loadout.bag, 'bandage', 1); r.restore(c);
        for (const action of ['heal', 'use-item']) {
            const before = r.snapshot(), writes = f.writes;
            if (action === 'heal') r.heal(); else assert.equal(f.host.services.useSupply('bandage'), 'rejected');
            const events = r.current().events;
            assert.equal(events.length, 1); assert.ok(events[0].type === 'rejected');
            assert.equal(events[0].action, action); assert.match(events[0].reason, /生命已满/);
            assert.equal(events[0].durability, 'accepted'); assert.equal(f.writes, writes); assert.deepEqual(r.snapshot(), before);
        }
        const moving = { ...emptyIntent(), move: { x: 1, y: 0, sprint: false }, commands: ['heal' as const] };
        r.advance(0, emptyIntent()); const x = r.player.x; r.advance(100, moving); assert.ok(r.player.x > x);
        f.driver.vitals({ hp: 40 }); const before = r.snapshot(); f.fail(true); r.heal();
        assert.deepEqual(r.snapshot(), before);
        assert.ok(r.current().events.some(e => e.type === 'rejected' && e.reason === 'save-failed'));
        assert.equal(r.current().events.some(e => e.type === 'notice'), false, 'no success text from rolled-back healing');
    });

    test(`ground references bypass overlapping crate, commit once and roll back atomically (${layered})`, () => {
        const f = fixture(layered), { r } = f, crate = r.containers[0]; f.driver.placePlayer(crate);
        const uid = f.driver.spawnLoot('scrap', 1, crate), second = f.driver.spawnLoot('scrap', 1, crate);
        const ref = { ...r.current().stamp.world, kind: 'ground' as const, id: uid };
        assert.equal(r.targetView()?.kind, 'container');
        const before = r.snapshot(), raw = f.data.get(SESSION_KEY), writes = f.writes;
        assert.equal(f.host.services.activate({ ...ref, runId: 'stale' }), false);
        assert.equal(f.host.services.activate({ ...ref, mapId: 'stale' }), false);
        assert.deepEqual(r.snapshot(), before); assert.equal(f.writes, writes);
        f.fail(true); assert.equal(f.host.services.activate(ref), false);
        assert.deepEqual(r.snapshot(), before); assert.equal(f.data.get(SESSION_KEY), raw);
        assert.equal(r.current().events.some(e => e.type === 'looted'), false);
        f.fail(false); assert.ok(r.retrySave()); const retryWrites = f.writes;
        assert.ok(f.host.services.activate(ref)); assert.equal(f.writes, retryWrites + 1);
        assert.equal(r.loot.some(l => l.uid === uid), false); assert.ok(r.loot.some(l => l.uid === second));
        assert.deepEqual(r.containers, before.containers);
        const event = r.current().events.find(e => e.type === 'looted'); assert.ok(event && event.durability === 'committed');
        const record = decodeSession(f.data.get(SESSION_KEY)!);
        const saved = record.expansion?.raid ? record.expansion.raid.maps[record.expansion.raid.currentMap].loot : record.raid!.loot;
        assert.equal(saved.some(l => l.uid === uid), false);
        assert.equal(f.host.services.activate(ref), false); assert.equal(f.writes, retryWrites + 1);
    });

    test(`explicit ground refs enforce the entire nearbyLoot set and overlays (${layered})`, () => {
        const f = fixture(layered), { r } = f; f.driver.placePlayer({ x: 208, y: 80 });
        f.driver.spawnLoot('scrap', 1, { x: 251, y: 80 }); // strict <43 boundary
        const near = new Set(r.nearbyLoot().map(l => l.uid)), before = r.snapshot(), writes = f.writes;
        for (const loot of [...r.loot].filter(l => !near.has(l.uid))) {
            assert.equal(f.host.services.activate({ ...r.current().stamp.world, kind: 'ground', id: loot.uid }), false);
        }
        assert.deepEqual(r.snapshot(), before); assert.equal(f.writes, writes);
        const uid = f.driver.spawnLoot('scrap', 1, r.player), ref = { ...r.current().stamp.world, kind: 'ground' as const, id: uid };
        r.setBlocked(true); assert.equal(f.host.services.activate(ref), false); r.setBlocked(false);
        r.pause('overlay'); assert.equal(f.host.services.activate(ref), false); r.resume();
        f.state.conflict = true; assert.equal(f.host.services.activate(ref), false); assert.ok(r.loot.some(l => l.uid === uid));
    });
}

test('door rejects unreachable and occupied separately without writes or success events', () => {
    const f = fixture(true), { r, driver } = f;
    const ref = { ...r.current().stamp.world, kind: 'door' as const, id: 'resident-front' };
    const writes = f.writes; assert.equal(f.host.services.activate(ref), false);
    assert.ok(r.current().events.some(e => e.type === 'rejected' && e.action === 'door' && e.reason === 'unreachable'));
    assert.equal(f.writes, writes);
    driver.placePlayer({ x: 464, y: 432 }); assert.ok(f.host.services.activate(ref));
    const door = r.space!.definition.doors.find(d => d.id === ref.id)!;
    driver.placeEnemy(r.enemies[0].uid, { x: door.x * 32 + 16, y: door.y * 32 + 16 });
    const before = r.snapshotExpansion(), occupiedWrites = f.writes; r.current();
    assert.equal(f.host.services.activate(ref), false); assert.deepEqual(r.snapshotExpansion(), before);
    assert.equal(f.writes, occupiedWrites); const events = r.current().events;
    assert.ok(events.some(e => e.type === 'rejected' && e.reason === 'occupied'));
    assert.equal(events.some(e => e.type === 'door'), false);
    driver.placeEnemy(r.enemies[0].uid, { x: 208, y: 80 }); assert.ok(f.host.services.activate(ref));
    assert.equal(r.space!.doors[ref.id], false); assert.equal(f.writes, occupiedWrites + 1);
});

test('resetClock excludes mounting and layer baking gaps but preserves simulation, pauses and genuine stalls', () => {
    const f = fixture(true), { r } = f, port = f.host.runtime;
    port.advance(0, emptyIntent()); const before = r.snapshotExpansion(), writes = f.writes;
    port.resetClock(); port.advance(5000, emptyIntent()); assert.equal(r.elapsed, 0); assert.equal(r.paused, false);
    assert.equal(f.writes, writes); assert.deepEqual(r.snapshotExpansion(), before);
    port.advance(5100, emptyIntent()); assert.equal(r.elapsed, .1);
    f.driver.placePlayer({ x: 560, y: 272 }); assert.ok(f.host.services.activate(r.targetView()!.ref));
    assert.equal(r.current().stamp.world.mapId, 'resident-f2');
    const elapsed = r.elapsed, epoch = r.epoch;
    port.resetClock(); port.advance(10000, emptyIntent()); assert.equal(r.elapsed, elapsed); assert.equal(r.epoch, epoch);
    port.advance(10100, emptyIntent()); assert.equal(r.elapsed, elapsed + .1);
    port.advance(12101, emptyIntent()); assert.ok(r.paused); const paused = r.elapsed;
    port.resetClock(); port.advance(20000, emptyIntent()); assert.ok(r.paused); assert.equal(r.elapsed, paused);
    assert.throws(() => port.advance(19999, emptyIntent()), /monotonic/);
    port.resume(); port.advance(21000, emptyIntent()); port.advance(21100, emptyIntent()); assert.equal(r.elapsed, paused + .1);
    r.finish('abandon'); port.dispose(); assert.throws(() => port.resetClock(), /disposed/);
});

test('death intentionally returns layered body at 1 HP and redeploy does not heal it', () => {
    const f = fixture(true); f.driver.hurt(10000); assert.equal(f.state.expansion!.body.hp, 1);
    f.r.dispose(); f.state.state = 'hideout'; assert.ok(f.saves.beginRun(43, true)); f.state.state = 'run';
    const next = new CoastRaidRuntime(f.state, f.saves); assert.equal(next.hp, 1);
});

test('ground pickup preserves partial quantities and rejects a full bag without writes', () => {
    const f = fixture(), { r } = f; f.driver.placePlayer({ x: 208, y: 80 });
    const c = r.snapshot(); c.loadout.bag.items = [];
    assert.equal(D.addItem(c.loadout.bag, 'scrap', c.loadout.bag.w * c.loadout.bag.h * D.ITEMS.scrap.stack), 0);
    c.loadout.bag.items[0].qty--; r.restore(c);
    const uid = f.driver.spawnLoot('scrap', 2, r.player), ref = { ...r.current().stamp.world, kind: 'ground' as const, id: uid };
    const writes = f.writes; assert.ok(f.host.services.activate(ref)); assert.equal(f.writes, writes + 1);
    assert.equal(r.loot.find(l => l.uid === uid)!.qty, 1);
    assert.ok(r.current().events.some(e => e.type === 'looted' && e.partial && e.qty === 1));
    const before = r.snapshot(); assert.equal(f.host.services.activate(ref), false);
    assert.deepEqual(r.snapshot(), before); assert.equal(f.writes, writes + 1); decodeSession(f.data.get(SESSION_KEY)!);
});

test('lethal classic pollution and layered environmental damage persist nonnegative health once', () => {
    for (const layered of [false, true]) for (const cause of ['pollution', 'bleeding'] as const) {
        const f = fixture(layered), { r } = f;
        // Classic with a body must pass body validation as well as the checkpoint schema.
        if (!layered) assert.ok(f.saves.enableExpansion(1800000000000));
        const c = r.snapshot(); c.hp = .001; c.pollution = cause === 'pollution' ? 100 : 0; c.bleeding = cause === 'bleeding' ? 1 : 0; r.restore(c);
        const writes = f.writes; r.advance(0, emptyIntent()); r.advance(100, emptyIntent());
        assert.equal(r.settlement.reason, 'death'); assert.ok(r.settlement.committed, f.state.storageError);
        const record = decodeSession(f.data.get(SESSION_KEY)!); assert.ok(record.expansion!.body.hp >= 0);
        assert.equal(f.writes, writes + 1); assert.equal(r.retrySettlement(), false); r.finish('death'); assert.equal(f.writes, writes + 1);
    }
});
