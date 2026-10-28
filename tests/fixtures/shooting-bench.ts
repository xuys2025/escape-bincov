/**
 * Deterministic shooting bench (PR #39): one layered building raid with frozen AI, the player standing on a clear
 * outdoor lane, and scripted input replayed at chosen display frame rates. Input is a function of the frame's wall
 * time, so the same script means the same intent at 30, 60 or 120 Hz; only the frame sampling differs. The log keeps
 * what the Runtime published (shot pellets, impacts, hurt events, magazine, the aim view), never view state.
 */
import assert from 'node:assert/strict';
import * as D from '../../src/domain';
import { createSessionState, SaveSession } from '../../src/session';
import { CoastRaidRuntime, emptyIntent } from '../../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../../src/raid-runtime/test-support';
import type { AimView, RaidIntent } from '../../src/raid-runtime/contract';
import type { PerkId } from '../../src/perks';
import type { Point } from '../../src/world';

/** The old three and the real M4A1 (`mb4a1`, which took over the #39 sample rifle's handling in #28 M2-01). */
export type Gun = 'pistol' | 'carbine' | 'shotgun' | 'mb4a1';
export const GUNS: readonly Gun[] = ['pistol', 'carbine', 'shotgun'];
/**
 * Outdoor spot on the coast map of coast-buildings-v1 (seed 42): from here a bullet flies at least 700 px east without
 * a wall, every 16 px of the lane fits a body at either tide, and no enemy of that seed stands within 120 px of it.
 */
export const LANE = { at: { x: 208, y: 1104 }, aim: 0 } as const;
export const DUMMY_RADIUS = 14;

/** `storage` is the page's whole storage; `fail(true)` makes every later write throw, as a full quota would. */
export function benchRaid(seed = 42) {
    const state = createSessionState(), data = new Map<string, string>(), quota = { full: false };
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (quota.full) throw Error('test quota'); data.set(k, v); } };
    const saves = new SaveSession(state, () => storage); assert.equal(saves.initialize(), true);
    state.state = 'hideout'; assert.equal(saves.beginRun(seed, true), true); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(runtime, '?test=1');
    return { state, saves, runtime, driver, storage, data, fail(full: boolean) { quota.full = full; } };
}
/**
 * The same raid (a v3 building raid, seed 42) deployed from a v3 expansion holding `perks` at permanent technique
 * `technique`: the perks are chosen at the base before deploying, the only time the game allows it.
 */
export function perkBench(perks: PerkId[] = [], technique = 10): Bench {
    const state = createSessionState(), data = new Map<string, string>(), quota = { full: false };
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (quota.full) throw Error('test quota'); data.set(k, v); } };
    const saves = new SaveSession(state, () => storage); assert.equal(saves.initialize(), true); assert.equal(saves.enableRpg(), true);
    const ticket = saves.prepareExpansionMutation(d => { d.expansion.growth.permanent.technique = technique; d.expansion.growth.perks = [...perks]; });
    assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    state.state = 'hideout'; assert.equal(saves.beginRun(42, true, { legacyEnemies: true }), true); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(runtime, '?test=1');
    return { state, saves, runtime, driver, storage, data, fail(full: boolean) { quota.full = full; } };
}
/** A page reload: a new session over the same storage resumes the raid in a new Runtime (the old one is abandoned). */
export function reopen(b: Bench) {
    const state = createSessionState(), saves = new SaveSession(state, () => b.storage);
    assert.equal(saves.initialize(), true); assert.equal(saves.resumeRun(), true); state.state = 'run';
    return { state, saves, runtime: new CoastRaidRuntime(state, saves) };
}
export type Bench = ReturnType<typeof benchRaid>;

/**
 * Frozen AI, the player on the lane facing east with `gun` and a full magazine, `reserve` rounds in the bag, and the
 * aim settled (a new Runtime starts unsteady; the bench measures from a calm stance unless a test says otherwise).
 */
export function arm(b: Bench, gun: Gun, { reserve = 60 } = {}): Bench {
    b.driver.freezeAI(true);
    b.driver.placePlayer(LANE.at, LANE.aim);
    b.driver.weapon(gun);
    const c = b.runtime.snapshot(), ammo = D.WEAPONS[gun].ammo!;
    let left = reserve;
    while (left > 0) { const qty = Math.min(left, D.ITEMS[ammo].stack); assert.equal(D.addItem(c.loadout.bag, ammo, qty), 0); left -= qty; }
    b.runtime.restore(c);
    b.runtime.handling = { raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 };
    const lane = b.runtime.enemies.filter(e => e.hp > 0 && e.x > LANE.at.x - 40 && e.x < LANE.at.x + 740 && Math.abs(e.y - LANE.at.y) < 40);
    assert.deepEqual(lane.map(e => e.uid), [], 'an enemy stands on the bench lane');
    return b;
}

/** Stand an existing enemy on the lane `distance` px east of the player as a target; returns its UID. */
export function dummy(b: Bench, distance: number): string {
    const uid = b.runtime.enemies.find(e => e.hp > 0)!.uid;
    b.driver.placeEnemy(uid, { x: LANE.at.x + distance, y: LANE.at.y });
    return uid;
}

