import { H, POOLS, ROOMS, T, TRAINING_ZONE, W, floors, wallAt, type Floor } from '../layout';
import { canvas, ditherRect, dot, hash, line, mix, rect, shade, speckle, type Ctx } from '../paint';

/** Albedo of each floor. Values are "daylight" colours: the night lightmap multiplies them. */
const BASE: Record<Floor, string> = {
  void: '#2a2c25', road: '#55534d', yard: '#7a766b', sea: '#24393d', dock: '#7a5f45', cold: '#8e9599', canteen: '#958a76',
  dorm: '#80654a', gen: '#6a665d', radio: '#7f6a52', work: '#a3aba6', clinic: '#a9bab0', shed: '#76705f',
};

export interface Puddle { x: number; y: number; w: number; h: number }
export const PUDDLES: Puddle[] = [
  { x: 10.2, y: 16.5, w: 2.4, h: .8 }, { x: 14.6, y: 17.6, w: 3.2, h: 1 }, { x: 21.6, y: 11.2, w: 1.8, h: .7 },
  { x: 24.3, y: 9.4, w: 1.6, h: .6 }, { x: 27.2, y: 18.6, w: 2.6, h: .9 }, { x: 18.8, y: 19.2, w: 1.6, h: .6 },
  { x: 6.4, y: 9.2, w: 2, h: .7 }, { x: 12.6, y: 22.5, w: 3, h: .7 }, { x: 24.5, y: 22.4, w: 2.4, h: .6 },
].map(p => ({ x: p.x * T, y: p.y * T, w: p.w * T, h: p.h * T }));

export function bakeGround(): HTMLCanvasElement {
  const { c, g } = canvas(W * T, H * T);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(g, x, y, floors[y][x]);
  paintYardDetails(g);
  for (const p of PUDDLES) puddle(g, p);
  paintContactShadows(g);
  return c;
}

