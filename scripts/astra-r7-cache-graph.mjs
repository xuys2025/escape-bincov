import {readFile,writeFile} from 'node:fs/promises';
const out=process.argv[2], files=process.argv.slice(3);if(!out||!files.length)throw Error('output snapshot...');
const rows=[];
for(const file of files){
 const s=JSON.parse(await readFile(file,'utf8')),f=s.snapshot.meta.node_fields,n=f.length,ef=s.snapshot.meta.edge_fields,en=ef.length;
 const T=f.indexOf('type'),N=f.indexOf('name'),ID=f.indexOf('id'),SZ=f.indexOf('self_size'),EC=f.indexOf('edge_count'),ET=ef.indexOf('type'),EN=ef.indexOf('name_or_index'),TO=ef.indexOf('to_node'),types=s.snapshot.meta.node_types[0],ets=s.snapshot.meta.edge_types[0];
 const starts=[];for(let i=0,e=0;i<s.nodes.length;i+=n){starts.push(e);e+=s.nodes[i+EC]*en;}starts.push(s.edges.length);
 const d=i=>({id:s.nodes[i*n+ID],type:types[s.nodes[i*n+T]],name:s.strings[s.nodes[i*n+N]],bytes:s.nodes[i*n+SZ]});
 const edges=i=>{const r=[];for(let e=starts[i];e<starts[i+1];e+=en){const t=ets[s.edges[e+ET]],v=s.edges[e+EN];r.push({type:t,key:['element','hidden'].includes(t)?String(v):s.strings[v],to:s.edges[e+TO]/n});}return r;};
 const prop=(i,key)=>edges(i).find(e=>e.key===key)?.to;
 const graphics=[], events=[], counts={};
 for(let i=0;i<starts.length-1;i++){
  const a=d(i);if(['object','native'].includes(a.type))counts[a.name]=(counts[a.name]||0)+1;
  if(a.type==='object'&&a.name==='GraphicsPipe'){
   const hash=prop(i,'_managedGraphics'),items=hash===undefined?undefined:prop(hash,'items');if(items===undefined)continue;
   const es=edges(items),back=es.find(e=>e.key==='elements'),values=es.filter(e=>e.type==='element'||e.type==='property'&&/^\d+$/.test(e.key));
   const nulls=values.filter(e=>d(e.to).name==='null');
   graphics.push({pipe:a,items:d(items),backing:back?d(back.to):null,indexEntries:values.length,nullEntries:nulls.length,nonNullValues:values.filter(e=>d(e.to).name!=='null').map(e=>d(e.to)).slice(0,8)});
  }
  if(a.type==='object'&&a.name==='FederatedPointerEvent'){const native=prop(i,'nativeEvent');events.push({event:a,native:native===undefined?null:d(native)});}
 }
 rows.push({file,graphics,pointerEvents:events,counts:Object.fromEntries(Object.entries(counts).filter(([k])=>/^(Coast|Tide$|Atlas$|Textures$|Scope$|InventoryPanel|SampleSound|PointerEvent$|GCManagedHash$|GraphicsPipe$)|cs-hud/.test(k)))});
}
await writeFile(out,JSON.stringify({method:'Read-only named snapshot inspection. Numeric indexed items and backing self_size, not native allocation; Null entries are identified by the native null singleton. Inspect pinned-vs-released separately.',rows},null,2)+'\n');console.log(JSON.stringify(rows));
