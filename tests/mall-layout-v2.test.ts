import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MALL_WORLD, MALL_ANCHORS, MALL_PASSAGES, isMallWorld, mallWorldV2, mallWorldV3, mallWorldV4 } from '../src/mall-world';
import { MALL_V4_LAYOUT } from '../src/mall-layout-v4';
import { MALL_FURNITURE, MALL_V2_LAYOUT, MALL_V2_REGIONS, MALL_V2_SPAWN, MALL_V3_LAYOUT, parseFurnitureName, type Placement } from '../src/mall-layout-v2';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { traversable, type SpaceDefinition } from '../src/spatial';
import type { WorldDefinition } from '../src/expansion-state';

const V1 = MALL_WORLD, V2 = mallWorldV2(), V3 = mallWorldV3(), V4 = mallWorldV4();
type Layout = Record<'mall-f1' | 'mall-f2', readonly Placement[]>;
/** The dressed revisions and their tables: every layout rule below holds for all three (layout 4 dresses every cell). */
const DRESSED: [string, WorldDefinition, Layout][] = [['二版', V2, MALL_V2_LAYOUT], ['三版', V3, MALL_V3_LAYOUT], ['四版', V4, MALL_V4_LAYOUT]];
const cellOf = (p: { x: number; y: number }) => [Math.floor(p.x / 32), Math.floor(p.y / 32)] as const;
const regionCells = (map: SpaceDefinition, id: string) => { const r = map.regions!.find(r => r.id === id)!; return { x0: r.x / 32, y0: r.y / 32, x1: r.x / 32 + r.w / 32 - 1, y1: r.y / 32 + r.h / 32 - 1 }; };
/** Cells revisions 2 and 3 may redraw: their dressed regions plus the supermarket frontage on the F1 north aisle. Revision 4 may
 * redraw any cell; tests/mall-layout-v4.test.ts checks which of its cells differ from revision 1. */
function dressed(map: SpaceDefinition, x: number, y: number, world?: WorldDefinition) {
    if (world === V4) return true;
    if (map.id === 'mall-f1' && y === 19 && x >= 30 && x <= 44) return true;
    return MALL_V2_REGIONS.some(id => { const r = map.regions!.find(r => r.id === id); if (!r) return false; const c = regionCells(map, id); return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1; });
}
const furniture = (map: SpaceDefinition) => map.decorations!.filter(d => parseFurnitureName(d.name));
const free = (map: SpaceDefinition, x: number, y: number) => traversable({ definition: map, doors: {}, highTide: true }, { x: (x + .5) * 32, y: (y + .5) * 32 }, 'body', 10);

test('布局一版、二版逐字节不变：三版各按自己的世界注册，旧进行中行动仍按原世界恢复', () => {
    assert.equal(createHash('sha256').update(JSON.stringify(V1)).digest('hex'), '1c4ef1c490c41854c7587f6a1ca167d7ef8859b7e3c698e800bbeef570757ffd');
    // Layout 2 is pinned as well: raids saved on it restore on these exact cells and decorations.
    assert.equal(createHash('sha256').update(JSON.stringify(V2)).digest('hex'), 'f008a5c747851d47d8dc67120705c31235116e779718240b031be2ab177a6c51');
    assert.equal(resolveExpansionWorld('mall-v1'), V1);
    assert.equal(resolveExpansionWorld(V2.id), V2);
    // Layout 2 (the mall sample) starts on the entrance plaza; layout 1 keeps the west pavement.
    assert.deepEqual([V2.id, V2.revision, V2.enemyCount, V2.spawnMap, V2.spawn], ['mall-v2', 'mall-layout-2', 25, 'mall-f1', MALL_V2_SPAWN]);
    assert.deepEqual(V1.spawn, MALL_ANCHORS.spawn);
    assert.equal(mallWorldV2(), V2);
    // Layout 3 (new mall sample raids) is a world of its own; layout 2 raids keep restoring on layout 2.
    assert.equal(resolveExpansionWorld('mall-v3'), V3); assert.equal(mallWorldV3(), V3);
    assert.deepEqual([V3.id, V3.revision, V3.enemyCount, V3.spawnMap, V3.spawn], ['mall-v3', 'mall-layout-3', 25, 'mall-f1', MALL_V2_SPAWN]);
    for (const id of ['mall-v1', 'mall-v2', 'mall-v3']) assert.ok(isMallWorld(id), id);
    for (const id of ['coast-buildings-v1', 'mall-v9', '', undefined]) assert.equal(isMallWorld(id), false, String(id));
});

