/**
 * 老栓精工 (#28 M4-09, #155, maintainer 2026-10-30): 老栓 makes the premium parts to order, on the spot. He takes orders
 * once the ledger quest is done and the workbench is built to level 3. Each part takes one of the ordinary parts it is
 * made from (catalog PREMIUM_BASES) as the work's base, one 精工件坯 and the cash of its catalog price, and goes into
 * the stash. No shelf sells them and no raid holds them. Pure rules over a profile and an expansion; the callers apply
 * them to a draft and commit it whole (hideout-runtime, ui.ts).
 */
import * as D from '../domain';
import type { ExpansionState } from '../expansion-state';
import { ATTACHMENTS, PREMIUM_BASES, isPremium } from './catalog';

/** The material each order takes one of; found only on leaders and at flooded spots (PREMIUM_BLANKS). */
export const PREMIUM_BLANK = 'premiumBlank';
/**
 * Where blanks come from, each on a stream of its own so nothing else in a raid changes: a valuable left at a flooded
 * spot is one with this chance (building-world buildingRunConfig, after the gunsmith finds), and a leader's body holds
 * one with this chance (enemy-armory leaderBlank).
 */
export const PREMIUM_BLANKS = { flooded: 1 / 10, leader: 1 / 2 } as const;
/** What opens the orders: this radio quest done and the workbench at this level. */
export const PREMIUM_QUEST = 'ledger';
export const PREMIUM_WORKBENCH = 3;
/** The parts 老栓 makes, in catalog order. */
export const PREMIUM_IDS: readonly string[] = Object.keys(ATTACHMENTS).filter(isPremium);
/** What 老栓 asks for the work: the part's catalog price. */
export const premiumPrice = (id: string) => ATTACHMENTS[id].buy;

/** Why 老栓 takes no orders yet, or null when he does. */
/** The base as the rules and the panels read it: the workbench level is all that matters here. */
type BaseOf = { base: { facilities: { workbench: number } } };
export function premiumLock(profile: Pick<D.SaveDataV1, 'quests'>, state: BaseOf): string | null {
    if (profile.quests[PREMIUM_QUEST] !== true) return '做完「未归的第七艘船」后，老栓才接精工定制。';
    if (state.base.facilities.workbench < PREMIUM_WORKBENCH) return '工作台升到 3 级后，老栓才接精工定制。';
    return null;
}

const pool = (profile: D.SaveDataV1) => [profile.stash, profile.bag, profile.safe];
/** The loose ordinary parts `id` can be made from at the base: no relief one, the cheapest first, stash before bag before safe. */
export function premiumBases(profile: D.SaveDataV1, id: string): D.Item[] {
    const bases = PREMIUM_BASES[id] ?? [];
    return pool(profile).flatMap(inv => inv.items.filter(i => bases.includes(i.id) && !i.relief))
        .sort((a, b) => ATTACHMENTS[a.id].buy - ATTACHMENTS[b.id].buy);
}
/** The blanks at the base that an order can use (no relief ones). */
export const premiumBlanks = (profile: D.SaveDataV1) => pool(profile).flatMap(inv => inv.items).filter(i => i.id === PREMIUM_BLANK && !i.relief).reduce((n, i) => n + i.qty, 0);

export type PremiumRefusal = 'rule' | 'locked' | 'materials' | 'funds' | 'space';
/**
 * Make `id` on `profile` (a draft): take the cheapest base, one blank and the price; put the part in the stash. Every
 * change or none: the reason it cannot, else null. Only at the base, outside a raid.
 */
export function craftPremium(profile: D.SaveDataV1, state: ExpansionState, id: string): PremiumRefusal | null {
    if (!isPremium(id) || profile.activeRun || state.base.location !== 'base') return 'rule';
    if (premiumLock(profile, state)) return 'locked';
    const base = premiumBases(profile, id)[0];
    if (!base || premiumBlanks(profile) < 1) return 'materials';
    if (profile.cash < premiumPrice(id)) return 'funds';
    const [stash, bag, safe] = pool(profile).map(inv => structuredClone(inv));
    for (const inv of [stash, bag, safe]) inv.items = inv.items.filter(i => i.uid !== base.uid);
    // One blank, from the first stack that holds one.
    const stack = [stash, bag, safe].flatMap(inv => inv.items.filter(i => i.id === PREMIUM_BLANK && !i.relief).map(i => ({ inv, i })))[0];
    stack.i.qty--;
    if (!stack.i.qty) stack.inv.items = stack.inv.items.filter(i => i !== stack.i);
    if (D.addItem(stash, id, 1)) return 'space';
    Object.assign(profile, { stash, bag, safe, cash: profile.cash - premiumPrice(id) });
    return null;
}

/** The list's opening line while 老栓 takes no orders, and once he does. */
export const PREMIUM_LOCKED_NOTE = '能做 20 件精品配件：瞄具、前握把、组合器，以及各枪族的枪口、枪托、握把和护木。';
export const PREMIUM_OPEN_NOTE = '交一件同位置的普通配件当底料、一份精工件坯和现金，当场做好放进仓库；底料用最便宜的那件。';
/** What a refused order tells the player (the hideout Runtime's message). */
export const PREMIUM_REFUSALS: Readonly<Record<Exclude<PremiumRefusal, 'locked'>, string>> = {
    rule: '现在不能定制。', materials: '缺少底料或精工件坯。', funds: '现金不够。', space: '仓库放不下成品，先腾出位置。',
};

/** One line of 老栓's order list: the part, the guns it fits, the base he would take, and why it cannot be made now. */
export interface PremiumRow { id: string; name: string; guns: string; base: string | null; bases: string; price: number; mine: boolean; why: string | null }
/**
 * 老栓's order list for the panels (#28 M4-09): why he takes none yet, the blanks at hand, and a row per part, those that
 * fit a gun the player holds first, then catalog order.
 */
export function premiumOrders(profile: D.SaveDataV1, state: BaseOf): { lock: string | null; blanks: number; rows: PremiumRow[] } {
    const blanks = premiumBlanks(profile), lock = premiumLock(profile, state);
    const held = new Set([profile.equipment.weapon, ...[profile.stash, profile.bag, profile.safe].flatMap(inv => inv.items.map(i => i.id))].filter(id => !!id && D.isGun(id)));
    const rows = PREMIUM_IDS.map(id => {
        const a = ATTACHMENTS[id], guns = (a.guns ?? []).map(g => D.ITEMS[g].short), base = premiumBases(profile, id)[0];
        const why = lock ?? (!base ? '缺底料' : blanks < 1 ? '缺精工件坯' : profile.cash < premiumPrice(id) ? '现金不够' : null);
        return { id, name: a.name, guns: a.guns ? guns.join('、') : '通用', base: base ? D.ITEMS[base.id].name : null,
            bases: PREMIUM_BASES[id].map(b => D.ITEMS[b].name).join('、'), price: premiumPrice(id),
            mine: !a.guns ? held.size > 0 : a.guns.some(g => held.has(g)), why };
    });
    return { lock, blanks, rows: [...rows.filter(r => r.mine), ...rows.filter(r => !r.mine)] };
}
