import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture, type Sprite } from 'pixi.js';
import { Lighting, REVEAL_FADE, UNSEEN_TINT, unseenTint, type Light } from '../src/coast-view/lighting';
import type { MapDef, RegionDef } from '../src/raid-runtime/contract';
import type { Textures } from '../src/coast-view/textures';

/** A Lighting with no map (ambient = the mood's outdoor colour, kept dark so `at` never saturates) and the given lights. */
const rig = (...lights: Light[]) => {
  const L = new Lighting({ ensure: () => Texture.EMPTY } as unknown as Textures);
  L.mood = { ...L.mood, outdoor: 0x101010 }; L.lights = lights;
  const pool = (L as unknown as { pool: Sprite[] }).pool;
  return { L, shown: () => pool.filter(s => s.visible), sprite: (l: Light) => pool.find(s => s.visible && s.x === Math.round(l.x) && s.y === Math.round(l.y)) };
};
/** The scene's predicate (scene.ts, present): no room, or the room and every overlapping room revealed. */
const gate = (rv: Record<string, boolean>) => (l: Light) => (l.region === undefined || l.region === null || rv[l.region] === true) && !l.regions?.some(r => rv[r] !== true);
const lampIn = (region: string | null, x = 100, y = 100): Light => ({ x, y, r: 110, color: 0xc3a26a, k: .55, region });
const AMBIENT = 0x101010, HIDDEN = { A: false }, SHOWN = { A: true }, FRAME = 1 / 60;

test('房间灯光：新建的灯按当前揭示状态直接到位，已揭示的房间第一帧就是满亮', () => {
  const lamp = lampIn('A'), { L, sprite } = rig(lamp);
  L.sync(FRAME, gate(SHOWN));
  assert.equal(lamp.lit, 1); assert.equal(sprite(lamp)?.alpha, .55);
  const dark = lampIn('A', 300), r2 = rig(dark);
  r2.L.sync(FRAME, gate(HIDDEN));
  assert.equal(dark.lit, 0, 'a fresh light in a hidden room starts dark'); assert.equal(r2.shown().length, 0);
});

test('房间灯光：揭示后 0.3 秒线性亮起，每帧 dt/0.3，满亮后不再变', () => {
  assert.equal(REVEAL_FADE, .3);
  const lamp = lampIn('A'), { L, shown, sprite } = rig(lamp);
  L.sync(FRAME, gate(HIDDEN));
  assert.equal(lamp.lit, 0); assert.equal(shown().length, 0, 'no sprite while the room is hidden');
  L.sync(FRAME, gate(SHOWN));
  assert.ok(Math.abs(lamp.lit! - 1 / 18) < 1e-12, `first frame ${lamp.lit}`);
  assert.ok(Math.abs(sprite(lamp)!.alpha - .55 / 18) < 1e-12, `first-frame alpha ${sprite(lamp)!.alpha}`);
  const mid = L.at({ x: 100, y: 100 }, null, SHOWN);
  assert.ok(mid > AMBIENT, 'the upright tint rises with the floor light');
  let prev = lamp.lit!;
  for (let n = 2; n <= 18; n++) { L.sync(FRAME, gate(SHOWN)); assert.ok(lamp.lit! > prev, `frame ${n} rises`); prev = lamp.lit!; }
  assert.equal(lamp.lit, 1, '18 frames of 1/60 s make 0.3 s'); assert.equal(sprite(lamp)!.alpha, .55);
  const full = L.at({ x: 100, y: 100 }, null, SHOWN);
  assert.ok(full > mid, 'the tint ends brighter than mid-ramp');
  L.sync(FRAME, gate(SHOWN)); assert.equal(lamp.lit, 1); assert.equal(L.at({ x: 100, y: 100 }, null, SHOWN), full, 'at rest the light holds');
  // A long frame (Pixi caps a hitch at 100 ms) advances the ramp by a third.
  const slow = lampIn('A', 400), r2 = rig(slow);
  r2.L.sync(FRAME, gate(HIDDEN));
  for (const want of [1 / 3, 2 / 3]) { r2.L.sync(.1, gate(SHOWN)); assert.ok(Math.abs(slow.lit! - want) < 1e-12, `${slow.lit} vs ${want}`); }
  r2.L.sync(.1, gate(SHOWN)); assert.equal(slow.lit, 1); assert.equal(r2.sprite(slow)!.alpha, .55);
});

test('房间灯光：房间一隐藏就在同一帧熄灭，dt 为 0 也一样；at() 回到只有环境光', () => {
  const lamp = lampIn('A'), { L, shown } = rig(lamp);
  L.sync(FRAME, gate(SHOWN)); assert.equal(lamp.lit, 1);
  assert.notEqual(L.at({ x: 100, y: 100 }, null, SHOWN), AMBIENT);
  L.sync(0, gate(HIDDEN));
  assert.equal(lamp.lit, 0); assert.equal(shown().length, 0, 'no sprite in the frame the room is hidden');
  assert.equal(L.at({ x: 100, y: 100 }, null, HIDDEN), AMBIENT);
  // A room missing from `revealed`: sync hides the lamp, and at() agrees instead of lighting the uprights.
  const other = lampIn('B', 100, 100), r2 = rig(other);
  r2.L.sync(FRAME, gate({}));
  assert.equal(r2.shown().length, 0); assert.equal(r2.L.at({ x: 100, y: 100 }, null, {}), AMBIENT);
});

