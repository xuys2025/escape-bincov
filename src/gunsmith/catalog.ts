/**
 * Gunsmith catalog (#28 M0-01/02/03): the 20 guns of docs/gunsmith/WEAPONS.md and the 100 attachments of
 * ATTACHMENTS.md as plain data, and the slot model they share. Pure rules: nothing in the game reads it until M1 (M0-04
 * first builds effective stats on it). Decisions and open questions are in docs/gunsmith/CONTRACTS.md.
 *
 * The old three guns (pistol, shotgun, carbine) copy today's domain WEAPONS and ITEMS and the shooting.ts handling
 * exactly, and mb4a1 copies the #39 sample rifle; tests/gunsmith-catalog.test.ts keeps them equal. The two docs fix
 * ids, names, brands, classes, ammo groups, factory capacity, tiers, eligibility and the handguard slot counts. Every
 * other number in this file is a proposal for the M0 review, to be tuned in M4.
 */
import type { WeaponDef } from '../domain';

export type GunId = 'pistol' | 'gb17' | 'mb1911' | 'pb226' | 'mpb5' | 'umpb45' | 'pb90' | 'vb9' | 'shotgun' | 'mb870'
    | 'mb1014' | 'carbine' | 'akb74' | 'akb103' | 'mb4a1' | 'augb' | 'svdb' | 'mb14' | 'mb700' | 'rpkb';
export type GunClass = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'dmr' | 'bolt' | 'lmg';
export const GUN_CLASS_NAMES: Readonly<Record<GunClass, string>> = {
    pistol: '手枪', smg: '冲锋枪', shotgun: '霰弹枪', rifle: '步枪', dmr: '精确步枪', bolt: '栓动步枪', lmg: '轻机枪',
};
/** Ammo groups (PLAN section 4): the three ammo items of today plus three that M3-05 adds as items. */
export type AmmoGroup = 'ammo9' | 'shell' | 'ammoR' | 'ammo45' | 'ammoPDW' | 'ammoHeavy';
/** Acquisition tier in WEAPONS.md: entry, common or rare. */
export type GunTier = 'entry' | 'common' | 'rare';

/**
 * A gun's factory handling: the fields of `Handling` in src/shooting.ts, which this module may not import (rule
 * modules import only each other). The catalog test assigns each type to the other, so the two cannot drift apart.
 */
export interface GunHandling {
    mode: 'semi' | 'auto';
    hip: number; precise: number; raise: number; sway: number;
    bloom: number; bloomMax: number; kick: number; kickMax: number; settle: number; recover: number;
}

/**
 * Where an attachment sits. Rails (micro to bipod) take generic parts; the other slots are positions that only the
 * guns an attachment lists have. A slot is native to the gun or opened by an installed parent (a base or handguard).
 */
export type Slot = 'micro' | 'top' | 'under' | 'side' | 'pistolSide' | 'bipod'
    | 'muzzle' | 'barrel' | 'handguard' | 'stock' | 'grip' | 'mag' | 'base';
export const SLOT_NAMES: Readonly<Record<Slot, string>> = {
    micro: '微型瞄具位', top: '顶部导轨', under: '下导轨', side: '侧导轨', pistolSide: '手枪侧挂位', bipod: '支撑脚架位',
    muzzle: '枪口位', barrel: '枪管位', handguard: '护木位', stock: '枪托位', grip: '握把位', mag: '供弹位', base: '基座位',
};
/** How many attachments each slot holds. */
export type Slots = Readonly<Partial<Record<Slot, number>>>;
/** A gun-level permission: long-range scopes need 'longScope', native on most rifles and granted by A07 on the carbine. */
export type Qualification = 'longScope';

export interface GunDef {
    id: GunId;
    cls: GunClass;
    tier: GunTier;
    /** Factory stats: `stats.name` is the display name and `stats.ammo` the ammo group. */
    stats: WeaponDef & { id: GunId; ammo: AmmoGroup };
    handling: GunHandling;
    /** As an item with nothing installed: footprint in cells, weight in kg, shop prices. */
    w: number; h: number; weight: number; buy: number; sell: number;
    slots: Slots;
    quals: readonly Qualification[];
}

export type Category = 'optic' | 'muzzle' | 'barrel' | 'handguard' | 'stock' | 'grip' | 'fore' | 'mag' | 'tactical' | 'base';
export const CATEGORY_NAMES: Readonly<Record<Category, string>> = {
    optic: '瞄具', muzzle: '枪口', barrel: '枪管模块', handguard: '护木', stock: '枪托', grip: '后握把',
    fore: '前握把和支撑', mag: '弹匣和供弹模块', tactical: '战术设备', base: '基座和转接件',
};
/** Fictional maker, shown only in the details (maintainer, 2026-10-12): no hidden quality bonus. */
export type Brand = 'beidi' | 'yanwan' | 'binji';
export const BRAND_NAMES: Readonly<Record<Brand, string>> = { beidi: '北堤', yanwan: '盐湾', binji: '滨机' };

