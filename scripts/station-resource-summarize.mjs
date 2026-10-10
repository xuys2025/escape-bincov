// Promote compact observations, never raw heap contents. Full local evidence remains hash-addressed.
import {readFile,writeFile,mkdir,copyFile,readdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]??'test-results/astra-resource-r3');
const out=resolve(process.argv[3]??'docs/station-yard/astra-resource-r3-20261010/evidence');await mkdir(out,{recursive:true});
const json=p=>readFile(p,'utf8').then(JSON.parse),write=(name,x)=>writeFile(resolve(out,name),JSON.stringify(x,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const range=xs=>({min:Math.min(...xs),max:Math.max(...xs),first:xs[0],last:xs.at(-1)});
const slope=xs=>{const x=xs.map((_,i)=>i+1),mx=mean(x),my=mean(xs);return x.reduce((n,v,i)=>n+(v-mx)*(xs[i]-my),0)/x.reduce((n,v)=>n+(v-mx)**2,0);};
const summary={modes:{}};
for(const mode of ['remount','shared','context']){
 const r=await json(resolve(root,'long-'+mode,'report.json'));
 if(r.fatal||r.rows.length!==60)throw Error(mode+' incomplete');
 const heaps=r.rows.map(x=>x.counts.heap), keyHash=x=>hash(JSON.stringify(x.objects.textures.map(t=>t.key).sort()));
 const baselineHash=keyHash(r.baseline), resources={};
 for(const key of ['scene','wallFrameGroups','wallFrames','gpuTextures'])resources[key]=range(r.rows.map(x=>x.counts[key]));
 for(const t of r.baseline.counts.tables.tables)for(const k of ['live','empty'])resources[t.name+'.'+k]=range(r.rows.map(x=>x.counts.tables.tables.find(a=>a.name===t.name)[k]));
 const checks={allSameSceneKeys:r.rows.every(x=>keyHash(x)===baselineHash),allSameRenderer:r.rows.every(x=>x.objects.rendererId===r.baseline.objects.rendererId),
  allRetiredHostsCollected:mode==='context'?null:r.rows.every(x=>x.release?.hostAlive===false&&x.release?.sceneAlive===false),
  allTrackedResourcesCollected:mode==='context'?null:r.rows.every(x=>x.release?.collected===x.release?.tracked),
  noPageOrFrameErrors:r.errors.length===0&&r.frameAudit.length===0,noExternalRequests:r.external.length===0};
 const sharedQuad=mode==='shared'?{geometry:r.rows.map(x=>x.objects.geometries.find(o=>o.key==='0')),buffers:r.rows.map(x=>x.objects.buffers.filter(o=>['0','1','2'].includes(o.key)))}:null;
 if(sharedQuad){checks.sameQuadIdentity=sharedQuad.geometry.every(o=>o?.id===sharedQuad.geometry[0]?.id);checks.sameQuadBuffers=sharedQuad.buffers.every(bs=>bs.length===3&&bs.every(o=>o.id===sharedQuad.buffers[0].find(b=>b.key===o.key)?.id));}
 const v={mode,status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt,build:r.build,buildSHA256:r.buildSHA256,browser:r.browser,protocol:r.protocol,
  baseline:r.baseline.counts,rows:r.rows.map(x=>({label:x.label,counts:x.counts,sceneKeyHash:keyHash(x),release:x.release,action:x.action?.freed?{parked:x.action.parked,freed:{scene:x.action.freed.scene,framesObserved:x.action.freed.frames.length,allObservedFramesDestroyed:x.action.freed.frames.every(Boolean),sourcesObserved:x.action.freed.sources.length,allObservedSourcesDestroyed:x.action.freed.sources.every(Boolean)}}:x.action,
   emptyKeys:x.objects.rows.filter(o=>!o.live),sharedQuad:mode==='shared'?{geometry:x.objects.geometries.find(o=>o.key==='0'),buffers:x.objects.buffers.filter(o=>['0','1','2'].includes(o.key))}:undefined})),
  resources,checks,heap:{...range(heaps),baseline:r.baseline.counts.heap,endpointDelta:heaps.at(-1)-r.baseline.counts.heap,
   mean6to10:mean(heaps.slice(5,10)),mean56to60:mean(heaps.slice(55,60)),meanDelta:mean(heaps.slice(55,60))-mean(heaps.slice(5,10)),slopeBytesPerRound:slope(heaps),last30Slope:slope(heaps.slice(30)),units:'bytes / CDP Performance JSHeapUsedSize; not performance.memory or GPU memory'},
  strictFailures:r.strictFailures,ownershipFailures:r.ownershipFailures,snapshots:r.snapshots,afterFinalRemount:r.afterFinalRemount?.counts,finalRelease:r.release};
 await write('long-'+mode+'.json',v);summary.modes[mode]={heap:v.heap,resources,checks,status:v.status,strictFailures:r.strictFailures.length,ownershipFailures:r.ownershipFailures.length};
}
await copyFile(resolve(root,'sol-r-repro','report.json'),resolve(out,'sol-r-repro.json'));
const probe=await json(resolve(root,'identity-probe','report.json'));
for(const name of ['cold','first-return','restore-1','restore-2','restore-3','final-remount'])await copyFile(resolve(root,'identity-probe',name+'-identities.json'),resolve(out,'identity-'+name+'.json'));
await write('identity-summary.json',{status:probe.status,strictFailures:probe.strictFailures,firstAction:probe.firstAction,release:probe.release,
 added:probe.firstReturn.objects.textures.filter(t=>!probe.initial.objects.textures.some(s=>s.key===t.key)),removed:probe.initial.objects.textures.filter(t=>!probe.firstReturn.objects.textures.some(s=>s.key===t.key))});
await write('summary.json',summary);
const index=[];
async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await visit(path);else if(/\.(json|heapsnapshot|mjs|txt)$/.test(entry.name)){const bytes=await readFile(path);index.push({path,bytes:bytes.length,sha256:hash(bytes)});}}}
await visit(root);await write('local-raw-index.json',index);
console.log(JSON.stringify(summary,null,2));
