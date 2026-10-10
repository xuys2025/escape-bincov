import { CanvasSource, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { POOLS, ROOMS, SHED, T, WALL_H, floors, type RoomId } from './layout';
import { PUDDLES } from './art/ground';
import { canvas, dot, hash, rect } from './paint';
import type { Lighting } from './lighting';

const tex = (c: HTMLCanvasElement, linear = false) => new Texture({ source: new CanvasSource({ resource: c, scaleMode: linear ? 'linear' : 'nearest' }) });
function dropTex() { const { c, g } = canvas(1, 7); for (let y = 0; y < 7; y++) { g.globalAlpha = .25 + y / 9; rect(g, '#ffffff', 0, y, 1, 1); } return tex(c); }
function splashTex(f: number) {
  const { c, g } = canvas(7, 4);
  if (f === 0) { dot(g, '#ffffff', 3, 2); dot(g, '#ffffff', 2, 1); dot(g, '#ffffff', 4, 1); }
  else if (f === 1) { dot(g, '#ffffff', 1, 1); dot(g, '#ffffff', 5, 1); dot(g, '#ffffff', 0, 0); dot(g, '#ffffff', 6, 0); dot(g, '#ffffff', 3, 3); }
  else { dot(g, '#ffffff', 0, 2); dot(g, '#ffffff', 6, 2); }
  return tex(c);
}
function ringTex(r: number) {
  const w = r * 2 + 1, h = Math.max(3, r + 1), { c, g } = canvas(w, h);
  for (let a = 0; a < 64; a++) { const x = Math.round(r + Math.cos(a / 64 * Math.PI * 2) * r), y = Math.round((h - 1) / 2 + Math.sin(a / 64 * Math.PI * 2) * (h - 1) / 2); dot(g, '#ffffff', x, y); }
  return tex(c);
}
function blobTex(r: number) {
  const { c, g } = canvas(r * 2, r * 2), img = g.createImageData(r * 2, r * 2);
  for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
    const d = Math.hypot(x + .5 - r, y + .5 - r) / r, a = Math.max(0, 1 - d), i = (y * r * 2 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * a * a);
  }
  g.putImageData(img, 0, 0); return tex(c, true);
}
function mistTex() {
  const w = 256, h = 128, { c, g } = canvas(w, h), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let o = 1; o <= 3; o++) v += (Math.sin(x / (22 * o) + hash(o, 1, 1) * 9) + Math.sin(y / (12 * o) + x / (40 * o)) + 2) / 4 / o;
    const edge = Math.min(1, x / 40, (w - x) / 40, y / 24, (h - y) / 24), i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * Math.max(0, v - .55) * 1.6 * edge);
  }
  g.putImageData(img, 0, 0); return tex(c, true);
}
function waveTex() {
  const w = 64, h = 32, { c, g } = canvas(w, h);
  for (let i = 0; i < 18; i++) { const x = Math.floor(hash(i, 1, 4) * w), y = Math.floor(hash(1, i, 5) * h), l = 3 + Math.floor(hash(i, i, 6) * 6); rect(g, i % 3 ? '#9fc2c0' : '#d8ece6', x, y, l, 1); }
  return tex(c);
}

interface Drop { x: number; y: number; z: number; s: Sprite }
interface Burst { s: Sprite; t: number; kind: 'splash' | 'ripple' | 'roof'; size: number }
interface Puff { s: Sprite; t: number; life: number; vx: number; vy: number; grow: number; ember: boolean }

const ROOM_RECTS = ROOMS.map(r => ({ id: r.id, x: r.x * T, y: r.y * T, w: r.w * T, h: r.h * T }));
const inR = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** Rain, splashes and ripples, chimney smoke and embers, drifting mist and the sea's moving highlights. */
export class Atmosphere {
  /** Drawn into the world after upright sprites (tinted by the light sampler, so rain shows only where lamps are). */
  readonly front = new Container();
  /** Ground-level ripples (on top of the lit ground, under uprights). */
  readonly ground = new Container();
  /** Additive layer (after lighting): sea glints, lamp reflections in puddles and water. */
  readonly glow = new Container();
  private drops: Drop[] = [];
  private bursts: Burst[] = [];
  private puffs: Puff[] = [];
  private dropT = dropTex(); private splashT = [0, 1, 2].map(splashTex); private ringT = [3, 5, 8].map(ringTex);
  private blobT = blobTex(12); private mist: Sprite[] = []; private mistT!: Texture; private waveT!: Texture;
  private waves: TilingSprite; private waves2: TilingSprite;
  private reflections: Sprite[] = [];
  private emit = { chimney: 0, exhaust: 0, barrel: 0 };
  private rnd = 1;
  intensity = 1;

