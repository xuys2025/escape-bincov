/**
 * Coast sample host: one mount = one Pixi application + one CoastView + DOM HUD/panels + input, driving the real
 * coast Runtime. The host owns the single advance call per display frame; the view never advances logic and the
 * HUD never registers a second set of gameplay inputs.
 *
 * Panels follow the original split: pause (world frozen, checkpoint written by the Runtime) versus blocking
 * (inventory/loot: world keeps running, gameplay input ignored). Every transition suppresses held controls until
 * they are released. Transactions go only through the Runtime services, which already wrap SaveSession.
 */
import { Application } from 'pixi.js';
import * as D from '../domain';
import type { SessionState } from '../session';
import type { Interaction, PublishedView, RaidRuntime, StampedEvent, TargetRef } from '../raid-runtime/contract';
import type { LootTransfer } from '../loot';
import type { MutationResult } from '../session';
import { CoastView, AIM_H, type ViewOptions } from './scene';
import { InputState } from './input';
import { Scope, lifecycle } from './scope';

export interface CoastServices {
  activate(ref: TargetRef): boolean;
  transferLoot(ref: TargetRef, request: LootTransfer): MutationResult;
  useSupply(id: string, from?: 'bag' | 'safe', uid?: string): MutationResult;
  equipItem(uid: string): MutationResult;
  dropItem(uid: string, from?: 'bag' | 'safe'): MutationResult;
  retrySave(): boolean;
  retrySettlement(): boolean;
  settlement(): { committed: boolean; retryable: boolean; result: unknown };
  abandon(): void;
  checkpoint(): boolean;
  lootContext(): { containerId: string; runId: string } | null;
  lootInventory(ref: TargetRef): D.Inventory | null;
}
export interface CoastHandle { runtime: RaidRuntime; services: CoastServices }
export type SampleExit = { kind: 'settled' };

const SUPPLIES = new Set(['bandage', 'medkit', 'antidote', 'water', 'food', 'analgesic', 'focus', 'strengthDose', 'constitutionDose', 'techniqueDose', 'luckySachet', 'unluckySachet']);
const REASONS: Record<string, string> = {
  'stale-target': '目标已失效，请重新靠近。', 'stale-or-blocked': '现在无法交互。', 'out-of-range': '离目标过远。',
  rejected: '操作未完成，请检查空间与条件。', blocked: '现在无法操作。', 'save-failed': '存档保存失败，状态已恢复到操作前。',
};
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const name = (id: string) => D.ITEMS[id]?.name ?? id;

const HTML = `
<div class="cs-canvas" aria-label="行动画面"></div>
<div class="cs-hud" aria-live="polite">
  <section class="cs-status">
    <div class="cs-meter"><span>生命</span><div class="cs-bar"><div data-hp></div></div><b data-hp-text></b></div>
    <div class="cs-meter"><span>体力</span><div class="cs-bar thin"><div data-st></div></div></div>
    <div data-weapon class="cs-weapon"></div>
    <div data-where class="cs-where"></div>
  </section>
  <section class="cs-clock"><b data-time></b><small data-tide></small></section>
  <div data-hits class="cs-hits"></div>
  <div data-prompt class="cs-prompt" hidden></div>
  <ul data-choices class="cs-choices" hidden aria-label="附近可搜刮的箱子和尸体"></ul>
  <div data-toast class="cs-toast" role="status"></div>
  <div data-cross class="cs-cross" hidden></div>
  <div data-fade class="cs-fade"></div>
  <div class="cs-touch"><button type="button" data-bag>背包</button><button type="button" data-heal>治疗</button><button type="button" data-reload>换弹</button><button type="button" data-act>交互</button></div>
</div>
<section class="cs-panel" data-panel hidden role="dialog" aria-modal="true"></section>`;

