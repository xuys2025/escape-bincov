/**
 * Gun instances (#28 M0-05): one gun with its own uid, the attachments installed on it as a tree of nodes that keep
 * their own uids, and its device switches. validateGun checks a stored gun strictly; gunSize, gunWeight and gunSale are
 * what inventories, carrying and selling need from one. Pure rules over catalog.ts and compat.ts, not wired into the
 * game yet: how each save format stores an instance is decided in docs/gunsmith/CONTRACTS.md (M0-05, M0-06), and M1
 * wires it in. Combat numbers (effective handling and stats) are M0-04's, not this module's.
 */
import { ATTACHMENTS, GUNS, type GunId, type Slot } from './catalog';
import { MAX_DEPTH, MAX_PARTS, validateBuild, type Build, type Part, type Rejection } from './compat';

/**
 * One installed attachment. `uid` is the part's for life: the uid it has as a loose item, so part uids share the
 * record's item uid space. `slot` is where it sits on its holder (the gun, or the node above it); `children` sit in the
 * slots it opens. `relief`: it came as relief, so it can never be sold, wherever it is installed.
 */
export interface PartNode { uid: string; id: string; slot: Slot; relief: boolean; children: PartNode[] }
/** Device switches, kept per gun. A switch may be on only while an installed part has that effect (a combiner has both). */
export interface Devices { laser: boolean; light: boolean }
/** What a gun holds besides the uid, id and relief flag of the item, ground loot or equipped slot that carries it. */
export interface GunState { parts: PartNode[]; devices: Devices }
/** A whole gun: its uid and type, whether the body came as relief, its installed parts and its switches. */
export interface GunInstance extends GunState { uid: string; id: GunId; relief: boolean }

const NODE_KEYS = ['uid', 'id', 'slot', 'relief', 'children'] as const;
/** Item uids as profile-codec's identity() accepts them; tests/gunsmith-instance.test.ts keeps the two equal. */
const ITEM_UID = /^[a-zA-Z0-9_-]{1,100}$/;
// The reasons compat.ts gives for the same faults; the instance test keeps them equal.
const UNKNOWN = '无法识别这把枪', STRUCTURE = '配件结构无效', COUNT = `最多装 ${MAX_PARTS} 个配件`, DEPTH = '配件最多装三层';

const exact = (value: unknown, keys: readonly string[]): value is Record<string, any> => !!value && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));

/** A catalog gun id. An own key, so prototype names such as toString are not guns. */
export const isGunId = (id: unknown): id is GunId => typeof id === 'string' && Object.hasOwn(GUNS, id);
/** A gun as it leaves the factory, and as an old save's gun becomes one (M0-06): nothing installed, every device off. */
export const factoryState = (): GunState => ({ parts: [], devices: { laser: false, light: false } });
/** Every installed node once, depth first, each before its children. For a gun validateGun accepted. */
export const nodesOf = (parts: readonly PartNode[]): PartNode[] => parts.flatMap(node => [node, ...nodesOf(node.children)]);
/** Every uid a gun holds: its own, then its parts' in nodesOf order. Record-wide uniqueness is the caller's (repeatedUids). */
export const gunUids = (gun: Pick<GunInstance, 'uid' | 'parts'>): string[] => [gun.uid, ...nodesOf(gun.parts).map(node => node.uid)];

/** The flat build compat.ts checks: every node with the uid of the node holding it (null for the gun itself). */
export function buildOf(gun: Pick<GunInstance, 'id' | 'parts'>): Build {
    const parts: Part[] = [];
    const visit = (nodes: readonly PartNode[], parent: string | null) => {
        for (const node of nodes) { parts.push({ uid: node.uid, id: node.id, parent, slot: node.slot }); visit(node.children, node.uid); }
    };
    visit(gun.parts, null);
    return { gun: gun.id, parts };
}

/** The uids that occur more than once in `uids`, given every uid of one record: empty when they are all unique. */
export function repeatedUids(uids: Iterable<string>): string[] {
    const seen = new Set<string>(), repeated = new Set<string>();
    for (const uid of uids) (seen.has(uid) ? repeated : seen).add(uid);
    return [...repeated];
}

/** The device effects the installed parts provide; validated parts only. */
export function deviceEffects(parts: readonly PartNode[]): Devices {
    const quotas = nodesOf(parts).map(node => ATTACHMENTS[node.id].quota);
    return { laser: quotas.some(q => q === 'laser' || q === 'combiner'), light: quotas.some(q => q === 'light' || q === 'combiner') };
}

/** compat.ts's codes, plus `uid` (not an item uid, or held twice in the gun) and `devices` (on without a part for it). */
export type GunFault = Rejection | 'uid' | 'devices';
export type GunCheck = { ok: true } | { ok: false; code: GunFault; reason: string };
const refuse = (code: GunFault, reason: string): GunCheck => ({ ok: false, code, reason });

