import * as D from './domain';
import { TILE, WORLD, generateRun, type Point, type RunConfig, type MapData } from './world';
import type { EnemyState } from './checkpoint';
import { entityUid, newTraining, type ExpansionState, type LayeredRaid, type WorldDefinition } from './expansion-state';
import { findLanding, type Cell, type SpaceDefinition } from './spatial';
import { initialLuck } from './reputation-luck';

const at = (x: number, y: number): Point => ({ x: (x + .5) * 32, y: (y + .5) * 32 });
export function roomMap(id: string, cols: number, rows: number, name: string, floor: string): SpaceDefinition {
    return { id, name, floor, tile: 32, doors: [], entries: [], regions: [], decorations: [],
        cells: Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x): Cell =>
            x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 'wall' : 'floor')) };
}
export function addDoor(map: SpaceDefinition, id: string, x: number, y: number, horizontal = true): void {
    map.cells[y][x] = 'floor';
    map.doors.push({ id, x, y, anchors: horizontal ? [at(x - 1, y), at(x + 1, y)] : [at(x, y - 1), at(x, y + 1)] });
}
export function connect(a: SpaceDefinition, aId: string, aAt: Point, aLabel: string,
    b: SpaceDefinition, bId: string, bAt: Point, bLabel: string): void {
    a.entries.push({ id: aId, at: aAt, targetMap: b.id, targetEntry: bId, landing: bAt, label: aLabel });
    b.entries.push({ id: bId, at: bAt, targetMap: a.id, targetEntry: aId, landing: aAt, label: bLabel });
}

function residentWorld(): WorldDefinition {
    const id = 'coast-buildings-v1', revision = 'resident-layout-1';
    // These are the existing view identities; display copy and region ordering must not change them.
    const regionId = (mapId: string, key: string) => `${id}/${revision}/${mapId}/region/${key}`;
    const coast: SpaceDefinition = { id: 'coast', name: '沿海街区', floor: '室外 / 一楼', tile: 32, doors: [], entries: [],
        cells: WORLD.tiles.map(row => row.map((t): Cell => t === 2 || t === 3 ? 'wall' : t === 4 ? 'tide' : 'floor')) };
    // Enlarge only the new world's resident footprint. Original coast-v1/v2 remain untouched.
    for (let y = 7; y <= 12; y++) for (let x = 10; x <= 18; x++) coast.cells[y][x] = x === 10 || x === 18 || y === 7 || y === 12 ? 'wall' : 'floor';
    for (const x of [13, 16]) for (let y = 9; y <= 11; y++) coast.cells[y][x] = 'wall';
    addDoor(coast, 'resident-front', 14, 12, false);
    addDoor(coast, 'resident-west', 13, 10);
    addDoor(coast, 'resident-east', 16, 10);
    coast.cells[7][11] = 'window'; coast.cells[7][17] = 'window'; coast.cells[10][10] = 'window';
    coast.cells[9][11] = 'low'; coast.cells[11][17] = 'low';
    coast.regions = [{ x: 10 * 32, y: 7 * 32, w: 9 * 32, h: 6 * 32, name: '褪色居民楼 · 一楼', id: regionId(coast.id, 'resident-ground') }];
    const upstairs = roomMap('resident-f2', 12, 10, '褪色居民楼', '二楼');
    const basement = roomMap('resident-b1', 12, 9, '褪色居民楼', '地下');
    for (const map of [upstairs, basement]) {
        for (const x of [4, 7]) for (let y = 3; y < map.cells.length - 1; y++) map.cells[y][x] = 'wall';
        addDoor(map, `${map.id}-west`, 4, 5); addDoor(map, `${map.id}-east`, 7, 5);
        map.cells[4][2] = 'low'; map.cells[6][9] = 'low';
        map.regions = [{ x: 32, y: 96, w: 96, h: 160, name: map === upstairs ? '西侧住户' : '工具间', id: regionId(map.id, map === upstairs ? 'west-home' : 'tools') },
            { x: 256, y: 96, w: 96, h: 128, name: map === upstairs ? '东侧住户' : '设备间', id: regionId(map.id, map === upstairs ? 'east-home' : 'equipment') },
            { x: 160, y: 96, w: 64, h: 160, name: '公共走廊', id: regionId(map.id, 'hall') }];
    }
    for (let x = 8; x <= 10; x++) upstairs.cells[3][x] = 'wall';
    addDoor(upstairs, 'resident-storage', 9, 3, false);
    upstairs.regions!.push({ x: 256, y: 32, w: 96, h: 64, name: '储藏室', id: regionId(upstairs.id, 'storage') });
    upstairs.cells[0][2] = 'window'; upstairs.cells[4][11] = 'window';
    connect(coast, 'resident-up', at(17, 8), '上楼 · 二楼', upstairs, 'resident-down', at(9, 2), '下楼 · 一楼');
    connect(coast, 'resident-basement', at(15, 8), '下楼 · 地下', basement, 'resident-back', at(7, 2), '上楼 · 一楼');
    return { id, revision, maps: { coast, [upstairs.id]: upstairs, [basement.id]: basement },
        enemyCount: 25, spawnMap: coast.id, spawn: WORLD.spawns[0] };
}
export const BUILDING_WORLD = residentWorld();