/** Input script: the intent for a display frame at wall time `t` (seconds), given the previous frame's time. */
export type Script = (t: number, previous: number | null) => Partial<RaidIntent>;
/** Clicks (press edges) at the given wall times; each reaches the first frame at or after its time. */
export const clicks = (times: readonly number[]) => (t: number, previous: number | null) =>
    times.some(at => at <= t + 1e-9 && (previous === null || at > previous + 1e-9));
/** A held control during [from, to). */
export const held = (from: number, to: number) => (t: number) => t >= from - 1e-9 && t < to - 1e-9;

export interface Shot { t: number; aim: number; angles: number[]; origins: Point[] }
export interface RunLog {
    shots: Shot[];
    impacts: { t: number; reason: string; target: string | null; contact: Point | null }[];
    hurt: { t: number; uid: string; damage: number }[];
    /** The published aim after every frame. */
    aims: (AimView & { t: number })[];
    frames: number; elapsed: number; mag: number;
}
/**
 * Replay `script` for `seconds` of wall time at `fps` (or a repeating list of frame intervals in ms). Frame k starts at
 * `startMs` (default 1000) plus its wall time; on a new Runtime the first frame only starts the clock, on a used one it
 * spans the gap since the last frame. `keep` restores a dummy's health after every frame so a long string stays on one
 * target. Shot times are the publishing frame's raid time.
 */
export function replay(b: Bench, script: Script, seconds: number, fps: number | readonly number[], keep?: string, startMs = 1000): RunLog {
    const log: RunLog = { shots: [], impacts: [], hurt: [], aims: [], frames: 0, elapsed: 0, mag: 0 };
    const intervals = typeof fps === 'number' ? null : fps;
    let previous: number | null = null, wall = 0;
    for (let k = 0; ; k++) {
        const t = intervals ? wall : k / (fps as number);
        if (intervals) wall += intervals[k % intervals.length] / 1000;
        if (t > seconds + 1e-9) break;
        const batch = b.runtime.advance(startMs + t * 1000, { ...emptyIntent(), aim: LANE.aim, ...script(t, previous) });
        log.frames++;
        for (const e of batch.events) {
            if (e.type === 'shot' && e.shooter === 'player') log.shots.push({ t: e.stamp.simulationTime, aim: b.runtime.player.rotation,
                angles: e.pellets.map(p => p.angle), origins: e.pellets.map(p => ({ ...p.origin })) });
            else if (e.type === 'impact' && e.owner === 'player') log.impacts.push({ t: e.stamp.simulationTime, reason: e.reason, target: e.target, contact: e.contact && { ...e.contact } });
            else if (e.type === 'hurt' && e.uid !== 'player') log.hurt.push({ t: e.stamp.simulationTime, uid: e.uid, damage: e.damage });
        }
        log.aims.push({ ...batch.frame.hud.aim, t: batch.stamp.simulationTime });
        if (keep) { const e = b.runtime.enemies.find(a => a.uid === keep)!; if (e.hp < D.ENEMIES[e.id].hp) b.driver.placeEnemy(keep, { x: e.x, y: e.y }, D.ENEMIES[e.id].hp); }
        previous = t;
    }
    log.elapsed = b.runtime.elapsed; log.mag = b.runtime.mag;
    return log;
}
/** Desktop clicks; `precise` holds the right button for the whole script. */
export const mouse = (times: readonly number[], precise = false): Script => {
    const press = clicks(times);
    return (t, previous) => ({ firePressed: press(t, previous), precise, source: 'mouse-keyboard' });
};
/** The left button held during [from, to): a click when it goes down, then held. */
export const mouseHold = (from: number, to: number, precise = false): Script => {
    const press = clicks([from]), on = held(from, to);
    return (t, previous) => ({ firePressed: press(t, previous), fireHeld: on(t), precise, source: 'mouse-keyboard' });
};
/** The touch aim stick pushed past the fire ring during [from, to). */
export const touchHold = (from: number, to: number): Script => { const on = held(from, to); return t => ({ fireHeld: on(t), source: 'touch' }); };

/** Pellet angles relative to the aim of each shot, flattened. */
export const deviations = (log: RunLog) => log.shots.flatMap(s => s.angles.map(a => Math.atan2(Math.sin(a - s.aim), Math.cos(a - s.aim))));
/** Mean interval between consecutive shots. */
export const cadence = (log: RunLog) => log.shots.length < 2 ? NaN : (log.shots.at(-1)!.t - log.shots[0].t) / (log.shots.length - 1);
/**
 * Share of rays from the lane origin at these angles that cross a still circle of `radius` at `distance` along the
 * aim (geometry only: no walls, travel time or damage).
 */
export function rayHits(angles: readonly number[], distance: number, radius = DUMMY_RADIUS): number {
    return angles.filter(a => Math.abs(Math.sin(a)) * distance <= radius && Math.cos(a) > 0).length / Math.max(1, angles.length);
}
