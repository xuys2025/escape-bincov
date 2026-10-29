import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { archetype, initialTactics } from '../src/enemy-archetypes';
import type { EnemyState } from '../src/checkpoint';
import { BUILDING_WORLD } from '../src/building-world';
import { damageLayerEnemy } from '../src/layer-transition';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { advanceTacticalEnemy, type TacticalEffects } from '../src/raid-runtime/tactical-enemy';
import { decodeSession, RecoveryStore, SESSION_KEY } from '../src/recovery-store';
import { encodeRecoveryBackup, decodePortableBackup } from '../src/save-backup';
import { canonicalBehavior } from './fixtures/enemy-benchmark';
import { oldRecord } from './fixtures/old-saves';
import { factoryState, validateGun } from '../src/gunsmith/instance';

function fixture(raw?: string) {
    const data = new Map<string, string>(raw ? [[SESSION_KEY, raw]] : []);
    let denied = false, writes = 0;
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => {
        if (denied) throw Error('quota'); data.set(k, v); writes++;
    } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout';
    return { state, saves, storage, deny: (x: boolean) => { denied = x; }, get raw() { return data.get(SESSION_KEY)!; }, get writes() { return writes; } };
}
function actor(id = 'raider-melee', uid = 'enemy-0'): EnemyState {
    return { uid, id, hp: archetype(id)!.hp, x: 200, y: 200, rotation: 0, home: { x: 200, y: 200 }, target: { x: 200, y: 200 },
        state: 'patrol', timer: 0, cooldown: 0, path: [], repath: 0, alert: 0, tactics: initialTactics(id, 'test-group') };
}
function arena(e: EnemyState, distance = 28) {
    let visible = true, fired = 0, strikes = 0;
    const world = { elapsed: 0, player: { x: e.x + distance, y: e.y }, enemies: [e], highTide: false,
        shotNoise: null, noiseTime: 0, noiseRadius: 200, space: null,
        sight: () => visible, walkable: () => true, path: (_a: unknown, b: { x: number; y: number }) => [b], dryRefuge: () => null,
        move: (a: { x: number; y: number }, dx: number, dy: number) => { a.x += dx; a.y += dy; } };
    const effects: TacticalEffects = { fire: () => { fired++; }, strike: () => { strikes++; }, openDoor() {}, notice() {} };
    return { world, effects, visible: (x: boolean) => { visible = x; }, get fired() { return fired; }, get strikes() { return strikes; },
        step(dt = .05) { world.elapsed += dt; advanceTacticalEnemy(world, effects, e, dt); } };
}

test('street deployment atomically upgrades only the new action; exact prior bytes survive quota failure', () => {
    const f = fixture(), before = f.raw, base = structuredClone(f.state.save), writes = f.writes;
    f.deny(true); assert.equal(f.saves.beginRun(42, true), false);
    assert.equal(f.raw, before); assert.deepEqual(f.state.save, base); assert.equal(f.writes, writes);
    f.deny(false); assert.ok(f.saves.beginRun(42, true), f.state.storageError);
    const r = decodeSession(f.raw);
    assert.equal(r.version, 9); assert.equal(r.enemyBackup, before); assert.equal(r.expansion!.raid!.version, 5);
    assert.equal(r.expansion!.raid!.roster.length, BUILDING_WORLD.enemyCount);
    assert.equal(Object.values(r.expansion!.raid!.maps).flatMap(m => m.enemies).filter(e => e.tactics).length, 3);
    assert.ok(f.saves.persist()); assert.equal(decodeSession(f.raw).enemyBackup, before);
});

test('classic and old layered actions reject injected tactical fields rather than activating the new controller', () => {
    for (const layered of [false, true]) {
        const f = fixture(); assert.ok(f.saves.beginRun(42, layered, { legacyEnemies: true }));
        const original = decodeSession(f.raw), bad = structuredClone(original);
        const enemy = layered ? bad.expansion!.raid!.maps.coast.enemies[0] : bad.raid!.enemies[0];
        enemy.tactics = initialTactics('raider-gunner', 'injected');
        assert.throws(() => decodeSession(JSON.stringify(bad)), /存档|行动/);
        assert.doesNotThrow(() => decodeSession(JSON.stringify(original)));
    }
});

