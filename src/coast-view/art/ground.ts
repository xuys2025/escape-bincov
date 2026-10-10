import type { MapDef, Rect } from '../../raid-runtime/contract';
import type { GroundMaterial } from '../appearance';
import { P, canvas, dot, hash, line, rect, type Ctx } from './paint';
import { solGround, type SolArt } from './sol';
import { BAYER4, shadeGround, type GroundGeometry } from './surface';

/** A flat puddle on outdoor ground: a union of two or three ellipses (world px). Rain ripples land on these. */
export interface Puddle { x: number; y: number; parts: { dx: number; dy: number; rx: number; ry: number }[] }

const isWall = (geo: GroundGeometry, x: number, y: number) => x >= 0 && y >= 0 && x < geo.cols && y < geo.rows && geo.wall[y * geo.cols + x] === 1;

function tile(g: Ctx, M: GroundMaterial[][], tx: number, ty: number, x: number, y: number, art: SolArt | null) {
  const mat = M[ty]?.[tx] ?? 'void', h = (i: number) => hash(tx, ty, i);
  // Sol samples replace the base texture (softened, see sol.ts); cracks, moss and drains stay as runtime variation.
  // Large-scale wear, damp and contact shade come from the shading pass, so no tile carries a rectangular patch.
  if (art && solGround(art, g, mat, tx, ty, x, y)) {
    if (mat === 'asphalt' && h(91) < .1) crack(g, x, y, h);
    else if (mat === 'yard') {
      if (h(6) < .22) { const gx = x + Math.floor(h(7) * 26), gy = y + Math.floor(h(8) * 26); rect(g, P.moss, gx, gy, 3, 2); dot(g, '#6b7258', gx + 1, gy - 1); dot(g, P.moss, gx + 4, gy + 1); }
      if (h(9) < .05) { rect(g, '#3f4546', x + 8, y + 12, 14, 5); rect(g, '#4a5354', x + 10, y + 12, 6, 1); }
    }
    return;
  }
  switch (mat) {
    case 'asphalt': {
      rect(g, P.asphalt, x, y, 32, 32);
      for (let i = 0; i < 8; i++) dot(g, i % 3 ? P.asphaltDark : P.asphaltLight, x + Math.floor(h(i) * 32), y + Math.floor(h(i + 40) * 32));
      if (h(91) < .1) crack(g, x, y, h);
      break;
    }
    case 'yard': {
      rect(g, P.yard, x, y, 32, 32);
      for (let i = 0; i < 10; i++) dot(g, i % 2 ? P.gravel : P.yardDark, x + Math.floor(h(10 + i) * 32), y + Math.floor(h(30 + i) * 32));
      if (h(6) < .22) { const gx = x + Math.floor(h(7) * 26), gy = y + Math.floor(h(8) * 26); rect(g, P.moss, gx, gy, 3, 2); dot(g, '#6b7258', gx + 1, gy - 1); dot(g, P.moss, gx + 4, gy + 1); }
      if (h(9) < .05) { rect(g, '#3f4546', x + 8, y + 12, 14, 5); rect(g, '#4a5354', x + 10, y + 12, 6, 1); }
      break;
    }
    case 'tile': {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const k = hash(tx * 2 + i, ty * 2 + j, 3);
        rect(g, (i + j) % 2 ? P.tileA : P.tileB, x + i * 16, y + j * 16, 16, 16);
        rect(g, '#857e6f', x + i * 16, y + j * 16, 15, 1);
        if (k < .08) { line(g, P.grout, x + i * 16 + 3, y + j * 16 + 2, x + i * 16 + 11, y + j * 16 + 12); }
        if (k > .93) rect(g, P.tileDirt, x + i * 16 + 4, y + j * 16 + 5, 7, 6);
      }
      rect(g, P.grout, x + 15, y, 1, 32); rect(g, P.grout, x + 31, y, 1, 32); rect(g, P.grout, x, y + 15, 32, 1); rect(g, P.grout, x, y + 31, 32, 1);
      break;
    }
    case 'concrete': {
      // Poured slab: 2x2-tile joints, grit, oil stains, hairline cracks and rubble chips.
      rect(g, '#6b665c', x, y, 32, 32);
      for (let i = 0; i < 16; i++) dot(g, i % 4 ? '#625d54' : '#77726a', x + Math.floor(h(i) * 32), y + Math.floor(h(i + 9) * 32));
      if (tx % 2 === 0) { rect(g, '#55514a', x, y, 1, 32); rect(g, '#77726a', x + 1, y, 1, 32); }
      if (ty % 2 === 0) { rect(g, '#55514a', x, y, 32, 1); rect(g, '#77726a', x, y + 1, 32, 1); }
      if (h(20) < .22) { const sx = x + 6 + Math.floor(h(21) * 12), sy = y + 6 + Math.floor(h(22) * 12); rect(g, '#5f5a51', sx + 1, sy, 10, 7); rect(g, '#5f5a51', sx, sy + 2, 12, 3); rect(g, '#5a554d', sx + 2, sy + 2, 8, 3); }
      if (h(23) < .25) { const sx = Math.floor(h(24) * 22) + 5; line(g, '#4f4b44', x + sx, y + 2, x + sx + 5, y + 12); line(g, '#4f4b44', x + sx + 5, y + 12, x + sx + 2, y + 22); }
      if (h(25) < .3) for (let i = 0; i < 3; i++) { const cx = x + 4 + Math.floor(h(26 + i) * 24), cy = y + 4 + Math.floor(h(30 + i) * 24); rect(g, '#8a8476', cx, cy, 2, 1); dot(g, '#4a463f', cx, cy + 1); }
      break;
    }
    case 'wood': {
      for (let r = 0; r < 4; r++) {
        const k = hash(tx, ty * 4 + r, 8);
        rect(g, k < .33 ? P.wood : k < .66 ? '#634e3b' : '#705944', x, y + r * 8, 32, 8);
        rect(g, P.woodSeam, x, y + r * 8 + 7, 32, 1);
        rect(g, '#7a614a', x, y + r * 8, 32, 1);
        const joint = Math.floor(hash(tx, ty * 4 + r, 9) * 30);
        rect(g, P.woodSeam, x + joint, y + r * 8, 1, 7); if (k > .8) dot(g, P.woodDark, x + (joint + 9) % 30, y + r * 8 + 3);
      }
      break;
    }
    case 'mud': rect(g, '#4e4638', x, y, 32, 32); rect(g, '#5b5241', x, y + 6, 32, 1); for (let i = 0; i < 4; i++) rect(g, '#454033', x + Math.floor(h(i) * 26), y + 12 + Math.floor(h(i + 7) * 16), 6, 1); break;
    case 'water': {
      rect(g, P.deepWater, x, y, 32, 32);
      for (let i = 0; i < 3; i++) { const wy = y + 6 + i * 10 + Math.floor(h(i) * 4), wx = x + Math.floor(h(i + 5) * 18); rect(g, P.waterLine, wx, wy, 8 + Math.floor(h(i + 9) * 6), 1); }
      break;
    }
    default: rect(g, P.void, x, y, 32, 32);
  }
}

