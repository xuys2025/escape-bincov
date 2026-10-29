/**
 * The workbench screen's model (#28 M2-05): what the screen lists and compares, worked out from a profile and a gun's
 * state, never written. Which guns the base holds, the positions a build offers (and the ones a part could open), the
 * attachments that may go in a position with why the others cannot, the edits a click on one appends, and the seven
 * scores the comparison shows. The transaction itself is gunsmith/edit.ts behind HideoutRuntime.openGunsmith; this
 * module only reads. Score formulas are proposals (CONTRACTS.md, workbench section), tuned with M4.
 */
import * as D from '../domain';
import { SURVIVAL } from '../balance';
import { ATTACHMENTS, FACTORY_MAGS, GUNS, SLOT_NAMES, factoryMagOf, partDef, type GunId, type Slot } from './catalog';
import { checkInstall, removalCascade, type Build, type Part } from './compat';
import { GUARDRAILS, effectiveStats, type GunStats } from './stats';
import { buildOf, gunWeight, magless, nodesOf, type GunState } from './instance';
import { locateGun, type GunEdit, type GunPlace } from './edit';
import type { PresetNode } from './presets';

/** Short names on the gun body: what sits in a slot, rather than the rail's name (SLOT_NAMES is the details' wording). */
export const POSITION_NAMES: Readonly<Record<Slot, string>> = {
    micro: '瞄具', top: '瞄具', under: '前握把', side: '战术设备', pistolSide: '侧挂设备', bipod: '脚架',
    muzzle: '枪口', barrel: '枪管', handguard: '护木', stock: '枪托', grip: '后握把', mag: '弹匣', base: '基座',
};
/** The factory part an empty structural slot holds; rails and bases hold nothing when empty. */
export const FACTORY_NAMES: Readonly<Partial<Record<Slot, string>>> = {
    muzzle: '原厂枪口', barrel: '原厂枪管', handguard: '原厂护木', stock: '原厂枪托', grip: '原厂握把', mag: '原厂弹匣',
};
/** Body order, top row first: the screen draws positions in this order. */
const ORDER: readonly Slot[] = ['stock', 'micro', 'top', 'handguard', 'barrel', 'muzzle', 'base', 'grip', 'mag', 'under', 'side', 'pistolSide', 'bipod'];
export const WHERE_NAMES: Readonly<Record<GunPlace, string>> = { equipment: '装备中', stash: '在仓库', bag: '在背包', safe: '在安全箱' };
const CONTAINERS = ['stash', 'bag', 'safe'] as const;
type Container = typeof CONTAINERS[number];

/** The attachments that are items (M2-02): the only ones a player can own, buy or find, so the only ones listed. */
export const benchParts = (): string[] => Object.keys(ATTACHMENTS).filter(id => D.ITEMS[id]?.kind === 'attachment');

// ---------- guns ----------

export interface BenchGun {
    uid: string; id: GunId; name: string; where: GunPlace; relief: boolean;
    state: GunState;
    /** Installed parts, the gun's kg, and the magazine (rounds loaded and capacity) when it is equipped. */
    parts: number; weight: number; magazine: { ammo: number; capacity: number } | null;
}
/** Every gun the base holds: the equipped one first, then the stash, bag and safe in item order. */
export function benchGuns(profile: Readonly<D.SaveDataV1>): BenchGun[] {
    const out: BenchGun[] = [], e = profile.equipment;
    const gun = (uid: string, id: GunId, where: GunPlace, relief: boolean, state: GunState, magazine: BenchGun['magazine']): BenchGun =>
        ({ uid, id, name: GUNS[id].stats.name, where, relief, state, parts: nodesOf(state.parts).length, weight: gunWeight({ id, parts: state.parts, magOut: state.magOut }), magazine });
    if (D.isGun(e.weapon) && e.weaponUid && e.gun) {
        const capacity = effectiveStats(buildOf({ id: e.weapon, parts: e.gun.parts, magOut: e.gun.magOut })).weapon.magazine;
        out.push(gun(e.weaponUid, e.weapon, 'equipment', e.relief, e.gun, { ammo: e.ammo, capacity }));
    }
    for (const where of CONTAINERS) for (const item of profile[where].items) {
        if (D.isGun(item.id) && item.gun) out.push(gun(item.uid, item.id, where, !!item.relief, item.gun, null));
    }
    return out;
}

