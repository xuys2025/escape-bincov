import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root,docs,manifest,baseline,assets,picture,configurations,assemble,scaled } from './assemble.mjs';
import { canvas,rect,blit,decode,save,text,colors } from './pixels.mjs';
export const newGuns=['mb1911','umpb45','pb90','svdb','mb14','mb700','augb','rpkb'];
export function fullPreviews(){
 const path=resolve(root,docs+'/preview'),records=[],bare=[];
 const overview=canvas(1100,900);rect(overview,'#101c22',0,0,overview.w,overview.h);text(overview,'M3 W2 / EIGHT GUNS AND FORTY PARTS',16,14,'#bdcfca',2);text(overview,'ANCHOR ASSEMBLIES / NOT GAME SCREENSHOTS / H 3X - I 1X',16,36);
 for(const [index,[gun,configs]]of Object.entries(configurations).entries()){
  const sheet=canvas(1120,55+Object.keys(configs).length*124);rect(sheet,'#101c22',0,0,sheet.w,sheet.h);text(sheet,gun+' / ANCHOR ASSEMBLIES',16,13,'#bdcfca',2);text(sheet,'NOT GAME SCREENSHOTS',16,34);
  for(const [row,name]of Object.keys(configs).entries()){
   const y=63+row*124;text(sheet,name,16,y,'#cb9362',2);
   for(const code of ['h','i','w']){const {record,image}=assemble(gun,name,code);records.push(record);for(const s of code==='w'?[1,2]:[1,3])save(resolve(path,`${gun}-${name}-${code}-${s}x.png`),scaled(image,s));const x=code==='h'?18:code==='i'?230:610,s=code==='h'?3:code==='i'?2:1;text(sheet,`${code} ${s}X`,x,y+20);blit(sheet,image,x,y+34,s);}
   const held=assemble(gun,name,'h'),body=decode(resolve(root,'assets/coast/v1/coast-player-body-e-f0-v1.png')),person=canvas(112,72);blit(person,body,16,4);blit(person,held.image,32+held.record.forward-held.record.grip[0],Math.round(30-held.record.bore));for(const s of [1,3])save(resolve(path,`${gun}-${name}-body-${s}x.png`),scaled(person,s));
  }
  save(resolve(path,`${gun}-wave2-configurations.png`),sheet);
  if(newGuns.includes(gun)){
   const b=assemble(gun,'factory','h',false);bare.push(b.record);for(const s of [1,2])save(resolve(path,`${gun}-factory-ground-hud-${s}x.png`),scaled(b.image,s));
   const index=newGuns.indexOf(gun),x=16+(index%2)*548,y=68+Math.floor(index/2)*202;text(overview,gun,x,y,'#cb9362',2);
   ['factory',...Object.keys(configs).filter(n=>n!=='factory').slice(0,2)].forEach((name,j)=>{const h=assemble(gun,name,'h').image,i=assemble(gun,name,'i').image;text(overview,name,x,y+21+j*55);blit(overview,h,x+2,y+31+j*55,3);blit(overview,i,x+172,y+28+j*55);});
  }
 }
 for(const gun of ['pistol','shotgun','carbine']){const a=assets.get(`gs-${gun}-bare-h`),image=picture(`gs-${gun}-bare-h`);bare.push({gun,code:'h',configuration:'factory',items:[],w:a.w,h:a.h,tip:assets.get(`gs-${gun}-receiver-h`).tip??[31,3.5],layers:[{key:`gs-${gun}-bare-h`,label:'bare',origin:[0,0]}],colors:colors(image)});for(const s of [1,2])save(resolve(path,`${gun}-factory-ground-hud-${s}x.png`),scaled(image,s));}
 save(resolve(path,'wave2-overview.png'),overview);
 // Compact sheets per output keep source art 1x/3x on all three backgrounds and in grayscale.
 for(const [group,list]of [['guns',manifest.assets.filter(a=>a.gun)],['parts',manifest.assets.filter(a=>a.role==='part'||a.role==='icon'&&!a.gun)]])for(const code of ['h','i','w','q']){
  const selected=list.filter(a=>code==='q'?a.output.startsWith('icon'):a.output==={h:'held',i:'inventory',w:'bench'}[code]);
  for(let page=0;page<Math.ceil(selected.length/14);page++){const part=selected.slice(page*14,page*14+14),cw=Math.max(...part.map(a=>a.w))*4+28,ch=Math.max(...part.map(a=>a.h))*3+39;
   for(const gray of [false,true]){const c=canvas(cw*3+16,ch*part.length+32);rect(c,'#101c22',0,0,c.w,c.h);text(c,`${group} ${code} / 1X AND 3X / ${gray?'GRAY':'COLOR'}`,8,10);part.forEach((a,j)=>{const y=30+j*ch;text(c,a.id.replace('gs-','').replace('-v1',''),12,y+2);for(const [col,bg]of ['#101c22','#4b4842','#c9c0ac'].entries()){const x=8+col*cw;rect(c,bg,x,y+14,cw-4,ch-18);blit(c,picture(a.id.replace('-v1','')),x+6,y+27,1,gray);blit(c,picture(a.id.replace('-v1','')),x+18+a.w,y+27,3,gray);}});save(resolve(path,`contact-full-${group}-${code}-${page+1}-${gray?'gray':'color'}.png`),c);}
  }
 }
 writeFileSync(resolve(root,docs+'/assembly-records.json'),JSON.stringify({source:'M3-W2 complete delivery, unchanged approved P0 and unchanged M2/W1 formal images',method:'Saved manifest anchors only; native receiver front-hand glove follows d3eb43f implementation',virtual:baseline.virtual??[],configurations,assemblies:records,bareFactories:bare},null,2)+'\n');
 console.log(JSON.stringify({configurations:records.length/3,assemblies:records.length,bareFactories:bare.length,sizes:records.map(r=>`${r.gun}/${r.configuration}/${r.code} ${r.w}x${r.h}`)}));
}
