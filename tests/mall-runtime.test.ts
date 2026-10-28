import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState } from '../src/session';
import { SESSION_KEY } from '../src/recovery-store';
import { encodeRecoveryBackup, decodePortableBackup } from '../src/save-backup';
import { mallRunConfig, mallWorldV2, mallWorldV3, mallWorldV4, MALL_ANCHORS, MALL_PASSAGES } from '../src/mall-world';
import { BUILDING_WORLD } from '../src/building-world';
import { entityUid, type ExpansionState, type WorldDefinition } from '../src/expansion-state';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver, createTestCoastHost } from '../src/raid-runtime/test-support';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { checkpointBodyFits, corridor, findLanding, traversable } from '../src/spatial';
import type { RaidIntent, TargetRef, StampedEvent } from '../src/raid-runtime/contract';
import type { Point } from '../src/world';
import { placementError } from '../src/loot';
import { plainCrit } from './fixtures/layered';

const now = () => 1800000000000;
const at = (x: number, y: number) => ({ x: (x + .5) * 32, y: (y + .5) * 32 });
const intent = (patch: Partial<RaidIntent> = {}): RaidIntent => ({ ...emptyIntent(), ...patch });
function session(raw?: string) {
    const data = new Map<string, string>(raw ? [[SESSION_KEY, raw]] : []); let failed = false, writes = 0;
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failed) throw Error('mall quota fault'); data.set(k, v); writes++; } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, now);
    const initialized = saves.initialize();
    return { state, saves, data, storage, initialized, fail: (value = true) => { failed = value; },
        get raw() { return data.get(SESSION_KEY)!; }, get writes() { return writes; } };
}
function fixture(layout: 1 | 2 | 3 | 4 = 2, seed = 42) {
    const f = session(); assert.ok(f.initialized); f.state.state = 'hideout';
    assert.ok(f.saves.beginRun(seed, 'mall', { mallLayout: layout })); f.state.state = 'run';
    const r = new CoastRaidRuntime(f.state, f.saves), driver = createRuntimeTestDriver(r, '?test=1'); driver.freezeAI(true);
    let clock = 0; const events: StampedEvent[] = [];
    const tick = (seconds: number, input = intent()) => {
        for (let left = Math.round(seconds * 1000), first = true; left > 0; first = false) {
            const dt = Math.min(left, 100); clock += dt; left -= dt;
            const batch = r.advance(clock, first ? input : { ...input, firePressed: false, interactPressed: false, commands: [], selectTarget: null });
            events.push(...batch.events);
        }
        return r.current();
    };
    return { ...f, get raw() { return f.raw; }, get writes() { return f.writes; }, r, driver, tick, events };
}
type Fixture = ReturnType<typeof fixture>;
function restore(raw: string) {
    const f = session(raw); assert.ok(f.initialized, f.state.storageError); assert.ok(f.saves.resumeRun()); f.state.state = 'run';
    return { ...f, r: new CoastRaidRuntime(f.state, f.saves) };
}
function edit(f: Fixture, change: (state: ExpansionState) => void) {
    const state = f.r.snapshotExpansion(); change(state); f.r.restoreExpansion(state);
}
function ref(f: Fixture, kind: TargetRef['kind'], id: string): TargetRef {
    return { runId: f.r.current().map.key.runId, mapId: f.r.current().map.key.mapId, kind, id };
}
function entry(f: Fixture, id: string, map = f.r.current().map.key.mapId) {
    const e = f.r.layeredWorld!.maps[map].entries.find(e => e.id === id)!; assert.ok(e, id);
    f.driver.placePlayer(e.at, 0, map); return e;
}
function change(f: Fixture, id: string, map?: string) {
    const e = entry(f, id, map); assert.ok(f.r.activate(ref(f, 'entry', id)), id);
    assert.equal(f.r.current().map.key.mapId, e.targetMap); return e;
}
const population = (state: ExpansionState) => Object.values(state.raid!.maps).flatMap(m => m.enemies.map(e => e.uid)).concat(state.raid!.pursuits.map(p => p.enemy.uid)).sort();

test('A1: deployment defaults to v1; explicit v2, v3 or v4 is atomic and cannot change an active raid or other routes', () => {
    for (const layout of [undefined, 1, 2, 3, 4] as const) {
        const f = session(); f.state.state = 'hideout'; const before = f.raw, profile = structuredClone(f.state.save);
        f.fail(); assert.equal(f.saves.beginRun(42, 'mall', { mallLayout: layout }), false);
        assert.equal(f.raw, before); assert.deepEqual(f.state.save, profile); assert.equal(f.state.expansion, null);
        f.fail(false); assert.ok(f.saves.beginRun(42, 'mall', { mallLayout: layout }));
        assert.equal(f.state.expansion!.raid!.worldVersion, `mall-v${layout ?? 1}`); assert.equal(f.state.expansion!.raid!.layoutRevision, `mall-layout-${layout ?? 1}`);
        const active = f.raw; assert.equal(f.saves.beginRun(43, 'mall', { mallLayout: layout === 2 ? 1 : 2 }), false); assert.equal(f.raw, active);
    }
    for (const [buildings, mallLayout] of [[false, 2], [true, 2], [false, 3], [true, 3], [false, 4], [true, 4]] as const) {
        const f = session(); f.state.state = 'hideout'; assert.ok(f.saves.beginRun(42, buildings, { mallLayout }));
        assert.equal(buildings ? f.state.expansion!.raid!.worldVersion : f.state.checkpoint!.worldVersion, buildings ? BUILDING_WORLD.id : 'coast-v2');
    }
});