function paintTile(g: Ctx, x: number, y: number, f: Floor) {
  const px = x * T, py = y * T, base = BASE[f], v = hash(x, y, 3);
  rect(g, base, px, py, T, T);
  switch (f) {
    case 'void': {
      speckle(g, ['#33362d', '#22241e', '#3b3f31'], px, py, T, T, 40, x * 97 + y);
      if (v < .4) for (let i = 0; i < 4; i++) { const wx = px + Math.floor(hash(x, i, y) * 28), wy = py + 6 + Math.floor(hash(i, x, y) * 22); line(g, '#46503a', wx, wy, wx + 1, wy - 4); line(g, '#3c4632', wx + 2, wy, wx + 3, wy - 3); }
      break;
    }
    case 'road': {
      speckle(g, ['#5d5b54', '#4c4a45', '#615e57', '#47453f'], px, py, T, T, 90, x * 31 + y * 7);
      if (y === 22) { rect(g, '#6d6a62', px, py, T, 3); rect(g, '#46443f', px, py + 3, T, 1); }
      if (y === 23) {
        rect(g, '#86847b', px, py + 24, T, 8); rect(g, '#9b988e', px, py + 24, T, 2); rect(g, '#5e5c55', px, py + 31, T, 1);
        if (x % 2 === 0) rect(g, '#6c6a62', px + 31, py + 25, 1, 6);
        if (x % 3 === 0 && x > 4 && x < 31) { rect(g, '#c9b24a', px + 4, py + 15, 12, 2); }
      }
      break;
    }
    case 'yard': {
      // Poured slabs (2x2 tiles) with seams, wet stains and moss creeping out of the joints.
      speckle(g, ['#827e72', '#716d63', '#86827a', '#6a665c'], px, py, T, T, 70, x * 13 + y * 41);
      if (x % 2 === 0) { rect(g, '#5d5a51', px, py, 1, T); dot(g, '#56604a', px, py + Math.floor(v * 30)); }
      if (y % 2 === 0) { rect(g, '#5d5a51', px, py, T, 1); if (v > .6) rect(g, '#55604a', px + Math.floor(v * 20), py, 3, 1); }
      if (v < .18) { line(g, '#615e55', px + 4, py + 6, px + 14, py + 15); line(g, '#615e55', px + 14, py + 15, px + 12, py + 24); }
      if (v > .82) { ditherRect(g, '#68645a', px + 6, py + 8, 16, 12, .5); }
      break;
    }
    case 'sea': {
      speckle(g, ['#284145', '#1f3336', '#2c474a'], px, py, T, T, 30, x + y * 53);
      if (y === 24) { // rip-rap at the foot of the sea wall
        for (let i = 0; i < 6; i++) { const sx = px + Math.floor(hash(x, i, 8) * 28), sy = py + Math.floor(hash(i, x, 9) * 9); rect(g, '#4f5552', sx, sy, 5, 4); rect(g, '#646a65', sx, sy, 5, 1); rect(g, '#353b39', sx, sy + 3, 5, 1); }
      }
      break;
    }
    case 'dock': {
      for (let i = 0; i < 4; i++) {
        const ry = py + i * 8, c = hash(x, y * 4 + i, 5) < .5 ? '#7a5f45' : '#71563e';
        rect(g, c, px, ry, T, 7); rect(g, '#2a2620', px, ry + 7, T, 1); rect(g, '#8a6d50', px, ry, T, 1);
        if (hash(x, i, y) < .3) dot(g, '#3d3328', px + 6 + i * 5, ry + 3);
      }
      if (x === 5) rect(g, '#3a3027', px, py, 2, T); if (x === 7) rect(g, '#3a3027', px + 30, py, 2, T);
      break;
    }
    case 'cold': {
      speckle(g, ['#979ea2', '#868d91', '#a0a6a9'], px, py, T, T, 40, x * 5 + y);
      if ((x + y) % 2 === 0) rect(g, '#81888c', px, py, T, 1);
      if (x === 5 && y === 5) { for (let i = 0; i < 6; i++) rect(g, '#5f666a', px + 6 + i * 4, py + 10, 2, 12); }
      if (v > .7) ditherRect(g, '#c4d2d8', px + 4, py + 4, 20, 10, .25);
      break;
    }
    case 'canteen': {
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const c = (i + j + x + y) % 2 ? '#958a76' : '#8a7f6c';
        rect(g, c, px + i * 8, py + j * 8, 8, 8); rect(g, '#6f6656', px + i * 8, py + j * 8, 8, 1); rect(g, '#6f6656', px + i * 8, py + j * 8, 1, 8);
      }
      speckle(g, ['#a39882', '#7b7160'], px, py, T, T, 18, x * 7 + y * 3);
      break;
    }
    case 'dorm': case 'radio': {
      for (let i = 0; i < 4; i++) {
        const ry = py + i * 8, c = shade(base, hash(x, y * 4 + i, 6) * .12 - .06);
        rect(g, c, px, ry, T, 8); rect(g, shade(base, -.3), px, ry + 7, T, 1);
        const seam = Math.floor(hash(x, y + i, 7) * 28); rect(g, shade(base, -.3), px + seam, ry, 1, 7);
      }
      break;
    }
    case 'gen': {
      speckle(g, ['#5c5850', '#77736a', '#625e55'], px, py, T, T, 60, x * 3 + y * 11);
      if (v < .5) { ditherRect(g, '#3e3c37', px + 8, py + 10, 14, 10, .6); }
      break;
    }
    case 'work': case 'clinic': {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        rect(g, shade(base, hash(x * 2 + i, y * 2 + j, 4) * .08 - .04), px + i * 16, py + j * 16, 16, 16);
        rect(g, shade(base, -.22), px + i * 16, py + j * 16, 16, 1); rect(g, shade(base, -.22), px + i * 16, py + j * 16, 1, 16);
      }
      if (f === 'work' && x === 4 && y === 14) { disc(g, '#5c625f', px + 16, py + 16, 4); disc(g, '#3e4341', px + 16, py + 16, 2); }
      break;
    }
    case 'shed': {
      speckle(g, ['#827b69', '#6a6454', '#8a8372'], px, py, T, T, 60, x * 17 + y);
      if (v < .35) { ditherRect(g, '#4a463c', px + 6, py + 6, 18, 14, .55); rect(g, '#3c3a33', px + 12, py + 10, 6, 4); }
      if (v > .7) speckle(g, ['#a8956c', '#b8a47a'], px, py, T, T, 12, x + 99);
      break;
    }
  }
}

