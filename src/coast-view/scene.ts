import { Application, Container, Graphics, RenderTexture, Sprite, type Texture } from 'pixi.js';
import { worldKeyString, type ActorKind, type ActorView, type MapDef, type Point, type PublishedView, type Rect, type StampedEvent, type ViewFrame } from '../raid-runtime/contract';
import { SAMPLE_AREA, hasRoof, isRuined, materials, regionLamps, storeys, type GroundMaterial } from './appearance';
import { paintGround, puddles, type GroundBake } from './art/ground';
import { groundGeometry } from './art/surface';
import { LOOT_FOOT, LOOT_H } from './art/props';
import { solWall, type SolArt } from './art/sol';
import { LOW_H, ROOF_MARGIN, STOREY_H, WALL_H, paintCanopy, paintCeiling, paintDownpipe, paintLintel, paintLow, paintRoof, paintStairs, paintWall, paintWallAC, wallKey, type WallSpec } from './art/structures';
import { Fx } from './fx';
import { Lighting, MOODS, lamp } from './lighting';
import { Textures } from './textures';
import { lifecycle } from './scope';
import { Weather, type RoofArea, type WeatherKind } from './weather';

export const AIM_H = 22;
/**
 * Held weapons point along the ground-plane aim, but a barrel aimed away from (north) or toward (south) the camera
 * is seen end-on in the 3/4 view, so its drawn length shrinks with |sin(aim)|. Direction stays the aim, so bullets,
 * tracers and the muzzle flash stay on the gun's line. Facing away, this keeps the gun inside the torso and pack
 * silhouette instead of poking above the head (ART-R08); simulation and muzzle distance are untouched.
 */
const heldLength = (angle: number) => 1 - .5 * Math.abs(Math.sin(angle));
/** Seconds of the fall before the corpse sprite replaces the body. */
const FALL_T = .16;
/** The feet slide back this far (world px, plus a little down) while the body tips, so the fallen body lies where the corpse is drawn. */
const FALL_SLIDE = 18;

interface Occluder {
  sprite: Sprite; key: string; kind: 'wall' | 'door' | 'roof' | 'ceiling' | 'canopy' | 'lintel';
  z: number; rect: Rect; keepBottom: number; level: number; target: number; region?: string; spec?: WallSpec;
  tall?: { full: string; flat: string; band: number; y: number; building: Rect; collapsed: boolean };
  /** A door caught between closed and open for a few frames (display only; the Runtime state already changed). */
  swing?: { t: number; key: string };
}
interface ActorGfx {
  kind: ActorKind; body: Sprite; weapon: Sprite; flash: Sprite; rim: Sprite; wrim: Sprite; shadow: Sprite; corpse: Sprite | null; corpseKey: string;
  /** Trigger and support sleeves from the shoulders to the hands painted on the held weapon. */
  arms: [Sprite, Sprite];
  /** Player only: faint warm outline so the player separates from dark asphalt (not the occlusion rim). */
  edge: Sprite | null;
  walk: number; dir: number; flashT: number; deathT: number; kick: Point; kickT: number; seen: boolean; swingT: number;
  /** Half-cycles of the walk, to put a puff of dust under each sprinting step. */
  step: number;
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });
const corpseFacing = (a: ActorView): 1 | -1 => Math.cos((a.corpse?.angle ?? a.aim) + Math.PI) >= 0 ? 1 : -1;
const dirOf = (a: number) => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;

export interface ViewOptions {
  debug: boolean; xray: boolean; mood: number; reducedMotion: boolean;
  viewTiles: 24 | 28;
  collapseTall: boolean;
  /** Decoded Sol samples; null keeps the procedural placeholders. */
  art: SolArt | null;
  /** Drizzle on the coast map (default) or a dry overcast; reduced motion keeps only a still mist. */
  weather: WeatherKind;
}

export class CoastView {
  static live = new Set<CoastView>();
  readonly tex: Textures;
  private groundRoot = new Container();
  private groundLayer = new Container();
  private flat = new Container();
  private shadows = new Container();
  private upper = new Container();
  private sorted = new Container();
  private xray = new Container();
  private overhead = new Container();
  private debugG = new Graphics();
  private exitG = new Graphics();
  private light: Lighting;
  private lightOverlay = new Sprite();
  private lightHolder = new Container();
  private worldRT: RenderTexture | null = null; private lightRT: RenderTexture | null = null; private upRT: RenderTexture | null = null;
  private upHolder = new Container(); private upSprite = new Sprite();
  readonly screen = new Sprite();
  private fx: Fx;
  readonly weather: Weather;

  private map: MapDef | null = null;
  private mapKey = ''; private epoch = -1;
  private occluders: Occluder[] = [];
  private doors = new Map<string, Occluder>();
  private actors = new Map<string, ActorGfx>();
  private bullets = new Map<string, { g: Graphics; born: Point; vx: number; vy: number }>();
  private crates = new Map<string, { s: Sprite; shadow: Sprite; empty: boolean; look: 'full' | 'empty' | 'open' }>();
  private loot = new Map<string, Sprite>();
  private muzzles: { s: Sprite; t: number }[] = [];
  private swings: { g: Graphics; t: number }[] = [];
  private highlight = new Sprite();
  private fadeClock = 0;
  private rngState = 7;
  private time = 0;
  private destroyed = false;

  cam = { x: 0, y: 0 }; private camF = { x: 0, y: 0 };
  /** Camera kick opposite the player's shot, settling back within a few frames. */
  private recoil = { x: 0, y: 0 };
  /** Crate whose loot panel is open (set by the host): drawn with its lid up. */
  openContainer: string | null = null;
  view = { w: 0, h: 0, s: 1, k: 1, dpr: 1, W: 0, H: 0 };
  last: ViewFrame | null = null;
  stats = { sprites: 0, occluders: 0, rebuilds: 0, frameMs: 0, droppedEvents: 0, events: 0, rebuildMs: 0 };
  shake = 0;
  onRebuild?: (reason: 'enter' | 'epoch' | 'map') => void;
  hudTop = 0;
  /** CSS px covered by a bottom-docked panel; the camera centres the player in the band above it. */
  panelInset = 0;

  constructor(private app: Application, public opts: ViewOptions) {
    try {
      this.tex = new Textures(opts.art);
      this.light = new Lighting(this.tex);
      this.weather = new Weather(this.tex, opts.weather, opts.reducedMotion);
      this.groundRoot.addChild(this.groundLayer, this.flat, this.shadows, this.weather.back);
      this.sorted.sortableChildren = true;
      this.upper.addChild(this.sorted, this.xray, this.overhead, this.weather.front, this.debugG);
      this.lightOverlay.blendMode = 'multiply';
      this.lightHolder.addChild(this.lightOverlay);
      this.upHolder.addChild(this.upSprite);
      this.fx = new Fx(this.tex, this.sorted, this.flat, (x, y) => this.regionAt({ x, y }));
      this.tex.warm(['player', 'scav', 'salt', 'creature', 'elite']);
      this.resize();
      CoastView.live.add(this);
    } catch (error) { this.destroy(); throw error; }
  }

