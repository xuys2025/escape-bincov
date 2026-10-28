// Independent package check. Uses only Node built-ins, images and saved art metadata.
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,writeFileSync,statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canvas,rect,poly,decode,colors } from './source/pixels.mjs';
import { root,docs,incoming,manifest,baseline,assets,picture,configurations,assemble,scaled,previewStem } from './source/assemble.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
const run=(name,fn)=>{try{const detail=fn();checks.push({name,status:'pass',...(detail===undefined?{}:{detail})});}catch(e){checks.push({name,status:'fail',error:e.message});}};
const source=JSON.parse(readFileSync(resolve(root,docs+'/source/pixel-artwork.json'))),saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json')));
const parts=['A03','B02','B04','B10','H10','S06','S09','S10','P05','P08','G02','G04','G05','G11','G12','M04','M08','M09','M12','F08','O02','O04','O05','O06','O07','O12','O09','O10','O11','F02','F04','F05','F06','F07','T02','T03','T06','T07','T09','T10'];
const newGuns=['mb1911','umpb45','pb90','svdb','mb14','mb700','augb','rpkb'],factory={umpb45:['barrel','stock','reargrip','mag'],pb90:['mag'],mb14:['stock','mag'],mb700:['barrel','stock'],augb:['mag'],rpkb:['handguard','stock','reargrip','mag']};
const cols={mb1911:2,umpb45:3,pb90:2,svdb:5,mb14:5,mb700:5,augb:3,rpkb:5,pistol:2,shotgun:4,carbine:4,mb4a1:4,akb74:4,vb9:2};
run('249 PNG exact full-wave inventory; flat directory and manifest bijection',()=>{
 assert.equal(manifest.batch,'M3-W2');assert.equal(manifest.stage,'P0+P1');assert.equal(manifest.assets.length,249);assert.equal(new Set(manifest.assets.map(a=>a.id)).size,249);
 const expected=[];for(const gun of newGuns){for(const code of ['h','i','w'])expected.push(`gs-${gun}-receiver-${code}-v1`);for(const code of ['q24','q32'])expected.push(`gs-${gun}-${code}-v1`);for(const part of factory[gun]??[])for(const code of ['h','i','w'])expected.push(`gs-${gun}-${part}-factory-${code}-v1`);}
 for(const id of parts)for(const code of ['i','w','q24',...(['P05','P08'].includes(id)?[]:['h'])])expected.push(`gs-${id.toLowerCase()}-${code}-v1`);
 for(const gun of ['pistol','shotgun','carbine'])expected.push(`gs-${gun}-bare-h-v1`);for(const ammo of ['ammo45','ammopdw','ammoheavy'])for(const code of ['q24','q32'])expected.push(`gs-${ammo}-${code}-v1`);assert.equal(expected.length,249);
 assert.deepEqual(manifest.assets.map(a=>a.id).sort(),expected.sort());assert.deepEqual(readdirSync(resolve(root,incoming)).sort(),[...expected.map(id=>id+'.png'),'manifest.json'].sort());
});
for(const a of manifest.assets)run(a.id,()=>{
 const b=readFileSync(resolve(root,a.file)),c=decode(resolve(root,a.file));assert.equal(a.file,`${incoming}/${a.id}.png`);assert.deepEqual([c.w,c.h,b.length,sha(b),colors(c)],[a.w,a.h,a.bytes,a.sha256,a.colors]);
 let opaque=0;for(let i=3;i<c.data.length;i+=4){assert.ok(c.data[i]===0||c.data[i]===255,'binary alpha');if(c.data[i])opaque++;}assert.ok(opaque,'nonempty');assert.ok(a.colors<=(a.role==='bare'?16:a.output==='bench'?12:8),'color cap '+a.colors);
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
 const limit=code==='h'?[48,16]:code==='i'?[cols[gun]*36,26]:[cols[gun]*72,52];assert.ok(r.w<=limit[0]&&r.h<=limit[1],`${r.w}x${r.h} <= ${limit}`);assert.ok(r.colors<=(code==='w'?24:16));
 for(const s of code==='w'?[1,2]:[1,3])assert.ok(scaled(image,s).data.equals(decode(resolve(root,docs+`/preview/${previewStem(gun,name,code)}-${s}x.png`)).data),'exact preview pixels');
 if(code==='h'){assert.equal(r.tip[1],r.bore);if(name==='factory'&&newGuns.includes(gun)){const range=gun==='mb1911'?[15,18]:['pb90','umpb45'].includes(gun)?[22,27]:gun==='augb'?[26,26]:[34,38];assert.ok(r.w>=range[0]&&r.w<=range[1]);assert.ok(r.h<=11);}}
 // The shared anchor must cover one parent pixel. Preview inspection also checks the contour around that seam.
 for(const n of nodes.filter(n=>n.parent&&!n.label.startsWith('glove'))){const c=picture(n.key),parent=picture(n.parent.key);let touches=false;
  for(let y=0;y<c.h&&!touches;y++)for(let x=0;x<c.w&&!touches;x++)if(c.data[(y*c.w+x)*4+3]){
   const px=n.x+x-n.parent.x,py=n.y+y-n.parent.y;for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++)if(px+u>=0&&py+v>=0&&px+u<parent.w&&py+v<parent.h&&parent.data[((py+v)*parent.w+px+u)*4+3])touches=true;
  }assert.ok(touches,n.key+' does not float away from '+n.parent.key);
 }
 if(code==='h')for(const n of nodes.filter(n=>['under','side1','side2','bipod'].includes(n.label))){const c=picture(n.key),at=r.layers.find(l=>l.key===n.key).origin;for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++)if(c.data[(y*c.w+x)*4+3])assert.ok(at[0]+x<r.tip[0],'device stays behind tip');}
 sizes.push({gun,configuration:name,code,size:[r.w,r.h],colors:r.colors});return{size:[r.w,r.h],colors:r.colors};
});
run('AUG bullpup magazine behind grip; F04 hand behind forward stop',()=>{
 for(const code of ['h','i','w']){const a=assets.get(`gs-augb-receiver-${code}`),mag=assets.get(`gs-augb-mag-factory-${code}`),f=assets.get(`gs-f04-${code}`);assert.equal(mag.layer,'aboveReceiver');assert.ok(f.hand[0]<f.w-2);if(code==='h')assert.ok(a.mounts.mag[0]+mag.w<a.grip[0]);}
});
for(const gun of newGuns)run(gun+' bare ground/HUD image has no gloves and exact 1x/2x previews',()=>{const {record,image}=assemble(gun,'factory','h',false);assert.deepEqual(record,saved.bareFactories.find(a=>a.gun===gun));assert.ok(!record.layers.some(l=>l.label.startsWith('glove')));for(const s of [1,2])assert.ok(scaled(image,s).data.equals(decode(resolve(root,docs+`/preview/${gun}-factory-ground-hud-${s}x.png`)).data));});
run('419 formal images and manifest plus approved P0 32 retain original hashes',()=>{
 const lock=JSON.parse(readFileSync(resolve(root,docs+'/source/baseline-lock.json'))),p0=JSON.parse(readFileSync(resolve(root,docs+'/source/p0-lock.json')));assert.equal(lock.assets.length,419);assert.equal(p0.assets.length,32);assert.equal(sha(readFileSync(resolve(root,'assets/gunsmith/manifest.json'))),lock.manifestSha256);for(const a of [...lock.assets,...p0.assets])assert.equal(sha(readFileSync(resolve(root,a.file))),a.sha256,a.id);for(const a of p0.historicalPreviews)for(const file of [a.file,a.source])assert.equal(sha(readFileSync(resolve(root,file))),a.sha256);return{formalFiles:419,p0Files:32,historicalPreviews:2};
});
run('RPK shares the AK family joint coordinates, and front gloves follow d3eb43f',()=>{
 for(const c of ['h','i','w'])for(const gun of ['akb74','akb103']){const a=assets.get(`gs-rpkb-receiver-${c}`),b=assets.get(`gs-${gun}-receiver-${c}`);for(const name of ['mount','stock','rearGrip','mag','handguard'])assert.deepEqual(a.mounts[name],b.mounts[name]);assert.ok(!a.mounts.barrel);assert.deepEqual(assets.get('gs-f08-'+c).anchor,[0,0]);}
 for(const c of ['h','i','w'])for(const stem of ['pb90-mag-factory','augb-mag-factory','g02','g05'])assert.equal(assets.get(`gs-${stem}-${c}`).layer,'aboveReceiver');for(const c of ['i','w'])assert.equal(assets.get('gs-p08-'+c).layer,'aboveReceiver');for(const id of ['P05','P08'])assert.ok(!manifest.assets.some(a=>a.item===id&&a.output==='held'));
 for(const gun of ['pb90','augb'])assert.ok(assemble(gun,'factory','h').record.layers.some(l=>l.label==='glove-front'));
});
const repairs=JSON.parse(readFileSync(resolve(root,docs+'/source/bare-repairs.json')));
for(const patch of repairs.guns)run(patch.gun+' bare has zero difference outside explicit hand masks',()=>{
 const before=decode(resolve(root,patch.original)),after=picture('gs-'+patch.gun+'-bare-h');assert.deepEqual([before.w,before.h],[after.w,after.h]);assert.equal(sha(readFileSync(resolve(root,patch.original))),patch.originalSha256);const mask=new Set(),palette=new Set();for(let i=0;i<before.data.length;i+=4)if(before.data[i+3])palette.add(before.data.subarray(i,i+3).toString('hex'));for(const [x,y,w,h]of patch.masks)for(let v=y;v<y+h;v++)for(let u=x;u<x+w;u++)mask.add(v*before.w+u);
 const changed=[];for(let j=0;j<before.w*before.h;j++){if(after.data[j*4+3])assert.ok(palette.has(after.data.subarray(j*4,j*4+3).toString('hex')),'original palette');if(!before.data.subarray(j*4,j*4+4).equals(after.data.subarray(j*4,j*4+4))){assert.ok(mask.has(j));changed.push([j%before.w,Math.floor(j/before.w)]);}}assert.ok(changed.length);assert.deepEqual(changed,patch.changedPixels);assert.equal(colors(after),patch.palette);assert.deepEqual(saved.bareFactories.find(r=>r.gun===patch.gun).layers,[{key:'gs-'+patch.gun+'-bare-h',label:'bare',origin:[0,0]}]);return{changedPixels:changed.length,outsideMaskDifference:0,colors:patch.palette};
});
run('Native held/world and UI palette; W alone may add its middle tones',()=>{
 for(const a of manifest.assets.filter(a=>a.role!=='bare')){const c=decode(resolve(root,a.file)),allowed=new Set(Object.values(source.assets.find(s=>s.id===a.id).palette).map(c=>c.replace('#','')));for(let i=0;i<c.data.length;i+=4)if(c.data[i+3])assert.ok(allowed.has(c.data.subarray(i,i+3).toString('hex')),a.id);}
});
run('Preview/source images below one MiB; icon grayscale silhouettes distinct',()=>{
 for(const sub of ['preview','source'])for(const f of readdirSync(resolve(root,docs+'/'+sub)))if(f.endsWith('.png'))assert.ok(statSync(resolve(root,docs+'/'+sub,f)).size<1048576,f);
 for(const output of ['icon24','icon32']){const icons=manifest.assets.filter(a=>a.output===output),hashes=icons.map(a=>sha(scaled(picture(a.id.replace('-v1','')),1,true).data));assert.equal(new Set(hashes).size,icons.length,'duplicates: '+icons.filter((a,i)=>hashes.indexOf(hashes[i])!==i).map(a=>a.id).join(','));}
});
run('All six ammunition families distinguish in grayscale at Q24 and Q32',()=>{
 const legacy=JSON.parse(readFileSync(resolve(root,docs+'/source/legacy-ammo.json')));for(const n of [24,32]){const pictures=legacy.images.filter(a=>a.n===n).map(a=>{const c=canvas(n,n);for(const o of a.ops)rect(c,...o.slice(1));return c;});for(const item of ['ammo45','ammopdw','ammoheavy'])pictures.push(picture(`gs-${item}-q${n}`));assert.equal(pictures.length,6);assert.equal(new Set(pictures.map(p=>sha(scaled(p,1,true).data))).size,6);}
});
for(const gun of newGuns)run(gun+' designated A/B profiles differ at native held scale',()=>{const names=Object.keys(configurations[gun]).filter(n=>!['factory','reuse'].includes(n)),a=assemble(gun,names[0],'h'),b=assemble(gun,names[1],'h');assert.notDeepEqual([a.image.w,a.image.h],[b.image.w,b.image.h]);assert.notEqual(sha(a.image.data),sha(b.image.data));});
for(const [gun,configs]of Object.entries(configurations))for(const name of Object.keys(configs))run(gun+'/'+name+' exact body alignment',()=>{const h=assemble(gun,name,'h'),body=decode(resolve(root,'assets/coast/v1/coast-player-body-e-f0-v1.png')),person=canvas(112,72);for(let y=0;y<body.h;y++)for(let x=0;x<body.w;x++){const j=(y*body.w+x)*4;if(body.data[j+3])rect(person,[...body.data.subarray(j,j+4)],16+x,4+y,1,1);}const origin=[32+h.record.forward-h.record.grip[0],Math.round(30-h.record.bore)];for(let y=0;y<h.image.h;y++)for(let x=0;x<h.image.w;x++){const j=(y*h.image.w+x)*4;if(h.image.data[j+3])rect(person,[...h.image.data.subarray(j,j+4)],origin[0]+x,origin[1]+y,1,1);}for(const s of [1,3])assert.ok(scaled(person,s).data.equals(decode(resolve(root,docs+`/preview/${gun}-${name}-body-${s}x.png`)).data));});
run('Held close and steady silhouettes distinct at 1x',()=>{const a=assemble('augb','close','h').image,b=assemble('augb','steady','h').image;assert.notDeepEqual([a.w,a.h],[b.w,b.h]);assert.notEqual(sha(a.data),sha(b.data));});
const pngBytes=manifest.assets.reduce((s,a)=>s+a.bytes,0);
run('Byte accounting deduplicates the 32 P0 images already formally integrated',()=>{assert.equal(manifest.totals.files,249);assert.equal(manifest.totals.pngBytes,pngBytes);assert.equal(baseline.assets.reduce((s,a)=>s+a.bytes,0),baseline.totals.pngBytes);const known=new Set(baseline.assets.map(a=>a.id)),pending=manifest.assets.filter(a=>!known.has(a.id));assert.equal(pending.length,217);assert.equal(manifest.totals.cumulativeUniqueFiles,636);assert.equal(manifest.totals.cumulativeUniquePngBytes,baseline.totals.pngBytes+pending.reduce((s,a)=>s+a.bytes,0));return manifest.totals;});
const fail=checks.filter(c=>c.status==='fail'),report={schema:1,stage:'P0+P1',status:fail.length?'fail':'pass',passed:checks.length-fail.length,failed:fail.length,checks,assemblies:sizes,oldBareSprites:{status:'checked',palettePolicy:'Three legacy bare roles are whole guns: H combined cap 16, original-color-only, original canvas and every pixel outside explicit hand masks invariant. All new single parts still obey H/I/Q 8, W 12.'},visualReview:'Native 1x and enlarged sheets, three backgrounds, grayscale and body scale reviewed. Anchor contact checks do not by themselves prove every contour seam.'};
writeFileSync(resolve(root,docs+'/validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,pngBytes,failures:fail}));if(fail.length)process.exitCode=1;
