import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { advanceAim, coneOf, drawAim, driftOf, handlingOf, recoil, turnAim, unsteadyAim, SWAY, type AimState, type Handling, type Motion } from '../src/shooting';
import { GUNS } from '../src/gunsmith/catalog';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
const aim = (patch: Partial<AimState> = {}): AimState => ({ raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0, ...patch });
const MOTIONS: Motion[] = [{ pace: 0, sprint: false, precise: true }, { pace: .7, sprint: false, precise: false }, { pace: 1.6, sprint: true, precise: true }];
/** A weapon's factory handling: the knife's and the old three's table rows, the M4A1's from the gunsmith catalog. */
const grip = (id: string): Handling => id === 'mb4a1' ? GUNS.mb4a1.handling : handlingOf(id);

test('aim rules are closed forms of time: splitting an interval changes nothing but rounding', () => {
    for (const id of ['pistol', 'carbine', 'shotgun', 'mb4a1']) for (const motion of MOTIONS) {
        const h = grip(id), rules = SWAY;
        const start = () => aim({ raise: .3, sway: .4, bloom: .8, drift: .6, settle: .07 });
        const whole = advanceAim(start(), h, rules, .23, motion);
        const split = start();
        for (const s of [.01, .04, .005, .095, .08]) advanceAim(split, h, rules, s, motion);
        for (const k of Object.keys(whole) as (keyof AimState)[]) assert.ok(Math.abs(whole[k] - split[k]) < 1e-12, `${id} ${k}`);
    }
});

test('a precise aim rises over its raise time and drops twice as fast; sprinting drops it', () => {
    const h = handlingOf('carbine'), rules = SWAY, a = aim();
    advanceAim(a, h, rules, h.raise / 2, { pace: 0, sprint: false, precise: true }); assert.ok(near(a.raise, .5));
    advanceAim(a, h, rules, h.raise, { pace: 0, sprint: false, precise: true }); assert.equal(a.raise, 1);
    advanceAim(a, h, rules, h.raise / 4, { pace: 0, sprint: false, precise: false }); assert.ok(near(a.raise, .5));
    advanceAim(a, h, rules, h.raise, { pace: 1.7, sprint: true, precise: true }); assert.equal(a.raise, 0);
});

test('the cone: hip at rest is spread times hip, a raised aim narrows it, sway and bloom widen it, the body scales it', () => {
    for (const id of ['pistol', 'carbine', 'shotgun'] as const) {
        const w = D.WEAPONS[id], h = handlingOf(id);
        assert.ok(near(coneOf(aim(), w, h), w.spread * h.hip));
        assert.ok(near(coneOf(aim({ raise: 1 }), w, h), w.spread * h.hip * h.precise));
        assert.ok(near(coneOf(aim({ sway: 1 }), w, h), w.spread * h.hip * (1 + h.sway)));
        assert.ok(near(coneOf(aim({ bloom: 1 }), w, h), w.spread * h.hip + h.bloomMax));
        assert.ok(near(coneOf(aim({ bloom: .5, sway: .5 }), w, h, 1.1), coneOf(aim({ bloom: .5, sway: .5 }), w, h) * 1.1));
    }
    // The knife has no cone or recoil.
    const knife = handlingOf('knife'), a = aim();
    recoil(a, knife); assert.equal(a.bloom, 0); assert.equal(a.drift, 0); assert.equal(driftOf(a, knife), 0);
});

test('recoil adds bloom and drift up to their caps and restarts the settle delay; recovery waits for it', () => {
    const h = grip('mb4a1'), rules = SWAY, a = aim();
    recoil(a, h);
    assert.ok(near(a.bloom, h.bloom / h.bloomMax) && near(a.drift, h.kick / h.kickMax) && a.settle === h.settle);
    for (let i = 0; i < 40; i++) recoil(a, h);
    assert.equal(a.bloom, 1); assert.equal(a.drift, 1); assert.ok(near(driftOf(a, h), h.kickMax));
    advanceAim(a, h, rules, h.settle, { pace: 0, sprint: false, precise: false });
    assert.equal(a.bloom, 1);
    advanceAim(a, h, rules, .25, { pace: 0, sprint: false, precise: false });
    assert.ok(near(a.bloom, Math.exp(-h.recover * .25)) && near(a.drift, a.bloom));
});

