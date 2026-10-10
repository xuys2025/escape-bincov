import { T } from '../layout';
import { canvas, disc, ditherRect, dot, hash, line, rect, shade, speckle, type Ctx } from '../paint';

/**
 * Props stand on their footprint's south edge. A painter returns a canvas `tw*32` wide and `th*32 + lift` tall: the
 * footprint is the bottom `th*32` rows (ground plane) and `lift` is the headroom above it for height.
 */
export interface PropArt { canvas: HTMLCanvasElement; glow?: HTMLCanvasElement }
type Painter = (tw: number, th: number) => PropArt;

interface Box { x: number; y: number; w: number; d: number; h: number }
/** 3/4 box: ground footprint (x, y, w, d) in canvas ground coords, height h. Returns the face rects. */
function box(g: Ctx, lift: number, b: Box, top: string, front: string, opts: { edge?: string; side?: string } = {}) {
  const ty = b.y + lift - b.h, fy = b.y + b.d + lift - b.h;
  rect(g, front, b.x, fy, b.w, b.h);
  rect(g, top, b.x, ty, b.w, b.d);
  rect(g, opts.edge ?? shade(top, .18), b.x, ty, b.w, 1);
  rect(g, shade(front, -.25), b.x, fy + b.h - 1, b.w, 1);
  if (opts.side) rect(g, opts.side, b.x + b.w - 1, fy, 1, b.h);
  return { top: { x: b.x, y: ty, w: b.w, h: b.d }, front: { x: b.x, y: fy, w: b.w, h: b.h } };
}
const make = (tw: number, th: number, lift: number) => { const r = canvas(tw * T, th * T + lift); return { ...r, lift }; };