// ---------- positions ----------

/**
 * One place on the gun body: a slot of the gun (parent null) or of a part on it, `n` counting within a slot that holds
 * more than one. `part` is what sits there in the build. A closed position is a slot nothing in the build offers yet,
 * that a part this gun takes would open: `reason` says which (compat's wording), and it holds nothing. `out`: the gun's
 * own mag slot while the gun holds no magazine (#28 M4-07), where the factory one would otherwise be.
 */
export interface Position {
    key: string; parent: string | null; slot: Slot; n: number;
    name: string; place: string; part: Part | null;
    open: boolean; reason: string | null; out: boolean;
}
const keyOf = (parent: string | null, slot: Slot, n: number) => `${parent ?? 'gun'}/${slot}/${n}`;
/** A part's name after Chinese text, with a space before a Latin letter or digit (compat writes 需要 AR …). */
const after = (text: string) => /^[A-Za-z0-9]/.test(text) ? ` ${text}` : text;

/** The positions of a build in body order: open ones for every slot offered, then closed ones a part could open. */
export function positions(build: Build): Position[] {
    const gun = GUNS[build.gun as GunId], out: Position[] = [], empty = magless(build.magOut, build.parts);
    const holders: { parent: string | null; slots: Partial<Record<Slot, number>> }[] =
        [{ parent: null, slots: gun.slots }, ...build.parts.map(p => ({ parent: p.uid, slots: ATTACHMENTS[p.id].provides }))];
    for (const slot of ORDER) {
        for (const h of holders) {
            const size = h.slots[slot] ?? 0, sitting = build.parts.filter(p => p.parent === h.parent && p.slot === slot);
            const by = h.parent === null ? '' : ` · 由${after(ATTACHMENTS[build.parts.find(p => p.uid === h.parent)!.id].name)}提供`;
            for (let n = 0; n < size; n++) {
                out.push({ key: keyOf(h.parent, slot, n), parent: h.parent, slot, n, name: POSITION_NAMES[slot], place: SLOT_NAMES[slot] + by,
                    part: sitting[n] ?? null, open: true, reason: null, out: empty && h.parent === null && slot === 'mag' });
            }
        }
        if (holders.some(h => (h.slots[slot] ?? 0) > 0)) continue;
        // Nothing offers it: closed when a part this gun takes mounts there and a part a player can own would open it.
        const reason = closedReason(build, slot);
        if (reason) out.push({ key: keyOf(null, slot, 0), parent: null, slot, n: 0, name: POSITION_NAMES[slot], place: SLOT_NAMES[slot], part: null, open: false, reason, out: false });
    }
    return out;
}
/** Layer 1 only: the part lists this gun (or is a rail part). Qualifications and slots are checkInstall's. */
const eligible = (gun: GunId, id: string) => { const g = ATTACHMENTS[id].guns; return !g || g.includes(gun); };
/**
 * Why `slot` is closed on this build, naming only openers that are items: the ones that would go on now, else the part
 * that stands where they go (compat's wording). Null when no item ever mounts there or none could open it.
 */
function closedReason(build: Build, slot: Slot): string | null {
    const gun = build.gun as GunId, parts = benchParts();
    if (!parts.some(id => ATTACHMENTS[id].mount === slot && eligible(gun, id))) return null;
    const openers = parts.filter(id => (ATTACHMENTS[id].provides[slot] ?? 0) > 0 && eligible(gun, id) && (GUNS[gun].slots[ATTACHMENTS[id].mount] ?? 0) > 0);
    if (!openers.length) return null;
    const ready = openers.filter(id => checkInstall(build, id).ok);
    if (ready.length) return ready.reduce((text, id, i) => `${text}${i ? '或' : ''}${after(ATTACHMENTS[id].name)}`, '需要');
    const check = checkInstall(build, openers[0]);
    return check.ok ? null : check.code === 'full' ? `与当前${POSITION_NAMES[ATTACHMENTS[openers[0]].mount]}不兼容` : check.reason;
}

// ---------- candidates ----------

