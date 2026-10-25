import test from 'node:test';
import assert from 'node:assert/strict';
import { archetype, initialTactics } from '../src/enemy-archetypes';
import { enemyDamageAfterArmor } from '../src/enemy-defense';
import { advanceTacticalEnemy } from '../src/raid-runtime/tactical-enemy';
import type { EnemyState } from '../src/checkpoint';

function actor(id: string, uid = 'enemy-0', x = 200, y = 200): EnemyState {
    return { uid, id, x, y, hp: archetype(id)!.hp, home: { x, y }, target: { x, y }, rotation: 0,
        state: 'patrol', timer: 0, cooldown: 0, path: [], repath: 0, alert: 0, tactics: initialTactics(id, 'squad') };
}
function arena(enemy: EnemyState, player = { x: 1200, y: 200 }) {
    let visible = true, wall = Infinity; const shots: number[] = [], strikes: string[] = [];
    const world = { elapsed: 0, player, enemies: [enemy], highTide: false, shotNoise: null, noiseTime: 0, noiseRadius: 200, space: null,
        sight: () => visible, walkable: (x: number) => x < wall, path: (_from: unknown, to: { x: number; y: number }) => [to], dryRefuge: () => null,
        move: (e: { x: number; y: number }, dx: number, dy: number) => { if (e.x + dx < wall) { e.x += dx; e.y += dy; } } };
    const effects = { fire: (_e: EnemyState, angle: number) => { shots.push(angle); }, strike: (_e: EnemyState, id: string) => { strikes.push(id); }, openDoor() {}, notice() {} };
    return { world, shots, strikes, visible: (value: boolean) => { visible = value; }, wall: (x: number) => { wall = x; },
        step(dt: number) { world.elapsed += dt; advanceTacticalEnemy(world, effects, enemy, dt); } };
}

test('shell defence uses the incoming direction, leaving sides and rear open; old bodies have no added armour', () => {
    for (const id of ['tidal-crab', 'salt-hulk']) {
        const e = actor(id), front = enemyDamageAfterArmor(e, { x: 300, y: 200 }, 100);
        assert.equal(front, 100 * (1 - archetype(id)!.armor));
        assert.equal(enemyDamageAfterArmor(e, { x: 200, y: 300 }, 100), 100);
        assert.equal(enemyDamageAfterArmor(e, { x: 100, y: 200 }, 100), 100);
    }
    const boss = actor('raider-boss'); assert.equal(enemyDamageAfterArmor(boss, { x: 100, y: 200 }, 100), 80);
    assert.equal(enemyDamageAfterArmor({ ...boss, id: 'elite' }, { x: 100, y: 200 }, 100), 100);
});

test('pounces pay at most 0.3 seconds of travel at 60/20/5 Hz, including restore in the final partial step', () => {
    for (const id of ['saltback-dog', 'tide-chaser']) for (const hz of [60, 20, 5]) {
        const e = actor(id), a = arena(e); Object.assign(e.tactics!, { phase: 'windup', phaseLeft: archetype(id)!.windup, lockedAim: 0 });
        while (e.tactics!.phase !== 'recovery') a.step(1 / hz);
        assert.ok(Math.abs(e.x - 290) < 1e-6, `${id} ${hz}: ${e.x}`); assert.equal(e.tactics!.phase, 'recovery'); assert.equal(a.strikes.length, 0);
        const copy = structuredClone(e); copy.x = 200; Object.assign(copy.tactics!, { phase: 'release', phaseLeft: .07 });
        const restored = arena(copy); restored.step(.2); assert.ok(Math.abs(copy.x - 221) < 1e-6); assert.equal(copy.tactics!.phase, 'recovery');
    }
});

test('a slow-frame pounce cannot tunnel past a close body or a closed wall, and never turns toward a sidestep', () => {
    for (const scenario of ['body', 'wall', 'side']) {
        const e = actor('saltback-dog'), a = arena(e, { x: 240, y: 200 });
        Object.assign(e.tactics!, { phase: 'release', phaseLeft: .3, lockedAim: 0 });
        if (scenario === 'wall') { a.wall(215); a.visible(false); }
        if (scenario === 'side') a.world.player = { x: 200, y: 260 };
        a.step(.2); if (e.tactics!.phase === 'release') a.step(.2);
        assert.equal(a.strikes.length, scenario === 'body' ? 1 : 0); assert.equal(e.tactics!.phase, 'recovery');
        assert.equal(e.y, 200); assert.equal(e.tactics!.lockedAim, 0);
        if (scenario === 'wall') assert.ok(e.x < 215);
    }
});

test('support suppresses only a recent sight/report for a bounded time, using a locked old position and finite ammo', () => {
    const e = actor('mercenary-support'), a = arena(e, { x: 340, y: 200 });
    Object.assign(e.tactics!, { stance: 'hostile', awareness: 1,
        memory: { at: { x: 340, y: 200 }, time: 0, source: 'report', target: 'player' } });
    a.visible(false); a.world.player = { x: 200, y: 900 };
    for (let i = 0; i < 100; i++) a.step(.05);
    assert.ok(a.shots.length > 0 && a.shots.length <= 2); assert.ok(a.shots.every(angle => angle === 0));
    assert.equal(e.tactics!.magazine, archetype(e.id)!.magazine - a.shots.length);
    const count = a.shots.length; for (let i = 0; i < 100; i++) a.step(.05); assert.equal(a.shots.length, count);
    const untrusted = actor('mercenary-support'), b = arena(untrusted);
    Object.assign(untrusted.tactics!, { stance: 'hostile', awareness: 1, memory: { at: { x: 340, y: 200 }, time: 0, source: 'sound', target: 'player' } });
    b.visible(false); for (let i = 0; i < 100; i++) b.step(.05); assert.equal(b.shots.length, 0);
});

test('a leader reacts to visible squad losses; guards and support keep their post instead of abandoning it to search', () => {
    const e = actor('recovery-leader'), a = arena(e, { x: 260, y: 200 });
    const ally = actor('mercenary-assault', 'enemy-1', 240); ally.hp = 0; a.world.enemies.push(ally);
    Object.assign(e.tactics!, { stance: 'hostile', memory: { at: { x: 260, y: 200 }, time: 0, source: 'sight', target: 'player' } });
    a.visible(false); a.step(.05); assert.notEqual(e.tactics!.stance, 'retreat', 'unseen losses are not omniscient');
    a.visible(true); a.step(.05); assert.equal(e.tactics!.stance, 'retreat');
    for (const id of ['blockade-sentry', 'blockade-sergeant', 'mercenary-support']) {
        const guard = actor(id), b = arena(guard);
        Object.assign(guard.tactics!, { stance: 'hostile', memory: { at: { x: 350, y: 200 }, time: 0, source: 'sound', target: 'player' } });
        b.visible(false); for (let i = 0; i < 60; i++) b.step(.05);
        assert.equal(guard.x, 200); assert.equal(guard.y, 200); assert.equal(b.shots.length, 0);
    }
});