test('street encounter has reproducible positions, no extra population, and safe placement across 100 seeds', () => {
    for (let seed = 1; seed <= 100; seed++) {
        const f = fixture(); assert.ok(f.saves.beginRun(seed, true), `${seed}: ${f.state.storageError}`);
        const raid = f.state.expansion!.raid!, actors = Object.values(raid.maps).flatMap(m => m.enemies);
        assert.equal(actors.length, 25); assert.equal(new Set(actors.map(e => e.uid)).size, 25);
        assert.equal(actors.filter(e => e.tactics).length, seed % 5 === 0 || seed % 5 === 4 ? 6 : seed % 5 === 1 || seed % 5 === 3 || seed % 15 === 2 ? 7 : 3);
        assert.deepEqual(actors.filter(e => e.tactics?.squad === 'street-salvage').map(e => [e.id, e.x, e.y]).sort(),
            [['raider-gunner', 912, 720], ['raider-lookout', 816, 432], ['raider-melee', 656, 592]].sort());
    }
});

test('memory follows observations, then searches the last position and gives up without seeing through walls', () => {
    const e = actor(), a = arena(e, 140);
    for (let i = 0; i < 15; i++) a.step();
    assert.equal(e.tactics!.stance, 'hostile'); const last = structuredClone(e.tactics!.memory);
    a.visible(false); a.world.player = { x: 990, y: 850 };
    for (let i = 0; i < 60; i++) a.step();
    assert.deepEqual(e.tactics!.memory, last); assert.deepEqual(e.target, last!.at); assert.equal(a.fired + a.strikes, 0);
    for (let i = 0; i < 100; i++) a.step();
    assert.equal(e.tactics!.memory, null); assert.equal(e.tactics!.stance, 'idle');
});

test('melee has a locked telegraph and recovery; sidestepping or a new wall avoids the hit', () => {
    for (const avoid of ['side', 'wall', 'none']) {
        const e = actor(), a = arena(e);
        for (let i = 0; i < 15; i++) a.step();
        assert.equal(e.tactics!.phase, 'windup'); assert.equal(a.strikes, 0);
        const aim = e.tactics!.lockedAim;
        if (avoid === 'side') a.world.player = { x: e.x, y: e.y + 28 };
        if (avoid === 'wall') a.visible(false);
        for (let i = 0; i < 12; i++) a.step();
        assert.equal(e.tactics!.lockedAim, aim); assert.equal(a.strikes, avoid === 'none' ? 1 : 0);
        assert.equal(e.tactics!.phase, 'recovery');
    }
});

test('ammunition is finite, reload is vulnerable, and exhausted gunner retreats', () => {
    const e = actor('raider-gunner'), a = arena(e, 160), def = archetype(e.id)!;
    let sawReload = false;
    for (let i = 0; i < 1800; i++) { a.step(); sawReload ||= e.tactics!.phase === 'reload'; }
    assert.ok(sawReload); assert.equal(a.fired, def.magazine + def.reserve);
    assert.equal(e.tactics!.magazine + e.tactics!.reserve, 0); assert.equal(e.tactics!.stance, 'retreat');
});

test('lookout report contains only observed coordinates, reaches only nearby squadmates, and is latched', () => {
    const e = actor('raider-lookout'), a = arena(e, 100), near = actor('raider-melee', 'enemy-1'), far = actor('raider-melee', 'enemy-2');
    near.x += 200; far.x += 500; a.world.enemies.push(near, far);
    for (let i = 0; i < 15; i++) a.step();
    assert.ok(e.tactics!.signalUsed); assert.equal(near.tactics!.memory!.source, 'report'); assert.equal(far.tactics!.memory, null);
    const reported = structuredClone(near.tactics!.memory); a.world.player.x += 10;
    for (let i = 0; i < 15; i++) a.step();
    assert.deepEqual(near.tactics!.memory, reported, 'one report cannot become a live shared player coordinate');
});

test('conditional guard warns first, standing armed outside the line stays peaceful, backing out clears warning', () => {
    const e = actor('blockade-sentry'), a = arena(e, 140);
    for (let i = 0; i < 100; i++) a.step();
    assert.equal(e.tactics!.stance, 'idle'); assert.equal(a.fired, 0);
    a.world.player.x = e.home.x + 60;
    for (let i = 0; i < 20; i++) a.step();
    assert.equal(e.tactics!.stance, 'warning'); assert.equal(a.fired, 0);
    a.world.player.x = e.home.x + 140;
    for (let i = 0; i < 30; i++) a.step();
    assert.equal(e.tactics!.stance, 'idle'); assert.equal(e.tactics!.warning, 0);
});