/** Where an owned copy of a part is: loose in a container, or on another gun (named). */
export interface Candidate {
    id: string; name: string;
    /** It sits in this position now. */
    current: boolean;
    /** A loose copy to install (stash first, ordinary before relief), and how many loose copies there are. */
    loose: { uid: string; from: Container } | null; count: number;
    /** No loose copy, but one on another gun at the base: that gun's name. */
    elsewhere: string | null;
    /** Why it cannot go here even replacing what sits there, or null. */
    refusal: string | null;
    /** Where to get one when none is owned. */
    source: string;
}
/** The loose copies of each part in the profile, in container order, ordinary before relief; minus `taken` uids. */
function looseParts(profile: Readonly<D.SaveDataV1>, taken: ReadonlySet<string>): Map<string, { uid: string; from: Container; relief: boolean }[]> {
    const out = new Map<string, { uid: string; from: Container; relief: boolean }[]>();
    for (const from of CONTAINERS) for (const item of profile[from].items) {
        if (D.ITEMS[item.id]?.kind !== 'attachment' || taken.has(item.uid)) continue;
        const list = out.get(item.id) ?? []; list.push({ uid: item.uid, from, relief: !!item.relief }); out.set(item.id, list);
    }
    for (const list of out.values()) list.sort((a, b) => Number(a.relief) - Number(b.relief));
    return out;
}
/** The build with what sits in `at` and everything that comes off with it removed. */
export function without(build: Build, at: Position): Build {
    if (!at.part) return build;
    const off = new Set([at.part.uid, ...removalCascade(build, at.part.uid)]);
    return { ...build, parts: build.parts.filter(p => !off.has(p.uid)) };
}
/**
 * The parts that mount in `at`'s slot and this gun may ever take, owned or not: the ones that fit first (owned before
 * not owned), then the ones that cannot go here with the reason. `gunUid` is the gun being edited and `build` its
 * candidate: parts on it are neither loose nor "on another gun".
 */
export function candidates(profile: Readonly<D.SaveDataV1>, gunUid: string, build: Build, at: Position): Candidate[] {
    const gun = build.gun as GunId, taken = new Set(build.parts.map(p => p.uid)), loose = looseParts(profile, taken);
    const others = benchGuns(profile).filter(g => g.uid !== gunUid);
    const base = without(build, at);
    const list = benchParts().filter(id => ATTACHMENTS[id].mount === at.slot && eligible(gun, id)).map((id): Candidate => {
        const copies = loose.get(id) ?? [], check = at.open ? checkInstall(base, id, { parent: at.parent, slot: at.slot }) : null;
        const on = copies.length ? null : others.find(g => nodesOf(g.state.parts).some(n => n.id === id))?.name ?? null;
        return {
            id, name: ATTACHMENTS[id].name, current: at.part?.id === id, loose: copies[0] ?? null, count: copies.length, elsewhere: on,
            refusal: !at.open ? at.reason : check && !check.ok ? check.reason : null, source: sourceOf(id),
        };
    });
    const rank = (c: Candidate) => c.refusal ? 2 : c.loose || c.current ? 0 : 1;
    return list.sort((a, b) => rank(a) - rank(b));
}
/**
 * Which guns at the base an attachment item could go on (#28 M2-08, for the item details): each gun the part is made
 * for, with `reason` null when it fits the gun as built now (a part already in that slot would be replaced) and
 * otherwise what the gun lacks first (compat's wording: a base, handguard or barrel to install first, or the part
 * that stands where the opener goes). Guns that can never take it are left out.
 */
