/**
 * Coast sample host: one mount = one Pixi application + one CoastView + DOM HUD/panels + input, driving the real
 * coast Runtime. The host owns the single advance call per display frame; the view never advances logic and the
 * HUD never registers a second set of gameplay inputs.
 *
 * Panels follow the original split: pause (world frozen, checkpoint written by the Runtime) versus blocking
 * (inventory/loot/map/reading: world keeps running, gameplay input ignored). Every transition suppresses held
 * controls until they are released. Item and save operations go only through the Runtime services, or through
 * SaveSession.mutate for plain bag/safe edits (the original inventory entry point).
 */
import { Application, GlobalResourceRegistry } from 'pixi.js';
import * as D from '../domain';
import { SURVIVAL } from '../balance';
import { derivedLimits } from '../expansion-state';
import { exitBearing, questProgress } from '../qol';
import type { MutationResult, SaveSession, SessionState } from '../session';
import type { Interaction, PublishedView, RaidRuntime, StampedEvent, TargetRef } from '../raid-runtime/contract';
import type { LootTransfer } from '../loot';
import { CoastView, AIM_H, type ViewOptions } from './scene';
import { InputState } from './input';
import { InventoryPanel } from './inventory';
import { drawMap, mapPanelHtml, type MapLayout } from './map';
import { Scope, lifecycle } from './scope';
import { ITEM_ART_IDS, paintItem, type ItemArtId } from '../art/items';
import { audio } from '../app';
import { SampleSound } from './sound';

export interface CoastServices {
  cancelStart(): void;
  activate(ref: TargetRef): boolean;
  transferLoot(ref: TargetRef, request: LootTransfer): MutationResult;
  useSupply(id: string, from?: 'bag' | 'safe', uid?: string): MutationResult;
  equipItem(uid: string): MutationResult;
  dropItem(uid: string, from?: 'bag' | 'safe'): MutationResult;
  retrySave(): boolean;
  retrySettlement(): boolean;
  settlement(): { reason: 'extract' | 'death' | 'timeout' | 'abandon' | null; committed: boolean; retryable: boolean; result: unknown };
  abandon(): void;
  checkpoint(): boolean;
  lootContext(): { containerId: string; runId: string } | null;
  lootInventory(ref: TargetRef): D.Inventory | null;
}
export interface CoastHandle { runtime: RaidRuntime; services: CoastServices }
export type SampleExit = { kind: 'settled' };
type Panel = null | 'pause' | 'inventory' | 'loot' | 'map' | 'reading' | 'ending';

const REASONS: Record<string, string> = {
  'stale-target': '目标已失效，请重新靠近。', 'stale-or-blocked': '现在无法交互。', 'out-of-range': '离目标过远。',
  rejected: '操作未完成，请检查空间与条件。', blocked: '现在无法操作。', 'save-failed': '存档保存失败，状态已恢复到操作前。',
};
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const name = (id: string) => D.ITEMS[id]?.name ?? id;
type Outro = 'died' | 'extract' | 'timeout' | 'failed';
const OUTRO_TEXT: Record<Outro, string> = { died: '你倒下了', extract: '撤离成功', timeout: '行动超时', failed: '行动失败' };
const ease = (t: number) => t * t * (3 - 2 * t);
const weaponIcons = new Map<string, string>();
/** The game's own 32 px item drawing of the held weapon, shown at 2x in the weapon card. */
function weaponIcon(id: string): string {
  let url = weaponIcons.get(id);
  if (!url) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
    if ((ITEM_ART_IDS as readonly string[]).includes(id)) paintItem(g, id as ItemArtId, 32);
    url = c.toDataURL(); weaponIcons.set(id, url);
  }
  return url;
}

const HTML = `
<div class="cs-canvas" aria-label="行动画面"></div>
<div class="cs-hud" aria-live="polite">
  <div class="cs-vignette" aria-hidden="true"></div>
  <div class="cs-hurt" data-hurt aria-hidden="true"></div>
  <div class="cs-exitptr" data-exitptr hidden><i></i><span data-exitptr-text></span></div>
  <div class="cs-threats" data-threats aria-hidden="true"><i></i><i></i><i></i><i></i></div>
  <section class="cs-status">
    <div class="cs-meter"><span>生命</span><div class="cs-bar"><div data-hp></div></div><b data-hp-text></b></div>
    <div class="cs-meter"><span>体力</span><div class="cs-bar thin"><div data-st></div></div><b data-st-text></b></div>
    <div data-state class="cs-state"></div>
    <div data-where class="cs-where"></div>
  </section>
  <section class="cs-clock"><b data-time></b><small data-tide></small></section>
  <section class="cs-arms" data-weapon><img data-weapon-icon alt="" width="64" height="64"><div class="cs-arms-text"><span data-weapon-name></span><b data-mag></b><small data-reserve></small></div><div class="cs-heal"><kbd>Q</kbd>医疗 <b data-heals></b></div></section>
  <div data-radio class="cs-radio" hidden></div>
  <section class="cs-info">
    <button type="button" data-do="map" data-exit-nav>选择撤离点</button>
    <details data-quests><summary>任务 <span data-quest-count></span></summary><div data-quest-list></div><small>携带含带入物资 · 回站交付</small></details>
  </section>
  <div class="cs-keys" data-keys><kbd>E</kbd>交互 / 撤离　<kbd>Tab</kbd>背包　<kbd>Q</kbd>治疗　<kbd>R</kbd>换弹　<kbd>M</kbd>地图　<kbd>Esc</kbd>暂停</div>
  <div data-hits class="cs-hits"></div>
  <div data-prompt class="cs-prompt" hidden></div>
  <ul data-choices class="cs-choices" hidden aria-label="附近可搜刮的箱子和尸体"></ul>
  <div data-toast class="cs-toast" role="status"></div>
  <div data-cross class="cs-cross" hidden><i class="cs-ring"></i></div>
  <div data-hitpop class="cs-hitpop" aria-hidden="true"><b><i></i><i></i><i></i><i></i></b></div>
  <div data-fade class="cs-fade"></div>
  <div data-curtain class="cs-curtain" aria-live="assertive"><b data-curtain-text></b></div>
  <div class="cs-touch"><button type="button" data-bag>背包</button><button type="button" data-do="map">地图</button><button type="button" data-heal>治疗</button><button type="button" data-reload>换弹</button><button type="button" data-act>交互</button></div>
</div>
<section class="cs-panel" data-panel hidden role="dialog" aria-modal="true"></section>`;

