// Optional real importer rehearsal. Only process-local metadata is injected; project files are not written.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root,docs,manifest,assets,picture,configurations,assemble } from './assemble.mjs';
import { canvas,rect,poly,blit,crop,save,text,colors } from './pixels.mjs';
import { GUNSMITH_ART,GUNSMITH_VIRTUAL } from '../../../../../src/art/gunsmith-art-meta.ts';
import { gunArtLayout } from '../../../../../src/art/gunsmith-layout.ts';
import { validateBuild } from '../../../../../src/gunsmith/compat.ts';
import { buildOf,gunSize } from '../../../../../src/gunsmith/instance.ts';
import { ATTACHMENTS,GUNS } from '../../../../../src/gunsmith/catalog.ts';
for(const a of manifest.assets)GUNSMITH_ART[a.id.replace(/-v\d+$/,'')]=a;
let next=0;const tree=parts=>parts.map(([id,slot,children=[]])=>({uid:`w2-${++next}`,id,slot,relief:false,children:tree(children)}));
const saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json'))),checks=[],fits=[],supported=Object.keys(GUNS).filter(g=>GUNSMITH_ART[`gs-${g}-receiver-h`]);
const legacy=JSON.parse(readFileSync(resolve(root,'docs/gunsmith/art/m3-w1/source/legacy-inventory.json')));
function layerImage(key){if(assets.has(key))return picture(key);const a=GUNSMITH_VIRTUAL[key];assert.ok(a,'virtual image '+key);const source=legacy.images[a.sourceKey],src=canvas(source.w,source.h);for(const o of source.ops){if(o[0]==='r')rect(src,...o.slice(1));else poly(src,...o.slice(1));}
 const c=canvas(a.w,a.h);if(a.rect)blit(c,crop(src,...a.rect),...(a.wholeCanvasLayer?[a.rect[0],a.rect[1]]:[0,0]));else{blit(c,src,0,0);for(const r of a.clearRects??[])rect(c,[0,0,0,0],...r);for(const r of a.fillRects??[])rect(c,...r);}return c;
}
for(const [gun,configs]of Object.entries(configurations))for(const [configuration,parts]of Object.entries(configs)){
 const build=tree(parts);assert.ok(validateBuild(buildOf({id:gun,parts:build})).ok,gun+'/'+configuration+' valid');
 for(const code of ['h','i','w']){const actual=gunArtLayout(gun,build,code),expected=saved.assemblies.find(a=>a.gun===gun&&a.configuration===configuration&&a.code===code);
  assert.deepEqual([actual.w,actual.h,actual.tip],[expected.w,expected.h,expected.tip]);assert.deepEqual(actual.layers.map(l=>({key:l.key,label:l.label,origin:[l.x,l.y]})),expected.layers);
  if(code==='h')assert.deepEqual([actual.grip,actual.bore,actual.forward,actual.hand],[expected.grip,expected.bore,expected.forward,expected.hand]);if(expected.beam)assert.deepEqual(actual.beam,expected.beam);
  checks.push({gun,configuration,code,status:'pass',size:[actual.w,actual.h]});
 }
}
for(const gun of ['augb','mb1911','umpb45','pb90','svdb','mb14','mb700','rpkb']){if(!GUNSMITH_ART['gs-'+gun+'-receiver-h'])continue;const bare=gunArtLayout(gun,[],'h',false);assert.deepEqual(bare.layers.map(l=>({key:l.key,label:l.label,origin:[l.x,l.y]})),saved.bareFactories.find(r=>r.gun===gun).layers);}
const required=[...new Set(manifest.assets.filter(a=>a.role==='part').map(a=>a.item))],reuseByGun={augb:['O03','O08','F01','F03','T01','T05','G10','M05','M06','M07'],mb1911:['O01','T04','T08'],umpb45:['O03','F01','F03','T01','T05'],pb90:['O03','T01','T05'],svdb:['O03','O08'],mb14:['O03','O08'],mb700:['O03','O08'],rpkb:['A08','O03','O08','S04','P03','P04','G09','M05','M06','M07','F01','F03','T01','T05']},reuse=reuseByGun.augb;
const available=Object.keys(ATTACHMENTS).filter(id=>GUNSMITH_ART[`gs-${id.toLowerCase()}-i`]),sheets=new Map();
for(const gun of supported)for(const id of [...new Set([...required,...(reuseByGun[gun]??[])])]){
 const a=ATTACHMENTS[id],node=[id,a.mount],prefix=a.needs.filter(n=>n.on.includes(gun)).map(n=>[n.part,ATTACHMENTS[n.part].mount]),candidates=[[...prefix,node]];
 for(const opener of available){const o=ATTACHMENTS[opener];if(opener!==id&&o.provides[a.mount]&&(GUNS[gun].slots[o.mount]??0)>0)candidates.push([...prefix,[opener,o.mount,[node]]]);}
 const parts=candidates.find(c=>validateBuild(buildOf({id:gun,parts:tree(c)})).ok);if(!parts)continue;
 const build=tree(parts),size=gunSize({id:gun,parts:build}),frames=[];
 for(const code of ['h','i','w']){const actual=gunArtLayout(gun,build,code),key=`gs-${id.toLowerCase()}-${code}`,l=actual.layers.find(l=>l.key===key||l.key===key+'-'+gun);if(!l&&code==='h'&&a.mount==='grip'&&!GUNSMITH_ART[key]){const image=canvas(actual.w,actual.h);for(const layer of actual.layers)blit(image,layerImage(layer.key),layer.x,layer.y);frames.push({code,size:[actual.w,actual.h],colors:colors(image),factoryGripFallback:true,image});continue;}assert.ok(l,`${gun}/${id}/${code} has image and mount`);
  const limit=code==='h'?[48,16]:code==='i'?[size.w*36,size.h*26]:[size.w*72,size.h*52];assert.ok(actual.w<=limit[0]&&actual.h<=limit[1],`${gun}/${id}/${code} ${actual.w}x${actual.h} > ${limit}`);
  const image=canvas(actual.w,actual.h);for(const layer of actual.layers)blit(image,layerImage(layer.key),layer.x,layer.y);
  // New universal parts touch a real opaque parent and do not exceed the muzzle in held output.
  const p=layerImage(l.key);let touching=false;for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(p.data[(y*p.w+x)*4+3]){
   if(code==='h'&&['under','side1','side2'].includes(l.label))assert.ok(l.x+x<actual.tip[0],gun+'/'+id+' behind muzzle');
   if(required.includes(id))for(const other of actual.layers.filter(o=>o!==l&&!o.label.startsWith('glove'))){const q=layerImage(other.key),px=l.x+x-other.x,py=l.y+y-other.y;for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++)if(px+u>=0&&py+v>=0&&px+u<q.w&&py+v<q.h&&q.data[((py+v)*q.w+px+u)*4+3])touching=true;}
  }if(required.includes(id))assert.ok(touching,gun+'/'+id+'/'+code+' connected');
  const maximum=code==='w'?24:16;assert.ok(colors(image)<=maximum,gun+'/'+id+'/'+code+' combined colors');frames.push({code,size:[actual.w,actual.h],colors:colors(image),image});
 }
 fits.push({gun,part:id,configuration:parts,status:'pass',frames:frames.map(({image,...r})=>r)});if(!sheets.has(gun))sheets.set(gun,[]);sheets.get(gun).push({id,frames});
}
for(const id of required)assert.ok(fits.some(f=>f.part===id));for(const [gun,ids]of Object.entries(reuseByGun))for(const id of ids)assert.ok(fits.some(f=>f.gun===gun&&f.part===id),id+' on '+gun);
for(const [gun,rows]of sheets){const c=canvas(900,38+rows.length*77);rect(c,'#101c22',0,0,c.w,c.h);text(c,gun+' / UNIVERSAL PART FITS / NOT GAME SCREENSHOTS',12,12);
 rows.forEach(({id,frames},j)=>{const y=42+j*77;text(c,id,12,y,'#cb9362',2);for(const {code,image}of frames){const x=code==='h'?90:code==='i'?260:510,s=code==='h'?3:code==='i'?2:1;blit(c,image,x,y,s);}});save(resolve(root,docs+'/preview/fit-'+gun+'.png'),c);
}
const report={schema:1,status:'pass',codeHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'Process-local metadata injection; actual validateBuild, gunSize, gunArtLayout; no game or formal asset files written',configurations:saved.assemblies.length/3,checks,bareFactories:saved.bareFactories.length,supportedGuns:supported,fitRelations:fits.length,fits,limits:'All twenty catalog guns; all forty wave-two parts and explicit legacy reuse relations where catalog compatibility permits. Single-part fits plus designated full-wave compound builds, not every possible loadout.',integrationNote:'Native receiver front hands follow d3eb43f: add glove-front unless hands are embedded or hand equals grip. Legacy bare PNG roles await formal importer integration. Eight headings and live-game review remain M3-08.',scope:'Art importer rehearsal, not live game acceptance. Official import and maintainer review remain outstanding.'};
writeFileSync(resolve(root,docs+'/runtime-layout-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'pass',configurations:saved.assemblies.length/3,layouts:checks.length,bareFactories:saved.bareFactories.length,supportedGuns:supported.length,fitRelations:fits.length}));