export function partFits(profile: Readonly<D.SaveDataV1>, id: string): { uid: string; gun: string; where: GunPlace; reason: string | null }[] {
    if (!D.isAttachment(id)) return [];
    // A factory magazine (M4-07) goes back on a gun of its own type whose factory magazine is out.
    const own = factoryMagOf(id);
    if (own) return benchGuns(profile).filter(g => g.id === own).map(g => ({ uid: g.uid, gun: g.name, where: g.where, reason: g.state.magOut ? null : '它的原厂弹匣还在枪上' }));
    return benchGuns(profile).flatMap((g): { uid: string; gun: string; where: GunPlace; reason: string | null }[] => {
        if (!eligible(g.id, id)) return [];
        const build = buildOf({ id: g.id, parts: g.state.parts, magOut: g.state.magOut }), check = checkInstall(build, id);
        if (check.ok) return [{ uid: g.uid, gun: g.name, where: g.where, reason: null }];
        // Occupied: the part would replace what sits there, so it fits.
        if (check.code === 'full') return [{ uid: g.uid, gun: g.name, where: g.where, reason: null }];
        // A missing slot names only openers a player can own (closedReason), as the workbench does.
        if (check.code === 'opener' || check.code === 'blocked') return [{ uid: g.uid, gun: g.name, where: g.where, reason: closedReason(build, ATTACHMENTS[id].mount) ?? check.reason }];
        if (check.code === 'needs') return [{ uid: g.uid, gun: g.name, where: g.where, reason: check.reason }];
        return [];
    });
}
/** Where a part not owned comes from (M2-13): the arms counter's basic stock, else finds in a raid. */
export function sourceOf(id: string): string {
    const a = ATTACHMENTS[id];
    if (D.MERCHANTS.arms.stock.includes(id)) return `修理铺有售 · ¥ ${a.buy}`;
    return a.buy > 450 ? '行动中的高风险处可能找到' : '行动中可能找到';
}

// ---------- edits ----------

/**
 * The edits a click on part `id` in `at` appends: take off what sits there (compat takes its children along), then
 * put on a loose copy, or preview one not owned by id. Re-mounting the children on the new part is a second step
 * (remount), since a part not owned gets its placeholder uid from the preview.
 */
export function replaceEdits(at: Position, id: string | null, loose: { uid: string } | null): GunEdit[] {
    const edits: GunEdit[] = at.part ? [{ kind: 'remove', uid: at.part.uid }] : [];
    if (id === null) return edits;
    const place = { parent: at.parent, slot: at.slot };
    edits.push(loose ? { kind: 'install', uid: loose.uid, at: place } : { kind: 'install', id, at: place });
    return edits;
}
/**
 * The edits the gun's mag position appends for its two factory cards (#28 M4-07): `empty` takes off what sits there
 * and, unless it is out already, the factory magazine too; `factory` takes off what sits there and, while the factory
 * magazine is out, puts one back: `ejected`, the one this preview took out, else a loose one of this gun type from the
 * stash, bag or safe, ordinary first and relief only on a relief gun. The reason instead when there is none.
 */
export function magEdits(profile: Readonly<D.SaveDataV1>, gun: Pick<BenchGun, 'id' | 'relief'>, build: Build, at: Position,
    to: 'empty' | 'factory', ejected: string | null): { edits: GunEdit[] } | { reason: string } {
    const edits: GunEdit[] = at.part ? [{ kind: 'remove', uid: at.part.uid }] : [];
    if (to === 'empty') return { edits: build.magOut ? edits : [...edits, { kind: 'eject' }] };
    if (!build.magOut) return { edits };
    const id = FACTORY_MAGS[gun.id]!, uid = ejected ?? looseParts(profile, new Set()).get(id)?.find(c => gun.relief || !c.relief)?.uid;
    return uid ? { edits: [...edits, { kind: 'install', uid }] } : { reason: `基地里没有能装回的${after(partDef(id).name)}。` };
}

/**
 * After `old` was replaced by the part `uid` in `build`, the edits that put `old`'s children back, onto the new part
 * where its slots take them, in tree order. `before` is the build that still held `old`. A child that does not fit
 * stays off (it went to the stash with `old`), and so do its own children. Children that were not owned (placeholders)
 * are previewed again by id.
 */
export function remountEdits(before: Build, old: Part, uid: string, build: Build): GunEdit[] {
    const edits: GunEdit[] = [], parts = [...build.parts], map = new Map([[old.uid, uid]]);
    const queue = before.parts.filter(p => p.parent === old.uid);
    while (queue.length) {
        const child = queue.shift()!, parent = map.get(child.parent!)!;
        const owned = !child.uid.startsWith('unowned-'), at = { parent, slot: child.slot };
        const check = checkInstall({ gun: build.gun, parts }, child.id, at);
        if (!check.ok) continue;
        const next = owned ? child.uid : `remount-${edits.length}`;
        edits.push(owned ? { kind: 'install', uid: child.uid, at } : { kind: 'install', id: child.id, at });
        parts.push({ uid: next, id: child.id, parent, slot: child.slot });
        // Only an owned child keeps a known uid for its own children; a placeholder's are left off.
        if (owned) { map.set(child.uid, child.uid); queue.push(...before.parts.filter(p => p.parent === child.uid)); }
    }
    return edits;
}

