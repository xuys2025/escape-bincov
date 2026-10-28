/**
 * Gunsmith presets (#28 M2-07; PLAN section 11, M0 review decision 6, M2 decision 1): a saved build is the gun type and
 * its parts as a tree of catalog ids and slots, never the uids of owned parts. At most PRESET_LIMIT per gun type, each
 * with a name the player may change. They live in the profile's optional `gunPresets` (no version change: an older
 * client reads such a profile and drops the field when it next writes, which the maintainer accepted). Pure rules over
 * the catalog; applying one to a gun is bench.ts presetEdits, writing is the hideout Runtime's.
 */
import { GUNS, type GunId, type Slot } from './catalog';
import { MAX_PARTS, validateBuild, type Build, type Part } from './compat';
import { isGunId, type PartNode } from './instance';

/** One part of a preset: its catalog id, the slot it sits in on its parent, and the parts on it. */
export interface PresetNode { id: string; slot: Slot; children: PresetNode[] }
export interface GunPreset { id: string; name: string; gun: GunId; parts: PresetNode[] }

export const PRESET_LIMIT = 10;
export const PRESET_NAME_MAX = 16;
const ID_MAX = 64;

/** A preset's parts from a gun's part tree: ids and slots, in the same order, without uids or relief flags. */
export const presetOf = (parts: readonly PartNode[]): PresetNode[] =>
    parts.map(p => ({ id: p.id, slot: p.slot, children: presetOf(p.children) }));
/** The flat build of a preset, its parts under the uids `p0`, `p1`, ... in tree order (parents before children). */
export function presetBuild(gun: string, parts: readonly PresetNode[]): Build {
    const out: Part[] = [];
    const walk = (nodes: readonly PresetNode[], parent: string | null) => {
        for (const n of nodes) { const uid = `p${out.length}`; out.push({ uid, id: n.id, parent, slot: n.slot }); walk(n.children, uid); }
    };
    walk(parts, null);
    return { gun, parts: out };
}
/** Every part of a preset, depth first. */
export const presetIds = (parts: readonly PresetNode[]): string[] => parts.flatMap(p => [p.id, ...presetIds(p.children)]);

/** A name as typed: trimmed, whitespace runs folded to one space; null when empty, too long or holding control characters. */
export function presetName(text: unknown): string | null {
    if (typeof text !== 'string') return null;
    const name = text.trim().replace(/\s+/g, ' ');
    // Control characters (C0, DEL, C1) never belong in a name shown on the screen.
    return name && [...name].length <= PRESET_NAME_MAX && !/[\u0000-\u001f\u007f-\u009f]/.test(name) ? name : null;
}
/** The default name for a new preset of `gun`: its short name and the first free number, "M4A1 配装 1". */
export function defaultPresetName(presets: readonly GunPreset[], gun: GunId): string {
    const short = GUNS[gun].stats.name.split(' ')[0], used = new Set(presets.map(p => p.name));
    for (let n = 1; ; n++) if (!used.has(`${short} 配装 ${n}`)) return `${short} 配装 ${n}`;
}

/** The tree's shape as the type says, with no more than MAX_PARTS parts; ids and slots are validateBuild's to judge. */
function wellFormed(nodes: unknown, budget: { left: number }): nodes is PresetNode[] {
    if (!Array.isArray(nodes)) return false;
    for (const n of nodes) {
        if (!n || typeof n !== 'object' || Array.isArray(n) || --budget.left < 0) return false;
        const keys = Object.keys(n);
        if (keys.length !== 3 || typeof n.id !== 'string' || typeof n.slot !== 'string' || !wellFormed(n.children, budget)) return false;
    }
    return true;
}
/** One preset: a known gun, a valid build of catalog parts, an id and a name as presetName leaves it. */
export function validPreset(value: unknown): value is GunPreset {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const p = value as Record<string, unknown>;
    if (Object.keys(p).length !== 4 || typeof p.id !== 'string' || !p.id || p.id.length > ID_MAX) return false;
    if (!isGunId(p.gun) || presetName(p.name) !== p.name || !wellFormed(p.parts, { left: MAX_PARTS })) return false;
    return validateBuild(presetBuild(p.gun, p.parts)).ok;
}
/** A profile's presets: an array of valid presets with distinct ids and at most PRESET_LIMIT per gun type. */
export function validPresets(value: unknown): value is GunPreset[] {
    if (!Array.isArray(value) || value.length > PRESET_LIMIT * Object.keys(GUNS).length) return false;
    const ids = new Set<string>(), per = new Map<string, number>();
    for (const p of value) {
        if (!validPreset(p) || ids.has(p.id)) return false;
        ids.add(p.id); per.set(p.gun, (per.get(p.gun) ?? 0) + 1);
        if (per.get(p.gun)! > PRESET_LIMIT) return false;
    }
    return true;
}
