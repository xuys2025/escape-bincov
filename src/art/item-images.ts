import { inventoryArtSize, paintInventoryItem } from './inventory';
import { ITEM_ART_IDS, type ItemArtId } from './items';
import { gunsmithArt } from './gunsmith-hooks';
import type { GunState } from '../gunsmith/instance';

const cache = new Map<string, string>();
/** Art painted once into a canvas and kept as a data URL (the same painters the 2.5D views use); '' without a 2D context. */
export function painted(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): string {
  let url = cache.get(key);
  if (url === undefined) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    if (c) { c.imageSmoothingEnabled = false; paint(c); }
    url = c ? canvas.toDataURL() : '';
    cache.set(key, url);
  }
  return url;
}

/** Items with drawn art; the rest show only their label. */
export const artId = (id: string) => (ITEM_ART_IDS as readonly string[]).includes(id) ? id as ItemArtId : null;

/** An item's inventory art at its own proportions (inventoryArtSize); an item without art gets a blank image. */
export function inventoryArtUrl(id: string): string {
  const [w, h] = inventoryArtSize(id), art = artId(id);
  return painted(`item-inventory-${id}`, w, h, c => { if (art) paintInventoryItem(c, art); });
}

/** An item or a gun as it is: the gun's parts choose its picture. */
export type ArtItem = { id: string; gun?: GunState | null };
/**
 * The inventory picture of an item in a box of `maxWidth` x `maxHeight` (#28 M2-10): a gun with parts is its composite
 * when that fits at least once; otherwise (small cells, a gun without art for its parts, before the art is decoded) the
 * gun type's picture with `modified` set, for the mark that says so (M0 review decision 8).
 */
export function itemPicture(item: ArtItem, maxWidth: number, maxHeight: number, rotated = false): { url: string; w: number; h: number; modified: boolean } {
  const parts = item.gun?.parts ?? [];
  if (parts.length) {
    const pic = gunsmithArt?.configured(item.id, parts);
    if (pic && (rotated ? pic.h <= maxWidth && pic.w <= maxHeight : pic.w <= maxWidth && pic.h <= maxHeight)) return { ...pic, modified: false };
  }
  const [w, h] = inventoryArtSize(item.id);
  return { url: artId(item.id) ? inventoryArtUrl(item.id) : '', w, h, modified: parts.length > 0 };
}
/** The mark on a cell whose gun is shown as its type's picture though it has parts. */
export const MODIFIED_MARK = '<i class="art-mod" title="已改装" style="position:absolute;right:2px;top:2px;padding:0 2px;font:11px/13px inherit;font-style:normal;color:#1a1408;background:#e2b45c;pointer-events:none">改</i>';

/** The <img> for an item in an inventory cell, scaled by whole pixels to fit; '' for an item without art. */
export function itemArtwork(item: string | ArtItem, maxWidth: number, maxHeight: number, rotated = false) {
  const it = typeof item === 'string' ? { id: item } : item, pic = itemPicture(it, maxWidth, maxHeight, rotated), { url, w, h } = pic;
  const scale = Math.max(1, Math.floor(Math.min(maxWidth / (rotated ? h : w), maxHeight / (rotated ? w : h))));
  return url ? `<img class="inventory-art-image" data-art="${it.id}" width="${w * scale}" height="${h * scale}" style="width:${w * scale}px;height:${h * scale}px;${rotated ? 'transform:rotate(90deg)' : ''}" alt="" draggable="false" src="${url}">${pic.modified ? MODIFIED_MARK : ''}` : '';
}
