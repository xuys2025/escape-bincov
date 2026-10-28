import test from 'node:test';
import assert from 'node:assert/strict';
import { heldWeaponOffset, idleRetraction, RETRACTION, retractionOf, stepRetraction } from '../src/coast-view/weapon-retraction';
import { GUN_TIMBRES, TIMBRE_OF_GUN } from '../src/gun-timbre';
import { GUNS } from '../src/gunsmith/catalog';
import { arm, benchRaid } from './fixtures/shooting-bench';
import { emptyIntent } from '../src/raid-runtime/runtime';

test('each gun family pulls back by its own amount (#75 H-09): pistols least, shotguns most, rifles as #119 signed off', () => {
    assert.deepEqual(Object.keys(RETRACTION).sort(), [...GUN_TIMBRES].sort());
    for (const [look, family] of [['pistol', 'pistol9'], ['carbine', 'carbine'], ['rifle', 'rifle'], ['shotgun', 'shotgun-double']] as const) {
        const state = idleRetraction(), { px, seconds } = RETRACTION[family];
        assert.equal(retractionOf(look), RETRACTION[family]);
        stepRetraction(state, look, 0, true, { seq: 1, weapon: look });
        assert.equal(stepRetraction(state, look, 0, true), px);
        assert.ok(Math.abs(stepRetraction(state, look, seconds / 2, true) - px / 2) < 1e-9, 'it recovers linearly');
        assert.equal(stepRetraction(state, look, seconds / 2, true), 0, 'and is home when its pulse ends');
    }
    for (const look of ['knife', 'club', 'claw'] as const) assert.equal(retractionOf(look), null);
    const r = RETRACTION;
    assert.ok(r.pistol9.px < r.carbine.px && r.carbine.px < r['shotgun-double'].px && r.pistol9.seconds < r.carbine.seconds && r.carbine.seconds < r['shotgun-double'].seconds);
    assert.deepEqual([r.carbine, r.rifle], [{ px: 3, seconds: .08 }, { px: 3, seconds: .08 }]);
    for (const family of GUN_TIMBRES) assert.ok(r[family].px > 0 && r[family].px <= 5 && r[family].seconds > 0 && r[family].seconds <= .13, family);
    // A pulse ends before the next automatic shot of any gun of its family, so a held trigger never stacks one.
    for (const gun of Object.values(GUNS)) assert.ok(r[TIMBRE_OF_GUN[gun.id]].seconds < gun.stats.cooldown, gun.id);
});

test('a shot frame keeps the old grip pixel exactly; subsequent frames recover without rotating the gun', () => {
    for (let dir = 0; dir < 8; dir++) for (const forward of [0, 8]) for (const off of [-4, 0, 4]) {
        const angle = dir * Math.PI / 4, state = idleRetraction();
        const back = stepRetraction(state, 'pistol', 1 / 60, true, { seq: 1, weapon: 'pistol' });
        assert.equal(back, 0);
        assert.deepEqual(heldWeaponOffset(angle, forward, off, back), {
            x: Math.round(Math.cos(angle) * forward + Math.sin(angle) * off),
            y: Math.round(Math.sin(angle) * forward - Math.cos(angle) * off),
        });
        const peak = stepRetraction(state, 'pistol', 0, true);
        assert.equal(peak, RETRACTION.pistol9.px);
        const base = heldWeaponOffset(angle, forward, off, 0), grip = heldWeaponOffset(angle, forward, off, peak);
        assert.ok(Math.hypot(grip.x - base.x + peak * Math.cos(angle), grip.y - base.y + peak * Math.sin(angle)) <= Math.SQRT2);
        assert.ok(stepRetraction(state, 'pistol', .04, true) > 0);
        assert.equal(stepRetraction(state, 'pistol', .04, true), 0);
    }
});

test('long frame and pause gaps expire the pulse; a new shot always resets to zero', () => {
    // .15 s: a frame longer than the double-barrel's whole pulse (RETRACTION['shotgun-double'], 0.13 s).
    const state = idleRetraction();
    assert.equal(stepRetraction(state, 'shotgun', .15, true, { seq: 1, weapon: 'shotgun' }), 0);
    assert.equal(stepRetraction(state, 'shotgun', .15, true), 0);
    assert.equal(stepRetraction(state, 'shotgun', .15, true), 0);
    stepRetraction(state, 'shotgun', 0, true, { seq: 2, weapon: 'shotgun' });
    stepRetraction(state, 'shotgun', .01, true);
    assert.equal(stepRetraction(state, 'shotgun', .01, true, { seq: 3, weapon: 'shotgun' }), 0);
    assert.ok(stepRetraction(state, 'shotgun', .01, true) > 0);
    assert.equal(stepRetraction(state, 'shotgun', 1, true), 0, 'a long pause cannot defer a peak until rendering resumes');
    assert.equal(stepRetraction(state, 'shotgun', 1, true, { seq: 4, weapon: 'shotgun' }), 0, 'fresh shot inside a long packet still draws its original muzzle');
    assert.ok(stepRetraction(state, 'shotgun', 1 / 60, true) > 0, 'the fresh publication starts one bounded pulse');
    assert.equal(stepRetraction(state, 'shotgun', .15, true), 0);
});

