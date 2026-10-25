import { entityUid, type LayeredRaid } from './expansion-state';
import type { ArchetypeId } from './enemy-archetypes';

/** A market-backstreet ecology sample, separate from human command squads. */
export const FAUNA_SQUAD = 'market-fauna-v1';
export const FAUNA_SITES: readonly Readonly<{ id: ArchetypeId; x: number; y: number; foodX?: number }>[] = Object.freeze([
    Object.freeze({ id:'tidal-crab',x:18,y:34,foodX:19 }),
    Object.freeze({ id:'saltback-dog',x:24,y:34,foodX:25 }),
    Object.freeze({ id:'saltback-dog',x:27,y:34 }),
    Object.freeze({ id:'sac-spitter',x:32,y:34,foodX:31 }),
]);

/** Move three of this group's four carried food units to the nest edges at birth.
 * There is one food budget: floor + surviving supplies + corpses must remain four.
 * The whole deployment candidate commits atomically; no RNG or external write here. */
export function installFaunaFood(raid: LayeredRaid): void {
    if(raid.elapsed!==0 || ![2,3].includes(raid.version))throw new Error('遭遇只能在新街区行动初始化。');
    const allocations=FAUNA_SITES.filter(site=>site.foodX!==undefined).map(site=>{
        const keeper = raid.maps.coast.enemies.find(e => e.id === site.id && e.tactics?.squad === FAUNA_SQUAD
            && e.home.x === (site.x+.5)*32 && e.home.y === (site.y+.5)*32);
        const food = keeper?.tactics?.supplies.find(s => s.id === 'food' && s.qty > 0);
        if (!keeper?.tactics || !food) throw new Error('食源与携带预算不符。');
        return {site,tactics:keeper.tactics,food};
    });
    for(const {site,tactics,food} of allocations){
        food.qty--;
        tactics.supplies = tactics.supplies.filter(s => s.qty > 0);
        raid.maps.coast.loot.push({ uid:entityUid(raid,raid.nextEntity++),id:'food',qty:1,relief:false,
            x:(site.foodX!+.5)*32,y:(site.y+.5)*32 });
    }
}