test('A1/A3: yard forwards the layout once and the explicitly gated host driver works on both mall floors', () => {
    for (const layout of [undefined, 2, 3, 4] as const) {
        const f = session(), yard = new RealHideoutRuntime(f.state, f.saves, now); assert.ok(yard.enter().ok);
        const deploy = yard.deploy({ world: 'mall', seed: '42', mallLayout: layout }); assert.ok(deploy.ok);
        const bytes = f.raw; assert.ok(yard.startRaid(deploy.runId!).ok); assert.equal(f.raw, bytes);
        assert.equal(yard.startRaid(deploy.runId!).ok, false);
        assert.throws(() => createTestCoastHost(f.state, f.saves, ''), /test=1/);
        const host = createTestCoastHost(f.state, f.saves, '?test=1'); host.driver.freezeAI(true);
        for (const map of ['mall-f1', 'mall-f2']) {
            host.driver.placePlayer(at(60, 45), 0, map); const batch = host.runtime.current();
            assert.equal(batch.map.key.mapId, map); assert.equal(batch.map.key.worldVersion, `mall-v${layout ?? 1}`);
            assert.throws(() => host.driver.placePlayer(at(0, 0), 0, map), /Invalid fixture position/);
            const enemy = batch.frame.actors.find(e => e.alive)!; host.driver.kill(enemy.uid);
            assert.equal(host.runtime.current().frame.actors.find(e => e.uid === enemy.uid)!.alive, false);
        }
    }
});

test('A2: every mall layout uses the exact Phaser mallRunConfig; stable building/indoor IDs and ground-only exits', () => {
    const combos = new Set<string>();
    for (const layout of [1, 2, 3, 4] as const) for (let seed = 1; seed <= 20; seed++) {
        const f = fixture(layout, seed); assert.deepEqual(f.r.config, mallRunConfig(seed)); combos.add(f.r.config.exits.map(e => e.id).join(','));
        for (const mapId of ['mall-f1', 'mall-f2']) {
            f.driver.placePlayer(at(60, 45), 0, mapId); const map = f.r.current().map;
            assert.equal(map.buildings.length, 1); const b = map.buildings[0];
            assert.deepEqual([b.id, b.name, b.kind, b.x, b.y, b.w, b.h], [`mall-v${layout}/mall-layout-${layout}/${mapId}/building/mall`, '滨湾商场', 'mall', 256, 192, 1824, 1376]);
            assert.deepEqual(b.regionIds, map.regions.filter(r => r.inside).map(r => r.id));
            assert.ok(map.regions.every(r => r.buildingId === (r.inside ? b.id : null)));
            assert.equal(map.exits.length, mapId === 'mall-f1' ? 2 : 0);
            assert.ok(!b.regionIds.includes('F2-18')); assert.ok(!map.buildings.some(b => b.name === '褪色居民楼'));
        }
        f.r.cancelStart();
    }
    assert.equal(combos.size, 3);
    const f = fixture(); f.r.cancelStart(); f.state.expansion!.raid!.worldVersion = 'unknown-world';
    assert.throws(() => new CoastRaidRuntime(f.state, f.saves), /does not support/);
});

test('A4/S-03/S-07/S-08: both floors and every layout survive refresh and recovery backup; malformed worlds never overwrite', () => {
    for (const layout of [1, 2, 3, 4] as const) for (const map of ['mall-f1', 'mall-f2']) {
        const f = fixture(layout); f.driver.placePlayer(at(62, 13), .3, map); assert.ok(f.r.checkpoint());
        const expected = f.r.snapshotExpansion(), g = restore(f.raw); assert.deepEqual(g.r.snapshotExpansion(), expected);
        const decoded = decodePortableBackup(encodeRecoveryBackup(f.saves.backupRecord()!)); assert.equal(decoded.kind, 'session');
        if (decoded.kind !== 'session') throw Error('expected live backup');
        const imported = restore(JSON.stringify(decoded.record)); assert.deepEqual(imported.r.snapshotExpansion(), expected);
        for (const [world, revision] of [['mall-v9', 'mall-layout-9'], [`mall-v${layout}`, 'mall-layout-999'], [`mall-v${layout}`, `mall-layout-${layout === 1 ? 2 : 1}`],
            ['mall-v3', 'mall-layout-2'], ['mall-v2', 'mall-layout-3'], ['mall-v4', 'mall-layout-3'], ['mall-v3', 'mall-layout-4']]) {
            const record = JSON.parse(f.raw); Object.assign(record.expansion.raid, { worldVersion: world, layoutRevision: revision });
            const bytes = JSON.stringify(record), broken = session(bytes); assert.equal(broken.initialized, false); assert.equal(broken.raw, bytes);
            assert.equal(broken.saves.persist(), false); assert.equal(broken.raw, bytes); assert.equal(broken.writes, 0);
        }
    }
});

test('A5: a layout-2 raid standing where layout 3 put the new table restores on layout 2; relabelled as layout 3 it never loads or writes', () => {
    // Open floor between the sofa and the old table in layout 2; under the new table in layout 3.
    const p = at(58, 19), fits = (world: WorldDefinition) => traversable({ definition: world.maps['mall-f2'], doors: {}, highTide: true }, p, 'body', 10);
    assert.equal(fits(mallWorldV2()), true); assert.equal(fits(mallWorldV3()), false);
    const f = fixture(2); f.driver.placePlayer(p, 0, 'mall-f2'); assert.ok(f.r.checkpoint());
    const expected = f.r.snapshotExpansion(), g = restore(f.raw), key = g.r.current().map.key;
    assert.deepEqual(g.r.snapshotExpansion(), expected);
    assert.deepEqual([key.worldVersion, key.layoutRevision, key.mapId], ['mall-v2', 'mall-layout-2', 'mall-f2']);
    assert.deepEqual([g.r.player.x, g.r.player.y], [p.x, p.y]); assert.ok(g.r.walkable(p.x, p.y, true));
    const record = JSON.parse(f.raw); Object.assign(record.expansion.raid, { worldVersion: 'mall-v3', layoutRevision: 'mall-layout-3' });
    const bytes = JSON.stringify(record), broken = session(bytes); assert.equal(broken.initialized, false); assert.equal(broken.raw, bytes);
    assert.equal(broken.saves.persist(), false); assert.equal(broken.raw, bytes); assert.equal(broken.writes, 0);
});

