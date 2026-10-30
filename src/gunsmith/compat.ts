/**
 * Gunsmith compatibility (#28 M0-03): may an attachment go on a gun as it is built now, and what comes off with a
 * removed part. Pure rules over catalog.ts, not wired into the game yet. A build is the gun id plus a flat list of
 * placed parts, each naming the part whose slot holds it (null: the gun's own slot); M0-05's gun instances keep that
 * shape with their own uids. Decisions are in docs/gunsmith/CONTRACTS.md.
 *
 * An install passes four layers in order (PLAN section 5), then the tree limits:
 *   1. the gun is eligible: the part lists it, and long-range scopes go only on guns that can be qualified;
 *   2. the slot exists, native or opened by an installed parent (a base or handguard), with room left;
 *   3. the prerequisites are installed: M03 on G17/P226 needs B01, M04 on M1911 needs B02, and a long-range scope
 *      on the carbine needs the qualification A07 grants;
 *   4. nothing conflicts: one laser and one light effect per gun, a combiner counting as both.
 * A rejection carries a short player-facing reason in Chinese that names parts and slots, never internal ids.
 */
import { ATTACHMENTS, CATEGORY_NAMES, GUNS, SLOT_NAMES, isPremium, type AttachmentDef, type GunDef, type GunId, type Qualification, type Slot } from './catalog';

/** At most 12 attachments on a gun, three levels deep (a part on a part on a part), and no cycles. */
export const MAX_PARTS = 12;
export const MAX_DEPTH = 3;

/** One installed attachment. `parent` is the uid of the part whose slot holds it, or null for the gun's own slot. */
export interface Part { uid: string; id: string; parent: string | null; slot: Slot }
/** A gun type and its parts, flat; `magOut`: its factory magazine is out (instance.ts GunState, #28 M4-07). */
export interface Build { gun: string; parts: readonly Part[]; magOut?: true }
export interface Placement { parent: string | null; slot: Slot }

/**
 * Why an install or a build fails. `reason` is the sentence for the player; `code` is for callers and tests only.
 * opener: a part this gun takes would open the slot, and the reason names it; blocked: the part installed where that
 * opener goes offers no such slot; slot: nothing can ever give this gun the slot. The table is in CONTRACTS.md.
 */
export type Rejection = 'unknown' | 'structure' | 'count' | 'depth' | 'gun' | 'scope' | 'slot' | 'opener' | 'blocked'
    | 'full' | 'place' | 'needs' | 'laser' | 'light';
export interface Refusal { ok: false; code: Rejection; reason: string }
export type InstallCheck = { ok: true; at: Placement } | Refusal;
export type BuildCheck = { ok: true } | Refusal;

const refuse = (code: Rejection, reason: string): Refusal => ({ ok: false, code, reason });
const own = (table: object, key: unknown): key is string => typeof key === 'string' && Object.hasOwn(table, key);
const def = (id: string): AttachmentDef => ATTACHMENTS[id];
const COUNT = `最多装 ${MAX_PARTS} 个配件`, DEPTH = '配件最多装三层', STRUCTURE = '配件结构无效', PLACE = '不能装在这个位置';
const UNQUALIFIED: Readonly<Record<Qualification, string>> = { longScope: '这把枪不能装远距瞄具' };
const QUOTA = { laser: '一把枪只能装一个激光', light: '一把枪只能装一个灯光' } as const;
const full = (slot: Slot) => `${SLOT_NAMES[slot]}已被占用`;
/** "Needs X or Y" with the names joined; a space goes before a name that starts with a Latin letter or a digit. */
const need = (names: readonly string[]) => names.reduce((text, name, i) => `${text}${i ? '或' : ''}${/^[A-Za-z0-9]/.test(name) ? ' ' : ''}${name}`, '需要');
const effects = (a: AttachmentDef): readonly ('laser' | 'light')[] => a.quota === 'combiner' ? ['laser', 'light'] : a.quota ? [a.quota] : [];

/** Catalog parts this gun may take that would give it `q` (A07 on the carbine). */
const granters = (gun: GunDef, q: Qualification) =>
    Object.values(ATTACHMENTS).filter(a => a.grants.includes(q) && !a.requires.includes(q) && (!a.guns || a.guns.includes(gun.id)));

