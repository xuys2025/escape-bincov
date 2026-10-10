import * as D from '../domain';
import { itemArt, itemArtSize } from './items';
import type { Scope } from '../coast-view/scope';

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Grid markup: items are absolutely placed children; the grid carries its source id and cell size. */
export function gridHtml(inv: D.Inventory, source: string, cell: number, selected: string | null, opts: { empty?: string } = {}) {
  const items = inv.items.map(i => {
    const d = D.ITEMS[i.id], size = D.itemSize(i), w = size.w * cell, h = size.h * cell;
    // The game's artwork at the largest whole scale that fits the cell box above the label (rotated items turn the art).
    const [aw0, ah0] = itemArtSize(i.id), boxW = w - 6, boxH = h - (cell >= 40 ? 15 : 11);
    const art = Math.max(1, Math.floor(Math.min(boxW / (i.rotated ? ah0 : aw0), boxH / (i.rotated ? aw0 : ah0))));
    const img = `<img alt="" draggable="false" src="${itemArt(i.id)}" style="width:${aw0 * art}px;height:${ah0 * art}px;transform:translate(-50%,-50%)${i.rotated ? ' rotate(90deg)' : ''}">`;
    return `<div class="item k-${d.kind}${selected === i.uid ? ' sel' : ''}${i.relief ? ' relief' : ''}" data-uid="${i.uid}" data-src="${source}" tabindex="0" role="button" aria-label="${esc(d.name)} × ${i.qty}" title="${esc(d.name)} × ${i.qty}" style="left:${i.x * cell}px;top:${i.y * cell}px;width:${w}px;height:${h}px"><span class="art">${img}</span><span class="lbl">${esc(d.short || d.name)}</span>${i.qty > 1 ? `<span class="qty">${i.qty}</span>` : ''}</div>`;
  }).join('');
  return `<div class="grid" data-grid="${source}" data-cell="${cell}" style="width:${inv.w * cell}px;height:${inv.h * cell}px;--cell:${cell}px">${items}<div class="preview" hidden></div>${!inv.items.length && opts.empty ? `<div class="empty">${esc(opts.empty)}</div>` : ''}</div>`;
}

export interface DragHooks {
  /** Inventory for a grid source (to read the dragged item and the drop grid size). */
  inv(source: string): D.Inventory | null;
  /** null = valid, string = reason. */
  check(from: string, to: string, uid: string, x: number, y: number, rotated: boolean): string | null;
  drop(from: string, to: string, uid: string, x: number, y: number, rotated: boolean): void;
  /** Dropped on a non-grid target (e.g. the weapon slot). */
  dropSlot?(slot: string, from: string, uid: string): void;
  select(source: string, uid: string): void;
  quick?(source: string, uid: string): void;
  rotatable: boolean;
  reject(message: string): void;
}

/**
 * Pointer drag for inventory grids (no native HTML drag: it is unreliable under the game's global pointer handling).
 * The view lives in a shadow root: hit tests ask that root (document.elementsFromPoint stops at the shadow host) and
 * the ghost is a fixed child of the UI layer, which has no transformed ancestor. Window listeners go through the
 * host's scope so an unmount removes them.
 */
export class GridDrag {
  private start: { x: number; y: number; el: HTMLElement; src: string; uid: string; grabX: number; grabY: number; pointer: number } | null = null;
  private ghost: HTMLElement | null = null;
  private rotated = false;
  private over: { grid: HTMLElement; x: number; y: number; valid: boolean } | null = null;
  private lastClick = { uid: '', t: 0 };

  constructor(private root: HTMLElement, private shadow: ShadowRoot, private hooks: () => DragHooks | null, scope: Scope) {
    scope.on(root, 'pointerdown', this.down);
    scope.on(window, 'pointermove', this.move);
    scope.on(window, 'pointerup', this.up);
    scope.on(window, 'pointercancel', this.cancel);
    scope.on(window, 'keydown', this.key, { capture: true });
    scope.add(() => { cancelAnimationFrame(this.scrollTick); this.ghost?.remove(); this.ghost = null; this.start = null; });
  }
  get active() { return !!this.ghost; }
  private at(x: number, y: number) { return this.shadow.elementsFromPoint(x, y) as HTMLElement[]; }

