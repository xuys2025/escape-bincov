import test from 'node:test';
import assert from 'node:assert/strict';
import { arm, perkBench, reopen, LANE } from './fixtures/shooting-bench';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { createSessionState, SaveSession } from '../src/session';
import { SampleSound, type SoundOut, type HitCueOut } from '../src/coast-view/sound';
import type { PublishedView, StampedEvent, ViewEventBody } from '../src/raid-runtime/contract';

function recording() {
    const calls: { name: string; args: unknown[] }[] = [];
    const out = new Proxy({}, { get: (_target, name: string) => (...args: unknown[]) => { calls.push({ name, args }); } }) as SoundOut & HitCueOut;
    const sound = new SampleSound(out);
    const play = (batch: PublishedView, dt: number, shown = (_point: { x: number; y: number }) => true, actorShown = (_uid: string) => true) => {
        sound.frame(batch, dt);
        for (const event of batch.events) sound.event(event, batch.stamp.world.mapId, shown, actorShown);
    };
    return { sound, calls, play, count: (name: string) => calls.filter(call => call.name === name).length };
}

function shooting(distance: number) {
    const bench = arm(perkBench(), 'shotgun'), runtime = bench.runtime;
    const target = runtime.enemies.find(enemy => enemy.id === 'elite' && enemy.hp > 0)!;
    bench.driver.placeEnemy(target.uid, { x: LANE.at.x + distance, y: LANE.at.y });
    return { bench, runtime, target: target.uid };
}

for (const [fps, distance] of [[60, 88], [120, 76], [240, 80]]) {
    test(`one shotgun shot sounds once when its six hits span batches (${fps} Hz, ${distance} px)`, () => {
        const { runtime, target } = shooting(distance), audio = recording(), events: StampedEvent[] = [], revisions = new Set<number>();
        const hp = runtime.enemies.find(enemy => enemy.uid === target)!.hp, magazine = runtime.mag;
        for (let frame = 0; frame <= Math.ceil(fps * .3); frame++) {
            const batch = runtime.advance(1000 + frame * 1000 / fps, { ...emptyIntent(), aim: 0, firePressed: frame === 0 });
            audio.play(batch, 1 / fps); events.push(...batch.events);
            if (batch.events.some(event => event.type === 'hurt' && event.uid === target)) revisions.add(batch.stamp.revision);
        }
        assert.equal(revisions.size, 2, 'the counterexample really crosses a publication boundary');
        const shots = events.filter(event => event.type === 'shot' && event.shooter === 'player');
        assert.equal(shots.length, 1); assert.ok(shots[0].type === 'shot'); assert.equal(shots[0].pellets.length, 6);
        assert.equal(events.filter(event => event.type === 'hurt' && event.uid === target).length, 6);
        assert.deepEqual(events.flatMap(event => event.type === 'hurt' && event.uid === target ? [event.bullet] : []).sort(),
            shots[0].pellets.map(pellet => pellet.bullet).sort(), 'each hurt carries the actual impacting bullet identity');
        assert.equal(hp - runtime.enemies.find(enemy => enemy.uid === target)!.hp, 97.5);
        assert.equal(magazine - runtime.mag, 1); assert.equal(audio.count('shot'), 1);
        assert.equal(audio.count('hit'), 1); assert.equal(audio.count('crit'), 1);
        runtime.finish('abandon'); runtime.dispose();
    });
}

test('two shotgun shots on one target in one long frame each retain their hit sound', () => {
    const { runtime, target } = shooting(40), audio = recording(), events: StampedEvent[] = [];
    for (const ms of [1000, 2000]) {
        const batch = runtime.advance(ms, { ...emptyIntent(), aim: 0, fireHeld: true, source: 'touch' });
        audio.play(batch, ms === 1000 ? 0 : 1); events.push(...batch.events);
    }
    assert.equal(events.filter(event => event.type === 'shot').length, 2);
    assert.equal(events.filter(event => event.type === 'hurt' && event.uid === target).length, 12);
    assert.equal(audio.count('shot'), 2); assert.equal(audio.count('hit'), 2);
    runtime.finish('abandon'); runtime.dispose();
});

