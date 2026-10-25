import * as D from './domain';
import { buildingRunConfig, connect, roomMap } from './building-world';
import { entityUid, newTraining, type ExpansionState, type LayeredRaid, type WorldDefinition } from './expansion-state';
import { initialLuck } from './reputation-luck';
import { traversable, type SpaceDefinition } from './spatial';
import type { Point, RunConfig } from './world';
import { MALL_FURNITURE, MALL_V2_LAYOUT, MALL_V2_REGIONS, MALL_V2_SPAWN, MALL_V2_STAIRS, MALL_V3_LAYOUT, furnitureCellName, type FurnitureType, type Placement } from './mall-layout-v2';

const at = (x: number, y: number): Point => ({ x: (x + .5) * 32, y: (y + .5) * 32 });
export const MALL_ANCHORS = {
    spawn: at(4, 10), pair: at(35, 23), box1: at(22, 14), box2: at(27, 31), edge: at(71, 35),
    north: at(59, 3), south: at(41, 51), loading: at(68, 47),
};
export const MALL_PASSAGES = [
    { id: 'P-N', map: 'mall-f1', at: at(60, 6) }, { id: 'P-W', map: 'mall-f1', at: at(8, 13) },
    { id: 'P-S', map: 'mall-f1', at: at(41, 48) }, { id: 'P-E', map: 'mall-f1', at: at(64, 39) },
    { id: 'P-L', map: 'mall-f1', at: at(64, 45) }, { id: 'P-TN', map: 'mall-f2', at: at(64, 28) },
    { id: 'P-TS', map: 'mall-f2', at: at(64, 43) },
];
type Region = NonNullable<SpaceDefinition['regions']>[number];
function rect(map: SpaceDefinition, x: number, y: number, w: number, h: number, cell: 'wall' | 'floor' | 'tide' | 'low') {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) map.cells[row][col] = cell;
}
function region(map: SpaceDefinition, id: string, name: string, x: number, y: number, w: number, h: number, inside = true, sealed = false): Region {
    const r = { id, name, x: x * 32, y: y * 32, w: w * 32, h: h * 32, inside, sealed, theme: parseInt(id.slice(-2)) };
    map.regions!.push(r); return r;
}
function room(map: SpaceDefinition, id: string, name: string, x: number, y: number, w: number, h: number, side: 'left' | 'right' | 'bottom', offset: number, sealed = false) {
    region(map, id, name, x, y, w, h, true, sealed);
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) if (row === y || row === y + h - 1 || col === x || col === x + w - 1) map.cells[row][col] = 'wall';
    if (!sealed) {
        if (side === 'bottom') rect(map, x + offset, y + h - 1, 3, 1, 'floor');
        else rect(map, side === 'left' ? x : x + w - 1, y + offset, 1, 3, 'floor');
    } else rect(map, x + 1, y + 1, w - 2, h - 2, 'wall');
}
/** Walls, regions, rooms and passages shared by every layout revision. */
function mallSkeleton(): { f1: SpaceDefinition; f2: SpaceDefinition } {
    const f1 = roomMap('mall-f1', 76, 56, '滨湾商场', '一层 / 地面室外'), f2 = roomMap('mall-f2', 76, 56, '滨湾商场', '二层');
    // The outside ring and F1 share one continuous layer. F2 never touches that ring.
    for (let x = 8; x <= 64; x++) { f1.cells[6][x] = 'wall'; f1.cells[48][x] = 'wall'; }
    for (let y = 6; y <= 48; y++) { f1.cells[y][8] = 'wall'; f1.cells[y][64] = 'wall'; }
    for (let y = 1; y < 55; y++) for (let x = 1; x < 75; x++) f2.cells[y][x] = x >= 8 && x <= 64 && y >= 6 && y <= 48 ? 'floor' : 'wall';
    for (let x = 8; x <= 64; x++) { f2.cells[6][x] = 'wall'; f2.cells[48][x] = 'wall'; }
    for (let y = 6; y <= 48; y++) { f2.cells[y][8] = 'wall'; f2.cells[y][64] = 'wall'; }
    // Stepped northwest facade, with a wide walkable approach and no isolated corner.
    for (const map of [f1, f2]) for (let y = 6; y <= 10; y++) for (let x = 8; x < 13 - (y - 6); x++) map.cells[y][x] = 'wall';
    region(f1, 'O-01', '弧形步行街 · 室外', 1, 6, 7, 43, false);
    region(f1, 'O-02', '正门广场 · 室外', 8, 1, 57, 5, false);
    region(f1, 'O-03', '东侧巷 · 室外', 65, 6, 10, 38, false);
    region(f1, 'O-04', '车库入口及南街 · 室外', 1, 49, 56, 6, false);
    region(f1, 'O-05', '卸货区 · 室外', 57, 44, 18, 11, false);
    region(f1, 'O-06', '潮汐低地 · 室外', 70, 23, 5, 18, false);
    rect(f1, 70, 23, 5, 18, 'tide'); rect(f1, 10, 51, 11, 4, 'wall'); // closed underground ramp
    room(f1, 'F1-01', '滨湾药房', 9, 7, 18, 11, 'right', 7);
    room(f1, 'F1-02', '红帆炸鸡', 9, 20, 18, 19, 'right', 4);
    region(f1, 'F1-03', '中央超市 · 干货', 30, 20, 24, 11);
    region(f1, 'F1-04', '超市 · 生鲜', 30, 33, 13, 9);
    region(f1, 'F1-05', '超市 · 冷藏', 44, 33, 10, 9);
    room(f1, 'F1-06', '湾角便利', 57, 18, 7, 8, 'left', 3);
    room(f1, 'F1-07', '蓝屏数码', 57, 28, 7, 7, 'left', 2);
    room(f1, 'F1-08', '老陈五金', 57, 37, 7, 7, 'left', 2);
    room(f1, 'F1-09', '北侧仓库', 29, 7, 15, 7, 'bottom', 7);
    room(f1, 'F1-10', '配电间', 45, 14, 9, 4, 'right', 1);
    region(f1, 'F1-11', '东北大堂', 57, 7, 7, 9);
    region(f1, 'F1-12', '东南大堂', 57, 44, 7, 4);
    region(f1, 'F1-13', '西侧服务间', 9, 40, 18, 8);
    region(f1, 'F1-14', '收银及南门厅', 29, 44, 26, 4);
    room(f1, 'F1-15', '封存检修核', 45, 7, 9, 7, 'bottom', 3, true);
    // An office block with three-cell shared service aisles, and an undivided home store.
    region(f2, 'F2-01', '海风服装', 9, 7, 45, 14);
    region(f2, 'F2-02', '食品卖场', 32, 22, 23, 11);
    region(f2, 'F2-03', '非食品卖场', 41, 35, 14, 10);
    region(f2, 'F2-04', '竹木专区', 30, 38, 10, 9);
    region(f2, 'F2-05', '斜分促销专区', 30, 34, 10, 4);
    region(f2, 'F2-06', '儿童乐园', 19, 35, 10, 12);
    room(f2, 'F2-07', '商场办公室', 9, 22, 10, 7, 'right', 2);
    room(f2, 'F2-08', '财务室', 22, 22, 8, 5, 'right', 1);
    room(f2, 'F2-09', '二层仓库', 22, 28, 8, 6, 'right', 2);
    room(f2, 'F2-10', '二层电房', 22, 35, 8, 4, 'right', 1);
    room(f2, 'F2-11', '厕所', 9, 35, 8, 6, 'right', 2);
    room(f2, 'F2-12', '临时仓库', 9, 42, 8, 6, 'right', 2);
    region(f2, 'F2-13', '潮汐家居馆', 57, 17, 7, 26);
    region(f2, 'F2-14', '东北二层大堂', 57, 7, 7, 9);
    region(f2, 'F2-15', '东南二层大堂', 57, 43, 7, 5);
    region(f2, 'F2-16', '西侧服务通道', 9, 30, 13, 4);
    room(f2, 'F2-17', '封存检修核', 45, 7, 9, 7, 'bottom', 3, true);
    region(f2, 'F2-18', '东侧露台 · 二层室外', 65, 26, 8, 19, false);
    rect(f2, 65, 26, 8, 19, 'floor'); rect(f2, 73, 25, 1, 21, 'wall');
    for (const p of MALL_PASSAGES) {
        const map = p.map === f1.id ? f1 : f2, x = Math.floor(p.at.x / 32), y = Math.floor(p.at.y / 32);
        // Clear the adjoining store wall as well as the facade itself.
        rect(map, x - 1, y - 1, 3, 3, 'floor');
    }
    return { f1, f2 };
}
/** Revision 1 corner markers: one collision class per region corner, skipped near connections. */
function cornerMarkers(map: SpaceDefinition, skip: ReadonlySet<string> = new Set()) {
    // Registered collision classes are materialized into the exact same tile cells.
    for (const r of map.regions!.filter(r => !r.sealed && !skip.has(r.id!))) {
        const x = Math.floor(r.x / 32) + 2, y = Math.floor(r.y / 32) + 2;
        const kind = /数码|生鲜|促销|家居|露台|大堂|服务|门厅/.test(r.name) ? 'M' : 'B';
        for (const [cx, cy, k] of [[x, y, kind], [x + 2, y, 'M'], [x, y + 2, 'V']] as const) {
            const p = at(cx, cy);
            if (map.cells[cy]?.[cx] !== 'floor' || map.entries.some(e => Math.hypot(e.at.x - p.x, e.at.y - p.y) < 144)) continue;
            map.decorations!.push({ x: p.x, y: p.y, kind: k as 'B' | 'M' | 'V', name: r.name });
            if (k !== 'V') map.cells[cy][cx] = k === 'B' ? 'wall' : 'low';
        }
    }
}
// Parallel supermarket shelves with open cross aisles (revision 1 on both floors, revision 2 on F2 only).
const shelves = (map: SpaceDefinition) => { for (const x of [33, 39, 45, 51]) { rect(map, x, 25, 1, 4, 'wall'); rect(map, x, 36, 1, 3, 'wall'); } };
function floorTwoFixtures(f2: SpaceDefinition) {
    // A low diamond fashion island.
    for (const [x, y] of [[23, 12], [22, 13], [23, 13], [24, 13], [23, 14]]) f2.cells[y][x] = 'low';
    rect(f2, 22, 41, 4, 3, 'wall'); // closed ball pool; accessible external play circuit
    rect(f2, 33, 40, 1, 3, 'wall'); // bamboo partition; no diagonal collision wall
}
function settle(f1: SpaceDefinition, f2: SpaceDefinition) {
    for (const map of [f1, f2]) for (const e of map.entries) rect(map, Math.floor(e.at.x / 32) - 1, Math.floor(e.at.y / 32) - 1, 3, 3, 'floor');
    for (const map of [f1, f2]) map.decorations = map.decorations!.filter(d => map.cells[Math.floor(d.y / 32)][Math.floor(d.x / 32)] === (d.kind === 'B' ? 'wall' : d.kind === 'M' ? 'low' : 'floor'));
}
function mallWorld(): WorldDefinition {
    const { f1, f2 } = mallSkeleton();
    const stairs = [['S-W', at(14, 41), at(14, 31)], ['S-N', at(60, 11), at(60, 11)], ['S-E', at(60, 45), at(60, 45)], ['E-C', at(38, 16), at(38, 19)]] as const;
    for (const [id, a, b] of stairs) connect(f1, `${id}-up`, a, '上楼至二层', f2, `${id}-down`, b, '下楼至一层');
    for (const map of [f1, f2]) cornerMarkers(map);
    for (const map of [f1, f2]) shelves(map);
    floorTwoFixtures(f2);
    settle(f1, f2);
    return { id: 'mall-v1', revision: 'mall-layout-1', maps: { [f1.id]: f1, [f2.id]: f2 }, enemyCount: 25, spawnMap: f1.id, spawn: MALL_ANCHORS.spawn };
}
export const MALL_WORLD = mallWorld();

