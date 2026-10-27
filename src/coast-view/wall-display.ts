/**
 * Indoor walls (docs/INDOOR-WALL-VISIBILITY-PLAN.md): how each wall piece of the building the player stands in shows,
 * its whole picture or only the cell it stands on. Display only: collision, bullets, doors and room reveals never read
 * it, and nothing here widens what `ViewFrame.revealed` lets the view draw.
 */
import type { MapDef, Point, Rect } from '../raid-runtime/contract';

/**
 * `full`: the whole picture. `base`: only its own cell (the wall's footprint). `row`: base while the player is north of
 * the wall's row, full while south (rowModes). `hidden`: not drawn.
 */
export type WallRule = 'full' | 'base' | 'row' | 'hidden';
export type WallMode = 'full' | 'base' | 'hidden';
/** World px either side of a row's centre line within which the row keeps its mode (edges included). */
export const WALL_BUFFER = 4;

const T = 32;
const contains = (r: Rect, p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A cell the generic builder draws as a wall piece: wall, window or door. */
export const wallCell = (m: MapDef, x: number, y: number) => {
  const c = m.cells[y]?.[x];
  return c === 'wall' || c === 'window' || m.doors.some(d => d.x === x && d.y === y);
};

/**
 * The rule of the wall piece at cell (x, y) of the occupied building, whose floor plan is `inside` (structureBounds). A
 * cell whose south neighbour lies outside it is the south front: base. Then the north front and the west and east sides
 * (a neighbour outside that way) and walls running north-south stay full. A wall with a wall cell east or west of it
 * runs east-west: `row`. Corners and tees belong to the front they lie on, then to the east-west run. Headers over
 * openings (`lintel`) are hidden: the doorway below them stays clear.
 */
export function wallRule(m: MapDef, inside: Rect, x: number, y: number, lintel = false): WallRule {
  if (lintel) return 'hidden';
  const out = (cx: number, cy: number) => !contains(inside, { x: cx * T + T / 2, y: cy * T + T / 2 });
  if (out(x, y + 1)) return 'base';
  if (out(x, y - 1) || out(x - 1, y) || out(x + 1, y)) return 'full';
  return wallCell(m, x - 1, y) || wallCell(m, x + 1, y) ? 'row' : 'full';
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

/** A doorway of the occupied building: the door cell and the wall height above it, where the door's picture stands. */
export interface Clearance { rect: Rect; z: number }
export function doorClearances(m: MapDef, inside: Rect, wallH: number): Clearance[] {
  return m.doors.filter(d => contains(inside, { x: d.x * T + T / 2, y: d.y * T + T / 2 }))
    .map(d => ({ rect: { x: d.x * T, y: d.y * T - wallH, w: T, h: T + wallH }, z: (d.y + 1) * T }));
}
/**
 * The canvas-local rectangles a piece drawn at `rect` (world px) with depth `z` clears so the doorways stay open: the
 * parts over a doorway of pieces drawn after its door (south of it). The door's own picture and pieces behind it keep
 * every pixel, so a closed door stays whole.
 */
export function clearanceCuts(clearances: readonly Clearance[], rect: Rect, z: number): Rect[] {
  return clearances.filter(c => z > c.z && intersects(c.rect, rect)).map(c => {
    const x0 = Math.max(c.rect.x, rect.x), y0 = Math.max(c.rect.y, rect.y);
    const x1 = Math.min(c.rect.x + c.rect.w, rect.x + rect.w), y1 = Math.min(c.rect.y + c.rect.h, rect.y + rect.h);
    return { x: x0 - rect.x, y: y0 - rect.y, w: x1 - x0, h: y1 - y0 };
  });
}
