import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { emptyIntent } from '../src/raid-runtime/runtime';
import { advanceAim, coneOf, driftOf, handlingOf, recoil, unsteadyAim, SWAY, type AimState } from '../src/shooting';
import { GUNS as CATALOG } from '../src/gunsmith/catalog';
import { benchRaid, arm, replay, mouse, mouseHold, touchHold, deviations, cadence, dummy, GUNS, LANE, DUMMY_RADIUS, type Gun, type Script } from './fixtures/shooting-bench';

// PR #39 shooting bench. S0 recorded the old shooting (see docs/SHOOTING-SYSTEM-REWORK.md); these are the S2/S3
// requirements: the same input gives the same shots at any display rate, the trigger follows the gun type on both
// devices, and stance, motion, bursts and pauses change where shots go in ways that repeat.
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const still = { pace: 0, sprint: false, precise: false };
const settled = (): AimState => ({ raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 });
/** The published aim at the last frame at or before raid time `t`. */
const aimAt = (log: ReturnType<typeof replay>, t: number) => [...log.aims].reverse().find(a => a.t <= t + 1e-9)!;

test('shooting bench: the same seed and script replay to the same shots, hits and magazine', () => {
    const run = () => { const b = arm(benchRaid(), 'carbine'), uid = dummy(b, 320); return replay(b, mouse([0, .3, .6, .9, 1.2]), 1.8, 60, uid); };
    const first = run(), second = run();
    assert.deepEqual(second, first);
    assert.equal(first.shots.length, 5); assert.equal(first.hurt.length, 5); assert.equal(first.mag, D.WEAPONS.carbine.magazine - 5);
    assert.deepEqual(first.impacts.map(i => i.reason), Array(5).fill('hit-actor'));
});

test('shooting bench: clicks and held fire give the same shots and aim at 20 and 144 Hz and on uneven frames', () => {
    // Input changes sit on every tested frame grid (multiples of .25 s); uneven frames only meet scripts whose sole press
    // is at 0, because elsewhere they sample the press later and the shot really is later.
    const scripts: [Gun, Script, number, boolean][] = [
        ['pistol', mouse([0, .25, .5, .75]), 1.2, false], ['carbine', touchHold(0, 1.3), 1.5, true], ['shotgun', mouse([0, .75]), 1, false],
        ['mb4a1', mouseHold(0, .95), 1.4, true], ['mb4a1', (t, p) => t < .75 ? mouseHold(0, .45)(t, p) : mouseHold(.75, 1.2)(t, p), 1.6, false],
    ];
    for (const [gun, script, seconds, uneven] of scripts) {
        const logs = [20, 144, ...uneven ? [[7, 23, 16, 41]] : []].map(fps => replay(arm(benchRaid(), gun), script, seconds, fps));
        for (const log of logs.slice(1)) {
            assert.equal(log.shots.length, logs[0].shots.length, gun);
            log.shots.forEach((s, i) => s.angles.forEach((a, j) => assert.ok(near(a, logs[0].shots[i].angles[j]), `${gun} shot ${i}`)));
            // The aim state is a function of raid time alone: compare it wherever both runs published a frame.
            for (const t of [.5, 1]) for (const k of ['cone', 'drift', 'raise', 'sway', 'bloom'] as const)
                assert.ok(near(aimAt(log, t)[k], aimAt(logs[0], t)[k], 1e-6) || aimAt(log, t).t !== aimAt(logs[0], t).t, `${gun} ${k} at ${t}`);
        }
    }
});

test('shooting bench: desktop semi-automatic guns fire once per click, automatic ones while held, both at the exact rate', () => {
    // Holding the button on a pistol never repeats it.
    assert.equal(replay(arm(benchRaid(), 'pistol'), mouseHold(0, 1.5), 1.5, 60).shots.length, 1);
    // A click up to .15 s early waits for the gun: ten clicks 100 ms apart fire at the cooldown itself.
    const spam = Array.from({ length: 10 }, (_, i) => i * .1);
    for (const fps of [20, 60]) {
        const pistol = replay(arm(benchRaid(), 'pistol'), mouse(spam), 1, fps);
        assert.equal(pistol.shots.length, 4, `${fps} Hz`);
        // Shots fall at 0, .29, .58 and .87 s; each frame publishes the shots due inside it.
        pistol.shots.forEach((s, i) => assert.ok(s.t >= i * .29 - 1e-9 && s.t < i * .29 + 1 / fps + 1e-9, `${fps} Hz shot ${i} at ${s.t}`));
        // A click more than .15 s before the gun is ready is dropped, not queued.
        assert.equal(replay(arm(benchRaid(), 'pistol'), mouse([0, .1]), 1, fps).shots.length, 1, `${fps} Hz`);
        // The M4A1 fires every .1 s while held and stops when released: 0 to .9 s is ten shots.
        const m4 = replay(arm(benchRaid(), 'mb4a1'), mouseHold(0, .95), 1.5, fps);
        assert.equal(m4.shots.length, 10, `${fps} Hz`);
        assert.ok(near(cadence(m4), .1, 1 / fps), `${fps} Hz cadence ${cadence(m4)}`);
    }
});