test('hidden, reduced-motion, dead, melee and mismatched weapon frames cannot retain a pulse for later', () => {
    for (const weapon of ['pistol', 'knife', 'club', 'claw'] as const) {
        const state = idleRetraction();
        stepRetraction(state, weapon, 0, true, { seq: 1, weapon });
        assert.equal(stepRetraction(state, weapon, 0, false, { seq: 1, weapon }), 0);
        assert.equal(stepRetraction(state, weapon, 0, true), 0);
    }
    const state = idleRetraction();
    stepRetraction(state, 'pistol', 0, true, { seq: 1, weapon: 'shotgun' });
    assert.equal(stepRetraction(state, 'pistol', 0, true), 0);
    stepRetraction(state, 'pistol', 0, true, { seq: 2, weapon: 'pistol' });
    assert.equal(stepRetraction(state, 'carbine', 0, true), 0, 'switching the gun discards the old pulse');
    assert.equal(stepRetraction(idleRetraction(), 'pistol', 0, true), 0, 'new actor/epoch/restore has no invented shot');
});

test('replaying a packet cannot restart an aged pulse; many same-packet shots retain one bounded latest pulse', () => {
    const state = idleRetraction();
    for (let seq = 1; seq <= 100; seq++) assert.equal(stepRetraction(state, 'rifle', .001, true, { seq, weapon: 'rifle' }), 0);
    assert.equal(stepRetraction(state, 'rifle', 0, true), RETRACTION.rifle.px);
    assert.equal(stepRetraction(state, 'rifle', RETRACTION.rifle.seconds, true), 0);
    assert.equal(stepRetraction(state, 'rifle', 0, true, { seq: 100, weapon: 'rifle' }), 0);
    assert.equal(stepRetraction(state, 'rifle', 0, true), 0);
    stepRetraction(state, 'rifle', 0, true, { seq: 101, weapon: 'rifle' });
    stepRetraction(state, 'rifle', 1, true, { seq: 101, weapon: 'rifle' });
    assert.equal(stepRetraction(state, 'rifle', .016, true), 0, 'a repeated old shot cannot keep an expired pulse alive');
    assert.equal(state.left, 0);
    assert.deepEqual(Object.keys(state).sort(), ['left', 'seq', 'weapon']);
});

test('real 10 Hz automatic packets keep the original shot pose, including long-frame multi-shot packets', () => {
    const b = arm(benchRaid(), 'mb4a1'), state = idleRetraction(); let shots = 0;
    for (let i = 0; i <= 10; i++) {
        const packet = b.runtime.advance(1000 + i * 100, { ...emptyIntent(), aim: 0, firePressed: i === 0, fireHeld: true, source: 'touch' });
        const fired = packet.events.filter(e => e.type === 'shot' && e.shooter === 'player');
        assert.ok(fired.length > 0); shots += fired.length;
        const latest = fired.at(-1); assert.ok(latest?.type === 'shot');
        assert.equal(stepRetraction(state, packet.frame.player.weapon, .1, true, latest), 0);
    }
    assert.equal(shots, 11);
    const long = b.runtime.advance(3000, { ...emptyIntent(), aim: 0, fireHeld: true, source: 'touch' });
    const fired = long.events.filter(e => e.type === 'shot' && e.shooter === 'player'); assert.equal(fired.length, 10);
    assert.equal(new Set(fired.map(e => e.stamp.simulationTime)).size, 1);
    const origins = structuredClone(fired);
    const latest = fired.at(-1); assert.ok(latest?.type === 'shot');
    assert.equal(stepRetraction(state, long.frame.player.weapon, 1, true, latest), 0);
    assert.equal(stepRetraction(state, long.frame.player.weapon, .1, true), 0, 'an expired pulse is not replayed after a slow burst');
    assert.equal(stepRetraction(state, long.frame.player.weapon, .1, true), 0);
    assert.deepEqual(fired, origins);
    b.runtime.finish('abandon'); b.runtime.dispose();
});

test('a real shotgun packet has six unchanged origins and only one delayed display pulse', () => {
    const b = arm(benchRaid(), 'shotgun'), state = idleRetraction();
    const packet = b.runtime.advance(1000, { ...emptyIntent(), aim: 0, firePressed: true });
    const shot = packet.events.find(e => e.type === 'shot' && e.shooter === 'player'); assert.ok(shot?.type === 'shot');
    assert.equal(shot.pellets.length, 6); const before = structuredClone(packet);
    assert.equal(stepRetraction(state, packet.frame.player.weapon, .016, true, shot), 0);
    assert.ok(stepRetraction(state, packet.frame.player.weapon, .016, true) > 0);
    assert.deepEqual(packet, before, 'the display helper cannot change origins, angles, bullets, damage or RNG');
    b.runtime.finish('abandon'); b.runtime.dispose();
});
