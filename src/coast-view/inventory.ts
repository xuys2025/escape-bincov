/**
 * Inventory and loot panels of the village sample. Markup and styles reuse the original inventory grid (.grid / .item /
 * .drop-preview / .placement-cell), so the inventory look is not redrawn. Interaction: mouse drag with live placement
 * preview, R to rotate while dragging or placing, click-to-place mode (touch and keyboard), split placement and quick
 * bag/safe transfer.
 *
 * Commit routing mirrors the original UI: inside the loot panel every move (container, bag, safe) goes through the
 * Runtime transferLoot service; in the inventory panel bag/safe edits go through SaveSession.mutate, which captures and
 * rolls back the attached Runtime world. The panel never edits PublishedView data or inventory copies.
 */
import * as D from '../domain';
import { moveQuantity, placementError, type LootEndpoint } from '../loot';
import type { MutationResult, SaveSession, SessionState } from '../session';
import type { TargetRef } from '../raid-runtime/contract';
import type { CoastServices } from './host';
import { itemArtwork } from '../ui';

const SUPPLIES = new Set(['bandage', 'medkit', 'antidote', 'water', 'food', 'analgesic', 'focus', 'strengthDose', 'constitutionDose', 'techniqueDose', 'luckySachet', 'unluckySachet']);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
type Source = 'container' | 'bag' | 'safe';
/**
 * Whether a label fits on one line in the pixel face (16 px per CJK character, 8 per ASCII) inside an item box of
 * `width` px: the box loses 2 px of border and the label 2 px of padding.
 */
export const labelFits = (label: string, width: number) => [...label].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 16 : 8), 0) <= width - 4;
const LABEL: Record<Source, string> = { container: '来源', bag: '背包', safe: '安全箱' };

export interface InventoryHost {
  session: SessionState; saves: SaveSession; services: CoastServices;
  lootRef(): TargetRef | null;
  touch(): boolean;
  toast(text: string, bad?: boolean): void;
  /** A write failed and was rolled back: let the host surface the original save-error flow. */
  saveFailed(): void;
  close(): void;
  carryLimit(): number;
  magazine(): number;
  /** A supply use committed (sound cue). */
  used?(): void;
}

interface Drag { uid: string; source: Source; startX: number; startY: number; grabX: number; grabY: number; rotated: boolean; active: boolean; ghost: HTMLElement | null; pointerId: number }

export class InventoryPanel {
  mode: 'inventory' | 'loot' = 'inventory';
  selected: { uid: string; source: Source } | null = null;
  /** Click-to-place mode: next click on a grid cell commits (rotation/quantity preview). */
  placement: { rotated?: boolean; quantity?: number } | null = null;
  private drag: Drag | null = null;
  private status = '';

  constructor(private el: HTMLElement, private host: InventoryHost) {}

  open(mode: 'inventory' | 'loot') { this.cancelDrag(); this.mode = mode; this.selected = null; this.placement = null; this.status = ''; this.render(); }
  closeTransient() { this.cancelDrag(); this.selected = null; this.placement = null; }

  /**
   * Grid cell in CSS px. Desktop uses the base UI's 54, where a three-character label (the fuse, carbine rounds) fits the
   * pixel face at its native 16 px. Touch and very short screens stay compact; there a label that would not fit takes the
   * small system face instead of being cut to its first character (see `labelFits`).
   */
  private cell() { return this.host.touch() ? 40 : innerHeight < 600 ? 44 : 54; }
  private inv(source: Source): D.Inventory | null {
    if (source === 'container') { const ref = this.host.lootRef(); return ref ? this.host.services.lootInventory(ref) : null; }
    return this.host.session.loadout?.[source] ?? null;
  }
  private item(sel = this.selected) { return sel ? this.inv(sel.source)?.items.find(i => i.uid === sel.uid) ?? null : null; }

