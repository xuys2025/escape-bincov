// Extract only shader labels/ids/hashes from existing snapshots; no source/save string contents are emitted.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {unpack} from './astra-r7-heap-graph.mjs';
import {buildNames} from './station-resource-build-map.mjs';
// --html=<build that produced the snapshots> (default dist/index.html); --rounds=0,30,60 (default) names round-N snapshots.
const [root,out]=process.argv.slice(2).filter(a=>!a.startsWith('--'));if(!out)throw Error('snapshot directory and output required');
const html=await readFile(process.argv.find(a=>a.startsWith('--html='))?.slice(7)??'dist/index.html','utf8');
const build=buildNames(html),cacheEdge='context:'+build.idHash;
if(existsSync(`${root}/report.json`)&&JSON.parse(await readFile(`${root}/report.json`,'utf8')).buildSHA256!==build.sha256)throw Error('Snapshots were recorded with another build');
const rounds=(process.argv.find(a=>a.startsWith('--rounds='))?.slice(9)??'0,30,60').split(',').map(Number);
const samples=[];
for(const round of rounds){
 const raw=await readFile(`${root}/round-${round}.heapsnapshot`),s=JSON.parse(raw),f=s.snapshot.meta.node_fields,n=f.length;
 const g=unpack(s),caches=[];
 for(let i=0;i<g.count;i++)for(let e=g.starts[i];e<g.starts[i+1];e++)if(g.edgeName(e)===cacheEdge)caches.push(g.targets[e]);
 const unique=[...new Set(caches)];if(unique.length!==1)throw Error('Expected one build-specific createIdFromString cache '+cacheEdge);
 const cacheIds=new Set();
 const queue=[[unique[0],0]];
 for(const [i,depth] of queue){const d=g.describe(i);if(d.type.includes('string')){cacheIds.add(d.id);continue;}if(depth>=2)continue;for(let e=g.starts[i];e<g.starts[i+1];e++){const name=g.edgeName(e);if(depth===0&&name!=='internal:properties')continue;if(name.startsWith('internal:'))queue.push([g.targets[e],depth+1]);}}
 const types=s.snapshot.meta.node_types[0],T=f.indexOf('type'),N=f.indexOf('name'),ID=f.indexOf('id'),SZ=f.indexOf('self_size'),rows=[];
 for(let i=0;i<s.nodes.length;i+=n){const type=types[s.nodes[i+T]],value=s.strings[s.nodes[i+N]];
  if(!type.includes('string')||value.length>15000||!value.includes('#define SHADER_NAME '))continue;
  rows.push({id:s.nodes[i+ID],type,bytes:s.nodes[i+SZ],idHashKey:cacheIds.has(s.nodes[i+ID]),labels:[...value.matchAll(/#define SHADER_NAME\s+(\S+)/g)].map(m=>m[1]),previewSHA256:createHash('sha256').update(value).digest('hex')});
 }
 const keys=rows.filter(r=>r.idHashKey);
 samples.push({round,sha256:createHash('sha256').update(raw).digest('hex'),count:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0),cache:{id:g.ids[unique[0]],keys:keys.length,bytes:keys.reduce((n,r)=>n+r.bytes,0)},rows});
}
const report={buildSHA256:build.sha256,cacheVariable:build.idHash,rounds,method:'Same object id across snapshots; string names <15000 chars containing SHADER_NAME. V8 can truncate string names: previewSHA256 hashes the snapshot preview, not complete shader source. idHashKey requires the direct cache variable -> internal properties -> string path; the variable is derived from createIdFromString and verified per build SHA (station-resource-build-map.mjs). Full strong root path in owners-0-60.json. Counts are not GPU shader programs.',samples,changes:[]};
for(const [i,j] of samples.length===3?[[0,1],[1,2],[0,2]]:[[0,samples.length-1]]){const a=samples[i],b=samples[j],old=new Set(a.rows.map(r=>r.id)),now=new Set(b.rows.map(r=>r.id)),added=b.rows.filter(r=>!old.has(r.id)),removed=a.rows.filter(r=>!now.has(r.id));report.changes.push({from:a.round,to:b.round,deltaCount:b.count-a.count,deltaBytes:b.bytes-a.bytes,addedCount:added.length,addedBytes:added.reduce((n,r)=>n+r.bytes,0),removedCount:removed.length,added,removed});}
await writeFile(out,JSON.stringify(report,null,2));console.log({out,samples:samples.map(({rows,...s})=>s),changes:report.changes.map(({added,removed,...r})=>r)});