  private down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.item[data-uid]');
    if (!el || !this.hooks()) return;
    const r = el.getBoundingClientRect();
    this.start = { x: e.clientX, y: e.clientY, el, src: el.dataset.src!, uid: el.dataset.uid!, grabX: e.clientX - r.left, grabY: e.clientY - r.top, pointer: e.pointerId };
    e.preventDefault();
  };
  private move = (e: PointerEvent) => {
    const s = this.start, h = this.hooks();
    if (!s || !h || e.pointerId !== s.pointer) return;
    if (!this.ghost) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
      const item = h.inv(s.src)?.items.find(i => i.uid === s.uid);
      if (!item) { this.start = null; return; }
      this.rotated = !!item.rotated;
      this.ghost = s.el.cloneNode(true) as HTMLElement;
      this.ghost.classList.add('ghost'); this.ghost.classList.remove('sel');
      this.root.appendChild(this.ghost);
      s.el.classList.add('lifted');
      this.root.classList.add('dragging');
    }
    this.ghost.style.left = `${e.clientX - s.grabX}px`; this.ghost.style.top = `${e.clientY - s.grabY}px`;
    this.track(e.clientX, e.clientY);
    this.autoScroll(e.clientX, e.clientY);
  };
  /** While dragging near the top or bottom of a scrolling pane, keep scrolling it (compact layout). */
  private scrollTick = 0;
  private autoScroll(cx: number, cy: number) {
    cancelAnimationFrame(this.scrollTick);
    const pane = this.at(cx, cy).map(el => el.closest?.('.pane-scroll') as HTMLElement | null).find(Boolean);
    if (!pane || !this.ghost) return;
    const r = pane.getBoundingClientRect(), edge = 32, v = cy < r.top + edge ? -(r.top + edge - cy) / 3 : cy > r.bottom - edge ? (cy - (r.bottom - edge)) / 3 : 0;
    if (!v) return;
    const step = () => { if (!this.ghost) return; pane.scrollTop += v; this.track(cx, cy); this.scrollTick = requestAnimationFrame(step); };
    this.scrollTick = requestAnimationFrame(step);
  }
  private track(cx: number, cy: number) {
    const s = this.start!, h = this.hooks()!;
    const hit = this.at(cx, cy).find(el => el.dataset?.grid || el.dataset?.slot);
    this.clearPreview();
    if (!hit?.dataset.grid) { if (hit?.dataset.slot) hit.classList.add('slot-over'); return; }
    const cell = Number(hit.dataset.cell), r = hit.getBoundingClientRect();
    const item = h.inv(s.src)?.items.find(i => i.uid === s.uid); if (!item) return;
    const d = D.ITEMS[item.id], w = this.rotated ? d.h : d.w, hh = this.rotated ? d.w : d.h;
    const gx = Math.round((cx - s.grabX - r.left) / cell), gy = Math.round((cy - s.grabY - r.top) / cell);
    const inv = h.inv(hit.dataset.grid);
    const x = Math.max(0, Math.min((inv?.w ?? 1) - w, gx)), y = Math.max(0, Math.min((inv?.h ?? 1) - hh, gy));
    const reason = h.check(s.src, hit.dataset.grid, s.uid, x, y, this.rotated);
    const p = hit.querySelector<HTMLElement>('.preview')!;
    p.hidden = false; p.className = `preview ${reason ? 'bad' : 'good'}`; p.title = reason ?? '';
    Object.assign(p.style, { left: `${x * cell}px`, top: `${y * cell}px`, width: `${w * cell}px`, height: `${hh * cell}px` });
    this.over = { grid: hit, x, y, valid: !reason };
  }
  private clearPreview() {
    this.over = null;
    this.root.querySelectorAll<HTMLElement>('.grid .preview').forEach(p => { p.hidden = true; });
    this.root.querySelectorAll('.slot-over').forEach(el => el.classList.remove('slot-over'));
  }
  private up = (e: PointerEvent) => {
    const s = this.start, h = this.hooks();
    if (!s || e.pointerId !== s.pointer) return;
    this.start = null;
    if (!this.ghost || !h) {
      if (h) {
        const now = performance.now();
        if (this.lastClick.uid === s.uid && now - this.lastClick.t < 320 && h.quick) { h.quick(s.src, s.uid); this.lastClick = { uid: '', t: 0 }; }
        else { this.lastClick = { uid: s.uid, t: now }; h.select(s.src, s.uid); }
      }
      return;
    }
    const over = this.over, hit = this.at(e.clientX, e.clientY).find(el => el.dataset?.slot);
    this.finish();
    if (over?.valid) h.drop(s.src, over.grid.dataset.grid!, s.uid, over.x, over.y, this.rotated);
    else if (hit && h.dropSlot) h.dropSlot(hit.dataset.slot!, s.src, s.uid);
    else if (over) h.reject(h.check(s.src, over.grid.dataset.grid!, s.uid, over.x, over.y, this.rotated) ?? '这里放不下。');
  };
  private cancel = () => { if (this.ghost) this.finish(); this.start = null; };
  private finish() {
    cancelAnimationFrame(this.scrollTick);
    this.ghost?.remove(); this.ghost = null; this.clearPreview();
    this.root.querySelectorAll('.lifted').forEach(el => el.classList.remove('lifted'));
    this.root.classList.remove('dragging');
  }
  private key = (e: KeyboardEvent) => {
    if (!this.ghost || !this.start) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); this.finish(); this.start = null; return; }
    if ((e.key === 'r' || e.key === 'R') && this.hooks()?.rotatable) {
      e.preventDefault(); e.stopPropagation();
      const item = this.hooks()!.inv(this.start.src)?.items.find(i => i.uid === this.start!.uid);
      if (!item || D.ITEMS[item.id].w === D.ITEMS[item.id].h) return;
      this.rotated = !this.rotated;
      const cell = Number(this.start.el.closest<HTMLElement>('[data-grid]')?.dataset.cell ?? 40), d = D.ITEMS[item.id];
      const w = (this.rotated ? d.h : d.w) * cell, h = (this.rotated ? d.w : d.h) * cell;
      this.ghost.style.width = `${w}px`; this.ghost.style.height = `${h}px`;
      const img = this.ghost.querySelector<HTMLElement>('img'); if (img) img.style.transform = `translate(-50%,-50%)${this.rotated ? ' rotate(90deg)' : ''}`;
      this.start.grabX = Math.min(this.start.grabX, w - 4); this.start.grabY = Math.min(this.start.grabY, h - 4);
      const r = this.ghost.getBoundingClientRect(); this.track(r.left + this.start.grabX, r.top + this.start.grabY);
    }
  };
}