test('房间灯光：渐亮途中 dt 为 0 的重绘完全相同；dt 为 0 时揭示不会让灯亮起', () => {
  const lamp = lampIn('A'), { L, shown, sprite } = rig(lamp);
  L.sync(FRAME, gate(HIDDEN));
  L.sync(0, gate(SHOWN));
  assert.equal(lamp.lit, 0, 'a reveal during a dt-0 present leaves the light where it was'); assert.equal(shown().length, 0);
  for (let n = 0; n < 7; n++) L.sync(FRAME, gate(SHOWN));
  const a = sprite(lamp)!.alpha, tint = L.at({ x: 100, y: 100 }, null, SHOWN);
  L.sync(0, gate(SHOWN)); const b = sprite(lamp)!.alpha;
  L.sync(0, gate(SHOWN)); const c = sprite(lamp)!.alpha;
  assert.ok(a > 0 && a < .55, `mid-ramp ${a}`); assert.equal(b, a); assert.equal(c, a);
  assert.equal(L.at({ x: 100, y: 100 }, null, SHOWN), tint);
});

test('房间灯光：枪口火光、火花不做渐亮；不属于任何房间的灯始终满亮', () => {
  const flash: Light = { x: 10, y: 10, r: 80, color: 0xe0b878, k: .9, ttl: .07, region: 'A' };
  const street = lampIn(null, 500, 500), open: Light = { ...lampIn('A', 700, 700), region: null, regions: [] }, { L, sprite } = rig(street, open);
  L.sync(FRAME, gate(HIDDEN));
  assert.equal(street.lit, 1); assert.equal(open.lit, 1); assert.equal(sprite(street)?.alpha, .55); assert.equal(sprite(open)?.alpha, .55);
  // A flash in a hidden room never shows.
  L.lights.push({ ...flash }); L.sync(FRAME, gate(HIDDEN));
  assert.equal(sprite(flash), undefined);
  // In a revealed room a flash shows at its own ttl fade with no ramp on top: a fresh one, and one that was hidden a frame ago.
  const lit: Light = { ...flash, x: 40 }; L.lights.push(lit); L.sync(FRAME, gate(SHOWN));
  assert.equal(lit.lit, 1); assert.ok(Math.abs(sprite(lit)!.alpha - .9 * (1 - FRAME / .07)) < 1e-12, `flash alpha ${sprite(lit)!.alpha}`);
  const was = L.lights.find(l => l.ttl !== undefined && l.x === 10)!;
  assert.equal(was.lit, 1); assert.ok(Math.abs(sprite(was)!.alpha - .9 * (1 - 2 * FRAME / .07)) < 1e-12, `revealed flash alpha ${sprite(was)!.alpha}`);
  assert.equal(sprite(street)?.alpha, .55);
});

test('房间灯光：重叠房间的灯要等每个房间都揭示后才开始亮起', () => {
  const lamp: Light = { ...lampIn('A'), regions: ['A', 'B'] }, { L, shown } = rig(lamp);
  L.sync(FRAME, gate({ A: true, B: true })); assert.equal(lamp.lit, 1);
  for (let n = 0; n < 5; n++) { L.sync(FRAME, gate({ A: true, B: false })); assert.equal(lamp.lit, 0); assert.equal(shown().length, 0); }
  assert.equal(L.at({ x: 100, y: 100 }, null, { A: true, B: false }), AMBIENT);
  L.sync(FRAME, gate({ A: true, B: true }));
  assert.ok(Math.abs(lamp.lit! - 1 / 18) < 1e-12, `ramps once both are revealed: ${lamp.lit}`);
  assert.equal(shown().length, 1);
});

/**
 * Unrevealed-room shade (#26 F14): a 10x8-cell floor with room A at cells 2..5 x 2..4 and room B (inside A) at 3..4 x 3.
 * Ambient is mid grey so the multiplied result stays exact in whole numbers.
 */
const FLOOR = { cols: 10, rows: 8, tile: 32 } as MapDef;
const room = (id: string, x: number, y: number, w: number, h: number) => ({ id, x: x * 32, y: y * 32, w: w * 32, h: h * 32, inside: true, sealed: false }) as RegionDef;
const ROOM_A = room('A', 2, 2, 4, 3), ROOM_B = room('B', 3, 3, 2, 1), GREY = 0x808080;
const shadeRig = (...rooms: RegionDef[]) => {
  const { L } = rig(); L.mood = { ...L.mood, outdoor: GREY }; L.setUnseen(FLOOR, rooms);
  const g = (L as unknown as { shade: { getLocalBounds(): { x: number; y: number; width: number; height: number } } }).shade;
  const bounds = () => { const b = g.getLocalBounds(); return b.width ? [b.x, b.y, b.width, b.height] : []; };
  return { L, bounds, at: (cx: number, cy: number, rv: Record<string, boolean>) => L.at({ x: cx * 32 + 16, y: cy * 32 + 16 }, null, rv) };
};
const times = (c: number, m: number) => { const ch = (s: number) => Math.floor(((c >> s) & 255) * ((m >> s) & 255) / 255); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };

