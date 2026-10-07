/**
 * Shared title pixel grid. Every imported layer is resampled onto ONE global
 * 640x360 grid (1.5 logical pixels per art pixel) and mapped to ONE palette
 * extracted from the layers themselves, so all depth planes share pixel size,
 * grid phase and colours. Runtime textures store 2 texels per logical pixel,
 * which makes one art pixel exactly 3x3 texels at any layer position.
 */
import type { RGBA } from './png';

export const GRID = 1.5;
export const RES = 2;
export const COLS = 640, ROWS = 360;

type Lab = [number, number, number];
const toLin = (v: number) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const toSrgb = (v: number) => { v = v <= .0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - .055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
function oklab(r: number, g: number, b: number): Lab {
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function rgb([L, a, b]: Lab): [number, number, number] {
    const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
    return [toSrgb(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s), toSrgb(-.0041960863 * l - .7034186147 * m + 1.707614701 * s)];
}
const d2 = (p: Lab, q: Lab) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
const hex = (c: string): Lab => { const n = parseInt(c.slice(1), 16); return oklab(toLin(n >> 16), toLin((n >> 8) & 255), toLin(n & 255)); };

/** A registered source: `src` rectangle (source pixels) ↔ `area` rectangle (logical scene pixels). */
export type Region = { src: RGBA; sx: number; sy: number; sw: number; sh: number; lx: number; ly: number; lw: number; lh: number };

/** Cells of one layer, addressed by global grid coordinates. Alpha is binary. */
export class Cells {
    readonly lab: Float64Array;
    readonly solid: Uint8Array;
    index: Int16Array;
    constructor(readonly gx: number, readonly gy: number, readonly w: number, readonly h: number) {
        this.lab = new Float64Array(w * h * 3); this.solid = new Uint8Array(w * h); this.index = new Int16Array(w * h).fill(-1);
    }
    has(x: number, y: number) { return x >= this.gx && y >= this.gy && x < this.gx + this.w && y < this.gy + this.h; }
    at(x: number, y: number) { return (y - this.gy) * this.w + (x - this.gx); }
}

/** Area-average (linear light, premultiplied) of the source under every grid cell the region touches. */
export function sample(r: Region, sharpen = .5): Cells {
    const gx0 = Math.floor(r.lx / GRID), gy0 = Math.floor(r.ly / GRID);
    const gx1 = Math.ceil((r.lx + r.lw) / GRID), gy1 = Math.ceil((r.ly + r.lh) / GRID);
    const cells = new Cells(gx0, gy0, gx1 - gx0, gy1 - gy0);
    const lin = new Float64Array(cells.w * cells.h * 3), cover = new Float64Array(cells.w * cells.h);
    const kx = r.sw / r.lw, ky = r.sh / r.lh, s = r.src;
    for (let cy = 0; cy < cells.h; cy++) for (let cx = 0; cx < cells.w; cx++) {
        // Cell rectangle clipped to the registered area: partial edge cells use only real content.
        const ax = Math.max(r.lx, (gx0 + cx) * GRID), bx = Math.min(r.lx + r.lw, (gx0 + cx + 1) * GRID);
        const ay = Math.max(r.ly, (gy0 + cy) * GRID), by = Math.min(r.ly + r.lh, (gy0 + cy + 1) * GRID);
        const sx0 = Math.floor(r.sx + (ax - r.lx) * kx), sx1 = Math.max(sx0 + 1, Math.ceil(r.sx + (bx - r.lx) * kx));
        const sy0 = Math.floor(r.sy + (ay - r.ly) * ky), sy1 = Math.max(sy0 + 1, Math.ceil(r.sy + (by - r.ly) * ky));
        let R = 0, G = 0, B = 0, A = 0, n = 0;
        for (let y = Math.max(0, sy0); y < Math.min(s.h, sy1); y++) for (let x = Math.max(0, sx0); x < Math.min(s.w, sx1); x++) {
            const p = (y * s.w + x) * 4, a = s.data[p + 3] / 255;
            R += toLin(s.data[p]) * a; G += toLin(s.data[p + 1]) * a; B += toLin(s.data[p + 2]) * a; A += a; n++;
        }
        const i = cy * cells.w + cx;
        cover[i] = n ? A / n : 0;
        if (A > 0) { lin[i * 3] = R / A; lin[i * 3 + 1] = G / A; lin[i * 3 + 2] = B / A; }
        cells.solid[i] = cover[i] >= .5 ? 1 : 0;
    }
    // Light unsharp mask among solid cells restores edges lost to area averaging.
    for (let cy = 0; cy < cells.h; cy++) for (let cx = 0; cx < cells.w; cx++) {
        const i = cy * cells.w + cx;
        if (!cells.solid[i]) continue;
        const v = [0, 0, 0]; let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx, y = cy + dy, j = y * cells.w + x;
            if (x < 0 || y < 0 || x >= cells.w || y >= cells.h || !cells.solid[j]) continue;
            v[0] += lin[j * 3]; v[1] += lin[j * 3 + 1]; v[2] += lin[j * 3 + 2]; n++;
        }
        const c = [0, 1, 2].map(k => Math.max(0, lin[i * 3 + k] + sharpen * (lin[i * 3 + k] - v[k] / n)));
        cells.lab.set(oklab(c[0], c[1], c[2]), i * 3);
    }
    return cells;
}

/** Deterministic k-means++ in OKLab over solid cells of every layer, plus reserved accent colours. */
export function extractPalette(layers: Cells[], colours: number, reserved: string[], seed = 7) {
    let a = seed >>> 0;
    const rand = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    const sample: Lab[] = [];
    let k = 0;
    for (const c of layers) for (let i = 0; i < c.solid.length; i++) if (c.solid[i] && (k++ % 3 === 0)) sample.push([c.lab[i * 3], c.lab[i * 3 + 1], c.lab[i * 3 + 2]]);
    const cents: Lab[] = [sample[Math.floor(rand() * sample.length)]];
    const dist = sample.map(p => d2(p, cents[0]));
    while (cents.length < colours) {
        let t = rand() * dist.reduce((s, v) => s + v, 0), i = 0;
        for (; i < sample.length - 1 && t > dist[i]; i++) t -= dist[i];
        const c = sample[i]; cents.push(c);
        for (let j = 0; j < sample.length; j++) dist[j] = Math.min(dist[j], d2(sample[j], c));
    }
    for (let it = 0; it < 14; it++) {
        const acc = cents.map(() => [0, 0, 0, 0]);
        for (const p of sample) { let best = 0, bd = Infinity; for (let j = 0; j < cents.length; j++) { const d = d2(p, cents[j]); if (d < bd) { bd = d; best = j; } } const s = acc[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }
        acc.forEach((s, j) => { if (s[3]) cents[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    cents.sort((p, q) => p[0] - q[0]);
    const all = [...cents, ...reserved.map(hex)];
    return { lab: all, rgb: all.map(rgb), reservedFrom: cents.length };
}

export type Palette = ReturnType<typeof extractPalette>;

/** Nearest palette entry for each solid cell (reserved accents are for hand passes only). */
export function quantize(c: Cells, pal: Palette) {
    for (let i = 0; i < c.solid.length; i++) {
        if (!c.solid[i]) { c.index[i] = -1; continue; }
        const p: Lab = [c.lab[i * 3], c.lab[i * 3 + 1], c.lab[i * 3 + 2]];
        let best = 0, bd = Infinity;
        for (let j = 0; j < pal.reservedFrom; j++) { const d = d2(p, pal.lab[j]); if (d < bd) { bd = d; best = j; } }
        c.index[i] = best;
    }
}

/** Merge isolated cells (no 8-neighbour of the same colour) into the closest frequent neighbour. Highlights stay. */
export function clean(c: Cells, pal: Palette, passes = 2) {
    for (let pass = 0; pass < passes; pass++) {
        const next = c.index.slice();
        for (let y = 1; y < c.h - 1; y++) for (let x = 1; x < c.w - 1; x++) {
            const i = y * c.w + x, me = c.index[i];
            if (me < 0) continue;
            const counts = new Map<number, number>(); let same = 0, brightest = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const n = c.index[i + dy * c.w + dx];
                if (n < 0) continue;
                if (n === me) same++;
                counts.set(n, (counts.get(n) ?? 0) + 1); brightest = Math.max(brightest, pal.lab[n][0]);
            }
            if (same || !counts.size || pal.lab[me][0] > brightest + .1) continue;
            let best = me, score = Infinity;
            for (const [n, k] of counts) { const s = d2(pal.lab[n], pal.lab[me]) / k; if (s < score) { score = s; best = n; } }
            next[i] = best;
        }
        c.index = next;
    }
}

/** Painter on global grid coordinates. Colours snap to the shared palette (including reserved accents). */
export function painter(c: Cells, pal: Palette) {
    const cache = new Map<string, number>();
    const pick = (col: string) => {
        let j = cache.get(col);
        if (j === undefined) { const p = hex(col); let bd = Infinity; j = 0; pal.lab.forEach((q, k) => { const d = d2(p, q); if (d < bd) { bd = d; j = k; } }); cache.set(col, j); }
        return j;
    };
    const px = (col: string, x: number, y: number) => { if (c.has(x, y)) { const i = c.at(x, y); c.index[i] = pick(col); c.solid[i] = 1; } };
    const rect = (col: string, x: number, y: number, w: number, h: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(col, xx, yy); };
    const line = (col: string, x0: number, y0: number, x1: number, y1: number) => {
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
        for (;;) { px(col, x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    };
    return { px, rect, line };
}

/**
 * Expand cells to a runtime texture of `w`x`h` logical pixels at `RES` texels each.
 * Texel centres outside the registered area clamp to it, which extrudes the edge
 * art pixels into parallax margins exactly like the previous preparation did.
 */
export function texture(c: Cells, pal: Palette, area: { lx: number; ly: number; lw: number; lh: number }, x: number, y: number, w: number, h: number): RGBA {
    const W = w * RES, H = h * RES, data = new Uint8Array(W * H * 4);
    const clampX = (v: number) => Math.min(area.lx + area.lw - 1e-6, Math.max(area.lx, v));
    const clampY = (v: number) => Math.min(area.ly + area.lh - 1e-6, Math.max(area.ly, v));
    for (let j = 0; j < H; j++) {
        const gy = Math.min(c.gy + c.h - 1, Math.max(c.gy, Math.floor(clampY(y + (j + .5) / RES) / GRID)));
        for (let i = 0; i < W; i++) {
            const gx = Math.min(c.gx + c.w - 1, Math.max(c.gx, Math.floor(clampX(x + (i + .5) / RES) / GRID)));
            const k = c.index[c.at(gx, gy)];
            if (k < 0) continue;
            const o = (j * W + i) * 4, col = pal.rgb[k];
            data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
        }
    }
    return { w: W, h: H, data };
}
