/** Read-only six-table and event/HUD inspection of named V8 snapshots. No silent absent-table fallback. */
import assert from 'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
const [out,...files]=process.argv.slice(2);assert(out&&files.length,'output snapshot...');
const required=['graphics','graphicsContext','glBuffer','glTexture','glGeometry','tilingSprite'];const rows=[];
for(const file of files){
 const bytes=await readFile(file),s=JSON.parse(bytes.toString()),f=s.snapshot.meta.node_fields,n=f.length,ef=s.snapshot.meta.edge_fields,en=ef.length;
 const index=(fields,key)=>{const at=fields.indexOf(key);assert(at>=0,'snapshot field missing '+key);return at;};
 const T=index(f,'type'),N=index(f,'name'),ID=index(f,'id'),SZ=index(f,'self_size'),EC=index(f,'edge_count'),ET=index(ef,'type'),EN=index(ef,'name_or_index'),TO=index(ef,'to_node'),types=s.snapshot.meta.node_types[0],ets=s.snapshot.meta.edge_types[0];
 const count=s.nodes.length/n,starts=new Uint32Array(count+1);for(let i=0,e=0;i<count;i++){starts[i]=e;e+=s.nodes[i*n+EC]*en;}starts[count]=s.edges.length;
 const d=i=>({id:s.nodes[i*n+ID],type:types[s.nodes[i*n+T]],name:s.strings[s.nodes[i*n+N]],selfSize:s.nodes[i*n+SZ]});
 const edges=i=>{const a=[];for(let e=starts[i];e<starts[i+1];e+=en){const type=ets[s.edges[e+ET]],v=s.edges[e+EN];a.push({type,key:['element','hidden'].includes(type)?String(v):s.strings[v],to:s.edges[e+TO]/n});}return a;};
 const prop=(i,key)=>edges(i).find(e=>e.type==='property'&&e.key===key)?.to;
 const indexed=i=>edges(i).filter(e=>e.type==='element'||e.type==='property'&&/^\d+$/.test(e.key));
 const candidates=[],pointerEvents=[],wheelEvents=[],hud=[],ownerCounts={};let eventSystems=0;
 for(let i=0;i<count;i++){
  const a=d(i);if(!['object','native'].includes(a.type))continue;
  if(a.type==='object'&&/^_?EventSystem\d?$/.test(a.name))eventSystems++;
  if(a.type==='object'&&/^_?Federated(Pointer|Wheel)Event\d?$/.test(a.name)){const at=prop(i,'nativeEvent'),value=at===undefined?null:d(at),row={event:a,nativeEvent:value,nativePresent:!!value&&!['null','undefined'].includes(value.name)};(/Pointer/.test(a.name)?pointerEvents:wheelEvents).push(row);}
  if(a.type==='native'&&/cs-hud/.test(a.name))hud.push(a);
  if(a.type==='object'&&/^_?(CoastSampleHost|CoastView|CoastRaidRuntime|InventoryPanel|Textures|Atlas|Fx|Lighting|Weather|Tide|SampleSound|Scope)\d?$/.test(a.name))ownerCounts[a.name]=(ownerCounts[a.name]||0)+1;
  const list=prop(i,'_managedResourceHashes');if(list===undefined)continue;
  assert.equal(d(list).name,'Array',file+' managed registration list changed');const registered=indexed(list);assert(registered.length>0,file+' empty registration list');const tables=[];
  for(const entry of registered){const context=prop(entry.to,'context'),hash=prop(entry.to,'hash');assert(context!==undefined&&hash!==undefined,'descriptor fields missing');const nameAt=prop(context,'name');assert(nameAt!==undefined,'context.name missing');const name=d(nameAt).name,hashName=d(hash).name,items=prop(context,hashName);assert(items!==undefined,name+'.'+hashName+' absent');assert.equal(d(items).type,'object',name+' table shape changed');assert.equal(d(items).name,'Object',name+' table no longer a record');const values=indexed(items),empty=values.filter(v=>d(v.to).name==='null').length;const backing=edges(items).find(e=>e.type==='internal'&&e.key==='elements');
   tables.push({name,hash:hashName,context:d(context),items:d(items),backing:backing?d(backing.to):null,keys:values.length,empty,live:values.length-empty,nonNullValues:values.filter(v=>d(v.to).name!=='null').map(v=>d(v.to)).slice(0,8)});
  }
  assert.equal(new Set(tables.map(t=>t.name)).size,tables.length,'duplicate registrations');for(const name of required)assert(tables.some(t=>t.name===name),'required registration missing '+name);candidates.push({gc:a,list:d(list),tables});
 }
 assert.equal(candidates.length,1,file+' must observe exactly one parked Pixi GC registry');assert(eventSystems>0,file+' EventSystem absent (cannot infer cleared)');assert(pointerEvents.length>=2,file+' pointer roots absent (cannot infer cleared)');assert(wheelEvents.length>=1,file+' wheel root absent (cannot infer cleared)');
 const row={file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),registry:candidates[0],eventSystems,pointerEvents,wheelEvents,oldHudNativeNodes:hud,ownerCounts,status: candidates[0].tables.every(t=>t.empty===0)&&hud.length===0&&[...pointerEvents,...wheelEvents].every(e=>!e.nativePresent)?'passed':'failed'};rows.push(row);console.log(JSON.stringify({file,status:row.status,tables:row.registry.tables.map(t=>({name:t.name,live:t.live,empty:t.empty,keys:t.keys,backing:t.backing?.selfSize||0})),oldHud:hud.length,pointerNative:pointerEvents.filter(e=>e.nativePresent).length,ownerCounts}));
}
await writeFile(out,JSON.stringify({method:'All six registrations via GCSystem._managedResourceHashes -> descriptor.context[descriptor.hash]; absent/changed structures throw. Numeric keys and backing self_size are V8 graph observations, not GPU allocation. Native DOM cs-hud labels only, no string matches. Native-event absence valid only with EventSystem and both pointer roots and wheel root observed. Owner pin/release is an independent positive control.',rows},null,2)+'\n');if(rows.some(r=>r.status!=='passed'))process.exitCode=1;
