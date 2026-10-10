import { T, wallAt, type RoomId, type WallStyle, type WallTile } from '../layout';
import { canvas, ditherRect, dot, hash, line, pixelText, rect, shade, speckle, type Ctx } from '../paint';

/** The five characters painted on the compound wall west of the main gate, one per tile. */
export const SLOGAN: Record<number, string> = { 21: '进', 22: '门', 23: '先', 24: '看', 25: '手' };

const EXT: Record<WallStyle, { base: string; dark: string; light: string }> = {
  yard: { base: '#a8a397', dark: '#7d796f', light: '#bdb8ab' },
  panel: { base: '#b9bfc0', dark: '#8f9698', light: '#d0d5d5' },
  tile: { base: '#c3c4bb', dark: '#9a9b92', light: '#d6d7ce' },
  brick: { base: '#8d5f4a', dark: '#6b4536', light: '#a5735a' },
  block: { base: '#8b877d', dark: '#69665e', light: '#a19c90' },
  clinic: { base: '#c6cdc4', dark: '#9aa39a', light: '#d9dfd6' },
};
const INT: Record<RoomId, { wall: string; dado: string; trim: string }> = {
  cold: { wall: '#c4cacb', dado: '#a3abae', trim: '#7e868a' },
  canteen: { wall: '#bcb6a4', dado: '#5f7a6a', trim: '#4a6052' },
  dorm: { wall: '#b4aa96', dado: '#7d6a55', trim: '#5c4d3d' },
  gen: { wall: '#8a867c', dado: '#6c685f', trim: '#4f4c45' },
  radio: { wall: '#a69e8c', dado: '#5f6f78', trim: '#4a5860' },
  work: { wall: '#c8ccc6', dado: '#9fb3b4', trim: '#7d9193' },
  clinic: { wall: '#ccd3cc', dado: '#8fb3a0', trim: '#6e9480' },
};

export interface WallArt { canvas: HTMLCanvasElement; glow: HTMLCanvasElement | null }

/** Composed wall cell: a 32 px cap above an optional face of the wall's height. */
export function paintWall(w: WallTile, gateOpen = false): WallArt {
  const hasFace = !!w.face || w.door || !!w.gate;
  const hgt = hasFace ? w.h : 0, { c, g } = canvas(T, T + hgt);
  const n = !!wallAt(w.x, w.y - 1), s = !!wallAt(w.x, w.y + 1), e = !!wallAt(w.x + 1, w.y), wst = !!wallAt(w.x - 1, w.y);
  const vertical = n && s && !(w.door && (e || wst));
  if (w.door && vertical) { paintLintelCap(g, w, e, wst); return { canvas: c, glow: null }; }
  if (!w.gate) paintCap(g, w, n, s, e, wst);
  let glow: HTMLCanvasElement | null = null;
  if (hasFace) {
    const oy = T;
    if (w.gate === 'main') paintGate(g, w, oy, gateOpen);
    else if (w.gate === 'dock') paintDockGate(g, w, oy);
    else if (w.door) paintDoorway(g, w, oy);
    else if (w.face === 'int') paintInterior(g, w, oy);
    else paintExterior(g, w, oy, e, wst);
    if (w.window && w.face === 'ext') glow = paintWindow(g, w, oy);
  }
  return { canvas: c, glow };
}

function paintCap(g: Ctx, w: WallTile, n: boolean, s: boolean, e: boolean, wst: boolean) {
  const yard = w.style === 'yard', top = yard ? '#77736a' : '#5f5c55', edge = yard ? '#a9a497' : '#8e897d';
  rect(g, top, 0, 0, T, T);
  speckle(g, [shade(top, .08), shade(top, -.1)], 0, 0, T, T, 26, w.x * 7 + w.y * 13);
  if ((w.x + w.y) % 2 === 0) rect(g, shade(top, -.18), 0, 2, 1, 28);
  if (!n) { rect(g, edge, 0, 0, T, 2); rect(g, shade(edge, -.25), 0, 2, T, 1); }
  if (!s) rect(g, shade(edge, .05), 0, 30, T, 2);
  if (!wst) rect(g, shade(edge, -.1), 0, 0, 2, T);
  if (!e) { rect(g, shade(top, -.25), 30, 0, 1, T); rect(g, shade(top, -.4), 31, 0, 1, T); }
  // Rain pooling on the coping, and broken glass set into the compound wall's top.
  if (hash(w.x, w.y, 61) < .25) ditherRect(g, '#4a5052', 6, 10, 14, 8, .5);
  if (yard && !s) for (let i = 0; i < 6; i++) { const gx = 3 + i * 5 + Math.floor(hash(w.x, i, 4) * 3); rect(g, i % 2 ? '#6d8a83' : '#8fa79c', gx, 13 + (i % 3), 2, 2); dot(g, '#c9dad0', gx, 13 + (i % 3)); }
}

