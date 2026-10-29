/**
 * The workbench's edit transaction (#28 M2-04): what a list of installs and removals makes of one gun at the base and
 * of the profile around it, and whether that may be committed. planGunEdit is pure: it reads a profile and returns a
 * new one beside a summary for the screen, and never changes its input. The hideout Runtime's GunsmithSession previews
 * with it and commits the profile it returns in one SaveSession transaction. Rules and messages are in
 * docs/gunsmith/CONTRACTS.md, 「改装事务（M2-04）」.
 *
 * Besides the record migration this is the only code that writes a gun's parts and switches; tests/gunsmith-items.test.ts
 * keeps every module outside src/gunsmith/ from doing so. It reads the domain's inventory rules at run time, so
 * domain.ts must never import it.
 */
import * as D from '../domain';
import { ATTACHMENTS, type GunId, type Slot } from './catalog';
import { checkInstall, removalCascade, type Part, type Placement, type Rejection } from './compat';
import { buildOf, gunSize, gunUids, gunWeight, nodesOf, validateGun, type Devices, type GunState, type PartNode } from './instance';
import { effectiveWeapon } from './stats';

type Container = 'stash' | 'bag' | 'safe';
const CONTAINERS: readonly Container[] = ['stash', 'bag', 'safe'];
const CONTAINER_NAMES: Readonly<Record<Container, string>> = { stash: '仓库', bag: '背包', safe: '安全箱' };
/** Where a gun can be at the base: the equipped slot or a container. */
export type GunPlace = 'equipment' | Container;

/**
 * One workbench change. A list applies in order, each edit on the build the earlier ones left:
 * - install `uid`: a loose part the player owns (stash, bag or safe), or a part an earlier edit took off this gun
 *   (moving it); at `at` (a slot of the gun, parent null, or of a part on it) or where compat places it first;
 * - install `id`: previews a part the player does not have, by catalog id. It sits in the candidate under the uid
 *   `unowned-1`, `unowned-2`, ... in list order (`unowned-1-2` and so on if the profile already holds that uid), which
 *   later edits may name as a parent; such a candidate is never committed (M0 review decision 6);
 * - remove `uid`: a part on the gun; whatever compat's removalCascade lists comes off with it.
 * The result is the net change: a part installed and taken off again in the same list stays where it was.
 */
export type GunEdit =
    | { kind: 'install'; uid: string; at?: Placement }
    | { kind: 'install'; id: string; at?: Placement }
    | { kind: 'remove'; uid: string };

/**
 * Why an edit list cannot be made (an edit names its index) or its candidate cannot be committed. compat's codes and
 * reasons pass through for a part that does not fit; the rest are this module's (the table is in CONTRACTS.md).
 */
export type GunEditFault = Rejection | 'raid' | 'missing-gun' | 'missing-part' | 'not-part' | 'installed' | 'not-installed'
    | 'unowned' | 'loose' | 'unchanged' | 'footprint' | 'space';
/** A part going on: `from` is the container it leaves, null for a part not owned (its uid is then a placeholder). */
export interface GunEditInstall { uid: string; id: string; parent: string | null; slot: Slot; from: Container | null }
/** A part coming off into the stash, as the loose item it was: `with` is the part whose removal took it off, else null. */
export interface GunEditRemoval { uid: string; id: string; with: string | null }
/** A part that stays on the gun in another place (taken off and installed again in the same list). */
export interface GunEditMove { uid: string; id: string; parent: string | null; slot: Slot }
/** What a candidate changes, for the screen. Plain data: two equal plans give equal JSON. */
export interface GunEditPreview {
    gun: { uid: string; id: GunId; relief: boolean; where: GunPlace };
    /** The gun's parts and switches now, and as the candidate leaves them. */
    before: GunState; after: GunState;
    installs: GunEditInstall[]; removals: GunEditRemoval[]; moves: GunEditMove[];
    /** The gun's kg (gunWeight), its effective magazine and its footprint as it lies (rotated in a container if it is). */
    weight: { before: number; after: number };
    capacity: { before: number; after: number };
    size: { before: { w: number; h: number }; after: { w: number; h: number } };
    /** Rounds the equipped gun no longer holds, going into the stash, ordinary and relief apart; null when none. */
    unloaded: { ammo: string; normal: number; relief: number } | null;
    /** Why this candidate cannot be committed, or null. */
    refusal: { code: GunEditFault; reason: string } | null;
}
/**
 * A plan. ok: the candidate may be committed and `profile` is the whole profile after it. Otherwise `edit` is the
 * index of the edit that cannot be made, with no preview, or null when the candidate exists but cannot be committed
 * (a part not owned, no room in the stash, a gun that no longer fits where it lies), with the preview to show.
 */
