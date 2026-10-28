/**
 * Indoor walls (docs/INDOOR-WALL-VISIBILITY-PLAN.md): how each wall piece of the building the player stands in shows,
 * its whole picture or only the cell it stands on. Display only: collision, bullets, doors and room reveals never read
 * it, and nothing here widens what `ViewFrame.revealed` lets the view draw.
 */
import type { MapDef, Point, Rect } from '../raid-runtime/contract';
import { MALL_FOOTPRINT } from './mall-dressing';
import { isMall, occupiedStructure, structureBounds } from './structure-guide';

/**
 * `full`: the whole picture. `base`: only its own cell (the wall's footprint). `row`: base while the player is north of
 * the wall's row, full while south (rowModes). `hidden`: not drawn.
 */
export type WallRule = 'full' | 'base' | 'row' | 'hidden';
export type WallMode = 'full' | 'base' | 'hidden';
/** World px either side of a row's centre line within which the row keeps its mode (edges included). */
export const WALL_BUFFER = 4;
/** Whether a map cell holds a wall piece (the view's own list: mall floors draw furniture and pillars apart). */
export type WallAt = (x: number, y: number) => boolean;

const T = 32;
const contains = (r: Rect, p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const centre = (c: Point): Point => ({ x: c.x * T + T / 2, y: c.y * T + T / 2 });

/** A cell the generic builder draws as a wall piece: wall, window or door. */
export const wallCell = (m: MapDef, x: number, y: number) => {
  const c = m.cells[y]?.[x];
  return c === 'wall' || c === 'window' || m.doors.some(d => d.x === x && d.y === y);
};

/**
 * The floor plan the rule applies to while the player stands in it, `id` naming it: the occupied building's
 * (structureBounds), or on a mall floor the mall's footprint. The plaza, the terrace and the streets around the mall are
 * outdoors, so there the rule is off. Null outside.
 */
export function indoorArea(map: MapDef, player: Point): { id: string; inside: Rect } | null {
  if (isMall(map)) return contains(MALL_FOOTPRINT, player) ? { id: 'mall', inside: MALL_FOOTPRINT } : null;
  const b = occupiedStructure(map, player);
  return b ? { id: b.id, inside: structureBounds(map, b) } : null;
}
/** Whether the piece at `cell` follows the rule: inside the floor plan, and not in a sealed block (no floor behind it). */
export function underRule(map: MapDef, inside: Rect, cell: Point): boolean {
  const p = centre(cell);
  return contains(inside, p) && !map.regions.some(r => r.sealed && contains(r, p));
}

/** Wall cells in a straight line through (x, y), itself included. */
const span = (wall: WallAt, x: number, y: number, dx: number, dy: number) => {
  let n = 1;
  for (let i = 1; wall(x + dx * i, y + dy * i); i++) n++;
  for (let i = 1; wall(x - dx * i, y - dy * i); i++) n++;
  return n;
};
/** A wall cell longer east-west than north-south through it: part of an east-west run, however thick. */
const across = (wall: WallAt, x: number, y: number) => wall(x, y) && span(wall, x, y, 1, 0) > span(wall, x, y, 0, 1);

/**
 * The rule of the wall piece at cell (x, y) of the floor plan `inside`. A cell whose south neighbour lies outside it is
 * the south front: base. Then the north front and the west and east sides (a neighbour outside that way) stay full.
 * Inside, a cell of an east-west run, or beside one east or west, is `row`; the rest (walls running north-south, square
 * blocks) stays full. So a thick wall goes by its long side, and corners and tees belong to the front they lie on, then
 * to the run. Headers over openings (`lintel`) are hidden: the doorway below them stays clear.
 */
export function wallRule(wall: WallAt, inside: Rect, x: number, y: number, lintel = false): WallRule {
  if (lintel) return 'hidden';
  const out = (cx: number, cy: number) => !contains(inside, centre({ x: cx, y: cy }));
  if (out(x, y + 1)) return 'base';
  if (out(x, y - 1) || out(x - 1, y) || out(x + 1, y)) return 'full';
  return across(wall, x, y) || across(wall, x - 1, y) || across(wall, x + 1, y) ? 'row' : 'full';
}

/**
 * Modes of the `row` walls by the player's feet: a row is base while the feet are north of its centre line by more than
 * WALL_BUFFER, full while south by more. In between it keeps `previous`, and starts as base. Every run in a row
 * switches together, so a row never opens a gap that follows the player.
 */
export function rowModes(rows: Iterable<number>, feetY: number, previous: ReadonlyMap<number, 'full' | 'base'> = new Map()): Map<number, 'full' | 'base'> {
  const out = new Map<number, 'full' | 'base'>();
  for (const r of rows) {
    const c = (r + .5) * T;
    out.set(r, feetY < c - WALL_BUFFER ? 'base' : feetY > c + WALL_BUFFER ? 'full' : previous.get(r) ?? 'base');
  }
  return out;
}

/** Seconds a wall takes to sink into its cell (whole picture to base) or to rise back out of it. */
export const WALL_SINK_T = .2;
/**
 * How far a wall has sunk, from 0 (the whole picture) to 1 (down to its cell), `dt` seconds later on its way to `goal`.
 * It moves at a constant rate, so a wall turned back half-way returns from where it is.
 */
export function sinkStep(sunk: number, goal: 0 | 1, dt: number): number {
  const step = dt / WALL_SINK_T;
  return goal > sunk ? Math.min(goal, sunk + step) : Math.max(goal, sunk - step);
}
/**
 * The picture of a wall `h` px tall (its cell the bottom 32 rows) sunk `sunk` of the way: lowered `drop` whole px, eased
 * at both ends; the rows lowered past its cell are not drawn, and its top `clear` rows (doorway cuts) stay clear where
 * they are. Source rows [from, to) are drawn from canvas row `at`, nothing when `from >= to`. All the way down, the top
 * 32 rows (the wall's top) stand on its cell, as in the base picture.
 */
export function sunkRows(h: number, sunk: number, clear: number): { drop: number; at: number; from: number; to: number } {
  const drop = Math.round(sunk * sunk * (3 - 2 * sunk) * (h - T)), at = Math.max(drop, clear);
  return { drop, at, from: at - drop, to: h - drop };
}
/**
 * The top rows a piece `w` px wide keeps clear for doorways when its cuts are all whole-width bands from its top, the
 * shape a doorway north of a 32 px piece gives: it can sink with them left in place. Null for any other shape, which
 * switches outright.
 */
export function topClear(cut: readonly Rect[], w: number): number | null {
  let k = 0;
  for (const r of cut) { if (r.y > 0 || r.x > 0 || r.x + r.w < w) return null; k = Math.max(k, r.y + r.h); }
  return k;
}

/** A doorway: its cells and the wall height above them, where the door's (or the header's) picture stands. */
export interface Clearance { rect: Rect; z: number }
/** One clearance per doorway, given as its cells (both lines of a thick wall's opening together). */
export function clearances(doorways: readonly (readonly Point[])[], wallH: number): Clearance[] {
  return doorways.filter(d => d.length).map(d => {
    const x0 = Math.min(...d.map(c => c.x)), x1 = Math.max(...d.map(c => c.x)), y0 = Math.min(...d.map(c => c.y)), y1 = Math.max(...d.map(c => c.y));
    return { rect: { x: x0 * T, y: y0 * T - wallH, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T + wallH }, z: (y1 + 1) * T };
  });
}
/** The doors of the floor plan `inside`. */
export function doorClearances(m: MapDef, inside: Rect, wallH: number): Clearance[] {
  return clearances(m.doors.filter(d => contains(inside, centre(d))).map(d => [d]), wallH);
}
/**
 * The canvas-local rectangles a piece drawn at `rect` (world px) with depth `z` clears so the doorways stay open: the
 * parts over a doorway of pieces drawn after its door (south of it). The door's own picture and pieces behind it keep
 * every pixel, so a closed door stays whole.
 */
export function clearanceCuts(list: readonly Clearance[], rect: Rect, z: number): Rect[] {
  return list.filter(c => z > c.z && intersects(c.rect, rect)).map(c => {
    const x0 = Math.max(c.rect.x, rect.x), y0 = Math.max(c.rect.y, rect.y);
    const x1 = Math.min(c.rect.x + c.rect.w, rect.x + rect.w), y1 = Math.min(c.rect.y + c.rect.h, rect.y + rect.h);
    return { x: x0 - rect.x, y: y0 - rect.y, w: x1 - x0, h: y1 - y0 };
  });
}
