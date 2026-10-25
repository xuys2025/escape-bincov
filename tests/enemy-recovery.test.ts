import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionState,SaveSession} from '../src/session';
import {decodeSession,SESSION_KEY} from '../src/recovery-store';
import {RECOVERY_SQUAD,RECOVERY_POSTS,RECOVERY_PICKUP,RECOVERY_ROUTE,installRecoveryProgram} from '../src/enemy-recovery';
import {BUILDING_WORLD} from '../src/building-world';
import {WORLD} from '../src/world';
import {canonicalBehavior} from './fixtures/enemy-benchmark';
import {corridor,separation,spacePath,traversable} from '../src/spatial';
import {CoastRaidRuntime} from '../src/raid-runtime/runtime';
import {actorArchetype,enemyBoundary,initialTactics,type EnemyProgram} from '../src/enemy-archetypes';
import {recoveryObjective} from '../src/raid-runtime/recovery-objective';
import {firstAvailableSlot} from '../src/loot';

type Program=Extract<EnemyProgram,{kind:'recovery'}>;
function fixture(seed=48,deploy=true,legacy=false) {
    let denied=false;const data=new Map<string,string>(),state=createSessionState();
    const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(denied)throw Error('quota');data.set(k,v);}}),undefined,()=>1800000000000);
    assert.ok(saves.initialize());state.state='hideout';if(deploy)assert.ok(saves.beginRun(seed,true,{legacyEnemies:legacy}),state.storageError);
    return {state,saves,data,deny:(v:boolean)=>{denied=v;},get raid(){return state.expansion!.raid!;}};
}
const group=(f:ReturnType<typeof fixture>)=>f.raid.maps.coast.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD);
const program=(e:ReturnType<typeof group>[number])=>(e.tactics as {version:2;program:Program}).program;

test('native recovery replaces four slots, has one support and moves exactly one existing paid cargo',()=>{
    for(const seed of [3,8,48,103,998]) {
        const f=fixture(seed),old=fixture(seed,true,true),team=group(f),leader=team.find(e=>e.id==='recovery-leader')!;
        assert.equal(f.raid.roster.length,25);assert.equal(Object.values(f.raid.maps).flatMap(m=>m.enemies).length,25);
        assert.deepEqual(team.map(e=>e.id).sort(),RECOVERY_POSTS.map(p=>p.id).sort());assert.equal(team.filter(e=>e.id==='mercenary-support').length,1);
        const cargo=f.raid.maps.coast.containers.find(c=>c.id===program(leader).crate)!;assert.ok(cargo.inventory.items.length);
        assert.deepEqual({x:cargo.x,y:cargo.y},RECOVERY_PICKUP);assert.match(cargo.name,/回收运输箱/);
        const goods=(r:typeof f.raid)=>canonicalBehavior(r.maps.coast.containers.map(c=>({id:c.id,inventory:c.inventory})),r.runId);
        assert.equal(goods(f.raid),goods(old.raid),'same crate identities, item identities and quantities');assert.equal(f.raid.rng,old.raid.rng);
        const guards=(r:typeof f.raid)=>Object.values(r.maps).flatMap(m=>m.enemies).filter(e=>e.id==='elite').map(e=>[e.uid,e.x,e.y]);
        assert.deepEqual(guards(f.raid),guards(old.raid));
        for(const e of team){assert.equal(program(e).leader,leader.uid);assert.equal(program(e).crate,cargo.id);}
        assert.ok(f.saves.persist(),f.state.storageError);decodeSession(f.data.get(SESSION_KEY)!);assert.throws(()=>installRecoveryProgram(f.raid),/初始化/);
    }
});

test('recovery deployment quota failure leaves inventory, version, original bytes and both backups untouched',()=>{
    const f=fixture(48,false),raw=f.data.get(SESSION_KEY)!,before=structuredClone(f.state.expansion),save=structuredClone(f.state.save);
    f.deny(true);assert.equal(f.saves.beginRun(48,true),false);assert.equal(f.data.get(SESSION_KEY),raw);assert.deepEqual(f.state.expansion,before);assert.deepEqual(f.state.save,save);
    f.deny(false);assert.ok(f.saves.beginRun(48,true),f.state.storageError);const first=f.saves.currentRecord()!;
    const backups=[first.enemyBackup,first.perksBackup];assert.ok(f.saves.persist());assert.deepEqual([f.saves.currentRecord()!.enemyBackup,f.saves.currentRecord()!.perksBackup],backups);
});

