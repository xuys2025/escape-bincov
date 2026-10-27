// Original native-grid drawings. H/I/W have separate coordinate recipes; only previews are enlarged.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { canvas,rect,poly,blit,save,png,decode,colors,text } from './pixels.mjs';
const root=fileURLToPath(new URL('../../../../..',import.meta.url));
const dir='assets/gunsmith/incoming/m3-w1',docs='docs/gunsmith/art/m3-w1';
for(const p of [dir,docs+'/preview',docs+'/source'])mkdirSync(resolve(root,p),{recursive:true});
const H={K:'#242321',D:'#393733',S:'#625b4f',L:'#a49b88',W:'#a27351',T:'#784d3d',B:'#75634e',E:'#4b4842'};
const I={K:'#122027',D:'#425a60',S:'#829c9d',L:'#bdcfca',W:'#996749',T:'#5c4236',B:'#cb9362',E:'#24373d',J:'#425a60'};
const W={...I,J:'#63797c',N:'#a7bab7',O:'#b57c53',V:'#77513b'};
export const all=[],pictures=new Map(),artwork=[];
export function make(name,code,w,h,meta,draw) {
  const baseCode=code.split('-')[0],c=canvas(w,h),P=baseCode==='h'?H:baseCode==='w'?W:I;
  const r=(k,x,y,w,h)=>rect(c,P[k]??k,x,y,w,h),p=(k,pts)=>poly(c,P[k]??k,pts);
  draw(r,p,P,c);
  const id=`gs-${name}-${code}-v${meta.revision??1}`,file=`${dir}/${id}.png`,b=png(c);
  writeFileSync(resolve(root,file),b);
  const a={id,file,w,h,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),revision:1,
    output:{h:'held',i:'inventory',w:'bench',q24:'icon24',q32:'icon32'}[baseCode],gun:null,item:null,role:'part',slot:null,anchor:null,
    colors:colors(c),source:`${docs}/source/pixel-artwork.json`,sourceRect:null,
    exportMethod:'original native integer-grid draw operations; independently authored H/I/W/Q; no runtime-image resampling',...meta};
  all.push(a);pictures.set(id.replace(/-v\d+$/,''),c);artwork.push({id,w,h,palette:P,ops:c.ops});return a;
}
const geometry={
  h:{receiver:[14,6],mounts:{barrel:[13,1],handguard:[13,3],stock:[0,2],rearGrip:[3,4],mag:[9,4],mount:[7,0]},grip:[4,4],bore:2},
  i:{receiver:[35,8],mounts:{barrel:[34,2],handguard:[34,4],stock:[0,3],rearGrip:[7,6],mag:[22,6],mount:[17,0]}},
  w:{receiver:[70,16],mounts:{barrel:[68,4],handguard:[68,8],stock:[0,6],rearGrip:[14,12],mag:[44,12],mount:[34,0]}}
};
for(const code of ['h','i','w']) {
  const g=geometry[code];make('akb74-receiver',code,...g.receiver,{gun:'akb74',role:'receiver',mounts:g.mounts,...(code==='h'?{grip:g.grip,bore:g.bore,forward:0}:{})},(r,p)=>{
    if(code==='h') {p('K',[[0,2],[3,0],[12,0],[14,2],[14,5],[9,5],[9,6],[6,6],[5,5],[0,5]]);r('D',1,2,12,2);r('S',4,1,8,1);r('L',4,1,5,1);r('K',6,2,4,1);r('S',6,3,5,1);r('K',5,4,1,1);}
    if(code==='i') {p('K',[[0,3],[4,1],[6,0],[30,0],[35,2],[35,7],[23,7],[23,8],[13,8],[12,7],[0,7]]);r('D',1,3,33,3);r('S',5,1,26,2);r('L',7,1,20,1);r('E',2,5,31,1);r('K',15,3,11,1);r('S',23,4,7,1);r('K',6,5,1,1);r('S',10,5,1,1);r('S',30,5,1,1);r('K',11,6,9,1);r('D',12,6,1,2);r('D',19,6,1,2);}
    if(code==='w') {p('K',[[0,6],[8,2],[12,0],[61,0],[70,4],[70,14],[46,14],[46,16],[26,16],[24,14],[0,14]]);r('D',1,6,68,7);r('J',6,4,61,2);r('S',12,1,49,3);r('L',14,1,39,1);r('N',17,2,34,1);r('E',2,11,65,2);r('K',30,6,22,2);r('J',32,8,15,1);r('S',48,8,12,1);p('K',[[55,6],[60,4],[62,4],[59,8],[55,8]]);r('L',59,4,2,1);r('K',22,12,18,1);r('D',23,13,1,3);r('D',39,12,1,4);for(const x of [7,20,61]){r('K',x,9,3,3);r('S',x+1,9,1,1);}r('K',15,4,6,1);r('S',4,6,7,1);}
  });
}
const barrelSpecs={h:[12,4,[0,1],[11,1],[12,2]],i:[30,9,[0,2],[29,2],[30,3]],w:[60,18,[0,4],[59,4],[60,6]]};
function barrel(code,short=false) {
  const s=barrelSpecs[code],w=short?{h:9,i:23,w:46}[code]:s[0],h=s[1],a=s[2];
  const muzzle=[w-1,a[1]],tip=[w,code==='w'?6:code==='i'?3:2];
  make(short?'b07':'akb74-barrel-factory',code,w,h,{...(short?{item:'B07'}:{gun:'akb74',role:'factory'}),slot:'barrel',anchor:a,mounts:{muzzle},tip},(r,p)=>{
    if(code==='h'){r('K',0,1,w,3);r('S',1,2,w-2,1);r('K',w-4,0,2,3);r('L',w-3,0,1,1);r('D',0,1,5,1);}
    if(code==='i'){r('K',0,2,w,4);r('S',1,3,w-2,1);r('D',1,4,w-2,1);r('K',w-9,0,3,6);r('S',w-8,1,1,3);r('L',3,3,w-13,1);r('K',7,1,6,2);r('D',8,2,4,1);r('K',w-3,2,2,6);r('S',w-2,3,1,3);}
    if(code==='w'){r('K',0,4,w,8);r('D',1,5,w-2,6);r('S',2,5,w-4,2);r('L',4,5,w-22,1);r('J',4,8,w-8,1);p('K',[[w-19,4],[w-17,0],[w-13,0],[w-12,4],[w-12,12],[w-19,12]]);r('S',w-16,2,1,5);r('L',w-15,1,1,1);r('K',14,3,12,3);r('J',16,4,8,1);r('K',w-6,4,4,12);r('S',w-4,5,1,6);r('K',w-11,9,5,1);}
  });
}
for(const c of ['h','i','w']){barrel(c);barrel(c,true);}
const hgSpecs={h:[7,4,[0,1],[3,3]],i:[18,8,[0,2],[8,6]],w:[36,16,[0,4],[16,12]]};
function handguard(code,kind) {
  const [w,baseH,a,baseHand]=hgSpecs[code],rail=kind==='H04',factory=kind==='factory';
  const h=rail?{h:4,i:7,w:14}[code]:baseH,hand=rail?{h:[3,3],i:[8,5],w:[16,10]}[code]:baseHand;
  const mounts=rail?{under:code==='h'?[3,3]:code==='i'?[8,6]:[16,13],side1:code==='h'?[5,1]:code==='i'?[13,3]:[26,6],side2:code==='h'?[2,1]:code==='i'?[5,3]:[10,6]}:{};
  make(factory?'akb74-handguard-factory':kind.toLowerCase(),code,w,h,{...(factory?{gun:'akb74',role:'factory'}:{item:kind}),slot:'handguard',anchor:a,hand,...(rail?{mounts}:{})},(r,p)=>{
    r('K',0,0,w,h);r(rail?'D':'T',1,1,w-2,h-2);
    if(code==='h'){r(rail?'S':factory?'W':'B',1,1,5,1);if(rail){r('K',2,1,1,1);r('K',4,1,1,1);}else r('W',2,2,4,1);}
    if(code==='i'){r(rail?'S':factory?'W':'B',1,1,w-2,2);r(rail?'E':'W',2,4,w-4,2);r('K',4,2,3,1);r('K',11,2,3,1);if(rail){for(let x=2;x<w-1;x+=3){r('D',x,0,1,1);r('S',x,h-1,1,1);}for(let x=3;x<15;x+=4)r('K',x,4,2,2);}else {r('B',2,1,7,1);r('T',5,5,6,1);}}
    if(code==='w'){r(rail?'J':factory?'W':'B',1,1,w-2,5);r(rail?'D':'O',2,8,w-4,rail?4:5);r(rail?'S':'B',3,2,w-7,1);r('K',8,4,6,2);r('K',23,4,6,2);if(rail){for(let x=3;x<34;x+=5){r('S',x,0,2,1);r('S',x,h-1,2,1);}for(let x=5;x<32;x+=7){r('K',x,9,4,2);r('J',x,11,4,1);}r('L',2,2,1,1);r('L',33,2,1,1);}else {r('O',3,4,3,1);r('V',6,11,16,1);r('B',21,9,10,1);r('T',11,13,18,1);r('B',4,9,8,1);}}
  });
}
for(const c of ['h','i','w'])for(const k of ['factory','H03','H04'])handguard(c,k);
const stockSpecs={h:{factory:[9,6,[8,1]],S03:[6,5,[5,1]],S04:[10,6,[9,1]]},i:{factory:[24,12,[23,3]],S03:[17,11,[16,3]],S04:[26,12,[25,3]]},w:{factory:[48,24,[47,6]],S03:[34,22,[33,6]],S04:[52,24,[51,6]]}};
function stock(code,kind) {
  const [w,h,a]=stockSpecs[code][kind],skeleton=kind==='S03',wood=kind==='factory';
  make(wood?'akb74-stock-factory':kind.toLowerCase(),code,w,h,{...(wood?{gun:'akb74',role:'factory'}:{item:kind}),slot:'stock',anchor:a},(r,p)=>{
    p('K',[[0,0],[w-3,a[1]],[w,a[1]],[w,a[1]+2],[w-4,a[1]+2],[1,h],[0,h-1]]);
    if(code==='h'){p(wood?'T':'D',[[1,1],[w-2,2],[w-3,3],[1,h-1]]);r(wood?'W':'S',1,1,w-3,1);if(skeleton)r([0,0,0,0],2,2,1,1);}
    if(code==='i'){p(wood?'T':'D',[[1,1],[w-3,4],[w-2,5],[2,h-2],[1,h-2]]);p(wood?'W':'E',[[2,2],[w-5,4],[w-6,6],[2,h-3]]);r(wood?'B':'S',3,2,7,1);r('K',1,2,1,h-4);if(skeleton){p('K',[[4,4],[w-6,5],[4,h-4]]);p([0,0,0,0],[[5,5],[w-8,5],[5,h-5]]);}else r(wood?'T':'K',5,h-5,2,2);}
    if(code==='w'){p(wood?'T':'D',[[1,1],[w-5,7],[w-2,7],[w-2,9],[w-7,9],[2,h-2],[1,h-2]]);p(wood?'W':'J',[[3,3],[w-8,8],[w-10,12],[3,h-4]]);r(wood?'B':'S',4,3,14,1);r('K',2,3,2,h-7);r(wood?'O':'D',5,5,9,1);if(skeleton){p('K',[[7,8],[w-10,9],[7,h-7]]);p([0,0,0,0],[[8,9],[w-12,10],[8,h-8]]);p('S',[[7,h-5],[w-8,10],[w-7,11],[7,h-4]]);}else {r('K',10,h-11,3,5);r(wood?'B':'L',10,h-11,1,2);if(wood){r('V',16,13,12,1);r('O',7,17,9,1);}else{r('E',17,11,9,3);r('S',w-7,7,2,1);}}}
  });
}
for(const c of ['h','i','w'])for(const k of ['factory','S03','S04'])stock(c,k);
const gripSpecs={h:[4,6],i:[9,10],w:[18,20]};
function grip(code,kind) {
  const [w,h]=gripSpecs[code],wood=kind!=='P03',factory=kind==='factory';
  make(factory?'akb74-reargrip-factory':kind.toLowerCase(),code,w,h,{...(factory?{gun:'akb74',role:'factory'}:{item:kind}),slot:'rearGrip',anchor:[0,0]},(r,p)=>{
    p('K',[[0,0],[w,0],[w-1,h-2],[w-2,h],[0,h],[0,h-2]]);
    if(code==='h'){r('T',1,1,2,3);r('W',1,1,1,3);}
    if(code==='i'){p(wood?'T':'D',[[2,1],[w-1,1],[w-3,h-1],[1,h-1]]);p(wood?(factory?'W':'B'):'E',[[2,2],[w-3,2],[w-4,h-2],[2,h-2]]);r(wood?'B':'S',3,2,1,2);if(!wood)for(let y=3;y<h-2;y+=2)r('K',2,y,3,1);else r(factory?'T':'W',3,5,1,2);}
    if(code==='w'){p(wood?'T':'D',[[3,1],[w-2,1],[w-4,h-2],[2,h-2]]);p(wood?(factory?'W':'B'):'J',[[4,2],[w-5,3],[w-7,h-3],[3,h-3]]);r(wood?'B':'S',5,3,1,6);if(!wood){for(let y=5;y<h-3;y+=3){r('K',4,y,7,1);r('E',6,y+1,7,1);}r('L',11,3,1,1);}else{r('O',6,8,1,5);r(factory?'V':'W',8,11,1,4);r('B',4,16,4,1);}}
  });
}
for(const c of ['h','i','w']){grip(c,'factory');if(c!=='h'){grip(c,'P03');grip(c,'P04');}}
const magSpecs={h:{factory:[6,6],G08:[7,7]},i:{factory:[13,10],G08:[16,10]},w:{factory:[26,20],G08:[32,20]}};
function mag(code,kind) {
  const [w,h]=magSpecs[code][kind],factory=kind==='factory';
  make(factory?'akb74-mag-factory':kind.toLowerCase(),code,w,h,{...(factory?{gun:'akb74',role:'factory'}:{item:kind}),slot:'mag',anchor:[0,0]},(r,p)=>{
    const neck=code==='h'?3:code==='i'?6:12;
    p('K',[[0,0],[neck,0],[neck+1,Math.floor(h/2)],[w,h-2],[w-2,h],[w-4,h],[1,Math.floor(h/2)]]);
    if(code==='h'){r(factory?'T':'D',1,1,2,2);r(factory?'W':'S',2,3,2,1);r(factory?'W':'D',3,4,2,1);if(!factory)r('S',4,5,2,1);}
    if(code==='i'){p(factory?'T':'D',[[1,1],[5,1],[7,5],[w-1,h-2],[w-3,h-1],[w-4,h-1],[3,5]]);p(factory?'W':'S',[[2,1],[4,1],[6,5],[w-3,h-2],[w-4,h-2],[4,5]]);r(factory?'B':'L',2,1,1,2);p(factory?'T':'E',[[5,2],[6,2],[8,5],[w-3,h-3],[w-4,h-3],[6,5]]);}
    if(code==='w'){p(factory?'T':'D',[[1,1],[11,1],[14,9],[w-2,h-4],[w-5,h-1],[w-8,h-1],[5,10]]);p(factory?'W':'J',[[3,2],[9,2],[12,10],[w-5,h-4],[w-8,h-3],[7,10]]);p(factory?'B':'S',[[3,2],[4,2],[7,10],[w-9,h-4],[w-10,h-4],[6,10]]);for(const dx of [3,7])p(factory?'V':'E',[[dx+2,3],[dx+3,3],[dx+6,10],[w-9+dx,h-5],[w-10+dx,h-4],[dx+5,10]]);p('K',[[w-8,h-3],[w-2,h-6],[w-1,h-4],[w-6,h-1]]);}
  });
}
for(const c of ['h','i','w'])for(const k of ['factory','G08'])mag(c,k);
const muzzleSpecs={h:{M05:[3,3,[0,0],[3,1]],M07:[8,3,[0,0],[8,1]]},i:{M05:[7,5,[0,1],[7,2]],M07:[19,5,[0,1],[19,2]]},w:{M05:[14,10,[0,2],[14,4]],M07:[38,10,[0,2],[38,4]]}};
for(const code of ['h','i','w'])for(const kind of ['M05','M07']) {
  const [w,h,a,tip]=muzzleSpecs[code][kind];make(kind.toLowerCase(),code,w,h,{item:kind,slot:'muzzle',anchor:a,tip},(r,p)=>{
    r('K',0,0,w,h);r('D',1,1,w-2,h-2);
    if(code==='h'){r('S',1,1,w-2,1);if(kind==='M05')r('K',1,0,1,1);}
    if(code==='i'){r('S',1,1,w-2,1);if(kind==='M05'){r('K',2,2,1,2);r('K',4,2,1,2);}else{r('E',2,3,w-3,1);r('K',w-3,1,1,3);r('L',2,1,3,1);}}
    if(code==='w'){r('J',1,2,w-2,h-4);r('S',2,1,w-4,1);r('L',3,2,w-7,1);r('D',2,h-3,w-4,1);if(kind==='M05'){for(const x of [4,8]){r('K',x,3,2,4);r('S',x+2,3,1,1);}}else{r('K',w-5,1,1,h-2);r('E',w-4,2,2,h-4);r('D',5,4,w-12,1);r('K',2,3,1,4);}}
  });
}
for(const code of ['h','i','w']) {
  const [w,h,a,top]=code==='h'?[7,3,[3,2],[3,0]]:code==='i'?[17,3,[8,2],[8,0]]:[34,5,[16,4],[16,0]];
  make('a08',code,w,h,{item:'A08',slot:'mount',anchor:a,mounts:{top}},(r,p)=>{
    r('K',0,0,w,code==='w'?2:1);r('D',code==='h'?2:code==='i'?6:12,1,code==='h'?3:code==='i'?5:10,h-1);
    if(code==='h'){r('S',1,0,5,1);r('K',3,1,1,1);}
    if(code==='i'){for(let x=1;x<w-1;x+=3)r('S',x,0,2,1);r('K',8,1,1,1);r('S',6,2,1,1);}
    if(code==='w'){for(let x=1;x<w-1;x+=4)r('S',x,0,2,1);r('J',13,2,8,2);r('K',16,2,2,2);r('L',13,2,1,1);r('E',21,3,1,2);}
  });
}
// Close-up square icons are independently drawn, rather than squeezed side views.
for(const size of [24,32])make('akb74',`q${size}`,size,size,{gun:'akb74',role:'icon'},(r,p)=>{
  if(size===24){p('K',[[0,7],[4,4],[17,4],[20,6],[24,6],[24,12],[15,12],[17,17],[23,20],[20,24],[15,22],[11,13],[8,13],[6,23],[0,23],[3,13],[0,13]]);r('D',1,7,20,5);r('S',5,5,13,2);r('L',6,5,9,1);r('K',11,8,7,1);r('W',19,7,5,3);r('B',20,7,4,1);p('T',[[4,13],[8,13],[5,22],[1,22]]);p('W',[[12,12],[15,12],[18,18],[22,20],[20,22],[17,20]]);r('B',13,13,1,3);r('K',7,12,4,1);r('S',9,13,1,2);}
  else {p('K',[[0,10],[6,5],[24,5],[28,8],[32,8],[32,16],[21,16],[24,23],[32,27],[28,32],[21,29],[16,17],[12,17],[9,30],[1,30],[5,17],[0,17]]);r('D',1,10,29,6);r('S',7,6,18,3);r('L',8,6,14,1);r('K',14,10,10,2);r('S',21,12,4,1);r('W',27,9,5,5);r('B',28,9,4,1);r('K',29,12,3,1);p('T',[[6,17],[11,17],[8,29],[2,29]]);p('W',[[7,18],[9,18],[6,27],[4,27]]);p('T',[[17,16],[21,16],[25,24],[31,27],[28,31],[22,28]]);p('W',[[18,17],[20,17],[24,24],[29,28],[27,29],[23,27]]);r('B',19,18,1,4);r('K',11,16,4,1);r('S',13,17,1,3);}
});
for(const item of ['S03','H03','P04','B07','M05','S04','H04','P03','A08','G08','M07'])make(item.toLowerCase(),'q24',24,24,{item,role:'icon'},(r,p)=>{
  if(item.startsWith('S')) {p('K',[[1,5],[18,9],[23,9],[23,13],[17,13],[2,21],[0,20],[0,6]]);p('D',[[2,7],[17,10],[20,10],[16,12],[3,18],[2,18]]);r('S',3,7,8,1);if(item==='S03'){p('K',[[5,10],[14,11],[5,16]]);p([0,0,0,0],[[6,11],[12,11],[6,14]]);}else {r('E',4,12,5,4);r('K',4,11,2,5);}}
  if(item==='H03'||item==='H04'){const rail=item==='H04';r('K',1,6,22,13);r(rail?'D':'T',2,7,20,11);r(rail?'S':'B',3,7,17,2);r(rail?'E':'W',3,12,17,4);for(const x of [5,13])r('K',x,9,4,2);if(rail){for(let x=3;x<22;x+=4){r('S',x,6,2,1);r('S',x,18,2,1);}for(let x=5;x<20;x+=5)r('K',x,13,3,2);}else {r('T',7,15,9,1);r('W',4,10,2,1);}}
  if(item==='P03'||item==='P04'){const wood=item==='P04';p('K',[[8,2],[19,3],[16,19],[14,22],[3,22],[3,19]]);p(wood?'T':'D',[[9,4],[17,4],[14,20],[5,20]]);p(wood?'W':'S',[[9,5],[14,6],[11,19],[6,19]]);r(wood?'B':'L',9,5,1,4);if(!wood)for(let y=8;y<19;y+=3)r('K',7,y,6,1);else r('T',10,12,1,5);}
  if(item==='B07'){r('K',1,10,22,5);r('S',2,11,20,1);r('D',2,12,20,2);r('K',14,4,3,11);r('S',15,5,1,5);r('K',2,8,6,3);r('D',3,9,4,1);r('K',20,10,2,7);r('L',3,11,8,1);}
  if(item==='M05'){r('K',4,7,16,11);r('D',5,8,14,9);r('S',5,8,13,2);r('L',6,8,6,1);for(const x of [9,14])r('K',x,11,2,5);r('E',5,15,2,2);}
  if(item==='M07'){r('K',1,7,22,10);r('D',2,8,20,8);r('S',3,8,18,2);r('L',4,8,11,1);r('E',3,14,18,2);r('K',19,8,1,8);r('K',3,10,1,4);}
  if(item==='A08'){r('K',1,5,22,4);r('D',2,6,20,2);for(let x=3;x<22;x+=4)r('S',x,5,2,1);r('K',7,8,10,12);r('D',8,9,8,10);r('S',8,10,2,7);r('K',11,12,3,3);r('L',11,12,1,1);}
  if(item==='G08'){p('K',[[3,1],[12,1],[14,9],[18,15],[23,18],[19,23],[11,18],[6,10]]);p('D',[[4,2],[11,2],[13,10],[17,16],[21,18],[19,21],[12,17],[7,10]]);p('S',[[5,2],[7,2],[9,10],[14,17],[18,20],[17,20],[12,17],[8,10]]);p('E',[[9,3],[10,3],[12,10],[17,16],[16,17],[11,10]]);r('L',5,3,1,3);}
});
export function finish(stage='P0',virtual=[]) {
  const m2=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json')));
  writeFileSync(resolve(root,dir+'/manifest.json'),JSON.stringify({schema:1,revision:stage==='P0'?1:2,batch:'M3-W1',stage,totals:{files:all.length,pngBytes:all.reduce((s,a)=>s+a.bytes,0)},assets:all,virtual},null,2)+'\n');
  writeFileSync(resolve(root,docs+'/source/pixel-artwork.json'),JSON.stringify({method:'Original integer-grid drawing recipes; no cross-output raster scaling',assets:artwork},null,2)+'\n');
  console.log(JSON.stringify({stage,files:all.length,pngBytes:all.reduce((s,a)=>s+a.bytes,0),m2Bytes:m2.totals.pngBytes}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))finish();
