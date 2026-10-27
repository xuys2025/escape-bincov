// Full first-wave self-check. No imports from src/, no project dependencies, no browser.
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,writeFileSync,statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canvas,rect,poly,blit,decode,colors } from './pixels.mjs';
import { root,docs,incoming,manifest,m2,assets,picture,assemble,configurations,newGuns } from './batch-assemble.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
const run=(name,fn)=>{try{const detail=fn();checks.push({name,status:'pass',...(detail===undefined?{}:{detail})});}catch(e){checks.push({name,status:'fail',error:e.message});}};
const originals=JSON.parse(readFileSync(resolve(root,docs+'/source/pixel-artwork.json'))),saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json'))),p0=JSON.parse(readFileSync(resolve(root,docs+'/source/p0-lock.json')));
const approval=JSON.parse(readFileSync(resolve(root,docs+'/source/legacy-palette-approval.json'))),approvedExceptions=[];
const parts=['A01','A02','A04','A05','A06','A08','B03','B05','B06','B07','B09','H02','H03','H04','H06','H07','H08','H09','S03','S04','S05','S07','S08','P03','P04','P06','P07','G03','G06','G07','G08','G09','M01','M02','M05','M07','M10','M11','T04','T08'];
run('exact first-wave inventory: 269 core images and five declared legacy variants',()=>{
 const expected=[];for(const gun of newGuns){for(const c of ['h','i','w'])expected.push(`gs-${gun}-receiver-${c}-v1`);for(const q of ['q24','q32'])expected.push(`gs-${gun}-${q}-v1`);}
 const factory={mpb5:['stock','mag','barrel','handguard'],mb870:['stock','reargrip','mag','barrel','handguard'],mb1014:['stock','reargrip','mag','barrel','handguard'],akb74:['stock','reargrip','mag','barrel','handguard'],akb103:['stock','reargrip','mag','barrel','handguard']};
 for(const [gun,slots]of Object.entries(factory))for(const s of slots)for(const c of ['h','i','w'])expected.push(`gs-${gun}-${s}-factory-${c}-v1`);
 for(const p of parts)for(const c of ['i','w','q24',...(['P03','P04','P06','P07'].includes(p)?[]:['h'])])expected.push(`gs-${p.toLowerCase()}-${c}-v1`);
 expected.push('gs-pistol-receiver-h-v1','gs-shotgun-receiver-h-v1','gs-carbine-receiver-h-v2','gs-carbine-receiver-w-v2','gs-carbine-barrel-factory-h-v1','gs-carbine-barrel-factory-w-v1');
 assert.equal(expected.length,269);const variants=['gs-m01-h-pistol-v1','gs-m01-i-pistol-v1','gs-m01-w-pistol-v1','gs-m05-h-carbine-v1','gs-m07-h-carbine-v1'];
 assert.deepEqual(manifest.assets.map(a=>a.id).sort(),[...expected,...variants].sort());assert.equal(new Set(manifest.assets.map(a=>a.id)).size,274);
 assert.deepEqual(readdirSync(resolve(root,incoming)).filter(f=>f.endsWith('.png')).sort(),manifest.assets.map(a=>a.id+'.png').sort());
 assert.deepEqual([...new Set(manifest.assets.map(a=>a.item).filter(Boolean))].sort(),parts.sort());return{core:269,variants:5,total:274};
});
for(const a of manifest.assets)run(a.id,()=>{
 assert.equal(a.file,`${incoming}/${a.id}.png`);const b=readFileSync(resolve(root,a.file)),c=decode(resolve(root,a.file));assert.deepEqual([c.w,c.h,b.length,sha(b),colors(c)],[a.w,a.h,a.bytes,a.sha256,a.colors]);
 let opaque=0;for(let i=3;i<c.data.length;i+=4){assert.ok(c.data[i]===0||c.data[i]===255,'binary alpha');if(c.data[i])opaque++;}assert.ok(opaque);
 const exception=a.id===approval.asset&&a.originalSource===approval.source&&a.colors===approval.colors&&sha(readFileSync(resolve(root,approval.source)))===approval.sourceSha256&&sha(c.data)===approval.rgbaSha256&&c.data.equals(decode(resolve(root,approval.source)).data);
 assert.ok(a.colors<=(a.output==='bench'?12:8)||exception,`${a.colors} colors exceed the single-image cap without the exact approved legacy original`);if(exception)approvedExceptions.push(approval);
 if(a.output.startsWith('icon')){const n=a.output==='icon24'?24:32;assert.deepEqual([a.w,a.h],[n,n]);}
 const point=(p,edge=false)=>{assert.ok(p.every(Number.isFinite));assert.ok(p[0]>=0&&p[0]<(edge?a.w+1:a.w)&&p[1]>=0&&p[1]<a.h,`${p} in ${a.w}x${a.h}`);};
 if(a.anchor){point(a.anchor);assert.ok(a.anchor.every(Number.isInteger));assert.equal(c.data[(a.anchor[1]*c.w+a.anchor[0])*4+3],255,'anchor on artwork');}
 for(const p of Object.values(a.mounts??{})){point(p);assert.ok(p.every(Number.isInteger));}for(const k of ['grip','hand','beam'])if(a[k])point(a[k]);if(a.tip)point(a.tip,true);
 const s=originals.assets.find(x=>x.id===a.id);assert.ok(s);const replay=canvas(s.w,s.h);for(const o of s.ops){if(o[0]==='r')rect(replay,...o.slice(1));else if(o[0]==='p')poly(replay,...o.slice(1));else assert.fail('source opcode');}assert.ok(replay.data.equals(c.data),'native source pixel replay');
});
run('all 62 P0 runtime files retain their delivered SHA-256',()=>{for(const a of p0.assets){const now=manifest.assets.find(x=>x.id===a.id);assert.equal(now.sha256,a.sha256);assert.equal(now.bytes,a.bytes);}return{files:62,sourceCommit:p0.sourceCommit};});
run('all 115 M2 runtime files retain their accepted SHA-256',()=>{for(const a of m2.assets)assert.equal(sha(readFileSync(resolve(root,a.file))),a.sha256);return{files:115};});
run('AK-74 and AK-103 receivers use exactly the same mount coordinates',()=>{for(const c of ['h','i','w'])assert.deepEqual(assets.get(`gs-akb74-receiver-${c}`).mounts,assets.get(`gs-akb103-receiver-${c}`).mounts);});
run('P07 is aboveReceiver and all four held rear-grip parts are omitted',()=>{for(const c of ['i','w'])assert.equal(assets.get(`gs-p07-${c}`).layer,'aboveReceiver');for(const id of ['p03','p04','p06','p07'])assert.ok(!assets.has(`gs-${id}-h`));});
run('W has its own native pixels and I/W metadata agree within two pixels',()=>{
 const report=[];for(const a of manifest.assets.filter(a=>a.output==='bench'&&newGuns.includes(a.gun)||a.output==='bench'&&a.item&&!a.variantFor)){
  const key=a.id.replace('-w-v1','-i'),i=assets.get(key);if(!i)continue;const small=picture(key),large=picture(a.id.replace(/-v\d+$/,''));let diff=0;
  for(let y=0;y<large.h;y++)for(let x=0;x<large.w;x++){const p=large.data.subarray((y*large.w+x)*4,(y*large.w+x)*4+4),sx=Math.floor(x/2),sy=Math.floor(y/2),q=sx<small.w&&sy<small.h?small.data.subarray((sy*small.w+sx)*4,(sy*small.w+sx)*4+4):Buffer.alloc(4);if(!p.equals(q))diff++;}
  assert.ok(diff>0,a.id+' cannot be an enlarged I');for(const [name,p]of Object.entries({...a.mounts,...(a.anchor?{anchor:a.anchor}:{}),...(a.hand?{hand:a.hand}:{})})){const q=name==='anchor'?i.anchor:name==='hand'?i.hand:i.mounts[name];assert.ok(q);assert.ok(p.every((v,j)=>Math.abs(v-q[j]*2)<=2),a.id+' '+name);}
  report.push({id:a.id,pixelsDifferentFromScaledI:diff});
 }return report;
});
const sizes=[],cols={pb226:2,mpb5:3,vb9:2,mb870:4,mb1014:4,akb74:4,akb103:4,pistol:2,shotgun:3,carbine:3,gb17:2,mb4a1:3};
for(const [gun,configs]of Object.entries(configurations))for(const name of Object.keys(configs))for(const code of ['h','i','w'])run(`${gun}/${name}/${code}`,()=>{
 const {record:r,image,nodes}=assemble(gun,name,code),expected=saved.assemblies.find(a=>a.gun===gun&&a.configuration===name&&a.code===code);assert.deepEqual(r,expected);
 const preview=decode(resolve(root,docs+`/preview/${gun}-${name}-${code}-1x.png`));assert.ok(preview.data.equals(image.data),'preview pixels');const limits=code==='h'?[48,16]:code==='i'?[cols[gun]*36,26]:[cols[gun]*72,52];assert.ok(r.w<=limits[0]&&r.h<=limits[1],`${r.w}x${r.h} exceeds ${limits}`);assert.ok(r.colors<=(code==='w'?24:16),'assembly palette');
 if(code==='h'){assert.equal(r.tip[1],r.bore,'tip stays on bore');if(name==='factory'&&newGuns.includes(gun)){const range=gun==='pb226'?[15,18]:['mpb5','vb9'].includes(gun)?[22,27]:gun.startsWith('mb')?[30,34]:[28,34];assert.ok(r.w>=range[0]&&r.w<=range[1]);assert.ok(r.h<=11);}}
 for(const n of nodes.filter(n=>n.parent&&!n.label.startsWith('glove'))){const child=picture(n.key),parent=picture(n.parent.key);let touches=false;for(let y=0;y<child.h&&!touches;y++)for(let x=0;x<child.w&&!touches;x++)if(child.data[(y*child.w+x)*4+3]){const px=x+n.x-n.parent.x,py=y+n.y-n.parent.y;for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++)if(px+u>=0&&px+u<parent.w&&py+v>=0&&py+v<parent.h&&parent.data[((py+v)*parent.w+px+u)*4+3])touches=true;}assert.ok(touches,n.key+' attached without a transparent gap');}
 if(code==='h')for(const n of nodes.filter(n=>['under','side1','side2','pistolSide'].includes(n.label))){const p=picture(n.key),origin=r.layers.find(l=>l.key===n.key).origin;for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(p.data[(y*p.w+x)*4+3])assert.ok(origin[0]+x<r.tip[0],n.key+' before muzzle');}
 sizes.push({gun,configuration:name,code,w:r.w,h:r.h,colors:r.colors});return{size:[r.w,r.h],colors:r.colors};
});
const reconstruction=[];
for(const gun of ['pistol','shotgun','carbine'])for(const code of ['h','i','w'])run(`${gun} legacy zero-pixel reconstruction ${code}`,()=>{
 const got=assemble(gun,'factory',code).image;let expected;
 if(code==='h')expected=decode(resolve(root,`assets/coast/v1/coast-weapon-${gun}-held-v1.png`));
 else if(code==='i'){const s=JSON.parse(readFileSync(resolve(root,docs+'/source/legacy-inventory.json'))).images[gun];expected=canvas(s.w,s.h);for(const o of s.ops)rect(expected,...o.slice(1));}
 else{const a=m2.assets.find(a=>a.id===`gs-${gun}-receiver-w-v1`);expected=decode(resolve(root,a.file));if(gun==='carbine'){const hg=m2.assets.find(a=>a.id==='gs-carbine-handguard-factory-w-v1');blit(expected,decode(resolve(root,hg.file)),88,16);}}
 assert.deepEqual([got.w,got.h],[expected.w,expected.h]);let diff=0;for(let i=0;i<got.data.length;i+=4)if(!got.data.subarray(i,i+4).equals(expected.data.subarray(i,i+4)))diff++;assert.equal(diff,0);reconstruction.push({gun,code,differentPixels:diff});return{differentPixels:diff};
});
run('carbine v2 replaces the exact accepted receiver hashes',()=>{for(const code of ['h','w']){const old=m2.assets.find(a=>a.id===`gs-carbine-receiver-${code}-v1`),now=manifest.assets.find(a=>a.id===`gs-carbine-receiver-${code}-v2`);assert.equal(now.replacesSha256,old.sha256);}});
run('seven new-gun ground/HUD outputs contain no glove layers',()=>{for(const gun of newGuns){const {record,image}=assemble(gun,'factory','h',false);assert.ok(!record.layers.some(l=>l.label.startsWith('glove')));for(const s of [1,2]){const expected=canvas(image.w*s,image.h*s);blit(expected,image,0,0,s);assert.ok(expected.data.equals(decode(resolve(root,docs+`/preview/${gun}-factory-ground-hud-${s}x.png`)).data));}}});
run('all preview PNGs below one MiB',()=>{let n=0,max=0;for(const f of readdirSync(resolve(root,docs+'/preview')))if(f.endsWith('.png')){const b=statSync(resolve(root,docs+'/preview',f)).size;assert.ok(b<1048576,f);max=Math.max(max,b);n++;}return{files:n,maxBytes:max};});
run('byte totals',()=>{const b=manifest.assets.reduce((s,a)=>s+a.bytes,0);assert.equal(b,manifest.totals.pngBytes);assert.ok(b<88*1024);return{pngBytes:b,m2Bytes:m2.totals.pngBytes,cumulativeBytes:b+m2.totals.pngBytes};});
const failed=checks.filter(c=>c.status==='fail'),report={schema:1,stage:'P0+P1',status:failed.length?'fail':'pass',passed:checks.length-failed.length,failed:failed.length,knownIssues:[],approvedExceptions,checks,assemblies:sizes,legacyReconstruction:reconstruction,visualReview:'Geometric contact does not certify a single-ink seam or silhouette recognition; inspect per-gun color/grayscale contact sheets and assembly previews.'};
writeFileSync(resolve(root,docs+'/validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,failures:failed,pngBytes:manifest.totals.pngBytes}));if(failed.length)process.exitCode=1;
