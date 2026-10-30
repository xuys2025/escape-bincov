// Independent acceptance of delivered PNGs; does not regenerate any artwork.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {decode,canvas,blit} from '../m3-w3/source/pixels.mjs';
process.chdir(fileURLToPath(new URL('../../../../',import.meta.url)));
const dir='docs/gunsmith/art/m4-mags',dest='assets/gunsmith/incoming/m4-mags';
const manifest=JSON.parse(readFileSync(`${dest}/manifest.json`)),formalBytes=readFileSync('assets/gunsmith/manifest.json'),formal=JSON.parse(formalBytes);
const assembly=JSON.parse(readFileSync(`${dir}/assembly-records.json`)),source=JSON.parse(readFileSync(`${dir}/source/pixel-artwork.json`));
const hash=b=>createHash('sha256').update(b).digest('hex');
const pixel=(p,x,y)=>p.data.subarray((y*p.w+x)*4,(y*p.w+x)*4+4);
const palette=p=>new Set(Array.from({length:p.w*p.h},(_,i)=>p.data[i*4+3]?p.data.subarray(i*4,i*4+3).toString('hex'):null).filter(Boolean));
const checks=[];const check=(name,fn)=>{try{fn();checks.push({name,status:'pass'});}catch(e){checks.push({name,status:'fail',error:e.message});}};
check('Only 22 batch PNGs and manifest, with unique IDs and exact totals',()=>{
  assert.equal(manifest.assets.length,22);assert.equal(new Set(manifest.assets.map(a=>a.id)).size,22);
  assert.deepEqual(readdirSync(dest).sort(),['manifest.json',...manifest.assets.map(a=>a.file.split('/').at(-1))].sort());
  assert.equal(manifest.totals.pngBytes,manifest.assets.reduce((n,a)=>n+a.bytes,0));
});
check('Accepted formal manifest and all 636 formal PNGs are unchanged',()=>{
  assert.equal(hash(formalBytes),assembly.formalManifestSha256);assert.equal(formal.assets.length,636);
  for(const a of formal.assets){const b=readFileSync(a.file);assert.equal(hash(b),a.sha256,a.id);assert.equal(b.length,a.bytes,a.id);}
});
for(const a of manifest.assets){const bytes=readFileSync(a.file),p=decode(a.file);
  check(`${a.id}: SHA, bytes and declared PNG dimensions`,()=>{assert.equal(hash(bytes),a.sha256);assert.equal(bytes.length,a.bytes);assert.deepEqual([p.w,p.h],[a.w,a.h]);});
  check(`${a.id}: nonempty binary alpha and ART-SPEC color limit`,()=>{const pal=palette(p);assert.equal(pal.size,a.colors);assert.ok(pal.size>0);assert.ok(pal.size<=(a.output==='bench'?12:8));for(let i=3;i<p.data.length;i+=4)assert.ok(p.data[i]===0||p.data[i]===255);});
  check(`${a.id}: complete original RGBA source replays exactly`,()=>{const i=source.icons.find(i=>i.id===a.id),s=source.splits.find(s=>s.receiver===a.id||s.magazine===a.id);const b64=i?i.rgba:s.receiver===a.id?s.receiverRGBA:s.magazineRGBA;assert.deepEqual(p.data,Buffer.from(b64,'base64'));});
  check(`${a.id}: all anchors and mounts inside canvas`,()=>{for(const pt of [a.anchor,...Object.values(a.mounts??{})].filter(Boolean)){assert.equal(pt.length,2);assert.ok(pt.every(Number.isInteger));assert.ok(pt[0]>=0&&pt[0]<a.w&&pt[1]>=0&&pt[1]<a.h);}});
}
const iconAssets=manifest.assets.filter(a=>a.role==='icon'),alphaHashes=[],grayHashes=[];
const allowed=new Set(['122027','24373d','425a60','829c9d','bdcfca','485c4b','7d9168','b4bf89','5c4236','996749','cb9362']);
for(const a of iconAssets){const p=decode(a.file);let alpha=Buffer.alloc(576),gray=Buffer.alloc(1152);const occupied=[];
  for(let y=0;y<24;y++)for(let x=0;x<24;x++){const b=pixel(p,x,y),i=y*24+x;alpha[i]=b[3];gray[i*2]=Math.round(.2126*b[0]+.7152*b[1]+.0722*b[2]);gray[i*2+1]=b[3];if(b[3])occupied.push([x,y]);}
  alphaHashes.push(hash(alpha));grayHashes.push(hash(gray));
  check(`${a.id}: 24x24 detached item metadata and two-pixel transparent border`,()=>{assert.deepEqual([a.w,a.h],[24,24]);assert.equal(a.item,`${a.gun}-mag`);assert.equal(a.output,'icon24');assert.equal(a.slot,null);assert.ok(occupied.every(([x,y])=>x>=2&&x<=21&&y>=2&&y<=21));});
  check(`${a.id}: UI palette and single ink exterior contour`,()=>{assert.ok([...palette(p)].every(c=>allowed.has(c)));for(const[x,y]of occupied)if([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([xx,yy])=>!pixel(p,xx,yy)[3]))assert.equal(pixel(p,x,y).subarray(0,3).toString('hex'),'122027');});
  check(`${a.id}: one connected object without detached pixels`,()=>{const queue=[occupied[0]],seen=new Set([occupied[0].join(',')]);for(let i=0;i<queue.length;i++){const[x,y]=queue[i];for(const[xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(xx<0||yy<0||xx>=24||yy>=24)continue;const k=`${xx},${yy}`;if(pixel(p,xx,yy)[3]&&!seen.has(k)){seen.add(k);queue.push([xx,yy]);}}}assert.equal(seen.size,occupied.length);});
}
check('Exactly ten named factory magazine icons, distinct silhouettes and grayscale images',()=>{
  assert.deepEqual(iconAssets.map(a=>a.gun).sort(),['mpb5','umpb45','akb74','akb103','mb4a1','augb','mb14','rpkb','svdb','vb9'].sort());
  assert.equal(new Set(alphaHashes).size,10);assert.equal(new Set(grayHashes).size,10);
});
const splitResults=[];
for(const rec of assembly.records){const old=formal.assets.find(a=>a.id===rec.baseline),r=manifest.assets.find(a=>a.id===rec.receiver),m=manifest.assets.find(a=>a.id===rec.magazine);
  const before=decode(old.file),receiver=decode(r.file),mag=decode(m.file),[x,y,w,h]=rec.crop,combined=canvas(before.w,before.h);
  // Actual required back-to-front order; receiver overlays the shared lip row.
  blit(combined,mag,r.mounts.mag[0]-m.anchor[0],r.mounts.mag[1]-m.anchor[1]);blit(combined,receiver,0,0);
  check(`${r.id}: uses exact accepted baseline and next revision`,()=>{assert.equal(r.replacesSha256,old.sha256);assert.equal(rec.baselineSha256,old.sha256);assert.equal(r.revision,old.revision+1);if(r.gun==='svdb')assert.ok(['gs-svdb-receiver-h-v2','gs-svdb-receiver-i-v3','gs-svdb-receiver-w-v3'].includes(old.id));});
  check(`${r.id}: canvas, tip, grip, hand, bore, forward and existing mounts exact`,()=>{for(const k of ['w','h','tip','grip','hand','bore','forward'])assert.deepEqual(r[k],old[k],k);const {mag,...rest}=r.mounts;assert.deepEqual(rest,old.mounts);assert.deepEqual(mag,[x,y]);assert.ok(!old.mounts.mag);});
  check(`${m.id}: crop size, anchor, role and default behind-receiver metadata`,()=>{assert.deepEqual([m.w,m.h],[w,h]);assert.deepEqual(m.anchor,[0,0]);assert.equal(m.role,'factory');assert.equal(m.slot,'mag');assert.equal(m.output,r.output);assert.equal(m.gun,r.gun);assert.equal(m.layer,undefined);});
  check(`${r.id}: every original pixel outside magazine is unchanged`,()=>{for(let yy=0;yy<before.h;yy++)for(let xx=0;xx<before.w;xx++){if(xx>=x&&xx<x+w&&yy>y&&yy<y+h)assert.deepEqual([...pixel(receiver,xx,yy)],[0,0,0,0]);else assert.deepEqual(pixel(receiver,xx,yy),pixel(before,xx,yy));}});
  check(`${m.id}: M3-W3 magazine pixels and shared lip row transferred without resampling`,()=>{for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)assert.deepEqual(pixel(mag,xx,yy),pixel(before,xx+x,yy+y));assert.ok([...palette(mag)].every(c=>palette(before).has(c)));});
  check(`${r.id}: exact whole-image RGBA reassembly, including transparent pixels`,()=>assert.deepEqual(combined.data,before.data));
  check(`${r.id}: negative control proves removing magazine changes original image`,()=>assert.notDeepEqual(receiver.data,before.data));
  splitResults.push({receiver:r.id,magazine:m.id,baseline:old.id,crop:rec.crop,magMount:r.mounts.mag,magAnchor:m.anchor,originalRGBA:hash(before.data),recombinedRGBA:hash(combined.data),differingPixels:combined.data.equals(before.data)?0:null});
}
check('Exactly six H/I/W layer pairs and six same-size receiver replacements',()=>{assert.equal(splitResults.length,6);assert.equal(manifest.assets.filter(a=>a.role==='factory').length,6);assert.equal(manifest.assets.filter(a=>a.role==='receiver').length,6);});
const report={schema:1,date:'2026-10-30',status:checks.every(c=>c.status==='pass')?'pass':'fail',passed:checks.filter(c=>c.status==='pass').length,failed:checks.filter(c=>c.status==='fail').length,totals:manifest.totals,formalAssetsUnchanged:636,splitResults,checks};
writeFileSync(`${dir}/validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,failures:checks.filter(c=>c.status==='fail')}));if(report.failed)process.exitCode=1;
