import { P, canvas, dot, hash, line, rect, disc, type Ctx } from './paint';

export const WALL_H = 48;
export const STOREY_H = 30;
export const ROOF_MARGIN = 26;
export const LOW_H = 16;

export interface WallSpec {
  n: boolean; e: boolean; s: boolean; w: boolean;
  face: 'ext' | 'int';
  kind: 'wall' | 'window-ew' | 'window-ns' | 'door-ew' | 'door-ns' | 'gap';
  open?: boolean;
  x: number; y: number;
  ruined?: boolean;
}

export function wallKey(s: WallSpec): string {
  const v = Math.floor(hash(s.x, s.y, 11) * 4);
  return `wall:${+s.n}${+s.e}${+s.s}${+s.w}:${s.face}:${s.kind}:${s.open ? 1 : 0}:${s.ruined ? 1 : 0}:${v}`;
}

function cap(g: Ctx, s: WallSpec, v: number) {
  rect(g, s.ruined ? '#4d4943' : '#46433d', 0, 0, 32, 32);
  for (let i = 0; i < 12; i++) { const hx = Math.floor(hash(s.x * 7 + i, s.y, 3) * 30), hy = Math.floor(hash(s.x, s.y * 7 + i, 4) * 30); dot(g, i % 2 ? '#524e47' : '#3c3934', hx + 1, hy + 1); }
  if (v === 1) rect(g, '#3c3934', 6, 12, 10, 1);
  if (!s.n) { rect(g, '#a49b88', 0, 0, 32, 2); rect(g, '#7d776b', 0, 2, 32, 1); }
  if (!s.w) rect(g, '#958d7b', 0, 0, 2, 32);
  if (!s.e) { rect(g, '#6f695e', 30, 0, 1, 32); rect(g, '#3d3a35', 31, 0, 1, 32); }
  if (!s.s) { rect(g, '#9a927f', 0, 30, 32, 2); }
  if (s.ruined) {
    for (let i = 0; i < 3; i++) { const k = hash(s.x, s.y, 40 + i); if (k < .5) rect(g, '#3a3732', 2 + Math.floor(k * 50) % 26, !s.n ? 0 : 29, 3, 3); }
    if (v === 0 && hash(s.x, s.y, 13) < .4) { for (let x = 4; x < 26; x += 3) rect(g, x % 6 ? P.rust : P.rustLight, x, 9, 2, 7); rect(g, P.char, 4, 16, 22, 1); }
  }
}

function facade(g: Ctx, s: WallSpec, v: number, oy: number) {
  const H = WALL_H;
  if (s.face === 'ext') {
    rect(g, P.concrete, 0, oy, 32, H);
    for (let r = 0; r < H; r += 12) {
      rect(g, '#6c675d', 0, oy + r, 32, 1);
      const off = (r / 12) % 2 ? 16 : 0;
      for (let x = off; x < 32; x += 32) rect(g, '#6c675d', x, oy + r, 1, 12);
    }
    rect(g, '#8a8476', 0, oy, 32, 2);
    rect(g, P.concreteDark, 0, oy + H - 9, 32, 9);
    rect(g, '#665f52', 0, oy + H - 10, 32, 1);
    for (let i = 0; i < 7; i++) dot(g, P.dry, Math.floor(hash(s.x, i, 21) * 32), oy + H - 3 - Math.floor(hash(i, s.y, 22) * 6));
    if (v === 2) { rect(g, P.rust, 22, oy + 2, 1, 14); rect(g, '#6e4a3c', 23, oy + 4, 1, 9); }
    if (v === 3) { line(g, P.concreteDeep, 6, oy + 6, 10, oy + 18); line(g, P.concreteDeep, 10, oy + 18, 8, oy + 26); }
    if (!s.w) rect(g, '#8a8476', 0, oy, 1, H);
    if (!s.e) rect(g, P.concreteDeep, 31, oy, 1, H);
  } else {
    rect(g, P.plaster, 0, oy, 32, H);
    rect(g, P.plasterLight, 0, oy, 32, 2);
    rect(g, '#5b6461', 0, oy + H - 18, 32, 18);
    rect(g, '#6f7a76', 0, oy + H - 18, 32, 1);
    rect(g, '#4b5351', 0, oy + H - 3, 32, 3);
    if (v === 1) { rect(g, P.plasterDark, 9, oy + 9, 6, 8); rect(g, '#7c7566', 10, oy + 10, 4, 6); }
    if (v === 3) for (let i = 0; i < 5; i++) dot(g, P.plasterDark, 4 + i * 5, oy + 20 + (i % 2));
    if (!s.w) rect(g, P.plasterLight, 0, oy, 1, H);
    if (!s.e) rect(g, P.plasterDark, 31, oy, 1, H);
  }
}

