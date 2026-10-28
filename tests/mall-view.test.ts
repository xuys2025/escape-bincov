import test from 'node:test';
import assert from 'node:assert/strict';
import { mallWorldV2, mallWorldV3 } from '../src/mall-world';
import { MALL_FURNITURE, MALL_V2_LAYOUT, MALL_V3_LAYOUT, parseFurnitureName } from '../src/mall-layout-v2';
import { MALL_FOOTPRINT, MALL_SPRITE_SIZE, PROCEDURAL, insideFootprint, mallProps, mallSigns, mallStandIns, mallZone, type DressMap } from '../src/coast-view/mall-dressing';
import { actorShown, isMall, regionAtClosed, shownAt } from '../src/coast-view/structure-guide';
import { SampleSound } from '../src/coast-view/sound';
import type { MapDef, PublishedView } from '../src/raid-runtime/contract';

const V2 = mallWorldV2();
const dress = (id: string): DressMap => { const m = V2.maps[id]; return { mapId: id, cells: m.cells, regions: m.regions!, decorations: m.decorations! }; };
/** The parts of a MapDef these display rules read: regions (inside or not) and the buildings' kind. */
const mapOf = (id: string, kind = 'mall') => {
  const m = V2.maps[id];
  return { key: { mapId: id }, cells: m.cells, regions: m.regions!.map(r => ({ ...r, inside: r.inside !== false })), buildings: [{ id: 'mall', kind, x: MALL_FOOTPRINT.x, y: MALL_FOOTPRINT.y, w: MALL_FOOTPRINT.w, h: MALL_FOOTPRINT.h, regionIds: ['F1-03'] }] } as unknown as MapDef;
};

test('商场 2.5D：房间重叠时按“未揭示优先”判断，内层房间未揭示就不显示（与 Runtime 同规则）', () => {
  const m = mapOf('mall-f2'), outer = m.regions.find(r => r.id === 'F2-06')!, inner = m.regions.find(r => r.id === 'F2-10')!;
  assert.ok(outer.x < inner.x + inner.w && inner.x < outer.x + outer.w && outer.y < inner.y + inner.h && inner.y < outer.y + outer.h, 'F2-06 overlaps F2-10');
  const both = { x: Math.max(outer.x, inner.x) + 16, y: Math.max(outer.y, inner.y) + 16 }, onlyOuter = { x: outer.x + 16, y: outer.y + 16 };
  assert.ok(!(onlyOuter.x >= inner.x && onlyOuter.x < inner.x + inner.w && onlyOuter.y >= inner.y && onlyOuter.y < inner.y + inner.h));
  assert.equal(shownAt(m, { 'F2-06': true }, both), false);
  assert.equal(regionAtClosed(m, { 'F2-06': true }, both), 'F2-10');
  assert.equal(shownAt(m, { 'F2-06': true, 'F2-10': true }, both), true);
  assert.equal(regionAtClosed(m, { 'F2-06': true, 'F2-10': true }, both), 'F2-06', 'ties by stable id');
  assert.equal(shownAt(m, { 'F2-06': true }, onlyOuter), true);
  assert.equal(shownAt(m, {}, { x: 70 * 32, y: 30 * 32 }), true, 'the terrace is no room');
});

test('商场 2.5D：商场楼层按建筑类型认定（墙体显示规则见 wall-display.test.ts）', () => {
  assert.equal(isMall(mapOf('mall-f1')), true); assert.equal(isMall(mapOf('mall-f1', 'resident')), false);
});

test('商场 2.5D：环境光分区——楼体内为室内，二层楼外只有露台一圈是室外，其余是临空', () => {
  const f1 = dress('mall-f1'), f2 = dress('mall-f2'), count = (m: DressMap, z: string) => m.cells.flatMap((row, y) => row.map((_, x) => mallZone(m, x, y))).filter(v => v === z).length;
  assert.equal(count(f1, 'drop'), 0);
  assert.ok(count(f2, 'drop') > 1000, 'the street below around the second floor');
  f2.cells.forEach((row, y) => row.forEach((c, x) => {
    const z = mallZone(f2, x, y);
    if (insideFootprint(x, y)) assert.equal(z, 'indoor');
    if (z === 'drop') assert.equal(c, 'wall', `drop ${x},${y} is not walkable`);
    if (c !== 'wall' && !insideFootprint(x, y)) assert.equal(z, 'outdoor', `terrace ${x},${y}`);
  }));
  assert.equal(mallZone(f2, 68, 33), 'outdoor'); assert.equal(mallZone(f1, 59, 3), 'outdoor'); assert.equal(mallZone(f1, 40, 25), 'indoor');
});

