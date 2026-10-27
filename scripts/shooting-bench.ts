/**
 * Shooting bench report (PR #39): prints cadence by input and display rate, the cone by stance and motion, bloom and
 * drift over a held burst, and real hits on a dummy, all from the headless Runtime on the
 * deterministic lane of tests/fixtures/shooting-bench.ts. Measurement only; tests/shooting-bench.test.ts holds the
 * requirements.
 *
 *   node --import tsx scripts/shooting-bench.ts [--json path]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import * as D from '../src/domain';
import { benchRaid, arm, replay, mouse, mouseHold, touchHold, cadence, dummy, DUMMY_RADIUS, GUNS, type Gun, type Script } from '../tests/fixtures/shooting-bench';

const { values } = parseArgs({ options: { json: { type: 'string' } } });
const RATES = [20, 30, 60, 120, 144];
const deg = (r: number) => +(r * 180 / Math.PI).toFixed(3);
const report: Record<string, unknown> = {};
const weapon = (gun: Gun) => D.WEAPONS[gun];

// Held touch fire (semi-automatic) or held button (the automatic M4A1) for 6 s with reloads, and desktop clicks at 10 Hz for 3 s.
for (const gun of [...GUNS, 'mb4a1'] as const) {
    const hold = gun === 'mb4a1' ? mouseHold(0, 6) : touchHold(0, 6);
    report[`hold 6 s: ${gun}`] = Object.fromEntries(RATES.map(fps => {
        const log = replay(arm(benchRaid(), gun, { reserve: 120 }), hold, 6, fps);
        return [fps, { shots: log.shots.length, interval: +cadence(log).toFixed(4) }];
    }));
    const times = Array.from({ length: 30 }, (_, i) => i * .1);
    report[`clicks at 10 Hz for 3 s: ${gun}`] = Object.fromEntries(RATES.map(fps => [fps, replay(arm(benchRaid(), gun, { reserve: 120 }), mouse(times), 3, fps).shots.length]));
}
// The cone (full angle) a shot would meet, by stance and motion, and a pellet's chance to cross a 14 px dummy.
const stances: Record<string, [Script, number]> = {
    hip: [() => ({}), .05], precise: [() => ({ precise: true }), .5], 'precise .1 s': [() => ({ precise: true }), .1],
    walking: [() => ({ move: { x: 0, y: 1, sprint: false } }), .6], sprinting: [() => ({ move: { x: 0, y: 1, sprint: true } }), .6],
    'stopped .3 s after sprinting': [t => ({ move: { x: 0, y: t < .6 ? 1 : 0, sprint: t < .6 } }), .9],
};
for (const gun of [...GUNS, 'mb4a1'] as const) {
    const range = [160, 320, 480, 640].filter(d => d <= weapon(gun).range);
    report[`cone ${gun}`] = Object.fromEntries(Object.entries(stances).map(([name, [script, seconds]]) => {
        const cone = replay(arm(benchRaid(), gun), script, seconds, 60).aims.at(-1)!.cone;
        return [name, { deg: deg(cone), hit: Object.fromEntries(range.map(d => [d, +Math.min(1, 2 * Math.asin(DUMMY_RADIUS / d) / cone).toFixed(2)])) }];
    }));
}
// Bloom and drift over a 1 s burst of the M4A1, then recovery.
{
    const log = replay(arm(benchRaid(), 'mb4a1'), mouseHold(0, 1), 2, 60);
    report['mb4a1 burst: cone/drift deg at t'] = Object.fromEntries([0, .25, .5, .75, 1, 1.25, 1.5, 2].map(t => {
        const a = [...log.aims].reverse().find(x => x.t <= t + 1e-9)!;
        return [t, `${deg(a.cone)} / ${deg(a.drift)}`];
    }));
}
// Real flight and damage: one pistol click every .4 s at a dummy 320 px away, health kept up.
{
    const b = arm(benchRaid(), 'pistol', { reserve: 120 }), uid = dummy(b, 320);
    const log = replay(b, mouse(Array.from({ length: 20 }, (_, i) => i * .4)), 8.5, 60, uid);
    report['pistol at a dummy 320 px'] = { shots: log.shots.length, hits: log.hurt.filter(h => h.uid === uid).length,
        impacts: log.impacts.reduce((m, i) => (m[i.reason] = (m[i.reason] ?? 0) + 1, m), {} as Record<string, number>) };
}
console.log(JSON.stringify(report, null, 1));
if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 2) + '\n');