export function paintWall(s: WallSpec): HTMLCanvasElement {
  const H = WALL_H, { c, g } = canvas(32, 32 + H), v = Math.floor(hash(s.x, s.y, 11) * 4);
  const oy = 32;
  if (s.kind === 'door-ns') {
    if (!s.open) {
      rect(g, P.woodDark, 12, 4, 8, 28); rect(g, P.woodLight, 12, 4, 8, 2); rect(g, P.wood, 13, 6, 6, 26);
      rect(g, P.woodDark, 12, oy, 8, H - 4); rect(g, P.wood, 13, oy, 6, H - 4); rect(g, '#c3a26a', 17, oy + 22, 1, 2);
      rect(g, P.woodSeam, 12, oy + H - 4, 8, 4);
    } else {
      rect(g, P.woodDark, 2, 2, 4, 30); rect(g, P.wood, 3, 2, 2, 30); rect(g, P.woodDark, 2, oy - 2, 4, 10);
      rect(g, '#6c675d', 0, oy + H - 3, 32, 2);
    }
    return c;
  }
  if (s.kind === 'gap') return c;
  cap(g, s, v);
  if (s.kind === 'window-ns') {
    rect(g, P.dry, 8, 0, 16, 32); rect(g, P.char, 9, 1, 14, 30); rect(g, P.glass, 10, 2, 12, 28); rect(g, P.glassLight, 11, 3, 4, 12); rect(g, P.glassShine, 11, 3, 2, 5); rect(g, '#25302f', 17, 18, 5, 12);
    for (let y = 6; y < 30; y += 5) rect(g, P.rust, 9, y, 14, 1); rect(g, P.rustLight, 9, 1, 14, 1);
  }
  facade(g, s, v, oy);
  if (s.kind === 'window-ew') {
    rect(g, P.char, 4, oy + 8, 24, 24); rect(g, P.glass, 5, oy + 9, 22, 21);
    rect(g, P.glassLight, 6, oy + 10, 9, 4); rect(g, P.glassShine, 6, oy + 10, 4, 1); rect(g, '#25302f', 5, oy + 24, 22, 6);
    rect(g, P.char, 15, oy + 9, 2, 21);
    for (let x = 7; x < 27; x += 4) rect(g, P.rust, x, oy + 7, 1, 25);
    rect(g, P.rustLight, 4, oy + 7, 24, 1); rect(g, P.rust, 4, oy + 31, 24, 1);
    rect(g, P.dry, 3, oy + 32, 26, 2);
  }
  if (s.kind === 'door-ew') {
    const top = oy + H - 44;
    if (!s.open) {
      rect(g, P.char, 4, top - 2, 24, 46); rect(g, P.woodDark, 5, top, 22, 44); rect(g, P.wood, 6, top + 1, 20, 42);
      rect(g, P.woodLight, 6, top + 1, 20, 1); rect(g, P.woodDark, 8, top + 5, 7, 14); rect(g, P.woodDark, 17, top + 5, 7, 14);
      rect(g, P.woodDark, 8, top + 23, 7, 16); rect(g, P.woodDark, 17, top + 23, 7, 16); rect(g, P.lamp, 23, top + 22, 2, 2);
      rect(g, '#3d3127', 5, top + 41, 22, 3);
    } else {
      g.clearRect(5, top, 22, 44);
      rect(g, P.char, 4, top - 2, 24, 2); rect(g, P.char, 4, top, 1, 44); rect(g, P.char, 27, top, 1, 44);
      rect(g, P.woodDark, 5, top, 4, 40); rect(g, P.wood, 6, top + 1, 2, 38); rect(g, '#6c675d', 5, oy + H - 2, 22, 2);
    }
  }
  return c;
}

