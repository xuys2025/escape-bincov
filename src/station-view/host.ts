import type { Application } from 'pixi.js';
import * as D from '../domain';
import type { HideoutEvent, HideoutRuntime, HideoutSnapshot, RunWorld } from '../hideout-runtime/contract';
import { validPractice } from '../hideout-runtime/training';
import { Scope, lifecycle } from '../coast-view/scope';
import { DOORWAYS, ROOMS, SHED, SITTERS, STATIONS, T, TRAINING_ZONE, WALKERS, WALL_H, domainAt, floors, inRect, type Doorway, type PropDef, type RoomId, type Station, type StationId } from './layout';
import { HideoutScene, type ActorView, type SceneState } from './scene';
import type { Dir, Pose } from './art/people';
import { StationAudio, type AudioBus } from './audio';
import { SHORTCUTS, UI, type PanelKind } from './ui';
import type { StationArt } from './art/station';
import { Collision } from './nav';

const at = (x: number, y: number) => ({ x: x * T, y: y * T });
/** The compound with its roofs and the sea-wall road lamp: what the power-on sequence must show (F02). */
const POWER_SHOT = { x: 0.75 * T, y: -0.75 * T, w: 33.5 * T, h: 24 * T };
/** Walking speed (px/s) and the Shift multiplier: 112 × 1.45 stays under the Runtime's 168 px/s practice limit. */
const WALK = 112, SPRINT = 1.45;
interface StationNpc { id: StationId; look: string; home: { x: number; y: number }; dir: Dir; pose: Pose; when?: (s: HideoutSnapshot) => boolean }
const NPCS: StationNpc[] = [
  { id: 'med', look: 'xu', home: at(28.5, 12.74), dir: 's', pose: 'idle' },
  { id: 'arms', look: 'shuan', home: at(4, 16.74), dir: 'n', pose: 'work' },
  { id: 'radio', look: 'cai', home: at(30.5, 3.5), dir: 'n', pose: 'work' },
  { id: 'cook', look: 'cook', home: at(15.1, 3.5), dir: 'n', pose: 'work' },
  { id: 'blackmarket', look: 'trader', home: at(9.4, 25.72), dir: 'w', pose: 'idle', when: s => s.base.facilities.blackmarket >= 1 },
];
interface WalkerState { id: string; look: string; path: { x: number; y: number }[]; i: number; x: number; y: number; wait: number; dir: Dir; moving: boolean; speed: number; pause: number }

type Sequence =
  | { kind: 'power'; t: number }
  | { kind: 'leave'; t: number; runId: string }
  | { kind: 'away' }
  | { kind: 'return'; t: number; summary: D.RunSummary };

/** What the yard asks of the game around it; every save write still goes through the Runtime. */
export interface StationHooks {
  /** The departure animation finished: unmount and start the prepared raid. */
  departed(runId: string): void;
  /** Seed the Runtime should use for an empty seed field (village corner for the sample), or '' for the clock. */
  seedFor(world: RunWorld): string;
  tabs(): void;
  title(): void;
  exportSave(): void;
  imported(): void;
  charm(): string | null;
  /** Write the volume setting (the Runtime decides) and apply the saved value. */
  volume(v: number): void;
  /** Start the game's audio from a user gesture. */
  audioStart(): void;
  audioBus(): AudioBus | null;
}
export interface HostOptions {
  app: Application; shadow: ShadowRoot; mount: HTMLElement; rt: HideoutRuntime; sol: Map<string, HTMLCanvasElement>; art: StationArt;
  test: boolean; reduced: boolean; frozen: boolean; mood: string; touch: boolean; volume: number;
  arrival: { runId: string; summary: D.RunSummary } | null; world: RunWorld; seed: string; hooks: StationHooks;
}

/** Owns the yard while it is mounted: input, movement, NPC behaviour, interaction, camera and the gate / power sequences. */
export class StationHost {
  readonly scene: HideoutScene;
  readonly ui: UI;
  readonly audio: StationAudio;
  readonly col = new Collision();
  readonly rt: HideoutRuntime;
  player = { x: 27.5 * T, y: 19.4 * T, dir8: 6, walk: 0, moving: false };
  private scope = new Scope();
  private app: Application;
  private mount: HTMLElement;
  private hooks: StationHooks;
  private keys = new Set<string>();
  private path: { x: number; y: number }[] | null = null;
  private pathTarget: Station | null = null;
  private walkers: WalkerState[];
  private focus: Station | null = null;
  private seq: Sequence | null = null;
  private gateOpen = false;
  private curtain = 0;
  private greeted = new Map<string, number>();
  private colKey = '';
  private snap: HideoutSnapshot;
  private stepT = 0;
  private time = 0;
  private joy: { id: number; ox: number; oy: number; dx: number; dy: number } | null = null;
  private trainingFlash = 0;
  private hover: Station | null = null;
  private active = false;
  /** Training seconds sent since the last commit that look valid here (display interpolation only). */
  private pending = 0;
  private contextLost = false;
  private closed = false;
  frames = 0;

