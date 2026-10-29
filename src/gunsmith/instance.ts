/**
 * Gun instances (#28 M0-05): one gun with its own uid, the attachments installed on it as a tree of nodes that keep
 * their own uids, and its device switches. validateGun checks a stored gun strictly; gunSize, gunWeight and gunSale are
 * what inventories, carrying and selling need from one. Pure rules over catalog.ts and compat.ts, not wired into the
 * game yet: how each save format stores an instance is decided in docs/gunsmith/CONTRACTS.md (M0-05, M0-06), and M1
 * wires it in. Combat numbers (effective handling and stats) are M0-04's, not this module's.
 */
import { ATTACHMENTS, FACTORY_MAG_PARTS, FACTORY_MAGS, GUNS, type GunId, type Slot } from './catalog';
import { MAX_DEPTH, MAX_PARTS, validateBuild, type Build, type Part, type Rejection } from './compat';

/**
 * One installed attachment. `uid` is the part's for life: the uid it has as a loose item, so part uids share the
 * record's item uid space. `slot` is where it sits on its holder (the gun, or the node above it); `children` sit in the
 * slots it opens. `relief`: it came as relief, so it can never be sold, wherever it is installed.
 */
export interface PartNode { uid: string; id: string; slot: Slot; relief: boolean; children: PartNode[] }
/** Device switches, kept per gun. A switch may be on only while an installed part has that effect (a combiner has both). */
export interface Devices { laser: boolean; light: boolean }
/**
 * What a gun holds besides the uid, id and relief flag of the item, ground loot or equipped slot that carries it.
 * `magOut` (#28 M4-07): its factory magazine was taken out at the workbench and lies loose, so the gun holds a magazine
 * only while another sits in its mag slot (magless). Present only then, so a gun whose magazine never came out is
 * stored as before; an old client's strict check refuses the key, as it refuses gunPresets (CONTRACTS, M4-07). A
 * factory magazine put back is no node again: the key goes, and the gun is as it was.
 */
export interface GunState { parts: PartNode[]; devices: Devices; magOut?: true }
/** A whole gun: its uid and type, whether the body came as relief, its installed parts and its switches. */
export interface GunInstance extends GunState { uid: string; id: GunId; relief: boolean }

const NODE_KEYS = ['uid', 'id', 'slot', 'relief', 'children'] as const;
/** What gunSize, gunWeight, gunSale and buildOf read of a gun: its type, installed parts and whether its magazine is out. */
export type GunShape = Pick<GunInstance, 'id' | 'parts' | 'magOut'>;
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

/** The flat build compat.ts checks: every node with the uid of the node holding it (null for the gun itself), and `magOut`. */
export function buildOf(gun: GunShape): Build {
    const parts: Part[] = [];
    const visit = (nodes: readonly PartNode[], parent: string | null) => {
        for (const node of nodes) { parts.push({ uid: node.uid, id: node.id, parent, slot: node.slot }); visit(node.children, node.uid); }
    };
    visit(gun.parts, null);
    return gun.magOut ? { gun: gun.id, parts, magOut: true } : { gun: gun.id, parts };
}

/** The gun's factory magazine comes off at the workbench (catalog FACTORY_MAGS, #28 M4-07). */
export const detachable = (gun: unknown): gun is GunId => typeof gun === 'string' && Object.hasOwn(FACTORY_MAGS, gun);
/**
 * The gun holds no magazine: its factory one is out and nothing sits in the mag slot. `roots` are the parts on the gun
 * itself (a gun's `parts`, or a build's parts, whose roots have parent null). It cannot fire or reload, its capacity is
 * 0 and it is a row shorter, lighter by the magazine's kg.
 */
export const magless = (magOut: boolean | undefined, roots: readonly { slot: Slot; parent?: string | null }[]): boolean =>
    !!magOut && !roots.some(p => p.slot === 'mag' && !p.parent);