const P: Record<string, Painter> = {
  shelf(tw, th) {
    const { c, g, lift } = make(tw, th, 46), w = tw * T;
    for (const x of [1, w - 3]) rect(g, '#5d6366', x, lift - 40 + 10, 2, 50);
    for (let i = 0; i < 3; i++) {
      const y = lift - 36 + i * 15 + 10;
      rect(g, '#7c8487', 1, y + 11, w - 2, 2); rect(g, '#9aa2a5', 1, y + 11, w - 2, 1);
      for (let x = 3; x < w - 8; x += 10 + Math.floor(hash(i, x, 4) * 4)) {
        const kind = hash(x, i, 5), cw = 7 + Math.floor(kind * 4), ch = 6 + Math.floor(hash(i, x, 6) * 4);
        const col = kind < .3 ? '#3d6f8a' : kind < .55 ? '#8a6a44' : kind < .75 ? '#c9c6b8' : '#5a7356';
        rect(g, col, x, y + 11 - ch, cw, ch); rect(g, shade(col, .2), x, y + 11 - ch, cw, 1); rect(g, shade(col, -.25), x + cw - 1, y + 11 - ch, 1, ch);
      }
    }
    return { canvas: c };
  },
  'shelf-tall'(tw, th) {
    const { c, g, lift } = make(tw, th, 50), w = tw * T, h = th * T;
    box(g, lift, { x: 2, y: 2, w: w - 4, d: h - 6, h: 46 }, '#8d9598', '#6f777a');
    for (let i = 0; i < 4; i++) { const y = lift - 46 + h - 6 + 2 + i * 11; rect(g, '#4f5659', 3, y, w - 6, 1); rect(g, i % 2 ? '#3d6f8a' : '#8a6a44', 5, y - 7, 10, 7); rect(g, '#c9c6b8', 17, y - 5, 8, 5); }
    return { canvas: c };
  },
  'gear-table'(tw, th) { return gearTable(tw, th, false); },
  'gear-table-lantern'(tw, th) { return gearTable(tw, th, true); },
  lockers(tw, th) {
    const { c, g, lift } = make(tw, th, 48), h = th * T;
    box(g, lift, { x: 2, y: 4, w: 28, d: h - 8, h: 44 }, '#5f7578', '#4f6467');
    const fy = lift - 44 + h - 4;
    for (let i = 0; i < 2; i++) { rect(g, '#3c4d50', 3 + i * 14, fy + 2, 1, 40); for (let s = 0; s < 3; s++) rect(g, '#2f3c3e', 6 + i * 14, fy + 4 + s * 2, 6, 1); rect(g, '#b3a067', 13 + i * 14 - 4, fy + 20, 2, 3); }
    return { canvas: c };
  },
  stove(tw, th) {
    const { c, g, lift } = make(tw, th, 30), w = tw * T;
    box(g, lift, { x: 2, y: 2, w: w - 4, d: 26, h: 22 }, '#5b5650', '#47423c');
    const ty = lift - 22 + 2;
    for (let i = 0; i < 2; i++) { disc(g, '#24211e', 22 + i * 36, ty + 13, 10, 8); disc(g, '#3d3a36', 22 + i * 36, ty + 12, 9, 7); }
    // Wok and steamer basket.
    disc(g, '#2a2826', 22, ty + 11, 8, 6); disc(g, '#4b4743', 22, ty + 10, 6, 4); disc(g, '#b59a6a', 58, ty + 9, 8, 6); rect(g, '#9a7f52', 50, ty + 9, 16, 1);
    const fy = lift - 22 + 28;
    rect(g, '#1d1a18', 14, fy + 8, 16, 10); rect(g, '#ff8a3a', 17, fy + 13, 10, 4); rect(g, '#ffd27a', 20, fy + 14, 4, 2);
    const glow = canvas(c.width, c.height); rect(glow.g, '#ff9a4a', 15, fy + 10, 14, 8); ditherRect(glow.g, '#ff7a2a', 10, fy + 4, 24, 20, .35);
    return { canvas: c, glow: glow.c };
  },
  'table-long'(tw, th) {
    const { c, g, lift } = make(tw, th, 18), w = tw * T;
    box(g, lift, { x: 2, y: 6, w: w - 4, d: 20, h: 12 }, '#8b6b4a', '#5f4934');
    const ty = lift - 12 + 6;
    for (let i = 0; i < 5; i++) { const x = 10 + i * 24 + Math.floor(hash(i, 1, 3) * 6); disc(g, '#d9d2c0', x, ty + 8, 4, 3); disc(g, '#b8a37c', x, ty + 8, 2, 1); if (i % 2) rect(g, '#3a2f22', x + 6, ty + 5, 1, 7); }
    rect(g, '#5f4934', 4, lift + 20, 2, 6); rect(g, '#5f4934', w - 6, lift + 20, 2, 6);
    return { canvas: c };
  },
  bench(tw, th) {
    const { c, g, lift } = make(tw, th, 10), w = tw * T;
    box(g, lift, { x: 4, y: 18, w: w - 8, d: 8, h: 7 }, '#7a5c40', '#553f2c');
    return { canvas: c };
  },
  pots(tw, th) {
    const { c, g, lift } = make(tw, th, 26), h = th * T;
    box(g, lift, { x: 3, y: 4, w: 26, d: h - 10, h: 18 }, '#7a7a74', '#5a5a55');
    const ty = lift - 18 + 4;
    disc(g, '#9aa0a0', 10, ty + 10, 6, 5); disc(g, '#3c3e3e', 10, ty + 10, 4, 3); disc(g, '#9aa0a0', 22, ty + 26, 6, 5); disc(g, '#c8a060', 22, ty + 26, 4, 3);
    rect(g, '#2c6a8a', 6, ty + 38, 18, 10); rect(g, '#3d7fa0', 6, ty + 38, 18, 2);
    return { canvas: c };
  },
  sacks(tw, th) {
    const { c, g, lift } = make(tw, th, 16);
    for (let i = 0; i < 3; i++) { const x = 4 + i * 18, y = lift + 6 + (i % 2) * 4; disc(g, '#c8bc9a', x + 8, y + 6, 9, 7); disc(g, '#ddd2b0', x + 7, y + 4, 6, 4); rect(g, '#9a8e6c', x + 4, y + 12, 9, 1); rect(g, '#a8382c', x + 5, y + 5, 5, 2); }
    return { canvas: c };
  },
  mats(tw, th) {
    const { c, g, lift } = make(tw, th, 4);
    for (let i = 0; i < 3; i++) { const x = 4 + i * 30; rect(g, ['#6a6e5a', '#7a5a4a', '#4f6066'][i], x, lift + 10, 24, 56); rect(g, '#c7bfa7', x + 2, lift + 12, 20, 8); speckle(g, ['#5a5e4a', '#8a7a62'], x, lift + 20, 24, 46, 30, i); }
    return { canvas: c };
  },
  bunk(tw, th) {
    const { c, g, lift } = make(tw, th, 46), h = th * T;
    for (const x of [3, 27]) rect(g, '#4b5257', x, lift - 40 + 4, 2, h + 34);
    for (const [lv, col] of [[10, '#5d6e5a'], [32, '#6e5a4a']] as const) {
      const y = lift - lv;
      rect(g, '#5e666b', 3, y + 4, 26, h - 8); rect(g, col, 5, y + 5, 22, h - 12); rect(g, '#d6cfba', 6, y + 6, 20, 8); rect(g, shade(col, -.2), 5, y + h - 9, 22, 2);
    }
    return { canvas: c };
  },
  heater(tw, th) {
    const { c, g, lift } = make(tw, th, 24);
    box(g, lift, { x: 8, y: 12, w: 16, d: 12, h: 18 }, '#5a5650', '#3e3a35');
    rect(g, '#ff7a2a', 12, lift - 18 + 26, 8, 3); rect(g, '#2a2724', 14, lift - 34, 4, 16);
    const glow = canvas(c.width, c.height); rect(glow.g, '#ff7a2a', 11, lift + 8, 10, 4);
    return { canvas: c, glow: glow.c };
  },
  curtain(tw, th) {
    const { c, g, lift } = make(tw, th, 44), h = th * T;
    rect(g, '#3c3a36', 2, lift - 40, 28, 2);
    for (let x = 4; x < 28; x++) rect(g, x % 4 < 2 ? '#8a5040' : '#74402f', x, lift - 38, 1, h + 30);
    return { canvas: c };
  },
  generator(tw, th) {
    const { c, g, lift } = make(tw, th, 34), w = tw * T, h = th * T;
    rect(g, '#2c2b27', 2, lift + h - 12, w - 4, 10);
    box(g, lift, { x: 4, y: 8, w: w - 8, d: h - 18, h: 28 }, '#6a7a52', '#4f5c3d', { side: '#3d482f' });
    const ty = lift - 28 + 8, fy = lift - 28 + h - 10;
    rect(g, '#3d482f', 8, ty + 6, w - 16, 2); rect(g, '#2e2c28', 12, ty + 14, 18, 14); for (let i = 0; i < 4; i++) rect(g, '#55524b', 14, ty + 16 + i * 3, 14, 1);
    rect(g, '#2a2925', w - 22, ty + 10, 12, 20); disc(g, '#55524b', w - 16, ty + 20, 4);
    rect(g, '#d9c38a', 8, fy + 6, 20, 8); rect(g, '#3a3a33', 10, fy + 8, 6, 1); rect(g, '#3a3a33', 10, fy + 11, 12, 1);
    rect(g, '#2e2c28', w - 20, fy + 4, 12, 18); rect(g, '#b8392a', w - 17, fy + 7, 3, 3); rect(g, '#3aa860', w - 12, fy + 7, 3, 3);
    // Hazard stripes painted on the plinth.
    for (let x = 4; x < w - 4; x += 6) { rect(g, '#b99a3a', x, lift + h - 11, 3, 3); }
    const glow = canvas(c.width, c.height); rect(glow.g, '#ff3a2a', w - 17, fy + 7, 3, 3); rect(glow.g, '#3aff70', w - 12, fy + 7, 3, 3);
    return { canvas: c, glow: glow.c };
  },
  'fuel-tank'(tw, th) {
    const { c, g, lift } = make(tw, th, 26);
    disc(g, '#7a3a2a', 16, lift + 4, 11, 6); rect(g, '#8a4532', 5, lift - 16, 22, 20); disc(g, '#a0563c', 16, lift - 16, 11, 5);
    rect(g, '#6a3022', 5, lift - 6, 22, 1); rect(g, '#d9c38a', 10, lift - 12, 10, 5); rect(g, '#2a2826', 14, lift - 22, 4, 4);
    return { canvas: c };
  },
  'radio-desk'(tw, th) {
    const { c, g, lift } = make(tw, th, 38), w = tw * T;
    box(g, lift, { x: 2, y: 4, w: w - 4, d: 22, h: 14 }, '#7a6247', '#56432f');
    const ty = lift - 14 + 4;
    // Two receivers stacked against the wall, dials, a microphone, the tide book.
    box(g, lift, { x: 10, y: 2, w: 34, d: 10, h: 30 }, '#4a4e48', '#3a3d38');
    box(g, lift, { x: 48, y: 2, w: 26, d: 10, h: 22 }, '#55594f', '#43463e');
    const r1 = lift - 30 + 12, r2 = lift - 22 + 12;
    rect(g, '#1d2a22', 13, r1 + 4, 28, 8); rect(g, '#8fe0a0', 15, r1 + 6, 10, 2); disc(g, '#b8b2a0', 18, r1 + 20, 3); disc(g, '#b8b2a0', 32, r1 + 20, 3);
    rect(g, '#1d2a22', 51, r2 + 3, 20, 6); rect(g, '#e0c070', 53, r2 + 5, 6, 2);
    rect(g, '#2a2826', 78, ty + 4, 2, 10); disc(g, '#3a3734', 79, ty + 3, 3, 2);
    rect(g, '#d8d2bd', 6, ty + 12, 16, 10); rect(g, '#6b675a', 8, ty + 14, 12, 1); rect(g, '#6b675a', 8, ty + 17, 10, 1);
    const glow = canvas(c.width, c.height); rect(glow.g, '#8fffa8', 13, r1 + 4, 28, 8); rect(glow.g, '#ffd070', 51, r2 + 3, 20, 6);
    return { canvas: c, glow: glow.c };
  },
  cot(tw, th) {
    const { c, g, lift } = make(tw, th, 12), h = th * T;
    box(g, lift, { x: 5, y: 4, w: 22, d: h - 10, h: 8 }, '#5d6a52', '#3f4a37');
    rect(g, '#cfc7ae', 7, lift - 8 + 6, 18, 9); rect(g, '#6a5a4a', 7, lift - 8 + 18, 18, h - 26);
    return { canvas: c };
  },
  'chart-stand'(tw, th) {
    const { c, g, lift } = make(tw, th, 44);
    rect(g, '#3a3632', 15, lift - 10, 2, 38); line(g, '#3a3632', 15, lift + 26, 8, lift + 30); line(g, '#3a3632', 16, lift + 26, 24, lift + 30);
    rect(g, '#e2dcc4', 4, lift - 38, 24, 28); rect(g, '#9ab0b8', 6, lift - 36, 20, 12);
    for (let i = 0; i < 20; i++) dot(g, '#2e5060', 6 + i, lift - 30 + Math.round(Math.sin(i * .7) * 4));
    rect(g, '#6b675a', 6, lift - 20, 16, 1); rect(g, '#6b675a', 6, lift - 16, 12, 1);
    return { canvas: c };
  },
  'steel-table'(tw, th) { return steelTable(tw, th, true); },
  'steel-table-old'(tw, th) { return steelTable(tw, th, false); },
  sink(tw, th) {
    const { c, g, lift } = make(tw, th, 24);
    box(g, lift, { x: 4, y: 6, w: 24, d: 20, h: 18 }, '#a4acae', '#7e8688');
    rect(g, '#5a6264', 8, lift - 18 + 9, 16, 12); rect(g, '#3e4547', 9, lift - 18 + 10, 14, 10); rect(g, '#7e8688', 15, lift - 26, 2, 10);
    return { canvas: c };
  },
  press(tw, th) {
    const { c, g, lift } = make(tw, th, 40), h = th * T;
    box(g, lift, { x: 4, y: 6, w: 24, d: h - 12, h: 34 }, '#8a8f8c', '#666b68');
    rect(g, '#2d3230', 8, lift - 34 + 12, 16, 10); rect(g, '#c99a3a', 9, lift - 34 + 30, 6, 3);
    return { canvas: c };
  },
  dryer(tw, th) {
    const { c, g, lift } = make(tw, th, 40), h = th * T;
    for (const x of [4, 26]) rect(g, '#6c7270', x, lift - 34, 2, h + 28);
    for (let i = 0; i < 4; i++) { rect(g, '#6c7270', 4, lift - 30 + i * 12, 24, 1); for (let x = 7; x < 25; x += 4) rect(g, '#e2ddd0', x, lift - 29 + i * 12, 3, 7); }
    return { canvas: c };
  },
  counter(tw, th) {
    const { c, g, lift } = make(tw, th, 22), w = tw * T;
    box(g, lift, { x: 0, y: 8, w, d: 16, h: 18 }, '#7d6a52', '#5a4a38');
    const ty = lift - 18 + 8, fy = ty + 16;
    for (let x = 4; x < w; x += 16) rect(g, '#4d3f30', x, fy + 2, 1, 15);
    // Lao Shuan's things: a stripped pistol on a rag, a coffee tin of screws, a ledger.
    rect(g, '#b8a888', 20, ty + 4, 18, 8); rect(g, '#55595a', 22, ty + 6, 12, 3); rect(g, '#3a3d3e', 30, ty + 8, 3, 3);
    disc(g, '#8a6a3a', 56, ty + 8, 4, 3); dot(g, '#c8b080', 55, ty + 7);
    rect(g, '#6a3a2e', 80, ty + 4, 12, 9); rect(g, '#c8b898', 81, ty + 5, 10, 1);
    return { canvas: c };
  },
  'tool-cart'(tw, th) {
    const { c, g, lift } = make(tw, th, 30);
    box(g, lift, { x: 4, y: 8, w: 24, d: 16, h: 24 }, '#a2382c', '#7c2a21');
    for (let i = 0; i < 3; i++) rect(g, '#5a1d17', 6, lift - 24 + 26 + i * 7, 20, 1);
    rect(g, '#9aa0a0', 8, lift - 24 + 10, 6, 2); rect(g, '#9aa0a0', 16, lift - 24 + 12, 8, 2);
    return { canvas: c };
  },
  tires(tw, th) {
    const { c, g, lift } = make(tw, th, 20);
    for (let i = 0; i < 3; i++) { const y = lift + 16 - i * 7; disc(g, '#1d1c1a', 16, y, 12, 6); disc(g, '#2e2c29', 16, y - 1, 11, 5); disc(g, '#151413', 16, y, 5, 2); }
    return { canvas: c };
  },
  desk(tw, th) {
    const { c, g, lift } = make(tw, th, 20), w = tw * T;
    box(g, lift, { x: 2, y: 6, w: w - 4, d: 20, h: 14 }, '#9a8a6a', '#6f6249');
    const ty = lift - 14 + 6;
    rect(g, '#efe8d4', 10, ty + 5, 14, 10); for (let i = 0; i < 3; i++) rect(g, '#6b675a', 12, ty + 7 + i * 3, 9, 1);
    rect(g, '#2a2826', 26, ty + 6, 1, 7); rect(g, '#a8382c', 29, ty + 6, 1, 7); rect(g, '#2d4f8a', 32, ty + 6, 1, 7); // three pens
    disc(g, '#b8c4c0', 46, ty + 9, 4, 3); rect(g, '#d8c070', 44, ty + 2, 4, 3);
    return { canvas: c };
  },
  cabinet(tw, th) {
    const { c, g, lift } = make(tw, th, 46);
    box(g, lift, { x: 3, y: 10, w: 26, d: 14, h: 42 }, '#d8dcd4', '#b8bdb4');
    const fy = lift - 42 + 24;
    rect(g, '#8fa6a0', 5, fy + 2, 22, 18); for (let i = 0; i < 3; i++) { rect(g, '#efe8d4', 7 + i * 7, fy + 4, 5, 6); rect(g, '#c25a4a', 7 + i * 7, fy + 12, 5, 6); }
    rect(g, '#5e8a72', 13, fy + 26, 6, 2);
    return { canvas: c };
  },
  bed(tw, th) {
    const { c, g, lift } = make(tw, th, 16), w = tw * T;
    box(g, lift, { x: 2, y: 4, w: w - 4, d: 24, h: 12 }, '#d4d8d0', '#9aa29e');
    const ty = lift - 12 + 4;
    rect(g, '#efefe6', 4, ty + 2, 14, 20); rect(g, '#7fa093', 18, ty + 2, w - 24, 20); rect(g, '#6c8c80', 18, ty + 18, w - 24, 4);
    return { canvas: c };
  },
  drip(tw, th) {
    const { c, g, lift } = make(tw, th, 46);
    rect(g, '#9aa0a0', 15, lift - 40, 2, 64); line(g, '#9aa0a0', 16, lift + 24, 10, lift + 28); line(g, '#9aa0a0', 16, lift + 24, 22, lift + 28);
    rect(g, '#cfe6ea', 18, lift - 38, 6, 10); rect(g, '#8fb8c0', 19, lift - 32, 4, 4); line(g, '#cfe6ea', 21, lift - 28, 26, lift + 6);
    return { canvas: c };
  },
  stretcher(tw, th) {
    const { c, g, lift } = make(tw, th, 8), w = tw * T;
    box(g, lift, { x: 4, y: 10, w: w - 8, d: 14, h: 5 }, '#6e7a5a', '#4f5a3f');
    rect(g, '#d8d2bd', 6, lift + 6, 10, 8);
    return { canvas: c };
  },
  pool(tw, th) {
    const { c, g, lift } = make(tw, th, 8), w = tw * T, h = th * T;
    // Concrete nursery tank: raised rim, dark water, a net draped over one end.
    box(g, lift, { x: 0, y: 0, w, d: h, h: 6 }, '#8b877c', '#6a665d');
    rect(g, '#3d6264', 4, lift - 6 + 4, w - 8, h - 8); ditherRect(g, '#4d7674', 4, lift - 6 + 4, w - 8, 8, .5); ditherRect(g, '#2f5052', 4, lift - 6 + h - 10, w - 8, 6, .5);
    rect(g, '#5b574f', 4, lift - 6 + 4, w - 8, 1);
    for (let i = 0; i < 6; i++) dot(g, '#3d6a68', 10 + Math.floor(hash(tw, i, 4) * (w - 20)), lift + 6 + Math.floor(hash(i, th, 5) * (h - 16)));
    for (let x = w - 26; x < w - 4; x += 3) for (let y = lift - 2; y < lift + h - 6; y += 3) dot(g, '#9a9070', x, y);
    return { canvas: c };
  },
  pullup(tw, th) {
    const { c, g, lift } = make(tw, th, 56);
    for (const x of [4, 26]) { rect(g, '#5a5e5c', x, lift - 50, 2, 74); }
    rect(g, '#8a8f8c', 4, lift - 50, 24, 2); rect(g, '#b5bab6', 4, lift - 50, 24, 1);
    return { canvas: c };
  },
  'tire-flat'(tw, th) {
    const { c, g, lift } = make(tw, th, 6);
    disc(g, '#2a2926', 16, lift + 18, 13, 8); disc(g, '#4a4843', 16, lift + 17, 12, 7); disc(g, '#3a3833', 16, lift + 17, 9, 5); disc(g, '#6e6a60', 16, lift + 18, 6, 3); for (let i = 0; i < 8; i++) dot(g, '#5c5952', 16 + Math.round(Math.cos(i * .8) * 11), lift + 17 + Math.round(Math.sin(i * .8) * 6));
    return { canvas: c };
  },
  sandbag(tw, th) {
    const { c, g, lift } = make(tw, th, 52);
    rect(g, '#3a3632', 15, lift - 50, 2, 10); rect(g, '#5a5e5c', 6, lift - 52, 20, 2);
    disc(g, '#6a6044', 16, lift - 22, 8, 18); disc(g, '#7f7452', 14, lift - 28, 5, 10); rect(g, '#4a4230', 9, lift - 10, 14, 2);
    return { canvas: c };
  },
  'train-board'(tw, th) {
    const { c, g, lift } = make(tw, th, 40);
    rect(g, '#4a3f30', 6, lift - 6, 2, 34); rect(g, '#4a3f30', 24, lift - 6, 2, 34);
    rect(g, '#2f3a33', 3, lift - 34, 26, 26); rect(g, '#6b5a40', 3, lift - 34, 26, 2);
    for (let i = 0; i < 4; i++) rect(g, '#d8d2bd', 6, lift - 28 + i * 5, 6 + (i * 5) % 14, 1);
    rect(g, '#c2a64a', 18, lift - 28, 7, 7);
    return { canvas: c };
  },
  pole(tw, th) {
    const { c, g, lift } = make(tw, th, 76);
    rect(g, '#3d3b37', 14, lift - 70, 4, 94); rect(g, '#55524c', 14, lift - 70, 1, 94);
    rect(g, '#3d3b37', 8, lift - 72, 16, 3); rect(g, '#2a2826', 6, lift - 69, 8, 4); rect(g, '#2a2826', 18, lift - 69, 8, 4);
    rect(g, '#ffd8a0', 8, lift - 65, 4, 1); rect(g, '#ffd8a0', 20, lift - 65, 4, 1);
    rect(g, '#2c2a27', 12, lift + 22, 8, 3);
    return { canvas: c };
  },
  'flood-pole'(tw, th) {
    const { c, g, lift } = make(tw, th, 80);
    rect(g, '#3d3b37', 14, lift - 72, 4, 96); rect(g, '#55524c', 14, lift - 72, 1, 96);
    rect(g, '#2a2826', 12, lift - 80, 14, 9); rect(g, '#e8e2d0', 14, lift - 72, 10, 2); line(g, '#55524c', 16, lift - 70, 14, lift - 60);
    return { canvas: c };
  },
  'fire-barrel'(tw, th) {
    const { c, g, lift } = make(tw, th, 26);
    disc(g, '#2a201a', 16, lift + 22, 11, 5);
    rect(g, '#5a3626', 6, lift, 20, 22); rect(g, '#6e4430', 6, lift, 2, 22); rect(g, '#3a2218', 24, lift, 2, 22);
    rect(g, '#4a2c20', 6, lift + 6, 20, 1); rect(g, '#4a2c20', 6, lift + 15, 20, 1);
    disc(g, '#2a1a12', 16, lift, 10, 4); disc(g, '#ff7a2a', 16, lift - 1, 7, 3); rect(g, '#ffb850', 13, lift - 5, 3, 4); rect(g, '#ffe090', 17, lift - 7, 2, 5);
    for (const x of [8, 12, 20, 24]) dot(g, '#ff9a40', x, lift + 10);
    const glow = canvas(c.width, c.height); disc(glow.g, '#ffb050', 16, lift - 2, 8, 5); rect(glow.g, '#ffe090', 13, lift - 8, 6, 6);
    return { canvas: c, glow: glow.c };
  },
  'fish-crates'(tw, th) {
    const { c, g, lift } = make(tw, th, 30), w = tw * T;
    // Blue plastic fish crates stacked unevenly, the station's old trade.
    for (let i = 0; i < Math.floor(w / 20); i++) {
      const stack = 1 + Math.floor(hash(i, tw, 3) * 3), x = 2 + i * 20;
      for (let s = 0; s < stack; s++) {
        const y = lift + 8 - s * 10, col = hash(i, s, 4) < .7 ? '#2f6a8c' : '#c25a3a';
        box(g, 0, { x, y, w: 18, d: 12, h: 10 }, shade(col, .1), col);
        for (let k = 0; k < 3; k++) rect(g, shade(col, -.3), x + 3 + k * 5, y + 15, 3, 4);
      }
    }
    return { canvas: c };
  },
  'foam-boxes'(tw, th) {
    const { c, g, lift } = make(tw, th, 24);
    for (let s = 0; s < 2; s++) box(g, lift, { x: 4 + s * 2, y: 8 - s * 14, w: 24, d: 16, h: 12 + s * 0 }, '#e6e4dc', '#c9c7be');
    rect(g, '#2f6a8c', 8, lift + 12, 8, 2);
    return { canvas: c };
  },
  drums(tw, th) {
    const { c, g, lift } = make(tw, th, 30), w = tw * T, h = th * T;
    const n = Math.max(1, Math.floor(w / 16) * Math.max(1, Math.floor(h / 22)));
    for (let i = 0; i < n; i++) {
      const x = 2 + (i % Math.floor(w / 16)) * 15, y = lift + 6 + Math.floor(i / Math.floor(w / 16)) * 22, col = i % 3 === 1 ? '#3b5b7a' : '#7a3a2a';
      rect(g, col, x, y, 13, 18); rect(g, shade(col, .2), x, y, 2, 18); rect(g, shade(col, -.2), x, y + 6, 13, 1); rect(g, shade(col, -.2), x, y + 12, 13, 1);
      disc(g, shade(col, .15), x + 6, y, 6, 2); dot(g, '#1d1c1a', x + 9, y);
    }
    return { canvas: c };
  },
  'water-tower'(tw, th) {
    const { c, g, lift } = make(tw, th, 90), w = tw * T, h = th * T;
    for (const x of [6, w - 8]) rect(g, '#4a4743', x, lift - 50, 3, h + 46);
    line(g, '#4a4743', 7, lift - 40, w - 7, lift); line(g, '#4a4743', w - 7, lift - 40, 7, lift);
    rect(g, '#7f8d90', 2, lift - 86, w - 4, 38); rect(g, '#9aa8aa', 2, lift - 86, w - 4, 6); rect(g, '#5f6c6e', 2, lift - 52, w - 4, 4);
    for (let x = 8; x < w - 4; x += 8) rect(g, '#6c797b', x, lift - 80, 1, 28);
    ditherRect(g, '#8a5a3a', 2, lift - 60, w - 4, 8, .3);
    return { canvas: c };
  },
  bike(tw, th) {
    const { c, g, lift } = make(tw, th, 20);
    for (const x of [6, 25]) { disc(g, '#1d1c1a', x, lift + 18, 6, 6); disc(g, '#3a3833', x, lift + 18, 4, 4); disc(g, '#1d1c1a', x, lift + 18, 1, 1); }
    line(g, '#7a3a2a', 6, lift + 18, 14, lift + 10); line(g, '#7a3a2a', 14, lift + 10, 25, lift + 18); line(g, '#7a3a2a', 14, lift + 10, 22, lift + 10); line(g, '#7a3a2a', 22, lift + 10, 25, lift + 18);
    rect(g, '#2a2826', 11, lift + 7, 6, 2); rect(g, '#2a2826', 21, lift + 6, 5, 1);
    rect(g, '#6b6450', 18, lift + 11, 9, 5);
    return { canvas: c };
  },
  'veg-boxes'(tw, th) {
    const { c, g, lift } = make(tw, th, 16), w = tw * T;
    for (let i = 0; i < tw; i++) {
      const x = 2 + i * 32;
      box(g, lift, { x, y: 10, w: 28, d: 18, h: 10 }, '#4a3c2e', '#dcdad2');
      for (let k = 0; k < 6; k++) { const px = x + 3 + Math.floor(hash(i, k, 2) * 22), py = lift - 10 + 12 + Math.floor(hash(k, i, 3) * 12); rect(g, '#5d8a46', px, py, 3, 3); dot(g, '#86b85a', px + 1, py); }
    }
    void w;
    return { canvas: c };
  },
  'net-rack'(tw, th) {
    const { c, g, lift } = make(tw, th, 40), w = tw * T;
    rect(g, '#5a4a38', 2, lift - 34, 2, 58); rect(g, '#5a4a38', w - 4, lift - 34, 2, 58); rect(g, '#6e5c46', 2, lift - 34, w - 4, 2);
    for (let x = 4; x < w - 4; x += 2) for (let y = lift - 32; y < lift + 14 - (x % 7); y += 2) if ((x + y) % 4 === 0) dot(g, '#7a8a6a', x, y);
    for (let i = 0; i < 4; i++) disc(g, '#d86a2a', 10 + i * 14, lift + 2 + (i % 2) * 6, 3, 3);
    return { canvas: c };
  },
  buoys(tw, th) {
    const { c, g, lift } = make(tw, th, 36), w = tw * T;
    rect(g, '#4a4743', 4, lift - 30, 2, 54); rect(g, '#4a4743', w - 6, lift - 30, 2, 54); rect(g, '#5a5650', 4, lift - 30, w - 8, 2);
    for (let i = 0; i < 5; i++) { const x = 12 + i * 10, y = lift - 22 + (i % 2) * 5; line(g, '#2a2826', x, lift - 28, x, y - 4); disc(g, i % 2 ? '#e0742a' : '#e8e2d0', x, y, 4, 5); dot(g, '#ffffff', x - 1, y - 2); }
    return { canvas: c };
  },
  'deploy-board'(tw, th) {
    const { c, g, lift } = make(tw, th, 44);
    rect(g, '#4a3f30', 5, lift - 6, 2, 34); rect(g, '#4a3f30', 25, lift - 6, 2, 34);
    rect(g, '#25302b', 1, lift - 40, 30, 34); rect(g, '#6b5a40', 1, lift - 40, 30, 2); rect(g, '#6b5a40', 1, lift - 8, 30, 2);
    for (let i = 0; i < 5; i++) { rect(g, '#d8d2bd', 4, lift - 34 + i * 5, 4, 1); rect(g, '#d8d2bd', 10, lift - 34 + i * 5, 6 + (i * 7) % 12, 1); }
    rect(g, '#c25a3a', 24, lift - 36, 4, 4);
    return { canvas: c };
  },
  laundry(tw, th) {
    const { c, g, lift } = make(tw, th, 56), w = tw * T;
    rect(g, '#3a3632', 2, lift - 50, 2, 72); rect(g, '#3a3632', w - 4, lift - 50, 2, 72);
    for (let x = 4; x < w - 4; x++) dot(g, '#6a665e', x, lift - 46 + Math.round(Math.sin((x / (w - 8)) * Math.PI) * 3));
    const cloth = ['#4f6a86', '#c9c3b0', '#8a4a3a', '#5a7356', '#d0b070'];
    for (let i = 0; i < 6; i++) { const x = 8 + i * 14, y = lift - 45 + Math.round(Math.sin(((x - 4) / (w - 8)) * Math.PI) * 3); rect(g, cloth[i % 5], x, y, 9, 10 + (i % 3) * 3); rect(g, shade(cloth[i % 5], -.2), x, y + 8 + (i % 3) * 3, 9, 2); }
    return { canvas: c };
  },
  boat(tw, th) {
    const { c, g, lift } = make(tw, th, 22), w = tw * T;
    // Small fibreglass fishing boat, tarp over the bow, an outboard motor.
    const y0 = lift + 6;
    for (let x = 0; x < w - 6; x++) { const k = Math.abs(x - (w - 6) / 2) / ((w - 6) / 2), hgt = Math.round(14 - k * k * 6); rect(g, '#c9c3b0', x + 3, y0 + 2 + (14 - hgt), 1, hgt); dot(g, '#e2ddd0', x + 3, y0 + 2 + (14 - hgt)); }
    rect(g, '#2f5f7a', 6, y0 + 12, w - 12, 3);
    rect(g, '#4a3f30', 14, y0 + 4, w - 28, 8); rect(g, '#5a4d3a', 14, y0 + 4, w - 28, 1);
    rect(g, '#3b5a74', 8, y0, 26, 8); speckle(g, ['#2f4a60', '#4a6a86'], 8, y0, 26, 8, 18, 3);
    rect(g, '#2a2826', w - 10, y0 - 2, 8, 14); rect(g, '#3a3734', w - 9, y0 - 2, 6, 3);
    return { canvas: c };
  },
  bollard(tw, th) {
    const { c, g, lift } = make(tw, th, 14);
    rect(g, '#3a3d3c', 12, lift + 10, 8, 10); disc(g, '#4a4e4c', 16, lift + 10, 5, 3); line(g, '#a49270', 18, lift + 14, 30, lift + 24);
    return { canvas: c };
  },
  hull(tw, th) {
    // Old wooden fishing boat hauled up on blocks, bow to the north, a tarp over the stern.
    const { c, g, lift } = make(tw, th, 22), w = tw * T, h = th * T;
    for (const y of [lift + 20, lift + h - 22]) { rect(g, '#4a3f30', 8, y, 10, 8); rect(g, '#4a3f30', w - 18, y, 10, 8); }
    const cx = w / 2, top = 6, bot = h - 8;
    for (let y = top; y < bot; y++) {
      const t = (y - top) / (bot - top), half = Math.round((t < .3 ? Math.sin(t / .3 * Math.PI / 2) : 1 - Math.max(0, t - .85) * 1.6) * (w / 2 - 5));
      if (half < 1) continue;
      rect(g, '#2f4a5a', cx - half, y + lift - 14, half * 2, 1);
      rect(g, '#d8d2bd', cx - half, y + lift - 14, 2, 1); rect(g, '#d8d2bd', cx + half - 2, y + lift - 14, 2, 1);
      if (y % 6 === 0) rect(g, '#5a4632', cx - half + 3, y + lift - 14, half * 2 - 6, 1);
    }
    rect(g, '#4f3c2c', cx - 1, top + lift - 12, 2, bot - top - 4);
    for (let y = top + 10; y < bot - 6; y++) { const k = y - top - 10; rect(g, '#2a3e4c', 5, lift + y + 4, 2, 1); if (k % 4 < 2) dot(g, '#8a5a3a', 6, lift + y + 4); }
    // front face of the hull (port side seen from the south), peeling blue paint
    rect(g, '#244050', 6, lift + bot - 14, w - 12, 12); rect(g, '#d8d2bd', 6, lift + bot - 14, w - 12, 2); speckle(g, ['#8a5a3a', '#c9c3b0', '#1d3440'], 6, lift + bot - 12, w - 12, 10, 20, 4);
    rect(g, '#5d6a5a', 6, lift + 50, w - 12, 40); speckle(g, ['#4a5648', '#6e7a68'], 6, lift + 50, w - 12, 40, 40, 6); rect(g, '#7a8670', 6, lift + 50, w - 12, 1);
    return { canvas: c };
  },
  'cafe-table'(tw, th) {
    const { c, g, lift } = make(tw, th, 18), w = tw * T;
    for (const [x, y] of [[4, 6], [w - 14, 6], [6, 22], [w - 16, 22]]) { rect(g, '#2f6a8c', x, lift + y, 10, 7); rect(g, '#3d7fa0', x, lift + y, 10, 2); rect(g, '#244e66', x + 1, lift + y + 7, 2, 3); rect(g, '#244e66', x + 7, lift + y + 7, 2, 3); }
    box(g, lift, { x: 14, y: 8, w: w - 28, d: 14, h: 14 }, '#c94a3a', '#9a3a2c');
    rect(g, '#e8e2d0', 20, lift - 14 + 10, 6, 4); rect(g, '#8a8a80', 30, lift - 14 + 9, 4, 6);
    return { canvas: c };
  },
  'hand-cart'(tw, th) {
    const { c, g, lift } = make(tw, th, 20);
    box(g, lift, { x: 4, y: 8, w: 22, d: 14, h: 10 }, '#6a5a44', '#4f4232');
    disc(g, '#1d1c1a', 8, lift + 26, 4); disc(g, '#1d1c1a', 22, lift + 26, 4); line(g, '#4f4232', 26, lift + 6, 31, lift - 2);
    rect(g, '#2f6a8c', 7, lift - 10 + 8, 9, 6); rect(g, '#c25a3a', 16, lift - 10 + 9, 8, 5);
    return { canvas: c };
  },
  'tarp-pile'(tw, th) {
    const { c, g, lift } = make(tw, th, 22), w = tw * T;
    for (let x = 2; x < w - 2; x++) { const k = Math.sin((x - 2) / (w - 4) * Math.PI), hh = Math.round(8 + k * 14 + Math.sin(x * .5) * 2); rect(g, x % 9 < 1 ? '#2f4a5e' : '#3d5d74', x, lift + 24 - hh, 1, hh + 4); }
    speckle(g, ['#4a6a86', '#2a4050'], 2, lift + 2, w - 4, 26, 40, 5); rect(g, '#1d2a32', 2, lift + 27, w - 4, 2);
    line(g, '#c9b48a', 6, lift + 10, w - 8, lift + 16); line(g, '#c9b48a', 10, lift + 22, w - 14, lift + 8);
    return { canvas: c };
  },
  baskets(tw, th) {
    const { c, g, lift } = make(tw, th, 16);
    for (const [x, y] of [[4, 10], [14, 16]]) { disc(g, '#8a7450', x + 6, lift + y + 6, 7, 5); disc(g, '#6a5a3c', x + 6, lift + y + 4, 6, 3); for (let i = 0; i < 3; i++) rect(g, '#b8c4c0', x + 3 + i * 3, lift + y + 2, 2, 2); }
    return { canvas: c };
  },
  'door-leaf'(tw, th) { return doorLeaf(tw, th, '#5d6a62', false); },
  'door-leaf-wood'(tw, th) { return doorLeaf(tw, th, '#7a5c40', false); },
  'door-leaf-west'(tw, th) { return doorLeaf(tw, th, '#5d6a62', true); },
  barrier(tw, th) {
    const { c, g, lift } = make(tw, th, 22), h = th * T;
    box(g, lift, { x: 6, y: 4, w: 20, d: h - 8, h: 16 }, '#bfb9a8', '#8a8476');
    for (let y = lift - 16 + h - 4; y < lift + h - 4; y += 6) rect(g, '#b9442e', 6, y, 20, 3);
    return { canvas: c };
  },
};