/** Each furniture cell takes its collision class and a decoration naming the piece the view draws there. */
function furnish(map: SpaceDefinition, placements: readonly Placement[], revision: string) {
    for (const p of placements) {
        const t: FurnitureType = MALL_FURNITURE[p.type];
        for (let i = 0; i < (t.run ? p.n ?? 1 : 1); i++) for (let dy = 0; dy < t.h; dy++) for (let dx = 0; dx < t.w; dx++) {
            const x = p.x + i * t.w + dx, y = p.y + dy;
            if (map.cells[y]?.[x] !== 'floor' || map.decorations!.some(d => Math.floor(d.x / 32) === x && Math.floor(d.y / 32) === y))
                throw new Error(`${revision}: ${p.type} at ${x},${y} is not on open floor.`);
            if (t.kind !== 'V') map.cells[y][x] = t.kind === 'B' ? 'wall' : 'low';
            map.decorations!.push({ ...at(x, y), kind: t.kind, name: furnitureCellName(p.type, dx, dy) });
        }
    }
}
/** Revisions 2 and 3: the same skeleton, stairs and dressed regions, furnished from their own table. */
function buildDressedMall(worldId: string, revision: string, layout: Record<'mall-f1' | 'mall-f2', readonly Placement[]>): WorldDefinition {
    const { f1, f2 } = mallSkeleton(), dressed = new Set<string>(MALL_V2_REGIONS);
    for (const [id, a, b] of MALL_V2_STAIRS) connect(f1, `${id}-up`, a, '上楼至二层', f2, `${id}-down`, b, '下楼至一层');
    for (const map of [f1, f2]) cornerMarkers(map, dressed);
    shelves(f2);
    floorTwoFixtures(f2);
    settle(f1, f2);
    furnish(f1, layout['mall-f1'], revision); furnish(f2, layout['mall-f2'], revision);
    // The ground floor is indoors and out; its name says only which floor it is (the HUD adds the place).
    f1.floor = '一层';
    return { id: worldId, revision, maps: { [f1.id]: f1, [f2.id]: f2 }, enemyCount: 25, spawnMap: f1.id, spawn: MALL_V2_SPAWN };
}
let worldV2: WorldDefinition | null = null, worldV3: WorldDefinition | null = null;
/**
 * Layout revisions 2 and 3, built on first use. Both stay registered for recovery (a raid restores on the revision it
 * was deployed on); new deployments must explicitly choose one. The ordinary deployment path defaults to revision 1.
 * URL/sample selection belongs to the host.
 */
