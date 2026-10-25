import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionState,SaveSession} from '../src/session';
import {decodeSession,SESSION_KEY} from '../src/recovery-store';
import {CoastRaidRuntime,emptyIntent} from '../src/raid-runtime/runtime';
import {BLOCKADE_POSTS,BLOCKADE_SQUAD,BLOCKADE_WAIT,BLOCKADE_WAIT_POINT,BLOCKADE_PASSAGE,blockadeProgram,blockadePassageAllowed} from '../src/enemy-blockade';
import {initialTactics} from '../src/enemy-archetypes';
import {damageLayerEnemy} from '../src/layer-transition';
import {canonicalBehavior} from './fixtures/enemy-benchmark';
import {firstAvailableSlot} from '../src/loot';
import {BUILDING_WORLD} from '../src/building-world';
import {WORLD} from '../src/world';
import {corridor,spacePath,traversable} from '../src/spatial';

function fixture(seed=49,legacy=false) {
    let denied=false;const data=new Map<string,string>(),state=createSessionState();
    const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(denied)throw Error('quota');data.set(k,v);}}),undefined,()=>1800000000000);
    assert.ok(saves.initialize());state.state='hideout';assert.ok(saves.beginRun(seed,true,{legacyEnemies:legacy}),state.storageError);
    state.expansion!.raid!.player={...BLOCKADE_WAIT_POINT,rotation:0};assert.ok(saves.persist());state.state='run';
    const runtime=new CoastRaidRuntime(state,saves);
    return {data,state,saves,runtime,deny:(v:boolean)=>{denied=v;},get raid(){return state.expansion!.raid!;},get raw(){return data.get(SESSION_KEY)!;}};
}
type Fixture=ReturnType<typeof fixture>;
const team=(f:Fixture)=>f.runtime.enemies.filter(e=>e.tactics?.squad===BLOCKADE_SQUAD);
const captain=(f:Fixture)=>team(f).find(e=>e.id==='blockade-sergeant')!;
const program=(f:Fixture)=>blockadeProgram(captain(f))!;
function step(f:Fixture,seconds:number) {
    for(let i=0;i<Math.ceil(seconds/.05);i++) {f.runtime.elapsed+=.05;for(const e of team(f).filter(e=>e.hp>0))f.runtime.updateEnemy(e,.05);}
}
function ask(f:Fixture) {
    const target=f.runtime.targetView();assert.equal(target?.kind,'talk');return f.runtime.activate(target!.ref);
}
function savedCopy(f:Fixture) {
    assert.ok(f.runtime.checkpoint(),f.state.storageError);const data=new Map(f.data),state=createSessionState();
    const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}),undefined,()=>1800000000000);
    assert.ok(saves.initialize(),state.storageError);assert.ok(saves.resumeRun());state.state='run';return new CoastRaidRuntime(state,saves);
}

test('native checkpoint replaces three slots and preserves all cargo, RNG, story guards and finite weapons',()=>{
    for(const seed of [4,9,49,104,999]) {
        const f=fixture(seed),old=fixture(seed,true);
        try {
            assert.equal(f.raid.roster.length,25);assert.equal(Object.values(f.raid.maps).flatMap(m=>m.enemies).length,25);
            assert.deepEqual(team(f).map(e=>e.id).sort(),BLOCKADE_POSTS.map(p=>p.id).sort());
            const loot=(r:typeof f.raid)=>canonicalBehavior(r.maps.coast.containers.map(c=>({id:c.id,inventory:c.inventory})),r.runId);
            assert.equal(loot(f.raid),loot(old.raid));assert.equal(f.raid.rng,old.raid.rng);
            const guards=(r:typeof f.raid)=>Object.values(r.maps).flatMap(m=>m.enemies).filter(e=>e.id==='elite').map(e=>[e.uid,e.x,e.y]);
            assert.deepEqual(guards(f.raid),guards(old.raid));
            for(const e of team(f)){assert.equal(blockadeProgram(e)!.leader,captain(f).uid);assert.equal(e.tactics!.magazine,6);assert.equal(e.tactics!.reserve,12);}
            decodeSession(f.raw);
        } finally {f.runtime.cancelStart();old.runtime.cancelStart();}
    }
});

