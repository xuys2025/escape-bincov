import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canvas,decode,dot,rect,poly,blit,text,png,save,colors} from '../../m3-w3/source/pixels.mjs';
import {designs} from './design.mjs';
process.chdir(fileURLToPath(new URL('../../../../../',import.meta.url)));
const dir='docs/gunsmith/art/m4-premium',dest='assets/gunsmith/incoming/m4-premium';
mkdirSync(dest,{recursive:true});mkdirSync(`${dir}/preview`,{recursive:true});
const formal=JSON.parse(readFileSync('assets/gunsmith/manifest.json')),assets=[],records=[],artwork=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
function label(c,str,x,y,color='#bdcfca',scale=2){if(str.startsWith('J')){const glyph=['111','001','001','101','010'];glyph.forEach((row,j)=>[...row].forEach((v,i)=>{if(v==='1')rect(c,color,x+i*scale,y+j*scale,scale,scale);}));text(c,str.slice(1),x+4*scale,y,color,scale);}else text(c,str,x,y,color,scale);}
const transparent=[0,0,0,0],pixel=(p,x,y)=>p.data.subarray((y*p.w+x)*4,(y*p.w+x)*4+4);
const palette=code=>code==='h'?{K:'#242321',E:'#4b4842',D:'#393733',S:'#777268',L:'#a49b88',B:'#ab9370',G:'#59604a',W:'#784d3d',U:'#a27351'}:{K:'#122027',E:'#24373d',D:'#425a60',S:'#829c9d',L:'#bdcfca',B:'#c09a55',G:'#508b89',W:'#996749',U:'#cb9362'};
function alpha(p){return Buffer.from(Array.from({length:p.w*p.h},(_,i)=>p.data[i*4+3]));}
function linked(p){const occ=[];for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(pixel(p,x,y)[3])occ.push([x,y]);if(!occ.length)return false;const q=[occ[0]],s=new Set([occ[0].join(',')]);for(let i=0;i<q.length;i++){const[x,y]=q[i];for(const[a,b]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(a>=0&&b>=0&&a<p.w&&b<p.h&&pixel(p,a,b)[3]&&!s.has(`${a},${b}`)){s.add(`${a},${b}`);q.push([a,b]);}}return s.size===occ.length;}
function author(kind,w,h,code,anchor){
 const c=canvas(w,h),P=palette(code),held=code==='h',work=code==='w',q=code==='q24';
 const R=(color,x,y,rw,rh)=>{x=Math.round(x);y=Math.round(y);rw=Math.round(rw);rh=Math.round(rh);if(rw>0&&rh>0)rect(c,P[color]??color,x,y,rw,rh);};
 const F=(color,pts)=>poly(c,P[color]??color,pts.map(([x,y])=>[Math.round(x),Math.round(y)]));
 const L=(color,x0,y0,x1,y1)=>{x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let err=dx+dy;while(true){R(color,x0,y0,work?2:1,work?2:1);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}};
 const cut=(x,y,rw,rh)=>R(transparent,x,y,rw,rh),a=anchor??[0,Math.floor(h/3)],t=held?1:work?2:1;
 if(['holo','micro'].includes(kind)){
  if(held){R('K',1,0,w-2,h-1);R('K',0,h-1,w,1);R('S',1,1,w-2,1);if(kind==='holo'&&w>4){cut(2,1,w-4,1);R('D',1,0,1,1);}else R('G',Math.min(w-2,2),1,1,1);}
  else{const base=Math.max(1,Math.floor(h*.22)),roof=kind==='holo'?Math.max(2,Math.floor(h*.25)):Math.max(2,Math.floor(h*.2));
   F('K',[[0,h],[1,h-base],[2,roof],[4,0],[w-4,0],[w-2,roof],[w-1,h-base],[w,h]]);R('D',2,roof,w-4,h-base-roof);R('S',3,1,w-7,roof);R('L',4,1,Math.max(1,w-9),1);
   cut(4,roof+1,w-8,Math.max(1,h-base-roof-2));R('G',w-4,roof+1,1,Math.max(1,h-base-roof-3));R('K',0,h-base,w,base);R('S',2,h-base,w-4,1);
   if(work){R('S',3,h-3,3,2);R('S',w-6,h-3,3,2);R('K',Math.floor(w/2)-1,0,3,1);}if(kind==='micro')cut(w-4,0,3,1);
  }
 }else if(kind==='scope'){
  const lens=Math.max(2,Math.floor(w*.18)),cy=held?1:Math.max(1,Math.floor(h*.25));
  R('K',0,0,lens,h-(held?1:2));R('K',w-lens,cy>1?1:0,lens,h-(held?1:2));R('K',lens-1,cy,w-lens*2+2,held?2:Math.max(2,Math.floor(h*.38)));
  R('D',1,cy,w-2,held?1:Math.max(1,Math.floor(h*.3)));R('S',lens,cy,w-lens*2,1);R('L',w-lens+1,1,Math.max(1,lens-2),1);
  R('K',Math.floor(w*.42),0,Math.max(1,Math.floor(w*.11)),cy+1);for(const x of [Math.floor(w*.27),Math.floor(w*.65)]){R('K',x,cy+1,t,h-cy-1);R('K',x-1,h-1,3*t,1);}
  if(!held){R('K',Math.floor(w*.22),h-2,Math.floor(w*.5),2);R('S',1,1,1,h-4);R('S',w-lens+1,2,1,h-5);if(work){R('E',lens+2,cy+2,w-lens*2-4,1);R('S',Math.floor(w*.43),1,2,1);}}
 }else if(kind==='foregrip'||kind.endsWith('grip')||kind==='grip-panels'){
  if(kind==='grip-panels'){
   F('K',[[0,0],[w,1],[w-2,h],[1,h]]);R('D',1,2,w-3,h-3);R('S',2,2,w-5,1);cut(Math.floor(w*.47),3,Math.max(1,t),h-5);
   for(let y=4;y<h-2;y+=work?4:3){R('E',3,y,Math.max(1,w-7),1);if(work)R('S',w-6,y+1,2,1);}
  }else if(held){R('K',0,0,w,1);R('D',0,1,Math.max(1,w-1),h-2);R('S',0,1,1,1);R('K',1,h-1,w-1,1);}
  else{const tilt=kind==='foregrip'?Math.max(1,Math.floor(w*.18)):Math.max(1,Math.floor(w*.24));
   F('K',[[0,0],[w,0],[w-tilt,h-2],[w-1,h],[1,h],[1,h-3],[tilt,3]]);
   F('D',[[2,2],[w-2,2],[w-tilt-1,h-3],[2,h-2],[tilt+1,4]]);R('S',2,2,Math.max(1,w-5),1);
   for(let y=5;y<h-3;y+=work?4:3){R(kind==='ak-grip'?'E':'K',3,y,Math.max(1,w-tilt-5),1);if(work)R('S',3,y+1,1,1);}
   R('E',2,h-3,Math.max(1,w-4),1);if(kind==='foregrip')cut(w-2,h-3,2,2);else if(kind==='ak-grip')R('D',1,Math.floor(h*.6),2,Math.max(2,Math.floor(h*.25)));
  }
 }else if(kind==='device'){
  if(held){R('K',0,0,w,h);R('D',1,1,w-2,1);R('S',w-1,1,1,1);cut(0,h-1,1,1);}
  else{F('K',[[0,1],[2,0],[Math.floor(w*.5),0],[Math.floor(w*.55),1],[w-2,1],[w,3],[w,h-1],[2,h],[0,h-2]]);R('D',1,2,w-2,h-3);R('S',2,1,Math.floor(w*.45)-2,1);R('K',Math.floor(w*.48),0,Math.max(2,t),2);
   R('K',w-5,2,4,h-4);R('L',w-3,3,1,Math.max(1,h-6));R('G',w-6,3,1,1);R('E',2,h-3,Math.max(2,w-10),1);if(work){R('S',3,3,Math.floor(w*.35),1);R('K',4,h-3,2,2);}}
 }else if(kind.includes('tube')||kind==='choke'){
  if(held){R('K',0,0,w,h);R('S',1,1,w-2,1);if(w>4){cut(Math.floor(w*.45),0,1,1);R('D',w-3,1,1,1);}else cut(1,0,1,1);}
  else{R('K',1,0,w-2,h);R('K',0,1,w,h-2);R('D',1,1,w-2,h-2);R('S',2,1,w-4,1);R('L',3,1,Math.max(1,w-8),1);R('E',2,h-2,w-4,1);
   const collar=kind==='short-tube'?3:kind==='precision-tube'?Math.floor(w*.17):2;R('K',collar,1,1,h-2);R('S',collar+1,2,1,h-4);
   const n=kind==='choke'?1:kind==='precision-tube'?4:kind==='rifle-tube'?3:2;
   for(let k=0;k<n;k++){const x=Math.min(w-3,Math.floor(w*.45+k*(w*.38)/Math.max(1,n)));R('K',x,1,1,h-2);if(work)R('S',x+1,2,1,h-4);}
   if(kind==='choke'){R('K',Math.floor(w*.5),2,Math.max(1,Math.floor(w*.2)),Math.max(1,h-4));}
   if(work){R('S',2,h-3,w-5,1);R('E',3,3,w-7,1);}cut(1,0,1,1);cut(w-2,h-1,1,1);
  }
 }else if(kind.endsWith('guard')){
  R('K',0,0,w,h);R('D',1,1,w-2,h-2);R('S',1,1,w-2,1);
  if(held){for(let x=2;x<w-1;x+=3)R('K',x,1,1,1);if(kind==='ar-guard'&&w>7)cut(w-3,h-1,1,1);else cut(2,h-1,1,1);}
  else{const y=work?4:2,hh=work?3:2,spacing=kind==='ar-guard'?(work?12:6):(work?13:7),len=kind==='ar-guard'?(work?8:4):(work?9:5);
   for(let x=work?5:3;x<w-3;x+=spacing){R('K',x,y,Math.min(len,w-2-x),hh);if(work)R('S',x+1,y+hh,Math.max(1,Math.min(len-2,w-4-x)),1);}
   for(let x=2;x<w-1;x+=work?6:3){cut(x,0,work?2:1,1);cut(x,h-1,work?2:1,1);}
   if(work){R('L',2,2,w-4,1);R('E',2,h-4,w-4,1);R('K',w-5,3,2,h-6);}
  }
 }else if(kind.endsWith('stock')){
  const yy=a[1],neck=held?2:Math.max(2,Math.floor(h*.23)),heel=Math.max(2,Math.floor(w*.25));
  if(kind==='mp-stock'){
   R('K',0,0,held?2:3,h);R('D',1,1,1,h-2);R('K',1,yy,w-1,Math.max(1,t));R('K',1,h-2,w-2,Math.max(1,t));
   if(!held){R('S',3,yy,w-4,1);R('S',3,h-3,w-6,1);R('K',w-3,yy,2,h-yy-1);L('S',3,yy+1,w-5,h-3);}else R('S',2,yy,w-3,1);
  }else{
   F('K',[[0,0],[heel,0],[w-2,yy],[w,yy],[w,yy+neck],[heel,h],[0,h]]);
   F('D',[[1,1],[heel,1],[w-2,yy+1],[heel,h-2],[1,h-2]]);R('S',1,1,Math.max(1,w-heel-1),1);
   if(kind==='ar-stock'||kind==='ump-stock'||kind==='precision-stock'){
    const x=held?2:Math.max(3,Math.floor(w*.2)),y=held?3:Math.max(3,Math.floor(h*.35));
    F(transparent,[[x,y],[w-Math.max(3,Math.floor(w*.22)),yy+neck],[heel,h-3],[x,h-3]]);
    if(!held){F('S',[[x,y],[x+1,y],[heel+2,h-3],[heel,h-3]]);if(work)R('E',x+2,y+2,Math.max(2,Math.floor(w*.25)),1);}
   }else if(kind==='shot-stock'){
    if(!held){cut(heel+2,h-4,Math.max(1,w-heel-5),4);R('E',3,4,Math.max(2,w-heel-5),1);}else cut(3,h-2,2,1);
   }else if(kind==='ak-stock'){
    if(!held){F('E',[[heel,3],[w-5,yy+2],[heel+1,h-4],[heel,h-4]]);R('S',heel+1,3,Math.max(1,w-heel-7),1);}else cut(heel,h-1,1,1);
   }
   if(kind==='precision-stock'){const cx=Math.max(2,Math.floor(w*.27)),cw=Math.max(2,Math.floor(w*.4));R('K',cx,0,cw,held?1:2);if(!held){R('D',cx+1,1,cw-2,1);R('S',cx+1,3,1,2);R('S',cx+cw-2,3,1,2);}}
   if(!held){R('E',1,2,2,h-4);if(work)for(let y=4;y<h-3;y+=4)R('S',1,y,2,1);}
  }
 }
 if(!held){const old=Buffer.from(c.data);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const idx=(y*w+x)*4;if(!old[idx+3])continue;const boundary=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([xx,yy])=>xx<0||yy<0||xx>=w||yy>=h||!old[(yy*w+xx)*4+3]);if(boundary)dot(c,x,y,P.K);}}
 return c;
}
function finish(p,ref,meta,code){
 const P=palette(code),protectedPixels=new Set(),before=ref&&alpha(ref),notes=[];
 const protect=(x,y)=>{if(x>=0&&y>=0&&x<p.w&&y<p.h){protectedPixels.add(`${x},${y}`);if(ref)dot(p,x,y,[...pixel(ref,x,y)]);}};
 if(ref){if(meta.slot==='muzzle'){for(let y=0;y<p.h;y++){protect(0,y);protect(p.w-1,y);}}
  for(const pt of [meta.anchor,meta.hand,meta.beam,...Object.values(meta.mounts??{})].filter(Boolean))protect(...pt);
  if(code!=='h'){const old=Buffer.from(p.data);for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++){if(!old[(y*p.w+x)*4+3]||protectedPixels.has(`${x},${y}`))continue;if([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([xx,yy])=>xx<0||yy<0||xx>=p.w||yy>=p.h||!old[(yy*p.w+xx)*4+3]))dot(p,x,y,P.K);}}
  if(alpha(p).equals(before)){
   let cut=false;for(let y=0;y<p.h&&!cut;y++)for(let x=1;x<p.w-1&&!cut;x++){
    if(protectedPixels.has(`${x},${y}`)||!pixel(p,x,y)[3])continue;
    const boundary=y===0||y===p.h-1||!pixel(p,x,y-1)[3]||!pixel(p,x,y+1)[3];if(!boundary)continue;
    const old=Buffer.from(pixel(p,x,y));dot(p,x,y,transparent);if(linked(p)){notes.push({type:'beveled contour',x,y});cut=true;}else dot(p,x,y,[...old]);
   }
   if(!cut)throw Error('No structural contour difference '+meta.id);
  }
 }
 // The family cue is the upper-left non-interface material rivet. Native one pixel;
 // W uses a 2x2 rivet whenever the surrounding inset panel permits it.
 let mark=null;const size=code==='w'?2:1;
 const interior=(x,y)=>x>0&&y>0&&x<p.w-1&&y<p.h-1&&pixel(p,x,y)[3]&&[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].every(([a,b])=>pixel(p,a,b)[3]);
 for(const strict of [true,false]){for(let y=0;y<p.h&&!mark;y++)for(let x=0;x<p.w&&!mark;x++){
  let fits=true;for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){const a=x+dx,b=y+dy;if(a>=p.w||b>=p.h||protectedPixels.has(`${a},${b}`)||!pixel(p,a,b)[3]||(strict&&!interior(a,b)))fits=false;}
  if(fits){mark={x,y,w:size,h:size,color:P.B};rect(p,P.B,x,y,size,size);}
 }if(mark)break;}
 if(!mark)throw Error('No rivet position '+meta.id);
 return {mark,notes};
}
function add(p,meta,reference,feature){
 const bytes=png(p),file=`${dest}/${meta.id}.png`;writeFileSync(file,bytes);
 const clean={...meta};for(const k of ['sha256','bytes','source','sourceRect','exportMethod','replacesSha256'])delete clean[k];
 const a={...clean,file,w:p.w,h:p.h,bytes:bytes.length,sha256:hash(bytes),colors:colors(p),revision:1,source:`${dir}/source/pixel-artwork.json`,sourceRect:null,exportMethod:'original independently authored native H/I/W/Q24 integer-grid artwork; shared family-rivet design; no runtime-image resampling'};assets.push(a);
 artwork.push({id:a.id,w:p.w,h:p.h,rgba:p.data.toString('base64')});records.push({id:a.id,reference:reference?.id??null,referenceSha256:reference?.sha256??null,feature});return a;
}
for(const d of designs){
 for(const code of ['h','i','w']){if(code==='h'&&d.noHeld)continue;const ref=formal.assets.find(a=>a.id===`gs-${d.ref.toLowerCase()}-${code}-v1`);if(!ref)throw Error(d.ref+'/'+code);
  const meta={...ref,id:`gs-${d.id.toLowerCase()}-${code}-v1`,item:d.id,gun:null},p=author(d.kind,ref.w,ref.h,code,ref.anchor),f=finish(p,decode(ref.file),meta,code);
  const a=add(p,meta,ref,d.feature);Object.assign(records.at(-1),f,{alphaDifference:alpha(p).reduce((n,v,i)=>n+(v!==alpha(decode(ref.file))[i]?1:0),0)});
 }
 const ref=formal.assets.find(a=>a.id===`gs-${d.ref.toLowerCase()}-q24-v1`),[w,h]=d.iconSize,body=author(d.kind,w,h,'q24',d.kind.endsWith('stock')?[w-1,Math.floor(h*.25)]:null),p=canvas(24,24),x=Math.floor((24-w)/2),y=Math.floor((24-h)/2);blit(p,body,x,y);const meta={id:`gs-${d.id.toLowerCase()}-q24-v1`,output:'icon24',gun:null,item:d.id,role:'icon',slot:null,anchor:null},f=finish(p,null,meta,'q24');add(p,meta,ref,d.feature);Object.assign(records.at(-1),f);
}
// Carbine uses the same physical tube with the approved half-pixel bore alignment.
{const d=designs.find(d=>d.id==='J07'),ref=formal.assets.find(a=>a.id==='gs-m07-h-carbine-v1'),meta={...ref,id:'gs-j07-h-carbine-v1',item:'J07',gun:null},p=author(d.kind,ref.w,ref.h,'h',ref.anchor),f=finish(p,decode(ref.file),meta,'h');add(p,meta,ref,'carbine half-pixel interface, cooling groove and machined collar');Object.assign(records.at(-1),f);}
// The blank is a partly milled billet: unfinished top shelf, unfinished pocket, pin.
{const p=canvas(24,24),P=palette('q24');poly(p,P.K,[[2,9],[8,3],[21,3],[22,5],[22,17],[17,21],[2,21]]);poly(p,P.D,[[3,10],[9,5],[20,5],[21,7],[21,16],[16,20],[3,20]]);poly(p,P.S,[[3,9],[9,4],[20,4],[21,6],[15,12],[3,12]]);rect(p,P.L,9,4,10,1);poly(p,P.E,[[9,8],[17,8],[13,12],[7,12]]);rect(p,P.K,6,14,9,4);rect(p,P.S,7,15,7,1);rect(p,P.B,17,7,1,1);rect(p,P.S,3,13,1,6);const a=add(p,{id:'gs-premiumblank-q24-v1',output:'icon24',gun:null,item:'premiumBlank',role:'icon',slot:null,anchor:null},null,'stepped unfinished billet with rough shelf, partial milling recess and brass locating pin');records.at(-1).mark={x:17,y:7,w:1,h:1,color:P.B};}
const totals={files:assets.length,pngBytes:assets.reduce((n,a)=>n+a.bytes,0),baseRequestedFiles:78,carbineVariants:1};
writeFileSync(`${dest}/manifest.json`,JSON.stringify({schema:1,revision:1,batch:'M4-PREMIUM',totals,assets},null,2)+'\n');
writeFileSync(`${dir}/source/pixel-artwork.json`,JSON.stringify({schema:1,artwork},null,2)+'\n');
writeFileSync(`${dir}/design-records.json`,JSON.stringify({schema:1,records},null,2)+'\n');
// Material previews only. Neither labels nor backgrounds enter runtime sprites.
for(const code of ['h','i','w','q24']){
 const cellW=code==='w'?400:code==='h'?245:285,cellH=code==='w'?110:code==='h'?70:100,cols=code==='w'?3:4,rows=Math.ceil(20/cols),c=canvas(cellW*cols+16,rows*cellH+56);rect(c,'#141c1b',0,0,c.w,c.h);text(c,`${code.toUpperCase()} PREMIUM / REFERENCE - NATIVE INTEGER SCALE`,12,14,'#bdcfca',2);
 for(const [i,d]of designs.entries()){const x=8+(i%cols)*cellW,y=48+Math.floor(i/cols)*cellH;label(c,`${d.id} / ${d.ref}`,x,y,'#bdcfca',2);const a=assets.find(a=>a.id===`gs-${d.id.toLowerCase()}-${code}-v1`),r=formal.assets.find(a=>a.id===`gs-${d.ref.toLowerCase()}-${code}-v1`);if(!a){text(c,'NO H - REAR GRIP',x,y+26);continue;}const scale=code==='h'?5:code==='w'?2:code==='q24'?2:3;
  blit(c,decode(r.file),x,y+28,scale);blit(c,decode(a.file),x+Math.floor(cellW*.5),y+28,scale);
 }save(`${dir}/preview/${code}-reference-comparison.png`,c);
}
const icons=assets.filter(a=>a.output==='icon24'),contact=canvas(1120,408);rect(contact,'#141c1b',0,0,contact.w,contact.h);text(contact,'LAOSHUAN PREMIUM PARTS - Q24 1X / 3X / GRAY 1X',16,16,'#bdcfca',2);
for(const[i,a]of icons.entries()){const x=16+(i%7)*156,y=48+Math.floor(i/7)*116;label(contact,a.item,x,y,'#bdcfca',2);const p=decode(a.file);blit(contact,p,x,y+20);blit(contact,p,x+32,y+20,3);blit(contact,p,x+112,y+20,1,true);}save(`${dir}/preview/icons-overview.png`,contact);
const contrast=canvas(952,936);rect(contrast,'#141c1b',0,0,contrast.w,contrast.h);text(contrast,'Q24 DARK / MID / LIGHT MATERIAL CHECK',12,12,'#bdcfca',2);
for(let k=0;k<3;k++){const top=40+k*296,bg=['#141c1b','#46534f','#d7d4c6'][k],fg=k===2?'#122027':'#bdcfca';rect(contrast,bg,0,top,contrast.w,288);for(const[i,a]of icons.entries()){const x=12+(i%7)*134,y=top+8+Math.floor(i/7)*94;label(contrast,a.item,x,y,fg,2);blit(contrast,decode(a.file),x,y+18,3);}}save(`${dir}/preview/icons-three-backgrounds.png`,contrast);
console.log(JSON.stringify({totals,maxColors:Math.max(...assets.map(a=>a.colors))}));
