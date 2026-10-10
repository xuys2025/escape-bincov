/**
 * Bake-time surface work for the ground chunks: value-noise lattices, softened Sol tiles and the fused shading pass
 * (large-scale wear, contact occlusion where floors meet walls, salt crust along exterior wall feet). Everything is a
 * pure function of the map geometry and stable hashes, so a chunk bakes the same on every rebuild and both sides of a
 * chunk edge agree. Detail is shaped in 2x2 pixel clusters with ordered dithering (no smooth gradients or blur).
 */
import type { MapDef } from '../../raid-runtime/contract';
import type { GroundMaterial } from '../appearance';
import { canvas, hash } from './paint';

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise on a lattice of `cell` px with values precomputed for one map, so sampling needs no hashing. */
export class Lattice {
  private readonly w: number;
  private readonly v: Float32Array;
  constructor(readonly cell: number, salt: number, width: number, height: number) {
    this.w = Math.ceil(width / cell) + 2;
    const h = Math.ceil(height / cell) + 2;
    this.v = new Float32Array(this.w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < this.w; x++) this.v[y * this.w + x] = hash(x, y, salt);
  }
  /** Smooth value in [0, 1) at world pixel (x, y); x, y >= 0. */
  at(x: number, y: number): number {
    const gx = x / this.cell, gy = y / this.cell, x0 = gx | 0, y0 = gy | 0, sx = smooth(gx - x0), sy = smooth(gy - y0);
    const i = y0 * this.w + x0, v = this.v, a = v[i], b = v[i + 1], c = v[i + this.w], d = v[i + this.w + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

/**
 * Contrast-reduced copy of a sample tile: every channel moves toward the tile's mean by (1 - keep), then the whole tile
 * is shifted so its mean luminance is `mean` (when given). Keeps the painted clusters, drops the single-pixel static.
 */
export function soften(src: HTMLCanvasElement, keep: number, mean?: number): HTMLCanvasElement {
  const { c, g } = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  if (!n) return c;
  r /= n; gg /= n; b /= n;
  const lum = .299 * r + .587 * gg + .114 * b, shift = mean === undefined ? 0 : mean - lum;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = r + (d[i] - r) * keep + shift; d[i + 1] = gg + (d[i + 1] - gg) * keep + shift; d[i + 2] = b + (d[i + 2] - b) * keep + shift;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Per-map facts the shading pass reads: wall-like cells, materials and the noise lattices. */
export interface GroundGeometry {
  cols: number; rows: number; wall: Uint8Array; mat: GroundMaterial[][]; outdoor: Uint8Array;
  wear: Lattice; grain: Lattice; damp: Lattice;
}

export function groundGeometry(m: MapDef, M: GroundMaterial[][]): GroundGeometry {
  const cols = m.cols, rows = m.rows, wall = new Uint8Array(cols * rows), outdoor = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = m.cells[y][x];
    if (c === 'wall' || c === 'window') wall[y * cols + x] = 1;
  }
  for (const d of m.doors) wall[d.y * cols + d.x] = 1;
  // Outdoor: not inside any building footprint (the coast map's streets, yards and quays).
  const coast = m.key.mapId === 'coast';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    outdoor[y * cols + x] = coast && !m.buildings.some(b => x * 32 >= b.x && x * 32 < b.x + b.w && y * 32 >= b.y && y * 32 < b.y + b.h) ? 1 : 0;
  const W = cols * 32, H = rows * 32;
  return { cols, rows, wall, mat: M, outdoor, wear: new Lattice(72, 5, W, H), grain: new Lattice(22, 6, W, H), damp: new Lattice(40, 7, W, H) };
}

const isWall = (geo: GroundGeometry, x: number, y: number) => x >= 0 && y >= 0 && x < geo.cols && y < geo.rows && geo.wall[y * geo.cols + x] === 1;

/**
 * Darkening (0..1) where a floor pixel meets a wall's ground line. A wall cell's sprite ends on its bottom edge, so the
 * floor below a wall starts at its contact line; side walls meet the floor along the cell's vertical edge. The floor
 * north of a wall is covered by that wall's face and cap, so it needs none.
 */
function contact(geo: GroundGeometry, tx: number, ty: number, lx: number, ly: number): number {
  let ao = 0;
  const up = isWall(geo, tx, ty - 1), left = isWall(geo, tx - 1, ty), right = isWall(geo, tx + 1, ty);
  if (up) ao = Math.max(ao, 1 - ly / 8);
  if (left) ao = Math.max(ao, (1 - lx / 6) * .85);
  if (right) ao = Math.max(ao, (1 - (31 - lx) / 6) * .85);
  if (!up && !left && isWall(geo, tx - 1, ty - 1)) ao = Math.max(ao, 1 - Math.hypot(lx, ly) / 7);
  if (!up && !right && isWall(geo, tx + 1, ty - 1)) ao = Math.max(ao, 1 - Math.hypot(31 - lx, ly) / 7);
  return Math.max(0, ao);
}

/** Wear amplitude per material (luminance units): streets and yards vary most, interior floors a little. */
const WEAR: Partial<Record<GroundMaterial, number>> = { asphalt: 20, yard: 16, concrete: 14, tile: 9, wood: 9, mud: 12 };
/** Warm/cool split of the wear: worn light patches lean dusty, dark patches lean damp. */
const TINT: Partial<Record<GroundMaterial, [number, number, number]>> = { asphalt: [1, .98, .93], yard: [1, .97, .9], concrete: [1, .98, .94] };

/**
 * Fused pass over one chunk's pixels (world origin bx, by): wear, damp, contact occlusion, salt and, when given, the
 * cast-shadow mask (3 core, 2 and 1 the dithered penumbra rings). The caller owns the single read and write of the
 * canvas. Noise fields are sampled every 4 px (they vary over tens of pixels); quantization still dithers per 2 px.
 */
export function shadeGround(d: Uint8ClampedArray, geo: GroundGeometry, bx: number, by: number, w: number, h: number, shadow: Uint8Array | null) {
  const cols = Math.ceil(w / 4) + 1, wearRow = new Float32Array(cols), dampRow = new Float32Array(cols);
  for (let y = 0; y < h; y += 2) {
    if ((y & 3) === 0) for (let i = 0; i < cols; i++) {
      const wx = Math.max(0, bx + i * 4), wy = Math.max(0, by + y);
      wearRow[i] = .64 * geo.wear.at(wx, wy) + .36 * geo.grain.at(wx, wy) - .5; dampRow[i] = geo.damp.at(wx, wy);
    }
    for (let x = 0; x < w; x += 2) {
    const wx = bx + x, wy = by + y, tx = wx >> 5, ty = wy >> 5;
    if (tx < 0 || ty < 0 || tx >= geo.cols || ty >= geo.rows || geo.wall[ty * geo.cols + tx]) continue;
    const mat = geo.mat[ty][tx];
    if (mat === 'void' || mat === 'water') continue;
    const dither = BAYER4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] / 16 - .5;
    // Large soft wear plus a finer grain, quantized to 3-unit steps through the dither so patches have pixel edges.
    const n = wearRow[x >> 2];
    const off = Math.round(n * (WEAR[mat] ?? 0) / 3 + dither) * 3;
    const tint = off > 0 ? TINT[mat] ?? null : null;
    // Damp: dark, slightly cool blotches on outdoor ground (the town after the storm), clustered by their own lattice.
    const outdoor = geo.outdoor[ty * geo.cols + tx] === 1;
    const damp = outdoor && (mat === 'asphalt' || mat === 'yard') ? Math.max(0, dampRow[x >> 2] - .68) * 3 : 0;
    const wet = damp > .1 + (dither + .5) * .3 ? .9 : 1;
    // Contact occlusion in three dithered bands.
    const ly = (wy & 31) + 1, ao = contact(geo, tx, ty, (wx & 31) + 1, ly);
    const band = Math.min(3, Math.max(0, Math.round(ao * 3 + dither * .9)));
    const mul = (1 - band * .13) * wet;
    // Salt crust: sparse pale clusters right at the foot of exterior walls (below the wall, not along its sides).
    const salt = outdoor && band >= 2 && ly < 5 && isWall(geo, tx, ty - 1) && hash(wx >> 1, wy >> 1, 41) < .09;
    for (let j = 0; j < 2 && y + j < h; j++) for (let i = 0; i < 2 && x + i < w; i++) {
      const p = (y + j) * w + x + i, k = p * 4;
      if (salt) { d[k] = 158; d[k + 1] = 153; d[k + 2] = 141; }
      else {
        d[k] = (d[k] + off) * (tint ? tint[0] : 1) * mul;
        d[k + 1] = (d[k + 1] + off) * (tint ? tint[1] : 1) * mul;
        d[k + 2] = (d[k + 2] + off) * (tint ? tint[2] : 1) * (wet < 1 ? mul * 1.04 : mul);
      }
    }
    }
  }
  if (shadow) applyShadow(d, shadow, w, h);
}

/** Cast shadows from the mask: core x0.7, first ring checkered 0.7/0.85, second ring checkered 0.85/1 (slightly cool). */
export function applyShadow(d: Uint8ClampedArray, mask: Uint8Array, w: number, h: number) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const level = mask[y * w + x]; if (!level) continue;
    const checker = ((x + y) & 1) === 0;
    const k = level === 3 ? .7 : level === 2 ? (checker ? .7 : .85) : (checker ? .85 : 1);
    if (k === 1) continue;
    const i = (y * w + x) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k * 1.02;
  }
}
