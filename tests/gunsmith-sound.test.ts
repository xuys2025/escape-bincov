import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SURVIVAL } from '../src/balance';
import { SUPPRESSED, SynthAudio } from '../src/audio';
import { GUN_TIMBRES } from '../src/gun-timbre';
import { SampleSound, type HitCueOut, type SoundOut } from '../src/coast-view/sound';
import { emptyIntent, type CoastRaidRuntime } from '../src/raid-runtime/runtime';
import type { LegacyEnemyEffects } from '../src/raid-runtime/enemy-ai';
import type { PartNode } from '../src/gunsmith/instance';
import type { PublishedView, RaidIntent, StampedEvent } from '../src/raid-runtime/contract';
import { arm, benchRaid, LANE } from './fixtures/shooting-bench';

// #28 M2-11: enemies hear a shot within the gun's own radius (the effective noise factor on SURVIVAL.gunNoiseRange),
// the shot event names the gun and whether it is suppressed, and audio.ts picks the sound in one place. Factory guns
// sound and behave as before. docs/gunsmith/CONTRACTS.md 「激光、灯光与枪声（M2-03、M2-11）」.

const node = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid, id, slot, relief: false, children });
const SUPPRESSOR = [node('fit-m07', 'M07', 'muzzle')], BRAKE = [node('fit-m06', 'M06', 'muzzle')];
const calm = () => ({ raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 });
type Gun = 'pistol' | 'carbine' | 'shotgun' | 'mb4a1' | 'gb17';

/** The bench lane with `gun` (fitted with `parts`), AI frozen and the aim settled, with a frame clock of its own. */
function rig(gun: Gun = 'mb4a1', parts: PartNode[] = []) {
    const b = arm(benchRaid(), gun === 'gb17' ? 'pistol' : gun);
    if (gun === 'gb17') b.driver.weapon('gb17');
    if (parts.length) b.driver.fit(parts);
    b.runtime.handling = calm();
    let ms = 1000;
    const frame = (intent: Partial<RaidIntent> = {}) => b.runtime.advance(ms += 20, { ...emptyIntent(), aim: b.runtime.player.rotation, ...intent });
    const shot = (aim: number = LANE.aim) => {
        b.runtime.handling = calm();
        const batch = frame({ firePressed: true, aim });
        const e = batch.events.find(x => x.type === 'shot' && x.shooter === 'player');
        assert.ok(e?.type === 'shot', 'the gun fired');
        return { event: e, batch };
    };
    return { ...b, frame, shot };
}
const shots = (b: PublishedView) => b.events.filter(e => e.type === 'shot');

test('enemies hear a shot within the gun\'s own radius: the noise factor on the one SURVIVAL range, saved where noise is', () => {
    const radius = (gun: Gun, parts: PartNode[] = []) => {
        const r = rig(gun, parts);
        r.shot();
        const layer = r.runtime.snapshotExpansion().raid!.maps.coast.noise;
        assert.ok(r.runtime.checkpoint());
        const saved = r.saves.currentRecord()!.expansion!.raid!.maps.coast.noise;
        assert.deepEqual([layer?.radius, saved?.radius], [r.runtime.noiseRadius, r.runtime.noiseRadius], gun);
        return r.runtime.noiseRadius;
    };
    // Factory guns: the old 510, to the bit.
    for (const gun of ['pistol', 'carbine', 'shotgun', 'mb4a1', 'gb17'] as const) assert.equal(radius(gun), SURVIVAL.gunNoiseRange, gun);
    assert.equal(SURVIVAL.gunNoiseRange, 510);
    // The rifle suppressor cuts it to .55, the brake raises it to 1.2, the G17's short suppressor (on its barrel) to .5.
    assert.equal(radius('mb4a1', SUPPRESSOR), 510 * .55);
    assert.equal(radius('mb4a1', BRAKE), 510 * 1.2);
    assert.equal(radius('gb17', [node('fit-b01', 'B01', 'barrel'), node('fit-m03', 'M03', 'muzzle')]), 510 * .5);
});

test('the old enemies hear a factory shot 400 px away and not a suppressed one; the new ones within 300 and the radius', () => {
    const heard = (parts: PartNode[], id: string, distance: number) => {
        const r = rig('mb4a1', parts), e = r.runtime.enemies.find(a => a.id === id && a.hp > 0)!;
        r.driver.placeEnemy(e.uid, { x: LANE.at.x + distance, y: LANE.at.y });
        r.shot(Math.PI / 2); // fired away from it: it can only hear
        const live = r.runtime.enemies.find(a => a.uid === e.uid)!;
        r.runtime.updateEnemy(live, .05);
        return live.tactics ? live.tactics.memory?.source ?? null : live.state;
    };
    // A scav sees 220 px; at 400 px only the shot's sound reaches it: 510 px factory, 280.5 suppressed.
    assert.deepEqual([heard([], 'scav', 400), heard(SUPPRESSOR, 'scav', 400)], ['investigate', 'patrol']);
    // A raider hears at most 300 px: 290 px is inside that and the factory 510, outside the suppressed 280.5.
    assert.deepEqual([heard([], 'raider-melee', 290), heard(SUPPRESSOR, 'raider-melee', 290)], ['sound', null]);
});

