// Independent package check. Uses only Node built-ins, images and saved art metadata.
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,writeFileSync,statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canvas,rect,poly,decode,colors } from './source/pixels.mjs';
import { root,docs,incoming,manifest,baseline,assets,picture,configurations,assemble,scaled } from './source/assemble.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
const run=(name,fn)=>{try{const detail=fn();checks.push({name,status:'pass',...(detail===undefined?{}:{detail})});}catch(e){checks.push({name,status:'fail',error:e.message});}};
const source=JSON.parse(readFileSync(resolve(root,docs+'/source/pixel-artwork.json'))),saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json')));
const parts=['O05','O10','F04','F07','T02','T10'];
run('P0 exactly AUG 8 plus six parts 24; flat directory and manifest bijection',()=>{
 assert.equal(manifest.batch,'M3-W2');assert.equal(manifest.stage,'P0');assert.equal(manifest.assets.length,32);assert.equal(new Set(manifest.assets.map(a=>a.id)).size,32);
 const expected=[];for(const code of ['h','i','w'])for(const stem of ['receiver','mag-factory'])expected.push(`gs-augb-${stem}-${code}-v1`);for(const code of ['q24','q32'])expected.push(`gs-augb-${code}-v1`);
 for(const id of parts)for(const code of ['h','i','w','q24'])expected.push(`gs-${id.toLowerCase()}-${code}-v1`);
 assert.deepEqual(manifest.assets.map(a=>a.id).sort(),expected.sort());assert.deepEqual(readdirSync(resolve(root,incoming)).sort(),[...expected.map(id=>id+'.png'),'manifest.json'].sort());
});
for(const a of manifest.assets)run(a.id,()=>{
 const b=readFileSync(resolve(root,a.file)),c=decode(resolve(root,a.file));assert.equal(a.file,`${incoming}/${a.id}.png`);assert.deepEqual([c.w,c.h,b.length,sha(b),colors(c)],[a.w,a.h,a.bytes,a.sha256,a.colors]);
 let opaque=0;for(let i=3;i<c.data.length;i+=4){assert.ok(c.data[i]===0||c.data[i]===255,'binary alpha');if(c.data[i])opaque++;}assert.ok(opaque,'nonempty');assert.ok(a.colors<=(a.output==='bench'?12:8),'color cap');
 if(a.output.startsWith('icon')){const n=a.output==='icon24'?24:32;assert.deepEqual([a.w,a.h],[n,n]);assert.equal(a.role,'icon');assert.ok(a.item);}
 const point=(p,edge=false,integer=true)=>{assert.ok(p&&p.length===2&&p.every(Number.isFinite));assert.ok(p[0]>=0&&p[0]<(edge?a.w+1:a.w)&&p[1]>=0&&p[1]<a.h,JSON.stringify(p)+' in canvas');if(integer)assert.ok(p.every(Number.isInteger));};
 if(a.anchor){point(a.anchor);assert.equal(c.data[(a.anchor[1]*a.w+a.anchor[0])*4+3],255,'opaque anchor');}
 for(const p of Object.values(a.mounts??{}))point(p);if(a.tip)point(a.tip,true,false);if(a.grip)point(a.grip);if(a.hand)point(a.hand);if(a.beam)point(a.beam);
 const s=source.assets.find(s=>s.id===a.id);assert.ok(s);const replay=canvas(s.w,s.h);for(const o of s.ops){assert.ok(['r','p'].includes(o[0]));if(o[0]==='r')rect(replay,...o.slice(1));else poly(replay,...o.slice(1));}assert.ok(replay.data.equals(c.data),'editable source exact pixel replay');
});
run('All W independently detailed; W/I coordinates within two pixels',()=>{
 const out=[];for(const a of manifest.assets.filter(a=>a.output==='bench')){
  const i=assets.get(a.id.replace('-w-v1','-i')),large=picture(a.id.replace('-v1','')),small=picture(i.id.replace('-v1',''));assert.deepEqual([large.w,large.h],[small.w*2,small.h*2]);
  let different=0;const naive=scaled(small,2);for(let j=0;j<large.data.length;j+=4)if(!large.data.subarray(j,j+4).equals(naive.data.subarray(j,j+4)))different++;assert.ok(different>0);
  for(const [name,p]of Object.entries({...a.mounts,...(a.anchor?{anchor:a.anchor}:{}),...(a.hand?{hand:a.hand}:{}),...(a.beam?{beam:a.beam}:{})})){
   const q=name==='anchor'?i.anchor:name==='hand'?i.hand:name==='beam'?i.beam:i.mounts[name];assert.ok(q);assert.ok(p.every((v,j)=>Math.abs(v-2*q[j])<=2),a.id+' '+name);
  }out.push({id:a.id,differentPixelsFromScaledI:different});
 }return out;
});
const sizes=[];
for(const [gun,configs]of Object.entries(configurations))for(const name of Object.keys(configs))for(const code of ['h','i','w'])run(`${gun}/${name}/${code} anchor assembly and preview`,()=>{
 const {record:r,image,nodes}=assemble(gun,name,code),expected=saved.assemblies.find(a=>a.gun===gun&&a.configuration===name&&a.code===code);assert.deepEqual(r,expected);
 const limit=code==='h'?[48,16]:code==='i'?[gun==='augb'?108:144,26]:[gun==='augb'?216:288,52];assert.ok(r.w<=limit[0]&&r.h<=limit[1],`${r.w}x${r.h} <= ${limit}`);assert.ok(r.colors<=(code==='w'?24:16));
 for(const s of code==='w'?[1,2]:[1,3])assert.ok(scaled(image,s).data.equals(decode(resolve(root,docs+`/preview/${gun}-${name}-${code}-${s}x.png`)).data),'exact preview pixels');
 if(code==='h'){assert.equal(r.tip[1],r.bore);if(gun==='augb'&&name==='factory'){assert.equal(r.w,26);assert.ok(r.h<=11);}}
 // The shared anchor must cover one parent pixel. Preview inspection also checks the contour around that seam.
 for(const n of nodes.filter(n=>n.parent&&!n.label.startsWith('glove'))){const c=picture(n.key),parent=picture(n.parent.key);let touches=false;
  for(let y=0;y<c.h&&!touches;y++)for(let x=0;x<c.w&&!touches;x++)if(c.data[(y*c.w+x)*4+3]){
   const px=n.x+x-n.parent.x,py=n.y+y-n.parent.y;for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++)if(px+u>=0&&py+v>=0&&px+u<parent.w&&py+v<parent.h&&parent.data[((py+v)*parent.w+px+u)*4+3])touches=true;
  }assert.ok(touches,n.key+' does not float away from '+n.parent.key);
 }
 if(code==='h')for(const n of nodes.filter(n=>['under','side1','side2'].includes(n.label))){const c=picture(n.key),at=r.layers.find(l=>l.key===n.key).origin;for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++)if(c.data[(y*c.w+x)*4+3])assert.ok(at[0]+x<r.tip[0],'device stays behind tip');}
 sizes.push({gun,configuration:name,code,size:[r.w,r.h],colors:r.colors});return{size:[r.w,r.h],colors:r.colors};
});
run('AUG bullpup magazine behind grip; F04 hand behind forward stop',()=>{
 for(const code of ['h','i','w']){const a=assets.get(`gs-augb-receiver-${code}`),mag=assets.get(`gs-augb-mag-factory-${code}`),f=assets.get(`gs-f04-${code}`);assert.equal(mag.layer,'aboveReceiver');assert.ok(f.hand[0]<f.w-2);if(code==='h')assert.ok(a.mounts.mag[0]+mag.w<a.grip[0]);}
});
run('AUG bare ground/HUD image has no gloves and exact 1x/2x previews',()=>{const {record,image}=assemble('augb','factory','h',false);assert.deepEqual(saved.bareFactories,[record]);assert.ok(!record.layers.some(l=>l.label.startsWith('glove')));for(const s of [1,2])assert.ok(scaled(image,s).data.equals(decode(resolve(root,docs+`/preview/augb-factory-ground-hud-${s}x.png`)).data));});
run('Formal 387 M2/W1 images retain original bytes and hashes',()=>{
 const lock=JSON.parse(readFileSync(resolve(root,docs+'/source/baseline-lock.json')));assert.equal(lock.assets.length,387);assert.equal(sha(readFileSync(resolve(root,'assets/gunsmith/manifest.json'))),lock.manifestSha256);for(const a of lock.assets)assert.equal(sha(readFileSync(resolve(root,a.file))),a.sha256,a.id);return{files:lock.assets.length};
});
run('Native held/world and UI palette; W alone may add its middle tones',()=>{
 for(const a of manifest.assets){const c=decode(resolve(root,a.file)),allowed=new Set(Object.values(source.assets.find(s=>s.id===a.id).palette).map(c=>c.replace('#','')));for(let i=0;i<c.data.length;i+=4)if(c.data[i+3])assert.ok(allowed.has(c.data.subarray(i,i+3).toString('hex')),a.id);}
});
run('Preview/source images below one MiB; icon grayscale silhouettes distinct',()=>{
 for(const sub of ['preview','source'])for(const f of readdirSync(resolve(root,docs+'/'+sub)))if(f.endsWith('.png'))assert.ok(statSync(resolve(root,docs+'/'+sub,f)).size<1048576,f);
 const icons=manifest.assets.filter(a=>a.output==='icon24'),hashes=icons.map(a=>sha(scaled(picture(a.id.replace('-v1','')),1,true).data));assert.equal(new Set(hashes).size,icons.length);
});
run('Held close and steady silhouettes distinct at 1x',()=>{const a=assemble('augb','close','h').image,b=assemble('augb','steady','h').image;assert.notDeepEqual([a.w,a.h],[b.w,b.h]);assert.notEqual(sha(a.data),sha(b.data));});
const pngBytes=manifest.assets.reduce((s,a)=>s+a.bytes,0);
run('Byte accounting',()=>{assert.equal(manifest.totals.files,32);assert.equal(manifest.totals.pngBytes,pngBytes);assert.equal(baseline.assets.reduce((s,a)=>s+a.bytes,0),baseline.totals.pngBytes);return{p0Bytes:pngBytes,formalBaselineBytes:baseline.totals.pngBytes,cumulativeBytes:pngBytes+baseline.totals.pngBytes,waveReferenceBytes:96*1024};});
const fail=checks.filter(c=>c.status==='fail'),report={schema:1,stage:'P0',status:fail.length?'fail':'pass',passed:checks.length-fail.length,failed:fail.length,checks,assemblies:sizes,oldBareSprites:{status:'pending-P1',reason:'The three legacy no-hand sprites are outside P0; formal source images are unchanged.'},visualReview:'Native 1x and enlarged sheets, three backgrounds, grayscale and body scale reviewed. Anchor contact checks do not by themselves prove every contour seam.'};
writeFileSync(resolve(root,docs+'/validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,pngBytes,failures:fail}));if(fail.length)process.exitCode=1;
