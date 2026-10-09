import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionState,SaveSession} from '../src/session';
import {CoastRaidRuntime} from '../src/raid-runtime/runtime';
import {createRuntimeTestDriver} from '../src/raid-runtime/test-support';
import {SESSION_KEY,decodeSession} from '../src/recovery-store';
import * as D from '../src/domain';

test('R7-L5 existing classic and layered pickup reject flooded endpoints without writing, then accept after ebb',()=>{
 for(const layered of [false,true]){
  const state=createSessionState(),data=new Map<string,string>();let writes=0;
  const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{writes++;data.set(k,v);}}));
  assert(saves.initialize());state.state='hideout';assert(saves.beginRun(42,layered));state.state='run';
  const r=new CoastRaidRuntime(state,saves);r.freezeAI=true;const driver=createRuntimeTestDriver(r,'?test=1'),map=r.current().map;
  let spot:{wet:{x:number;y:number};dry:{x:number;y:number}}|undefined;
  for(let y=0;y<map.rows&&!spot;y++)for(let x=0;x<map.cols&&!spot;x++)if(map.cells[y][x]==='tide'){
   const wet={x:x*32+16,y:y*32+16};for(const [dx,dy]of [[-32,0],[32,0],[0,-32],[0,32]]){const dry={x:wet.x+dx,y:wet.y+dy};if(r.walkable(dry.x,dry.y,true,10)&&r.sight(wet,dry,false,layered?10:0)){spot={wet,dry};break;}}
  }
  assert(spot);driver.placePlayer(spot.dry);r.spawnLoot(spot.wet.x,spot.wet.y,'water',1);const uid=r.loot.at(-1)!.uid;
  const tide=(high:boolean)=>{if(layered){const s=r.snapshotExpansion(),q=s.raid!;q.highTide=high;q.tideChanged=high!==q.initialHigh;q.elapsed=q.tideChanged?300:0;q.warned=q.tideChanged;r.restoreExpansion(s);}else{const s=r.snapshot();s.highTide=high;s.tideChanged=high!==r.config.initialHigh;s.elapsed=s.tideChanged?300:0;s.warned=s.tideChanged;r.restore(s);}};
  tide(true);assert(r.checkpoint());const before=data.get(SESSION_KEY),n=writes,bag=structuredClone(state.loadout!.bag);
  assert(!r.nearbyLoot().some(l=>l.uid===uid));assert.equal(r.pickupLoot(uid),false);
  assert.equal(writes,n);assert.equal(data.get(SESSION_KEY),before);assert.deepEqual(state.loadout!.bag,bag);assert(r.loot.some(l=>l.uid===uid));assert(!r.current().events.some(e=>e.type==='looted'&&e.source===uid));
  tide(false);assert(r.nearbyLoot().some(l=>l.uid===uid));const count=D.count(state.loadout!.bag,'water');assert(r.pickupLoot(uid));assert.equal(D.count(state.loadout!.bag,'water'),count+1);assert(!r.loot.some(l=>l.uid===uid));
  assert.doesNotThrow(()=>decodeSession(data.get(SESSION_KEY)!));r.finish('abandon');r.dispose();
 }
});
