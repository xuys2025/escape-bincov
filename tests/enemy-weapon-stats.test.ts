import test from 'node:test';
import assert from 'node:assert/strict';
import { actorArchetype, archetype, initialTactics } from '../src/enemy-archetypes';
import { ARMORY, armamentOf } from '../src/enemy-armory';
import { GUNS } from '../src/gunsmith/catalog';
import { effectiveStats } from '../src/gunsmith/stats';
import { presetBuild, type PresetNode } from '../src/gunsmith/presets';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, SESSION_KEY } from '../src/recovery-store';
import { encodeRecoveryBackup, decodePortableBackup } from '../src/save-backup';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { advanceTacticalEnemy } from '../src/raid-runtime/tactical-enemy';
import type { EnemyState } from '../src/checkpoint';

function fixture(seed = 5, raw?: string) {
    const data = new Map<string, string>(raw ? [[SESSION_KEY, raw]] : []), state = createSessionState();
    let denied = false;
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => {
        if (denied) throw Error('quota'); data.set(k, v);
    } }), undefined, () => 1800000000000);
    assert.ok(saves.initialize(), state.storageError); state.state = raw ? 'menu' : 'hideout';
    if (raw) assert.ok(saves.resumeRun()); else assert.ok(saves.beginRun(seed, true), state.storageError);
    state.state = 'run';
    return { state, saves, deny: (value: boolean) => { denied = value; }, get raw() { return data.get(SESSION_KEY)!; } };
}
function gunActor(id: string, gun: string, fit?: PresetNode[]): EnemyState {
    return { uid: 'enemy-test', id, hp: archetype(id)!.hp, x: 200, y: 200, home: { x: 200, y: 200 },
        target: { x: 200, y: 200 }, rotation: 0, state: 'patrol', timer: 0, cooldown: 0, path: [], repath: 0, alert: 0,
        tactics: { ...initialTactics(id, 'test'), equipment: gun, ballistics: 1, ...(fit ? { fit } : {}) } };
}

test('every armory gun derives combat from the shared effective stats, with bounded faction damage and finite ammo', () => {
    for (const [id, row] of Object.entries(ARMORY).filter(([id]) => id !== 'tide-ritualist')) for (const [gun] of row) {
        const e = gunActor(id, gun), body = archetype(id)!, def = actorArchetype(e)!, w = GUNS[gun].stats;
        assert.equal(def.magazine, w.magazine); assert.equal(def.reload, w.reload);
        assert.equal(def.ballistics!.pellets, w.pellets); assert.equal(def.ballistics!.budget, body.magazine + body.reserve);
        assert.equal(def.damage, w.damage * (body.faction === 'raiders' ? .36 : .42));
        assert.equal(def.range, w.range * (body.faction === 'blockade' ? .58 : .6));
        assert.equal(def.cooldown, w.cooldown * (body.faction === 'raiders' ? 5 : 9));
        assert.ok(Math.abs(def.windup + def.recovery - def.cooldown) < 1e-12);
        assert.equal(def.confirm, body.confirm); assert.equal(def.hp, body.hp);
        // Worst-case all-pellet DPS, before armour, travel, sight or reloading: no new one-shot player kill or >18 DPS.
        assert.ok(def.damage * w.pellets < 40, `${id}/${gun}: shot damage`);
        assert.ok(def.damage * w.pellets / def.cooldown < 18, `${id}/${gun}: DPS`);
    }
    const svd = actorArchetype(gunActor('recovery-leader', 'svdb'))!, ar = actorArchetype(gunActor('recovery-leader', 'mb4a1'))!;
    assert.ok(svd.damage > ar.damage * 2 && svd.range > ar.range && svd.cooldown > ar.cooldown * 4);
});

