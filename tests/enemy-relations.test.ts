import test from 'node:test';
import assert from 'node:assert/strict';
import { archetype, initialTactics } from '../src/enemy-archetypes';
import { canDamageEnemy, canReceiveReport, enemyRelation } from '../src/enemy-relations';
import type { EnemyState, BulletState } from '../src/checkpoint';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, RecoveryStore, SESSION_KEY } from '../src/recovery-store';
import { damageLayerEnemy, resolveLayerShot } from '../src/layer-transition';
import { BUILDING_WORLD } from '../src/building-world';
import { corridor } from '../src/spatial';
import { advanceTacticalEnemy } from '../src/raid-runtime/tactical-enemy';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';

function actor(id: string, uid: string, x: number, y = 200): EnemyState {
    return { uid, id, hp: archetype(id)!.hp, x, y, rotation: 0, home: { x, y }, target: { x, y }, state: 'patrol',
        timer: 0, cooldown: 0, path: [], repath: 0, alert: 0, tactics: initialTactics(id, 'group') };
}
function fixture() {
    let raw = '', denied = false;
    const storage = { getItem: (key: string) => key === SESSION_KEY ? raw || null : null,
        setItem: (_key: string, value: string) => { if (denied) throw Error('quota'); raw = value; } };
    const session = createSessionState(), saves = new SaveSession(session, () => storage);
    assert.ok(saves.initialize()); session.state = 'hideout'; assert.ok(saves.beginRun(42, true));
    const state = structuredClone(session.expansion!), raid = state.raid!, layer = raid.maps.coast;
    const enemies = layer.enemies.filter(e => e.tactics);
    const context = { definition: BUILDING_WORLD.maps.coast, doors: layer.doors, highTide: false };
    let origin: { x: number; y: number } | undefined;
    for (let y = 48; y < 1500 && !origin; y += 32) for (let x = 48; x < 1300 && !origin; x += 32) {
        const end = { x: x + 192, y };
        if (corridor(context, { x, y }, end, 'body', 14) && layer.enemies.every(e => e.tactics || Math.abs(e.y - y) > 30 || e.x < x - 30 || e.x > end.x + 30)) origin = { x, y };
    }
    assert.ok(origin);
    const [shooter, target, blocker] = enemies;
    [shooter, target, blocker].forEach((e, index) => {
        const id = index === 0 ? 'raider-gunner' : index === 1 ? 'blockade-sentry' : 'raider-melee';
        Object.assign(e, actor(id, e.uid, origin.x + [0, 96, 48][index], origin.y));
        raid.roster.find(r => r.uid === e.uid)!.id = id;
    });
    raid.player = { x: origin.x + 160, y: origin.y, rotation: 0 };
    const shot = (): BulletState => ({ uid: 'probe', x: shooter.x, y: shooter.y, rotation: 0, vx: 365, vy: 0, left: 180, damage: 100, enemy: true, owner: shooter.uid });
    const validate = () => { const store = new RecoveryStore(storage); store.load(); store.commit(session.save, null, null, state); return decodeSession(raw); };
    return { state, raid, layer, shooter, target, blocker, shot, validate, storage, session, saves, deny: (value: boolean) => { denied = value; }, get raw() { return raw; } };
}

test('factions distinguish rival humans, neutral organizations and creatures outside the command chain', () => {
    const raider = actor('raider-lookout', 'r', 0), guard = actor('blockade-sentry', 'b', 0), merc = actor('mercenary-scout', 'm', 0);
    assert.equal(enemyRelation(raider, guard), 'hostile'); assert.equal(enemyRelation(guard, raider), 'hostile');
    assert.equal(enemyRelation(guard, merc), 'neutral'); assert.ok(canDamageEnemy(guard, merc));
    assert.equal(canReceiveReport(guard, merc), false);
    const ritual = actor('tide-ritualist', 'a', 0), dazed = actor('salt-dazed', 'd', 0), crab = actor('tidal-crab', 'c', 0);
    assert.equal(canReceiveReport(ritual, dazed), false); assert.equal(canReceiveReport(raider, crab), false);
    assert.equal(canReceiveReport(crab, { ...crab, uid: 'c2' }), false);
});