test('商场 2.5D：未命名的低矮碰撞格各有一件替身杂物，命名家具格没有；替身立在本格南边线上', () => {
  for (const id of ['mall-f1', 'mall-f2']) {
    const m = dress(id), named = new Set(m.decorations.filter(d => parseFurnitureName(d.name)).map(d => `${Math.floor(d.x / 32)},${Math.floor(d.y / 32)}`));
    const low = m.cells.flatMap((row, y) => row.flatMap((c, x) => c === 'low' && !named.has(`${x},${y}`) ? [`${x},${y}`] : []));
    const stand = mallStandIns(m);
    assert.ok(low.length > 0, `${id} has unnamed low cells`);
    assert.deepEqual(stand.map(s => `${s.x / 32},${s.z / 32 - 1}`).sort(), low.sort());
    for (const s of stand) {
      const size = MALL_SPRITE_SIZE[s.assets[0].replace(/^mall-|-v1$/g, '')];
      assert.ok(size && size[0] === 32, s.assets[0]); assert.equal(s.y + size[1], s.z);
    }
    for (const key of named) { const f = m.decorations.find(d => `${Math.floor(d.x / 32)},${Math.floor(d.y / 32)}` === key)!; assert.ok(MALL_FURNITURE[parseFurnitureName(f.name)!.type]); }
  }
});

test('商场 2.5D：货架端头的通道牌按从北到南、从西到东编号，号码不重复', () => {
  const signs = mallSigns(dress('mall-f1')).map(s => s.assets[0]).filter(a => a.includes('sign:aisle'));
  const numbers = signs.map(a => Number(a.split(':').at(-1)));
  assert.ok(numbers.length >= 9);
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1));
});

test('命中反馈看目标本身：目标所在房间未揭示时，弹着点落在房间外的走廊也不提示、不出声', () => {
  // mall-f2: F2-06 spans x 608..927; an enemy at x 920 counts as F2-06, the bullet meets its 14 px circle at x 934.
  const m = mapOf('mall-f2'), enemy = { uid: 'enemy-3', regionId: 'F2-06' }, contact = { x: 934, y: 1424 };
  assert.equal(shownAt(m, {}, contact), true, 'the contact point is in no room');
  assert.equal(actorShown({ actors: [enemy], revealed: {} }, 'enemy-3'), false);
  assert.equal(actorShown({ actors: [enemy], revealed: { 'F2-06': true } }, 'enemy-3'), true);
  assert.equal(actorShown({ actors: [{ uid: 'enemy-4', regionId: null }], revealed: {} }, 'enemy-4'), true, 'in no room');
  assert.equal(actorShown({ actors: [], revealed: {} }, 'player'), true);
  assert.equal(actorShown({ actors: [], revealed: {} }, 'enemy-9'), true, 'a target the frame does not carry is left to the hit point');
  const calls: string[] = [];
  const out = new Proxy({}, { get: (_, k) => (...a: unknown[]) => { calls.push(String(k)); void a; } });
  const s = new SampleSound(out as never), hurt = { type: 'hurt', cause: 'blow', uid: 'enemy-3', damage: 8, angle: 0, at: contact, stamp: { world: { mapId: 'mall-f2' } } } as never;
  s.event(hurt, 'mall-f2', () => true, () => false);
  assert.ok(!calls.includes('hit'), 'no hit sound for a hidden target');
  s.event(hurt, 'mall-f2', () => true, () => true);
  assert.ok(calls.includes('hit'));
});

