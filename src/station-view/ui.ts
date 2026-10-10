import * as D from '../domain';
import type { Attribute, Facility, HideoutRuntime, HideoutSnapshot, Merchant, Recipe, Result, RunWorld, ShopSession, ShopSource, Source } from '../hideout-runtime/contract';
import type { Scope } from '../coast-view/scope';
import { STATIONS, type Station, type StationId } from './layout';
import { GridDrag, esc, type DragHooks } from './grid';
import * as P from './panels';

export type PanelKind = 'gear' | 'arms' | 'med' | 'radio' | 'generator' | 'deploy' | 'facility' | 'board' | 'chat' | 'body' | 'menu' | 'help' | 'report';
export type Cue = 'ok' | 'error' | 'open' | 'close' | 'pick' | 'drop' | 'coins' | 'build' | 'deliver';
export interface UIHost {
  panelChanged(kind: PanelKind | null, station: Station | null): void;
  deploy(world: RunWorld, seed: string): void;
  volume(v: number): void;
  sound(cue: Cue): void;
  lineFor(id: StationId): string;
  /** Leave for the old tab page (shortcut fallback). */
  tabs(): void;
  /** Back to the title screen. */
  title(): void;
  exportSave(): void;
  /** A complete backup was imported; the host decides where the player goes next. */
  imported(): void;
  /** Equipped charm (read-only; the snapshot has no field for it yet). */
  charm(): string | null;
  /** Training seconds walked since the last save (display only; the Runtime credits nothing until it commits). */
  pendingSeconds(): number;
}
/** A confirmation or failure dialog drawn over the open panel. */
type Dialog =
  | { kind: 'sale'; token: string; warnings: string[] }
  | { kind: 'import'; text: string; token: string; name: string }
  | { kind: 'storage' };

const WIDE: PanelKind[] = ['gear', 'arms', 'med'];
const CENTER: PanelKind[] = ['report', 'menu', 'help'];
/**
 * The old hideout tabs kept as shortcuts (decision 06-2): open any of them from anywhere with the same session the
 * stations use; the camera turns to the place it belongs to. Digits follow the bar order; Tab / J / C / G still work.
 */
export const SHORTCUTS: { kind: PanelKind; label: string; key: string }[] = [
  { kind: 'gear', label: '整备', key: '1' }, { kind: 'arms', label: '修理铺', key: '2' }, { kind: 'med', label: '卫生所', key: '3' },
  { kind: 'radio', label: '任务', key: '4' }, { kind: 'facility', label: '设施', key: '5' }, { kind: 'body', label: '身体', key: '6' },
  { kind: 'deploy', label: '出击', key: '7' },
];
const FACILITY_ORDER: Facility[] = ['rest', 'medical', 'training', 'workbench', 'blackmarket'];
const FACILITY_LABEL: Record<Facility, string> = { rest: '休息区', medical: '医疗区', training: '训练区', workbench: '工作台', blackmarket: '黑市' };
const TITLES: Partial<Record<PanelKind, [string, string]>> = {
  gear: ['仓库与整备', '冷库'], arms: ['修理铺', '老栓 · 武器 · 零件'], med: ['卫生所', '许医生 · 医疗用品 · 食品'], radio: ['电台任务', '小蔡 · 值守记录'],
  generator: ['发电机', '发电机房'], deploy: ['出击准备', '院门'], body: ['身体与成长', '在站里休息会慢慢恢复'], menu: ['暂停', '滨科夫水产站'], help: ['操作说明', ''],
  board: ['寻人板', '食堂门口'], chat: ['食堂', '炊事员'], report: ['行动报告', ''],
};
const DIALOG_TITLES: Record<Dialog['kind'], string> = { sale: '确认出售', import: '导入存档', storage: '存档没有写入' };

export class UI {
  readonly root: HTMLElement;
  private panel: HTMLElement; private modal: HTMLElement; private hud: HTMLElement; private tags: HTMLElement; private toasts: HTMLElement;
  private prompt: HTMLElement; private bubbles: HTMLElement; private quick: HTMLElement; private dialogEl: HTMLElement; private alarm: HTMLElement;
  kind: PanelKind | null = null;
  station: Station | null = null;
  facility: Facility = 'rest';
  private selected: { src: string; uid: string } | null = null;
  /** Compact layout state: the switchable second container in gear, buy or sell in shops. */
  private paneB: 'stash' | 'safe' = 'stash';
  private shopMode: 'buy' | 'sell' = 'buy';
  private shop: ShopSession | null = null;
  private world: RunWorld = 'coast'; private seed = '';
  private dialog: Dialog | null = null;
  summary: D.RunSummary | null = null;
  private drag: GridDrag;
  private lastSnapshotRev = -1;
  touch = false;
  volume = .35;
  private tagEls = new Map<StationId, HTMLElement>();
  private timers = new Set<number>();

