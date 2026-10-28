import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import type { MapDef } from '../src/raid-runtime/contract';
import type { WorldDefinition } from '../src/expansion-state';
import { mallWorldV2, mallWorldV3, mallWorldV4 } from '../src/mall-world';
import { MALL_FOOTPRINT, mallOpenings, mallWallCells, mallWallRole, type DressMap } from '../src/coast-view/mall-dressing';
import { WALL_BUFFER, clearanceCuts, clearances, doorClearances, indoorArea, rowModes, underRule, wallCell, wallRule, type WallAt } from '../src/coast-view/wall-display';

function floor(x: number, y: number, mapId: string) {
  const state = createSessionState(), data = new Map<string, string>();
  const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
  assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42, true), true); state.state = 'run';
  const runtime = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(runtime, '?test=1'); driver.freezeAI(true);
  driver.placePlayer({ x, y }, 0, mapId);
  const { map, frame } = runtime.advance(0, emptyIntent()), area = indoorArea(map, frame.player);
  assert.ok(area, `inside the building on ${mapId}`);
  return { map, inside: area.inside, wall: ((cx, cy) => wallCell(map, cx, cy)) as WallAt };
}
/** Rules of every wall piece inside the building, as `x,y` -> rule. */
function rules(wall: WallAt, inside: { x: number; y: number; w: number; h: number }) {
  const out = new Map<string, string>();
  for (let y = inside.y / 32; y < (inside.y + inside.h) / 32; y++) for (let x = inside.x / 32; x < (inside.x + inside.w) / 32; x++)
    if (wall(x, y)) out.set(`${x},${y}`, wallRule(wall, inside, x, y));
  return out;
}

test('second floor: the fronts, sides, north-south walls and the east-west run each get their rule (plan, the five marks)', () => {
  const { inside, wall } = floor(176, 176, 'resident-f2'), r = rules(wall, inside);
  for (let x = 0; x < 12; x++) { assert.equal(r.get(`${x},0`), 'full', `north front ${x}`); assert.equal(r.get(`${x},9`), 'base', `south front ${x}`); }
  for (let y = 1; y < 9; y++) for (const x of [0, 11]) assert.equal(r.get(`${x},${y}`), 'full', `side ${x},${y}`);
  // North-south walls inside, their doors included; the run's west end (7,3) joins the run.
  for (let y = 4; y < 9; y++) for (const x of [4, 7]) assert.equal(r.get(`${x},${y}`), 'full', `inner wall ${x},${y}`);
  assert.equal(r.get('4,3'), 'full');
  for (const x of [7, 8, 9, 10]) assert.equal(r.get(`${x},3`), 'row', `east-west run ${x},3`);
  assert.equal(wallRule(wall, inside, 2, 1, true), 'hidden', 'opening headers never draw');
});

test('ground floor on the coast: the south front, front door included, is base; walls outside the building have no rule here', () => {
  const { map, inside, wall } = floor(464, 336, 'coast'), r = rules(wall, inside);
  assert.deepEqual([inside.x, inside.y, inside.w, inside.h], [320, 224, 288, 192]);
  for (let x = 10; x <= 18; x++) { assert.equal(r.get(`${x},12`), 'base'); assert.equal(r.get(`${x},7`), 'full'); }
  assert.ok(map.doors.some(d => d.id === 'resident-front' && d.x === 14 && d.y === 12));
  for (const x of [13, 16]) for (let y = 9; y <= 11; y++) assert.equal(r.get(`${x},${y}`), 'full');
  assert.equal(r.get('10,10'), 'full', 'west window');
});

test('a row switches only past the buffer, keeps its mode inside it, starts as base there, and moves as one row', () => {
  const c = 3.5 * 32;
  assert.deepEqual([...rowModes([3], c - WALL_BUFFER - 1)], [[3, 'base']]);
  assert.deepEqual([...rowModes([3], c + WALL_BUFFER + 1)], [[3, 'full']]);
  for (const y of [c - WALL_BUFFER, c, c + WALL_BUFFER]) {
    assert.equal(rowModes([3], y).get(3), 'base', `first frame at ${y}`);
    assert.equal(rowModes([3], y, new Map([[3, 'full']])).get(3), 'full', `kept full at ${y}`);
    assert.equal(rowModes([3], y, new Map([[3, 'base']])).get(3), 'base', `kept base at ${y}`);
  }
  // North of row 3 and south of row 1 at once.
  assert.deepEqual(Object.fromEntries(rowModes([1, 3], 2.5 * 32)), { 1: 'full', 3: 'base' });
});

