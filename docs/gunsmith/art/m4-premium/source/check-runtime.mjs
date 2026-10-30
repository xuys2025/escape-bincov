// Process-local import rehearsal; no formal manifest, generated module or game code is written.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GUNSMITH_ART,GUNSMITH_VIRTUAL} from '../../../../../src/art/gunsmith-art-meta.ts';
import {gunArtLayout} from '../../../../../src/art/gunsmith-layout.ts';
import {ATTACHMENTS,GUNS} from '../../../../../src/gunsmith/catalog.ts';
import {validateBuild} from '../../../../../src/gunsmith/compat.ts';
import {buildOf,gunSize} from '../../../../../src/gunsmith/instance.ts';
import {canvas,decode,rect,poly,blit,crop,save,text,colors} from '../../m3-w3/source/pixels.mjs';
import {designs} from './design.mjs';
process.chdir(fileURLToPath(new URL('../../../../../',import.meta.url)));
const dir='docs/gunsmith/art/m4-premium',incoming=JSON.parse(readFileSync('assets/gunsmith/incoming/m4-premium/manifest.json')),formal=JSON.parse(readFileSync('assets/gunsmith/manifest.json'));
const key=a=>a.id.replace(/-v\d+$/,''),images=new Map(formal.assets.map(a=>[key(a),decode(a.file)])),legacy=JSON.parse(readFileSync('docs/gunsmith/art/m3-w1/source/legacy-inventory.json'));
let serial=0;const part=(id,children=[])=>({uid:`premium-art-${++serial}`,id,slot:ATTACHMENTS[id].mount,relief:false,children});
const legal=(gun,parts)=>validateBuild(buildOf({id:gun,parts})).ok;
const ordinary=Object.keys(ATTACHMENTS).filter(id=>!id.startsWith('J'));
function fitted(gun,id){const a=ATTACHMENTS[id];if(a.guns&&!a.guns.includes(gun))return null;const own=part(id);if(legal(gun,[own]))return[own];for(const q of ordinary){const b=ATTACHMENTS[q];if(b.guns&&!b.guns.includes(gun))continue;const on=[part(q,[part(id)])],beside=[part(q),part(id)];if(b.provides[a.mount]&&legal(gun,on))return on;if(legal(gun,beside))return beside;}return null;}
const baseParts=nodes=>nodes.map(n=>({...n,id:designs.find(d=>d.id===n.id)?.ref??n.id,children:baseParts(n.children)}));
function layerImage(key){if(images.has(key))return images.get(key);const a=GUNSMITH_VIRTUAL[key];assert.ok(a,key);const source=legacy.images[a.sourceKey],p=canvas(source.w,source.h);for(const o of source.ops){if(o[0]==='r')rect(p,...o.slice(1));else poly(p,...o.slice(1));}const c=canvas(a.w,a.h);if(a.rect)blit(c,crop(p,...a.rect),...(a.wholeCanvasLayer?[a.rect[0],a.rect[1]]:[0,0]));else{blit(c,p,0,0);for(const r of a.clearRects??[])rect(c,[0,0,0,0],...r);for(const r of a.fillRects??[])rect(c,...r);}images.set(key,c);return c;}
function paint(layout){const c=canvas(layout.w,layout.h);for(const l of layout.layers)blit(c,layerImage(l.key),l.x,l.y);return c;}
const relations=[];for(const gun of Object.keys(GUNS))for(const d of designs){const parts=fitted(gun,d.id);if(parts)relations.push({gun,id:d.id,parts,referenceLayouts:Object.fromEntries(['h','i','w'].map(code=>[code,gunArtLayout(gun,baseParts(parts),code)]))});}
for(const a of incoming.assets){GUNSMITH_ART[key(a)]=a;images.set(key(a),decode(a.file));}
const fits=[],issues=[];let layouts=0;
for(const r of relations){const frames=[];for(const code of ['h','i','w']){try{
 const l=gunArtLayout(r.gun,r.parts,code),ref=r.referenceLayouts[code],node=l.layers.find(n=>n.key.startsWith(`gs-${r.id.toLowerCase()}-${code}`)),size=gunSize({id:r.gun,parts:r.parts}),hidden=code==='h'&&['J11','J14','J18'].includes(r.id);
 if(hidden)assert.ok(!node);else assert.ok(node,`${r.gun}/${r.id}/${code}: image present`);
 assert.deepEqual([l.w,l.h,l.tip,l.grip,l.hand,l.bore,l.beam],[ref.w,ref.h,ref.tip,ref.grip,ref.hand,ref.bore,ref.beam],`${r.gun}/${r.id}/${code}: same assembly geometry as reference`);
 const limit=code==='h'?[48,16]:code==='i'?[size.w*36,size.h*26]:[size.w*72,size.h*52];assert.ok(l.w<=limit[0]&&l.h<=limit[1]);
 const image=paint(l);assert.ok(colors(image)<=(code==='w'?24:16),`${r.gun}/${r.id}/${code}: combined colors ${colors(image)}`);
 if(node){const p=layerImage(node.key);let touching=false;for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(p.data[(y*p.w+x)*4+3]){
  if(code==='h'&&['under','side1','side2'].includes(node.label))assert.ok(node.x+x<l.tip[0],`${r.gun}/${r.id}: behind muzzle`);
  for(const other of l.layers.filter(n=>n!==node&&!n.label.startsWith('glove'))){const q=layerImage(other.key),xx=node.x+x-other.x,yy=node.y+y-other.y;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(xx+dx>=0&&yy+dy>=0&&xx+dx<q.w&&yy+dy<q.h&&q.data[((yy+dy)*q.w+xx+dx)*4+3])touching=true;}
 }assert.ok(touching,`${r.gun}/${r.id}/${code}: touches parent`);}
 frames.push({code,size:[l.w,l.h],colors:colors(image),hiddenRearGrip:hidden,partKey:node?.key??null,tip:l.tip,hand:l.hand,beam:l.beam});layouts++;
 }catch(e){issues.push({gun:r.gun,id:r.id,code,error:e.message});}}
 fits.push({gun:r.gun,id:r.id,parts:r.parts,frames});}