/** A side door swung open into the room, standing at the north jamb and facing the camera (F01). */
function doorLeaf(tw: number, th: number, paint: string, west: boolean): PropArt {
  const { c, g, lift } = make(tw, th, 48), x0 = west ? 8 : 0, w = 24, top = lift + 3 - 44;
  rect(g, shade(paint, .15), x0, top, w, 3); // the leaf's top edge
  rect(g, paint, x0, top + 3, w, 44); rect(g, shade(paint, .1), x0, top + 3, w, 1);
  for (const py of [top + 7, top + 26]) { rect(g, shade(paint, -.18), x0 + 4, py, w - 8, 15); rect(g, shade(paint, .08), x0 + 4, py, w - 8, 1); }
  rect(g, shade(paint, -.35), west ? x0 + w - 1 : x0, top + 3, 1, 44); // hinge side
  rect(g, '#c9b06a', west ? x0 + 3 : x0 + w - 5, top + 24, 2, 4); // handle
  ditherRect(g, '#3a3530', x0, top + 40, w, 7, .3);
  return { canvas: c };
}

function gearTable(tw: number, th: number, lantern: boolean): PropArt {
  const { c, g, lift } = make(tw, th, 30), w = tw * T;
  box(g, lift, { x: 2, y: 4, w: w - 4, d: 22, h: 14 }, '#7d8487', '#5c6366');
  const ty = lift - 14 + 4;
  // Laid-out kit: a backpack, a pistol on cloth, bandage rolls, a water bottle, a map.
  rect(g, '#5a5a44', 8, ty + 3, 18, 15); rect(g, '#6c6c52', 8, ty + 3, 18, 3); rect(g, '#4a4a38', 12, ty + 9, 10, 6);
  rect(g, '#c4bca0', 32, ty + 6, 18, 10); rect(g, '#4a4e4f', 34, ty + 9, 12, 3); rect(g, '#3a3d3e', 42, ty + 11, 3, 3);
  disc(g, '#e2ddd0', 58, ty + 9, 3); disc(g, '#e2ddd0', 64, ty + 12, 3);
  rect(g, '#8fb0c0', 72, ty + 4, 5, 12); rect(g, '#5a7a8a', 73, ty + 3, 3, 2);
  rect(g, '#d8d0b0', 80, ty + 6, 12, 10); line(g, '#8a4a3a', 82, ty + 8, 90, ty + 13);
  let glow: HTMLCanvasElement | undefined;
  if (lantern) {
    rect(g, '#3a3632', 50, ty - 6, 8, 10); rect(g, '#ffd27a', 51, ty - 4, 6, 6); rect(g, '#2a2826', 52, ty - 9, 4, 3);
    const gl = canvas(c.width, c.height); rect(gl.g, '#ffd27a', 50, ty - 5, 8, 8); glow = gl.c;
  }
  return { canvas: c, glow };
}