test('turns and draws shake the aim; the worst state is fully unsteady and bloomed', () => {
    const rules = SWAY, a = aim({ raise: 1, bloom: .4 });
    turnAim(a, rules, -Math.PI / 4); assert.ok(near(a.sway, rules.turn * Math.PI / 4));
    turnAim(a, rules, Math.PI * 2); assert.equal(a.sway, 1);
    const b = aim({ raise: 1, sway: .1, bloom: .4, drift: .3 });
    drawAim(b, rules); assert.deepEqual(b, { raise: 0, sway: rules.draw, bloom: .4, drift: .3, settle: 0 });
    assert.deepEqual(unsteadyAim(), { raise: 0, sway: 1, bloom: 1, drift: 0, settle: 0 });
});

test('the M4A1 is the automatic one; the retired #39 sample rifle has no row anywhere (#28 M2-01)', () => {
    assert.equal(grip('mb4a1').mode, 'auto');
    assert.ok(['pistol', 'carbine', 'shotgun', 'knife'].every(id => handlingOf(id).mode === 'semi'));
    assert.ok(D.isGun('mb4a1') && Object.hasOwn(D.ITEMS, 'mb4a1'));
    // The sample's id names nothing: no item, no weapon, no handling of its own (an unknown id has no recoil).
    assert.equal(Object.hasOwn(D.ITEMS, 'm4a1') || Object.hasOwn(D.WEAPONS, 'm4a1') || D.isGun('m4a1'), false);
    assert.deepEqual(handlingOf('m4a1'), handlingOf('knife'));
});

test('touch: standing with the aim stick inside the fire ring raises the aim, firing past it holds, walking lowers it', () => {
    const h = handlingOf('pistol'), rules = SWAY, a = aim();
    advanceAim(a, h, rules, h.raise / 2, { pace: 0, sprint: false, precise: false, hold: 'aim' }); assert.ok(near(a.raise, .5));
    advanceAim(a, h, rules, h.raise, { pace: 0, sprint: false, precise: false, hold: 'fire' }); assert.ok(near(a.raise, .5), 'firing holds the raise');
    advanceAim(a, h, rules, h.raise / 8, { pace: .8, sprint: false, precise: false, hold: 'aim' }); assert.ok(near(a.raise, .25), 'walking lowers it');
    advanceAim(a, h, rules, h.raise, { pace: 0, sprint: false, precise: false, hold: 'aim' }); assert.equal(a.raise, 1);
    advanceAim(a, h, rules, h.raise / 4, { pace: .8, sprint: false, precise: false, hold: 'fire' }); assert.ok(near(a.raise, .5), 'firing on the move does not hold it');
});

test('recoil scale: 1 is the #39 recoil bit for bit; 0.68 adds 0.68 of a shot\'s bloom and drift and leaves the inherent cone alone', () => {
    // #39's recoil, verbatim: the reference for scale 1.
    const before = (a: AimState, h: Handling) => {
        if (h.bloomMax > 0) a.bloom = Math.min(1, a.bloom + h.bloom / h.bloomMax);
        if (h.kickMax > 0) a.drift = Math.min(1, a.drift + h.kick / h.kickMax);
        a.settle = h.settle;
    };
    const random = D.seededRandom(39), scale = .8 * .85;
    for (const id of ['knife', 'pistol', 'carbine', 'shotgun', 'mb4a1']) {
        const h = grip(id), w = D.WEAPONS[id];
        for (let i = 0; i < 50; i++) {
            const start = aim({ raise: random(), sway: random(), bloom: random(), drift: random(), settle: random() * .2 });
            const old = structuredClone(start), plain = structuredClone(start), one = structuredClone(start);
            before(old, h); recoil(plain, h); recoil(one, h, 1);
            assert.deepEqual(plain, old, id); assert.deepEqual(one, old, id);
        }
        const full = aim(), scaled = aim();
        recoil(full, h); recoil(scaled, h, scale);
        assert.ok(near(scaled.bloom, scale * full.bloom) && near(scaled.drift, scale * full.drift) && scaled.settle === full.settle, id);
        assert.ok(near(driftOf(scaled, h), scale * driftOf(full, h)), id);
        // Only the recoil share of the cone shrinks: hip, precise and sway parts are the gun's own.
        for (const stance of [{}, { raise: 1 }, { raise: 1, sway: .4 }]) {
            const cone = (a: AimState) => coneOf({ ...a, ...stance }, w, h), rest = cone(aim());
            assert.ok(near(cone(scaled) - rest, scale * (cone(full) - rest)), id);
        }
    }
});

