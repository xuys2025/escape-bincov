import { SHED, T, type Room } from '../layout';
import { canvas, ditherRect, dot, hash, line, pixelText, rect, shade, speckle, type Ctx } from '../paint';

/** Flat concrete roof with a parapet, drawn over the whole building ring at wall-top height. */
export function paintRoof(r: Room): HTMLCanvasElement {
  const w = r.w * T, h = r.h * T, { c, g } = canvas(w, h);
  const deck = r.id === 'cold' ? '#8a9091' : r.id === 'clinic' ? '#7d837c' : '#6d695f';
  rect(g, deck, 0, 0, w, h);
  speckle(g, [shade(deck, .07), shade(deck, -.08), shade(deck, -.14)], 0, 0, w, h, Math.floor(w * h / 14), r.x * 31 + r.y);
  // Tar seams in a grid, and rainwater standing in the low corners.
  for (let x = 32; x < w; x += 32) for (let y = 4; y < h - 4; y++) if (hash(x, y, 3) < .85) dot(g, shade(deck, -.25), x, y);
  for (let i = 0; i < 3; i++) { const px = 10 + Math.floor(hash(r.x, i, 6) * (w - 50)), py = 10 + Math.floor(hash(i, r.y, 7) * (h - 40)); ditherRect(g, '#3f4a4d', px, py, 22 + i * 4, 9, .55); rect(g, '#566468', px + 4, py + 2, 8, 1); }
  // Parapet: lighter top edge, dark inner drop.
  rect(g, '#a49d8e', 0, 0, w, 3); rect(g, '#a49d8e', 0, 0, 3, h); rect(g, '#7a7468', w - 3, 0, 3, h); rect(g, '#b1aa9a', 0, h - 4, w, 4);
  rect(g, shade(deck, -.3), 3, 3, w - 6, 2); rect(g, shade(deck, -.3), 3, 3, 2, h - 6);
  switch (r.id) {
    case 'cold':
      for (let i = 0; i < 2; i++) unit(g, 20 + i * 70, 40, 52, 34);
      ditherRect(g, '#d8e4e8', 8, 8, w - 16, 20, .2);
      for (let i = 0; i < 2; i++) fishRack(g, 22 + i * 100, 118, 84);
      break;
    case 'canteen': {
      tank(g, w - 74, 22);
      // Stove pipe (smoke rises from here, see the weather layer).
      rect(g, '#3a3632', 196, 30, 10, 14); rect(g, '#55504a', 194, 26, 14, 5); rect(g, '#2a2724', 197, 27, 8, 2);
      tarp(g, 30, 70, 80, 50, '#3d5d74');
      sign(g, w / 2 - 66, h - 36, '滨科夫水产站');
      break;
    }
    case 'dorm':
      tarp(g, 12, 18, w - 24, h - 40, '#6b5d3a');
      for (let i = 0; i < 4; i++) tire(g, 18 + (i % 2) * (w - 60), 26 + Math.floor(i / 2) * (h - 80));
      break;
    case 'gen':
      rect(g, '#2f2c29', 40, 44, 12, 12); rect(g, '#4a4540', 38, 40, 16, 5); rect(g, '#1d1b19', 41, 41, 10, 2);
      vent(g, 20, 120); vent(g, 70, 150);
      break;
    case 'radio':
      for (let i = 0; i < 3; i++) line(g, '#2a2826', 60 + i * 30, h - 30, 150, 22);
      solar(g, 30, 80); vent(g, 110, 140);
      break;
    case 'work':
      skylight(g, 70, 50); tank(g, 20, 30);
      break;
    case 'clinic': {
      // Green cross painted large on the roof for anyone on the sea wall to see.
      rect(g, '#d9ddd2', w / 2 - 34, 24, 68, 68); rect(g, '#4f8a6a', w / 2 - 10, 32, 20, 52); rect(g, '#4f8a6a', w / 2 - 26, 48, 52, 20);
      ditherRect(g, '#7d837c', w / 2 - 34, 24, 68, 68, .2);
      break;
    }
  }
  return c;
}