export class CoastSampleHost {
  private scope = new Scope();
  private root!: HTMLElement;
  private app!: Application;
  view!: CoastView;
  readonly input = new InputState();
  /** null: playing. 'pause' freezes the world; 'inventory'/'loot' block input while the world keeps running. */
  panel: null | 'pause' | 'inventory' | 'loot' | 'ending' = null;
  private last: PublishedView | null = null;
  private lastSeq = 0;
  private toastLeft = 0;
  private lastRejected = '';
  private mounted = false;
  private exiting = false;
  frameTimes: number[] = [];
  /** Bounded diagnostic log of consumed events (read by the ?test=1 checks; never drives behaviour). */
  readonly eventLog: { seq: number; type: string; durability: string; map: string; epoch: number; detail: Record<string, unknown> }[] = [];
  get lastBatch() { return this.last; }
  stats = { advanceMs: 0, presentMs: 0, frames: 0 };

  constructor(readonly handle: CoastHandle, private session: SessionState, readonly opts: ViewOptions,
    private onExit: (o: SampleExit) => void, private exportBackup: () => void) {}

  get runtime() { return this.handle.runtime; }
  get services() { return this.handle.services; }

  async mount(parent: HTMLElement) {
    this.root = document.createElement('div'); this.root.className = 'coast-sample'; this.root.innerHTML = HTML;
    parent.appendChild(this.root);
    this.app = new Application();
    await this.app.init({ background: 0x121110, antialias: false, resolution: 1, autoDensity: false, preference: 'webgl', width: innerWidth, height: innerHeight, powerPreference: 'high-performance' });
    lifecycle.apps++;
    this.q('.cs-canvas').appendChild(this.app.canvas);
    this.view = new CoastView(this.app, this.opts);
    this.app.stage.addChild(this.view.screen);
    lifecycle.views++;
    this.view.onRebuild = reason => { if (reason !== 'enter') this.fade(); };
    this.input.touch = document.documentElement.classList.contains('mobile') || matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    this.wire();
    const tick = () => this.frame();
    this.app.ticker.add(tick); lifecycle.tickers++;
    this.scope.add(() => { this.app.ticker.remove(tick); lifecycle.tickers--; });
    // Follow the original phone-layout decision (main.ts toggles html.mobile on resize).
    const ro = new ResizeObserver(() => { this.view.resize(); if (document.documentElement.classList.contains('mobile')) this.input.touch = true; });
    ro.observe(this.root); this.scope.observe(ro);
    this.mounted = true;
  }

  // --- frame ---
  private frame() {
    if (!this.mounted || this.exiting) return;
    const t0 = performance.now();
    const playing = this.panel === null;
    const intent = this.input.read(playing, (x, y) => this.view.aimFromClient(x, y));
    const batch = this.runtime.advance(t0, intent);
    const t1 = performance.now();
    this.view.present(batch, this.app.ticker.deltaMS / 1000);
    const t2 = performance.now();
    this.hud(batch);
    this.last = batch;
    this.syncPanels(batch);
    this.stats.advanceMs = t1 - t0; this.stats.presentMs = t2 - t1; this.stats.frames++;
    if (this.frameTimes.length < 4000) this.frameTimes.push(this.app.ticker.deltaMS);
  }

  /** Mirror Runtime phase into panels; the Runtime decides, the host only shows. */
  private syncPanels(b: PublishedView) {
    const phase = b.frame.phase, loot = this.services.lootContext();
    if (phase === 'ending') { if (this.panel !== 'ending') this.showEnding(); else this.refreshEnding(); return; }
    if (phase === 'blocked' && loot && this.panel !== 'loot') { this.openLoot(); return; }
    if (phase !== 'blocked' && (this.panel === 'loot' || this.panel === 'inventory')) { this.closePanel(false); }
    if (phase === 'paused' && this.panel !== 'pause') this.showPause();
    if (this.panel === 'pause' && phase === 'running') this.closePanel(false);
  }

