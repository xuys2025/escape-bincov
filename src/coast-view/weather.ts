/**
 * Air over the coast: a drizzle (falling streaks, ground spatter, rings on puddles and open water), drifting sea mist,
 * wind-blown scraps and glints on the sea. Every particle is a pure function of view time and the camera (world-anchored slots re-rolled per cycle by a
 * stable hash), so there is no particle state: re-presenting a batch at the same time draws the same pixels, a hidden
 * tab resumes without a burst, and nothing here reads or changes the simulation. Layered interiors get none of it.
 */
import { Container, Sprite, TilingSprite, type Texture } from 'pixi.js';
import type { MapDef, Rect } from '../raid-runtime/contract';
import type { Puddle } from './art/ground';
import { canvas, hash, rect } from './art/paint';
import { BAYER4, Lattice } from './art/surface';
import type { Textures } from './textures';

export type WeatherKind = 'rain' | 'clear';
/** A roofed footprint: drops land on the roof (lifted on screen) while it is drawn, and stop once the room is revealed. */
export interface RoofArea { rect: Rect; lift: number; region: string | null }

/** Wind comes off the sea (east), so drops, mist and scraps all drift west (screen left). */
const WIND = 34, FALL = 128, FALL_T = .34, SPLASH_T = .14, RING_T = .42;
const frac = (v: number) => v - Math.floor(v);

export class Weather {
  /** Ground pass (lit by the light map): spatter, rings and water glints. */
  readonly back = new Container();
  /** Air pass (above the scene): streaks, mist and scraps. */
  readonly front = new Container();
  private streaks: Sprite[] = [];
  private splashes: Sprite[] = [];
  private scraps: Sprite[] = [];
  private mist: TilingSprite[] = [];
  private map: MapDef | null = null;
  private roofs: RoofArea[] = [];
  private covered: Rect[] = [];
  private grid = new Map<number, Puddle[]>();
  private water: (x: number, y: number) => boolean = () => false;
  private glints: Sprite[] = [];
  /** Drops landed and drawn this frame (read by checks). */
  stats = { drops: 0, splashes: 0, rings: 0, skippedRevealed: 0 };

  constructor(private tex: Textures, public kind: WeatherKind, private still: boolean) {
    const mistTex = tex.ensure('weather:mist', paintMist);
    for (const [alpha, scale] of [[.07, 1], [.05, 2]] as const) {
      const t = new TilingSprite({ texture: mistTex, width: 64, height: 64 });
      t.alpha = alpha; t.tileScale.set(scale); t.tint = 0xd8d6cc; this.mist.push(t); this.front.addChild(t);
    }
  }