  constructor(parent: HTMLElement, shadow: ShadowRoot, private rt: HideoutRuntime, private host: UIHost, scope: Scope, opts: { world: RunWorld; seed: string }) {
    this.world = opts.world; this.seed = opts.seed;
    this.root = document.createElement('div'); this.root.className = 'ui'; parent.appendChild(this.root);
    this.root.innerHTML = `<div class="tags"></div><div class="bubbles"></div>
      <header class="hud"><div class="id"><i class="sig"></i><div><b>滨科夫水产站</b><span id="hud-sub"></span></div></div><div class="cash"><span>可用现金</span><b id="hud-cash"></b><small id="hud-prod"></small></div></header>
      <button class="alarm" data-alarm hidden>存档没有写入 · 点这里处理</button>
      <div class="prompt" hidden></div><div class="doortag" hidden></div><div class="toasts" role="status"></div>
      <nav class="quick"><button class="qmore" data-quickmenu aria-expanded="false"><span>功能</span></button>${SHORTCUTS.map(q => `<button data-quick="${q.kind}"><span>${q.label}</span><kbd>${q.key}</kbd></button>`).join('')}<button data-tabs title="旧版页签界面（备用入口）"><span>页签</span><kbd>0</kbd></button><button data-quick="menu"><span>菜单</span><kbd>Esc</kbd></button></nav>
      <section class="panel" hidden aria-live="polite"></section><section class="modal" hidden></section><section class="modal dialog" hidden role="dialog" aria-modal="true"></section>
      <button class="touch-act" aria-label="交互">交互</button><div class="joy"><i></i></div>`;
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
    this.panel = q('.panel'); this.modal = q('.modal:not(.dialog)'); this.dialogEl = q('.dialog'); this.hud = q('.hud'); this.tags = q('.tags'); this.toasts = q('.toasts'); this.prompt = q('.prompt'); this.bubbles = q('.bubbles'); this.quick = q('.quick'); this.alarm = q('[data-alarm]');
    for (const s of STATIONS) {
      const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<b>${esc(s.who ?? s.name)}</b>${s.who ? `<span>${esc(s.name)}</span>` : ''}`;
      this.tags.appendChild(el); this.tagEls.set(s.id, el);
    }
    scope.on(this.root, 'click', this.click);
    scope.on(this.root, 'input', this.input);
    scope.on(this.root, 'change', this.input);
    scope.add(() => { for (const t of this.timers) clearTimeout(t); this.timers.clear(); });
    this.drag = new GridDrag(this.root, shadow, () => this.hooks(), scope);
  }

  get open() { return this.kind !== null || this.dialog !== null; }
  get dragging() { return this.drag.active; }
  get dialogKind() { return this.dialog?.kind ?? null; }

  // ---------- panels ----------
  show(kind: PanelKind, station: Station | null = null, facility?: Facility) {
    if (this.kind && (this.kind === 'arms' || this.kind === 'med') && kind !== this.kind && this.shop?.view().dirty) { this.toast('待买或待卖区还有物品，先结算或清空。', 'error'); this.host.sound('error'); return; }
    const was = this.kind;
    this.kind = kind; this.station = station; this.selected = null;
    if (facility) this.facility = facility;
    if (kind === 'arms' || kind === 'med') { this.shop = this.rt.openShop(kind as Merchant); this.shopMode = 'buy'; } else this.shop = null;
    this.render();
    if (!was) this.host.sound('open');
    this.host.panelChanged(kind, station);
  }
  close() {
    if (this.dialog) { this.closeDialog(); return; }
    if (!this.kind) return;
    if ((this.kind === 'arms' || this.kind === 'med') && this.shop?.view().dirty) { this.toast('待买或待卖区还有物品，先结算或清空。', 'error'); this.host.sound('error'); return; }
    this.kind = null; this.station = null; this.shop = null; this.selected = null;
    this.panel.hidden = true; this.modal.hidden = true; this.panel.innerHTML = ''; this.modal.innerHTML = '';
    this.root.classList.remove('has-panel', 'has-modal');
    this.host.sound('close');
    this.host.panelChanged(null, null);
  }
  /** Leave with a dirty cart allowed (the cart is only a list; nothing was paid). */
  discard() { this.shop?.reset(); this.dialog = null; this.dialogEl.hidden = true; this.close(); }
  /** CSS px of the right side covered by the docked panel (the camera keeps the station in view). */
  get inset() { return this.kind && !CENTER.includes(this.kind) && !this.panel.hidden && !this.compact ? this.panel.getBoundingClientRect().width + 24 : 0; }

  /** Phones and short windows get the paired-container layout. */
  get compact() { return innerWidth < 900 || innerHeight < 560; }
  /** Grid cell (CSS px) that fits the panel's tallest column and a width that leaves the station in view. */
  private cellFor(kind: PanelKind): number {
    const s = this.rt.snapshot(), rows = s.profile.stash.h, H = innerHeight, Wd = innerWidth;
    if (this.compact) {
      // Landscape: two containers side by side (16 columns for gear, 14 for shops); portrait: stacked, 10 columns wide.
      // Height fits the first container (5 rows); the second one scrolls when it is taller.
      const portrait = H > Wd, cols = portrait ? 10 : kind === 'gear' ? 16 : 14;
      const byW = (Wd - (portrait ? 34 : 60)) / cols, byH = portrait ? 99 : (H - (kind === 'gear' ? 178 : 168)) / 5;
      return Math.max(36, Math.min(56, Math.floor(Math.min(byW, byH))));
    }
    if (kind === 'gear') {
      // Left: slot, three headings and the weight meter (~224 px) around bag (5 rows) and safe (2 rows); right: stash, upgrade and details (~180 px).
      const byH = Math.min((H - 164 - 262) / 7, (H - 164 - 190) / rows), byW = (Math.min(Wd - 24, Wd * .74) - 70) / 16;
      return Math.max(28, Math.min(56, Math.floor(Math.min(byH, byW))));
    }
    const byH = Math.min((H - 331 - 70) / 6, (H - 331) / rows), byW = (Math.min(Wd - 24, Wd * .76) - 74) / 20;
    return Math.max(28, Math.min(56, Math.floor(Math.min(byH, byW))));
  }

  render() {
    this.renderDialog();
    const kind = this.kind; if (!kind) return;
    const s = this.rt.snapshot(); this.lastSnapshotRev = s.rev;
    const center = CENTER.includes(kind), el = center ? this.modal : this.panel;
    const [title, sub] = kind === 'facility' ? [this.rt.facility(this.facility).name, facilityPlace[this.facility]] : TITLES[kind] ?? ['', ''];
    const line = this.station ? this.host.lineFor(this.station.id) : '';
    let cell = this.cellFor(kind);
    // Desktop panels must fit without scrolling: if the first paint overflows (a quote line, an upgraded stash), the
    // cell shrinks by the overflow spread over the tallest column and the panel is painted again (at most twice).
    for (let pass = 0; ; pass++) {
      this.paint(kind, s, cell, center, el, title, sub, line);
      const pb = el.querySelector<HTMLElement>('.pbody')!, over = pb.scrollHeight - pb.clientHeight;
      if (over <= 1 || this.compact || !WIDE.includes(kind) || cell <= 28 || pass >= 2) break;
      cell = Math.max(28, cell - Math.ceil(over / Math.max(kind === 'gear' ? 7 : 6, s.profile.stash.h)));
    }
  }
  private paint(kind: PanelKind, s: HideoutSnapshot, cell: number, center: boolean, el: HTMLElement, title: string, sub: string, line: string) {
    let body = '';
    const sel = this.selected?.uid ?? null;
    switch (kind) {
      case 'gear': {
        const item = this.findSelected(s), details = P.detailsHtml(item, this.selected?.src ?? null, 'gear'), charm = this.host.charm();
        body = this.compact ? P.gearCompactHtml(s, cell, sel, this.rt.departure(), this.paneB, details, charm) : P.gearHtml(s, cell, sel, this.rt.departure(), details, charm); break;
      }
      case 'arms': case 'med': { const v = this.shop!.view(); const item = this.selected ? (v[this.selected.src === 'merchant' ? 'catalog' : this.selected.src as 'buy' | 'sell' | 'stash'].items.find(i => i.uid === this.selected!.uid) ?? null) : null; body = this.compact ? P.shopCompactHtml(v, cell, sel, s.profile.cash, this.shopMode) : P.shopHtml(v, cell, sel, s.profile.cash) + P.detailsHtml(item, this.selected?.src ?? null, 'shop'); break; }
      case 'radio': body = P.questsHtml(s); break;
      case 'generator': body = P.generatorHtml(s); break;
      case 'deploy': body = P.deployHtml(s, this.rt.departure(), this.world, this.seed); break;
      case 'facility': body = `<nav class="seg facs">${FACILITY_ORDER.map(f => P.btn(`${FACILITY_LABEL[f]}${s.base.facilities[f] ? ` <small>${s.base.facilities[f]} 级</small>` : ''}`, `fac:${f}`, f === this.facility ? 'on' : '')).join('')}</nav>` + P.facilityHtml(this.rt.facility(this.facility), s, this.host.pendingSeconds()); break;
      case 'body': body = P.bodyHtml(s); break;
      case 'board': body = P.boardHtml(); break;
      case 'chat': body = `<p class="muted">长桌上摆着碗。灶上那锅粥一直温着，谁回来谁盛。</p>`; break;
      case 'menu': body = P.menuHtml(this.volume); break;
      case 'help': body = P.helpHtml(this.touch); break;
      case 'report': body = this.summary ? P.reportHtml(this.summary, s) : ''; break;
    }
    const scroll = el.querySelector('.pbody')?.scrollTop ?? 0;
    el.className = `${center ? 'modal' : 'panel'} k-${kind}${WIDE.includes(kind) ? ' wide' : ''}${this.compact ? ' compact' : ''}${innerHeight > innerWidth ? ' portrait' : ''}`;
    el.style.width = WIDE.includes(kind) && !this.compact ? `${Math.min(innerWidth - 24, (kind === 'gear' ? 16 * cell + 70 : 20 * cell + 74))}px` : '';
    const cash = ['gear', 'arms', 'med', 'facility', 'deploy', 'radio', 'generator'].includes(kind) ? `<span class="pcash">现金 <b>¥ ${s.profile.cash.toLocaleString()}</b></span>` : '';
    const tabbed = SHORTCUTS.some(q => q.kind === kind) || kind === 'generator';
    const tabs = tabbed ? `<nav class="ptabs" aria-label="水产站功能">${SHORTCUTS.map(q => `<button data-tab="${q.kind}" class="${q.kind === kind ? 'on' : ''}" ${q.kind === kind ? 'aria-current="page"' : ''}>${q.label}<kbd>${q.key}</kbd></button>`).join('')}</nav>` : '';
    const heading = this.compact && tabbed ? `<button class="tabmenu" data-tabmenu aria-label="切换功能"><h2>${esc(title)}</h2><i class="caret" aria-hidden="true"></i></button>` : `<h2>${esc(title)}</h2>`;
    el.innerHTML = `<header class="phead"><div>${heading}${sub ? `<small>${esc(sub)}</small>` : ''}</div>${cash}${P.btn('关闭 <kbd>Esc</kbd>', 'close', 'x')}</header>${tabs}${line ? `<p class="line">“${esc(line)}”</p>` : ''}<div class="pbody">${body}</div>`;
    el.querySelector('.pbody')!.scrollTop = scroll;
    el.hidden = false;
    (center ? this.panel : this.modal).hidden = true;
    this.root.classList.toggle('has-panel', !center); this.root.classList.toggle('has-modal', center);
  }
  private renderDialog() {
    const d = this.dialog;
    this.dialogEl.hidden = !d; this.root.classList.toggle('has-dialog', !!d);
    if (!d) { this.dialogEl.innerHTML = ''; return; }
    const s = this.rt.snapshot();
    const body = d.kind === 'sale' ? P.saleConfirmHtml(d.warnings) : d.kind === 'import' ? P.importConfirmHtml(d.name) : P.storageHtml(s);
    this.dialogEl.className = `modal dialog k-${d.kind}`;
    const title = d.kind === 'storage' && s.storage.conflict ? '存档已被另一个窗口接管' : DIALOG_TITLES[d.kind];
    this.dialogEl.setAttribute('aria-label', title);
    this.dialogEl.innerHTML = `<header class="phead"><div><h2>${title}</h2></div>${P.btn('关闭 <kbd>Esc</kbd>', 'close', 'x')}</header><div class="pbody">${body}</div>`;
  }
  private openDialog(d: Dialog) { const was = this.open; this.dialog = d; this.renderDialog(); if (!was) this.host.panelChanged(this.kind, this.station); }
  private closeDialog() { this.dialog = null; this.renderDialog(); this.host.sound('close'); if (!this.kind) this.host.panelChanged(null, null); }
  /** The storage dialog follows the Runtime: it opens when a write fails and closes once a retry succeeded. */
  syncStorage(s: HideoutSnapshot) {
    const broken = !s.storage.ok || s.storage.conflict;
    this.alarm.hidden = !broken || this.dialog?.kind === 'storage';
    if (broken) this.alarm.textContent = s.storage.conflict ? '存档已被另一个窗口接管 · 点这里处理' : '存档没有写入 · 点这里处理';
    if (!broken && this.dialog?.kind === 'storage') { this.dialog = null; this.renderDialog(); if (!this.kind) this.host.panelChanged(null, null); }
  }
  showStorage() { this.openDialog({ kind: 'storage' }); this.alarm.hidden = true; }
  /** Re-render when the runtime committed something (production ticks refresh the facility panel too). */
  refresh(force = false) {
    // Never rebuild under the pointer or the caret: a drag, a typed seed or a held volume slider would be lost.
    if (this.dragging || (this.root.getRootNode() as ShadowRoot).activeElement?.tagName === 'INPUT') return;
    if (this.dialog?.kind === 'storage') this.renderDialog();
    if (!this.kind) return;
    const s = this.rt.snapshot(); if (force || s.rev !== this.lastSnapshotRev || this.kind === 'facility') this.render();
  }

  private findSelected(s: HideoutSnapshot): D.Item | null {
    if (!this.selected) return null;
    const inv = s.profile[this.selected.src as Source]; return inv?.items.find(i => i.uid === this.selected!.uid) ?? null;
  }

  private hooks(): DragHooks | null {
    if (this.dialog) return null;
    if (this.kind === 'gear') return {
      rotatable: true,
      inv: src => this.rt.snapshot().profile[src as Source] ?? null,
      check: (from, to, uid, x, y, r) => this.rt.placementError(from as Source, to as Source, uid, x, y, r),
      drop: (from, to, uid, x, y, r) => { this.result(this.rt.move(from as Source, to as Source, uid, x, y, r), 'drop'); this.selected = { src: to, uid }; this.render(); },
      dropSlot: (slot, from, uid) => { if (slot === 'weapon') { this.result(this.rt.equip(from as Source, uid), 'drop'); this.selected = null; this.render(); } },
      select: (src, uid) => { this.selected = { src, uid }; this.host.sound('pick'); this.render(); },
      quick: (src, uid) => { this.result(this.rt.quickMove(src as Source, uid), 'drop'); this.selected = null; this.render(); },
      reject: m => { this.toast(m, 'error'); this.host.sound('error'); },
    };
    if ((this.kind === 'arms' || this.kind === 'med') && this.shop) {
      const shop = this.shop, inv = (src: string) => { const v = shop.view(); return src === 'merchant' ? v.catalog : v[src as 'buy' | 'sell' | 'stash']; };
      return {
        rotatable: false, inv,
        check: (from, to, uid, x, y) => shop.placementError(from as ShopSource, to as ShopSource, uid, x, y),
        drop: (from, to, uid, x, y) => { const r = shop.place(from as ShopSource, to as ShopSource, uid, x, y); if (!r.ok) { this.toast(r.message, 'error'); this.host.sound('error'); } else this.host.sound('drop'); this.selected = null; this.render(); },
        select: (src, uid) => { this.selected = { src, uid }; this.host.sound('pick'); this.render(); },
        quick: (src, uid) => {
          // Double-click: catalog <-> buy, stash <-> sell, using the first free cell.
          const to: ShopSource | null = src === 'merchant' ? 'buy' : src === 'buy' ? 'merchant' : src === 'stash' ? 'sell' : src === 'sell' ? 'stash' : null;
          if (!to) return; const target = inv(to);
          for (let y = 0; y < target.h; y++) for (let x = 0; x < target.w; x++) if (!shop.placementError(src as ShopSource, to, uid, x, y)) { const r = shop.place(src as ShopSource, to, uid, x, y); if (r.ok) this.host.sound('drop'); else this.toast(r.message, 'error'); this.render(); return; }
          this.toast(to === 'buy' || to === 'sell' ? '待买或待卖区放不下了。' : '仓库放不下。', 'error'); this.host.sound('error');
        },
        reject: m => { this.toast(m, 'error'); this.host.sound('error'); },
      };
    }
    return null;
  }

  private result(r: Result, okCue: Cue = 'ok') {
    if (r.ok) { if (r.message) this.toast(r.message, 'ok'); this.host.sound(okCue); }
    else { this.toast(r.message, 'error'); this.host.sound('error'); if (r.reason === 'storage' || r.reason === 'conflict') this.showStorage(); }
    return r.ok;
  }
  private settle(token?: string) {
    if (!this.shop) return;
    const r = this.shop.settle(token);
    if (!r.ok && r.confirmation?.kind === 'quest-sale') { this.openDialog({ kind: 'sale', token: r.confirmation.token, warnings: r.confirmation.warnings }); this.host.sound('open'); return; }
    if (this.dialog?.kind === 'sale') { this.dialog = null; this.renderDialog(); }
    if (this.result(r, 'coins')) this.toast('交易完成，物资已存入仓库。', 'ok');
    this.selected = null; this.render();
  }
  /** Splits half of a stack into the first free cell of the same container. */
  private split() {
    const s = this.rt.snapshot(), sel = this.selected, src = sel?.src as Source | undefined, item = src ? s.profile[src]?.items.find(i => i.uid === sel!.uid) : null;
    if (!item || !src || item.qty < 2) return;
    const qty = Math.floor(item.qty / 2), inv = s.profile[src];
    for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++)
      if (!this.rt.placementError(src, src, item.uid, x, y, !!item.rotated, qty)) { this.result(this.rt.split(src, item.uid, qty, x, y, !!item.rotated), 'drop'); this.render(); return; }
    this.toast('没有空格放拆出来的那一份。', 'error'); this.host.sound('error');
  }
  private async importFile(file: File) {
    const text = await file.text().catch(() => '');
    const preview = text ? this.rt.previewImport(text) : { ok: false as const, reason: 'rule' as const, message: '无法读取这个文件。' };
    if (!preview.ok || !preview.token) { this.result(preview); return; }
    this.openDialog({ kind: 'import', text, token: preview.token, name: file.name });
  }

  private click = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-alarm]')) { this.showStorage(); return; }
    if (t.closest('[data-tabs]')) { this.host.tabs(); return; }
    const quick = t.closest<HTMLElement>('[data-quick]');
    if (quick) { this.quickOpen(quick.dataset.quick as PanelKind); return; }
    if (t.closest('[data-quickmenu]')) { this.setMenu(!this.menuOpen); return; }
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) { if (tab.dataset.tab !== this.kind) this.switchTo(tab.dataset.tab as PanelKind); else this.root.querySelector('.ptabs')?.classList.remove('open'); return; }
    if (t.closest('[data-tabmenu]')) { this.root.querySelector('.ptabs')?.classList.toggle('open'); return; }
    const b = t.closest<HTMLElement>('[data-act]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    const [act, a1, a2] = b.dataset.act!.split(':');
    const src = this.selected?.src as Source | undefined, uid = this.selected?.uid;
    switch (act) {
      case 'close': if (b.closest('.dialog')) this.closeDialog(); else this.close(); break;
      case 'pane': this.paneB = a1 as 'stash' | 'safe'; this.selected = null; this.render(); break;
      case 'mode': this.shopMode = a1 as 'buy' | 'sell'; this.selected = null; this.render(); break;
      case 'equip': if (src && uid) { this.result(this.rt.equip(src, uid), 'drop'); this.selected = null; this.render(); } break;
      case 'unequip': this.result(this.rt.unequip(), 'drop'); this.render(); break;
      case 'charm-equip': if (src && uid) { this.result(this.rt.equipCharm(src, uid), 'drop'); this.selected = null; this.render(); } break;
      case 'charm-unequip': this.result(this.rt.unequipCharm(), 'drop'); this.render(); break;
      case 'use': if (src && uid) { const name = D.ITEMS[this.findSelected(this.rt.snapshot())?.id ?? '']?.name; if (this.result(this.rt.useSupply(src, uid))) this.toast(`已使用${name ?? '补给'}。`, 'ok'); this.selected = null; this.render(); } break;
      case 'secure': if (src && uid) { this.result(this.rt.secure(src, uid), 'drop'); this.selected = null; this.render(); } break;
      case 'split': this.split(); break;
      case 'quick': if (src && uid) { this.result(this.rt.quickMove(src, uid), 'drop'); this.selected = null; this.render(); } break;
      case 'rotate': if (src) { const it = this.findSelected(this.rt.snapshot()); if (it) { const r = this.rt.move(src, src, it.uid, it.x, it.y, !it.rotated); this.result(r.ok || r.reason !== 'space' ? r : { ok: false, reason: 'space', message: '原位旋转放不下，拖动时按 R 换个位置。' }, 'drop'); this.render(); } } break;
      case 'upgrade': this.result(this.rt.upgradeStash(), 'build'); this.render(); break;
      case 'relief': this.result(this.rt.claimRelief()); this.render(); break;
      case 'cart-reset': this.shop?.reset(); this.selected = null; this.host.sound('close'); this.render(); break;
      case 'cart-settle': this.settle(); break;
      case 'sale-confirm': if (this.dialog?.kind === 'sale') this.settle(this.dialog.token); break;
      case 'quest': this.result(this.rt.submitQuest(a1), 'deliver'); this.render(); break;
      case 'build': this.result(this.rt.build(a1 as Facility), 'build'); this.render(); break;
      case 'enqueue': this.result(this.rt.enqueue(a1 as Recipe)); this.render(); break;
      case 'cancel': this.result(this.rt.cancel(a1)); this.render(); break;
      case 'claim': this.result(this.rt.claim(a1, a2 as Source), 'drop'); this.render(); break;
      case 'practice': this.result(this.rt.selectPractice(a1 as Attribute)); this.render(); break;
      case 'deploy': this.host.deploy(this.world, this.seed); break;
      case 'help': this.show('help'); break;
      case 'tabs': this.host.tabs(); break;
      case 'title': this.host.title(); break;
      case 'export': this.host.exportSave(); break;
      case 'import': this.root.querySelector<HTMLInputElement>('#backup-file')?.click(); break;
      case 'import-confirm': if (this.dialog?.kind === 'import') { const d = this.dialog; const r = this.rt.importBackup(d.text, d.token); this.dialog = null; this.renderDialog(); if (this.result(r)) { this.toast('备份已导入。', 'ok'); this.host.imported(); } } break;
      case 'retry-save': { const r = this.rt.retrySave(); if (r.ok) { this.toast('已重新保存。', 'ok'); this.host.sound('ok'); this.dialog = null; this.renderDialog(); if (!this.kind) this.host.panelChanged(null, null); } else { this.toast(r.message, 'error'); this.host.sound('error'); this.renderDialog(); } break; }
      case 'reload': location.reload(); break;
      case 'fac': { this.facility = a1 as Facility; this.station = STATIONS.find(q => q.facility === a1) ?? this.station; this.render(); this.host.panelChanged(this.kind, this.station); break; }
    }
  };
  private input = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'world') { this.world = t.value as RunWorld; this.render(); }
    else if (t.id === 'seed') this.seed = t.value;
    else if (t.id === 'vol') {
      this.volume = Number(t.value); const l = this.root.querySelector('#volv'); if (l) l.textContent = `${Math.round(this.volume * 100)}%`;
      // The slider previews while dragging; the setting is written once when it is released.
      if (e.type === 'change') this.host.volume(this.volume);
    } else if (t.id === 'backup-file' && e.type === 'change' && t.files?.[0]) { const f = t.files[0]; t.value = ''; void this.importFile(f); }
  };
  quickOpen(kind: PanelKind) {
    if (this.dialog) return;
    if (this.kind === kind) { this.close(); return; }
    this.switchTo(kind);
  }
  /** Open a function directly (shortcut bar, panel tabs, digit keys); a dirty shop cart still has to be settled first. */
  switchTo(kind: PanelKind) {
    const st = kind === 'facility' ? STATIONS.find(s => s.facility === this.facility) ?? null : STATIONS.find(s => s.panel === kind) ?? null;
    this.setMenu(false);
    this.show(kind, st, kind === 'facility' ? this.facility : undefined);
  }
  get worldChoice() { return { world: this.world, seed: this.seed }; }

  // ---------- HUD, tags, prompt, bubbles, toasts ----------
  updateHud(s: HideoutSnapshot) {
    (this.root.querySelector('#hud-sub') as HTMLElement).textContent = `第 ${s.day} 天 · ${s.power === 'restored' ? '供电正常' : '应急供电'}`;
    this.hud.classList.toggle('dark', s.power !== 'restored');
    (this.root.querySelector('#hud-cash') as HTMLElement).textContent = `¥ ${s.profile.cash.toLocaleString()}`;
    const q = s.base.queue[0], prod = s.base.completed.length ? `工作台 · ${s.base.completed.length} 批成品可领取` : q ? `工作台 · ${D.ITEMS[q.recipe].name} 剩余 ${Math.ceil(q.remaining / 60)} 分` : '';
    (this.root.querySelector('#hud-prod') as HTMLElement).textContent = prod;
    this.syncStorage(s);
  }
  updateTags(pos: (s: Station) => { x: number; y: number; visible: boolean }, focus: StationId | null, hideAll: boolean) {
    for (const s of STATIONS) {
      const el = this.tagEls.get(s.id)!, p = pos(s);
      const show = !hideAll && p.visible;
      el.hidden = !show; if (!show) continue;
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      el.classList.toggle('focus', s.id === focus);
    }
  }
  /** Destination sign over a side door ("电台 →"). */
  setDoorTag(text: string | null, at: { x: number; y: number } | null) {
    const el = this.root.querySelector<HTMLElement>('.doortag')!;
    el.hidden = !text || !at || this.open;
    if (el.hidden) return;
    if (el.textContent !== text) el.textContent = text;
    el.style.transform = `translate(${Math.round(at!.x)}px, ${Math.round(at!.y)}px) translate(-50%, -100%)`;
  }
  setPrompt(text: string | null) { this.prompt.hidden = !text; if (text && this.prompt.innerHTML !== text) this.prompt.innerHTML = text; }
  bubble(id: string, text: string, at: { x: number; y: number }) {
    let el = this.bubbles.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; el.dataset.id = id; this.bubbles.appendChild(el); }
    el.textContent = text; el.dataset.t = String(performance.now());
    el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
  }
  moveBubble(id: string, at: { x: number; y: number } | null) {
    const el = this.bubbles.querySelector<HTMLElement>(`[data-id="${id}"]`); if (!el) return;
    if (!at || performance.now() - Number(el.dataset.t) > 4200) { el.remove(); return; }
    el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
  }
  clearBubbles() { this.bubbles.innerHTML = ''; }
  toast(text: string, tone: 'ok' | 'error' | 'info' = 'info') {
    const el = document.createElement('div'); el.className = `toast ${tone}`; el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    const a = window.setTimeout(() => { el.classList.add('out'); this.timers.delete(a); }, 2600), b = window.setTimeout(() => { el.remove(); this.timers.delete(b); }, 3100);
    this.timers.add(a); this.timers.add(b);
  }
  /** Hidden during the gate and power-on sequences: no shortcuts, no HUD and no interact button. */
  setQuickVisible(v: boolean) { this.quick.hidden = !v; this.hud.hidden = !v; this.root.classList.toggle('busy', !v); if (!v) this.setMenu(false); }
  /**
   * The folded shortcut menu on narrow screens (OPUS-STATION-INPUT-01). While it is open it is the only thing on the
   * right edge: the interact button, joystick and prompt step aside, so a finger on a menu entry always lands on it.
   */
  get menuOpen() { return this.quick.classList.contains('open'); }
  setMenu(open: boolean) {
    this.quick.classList.toggle('open', open);
    this.root.classList.toggle('menu-open', open);
    this.quick.querySelector('[data-quickmenu]')!.setAttribute('aria-expanded', String(open));
  }
  setTouch(on: boolean) { this.touch = on; this.root.classList.toggle('touch', on); }
}

const facilityPlace: Record<Facility, string> = { rest: '宿舍', medical: '卫生所里间', training: '院子 · 育苗池边', workbench: '加工间', blackmarket: '码头' };
