import { ITEM_ART_IDS, type ItemArtId } from '../art/items';
import { inventoryArtSize, paintInventoryItem } from '../art/inventory';

/** The game's own inventory artwork (the old tabs draw the same pixels through Phaser textures). */
const cache = new Map<string, string>();
const known = new Set<string>(ITEM_ART_IDS);

export const itemArtSize = (id: string) => inventoryArtSize(id);
export function itemArt(id: string): string {
  let url = cache.get(id);
  if (url) return url;
  const [w, h] = inventoryArtSize(id), c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  if (known.has(id)) paintInventoryItem(g, id as ItemArtId);
  url = c.toDataURL(); cache.set(id, url);
  return url;
}
