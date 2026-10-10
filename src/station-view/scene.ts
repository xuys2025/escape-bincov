import { Application, CanvasSource, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js';
import { BEACON, DOORWAYS, H, LIGHTS, PROPS, ROOMS, SHED, STATIONS, T, W, WALL_H, domainAt, walls, type PropDef, type RoomId, type StationId, type WallTile } from './layout';
import { Atmosphere } from './atmos';
import { bakeGround } from './art/ground';
import { paintPerson, POSE_FRAMES, type Dir, type Pose } from './art/people';
import { paintProp } from './art/props';
import { paintCanopy, paintMast, paintRoof } from './art/roofs';
import { paintWall } from './art/walls';
import { Lighting, MOODS, type Power } from './lighting';
import { canvas, rim } from './paint';
import { releaseManagedSlots } from '../coast-view/renderer-lifetime';
import { emitOf, npcFrame, pick, type StationArt } from './art/station';

export type Facility = 'rest' | 'medical' | 'training' | 'workbench' | 'blackmarket';
export interface ActorView { id: string; look: string; x: number; y: number; dir: Dir; pose: Pose; frame: number; sol?: boolean; solDir?: number }
export interface SceneState {
  player: { x: number; y: number; dir8: number; walkFrame: number };
  actors: ActorView[];
  power: Power; gateOpen: boolean; facilities: Record<Facility, number>; upgraded: boolean;
  focus: StationId | null;
  /** Room whose roof is lifted besides the player's own (a station opened from afar). */
  peekRoom: RoomId | null;
  /** World point the camera looks at, and CSS px on the right covered by a docked panel. */
  look: { x: number; y: number }; panelInset: number;
  /** Fade to black (0..1) for departure/return. */
  curtain: number;
  training: { active: boolean; progress: number } | null;
  workbench: { progress: number | null; ready: number };
  /** Side door the player is near: floor chevrons point through it (dir +1 east, -1 west). */
  doorHint: { x: number; y: number; dir: 1 | -1 } | null;
}

interface Upright {
  /** A sprite; a wall is a container of light cells (see lightWall). */
  sprite: Container; z: number; sx: number; sy: number; domain: RoomId | null; kind: 'wall' | 'prop' | 'actor';
  fade: number; room?: RoomId | null; prop?: PropDef; wall?: WallTile; boost?: number; capShade?: boolean;
  lit?: WallLit;
}
/** Per-wall lighting data that does not change from frame to frame, and the tints last given to its cells. */
interface WallLit { cells: Sprite[]; corners: (RoomId | null)[]; left?: Upright; right?: Upright; tints: number[] }

const tex = (c: HTMLCanvasElement) => new Texture({ source: new CanvasSource({ resource: c, scaleMode: 'nearest' }) });
/**
 * Walls are lit in cells (OPUS-STATION-LIGHT-01): the top as 4x4 cells over its ground square, the face as 8 columns
 * along its foot (lamps close to a wall make the steepest change across a face). Light is sampled at tile corners and
 * edges, which neighbouring tiles share, and interpolated across the cells, so it changes every 8 px on wall tops and
 * every 4 px on faces, and never jumps at a tile seam.
 */
const WALL_CELLS = 4, FACE_COLUMNS = 8;
const mix = (a: number, b: number, t: number) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  return (Math.round(ar + (((b >> 16) & 255) - ar) * t) << 16) | (Math.round(ag + (((b >> 8) & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t);
};
/** Room whose footprint (walls included) holds a ground corner, or null for open ground. */
const roomAtCorner = (x: number, y: number) => ROOMS.find(r => x >= r.x * T && x <= (r.x + r.w) * T && y >= r.y * T && y <= (r.y + r.h) * T)?.id ?? null;
const DOMAIN_INDEX = new Map<RoomId | null, number>([[null, 0], ...ROOMS.map((r, i) => [r.id, i + 1] as [RoomId, number])]);
const SOL_DIR: Record<number, [string, boolean]> = { 0: ['e', false], 1: ['se', false], 2: ['s', false], 3: ['se', true], 4: ['e', true], 5: ['ne', true], 6: ['n', false], 7: ['ne', false] };

export class HideoutScene {
  private screen = new Sprite();
  private groundRoot = new Container(); private lightRoot = new Container(); private upperRoot = new Container(); private glowRoot = new Container();
  private lightHolder = new Container(); private lightOverlay = new Sprite();
  private sorted = new Container(); private overhead = new Container(); private shadows = new Container(); private marks = new Graphics();
  private worldRT!: RenderTexture; private lightRT!: RenderTexture;
  /**
   * Emission of walls and props, painted in depth order with the characters' silhouettes in black: someone standing in
   * front of a lit screen or window blocks its glow instead of wearing it on the face. Composited additively.
   */
  private depthGlow = new Container(); private glowRT!: RenderTexture; private glowLayer = new Sprite(); private glowHolder = new Container();
  private occluders = new Map<Sprite, Sprite>();
  readonly light = new Lighting();
  readonly atmos: Atmosphere;
  private textures = new Map<string, Texture>();
  private uprights: Upright[] = [];
  private roofs = new Map<RoomId, { sprite: Sprite; alpha: number }>();
  private canopy!: Sprite; private canopyAlpha = 1; private mast!: Sprite; private wires: Graphics[] = [];
  private actorSprites = new Map<string, { body: Sprite; shadow: Sprite; rim: Sprite; up: Upright }>();
  private playerUp!: Upright; private player = new Sprite(); private playerShadow = new Sprite(); private playerEdge = new Sprite();
  private wallSprites = new Map<string, { up: Upright; gate?: boolean }>();
  /** Cell textures (frames of a wall texture) and the per-frame cache of masonry light samples. */
  private wallCellTextures = new Map<Texture, Texture[]>();
  private masonry = new Map<number, number>();
  /** Delivered multi-frame props (fire) and power variants (generator stopped / running). */
  private animated: { id: string; frames: Texture[] }[] = [];
  private powered = new Map<string, [Texture, Texture]>();
  private poweredGlow = new Map<string, [Texture, Texture]>();
  private glowTint = new Map<Sprite, () => number>();
  private npcCanvases = new Map<string, HTMLCanvasElement>();
  private propSprites = new Map<string, Upright>();
  private glows: { sprite: Sprite; level: () => number; room: RoomId | null; tint?: number }[] = [];
  private curtain = new Graphics();
  private gateOpen = false;
  view = { w: 640, h: 360, s: 2, W: 1280, H: 720, dpr: 1, zoom: 0 };
  cam = { x: 0, y: 0 }; private camF = { x: -1, y: -1 };
  time = 0;
  stats = { frameMs: 0, sprites: 0 };
  /** Roofs lifted in the last frame (tests read it). */
  lastHidden: RoomId[] = [];

  constructor(private app: Application, private sol: Map<string, HTMLCanvasElement>, readonly opts: { reduced: boolean; mood: string }, private art: StationArt = new Map()) {
    this.light.mood = MOODS[opts.mood] ?? MOODS.night;
    this.atmos = new Atmosphere(this.light, opts.reduced);
    const ground = new Sprite(this.t('ground', bakeGround));
    this.groundRoot.addChild(ground, this.shadows, this.atmos.ground, this.marks);
    this.lightRoot.addChild(this.light.layer);
    this.lightOverlay.blendMode = 'multiply'; this.lightHolder.addChild(this.lightOverlay);
    this.sorted.sortableChildren = true; this.depthGlow.sortableChildren = true; this.glowLayer.blendMode = 'add'; this.glowHolder.addChild(this.glowLayer);
    this.upperRoot.addChild(this.sorted, this.overhead, this.atmos.front);
    this.glowRoot.addChild(this.atmos.glow);
    this.app.stage.addChild(this.screen, this.curtain);
    this.buildWalls(); this.buildProps(); this.buildRoofs(); this.buildGlows();
    this.player.anchor.set(.5, 1); this.playerShadow.texture = this.shadowTex(); this.playerShadow.anchor.set(.5);
    this.shadows.addChild(this.playerShadow);
    this.playerUp = { sprite: this.player, z: 0, sx: 0, sy: 0, domain: null, kind: 'actor', fade: 1, boost: 26 };
    this.sorted.addChild(this.player);
    this.playerEdge.anchor.set(.5, (48 + 1) / 50); this.playerEdge.blendMode = 'add'; this.glowRoot.addChild(this.playerEdge);
    this.resize();
  }

  private t(key: string, paint: () => HTMLCanvasElement): Texture {
    let t = this.textures.get(key);
    if (!t) { t = tex(paint()); this.textures.set(key, t); }
    return t;
  }
  private shadowTex() {
    return this.t('shadow', () => { const { c, g } = canvas(20, 7); g.fillStyle = 'rgba(8,8,10,.55)'; for (let y = 0; y < 7; y++) for (let x = 0; x < 20; x++) if (((x - 9.5) / 10) ** 2 + ((y - 3) / 3.5) ** 2 <= 1) g.fillRect(x, y, 1, 1); return c; });
  }

  private buildWalls() {
    for (const w of walls.values()) {
      const art = paintWall(w, false), s = new Container(); this.dressWall(s, this.t(`wall:${w.x},${w.y}:0`, () => art.canvas));
      const hasFace = art.canvas.height > T, top = (w.y + 1) * T - art.canvas.height;
      s.position.set(w.x * T, top);
      const room = w.owner === 'yard' ? null : w.owner;
      // Exterior faces are lit from outside (sample just south of the wall), interior faces from inside the room.
      const domain = w.face === 'int' ? room : w.door && room ? room : null;
      const up: Upright = { sprite: s, z: (w.y + 1) * T + (hasFace ? 0 : -.5), sx: w.x * T + 16, sy: (w.y + 1) * T + (w.face === 'int' ? 8 : 6), domain: w.face === 'ext' || w.gate ? null : domain, kind: 'wall', fade: 1, wall: w, room };
      this.add(up);
      this.wallSprites.set(`${w.x},${w.y}`, { up, gate: w.gate === 'main' });
      if (art.glow) {
        const g = new Sprite(this.t(`wglow:${w.x},${w.y}`, () => art.glow!)); g.position.copyFrom(s.position); g.blendMode = 'add';
        const r = ROOMS.find(q => q.id === w.owner)!, main = LIGHTS.filter(l => l.room === r.id);
        g.zIndex = up.z; this.depthGlow.addChild(g);
        const underCanopy = w.y === SHED.y - 1 && w.x >= SHED.x && w.x < SHED.x + SHED.w;
        this.glows.push({ sprite: g, room: null, tint: main.find(l => l.power === 'restored')?.color ?? 0xffc080, level: () => Math.min(1, main.reduce((n, l) => n + this.light.levelOf(l.id) * (l.power === 'restored' ? .8 : .35), 0)) * (underCanopy ? 1 - this.canopyAlpha : 1) });
      }
    }
    // Static lighting data per wall: its cells, the rooms holding its four top corners and its faced neighbours.
    const faced = (v?: Upright) => v && v.sprite.children.length > WALL_CELLS * WALL_CELLS ? v : undefined;
    for (const { up } of this.wallSprites.values()) {
      const w = up.wall!, x0 = w.x * T, y0 = w.y * T;
      up.lit = { cells: up.sprite.children as Sprite[], corners: [roomAtCorner(x0, y0), roomAtCorner(x0 + T, y0), roomAtCorner(x0, y0 + T), roomAtCorner(x0 + T, y0 + T)], tints: [],
        left: faced(this.wallSprites.get(`${w.x - 1},${w.y}`)?.up), right: faced(this.wallSprites.get(`${w.x + 1},${w.y}`)?.up) };
    }
  }
  private setGate(open: boolean) {
    if (open === this.gateOpen) return;
    this.gateOpen = open;
    for (const [k, v] of this.wallSprites) if (v.gate) {
      const w = v.up.wall!; this.dressWall(v.up.sprite, this.t(`wall:${k}:${open ? 1 : 0}`, () => paintWall(w, open).canvas));
      if (v.up.lit) { v.up.lit.cells = v.up.sprite.children as Sprite[]; v.up.lit.tints = []; }
    }
  }
  /** Cut a wall texture into its light cells: 4x4 over the top (first T px), 8 columns over the face below it. */
  private wallCells(base: Texture): Texture[] {
    let list = this.wallCellTextures.get(base);
    if (list) return list;
    const n = WALL_CELLS, cw = base.width / n, capH = Math.min(T, base.height), faceH = base.height - capH;
    list = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) list.push(new Texture({ source: base.source, frame: new Rectangle(i * cw, j * capH / n, cw, capH / n) }));
    if (faceH > 0) for (let i = 0, fw = base.width / FACE_COLUMNS; i < FACE_COLUMNS; i++) list.push(new Texture({ source: base.source, frame: new Rectangle(i * fw, capH, fw, faceH) }));
    this.wallCellTextures.set(base, list);
    return list;
  }
  private dressWall(c: Container, base: Texture) {
    const cells = this.wallCells(base);
    while (c.children.length < cells.length) c.addChild(new Sprite());
    while (c.children.length > cells.length) c.removeChildAt(c.children.length - 1).destroy();
    cells.forEach((t, k) => { const s = c.children[k] as Sprite; s.texture = t; s.position.set(t.frame.x, t.frame.y); });
  }
  private masonryAt(x: number, y: number, domain: RoomId | null): number {
    const key = ((x + 2048) * 8192 + (y + 2048)) * 16 + DOMAIN_INDEX.get(domain)!;
    let c = this.masonry.get(key);
    if (c === undefined) { c = this.light.sample(x, y, domain, 0, true); this.masonry.set(key, c); }
    return c;
  }
  /**
   * Top of a wall at a ground corner: the open-air light, half of it from the room whose footprint (walls included)
   * holds the corner. It depends on the corner alone, so tiles of different buildings meeting there agree.
   */
  private capAt(x: number, y: number, room: RoomId | null) {
    const out = this.masonryAt(x, y, null);
    return room ? mix(out, this.masonryAt(x, y, room), .5) : out;
  }
  private setCell(lit: WallLit, k: number, tint: number) { if (lit.tints[k] !== tint) { lit.tints[k] = tint; lit.cells[k].tint = tint; } }
  private lightWall(u: Upright) {
    const w = u.wall!, lit = u.lit!, n = WALL_CELLS, x0 = w.x * T, y0 = w.y * T, k = lit.corners;
    const c00 = this.capAt(x0, y0, k[0]), c10 = this.capAt(x0 + T, y0, k[1]), c01 = this.capAt(x0, y0 + T, k[2]), c11 = this.capAt(x0 + T, y0 + T, k[3]);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const fx = (i + .5) / n, fy = (j + .5) / n;
      this.setCell(lit, j * n + i, mix(mix(c00, c10, fx), mix(c01, c11, fx), fy));
    }
    if (lit.cells.length <= n * n) return;
    // Face: sampled along the foot line. Where the neighbouring face is lit from the other side (an interior face next
    // to an exterior one, a doorway), the shared edge takes both, the same value seen from either tile.
    const edge = (x: number, v?: Upright) => {
      const own = this.masonryAt(x, u.sy, u.domain);
      return !v || (v.domain === u.domain && v.sy === u.sy) ? own : mix(own, this.masonryAt(x, v.sy, v.domain), .5);
    };
    const L = edge(x0, lit.left), C = this.masonryAt(x0 + T / 2, u.sy, u.domain), R = edge(x0 + T, lit.right);
    for (let i = 0; i < FACE_COLUMNS; i++) { const f = (i + .5) / FACE_COLUMNS; this.setCell(lit, n * n + i, f < .5 ? mix(L, C, f * 2) : mix(C, R, f * 2 - 1)); }
  }

  private buildProps() {
    for (const p of PROPS) {
      const art = paintProp(p.kind, p.tw, p.th), W0 = art.canvas.width, H0 = art.canvas.height;
      // Sol's delivery replaces the placeholder at the same canvas size; the generator has stopped / running states,
      // each with its own emission mask (manifest `emit`).
      const variant = p.kind === 'generator' ? ['-stopped', '-running'] : null;
      const solId = [`station-prop-${p.kind}${variant ? variant[0] : ''}-v1`, `station-prop-${p.kind}-v1`].find(id => pick(this.art, id, W0, H0));
      const sol = solId ? pick(this.art, solId, W0, H0) : null;
      const frames = [0, 1, 2, 3].map(f => pick(this.art, `station-prop-${p.kind}-f${f}-v1`, W0, H0)).filter((c): c is HTMLCanvasElement => !!c);
      if (sol) art.canvas = sol;
      else if (frames.length) art.canvas = frames[0];
      const emitId = solId ? emitOf(solId) : null, emit = emitId ? pick(this.art, emitId, W0, H0) : null;
      if (sol) art.glow = emit ?? undefined;
      if (frames.length > 1) this.animated.push({ id: p.id, frames: frames.map((c, i) => this.t(`prop:${p.id}:f${i}`, () => c)) });
      if (variant && sol) {
        const runId = `station-prop-${p.kind}${variant[1]}-v1`, run = pick(this.art, runId, W0, H0), runEmitId = emitOf(runId), runEmit = runEmitId ? pick(this.art, runEmitId, W0, H0) : null;
        if (run) this.powered.set(p.id, [this.t(`prop:${p.id}`, () => sol), this.t(`prop:${p.id}:run`, () => run)]);
        if (emit && runEmit) this.poweredGlow.set(p.id, [this.t(`pglow:${p.id}`, () => emit), this.t(`pglow:${p.id}:run`, () => runEmit)]);
      }
      const s = new Sprite(this.t(`prop:${p.id}`, () => art.canvas));
      const foot = (p.ty + p.th) * T;
      s.position.set(p.tx * T, foot - art.canvas.height);
      const up: Upright = { sprite: s, z: foot + (p.zOffset ?? 0) - (p.blocks === false ? 2 : 0), sx: (p.tx + p.tw / 2) * T, sy: foot - 4, domain: p.room, kind: 'prop', fade: 1, prop: p, room: p.room };
      this.add(up); this.propSprites.set(p.id, up);
      if (art.glow) {
        const g = new Sprite(this.t(`pglow:${p.id}`, () => art.glow!)); g.position.copyFrom(s.position); g.blendMode = 'add';
        const lightId = ({ stove: 'stove', 'radio-desk': 'radio-dial', 'fire-barrel': 'barrel-fire', 'gear-table-lantern': 'cold-lantern', heater: 'dorm-bulb' } as Record<string, string>)[p.kind];
        g.zIndex = up.z; this.depthGlow.addChild(g);
        // Delivered masks are white: the runtime colours them (screens green, fire orange, the generator's lamps red on
        // emergency power and green when it runs). Placeholder glows keep their painted colours.
        const tint = sol ? ({ 'radio-desk': 0x9dffb0, stove: 0xff8a3a } as Record<string, number>)[p.kind] : undefined;
        this.glows.push({ sprite: g, room: p.room, tint, level: () => p.kind === 'generator' ? (this.light.power === 'restored' ? 1 : .6) : lightId ? this.light.levelOf(lightId) : 1 });
        if (p.kind === 'generator' && sol) this.glowTint.set(g, () => this.light.power === 'restored' ? 0x6aff8a : 0xff4a3a);
        (up as Upright & { glow?: Sprite }).glow = g;
      }
    }
  }
  private buildRoofs() {
    for (const r of ROOMS) {
      const s = new Sprite(this.t(`roof:${r.id}`, () => {
        const sol = pick(this.art, `station-roof-${r.id}-v1`, r.w * T, r.h * T);
        if (!sol) return paintRoof(r);
        const sign = r.id === 'canteen' ? pick(this.art, 'station-roof-sign-v1', 136, 36) : null;
        if (!sign) return sol;
        const { c, g } = canvas(sol.width, sol.height); g.drawImage(sol, 0, 0); g.drawImage(sign, Math.round(sol.width / 2 - 68), sol.height - 36); return c;
      }));
      s.position.set(r.x * T, r.y * T - WALL_H);
      this.overhead.addChild(s); this.roofs.set(r.id, { sprite: s, alpha: 1 });
    }
    this.canopy = new Sprite(this.t('canopy', () => pick(this.art, 'station-roof-canopy-v1', SHED.w * T, SHED.h * T + 6) ?? paintCanopy())); this.canopy.position.set(SHED.x * T, SHED.y * T - 44); this.overhead.addChild(this.canopy);
    this.mast = new Sprite(this.t('mast', () => pick(this.art, 'station-roof-mast-v1', 16, 100) ?? paintMast())); this.mast.position.set(BEACON.x - 8, BEACON.y - BEACON.head + 4); this.overhead.addChild(this.mast);
    // Overhead wires: silhouettes against the lit yard, drawn above roofs.
    for (const w of WIRES) { const g = new Graphics(); drawWire(g, w); this.overhead.addChild(g); this.wires.push(g); }
  }
  private buildGlows() {
    const halo = (r: number) => this.t(`halo:${r}`, () => {
      const { c, g } = canvas(r * 2, r * 2), img = g.createImageData(r * 2, r * 2);
      for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
        const d = Math.hypot(x + .5 - r, y + .5 - r) / r, a = d < .18 ? 1 : Math.max(0, (1 - d) ** 2.4) * .8, i = (y * r * 2 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * a); img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); return c;
    });
    for (const l of LIGHTS) {
      if (l.kind === 'fire' || l.kind === 'stove' || l.kind === 'string') continue;
      const r = l.kind === 'flood' ? 18 : l.kind === 'sodium' ? 14 : l.kind === 'radio' ? 8 : 10;
      const s = new Sprite(halo(r)); s.anchor.set(.5); s.blendMode = 'add'; s.tint = l.color;
      s.position.set(l.x, l.y - l.head);
      // Depth of the lamp's base: whoever stands in front of the pole or the desk blocks its halo.
      s.zIndex = l.y; this.depthGlow.addChild(s);
      this.glows.push({ sprite: s, room: l.room, level: () => this.light.levelOf(l.id) * .9 });
    }
    // Festoon of bulbs on the wire between the two north poles; each bulb follows the nearest string light's level.
    for (let i = 1; i < 24; i++) {
      const p = wirePoint(STRING_WIRE, i / 24), b = new Sprite(halo(4)); b.anchor.set(.5); b.blendMode = 'add'; b.tint = i % 3 ? 0xffd090 : 0xfff2c8;
      b.position.set(p.x, p.y + 3); this.glowRoot.addChild(b);
      const id = p.x < 13.5 * T ? 'string-a' : p.x < 17.5 * T ? 'string-b' : 'string-c';
      this.glows.push({ sprite: b, room: null, level: () => this.light.levelOf(id) * 1.6 * (.75 + .25 * Math.sin(this.time * 2 + i)) });
    }
    const beacon = new Sprite(halo(10)); beacon.anchor.set(.5); beacon.blendMode = 'add'; beacon.tint = 0xff3020; beacon.position.set(BEACON.x, BEACON.y - BEACON.head + 5);
    this.glowRoot.addChild(beacon);
    this.glows.push({ sprite: beacon, room: null, level: () => this.mast.visible ? (Math.floor(this.time * 1.25) % 2 ? .25 : 1) : 0 });
  }

  private add(up: Upright) { this.uprights.push(up); this.sorted.addChild(up.sprite); }

  /**
   * A world rect that must be fully in view (the power-on sequence frames the whole compound, F02); null is normal
   * play. Fitting uses the largest whole-number scale that shows the rect, or a fractional one (smoothly filtered)
   * when even 1x is too large, so narrow and portrait screens see every lamp too. The player's own zoom is kept and
   * comes back with `setFit(null)`; a window resize while fitting refits.
   */
  fit: { x: number; y: number; w: number; h: number } | null = null;
  setFit(rect: { x: number; y: number; w: number; h: number } | null) {
    if (JSON.stringify(rect) === JSON.stringify(this.fit)) return;
    this.fit = rect; this.resize(); this.camF = { x: -1, y: -1 };
  }
  resize() {
    const canvasEl = this.app.canvas, dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = canvasEl.parentElement?.clientWidth || innerWidth, cssH = canvasEl.parentElement?.clientHeight || innerHeight;
    const Wd = Math.max(1, Math.round(cssW * dpr)), Hd = Math.max(1, Math.round(cssH * dpr));
    const target = cssW >= 1100 ? 640 : 470;
    let s = Math.max(1, Math.min(Math.round(Wd / target), Math.floor(Hd / 240)));
    s = Math.max(1, s + this.view.zoom);
    if (this.fit) { const f = Math.min(Wd / this.fit.w, Hd / this.fit.h); s = f >= 1 ? Math.floor(f) : f; }
    const w = Math.ceil(Wd / s), h = Math.ceil(Hd / s), smooth = s < 1;
    this.view = { ...this.view, w, h, s, W: Wd, H: Hd, dpr };
    this.app.renderer.resize(Wd, Hd);
    canvasEl.style.width = `${cssW}px`; canvasEl.style.height = `${cssH}px`;
    this.releaseTargets();
    this.worldRT = RenderTexture.create({ width: w, height: h, scaleMode: smooth ? 'linear' : 'nearest' });
    this.lightRT = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' });
    this.glowRT = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' }); this.glowLayer.texture = this.glowRT;
    this.lightOverlay.texture = this.lightRT; this.screen.texture = this.worldRT; this.screen.scale.set(s);
  }
  /**
   * Destroy the three render targets with their sources. Their GPU texture slots are then null placeholders that
   * nothing takes back (a context restore has already nulled them, else the destroy does), so drop exactly those.
   */
  private releaseTargets() {
    const targets = [this.worldRT, this.lightRT, this.glowRT].filter(t => t && !t.destroyed), uids = targets.map(t => t.source.uid);
    for (const t of targets) t.destroy(true);
    releaseManagedSlots(this.app, 'glTexture', uids);
  }
  /** Jump the camera to its target on the next frame (after a teleport). */
  snapCamera() { this.camF = { x: -1, y: -1 }; }
  zoom(delta: number) { this.view.zoom = Math.max(-1, Math.min(1, this.view.zoom + delta)); this.resize(); }

  private playerTex(dir8: number, frame: number): Texture {
    const [d, mirror] = SOL_DIR[dir8] ?? SOL_DIR[2];
    return this.t(`sol:${dir8}:${frame}`, () => {
      const src = this.sol.get(`coast-player-body-${d}-f${frame}-v1`);
      if (!src) return paintPerson('resident-b', d === 'n' || d === 'ne' ? 'n' : d === 'e' ? (mirror ? 'w' : 'e') : 's', frame ? 'walk' : 'idle', frame % 4);
      const { c, g } = canvas(src.width, src.height);
      if (mirror) { g.translate(src.width, 0); g.scale(-1, 1); }
      g.drawImage(src, 0, 0); return c;
    });
  }
  /** NPC frame: Sol's delivered frame when there is one (see art/station.ts fallbacks), else the placeholder. */
  private npcCanvas(a: ActorView): HTMLCanvasElement {
    const f = a.frame % POSE_FRAMES[a.pose], key = `${a.look}:${a.dir}:${a.pose}:${f}`;
    let c = this.npcCanvases.get(key);
    if (!c) { c = npcFrame(this.art, a.look, a.dir, a.pose, f) ?? paintPerson(a.look, a.dir, a.pose, f); this.npcCanvases.set(key, c); }
    return c;
  }
  private actorTex(a: ActorView): Texture {
    const f = a.frame % POSE_FRAMES[a.pose];
    return this.t(`npc:${a.look}:${a.dir}:${a.pose}:${f}`, () => this.npcCanvas(a));
  }
  private rimTex(a: ActorView): Texture {
    const f = a.frame % POSE_FRAMES[a.pose];
    return this.t(`rim:${a.look}:${a.dir}:${a.pose}:${f}`, () => rim(this.npcCanvas(a), '#ffd690'));
  }

  /** World point to CSS px (for DOM labels). */
  toScreen(x: number, y: number) { return { x: (x - this.cam.x) * this.view.s / this.view.dpr, y: (y - this.cam.y) * this.view.s / this.view.dpr }; }
  toWorld(cssX: number, cssY: number) { return { x: cssX * this.view.dpr / this.view.s + this.cam.x, y: cssY * this.view.dpr / this.view.s + this.cam.y }; }

  render(dt: number, st: SceneState) {
    const t0 = performance.now();
    this.time += dt;
    this.setGate(st.gateOpen);
    if (this.light.power !== st.power && !this.light.sequencing) this.light.setPower(st.power, false);
    this.light.update(dt);

    // Camera: centre the look point in the part of the screen not covered by a docked panel.
    const { w, h } = this.view, inset = st.panelInset * this.view.dpr / this.view.s;
    let cx = st.look.x - (w - inset) / 2, cy = st.look.y - h / 2 - 12;
    cx = Math.max(0, Math.min(W * T - w + inset, cx)); cy = Math.max(-WALL_H - 10, Math.min(H * T - h + 10, cy));
    if (this.fit) { cx = this.fit.x + this.fit.w / 2 - w / 2; cy = this.fit.y + this.fit.h / 2 - h / 2; this.camF = { x: cx, y: cy }; }
    if (this.camF.x < 0) this.camF = { x: cx, y: cy };
    const k = Math.min(1, dt * 7);
    this.camF.x += (cx - this.camF.x) * k; this.camF.y += (cy - this.camF.y) * k;
    this.cam = { x: Math.round(this.camF.x), y: Math.round(this.camF.y) };
    for (const r of [this.groundRoot, this.lightRoot, this.upperRoot, this.glowRoot, this.depthGlow]) r.position.set(-this.cam.x, -this.cam.y);

    // Which roofs are lifted: the player's room (doorways count) and a room peeked at from a panel.
    const pRoom = domainAt(st.player.x, st.player.y), hidden = new Set<RoomId>();
    if (pRoom) hidden.add(pRoom);
    if (st.peekRoom) hidden.add(st.peekRoom);
    // Near a doorway, lift the roof on its other side so the way through shows (F01): within 2.6 tiles of a door
    // between two rooms, 1.3 tiles of a door to open ground.
    for (const d of DOORWAYS) {
      if (pRoom !== d.a && pRoom !== d.b) continue;
      const other = pRoom === d.a ? d.b : d.a, reach = (d.a && d.b ? 2.6 : 1.3) * T;
      if (other && Math.hypot(st.player.x - (d.x * T + 16), st.player.y - (d.y * T + 16)) < reach) hidden.add(other);
    }
    this.lastHidden = [...hidden];
    for (const [id, r] of this.roofs) { const want = hidden.has(id) ? 0 : 1; r.alpha += (want - r.alpha) * Math.min(1, dt * 9); r.sprite.alpha = r.alpha; r.sprite.visible = r.alpha > .01; r.sprite.tint = this.light.sample((ROOMS.find(q => q.id === id)!.x + 2) * T, (ROOMS.find(q => q.id === id)!.y + 7) * T, null, 6); }
    const nearShed = st.player.x > (SHED.x - .5) * T && st.player.x < (SHED.x + SHED.w + .5) * T && st.player.y > SHED.y * T && st.player.y < (SHED.y + SHED.h + 1.4) * T;
    this.canopyAlpha += ((nearShed || st.focus === 'arms' ? .18 : .94) - this.canopyAlpha) * Math.min(1, dt * 8);
    this.canopy.alpha = this.canopyAlpha; this.canopy.tint = this.light.sample(4 * T, 18.8 * T, null, 10);
    this.mast.visible = !hidden.has('radio'); this.mast.tint = this.light.sample(31 * T, 8 * T, null, 20);
    for (const w of this.wires) w.tint = this.light.sample(17 * T, 10 * T, null, 0);

    // Facility levels, power and stash upgrade decide which props stand.
    for (const up of this.propSprites.values()) {
      const p = up.prop!; let show = true;
      if (p.facility && p.facility.id !== 'blackmarket') show = p.facility.below ? st.facilities[p.facility.id] < p.facility.min : st.facilities[p.facility.id] >= p.facility.min;
      if (p.power) show = show && p.power === st.power;
      if (p.upgraded) show = show && st.upgraded;
      const pw = this.powered.get(p.id); if (pw) (up.sprite as Sprite).texture = pw[st.power === 'restored' ? 1 : 0];
      const pg = this.poweredGlow.get(p.id), gl = (up as Upright & { glow?: Sprite }).glow; if (pg && gl) gl.texture = pg[st.power === 'restored' ? 1 : 0];
      up.sprite.visible = show;
      const g = (up as Upright & { glow?: Sprite }).glow; if (g) g.visible = show;
    }

    for (const a of this.animated) { const up = this.propSprites.get(a.id); if (up) (up.sprite as Sprite).texture = a.frames[Math.floor(this.time * 8) % a.frames.length]; }
    // Player (Sol's body frames) and the other actors.
    this.player.texture = this.playerTex(st.player.dir8, st.player.walkFrame);
    // Faint warm edge so the player separates from dark wet concrete (fades out under bright lamps).
    const pk = `sol:${st.player.dir8}:${st.player.walkFrame}`;
    this.playerEdge.texture = this.t(`${pk}|edge`, () => rim((this.player.texture.source.resource as HTMLCanvasElement), '#b89a6a'));
    this.playerEdge.position.set(Math.round(st.player.x), Math.round(st.player.y) + 1);
    this.player.position.set(Math.round(st.player.x), Math.round(st.player.y) + 1);
    this.playerShadow.position.set(Math.round(st.player.x), Math.round(st.player.y));
    Object.assign(this.playerUp, { z: st.player.y, sx: st.player.x, sy: st.player.y - 2, domain: pRoom });
    const seen = new Set<string>();
    for (const a of st.actors) {
      seen.add(a.id);
      let e = this.actorSprites.get(a.id);
      if (!e) {
        const body = new Sprite(); body.anchor.set(.5, 1); const shadow = new Sprite(this.shadowTex()); shadow.anchor.set(.5);
        const rimS = new Sprite(); rimS.anchor.set(.5, (48 + 1) / 50); rimS.blendMode = 'add';
        const up: Upright = { sprite: body, z: a.y, sx: a.x, sy: a.y, domain: domainAt(a.x, a.y), kind: 'actor', fade: 1, boost: 14 };
        this.add(up); this.shadows.addChild(shadow); this.glowRoot.addChild(rimS);
        e = { body, shadow, rim: rimS, up }; this.actorSprites.set(a.id, e);
      }
      e.body.texture = this.actorTex(a); e.body.position.set(Math.round(a.x), Math.round(a.y) + 1);
      e.shadow.position.set(Math.round(a.x), Math.round(a.y));
      Object.assign(e.up, { z: a.y, sx: a.x, sy: a.y - 2, domain: domainAt(a.x, a.y) });
      const roomed = e.up.domain && !hidden.has(e.up.domain);
      e.body.visible = e.shadow.visible = !roomed;
      const focused = !!st.focus && STATIONS.find(s => s.id === st.focus)?.who !== undefined && a.id === st.focus;
      e.rim.visible = focused && !roomed;
      if (e.rim.visible) { e.rim.texture = this.rimTex(a); e.rim.position.set(Math.round(a.x), Math.round(a.y) + 1); e.rim.alpha = .55 + .25 * Math.sin(this.time * 5); }
    }
    for (const [id, e] of this.actorSprites) if (!seen.has(id)) { e.body.visible = e.shadow.visible = e.rim.visible = false; }

    // Light every upright at its feet; fade what stands between the camera and the player.
    const pr = { x: st.player.x - 10, y: st.player.y - 42, w: 20, h: 42 };
    const all = [...this.uprights, this.playerUp];
    this.masonry.clear();
    // Walls outside the view are neither lit nor drawn (each is up to 24 light cells); they are lit again on the frame
    // they come back into view. The margin covers a wall face rising above its tile.
    const vx0 = this.cam.x - T, vx1 = this.cam.x + w + T, vy0 = this.cam.y - T, vy1 = this.cam.y + h + 3 * T;
    for (const u of all) {
      const s = u.sprite;
      if (!s.visible) continue;
      const inHiddenRoom = u.room && !hidden.has(u.room) && u.kind !== 'wall';
      if (inHiddenRoom) { s.renderable = false; continue; }
      if (u.wall && ((u.wall.x + 1) * T < vx0 || u.wall.x * T > vx1 || (u.wall.y + 1) * T < vy0 || u.wall.y * T > vy1)) { s.renderable = false; continue; }
      s.renderable = true;
      s.zIndex = u.z + (u.kind === 'actor' ? .2 : 0);
      if (u.kind === 'wall') this.lightWall(u);
      else {
        let tint = this.light.sample(u.sx, u.sy, u.domain, u.boost ?? 0);
        if (u.kind === 'actor' && u === this.playerUp) { const lum = ((tint >> 16 & 255) + (tint >> 8 & 255) + (tint & 255)) / 765; tint = maxTint(tint, 0x96969e); this.playerEdge.alpha = Math.max(0, Math.min(.6, .9 - lum * 1.3)); }
        s.tint = tint;
      }
      if (u.kind !== 'actor') {
        const b = s.getLocalBounds(), rx = s.x + b.x, ry = s.y + b.y;
        const covers = u.z > st.player.y + 1 && rx < pr.x + pr.w && rx + b.width > pr.x && ry < pr.y + pr.h && ry + b.height > pr.y && !(u.prop && u.prop.blocks === false);
        const want = covers ? (u.kind === 'wall' ? .28 : .45) : 1;
        u.fade += (want - u.fade) * Math.min(1, dt * 10); s.alpha = u.fade;
      }
    }
    // Character silhouettes for the emission pass: same frame, place and depth as the visible sprite, drawn black.
    for (const up of [this.playerUp, ...[...this.actorSprites.values()].map(e => e.up)]) {
      const b = up.sprite as Sprite;
      let o = this.occluders.get(b);
      if (!o) { o = new Sprite(); o.tint = 0x000000; this.occluders.set(b, o); this.depthGlow.addChild(o); }
      o.texture = b.texture; o.anchor.copyFrom(b.anchor); o.position.copyFrom(b.position); o.scale.copyFrom(b.scale);
      o.visible = b.visible && b.renderable; o.alpha = b.alpha; o.zIndex = b.zIndex;
    }
    // Glows follow their light; indoor ones hide under an opaque roof.
    for (const g of this.glows) {
      const lvl = g.level(), roofed = g.room && !hidden.has(g.room);
      g.sprite.alpha = roofed ? 0 : Math.max(0, Math.min(1, lvl));
      const tf = this.glowTint.get(g.sprite);
      if (tf) g.sprite.tint = tf(); else if (g.tint !== undefined) g.sprite.tint = g.tint;
      g.sprite.visible = g.sprite.alpha > .01;
    }
    // Ground marks: the focused station's stand ring, the training lane glow and the workbench state.
    this.marks.clear();
    if (st.focus) {
      const s = STATIONS.find(q => q.id === st.focus)!, p = .5 + .5 * Math.sin(this.time * 4);
      this.marks.ellipse(s.stand.x, s.stand.y + 2, 13 + p * 2, 5 + p).stroke({ width: 1, color: 0xffd690, alpha: .55 + p * .3 });
    }
    if (st.doorHint) {
      // Two chevrons on the floor beside the gap, sliding toward it.
      const h = st.doorHint, p = (this.time * 1.4) % 1, cx = h.x * T + 16 - h.dir * 30, cy = h.y * T + 18;
      for (let i = 0; i < 2; i++) {
        const x = cx + h.dir * (i * 9 + p * 6), a = (.35 + .4 * (1 - p)) * (i ? .7 : 1);
        this.marks.moveTo(x - h.dir * 4, cy - 5).lineTo(x + h.dir * 1, cy).lineTo(x - h.dir * 4, cy + 5).stroke({ width: 2, color: 0xffd690, alpha: a });
      }
    }
    if (st.training?.active) {
      const a = st.training.progress * Math.PI * 2;
      this.marks.arc(st.player.x, st.player.y, 15, -Math.PI / 2, -Math.PI / 2 + a).stroke({ width: 2, color: 0xc2e07a, alpha: .85 });
    }

    this.light.drawAmbient({ x: this.cam.x, y: this.cam.y, w, h });
    this.atmos.update(dt, { x: this.cam.x, y: this.cam.y, w, h }, hidden, st.power === 'restored');

    this.curtain.clear();
    if (st.curtain > 0) this.curtain.rect(0, 0, this.view.W, this.view.H).fill({ color: 0x050607, alpha: Math.min(1, st.curtain) });

    const r = this.app.renderer;
    r.render({ container: this.groundRoot, target: this.worldRT, clear: true, clearColor: 0x0a0c0e });
    r.render({ container: this.lightRoot, target: this.lightRT, clear: true, clearColor: 0x000000 });
    r.render({ container: this.lightHolder, target: this.worldRT, clear: false });
    r.render({ container: this.upperRoot, target: this.worldRT, clear: false });
    r.render({ container: this.depthGlow, target: this.glowRT, clear: true, clearColor: 0x000000 });
    r.render({ container: this.glowHolder, target: this.worldRT, clear: false });
    r.render({ container: this.glowRoot, target: this.worldRT, clear: false });
    this.stats.frameMs = performance.now() - t0;
    this.stats.sprites = this.sorted.children.length;
  }

  /**
   * Release everything this view created. The shared Application's stage children (screen, curtain) are destroyed by
   * the host when it parks the renderer; the off-screen roots, render targets and textures are released here.
   */
  destroy() {
    for (const r of [this.groundRoot, this.lightRoot, this.upperRoot, this.glowRoot, this.lightHolder, this.depthGlow, this.glowHolder]) r.destroy({ children: true, context: true });
    this.occluders.clear();
    this.light.destroy(); this.atmos.destroy();
    this.releaseTargets();
    // Cell frames share their wall texture's source: release the frames, then the textures with their sources.
    for (const list of this.wallCellTextures.values()) for (const t of list) t.destroy(false);
    this.wallCellTextures.clear(); this.masonry.clear();
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear(); this.npcCanvases.clear();
  }
  /** Sampled light at a world point (for DOM label contrast and tests). */
  lightAt(x: number, y: number) { return this.light.sample(x, y, domainAt(x, y)); }
}