test('ordinary armed observation outside the boundary never registers or attacks',()=>{
    const f=fixture();try {step(f,6);assert.equal(program(f).phase,'none');for(const e of team(f)){assert.equal(e.tactics!.stance,'idle');assert.equal(e.tactics!.magazine,6);}assert.ok(f.runtime.checkpoint());}
    finally {f.runtime.cancelStart();}
});

test('real talk registration is atomic, quota failure rolls back and retained-ticket retry commits exactly once',()=>{
    const f=fixture();try {
        const raw=f.raw,world=f.runtime.snapshotExpansion(),save=structuredClone(f.state.save);
        f.deny(true);assert.equal(ask(f),false);assert.equal(f.raw,raw);assert.deepEqual(f.runtime.snapshotExpansion(),world);assert.deepEqual(f.state.save,save);assert.equal(program(f).phase,'none');
        f.deny(false);assert.ok(f.runtime.retrySave(),f.state.storageError);assert.equal(program(f).phase,'waiting');
        const after=f.raw;assert.ok(ask(f));assert.equal(f.raw,after,'a repeated informational inquiry cannot register twice');
        decodeSession(f.raw);
    } finally {f.runtime.cancelStart();}
});

test('continuous visible waiting, leaving and actual checkpoint restoration determine one local permission',()=>{
    const f=fixture();try {
        assert.ok(ask(f));step(f,2);assert.ok(program(f).waited>1.9&&program(f).waited<2.1);
        const copy=savedCopy(f);assert.deepEqual(blockadeProgram(copy.enemies.find(e=>e.uid===captain(f).uid)!),program(f));copy.cancelStart();
        Object.assign(f.runtime.player,{x:208,y:1104});step(f,.1);assert.equal(program(f).waited,0);
        Object.assign(f.runtime.player,BLOCKADE_WAIT_POINT);step(f,4.2);assert.equal(program(f).phase,'granted');assert.equal(program(f).waited,4);
        const restored=savedCopy(f);assert.deepEqual(restored.enemies.filter(e=>e.tactics?.squad===BLOCKADE_SQUAD),team(f));restored.cancelStart();
    } finally {f.runtime.cancelStart();}
});

test('paused real Runtime does not advance a pending registration',()=>{
    const f=fixture();try {
        assert.ok(ask(f));f.runtime.advance(0,emptyIntent());for(let i=1;i<=40;i++)f.runtime.advance(i*50,emptyIntent());
        const waited=program(f).waited,elapsed=f.runtime.elapsed;assert.ok(waited>1.8&&waited<2.1);
        f.runtime.pause('overlay');for(let i=41;i<=80;i++)f.runtime.advance(i*50,emptyIntent());assert.equal(program(f).waited,waited);assert.equal(f.runtime.elapsed,elapsed);
        f.runtime.resume();for(let i=81;i<=130;i++)f.runtime.advance(i*50,emptyIntent());assert.equal(program(f).phase,'granted');
    } finally {if(!f.runtime.ending)f.runtime.finish('abandon');f.runtime.dispose();}
});

test('permission covers the marked public passage only; actual repeated trespass revokes it and survives refresh',()=>{
    const f=fixture();try {
        assert.ok(ask(f));step(f,4.2);assert.equal(program(f).phase,'granted');
        Object.assign(f.runtime.player,{x:784,y:1104});step(f,1);assert.equal(team(f).find(e=>e.id==='blockade-sentry')!.tactics!.stance,'idle');
        const sentry=team(f).find(e=>e.id==='blockade-sentry')!;assert.ok(blockadePassageAllowed(sentry,f.runtime.player));
        Object.assign(f.runtime.player,{x:784,y:1072});assert.equal(blockadePassageAllowed(sentry,f.runtime.player),false);step(f,6);
        assert.ok(team(f).some(e=>e.tactics!.magazine<6),'the committed attack releases and consumes real ammunition');
        assert.equal(program(f).phase,'engaged');const copy=savedCopy(f);assert.equal(blockadeProgram(copy.enemies.find(e=>e.uid===captain(f).uid)!)!.phase,'engaged');copy.cancelStart();
        Object.assign(f.runtime.player,BLOCKADE_WAIT_POINT);assert.ok(ask(f));assert.equal(program(f).phase,'engaged');
    } finally {f.runtime.cancelStart();}
});

