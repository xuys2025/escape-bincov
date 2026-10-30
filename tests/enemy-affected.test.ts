import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, SESSION_KEY } from '../src/recovery-store';
import { AFFECTED_POSTS, AFFECTED_SQUAD } from '../src/enemy-affected';
import { actorArchetype, archetype, initialTactics } from '../src/enemy-archetypes';
import { BUILDING_WORLD } from '../src/building-world';
import { WORLD } from '../src/world';
import { corridor, separation, spacePath, traversable } from '../src/spatial';
import { canReceiveReport } from '../src/enemy-relations';
import { damageLayerEnemy } from '../src/layer-transition';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { advanceTacticalEnemy } from '../src/raid-runtime/tactical-enemy';
import type { EnemyState } from '../src/checkpoint';
import { WEAPONS } from '../src/domain';

function fixture(seed=47,deploy=true) {
    let denied=false;const data=new Map<string,string>(),state=createSessionState();
    const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(denied)throw Error('quota');data.set(k,v);}}),undefined,()=>1800000000000);
    assert.ok(saves.initialize());state.state='hideout';if(deploy)assert.ok(saves.beginRun(seed,true),state.storageError);
    return {state,saves,data,deny:(value:boolean)=>{denied=value;},get raid(){return state.expansion!.raid!;}};
}
const group=(f:ReturnType<typeof fixture>)=>f.raid.maps.coast.enemies.filter(e=>e.tactics?.squad===AFFECTED_SQUAD);

test('native affected variants preserve the population and the two story guards, persisting actual gun or polearm',()=>{
    for(const seed of [2,17,32,47,62]) {
        const f=fixture(seed),g=group(f),gun=Math.floor(seed/5)%2===1;
        assert.equal(f.raid.roster.length,25);assert.equal(Object.values(f.raid.maps).flatMap(m=>m.enemies).length,25);
        assert.equal(f.raid.maps.coast.enemies.filter(e=>e.id==='elite').length,2);
        assert.deepEqual(g.map(e=>e.id).sort(),AFFECTED_POSTS.map(p=>p.id).sort());
        assert.ok(g.every(e=>e.tactics?.version===2));
        const ritual=g.find(e=>e.id==='tide-ritualist')!,def=actorArchetype(ritual)!;
        assert.equal(def.weapon,gun?'rifle':'club');assert.equal(ritual.tactics!.equipment,gun?'carbine':null);
        assert.equal(def.magazine,gun?WEAPONS.carbine.magazine:0);assert.equal(def.reserve,gun?8:0);
        assert.equal(ritual.tactics!.magazine+ritual.tactics!.reserve,gun?12:0);
        assert.ok(f.saves.persist(),f.state.storageError);assert.deepEqual(decodeSession(f.data.get(SESSION_KEY)!).expansion!.raid,f.raid);
        for(const a of g)for(const b of g)if(a.id!=='tide-ritualist'||b.id!=='tide-ritualist')assert.equal(canReceiveReport(a,b),false);
    }
    assert.equal(group(fixture(42)).length,0,'the existing three-role seed42 measurement stays unchanged');
});

test('v2 deployment is atomic on quota failure and retains both original backup byte strings',()=>{
    const f=fixture(47,false),raw=f.data.get(SESSION_KEY)!,save=structuredClone(f.state.save),expansion=structuredClone(f.state.expansion);
    f.deny(true);assert.equal(f.saves.beginRun(47,true),false);assert.equal(f.data.get(SESSION_KEY),raw);assert.deepEqual(f.state.save,save);assert.deepEqual(f.state.expansion,expansion);
    f.deny(false);assert.ok(f.saves.beginRun(47,true),f.state.storageError);
    // Record v9 (gun instances, #28 M3-12 footprints) with enemy rules on: it holds enemyBackup, the exact bytes before this deployment.
    const record=decodeSession(f.data.get(SESSION_KEY)!);assert.equal(record.version,9);assert.equal(record.enemyBackup,raw);
    const backups=[record.enemyBackup,record.perksBackup];assert.ok(f.saves.persist());assert.deepEqual([f.saves.currentRecord()!.enemyBackup,f.saves.currentRecord()!.perksBackup],backups);
});

