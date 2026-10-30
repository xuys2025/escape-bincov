/**
 * #28 M4-05: the four kinds of build PLAN section 11 names for every gun (轻快 quick, 安静 quiet, 稳定 steady, 大容量 big
 * magazine), found by a search over the legal builds of the catalog, compared on the workbench's seven scores and in
 * engagements fired by the game's own shooting rules; then what scripts/build-search.ts finds wrong: a kind another
 * kind beats at its own aim or matches in every number, a build or a part that costs nothing against the factory gun,
 * and a part another part for the same position matches in everything (tests/gunsmith-balance.test.ts holds all of
 * these at none).
 *
 *   node --import tsx scripts/build-compare.ts [--guns=mb4a1,akb74] [--trials=300] [--out=report.json]
 *
 * The engagements are a model, not play: the shooter starts from the hip, raises the aim when the build is aimed,
 * fires at the gun's rate with the cone and drift the Runtime uses (coneOf, driftOf, recoil; no RPG body or perk),
 * never corrects the drift but waits for it when it alone would miss (paced fire), and reloads when the magazine runs
 * dry. The target has the Runtime's 14 px hit radius:
 *   - 打倒: seconds to put down 100 hp standing at 120, 280 or 480 px (at 120 the faster of hip and aimed);
 *   - 持续: the share of one magazine (30 rounds at most) that hits at 480 px, aimed and standing;
 *   - 走射: the share of the first 8 shots that hit at 120 px from the hip while walking.
 * Nothing here changes the game.
 */
import { writeFileSync } from 'node:fs';
import * as D from '../src/domain';
import { ATTACHMENTS, GUNS, partTier, type GunId } from '../src/gunsmith/catalog';
import type { Build } from '../src/gunsmith/compat';
import { benchStats } from '../src/gunsmith/bench';
import { effectiveStats, type GunStats } from '../src/gunsmith/stats';
import { advanceAim, coneOf, driftOf, recoil, SWAY, unsteadyAim } from '../src/shooting';
import { dominatedPairs, findings as faults, KINDS, kindsOf, measured, type Kind } from './build-search';

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const GUN_IDS = (arg('guns', '') ? arg('guns', '').split(',') : Object.keys(GUNS)) as GunId[];
const TRIALS = Number(arg('trials', '300')), OUT = arg('out', '');

// ---------- engagements ----------

/** Seconds to put a 100 hp target down at `distance` px from the hip, aimed or from the hip; Infinity past 10 s. */
function engage(s: GunStats, distance: number, aimed: boolean, random: () => number): number {
    const w = s.weapon, h = s.handling, aim = { ...unsteadyAim(), sway: 0, bloom: 0 };
    const motion = { pace: 0, sprint: false, precise: aimed };
    let t = 0, hp = 100, mag = w.magazine;
    if (aimed) { advanceAim(aim, h, SWAY, h.raise, motion); t += h.raise; }
    while (t < 10) {
        if (mag === 0) { if (!w.magazine) return Infinity; advanceAim(aim, h, SWAY, w.reload, motion); t += w.reload; mag = w.magazine; }
        // Paced fire: while the drift alone would carry the shot off the target, the shooter waits for it to recover.
        while (Math.abs(Math.sin(driftOf(aim, h))) * distance >= 14 && t < 10) { advanceAim(aim, h, SWAY, .05, motion); t += .05; }
        const cone = coneOf(aim, w, h), centre = driftOf(aim, h);
        for (let i = 0; i < w.pellets; i++) {
            const angle = centre + (random() - .5) * cone;
            if (distance <= w.range && Math.abs(Math.sin(angle)) * distance < 14) hp -= w.damage;
        }
        mag--;
        if (hp <= 0) return t;
        recoil(aim, h);
        advanceAim(aim, h, SWAY, w.cooldown, motion); t += w.cooldown;
    }
    return Infinity;
}
/** The share of `shots` that hit at `distance`: aimed and standing, or from the hip while walking. */
function hits(s: GunStats, distance: number, shots: number, aimed: boolean, random: () => number): number {
    const w = s.weapon, h = s.handling, aim = { ...unsteadyAim(), sway: aimed ? 0 : SWAY.walk, bloom: 0 };
    const motion = { pace: aimed ? 0 : 1, sprint: false, precise: aimed };
    if (aimed) advanceAim(aim, h, SWAY, h.raise, motion);
    let hit = 0;
    for (let n = 0; n < shots; n++) {
        const cone = coneOf(aim, w, h), centre = driftOf(aim, h);
        for (let i = 0; i < w.pellets; i++) if (distance <= w.range && Math.abs(Math.sin(centre + (random() - .5) * cone)) * distance < 14) hit++;
        recoil(aim, h); advanceAim(aim, h, SWAY, w.cooldown, motion);
    }
    return hit / (shots * w.pellets);
}
const DISTANCES = [120, 280, 480] as const;
const median = (xs: number[]) => xs.sort((a, z) => a - z)[xs.length >> 1];
const mean = (xs: number[]) => xs.reduce((a, z) => a + z, 0) / xs.length;
/** The engagements: seconds to put the target down at each distance, then the sustained and the walking hit shares. */
function engagements(b: Build, seed: number) {
    const s = effectiveStats(b), random = D.seededRandom(seed), trials = (f: () => number) => Array.from({ length: TRIALS }, f);
    const down = DISTANCES.map((d, i) => median(trials(() => Math.min(engage(s, d, true, random), i === 0 ? engage(s, d, false, random) : Infinity))));
    const mag = Math.min(30, s.weapon.magazine);
    return { down, sustained: mag ? mean(trials(() => hits(s, 480, mag, true, random))) : 0, walking: mean(trials(() => hits(s, 120, 8, false, random))) };
}