test('A5: a layout-3 raid standing where layout 4 put the pharmacy counter restores on layout 3; relabelled as layout 4 it never loads or writes', () => {
    const p = at(13, 11), fits = (world: WorldDefinition) => traversable({ definition: world.maps['mall-f1'], doors: {}, highTide: true }, p, 'body', 10);
    assert.equal(fits(mallWorldV3()), true); assert.equal(fits(mallWorldV4()), false);
    const f = fixture(3); f.driver.placePlayer(p, 0, 'mall-f1'); assert.ok(f.r.checkpoint());
    const expected = f.r.snapshotExpansion(), g = restore(f.raw), key = g.r.current().map.key;
    assert.deepEqual(g.r.snapshotExpansion(), expected);
    assert.deepEqual([key.worldVersion, key.layoutRevision, key.mapId], ['mall-v3', 'mall-layout-3', 'mall-f1']);
    assert.deepEqual([g.r.player.x, g.r.player.y], [p.x, p.y]); assert.ok(g.r.walkable(p.x, p.y, true));
    const record = JSON.parse(f.raw); Object.assign(record.expansion.raid, { worldVersion: 'mall-v4', layoutRevision: 'mall-layout-4' });
    const bytes = JSON.stringify(record), broken = session(bytes); assert.equal(broken.initialized, false); assert.equal(broken.raw, bytes);
    assert.equal(broken.saves.persist(), false); assert.equal(broken.raw, bytes); assert.equal(broken.writes, 0);
});

test('G-06: every connector round-trips ten times in every layout without respawn or duplicate entities', () => {
    for (const layout of [1, 2, 3, 4] as const) {
        const f = fixture(layout), original = population(f.r.snapshotExpansion()), maps = f.r.snapshotExpansion().raid!.maps;
        for (const name of ['S-W', 'S-N', 'S-E', 'E-C']) for (let i = 0; i < 10; i++) for (const direction of ['up', 'down']) {
            change(f, `${name}-${direction}`, direction === 'up' ? 'mall-f1' : 'mall-f2');
            assert.ok(checkpointBodyFits(f.r.space!, f.r.player)); assert.deepEqual(population(f.r.snapshotExpansion()), original);
            assert.deepEqual(f.r.snapshotExpansion().raid!.maps, maps);
        }
        assert.deepEqual(restore(f.raw).r.snapshotExpansion().raid!.maps, maps);
    }
});

test('G-07/S-04: panel blocks transition; held interact/fire stay suppressed with host movement release', () => {
    const f = fixture(); entry(f, 'S-N-up'); const before = f.r.snapshotExpansion(), held = intent({ interactPressed: true, interactHeld: true, fireHeld: true, move: { x: 1, y: 0, sprint: true } });
    f.r.setBlocked(true); assert.equal(f.r.activate(ref(f, 'entry', 'S-N-up')), false); f.tick(1, held);
    assert.equal(f.r.current().map.key.mapId, 'mall-f1'); assert.deepEqual(f.r.player, before.raid!.player); assert.equal(f.r.mag, before.raid!.loadout.ammo);
    f.r.setBlocked(false); f.tick(.1); f.tick(.1, intent({ interactPressed: true, interactHeld: true, fireHeld: true, move: { x: 1, y: 0, sprint: true } }));
    assert.equal(f.r.current().map.key.mapId, 'mall-f2'); const landed = { ...f.r.player }, mag = f.r.mag;
    // The existing host contract releases physical movement on layer events; Runtime suppresses held E/fire.
    f.tick(5, { ...held, interactPressed: false, move: { x: 0, y: 0, sprint: false } }); assert.deepEqual(f.r.player, landed); assert.equal(f.r.mag, mag); assert.equal(f.r.current().map.key.mapId, 'mall-f2');
    f.tick(.1); f.tick(.1, intent({ interactPressed: true })); assert.equal(f.r.current().map.key.mapId, 'mall-f1');
});

test('G-08: crowded landing is deterministic; fully blocked landing refuses and a freed slot allows exactly one transition', () => {
    const f = fixture(), e = entry(f, 'S-N-up'), target = f.r.layeredWorld!.maps[e.targetMap];
    const ctx = { definition: target, doors: {}, highTide: false }, slots: Point[] = [];
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        const p = { x: e.landing.x + x * 32, y: e.landing.y + y * 32 };
        if (Math.hypot(x * 32, y * 32) <= 64 && traversable(ctx, p, 'body', 10)) slots.push(p);
    }
    edit(f, state => {
        const raid = state.raid!, all = Object.values(raid.maps).flatMap(m => m.enemies);
        raid.maps['mall-f1'].enemies = all.slice(slots.length); raid.maps['mall-f2'].enemies = all.slice(0, slots.length);
        raid.maps['mall-f2'].enemies.forEach((enemy, i) => Object.assign(enemy, slots[i], { home: slots[i], target: slots[i], path: [], alert: 0 }));
        // Keep relocated source actors on known legal cells too.
        raid.maps['mall-f1'].enemies.forEach(enemy => Object.assign(enemy, at(4, 10), { home: at(4, 10), target: at(4, 10), path: [] }));
    });
    const original = f.r.snapshotExpansion(); assert.equal(findLanding(ctx, e.landing, original.raid!.maps['mall-f2'].enemies), null);
    assert.equal(f.r.activate(ref(f, 'entry', e.id)), false); assert.deepEqual(f.r.snapshotExpansion(), original);
    const freed = slots[0]; edit(f, s => Object.assign(s.raid!.maps['mall-f2'].enemies[0], at(60, 45), { home: at(60, 45), target: at(60, 45) }));
    const expected = findLanding(ctx, e.landing, f.r.snapshotExpansion().raid!.maps['mall-f2'].enemies); assert.deepEqual(expected, freed);
    assert.ok(f.r.activate(ref(f, 'entry', e.id))); assert.deepEqual({ x: f.r.player.x, y: f.r.player.y }, expected); assert.equal(population(f.r.snapshotExpansion()).length, 25);
});