function disc(g: Ctx, color: string, cx: number, cy: number, r: number) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) g.fillRect(cx + x, cy + y, 1, 1);
}

function paintYardDetails(g: Ctx) {
  // Training lanes: worn yellow paint around the nursery pools.
  const z = TRAINING_ZONE, x0 = z.x * T + 6, y0 = z.y * T + 6, x1 = (z.x + z.w) * T - 6, y1 = (z.y + z.h) * T - 6;
  const paint = (x: number, y: number, w: number, h: number) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hash(x + i, y + j, 17) > .22) dot(g, (i + j) % 7 ? '#c2a64a' : '#a48c3e', x + i, y + j); };
  for (let x = x0; x < x1; x += 12) { paint(x, y0, 8, 2); paint(x, y1, 8, 2); }
  for (let y = y0; y < y1; y += 12) { paint(x0, y, 2, 8); paint(x1, y, 2, 8); }
  // Pool aprons: slightly darker wet concrete around each tank.
  for (const p of POOLS) ditherRect(g, '#5e5b52', p.x * T - 5, p.y * T - 4, p.w * T + 10, p.h * T + 10, .35);
  // Drain channel along the south wall, and hazard stripes at the main gate threshold.
  for (let x = 2; x < 33; x++) { rect(g, '#4b4a44', x * T, 20 * T + 26, T, 5); for (let i = 0; i < 8; i++) rect(g, '#2e2e2a', x * T + i * 4 + 1, 20 * T + 27, 2, 3); }
  for (let x = 26 * T; x < 29 * T; x += 8) { rect(g, '#b99a3a', x, 20 * T + 18, 4, 6); rect(g, '#2b2924', x + 4, 20 * T + 18, 4, 6); }
  // Footpath wear from the gate to the canteen and the cold store.
  for (let i = 0; i < 160; i++) {
    const t = i / 160, px = 27.5 * T + (13.5 * T - 27.5 * T) * t + (hash(i, 1, 9) - .5) * 26, py = 19.5 * T + (8.6 * T - 19.5 * T) * t + (hash(i, 2, 9) - .5) * 18;
    dot(g, '#8c887c', px, py);
  }
  // Oil drip trail by the generator door.
  ditherRect(g, '#3b3934', 25 * T + 4, 8 * T, 20, 26, .45);
}

function puddle(g: Ctx, p: Puddle) {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  for (let y = Math.floor(p.y); y < p.y + p.h; y++) for (let x = Math.floor(p.x); x < p.x + p.w; x++) {
    const dx = (x - cx) / (p.w / 2), dy = (y - cy) / (p.h / 2), d = dx * dx + dy * dy + (hash(x >> 2, y >> 2, 31) - .5) * .5;
    if (d < .55) dot(g, (x + y) % 5 ? '#5b625f' : '#666d69', x, y); else if (d < .8) dot(g, (x + y) % 2 ? '#62645d' : '#5d605b', x, y); else if (d < .95 && (x + y) % 2) dot(g, '#6a685f', x, y);
  }
}

/** Darken the ground at the foot of every wall face and along interior walls (ambient occlusion). */
function paintContactShadows(g: Ctx) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const w = wallAt(x, y);
    if (!w || w.door) continue;
    const below = y + 1 < H ? floors[y + 1][x] : 'void';
    if (!wallAt(x, y + 1) && below !== 'sea' && below !== 'void') { ditherRect(g, '#1c1b17', x * T, (y + 1) * T, T, 3, .55); ditherRect(g, '#1c1b17', x * T, (y + 1) * T + 3, T, 4, .25); }
    for (const [dx, sx] of [[-1, x * T - 4], [1, (x + 1) * T]] as const) {
      const nx = x + dx;
      if (nx < 0 || nx >= W || wallAt(nx, y)) continue;
      const f = floors[y][nx];
      if (f !== 'sea' && f !== 'void') ditherRect(g, '#1c1b17', sx, y * T, 4, T, .3);
    }
  }
  for (const r of ROOMS) ditherRect(g, '#1c1b17', (r.x + 1) * T, (r.y + 1) * T, (r.w - 2) * T, 5, .35);
}

/** Floor colour mix used by the minimap and debug views. */
export const floorTone = (f: Floor) => mix(BASE[f], '#000000', .2);
