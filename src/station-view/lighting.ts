import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { DOORWAYS, LIGHTS, ROOMS, SHED, T, type LightDef, type RoomId } from './layout';
import { bayer, canvas, hash, lightFalloff } from './paint';

export type Power = 'emergency' | 'restored';
export interface Mood { name: string; outdoor: [number, number]; indoorDark: number; scale: number }
/** Ambient (multiply) colours: [emergency, restored] for open ground. */
export const MOODS: Record<string, Mood> = {
  night: { name: '夜', outdoor: [0x4a536a, 0x56617a], indoorDark: 0x262a31, scale: 1 },
  dawn: { name: '黎明', outdoor: [0x6c7486, 0x76808f], indoorDark: 0x3a3e46, scale: .75 },
};

interface LiveLight {
  def: LightDef; sprite: Sprite; level: number; target: number;
  /** Seconds until this light starts its power-on stutter (staged sequence). */
  delay: number; stutter: number;
}
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const interior = (id: RoomId) => { const r = ROOMS.find(q => q.id === id)!; return { x: (r.x + 1) * T, y: (r.y + 1) * T, w: (r.w - 2) * T, h: (r.h - 2) * T }; };
const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
const ROOM_RECTS = ROOMS.map(r => ({ id: r.id, rect: interior(r.id), door: r.doors.map(([x, y]) => ({ x: x * T, y: y * T, w: T, h: T })) }));

/** Window and door spill on the courtyard: generated from each room's south openings, powered like the room. */
function spills(): LightDef[] {
  const out: LightDef[] = [];
  for (const r of ROOMS) {
    const lights = LIGHTS.filter(l => l.room === r.id), main = lights.find(l => l.power === 'restored') ?? lights[0];
    const weak = lights.find(l => l.power !== 'restored');
    const south = r.y + r.h - 1;
    const openings = [...r.windows.filter(([, y]) => y === south).map(([x]) => ({ x, k: .5, r: 46 })), ...r.doors.filter(([, y]) => y === south).map(([x]) => ({ x, k: .62, r: 58 }))];
    for (const o of openings) {
      if (main) out.push({ id: `spill-${r.id}-${o.x}`, x: o.x * T + 16, y: (south + 1) * T + 8, r: o.r, color: main.color, k: o.k, kind: 'bulb', head: 0, room: null, power: 'restored', ground: true });
      if (weak) out.push({ id: `spill-e-${r.id}-${o.x}`, x: o.x * T + 16, y: (south + 1) * T + 6, r: o.r * .7, color: weak.color, k: o.k * .45, kind: 'lantern', head: 0, room: null, power: weak.power, flicker: weak.flicker, ground: true });
    }
  }
  // Side doors: each room's light falls through the gap onto the floor on the other side (F01).
  for (const d of DOORWAYS.filter(q => q.side)) for (const [from, into, dx] of [[d.b, d.a, -6], [d.a, d.b, 38]] as const) {
    if (!from) continue;
    const lights = LIGHTS.filter(l => l.room === from), main = lights.find(l => l.power === 'restored'), weak = lights.find(l => l.power !== 'restored');
    const at = { x: d.x * T + dx, y: d.y * T + 16 };
    if (main) out.push({ id: `door-${from}-${d.x}-${d.y}`, ...at, r: 62, color: main.color, k: .55, kind: 'bulb', head: 0, room: into, power: 'restored', ground: true });
    if (weak) out.push({ id: `door-e-${from}-${d.x}-${d.y}`, ...at, r: 46, color: weak.color, k: .4, kind: 'lantern', head: 0, room: into, power: weak.power, flicker: weak.flicker, ground: true });
  }
  return out;
}
export const ALL_LIGHTS: LightDef[] = [...LIGHTS, ...spills()];

/**
 * Lightmap for the ground (multiply) plus a CPU sampler with the same falloff for upright sprites, which are tinted at
 * their feet. Each light is a pre-baked, room-clipped, dithered sprite so indoor lamps never leak through walls.
 */
