import type { EnemyState } from '../checkpoint';
import { actorArchetype, type EnemyProgram } from '../enemy-archetypes';
import { canReceiveReport } from '../enemy-relations';
import { RECOVERY_PICKUP, RECOVERY_POSTS, RECOVERY_ROUTE } from '../enemy-recovery';
import type { LootContainer } from '../loot';
import type { Point } from '../world';

type Program=Extract<EnemyProgram,{kind:'recovery'}>;
interface ObjectiveWorld {
    readonly elapsed:number;readonly enemies:EnemyState[];readonly containers?:readonly LootContainer[];
    sight(a:Point,b:Point):boolean;
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const program=(e:EnemyState):Program|null=>e.tactics?.version===2&&e.tactics.program.kind==='recovery'?e.tactics.program:null;

/** Static cargo orders never contain a player position. Each recipient saves the last order it could
 * actually receive; it does not follow the commander's live phase from outside radio range. */
export function recoveryObjective(world:ObjectiveWorld,e:EnemyState,notice:(e:EnemyState,text:string)=>void):Readonly<Point>|undefined {
    const p=program(e);if(!p)return;
    const leader=world.enemies.find(a=>a.uid===p.leader),lead=leader&&program(leader),t=e.tactics!;
    const transition=(phase:Program['phase'],leg:Program['leg']=p.leg)=>{
        if(p.phase===phase&&p.leg===leg)return;
        p.phase=phase;p.leg=leg;p.since=world.elapsed;e.repath=0;e.path=[];
    };
    if(e.uid===p.leader) {
        p.heardAt=world.elapsed;
        const crate=world.containers?.find(c=>c.id===p.crate&&c.kind==='crate');
        // Only the nearby, visible objective's inventory is observed. Carrying keeps it at this body.
        const seesCrate=!!crate&&distance(e,crate)<56&&world.sight(e,crate);
        if(t.stance==='retreat'||!crate||seesCrate&&!crate.inventory.items.length) {
            transition('withdraw');t.stance='retreat';
        } else if(p.phase==='collect'&&seesCrate&&distance(e,crate)<20) {
            transition('loading',0);notice(e,'正在回收物资，请从公共通道绕行。');
        } else if(p.phase==='loading'&&world.elapsed-p.since>=4&&t.stance!=='hostile')transition('advance',0);
        else if(p.phase==='advance'&&distance(e,RECOVERY_ROUTE[p.leg])<12) {
            if(p.leg<2)transition('advance',(p.leg+1) as Program['leg']);
            else {transition('delivered',2);notice(e,'回收完成，正在撤回。');}
        } else if(p.phase==='delivered'&&world.elapsed-p.since>=6)transition('withdraw');
        for(const ally of world.enemies) {
            const order=program(ally);
            if(ally===e||ally.hp<=0||!order||order.leader!==e.uid||order.crate!==p.crate||order.phase==='withdraw'
                ||!canReceiveReport(e,ally)||distance(e,ally)>320||order.since>=p.since)continue;
            Object.assign(order,{phase:p.phase,leg:p.leg,since:p.since,heardAt:world.elapsed});ally.repath=0;ally.path=[];
        }
    } else {
        const radio=!!leader&&leader.hp>0&&!!lead&&canReceiveReport(leader,e)&&distance(e,leader)<=320;
        if(radio)p.heardAt=world.elapsed;
        const sawDeath=!!leader&&leader.hp<=0&&distance(e,leader)<=actorArchetype(e)!.vision&&world.sight(e,leader);
        if(t.stance==='retreat'||sawDeath||!radio&&world.elapsed-p.heardAt>12&&p.phase!=='delivered')transition('withdraw');
    }
    const post=RECOVERY_POSTS.find(a=>a.id===e.id)!;
    if(p.phase==='withdraw') {t.stance='retreat';e.state='return';return post.fallback;}
    if(e.uid===p.leader) {
        if(t.stance==='hostile')return {x:e.x,y:e.y};
        return p.phase==='collect'||p.phase==='loading'?RECOVERY_PICKUP:RECOVERY_ROUTE[p.leg];
    }
    if(p.phase==='collect'||p.phase==='loading')return e.id==='mercenary-scout'?RECOVERY_ROUTE[0]:post.home;
    if(p.phase==='delivered')return post.fallback;
    // Alternate the two armed cover roles at each committed leg. The scout checks the next static waypoint.
    if(e.id==='mercenary-scout')return RECOVERY_ROUTE[Math.min(2,p.leg+1)];
    const covering=p.leg%2===0?e.id==='mercenary-support':e.id==='mercenary-assault';
    return covering?RECOVERY_ROUTE[Math.max(0,p.leg-1)]:RECOVERY_ROUTE[p.leg];
}