export function mapPresentation(map: SpaceDefinition): MapData {
    const code = { floor: 5, wall: 3, window: 5, low: 5, tide: 4 };
    const base = map.id === 'coast' ? WORLD : null;
    return { tiles: map.cells.map((row, y) => row.map((cell, x) => base && (x < 10 || x > 18 || y < 7 || y > 12) ? base.tiles[y][x] : code[cell])), buildings: base?.buildings.filter(b => b.name !== '褪色居民楼') ?? [],
        zones: base?.zones ?? [], spawns: [], exits: base?.exits ?? [], notes: base?.notes ?? [], lootSpots: [], enemySpots: [] };
}

/** One generation allocates the entire population and supplies across all maps. */
export function initializeBuildingRaid(state: ExpansionState, loadout: D.RunLoadout, config: RunConfig): void {
    const world = BUILDING_WORLD;
    const maps: LayeredRaid['maps'] = Object.fromEntries(Object.values(world.maps).map(m => [m.id, {
        doors: Object.fromEntries(m.doors.map(d => [d.id, false])), localTime: 0, enemies: [], loot: [], containers: [], bullets: [], noise: null,
    }]));
    const place = (mapId: string, point: Point, highTide = false): Point => {
        const map = world.maps[mapId];
        // Initial placements never occupy closed doors or a platform.
        const landing = findLanding({ definition: map, doors: maps[mapId].doors, highTide }, point, map.entries.map(e => e.at));
        if (!landing) throw new Error('初始投放没有可用落点。');
        return landing;
    };
    config.enemies.forEach((entry, i) => {
        const mapId = i === 0 ? 'resident-f2' : i === 1 ? 'resident-b1' : 'coast';
        const point = place(mapId, mapId === 'coast' ? entry : at(2, 6), config.initialHigh);
        const enemy: EnemyState = { uid: `enemy-${i}`, id: entry.id, hp: D.ENEMIES[entry.id].hp, ...point, rotation: 0,
            home: { ...point }, target: { ...point }, state: 'patrol', timer: 2, cooldown: .8, path: [], repath: 0, alert: 0 };
        maps[mapId].enemies.push(enemy);
    });
    let serial = 1;
    config.loot.forEach((entry, i) => {
        const mapId = i < 2 && !['sample', 'ledger'].includes(entry.id) ? (i === 0 ? 'resident-f2' : 'resident-b1') : 'coast';
        const point = place(mapId, mapId === 'coast' ? entry : at(9, 6));
        maps[mapId].loot.push({ uid: entityUid({ version: 2, runId: loadout.runId! }, serial++), id: entry.id, qty: entry.qty, relief: false, ...point, ...D.factoryGun(entry.id) });
    });
    config.containers.forEach(entry => {
        const point = place('coast', entry), inventory = D.createInventory(6, 5);
        for (const item of entry.items) if (D.addItem(inventory, item.id, item.qty, false, false, true, () => entityUid({ version: 2, runId: loadout.runId! }, serial++))) throw new Error('物资箱容量不足。');
        maps.coast.containers.push({ id: entry.id, runId: loadout.runId!, kind: 'crate', name: entry.name, ...point, inventory });
    });
    state.base.location = 'raid'; state.base.restSeconds = 0; state.base.energizedGranted = false;
    // The raid's rules follow the expansion it starts from: v3 (perks, new critical rules) only from a v3 expansion.
    state.raid = { version: state.version === 3 ? 3 : 2, worldVersion: world.id, layoutRevision: world.revision, seed: config.seed, runId: loadout.runId!, shockAt: -10,
        currentMap: world.spawnMap, player: { ...config.spawn, rotation: 0 }, loadout: structuredClone(loadout), elapsed: 0,
        initialHigh: config.initialHigh, highTide: config.initialHigh, warned: false, tideChanged: false, kills: 0, rng: (config.seed + 771) >>> 0,
        nextEntity: serial, maps, pursuits: [], training: newTraining(), reloadLeft: 0, fireCooldown: 0, knife: false, hitTime: 0,
        roster: Object.values(maps).flatMap(m => m.enemies.map(e => ({ uid: e.uid, id: e.id }))), eventRolled: false, mapEvent: 'none' };
    initialLuck(state);
}

export function buildingRunConfig(seed: number | string): RunConfig {
    const config = generateRun(seed), random = D.seededRandom(config.seed + 11939);
    const rare = ['strengthDose', 'constitutionDose', 'techniqueDose', 'luckyCharm', 'unluckyCharm', 'luckySachet', 'unluckySachet'];
    for (const entry of [...config.loot, ...config.containers.flatMap(c => c.items)]) {
        if (['sample', 'ledger', 'scrap', 'wire', 'fuse'].includes(entry.id)) continue;
        const rolled = random();
        if (rolled < .04) { entry.id = rare[Math.floor(random() * rare.length)]; entry.qty = 1; }
        else if (rolled < .14) { entry.id = 'cloth'; entry.qty = 1 + Math.floor(random() * 2); }
    }
    // #28 M2-13: gunsmith finds (D.gunsmithFind) replace only gun and valuable records, after the pass above and on a
    // stream of their own, so every other record stays as it was and the budget stays 60. A flooded cache (a tide tile)
    // is a high-risk spot. The mall deals out these same records, finds included.
    const finds = D.seededRandom(config.seed + 31991);
    const judge = (entry: { id: string; qty: number }, risky: boolean) => {
        const found = D.gunsmithFind(entry.id, finds, { risky, gun: true });
        if (found) { entry.id = found; entry.qty = D.findQuantity(found); }
    };
    const flooded = (p: Point) => WORLD.tiles[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)] === 4;
    for (const entry of config.loot) judge(entry, flooded(entry));
    // Crates take only spots that stay dry at high tide, so their records are never flooded.
    for (const item of config.containers.flatMap(c => c.items)) judge(item, false);
    return config;
}