test('三版只换二层两张茶几和四组露台桌椅：一层与二版完全相同，二层区域、连接不变，碰撞只在这十格不同', () => {
    assert.equal(MALL_V3_LAYOUT['mall-f1'], MALL_V2_LAYOUT['mall-f1']);
    assert.deepEqual(V3.maps['mall-f1'], V2.maps['mall-f1']);
    // The table is replaced in place: same length and order, six pieces swapped, nothing of the old two types left.
    const a = MALL_V2_LAYOUT['mall-f2'], b = MALL_V3_LAYOUT['mall-f2'], key = (p: Placement) => `${p.type}@${p.x},${p.y}`;
    assert.equal(b.length, a.length);
    assert.deepEqual(a.flatMap((p, i) => key(p) === key(b[i]) ? [] : [`${key(p)}>${key(b[i])}`]), [
        'coffee-table@58,20>coffee-table-wide@58,19', 'coffee-table@58,34>coffee-table-wide@58,33',
        'cafe-table@67,31>bistro-set@66,31', 'cafe-table@70,31>bistro-set@70,31', 'cafe-table@67,36>bistro-set@66,36', 'cafe-table@69,40>bistro-set@68,40']);
    const f2 = V2.maps['mall-f2'], g2 = V3.maps['mall-f2'];
    assert.deepEqual(g2.regions, f2.regions); assert.deepEqual(g2.entries, f2.entries); assert.deepEqual(g2.doors, f2.doors);
    const changed: string[] = [];
    for (let y = 0; y < f2.cells.length; y++) for (let x = 0; x < f2.cells[y].length; x++) if (g2.cells[y][x] !== f2.cells[y][x]) changed.push(`${x},${y}:${g2.cells[y][x]}`);
    assert.deepEqual(changed.sort(), ['58,19:low', '59,19:low', '58,20:floor', '58,33:low', '59,33:low', '58,34:floor', '66,31:low', '71,31:low', '66,36:low', '68,40:low'].sort());
});

test('三版客厅：茶几与沙发同宽、紧贴在沙发正南一格', () => {
    const f2 = MALL_V3_LAYOUT['mall-f2'], sofas = f2.filter(p => p.type === 'sofa');
    assert.equal(sofas.length, 2);
    for (const sofa of sofas) {
        const table = f2.find(p => p.type === 'coffee-table-wide' && p.y === sofa.y + 1);
        assert.ok(table, `a table in front of the sofa at ${sofa.x},${sofa.y}`);
        assert.equal(table.x, sofa.x); assert.equal(MALL_FURNITURE[table.type].w, MALL_FURNITURE.sofa.w);
    }
});