/**
 * Multiplicative factors on the gun itself; absent means 1. Lower is better except `recover` and `range`. `bloom`
 * scales the per-shot bloom and its cap together, `kick` the per-shot drift and its cap. The RPG multipliers and the
 * #92 perks are not here: they apply once, on top of the result, in a later task.
 */
export interface Factors {
    hip?: number; precise?: number; raise?: number; sway?: number;
    bloom?: number; kick?: number; settle?: number; recover?: number;
    spread?: number; range?: number; reload?: number;
}
/** What an installed attachment does. Normal attachments never add damage or fire rate, so there is no field for them. */
export interface Modifiers extends Factors {
    /** Magazine size while installed (feed modules), replacing the factory capacity. */
    magazine?: number;
    /** Kg the installed part adds to the gun; negative when it is lighter than the factory part it replaces. */
    weight: number;
    /** Factor on the gunshot noise radius, today the one SURVIVAL.gunNoiseRange for every gun. */
    noise?: number;
    /** Cells the installed part adds to the gun's footprint (suppressors lengthen, a drum deepens). */
    grow?: { w: number; h: number };
    /** Factor on the precise-aim camera look-ahead, one per sight mode; M0-07 sets the cap these scale. */
    view?: readonly number[];
    /** Factors that hold only while the shooter stands still (a bipod); moving drops them at once. */
    braced?: Factors;
    /** Device effects, only while switched on: a laser narrows the hip cone within `range` px. */
    laser?: { hip: number; range: number };
    /** A light outlines interactables within `radius` px across `arc` radians. */
    light?: { radius: number; arc: number };
    /** Factor on how far enemies notice the shooter while a device is on. */
    spot?: number;
}

export interface AttachmentDef {
    /** O01 to A08, as in ATTACHMENTS.md. */
    id: string;
    /** The function name shown in lists and on the workbench; the brand stays in the details. */
    name: string;
    brand: Brand;
    cat: Category;
    /** The slot it sits in, and the slots it opens for its own children. */
    mount: Slot;
    provides: Slots;
    /** Guns it fits; null for rail parts, which fit any gun with the rail. */
    guns: readonly GunId[] | null;
    /** Parts that must already be installed when it goes on one of `on` (M03 needs B01 on G17 and P226). */
    needs: readonly { part: string; on: readonly GunId[] }[];
    grants: readonly Qualification[];
    requires: readonly Qualification[];
    /** Effect quota: one laser and one light per gun; a combiner uses both. */
    quota: 'laser' | 'light' | 'combiner' | null;
    /** As a loose item: weight in kg and shop prices. */
    weight: number; buy: number; sell: number;
    mods: Modifiers;
}

type Factory = Omit<WeaponDef, 'id' | 'name' | 'ammo'>;
const gun = (id: GunId, name: string, cls: GunClass, tier: GunTier, ammo: AmmoGroup,
    [w, h, weight, buy, sell]: readonly [number, number, number, number, number], stats: Factory, handling: GunHandling,
    slots: Slots, quals: readonly Qualification[] = []): GunDef =>
    ({ id, cls, tier, stats: { id, name, ammo, ...stats }, handling, w, h, weight, buy, sell, slots, quals });
const hd = (mode: GunHandling['mode'], hip: number, precise: number, raise: number, sway: number, bloom: number,
    bloomMax: number, kick: number, kickMax: number, settle: number, recover: number): GunHandling =>
    ({ mode, hip, precise, raise, sway, bloom, bloomMax, kick, kickMax, settle, recover });

/**
 * Table order follows WEAPONS.md. Rows read: [w, h, kg, buy, sell], factory stats, handling (mode, hip, precise,
 * raise, sway, bloom, bloomMax, kick, kickMax, settle, recover), native slots, native qualifications. For the new
 * guns the capacity, ammo group, class and tier come from WEAPONS.md; every other number is a proposal. They keep the
 * #39 steady set: a stock gun is accurate only once stopped and aimed, and leaves attachments room to help.
 */
