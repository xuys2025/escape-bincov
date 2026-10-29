import * as D from './domain';
import { partFits } from './gunsmith/bench';

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
/**
 * A counter's stock, with the RPG extras right after the old goods: since #28 M3 the arms counter's gunsmith goods fill
 * more than a page, and the cloth a crafter buys often stays on the first.
 */
export function merchantStock(merchant: Merchant, rpg = false): string[] {
    const stock = D.MERCHANTS[merchant].stock, extras = rpg ? merchant === 'arms' ? ['cloth'] : ['analgesic', 'focus'] : [];
    const gunsmith = stock.findIndex(id => D.isAttachment(id) || D.isGun(id) && !['pistol', 'shotgun', 'carbine'].includes(id));
    return gunsmith < 0 ? [...stock, ...extras] : [...stock.slice(0, gunsmith), ...extras, ...stock.slice(gunsmith)];
}
/**
 * What the catalog shows (#28 M2-08): one item kind or all, `fits` keeping only what serves a gun at the base (the
 * attachments one of them can take, now or after an opener, and the ammo they fire), and the page.
 */
export interface ShopBrowse { kind: D.ItemKind | 'all'; fits: boolean; page: number }
export const BROWSE_ALL: ShopBrowse = Object.freeze({ kind: 'all', fits: false, page: 0 });
/** The catalog's size: one page of the stock at a time. */
export const CATALOG_W = 6, CATALOG_H = 5;
/**
 * The buy and sell lists: 6 x 3 since #28 M3-12, so the largest legal gun fits (an RPK with its drum and a suppressor,
 * 6 x 3); 6 x 2 in M3, 4 x 3 before.
 */
export const CART_W = 6, CART_H = 3;
/** The stock the browse selects, in stock order. */
export function browseStock(save: Readonly<D.SaveDataV1>, merchant: Merchant, rpg: boolean, browse: ShopBrowse): string[] {
    const ammo = new Set(D.isGun(save.equipment.weapon) ? [D.WEAPONS[save.equipment.weapon].ammo] : []);
    for (const inv of [save.stash, save.bag, save.safe]) for (const i of inv.items) if (D.isGun(i.id)) ammo.add(D.WEAPONS[i.id].ammo);
    return merchantStock(merchant, rpg).filter(id => (browse.kind === 'all' || D.ITEMS[id].kind === browse.kind)
        && (!browse.fits || (D.isAttachment(id) ? partFits(save, id).length > 0 : ammo.has(id))));
}
/** `ids` packed into catalog pages in order: a pack that no longer fits starts the next page. Never empty. */
export function catalogPages(ids: readonly string[]): string[][] {
    const pages: string[][] = [[]];
    let page = D.createInventory(CATALOG_W, CATALOG_H);
    for (const id of ids) {
        if (D.addItem(page, id, D.buyQuantity(id)) > 0) { page = D.createInventory(CATALOG_W, CATALOG_H); D.addItem(page, id, D.buyQuantity(id)); pages.push([]); }
        pages.at(-1)!.push(id);
    }
    return pages;
}
/** The kinds in a merchant's stock, in stock order: the catalog's category buttons. */
export const stockKinds = (merchant: Merchant, rpg: boolean): D.ItemKind[] => [...new Set(merchantStock(merchant, rpg).map(id => D.ITEMS[id].kind))];
export function createCart(save: D.SaveDataV1, merchant: Merchant, rpg = false, browse: ShopBrowse = BROWSE_ALL): ShopCart {
    return { merchant, original: JSON.stringify(save.stash), catalog: catalogPage(save, merchant, rpg, browse).catalog, buy: D.createInventory(CART_W, CART_H), sell: D.createInventory(CART_W, CART_H), stash: structuredClone(save.stash) };
}
/** One catalog page of the browse (the page clamped to those there are), and how many pages there are. */
export function catalogPage(save: Readonly<D.SaveDataV1>, merchant: Merchant, rpg: boolean, browse: ShopBrowse): { catalog: D.Inventory; page: number; pages: number } {
    const pages = catalogPages(browseStock(save, merchant, rpg, browse)), page = Math.max(0, Math.min(pages.length - 1, Math.floor(browse.page) || 0));
    const catalog = D.createInventory(CATALOG_W, CATALOG_H);
    for (const id of pages[page]) D.addItem(catalog, id, D.buyQuantity(id));
    return { catalog, page, pages: pages.length };
}
export const shopInventory = (cart: ShopCart, source: ShopSource) => source === 'merchant' ? cart.catalog : cart[source];
/** The reason a cell gives when it only lacks room; quick moves replace it with their own "area is full" message. */
export const SHOP_SPACE_MESSAGE = '请选空格，待买按包、待卖按整组放置。';
export type ShopQuote = { side: 'buy' | 'sell'; total: number | null };
/**
 * Price on the side an item trades, with the same numbers cartTotals uses: merchant and buy-list packs cost buy × qty,
 * stash and sell-list items earn their sale value (D.itemSale: a gun is its body plus each installed part). A null
 * total means the item cannot be sold (saleRefusal says why).
 */