  constructor(private opts: HostOptions) {
    const { app, rt, mount, hooks } = opts;
    this.app = app; this.rt = rt; this.mount = mount; this.hooks = hooks;
    this.audio = new StationAudio(hooks.audioBus);
    this.scene = new HideoutScene(app, opts.sol, { reduced: opts.reduced, mood: opts.mood }, opts.art);
    lifecycle.views++;
    this.snap = rt.snapshot();
    this.scene.light.setPower(this.snap.power, false);
    this.walkers = WALKERS.map(w => { const path = w.path.map(([x, y]) => at(x, y)); return { id: w.id, look: w.look, path, i: 1, x: path[0].x, y: path[0].y, wait: 0, dir: 's' as Dir, moving: false, speed: w.speed, pause: w.pause }; });
    this.ui = new UI(mount, opts.shadow, rt, {
      panelChanged: () => { this.path = null; },
      deploy: (world, seed) => this.deploy(world, seed),
      volume: v => hooks.volume(v),
      sound: cue => this.audio.cue(cue),
      lineFor: id => this.line(id),
      tabs: () => this.leaveFor('tabs'),
      title: () => this.leaveFor('title'),
      exportSave: () => hooks.exportSave(),
      imported: () => hooks.imported(),
      charm: () => hooks.charm(),
      pendingSeconds: () => this.pending,
    }, this.scope, { world: opts.world, seed: opts.seed });
    this.ui.volume = opts.volume;
    this.ui.setTouch(opts.touch);
    const unsubscribe = rt.subscribe(e => this.event(e));
    this.scope.add(unsubscribe);
    this.bindInput();
    this.ui.updateHud(this.snap);
    if (opts.arrival) this.arrive(opts.arrival.summary);
    const tick = () => { try { this.frame(); } catch (e) { this.frameFailed(e); } };
    app.ticker.add(tick); lifecycle.tickers++;
    this.scope.add(() => { app.ticker.remove(tick); lifecycle.tickers--; });
  }

  private line(id: StationId): string {
    const restored = this.snap.power === 'restored';
    switch (id) {
      case 'arms': return restored ? '灯稳了，活也多了。缺什么，自己挑。' : '站里不白吃饭。缺什么，自己挑。';
      case 'med': return this.snap.profile.stats.runs ? '喝水多吗？夜里有没有听见什么不该有的声音？' : '伸手，翻过来。……行，进来吧。';
      case 'radio': return restored ? '电台通了。出门的人，五点前回来。' : '那灯是我开的。柴油只够再烧六天。';
      case 'cook': return '锅里还有粥。出门前垫一口。';
      case 'blackmarket': return this.snap.base.facilities.blackmarket ? '货单还没开。先看看你带了什么。' : '';
      default: return '';
    }
  }