export const GUNS: Readonly<Record<GunId, GunDef>> = {
    // Copied from domain WEAPONS/ITEMS and shooting.ts; the test keeps them equal.
    pistol: gun('pistol', '旧式手枪', 'pistol', 'entry', 'ammo9', [2, 1, .8, 320, 150],
        { magazine: 8, damage: 27, range: 440, cooldown: .29, reload: 1.25, pellets: 1, spread: .07, crit: .05 },
        hd('semi', 1.8, .22, .3, 1.8, .016, .07, .009, .05, .15, 5), { muzzle: 1, base: 1 }),
    // Proposal: 17 rounds and even handling; a little less punch than the heavy pistol.
    gb17: gun('gb17', 'G17 通用手枪', 'pistol', 'common', 'ammo9', [2, 1, .7, 560, 260],
        { magazine: 17, damage: 26, range: 450, cooldown: .26, reload: 1.4, pellets: 1, spread: .065, crit: .05 },
        hd('semi', 1.8, .22, .28, 1.7, .015, .07, .009, .05, .15, 5),
        { muzzle: 1, barrel: 1, grip: 1, mag: 1, micro: 1, pistolSide: 1 }),
    // Proposal: strong single shots from 7 rounds, for patient paced fire.
    mb1911: gun('mb1911', 'M1911 重型手枪', 'pistol', 'common', 'ammo45', [2, 1, 1, 620, 290],
        { magazine: 7, damage: 36, range: 450, cooldown: .36, reload: 1.5, pellets: 1, spread: .065, crit: .07 },
        hd('semi', 1.8, .22, .32, 1.8, .022, .08, .014, .06, .18, 4.5),
        { muzzle: 1, barrel: 1, grip: 1, mag: 1, base: 1, pistolSide: 1 }),
    // Proposal: steadier and heavier than the G17 (tighter cone, less recoil, slower raise).
    pb226: gun('pb226', 'P226 稳定手枪', 'pistol', 'common', 'ammo9', [2, 1, .9, 680, 320],
        { magazine: 15, damage: 27, range: 460, cooldown: .28, reload: 1.45, pellets: 1, spread: .055, crit: .05 },
        hd('semi', 1.7, .2, .32, 1.6, .013, .06, .008, .045, .14, 5.5),
        { muzzle: 1, barrel: 1, grip: 1, base: 1, pistolSide: 1 }),
    // Proposal: controllable automatic fire, weak at range.
    mpb5: gun('mpb5', 'MP5 近战冲锋枪', 'smg', 'common', 'ammo9', [3, 1, 2.4, 1500, 700],
        { magazine: 30, damage: 21, range: 480, cooldown: .085, reload: 2, pellets: 1, spread: .045, crit: .04 },
        hd('auto', 2.2, .25, .35, 1.9, .007, .07, .006, .06, .14, 4.5),
        { muzzle: 1, barrel: 1, handguard: 1, stock: 1, mag: 1, base: 1 }),
    // Proposal: slow rate and strong rounds; a slow reload and the weight are the price.
    umpb45: gun('umpb45', 'UMP45 重弹冲锋枪', 'smg', 'common', 'ammo45', [3, 1, 2.3, 1600, 750],
        { magazine: 25, damage: 29, range: 480, cooldown: .12, reload: 2.3, pellets: 1, spread: .045, crit: .05 },
        hd('auto', 2.2, .25, .38, 2, .01, .08, .009, .07, .16, 4.2),
        { muzzle: 1, barrel: 1, stock: 1, grip: 1, mag: 1, top: 1, under: 1, side: 1 }),
    // Proposal: 50 light rounds in a compact body; scarce ammo and low damage.
    pb90: gun('pb90', 'P90 紧凑冲锋枪', 'smg', 'rare', 'ammoPDW', [2, 1, 2.5, 2600, 1220],
        { magazine: 50, damage: 18, range: 500, cooldown: .075, reload: 2.4, pellets: 1, spread: .045, crit: .04 },
        hd('auto', 2.1, .25, .32, 1.8, .006, .07, .005, .05, .13, 4.8), { muzzle: 1, mag: 1, top: 1, side: 1 }),
    // Proposal: the highest short-burst output; eats ammo and blooms the most.
    vb9: gun('vb9', 'Vector 9mm 高速冲锋枪', 'smg', 'rare', 'ammo9', [2, 1, 2.6, 2400, 1130],
        { magazine: 25, damage: 20, range: 420, cooldown: .06, reload: 1.9, pellets: 1, spread: .05, crit: .04 },
        hd('auto', 2.3, .28, .3, 2, .01, .1, .006, .07, .15, 4), { muzzle: 1, top: 1, under: 1, side: 1 }),
    // Copied from domain WEAPONS/ITEMS and shooting.ts; the test keeps them equal.
    shotgun: gun('shotgun', '双管霰弹枪', 'shotgun', 'entry', 'shell', [3, 1, 2.7, 780, 370],
        { magazine: 2, damage: 15, range: 290, cooldown: .72, reload: 1.9, pellets: 6, spread: .27, crit: .03 },
        hd('semi', 1, .5, .25, 1.2, .04, .08, .03, .06, .25, 4), { muzzle: 1, base: 1 }),
    // Proposal: reliable at close range with a long pump between shots.
    mb870: gun('mb870', 'M870 泵动霰弹枪', 'shotgun', 'common', 'shell', [4, 1, 3.1, 1150, 540],
        { magazine: 6, damage: 15, range: 300, cooldown: .9, reload: 3, pellets: 6, spread: .25, crit: .03 },
        hd('semi', 1, .5, .28, 1.2, .035, .07, .028, .06, .3, 4),
        { muzzle: 1, barrel: 1, handguard: 1, stock: 1, grip: 1, mag: 1, base: 1 }),
    // Proposal: fast follow-up shots; heavy and burns shells.
    mb1014: gun('mb1014', 'M1014 半自动霰弹枪', 'shotgun', 'rare', 'shell', [4, 1, 3.4, 2200, 1030],
        { magazine: 7, damage: 14, range: 290, cooldown: .38, reload: 3.2, pellets: 6, spread: .27, crit: .03 },
        hd('semi', 1, .5, .3, 1.3, .045, .1, .03, .08, .25, 4),
        { muzzle: 1, barrel: 1, handguard: 1, stock: 1, grip: 1, mag: 1, top: 1 }),
    // Copied from domain WEAPONS/ITEMS and shooting.ts; the test keeps them equal. A07 grants its long-range scopes.
    carbine: gun('carbine', '半自动卡宾枪', 'rifle', 'entry', 'ammoR', [3, 1, 2.4, 1200, 580],
        { magazine: 12, damage: 39, range: 660, cooldown: .24, reload: 1.65, pellets: 1, spread: .035, crit: .08 },
        hd('semi', 2.2, .2, .4, 2, .014, .06, .012, .06, .18, 4.5), { muzzle: 1, barrel: 1, handguard: 1, base: 1 }),
    // Proposal: sustained mid-range fire; slow to raise.
    akb74: gun('akb74', 'AK-74 稳定步枪', 'rifle', 'common', 'ammoR', [4, 1, 3.1, 2000, 940],
        { magazine: 30, damage: 25, range: 620, cooldown: .1, reload: 2.3, pellets: 1, spread: .032, crit: .05 },
        hd('auto', 2.4, .22, .45, 2.2, .008, .07, .007, .07, .15, 4.2),
        { muzzle: 1, barrel: 1, handguard: 1, stock: 1, grip: 1, mag: 1, base: 1 }, ['longScope']),
    // Proposal: harder hits and a heavy climb in bursts.
    akb103: gun('akb103', 'AK-103 重型步枪', 'rifle', 'common', 'ammoR', [4, 1, 3.4, 2200, 1030],
        { magazine: 30, damage: 30, range: 640, cooldown: .11, reload: 2.4, pellets: 1, spread: .034, crit: .06 },
        hd('auto', 2.4, .22, .45, 2.2, .011, .09, .011, .1, .17, 4),
        { muzzle: 1, barrel: 1, handguard: 1, stock: 1, grip: 1, mag: 1, base: 1 }, ['longScope']),
    // The #39 sample rifle the maintainer playtested (SAMPLE_GUNS.m4a1 and its handling); the prices are proposals.
    mb4a1: gun('mb4a1', 'M4A1 模块步枪', 'rifle', 'common', 'ammoR', [4, 1, 2.9, 2300, 1080],
        { magazine: 30, damage: 24, range: 600, cooldown: .1, reload: 2.1, pellets: 1, spread: .03, crit: .05 },
        hd('auto', 2.4, .22, .4, 2.2, .009, .08, .008, .08, .15, 4),
        { muzzle: 1, barrel: 1, handguard: 1, stock: 1, grip: 1, mag: 1, top: 1 }, ['longScope']),
    // Proposal: small in the bag and quick to turn; a slow reload and a fixed stock.
    augb: gun('augb', 'AUG 紧凑步枪', 'rifle', 'common', 'ammoR', [3, 1, 3.2, 2500, 1180],
        { magazine: 30, damage: 25, range: 620, cooldown: .1, reload: 2.6, pellets: 1, spread: .03, crit: .05 },
        hd('auto', 2.3, .22, .36, 1.9, .009, .08, .008, .075, .15, 4.2),
        { muzzle: 1, mag: 1, top: 1, under: 1, side: 1 }, ['longScope']),
    // Proposal: a strong first shot at range; poor from the hip, slow to raise and to track.
    svdb: gun('svdb', 'SVD 精确步枪', 'dmr', 'rare', 'ammoHeavy', [5, 1, 4, 3200, 1500],
        { magazine: 10, damage: 52, range: 820, cooldown: .45, reload: 2.6, pellets: 1, spread: .025, crit: .1 },
        hd('semi', 3.6, .15, .55, 2.6, .02, .07, .02, .07, .22, 4), { muzzle: 1, top: 1, bipod: 1 }, ['longScope']),
    // Proposal: paced fire at middle to long range; strong recoil and heavy.
    mb14: gun('mb14', 'M14 半自动精确步枪', 'dmr', 'rare', 'ammoHeavy', [5, 1, 4.3, 3000, 1410],
        { magazine: 20, damage: 46, range: 760, cooldown: .3, reload: 2.5, pellets: 1, spread: .027, crit: .09 },
        hd('semi', 3.2, .17, .5, 2.4, .022, .08, .022, .08, .22, 4),
        { muzzle: 1, stock: 1, mag: 1, top: 1, bipod: 1 }, ['longScope']),
    // Proposal: the most accurate and hardest single shot, with a long bolt between shots.
    mb700: gun('mb700', 'M700 栓动步枪', 'bolt', 'rare', 'ammoHeavy', [5, 1, 3.8, 3400, 1600],
        { magazine: 5, damage: 80, range: 880, cooldown: 1.2, reload: 3, pellets: 1, spread: .02, crit: .12 },
        hd('semi', 4.2, .12, .55, 2.6, .03, .06, .02, .05, .5, 3.5),
        { muzzle: 1, barrel: 1, stock: 1, top: 1, bipod: 1 }, ['longScope']),
    // Proposal: suppressing fire from 40 rounds; heavy, slow and hungry.
    rpkb: gun('rpkb', 'RPK 支援机枪', 'lmg', 'common', 'ammoR', [5, 1, 4.8, 2800, 1320],
        { magazine: 40, damage: 26, range: 640, cooldown: .11, reload: 3.4, pellets: 1, spread: .034, crit: .05 },
        hd('auto', 2.6, .24, .55, 2.4, .008, .09, .008, .09, .18, 3.8),
        { muzzle: 1, handguard: 1, stock: 1, grip: 1, mag: 1, base: 1, bipod: 1 }, ['longScope']),
};

