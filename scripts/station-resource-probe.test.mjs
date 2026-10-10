import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readManagedTables} from './pixi-managed-gate.mjs';
import {checkRelease} from './station-resource-probe.mjs';

test('resource gate refuses missing tables instead of reporting zero',()=>{
 const names=['graphics','graphicsContext','glBuffer','glTexture','glGeometry','tilingSprite'];
 const renderer={gc:{_running:false,_managedResourceHashes:names.map(name=>({context:{name,items:Object.create(null)},hash:'items'}))}};
 assert.equal(readManagedTables(renderer).live,0);
 renderer.gc._managedResourceHashes.splice(2,1);
 assert.throws(()=>readManagedTables(renderer),/required table glBuffer missing/);
});
test('release observer exposes an intentionally retained, undestroyed resource and nonempty scene cache',()=>{
 const resource={uid:77,destroyed:false},scene={textures:new Map([['kept',resource]]),wallCellTextures:new Map(),masonry:new Map(),npcCanvases:new Map()},host={scene};
 const before=globalThis.window;
 try{
  globalThis.window={__resourceReleased:{host:new WeakRef(host),scene:new WeakRef(scene),objects:[new WeakRef(resource)]}};
  const result=checkRelease();assert.equal(result.hostAlive,true);assert.equal(result.sceneAlive,true);assert.equal(result.collected,0);
  assert.equal(result.sceneCaches.textures,1);assert.deepEqual(result.liveUndestroyed,[{type:'Object',uid:77}]);
  resource.destroyed=true;scene.textures.clear();
  const destroyed=checkRelease();assert.deepEqual(destroyed.liveUndestroyed,[]);assert.equal(destroyed.collected,0);assert.equal(destroyed.sceneAlive,true);
  // Destruction must not be misreported as garbage collection.
 }finally{if(before===undefined)delete globalThis.window;else globalThis.window=before;}
});