function steelTable(tw: number, th: number, kit: boolean): PropArt {
  const { c, g, lift } = make(tw, th, 22), w = tw * T;
  box(g, lift, { x: 2, y: 4, w: w - 4, d: 22, h: 16 }, '#b6bdbe', '#848b8c');
  const ty = lift - 16 + 4;
  rect(g, '#98a0a1', 4, ty + 2, w - 8, 1);
  if (kit) {
    // Bandage rolls being cut, a scale, jars of boiled water.
    for (let i = 0; i < 4; i++) disc(g, '#ece7d8', 12 + i * 8, ty + 10, 3);
    rect(g, '#5a6264', 50, ty + 6, 14, 10); rect(g, '#3a3f40', 52, ty + 8, 10, 2);
    for (let i = 0; i < 3; i++) { rect(g, '#cfe6ea', 72 + i * 6, ty + 5, 4, 9); rect(g, '#8fb8c0', 72 + i * 6, ty + 10, 4, 4); }
  } else {
    ditherRect(g, '#7a5a3a', 6, ty + 4, w - 12, 14, .25);
    rect(g, '#5a6264', 40, ty + 8, 16, 6);
  }
  return { canvas: c };
}

export function paintProp(kind: string, tw: number, th: number): PropArt {
  const p = P[kind];
  if (!p) { const { c, g } = canvas(tw * T, th * T + 8); rect(g, '#ff00ff', 0, 8, tw * T, th * T); return { canvas: c }; }
  return p(tw, th);
}