test('retreating during a warning avoids combat and does not earn a passage permission',()=>{
    const f=fixture();try {
        Object.assign(f.runtime.player,{x:784,y:1072});step(f,2);assert.equal(team(f).find(e=>e.id==='blockade-sentry')!.tactics!.stance,'warning');
        Object.assign(f.runtime.player,BLOCKADE_WAIT_POINT);step(f,3);assert.equal(program(f).phase,'none');assert.equal(team(f).find(e=>e.id==='blockade-sentry')!.tactics!.stance,'idle');assert.ok(f.runtime.checkpoint());
    } finally {f.runtime.cancelStart();}
});

test('a real player hit cancels clearance; NPC self-defence never assigns that guilt to the player',()=>{
    const f=fixture(),npc=fixture();try {
        const sentry=team(f).find(e=>e.id==='blockade-sentry')!;f.runtime.damageEnemy(sentry,1);step(f,.1);assert.equal(program(f).phase,'engaged');assert.ok(f.runtime.checkpoint());
        const world=npc.runtime.snapshotExpansion(),raid=world.raid!,guard=raid.maps.coast.enemies.find(e=>e.id==='blockade-sentry')!,attacker=raid.maps.coast.enemies.find(e=>e.id==='raider-melee')!;
        Object.assign(attacker,{x:688,y:1104});damageLayerEnemy(world,'coast',guard,1,true,{owner:attacker.uid,at:attacker});npc.runtime.restoreExpansion(world);
        step(npc,.1);assert.equal(program(npc).phase,'none');assert.ok(team(npc).every(e=>blockadeProgram(e)!.phase==='none'));assert.ok(npc.runtime.checkpoint(),npc.state.storageError);
    } finally {f.runtime.cancelStart();npc.runtime.cancelStart();}
});

test('strict checkpoint programs reject unknown permissions, future clocks, wrong posts, missing officers and early grants',()=>{
    const f=fixture();try {
        f.runtime.elapsed=10;assert.ok(f.runtime.checkpoint());const valid=decodeSession(f.raw);
        for(const mutate of [
            (_r:any,e:any)=>{e.tactics.program.extra=true;},(_r:any,e:any)=>{e.tactics.program.phase='future';},
            (_r:any,e:any)=>{e.tactics.program.leader='player';},(_r:any,e:any)=>{e.tactics.program.waited=5;},
            (_r:any,e:any)=>{e.tactics.program.since=11;},(_r:any,e:any)=>{e.home.x+=32;},
            (_r:any,e:any)=>{Object.assign(e.tactics.program,{phase:'granted',waited:3});},
            (_r:any,e:any)=>{Object.assign(e.tactics.program,{phase:'granted',waited:4});},
            (_r:any,e:any)=>{e.tactics=initialTactics(e.id,BLOCKADE_SQUAD);},
        ]) {
            const bad=structuredClone(valid),r=bad.expansion!.raid!,e=r.maps.coast.enemies.find(e=>e.id==='blockade-sentry')!;mutate(r,e);
            assert.throws(()=>decodeSession(JSON.stringify(bad)),/损坏|兼容/);
        }
        const marker=f.runtime.current().frame.actors.find(e=>e.uid===team(f).find(e=>e.id==='blockade-sentry')!.uid)!.tactics!.checkpoint!;
        assert.deepEqual(marker.passage,BLOCKADE_PASSAGE);assert.equal(marker.phase,'none');
    } finally {f.runtime.cancelStart();}
});