/** Loose attachments sell back for this share of the buy price, as weapons roughly do today (proposal). */
const SELL_SHARE = .45;
type Extra = Partial<Pick<AttachmentDef, 'provides' | 'needs' | 'grants' | 'requires' | 'quota'>>;
interface Draft { id: string; name: string; mount: Slot; guns: readonly GunId[] | null; weight: number; buy: number; mods: Partial<Modifiers>; extra: Extra }
/** One row: id, name, slot, guns (null for rail parts), loose kg, buy price, modifiers. `mods.weight` defaults to the loose kg. */
const p = (id: string, name: string, mount: Slot, guns: readonly GunId[] | null, weight: number, buy: number,
    mods: Partial<Modifiers> = {}, extra: Extra = {}): Draft => ({ id, name, mount, guns, weight, buy, mods, extra });
const section = (cat: Category, brand: Brand, drafts: readonly Draft[]): AttachmentDef[] => drafts.map(d => ({
    id: d.id, name: d.name, brand, cat, mount: d.mount, provides: d.extra.provides ?? {}, guns: d.guns,
    needs: d.extra.needs ?? [], grants: d.extra.grants ?? [], requires: d.extra.requires ?? [], quota: d.extra.quota ?? null,
    weight: d.weight, buy: d.buy, sell: Math.round(d.buy * SELL_SHARE), mods: { weight: d.weight, ...d.mods },
}));
const RIFLE_MUZZLE: readonly GunId[] = ['carbine', 'akb74', 'akb103', 'mb4a1', 'augb', 'rpkb'];
const PRECISION: readonly GunId[] = ['svdb', 'mb14', 'mb700'];
const AK: readonly GunId[] = ['akb74', 'akb103'];
const AK_FAMILY: readonly GunId[] = ['akb74', 'akb103', 'rpkb'];
const LONG = { requires: ['longScope'] } as const;
const UNDER_SIDE = (side: number): Extra => ({ provides: { under: 1, side } });

