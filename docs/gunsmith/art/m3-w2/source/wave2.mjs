// P1 native-grid drawings; imports P0 drawing recipes but never alters their pixels.
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { make,all,sources,finish } from './export.mjs';
import { canvas,rect,blit,decode,save,text,colors } from './pixels.mjs';
const root=fileURLToPath(new URL('../../../../..',import.meta.url)),docs='docs/gunsmith/art/m3-w2',formal=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json')));
const clear=[0,0,0,0],codes=['h','i','w'];
const specs={
 mb1911:[{size:[18,9],grip:[6,6],hand:[6,6],bore:2,tip:[18,2],mounts:{mount:[6,0],barrel:[17,1],muzzle:[17,1],rearGrip:[4,4],mag:[4,8],pistolSide:[14,4]}},{size:[42,17],tip:[42,4],mounts:{mount:[13,1],barrel:[41,3],muzzle:[41,3],rearGrip:[8,8],mag:[8,16],pistolSide:[34,8]}},{size:[84,34],tip:[84,8],mounts:{mount:[26,2],barrel:[83,6],muzzle:[83,6],rearGrip:[16,16],mag:[16,32],pistolSide:[68,16]}}],
 umpb45:[{size:[16,6],grip:[4,5],hand:[12,5],bore:3,mounts:{barrel:[15,2],stock:[0,2],rearGrip:[3,4],mag:[7,4],top:[6,0],under:[12,5],side1:[13,3]}},{size:[40,9],mounts:{barrel:[39,3],stock:[0,3],rearGrip:[7,7],mag:[18,7],top:[15,0],under:[30,8],side1:[33,5]}},{size:[80,18],mounts:{barrel:[78,6],stock:[0,6],rearGrip:[14,14],mag:[36,14],top:[30,0],under:[60,16],side1:[66,10]}}],
 pb90:[{size:[25,10],grip:[16,7],hand:[21,7],bore:4,tip:[25,4],mounts:{top:[18,0],side1:[20,4],muzzle:[24,3],mag:[2,2]}},{size:[56,17],tip:[56,6],mounts:{top:[40,0],side1:[47,6],muzzle:[55,5],mag:[4,3]}},{size:[112,34],tip:[112,12],mounts:{top:[80,0],side1:[94,12],muzzle:[111,10],mag:[8,6]}}],
 svdb:[{size:[37,10],grip:[13,5],hand:[24,5],bore:3,tip:[37,3],mounts:{top:[15,0],bipod:[29,4],muzzle:[36,2]}},{size:[92,17],tip:[92,6],mounts:{top:[36,0],bipod:[73,7],muzzle:[91,5]}},{size:[184,34],tip:[184,12],mounts:{top:[72,0],bipod:[146,14],muzzle:[183,10]}}],
 mb14:[{size:[25,7],grip:[2,5],hand:[16,4],bore:3,tip:[25,3],mounts:{top:[8,0],bipod:[18,4],muzzle:[24,2],stock:[0,3],mag:[8,5]}},{size:[62,10],tip:[62,6],mounts:{top:[18,0],bipod:[46,7],muzzle:[61,5],stock:[0,4],mag:[20,7]}},{size:[124,20],tip:[124,12],mounts:{top:[36,0],bipod:[92,14],muzzle:[123,10],stock:[0,8],mag:[40,14]}}],
 mb700:[{size:[15,7],grip:[3,5],hand:[12,5],bore:3,mounts:{top:[8,0],bipod:[13,4],muzzle:[14,2],barrel:[14,2],stock:[0,3]}},{size:[37,10],mounts:{top:[18,0],bipod:[32,7],muzzle:[36,3],barrel:[36,3],stock:[0,4]}},{size:[74,20],mounts:{top:[36,0],bipod:[64,14],muzzle:[73,6],barrel:[72,6],stock:[0,8]}}],
 rpkb:[{size:[29,6],grip:[4,4],bore:2,tip:[29,2],mounts:{mount:[7,0],bipod:[21,4],muzzle:[28,1],handguard:[13,3],stock:[0,2],rearGrip:[3,4],mag:[9,4]}},{size:[74,8],tip:[74,3],mounts:{mount:[17,0],bipod:[56,5],muzzle:[73,2],handguard:[34,4],stock:[0,3],rearGrip:[7,6],mag:[22,6]}},{size:[148,16],tip:[148,6],mounts:{mount:[34,0],bipod:[112,10],muzzle:[147,4],handguard:[68,8],stock:[0,6],rearGrip:[14,12],mag:[44,12]}}]
};
for(const [gun,list]of Object.entries(specs))for(const [ci,code]of codes.entries()){
 const {size,...meta}=list[ci],[w,h]=size;
 make(gun+'-receiver',code,w,h,{gun,role:'receiver',...meta,...(code==='h'?{forward:gun==='mb1911'?8:0}:{})},(r,p)=>{
  if(gun==='mb1911'){
   if(code==='h'){r('K',0,1,18,3);r('K',1,0,2,1);r('D',1,2,16,1);r('L',4,1,12,1);p('K',[[3,3],[11,3],[11,6],[8,7],[7,9],[2,9],[4,4]]);p('T',[[4,4],[8,4],[6,8],[3,8]]);r('W',4,5,1,2);r('K',9,4,2,2);r(clear,9,5,1,1);}
   else if(code==='i'){p('K',[[0,3],[2,1],[5,1],[6,0],[40,0],[42,2],[42,7],[24,7],[24,12],[19,13],[17,17],[5,17],[8,8],[1,8]]);r('D',2,2,38,4);r('S',6,1,33,2);r('L',8,1,29,1);for(const x of [3,6])r('K',x,3,1,3);r('K',28,3,7,2);p('T',[[9,8],[18,8],[15,16],[6,16]]);r('W',10,9,5,5);r('U',10,9,1,4);r('K',20,8,4,1);r('S',22,9,1,2);r('K',11,11,1,1);}
   else{p('K',[[0,6],[4,2],[10,2],[12,0],[80,0],[84,4],[84,14],[48,14],[48,24],[38,26],[34,34],[10,34],[16,16],[2,16]]);r('D',2,5,80,8);r('J',7,3,70,3);r('S',12,2,66,2);r('L',16,2,56,1);for(const x of [5,10,15])r('K',x,7,2,5);r('K',56,6,14,3);r('S',57,9,11,1);p('T',[[18,16],[36,16],[30,32],[12,32]]);p('W',[[20,18],[32,18],[27,29],[15,30]]);r('U',20,18,1,7);for(const y of [21,25,29])r('T',20-Math.floor((y-21)/4),y,8,1);for(const [x,y]of [[23,20],[19,28]]){r('K',x,y,2,2);r('S',x,y,1,1);}r('K',40,16,8,2);r('S',44,18,1,4);}
  }else if(gun==='pb90'){
   if(code==='h'){p('K',[[0,3],[3,2],[15,2],[16,0],[22,0],[22,3],[25,3],[25,5],[23,6],[22,10],[16,10],[15,8],[13,9],[1,9]]);p('V',[[1,4],[14,3],[16,4],[23,4],[23,5],[21,6],[21,9],[17,9],[15,6],[12,8],[2,8]]);r('G',2,4,12,1);r('S',17,1,4,1);r('D',23,3,2,1);r('K',16,5,6,3);r(clear,17,6,3,2);r('K',10,5,4,3);r(clear,11,6,2,1);r('V',15,8,2,1);}
   else if(code==='i'){p('K',[[0,5],[4,3],[34,3],[36,0],[49,0],[50,5],[56,5],[56,9],[52,10],[50,17],[36,17],[33,13],[28,15],[2,15]]);p('V',[[1,5],[5,4],[33,4],[35,6],[54,6],[54,8],[51,9],[49,16],[37,16],[33,11],[27,14],[3,14]]);r('G',3,7,28,2);r('S',38,1,10,2);r('D',38,3,10,2);r('K',35,8,14,6);r(clear,38,9,8,4);r('K',22,8,10,5);r(clear,24,9,6,3);r('S',53,6,2,1);r('D',5,11,1,2);r('K',47,5,3,3);r('L',48,5,1,1);}
   else{p('K',[[0,10],[8,6],[68,6],[72,0],[98,0],[100,10],[112,10],[112,18],[104,20],[100,34],[72,34],[66,26],[56,30],[4,30]]);p('V',[[1,10],[9,7],[67,7],[70,12],[110,12],[110,16],[103,19],[99,33],[73,33],[66,23],[55,29],[5,29]]);r('G',5,14,58,5);r('B',8,14,42,1);r('S',76,2,20,3);r('J',76,5,20,4);r('L',78,2,15,1);r('K',70,16,28,12);r(clear,76,18,16,8);r('K',44,16,20,10);r(clear,48,18,12,6);r('G',67,24,3,4);r('S',106,12,4,1);for(const [x,y]of [[11,23],[67,20],[96,11]]){r('K',x,y,3,3);r('S',x+1,y+1,1,1);}r('K',94,10,6,6);r('J',95,11,4,4);r('L',96,11,1,1);}
  }else if(gun==='svdb'){
   if(code==='h'){p('K',[[0,2],[9,2],[12,3],[18,1],[29,1],[29,2],[37,2],[37,4],[28,4],[27,6],[21,6],[19,10],[15,10],[14,6],[11,5],[9,8],[0,9]]);p('T',[[1,3],[9,3],[11,4],[9,7],[1,8]]);r('W',1,3,7,1);r(clear,3,4,5,2);r('D',13,3,9,2);r('S',15,1,6,1);r('K',15,0,1,1);r('L',16,2,5,1);r('W',22,3,6,2);r('K',24,3,1,1);r('S',29,2,8,1);r('D',16,6,3,3);}
   else if(code==='i'){p('K',[[0,5],[22,5],[29,7],[35,1],[73,1],[73,5],[92,5],[92,8],[70,8],[68,11],[52,11],[48,17],[39,17],[37,11],[29,10],[23,15],[0,17]]);p('T',[[1,6],[21,6],[27,8],[22,14],[1,16]]);p('W',[[2,6],[20,6],[24,8],[21,12],[2,14]]);p(clear,[[6,8],[20,8],[17,12],[6,13]]);r('D',30,5,24,5);r('S',35,2,18,2);r('L',37,2,13,1);r('K',35,0,3,2);r('K',41,5,11,2);r('W',55,3,17,6);r('U',56,3,14,1);for(const x of [59,64,69])r('K',x,5,2,1);r('S',74,6,17,1);p('D',[[40,10],[48,10],[47,16],[40,16]]);r('S',41,11,1,4);}
   else{p('K',[[0,10],[44,10],[58,14],[70,2],[146,2],[146,10],[184,10],[184,16],[140,16],[136,22],[104,22],[96,34],[78,34],[74,22],[58,20],[46,30],[0,34]]);p('T',[[1,11],[43,11],[56,15],[45,29],[1,33]]);p('W',[[3,12],[40,12],[50,16],[43,24],[3,29]]);p(clear,[[12,16],[40,16],[34,24],[12,27]]);r('U',5,12,32,1);r('D',60,10,48,10);r('J',62,11,41,3);r('S',70,4,36,3);r('L',74,4,26,1);r('K',70,0,6,4);r('K',82,10,22,4);r('S',84,14,14,1);r('W',110,6,34,12);r('U',112,6,27,2);for(const x of [118,128,138]){r('K',x,10,4,2);r('T',x,13,3,1);}r('S',148,12,35,2);r('L',150,12,25,1);p('D',[[80,20],[96,20],[94,32],[80,32]]);for(const x of [82,87,92])r('J',x,23,1,7);for(const [x,y]of [[62,16],[103,15]]){r('K',x,y,3,3);r('S',x+1,y,1,1);}}
  }else if(gun==='rpkb'){
   const ak=formal.assets.find(a=>a.id===`gs-akb74-receiver-${code}-v1`),src=decode(resolve(root,ak.file));
   // Retain the AK family's authored receiver geometry, recolour original pixels, then add a longer native barrel.
   for(let y=0;y<src.h;y++)for(let x=0;x<src.w;x++)if(src.data[(y*src.w+x)*4+3]){const v='#'+src.data.subarray((y*src.w+x)*4,(y*src.w+x)*4+3).toString('hex');r(v,x,y,1,1);}
   if(code==='h'){r('K',14,1,15,3);r('S',15,2,13,1);r('K',25,0,1,3);r('L',25,0,1,1);r('D',10,3,2,1);}
   if(code==='i'){r('K',35,2,39,4);r('S',36,3,37,1);r('D',36,4,37,1);r('K',65,0,2,5);r('L',65,1,1,1);r('K',44,1,3,4);r('S',45,1,1,1);}
   if(code==='w'){r('K',70,4,78,8);r('S',72,5,73,2);r('L',74,5,64,1);r('J',72,8,73,1);r('K',130,0,4,10);r('S',131,1,1,5);r('K',88,2,6,8);r('S',89,3,2,1);r('K',139,4,2,8);}
  }else{
   if(code==='h'){p('K',[[0,2],[2,0],[w-2,0],[w,2],[w,5],[6,5],[5,h],[2,h],[3,5],[0,5]]);r('D',1,2,w-2,2);r('S',3,1,w-5,1);r('L',3,1,Math.max(2,w-9),1);r('K',6,2,5,1);
    if(gun==='umpb45'){r('K',11,4,4,2);r('S',12,5,2,1);r('K',7,3,4,1);}else{r('W',3,4,w-5,2);r('K',7,3,2,1);if(gun==='mb700'){r('K',9,3,1,3);r('K',10,5,2,1);r('S',10,5,1,1);}if(gun==='mb14'){r('K',20,2,5,2);r('S',21,2,3,1);}}
   }else if(code==='i'){p('K',[[0,3],[4,0],[w-3,0],[w,2],[w,7],[16,7],[14,h],[5,h],[8,8],[0,7]]);r('D',1,3,w-2,3);r('S',4,1,w-7,2);r('L',6,1,w-13,1);r('K',14,3,Math.max(5,Math.floor(w/3)),1);r('E',2,5,w-5,1);
    if(gun==='umpb45'){for(let x=12;x<w-3;x+=4)r('D',x,0,1,1);r('K',29,6,5,3);r('S',30,7,3,1);}else{r('W',3,6,w-6,3);r('U',4,6,w-10,1);r('K',17,5,4,1);if(gun==='mb700'){r('K',23,4,2,5);r('K',24,8,5,2);r('S',25,8,2,1);}else{r('K',49,5,13,3);r('S',50,6,10,1);}}
   }else{p('K',[[0,6],[8,0],[w-6,0],[w,4],[w,14],[32,14],[28,h],[10,h],[16,16],[0,14]]);r('D',1,6,w-2,7);r('J',5,3,w-10,3);r('S',8,2,w-15,2);r('L',12,2,w-26,1);r('K',28,6,Math.max(10,Math.floor(w/3)),2);r('E',3,11,w-7,2);
    if(gun==='umpb45'){for(let x=24;x<w-6;x+=7)r('J',x,0,2,1);r('K',58,12,10,6);r('S',60,13,5,1);r('K',14,8,3,3);r('L',15,8,1,1);}else{r('W',6,12,w-12,6);r('U',8,12,w-20,1);for(let x=11;x<w-9;x+=11)r('T',x,15,6,1);if(gun==='mb700'){r('K',46,8,4,10);r('K',48,16,10,4);r('S',50,17,5,1);r('L',51,17,2,1);}else{r('K',98,10,26,6);r('S',100,11,20,2);}}for(const [x,y]of [[7,8],[w-8,9]]){r('K',x,y,3,3);r('S',x+1,y,1,1);}
   }
  }
 });
}
// Target-grid component renderers: each resolution has its own contour and material details.
function stock(r,p,c,w,h,a,kind){
 const wood=['wood','precision'].includes(kind),skeleton=['skeleton','light'].includes(kind);
 if(c==='h'){p('K',[[0,0],[3,0],[w-2,a[1]],[w,a[1]],[w,a[1]+2],[3,h],[0,h]]);p(wood?'W':'D',[[1,1],[w-2,a[1]+1],[3,h-1],[1,h-1]]);r(wood?'U':'S',1,1,Math.max(1,w-4),1);if(skeleton)r(clear,3,2,Math.max(1,w-6),2);if(kind==='precision')r('K',3,0,4,1);}
 else if(c==='i'){p('K',[[0,0],[7,0],[w-3,a[1]],[w,a[1]],[w,a[1]+3],[8,h],[1,h]]);p(wood?'T':'D',[[1,1],[7,1],[w-2,a[1]+1],[7,h-1],[2,h-1]]);p(wood?'W':'S',[[2,1],[6,1],[w-5,a[1]+1],[7,h-4],[2,h-3]]);if(skeleton)p(clear,[[6,4],[w-5,a[1]+2],[8,h-4],[6,h-4]]);if(kind==='precision'){r('K',6,0,12,2);r('D',7,1,10,1);}r('K',2,2,1,h-4);}
 else{p('K',[[0,0],[14,0],[w-6,a[1]],[w,a[1]],[w,a[1]+6],[16,h],[2,h]]);p(wood?'T':'D',[[1,1],[13,1],[w-2,a[1]+1],[15,h-1],[3,h-1]]);p(wood?'W':'J',[[3,2],[12,2],[w-8,a[1]+2],[14,h-5],[4,h-4]]);r(wood?'U':'L',4,2,8,1);if(skeleton)p(clear,[[12,8],[w-10,a[1]+4],[16,h-8],[12,h-8]]);else for(let y=7;y<h-4;y+=5)r(wood?'T':'E',5,y,Math.max(4,w-18),1);if(kind==='precision'){r('K',12,0,24,4);r('J',14,1,20,2);r('S',15,1,16,1);}r('K',3,3,2,h-6);r('S',4,4,1,5);}
 r('K',w-1,a[1],1,1);
}
function barrel(r,p,c,w,h,a,kind){const y=a[1];r('K',0,y,w,c==='h'?2:c==='i'?4:8);r('S',1,y+1,w-2,1);if(c==='h'){if(kind==='thread')r('D',w-2,y,1,2);else r('K',w-3,0,1,y+2);}else{r('L',2,y+1,w-5,1);r('D',1,y+(c==='w'?4:2),w-2,1);if(c==='w'){r('J',4,y+3,w-8,1);for(let x=w-7;x<w-1;x+=2)r('K',x,y,1,3);}if(kind!=='thread'){r('K',w-7,0,2,y+3);r('S',w-6,1,1,y);} }r('K',0,y,1,1);}
function magazine(r,p,c,w,h,kind){
 if(kind==='horizontal'){r('K',0,0,w,h);r('T',1,1,w-2,Math.max(1,h-2));r('U',1,1,w-2,1);if(c!=='h')for(let x=3;x<w-2;x+=c==='w'?6:3)r('W',x,1,c==='w'?2:1,h-2);}
 else{const curved=kind==='curved',neck=curved?Math.floor(w*.55):w;p('K',[[0,0],[neck,0],[w,h-2],[w-1,h],[1,h]]);p(kind==='wood'?'T':'D',[[1,1],[Math.max(2,neck-1),1],[w-1,h-2],[w-2,h-1],[2,h-1]]);if(c==='h')r('S',1,1,1,Math.max(1,h-3));else{r('S',2,1,c==='w'?2:1,h-3);for(let y=3;y<h-2;y+=c==='w'?4:3)r('E',3,y,w-4,1);if(c==='w')r('L',2,2,1,3);}}
 r('K',0,0,1,1);
}
function grip(r,p,c,w,h,wood=false){p('K',[[0,0],[w,1],[w-2,h],[0,h],[1,h-3]]);p(wood?'T':'D',[[1,1],[w-2,2],[w-3,h-1],[1,h-1]]);r(wood?'W':'S',2,2,1,Math.max(1,h-4));if(c!=='h')for(let y=4;y<h-2;y+=c==='w'?3:2)r(wood?'W':'K',3,y,Math.max(1,w-5),1);if(c==='w')r(wood?'U':'L',3,3,1,3);r('K',0,0,1,1);}
function guard(r,p,c,w,h,a,rail){r('K',0,0,w,h);r(rail?'D':'T',1,1,w-2,h-2);r(rail?'S':'W',1,1,w-2,1);if(c==='h'){r('K',2,1,1,1);r('K',w-3,1,1,1);}else{for(let x=3;x<w-2;x+=c==='w'?6:4)r('K',x,c==='w'?4:2,c==='w'?3:2,c==='w'?2:1);if(c==='w'){r(rail?'J':'U',3,2,w-6,1);r('L',2,2,1,1);}if(rail)for(let x=2;x<w-1;x+=c==='w'?5:3)r('S',x,h-1,1,1);}r('K',0,a[1],1,1);}
const factory={
 umpb45:{stock:[[7,6,[6,1]],[18,12,[17,3]],[36,24,[35,6]]],reargrip:[[4,5,[0,0]],[9,10,[0,0]],[18,20,[0,0]]],mag:[[3,6,[0,0]],[8,11,[0,0]],[16,22,[0,0]]],barrel:[[4,4,[0,1]],[10,7,[0,2]],[20,14,[0,4]]]},
 pb90:{mag:[[12,2,[0,0]],[28,4,[0,0]],[56,8,[0,0]]]},
 mb14:{stock:[[11,7,[10,1]],[28,15,[27,4]],[56,30,[55,8]]],mag:[[4,5,[0,0]],[9,10,[0,0]],[18,20,[0,0]]]},
 mb700:{stock:[[11,7,[10,1]],[28,15,[27,4]],[56,30,[55,8]]],barrel:[[11,4,[0,1]],[29,7,[0,2]],[58,14,[0,4]]]},
 rpkb:{stock:[[9,6,[8,1]],[24,12,[23,3]],[48,24,[47,6]]],reargrip:[[4,6,[0,0]],[9,10,[0,0]],[18,20,[0,0]]],mag:[[6,6,[0,0]],[13,10,[0,0]],[26,20,[0,0]]],handguard:[[7,4,[0,1]],[18,8,[0,2]],[36,16,[0,4]]]}
};
for(const [gun,slots]of Object.entries(factory))for(const [slot,grids]of Object.entries(slots))for(const [ci,c]of codes.entries()){
 const [w,h,a]=grids[ci],meta={gun,role:'factory',slot:slot==='reargrip'?'rearGrip':slot,anchor:a};if(gun==='pb90')meta.layer='aboveReceiver';
 if(slot==='barrel'){meta.mounts={muzzle:[w-1,a[1]]};meta.tip=[w,c==='h'?2:c==='i'?3:6];}
 if(slot==='handguard')meta.hand=c==='h'?[3,3]:c==='i'?[8,6]:[16,12];
 make(`${gun}-${slot}-factory`,c,w,h,meta,(r,p)=>{if(slot==='stock')stock(r,p,c,w,h,a,gun==='umpb45'?'skeleton':'wood');if(slot==='reargrip')grip(r,p,c,w,h,gun==='rpkb');if(slot==='mag')magazine(r,p,c,w,h,gun==='pb90'?'horizontal':gun==='rpkb'?'curved':'straight');if(slot==='barrel')barrel(r,p,c,w,h,a,'factory');if(slot==='handguard')guard(r,p,c,w,h,a,false);});
}
export const p1Parts=['A03','B02','B04','B10','H10','S06','S09','S10','P05','P08','G02','G04','G05','G11','G12','M04','M08','M09','M12','F08','O02','O04','O06','O07','O12','O09','O11','F02','F05','F06','T03','T06','T07','T09'];
const dimensions={
 A03:[[5,2],[12,3],[24,6]],B02:[[3,3],[7,6],[14,12]],B04:[[6,4],[15,7],[30,14]],B10:[[8,4],[20,7],[40,14]],H10:[[9,4],[20,7],[40,14]],S06:[[6,5],[16,11],[32,22]],S09:[[12,7],[30,15],[60,30]],S10:[[9,6],[23,13],[46,26]],P05:[null,[9,10],[18,20]],P08:[null,[11,9],[22,18]],G02:[[3,4],[7,7],[14,14]],G04:[[4,7],[9,12],[18,24]],G05:[[9,2],[22,4],[44,8]],G11:[[5,6],[10,11],[20,22]],G12:[[4,6],[10,10],[20,20]],M04:[[6,3],[14,6],[28,12]],M08:[[10,3],[25,6],[50,12]],M09:[[4,3],[10,6],[20,12]],M12:[[6,3],[14,6],[28,12]],F08:[[7,2],[16,4],[32,8]],O02:[[4,3],[9,5],[18,10]],O04:[[5,3],[12,6],[24,12]],O06:[[7,3],[16,7],[32,14]],O07:[[8,4],[19,7],[38,14]],O12:[[5,2],[12,3],[24,6]],O09:[[13,4],[32,8],[64,16]],O11:[[12,4],[29,8],[58,16]],F02:[[3,4],[6,9],[12,18]],F05:[[3,3],[7,6],[14,12]],F06:[[4,3],[10,6],[20,12]],T03:[[4,2],[10,4],[20,8]],T06:[[5,3],[12,5],[24,10]],T07:[[4,3],[10,5],[20,10]],T09:[[5,3],[12,6],[24,12]]};