test('hidden waiting cannot buy clearance, and a dead officer cannot accept a new registration',()=>{
    const f=fixture(),lost=fixture();try {
        assert.ok(ask(f));const sight=f.runtime.sight;f.runtime.sight=()=>false;step(f,5);assert.equal(program(f).waited,0);assert.equal(program(f).phase,'waiting');
        f.runtime.sight=sight;step(f,4.2);assert.equal(program(f).phase,'granted');
        const world=lost.runtime.snapshotExpansion(),officer=world.raid!.maps.coast.enemies.find(e=>e.id==='blockade-sergeant')!,attacker=world.raid!.maps.coast.enemies.find(e=>e.id==='raider-melee')!;
        damageLayerEnemy(world,'coast',officer,1000,true,{owner:attacker.uid,at:attacker});lost.runtime.restoreExpansion(world);
        const raw=lost.raw;assert.ok(ask(lost));assert.equal(program(lost).phase,'none');assert.equal(lost.raw,raw,'denial explains the public bypass without starting registration');
    } finally {f.runtime.cancelStart();lost.runtime.cancelStart();}
});

test('a witnessed recent fatal player hit escalates surviving guards, while a hidden death conveys no attacker identity',()=>{
    const seen=fixture(),hidden=fixture();try {
        seen.runtime.damageEnemy(captain(seen),1000);step(seen,.05);
        assert.ok(team(seen).filter(e=>e.hp>0).every(e=>blockadeProgram(e)!.phase==='engaged'));assert.ok(seen.runtime.checkpoint(),seen.state.storageError);
        hidden.runtime.damageEnemy(captain(hidden),1000);hidden.runtime.sight=()=>false;step(hidden,.5);
        assert.ok(team(hidden).filter(e=>e.hp>0).every(e=>blockadeProgram(e)!.phase==='none'));assert.ok(hidden.runtime.checkpoint(),hidden.state.storageError);
    } finally {seen.runtime.cancelStart();hidden.runtime.cancelStart();}
});

test('a warning without injury or a paid shot does not permanently revoke clearance',()=>{
    const f=fixture();try {
        assert.ok(ask(f));step(f,4.2);
        for(const e of team(f))Object.assign(e.tactics!,{magazine:0,reserve:0});
        Object.assign(f.runtime.player,{x:912,y:1072});step(f,6);
        assert.ok(team(f).every(e=>blockadeProgram(e)!.phase==='granted'),'empty weapons cannot fabricate an exchange of fire');
        Object.assign(f.runtime.player,BLOCKADE_WAIT_POINT);step(f,3);assert.ok(f.runtime.checkpoint(),f.state.storageError);
    } finally {f.runtime.cancelStart();}
});

test('retreat during an unpaid reload clears the threat gradually without cancelling the reload cost',()=>{
    const f=fixture();try {
        assert.ok(ask(f));step(f,4.2);
        for(const e of team(f))Object.assign(e.tactics!,{magazine:0,reserve:e.id==='blockade-sergeant'?6:0});
        Object.assign(f.runtime.player,{x:912,y:1072});step(f,4.8);
        assert.equal(captain(f).tactics!.phase,'reload');assert.equal(program(f).phase,'granted');
        Object.assign(f.runtime.player,BLOCKADE_WAIT_POINT);step(f,3);
        assert.equal(program(f).phase,'granted');assert.equal(captain(f).tactics!.stance,'idle');
        assert.equal(captain(f).tactics!.magazine,6);assert.equal(captain(f).tactics!.reserve,0);assert.ok(f.runtime.checkpoint());
    } finally {f.runtime.cancelStart();}
});