/**
 * Doorway through a north-south wall, seen from above: the wall top stops at two jambs and the floor runs through
 * the gap, crossed by a steel threshold, so the opening reads as a way through (F01).
 */
function paintLintelCap(g: Ctx, w: WallTile, e: boolean, wst: boolean) {
  const wood = w.owner === 'radio' || w.owner === 'dorm', floor = wood ? '#7f6a52' : '#a3aba6', seam = wood ? '#5a4a39' : '#7d8582';
  rect(g, floor, 0, 5, T, 22);
  if (wood) for (let y = 5; y < 27; y += 6) rect(g, seam, 0, y, T, 1);
  else for (let x = 0; x < T; x += 8) rect(g, seam, x, 5, 1, 22);
  rect(g, '#9aa0a0', 14, 5, 4, 22); rect(g, '#c4c9c6', 14, 5, 1, 22); rect(g, '#5c6260', 17, 5, 1, 22);
  // Jambs: the wall top on either side of the gap, with a light edge where the frame meets the opening.
  for (const y of [0, 27]) { rect(g, '#5f5c55', 0, y, T, 5); rect(g, '#4a4741', 0, y === 0 ? 4 : 27, T, 1); }
  rect(g, '#6b5947', 0, 4, T, 2); rect(g, '#6b5947', 0, 26, T, 2); rect(g, '#8a7458', 0, 4, T, 1);
  if (!wst) rect(g, '#8e897d', 0, 0, 2, 5); if (!e) rect(g, '#3a3833', 31, 0, 1, 5);
  if (!wst) rect(g, '#8e897d', 0, 27, 2, 5); if (!e) rect(g, '#3a3833', 31, 27, 1, 5);
}

function grime(g: Ctx, w: WallTile, oy: number, hgt: number) {
  // Rising damp and salt bloom at the foot of every wall, streaks from the coping.
  ditherRect(g, '#4d4a42', 0, oy + hgt - 10, T, 10, .35);
  ditherRect(g, '#e8e6dc', 0, oy + hgt - 14, T, 4, .12);
  for (let i = 0; i < 3; i++) if (hash(w.x, w.y, 70 + i) < .45) { const sx = 2 + Math.floor(hash(w.x, i, 71) * 28); for (let y = 0; y < 6 + i * 4; y++) if (hash(sx, y, 72) < .8) dot(g, '#6b675e', sx, oy + 2 + y); }
}

function paintExterior(g: Ctx, w: WallTile, oy: number, e: boolean, wst: boolean) {
  const hgt = w.h, p = EXT[w.style];
  rect(g, p.base, 0, oy, T, hgt);
  switch (w.style) {
    case 'yard': {
      rect(g, p.light, 0, oy, T, 3); rect(g, p.dark, 0, oy + 3, T, 1);
      speckle(g, [p.dark, p.light, shade(p.base, -.15)], 0, oy + 4, T, hgt - 4, 40, w.x * 11 + w.y);
      if (w.x % 3 === 0) rect(g, shade(p.base, -.2), 0, oy + 4, 1, hgt - 4);
      const ch = SLOGAN[w.x];
      if (ch && w.y === 21) {
        pixelText(g, ch, 16, oy + 7, '#a8342a', 16, 'center');
        for (let i = 0; i < 3; i++) { const dx = 10 + Math.floor(hash(w.x, i, 5) * 12), len = 2 + Math.floor(hash(i, w.x, 6) * 5); rect(g, '#93302a', dx, oy + 22, 1, len); }
      }
      break;
    }
    case 'panel': {
      for (let x = 0; x < T; x += 8) { rect(g, p.dark, x, oy, 1, hgt); rect(g, p.light, x + 1, oy, 1, hgt); }
      rect(g, '#7c8486', 0, oy, T, 2); rect(g, '#7c8486', 0, oy + hgt - 3, T, 3);
      speckle(g, ['#a3abad', '#c9cece', '#8d7d68'], 0, oy, T, hgt, 30, w.x * 3 + w.y);
      for (let i = 0; i < 2; i++) if (hash(w.x, i, 9) < .5) { const sx = Math.floor(hash(i, w.x, 10) * 30); rect(g, '#8a6a4e', sx, oy + 6, 1, 10 + i * 6); }
      break;
    }
    case 'tile': case 'clinic': {
      // White ceramic tiles below, whitewash above, a painted band between (station blue / clinic green).
      const band = w.style === 'clinic' ? '#5e8a72' : '#3f6a86', tileTop = oy + 16;
      rect(g, shade(p.base, .06), 0, oy, T, 14);
      rect(g, band, 0, oy + 13, T, 3); rect(g, shade(band, .2), 0, oy + 13, T, 1);
      for (let y = tileTop; y < oy + hgt; y += 6) { rect(g, p.dark, 0, y, T, 1); for (let x = (y / 6) % 2 ? 0 : 3; x < T; x += 6) dot(g, p.dark, x, y + 1 + (x % 3)); }
      for (let y = tileTop; y < oy + hgt; y += 6) for (let x = 0; x < T; x += 6) rect(g, p.dark, x, y, 1, 6);
      speckle(g, ['#a7a89e', '#8d8e84'], 0, oy + 16, T, hgt - 16, 16, w.x + w.y * 5);
      break;
    }
    case 'block': {
      for (let y = 0; y < hgt; y += 8) {
        rect(g, p.dark, 0, oy + y, T, 1);
        const off = (y / 8) % 2 ? 8 : 0;
        for (let x = off; x < T; x += 16) rect(g, p.dark, x, oy + y, 1, 8);
      }
      speckle(g, [p.light, shade(p.base, -.2), '#5e5a52'], 0, oy, T, hgt, 40, w.x * 5 + w.y * 3);
      ditherRect(g, '#4a4741', 0, oy, T, 8, .3); // soot under the coping
      break;
    }
    case 'brick': {
      for (let y = 0; y < hgt; y += 4) { rect(g, p.dark, 0, oy + y, T, 1); const off = (y / 4) % 2 ? 4 : 0; for (let x = off; x < T; x += 8) rect(g, p.dark, x, oy + y, 1, 4); }
      break;
    }
  }
  grime(g, w, oy, hgt);
  if (!wst) rect(g, shade(p.base, .1), 0, oy, 1, hgt);
  if (!e) { rect(g, shade(p.base, -.3), 31, oy, 1, hgt); }
}

