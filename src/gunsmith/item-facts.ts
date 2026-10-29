/**
 * The gunsmith lines of the item details (#28 M2-08), as plain text for the yard, the tab page and the raid backpack
 * (each escapes and lays them out its own way). An attachment names its maker and guns and, at the base, which gun
 * there takes it now and what another still lacks; a gun lists its parts; the sale value is the gun's composition
 * (itemSale), never the factory price; the sale preview names every component's price.
 */
import * as D from '../domain';
import { ATTACHMENTS } from './catalog';
import { magless, nodesOf, gunSaleLines } from './instance';
import { WHERE_NAMES, partFits } from './bench';

/** An attachment's lines: maker and guns; with `profile` (at the base), each gun there that takes it and what it lacks. */
export function attachmentLines(profile: Readonly<D.SaveDataV1> | null, id: string): string[] {
    const facts = D.attachmentFacts(id);
    if (!facts) return [];
    const lines = [`制造商：${facts.brand} · 适配：${facts.guns.join('、') || '暂无'}`];
    if (!profile) return lines;
    const fits = partFits(profile, id);
    if (!fits.length) lines.push('基地里还没有能装它的枪。');
    for (const f of fits) lines.push(f.reason === null ? `能装在${f.gun}（${WHERE_NAMES[f.where]}）上。` : `装在${f.gun}（${WHERE_NAMES[f.where]}）上：${f.reason}。`);
    return lines;
}

/**
 * A gun's installed parts, "已装：…", and that it holds no magazine (#28 M4-07); null for a factory gun and other
 * items.
 */
export function gunPartsLine(item: Pick<D.Item, 'id' | 'gun'>): string | null {
    if (!D.isGun(item.id) || !item.gun) return null;
    const parts = nodesOf(item.gun.parts), lines = [
        ...parts.length ? [`已装：${parts.map(n => ATTACHMENTS[n.id].name).join('、')}`] : [],
        ...magless(item.gun.magOut, item.gun.parts) ? ['没装弹匣，不能开火'] : []];
    return lines.length ? lines.join('；') : null;
}

/** What selling the item pays (itemSale: a gun with its parts), or null and why when it cannot be sold. */
export function saleValue(item: Pick<D.Item, 'id' | 'qty' | 'relief' | 'gun'>): { value: number | null; note: string | null } {
    const sale = D.itemSale(item);
    if (sale.restricted && D.isGun(item.id) && !item.relief) return { value: null, note: '装有救济配件，不能整枪出售' };
    return sale.restricted || sale.value <= 0 ? { value: null, note: '不可出售' } : { value: sale.value, note: null };
}

/**
 * The sale preview of a gun with parts or with its factory magazine out: each component and its price (a relief one
 * marked, adding nothing); null otherwise.
 */
export function saleLines(item: Pick<D.Item, 'id' | 'relief' | 'gun'>): string[] | null {
    if (!D.isGun(item.id) || !item.gun?.parts.length && !item.gun?.magOut) return null;
    return gunSaleLines({ id: item.id, relief: !!item.relief, parts: item.gun.parts, magOut: item.gun.magOut })
        .map((l, i) => `${i ? '配件' : '枪身'} ${l.name}：${l.relief ? '救济，不计价' : `¥ ${l.price}`}`);
}