test('authored bullets stop at friendly bodies; rival deaths award no player kill or training and persist once', () => {
    const f = fixture(), hp = f.state.body.hp, training = structuredClone(f.raid.training);
    assert.ok(resolveLayerShot(f.state, BUILDING_WORLD, 'coast', f.shot(), true));
    assert.equal(f.blocker.hp, archetype(f.blocker.id)!.hp); assert.equal(f.target.hp, archetype(f.target.id)!.hp); assert.equal(f.state.body.hp, hp);
    // Move the blocking ally past the victim on this verified clear lane.
    f.blocker.x = f.shooter.x + 128;
    assert.ok(resolveLayerShot(f.state, BUILDING_WORLD, 'coast', f.shot(), true));
    assert.equal(f.target.hp, 0); assert.equal(f.target.tactics!.killedBy, f.shooter.uid);
    assert.equal(f.raid.kills, 0); assert.deepEqual(f.raid.training, training); assert.equal(f.state.body.hp, hp);
    const saved = f.validate(); assert.equal(saved.expansion!.raid!.kills, 0);
    const before = structuredClone(f.state); damageLayerEnemy(f.state, 'coast', f.target, 100, true, { owner: f.shooter.uid, at: f.shooter });
    assert.deepEqual(f.state, before); assert.equal(f.layer.containers.filter(c => c.id === `corpse-${f.target.uid}`).length, 1);
    const forged = structuredClone(saved); forged.expansion!.raid!.kills++;
    assert.throws(() => decodeSession(JSON.stringify(forged)), /存档/);
});

test('neutral accidental damage retaliates against its attacker; player damage still earns only actual credit', () => {
    const f = fixture(); f.shooter.id = 'mercenary-scout'; f.shooter.hp = archetype(f.shooter.id)!.hp;
    f.shooter.tactics = initialTactics(f.shooter.id, 'other'); f.raid.roster.find(r => r.uid === f.shooter.uid)!.id = f.shooter.id;
    damageLayerEnemy(f.state, 'coast', f.target, 5, true, { owner: f.shooter.uid, at: f.shooter });
    assert.equal(f.target.tactics!.memory!.target, f.shooter.uid); assert.equal(f.target.tactics!.stance, 'hostile');
    assert.equal(f.raid.training.quantity.technique, 0);
    damageLayerEnemy(f.state, 'coast', f.target, 1000);
    assert.equal(f.raid.kills, 1); assert.equal(f.target.tactics!.killedBy, 'player');
    assert.ok(f.raid.training.quantity.technique > 0); f.validate();
});

test('wall and legacy bodies stop new NPC shots without borrowing the old player-only damage contract', () => {
    const f = fixture();
    f.blocker.id = 'scav'; f.blocker.hp = 10; delete f.blocker.tactics;
    assert.ok(resolveLayerShot(f.state, BUILDING_WORLD, 'coast', f.shot(), true)); assert.equal(f.blocker.hp, 10);
    f.blocker.x = f.shooter.x + 128;
    const world = structuredClone(BUILDING_WORLD), row = Math.floor(f.shooter.y / 32), column = Math.floor((f.shooter.x + 48) / 32);
    world.maps.coast.cells[row][column] = 'wall';
    assert.ok(resolveLayerShot(f.state, world, 'coast', f.shot(), true)); assert.equal(f.target.hp, archetype(f.target.id)!.hp);
});

test('a projectile starting inside a shell still uses its actual incoming direction for armour', () => {
    for (const direction of [-1, 1]) {
        const f = fixture(); f.target.id = 'salt-hulk'; f.target.hp = 160;
        f.target.tactics = initialTactics(f.target.id, 'hulk'); f.raid.roster.find(r => r.uid === f.target.uid)!.id = f.target.id;
        const bullet = { ...f.shot(), x: f.target.x, vx: 365 * direction };
        assert.ok(resolveLayerShot(f.state, BUILDING_WORLD, 'coast', bullet, true));
        assert.equal(f.target.hp, direction === -1 ? 100 : 60); assert.equal(f.raid.training.quantity.technique, 0); f.validate();
    }
});

test('a guard observes a rival instead of the passive player, then searches only its last observed position', () => {
    const guard = actor('blockade-sentry', 'guard', 200), raider = actor('raider-gunner', 'raider', 340);
    let visible = true;
    const world = { elapsed: 0, player: { x: 200, y: 350 }, enemies: [guard, raider], highTide: false, shotNoise: null, noiseTime: 0, noiseRadius: 200, space: null,
        sight: (_from: unknown, to: { x: number; y: number }) => to === world.player || visible, walkable: () => true,
        path: (_from: unknown, to: { x: number; y: number }) => [to], dryRefuge: () => null, move() {} };
    const effects = { fire() {}, strike() {}, openDoor() {}, notice() {} };
    for (let i = 0; i < 15; i++) { world.elapsed += .05; advanceTacticalEnemy(world, effects, guard, .05); }
    assert.equal(guard.tactics!.memory!.target, 'raider'); assert.equal(guard.tactics!.stance, 'hostile');
    const last = structuredClone(guard.tactics!.memory); visible = false; raider.x = 1200;
    for (let i = 0; i < 5; i++) { world.elapsed += .05; advanceTacticalEnemy(world, effects, guard, .05); }
    assert.deepEqual(guard.tactics!.memory, last); assert.equal(guard.tactics!.lockedAim, 0);
});

