import { inventoryArtUrl } from '../art/item-images';

/** The game's own inventory artwork, shared with the old tab page and the raid inventory (art/item-images.ts). */
export const itemArt = (id: string): string => inventoryArtUrl(id);