function drawOptic(r,p,c,w,h,id){
 const low=id==='O12',closed=['O02','O04'].includes(id),scope=['O09','O11'].includes(id);
 if(low){r('K',0,h-1,w,1);r('K',1,0,1,h);r('K',w-2,0,1,h);if(c!=='h'){r('S',2,h-2,w-4,1);r(clear,3,0,w-6,h-2);}return;}
 if(closed){r('K',1,0,w-2,h-1);r('K',0,h-1,w,1);r('S',2,1,w-4,1);if(c==='h')r('D',2,1,1,1);else{r('D',2,2,w-4,h-4);r('L',w-3,2,1,Math.max(1,h-4));if(c==='w'){r('J',3,3,w-7,h-7);r('K',4,h-4,2,2);r('S',4,h-4,1,1);}}}
 else{const lens=c==='h'?2:c==='i'?4:8,cy=c==='h'?1:c==='i'?2:4;r('K',0,0,lens,h-1);r('K',lens-1,cy,w-lens*2+2,c==='h'?2:c==='i'?3:6);r('K',w-lens,scope?0:1,lens,h-1);r('D',1,1,Math.max(1,w-2),Math.max(1,h-3));r('S',lens,cy,Math.max(1,w-lens*2),1);r('L',1,1,1,1);r('K',Math.floor(w/2)-1,0,c==='w'?5:2,cy+1);r('K',Math.floor(w/3),h-2,Math.floor(w/3),2);if(c!=='h'){r('S',w-lens+1,2,Math.max(1,lens-2),Math.max(1,h-5));r('K',lens,cy,1,c==='w'?6:3);if(c==='w'){r('L',lens+3,cy,w-lens*2-6,1);r('J',lens+2,cy+2,w-lens*2-4,1);r('K',w-lens-4,cy,2,6);}}}
}
for(const id of p1Parts)for(const [ci,c]of codes.entries()){
 const d=dimensions[id][ci];if(!d)continue;const[w,h]=d,k=id[0],optic=k==='O',fore=['F02','F05','F06'].includes(id),side=k==='T',bar=k==='B',stockPart=k==='S',mag=k==='G',isGrip=k==='P',muzzle=k==='M',base=k==='A',hg=k==='H';
 const a=optic||base?[Math.floor((w-1)/2),h-1]:fore?[Math.floor((w-1)/2),0]:stockPart?[w-1,c==='h'?1:c==='i'?3:6]:bar||hg?[0,c==='h'?1:c==='i'?2:4]:side?[Math.floor((w-1)/2),c==='h'?0:c==='i'?1:2]:muzzle?[0,c==='h'?1:c==='i'?2:4]:[0,0];
 const meta={item:id,slot:optic?(id==='O02'?'micro':'top'):fore?'under':side?'side':bar?'barrel':stockPart?'stock':mag?'mag':isGrip?'rearGrip':muzzle?'muzzle':base?'mount':hg?'handguard':'bipod',anchor:a};
 if(['P08','G02','G05'].includes(id))meta.layer='aboveReceiver';
 if(bar||muzzle){meta.tip=[w,c==='h'?2:c==='i'?3:6];if(bar)meta.mounts={muzzle:[w-1,a[1]]};}
 if(base)meta.mounts={micro:[a[0],0]};
 if(fore)meta.hand=[c==='h'?1:c==='i'?2:4,c==='h'?1:c==='i'?2:4];
 if(side)meta.beam=[w-1,c==='h'?1:c==='i'?2:4];
 if(hg){meta.hand=c==='h'?[4,3]:c==='i'?[8,5]:[16,10];meta.mounts=c==='h'?{under:[4,3],side1:[7,1],side2:[2,1]}:c==='i'?{under:[8,6],side1:[15,2],side2:[5,2]}:{under:[16,12],side1:[30,4],side2:[10,4]};}
 make(id.toLowerCase(),c,w,h,meta,(r,p)=>{
  if(optic)drawOptic(r,p,c,w,h,id);
  if(base){r('K',0,0,w,1);r('K',a[0],0,1,h);r('K',Math.max(0,a[0]-2),h-1,Math.min(5,w),1);if(c!=='h'){r('S',1,0,w-2,1);r('D',a[0]-1,1,3,h-2);if(c==='w')r('L',a[0],1,1,1);}}
  if(bar)barrel(r,p,c,w,h,a,id==='B02'?'thread':id==='B10'?'light':'stable');
  if(stockPart)stock(r,p,c,w,h,a,id==='S09'?'precision':id==='S10'?'light':'skeleton');
  if(isGrip)grip(r,p,c,w,h,id==='P08');
  if(mag)magazine(r,p,c,w,h,id==='G05'?'horizontal':'straight');
  if(hg)guard(r,p,c,w,h,a,true);
  if(muzzle){r('K',0,0,w,h);r('D',1,1,w-2,Math.max(1,h-2));r('S',1,1,w-2,1);if(c!=='h'){r('L',2,1,Math.max(1,w-5),1);if(id==='M09'){for(let x=3;x<w-2;x+=c==='w'?5:3)r('K',x,2,c==='w'?2:1,h-3);}else{r('E',2,h-2,w-3,1);r('K',w-3,1,1,h-2);if(c==='w'){r('J',4,4,w-9,1);r('K',3,3,1,h-5);}}}}
  if(id==='F08'){r('K',0,0,w,1);r('K',0,h-1,w,1);r('K',w-1,0,1,h);r('S',1,h-1,w-3,1);if(c!=='h'){r('D',1,1,w-2,h-2);r('K',Math.floor(w/2),1,1,h-1);if(c==='w'){r('L',2,1,w-6,1);r('K',3,2,2,2);}}}
  if(fore){r('K',0,0,w,c==='h'?1:2);const angled=id==='F06';p('K',[[1,0],[w-1,0],[angled?w-1:w-2,h],[angled?0:1,h]]);p('D',[[2,1],[w-2,1],[angled?w-2:w-3,h-1],[1,h-1]]);r('S',a[0],1,1,Math.max(1,h-3));if(c!=='h'){for(let y=3;y<h-1;y+=c==='w'?3:2)r('K',3,y,Math.max(1,w-5),1);if(c==='w')r('L',a[0],2,1,2);}}
  if(side){r('K',0,a[1],w,h-a[1]);r('K',Math.max(0,a[0]-1),0,3,a[1]+1);r('D',1,a[1]+1,w-2,Math.max(1,h-a[1]-2));r('S',1,a[1],w-3,1);r('L',w-1,meta.beam[1],1,1);if(c!=='h'){r('K',w-3,a[1]+1,1,h-a[1]-1);if(id==='T09')r('K',Math.floor(w/3),h-2,3,1);if(c==='w'){r('J',2,a[1]+2,w-7,1);r('K',3,h-3,3,1);r('S',4,h-3,1,1);}}}
  // All attachment anchors are actual joint pixels, including one-pixel edge components.
  r('K',...a,1,1);
 });
}
// Q icons use independent close-up compositions. Types deliberately differ by profile and internal silhouette.
for(const gun of Object.keys(specs))for(const n of [24,32])make(gun,'q'+n,n,n,{gun,item:gun,role:'icon'},(r,p)=>{
 const pistol=gun==='mb1911',bull=gun==='pb90',wood=['svdb','mb14','mb700','rpkb'].includes(gun);
 if(pistol){if(n===24){p('K',[[1,4],[22,4],[23,7],[23,11],[15,11],[14,17],[9,19],[8,23],[1,22],[5,13],[1,12]]);r('S',2,5,19,4);r('L',4,5,15,1);p('T',[[6,12],[12,12],[8,21],[2,21]]);r('U',6,13,2,5);r('K',3,7,1,3);r('K',6,7,1,3);}else{p('K',[[1,5],[30,5],[32,9],[32,15],[20,15],[19,23],[12,26],[11,31],[1,30],[6,18],[1,16]]);r('D',2,7,28,6);r('S',4,6,25,2);r('L',5,6,22,1);p('T',[[8,16],[16,16],[11,29],[2,29]]);r('W',8,18,4,8);r('U',8,18,1,6);for(const x of [3,6,9])r('K',x,9,1,4);r('K',23,9,5,2);}return;}
 if(bull){if(n===24){p('K',[[1,7],[4,4],[15,4],[17,2],[23,2],[23,12],[20,13],[18,22],[11,22],[9,18],[1,19]]);r('V',2,8,19,9);r('G',2,8,9,3);r('K',2,5,13,3);r('U',3,6,11,1);r('K',12,12,8,7);r(clear,14,13,4,5);r('S',18,3,4,2);}else{p('K',[[1,10],[5,5],[20,5],[23,2],[31,2],[31,16],[27,18],[24,30],[14,30],[11,24],[1,26]]);r('V',2,11,27,12);r('G',3,11,14,4);r('K',3,6,18,4);r('T',4,7,16,2);for(let x=6;x<19;x+=3)r('U',x,7,1,2);r('K',16,17,11,10);r(clear,19,19,5,6);r('S',24,3,6,3);r('L',25,3,4,1);}return;}
 const y=n===24?7:9;r('K',1,y,n-2,n===24?7:10);r('D',2,y+1,n-4,n===24?5:8);r('S',4,y,n-7,2);r('L',5,y,n-10,1);p('K',[[8,y+6],[15,y+6],[17,n-1],[10,n-1]]);p('D',[[10,y+7],[14,y+7],[15,n-2],[11,n-2]]);
 if(wood){r('W',n===24?14:19,y+4,n===24?8:11,n===24?4:6);r('U',n===24?15:20,y+4,n===24?6:9,1);}
 if(gun==='svdb'){p('K',[[1,y+3],[9,y+4],[8,n-1],[1,n-1]]);p('W',[[2,y+5],[7,y+5],[6,n-2],[2,n-2]]);r(clear,3,y+6,3,n-y-9);r('K',n-5,1,2,y);}
 if(gun==='mb14'){r('W',1,y+5,n===24?12:17,5);r('U',2,y+5,n===24?9:13,1);r('K',5,y+9,5,n-y-10);r('S',6,y+10,1,n-y-12);}
 if(gun==='mb700'){r('K',Math.floor(n/2),y+2,2,8);r('K',Math.floor(n/2)+1,y+8,5,3);r('S',Math.floor(n/2)+2,y+8,2,1);r(clear,10,y+10,9,n-y-10);}
 if(gun==='rpkb'){r('K',7,1,n-10,4);r('S',8,2,n-12,1);r('K',n-5,0,2,y);for(let x=17;x<n-2;x+=3)r('K',x,y+5,1,2);}
 if(gun==='umpb45'){r('K',2,3,n-5,3);r('S',3,4,n-7,1);r('K',10,y+6,6,n-y-7);r('D',11,y+7,4,n-y-9);r('K',3,y+5,2,7);}
});
for(const id of p1Parts)make(id.toLowerCase(),'q24',24,24,{item:id,role:'icon'},(r,p)=>{
 const k=id[0];
 if(k==='O'){const [ow,oh,ox,oy]={O02:[10,8,7,8],O04:[15,10,4,7],O06:[18,10,3,7],O07:[21,11,1,6],O09:[24,8,0,8],O11:[22,9,1,7],O12:[16,4,4,10]}[id];drawOptic((k,x,y,w,h)=>r(k,x+ox,y+oy,w,h),(k,pts)=>p(k,pts.map(([x,y])=>[x+ox,y+oy])),'i',ow,oh,id);} // Draw the dedicated icon larger and below the top margin.
 if(k==='A'){r('K',2,6,20,4);r('S',3,7,18,1);r('K',8,10,8,9);r('D',9,11,6,7);r('K',5,4,14,2);r('L',6,4,12,1);}
 if(k==='B'){r('K',1,10,22,5);r('S',2,11,20,1);r('D',2,12,20,2);const x=id==='B10'?11:id==='B04'?18:20;r('K',x,5,2,13);r('L',x,6,1,4);r('K',2,8,id==='B02'?8:5,2);if(id==='B10'){r(clear,15,10,8,5);r('K',13,10,3,5);}if(id==='B02')for(let x=15;x<23;x+=2)r('K',x,10,1,2);}
 if(k==='H'){r('K',1,6,22,13);r('D',2,7,20,11);r('S',3,7,17,2);for(let x=4;x<21;x+=4){r('K',x,10,2,4);r('S',x,18,1,1);}r('K',1,3,21,3);r('L',3,4,16,1);}
 if(k==='S')stock(r,p,'i',id==='S10'?20:24,20,[id==='S10'?19:23,5],id==='S09'?'precision':id==='S10'?'light':'skeleton');
 if(k==='P'){grip(r,p,'i',16,22,id==='P08');if(id==='P08'){r(clear,0,0,3,22);r('K',6,3,2,2);r('L',6,3,1,1);}else r('K',9,6,5,2);}
 if(k==='G'){if(id==='G05'){r('K',1,8,22,8);r('T',2,9,20,6);r('U',3,9,18,1);for(let x=4;x<21;x+=3)r('W',x,11,1,4);}else{const width=id==='G02'?9:id==='G11'?13:id==='G04'?11:14;magazine(r,p,'i',width,23,'straight');if(id==='G12')r('S',width-2,16,1,4);if(id==='G02'){r('K',0,19,width+2,4);r('D',1,20,width,2);}}}
 if(k==='M'){const length=id==='M08'?23:id==='M09'?14:id==='M12'?18:20;r('K',1,6,length,12);r('D',2,7,length-2,10);r('S',3,7,length-4,2);r('L',4,7,length-7,1);if(id==='M09')for(let x=5;x<14;x+=4)r('K',x,10,2,6);else{r('K',length-2,7,1,10);if(id==='M12')r('K',5,9,2,7);}r('K',1,18,length,1);}
 if(k==='F'){if(id==='F08'){r('K',1,8,22,3);r('K',1,14,22,3);r('K',19,8,3,9);r('S',2,9,17,1);r('S',2,15,17,1);r('K',3,7,3,11);}else{const angled=id==='F06';r('K',4,3,16,4);p('K',[[7,6],[18,6],[angled?13:17,22],[angled?2:7,22]]);p('D',[[9,7],[16,7],[angled?11:15,20],[angled?4:9,20]]);r('S',10,7,1,10);if(id==='F05'){r(clear,0,17,24,7);r('K',7,16,11,2);}if(id==='F02')for(let y=10;y<20;y+=3)r('K',12,y,5,1);}}
 if(k==='T'){const lamp=['T06','T07'].includes(id);r('K',2,8,20,12);r('D',3,9,18,10);r('S',4,9,14,2);r('L',20,11,1,lamp?5:2);r('K',8,5,8,3);r('K',17,10,2,8);if(id==='T03'){r(clear,0,18,24,6);r('K',2,17,20,1);r('K',8,12,6,2);}if(id==='T07')r('K',4,12,8,5);if(id==='T09'){r('K',4,12,7,4);r('S',5,13,3,1);r('K',18,4,4,5);}}
});
// Three distinct ammunition families at each fixed UI size. Existing ammo remains procedural and unchanged.
for(const item of ['ammo45','ammoPDW','ammoHeavy'])for(const n of [24,32])make(item.toLowerCase(),'q'+n,n,n,{item,role:'icon'},(r,p)=>{
 if(item==='ammo45'){const wide=n===24?6:8,height=n===24?12:16,ys=n===24?[7,4,7]:[11,6,11],xs=n===24?[1,9,17]:[2,12,22];for(let i=0;i<3;i++){const x=xs[i],y=ys[i];p('K',[[x+1,y],[x+wide-1,y],[x+wide,y+2],[x+wide,y+height],[x,y+height],[x,y+2]]);r('A',x+1,y+2,wide-2,height-3);r('Y',x+1,y+2,1,height-4);r('T',x+wide-2,y+3,1,height-5);r('P',x+1,y+height-2,wide-2,1);}}
 if(item==='ammoPDW'){const w=n===24?4:5,top=n===24?3:4,base=n-3;for(const x of n===24?[2,8,14,20]:[3,11,19,27]){p('K',[[x+1,top],[x+w-1,top+5],[x+w-1,top+8],[x+w,top+10],[x+w,base],[x,base],[x,top+10],[x+1,top+8]]);r('U',x+1,top+4,1,4);r('A',x+1,top+10,w-2,base-top-11);r('Y',x+1,top+10,1,base-top-12);}r('K',0,n-5,n,4);r('V',1,n-4,n-2,2);}
 if(item==='ammoHeavy'){const y=n===24?1:2,w=n===24?7:10;for(const x of n===24?[3,14]:[3,19]){p('K',[[x+Math.floor(w/2),y],[x+w-2,y+6],[x+w-2,y+10],[x+w,y+13],[x+w,n-1],[x,n-1],[x,y+13],[x+2,y+10],[x+2,y+6]]);p('U',[[x+Math.floor(w/2),y+2],[x+w-3,y+7],[x+w-3,y+11],[x+3,y+11],[x+3,y+7]]);r('A',x+1,y+13,w-2,n-y-15);r('Y',x+2,y+13,1,n-y-16);r('T',x+w-2,y+13,1,n-y-15);r('P',x+1,n-3,w-2,1);}r('K',1,n-10,n-2,9);r('T',2,n-9,n-4,7);r('P',3,n-8,n-6,4);r('A',3,n-4,n-6,1);}
});
// Restore only explicit authored hand masks, preserving every outside pixel and the original canvas.
const repairs={pistol:{masks:[[4,5,4,3],[3,7,3,2]],ops:[['#75634e',5,5,2,1],['#784d3d',4,6,2,1],['#8a7a61',4,7,1,1],['#75634e',3,7,1,2],['#784d3d',5,7,1,1]]},shotgun:{masks:[[9,3,5,4],[20,3,4,3]],ops:[['#393733',10,3,1,1],['#625b4f',11,3,2,1],['#784d3d',9,4,3,1],['#75634e',10,5,2,1],['#242321',11,6,1,1],['#625b4f',20,3,3,1],['#784d3d',21,4,2,1],['#242321',22,5,1,1]]},carbine:{masks:[[7,4,5,5],[17,4,4,3]],ops:[['#393733',8,5,2,1],['#75634e',8,6,1,1],['#393733',9,7,2,1],['#a27351',17,5,2,1],['#75634e',18,6,2,1]]}};
const bareSources=[];
for(const [gun,repair]of Object.entries(repairs)){
 const path=`assets/coast/v1/coast-weapon-${gun}-held-v1.png`,before=decode(resolve(root,path)),after=canvas(before.w,before.h);blit(after,before,0,0);for(const op of repair.ops)rect(after,...op);
 const allowed=new Set();for(const [x,y,w,h]of repair.masks)for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)allowed.add(j*before.w+i);
 const changed=[];for(let j=0;j<before.w*before.h;j++)if(!before.data.subarray(j*4,j*4+4).equals(after.data.subarray(j*4,j*4+4))){if(!allowed.has(j))throw Error('bare patch outside hand mask');changed.push([j%before.w,Math.floor(j/before.w)]);}
 make(gun+'-bare','h',before.w,before.h,{gun,item:null,role:'bare',originalSource:path,maskSource:docs+'/source/bare-repairs.json',paletteLimit:16},r=>{for(let y=0;y<after.h;y++)for(let x=0;x<after.w;x++){const j=(y*after.w+x)*4;if(after.data[j+3])r('#'+after.data.subarray(j,j+3).toString('hex'),x,y,1,1);}});
 bareSources.push({gun,original:path,originalSha256:createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex'),masks:repair.masks,ops:repair.ops,changedPixels:changed,palette:colors(after),rationale:'Bare is a whole-gun side view, checked under the combined H palette cap 16. Every pixel outside the authored glove masks is invariant.'});
 const sheet=canvas(340,100);rect(sheet,'#101c22',0,0,sheet.w,sheet.h);text(sheet,gun+' / HELD - BARE - CHANGES',8,7);blit(sheet,before,8,28);blit(sheet,after,68,28);blit(sheet,before,8,48,3);blit(sheet,after,120,48,3);const diff=canvas(before.w,before.h);for(const [x,y]of changed)rect(diff,'#e28a6c',x,y,1,1);blit(sheet,diff,232,48,3);save(resolve(root,docs+`/preview/${gun}-bare-comparison.png`),sheet);
 save(resolve(root,docs+`/preview/${gun}-bare-diff-1x.png`),diff);
}
writeFileSync(resolve(root,docs+'/source/bare-repairs.json'),JSON.stringify({schema:1,method:'Restore the native integer-grid source inside explicitly saved glove masks. No changed pixels outside masks. Original colors only.',guns:bareSources},null,2)+'\n');
finish('P0+P1');