test('NPC death and its one corpse remain a single retryable transaction on quota failure', () => {
    const f = fixture(), raw = f.raw, baseline = structuredClone(f.session.expansion);
    const ticket = f.saves.prepareExpansionMutation(draft => {
        Object.assign(draft.expansion, structuredClone(f.state));
        const victim = draft.expansion.raid!.maps.coast.enemies.find(e => e.uid === f.target.uid)!;
        damageLayerEnemy(draft.expansion, 'coast', victim, 1000, true, { owner: f.shooter.uid, at: f.shooter });
    });
    assert.ok(ticket); f.deny(true);
    assert.equal(f.saves.commitExpansionMutation(ticket), 'save-failed'); assert.equal(f.raw, raw); assert.deepEqual(f.session.expansion, baseline);
    f.deny(false); assert.equal(f.saves.commitExpansionMutation(ticket), 'committed'); assert.equal(f.saves.commitExpansionMutation(ticket), 'rejected');
    const raid = decodeSession(f.raw).expansion!.raid!;
    assert.equal(raid.kills, 0); assert.equal(raid.maps.coast.containers.filter(c => c.id === `corpse-${f.target.uid}`).length, 1);
});

test('Runtime melee publishes rival hurt/death and preserves paid recovery across snapshot and reload', () => {
    const f = fixture();
    f.shooter.id = 'raider-melee'; f.shooter.hp = archetype(f.shooter.id)!.hp; f.shooter.x = f.target.x - 28;
    f.shooter.tactics = initialTactics(f.shooter.id, 'group'); f.raid.roster.find(e => e.uid === f.shooter.uid)!.id = f.shooter.id;
    f.target.hp = 5;
    Object.assign(f.shooter.tactics, { stance: 'hostile', awareness: 1, phase: 'release', phaseLeft: 0,
        memory: { at: { x: f.target.x, y: f.target.y }, time: 0, source: 'sight', target: f.target.uid } });
    const ticket = f.saves.prepareExpansionMutation(draft => { Object.assign(draft.expansion, structuredClone(f.state)); });
    assert.ok(ticket); assert.equal(f.saves.commitExpansionMutation(ticket), 'committed'); f.session.state = 'run';
    const runtime = new CoastRaidRuntime(f.session, f.saves);
    try {
        runtime.updateEnemy(runtime.enemies.find(e => e.uid === f.shooter.uid)!, .05);
        assert.equal(runtime.enemies.find(e => e.uid === f.target.uid)!.hp, 0); assert.equal(runtime.kills, 0);
        assert.equal(runtime.enemies.find(e => e.uid === f.shooter.uid)!.tactics!.phase, 'recovery');
        const death = runtime.current().events.find(e => e.type === 'death' && e.uid === f.target.uid);
        assert.equal(death?.type === 'death' && death.killer, f.shooter.uid, 'the HUD must not turn a recent player hit into a false player kill');
        assert.ok(f.saves.persist(), f.session.storageError); runtime.reloadCommitted();
        assert.equal(runtime.enemies.find(e => e.uid === f.shooter.uid)!.tactics!.phase, 'recovery');
        assert.equal(runtime.containers.filter(c => c.id === `corpse-${f.target.uid}`).length, 1);
    } finally { runtime.cancelStart(); }
});

test('asking from outside the boundary is read-only and cannot reset an existing warning or combat', () => {
    const f = fixture(); f.raid.player.x = f.shooter.x + 192;
    const ticket = f.saves.prepareExpansionMutation(draft => { Object.assign(draft.expansion, structuredClone(f.state)); });
    assert.ok(ticket); assert.equal(f.saves.commitExpansionMutation(ticket), 'committed'); f.session.state = 'run';
    const runtime = new CoastRaidRuntime(f.session, f.saves);
    try {
        const guard = runtime.enemies.find(e => e.uid === f.target.uid)!, before = f.raw;
        for (const stance of ['idle', 'warning', 'hostile'] as const) {
            Object.assign(guard.tactics!, { stance, warning: 2, awareness: 1 });
            const baseline = structuredClone(guard.tactics), interaction = runtime.targetView();
            assert.equal(interaction?.kind, 'talk'); assert.equal(interaction?.ref.id, guard.uid);
            assert.ok(runtime.activate(interaction!.ref)); assert.deepEqual(guard.tactics, baseline); assert.equal(f.raw, before);
        }
        const stale = { ...runtime.targetView()!.ref, mapId: 'other-map' };
        assert.equal(runtime.activate(stale), false);
        runtime.player.x += 120; assert.notEqual(runtime.targetView()?.kind, 'talk');
    } finally { runtime.cancelStart(); }
});