/**
 * Strict check of one stored gun, before anything trusts it. `id` and `uid` come from the holder (an inventory item,
 * ground loot or the equipped slot) and `state` is the holder's stored gun value. Rejects, never repairs: an unknown
 * gun or part; a uid that is not an item uid, or that the gun holds twice (its own included); a state or node with
 * missing or extra keys; more than MAX_PARTS parts or MAX_DEPTH levels; a node reached twice (a cycle or a shared
 * node); a device switched on with no part for it; and any build compat.validateBuild refuses. The walk stops at the
 * limits, so a huge or cyclic value costs at most MAX_PARTS + 1 nodes. Uniqueness across the record is not checked
 * here: gunUids lists the uids for the caller's record-wide set.
 */
export function validateGun(id: unknown, uid: unknown, state: unknown): GunCheck {
    if (!isGunId(id)) return refuse('unknown', UNKNOWN);
    if (!exact(state, ['parts', 'devices']) || !Array.isArray(state.parts) || !exact(state.devices, ['laser', 'light'])
        || typeof state.devices.laser !== 'boolean' || typeof state.devices.light !== 'boolean') return refuse('structure', STRUCTURE);
    const uids = new Set<string>(), visited = new Set<object>();
    const claim = (value: unknown) => typeof value === 'string' && ITEM_UID.test(value) && !uids.has(value) && !!uids.add(value);
    if (!claim(uid)) return refuse('uid', STRUCTURE);
    let count = 0;
    const walk = (nodes: readonly unknown[], depth: number): GunCheck | null => {
        for (const node of nodes) {
            if (++count > MAX_PARTS) return refuse('count', COUNT);
            if (depth > MAX_DEPTH) return refuse('depth', DEPTH);
            if (!exact(node, NODE_KEYS) || visited.has(node) || typeof node.relief !== 'boolean' || !Array.isArray(node.children)) return refuse('structure', STRUCTURE);
            visited.add(node);
            if (!claim(node.uid)) return refuse('uid', STRUCTURE);
            const fault = walk(node.children, depth + 1);
            if (fault) return fault;
        }
        return null;
    };
    const fault = walk(state.parts, 1);
    if (fault) return fault;
    const parts = state.parts as PartNode[], legal = validateBuild(buildOf({ id, parts }));
    if (!legal.ok) return legal;
    const have = deviceEffects(parts);
    if ((state.devices.laser && !have.laser) || (state.devices.light && !have.light)) return refuse('devices', STRUCTURE);
    return { ok: true };
}

/** Cells the gun takes: its catalog size grown by every installed part's `grow`, swapped when rotated (as domain itemSize). */
export function gunSize(gun: Pick<GunInstance, 'id' | 'parts'>, rotated = false): { w: number; h: number } {
    let { w, h } = GUNS[gun.id];
    for (const node of nodesOf(gun.parts)) {
        const grow = ATTACHMENTS[node.id].mods.grow;
        if (grow) { w += grow.w; h += grow.h; }
    }
    return rotated ? { w: h, h: w } : { w, h };
}

/**
 * Carried kg: the gun's own weight plus each installed part's installed weight (`mods.weight`, below zero for a part
 * lighter than the factory part it replaces), every part counted once. Rounded to grams, as domain weight() rounds.
 */
export function gunWeight(gun: Pick<GunInstance, 'id' | 'parts'>): number {
    const kg = nodesOf(gun.parts).reduce((sum, node) => sum + ATTACHMENTS[node.id].mods.weight, GUNS[gun.id].weight);
    return Math.round(kg * 1000) / 1000;
}

/**
 * What selling the whole gun pays: the sell price of every component that is not relief, the body at the gun's price
 * and each part at its loose price. `restricted` when any component is relief: such a sale must be refused with the
 * reason, never made by stripping or destroying the relief parts.
 */
/**
 * The sale preview of a gun (#28 M2-08): its body and then each installed part, with the price each adds; a relief
 * component adds nothing and is marked (it bars selling the gun whole, gunSale).
 */
export function gunSaleLines(gun: Pick<GunInstance, 'id' | 'relief' | 'parts'>): { id: string; name: string; price: number; relief: boolean }[] {
    return [{ id: gun.id, name: GUNS[gun.id].stats.name, price: gun.relief ? 0 : GUNS[gun.id].sell, relief: gun.relief },
        ...nodesOf(gun.parts).map(n => ({ id: n.id, name: ATTACHMENTS[n.id].name, price: n.relief ? 0 : ATTACHMENTS[n.id].sell, relief: n.relief }))];
}
export function gunSale(gun: Pick<GunInstance, 'id' | 'relief' | 'parts'>): { value: number; restricted: boolean } {
    let value = gun.relief ? 0 : GUNS[gun.id].sell, restricted = gun.relief;
    for (const node of nodesOf(gun.parts)) {
        if (node.relief) restricted = true;
        else value += ATTACHMENTS[node.id].sell;
    }
    return { value, restricted };
}
