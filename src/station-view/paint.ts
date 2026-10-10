/** Canvas painting helpers for the procedural placeholder art (1 world px = 1 canvas px). */
export type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d', { willReadFrequently: true })!; g.imageSmoothingEnabled = false;
  return { c, g };
}

export const rect = (g: Ctx, color: string, x: number, y: number, w: number, h: number) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
export const dot = (g: Ctx, color: string, x: number, y: number) => rect(g, color, x, y, 1, 1);

export function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function line(g: Ctx, color: string, x0: number, y0: number, x1: number, y1: number) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; g.fillStyle = color;
  for (;;) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function disc(g: Ctx, color: string, cx: number, cy: number, rx: number, ry = rx) {
  g.fillStyle = color;
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++)
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
}

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER4[(y & 3) * 4 + (x & 3)] + .5) / 16;

/** Parse '#rrggbb' to [r,g,b]. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Mix two '#rrggbb' colours. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
export const shade = (c: string, k: number) => k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k);

/** Fill a rect with two-colour ordered dither at density t (0..1). */
export function ditherRect(g: Ctx, color: string, x: number, y: number, w: number, h: number, t: number) {
  g.fillStyle = color;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bayer(x + i, y + j) < t) g.fillRect(x + i, y + j, 1, 1);
}

/** Speckle noise: n random dots of the given colours inside a rect, deterministic by seed. */
export function speckle(g: Ctx, colors: string[], x: number, y: number, w: number, h: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const px = x + Math.floor(hash(i, seed, 1) * w), py = y + Math.floor(hash(seed, i, 2) * h);
    dot(g, colors[i % colors.length], px, py);
  }
}

/** One-pixel dark outline around the opaque pixels of a canvas (for sprites that must read on any floor). */
export function outline(src: HTMLCanvasElement, color = '#16140f'): HTMLCanvasElement {
  const { c, g } = canvas(src.width, src.height);
  const s = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data, w = src.width, h = src.height;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && s[(y * w + x) * 4 + 3] > 40;
  g.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g.fillRect(x, y, 1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

/** Pure-white silhouette (for highlight rims). */
export function silhouette(src: HTMLCanvasElement, color = '#ffffff'): HTMLCanvasElement {
  const { c, g } = canvas(src.width, src.height);
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Outline-only ring around opaque pixels (interaction highlight). */
export function rim(src: HTMLCanvasElement, color = '#ffe2a0'): HTMLCanvasElement {
  const w = src.width + 2, h = src.height + 2, { c, g } = canvas(w, h);
  const s = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < src.width && y < src.height && s[(y * src.width + x) * 4 + 3] > 40;
  g.fillStyle = color;
  for (let y = -1; y <= src.height; y++) for (let x = -1; x <= src.width; x++)
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g.fillRect(x + 1, y + 1, 1, 1);
  return c;
}

/** Radial light falloff, quantised into bands with ordered dither between them (pixel-art lightmap). */
export function lightFalloff(d: number, r: number): number {
  if (d >= r) return 0;
  const t = 1 - d / r;
  return t * t * (3 - 2 * t) * .85 + t * .15;
}

/** Pixel text with the embedded bitmap face (native 16 px). */
export function pixelText(g: Ctx, text: string, x: number, y: number, color: string, size = 16, align: CanvasTextAlign = 'left') {
  g.font = `${size}px "Bincov Text", "Microsoft YaHei", sans-serif`; g.textBaseline = 'top'; g.textAlign = align; g.fillStyle = color;
  g.fillText(text, Math.round(x), Math.round(y));
  // Snap anti-aliased edges to hard pixels so the canvas keeps the bitmap look on any glyph fallback.
  const m = g.measureText(text), w = Math.ceil(m.width) + 2, x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x) - 1;
  const y0 = Math.round(y) - 1, h = size + 4;
  const cw = g.canvas.width, ch = g.canvas.height, sx = Math.max(0, x0), sy = Math.max(0, y0), ex = Math.min(cw, x0 + w + 2), ey = Math.min(ch, y0 + h);
  if (ex <= sx || ey <= sy) return;
  const img = g.getImageData(sx, sy, ex - sx, ey - sy), d = img.data, [cr, cg, cb] = rgb(color);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const near = Math.abs(d[i] - cr) + Math.abs(d[i + 1] - cg) + Math.abs(d[i + 2] - cb) < 60;
    if (near && d[i + 3] < 128) d[i + 3] = 0; else if (near) d[i + 3] = 255;
  }
  g.putImageData(img, sx, sy);
}