export class Lighting {
  readonly layer = new Container();
  private ambient = new Graphics();
  private live: LiveLight[] = [];
  /** Baked light textures, released with the view. */
  private baked: Texture[] = [];
  power: Power = 'emergency';
  mood: Mood = MOODS.night;
  time = 0;
  /** Seconds since the generator came back (drives the staged power-on sequence); null when idle. */
  private sequence: number | null = null;

  constructor() {
    this.layer.addChild(this.ambient);
    for (const def of ALL_LIGHTS) {
      const tex = bake(def), sprite = new Sprite(tex); this.baked.push(tex);
      sprite.blendMode = 'add'; sprite.position.set(def.x - def.r, def.y - def.r);
      this.layer.addChild(sprite);
      this.live.push({ def, sprite, level: 0, target: 0, delay: 0, stutter: 0 });
    }
  }

  setPower(p: Power, animate: boolean) {
    if (p === this.power && !animate) { this.snap(); return; }
    this.power = p;
    if (animate && p === 'restored') {
      this.sequence = 0;
      const gen = { x: 25.9 * T, y: 4 * T };
      for (const l of this.live) {
        const d = Math.hypot(l.def.x - gen.x, l.def.y - gen.y);
        l.delay = l.def.power === 'restored' ? .9 + d / 520 + hash(l.def.x, l.def.y, 3) * .15 : 0;
        l.stutter = l.def.kind === 'tube' || l.def.kind === 'clinic' ? .5 : .18;
      }
    } else this.snap();
  }
  private wanted(def: LightDef) { return def.power === 'any' || def.power === this.power ? 1 : 0; }
  private snap() { for (const l of this.live) { l.target = l.level = this.wanted(l.def); l.delay = 0; } this.sequence = null; }

  update(dt: number) {
    this.time += dt;
    if (this.sequence !== null) this.sequence += dt;
    for (const l of this.live) {
      const want = this.wanted(l.def);
      if (this.sequence !== null && l.def.power === 'restored') {
        const t = this.sequence - l.delay;
        if (t < 0) l.target = 0;
        else if (t < l.stutter) l.target = hash(Math.floor(t * 24), l.def.x | 0, 5) < .55 ? .85 : .1;
        else l.target = want;
      } else if (this.sequence !== null && l.def.power === 'emergency') {
        l.target = this.sequence < 1.1 ? (hash(Math.floor(this.sequence * 14), 3, 4) < .5 ? .6 : 1) : 0;
      } else l.target = want;
      const rate = l.def.power === 'any' ? 6 : 14;
      l.level += (l.target - l.level) * Math.min(1, dt * rate);
      if (Math.abs(l.level - l.target) < .002) l.level = l.target;
      l.sprite.alpha = Math.min(1, l.level * this.flicker(l.def));
      l.sprite.visible = l.sprite.alpha > .01;
    }
    if (this.sequence !== null && this.sequence > 6) this.sequence = null;
  }

  /** Brightness factor of a light now: a slow waver plus rare dips; fire and lanterns breathe more. */
  flicker(def: LightDef): number {
    const t = this.time;
    let k = 1;
    if (def.kind === 'fire' || def.kind === 'stove') k = .84 + .1 * Math.sin(t * 7.3 + def.x) + .06 * Math.sin(t * 17.1 + def.y);
    else if (def.kind === 'string') k = .9 + .1 * Math.sin(t * 1.7 + def.x * .05);
    else if (def.kind === 'radio') k = .85 + .15 * Math.sin(t * 2.2);
    if (def.flicker !== undefined) {
      const s = def.flicker, emergency = def.power === 'emergency';
      k *= 1 - (emergency ? .1 : .04) * (Math.sin(t * 2.3 + s * 7) * .6 + Math.sin(t * 5.9 + s * 3) * .4);
      const tick = Math.floor(t * 9), dip = hash(tick, s * 131, 9) < (emergency ? .06 : .02) ? .45 : 1;
      k *= dip;
    }
    return k * this.mood.scale;
  }