/**
 * The edits that build preset `parts` on gun `gunUid` (#28 M2-07): every root part comes off, then each preset part goes
 * on in tree order, taken from this gun first (a part already in its place stays there, net) and else from a loose
 * copy in the stash, bag or safe, ordinary before relief. Parts on other guns are never taken (M0 decision 6). The ones
 * with no copy to take are previewed by id and listed in `missing`; a preset with any is not applied (PLAN section 11).
 * Null when the gun is not at the base.
 */
export function presetEdits(profile: Readonly<D.SaveDataV1>, gunUid: string, parts: readonly PresetNode[]): { edits: GunEdit[]; missing: string[] } | null {
    const gun = locateGun(profile as D.SaveDataV1, gunUid);
    if (!gun) return null;
    const own = new Map<string, string[]>(), loose = looseParts(profile, new Set());
    for (const n of nodesOf(gun.state.parts)) own.set(n.id, [...own.get(n.id) ?? [], n.uid]);
    const edits: GunEdit[] = gun.state.parts.map(n => ({ kind: 'remove', uid: n.uid })), missing: string[] = [];
    let unowned = 0;
    const walk = (nodes: readonly PresetNode[], parent: string | null) => {
        for (const n of nodes) {
            const at = { parent, slot: n.slot }, uid = own.get(n.id)?.shift() ?? loose.get(n.id)?.shift()?.uid ?? null;
            if (uid) { edits.push({ kind: 'install', uid, at }); walk(n.children, uid); continue; }
            // planGunEdit names parts previewed by id unowned-1, unowned-2, ... in list order; children follow their parent.
            missing.push(n.id); edits.push({ kind: 'install', id: n.id, at }); walk(n.children, `unowned-${++unowned}`);
        }
    };
    walk(parts, null);
    return { edits, missing };
}

// ---------- scores ----------

/** The seven comparison rows (M0 review decision 6): higher is better except kg and noise. */
export interface BenchScores { fire: number; acc: number; ctl: number; hdl: number; feed: number; kg: number; noise: number }
export const SCORE_ROWS: readonly { key: keyof BenchScores; name: string; up: boolean }[] = [
    { key: 'fire', name: '火力', up: true }, { key: 'acc', name: '精度', up: true }, { key: 'ctl', name: '控制', up: true },
    { key: 'hdl', name: '操控', up: true }, { key: 'feed', name: '供弹', up: true }, { key: 'kg', name: '重量', up: false },
    { key: 'noise', name: '声音暴露', up: false },
];
/** 50 at the reference (r = 1), toward 100 as r falls and toward 0 as it grows, never reaching either. */
const rate = (r: number) => Math.round(100 / (1 + r ** 1.5));
/**
 * Scores from the effective stats (proposals, tuned with M4). Each is a ratio to a reference gun on a logistic curve,
 * so equal factors move a score about equally on any gun and no gun sits at 0. Fire is damage per second (no normal part
 * changes it); accuracy the aimed cone and the range; control the per-shot drift, bloom and recovery; handling the raise
 * time and sway; feed the capacity and reload time. Noise rises with the hearing radius, 50 at a factory gun. Kg is the
 * gun's weight.
 */