export type GunEditPlan =
    | { ok: true; preview: GunEditPreview; profile: D.SaveDataV1 }
    | { ok: false; code: GunEditFault; reason: string; edit: number | null; preview: GunEditPreview | null };

const RAID = '行动中不能改装枪械。', MISSING_GUN = '这把枪已不在原位置，请重新选择。', STRUCTURE = '配件结构无效';
const MISSING_PART = '这个配件已不在原位置，请重新选择。', ELSEWHERE = '这个配件装在别的枪上，请先拆下。', NOT_PART = '这件物品不是配件。';
const INSTALLED = '这个配件已经装在枪上。', NOT_INSTALLED = '这个配件不在这把枪上。', UNCHANGED = '还没有改动。';
/** More edits than any gun could use (at most 12 parts); a longer list is refused unread. */
const MAX_EDITS = 64;
const UNOWNED = 'unowned';

const name = (id: string) => ATTACHMENTS[id].name;
/** A name after Chinese text: a space first when it starts with a Latin letter or a digit, as compat writes 需要 AR …. */
const spaced = (text: string) => /^[A-Za-z0-9]/.test(text) ? ` ${text}` : text;
const effects = (id: string): readonly (keyof Devices)[] => {
    const quota = ATTACHMENTS[id].quota;
    return quota === 'combiner' ? ['laser', 'light'] : quota ? [quota] : [];
};
const refuse = (code: GunEditFault, reason: string, edit: number | null = null): GunEditPlan => ({ ok: false, code, reason, edit, preview: null });
const placement = (at: unknown) => at === undefined || !!at && typeof at === 'object' && !Array.isArray(at)
    && ((at as Placement).parent === null || typeof (at as Placement).parent === 'string') && typeof (at as Placement).slot === 'string';
/** An edit as the type says: callers pass data from the screen, so its shape is checked before anything reads it. */
function wellFormed(edit: unknown): edit is GunEdit {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) return false;
    const e = edit as Record<string, unknown>;
    if (e.kind === 'remove') return typeof e.uid === 'string';
    return e.kind === 'install' && placement(e.at) && (typeof e.uid === 'string' ? e.id === undefined : typeof e.id === 'string');
}

/**
 * The gun `uid` where the base holds it: the equipped slot, else the stash, bag or safe. Its type, body relief flag,
 * rotation (false when equipped) and state, the state being the profile's own object. Null when it is not at the base.
 */
export function locateGun(profile: D.SaveDataV1, uid: string): { where: GunPlace; id: GunId; relief: boolean; rotated: boolean; state: GunState } | null {
    const e = profile.equipment;
    if (e.weaponUid === uid && D.isGun(e.weapon) && e.gun) return { where: 'equipment', id: e.weapon, relief: e.relief, rotated: false, state: e.gun };
    for (const where of CONTAINERS) {
        const item = profile[where].items.find(i => i.uid === uid);
        if (item && D.isGun(item.id) && item.gun) return { where, id: item.id, relief: !!item.relief, rotated: !!item.rotated, state: item.gun };
    }
    return null;
}

/**
 * Plan `edits` on the gun `gunUid` of `profile` at the base. Pure: `profile` is only read.
 *
 * Each edit must be possible on the build the earlier ones left: an install passes compat.checkInstall, takes a loose
 * part from a container of this profile (or one an earlier edit took off this gun) and never one that is on any gun
 * already; a removal names a part on the gun and takes what removalCascade lists with it. Then the net candidate is
 * checked as a whole (validateGun) and applied to a copy of the profile:
 *   1. the parts going on leave their containers, keeping their uids and relief flags;
 *   2. the gun takes its new state where it is; in a container it must still fit at its own cells and rotation;
 *   3. the parts coming off go into the stash, each as the loose item it was (D.placeItem: first free cell, either way
 *      round), in the order they sat on the gun;
 *   4. an equipped gun whose effective magazine shrinks unloads the rounds above it into the stash, ordinary rounds
 *      first and relief rounds only when the ordinary ones are not enough, each kind into its own stacks (D.addItem).
 * A device switch stays on only while the part that gave it stays on the gun; a part coming off turns its switch off,
 * a part going on starts off (M0 review decision 2). Any step that finds no room refuses the whole candidate.
 */