interface Wire { a: { x: number; y: number }; b: { x: number; y: number }; sag: number }
const P2 = (x: number, y: number, h: number) => ({ x: x * T, y: y * T - h });
/** Wire ends in world px with their height already subtracted (screen-space in the 3/4 view). */
const STRING_WIRE: Wire = { a: P2(9.45, 9.2, 66), b: P2(22.55, 9.2, 66), sag: 18 };
const WIRES: Wire[] = [
  STRING_WIRE,
  { a: P2(31.5, 1.6, 84), b: P2(25.8, 1.2, 50), sag: 10 },
  { a: P2(25.4, 1.4, 50), b: P2(22.55, 9.2, 70), sag: 14 },
  { a: P2(9.45, 9.2, 70), b: P2(9.45, 19.4, 70), sag: 10 },
  { a: P2(31.5, 1.6, 84), b: P2(24.4, 19.2, 78), sag: 30 },
  { a: P2(16, 1.3, 50), b: P2(9.45, 9.2, 70), sag: 12 },
];
function wirePoint(w: Wire, t: number) { return { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t + Math.sin(t * Math.PI) * w.sag }; }
function drawWire(g: Graphics, w: Wire) {
  const n = Math.ceil(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) / 3);
  for (let i = 0; i <= n; i++) { const p = wirePoint(w, i / n); g.rect(Math.round(p.x), Math.round(p.y), 1, 1); }
  g.fill(0x9a9690);
}
const maxTint = (a: number, b: number) => (Math.max(a >> 16 & 255, b >> 16 & 255) << 16) | (Math.max(a >> 8 & 255, b >> 8 & 255) << 8) | Math.max(a & 255, b & 255);