test('shooting bench: a held touch stick repeats semi-automatic guns at their own rate and stops on release', () => {
    for (const gun of ['pistol', 'carbine'] as const) {
        const w = D.WEAPONS[gun], hold = w.cooldown * 4 + .05;
        for (const fps of [20, 60]) {
            const log = replay(arm(benchRaid(), gun), touchHold(0, hold), hold + .4, fps);
            assert.equal(log.shots.length, 5, `${gun} ${fps} Hz`);
            assert.ok(log.shots.every((s, i) => s.t >= i * w.cooldown - 1e-9 && s.t < i * w.cooldown + 1 / fps + 1e-9), `${gun} ${fps} Hz`);
        }
    }
});

test('shooting bench: a frame that sees the trigger released lets no held shot out of its interval', () => {
    // 20 Hz: the carbine shot due at .96 s falls inside the .95–1.0 s frame, whose sample already has the stick back
    // inside the ring, so it is not fired (the release could have come first). Nothing ever fires after a release.
    const cut = replay(arm(benchRaid(), 'carbine'), touchHold(0, 1), 1.3, 20);
    assert.equal(cut.shots.length, 4);
    assert.ok(cut.shots.every(s => s.t < .95 + 1e-9), JSON.stringify(cut.shots.map(s => s.t)));
});

test('shooting bench: pause, a panel, a layer of suppression or losing focus drop the trigger and a waiting click', () => {
    // A held rifle: pausing stops it, and after resuming the still-held button stays dead until it is released.
    const b = arm(benchRaid(), 'mb4a1'), r = b.runtime, held = { ...emptyIntent(), aim: 0, firePressed: false, fireHeld: true };
    r.advance(1000, { ...held, firePressed: true }); r.advance(1150, held);
    const before = r.mag;
    r.pause('blur'); r.advance(1300, held); r.advance(1600, held); assert.equal(r.mag, before);
    r.resume(); r.advance(1700, held); r.advance(2000, held); assert.equal(r.mag, before);
    r.advance(2100, { ...emptyIntent(), aim: 0 }); r.advance(2200, { ...held, firePressed: true }); assert.equal(r.mag, before - 1);
    // A click that found the pistol cooling is forgotten when a panel opens before the gun is ready.
    const p = arm(benchRaid(), 'pistol').runtime, click = { ...emptyIntent(), aim: 0, firePressed: true };
    p.advance(1000, click); p.advance(1200, click);
    const mag = p.mag; p.setBlocked(true); p.advance(1300, { ...emptyIntent(), aim: 0 }); p.setBlocked(false);
    p.advance(1400, { ...emptyIntent(), aim: 0 }); p.advance(1600, { ...emptyIntent(), aim: 0 }); assert.equal(p.mag, mag);
});

test('shooting bench: recoil moves the centre of the cone and the random draw is unchanged (replayed shot by shot)', () => {
    const b = arm(benchRaid(), 'mb4a1'), random = D.seededRandom(b.runtime.snapshot().rng);
    const log = replay(b, mouseHold(0, 1.25), 1.6, 60);
    const h = CATALOG.mb4a1.handling, w = D.WEAPONS.mb4a1, aim = settled();
    assert.equal(log.shots.length, 13);
    log.shots.forEach((s, i) => {
        if (i) advanceAim(aim, h, SWAY, w.cooldown, still);
        const expected = driftOf(aim, h) + (random() - .5) * coneOf(aim, w, h);
        assert.ok(near(deviations({ ...log, shots: [s] })[0], expected), `shot ${i}`);
        recoil(aim, h);
    });
    // By the end of the burst the centre has drifted right and the cone has bloomed.
    assert.ok(aim.drift > .9 && aim.bloom > .9);
});

test('shooting bench: a precise aim takes time to rise; motion, sprinting and sharp turns widen the cone, which settles', () => {
    const cone = (script: Script, seconds: number, gun: Gun = 'pistol') => replay(arm(benchRaid(), gun), script, seconds, 60).aims.at(-1)!.cone;
    const base = D.WEAPONS.pistol.spread * handlingOf('pistol').hip;
    assert.ok(near(cone(() => ({}), .5), base));
    const raising = cone(() => ({ precise: true }), .06), raised = cone(() => ({ precise: true }), .5);
    assert.ok(near(raised, base * handlingOf('pistol').precise) && raising > raised && raising < base, `${raising} ${raised}`);
    const walking = cone(() => ({ move: { x: 0, y: 1, sprint: false } }), 1);
    const sprinting = cone(() => ({ move: { x: 0, y: 1, sprint: true } }), 1);
    assert.ok(walking > base * 1.4 && sprinting > walking, `${walking} ${sprinting}`);
    // Stopping a sprint: back within 5% of the base cone 1.3 s later.
    assert.ok(cone(t => ({ move: { x: 0, y: t < .5 ? 1 : 0, sprint: t < .5 } }), 1.8) < base * 1.05);
    // A quarter turn shakes the aim; it has calmed 1.4 s later.
    const turn = replay(arm(benchRaid(), 'pistol'), t => ({ aim: t >= .2 ? Math.PI / 2 : 0 }), 1.6, 60);
    assert.ok(aimAt(turn, .2).cone > base * 1.4 && turn.aims.at(-1)!.cone < base * 1.05);
});