test('strict actor capability rejects unknown fields, versions, programs, armaments, equipment and over-budget ammunition',()=>{
    const f=fixture(),valid=decodeSession(f.data.get(SESSION_KEY)!);
    for(const mutate of [
        (e:any)=>{e.tactics.program.extra=true;},(e:any)=>{e.tactics.program.kind='future';},(e:any)=>{e.tactics.program.armament='shotgun';},
        (e:any)=>{e.tactics.version=1;},(e:any)=>{e.tactics.version=3;},(e:any)=>{e.tactics.magazine=13;},(e:any)=>{e.tactics.reserve=9;},
        (e:any)=>{e.tactics.equipment='pistol';},(e:any)=>{delete e.tactics.program;},(e:any)=>{e.tactics.program=null;},
    ]) {
        const bad=structuredClone(valid),e=bad.expansion!.raid!.maps.coast.enemies.find(e=>e.id==='tide-ritualist')!;
        mutate(e);assert.throws(()=>decodeSession(JSON.stringify(bad)),/损坏|兼容/);
    }
    const bad=structuredClone(valid),dazed=bad.expansion!.raid!.maps.coast.enemies.find(e=>e.id==='salt-dazed')!;
    (dazed.tactics as any).program.armament='rifle';assert.throws(()=>decodeSession(JSON.stringify(bad)),/损坏|兼容/);
    assert.doesNotThrow(()=>decodeSession(JSON.stringify(valid)));
});

test('each affected paid phase and reload round-trips without rebuilding a program or refilling ammunition',()=>{
    for(const seed of [47,62])for(const phase of ['idle','windup','release','recovery','reload'] as const) {
        const f=fixture(seed),e=group(f).find(e=>e.id==='tide-ritualist')!,spec=actorArchetype(e)!;
        if(phase==='reload'&&!spec.magazine)continue;
        Object.assign(e.tactics!,{phase,phaseLeft:phase==='idle'||phase==='release'?0:.2,...(phase==='reload'?{magazine:0,reserve:5}:{})});
        assert.ok(f.saves.persist(),f.state.storageError);const snapshot=structuredClone(e.tactics);
        assert.ok(f.saves.initialize(),f.state.storageError);assert.deepEqual(group(f).find(a=>a.uid===e.uid)!.tactics,snapshot);
        assert.ok(f.saves.persist());assert.deepEqual(decodeSession(f.data.get(SESSION_KEY)!).expansion!.raid!.maps.coast.enemies.find(a=>a.uid===e.uid)!.tactics,snapshot);
    }
});

test('gun ritualist emits a real finite rifle shot and drops that same weapon and its remaining ammunition once',()=>{
    const f=fixture(),e=group(f).find(e=>e.id==='tide-ritualist')!;
    Object.assign(e.tactics!,{phase:'release',phaseLeft:0,lockedAim:-Math.PI/2,stance:'hostile',awareness:1,
        memory:{at:{x:e.x,y:e.y-100},time:0,source:'sight',target:'player'}});
    assert.ok(f.saves.persist(),f.state.storageError);f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves);
    r.updateEnemy(r.enemies.find(a=>a.uid===e.uid)!,.05);
    const batch=r.current(),shot=batch.events.find(v=>v.type==='shot'&&v.shooter===e.uid);assert.ok(shot?.type==='shot');assert.equal(shot.weapon,'rifle');
    const bullet=r.bullets.find(b=>b.uid===shot.pellets[0].bullet)!;assert.equal(bullet.owner,e.uid);assert.equal(bullet.left,WEAPONS.carbine.range*.55);assert.equal(bullet.damage,WEAPONS.carbine.damage*.34);
    assert.equal(batch.frame.actors.find(a=>a.uid===e.uid)!.weapon,'rifle');assert.ok(r.checkpoint());
    const live=group(f).find(a=>a.uid===e.uid)!;assert.equal(live.tactics!.magazine,11);
    damageLayerEnemy(f.state.expansion!,'coast',live,1000);
    const corpse=f.raid.maps.coast.containers.find(c=>c.id===`corpse-${e.uid}`)!;
    assert.equal(corpse.inventory.items.filter(i=>i.id==='carbine').reduce((n,i)=>n+i.qty,0),1);
    assert.equal(corpse.inventory.items.filter(i=>i.id===WEAPONS.carbine.ammo).reduce((n,i)=>n+i.qty,0),11);
    const count=f.raid.maps.coast.containers.length;damageLayerEnemy(f.state.expansion!,'coast',live,1000);assert.equal(f.raid.maps.coast.containers.length,count);
    assert.ok(f.saves.persist(),f.state.storageError);r.cancelStart();
});

