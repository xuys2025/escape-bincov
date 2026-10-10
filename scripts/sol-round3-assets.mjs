// ART-R01..R10: repair only the existing 43 samples. Never writes runtime assets or src.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const sharp=createRequire(import.meta.url)(process.env.BINCOV_SHARP_MODULE || 'C:/Users/xty/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=resolve('docs/coast-sample-view/sol-round3-20261008/assets'),oldRoot=resolve('docs/coast-sample-view/sol-acceptance-20261008/assets');
const old=JSON.parse(await readFile(resolve(oldRoot,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(resolve(root,'png'),{recursive:true});await mkdir(resolve(root,'preview'),{recursive:true});
const colors=a=>a.map(s=>s.match(/../g).map(v=>parseInt(v,16)));
const ramps={
 player:colors(['242321','393733','4b4842','59604a','777268','75634e','c3a26a','c9a65e']),
 stone:colors(['4b4842','777268','a49b88','59604a']),
 plaster:colors(['777268','a49b88','c9c0ac','59604a','4b4842']),
 window:colors(['242321','444b46','6b7368','777268','a49b88']),
 yard:colors(['4b4842','59574e','69655a','59604a']),
 tile:colors(['59554d','69645a','777268','4b4842'])
};
const sources={};
for(const k of ['player','wall','ground']){const path=resolve(root,'source',k+'-revised.png');const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});sources[k]={path,data,info};}
function bounds(s,r){let x0=r[0]+r[2],y0=r[1]+r[3],x1=-1,y1=-1;for(let y=r[1];y<r[1]+r[3];y++)for(let x=r[0];x<r[0]+r[2];x++)if(s.data[(y*s.info.width+x)*4+3]>=128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}assert.ok(x1>=x0);return{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};}
function quantize(data,ramp,opaque=false){for(let i=0;i<data.length;i+=4){if(!opaque&&data[i+3]<128){data.fill(0,i,i+4);continue;}let best=ramp[0],d=Infinity;for(const c of ramp){const n=c.reduce((sum,v,j)=>sum+(v-data[i+j])**2,0);if(n<d){d=n;best=c;}}data.set([...best,255],i);}return data;}
function continuity(d,w,h){for(let y=0;y<h;y++)d.copy(d,(y*w+w-1)*4,y*w*4,(y*w+1)*4);for(let x=0;x<w;x++)d.copy(d,((h-1)*w+x)*4,x*4,(x+1)*4);}
const wallNames=['core','edge-n','edge-s','edge-e','edge-w','exterior-a','exterior-b','interior','window-ew','door-ew-closed','door-ew-open'];
const wallRegions=[[60,90,255,270],[340,210,280,90],[650,210,280,90],[1020,90,100,280],[65,430,90,310],[220,400,230,350],[470,400,220,350],[710,400,220,350],[955,400,235,350],[220,770,230,340],[470,770,220,340]];
const groundRects=[[74,56,400,400],[570,56,400,400],[1062,56,400,400],[74,554,400,400],[570,554,400,400],[1062,554,400,400]];
const assets=[];
for(const prior of old.assets){
 const a=structuredClone(prior);a.revision=2;a.previousSha256=prior.sha256;a.repairIds=[];
 let data,crop,kind,conditioning;
 if(a.kind==='player'){
  kind='player';const r=['E','SE','S','NE','N'].indexOf(a.dir),f=a.frameIndex,s=sources.player;
  crop=bounds(s,[Math.floor(f*s.info.width/5),Math.floor(r*s.info.height/5),Math.floor(s.info.width/5),Math.floor(s.info.height/5)]);
  const h=[1,3].includes(f)?38:39,w=Math.round(crop.width/crop.height*h),left=16-Math.floor(w/2),top=48-h;
  assert.ok(left>=0&&left+w<=32);
  const small=quantize(await sharp(s.path).extract(crop).resize(w,h,{kernel:'nearest',fit:'fill'}).ensureAlpha().raw().toBuffer(),ramps.player);
  data=Buffer.alloc(32*48*4);for(let y=0;y<h;y++)small.copy(data,((y+top)*32+left)*4,y*w*4,(y+1)*w*4);
  a.headTop=top;a.repairIds=['ART-R07','ART-R09'];a.bodyArms='upper sleeves only; no baked hands or hanging forearms';
  a.heldGripLocal=[16,26];a.weaponPresentationProposal={backDirections:['N','NE','NW'],policy:'hide visual weapon when facing back; requires Opus integration',affectsSimulation:false};
  conditioning='Edited body source: no baked hands; nearest-neighbour; binary alpha; neutral palette; baseline preserved';
 }else if(['core','exterior-a','exterior-b','interior','window-ew'].includes(a.part)){
  kind='wall';const i=wallNames.indexOf(a.part);crop=bounds(sources.wall,wallRegions[i]);
  // Ignore generated edge antialias/isolated coloured edit residues.
  crop={left:crop.left+2,top:crop.top+2,width:crop.width-4,height:crop.height-4};
  const ramp=a.part==='interior'?'plaster':a.part==='window-ew'?'window':'stone';
  data=quantize(await sharp(sources.wall.path).extract(crop).resize(a.w,a.h,{kernel:'nearest',fit:'fill'}).ensureAlpha().raw().toBuffer(),ramps[ramp],true);
  if(a.part==='core'){continuity(data,a.w,a.h);a.repairIds=['ART-R01'];}
  if(a.part.startsWith('exterior')){
   for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const at=(y*a.w+x)*4;if(y<39&&data[at]===89&&data[at+1]===96)data.set([119,114,104,255],at);if(y>=39)data.set(data[at]<100?[75,72,66,255]:[89,96,74,255],at);}
   // Shared low-detail edge profile: no side seam and no abrupt A/B discontinuity.
   for(let y=0;y<a.h;y++)for(const x of [0,31])data.set(y>=39?[75,72,66,255]:[119,114,104,255],(y*a.w+x)*4);
   a.repairIds=['ART-R02'];
  }
  if(a.part==='interior'){for(let y=30;y<a.h;y++)for(let x=0;x<a.w;x++){const at=(y*a.w+x)*4;data.set(data[at]<100?[75,72,66,255]:[89,96,74,255],at);}a.repairIds=['ART-R03'];}
  if(a.part==='window-ew')a.repairIds=['ART-R04'];
  conditioning='Edited wall source; nearest; binary alpha; part-specific low-contrast palette; no new part';
 }else if(a.layer==='ground'&&!a.file.includes('asphalt')){
  kind='ground';const ix=old.assets.filter(x=>x.layer==='ground').findIndex(x=>x.id===a.id),rect=groundRects[ix],mat=a.file.includes('yard')?'yard':'tile';
  crop={left:rect[0],top:rect[1],width:rect[2],height:rect[3]};
  data=quantize(await sharp(sources.ground.path).extract(crop).resize(32,32,{kernel:'nearest',fit:'fill'}).ensureAlpha().raw().toBuffer(),ramps[mat],true);
  if(mat==='tile'){for(let y=0;y<32;y++)for(let x=0;x<32;x++)if([15,31].includes(x)||[15,31].includes(y))data.set([75,72,66,255],(y*32+x)*4);a.repairIds=['ART-R06'];}
  else{continuity(data,32,32);a.repairIds=['ART-R05'];}
  conditioning='Edited ground source; reduced courtyard contrast; tile a/b in one muted ramp; exact existing grout/edges';
 }
 if(data){const bytes=await sharp(data,{raw:{width:a.w,height:a.h,channels:4}}).png().toBuffer();await writeFile(resolve(root,a.file),bytes);a.sha256=sha(bytes);a.source='source/'+kind+'-revised.png';a.crop=crop;a.conditioning=conditioning;a.prompt='source/prompts.json#'+kind;delete a.colors;}
 else{await copyFile(resolve(oldRoot,a.file),resolve(root,a.file));a.conditioning='Unchanged byte-for-byte from first batch';a.originalSource=a.source;a.source='../../sol-acceptance-20261008/assets/'+prior.source;a.prompt='../../sol-acceptance-20261008/assets/'+prior.prompt;a.sourceReferenceOnly=true;}
 assets.push(a);
}
assert.equal(assets.length,43);
const repairDisposition=[
 ['ART-R01','repaired-png','Wall core border removed; paired edges verified'],
 ['ART-R02','repaired-png','No third exterior; A/B source motifs differ and side profiles match'],
 ['ART-R03','repaired-png','Arrow-like marks removed in edited interior'],
 ['ART-R04','repaired-png','Window strip uses low-saturation grey-green'],
 ['ART-R05','repaired-png','Courtyard bright speckles reduced'],
 ['ART-R06','repaired-png','Tile A/B share a darker close-luminance ramp'],
 ['ART-R07','repaired-png-awaiting-in-engine-review','All 25 bodies remove baked hands and dangling forearms'],
 ['ART-R08','requires-opus-integration','Proposal: hide only the visual gun on N/NE/NW; current scene does not consume this field. Simulation unchanged.'],
 ['ART-R09','mirror-retained-for-Opus-review','W/SW/NW continue mirroring with diffuse shading; Opus final lighting preference pending, no added directions'],
 ['ART-R10','blocked-by-fixed-43-scope','No crouch sample can be added without expanding frame count or breaking the five-frame contract; existing idle fallback remains unaccepted']
].map(([id,status,note])=>({id,status,note}));
const manifest={...old,status:'revised-first-batch-awaiting-Opus-integration',baseline:'6a7e6b194bc3778e7e009eddf671699b112c3cdb',revision:2,conditioningScript:'scripts/sol-round3-assets.mjs',
 specifications:['../../round3/README.md','../../sol-acceptance-20261008/evidence/specification/03-给Sol-图片规格清单.md','../../sol-acceptance-20261008/evidence/specification/07-给Sol-素材需求变更.md'],
 pixelPolicy:{...old.pixelPolicy,palette:ramps,lighting:'Neutral ambient shading; existing mirrors retained pending Opus final lighting review',bodyHands:'No hands or lower forearms baked into body',crouch:{provided:false,currentFallback:'idle',accepted:false}},
 assetIdPolicy:'Existing v1 IDs and filenames deliberately retained for the Opus import contract; revision and SHA256 distinguish these replacements',
 repairDisposition,sources:await Promise.all(Object.entries(sources).map(async([kind,s])=>({kind,file:'source/'+kind+'-revised.png',sha256:sha(await readFile(s.path)),prompt:'source/prompts.json#'+kind}))),assets};
