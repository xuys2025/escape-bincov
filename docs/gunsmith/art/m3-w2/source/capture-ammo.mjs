// Capture the existing three procedural ammo icons for a faithful six-family color/grayscale comparison.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { paintItem } from '../../../../../src/art/items.ts';
import { root,docs,picture } from './assemble.mjs';
import { canvas,rect,blit,save,text } from './pixels.mjs';
const records=[];
for(const n of [24,32])for(const item of ['ammo9','shell','ammoR']){
 const c=canvas(n,n),context={fillStyle:'#000000',fillRect(x,y,w,h){rect(c,this.fillStyle,Math.round(x),Math.round(y),Math.round(w),Math.round(h));}};paintItem(context,item,n);records.push({item,n,w:c.w,h:c.h,ops:c.ops});
}
writeFileSync(resolve(root,docs+'/source/legacy-ammo.json'),JSON.stringify({source:'src/art/items.ts paintItem, d3eb43f',method:'Recorded actual fillRect operations from the existing procedural brush; no game files written',images:records},null,2)+'\n');
for(const gray of [false,true]){const sheet=canvas(930,340);rect(sheet,'#101c22',0,0,sheet.w,sheet.h);text(sheet,'AMMUNITION / EXISTING THREE AND NEW THREE / 1X AND 3X',12,12);
 for(const [row,n]of [24,32].entries())for(const [col,item]of ['ammo9','shell','ammoR','ammo45','ammoPDW','ammoHeavy'].entries()){
  let image;if(col<3){const r=records.find(r=>r.item===item&&r.n===n);image=canvas(n,n);for(const o of r.ops)rect(image,...o.slice(1));}else image=picture('gs-'+item.toLowerCase()+'-q'+n);
  const x=12+col*154,y=45+row*148;text(sheet,item.toUpperCase()+' Q'+n,x,y,'#cb9362');blit(sheet,image,x,y+19,1,gray);blit(sheet,image,x+40,y+19,3,gray);
 }save(resolve(root,docs+`/preview/ammunition-six-${gray?'gray':'color'}.png`),sheet);
}
assert.equal(records.length,6);console.log('Captured six existing ammunition icons for comparison.');
