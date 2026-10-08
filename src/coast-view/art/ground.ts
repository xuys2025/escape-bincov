import type { MapDef, Rect } from '../../raid-runtime/contract';
import type { GroundMaterial } from '../appearance';
import { P, canvas, dot, hash, line, rect, type Ctx } from './paint';
import { solGround, type SolArt } from './sol';

const isWallish = (m: MapDef, x: number, y: number) => {
  const c = m.cells[y]?.[x];
  return c === 'wall' || c === 'window' || m.doors.some(d => d.x === x && d.y === y);
};

function tile(g: Ctx, M: GroundMaterial[][], tx: number, ty: number, x: number, y: number, art: SolArt | null) {
  const mat = M[ty]?.[tx] ?? 'void', h = (i: number) => hash(tx, ty, i);
  // Sol samples replace the base texture; only the rare patches, cracks, moss and drains stay as runtime variation.
  if (art && solGround(art, g, mat, tx, ty, x, y)) {
    if (mat === 'asphalt') {
      if (h(90) < .14) { rect(g, P.asphaltPatch, x + 4, y + 6, 18, 12); rect(g, '#504c45', x + 4, y + 6, 18, 1); }
      if (h(91) < .18) { const sx = Math.floor(h(92) * 20) + 6; line(g, '#35332f', x + sx, y, x + sx + 4, y + 13); line(g, '#35332f', x + sx + 4, y + 13, x + sx + 1, y + 24); }
    } else if (mat === 'yard') {
      if (h(6) < .22) { const gx = x + Math.floor(h(7) * 26), gy = y + Math.floor(h(8) * 26); rect(g, P.moss, gx, gy, 3, 2); dot(g, '#6b7258', gx + 1, gy - 1); dot(g, P.moss, gx + 4, gy + 1); }
      if (h(9) < .06) { rect(g, '#3f4546', x + 8, y + 12, 14, 5); rect(g, '#4a5354', x + 10, y + 12, 6, 1); }
    }
    return;
  }
  switch (mat) {
    case 'asphalt': {
      rect(g, P.asphalt, x, y, 32, 32);
      for (let i = 0; i < 14; i++) dot(g, i % 3 ? P.asphaltDark : P.asphaltLight, x + Math.floor(h(i) * 32), y + Math.floor(h(i + 40) * 32));
      if (h(90) < .14) { rect(g, P.asphaltPatch, x + 4, y + 6, 18, 12); rect(g, '#504c45', x + 4, y + 6, 18, 1); }
      if (h(91) < .18) { const sx = Math.floor(h(92) * 20) + 6; line(g, '#35332f', x + sx, y, x + sx + 4, y + 13); line(g, '#35332f', x + sx + 4, y + 13, x + sx + 1, y + 24); }
      break;
    }
    case 'yard': {
      rect(g, P.yard, x, y, 32, 32);
      if (h(1) < .22) { const w = 14 + Math.floor(h(2) * 14), hh = 10 + Math.floor(h(3) * 14), ox = Math.floor(h(4) * (32 - w)), oy = Math.floor(h(5) * (32 - hh));
        rect(g, '#605a4d', x + ox, y + oy, w, hh); rect(g, '#665f51', x + ox, y + oy, w, 1); rect(g, P.yardDark, x + ox, y + oy + hh - 1, w, 1); }
      for (let i = 0; i < 10; i++) dot(g, i % 2 ? P.gravel : P.yardDark, x + Math.floor(h(10 + i) * 32), y + Math.floor(h(30 + i) * 32));
      if (h(6) < .22) { const gx = x + Math.floor(h(7) * 26), gy = y + Math.floor(h(8) * 26); rect(g, P.moss, gx, gy, 3, 2); dot(g, '#6b7258', gx + 1, gy - 1); dot(g, P.moss, gx + 4, gy + 1); }
      if (h(9) < .06) { rect(g, '#3f4546', x + 8, y + 12, 14, 5); rect(g, '#4a5354', x + 10, y + 12, 6, 1); }
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
      // Poured slab: 2x2-tile joints, grit, oil stains, hairline cracks and rubble chips, so a large floor is not a flat
      // grey field (ruined workshops and stores read as used interiors rather than unfinished placeholders).
      rect(g, '#6b665c', x, y, 32, 32);
      for (let i = 0; i < 22; i++) dot(g, i % 4 ? '#625d54' : '#77726a', x + Math.floor(h(i) * 32), y + Math.floor(h(i + 9) * 32));
      if (tx % 2 === 0) { rect(g, '#55514a', x, y, 1, 32); rect(g, '#77726a', x + 1, y, 1, 32); }
      if (ty % 2 === 0) { rect(g, '#55514a', x, y, 32, 1); rect(g, '#77726a', x, y + 1, 32, 1); }
      if (h(20) < .22) { const sx = x + 6 + Math.floor(h(21) * 12), sy = y + 6 + Math.floor(h(22) * 12); rect(g, '#5f5a51', sx, sy, 12, 7); rect(g, '#5a554d', sx + 2, sy + 2, 8, 3); rect(g, '#5f5a51', sx - 2, sy + 2, 2, 3); }
      if (h(23) < .25) { const sx = Math.floor(h(24) * 22) + 5; line(g, '#4f4b44', x + sx, y + 2, x + sx + 5, y + 12); line(g, '#4f4b44', x + sx + 5, y + 12, x + sx + 2, y + 22); }
      if (h(25) < .3) for (let i = 0; i < 3; i++) { const cx = x + 4 + Math.floor(h(26 + i) * 24), cy = y + 4 + Math.floor(h(30 + i) * 24); rect(g, '#8a8476', cx, cy, 2, 1); dot(g, '#4a463f', cx, cy + 1); }
      break;
    }
    case 'wood': {
      for (let r = 0; r < 4; r++) {
        const k = hash(tx, ty * 4 + r, 8);
        rect(g, k < .33 ? P.wood : k < .66 ? '#634e3b' : '#705944', x, y + r * 8, 32, 8);
        rect(g, P.woodSeam, x, y + r * 8 + 7, 32, 1);
        const joint = Math.floor(hash(tx, ty * 4 + r, 9) * 30);
        rect(g, P.woodSeam, x + joint, y + r * 8, 1, 7); if (k > .8) dot(g, P.woodDark, x + (joint + 9) % 30, y + r * 8 + 3);
      }
      break;
    }
    case 'mud': rect(g, '#4e4638', x, y, 32, 32); rect(g, '#5b5241', x, y + 6, 32, 1); break;
    case 'water': {
      rect(g, P.deepWater, x, y, 32, 32);
      for (let i = 0; i < 3; i++) { const wy = y + 6 + i * 10 + Math.floor(h(i) * 4), wx = x + Math.floor(h(i + 5) * 18); rect(g, P.waterLine, wx, wy, 8 + Math.floor(h(i + 9) * 6), 1); }
      break;
    }
    default: rect(g, P.void, x, y, 32, 32);
  }
}