  constructor(private light: Lighting, readonly reduced: boolean) {
    const mt = this.mistT = mistTex();
    for (let i = 0; i < 4; i++) { const s = new Sprite(mt); s.alpha = .0; s.scale.set(2 + i * .4, 1.6); this.mist.push(s); this.front.addChild(s); }
    const wt = this.waveT = waveTex();
    this.waves = new TilingSprite({ texture: wt, width: 35 * T, height: 4 * T }); this.waves.position.set(0, 24 * T); this.waves.blendMode = 'add'; this.waves.alpha = .18;
    this.waves2 = new TilingSprite({ texture: wt, width: 35 * T, height: 4 * T }); this.waves2.position.set(0, 24 * T); this.waves2.blendMode = 'add'; this.waves2.alpha = .1; this.waves2.tileScale.set(1.5, 1);
    this.glow.addChild(this.waves, this.waves2);
    for (let i = 0; i < 24; i++) { const s = new Sprite(this.blobT); s.blendMode = 'add'; s.anchor.set(.5, 0); s.visible = false; this.reflections.push(s); this.glow.addChild(s); }
    for (let i = 0; i < (reduced ? 0 : 340); i++) {
      const s = new Sprite(this.dropT); s.anchor.set(.5, 1); s.rotation = .18;
      this.front.addChild(s); this.drops.push({ x: 0, y: 0, z: -1, s });
    }
  }

  /** Release the textures this layer made; then its own containers. */
  destroy() {
    for (const t of [this.dropT, ...this.splashT, ...this.ringT, this.blobT, this.mistT, this.waveT]) t.destroy(true);
    for (const c of [this.front, this.ground, this.glow]) c.destroy({ children: true });
    this.drops = []; this.bursts = []; this.puffs = [];
  }
  private r() { let t = (this.rnd += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), 1 | t); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  update(dt: number, view: { x: number; y: number; w: number; h: number }, hiddenRoof: Set<RoomId>, generatorOn: boolean) {
    const t = this.light.time;
    // Rain: each drop falls toward a ground point; roofs catch it at wall height unless that roof is lifted.
    for (const d of this.drops) {
      if (d.z < 0 || d.x < view.x - 80 || d.x > view.x + view.w + 80 || d.y < view.y - 40 || d.y > view.y + view.h + 200) {
        d.x = view.x - 30 + this.r() * (view.w + 60); d.y = view.y + this.r() * (view.h + 120); d.z = 20 + this.r() * 260;
      }
      d.z -= dt * 420;
      const roof = ROOM_RECTS.find(r => inR(d.x, d.y, r)), floor = roof && !hiddenRoof.has(roof.id) ? WALL_H : 0;
      if (d.z <= floor) { this.land(d, hiddenRoof); d.z = -1; d.s.visible = false; continue; }
      const sx = d.x + d.z * .18, sy = d.y - d.z;
      const hidden = (roof && hiddenRoof.has(roof.id)) || inR(d.x, d.y, { x: SHED.x * T, y: SHED.y * T, w: SHED.w * T, h: SHED.h * T });
      d.s.visible = !hidden && d.z > floor;
      if (d.s.visible) { d.s.position.set(Math.round(sx), Math.round(sy)); d.s.tint = this.light.sample(d.x, d.y - d.z * .3, null, 26); d.s.alpha = .55 * this.intensity; }
    }
    for (const b of this.bursts) {
      b.t += dt;
      if (b.kind === 'ripple') { const k = Math.min(2, Math.floor(b.t / .12)); b.s.texture = this.ringT[k]; b.s.alpha = .5 * (1 - b.t / .4); }
      else { const k = Math.min(2, Math.floor(b.t / .05)); b.s.texture = this.splashT[k]; b.s.alpha = .7 * (1 - b.t / .16); }
    }
    this.bursts = this.bursts.filter(b => { if ((b.kind === 'ripple' ? .4 : .16) <= b.t) { b.s.destroy(); return false; } return true; });

    // Smoke from the canteen stove pipe, the generator exhaust (only while it runs) and the fire barrel.
    if (!this.reduced) {
      this.emit.chimney += dt; this.emit.exhaust += dt; this.emit.barrel += dt;
      if (this.emit.chimney > .5) { this.emit.chimney = 0; this.puff(8 * T + 201, 1 * T - WALL_H + 30, false, 0x8a8680); }
      if (generatorOn && this.emit.exhaust > .22) { this.emit.exhaust = 0; this.puff(24 * T + 46, 1 * T - WALL_H + 44, false, 0x5a5550); }
      if (this.emit.barrel > .16) { this.emit.barrel = 0; this.puff(21.5 * T + (this.r() - .5) * 8, 19 * T - 30, this.r() < .45, 0x6a625a); }
    }
    for (const p of this.puffs) {
      p.t += dt; const k = p.t / p.life;
      p.s.x += (p.vx + Math.sin(t * 1.3 + p.life * 10) * 4) * dt; p.s.y += p.vy * dt;
      if (p.ember) { p.s.alpha = (1 - k) * (hash(Math.floor(p.t * 20), p.life * 100, 1) < .8 ? 1 : .3); }
      else { p.s.scale.set((.3 + k * p.grow) * (p.ember ? .2 : 1)); p.s.alpha = .32 * Math.sin(Math.min(1, k) * Math.PI); p.s.tint = this.light.sample(p.s.x, p.s.y + 40, null, 30); }
    }
    this.puffs = this.puffs.filter(p => { if (p.t >= p.life) { p.s.destroy(); return false; } return true; });

    // Mist banks drift slowly across the view (thicker over the water).
    this.mist.forEach((m, i) => {
      const span = view.w + 600;
      m.x = view.x - 300 + ((t * (6 + i * 3) + i * 400) % span);
      m.y = view.y + 40 + i * (view.h / 4) + Math.sin(t * .2 + i) * 10;
      const overSea = m.y > 22 * T;
      m.alpha = (overSea ? .14 : .06) * (this.reduced ? .6 : 1);
      m.tint = this.light.sample(m.x + 200, m.y + 60, null, 40);
    });

    // Sea: two tiled highlight layers sliding against each other; lamp glints on water and puddles.
    if (!this.reduced) { this.waves.tilePosition.set(t * 6, Math.sin(t * .7) * 2); this.waves2.tilePosition.set(-t * 4, Math.cos(t * .5) * 3); }
    this.waves.tint = this.waves2.tint = this.light.sample(14 * T, 23.5 * T, null, 10);
    this.reflect(t);
  }