  /** Lightmap ambient: open ground takes the sky, each interior its lit or dark level, the shed a little shade. */
  drawAmbient(view: { x: number; y: number; w: number; h: number }) {
    const a = this.ambient.clear();
    const restored = this.power === 'restored';
    const outdoor = this.mood.outdoor[restored ? 1 : 0];
    a.rect(view.x - 64, view.y - 64, view.w + 128, view.h + 128).fill(outdoor);
    for (const r of ROOMS) {
      const lit = restored ? r.ambient.on : r.ambient.off, rr = interior(r.id);
      a.rect(rr.x, rr.y, rr.w, rr.h).fill(lit);
      for (const [x, y] of r.doors) a.rect(x * T, y * T, T, T).fill(lit);
    }
    a.rect(SHED.x * T, SHED.y * T, SHED.w * T, SHED.h * T).fill(scale(outdoor, .85));
  }

  /**
   * Ambient plus all lights in the same domain at a ground point (0xRRGGBB, clamped). `masonry` leaves out the
   * window and door spills, which light the ground in front of an opening but not the wall around it.
   */
  sample(x: number, y: number, domain: RoomId | null, boost = 0, masonry = false): number {
    const restored = this.power === 'restored';
    let r: number, g: number, b: number;
    if (domain) { const room = ROOMS.find(q => q.id === domain)!; [r, g, b] = rgb(restored ? room.ambient.on : room.ambient.off); }
    else[r, g, b] = rgb(this.mood.outdoor[restored ? 1 : 0]);
    for (const l of this.live) {
      if (l.sprite.alpha <= .01 || l.def.room !== domain || (masonry && l.def.ground)) continue;
      const d = Math.hypot(l.def.x - x, l.def.y - y);
      if (d >= l.def.r) continue;
      const f = lightFalloff(d, l.def.r) * l.def.k * l.sprite.alpha, [lr, lg, lb] = rgb(l.def.color);
      r += lr * f; g += lg * f; b += lb * f;
    }
    r += boost; g += boost; b += boost;
    return (Math.min(255, r | 0) << 16) | (Math.min(255, g | 0) << 8) | Math.min(255, b | 0);
  }

  /** Current level of a named light (0..1) for glows tied to it. */
  levelOf(id: string): number { const l = this.live.find(q => q.def.id === id); return l ? l.sprite.alpha : 0; }
  lights(): { def: LightDef; level: number }[] { return this.live.map(l => ({ def: l.def, level: l.sprite.alpha })); }
  get sequencing() { return this.sequence !== null; }
  destroy() { for (const t of this.baked) t.destroy(true); this.baked = []; this.live = []; }
}

const scale = (c: number, k: number) => { const [r, g, b] = rgb(c); return ((r * k) << 16) | ((g * k) << 8) | (b * k | 0); };

function bake(def: LightDef): Texture {
  const size = Math.ceil(def.r * 2), { c, g } = canvas(size, size);
  const img = g.createImageData(size, size), d = img.data, [cr, cg, cb] = rgb(def.color), steps = 9;
  const ox = def.x - def.r, oy = def.y - def.r;
  const clip = def.room ? ROOM_RECTS.find(q => q.id === def.room)! : null;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const wx = ox + x + .5, wy = oy + y + .5, p = { x: wx, y: wy };
    if (clip ? !(inside(p, clip.rect) || clip.door.some(r => inside(p, r))) : ROOM_RECTS.some(q => inside(p, q.rect))) continue;
    const f = lightFalloff(Math.hypot(x + .5 - def.r, y + .5 - def.r), def.r) * def.k;
    if (f <= 0) continue;
    const v = f * steps, base = Math.floor(v), q = (base + (bayer(Math.floor(wx), Math.floor(wy)) < v - base ? 1 : 0)) / steps;
    const i = (y * size + x) * 4;
    d[i] = cr * q; d[i + 1] = cg * q; d[i + 2] = cb * q; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const source = new CanvasSource({ resource: c, scaleMode: 'nearest' });
  return new Texture({ source });
}