/**
 * The 100 attachments in ATTACHMENTS.md order. Every number is a proposal, except the slot counts the handguard rows
 * quote. Each value follows its row's benefit and cost; no single part goes past the plan's guardrails (at most 40%
 * better spread or recoil, handling time at least 65% of factory, at most +25% range, noise at least 40% of factory).
 * Combined clamping is M0-04's.
 */
export const ATTACHMENTS: Readonly<Record<string, AttachmentDef>> = Object.fromEntries([
    ...section('optic', 'beidi', [
        p('O01', '微型点瞄', 'micro', null, .05, 180, { raise: .85, precise: .92 }),
        p('O02', '微型稳瞄', 'micro', null, .08, 240, { precise: .8, raise: 1.05 }),
        p('O03', '开放红点', 'top', null, .06, 200, { raise: .85, precise: .9 }),
        p('O04', '封闭红点', 'top', null, .2, 280, { precise: .85, recover: 1.1 }),
        p('O05', '全息瞄具', 'top', null, .15, 320, { sway: .85, precise: .9, raise: 1.05 }),
        p('O06', '中距棱镜', 'top', null, .25, 380, { precise: .8, sway: .95, raise: 1.05, view: [1.25] }),
        p('O07', '中远距棱镜', 'top', null, .3, 450, { precise: .75, raise: 1.12, view: [1.45] }),
        p('O08', '轻型远距镜', 'top', null, .35, 620, { precise: .7, raise: 1.2, sway: 1.1, view: [1.7] }, LONG),
        p('O09', '稳定远距镜', 'top', null, .55, 820, { precise: .65, raise: 1.3, sway: 1.15, view: [2] }, LONG),
        p('O10', '近远双档镜', 'top', null, .45, 760, { precise: .72, raise: 1.18, view: [1, 1.7] }, LONG),
        p('O11', '中远双档镜', 'top', null, .5, 860, { precise: .7, raise: 1.22, view: [1.45, 1.85] }, LONG),
        p('O12', '轻型机械瞄具', 'top', null, .04, 90, { raise: .88, precise: .95 }),
    ]),
    ...section('muzzle', 'yanwan', [
        p('M01', '轻型消焰器', 'muzzle', ['pistol', 'gb17', 'pb226', 'mpb5', 'vb9'], .05, 90, { noise: .9, kick: .97 }),
        p('M02', '近战补偿器', 'muzzle', ['gb17', 'pb226', 'mpb5', 'vb9'], .08, 220, { bloom: .8, kick: .9, noise: 1.15 }),
        p('M03', '九系短消音器', 'muzzle', ['gb17', 'pb226', 'mpb5', 'vb9'], .2, 520, { noise: .5, raise: 1.1, grow: { w: 1, h: 0 } },
            { needs: [{ part: 'B01', on: ['gb17', 'pb226'] }] }),
        p('M04', '重弹消音器', 'muzzle', ['mb1911', 'umpb45'], .28, 560, { noise: .55, grow: { w: 1, h: 0 } },
            { needs: [{ part: 'B02', on: ['mb1911'] }] }),
        p('M05', '步枪消焰器', 'muzzle', RIFLE_MUZZLE, .08, 110, { noise: .9, bloom: .96 }),
        p('M06', '步枪制退器', 'muzzle', RIFLE_MUZZLE, .12, 260, { bloom: .8, kick: .75, noise: 1.2 }),
        p('M07', '步枪紧凑消音器', 'muzzle', RIFLE_MUZZLE, .35, 680, { noise: .55, raise: 1.12, grow: { w: 1, h: 0 } }),
        p('M08', '精确枪消音器', 'muzzle', PRECISION, .55, 760, { noise: .5, grow: { w: 1, h: 0 } }),
        p('M09', '精确枪制退器', 'muzzle', PRECISION, .15, 300, { recover: 1.3, kick: .8, noise: 1.2 }),
        p('M10', '通用霰弹收束器', 'muzzle', ['mb870', 'mb1014'], .1, 160, { spread: .78 }),
        p('M11', '双管收束组', 'muzzle', ['shotgun'], .15, 180, { spread: .72 }),
        p('M12', '轻高速消音器', 'muzzle', ['pb90'], .25, 900, { noise: .5, grow: { w: 1, h: 0 } }),
    ]),
    // Barrels, handguards, stocks, grips and magazines replace a factory part, so their installed weight may be negative.
    ...section('barrel', 'binji', [
        p('B01', '九系精瞄枪管组', 'barrel', ['gb17', 'pb226'], .12, 260, { precise: .85, raise: 1.06, weight: .05 }),
        p('B02', '重型手枪接口组', 'barrel', ['mb1911'], .18, 260, { precise: .9, weight: .12 }),
        p('B03', 'MP 短枪管组', 'barrel', ['mpb5'], .15, 240, { raise: .85, sway: .9, range: .88, weight: -.05 }),
        p('B04', 'UMP 稳定枪管组', 'barrel', ['umpb45'], .3, 300, { precise: .85, bloom: .9, raise: 1.1, weight: .15 }),
        p('B05', '泵动短枪管组', 'barrel', ['mb870'], .3, 220, { raise: .85, spread: 1.15, weight: -.1 }),
        p('B06', '半自动收束枪管组', 'barrel', ['mb1014'], .45, 380, { spread: .82, raise: 1.1, weight: .2 }),
        p('B07', 'AK 紧凑枪管组', 'barrel', AK, .35, 300, { raise: .85, sway: .9, range: .9, bloom: 1.1, weight: -.1 }),
        p('B08', 'AR 精确枪管组', 'barrel', ['mb4a1'], .5, 520, { precise: .85, range: 1.15, raise: 1.1, weight: .2 }),
        p('B09', '卡宾精确枪管组', 'barrel', ['carbine'], .45, 360, { precise: .85, sway: 1.1, weight: .1 }),
        p('B10', '栓动轻型枪管组', 'barrel', ['mb700'], .5, 480, { raise: .85, precise: 1.06, weight: -.35 }),
    ]),
    ...section('handguard', 'binji', [
        p('H01', 'AR 短导轨护木', 'handguard', ['mb4a1'], .25, 240, { bloom: .97, weight: .05 }, UNDER_SIDE(1)),
        p('H02', 'AR 长导轨护木', 'handguard', ['mb4a1'], .45, 380, { bloom: .92, sway: .95, raise: 1.08, weight: .3 }, UNDER_SIDE(2)),
        p('H03', 'AK 轻木护木', 'handguard', AK, .2, 90, { raise: .9, weight: -.1 }),
        p('H04', 'AK 导轨护木', 'handguard', AK, .4, 300, { weight: .25 }, UNDER_SIDE(2)),
        p('H05', '卡宾导轨护木', 'handguard', ['carbine'], .35, 280, { weight: .2 }, UNDER_SIDE(1)),
        p('H06', 'MP 紧凑护木', 'handguard', ['mpb5'], .15, 160, { weight: .02 }, { provides: { side: 1 } }),
        p('H07', 'MP 扩展护木', 'handguard', ['mpb5'], .3, 260, { weight: .18 }, UNDER_SIDE(2)),
        p('H08', '泵动导轨护木', 'handguard', ['mb870'], .3, 240, { reload: 1.08, weight: .15 }, UNDER_SIDE(1)),
        p('H09', '半自动稳固护木', 'handguard', ['mb1014'], .35, 320, { bloom: .9, raise: 1.06, weight: .2 }, UNDER_SIDE(1)),
        p('H10', '支援导轨护木', 'handguard', ['rpkb'], .55, 360, { bloom: .9, kick: .92, weight: .45 }, UNDER_SIDE(2)),
    ]),
    ...section('stock', 'binji', [
        p('S01', 'AR 轻托', 'stock', ['mb4a1'], .25, 220, { raise: .85, weight: -.15 }),
        p('S02', 'AR 稳定托', 'stock', ['mb4a1'], .5, 340, { bloom: .8, kick: .85, raise: 1.1, weight: .25 }),
        p('S03', 'AK 紧凑托', 'stock', AK, .3, 260, { sway: .85, precise: 1.08, weight: -.2 }),
        p('S04', 'AK 实心托', 'stock', AK_FAMILY, .55, 320, { bloom: .85, kick: .88, precise: .95, weight: .2 }),
        p('S05', 'MP 伸缩托', 'stock', ['mpb5'], .3, 240, { raise: .85, bloom: .97, weight: -.05 }),
        p('S06', 'UMP 轻型托', 'stock', ['umpb45'], .25, 220, { raise: .88, bloom: .97, weight: -.2 }),
        p('S07', '泵动缓冲托', 'stock', ['mb870'], .5, 260, { recover: 1.25, settle: .85, weight: .2 }),
        p('S08', '半自动控制托', 'stock', ['mb1014'], .5, 340, { bloom: .82, raise: 1.1, weight: .15 }),
        p('S09', '精确支撑托', 'stock', ['mb14'], .6, 420, { precise: .85, sway: 1.12, weight: .15 }),
        p('S10', '栓动轻便托', 'stock', ['mb700'], .35, 380, { raise: .85, precise: .97, weight: -.25 }),
    ]),
    ...section('grip', 'binji', [
        p('P01', 'AR 轻握把', 'grip', ['mb4a1'], .06, 120, { raise: .9, kick: .98, weight: -.03 }),
        p('P02', 'AR 稳握把', 'grip', ['mb4a1'], .15, 280, { recover: 1.2, settle: .9, weight: .08 }),
        p('P03', 'AK 防滑握把', 'grip', AK_FAMILY, .12, 180, { recover: 1.15, weight: .05 }),
        p('P04', 'AK 轻木握把', 'grip', AK_FAMILY, .08, 80, { recover: 1.03, weight: -.03 }),
        p('P05', 'UMP 操控握把', 'grip', ['umpb45'], .1, 300, { sway: .85, weight: .02 }),
        p('P06', '霰弹控制握把', 'grip', ['mb870', 'mb1014'], .14, 200, { bloom: .88, sway: .92, raise: 1.06, weight: .06 }),
        p('P07', '九系防滑握片', 'grip', ['gb17', 'pb226'], .04, 140, { recover: 1.15, bloom: .92, weight: .03 }),
        p('P08', '单排轻握片', 'grip', ['mb1911'], .03, 140, { raise: .88, weight: -.05 }),
    ]),
    ...section('fore', 'binji', [
        p('F01', '短垂直前握把', 'under', null, .08, 120, { bloom: .9, kick: .92 }),
        p('F02', '长垂直前握把', 'under', null, .12, 200, { bloom: .82, kick: .85, raise: 1.1 }),
        p('F03', '斜角前握把', 'under', null, .08, 220, { sway: .82 }),
        p('F04', '轻型挡手', 'under', null, .04, 90, { raise: .9, kick: .97 }),
        p('F05', '紧凑前握把', 'under', null, .1, 260, { bloom: .86, kick: .88 }),
        p('F06', '腰射前握把', 'under', null, .09, 240, { hip: .8 }),
        p('F07', '重型稳定握把', 'under', null, .3, 420, { bloom: .7, kick: .72, raise: 1.15 }),
        p('F08', '折叠支撑脚架', 'bipod', null, .45, 380, { braced: { precise: .75, recover: 1.35 } }),
    ]),
    ...section('mag', 'binji', [
        p('G01', 'G17 加长匣', 'mag', ['gb17'], .12, 160, { magazine: 24, reload: 1.15, weight: .08 }),
        p('G02', '单排加长匣', 'mag', ['mb1911'], .1, 150, { magazine: 10, reload: 1.12, weight: .06 }),
        p('G03', 'MP 快换匣', 'mag', ['mpb5'], .2, 180, { magazine: 25, reload: .8, weight: -.02 }),
        p('G04', 'UMP 扩容匣', 'mag', ['umpb45'], .3, 240, { magazine: 35, reload: 1.15, weight: .15 }),
        p('G05', 'P90 轻便匣', 'mag', ['pb90'], .15, 260, { magazine: 30, reload: .75, weight: -.15 }),
        p('G06', '泵动扩展供弹组', 'mag', ['mb870'], .3, 220, { magazine: 8, reload: 1.3, weight: .25 }),
        p('G07', '半自动扩展供弹组', 'mag', ['mb1014'], .35, 280, { magazine: 9, reload: 1.25, weight: .25 }),
        p('G08', 'AK-74 扩容匣', 'mag', ['akb74'], .35, 260, { magazine: 45, reload: 1.15, weight: .15 }),
        p('G09', 'AK 重弹鼓组', 'mag', ['akb103', 'rpkb'], 1.1, 620, { magazine: 60, reload: 1.35, raise: 1.12, weight: .9, grow: { w: 0, h: 1 } }),
        p('G10', '模块步枪快换匣', 'mag', ['mb4a1', 'augb'], .2, 200, { magazine: 20, reload: .8, weight: -.05 }),
        p('G11', 'M14 扩容匣', 'mag', ['mb14'], .35, 300, { magazine: 25, reload: 1.12, weight: .15 }),
        p('G12', '支援轻匣', 'mag', ['rpkb'], .3, 220, { magazine: 30, reload: .8, weight: -.35 }),
    ]),
    ...section('tactical', 'yanwan', [
        p('T01', '近距激光器', 'side', null, .1, 300, { laser: { hip: .7, range: 240 }, spot: 1.15 }, { quota: 'laser' }),
        p('T02', '轻量激光器', 'side', null, .04, 200, { laser: { hip: .82, range: 170 }, spot: 1.1 }, { quota: 'laser' }),
        p('T03', '远距指示器', 'side', null, .22, 460, { laser: { hip: .72, range: 420 }, spot: 1.2, raise: 1.06 }, { quota: 'laser' }),
        p('T04', '微型激光器', 'pistolSide', null, .05, 220, { laser: { hip: .82, range: 200 }, spot: 1.1 }, { quota: 'laser' }),
        p('T05', '近距泛光灯', 'side', null, .12, 220, { light: { radius: 170, arc: 1.6 }, spot: 1.2 }, { quota: 'light' }),
        p('T06', '远距窄光灯', 'side', null, .2, 320, { light: { radius: 300, arc: .6 }, spot: 1.15 }, { quota: 'light' }),
        p('T07', '轻型工作灯', 'side', null, .06, 110, { light: { radius: 120, arc: 1 }, spot: 1.1 }, { quota: 'light' }),
        p('T08', '微型组合器', 'pistolSide', null, .1, 380,
            { laser: { hip: .85, range: 200 }, light: { radius: 140, arc: 1.1 }, spot: 1.15 }, { quota: 'combiner' }),
        p('T09', '通用组合器', 'side', null, .2, 520,
            { laser: { hip: .78, range: 300 }, light: { radius: 200, arc: 1.2 }, spot: 1.2 }, { quota: 'combiner' }),
        p('T10', '远距组合器', 'side', null, .3, 680,
            { laser: { hip: .72, range: 420 }, light: { radius: 300, arc: .6 }, spot: 1.25, raise: 1.08 }, { quota: 'combiner' }),
    ]),
    // A base opens a micro or top slot and does nothing else for the shot; A07 also qualifies the carbine for long scopes.
    ...section('base', 'binji', [
        p('A01', '旧手枪微型基座', 'base', ['pistol'], .06, 60, {}, { provides: { micro: 1 } }),
        p('A02', 'P226 微型基座', 'base', ['pb226'], .06, 60, {}, { provides: { micro: 1 } }),
        p('A03', '单排微型基座', 'base', ['mb1911'], .06, 60, {}, { provides: { micro: 1 } }),
        p('A04', 'MP 顶部基座', 'base', ['mpb5'], .12, 80, { raise: 1.05 }, { provides: { top: 1 } }),
        p('A05', '双管顶部基座', 'base', ['shotgun'], .1, 70, {}, { provides: { top: 1 } }),
        p('A06', '泵动顶部基座', 'base', ['mb870'], .1, 70, {}, { provides: { top: 1 } }),
        p('A07', '卡宾顶部基座', 'base', ['carbine'], .12, 90, {}, { provides: { top: 1 }, grants: ['longScope'] }),
        p('A08', 'AK 侧置基座', 'base', AK_FAMILY, .15, 90, {}, { provides: { top: 1 } }),
    ]),
].map(def => [def.id, def]));