function paintInterior(g: Ctx, w: WallTile, oy: number) {
  const hgt = w.h, p = INT[w.owner as RoomId] ?? INT.gen, dado = oy + hgt - 18;
  rect(g, p.wall, 0, oy, T, hgt);
  rect(g, shade(p.wall, .1), 0, oy, T, 2);
  speckle(g, [shade(p.wall, -.06), shade(p.wall, .06)], 0, oy, T, hgt - 18, 18, w.x * 9 + w.y);
  rect(g, p.dado, 0, dado, T, 18); rect(g, p.trim, 0, dado, T, 1); rect(g, shade(p.dado, -.25), 0, oy + hgt - 3, T, 3);
  if (w.owner === 'cold') { for (let x = 0; x < T; x += 8) rect(g, shade(p.wall, -.12), x, oy, 1, hgt); ditherRect(g, '#e7f2f6', 0, oy + 2, T, 10, .3); }
  if (w.owner === 'gen') ditherRect(g, '#3c3a35', 0, oy, T, 14, .4);
  if (w.owner === 'radio' && hash(w.x, w.y, 2) < .6) {
    // Tide tables pinned above the desk, Xiao Cai's handwriting.
    rect(g, '#d8d2bd', 6, oy + 8, 14, 16); for (let i = 0; i < 5; i++) rect(g, '#6b675a', 8, oy + 11 + i * 3, 10 - (i % 2) * 3, 1);
    dot(g, '#a33a2e', 13, oy + 8);
  }
  if (w.owner === 'canteen' && w.x === 9) { rect(g, '#c9b98e', 8, oy + 6, 16, 10); rect(g, '#8a2f26', 10, oy + 8, 12, 2); rect(g, '#6b675a', 10, oy + 12, 8, 1); }
  if (w.owner === 'clinic' && w.x === 29) { rect(g, '#e8ede6', 8, oy + 6, 14, 12); rect(g, '#5e8a72', 13, oy + 8, 4, 8); rect(g, '#5e8a72', 11, oy + 10, 8, 4); }
}