export function mallWorldV2(): WorldDefinition { return worldV2 ??= buildDressedMall('mall-v2', 'mall-layout-2', MALL_V2_LAYOUT); }
export function mallWorldV3(): WorldDefinition { return worldV3 ??= buildDressedMall('mall-v3', 'mall-layout-3', MALL_V3_LAYOUT); }
/** Every registered mall world id: these raids use the mall run config and draw as the mall building. */
export const MALL_WORLD_IDS = ['mall-v1', 'mall-v2', 'mall-v3'] as const;
export const isMallWorld = (id?: string | null): boolean => !!id && (MALL_WORLD_IDS as readonly string[]).includes(id);
export function mallRunConfig(seed: number | string): RunConfig {
    const config = buildingRunConfig(seed), random = D.seededRandom(config.seed + 23191);
    const exits = [{ id: 'X-N', name: '北侧接应', ...MALL_ANCHORS.north }, { id: 'X-S', name: '南街接应', ...MALL_ANCHORS.south }, { id: 'X-L', name: '卸货接应', ...MALL_ANCHORS.loading }];
    const omitted = Math.floor(random() * 3);
    return { ...config, spawn: MALL_ANCHORS.spawn, exits: exits.filter((_, i) => i !== omitted) };
}
/**
 * `world` defaults to revision 1; SaveSession passes revision 2 or 3 only on an explicit deployment choice. The run
 * starts at the world's spawn (revision 1: the same point as the run config).
 */
