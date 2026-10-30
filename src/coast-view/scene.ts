import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import { worldKeyString, type ActorKind, type ActorView, type MapDef, type Point, type PublishedView, type Rect, type StampedEvent, type ViewFrame } from '../raid-runtime/contract';
import { hasRoof, isRuined, materials, regionLamps, storeys, type GroundMaterial } from './appearance';
import { SAMPLE_AREA } from '../sample-area';
import { paintGround, puddles, type GroundBake } from './art/ground';
import { canvas, silhouette } from './art/paint';
import { groundGeometry } from './art/surface';
import { LOOT_FOOT, LOOT_H } from './art/props';
import { solWall, type SolArt } from './art/sol';
import { LOW_H, ROOF_MARGIN, STOREY_H, WALL_H, paintCanopy, paintCeiling, paintDoorGuide, paintDownpipe, paintDoorFoot, paintLintel, paintLow, paintOpeningGuide, paintPassageGuide, paintRoof, paintStairLabel, paintStairs, paintWall, paintWallAC, wallKey, type WallSpec } from './art/structures';
import { Fx } from './fx';
import { gait, walkFrame } from '../gait';
import { Lighting, MOODS, lamp, type Light } from './lighting';
import { Textures } from './textures';
import { enemyMotion } from './enemy-motion';
import { BLOW_TIERS, REDUCED_KICK, ShotBlows, bloodDrops, blowTier, pushCamera, type BlowTier } from './blow-feel';
import { lifecycle } from '../view-lifecycle/scope';
import { Weather, type RoofArea, type WeatherKind } from './weather';
import { Tide, paintWade } from './tide';
import { isMall, knownDoor, knownStructurePoint, occupiedStructure, regionAtClosed, shownAt } from './structure-guide';
import { paintMallGround } from './art/mall-ground';
import { clearanceCuts, clearances, doorClearances, indoorArea, rowModes, sinkStep, sunkRows, topClear, underRule, wallCell, wallRule, type WallMode, type WallRule } from './wall-display';
import { buildMall, mallDress, mallDressMap, type Link, type MallDress, type OccluderKind } from './mall-scene';
import type { MallArt } from './mall-art';
import { MALL_FOOTPRINT, insideFootprint, mallOpenings } from './mall-dressing';
import { mallRegionDressed } from '../mall-layout-v4';
import { releaseManagedSlots } from '../view-lifecycle/renderer-lifetime';
import { FACTORY_LEAD, aimLead, leadRoom, pointerLead, scopeScale, snapAxis, stepLead, touchScopeLead, type AxisHold, type CameraBounds, type Lead, type LeadScale } from './camera';
import { viewScale, type ViewScaleMode } from './view-scale';
import { heldWeaponOffset, idleRetraction, stepRetraction, type RetractionShot, type RetractionState } from './weapon-retraction';

export const AIM_H = 22;
/** Mall floors name a stair only within this distance of the player (world px, eight cells). */
const MALL_LABEL_RANGE = 8 * 32;
/**
 * Held weapons point along the ground-plane aim, but a barrel aimed away from (north) or toward (south) the camera
 * is seen end-on in the 3/4 view, so its drawn length shrinks with |sin(aim)|. Direction stays the aim, so bullets,
 * tracers and the muzzle flash stay on the gun's line. Facing away, this keeps the gun inside the torso and pack
 * silhouette instead of poking above the head (ART-R08); simulation and muzzle distance are untouched.
 */
const heldLength = (angle: number) => 1 - .5 * Math.abs(Math.sin(angle));
/**
 * The end of a held weapon's barrel in its canvas: the right edge of the farthest opaque column, at the middle of that
 * column's opaque rows (the art points right; outlines included). Read from the pixels, so new art needs no metadata.
 */
function barrelTip(canvas: HTMLCanvasElement): Point {
  const g = canvas.getContext('2d', { willReadFrequently: true }), w = canvas.width, h = canvas.height;
  const data = g?.getImageData(0, 0, w, h).data;
  for (let x = w - 1; data && x >= 0; x--) {
    const rows: number[] = [];
    for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] > 0) rows.push(y);
    if (rows.length) return { x: x + 1, y: (rows[0] + rows[rows.length - 1] + 1) / 2 };
  }
  return { x: w, y: h / 2 };
}
/** Seconds of the fall before the corpse sprite replaces the body. */
const FALL_T = .16;
/** The feet slide back this far (world px, plus a little down) while the body tips, so the fallen body lies where the corpse is drawn. */
const FALL_SLIDE = 18;
/** Seconds a blow shows the hurt body (frame 5), then the recovery body (frame 6), on art that has them (#75). */
const HURT_POSE = .09, RECOVERY_POSE = .06;

interface Occluder {
  sprite: Sprite; key: string; kind: OccluderKind;
  z: number; rect: Rect; keepBottom: number; level: number; target: number; region?: string; spec?: WallSpec;
  /** Sprites that copy this occluder's fade, visibility and culling (signs, wall pieces, emission overlays). */
  links?: Link[];
  /** World point whose light tints the sprite (default: just in front of its south edge). */
  tintAt?: Point;
  tall?: { full: string; flat: string; band: number; y: number; building: Rect; collapsed: boolean };
  /** A door caught between closed and open for a few frames (display only; the Runtime state already changed). */
  swing?: { t: number; key: string };
  /** Map cell of a wall, door or header piece (buildGeneric, buildMall); furniture and pillars have none. */
  cell?: { x: number; y: number };
  /**
   * Set while the piece belongs to the building the player stands in, or rises back after the player left it
   * (updateWalls): its indoor rule and mode now, the canvas-local rectangles cut for doorways, and the state and picture
   * last drawn. `sunk` runs from 0 (whole) to 1 (down to its cell, wall-display.ts sinkStep); `clear` is its topClear,
   * null when it switches outright; `home` the y of its links; `crops` the reframed textures of the piece (0) and its
   * links (1 on) while it moves. The focus fade leaves it alone meanwhile.
   */
  wall?: { rule: WallRule; mode: WallMode; cut: Rect[]; drawn?: string; sunk: number; clear: number | null; home: number[]; crops?: Texture[] };
  /** Atlas key of the picture drawn now when it is not `key` (indoor walls): what the occlusion outline reads. */
  shown?: string;
}
interface ActorGfx {
  kind: ActorKind; body: Sprite; weapon: Sprite; flash: Sprite; rim: Sprite; wrim: Sprite; shadow: Sprite; corpse: Sprite | null; corpseKey: string;
  /** Trigger and support sleeves from the shoulders to the hands painted on the held weapon. */
  arms: [Sprite, Sprite];
  /** Water band at the feet while the actor stands in a flooded tide cell. */
  wade: Sprite;
  telegraph: Graphics;
  /** Player only: faint warm outline so the player separates from dark asphalt (not the occlusion rim). */
  edge: Sprite | null;
  walk: number; dir: number; flashT: number; deathT: number; kick: Point; kickT: number; seen: boolean; swingT: number;
  /** A blow not drawn yet: the next syncActor draws its flash and kick even when that frame's delta outlives them. */
  hit: boolean;
  /** Seconds left of a blow's body pose, like flashT: the hurt frame while more than RECOVERY_POSE is left, then recovery. */
  hurtT?: number;
  /** Only the latest gun-shot pulse; never persisted or queued across actors/maps/epochs. */
  retraction: RetractionState;
  /** Walk-cycle direction from the gait rule: 1 forward, -1 reversed while backpedalling (F08). */
  sense: 1 | -1;
  /** Half-cycles of the walk, to put a puff of dust under each sprinting step. */
  step: number;
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });
const corpseFacing = (a: ActorView): 1 | -1 => Math.cos((a.corpse?.angle ?? a.aim) + Math.PI) >= 0 ? 1 : -1;
const dirOf = (a: number) => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;

export interface ViewOptions {
  debug: boolean; xray: boolean; mood: number; reducedMotion: boolean;
  /**
   * The range's A/B switch for #75's hit-feel rounds (docs/hit-feel/TASKS.md H-01): 'classic' plays and draws what each
   * round replaced, 'enhanced' (default) the new version. Read live, so the range panel can switch it mid-raid. Read by
   * the gunshot families (H-02), the blow tiers and per-shot blows (H-03, H-04, blow-feel.ts), the wall and door
   * impacts (H-05), the camera push on the player's blows (H-06) and the gun's retraction after a shot (#119,
   * weapon-retraction.ts).
   */
  feel?: 'enhanced' | 'classic';
  viewTiles: 24 | 28;
  collapseTall: boolean;
  /** Decoded Sol samples; null keeps the procedural placeholders. */
  art: SolArt | null;
  /** Decoded mall samples (mall raids); null draws mall floors with the generic placeholder pipeline. */
  mallArt: MallArt | null;
  /** Playtest entries (?sample=): shade and label the areas the samples have not dressed yet. */
  sampleMarks: boolean;
  /** Drizzle on the coast map (default) or a dry overcast; reduced motion keeps only a still mist. */
  weather: WeatherKind;
  /** Device px per world px (view-scale.ts): default 'whole'; ?crisp=1 'near' (closer whole number); ?crisp=0 'fit' (the old fractional picture). */
  scale?: ViewScaleMode;
  /** The retraction probe's own switch (docs/evidence/issue75-weapon-retraction): false keeps the original gun and
   *  fixed-world flash even with the enhanced feel. Players compare through `feel` only. */
  weaponRetraction?: boolean;
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
  readonly tide: Tide;

  private map: MapDef | null = null;
  private mapKey = ''; private epoch = -1;
  private occluders: Occluder[] = [];
  private doors = new Map<string, Occluder>();
  private doorGuides = new Map<string, Sprite>();
  /**
   * The door the interaction prompt is about (#26 F07): a glow over its leaf at the door's own depth, so actors in front
   * stay on top, and the way through it on the floor under the actors (showFacedDoor). Made when a door is first faced.
   */
  private facedDoor: { glow: Sprite; way: Sprite } | null = null;
  private stairLabels = new Map<string, Sprite>();
  private actors = new Map<string, ActorGfx>();
  /** `from`: the drawn muzzle (chest plane) the tracer starts at; `seen`: where the head was first shown (its tail never
   *  reaches back past it, so a tracer leaving a hidden room does not point into it). */
  private bullets = new Map<string, { g: Graphics; born: Point; vx: number; vy: number; from: Point | null; seen: Point | null; off: Point }>();
  private crates = new Map<string, { s: Sprite; shadow: Sprite; empty: boolean; look: 'full' | 'empty' | 'open' }>();
  private loot = new Map<string, Sprite>();
  /** Muzzle flashes and knife swings; `t` is null until the frame that made one has been drawn (see present). */
  private muzzles: { s: Sprite; t: number | null; shooter?: string; weapon?: ActorView['weapon'] }[] = [];
  private swings: { g: Graphics; t: number | null }[] = [];
  private highlight = new Sprite();
  /** The gun's laser (#28 M2-03): a thin line from the drawn muzzle to where the Runtime's beam stops, and its dot. */
  private laserG = new Graphics();
  /** Outlines the gun's light puts on the containers and ground items it shows (#28 M2-03), reused frame to frame. */
  private litRims: Sprite[] = [];
  /** The gun light's pools in the light layer (#28 M2-03), replaced every frame. */
  private deviceLights: Light[] = [];
  private fadeClock = 0;
  private rngState = 7;
  private time = 0;
  private destroyed = false;