test('dangerous service-yard posts and a public bypass remain usable at both tides',()=>{
    const f=fixture(),map=BUILDING_WORLD.maps.coast;
    for(const highTide of [false,true]) {
        const context={definition:map,doors:f.raid.maps.coast.doors,highTide};
        for(const p of AFFECTED_POSTS) {
            for(const at of [p.home,...p.patrol])assert.ok(traversable(context,at,'body',10));
            for(const at of p.patrol)assert.ok(spacePath(context,p.home,at).length||separation(p.home,at)<1);
            assert.ok(WORLD.spawns.every(at=>separation(at,p.home)>=320));assert.ok(WORLD.exits.every(at=>separation(at,p.home)>=160));
            assert.ok(map.entries.every(at=>separation(at.at,p.home)>=96));
            assert.ok(separation(p.home,{x:6.5*32,y:p.home.y})>=340);
        }
        assert.ok(corridor(context,{x:6.5*32,y:30.5*32},{x:6.5*32,y:36.5*32},'body',10));
    }
});

test('a real v2 gun reload resumed midway loads only the saved reserve once',()=>{
    const f=fixture(),e=group(f).find(e=>e.id==='tide-ritualist')!;
    Object.assign(e.tactics!,{phase:'reload',phaseLeft:.3,magazine:0,reserve:5});assert.ok(f.saves.persist());
    f.state.state='run';const original=new CoastRaidRuntime(f.state,f.saves);original.updateEnemy(original.enemies.find(a=>a.uid===e.uid)!,.15);assert.ok(original.checkpoint());
    const state=createSessionState(),saves=new SaveSession(state,()=>({getItem:k=>f.data.get(k)??null,setItem:(k,v)=>f.data.set(k,v)}),undefined,()=>1800000000000);
    assert.ok(saves.initialize());assert.ok(saves.resumeRun());state.state='run';const copy=new CoastRaidRuntime(state,saves),live=copy.enemies.find(a=>a.uid===e.uid)!;
    assert.equal(copy.current().frame.actors.find(a=>a.uid===e.uid)!.state.reloading!.total,WEAPONS.carbine.reload);assert.equal(live.tactics!.phaseLeft,.15);
    copy.updateEnemy(live,.2);assert.equal(live.tactics!.magazine,5);assert.equal(live.tactics!.reserve,0);assert.equal(live.tactics!.phase,'idle');
    copy.updateEnemy(live,.2);assert.equal(live.tactics!.magazine,5);assert.equal(live.tactics!.reserve,0);
    original.cancelStart();copy.cancelStart();
});