function paintWindow(g: Ctx, w: WallTile, oy: number): HTMLCanvasElement {
  const x0 = 5, y0 = oy + 9, ww = 22, wh = Math.min(20, w.h - 22);
  rect(g, '#3b3f3d', x0 - 2, y0 - 2, ww + 4, wh + 4);
  rect(g, '#7f857f', x0 - 1, y0 - 1, ww + 2, 1); rect(g, '#2a2c2a', x0 - 1, y0 + wh, ww + 2, 2);
  rect(g, '#1b2224', x0, y0, ww, wh);
  // Mullions; tape crosses where a pane cracked in the storm.
  rect(g, '#4c514d', x0 + ww / 2 - 1, y0, 2, wh); rect(g, '#4c514d', x0, y0 + wh / 2 - 1, ww, 2);
  if (hash(w.x, w.y, 8) < .5) { line(g, '#8f8a74', x0 + 2, y0 + 2, x0 + 8, y0 + 8); line(g, '#8f8a74', x0 + 8, y0 + 2, x0 + 2, y0 + 8); }
  rect(g, '#6e736c', x0 - 2, y0 + wh + 2, ww + 4, 2); // sill
  const glow = canvas(T, T + w.h);
  for (const [px, py, pw, ph] of [[x0, y0, ww / 2 - 1, wh / 2 - 1], [x0 + ww / 2 + 1, y0, ww / 2 - 1, wh / 2 - 1], [x0, y0 + wh / 2 + 1, ww / 2 - 1, wh / 2 - 1], [x0 + ww / 2 + 1, y0 + wh / 2 + 1, ww / 2 - 1, wh / 2 - 1]]) {
    rect(glow.g, '#ffffff', px, py, pw, ph);
    // Curtain and silhouettes of things on the sill stop the panes from reading as flat fills.
    ditherRect(glow.g, '#000000', px, py, 3, ph, .5);
  }
  rect(glow.g, '#000000', x0 + 3, y0 + wh - 5, 4, 5); rect(glow.g, '#000000', x0 + ww - 7, y0 + wh - 3, 5, 3);
  return glow.c;
}

function paintDoorway(g: Ctx, w: WallTile, oy: number) {
  const p = w.owner === 'yard' ? EXT.yard : EXT[w.style], hgt = w.h, cold = w.owner === 'cold';
  // Lintel band and posts; the opening stays transparent so the floor inside shows through.
  rect(g, p.base, 0, oy, T, 12); rect(g, shade(p.base, -.25), 0, oy + 11, T, 1); rect(g, shade(p.base, .1), 0, oy, T, 2);
  rect(g, '#3a352d', 0, oy + 12, 2, hgt - 12); rect(g, '#3a352d', 30, oy + 12, 2, hgt - 12);
  if (cold) {
    // Insulated sliding door pushed aside on its rail.
    const left = !wallAt(w.x - 1, w.y)?.door;
    rect(g, '#4a4f50', 0, oy + 10, T, 2);
    if (left) { rect(g, '#d2d7d6', 0, oy + 12, 8, hgt - 12); rect(g, '#9ba2a3', 7, oy + 12, 1, hgt - 12); rect(g, '#b7782f', 2, oy + 24, 4, 2); }
  } else {
    rect(g, '#5d4a37', 2, oy + 12, 4, hgt - 12); rect(g, '#71593f', 2, oy + 12, 1, hgt - 12); // door leaf swung inward
  }
  if (w.owner === 'gen') { // 维修单 taped beside the door
    rect(g, '#e2dcc4', 24, oy + 16, 6, 9); for (let i = 0; i < 3; i++) rect(g, '#6b675a', 25, oy + 18 + i * 2, 4, 1);
  }
}

function paintDockGate(g: Ctx, w: WallTile, oy: number) {
  const left = !!wallAt(w.x - 1, w.y) && !wallAt(w.x - 1, w.y)!.door;
  if (left) { rect(g, '#6c6862', 0, oy - 6, 4, w.h + 6); rect(g, '#8c877d', 0, oy - 6, 4, 1); }
  else { rect(g, '#6c6862', 28, oy - 6, 4, w.h + 6); rect(g, '#8c877d', 28, oy - 6, 4, 1); }
}

/** Main gate leaf: sheet-steel lower half, bars above. Open gates fold against the posts. */
function paintGate(g: Ctx, w: WallTile, oy: number, open: boolean) {
  const hgt = w.h + 6, top = oy - 6;
  const pos = w.x - 26;
  if (open) {
    if (pos === 0) { rect(g, '#3a3d3c', 0, top, 6, hgt); rect(g, '#5a5f5c', 0, top, 6, 1); }
    if (pos === 2) { rect(g, '#3a3d3c', 26, top, 6, hgt); rect(g, '#5a5f5c', 26, top, 6, 1); }
    return;
  }
  rect(g, '#2f3433', 0, top, T, 2);
  for (let x = 1; x < T; x += 4) rect(g, '#465050', x, top + 2, 2, 14);
  rect(g, '#566262', 0, top + 16, T, hgt - 16); rect(g, '#6b7877', 0, top + 16, T, 1); rect(g, '#3c4544', 0, top + hgt - 2, T, 2);
  for (let y = top + 20; y < top + hgt - 2; y += 6) rect(g, '#4a5554', 0, y, T, 1);
  speckle(g, ['#7a5440', '#8a6245', '#3e4847'], 0, top + 16, T, hgt - 18, 26, w.x);
  if (pos === 1) { rect(g, '#2a2f2e', 15, top, 2, hgt); rect(g, '#b49a3c', 12, top + 22, 8, 3); }
  if (pos === 0) rect(g, '#2a2f2e', 0, top, 2, hgt);
  if (pos === 2) rect(g, '#2a2f2e', 30, top, 2, hgt);
}