test('L-06/S-02/S-03: departure settles hit/wall/range/enemy bullets once, freezes source, and failed commit restores every byte', () => {
    const f = fixture(); const e = entry(f, 'S-N-up');
    edit(f, state => {
        const raid = state.raid!, layer = raid.maps['mall-f1'], enemy = layer.enemies[0];
        Object.assign(enemy, at(60, 13), { hp: 1, home: at(60, 13), target: at(60, 13), path: [], alert: 0 });
        const bullet = (point: Point, vx: number, left: number, hostile = false) => ({ uid: entityUid(raid, raid.nextEntity++), ...point, rotation: vx < 0 ? Math.PI : 0, vx, vy: 0, left, damage: 100, enemy: hostile, ...(hostile ? { owner: enemy.uid } : { crit: plainCrit() }) });
        layer.bullets = [bullet(at(59, 13), 760, 64), bullet(at(62, 8), 760, 200), bullet(at(59, 12), 760, 1), bullet({ x: e.at.x + 20, y: e.at.y }, -760, 80, true)];
    });
    assert.ok(f.r.checkpoint()); const before = f.r.snapshotExpansion(), raw = f.raw, oldHp = f.r.hp;
    f.fail(); assert.equal(f.r.activate(ref(f, 'entry', e.id)), false); assert.deepEqual(f.r.snapshotExpansion(), before); assert.equal(f.raw, raw);
    assert.deepEqual(restore(raw).r.snapshotExpansion(), before);
    assert.ok(!f.r.current().events.some(e => e.type === 'death' || e.type === 'layer'));
    f.fail(false); assert.ok(f.r.retrySave()); const after = f.r.snapshotExpansion(), source = structuredClone(after.raid!.maps['mall-f1']);
    assert.equal(source.bullets.length, 0); assert.equal(after.raid!.kills, before.raid!.kills + 1); assert.equal(f.r.hp, oldHp);
    assert.equal(source.containers.filter(c => c.id === `corpse-${before.raid!.maps['mall-f1'].enemies[0].uid}`).length, 1);
    assert.ok(f.r.retrySave()); assert.equal(f.r.kills, after.raid!.kills); assert.deepEqual(f.r.snapshotExpansion().raid!.maps['mall-f1'], source);
    f.tick(3); assert.deepEqual(f.r.snapshotExpansion().raid!.maps['mall-f1'], source); change(f, 'S-N-down'); assert.deepEqual(f.r.snapshotExpansion().raid!.maps['mall-f1'], source);
});

test('L-04/L-05: all four stairs preserve pursuing identities and HP; arrival waits for occupied landing then resumes', () => {
    for (const name of ['S-W', 'S-N', 'S-E', 'E-C']) {
        const f = fixture(), e = entry(f, `${name}-up`), ids: string[] = [];
        edit(f, state => state.raid!.maps['mall-f1'].enemies.slice(0, 3).forEach((enemy, i) => {
            ids.push(enemy.uid); const p = { x: e.at.x + (i - 1) * 24, y: e.at.y + 24 };
            Object.assign(enemy, p, { home: p, target: e.at, path: [], hp: 20, state: 'chase', alert: 5 });
        }));
        assert.ok(f.r.activate(ref(f, 'entry', e.id))); assert.deepEqual(f.r.snapshotExpansion().raid!.pursuits.map(p => p.enemy.uid).sort(), ids.sort());
        // Block every legal target landing after the player has crossed, without changing world data.
        edit(f, state => {
            const raid = state.raid!, target = f.r.layeredWorld!.maps['mall-f2'], slots: Point[] = [];
            for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
                const p = { x: e.landing.x + x * 32, y: e.landing.y + y * 32 };
                if (Math.hypot(x * 32, y * 32) <= 64 && traversable({ definition: target, doors: {}, highTide: false }, p, 'body', 10)) slots.push(p);
            }
            raid.maps['mall-f2'].enemies = Object.values(raid.maps).flatMap(m => m.enemies); raid.maps['mall-f1'].enemies = [];
            raid.maps['mall-f2'].enemies.forEach((enemy, i) => Object.assign(enemy, slots[i % slots.length], { home: slots[i % slots.length], target: slots[i % slots.length], path: [] }));
        });
        f.tick(3); assert.ok(f.r.snapshotExpansion().raid!.pursuits.some(p => p.waiting), 'player and earlier arrivals occupy landing');
        const clear = name === 'S-E' ? at(14, 31) : at(60, 45);
        f.driver.placePlayer(clear, 0, 'mall-f2');
        // Clear each arrived actor so the next queued pursuer can use the same legal route.
        for (let i = 0; i < 3; i++) { edit(f, state => state.raid!.maps['mall-f2'].enemies.forEach(enemy => Object.assign(enemy, clear, { home: clear, target: clear, path: [] }))); f.tick(1); }
        const raid = f.r.snapshotExpansion().raid!; assert.equal(raid.pursuits.length, 0); assert.equal(new Set(population(f.r.snapshotExpansion())).size, 25);
        assert.ok(ids.every(id => raid.maps['mall-f2'].enemies.some(e => e.uid === id && e.hp === 20)));
        assert.equal(raid.maps['mall-f1'].localTime, 0); assert.equal(raid.maps['mall-f1'].enemies.some(e => ids.includes(e.uid)), false);
        const next = entry(f, name === 'S-N' ? 'S-W-down' : 'S-N-down');
        edit(f, state => state.raid!.maps['mall-f2'].enemies.filter(enemy => ids.includes(enemy.uid)).forEach((enemy, i) => {
            const p = { x: next.at.x + (i - 1) * 24, y: next.at.y + 24 };
            Object.assign(enemy, p, { home: p, target: next.at, path: [], state: 'chase', alert: 5 });
        }));
        assert.ok(f.r.activate(ref(f, 'entry', next.id))); assert.equal(f.r.snapshotExpansion().raid!.pursuits.length, 3);
        f.driver.placePlayer(MALL_ANCHORS.spawn, 0, 'mall-f1'); f.tick(3);
        assert.equal(f.r.snapshotExpansion().raid!.pursuits.length, 0);
        assert.ok(ids.every(id => f.r.enemies.some(enemy => enemy.uid === id && enemy.hp === 20)));
    }
});

