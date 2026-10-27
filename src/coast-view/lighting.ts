import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapDef, Point, Rect, RegionDef } from '../raid-runtime/contract';
import { hasRoof } from './appearance';
import { hash, hex, radialLight } from './art/paint';
import type { Textures } from './textures';

/** `dim`: indoors, a little darker (the mall's rooms outside the dressed route). */
export type AmbientZone = (x: number, y: number) => 'outdoor' | 'indoor' | 'drop' | 'dim';
/** `flicker`: a stable seed; lamps with one dip and waver as a stateless function of view time (see `level`). */
export interface Light { x: number; y: number; r: number; color: number; k: number; ttl?: number; age?: number; region?: string | null; flicker?: number;
  /** Every inside region at the light's point (overlapping rooms): shown only when all are revealed. */
  regions?: readonly string[];
  /** Reveal level 0..1, kept by `sync`: rises over REVEAL_FADE s while every room of the light is revealed, and drops to 0
   * in the frame one is hidden (a hidden room never shows its light). Unset until the first sync, which takes the current state. */
  lit?: number }
export interface Mood { outdoor: number; indoor: number; ruined: number; cellar: number; name: string }
export const MOODS: Mood[] = [
  { name: 'overcast', outdoor: 0xeeede4, indoor: 0x9a9488, ruined: 0xcfcabe, cellar: 0x837e74 },
  { name: 'dusk', outdoor: 0x8e8a96, indoor: 0x58566a, ruined: 0x75727f, cellar: 0x4c4a5a },
];

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Ambient samples per world pixel: one sample every 8 px, drawn with linear filtering (soft, wall-shaped transitions). */
const AMB = 8;
/**
 * Multiplied over a room the Runtime has not revealed, on floors without ceilings (mall floors, #26 F14): darker and a
 * little cooler, so an unrevealed room reads as out of sight rather than empty. The layout stays readable through it.
 */
