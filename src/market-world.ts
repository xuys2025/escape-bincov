/** New deployments only. Legacy layouts and active checkpoint contents are never regenerated. */
import type { SaveDataV1 } from './domain';
import { BUILDING_WORLD, buildingRunConfig } from './building-world';
import { generateRunBase, partitionRunLoot, TILE, WORLD, type Point, type RunConfig } from './world';
import { findLanding, separation, traversable } from './spatial';
import type { LayeredRaid, WorldDefinition } from './expansion-state';
import { repairDeficit, STORY_CABINET, STORY_LAYOUT, STORY_WORLD } from './story';

const at = (x: number, y: number): Point => ({ x: (x + .5) * TILE, y: (y + .5) * TILE });
export const MARKET_ANCHORS = {
    'ch01-sc-freezer': { ...at(23, 39), radius: 72, title: '旧冷柜' },
    'ch01-sc-breaker': { ...at(29, 40), radius: 43, title: '配电箱' },
    [STORY_CABINET]: { ...at(28, 37), radius: 43, title: '蔡建平 · 备用工具柜' },
} as const;
function marketWorld(): WorldDefinition {
    const world = structuredClone(BUILDING_WORLD);
    world.id = STORY_WORLD; world.revision = STORY_LAYOUT;
    for (const map of Object.values(world.maps)) for (const region of map.regions ?? [])
        region.id = region.id?.replace(`${BUILDING_WORLD.id}/${BUILDING_WORLD.revision}/`, `${world.id}/${world.revision}/`);
    return world;
}
export const MARKET_WORLD = marketWorld();

/** `profile` is the owned inventory BEFORE D.beginRun deducts carried goods. Exactly 60 source records before luck. */
export function marketRunConfig(seed: number | string, profile: SaveDataV1): RunConfig {
    const base = generateRunBase(seed), needs = repairDeficit(profile);
    const supplies = Object.entries(needs).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ id, qty }));
    let replaced = 0;
    const remaining = base.loot.filter(p => {
        if (replaced >= supplies.length || ['sample', 'ledger'].includes(p.id)
            || WORLD.tiles[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)] === 4) return true;
        replaced++; return false;
    });
    if (replaced !== supplies.length) throw new Error('维修物资缺少可替换的原始投放记录。');
    const partition = partitionRunLoot(remaining, Math.min(9, Math.floor((20 - supplies.length) / 2)));
    partition.containers.push({ id: STORY_CABINET, name: MARKET_ANCHORS[STORY_CABINET].title,
        x: MARKET_ANCHORS[STORY_CABINET].x, y: MARKET_ANCHORS[STORY_CABINET].y, items: supplies });
    return buildingRunConfig(seed, { ...base, ...partition });
}

/** Reserve the cabinet's interaction circle after existing luck/enemy placement. Move only initial colliding entities,
 * within their original map, preserving identities and goods. Authored enemy posts lie outside this circle. */
export function protectMarketCabinet(raid: LayeredRaid): void {
    const layer = raid.maps.coast, map = MARKET_WORLD.maps.coast, cabinet = MARKET_ANCHORS[STORY_CABINET];
    const context = { definition: map, doors: layer.doors, highTide: true };
    const entities = [...layer.loot, ...layer.containers.filter(c => c.id !== STORY_CABINET), ...layer.enemies];
    for (const entity of entities) {
        if (separation(entity, cabinet) >= cabinet.radius) continue;
        if ('tactics' in entity && entity.tactics) throw new Error('剧情保护区与固定遭遇重叠。');
        const occupied = [...entities.filter(e => e !== entity), ...map.entries.map(e => e.at), ...WORLD.notes, ...WORLD.exits];
        const points = map.cells.flatMap((row, y) => row.map((_cell, x) => at(x, y)))
            .filter(p => separation(p, cabinet) >= cabinet.radius && traversable(context, p, 'body', 10))
            .sort((a, b) => separation(a, entity) - separation(b, entity) || a.y - b.y || a.x - b.x);
        const point = points.find(p => { const landing = findLanding(context, p, occupied); return landing && landing.x === p.x && landing.y === p.y; });
        if (!point) throw new Error('剧情保护区没有合法迁移落点。');
        Object.assign(entity, point);
        if ('home' in entity) { entity.home = { ...point }; entity.target = { ...point }; entity.path = []; }
    }
}
