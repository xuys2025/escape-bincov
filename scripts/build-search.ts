/**
 * #28 M4-05: the searches and comparisons behind scripts/build-compare.ts, shared with tests/gunsmith-balance.test.ts.
 * Pure: they read the catalog, the compatibility rules and the workbench's numbers, and change nothing.
 *
 * "Dominates" is read on the numbers behind the workbench's seven rows (NUMBERS), not on the rows themselves: those
 * round, and feed folds capacity and reload into one, so a cost can hide in them (a short barrel's wider pellets, a
 * quick magazine's fewer rounds).
 */
import { ATTACHMENTS, GUNS, type AttachmentDef, type GunId, type Slot } from '../src/gunsmith/catalog';
import { checkInstall, MAX_PARTS, type Build } from '../src/gunsmith/compat';
import { benchStats, type BenchNumbers, type BenchScores } from '../src/gunsmith/bench';

/** What each kind of build PLAN section 11 names reaches for: the workbench's scores (higher better but kg and noise), and the capacity. */
export const KINDS = {
    quick: { name: '轻快', aim: (s: BenchScores) => s.hdl - 4 * s.kg },
    quiet: { name: '安静', aim: (s: BenchScores) => -2 * s.noise + .2 * (s.hdl + s.acc + s.ctl) },
    steady: { name: '稳定', aim: (s: BenchScores) => s.ctl + s.acc },
    big: { name: '大容量', aim: (s: BenchScores, rounds: number) => 10 * rounds + .1 * (s.ctl + s.acc) },
} as const;
export type Kind = keyof typeof KINDS;
type Aim = (s: BenchScores, rounds: number) => number;

/** The numbers behind the seven rows, each with the way that is better (1 more, -1 less). */
export const NUMBERS: readonly [keyof Measured, 1 | -1][] = [['aimed', -1], ['hip', -1], ['range', 1], ['kick', -1], ['bloom', -1], ['recover', 1],
    ['raise', -1], ['sway', -1], ['magazine', 1], ['reload', -1], ['noise', -1], ['kg', -1]];
export type Measured = BenchNumbers & { kg: number };
export const measured = (b: Build): Measured => { const s = benchStats(b); return { ...s.numbers, kg: s.scores.kg }; };
const way = (a: Measured, b: Measured, k: keyof Measured, up: number) => {
    const d = (a[k] as number) - (b[k] as number);
    return Math.abs(d) > 1e-9 ? Math.sign(up * d) : 0;
};
/** `a` is no worse than `b` in any of the numbers and better in one. */
export const dominates = (a: Measured, b: Measured) => NUMBERS.every(([k, up]) => way(a, b, k, up) >= 0) && NUMBERS.some(([k, up]) => way(a, b, k, up) > 0);

/** The parts that can go on `gun` in some build: its own, and the rail parts. */
export const partsFor = (gun: GunId) => Object.values(ATTACHMENTS).filter(a => !a.guns || a.guns.includes(gun)).map(a => a.id);
const value = (aim: Aim, b: Build) => { const s = benchStats(b); return aim(s.scores, s.stats.weapon.magazine); };
/** Beam search from the bare gun: each step adds one part wherever it fits; the best build by `aim` seen anywhere wins. */
export function search(gun: GunId, aim: Aim, width = 24): Build {
    const ids = partsFor(gun), key = (b: Build) => b.parts.map(p => `${p.id}@${p.parent ?? ''}/${p.slot}`).sort().join();
    let beam: Build[] = [{ gun, parts: [] }], best = beam[0], bestValue = value(aim, best);
    const seen = new Set<string>([key(best)]);
    for (let depth = 0; depth < MAX_PARTS && beam.length; depth++) {
        const next: { b: Build; v: number }[] = [];
        for (const b of beam) for (const id of ids) {
            const at = checkInstall(b, id);
            if (!at.ok) continue;
            const nb: Build = { gun, parts: [...b.parts, { uid: `p${b.parts.length}`, id, parent: at.at.parent, slot: at.at.slot }] };
            const k = key(nb);
            if (seen.has(k)) continue;
            seen.add(k);
            const v = value(aim, nb);
            next.push({ b: nb, v });
            if (v > bestValue + 1e-9) { best = nb; bestValue = v; }
        }
        beam = next.sort((x, y) => y.v - x.v).slice(0, width).map(x => x.b);
    }
    return best;
}
/** The four kinds of build for `gun`; 大容量 only where some magazine holds more than the factory one. */
export function kindsOf(gun: GunId): Partial<Record<Kind, Build>> {
    const out: Partial<Record<Kind, Build>> = {};
    for (const kind of Object.keys(KINDS) as Kind[]) out[kind] = search(gun, KINDS[kind].aim);
    if (measured(out.big!).magazine <= GUNS[gun].stats.magazine) delete out.big;
    return out;
}
/** What each kind is for: the number it must lead on (higher better). */
export const OWN: Readonly<Record<Kind, (m: Measured) => number>> = {
    quick: m => -m.raise, quiet: m => -m.noise, steady: m => -(m.kick + m.bloom) / 2, big: m => m.magazine,
};