export function paintLintel(width: number): HTMLCanvasElement {
  const { c, g } = canvas(width, 32 + WALL_H);
  rect(g, '#46433d', 0, 0, width, 32); rect(g, '#9a927f', 0, 30, width, 2); rect(g, '#a49b88', 0, 0, width, 2);
  for (let i = 0; i < width; i += 7) dot(g, '#4d4a43', i + 2, 10 + (i % 3) * 5);
  rect(g, P.concrete, 0, 32, width, 5); rect(g, P.concreteDark, 0, 36, width, 1);
  return c;
}

export function paintLow(variant: 'stove' | 'table' | 'bed' | 'cabinet', x: number, y: number): HTMLCanvasElement {
  const { c, g } = canvas(32, 32 + LOW_H), top = 0, front = 32;
  const v = hash(x, y, 5);
  if (variant === 'stove') {
    rect(g, '#6d6a62', 1, top + 3, 30, 29); rect(g, '#86837a', 1, top + 3, 30, 2);
    disc(g, P.char, 10, 15, 5); disc(g, '#2b2a27', 10, 15, 3); disc(g, P.char, 22, 15, 5); disc(g, '#2b2a27', 22, 15, 3);
    rect(g, P.rust, 4, 24, 6, 4); rect(g, '#5f4c3a', 18, 23, 10, 6); rect(g, '#7c6a52', 19, 23, 8, 1);
    rect(g, '#58554e', 1, front, 30, LOW_H); rect(g, '#4b4842', 1, front + LOW_H - 3, 30, 3);
    rect(g, '#6e6b63', 3, front + 2, 12, 9); rect(g, '#6e6b63', 17, front + 2, 12, 9); dot(g, P.dry, 13, front + 6); dot(g, P.dry, 19, front + 6);
  } else if (variant === 'table') {
    rect(g, P.woodDark, 2, top + 6, 28, 24); rect(g, P.wood, 3, top + 7, 26, 21); rect(g, P.woodLight, 3, top + 7, 26, 1);
    rect(g, P.label, 7, 11, 8, 6); rect(g, '#a8a08d', 8, 12, 6, 1); rect(g, P.deepWater, 19, 13, 5, 5); rect(g, P.waterLine, 20, 13, 3, 1);
    if (v > .5) rect(g, P.rustLight, 10, 21, 10, 3);
    rect(g, P.woodDark, 3, front - 2, 3, LOW_H + 2); rect(g, P.woodDark, 26, front - 2, 3, LOW_H + 2); rect(g, P.woodSeam, 2, front - 2, 28, 3);
  } else if (variant === 'bed') {
    rect(g, P.woodDark, 1, 2, 30, 29); rect(g, '#7b7a6f', 3, 4, 26, 25); rect(g, '#8e8c80', 3, 4, 26, 7);
    rect(g, '#5d6b67', 3, 13, 26, 16); rect(g, '#6b7a75', 3, 13, 26, 2);
    rect(g, P.woodDark, 1, front - 1, 30, LOW_H - 4); rect(g, P.wood, 2, front, 28, 2);
  } else {
    rect(g, '#5b5a52', 1, top + 4, 30, 27); rect(g, '#6f6d64', 1, top + 4, 30, 2);
    rect(g, '#4f4d46', 1, front - 1, 30, LOW_H + 1); rect(g, '#64625a', 3, front + 2, 12, LOW_H - 5); rect(g, '#64625a', 17, front + 2, 12, LOW_H - 5);
  }
  return c;
}