test('未揭示房间压暗：倍率从 UNSEEN_TINT 线性升到白色', () => {
  assert.equal(unseenTint(0), UNSEEN_TINT); assert.equal(unseenTint(1), 0xffffff);
  const mid = unseenTint(.5), ch = (c: number, s: number) => (c >> s) & 255;
  for (const s of [16, 8, 0]) assert.ok(ch(mid, s) > ch(UNSEEN_TINT, s) && ch(mid, s) < 255, `channel ${s}: ${mid.toString(16)}`);
  assert.ok([16, 8, 0].every(s => ch(UNSEEN_TINT, s) < 200) && ch(UNSEEN_TINT, 0) > ch(UNSEEN_TINT, 16), 'darker, and a little cooler (more blue than red)');
});

test('未揭示房间压暗：只压房间内的格子；画面上的压暗范围就是房间；不传房间的楼层没有压暗', () => {
  const { L, bounds, at } = shadeRig(ROOM_A);
  L.syncUnseen(FRAME, HIDDEN);
  assert.equal(at(3, 3, HIDDEN), times(GREY, UNSEEN_TINT), 'inside the hidden room: ambient times UNSEEN_TINT');
  assert.equal(at(2, 2, HIDDEN), times(GREY, UNSEEN_TINT), 'its corner cell too');
  for (const [x, y] of [[1, 3], [6, 3], [3, 1], [3, 5], [0, 0]]) assert.equal(at(x, y, HIDDEN), GREY, `outside the room (${x},${y}) is untouched`);
  assert.deepEqual(bounds(), [64, 64, 128, 96], 'the multiplied floor rectangle is exactly the room');
  L.syncUnseen(FRAME, { A: true });
  // A fresh room in a revealed state starts unshaded, as a fresh light starts lit.
  const fresh = shadeRig(ROOM_A); fresh.L.syncUnseen(FRAME, SHOWN);
  assert.equal(fresh.at(3, 3, SHOWN), GREY); assert.deepEqual(fresh.bounds(), []);
  const none = shadeRig(); none.L.syncUnseen(FRAME, HIDDEN);
  assert.equal(none.at(3, 3, HIDDEN), GREY, 'a floor that passes no rooms (coast, resident building, placeholder mall) is never shaded');
  assert.deepEqual(none.bounds(), []);
});

test('未揭示房间压暗：揭示后跟灯光一起 0.3 秒恢复；隐藏时同一帧压回，dt 为 0 也一样；dt 为 0 时揭示不动', () => {
  const { L, bounds, at } = shadeRig(ROOM_A);
  L.syncUnseen(FRAME, HIDDEN);
  L.syncUnseen(0, SHOWN);
  assert.equal(at(3, 3, SHOWN), times(GREY, UNSEEN_TINT), 'a reveal during a dt-0 present leaves the shade where it was');
  L.syncUnseen(FRAME, SHOWN);
  assert.equal(at(3, 3, SHOWN), times(GREY, unseenTint(1 / 18)), 'first frame: 1/18 of the way, the same step as the lights');
  let prev = at(3, 3, SHOWN);
  for (let n = 2; n <= 18; n++) { L.syncUnseen(FRAME, SHOWN); const cur = at(3, 3, SHOWN); assert.ok(cur > prev, `frame ${n} brightens`); prev = cur; }
  assert.equal(at(3, 3, SHOWN), GREY, 'after 0.3 s nothing is left'); assert.deepEqual(bounds(), []);
  L.syncUnseen(0, HIDDEN);
  assert.equal(at(3, 3, HIDDEN), times(GREY, UNSEEN_TINT), 'hidden again in the same frame, even at dt 0');
  assert.deepEqual(bounds(), [64, 64, 128, 96]);
  // Missing from `revealed`: shaded, as the Runtime hides it.
  const other = shadeRig(ROOM_A); other.L.syncUnseen(FRAME, {});
  assert.equal(other.at(3, 3, {}), times(GREY, UNSEEN_TINT));
});

test('未揭示房间压暗：重叠房间按最暗的一层算，不叠加；内层未揭示时只压内层', () => {
  const { L, bounds, at } = shadeRig(ROOM_A, ROOM_B);
  L.syncUnseen(FRAME, { A: false, B: false });
  assert.equal(at(3, 3, {}), times(GREY, UNSEEN_TINT), 'both hidden: the shared cells are shaded once, not twice');
  L.syncUnseen(FRAME, { A: true, B: false }); for (let n = 0; n < 18; n++) L.syncUnseen(FRAME, { A: true, B: false });
  const rv = { A: true, B: false };
  assert.equal(at(3, 3, rv), times(GREY, UNSEEN_TINT), 'the hidden inner room stays shaded inside a revealed one');
  assert.equal(at(2, 2, rv), GREY, 'the revealed outer room is clear');
  assert.deepEqual(bounds(), [96, 96, 64, 32]);
});
