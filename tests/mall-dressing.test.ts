import test from 'node:test';
import assert from 'node:assert/strict';
import { mallWorldV2, mallWorldV3, mallWorldV4 } from '../src/mall-world';
import { MALL_FURNITURE, MALL_V2_LAYOUT, MALL_V3_LAYOUT, parseFurnitureName, type FurnitureName } from '../src/mall-layout-v2';
import { MALL_V4_LAYOUT, mallRegionDressed } from '../src/mall-layout-v4';
import { MALL_SPRITE_SIZE, PAINTED_LIFT, PROCEDURAL, WALL_LIFT, mallDecals, mallGround, mallLights, mallLintels, mallOpenings, mallProps, mallSigns, mallWallCells, mallWallFace, mallWallParts, mallWallProps, mallWallRole, type DressMap } from '../src/coast-view/mall-dressing';
import { DECAL_SIZE } from '../src/coast-view/art/mall';
import { PAINTED_TYPES } from '../src/coast-view/art/mall-furniture';
import { mallPick } from '../src/coast-view/mall-art';

const V2 = mallWorldV2(), V3 = mallWorldV3();
const dress = (id: string, world = V2): DressMap => { const m = world.maps[id]; return { mapId: id, cells: m.cells, regions: m.regions!, decorations: m.decorations! }; };
const REVISIONS = [['二版', V2, MALL_V2_LAYOUT], ['三版', V3, MALL_V3_LAYOUT]] as const;

test('商场布置表：每件家具一张贴图，立在占地南边线上；货架连排两端用端头、中间用中段（布局二版、三版）', () => {
    for (const [label, world, layout] of REVISIONS) for (const id of ['mall-f1', 'mall-f2'] as const) {
        const m = dress(id, world), props = mallProps(m), sorted = props.filter(p => p.layer === 'sorted');
        const pieces = layout[id].reduce((n, p) => { const t = MALL_FURNITURE[p.type]; return n + ('run' in t ? p.n ?? 1 : 1); }, 0);
        assert.equal(sorted.length, pieces, `${label} ${id} one sprite per piece or run module`);
        assert.equal(props.filter(p => p.layer === 'overhead').length, layout[id].filter(p => p.type === 'cafe-table' || p.type === 'bistro-set').length);
        for (const p of sorted) {
            const name = p.assets[0].replace(PROCEDURAL, '').replace(/^mall-|-v1$/g, ''), key = name.replace(/-(end-[ew]|mid-.*|[ab])$/, '');
            const size = MALL_SPRITE_SIZE[key] ?? MALL_SPRITE_SIZE[name];
            assert.ok(size, `${p.assets[0]} has a planned size`);
            assert.equal(p.y + size[1], p.z, `${p.assets[0]} stands on its footprint's south edge`);
            assert.ok(p.assets.every(a => /^mall-[a-z0-9-]+-v1$/.test(a) || a === PROCEDURAL + 'stairs-up' || a === PROCEDURAL + 'stairs-down' || a === PROCEDURAL + 'cafe-set'));
            // The contact shadow's footprint: the whole cell, except the floor lamp's small round base in the middle of it.
            if (p.assets[0] === 'mall-prop-floor-lamp-v1') assert.ok(p.foot && p.foot.w <= 12 && p.foot.y > p.z - 32 && p.foot.y + p.foot.h < p.z, 'the lamp base');
            else assert.ok(p.foot && p.foot.y + p.foot.h === p.z, `${p.assets[0]} carries its footprint for the contact shadow`);
        }
        for (const run of layout[id].filter(p => p.type === 'gondola')) {
            const row = sorted.filter(p => p.z === (run.y + 1) * 32 && p.x >= run.x * 32 && p.x < (run.x + run.n!) * 32).sort((a, b) => a.x - b.x);
            assert.equal(row.length, run.n);
            assert.equal(row[0].assets[0], 'mall-prop-gondola-end-w-v1'); assert.equal(row.at(-1)!.assets[0], 'mall-prop-gondola-end-e-v1');
            for (const mid of row.slice(1, -1)) assert.match(mid.assets[0], /^mall-prop-gondola-mid-/);
        }
    }
});