export function paintRoof(w: number, h: number, storeys: number, seed: number): HTMLCanvasElement {
  const band = (storeys - 1) * STOREY_H, M = ROOF_MARGIN;
  const { c, g } = canvas(w, M + h + band);
  rect(g, P.concreteTop, 0, M, w, h); rect(g, '#b3ab96', 0, M, w, 2); rect(g, '#aaa28e', 0, M, 2, h); rect(g, P.concreteDark, w - 2, M, 2, h);
  rect(g, P.tar, 6, M + 6, w - 12, h - 12);
  for (let y = M + 6; y < M + h - 6; y += 2) for (let x = 6; x < w - 6; x += 2) {
    const n = hash(x, y, seed);
    if (n < .05) dot(g, '#45433d', x, y); else if (n > .97) dot(g, '#33312d', x, y);
  }
  rect(g, '#2f2d29', 6, M + 6, w - 12, 2);
  rect(g, '#4a4741', 30, M + 40, 46, 22); rect(g, '#54514a', 30, M + 40, 46, 1);
  rect(g, '#36383a', w - 90, M + h - 50, 40, 14); rect(g, '#46504f', w - 86, M + h - 48, 18, 1);
  const tx = w - 64, ty = M + 34;
  rect(g, '#2a2926', tx - 2, ty + 18, 40, 6);
  rect(g, '#8b8574', tx, ty - 18, 36, 34); rect(g, '#a39c88', tx, ty - 18, 36, 3); rect(g, '#6f6a5d', tx + 30, ty - 15, 6, 31);
  for (let y = ty - 12; y < ty + 14; y += 6) rect(g, '#77715f', tx, y, 36, 1);
  rect(g, P.rust, tx + 4, ty + 10, 1, 6); disc(g, '#9a937f', tx + 18, ty - 18, 16, 4); disc(g, '#b2aa95', tx + 18, ty - 19, 13, 3); disc(g, '#6f6a5d', tx + 18, ty - 18, 3, 1);
  const sx = 22, sy = M + h - 70;
  rect(g, '#2a2926', sx + 4, sy + 46, 54, 6);
  rect(g, P.concreteTop, sx, sy - 10, 52, 30); rect(g, '#b3ab96', sx, sy - 10, 52, 2); rect(g, P.concrete, sx, sy + 20, 52, 26);
  rect(g, '#6c675d', sx, sy + 20, 52, 1); rect(g, P.char, sx + 20, sy + 24, 14, 22); rect(g, P.woodDark, sx + 21, sy + 25, 12, 21); rect(g, P.lamp, sx + 30, sy + 34, 1, 2);
  line(g, P.char, w - 120, M + 26, w - 120, M - 18); line(g, P.char, w - 128, M - 12, w - 112, M - 12); line(g, P.char, w - 126, M - 4, w - 114, M - 4);
  line(g, '#57534c', 90, M + 30, 160, M + 30);
  rect(g, '#8f6f5a', 104, M + 31, 6, 9); rect(g, '#6d7a7a', 122, M + 31, 8, 7); rect(g, '#a49b88', 140, M + 31, 5, 10);
  rect(g, P.char, 8, M + h - 10, 4, 3); for (let i = 0; i < 10; i++) dot(g, P.dry, 8 + Math.floor(hash(i, 3, seed) * (w - 16)), M + h - 8 - Math.floor(hash(i, 4, seed) * 3));
  if (band > 0) {
    const by = M + h;
    rect(g, P.concrete, 0, by, w, band); rect(g, '#8a8476', 0, by, w, 2); rect(g, '#6c675d', 0, by + band - 1, w, 1);
    for (let y = by + 12; y < by + band; y += 12) rect(g, '#6c675d', 0, y, w, 1);
    rect(g, '#8a8476', 0, by, 1, band); rect(g, P.concreteDeep, w - 1, by, 1, band);
    for (let x = 24; x + 34 < w; x += 72) {
      const wx = x, wy = by + 8;
      rect(g, P.char, wx, wy, 34, 24); rect(g, P.glass, wx + 1, wy + 1, 32, 22); rect(g, P.glassLight, wx + 3, wy + 3, 10, 4);
      rect(g, P.char, wx + 16, wy + 1, 2, 22);
      for (let k = wx + 3; k < wx + 34; k += 4) rect(g, P.rust, k, wy - 2, 1, 27);
      rect(g, P.rustLight, wx - 1, wy - 2, 36, 1); rect(g, P.dry, wx - 1, wy + 25, 36, 2);
      rect(g, '#6e4a3c', wx + 6, wy + 27, 1, band - 36 > 0 ? band - 36 : 3);
      if ((x / 72) % 2 === 0) {
        const ax = wx + 40, ay = wy + 4;
        rect(g, P.char, ax - 1, ay - 1, 22, 16); rect(g, '#a49e8c', ax, ay, 20, 14); rect(g, '#b8b19e', ax, ay, 20, 2);
        disc(g, '#6e695c', ax + 7, ay + 7, 5); disc(g, '#57534a', ax + 7, ay + 7, 2); for (let k = 0; k < 4; k++) rect(g, '#7f796a', ax + 14, ay + 3 + k * 3, 5, 1);
        rect(g, P.rust, ax + 2, ay + 15, 16, 1); dot(g, P.waterLine, ax + 15, ay + 17);
      }
    }
  }
  return c;
}

