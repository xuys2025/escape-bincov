import type { EnemyState } from './checkpoint';
import { initialTactics, type ArchetypeId } from './enemy-archetypes';
import type { LayeredRaid } from './expansion-state';
import type { LootContainer } from './loot';
import type { Point } from './world';

export const RECOVERY_SQUAD = 'market-recovery-v2';
const at = (x:number,y:number):Readonly<Point> => Object.freeze({x:(x+.5)*32,y:(y+.5)*32});
export const RECOVERY_PICKUP = at(18,34);
export const RECOVERY_ROUTE = Object.freeze([at(24,34),at(28,34),at(32,34)]);
export const RECOVERY_POSTS:readonly Readonly<{id:ArchetypeId;home:Readonly<Point>;fallback:Readonly<Point>}>[] = Object.freeze([
    Object.freeze({id:'recovery-leader',home:at(20,34),fallback:at(32,33)}),
    Object.freeze({id:'mercenary-scout',home:at(32,34),fallback:at(34,33)}),
    Object.freeze({id:'mercenary-assault',home:at(24,34),fallback:at(28,33)}),
    Object.freeze({id:'mercenary-support',home:at(28,34),fallback:at(30,33)}),
]);

/** Install one existing crate and its four owners inside the uncommitted deployment candidate.
 * No extra container, inventory, identity, random draw or persistent write is created. */
export function installRecoveryProgram(raid:LayeredRaid):void {
    if(raid.elapsed!==0||![2,3].includes(raid.version))throw Error('遭遇只能在新街区行动初始化。');
    const layer=raid.maps.coast,team=layer.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD);
    const leader=team.find(e=>e.id==='recovery-leader');
    const crate=layer.containers.filter(c=>c.kind==='crate').sort((a,b)=>Number(!a.inventory.items.length)-Number(!b.inventory.items.length)||Math.hypot(a.x-RECOVERY_PICKUP.x,a.y-RECOVERY_PICKUP.y)
        -Math.hypot(b.x-RECOVERY_PICKUP.x,b.y-RECOVERY_PICKUP.y)||a.id.localeCompare(b.id,'en'))[0];
    if(!leader||!crate||team.length!==4||RECOVERY_POSTS.some(p=>!team.some(e=>e.id===p.id&&e.home.x===p.home.x&&e.home.y===p.home.y)))
        throw Error('回收队与物资来源不符。');
    for(const e of team)e.tactics=initialTactics(e.id,RECOVERY_SQUAD,{kind:'recovery',leader:leader.uid,crate:crate.id,phase:'collect',leg:0,since:0,heardAt:0});
    Object.assign(crate,RECOVERY_PICKUP);
    crate.name=`回收运输箱 · ${crate.name}`;
}

/** Runtime calls this on its current live entities after the controller, including after a door transaction
 * has restored object identities. Cargo and the carrier's program then share one ordinary world checkpoint. */
export function syncRecoveryCargo(enemy:EnemyState,containers:LootContainer[]):void {
    const t=enemy.tactics,p=t?.version===2?t.program:null;
    if(enemy.hp<=0||p?.kind!=='recovery'||enemy.uid!==p.leader||p.phase!=='advance')return;
    const crate=containers.find(c=>c.id===p.crate&&c.kind==='crate');
    if(crate)Object.assign(crate,{x:enemy.x,y:enemy.y});
}
