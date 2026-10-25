import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { FAUNA_SITES, FAUNA_SQUAD, installFaunaFood } from '../src/enemy-fauna';
import { BUILDING_WORLD } from '../src/building-world';
import { WORLD } from '../src/world';
import { damageLayerEnemy } from '../src/layer-transition';
import { corridor, separation, spacePath, traversable } from '../src/spatial';
import { canReceiveReport } from '../src/enemy-relations';
import type { LayeredRaid } from '../src/expansion-state';
import { advanceTacticalEnemy } from '../src/raid-runtime/tactical-enemy';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { archetype } from '../src/enemy-archetypes';
import type { StampedEvent } from '../src/raid-runtime/contract';

function fixture(seed=46, deploy=true) {
    let denied=false; const data=new Map<string,string>(),state=createSessionState();
    const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(denied)throw Error('quota');data.set(k,v);}}),undefined,()=>1800000000000);
    assert.ok(saves.initialize());state.state='hideout';if(deploy)assert.ok(saves.beginRun(seed,true),state.storageError);
    return {state,saves,data,deny:(value:boolean)=>{denied=value;},get raid(){return state.expansion!.raid!;}};
}
const group=(raid:LayeredRaid)=>raid.maps.coast.enemies.filter(e=>e.tactics?.squad===FAUNA_SQUAD);
const food=(raid:LayeredRaid)=>Object.values(raid.maps).reduce((n,m)=>n+m.loot.filter(l=>l.id==='food').reduce((s,l)=>s+l.qty,0)
    +m.containers.reduce((s,c)=>s+c.inventory.items.filter(i=>i.id==='food').reduce((q,i)=>q+i.qty,0),0)
    +m.enemies.reduce((s,e)=>s+(e.hp>0?e.tactics?.supplies.filter(i=>i.id==='food').reduce((q,i)=>q+i.qty,0)??0:0),0),0);

test('native fauna has four paid members, three food sites, no human command and one strict birth roster',()=>{
    for(const seed of [1,6,46,101,996]) {
        const f=fixture(seed),g=group(f.raid);
        assert.deepEqual(g.map(e=>e.id).sort(),['tidal-crab','saltback-dog','saltback-dog','sac-spitter'].sort());
        assert.equal(f.raid.roster.length,25);assert.equal(Object.values(f.raid.maps).flatMap(m=>m.enemies).length,25);
        assert.equal(f.raid.maps.coast.enemies.filter(e=>e.tactics).length,7);
        assert.equal(g.reduce((n,e)=>n+e.tactics!.supplies.reduce((s,i)=>s+i.qty,0),0),1);
        for(const site of FAUNA_SITES.filter(s=>s.foodX!==undefined)) assert.ok(f.raid.maps.coast.loot.some(l=>l.id==='food'&&l.qty===1&&l.x===(site.foodX!+.5)*32&&l.y===(site.y+.5)*32));
        for(const a of g)for(const b of f.raid.maps.coast.enemies)assert.equal(canReceiveReport(a,b),false);
        assert.ok(f.saves.persist(),f.state.storageError);decodeSession(f.data.get(SESSION_KEY)!);
    }
});

test('food is allocated once within carried budget and cannot multiply on death, repeated damage or restore',()=>{
    const f=fixture(),before=food(f.raid),actors=group(f.raid);
    assert.throws(()=>installFaunaFood(f.raid),/初始化/);assert.equal(food(f.raid),before);
    for(const e of actors)damageLayerEnemy(f.state.expansion!,'coast',e,e.hp*2);
    assert.equal(food(f.raid),before);assert.equal(f.raid.maps.coast.containers.filter(c=>c.kind==='corpse').length,4);
    for(const e of actors)damageLayerEnemy(f.state.expansion!,'coast',e,100);
    assert.equal(food(f.raid),before);assert.ok(f.saves.persist(),f.state.storageError);
    const raw=f.data.get(SESSION_KEY)!,loaded=decodeSession(raw);
    assert.equal(food(loaded.expansion!.raid!),before);assert.equal(loaded.expansion!.raid!.maps.coast.containers.filter(c=>c.kind==='corpse').length,4);
    assert.ok(f.saves.initialize());assert.ok(f.saves.persist());assert.equal(food(f.raid),before);
});