// ---------- run ----------

const ROWS = ['fire', 'acc', 'ctl', 'hdl', 'feed', 'kg', 'noise'] as const;
const report: Record<string, unknown> = { trials: TRIALS, distances: DISTANCES, kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.name])), guns: {} };
const findings: string[] = [];
for (const gun of GUN_IDS) {
    const kinds = kindsOf(gun), builds: Record<string, Build> = { factory: { gun, parts: [] }, ...kinds };
    const rows = Object.fromEntries(Object.entries(builds).map(([k, b], i) => {
        const s = benchStats(b);
        return [k, { parts: b.parts.map(p => p.id), scores: s.scores, numbers: measured(b), ...engagements(b, 0x4d340005 + i), price: b.parts.reduce((n, p) => n + D.ITEMS[p.id].buy, 0) }];
    }));
    (report.guns as Record<string, unknown>)[gun] = rows;
    console.log(`\n${gun} ${D.ITEMS[gun].name}`);
    console.log('build     火力 精度 控制 操控 供弹  重量 声音 弹量 | 打倒秒 120/280/480 | 持续 走射 |  价  | parts');
    for (const [k, r] of Object.entries(rows)) {
        const s = r.scores, name = k === 'factory' ? '原厂' : KINDS[k as Kind].name;
        console.log(`${name.padEnd(5, '　')} ${ROWS.map(x => String(s[x]).padStart(4)).join(' ')} ${String(r.numbers.magazine).padStart(4)} | ${r.down.map(x => x === Infinity ? '  -  ' : x.toFixed(2).padStart(5)).join(' ')} | ${(r.sustained * 100).toFixed(0).padStart(3)}% ${(r.walking * 100).toFixed(0).padStart(3)}% | ${String(r.price).padStart(5)} | ${r.parts.join(' ')}`.trimEnd());
    }
    findings.push(...faults(gun, kinds));
}
const pairs = dominatedPairs();
console.log(`\n${pairs.length} part pairs where one is no worse anywhere and better somewhere:`);
for (const p of pairs) console.log(`  ${p.better} (${D.ITEMS[p.better].name} ${partTier(ATTACHMENTS[p.better])} ¥${ATTACHMENTS[p.better].buy}) over ${p.worse} (${D.ITEMS[p.worse].name} ${partTier(ATTACHMENTS[p.worse])} ¥${ATTACHMENTS[p.worse].buy}) on ${p.mount}; guns ${p.guns.length > 6 ? p.guns.length : p.guns.join(' ')}`);
console.log(`\n${findings.length} build findings:`); for (const f of findings) console.log('  ' + f);
report.pairs = pairs; report.findings = findings;
if (OUT) writeFileSync(OUT, JSON.stringify(report, (k, v) => v === Infinity ? null : v, 1) + '\n');