export function benchScores(s: GunStats, kg: number): BenchScores {
    const w = s.weapon, h = s.handling, cone = w.spread * h.hip * h.precise;
    return {
        fire: rate(250 * w.cooldown / (w.damage * w.pellets)),
        acc: rate(cone / .016 * (550 / w.range) ** .8),
        ctl: rate((h.kick / .01) ** .5 * (h.bloom / .012) ** .5 * (4 / h.recover) ** .3),
        hdl: rate(h.raise / .35 * (h.sway / 2) ** .3),
        feed: rate((20 / w.magazine) ** .5 * (w.reload / 2) ** .5),
        kg: Math.round(kg * 100) / 100,
        noise: 100 - rate(s.noise),
    };
}
/** The numbers behind the scores, for the comparison's details. Degrees for cones, seconds, rounds, world px. */
export interface BenchNumbers {
    damage: number; pellets: number; cooldown: number;
    aimed: number; hip: number; laserHip: number | null; range: number;
    kick: number; bloom: number; recover: number; raise: number; sway: number;
    magazine: number; reload: number; noise: number; suppressed: boolean;
    /** A laser or a light is installed: switched on, it gets the shooter noticed sooner (not part of the noise score). */
    devices: boolean;
}
const deg = (rad: number) => rad * 180 / Math.PI;
export function benchNumbers(s: GunStats): BenchNumbers {
    const w = s.weapon, h = s.handling;
    return {
        damage: w.damage, pellets: w.pellets, cooldown: w.cooldown,
        aimed: deg(w.spread * h.hip * h.precise), hip: deg(w.spread * h.hip), laserHip: s.laser ? deg(w.spread * s.laser.hip) : null, range: w.range,
        kick: deg(h.kick), bloom: deg(h.bloom), recover: h.recover, raise: h.raise, sway: h.sway,
        magazine: w.magazine, reload: w.reload, noise: Math.round(SURVIVAL.gunNoiseRange * s.noise), suppressed: s.suppressed, devices: false,
    };
}
/** Scores and numbers of a build in one go; `on` are the devices switched on. */
export function benchStats(build: Build, on: readonly string[] = []): { scores: BenchScores; numbers: BenchNumbers; stats: GunStats } {
    const stats = effectiveStats(build, on), kg = gunWeightOf(build);
    const numbers = benchNumbers(stats);
    numbers.devices = build.parts.some(p => ATTACHMENTS[p.id].quota !== null);
    return { scores: benchScores(stats, kg), numbers, stats };
}
/** gunWeight of a flat build: without a magazine the factory one's kg is off (M4-07). */
const gunWeightOf = (build: Build) => {
    const gun = build.gun as GunId, out = magless(build.magOut, build.parts) ? partDef(FACTORY_MAGS[gun]!).weight : 0;
    return Math.round(build.parts.reduce((kg, p) => kg + ATTACHMENTS[p.id].mods.weight, GUNS[gun].weight - out) * 1000) / 1000;
};

/** Dimensions the comparison names when the parts together reach a guardrail (stats.ts GUARDRAILS). */
export type Capped = 'precise' | 'spread' | 'kick' | 'raise' | 'reload' | 'range' | 'noise';
const CAPPED: readonly Capped[] = ['precise', 'spread', 'kick', 'raise', 'reload', 'range', 'noise'];
/** The dimensions whose combined factor the guardrail clamps on this build, i.e. some of the parts' gain is lost. */
export function capped(build: Build): Capped[] {
    const mods = build.parts.map(p => ATTACHMENTS[p.id].mods);
    return CAPPED.filter(d => {
        const raw = mods.reduce((f, m) => f * (m[d] ?? 1), 1), limit = GUARDRAILS[d];
        return d === 'range' ? raw > limit + 1e-12 : raw < limit - 1e-12;
    });
}

/** The stats of `build` with part `id` in `at` instead of what sits there (children kept where they still fit). */
export function candidateBuild(build: Build, at: Position, id: string): Build | null {
    if (!at.open) return null;
    const base = without(build, at), check = checkInstall(base, id, { parent: at.parent, slot: at.slot });
    if (!check.ok) return null;
    const uid = 'candidate', parts = [...base.parts, { uid, id, parent: at.parent, slot: at.slot }];
    if (at.part) {
        // Children of the replaced part move onto the candidate where it offers their slot (remountEdits' rule).
        const queue = build.parts.filter(p => p.parent === at.part!.uid), map = new Map([[at.part.uid, uid]]);
        while (queue.length) {
            const child = queue.shift()!, parent = map.get(child.parent!)!, place = { parent, slot: child.slot };
            if (!checkInstall({ gun: build.gun, parts }, child.id, place).ok) continue;
            parts.push({ uid: child.uid, id: child.id, parent, slot: child.slot }); map.set(child.uid, child.uid);
            queue.push(...build.parts.filter(p => p.parent === child.uid));
        }
    }
    return { ...build, parts };
}