test('strict cargo programs reject broken ownership, unknown stages, future orders, support clones and foreign containers',()=>{
    const f=fixture(),valid=decodeSession(f.data.get(SESSION_KEY)!);
    for(const mutate of [
        (_r:any,e:any)=>{e.tactics.program.extra=1;},(_r:any,e:any)=>{e.tactics.program.kind='future';},
        (_r:any,e:any)=>{e.tactics.program.leader='player';},(_r:any,e:any)=>{e.tactics.program.crate='missing';},
        (_r:any,e:any)=>{e.tactics.program.phase='teleport';},(_r:any,e:any)=>{e.tactics.program.leg=3;},
        (_r:any,e:any)=>{e.tactics.program.since=1;},(_r:any,e:any)=>{e.tactics.program.heardAt=1;},
        (_r:any,e:any)=>{e.home.x+=32;},
        (_r:any,e:any)=>{e.tactics.program.phase='delivered';},
        (r:any,e:any)=>{e.id='mercenary-support';r.roster.find((a:any)=>a.uid===e.uid).id=e.id;},
        (r:any,e:any)=>{r.maps.coast.containers.find((c:any)=>c.id===e.tactics.program.crate).kind='corpse';},
    ]) {
        const bad=structuredClone(valid),r=bad.expansion!.raid!,e=r.maps.coast.enemies.find(e=>e.id==='mercenary-scout')!;
        mutate(r,e);assert.throws(()=>decodeSession(JSON.stringify(bad)),/损坏|兼容/);
    }
    const foreign=structuredClone(valid),raid=foreign.expansion!.raid!,other=Object.entries(raid.maps).find(([id])=>id!=='coast');
    assert.ok(other);const assigned=program(raid.maps.coast.enemies.find(e=>e.id==='recovery-leader')!).crate;
    const index=raid.maps.coast.containers.findIndex(c=>c.kind==='crate'&&c.id!==assigned),crate=raid.maps.coast.containers.splice(index,1)[0];
    assert.ok(crate);Object.assign(crate,BUILDING_WORLD.maps[other[0]].entries[0].at);other[1].containers.push(crate);
    assert.doesNotThrow(()=>decodeSession(JSON.stringify(foreign)),'an independent legal foreign crate before redirecting ownership');
    for(const e of raid.maps.coast.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD))program(e).crate=crate.id;
    assert.throws(()=>decodeSession(JSON.stringify(foreign)),/损坏|兼容/);
    const missing=structuredClone(valid),member=missing.expansion!.raid!.maps.coast.enemies.find(e=>e.id==='mercenary-scout')!;
    member.tactics=initialTactics(member.id,RECOVERY_SQUAD);assert.throws(()=>decodeSession(JSON.stringify(missing)),/损坏|兼容/);
});

test('loading, every actual carry leg, delivery and withdrawal use real movement and one restorable crate',()=>{
    const f=fixture();f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves);
    const leader=()=>r.enemies.find(e=>e.id==='recovery-leader')!,id=program(leader()).crate;
    const original=structuredClone(r.containers.find(c=>c.id===id)!.inventory),seen=new Set<string>();let restored=false;
    // Isolate objective movement using real controller/collision/capture; other NPCs/player clocks are not advanced.
    for(let tick=1;tick<=650;tick++) {
        r.elapsed=tick*.05;for(const e of r.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD))r.updateEnemy(e,.05);
        const p=program(leader()),cargo=r.containers.find(c=>c.id===id)!,key=`${p.phase}/${p.leg}`,first=!seen.has(key);seen.add(key);
        assert.deepEqual(cargo.inventory,original);assert.equal(r.containers.filter(c=>c.id===id).length,1);
        if(p.phase==='advance')assert.ok(separation(cargo,leader())<.001);
        if(first) {
            assert.ok(r.checkpoint(),f.state.storageError);const data=new Map(f.data),state=createSessionState(),save=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}),undefined,()=>1800000000000);
            assert.ok(save.initialize());assert.ok(save.resumeRun());state.state='run';const copy=new CoastRaidRuntime(state,save);
            assert.deepEqual(copy.containers.find(c=>c.id===id),cargo);assert.deepEqual(copy.enemies.find(e=>e.uid===leader().uid),leader());
            assert.ok(copy.checkpoint());assert.equal(copy.containers.filter(c=>c.id===id).length,1);copy.cancelStart();if(p.phase==='advance'&&p.leg===1)restored=true;
        }
    }
    for(const phase of ['collect/0','loading/0','advance/0','advance/1','advance/2','delivered/2','withdraw/2'])assert.ok(seen.has(phase),phase);
    assert.ok(restored);assert.ok(separation(r.containers.find(c=>c.id===id)!,RECOVERY_ROUTE[2])<12);
    assert.ok(r.checkpoint(),f.state.storageError);decodeSession(f.data.get(SESSION_KEY)!);r.cancelStart();
});