/** Wall pieces are 32 x (32 + lift), drawn `lift` px above their cell, at depth (y + 1) * 32. */
const piece = (x: number, y: number, lift = 48) => ({ rect: { x: x * 32, y: y * 32 - lift, w: 32, h: 32 + lift }, z: (y + 1) * 32 });

test('doorway clearance: pieces in front of a door are cut over its cell and the wall height above it; the door and pieces behind it stay whole', () => {
  const { map, inside } = floor(176, 176, 'resident-f2'), doors = doorClearances(map, inside, 48);
  const west = doors.find(d => d.rect.x === 4 * 32 && d.z === 6 * 32)!;
  assert.deepEqual(west.rect, { x: 128, y: 112, w: 32, h: 80 });
  const cuts = (x: number, y: number) => { const p = piece(x, y); return clearanceCuts(doors, p.rect, p.z); };
  assert.deepEqual(cuts(4, 6), [{ x: 0, y: 0, w: 32, h: 48 }]);
  assert.deepEqual(cuts(4, 7), [{ x: 0, y: 0, w: 32, h: 16 }]);
  assert.deepEqual(cuts(4, 8), []);
  assert.deepEqual(cuts(4, 5), [], 'the door itself');
  assert.deepEqual(cuts(4, 4), [], 'behind the door');
});

/**
 * A mall floor as the dressed view draws it: wall pieces are the wall cells that are neither furniture nor the drop
 * (mallDress), and the map carries the parts indoorArea and underRule read.
 */
function mall(world: WorldDefinition, id: string) {
  const m = world.maps[id], d: DressMap = { mapId: id, cells: m.cells, regions: m.regions!, decorations: m.decorations!, full: world.revision === 'mall-layout-4' };
  const drawn = new Set(mallWallCells(d).filter(c => mallWallRole(d, c.x, c.y) !== 'void').map(c => `${c.x},${c.y}`));
  const wall: WallAt = (x, y) => drawn.has(`${x},${y}`);
  const map = { key: { mapId: id }, cells: m.cells, doors: [], regions: m.regions!.map(r => ({ ...r, inside: r.inside !== false })),
    buildings: [{ id: 'mall', kind: 'mall', ...MALL_FOOTPRINT, regionIds: ['F1-03'] }] } as unknown as MapDef;
  const rule = (x: number, y: number) => wall(x, y) && underRule(map, MALL_FOOTPRINT, { x, y }) ? wallRule(wall, MALL_FOOTPRINT, x, y) : null;
  return { d, map, wall, drawn, rule };
}

test('mall floors: the rule applies inside the footprint only, never on the plaza, the terrace or the street', () => {
  const { map } = mall(mallWorldV4(), 'mall-f2');
  assert.equal(indoorArea(map, { x: 48.5 * 32, y: 3.5 * 32 }), null, 'the entrance plaza');
  assert.equal(indoorArea(map, { x: 70 * 32, y: 30 * 32 }), null, 'the terrace');
  assert.deepEqual(indoorArea(map, { x: 35 * 32, y: 25 * 32 }), { id: 'mall', inside: MALL_FOOTPRINT });
});