test('classic projectile hurts carry their real bullet identity for both the target and the player', () => {
    const state = createSessionState(), data = new Map<string, string>();
    const saves = new SaveSession(state, () => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }));
    assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42), true); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(runtime, '?test=1');
    driver.freezeAI(true); driver.placePlayer(LANE.at); driver.weapon('shotgun');
    const target = runtime.enemies.find(enemy => enemy.id === 'elite' && enemy.hp > 0)!;
    driver.placeEnemy(target.uid, { x: LANE.at.x + 40, y: LANE.at.y });
    const first = runtime.advance(1000, { ...emptyIntent(), aim: 0, firePressed: true }), shot = first.events.find(event => event.type === 'shot');
    assert.ok(shot?.type === 'shot');
    const next = runtime.advance(1100, emptyIntent()), hits = next.events.filter(event => event.type === 'hurt' && event.uid === target.uid);
    assert.ok(hits.length > 0);
    assert.ok(hits.every(event => event.type === 'hurt' && shot.pellets.some(pellet => pellet.bullet === event.bullet)));
    const checkpoint = runtime.snapshot(), bullet = `entity-${checkpoint.nextEntity++}`;
    checkpoint.bullets.push({ uid: bullet, x: LANE.at.x - 18, y: LANE.at.y, rotation: 0, vx: 760, vy: 0, left: 200, damage: 5, enemy: true });
    runtime.restore(checkpoint);
    const incoming = runtime.advance(1120, emptyIntent()).events.find(event => event.type === 'hurt' && event.uid === 'player');
    assert.ok(incoming?.type === 'hurt'); assert.equal(incoming.bullet, bullet);
    runtime.finish('abandon'); runtime.dispose();
});

/** Real map/frame values, with only the transient presentation events and their publication boundary controlled. */
function presentation() {
    const { runtime } = shooting(40), original = runtime.current(), audio = recording();
    runtime.finish('abandon'); runtime.dispose();
    let seq = 0;
    const batch = (revision: number, bodies: ViewEventBody[], active: string[] = [], patch: Partial<PublishedView['stamp']> = {}): PublishedView => {
        const stamp = { ...original.stamp, revision, ...patch };
        return { ...original, stamp,
            frame: { ...original.frame, bullets: active.map(uid => ({ uid, x: 240, y: 1104, vx: 760, vy: 0, enemy: false, owner: 'player' })) },
            events: bodies.map(body => ({ ...body, stamp, seq: ++seq, durability: 'accepted' })) };
    };
    const shot = (shotId: string, bullets: string[]): ViewEventBody => ({ type: 'shot', shotId, shooter: 'player', weapon: 'shotgun',
        pellets: bullets.map(bullet => ({ bullet, origin: LANE.at, angle: 0 })) });
    const impact = (bullet: string): ViewEventBody => ({ type: 'impact', bullet, owner: 'player', reason: 'hit-actor',
        target: 'target', surface: 'actor', contact: LANE.at, lastFree: LANE.at, normal: null });
    const hit = (bullet?: string, uid = 'target', critical = false): ViewEventBody => ({ type: 'hurt', cause: 'blow', uid,
        at: LANE.at, damage: 15, critical, angle: 0, ...(bullet === undefined ? {} : { bullet }) });
    return { ...audio, batch, shot, impact, hit, original };
}

test('one shot keeps each target cue, allows a later critical, and hidden hits do not consume the audible cue', () => {
    const f = presentation();
    f.play(f.batch(1, [f.shot('shot-a', ['a', 'b', 'c', 'd', 'e', 'f'])], ['a', 'b', 'c', 'd', 'e', 'f']), 0);
    f.play(f.batch(2, [f.impact('a'), f.hit('a')], ['b', 'c', 'd', 'e', 'f']), 0, () => false);
    f.play(f.batch(3, [f.impact('b'), f.hit('b')], ['c', 'd', 'e', 'f']), 0, () => true, () => false);
    assert.equal(f.count('hit'), 0);
    f.play(f.batch(4, [f.impact('c'), f.hit('c')], ['d', 'e', 'f']), 0);
    f.play(f.batch(5, [f.impact('d'), f.hit('d', 'target', true)], ['e', 'f']), 0);
    assert.equal(f.count('hit'), 1); assert.equal(f.count('crit'), 1);
    f.play(f.batch(6, [f.impact('e'), f.hit('e', 'target', true)], ['f']), 0);
    assert.equal(f.count('hit'), 1); assert.equal(f.count('crit'), 1, 'a second critical pellet does not repeat the tick');
    f.play(f.batch(7, [f.impact('f'), f.hit('f', 'other-target', true)]), 0);
    assert.equal(f.count('hit'), 2); assert.equal(f.count('crit'), 2);
    f.sound.killed(); assert.equal(f.count('kill'), 1, 'kill confirmation remains owned by the host marker');
});

