import * as D from './domain';

export type Merchant = keyof typeof D.MERCHANTS;
export type ShopSource = 'merchant' | 'buy' | 'sell' | 'stash';
export interface ShopCart {
    merchant: Merchant;
    original: string;
    catalog: D.Inventory;
    buy: D.Inventory;
    sell: D.Inventory;
    stash: D.Inventory;
}
export function merchantStock(merchant: Merchant, rpg = false): string[] {
    return [...D.MERCHANTS[merchant].stock, ...(rpg ? merchant === 'arms' ? ['cloth'] : ['analgesic', 'focus'] : [])];
}
export function createCart(save: D.SaveDataV1, merchant: Merchant, rpg = false): ShopCart {
    const catalog = D.createInventory(6, 5);
    for (const id of merchantStock(merchant, rpg)) D.addItem(catalog, id, D.buyQuantity(id));
    return { merchant, original: JSON.stringify(save.stash), catalog, buy: D.createInventory(4, 3), sell: D.createInventory(4, 3), stash: structuredClone(save.stash) };
}
export const shopInventory = (cart: ShopCart, source: ShopSource) => source === 'merchant' ? cart.catalog : cart[source];
const positions = (inv: D.Inventory) => JSON.stringify({ ...inv, items: [...inv.items].sort((a, b) => a.uid.localeCompare(b.uid)) });
export const cartDirty = (cart: ShopCart) => !!(cart.buy.items.length || cart.sell.items.length || positions(cart.stash) !== positions(JSON.parse(cart.original)));
export function shopPlacementError(cart: ShopCart, from: ShopSource, to: ShopSource, uid: string, x: number, y: number): string | null {
    const item = shopInventory(cart, from)?.items.find(i => i.uid === uid);
    if (!item) return '请重新选择物品。';
    if (from === 'buy' && to === 'merchant') return null;
    if (!((from === 'merchant' && to === 'buy') || (from === 'stash' && to === 'sell') || (from === 'sell' && to === 'stash') || (from === to && from !== 'merchant'))) return '先放入待买或待卖区，再统一结算。';
    if (to === 'sell' && (item.relief || D.ITEMS[item.id].sell <= 0)) return '这件物品不可出售。';
    return D.fits(shopInventory(cart, to), item.id, x, y, from === to ? uid : undefined, !!item.rotated) ? null : '请选空格，待买按包、待卖按整组放置。';
}
/** Only edits the disposable cart. Owned goods and money remain untouched. */
export function moveShopItem(cart: ShopCart, from: ShopSource, to: ShopSource, uid: string, x: number, y: number): boolean {
    if (shopPlacementError(cart, from, to, uid, x, y)) return false;
    const source = shopInventory(cart, from), item = source.items.find(i => i.uid === uid)!;
    if (from === 'merchant') {
        const pack = D.createInventory(6, 5); D.addItem(pack, item.id, D.buyQuantity(item.id));
        cart.buy.items.push({ ...pack.items[0], x, y });
    } else if (to === 'merchant') source.items.splice(source.items.indexOf(item), 1);
    else if (from === to) { item.x = x; item.y = y; }
    else { source.items.splice(source.items.indexOf(item), 1); shopInventory(cart, to).items.push({ ...item, x, y }); }
    return true;
}
export function cartTotals(cart: ShopCart) {
    const buy = cart.buy.items.reduce((n, i) => n + D.ITEMS[i.id].buy * i.qty, 0);
    const sell = cart.sell.items.reduce((n, i) => n + D.ITEMS[i.id].sell * i.qty, 0);
    return { buy, sell, net: buy - sell };
}
export function questUses(save: D.SaveDataV1, id: string) {
    return Object.entries(D.QUESTS).filter(([key, q]) => !save.quests[key] && q.needs[id]).map(([, q]) => q.name);
}
export function saleWarnings(save: D.SaveDataV1, cart: ShopCart) {
    return Object.entries(D.QUESTS).flatMap(([key, quest]) => save.quests[key] ? [] : Object.entries(quest.needs).flatMap(([id, needed]) => {
        const sold = D.count(cart.sell, id);
        const remaining = [cart.stash, cart.buy, save.bag, save.safe].reduce((n, inv) => n + D.count(inv, id), 0);
        return sold && remaining < needed ? [{ quest: quest.name, id, needed, sold, remaining }] : [];
    }));
}
export type CartRejection = 'rule' | 'stale' | 'space' | 'funds';
export type CartSettlement = { ok: true } | { ok: false; reason: CartRejection };
/** Same automatic stash-placement rules, now with precise rejection reasons. Failure never edits the profile. */
export function settleCartResult(save: D.SaveDataV1, cart: ShopCart, rpg = false): CartSettlement {
    const fail = (reason: CartRejection): CartSettlement => ({ ok: false, reason });
    if (save.activeRun || !Object.hasOwn(D.MERCHANTS, cart.merchant)) return fail('rule');
    if (JSON.stringify(save.stash) !== cart.original) return fail('stale');
    if (!cartDirty(cart)) return fail('rule');
    const owned = [...cart.stash.items, ...cart.sell.items];
    if (owned.length !== save.stash.items.length || new Set(owned.map(i => i.uid)).size !== owned.length) return fail('rule');
    for (const item of owned) {
        const original = save.stash.items.find(i => i.uid === item.uid);
        if (!original || item.id !== original.id || item.qty !== original.qty || !!item.relief !== !!original.relief || !!item.rotated !== !!original.rotated) return fail('rule');
    }
    if (cart.sell.items.some(i => i.relief || !Object.hasOwn(D.ITEMS, i.id) || D.ITEMS[i.id].sell <= 0)) return fail('rule');
    if (cart.buy.items.some(i => i.relief || !Object.hasOwn(D.ITEMS, i.id) || !merchantStock(cart.merchant, rpg).includes(i.id) || i.qty !== D.buyQuantity(i.id))) return fail('rule');
    const stash = structuredClone(cart.stash), { net } = cartTotals(cart);
    if (!Number.isFinite(net)) return fail('rule');
    if (save.cash < net) return fail('funds');
    for (const item of stash.items) if (!D.fits(stash, item.id, item.x, item.y, item.uid, !!item.rotated)) return fail('space');
    for (const item of cart.buy.items) if (D.addItem(stash, item.id, item.qty)) return fail('space');
    save.stash = stash; save.cash -= net;
    return { ok: true };
}
/** Existing tabs keep the boolean API; both entrances execute the same settlement. */
export function settleCart(save: D.SaveDataV1, cart: ShopCart, rpg = false): boolean {
    return settleCartResult(save, cart, rpg).ok;
}