/** Layer 1: the part's gun list, and a qualification this gun can never get. */
function gunFault(gun: GunDef, a: AttachmentDef): Refusal | null {
    if (a.guns && !a.guns.includes(gun.id)) return refuse('gun', '不适配这把枪');
    for (const q of a.requires) if (!gun.quals.includes(q) && !granters(gun, q).length) return refuse('scope', UNQUALIFIED[q]);
    return null;
}
/** Layer 3: the parts and qualifications `a` needs on this gun are among `parts`. */
function prerequisiteFault(gun: GunDef, parts: readonly Part[], a: AttachmentDef): Refusal | null {
    for (const rule of a.needs) if (rule.on.includes(gun.id) && !parts.some(p => p.id === rule.part)) return refuse('needs', need([def(rule.part).name]));
    for (const q of a.requires) {
        if (!gun.quals.includes(q) && !parts.some(p => def(p.id).grants.includes(q))) return refuse('needs', need(granters(gun, q).map(g => g.name)));
    }
    return null;
}

interface Spot { at: Placement; room: number }
/** Every place in the build that offers `slot`, the gun's own first, with the room left in each. */
function spots(gun: GunDef, parts: readonly Part[], slot: Slot): Spot[] {
    const used = (parent: string | null) => parts.filter(p => p.parent === parent && p.slot === slot).length;
    const holders: { parent: string | null; size: number }[] = [{ parent: null, size: gun.slots[slot] ?? 0 },
        ...parts.map(p => ({ parent: p.uid, size: def(p.id).provides[slot] ?? 0 }))];
    return holders.filter(h => h.size > 0).map(h => ({ at: { parent: h.parent, slot }, room: h.size - used(h.parent) }));
}
const depthOf = (parts: readonly Part[], uid: string | null) => {
    let depth = 0;
    for (let at = uid; at !== null; depth++) at = parts.find(p => p.uid === at)!.parent;
    return depth;
};

/**
 * Layer 2 when nothing in the build offers `slot`: name the parts that would open it, or the installed part standing
 * where they go, or say the gun can never have it. Openers mount in a native slot of the gun (bases and handguards).
 * 老栓精工's handguards (#28 M4-09) open rails too, but are made to order, so the reason names the ordinary ones.
 */
function missingSlot(gun: GunDef, build: Build, slot: Slot): Refusal {
    const openers = Object.values(ATTACHMENTS)
        .filter(a => (a.provides[slot] ?? 0) > 0 && gunFault(gun, a) === null && (gun.slots[a.mount] ?? 0) > 0 && !isPremium(a.id));
    if (!openers.length) return refuse('slot', `这把枪没有${SLOT_NAMES[slot]}`);
    const ready = openers.filter(a => checkInstall(build, a.id).ok);
    if (ready.length) return refuse('opener', need(ready.map(a => a.name)));
    const holder = build.parts.find(p => p.parent === null && openers.some(a => a.mount === p.slot));
    return holder ? refuse('blocked', `与当前${CATEGORY_NAMES[def(holder.id).cat]}不兼容`) : refuse('opener', need(openers.map(a => a.name)));
}

/**
 * Whether a saved or proposed build is legal as a whole: a known gun, known parts with unique uids, parents that exist,
 * no cycles, at most MAX_PARTS parts and MAX_DEPTH levels, and every part allowed where it sits (layers 1 to 4).
 * Order-free, so it can check a loaded tree; the first fault found is returned.
 */