test('fauna deployment failure leaves the original bytes and food budget untouched until retry',()=>{
    const f=fixture(46,false),raw=f.data.get(SESSION_KEY)!,before=structuredClone(f.state.expansion),profile=structuredClone(f.state.save);
    f.deny(true);assert.equal(f.saves.beginRun(46,true),false);assert.equal(f.data.get(SESSION_KEY),raw);assert.deepEqual(f.state.expansion,before);assert.deepEqual(f.state.save,profile);
    f.deny(false);assert.ok(f.saves.beginRun(46,true),f.state.storageError);assert.equal(group(f.raid).length,4);
    assert.equal(group(f.raid).reduce((n,e)=>n+e.tactics!.supplies.reduce((s,i)=>s+i.qty,0),0),1);
    assert.ok(f.saves.persist());decodeSession(f.data.get(SESSION_KEY)!);
});

test('paired dogs use a visible companion for a side approach and return to the nest after losing the stimulus',()=>{
    const f=fixture(),dogs=group(f.raid).filter(e=>e.id==='saltback-dog').sort((a,b)=>a.uid.localeCompare(b.uid,'en'));
    const player={x:(dogs[0].x+dogs[1].x)/2,y:dogs[0].y-180};let seeMate=true,visible=true;
    const world={elapsed:1,player,enemies:dogs,highTide:false,shotNoise:null,noiseTime:0,noiseRadius:0,space:null,
        sight:(_a:unknown,b:unknown)=>visible&&(b===player||seeMate),walkable:()=>true,dryRefuge:()=>null,
        path:(_a:unknown,b:{x:number;y:number})=>[b],move:(e:{x:number;y:number},dx:number,dy:number)=>{e.x+=dx;e.y+=dy;}};
    const effects={fire(){},strike(){},openDoor(){},notice(){}};
    for(const e of dogs)Object.assign(e.tactics!,{stance:'hostile',awareness:1,memory:{at:{...player},time:1,source:'sight',target:'player'}});
    advanceTacticalEnemy(world,effects,dogs[0],.05);advanceTacticalEnemy(world,effects,dogs[1],.05);
    assert.deepEqual(dogs[0].target,player);assert.notDeepEqual(dogs[1].target,player,'second dog takes a small side angle');
    seeMate=false;world.elapsed+=.05;advanceTacticalEnemy(world,effects,dogs[1],.05);assert.deepEqual(dogs[1].target,player);
    visible=false;world.player={x:100,y:100};
    for(let i=0;i<60;i++){world.elapsed+=.2;for(const e of dogs)advanceTacticalEnemy(world,effects,e,.2);}
    for(const e of dogs){assert.equal(e.tactics!.memory,null);assert.equal(e.tactics!.stance,'idle');assert.deepEqual(e.target,e.home);assert.ok(separation(e,e.home)<12);}
});

test('nests and food are legal at both tides with a dry return and public bypass clear of spawn, exits and connectors',()=>{
    const f=fixture(),map=BUILDING_WORLD.maps.coast;
    for(const highTide of [false,true]) {
        const context={definition:map,doors:f.raid.maps.coast.doors,highTide};
        for(const site of FAUNA_SITES) {
            const home={x:(site.x+.5)*32,y:(site.y+.5)*32},source={x:((site.foodX??25)+.5)*32,y:(site.y+.5)*32};
            for(const p of [home,source]) {
                assert.ok(traversable(context,p,'body',10));assert.ok(WORLD.spawns.every(q=>separation(p,q)>=320));
                assert.ok(WORLD.exits.every(q=>separation(p,q)>=160));assert.ok(map.entries.every(q=>separation(p,q.at)>=96));
            }
            assert.ok(corridor(context,home,source,'body',10));assert.ok(spacePath(context,source,home,true).length);
            for(const y of [28,34,40]){const p={x:6.5*32,y:(y+.5)*32};assert.ok(traversable(context,p,'body',10));assert.ok(separation(home,p)>340);}
        }
    }
});