test('a leader uses the actual barrel, sight, magazine and choke, including the common attachment guardrails', () => {
    const fit: PresetNode[] = [{ id: 'B08', slot: 'barrel', children: [] }, { id: 'G10', slot: 'mag', children: [] },
        { id: 'O06', slot: 'top', children: [] }];
    const e = gunActor('recovery-leader', 'mb4a1', fit), bare = actorArchetype(gunActor(e.id, 'mb4a1'))!, def = actorArchetype(e)!;
    const effective = effectiveStats(presetBuild('mb4a1', fit));
    assert.equal(def.magazine, 20); assert.equal(def.reload, GUNS.mb4a1.stats.reload * .8);
    assert.equal(def.range, effective.weapon.range * .6); assert.ok(def.range > bare.range);
    assert.ok(def.ballistics!.spread < bare.ballistics!.spread);
    const choke = actorArchetype(gunActor('raider-boss', 'shotgun', [{ id: 'M11', slot: 'muzzle', children: [] }]))!;
    const open = actorArchetype(gunActor('raider-boss', 'shotgun'))!;
    assert.equal(choke.ballistics!.pellets, 6); assert.ok(choke.ballistics!.spread < open.ballistics!.spread);
    // Every generated leader fit goes through the same effective build, without modifying the saved tree.
    for (let seed = 0; seed < 100; seed++) {
        const arms = armamentOf(seed, e.id, 'enemy-3')!, actor = gunActor(e.id, arms.gun, arms.fit), before = structuredClone(actor);
        assert.equal(actorArchetype(actor)!.magazine, effectiveStats(presetBuild(arms.gun, arms.fit)).weapon.magazine);
        assert.deepEqual(actor, before);
    }
});

test('actual controller cadence and reload use the gun and debit finite ammunition', () => {
    for (const [gun, seconds] of [['mb4a1', .9], ['svdb', 4.05]] as const) {
        const e = gunActor('recovery-leader', gun), t = e.tactics!, releases: number[] = [];
        Object.assign(t, { stance: 'hostile', awareness: 1, magazine: 10, reserve: 0 });
        const world = { elapsed: 0, player: { x: 240, y: 200 }, enemies: [e], highTide: false, shotNoise: null,
            noiseTime: 0, noiseRadius: 0, space: null, sight: () => true, walkable: () => true, path: () => [],
            dryRefuge: () => null, move() {} };
        const effects = { fire() { releases.push(world.elapsed); }, strike() {}, openDoor() {}, notice() {} };
        for (let n = 0; n < 1200; n++) { world.elapsed += .01; advanceTacticalEnemy(world, effects, e, .01); }
        assert.ok(releases.length >= 2);
        for (let i = 1; i < releases.length; i++) assert.ok(Math.abs(releases[i] - releases[i - 1] - seconds) < .06);
        assert.equal(t.magazine + releases.length, 10);
        Object.assign(t, { phase: 'reload', phaseLeft: .1, magazine: 0, reserve: 3 });
        advanceTacticalEnemy(world, effects, e, .11); assert.equal(t.magazine, 3); assert.equal(t.reserve, 0);
        advanceTacticalEnemy(world, effects, e, .01); assert.equal(t.magazine, 3);
    }
});

test('Runtime shotgun releases six real scattered pellets for one shell, with repeatable RNG on restore', () => {
    const f = fixture(), r = new CoastRaidRuntime(f.state, f.saves);
    const e = r.enemies.find(e => e.id === 'raider-boss')!, t = e.tactics!, spec = actorArchetype(e)!;
    Object.assign(t, { phase: 'release', phaseLeft: 0, lockedAim: .3, stance: 'hostile', awareness: 1 });
    assert.ok(r.checkpoint(), f.state.storageError);
    const g = fixture(5, f.raw), copy = new CoastRaidRuntime(g.state, g.saves), loaded = t.magazine;
    try {
        r.updateEnemy(e, .01); copy.updateEnemy(copy.enemies.find(a => a.uid === e.uid)!, .01);
        const shot = r.current().events.find(v => v.type === 'shot' && v.shooter === e.uid);
        assert.ok(shot?.type === 'shot'); assert.equal(shot.pellets.length, 6);
        const bullets = r.bullets.filter(b => b.owner === e.uid), other = copy.bullets.filter(b => b.owner === e.uid);
        assert.equal(bullets.length, 6); assert.deepEqual(bullets, other);
        assert.ok(bullets.every(b => b.damage === spec.damage && b.left === spec.range && Math.abs(b.rotation - .3) <= spec.ballistics!.spread / 2));
        assert.ok(new Set(bullets.map(b => b.rotation)).size > 1);
        assert.equal(r.enemies.find(a => a.uid === e.uid)!.tactics!.magazine, loaded - 1);
        assert.ok(r.checkpoint(), f.state.storageError); assert.doesNotThrow(() => decodeSession(f.raw));
        const backup = decodePortableBackup(encodeRecoveryBackup(decodeSession(f.raw)));
        assert.equal(backup.kind, 'session');
        if (backup.kind === 'session') assert.deepEqual(backup.record.expansion!.raid, decodeSession(f.raw).expansion!.raid);
        const after = fixture(5, f.raw), restored = new CoastRaidRuntime(after.state, after.saves);
        assert.deepEqual(restored.bullets, r.bullets); assert.deepEqual(restored.enemies, r.enemies); restored.cancelStart();
    } finally { r.cancelStart(); copy.cancelStart(); }
});

