// Test-only identity/ownership probe. WeakMap/WeakRef never keep a game resource alive.
export function installProbe() {
  const r = window.__station.host.app.renderer;
  let next = 1;
  const ids = new WeakMap(), registrations = new WeakMap();
  const id = o => { if (!o || typeof o !== 'object') return null; if (!ids.has(o)) ids.set(o, next++); return ids.get(o); };
  const proto = Object.getPrototypeOf(r.gc._managedResourceHashes[0].context), add = proto.add;
  proto.add = function(o) {
    const result = add.call(this, o);
    if (result && !registrations.has(o)) registrations.set(o, {phase: window.__resourcePhase, table: this.name,
      stack: new Error().stack.split('\n').slice(2, 9).map(s => s.slice(0, 240))});
    return result;
  };
  window.__resourceProbe = {id, registrations, restore: () => { proto.add = add; }};
}

export function inventory({paths = false} = {}) {
  const h = window.__station.host, s = h.scene, r = h.app.renderer, p = window.__resourceProbe;
  const id = p.id;
  const textures = [...s.textures].map(([key,t]) => ({key, id:id(t), uid:t.uid, source:id(t.source), sourceUid:t.source.uid, width:t.width,height:t.height}));
  const names = new Map([...s.textures].map(([k,t]) => [t.source,k]));
  const walls = [...s.wallCellTextures].map(([t,frames]) => ({key:names.get(t.source),base:id(t),source:id(t.source),frames:frames.map(f=>id(f)),count:frames.length}));
  const targets = new Map(), rows = [];
  for (const d of r.gc._managedResourceHashes) for (const [key,o] of Object.entries(d.context[d.hash])) {
    const row = {table:d.context.name,key,live:!!o}; rows.push(row);
    if (!o) continue;
    Object.assign(row,{id:id(o),uid:o.uid,type:o.constructor.name,label:o.label??o.descriptor?.label??null,
      bytes:o.data?.byteLength??o.descriptor?.size??null,textureKey:names.get(o)??null,
      destroyed:o.destroyed??null,creation:p.registrations.get(o)??null});
    if (d.context.name === 'glBuffer' || d.context.name === 'glGeometry') targets.set(o,row);
  }
  // Find a renderer-owned route independent of GC tables/listeners (otherwise every object trivially has a manager path).
  if (paths) {
    const queue = [[r,'renderer',0]], seen = new WeakSet([r]);
    const skip = /^(gc|_managed.*|_events|_gpuData|_renderer|renderer|_parent|parent|children|resource|_resource|texture|_texture)$/;
    for (let i=0;i<queue.length && i<120000;i++) {
      const [o,path,depth] = queue[i];
      if(targets.has(o)) targets.get(o).ownerPath=path;
      if(depth>=10 || ArrayBuffer.isView(o) || o instanceof ArrayBuffer || o instanceof Node) continue;
      const entries = o instanceof Map ? [...o].map(([k,v])=>['Map('+String(k).slice(0,40)+')',v]) : Object.entries(Object.getOwnPropertyDescriptors(o)).filter(([,d])=>'value' in d).map(([k,d])=>[k,d.value]);
      for(const [k,v] of entries) if(!skip.test(k) && v && typeof v==='object' && !seen.has(v)) {seen.add(v);queue.push([v,path+'.'+k,depth+1]);}
    }
  }
  return {textures,walls,rows,masonry:s.masonry.size,rendererId:id(r),sceneId:id(s),
    batches:Object.keys(r.renderPipes.batch._batchersByInstructionSet),buffers:rows.filter(x=>x.table==='glBuffer'),geometries:rows.filter(x=>x.table==='glGeometry')};
}

// Render-fixture prewarming, not a gameplay correctness test: real render(), all 8 player directions x idle/4 walk
// frames, both gates and the current actor poses/frames/rims; then the ordinary host renders again.
export async function warmVariants() {
  const h=window.__station.host,s=h.scene,original=s.render;
  let last;
  s.render=function(dt,state){last=state;return original.call(this,dt,state);};
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  s.render=original;
  if(!last) throw Error('No real SceneState observed');
  for(let dir8=0;dir8<8;dir8++)for(let walkFrame=0;walkFrame<=4;walkFrame++)original.call(s,0,{...last,gateOpen:walkFrame%2===0,player:{...last.player,dir8,walkFrame}});
  // Enumerate exactly the finite actor key domain in StationHost.updateActors for this unchanged facility fixture.
  // NPCs: home pose + four facing directions of idle/talk. Walkers: four directions of idle/walk. Sitters: fixed pose.
  const actors=[];
  for(const a of last.actors){
    const npc=['med','arms','radio','cook','blackmarket'].includes(a.id),walker=['bucket','porter'].includes(a.id);
    const variants=npc?[{dir:a.id==='med'?'s':a.id==='blackmarket'?'w':'n',pose:['med','blackmarket'].includes(a.id)?'idle':'work'},...['n','s','e','w'].flatMap(dir=>['idle','talk'].map(pose=>({dir,pose})))]:walker?['n','s','e','w'].flatMap(dir=>['idle','walk'].map(pose=>({dir,pose}))):[{dir:a.dir,pose:a.pose}];
    for(const v of variants)for(let frame=0;frame<(v.pose==='walk'?4:2);frame++){
      const b={...a,...v,frame};s.actorTex(b);if(npc)s.rimTex(b);actors.push({look:b.look,dir:b.dir,pose:b.pose,frame});
    }
  }
  // Upload every warmed source, including off-camera/currently unused variants; repeat after every action/restore.
  for(const t of s.textures.values())h.app.renderer.texture.bind(t.source);
  original.call(s,0,last);
  return {directions:8,playerFrames:5,gateStates:2,actors};
}

export function markRelease() {
  const h=window.__station.host,s=h.scene,r=h.app.renderer;
  window.__resourceReleased={host:new WeakRef(h),scene:new WeakRef(s),
    objects:[...s.textures.values(),...[...s.textures.values()].map(t=>t.source),...[...s.wallCellTextures.values()].flat(),s.worldRT,s.lightRT,s.glowRT].map(o=>new WeakRef(o)),
    managed:r.gc._managedResourceHashes.flatMap(d=>Object.entries(d.context[d.hash]).filter(([,o])=>o).map(([key,o])=>({table:d.context.name,key,ref:new WeakRef(o)})))};
}
export function checkRelease() {
  const w=window.__resourceReleased;
  if(!w) throw Error('Missing release marker');
  const remaining=w.objects.map(w=>w.deref()).filter(Boolean), s=w.scene.deref();
  return {hostAlive:!!w.host.deref(),sceneAlive:!!s,tracked:w.objects.length,collected:w.objects.length-remaining.length,
    liveUndestroyed:remaining.filter(o=>!o.destroyed).map(o=>({type:o.constructor.name,uid:o.uid})),
    sceneCaches:s?{textures:s.textures.size,walls:s.wallCellTextures.size,masonry:s.masonry.size,npc:s.npcCanvases.size}:null};
}