/** The factory magazine of a detachable gun as the catalog has it; undefined for any other gun. */
const factoryMag = (gun: GunId) => detachable(gun) ? FACTORY_MAG_PARTS[FACTORY_MAGS[gun]!] : undefined;

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
    // `magOut` is stored only as true and only on a gun whose magazine comes off (M4-07).
    const out = !!state && typeof state === 'object' && Object.hasOwn(state, 'magOut');
    if (out && ((state as Record<string, unknown>).magOut !== true || !detachable(id))) return refuse('structure', STRUCTURE);
    if (!exact(state, out ? ['parts', 'devices', 'magOut'] : ['parts', 'devices']) || !Array.isArray(state.parts) || !exact(state.devices, ['laser', 'light'])
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

/**
 * Cells the gun takes: its catalog size grown by every installed part's `grow`, swapped when rotated (as domain itemSize).
 * Since #28 M3-12 a box magazine makes a gun two rows (the catalog's `h`), a long one or a drum three (`grow.h`), and a
 * suppressor one column more (`grow.w`). Without a magazine (magless, M4-07) the box magazine's row goes: one row.
 */
export function gunSize(gun: GunShape, rotated = false): { w: number; h: number } {
    const v8 = footprintRules === 'v8';
    let { w, h } = GUNS[gun.id];
    if (v8 || magless(gun.magOut, gun.parts)) h = 1;
    for (const node of nodesOf(gun.parts)) {
        const grow = ATTACHMENTS[node.id].mods.grow;
        if (grow) { w += grow.w; if (!v8 || V8_TALLER.has(node.id)) h += grow.h; }
    }
    return rotated ? { w: h, h: w } : { w, h };
}
/**
 * The footprint rules gunSize (and domain stashRows) follow: the current ones, or a record v8's while that record is
 * checked by its own rules before it is migrated (#28 M3-12, recovery-store decodeSession). Under v8 every gun is one row
 * and only the drum grows one more; suppressors widen the gun as now.
 */
let footprintRules: 'current' | 'v8' = 'current';
const V8_TALLER = new Set(['G09']);
export const v8Footprints = (): boolean => footprintRules === 'v8';
/** `read` under the v8 footprint rules; the current rules again afterwards, whatever it throws. */
export function withV8Footprints<T>(read: () => T): T {
    const was = footprintRules;
    footprintRules = 'v8';
    try { return read(); } finally { footprintRules = was; }
}

/**
 * Carried kg: the gun's own weight plus each installed part's installed weight (`mods.weight`, below zero for a part
 * lighter than the factory part it replaces), every part counted once; less its factory magazine's loose kg when it
 * holds no magazine (magless). Rounded to grams, as domain weight() rounds.
 */
export function gunWeight(gun: GunShape): number {
    const out = magless(gun.magOut, gun.parts) ? factoryMag(gun.id)!.weight : 0;
    const kg = nodesOf(gun.parts).reduce((sum, node) => sum + ATTACHMENTS[node.id].mods.weight, GUNS[gun.id].weight - out);
    return Math.round(kg * 1000) / 1000;
}

/** The body's sell price: the gun's, less its factory magazine's while that is out. */
const bodySell = (gun: GunShape) => GUNS[gun.id].sell - (gun.magOut ? factoryMag(gun.id)!.sell : 0);
/**
 * What selling the whole gun pays: the sell price of every component that is not relief, the body at the gun's price
 * and each part at its loose price. `restricted` when any component is relief: such a sale must be refused with the
 * reason, never made by stripping or destroying the relief parts.
 */
/**
 * The sale preview of a gun (#28 M2-08): its body and then each installed part, with the price each adds; a relief
 * component adds nothing and is marked (it bars selling the gun whole, gunSale). The body's price leaves out its factory
 * magazine while that is out (M4-07): the magazine sells on its own.
 */
export function gunSaleLines(gun: GunShape & Pick<GunInstance, 'relief'>): { id: string; name: string; price: number; relief: boolean }[] {
    const name = GUNS[gun.id].stats.name + (gun.magOut ? '（不含原厂弹匣）' : '');
    return [{ id: gun.id, name, price: gun.relief ? 0 : bodySell(gun), relief: gun.relief },
        ...nodesOf(gun.parts).map(n => ({ id: n.id, name: ATTACHMENTS[n.id].name, price: n.relief ? 0 : ATTACHMENTS[n.id].sell, relief: n.relief }))];
}
export function gunSale(gun: GunShape & Pick<GunInstance, 'relief'>): { value: number; restricted: boolean } {
    let value = gun.relief ? 0 : bodySell(gun), restricted = gun.relief;
    for (const node of nodesOf(gun.parts)) {
        if (node.relief) restricted = true;
        else value += ATTACHMENTS[node.id].sell;
    }
    return { value, restricted };
}