/** Branching hairline crack across a street tile (two or three segments with a short spur). */
function crack(g: Ctx, x: number, y: number, h: (i: number) => number) {
  const sx = Math.floor(h(92) * 20) + 6, mx = sx + Math.floor(h(93) * 8) - 2, my = 10 + Math.floor(h(94) * 8);
  line(g, '#34322e', x + sx, y, x + mx, y + my); line(g, '#34322e', x + mx, y + my, x + sx + 2, y + 25);
  if (h(95) < .5) line(g, '#34322e', x + mx, y + my, x + mx + 6, y + my + 4);
  dot(g, '#56524b', x + mx + 1, y + my);
}

/** Outdoor puddles for one map: sparse on asphalt, likelier in the gutter next to a kerb; never against a wall. */
export function puddles(m: MapDef, M: GroundMaterial[][], geo: GroundGeometry): Puddle[] {
  if (m.key.mapId !== 'coast') return [];
  const out: Puddle[] = [];
  for (let ty = 1; ty < m.rows - 1; ty++) for (let tx = 1; tx < m.cols - 1; tx++) {
    if (M[ty][tx] !== 'asphalt' || !geo.outdoor[ty * geo.cols + tx]) continue;
    let near = false, gutter = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (isWall(geo, tx + dx, ty + dy) || m.cells[ty + dy][tx + dx] !== 'floor') near = true;
      if (M[ty + dy][tx + dx] === 'yard') gutter = true;
    }
    if (near || hash(tx, ty, 61) > (gutter ? .09 : .022)) continue;
    const h = (i: number) => hash(tx, ty, 62 + i), n = 2 + (h(0) < .5 ? 1 : 0), parts = [];
    for (let i = 0; i < n; i++) parts.push({ dx: Math.round((h(1 + i) - .5) * 12), dy: Math.round((h(4 + i) - .5) * 8), rx: 5 + Math.floor(h(7 + i) * 7), ry: 3 + Math.floor(h(10 + i) * 4) });
    out.push({ x: tx * 32 + 16, y: ty * 32 + 16, parts });
  }
  return out;
}
const inPuddle = (p: Puddle, x: number, y: number, grow = 0) => p.parts.some(q => ((x - p.x - q.dx) / (q.rx + grow)) ** 2 + ((y - p.y - q.dy) / (q.ry + grow)) ** 2 <= 1);