test('L-07/L-08: terrace never extracts; only O-06 floods, one warning/flip, indoor and F2 remain dry', () => {
    for (const initialHigh of [false, true]) {
        const seed = Array.from({ length: 100 }, (_, i) => i + 1).find(seed => mallRunConfig(seed).initialHigh === initialHigh)!;
        const f = fixture(2, seed); f.driver.placePlayer(at(72, 30), 0, 'mall-f1');
        assert.equal(f.r.walkable(f.r.player.x, f.r.player.y, true), false); assert.equal(f.r.walkable(f.r.player.x, f.r.player.y, false), true);
        edit(f, state => { state.raid!.elapsed = 269.9; }); f.tick(.2); assert.ok(f.r.warned);
        edit(f, state => { state.raid!.elapsed = 299.9; }); f.tick(.2); assert.equal(f.r.highTide, !initialHigh); assert.ok(f.r.tideChanged);
        f.driver.placePlayer(at(62, 13), 0, 'mall-f1'); assert.ok(f.r.walkable(f.r.player.x, f.r.player.y, true));
        edit(f, state => Object.assign(state.raid!.maps['mall-f1'].loot[0], MALL_ANCHORS.edge));
        const groundUid = f.r.loot[0].uid;
        f.driver.placePlayer(MALL_ANCHORS.edge, 0, 'mall-f2'); assert.equal(f.r.current().frame.flooded.length, 0); assert.equal(f.r.current().map.exits.length, 0);
        assert.equal(f.r.pickupLoot(groundUid), false); assert.ok(!f.r.nearbyLoot().some(l => l.uid === groundUid));
        assert.equal(f.r.current().frame.player.regionId, null); assert.equal(f.r.current().map.floor, '二层');
        f.tick(3.2, intent({ interactHeld: true })); assert.equal(f.r.ending, false); assert.equal(f.r.highTide, !initialHigh);
        const notices = f.events.filter(e => e.type === 'notice');
        assert.equal(notices.filter(e => e.type === 'notice' && e.text.includes('潮汐预警')).length, 1);
        assert.equal(notices.filter(e => e.type === 'notice' && /涨潮了|退潮了/.test(e.text)).length, 1);
        assert.ok(f.r.checkpoint()); assert.equal(restore(f.raw).r.current().map.key.mapId, 'mall-f2');
    }
});

test('S-09: only active ground exits, stationary held 3s, durable settlement before success, single retry award', () => {
    const seed = Array.from({ length: 20 }, (_, i) => i + 1).find(seed => !mallRunConfig(seed).exits.some(e => e.id === 'X-S'))!;
    for (const exitIndex of [0, 1]) {
    const f = fixture(2, seed), r = f.r, exits = r.config.exits;
    const absent = [MALL_ANCHORS.north, MALL_ANCHORS.south, MALL_ANCHORS.loading].find(p => !exits.some(e => e.x === p.x && e.y === p.y))!;
    f.driver.placePlayer(absent); f.tick(3.2, intent({ interactHeld: true })); assert.equal(r.ending, false);
    f.driver.placePlayer(exits[exitIndex]); f.tick(2.9, intent({ interactHeld: true })); assert.equal(r.ending, false);
    f.tick(.1); assert.equal(r.extractTime, 0); f.tick(.1, intent({ interactHeld: true, move: { x: 1, y: 0, sprint: false } })); assert.equal(r.extractTime, 0);
    f.driver.placePlayer(exits[exitIndex]); f.tick(2.8, intent({ interactHeld: true })); const before = f.raw; f.fail();
    f.tick(.3, intent({ interactHeld: true })); assert.ok(r.ending); assert.equal(r.settlement.committed, false); assert.equal(f.raw, before); assert.ok(f.state.pendingSettlement);
    f.fail(false); assert.ok(r.retrySettlement()); const settled = f.raw; assert.equal(r.retrySettlement(), false); assert.equal(f.raw, settled); assert.equal(f.state.save.stats.runs, 1); assert.equal(f.state.save.stats.extracts, 1);
    }
});

test('S-10: death/timeout/abandon preserve safe and lose bag/equipment on F1, F2 and terrace, including failed terminal writes', () => {
    for (const [map, point] of [['mall-f1', at(62, 13)], ['mall-f2', at(62, 13)], ['mall-f2', MALL_ANCHORS.edge]] as const) for (const reason of ['death', 'timeout', 'abandon'] as const) {
        const f = fixture(); f.driver.placePlayer(point, 0, map);
        edit(f, state => { assert.equal(D.addItem(state.raid!.loadout.safe, 'watch', 1), 0); assert.equal(D.addItem(state.raid!.loadout.bag, 'scrap', 1), 0); });
        if (reason === 'timeout') edit(f, s => Object.assign(s.raid!, { elapsed: 599.9, warned: true, tideChanged: true, highTide: !s.raid!.initialHigh }));
        assert.ok(f.r.checkpoint()); const raw = f.raw, safe = structuredClone(f.state.loadout!.safe); f.fail();
        if (reason === 'death') { f.r.hp = 0; f.r.bleeding = 1; f.tick(.2); }
        else if (reason === 'timeout') f.tick(.3);
        else f.r.finish('abandon');
        assert.ok(f.state.pendingSettlement, JSON.stringify({ map, reason, hp: f.r.hp, elapsed: f.r.elapsed, overlay: f.r.overlay, ending: f.r.ending, error: f.state.storageError })); assert.equal(f.raw, raw); assert.equal(f.r.settlement.reason, reason);
        f.fail(false); assert.ok(f.r.retrySettlement()); assert.deepEqual(f.state.save.safe, safe); assert.equal(f.state.save.bag.items.length, 0); assert.equal(f.state.save.equipment.weapon, null);
        assert.equal(f.state.save.stats.runs, 1); assert.equal(f.r.retrySettlement(), false); assert.equal(f.state.expansion!.raid, null);
    }
});