export function shopQuote(source: ShopSource, item: Pick<D.Item, 'id' | 'qty' | 'relief' | 'gun'>): ShopQuote {
    const def = D.ITEMS[item.id];
    if (source === 'merchant' || source === 'buy') return { side: 'buy', total: def.buy * item.qty };
    return { side: 'sell', total: saleRefusal(item) ? null : D.itemSale(item).value };
}
/**
 * Why an item cannot go on the sell list, or null when it can: relief goods and anything without a sale value, and a
 * gun that holds a relief part, which is refused whole with its own reason rather than stripped or destroyed.
 */
export function saleRefusal(item: Pick<D.Item, 'id' | 'qty' | 'relief' | 'gun'>): string | null {
    const sale = D.itemSale(item);
    if (sale.restricted && !item.relief) return '这把枪装有救济配件，不能整枪出售。';
    return sale.restricted || sale.value <= 0 ? '这件物品不可出售。' : null;
}
/**
 * Row-major scan for a quick move's first accepted cell. When no cell accepts, the first reason that is not about room
 * (relief goods, a changed stash) is returned so the player sees why; a null reason means only room was missing.
 */
export function firstShopCell(w: number, h: number, check: (x: number, y: number) => string | null): { x: number; y: number } | { reason: string | null } {
    let reason: string | null = null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const error = check(x, y);
        if (!error) return { x, y };
        if (reason === null && error !== SHOP_SPACE_MESSAGE) reason = error;
    }
    return { reason };
}
const positions = (inv: D.Inventory) => JSON.stringify({ ...inv, items: [...inv.items].sort((a, b) => a.uid.localeCompare(b.uid)) });
export const cartDirty = (cart: ShopCart) => !!(cart.buy.items.length || cart.sell.items.length || positions(cart.stash) !== positions(JSON.parse(cart.original)));
export function shopPlacementError(cart: ShopCart, from: ShopSource, to: ShopSource, uid: string, x: number, y: number): string | null {
    const item = shopInventory(cart, from)?.items.find(i => i.uid === uid);
    if (!item) return '请重新选择物品。';
    if (from === 'buy' && to === 'merchant') return null;
    if (!((from === 'merchant' && to === 'buy') || (from === 'stash' && to === 'sell') || (from === 'sell' && to === 'stash') || (from === to && from !== 'merchant'))) return '先放入待买或待卖区，再统一结算。';
    if (to === 'sell') { const refusal = saleRefusal(item); if (refusal) return refusal; }
    return D.fits(shopInventory(cart, to), item, x, y, from === to ? uid : undefined, !!item.rotated) ? null : SHOP_SPACE_MESSAGE;
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
    const sell = cart.sell.items.reduce((n, i) => n + D.itemSale(i).value, 0);
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
export const cartRejectionMessage: Record<CartRejection, string> = {
    funds: '现金不足，请减少待买物品或增加待卖物品。',
    space: '仓库空间不足，请先腾出能放下待买物品的空格。',
    stale: '仓库已改变，请刷新清单后重新选择物品。',
    rule: '清单无效或没有改动，请重新选择待买、待卖物品。',
};
export const cartStale = (save: D.SaveDataV1, cart: ShopCart) => JSON.stringify(save.stash) !== cart.original;
export type CartSettlement = { ok: true } | { ok: false; reason: CartRejection };
/** Same automatic stash-placement rules, now with precise rejection reasons. Failure never edits the profile. */
export function settleCartResult(save: D.SaveDataV1, cart: ShopCart, rpg = false): CartSettlement {
    const fail = (reason: CartRejection): CartSettlement => ({ ok: false, reason });
    if (save.activeRun || !Object.hasOwn(D.MERCHANTS, cart.merchant)) return fail('rule');
    if (cartStale(save, cart)) return fail('stale');
    if (!cartDirty(cart)) return fail('rule');
    const owned = [...cart.stash.items, ...cart.sell.items];
    if (owned.length !== save.stash.items.length || new Set(owned.map(i => i.uid)).size !== owned.length) return fail('rule');
    for (const item of owned) {
        const original = save.stash.items.find(i => i.uid === item.uid);
        if (!original || item.id !== original.id || item.qty !== original.qty || !!item.relief !== !!original.relief || !!item.rotated !== !!original.rotated
            || D.gunKey(item.gun) !== D.gunKey(original.gun)) return fail('rule');
    }
    if (cart.sell.items.some(i => !Object.hasOwn(D.ITEMS, i.id) || saleRefusal(i) !== null)) return fail('rule');
    if (cart.buy.items.some(i => i.relief || !Object.hasOwn(D.ITEMS, i.id) || !merchantStock(cart.merchant, rpg).includes(i.id) || i.qty !== D.buyQuantity(i.id))) return fail('rule');
    const stash = structuredClone(cart.stash), { net } = cartTotals(cart);
    if (!Number.isFinite(net)) return fail('rule');
    if (save.cash < net) return fail('funds');
    for (const item of stash.items) if (!D.fits(stash, item, item.x, item.y, item.uid, !!item.rotated)) return fail('space');
    for (const item of cart.buy.items) if (D.addItem(stash, item.id, item.qty)) return fail('space');
    save.stash = stash; save.cash -= net;
    return { ok: true };
}