export const UNSEEN_TINT = 0x8d96a6;
const UNSEEN_RGB = rgb(UNSEEN_TINT);
/** The multiplier of a room at reveal level `lit` (0 unrevealed .. 1 revealed): UNSEEN_TINT rising to white. */
export function unseenTint(lit: number): number {
  if (lit >= 1) return 0xffffff;
  const [r, g, b] = UNSEEN_RGB, k = (c: number) => Math.round(c + (255 - c) * lit);
  return (k(r) << 16) | (k(g) << 8) | k(b);
}
/** Seconds a room's lights take to come up once it is revealed; hiding is immediate. */
export const REVEAL_FADE = .3;
/** Next reveal level: 0 at once when hidden; a fresh light (`prev` unset) or a flash (`snap`) goes straight to 1; otherwise +dt/REVEAL_FADE. */
export function revealLevel(prev: number | undefined, on: boolean, dt: number, snap: boolean): number {
  if (!on) return 0;
  return prev === undefined || snap ? 1 : Math.min(1, prev + dt / REVEAL_FADE);
}

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
  /** Unrevealed rooms (setUnseen), multiplied over ambient and lights; `at` applies the same shade to upright sprites. */
  private shade = Object.assign(new Graphics(), { blendMode: 'multiply' as const });
  private unseen: { rooms: { id: string; lit?: number }[]; cells: (number[] | undefined)[]; cols: number; rows: number; tile: number } | null = null;
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
    this.layer.addChild(this.backdrop, this.base, this.dynamic, this.shade);
  }

  /** Ambient zone of a world point for maps the default rule gets wrong (the mall: outdoor plaza and terrace, the drop). */
  private zone: AmbientZone | null = null;
  setMap(m: MapDef, zone: AmbientZone | null = null) { this.map = m; this.zone = zone; this.bakeAmbient(); }
  setMood(i: number, _bounds?: Rect) { this.mood = MOODS[i % MOODS.length]; if (this.map) this.bakeAmbient(); }

  private bakeAmbient() {
    const m = this.map!, b = m.bounds, w = Math.ceil(b.w / AMB), h = Math.ceil(b.h / AMB), mood = this.mood;
    const coast = m.key.mapId === 'coast', cellar = m.key.mapId.endsWith('-b1');
    const [or, og, ob] = rgb(mood.outdoor), [ir, ig, ib] = rgb(cellar ? mood.cellar : mood.indoor), [rr, rg, rb] = rgb(mood.ruined);
    const zone = this.zone, drop = [or * .42, og * .44, ob * .46], dim = [ir * .78, ig * .78, ib * .8];
    const r = new Float32Array(w * h), g = new Float32Array(w * h), bl = new Float32Array(w * h);
    const roofed = coast ? m.buildings.filter(q => hasRoof(m, q)) : [], ruins = coast ? m.buildings.filter(q => !hasRoof(m, q)) : [];
    const inside = (list: typeof roofed, x: number, y: number) => list.some(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = b.x + x * AMB + AMB / 2, wy = b.y + y * AMB + AMB / 2, i = y * w + x;
      // Layered floors are interiors throughout; on the coast, roofed footprints are indoor and roofless ruins half-shaded.
      const z = zone?.(wx, wy);
      const [cr, cg, cb] = z ? z === 'outdoor' ? [or, og, ob] : z === 'drop' ? drop : z === 'dim' ? dim : [ir, ig, ib]
        : !coast || inside(roofed, wx, wy) ? [ir, ig, ib] : inside(ruins, wx, wy) ? [rr, rg, rb] : [or, og, ob];
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
    this.backdrop.clear().rect(b.x - 128, b.y - 128, b.w + 256, b.h + 256).fill(coast || zone ? mood.outdoor : cellar ? mood.cellar : mood.indoor);
  }

  /**
   * Additive lights for this frame. `time` (view seconds) drives flicker statelessly. A room's lights rise only with dt
   * and fall at once even at dt 0, so a dt-0 re-present is identical, and a reveal during a dt-0 present leaves them
   * where they were. Reduced motion ramps too: a brightness ramp is not motion.
   */
  sync(dt: number, visible: (l: Light) => boolean, time = this.time) {
    this.time = time;
    this.lights = this.lights.filter(l => { if (l.ttl === undefined) return true; l.age = (l.age ?? 0) + dt; return l.age < l.ttl; });
    let i = 0;
    for (const l of this.lights) {
      // Flashes keep their own ttl fade and are never ramped.
      l.lit = revealLevel(l.lit, visible(l), dt, l.ttl !== undefined);
      if (l.lit <= 0) continue;
      const s = this.pool[i] ?? this.dynamic.addChild(Object.assign(new Sprite(this.lightTex), { blendMode: 'add' as const }));
      this.pool[i++] = s;
      s.visible = true; s.anchor.set(.5); s.position.set(Math.round(l.x), Math.round(l.y));
      s.scale.set(l.r / 64); s.tint = l.color; s.alpha = Math.min(1, l.k * this.level(l) * l.lit);
    }
    for (; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  /**
   * Rooms to shade while unrevealed (#26 F14), or none. Only floors without ceilings ask (the mall builder's); elsewhere a
   * roof or a ceiling already covers an unrevealed room. A cell belongs to every room whose rectangle holds its centre.
   */
  setUnseen(m: MapDef, rooms: readonly RegionDef[]) {
    this.shade.clear();
    if (!rooms.length) { this.unseen = null; return; }
    const T = m.tile, cells: (number[] | undefined)[] = new Array(m.cols * m.rows);
    rooms.forEach((r, i) => {
      for (let y = Math.max(0, Math.floor(r.y / T)); y < Math.min(m.rows, Math.ceil((r.y + r.h) / T)); y++)
        for (let x = Math.max(0, Math.floor(r.x / T)); x < Math.min(m.cols, Math.ceil((r.x + r.w) / T)); x++) {
          const cx = x * T + T / 2, cy = y * T + T / 2;
          if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) (cells[y * m.cols + x] ??= []).push(i);
        }
    });
    this.unseen = { rooms: rooms.map(r => ({ id: r.id })), cells, cols: m.cols, rows: m.rows, tile: T };
  }
  /**
   * A room's shade follows its lights (`revealLevel`): it lifts over REVEAL_FADE once the room is revealed and is back at once
   * when it is hidden; the first sync takes the current state. Rooms may overlap, and a point shows only when all of its
   * rooms are revealed, so a cell takes the least revealed of them. Redrawn only when a level moved. It reads nothing but
   * `revealed`: it shows where a hidden room is (its walls and furniture are drawn anyway), never what is in it.
   */
  syncUnseen(dt: number, revealed: Readonly<Record<string, boolean>>) {
    const u = this.unseen;
    if (!u) return;
    let moved = false;
    for (const r of u.rooms) { const lit = revealLevel(r.lit, revealed[r.id] === true, dt, false); moved ||= lit !== r.lit; r.lit = lit; }
    if (!moved) return;
    const g = this.shade.clear();
    for (let y = 0; y < u.rows; y++) for (let x = 0; x < u.cols;) {
      const lit = this.cellLit(y * u.cols + x);
      let n = 1;
      while (x + n < u.cols && this.cellLit(y * u.cols + x + n) === lit) n++;
      if (lit < 1) g.rect(x * u.tile, y * u.tile, n * u.tile, u.tile).fill(unseenTint(lit));
      x += n;
    }
  }
  private cellLit(i: number): number {
    const u = this.unseen!;
    let lit = 1;
    for (const r of u.cells[i] ?? []) lit = Math.min(lit, u.rooms[r].lit ?? 1);
    return lit;
  }
  /** Multiplier of the unrevealed-room shade at a world point (white outside unrevealed rooms). */
  unseenAt(p: Point): number {
    const u = this.unseen;
    if (!u) return 0xffffff;
    const x = Math.floor(p.x / u.tile), y = Math.floor(p.y / u.tile);
    return x < 0 || y < 0 || x >= u.cols || y >= u.rows ? 0xffffff : unseenTint(this.cellLit(y * u.cols + x));
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

  /** Ambient at a world point (bilinear on the baked map; open sky outside the map) plus every visible light, under the unrevealed-room shade. */
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
      // The region gate fails closed for whatever `revealed` it gets; `lit` keeps it in step with the drawn sprite.
      if (l.region && revealed[l.region] === false || l.regions?.some(r => revealed[r] !== true) || l.lit === 0) continue;
      const d = Math.hypot(l.x - p.x, l.y - p.y);
      if (d >= l.r) continue;
      const f = Math.pow(1 - d / l.r, 1.6) * l.k * this.level(l) * (l.lit ?? 1), [lr, lg, lb] = rgb(l.color);
      r += lr * f; g += lg * f; b += lb * f;
    }
    // Clamp first, as the light layer's 8-bit target does before the shade multiplies it.
    r = Math.min(255, r | 0); g = Math.min(255, g | 0); b = Math.min(255, b | 0);
    const shade = this.unseenAt(p);
    if (shade !== 0xffffff) { const [sr, sg, sb] = rgb(shade); r = r * sr / 255 | 0; g = g * sg / 255 | 0; b = b * sb / 255 | 0; }
    return (r << 16) | (g << 8) | b;
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