  // --- rendering ---
  render() {
    const l = this.host.session.loadout; if (!l) return;
    const ref = this.mode === 'loot' ? this.host.lootRef() : null, box = ref ? this.host.services.lootInventory(ref) : null;
    if (this.mode === 'loot' && !box) { this.host.close(); return; }
    if (this.selected && !this.item()) { this.selected = null; this.placement = null; }
    const weight = this.weight(), limit = this.host.carryLimit(), w = D.WEAPONS[l.weapon || 'knife'];
    const container = this.mode === 'loot' && box ? `<section class="cs-inv-src"><h3>${esc(this.containerName())} <span>${box.items.length ? '可取出 · 可放回' : '已搜空'}</span></h3>${this.grid(box, 'container')}<p class="cs-help">留在这里的物资仅保留至本局结束。</p></section>` : '';
    this.el.innerHTML = `<header class="cs-inv-head"><div><h2>${this.mode === 'loot' ? '搜刮物资' : '随身物资'}</h2><span class="cs-sub">世界仍在运行，请留意周围</span></div><button type="button" data-do="close">关闭（${this.mode === 'loot' ? 'E / ' : ''}Tab / Esc）</button></header>
      <div class="cs-inv">${container}
        <section><h3>背包 <span>${l.bag.w} × ${l.bag.h}</span></h3>${this.grid(l.bag, 'bag')}<p class="cs-help">负重 <b data-weight>${weight.toFixed(1)}</b> / ${limit.toFixed(1)} kg · 含装备</p></section>
        <section><h3>安全箱 <span>撤离失败保留</span></h3>${this.grid(l.safe, 'safe')}<p class="cs-help">主武器 ${esc(w?.name ?? '水手匕首')}${w?.magazine ? ` · 弹匣 ${this.host.magazine()} / ${w.magazine}` : ''}</p></section>
        <aside class="cs-details">${this.details()}</aside>
      </div>
      <footer class="cs-inv-foot" role="status">${esc(this.status || this.hint())}</footer>`;
  }
  private hint() {
    if (this.placement) return `${this.placement.quantity ? `拆分 ${this.placement.quantity} 件：` : ''}点目标格放置 · R 旋转 · Esc 取消`;
    return this.host.touch() ? '选中物品 → 移动格位 → 点目标格' : '拖到格子放置（R 旋转）· 单击查看 · 绿色可放置，红色不可放置';
  }
  /** Display name of the open container, taken from the latest frame by the host. */
  containerLabel = '物资箱';
  private containerName() { return this.containerLabel; }

