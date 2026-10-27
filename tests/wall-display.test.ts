import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import type { MapDef } from '../src/raid-runtime/contract';
import { occupiedStructure, structureBounds } from '../src/coast-view/structure-guide';
import { WALL_BUFFER, clearanceCuts, doorClearances, rowModes, wallCell, wallRule } from '../src/coast-view/wall-display';

function floor(x: number, y: number, mapId: string) {
  const state = createSessionState(), data = new Map<string, string>();
  const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
  assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42, true), true); state.state = 'run';
  const runtime = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(runtime, '?test=1'); driver.freezeAI(true);
  driver.placePlayer({ x, y }, 0, mapId);
  const { map, frame } = runtime.advance(0, emptyIntent()), occupied = occupiedStructure(map, frame.player);
  assert.ok(occupied, `inside the building on ${mapId}`);
  return { map, inside: structureBounds(map, occupied) };
}
/** Rules of every wall piece inside the building, as `x,y` -> rule. */
function rules(map: MapDef, inside: { x: number; y: number; w: number; h: number }) {
  const out = new Map<string, string>();
  for (let y = inside.y / 32; y < (inside.y + inside.h) / 32; y++) for (let x = inside.x / 32; x < (inside.x + inside.w) / 32; x++)
    if (wallCell(map, x, y)) out.set(`${x},${y}`, wallRule(map, inside, x, y));
  return out;
}

test('second floor: the fronts, sides, north-south walls and the east-west run each get their rule (plan, the five marks)', () => {
  const { map, inside } = floor(176, 176, 'resident-f2'), r = rules(map, inside);
  for (let x = 0; x < 12; x++) { assert.equal(r.get(`${x},0`), 'full', `north front ${x}`); assert.equal(r.get(`${x},9`), 'base', `south front ${x}`); }
  for (let y = 1; y < 9; y++) for (const x of [0, 11]) assert.equal(r.get(`${x},${y}`), 'full', `side ${x},${y}`);
  // North-south walls inside, their doors included; the run's west end (7,3) joins the run.
  for (let y = 4; y < 9; y++) for (const x of [4, 7]) assert.equal(r.get(`${x},${y}`), 'full', `inner wall ${x},${y}`);
  assert.equal(r.get('4,3'), 'full');
  for (const x of [7, 8, 9, 10]) assert.equal(r.get(`${x},3`), 'row', `east-west run ${x},3`);
  assert.equal(map.doors.find(d => d.x === 9 && d.y === 3)?.wall, 'ew');
  assert.equal(wallRule(map, inside, 2, 1, true), 'hidden', 'opening headers never draw');
});

test('ground floor on the coast: the south front, front door included, is base; walls outside the building have no rule here', () => {
  const { map, inside } = floor(464, 336, 'coast'), r = rules(map, inside);
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

test('doorway clearance: pieces in front of a door are cut over its cell and the wall height above it; the door and pieces behind it stay whole', () => {
  const { map, inside } = floor(176, 176, 'resident-f2'), doors = doorClearances(map, inside, 48);
  const west = doors.find(d => d.rect.x === 4 * 32 && d.z === 6 * 32)!;
  assert.deepEqual(west.rect, { x: 128, y: 112, w: 32, h: 80 });
  // Wall pieces are 32 x 80, drawn 48 px above their cell, at depth (y + 1) * 32.
  const piece = (x: number, y: number) => ({ rect: { x: x * 32, y: y * 32 - 48, w: 32, h: 80 }, z: (y + 1) * 32 });
  const cuts = (x: number, y: number) => { const p = piece(x, y); return clearanceCuts(doors, p.rect, p.z); };
  assert.deepEqual(cuts(4, 6), [{ x: 0, y: 0, w: 32, h: 48 }]);
  assert.deepEqual(cuts(4, 7), [{ x: 0, y: 0, w: 32, h: 16 }]);
  assert.deepEqual(cuts(4, 8), []);
  assert.deepEqual(cuts(4, 5), [], 'the door itself');
  assert.deepEqual(cuts(4, 4), [], 'behind the door');
});