export function validateBuild(build: Build): BuildCheck {
    if (!own(GUNS, build.gun)) return refuse('unknown', '无法识别这把枪');
    if (!Array.isArray(build.parts)) return refuse('structure', STRUCTURE);
    const gun = GUNS[build.gun as GunId], parts: readonly Part[] = build.parts;
    if (parts.length > MAX_PARTS) return refuse('count', COUNT);
    const byUid = new Map<string, Part>();
    for (const p of parts) {
        if (typeof p?.uid !== 'string' || p.uid === '' || byUid.has(p.uid)) return refuse('structure', STRUCTURE);
        byUid.set(p.uid, p);
    }
    for (const p of parts) {
        if (!own(ATTACHMENTS, p.id)) return refuse('unknown', '无法识别这个配件');
        if (!own(SLOT_NAMES, p.slot) || (p.parent !== null && (!byUid.has(p.parent) || p.parent === p.uid))) return refuse('structure', STRUCTURE);
    }
    // Walk up from every part: a walk longer than the part count is a cycle.
    for (const p of parts) {
        let depth = 1;
        for (let up = p; up.parent !== null; depth++) {
            if (depth > parts.length) return refuse('structure', STRUCTURE);
            up = byUid.get(up.parent)!;
        }
        if (depth > MAX_DEPTH) return refuse('depth', DEPTH);
    }
    for (const p of parts) {
        const a = def(p.id), holder = p.parent === null ? null : byUid.get(p.parent)!;
        const eligible = gunFault(gun, a);
        if (eligible) return eligible;
        const size = (holder ? def(holder.id).provides : gun.slots)[p.slot] ?? 0;
        if (p.slot !== a.mount || size === 0) return refuse('place', PLACE);
        if (parts.filter(o => o.parent === p.parent && o.slot === p.slot).length > size) return refuse('full', full(p.slot));
        const missing = prerequisiteFault(gun, parts, a);
        if (missing) return missing;
    }
    const used = parts.flatMap(p => effects(def(p.id)));
    for (const e of ['laser', 'light'] as const) if (used.filter(x => x === e).length > 1) return refuse(e, QUOTA[e]);
    return { ok: true };
}

/**
 * Whether attachment `id` may go on the build now, and where. With `at` only that place is tried; otherwise the first
 * place with room, the gun's own slot first. A build that is not valid is refused as validateBuild refuses it. On
 * success, adding the part at `at` gives a build validateBuild accepts.
 */
export function checkInstall(build: Build, id: string, at?: Placement): InstallCheck {
    const valid = validateBuild(build);
    if (!valid.ok) return valid;
    if (!own(ATTACHMENTS, id)) return refuse('unknown', '无法识别这个配件');
    const gun = GUNS[build.gun as GunId], a = def(id), parts = build.parts;
    const eligible = gunFault(gun, a);
    if (eligible) return eligible;
    const all = spots(gun, parts, a.mount);
    const chosen = at ? all.filter(s => s.at.parent === at.parent && s.at.slot === at.slot) : all;
    if (at && !chosen.length) return refuse('place', PLACE);
    if (!chosen.length) return missingSlot(gun, build, a.mount);
    const open = chosen.filter(s => s.room > 0);
    if (!open.length) return refuse('full', full(a.mount));
    const missing = prerequisiteFault(gun, parts, a);
    if (missing) return missing;
    const used = parts.flatMap(p => effects(def(p.id)));
    for (const e of effects(a)) if (used.includes(e)) return refuse(e, QUOTA[e]);
    if (parts.length >= MAX_PARTS) return refuse('count', COUNT);
    const spot = open.find(s => depthOf(parts, s.at.parent) < MAX_DEPTH);
    return spot ? { ok: true, at: spot.at } : refuse('depth', DEPTH);
}

/**
 * The parts that move to the pending-removal list when `uid` comes off a valid build: its children and their children,
 * plus any part that loses a prerequisite or qualification with them (taking B01 off a G17 takes M03 too), repeated
 * until nothing else falls. Build order; `uid` itself is not listed. What is left is a valid build.
 */
export function removalCascade(build: Build, uid: string): string[] {
    const gun = GUNS[build.gun as GunId], gone = new Set([uid]);
    for (let fell = true; fell;) {
        fell = false;
        const left = build.parts.filter(p => !gone.has(p.uid));
        for (const p of left) {
            if ((p.parent !== null && gone.has(p.parent)) || prerequisiteFault(gun, left, def(p.id))) { gone.add(p.uid); fell = true; }
        }
    }
    return build.parts.filter(p => p.uid !== uid && gone.has(p.uid)).map(p => p.uid);
}
