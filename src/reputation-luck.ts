import * as D from './domain';
import { entityUid, rpgEnabled, type Attribute, type ExpansionState } from './expansion-state';
import { payMaterials } from './base';
import { rewardAttribute } from './rpg';

export function reputationTier(value: number): '敌对' | '冷淡' | '中立' | '友好' | '信赖' {
    return value <= -50 ? '敌对' : value <= -10 ? '冷淡' : value < 30 ? '中立' : value < 70 ? '友好' : '信赖';
}
export function factionAccess(value: number, tier: 0 | 1 | 2 = 0): boolean {
    return value > -50 && (tier === 0 || value >= (tier === 1 ? 30 : 70));
}
export function reputationPrice(price: number, value: number): number {
    const factor = value <= -10 ? 1.1 : value >= 70 ? .9 : value >= 30 ? .95 : 1;
    return price > 0 ? Math.max(1, Math.round(price * factor)) : 0;
}
/** Generic configuration only. Existing public merchants/quests have no invented faction. */
export interface AwardDefinition {
    id: string; cash: number; needs: { id: string; qty: number }[];
    reputation: Record<string, number>; attributes: Attribute[]; luck: -1 | 0 | 1;
}
export function applyAward(profile: D.SaveDataV1, state: ExpansionState, award: AwardDefinition): boolean {
    if (!rpgEnabled(state) || profile.activeRun || state.base.location !== 'base' || state.awards!.includes(award.id)) return false;
    if (!payMaterials(profile, { cash: 0, items: award.needs })) return false;
    profile.cash += award.cash;
    for (const [faction, delta] of Object.entries(award.reputation)) state.growth.reputation[faction] = Math.max(-100, Math.min(100, (state.growth.reputation[faction] ?? 0) + delta));
    award.attributes.forEach(attribute => rewardAttribute(state, attribute));
    state.growth.luck = Math.max(-3, Math.min(5, state.growth.luck + award.luck)); state.awards!.push(award.id); return true;
}
export const effectiveLuck = (state: ExpansionState) => Math.max(-3, Math.min(5, state.growth.luck + state.body.luckEffect
    + (state.charm?.id === 'luckyCharm' ? 1 : state.charm?.id === 'unluckyCharm' ? -1 : 0)));
function returnCharm(item: D.Item, inventory: D.Inventory): boolean {
    for (let y = 0; y < inventory.h; y++) for (let x = 0; x < inventory.w; x++) if (D.fits(inventory, item.id, x, y)) {
        inventory.items.push({ ...item, x, y }); return true;
    }
    return false;
}
export function equipCharm(profile: D.SaveDataV1, state: ExpansionState, uid: string, source: 'stash' | 'bag' | 'safe'): boolean {
    if (!rpgEnabled(state) || !['stash', 'bag', 'safe'].includes(source) || state.raid && source === 'stash') return false;
    const inventory = state.raid ? state.raid.loadout[source as 'bag' | 'safe'] : profile[source];
    const item = inventory.items.find(i => i.uid === uid && D.ITEMS[i.id].kind === 'accessory' && !i.relief);
    if (!item) return false;
    const trial = structuredClone(inventory); trial.items = trial.items.filter(i => i.uid !== uid);
    if (state.charm && !returnCharm(state.charm, trial)) return false;
    Object.assign(inventory, trial); state.charm = { uid: item.uid, id: item.id, qty: 1, x: 0, y: 0 }; return true;
}
export function unequipCharm(profile: D.SaveDataV1, state: ExpansionState): boolean {
    if (!state.charm) return false;
    const destination = state.raid?.loadout.bag ?? profile.stash;
    if (!returnCharm(state.charm, destination)) return false;
    state.charm = null; return true;
}
type GeneratedItem = { id: string; qty: number; protected?: boolean; key?: string };
/** Exactly one outcome per original generation unit; never called on reopened containers. */
export function rollLuckUnit(items: readonly GeneratedItem[], luck: number, random: () => number): GeneratedItem[] {
    const result = structuredClone([...items]);
    if (luck > 1 && random() < .02 * (luck - 1)) result.push({ id: random() < .5 ? 'watch' : 'pearl', qty: 1 });
    else if (luck < 1 && random() < .02 * (1 - luck)) {
        const originalCount = result.reduce((n, i) => n + i.qty, 0);
        const candidate = result.find(i => !i.protected && originalCount > 1);
        if (candidate) { candidate.qty--; if (!candidate.qty) result.splice(result.indexOf(candidate), 1); }
    }
    return result;
}
export function luckInventory(state: ExpansionState, mapId: string, inventory: D.Inventory, at: { x: number; y: number }, protectedUnit = false): void {
    const raid = state.raid!, random = D.seededRandom(raid.rng), luck = effectiveLuck(state);
    const original = inventory.items.map(i => ({ id: i.id, qty: i.qty, key: i.uid, protected: protectedUnit || !!i.relief || ['sample', 'ledger', 'scrap', 'wire', 'fuse'].includes(i.id) }));
    const result = rollLuckUnit(original, luck, random); raid.rng = random.getState();
    if (result.length > original.length) {
        const extra = result.at(-1)!;
        if (D.addItem(inventory, extra.id, extra.qty, false, false, true, () => entityUid(raid, raid.nextEntity++))) raid.maps[mapId].loot.push({ uid: entityUid(raid, raid.nextEntity++), id: extra.id, qty: 1, relief: false, x: at.x, y: at.y, ...D.factoryGun(extra.id) });
    } else {
        for (const generated of original) {
            const remaining = result.find(i => i.key === generated.key), difference = generated.qty - (remaining?.qty ?? 0);
            if (difference > 0) { const item = inventory.items.find(i => i.uid === generated.key)!; item.qty -= difference; if (!item.qty) inventory.items = inventory.items.filter(i => i !== item); break; }
        }
    }
}
export function initialLuck(state: ExpansionState): void {
    const raid = state.raid!, luck = effectiveLuck(state);
    if (raid.eventRolled) return;
    for (const [mapId, layer] of Object.entries(raid.maps)) {
        const originalLoot = [...layer.loot];
        for (const loot of originalLoot) {
            const random = D.seededRandom(raid.rng), result = rollLuckUnit([{ id: loot.id, qty: loot.qty,
                protected: loot.relief || ['sample', 'ledger', 'scrap', 'wire', 'fuse'].includes(loot.id) || mapId === raid.currentMap && Math.hypot(loot.x - raid.player.x, loot.y - raid.player.y) < 240 }], luck, random);
            raid.rng = random.getState(); loot.qty = result[0].qty;
            if (result.length === 2) layer.loot.push({ uid: entityUid(raid, raid.nextEntity++), id: result[1].id, qty: 1, relief: false, x: loot.x, y: loot.y, ...D.factoryGun(result[1].id) });
        }
        for (const container of layer.containers) luckInventory(state, mapId, container.inventory, container, mapId === raid.currentMap && Math.hypot(container.x - raid.player.x, container.y - raid.player.y) < 240);
    }
    if (!raid.eventRolled) {
        const random = D.seededRandom(raid.rng), chance = luck === 1 ? .002 : .01 * Math.abs(luck - 1);
        raid.mapEvent = random() < chance ? luck === 1 ? 'neutral' : luck > 1 ? 'good' : 'bad' : 'none'; raid.rng = random.getState(); raid.eventRolled = true;
    }
}
