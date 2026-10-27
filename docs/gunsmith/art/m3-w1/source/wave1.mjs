// Remaining first-wave artwork. All coordinates are authored on the target grid; no cross-output resize.
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { make,all,pictures,artwork,finish } from './export.mjs';
import { canvas,rect,poly,blit,crop,decode } from './pixels.mjs';
const root=fileURLToPath(new URL('../../../../..',import.meta.url));
const m2=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json')));
const spec={
 pb226:{h:{size:[18,9],grip:[6,6],bore:2,tip:[18,2],hand:[6,6],mounts:{mount:[6,0],barrel:[17,1],muzzle:[17,1],rearGrip:[4,4],pistolSide:[14,4]}},i:{size:[40,17],tip:[40,4],mounts:{mount:[13,1],barrel:[39,3],muzzle:[39,3],rearGrip:[8,8],pistolSide:[32,8]}},w:{size:[80,34],tip:[80,8],mounts:{mount:[26,2],barrel:[79,6],muzzle:[79,6],rearGrip:[16,16],pistolSide:[64,16]}}},
 vb9:{h:{size:[24,10],grip:[9,7],bore:3,tip:[24,3],hand:[16,6],mounts:{top:[10,0],under:[16,6],side1:[19,3],muzzle:[23,2]}},i:{size:[55,17],tip:[55,4],mounts:{top:[23,0],under:[37,9],side1:[45,5],muzzle:[54,3]}},w:{size:[110,34],tip:[110,8],mounts:{top:[46,0],under:[74,18],side1:[90,10],muzzle:[109,6]}}},
 mpb5:{h:{size:[10,9],grip:[3,5],bore:2,mounts:{barrel:[9,1],handguard:[9,3],stock:[0,2],mag:[6,4],mount:[5,0]}},i:{size:[24,16],mounts:{barrel:[23,2],handguard:[23,4],stock:[0,3],mag:[14,7],mount:[12,0]}},w:{size:[48,32],mounts:{barrel:[46,4],handguard:[46,8],stock:[0,6],mag:[28,14],mount:[24,0]}}},
 mb870:{h:{size:[11,5],grip:[3,4],bore:2,mounts:{barrel:[10,1],handguard:[10,3],stock:[0,2],rearGrip:[2,4],mag:[10,3],mount:[6,0]}},i:{size:[27,8],mounts:{barrel:[26,2],handguard:[26,4],stock:[0,3],rearGrip:[5,6],mag:[26,5],mount:[16,0]}},w:{size:[54,16],mounts:{barrel:[52,4],handguard:[52,8],stock:[0,6],rearGrip:[10,12],mag:[52,10],mount:[32,0]}}},
 mb1014:{h:{size:[11,5],grip:[3,4],bore:2,mounts:{barrel:[10,1],handguard:[10,3],stock:[0,2],rearGrip:[2,4],mag:[10,3],top:[6,0]}},i:{size:[27,8],mounts:{barrel:[26,2],handguard:[26,4],stock:[0,3],rearGrip:[5,6],mag:[26,5],top:[16,0]}},w:{size:[54,16],mounts:{barrel:[52,4],handguard:[52,8],stock:[0,6],rearGrip:[10,12],mag:[52,10],top:[32,0]}}},
 akb103:Object.fromEntries(['h','i','w'].map(c=>{const a=all.find(a=>a.id===`gs-akb74-receiver-${c}-v1`);return[c,{size:[a.w,a.h],mounts:a.mounts,...(c==='h'?{grip:a.grip,bore:a.bore}:{})}];}))
};
for(const [gun,codes] of Object.entries(spec))for(const code of ['h','i','w']){
 const s=codes[code],[w,h]=s.size;
 make(`${gun}-receiver`,code,w,h,{gun,role:'receiver',mounts:s.mounts,...(s.tip?{tip:s.tip}:{}),...(code==='h'?{grip:s.grip,bore:s.bore,forward:gun==='pb226'?8:0,...(s.hand?{hand:s.hand}:{})}:{})},(r,p)=>{
  if(gun==='pb226'){
   if(code==='h'){p('K',[[0,1],[2,0],[16,0],[18,1],[18,4],[11,4],[10,7],[8,7],[7,9],[2,9],[4,5],[0,5]]);r('D',1,1,16,3);r('L',3,1,12,1);r('S',2,2,14,1);r('K',2,2,1,2);r('K',4,2,1,2);r('K',11,2,3,1);r('B',4,5,3,3);r('K',8,5,2,1);}
   if(code==='i'){p('K',[[0,2],[3,0],[36,0],[40,3],[40,8],[25,8],[24,13],[19,14],[17,17],[4,17],[8,9],[1,9]]);r('D',2,2,36,6);r('S',4,1,31,3);r('L',5,1,28,1);r('K',3,3,1,3);r('K',6,3,1,3);r('K',26,3,6,2);p('E',[[9,8],[19,9],[16,16],[5,16]]);r('D',9,10,6,1);r('D',8,12,7,1);r('D',7,14,6,1);r('S',20,9,3,1);r('S',21,10,1,2);r('K',18,8,5,1);}
   if(code==='w'){p('K',[[0,4],[6,0],[72,0],[80,6],[80,16],[50,16],[48,26],[38,28],[34,34],[8,34],[16,18],[2,18]]);r('D',2,4,75,11);r('J',6,2,65,5);r('S',9,2,60,2);r('L',11,2,54,1);r('N',12,4,48,1);for(const x of [5,10,15])r('K',x,7,2,6);r('K',52,6,12,3);r('J',54,9,9,1);p('E',[[18,16],[38,18],[32,32],[10,32]]);for(let y=20;y<31;y+=3){r('D',20-(y-20)/3,y,11,1);r('J',22-(y-20)/3,y+1,2,1);}r('K',36,16,10,2);r('S',40,19,4,1);r('J',42,20,1,5);r('K',3,1,3,4);r('S',3,1,1,1);}
  }else if(gun==='vb9'){
   if(code==='h'){p('K',[[0,1],[12,0],[21,0],[21,2],[24,2],[24,5],[19,5],[17,10],[13,10],[13,6],[11,6],[9,10],[5,10],[7,5],[0,4]]);r('D',1,2,19,2);r('L',7,1,13,1);r('S',13,3,7,1);r('E',13,5,3,4);r('S',14,6,1,3);r('D',6,6,3,3);r('K',17,3,2,1);}
   if(code==='i'){p('K',[[0,2],[22,0],[46,0],[46,3],[55,3],[55,7],[44,7],[40,17],[30,17],[30,10],[25,10],[21,17],[10,17],[15,8],[0,7]]);p('D',[[1,3],[22,2],[44,2],[44,6],[39,15],[32,15],[32,8],[17,7],[1,6]]);r('S',22,1,22,2);r('L',24,1,17,1);r('E',33,8,6,7);r('S',34,9,1,5);r('K',38,3,5,2);p('E',[[16,9],[23,10],[19,16],[12,16]]);r('K',5,4,10,1);for(let x=24;x<44;x+=3)r('D',x,0,1,1);}
   if(code==='w'){p('K',[[0,4],[44,0],[92,0],[92,6],[110,6],[110,14],[88,14],[80,34],[60,34],[60,20],[50,20],[42,34],[20,34],[30,16],[0,14]]);p('D',[[2,6],[44,3],[89,3],[89,12],[78,31],[64,31],[64,16],[33,14],[2,12]]);r('J',46,4,41,5);r('S',45,2,43,2);r('L',48,2,34,1);r('N',49,4,28,1);r('E',66,17,12,14);for(let x=68;x<77;x+=3)r('J',x,19,1,10);r('K',76,6,10,3);r('J',78,9,7,1);p('E',[[33,18],[46,20],[38,32],[24,32]]);for(let y=22;y<31;y+=3)r('D',31-(y-22)/3,y,8,1);r('K',10,8,20,2);for(let x=48;x<87;x+=5)r('J',x,0,2,1);r('K',52,12,3,3);r('L',53,12,1,1);}
  }else{
   // Family-specific receiver profiles; the MP retains its integrated grip, the shotguns their trigger loop.
   if(code==='h'){p('K',[[0,2],[2,0],[w-2,0],[w,1],[w,5],[5,5],[4,Math.min(h,9)],[1,Math.min(h,9)],[2,5],[0,5]]);r('D',1,2,w-2,2);r('S',3,1,w-5,1);r('L',3,1,Math.max(2,w-8),1);r('K',w-5,2,3,1);if(gun==='mpb5')r('D',2,5,2,3);if(gun==='mb1014')for(let x=2;x<w-1;x+=2)r('S',x,0,1,1);if(gun==='akb103')r('E',8,3,3,1);}
   if(code==='i'){p('K',[[0,3],[4,0],[w-3,0],[w,2],[w,7],[15,7],[13,h],[5,h],[8,8],[0,7]]);r('D',1,3,w-2,3);r('S',4,1,w-7,2);r('L',6,1,w-12,1);r('K',Math.floor(w/2),3,Math.max(4,w-18),1);r('E',2,5,w-5,1);r('S',w-6,4,3,1);if(gun==='mpb5'){p('E',[[8,7],[13,8],[10,15],[6,15]]);r('S',8,9,1,3);}if(gun==='mb1014')for(let x=4;x<w-3;x+=3)r('S',x,0,1,1);r('K',10,6,5,1);}
   if(code==='w'){p('K',[[0,6],[8,0],[w-6,0],[w,4],[w,14],[30,14],[26,h],[10,h],[16,16],[0,14]]);r('D',1,6,w-2,7);r('J',7,3,w-13,3);r('S',9,1,w-17,2);r('L',12,1,w-24,1);r('N',14,3,w-29,1);r('K',Math.floor(w/2),6,Math.max(8,w-36),2);r('J',Math.floor(w/2)+1,8,9,1);r('E',3,11,w-8,2);r('S',w-13,8,7,1);for(const x of [6,20,w-8]){r('K',x,9,2,2);r('L',x,9,1,1);}if(gun==='mpb5'){p('E',[[16,14],[26,16],[20,30],[12,30]]);for(let y=18;y<29;y+=3)r('J',17,y,3,1);}if(gun==='mb1014')for(let x=8;x<w-5;x+=5)r('S',x,0,2,1);r('K',20,12,10,1);}
  }
 });
}
const barrels={mpb5:{h:[11,4,[0,1],[11,2]],i:[26,9,[0,2],[26,3]],w:[52,18,[0,4],[52,6]]},mb870:{h:[14,4,[0,1],[14,2]],i:[38,9,[0,2],[38,3]],w:[76,18,[0,4],[76,6]]},mb1014:{h:[13,4,[0,1],[13,2]],i:[36,9,[0,2],[36,3]],w:[72,18,[0,4],[72,6]]},akb103:{h:[12,4,[0,1],[12,2]],i:[30,9,[0,2],[30,3]],w:[60,18,[0,4],[60,6]]}};
function drawBarrel(r,p,code,w,h,a,shot=false){r('K',0,a[1],w,code==='w'?8:code==='i'?4:2);r('S',1,a[1]+1,w-2,1);if(code==='h'){r('K',w-3,0,1,a[1]+1);r('L',1,a[1]+1,Math.max(1,w-5),1);}else{r('L',3,a[1]+1,w-8,1);r('D',2,a[1]+(code==='w'?4:2),w-4,1);const k=code==='w'?6:3;r('K',w-k-2,0,code==='w'?3:2,a[1]+3);r('S',w-k-1,1,1,a[1]);if(code==='w'){r('J',4,a[1]+3,w-12,1);r('K',w-4,a[1],2,9);r('S',w-3,a[1]+1,1,4);}}}
for(const [gun,codes] of Object.entries(barrels))for(const code of ['h','i','w']){const [w,h,a,tip]=codes[code];make(`${gun}-barrel-factory`,code,w,h,{gun,role:'factory',slot:'barrel',anchor:a,mounts:{muzzle:[w-1,a[1]]},tip},(r,p)=>drawBarrel(r,p,code,w,h,a,gun.startsWith('mb')));}
// Component grids are independent per output. Parts may share a family profile but never a resized image.
const stockGrids={mpb5:{h:[7,5,[6,1]],i:[17,11,[16,3]],w:[34,22,[33,6]]},mb870:{h:[10,6,[9,1]],i:[25,12,[24,3]],w:[50,24,[49,6]]},mb1014:{h:[10,6,[9,1]],i:[25,12,[24,3]],w:[50,24,[49,6]]},akb103:{h:[9,6,[8,1]],i:[24,12,[23,3]],w:[48,24,[47,6]]}};
function stockDraw(r,p,code,w,h,a,kind){
 if(kind==='telescopic'){
  if(code==='h'){r('K',0,0,2,h);r('K',1,a[1],w-1,1);r('S',1,a[1],w-2,1);r('K',1,h-2,w-3,1);r('D',0,1,1,h-2);}
  if(code==='i'){r('K',0,1,3,h-1);r('K',2,a[1],w-2,2);r('S',3,a[1],w-5,1);r('K',2,h-3,w-6,2);r('S',3,h-3,w-8,1);r('K',w-3,a[1],3,4);r('D',1,2,1,h-4);}
  if(code==='w'){r('K',0,2,5,h-2);r('K',4,a[1],w-4,3);r('J',6,a[1]+1,w-8,1);r('K',4,h-5,w-12,3);r('S',5,h-5,w-16,1);r('K',w-6,a[1],6,7);r('D',1,3,2,h-5);r('L',2,4,1,h-10);}
  return;
 }
 const wood=kind==='wood',skeleton=kind==='skeleton',tactical=kind==='tactical';p('K',[[0,0],[w-3,a[1]],[w,a[1]],[w,a[1]+2],[w-4,a[1]+2],[2,h],[0,h]]);p(wood?'T':'D',[[1,1],[w-3,a[1]+1],[w-4,a[1]+2],[2,h-2],[1,h-2]]);r(wood?'W':'S',1,1,Math.max(1,w-5),1);if(code!=='h'){p(wood?'W':'E',[[3,3],[w-6,a[1]+1],[3,h-3]]);r(wood?'B':'L',3,2,Math.max(2,Math.floor(w/4)),1);r('K',1,2,1,h-3);if(skeleton)p([0,0,0,0],[[4,4],[w-8,a[1]+2],[4,h-5]]);if(tactical)r('K',4,Math.floor(h/2),Math.max(2,Math.floor(w/3)),2);if(code==='w'){r(wood?'O':'J',5,4,Math.floor(w/4),1);r(wood?'V':'D',6,h-6,Math.floor(w/3),1);r('K',w-6,a[1],2,2);}}else if(skeleton)r([0,0,0,0],2,2,1,1);
}
for(const [gun,codes]of Object.entries(stockGrids))for(const code of ['h','i','w']){const[w,h,a]=codes[code];make(`${gun}-stock-factory`,code,w,h,{gun,role:'factory',slot:'stock',anchor:a},(r,p)=>stockDraw(r,p,code,w,h,a,gun==='mb870'?'wood':gun==='mb1014'?'tactical':'black'));}
const guardGrids={mpb5:{h:[7,4,[0,1],[3,3]],i:[17,7,[0,2],[8,5]],w:[34,14,[0,4],[16,10]]},mb870:{h:[6,4,[0,1],[3,3]],i:[17,7,[0,2],[8,5]],w:[34,14,[0,4],[16,10]]},mb1014:{h:[7,4,[0,1],[3,3]],i:[18,7,[0,2],[8,5]],w:[36,14,[0,4],[16,10]]},akb103:{h:[7,4,[0,1],[3,3]],i:[18,8,[0,2],[8,6]],w:[36,16,[0,4],[16,12]]}};
function guardDraw(r,p,code,w,h,kind){const wood=kind==='wood';r('K',0,0,w,h);r(wood?'T':'D',1,1,w-2,h-2);r(wood?'B':'S',1,1,w-2,1);if(code==='h'){r(wood?'W':'E',2,2,w-3,1);}else{const step=code==='w'?5:3;for(let x=3;x<w-2;x+=step){r('K',x,2,code==='w'?2:1,h-4);r(wood?'W':'S',x+1,2,1,1);}if(code==='w'){r(wood?'O':'J',2,h-4,w-5,1);r(wood?'B':'L',3,1,w-8,1);}}}
for(const [gun,codes]of Object.entries(guardGrids))for(const code of ['h','i','w']){const[w,h,a,hand]=codes[code];make(`${gun}-handguard-factory`,code,w,h,{gun,role:'factory',slot:'handguard',anchor:a,hand},(r,p)=>guardDraw(r,p,code,w,h,gun==='mb870'?'wood':'ribbed'));}
for(const gun of ['mb870','mb1014','akb103'])for(const code of ['h','i','w']){const[w,h]=code==='h'?[4,6]:code==='i'?[9,10]:[18,20];make(`${gun}-reargrip-factory`,code,w,h,{gun,role:'factory',slot:'rearGrip',anchor:[0,0]},(r,p)=>{p('K',[[0,0],[w,0],[w-2,h],[0,h],[0,h-2]]);p('D',[[1,1],[w-1,1],[w-3,h-1],[1,h-1]]);r('S',1,1,1,h-3);if(code!=='h')for(let y=3;y<h-2;y+=code==='w'?3:2)r('K',2,y,w-5,1);if(code==='w')r('J',4,2,3,2);});}
function magDraw(r,p,code,w,h,tube=false,fat=false){if(tube){r('K',0,0,w,h);r('D',1,1,w-2,h-2);r('S',1,1,w-2,1);if(code==='w'){r('J',2,3,w-5,1);r('K',w-3,1,1,h-2);}}else{const neck=code==='h'?3:code==='i'?(fat?8:6):(fat?16:12);p('K',[[0,0],[neck,0],[neck+1,Math.floor(h/2)],[w,h-2],[w-2,h],[w-5,h],[1,Math.floor(h/2)]]);p('D',[[1,1],[neck-1,1],[neck+1,Math.floor(h/2)],[w-2,h-2],[w-4,h-1],[3,Math.floor(h/2)]]);p('S',[[1,1],[2,1],[4,Math.floor(h/2)],[w-4,h-2],[w-5,h-2],[3,Math.floor(h/2)]]);if(code==='w'){p('J',[[5,2],[7,2],[10,Math.floor(h/2)],[w-4,h-4],[w-5,h-3],[8,Math.floor(h/2)]]);r('L',2,2,1,3);}}}
const mags={mpb5:{h:[6,6],i:[12,10],w:[24,20]},mb870:{h:[9,2],i:[26,4],w:[52,8]},mb1014:{h:[9,2],i:[26,4],w:[52,8]},akb103:{h:[7,6],i:[16,10],w:[32,20]}};
for(const [gun,codes]of Object.entries(mags))for(const code of ['h','i','w']){const[w,h]=codes[code];make(`${gun}-mag-factory`,code,w,h,{gun,role:'factory',slot:'mag',anchor:[0,0]},(r,p)=>magDraw(r,p,code,w,h,gun.startsWith('mb'),gun==='akb103'));}
// Each new gun gets its own close-up composition, on 24 and 32 grids.
for(const gun of Object.keys(spec))for(const size of [24,32])make(gun,`q${size}`,size,size,{gun,role:'icon'},(r,p)=>{
 if(gun==='pb226'){if(size===24){p('K',[[1,3],[20,3],[23,5],[23,11],[15,11],[14,16],[11,17],[9,23],[1,23],[5,12],[1,12]]);r('D',2,5,20,6);r('S',3,4,17,3);r('L',4,4,14,1);r('K',4,6,1,3);r('K',7,6,1,3);r('K',16,6,4,1);p('E',[[6,12],[12,13],[8,22],[2,22]]);r('S',13,13,1,3);}else{p('K',[[1,4],[27,4],[31,7],[31,15],[20,15],[19,22],[14,23],[12,31],[1,31],[7,16],[1,16]]);r('D',2,7,28,8);r('S',4,5,23,4);r('L',5,5,20,1);for(const x of [4,7,10])r('K',x,8,1,4);r('K',21,8,5,2);p('E',[[8,16],[16,18],[11,29],[3,29]]);r('D',7,22,5,1);r('S',17,18,1,3);}}
 else if(gun==='vb9'){const big=size===32;if(!big){p('K',[[1,4],[20,3],[20,6],[24,6],[24,11],[18,11],[16,23],[10,23],[10,14],[8,14],[5,23],[0,23],[4,12],[1,12]]);r('D',2,5,18,6);r('S',6,4,12,2);r('L',8,4,8,1);r('E',11,12,5,9);r('S',12,13,1,7);r('K',15,7,4,2);p('D',[[5,14],[8,15],[4,21],[1,21]]);}else{p('K',[[1,5],[27,4],[27,8],[32,8],[32,15],[24,15],[21,31],[13,31],[13,19],[10,19],[6,31],[0,31],[5,16],[1,16]]);r('D',2,7,25,8);r('S',8,5,17,3);r('L',10,5,13,1);r('E',15,16,6,12);r('S',16,17,1,9);r('K',20,9,5,3);p('D',[[7,18],[10,20],[5,29],[1,29]]);}}
 else{const ak=gun==='akb103',mp=gun==='mpb5',pump=gun==='mb870';if(size===24){p('K',[[0,8],[5,5],[19,5],[22,7],[24,7],[24,13],[15,13],[14,17],[12,17],[10,24],[3,24],[6,14],[0,14]]);r('D',2,8,20,5);r('S',5,6,13,2);r('L',7,6,9,1);r('K',12,9,6,1);p('E',[[7,14],[12,15],[9,22],[4,22]]);if(ak||mp){p('K',[[15,13],[20,13],[20,17],[24,21],[21,24],[17,20]]);p('S',[[16,14],[19,14],[19,18],[22,21],[21,22],[18,19]]);}else{r(pump?'W':'E',17,11,7,4);r(pump?'B':'S',18,11,6,1);r('K',19,13,1,2);}}else{p('K',[[0,10],[6,6],[25,6],[29,9],[32,9],[32,17],[20,17],[19,22],[16,23],[13,32],[4,32],[8,19],[0,18]]);r('D',2,10,27,7);r('S',7,7,17,3);r('L',9,7,12,1);r('K',16,11,9,2);p('E',[[9,18],[16,20],[12,30],[5,30]]);if(ak||mp){p('K',[[20,17],[26,17],[27,23],[32,28],[28,32],[23,27]]);p('S',[[21,18],[25,18],[26,24],[30,28],[28,30],[24,26]]);r('L',22,19,1,4);}else{r(pump?'W':'E',23,15,9,5);r(pump?'B':'S',24,15,8,1);for(const x of [25,28,31])r('K',x,17,1,3);}}}
 if(gun==='mb1014'){if(size===24){r('K',5,3,14,2);for(let x=6;x<19;x+=3)r('S',x,3,1,1);}else{r('K',7,3,18,3);for(let x=8;x<25;x+=4)r('S',x,3,2,1);}}
 if(gun==='mpb5'){if(size===24){r('K',21,4,3,4);r('S',22,5,1,2);}else{r('K',28,4,3,6);r('S',29,5,1,3);}}
 if(gun==='akb103'){if(size===24){p('K',[[14,12],[20,12],[21,17],[24,19],[24,24],[20,24],[16,19]]);p('S',[[15,13],[19,13],[20,18],[23,21],[21,23],[18,19]]);}else{p('K',[[19,16],[27,16],[28,23],[32,26],[32,32],[26,32],[21,26]]);p('D',[[20,17],[26,17],[27,24],[31,28],[28,31],[23,25]]);p('S',[[21,18],[23,18],[24,25],[29,29],[28,30],[23,26]]);}}
});

