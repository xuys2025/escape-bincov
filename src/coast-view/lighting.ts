import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapDef, Point, Rect } from '../raid-runtime/contract';
import { hasRoof } from './appearance';
import { hash, hex, radialLight } from './art/paint';
import type { Textures } from './textures';

/** `flicker`: a stable seed; lamps with one dip and waver as a stateless function of view time (see `level`). */
export interface Light { x: number; y: number; r: number; color: number; k: number; ttl?: number; age?: number; region?: string | null; flicker?: number }
export interface Mood { outdoor: number; indoor: number; ruined: number; cellar: number; name: string }
export const MOODS: Mood[] = [
  { name: 'overcast', outdoor: 0xeeede4, indoor: 0x9a9488, ruined: 0xcfcabe, cellar: 0x837e74 },
  { name: 'dusk', outdoor: 0x8e8a96, indoor: 0x58566a, ruined: 0x75727f, cellar: 0x4c4a5a },
];

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Ambient samples per world pixel: one sample every 8 px, drawn with linear filtering (soft, wall-shaped transitions). */
const AMB = 8;

/**
 * Light for one view. The ambient term is a low-resolution map baked per map and mood: open ground takes the sky,
 * roofed interiors the indoor level and roofless ruins sit between, blurred a little so light spills through doorways
 * and fades into rooms instead of stopping at a hard rectangle. Lamps, muzzle flashes and sparks are additive dithered
 * sprites on top. The ground multiplies by the rendered layer; upright sprites are tinted by `at`, which samples the
 * same map, so a wall and the floor in front of it agree.
 */
export class Lighting {
  readonly layer = new Container();
  private backdrop = new Graphics();
  private base = new Sprite();
  private dynamic = new Container();
  private pool: Sprite[] = [];
  lights: Light[] = [];
  mood: Mood = MOODS[0];
  private lightTex: Texture;
  private map: MapDef | null = null;
  private amb: { w: number; h: number; r: Float32Array; g: Float32Array; b: Float32Array } | null = null;
  private baseSource: CanvasSource | null = null;
  private time = 0;

  constructor(tex: Textures) {
    this.lightTex = tex.ensure('light:radial', () => radialLight(64, 6));
    this.layer.addChild(this.backdrop, this.base, this.dynamic);
  }

  setMap(m: MapDef) { this.map = m; this.bakeAmbient(); }
  setMood(i: number, _bounds?: Rect) { this.mood = MOODS[i % MOODS.length]; if (this.map) this.bakeAmbient(); }

  private bakeAmbient() {
    const m = this.map!, b = m.bounds, w = Math.ceil(b.w / AMB), h = Math.ceil(b.h / AMB), mood = this.mood;
    const coast = m.key.mapId === 'coast', cellar = m.key.mapId.endsWith('-b1');
    const [or, og, ob] = rgb(mood.outdoor), [ir, ig, ib] = rgb(cellar ? mood.cellar : mood.indoor), [rr, rg, rb] = rgb(mood.ruined);
    const r = new Float32Array(w * h), g = new Float32Array(w * h), bl = new Float32Array(w * h);
    const roofed = coast ? m.buildings.filter(q => hasRoof(m, q)) : [], ruins = coast ? m.buildings.filter(q => !hasRoof(m, q)) : [];
    const inside = (list: typeof roofed, x: number, y: number) => list.some(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = b.x + x * AMB + AMB / 2, wy = b.y + y * AMB + AMB / 2, i = y * w + x;
      // Layered floors are interiors throughout; on the coast, roofed footprints are indoor and roofless ruins half-shaded.
      const [cr, cg, cb] = !coast || inside(roofed, wx, wy) ? [ir, ig, ib] : inside(ruins, wx, wy) ? [rr, rg, rb] : [or, og, ob];
      r[i] = cr; g[i] = cg; bl[i] = cb;
    }
    for (let pass = 0; pass < 2; pass++) for (const ch of [r, g, bl]) blur(ch, w, h);
    this.amb = { w, h, r, g, b: bl };
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d')!, img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { img.data[i * 4] = r[i]; img.data[i * 4 + 1] = g[i]; img.data[i * 4 + 2] = bl[i]; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    this.releaseBase();
    this.baseSource = new CanvasSource({ resource: c, scaleMode: 'linear' });
    this.base.texture = this.baseTexture = new Texture({ source: this.baseSource });
    this.base.position.set(b.x, b.y); this.base.scale.set(AMB);
    this.backdrop.clear().rect(b.x - 128, b.y - 128, b.w + 256, b.h + 256).fill(coast ? mood.outdoor : cellar ? mood.cellar : mood.indoor);
  }

