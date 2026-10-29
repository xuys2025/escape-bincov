// Captures the existing procedural I originals without a browser or changes to game code.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inventoryArtSize,paintInventoryItem } from '../../../../../src/art/inventory.ts';
import { canvas,rect } from './pixels.mjs';
const images={};
for(const id of ['pistol','shotgun','carbine']) {
  const [w,h]=inventoryArtSize(id),c=canvas(w,h);
  const context={fillStyle:'#000000',fillRect(x,y,w,h){rect(c,this.fillStyle,Math.round(x),Math.round(y),Math.round(w),Math.round(h));}};
  paintInventoryItem(context,id);images[id]={w,h,ops:c.ops};
}
writeFileSync(fileURLToPath(new URL('legacy-inventory.json',import.meta.url)),JSON.stringify({source:'src/art/inventory.ts at PR #132 code baseline; original paintInventoryItem calls captured with integer fillRect',images},null,2)+'\n');
console.log('Captured three unchanged procedural inventory originals.');
