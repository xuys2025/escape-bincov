// Standalone art validation: Node built-ins and local PNG/compositor only, no game code.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {canvas,blit,colors,decode,dot} from './source/pixels.mjs';
import {rows,embedded} from './source/design.mjs';
import {root,docs,formal,incoming,oldAssets,newAssets,picture,assemble} from './source/assemble.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),checks=[],measurements=[];
const check=(name,fn)=>{try{const evidence=fn();checks.push({name,status:'pass',...(evidence?{evidence}:{})});}catch(e){checks.push({name,status:'fail',error:e.message});}};
const lock=JSON.parse(readFileSync(resolve(root,docs+'/source/baseline-lock.json'))),art=JSON.parse(readFileSync(resolve(root,docs+'/source/pixel-artwork.json'))),saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json')));
const stems=['mb4a1-mag-factory','akb74-mag-factory','akb103-mag-factory','mpb5-mag-factory','umpb45-mag-factory','augb-mag-factory','mb14-mag-factory','rpkb-mag-factory','g01','g02','g03','g04','g08','g09','g10','g11','g12','svdb-receiver','vb9-receiver'];
check('Exactly 19 requested components / 38 v2 PNGs, bijection with manifest',()=>{
 assert.equal(incoming.schema,1);assert.equal(incoming.batch,'M3-W3');assert.equal(incoming.assets.length,38);
 const expected=stems.flatMap(s=>['i','w'].map(c=>`gs-${s}-${c}-v2`)).sort();assert.deepEqual(incoming.assets.map(a=>a.id).sort(),expected);
 const files=readdirSync(resolve(root,'assets/gunsmith/incoming/m3-w3'));assert.deepEqual(files.toSorted(),['manifest.json',...expected.map(x=>x+'.png')].sort());
});
check('Formal manifest, all accepted PNGs (including H/Q) and virtual metadata remain unchanged',()=>{
 assert.equal(hash(readFileSync(resolve(root,'assets/gunsmith/manifest.json'))),lock.manifestSha256);
 assert.deepEqual(formal.virtual,lock.virtual);
 for(const a of lock.assets)assert.equal(hash(readFileSync(resolve(root,a.file))),a.sha256,a.id);
 return {formalPngs:lock.assets.length,formalBytes:formal.assets.reduce((n,a)=>n+a.bytes,0)};
});
for(const a of incoming.assets)check(a.id,()=>{
 const b=readFileSync(resolve(root,a.file)),c=decode(resolve(root,a.file)),key=a.id.replace(/-v\d+$/,''),old=oldAssets.get(key),code=a.output==='inventory'?'i':'w';
 assert.equal(a.file,`assets/gunsmith/incoming/m3-w3/${a.id}.png`);assert.equal(hash(b),a.sha256);assert.equal(b.length,a.bytes);assert.equal(a.replacesSha256,old.sha256);assert.equal(a.revision,2);
 assert.deepEqual([c.w,c.h],[a.w,a.h]);assert.equal(colors(c),a.colors);assert.ok(a.colors<=(code==='i'?8:12));
 let opaque=0;for(let p=3;p<c.data.length;p+=4){assert.ok([0,255].includes(c.data[p]));if(c.data[p])opaque++;}assert.ok(opaque);
 for(const field of ['gun','item','role','slot','anchor','mounts','tip','hand','grip','bore','forward','layer','wholeCanvasLayer'])assert.deepEqual(a[field],old[field],field+' unchanged');
 if(a.anchor){const [x,y]=a.anchor;assert.ok(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<a.w&&y<a.h);assert.equal(c.data[(y*c.w+x)*4+3],255);}
 for(const p of Object.values(a.mounts??{}))assert.ok(p[0]>=0&&p[1]>=0&&p[0]<a.w&&p[1]<a.h);
 const source=art.assets.find(s=>s.id===a.id),replay=canvas(source.w,source.h);for(const [x,y,w,rgba]of source.rgbaRuns)for(let i=0;i<w;i++)dot(replay,x+i,y,Array.from(Buffer.from(rgba,'hex')));assert.deepEqual(replay.data,c.data,'Native source replay');
 assert.notEqual(a.sha256,old.sha256,'Asset was actually redrawn');
 if(a.role==='receiver'){
  assert.equal(a.w,old.w);const s=embedded[a.gun+'-receiver'][code].mask,original=picture(old);let changed=0;
  for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++){
   const q=c.data.subarray((y*c.w+x)*4,(y*c.w+x)*4+4),p=y<original.h?original.data.subarray((y*original.w+x)*4,(y*original.w+x)*4+4):Buffer.alloc(4);
   if(!q.equals(p)){changed++;assert.ok(x>=s[0]&&x<s[0]+s[2]&&y>=s[1]&&y<s[1]+s[3],'Receiver changed outside magazine mask');}
  }assert.ok(changed);return {bytes:a.bytes,colors:a.colors,changedPixelsInsideMagazine:changed};
 }
 return {bytes:a.bytes,colors:a.colors};
});
for(const stem of stems)check(stem+' W is not a nearest-neighbor enlargement of I',()=>{
 const i=picture(newAssets.get(`gs-${stem}-i`)),w=picture(newAssets.get(`gs-${stem}-w`)),scaled=canvas(i.w*2,i.h*2);blit(scaled,i,0,0,2);
 let different=0;if(scaled.w!==w.w||scaled.h!==w.h)different=-1;else for(let p=0;p<w.data.length;p+=4)if(!w.data.subarray(p,p+4).equals(scaled.data.subarray(p,p+4)))different++;
 assert.notEqual(different,0);return {differentPixels:different};
});
for(const [index,row]of rows.entries())for(const part of row.variants)for(const code of ['i','w'])check(`${row.gun}/${part??'factory'}/${code} bounds, exposure, seams, assembly`,()=>{
 const {image,nodes,record}=assemble(row.gun,part,code),prior=assemble(row.gun,part,code,false),factor=code==='i'?1:2;
 assert.ok(image.w<=row.size[0]*36*factor&&image.h<=row.size[1]*26*factor);assert.ok(record.colors<=(code==='i'?16:24));
 assert.equal(image.w,prior.image.w,'Gun length unchanged');assert.deepEqual(record.tip,prior.record.tip,'Muzzle unchanged');
 const expected=saved.assemblies.find(a=>a.gun===row.gun&&a.part===(part??'factory')&&a.code===code);for(const field of ['layers','w','h','tip'])assert.deepEqual(record[field],expected[field]);
 let bottom=-1;const mag=nodes.find(n=>n.label==='mag'),receiver=nodes.find(n=>n.label==='receiver');
 if(mag){
  const p=picture(mag.a);for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(p.data[(y*p.w+x)*4+3])bottom=Math.max(bottom,mag.y+y);
  // Feed interface touches the receiver with no gap. Sample visible neck interior: at most one ink row at the join.
  const parent=picture(receiver.a),limit=Math.min(p.w,code==='i'?5:10);let connected=false,singleLine=0;
  for(let x=1;x<limit;x++){
   const xx=mag.x+x;let edge=-1;for(let y=Math.max(0,mag.y-2);y<=Math.min(parent.h-1,mag.y+factor*4);y++)if(parent.data[(y*parent.w+xx)*4+3])edge=y;
   for(let y=0;y<Math.min(p.h,4*factor+2);y++)if(p.data[(y*p.w+x)*4+3]&&Math.abs(mag.y+y-edge)<=1)connected=true;
   if(edge<0||mag.a.layer==='aboveReceiver')continue;
   const ink=yy=>{if(yy<0)return false;const rootPixel=yy<parent.h?parent.data.subarray((yy*parent.w+xx)*4,(yy*parent.w+xx)*4+4):Buffer.alloc(4),my=yy-mag.y,mp=my>=0&&my<p.h?p.data.subarray((my*p.w+x)*4,(my*p.w+x)*4+4):Buffer.alloc(4),v=rootPixel[3]?rootPixel:mp;return v[3]===255&&v.subarray(0,3).toString('hex')==='122027';};
   if((ink(edge)&&!ink(edge+1))||(!ink(edge)&&ink(edge+1)&&!ink(edge+2)))singleLine++;
  }assert.ok(connected,'Feed interface connected');if(mag.a.layer!=='aboveReceiver')assert.ok(singleLine>0,'Single ink row at feed lip');
 }else{const stem=row.gun+'-receiver',m=embedded[stem][code].box,p=picture(receiver.a);for(let y=m[1];y<m[1]+m[3];y++)for(let x=m[0];x<m[0]+m[2];x++)if(p.data[(y*p.w+x)*4+3])bottom=Math.max(bottom,y);}
 const lip=code==='i'?row.lip:embedded[row.gun+'-receiver']?.w.lip??row.lip*2+1,exposure=bottom-lip;
 assert.ok(Math.abs(exposure-row.target*factor)<=2*factor,`Exposed height ${exposure}, target ${row.target*factor}`);
 measurements.push({row:index+1,gun:row.gun,part:part??'factory',code,exposure,target:row.target*factor,delta:exposure-row.target*factor,size:[image.w,image.h],limit:[row.size[0]*36*factor,row.size[1]*26*factor],colors:record.colors});
 return measurements.at(-1);
});
check('18 comparison previews, complete overview, color and grayscale sheets',()=>{assert.equal(saved.previews.length,18);assert.equal(saved.assemblies.length,42);for(const p of saved.previews){const b=readFileSync(resolve(root,docs,p.file));assert.ok(b.length<1024*1024);decode(resolve(root,docs,p.file));}for(const name of ['magazine-overview.png','contact-color.png','contact-gray.png'])assert.ok(readFileSync(resolve(root,docs+'/preview/'+name)).length<1024*1024);});
check('Manifest totals match actual files',()=>{assert.equal(incoming.totals.count,38);assert.equal(incoming.totals.bytes,incoming.assets.reduce((n,a)=>n+a.bytes,0));return incoming.totals;});
const failed=checks.filter(c=>c.status==='fail'),report={schema:1,batch:'M3-W3',status:failed.length?'fail':'pass',baseline:{head:lock.codeHead,main:lock.main},totals:incoming.totals,checks:checks.length,passed:checks.length-failed.length,failed:failed.length,measurements,results:checks,scope:'Standalone incoming-art validation. Runtime importer rehearsal is separate. Maintainer visual acceptance and in-game integration remain outstanding.'};
writeFileSync(resolve(root,docs+'/validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,passed:report.passed,failed:report.failed,bytes:report.totals.bytes,failures:failed}));if(failed.length)process.exitCode=1;