  // ---------------- input ----------------
  private bindInput() {
    const canvas = this.app.canvas, s = this.scope, joyEl = () => this.ui.root.querySelector<HTMLElement>('.joy');
    const gesture = () => { this.hooks.audioStart(); this.audio.start(); };
    s.on(window, 'keydown', e => {
      gesture();
      const target = e.composedPath()[0] as HTMLElement | undefined;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') { if (e.key === 'Escape') (target as HTMLInputElement).blur(); return; }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (this.ui.dragging) return;
      if (this.seq && this.seq.kind !== 'away') { if (k === 'Escape' && this.seq.kind === 'power') this.seq.t = Math.max(this.seq.t, 5.4); e.preventDefault(); return; }
      if (k === 'Escape') { e.preventDefault(); if (this.ui.menuOpen) this.ui.setMenu(false); else if (this.ui.open) this.ui.close(); else this.ui.show('menu'); return; }
      if (this.ui.dialogKind) return;
      if (k === 'Tab') { e.preventDefault(); this.ui.quickOpen('gear'); return; }
      const shortcut = SHORTCUTS.find(q => q.key === k);
      if (shortcut) { e.preventDefault(); this.ui.quickOpen(shortcut.kind); return; }
      if (k === '0') { e.preventDefault(); this.leaveFor('tabs'); return; }
      if (k === 'j') { this.ui.quickOpen('radio'); return; }
      if (k === 'g') { this.ui.quickOpen('deploy'); return; }
      if (k === 'c') { this.ui.quickOpen('body'); return; }
      if (k === 'h' || k === 'F1') { e.preventDefault(); this.ui.quickOpen('help'); return; }
      if (k === '=' || k === '+') { this.scene.zoom(1); return; }
      if (k === '-' || k === '_') { this.scene.zoom(-1); return; }
      if (this.ui.open) return;
      if (k === 'e' || k === ' ' || k === 'Enter') { e.preventDefault(); this.interact(); return; }
      this.keys.add(k);
    });
    s.on(window, 'keyup', e => { this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
    s.on(window, 'blur', () => { this.keys.clear(); this.joy = null; });
    s.on(document, 'visibilitychange', () => { this.keys.clear(); this.joy = null; });
    s.on(canvas, 'contextmenu', e => e.preventDefault());
    s.on(canvas, 'wheel', e => { e.preventDefault(); this.scene.zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    s.on(canvas, 'pointerdown', e => {
      gesture();
      if (e.pointerType === 'touch') this.ui.setTouch(true);
      // A tap on the scene while the shortcut menu is open only folds the menu; the player does not walk.
      if (this.ui.menuOpen) { this.ui.setMenu(false); return; }
      if (this.seq || this.ui.dragging || this.ui.dialogKind) return;
      if (this.ui.open && !['menu', 'help'].includes(this.ui.kind!)) { this.ui.close(); return; }
      if (this.ui.open) return;
      const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
      if (e.pointerType === 'touch' && cx < r.width * .4 && cy > r.height * .45) {
        this.joy = { id: e.pointerId, ox: cx, oy: cy, dx: 0, dy: 0 };
        joyEl()?.style.setProperty('--x', `${cx}px`); joyEl()?.style.setProperty('--y', `${cy}px`); this.ui.root.classList.add('joying'); return;
      }
      const w = this.scene.toWorld(cx, cy);
      // Click on a station (its NPC, prop or tag area) walks there and opens it; otherwise walk to the point.
      const hit = this.stationAt(w);
      this.goto(hit ? hit.stand : w, hit);
    });
    s.on(canvas, 'pointermove', e => {
      if (e.pointerType === 'touch' || this.ui.open || this.seq) { this.hover = null; canvas.style.cursor = ''; return; }
      const r = canvas.getBoundingClientRect();
      this.hover = this.stationAt(this.scene.toWorld(e.clientX - r.left, e.clientY - r.top));
      canvas.style.cursor = this.hover ? 'pointer' : '';
    });
    s.on(canvas, 'pointerleave', () => { this.hover = null; canvas.style.cursor = ''; });
    s.on(window, 'pointermove', e => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      const r = canvas.getBoundingClientRect(); this.joy.dx = (e.clientX - r.left - this.joy.ox) / 50; this.joy.dy = (e.clientY - r.top - this.joy.oy) / 50;
      const m = Math.hypot(this.joy.dx, this.joy.dy); if (m > 1) { this.joy.dx /= m; this.joy.dy /= m; }
      joyEl()?.style.setProperty('--kx', `${this.joy.dx * 34}px`); joyEl()?.style.setProperty('--ky', `${this.joy.dy * 34}px`);
    });
    const endJoy = (e: PointerEvent) => { if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.ui.root.classList.remove('joying'); } };
    s.on(window, 'pointerup', endJoy); s.on(window, 'pointercancel', endJoy);
    s.on(this.ui.root.querySelector<HTMLElement>('.touch-act')!, 'click', () => { gesture(); if (!this.ui.open && !this.seq && !this.ui.menuOpen) this.interact(); });
    // Rotating or narrowing the window folds the shortcut menu: its layout belongs to the old screen shape. A height-only
    // change (a phone's address bar sliding away) leaves it open.
    let width = innerWidth;
    s.on(window, 'resize', () => { if (innerWidth !== width) { width = innerWidth; this.ui.setMenu(false); } if (!this.contextLost) this.scene.resize(); if (this.ui.open) this.ui.render(); });
    s.on(canvas, 'webglcontextlost', e => { e.preventDefault(); this.contextLost = true; this.keys.clear(); this.path = null; });
    s.on(canvas, 'webglcontextrestored', () => { this.contextLost = false; this.scene.resize(); this.ui.toast('画面已恢复。', 'info'); });
  }
  /** Station under a world point: near its anchor, or anywhere on the closed roof of its room ("go into that building"). */
  private stationAt(w: { x: number; y: number }): Station | null {
    const near = STATIONS.find(s => Math.hypot(s.anchor.x - w.x, s.anchor.y - 12 - w.y) < 26);
    if (near) return near;
    const pRoom = domainAt(this.player.x, this.player.y);
    const room = ROOMS.find(r => r.id !== pRoom && w.x >= r.x * T && w.x < (r.x + r.w) * T && w.y >= r.y * T - WALL_H && w.y < (r.y + r.h) * T - WALL_H);
    return room ? STATIONS.find(s => s.room === room.id) ?? null : null;
  }
  goto(target: { x: number; y: number }, station: Station | null) {
    const p = this.col.path(this.player, target);
    this.stall = { t: 0, retries: 0, goal: target };
    if (!p) { this.path = null; this.pathTarget = null; this.ui.toast('走不到那里。', 'error'); return false; }
    if (!p.length) { // already standing there
      this.path = null; this.pathTarget = null;
      if (station && !this.seq) { this.faceTo(station.anchor); this.open(station); }
      return true;
    }
    this.path = p; this.pathTarget = station; return true;
  }
  /** Time the walker has been stuck while following a route, and how often the route was planned again. */
  private stall = { t: 0, retries: 0, goal: { x: 0, y: 0 } };

  private interact() {
    const s = this.focus; if (!s) return;
    this.path = null;
    this.open(s);
  }
  open(s: Station) {
    const kind = s.panel === 'facility' ? 'facility' : s.panel as PanelKind;
    this.ui.show(kind, s, s.facility);
    if (s.who && this.line(s.id)) this.greeted.set(s.id, this.time);
  }

  // ---------------- runtime events ----------------
  /** Read-only reaction: no transaction is started from here (the Runtime would refuse a re-entrant one). */
  private event(e: HideoutEvent) {
    this.snap = this.rt.snapshot();
    if (e.type === 'committed') this.pending = 0;
    if (e.type === 'power-restored') { this.ui.close(); this.seq = { kind: 'power', t: 0 }; this.scene.light.setPower('restored', true); this.audio.cue('relay'); this.ui.setQuickVisible(false); }
    if (e.type === 'facility-built') this.colKey = '';
    if (e.type === 'production-complete') { this.ui.toast('工作台：一批成品可以领取了。', 'ok'); this.audio.cue('ok'); }
    if (e.type === 'practice-credited') { this.ui.toast(`练习收益 +${(e.amount * 100).toFixed(1)}% 成长`, 'ok'); this.audio.cue('credit'); this.trainingFlash = 1; }
    if (e.type === 'save-failed') { this.ui.toast('存档没有写入，操作已撤销。', 'error'); this.ui.showStorage(); }
    this.ui.updateHud(this.snap);
    if (e.type === 'committed' && this.ui.open) this.ui.refresh();
  }
  /** After an import the profile may differ entirely: lamps, collision and HUD follow the new snapshot. */
  resync() {
    this.snap = this.rt.snapshot(); this.pending = 0;
    this.scene.light.setPower(this.snap.power, false); this.colKey = '';
    this.ui.updateHud(this.snap); this.ui.refresh(true);
  }

  // ---------------- departure and return ----------------
  private deploy(world: RunWorld, seed: string) {
    if (this.seq) return;
    const r = this.rt.deploy({ world, seed: seed.trim() || this.hooks.seedFor(world) });
    if (!r.ok || !r.runId) { this.ui.toast(r.ok ? '出击没有准备好。' : r.message, 'error'); this.audio.cue('error'); if (!r.ok && (r.reason === 'storage' || r.reason === 'conflict')) this.ui.showStorage(); return; }
    // The run is saved now: the gate animation plays, then the raid starts from that checkpoint.
    this.ui.discard(); this.ui.setQuickVisible(false);
    this.seq = { kind: 'leave', t: 0, runId: r.runId }; this.gateOpen = true; this.colKey = ''; this.audio.cue('gate');
    this.path = [{ x: 27.5 * T, y: 20.3 * T }, { x: 27.5 * T, y: 23.2 * T }];
  }
  /** Walk in through the gate from a settled raid; the report opens once inside. */
  private arrive(summary: D.RunSummary) {
    this.player = { ...this.player, x: 27.5 * T, y: 23.3 * T, dir8: 6 };
    this.seq = { kind: 'return', t: 0, summary }; this.gateOpen = true; this.colKey = ''; this.curtain = 1;
    this.path = [{ x: 27.5 * T, y: 19.6 * T }];
    this.ui.setQuickVisible(false);
    this.scene.snapCamera();
  }
  /** Flush first; a failed write keeps the yard and shows the storage dialog (OPUS-WIRING 5). */
  private leaveFor(where: 'tabs' | 'title') {
    if (this.seq) return;
    if (this.ui.open && this.ui.kind && ['arms', 'med'].includes(this.ui.kind)) { this.ui.close(); if (this.ui.open) return; }
    if (where === 'tabs') this.hooks.tabs(); else this.hooks.title();
  }

  // ---------------- loop ----------------
  /** Frame errors kept for diagnosis (test hook and console); the loop itself never stops on one (F03). */
  errors: { at: number; message: string; stack?: string; count: number }[] = [];
  /** Test hook: throw inside the next N frames to prove the loop survives. */
  injectFrameErrors = 0;
  private frameFailed(e: unknown) {
    const message = e instanceof Error ? e.message : String(e), last = this.errors[this.errors.length - 1];
    if (last && last.message === message) last.count++;
    else { this.errors.push({ at: Math.round(performance.now()), message, stack: e instanceof Error ? e.stack : undefined, count: 1 }); console.error('[station] frame failed, skipped and continuing:', e); }
    if (this.errors.length > 20) this.errors.shift();
    // Drop transient movement state so a bad route cannot fail every frame.
    this.path = null; this.pathTarget = null;
  }
  frame(forceDt?: number) {
    if (this.closed) return;
    if (this.injectFrameErrors > 0) { this.injectFrameErrors--; throw new Error('injected frame error (test)'); }
    const dt = forceDt ?? Math.min(.05, this.app.ticker.deltaMS / 1000);
    this.time += dt; this.frames++;
    const now = Date.now();
    this.rt.tick(now);
    const s = this.snap = this.rt.snapshot();
    this.syncCollision(s);
    this.updateSequence(dt);
    if (this.closed) return;
    // Practice only counts while the player can actually walk: no panel, no sequence, page visible and focused.
    const active = !this.seq && !this.ui.open && !this.contextLost && !document.hidden && document.hasFocus();
    if (active !== this.active) { this.active = active; this.rt.setActivity(active); }
    const before = { x: this.player.x, y: this.player.y };
    if (!this.opts.frozen) this.movePlayer(dt);
    const after = { x: this.player.x, y: this.player.y }, moved = Math.hypot(after.x - before.x, after.y - before.y);
    if (active && moved >= .01) {
      const sample = { from: before, to: after, seconds: dt, now };
      this.rt.practice(sample);
      if (s.base.facilities.training && s.base.training.attribute && validPractice(sample)) this.pending = Math.min(120, this.pending + dt);
    }
    const inZone = inRect(this.player.x, this.player.y, TRAINING_ZONE);
    this.updateFocus();
    const door = this.nearSideDoor();
    const actors = this.updateActors(dt);
    const panelStation = this.ui.station, lookStation = this.ui.open && panelStation && !['menu', 'help', 'body'].includes(this.ui.kind!) ? panelStation : null;
    const pRoom = domainAt(this.player.x, this.player.y);
    let look = { x: this.player.x, y: this.player.y - 14 };
    let peek: RoomId | null = null;
    if (lookStation) { look = { x: lookStation.anchor.x, y: lookStation.anchor.y + 10 }; if (lookStation.room && lookStation.room !== pRoom) peek = lookStation.room; }
    if (this.seq?.kind === 'power') { const t = this.seq.t; look = t < 1.4 ? { x: 25.9 * T, y: 5 * T } : { x: 17 * T, y: 11 * T }; if (t < 1.4) peek = 'gen'; }
    const train = s.base.facilities.training > 0 && inZone && !this.ui.open;
    const state: SceneState = {
      player: { x: this.player.x, y: this.player.y, dir8: this.player.dir8, walkFrame: this.player.moving ? 1 + (Math.floor(this.player.walk) % 4) : 0 },
      actors, power: s.power, gateOpen: this.gateOpen, facilities: s.base.facilities, upgraded: s.profile.upgraded,
      focus: this.ui.open ? panelStation?.id ?? null : this.focus?.id ?? null, peekRoom: peek, look, panelInset: this.ui.inset,
      curtain: this.curtain, training: train ? { active: true, progress: Math.min(1, (s.base.training.activeSeconds + this.pending) / 120) } : null,
      workbench: { progress: s.base.queue[0] ? 1 - s.base.queue[0].remaining / s.base.queue[0].duration : null, ready: s.base.completed.length },
      doorHint: door ? { x: door.d.x, y: door.d.y, dir: door.dir } : null,
    };
    if (!this.contextLost) this.scene.render(dt, state);
    this.updateDom(actors, s);
    if (door) { const p = this.scene.toScreen(door.d.x * T + 16, door.d.y * T - 50); this.ui.setDoorTag(door.dir > 0 ? `${door.d.name.b} →` : `← ${door.d.name.a}`, p); } else this.ui.setDoorTag(null, null);
    this.audioFrame(dt, pRoom, moved);
    if (this.frames % 30 === 0) { this.ui.updateHud(s); if (this.ui.kind === 'facility' && !this.ui.dragging) this.ui.refresh(); }
    this.trainingFlash = Math.max(0, this.trainingFlash - dt);
  }

  private syncCollision(s: HideoutSnapshot) {
    const key = `${JSON.stringify(s.base.facilities)}|${s.power}|${s.profile.upgraded}|${this.gateOpen}`;
    if (key === this.colKey) return;
    this.colKey = key;
    const visible = (p: PropDef) => {
      let show = true;
      if (p.facility && p.facility.id !== 'blackmarket') show = p.facility.below ? s.base.facilities[p.facility.id] < p.facility.min : s.base.facilities[p.facility.id] >= p.facility.min;
      if (p.power) show = show && p.power === s.power;
      if (p.upgraded) show = show && s.profile.upgraded;
      return show;
    };
    this.col.rebuild(visible, this.gateOpen);
  }

  private movePlayer(dt: number) {
    let dx = 0, dy = 0;
    const blocked = this.ui.open || (this.seq && this.seq.kind !== 'leave' && this.seq.kind !== 'return');
    if (!blocked && !this.seq) {
      if (this.keys.has('a') || this.keys.has('ArrowLeft')) dx -= 1;
      if (this.keys.has('d') || this.keys.has('ArrowRight')) dx += 1;
      if (this.keys.has('w') || this.keys.has('ArrowUp')) dy -= 1;
      if (this.keys.has('s') || this.keys.has('ArrowDown')) dy += 1;
      if (this.joy && Math.hypot(this.joy.dx, this.joy.dy) > .2) { dx = this.joy.dx; dy = this.joy.dy; }
      if (dx || dy) this.path = null;
    }
    const sprint = this.keys.has('Shift') ? SPRINT : 1, speed = (this.seq ? 92 : WALK) * sprint;
    if (!dx && !dy && this.path && (!this.ui.open || this.seq)) {
      const wp = this.path[0], vx = wp.x - this.player.x, vy = wp.y - this.player.y, d = Math.hypot(vx, vy);
      if (d < 3) { this.path.shift(); if (!this.path.length) { this.path = null; const t = this.pathTarget; this.pathTarget = null; if (t && !this.seq) { this.faceTo(t.anchor); this.open(t); } } }
      else { dx = vx / d; dy = vy / d; }
    }
    const m = Math.hypot(dx, dy);
    if (m > .01) {
      const k = Math.min(1, m);
      const before = { x: this.player.x, y: this.player.y };
      if (this.seq) { this.player.x += dx / m * speed * k * dt; this.player.y += dy / m * speed * k * dt; }
      else this.col.slide(this.player, dx / m * speed * k * dt, dy / m * speed * k * dt);
      const real = Math.hypot(this.player.x - before.x, this.player.y - before.y);
      this.player.moving = real > .05;
      if (this.player.moving) { this.player.dir8 = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8; this.player.walk += dt * 9 * sprint; }
      if (this.path && !this.seq) {
        // Following a route but not getting anywhere: plan again from here (twice), then stop and say so.
        this.stall.t = real < .3 * speed * dt ? this.stall.t + dt : 0;
        if (this.stall.t > .2) {
          this.stall.t = 0;
          const target = this.pathTarget, again = this.stall.retries < 2 ? this.col.path(this.player, this.stall.goal) : null;
          this.stall.retries++;
          if (again && again.length) this.path = again;
          else if (again && !again.length) { this.path = null; this.pathTarget = null; if (target) { this.faceTo(target.anchor); this.open(target); } }
          else { this.path = null; this.pathTarget = null; this.player.moving = false; this.ui.toast('这里过不去，换个方向试试。', 'error'); }
        }
      }
    } else { this.player.moving = false; this.player.walk = 0; }
  }
  private faceTo(p: { x: number; y: number }) { this.player.dir8 = ((Math.round(Math.atan2(p.y - this.player.y, p.x - this.player.x) / (Math.PI / 4)) % 8) + 8) % 8; }

  private updateFocus() {
    if (this.seq) { this.focus = null; return; }
    const pRoom = domainAt(this.player.x, this.player.y);
    let best: Station | null = null, bd = 1e9;
    for (const s of STATIONS) {
      const d = Math.hypot(s.stand.x - this.player.x, s.stand.y - this.player.y);
      const sameSpace = s.room === pRoom || (!s.room && !pRoom) || (s.id === 'arms' && !pRoom);
      if (d < s.radius && sameSpace && d < bd) { best = s; bd = d; }
    }
    this.focus = best;
  }

  private updateActors(dt: number): ActorView[] {
    const out: ActorView[] = [], t = this.time, s = this.snap;
    for (const n of NPCS) {
      if (n.when && !n.when(s)) continue;
      const st = STATIONS.find(q => q.id === n.id)!;
      const near = Math.hypot(this.player.x - n.home.x, this.player.y - n.home.y) < 86 && domainAt(this.player.x, this.player.y) === st.room;
      const talking = this.ui.open && this.ui.station?.id === n.id;
      let dir = n.dir, pose: Pose = n.pose;
      if (near || talking) { const dx = this.player.x - n.home.x, dy = this.player.y - n.home.y; dir = Math.abs(dx) > Math.abs(dy) * 1.4 ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n'; pose = talking ? 'talk' : 'idle'; }
      out.push({ id: n.id, look: n.look, x: n.home.x, y: n.home.y, dir, pose, frame: Math.floor(t * (pose === 'talk' ? 1.6 : 2.2) + n.home.x) });
      if (near && !this.ui.open) {
        const last = this.greeted.get(n.id) ?? -99, text = this.line(n.id);
        if (text && t - last > 30) { this.greeted.set(n.id, t); const p = this.bubbleAt(st); this.ui.bubble(n.id, text, p); this.audio.cue('pick'); }
      }
    }
    for (const w of this.walkers) {
      if (!this.opts.frozen) {
        if (w.wait > 0) { w.wait -= dt; w.moving = false; }
        else {
          const tgt = w.path[w.i], dx = tgt.x - w.x, dy = tgt.y - w.y, d = Math.hypot(dx, dy);
          const blockedByPlayer = Math.hypot(this.player.x - (w.x + dx / Math.max(1, d) * 12), this.player.y - (w.y + dy / Math.max(1, d) * 12)) < 14;
          if (blockedByPlayer) w.moving = false;
          else if (d < 2) { w.i = (w.i + 1) % w.path.length; if (w.i === 0 || w.i === Math.floor(w.path.length / 2)) w.wait = w.pause; }
          else { const step = Math.min(d, w.speed * dt); w.x += dx / d * step; w.y += dy / d * step; w.moving = true; w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n'; }
        }
      }
      out.push({ id: w.id, look: w.look, x: w.x, y: w.y, dir: w.dir, pose: w.moving ? 'walk' : 'idle', frame: Math.floor(t * (w.moving ? 7 : 2)) });
    }
    for (const p of SITTERS) {
      if (p.id === 'boatman' && s.base.facilities.blackmarket >= 1) continue;
      out.push({ id: p.id, look: p.look, x: p.x, y: p.y, dir: p.dir, pose: p.pose, frame: Math.floor(t * (p.pose === 'smoke' ? .5 : 1.4) + p.x) });
    }
    return out;
  }

  private updateSequence(dt: number) {
    const q = this.seq; if (!q) return;
    if (q.kind === 'power') {
      // After the generator room, frame the whole compound so every lamp coming on is in view on any screen (F02).
      this.scene.setFit(q.t >= 1.4 && q.t <= 5.6 ? POWER_SHOT : null);
      q.t += dt;
      const lights = Math.floor((q.t - 1) * 6); if (q.t > 1 && q.t < 3.5 && lights !== Math.floor((q.t - 1 - dt) * 6)) this.audio.cue('lampOn');
      if (q.t > 5.6) { this.seq = null; this.scene.setFit(null); this.ui.setQuickVisible(true); this.ui.toast(D.QUESTS.repair.radio, 'ok'); this.audio.cue('deliver'); }
    } else if (q.kind === 'leave') {
      q.t += dt;
      if (q.t > 1.6) this.curtain = Math.min(1, this.curtain + dt * 1.6);
      if (q.t > 2.6) { const runId = q.runId; this.seq = { kind: 'away' }; this.path = null; this.hooks.departed(runId); }
    } else if (q.kind === 'away') {
      this.curtain = 1;
    } else if (q.kind === 'return') {
      q.t += dt; this.curtain = Math.max(0, 1 - q.t * 1.2);
      if (!this.path && q.t > 1) { this.gateOpen = false; this.colKey = ''; this.audio.cue('gate'); const summary = q.summary; this.seq = null; this.ui.summary = summary; this.ui.setQuickVisible(true); this.ui.show('report'); }
    }
  }

  private updateDom(actors: ActorView[], s: HideoutSnapshot) {
    const pRoom = domainAt(this.player.x, this.player.y);
    const hidden = new Set<RoomId>(pRoom ? [pRoom] : []);
    this.ui.updateTags(st => {
      const p = this.scene.toScreen(st.anchor.x, st.anchor.y - (st.who ? 48 : 40));
      return { x: p.x, y: p.y, visible: p.x > -40 && p.y > -10 && p.x < innerWidth + 40 && p.y < innerHeight + 40 && (st.room === null || st.room === pRoom || !hidden.has(st.room)) };
    }, this.hover?.id ?? this.focus?.id ?? null, this.ui.open || !!this.seq);
    for (const a of actors) {
      const st = STATIONS.find(q => q.id === a.id); if (!st) continue;
      this.ui.moveBubble(a.id, this.ui.open || this.seq ? null : this.bubbleAt(st));
    }
    if (this.focus && !this.ui.open && !this.seq) {
      const f = this.focus, fac = f.facility ? s.base.facilities[f.facility] : 0;
      const verb = f.who ? `和${f.who}说话` : f.panel === 'facility' ? `查看${f.name}${fac ? ` · ${fac} 级` : ' · 未修建'}` : f.panel === 'board' ? '看寻人板' : `打开${f.name}`;
      this.ui.setPrompt(`<kbd>${this.ui.touch ? '交互' : 'E'}</kbd> ${verb}${f.who ? ` <small>${f.name}</small>` : ''}`);
    } else if (!this.ui.open && !this.seq && s.base.facilities.training > 0 && inRect(this.player.x, this.player.y, TRAINING_ZONE)) {
      const seconds = Math.min(120, s.base.training.activeSeconds + this.pending);
      this.ui.setPrompt(s.base.training.attribute ? `训练区 · 走动练习 <small>${Math.floor(seconds)} / 120 秒</small>` : '训练区 · <small>先在设施面板选一个练习项目</small>');
    } else this.ui.setPrompt(null);
  }

  private audioFrame(dt: number, room: RoomId | null, moved: number) {
    const p = this.player, under = room !== null || (p.x > SHED.x * T && p.x < (SHED.x + SHED.w) * T && p.y > SHED.y * T && p.y < (SHED.y + SHED.h) * T);
    const seq = this.seq?.kind === 'power' ? this.seq.t : 9;
    this.audio.ambience({
      indoor: under, gen: Math.hypot(p.x - 25.9 * T, p.y - 3.4 * T), radio: Math.hypot(p.x - 30.5 * T, p.y - 3 * T), sea: Math.max(0, 24 * T - p.y),
      fire: Math.hypot(p.x - 21.5 * T, p.y - 18.5 * T), running: this.snap.power === 'restored', starting: Math.max(0, Math.min(1, (seq - .3) / 1.5)),
    });
    if (moved > .2) {
      this.stepT += dt;
      if (this.stepT > .3 / (this.keys.has('Shift') ? SPRINT : 1)) { this.stepT = 0; const f = floors[Math.floor(p.y / T)]?.[Math.floor(p.x / T)]; this.audio.cue(!room && (f === 'yard' || f === 'road' || f === 'dock') ? 'stepWet' : 'step'); }
    }
  }

  /** Side door within three tiles of the player, on the side the player is on (F01): sign and floor chevrons. */
  private nearSideDoor(): { d: Doorway; dir: 1 | -1 } | null {
    if (this.ui.open || this.seq) return null;
    const pRoom = domainAt(this.player.x, this.player.y);
    let best: { d: Doorway; dir: 1 | -1 } | null = null, bd = 3 * T;
    for (const d of DOORWAYS) {
      if (!d.side || (pRoom !== d.a && pRoom !== d.b)) continue;
      const dist = Math.hypot(this.player.x - (d.x * T + 16), this.player.y - (d.y * T + 16));
      // Standing in the doorway itself counts as the side the player came from.
      const west = this.player.x < d.x * T + 16;
      if (dist < bd) { bd = dist; best = { d, dir: west ? 1 : -1 }; }
    }
    return best;
  }
  /** Speech sits just above the station's name tag. */
  private bubbleAt(st: Station) { const p = this.scene.toScreen(st.anchor.x, st.anchor.y - 48); return { x: p.x, y: p.y - 40 }; }
  /** Test helper: teleport the player and settle the camera. */
  place(x: number, y: number, dir8 = 6) { this.player = { ...this.player, x: x * T, y: y * T, dir8 }; this.path = null; this.scene.snapCamera(); }
  get busy() { return !!this.seq; }
  get debug() { return { player: { ...this.player }, focus: this.focus?.id ?? null, panel: this.ui.kind, dialog: this.ui.dialogKind, seq: this.seq?.kind ?? null, active: this.active, pending: this.pending, col: this.col, errors: this.errors }; }

  /** Release listeners, the ticker callback, the scene's GPU resources and the audio loops (the caller parks the app). */
  destroy() {
    if (this.closed) return;
    this.closed = true;
    if (this.active) { this.active = false; this.rt.setActivity(false); }
    this.scope.dispose();
    this.audio.stop();
    this.scene.destroy(); lifecycle.views--;
    this.ui.root.remove();
  }
}