await writeFile(resolve(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
async function sheet(list,cols,cw,ch,name,scale=4){const comp=[];for(let i=0;i<list.length;i++){const a=list[i];comp.push({input:await sharp(resolve(root,a.file)).resize(a.w*scale,a.h*scale,{kernel:'nearest'}).toBuffer(),left:i%cols*cw+Math.floor((cw-a.w*scale)/2),top:Math.floor(i/cols)*ch+ch-a.h*scale});}await sharp({create:{width:cols*cw,height:Math.ceil(list.length/cols)*ch,channels:4,background:'#687b7b'}}).composite(comp).png().toFile(resolve(root,'preview',name+'.png'));}
await sheet(assets.filter(a=>a.kind==='player'),5,144,208,'player-5x5');
await sheet(assets.filter(a=>a.part),4,144,208,'wall-parts');
await sheet(assets.filter(a=>a.logicalEntity==='carbine'),1,248,80,'carbine',8);
const comp=[];const grounds=assets.filter(a=>a.layer==='ground');for(let i=0;i<grounds.length;i++){const tile=await sharp(resolve(root,grounds[i].file)).resize(64,64,{kernel:'nearest'}).toBuffer();for(let y=0;y<3;y++)for(let x=0;x<3;x++)comp.push({input:tile,left:i%3*208+x*64,top:Math.floor(i/3)*208+y*64});}
await sharp({create:{width:624,height:416,channels:4,background:'#393733'}}).composite(comp).png().toFile(resolve(root,'preview/ground-repeat-3x3.png'));
const cap=assets.find(a=>a.part==='core'),capComp=[];for(let y=0;y<3;y++)for(let x=0;x<6;x++)capComp.push({input:await sharp(resolve(root,cap.file)).resize(128,128,{kernel:'nearest'}).toBuffer(),left:x*128,top:y*128});
await sharp({create:{width:768,height:384,channels:4,background:'#393733'}}).composite(capComp).png().toFile(resolve(root,'preview/wall-core-repeat.png'));
const exteriors=assets.filter(a=>a.part?.startsWith('exterior')),faces=[];for(let i=0;i<8;i++)faces.push({input:await sharp(resolve(root,exteriors[[0,1,1,0,1,0,0,1][i]].file)).resize(128,192,{kernel:'nearest'}).toBuffer(),left:i*128,top:0});
await sharp({create:{width:1024,height:192,channels:4,background:'#393733'}}).composite(faces).png().toFile(resolve(root,'preview/exterior-a-b-run.png'));
console.log(JSON.stringify({assets:43,changed:assets.filter(a=>a.sha256!==a.previousSha256).length,unchanged:assets.filter(a=>a.sha256===a.previousSha256).length,repairDisposition},null,2));