test('sustained fire at 0.68: with the same motion and draws every increment is 0.68 of the plain one until a cap; caps, settle and recovery stay', () => {
    const scale = .8 * .85, motion: Motion = { pace: 0, sprint: false, precise: true };
    for (const id of ['carbine', 'mb4a1'] as const) {
        const h = grip(id), w = D.WEAPONS[id];
        const fire = (k: number) => {
            const a = aim({ raise: 1 }), random = D.seededRandom(28), shots: { aim: AimState; draw: number; angle: number }[] = [];
            for (let i = 0; i < 30; i++) {
                const draw = random(), angle = driftOf(a, h) + (draw - .5) * coneOf(a, w, h), was = { ...a };
                shots.push({ aim: was, draw, angle });
                recoil(a, h, k);
                assert.ok(near(a.bloom - was.bloom, Math.min(h.bloom / h.bloomMax * k, 1 - was.bloom)), `${id} bloom ${i}`);
                assert.ok(near(a.drift - was.drift, Math.min(h.kick / h.kickMax * k, 1 - was.drift)), `${id} drift ${i}`);
                assert.ok(a.bloom <= 1 && a.drift <= 1 && a.settle === h.settle);
                advanceAim(a, h, SWAY, w.cooldown, motion);
            }
            return { a, shots };
        };
        const full = fire(1), scaled = fire(scale);
        let capped = false, checked = 0;
        for (let i = 0; i < 30; i++) {
            const u = full.shots[i], s = scaled.shots[i];
            // Stance and sway, so the inherent cone, move the same; with the same draw only recoil's share of the angle shrinks.
            assert.equal(s.aim.raise, u.aim.raise); assert.equal(s.aim.sway, u.aim.sway); assert.equal(s.draw, u.draw);
            if (!capped) {
                const inherent = (s.draw - .5) * coneOf({ ...s.aim, bloom: 0 }, w, h);
                assert.ok(near(s.aim.bloom, scale * u.aim.bloom) && near(s.aim.drift, scale * u.aim.drift), `${id} shot ${i}`);
                assert.ok(near(s.angle - inherent, scale * (u.angle - inherent)), `${id} angle ${i}`);
                checked++;
            }
            // Until the plain run first meets a cap the two runs stay in proportion.
            capped ||= u.aim.bloom + h.bloom / h.bloomMax > 1 || u.aim.drift + h.kick / h.kickMax > 1;
        }
        assert.ok(checked >= 9, `${id}: ${checked} shots in proportion`);
        // The automatic M4A1 reaches both caps either way; recovery after the burst runs at the same rate.
        if (id === 'mb4a1') { assert.deepEqual([full.a.bloom, full.a.drift, scaled.a.bloom, scaled.a.drift], [1, 1, 1, 1]); }
        const rest = { u: { ...full.a }, s: { ...scaled.a } };
        assert.equal(rest.s.settle, rest.u.settle);
        advanceAim(full.a, h, SWAY, 1, motion); advanceAim(scaled.a, h, SWAY, 1, motion);
        const fade = Math.exp(-h.recover * (1 - rest.u.settle));
        assert.ok(near(full.a.bloom, rest.u.bloom * fade) && near(scaled.a.bloom, rest.s.bloom * fade), id);
    }
});
