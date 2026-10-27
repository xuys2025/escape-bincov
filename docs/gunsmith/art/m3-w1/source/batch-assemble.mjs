// Complete wave-one preview compositor. Node built-ins and saved art metadata only.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvas,rect,poly,blit,crop,decode,save,colors,text } from './pixels.mjs';
export const root=fileURLToPath(new URL('../../../../..',import.meta.url)),docs='docs/gunsmith/art/m3-w1',incoming='assets/gunsmith/incoming/m3-w1';
export const manifest=JSON.parse(readFileSync(resolve(root,incoming+'/manifest.json'))),m2=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json')));
const legacy=JSON.parse(readFileSync(resolve(root,docs+'/source/legacy-inventory.json'))),cache=new Map();
export const assets=new Map([...m2.assets,...manifest.assets].map(a=>[a.id.replace(/-v\d+$/,''),a]));
for(const a of manifest.virtual)assets.set(a.key,a);
function procedural(id){const s=legacy.images[id],c=canvas(s.w,s.h);for(const o of s.ops)rect(c,...o.slice(1));return c;}
export function picture(key){if(cache.has(key))return cache.get(key);const a=assets.get(key);if(!a)throw Error('missing '+key);let c;
 if(a.file)c=decode(resolve(root,a.file));else{const src=procedural(a.sourceKey);c=canvas(a.w,a.h);if(a.rect){const part=crop(src,...a.rect);blit(c,part,...(a.wholeCanvasLayer?[a.rect[0],a.rect[1]]:[0,0]));}else{blit(c,src,0,0);for(const r of a.clearRects??[])rect(c,[0,0,0,0],...r);for(const r of a.fillRects??[])rect(c,...r);}}
 cache.set(key,c);return c;
}
export const configurations={
 pb226:{factory:[],light:[['P07','grip'],['M02','muzzle'],['T04','pistolSide']],precision:[['B01','barrel'],['M03','muzzle'],['A02','base',[['O01','micro']]],['T08','pistolSide']]},
 mpb5:{factory:[],close:[['S05','stock'],['B03','barrel'],['H06','handguard',[['T01','side']]],['M02','muzzle']],steady:[['H07','handguard',[['F01','under'],['T05','side']]],['A04','base',[['O03','top']]],['G03','mag'],['M03','muzzle']]},
 vb9:{factory:[],close:[['M02','muzzle'],['F03','under'],['T05','side']],range:[['O03','top'],['M03','muzzle'],['F01','under'],['T01','side']]},
 mb870:{factory:[],short:[['B05','barrel'],['S07','stock'],['P06','grip'],['M10','muzzle']],extended:[['H08','handguard',[['F01','under'],['T05','side']]],['G06','mag'],['A06','base',[['O03','top']]]]},
 mb1014:{factory:[],control:[['S08','stock'],['P06','grip'],['H09','handguard',[['F01','under']]],['M10','muzzle']],extended:[['G07','mag'],['B06','barrel'],['O03','top'],['H09','handguard',[['T01','side']]]]},
 akb74:{factory:[],light:[['S03','stock'],['H03','handguard'],['P04','grip'],['B07','barrel'],['M05','muzzle']],steady:[['S04','stock'],['H04','handguard',[['F01','under'],['T01','side']]],['P03','grip'],['A08','base',[['O08','top']]],['M07','muzzle'],['G08','mag']]},
 akb103:{factory:[],compact:[['S03','stock'],['B07','barrel'],['H03','handguard'],['M05','muzzle']],heavy:[['S04','stock'],['H04','handguard',[['F03','under'],['T05','side']]],['A08','base',[['O03','top']]],['G09','mag'],['M06','muzzle']]},
 pistol:{factory:[],custom:[['A01','base',[['O01','micro']]],['M01','muzzle']]},
 shotgun:{factory:[],custom:[['A05','base',[['O03','top']]],['M11','muzzle']]},
 carbine:{factory:[],custom:[['B09','barrel'],['M07','muzzle']]},
 gb17:{factory:[],custom:[['P07','grip'],['M02','muzzle'],['T04','pistolSide']]},
 mb4a1:{factory:[],custom:[['H02','handguard',[['F01','under'],['T01','side'],['T05','side']]],['M07','muzzle']]}
};
export const newGuns=['pb226','mpb5','vb9','mb870','mb1014','akb74','akb103'];
const mountOf={base:'mount',grip:'rearGrip',side:'side1'};
const order={stock:0,rearGrip:1,mag:2,barrel:3,receiver:4,handguard:5,under:6,bipod:6,mount:7,top:8,muzzle:9,side1:10,side2:10,pistolSide:10,'glove-rear':11,'glove-front':12,'glove-foregrip':12};
const partKey=(id,code,gun)=>{const shared=`gs-${id.toLowerCase()}-${code}`,own=shared+'-'+gun;return assets.has(own)?own:assets.has(shared)?shared:null;};
export function assemble(gun,configuration,code,gloves=true){
 const rootKey=`gs-${gun}-receiver-${code}`,receiver=assets.get(rootKey);if(!receiver)throw Error('no receiver '+rootKey);
 const parts=configurations[gun][configuration],nodes=[{key:rootKey,label:'receiver',a:receiver,x:0,y:0,parent:null}],rootNode=nodes[0],placed=new Map(),done=new Set();
 const attach=(key,label,parent,at)=>{if(!at||!assets.has(key))throw Error(`missing ${key} mount ${label} on ${parent.key}`);const a=assets.get(key),anchor=a.anchor??[0,0],n={key,label,a,x:parent.x+at[0]-anchor[0],y:parent.y+at[1]-anchor[1],parent};nodes.push(n);return n;};
 for(const [mount,stem]of [['stock','stock'],['rearGrip','reargrip'],['mag','mag'],['barrel','barrel'],['handguard','handguard'],['top','top']]){
  if(!receiver.mounts?.[mount])continue;const p=parts.find(p=>(mountOf[p[1]]??p[1])===mount),custom=p&&partKey(p[0],code,gun),factory=`gs-${gun}-${stem}-factory-${code}`;
  if(custom){placed.set(p,attach(custom,mount,rootNode,receiver.mounts[mount]));done.add(p);}else {if(assets.has(factory))attach(factory,mount,rootNode,receiver.mounts[mount]);if(p)done.add(p);}
 }
 const walk=(list,parent)=>{let side=0;for(const p of list){let n=placed.get(p);if(!done.has(p)){
  let mount=mountOf[p[1]]??p[1];if(mount==='side1')mount=`side${++side}`;
  const key=partKey(p[0],code,gun),holder=mount==='muzzle'?nodes.find(n=>n.parent===parent&&n.label==='barrel'&&n.a.mounts?.muzzle)??parent:parent;
  if(key)n=attach(key,mount==='micro'?'top':mount,holder,holder.a.mounts?.[mount]);
 }if(n&&p[2])walk(p[2],n);}};
 walk(parts,rootNode);let hand;
 if(code==='h'){const glove=(which,at)=>{if(gloves)attach(`gs-glove-${which}-h`,`glove-${which}`,rootNode,at);};if(!receiver.wholeCanvasLayer&&receiver.grip)glove('rear',receiver.grip);
  const fore=nodes.find(n=>n.label==='under'&&n.a.hand),guard=nodes.find(n=>n.label==='handguard'&&n.a.hand);
  if(fore){hand=[fore.x+fore.a.hand[0],fore.y+fore.a.hand[1]];glove('foregrip',hand);}else if(guard){hand=[guard.x+guard.a.hand[0],guard.y+guard.a.hand[1]];if(!guard.a.embeddedFrontGlove)glove('front',hand);}else hand=receiver.hand;
 }
 const min=[Math.min(...nodes.map(n=>n.x)),Math.min(...nodes.map(n=>n.y))],max=[Math.max(...nodes.map(n=>n.x+n.a.w)),Math.max(...nodes.map(n=>n.y+n.a.h))],shift=p=>[p[0]-min[0],p[1]-min[1]];
 const rank=n=>n.a.layer==='aboveReceiver'?4.5:order[n.label];const layers=nodes.toSorted((a,b)=>rank(a)-rank(b)).map(n=>({key:n.key,label:n.label,origin:[n.x-min[0],n.y-min[1]]}));
 const image=canvas(max[0]-min[0],max[1]-min[1]);for(const l of layers)blit(image,picture(l.key),...l.origin);
 const t=nodes.find(n=>n.label==='muzzle'&&n.a.tip)??nodes.find(n=>n.label==='barrel'&&n.a.tip)??rootNode,device=nodes.find(n=>n.a.beam);
 const record={gun,code,configuration,items:parts.map(p=>p[0]),w:image.w,h:image.h,tip:t.a.tip?shift([t.x+t.a.tip[0],t.y+t.a.tip[1]]):null,layers,...(code==='h'?{grip:shift(receiver.grip),bore:receiver.bore-min[1],forward:receiver.forward??0,...(hand?{hand:shift(hand)}:{})}:{}),...(device?{beam:shift([device.x+device.a.beam[0],device.y+device.a.beam[1]])}:{}),colors:colors(image)};
 return {record,image,nodes};
}
function scaled(image,s){const c=canvas(image.w*s,image.h*s);blit(c,image,0,0,s);return c;}
export function previews(){const dir=resolve(root,docs+'/preview');mkdirSync(dir,{recursive:true});const records=[],bare=[];
 const overview=canvas(1024,1120);rect(overview,'#101c22',0,0,overview.w,overview.h);text(overview,'M3 WAVE ONE / FACTORY AND TWO BUILD DIRECTIONS',18,16,'#bdcfca',2);text(overview,'ANCHOR ASSEMBLIES / NOT GAME SCREENSHOTS / H 2X AND I 1X',18,38);
 for(const [index,[gun,configs]]of Object.entries(configurations).entries()){
  const sheet=canvas(1000,62+Object.keys(configs).length*148);rect(sheet,'#101c22',0,0,sheet.w,sheet.h);text(sheet,gun+' / ANCHOR ASSEMBLIES',18,16,'#bdcfca',2);text(sheet,'NOT GAME SCREENSHOTS',18,36);
  for(const [row,name]of Object.keys(configs).entries()){
   const y=66+row*148;text(sheet,name,18,y,'#cb9362',2);
   for(const code of ['h','i','w']){const {record,image}=assemble(gun,name,code);records.push(record);for(const s of code==='w'?[1,2]:[1,3])save(resolve(dir,`${gun}-${name}-${code}-${s}x.png`),scaled(image,s));
    const x=code==='h'?18:code==='i'?225:560,s=code==='h'?3:code==='i'?2:1;text(sheet,`${code} ${s}X`,x,y+24);blit(sheet,image,x,y+42,s);
   }
   const held=assemble(gun,name,'h'),body=decode(resolve(root,'assets/coast/v1/coast-player-body-e-f0-v1.png')),person=canvas(gun==='akb74'?80:96,Math.max(64,body.h+8));blit(person,body,16,4);blit(person,held.image,32+held.record.forward-held.record.grip[0],30-held.record.bore);
   for(const s of [1,3])save(resolve(dir,`${gun}-${name}-body-${s}x.png`),scaled(person,s));
  }
  // Keep the already-delivered AK-74 P0 overview as historical evidence; add a full-batch sheet under a distinct name.
  save(resolve(dir,`${gun}-wave1-configurations.png`),sheet);
  const bareFactory=assemble(gun,'factory','h',false);bare.push(bareFactory.record);
  if(newGuns.includes(gun))for(const s of [1,2])save(resolve(dir,`${gun}-factory-ground-hud-${s}x.png`),scaled(bareFactory.image,s));
  const col=index%2,row=Math.floor(index/2),x=18+col*505,y=68+row*174;text(overview,gun,x,y,'#cb9362',2);
  Object.keys(configs).forEach((name,j)=>{const h=assemble(gun,name,'h').image,i=assemble(gun,name,'i').image;text(overview,name,x,y+20+j*45);blit(overview,h,x+2,y+30+j*45,2);blit(overview,i,x+130,y+28+j*45,1);});
 }
 save(resolve(dir,'wave1-overview.png'),overview);
 // Separate per-gun contact sheets keep native components readable instead of one extremely tall batch image.
 const compatibility={pb226:['A02','B01','M01','M02','M03','P07','T04','T08'],mpb5:['A04','B03','H06','H07','S05','G03','M01','M02','M03','O03','T01','T05','F01'],vb9:['M01','M02','M03','O03','F01','F03','T01','T05'],mb870:['A06','B05','H08','S07','P06','G06','M10','F01','T05','O03'],mb1014:['B06','H09','S08','P06','G07','M10','F01','T01','O03'],akb74:['A08','B07','H03','H04','S03','S04','P03','P04','G08','M05','M07','O08','F01','T01'],akb103:['A08','B07','H03','H04','S03','S04','P03','P04','G09','M05','M07','O03','F03','T05'],pistol:['A01','M01','O01'],shotgun:['A05','M11','O03'],carbine:['B09','M05','M07'],gb17:['P07','M01','M02','T04','T08'],mb4a1:['H02','M05','M07','F01','T01','T05']};
 for(const gun of Object.keys(configurations))for(const code of ['h','i','w','q']){
  const list=[...assets.entries()].filter(([key,a])=>(a.gun===gun||compatibility[gun].includes(a.item))&&(code==='q'?a.output?.startsWith('icon'):a.output==={h:'held',i:'inventory',w:'bench'}[code])&&(!a.variantFor||a.variantFor===gun));
  if(!list.length)continue;const cellW=Math.max(...list.map(([k,a])=>a.w))*4+24,cellH=Math.max(...list.map(([k,a])=>a.h))*3+42;
  for(const gray of [false,true]){const c=canvas(cellW*3+16,cellH*list.length+34);rect(c,'#101c22',0,0,c.w,c.h);text(c,`${gun} ${code} / 1X AND 3X / ${gray?'GRAY':'COLOR'}`,8,10);
   list.forEach(([key,a],j)=>{const y=30+j*cellH;text(c,key,12,y+3);for(const [col,bg]of ['#101c22','#4b4842','#c9c0ac'].entries()){const x=8+col*cellW;rect(c,bg,x,y+14,cellW-4,cellH-18);blit(c,picture(key),x+6,y+28,1,gray);blit(c,picture(key),x+18+a.w,y+28,3,gray);}});
   save(resolve(dir,`contact-${gun}-${code}-${gray?'gray':'color'}.png`),c);
  }
 }
 writeFileSync(resolve(root,docs+'/assembly-records.json'),JSON.stringify({source:'M3-W1 full delivery, native art and unchanged M2 references',method:'Saved manifest anchors only; no manual component placement',virtual:manifest.virtual,configurations,assemblies:records,bareFactories:bare},null,2)+'\n');
 console.log(JSON.stringify({assemblies:records.length,bareFactories:bare.length,sizes:records.map(r=>`${r.gun}/${r.configuration}/${r.code} ${r.w}x${r.h}`)}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))previews();
