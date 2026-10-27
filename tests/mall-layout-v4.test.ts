import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MALL_WORLD, isMallWorld, mallWorldV3, mallWorldV4 } from '../src/mall-world';
import { MALL_FURNITURE, MALL_V2_REGIONS, MALL_V2_SPAWN, MALL_V3_LAYOUT, parseFurnitureName } from '../src/mall-layout-v2';
import { MALL_V4_LAYOUT } from '../src/mall-layout-v4';
import { MALL_RAIDER_POSTS, MALL_RAIDER_STORES } from '../src/enemy-mall';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { separation, traversable, type SpaceDefinition } from '../src/spatial';

// Layout 4 builds the same skeleton as layouts 2 and 3 through mall-world's shared builder (tests/mall-layout-v2.test.ts
// covers landings, passage lanes, anchors, exits and aisle widths for all three; tests/mall.test.ts connectivity, loot and
// enemy allocation, and B/M/V channels). This file covers what only layout 4 changes.
const V1 = MALL_WORLD, V3 = mallWorldV3(), V4 = mallWorldV4();
const cellOf = (p: { x: number; y: number }) => [Math.floor(p.x / 32), Math.floor(p.y / 32)] as const;
const inRegion = (map: SpaceDefinition, id: string, x: number, y: number) => {
    const r = map.regions!.find(r => r.id === id)!;
    return x * 32 >= r.x && x * 32 < r.x + r.w && y * 32 >= r.y && y * 32 < r.y + r.h;
};
const furnitureCells = (map: SpaceDefinition) => new Map(map.decorations!.filter(d => parseFurnitureName(d.name)).map(d => [cellOf(d).join(','), d.name]));
const free = (map: SpaceDefinition, p: { x: number; y: number }, highTide = true) => traversable({ definition: map, doors: {}, highTide }, p, 'body', 10);

test('布局四版按自己的世界注册：一至三版逐字节不变，四版固定哈希，出生点与连接同二、三版', () => {
    assert.equal(resolveExpansionWorld('mall-v4'), V4); assert.equal(mallWorldV4(), V4); assert.ok(isMallWorld('mall-v4'));
    assert.deepEqual([V4.id, V4.revision, V4.enemyCount, V4.spawnMap, V4.spawn], ['mall-v4', 'mall-layout-4', 25, 'mall-f1', MALL_V2_SPAWN]);
    // Layout 3 is pinned now that layout 4 shares its builder; layout 4 is pinned for the raids saved on it.
    assert.equal(createHash('sha256').update(JSON.stringify(V3)).digest('hex'), '8b114a63909ce3ead9080ea763e8770b2552cea220797e9048222ad6a7961c47');
    assert.equal(createHash('sha256').update(JSON.stringify(V4)).digest('hex'), '934ba1384c4009bf0586cf8e79c06f760d11680847c8606e134699385b5780df');
    for (const id of Object.keys(V3.maps)) {
        const a = V3.maps[id], b = V4.maps[id];
        assert.deepEqual(b.regions, a.regions); assert.deepEqual(b.doors, a.doors); assert.deepEqual(b.entries, a.entries);
        assert.deepEqual([b.name, b.floor], [a.name, a.floor]);
    }
});

test('四版保留三版全部家具；三版的八个装饰区域和北侧临街一排逐格不变', () => {
    for (const id of ['mall-f1', 'mall-f2'] as const) {
        assert.deepEqual(MALL_V4_LAYOUT[id].slice(0, MALL_V3_LAYOUT[id].length), MALL_V3_LAYOUT[id]);
        const a = V3.maps[id], b = V4.maps[id], fa = furnitureCells(a), fb = furnitureCells(b);
        for (let y = 0; y < a.cells.length; y++) for (let x = 0; x < a.cells[y].length; x++) {
            const kept = MALL_V2_REGIONS.some(r => a.regions!.some(q => q.id === r) && inRegion(a, r, x, y)) || id === 'mall-f1' && y === 19 && x >= 30 && x <= 44;
            if (!kept) continue;
            assert.equal(b.cells[y][x], a.cells[y][x], `${id} ${x},${y}`); assert.equal(fb.get(`${x},${y}`), fa.get(`${x},${y}`), `${id} ${x},${y} piece`);
        }
    }
});