test('mall ground floor (layout 4): facade full, south front base, runs by row, north-south walls full, thick walls by their long side', () => {
  const { rule } = mall(mallWorldV4(), 'mall-f1');
  // The north front and the glass curtain of the lobby; the stepped north-west block and both sides, two cells thick.
  for (const [x, y] of [[20, 6], [55, 6], [64, 7], [10, 8], [8, 20], [9, 30], [63, 30], [64, 30]]) assert.equal(rule(x, y), 'full', `facade ${x},${y}`);
  // The facade's inner line on row 7 is a run like any other: the player is always south of it, so it stays whole.
  assert.equal(rule(12, 7), 'row'); assert.equal(rowModes([7], 8 * 32 + 10).get(7), 'full');
  for (const [x, y] of [[8, 48], [20, 48], [44, 48], [64, 48]]) assert.equal(rule(x, y), 'base', `south front ${x},${y}`);
  // Runs: shop fronts and back walls (their ends at a north-south wall or the west side join them).
  for (const [x, y] of [[15, 17], [26, 17], [15, 20], [31, 13], [29, 13], [60, 18], [63, 18]]) assert.equal(rule(x, y), 'row', `run ${x},${y}`);
  assert.equal(rule(64, 18), 'full', 'the east side beside the run\'s end');
  // North-south walls, the walls beside the side door of the store (57, 21-23).
  for (const [x, y] of [[26, 10], [43, 10], [57, 20], [57, 24]]) assert.equal(rule(x, y), 'full', `north-south ${x},${y}`);
  // The wall line under the sealed core belongs to its block, as square as it is long: whole.
  for (const x of [45, 49, 53]) assert.equal(rule(x, 14), 'full', `core's south line ${x}`);
});

test('mall floors on every layout: row 6 and the sides full, row 48 base, the sealed core never under the rule', () => {
  for (const world of [mallWorldV2(), mallWorldV3(), mallWorldV4()]) for (const id of ['mall-f1', 'mall-f2']) {
    const { map, drawn, rule } = mall(world, id), name = `${world.id} ${id}`;
    const core = map.regions.filter(r => r.sealed);
    assert.deepEqual(core.map(r => [r.x, r.y, r.w, r.h]), [[45 * 32, 7 * 32, 9 * 32, 7 * 32]], `${name}: one sealed core at x45 y7, 9x7`);
    let checked = 0;
    for (const k of drawn) {
      const [x, y] = k.split(',').map(Number);
      if (x < 8 || x > 64 || y < 6 || y > 48) { assert.equal(underRule(map, MALL_FOOTPRINT, { x, y }), false, `${name}: outdoors ${k}`); continue; }
      if (x >= 45 && x <= 53 && y >= 7 && y <= 13) { assert.equal(rule(x, y), null, `${name}: core ${k}`); continue; }
      const r = rule(x, y); checked++;
      if (y === 48) assert.equal(r, 'base', `${name}: south front ${k}`);
      else if (y === 6 || x === 8 || x === 64) assert.equal(r, 'full', `${name}: facade ${k}`);
      else assert.ok(r === 'full' || r === 'row', `${name}: ${k} is ${r}`);
    }
    assert.ok(checked > 300, `${name}: ${checked} walls`);
  }
});

test('mall upper floor (layout 4): thick west blocks run by row, the south line base, a side entrance to the terrace stays clear', () => {
  const { d, rule } = mall(mallWorldV4(), 'mall-f2');
  for (const [x, y] of [[14, 22], [18, 22], [25, 28], [10, 47], [14, 47]]) assert.equal(rule(x, y), 'row', `run ${x},${y}`);
  assert.equal(rowModes([47], 46 * 32 + 10).get(47), 'base', 'the south line is always behind the player');
  assert.equal(rule(18, 23), 'full', 'the north-south wall between the two west rooms');
  // The east side opens on the terrace at x 64, rows 27-29: the jamb south of it is cut over the opening (a low jamb
  // stands 16 px), and the jamb north of it and the opening's own cells keep every pixel.
  const east = mallOpenings(d).find(o => o.wall === 'ns' && o.cells.some(c => c.x === 64 && c.y === 27))!;
  assert.deepEqual(east.cells.map(c => c.y), [27, 28, 29]);
  const doors = clearances([[...east.cells, ...east.twin ?? []]], 48), cuts = (x: number, y: number, lift?: number) => { const p = piece(x, y, lift); return clearanceCuts(doors, p.rect, p.z); };
  assert.deepEqual(cuts(64, 30), [{ x: 0, y: 0, w: 32, h: 48 }]);
  assert.deepEqual(cuts(64, 30, 16), [{ x: 0, y: 0, w: 32, h: 16 }]);
  assert.deepEqual(cuts(64, 31, 32), []);
  assert.deepEqual(cuts(64, 26), [], 'north of the opening');
});