/**
 * One Pixi Application per page, parked between mounts (OPUS-MEM-01). Every new renderer compiles its graphics and
 * back-buffer programs again, and Pixi 8 names each compile with a new counter suffix, so each source string is new
 * to its global id cache and kept for the page's life: about 5.4 KB per mount. Reusing the renderer compiles them once.
 * Parking leaves no scene: the view has destroyed its containers, render targets and textures; the stage is emptied,
 * the ticker stopped, the canvas detached and Pixi's global pools released. A parked context that was lost is destroyed
 * and replaced.
 */
let parked: Application | null = null, current: Application | null = null;
async function takeApp(): Promise<Application> {
  const app = parked; parked = null; lifecycle.parked = 0;
  if (app && !(app.renderer as { gl?: WebGL2RenderingContext }).gl?.isContextLost()) {
    app.renderer.resize(innerWidth, innerHeight); app.ticker.start();
    return current = app;
  }
  if (app) dropApp(app);
  const fresh = new Application();
  try {
    await fresh.init({ background: 0x121110, antialias: false, resolution: 1, autoDensity: false, preference: 'webgl', width: innerWidth, height: innerHeight, powerPreference: 'high-performance' });
  } catch (error) {
    // Before init resolves Application.destroy assumes a renderer that may not exist yet.
    if (fresh.renderer) dropApp(fresh);
    else fresh.stage.destroy({ children: true, context: true });
    throw error;
  }
  return current = fresh;
}
function parkApp(app: Application) {
  for (const c of app.stage.removeChildren()) c.destroy({ children: true, context: true });
  app.ticker.stop(); app.canvas.remove();
  // Pixi's global pools (BigPool batch objects, pooled render textures, canvases) are what releaseGlobalResources
  // cleared on destroy; they only hold returned objects, so emptying them with the renderer alive is safe.
  GlobalResourceRegistry.release();
  if (parked && parked !== app) dropApp(parked);
  parked = app; lifecycle.parked = 1;
}
function dropApp(app: Application) {
  app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
  if (current === app) current = null;
}
/**
 * GPU textures the page's renderer still manages, mounted or parked (read by the sample checks). Pixi nulls a released
 * slot and compacts the hash later, so only live entries are counted.
 */
export const gpuTextures = () => (current?.renderer.texture as { managedTextures?: unknown[] } | undefined)?.managedTextures?.filter(Boolean).length ?? 0;

export class CoastSampleHost {
  private scope = new Scope();
  private root!: HTMLElement;
  private app!: Application;
  view!: CoastView;
  readonly input = new InputState();
  panel: Panel = null;
  private inv!: InventoryPanel;
  private last: PublishedView | null = null;
  private lastSeq = 0;
  private toastLeft = 0;
  private radioLeft = 0;
  private lastRejected = '';
  private mounted = false;
  private closed = false;
  private contextLost = false;
  private exiting = false;
  private mapView = '';
  selectedExit = '';
  /** Label placement of the last map draw (read by the sample checks). */
  mapLayout: MapLayout = { labels: [], markers: [] };
  private reading: { title: string; text: string } | null = null;
  private noteTitles = new Set<string>();
  frameTimes: number[] = [];
  /** Bounded diagnostic log of consumed events (read by the ?test=1 checks; never drives behaviour). */
  readonly eventLog: { seq: number; type: string; durability: string; map: string; epoch: number; detail: Record<string, unknown> }[] = [];
  get lastBatch() { return this.last; }
  stats = { advanceMs: 0, presentMs: 0, frames: 0 };

  constructor(readonly handle: CoastHandle, private session: SessionState, private saves: SaveSession, readonly opts: ViewOptions,
    private onExit: (o: SampleExit) => void, private exportBackup: () => void) {
    this.sound = new SampleSound(audio);
  }

  get runtime() { return this.handle.runtime; }
  get services() { return this.handle.services; }

  async mount(parent: HTMLElement) {
    if (this.closed || this.root) throw new Error('Host can only mount once.');
    try {
      this.root = document.createElement('div'); this.root.className = 'coast-sample'; this.root.innerHTML = HTML;
      parent.appendChild(this.root);
      this.app = await takeApp();
      lifecycle.apps++;
      this.q('.cs-canvas').appendChild(this.app.canvas);
      this.view = new CoastView(this.app, this.opts);
      this.app.stage.addChild(this.view.screen);
      lifecycle.views++;
      // Every rebuild fades in from black, the first entry included.
      this.view.onRebuild = () => this.fade();
      this.input.touch = document.documentElement.classList.contains('mobile') || matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
      this.inv = new InventoryPanel(this.q('[data-panel]'), {
        session: this.session, saves: this.saves, services: this.services,
        lootRef: () => this.lootRef(), touch: () => this.input.touch, toast: (t, bad) => this.toast(t, bad),
        saveFailed: () => { if (!this.services.checkpoint()) this.lastRejected = 'checkpoint'; },
        close: () => this.closePanel(true),
        carryLimit: () => this.session.expansion?.version === 2 ? derivedLimits(this.session.expansion).carry : SURVIVAL.carryLimit,
        magazine: () => this.last?.frame.hud.weapon.mag ?? 0,
        used: () => this.sound.used(),
      });
      this.wire();
      const tick = () => this.frame();
      this.app.ticker.add(tick); lifecycle.tickers++;
      this.scope.add(() => { this.app.ticker.remove(tick); lifecycle.tickers--; });
      // Follow the original phone-layout decision (main.ts toggles html.mobile on resize).
      const ro = new ResizeObserver(() => { if (!this.contextLost) this.view.resize(); if (document.documentElement.classList.contains('mobile')) this.input.touch = true; });
      this.scope.observe(ro); ro.observe(this.root);
      this.mounted = true;
    } catch (error) { this.unmount(); throw error; }
  }