test('the shot event names the player\'s gun, its class and whether a suppressor muffles it; enemy shots name none', () => {
    const fired = (gun: Gun, parts: PartNode[] = []) => { const { event } = rig(gun, parts).shot(); return [event.weapon, event.gun, event.suppressed]; };
    assert.deepEqual(fired('pistol'), ['pistol', { id: 'pistol', cls: 'pistol' }, false]);
    assert.deepEqual(fired('carbine'), ['carbine', { id: 'carbine', cls: 'rifle' }, false]);
    assert.deepEqual(fired('shotgun'), ['shotgun', { id: 'shotgun', cls: 'shotgun' }, false]);
    assert.deepEqual(fired('gb17'), ['pistol', { id: 'gb17', cls: 'pistol' }, false]);
    assert.deepEqual(fired('mb4a1'), ['rifle', { id: 'mb4a1', cls: 'rifle' }, false]);
    assert.deepEqual(fired('mb4a1', SUPPRESSOR), ['rifle', { id: 'mb4a1', cls: 'rifle' }, true]);
    assert.deepEqual(fired('mb4a1', BRAKE), ['rifle', { id: 'mb4a1', cls: 'rifle' }, false]);
    // Each event is published once: the batch after it carries no shot (the view's seq/epoch rules are unchanged).
    const r = rig(), { batch } = r.shot();
    assert.equal(shots(batch).length, 1);
    assert.equal(shots(r.frame()).length, 0); assert.equal(shots(r.runtime.current()).length, 0);
    assert.ok(r.frame().events.every(e => e.seq > batch.events.at(-1)!.seq));
    // An enemy's shot keeps its old shape.
    const salt = r.runtime.enemies.find(e => e.id === 'salt' && e.hp > 0)!;
    (r.runtime as unknown as { enemyEffects: LegacyEnemyEffects }).enemyEffects.fire(salt, 0);
    const enemy = r.runtime.current().events.find(e => e.type === 'shot' && e.shooter === salt.uid);
    assert.ok(enemy?.type === 'shot');
    assert.deepEqual(['gun' in enemy, 'suppressed' in enemy], [false, false]);
});

test('factory guns behave as before: no devices, no exposure, the grip\'s cone, the old noise', () => {
    for (const gun of ['pistol', 'carbine', 'shotgun', 'gb17', 'mb4a1'] as const) {
        const r = rig(gun), runtime: CoastRaidRuntime = r.runtime;
        assert.equal(runtime.current().frame.hud.devices, null, gun);
        assert.equal(runtime.shotGrip, runtime.grip, gun);
        assert.equal(runtime.laserBeam(), null, gun);
        assert.equal(runtime.exposure({ x: LANE.at.x + 100, y: LANE.at.y }), 1, gun);
        assert.deepEqual(D.equippedGun(r.state.loadout!)!.devices, { laser: false, light: false }, gun);
        r.shot();
        assert.equal(runtime.noiseRadius, 510, gun);
    }
});

/** SynthAudio with its two voices recorded instead of played. */
function recordAudio() {
    const audio = new SynthAudio(), calls: unknown[][] = [];
    Object.assign(audio, { tone: (...a: unknown[]) => calls.push(['tone', ...a]), hiss: (...a: unknown[]) => calls.push(['hiss', ...a]) });
    return { audio, calls };
}

