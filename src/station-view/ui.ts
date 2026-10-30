import * as D from '../domain';
import type { Attribute, Facility, HideoutRuntime, HideoutSnapshot, Merchant, Recipe, Result, RunWorld, ShopSession, ShopSource, Source } from '../hideout-runtime/contract';
import type { Scope } from '../view-lifecycle/scope';
import { CART_W, CATALOG_W, firstShopCell, questUses } from '../shop';
import { STATIONS, type Station, type StationId } from './layout';
import { GridDrag, type DragHooks } from './grid';
import { esc } from '../html';
import * as P from './panels';
import { confirmImport, readResetCopy, startOver } from '../fresh-start';
import { deploymentRegion, deploymentWorld, type CountyArt } from './deploy-map';
import { morph } from './morph';
import { PERK_UI, choicePreview, critContext, defaultPerkAttribute, perkDone, perkFailure, perkPendingName, perkRetried, resetPreview, type PerkPreviewView } from '../perk-copy';
import { Workbench } from '../gunsmith-view/bench';
import { benchGuns } from '../gunsmith/bench';

export type PanelKind = 'gear' | 'arms' | 'med' | 'radio' | 'generator' | 'deploy' | 'facility' | 'board' | 'chat' | 'body' | 'menu' | 'help' | 'report' | 'gunsmith';
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
}
/** A confirmation or failure dialog drawn over the open panel. */
type Dialog =
  | { kind: 'sale'; token: string; warnings: string[] }
  // No preview token is kept: base checkpoints stale it while the dialog is open, so confirming previews again (confirmImport).
  | { kind: 'import'; text: string; name: string }
  | { kind: 'reset' }
  | { kind: 'storage' }
  // A perk preview keeps its token: base checkpoints do not stale it (HideoutRuntime.previewPerk). `from` refocuses the card.
  | { kind: 'perk'; id: string; token: string; view: PerkPreviewView; from: string }
  | { kind: 'perk-reset'; attribute: Attribute; token: string; view: PerkPreviewView; from: string };