  // --- frame ---
  private frame() {
    if (!this.mounted) return;
    if (this.exiting) { this.outro(); return; }
    const t0 = performance.now();
    const playing = this.panel === null;
    const intent = this.input.read(playing, (x, y) => this.view.aimFromClient(x, y));
    if (intent.firePressed) this.sound.trigger(this.last?.frame.hud.weapon);
    const note = playing && intent.interactPressed && this.last?.frame.interaction?.kind === 'note' ? this.last.frame.interaction.ref.id : null;
    const batch = this.runtime.advance(t0, intent);
    const t1 = performance.now();
    if (batch.map !== this.last?.map) this.noteTitles = new Set(batch.map.notes.map(n => n.title));
    this.view.openContainer = this.panel === 'loot' ? this.services.lootContext()?.containerId ?? null : null;
    if (!this.contextLost) this.view.present(batch, this.app.ticker.deltaMS / 1000);
    const t2 = performance.now();
    this.last = batch;
    if (note) this.readingFor = note;
    this.hud(batch);
    this.syncPanels(batch);
    this.stats.advanceMs = t1 - t0; this.stats.presentMs = t2 - t1; this.stats.frames++;
    if (this.frameTimes.length < 4000) this.frameTimes.push(this.app.ticker.deltaMS);
  }
  /** Outro after the saved settlement: kind, seconds shown and total seconds before the result screen. */
  private ending: { kind: Outro; t: number; hold: number } | null = null;
  /**
   * After the settlement is saved: keep drawing the last frame without simulation, events or bullets (the player's fall,
   * camera, lamps and weather keep animating) while the curtain closes. Nothing here touches the Runtime.
   */
  private outro() {
    const last = this.last, o = this.ending; if (!last || !o) return;
    const dt = Math.min(.05, this.app.ticker.deltaMS / 1000);
    if (!this.contextLost) this.view.present({ ...last, events: [], frame: { ...last.frame, bullets: [] } }, dt);
    o.t += dt;
    const p = Math.min(1, o.t / o.hold), k = ease(p), canvas = this.app.canvas, curtain = this.q('[data-curtain]');
    if (o.kind === 'died') {
      canvas.style.filter = `grayscale(${(k * .85).toFixed(3)}) brightness(${(1 - k * .3).toFixed(3)})`;
      curtain.style.background = `radial-gradient(ellipse at 50% 46%, rgba(52,10,6,${(k * .35).toFixed(3)}) 30%, rgba(18,4,2,${(k * .88).toFixed(3)}) 100%)`;
    } else curtain.style.background = `rgba(10,9,8,${(o.kind === 'extract' ? ease(Math.max(0, p - .25) / .75) : k * .85).toFixed(3)})`;
    const text = this.q('[data-curtain-text]');
    text.style.opacity = String(Math.min(1, Math.max(0, (o.t - (o.kind === 'died' ? .45 : .15)) / .35)));
  }
  private readingFor: string | null = null;
  private weaponShown = '';
  // --- combat feedback (display only) ---
  /** Bullets the player fired that have not ended yet: their hits light the hit marker. */
  private playerBullets = new Set<string>();
  /** Targets the player hit recently (uid -> ms), so a death in the same burst shows the kill marker. */
  private recentHits = new Map<string, number>();
  private hurtPulse = 0;
  private kick = 0;
  private markT = 0;
  private markAt = { x: 0, y: 0 };
  /** Feedback for one new event. Hits are marked only where the hit point is in a revealed area (or outdoors). */
  private feedback(e: StampedEvent, b: PublishedView) {
    const f = b.frame, shown = (p: { x: number; y: number }) => { const r = this.view.regionAt(p); return r === null || f.revealed[r] === true; };
    if (e.type === 'shot' && e.shooter === 'player') {
      for (const p of e.pellets) this.playerBullets.add(p.bullet);
      if (this.playerBullets.size > 200) this.playerBullets = new Set([...this.playerBullets].slice(-100));
      this.kick = Math.min(1.4, this.kick + (e.weapon === 'shotgun' ? 1.2 : .8));
    } else if (e.type === 'impact') {
      const mine = this.playerBullets.delete(e.bullet), at = e.contact ?? e.lastFree;
      // Contact is on the ground plane; the marker sits on the chest plane where the bullet is drawn.
      if (mine && e.reason === 'hit-actor' && e.target && shown(at)) this.mark(e.target, { x: at.x, y: at.y - AIM_H }, false);
    } else if (e.type === 'melee' && e.attacker === 'player' && e.hit) {
      const a = f.actors.find(x => x.uid === e.hit); if (a && shown(a)) this.mark(a.uid, { x: a.x, y: a.y - AIM_H }, false);
    } else if (e.type === 'death' && e.uid !== 'player') {
      const at = this.recentHits.get(e.uid), a = f.actors.find(x => x.uid === e.uid);
      if (at !== undefined && performance.now() - at < 500 && a && shown(a)) this.mark(e.uid, { x: a.x, y: a.y - AIM_H }, true);
    } else if (e.type === 'hurt' && e.uid === 'player' && e.damage >= 1) this.hurtPulse = Math.min(1, this.hurtPulse + .45 + e.damage / 40);
    else if (e.type === 'shot' && e.shooter !== 'player') {
      // A shot from off screen by someone standing in the open or in a revealed room: mark the edge toward them.
      const a = f.actors.find(x => x.uid === e.shooter);
      if (a && shown(a)) {
        const p = this.view.worldToClient({ x: a.x, y: a.y - AIM_H });
        if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) {
          const slot = this.threats.find(t => t.uid === a.uid) ?? this.threats.reduce((o, t) => t.left < o.left ? t : o);
          Object.assign(slot, { uid: a.uid, x: a.x, y: a.y - AIM_H, left: .9 });
        }
      }
    }
  }
  /** Off-screen shooters (up to four), each fading over 0.9 s. */
  private threats = [0, 1, 2, 3].map(() => ({ uid: '', x: 0, y: 0, left: 0 }));
  private mark(uid: string, at: { x: number; y: number }, kill: boolean) {
    this.recentHits.set(uid, performance.now());
    if (this.recentHits.size > 40) this.recentHits.delete(this.recentHits.keys().next().value!);
    this.markT = kill ? .42 : .2; this.markAt = { ...at };
    const el = this.q('[data-hitpop]'); el.classList.toggle('kill', kill); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  /** The game's synth audio, driven from this host's batches (see sound.ts). */
  private readonly sound: SampleSound;
  /** setBlocked(true) was requested but no batch has shown it yet: a panel opened mid-frame must not be closed by that frame's stale phase. */
  private blockPending = 0;

  /** Mirror Runtime phase into panels; the Runtime decides, the host only shows. */
  private syncPanels(b: PublishedView) {
    const phase = b.frame.phase, loot = this.services.lootContext();
    if (phase === 'ending') { if (this.panel !== 'ending') this.showEnding(); else this.refreshEnding(); return; }
    if (phase === 'blocked' && loot && this.panel !== 'loot') { this.openLoot(); return; }
    if (phase === 'blocked' && !this.panel) {
      // Touch reading opens the Runtime's own blocking overlay; show its text, or release a stray block.
      if (this.reading) this.openReading(); else this.runtime.setBlocked(false);
      return;
    }
    // Allow a few frames for the requested block to be published before a running phase may close the panel.
    if (phase === 'running' && this.blockPending > 0) { this.blockPending--; return; }
    this.blockPending = 0;
    if (phase !== 'blocked' && (this.panel === 'loot' || this.panel === 'inventory' || this.panel === 'map' || this.panel === 'reading')) this.closePanel(false);
    if (phase === 'paused' && this.panel !== 'pause') this.showPause();
    if (this.panel === 'pause' && phase === 'running') this.closePanel(false);
    if (this.panel === 'map' && (this.stats.frames & 7) === 0) this.redrawMap();
  }

  // --- input wiring ---
  private wire() {
    const s = this.scope, canvas = this.app.canvas, panel = this.q('[data-panel]');
    s.on(window, 'keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      if (['tab', ' ', 'escape'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      if ((this.panel === 'inventory' || this.panel === 'loot') && this.inv.key(k)) return;
      if (k === 'escape') { if (this.blocking()) this.closePanel(true); else if (this.panel === 'pause') this.resume(); else if (!this.panel) this.pause(); return; }
      if (k === 'tab') { if (this.blocking()) this.closePanel(true); else if (!this.panel) this.openInventory(); return; }
      if (k === 'e' && (this.panel === 'loot' || this.panel === 'reading')) { this.closePanel(true); return; }
      if (k === 'm') { if (this.panel === 'map') this.closePanel(true); else if (!this.panel) this.openMap(); return; }
      if (this.panel) return;
      this.input.key(e.key, true);
    });
    s.on(window, 'keyup', e => this.input.key(e.key, false));
    s.on(canvas, 'contextmenu', e => e.preventDefault());
    s.on(canvas, 'pointermove', e => {
      if (e.pointerType === 'mouse') { this.input.pointer.x = e.clientX; this.input.pointer.y = e.clientY; this.input.pointer.inside = true; }
      else this.touchMove(e);
    });
    s.on(canvas, 'pointerdown', e => {
      if (e.pointerType === 'mouse') { this.input.pointer.x = e.clientX; this.input.pointer.y = e.clientY; if (!this.panel) this.input.mouse(e.button, true); }
      else { this.input.touch = true; this.touchStart(e); }
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or released pointer */ }
    });
    s.on(window, 'pointermove', e => { if (this.panel === 'inventory' || this.panel === 'loot') this.inv.pointerMove(e); });
    s.on(window, 'pointerup', e => {
      if ((this.panel === 'inventory' || this.panel === 'loot') && this.inv.pointerUp(e)) this.suppressClick = true;
      if (e.pointerType === 'mouse') this.input.mouse(e.button, false); else { this.input.release(e.pointerId); this.sticks.delete(e.pointerId); }
    });
    s.on(window, 'pointercancel', e => { if (e.pointerType === 'mouse') this.input.mouse(e.button, false); else { this.input.release(e.pointerId); this.sticks.delete(e.pointerId); } });
    s.on(canvas, 'pointerleave', e => { if (e.pointerType === 'mouse') this.input.pointer.inside = false; });
    s.on(canvas, 'wheel', e => { e.preventDefault(); this.cycleChoice(Math.sign(e.deltaY)); }, { passive: false });
    s.on(window, 'blur', () => this.pause('blur'));
    s.on(window, 'pagehide', () => this.pause('blur'));
    s.on(document, 'visibilitychange', () => { if (document.hidden) this.pause('blur'); });
    s.on(canvas, 'webglcontextlost', e => {
      e.preventDefault(); this.contextLost = true; this.pause('context-lost');
      if (this.panel === 'pause') this.showPause('context-lost');
    });
    s.on(canvas, 'webglcontextrestored', () => {
      this.view.resize(); this.contextLost = false;
      if (this.panel === 'pause') this.showPause();
      this.toast('画面已恢复，请继续行动。');
    });
    const act = this.q('[data-act]');
    s.on(act, 'pointerdown', e => { e.preventDefault(); this.input.touch = true; this.input.interact(e.pointerId); try { act.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
    s.on(act, 'pointerup', e => this.input.release(e.pointerId));
    s.on(act, 'pointercancel', e => this.input.release(e.pointerId));
    s.on(this.q('[data-reload]'), 'pointerdown', e => { e.preventDefault(); this.input.press('reload'); });
    s.on(this.q('[data-heal]'), 'pointerdown', e => { e.preventDefault(); this.input.press('heal'); });
    s.on(this.q('[data-bag]'), 'click', () => { if (!this.panel) this.openInventory(); else if (this.panel === 'inventory') this.closePanel(true); });
    s.on(this.q('[data-choices]'), 'click', e => { const id = (e.target as HTMLElement).closest('[data-id]')?.getAttribute('data-id'); if (id) this.input.select(id); });
    s.on(this.q('.cs-hud'), 'click', e => { if ((e.target as HTMLElement).closest('[data-do="map"]') && !this.panel) this.openMap(); });
    s.on(this.q('[data-quests]'), 'toggle', () => { this.questsOpen = (this.q<HTMLDetailsElement>('[data-quests]')).open; });
    // A drop that re-renders the grid removes the press target, so the browser may send no trailing click: every new press clears the suppression.
    s.on(panel, 'pointerdown', e => { this.suppressClick = false; if (this.panel === 'inventory' || this.panel === 'loot') this.inv.pointerDown(e); });
    s.on(panel, 'click', e => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      if ((this.panel === 'inventory' || this.panel === 'loot') && this.inv.onClick(e)) return;
      this.onPanelClick(e);
    });
    s.on(panel, 'change', e => { const t = e.target as HTMLSelectElement; if (t.matches('[data-exit]')) { this.selectedExit = t.value; this.redrawMap(); } });
    s.on(panel, 'input', e => {
      const t = e.target as HTMLInputElement; if (!t.matches('[data-volume]')) return;
      if (this.saves.setVolume(Number(t.value))) audio.setVolume(this.session.save.settings.volume);
      else { t.value = String(this.session.save.settings.volume); this.toast('音量设置未能保存。', true); }
      const label = panel.querySelector('[data-volume-label]'); if (label) label.textContent = `${Math.round(this.session.save.settings.volume * 100)}%`;
    });
  }
  private suppressClick = false;
  private questsOpen = false;

  private sticks = new Map<number, { kind: 'move' | 'aim'; ox: number; oy: number }>();
  private touchStart(e: PointerEvent) {
    if (this.panel) return;
    const kind = e.clientX < innerWidth / 2 ? 'move' : 'aim';
    if (this.input.beginStick(kind, e.pointerId)) this.sticks.set(e.pointerId, { kind, ox: e.clientX, oy: e.clientY });
  }
  private touchMove(e: PointerEvent) {
    const s = this.sticks.get(e.pointerId); if (!s) return;
    this.input.moveStick(s.kind, e.pointerId, (e.clientX - s.ox) / 56, (e.clientY - s.oy) / 56);
  }
  private cycleChoice(dir: number) {
    const t = this.last?.frame.interaction; if (!t || t.choices.length < 2 || this.panel) return;
    const i = t.choices.findIndex(c => c.selected), next = t.choices[(i + dir + t.choices.length) % t.choices.length];
    this.input.select(next.id);
  }

  // --- panels ---
  private q<T extends HTMLElement>(s: string) { return this.root.querySelector(s) as T; }
  private blocking() { return this.panel === 'inventory' || this.panel === 'loot' || this.panel === 'map' || this.panel === 'reading'; }
  private setPanel(kind: Panel, html: string, label: string) {
    this.panel = kind; const p = this.q('[data-panel]'); p.className = `cs-panel ${kind ?? ''}`; p.innerHTML = html; p.setAttribute('aria-label', label); p.hidden = !kind;
    p.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
  pause(reason: 'overlay' | 'blur' | 'context-lost' = 'overlay') {
    if (!this.mounted || this.panel === 'pause' || this.panel === 'ending') return;
    if (this.blocking()) this.closePanel(true);
    this.input.suppressHeld(); this.sticks.clear();
    this.runtime.pause(reason);
    this.showPause(reason);
  }
  private showPause(reason?: string) {
    if (this.contextLost) reason = 'context-lost';
    const conflict = this.session.conflict, saveError = !this.session.storageOK || this.lastRejected === 'checkpoint' || this.lastRejected === 'save-failed';
    const title = conflict ? '存档已被其他窗口更新' : saveError ? '存档保存失败' : reason === 'context-lost' ? '画面中断' : '已暂停';
    const text = conflict ? '本页已停止操作。请导出需要保留的进度，再刷新本页。'
      : saveError ? '最近的操作或检查点没有写入，世界已保持在保存前的状态。检查浏览器存储后重试，或先导出备份。'
      : reason === 'context-lost' ? '图形上下文丢失，行动已暂停。画面恢复后可继续，也可导出备份。' : '行动时间已停止。';
    const buttons = conflict ? `<button type="button" data-do="backup">导出备份</button>`
      : saveError ? `<button type="button" data-do="retry-save">重试保存</button><button type="button" data-do="backup">导出备份</button>`
      : `<button type="button" data-do="resume" ${this.contextLost ? 'disabled' : ''}>继续</button>${this.contextLost ? '<button type="button" data-do="backup">导出备份</button>' : ''}<button type="button" data-do="abandon">放弃行动</button>`;
    this.input.suppressHeld(); this.sticks.clear();
    // Same volume setting as the original pause overlay: one saved value for the whole game.
    const volume = conflict || saveError ? '' : `<label class="cs-volume">游戏音量 <span data-volume-label>${Math.round(this.session.save.settings.volume * 100)}%</span><input data-volume aria-label="游戏音量" type="range" min="0" max="1" step="0.05" value="${this.session.save.settings.volume}"></label>`;
    this.setPanel('pause', `<h2>${title}</h2><p>${text}</p>${volume}<div class="cs-row">${buttons}</div>`, title);
  }
  /** Resume only asks the Runtime; syncPanels closes the panel when the published phase is running again. */
  private resume() { if (this.contextLost) return; this.input.suppressHeld(); this.runtime.resume(); }
  private openBlocking(kind: 'inventory' | 'map' | 'reading') {
    this.input.suppressHeld(); this.sticks.clear();
    this.runtime.setBlocked(true); this.blockPending = 3;
    this.panel = kind;
  }
  private openInventory() {
    this.openBlocking('inventory');
    const p = this.q('[data-panel]'); p.className = 'cs-panel cs-inv-panel'; p.hidden = false; p.setAttribute('aria-label', '随身物资');
    this.inv.open('inventory');
  }
  private openLoot() {
    this.input.suppressHeld(); this.sticks.clear();
    this.panel = 'loot';
    const p = this.q('[data-panel]'); p.className = 'cs-panel cs-inv-panel'; p.hidden = false; p.setAttribute('aria-label', '搜刮物资');
    const ref = this.lootRef(); this.inv.containerLabel = this.last?.frame.containers.find(c => c.id === ref?.id)?.name ?? '物资箱';
    this.inv.open('loot');
  }
  private openMap() {
    if (!this.last) return;
    this.openBlocking('map');
    this.mapView = this.last.stamp.world.mapId;
    this.setPanel('map', mapPanelHtml(this.session, this.last, this.mapView, this.selectedExit, this.input.touch), '地图');
    this.redrawMap();
  }
  private redrawMap() {
    const c = this.q<HTMLCanvasElement>('[data-map]'); if (!c || !this.last) return;
    // Backing store follows the displayed size (aspect fixed at 960:694) so the map stays sharp on small and dense screens.
    const w = Math.max(320, Math.min(2400, Math.round((c.clientWidth || 960) * (devicePixelRatio || 1))));
    if (c.width !== w) { c.width = w; c.height = Math.round(w * 694 / 960); }
    this.mapLayout = drawMap(c, this.session, this.last, this.mapView, this.input.touch, this.selectedExit);
  }
  private openReading() {
    const r = this.reading; if (!r) return;
    if (this.last?.frame.phase !== 'blocked') { this.runtime.setBlocked(true); this.blockPending = 3; }
    this.input.suppressHeld(); this.sticks.clear();
    this.setPanel('reading', `<header class="cs-inv-head"><div><h2>${esc(r.title)}</h2><span class="cs-sub">世界仍在运行</span></div><button type="button" data-do="close">关闭（E / Esc）</button></header><p class="cs-reading">${esc(r.text)}</p>`, r.title);
  }
  /** Close a blocking panel; the Runtime clears its loot context in setBlocked(false). */
  private closePanel(byPlayer: boolean) {
    const was = this.panel; this.blockPending = 0;
    if (byPlayer && (was === 'inventory' || was === 'loot' || was === 'map' || was === 'reading')) this.runtime.setBlocked(false);
    if (was === 'inventory' || was === 'loot') this.inv.closeTransient();
    if (was === 'reading') this.reading = null;
    this.input.suppressHeld(); this.sticks.clear();
    this.setPanel(null, '', '');
  }
  private lootRef(): TargetRef | null {
    const c = this.services.lootContext(), map = this.last?.stamp.world.mapId; if (!c || !map) return null;
    return { runId: c.runId, mapId: map, kind: 'container', id: c.containerId };
  }
  private onPanelClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-do]'); if (!b) return;
    const d = b.dataset;
    switch (d.do) {
      case 'resume': this.resume(); break;
      case 'abandon': this.setPanel('pause', '<h2>放弃行动？</h2><p>放弃按撤离失败结算：背包物资和主武器丢失，安全箱保留。</p><div class="cs-row"><button type="button" data-do="abandon-yes">确认放弃</button><button type="button" data-do="resume">继续行动</button></div>', '放弃行动'); break;
      case 'abandon-yes': this.services.abandon(); break;
      case 'retry-save': if (this.services.retrySave()) { this.lastRejected = ''; this.toast('已保存。'); this.resume(); } else this.toast('仍然无法保存。', true); break;
      case 'backup': this.exportBackup(); break;
      case 'retry-settlement': this.services.retrySettlement(); this.refreshEnding(); break;
      case 'close': this.closePanel(true); break;
      case 'map-floor': this.mapView = d.id!; this.q('[data-panel]').querySelectorAll('[data-do="map-floor"]').forEach(n => n.toggleAttribute('aria-current', (n as HTMLElement).dataset.id === this.mapView)); this.redrawMap(); break;
    }
  }

  // --- ending ---
  private showEnding() {
    if (this.blocking()) this.inv.closeTransient();
    this.input.suppressHeld(); this.sticks.clear();
    this.setPanel('ending', '<h2>正在保存结算</h2><p data-ending-text></p><div class="cs-row" data-ending-row></div>', '结算');
    this.refreshEnding();
  }
  private refreshEnding() {
    const s = this.services.settlement(), text = this.q('[data-ending-text]'), row = this.q('[data-ending-row]');
    if (!text || !row) return;
    if (s.committed) {
      if (this.exiting) return;
      this.exiting = true;
      const outcome = (s.result as { outcome?: string } | null)?.outcome;
      this.sound.settled(outcome);
      text.textContent = '结算已保存。';
      row.innerHTML = '';
      // The settlement is already saved; what remains is presentation. A death plays the fall under a darkening
      // curtain before the original result screen takes over; extraction and other endings fade out.
      const died = this.last?.frame.player.alive === false;
      const kind = outcome === 'extract' ? 'extract' : died ? 'died' : outcome === 'timeout' ? 'timeout' : 'failed';
      const hold = this.opts.reducedMotion ? 400 : kind === 'died' ? 1700 : kind === 'extract' ? 1150 : 900;
      this.ending = { kind, t: 0, hold: hold / 1000 };
      this.q('[data-panel]').hidden = true;
      this.root.classList.add('outro'); this.root.dataset.outro = kind;
      this.q('[data-curtain-text]').textContent = OUTRO_TEXT[kind];
      this.scope.timeout(() => this.onExit({ kind: 'settled' }), hold);
      return;
    }
    text.textContent = s.retryable ? '结算还没有写入存档。结算记录已保留，可以重试或先导出备份。' : '等待结算保存';
    if (s.retryable && !row.childElementCount) row.innerHTML = '<button type="button" data-do="retry-settlement">重试保存</button><button type="button" data-do="backup">导出备份</button>';
  }

  // --- HUD ---
  private hud(b: PublishedView) {
    const f = b.frame, h = f.hud, q = <T extends HTMLElement>(s: string) => this.q<T>(s), dt = this.app.ticker.deltaMS / 1000;
    this.sound.frame(b, dt);
    q('[data-hp]').style.width = `${Math.max(0, h.hp / h.maxHp) * 100}%`; q('[data-hp-text]').textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
    q('[data-st]').style.width = `${Math.max(0, h.stamina / h.maxStamina) * 100}%`; q('[data-st-text]').textContent = `${Math.round(h.stamina)}`;
    const w = h.weapon;
    if (w.id !== this.weaponShown) { this.weaponShown = w.id; q<HTMLImageElement>('[data-weapon-icon]').src = weaponIcon(w.id); q('[data-weapon-name]').textContent = w.name; }
    q('[data-mag]').textContent = !w.magSize ? '近战' : w.reloading ? '换弹中' : `${w.mag} / ${w.magSize}`;
    q('[data-reserve]').textContent = w.magSize ? `备用 ${w.reserve}` : '';
    q('[data-weapon]').classList.toggle('empty', !!w.magSize && w.mag === 0 && !w.reloading);
    q('[data-weapon]').classList.toggle('reloading', w.reloading);
    q('[data-heals]').textContent = String(h.heals);
    q('.cs-status').classList.toggle('low', h.hp / h.maxHp < .35);
    if ((this.stats.frames & 7) === 0) this.slowHud(b);
    const region = this.view.regionName();
    q('[data-where]').textContent = `${b.map.name} · ${b.map.floor}${region ? ` · ${region}` : ''}${this.view.outsideSample() ? ' · 样板外（通用占位画面）' : ''}`;
    const t = Math.ceil(h.timeLeft);
    q('[data-time]').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    q('[data-tide]').textContent = h.tideWarning ? '潮汐预警' : h.highTide ? '高潮' : '';
    q('[data-hits]').innerHTML = h.hitDirections.filter(x => x.angle !== null).map(x => `<i style="transform:rotate(${x.angle!}rad);opacity:${Math.min(1, x.left)}"></i>`).join('');
    if ((this.stats.frames & 15) === 0) { const r = this.q('.cs-status').getBoundingClientRect(); this.view.hudTop = innerHeight < 480 ? r.bottom : 0; }
    if ((this.stats.frames & 3) === 0) { const docked = this.panel === 'loot' || this.panel === 'inventory'; this.view.panelInset = docked ? Math.max(0, innerHeight - this.q('[data-panel]').getBoundingClientRect().top) : 0; }
    this.prompt(this.panel ? null : f.interaction, f.player.y);
    const cross = q('[data-cross]'); cross.hidden = this.input.touch || !this.input.pointer.inside || !!this.panel;
    // Recoil kick on the reticle; a ring around it fills while reloading.
    cross.style.transform = `translate(${this.input.pointer.x}px, ${this.input.pointer.y}px) scale(${(1 + this.kick * .32).toFixed(3)})`;
    cross.classList.toggle('precise', f.player.state.precise);
    const reload = f.player.state.reloading;
    cross.classList.toggle('reloading', !!reload);
    if (reload) cross.style.setProperty('--reload', `${Math.round((1 - reload.left / Math.max(.01, reload.total)) * 360)}deg`);
    this.root.classList.toggle('touch', this.input.touch);
    let lootChanged = false;
    for (const e of b.events) if (e.seq > this.lastSeq) {
      this.lastSeq = e.seq; this.onEvent(e); this.sound.event(e, b.stamp.world.mapId); this.feedback(e, b);
      if (e.type === 'looted' || e.type === 'rejected') lootChanged = true;
      const { seq, type, durability, stamp, ...detail } = e;
      this.eventLog.push({ seq, type, durability, map: stamp.world.mapId, epoch: stamp.epoch, detail: detail as Record<string, unknown> });
      if (this.eventLog.length > 1000) this.eventLog.shift();
    }
    if (this.toastLeft > 0) { this.toastLeft -= dt; if (this.toastLeft <= 0) q('[data-toast]').classList.remove('on'); }
    if (this.radioLeft > 0) { this.radioLeft -= dt; if (this.radioLeft <= 0) q('[data-radio]').hidden = true; }
    if (this.panel === 'loot' && lootChanged) this.inv.render();
    this.feedbackFrame(b, dt);
  }
  /** Per-frame feedback: hurt edge (a pulse per blow, a slow throb at low health), hit marker, reticle kick, exit pointer. */
  private feedbackFrame(b: PublishedView, dt: number) {
    const f = b.frame, h = f.hud, low = Math.max(0, .35 - h.hp / h.maxHp) / .35;
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 1.6);
    this.kick = Math.max(0, this.kick - dt * 9);
    const throb = low > 0 && f.player.alive ? low * (.42 + .18 * Math.sin(performance.now() / 1000 * 5.2)) : 0;
    this.q('[data-hurt]').style.opacity = Math.max(this.hurtPulse * .9, throb).toFixed(3);
    const pop = this.q('[data-hitpop]');
    if (this.markT > 0) {
      this.markT -= dt;
      const p = this.view.worldToClient(this.markAt);
      pop.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      if (this.markT <= 0) pop.classList.remove('on');
    }
    this.exitPointer(b);
    const marks = this.q('[data-threats]').children;
    this.threats.forEach((t, i) => {
      const el = marks[i] as HTMLElement; t.left = Math.max(0, t.left - dt);
      if (t.left <= 0 || this.panel) { el.style.opacity = '0'; return; }
      const W = innerWidth, H = innerHeight, c = this.view.worldToClient({ x: f.player.x, y: f.player.y - AIM_H }), at = this.view.worldToClient(t);
      const dx = at.x - c.x, dy = at.y - c.y, k = Math.min(dx ? ((dx > 0 ? W - 34 : 34) - c.x) / dx : Infinity, dy ? ((dy > 0 ? H - 34 : 34) - c.y) / dy : Infinity);
      el.style.opacity = Math.min(1, t.left / .5).toFixed(2);
      el.style.transform = `translate(${Math.round(c.x + dx * k)}px, ${Math.round(c.y + dy * k)}px) rotate(${Math.atan2(dy, dx)}rad)`;
    });
  }
  private ptrInset: { l: number; r: number; t: number; b: number } | null = null;
  /**
   * The exit chosen on the map: a marker over it when it is on screen, otherwise an arrow on the screen edge pointing
   * at it with its straight-line distance in tiles. Exits are the Runtime's visible exits; nothing else is pointed at.
   */
  private exitPointer(b: PublishedView) {
    const el = this.q('[data-exitptr]'), exit = b.stamp.world.mapId === 'coast' && !this.panel ? b.map.exits.find(e => e.name === this.selectedExit) : undefined;
    if (!exit) { el.hidden = true; return; }
    const p = b.frame.player, at = this.view.worldToClient({ x: exit.at.x, y: exit.at.y - 30 }), W = innerWidth, H = innerHeight;
    const ground = this.view.worldToClient(exit.at), tiles = Math.hypot(exit.at.x - p.x, exit.at.y - p.y) / 32;
    this.q('[data-exitptr-text]').textContent = `${exit.name} · ${tiles < 1.5 ? '已到达' : `${tiles.toFixed(0)} 格`}`;
    // The pointer stays inside the band between the top and bottom HUD cards (measured every 16 frames).
    if ((this.stats.frames & 15) === 0 || !this.ptrInset) {
      const top = Math.max(...['.cs-status', '.cs-info', '.cs-clock'].map(c => this.q(c).getBoundingClientRect().bottom));
      const low = Math.min(...['.cs-arms', this.input.touch ? '.cs-touch' : '.cs-keys'].map(c => { const r = this.q(c).getBoundingClientRect(); return r.height ? r.top : H; }));
      // Room for the label: above the marker on screen (32 px), below the arrow on the edge (about 34 px).
      this.ptrInset = { l: 28, r: 28, t: Math.min(H / 2 - 40, top + 40), b: Math.min(H / 2 - 40, H - low + 44) };
    }
    const inset = this.ptrInset;
    // The exit's ring in view: a marker over it when the marker fits between the HUD cards, otherwise nothing (the ring
    // itself is showing). Out of view: an arrow on the edge of the band.
    const inView = ground.x > 16 && ground.x < W - 16 && ground.y > 16 && ground.y < H - 16;
    const onScreen = inView && at.x > inset.l && at.x < W - inset.r && at.y > inset.t && at.y < H - inset.b;
    el.hidden = inView && !onScreen;
    if (el.hidden) return;
    el.classList.toggle('edge', !onScreen);
    if (onScreen) { el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y + Math.sin(performance.now() / 260) * 3)}px)`; el.style.setProperty('--dir', '90deg'); el.style.setProperty('--lx', '-50%'); return; }
    // Clamp the ray from the screen centre to the inset rectangle.
    const cx = W / 2, cy = H / 2, dx = at.x - cx, dy = at.y - cy;
    const s = Math.min(dx ? ((dx > 0 ? W - inset.r : inset.l) - cx) / dx : Infinity, dy ? ((dy > 0 ? H - inset.b : inset.t) - cy) / dy : Infinity);
    const x = cx + dx * s, y = cy + dy * s;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.style.setProperty('--dir', `${Math.atan2(dy, dx)}rad`);
    // Keep the label on screen at the side edges.
    el.style.setProperty('--lx', x > W - 140 ? 'calc(-100% + 10px)' : x < 140 ? '-10px' : '-50%');
  }
  /** Lower-rate HUD: status, carried weight, exit bearing and quests (the original refreshes these every 0.1 s). */
  private slowHud(b: PublishedView) {
    const h = b.frame.hud, l = this.session.loadout, body = this.session.expansion?.body;
    const status = [h.bleeding ? '流血' : '', h.pollution > 10 ? `污染 ${Math.round(h.pollution)}%` : '',
      body && this.session.expansion?.raid ? `精神 ${Math.round(body.mental)} · 水分 ${Math.round(body.water)} · 饱食 ${Math.round(body.satiety)}` : ''].filter(Boolean).join(' · ') || '状态正常';
    let weight = '';
    if (l) { const w = D.WEAPONS[l.weapon || 'knife']; weight = `${(D.weight(l.bag) + D.weight(l.safe) + (l.weapon ? D.ITEMS[l.weapon].weight : 0) + D.ITEMS.knife.weight + (w.ammo ? D.ITEMS[w.ammo].weight * h.weapon.mag : 0)).toFixed(1)} kg`; }
    this.q('[data-state]').textContent = `${status}　${weight}`;
    // Short screens hide the routine body line; a bleed or pollution warning keeps it.
    this.q('[data-state]').classList.toggle('calm', !h.bleeding && h.pollution <= 10);
    const exit = b.map.exits.find(e => e.name === this.selectedExit);
    this.q('[data-exit-nav]').textContent = exit ? (() => { const bearing = exitBearing(b.frame.player, exit.at); return `${exit.name} · ${bearing.direction} · 直线 ${bearing.distance.toFixed(1)} 格`; })()
      : this.selectedExit ? `${this.selectedExit} · 返回地面查看方位` : '选择撤离点';
    const progress = questProgress(this.session.save, this.session.loadout);
    this.q('[data-quest-count]').textContent = `· ${progress.length} 项未完成`;
    const html = progress.map(qt => `<section><strong>${esc(qt.name)}</strong>${qt.needs.map(n => `<p>${esc(name(n.id))}：仓库 ${n.stored} · 携带 ${n.carried} / 需 ${n.needed}</p>`).join('')}</section>`).join('') || '<p>全部任务已交付。</p>';
    const list = this.q('[data-quest-list]'); if (list.innerHTML !== html) list.innerHTML = html;
  }
  private prompt(t: Interaction | null, py: number) {
    const el = this.q('[data-prompt]'), list = this.q('[data-choices]'), act = this.q('[data-act]');
    if (!t) { el.hidden = true; list.hidden = true; act.textContent = '交互'; return; }
    const hold = t.hold && t.hold.progress > 0 ? `　${Math.min(t.hold.progress, t.hold.required).toFixed(1)} / ${t.hold.required.toFixed(1)} 秒` : '';
    el.innerHTML = (this.input.touch ? '' : '<kbd>E</kbd>') + esc(t.kind === 'exit' ? `${t.label} · 站稳按住 3 秒撤离` : t.label) + hold;
    el.hidden = false;
    let p = this.view.worldToClient({ x: t.at.x, y: Math.min(t.at.y - AIM_H - 26, py - 56) }), above = true;
    const status = this.q('.cs-status').getBoundingClientRect(), h = el.offsetHeight || 24, half = Math.max(60, el.offsetWidth / 2);
    const hitsStatus = (x: number, top: number) => top < status.bottom + 4 && x - half < status.right + 4;
    if (p.y - h < 8 || hitsStatus(p.x, p.y - h)) { p = this.view.worldToClient({ x: t.at.x, y: Math.max(t.at.y, py) + 14 }); above = false; }
    let px = Math.min(innerWidth - half - 8, Math.max(half + 8, p.x));
    if (!above && hitsStatus(px, p.y)) px = Math.min(innerWidth - half - 8, status.right + half + 8);
    el.style.transform = `translate(${Math.round(px)}px, ${Math.round(p.y)}px) translate(-50%, ${above ? -100 : 0}%)`;
    act.textContent = t.kind === 'exit' ? '按住撤离' : t.kind === 'container' ? '搜刮' : t.kind === 'ground' ? '拾取' : t.kind === 'door' ? t.label : t.kind === 'entry' ? '进入' : t.kind === 'note' ? '阅读' : '交互';
    if (t.choices.length > 1) {
      list.hidden = false;
      list.innerHTML = t.choices.map(c => `<li data-id="${c.id}"${c.selected ? ' aria-current="true"' : ''}>${c.selected ? '▶ ' : ''}${esc(c.name)}${c.empty ? ' · 已搜空' : ''}</li>`).join('') + `<li class="cs-hint">${this.input.touch ? '点名称选择' : '滚轮切换'}</li>`;
      const side = this.view.worldToClient({ x: t.at.x + 26, y: t.at.y - AIM_H }), w = list.offsetWidth || 160;
      const lx = side.x + w + 8 > innerWidth ? this.view.worldToClient({ x: t.at.x - 26, y: 0 }).x - w : side.x;
      list.style.transform = `translate(${Math.round(Math.max(8, lx))}px, ${Math.round(side.y)}px) translate(0, -50%)`;
    } else list.hidden = true;
  }
  private onEvent(e: StampedEvent) {
    if (e.type === 'notice') {
      // A note's text arrives as "title：text" after the player reads it: show it in the reading panel.
      const title = this.readingFor && this.noteTitles.has(this.readingFor) && e.text.startsWith(`${this.readingFor}：`) ? this.readingFor : null;
      if (title) { this.reading = { title, text: e.text.slice(title.length + 1) }; this.readingFor = null; this.openReading(); return; }
      this.radio(e.text, e.seconds); this.sound.radio();
    }
    else if (e.type === 'rejected') { this.lastRejected = e.action === 'checkpoint' ? 'checkpoint' : e.reason === 'save-failed' ? 'save-failed' : e.action; if (e.action !== 'select-target') this.toast(REASONS[e.reason] ?? e.reason, true); }
    else if (e.type === 'looted' && e.durability === 'committed') this.toast(`获得 ${name(e.item)} ×${e.qty}${e.partial ? '（部分）' : ''}`);
  }
  /** Radio line: the original shows Runtime messages (say) in a timed radio box. */
  private radio(text: string, seconds: number) { const r = this.q('[data-radio]'); r.textContent = text; r.hidden = false; this.radioLeft = Math.max(3, seconds || 6); }
  toast(text: string, bad = false) { const t = this.q('[data-toast]'); if (!t) return; t.textContent = text; t.classList.add('on'); t.classList.toggle('bad', bad); this.toastLeft = 2.8; }
  private fade() { const f = this.q('[data-fade]'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

  /** Write a checkpoint now (beforeunload); the Runtime ignores it when locked or ending. */
  checkpoint() { return this.mounted && !this.exiting ? this.services.checkpoint() : false; }

  // --- unmount ---
  unmount() {
    if (this.closed) return;
    this.closed = true; this.mounted = false;
    this.inv?.closeTransient();
    this.scope.dispose();
    if (this.view) { this.view.destroy(); lifecycle.views--; }
    // The parked canvas is reused by the next mount: drop the outro's grading.
    if (this.app) { this.app.canvas.style.filter = ''; parkApp(this.app); lifecycle.apps--; }
    this.root?.remove();
    this.last = null;
  }
}