test('registration markings never consume the interaction for a nearby real crate or its atomic loot transfer',()=>{
    const f=fixture();try {
        const world=f.runtime.snapshotExpansion(),source=world.raid!.maps.coast.containers.find(c=>c.kind==='crate'&&c.inventory.items.length)!;
        Object.assign(source,BLOCKADE_WAIT_POINT);f.runtime.restoreExpansion(world);assert.ok(f.runtime.checkpoint());
        const target=f.runtime.targetView();assert.equal(target?.kind,'container');assert.equal(target!.ref.id,source.id);
        const item=source.inventory.items[0],slot=firstAvailableSlot(f.state.loadout!.bag,item);assert.ok(slot);
        const before=f.state.loadout!.bag.items.filter(i=>i.id===item.id).reduce((n,i)=>n+i.qty,0);
        assert.equal(f.runtime.transferLoot(target!.ref,{runId:source.runId,containerId:source.id,from:'container',to:'bag',uid:item.uid,...slot,quantity:item.qty}),'committed');
        assert.equal(program(f).phase,'none');assert.equal(f.state.loadout!.bag.items.filter(i=>i.id===item.id).reduce((n,i)=>n+i.qty,0),before+item.qty);
        assert.equal(f.runtime.containers.find(c=>c.id===source.id)!.inventory.items.some(i=>i.uid===item.uid),false);
    } finally {f.runtime.cancelStart();}
});

test('the last surviving patrol still projects the existing permission after both registration officers are lost',()=>{
    const f=fixture();try {
        assert.ok(ask(f));step(f,4.2);const world=f.runtime.snapshotExpansion(),enemies=world.raid!.maps.coast.enemies,attacker=enemies.find(e=>e.id==='raider-melee')!;
        for(const e of enemies.filter(e=>e.id==='blockade-sentry'||e.id==='blockade-sergeant'))damageLayerEnemy(world,'coast',e,1000,true,{owner:attacker.uid,at:attacker});
        f.runtime.restoreExpansion(world);const patrol=team(f).find(e=>e.hp>0)!,markers=f.runtime.current().frame.actors.filter(a=>a.tactics?.checkpoint);
        assert.equal(markers.length,1);assert.equal(markers[0].uid,patrol.uid);assert.equal(markers[0].tactics!.checkpoint!.phase,'granted');
        const copy=savedCopy(f);assert.ok(copy.current().frame.actors.some(a=>a.uid===patrol.uid&&a.tactics?.checkpoint?.phase==='granted'));copy.cancelStart();
    } finally {f.runtime.cancelStart();}
});

test('both tides keep registration, patrol, public passage and bypass reachable away from protected entries',()=>{
    const f=fixture();try {
        const map=BUILDING_WORLD.maps.coast;
        for(const highTide of [false,true]) {
            const c={definition:map,doors:f.raid.maps.coast.doors,highTide};
            for(const post of BLOCKADE_POSTS)for(const p of [post.home,post.fallback,...post.patrol]) {
                assert.ok(traversable(c,p,'body',10));assert.ok(WORLD.spawns.every(a=>Math.hypot(a.x-p.x,a.y-p.y)>=320));
                assert.ok(WORLD.exits.every(a=>Math.hypot(a.x-p.x,a.y-p.y)>=160));assert.ok(map.entries.every(a=>Math.hypot(a.at.x-p.x,a.at.y-p.y)>=96));
                assert.ok(p===post.home||spacePath(c,post.home,p).length);
            }
            for(const r of [BLOCKADE_WAIT,BLOCKADE_PASSAGE])for(const x of [r.x,r.x+r.w])for(const y of [r.y,r.y+r.h])assert.ok(traversable(c,{x,y},'body',10));
            const sentry=team(f).find(e=>e.id==='blockade-sentry')!;assert.ok(Math.hypot(sentry.x-BLOCKADE_WAIT_POINT.x,sentry.y-BLOCKADE_WAIT_POINT.y)<156);
            assert.ok(BLOCKADE_POSTS.every(p=>Math.hypot(p.home.x-BLOCKADE_WAIT_POINT.x,p.home.y-BLOCKADE_WAIT_POINT.y)>90));
            assert.ok(corridor(c,captain(f),BLOCKADE_WAIT_POINT,'sight'));
            assert.ok(corridor(c,{x:6.5*32,y:34.5*32},{x:36.5*32,y:34.5*32},'body',10));
            assert.ok(corridor(c,{x:6.5*32,y:30.5*32},{x:6.5*32,y:36.5*32},'body',10));
        }
    } finally {f.runtime.cancelStart();}
});
