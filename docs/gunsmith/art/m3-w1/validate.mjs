// Run from any directory. This self-check uses Node built-ins and this art package only, never game code.
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,writeFileSync,statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canvas,rect,poly,decode,colors,blit } from './source/pixels.mjs';
import { assemble,assets,configurations,root,docs,incoming,m2,manifest,picture } from './source/assemble.mjs';
if(manifest.stage==='P0+P1'){await import('./source/validate-full.mjs');process.exit(process.exitCode??0);}
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks=[],run=(name,fn)=>{try {const detail=fn();checks.push({name,status:'pass',...(detail===undefined?{}:{detail})});}catch(e){checks.push({name,status:'fail',error:e.message});}};
const originals=JSON.parse(readFileSync(resolve(root,docs+'/source/pixel-artwork.json')));
const saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json')));
const parts=['S03','H03','P04','B07','M05','S04','H04','P03','A08','G08','M07'];
run('P0 exact inventory: AK-74 20 + eleven attachments 42 = 62',()=>{
  assert.equal(manifest.assets.length,62);assert.equal(new Set(manifest.assets.map(a=>a.id)).size,62);
  assert.equal(manifest.assets.filter(a=>a.gun==='akb74').length,20);
  assert.deepEqual([...new Set(manifest.assets.filter(a=>a.role==='part').map(a=>a.item))].sort(),parts.toSorted());
  const expected=[];for(const stem of ['receiver','stock-factory','reargrip-factory','mag-factory','barrel-factory','handguard-factory'])for(const code of ['h','i','w'])expected.push(`gs-akb74-${stem}-${code}-v1`);
  expected.push('gs-akb74-q24-v1','gs-akb74-q32-v1');
  for(const id of parts)for(const code of ['i','w','q24',...(['P03','P04'].includes(id)?[]:['h'])])expected.push(`gs-${id.toLowerCase()}-${code}-v1`);
  assert.deepEqual(manifest.assets.map(a=>a.id).sort(),expected.sort());
  assert.deepEqual(readdirSync(resolve(root,incoming)).filter(f=>f.endsWith('.png')).sort(),manifest.assets.map(a=>a.id+'.png').sort());
});
for(const a of manifest.assets)run(a.id,()=>{
  assert.equal(a.file,`${incoming}/${a.id}.png`);const b=readFileSync(resolve(root,a.file)),c=decode(resolve(root,a.file));
  assert.deepEqual([c.w,c.h,b.length,sha(b),colors(c)],[a.w,a.h,a.bytes,a.sha256,a.colors]);
  let count=0;for(let i=3;i<c.data.length;i+=4){assert.ok(c.data[i]===0||c.data[i]===255,'binary alpha');if(c.data[i])count++;}assert.ok(count,'nonempty');
  assert.ok(a.colors<=(a.output==='bench'?12:8),'part palette');
  if(a.output.startsWith('icon')){const n=a.output==='icon24'?24:32;assert.deepEqual([a.w,a.h],[n,n]);}
  const point=(p,edge=false)=>{assert.equal(p.length,2);assert.ok(Number.isFinite(p[0])&&Number.isFinite(p[1]));assert.ok(p[0]>=0&&p[0]<(edge?a.w+1:a.w)&&p[1]>=0&&p[1]<a.h,JSON.stringify(p)+' in canvas');};
  if(a.anchor){point(a.anchor);assert.ok(a.anchor.every(Number.isInteger));assert.equal(c.data[(a.anchor[1]*c.w+a.anchor[0])*4+3],255,'attachment anchor must touch artwork');}
  for(const p of Object.values(a.mounts??{})){point(p);assert.ok(p.every(Number.isInteger));}
  if(a.tip)point(a.tip,true);if(a.grip)point(a.grip);if(a.hand)point(a.hand);
  const source=originals.assets.find(s=>s.id===a.id);assert.ok(source,'native source recipe');const replay=canvas(source.w,source.h);
  for(const op of source.ops){if(op[0]==='r')rect(replay,...op.slice(1));else if(op[0]==='p')poly(replay,...op.slice(1));else assert.fail('unknown draw operation');}
  assert.ok(replay.data.equals(c.data),'source replays byte-for-byte at pixel level');
});
run('W artwork is independently drawn; W/I mounts and anchors agree within 2px',()=>{
  const reports=[];for(const a of manifest.assets.filter(a=>a.output==='bench')){
    const key=a.id.replace('-w-v1','-i'),i=assets.get(key),small=picture(key),large=picture(a.id.replace('-v1',''));
    assert.ok(i);let different=0;for(let y=0;y<large.h;y++)for(let x=0;x<large.w;x++){
      const p=large.data.subarray((y*large.w+x)*4,(y*large.w+x)*4+4),sx=Math.floor(x/2),sy=Math.floor(y/2);
      const q=sx<small.w&&sy<small.h?small.data.subarray((sy*small.w+sx)*4,(sy*small.w+sx)*4+4):Buffer.alloc(4);if(!p.equals(q))different++;
    }assert.ok(different>0,'W cannot be nearest-neighbor I: '+a.id);
    for(const [name,p] of Object.entries({...a.mounts,...(a.anchor?{anchor:a.anchor}:{}),...(a.hand?{hand:a.hand}:{})})){
      const q=name==='anchor'?i.anchor:name==='hand'?i.hand:i.mounts[name];assert.ok(q,name);assert.ok(p.every((v,j)=>Math.abs(v-q[j]*2)<=2),a.id+' '+name);}
    reports.push({id:a.id,pixelsDifferentFromScaledI:different});
  }return reports;
});
const assemblies=[];
for(const configuration of Object.keys(configurations))for(const code of ['h','i','w'])run(`${configuration} ${code} assembly`,()=>{
  const {record:r,image,nodes}=assemble(configuration,code),expected=saved.assemblies.find(a=>a.configuration===configuration&&a.code===code);
  assert.deepEqual(r,expected);const preview=decode(resolve(root,docs+`/preview/akb74-${configuration}-${code}-1x.png`));assert.ok(preview.data.equals(image.data));
  const limits=code==='h'?[48,16]:code==='i'?[144,26]:[288,52];assert.ok(r.w<=limits[0]&&r.h<=limits[1],`${r.w}x${r.h} <= ${limits}`);
  assert.ok(r.colors<=(code==='w'?24:16));if(code==='h'){assert.equal(r.tip[1],r.bore,'tip stays on bore');if(configuration==='factory'){assert.ok(r.w>=28&&r.w<=34);assert.ok(r.h<=11);}}
  // Every attached part must touch its parent silhouette (8-neighbour), rather than float across a transparent gap.
  for(const n of nodes.filter(n=>n.parent&&!n.label.startsWith('glove'))){const child=picture(n.key),parent=picture(n.parent.key);let touches=false;
    for(let y=0;y<child.h&&!touches;y++)for(let x=0;x<child.w&&!touches;x++)if(child.data[(y*child.w+x)*4+3]){
      const px=x+n.x-n.parent.x,py=y+n.y-n.parent.y;for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++)if(px+u>=0&&px+u<parent.w&&py+v>=0&&py+v<parent.h&&parent.data[((py+v)*parent.w+px+u)*4+3])touches=true;
    }assert.ok(touches,`${n.key} touches ${n.parent.key}`);
  }
  if(code==='h')for(const n of nodes.filter(n=>['under','side1','side2'].includes(n.label))){const p=picture(n.key),origin=r.layers.find(l=>l.key===n.key).origin;
    for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(p.data[(y*p.w+x)*4+3])assert.ok(origin[0]+x<r.tip[0],'device cannot extend past muzzle');}
  assemblies.push({configuration,code,w:r.w,h:r.h,colors:r.colors,tip:r.tip});return{size:[r.w,r.h],colors:r.colors};
});
run('bare factory for ground / HUD has no glove layers',()=>{const {record,image}=assemble('factory','h',false);assert.deepEqual(record,saved.bareFactory);assert.ok(!record.layers.some(l=>l.label.startsWith('glove')));
  for(const s of [1,2]){const c=canvas(image.w*s,image.h*s);blit(c,image,0,0,s);assert.ok(c.data.equals(decode(resolve(root,docs+`/preview/akb74-factory-ground-hud-${s}x.png`)).data));}});