test('布局二版的贴图和阴影不随居中规则移动：除露台桌椅和落地灯外，每件都从自己格子的西边画起，阴影占满整个占地', () => {
    for (const id of ['mall-f1', 'mall-f2'] as const) {
        const sorted = mallProps(dress(id)).filter(p => p.layer === 'sorted');
        const pieces = V2.maps[id].decorations!.flatMap(d => { const f = parseFurnitureName(d.name); return f && !f.dx && !f.dy && f.type !== 'cafe-table' && f.type !== 'floor-lamp' ? [{ ...f, x: Math.floor(d.x / 32), y: Math.floor(d.y / 32) }] : []; });
        assert.equal(pieces.length, sorted.filter(p => p.assets[0] !== PROCEDURAL + 'cafe-set' && p.assets[0] !== 'mall-prop-floor-lamp-v1').length);
        for (const f of pieces) {
            const t = MALL_FURNITURE[f.type], p = sorted.find(p => p.z === (f.y + t.h) * 32 && p.x === f.x * 32);
            assert.ok(p, `${id} ${f.type} at ${f.x},${f.y} is drawn from its cell`);
            assert.deepEqual([p.foot!.x, p.foot!.y, p.foot!.w, p.foot!.h], [f.x * 32, f.y * 32, t.w * 32, t.h * 32], `${id} ${f.type} at ${f.x},${f.y}: footprint shadow`);
        }
    }
});

test('布局三版客厅：茶几画在沙发正前方、两者中心对齐，阴影只在画出的茶几下面', () => {
    const props = mallProps(dress('mall-f2', V3)), sofas = props.filter(p => p.assets[0] === 'mall-prop-sofa-s-v1');
    assert.equal(sofas.length, 2);
    for (const sofa of sofas) {
        const table = props.find(p => p.assets[0] === 'mall-prop-coffee-table-v1' && p.z === sofa.z + 32);
        assert.ok(table, `a table right in front of the sofa at ${sofa.x},${sofa.z}`);
        const [w] = MALL_SPRITE_SIZE['prop-coffee-table'], [sw] = MALL_SPRITE_SIZE['prop-sofa-s'];
        assert.equal(table.x + w / 2, sofa.x + sw / 2, 'the table is centred on the sofa');
        assert.deepEqual([table.foot!.x, table.foot!.w], [table.x, w], 'the shadow spans the drawn table, not both cells');
    }
});

test('商场布置表：家具格不当墙画；大堂北墙是玻璃幕墙，后场墙用后场墙面；地面按区域选材质', () => {
    const f1 = dress('mall-f1'), walls = new Set(mallWallCells(f1).map(c => `${c.x},${c.y}`));
    for (const d of f1.decorations.filter(d => d.kind === 'B' && /^[a-z-]+$/.test(d.name.split('#')[0]))) assert.ok(!walls.has(`${Math.floor(d.x / 32)},${Math.floor(d.y / 32)}`));
    assert.match(mallWallFace(f1, 58, 6)[0], /^mall-wall-curtain/);
    assert.match(mallWallFace(f1, 40, 13)[0], /^mall-wall-service-/);
    assert.equal(mallGround(f1, 59, 3)[0].startsWith('mall-ground-plaza-'), true);
    assert.equal(mallGround(f1, 60, 10)[0].startsWith('mall-ground-terrazzo-'), true);
    assert.equal(mallGround(f1, 35, 23)[0].startsWith('mall-ground-tile-large-'), true);
    assert.equal(mallGround(dress('mall-f2'), 59, 22)[0].startsWith('mall-ground-wood-'), true);
    // One standing board per gondola run (on its west end) plus fresh, cold and home-store boards; nothing hangs.
    assert.equal(mallSigns(f1).length, MALL_V2_LAYOUT['mall-f1'].filter(p => p.type === 'gondola').length + 3);
    assert.equal(mallSigns(dress('mall-f2')).length, 2);
    // The home-store boards stand in the middle of their partition (x 57-60), over the sofa's centre.
    for (const s of mallSigns(dress('mall-f2'))) assert.equal(s.x + 13, 59 * 32, 'the home board is centred on its partition');
    for (const s of [...mallSigns(f1), ...mallSigns(dress('mall-f2'))]) assert.ok(s.layer === 'sorted' && s.assets[0].startsWith(PROCEDURAL + 'sign:'));
});

