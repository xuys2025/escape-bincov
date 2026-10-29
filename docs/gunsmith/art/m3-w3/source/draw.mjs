import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canvas,blit,dot,rect,decode,png,colors} from './pixels.mjs';
import {specs,embedded} from './design.mjs';
export const root=fileURLToPath(new URL('../../../../..',import.meta.url));
export const docs='docs/gunsmith/art/m3-w3',incoming='assets/gunsmith/incoming/m3-w3';
const formal=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json')));
const palette={K:'#122027',E:'#24373d',D:'#425a60',S:'#829c9d',L:'#bdcfca',J:'#63797c',N:'#a7bab7',V:'#485c4b',G:'#7d9168',B:'#b4bf89',T:'#5c4236',W:'#996749',U:'#cb9362'};
const materials={steel:['D','S','J','L'],black:['E','D','J','S'],olive:['V','G','D','B'],bakelite:['T','W','D','U']};
function profile(g,y){const p=g[2];let b=p.findIndex(k=>k[0]>=y);if(b<=0)return p[0].slice(1);const a=p[b-1],z=p[b],t=(y-a[0])/(z[0]-a[0]);return [Math.round(a[1]+(z[1]-a[1])*t),Math.round(a[2]+(z[2]-a[2])*t)];}
export function drawMagazine(spec,code){
 const g=spec[code],[w,h]=g,c=canvas(w,h),mask=Array.from({length:h},()=>Array(w).fill(false)),bench=code==='w';
 let spans;
 if(spec.drum){
  // One circular housing and a short feed neck, all on the positive side of the fixed anchor.
  const neck=bench?14:7,cy=bench?21.5:10.5,rx=bench?18:9,ry=rx,cx=(w-1)/2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y][x]=(y<(bench?12:6)&&x<neck)||((x-cx)**2/rx**2+(y-cy)**2/ry**2<=1);
  mask[0][0]=true;
 }else for(let y=0;y<h;y++){const [l,r]=profile(g,y);for(let x=l;x<r;x++)mask[y][x]=true;}
 spans=mask.map(row=>[row.indexOf(true),row.lastIndexOf(true)+1]);
 const [body,light,midtone,glint]=materials[spec.style];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y][x]){
  const edge=([[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!mask[y+dy]?.[x+dx]));
  const topJoin=spec.openTop&&y===0&&x>0&&x<spans[y][1]-1;
  dot(c,x,y,palette[edge&&!topJoin?'K':body]);
 }
 const inner=(key,x,y)=>{if(mask[y]?.[x]&&[[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>mask[y+dy]?.[x+dx]))dot(c,x,y,palette[key]);};
 if(spec.drum){
  const cx=bench?20:10,cy=bench?22:11;
  for(let y=bench?12:6;y<h-2;y++)for(let x=2;x<w-2;x++){
   const d=Math.hypot((x-cx)/(bench?1:1),(y-cy)/(bench?1:1));
   if(bench&&Math.abs(d-10)<.6)inner(midtone,x,y);
   if(bench&&Math.abs(d-13)<.6&&x<cx)inner(light,x,y);
   if(!bench&&Math.abs(d-5)<.6&&x<cx)inner(light,x,y);
  }
  for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++)inner('K',x,y);
  inner(light,cx,cy);if(bench){inner(glint,cx-1,cy-1);for(const [x,y]of [[7,20],[31,20],[10,32],[28,33]]){inner('K',x,y);inner(light,x+1,y);}}
 }else{
  for(let y=1;y<h-2;y++){
   const [l,r]=spans[y],width=r-l;inner(light,l+1,y);
   if(bench){inner(midtone,l+2,y);if(width>=10)inner(midtone,l+Math.floor(width*.65),y);}
   // Pressed longitudinal channels follow the curved shell, avoiding horizontal ladder stripes.
   if(width>=7&&y>2&&y<h-3){inner(spec.style==='bakelite'?'T':'E',l+Math.floor(width*.48),y);if(bench)inner(midtone,l+Math.floor(width*.48)+1,y);}
  }
  for(let y=bench?5:4;y<h-3;y+=bench?7:5)if(spec.witness){const [l,r]=spans[y],x=r-(bench?5:3);inner('K',x,y);if(bench){inner('K',x,y+1);inner(light,x-1,y);}}
  const y=h-(bench?3:2),[l,r]=spans[y];for(let x=l+1;x<r-1;x++)inner(spec.pullTab?'S':light,x,y);
  if(spec.pullTab){const start=h-(bench?6:3);for(let y=start;y<h-1;y++){const [l,r]=spans[y];inner('K',l+Math.floor((r-l)/2),y);if(bench)inner(midtone,l+Math.floor((r-l)/2)+1,y);}}
  if(bench){const y=Math.min(3,h-3),[l,r]=spans[y];for(let x=l+3;x<r-2;x++)inner(glint,x,y);if(h>16){const yy=h-6,[ll]=spans[yy];inner('K',ll+3,yy);inner(light,ll+4,yy);}}
 }
 if(spec.lipRow){const y=spec.lipRow[bench?1:0],[l,r]=spans[y];for(let x=l;x<r;x++)dot(c,x,y,palette.K);}
 return c;
}
function receiver(old,spec,code){
 const s=spec[code],src=decode(resolve(root,old.file)),[x,y,w,h]=s.box,c=canvas(src.w,Math.max(src.h,y+h));blit(c,src,0,0);rect(c,[0,0,0,0],...s.mask);
 const g={i:[w,h,[[0,0,w],[h-1,0,w]]],w:[w,h,[[0,0,w],[h-1,0,w]]],style:spec.style,openTop:true,witness:true};
 const mag=drawMagazine(g,code);blit(c,mag,x,y);
 // There is already a full receiver lip immediately above this open interface.
 for(let xx=1;xx<w-1;xx++)dot(c,x+xx,y,palette[materials[spec.style][0]]);
 return c;
}
export function generate(){
 for(const p of [incoming,docs+'/preview'])mkdirSync(resolve(root,p),{recursive:true});const assets=[],artwork=[];
 for(const stem of [...Object.keys(specs),...Object.keys(embedded)])for(const code of ['i','w']){
  const old=formal.assets.find(a=>a.id===`gs-${stem}-${code}-v1`);if(!old)throw Error('Missing old asset '+stem);
  const spec=specs[stem]??embedded[stem];let c;
  if(embedded[stem])c=receiver(old,spec,code);else{
   c=drawMagazine(spec,code);const n=spec.graftTop?.[code==='i'?0:1]??0;
   if(n){const src=decode(resolve(root,old.file));for(let y=0;y<n;y++)for(let x=0;x<c.w;x++)dot(c,x,y,x<src.w?Array.from(src.data.subarray((y*src.w+x)*4,(y*src.w+x)*4+4)):[0,0,0,0]);}
  }
  const id=`gs-${stem}-${code}-v2`,file=`${incoming}/${id}.png`,bytes=png(c);writeFileSync(resolve(root,file),bytes);
  assets.push({...old,id,file,w:c.w,h:c.h,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),revision:2,colors:colors(c),source:docs+'/source/pixel-artwork.json',sourceRect:null,replacesSha256:old.sha256,exportMethod:'native final-resolution integer pixel profile; W independently outlined and detailed; immutable receiver pixels outside recorded magazine mask'});
  const runs=[];for(let y=0;y<c.h;y++){let x=0;while(x<c.w){const o=(y*c.w+x)*4,p=c.data.subarray(o,o+4);if(!p[3]){x++;continue;}let end=x+1;while(end<c.w&&p.equals(c.data.subarray((y*c.w+end)*4,(y*c.w+end)*4+4)))end++;runs.push([x,y,end-x,p.toString('hex')]);x=end;}}
  artwork.push({id,w:c.w,h:c.h,spec,rgbaRuns:runs});
 }
 const manifest={schema:1,revision:1,batch:'M3-W3',totals:{count:assets.length,bytes:assets.reduce((n,a)=>n+a.bytes,0)},assets};
 writeFileSync(resolve(root,incoming+'/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 writeFileSync(resolve(root,docs+'/source/pixel-artwork.json'),JSON.stringify({schema:1,method:'Final-resolution native pixel profiles plus lossless immutable receiver regions; RGBA horizontal runs replay the final sprites without PNG sources',palette,assets:artwork},null,2)+'\n');
 console.log(JSON.stringify(manifest.totals));return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))generate();