run('M2 source images are unchanged and retain manifest hashes',()=>{for(const a of m2.assets)assert.equal(sha(readFileSync(resolve(root,a.file))),a.sha256,a.id);return{files:m2.assets.length};});
run('previews and generated design reference below 1 MiB each',()=>{
  for(const f of readdirSync(resolve(root,docs+'/preview')))if(f.endsWith('.png'))assert.ok(statSync(resolve(root,docs+'/preview',f)).size<1048576,f);
  assert.ok(statSync(resolve(root,docs+'/source/akb74-design-reference.png')).size<1048576);
});
const pngBytes=manifest.assets.reduce((s,a)=>s+a.bytes,0);run('byte totals',()=>{assert.equal(pngBytes,manifest.totals.pngBytes);return{p0Bytes:pngBytes,m2Bytes:m2.totals.pngBytes,cumulativeBytes:pngBytes+m2.totals.pngBytes,firstWaveBudgetBytes:88*1024};});
const failures=checks.filter(c=>c.status==='fail');const report={schema:1,stage:'P0',status:failures.length?'fail':'pass',passed:checks.length-failures.length,failed:failures.length,checks,assemblies,legacyReconstruction:{status:'not-applicable',reason:'P0 adds AK-74 only. Old pistol/shotgun/carbine splits belong to P1; no legacy images replaced.'},visualReview:'Manual inspection required for silhouette recognition and single-ink seams; not claimed by geometric touch checks.'};
writeFileSync(resolve(root,docs+'/validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,pngBytes,failures}));if(failures.length)process.exitCode=1;