  // --- input wiring ---
  private wire() {
    const s = this.scope, canvas = this.app.canvas;
    s.on(window, 'keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      if (['tab', ' ', 'escape'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      if (k === 'escape') { if (this.panel === 'inventory' || this.panel === 'loot') this.closePanel(true); else if (this.panel === 'pause') this.resume(); else if (!this.panel) this.pause(); return; }
      if (k === 'tab') { if (this.panel === 'inventory' || this.panel === 'loot') this.closePanel(true); else if (!this.panel) this.openInventory(); return; }
      if (k === 'e' && this.panel === 'loot') { this.closePanel(true); return; }
      if (k === 'm' && !this.panel) { this.toast('样板未包含地图面板。'); return; }
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
    s.on(window, 'pointerup', e => { if (e.pointerType === 'mouse') this.input.mouse(e.button, false); else { this.input.release(e.pointerId); this.sticks.delete(e.pointerId); } });
    s.on(window, 'pointercancel', e => { if (e.pointerType === 'mouse') this.input.mouse(e.button, false); else { this.input.release(e.pointerId); this.sticks.delete(e.pointerId); } });
    s.on(canvas, 'pointerleave', e => { if (e.pointerType === 'mouse') this.input.pointer.inside = false; });
    s.on(canvas, 'wheel', e => { e.preventDefault(); this.cycleChoice(Math.sign(e.deltaY)); }, { passive: false });
    s.on(window, 'blur', () => this.pause('blur'));
    s.on(window, 'pagehide', () => this.pause('blur'));
    s.on(document, 'visibilitychange', () => { if (document.hidden) this.pause('blur'); });
    s.on(canvas, 'webglcontextlost', e => { e.preventDefault(); this.pause('context-lost'); });
    s.on(canvas, 'webglcontextrestored', () => { this.view.resize(); this.toast('画面已恢复。'); });
    const act = this.q('[data-act]');
    s.on(act, 'pointerdown', e => { e.preventDefault(); this.input.touch = true; this.input.interact(e.pointerId); try { act.setPointerCapture(e.pointerId); } catch { /* synthetic */ } });
    s.on(act, 'pointerup', e => this.input.release(e.pointerId));
    s.on(act, 'pointercancel', e => this.input.release(e.pointerId));
    s.on(this.q('[data-reload]'), 'pointerdown', e => { e.preventDefault(); this.input.press('reload'); });
    s.on(this.q('[data-heal]'), 'pointerdown', e => { e.preventDefault(); this.input.press('heal'); });
    s.on(this.q('[data-bag]'), 'click', () => { if (!this.panel) this.openInventory(); else if (this.panel === 'inventory') this.closePanel(true); });
    s.on(this.q('[data-choices]'), 'click', e => { const id = (e.target as HTMLElement).closest('[data-id]')?.getAttribute('data-id'); if (id) this.input.select(id); });
    s.on(this.q('[data-panel]'), 'click', e => this.onPanelClick(e));
  }

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
  private setPanel(kind: CoastSampleHost['panel'], html: string, label: string) {
    this.panel = kind; const p = this.q('[data-panel]'); p.className = `cs-panel ${kind ?? ''}`; p.innerHTML = html; p.setAttribute('aria-label', label); p.hidden = !kind;
    p.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
  pause(reason: 'overlay' | 'blur' | 'context-lost' = 'overlay') {
    if (!this.mounted || this.panel === 'pause' || this.panel === 'ending') return;
    if (this.panel === 'inventory' || this.panel === 'loot') this.closePanel(true);
    this.input.suppressHeld(); this.sticks.clear();
    this.runtime.pause(reason);
    this.showPause(reason);
  }
  private showPause(reason?: string) {
    const conflict = this.session.conflict, saveError = !this.session.storageOK || this.lastRejected === 'checkpoint' || this.lastRejected === 'save-failed';
    const title = conflict ? '存档已被其他窗口更新' : saveError ? '存档保存失败' : reason === 'context-lost' ? '画面中断' : '已暂停';
    const text = conflict ? '本页已停止操作。请导出需要保留的进度，再刷新本页。'
      : saveError ? '最近的操作或检查点没有写入，世界已保持在保存前的状态。检查浏览器存储后重试，或先导出备份。'
      : reason === 'context-lost' ? '图形上下文丢失，行动已暂停，存档没有改变。' : '行动时间已停止。';
    const buttons = conflict ? `<button type="button" data-do="backup">导出备份</button>`
      : saveError ? `<button type="button" data-do="retry-save">重试保存</button><button type="button" data-do="backup">导出备份</button>`
      : `<button type="button" data-do="resume">继续</button><button type="button" data-do="abandon">放弃行动</button>`;
    this.input.suppressHeld(); this.sticks.clear();
    this.setPanel('pause', `<h2>${title}</h2><p>${text}</p><div class="cs-row">${buttons}</div>`, title);
  }
  private resume() {
    this.input.suppressHeld();
    this.runtime.resume();
    if (this.runtime.current().frame.phase !== 'paused') this.closePanel(false);
  }
  private openInventory() {
    this.input.suppressHeld(); this.sticks.clear();
    this.runtime.setBlocked(true);
    this.panel = 'inventory'; this.renderInventory();
  }
  private openLoot() {
    this.input.suppressHeld(); this.sticks.clear();
    this.panel = 'loot'; this.renderLoot();
  }
  /** Close a blocking panel; the Runtime clears its loot context in setBlocked(false). */
  private closePanel(byPlayer: boolean) {
    const was = this.panel;
    if (byPlayer && (was === 'inventory' || was === 'loot')) this.runtime.setBlocked(false);
    this.input.suppressHeld(); this.sticks.clear();
    this.setPanel(null, '', '');
  }

  private bagRows(inv: D.Inventory, from: 'bag' | 'safe') {
    if (!inv.items.length) return '<li class="cs-empty">空</li>';
    return inv.items.map(i => {
      const weapon = D.WEAPONS[i.id] && i.id !== 'knife' && from === 'bag';
      return `<li><span>${esc(name(i.id))} ×${i.qty}${i.relief ? ' · 救济' : ''}</span>${SUPPLIES.has(i.id) ? `<button type="button" data-do="use" data-uid="${i.uid}" data-id="${i.id}" data-from="${from}">使用</button>` : ''}${weapon ? `<button type="button" data-do="equip" data-uid="${i.uid}">装备</button>` : ''}<button type="button" data-do="drop" data-uid="${i.uid}" data-from="${from}">丢弃</button></li>`;
    }).join('');
  }
  private renderInventory() {
    const l = this.session.loadout; if (!l) return;
    const w = D.WEAPONS[l.weapon || 'knife'];
    this.setPanel('inventory', `<h2>随身物资</h2><p class="cs-sub">背包里的东西撤离失败会丢失，安全箱保留。世界仍在运行。</p>
      <p>主武器：${esc(w?.name ?? '水手匕首')}</p>
      <div class="cs-cols"><section><h3>背包 ${l.bag.w} × ${l.bag.h}</h3><ul class="cs-items">${this.bagRows(l.bag, 'bag')}</ul></section>
      <section><h3>安全箱</h3><ul class="cs-items">${this.bagRows(l.safe, 'safe')}</ul></section></div>
      <div class="cs-row"><button type="button" data-do="close">关闭（Tab / Esc）</button></div>`, '随身物资');
  }
  private lootRef(): TargetRef | null {
    const c = this.services.lootContext(), map = this.last?.stamp.world.mapId; if (!c || !map) return null;
    return { runId: c.runId, mapId: map, kind: 'container', id: c.containerId };
  }
  private renderLoot() {
    const ref = this.lootRef(), inv = ref ? this.services.lootInventory(ref) : null, l = this.session.loadout;
    if (!ref || !inv || !l) { this.closePanel(true); return; }
    const box = this.last?.frame.containers.find(c => c.id === ref.id);
    const rows = inv.items.length ? inv.items.map(i => `<li><span>${esc(name(i.id))} ×${i.qty}</span><button type="button" data-do="take" data-uid="${i.uid}">拿取</button></li>`).join('') : '<li class="cs-empty">已搜空</li>';
    const bag = l.bag.items.length ? l.bag.items.map(i => `<li><span>${esc(name(i.id))} ×${i.qty}</span><button type="button" data-do="put" data-uid="${i.uid}">放回</button></li>`).join('') : '<li class="cs-empty">空</li>';
    this.setPanel('loot', `<h2>${esc(box?.name ?? '物资')}</h2><p class="cs-sub">搜刮时世界仍在运行，请留意周围。每次拿取会立即保存。</p>
      <div class="cs-cols"><section><h3>${box?.kind === 'corpse' ? '尸体物品栏' : '箱子物品栏'}</h3><ul class="cs-items">${rows}</ul></section>
      <section><h3>背包 ${l.bag.w} × ${l.bag.h}</h3><ul class="cs-items">${bag}</ul></section></div>
      <div class="cs-row"><button type="button" data-do="take-all"${inv.items.length ? '' : ' disabled'}>全部拿取</button><button type="button" data-do="close">关闭（E / Tab / Esc）</button></div>`, '搜刮物资');
  }

  /** First free top-left slot in `to` (merging into a compatible stack first, then trying rotation). */
  private slot(to: D.Inventory, item: D.Item): { x: number; y: number; rotated: boolean } | null {
    const def = D.ITEMS[item.id];
    const stack = to.items.find(t => t.id === item.id && !!t.relief === !!item.relief && t.qty < def.stack);
    if (stack) return { x: stack.x, y: stack.y, rotated: !!stack.rotated };
    for (const rotated of def.w === def.h ? [false] : [false, true])
      for (let y = 0; y < to.h; y++) for (let x = 0; x < to.w; x++) if (D.fits(to, item.id, x, y, undefined, rotated)) return { x, y, rotated };
    return null;
  }
  private transfer(uid: string, from: 'container' | 'bag', silent = false): MutationResult | 'no-space' {
    const ref = this.lootRef(), l = this.session.loadout; if (!ref || !l) return 'rejected';
    const box = this.services.lootInventory(ref); if (!box) return 'rejected';
    const src = from === 'container' ? box : l.bag, dst = from === 'container' ? l.bag : box;
    const item = src.items.find(i => i.uid === uid); if (!item) return 'rejected';
    const at = this.slot(dst, item);
    if (!at) { if (!silent) this.toast(from === 'container' ? '背包空间不足。' : '箱子空间不足。', true); return 'no-space'; }
    const result = this.services.transferLoot(ref, { runId: ref.runId, containerId: ref.id, from, to: from === 'container' ? 'bag' : 'container', uid, x: at.x, y: at.y, rotated: at.rotated });
    return result;
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
      case 'use': this.services.useSupply(d.id!, d.from as 'bag' | 'safe', d.uid); this.renderInventory(); break;
      case 'equip': this.services.equipItem(d.uid!); this.renderInventory(); break;
      case 'drop': this.services.dropItem(d.uid!, d.from as 'bag' | 'safe'); this.renderInventory(); break;
      case 'take': this.transfer(d.uid!, 'container'); this.renderLoot(); break;
      case 'put': this.transfer(d.uid!, 'bag'); this.renderLoot(); break;
      case 'take-all': {
        const ref = this.lootRef(), inv = ref && this.services.lootInventory(ref);
        for (const item of inv?.items ?? []) if (this.transfer(item.uid, 'container', true) !== 'committed') break;
        if (this.panel === 'loot') this.renderLoot(); break;
      }
    }
  }

  // --- ending ---
  private showEnding() {
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
      text.textContent = '结算已保存。';
      row.innerHTML = '';
      this.scope.timeout(() => this.onExit({ kind: 'settled' }), 400);
      return;
    }
    text.textContent = s.retryable ? '结算还没有写入存档。结算记录已保留，可以重试或先导出备份。' : '等待结算保存';
    if (s.retryable && !row.childElementCount) row.innerHTML = '<button type="button" data-do="retry-settlement">重试保存</button><button type="button" data-do="backup">导出备份</button>';
  }