test('商场布置表：一层地图边是封锁围挡，二层楼外是虚空、只有露台一圈是矮女儿墙；东西向门洞上有门头', () => {
    const f1 = dress('mall-f1'), f2 = dress('mall-f2');
    assert.equal(mallWallRole(f1, 30, 0), 'boundary'); assert.equal(mallWallRole(f1, 8, 20), 'wall');
    assert.equal(mallWallRole(f2, 2, 2), 'void'); assert.equal(mallWallRole(f2, 30, 52), 'void');
    for (const [x, y] of [[73, 30], [68, 25], [68, 45]]) assert.equal(mallWallRole(f2, x, y), 'parapet', `${x},${y}`);
    assert.equal(mallWallRole(f2, 64, 30), 'wall');
    assert.equal(WALL_LIFT.parapet, 24); assert.deepEqual(mallWallParts(f2, 2, 2), { cap: [], face: [], rail: [] });
    assert.match(mallWallParts(f1, 30, 0).face[0], /^mall-wall-hoarding-/);
    const l1 = new Map(mallLintels(f1).map(l => [`${l.x},${l.y}`, l.assets[0]]));
    for (const x of [59, 60, 61]) assert.equal(l1.get(`${x},6`), 'mall-wall-lintel-entrance-v1');
    for (const x of [36, 37, 38]) assert.equal(l1.get(`${x},13`), 'mall-wall-lintel-shutter-v1');
    // Not doorways: the corridor between two north-south walls, and gaps beside a lone corner-marker pillar.
    for (const key of ['44,8', '44,10', '44,12', '60,20', '61,20', '62,20', '10,22']) assert.ok(!l1.has(key), `no header at F1 ${key}`);
    // Headers mark entrances only: gaps that join two places. On F2 every entrance is in a north-south wall.
    for (const key of ['27,13', '28,13', '44,13']) assert.ok(!l1.has(key), `no header at the dead end F1 ${key}`);
    assert.equal(mallLintels(f2).length, 0);
    for (const m of [f1, f2]) for (const p of mallWallProps(m)) assert.ok(p.assets.every(a => /^mall-[a-z0-9-]+-v1$/.test(a)));
    // Ceiling lights are light sources only: the ceiling is cut away, so no fixture sprite is drawn.
    for (const m of [f1, f2]) for (const l of mallLights(m)) assert.deepEqual(Object.keys(l).sort(), ['broken', 'r', 'x', 'y']);
});

test('商场布置表：地面杂物只落在空地上，宽件占两格空地，不压家具和墙，位置稳定（布局二版、三版）', () => {
    for (const [, world] of REVISIONS) for (const id of ['mall-f1', 'mall-f2']) {
        const m = dress(id, world), decals = mallDecals(m), seen = new Set<string>();
        assert.ok(decals.length > 15, `${id} has clutter (${decals.length})`);
        const furniture = new Set(m.decorations.filter(d => /^[a-z-]+/.test(d.name)).map(d => `${Math.floor(d.x / 32)},${Math.floor(d.y / 32)}`));
        for (const d of decals) {
            const [w] = DECAL_SIZE[d.kind], cells = w / 32;
            for (let i = 0; i < cells; i++) {
                const x = d.x / 32 + i, y = d.y / 32, key = `${x},${y}`;
                assert.equal(m.cells[y][x], 'floor', `${id} ${d.kind} at ${key}`); assert.ok(!furniture.has(key)); assert.ok(!seen.has(key), `${key} used twice`); seen.add(key);
            }
        }
        assert.deepEqual(mallDecals(m), decals, 'stable');
        for (const d of decals) assert.equal(d.assets.at(-1), PROCEDURAL + 'decal:' + d.kind, 'procedural fallback last');
    }
});

test('商场入口：连接两个不同地方的门洞都算（两个方向、房间转角、厚墙算一个）；房间内部、死胡同口、平行墙之间的缝不算', () => {
    const key = (o: { wall: string; facade: boolean; cells: { x: number; y: number }[]; twin?: { x: number; y: number }[] }) =>
        `${o.wall}${o.facade ? '*' : ''}:${o.cells[0].x},${o.cells[0].y}+${o.cells.length}${o.twin ? '~' + o.twin[0].x : ''}`;
    // F1: north, south, west (two-thick, inner line x 9), east (two-thick) and south-east facade entrances; F1-09's door;
    // the side doors of F1-01, F1-02, F1-06, F1-07, F1-08 and F1-10's corner door.
    assert.deepEqual(mallOpenings(dress('mall-f1')).map(key).sort(), ['ew*:40,48+3', 'ew*:59,6+3', 'ew:36,13+3', 'ns*:64,38+3~63', 'ns*:64,44+3', 'ns*:8,12+3~9',
        'ns:26,14+3', 'ns:26,24+3', 'ns:53,15+2', 'ns:57,21+3', 'ns:57,30+3', 'ns:57,39+3'].sort());
    // F2: the side doors of F2-11, F2-12, F2-07, F2-08, F2-09 and F2-10 (a corner), the corridor's mouth into F2-05, the
    // two terrace doors. Not: inside F2-10 where it overlaps F2-06 (x 28), the service aisle, the shelf gaps.
    assert.deepEqual(mallOpenings(dress('mall-f2')).map(key).sort(), ['ns*:64,27+3', 'ns*:64,42+3', 'ns:16,37+3', 'ns:16,44+3', 'ns:18,24+3', 'ns:29,23+3',
        'ns:29,30+3', 'ns:29,34+1', 'ns:29,36+2'].sort());
});

const V4 = mallWorldV4(), full = (id: string): DressMap => ({ ...dress(id, V4), full: true });
const REVISION_4_ONLY = Object.keys(MALL_FURNITURE).slice(Object.keys(MALL_FURNITURE).indexOf('shelf-wall'));