/**
 * What is wrong with the builds of `gun`: a kind that another kind beats at its own aim or that another kind is no
 * worse than in any number; a kind no worse than the factory gun in any number; a part that costs nothing, alone on
 * the gun or added to the part that opens its slot.
 */
export function findings(gun: GunId, kinds = kindsOf(gun)): string[] {
    const out: string[] = [], factory: Build = { gun, parts: [] }, bare = measured(factory);
    const rows = Object.entries(kinds) as [Kind, Build][];
    for (const [kind, b] of rows) for (const [other, o] of rows) {
        if (kind === other) continue;
        if (OWN[kind](measured(o)) > OWN[kind](measured(b)) + 1e-9) out.push(`${gun}: ${KINDS[other].name} beats ${KINDS[kind].name} at its own aim`);
        if (dominates(measured(o), measured(b))) out.push(`${gun}: ${KINDS[other].name} is no worse than ${KINDS[kind].name} in any number`);
    }
    for (const [kind, b] of rows) if (dominates(measured(b), bare)) out.push(`${gun}: ${KINDS[kind].name} is no worse than the factory gun in any number (${b.parts.map(p => p.id).join(' ')})`);
    const with1 = (base: Build, id: string): Build | null => {
        const at = checkInstall(base, id);
        return at.ok ? { gun, parts: [...base.parts, { uid: `p${base.parts.length}`, id, parent: at.at.parent, slot: at.at.slot }] } : null;
    };
    for (const id of partsFor(gun)) {
        const one = with1(factory, id);
        if (!one) continue;
        if (dominates(measured(one), bare)) out.push(`${gun}: ${id} costs nothing`);
        // The parts it opens a place for, against it alone.
        if (!Object.keys(ATTACHMENTS[id].provides).length) continue;
        const alone = measured(one);
        for (const child of partsFor(gun)) {
            if (with1(factory, child)) continue;
            const two = with1(one, child);
            if (two && dominates(measured(two), alone)) out.push(`${gun}: ${child} costs nothing on ${id}`);
        }
    }
    return out;
}

// ---------- part pairs ----------

/** Lower is better on these factors, higher on recover and range; absent means 1. */
const FACTORS = ['hip', 'precise', 'raise', 'sway', 'bloom', 'kick', 'settle', 'recover', 'spread', 'range', 'reload', 'noise'] as const;
const HIGHER = new Set(['recover', 'range']);
/** -1, 0 or 1 per count: `a` worse than, the same as or better than `b`. */
function compare(a: AttachmentDef, b: AttachmentDef): number[] {
    const out: number[] = [], cmp = (x: number, y: number, up: boolean) => out.push(Math.sign(up ? x - y : y - x));
    for (const f of FACTORS) cmp(a.mods[f] ?? 1, b.mods[f] ?? 1, HIGHER.has(f));
    cmp(a.mods.magazine ?? 0, b.mods.magazine ?? 0, true);
    cmp(a.mods.weight, b.mods.weight, false);
    cmp(a.mods.grow ? a.mods.grow.w + a.mods.grow.h : 0, b.mods.grow ? b.mods.grow.w + b.mods.grow.h : 0, false);
    cmp(Math.max(...a.mods.view ?? [1]), Math.max(...b.mods.view ?? [1]), true);
    cmp((a.mods.view ?? []).length, (b.mods.view ?? []).length, true);
    cmp(a.mods.suppressor ? 1 : 0, b.mods.suppressor ? 1 : 0, true);
    cmp(Object.values(a.provides).reduce((n, x) => n + x, 0), Object.values(b.provides).reduce((n, x) => n + x, 0), true);
    cmp(a.grants.length, b.grants.length, true);
    cmp(b.requires.length + b.needs.length, a.requires.length + a.needs.length, false);
    const braced = (m: AttachmentDef['mods'], f: string) => (m.braced as Record<string, number> | undefined)?.[f] ?? 1;
    for (const f of FACTORS) cmp(braced(a.mods, f), braced(b.mods, f), HIGHER.has(f));
    cmp(a.mods.laser ? 1 / a.mods.laser.hip : 0, b.mods.laser ? 1 / b.mods.laser.hip : 0, true);
    cmp(a.mods.laser?.range ?? 0, b.mods.laser?.range ?? 0, true);
    cmp(a.mods.light ? a.mods.light.radius : 0, b.mods.light ? b.mods.light.radius : 0, true);
    cmp(b.mods.spot ?? 1, a.mods.spot ?? 1, true);
    return out;
}
/** Pairs on one mount that share a gun, where the first is no worse in anything and better in something. */
export function dominatedPairs() {
    const all = Object.values(ATTACHMENTS), out: { better: string; worse: string; mount: Slot; guns: GunId[] }[] = [];
    for (const a of all) for (const b of all) {
        if (a === b || a.mount !== b.mount) continue;
        const guns = (Object.keys(GUNS) as GunId[]).filter(g => (!a.guns || a.guns.includes(g)) && (!b.guns || b.guns.includes(g)));
        const c = compare(a, b);
        if (guns.length && c.every(x => x >= 0) && c.some(x => x > 0)) out.push({ better: a.id, worse: b.id, mount: a.mount, guns });
    }
    return out;
}