test('strict saves reject unknown gun-rule versions, unarmed activation, excess ammunition and unpaid phase time', () => {
    const f = fixture(), valid = decodeSession(f.raw), find = (r: typeof valid) => r.expansion!.raid!.maps.coast.enemies.find(e => e.id === 'raider-gunner')!;
    for (const corrupt of [
        (e: EnemyState) => { (e.tactics as any).ballistics = 2; },
        (e: EnemyState) => { (e.tactics as any).ballistics = null; },
        (e: EnemyState) => { e.tactics!.magazine = actorArchetype(e)!.magazine + 1; },
        (e: EnemyState) => { e.tactics!.magazine = 7; e.tactics!.reserve = 12; },
        (e: EnemyState) => { e.tactics!.phase = 'reload'; e.tactics!.magazine = 0; e.tactics!.reserve = 1; e.tactics!.phaseLeft = actorArchetype(e)!.reload + .01; },
    ]) {
        const bad = structuredClone(valid); corrupt(find(bad)); assert.throws(() => decodeSession(JSON.stringify(bad)));
    }
    const bad = structuredClone(valid); bad.expansion!.raid!.maps.coast.enemies.find(e => e.id === 'raider-melee')!.tactics!.ballistics = 1;
    assert.throws(() => decodeSession(JSON.stringify(bad)));
    const original = f.raw, before = structuredClone(f.state.expansion); f.deny(true);
    assert.equal(f.saves.persist(), false); assert.equal(f.raw, original); assert.deepEqual(f.state.expansion, before);
    f.deny(false); assert.ok(f.saves.persist()); assert.doesNotThrow(() => decodeSession(f.raw));
});

test('an old active gun keeps its original exact phases, ammo and RNG even with a catalog weapon and fit', () => {
    const f = fixture(), raid = f.state.expansion!.raid!;
    for (const e of Object.values(raid.maps).flatMap(m => m.enemies)) if (e.tactics?.ballistics) {
        delete e.tactics.ballistics;
        const def = actorArchetype(e)!; Object.assign(e.tactics, { magazine: def.magazine, reserve: def.reserve });
    }
    const e = raid.maps.coast.enemies.find(e => e.id === 'raider-boss')!, def = actorArchetype(e)!;
    Object.assign(e.tactics!, { phase: 'release', phaseLeft: 0, lockedAim: .3 });
    assert.equal(def.damage, 22); assert.equal(def.range, 190); assert.equal(def.magazine, 2); assert.equal(def.reload, 2.2);
    assert.ok(f.saves.persist(), f.state.storageError);
    const old = fixture(5, f.raw), r = new CoastRaidRuntime(old.state, old.saves), rng = r.snapshotExpansion().raid!.rng;
    try {
        r.updateEnemy(r.enemies.find(a => a.uid === e.uid)!, .01);
        const bullets = r.bullets.filter(b => b.owner === e.uid); assert.equal(bullets.length, 1);
        assert.equal(bullets[0].rotation, .3); assert.equal(bullets[0].damage, 22); assert.equal(r.snapshotExpansion().raid!.rng, rng);
        assert.ok(r.checkpoint());
        assert.ok(Object.values(decodeSession(old.raw).expansion!.raid!.maps).flatMap(m => m.enemies).every(a => !a.tactics?.ballistics));
    } finally { r.cancelStart(); }
});