test('cargo looting rolls the moving world and inventory back together and retry cannot duplicate the source item',()=>{
    const f=fixture(),leader=group(f).find(e=>e.id==='recovery-leader')!,id=program(leader).crate;
    f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves);
    for(let i=1;i<200&&program(r.enemies.find(e=>e.uid===leader.uid)!).phase!=='advance';i++) {
        r.elapsed=i*.05;for(const e of r.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD))r.updateEnemy(e,.05);
    }
    assert.equal(program(r.enemies.find(e=>e.uid===leader.uid)!).phase,'advance');
    const cargo=r.containers.find(c=>c.id===id)!;Object.assign(r.player,{x:cargo.x,y:cargo.y+24});assert.ok(r.checkpoint());
    const item=cargo.inventory.items[0],slot=firstAvailableSlot(f.state.loadout!.bag,item);assert.ok(slot);
    const ref={...r.current().stamp.world,kind:'container' as const,id},request={runId:cargo.runId,containerId:id,from:'container' as const,to:'bag' as const,uid:item.uid,...slot,quantity:item.qty};
    const raw=f.data.get(SESSION_KEY)!,before=r.snapshotExpansion(),bag=structuredClone(f.state.loadout!.bag);
    f.deny(true);assert.equal(r.transferLoot(ref,request),'save-failed');assert.equal(f.data.get(SESSION_KEY),raw);assert.deepEqual(r.snapshotExpansion(),before);assert.deepEqual(f.state.loadout!.bag,bag);
    f.deny(false);assert.ok(r.retrySave());assert.equal(r.transferLoot(ref,request),'committed');assert.equal(r.transferLoot(ref,request),'rejected');
    assert.equal(r.containers.find(c=>c.id===id)!.inventory.items.some(i=>i.uid===item.uid),false);decodeSession(f.data.get(SESSION_KEY)!);r.cancelStart();
});

test('orders and heartbeats cross the radio radius only; unseen death waits for a persisted contact timeout',()=>{
    const f=fixture(),team=group(f),leader=team.find(e=>e.id==='recovery-leader')!,scout=team.find(e=>e.id==='mercenary-scout')!;
    const world={elapsed:20,enemies:team,containers:f.raid.maps.coast.containers,sight:()=>false};
    Object.assign(program(leader),{phase:'advance',leg:1,since:19,heardAt:20});program(scout).heardAt=19;
    recoveryObjective(world,leader,()=>{});assert.equal(program(scout).phase,'collect','384px is outside radio range');
    scout.x=leader.x+300;recoveryObjective(world,leader,()=>{});assert.equal(program(scout).phase,'advance');assert.equal(program(scout).leg,1);
    recoveryObjective(world,scout,()=>{});assert.equal(program(scout).heardAt,20);
    leader.hp=0;world.elapsed=20.1;recoveryObjective(world,scout,()=>{});assert.equal(program(scout).phase,'advance','unseen death cannot be sensed immediately');
    world.elapsed=33;recoveryObjective(world,scout,()=>{});assert.equal(program(scout).phase,'withdraw');
    const copy=structuredClone(scout);assert.equal(program(copy).heardAt,20);assert.equal(program(copy).phase,'withdraw');
});

test('cover roles alternate with the received leg and the moving warning boundary matches the published rule',()=>{
    const f=fixture(),team=group(f),leader=team.find(e=>e.id==='recovery-leader')!,support=team.find(e=>e.id==='mercenary-support')!,assault=team.find(e=>e.id==='mercenary-assault')!;
    const world={elapsed:1,enemies:team,containers:f.raid.maps.coast.containers,sight:()=>true};
    Object.assign(program(leader),{phase:'advance',leg:1,since:1,heardAt:1});
    for(const e of [support,assault])Object.assign(program(e),{phase:'advance',leg:1,since:1});
    assert.deepEqual(recoveryObjective(world,assault,()=>{}),RECOVERY_ROUTE[0]);assert.deepEqual(recoveryObjective(world,support,()=>{}),RECOVERY_ROUTE[1]);
    for(const e of [leader,support,assault])program(e).leg=2;
    assert.deepEqual(recoveryObjective(world,support,()=>{}),RECOVERY_ROUTE[1]);assert.deepEqual(recoveryObjective(world,assault,()=>{}),RECOVERY_ROUTE[2]);
    leader.x+=64;assert.deepEqual(enemyBoundary(leader),{at:{x:leader.x,y:leader.y},radius:64});
});

