import type { EnemyState } from './checkpoint';
import { initialTactics, type ArchetypeId, type EnemyProgram } from './enemy-archetypes';
import type { LayeredRaid } from './expansion-state';
import type { Point } from './world';

export type BlockadeProgram = Extract<EnemyProgram,{kind:'blockade'}>;
export interface CheckpointRect {readonly x:number;readonly y:number;readonly w:number;readonly h:number;}
export const BLOCKADE_SQUAD='market-checkpoint-v2';
const at=(x:number,y:number):Readonly<Point>=>Object.freeze({x:(x+.5)*32,y:(y+.5)*32});
export const BLOCKADE_WAIT=Object.freeze({x:18.5*32,y:34.25*32,w:3*32,h:.5*32});
export const BLOCKADE_PASSAGE=Object.freeze({x:21*32,y:34.25*32,w:15*32,h:.5*32});
export const BLOCKADE_WAIT_POINT=at(20,34);
export const BLOCKADE_POSTS:readonly Readonly<{id:ArchetypeId;home:Readonly<Point>;fallback:Readonly<Point>;patrol:readonly Readonly<Point>[]} >[]=Object.freeze([
    Object.freeze({id:'blockade-sentry',home:at(24,34),fallback:at(24,33),patrol:Object.freeze([at(24,34)])}),
    Object.freeze({id:'blockade-sergeant',home:at(28,34),fallback:at(28,33),patrol:Object.freeze([at(28,34)])}),
    Object.freeze({id:'blockade-patrol',home:at(32,34),fallback:at(32,33),patrol:Object.freeze([at(32,34),at(30,34),at(30,33),at(32,33)])}),
]);
export const inCheckpointRect=(r:CheckpointRect,p:Point)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
export function blockadeProgram(e:Pick<EnemyState,'tactics'>):BlockadeProgram|null {
    const t=e.tactics;return t?.version===2&&t.program.kind==='blockade'?t.program:null;
}
/** Permission is local to this deployment and to the marked public passage. */
export function blockadePassageAllowed(e:EnemyState,point:Point):boolean {
    return blockadeProgram(e)?.phase==='granted'&&inCheckpointRect(BLOCKADE_PASSAGE,point);
}
export function installBlockadeProgram(raid:LayeredRaid):void {
    if(raid.elapsed!==0||![2,3].includes(raid.version))throw Error('遭遇只能在新街区行动初始化。');
    const team=raid.maps.coast.enemies.filter(e=>e.tactics?.squad===BLOCKADE_SQUAD),leader=team.find(e=>e.id==='blockade-sergeant');
    if(!leader||team.length!==3||BLOCKADE_POSTS.some(p=>!team.some(e=>e.id===p.id&&e.home.x===p.home.x&&e.home.y===p.home.y)))throw Error('检查站岗位不符。');
    for(const e of team)e.tactics=initialTactics(e.id,BLOCKADE_SQUAD,{kind:'blockade',leader:leader.uid,phase:'none',waited:0,since:0});
}
/** Mutate only SaveSession's uncommitted candidate; Runtime first checks the actual talk reference. */
export function requestBlockadeRegistration(raid:LayeredRaid,guardUid:string):boolean {
    const layer=raid.maps[raid.currentMap],guard=layer.enemies.find(e=>e.uid===guardUid),p=guard&&blockadeProgram(guard);
    if(!guard||guard.hp<=0||!p||p.phase!=='none')return false;
    const leader=layer.enemies.find(e=>e.uid===p.leader),command=leader&&blockadeProgram(leader);
    if(!leader||leader.hp<=0||!command||command.phase!=='none'||guard.tactics!.stance==='hostile'||leader.tactics!.stance==='hostile'
        ||Math.hypot(leader.x-guard.x,leader.y-guard.y)>320)return false;
    for(const ally of layer.enemies) {
        const order=blockadeProgram(ally);
        if(ally.hp>0&&order?.leader===p.leader&&ally.tactics?.squad===guard.tactics!.squad&&Math.hypot(ally.x-guard.x,ally.y-guard.y)<=320)
            Object.assign(order,{phase:'waiting',waited:0,since:raid.elapsed});
    }
    return true;
}
