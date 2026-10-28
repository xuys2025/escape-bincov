// Anchor-only preview compositor. No project code imports.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvas,rect,poly,crop,blit,save,decode,colors,text } from './pixels.mjs';
import { fullPreviews } from './full-previews.mjs';
export const root=fileURLToPath(new URL('../../../../..',import.meta.url)),docs='docs/gunsmith/art/m3-w2',incoming='assets/gunsmith/incoming/m3-w2';
export const manifest=JSON.parse(readFileSync(resolve(root,incoming+'/manifest.json'))),baseline=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json')));
export const assets=new Map([...baseline.assets,...manifest.assets].map(a=>[a.id.replace(/-v\d+$/,''),a]));
for(const a of baseline.virtual??[])assets.set(a.key,a);
const cache=new Map();export function picture(key){if(cache.has(key))return cache.get(key);const a=assets.get(key);if(!a)throw Error('missing '+key);let image;
 if(a.file)image=decode(resolve(root,a.file));else{const old=JSON.parse(readFileSync(resolve(root,'docs/gunsmith/art/m3-w1/source/legacy-inventory.json'))).images[a.sourceKey],src=canvas(old.w,old.h);for(const o of old.ops){if(o[0]==='r')rect(src,...o.slice(1));else poly(src,...o.slice(1));}image=canvas(a.w,a.h);if(a.rect)blit(image,crop(src,...a.rect),...(a.wholeCanvasLayer?[a.rect[0],a.rect[1]]:[0,0]));else{blit(image,src,0,0);for(const r of a.clearRects??[])rect(image,[0,0,0,0],...r);for(const r of a.fillRects??[])rect(image,...r);}}
 cache.set(key,image);return image;
}
export const configurations={
 augb:{factory:[],close:[['O05','top'],['F04','under'],['T02','side']],steady:[['O10','top'],['F07','under'],['T10','side'],['M06','muzzle']],reuse:[['O03','top'],['F01','under'],['G10','mag'],['M06','muzzle']]},
 mb4a1:{factory:[],close:[['O05','top'],['H02','handguard',[['F04','under'],['T02','side']]]],steady:[['O10','top'],['H02','handguard',[['F07','under'],['T10','side']]]]}
};
if(manifest.stage==='P0+P1')Object.assign(configurations,{
 mb1911:{factory:[],light:[['P08','grip'],['G02','mag'],['T04','pistolSide']],silent:[['B02','barrel'],['M04','muzzle'],['A03','base',[['O02','micro']]],['T08','pistolSide']]},
 umpb45:{factory:[],close:[['S06','stock'],['P05','grip'],['F06','under'],['T07','side']],steady:[['B04','barrel'],['M04','muzzle'],['G04','mag'],['O05','top'],['F05','under'],['T09','side']]},
 pb90:{factory:[],light:[['G05','mag'],['O12','top'],['T02','side']],silent:[['M12','muzzle'],['O04','top'],['T06','side']]},
 svdb:{factory:[],steady:[['O09','top'],['F08','bipod'],['M09','muzzle']],silent:[['O07','top'],['M08','muzzle']]},
 mb14:{factory:[],precision:[['S09','stock'],['O10','top'],['F08','bipod'],['M09','muzzle']],extended:[['G11','mag'],['O06','top'],['M08','muzzle']]},
 mb700:{factory:[],range:[['O11','top'],['F08','bipod'],['M08','muzzle']],light:[['B10','barrel'],['S10','stock'],['O12','top']]},
 rpkb:{factory:[],heavy:[['H10','handguard',[['F02','under'],['T06','side'],['T03','side']]],['F08','bipod'],['A08','base',[['O07','top']]],['S04','stock'],['G09','mag']],light:[['G12','mag'],['P04','grip'],['A08','base',[['O04','top']]],['M05','muzzle']]},
 pistol:{factory:[],custom:[['A01','base',[['O02','micro']]]]},shotgun:{factory:[],custom:[['A05','base',[['O05','top']]]]},
 carbine:{factory:[],custom:[['A07','base',[['O09','top']]],['H05','handguard',[['F07','under'],['T10','side']]]]},
 akb74:{factory:[],custom:[['A08','base',[['O06','top']]],['H04','handguard',[['F05','under'],['T09','side']]]]},
 vb9:{factory:[],custom:[['O04','top'],['F06','under'],['T02','side']]}
});
if(manifest.stage==='P0+P1')configurations.mb4a1.custom=[['O10','top'],['H02','handguard',[['F02','under'],['T03','side'],['T07','side']]]];
const mountOf={base:'mount',grip:'rearGrip',side:'side1'};
const order={stock:0,rearGrip:1,mag:2,barrel:3,receiver:4,handguard:5,under:6,bipod:6,mount:7,top:8,muzzle:9,side1:10,side2:10,pistolSide:10,'glove-rear':11,'glove-front':12,'glove-foregrip':12};
const partKey=(id,code,gun)=>{const s=`gs-${id.toLowerCase()}-${code}`;return assets.has(s+'-'+gun)?s+'-'+gun:assets.has(s)?s:null;};
export function assemble(gun,configuration,code,gloves=true){
 const parts=Array.isArray(configuration)?configuration:configurations[gun][configuration];
 const key=`gs-${gun}-receiver-${code}`,a=assets.get(key);if(!a)throw Error('no receiver '+key);
 const rootNode={key,label:'receiver',a,x:0,y:0,parent:null},nodes=[rootNode],placed=new Map(),done=new Set();
 const attach=(key,label,parent,at)=>{if(!at||!assets.has(key))throw Error(`missing ${key} mount ${label} on ${parent.key}`);const a=assets.get(key),n={key,label,a,x:parent.x+at[0]-(a.anchor?.[0]??0),y:parent.y+at[1]-(a.anchor?.[1]??0),parent};nodes.push(n);return n;};
 for(const [mount,stem]of [['stock','stock'],['rearGrip','reargrip'],['mag','mag'],['barrel','barrel'],['handguard','handguard'],['top','top']]){
  if(!a.mounts?.[mount])continue;const p=parts.find(p=>(mountOf[p[1]]??p[1])===mount),custom=p&&partKey(p[0],code,gun),factory=`gs-${gun}-${stem}-factory-${code}`;
  if(custom){placed.set(p,attach(custom,mount,rootNode,a.mounts[mount]));done.add(p);}else{if(assets.has(factory))attach(factory,mount,rootNode,a.mounts[mount]);if(p)done.add(p);}
 }
 const walk=(list,parent)=>{let side=0;for(const p of list){let n=placed.get(p);if(!done.has(p)){let mount=mountOf[p[1]]??p[1];if(mount==='side1')mount=`side${++side}`;
  const key=partKey(p[0],code,gun),holder=mount==='muzzle'?nodes.find(n=>n.parent===parent&&n.label==='barrel'&&n.a.mounts?.muzzle)??parent:parent;
  if(key)n=attach(key,mount==='micro'?'top':mount,holder,holder.a.mounts?.[mount]);
 }if(n&&p[2])walk(p[2],n);}};walk(parts,rootNode);
 let hand;if(code==='h'){
  const glove=(which,at)=>{if(gloves)attach(`gs-glove-${which}-h`,`glove-${which}`,rootNode,at);};
  if(!a.wholeCanvasLayer&&a.grip)glove('rear',a.grip);
  const fore=nodes.find(n=>n.label==='under'&&n.a.hand),guard=nodes.find(n=>n.label==='handguard'&&n.a.hand);
  if(fore){hand=[fore.x+fore.a.hand[0],fore.y+fore.a.hand[1]];glove('foregrip',hand);}else if(guard){hand=[guard.x+guard.a.hand[0],guard.y+guard.a.hand[1]];if(!guard.a.embeddedFrontGlove)glove('front',hand);}else{hand=a.hand;if(hand&&!a.wholeCanvasLayer&&!(a.grip&&hand[0]===a.grip[0]&&hand[1]===a.grip[1]))glove('front',hand);}
 }
 const lo=[Math.min(...nodes.map(n=>n.x)),Math.min(...nodes.map(n=>n.y))],hi=[Math.max(...nodes.map(n=>n.x+n.a.w)),Math.max(...nodes.map(n=>n.y+n.a.h))],shift=p=>[p[0]-lo[0],p[1]-lo[1]];
 const rank=n=>n.a.layer==='aboveReceiver'?4.5:order[n.label];
 const layers=nodes.toSorted((a,b)=>rank(a)-rank(b)).map(n=>({key:n.key,label:n.label,origin:[n.x-lo[0],n.y-lo[1]]}));
 const image=canvas(hi[0]-lo[0],hi[1]-lo[1]);for(const l of layers)blit(image,picture(l.key),...l.origin);
 const t=nodes.find(n=>n.label==='muzzle'&&n.a.tip)??nodes.find(n=>n.label==='barrel'&&n.a.tip)??rootNode,device=nodes.find(n=>n.a.beam);
 const record={gun,code,configuration:typeof configuration==='string'?configuration:'fit',items:parts.map(p=>p[0]),w:image.w,h:image.h,tip:shift([t.x+t.a.tip[0],t.y+t.a.tip[1]]),layers,
  ...(code==='h'?{grip:shift(a.grip),bore:a.bore-lo[1],forward:a.forward??0,...(hand?{hand:shift(hand)}:{})}:{}),
  ...(device?{beam:shift([device.x+device.a.beam[0],device.y+device.a.beam[1]])}:{}),colors:colors(image)};
 return {record,image,nodes};
}
export const scaled=(c,s,gray=false)=>{const d=canvas(c.w*s,c.h*s);blit(d,c,0,0,s,gray);return d;};
// The browser's P0 fixture deliberately compares the pre-d3eb43f factory preview with the front glove removed.
// Keep its approved path stable; full-wave records and previews use the new explicit front-glove name.
export const previewStem=(gun,name,code)=>gun==='augb'&&name==='factory'&&code==='h'?'augb-factory-h-front-glove':`${gun}-${name}-${code}`;
export function previews(){
 const dir=resolve(root,docs+'/preview');mkdirSync(dir,{recursive:true});const records=[],bare=[];
 const overview=canvas(1024,830);rect(overview,'#101c22',0,0,overview.w,overview.h);text(overview,'M3 W2 P0 / AUG AND SIX PARTS',18,16,'#bdcfca',2);text(overview,'ANCHOR ASSEMBLIES / NOT GAME SCREENSHOTS',18,38);
 for(const [i,[gun,configs]]of Object.entries(configurations).entries()){
  const sheet=canvas(1000,52+Object.keys(configs).length*112);rect(sheet,'#101c22',0,0,sheet.w,sheet.h);text(sheet,gun+' / ANCHOR ASSEMBLIES',18,14,'#bdcfca',2);text(sheet,'NOT GAME SCREENSHOTS',18,33);
  for(const [j,name]of Object.keys(configs).entries()){
   const y=62+j*112;text(sheet,name,18,y,'#cb9362',2);
   for(const code of ['h','i','w']){const {record,image}=assemble(gun,name,code);records.push(record);for(const s of code==='w'?[1,2]:[1,3])save(resolve(dir,`${gun}-${name}-${code}-${s}x.png`),scaled(image,s));
    const x=code==='h'?18:code==='i'?220:540,s=code==='h'?3:code==='i'?2:1;text(sheet,`${code} ${s}X`,x,y+19);blit(sheet,image,x,y+31,s);
   }
   const held=assemble(gun,name,'h'),person=canvas(96,72),body=decode(resolve(root,'assets/coast/v1/coast-player-body-e-f0-v1.png'));blit(person,body,16,4);blit(person,held.image,32+held.record.forward-held.record.grip[0],Math.round(30-held.record.bore));
   for(const s of [1,3])save(resolve(dir,`${gun}-${name}-body-${s}x.png`),scaled(person,s));
   const oy=70+(i===0?j*92:400+j*92),h=assemble(gun,name,'h').image,inv=assemble(gun,name,'i').image;
   text(overview,gun+' '+name,18,oy,'#cb9362',2);blit(overview,h,20,oy+23,3);blit(overview,inv,220,oy+23,3);
  }
  save(resolve(dir,`${gun}-p0-configurations.png`),sheet);
 }
 const b=assemble('augb','factory','h',false);bare.push(b.record);for(const s of [1,2])save(resolve(dir,`augb-factory-ground-hud-${s}x.png`),scaled(b.image,s));
 save(resolve(dir,'p0-overview.png'),overview);
 for(const code of ['h','i','w','q']){
  const list=manifest.assets.filter(a=>code==='q'?a.output.startsWith('icon'):a.output==={h:'held',i:'inventory',w:'bench'}[code]);
  const cw=Math.max(...list.map(a=>a.w))*4+28,ch=Math.max(...list.map(a=>a.h))*3+40;
  for(const gray of [false,true]){const c=canvas(cw*3+16,ch*list.length+32);rect(c,'#101c22',0,0,c.w,c.h);text(c,`P0 ${code} / 1X AND 3X / ${gray?'GRAY':'COLOR'}`,8,10);
   list.forEach((a,j)=>{const y=30+j*ch;text(c,a.id.replace('gs-','').replace('-v1',''),12,y+2);for(const [col,bg]of ['#101c22','#4b4842','#c9c0ac'].entries()){
    const x=8+col*cw;rect(c,bg,x,y+14,cw-4,ch-18);blit(c,picture(a.id.replace('-v1','')),x+6,y+27,1,gray);blit(c,picture(a.id.replace('-v1','')),x+18+a.w,y+27,3,gray);
   }});save(resolve(dir,`contact-${code}-${gray?'gray':'color'}.png`),c);
  }
 }
 writeFileSync(resolve(root,docs+'/assembly-records.json'),JSON.stringify({source:'M3-W2 P0 native artwork plus unchanged formal M2/W1 images',method:'Saved manifest anchors only; no manual part placement',virtual:[],configurations,assemblies:records,bareFactories:bare},null,2)+'\n');
 console.log(JSON.stringify({assemblies:records.length,bareFactories:bare.length,sizes:records.map(r=>`${r.gun}/${r.configuration}/${r.code} ${r.w}x${r.h}`)}));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(manifest.stage==='P0+P1')fullPreviews();else previews();}