  rnd = () => { let t = (this.rngState += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), 1 | t); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  resize() {
    const canvas = this.app.canvas, rect = (canvas.parentElement ?? canvas).getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round((rect.width || innerWidth) * dpr)), H = Math.max(1, Math.round((rect.height || innerHeight) * dpr));
    const tw = this.opts.viewTiles * 32, th = this.opts.viewTiles === 28 ? 466 : 400;
    let s = Math.max(1, Math.min(W / tw, H / th));
    if (Math.abs(s - Math.round(s)) < .08) s = Math.round(s);
    const k = Math.ceil(s), w = Math.ceil(W / s), h = Math.ceil(H / s);
    this.view = { w, h, s, k, dpr, W, H };
    this.app.renderer.resize(W, H);
    for (const rt of [this.worldRT, this.lightRT, this.upRT]) if (rt) { rt.destroy(true); lifecycle.renderTextures--; }
    this.worldRT = this.lightRT = this.upRT = null;
    this.worldRT = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' }); lifecycle.renderTextures++;
    this.lightRT = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' }); lifecycle.renderTextures++;
    this.upRT = RenderTexture.create({ width: w * k, height: h * k, scaleMode: 'linear' }); lifecycle.renderTextures++;
    this.lightOverlay.texture = this.lightRT;
    this.upSprite.texture = this.worldRT; this.upSprite.scale.set(k);
    this.screen.texture = this.upRT; this.screen.scale.set(s / k);
  }

  present(batch: PublishedView, dt: number) {
    if (this.destroyed) return;
    const t0 = performance.now();
    const key = worldKeyString(batch.stamp.world);
    if (key !== this.mapKey || batch.stamp.epoch !== this.epoch) {
      const reason = !this.mapKey ? 'enter' : key !== this.mapKey ? 'map' : 'epoch';
      this.rebuild(batch.map, batch.frame);
      this.mapKey = key; this.epoch = batch.stamp.epoch;
      this.onRebuild?.(reason);
    }
    const f = batch.frame; this.last = f; this.time += dt;
    const visible = (region: string | null) => region === null || f.revealed[region] === true;

    for (const [id, occ] of this.doors) {
      const open = !!f.doors[id];
      if (occ.spec && occ.spec.open !== open) {
        occ.spec = { ...occ.spec, open }; occ.key = this.wallTexKey(occ.spec); occ.level = -1;
        // East-west doors pass through an ajar frame for a moment; the logic state has already switched.
        if (occ.spec.kind === 'door-ew' && !this.opts.reducedMotion) { occ.swing = { t: 0, key: occ.key }; occ.key = this.ajarKey(occ.spec); }
      }
      if (occ.swing) { occ.swing.t += dt; if (occ.swing.t >= .11) { occ.key = occ.swing.key; occ.swing = undefined; occ.level = -1; } }
    }
    // A death is published in the same batch as the first frame with alive=false, so it must reach syncActor before that
    // frame turns the body into a corpse. Only this map/epoch counts: a rebuild (load, layer change) never replays a fall.
    const current = (e: StampedEvent) => worldKeyString(e.stamp.world) === this.mapKey && e.stamp.epoch === this.epoch;
    const fallen = new Set(batch.events.flatMap(e => e.type === 'death' && current(e) ? [e.uid] : []));
    const seen = new Set<string>();
    for (const a of [f.player, ...f.actors]) { seen.add(a.uid); this.syncActor(a, dt, visible(a.regionId), fallen.has(a.uid)); }
    for (const [uid, g] of this.actors) if (!seen.has(uid)) { this.dropActor(g); this.actors.delete(uid); }
    this.syncCrates(f, visible); this.syncLoot(f, visible); this.syncBullets(f);

    for (const e of batch.events) {
      this.stats.events++;
      if (!current(e)) { this.stats.droppedEvents++; continue; }
      this.onEvent(e, f);
    }
    this.bakeAhead(dt);
    this.fx.update(dt);
    this.fx.reveal(f.revealed);
    for (let i = this.muzzles.length - 1; i >= 0; i--) { const m = this.muzzles[i]; m.t += dt; if (m.t > .03) m.s.texture = this.tex.muzzle(1); if (m.t > .07) { m.s.destroy(); this.muzzles.splice(i, 1); } }
    for (let i = this.swings.length - 1; i >= 0; i--) { const s = this.swings[i]; s.t += dt; s.g.alpha = 1 - s.t / .14; if (s.t > .14) { s.g.destroy(); this.swings.splice(i, 1); } }

    this.updateExit(f);
    this.updateTall(f);
    this.updateFades(f, dt);
    this.updateXray(f);
    this.updateHighlight(f, visible);
    this.camera(f, dt);
    this.weather.update(this.time, this.cam, this.view, f.revealed);
    this.light.sync(dt, l => l.region === undefined || l.region === null || f.revealed[l.region] === true, this.time);
    this.tintUpright(f);
    if (this.opts.debug) this.drawDebug(f); else this.debugG.clear();
    this.render();
    this.stats.frameMs = performance.now() - t0;
    this.stats.sprites = this.sorted.children.length + this.flat.children.length + this.xray.children.length;
  }

  private clearScene() {
    for (const layer of [this.groundLayer, this.flat, this.shadows, this.sorted, this.xray, this.overhead]) for (const c of layer.removeChildren()) c.destroy();
    this.fx?.clear();
    this.occluders = []; this.pendingChunks = []; this.doors.clear(); this.actors.clear(); this.bullets.clear(); this.crates.clear(); this.loot.clear(); this.muzzles = []; this.swings = [];
    this.debugG.clear();
  }

  private rebuild(m: MapDef, f: ViewFrame) {
    const t0 = performance.now(), mapKey = worldKeyString(m.key);
    // Ground depends only on the map definition, so baked chunks are kept for the view's life: a raid has the coast and
    // two small floors (about 16 MB in all), and going upstairs and back, or an epoch rebuild, never bakes again.
    this.map = m; this.stats.rebuilds++;
    this.clearScene();
    this.highlight = new Sprite(); this.highlight.visible = false; this.xray.addChild(this.highlight);
    this.exitG = new Graphics(); this.groundLayer.addChild(this.exitG);
    const b = m.bounds, M = materials(m);
    let bake = this.bakes.get(mapKey);
    if (!bake) { const geo = groundGeometry(m, M); bake = { geo, puddles: puddles(m, M, geo) }; this.bakes.set(mapKey, bake); }

    // Ground is painted once into 512px chunks (standalone textures), so the full 2304x1664 coast never needs one huge texture.
    // Chunks around the starting view bake now; the rest bake nearest-first, one per presented frame (bakeAhead), so the
    // first entry to the 2304x1664 coast does not stall on all twenty chunks at once.
    const CH = 512, prefix = `ground:${mapKey}`, near = grow({ x: f.player.x - this.view.w / 2, y: f.player.y - this.view.h / 2, w: this.view.w, h: this.view.h }, 64);
    this.pendingChunks = [];
    for (let cy = b.y; cy < b.y + b.h; cy += CH) for (let cx = b.x; cx < b.x + b.w; cx += CH) {
      const r = { x: cx, y: cy, w: Math.min(CH, b.x + b.w - cx), h: Math.min(CH, b.y + b.h - cy) }, key = `${prefix}:${cx},${cy}`;
      if (this.tex.atlas.has(key) || intersects(r, near)) this.placeChunk(m, r, key, M, bake);
      else this.pendingChunks.push({ r, key, M, bake });
    }
    if (m.key.mapId === 'coast') this.markSampleArea(b);
    for (const e of m.entries) {
      const s = new Sprite(this.tex.ensure(`stairs:${e.kind}`, () => paintStairs(e.kind === 'up' ? 'up' : 'down')));
      s.position.set(Math.floor(e.at.x / 32) * 32, Math.floor(e.at.y / 32) * 32 - 8); this.groundLayer.addChild(s);
    }
    for (const x of m.exits) { const s = new Sprite(this.tex.exitDecal()); s.anchor.set(.5); s.position.set(x.at.x, x.at.y); this.groundLayer.addChild(s); }
    for (const n of m.notes) { const s = new Sprite(this.tex.loot('note')); s.anchor.set(.5, 11 / 14); s.position.set(n.at.x, n.at.y); this.flat.addChild(s); }

    const wallish = (x: number, y: number) => { const c = m.cells[y]?.[x]; return c === 'wall' || c === 'window' || m.doors.some(d => d.x === x && d.y === y); };
    const interior = (x: number, y: number) => ['tile', 'concrete', 'wood'].includes(M[y]?.[x] ?? '');
    const owner = (x: number, y: number) => m.buildings.find(q => x * 32 >= q.x && x * 32 < q.x + q.w && y * 32 >= q.y && y * 32 < q.y + q.h);
    const x0 = Math.floor(b.x / 32), y0 = Math.floor(b.y / 32), x1 = Math.ceil((b.x + b.w) / 32), y1 = Math.ceil((b.y + b.h) / 32);
    for (let y = Math.max(0, y0); y < Math.min(m.rows, y1); y++) for (let x = Math.max(0, x0); x < Math.min(m.cols, x1); x++) {
      const cell = m.cells[y][x], door = m.doors.find(d => d.x === x && d.y === y), bld = owner(x, y);
      if (m.terrain[y][x] === 2 && !door) continue;
      if (wallish(x, y)) {
        const spec: WallSpec = {
          n: wallish(x, y - 1), e: wallish(x + 1, y), s: wallish(x, y + 1), w: wallish(x - 1, y),
          face: interior(x, y + 1) && !wallish(x, y + 1) ? 'int' : 'ext',
          kind: door ? (door.wall === 'ew' ? 'door-ew' : 'door-ns') : cell === 'window' ? (wallish(x - 1, y) || wallish(x + 1, y) ? 'window-ew' : 'window-ns') : 'wall',
          open: door ? !!f.doors[door.id] : false, x, y,
          ruined: !!bld && isRuined(m, bld),
        };
        const occ = this.addOccluder(this.wallTexKey(spec), x * 32, y * 32 - WALL_H, (y + 1) * 32, door ? 'door' : 'wall', 6);
        occ.spec = spec;
        if (door) this.doors.set(door.id, occ);
      } else if (bld && cell === 'floor' && !door && (y * 32 === bld.y || (y + 1) * 32 === bld.y + bld.h) && x * 32 > bld.x && (x + 1) * 32 < bld.x + bld.w) {
        this.tex.ensure('lintel', () => paintLintel(32));
        this.addOccluder('lintel', x * 32, y * 32 - WALL_H, (y + 1) * 32, 'lintel', 0);
      }
      if (cell === 'low') {
        const variant = m.key.mapId === 'coast' ? (x === 11 ? 'stove' : 'table') : (x < 4 ? 'bed' : 'cabinet');
        const s = new Sprite(this.tex.ensure(`low:${variant}`, () => paintLow(variant, x, y)));
        s.position.set(x * 32, y * 32 - LOW_H); s.zIndex = (y + 1) * 32 - .2; this.sorted.addChild(s);
        (s as Sprite & { lowLit?: boolean }).lowLit = true;
      }
    }

    const roofs: RoofArea[] = [];
    for (const bld of m.buildings) {
      if (!hasRoof(m, bld)) continue;
      const n = storeys(m, bld), band = (n - 1) * STOREY_H, lift = WALL_H + band;
      roofs.push({ rect: { x: bld.x, y: bld.y, w: bld.w, h: bld.h }, lift, region: bld.regionIds[0] ?? null });
      const full = `roof:${bld.id}:${n}`, flat = `roof:${bld.id}:1`;
      this.tex.ensure(full, () => paintRoof(bld.w, bld.h, n, bld.x ^ bld.y));
      this.tex.ensure(flat, () => paintRoof(bld.w, bld.h, 1, bld.x ^ bld.y));
      const y = bld.y - lift - ROOF_MARGIN;
      const occ = this.addOccluder(full, bld.x, y, bld.y + bld.h + .5, 'roof', 0);
      occ.region = bld.regionIds[0];
      if (band > 0) occ.tall = { full, flat, band, y, building: { x: bld.x, y: bld.y, w: bld.w, h: bld.h }, collapsed: false };
      const sh = 10 + lift / 4;
      const shadow = new Graphics().poly([bld.x + bld.w, bld.y + 10, bld.x + bld.w + sh, bld.y + 10 + sh * .7, bld.x + bld.w + sh, bld.y + bld.h + sh * .7, bld.x + sh, bld.y + bld.h + sh * .7, bld.x, bld.y + bld.h]).fill({ color: 0x14120f, alpha: .26 });
      (shadow as Graphics & { roofOf?: Occluder }).roofOf = occ; this.shadows.addChild(shadow);
    }
    for (const r of m.regions) {
      if (!r.inside || m.buildings.some(q => hasRoof(m, q) && q.regionIds.includes(r.id))) continue;
      const key = `ceil:${r.w}x${r.h}`;
      this.tex.ensure(key, () => paintCeiling(r.w, r.h));
      const occ = this.addOccluder(key, r.x, r.y, r.y + r.h + .5, 'ceiling', 0); occ.region = r.id;
    }
    if (m.key.mapId === 'coast') this.dressCoast();
    // Awnings keep the pavement under them dry.
    const awnings = m.key.mapId === 'coast' ? [11, 25].map(tx => ({ x: tx * 32, y: 15 * 32 - 8, w: 4 * 32, h: 40 })) : [];
    this.weather.setMap(m, bake.puddles, roofs, awnings, (x, y) => M[y >> 5]?.[x >> 5] === 'water');
    this.light.mood = MOODS[this.opts.mood % MOODS.length]; this.light.setMap(m);
    this.staticLights(m);
    this.stats.occluders = this.occluders.length;
    this.camF = { x: f.player.x - this.view.w / 2, y: f.player.y - AIM_H - this.view.h / 2 };
    this.stats.rebuildMs = performance.now() - t0;
  }
  private pendingChunks: { r: Rect; key: string; M: GroundMaterial[][]; bake: GroundBake }[] = [];
  private placeChunk(m: MapDef, r: Rect, key: string, M: GroundMaterial[][], bake: GroundBake) {
    if (!this.tex.atlas.has(key)) this.tex.atlas.add(key, paintGround(m, r, M, this.opts.art, bake), true);
    const chunk = new Sprite(this.tex.atlas.get(key)); chunk.position.set(r.x, r.y); this.groundLayer.addChildAt(chunk, 0);
  }
  /**
   * Bake the pending chunk nearest the camera once the view comes within 320 px of it: one per frame, never on a
   * zero-time re-present. Chunks the player never approaches are never baked.
   */
  private bakeAhead(dt: number) {
    if (!this.pendingChunks.length || dt <= 0 || !this.map) return;
    const reach = grow({ x: this.cam.x, y: this.cam.y, w: this.view.w, h: this.view.h }, 320), cx = this.cam.x + this.view.w / 2, cy = this.cam.y + this.view.h / 2;
    let best = -1, bestD = Infinity;
    this.pendingChunks.forEach((c, i) => {
      if (!intersects(c.r, reach)) return;
      const d = Math.hypot(c.r.x + c.r.w / 2 - cx, c.r.y + c.r.h / 2 - cy); if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) return;
    const c = this.pendingChunks.splice(best, 1)[0];
    this.placeChunk(this.map, c.r, c.key, c.M, c.bake);
  }
  /** Ground chunks still waiting to bake (read by checks). */
  get pendingGround() { return this.pendingChunks.length; }
  /** Per-map bake inputs (geometry, noise lattices, puddles), reused by every rebuild of the same map. */
  private bakes = new Map<string, GroundBake>();

  /** Outside the dressed village corner the generic placeholder pipeline still renders the real map; mark it as such. */
  private markSampleArea(b: Rect) {
    const a = SAMPLE_AREA, g = new Graphics();
    for (const r of [{ x: b.x, y: b.y, w: b.w, h: a.y - b.y }, { x: b.x, y: a.y + a.h, w: b.w, h: b.y + b.h - a.y - a.h }, { x: b.x, y: a.y, w: a.x - b.x, h: a.h }, { x: a.x + a.w, y: a.y, w: b.x + b.w - a.x - a.w, h: a.h }])
      if (r.w > 0 && r.h > 0) g.rect(r.x, r.y, r.w, r.h).fill({ color: 0x1a1916, alpha: .22 });
    for (let x = a.x; x < a.x + a.w; x += 12) g.rect(x, a.y + a.h, 6, 1).rect(x, a.y - 1, 6, 1);
    for (let y = a.y; y < a.y + a.h; y += 12) g.rect(a.x - 1, y, 1, 6).rect(a.x + a.w, y, 1, 6);
    g.fill({ color: 0xa49b88, alpha: .35 });
    this.groundLayer.addChild(g);
  }

  /** Ajar door: the open frame with the closed leaf squeezed toward its hinge (left), as seen half way through the swing. */
  private ajarKey(spec: WallSpec) {
    const closed = this.wallTexKey({ ...spec, open: false }), opened = this.wallTexKey({ ...spec, open: true }), key = `${closed}|ajar`;
    this.tex.ensure(key, () => {
      const a = this.tex.canvas(opened), b = this.tex.canvas(closed), c = document.createElement('canvas'); c.width = a.width; c.height = a.height;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(a, 0, 0);
      g.drawImage(b, 4, 32, 24, WALL_H, 4, 32, 11, WALL_H);
      g.fillStyle = 'rgba(20,18,15,.35)'; g.fillRect(15, 34, 2, WALL_H - 4);
      return c;
    });
    return key;
  }
  private wallTexKey(spec: WallSpec) { const key = wallKey(spec); this.tex.ensure(key, () => (this.opts.art && solWall(this.opts.art, spec)) || paintWall(spec)); return key; }

  private addOccluder(key: string, x: number, y: number, z: number, kind: Occluder['kind'], keepBottom: number): Occluder {
    const t = this.tex.atlas.get(key), s = new Sprite(t);
    s.position.set(x, y); s.zIndex = z; this.sorted.addChild(s);
    const o: Occluder = { sprite: s, key, kind, z, rect: { x, y, w: t.width, h: t.height }, keepBottom, level: 0, target: 0 };
    this.occluders.push(o);
    return o;
  }

  private dressCoast() {
    const canopy = (tx: number, w: number, row: number) => {
      const key = `canopy:${w}`; this.tex.ensure(key, () => paintCanopy(w * 32));
      this.addOccluder(key, tx * 32, row * 32 - 40 + 2, (row + 1) * 32 - .5, 'canopy', 0);
    };
    canopy(11, 4, 15); canopy(25, 4, 15);
    for (const tx of [11, 25]) this.shadows.addChild(new Graphics().rect(tx * 32 + 10, 15 * 32 + 4, 4 * 32, 26).fill({ color: 0x14120f, alpha: .28 }));
    const onWall = (key: string, paint: () => HTMLCanvasElement, x: number, y: number, row: number) => {
      const s = new Sprite(this.tex.ensure(key, paint)); s.position.set(x, y); s.zIndex = (row + 1) * 32 + .05; this.sorted.addChild(s);
    };
    onWall('deco:ac', paintWallAC, 24 * 32 + 4, 11 * 32 - 14, 11);
    onWall('deco:ac', paintWallAC, 29 * 32 + 6, 11 * 32 - 10, 11);
    onWall('deco:ac', paintWallAC, 15 * 32 + 6, 21 * 32 - 12, 21);
    onWall('deco:pipe', paintDownpipe, 30 * 32 + 22, 11 * 32 + 32 - WALL_H - 2, 11);
    onWall('deco:pipe', paintDownpipe, 23 * 32 + 4, 21 * 32 + 32 - WALL_H - 2, 21);
    const wires = new Graphics();
    const sag = (ax: number, ay: number, bx: number, by: number, d: number, color = 0x26241f) => {
      let px = ax, py = ay;
      for (let i = 1; i <= 24; i++) { const t = i / 24, x = ax + (bx - ax) * t, y = ay + (by - ay) * t + Math.sin(t * Math.PI) * d; wires.moveTo(px, py).lineTo(x, y); px = x; py = y; }
      wires.stroke({ width: 1, color, alpha: .75 });
    };
    sag(18 * 32 + 30, 7 * 32 - 96, 23 * 32 + 2, 7 * 32 - 52, 18);
    sag(31 * 32 - 2, 7 * 32 - 50, 31 * 32 - 2, 16 * 32 - 50, 22);
    sag(9 * 32, 7 * 32 - 70, 18 * 32 + 30, 7 * 32 - 100, 10, 0x2f2c27);
    this.overhead.addChild(wires);
  }

  private staticLights(m: MapDef) {
    this.light.lights = [];
    // Room lamps waver slightly and the odd one stutters (stateless in view time; no visibility or combat effect).
    for (const l of regionLamps(m)) this.light.lights.push({ ...lamp(l.x, l.y, l.region, l.warm ? 0xc3a26a : 0xa08a5f), flicker: Math.floor(l.x * 7 + l.y * 13) % 997 });
    if (m.key.mapId === 'coast') {
      this.light.lights.push({ ...lamp(26 * 32, 18.5 * 32, null, 0xa08a5f), flicker: 311 });
      this.light.lights.push({ x: 20 * 32, y: 9 * 32, r: 90, color: 0xb59a68, k: .35, region: null });
    }
    for (const x of m.exits) this.light.lights.push({ x: x.at.x, y: x.at.y, r: 120, color: 0x7f9a55, k: .5, region: null });
    const regionAt = (x: number, y: number) => m.regions.find(r => r.inside && x * 32 >= r.x && x * 32 < r.x + r.w && y * 32 >= r.y && y * 32 < r.y + r.h)?.id ?? null;
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (m.cells[y][x] !== 'window') continue;
      const dx = m.cells[y][x - 1] === 'floor' ? -1 : m.cells[y][x + 1] === 'floor' ? 1 : 0, dy = m.cells[y + 1]?.[x] === 'floor' ? 1 : m.cells[y - 1]?.[x] === 'floor' ? -1 : 0;
      this.light.lights.push({ x: (x + .5 + dx * 1.2) * 32, y: (y + .5 + dy * 1.2) * 32, r: 64, color: 0x8796a0, k: .45, region: regionAt(x + dx, y + dy) });
    }
  }

  private onEvent(e: StampedEvent, f: ViewFrame) {
    const all = [f.player, ...f.actors], actor = (uid: string) => all.find(a => a.uid === uid);
    const regionAt = (p: Point) => this.map!.regions.find(r => r.inside && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)?.id ?? null;
    const shown = (p: Point) => { const r = regionAt(p); return r === null || f.revealed[r] === true; };
    switch (e.type) {
      case 'shot': {
        const a = actor(e.shooter); if (!a || !shown(a)) break;
        const angle = e.pellets.reduce((s, p) => s + p.angle, 0) / Math.max(1, e.pellets.length);
        const art = this.tex.weapon(a.weapon, a.kind), c = Math.cos(angle), s = Math.sin(angle);
        const sp = new Sprite(this.tex.muzzle(0)); sp.anchor.set(.5); sp.blendMode = 'add';
        const reach = art.muzzle * heldLength(angle);
        sp.position.set(Math.round(a.x + c * reach), Math.round(a.y - AIM_H + s * reach)); sp.rotation = angle; sp.zIndex = a.y + .2 + (s < -.2 ? -.4 : 0);
        if (e.weapon === 'shotgun') sp.scale.set(1.4);
        this.sorted.addChild(sp); this.muzzles.push({ s: sp, t: 0 });
        this.light.lights.push({ x: a.x + c * 20, y: a.y + s * 20, r: e.weapon === 'shotgun' ? 100 : 80, color: 0xe0b878, k: .9, ttl: .07, region: a.regionId });
        if (e.weapon !== 'shotgun') this.fx.casing(a.x + c * 4, a.y + s * 4, AIM_H - 2, angle, this.rnd);
        this.fx.smoke(a.x + c * (reach + 2), a.y + s * (reach + 2) * .6, AIM_H, this.rnd, e.weapon === 'shotgun' ? 5 : 3);
        if (a.kind === 'player' && !this.opts.reducedMotion) {
          this.shake = Math.min(2, this.shake + (e.weapon === 'shotgun' ? 1.5 : .6));
          const k = e.weapon === 'shotgun' ? 4 : e.weapon === 'carbine' ? 2.5 : 2;
          this.recoil.x -= c * k; this.recoil.y -= s * k;
        }
        break;
      }
      case 'melee': {
        const a = actor(e.attacker); if (!a || !shown(a)) break;
        const g = new Graphics(), cx = Math.round(a.x), cy = Math.round(a.y - AIM_H + 4);
        g.arc(cx, cy, Math.min(30, e.range * .7), e.angle - .7, e.angle + .7).stroke({ width: 2, color: 0xe4debb, alpha: .85 });
        g.zIndex = a.y + .3 + (Math.sin(e.angle) < -.3 ? -.6 : 0); this.sorted.addChild(g); this.swings.push({ g, t: 0 });
        const ag = this.actors.get(a.uid); if (ag) ag.swingT = .14;
        break;
      }
      case 'impact': {
        if (!shown(e.lastFree)) break;
        if (e.reason === 'blocked') {
          const b = this.bullets.get(e.bullet), v = b ? Math.hypot(b.vx, b.vy) || 1 : 1;
          const n = e.normal ?? (b ? { x: -b.vx / v, y: -b.vy / v } : { x: 0, y: 1 });
          this.fx.sparks(e.lastFree.x, e.lastFree.y + .5, AIM_H, n.x, n.y, this.rnd);
          this.light.lights.push({ x: e.lastFree.x, y: e.lastFree.y, r: 34, color: 0xd9a860, k: .6, ttl: .06, region: regionAt(e.lastFree) });
        } else if (e.reason === 'start-blocked') this.fx.dust(e.lastFree.x, e.lastFree.y, this.rnd, 4);
        break;
      }
      case 'hurt': {
        // Bleeding and pollution publish a tiny hurt every frame (no angle): no flash, kick or blood spray for those.
        const g = this.actors.get(e.uid); if (!g || (e.angle === null && e.damage < 1)) break;
        const ang = e.angle ?? 0;
        g.flashT = .07; g.kick = e.angle === null ? { x: 0, y: 0 } : { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 }; g.kickT = .08;
        const a = actor(e.uid); if (a && shown(a)) this.fx.blood(a.x, a.y + .5, AIM_H, ang, this.rnd);
        break;
      }
      case 'door': { const d = this.map!.doors.find(x => x.id === e.id); if (d) this.fx.dust(d.x * 32 + 16, d.y * 32 + 30, this.rnd, 4); break; }
      case 'looted': { const p = f.player; this.fx.dust(p.x, p.y, this.rnd, 2); break; }
      default: break;
    }
  }

  private syncActor(a: ActorView, dt: number, shown: boolean, fell = false) {
    let g = this.actors.get(a.uid);
    // The fall plays only for a body already drawn standing and visible now; a death in a hidden room, or one first met
    // as a corpse, goes straight to the corpse.
    if (fell && g && !g.corpse && g.deathT === 0 && shown) g.deathT = .0001;
    if (!g) {
      const mk = () => { const s = new Sprite(); s.anchor.set(.5, 1); return s; };
      const arm = () => { const s = new Sprite(this.tex.arm(a.kind)); s.anchor.set(0, .5); return s; };
      g = { kind: a.kind, body: mk(), weapon: new Sprite(), flash: mk(), rim: new Sprite(), wrim: new Sprite(), shadow: new Sprite(this.tex.blob(20, 7)), corpse: null, corpseKey: '',
        arms: [arm(), arm()], edge: a.kind === 'player' ? new Sprite() : null, walk: 0, dir: dirOf(a.aim), flashT: 0, deathT: 0, kick: { x: 0, y: 0 }, kickT: 0, seen: false, swingT: 0, step: 0 };
      g.flash.blendMode = 'add'; g.rim.anchor.set(.5, (48 + 1) / 50); g.shadow.anchor.set(.5);
      this.sorted.addChild(g.body, ...g.arms, g.weapon, g.flash); this.xray.addChild(g.rim, g.wrim);
      if (g.edge) { g.edge.anchor.set(.5, (48 + 1) / 50); g.edge.tint = 0xf3dfa8; g.edge.alpha = .38; this.sorted.addChild(g.edge); } this.shadows.addChild(g.shadow);
      this.actors.set(a.uid, g);
    }
    g.kind = a.kind;
    const speed = Math.hypot(a.vx, a.vy);
    g.walk = speed > 5 ? (g.walk + dt * speed / 22) % 4 : 0;
    const step = Math.floor(g.walk / 2);
    if (step !== g.step) { g.step = step; if (speed > 150 && shown && a.alive && dt > 0) this.fx.dust(a.x, a.y, this.rnd, 2); }
    g.dir = dirOf(a.aim);
    g.flashT = Math.max(0, g.flashT - dt); g.kickT = Math.max(0, g.kickT - dt); g.swingT = Math.max(0, g.swingT - dt);
    if (g.deathT > 0) g.deathT += dt;
    const dying = !a.alive && g.deathT > 0 && g.deathT < FALL_T;
    const frame = dying ? 0 : speed > 5 ? 1 + Math.floor(g.walk) : 0;
    const dead = !a.alive && !dying;
    const kx = g.kickT > 0 ? g.kick.x : 0, ky = g.kickT > 0 ? g.kick.y : 0;
    const x = Math.round(a.x + kx), y = Math.round(a.y + ky);
    for (const s of [g.body, g.weapon, g.flash, g.shadow, ...g.arms]) s.visible = shown && !dead;
    if (g.edge) g.edge.visible = shown && !dead;
    g.seen = shown;
    if (dead) {
      const facing = corpseFacing(a), key = `corpse:${a.kind}:${facing}`;
      if (!g.corpse || g.corpseKey !== key) {
        const fresh = !g.corpse && g.deathT > 0;
        g.corpse?.destroy();
        g.corpse = new Sprite(this.tex.corpse(a.kind, facing)); g.corpse.anchor.set(.5, 14 / 24); g.corpseKey = key;
        this.flat.addChild(g.corpse);
        const seed = fresh ? null : [...a.uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
        let k = seed ?? 0; const r = () => seed === null ? this.rnd() : ((k = (k * 1103515245 + 12345) >>> 0) / 4294967296);
        for (let i = 0; i < 14; i++) this.fx.decal(a.x - 9 + r() * 18, a.y - 2 + r() * 7, i % 3 ? 0x5a2724 : 0x6e2f2a, r() < .4 ? 2 : 1);
        if (a.kind !== 'creature') this.fx.pool(a.x + facing * 4, a.y + 1, [...a.uid].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 3), fresh);
        // Pools go under the body: move the corpse to the top of the flat layer again.
        this.flat.addChild(g.corpse);
      }
      g.corpse.position.set(x, y); g.corpse.visible = shown;
      g.rim.visible = g.wrim.visible = false;
      return;
    }
    if (g.corpse) { g.corpse.destroy(); g.corpse = null; g.corpseKey = ''; }
    // Dying: the standing frame tips over its feet toward the side the corpse will lie on, then the corpse replaces it.
    const fall = dying ? Math.min(1, g.deathT / FALL_T) : 0, side = dying ? corpseFacing(a) : 0, tilt = side * 1.25 * fall;
    const bx = x - Math.round(side * FALL_SLIDE * fall), by = y + Math.round(4 * fall);
    g.body.texture = this.tex.actor(a.kind, g.dir, frame); g.body.position.set(bx, by); g.body.zIndex = a.y; g.body.rotation = tilt;
    if (g.edge) { g.edge.texture = this.tex.actorEdge(a.kind, g.dir, frame); g.edge.position.set(bx, by + 1); g.edge.rotation = tilt; g.edge.zIndex = a.y - .002; }
    g.flash.texture = this.tex.actorFlash(a.kind, g.dir, frame); g.flash.position.set(bx, by); g.flash.zIndex = a.y + .01; g.flash.visible = shown && g.flashT > 0; g.flash.alpha = .5; g.flash.rotation = tilt;
    g.shadow.position.set(x + 2, y - 1);
    g.rim.texture = this.tex.actorRim(a.kind, g.dir, frame); g.rim.position.set(x, y + 1); g.rim.tint = a.kind === 'player' ? 0xf0dca0 : 0xe07a5a;
    const art = this.tex.weapon(a.weapon, a.kind);
    const reload = a.state.reloading ? .75 * Math.sign(Math.cos(a.aim) || 1) : 0;
    const swing = g.swingT > 0 ? (g.swingT / .14 - .5) * 1.4 : 0;
    const angle = a.aim + reload + swing, c = Math.cos(angle), s = Math.sin(angle);
    g.weapon.texture = art.texture; g.weapon.anchor.set(art.pivotX / art.canvas.width, art.pivotY / art.canvas.height);
    g.weapon.position.set(Math.round(a.x + kx + c * art.forward), Math.round(a.y + ky - AIM_H + s * art.forward));
    g.weapon.rotation = angle; g.weapon.scale.set(heldLength(angle), Math.cos(a.aim) < 0 ? -1 : 1);
    g.weapon.zIndex = a.y + (Math.sin(a.aim) < -.35 ? -.05 : .05);
    g.weapon.visible = shown && a.weapon !== 'claw' && !dying;
    this.syncArms(g, a, art, angle, kx, ky);
    g.wrim.texture = art.rim; g.wrim.anchor.set((art.pivotX + 1) / (art.canvas.width + 2), (art.pivotY + 1) / (art.canvas.height + 2));
    g.wrim.position.copyFrom(g.weapon.position); g.wrim.rotation = g.weapon.rotation; g.wrim.scale.copyFrom(g.weapon.scale); g.wrim.tint = g.rim.tint;
  }
  /**
   * Shoulders sit 7 px above the aim plane and spread across the body as the actor turns toward or away from the camera
   * (the character's right is (-sin, cos) of the aim). The trigger arm reaches the grip pivot, the support arm the fore
   * grip along the barrel (or the same grip for a two-handed pistol); one-handed melee leaves the support arm down.
   */
  private syncArms(g: ActorGfx, a: ActorView, art: { support?: number; oneHanded?: boolean }, angle: number, kx: number, ky: number) {
    const on = g.weapon.visible;
    const c = Math.cos(angle), s = Math.sin(angle), hl = heldLength(angle);
    const gx = g.weapon.x, gy = g.weapon.y;
    const sx = a.x + kx + Math.cos(a.aim) * 1.5, sy = a.y + ky - AIM_H - 7;
    const rx = -Math.sin(a.aim) * 4, ry = Math.cos(a.aim) * 1.5;
    const reach = (arm: Sprite, x0: number, y0: number, x1: number, y1: number) => {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      arm.visible = on && len > 1; arm.position.set(Math.round(x0), Math.round(y0)); arm.rotation = Math.atan2(dy, dx); arm.scale.set(len, 1);
    };
    const support = art.support ?? 0;
    reach(g.arms[0], sx + rx, sy + ry, gx, gy);
    if (art.oneHanded) reach(g.arms[1], sx - rx, sy - ry, sx - rx + c * 2, sy - ry + 9);
    else reach(g.arms[1], sx - rx, sy - ry, gx + c * support * hl + c, gy + s * support * hl + s);
    // Arms share the weapon's depth, just under it so the painted gloves cover the sleeve ends.
    for (const arm of g.arms) { arm.zIndex = g.weapon.zIndex - .001; arm.tint = g.weapon.tint; }
  }
  private dropActor(g: ActorGfx) { for (const s of [g.body, g.weapon, g.flash, g.rim, g.wrim, g.shadow, g.corpse, g.edge, ...g.arms]) s?.destroy(); }

  private syncCrates(f: ViewFrame, visible: (r: string | null) => boolean) {
    const seen = new Set<string>();
    for (const c of f.containers) {
      if (c.kind !== 'crate') continue;
      seen.add(c.id);
      const empty = c.stacks === 0, look = empty ? 'empty' : this.openContainer === c.id ? 'open' : 'full';
      let e = this.crates.get(c.id);
      if (!e) {
        const s = new Sprite(this.tex.crate(look)); s.anchor.set(.5, 22 / 28); s.position.set(Math.round(c.x), Math.round(c.y)); s.zIndex = c.y + 1;
        const shadow = new Sprite(this.tex.blob(26, 6)); shadow.anchor.set(.5); shadow.position.set(Math.round(c.x) + 2, Math.round(c.y) + 1);
        this.sorted.addChild(s); this.shadows.addChild(shadow); e = { s, shadow, empty, look }; this.crates.set(c.id, e);
      }
      if (e.empty !== empty) { e.empty = empty; this.fx.dust(c.x, c.y, this.rnd, 3); }
      if (e.look !== look) { e.look = look; e.s.texture = this.tex.crate(look); }
      e.s.visible = e.shadow.visible = visible(c.regionId);
    }
    for (const [id, e] of this.crates) if (!seen.has(id)) { e.s.destroy(); e.shadow.destroy(); this.crates.delete(id); }
  }
  private syncLoot(f: ViewFrame, visible: (r: string | null) => boolean) {
    const seen = new Set<string>();
    for (const l of f.loot) {
      seen.add(l.uid);
      let s = this.loot.get(l.uid);
      if (!s) { s = new Sprite(this.tex.loot(l.item)); s.anchor.set(.5, s.texture.height === LOOT_H ? LOOT_FOOT / LOOT_H : 11 / 14); s.position.set(Math.round(l.x), Math.round(l.y)); this.flat.addChild(s); this.loot.set(l.uid, s); }
      s.visible = visible(l.regionId);
      s.tint = (this.time % 2) < .12 ? 0xffffff : 0xe8e2d4;
    }
    for (const [uid, s] of this.loot) if (!seen.has(uid)) { s.destroy(); this.loot.delete(uid); }
  }
  private syncBullets(f: ViewFrame) {
    const seen = new Set<string>();
    const regionAt = (p: Point) => this.map!.regions.find(r => r.inside && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)?.id ?? null;
    for (const b of f.bullets) {
      seen.add(b.uid);
      let e = this.bullets.get(b.uid);
      if (!e) { e = { g: new Graphics(), born: { x: b.x, y: b.y }, vx: b.vx, vy: b.vy }; this.sorted.addChild(e.g); this.bullets.set(b.uid, e); }
      e.vx = b.vx; e.vy = b.vy;
      const r = regionAt(b), show = r === null || f.revealed[r] === true;
      const v = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / v, uy = b.vy / v;
      const travelled = Math.hypot(b.x - e.born.x, b.y - e.born.y), len = Math.min(b.enemy ? 8 : 14, travelled - 3);
      const hx = Math.round(b.x), hy = Math.round(b.y - AIM_H);
      e.g.clear();
      if (len > 0) e.g.moveTo(hx - ux * len, hy - uy * len).lineTo(hx, hy).stroke({ width: 1, color: b.enemy ? 0xe48c64 : 0xffe6a8, alpha: .55 });
      if (travelled > 3) e.g.rect(hx, hy, 1, 1).fill(b.enemy ? 0xffc29a : 0xfff6d8);
      e.g.zIndex = b.y + .1; e.g.visible = show;
    }
    for (const [uid, e] of this.bullets) if (!seen.has(uid)) { e.g.visible = false; queueMicrotask(() => { if (this.bullets.get(uid) === e) { e.g.destroy(); this.bullets.delete(uid); } }); }
  }

  private updateExit(f: ViewFrame) {
    const g = this.exitG.clear(), t = f.interaction;
    if (!t || t.kind !== 'exit' || !t.hold) return;
    const ex = this.map!.exits.find(x => x.id === t.ref.id); if (!ex) return;
    const p = Math.min(1, t.hold.progress / t.hold.required);
    g.circle(ex.at.x, ex.at.y, 40).stroke({ width: 2, color: 0x2b3322, alpha: .8 });
    // Start the arc at its own first point: Pixi joins an arc to the current pen position (the world origin here).
    if (p > 0) g.moveTo(ex.at.x, ex.at.y - 40).arc(ex.at.x, ex.at.y, 40, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2).stroke({ width: 3, color: 0xd6ec9a, alpha: 1 });
  }

  private updateTall(f: ViewFrame) {
    const p = f.player;
    for (const o of this.occluders) {
      if (!o.tall) continue;
      const b = o.tall.building;
      const behind = this.opts.collapseTall && o.level < 4 && p.y < b.y + 8 && p.y > b.y - 4 * 32 && p.x > b.x - 24 && p.x < b.x + b.w + 24;
      if (behind === o.tall.collapsed) continue;
      o.tall.collapsed = behind;
      o.key = behind ? o.tall.flat : o.tall.full;
      const t = this.tex.atlas.get(o.key), y = o.tall.y + (behind ? o.tall.band : 0);
      o.sprite.position.y = y; o.rect = { ...o.rect, y, h: t.height };
      o.level = Math.max(o.level, 1); this.applyFade(o);
    }
  }

  private updateFades(f: ViewFrame, dt: number) {
    const p = f.player;
    const focus: Rect[] = [{ x: p.x - 11, y: p.y - 44, w: 22, h: 44 }];
    if (f.interaction) focus.push({ x: f.interaction.at.x - 8, y: f.interaction.at.y - 20, w: 16, h: 22 });
    // Cull by the last camera: off-screen structure neither renders nor runs fade/tint work.
    const vr = { x: this.cam.x - 96, y: this.cam.y - 96, w: this.view.w + 192, h: this.view.h + 240 };
    for (const o of this.occluders) o.sprite.renderable = intersects(vr, o.rect);
    for (const o of this.occluders) {
      if (!o.sprite.renderable) continue;
      if (o.kind === 'roof' || o.kind === 'ceiling') { o.target = o.region && f.revealed[o.region] ? 4 : 0; continue; }
      let t = 0;
      for (const r of focus) {
        if (o.z <= r.y + r.h) continue;
        if (intersects(r, o.rect)) t = Math.max(t, o.kind === 'canopy' ? 3 : 2);
        else if (intersects(grow(r, 10), o.rect) && o.kind !== 'canopy') t = Math.max(t, 1);
      }
      o.target = t;
    }
    this.fadeClock += dt;
    const step = this.fadeClock >= .045; if (step) this.fadeClock = 0;
    for (const o of this.occluders) {
      if (!o.sprite.renderable && o.level !== -1) continue;
      if (o.level === -1) { o.level = Math.min(o.target, 2); this.applyFade(o); continue; }
      if (!step || o.level === o.target) continue;
      o.level += Math.sign(o.target - o.level); this.applyFade(o);
    }
    for (const s of this.shadows.children) { const roof = (s as Graphics & { roofOf?: Occluder }).roofOf; if (roof) s.alpha = 1 - roof.level / 4; }
  }
  private applyFade(o: Occluder) {
    if (o.level >= 4) { o.sprite.visible = false; return; }
    o.sprite.visible = true;
    o.sprite.texture = this.tex.faded(o.key, o.level, o.keepBottom, o.rect.x, o.rect.y);
  }

  private updateXray(f: ViewFrame) {
    for (const [uid, g] of this.actors) {
      const a = uid === 'player' ? f.player : f.actors.find(x => x.uid === uid);
      if (!a || !a.alive || !g.seen || !this.opts.xray) { g.rim.visible = g.wrim.visible = false; continue; }
      const body: Rect = { x: a.x - 5, y: a.y - 34, w: 10, h: 28 };
      let hidden = false;
      for (const o of this.occluders) {
        if (o.z <= a.y || o.level >= ((o.kind === 'roof' || o.kind === 'ceiling') ? 4 : 2) || !o.sprite.visible) continue;
        if (intersects(body, o.rect)) { hidden = this.opaqueOver(o, body); if (hidden) break; }
      }
      g.rim.visible = hidden; g.wrim.visible = hidden && g.weapon.visible;
    }
  }
  private opaqueOver(o: Occluder, r: Rect): boolean {
    const c = this.tex.canvas(o.key), g = c.getContext('2d', { willReadFrequently: true })!;
    const x0 = Math.max(0, Math.floor(r.x - o.rect.x)), y0 = Math.max(0, Math.floor(r.y - o.rect.y));
    const x1 = Math.min(c.width, Math.ceil(r.x + r.w - o.rect.x)), y1 = Math.min(c.height, Math.ceil(r.y + r.h - o.rect.y));
    if (x1 <= x0 || y1 <= y0) return false;
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let solid = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) solid++;
    return solid > (d.length / 16) * .25;
  }

  private updateHighlight(f: ViewFrame, visible: (r: string | null) => boolean) {
    const t = f.interaction, h = this.highlight; h.visible = false;
    if (!t || t.kind !== 'container' && t.kind !== 'ground') return;
    if (t.kind === 'container') {
      const c = f.containers.find(x => x.id === t.ref.id); if (!c || !visible(c.regionId)) return;
      if (c.kind === 'corpse') {
        const g = c.ownerUid ? this.actors.get(c.ownerUid) : null; if (!g?.corpse) return;
        h.texture = this.tex.ensure(`${g.corpseKey}|rim`, () => rimOf(this.tex.canvas(g.corpseKey))); h.anchor.set(.5, 15 / 26); h.position.copyFrom(g.corpse.position);
      } else {
        const key = `crate:${this.crates.get(c.id)?.look ?? (c.stacks ? 'full' : 'empty')}`;
        h.texture = this.tex.ensure(`${key}|rim`, () => rimOf(this.tex.canvas(key))); h.anchor.set(.5, 23 / 30); h.position.set(Math.round(c.x), Math.round(c.y));
      }
    } else {
      const l = f.loot.find(x => x.uid === t.ref.id); if (!l) return;
      const key = `loot:${l.item}`; h.texture = this.tex.ensure(`${key}|rim`, () => rimOf(this.tex.canvas(key))); h.anchor.set(.5, 12 / 16); h.position.set(Math.round(l.x), Math.round(l.y));
    }
    h.visible = true; h.tint = 0xf2deaa; h.alpha = .75 + Math.sin(this.time * 6) * .25;
  }

  private camera(f: ViewFrame, dt: number) {
    const p = f.player, precise = p.state.precise ? 1.7 : 1;
    const ax = Math.cos(p.aim) * 48 * precise, ay = Math.sin(p.aim) * 34 * precise;
    const tx = p.x + ax - this.view.w / 2, ty = p.y - AIM_H + ay - this.view.h / 2 + this.panelInset * this.view.dpr / this.view.s / 2;
    const k = 1 - Math.exp(-dt * 8);
    this.camF.x += (tx - this.camF.x) * k; this.camF.y += (ty - this.camF.y) * k;
    const b = this.map!.bounds, pad = this.map!.key.mapId === 'coast' ? 0 : 96;
    const clamp = (v: number, lo: number, hi: number) => lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
    const top = this.hudTop * this.view.dpr / this.view.s;
    const cx = clamp(this.camF.x, b.x - pad, b.x + b.w + pad - this.view.w), cy = clamp(this.camF.y, b.y - pad - (pad ? 40 : 0) - top, b.y + b.h + pad - this.view.h);
    this.shake = Math.max(0, this.shake - dt * 30);
    const settle = Math.exp(-dt * 16); this.recoil.x *= settle; this.recoil.y *= settle;
    const sx = this.shake > .3 ? Math.round((this.rnd() - .5) * this.shake) : 0, sy = this.shake > .3 ? Math.round((this.rnd() - .5) * this.shake) : 0;
    this.cam = { x: Math.round(cx + this.recoil.x) + sx, y: Math.round(cy + this.recoil.y) + sy };
  }

  private tintUpright(f: ViewFrame) {
    const rv = f.revealed;
    for (const o of this.occluders) {
      if (!o.sprite.renderable) continue;
      const p = o.kind === 'roof' ? { x: -9999, y: -9999 } : { x: o.rect.x + 16, y: o.z + 8 };
      o.sprite.tint = this.light.at(p, null, rv, o.spec?.face === 'int' || o.kind === 'ceiling');
    }
    for (const [, g] of this.actors) {
      const tint = this.light.at({ x: g.body.x, y: g.body.y - 2 }, null, rv);
      g.body.tint = tint; g.weapon.tint = tint; g.arms[0].tint = g.arms[1].tint = tint; if (g.corpse) g.corpse.tint = tint;
    }
    for (const [, c] of this.crates) c.s.tint = this.light.at({ x: c.s.x, y: c.s.y }, null, rv);
    for (const s of this.sorted.children) if ((s as Sprite & { lowLit?: boolean }).lowLit) (s as Sprite).tint = this.light.at({ x: s.x + 16, y: s.y + 40 }, null, rv);
  }

  private drawDebug(f: ViewFrame) {
    const g = this.debugG.clear(), m = this.map!, b = m.bounds;
    for (let y = Math.floor(b.y / 32); y < (b.y + b.h) / 32; y++) for (let x = Math.floor(b.x / 32); x < (b.x + b.w) / 32; x++) {
      const c = m.cells[y]?.[x]; const door = m.doors.find(d => d.x === x && d.y === y);
      const color = door ? (f.doors[door.id] ? 0x6fd36f : 0xe0554a) : c === 'wall' ? 0xc84a3a : c === 'window' ? 0x5aa0e0 : c === 'low' ? 0xe0c050 : 0;
      if (color) g.rect(x * 32 + .5, y * 32 + .5, 31, 31).stroke({ width: 1, color, alpha: .8 });
    }
    for (const r of m.regions) g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ width: 1, color: f.revealed[r.id] ? 0x7fd07f : 0xd07fd0, alpha: .9 });
    for (const a of [f.player, ...f.actors]) {
      if (!a.alive) continue;
      const shown = a.regionId === null || f.revealed[a.regionId];
      g.circle(a.x, a.y, 10).stroke({ width: 1, color: shown ? 0x80e0ff : 0x555555, alpha: .9 });
      g.moveTo(a.x, a.y).lineTo(a.x + Math.cos(a.aim) * 140, a.y + Math.sin(a.aim) * 140).stroke({ width: 1, color: 0x80e0ff, alpha: .5 });
      g.moveTo(a.x, a.y).lineTo(a.x, a.y - AIM_H).stroke({ width: 1, color: 0xffffff, alpha: .5 });
    }
    for (const bl of f.bullets) g.rect(bl.x - 1, bl.y - 1, 3, 3).fill(0x80e0ff);
    if (f.interaction) g.circle(f.interaction.at.x, f.interaction.at.y, 5).stroke({ width: 1, color: 0xffff60 });
  }

  private render() {
    const r = this.app.renderer, cx = -this.cam.x, cy = -this.cam.y;
    this.groundRoot.position.set(cx, cy); this.light.layer.position.set(cx, cy); this.upper.position.set(cx, cy);
    r.render({ container: this.groundRoot, target: this.worldRT!, clear: true, clearColor: 0x121110 });
    r.render({ container: this.light.layer, target: this.lightRT!, clear: true, clearColor: 0x000000 });
    r.render({ container: this.lightHolder, target: this.worldRT!, clear: false });
    r.render({ container: this.upper, target: this.worldRT!, clear: false });
    r.render({ container: this.upHolder, target: this.upRT!, clear: true, clearColor: 0x000000 });
  }

  clientToWorld(clientX: number, clientY: number): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    const dx = (clientX - rect.left) * (this.view.W / Math.max(1, rect.width)), dy = (clientY - rect.top) * (this.view.H / Math.max(1, rect.height));
    return { x: dx / this.view.s + this.cam.x, y: dy / this.view.s + this.cam.y };
  }
  worldToClient(p: Point): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: rect.left + (p.x - this.cam.x) * this.view.s * rect.width / Math.max(1, this.view.W), y: rect.top + (p.y - this.cam.y) * this.view.s * rect.height / Math.max(1, this.view.H) };
  }
  aimFromClient(clientX: number, clientY: number): number | null {
    const p = this.last?.player; if (!p) return null;
    const w = this.clientToWorld(clientX, clientY);
    return Math.atan2(w.y + AIM_H - p.y, w.x - p.x);
  }

  setMood(i: number) { this.opts.mood = i; if (this.map) this.light.setMood(i, this.map.bounds); }
  setViewTiles(n: 24 | 28) { this.opts.viewTiles = n; this.resize(); }
  moodName() { return MOODS[this.opts.mood % MOODS.length].name; }
  get fxCount() { return this.fx.count; }
  textureBytes() { return this.tex.atlas.stats.bytes + this.view.w * this.view.h * 8 + this.view.w * this.view.k * this.view.h * this.view.k * 4; }
  regionName(): string | null {
    const p = this.last?.player, m = this.map; if (!p || !m) return null;
    return m.regions.find(r => r.inside && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)?.name ?? null;
  }
  get mapDef() { return this.map; }
  /** Diagnostic: whether an actor currently has any visible display object (used by the info-boundary check). */
  regionAt(p: Point): string | null { return this.map?.regions.find(r => r.inside && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)?.id ?? null; }
  /** Test probe: particles and decals currently withheld because their region is not revealed. */
  get hiddenFx() { return this.fx.hidden; }
  actorShown(uid: string): boolean { const g = this.actors.get(uid); return !!g && (g.body.visible || !!g.corpse?.visible); }
  /** Player is on the coast map but outside the dressed village corner (generic placeholder rendering). */
  outsideSample(): boolean {
    const p = this.last?.player, m = this.map, a = SAMPLE_AREA;
    return !!p && !!m && m.key.mapId === 'coast' && !(p.x >= a.x && p.x < a.x + a.w && p.y >= a.y && p.y < a.y + a.h);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearScene();
    // `context: true`: with any options object Pixi keeps a Graphics' own context registered with the renderer, which
    // outlives the view now that the renderer is reused.
    this.light?.destroy();
    this.weather?.destroy();
    for (const c of [this.groundRoot, this.upper, this.light?.layer, this.lightHolder, this.upHolder, this.screen,
      this.groundLayer, this.flat, this.shadows, this.sorted, this.xray, this.overhead, this.debugG, this.exitG, this.highlight, this.lightOverlay, this.upSprite])
      if (c && !c.destroyed) c.destroy({ children: true, context: true });
    for (const rt of [this.worldRT, this.lightRT, this.upRT]) if (rt) { rt.destroy(true); lifecycle.renderTextures--; }
    this.worldRT = this.lightRT = this.upRT = null;
    this.tex?.destroy();
    this.map = null; this.last = null;
    CoastView.live.delete(this);
  }
}

function rimOf(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = document.createElement('canvas'); o.width = c.width + 2; o.height = c.height + 2;
  const g = o.getContext('2d')!; g.drawImage(c, 1, 1);
  const img = g.getImageData(0, 0, o.width, o.height), d = img.data, out = new Uint8ClampedArray(d.length);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < o.width && y < o.height && d[(y * o.width + x) * 4 + 3] > 40;
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) { const i = (y * o.width + x) * 4; out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 255; }
  g.putImageData(new ImageData(out, o.width, o.height), 0, 0);
  return o;
}
export type { Texture };
