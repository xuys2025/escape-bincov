// Reproducible conditioning of the four image_gen originals; no gameplay integration.
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)(process.env.BINCOV_SHARP_MODULE || 'C:/Users/xty/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root=resolve('docs/coast-sample-view/sol-acceptance-20261008/assets');
await mkdir(`${root}/png`,{recursive:true}); await mkdir(`${root}/preview`,{recursive:true});
const hex=a=>a.map(c=>parseInt(c,16));
const colors=a=>a.map(s=>hex(s.match(/../g)));
const ramps={player:colors(['242321','393733','4B4842','59604A','777268','75634E','C3A26A','c9a65e']),stone:colors(['393733','4B4842','777268','A49B88','59604A']),plaster:colors(['4B4842','777268','A49B88','C9C0AC','59604A']),window:colors(['242321','394B50','687B7B','777268','A49B88']),wood:colors(['242321','393733','75634E','784D3D','A27351']),asphalt:colors(['242321','393733','4B4842','777268']),yard:colors(['4B4842','777268','A49B88','75634E','59604A']),tile:colors(['4B4842','777268','A49B88','C9C0AC']),gun:colors(['242321','393733','4B4842','777268','75634E','784D3D','A27351','4a463c'])};
const sources={}; for(const k of ['player','wall','ground','carbine']){const p=`${root}/source/${k}-source.png`;const {data,info}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});sources[k]={p,data,info};}
function bounds(s,rect){let x0=rect[0]+rect[2],y0=rect[1]+rect[3],x1=0,y1=0;for(let y=rect[1];y<rect[1]+rect[3];y++)for(let x=rect[0];x<rect[0]+rect[2];x++)if(s.data[(y*s.info.width+x)*4+3]>=128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x1<x0)throw Error('Empty source crop');return {left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};}
function quantize(data, ramp, opaque=false){for(let i=0;i<data.length;i+=4){if(!opaque&&data[i+3]<128){data.fill(0,i,i+4);continue;}let best=ramp[0],dist=Infinity;for(const c of ramp){let d=c.reduce((n,v,j)=>n+(v-data[i+j])**2,0);if(d<dist){dist=d;best=c;}}best.forEach((v,j)=>data[i+j]=v);data[i+3]=255;}return data;}
const assets=[];
async function emit(id,k,crop,w,h,ramp,extra={},opaque=false,post){let {data}=await sharp(sources[k].p).extract(crop).resize(w,h,{kernel:'nearest',fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});quantize(data,ramps[ramp],opaque);post?.(data,w,h);const bytes=await sharp(data,{raw:{width:w,height:h,channels:4}}).png().toBuffer();const file=`png/${id}.png`;await writeFile(`${root}/${file}`,bytes);const alpha=new Set(),used=new Set();for(let i=0;i<data.length;i+=4){alpha.add(data[i+3]);if(data[i+3])used.add([...data.subarray(i,i+3)].join(','));}assets.push({id,file,w,h,anchor:[0,h],layer:'upright',logicalEntity:null,decorative:true,sha256:createHash('sha256').update(bytes).digest('hex'),source:`source/${k}-source.png`,crop,alpha:[...alpha].sort(),colors:used.size,...extra});return data;}
for(let r=0;r<5;r++)for(let f=0;f<5;f++){
 const dir=['e','se','s','ne','n'][r],s=sources.player,rect=[Math.floor(f*s.info.width/5),Math.floor(r*s.info.height/5),Math.floor(s.info.width/5),Math.floor(s.info.height/5)],crop=bounds(s,rect);
 const h=([1,3].includes(f)?38:39),w=Math.round(crop.width/crop.height*h);
 let {data}=await sharp(s.p).extract(crop).resize(w,h,{kernel:'nearest',fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});quantize(data,ramps.player);
 const full=Buffer.alloc(32*48*4),left=16-Math.floor(w/2),top=48-h;
 for(let y=0;y<h;y++)data.copy(full,((y+top)*32+left)*4,y*w*4,(y+1)*w*4);
 const id=`coast-player-body-${dir}-f${f}-v1`,file=`png/${id}.png`,bytes=await sharp(full,{raw:{width:32,height:48,channels:4}}).png().toBuffer();await writeFile(`${root}/${file}`,bytes);
 assets.push({id,file,w:32,h:48,anchor:[16,48],layer:'upright',kind:'player',dir,frame:f,pose:f===0?'idle':`walk-${f}`,baseline:48,headTop:top,logicalEntity:'player',decorative:false,sha256:createHash('sha256').update(bytes).digest('hex'),source:'source/player-source.png',crop,conditioning:'alpha >=128; nearest; palette; centered foot boundary; walk1/3 body down1px',alpha:[0,255]});
}
// Source sheet keeps west strip to the left of the second row. Regions are explicit, normalized to1254px.
const wallRegions=[[60,90,255,270],[340,210,280,90],[650,210,280,90],[1020,90,100,280],[65,430,90,310],[220,400,230,350],[470,400,220,350],[710,400,220,350],[955,400,235,350],[220,770,230,340],[470,770,220,340]];
const wallNames=['core','edge-n','edge-s','edge-e','edge-w','exterior-a','exterior-b','interior','window-ew','door-ew-closed','door-ew-open'];
for(let i=0;i<11;i++){
 const w=i===3||i===4?3:32,h=i===1||i===2?3:i<5?32:48,crop=bounds(sources.wall,wallRegions[i]);
 const ramp=i===7?'plaster':i===8?'window':i>=9?'wood':'stone';
 await emit(`coast-wall-${wallNames[i]}-v1`,'wall',crop,w,h,ramp,{anchor:[0,h],part:wallNames[i],composedWallAnchor:[0,80],layer:i===0?'upper':'upright',logicalEntity:i===8?'window':i>=9?'door':'wall',decorative:false},i!==10,(data,W,H)=>{
   if(i===5||i===6)for(let y=0;y<H;y++)for(let x=0;x<W;x++){const at=(y*W+x)*4;if(y<39&&data[at]===89&&data[at+1]===96)data.set([119,114,104,255],at);if(y>=39){const dark=data[at]<100;data.set(dark?[57,55,51,255]:[89,96,74,255],at);}}
   if(i===6)for(let y=13;y<30;y++){data.set(y%3?[120,77,61,255]:[162,115,81,255],(y*W+3)*4);}
   if(i===7)for(let y=0;y<H;y++)for(let x=0;x<W;x++){const at=(y*W+x)*4;if(y<30&&data[at]===89&&data[at+1]===96)data.set([164,155,136,255],at);if(y>=30)data.set(data[at]<100?[75,72,66,255]:[89,96,74,255],at);}
   if(i>=9)for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(y<4||x<5||x>=27){const at=(y*W+x)*4;data.set(data[at]<100?[75,72,66,255]:[164,155,136,255],at);}
   if(i===10)for(let y=4;y<H;y++)for(let x=1;x<5;x++)data.set(x===1?[57,55,51,255]:[117,99,78,255],(y*W+x)*4);
   if(i===10) for(let y=4;y<H;y++)for(let x=5;x<27;x++)data.fill(0,(y*W+x)*4,(y*W+x+1)*4);
 });
}
const groundRects=[[74,56,400,400],[570,56,400,400],[1062,56,400,400],[74,554,400,400],[570,554,400,400],[1062,554,400,400]];
for(let i=0;i<6;i++){const kind=i<2?'asphalt':i<4?'yard':'tile',variant=i%2?'b':'a';await emit(`coast-ground-${kind}-${variant}-v1`,'ground',{left:groundRects[i][0],top:groundRects[i][1],width:400,height:400},32,32,kind,{anchor:[0,0],layer:'ground',seamless:true},true,(d,W,H)=>{
 if(kind==='tile'){for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(x===15||x===31||y===15||y===31){d.set([75,72,66,255],(y*W+x)*4);}}
 else {for(let y=0;y<H;y++)d.copy(d,(y*W+31)*4,(y*W)*4,(y*W+1)*4);for(let x=0;x<W;x++)d.copy(d,(31*W+x)*4,x*4,(x+1)*4);}
});}
await emit('coast-weapon-carbine-held-v1','carbine',bounds(sources.carbine,[0,0,sources.carbine.info.width,sources.carbine.info.height]),31,10,'gun',{anchor:[8,4],grip:[8,4],muzzle:[28,4],barrelAxis:4,logicalEntity:'carbine',decorative:false,gloves:'#4a463c',layer:'upright'},false,(d,W,H)=>{
 // Fit the source to nine rows with a transparent top row: the barrel center
 // moves to row4 while retaining the lower stock/hand silhouette in ten rows.
 const original=Buffer.from(d);d.fill(0);for(let y=1;y<H;y++){const sy=Math.floor((y-1)*H/(H-1));original.copy(d,y*W*4,sy*W*4,(sy+1)*W*4);}
 // Two grip clusters remain neutral to avoid direction-mirrored bare-skin hands.
 for(const [x,y]of [[8,5],[8,6],[9,5],[18,5],[18,6],[19,5]])if(d[(y*W+x)*4+3])d.set([74,70,60,255],(y*W+x)*4);
});
const wallSlots=['coast-wallcap-core-a','coast-wallcap-edge-n','coast-wallcap-edge-s','coast-wallcap-edge-e','coast-wallcap-edge-w','coast-wall-ext-a','coast-wall-ext-b','coast-wall-int-a','coast-wall-window-ew','coast-door-ew-closed','coast-door-ew-open'];
for(const a of assets){a.width=a.w;a.height=a.h;a.prompt=`source/prompts.json#${a.source.match(/source\/(.*)-source/)[1]}`;if(a.kind==='player'){a.baselineY=48;a.frameIndex=a.frame;a.frame=a.frame===0?'idle':`walk${a.frame}`;a.dir=a.dir.toUpperCase();a.slot='coast-player';}else if(a.part){a.slot=wallSlots[wallNames.indexOf(a.part)];if(a.part.startsWith('exterior'))a.wetBandPx=9;if(a.part==='interior')a.lowerSkirtPx=18;if(a.part==='door-ew-open'){a.opening={x:5,y:4,w:22,h:44};a.leftLeafPx=4;}}else if(a.logicalEntity==='carbine'){a.axisRow=4;a.slot='coast-weapon-carbine';}else a.slot=a.id.replace(/-[ab]-v1$/,'');}
const manifest={schema:1,status:'first-samples-for-Opus-review-not-integrated',baseline:'cdfc965f3015bbf562cee63eb241e9fa6bf70753',specifications:['../../../../../前端原型-城中村街口-20261007/docs/07-给Sol-素材需求变更.md','../../../../../前端原型-城中村街口-20261007/docs/03-给Sol-图片规格清单.md'],pixelPolicy:{scaleMode:'nearest',alpha:[0,255],shadows:'none; runtime-owned',actorMirror:{W:'E',SW:'SE',NW:'NE'},anchorConvention:'pixel-boundary coordinates; y=48 is lower edge',palette:ramps},counts:{player:25,wall:11,ground:6,weapon:1,total:43},sourceTool:'image_gen',conditioningScript:'scripts/sol-sample-assets.mjs',sources:await Promise.all(Object.entries(sources).map(async([k,s])=>({kind:k,file:`source/${k}-source.png`,sha256:createHash('sha256').update(await readFile(s.p)).digest('hex'),prompt:'source/prompts.json#'+k}))),assets};
await writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
async function preview(list,cols,cellW,cellH,name,scale=4){const composites=[];for(let i=0;i<list.length;i++){const a=list[i];const input=await sharp(`${root}/${a.file}`).resize(a.w*scale,a.h*scale,{kernel:'nearest'}).toBuffer();composites.push({input,left:(i%cols)*cellW+Math.floor((cellW-a.w*scale)/2),top:Math.floor(i/cols)*cellH+cellH-a.h*scale});}await sharp({create:{width:cols*cellW,height:Math.ceil(list.length/cols)*cellH,channels:4,background:'#687b7b'}}).composite(composites).png().toFile(`${root}/preview/${name}.png`);}
await preview(assets.filter(a=>a.kind==='player'),5,144,208,'player-5x5');await preview(assets.filter(a=>a.part),4,144,208,'wall-parts');await preview(assets.filter(a=>a.logicalEntity==='carbine'),1,248,80,'carbine',8);
const comps=[];for(let i=0;i<6;i++){const a=assets[36+i],tile=await sharp(`${root}/${a.file}`).resize(64,64,{kernel:'nearest'}).toBuffer();for(let y=0;y<3;y++)for(let x=0;x<3;x++)comps.push({input:tile,left:(i%3)*208+x*64,top:Math.floor(i/3)*208+y*64});}await sharp({create:{width:624,height:416,channels:4,background:'#393733'}}).composite(comps).png().toFile(`${root}/preview/ground-repeat-3x3.png`);
console.log(`Wrote ${assets.length} native assets and manifest.`);