  cam = { x: 0, y: 0 };
  /** Smoothed follow camera (without look-ahead); hx/hy are what snapAxis carries per axis and `lead` the look-ahead (both
   *  never mutated, only replaced), kept on camF so a probe that copies and restores camF reproduces the camera exactly
   *  (a rebuild's fresh camF drops them). */
  private camF: { x: number; y: number; hx?: AxisHold; hy?: AxisHold; lead?: Lead } = { x: 0, y: 0 };
  /** The mouse pointer (client px) the host aims with this frame, or null while touch aims: picks the look-ahead. */
  pointer: Point | null = null;
  /** How far the sight in hand stretches the precise look-ahead this frame (#28 M3-11; scopeScale of hud.sight). */
  private leadScale: LeadScale = FACTORY_LEAD;
  /** Camera kick opposite the player's shot, settling back within a few frames. */
  private recoil = { x: 0, y: 0 };
  /** Which shot fired each round and which shot last struck each body (#75 H-04); cleared with the scene. */
  private shots = new ShotBlows();
  /** This batch's blows by `${body}|${shot}`: rounds that struck, the tier and angle, whether the shot was already shown on
   *  that body, and whether this batch has drawn its blow and blood yet. */
  private blowGroups = new Map<string, { pellets: number; tier: BlowTier; angle: number | null; again: boolean; blown: boolean; bled: boolean }>();
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
      this.tex = new Textures(opts.art, uids => releaseManagedSlots(this.app, 'glTexture', uids));
      this.tex.atlas.defer = true;
      this.light = new Lighting(this.tex);
      this.weather = new Weather(this.tex, opts.weather, opts.reducedMotion);
      this.tide = new Tide(this.tex, opts.reducedMotion);
      // Tidal water lies on the ground (over the mud flats) and under loot, corpses, shadows and rain.
      this.groundRoot.addChild(this.groundLayer, this.tide.layer, this.flat, this.shadows, this.weather.back);
      this.sorted.sortableChildren = true;
      this.upper.addChild(this.sorted, this.xray, this.overhead, this.weather.front, this.debugG);
      this.lightOverlay.blendMode = 'multiply';
      this.lightHolder.addChild(this.lightOverlay);
      this.upHolder.addChild(this.upSprite);
      this.fx = new Fx(this.tex, this.sorted, this.flat, (x, y) => this.regionsAt({ x, y }));
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
    const s = viewScale(W, H, this.opts.viewTiles, this.opts.scale);
    // At a whole-number s, k = s and the screen is copied 1:1.
    const k = Math.ceil(s), w = Math.ceil(W / s), h = Math.ceil(H / s);
    this.view = { w, h, s, k, dpr, W, H };
    this.app.renderer.resize(W, H);
    this.releaseTargets();
    this.worldRT = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' }); lifecycle.renderTextures++;
    this.lightRT = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest' }); lifecycle.renderTextures++;
    this.upRT = RenderTexture.create({ width: w * k, height: h * k, scaleMode: 'linear' }); lifecycle.renderTextures++;
    this.lightOverlay.texture = this.lightRT;
    this.upSprite.texture = this.worldRT; this.upSprite.scale.set(k);
    this.screen.texture = this.upRT; this.screen.scale.set(s / k);
  }

  /** Release only this view's replaced targets, including their now-empty Pixi texture slots. */
  private releaseTargets() {
    const targets = [this.worldRT, this.lightRT, this.upRT].filter((rt): rt is RenderTexture => !!rt);
    const uids = targets.map(rt => rt.source.uid);
    for (const rt of targets) { rt.destroy(true); lifecycle.renderTextures--; }
    this.worldRT = this.lightRT = this.upRT = null;
    releaseManagedSlots(this.app, 'glTexture', uids);
  }

  /** `follow` is the camera's smoothing step: the Runtime clock's delta from the host, the view delta otherwise. */
  present(batch: PublishedView, dt: number, follow = dt) {
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
    // Particles far from the player are the first to go when a fight spends the budget (#75 H-07).
    this.fx.focus = { x: f.player.x, y: f.player.y };
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
    // A blow flashes and kicks its body on the frame that brings it, so it is set before the body is drawn (#75); the
    // blood still comes with the event below. A body drawn for the first time in this batch gets it from the next frame.
    const blown = new Set<string>();
    if (this.opts.feel === 'classic') {
      for (const e of batch.events) {
        if (e.type !== 'hurt' || e.cause !== 'blow' || !current(e)) continue;
        const g = this.actors.get(e.uid); if (g) { this.blow(g, e.angle); blown.add(e.uid); }
      }
    } else this.landBlows(batch, current, fallen, blown, dt);
    this.tide.sync(f.flooded, dt, this.time);
    // Scope-filter before retaining even a hidden shooter's sequence: a later reveal cannot replay its pulse.
    const fired = new Map<string, RetractionShot>();
    for (const e of batch.events) if (e.type === 'shot' && current(e)) {
      const old = fired.get(e.shooter); if (!old || old.seq < e.seq) fired.set(e.shooter, e);
    }
    const seen = new Set<string>();
    for (const a of [f.player, ...f.actors]) { seen.add(a.uid); this.syncActor(a, dt, visible(a.regionId), fallen.has(a.uid), fired.get(a.uid)); }
    for (const [uid, g] of this.actors) if (!seen.has(uid)) { this.dropActor(g); this.actors.delete(uid); }
    this.syncCrates(f, visible); this.syncLoot(f, visible); this.syncBullets(f);

    for (const e of batch.events) {
      this.stats.events++;
      if (!current(e)) { this.stats.droppedEvents++; continue; }
      this.onEvent(e, f, blown);
    }
    // A scope (#28 M3-11): with the right button held, a flick across the screen drops the whole look-ahead in one frame,
    // so the camera can move further than the 96 px margin the culling below keeps around the last camera (walls at the
    // screen edge went undrawn for a frame from x1.5 up, M0-07). With a scope the camera is placed first and the baking
    // and culling use this frame's; at the factory scale the order stays as it was.
    this.leadScale = scopeScale(f.hud.sight?.scope ?? 1, this.view.H / this.view.dpr);
    const early = this.leadScale.x !== 1 || this.leadScale.y !== 1;
    if (early) this.camera(f, dt, follow);
    this.bakeAhead(dt);
    this.fx.update(dt);
    this.fx.reveal(f.revealed);
    // A flash or swing made by this batch's events is drawn once before it ages: below about 14 frames a second it used to
    // age past its life in the frame that made it and was never seen (PR #39, on CI's software renderer every time).
    for (let i = this.muzzles.length - 1; i >= 0; i--) {
      const m = this.muzzles[i];
      if (m.t === null) { m.t = 0; continue; }
      // Keep a live flash on its gun while the grip recovers. A tracer keeps its original shot-time from/off snapshot.
      // Follow/visibility and expiry finish in this loop before render(): even a long dt cannot draw an expired sprite.
      if (this.opts.weaponRetraction !== false && this.opts.feel !== 'classic' && m.shooter) {
        const a = [f.player, ...f.actors].find(a => a.uid === m.shooter);
        const tip = a && a.alive && a.weapon === m.weapon && shownAt(this.map!, f.revealed, a) ? this.muzzleOf(a) : null;
        if (!tip) { m.s.destroy(); this.muzzles.splice(i, 1); continue; }
        m.s.position.set(Math.round(tip.at.x + Math.cos(tip.angle) * 1.5), Math.round(tip.at.y + Math.sin(tip.angle) * 1.5));
        m.s.rotation = tip.angle;
      }
      m.t += dt;
      if (m.t > .03) m.s.texture = this.tex.muzzle(1);
      if (m.t > .07) { m.s.destroy(); this.muzzles.splice(i, 1); }
    }
    for (let i = this.swings.length - 1; i >= 0; i--) { const s = this.swings[i]; if (s.t === null) { s.t = 0; continue; } s.t += dt; s.g.alpha = 1 - s.t / .14; if (s.t > .14) { s.g.destroy(); this.swings.splice(i, 1); } }

    this.updateExit(f);
    this.updateTall(f);
    this.updateWalls(f, dt);
    this.updateFades(f, dt);
    this.updateStructureGuides(f);
    this.updateXray(f);
    this.updateHighlight(f, visible);
    if (!early) this.camera(f, dt, follow);
    if (this.map && isMall(this.map)) {
      // Mist thins out indoors over half a second (the mall's plaza and terrace are outdoors, its halls are not).
      const indoor = insideFootprint(Math.floor(f.player.x / 32), Math.floor(f.player.y / 32)) ? 1 : 0;
      this.weather.shelter += (indoor - this.weather.shelter) * Math.min(1, dt * 4);
    }
    this.weather.update(this.time, this.cam, this.view, f.revealed);
    this.light.syncUnseen(dt, f.revealed);
    this.syncDevices(f);
    this.light.sync(dt, l => (l.region === undefined || l.region === null || f.revealed[l.region] === true) && !l.regions?.some(r => f.revealed[r] !== true), this.time);
    this.tintUpright(f);
    if (this.opts.debug) this.drawDebug(f); else this.debugG.clear();
    this.render();
    this.stats.frameMs = performance.now() - t0;
    this.stats.sprites = this.sorted.children.length + this.flat.children.length + this.xray.children.length;
  }

  private clearScene() {
    for (const layer of [this.groundLayer, this.flat, this.shadows, this.sorted, this.xray, this.overhead]) for (const c of layer.removeChildren()) c.destroy();
    this.fx?.clear(); this.shots.clear(); this.blowGroups.clear();
    for (const o of [...this.indoor, ...this.rising]) this.dropCrops(o.wall!);
    this.occluders = []; this.indoor = []; this.rising = []; this.indoorOf = undefined; this.openingGuides = []; this.pendingChunks = []; this.doors.clear(); this.doorGuides.clear(); this.facedDoor = null; this.stairLabels.clear(); this.actors.clear(); this.bullets.clear(); this.crates.clear(); this.loot.clear(); this.muzzles = []; this.swings = [];
    this.debugG.clear();
  }

  private rebuild(m: MapDef, f: ViewFrame) {
    const t0 = performance.now(), mapKey = worldKeyString(m.key);
    // Ground depends only on the map definition, so baked chunks are kept for the view's life: a raid has the coast and
    // two small floors (about 16 MB in all), and going upstairs and back, or an epoch rebuild, never bakes again.
    this.map = m; this.stats.rebuilds++;
    this.clearScene();
    this.highlight = new Sprite(); this.highlight.visible = false; this.xray.addChild(this.highlight);
    this.laserG = new Graphics(); this.sorted.addChild(this.laserG); this.litRims = []; this.deviceLights = [];
    this.exitG = new Graphics(); this.groundLayer.addChild(this.exitG);
    const b = m.bounds, M = materials(m);
    let bake = this.bakes.get(mapKey);
    if (!bake) { const geo = groundGeometry(m, M); bake = { geo, puddles: puddles(m, M, geo) }; this.bakes.set(mapKey, bake); }
    // Mall floors with Sol's samples: dressing tables, ground inputs and lights depend only on the map (one per floor).
    const mall = this.mall = this.opts.mallArt && isMall(m) ? this.mallFor(m, mapKey, this.opts.mallArt) : null;
    const art = this.opts.art, groundBake = bake;
    const paint = (r: Rect) => mall ? () => paintMallGround(m, r, mall.ground, art) : () => paintGround(m, r, M, art, groundBake);

    // Ground is painted once into 512px chunks (standalone textures), so the full 2304x1664 coast never needs one huge texture.
    // Chunks around the starting view bake now; the rest bake nearest-first, one per presented frame (bakeAhead), so the
    // first entry to the 2304x1664 coast does not stall on all twenty chunks at once.
    const CH = 512, prefix = `ground:${mapKey}`, near = grow({ x: f.player.x - this.view.w / 2, y: f.player.y - this.view.h / 2, w: this.view.w, h: this.view.h }, 64);
    this.pendingChunks = [];
    for (let cy = b.y; cy < b.y + b.h; cy += CH) for (let cx = b.x; cx < b.x + b.w; cx += CH) {
      const r = { x: cx, y: cy, w: Math.min(CH, b.x + b.w - cx), h: Math.min(CH, b.y + b.h - cy) }, key = `${prefix}:${cx},${cy}`;
      if (this.tex.atlas.has(key) || intersects(r, near)) this.placeChunk(r, key, paint(r));
      else this.pendingChunks.push({ r, key, paint: paint(r) });
    }
    if (m.key.mapId === 'coast' && this.opts.sampleMarks) this.markSampleArea(b);
    for (const e of m.entries) {
      if (!mall?.flights.has(e.id)) {
        const s = new Sprite(this.tex.ensure(`stairs:${e.kind}`, () => paintStairs(e.kind === 'up' ? 'up' : 'down')));
        s.position.set(Math.floor(e.at.x / 32) * 32, Math.floor(e.at.y / 32) * 32 - 8); this.groundLayer.addChild(s);
      }
      // The label's place and size in the world; the host draws its text in the HUD's own pixel face (world-space text
      // would be upscaled with the scene and blur), so the sprite itself is never rendered.
      const label = new Sprite(this.tex.ensure(`stairs-label:${e.label}`, () => paintStairLabel(e.label)));
      label.anchor.set(.5, 0); label.position.set(e.at.x, e.at.y + 22); label.visible = false; label.renderable = false;
      this.overhead.addChild(label); this.stairLabels.set(e.id, label);
    }
    for (const x of m.exits) { const s = new Sprite(this.tex.exitDecal()); s.anchor.set(.5); s.position.set(x.at.x, x.at.y); this.groundLayer.addChild(s); }
    for (const n of m.notes) { const s = new Sprite(this.tex.loot('note')); s.anchor.set(.5, 11 / 14); s.position.set(n.at.x, n.at.y); this.flat.addChild(s); }

    const roofs: RoofArea[] = [];
    this.openingGuides = [];
    if (mall) for (const o of mall.openings) {
      const n = (o.wall === 'ew' ? o.w : o.h) / 32, depth = (o.wall === 'ew' ? o.h : o.w) / 32;
      const s = new Sprite(this.tex.ensure(`opening-guide:${o.wall}:${n}x${depth}`, () => paintOpeningGuide(o.wall, n, depth)));
      s.position.set(o.x, o.y); s.visible = false; this.xray.addChild(s); this.openingGuides.push({ s, at: { x: o.x + o.w / 2, y: o.y + o.h / 2 } });
    }
    if (mall) buildMall({
      tex: this.tex, art: this.opts.mallArt!,
      add: (key, x, y, z, kind, keep) => this.addOccluder(key, x, y, z, kind, keep),
      addSprite: s => { this.sorted.addChild(s); },
    }, mall);
    else this.buildGeneric(m, f, M, roofs);
    if (m.key.mapId === 'coast') this.dressCoast();
    // Awnings keep the pavement under them dry; the mall's footprint keeps all of its floor dry.
    const awnings = m.key.mapId === 'coast' ? [11, 25].map(tx => ({ x: tx * 32, y: 15 * 32 - 8, w: 4 * 32, h: 40 })) : isMall(m) ? [{ ...MALL_FOOTPRINT }] : [];
    this.tide.setMap(m);
    this.weather.setMap(m, bake.puddles, roofs, awnings, (x, y) => M[y >> 5]?.[x >> 5] === 'water' || this.tide.wet(x, y));
    this.light.mood = MOODS[this.opts.mood % MOODS.length]; this.light.setMap(m, mall?.zone ?? null);
    // Mall floors draw no ceilings (a maintainer decision), so an unrevealed room is shaded instead (#26 F14).
    this.light.setUnseen(m, mall ? m.regions.filter(r => r.inside && !r.sealed) : []);
    this.staticLights(m);
    this.stats.occluders = this.occluders.length;
    this.camF = { x: f.player.x - this.view.w / 2, y: f.player.y - AIM_H - this.view.h / 2 };
    this.stats.rebuildMs = performance.now() - t0;
  }
  /** Walls, doors, low furniture, roofs and ceilings of the coast and the resident building (and of mall floors without art). */
  private buildGeneric(m: MapDef, f: ViewFrame, M: GroundMaterial[][], roofs: RoofArea[]) {
    const b = m.bounds;
    const wallish = (x: number, y: number) => wallCell(m, x, y);
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
        occ.spec = spec; occ.cell = { x, y };
        if (door) {
          this.doors.set(door.id, occ);
          const guide = new Sprite(); guide.position.set(x * 32, y * 32 - WALL_H); guide.visible = false;
          this.xray.addChild(guide); this.doorGuides.set(door.id, guide);
        }
      } else if (bld && cell === 'floor' && !door && (y * 32 === bld.y || (y + 1) * 32 === bld.y + bld.h) && x * 32 > bld.x && (x + 1) * 32 < bld.x + bld.w) {
        this.tex.ensure('lintel', () => paintLintel(32));
        this.addOccluder('lintel', x * 32, y * 32 - WALL_H, (y + 1) * 32, 'lintel', 0).cell = { x, y };
      }
      if (cell === 'low') {
        const variant = m.key.mapId === 'coast' ? (x === 11 ? 'stove' : 'table') : (x < 4 ? 'bed' : 'cabinet');
        const s = new Sprite(this.tex.ensure(`low:${variant}`, () => paintLow(variant, x, y)));
        s.position.set(x * 32, y * 32 - LOW_H); s.zIndex = (y + 1) * 32 - .2; this.sorted.addChild(s);
        (s as Sprite & { lowLit?: boolean }).lowLit = true;
      }
    }

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
  }
  private pendingChunks: { r: Rect; key: string; paint: () => HTMLCanvasElement }[] = [];
  private placeChunk(r: Rect, key: string, paint: () => HTMLCanvasElement) {
    if (!this.tex.atlas.has(key)) this.tex.atlas.add(key, paint(), true);
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
    this.placeChunk(c.r, c.key, c.paint);
  }
  /** Ground chunks still waiting to bake (read by checks). */
  get pendingGround() { return this.pendingChunks.length; }
  /** Per-map bake inputs (geometry, noise lattices, puddles), reused by every rebuild of the same map. */
  private bakes = new Map<string, GroundBake>();
  /** Mall floors: dressing per map (kept like the ground inputs), and the current floor's. */
  private mallBakes = new Map<string, MallDress>();
  private mall: MallDress | null = null;
  private mallFor(m: MapDef, key: string, art: MallArt): MallDress {
    let d = this.mallBakes.get(key);
    if (!d) { d = mallDress(m, art, this.opts.reducedMotion); this.mallBakes.set(key, d); }
    return d;
  }

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

  private addOccluder(key: string, x: number, y: number, z: number, kind: OccluderKind, keepBottom: number): Occluder {
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
    // Mall floors light their halls with the dressing's tubes, cold cases and lamps instead of one lamp per room.
    // The copy is required: each light keeps its own reveal level (`lit`), and the cached dressing (mallBakes) stays clean.
    if (this.mall) this.light.lights.push(...this.mall.lights.map(l => ({ ...l })));
    else for (const l of regionLamps(m)) this.light.lights.push({ ...lamp(l.x, l.y, l.region, l.warm ? 0xc3a26a : 0xa08a5f), flicker: Math.floor(l.x * 7 + l.y * 13) % 997 });
    if (m.key.mapId === 'coast') {
      this.light.lights.push({ ...lamp(26 * 32, 18.5 * 32, null, 0xa08a5f), flicker: 311 });
      this.light.lights.push({ x: 20 * 32, y: 9 * 32, r: 90, color: 0xb59a68, k: .35, region: null });
    }
    for (const x of m.exits) this.light.lights.push({ x: x.at.x, y: x.at.y, r: 120, color: 0x7f9a55, k: .5, region: null });
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (m.cells[y][x] !== 'window') continue;
      const dx = m.cells[y][x - 1] === 'floor' ? -1 : m.cells[y][x + 1] === 'floor' ? 1 : 0, dy = m.cells[y + 1]?.[x] === 'floor' ? 1 : m.cells[y - 1]?.[x] === 'floor' ? -1 : 0;
      const at = { x: (x + .5 + dx) * 32, y: (y + .5 + dy) * 32 }, regions = this.regionsAt(at, m);
      this.light.lights.push({ x: (x + .5 + dx * 1.2) * 32, y: (y + .5 + dy * 1.2) * 32, r: 64, color: 0x8796a0, k: .45, region: regions[0] ?? null, ...regions.length > 1 ? { regions } : {} });
    }
  }

  /**
   * A blow's flash and kick, the way it travelled as its angle points back at the source (#75), and its hurt and
   * recovery pose, which syncActor shows where the art has those frames. Tier 0 is the 70 ms flash and the 2 px, 80 ms
   * kick; heavier tiers (blow-feel.ts) kick further, last longer and hold the hurt pose a moment longer.
   */
  private blow(g: ActorGfx, angle: number | null, tier: BlowTier = 0) {
    const t = BLOW_TIERS[tier], k = this.opts.reducedMotion ? Math.min(t.kick, REDUCED_KICK) : t.kick;
    g.flashT = t.flash; g.kick = angle === null ? { x: 0, y: 0 } : { x: -Math.cos(angle) * k, y: -Math.sin(angle) * k }; g.kickT = t.kickT; g.hit = true;
    g.hurtT = HURT_POSE + RECOVERY_POSE + t.hold;
  }

  /**
   * This batch's blows (#75 H-03, H-04, H-06): the rounds of one shot that struck one body are one blow, its tier from
   * how many struck, whether one was critical and whether it killed. Rounds of a shot already shown on that body (pellets
   * split over two batches) add blood only. Melee blows and rounds of an unknown shot group by body. The player's blow
   * also pushes the camera, unless motion is reduced. `blown` gets the bodies blown here; a body first drawn in this
   * batch is blown from onEvent with the same group.
   */
  private landBlows(batch: PublishedView, current: (e: StampedEvent) => boolean, fallen: ReadonlySet<string>, blown: Set<string>, dt: number) {
    const named = new Set<string>();
    for (const e of batch.events) {
      if (!current(e)) continue;
      // A shot's rounds can land in the batch that fires them.
      if (e.type === 'shot') this.shots.shot(e.shotId, e.pellets.map(p => p.bullet));
      if (e.type === 'impact') named.add(e.bullet); else if (e.type === 'hurt' && e.bullet) named.add(e.bullet);
    }
    const groups = new Map<string, { uid: string; shot: string | null; pellets: number; critical: boolean; angle: number | null }>();
    for (const e of batch.events) {
      if (e.type !== 'hurt' || e.cause !== 'blow' || !current(e)) continue;
      const shot = this.shots.of(e.bullet), key = `${e.uid}|${shot ?? ''}`;
      const b = groups.get(key) ?? { uid: e.uid, shot, pellets: 0, critical: false, angle: e.angle };
      b.pellets++; b.critical ||= e.critical; b.angle = e.angle ?? b.angle; groups.set(key, b);
    }
    this.blowGroups.clear();
    for (const [key, b] of groups) {
      const again = this.shots.seen(b.uid, b.shot), tier = blowTier(b.pellets, b.critical, fallen.has(b.uid));
      const group = { pellets: b.pellets, tier, angle: b.angle, again, blown: again, bled: false };
      this.blowGroups.set(key, group);
      const g = this.actors.get(b.uid); if (!g || again) continue;
      this.blow(g, b.angle, tier); blown.add(b.uid); this.shots.mark(b.uid, b.shot); group.blown = true;
      if (b.uid === 'player' && b.angle !== null && !this.opts.reducedMotion) this.recoil = pushCamera(this.recoil, b.angle, BLOW_TIERS[tier].pulse);
    }
    this.shots.prune(new Set(batch.frame.bullets.map(x => x.uid)), named, dt);
  }

  /**
   * Whether this actor may show pose frames: the art has them (assets/coast/poses) in the style its body is drawn with,
   * its archetype's own or else its kind's. An archetype with its own body but no poses keeps its own frames.
   */
  private posable(a: ActorView) {
    return this.tex.hasBodyFrame(a.kind, 5, a.tactics?.archetype);
  }

  /** `blown`: bodies whose blow present() already set before drawing them. */
  private onEvent(e: StampedEvent, f: ViewFrame, blown: ReadonlySet<string>) {
    const all = [f.player, ...f.actors], actor = (uid: string) => all.find(a => a.uid === uid);
    // Rooms may overlap: a point is shown only when every room containing it is revealed (the Runtime's rule).
    const regionAt = (p: Point) => regionAtClosed(this.map!, f.revealed, p);
    const shown = (p: Point) => shownAt(this.map!, f.revealed, p);
    switch (e.type) {
      case 'shot': {
        const a = actor(e.shooter); if (!a) break;
        const tip = this.muzzleOf(a);
        // The tracers of this shot leave the drawn muzzle; a shooter in view also shows them from there on.
        for (const p of e.pellets) {
          const b = this.bullets.get(p.bullet); if (!b) continue;
          b.from = tip?.at ?? null;
          if (!tip) continue;
          const ux = Math.cos(p.angle), uy = Math.sin(p.angle), vx = tip.at.x - p.origin.x, vy = tip.at.y - (p.origin.y - AIM_H), t = vx * ux + vy * uy;
          b.off = { x: vx - t * ux, y: vy - t * uy };
          if (shown(a)) b.seen = tip.at;
        }
        if (!shown(a)) break;
        const angle = tip?.angle ?? e.pellets.reduce((s, p) => s + p.angle, 0) / Math.max(1, e.pellets.length);
        if (a.tactics?.archetype === 'sac-spitter') { this.fx.acid(a.x, a.y, angle, this.rnd); break; }
        const art = this.weaponOf(a), c = Math.cos(angle), s = Math.sin(angle);
        const sp = new Sprite(this.tex.muzzle(0)); sp.anchor.set(.5); sp.blendMode = 'add';
        const reach = art.muzzle * heldLength(angle);
        if (tip) sp.position.set(Math.round(tip.at.x + c * 1.5), Math.round(tip.at.y + s * 1.5));
        else sp.position.set(Math.round(a.x + c * reach), Math.round(a.y - AIM_H + s * reach));
        sp.rotation = angle; sp.zIndex = a.y + .2 + (s < -.2 ? -.4 : 0);
        if (e.weapon === 'shotgun') sp.scale.set(1.4);
        this.sorted.addChild(sp); this.muzzles.push({ s: sp, t: null, shooter: a.uid, weapon: a.weapon });
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
        g.zIndex = a.y + .3 + (Math.sin(e.angle) < -.3 ? -.6 : 0); this.sorted.addChild(g); this.swings.push({ g, t: null });
        const ag = this.actors.get(a.uid); if (ag) ag.swingT = .14;
        break;
      }
      case 'impact': {
        if (!shown(e.lastFree)) break;
        if (e.owner && actor(e.owner)?.tactics?.archetype === 'sac-spitter') {
          this.fx.acid(e.lastFree.x, e.lastFree.y, 0, this.rnd, true); break;
        }
        if (e.reason === 'blocked') {
          const b = this.bullets.get(e.bullet), v = b ? Math.hypot(b.vx, b.vy) || 1 : 1;
          const n = e.normal ?? (b ? { x: -b.vx / v, y: -b.vy / v } : { x: 0, y: 1 });
          // Wall and door look different (#75 H-05); the classic A/B setting keeps the one shared spray.
          this.fx.sparks(e.lastFree.x, e.lastFree.y + .5, AIM_H, n.x, n.y, this.rnd, this.opts.feel === 'classic' ? null : e.surface);
          this.light.lights.push({ x: e.lastFree.x, y: e.lastFree.y, r: 34, color: 0xd9a860, k: .6, ttl: .06, region: regionAt(e.lastFree) });
        } else if (e.reason === 'start-blocked') this.fx.dust(e.lastFree.x, e.lastFree.y, this.rnd, 4);
        break;
      }
      case 'hurt': {
        // Only blows (any size) flash, kick and spray blood; bleeding, pollution, thirst, hunger and a lowered health
        // limit are shown by the host's HUD, not on the body.
        const g = this.actors.get(e.uid); if (!g || e.cause !== 'blow') break;
        // The classic A/B setting blows and bleeds per round, as before #75 H-03/H-04; otherwise per landBlows group.
        const shot = this.shots.of(e.bullet), group = this.opts.feel === 'classic' ? undefined : this.blowGroups.get(`${e.uid}|${shot ?? ''}`);
        if (!group) { if (!blown.has(e.uid)) this.blow(g, e.angle); }
        else if (!group.blown) { this.blow(g, group.angle, group.tier); this.shots.mark(e.uid, shot); group.blown = true; }
        // The angle points back at the blow's source, and the blood sprays that way: one spray per group, more for more rounds.
        const a = actor(e.uid), drops = !group ? 6 : group.bled ? 0 : bloodDrops(group.pellets, group.again);
        if (group) group.bled = true;
        if (a && shown(a) && drops) this.fx.blood(a.x, a.y + .5, AIM_H, e.angle ?? 0, this.rnd, drops);
        break;
      }
      case 'door': { const d = this.map!.doors.find(x => x.id === e.id); if (d) this.fx.dust(d.x * 32 + 16, d.y * 32 + 30, this.rnd, 4); break; }
      case 'looted': { const p = f.player; this.fx.dust(p.x, p.y, this.rnd, 2); break; }
      default: break;
    }
  }

  private syncActor(a: ActorView, dt: number, shown: boolean, fell = false, shot?: RetractionShot) {
    let g = this.actors.get(a.uid);
    // The fall plays only for a body already drawn standing and visible now; a death in a hidden room, or one first met
    // as a corpse, goes straight to the corpse.
    if (fell && g && !g.corpse && g.deathT === 0 && shown) g.deathT = .0001;
    if (!g) {
      const mk = () => { const s = new Sprite(); s.anchor.set(.5, 1); return s; };
      const arm = () => { const s = new Sprite(this.tex.arm(a.kind, a.tactics?.archetype)); s.anchor.set(0, .5); return s; };
      g = { kind: a.kind, body: mk(), weapon: new Sprite(), flash: mk(), rim: new Sprite(), wrim: new Sprite(), shadow: new Sprite(this.tex.blob(20, 7)), corpse: null, corpseKey: '',
        arms: [arm(), arm()], wade: new Sprite(this.tex.ensure('tide:wade', paintWade)), telegraph: new Graphics(), edge: a.kind === 'player' ? new Sprite() : null, walk: 0, dir: dirOf(a.aim), flashT: 0, deathT: 0, kick: { x: 0, y: 0 }, kickT: 0, seen: false, swingT: 0, hit: false, step: 0, sense: 1, retraction: idleRetraction() };
      g.flash.blendMode = 'add'; g.rim.anchor.set(.5, (48 + 1) / 50); g.shadow.anchor.set(.5); g.wade.anchor.set(.5, .5); g.wade.visible = false;
      this.sorted.addChild(g.body, ...g.arms, g.weapon, g.flash, g.wade); this.xray.addChild(g.rim, g.wrim);
      this.sorted.addChild(g.telegraph);
      if (g.edge) { g.edge.anchor.set(.5, (48 + 1) / 50); g.edge.tint = 0xf3dfa8; g.edge.alpha = .38; this.sorted.addChild(g.edge); } this.shadows.addChild(g.shadow);
      this.actors.set(a.uid, g);
    }
    g.kind = a.kind;
    // The classic feel draws the gun as before #119; switching to it mid-pulse drops the pulse.
    const back = stepRetraction(g.retraction, a.weapon, dt, this.opts.weaponRetraction !== false && this.opts.feel !== 'classic' && !this.opts.reducedMotion
      && a.alive && shownAt(this.map!, this.last!.revealed, a) && a.tactics?.archetype !== 'sac-spitter', shot);
    // The same room visibility as the body owns every cue. Never reveal an attack in a hidden room.
    g.telegraph.clear(); g.telegraph.visible = shown && a.alive && !!a.tactics;
    if (a.tactics && shown && a.alive) {
      const t = a.tactics, warning = t.stance === 'warning', windup = t.phase === 'windup';
      const color = warning ? 0xe4c46e : t.phase === 'reload' ? 0x86bed2 : t.stance === 'hostile' ? 0xe38969 : 0x97b7a3;
      g.telegraph.position.set(a.x, a.y); g.telegraph.zIndex = a.y + .09;
        if (t.boundary) g.telegraph.circle(t.boundary.at.x - a.x, t.boundary.at.y - a.y, t.boundary.radius).stroke({ width: 1.5, color: 0xe4c46e, alpha: .65 });
      if(t.checkpoint) {
        const p=t.checkpoint,permitted=p.phase==='granted',closed=p.phase==='engaged';
        const color=closed?0xe38969:permitted?0x8bd4b8:0xe4c46e;
        const wait=p.waiting,pass=p.passage;
        g.telegraph.rect(wait.x-a.x,wait.y-a.y,wait.w,wait.h).fill({color,alpha:.12}).stroke({width:1.5,color,alpha:.8});
        g.telegraph.rect(pass.x-a.x,pass.y-a.y,pass.w,pass.h).fill({color:permitted?color:0x8b9eac,alpha:permitted ? .16 : .04})
          .stroke({width:1,color:permitted?color:0x8b9eac,alpha:.6});
        const x=wait.x+wait.w/2-24-a.x,y=wait.y-8-a.y;
        g.telegraph.rect(x,y,48,4).fill({color:0x171b1b,alpha:.9});
        if(p.phase==='waiting'||permitted)g.telegraph.rect(x,y,48*p.waited/4,4).fill(color);
      }
      if (windup) {
        const length = Math.min(t.range, 90), c = Math.cos(t.aim), s = Math.sin(t.aim);
        g.telegraph.moveTo(0, 0).lineTo(c * length, s * length).stroke({ width: 2, color, alpha: .8 });
      }
      if (t.phase !== 'idle' || warning || t.awareness > 0) {
          const progress = warning ? 1 - t.warningLeft / (t.boundary ? 4 : 1.5) : t.phase === 'idle' ? t.awareness : 1 - Math.min(1, t.left / t.total);
        g.telegraph.rect(-10, -49, 20, 3).fill({ color: 0x171b1b, alpha: .9 });
        g.telegraph.rect(-10, -49, Math.max(1, 20 * progress), 3).fill(color);
      }
      // Temporary role badges make the three prototype roles distinct while their formal art is produced.
      const marks = t.archetype === 'raider-lookout' ? 3 : t.archetype === 'raider-gunner' ? 2 : 1;
      for (let i = 0; i < marks; i++) g.telegraph.rect(-marks * 3 + i * 6, -54, 3, 2).fill(color);
    }
    const speed = Math.hypot(a.vx, a.vy);
    g.walk = speed > 5 ? (g.walk + dt * speed / 22) % 4 : 0;
    const step = Math.floor(g.walk / 2);
    if (step !== g.step) { g.step = step; if (speed > 150 && shown && a.alive && dt > 0) this.fx.dust(a.x, a.y, this.rnd, 2); }
    // Backpedalling plays reversed steps on the aim's body; strafing turns the hips toward the movement (F08). The dead
    // and the falling face the aim as before: a death batch still carries the velocity of the step the actor died in.
    const gt = gait(a.aim, a.vx, a.vy, speed > 5 && a.alive, g.sense); g.sense = gt.sense; g.dir = gt.dir;
    // A blow's 70 ms flash and 80 ms kick age from the first frame that draws them: the hit's own (present sets them
    // before drawing), or the next for a body first drawn with the blow. Below about 14 frames a second (12.5 for the
    // kick) that frame's delta outlives them, so it draws them at least once (#75).
    const hit = g.hit; g.hit = false;
    g.flashT = Math.max(0, g.flashT - dt); g.kickT = Math.max(0, g.kickT - dt); g.swingT = Math.max(0, g.swingT - dt);
    if (g.deathT > 0) g.deathT += dt;
    const dying = !a.alive && g.deathT > 0 && g.deathT < FALL_T;
    // A blow's pose replaces the idle or walk frame: hurt (5) first, recovery (6) for the last RECOVERY_POSE seconds. The
    // frame that first draws the blow shows hurt however long it is, like the flash.
    let hurtFrame = 0;
    if (g.hurtT !== undefined) {
      // Under a microsecond counts as over: 0.15 s is 9 frames at 60 Hz, and the float left after them may not be 0.
      g.hurtT = g.hurtT - dt > 1e-6 ? g.hurtT - dt : 0;
      if (a.alive && this.posable(a)) hurtFrame = hit || g.hurtT > RECOVERY_POSE ? 5 : g.hurtT > 0 ? 6 : 0;
      if (g.hurtT === 0) g.hurtT = undefined;
    }
    const frame = dying ? 0 : hurtFrame || (speed > 5 ? walkFrame(g.walk, g.sense) : 0);
    const dead = !a.alive && !dying;
    const kicked = g.kickT > 0 || hit, kx = kicked ? g.kick.x : 0, ky = kicked ? g.kick.y : 0;
    const x = Math.round(a.x + kx), y = Math.round(a.y + ky);
    for (const s of [g.body, g.weapon, g.flash, g.shadow, ...g.arms]) s.visible = shown && !dead;
    if (g.edge) g.edge.visible = shown && !dead;
    g.seen = shown;
    if (dead) {
      g.wade.visible = false;
      const facing = corpseFacing(a), key = `corpse:${a.tactics?.archetype ?? a.kind}:${facing}`;
      if (!g.corpse || g.corpseKey !== key) {
        const fresh = !g.corpse && g.deathT > 0;
        g.corpse?.destroy();
        g.corpse = new Sprite(this.tex.corpse(a.kind, facing, a.tactics?.archetype)); g.corpse.anchor.set(.5, this.tex.corpseAnchorY(a.kind, a.tactics?.archetype)); g.corpseKey = key;
        this.flat.addChild(g.corpse);
        const seed = fresh ? null : [...a.uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
        let k = seed ?? 0; const r = () => seed === null ? this.rnd() : ((k = (k * 1103515245 + 12345) >>> 0) / 4294967296);
        // Spatter and pool belong to the body's rooms too: a drop that lands across a room's edge stays hidden with it.
        const owner = this.regionsAt(a);
        for (let i = 0; i < 14; i++) this.fx.decal(a.x - 9 + r() * 18, a.y - 2 + r() * 7, i % 3 ? 0x5a2724 : 0x6e2f2a, r() < .4 ? 2 : 1, owner);
        if (a.kind !== 'creature') this.fx.pool(a.x + facing * 4, a.y + 1, [...a.uid].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 3), fresh, owner);
        // Pools go under the body: move the corpse to the top of the flat layer again.
        this.flat.addChild(g.corpse);
      }
      g.corpse.position.set(x, y); g.corpse.visible = shown;
      g.rim.visible = g.wrim.visible = false;
      return;
    }
    if (g.corpse) { g.corpse.destroy(); g.corpse = null; g.corpseKey = ''; }
    // Dying: the standing frame tips over its feet toward the side the corpse will lie on, then the corpse replaces it.
    const pose = enemyMotion(a, this.opts.reducedMotion);
    const fall = dying ? Math.min(1, g.deathT / FALL_T) : 0, side = dying ? corpseFacing(a) : 0, tilt = dying ? side * 1.25 * fall : pose.tilt;
    const bx = x - Math.round(side * FALL_SLIDE * fall), by = y + Math.round(4 * fall);
    g.body.texture = this.tex.actor(a.kind, g.dir, frame, a.tactics?.archetype); g.body.position.set(bx, by); g.body.zIndex = a.y; g.body.rotation = tilt;
    if (g.edge) { g.edge.texture = this.tex.actorEdge(a.kind, g.dir, frame, a.tactics?.archetype); g.edge.position.set(bx, by + 1); g.edge.rotation = tilt; g.edge.zIndex = a.y - .002; }
    g.flash.texture = this.tex.actorFlash(a.kind, g.dir, frame, a.tactics?.archetype); g.flash.position.set(bx, by); g.flash.zIndex = a.y + .01; g.flash.visible = shown && (g.flashT > 0 || hit); g.flash.alpha = .5; g.flash.rotation = tilt;
    for (const sprite of [g.body, g.flash, g.rim]) sprite.scale.set(pose.x, pose.y);
    g.shadow.position.set(x + 2, y - 1);
    // Caught by the tide: the water covers the boots; the shadow drowns. Only for an actor that is drawn at all.
    const wading = shown && !dying && this.tide.wet(a.x, a.y);
    g.wade.visible = wading; g.shadow.visible = shown && !wading;
    if (wading) { g.wade.position.set(x, y - 2); g.wade.zIndex = a.y + .02; g.wade.scale.x = this.opts.reducedMotion ? 1 : 1 + .06 * Math.sin(this.time * 4 + a.x); }
    g.rim.texture = this.tex.actorRim(a.kind, g.dir, frame, a.tactics?.archetype); g.rim.position.set(x, y + 1); g.rim.tint = a.kind === 'player' ? 0xf0dca0 : 0xe07a5a;
    g.rim.rotation = tilt;
    const art = this.weaponOf(a);
    const polearm = a.tactics?.archetype === 'tide-ritualist' && a.weapon === 'club';
    const reload = a.state.reloading ? .75 * Math.sign(Math.cos(a.aim) || 1) : 0;
    const swing = polearm ? 0 : a.tactics?.phase === 'windup' ? -.6 * Math.sign(Math.cos(a.aim) || 1) : g.swingT > 0 ? (g.swingT / .14 - .5) * 1.4 : 0;
    // The player's gun turns with recoil (hud.aim.drift): it points where the next shot is centred, not at the pointer.
    const drift = a.uid === 'player' ? this.last?.hud.aim.drift ?? 0 : 0;
    const angle = a.aim + reload + swing + drift;
    g.weapon.texture = art.texture; g.weapon.anchor.set(art.pivotX / art.canvas.width, art.pivotY / art.canvas.height);
    // The barrel lies on the line from the chest along the gun, where the shots fly: an art's barrel row may sit off its
    // grip pivot (Sol's guns by 3-4 px), so the gun moves across by that much (`off`, in the sprite's flipped frame).
    const off = a.weapon === 'claw' ? 0 : (this.barrelTip(a).y - art.pivotY) * (Math.cos(a.aim) < 0 ? -1 : 1);
    // Weapon and arms round their offsets, not their positions: on the body's whole pixel they never shimmer against it.
    const thrust = polearm && a.tactics ? a.tactics.phase === 'windup' ? -4 : a.tactics.phase === 'release' ? 8
      : a.tactics.phase === 'recovery' ? 8 * Math.max(0, 1 - (a.tactics.total - a.tactics.left) / .22) : 0 : 0;
    const grip = heldWeaponOffset(angle, art.forward + thrust, off, back);
    g.weapon.position.set(x + grip.x, y - AIM_H + grip.y);
    g.weapon.rotation = angle; g.weapon.scale.set(heldLength(angle), Math.cos(a.aim) < 0 ? -1 : 1);
    g.weapon.zIndex = a.y + (Math.sin(a.aim) < -.35 ? -.05 : .05);
    g.weapon.visible = shown && a.weapon !== 'claw' && !dying;
    this.syncArms(g, a, art, angle, x, y);
    g.wrim.texture = art.rim; g.wrim.anchor.set((art.pivotX + 1) / (art.canvas.width + 2), (art.pivotY + 1) / (art.canvas.height + 2));
    g.wrim.position.copyFrom(g.weapon.position); g.wrim.rotation = g.weapon.rotation; g.wrim.scale.copyFrom(g.weapon.scale); g.wrim.tint = g.rim.tint;
  }
  /**
   * Shoulders sit 7 px above the aim plane and spread across the body as the actor turns toward or away from the camera
   * (the character's right is (-sin, cos) of the aim). The trigger arm reaches the grip pivot, the support arm the fore
   * grip along the barrel (or the same grip for a two-handed pistol); one-handed melee leaves the support arm down.
   */
  private syncArms(g: ActorGfx, a: ActorView, art: { support?: number; oneHanded?: boolean }, angle: number, x: number, y: number) {
    const on = g.weapon.visible;
    const c = Math.cos(angle), s = Math.sin(angle), hl = heldLength(angle);
    const gx = g.weapon.x, gy = g.weapon.y;
    // (x, y) is the body's whole pixel, so the rounded shoulders keep one offset from it while the actor walks.
    const sx = x + Math.cos(a.aim) * 1.5, sy = y - AIM_H - 7;
    const rx = -Math.sin(a.aim) * 4, ry = Math.cos(a.aim) * 1.5;
    const reach = (arm: Sprite, x0: number, y0: number, x1: number, y1: number) => {
      const ox = Math.round(x0), oy = Math.round(y0), dx = x1 - ox, dy = y1 - oy, len = Math.hypot(dx, dy);
      arm.visible = on && len > 1; arm.position.set(ox, oy); arm.rotation = Math.atan2(dy, dx); arm.scale.set(len, 1);
    };
    const support = art.support ?? 0;
    reach(g.arms[0], sx + rx, sy + ry, gx, gy);
    if (art.oneHanded) reach(g.arms[1], sx - rx, sy - ry, sx - rx + c * 2, sy - ry + 9);
    else reach(g.arms[1], sx - rx, sy - ry, gx + c * support * hl + c, gy + s * support * hl + s);
    // Arms share the weapon's depth, just under it so the painted gloves cover the sleeve ends.
    for (const arm of g.arms) { arm.zIndex = g.weapon.zIndex - .001; arm.tint = g.weapon.tint; }
  }
  private dropActor(g: ActorGfx) { for (const s of [g.body, g.weapon, g.flash, g.rim, g.wrim, g.shadow, g.wade, g.telegraph, g.corpse, g.edge, ...g.arms]) s?.destroy(); }

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
      // Under the tide an item stays where it is (unreachable until the water goes): drawn through the water, no glint.
      const under = this.tide.wet(l.x, l.y);
      s.tint = under ? 0x8a9e96 : (this.time % 2) < .12 ? 0xffffff : 0xe8e2d4; s.alpha = under ? .6 : 1;
    }
    for (const [uid, s] of this.loot) if (!seen.has(uid)) { s.destroy(); this.loot.delete(uid); }
  }
  private syncBullets(f: ViewFrame) {
    const seen = new Set<string>();
    const spitters = new Set(f.actors.filter(a => a.tactics?.archetype === 'sac-spitter').map(a => a.uid));
    for (const b of f.bullets) {
      seen.add(b.uid);
      const acid = spitters.has(b.owner ?? ''), height = acid ? 7 : AIM_H;
      let e = this.bullets.get(b.uid);
      if (!e) { e = { g: new Graphics(), born: { x: b.x, y: b.y }, vx: b.vx, vy: b.vy, from: null, seen: null, off: { x: 0, y: 0 } }; this.sorted.addChild(e.g); this.bullets.set(b.uid, e); }
      e.vx = b.vx; e.vy = b.vy;
      const show = shownAt(this.map!, f.revealed, b);
      const v = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / v, uy = b.vy / v;
      // The tracer runs parallel to the bullet's own path, shifted by `off` so it leaves the drawn muzzle (a pellet's spread
      // carries it at most a few px from the gun's line there); hits and impacts stay on the bullet itself.
      const headX = b.x + e.off.x, headY = b.y - height + e.off.y, hx = Math.round(headX), hy = Math.round(headY);
      if (show && !e.seen) e.seen = { x: headX, y: headY };
      // A tracer leaves the drawn muzzle: inside the barrel nothing shows, and the tail never reaches back past the muzzle
      // or past where the head was first shown. Without a known muzzle (a bullet already flying at load) it starts where
      // it was first published.
      const start = e.from ?? { x: e.born.x, y: e.born.y - height };
      const out = (headX - start.x) * ux + (headY - start.y) * uy - (e.from ? 0 : 3);
      const back = e.seen ? (headX - e.seen.x) * ux + (headY - e.seen.y) * uy : 0;
      const len = Math.min(b.enemy ? 8 : 14, out, back);
      e.g.clear();
      if (len > 0) e.g.moveTo(hx - ux * len, hy - uy * len).lineTo(hx, hy).stroke({ width: acid ? 2 : 1, color: acid ? 0x9da758 : b.enemy ? 0xe48c64 : 0xffe6a8, alpha: .55 });
      if (out > 0) {
        if (acid) e.g.circle(hx, hy, 2).fill(0xb6c16e);
        else e.g.rect(hx, hy, 1, 1).fill(b.enemy ? 0xffc29a : 0xfff6d8);
      }
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

  /**
   * Pieces under the indoor wall rule now, the building they belong to (undefined until the first frame of a scene), the
   * rows of their east-west runs and those rows' modes; and pieces of a building just left, rising back before the
   * fades take them again.
   */
  private indoor: Occluder[] = [];
  private indoorOf: string | null | undefined;
  private indoorRowIds: number[] = [];
  private indoorRows = new Map<number, 'full' | 'base'>();
  private rising: Occluder[] = [];
  /**
   * Walls of the building the player stands in (on a mall floor, of the mall's footprint) follow wall-display.ts instead
   * of the fades: a wall sinks into its footprint or rises back to the whole picture in WALL_SINK_T, doorways cut clear.
   * A sign, wall piece or glow on a piece goes down with it and shows only above its cell's south edge. A change of
   * building starts the rows over from the player's position; the walls of the building left rise back first. The first
   * frame of a scene, and reduced motion, switch outright.
   */
  private updateWalls(f: ViewFrame, dt: number) {
    const map = this.map!, area = indoorArea(map, f.player), id = area?.id ?? null;
    const snap = this.indoorOf === undefined || this.opts.reducedMotion;
    if (id !== this.indoorOf) {
      const left = this.indoor;
      this.indoor = []; this.indoorOf = id;
      if (area) {
        const pieces = new Set(this.occluders.flatMap(o => o.cell && o.kind !== 'lintel' ? [`${o.cell.x},${o.cell.y}`] : []));
        const wall = (x: number, y: number) => pieces.has(`${x},${y}`);
        // Doorways: the doors, and on mall floors the entrances (both lines of a thick wall's together).
        const openings = isMall(map) ? mallOpenings(this.mall?.dress ?? mallDressMap(map)).map(o => [...o.cells, ...o.twin ?? []]) : [];
        const doors = [...doorClearances(map, area.inside, WALL_H), ...clearances(openings, WALL_H)];
        for (const o of this.occluders) {
          if (!o.cell || !underRule(map, area.inside, o.cell)) continue;
          // A piece still on its way keeps how far it has sunk and where its links stand.
          const was = o.wall, cut = clearanceCuts(doors, o.rect, o.z);
          o.wall = { rule: wallRule(wall, area.inside, o.cell.x, o.cell.y, o.kind === 'lintel'), mode: 'full', cut, sunk: was?.sunk ?? 0,
            clear: topClear(cut, o.rect.w), home: was?.home ?? (o.links ?? []).map(l => l.sprite.y), crops: was?.crops };
          this.indoor.push(o);
        }
      }
      const now = new Set(this.indoor);
      this.rising = this.rising.filter(o => !now.has(o));
      for (const o of left) if (!now.has(o)) { if (snap || o.wall!.sunk === 0) this.releaseWall(o); else this.rising.push(o); }
      this.indoorRowIds = [...new Set(this.indoor.filter(o => o.wall!.rule === 'row').map(o => o.cell!.y))];
      // A piece the focus fade had thinned over the player goes straight to its mode: it never turns solid first.
      this.indoorRows = rowModes(this.indoorRowIds, f.player.y);
      for (const o of this.indoor) if (o.level > 0) o.wall!.sunk = this.modeOf(o) === 'base' ? 1 : 0;
    }
    if (this.indoor.length) this.indoorRows = rowModes(this.indoorRowIds, f.player.y, this.indoorRows);
    for (const o of this.indoor) this.showWall(o, this.modeOf(o), dt, snap);
    for (const o of this.rising) { this.showWall(o, 'full', dt, snap); if (!o.wall!.sunk) this.releaseWall(o); }
    this.rising = this.rising.filter(o => o.wall);
  }
  private modeOf(o: Occluder): WallMode { const r = o.wall!.rule; return r === 'row' ? this.indoorRows.get(o.cell!.y)! : r; }
  /**
   * Draws an indoor piece on its way to `mode`: the whole picture, the base one, or between them the whole picture
   * lowered (sunkRows) through a reframed texture, its links lowered with it and cut off at its cell's south edge. The
   * occlusion outline reads the picture of `mode`. Redrawn only when that state or the piece's own picture (a door
   * opening or closing) changes.
   */
  private showWall(o: Occluder, mode: WallMode, dt: number, snap: boolean) {
    const w = o.wall!, goal = mode === 'base' ? 1 : 0;
    o.level = o.target = 0; w.mode = mode;
    w.sunk = snap || mode === 'hidden' || w.clear === null ? goal : sinkStep(w.sunk, goal, dt);
    const rows = w.sunk > 0 && w.sunk < 1 ? sunkRows(o.rect.h, w.sunk, w.clear!) : null;
    const state = mode === 'hidden' ? 'hidden' : rows ? `sink:${rows.drop}` : w.sunk ? 'base' : 'full';
    if (w.drawn === `${state}|${o.key}`) return;
    w.drawn = `${state}|${o.key}`;
    const links = o.links ?? [], cutOf = (i: number) => w.cut.map(r => ({ ...r, x: r.x + o.rect.x - links[i].sprite.x, y: r.y + o.rect.y - w.home[i] }));
    if (mode === 'hidden') { o.shown = undefined; o.sprite.visible = false; for (const l of links) l.sprite.visible = false; return; }
    const key = this.tex.wallCut(o.key, mode === 'base' ? this.footKey(o) : null, w.cut);
    o.shown = key === o.key ? undefined : key;
    if (!rows) {
      const pic = state === 'base' ? this.tex.wallCut(o.key, this.footKey(o), w.cut) : this.tex.wallCut(o.key, null, w.cut);
      o.sprite.texture = this.tex.atlas.get(pic); o.sprite.y = o.rect.y; o.sprite.visible = true;
      links.forEach((l, i) => { l.sprite.texture = this.tex.atlas.get(this.tex.wallCut(l.key, null, cutOf(i))); l.sprite.y = w.home[i]; l.sprite.visible = state === 'full'; });
      this.dropCrops(w);
      return;
    }
    const crops = w.crops ??= [];
    o.sprite.texture = this.crop(crops, 0, this.tex.atlas.get(o.key), rows.from, rows.to);
    o.sprite.y = o.rect.y + rows.at; o.sprite.visible = rows.to > rows.from;
    links.forEach((l, i) => {
      const y = w.home[i] + rows.drop, t = this.tex.atlas.get(this.tex.wallCut(l.key, null, cutOf(i))), keep = Math.min(t.height, o.rect.y + o.rect.h - y);
      l.sprite.texture = this.crop(crops, i + 1, t, 0, keep); l.sprite.y = y; l.sprite.visible = keep > 0;
    });
  }
  /** Rows [from, to) of `t` through the reframed texture `crops[i]` (made on first use, from the same source). */
  private crop(crops: Texture[], i: number, t: Texture, from: number, to: number): Texture {
    const c = crops[i] ??= new Texture({ source: t.source, frame: t.frame, dynamic: true });
    if (c.source !== t.source) c.source = t.source;
    c.frame.copyFrom(t.frame); c.frame.y += from; c.frame.height = Math.max(1, to - from); c.update();
    return c;
  }
  private dropCrops(w: NonNullable<Occluder['wall']>) { for (const c of w.crops ?? []) c.destroy(); w.crops = undefined; }
  /** Hands a piece back to the fades, standing where it was built. */
  private releaseWall(o: Occluder) {
    const w = o.wall!;
    o.sprite.texture = this.tex.atlas.get(o.key); o.sprite.y = o.rect.y; o.sprite.visible = true;
    (o.links ?? []).forEach((l, i) => { l.sprite.texture = this.tex.atlas.get(l.key); l.sprite.y = w.home[i]; });
    this.dropCrops(w); o.wall = undefined; o.shown = undefined; o.level = -1;
  }
  /** The 32x32 picture of a wall piece cut down to its cell: its own top (cap), or a door's leaf or sill seen from above. */
  private footKey(o: Occluder): string {
    const door = o.spec?.kind === 'door-ew', key = door ? `door-foot:${o.spec!.open ? 1 : 0}` : `${o.key}|foot`;
    this.tex.ensure(key, () => {
      if (door) return paintDoorFoot(!!o.spec!.open);
      const { c, g } = canvas(32, 32); g.drawImage(this.tex.canvas(o.key), 0, 0, 32, 32, 0, 0, 32, 32); return c;
    });
    return key;
  }

  private updateFades(f: ViewFrame, dt: number) {
    const p = f.player;
    const occupied = occupiedStructure(this.map!, p);
    const focus: Rect[] = [{ x: p.x - 11, y: p.y - 44, w: 22, h: 44 }];
    if (f.interaction) focus.push({ x: f.interaction.at.x - 8, y: f.interaction.at.y - 20, w: 16, h: 22 });
    // Cull by the last camera: off-screen structure neither renders nor runs fade/tint work.
    const vr = { x: this.cam.x - 96, y: this.cam.y - 96, w: this.view.w + 192, h: this.view.h + 240 };
    for (const o of this.occluders) { o.sprite.renderable = intersects(vr, o.rect); if (o.links) for (const l of o.links) l.sprite.renderable = o.sprite.renderable; }
    // The occupied building's walls follow updateWalls. The rest (furniture, other buildings, the outdoors, sealed
    // blocks) fades only where it covers the player or the thing being used.
    for (const o of this.occluders) {
      if (!o.sprite.renderable) continue;
      if (o.wall) { o.target = 0; continue; }
      if (o.kind === 'roof' || o.kind === 'ceiling') {
        o.target = o.region && (f.revealed[o.region] || occupied?.regionIds.includes(o.region)) ? 4 : 0; continue;
      }
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
      if (o.wall) continue;
      if (!o.sprite.renderable && o.level !== -1) continue;
      if (o.level === -1) { o.level = Math.min(o.target, 2); this.applyFade(o); continue; }
      if (!step || o.level === o.target) continue;
      o.level += Math.sign(o.target - o.level); this.applyFade(o);
    }
    for (const s of this.shadows.children) { const roof = (s as Graphics & { roofOf?: Occluder }).roofOf; if (roof) s.alpha = 1 - roof.level / 4; }
  }
  /** Mall entrances: guides shown within this many world px of the player, fully opaque within two cells. */
  private openingGuides: { s: Sprite; at: Point }[] = [];
  private updateStructureGuides(f: ViewFrame) {
    const map = this.map!, occupied = occupiedStructure(map, f.player);
    // The original drew door guides under enemies and bullets. Here a guide is drawn above the actors (xray, so it shows
    // through walls), so it steps aside for the frames an enemy (body, held weapon, shadow) or a bullet's trail is on it.
    const threats: Rect[] = [];
    for (const a of f.actors) {
      const g = this.actors.get(a.uid), t = g?.body.texture;
      if (!g?.body.visible || !t) continue;
      threats.push({ x: g.body.x - t.width / 2 - 12, y: g.body.y - t.height, w: t.width + 24, h: t.height + 8 });
    }
    for (const b of f.bullets) if (shownAt(map, f.revealed, b)) {
      const v = Math.hypot(b.vx, b.vy) || 1, tx = b.x - b.vx / v * 14, ty = b.y - AIM_H - b.vy / v * 14;
      threats.push({ x: Math.min(b.x, tx) - 2, y: Math.min(b.y - AIM_H, ty) - 2, w: Math.abs(b.x - tx) + 5, h: Math.abs(b.y - AIM_H - ty) + 5 });
    }
    for (const o of this.openingGuides) {
      const d = Math.hypot(o.at.x - f.player.x, o.at.y - f.player.y);
      o.s.visible = d < 9 * 32; o.s.alpha = d < 2.5 * 32 ? .95 : .7;
    }
    const faced = f.interaction?.kind === 'door' ? f.interaction.ref.id : null;
    let facing = false;
    for (const door of map.doors) {
      const guide = this.doorGuides.get(door.id)!;
      guide.visible = knownDoor(map, door, f.revealed, occupied);
      if (!guide.visible) continue;
      const open = !!f.doors[door.id];
      guide.texture = this.tex.ensure(`door-guide:${door.wall}:${open}`, () => paintDoorGuide(door.wall, open));
      guide.alpha = door.id === faced ? 1 : .82;
      if (door.id === faced) { this.showFacedDoor(door, open); facing = true; }
      const box = { x: guide.x, y: guide.y, w: guide.texture.width, h: guide.texture.height };
      if (threats.some(t => intersects(t, box))) guide.visible = false;
    }
    if (!facing && this.facedDoor) this.facedDoor.glow.visible = this.facedDoor.way.visible = false;
    for (const entry of map.entries) {
      const label = this.stairLabels.get(entry.id)!;
      label.visible = knownStructurePoint(map, entry.at, f.revealed, occupied);
      // Mall floors: a drawn flight needs no label (the floor arrows lead to it); other stairs are named when near.
      if (this.mall && (this.mall.flights.has(entry.id) || Math.hypot(entry.at.x - f.player.x, entry.at.y - f.player.y) > MALL_LABEL_RANGE)) label.visible = false;
      label.position.set(entry.at.x, entry.at.y + 22);
      // Move below the player when needed; the interaction prompt already occupies the space above the head.
      if (label.visible && intersects({ x: label.x - label.width / 2, y: label.y, w: label.width, h: label.height },
        { x: f.player.x - 14, y: f.player.y - 44, w: 28, h: 48 })) label.y = f.player.y + 8;
    }
  }
  /**
   * Marks the door being faced: its leaf (or doorway) glows, pulsing unless motion is reduced, and the cells either side
   * of it show the way through, barred while it is closed. The glow uses the picture drawn now and is left out while the
   * door is faded for a view behind it, hidden or sinking; the way is a floor marking only, so walls and roofs in front
   * cover it like any floor and it shows nothing of the far side.
   */
  private showFacedDoor(door: MapDef['doors'][number], open: boolean) {
    const cue = this.facedDoor ??= { glow: this.sorted.addChild(new Sprite()), way: this.flat.addChild(new Sprite()) };
    const { glow, way } = cue, o = this.doors.get(door.id)!;
    way.texture = this.tex.ensure(`passage-guide:${door.wall}:${open}`, () => paintPassageGuide(door.wall, open));
    way.position.set(door.wall === 'ns' ? (door.x - 1) * 32 : door.x * 32, door.wall === 'ns' ? door.y * 32 : (door.y - 1) * 32);
    way.visible = true;
    const pic = !o.sprite.visible || o.wall?.crops || (!o.wall && o.level > 0) ? null : o.wall ? o.shown ?? o.key : o.key;
    glow.visible = !!pic;
    if (!pic) return;
    glow.texture = this.tex.ensure(`${pic}|glow:${door.wall}`, () => doorGlow(this.tex.canvas(pic), door.wall));
    glow.position.set(o.rect.x, o.sprite.y); glow.zIndex = o.z + .01;
    glow.tint = 0xf2deaa; glow.alpha = this.opts.reducedMotion ? .4 : .375 + Math.sin(this.time * 6) * .125;
  }
  private applyFade(o: Occluder) {
    if (o.links) for (const l of o.links) {
      l.sprite.visible = o.level < 4;
      if (l.sprite.visible) l.sprite.texture = this.tex.faded(l.key, o.level, 0, l.sprite.x, l.sprite.y);
    }
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
    const c = this.tex.canvas(o.shown ?? o.key), g = c.getContext('2d', { willReadFrequently: true })!;
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
        h.texture = this.tex.ensure(`${g.corpseKey}|rim`, () => rimOf(this.tex.canvas(g.corpseKey))); h.anchor.set(.5, (g.corpse.anchor.y * g.corpse.texture.height + 1) / (g.corpse.texture.height + 2)); h.position.copyFrom(g.corpse.position);
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

  /**
   * The gun's devices as the Runtime publishes them (hud.devices, #28 M2-03), drawn without bitmaps (ART-SPEC: beams are
   * not textures). The laser is a thin line at chest height from the drawn muzzle to where the beam stops, fading along
   * its length, with a dot where it lands; the light is three soft pools of the existing light layer along the aim,
   * widening with its arc, gated by the rooms they fall in like every lamp; and each container or ground item the light
   * shows gets the interaction highlight's outline. Nothing here decides an effect or draws anything the frame does not
   * carry. Reduced motion keeps the dot and the outlines steady.
   */
  private syncDevices(f: ViewFrame) {
    const p = f.player, d = p.alive ? f.hud.devices : null, still = this.opts.reducedMotion;
    const g = this.laserG.clear(), beam = d?.laser;
    if (beam) {
      const from = this.muzzleOf(p)?.at ?? { x: p.x, y: p.y - AIM_H }, to = { x: beam.to.x, y: beam.to.y - AIM_H };
      const run = { x: to.x - from.x, y: to.y - from.y }, n = 4;
      if (Math.hypot(run.x, run.y) > 1) for (let i = 0; i < n; i++)
        g.moveTo(from.x + run.x * i / n, from.y + run.y * i / n).lineTo(from.x + run.x * (i + 1) / n, from.y + run.y * (i + 1) / n)
          .stroke({ width: 1, color: 0xff5a46, alpha: .38 - .07 * i });
      if (beam.hit) g.rect(Math.round(to.x) - 1, Math.round(to.y) - 1, 2, 2).fill({ color: beam.inRange ? 0xffb09a : 0xff6a52, alpha: still ? .9 : .75 + .2 * Math.sin(this.time * 9) });
      g.zIndex = p.y + .15;
    }
    this.light.lights = this.light.lights.filter(l => !this.deviceLights.includes(l));
    this.deviceLights = [];
    const lamp = d?.light;
    if (lamp) {
      const c = Math.cos(p.aim), s = Math.sin(p.aim), spread = Math.tan(Math.min(1.2, lamp.arc / 2));
      for (const k of [.3, .6, .9]) {
        const at = { x: p.x + c * lamp.radius * k, y: p.y + s * lamp.radius * k }, regions = this.regionsAt(at);
        this.deviceLights.push({ x: at.x, y: at.y, r: Math.max(28, lamp.radius * k * spread * 1.15), color: 0xf3e9cf, k: .42,
          region: regions[0] ?? null, ...regions.length > 1 ? { regions } : {} });
      }
      this.light.lights.push(...this.deviceLights);
    }
    // The drawn sprite of a lit id and its texture key: a crate, a ground item or a corpse, only while it is drawn.
    const drawn = (id: string): { key: string; s: Sprite } | null => {
      const crate = this.crates.get(id); if (crate?.s.visible) return { key: `crate:${crate.look}`, s: crate.s };
      const item = this.loot.get(id), l = f.loot.find(x => x.uid === id); if (item?.visible && l) return { key: `loot:${l.item}`, s: item };
      const c = f.containers.find(x => x.id === id), g = c?.kind === 'corpse' && c.ownerUid ? this.actors.get(c.ownerUid) : undefined;
      return g?.corpse?.visible ? { key: g.corpseKey, s: g.corpse } : null;
    };
    let used = 0;
    for (const id of lamp?.lit ?? []) {
      const t = f.interaction?.ref.id === id ? null : drawn(id); // the interaction highlight already outlines its target
      if (!t || !this.tex.atlas.has(t.key)) continue;
      const rim = this.litRims[used] ??= this.xray.addChild(new Sprite());
      rim.texture = this.tex.ensure(`${t.key}|rim`, () => rimOf(this.tex.canvas(t.key)));
      rim.anchor.set(.5, (t.s.anchor.y * t.s.texture.height + 1) / (t.s.texture.height + 2)); rim.position.copyFrom(t.s.position);
      rim.visible = true; rim.tint = 0xf6e7b8; rim.alpha = still ? .55 : .5 + .12 * Math.sin(this.time * 4);
      used++;
    }
    for (let i = used; i < this.litRims.length; i++) this.litRims[i].visible = false;
  }

  /** Half the docked panel's height, world px: the camera centres the player that much higher. */
  private inset() { return this.panelInset * this.view.dpr / this.view.s / 2; }
  /** The camera's allowed top-left range. Mall floors end in hoarding or the drop at the map edge: no margin beyond it. */
  private camBounds(): CameraBounds {
    const b = this.map!.bounds, pad = this.map!.key.mapId === 'coast' || isMall(this.map!) ? 0 : 96, top = this.hudTop * this.view.dpr / this.view.s;
    return { x0: b.x - pad, x1: b.x + b.w + pad - this.view.w, y0: b.y - pad - (pad ? 40 : 0) - top, y1: b.y + b.h + pad - this.view.h };
  }
  /** A client point in world px from the canvas's top-left corner. */
  private canvasPoint(clientX: number, clientY: number): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * (this.view.W / Math.max(1, rect.width)) / this.view.s, y: (clientY - rect.top) * (this.view.H / Math.max(1, rect.height)) / this.view.s };
  }
  /** The mouse look-ahead a pointer asks for: its offset from the point the camera centres the player's chest on. */
  private pointerWant(client: Point, precise: boolean): Lead {
    const c = this.canvasPoint(client.x, client.y);
    return pointerLead(c.x - this.view.w / 2, c.y - (this.view.h / 2 - this.inset()), precise, this.leadScale);
  }
  private camera(f: ViewFrame, dt: number, follow = dt) {
    const p = f.player, k = 1 - Math.exp(-follow * 8), bd = this.camBounds();
    // The follow eases toward the player's chest; the look-ahead goes on top. With a mouse it comes from the pointer's
    // place on screen (pointerLead / stepLead: no feedback from the aim) and stops on the map edge (leadRoom); on touch it
    // eases toward the aim's lead.
    const mx = (p.x - this.view.w / 2 - this.camF.x) * k, my = (p.y - AIM_H - this.view.h / 2 + this.inset() - this.camF.y) * k;
    const fx = this.camF.x + mx, fy = this.camF.y + my;
    const old = this.camF.lead ?? { m: 0, ux: 1, uy: 0 }, ox = old.m * old.ux, oy = old.m * old.uy;
    let lead: Lead;
    if (this.pointer) {
      const want = this.pointerWant(this.pointer, p.state.precise);
      lead = stepLead(old, want, k, leadRoom(fx, fy, want.ux, want.uy, bd));
    } else {
      const a = aimLead(p.aim, p.state.precise), s = touchScopeLead(p.aim, this.leadScale, f.hud.aim.raise), t = { x: a.x + s.x, y: a.y + s.y };
      const lx = ox + (t.x - ox) * k, ly = oy + (t.y - oy) * k, m = Math.hypot(lx, ly);
      lead = m > 1e-9 ? { m, ux: lx / m, uy: ly / m } : { m: 0, ux: 1, uy: 0 };
    }
    const lx = lead.m * lead.ux, ly = lead.m * lead.uy;
    this.camF = { ...this.camF, x: fx, y: fy, lead };
    // Whole-pixel camera on the player's own rounding: a steady walk keeps the player still on screen (playtest F-04).
    const X = snapAxis(fx + lx, p.x, bd.x0, bd.x1, this.camF.hx, mx + lx - ox);
    const Y = snapAxis(fy + ly, p.y, bd.y0, bd.y1, this.camF.hy, my + ly - oy);
    this.camF.hx = { held: X.held, raw: X.raw }; this.camF.hy = { held: Y.held, raw: Y.raw };
    this.shake = Math.max(0, this.shake - dt * 30);
    const settle = Math.exp(-dt * 16); this.recoil.x *= settle; this.recoil.y *= settle;
    const sx = this.shake > .3 ? Math.round((this.rnd() - .5) * this.shake) : 0, sy = this.shake > .3 ? Math.round((this.rnd() - .5) * this.shake) : 0;
    this.cam = { x: X.at + Math.round(this.recoil.x) + sx, y: Y.at + Math.round(this.recoil.y) + sy };
  }

  private tintUpright(f: ViewFrame) {
    const rv = f.revealed;
    for (const o of this.occluders) {
      if (!o.sprite.renderable) continue;
      const p = o.tintAt ?? (o.kind === 'roof' ? { x: -9999, y: -9999 } : { x: o.rect.x + 16, y: o.z + 8 });
      o.sprite.tint = this.light.at(p, null, rv, o.spec?.face === 'int' || o.kind === 'ceiling');
      if (o.links) for (const l of o.links) if (!l.emit) l.sprite.tint = o.sprite.tint;
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
    this.tex.atlas.flush();
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
  worldToClient(p: Point, rect = this.app.canvas.getBoundingClientRect()): Point {
    return { x: rect.left + (p.x - this.cam.x) * this.view.s * rect.width / Math.max(1, this.view.W), y: rect.top + (p.y - this.cam.y) * this.view.s * rect.height / Math.max(1, this.view.H) };
  }
  /**
   * The aim of a pointer: from the player's chest to the world point under it. It reads through the smoothed camera
   * (follow plus the look-ahead this pointer is about to ask for), without the whole-pixel rounding, the recoil kick and
   * the shake, which are drawing only (a kick moved the aim up to 2.6 px; the rounding moves the drawn world under 1 px).
   * Easing the look-ahead's length then slides the camera along the pointer's line and leaves the aim as it is (PR #39);
   * the length stops where the camera meets the map edge (leadRoom, #80), so the clamp below never holds one axis of it.
   * Touch never aims through here.
   */
  aimFromClient(clientX: number, clientY: number): number | null {
    const p = this.last?.player; if (!p) return null;
    const at = this.canvasPoint(clientX, clientY), old = this.camF.lead ?? { m: 0, ux: 1, uy: 0 }, bd = this.camBounds();
    let next = old;
    if (this.pointer) {
      const want = this.pointerWant({ x: clientX, y: clientY }, p.state.precise);
      next = stepLead(old, want, 0, leadRoom(this.camF.x, this.camF.y, want.ux, want.uy, bd));
    }
    const clamp = (v: number, lo: number, hi: number) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    const cx = clamp(this.camF.x + next.m * next.ux, bd.x0, bd.x1), cy = clamp(this.camF.y + next.m * next.uy, bd.y0, bd.y1);
    return Math.atan2(at.y + cy + AIM_H - p.y, at.x + cx - p.x);
  }
  /**
   * The tip of an actor's drawn gun (chest plane, world px) and the direction it points: the weapon art's barrel tip put
   * through the weapon sprite's own transform, so the flash and the tracers leave the barrel the player sees.
   */
  private barrelTip(a: ActorView): Point {
    // A gunsmith picture carries its muzzle on the barrel row (#28 M2-10): no pixel scan, and the carbine's P0 muzzle
    // brake (half a pixel off its bore) still fires along the aim line.
    const art = this.weaponOf(a);
    if (art.tip) return art.tip;
    const key = `${a.weapon}:${a.kind}:${a.tactics?.archetype ?? ''}`;
    let tip = this.barrelTips.get(key);
    if (!tip) { tip = barrelTip(art.canvas); this.barrelTips.set(key, tip); }
    return tip;
  }
  /** The art of the weapon an actor holds: the player's configured gun from the gunsmith art when there is one. */
  private weaponOf(a: ActorView) { return this.tex.weapon(a.weapon, a.kind, a.tactics?.archetype, a.gun); }
  private muzzleOf(a: ActorView): { at: Point; angle: number } | null {
    const g = this.actors.get(a.uid); if (!g || !g.weapon.texture || a.weapon === 'claw') return null;
    const art = this.weaponOf(a), tip = this.barrelTip(a);
    const w = g.weapon, c = Math.cos(w.rotation), s = Math.sin(w.rotation);
    const lx = (tip.x - art.pivotX) * w.scale.x, ly = (tip.y - art.pivotY) * w.scale.y;
    return { at: { x: w.x + lx * c - ly * s, y: w.y + lx * s + ly * c }, angle: w.rotation };
  }
  private barrelTips = new Map<string, Point>();

  setMood(i: number) { this.opts.mood = i; if (this.map) this.light.setMood(i, this.map.bounds); }
  setViewTiles(n: 24 | 28) { this.opts.viewTiles = n; this.resize(); }
  moodName() { return MOODS[this.opts.mood % MOODS.length].name; }
  get fxCount() { return this.fx.count; }
  textureBytes() { return this.tex.atlas.stats.bytes + this.view.w * this.view.h * 8 + this.view.w * this.view.k * this.view.h * this.view.k * 4; }
  /** Name of the room the player is in; with overlapping rooms the one that counts for visibility (fail closed). */
  regionName(): string | null {
    const p = this.last?.player, m = this.map; if (!p || !m) return null;
    const id = regionAtClosed(m, this.last!.revealed, p);
    // Mall floors name the open-air place too (the entrance plaza, the terrace) when the player is in no room.
    const outside = !id && this.mall ? m.regions.find(r => !r.inside && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) : undefined;
    return m.regions.find(r => r.id === id)?.name ?? outside?.name ?? null;
  }
  get mapDef() { return this.map; }
  /** This floor is drawn by the mall builder. */
  get mallFloor() { return !!this.mall; }
  /** Stair labels to show now: text, world anchor (top centre) and whether the rules show it. */
  stairLabelViews(): { id: string; text: string; x: number; y: number; visible: boolean }[] {
    return (this.map?.entries ?? []).map(e => { const s = this.stairLabels.get(e.id); return { id: e.id, text: e.label, x: s?.x ?? e.at.x, y: s?.y ?? e.at.y, visible: !!s?.visible }; });
  }
  /** Current drawn enemy bodies in client pixels, clipped to the canvas. Hidden rooms and other floors provide no cue. */
  enemyBodyViews(): Rect[] {
    const canvas = this.app.canvas.getBoundingClientRect(), bodies: Rect[] = [];
    for (const a of this.last?.actors ?? []) {
      const body = this.actors.get(a.uid)?.body;
      if (!body?.visible || !body.renderable || body.alpha <= 0) continue;
      // Transform the actual frame's local bounds, including its anchor, pose scale, tilt and hit displacement.
      const b = body.getLocalBounds(), c = Math.cos(body.rotation), s = Math.sin(body.rotation);
      const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]].map(([x, y]) =>
        this.worldToClient({ x: body.x + x * body.scale.x * c - y * body.scale.y * s, y: body.y + x * body.scale.x * s + y * body.scale.y * c }, canvas));
      const left = Math.max(canvas.left, Math.min(...corners.map(p => p.x))), right = Math.min(canvas.right, Math.max(...corners.map(p => p.x)));
      const top = Math.max(canvas.top, Math.min(...corners.map(p => p.y))), bottom = Math.min(canvas.bottom, Math.max(...corners.map(p => p.y)));
      if (right > left && bottom > top) bodies.push({ x: left, y: top, w: right - left, h: bottom - top });
    }
    return bodies;
  }
  /** Region a point counts as for visibility: an unrevealed containing room first (the Runtime's rule). */
  regionAt(p: Point): string | null { return this.map ? regionAtClosed(this.map, this.last?.revealed ?? {}, p) : null; }
  /** Every inside region containing a point (rooms may overlap). */
  regionsAt(p: Point, m = this.map): string[] { return m ? m.regions.filter(r => r.inside && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h).map(r => r.id) : []; }
  /** Whether a world point may show transient detail now: every room containing it is revealed. */
  shownAt(p: Point, revealed: Readonly<Record<string, boolean>>): boolean { return !this.map || shownAt(this.map, revealed, p); }
  /** Test probe: particles and decals currently withheld because their region is not revealed. */
  get hiddenFx() { return this.fx.hidden; }
  actorShown(uid: string): boolean { const g = this.actors.get(uid); return !!g && (g.body.visible || !!g.corpse?.visible); }
  /** Playtest HUD note for where the player is: outside the dressed sample (the coast's corner, or a mall room not yet dressed). */
  sampleNote(): string | null {
    if (!this.opts.sampleMarks) return null;
    if (this.outsideSample()) return '样板外（通用占位画面）';
    const p = this.last?.player, m = this.map;
    if (!p || !m || !this.mall) return null;
    const id = regionAtClosed(m, this.last!.revealed, p);
    return id && !mallRegionDressed(m.key.layoutRevision, id) ? '样板外' : null;
  }
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
    this.releaseTargets();
    this.tex?.destroy();
    this.map = null; this.last = null;
    CoastView.live.delete(this);
  }
}

/** The faced-door glow: a door picture in white, kept for an east-west door to its leaf or doorway (between the jambs, below the wall top). */
function doorGlow(c: HTMLCanvasElement, wall: 'ew' | 'ns'): HTMLCanvasElement {
  const s = silhouette(c);
  if (wall === 'ew') { const g = s.getContext('2d')!; g.clearRect(0, 0, s.width, 32); g.clearRect(0, 0, 4, s.height); g.clearRect(28, 0, s.width - 28, s.height); }
  return s;
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