export function paintCanopy(w: number): HTMLCanvasElement {
  const { c, g } = canvas(w, 40);
  for (let y = 2; y < 32; y++) {
    const band = (y - 2) % 4, t = y / 32;
    const color = band === 0 ? (t < .5 ? '#958a77' : '#7f7564') : band === 1 ? (t < .5 ? '#7c7262' : '#685f52') : band === 2 ? (t < .5 ? '#655d50' : '#554e44') : '#4d473e';
    rect(g, color, 0, y, w, 1);
  }
  for (let x = 0; x < w; x += 2) if (hash(x >> 2, 3, 9) < .22) { const y = 4 + Math.floor(hash(x, 2, 9) * 20); rect(g, P.rust, x, y, 3, 3 + Math.floor(hash(x, 5, 9) * 6)); }
  rect(g, '#a89c86', 0, 2, w, 1); rect(g, '#2c2925', 0, 1, w, 1); rect(g, '#2c2925', 0, 2, 1, 30); rect(g, '#2c2925', w - 1, 2, 1, 30);
  if (w > 64) { rect(g, '#2c2925', w - 30, 2, 12, 5); rect(g, '#3e3933', w - 29, 4, 10, 2); }
  rect(g, '#3a352f', 0, 32, w, 2); rect(g, '#2c2925', 0, 34, w, 1);
  return c;
}

export function paintStairs(kind: 'up' | 'down'): HTMLCanvasElement {
  const { c, g } = canvas(32, 40);
  if (kind === 'up') {
    for (let i = 0; i < 5; i++) {
      const y = 32 - i * 7;
      rect(g, '#5b574f', 3, y, 26, 7); rect(g, '#8a8478', 3, y, 26, 2); rect(g, '#4b4842', 3, y + 6, 26, 1);
    }
    rect(g, P.char, 2, 4, 1, 35); rect(g, P.rust, 29, 4, 1, 35); rect(g, P.rustLight, 29, 4, 1, 1);
  } else {
    rect(g, '#1a1917', 3, 10, 26, 28); for (let i = 0; i < 4; i++) { rect(g, '#46433d', 3, 12 + i * 7, 26 - i * 3, 2); }
    rect(g, P.concreteTop, 2, 8, 28, 3); rect(g, P.rust, 2, 8, 28, 1); rect(g, P.char, 2, 11, 1, 27); rect(g, P.char, 29, 11, 1, 27);
  }
  return c;
}

export function paintWallAC(): HTMLCanvasElement {
  const { c, g } = canvas(22, 18);
  rect(g, P.char, 0, 0, 22, 16); rect(g, '#a49e8c', 1, 1, 20, 14); rect(g, '#b8b19e', 1, 1, 20, 2);
  disc(g, '#6e695c', 8, 8, 5); disc(g, '#57534a', 8, 8, 2); for (let k = 0; k < 4; k++) rect(g, '#7f796a', 15, 4 + k * 3, 5, 1);
  rect(g, P.rust, 2, 15, 18, 1); rect(g, P.char, 3, 16, 2, 2); rect(g, P.char, 17, 16, 2, 2);
  return c;
}

export function paintDownpipe(): HTMLCanvasElement {
  const { c, g } = canvas(6, WALL_H + 4);
  rect(g, P.char, 1, 0, 4, WALL_H + 2); rect(g, '#6b675d', 2, 0, 2, WALL_H + 2); rect(g, '#837d70', 2, 0, 1, WALL_H);
  for (let y = 6; y < WALL_H; y += 14) rect(g, P.rust, 0, y, 6, 2);
  rect(g, P.char, 0, WALL_H + 1, 6, 3);
  return c;
}

export function paintCeiling(w: number, h: number): HTMLCanvasElement {
  const { c, g } = canvas(w, h);
  rect(g, '#2c2a26', 0, 0, w, h);
  for (let y = 0; y < h; y += 32) rect(g, '#25231f', 0, y, w, 1);
  for (let i = 0; i < w * h / 90; i++) dot(g, hash(i, 1, 61) < .5 ? '#34312c' : '#24221e', Math.floor(hash(i, 2, 61) * w), Math.floor(hash(i, 3, 61) * h));
  rect(g, '#4b4842', 0, 0, w, 1); rect(g, '#4b4842', 0, 0, 1, h); rect(g, '#1d1b18', w - 1, 0, 1, h); rect(g, '#1d1b18', 0, h - 1, w, 1);
  return c;
}