export function planGunEdit(profile: D.SaveDataV1, gunUid: string, edits: readonly GunEdit[]): GunEditPlan {
    if (profile.activeRun) return refuse('raid', RAID);
    if (!Array.isArray(edits) || edits.length > MAX_EDITS) return refuse('structure', STRUCTURE);
    const gun = locateGun(profile, gunUid);
    if (!gun) return refuse('missing-gun', MISSING_GUN);
    const original = buildOf({ id: gun.id, parts: gun.state.parts }).parts, onGun = new Map(original.map((p, i) => [p.uid, i]));
    const relief = new Map(nodesOf(gun.state.parts).map(node => [node.uid, node.relief]));
    const loose = new Map<string, { item: D.Item; from: Container }>();
    for (const from of CONTAINERS) for (const item of profile[from].items) loose.set(item.uid, { item, from });
    // Every uid the profile holds, guns and their parts included: placeholders avoid them, and a part on another gun
    // is named as such.
    const held = new Set<string>(), elsewhere = new Set<string>();
    const gunAt = (uid: string, state: GunState) => {
        for (const part of gunUids({ uid, parts: state.parts })) { held.add(part); if (uid !== gunUid && part !== uid) elsewhere.add(part); }
    };
    if (profile.equipment.weaponUid !== null && profile.equipment.gun) gunAt(profile.equipment.weaponUid, profile.equipment.gun);
    for (const { item } of loose.values()) {
        if (item.gun) gunAt(item.uid, item.gun);
        else held.add(item.uid);
    }

    let parts: Part[] = original.map(p => ({ ...p }));
    const cause = new Map<string, string | null>(), unowned: string[] = [];
    for (const [index, edit] of edits.entries()) {
        if (!wellFormed(edit)) return refuse('structure', STRUCTURE, index);
        if (edit.kind === 'remove') {
            if (!parts.some(p => p.uid === edit.uid)) return refuse('not-installed', NOT_INSTALLED, index);
            const off = new Set([edit.uid, ...removalCascade({ gun: gun.id, parts }, edit.uid)]);
            for (const uid of off) cause.set(uid, uid === edit.uid ? null : edit.uid);
            parts = parts.filter(p => !off.has(p.uid));
            continue;
        }
        let uid: string, id: string;
        if ('uid' in edit) {
            uid = edit.uid;
            const was = original.find(p => p.uid === uid), there = loose.get(uid);
            if (parts.some(p => p.uid === uid)) return refuse('installed', INSTALLED, index);
            if (was) id = was.id;
            else if (there && D.isAttachment(there.item.id) && there.item.qty === 1 && !there.item.gun) {
                id = there.item.id; relief.set(uid, !!there.item.relief);
            } else return there ? refuse('not-part', NOT_PART, index) : refuse('missing-part', elsewhere.has(uid) ? ELSEWHERE : MISSING_PART, index);
        } else {
            id = edit.id;
            uid = `${UNOWNED}-${unowned.length + 1}`;
            for (let n = 2; held.has(uid); n++) uid = `${UNOWNED}-${unowned.length + 1}-${n}`;
            relief.set(uid, false);
        }
        const fit = checkInstall({ gun: gun.id, parts }, id, edit.at);
        if (!fit.ok) return refuse(fit.code, fit.reason, index);
        if (!('uid' in edit)) { unowned.push(uid); held.add(uid); }
        parts = [...parts, { uid, id, parent: fit.at.parent, slot: fit.at.slot }];
        cause.delete(uid);
    }

    // The net candidate. Parts that stayed keep their order among their siblings, new ones follow in edit order, so
    // taking a part off and putting it back where it was changes nothing.
    const rank = (p: Part) => onGun.get(p.uid) ?? original.length + parts.indexOf(p);
    const ordered = [...parts].sort((a, b) => rank(a) - rank(b)), kept = new Set(parts.map(p => p.uid));
    const tree = (parent: string | null): PartNode[] => ordered.filter(p => p.parent === parent)
        .map(p => ({ uid: p.uid, id: p.id, slot: p.slot, relief: relief.get(p.uid)!, children: tree(p.uid) }));
    const stays = (effect: keyof Devices) => original.some(p => kept.has(p.uid) && effects(p.id).includes(effect));
    const after: GunState = { parts: tree(null), devices: { laser: gun.state.devices.laser && stays('laser'), light: gun.state.devices.light && stays('light') } };
    const legal = validateGun(gun.id, gunUid, after);
    if (!legal.ok) return refuse(legal.code === 'uid' || legal.code === 'devices' ? 'structure' : legal.code, legal.reason);

    const removals = original.filter(p => !kept.has(p.uid)).map(p => ({ uid: p.uid, id: p.id, with: cause.get(p.uid) ?? null }));
    const installs = ordered.filter(p => !onGun.has(p.uid)).map(p => ({ uid: p.uid, id: p.id, parent: p.parent, slot: p.slot, from: loose.get(p.uid)?.from ?? null }));
    const moves = ordered.filter(p => { const i = onGun.get(p.uid); return i !== undefined && (original[i].parent !== p.parent || original[i].slot !== p.slot); })
        .map(p => ({ uid: p.uid, id: p.id, parent: p.parent, slot: p.slot }));
    const capacity = (state: GunState) => effectiveWeapon(buildOf({ id: gun.id, parts: state.parts })).magazine;
    const hand = profile.equipment, equipped = gun.where === 'equipment', room = capacity(after);
    const unload = equipped && hand.ammo > room ? hand.ammo - room : 0, normal = Math.min(unload, hand.ammo - hand.ammoRelief);
    const ammo = equipped ? D.equippedWeapon(hand).ammo! : '';
    const preview: GunEditPreview = {
        gun: { uid: gunUid, id: gun.id, relief: gun.relief, where: gun.where }, before: structuredClone(gun.state), after,
        installs, removals, moves,
        weight: { before: gunWeight({ id: gun.id, parts: gun.state.parts }), after: gunWeight({ id: gun.id, parts: after.parts }) },
        capacity: { before: capacity(gun.state), after: room },
        size: { before: gunSize({ id: gun.id, parts: gun.state.parts }, gun.rotated), after: gunSize({ id: gun.id, parts: after.parts }, gun.rotated) },
        unloaded: unload ? { ammo, normal, relief: unload - normal } : null,
        refusal: null,
    };
    const blocked = (code: GunEditFault, reason: string): GunEditPlan => ({ ok: false, code, reason, edit: null, preview: { ...preview, refusal: { code, reason } } });
    if (unowned.length) {
        const missing = [...new Set(installs.filter(p => p.from === null).map(p => `「${name(p.id)}」`))];
        return blocked('unowned', `还没有${missing.join('')}。先买到，或换回已有的配件。`);
    }
    // Only items can lie loose; a part that is not an item yet (M3 makes the rest) stays on the gun.
    const stuck = removals.find(p => !D.isAttachment(p.id));
    if (stuck) return blocked('loose', `${name(stuck.id)}暂时不能拆下。`);
    if (D.gunKey(after) === D.gunKey(gun.state)) return blocked('unchanged', UNCHANGED);

    const next = structuredClone(profile);
    for (const p of installs) { const from = loose.get(p.uid)!.from; next[from].items = next[from].items.filter(i => i.uid !== p.uid); }
    if (equipped) next.equipment.gun = structuredClone(after);
    else {
        const where = gun.where as Container, item = next[where].items.find(i => i.uid === gunUid)!;
        // In the stash overflow (#28 M3-12) nothing may change size: it comes out first.
        if (item.y >= next[where].h) return blocked('footprint', '这把枪在仓库溢出区，先移进仓库或背包再改装。');
        item.gun = structuredClone(after);
        if (!D.fits(next[where], item, item.x, item.y, item.uid, !!item.rotated)) return blocked('footprint', `改装后枪身变大，在${CONTAINER_NAMES[where]}原来的位置放不下，请先腾出空间。`);
    }
    for (const p of removals) {
        const item: D.Item = { uid: p.uid, id: p.id, qty: 1, x: 0, y: 0, ...(relief.get(p.uid) ? { relief: true } : {}) };
        if (!D.placeItem(next.stash, item)) return blocked('space', `仓库放不下拆下的${spaced(name(p.id))}，请先腾出空间。`);
    }
    if (unload) {
        next.equipment.ammo -= unload; next.equipment.ammoRelief -= unload - normal;
        if (D.addItem(next.stash, ammo, normal) || D.addItem(next.stash, ammo, unload - normal, true))
            return blocked('space', `仓库没有空位放卸出的 ${unload} 发${spaced(D.ITEMS[ammo].name)}，请先腾出空间。`);
    }
    return { ok: true, preview, profile: next };
}