  private land(d: Drop, hiddenRoof: Set<RoomId>) {
    if (this.bursts.length > 120) return;
    const tx = Math.floor(d.x / T), ty = Math.floor(d.y / T), f = floors[ty]?.[tx];
    const roof = ROOM_RECTS.find(r => inR(d.x, d.y, r));
    if (roof && hiddenRoof.has(roof.id)) return;
    const onRoof = !!roof;
    const pool = !onRoof && POOLS.some(p => inR(d.x, d.y, { x: p.x * T + 4, y: p.y * T + 4, w: p.w * T - 8, h: p.h * T - 8 }));
    const water = pool || (!onRoof && (f === 'sea' || PUDDLES.some(p => inR(d.x, d.y, p))));
    if (f === 'void' && !onRoof) return;
    if (this.r() > (water ? .9 : .45)) return;
    const s = new Sprite(water ? this.ringT[0] : this.splashT[0]);
    s.anchor.set(.5); s.position.set(Math.round(d.x), Math.round(d.y - (onRoof ? WALL_H : 0) - (water ? 0 : 1)));
    s.tint = this.light.sample(d.x, d.y, null, 30);
    // Pool tanks are props standing above the ground layer, so their ripples go on top with the rain.
    if (pool) s.y -= 6;
    (water && !pool ? this.ground : this.front).addChild(s);
    this.bursts.push({ s, t: 0, kind: water ? 'ripple' : 'splash', size: 1 });
  }

  private puff(x: number, y: number, ember: boolean, tint: number) {
    const s = new Sprite(this.blobT); s.anchor.set(.5); s.position.set(x, y); s.alpha = 0; s.tint = tint;
    if (ember) { s.texture = Texture.WHITE; s.width = 1; s.height = 1; s.tint = 0xffa040; s.blendMode = 'add'; this.glow.addChild(s); }
    else this.front.addChild(s);
    this.puffs.push({ s, t: 0, life: ember ? .8 + this.r() * .6 : 2.8 + this.r() * 1.4, vx: (this.r() - .3) * 8 + 5, vy: ember ? -30 - this.r() * 20 : -14 - this.r() * 6, grow: 1.2 + this.r() * .8, ember });
  }

  /** Vertical glints under lamps that stand near water or puddles, rippling with the rain. */
  private reflect(t: number) {
    let i = 0;
    const lights = this.light.lights().filter(l => l.level > .05 && !l.def.room && l.def.head > 0);
    const surfaces = [...PUDDLES, { x: 0, y: 24 * T, w: 35 * T, h: 3 * T }];
    for (const s of surfaces) for (const l of lights) {
      if (i >= this.reflections.length) break;
      const sea = s.h > 2 * T, dx = l.def.x, dy = sea ? Math.max(s.y + 6, l.def.y - 4) : s.y + s.h / 2;
      if (dx < s.x + 3 || dx > s.x + s.w - 3 || Math.abs(l.def.y - dy) > (sea ? 140 : 110)) continue;
      const r = this.reflections[i++], k = l.level * (sea ? .9 : .5) * (1 - Math.abs(l.def.y - dy) / (sea ? 150 : 120));
      r.visible = true; r.tint = l.def.color; r.alpha = Math.max(0, k * (.75 + .25 * Math.sin(t * 9 + dx)));
      r.position.set(dx + Math.round(Math.sin(t * 3 + dy) * 1.5), Math.round(dy - 2));
      r.scale.set(sea ? .3 : .16, sea ? 3 : (s.h / 24) * .9);
    }
    for (; i < this.reflections.length; i++) this.reflections[i].visible = false;
  }
}