test('gunshot sound: the classic report keeps its old voices; a suppressor muffles every family but keeps it audible', () => {
    // The single report every gun shared before #75 H-02 (the classic A/B setting), voice by voice, unchanged by M2-11.
    const { audio, calls } = recordAudio(), spot = { pan: .5, gain: .5 };
    audio.shot('pistol'); audio.shot('shotgun'); audio.shot('enemy', spot);
    assert.deepEqual(calls, [
        ['hiss', .16, .72, 380, 0, undefined], ['tone', 210, .12, .3, 'triangle', 36, 0, undefined], ['tone', 72, .13, .18, 'sine', 32, .025, undefined], ['hiss', .06, .09, 1500, .11, undefined],
        ['hiss', .3, 1.05, 380, 0, undefined], ['tone', 140, .2, .3, 'triangle', 36, 0, undefined], ['tone', 72, .13, .18, 'sine', 32, .025, undefined], ['hiss', .06, .09, 1500, .11, undefined],
        ['hiss', .16, .72 * .55, 380, 0, spot], ['tone', 210, .12, .3 * .55, 'triangle', 36, 0, spot], ['tone', 72, .13, .18 * .55, 'sine', 32, .025, spot], ['hiss', .06, .09 * .55, 1500, .11, spot],
    ]);
    const hisses = (c: unknown[][]) => c.filter(x => x[0] === 'hiss'), tones = (c: unknown[][]) => c.filter(x => x[0] === 'tone');
    const near = (a: unknown, b: number) => Math.abs((a as number) - b) < 1e-12;
    for (const timbre of GUN_TIMBRES) {
        const loud = recordAudio(), quiet = recordAudio();
        loud.audio.shot(timbre); quiet.audio.shot(timbre, undefined, 1, true);
        // Loud: crack, body and the bright tail; suppressed: no tail, the crack and body cut and low-passed (duller).
        const [lc, lb, lt] = hisses(loud.calls), [qc, qb, ...rest] = hisses(quiet.calls);
        assert.ok(lt && !rest.length, `${timbre}: the tail goes`);
        assert.ok(near(qc[2], (lc[2] as number) * SUPPRESSED.crack) && qc[7] === SUPPRESSED.lowpass && lc[7] === undefined, `${timbre}: crack`);
        assert.ok(near(qb[2], (lb[2] as number) * SUPPRESSED.body) && qb[7] === SUPPRESSED.lowpass, `${timbre}: body`);
        // The body tone and the boom weaker; the action's clicks unchanged, so the shot is still heard.
        const [ltone, lboom, ...lclicks] = tones(loud.calls), [qtone, qboom, ...qclicks] = tones(quiet.calls);
        assert.ok(near(qtone[3], (ltone[3] as number) * SUPPRESSED.body) && near(qboom[3], (lboom[3] as number) * SUPPRESSED.boom), `${timbre}: tone and boom`);
        assert.deepEqual(qclicks, lclicks, `${timbre}: the action stays`);
        // Still audible: every voice that sounds is above a whisper.
        assert.ok([qc[2], qb[2], qtone[3], qboom[3]].every(g => (g as number) > .02), `${timbre}: audible`);
    }
    // The classic report muffles too (the range's A/B setting with a suppressor): low-passed, no tail, a click.
    const classic = recordAudio();
    classic.audio.shot('pistol', undefined, 1, true);
    assert.deepEqual(classic.calls.map(c => c[0]), ['hiss', 'tone', 'tone', 'tone']);
    assert.equal(classic.calls[0][7], SUPPRESSED.lowpass, 'the blast goes through the low-pass');
});

const recorder = () => {
    const calls: string[] = [];
    const out = new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => {
        calls.push(a.length ? `${name}:${a.map(x => typeof x === 'object' && x ? 'spot' : x).join(',')}` : name);
    } }) as SoundOut & HitCueOut;
    return { calls, out };
};
const ev = (body: Record<string, unknown>) => ({ ...body, stamp: { world: { mapId: 'coast' }, revision: 1 }, seq: 1 }) as unknown as StampedEvent;
const frameWith = (devices: unknown) => ({ stamp: { world: { mapId: 'coast' } },
    frame: { phase: 'running', player: { x: 0, y: 0, alive: true, regionId: null, state: { moving: false } }, actors: [], bullets: [],
        hud: { hp: 100, maxHp: 100, heals: 0, weapon: { id: 'mb4a1', reloading: false }, devices } } }) as unknown as PublishedView;

test('the view plays each player shot by its gun\'s class, muffled when suppressed; older events by look; switches click', () => {
    const { calls, out } = recorder(), s = new SampleSound(out);
    s.event(ev({ type: 'shot', shooter: 'player', weapon: 'rifle', gun: { id: 'mb4a1', cls: 'rifle' }, suppressed: false }), 'coast');
    s.event(ev({ type: 'shot', shooter: 'player', weapon: 'rifle', gun: { id: 'mb4a1', cls: 'rifle' }, suppressed: true }), 'coast');
    s.event(ev({ type: 'shot', shooter: 'player', weapon: 'pistol', gun: { id: 'gb17', cls: 'pistol' }, suppressed: true }), 'coast');
    s.event(ev({ type: 'shot', shooter: 'player', weapon: 'shotgun' }), 'coast');
    s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'rifle', pellets: [] }), 'coast');
    // (The recorder joins the arguments: the empty one is the spot a player's own shot leaves out.)
    // The gun's family by id (mb4a1 rifle, gb17 9 mm pistol), muffled with level 1 when suppressed; an older event by
    // look (the double-barrel); an enemy's shot by look at the enemy level (#75 H-02).
    assert.deepEqual(calls, ['shot:rifle', 'shot:rifle,,1,true', 'shot:pistol9,,1,true', 'shot:shotgun-double', 'shot:rifle,,0.55']);
    // A device switched on the gun in hand clicks once; the same switches again, or another gun's parts, do not.
    const parts = (on: boolean, uid = 'fit-t01') => ({ parts: [{ uid, name: '近距激光器', laser: true, light: false, on }], laser: null, light: null, spot: 1 });
    calls.length = 0;
    for (const d of [null, parts(false), parts(false), parts(true), parts(true), parts(false), parts(true, 'other')]) s.frame(frameWith(d), 1 / 60);
    assert.deepEqual(calls.filter(c => c === 'click'), ['click', 'click']);
});