export function initializeMallRaid(state: ExpansionState, loadout: D.RunLoadout, config: RunConfig, world: WorldDefinition = MALL_WORLD): void {
    const spawn = world.spawn;
    const maps: LayeredRaid['maps'] = Object.fromEntries(Object.keys(world.maps).map(id => [id, { doors: {}, localTime: 0, enemies: [], loot: [], containers: [], bullets: [], noise: null }]));
    const random = D.seededRandom(config.seed + 24231), points = (map: SpaceDefinition, inside: boolean): Point[] => {
        const result: Point[] = [], context = { definition: map, doors: {}, highTide: true };
        for (let y = 1; y < map.cells.length - 1; y++) for (let x = 1; x < map.cells[y].length - 1; x++) {
            const p = at(x, y), indoors = x > 8 && x < 64 && y > 6 && y < 48;
            if (MALL_PASSAGES.some(entry => entry.map === map.id && Math.hypot(entry.at.x - p.x, entry.at.y - p.y) < 96) || inside !== indoors || !traversable(context, p, 'body', 10) || map.entries.some(e => Math.hypot(e.at.x - p.x, e.at.y - p.y) < 144) || Math.hypot(p.x - spawn.x, p.y - spawn.y) < 240) continue;
            result.push(p);
        }
        for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
        return result;
    };
    const groups = [{ id: 'mall-f1', enemies: 6, records: 12, boxes: 2, points: points(world.maps['mall-f1'], false) },
        { id: 'mall-f1', enemies: 10, records: 28, boxes: 5, points: points(world.maps['mall-f1'], true) },
        { id: 'mall-f2', enemies: 9, records: 20, boxes: 3, points: points(world.maps['mall-f2'], true) }];
    // Use existing 60 generation records. No floor performs a second economic roll.
    const units = [...config.loot, ...config.containers.flatMap(c => c.items)], enemies = [...config.enemies];
    let serial = 1, enemySerial = 0;
    for (const g of groups) {
        const layer = maps[g.id], nextPoint = () => { const p = g.points.pop(); if (!p) throw new Error('商场投放空间不足。'); return p; };
        for (let i = 0; i < g.enemies; i++) {
            const source = enemies.shift()!, p = nextPoint();
            layer.enemies.push({ uid: `enemy-${enemySerial++}`, id: source.id, hp: D.ENEMIES[source.id].hp, ...p, rotation: 0, home: { ...p }, target: { ...p }, state: 'patrol', timer: 2, cooldown: .8, path: [], repath: 0, alert: 0 });
        }
        const groupUnits = units.splice(0, g.records);
        for (let i = 0; i < g.boxes; i++) {
            const inventory = D.createInventory(6, 5), p = i === 0 && g.records === 28 ? MALL_ANCHORS.box1 : i === 0 && g.id === 'mall-f2' ? MALL_ANCHORS.box2 : nextPoint();
            for (const source of groupUnits.splice(0, 2)) if (D.addItem(inventory, source.id, source.qty, false, false, true, () => entityUid({ version: 2, runId: loadout.runId! }, serial++))) throw new Error('商场容器容量不足。');
            layer.containers.push({ id: `crate-${serial++}`, runId: loadout.runId!, name: '商场周转箱', kind: 'crate', ...p, inventory });
        }
        for (const source of groupUnits) layer.loot.push({ uid: entityUid({ version: 2, runId: loadout.runId! }, serial++), id: source.id, qty: source.qty, relief: false, ...nextPoint(), ...D.factoryGun(source.id) });
    }
    state.base.location = 'raid'; state.base.restSeconds = 0; state.base.energizedGranted = false;
    // As in initializeBuildingRaid: a v3 raid only from a v3 expansion.
    state.raid = { version: state.version === 3 ? 3 : 2, worldVersion: world.id, layoutRevision: world.revision, seed: config.seed, runId: loadout.runId!, shockAt: -10,
        currentMap: 'mall-f1', player: { ...spawn, rotation: 0 }, loadout: structuredClone(loadout), elapsed: 0, initialHigh: config.initialHigh, highTide: config.initialHigh, warned: false, tideChanged: false,
        kills: 0, rng: (config.seed + 771) >>> 0, nextEntity: serial, maps, pursuits: [], training: newTraining(), reloadLeft: 0, fireCooldown: 0, knife: false, hitTime: 0,
        roster: Object.values(maps).flatMap(m => m.enemies.map(e => ({ uid: e.uid, id: e.id }))), eventRolled: false, mapEvent: 'none' };
    initialLuck(state);
}