test('布局二版露台咖啡桌是一整组桌椅（程序绘制），以它的一格碰撞为中心，伞杆立在桌子中心；碰撞仍是一格（旧存档有效）', () => {
  const f2 = dress('mall-f2'), props = mallProps(f2), sets = props.filter(p => p.assets[0] === PROCEDURAL + 'cafe-set');
  const tables = MALL_V2_LAYOUT['mall-f2'].filter(p => p.type === 'cafe-table'), [w, h] = MALL_SPRITE_SIZE['cafe-set'];
  assert.equal(MALL_FURNITURE['cafe-table'].w, 1); assert.equal(sets.length, tables.length);
  for (const t of tables) {
    const set = sets.find(s => s.z === (t.y + 1) * 32 && s.x + w / 2 === t.x * 32 + 16), umbrella = props.find(p => p.layer === 'overhead' && set && p.z === set.z && p.x + MALL_SPRITE_SIZE['overhead-umbrella'][0] / 2 === t.x * 32 + 16);
    assert.ok(set, `set centred on ${t.x},${t.y}`); assert.ok(umbrella, `umbrella over ${t.x},${t.y}`);
    assert.equal(set.y + h, set.z, 'stands on its cell\'s south edge');
    assert.equal(f2.cells[t.y][t.x], 'low', 'blocks movement, not shots');
    for (const dx of [-1, 1]) assert.notEqual(f2.cells[t.y][t.x + dx], 'low', 'the chairs reach into open cells beside it');
  }
});

test('布局三版露台：每组桌椅占两格碰撞，画面正好盖住这两格，伞杆立在两格中间；两侧仍是空地', () => {
  const m = mallWorldV3().maps['mall-f2'], f2: DressMap = { mapId: 'mall-f2', cells: m.cells, regions: m.regions!, decorations: m.decorations! };
  const props = mallProps(f2), sets = props.filter(p => p.assets[0] === PROCEDURAL + 'cafe-set');
  const tables = MALL_V3_LAYOUT['mall-f2'].filter(p => p.type === 'bistro-set'), [w, h] = MALL_SPRITE_SIZE['cafe-set'], [uw] = MALL_SPRITE_SIZE['overhead-umbrella'];
  assert.equal(MALL_FURNITURE['bistro-set'].w, 2); assert.equal(w, 64);
  assert.equal(tables.length, 4); assert.equal(sets.length, tables.length);
  for (const t of tables) {
    const set = sets.find(s => s.z === (t.y + 1) * 32 && s.x === t.x * 32);
    assert.ok(set, `set drawn over ${t.x}-${t.x + 1},${t.y}`); assert.equal(set.y + h, set.z, 'stands on the south edge of its cells');
    assert.ok(props.some(p => p.layer === 'overhead' && p.z === set.z && p.x + uw / 2 === (t.x + 1) * 32), `umbrella over the middle of ${t.x},${t.y}`);
    for (const dx of [0, 1]) assert.equal(f2.cells[t.y][t.x + dx], 'low', 'the whole set blocks movement, not shots');
    for (const dx of [-1, 2]) assert.notEqual(f2.cells[t.y][t.x + dx], 'low', 'open floor beside the set');
  }
});

test('商场 2.5D：海声只在楼体内闭合，广场和露台是室外', () => {
  const calls: string[] = [];
  const out = new Proxy({}, { get: (_, k) => (...a: unknown[]) => { calls.push(a.length ? `${String(k)}:${a[0]}` : String(k)); } });
  const s = new SampleSound(out as never);
  const at = (mapId: string, x: number, y: number) => ({ stamp: { world: { mapId } },
    frame: { phase: 'running', player: { x: x * 32, y: y * 32, alive: true, regionId: null, state: { moving: false, sprinting: false } }, actors: [], bullets: [],
      hud: { hp: 100, maxHp: 100, heals: 2, weapon: { reloading: false } } } }) as unknown as PublishedView;
  for (const [map, x, y] of [['mall-f1', 59.5, 4.5], ['mall-f1', 40, 25], ['mall-f2', 68.5, 33.6], ['mall-f2', 60, 20]] as const) s.frame(at(map, x, y), 1 / 60);
  assert.deepEqual(calls.filter(c => c.startsWith('setRoomTone')), ['setRoomTone:0', 'setRoomTone:1', 'setRoomTone:0', 'setRoomTone:1']);
});