// Attachment drawings and legacy splits are added below, then one complete manifest is written.
const newParts=['A01','A02','A04','A05','A06','B03','B05','B06','B09','H02','H06','H07','H08','H09','S05','S07','S08','P06','P07','G03','G06','G07','G09','M01','M02','M10','M11','T04','T08'];
for(const id of newParts)for(const code of ['h','i','w']){
 if(code==='h'&&['P06','P07'].includes(id))continue;
 const ci={h:0,i:1,w:2}[code];
 if(id.startsWith('A')){const micro=['A01','A02'].includes(id),[w,h,a]=micro?[[5,2,[2,1]],[11,3,[5,2]],[22,5,[10,4]]][ci]:[[5,2,[2,1]],[13,3,[6,2]],[26,5,[12,4]]][ci];make(id.toLowerCase(),code,w,h,{item:id,slot:'mount',anchor:a,mounts:{[micro?'micro':'top']:[a[0],0]}},(r,p)=>{r('K',0,0,w,1);r('D',a[0]-1,1,3,h-1);r('S',1,0,w-2,1);if(code!=='h'){for(let x=2;x<w-1;x+=code==='w'?4:3)r('K',x,0,1,1);r('K',a[0],1,1,1);if(code==='w'){r('J',a[0]-2,2,2,2);r('L',a[0]-2,2,1,1);}}});}
 if(id.startsWith('B')){const map={B03:[[8,4,[0,1],[8,2]],[19,9,[0,2],[19,3]],[38,18,[0,4],[38,6]]],B05:[[10,4,[0,1],[10,2]],[28,9,[0,2],[28,3]],[56,18,[0,4],[56,6]]],B06:[[16,4,[0,1],[16,2]],[44,9,[0,2],[44,3]],[88,18,[0,4],[88,6]]],B09:[[15,6,[0,3],[15,3.5]],[27,11,[0,5],[27,6]],[54,18,[0,10],[54,12]]]};const[w,h,a,tip]=map[id][ci];make(id.toLowerCase(),code,w,h,{item:id,slot:'barrel',anchor:a,mounts:{muzzle:[w-1,a[1]]},tip},(r,p)=>drawBarrel(r,p,code,w,h,a,id!=='B03'));}
 if(id.startsWith('H')){const size={H02:[[10,4],[25,7],[50,14]],H06:[[6,4],[15,7],[30,14]],H07:[[8,4],[19,7],[38,14]],H08:[[7,4],[18,7],[36,14]],H09:[[7,4],[18,7],[36,14]]}[id][ci], [w,h]=size,a=[[0,1],[0,2],[0,4]][ci],hand=[[3,3],[8,5],[16,10]][ci];const mounts={...(id!=='H06'?{under:[[3,3],[8,6],[16,13]][ci]}:{}),side1:[[w-3,1],[w-5,3],[w-10,6]][ci],...(['H02','H07'].includes(id)?{side2:[[w-1,1],[w-2,3],[w-4,6]][ci]}:{})};make(id.toLowerCase(),code,w,h,{item:id,slot:'handguard',anchor:a,hand,mounts},(r,p)=>{guardDraw(r,p,code,w,h,'rail');for(let x=1;x<w-1;x+=code==='w'?5:3){r('S',x,0,1,1);if(id!=='H06')r('S',x,h-1,1,1);}if(code!=='h'){for(let x=3;x<w-3;x+=code==='w'?7:4)r('K',x,code==='w'?8:4,code==='w'?4:2,code==='w'?2:1);if(id==='H08')r('J',2,h-3,w-4,1);}});}
 if(id.startsWith('S')){const grid={S05:[[6,5,[5,1]],[18,11,[17,3]],[36,22,[35,6]]],S07:[[9,6,[8,1]],[23,12,[22,3]],[46,24,[45,6]]],S08:[[11,6,[10,1]],[27,12,[26,3]],[54,24,[53,6]]]}[id][ci];const[w,h,a]=grid;make(id.toLowerCase(),code,w,h,{item:id,slot:'stock',anchor:a},(r,p)=>stockDraw(r,p,code,w,h,a,id==='S05'?'telescopic':id==='S07'?'tactical':'solid'));}
 if(id.startsWith('P')){const[w,h]=id==='P07'?(code==='i'?[12,9]:[24,18]):(code==='i'?[10,10]:[20,20]);make(id.toLowerCase(),code,w,h,{item:id,slot:'rearGrip',anchor:[0,0],...(id==='P07'?{layer:'aboveReceiver'}:{})},(r,p)=>{p('K',[[0,0],[w,1],[w-3,h],[0,h],[1,h-3]]);p('D',[[1,1],[w-2,2],[w-4,h-1],[1,h-1]]);r('S',2,2,1,h-4);for(let y=3;y<h-2;y+=code==='w'?3:2)r('K',3,y,w-6,1);if(code==='w'){r('J',4,2,w-9,1);r('L',w-5,3,1,1);}});}
 if(id.startsWith('G')){const[w,h]={G03:[[7,6],[15,10],[30,20]],G06:[[13,2],[36,4],[72,8]],G07:[[12,2],[34,4],[68,8]],G09:[[8,6],[20,12],[40,23]]}[id][ci];make(id.toLowerCase(),code,w,h,{item:id,slot:'mag',anchor:[0,0]},(r,p)=>{if(id==='G09'){const neck=code==='h'?3:code==='i'?7:14;r('K',0,0,neck,Math.max(2,Math.floor(h/3)));p('K',[[1,Math.floor(h/3)],[w-2,Math.floor(h/3)],[w,h-3],[w-2,h],[3,h],[0,h-3]]);p('D',[[2,Math.floor(h/3)+1],[w-3,Math.floor(h/3)+1],[w-1,h-3],[w-3,h-1],[3,h-1],[1,h-3]]);r('S',2,Math.floor(h/3)+1,w-5,1);if(code!=='h'){r('K',Math.floor(w/2),Math.floor(h/2),2,Math.max(2,Math.floor(h/3)));r('S',Math.floor(w/2)-1,Math.floor(h/2),1,2);if(code==='w'){r('J',5,h-6,w-10,1);r('L',5,Math.floor(h/3)+2,2,1);}}}else magDraw(r,p,code,w,h,id!=='G03',false);});}
 if(id.startsWith('M')){const[w,h,a,tip]={M01:[[3,2,[0,0],[3,1]],[6,4,[0,1],[6,2]],[12,8,[0,2],[12,4]]],M02:[[3,3,[0,1],[3,2]],[7,5,[0,1],[7,2]],[14,10,[0,2],[14,4]]],M10:[[3,2,[0,0],[3,1]],[7,4,[0,1],[7,2]],[14,8,[0,2],[14,4]]],M11:[[3,4,[0,0],[3,.5]],[8,8,[0,0],[8,3]],[16,16,[0,0],[16,6]]]}[id][ci];make(id.toLowerCase(),code,w,h,{item:id,slot:'muzzle',anchor:a,tip},(r,p)=>{r('K',0,0,w,h);r('D',1,1,w-2,Math.max(1,h-2));r('S',1,1,w-2,1);if(id==='M02'&&code!=='h')for(let x=2;x<w-1;x+=code==='w'?4:2)r('K',x,2,1,h-3);if(id==='M11'){r('K',1,Math.floor(h/2),w-1,1);if(code!=='h'){r('S',1,Math.floor(h/2)+1,w-2,1);r('K',w-2,2,1,Math.max(1,Math.floor(h/4)));}}if(code==='w'){r('J',2,h-3,w-5,1);r('L',2,1,w-5,1);}});}
 if(id.startsWith('T')){const combo=id==='T08',[w,h,a,beam]=(combo?[[4,3,[1,1],[3,1]],[9,6,[4,2],[8,3]],[18,12,[8,4],[16,6]]]:[[3,2,[1,0],[2,1]],[7,5,[3,1],[6,2]],[14,10,[6,2],[12,4]]])[ci];make(id.toLowerCase(),code,w,h,{item:id,slot:'pistolSide',anchor:a,beam},(r,p)=>{r('K',0,0,w,h);r('D',1,1,w-2,Math.max(1,h-2));r('S',1,1,w-2,1);r('K',w-2,0,1,h);if(code!=='h'){r('E',2,2,w-5,h-3);r('L',w-2,2,1,1);if(combo)r('S',w-3,h-2,1,1);if(code==='w'){r('J',2,2,w-7,1);r('K',3,h-4,3,1);}}});}
}
// Q24 parts have their own large, legible silhouettes rather than resized H/I components.
for(const id of newParts)make(id.toLowerCase(),'q24',24,24,{item:id,role:'icon'},(r,p)=>{
 const kind=id[0];
 if(kind==='A'){r('K',1,6,22,4);r('D',2,7,20,2);r('S',3,6,18,1);for(let x=4;x<22;x+=4)r('K',x,6,1,1);r('K',8,9,8,11);r('D',9,10,6,9);r('S',9,10,1,7);if(['A01','A02'].includes(id)){r('K',6,4,12,2);r('S',7,4,10,1);}else{r('K',11,13,2,3);r('L',11,13,1,1);}}
 if(kind==='B'){r('K',1,10,22,5);r('D',2,11,20,3);r('L',3,11,16,1);const x=id==='B03'?14:id==='B05'?12:id==='B06'?18:17;r('K',x,4,3,11);r('S',x+1,5,1,5);r('K',2,8,5,2);r('S',3,8,3,1);r('K',20,10,2,7);}
 if(kind==='H'){r('K',1,6,22,13);r('D',2,7,20,11);r('S',3,7,18,2);r('E',3,11,18,5);for(let x=4;x<21;x+=4){r('K',x,10,2,5);r('S',x,6,1,1);if(id!=='H06')r('S',x,18,1,1);}if(id==='H08'){r('D',3,14,17,2);r('L',3,14,12,1);}if(id==='H02')r('K',3,3,18,3);}
 if(kind==='S')stockDraw(r,p,'i',24,19,[23,5],id==='S05'?'skeleton':id==='S07'?'tactical':'solid');
 if(kind==='P'){p('K',[[7,2],[20,3],[16,22],[3,22],[4,18]]);p('D',[[8,4],[18,4],[14,20],[5,20]]);r('S',8,5,1,11);for(let y=7;y<19;y+=3)r('K',9,y,7,1);if(id==='P07'){r('K',15,5,2,2);r('L',15,5,1,1);}}
 if(kind==='G'){if(id==='G09'){r('K',8,1,7,6);p('K',[[4,6],[19,6],[23,10],[23,19],[19,23],[4,23],[0,19],[0,10]]);p('D',[[5,7],[18,7],[21,11],[21,18],[18,21],[5,21],[2,18],[2,11]]);r('S',5,8,13,2);r('K',10,12,4,6);r('L',10,12,1,2);}else if(id==='G03')magDraw(r,p,'i',21,22,false,true);else{r('K',1,9,22,7);r('D',2,10,20,5);r('L',3,10,18,1);r('K',20,10,1,5);r('K',2,7,3,3);if(id==='G07')r('K',17,7,3,3);}}
 if(kind==='M'){const twin=id==='M11';r('K',3,5,18,15);r('D',4,6,16,13);r('S',5,6,14,2);r('L',6,6,9,1);if(twin){r('K',4,11,16,2);r('S',5,14,14,2);r('K',16,8,2,2);r('K',16,16,2,2);}else if(id==='M02'){for(const x of [8,13,18])r('K',x,9,2,8);}else if(id==='M10'){r('E',5,13,14,4);r('K',18,8,1,10);}else {r('K',8,10,2,7);r('K',14,10,2,7);}}
 if(kind==='T'){r('K',2,6,20,13);r('D',3,7,18,11);r('S',4,7,14,2);r('E',5,11,10,5);r('K',17,8,3,8);r('L',18,9,1,3);r('K',6,3,10,4);if(id==='T08'){r('S',16,16,3,1);r('K',6,13,6,1);}else r('K',5,12,8,2);}
 // Silhouette details remain visible at 1x in grayscale, even between same-family fittings.
 if(id==='A02'){r('K',14,15,5,6);r('D',15,16,3,4);}
 if(id==='A05'){r('K',4,12,16,9);r('D',5,13,14,7);r('S',6,13,1,5);r('K',9,15,6,4);}
 if(id==='A06'){r([0,0,0,0],7,10,10,11);r('K',3,9,4,11);r('K',17,9,4,11);r('S',4,10,1,8);r('S',18,10,1,8);}
 if(id==='B05')r('K',3,16,10,2);
 if(id==='B06'){r('K',20,7,3,11);r('S',21,8,1,7);}
 if(id==='B09'){r('K',8,6,5,3);r('S',9,6,3,1);}
 if(id==='H06'){r([0,0,0,0],0,0,24,24);p('K',[[4,7],[19,7],[22,9],[22,16],[19,18],[4,18],[1,16],[1,9]]);r('D',3,8,17,9);r('S',5,8,13,1);for(let x=5;x<19;x+=3)r('K',x,10,1,6);}
 if(id==='H08'){r('K',7,19,10,2);r('S',8,19,8,1);r([0,0,0,0],1,6,2,2);r([0,0,0,0],21,6,2,2);}
 if(id==='H09'){r('K',1,4,4,17);r('S',2,5,1,14);r('K',9,19,11,2);r('S',10,19,9,1);}
 if(id==='S05'){r([0,0,0,0],0,0,24,24);r('K',2,4,4,17);r('D',3,5,2,15);r('K',5,7,18,3);r('S',6,7,14,1);r('K',5,16,13,3);r('S',6,16,10,1);r('K',20,7,3,6);}
 if(id==='P07'){r([0,0,0,0],0,0,24,24);p('K',[[9,3],[18,4],[15,21],[5,21]]);p('D',[[10,5],[16,5],[13,19],[7,19]]);r('S',10,6,1,9);for(let y=8;y<18;y+=3)r('K',11,y,4,1);r('L',13,6,1,1);r('L',9,17,1,1);}
 if(id==='M10'){r([0,0,0,0],0,0,24,24);r('K',3,8,16,9);r('D',4,9,14,7);r('S',5,9,12,1);r('K',17,5,4,15);r('D',18,6,2,13);r('L',18,7,1,4);}
 if(id==='T04'){r([0,0,0,0],0,0,24,24);r('K',4,8,16,9);r('D',5,9,14,7);r('S',6,9,11,1);r('K',10,5,6,3);r('K',18,7,3,11);r('L',19,9,1,3);}
});
// Exact legacy splits. Replay image pixels into native row runs so every delivered bitmap has a reproducible source.
function nativeImage(name,code,image,meta){return make(name,code,image.w,image.h,meta,(r)=>{for(let y=0;y<image.h;y++)for(let x=0;x<image.w;){const at=(y*image.w+x)*4;if(!image.data[at+3]){x++;continue;}const color='#'+image.data.subarray(at,at+3).toString('hex');let end=x+1;while(end<image.w){const j=(y*image.w+end)*4;if(image.data[j+3]!==255||image.data.subarray(j,j+3).toString('hex')!==color.slice(1))break;end++;}r(color,x,y,end-x,1);x=end;}});}
for(const [gun,grip,tip,mount,hand] of [['pistol',[6,6],[17,2.5],[8,0],[6,6]],['shotgun',[11,6],[32,2.5],[15,0],[21,6]]]){
 const image=decode(resolve(root,`assets/coast/v1/coast-weapon-${gun}-held-v1.png`));
 nativeImage(`${gun}-receiver`,'h',image,{gun,role:'receiver',wholeCanvasLayer:true,grip,bore:2.5,tip,forward:gun==='pistol'?8:0,hand,mounts:{mount,muzzle:[tip[0]-1,2]},originalSource:`assets/coast/v1/coast-weapon-${gun}-held-v1.png`});
}
for(const [code,x,height,barrelY,tipY] of [['h',22,6,3,3.5],['w',118,18,10,12]]){
 const old=m2.assets.find(a=>a.id===`gs-carbine-receiver-${code}-v1`),original=decode(resolve(root,old.file));
 const receiver=canvas(old.w,old.h);blit(receiver,original,0,0);rect(receiver,[0,0,0,0],x+1,0,old.w-x-1,height);
 const barrel=crop(original,x,0,old.w-x,height),mounts={...old.mounts,barrel:[x,barrelY]};delete mounts.muzzle;
 nativeImage('carbine-receiver',code,receiver,{gun:'carbine',role:'receiver',revision:2,replacesSha256:old.sha256,mounts,...(code==='h'?{wholeCanvasLayer:true,grip:old.grip,bore:old.bore,forward:0}:{wholeGunCanvas:true})});
 nativeImage('carbine-barrel-factory',code,barrel,{gun:'carbine',role:'factory',slot:'barrel',anchor:[0,barrelY],mounts:{muzzle:[barrel.w-1,barrelY]},tip:[barrel.w,tipY],sourceRect:[x,0,barrel.w,height]});
}
const legacy=JSON.parse(readFileSync(fileURLToPath(new URL('legacy-inventory.json',import.meta.url))));
const virtual=[
 {key:'gs-pistol-receiver-i',gun:'pistol',role:'receiver',w:38,h:17,output:'inventory',anchor:null,mounts:{mount:[18,1],muzzle:[37,3]},tip:[38,5.5],sourceKey:'pistol'},
 {key:'gs-shotgun-receiver-i',gun:'shotgun',role:'receiver',w:78,h:17,output:'inventory',anchor:null,mounts:{mount:[35,3],muzzle:[77,3]},tip:[78,6],sourceKey:'shotgun'},
 {key:'gs-carbine-receiver-i',gun:'carbine',role:'receiver',w:78,h:17,output:'inventory',anchor:null,mounts:{handguard:[44,8],mount:[33,4],barrel:[59,5]},sourceKey:'carbine',clearRects:[[44,8,15,2],[60,0,18,11]],fillRects:[['#425a60',44,8,15,2]]},
 {key:'gs-carbine-handguard-factory-i',gun:'carbine',role:'factory',slot:'handguard',w:78,h:17,output:'inventory',anchor:[44,8],sourceKey:'carbine',rect:[44,8,15,2],wholeCanvasLayer:true},
 {key:'gs-carbine-barrel-factory-i',gun:'carbine',role:'factory',slot:'barrel',w:19,h:11,output:'inventory',anchor:[0,5],mounts:{muzzle:[18,5]},tip:[19,6],sourceKey:'carbine',rect:[59,0,19,11]}
];
// The approved old sprites use different barrel centre rows. Keep shared new-gun art and add explicit gun variants.
make('m01','h-pistol',3,1,{item:'M01',slot:'muzzle',anchor:[0,0],tip:[3,.5],variantFor:'pistol'},r=>r('K',0,0,3,1));
make('m01','i-pistol',6,6,{item:'M01',slot:'muzzle',anchor:[0,1],tip:[6,3.5],variantFor:'pistol'},r=>{r('K',0,1,1,4);r('K',0,2,6,3);r('S',1,3,4,1);});
make('m01','w-pistol',12,12,{item:'M01',slot:'muzzle',anchor:[0,2],tip:[12,7],variantFor:'pistol'},r=>{r('K',0,2,1,9);r('K',0,3,12,8);r('D',1,4,10,6);r('S',2,5,8,2);r('L',2,5,5,1);r('K',8,7,1,3);});
make('m05','h-carbine',3,2,{item:'M05',slot:'muzzle',anchor:[0,0],tip:[3,.5],variantFor:'carbine'},r=>{r('K',0,0,3,2);r('S',1,0,1,1);});
make('m07','h-carbine',8,3,{item:'M07',slot:'muzzle',anchor:[0,1],tip:[8,1.5],variantFor:'carbine'},r=>{r('K',0,0,8,3);r('S',1,1,6,1);r('D',6,1,1,1);});
finish('P0+P1',virtual);