test('unwitnessed restored bullets and melee retain the original per-batch fallback without inventing gunfire', () => {
    const f = presentation();
    f.play(f.batch(1, [f.hit('old-1'), f.hit('old-2', 'target', true)]), 0);
    f.play(f.batch(2, [f.hit('old-3')]), 0);
    f.play(f.batch(3, [f.hit(), f.hit()]), 0);
    assert.equal(f.count('hit'), 3); assert.equal(f.count('crit'), 1); assert.equal(f.count('shot'), 0);
});

test('a real checkpoint reload retains flying pellets and falls back without persisting or replaying shot groups', () => {
    const { bench, runtime, target } = shooting(40);
    runtime.advance(1000, { ...emptyIntent(), aim: 0, firePressed: true });
    const flying = runtime.snapshot().bullets;
    assert.equal(flying.length, 6); assert.equal(runtime.checkpoint(), true);
    const restored = reopen(bench), audio = recording(); restored.runtime.freezeAI = true;
    assert.deepEqual(restored.runtime.snapshot().bullets, flying);
    for (const bullet of flying) assert.equal(Object.hasOwn(bullet, 'shotId'), false);
    const events: StampedEvent[] = [];
    for (const ms of [2000, 2100]) {
        const batch = restored.runtime.advance(ms, emptyIntent()); audio.play(batch, .1); events.push(...batch.events);
    }
    assert.equal(events.filter(event => event.type === 'hurt' && event.uid === target).length, 6);
    assert.equal(audio.count('shot'), 0); assert.equal(audio.count('hit'), 1);
    restored.runtime.finish('abandon'); restored.runtime.dispose();
    // The first page is abandoned by reload (as in the shared reopen fixture); it no longer owns the stored revision.
});

test('shot correlation expires with the last referenced batch and stays bounded during repeated firing and pause', () => {
    const f = presentation();
    const cache = f.sound as unknown as { bulletShots: Map<string, string>; shotHits: Map<string, unknown> };
    for (let shot = 0; shot < 80; shot++) {
        const revision = shot * 3, bullet = `round-${shot}`;
        f.play(f.batch(revision, [f.shot(`shot-${shot}`, [bullet])], [bullet]), 0);
        f.play(f.batch(revision + 1, [f.impact(bullet), f.hit(bullet)]), 0);
        assert.equal(cache.bulletShots.size, 1); assert.equal(cache.shotHits.size, 1);
        const empty = f.batch(revision + 2, []);
        f.play({ ...empty, frame: { ...empty.frame, phase: 'paused' } }, 0);
        assert.equal(cache.bulletShots.size, 0); assert.equal(cache.shotHits.size, 0);
    }
    assert.equal(f.count('hit'), 80);
});

test('run, world, map and epoch changes release correlation; stale same-map events cannot repopulate it', () => {
    for (const change of ['runId', 'worldVersion', 'layoutRevision', 'mapId', 'epoch'] as const) {
        const f = presentation(), old = f.batch(1, [f.shot('same-shot', ['same-bullet']), f.hit('same-bullet')], ['same-bullet']);
        f.play(old, 0);
        const patch = change === 'epoch' ? { epoch: old.stamp.epoch + 1 }
            : { world: { ...old.stamp.world, [change]: `changed-${change}` } };
        const next = f.batch(2, [], [], patch); f.play(next, 0);
        for (const event of old.events) f.sound.event(event, next.stamp.world.mapId);
        assert.equal(f.count('hit'), 1); assert.equal(f.count('shot'), 1, `${change}: stale source events remain silent`);
        f.play(f.batch(3, [f.hit('same-bullet')], [], patch), 0);
        assert.equal(f.count('hit'), 2, `${change}: the old source now takes the unknown-shot fallback`);
    }
});