test('布局四版：没有素材的新家具都由视图程序绘制，画布＝占地＋高度，立在占地南边线上；连排件按两端收口', () => {
    assert.deepEqual([...PAINTED_TYPES].sort(), REVISION_4_ONLY.sort(), 'every revision-4 type, and nothing else, is painted');
    assert.deepEqual(Object.keys(PAINTED_LIFT).sort(), REVISION_4_ONLY.sort());
    for (const id of ['mall-f1', 'mall-f2'] as const) {
        const m = full(id), sorted = mallProps(m).filter(p => p.layer === 'sorted');
        const pieces = MALL_V4_LAYOUT[id].reduce((n, p) => { const t = MALL_FURNITURE[p.type]; return n + ('run' in t ? p.n ?? 1 : 1); }, 0);
        assert.equal(sorted.length, pieces, `${id} one sprite per piece or run module`);
        for (const p of sorted.filter(p => p.assets[0].startsWith(PROCEDURAL + 'furniture:'))) {
            const [type, look, end, variant] = p.assets[0].slice(PROCEDURAL.length + 'furniture:'.length).split(':'), t = MALL_FURNITURE[type as FurnitureName];
            assert.equal(mallPick(null, p.assets), p.assets[0], `${p.assets[0]} is drawable without samples`);
            assert.equal(p.y, p.z - t.h * 32 - PAINTED_LIFT[type as FurnitureName]!, `${type} canvas height`);
            assert.ok(['0', '1', '2', '3'].includes(variant));
            assert.ok(p.foot && p.foot.x >= p.x && p.foot.x + p.foot.w <= p.x + t.w * 32 && p.foot.y + p.foot.h <= p.z, `${type} shadow inside its footprint`);
            if ('run' in t) assert.match(end, /^(w|e|we|m)$/); else assert.equal(end, '');
            if (type === 'shelf-wall') assert.ok(look, 'wall shelves carry their shop');
        }
        // Run ends: each run of a painted type closes west and east and is open in between.
        for (const run of MALL_V4_LAYOUT[id].filter(p => (p.n ?? 1) > 1 && PAINTED_TYPES.has(p.type))) {
            const ends = sorted.filter(p => p.z === (run.y + 1) * 32 && p.x >= run.x * 32 && p.x < (run.x + run.n!) * 32).sort((a, b) => a.x - b.x).map(p => p.assets[0].split(':')[4]);
            assert.deepEqual(ends, ['w', ...Array(run.n! - 2).fill('m'), 'e'], `${id} ${run.type} at ${run.x},${run.y}`);
        }
    }
    // Shop looks: the pharmacy's shelves hold medicine, the fried-chicken counter is the diner's.
    const f1 = mallProps(full('mall-f1'));
    assert.ok(f1.some(p => p.assets[0].startsWith(PROCEDURAL + 'furniture:shelf-wall:pharmacy:')));
    assert.ok(f1.some(p => p.assets[0].startsWith(PROCEDURAL + 'furniture:counter:diner:')));
});

test('布局四版：门洞、门头与三版相同；新房间的灯管、地面与杂物只在四版生效，二、三版画面不变', () => {
    for (const id of ['mall-f1', 'mall-f2'] as const) {
        assert.deepEqual(mallOpenings(full(id)), mallOpenings(dress(id, V3)), `${id} openings`);
        assert.deepEqual(mallLintels(full(id)), mallLintels(dress(id, V3)));
        const v3 = mallLights(dress(id, V3)), v4 = mallLights(full(id));
        assert.deepEqual(v4.slice(0, v3.length), v3); assert.ok(v4.length >= v3.length + 15, `${id} tubes in the newly furnished rooms`);
        // Same map cells, without the layout-4 flag: the older layouts keep their lights.
        assert.deepEqual(mallLights({ ...full(id), full: false }), v3);
    }
    // Pharmacy floor: the cold-case tile in layout 4, the large tile it always had in layouts 2 and 3.
    assert.ok(mallGround(full('mall-f1'), 18, 13)[0].startsWith('mall-ground-tile-cold-'));
    assert.ok(mallGround(dress('mall-f1', V3), 18, 13)[0].startsWith('mall-ground-tile-large-'));
    assert.ok(mallGround(full('mall-f2'), 15, 25)[0].startsWith('mall-ground-wood-'), 'the office has a wooden floor');
    for (const d of mallDecals(full('mall-f2'))) assert.equal(full('mall-f2').cells[d.y / 32][d.x / 32], 'floor');
    // Which regions count as furnished: all of them in layout 4, the demo route before it.
    assert.equal(mallRegionDressed('mall-layout-4', 'F2-11'), true); assert.equal(mallRegionDressed('mall-layout-3', 'F2-11'), false);
    assert.equal(mallRegionDressed('mall-layout-3', 'F2-13'), true); assert.equal(mallRegionDressed(null, 'F1-03'), true);
});
