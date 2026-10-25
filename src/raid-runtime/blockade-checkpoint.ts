import type {EnemyState} from '../checkpoint';
import {actorArchetype,enemyBoundary} from '../enemy-archetypes';
import {blockadeProgram,blockadePassageAllowed,BLOCKADE_WAIT,inCheckpointRect} from '../enemy-blockade';
import {canReceiveReport} from '../enemy-relations';
import type {Point} from '../world';

interface CheckpointWorld {
    readonly elapsed:number;readonly enemies:EnemyState[];readonly player:Point;
    sight(a:Point,b:Point):boolean;
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Registration waits on this commander's actual sight. Orders carry no player coordinates. */
export function advanceBlockadeCheckpoint(world:CheckpointWorld,e:EnemyState,dt:number,notice:(e:EnemyState,text:string)=>void):void {
    const p=blockadeProgram(e);if(!p)return;
    const t=e.tactics!,leader=world.enemies.find(a=>a.uid===p.leader),command=leader&&blockadeProgram(leader);
    // A fatal victim cannot report next frame. Only a witness who can see both the fresh loss
    // and its actual source may identify the player; finding an old corpse conveys no identity.
    const vision=actorArchetype(e)!.vision;
    const witnessedFatal=world.enemies.some(a=>a!==e&&a.hp<=0&&blockadeProgram(a)?.leader===p.leader
        &&a.tactics!.killedBy==='player'&&a.tactics!.memory?.source==='damage'&&a.tactics!.memory.target==='player'
        &&world.elapsed-a.tactics!.memory.time<=.25&&distance(e,a)<=vision&&distance(e,a.tactics!.memory.at)<=vision
        &&world.sight(e,a)&&world.sight(e,a.tactics!.memory.at));
    if(p.phase!=='engaged'&&(witnessedFatal||t.memory?.target==='player'&&t.memory.source==='damage')) {
        p.phase='engaged';p.since=world.elapsed;
        notice(e,'通行许可已暂停，请脱离交火区域。');
    }
    // A guard's real player engagement cancels permission only for reachable group members.
    if(p.phase==='engaged')for(const ally of world.enemies) {
        const order=blockadeProgram(ally);
        if(ally!==e&&ally.hp>0&&order?.leader===p.leader&&order.phase!=='engaged'&&canReceiveReport(e,ally)&&distance(e,ally)<=320)
            Object.assign(order,{phase:'engaged',since:world.elapsed});
    }
    // A visible retreat may de-escalate an unpaid threat. Reload/other paid phases continue;
    // damage and irrevocably committed player attacks have already latched engaged above/at windup.
    const boundary=enemyBoundary(e)!;
    if(p.phase!=='engaged'&&t.stance==='hostile'&&t.memory?.target==='player'&&!['windup','release'].includes(t.phase)
        &&distance(e,world.player)<=vision&&world.sight(e,world.player)
        &&(blockadePassageAllowed(e,world.player)||distance(boundary.at,world.player)>=boundary.radius))t.stance='warning';
    if(e.uid===p.leader&&p.phase==='waiting') {
        const seesWaiting=t.stance!=='hostile'&&inCheckpointRect(BLOCKADE_WAIT,world.player)
            &&distance(e,world.player)<=actorArchetype(e)!.vision&&world.sight(e,world.player);
        p.waited=seesWaiting?Math.min(4,p.waited+dt):0;
        if(p.waited===4) {
            p.phase='granted';p.since=world.elapsed;
            notice(e,'本次行动公共通道许可已登记，请沿绿色标记通过，后场仍受限。');
        }
    }
    if(e.uid!==p.leader&&leader&&leader.hp>0&&command&&p.phase!=='engaged'&&canReceiveReport(leader,e)&&distance(e,leader)<=320)
        Object.assign(p,{phase:command.phase,waited:command.waited,since:command.since});
}