/**
 * Puddles are flat water, not stones or plates: the body is darker and cooler than the dry asphalt (wet), the edge is a
 * dithered damp halo rather than an outline, and the overcast sky shows as a few broken pale glints. No top-left
 * highlight, which would shade it like a rock. 2px clusters.
 */
function paintPuddles(g: Ctx, list: Puddle[], b: Rect) {
  for (const p of list) {
    if (p.x + 32 < b.x || p.x - 32 > b.x + b.w || p.y + 24 < b.y || p.y - 24 > b.y + b.h) continue;
    for (let y = p.y - 16; y < p.y + 16; y += 2) for (let x = p.x - 24; x < p.x + 24; x += 2) {
      const cx = x + 1, cy = y + 1;
      if (!inPuddle(p, cx, cy, 2.5)) continue;
      const X = x - b.x, Y = y - b.y, bayer = BAYER4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)];
      if (!inPuddle(p, cx, cy)) { if (bayer < 8) { g.fillStyle = 'rgba(14,16,18,.22)'; g.fillRect(X, Y, 2, 2); } continue; }
      g.fillStyle = 'rgba(22,30,36,.42)'; g.fillRect(X, Y, 2, 2);
      // Sky glints: short broken streaks on alternate rows, away from the edges.
      if (((cy - p.y + 16) >> 1) % 3 === 0 && inPuddle(p, cx - 3, cy) && inPuddle(p, cx + 3, cy) && hash(x >> 2, y >> 1, 66) < .38) {
        g.fillStyle = 'rgba(150,164,170,.5)'; g.fillRect(X, Y, 2, 1);
      }
    }
  }
}

export interface GroundBake { geo: GroundGeometry; puddles: Puddle[] }