const WIDE: PanelKind[] = ['gear', 'arms', 'med'];
const CENTER: PanelKind[] = ['report', 'menu', 'help', 'gunsmith'];
/** Grid columns across a desktop panel: bag and stash; the shop's goods, cart and stash. */
const GEAR_COLS = 6 + D.STASH_W, SHOP_COLS = CATALOG_W + CART_W + D.STASH_W;
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
  board: ['寻人板', '食堂门口'], chat: ['食堂', '炊事员'], report: ['行动报告', ''], gunsmith: ['改枪工作台', '选好配件，按「确认」才会改到枪上'],
};
const DIALOG_TITLES: Record<Dialog['kind'], string> = { sale: '确认出售', import: '导入存档', reset: '清空存档', storage: '存档没有写入', perk: PERK_UI.choiceDialog, 'perk-reset': PERK_UI.resetDialog };
/** Browser storage for the pre-reset copy; even reading the localStorage property can throw. */
const browserStorage = () => localStorage;
const smooth = (): ScrollBehavior => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
/** The county map's light and lock glide between picks on these; without CSS.registerProperty they jump instead. */
function registerMapFocus() {
  for (const name of ['--map-x', '--map-y']) {
    try { CSS.registerProperty({ name, syntax: '<number>', inherits: true, initialValue: '50' }); } catch { /* registered by an earlier yard */ }
  }
}

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
  /** The gunsmith workbench while it is open (#28 M2-05), and the panel it was opened from, which it returns to. */
  private bench: Workbench | null = null;
  private benchFrom: { kind: PanelKind; station: Station | null; facility: Facility } | null = null;
  private world: RunWorld = 'buildings'; private seed = ''; private worlds: readonly RunWorld[];
  private regionPreview: string | null = null;
  private countyArt: CountyArt['regions'];
  private dialog: Dialog | null = null;
  /** The body panel's perk attribute; chosen on first paint (the first with a node to choose). */
  private perkAttr: Attribute | null = null;
  /** A perk change whose write failed and waits for the retry (its name for the storage dialog), or ''. */
  private perkPending = '';
  summary: D.RunSummary | null = null;
  private drag: GridDrag;
  private lastSnapshotRev = -1;
  touch = false;
  volume = .35;
  private tagEls = new Map<StationId, HTMLElement>();
  private timers = new Set<number>();

  constructor(parent: HTMLElement, shadow: ShadowRoot, private rt: HideoutRuntime, private host: UIHost, scope: Scope, opts: { world: RunWorld; seed: string; worlds: readonly RunWorld[]; countyArt: CountyArt }) {
    this.countyArt = opts.countyArt.regions;
    this.worlds = opts.worlds; this.world = opts.worlds.includes(opts.world) ? opts.world : opts.worlds[0]; this.seed = opts.seed;
    this.root = document.createElement('div'); this.root.className = 'ui'; parent.appendChild(this.root);
    // The county map paints its terrain from this one property, so its HTML never repeats the data URL.
    this.root.style.setProperty('--county-terrain', `url("${opts.countyArt.terrain}")`);
    registerMapFocus();
    this.root.innerHTML = `<div class="tags"></div><div class="bubbles"></div>
      <header class="hud"><div class="id"><i class="sig"></i><div><b>滨科夫水产站</b><span id="hud-sub"></span></div></div><div class="cash"><span>可用现金</span><b id="hud-cash"></b><small id="hud-prod"></small></div></header>
      <button class="alarm" data-alarm hidden>存档没有写入 · 点这里处理</button>
      <div class="prompt" hidden></div><div class="doortag" hidden></div><div class="toasts" role="status"></div>
      <nav class="quick"><button class="qmore" data-quickmenu aria-expanded="false"><span>功能</span></button>${SHORTCUTS.map(q => `<button data-quick="${q.kind}"><span>${q.label}</span><kbd>${q.key}</kbd></button>`).join('')}<button data-tabs title="旧版页签界面（备用入口）"><span>页签</span><kbd>0</kbd></button><button data-quick="menu"><span>菜单</span><kbd>Esc</kbd></button></nav>
      <section class="panel" hidden aria-live="polite"></section><section class="modal" hidden></section><section class="modal dialog" hidden role="dialog" aria-modal="true"></section>
      <button class="touch-act" aria-label="交互">交互</button><div class="joy"><i></i></div>
      <input id="backup-file" type="file" accept=".json,application/json" hidden>`;
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
    this.panel = q('.panel'); this.modal = q('.modal:not(.dialog)'); this.dialogEl = q('.dialog'); this.hud = q('.hud'); this.tags = q('.tags'); this.toasts = q('.toasts'); this.prompt = q('.prompt'); this.bubbles = q('.bubbles'); this.quick = q('.quick'); this.alarm = q('[data-alarm]');
    for (const s of STATIONS) {
      const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<b>${esc(s.who ?? s.name)}</b>${s.who ? `<span>${esc(s.name)}</span>` : ''}`;
      this.tags.appendChild(el); this.tagEls.set(s.id, el);
    }
    scope.on(this.root, 'click', this.click);
    // The workbench's rename field: Enter clicks its save button; the form itself never submits.
    scope.on(this.root, 'submit', (e: Event) => e.preventDefault());
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
    if (this.kind === 'gunsmith' && kind !== 'gunsmith' && this.bench && !this.bench.requestClose()) { this.render(); return; }
    if (kind !== 'gunsmith') { this.bench?.dispose(); this.bench = null; this.benchFrom = null; }
    const was = this.kind;
    // The panel is painted anew: a drag from the old grids ends here instead of waiting for a release.
    this.drag.cancel();
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
    if (this.kind === 'gunsmith' && this.bench) {
      // Esc closes the bench's own sheet or answers its question with "stay"; a waiting preview asks before it closes.
      if (this.bench.dismiss()) { this.render(); return; }
      if (!this.bench.requestClose()) { this.host.sound('error'); this.render(); return; }
      this.closeBench(); return;
    }
    if ((this.kind === 'arms' || this.kind === 'med') && this.shop?.view().dirty) { this.toast('待买或待卖区还有物品，先结算或清空。', 'error'); this.host.sound('error'); return; }
    this.drag.cancel();
    this.kind = null; this.station = null; this.shop = null; this.selected = null;
    this.panel.hidden = true; this.modal.hidden = true; this.panel.innerHTML = ''; this.modal.innerHTML = '';
    this.root.classList.remove('has-panel', 'has-modal');
    this.host.sound('close');
    this.host.panelChanged(null, null);
  }
  /** Open the workbench on gun `uid` (the first gun at the base without one), from wherever the player is. */
  openBench(uid?: string) {
    if (this.dialog) return;
    const gun = uid ?? benchGuns(this.rt.snapshot().profile)[0]?.uid;
    if (!gun) { this.toast('基地里没有枪械。先在修理铺买一把，或带回行动里找到的枪。', 'error'); this.host.sound('error'); return; }
    const from = this.kind && this.kind !== 'gunsmith' ? { kind: this.kind, station: this.station, facility: this.facility } : this.benchFrom;
    this.show('gunsmith', STATIONS.find(s => s.id === 'workbench') ?? null);
    if (this.kind !== 'gunsmith') return;
    this.benchFrom = from;
    this.bench = new Workbench(this.rt, gun, { toast: (t, tone) => this.toast(t, tone), sound: c => this.host.sound(c), storage: () => this.showStorage() });
    this.render();
  }
  /** The bench closed with nothing waiting: back to the panel it came from, else to the yard. */
  private closeBench() {
    const from = this.benchFrom;
    this.bench?.dispose(); this.bench = null; this.benchFrom = null;
    if (from) { this.show(from.kind, from.station, from.kind === 'facility' ? from.facility : undefined); return; }
    this.kind = null; this.station = null; this.selected = null;
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
    const s = this.rt.snapshot(), rows = D.stashShownRows(s.profile.stash), H = innerHeight, Wd = innerWidth;
    if (this.compact) {
      // Landscape: two containers side by side (16 columns for gear, 14 for shops); portrait: stacked, 10 columns wide.
      // Height fits the first container (5 rows); the second one scrolls when it is taller.
      const portrait = H > Wd, cols = portrait ? 10 : kind === 'gear' ? 16 : 14;
      const byW = (Wd - (portrait ? 34 : 60)) / cols, byH = portrait ? 99 : (H - (kind === 'gear' ? 178 : 168)) / 5;
      return Math.max(36, Math.min(56, Math.floor(Math.min(byW, byH))));
    }
    if (kind === 'gear') {
      // Left: slot, three headings and the weight meter (~224 px) around bag (5 rows) and safe (2 rows); right: stash, upgrade and details (~180 px).
      const byH = Math.min((H - 164 - 326) / 7, (H - 164 - 254) / rows), byW = (Math.min(Wd - 24, Wd * .74) - 70) / GEAR_COLS;
      // Below 36 px, three-character labels such as 保险管 no longer fit after the new gear actions.
      // Keep labels readable and allow the existing vertical scroll on exceptionally short desktop panels.
      return Math.max(36, Math.min(56, Math.floor(Math.min(byH, byW))));
    }
    const byH = Math.min((H - 331 - 70) / 6, (H - 331) / rows), byW = (Math.min(Wd - 24, Wd * .76) - 74) / SHOP_COLS;
    // Not below 36 px either (three-character labels); a stash taller than that leaves scrolls in its box (fitStash).
    return Math.max(36, Math.min(56, Math.floor(Math.min(byH, byW))));
  }

  render() {
    this.renderDialog();
    const kind = this.kind; if (!kind) return;
    const s = this.rt.snapshot(); this.lastSnapshotRev = s.rev;
    const center = CENTER.includes(kind), el = center ? this.modal : this.panel;
    const [title, sub] = kind === 'facility' ? [this.rt.facility(this.facility).name, facilityPlace[this.facility]] : TITLES[kind] ?? ['', ''];
    const line = this.station ? this.host.lineFor(this.station.id) : '';
    let cell = this.cellFor(kind);
    const stashTop = el.querySelector('.stash-scroll')?.scrollTop ?? 0;
    // Desktop panels must fit without scrolling: if the first paint overflows (a quote line, an upgraded stash), the
    // cell shrinks by the overflow spread over the tallest column and the panel is painted again (at most twice).
    for (let pass = 0; ; pass++) {
      this.paint(kind, s, cell, center, el, title, sub, line);
      const pb = el.querySelector<HTMLElement>('.pbody')!, over = pb.scrollHeight - pb.clientHeight;
      // Gear details may scroll vertically; keep inventory geometry fixed while a first click selects an item,
      // otherwise the second click of a double click can land outside that item after the panel resizes.
      if (kind === 'gear' || over <= 1 || this.compact || !WIDE.includes(kind) || cell <= 36 || pass >= 2) break;
      cell = Math.max(36, cell - Math.ceil(over / Math.max(6, D.stashShownRows(s.profile.stash))));
    }
    if (!this.compact && WIDE.includes(kind)) this.fitStash(el, cell, stashTop);
  }
  /**
   * A desktop panel still too tall at the smallest readable cell (a built-out stash at 1280x720, the overflow of #28
   * M3-12): the stash scrolls in its own box, at least four rows tall, and the panel keeps its place. Measured as if
   * nothing were selected (the empty details box, last measured when nothing was), so a click never resizes the stash;
   * a taller details box may still scroll the panel, as before. In the gear panel only the stash column counts.
   */
  private detailsEmpty = 0;
  private fitStash(el: HTMLElement, cell: number, top: number) {
    const pb = el.querySelector<HTMLElement>('.pbody'), box = el.querySelector<HTMLElement>('.stash-scroll');
    if (!pb || !box) return;
    const details = pb.querySelector<HTMLElement>('aside.details');
    if (details?.classList.contains('empty')) this.detailsEmpty = details.offsetHeight;
    const grown = details && this.detailsEmpty ? Math.max(0, details.offsetHeight - this.detailsEmpty) : 0;
    const col = box.closest<HTMLElement>('.gear .col'), limit = pb.getBoundingClientRect().top + pb.clientHeight - parseFloat(getComputedStyle(pb).paddingBottom);
    const over = (col ? col.getBoundingClientRect().bottom - limit : pb.scrollHeight - pb.clientHeight) - grown;
    if (over <= 1) return;
    box.style.maxHeight = `${Math.max(cell * 4, Math.floor(box.clientHeight - over))}px`; box.classList.add('scrolls');
    box.scrollTop = top;
  }
  private paint(kind: PanelKind, s: HideoutSnapshot, cell: number, center: boolean, el: HTMLElement, title: string, sub: string, line: string) {
    let body = '';
    const sel = this.selected?.uid ?? null;
    switch (kind) {
      case 'gear': {
        const item = this.findSelected(s), details = P.detailsHtml(item, this.selected?.src ?? null, 'gear', [], s.profile);
        body = this.compact ? P.gearCompactHtml(s, cell, sel, this.rt.departure(), this.paneB, details) : P.gearHtml(s, cell, sel, this.rt.departure(), details); break;
      }
      case 'arms': case 'med': {
        const v = this.shop!.view(); const item = this.selected ? (v[this.selected.src === 'merchant' ? 'catalog' : this.selected.src as 'buy' | 'sell' | 'stash'].items.find(i => i.uid === this.selected!.uid) ?? null) : null;
        // Sellable stacks still in the bag or safe: this shop sells from the stash only, so its header says so.
        const outside = [s.profile.bag, s.profile.safe].reduce((n, inv) => n + inv.items.filter(i => !i.relief && (D.ITEMS[i.id]?.sell ?? 0) > 0).length, 0);
        body = this.compact ? P.shopCompactHtml(v, cell, this.selected, s.profile.cash, this.shopMode, outside) : P.shopHtml(v, cell, sel, s.profile.cash, outside) + P.detailsHtml(item, this.selected?.src ?? null, 'shop', item ? questUses(s.profile, item.id) : [], s.profile); break;
      }
      case 'radio': body = P.questsHtml(s); break;
      case 'generator': body = P.generatorHtml(s); break;
      case 'deploy': body = P.deployHtml(s, this.rt.departure(), this.world, this.seed, this.worlds, this.regionPreview, this.countyArt, innerWidth < 600); break;
      case 'facility': body = (this.facility === 'workbench' ? P.benchEntryHtml() : '') + `<nav class="seg facs">${FACILITY_ORDER.map(f => P.btn(`${FACILITY_LABEL[f]}${s.base.facilities[f] ? ` <small>${s.base.facilities[f]} 级</small>` : ''}`, `fac:${f}`, f === this.facility ? 'on' : '')).join('')}</nav>` + P.facilityHtml(this.rt.facility(this.facility), s, this.rt.trainingProgress()); break;
      case 'body': { const board = this.rt.perkBoard(); this.perkAttr ??= defaultPerkAttribute(board); body = P.bodyHtml(s, board, this.perkAttr); break; }
      case 'board': body = P.boardHtml(); break;
      case 'chat': body = `<p class="muted">长桌上摆着碗。灶上那锅粥一直温着，谁回来谁盛。</p>`; break;
      case 'menu': body = P.menuHtml(this.volume, readResetCopy(browserStorage) !== null); break;
      case 'help': body = P.helpHtml(this.touch); break;
      case 'report': body = this.summary ? P.reportHtml(this.summary, s) : ''; break;
      case 'gunsmith': body = this.bench?.html({ compact: this.compact }) ?? ''; break;
    }
    const scroll = el.querySelector('.pbody')?.scrollTop ?? 0;
    el.className = `${center ? 'modal' : 'panel'} k-${kind}${WIDE.includes(kind) ? ' wide' : ''}${this.compact ? ' compact' : ''}${innerHeight > innerWidth ? ' portrait' : ''}`;
    el.style.width = WIDE.includes(kind) && !this.compact ? `${Math.min(innerWidth - 24, (kind === 'gear' ? GEAR_COLS * cell + 70 : SHOP_COLS * cell + 74))}px` : '';
    const cash = ['gear', 'arms', 'med', 'facility', 'deploy', 'radio', 'generator', 'gunsmith'].includes(kind) ? `<span class="pcash">现金 <b>¥ ${s.profile.cash.toLocaleString()}</b></span>` : '';
    const tabbed = SHORTCUTS.some(q => q.kind === kind) || kind === 'generator';
    const tabs = tabbed ? `<nav class="ptabs" aria-label="水产站功能">${SHORTCUTS.map(q => `<button data-tab="${q.kind}" class="${q.kind === kind ? 'on' : ''}" ${q.kind === kind ? 'aria-current="page"' : ''}>${q.label}<kbd>${q.key}</kbd></button>`).join('')}</nav>` : '';
    const heading = this.compact && tabbed ? `<button class="tabmenu" data-tabmenu aria-label="切换功能"><h2>${esc(title)}</h2><i class="caret" aria-hidden="true"></i></button>` : `<h2>${esc(title)}</h2>`;
    // Repaints (five-second checkpoints, events) keep the keyboard on the same control, e.g. a perk card.
    const active = (this.root.getRootNode() as ShadowRoot).activeElement as HTMLElement | null, focused = active && el.contains(active) ? active.dataset.act : undefined;
    // The workbench keeps the keyboard on its control and its lists where they were scrolled.
    const gsFocus = active && el.contains(active) && active.dataset.gs ? `[data-gs="${active.dataset.gs}"]${active.dataset.arg !== undefined ? `[data-arg="${CSS.escape(active.dataset.arg)}"]` : ':not([data-arg])'}` : null;
    const kept = ['.gs-list', '.gs-mid', '.gs-guns'].map(q => [q, el.querySelector(q)?.scrollTop ?? 0] as const);
    const html = `<header class="phead"><div>${heading}${sub ? `<small>${esc(sub)}</small>` : ''}</div>${cash}${kind === 'gear' && !this.compact ? P.gearActions(s.profile, false) : ''}${P.btn('关闭 <kbd>Esc</kbd>', 'close', 'x')}</header>${tabs}${line ? `<p class="line">“${esc(line)}”</p>` : ''}<div class="pbody">${body}</div>`;
    // The deploy map is patched in place, so its light, lock and route animate between picks instead of restarting.
    if (kind === 'deploy' && el.querySelector(':scope > .pbody > .county-deploy')) morph(el, html); else el.innerHTML = html;
    el.querySelector('.pbody')!.scrollTop = scroll;
    for (const [q, top] of kept) { const k = el.querySelector(q); if (k) k.scrollTop = top; }
    el.hidden = false;
    if (focused) el.querySelector<HTMLElement>(`[data-act="${focused}"]`)?.focus({ preventScroll: true });
    if (gsFocus) el.querySelector<HTMLElement>(gsFocus)?.focus({ preventScroll: true });
    const once = kind === 'gunsmith' ? this.bench?.focusOnce() : null;
    if (once) el.querySelector<HTMLInputElement>(once)?.select();
    (center ? this.panel : this.modal).hidden = true;
    this.root.classList.toggle('has-panel', !center); this.root.classList.toggle('has-modal', center);
  }
  private renderDialog() {
    const d = this.dialog;
    this.dialogEl.hidden = !d; this.root.classList.toggle('has-dialog', !!d);
    if (!d) { this.dialogEl.innerHTML = ''; return; }
    const s = this.rt.snapshot();
    const body = d.kind === 'sale' ? P.saleConfirmHtml(d.warnings) : d.kind === 'import' ? P.importConfirmHtml(d.name) : d.kind === 'reset' ? P.resetConfirmHtml()
      : d.kind === 'perk' || d.kind === 'perk-reset' ? P.perkConfirmHtml(d.view, d.kind === 'perk-reset') : P.storageHtml(s, this.perkPending);
    this.dialogEl.className = `modal dialog k-${d.kind}`;
    const title = d.kind === 'storage' && s.storage.conflict ? '存档已被另一个窗口接管' : d.kind === 'storage' && s.storage.reloadRequired ? '进度已保存' : DIALOG_TITLES[d.kind];
    this.dialogEl.setAttribute('aria-label', title);
    // Panel refreshes (five-second checkpoints) paint the dialog again: keep the keyboard on the same button.
    const buttons = () => Array.from(this.dialogEl.querySelectorAll<HTMLElement>('button'));
    const focused = buttons().indexOf((this.root.getRootNode() as ShadowRoot).activeElement as HTMLElement);
    this.dialogEl.innerHTML = `<header class="phead"><div><h2>${title}</h2></div>${P.btn('关闭 <kbd>Esc</kbd>', 'close', 'x')}</header><div class="pbody">${body}</div>`;
    if (focused >= 0) buttons()[focused]?.focus({ preventScroll: true });
  }
  /** A dialog (a failed write too) ends a drag at once: the grids under it take no drop until it closes. */
  private openDialog(d: Dialog) { const was = this.open; this.drag.cancel(); this.dialog = d; this.renderDialog(); if (!was) this.host.panelChanged(this.kind, this.station); }
  private closeDialog() {
    const from = this.dialog && 'from' in this.dialog ? this.dialog.from : null;
    this.dialog = null; this.renderDialog(); this.host.sound('close'); if (!this.kind) this.host.panelChanged(null, null);
    // A cancelled perk preview hands the keyboard back to the card or reset button it came from.
    if (from) this.panel.querySelector<HTMLElement>(`[data-act="${from}"]`)?.focus({ preventScroll: true });
  }
  /** The storage dialog follows the Runtime: it opens when a write fails and closes once a retry succeeded. */
  syncStorage(s: HideoutSnapshot) {
    const broken = !s.storage.ok || s.storage.conflict;
    if (!broken && !s.storage.pendingBase) this.perkPending = '';
    this.alarm.hidden = !broken || this.dialog?.kind === 'storage';
    if (broken) this.alarm.textContent = s.storage.conflict ? '存档已被另一个窗口接管 · 点这里处理' : s.storage.reloadRequired ? '进度已保存，页面恢复失败 · 点这里处理' : '存档没有写入 · 点这里处理';
    if (!broken && this.dialog?.kind === 'storage') { this.dialog = null; this.renderDialog(); if (!this.kind) this.host.panelChanged(null, null); }
  }
  showStorage() { this.openDialog({ kind: 'storage' }); this.alarm.hidden = true; }
  /** Re-render when the runtime committed something (production ticks refresh the facility panel too). */
  refresh(force = false) {
    // Never rebuild under the pointer or the caret: a drag, a typed seed or a held volume slider would be lost.
    const focused = (this.root.getRootNode() as ShadowRoot).activeElement;
    if (this.dragging || focused?.tagName === 'INPUT') return;
    if (this.dialog?.kind === 'storage') this.renderDialog();
    if (!this.kind) return;
    const s = this.rt.snapshot(); if (!force && s.rev === this.lastSnapshotRev && this.kind !== 'facility') return;
    // The phone tab menu (.ptabs.open) is only a class: kept through the repaint, or a five-second checkpoint (every
    // half second on 设施) folds it, and a tap already on a tab lands on the panel below.
    const tabsOpen = this.panel.querySelector('.ptabs.open') !== null;
    this.render();
    if (tabsOpen) this.panel.querySelector('.ptabs')?.classList.add('open');
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
      dropSlot: (slot, from, uid) => { if (slot === 'weapon') this.equip(from as Source, uid); },
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
          const at = firstShopCell(target.w, target.h, (x, y) => shop.placementError(src as ShopSource, to, uid, x, y));
          if ('x' in at) { const r = shop.place(src as ShopSource, to, uid, at.x, at.y); if (r.ok) this.host.sound('drop'); else this.toast(r.message, 'error'); this.render(); return; }
          // A rule (relief goods, a changed stash) names itself; otherwise only room was missing.
          this.toast(at.reason ?? (to === 'buy' || to === 'sell' ? '待买或待卖区放不下了。' : '仓库放不下。'), 'error'); this.host.sound('error');
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
  private equip(src: Source, uid: string) {
    const item = this.rt.snapshot().profile[src]?.items.find(i => i.uid === uid);
    this.selected = { src, uid };
    const r: Result = src === 'safe' ? { ok: false, reason: 'rule', message: '安全箱里的枪械请先移回背包，再装备主武器。' } : this.rt.equip(src, uid);
    if (this.result(r, 'drop')) { this.toast(`已装备主武器：${D.ITEMS[item?.id ?? '']?.name ?? '枪械'}。`, 'ok'); this.selected = null; }
    this.render();
  }
  private secure(src: Source, uid: string) {
    const before = this.rt.snapshot().profile, item = before[src].items.find(i => i.uid === uid);
    if (this.result(this.rt.secure(src, uid), 'drop')) {
      this.selected = null;
      if (src === 'safe' && item && D.isGun(item.id)) {
        // Automatic transfers allocate a fresh UID; select the newly created gun, not its former safe entry.
        const moved = this.rt.snapshot().profile.bag.items.find(i => i.id === item.id && !!i.relief === !!item.relief && !before.bag.items.some(old => old.uid === i.uid));
        if (moved) this.selected = { src: 'bag', uid: moved.uid };
      }
    }
    this.render();
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
      // A valid placement may merge into a stack; this automatic split specifically needs a new empty footprint.
      if (D.fits(inv, item.id, x, y, undefined, !!item.rotated) && !this.rt.placementError(src, src, item.uid, x, y, !!item.rotated, qty)) { this.result(this.rt.split(src, item.uid, qty, x, y, !!item.rotated), 'drop'); this.render(); return; }
    this.toast('没有空格放拆出来的那一份。', 'error'); this.host.sound('error');
  }
  private async importFile(file: File) {
    const text = await file.text().catch(() => '');
    const preview = text ? this.rt.previewImport(text) : { ok: false as const, reason: 'rule' as const, message: '无法读取这个文件。' };
    if (!preview.ok || !preview.token) { this.result(preview); return; }
    this.openDialog({ kind: 'import', text, name: file.name });
  }
  // ---------- perks (docs/CRITICAL-PERK-DESIGN.md section 5): the shared HideoutRuntime service, never the save itself ----------
  /** A card: the Runtime previews (or refuses) and nothing is written until the dialog's confirm. */
  private previewPerk(id: string) {
    if (this.dialog) return;
    const r = this.rt.previewPerk(id);
    if (!r.ok || !r.token || !r.preview) { this.perkRefused(r, 'choice'); return; }
    this.openPerkDialog({ kind: 'perk', id, token: r.token, view: choicePreview(r.preview, critContext(this.rt.snapshot(), this.rt.perkBoard())), from: `perk:${id}` });
  }
  private previewPerkReset(attribute: Attribute) {
    if (this.dialog) return;
    const r = this.rt.previewPerkReset(attribute);
    if (!r.ok || !r.token || !r.preview) { this.perkRefused(r, 'reset'); return; }
    this.openPerkDialog({ kind: 'perk-reset', attribute, token: r.token, view: resetPreview(r.preview, critContext(this.rt.snapshot(), this.rt.perkBoard())), from: `perk-reset:${attribute}` });
  }
  private openPerkDialog(d: Extract<Dialog, { kind: 'perk' | 'perk-reset' }>) {
    this.openDialog(d); this.host.sound('open');
    // The keyboard lands in the dialog (Enter cancels), never on the card under it.
    this.dialogEl.querySelector<HTMLElement>('.perk-cancel')?.focus({ preventScroll: true });
  }
  /** Success is shown only after the Runtime wrote the change; a failed write keeps it for the storage dialog's retry. */
  private confirmPerk() {
    const d = this.dialog; if (d?.kind !== 'perk' && d?.kind !== 'perk-reset') return;
    this.dialog = null; this.renderDialog();
    const kind = d.kind === 'perk' ? 'choice' : 'reset', subject = d.kind === 'perk' ? d.id : d.attribute, unsaved = !this.rt.snapshot().storage.ok;
    const r = d.kind === 'perk' ? this.rt.choosePerk(d.id, d.token) : this.rt.resetPerks(d.attribute, d.token);
    if (r.ok) { this.toast(perkDone(kind, subject), 'ok'); this.host.sound(kind === 'reset' ? 'coins' : 'ok'); }
    else {
      // With storage fine before, a storage answer means this change's own write failed: the Runtime keeps it for the
      // retry. Otherwise an earlier unsaved write refused it and nothing of it was kept.
      const kept = r.reason === 'storage' && !unsaved;
      if (kept) this.perkPending = perkPendingName(kind, subject);
      this.perkRefused(r, kind, kept);
    }
    this.render();
  }
  private perkRefused(r: Result, kind: 'choice' | 'reset', kept = false) {
    if (r.ok) return;
    this.toast(perkFailure(r.reason, kind, kept), 'error'); this.host.sound('error');
    if (r.reason === 'storage' || r.reason === 'conflict') this.showStorage();
  }
  /** Confirmed fresh start. A refused or failed write leaves the save as it was; success resyncs like an import. */
  private startOver() {
    this.dialog = null; this.renderDialog();
    const r = startOver(this.rt, browserStorage, Date.now(), () => this.host.exportSave());
    if (r.ok) {
      // A still pristine save is not copied (fresh-start.ts), so the toast must not claim a new local copy.
      const message = r.copied !== false ? '存档已清空，重新开始。'
        : readResetCopy(browserStorage) ? '存档已清空。当前存档没动过，本机保留的仍是之前清空前的存档。' : '存档已清空。当前存档没动过，本机没有另存。';
      this.toast(message, 'ok'); this.host.sound('ok'); this.host.imported(); this.render(); return;
    }
    this.toast(r.message, 'error'); this.host.sound('error');
    if (r.reason === 'conflict' || !this.rt.snapshot().storage.ok) this.showStorage();
  }
  /** The local pre-reset copy goes through the same preview and overwrite confirmation as an imported file. */
  private restoreCopy() {
    const copy = readResetCopy(browserStorage);
    if (!copy) { this.result({ ok: false, reason: 'rule', message: '本机没有清空前的存档。' }); this.render(); return; }
    const preview = this.rt.previewImport(copy);
    if (!preview.ok || !preview.token) { this.result(preview); return; }
    this.openDialog({ kind: 'import', text: copy, name: '清空前的存档' }); this.host.sound('open');
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
    const region = t.closest<HTMLElement>('[data-region]');
    if (region && this.kind === 'deploy' && !this.dialog) {
      this.regionPreview = region.dataset.region!; this.host.sound('pick'); this.render();
      this.root.querySelector<HTMLButtonElement>(`[data-region="${this.regionPreview}"]`)?.focus({ preventScroll: true });
      this.showRegionBrief(); return;
    }
    const gs = t.closest<HTMLElement>('[data-gs]');
    if (gs && this.bench && this.kind === 'gunsmith' && !this.dialog) {
      if ((gs as HTMLButtonElement).disabled) return;
      const value = gs.closest('[data-gs-form]')?.querySelector('input')?.value ?? '';
      if (this.bench.act(gs.dataset.gs!, gs.dataset.arg ?? '', value) === 'close') this.closeBench(); else this.render();
      return;
    }
    const b = t.closest<HTMLElement>('[data-act]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    const [act, a1, a2] = b.dataset.act!.split(':');
    const src = this.selected?.src as Source | undefined, uid = this.selected?.uid;
    switch (act) {
      case 'close': if (b.closest('.dialog')) this.closeDialog(); else this.close(); break;
      case 'pane': this.paneB = a1 as 'stash' | 'safe'; this.selected = null; this.render(); break;
      case 'mode': this.shopMode = a1 as 'buy' | 'sell'; this.selected = null; this.render(); break;
      case 'equip': if (src && uid) this.equip(src, uid); break;
      case 'gunsmith': this.openBench(a1 || uid); break;
      case 'unequip': this.result(this.rt.unequip(), 'drop'); this.render(); break;
      case 'charm-equip': if (src && uid) { this.result(this.rt.equipCharm(src, uid), 'drop'); this.selected = null; this.render(); } break;
      case 'charm-unequip': this.result(this.rt.unequipCharm(), 'drop'); this.render(); break;
      case 'use': if (src && uid) { const name = D.ITEMS[this.findSelected(this.rt.snapshot())?.id ?? '']?.name; if (this.result(this.rt.useSupply(src, uid))) this.toast(`已使用${name ?? '补给'}。`, 'ok'); this.selected = null; this.render(); } break;
      case 'secure': if (src && uid) this.secure(src, uid); break;
      case 'split': this.split(); break;
      case 'quick': if (src && uid) { this.result(this.rt.quickMove(src, uid), 'drop'); this.selected = null; this.render(); } break;
      case 'rotate': if (src) { const it = this.findSelected(this.rt.snapshot()); if (it) { const r = this.rt.move(src, src, it.uid, it.x, it.y, !it.rotated); this.result(r.ok || r.reason !== 'space' ? r : { ok: false, reason: 'space', message: '原位旋转放不下，拖动时按 R 换个位置。' }, 'drop'); this.render(); } } break;
      case 'upgrade': this.result(this.rt.upgradeStash(), 'build'); this.render(); break;
      case 'stash-all': if (this.result(this.rt.stashAll(), 'drop')) this.selected = null; this.render(); break;
      case 'sort-stash': if (this.result(this.rt.sortStash(), 'drop')) this.selected = null; this.render(); break;
      case 'relief': this.result(this.rt.claimRelief()); this.render(); break;
      case 'cart-reset': this.shop?.reset(); this.selected = null; this.host.sound('close'); this.render(); break;
      // The catalog's filter and pages (#28 M2-08): a new catalog, so nothing in it stays selected.
      case 'browse-kind': case 'browse-fits': case 'browse-page': {
        const b = this.shop?.view().browse; if (!b) break;
        this.shop!.browse(act === 'browse-kind' ? { kind: a1 as typeof b.kind, fits: b.fits, page: 0 } : act === 'browse-fits' ? { kind: b.kind, fits: !b.fits, page: 0 } : { kind: b.kind, fits: b.fits, page: Number(a1) });
        this.selected = null; this.host.sound('pick'); this.render(); break;
      }
      case 'cart-settle': this.settle(); break;
      case 'sale-confirm': if (this.dialog?.kind === 'sale') this.settle(this.dialog.token); break;
      case 'quest': this.result(this.rt.submitQuest(a1), 'deliver'); this.render(); break;
      case 'build': this.result(this.rt.build(a1 as Facility), 'build'); this.render(); break;
      case 'enqueue': this.result(this.rt.enqueue(a1 as Recipe)); this.render(); break;
      case 'premium': this.result(this.rt.craftPremium(a1), 'build'); this.render(); break;
      case 'cancel': this.result(this.rt.cancel(a1)); this.render(); break;
      case 'claim': this.result(this.rt.claim(a1, a2 as Source), 'drop'); this.render(); break;
      case 'practice': this.result(this.rt.selectPractice(a1 as Attribute)); this.render(); break;
      case 'perk-attr': this.perkAttr = a1 as Attribute; this.render(); break;
      case 'perk': this.previewPerk(a1); break;
      case 'perk-reset': this.previewPerkReset(a1 as Attribute); break;
      case 'perk-ok': this.confirmPerk(); break;
      case 'deploy': {
        const world = deploymentWorld(deploymentRegion(this.worlds, this.world, this.regionPreview), this.worlds);
        if (world) this.host.deploy(world, this.seed);
        break;
      }
      case 'county-map': this.root.querySelector('.county-heading')?.scrollIntoView({ block: 'start', behavior: smooth() }); break;
      case 'help': this.show('help'); break;
      case 'tabs': this.host.tabs(); break;
      case 'title': this.host.title(); break;
      case 'export': this.host.exportSave(); break;
      case 'import': this.root.querySelector<HTMLInputElement>('#backup-file')?.click(); break;
      case 'import-confirm': if (this.dialog?.kind === 'import') { const d = this.dialog; const r = confirmImport(this.rt, d.text); this.dialog = null; this.renderDialog(); if (this.result(r)) { this.toast('备份已导入。', 'ok'); this.host.imported(); } } break;
      case 'reset': this.openDialog({ kind: 'reset' }); this.host.sound('open'); break;
      case 'reset-confirm': if (this.dialog?.kind === 'reset') this.startOver(); break;
      case 'reset-restore': this.restoreCopy(); break;
      // The retry's own commit event syncs the storage state (clearing perkPending) before it returns.
      case 'retry-save': { const pending = this.perkPending, r = this.rt.retrySave(); if (r.ok) { this.toast(pending ? perkRetried(pending) : '已重新保存。', 'ok'); this.perkPending = ''; this.host.sound('ok'); this.dialog = null; this.renderDialog(); if (!this.kind) this.host.panelChanged(null, null); } else { this.toast(r.message, 'error'); this.host.sound('error'); this.renderDialog(); } break; }
      case 'reload': location.reload(); break;
      case 'fac': { this.facility = a1 as Facility; this.station = STATIONS.find(q => q.facility === a1) ?? this.station; this.render(); this.host.panelChanged(this.kind, this.station); break; }
    }
  };
  private input = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'world' && this.worlds.includes(t.value as RunWorld)) {
      this.world = t.value as RunWorld; this.regionPreview = null; this.render();
      this.root.querySelector<HTMLInputElement>(`input[name="world"][value="${this.world}"]`)?.focus({ preventScroll: true });
      this.showRegionBrief();
    }
    else if (t.id === 'seed') this.seed = t.value;
    else if (t.id === 'vol') {
      this.volume = Number(t.value); const l = this.root.querySelector('#volv'); if (l) l.textContent = `${Math.round(this.volume * 100)}%`;
      // The slider previews while dragging; the setting is written once when it is released.
      if (e.type === 'change') this.host.volume(this.volume);
    } else if (t.id === 'backup-file' && e.type === 'change' && t.files?.[0]) { const f = t.files[0]; t.value = ''; void this.importFile(f); }
  };
  /** Upright phones: a pick whose picture lies below the fold scrolls just far enough to show it (the map stays near). */
  private showRegionBrief() {
    if (innerWidth < 600) this.root.querySelector('.region-art')?.scrollIntoView({ block: 'nearest', behavior: smooth() });
  }
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
    (this.root.querySelector('#hud-sub') as HTMLElement).textContent = `累计出击 ${s.profile.stats.runs} 次 · ${s.power === 'restored' ? '供电正常' : '应急供电'}`;
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
