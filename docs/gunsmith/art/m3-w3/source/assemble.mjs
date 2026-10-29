// Independent anchor compositor for the 18 brief rows; formal sources are read-only.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canvas,rect,blit,decode,save,colors,text} from './pixels.mjs';
import {rows} from './design.mjs';
export const root=fileURLToPath(new URL('../../../../..',import.meta.url)),docs='docs/gunsmith/art/m3-w3';
export const formal=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json'))),incoming=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/incoming/m3-w3/manifest.json')));
export const oldAssets=new Map(formal.assets.map(a=>[a.id.replace(/-v\d+$/,''),a]));
export const newAssets=new Map([...oldAssets,...incoming.assets.map(a=>[a.id.replace(/-v\d+$/,''),a])]);
const cache=new Map();export const picture=a=>{if(!cache.has(a.file))cache.set(a.file,decode(resolve(root,a.file)));return cache.get(a.file);};
const order={stock:0,rearGrip:1,mag:2,barrel:3,receiver:4,handguard:5,top:8};
export function assemble(gun,part,code,newer=true){
 const assets=newer?newAssets:oldAssets,key=`gs-${gun}-receiver-${code}`,a=assets.get(key),nodes=[{key,a,label:'receiver',x:0,y:0}];
 for(const [slot,stem]of [['stock','stock'],['rearGrip','reargrip'],['mag','mag'],['barrel','barrel'],['handguard','handguard'],['top','top']]){
  const at=a.mounts?.[slot];if(!at)continue;
  const k=slot==='mag'&&part?`gs-${part.toLowerCase()}-${code}`:`gs-${gun}-${stem}-factory-${code}`,b=assets.get(k);if(!b)continue;
  nodes.push({key:k,a:b,label:slot,x:at[0]-(b.anchor?.[0]??0),y:at[1]-(b.anchor?.[1]??0)});
 }
 const min=[Math.min(...nodes.map(n=>n.x)),Math.min(...nodes.map(n=>n.y))],max=[Math.max(...nodes.map(n=>n.x+n.a.w)),Math.max(...nodes.map(n=>n.y+n.a.h))];
 const ranked=nodes.toSorted((a,b)=>(a.a.layer==='aboveReceiver'?4.5:order[a.label])-(b.a.layer==='aboveReceiver'?4.5:order[b.label]));
 const image=canvas(max[0]-min[0],max[1]-min[1]);for(const n of ranked)blit(image,picture(n.a),n.x-min[0],n.y-min[1]);
 const barrel=nodes.find(n=>n.label==='barrel'&&n.a.tip),holder=barrel??nodes[0],tip=holder.a.tip?holder.a.tip.map((v,i)=>v+(i===0?holder.x:holder.y)-min[i]):null;
 return {image,nodes,record:{gun,part:part??'factory',code,w:image.w,h:image.h,colors:colors(image),tip,layers:ranked.map(n=>({key:n.key,label:n.label,origin:[n.x-min[0],n.y-min[1]]}))}};
}
function grid(c,x,y,size){const [cols,rows]=size;rect(c,'#263940',x,y,cols*72+1,rows*52+1);rect(c,'#101c22',x+1,y+1,cols*72-1,rows*52-1);for(let a=1;a<cols;a++)rect(c,'#263940',x+a*72,y,1,rows*52);for(let a=1;a<rows;a++)rect(c,'#263940',x,y+a*52,cols*72,1);}
function panel(c,x,y,row,variant,code,newer){const {image}=assemble(row.gun,variant,code,newer),s=code==='i'?2:1;grid(c,x,y,row.size);blit(c,image,x+8,y+8,s);}
export function previews(){
 mkdirSync(resolve(root,docs+'/preview'),{recursive:true});const assemblies=[],previews=[];
 rows.forEach((row,i)=>{
  const c=canvas(980,48+row.variants.length*406);rect(c,'#101c22',0,0,c.w,c.h);text(c,`M3 W3 / ${row.label}`,18,14,'#bdcfca',2);text(c,'ANCHOR ASSEMBLIES / NOT GAME SCREENSHOTS / BEFORE LEFT - AFTER RIGHT',18,33);
  for(const [j,variant]of row.variants.entries()){
   const y=56+j*406;text(c,`${variant??'FACTORY'} / ${row.size[0]}X${row.size[1]} CELLS / I 2X`,20,y,'#cb9362',2);text(c,'BEFORE',20,y+22);text(c,'AFTER',510,y+22);
   panel(c,20,y+34,row,variant,'i',false);panel(c,510,y+34,row,variant,'i',true);
   text(c,'W 1X',20,y+203,'#cb9362',2);panel(c,20,y+223,row,variant,'w',false);panel(c,510,y+223,row,variant,'w',true);
   for(const code of ['i','w']){const b=assemble(row.gun,variant,code,false),a=assemble(row.gun,variant,code,true);assemblies.push({...a.record,row:i+1,target:row.target,lip:row.lip,size:row.size,before:b.record});}
  }
  const file=`preview/${String(i+1).padStart(2,'0')}-${row.gun}-${row.variants.filter(Boolean).join('-').toLowerCase()||'factory'}.png`;save(resolve(root,docs,file),c);previews.push({row:i+1,label:row.label,file});
 });
 const groups=[...new Set(rows.map(r=>r.gun))],sheet=canvas(1280,56+groups.length*184);rect(sheet,'#101c22',0,0,sheet.w,sheet.h);text(sheet,'M3 W3 / MAG LENGTHS',18,14,'#bdcfca',3);text(sheet,'NEW I 2X / W 1X / SAME GUN - SAME RECEIVER ORIGIN / NOT GAME SCREENSHOTS',18,39);
 groups.forEach((gun,j)=>{const list=rows.filter(r=>r.gun===gun).flatMap(row=>row.variants.map(part=>({row,part}))),y=66+j*184;text(sheet,gun,16,y,'#cb9362',2);
  list.forEach(({row,part},k)=>{const x=150+k*366;text(sheet,part??'FACTORY',x,y,'#bdcfca',2);text(sheet,'I 2X',x,y+20);blit(sheet,assemble(gun,part,'i',true).image,x+8,y+32,2);text(sheet,'W 1X',x,y+99);const {image}=assemble(gun,part,'w',true);blit(sheet,image,x+8,y+114);});
 });
 save(resolve(root,docs+'/preview/magazine-overview.png'),sheet);
 // Detached parts on three backgrounds and in grayscale expose outlines and color collisions.
 for(const gray of [false,true]){const sheet=canvas(1240,40+19*96);rect(sheet,'#101c22',0,0,sheet.w,sheet.h);text(sheet,`M3 W3 PARTS / I 2X - W 1X / ${gray?'GRAYSCALE':'COLOR'}`,12,12,'#bdcfca',2);
  for(let j=0;j<19;j++){const i=incoming.assets[j*2],w=incoming.assets[j*2+1],y=42+j*96;text(sheet,i.id.replace('gs-','').replace('-i-v2',''),12,y);for(const [k,bg]of ['#101c22','#4b4842','#c9c0ac'].entries()){const x=12+k*410;rect(sheet,bg,x,y+12,400,76);blit(sheet,picture(i),x+5,y+20,2,gray);blit(sheet,picture(w),x+210,y+20,1,gray);}}
  save(resolve(root,docs+`/preview/contact-${gray?'gray':'color'}.png`),sheet);
 }
 writeFileSync(resolve(root,docs+'/assembly-records.json'),JSON.stringify({schema:1,batch:'M3-W3',method:'Manifest anchor-only compositor, I 2x / W 1x; no manual part placement; render previews are not game screenshots',previews,assemblies},null,2)+'\n');
 console.log(JSON.stringify({rows:previews.length,configurations:assemblies.length/2,layouts:assemblies.length}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))previews();