  /** Additive lights for this frame; `time` (view seconds) drives flicker statelessly, so a re-present is identical. */
  sync(dt: number, visible: (l: Light) => boolean, time = this.time) {
    this.time = time;
    this.lights = this.lights.filter(l => { if (l.ttl === undefined) return true; l.age = (l.age ?? 0) + dt; return l.age < l.ttl; });
    let i = 0;
    for (const l of this.lights) {
      if (!visible(l)) continue;
      const s = this.pool[i] ?? this.dynamic.addChild(Object.assign(new Sprite(this.lightTex), { blendMode: 'add' as const }));
      this.pool[i++] = s;
      s.visible = true; s.anchor.set(.5); s.position.set(Math.round(l.x), Math.round(l.y));
      s.scale.set(l.r / 64); s.tint = l.color; s.alpha = Math.min(1, l.k * this.level(l));
    }
    for (; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  /** Brightness factor of a light now: fade for short-lived ones, a slow waver and rare brief dips for flickering lamps. */
  level(l: Light): number {
    if (l.ttl) return 1 - (l.age ?? 0) / l.ttl;
    if (l.flicker === undefined) return 1;
    const t = this.time, s = l.flicker;
    const waver = 1 - .06 * (Math.sin(t * 2.3 + s * 7) * .6 + Math.sin(t * 5.9 + s * 3) * .4);
    const tick = Math.floor(t * 9), dip = hash(tick, s * 131 | 0, 9) < .035 ? .45 : 1;
    return waver * dip;
  }

  /** Ambient at a world point (bilinear on the baked map; open sky outside the map) plus every visible light. */
  at(p: Point, _region: string | null | undefined, revealed: Record<string, boolean>, _indoorHint = false): number {
    let r: number, g: number, b: number;
    const a = this.amb, m = this.map;
    if (!a || !m || p.x < m.bounds.x || p.y < m.bounds.y || p.x >= m.bounds.x + m.bounds.w || p.y >= m.bounds.y + m.bounds.h) {
      [r, g, b] = rgb(this.mood.outdoor);
    } else {
      const fx = Math.max(0, Math.min(a.w - 1.001, (p.x - m.bounds.x) / AMB - .5)), fy = Math.max(0, Math.min(a.h - 1.001, (p.y - m.bounds.y) / AMB - .5));
      const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(a.w - 1, x0 + 1), y1 = Math.min(a.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const s = (ch: Float32Array) => (ch[y0 * a.w + x0] * (1 - tx) + ch[y0 * a.w + x1] * tx) * (1 - ty) + (ch[y1 * a.w + x0] * (1 - tx) + ch[y1 * a.w + x1] * tx) * ty;
      r = s(a.r); g = s(a.g); b = s(a.b);
    }
    for (const l of this.lights) {
      if (l.region && revealed[l.region] === false) continue;
      const d = Math.hypot(l.x - p.x, l.y - p.y);
      if (d >= l.r) continue;
      const f = Math.pow(1 - d / l.r, 1.6) * l.k * this.level(l), [lr, lg, lb] = rgb(l.color);
      r += lr * f; g += lg * f; b += lb * f;
    }
    return (Math.min(255, r | 0) << 16) | (Math.min(255, g | 0) << 8) | Math.min(255, b | 0);
  }

  /** The baked ambient texture is this object's own (never the shared empty texture a fresh Sprite starts with). */
  private releaseBase() {
    if (this.baseTexture) { this.base.texture = Texture.EMPTY; this.baseTexture.destroy(false); this.baseTexture = null; }
    this.baseSource?.destroy(); this.baseSource = null;
  }
  private baseTexture: Texture | null = null;
  destroy() { this.releaseBase(); }
}

/** In-place 3x3 box blur with clamped edges. */
function blur(ch: Float32Array, w: number, h: number) {
  const src = ch.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += src[Math.min(h - 1, Math.max(0, y + j)) * w + Math.min(w - 1, Math.max(0, x + i))];
    ch[y * w + x] = s / 9;
  }
}

export const lamp = (x: number, y: number, region: string | null, color = 0xc3a26a): Light => ({ x, y, r: 110, color, k: .55, region });
export { hex };