assert.deepEqual([...new Set(fits.map(f=>f.id))].sort(),designs.map(d=>d.id).sort());
// The premium handguards must also host the premium foregrip and device at the exact supplied mounts.
const compound=[];for(const[gun,id]of[['mb4a1','J12'],['akb74','J15'],['akb103','J15']]){const parts=[part(id,[part('J04'),part('J05')])];assert.ok(legal(gun,parts));for(const code of ['h','i','w']){const l=gunArtLayout(gun,parts,code);assert.ok(l.layers.some(n=>n.key.startsWith(`gs-j04-${code}`)));assert.ok(l.layers.some(n=>n.key.startsWith(`gs-j05-${code}`)));const image=paint(l),size=gunSize({id:gun,parts}),limit=code==='h'?[48,16]:code==='i'?[size.w*36,size.h*26]:[size.w*72,size.h*52];assert.ok(l.w<=limit[0]&&l.h<=limit[1]);assert.ok(colors(image)<=(code==='w'?24:16));compound.push({gun,id,code,status:'pass',hand:l.hand,beam:l.beam,size:[l.w,l.h],colors:colors(image)});}}
// Representative all-family builds: combine independently legal fits, keeping a legal tree at each step.
const merge=(old,add)=>{const out=structuredClone(old);for(const n of add){const at=out.findIndex(o=>o.slot===n.slot);if(at<0)out.push(structuredClone(n));else if(out[at].id===n.id)out[at].children=merge(out[at].children,n.children);else if(n.id.startsWith('J')&&!out[at].id.startsWith('J'))out[at]={...structuredClone(n),children:merge(n.children,out[at].children)};}return out;};
const representatives=[];
for(const gun of Object.keys(GUNS)){let parts=[];for(const r of relations.filter(r=>r.gun===gun)){const next=merge(parts,r.parts);if(legal(gun,next))parts=next;}if(!parts.length)continue;const row={gun,parts,outputs:[]};for(const code of ['h','i','w']){const l=gunArtLayout(gun,parts,code),image=paint(l),size=gunSize({id:gun,parts}),limit=code==='h'?[48,16]:code==='i'?[size.w*36,size.h*26]:[size.w*72,size.h*52];if(l.w>limit[0]||l.h>limit[1])issues.push({gun,configuration:'compound',code,error:'combined dimensions exceed ART-SPEC'});if(colors(image)>(code==='w'?24:16))issues.push({gun,configuration:'compound',code,error:`combined colors ${colors(image)}`});row.outputs.push({code,w:l.w,h:l.h,colors:colors(image)});}representatives.push(row);}
const sheet=canvas(1200,48+representatives.length*92);rect(sheet,'#141c1b',0,0,sheet.w,sheet.h);text(sheet,'PREMIUM REPRESENTATIVE ASSEMBLIES - MATERIAL PREVIEW',12,16,'#bdcfca',2);
for(const[i,r]of representatives.entries()){const y=48+i*92;text(sheet,r.gun,12,y,'#bdcfca',2);for(const code of ['h','i','w']){const l=gunArtLayout(r.gun,r.parts,code),image=paint(l),x=code==='h'?150:code==='i'?360:730,s=code==='h'?3:code==='i'?2:1;blit(sheet,image,x,y,s);}}
save(`${dir}/preview/representative-assemblies.png`,sheet);
const report={schema:1,date:'2026-10-30',status:issues.length?'fail':'pass',fitRelations:fits.length,layouts,compoundLayouts:compound.length,representativeGuns:representatives.length,fits,compound,issues,method:'Process-local incoming metadata injection; actual validateBuild, gunSize and gunArtLayout. Native PNG rendering with frozen unchanged legacy virtual I layers. No official source/manifest writes.',scope:'Every premium part on every gun for which a legal standalone or one-opener fit exists; three child-bearing handguard fits and representative compound builds. Gameplay integration and live screenshots remain with implementation.'};
writeFileSync(`${dir}/runtime-layout-check.json`,JSON.stringify(report,null,2)+'\n');writeFileSync(`${dir}/representative-configurations.json`,JSON.stringify({schema:1,representatives},null,2)+'\n');console.log(JSON.stringify({status:report.status,fitRelations:fits.length,layouts,compoundLayouts:compound.length,representativeGuns:representatives.length,issues}));if(issues.length)process.exitCode=1;
