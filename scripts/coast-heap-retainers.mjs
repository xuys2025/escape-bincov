// Strong root paths are examples, not dominators or an exclusive attribution of heap growth.
// Usage: node scripts/coast-heap-retainers.mjs <first.heapsnapshot> <last.heapsnapshot> <report.json>
import {readFile,writeFile} from 'node:fs/promises';
const [first,last,out]=process.argv.slice(2);if(!out)throw Error('Expected two snapshot paths and report path');
const a=JSON.parse(await readFile(first,'utf8')),b=JSON.parse(await readFile(last,'utf8'));
const f=b.snapshot.meta.node_fields,n=f.length,T=f.indexOf('type'),N=f.indexOf('name'),ID=f.indexOf('id'),EC=f.indexOf('edge_count');
const ef=b.snapshot.meta.edge_fields,en=ef.length,ET=ef.indexOf('type'),EN=ef.indexOf('name_or_index'),TO=ef.indexOf('to_node');
const types=b.snapshot.meta.node_types[0],ets=b.snapshot.meta.edge_types[0],count=b.nodes.length/n;
const starts=new Uint32Array(count+1);for(let i=0;i<count;i++)starts[i+1]=starts[i]+b.nodes[i*n+EC]*en;
const parent=new Int32Array(count).fill(-1),via=new Uint32Array(count),queue=new Uint32Array(count);parent[0]=0;queue[0]=0;let tail=1;
for(let head=0;head<tail;head++){const i=queue[head];for(let e=starts[i];e<starts[i+1];e+=en){if(ets[b.edges[e+ET]]==='weak')continue;const to=b.edges[e+TO]/n;if(parent[to]>=0)continue;parent[to]=i;via[to]=e;queue[tail++]=to;}}
const oldIds=new Set();for(let i=0;i<a.nodes.length;i+=n)oldIds.add(a.nodes[i+ID]);
const describe=i=>({id:b.nodes[i*n+ID],type:types[b.nodes[i*n+T]],name:types[b.nodes[i*n+T]].includes('string')?'(string content omitted)':b.strings[b.nodes[i*n+N]].slice(0,100)});
function path(i){const p=[];for(let steps=0;steps<40;steps++){const d=describe(i);if(i===0||parent[i]<0){p.push(d);break;}const e=via[i],t=ets[b.edges[e+ET]],v=b.edges[e+EN];d.via=t+':'+(['element','hidden'].includes(t)?v:b.strings[v]);p.push(d);i=parent[i];}return p.reverse();}
const owners=[],examples=[];const groups=new Map();
for(let i=0;i<count;i++){const d=describe(i);if(d.type==='object'&&/^_?(CoastRaidRuntime|CoastSampleHost|CoastView)\d?$/.test(d.name))owners.push({...d,path:path(i)});
 if(d.type==='native'&&/^(LargestContentfulPaint|LayoutShift|PerformanceLongAnimationFrameTiming)$/.test(d.name)&&!oldIds.has(d.id)){
 groups.set(d.name,(groups.get(d.name)||0)+1);if(!examples.some(e=>e.name===d.name))examples.push({...d,strongRootReachable:parent[i]>=0,path:path(i)});
 }}
const report={method:'BFS shortest strong root path (weak edges excluded); not a dominator retained-size calculation',limitations:'Two snapshots cannot prove bounded caches, exclusively attribute JIT/VM metadata, or measure GPU/driver memory. No universal heap allowance is inferred.',owners,newPerformanceNodes:Object.fromEntries(groups),examples};
await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({owners:owners.length,newPerformanceNodes:report.newPerformanceNodes,examples:examples.map(e=>({name:e.name,reachable:e.strongRootReachable}))}));
