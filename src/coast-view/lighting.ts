import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { MapDef, Point, Rect } from '../raid-runtime/contract';
import { hasRoof } from './appearance';
import { hex, radialLight } from './art/paint';
import type { Textures } from './textures';

export interface Light { x: number; y: number; r: number; color: number; k: number; ttl?: number; age?: number; region?: string | null }
export interface Mood { outdoor: number; indoor: number; ruined: number; name: string }
export const MOODS: Mood[] = [
  { name: 'overcast', outdoor: 0xf2ede4, indoor: 0x9c968a, ruined: 0xd2ccc0 },
  { name: 'dusk', outdoor: 0x8e8a96, indoor: 0x58566a, ruined: 0x75727f },
];

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export class Lighting {
  readonly layer = new Container();
  private ambient = new Graphics();
  private interiors = new Graphics();
  private dynamic = new Container();
  private pool: Sprite[] = [];
  lights: Light[] = [];
  mood: Mood = MOODS[0];
  private rooms: { rect: Rect; kind: 'indoor' | 'ruined'; region: string | null }[] = [];
  private lightTex: Texture;

  constructor(tex: Textures) {
    this.lightTex = tex.ensure('light:radial', () => radialLight(64, 6));
    this.layer.addChild(this.ambient, this.interiors, this.dynamic);
    this.interiors.blendMode = 'normal';
  }

  setMap(m: MapDef) {
    const coast = m.key.mapId === 'coast';
    this.rooms = coast
      ? m.buildings.map(b => ({ rect: { x: b.x + 32, y: b.y + 32, w: b.w - 64, h: b.h - 64 }, kind: hasRoof(m, b) ? 'indoor' as const : 'ruined' as const, region: b.regionIds[0] ?? null }))
      : [{ rect: { x: 0, y: 0, w: m.cols * 32, h: m.rows * 32 }, kind: 'indoor', region: null }];
    this.redrawStatic(m.bounds);
  }

  setMood(i: number, bounds: Rect) { this.mood = MOODS[i % MOODS.length]; this.redrawStatic(bounds); }

  private redrawStatic(b: Rect) {
    this.ambient.clear().rect(b.x - 64, b.y - 64, b.w + 128, b.h + 128).fill(this.mood.outdoor);
    this.interiors.clear();
    for (const r of this.rooms) this.interiors.rect(r.rect.x, r.rect.y, r.rect.w, r.rect.h).fill(r.kind === 'indoor' ? this.mood.indoor : this.mood.ruined);
  }

  sync(dt: number, visible: (l: Light) => boolean) {
    this.lights = this.lights.filter(l => { if (l.ttl === undefined) return true; l.age = (l.age ?? 0) + dt; return l.age < l.ttl; });
    let i = 0;
    for (const l of this.lights) {
      if (!visible(l)) continue;
      const s = this.pool[i] ?? this.dynamic.addChild(Object.assign(new Sprite(this.lightTex), { blendMode: 'add' as const }));
      this.pool[i++] = s;
      const fade = l.ttl ? 1 - (l.age ?? 0) / l.ttl : 1;
      s.visible = true; s.anchor.set(.5); s.position.set(Math.round(l.x), Math.round(l.y));
      s.scale.set(l.r / 64); s.tint = l.color; s.alpha = Math.min(1, l.k * fade);
    }
    for (; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  at(p: Point, _region: string | null | undefined, revealed: Record<string, boolean>, indoorHint = false): number {
    let base = this.mood.outdoor;
    const room = this.rooms.find(r => p.x >= r.rect.x && p.x < r.rect.x + r.rect.w && p.y >= r.rect.y && p.y < r.rect.y + r.rect.h);
    if (room) base = room.kind === 'indoor' ? this.mood.indoor : this.mood.ruined;
    else if (indoorHint) base = this.mood.indoor;
    let [r, g, b] = rgb(base);
    for (const l of this.lights) {
      if (l.region && revealed[l.region] === false) continue;
      const d = Math.hypot(l.x - p.x, l.y - p.y);
      if (d >= l.r) continue;
      const f = Math.pow(1 - d / l.r, 1.6) * l.k * (l.ttl ? 1 - (l.age ?? 0) / l.ttl : 1), [lr, lg, lb] = rgb(l.color);
      r += lr * f; g += lg * f; b += lb * f;
    }
    return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
  }
}

export const lamp = (x: number, y: number, region: string | null, color = 0xc3a26a): Light => ({ x, y, r: 110, color, k: .55, region });
export { hex };
