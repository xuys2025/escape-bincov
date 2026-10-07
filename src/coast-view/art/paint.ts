
export const P = {
  ink: '#242321', char: '#393733', asphalt: '#4b4842', concrete: '#777268', dry: '#a49b88',
  dust: '#75634e', rust: '#784d3d', rustLight: '#a27351', deepWater: '#394b50', waterLine: '#687b7b',
  moss: '#59604a', lamp: '#c3a26a', label: '#c9c0ac',
  asphaltDark: '#3f3c37', asphaltLight: '#57534c', asphaltPatch: '#46433d',
  concreteDark: '#5f5b53', concreteDeep: '#4d4a44', concreteLight: '#8a8478', concreteTop: '#99927f',
  plaster: '#867f70', plasterLight: '#968e7d', plasterDark: '#6b655a',
  yard: '#5c5448', yardDark: '#4c463c', yardLight: '#6b6253', gravel: '#7a7062',
  tileA: '#7a7466', tileB: '#736d5f', grout: '#504b42', tileDirt: '#655f52',
  wood: '#6b5440', woodDark: '#4f3d2f', woodLight: '#86694d', woodSeam: '#3a2e25',
  roof: '#5e5a52', roofDark: '#46433d', roofLight: '#77726a', tar: '#3c3a35',
  glass: '#2e3a3c', glassLight: '#5d7272', glassShine: '#8fa3a0',
  skin: '#a8826a', skinDark: '#82614f',
  void: '#121110',
} as const;

export type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.imageSmoothingEnabled = false;
  return { c, g };
}

export const rect = (g: Ctx, color: string, x: number, y: number, w: number, h: number) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
export const dot = (g: Ctx, color: string, x: number, y: number) => rect(g, color, x, y, 1, 1);

export function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function disc(g: Ctx, color: string, cx: number, cy: number, rx: number, ry = rx) {
  g.fillStyle = color;
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++)
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
}

export function line(g: Ctx, color: string, x0: number, y0: number, x1: number, y1: number) {
  g.fillStyle = color; x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}

export function outline(c: HTMLCanvasElement, color = P.ink, alphaCut = 10) {
  const g = c.getContext('2d', { willReadFrequently: true })!, { width: w, height: h } = c;
  const src = g.getImageData(0, 0, w, h), d = src.data, out = new Uint8ClampedArray(d);
  const [r, gg, b] = hex(color);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > alphaCut;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
      const i = (y * w + x) * 4; out[i] = r; out[i + 1] = gg; out[i + 2] = b; out[i + 3] = 255;
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
}

export function hex(color: string): [number, number, number] {
  const v = parseInt(color.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function dithered(src: HTMLCanvasElement, level: number, keepBottom = 0, ox = 0, oy = 0): HTMLCanvasElement {
  const { c, g } = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let y = 0; y < c.height - keepBottom; y++) for (let x = 0; x < c.width; x++) {
    const t = BAYER4[(((y + oy) & 3) << 2) | ((x + ox) & 3)];
    if (t >= level * 16) d[(y * c.width + x) * 4 + 3] = 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function silhouette(src: HTMLCanvasElement): HTMLCanvasElement {
  const { c, g } = canvas(src.width, src.height);
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; rect(g, '#ffffff', 0, 0, c.width, c.height);
  return c;
}

export function rim(src: HTMLCanvasElement): HTMLCanvasElement {
  const { c, g } = canvas(src.width + 2, src.height + 2);
  g.drawImage(src, 1, 1);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data, out = new Uint8ClampedArray(d.length);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < c.width && y < c.height && d[(y * c.width + x) * 4 + 3] > 10;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (solid(x, y)) { if ((x + y) % 2 === 0) { out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = 90; } continue; }
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) { out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = 255; }
  }
  g.putImageData(new ImageData(out, c.width, c.height), 0, 0);
  return c;
}

export function radialLight(radius: number, steps = 6, color = '#ffffff'): HTMLCanvasElement {
  const size = radius * 2, { c, g } = canvas(size, size), [r, gg, b] = hex(color);
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = Math.hypot(x + .5 - radius, y + .5 - radius) / radius;
    if (t >= 1) continue;
    const f = Math.pow(1 - t, 1.6);
    const dither = (BAYER4[((y & 3) << 2) | (x & 3)] / 16 - .5) / steps;
    const q = Math.max(0, Math.round((f + dither) * steps) / steps);
    const i = (y * size + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = Math.round(q * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}