test('G-01: all seven same-floor passages walk/sprint ten round trips with diagonal grazing and no respawn', () => {
    for (const p of MALL_PASSAGES) for (const sprint of [false, true]) {
        const f = fixture(), axis = ['P-N', 'P-S'].includes(p.id) ? 'y' : 'x', other = axis === 'x' ? 'y' : 'x';
        const start = { ...p.at, [axis]: p.at[axis] - 40 }; f.driver.placePlayer(start, 0, p.map); f.tick(.1);
        const initial = f.r.snapshotExpansion(), roster = population(initial);
        for (let loop = 0; loop < 10; loop++) for (const direction of [1, -1]) {
            f.r.stamina = 100; f.r.exhausted = false;
            const target = p.at[axis] + direction * 40;
            let frames = 0;
            while (direction * (f.r.player[axis] - target) < 0 && frames++ < 35) f.tick(.05, intent({ move: { x: axis === 'x' ? direction : 0, y: axis === 'y' ? direction : 0, sprint } }));
            assert.ok(frames < 35, `${p.id} blocked`); assert.equal(f.r.current().map.key.mapId, p.map);
            assert.deepEqual(population(f.r.snapshotExpansion()), roster);
        }
        f.driver.placePlayer({ ...p.at, [axis]: p.at[axis] - 40, [other]: p.at[other] - 6 }, 0, p.map);
        f.tick(.13, intent({ move: { x: 1, y: 1, sprint } })); assert.ok(checkpointBodyFits(f.r.space!, f.r.player));
        const after = f.r.snapshotExpansion();
        for (const id of Object.keys(after.raid!.maps)) {
            assert.deepEqual(after.raid!.maps[id].loot, initial.raid!.maps[id].loot);
            assert.deepEqual(after.raid!.maps[id].containers, initial.raid!.maps[id].containers);
        }
    }
});

test('G-02/G-03/G-04/G-05/G-09: runtime collision/sight/bullets agree with all furniture; forbidden bounds and props cannot be looted', () => {
    for (const layout of [2, 3, 4] as const) {
        const f = fixture(layout);
        for (const mapId of ['mall-f1', 'mall-f2']) {
            f.driver.placePlayer(at(62, 13), 0, mapId); const map = f.r.space!.definition;
            for (const d of map.decorations!) {
                assert.equal(f.r.walkable(d.x, d.y, false), d.kind === 'V', `${mapId}/${d.name} body`);
                assert.equal(f.r.sight({ x: d.x - 14, y: d.y }, { x: d.x + 14, y: d.y }), d.kind !== 'B', `${mapId}/${d.name} sight`);
                edit(f, state => { const raid = state.raid!; raid.maps[mapId].bullets = [{ uid: entityUid(raid, raid.nextEntity++), x: d.x - 14, y: d.y, vx: 100, vy: 0, left: 200, rotation: 0, damage: 1, enemy: false }]; });
                f.r.updateBullets(.28); assert.equal(f.r.bullets.length, d.kind === 'B' ? 0 : 1, `${mapId}/${d.name} bullet`);
            }
            edit(f, state => { state.raid!.maps[mapId].bullets = []; });
            assert.equal(f.r.activate(ref(f, 'container', f.r.current().map.decorations[0].id)), false);
        }
        for (const [map, p] of [['mall-f1', at(10, 6)], ['mall-f1', at(15, 53)], ['mall-f2', at(23, layout === 4 ? 12 : 13)], ['mall-f2', at(23, 42)], ['mall-f2', at(73, 35)]] as const) {
            assert.throws(() => f.driver.placePlayer(p, 0, map), /Invalid fixture position/);
        }
        for (const p of [at(21, 42), at(26, 42), at(23, 40), at(23, 44), MALL_ANCHORS.edge]) f.driver.placePlayer(p, 0, 'mall-f2');
    }
});

test('L-01/L-03: same-coordinate actors are hit and hear gunshots only on their own layer', () => {
    for (const mapId of ['mall-f1', 'mall-f2']) {
        const other = mapId === 'mall-f1' ? 'mall-f2' : 'mall-f1', f = fixture(); f.driver.placePlayer(at(34, 23), 0, mapId);
        edit(f, state => {
            const raid = state.raid!;
            for (const m of Object.values(raid.maps)) Object.assign(m.enemies[0], at(35, 23), { home: at(35, 23), target: at(35, 23), state: 'patrol', alert: 0, path: [] });
        });
        const before = structuredClone(f.r.snapshotExpansion().raid!.maps[other]), hp = f.r.enemies[0].hp;
        f.driver.weapon('carbine'); f.r.shoot(); f.r.updateBullets(.1);
        assert.ok(f.r.enemies[0].hp < hp); assert.ok(f.r.noiseTime > 0); assert.deepEqual(f.r.snapshotExpansion().raid!.maps[other], before);
        // An occluded live actor investigates this layer's shot instead of receiving a cross-floor source.
        const listener = f.r.enemies.find(e => e.hp > 0)!; f.driver.placeEnemy(listener.uid, at(35, 24));
        f.r.shotNoise = at(35, 24); f.r.noiseTime = .6; f.r.noiseRadius = 510;
        f.driver.placePlayer(at(62, 13), 0, mapId); f.r.updateEnemy(f.r.enemies.find(e => e.uid === listener.uid)!, .05);
        assert.equal(f.r.enemies.find(e => e.uid === listener.uid)!.state, 'investigate');
        const connection = mapId === 'mall-f1' ? 'S-N-up' : 'S-N-down'; change(f, connection);
        assert.equal(f.r.noiseTime, 0); assert.equal(f.r.shotNoise, null); assert.deepEqual(f.r.snapshotExpansion().raid!.maps[other], before);
    }
});