  private grid(inv: D.Inventory, source: Source) {
    const cell = this.cell(), sel = this.selected;
    const items = inv.items.map(i => {
      const d = D.ITEMS[i.id], size = D.itemSize(i), on = sel?.uid === i.uid && sel.source === source;
      return `<div tabindex="0" role="button" aria-label="${esc(d.name)} × ${i.qty}" aria-pressed="${on}" title="${esc(d.name)} × ${i.qty} · ${(d.weight * i.qty).toFixed(2)} kg" data-uid="${i.uid}" data-source="${source}" data-kind="${d.kind}" class="item ${on ? 'selected' : ''}" style="left:${i.x * cell + 1}px;top:${i.y * cell + 1}px;width:${size.w * cell - 2}px;height:${size.h * cell - 2}px"><span class="inventory-art">${itemArtwork(i.id, size.w * cell - 10, size.h * cell - 27, !!i.rotated)}</span><span class="item-label ${i.relief ? 'relief' : ''} ${labelFits(d.short || d.name, size.w * cell) ? '' : 'tight'}">${esc(d.short || d.name)}</span>${i.qty > 1 ? `<span class="qty">${i.qty}</span>` : ''}</div>`;
    }).join('');
    return `<div class="grid" data-grid="${source}" data-cell="${cell}" style="width:${inv.w * cell}px;height:${inv.h * cell}px;--cell:${cell}px">${items}${this.placementCells(inv, source, cell)}${inv.items.length ? '' : '<div class="empty-hint">暂无物品</div>'}</div>`;
  }
  private placementCells(inv: D.Inventory, source: Source, cell: number) {
    const sel = this.selected, src = sel && this.inv(sel.source);
    if (!this.placement || !sel || !src) return '';
    let out = '';
    for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++)
      if (!placementError(src, sel.source === source ? src : inv, sel.uid, x, y, this.placement.rotated, this.placement.quantity))
        out += `<i class="placement-cell" style="left:${x * cell}px;top:${y * cell}px;width:${cell}px;height:${cell}px"></i>`;
    return out;
  }
  private details() {
    const i = this.item(), sel = this.selected;
    if (!i || !sel) return `<h3>选中物品查看详情</h3><p class="cs-sub">${this.mode === 'loot' ? '把物品拖到另一侧的空格，或拖到可合并的同类物品上。' : '拖动整理背包与安全箱；安全箱里的物品撤离失败也会保留。'}</p>`;
    const d = D.ITEMS[i.id], size = D.itemSize(i), carried = sel.source !== 'container';
    const btn = (label: string, action: string, extra = '') => `<button type="button" data-do="${action}" ${extra}>${label}</button>`;
    const actions = [
      carried && SUPPLIES.has(i.id) ? btn('使用', 'inv-use') : '',
      sel.source === 'bag' && D.WEAPONS[i.id] && i.id !== 'knife' ? btn('装备', 'inv-equip') : '',
      sel.source === 'container' ? btn('拿到背包', 'inv-quick') : btn(sel.source === 'safe' ? '放入背包' : '放入安全箱', 'inv-quick'),
      d.w !== d.h ? btn('旋转', 'inv-rotate') : '',
      btn('移动格位', 'inv-place'),
      i.qty > 1 ? `<label class="cs-split">拆分 <input type="number" min="1" max="${i.qty - 1}" value="${Math.max(1, Math.floor(i.qty / 2))}" data-split aria-label="拆分数量"></label>${btn('拆分放置', 'inv-split')}` : '',
      carried ? btn('丢弃', 'inv-drop', 'class="cs-danger"') : '',
    ].join('');
    return `<h3>${esc(d.name)}</h3><p class="cs-sub">${LABEL[sel.source]} · ${size.w} × ${size.h} 格 · ${i.qty} 件 · ${(d.weight * i.qty).toFixed(2)} kg${i.relief ? ' · 救济' : ''}</p><p class="cs-desc">${esc(d.description ?? '')}</p><div class="cs-row cs-actions">${actions}</div>${carried ? '' : '<p class="cs-sub">收入背包或安全箱后，才能使用或装备。</p>'}`;
  }
  private weight() {
    const l = this.host.session.loadout!, w = D.WEAPONS[l.weapon || 'knife'];
    return D.weight(l.bag) + D.weight(l.safe) + (l.weapon ? D.ITEMS[l.weapon].weight : 0) + D.ITEMS.knife.weight + (w.ammo ? D.ITEMS[w.ammo].weight * this.host.magazine() : 0);
  }

  // --- actions ---
  /** Returns true when the click was handled by the panel. */
  onClick(e: MouseEvent): boolean {
    const target = e.target as HTMLElement, action = target.closest<HTMLElement>('[data-do]')?.dataset.do;
    if (action?.startsWith('inv-')) { this.action(action); return true; }
    const grid = target.closest<HTMLElement>('[data-grid]');
    if (this.placement && this.selected && grid) {
      const at = this.cellAt(grid, e.clientX, e.clientY);
      this.commit(this.selected.source, grid.dataset.grid as Source, this.selected.uid, at.x, at.y, this.placement.rotated, this.placement.quantity);
      return true;
    }
    const item = target.closest<HTMLElement>('[data-uid]');
    if (item && grid) { this.selected = { uid: item.dataset.uid!, source: item.dataset.source as Source }; this.placement = null; this.status = ''; this.render(); return true; }
    return false;
  }
  private action(a: string) {
    const sel = this.selected, i = this.item(); if (!sel || !i) return;
    const loadout = this.host.session.loadout!;
    switch (a) {
      case 'inv-use': { const r = this.host.services.useSupply(i.id, sel.source as 'bag' | 'safe', i.uid); if (r === 'committed') this.host.used?.(); this.result(r); break; }
      case 'inv-equip': this.result(this.host.services.equipItem(i.uid)); break;
      case 'inv-drop': this.result(this.host.services.dropItem(i.uid, sel.source as 'bag' | 'safe')); break;
      case 'inv-place': this.placement = {}; this.status = ''; this.render(); break;
      case 'inv-rotate': {
        const inv = this.inv(sel.source)!;
        if (this.mode === 'inventory' && sel.source !== 'container' && D.fits(inv, i.id, i.x, i.y, i.uid, !i.rotated)) this.result(this.host.saves.mutate(() => D.rotateItem(loadout[sel.source as 'bag' | 'safe'], i.uid)), false);
        else { this.placement = { rotated: !i.rotated }; this.status = ''; this.render(); }
        break;
      }
      case 'inv-split': {
        const input = this.el.querySelector<HTMLInputElement>('[data-split]'), qty = Number(input?.value);
        if (!Number.isInteger(qty) || qty < 1 || qty >= i.qty) { this.host.toast('请输入小于当前数量的正整数。', true); break; }
        this.placement = { quantity: qty }; this.status = ''; this.render(); break;
      }
      case 'inv-quick': {
        const to: Source = sel.source === 'safe' ? 'bag' : sel.source === 'bag' ? 'safe' : 'bag';
        const dst = this.inv(to)!;
        if (this.mode === 'inventory') { this.result(this.host.saves.mutate(() => D.transferItem(loadout[sel.source as 'bag' | 'safe'], loadout[to as 'bag' | 'safe'], i.uid)), true, '放不下这件物品，请先整理目标容器。'); break; }
        const at = slot(dst, i);
        if (!at) { this.host.toast(`${LABEL[to]}空间不足。`, true); break; }
        this.commit(sel.source, to, i.uid, at.x, at.y, at.rotated);
        break;
      }
    }
  }
  /** One placement through the routing rule above; validation uses the same placementError as the original UI. */
  commit(from: Source, to: Source, uid: string, x: number, y: number, rotated?: boolean, quantity?: number): MutationResult | 'invalid' {
    const src = this.inv(from), dst = from === to ? src : this.inv(to);
    if (!src || !dst) return 'invalid';
    const error = placementError(src, dst, uid, x, y, rotated, quantity);
    if (error) { this.host.toast(error, true); this.status = error; this.render(); return 'invalid'; }
    let result: MutationResult;
    if (this.mode === 'loot') {
      const ref = this.host.lootRef(); if (!ref) return 'invalid';
      result = this.host.services.transferLoot(ref, { runId: ref.runId, containerId: ref.id, from: from as LootEndpoint, to: to as LootEndpoint, uid, x, y, rotated, quantity });
    } else {
      const l = this.host.session.loadout!;
      result = this.host.saves.mutate(() => moveQuantity(l[from as 'bag' | 'safe'], l[to as 'bag' | 'safe'], uid, x, y, rotated, quantity));
    }
    this.result(result);
    return result;
  }
  private result(r: MutationResult, clear = true, rejected = '操作未完成，请检查所需物资和可用空间。') {
    if (r === 'committed') { if (clear) { this.selected = null; } this.placement = null; this.status = ''; }
    else if (r === 'save-failed') { this.host.toast('保存失败，物资和进度已恢复到操作前。', true); this.selected = null; this.placement = null; this.host.saveFailed(); }
    else if (r === 'blocked') this.host.toast('当前无法转移物品，请先处理存档状态。', true);
    else this.host.toast(rejected, true);
    if (this.el.isConnected) this.render();
  }

  // --- pointer drag (mouse) ---
  private cellAt(grid: HTMLElement, cx: number, cy: number) {
    const r = grid.getBoundingClientRect(), cell = Number(grid.dataset.cell);
    return { x: Math.floor((cx - r.left) / cell), y: Math.floor((cy - r.top) / cell) };
  }
  pointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || this.placement) return;
    const item = (e.target as HTMLElement).closest<HTMLElement>('.item[data-uid]'); if (!item) return;
    const r = item.getBoundingClientRect(), src = item.dataset.source as Source, it = this.inv(src)?.items.find(i => i.uid === item.dataset.uid);
    if (!it) return;
    // A drag whose release never arrived must not leave its ghost behind on the sample root.
    this.cancelDrag();
    this.drag = { uid: it.uid, source: src, startX: e.clientX, startY: e.clientY, grabX: e.clientX - r.left, grabY: e.clientY - r.top, rotated: !!it.rotated, active: false, ghost: null, pointerId: e.pointerId };
  }
  pointerMove(e: PointerEvent) {
    const d = this.drag; if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    if (!d.active) { d.active = true; this.selected = { uid: d.uid, source: d.source }; this.ghost(); }
    this.moveGhost(e.clientX, e.clientY);
  }
  pointerUp(e: PointerEvent): boolean {
    const d = this.drag; if (!d || e.pointerId !== d.pointerId) return false;
    this.drag = null;
    if (!d.active) return false;
    const target = this.dropTarget(e.clientX, e.clientY, d);
    d.ghost?.remove(); this.el.querySelectorAll('.drop-preview').forEach(n => n.remove());
    if (target) this.commit(d.source, target.source, d.uid, target.x, target.y, d.rotated);
    else { this.status = '拖放未完成，物品仍在原处。'; this.render(); }
    return true;
  }
  /** R while dragging or placing toggles rotation; Esc cancels. Returns true when consumed. */
  key(k: string): boolean {
    if (k === 'r' && this.drag?.active) { this.drag.rotated = !this.drag.rotated; [this.drag.grabX, this.drag.grabY] = [this.drag.grabY, this.drag.grabX]; this.ghost(); return true; }
    if (k === 'r' && this.placement && this.selected) { const i = this.item(); this.placement.rotated = !(this.placement.rotated ?? i?.rotated); this.render(); return true; }
    if (k === 'escape' && (this.drag || this.placement)) { this.cancelDrag(); this.placement = null; this.status = ''; this.render(); return true; }
    return false;
  }
  private cancelDrag() { this.drag?.ghost?.remove(); this.el.querySelectorAll('.drop-preview').forEach(n => n.remove()); this.drag = null; }
  private ghost() {
    const d = this.drag!, it = this.inv(d.source)?.items.find(i => i.uid === d.uid); if (!it) return;
    d.ghost?.remove();
    const cell = this.cell(), size = D.itemSize({ ...it, rotated: d.rotated }), g = document.createElement('div');
    g.className = 'item cs-ghost'; g.dataset.kind = D.ITEMS[it.id].kind;
    g.style.cssText = `position:fixed;left:0;top:0;width:${size.w * cell - 2}px;height:${size.h * cell - 2}px;pointer-events:none;z-index:200;opacity:.85`;
    g.innerHTML = `<span class="inventory-art">${itemArtwork(it.id, size.w * cell - 10, size.h * cell - 27, d.rotated)}</span>`;
    // Not inside the panel: the docked panel is centred with a transform, which makes it the containing block of a fixed
    // child, so the ghost landed off the cursor and its overflow gave the panel a scrollbar. The sample root is fixed and
    // untransformed, and a re-render of the panel mid-drag no longer wipes the ghost.
    (this.el.closest('.coast-sample') ?? document.body).appendChild(g); d.ghost = g;
  }
  private moveGhost(cx: number, cy: number) {
    const d = this.drag!; if (!d.ghost) return;
    d.ghost.style.transform = `translate(${cx - d.grabX}px, ${cy - d.grabY}px)`;
    this.el.querySelectorAll('.drop-preview').forEach(n => n.remove());
    const t = this.dropTarget(cx, cy, d); if (!t) return;
    const it = this.inv(d.source)!.items.find(i => i.uid === d.uid)!, size = D.itemSize({ ...it, rotated: d.rotated }), cell = t.cell;
    const src = this.inv(d.source)!, dst = d.source === t.source ? src : this.inv(t.source)!;
    const error = placementError(src, dst, d.uid, t.x, t.y, d.rotated);
    const p = document.createElement('div'); p.className = `drop-preview${error ? ' invalid' : ''}`;
    p.style.cssText = `left:${t.x * cell}px;top:${t.y * cell}px;width:${size.w * cell}px;height:${size.h * cell}px`;
    t.grid.appendChild(p);
    const foot = this.el.querySelector('.cs-inv-foot'); if (foot) foot.textContent = error || `放置 ${D.ITEMS[it.id].name} × ${it.qty} · ${size.w}×${size.h} 格`;
  }
  private dropTarget(cx: number, cy: number, d: Drag) {
    const ghostLeft = cx - d.grabX, ghostTop = cy - d.grabY;
    const grid = (document.elementsFromPoint(cx, cy).find(n => (n as HTMLElement).dataset?.grid) as HTMLElement | undefined);
    if (!grid || !this.el.contains(grid)) return null;
    const r = grid.getBoundingClientRect(), cell = Number(grid.dataset.cell);
    return { grid, cell, source: grid.dataset.grid as Source, x: Math.round((ghostLeft - r.left) / cell), y: Math.round((ghostTop - r.top) / cell) };
  }
}

/** First free top-left slot in `to`, merging into a compatible stack first, then trying rotation. */
export function slot(to: D.Inventory, item: D.Item): { x: number; y: number; rotated: boolean } | null {
  const def = D.ITEMS[item.id];
  const stack = to.items.find(t => t.id === item.id && !!t.relief === !!item.relief && t.qty < def.stack);
  if (stack) return { x: stack.x, y: stack.y, rotated: !!stack.rotated };
  for (const rotated of def.w === def.h ? [false] : [false, true])
    for (let y = 0; y < to.h; y++) for (let x = 0; x < to.w; x++) if (D.fits(to, item.id, x, y, undefined, rotated)) return { x, y, rotated };
  return null;
}
