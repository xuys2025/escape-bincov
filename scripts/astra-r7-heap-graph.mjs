/** General directed-graph dominators, then V8 snapshot analysis. Weak snapshot edges excluded;
 * this is the recorded strong graph, not proof of exclusive native backing stores or ephemeron semantics.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function dominators(starts,targets,sizes){
 const n=sizes.length,seen=new Uint8Array(n),cursor=new Uint32Array(starts),stack=new Uint32Array(n),post=[];let top=0;stack[0]=0;seen[0]=1;
 while(top>=0){const u=stack[top];if(cursor[u]<starts[u+1]){const v=targets[cursor[u]++];if(!seen[v]){seen[v]=1;stack[++top]=v;}}else{post.push(u);top--;}}
 const order=post.reverse(),rank=new Int32Array(n).fill(-1),predStart=new Uint32Array(n+1);order.forEach((u,i)=>rank[u]=i);
 for(const u of order)for(let e=starts[u];e<starts[u+1];e++)predStart[targets[e]+1]++;
 for(let i=1;i<=n;i++)predStart[i]+=predStart[i-1];const pred=new Uint32Array(predStart[n]),next=new Uint32Array(predStart);
 for(const u of order)for(let e=starts[u];e<starts[u+1];e++)pred[next[targets[e]]++]=u;
 const idom=new Int32Array(n).fill(-1);idom[0]=0;
 const intersect=(a,b)=>{while(a!==b){while(rank[a]>rank[b])a=idom[a];while(rank[b]>rank[a])b=idom[b];}return a;};
 let changed=true,passes=0;while(changed){if(++passes>200)throw Error('Dominator convergence limit');changed=false;for(let i=1;i<order.length;i++){const u=order[i];let d=-1;for(let e=predStart[u];e<predStart[u+1];e++){const p=pred[e];if(idom[p]>=0)d=d<0?p:intersect(d,p);}if(d!==idom[u]){idom[u]=d;changed=true;}}}
 const retained=new Float64Array(sizes);for(let i=order.length-1;i>0;i--)retained[idom[order[i]]]+=retained[order[i]];
 return {idom,retained,reachable:order.length,passes};
}
function unpack(s){
 const f=s.snapshot.meta.node_fields,n=f.length,ef=s.snapshot.meta.edge_fields,en=ef.length;
 const T=f.indexOf('type'),N=f.indexOf('name'),ID=f.indexOf('id'),SZ=f.indexOf('self_size'),EC=f.indexOf('edge_count'),ET=ef.indexOf('type'),EN=ef.indexOf('name_or_index'),TO=ef.indexOf('to_node');
 const types=s.snapshot.meta.node_types[0],ets=s.snapshot.meta.edge_types[0],count=s.nodes.length/n;
 const starts=new Uint32Array(count+1),edgeStarts=new Uint32Array(count+1),sizes=new Float64Array(count),ids=new Float64Array(count);
 let strong=0;for(let i=0,e=0;i<count;i++){edgeStarts[i]=e;const end=e+s.nodes[i*n+EC]*en;for(;e<end;e+=en)if(ets[s.edges[e+ET]]!=='weak')strong++;starts[i+1]=strong;sizes[i]=s.nodes[i*n+SZ];ids[i]=s.nodes[i*n+ID];}edgeStarts[count]=s.edges.length;
 const targets=new Uint32Array(strong),rawEdges=new Uint32Array(strong);let at=0;
 for(let i=0;i<count;i++)for(let e=edgeStarts[i];e<edgeStarts[i+1];e+=en)if(ets[s.edges[e+ET]]!=='weak'){targets[at]=s.edges[e+TO]/n;rawEdges[at++]=e;}
 const describe=i=>{const type=types[s.nodes[i*n+T]],raw=s.strings[s.nodes[i*n+N]];return {id:ids[i],type,name:type.includes('string')?'(string content omitted)':raw.slice(0,120),selfSize:sizes[i]};};
 const edgeName=e=>{const raw=rawEdges[e],type=ets[s.edges[raw+ET]],v=s.edges[raw+EN];return type+':'+(['element','hidden'].includes(type)?v:s.strings[v]);};
 return {count,starts,targets,sizes,ids,describe,edgeName};
}
const tracked=/^_?(CoastSampleHost|CoastView|CoastRaidRuntime|InventoryPanel|Textures|Atlas|Fx|Lighting|Weather|Tide|SampleSound|SynthAudio|Scope|Application|WebGLRenderer|Sprite|Container|Graphics|Texture|TextureSource|CanvasSource|ImageSource|RenderTexture|HTMLCanvasElement|WebGL2RenderingContext)\d?$/;
const category=d=>d.type==='code'?'compiled-code':d.type==='object shape'?'VM-shape':d.type.includes('string')?'strings':d.type==='native'&&/Performance|LayoutShift|LargestContentfulPaint/.test(d.name)?'browser-performance-records':d.type==='native'?'other-native':tracked.test(d.name)?'named-render-runtime-objects':'other-JS-and-metadata';
export async function analyze(first,last,out){
 const a=unpack(JSON.parse(await readFile(first,'utf8'))),b=unpack(JSON.parse(await readFile(last,'utf8'))),oldIds=new Set(a.ids);
 const dom=dominators(b.starts,b.targets,b.sizes),parent=new Int32Array(b.count).fill(-1),via=new Uint32Array(b.count),queue=new Uint32Array(b.count);let tail=1;parent[0]=0;
 for(let head=0;head<tail;head++){const u=queue[head];for(let e=b.starts[u];e<b.starts[u+1];e++){const v=b.targets[e];if(parent[v]<0){parent[v]=u;via[v]=e;queue[tail++]=v;}}}
 const path=i=>{const rows=[];for(let steps=0;steps<60;steps++){rows.push({...b.describe(i),...(i?{via:b.edgeName(via[i])}:{})});if(!i||parent[i]<0)break;i=parent[i];}return rows.reverse();};
 const dchain=i=>{const rows=[];for(let step=0;step<60;step++){rows.push({...b.describe(i),graphRetainedBytes:dom.retained[i]});if(!i||dom.idom[i]<0)break;i=dom.idom[i];}return rows.reverse();};
 const summary=g=>{const groups={},categories={},owners={};let self=0;for(let i=0;i<g.count;i++){const d=g.describe(i),key=d.type+':'+d.name;const v=groups[key]??={count:0,bytes:0};v.count++;v.bytes+=d.selfSize;self+=d.selfSize;categories[category(d)]=(categories[category(d)]??0)+d.selfSize;if(['object','native'].includes(d.type)&&tracked.test(d.name))owners[d.name]=(owners[d.name]??0)+1;}return {self,groups,categories,owners};};
 const before=summary(a),after=summary(b),growth=[...new Set([...Object.keys(before.groups),...Object.keys(after.groups)])].map(key=>({key,countBefore:before.groups[key]?.count??0,countAfter:after.groups[key]?.count??0,deltaCount:(after.groups[key]?.count??0)-(before.groups[key]?.count??0),deltaBytes:(after.groups[key]?.bytes??0)-(before.groups[key]?.bytes??0)})).filter(v=>v.deltaCount||v.deltaBytes).sort((x,y)=>y.deltaBytes-x.deltaBytes);
 const top=[...Array(b.count).keys()].filter(i=>i&&parent[i]>=0&&!oldIds.has(b.ids[i])&&['object','native','array'].includes(b.describe(i).type)).sort((i,j)=>dom.retained[j]-dom.retained[i]).slice(0,30);
 const selected=new Set(top);
 const codeTop=[...Array(b.count).keys()].filter(i=>parent[i]>=0&&!oldIds.has(b.ids[i])&&b.describe(i).type==='code').sort((i,j)=>b.sizes[j]-b.sizes[i]).slice(0,3);codeTop.forEach(i=>selected.add(i));for(let i=0;i<b.count;i++){const d=b.describe(i);if((['object','native'].includes(d.type)&&tracked.test(d.name))||d.type==='native'&&/Performance|LayoutShift|LargestContentfulPaint/.test(d.name)&&!oldIds.has(d.id)){if([...selected].filter(x=>b.describe(x).name===d.name).length<3)selected.add(i);}}
 const report={first,last,method:'Cooper reverse-postorder immediate dominators on snapshot directed graph after removing weak edges; retained bytes sum reachable self_size in that graph. BFS shortest strong root paths separately. Strings omitted. Not a V8 native-memory/GPU retained-size measurement; ephemeron/shortcut edge treatment is limited to the graph recorded here. Retained examples overlap and MUST NOT be summed as attribution.',graph:{nodes:b.count,strongEdges:b.targets.length,reachable:dom.reachable,passes:dom.passes},before,after,growth:growth.slice(0,50),shrink:growth.slice(-20),categoryDeltas:Object.fromEntries([...new Set([...Object.keys(before.categories),...Object.keys(after.categories)])].map(k=>[k,(after.categories[k]??0)-(before.categories[k]??0)])),examples:[...selected].map(i=>({...b.describe(i),newSinceFirst:!oldIds.has(b.ids[i]),graphRetainedBytes:dom.retained[i],path:path(i),dominators:dchain(i)}))};
 delete report.before.groups;delete report.after.groups;await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,delta:after.self-before.self,categories:report.categoryDeltas,owners:after.owners,graph:report.graph}));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [a,b,out]=process.argv.slice(2);if(!out)throw Error('first last output required');await analyze(a,b,out);}
