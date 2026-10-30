/**
 * What each armed enemy holds (#28 M4-02, #140, maintainer 2026-10-29): a catalog gun by faction and rank, and for the
 * three leaders a gun with one to three parts. It is drawn once, when an encounter is installed, from the raid's seed and
 * the enemy's uid alone, so no other random draw of the raid changes. The enemy's own numbers stay its archetype's
 * (damage, range, fire rate, magazine); the gun decides what it holds, what it sounds like and what its body yields
 * (layer-transition.ts, with gunsmith/presets.ts presetState). Using the gun's numbers is #152. Pure rules over the catalog.
 */
import * as D from './domain';
import { ATTACHMENTS, GUNS, partTier, type GunId } from './gunsmith/catalog';
import { checkInstall, type Part } from './gunsmith/compat';
import { presetOf, type PresetNode } from './gunsmith/presets';
import type { PartNode } from './gunsmith/instance';
import type { LayeredRaid } from './expansion-state';
import { PREMIUM_BLANKS } from './gunsmith/premium';

/** Each armed archetype's guns with their weights (maintainer's table, #140); a weight of 1 against 3 or 4 is 「少数」. */
export const ARMORY: Readonly<Record<string, readonly (readonly [GunId, number])[]>> = (() => {
    const raider = [['pistol', 3], ['gb17', 3], ['pb226', 2], ['mb1911', 2]] as const;
    const blockade = [['carbine', 1], ['akb74', 1], ['mpb5', 1], ['umpb45', 1]] as const;
    return {
        'raider-gunner': raider, 'raider-lookout': raider,
        'raider-boss': [['shotgun', 4], ['mb870', 4], ['mb1014', 1]],
        'tide-ritualist': [['carbine', 1]],
        'mercenary-scout': [['carbine', 3], ['akb74', 3], ['mb4a1', 3], ['mb14', 1]],
        'mercenary-assault': [['akb74', 1], ['akb103', 1], ['mb4a1', 1], ['augb', 1]],
        'mercenary-support': [['rpkb', 1]],
        'recovery-leader': [['akb103', 4], ['mb4a1', 4], ['svdb', 1]],
        'blockade-sentry': blockade, 'blockade-patrol': blockade,
        'blockade-sergeant': [['mb4a1', 4], ['augb', 4], ['vb9', 1], ['pb90', 1]],
    };
})();
/** The leaders (盐枭头目, 回收队长, 检查站班长): their guns carry one to three parts. */
export const ARMED_LEADERS: ReadonlySet<string> = new Set(['raider-boss', 'recovery-leader', 'blockade-sergeant']);
/** The guns an archetype may hold: its ARMORY row; none for an archetype that holds no catalog gun. */
export const armoryGuns = (id: string): GunId[] => (ARMORY[id] ?? []).map(([gun]) => gun);
/**
 * The parts a leader's gun may carry: the basic and common catalog parts (rare ones stay finds at high-risk spots), each
 * placed where compat puts it first.
 */
const FIT_PARTS = Object.keys(ATTACHMENTS).filter(id => ['basic', 'common'].includes(partTier(ATTACHMENTS[id])));

/** A stream for one enemy of one raid: FNV-1a of the seed and the uid, so it depends on nothing else. */
function streamOf(seed: number, uid: string) {
    let h = 0x811c9dc5;
    for (const c of `${seed}:${uid}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return D.seededRandom(h);
}
/**
 * Whether the body of `enemyId` (uid `uid`) in the raid of `seed` holds a 精工件坯 (#28 M4-09): only a leader's, by a
 * stream of the seed and the uid alone, so a body yields the same however and whenever it falls.
 */
export const leaderBlank = (seed: number, enemyId: string, uid: string) => ARMED_LEADERS.has(enemyId) && streamOf(seed, `${uid}:blank`)() < PREMIUM_BLANKS.leader;
/** One to three parts that go on `gun` one after another, each where compat places it, as a preset tree. */
function fitFor(gun: GunId, random: () => number): PresetNode[] {
    const parts: Part[] = [];
    for (let want = 1 + Math.floor(random() * 3); want > 0; want--) {
        const build = { gun, parts }, fits = FIT_PARTS.filter(id => checkInstall(build, id).ok);
        if (!fits.length) break;
        const id = fits[Math.floor(random() * fits.length)], at = checkInstall(build, id);
        if (!at.ok) break;
        parts.push({ uid: `fit-${parts.length}`, id, parent: at.at.parent, slot: at.at.slot });
    }
    const tree = (parent: string | null): PartNode[] => parts.filter(p => p.parent === parent)
        .map(p => ({ uid: p.uid, id: p.id, slot: p.slot, relief: false, children: tree(p.uid) }));
    return presetOf(tree(null));
}
/** What enemy `uid` of archetype `id` holds in the raid of `seed`: a gun and, for a leader, its parts; null when unarmed. */
export function armamentOf(seed: number, id: string, uid: string): { gun: GunId; fit: PresetNode[] } | null {
    const row = ARMORY[id];
    if (!row) return null;
    const random = streamOf(seed, uid), total = row.reduce((n, [, w]) => n + w, 0);
    let pick = random() * total, gun = row[0][0];
    for (const [g, w] of row) { if (pick < w) { gun = g; break; } pick -= w; }
    return { gun, fit: ARMED_LEADERS.has(id) ? fitFor(gun, random) : [] };
}
/**
 * Arm every enemy of a raid being installed that holds a gun (tactics.equipment not null): its catalog gun, and for a
 * leader its parts in `fit`. Called once by each encounter installer, after the enemies are placed.
 */
export function armEncounter(raid: Pick<LayeredRaid, 'seed' | 'maps'>): void {
    for (const layer of Object.values(raid.maps)) for (const e of layer.enemies) {
        const t = e.tactics;
        if (!t || t.equipment === null) continue;
        const arms = armamentOf(raid.seed, e.id, e.uid);
        if (!arms || !GUNS[arms.gun]) continue;
        t.equipment = arms.gun;
        if (arms.fit.length) t.fit = arms.fit; else delete t.fit;
    }
}