function arena(id:string,player={x:240,y:200}) {
    const e:EnemyState={uid:'enemy-0',id,x:200,y:200,hp:archetype(id)!.hp,home:{x:200,y:200},target:{x:200,y:200},rotation:0,
        state:'patrol',timer:0,cooldown:0,path:[],repath:0,alert:0,tactics:initialTactics(id,'isolated',{kind:'affected',armament:id==='tide-ritualist'?'polearm':'unarmed'})};
    let visible=true;const world={elapsed:0,player,enemies:[e],highTide:false,shotNoise:null as {x:number;y:number}|null,noiseTime:0,noiseRadius:200,space:null,
        sight:()=>visible,walkable:()=>true,path:(_a:unknown,b:{x:number;y:number})=>[b],dryRefuge:()=>null,
        move:(a:{x:number;y:number},dx:number,dy:number)=>{a.x+=dx;a.y+=dy;}};
    let attacks=0;const effects={fire(){attacks++;},strike(){attacks++;},openDoor(){},notice(){}};
    return {e,world,visible:(v:boolean)=>{visible=v;},get attacks(){return attacks;},step(dt=.05){world.elapsed+=dt;advanceTacticalEnemy(world,effects,e,dt);}};
}

test('affected sound is only a last observed stimulus; slow confirmation does not authorize attacks through a wall',()=>{
    const a=arena('salt-dazed');a.visible(false);a.world.shotNoise={x:220,y:200};a.world.noiseTime=.1;
    a.step();assert.equal(a.e.tactics!.memory?.source,'sound');const memory=structuredClone(a.e.tactics!.memory);a.world.player={x:900,y:900};a.world.noiseTime=0;
    for(let i=0;i<30;i++)a.step();assert.deepEqual(a.e.tactics!.memory,memory);assert.equal(a.attacks,0);
    a.world.player={x:a.e.x+28,y:a.e.y};a.visible(true);for(let i=0;i<10;i++)a.step();assert.ok(a.e.tactics!.awareness<1);assert.equal(a.attacks,0);
    const last=structuredClone(a.e.tactics!.memory);a.visible(false);for(let i=0;i<180;i++)a.step();
    assert.deepEqual(a.e.tactics!.memory,last);assert.ok(a.world.elapsed-last!.time>7);assert.deepEqual(a.e.target,a.e.home);
});

test('v2 heavy turns at a bounded rate before windup and cannot retarget during its paid attack',()=>{
    const a=arena('salt-hulk',{x:160,y:200});Object.assign(a.e.tactics!,{stance:'hostile',awareness:1,memory:{at:{x:160,y:200},time:0,source:'sight',target:'player'}});
    a.step(.2);assert.ok(Math.abs(a.e.rotation)<=.22+.0001);assert.equal(a.e.tactics!.phase,'idle');assert.equal(a.attacks,0);
    for(let i=0;i<100&&a.e.tactics!.phase==='idle';i++)a.step();assert.equal(a.e.tactics!.phase,'windup');const aim=a.e.tactics!.lockedAim;
    a.world.player={x:a.e.x,y:a.e.y+45};for(let i=0;i<45;i++)a.step();assert.equal(a.e.tactics!.lockedAim,aim);assert.equal(a.attacks,0);
    const old=initialTactics('salt-hulk','historical');assert.equal(old.version,1);assert.equal(actorArchetype({id:'salt-hulk',tactics:old})!.confirm,.6);
});

test('repeated heavy turns remain normalized instead of accumulating beyond the saved angle bound',()=>{
    const a=arena('salt-hulk');
    for(let i=0;i<4000;i++) {
        a.world.player={x:a.e.x+Math.cos(i*.04)*50,y:a.e.y+Math.sin(i*.04)*50};
        Object.assign(a.e.tactics!,{stance:'hostile',phase:'idle',phaseLeft:0});a.e.cooldown=1;
        a.step();assert.ok(a.e.rotation>=-Math.PI&&a.e.rotation<=Math.PI,'long circular pursuits must keep a serializable angle');
    }
    const f=fixture(),e=group(f).find(e=>e.id==='salt-hulk')!;e.rotation=a.e.rotation;
    assert.ok(f.saves.persist(),f.state.storageError);assert.doesNotThrow(()=>decodeSession(f.data.get(SESSION_KEY)!));
});