test('L-02/S-01/S-05: floor-specific loot/crates/corpses keep atomic quantities through failed transfer, failed stairs and refresh', () => {
    const f = fixture(), point = at(62, 13);
    edit(f, state => {
        const raid = state.raid!;
        for (const m of Object.values(raid.maps)) {
            Object.assign(m.loot[0], point); Object.assign(m.containers[0], point);
            m.containers[0].inventory = D.createInventory(6, 5);
            D.addItem(m.containers[0].inventory, 'scrap', 3, false, false, true, () => entityUid(raid, raid.nextEntity++));
        }
    });
    for (const mapId of ['mall-f1', 'mall-f2']) {
        f.driver.placePlayer(point, 0, mapId); f.r.setBlocked(false); const other = mapId === 'mall-f1' ? 'mall-f2' : 'mall-f1';
        const untouched = structuredClone(f.r.snapshotExpansion().raid!.maps[other]);
        const loot = f.r.loot[0], foreignLoot = untouched.loot[0]; assert.equal(f.r.pickupLoot(foreignLoot.uid), false); assert.ok(f.r.pickupLoot(loot.uid));
        const crate = f.r.containers[0], item = crate.inventory.items[0], target = ref(f, 'container', crate.id);
        assert.equal(f.r.selectTarget({ ...target, mapId: other, id: untouched.containers[0].id }), false);
        assert.ok(f.r.activate(target)); const before = f.r.snapshotExpansion(), raw = f.raw;
        let slot: Point | undefined;
        for (let y = 0; y < f.state.loadout!.bag.h && !slot; y++) for (let x = 0; x < f.state.loadout!.bag.w && !slot; x++)
            if (D.fits(f.state.loadout!.bag, item.id, x, y) && !placementError(crate.inventory, f.state.loadout!.bag, item.uid, x, y, false, 1)) slot = { x, y };
        assert.ok(slot);
        const request = { from: 'container' as const, to: 'bag' as const, uid: item.uid, quantity: 1, runId: crate.runId, containerId: crate.id, ...slot };
        f.fail(); assert.equal(f.r.transferLoot(target, request), 'save-failed'); assert.deepEqual(f.r.snapshotExpansion(), before); assert.equal(f.raw, raw);
        f.fail(false); assert.ok(f.r.retrySave()); assert.equal(f.r.transferLoot(target, request), 'committed');
        assert.equal(f.r.getLootContainer(crate.id)!.inventory.items[0].qty, 2);
        const held = f.state.loadout!.bag.items.find(i => i.id === 'scrap' && !i.relief)!;
        assert.equal(f.r.transferLoot(target, { ...request, from: 'bag', to: 'container', uid: held.uid, x: item.x, y: item.y }), 'committed');
        assert.equal(f.r.getLootContainer(crate.id)!.inventory.items.reduce((n, i) => n + i.qty, 0), 3);
        assert.equal(f.r.transferLoot(target, request), 'committed');
        f.r.setBlocked(false); const enemy = f.r.enemies[0]; f.driver.placeEnemy(enemy.uid, point); f.driver.kill(enemy.uid);
        const corpse = f.r.containers.find(c => c.id === `corpse-${enemy.uid}`)!; assert.ok(corpse);
        // Deterministic corpse inventory fixture, retaining the actual killed identity and container.
        edit(f, state => { const raid = state.raid!, c = raid.maps[mapId].containers.find(c => c.id === corpse.id)!;
            c.inventory = D.createInventory(6, 5); D.addItem(c.inventory, 'scrap', 2, false, false, true, () => entityUid(raid, raid.nextEntity++)); });
        const body = f.r.getLootContainer(corpse.id)!, bodyItem = body.inventory.items[0], bodyTarget = ref(f, 'container', body.id);
        assert.ok(f.r.activate(bodyTarget));
        let bodySlot: Point | undefined;
        for (let y = 0; y < f.state.loadout!.bag.h && !bodySlot; y++) for (let x = 0; x < f.state.loadout!.bag.w && !bodySlot; x++)
            if (D.fits(f.state.loadout!.bag, bodyItem.id, x, y) && !placementError(body.inventory, f.state.loadout!.bag, bodyItem.uid, x, y, false, 1)) bodySlot = { x, y };
        assert.ok(bodySlot);
        const bodyRequest = { runId: body.runId, containerId: body.id, uid: bodyItem.uid, from: 'container' as const, to: 'bag' as const, quantity: 1, ...bodySlot };
        assert.equal(f.r.transferLoot(bodyTarget, bodyRequest), 'committed');
        const taken = f.state.loadout!.bag.items.find(i => i.x === bodySlot!.x && i.y === bodySlot!.y)!;
        assert.equal(f.r.transferLoot(bodyTarget, { ...bodyRequest, uid: taken.uid, from: 'bag', to: 'container', x: bodyItem.x, y: bodyItem.y }), 'committed');
        assert.equal(f.r.getLootContainer(body.id)!.inventory.items.reduce((n, i) => n + i.qty, 0), 2); f.r.setBlocked(false);
        assert.ok(f.r.checkpoint()); assert.deepEqual(f.r.snapshotExpansion().raid!.maps[other], untouched);
        const saved = f.raw, e = entry(f, mapId === 'mall-f1' ? 'S-N-up' : 'S-N-down'); f.fail(); assert.equal(f.r.activate(ref(f, 'entry', e.id)), false); assert.equal(f.raw, saved);
        f.fail(false); assert.ok(f.r.retrySave()); const restored = restore(f.raw).r.snapshotExpansion();
        assert.equal(restored.raid!.maps[mapId].containers.find(c => c.id === crate.id)!.inventory.items.reduce((n, i) => n + i.qty, 0), 2);
        assert.deepEqual(restored.raid!.loadout, f.state.loadout); assert.equal(restored.raid!.maps[mapId].containers.filter(c => c.id === corpse.id).length, 1);
    }
});

