import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {decode} from '../m3-w3/source/pixels.mjs';
import {designs} from './source/design.mjs';
process.chdir(fileURLToPath(new URL('../../../../',import.meta.url)));
const dir='docs/gunsmith/art/m4-premium',dest='assets/gunsmith/incoming/m4-premium';
const manifest=JSON.parse(readFileSync(`${dest}/manifest.json`)),formal=JSON.parse(readFileSync('assets/gunsmith/manifest.json'));
const baseline=JSON.parse(readFileSync(`${dir}/source/baseline-lock.json`)),record=JSON.parse(readFileSync(`${dir}/design-records.json`)).records,source=JSON.parse(readFileSync(`${dir}/source/pixel-artwork.json`)).artwork;
const hash=b=>createHash('sha256').update(b).digest('hex'),pixel=(p,x,y)=>p.data.subarray((y*p.w+x)*4,(y*p.w+x)*4+4);
const alpha=p=>Buffer.from(Array.from({length:p.w*p.h},(_,i)=>p.data[i*4+3]));
const palette=p=>new Set(Array.from({length:p.w*p.h},(_,i)=>p.data[i*4+3]?p.data.subarray(i*4,i*4+3).toString('hex'):null).filter(Boolean));
const uiColors=new Set(['122027','24373d','425a60','829c9d','bdcfca','c09a55','508b89','996749','cb9362']);
const workColors=new Set([...uiColors,'63797c','a7bab7']); // Existing approved W intermediate steel shades.
const heldColors=new Set(['242321','393733','4b4842','625b4f','777268','a49b88','ab9370','59604a','784d3d','a27351']);
const checks=[],check=(name,fn)=>{try{fn();checks.push({name,status:'pass'});}catch(e){checks.push({name,status:'fail',error:e.message});}};
check('78 requested base files plus required carbine-held variant',()=>{
 assert.equal(manifest.assets.length,79);assert.equal(manifest.assets.filter(a=>a.output==='held').length,18);assert.equal(manifest.assets.filter(a=>a.output==='inventory').length,20);assert.equal(manifest.assets.filter(a=>a.output==='bench').length,20);assert.equal(manifest.assets.filter(a=>a.output==='icon24').length,21);
 assert.ok(manifest.assets.some(a=>a.id==='gs-j07-h-carbine-v1'));assert.ok(manifest.assets.some(a=>a.id==='gs-premiumblank-q24-v1'));
 assert.equal(new Set(manifest.assets.map(a=>a.id)).size,79);assert.equal(manifest.totals.pngBytes,manifest.assets.reduce((n,a)=>n+a.bytes,0));
 assert.deepEqual(readdirSync(dest).sort(),['manifest.json',...manifest.assets.map(a=>a.file.split('/').at(-1))].sort());
});
check('Formal manifest and all 652 accepted PNGs are unchanged',()=>{
 assert.equal(hash(readFileSync('assets/gunsmith/manifest.json')),baseline.manifestSha256);assert.deepEqual(formal.assets.map(({id,file,sha256,bytes})=>({id,file,sha256,bytes})),baseline.assets);assert.equal(formal.assets.length,652);
 for(const a of formal.assets){const b=readFileSync(a.file);assert.equal(hash(b),a.sha256,a.id);assert.equal(b.length,a.bytes,a.id);}
});
const results=[];
for(const a of manifest.assets){const p=decode(a.file),bytes=readFileSync(a.file),r=record.find(r=>r.id===a.id),ref=r.reference&&formal.assets.find(b=>b.id===r.reference),old=ref&&decode(ref.file),s=source.find(s=>s.id===a.id);
 check(`${a.id}: SHA, bytes, dimensions and exact native RGBA replay`,()=>{assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.bytes);assert.deepEqual([p.w,p.h],[a.w,a.h]);assert.deepEqual(p.data,Buffer.from(s.rgba,'base64'));assert.deepEqual([s.w,s.h],[a.w,a.h]);});
 check(`${a.id}: nonempty binary alpha, color count, legal palette and limit`,()=>{const pal=palette(p);assert.ok(pal.size>0&&pal.size<=(a.output==='bench'?12:8));assert.equal(pal.size,a.colors);const allowed=a.output==='held'?heldColors:a.output==='bench'?workColors:uiColors;assert.ok([...pal].every(v=>allowed.has(v)));for(const v of alpha(p))assert.ok(v===0||v===255);});
 check(`${a.id}: consistent upper-left brass rivet`,()=>{assert.ok(r.mark);const m=r.mark;assert.equal(m.color,a.output==='held'?'#ab9370':'#c09a55');assert.equal(m.w,a.output==='bench'?2:1);assert.equal(m.h,m.w);for(let y=m.y;y<m.y+m.h;y++)for(let x=m.x;x<m.x+m.w;x++)assert.equal(pixel(p,x,y).subarray(0,3).toString('hex'),m.color.slice(1));});
 check(`${a.id}: no stray disconnected pixels (eight-neighbor pixel contour)`,()=>{const occ=[];for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(pixel(p,x,y)[3])occ.push([x,y]);const q=[occ[0]],seen=new Set([occ[0].join(',')]);for(let k=0;k<q.length;k++){const[x,y]=q[k];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,key=`${xx},${yy}`;if(xx>=0&&yy>=0&&xx<p.w&&yy<p.h&&pixel(p,xx,yy)[3]&&!seen.has(key)){seen.add(key);q.push([xx,yy]);}}}assert.equal(seen.size,occ.length);});
 if(ref){
  check(`${a.id}: reference frame, anchor, mounts, tip, hand, beam and layer match exactly`,()=>{assert.equal(r.referenceSha256,ref.sha256);for(const k of ['w','h','anchor','mounts','tip','hand','beam','layer','slot','output','role'])assert.deepEqual(a[k],ref[k],k);});
  check(`${a.id}: real structural silhouette difference from reference, beyond palette`,()=>assert.notDeepEqual(alpha(p),alpha(old)));
  if(a.output!=='icon24')check(`${a.id}: mounting-interface pixels and muzzle terminal remain exact`,()=>{
   for(const pt of [ref.anchor,ref.hand,ref.beam,...Object.values(ref.mounts??{})].filter(Boolean))assert.deepEqual(pixel(p,...pt),pixel(old,...pt));
   if(a.slot==='muzzle')for(let y=0;y<p.h;y++)for(const x of [0,p.w-1])assert.deepEqual(pixel(p,x,y),pixel(old,x,y));
  });
 }
 if(a.output!=='held')check(`${a.id}: single ink outside contour except unchanged reference interfaces and emitter`,()=>{const except=new Set(ref?[ref.anchor,ref.hand,ref.beam,...Object.values(ref.mounts??{})].filter(Boolean).map(p=>p.join(',')):[]);if(ref?.slot==='muzzle')for(let y=0;y<p.h;y++){except.add(`0,${y}`);except.add(`${p.w-1},${y}`);}for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++){if(!pixel(p,x,y)[3]||except.has(`${x},${y}`))continue;const edge=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([xx,yy])=>xx<0||yy<0||xx>=p.w||yy>=p.h||!pixel(p,xx,yy)[3]);if(edge)assert.equal(pixel(p,x,y).subarray(0,3).toString('hex'),'122027',`${x},${y}`);}});
 results.push({id:a.id,reference:r.reference,dimensions:[a.w,a.h],colors:a.colors,bytes:a.bytes,mark:r.mark,structuralDifference:ref?!alpha(p).equals(alpha(old)):true});
}
for(const d of designs)check(`${d.id}: complete output set; hidden rear grips have no held sprite`,()=>{for(const code of ['i','w','q24'])assert.ok(manifest.assets.some(a=>a.id===`gs-${d.id.toLowerCase()}-${code}-v1`));assert.equal(manifest.assets.some(a=>a.id===`gs-${d.id.toLowerCase()}-h-v1`),!d.noHeld);});
check('21 icons unique in color, alpha silhouette and grayscale',()=>{
 const qs=manifest.assets.filter(a=>a.output==='icon24');const variants=[[],[],[]];for(const a of qs){assert.deepEqual([a.w,a.h],[24,24]);const p=decode(a.file),gray=Buffer.from(p.data);for(let i=0;i<gray.length;i+=4){const v=Math.round(.2126*gray[i]+.7152*gray[i+1]+.0722*gray[i+2]);gray[i]=gray[i+1]=gray[i+2]=v;}variants[0].push(hash(p.data));variants[1].push(hash(alpha(p)));variants[2].push(hash(gray));}for(const v of variants)assert.equal(new Set(v).size,21);
 assert.equal(qs.find(a=>a.id==='gs-premiumblank-q24-v1').item,'premiumBlank');
});
check('Twenty W sprites are independently detailed, never nearest-neighbor I enlargement',()=>{
 for(const d of designs){const i=decode(manifest.assets.find(a=>a.id===`gs-${d.id.toLowerCase()}-i-v1`).file),w=decode(manifest.assets.find(a=>a.id===`gs-${d.id.toLowerCase()}-w-v1`).file);assert.deepEqual([w.w,w.h],[i.w*2,i.h*2]);let same=true;for(let y=0;y<w.h;y++)for(let x=0;x<w.w;x++)if(!pixel(w,x,y).equals(pixel(i,Math.floor(x/2),Math.floor(y/2))))same=false;assert.equal(same,false,d.id);}
});
const report={schema:1,date:'2026-10-30',status:checks.every(c=>c.status==='pass')?'pass':'fail',passed:checks.filter(c=>c.status==='pass').length,failed:checks.filter(c=>c.status==='fail').length,totals:manifest.totals,formalAssetsUnchanged:652,results,checks};
writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,failures:checks.filter(c=>c.status==='fail')}));if(report.failed)process.exitCode=1;