test('all four real recovery controllers still pay for finite rifle shots while holding an objective',()=>{
    for(const post of RECOVERY_POSTS) {
        const f=fixture();f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves),e=r.enemies.find(e=>e.id===post.id)!;
        Object.assign(r.player,{x:e.x,y:e.y+32});r.damageEnemy(e,1);const live=r.enemies.find(a=>a.uid===e.uid)!,mag=live.tactics!.magazine;
        let shot:ReturnType<typeof r.current>['events'][number]|undefined;
        for(let step=1;step<60&&!shot;step++) {r.elapsed=step*.05;r.updateEnemy(live,.05);shot=r.current().events.find(v=>v.type==='shot'&&v.shooter===live.uid);}
        assert.ok(shot?.type==='shot',post.id);assert.equal(shot.weapon,'rifle');assert.equal(live.tactics!.magazine,mag-1);
        assert.equal(r.bullets.find(b=>b.uid===shot.pellets[0].bullet)!.left,actorArchetype(live)!.range);
        assert.ok(r.checkpoint(),f.state.storageError);r.cancelStart();
    }
});

test('an emptied real objective triggers withdrawal without inventing player aggression',()=>{
    const f=fixture();f.raid.player={...RECOVERY_PICKUP,rotation:0};assert.ok(f.saves.persist());f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves);
    const leader=r.enemies.find(e=>e.id==='recovery-leader')!,id=program(leader).crate;
    for(const item of [...r.containers.find(c=>c.id===id)!.inventory.items]) {
        const slot=firstAvailableSlot(f.state.loadout!.bag,item);assert.ok(slot);
        assert.equal(r.transferLoot({...r.current().stamp.world,kind:'container',id},{runId:f.raid.runId,containerId:id,from:'container',to:'bag',uid:item.uid,...slot,quantity:item.qty}),'committed');
    }
    for(let step=1;step<=50;step++) {r.elapsed=step*.05;r.updateEnemy(r.enemies.find(e=>e.uid===leader.uid)!, .05);}
    const current=r.enemies.find(e=>e.uid===leader.uid)!;assert.equal(program(current).phase,'withdraw');assert.equal(current.tactics!.stance,'retreat');
    assert.notEqual(current.tactics!.memory?.source,'damage');assert.equal(r.bullets.length,0);assert.ok(r.checkpoint());r.cancelStart();
});

test('death drops the physical cargo in place and a visible leader loss changes the crew order',()=>{
    const f=fixture();f.state.state='run';const r=new CoastRaidRuntime(f.state,f.saves),leaderId=r.enemies.find(e=>e.id==='recovery-leader')!.uid;
    for(let i=1;i<200&&program(r.enemies.find(e=>e.uid===leaderId)!).phase!=='advance';i++) {r.elapsed=i*.05;for(const e of r.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD))r.updateEnemy(e,.05);}
    const leader=r.enemies.find(e=>e.uid===leaderId)!,id=program(leader).crate,cargo=structuredClone(r.containers.find(c=>c.id===id)!);r.damageEnemy(leader,1000);
    for(let i=0;i<5;i++) {r.elapsed+=.05;for(const e of r.enemies.filter(e=>e.hp>0&&e.tactics?.squad===RECOVERY_SQUAD))r.updateEnemy(e,.05);}
    assert.deepEqual(r.containers.find(c=>c.id===id),cargo);assert.equal(r.containers.filter(c=>c.id===id).length,1);
    assert.ok(r.enemies.filter(e=>e.hp>0&&e.tactics?.squad===RECOVERY_SQUAD).some(e=>program(e).phase==='withdraw'));
    assert.ok(r.checkpoint(),f.state.storageError);r.cancelStart();
});

test('pickup, cargo route, separate retreat posts and a public bypass remain legal at both tides',()=>{
    const f=fixture(),map=BUILDING_WORLD.maps.coast;
    for(const highTide of [false,true]) {
        const context={definition:map,doors:f.raid.maps.coast.doors,highTide};
        for(const point of [RECOVERY_PICKUP,...RECOVERY_ROUTE,...RECOVERY_POSTS.flatMap(p=>[p.home,p.fallback])]) {
            assert.ok(traversable(context,point,'body',10));assert.ok(WORLD.spawns.every(p=>separation(p,point)>=320));
            assert.ok(WORLD.exits.every(p=>separation(p,point)>=160));assert.ok(map.entries.every(p=>separation(p.at,point)>=96));
        }
        for(const point of RECOVERY_ROUTE)assert.ok(spacePath(context,RECOVERY_PICKUP,point).length);
        for(const post of RECOVERY_POSTS)assert.ok(spacePath(context,post.home,post.fallback).length);
        assert.ok(corridor(context,{x:6.5*32,y:30.5*32},{x:6.5*32,y:36.5*32},'body',10));
    }
});
