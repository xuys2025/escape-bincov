import { archetype, initialTactics, type ArchetypeId } from './enemy-archetypes';
import type { LayeredRaid, WorldDefinition } from './expansion-state';
import { MALL_ANCHORS } from './mall-world';
import { separation, traversable } from './spatial';
import type { Point } from './world';

export const MALL_RAIDERS = 'mall-fashion-raiders-v1';
const at = (x: number, y: number): Readonly<Point> => Object.freeze({ x: (x + .5) * 32, y: (y + .5) * 32 });
/** F2 fashion-store pocket; all landings and the furnished east/terrace route stay clear.
 * Alternatives handle an existing elite occupying a post, without moving either story-resource guard. */
export const MALL_RAIDER_POSTS: readonly Readonly<{ id: ArchetypeId; positions: readonly Readonly<Point>[] }>[] = [
    { id: 'raider-melee', positions: [at(20, 15), at(20, 16), at(19, 15)] },
    { id: 'raider-gunner', positions: [at(28, 13), at(28, 12), at(29, 13)] },
    { id: 'raider-lookout', positions: [at(26, 9), at(26, 10), at(27, 9)] },
];
export const MALL_RAIDER_STORES = [at(27, 17), at(26, 17), at(28, 17)] as const;

/** Only a new layout-3 deployment candidate calls this, before its one atomic commit.
 * Same 25 identities, floor allocation, two elites, loot contents and RNG state. Existing v1 tactics suffice:
 * no new persistent fields, controller or world revision; old active mall raids never call this initializer. */
export function installMallEncounter(raid: LayeredRaid, world: WorldDefinition): void {
    if (raid.elapsed !== 0 || ![2, 3].includes(raid.version) || world.id !== 'mall-v3') throw new Error('遭遇只能在新商场三版行动初始化。');
    const layer = raid.maps['mall-f2'], map = world.maps['mall-f2'];
    const used = new Set<string>();
    const fits = (p: Point) => traversable({ definition: map, doors: layer.doors, highTide: true }, p, 'body', 10)
        && map.entries.every(entry => separation(entry.at, p) >= 144);
    for (const post of MALL_RAIDER_POSTS) {
        let installed = false;
        for (const p of post.positions) {
            const enemy = layer.enemies.filter(e => e.id !== 'elite' && !used.has(e.uid))
                .sort((a, b) => separation(a, p) - separation(b, p) || a.uid.localeCompare(b.uid, 'en'))[0];
            if (!enemy || !fits(p) || layer.enemies.some(e => e !== enemy && separation(e, p) < 24)) continue;
            Object.assign(enemy, p, { id: post.id, hp: archetype(post.id)!.hp, home: { ...p }, target: { ...p },
                state: 'patrol', path: [], rotation: 0, timer: 0, cooldown: 0, alert: 0, repath: 0,
                tactics: initialTactics(post.id, MALL_RAIDERS) });
            used.add(enemy.uid); installed = true; break;
        }
        if (!installed) throw new Error('商场遭遇缺少安全岗位。');
    }
    const destination = MALL_RAIDER_STORES.find(p => fits(p) && layer.containers.every(c => separation(c, p) >= 24));
    // Keep the existing fixed upstairs resource anchor intact; move one other physical crate, never clone contents.
    const crate = layer.containers.filter(c => c.kind === 'crate' && separation(c, MALL_ANCHORS.box2) > 1)
        .sort((a, b) => separation(a, MALL_RAIDER_STORES[0]) - separation(b, MALL_RAIDER_STORES[0]) || a.id.localeCompare(b.id, 'en'))[0];
    if (!destination || !crate) throw new Error('商场遭遇缺少现有物资来源。');
    Object.assign(crate, destination);
    raid.version = raid.version === 3 ? 5 : 4;
    raid.roster = Object.values(raid.maps).flatMap(m => m.enemies.map(e => ({ uid: e.uid, id: e.id })));
}