export function paintGround(m: MapDef, b: Rect, M: GroundMaterial[][], art: SolArt | null = null): HTMLCanvasElement {
  const { c, g } = canvas(b.w, b.h);
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
    if (curb(tx, ty - 1)) { rect(g, '#8a8478', X, Y - 3, 32, 2); rect(g, '#2f2d29', X, Y - 1, 32, 1); }
    if (curb(tx, ty + 1)) { rect(g, '#8a8478', X, Y + 32, 32, 2); rect(g, '#605a50', X, Y + 34, 32, 1); }
    if (curb(tx - 1, ty)) { rect(g, '#8a8478', X - 3, Y, 2, 32); rect(g, '#2f2d29', X - 1, Y, 1, 32); }
    if (curb(tx + 1, ty)) { rect(g, '#8a8478', X + 32, Y, 2, 32); rect(g, '#605a50', X + 34, Y, 1, 32); }
  }
  const dash = (x: number, y: number, horizontal: boolean) => { for (let i = 0; i < 32; i += 16) horizontal ? rect(g, '#7d776a', x + i + 2, y, 9, 1) : rect(g, '#7d776a', x, y + i + 2, 1, 9); };
  for (let tx = x0; tx < x1; tx++) {
    if (mat(tx, 13) === 'asphalt' && mat(tx, 14) === 'asphalt' && mat(tx, 12) !== 'asphalt' && mat(tx, 15) !== 'asphalt') dash(tx * 32 - b.x, 14 * 32 - b.y, true);
    if (mat(tx, 3) === 'asphalt' && mat(tx, 5) === 'asphalt' && mat(tx, 6) !== 'asphalt' && mat(tx, 2) !== 'asphalt') dash(tx * 32 - b.x, Math.round(4.5 * 32) - b.y, true);
  }
  for (let ty = y0; ty < y1; ty++) if (mat(19, ty) === 'asphalt' && mat(20, ty) === 'asphalt' && mat(18, ty) !== 'asphalt' && mat(21, ty) !== 'asphalt') dash(20 * 32 - b.x, ty * 32 - b.y, false);
  const manhole = (tx: number, ty: number) => { const X = tx * 32 - b.x + 8, Y = ty * 32 - b.y + 8; rect(g, '#33312d', X, Y, 16, 16); rect(g, '#55524b', X + 1, Y + 1, 14, 14); for (let i = 2; i < 14; i += 3) rect(g, '#46433d', X + 1, Y + i, 14, 1); };
  manhole(20, 9); manhole(26, 14); manhole(8, 4);
  const grate = (tx: number, ty: number) => { const X = tx * 32 - b.x + 4, Y = ty * 32 - b.y + 26; rect(g, '#2a2926', X, Y, 24, 6); for (let i = 1; i < 24; i += 3) rect(g, '#55524b', X + i, Y + 1, 1, 4); };
  grate(15, 14); grate(31, 13); grate(19, 22);
  for (let i = 0; i < 60; i++) {
    const px = Math.floor(hash(i, 1, 77) * b.w), py = Math.floor(hash(i, 2, 77) * b.h);
    const tx = Math.floor((px + b.x) / 32), ty = Math.floor((py + b.y) / 32);
    if (isWallish(m, tx, ty) || !mat(tx, ty) || mat(tx, ty) === 'void') continue;
    const k = hash(i, 3, 77);
    if (k < .4) { rect(g, P.label, px, py, 2, 1); dot(g, '#a8a08d', px + 1, py + 1); }
    else if (k < .65) { rect(g, '#6b5a44', px, py, 3, 2); dot(g, '#8a7354', px, py); }
    else if (k < .8) { rect(g, '#504c45', px, py, 4, 3); dot(g, '#6b665c', px + 1, py); }
    else { dot(g, P.rust, px, py); dot(g, P.rustLight, px + 1, py); }
  }
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    if (!isWallish(m, tx, ty) || isWallish(m, tx, ty + 1)) continue;
    const X = tx * 32 - b.x, Y = (ty + 1) * 32 - b.y;
    if (M[ty + 1]?.[tx] === 'yard' || M[ty + 1]?.[tx] === 'asphalt') for (let i = 0; i < 4; i++) { dot(g, hash(tx, i, 31) < .5 ? P.moss : P.dry, X + Math.floor(hash(tx, ty + i, 32) * 30), Y + (i % 2)); }
  }
  g.save(); g.fillStyle = 'rgba(20,18,15,0.36)';
  const sx = 16, sy = 10;
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    if (!isWallish(m, tx, ty)) continue;
    const door = m.doors.find(d => d.x === tx && d.y === ty);
    if (door && door.wall === 'ns') continue;
    const X = tx * 32 - b.x, Y = ty * 32 - b.y;
    if (!isWallish(m, tx + 1, ty)) g.fillRect(X + 32, Y + sy, sx, 32);
    if (!isWallish(m, tx, ty + 1)) g.fillRect(X + sx, Y + 32, 32, sy);
    if (!isWallish(m, tx + 1, ty) && !isWallish(m, tx, ty + 1) && !isWallish(m, tx + 1, ty + 1)) g.fillRect(X + 32, Y + 32, sx, sy);
  }
  g.restore();
  return c;
}
