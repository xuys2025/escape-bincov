import { archetype, initialTactics, type ArchetypeId, type EnemyProgram } from './enemy-archetypes';
import type { LayeredRaid, WorldDefinition } from './expansion-state';
import { separation, traversable } from './spatial';
import { WORLD } from './world';
import { MARKET_POSTS, MARKET_RAIDERS, MARKET_STORES } from './enemy-posts';
import { BLOCKADE_POSTS, BLOCKADE_SQUAD, installBlockadeProgram } from './enemy-blockade';
import { FAUNA_SITES, FAUNA_SQUAD, installFaunaFood } from './enemy-fauna';
import { AFFECTED_POSTS, AFFECTED_SQUAD } from './enemy-affected';
import { installRecoveryProgram, RECOVERY_POSTS, RECOVERY_SQUAD } from './enemy-recovery';

/** Authored street encounter, away from every deployment, extraction and stair landing.
 * Replaces three, six on the market seed variant, or seven on the fauna variant before one deployment commit.
 * No extra population or RNG draws; fauna floor food comes from its carried supply budget. */
export function installStreetEncounter(raid: LayeredRaid, world: WorldDefinition): void {
    if (raid.elapsed !== 0 || ![2, 3].includes(raid.version) || world.id !== 'coast-buildings-v1') throw new Error('遭遇只能在新街区行动初始化。');
    const members: { id: ArchetypeId; x: number; y: number; squad: string; program?: EnemyProgram }[] = [
        { id: 'raider-melee', x: 20, y: 18, squad: 'street-salvage' }, { id: 'raider-gunner', x: 28, y: 22, squad: 'street-salvage' }, { id: 'raider-lookout', x: 25, y: 13, squad: 'street-salvage' },
    ];
    // One bounded authored variant in every fifth seed; reuse existing birth-roster slots.
    const market = raid.seed % 5 === 0;
    if (market) members.push(...MARKET_POSTS.map(post => ({ id: post.id, x: post.home.x / 32 - .5, y: post.home.y / 32 - .5, squad: MARKET_RAIDERS })));
    const fauna = raid.seed % 5 === 1;
    if (fauna) members.push(...FAUNA_SITES.map(site => ({ id:site.id,x:site.x,y:site.y,squad:FAUNA_SQUAD })));
    // One in fifteen: leave the fixed seed42 street baseline intact and alternate real armament across matching seeds.
    if (raid.seed % 15 === 2) members.push(...AFFECTED_POSTS.map(post => ({ id:post.id, x:post.home.x/32-.5, y:post.home.y/32-.5, squad:AFFECTED_SQUAD,
        program: { kind:'affected' as const, armament: post.id === 'tide-ritualist' ? Math.floor(raid.seed/5)%2 ? 'rifle' as const : 'polearm' as const : 'unarmed' as const } })));
    if(raid.seed%5===3)members.push(...RECOVERY_POSTS.map(post=>({id:post.id,x:post.home.x/32-.5,y:post.home.y/32-.5,squad:RECOVERY_SQUAD})));
    if(raid.seed%5===4)members.push(...BLOCKADE_POSTS.map(post=>({id:post.id,x:post.home.x/32-.5,y:post.home.y/32-.5,squad:BLOCKADE_SQUAD})));
    const layer = raid.maps.coast, map = world.maps.coast;
    const used = new Set<string>();
    for (const member of members) {
        const at = { x: (member.x + .5) * 32, y: (member.y + .5) * 32 };
        // Keep the two guaranteed story-resource guards and every already assigned identity.
        const enemy = layer.enemies.filter(e => !used.has(e.uid) && e.id !== 'elite').sort((a, b) => separation(a, at) - separation(b, at) || a.uid.localeCompare(b.uid, 'en'))[0];
        if (!enemy || !traversable({ definition: map, doors: layer.doors, highTide: true }, at, 'body', 10)
            || WORLD.spawns.some(p => separation(p, at) < 320) || WORLD.exits.some(p => separation(p, at) < 160)
            || map.entries.some(p => separation(p.at, at) < 96)
            || layer.enemies.some(e => e !== enemy && separation(e, at) < 24)) throw new Error('遭遇布置违反安全距离。');
        Object.assign(enemy, at, { id: member.id, hp: archetype(member.id)!.hp, home: { ...at }, target: { ...at },
            state: 'patrol', path: [], rotation: 0, timer: 0, cooldown: 0, alert: 0, repath: 0,
            tactics: initialTactics(member.id, member.squad, member.program) });
        used.add(enemy.uid);
    }
    if (market) {
        const crate = layer.containers.filter(c => c.kind === 'crate').sort((a,b) => separation(a, MARKET_STORES)-separation(b, MARKET_STORES) || a.id.localeCompare(b.id, 'en'))[0];
        if (!crate || !traversable({ definition: map, doors: layer.doors, highTide: true }, MARKET_STORES, 'body', 10)) throw new Error('据点缺少合法物资来源。');
        // Reposition one existing supply crate, preserving its identity, contents and economy.
        Object.assign(crate, MARKET_STORES);
    }
    if (fauna) installFaunaFood(raid);
    if(raid.seed%5===3)installRecoveryProgram(raid);
    if(raid.seed%5===4)installBlockadeProgram(raid);
    raid.version = raid.version === 3 ? 5 : 4;
    raid.roster = Object.values(raid.maps).flatMap(m => m.enemies.map(e => ({ uid: e.uid, id: e.id })));
}
