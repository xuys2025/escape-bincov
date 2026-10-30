import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canvas,decode,dot,rect,crop,blit,text,png,save,colors} from '../../m3-w3/source/pixels.mjs';
import {icons,splits} from './design.mjs';

process.chdir(fileURLToPath(new URL('../../../../../',import.meta.url)));
const dir='docs/gunsmith/art/m4-mags',dest='assets/gunsmith/incoming/m4-mags';
mkdirSync(dest,{recursive:true});mkdirSync(`${dir}/preview`,{recursive:true});
const formalBytes=readFileSync('assets/gunsmith/manifest.json'),formal=JSON.parse(formalBytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
const assets=[],records=[],artwork={schema:1,icons:[],splits:[]};
const ink='#122027',edge='#24373d';
const ramps={steel:['#425a60','#829c9d','#bdcfca'],black:['#24373d','#425a60','#829c9d'],olive:['#485c4b','#7d9168','#b4bf89'],bakelite:['#5c4236','#996749','#cb9362']};
function rowAt(profile,y){for(let k=1;k<profile.length;k++){const a=profile[k-1],b=profile[k];if(y<=b[0]){const t=(y-a[0])/(b[0]-a[0]);return[Math.round(a[1]+t*(b[1]-a[1])),Math.round(a[2]+t*(b[2]-a[2]))];}}return profile.at(-1).slice(1);}
function icon(spec){
  const p=canvas(24,24),rows=Array.from({length:spec.h},(_,y)=>rowAt(spec.profile,y));
  const min=Math.min(...rows.map(r=>r[0])),max=Math.max(...rows.map(r=>r[1]));
  const ox=Math.floor((24-(max-min+1))/2)-min,oy=Math.floor((24-spec.h)/2),[dark,mid,light]=ramps[spec.style];
  const inside=(x,y)=>y>=0&&y<rows.length&&x>=rows[y][0]&&x<=rows[y][1];
  const interior=(x,y)=>inside(x,y)&&[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].every(([a,b])=>inside(a,b));
  for(let y=0;y<spec.h;y++)for(let x=rows[y][0];x<=rows[y][1];x++){
    let col=ink;
    if(interior(x,y)){
      const rel=x-rows[y][0],width=rows[y][1]-rows[y][0];col=mid;
      if(rel===1)col=light;else if(rel>=width-2)col=dark;
      if(y===1||y===2){col=rel===1||rel===width-1?'#829c9d':edge;}
      if(y===spec.h-2)col=dark;
      if(y>=4&&y<spec.h-3){
        if(spec.detail.includes('rib')){
          const rib=spec.detail==='single-rib'?[Math.floor(width*.55)]:[Math.floor(width*.36),Math.floor(width*.7)];
          if(rib.includes(rel))col=dark;else if(rib.some(v=>v-1===rel))col=light;
        }else if(spec.detail==='witness'&&rel===Math.floor(width*.58)&&y%4===1)col=ink;
        else if(spec.detail==='window'&&rel>=3&&rel<=5){col=edge;if(y%3===1)col='#829c9d';}
      }
    }
    dot(p,x+ox,y+oy,col);
  }
  // The lips, spine and floorplate remain part of this independently drawn icon.
  return p;
}
function write(meta,p){const bytes=png(p),file=`${dest}/${meta.id}.png`;writeFileSync(file,bytes);
  const a={...meta,file,w:p.w,h:p.h,bytes:bytes.length,sha256:hash(bytes),colors:colors(p),source:`${dir}/source/pixel-artwork.json`,sourceRect:null};assets.push(a);return a;
}
const drawings=[];
for(const spec of icons){const p=icon(spec),a=write({id:`gs-${spec.gun}-mag-q24-v1`,revision:1,output:'icon24',gun:spec.gun,item:`${spec.gun}-mag`,role:'icon',slot:null,anchor:null,exportMethod:'original native 24x24 pixel profile, independent icon detail; no I-layer centering or resampling'},p);
  artwork.icons.push({id:a.id,rgba:Buffer.from(p.data).toString('base64'),design:spec});drawings.push({spec,p});}
const output={h:'held',i:'inventory',w:'bench'};
for(const s of splits){const a=formal.assets.find(a=>a.id===s.baseline);if(!a)throw Error(s.baseline);const bytes=readFileSync(a.file);if(hash(bytes)!==a.sha256)throw Error('Baseline hash '+a.id);
  const original=decode(a.file),receiver={...original,data:Buffer.from(original.data)},[x,y,w,h]=s.crop,mag=crop(original,x,y,w,h);
  for(let yy=y+1;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)dot(receiver,xx,yy,[0,0,0,0]);
  const rev=a.revision+1,id=a.id.replace(/-v\d+$/,`-v${rev}`);
  const r=write({...a,id,revision:rev,replacesSha256:a.sha256,mounts:{...a.mounts,mag:[x,y]},exportMethod:'lossless native magazine-layer separation; one shared lip row; unchanged pixels outside crop'},receiver);
  const m=write({id:`gs-${s.gun}-mag-factory-${s.code}-v1`,revision:1,output:output[s.code],gun:s.gun,item:null,role:'factory',slot:'mag',anchor:[0,0],exportMethod:'exact original magazine pixels including shared lip row; default mag layer behind receiver'},mag);
  const recombined=canvas(original.w,original.h);blit(recombined,mag,x,y);blit(recombined,receiver,0,0);
  let differences=0;for(let i=0;i<original.data.length;i+=4)if(!original.data.subarray(i,i+4).equals(recombined.data.subarray(i,i+4)))differences++;
  if(differences)throw Error('Reassembly differs '+id);
  records.push({...s,baselineFile:a.file,baselineSha256:a.sha256,receiver:r.id,magazine:m.id,magMount:[x,y],anchor:[0,0],layerOrder:['mag','receiver'],dimensions:[original.w,original.h],differingPixels:differences,originalRGBA:hash(original.data),recombinedRGBA:hash(recombined.data),receiverColors:r.colors,magazineColors:m.colors});
  artwork.splits.push({receiver:r.id,magazine:m.id,baseline:a.id,crop:s.crop,receiverRGBA:receiver.data.toString('base64'),magazineRGBA:mag.data.toString('base64')});
}
const totals={files:assets.length,pngBytes:assets.reduce((n,a)=>n+a.bytes,0),icons:10,receivers:6,factoryMagazines:6};
writeFileSync(`${dest}/manifest.json`,JSON.stringify({schema:1,revision:1,batch:'M4-MAGS',totals,assets},null,2)+'\n');
writeFileSync(`${dir}/source/pixel-artwork.json`,JSON.stringify(artwork,null,2)+'\n');
writeFileSync(`${dir}/assembly-records.json`,JSON.stringify({schema:1,date:'2026-10-30',acceptedMain:'8a4b46e4942402ed83487aa8fa27ee6169a9fc65',taskStart:'0e9f8b3439166716ae3c8335a4f6fd0cb362b998',formalManifestSha256:hash(formalBytes),records},null,2)+'\n');
function sheet(w,h,bg='#141c1b'){const c=canvas(w,h);rect(c,bg,0,0,w,h);return c;}
const contact=sheet(1100,460);text(contact,'FACTORY MAG ICONS - NATIVE 24X24 AND 3X - G03 G08 STYLE',16,16,'#bdcfca',2);
for(const [i,{spec,p}]of drawings.entries()){const x=16+i*108;text(contact,spec.name,x,52,'#bdcfca',2);blit(contact,p,x,76);blit(contact,p,x,116,3);rect(contact,'#46534f',x,210,88,88);blit(contact,p,x+8,218,3);rect(contact,'#d7d4c6',x,308,88,88);blit(contact,p,x+8,316,3);blit(contact,p,x,414,1,true);}
save(`${dir}/preview/icons-contact.png`,contact);
for(const gun of ['svdb','vb9']){
  const c=sheet(1160,940);text(c,`${gun.toUpperCase()} - EXACT SPLIT / REMOVE / RECOMBINE`,16,16,'#bdcfca',3);let yy=50;
  for(const s of splits.filter(s=>s.gun===gun).sort((a,b)=>'wih'.indexOf(a.code)-'wih'.indexOf(b.code))){const rec=records.find(r=>r.baseline===s.baseline),old=formal.assets.find(a=>a.id===s.baseline),r=assets.find(a=>a.id===rec.receiver),m=assets.find(a=>a.id===rec.magazine);const before=decode(old.file),after=decode(r.file),mag=decode(m.file),scale=s.code==='w'?3:s.code==='i'?3:5;const same=canvas(before.w,before.h);blit(same,mag,...rec.magMount);blit(same,after,0,0);
    for(const [label,p]of [[`${s.code.toUpperCase()} BEFORE`,before],[`${s.code.toUpperCase()} NO MAG`,after],[`${s.code.toUpperCase()} RECOMBINED`,same]]){text(c,label,16,yy,'#bdcfca',2);blit(c,p,224,yy,scale);yy+=p.h*scale+14;}
    text(c,`${s.code.toUpperCase()} MAG LAYER`,850,yy-mag.h*scale-20,'#cb9362',2);blit(c,mag,1030,yy-mag.h*scale-22,scale);yy+=20;
  }save(`${dir}/preview/${gun}-split-reassembly.png`,c);
}
console.log(JSON.stringify({totals,assemblies:records.map(r=>({gun:r.gun,code:r.code,differingPixels:r.differingPixels}))}));