test('v4 snapshot/restore/import preserve every phase and reject invalid fields without writes', () => {
    const f = fixture(); assert.ok(f.saves.beginRun(42, true)); f.state.state = 'run';
    const runtime = new CoastRaidRuntime(f.state, f.saves);
    try {
        const enemy = runtime.enemies.find(e => e.id === 'raider-gunner')!, t = enemy.tactics!;
        Object.assign(t, { phase: 'reload', phaseLeft: 1.2, magazine: 1, reserve: 8, signalUsed: true, awareness: 1,
            stance: 'hostile', memory: { at: { ...enemy.home }, time: 0, source: 'report', target: 'player' }, lockedAim: .3 });
        assert.ok(f.saves.persist(), f.state.storageError);
        const record = decodeSession(f.raw), portable = decodePortableBackup(encodeRecoveryBackup(record));
        assert.equal(portable.kind, 'session');
        const f2 = fixture(f.raw); f2.state.state = 'menu'; assert.ok(f2.saves.resumeRun()); f2.state.state = 'run';
        const restored = new CoastRaidRuntime(f2.state, f2.saves);
        assert.deepEqual(restored.enemies.find(e => e.uid === enemy.uid)!.tactics, t); restored.cancelStart();
        for (const corrupt of [(x: any) => x.magazine = 99, (x: any) => x.extra = 1, (x: any) => x.memory.time = 500,
            (x: any) => x.equipment = 'shotgun', (x: any) => x.killedBy = 'player']) {
            const bad = structuredClone(record); corrupt(bad.expansion!.raid!.maps.coast.enemies.find(e => e.uid === enemy.uid)!.tactics);
            assert.throws(() => decodeSession(JSON.stringify(bad)), /存档损坏或版本不兼容/);
        }
        // A live enemy raid needs enemy rules on: neither a v8 record without enemyBackup nor an old v4 record holds one.
        const dropped = structuredClone(record); delete dropped.enemyBackup;
        assert.throws(() => decodeSession(JSON.stringify(dropped)), /无法读取/);
        const downgraded = oldRecord(record, 4); delete downgraded.enemyBackup; delete downgraded.perksBackup;
        assert.throws(() => decodeSession(JSON.stringify(downgraded)), /无法读取/);
    } finally { runtime.cancelStart(); }
});

test('corpse contains carried equipment and exactly remaining ammo; repeated death cannot duplicate loot', () => {
    const f = fixture(); assert.ok(f.saves.beginRun(42, true));
    const state = structuredClone(f.state.expansion!), raid = state.raid!, enemy = raid.maps.coast.enemies.find(e => e.id === 'raider-gunner')!;
    enemy.tactics!.magazine = 2; enemy.tactics!.reserve = 4;
    damageLayerEnemy(state, 'coast', enemy, 1000);
    const corpse = raid.maps.coast.containers.find(c => c.id === `corpse-${enemy.uid}`)!;
    assert.equal(D.count(corpse.inventory, 'ammo9'), 6); assert.equal(D.count(corpse.inventory, 'pistol'), 1);
    // The carried gun drops as a gun instance (gunsmith record v8): a factory state under its own entity uid.
    const pistol = corpse.inventory.items.find(i => i.id === 'pistol')!;
    assert.deepEqual(pistol.gun, factoryState()); assert.deepEqual(validateGun(pistol.id, pistol.uid, pistol.gun), { ok: true });
    const before = structuredClone(state); damageLayerEnemy(state, 'coast', enemy, 1000); assert.deepEqual(state, before);
    const store = new RecoveryStore(f.storage); store.load();
    assert.doesNotThrow(() => store.commit(f.state.save, null, null, state));
});

test('restored windup pays its cost and produces exactly one release at 20/60/5 Hz', () => {
    for (const hz of [20, 60, 5]) {
        const e = actor('raider-gunner'), a = arena(e, 100);
        Object.assign(e.tactics!, { stance: 'hostile', phase: 'windup', phaseLeft: .3, lockedAim: 0, awareness: 1 });
        const restored = structuredClone(e), b = arena(restored, 100);
        for (let i = 0; i < hz; i++) { a.step(1 / hz); b.step(1 / hz); }
        assert.equal(a.fired, 1); assert.equal(b.fired, 1);
        assert.equal(canonicalBehavior(e, ''), canonicalBehavior(restored, ''));
    }
});