for (const [label, W, LAYOUT] of DRESSED) {
    test(`${label}只在装饰区域内改格；区域、外墙、房间、同层开口和三组连接与一版一致，S-N 仅在两层大堂内东移`, () => {
        for (const id of Object.keys(V1.maps)) {
            const a = V1.maps[id], b = W.maps[id];
            assert.deepEqual(b.regions, a.regions); assert.deepEqual(b.doors, a.doors);
            for (let y = 0; y < a.cells.length; y++) for (let x = 0; x < a.cells[y].length; x++)
                if (!dressed(a, x, y, W)) assert.equal(b.cells[y][x], a.cells[y][x], `${id} ${x},${y} changed outside the dressed area`);
            const coords = (m: SpaceDefinition) => Object.fromEntries(m.entries.map(e => [e.id, cellOf(e.at)]));
            const before = coords(a), after = coords(b), sn = Object.keys(after).find(k => k.startsWith('S-N'))!;
            assert.deepEqual(after[sn], [62, 13]); assert.deepEqual(before[sn], [60, 11]);
            for (const key of Object.keys(before)) if (!key.startsWith('S-N')) assert.deepEqual(after[key], before[key], key);
            assert.ok(dressed(b, 62, 13) && dressed(b, 60, 11), 'S-N stays inside the same lobby');
            assert.deepEqual(b.entries.map(e => [e.id, e.targetMap, e.targetEntry, e.label]), a.entries.map(e => [e.id, e.targetMap, e.targetEntry, e.label]));
        }
    });

    test(`家具每格登记完整：类别与碰撞一致，多格件不缺块，连排件东西向连续，只出现在装饰区域（布局${label}）`, () => {
        for (const map of Object.values(W.maps)) {
            const parts = new Map<string, string>();
            for (const d of furniture(map)) {
                const [x, y] = cellOf(d), parsed = parseFurnitureName(d.name)!, type = MALL_FURNITURE[parsed.type];
                assert.equal(d.kind, type.kind, `${map.id} ${d.name}`);
                assert.equal(map.cells[y][x], type.kind === 'B' ? 'wall' : type.kind === 'M' ? 'low' : 'floor');
                assert.ok(dressed(map, x, y, W), `${map.id} ${d.name} at ${x},${y} outside the dressed area`);
                parts.set(`${x},${y}`, d.name);
            }
            for (const p of LAYOUT[map.id as 'mall-f1' | 'mall-f2']) {
                const t = MALL_FURNITURE[p.type], n = 'run' in t ? p.n ?? 1 : 1;
                for (let i = 0; i < n; i++) for (let dy = 0; dy < t.h; dy++) for (let dx = 0; dx < t.w; dx++) {
                    const name = parts.get(`${p.x + i * t.w + dx},${p.y + dy}`);
                    assert.equal(name, 'run' in t || t.w * t.h === 1 ? p.type : `${p.type}#${dx},${dy}`, `${map.id} ${p.type} part ${dx},${dy}`);
                }
            }
            assert.equal(parts.size, LAYOUT[map.id as 'mall-f1' | 'mall-f2'].reduce((n, p) => { const t = MALL_FURNITURE[p.type]; return n + t.w * t.h * ('run' in t ? p.n ?? 1 : 1); }, 0));
        }
    });

    test(`连接落点 3×3 无遮挡且 64 像素内至少 9 个可落位；同层开口穿行带、撤离圈和固定锚点不放家具（布局${label}）`, () => {
        for (const map of Object.values(W.maps)) {
            const occupied = new Set(furniture(map).map(d => cellOf(d).join(',')));
            for (const e of map.entries) {
                const [ex, ey] = cellOf(e.at);
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.ok(free(map, ex + dx, ey + dy), `${map.id} ${e.id} landing ${dx},${dy}`);
                let candidates = 0;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4 && free(map, ex + dx, ey + dy)) candidates++;
                assert.ok(candidates >= 9, `${map.id} ${e.id} has ${candidates} landing candidates`);
            }
            for (const p of MALL_PASSAGES.filter(p => p.map === map.id)) {
                const [px, py] = cellOf(p.at), vertical = ['P-N', 'P-S'].includes(p.id);
                for (let a = -2; a <= 2; a++) for (let b = -1; b <= 1; b++) assert.ok(!occupied.has(vertical ? `${px + b},${py + a}` : `${px + a},${py + b}`), `${p.id} lane`);
            }
            // Exits and the spawn keep a clear standing area; fixed test anchors keep their cell and at least three neighbours.
            const open = map.id === 'mall-f1' ? [MALL_ANCHORS.north, MALL_ANCHORS.south, MALL_ANCHORS.loading, MALL_ANCHORS.spawn, MALL_V2_SPAWN] : [];
            for (const p of open) {
                const [x, y] = cellOf(p);
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.ok(!occupied.has(`${x + dx},${y + dy}`) && free(map, x + dx, y + dy), `${map.id} exit or spawn ${x},${y}`);
            }
            for (const p of map.id === 'mall-f1' ? [MALL_ANCHORS.pair, MALL_ANCHORS.box1] : [MALL_ANCHORS.pair, MALL_ANCHORS.box2, MALL_ANCHORS.edge]) {
                const [x, y] = cellOf(p), around = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => free(map, x + dx, y + dy)).length;
                assert.ok(free(map, x, y) && around >= 3, `${map.id} anchor ${x},${y} is wedged (${around} open sides)`);
            }
        }
    });

    test(`卖场通道宽度：主通道至少 3 格，货架、冰台、冷柜之间的支路至少 2 格，家居馆临外墙通道与露台门道畅通（布局${label}）`, () => {
        const f1 = W.maps['mall-f1'], f2 = W.maps['mall-f2'];
        const run = (map: SpaceDefinition, x: number, y0: number, y1: number) => { let best = 0, cur = 0; for (let y = y0; y <= y1; y++) { cur = free(map, x, y) ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
        // North aisle between the back-of-house rooms and the supermarket, and the escalator cross aisle.
        for (let x = 30; x <= 53; x++) assert.ok(run(f1, x, 14, 21) >= 3, `north aisle at x=${x}`);
        for (let x = 37; x <= 39; x++) for (let y = 20; y <= 32; y++) assert.ok(free(f1, x, y), `cross aisle ${x},${y}`);
        for (let y = 14; y <= 47; y++) for (const x of [27, 28, 29, 54, 55, 56]) if (f1.cells[y][x] === 'floor') assert.ok(free(f1, x, y));
        // Rows of fixtures: any two blocking rows in the same column keep at least two open rows between them.
        for (const zone of ['F1-03', 'F1-04', 'F1-05']) {
            const c = regionCells(f1, zone);
            for (let x = c.x0; x <= c.x1; x++) {
                const rows = []; for (let y = c.y0 - 1; y <= c.y1 + 1; y++) if (!free(f1, x, y)) rows.push(y);
                for (let i = 1; i < rows.length; i++) assert.ok(rows[i] - rows[i - 1] === 1 || rows[i] - rows[i - 1] >= 3, `${zone} x=${x} gap ${rows[i - 1]}-${rows[i]}`);
            }
        }
        for (let y = 17; y <= 42; y++) for (const x of [61, 62, 63]) assert.ok(free(f2, x, y), `home store facade aisle ${x},${y}`);
        for (let y = 17; y <= 42; y++) assert.ok(run(f2, 55, y, y) + run(f2, 56, y, y) === 2, `home store west aisle at y=${y}`);
    });
}