export function paintGround(m: MapDef, b: Rect, M: GroundMaterial[][], art: SolArt | null, bake: GroundBake): HTMLCanvasElement {
  const { c, g } = canvas(b.w, b.h), geo = bake.geo, coast = m.key.mapId === 'coast';
  rect(g, P.void, 0, 0, b.w, b.h);
  // One tile of margin so curbs and baked shadows that cross a chunk edge are drawn on both sides.
  const x0 = Math.floor(b.x / 32) - 1, y0 = Math.floor(b.y / 32) - 1, x1 = Math.ceil((b.x + b.w) / 32) + 1, y1 = Math.ceil((b.y + b.h) / 32) + 1;
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    if (ty < 0 || tx < 0 || ty >= m.rows || tx >= m.cols) continue;
    tile(g, M, tx, ty, tx * 32 - b.x, ty * 32 - b.y, art);
  }
  const mat = (x: number, y: number) => M[y]?.[x];
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    if (mat(tx, ty) !== 'asphalt') continue;
    const X = tx * 32 - b.x, Y = ty * 32 - b.y;
    const curb = (nx: number, ny: number) => mat(nx, ny) === 'yard';
    // Kerb stones: a lit top edge and a dark drop, with the odd chipped stone.
    const chip = (i: number) => hash(tx, ty, 70 + i) < .18 ? 6 + Math.floor(hash(tx, ty, 74 + i) * 18) : -99;
    if (curb(tx, ty - 1)) { rect(g, '#8a8478', X, Y - 3, 32, 2); rect(g, '#2f2d29', X, Y - 1, 32, 1); for (let i = 0; i < 32; i += 8) dot(g, '#6f6a5f', X + i, Y - 3); const k = chip(0); if (k > 0) rect(g, '#5e594f', X + k, Y - 3, 4, 2); }
    if (curb(tx, ty + 1)) { rect(g, '#8a8478', X, Y + 32, 32, 2); rect(g, '#605a50', X, Y + 34, 32, 1); for (let i = 0; i < 32; i += 8) dot(g, '#6f6a5f', X + i, Y + 32); const k = chip(1); if (k > 0) rect(g, '#5e594f', X + k, Y + 32, 4, 2); }
    if (curb(tx - 1, ty)) { rect(g, '#8a8478', X - 3, Y, 2, 32); rect(g, '#2f2d29', X - 1, Y, 1, 32); for (let i = 0; i < 32; i += 8) dot(g, '#6f6a5f', X - 3, Y + i); }
    if (curb(tx + 1, ty)) { rect(g, '#8a8478', X + 32, Y, 2, 32); rect(g, '#605a50', X + 34, Y, 1, 32); for (let i = 0; i < 32; i += 8) dot(g, '#6f6a5f', X + 32, Y + i); }
  }
  if (coast) {
    // Lane dashes (worn: some segments missing or half-faded), manholes and drains of the village street.
    const dash = (x: number, y: number, horizontal: boolean, tx: number, ty: number) => {
      for (let i = 0; i < 32; i += 16) {
        const wear = hash(tx * 2 + (i >> 4), ty, 81);
        if (wear < .12) continue;
        const color = wear < .3 ? '#5f5b52' : '#7d776a';
        if (horizontal) { rect(g, color, x + i + 2, y, 9, 1); if (wear > .7) dot(g, '#4b4842', x + i + 4 + Math.floor(wear * 4), y); }
        else { rect(g, color, x, y + i + 2, 1, 9); if (wear > .7) dot(g, '#4b4842', x, y + i + 4 + Math.floor(wear * 4)); }
      }
    };
    for (let tx = x0; tx < x1; tx++) {
      if (mat(tx, 13) === 'asphalt' && mat(tx, 14) === 'asphalt' && mat(tx, 12) !== 'asphalt' && mat(tx, 15) !== 'asphalt') dash(tx * 32 - b.x, 14 * 32 - b.y, true, tx, 14);
      if (mat(tx, 3) === 'asphalt' && mat(tx, 5) === 'asphalt' && mat(tx, 6) !== 'asphalt' && mat(tx, 2) !== 'asphalt') dash(tx * 32 - b.x, Math.round(4.5 * 32) - b.y, true, tx, 4);
    }
    for (let ty = y0; ty < y1; ty++) if (mat(19, ty) === 'asphalt' && mat(20, ty) === 'asphalt' && mat(18, ty) !== 'asphalt' && mat(21, ty) !== 'asphalt') dash(20 * 32 - b.x, ty * 32 - b.y, false, 20, ty);
    const manhole = (tx: number, ty: number) => {
      const X = tx * 32 - b.x + 8, Y = ty * 32 - b.y + 8;
      rect(g, '#2b2a26', X - 1, Y - 1, 18, 18); rect(g, '#33312d', X, Y, 16, 16); rect(g, '#55524b', X + 1, Y + 1, 14, 14);
      for (let i = 2; i < 14; i += 3) rect(g, '#46433d', X + 1, Y + i, 14, 1);
      rect(g, '#68645b', X + 1, Y + 1, 14, 1); rect(g, P.rust, X + 11, Y + 12, 3, 2);
    };
    manhole(20, 9); manhole(26, 14); manhole(8, 4);
    const grate = (tx: number, ty: number) => {
      const X = tx * 32 - b.x + 4, Y = ty * 32 - b.y + 26;
      g.fillStyle = 'rgba(16,15,13,.35)'; g.fillRect(X - 2, Y - 2, 28, 10);
      rect(g, '#2a2926', X, Y, 24, 6); for (let i = 1; i < 24; i += 3) rect(g, '#55524b', X + i, Y + 1, 1, 4);
      rect(g, '#4a463f', X, Y, 24, 1);
    };
    grate(15, 14); grate(31, 13); grate(19, 22);
    paintPuddles(g, bake.puddles, b);
  }
  // Litter: small clusters that gather along wall feet and kerbs (paper, plastic, dead leaves, glass), not spread evenly.
  for (let ty = Math.max(0, y0); ty < Math.min(m.rows, y1); ty++) for (let tx = Math.max(0, x0); tx < Math.min(m.cols, x1); tx++) {
    const here = mat(tx, ty);
    if (isWall(geo, tx, ty) || !here || here === 'void' || here === 'water') continue;
    const edge = isWall(geo, tx, ty - 1) || isWall(geo, tx - 1, ty) || isWall(geo, tx + 1, ty) || (here === 'asphalt' && (mat(tx, ty - 1) === 'yard' || mat(tx, ty + 1) === 'yard'));
    const h = (i: number) => hash(tx, ty, 100 + i);
    if (h(0) > (edge ? .55 : .12)) continue;
    const n = 1 + Math.floor(h(1) * 3);
    for (let i = 0; i < n; i++) {
      const up = isWall(geo, tx, ty - 1), px = tx * 32 - b.x + 3 + Math.floor(h(2 + i) * 26), py = ty * 32 - b.y + (up ? 1 + Math.floor(h(5 + i) * 6) : 3 + Math.floor(h(5 + i) * 26));
      const k = h(8 + i);
      if (k < .35) { rect(g, '#b3ab98', px, py, 3, 2); dot(g, '#8d8670', px + 2, py + 1); }
      else if (k < .6) { rect(g, '#6b5a44', px, py, 2, 2); dot(g, '#8a7354', px + 2, py); dot(g, '#594a38', px - 1, py + 1); }
      else if (k < .78) { rect(g, '#5c6b6b', px, py, 3, 1); dot(g, '#7d8f8c', px, py); }
      else if (k < .9) { rect(g, '#4f5a45', px, py, 2, 1); dot(g, '#7e8b6a', px + 1, py); }
      else { dot(g, P.rust, px, py); dot(g, P.rustLight, px + 1, py); }
    }
  }
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    if (!isWall(geo, tx, ty) || isWall(geo, tx, ty + 1)) continue;
    const X = tx * 32 - b.x, Y = (ty + 1) * 32 - b.y;
    if (M[ty + 1]?.[tx] === 'yard' || M[ty + 1]?.[tx] === 'asphalt') for (let i = 0; i < 4; i++) { dot(g, hash(tx, i, 31) < .5 ? P.moss : P.dry, X + Math.floor(hash(tx, ty + i, 32) * 30), Y + (i % 2)); }
  }
  // Cast shadows toward the lower right (light from the upper left), rasterised into one mask so neighbouring wall cells
  // never darken twice: a solid core and a dithered two-pixel penumbra, applied once as a multiply.
  const rects: [number, number, number, number][] = [], sx = 16, sy = 10;
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    if (!isWall(geo, tx, ty)) continue;
    const door = m.doors.find(d => d.x === tx && d.y === ty);
    if (door && door.wall === 'ns') continue;
    const X = tx * 32 - b.x, Y = ty * 32 - b.y;
    const right = !isWall(geo, tx + 1, ty), below = !isWall(geo, tx, ty + 1);
    if (right) rects.push([X + 32, Y + sy, sx, 32]);
    if (below) rects.push([X + sx, Y + 32, 32, sy]);
    if (right && below && !isWall(geo, tx + 1, ty + 1)) rects.push([X + 32, Y + 32, sx, sy]);
  }
  // One read and one write of the chunk: wear, damp, contact shade, salt and the cast shadows in a single pass.
  const img = g.getImageData(0, 0, b.w, b.h);
  shadeGround(img.data, geo, b.x, b.y, b.w, b.h, shadowMask(rects, b.w, b.h));
  g.putImageData(img, 0, 0);
  return c;
}

/** Shadow mask levels: 3 core, 2 first penumbra ring, 1 second ring; the strongest level wins where rects overlap. */
function shadowMask(rects: [number, number, number, number][], w: number, h: number): Uint8Array | null {
  if (!rects.length) return null;
  const mask = new Uint8Array(w * h);
  const mark = (x: number, y: number, level: number) => { if (x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] < level) mask[y * w + x] = level; };
  for (const [x, y, rw, rh] of rects) {
    for (let j = -2; j < rh + 2; j++) for (let i = -2; i < rw + 2; i++) {
      const d = Math.max(i < 0 ? -i : i >= rw ? i - rw + 1 : 0, j < 0 ? -j : j >= rh ? j - rh + 1 : 0);
      mark(x + i, y + j, 3 - d);
    }
  }
  return mask;
}