test('L-09/G-03: every accessible region has runtime routes through stairs to each exit combination in both tides', () => {
    const seeds = new Map<string, number>(); for (let seed = 1; seed <= 20; seed++) seeds.set(mallRunConfig(seed).exits.map(e => e.id).join(','), seed);
    assert.equal(seeds.size, 3);
    for (const layout of [2, 3, 4] as const) for (const seed of seeds.values()) for (const high of [false, true]) {
        const f = fixture(layout, seed);
        for (const mapId of ['mall-f1', 'mall-f2']) {
            f.driver.placePlayer(at(62, 13), 0, mapId); const map = f.r.space!.definition, target = mapId === 'mall-f1' ? f.r.config.exits[0] : map.entries.find(e => e.id === 'S-N-down')!.at;
            for (const region of map.regions!.filter(r => !r.sealed)) {
                const candidates: Point[] = [];
                for (let y = region.y + 16; y < region.y + region.h; y += 32) for (let x = region.x + 16; x < region.x + region.w; x += 32)
                    if (f.r.walkable(x, y, high)) candidates.push({ x, y });
                if (!candidates.length) { assert.equal(region.id, 'O-06'); assert.ok(high); continue; }
                const p = candidates[Math.floor(candidates.length / 2)], path = f.r.path(p, target, high);
                assert.ok(path.length, `${mapId}/${region.id} tide=${high}`);
                let previous = p; for (const point of path) { assert.ok(corridor({ ...f.r.space!, highTide: high }, previous, point, 'body', 10)); previous = point; }
                assert.ok(Math.hypot(previous.x - target.x, previous.y - target.y) < 32);
            }
        }
    }
});

test('S-06/S-08: stale writer cannot overwrite; active v2 backup import is atomic and restores the exact F2 world', () => {
    const f = fixture(); f.driver.placePlayer(at(62, 13), 0, 'mall-f2'); assert.ok(f.r.checkpoint());
    const staleState = createSessionState(), stale = new SaveSession(staleState, () => f.storage, undefined, now); assert.ok(stale.initialize()); assert.ok(stale.resumeRun()); staleState.state = 'run';
    const staleRuntime = new CoastRaidRuntime(staleState, stale); assert.ok(staleRuntime.checkpoint()); const winner = f.raw;
    assert.equal(f.r.checkpoint(), false); assert.ok(f.state.conflict); assert.equal(f.raw, winner);
    assert.equal(f.r.activate(ref(f, 'entry', 'S-N-down')), false); f.r.finish('abandon'); assert.equal(f.raw, winner);
    const decoded = decodePortableBackup(encodeRecoveryBackup(stale.backupRecord()!)); assert.equal(decoded.kind, 'session'); if (decoded.kind !== 'session') return;
    const g = session(); g.state.state = 'hideout'; const before = g.raw;
    // Decode/preview alone is the service-side cancel path: no import call, no writes.
    decodePortableBackup(encodeRecoveryBackup(decoded.record)); assert.equal(g.raw, before);
    g.fail(); assert.equal(g.saves.importRecord(decoded.record), false); assert.equal(g.raw, before); assert.equal(g.state.save.activeRun, null);
    g.fail(false); assert.ok(g.saves.importRecord(decoded.record)); const resumed = restore(g.raw);
    assert.equal(resumed.r.current().map.key.worldVersion, 'mall-v2'); assert.equal(resumed.r.current().map.key.mapId, 'mall-f2');
    assert.deepEqual(resumed.r.snapshotExpansion(), staleRuntime.snapshotExpansion());
});

test('S-01: original A-BOX-1/2 each retain their remainder and shared bag through stair round trip and refresh', () => {
    const f = fixture(), remainders: { map: string; id: string; total: number }[] = [];
    for (const [map, point] of [['mall-f1', MALL_ANCHORS.box1], ['mall-f2', MALL_ANCHORS.box2]] as const) {
        f.driver.placePlayer(point, 0, map); const c = f.r.containers.find(c => c.x === point.x && c.y === point.y)!; assert.ok(c);
        const item = c.inventory.items[0], total = c.inventory.items.reduce((n, i) => n + i.qty, 0);
        let slot: Point | undefined;
        // Since #44 a move onto an occupied slot may swap whole items; this case needs an empty footprint.
        for (let y = 0; y < f.state.loadout!.bag.h && !slot; y++) for (let x = 0; x < f.state.loadout!.bag.w && !slot; x++)
            if (D.fits(f.state.loadout!.bag, item.id, x, y) && !placementError(c.inventory, f.state.loadout!.bag, item.uid, x, y, false, 1)) slot = { x, y };
        assert.ok(slot); const target = ref(f, 'container', c.id); assert.ok(f.r.activate(target));
        assert.equal(f.r.transferLoot(target, { runId: c.runId, containerId: c.id, uid: item.uid, from: 'container', to: 'bag', quantity: 1, ...slot }), 'committed');
        f.r.setBlocked(false); remainders.push({ map, id: c.id, total: total - 1 });
    }
    const bag = structuredClone(f.state.loadout!.bag); change(f, 'S-N-down'); change(f, 'S-N-up');
    const restored = restore(f.raw).r.snapshotExpansion(); assert.deepEqual(restored.raid!.loadout.bag, bag);
    for (const row of remainders) assert.equal(restored.raid!.maps[row.map].containers.find(c => c.id === row.id)!.inventory.items.reduce((n, i) => n + i.qty, 0), row.total);
});