test('四版与一版的差别只在家具格、一版角标与二层旧陈设格和 S-N 所在的两层大堂：外墙、房间、门洞不变', () => {
    // Revision-1 fixtures that layout 4 no longer builds (mall-world.ts): the short shelves (both floors in revision 1),
    // and on F2 the fashion island, ball pool and bamboo partition.
    const shelves = new Set<string>(), oldFixtures = new Set<string>();
    for (const x of [33, 39, 45, 51]) { for (let y = 25; y <= 28; y++) shelves.add(`${x},${y}`); for (let y = 36; y <= 38; y++) shelves.add(`${x},${y}`); }
    for (const [x, y] of [[23, 12], [22, 13], [23, 13], [24, 13], [23, 14]]) oldFixtures.add(`${x},${y}`);
    for (let y = 41; y <= 43; y++) for (let x = 22; x <= 25; x++) oldFixtures.add(`${x},${y}`);
    for (let y = 40; y <= 42; y++) oldFixtures.add(`33,${y}`);
    for (const id of Object.keys(V1.maps)) {
        const a = V1.maps[id], b = V4.maps[id], pieces = furnitureCells(b), markers = new Set(a.decorations!.map(d => cellOf(d).join(',')));
        const lobby = id === 'mall-f1' ? 'F1-11' : 'F2-14';
        for (let y = 0; y < a.cells.length; y++) for (let x = 0; x < a.cells[y].length; x++) {
            if (b.cells[y][x] === a.cells[y][x]) continue;
            const key = `${x},${y}`;
            assert.ok(pieces.has(key) || markers.has(key) || shelves.has(key) || id === 'mall-f2' && oldFixtures.has(key) || inRegion(a, lobby, x, y), `${id} ${key}: ${a.cells[y][x]} > ${b.cells[y][x]}`);
        }
    }
});

test('四版每个可进入的区域都有家具，没有无名的矮碰撞格，也没有一版的角标装饰', () => {
    for (const map of Object.values(V4.maps)) {
        const pieces = furnitureCells(map);
        assert.equal(map.decorations!.length, pieces.size, `${map.id}: every decoration is a named piece`);
        for (let y = 0; y < map.cells.length; y++) for (let x = 0; x < map.cells[y].length; x++)
            if (map.cells[y][x] === 'low') assert.ok(pieces.has(`${x},${y}`), `${map.id} unnamed low cell ${x},${y}`);
        for (const r of map.regions!.filter(r => !r.sealed && r.id !== 'O-06')) {
            const has = [...pieces.keys()].some(k => { const [x, y] = k.split(',').map(Number); return inRegion(map, r.id!, x, y); });
            assert.ok(has, `${map.id} ${r.id} ${r.name} has no furniture`);
        }
    }
    // 31 regions beyond layout 3's eight: two sealed cores and the tidal flat stay bare.
    const all = Object.values(V4.maps).flatMap(m => m.regions!.map(r => r.id!));
    assert.equal(all.length - MALL_V2_REGIONS.length, 31);
});

test('二层拾荒小队的岗位、备用点和周转箱落点在四版仍可站立，离楼梯落点至少 144 像素，周围不被家具围死', () => {
    const map = V4.maps['mall-f2'], pieces = furnitureCells(map);
    for (const p of [...MALL_RAIDER_POSTS.flatMap(post => post.positions), ...MALL_RAIDER_STORES]) {
        const [x, y] = cellOf(p);
        for (const high of [false, true]) assert.ok(free(map, p, high), `post ${x},${y}`);
        assert.ok(!pieces.has(`${x},${y}`));
        assert.ok(map.entries.every(e => separation(e.at, p) >= 144), `post ${x},${y} near a landing`);
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => free(map, { x: p.x + dx * 32, y: p.y + dy * 32 })).length;
        assert.ok(open >= 3, `post ${x},${y} has ${open} open sides`);
    }
});

test('四版连排家具（货架、柜台、衣架、机柜等）同一列上相邻两排之间至少留两行通道', () => {
    for (const map of Object.values(V4.maps)) {
        const rows = new Map<number, number[]>();
        for (const [key, name] of furnitureCells(map)) {
            const parsed = parseFurnitureName(name)!;
            if (!('run' in MALL_FURNITURE[parsed.type])) continue;
            const [x, y] = key.split(',').map(Number);
            rows.set(x, [...rows.get(x) ?? [], y]);
        }
        for (const [x, ys] of rows) {
            ys.sort((a, b) => a - b);
            for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 3, `${map.id} x=${x}: runs at y ${ys[i - 1]} and ${ys[i]}`);
        }
    }
});