  /** `water`: open water at a world point (the sea and canals), where drops ring and the surface glints. */
  setMap(m: MapDef, puddles: Puddle[], roofs: RoofArea[], covered: Rect[], water: (x: number, y: number) => boolean = () => false) {
    this.map = m; this.roofs = roofs; this.covered = covered; this.water = water; this.grid.clear();
    for (const p of puddles) { const k = (p.x >> 6) * 4096 + (p.y >> 6); (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(p); }
    const outdoors = m.key.mapId === 'coast';
    this.front.visible = this.back.visible = outdoors;
  }

  private puddleAt(x: number, y: number): boolean {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const p of this.grid.get(((x >> 6) + dx) * 4096 + (y >> 6) + dy) ?? []) {
        if (p.parts.some(q => ((x - p.x - q.dx) / q.rx) ** 2 + ((y - p.y - q.dy) / q.ry) ** 2 <= .8)) return true;
      }
    }
    return false;
  }

  /** Where a drop that lands at world (x, y) ends on screen: open ground, a drawn roof (lifted), or nowhere. */
  private landing(x: number, y: number, revealed: Readonly<Record<string, boolean>>): { y: number; roof: boolean } | null {
    const m = this.map!;
    if (x < 0 || y < 0 || x >= m.bounds.w || y >= m.bounds.h) return null;
    for (const r of this.roofs) if (x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h) {
      if (r.region && revealed[r.region]) { this.stats.skippedRevealed++; return null; }
      return { y: y - r.lift, roof: true };
    }
    for (const c of this.covered) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return null;
    const cell = m.cells[y >> 5]?.[x >> 5];
    if (cell === 'wall' || cell === 'window' || m.doors.some(d => d.x === x >> 5 && d.y === y >> 5)) return null;
    return { y, roof: false };
  }

  update(time: number, cam: { x: number; y: number }, view: { w: number; h: number }, revealed: Readonly<Record<string, boolean>>) {
    const st = this.stats; st.drops = st.splashes = st.rings = st.skippedRevealed = 0;
    if (!this.map || !this.front.visible) return;
    // Mist drifts with the wind; tile positions are whole pixels so the dithered pattern never shimmers.
    this.mist.forEach((t, i) => {
      t.position.set(cam.x - 8, cam.y - 8); t.width = view.w + 16; t.height = view.h + 16;
      const drift = this.still ? 0 : time * (i ? 9 : 5);
      t.tilePosition.set(Math.round(-cam.x + 8 - drift), Math.round(-cam.y + 8 + drift * .35));
    });
    let s = 0, p = 0;
    const rain = this.kind === 'rain' && !this.still;
    if (rain) {
      const FW = view.w + 96, FH = view.h + FALL + 64, x0 = cam.x - 48, y0 = cam.y - 32;
      // Gusts: density breathes slowly; about one drop per 2,600 px2 at full strength (a light drizzle).
      const gust = .72 + .28 * Math.sin(time * .21) * Math.sin(time * .07 + 1.3);
      const n = Math.round(FW * FH / 2600 * gust);
      const tex = this.tex.ensure('weather:streak', paintStreak), slant = Math.atan2(WIND * FALL_T, FALL);
      for (let i = 0; i < n; i++) {
        const period = .62 + hash(i, 3, 211) * .34, t = (time + hash(i, 4, 211) * period) / period, c = Math.floor(t), f = frac(t) * period;
        // World-anchored slot: the landing point stays put while the camera moves, re-rolled every cycle.
        const lx = x0 + ((hash(i, c, 212) * FW - x0) % FW + FW) % FW, ly = y0 + ((hash(i, c, 213) * FH - y0) % FH + FH) % FH;
        const land = this.landing(Math.floor(lx), Math.floor(ly), revealed);
        if (!land) continue;
        if (f < FALL_T) {
          const k = 1 - f / FALL_T, sp = this.streaks[s] ?? this.front.addChildAt(Object.assign(new Sprite(tex), { alpha: .42 }), 0);
          this.streaks[s++] = sp;
          sp.texture = tex; sp.visible = true; sp.anchor.set(.5, 1);
          sp.position.set(Math.round(lx + WIND * FALL_T * k), Math.round(land.y - FALL * k)); sp.rotation = slant;
          this.stats.drops++;
        } else if (f < FALL_T + RING_T) {
          const age = f - FALL_T, ring = !land.roof && (this.puddleAt(Math.floor(lx), Math.floor(ly)) || this.water(lx, ly));
          if (!ring && age >= SPLASH_T) continue;
          const frame = ring ? Math.min(2, Math.floor(age / RING_T * 3)) : age < SPLASH_T / 2 ? 0 : 1;
          const sp = this.splashes[p] ?? this.back.addChild(new Sprite());
          this.splashes[p++] = sp;
          sp.texture = this.tex.ensure(`weather:${ring ? 'ring' : 'spat'}:${frame}`, () => ring ? paintRing(frame) : paintSpatter(frame));
          sp.visible = true; sp.anchor.set(.5); sp.alpha = ring ? .55 * (1 - age / RING_T) + .2 : .6;
          sp.position.set(Math.round(lx), Math.round(land.y));
          if (ring) this.stats.rings++; else this.stats.splashes++;
        }
      }
    }
    for (let i = s; i < this.streaks.length; i++) this.streaks[i].visible = false;
    for (let i = p; i < this.splashes.length; i++) this.splashes[i].visible = false;
    // Open water glints: one short sky reflection per visible water tile, drifting a few pixels and breathing in and out.
    let gl = 0;
    if (!this.still) {
      const gtex = this.tex.ensure('weather:glint', paintGlint);
      for (let ty = Math.floor(cam.y / 32); ty <= Math.floor((cam.y + view.h) / 32); ty++) for (let tx = Math.floor(cam.x / 32); tx <= Math.floor((cam.x + view.w) / 32); tx++) {
        if (!this.water(tx * 32 + 16, ty * 32 + 16)) continue;
        const ph = hash(tx, ty, 231) * 6.283, a = .3 * Math.sin(time * 1.3 + ph) + .05;
        if (a <= 0) continue;
        const sp = this.glints[gl] ?? this.back.addChild(new Sprite(gtex));
        this.glints[gl++] = sp;
        sp.visible = true; sp.alpha = a;
        sp.position.set(Math.round(tx * 32 + 4 + hash(tx, ty, 232) * 18 + Math.sin(time * .7 + ph) * 3), ty * 32 + 3 + Math.floor(hash(tx, ty, 233) * 26));
      }
    }
    for (let i = gl; i < this.glints.length; i++) this.glints[i].visible = false;
    // Scraps of paper and leaves crossing the screen with the wind, fluttering between two frames.
    let q = 0;
    if (!this.still) for (let j = 0; j < 3; j++) {
      const period = 11 + j * 3.7, t = (time + j * 5.3) / period, c = Math.floor(t), f = frac(t);
      const x = cam.x + view.w + 24 - f * (view.w + 48), y = cam.y + view.h * (.15 + .7 * hash(j, c, 221)) + Math.sin(time * 3.1 + j) * 6 - f * 20;
      const sp = this.scraps[q] ?? this.front.addChild(new Sprite());
      this.scraps[q++] = sp;
      sp.texture = this.tex.ensure(`weather:scrap:${j % 2}:${Math.floor(time * 6 + j) % 2}`, () => paintScrap(j % 2, Math.floor(time * 6 + j) % 2));
      sp.visible = true; sp.position.set(Math.round(x), Math.round(y));
    }
    for (let i = q; i < this.scraps.length; i++) this.scraps[i].visible = false;
  }

  destroy() {
    for (const c of [this.back, this.front]) if (!c.destroyed) c.destroy({ children: true });
    this.streaks = []; this.splashes = []; this.scraps = []; this.mist = []; this.glints = [];
  }
}