  // --- HUD ---
  private hud(b: PublishedView) {
    const f = b.frame, h = f.hud, q = <T extends HTMLElement>(s: string) => this.q<T>(s);
    q('[data-hp]').style.width = `${Math.max(0, h.hp / h.maxHp) * 100}%`; q('[data-hp-text]').textContent = `${Math.ceil(h.hp)}`;
    q('[data-st]').style.width = `${Math.max(0, h.stamina / h.maxStamina) * 100}%`;
    const w = h.weapon;
    q('[data-weapon]').textContent = w.magSize ? `${w.name}  ${w.reloading ? '换弹中' : `${w.mag} / ${w.magSize}`}  备用 ${w.reserve} · 医疗 ${h.heals}` : `${w.name} · 医疗 ${h.heals}`;
    const region = this.view.regionName();
    q('[data-where]').textContent = `${b.map.name} · ${b.map.floor}${region ? ` · ${region}` : ''}${this.view.outsideSample() ? ' · 样板外（通用占位画面）' : ''}`;
    const t = Math.ceil(h.timeLeft);
    q('[data-time]').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    q('[data-tide]').textContent = h.tideWarning ? '潮汐预警' : h.highTide ? '高潮' : '';
    q('[data-hits]').innerHTML = h.hitDirections.filter(x => x.angle !== null).map(x => `<i style="transform:rotate(${x.angle!}rad);opacity:${Math.min(1, x.left)}"></i>`).join('');
    if ((this.stats.frames & 15) === 0) { const r = this.q('.cs-status').getBoundingClientRect(); this.view.hudTop = innerHeight < 480 ? r.bottom : 0; }
    this.prompt(this.panel ? null : f.interaction, f.player.y);
    const cross = q('[data-cross]'); cross.hidden = this.input.touch || !this.input.pointer.inside || !!this.panel;
    cross.style.transform = `translate(${this.input.pointer.x}px, ${this.input.pointer.y}px)`;
    cross.classList.toggle('precise', f.player.state.precise);
    this.root.classList.toggle('touch', this.input.touch);
    for (const e of b.events) if (e.seq > this.lastSeq) {
      this.lastSeq = e.seq; this.onEvent(e);
      const { seq, type, durability, stamp, ...detail } = e;
      this.eventLog.push({ seq, type, durability, map: stamp.world.mapId, epoch: stamp.epoch, detail: detail as Record<string, unknown> });
      if (this.eventLog.length > 1000) this.eventLog.shift();
    }
    if (this.toastLeft > 0) { this.toastLeft -= this.app.ticker.deltaMS / 1000; if (this.toastLeft <= 0) q('[data-toast]').classList.remove('on'); }
    if (this.panel === 'loot' && b.events.some(e => e.type === 'looted' || e.type === 'rejected')) this.renderLoot();
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
    if (e.type === 'notice') this.toast(e.text);
    else if (e.type === 'rejected') { this.lastRejected = e.action === 'checkpoint' ? 'checkpoint' : e.reason === 'save-failed' ? 'save-failed' : e.action; if (e.action !== 'select-target') this.toast(REASONS[e.reason] ?? e.reason, true); }
    else if (e.type === 'looted' && e.durability === 'committed') this.toast(`获得 ${name(e.item)} ×${e.qty}${e.partial ? '（部分）' : ''}`);
  }
  toast(text: string, bad = false) { const t = this.q('[data-toast]'); if (!t) return; t.textContent = text; t.classList.add('on'); t.classList.toggle('bad', bad); this.toastLeft = 2.8; }
  private fade() { const f = this.q('[data-fade]'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

  /** Write a checkpoint now (beforeunload); the Runtime ignores it when locked or ending. */
  checkpoint() { return this.mounted && !this.exiting ? this.services.checkpoint() : false; }

  // --- unmount ---
  unmount() {
    if (!this.mounted) return;
    this.mounted = false;
    this.scope.dispose();
    this.view.destroy(); lifecycle.views--;
    this.app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
    lifecycle.apps--;
    this.root.remove();
  }
}