/** Upright signboard on the south parapet: red characters on a weathered white board. */
function sign(g: Ctx, x: number, y: number, text: string) {
  const w = text.length * 20 + 12;
  rect(g, '#3a3632', x + 8, y + 22, 3, 12); rect(g, '#3a3632', x + w - 11, y + 22, 3, 12);
  rect(g, '#d9d5c8', x, y, w, 24); rect(g, '#efece2', x, y, w, 2); rect(g, '#9a968a', x, y + 22, w, 2);
  speckle(g, ['#b8b2a2', '#c9a27a', '#a8a090'], x, y, w, 24, 60, 9);
  pixelText(g, text, x + w / 2, y + 4, '#a8342a', 16, 'center');
  for (let i = 0; i < 4; i++) { const dx = x + 10 + Math.floor(hash(i, 3, 2) * (w - 20)); rect(g, '#8a6a4e', dx, y + 20, 1, 6 + i); }
}
function fishRack(g: Ctx, x: number, y: number, w: number) {
  rect(g, '#6a5a3c', x, y, 2, 30); rect(g, '#6a5a3c', x + w - 2, y, 2, 30);
  for (let r = 0; r < 2; r++) {
    rect(g, '#7f6a48', x, y + r * 14, w, 2);
    for (let i = 4; i < w - 4; i += 6) { const k = hash(i, r, x); rect(g, k < .5 ? '#c9b48a' : '#b49a6a', x + i, y + r * 14 + 2, 3, 8 + Math.floor(k * 3)); dot(g, '#e8dcbc', x + i + 1, y + r * 14 + 3); }
  }
}
function unit(g: Ctx, x: number, y: number, w: number, h: number) {
  rect(g, '#6e7576', x, y + 6, w, h); rect(g, '#9aa1a2', x, y, w, 8); rect(g, '#b5bbbb', x, y, w, 1);
  for (let i = 0; i < 5; i++) rect(g, '#4c5253', x + 6 + i * 9, y + 14, 5, h - 14);
  ditherRect(g, '#a86a3d', x, y + 8, w, h - 2, .15);
}
function tank(g: Ctx, x: number, y: number) {
  rect(g, '#2d2b28', x + 4, y + 40, 52, 6);
  rect(g, '#8a9da3', x, y, 56, 40); rect(g, '#a9babe', x, y, 56, 8); rect(g, '#6f8186', x, y + 34, 56, 6);
  for (let i = 0; i < 4; i++) rect(g, '#7b8e93', x + 8 + i * 12, y + 10, 2, 24);
  rect(g, '#bfcdd0', x + 22, y + 2, 12, 4);
}
function tarp(g: Ctx, x: number, y: number, w: number, h: number, color: string) {
  rect(g, color, x, y, w, h); speckle(g, [shade(color, .12), shade(color, -.15)], x, y, w, h, Math.floor(w * h / 18), x + y);
  for (let i = 0; i < w; i += 18) rect(g, shade(color, -.2), x + i, y, 1, h);
  rect(g, shade(color, .2), x, y, w, 1); ditherRect(g, '#2b3a44', x + 10, y + h / 2, w / 3, 8, .5);
}
function tire(g: Ctx, x: number, y: number) {
  rect(g, '#1f1e1c', x, y, 18, 18); rect(g, '#2f2d2a', x + 1, y + 1, 16, 2); rect(g, '#55524c', x + 6, y + 6, 6, 6);
}
function vent(g: Ctx, x: number, y: number) {
  rect(g, '#4d4a45', x, y, 22, 16); rect(g, '#6b6760', x, y, 22, 3); for (let i = 0; i < 4; i++) rect(g, '#2d2b28', x + 3, y + 5 + i * 3, 16, 1);
}
function solar(g: Ctx, x: number, y: number) {
  rect(g, '#28394a', x, y, 60, 30); for (let i = 0; i < 6; i++) rect(g, '#3b5670', x + 2 + i * 10, y + 2, 8, 26); rect(g, '#7a8a96', x, y, 60, 1);
}
function skylight(g: Ctx, x: number, y: number) {
  rect(g, '#55605e', x - 2, y - 2, 64, 44); rect(g, '#27302f', x, y, 60, 40); for (let i = 1; i < 4; i++) rect(g, '#55605e', x + i * 15, y, 1, 40);
  ditherRect(g, '#5d7272', x, y, 60, 14, .3);
}

/** Corrugated sheet canopy over Lao Shuan's repair shed. */
export function paintCanopy(): HTMLCanvasElement {
  const w = SHED.w * T, h = SHED.h * T, { c, g } = canvas(w, h + 6);
  for (let x = 0; x < w; x++) {
    const ridge = x % 6 < 3, base = ridge ? '#7c7a72' : '#5f5d56';
    rect(g, base, x, 0, 1, h);
  }
  speckle(g, ['#8b5a3c', '#9b6a45', '#6e4732'], 0, 0, w, h, 380, 7);
  ditherRect(g, '#8b5a3c', 0, h - 18, w, 18, .4);
  rect(g, '#9a988f', 0, h - 3, w, 2); rect(g, '#3c3a35', 0, h - 1, w, 1);
  // Drip edge: a row of water beads along the front.
  for (let x = 2; x < w; x += 7) { rect(g, '#7f9aa0', x, h, 1, 3 + (x % 3)); }
  // A sheet missing near the west end lets the rain through.
  g.clearRect(28, 26, 22, 30);
  rect(g, '#4a4842', 28, 26, 22, 1);
  return c;
}

/** Radio mast on the roof: tall lattice with a red beacon at the top (the beacon glow is a separate sprite). */
export function paintMast(): HTMLCanvasElement {
  const { c, g } = canvas(16, 100);
  for (let y = 4; y < 100; y++) { dot(g, '#2c2a27', 4, y); dot(g, '#2c2a27', 11, y); if (y % 8 === 0) line(g, '#3d3a36', 4, y, 11, y + 7); if (y % 8 === 4) line(g, '#3d3a36', 11, y, 4, y + 7); }
  rect(g, '#55524c', 3, 0, 10, 4); rect(g, '#d23a2a', 6, 0, 4, 3);
  rect(g, '#6c6a64', 0, 18, 16, 2); line(g, '#6c6a64', 0, 18, 0, 30); line(g, '#6c6a64', 15, 18, 15, 30);
  return c;
}