test('shooting bench: held fire blooms and drifts right, and a short pause recovers both', () => {
    const log = replay(arm(benchRaid(), 'mb4a1'), mouseHold(0, .65), 1.7, 60);
    const at = (t: number) => aimAt(log, t);
    assert.ok(at(.2).cone < at(.4).cone && at(.4).cone < at(.6).cone);
    assert.ok(at(.2).drift > 0 && at(.2).drift < at(.6).drift);
    // About a second after the last shot (.6 s) both are back within 5% of a calm gun.
    const calm = coneOf(settled(), D.WEAPONS.mb4a1, CATALOG.mb4a1.handling), peak = Math.max(...log.aims.map(a => a.drift));
    assert.ok(at(1.6).cone < calm * 1.05 && at(1.6).drift < .05 * peak, JSON.stringify(at(1.6)));
});

test('shooting bench: a raid built from its checkpoint starts unsteady; a weapon swap lowers the aim but keeps bloom', () => {
    const b = arm(benchRaid(), 'pistol'), r = b.runtime;
    replay(b, mouseHold(0, .1), .1, 60);
    r.reloadCommitted();
    assert.deepEqual(r.handling, unsteadyAim());
    const m4 = arm(benchRaid(), 'mb4a1');
    replay(m4, mouseHold(0, .35), .35, 60);
    const before = { ...m4.runtime.handling };
    m4.runtime.advance(1400, { ...emptyIntent(), aim: 0, commands: ['knife'] });
    // The draw lands at the frame's first substep; .05 s of settling follows inside the same frame.
    assert.equal(m4.runtime.handling.raise, 0);
    assert.ok(near(m4.runtime.handling.sway, SWAY.draw * Math.exp(-SWAY.down * .05)), String(m4.runtime.handling.sway));
    assert.ok(m4.runtime.handling.bloom > 0 && m4.runtime.handling.bloom <= before.bloom);
});

test('shooting bench: chance that one pellet crosses a 14 px dummy, from the published cone (report)', t => {
    // A pellet is uniform over the cone, so its chance to cross a circle of radius r at distance d is 2 asin(r/d) / cone.
    const share = (cone: number, d: number) => +Math.min(1, 2 * Math.asin(DUMMY_RADIUS / d) / cone).toFixed(2);
    for (const gun of [...GUNS, 'mb4a1'] as const) {
        const range = [160, 320, 480, 640].filter(d => d <= (gun === 'mb4a1' ? D.WEAPONS.mb4a1 : D.WEAPONS[gun]).range);
        const cone = (script: Script, seconds: number) => replay(arm(benchRaid(), gun), script, seconds, 20).aims.at(-1)!.cone;
        // Raising takes at most .4 s and sway reaches its target within .5 s (rate 10/s).
        const rows = { hip: cone(() => ({}), .05), precise: cone(() => ({ precise: true }), .5), walking: cone(() => ({ move: { x: 0, y: 1, sprint: false } }), .6),
            sprinting: cone(() => ({ move: { x: 0, y: 1, sprint: true } }), .6) };
        t.diagnostic(`${gun}: ${Object.entries(rows).map(([k, c]) => `${k} ${(c * 90 / Math.PI).toFixed(2)}deg ${JSON.stringify(Object.fromEntries(range.map(d => [d, share(c, d)])))}`).join('; ')}`);
    }
    assert.ok(LANE.aim === 0);
});

test('shooting bench: touch aim stick held inside the ring raises the aim like the right button; past it the shots keep it', () => {
    const inner: Script = () => ({ aimHeld: true, source: 'touch' });
    const raised = replay(arm(benchRaid(), 'carbine'), inner, .5, 60).aims.at(-1)!;
    assert.equal(raised.raise, 1);
    const precise = replay(arm(benchRaid(), 'carbine'), () => ({ precise: true }), .5, 60).aims.at(-1)!;
    assert.ok(Math.abs(raised.cone - precise.cone) < 1e-12, 'the same cone as a raised right-button aim');
    // Inside the ring for .5 s (the carbine rises in .4 s), then past it: the shots go out with the aim still raised.
    const log = replay(arm(benchRaid(), 'carbine'), t => ({ aimHeld: true, fireHeld: t >= .5, source: 'touch' }), 1.2, 60);
    assert.ok(log.shots.length >= 3 && log.aims.filter(a => a.t >= .5).every(a => a.raise === 1));
    // Walking with the stick held lowers it.
    const walk = replay(arm(benchRaid(), 'carbine'), t => ({ aimHeld: true, source: 'touch', move: { x: 0, y: t >= .5 ? 1 : 0, sprint: false } }), .8, 60);
    assert.ok(walk.aims.at(-1)!.raise < .1);
});
