// Inspect retained shader-name strings from the two F20 snapshots; no heap snapshots are committed.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=(process.env.BINCOV_HEAP_OUT || 'test-results/sol-round3/heap')+'/';
const snapshots=await Promise.all([10,30].map(async cycle=>{const bytes=await readFile(root+'cycle-'+cycle+'.heapsnapshot');return{cycle,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,data:JSON.parse(bytes.toString())};}));
// Validate only the flat-table fields consumed below; extra V8 metadata/columns remain valid.
function validateSnapshot(s, cycle, incoming) {
 const fail=(path, expected)=>{throw Error(`Invalid heap snapshot cycle-${cycle}.${path}: expected ${expected}`);};
 const array=(v,path)=>{if(!Array.isArray(v))fail(path,'an array');return v;};
 const integer=(v,path)=>{if(!Number.isSafeInteger(v)||v<0)fail(path,'a nonnegative safe integer');};
 const fields=(v,path,required)=>{array(v,path);for(const name of required)if(v.filter(x=>x===name).length!==1)fail(path,`one ${name} field`);return v;};
 const nf=fields(s?.snapshot?.meta?.node_fields,'snapshot.meta.node_fields',['type','name','id','self_size',...(incoming?['edge_count']:[])]),n=nf.length;
 const types=array(s.snapshot.meta.node_types?.[nf.indexOf('type')],'snapshot.meta.node_types[type]');
 if(types.some(x=>typeof x!=='string'))fail('snapshot.meta.node_types[type]','string type names');
 const strings=array(s.strings,'strings');if(strings.some(x=>typeof x!=='string'))fail('strings','string entries');
 const nodes=array(s.nodes,'nodes');if(nodes.length%n)fail('nodes',`rows of ${n} fields`);
 const index=(value,table,path)=>{integer(value,path);if(value>=table.length)fail(path,'an in-range table index');};
 let edgeCount=0;const ids=new Set();
 for(let i=0;i<nodes.length;i+=n){
  index(nodes[i+nf.indexOf('type')],types,`nodes[${i}].type`);index(nodes[i+nf.indexOf('name')],strings,`nodes[${i}].name`);
  const id=nodes[i+nf.indexOf('id')];integer(id,`nodes[${i}].id`);if(ids.has(id))fail(`nodes[${i}].id`,'a unique node identity');ids.add(id);
  integer(nodes[i+nf.indexOf('self_size')],`nodes[${i}].self_size`);
  if(incoming){const count=nodes[i+nf.indexOf('edge_count')];integer(count,`nodes[${i}].edge_count`);edgeCount+=count;integer(edgeCount,'edge_count total');}
 }
 if(!incoming)return;
 const ef=fields(s.snapshot.meta.edge_fields,'snapshot.meta.edge_fields',['type','name_or_index','to_node']),en=ef.length;
 const et=array(s.snapshot.meta.edge_types?.[ef.indexOf('type')],'snapshot.meta.edge_types[type]');if(et.some(x=>typeof x!=='string'))fail('snapshot.meta.edge_types[type]','string type names');
 const edges=array(s.edges,'edges');if(edges.length%en||edges.length/en!==edgeCount)fail('edges','complete rows matching node edge_count total');
 for(let i=0;i<edges.length;i+=en){
  const type=edges[i+ef.indexOf('type')];index(type,et,`edges[${i}].type`);
  const to=edges[i+ef.indexOf('to_node')];integer(to,`edges[${i}].to_node`);if(to>=nodes.length||to%n)fail(`edges[${i}].to_node`,'an aligned node offset');
  const name=edges[i+ef.indexOf('name_or_index')];if(et[type]==='element'||et[type]==='hidden')integer(name,`edges[${i}].name_or_index`);else index(name,strings,`edges[${i}].name_or_index`);
 }
}
for(const {data,cycle} of snapshots)validateSnapshot(data,cycle,cycle===30);
const sumBytes=nodes=>{let total=0;for(const node of nodes){total+=node.bytes;if(!Number.isSafeInteger(total))throw Error('Invalid heap snapshot shader self_size total: expected a nonnegative safe integer');}return total;};
function shaderNodes(s){const f=s.snapshot.meta.node_fields,n=f.length,types=s.snapshot.meta.node_types[f.indexOf('type')],it=f.indexOf('type'),iname=f.indexOf('name'),is=f.indexOf('self_size'),iid=f.indexOf('id');const result=[];for(let i=0;i<s.nodes.length;i+=n){const type=types[s.nodes[i+it]],text=s.strings[s.nodes[i+iname]];if(!type.includes('string')||text.length>15000||!text.includes('#define SHADER_NAME '))continue;const shader=text.match(/#define SHADER_NAME\s+(\S+)/)?.[1];if(shader)result.push({index:i,id:s.nodes[i+iid],type,shader,bytes:s.nodes[i+is]});}return result;}
const [a,b]=snapshots.map(x=>shaderNodes(x.data)),ids=new Set(a.map(x=>x.id)),added=b.filter(x=>!ids.has(x.id));
const s=snapshots[1].data,nf=s.snapshot.meta.node_fields,n=nf.length,ef=s.snapshot.meta.edge_fields,en=ef.length,types=s.snapshot.meta.node_types[nf.indexOf('type')],et=s.snapshot.meta.edge_types[ef.indexOf('type')],ec=nf.indexOf('edge_count'),nt=nf.indexOf('type'),nn=nf.indexOf('name'),eid=nf.indexOf('id'),enam=ef.indexOf('name_or_index'),eto=ef.indexOf('to_node'),ety=ef.indexOf('type');
const label=i=>({id:s.nodes[i+eid],type:types[s.nodes[i+nt]],name:s.strings[s.nodes[i+nn]].slice(0,100)});
const targets=added.slice(0,2);let frontier=new Set(targets.map(x=>x.index)),paths=new Map(targets.map(x=>[x.index,[label(x.index)]])),ownerPaths=[];
for(let depth=0;depth<7&&frontier.size;depth++){const next=new Set();let edge=0;for(let i=0;i<s.nodes.length;i+=n){const count=s.nodes[i+ec];for(let k=0;k<count;k++,edge+=en){const to=s.edges[edge+eto],type=et[s.edges[edge+ety]];if(!frontier.has(to)||type==='weak')continue;const raw=s.edges[edge+enam],name=type==='element'||type==='hidden'?String(raw):(s.strings[raw]??String(raw));const path=[...paths.get(to),{edge:type+':'+name.slice(0,100),...label(i)}];if(!paths.has(i)){paths.set(i,path);next.add(i);if(/Context|global|Window/.test(label(i).name))ownerPaths.push(path);}}}frontier=next;if(ownerPaths.length>=2)break;}
const report={at:new Date().toISOString(),node:process.version,method:'Node-id comparison of string nodes containing exact SHADER_NAME defines in forced-GC unminified-page snapshots. Strong incoming edges only, at most 7 reverse hops. Not a proof that all retained heap bytes have this cause.',snapshots:snapshots.map(x=>({cycle:x.cycle,bytes:x.bytes,sha256:x.sha256})),shaderStrings:{cycle10:{count:a.length,bytes:sumBytes(a)},cycle30:{count:b.length,bytes:sumBytes(b)},newRetainedCount:added.length,newRetainedBytes:sumBytes(added),sample:added.slice(0,12).map(({index,...x})=>x)},ownerPaths:ownerPaths.slice(0,4)};
const libraryFiles=['node_modules/pixi.js/lib/rendering/renderers/shared/utils/createIdFromString.mjs','node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/setProgramName.mjs','node_modules/pixi.js/lib/rendering/renderers/gl/shader/GlProgram.mjs'];
report.library={name:'pixi.js',version:JSON.parse(await readFile('node_modules/pixi.js/package.json','utf8')).version,license:'MIT; existing third-party notices retained',sources:await Promise.all(libraryFiles.map(async file=>{const bytes=await readFile(file),lines=bytes.toString().split(String.fromCharCode(10)),selected=new Set();for(let i=0;i<lines.length;i++)if(/idHash|idCounts|nameCache|SHADER_NAME|destroy\(|programCache\[|createIdFromString\(/.test(lines[i]))for(let j=Math.max(0,i-1);j<Math.min(lines.length,i+4);j++)selected.add(j);return{file,sha256:createHash('sha256').update(bytes).digest('hex'),excerpt:[...selected].sort((a,b)=>a-b).map(i=>({line:i+1,text:lines[i].trimEnd()}))};}))};
await writeFile(root+'shader-cache.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.shaderStrings,null,2));console.log('owner paths',ownerPaths.length);