function paintGlint(): HTMLCanvasElement {
  const { c, g } = canvas(7, 1);
  rect(g, '#7f9696', 0, 0, 7, 1); rect(g, '#a9bcbb', 2, 0, 3, 1);
  return c;
}
function paintStreak(): HTMLCanvasElement {
  const { c, g } = canvas(1, 7);
  for (let y = 0; y < 7; y++) { g.fillStyle = `rgba(206,214,216,${(.2 + y / 6 * .8).toFixed(2)})`; g.fillRect(0, y, 1, 1); }
  return c;
}
function paintSpatter(frame: number): HTMLCanvasElement {
  const { c, g } = canvas(5, 3);
  if (frame === 0) { rect(g, '#c9d1d2', 2, 1, 1, 1); rect(g, '#aeb7b8', 1, 0, 1, 1); rect(g, '#aeb7b8', 3, 0, 1, 1); }
  else { rect(g, '#aeb7b8', 0, 1, 1, 1); rect(g, '#aeb7b8', 4, 1, 1, 1); rect(g, '#97a0a1', 2, 2, 1, 1); }
  return c;
}
function paintRing(frame: number): HTMLCanvasElement {
  const rx = 1 + frame * 1.5, ry = .6 + frame, { c, g } = canvas(9, 7);
  for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; rect(g, '#b9c5c7', Math.round(4 + Math.cos(t) * rx), Math.round(3 + Math.sin(t) * ry), 1, 1); }
  return c;
}
function paintScrap(kind: number, flap: number): HTMLCanvasElement {
  const { c, g } = canvas(3, 2);
  const [a, b] = kind ? ['#b3ab98', '#8d8670'] : ['#7a6448', '#5c4a36'];
  if (flap) { rect(g, a, 0, 0, 2, 1); rect(g, b, 2, 1, 1, 1); } else { rect(g, a, 0, 1, 3, 1); rect(g, b, 1, 0, 1, 1); }
  return c;
}
/** Soft mist bank as clustered dither: a tileable 128 px value-noise field quantized into a few alpha steps (2px cells). */
function paintMist(): HTMLCanvasElement {
  const S = 128, { c, g } = canvas(S, S), a = new Lattice(32, 91, S * 2 + 64, S * 2 + 64), b = new Lattice(16, 92, S * 2 + 64, S * 2 + 64);
  const img = g.createImageData(S, S), d = img.data;
  // Tileable: blend the field with its wrapped copies so the edges match.
  const field = (x: number, y: number) => .65 * a.at(x + S, y + S) + .35 * b.at(x + S, y + S);
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
    const u = x / S, v = y / S;
    const n = field(x, y) * (1 - u) * (1 - v) + field(x - S, y) * u * (1 - v) + field(x, y - S) * (1 - u) * v + field(x - S, y - S) * u * v;
    const level = Math.max(0, Math.round((n - .42) * 6 + BAYER4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] / 16 - .5));
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const k = ((y + j) * S + x + i) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.min(255, level * 70); }
  }
  g.putImageData(img, 0, 0);
  return c;
}
export type { Texture };
