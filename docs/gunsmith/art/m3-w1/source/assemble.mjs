// Preview compositor: saved anchors only. It deliberately does not import game code.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { canvas,rect,blit,save,decode,colors,text } from './pixels.mjs';
export const root=fileURLToPath(new URL('../../../../..',import.meta.url));
export const docs='docs/gunsmith/art/m3-w1',incoming='assets/gunsmith/incoming/m3-w1';
export const manifest=JSON.parse(readFileSync(resolve(root,incoming+'/manifest.json')));
export const m2=JSON.parse(readFileSync(resolve(root,'assets/gunsmith/manifest.json')));
export const assets=new Map([...m2.assets,...manifest.assets].map(a=>[a.id.replace(/-v\d+$/,''),a]));
const decoded=new Map();export function picture(key){if(!decoded.has(key))decoded.set(key,decode(resolve(root,assets.get(key).file)));return decoded.get(key);}
export const configurations={factory:[],light:[['S03','stock'],['H03','handguard'],['P04','grip'],['B07','barrel'],['M05','muzzle']],steady:[['S04','stock'],['H04','handguard',[['F01','under'],['T01','side']]],['P03','grip'],['A08','base',[['O08','top']]],['M07','muzzle'],['G08','mag']]};
const mountOf={grip:'rearGrip',base:'mount',side:'side1'};
const order={stock:0,rearGrip:1,mag:2,barrel:3,receiver:4,handguard:5,under:6,mount:7,top:8,muzzle:9,side1:10,side2:10,'glove-rear':11,'glove-front':12,'glove-foregrip':12};
export function assemble(configuration,code,gloves=true) {
  const parts=configurations[configuration],receiver=assets.get(`gs-akb74-receiver-${code}`);
  const nodes=[{key:`gs-akb74-receiver-${code}`,label:'receiver',a:receiver,x:0,y:0,parent:null}],root=nodes[0],placed=new Map();
  const attach=(key,label,parent,at)=>{if(!at||!assets.has(key))throw Error('missing mount/image '+key);
    const a=assets.get(key),anchor=a.anchor??[0,0],n={key,label,a,x:parent.x+at[0]-anchor[0],y:parent.y+at[1]-anchor[1],parent};nodes.push(n);return n;};
  for(const [mount,stem] of [['stock','stock'],['rearGrip','reargrip'],['mag','mag'],['barrel','barrel'],['handguard','handguard']]) {
    const part=parts.find(p=>(mountOf[p[1]]??p[1])===mount),custom=part&&`gs-${part[0].toLowerCase()}-${code}`;
    const key=assets.has(custom)?custom:`gs-akb74-${stem}-factory-${code}`;
    const n=attach(key,mount,root,receiver.mounts[mount]);if(part)placed.set(part,n);
  }
  const walk=(list,parent)=>{let side=0;for(const p of list){let n=placed.get(p);if(!n){let label=mountOf[p[1]]??p[1];if(label==='side1')label=`side${++side}`;
      const holder=label==='muzzle'?nodes.find(n=>n.parent===parent&&n.label==='barrel')??parent:parent;
      n=attach(`gs-${p[0].toLowerCase()}-${code}`,label,holder,holder.a.mounts?.[label]);}
    if(p[2])walk(p[2],n);}};
  walk(parts,root);
  let hand;
  if(code==='h') {
    const addGlove=(which,at)=>{if(gloves)attach(`gs-glove-${which}-h`,`glove-${which}`,root,at);};
    addGlove('rear',receiver.grip);
    const fore=nodes.find(n=>n.label==='under'&&n.a.hand),guard=nodes.find(n=>n.label==='handguard');
    const holder=fore??guard;hand=[holder.x+holder.a.hand[0],holder.y+holder.a.hand[1]];addGlove(fore?'foregrip':'front',hand);
  }
  const min=[Math.min(...nodes.map(n=>n.x)),Math.min(...nodes.map(n=>n.y))],max=[Math.max(...nodes.map(n=>n.x+n.a.w)),Math.max(...nodes.map(n=>n.y+n.a.h))];
  const shift=p=>[p[0]-min[0],p[1]-min[1]],tipNode=nodes.find(n=>n.label==='muzzle')??nodes.find(n=>n.label==='barrel');
  const layers=nodes.toSorted((a,b)=>order[a.label]-order[b.label]).map(n=>({key:n.key,label:n.label,origin:[n.x-min[0],n.y-min[1]]}));
  const image=canvas(max[0]-min[0],max[1]-min[1]);for(const l of layers)blit(image,picture(l.key),...l.origin);
  const device=nodes.find(n=>n.a.beam);
  const record={gun:'akb74',code,configuration,items:parts.map(p=>p[0]),w:image.w,h:image.h,tip:shift([tipNode.x+tipNode.a.tip[0],tipNode.y+tipNode.a.tip[1]]),layers,
    ...(code==='h'?{grip:shift(receiver.grip),bore:receiver.bore-min[1],forward:0,hand:shift(hand)}:{}),
    ...(device?{beam:shift([device.x+device.a.beam[0],device.y+device.a.beam[1]])}:{}),colors:colors(image)};
  return {record,image,nodes};
}
export function previews() {
  const path=resolve(root,docs+'/preview');mkdirSync(path,{recursive:true});const records=[];
  const overview=canvas(720,510);rect(overview,'#101c22',0,0,720,510);text(overview,'AK-74 P0 / FACTORY - LIGHT - STEADY',18,14,'#bdcfca',2);
  text(overview,'ASSEMBLY PREVIEWS / NOT GAME SCREENSHOTS',18,32);
  for(const [i,name] of Object.keys(configurations).entries()) {
    const y=62+i*144;text(overview,name,18,y,'#cb9362',2);
    for(const code of ['h','i','w']) {
      const {record,image}=assemble(name,code);records.push(record);
      const scales=code==='w'?[1,2]:[1,3];for(const s of scales){const c=canvas(image.w*s,image.h*s);blit(c,image,0,0,s);save(resolve(path,`akb74-${name}-${code}-${s}x.png`),c);}
      const x=code==='h'?18:code==='i'?190:460,scale=code==='h'?3:code==='i'?2:1;
      text(overview,code==='h'?'H 3X':code==='i'?'I 2X':'W 1X',x,y+22);blit(overview,image,x,y+40,scale);
    }
    const held=assemble(name,'h'),body=decode(resolve(root,'assets/coast/v1/coast-player-body-e-f0-v1.png'));
    const player=canvas(80,Math.max(64,body.h+8));blit(player,body,16,4);
    blit(player,held.image,16+16-held.record.grip[0],4+26-held.record.bore);
    for(const s of [1,3]){const c=canvas(player.w*s,player.h*s);blit(c,player,0,0,s);save(resolve(path,`akb74-${name}-body-${s}x.png`),c);}
  }
  save(resolve(path,'akb74-configurations.png'),overview);
  const bare=assemble('factory','h',false);for(const s of [1,2]){const c=canvas(bare.image.w*s,bare.image.h*s);blit(c,bare.image,0,0,s);save(resolve(path,`akb74-factory-ground-hud-${s}x.png`),c);}
  for(const code of ['h','i','w','q']) {
    const list=manifest.assets.filter(a=>code==='q'?a.output.startsWith('icon'):a.id.endsWith(`-${code}-v1`));
    const cellW=Math.max(...list.map(a=>a.w))*4+24,cellH=Math.max(...list.map(a=>a.h))*3+38;
    for(const gray of [false,true]) {
      const c=canvas(cellW*3+16,cellH*list.length+36);rect(c,'#101c22',0,0,c.w,c.h);
      text(c,`P0 ${code} / 1X AND 3X / ${gray?'GRAY':'COLOR'}`,8,10);
      list.forEach((a,j)=>{text(c,a.id.replace('gs-','').replace('-v1',''),13,34+j*cellH);for(const [col,bg] of ['#101c22','#4b4842','#c9c0ac'].entries()) {
        const x=8+col*cellW,y=30+j*cellH;rect(c,bg,x,y+14,cellW-4,cellH-18);
        const p=picture(a.id.replace(/-v1$/,''));blit(c,p,x+6,y+28,1,gray);blit(c,p,x+18+a.w,y+28,3,gray);
      }});save(resolve(path,`contact-${code}-${gray?'gray':'color'}.png`),c);
    }
  }
  writeFileSync(resolve(root,docs+'/assembly-records.json'),JSON.stringify({source:'Original M3-W1 P0 AK-74 artwork; M2 O08/F01/T01 and gloves referenced unchanged',method:'Saved manifest anchors only; no manual component placement',virtual:[],configurations,assemblies:records,bareFactory:bare.record},null,2)+'\n');
  console.log(JSON.stringify(records.map(r=>({configuration:r.configuration,code:r.code,size:[r.w,r.h],colors:r.colors,tip:r.tip}))));
}
if(process.argv[1]===fileURLToPath(import.meta.url))previews();