test('published fauna phase totals describe the real paid action rather than borrowing recovery time',()=>{
    for(const id of ['saltback-dog','sac-spitter'])for(const phase of ['idle','windup','release','recovery'] as const){
        const f=fixture(),e=group(f.raid).find(e=>e.id===id)!,spec=archetype(id)!;
        Object.assign(e.tactics!,{phase,phaseLeft:phase==='idle'?0:phase==='release'?(id==='saltback-dog'?.2:0):.2});
        assert.ok(f.saves.persist(),f.state.storageError);f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves);
        const view=r.current().frame.actors.find(a=>a.uid===e.uid)!.tactics!;
        assert.equal(view.total,phase==='windup'?spec.windup:phase==='recovery'?spec.recovery:phase==='release'&&id==='saltback-dog'?.3:0);
        r.cancelStart();
    }
});

for(const wall of [false,true])test(`native spitter paid shot ${wall?'stops at a real building wall':'keeps its locked direction and expires at finite range'}`,()=>{
    const f=fixture(),e=group(f.raid).find(e=>e.id==='sac-spitter')!;
    const player=wall?{x:29.5*32,y:37.5*32}:{x:e.x+96,y:e.y};
    const context={definition:BUILDING_WORLD.maps.coast,doors:f.raid.maps.coast.doors,highTide:f.raid.highTide};
    assert.ok(traversable(context,player,'body',10));
    f.raid.player={...player,rotation:0};
    const aim=wall?Math.atan2(player.y-e.y,player.x-e.x):-Math.PI/2;
    if(!wall)assert.ok(corridor(context,e,{x:e.x,y:e.y-210},'bullet'),'independently verified clear flight corridor');
    Object.assign(e.tactics!,{phase:'release',phaseLeft:0,lockedAim:aim,stance:'hostile',awareness:1,
        memory:{at:wall?{...player}:{x:e.x,y:e.y-160},time:0,source:'sight',target:'player'}});
    assert.ok(f.saves.persist(),f.state.storageError);f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves);
    // Release through the real controller/effects, then isolate flight from unrelated roaming bodies.
    r.updateEnemy(r.enemies.find(a=>a.uid===e.uid)!, .05);r.freezeAI=true;
    const shot=r.current().events.find(v=>v.type==='shot'&&v.shooter===e.uid);assert.ok(shot?.type==='shot');
    assert.equal(shot.weapon,'claw');assert.deepEqual(shot.pellets[0].origin,{x:e.x,y:e.y});assert.equal(shot.pellets[0].angle,aim);
    const uid=shot.pellets[0].bullet;let impact:StampedEvent|undefined,restored=false;
    for(let frame=0;frame<=120&&!impact;frame++){
        const batch=r.advance(frame*1000/60,emptyIntent());
        const bullet=r.bullets.find(b=>b.uid===uid);
        if(bullet){assert.ok(separation(bullet,e)<=210+.001);assert.ok(bullet.left<=210);}
        if(!wall&&!restored&&bullet&&bullet.left<160){
            assert.ok(r.checkpoint());const data=new Map(f.data),state=createSessionState();
            const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}),undefined,()=>1800000000000);
            assert.ok(saves.initialize());assert.ok(saves.resumeRun());state.state='run';const copy=new CoastRaidRuntime(state,saves);
            assert.deepEqual(copy.bullets.find(b=>b.uid===uid),bullet,'in-flight acid retains exact owner, velocity and remaining range');
            assert.equal(copy.advance(0,emptyIntent()).events.some(v=>v.type==='shot'&&v.shooter===e.uid),false,'restore cannot repeat a paid acid release');
            copy.finish('abandon');copy.dispose();restored=true;
        }
        impact=batch.events.find(v=>v.type==='impact'&&v.bullet===uid);
    }
    assert.ok(uid);assert.ok(impact?.type==='impact');
    assert.equal(impact.reason,wall?'blocked':'range');assert.equal(impact.target,null);
    if(!wall)assert.ok(restored);
    assert.ok(separation(impact.lastFree,e)<=210+.001);r.finish('abandon');r.dispose();
});
