import { Container, Sprite } from 'pixi.js';
import type { Textures } from './textures';

interface Particle { region: string | null; s: Sprite; x: number; y: number; h: number; vx: number; vy: number; vh: number; age: number; ttl: number; g: number; settle: 'decal' | 'fade' | 'stay'; color: number }

export class Fx {
  private live: Particle[] = [];
  private free: Sprite[] = [];
  private decals: { s: Sprite; region: string | null }[] = [];
  /**
   * Every particle and decal belongs to the region under it and is drawn only while the Runtime reports that region as
   * revealed, so blood, sparks and casings never mark an unrevealed room (OPUS-VIS-01).
   */
  constructor(private tex: Textures, private sorted: Container, private flat: Container, private regionAt: (x: number, y: number) => string | null) {}

  private sprite(): Sprite { const s = this.free.pop() ?? new Sprite(this.tex.pixel()); s.visible = true; s.alpha = 1; s.scale.set(1); s.blendMode = 'normal'; return s; }

  spawn(o: { x: number; y: number; h: number; vx: number; vy: number; vh: number; ttl: number; color: number; g?: number; size?: number; settle?: Particle['settle']; add?: boolean }) {
    const s = this.sprite(); s.tint = o.color; s.scale.set(o.size ?? 1); if (o.add) s.blendMode = 'add';
    this.sorted.addChild(s);
    this.live.push({ region: null, s, x: o.x, y: o.y, h: o.h, vx: o.vx, vy: o.vy, vh: o.vh, age: 0, ttl: o.ttl, g: o.g ?? 520, settle: o.settle ?? 'fade', color: o.color });
  }

  sparks(x: number, y: number, h: number, nx: number, ny: number, rnd: () => number) {
    for (let i = 0; i < 7; i++) {
      const a = Math.atan2(ny, nx) + (rnd() - .5) * 2.2, v = 60 + rnd() * 120;
      this.spawn({ x, y, h, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6, vh: 40 + rnd() * 90, ttl: .18 + rnd() * .22, color: i % 3 ? 0xffd27a : 0xfff1c8, add: true });
    }
    for (let i = 0; i < 4; i++) this.spawn({ x, y, h, vx: nx * 20 + (rnd() - .5) * 30, vy: ny * 12 + (rnd() - .5) * 10, vh: 10 + rnd() * 20, ttl: .45 + rnd() * .3, color: 0x8d8576, g: 30, size: 2 });
  }
  blood(x: number, y: number, h: number, angle: number, rnd: () => number) {
    for (let i = 0; i < 6; i++) {
      const a = angle + (rnd() - .5) * 1.2, v = 40 + rnd() * 70;
      this.spawn({ x, y, h, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .7, vh: rnd() * 60, ttl: 1.5, color: i % 2 ? 0x6e2f2a : 0x8c3b33, settle: 'decal', size: rnd() < .3 ? 2 : 1 });
    }
  }
  casing(x: number, y: number, h: number, angle: number, rnd: () => number) {
    const a = angle + Math.PI / 2 + (rnd() - .5) * .6, v = 35 + rnd() * 30;
    this.spawn({ x, y, h, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6, vh: 70 + rnd() * 40, ttl: 6, color: 0xc9a24e, settle: 'stay' });
  }
  dust(x: number, y: number, rnd: () => number, n = 3) {
    for (let i = 0; i < n; i++) this.spawn({ x: x + (rnd() - .5) * 10, y: y + (rnd() - .5) * 4, h: 1, vx: (rnd() - .5) * 18, vy: (rnd() - .5) * 6, vh: 8 + rnd() * 8, ttl: .35 + rnd() * .2, color: 0x8a8273, g: 10, size: 2 });
  }

  decal(x: number, y: number, color: number, size = 1) {
    const s = new Sprite(this.tex.pixel()); s.tint = color; s.scale.set(size); s.position.set(Math.round(x), Math.round(y));
    this.flat.addChild(s); this.decals.push({ s, region: this.regionAt(x, y) });
    if (this.decals.length > 400) this.decals.shift()!.s.destroy();
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vh -= p.g * dt; p.h += p.vh * dt;
      if (p.h <= 0) {
        p.h = 0;
        if (p.settle === 'decal' || p.settle === 'stay') { this.decal(p.x, p.y, p.color, p.s.scale.x); this.release(i); continue; }
        p.vh *= -.3; p.vx *= .5; p.vy *= .5;
      }
      if (p.age >= p.ttl) { this.release(i); continue; }
      p.s.position.set(Math.round(p.x), Math.round(p.y - p.h));
      p.s.zIndex = p.y + .3;
      if (p.settle === 'fade') p.s.alpha = 1 - p.age / p.ttl;
    }
  }
  /** Apply region visibility after update; particles are re-tested at their current position each frame. */
  reveal(revealed: Readonly<Record<string, boolean>>) {
    const shown = (r: string | null) => r === null || revealed[r] === true;
    let hidden = 0;
    for (const p of this.live) { p.region = this.regionAt(p.x, p.y); p.s.visible = shown(p.region); if (!p.s.visible) hidden++; }
    for (const d of this.decals) { d.s.visible = shown(d.region); if (!d.s.visible) hidden++; }
    this.hidden = hidden;
  }
  hidden = 0;
  private release(i: number) { const p = this.live[i]; p.s.removeFromParent(); p.s.visible = false; this.free.push(p.s); this.live.splice(i, 1); }

  clear() {
    for (const p of this.live) p.s.destroy(); this.live = [];
    for (const s of this.free) s.destroy(); this.free = [];
    for (const d of this.decals) d.s.destroy(); this.decals = []; this.hidden = 0;
  }
  get count() { return this.live.length + this.decals.length; }
}
