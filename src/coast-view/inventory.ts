/**
 * Inventory and loot panels of the village sample. Markup and styles reuse the original inventory grid (.grid / .item /
 * .drop-preview / .placement-cell), so the inventory look is not redrawn. Interaction: mouse drag with live placement
 * preview, R to rotate while dragging or placing, click-to-place mode (touch and keyboard), split placement and quick
 * bag/safe transfer. A primary-weapon slot on your own side equips a gun dropped on it, or the selected gun on a click
 * (#26 F15), from the backpack or the open container; the safe is not a source, as at the station.
 *
 * Commit routing mirrors the original UI: inside the loot panel every move (container, bag, safe) goes through the
 * Runtime transferLoot service; inventory-mode bag/safe edits use bounded carried-item services, which retain the
 * same SaveSession.mutate transaction and attached world. Reads are detached; the panel only edits its UI state.
 */
import { attachmentLines, gunPartsLine } from '../gunsmith/item-facts';
import * as D from '../domain';
import { firstAvailableSlot, placementError, type LootEndpoint } from '../loot';
import type { MutationResult } from '../session';
import type { CarriedInventoryView, CoastServices, TargetRef } from '../raid-runtime/contract';
import { itemArtwork } from '../art/item-images';
import { esc } from '../html';
import { SUPPLY_IDS } from '../rpg';

type Source = 'container' | 'bag' | 'safe';
/**
 * Whether a label fits on one line in the pixel face (16 px per CJK character, 8 per ASCII) inside an item box of
 * `width` px: the box loses 2 px of border and the label 2 px of padding.
 */
export const labelFits = (label: string, width: number) => [...label].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 16 : 8), 0) <= width - 4;
const LABEL: Record<Source, string> = { container: '来源', bag: '背包', safe: '安全箱' };
const NO_SPACE = '无法装备，背包装不下换下的武器和弹药。请先腾出空间。';

export interface InventoryHost {
  services: CoastServices;
  lootRef(): TargetRef | null;
  touch(): boolean;
  toast(text: string, bad?: boolean): void;
  /** A write failed and was rolled back: let the host surface the original save-error flow. */
  saveFailed(): void;
  close(): void;
  magazine(): number;
  /** A supply use committed (sound cue). */
  used?(): void;
}

interface Drag { uid: string; source: Source; startX: number; startY: number; x: number; y: number; grabX: number; grabY: number; rotated: boolean; active: boolean; ghost: HTMLElement | null; pointerId: number }

export class InventoryPanel {
  mode: 'inventory' | 'loot' = 'inventory';
  selected: { uid: string; source: Source } | null = null;
  /** Click-to-place mode: next click on a grid cell commits (rotation/quantity preview). */
  placement: { rotated?: boolean; quantity?: number } | null = null;
  private drag: Drag | null = null;
  private status = '';
  private lastClick: { uid: string; source: Source; at: number } | null = null;

  constructor(private el: HTMLElement, private host: InventoryHost) {}

  open(mode: 'inventory' | 'loot') { this.cancelDrag(); this.mode = mode; this.selected = null; this.placement = null; this.lastClick = null; this.status = ''; this.render(); }
  closeTransient() { this.cancelDrag(); this.selected = null; this.placement = null; this.lastClick = null; }

  /**
   * Grid cell in CSS px. Desktop uses the base UI's 54, where a three-character label (the fuse, carbine rounds) fits the
   * pixel face at its native 16 px. Touch and very short screens stay compact; there a label that would not fit takes the
   * small system face instead of being cut to its first character (see `labelFits`).
   */
  private cell() { return this.host.touch() ? 40 : innerHeight < 600 ? 44 : 54; }
  private inv(source: Source): D.Inventory | null {
    if (source === 'container') { const ref = this.host.lootRef(); return ref ? this.host.services.lootInventory(ref) : null; }
    return this.host.services.inventoryView()?.[source] ?? null;
  }
  private item(sel = this.selected) { return sel ? this.inv(sel.source)?.items.find(i => i.uid === sel.uid) ?? null : null; }

  // --- rendering ---
  render() {
    const l = this.host.services.inventoryView(); if (!l) return;
    const ref = this.mode === 'loot' ? this.host.lootRef() : null, box = ref ? this.host.services.lootInventory(ref) : null;
    if (this.mode === 'loot' && !box) { this.host.close(); return; }
    if (this.selected && !this.item()) { this.selected = null; this.placement = null; }
    const weight = this.host.services.carriedWeight(), limit = this.host.services.carryLimit();
    const container = this.mode === 'loot' && box ? `<section class="cs-inv-src"><h3>${esc(this.containerName())} <span>${box.items.length ? '可取出 · 可放回' : '已搜空'}</span></h3>${this.grid(box, 'container')}<p class="cs-help">留在这里的物资仅保留至本局结束。</p></section>` : '';
    // docs/LOOTING.md: on a desktop your own gear is on the left and the source on the right; a phone keeps the source first.
    const own = `<section><h3>背包 <span>${l.bag.w} × ${l.bag.h}</span></h3>${this.grid(l.bag, 'bag')}<p class="cs-help">负重 <b data-weight>${weight.toFixed(1)}</b> / <span data-carry-limit>${limit.toFixed(1)}</span> kg · 含装备</p></section>
        <section>${this.slot(l)}<h3>安全箱 <span>撤离失败保留</span></h3>${this.grid(l.safe, 'safe')}</section>`;
    // The loot window keeps a danger line (health, time, condition, a blow), filled by the host each frame. On a keyboard
    // its subtitle names the quick way out: a movement key leaves loot and walks (issue #26 F13).
    const sub = this.mode === 'loot' && !this.host.touch() ? '世界仍在运行，按 WASD 立即离开' : '世界仍在运行，请留意周围';
    this.el.innerHTML = `<header class="cs-inv-head"><div><h2>${this.mode === 'loot' ? '搜刮物资' : '随身物资'}</h2><span class="cs-sub">${sub}</span></div>${this.mode === 'loot' ? '<div class="cs-risk" data-risk></div>' : ''}<button type="button" data-do="close">关闭（${this.mode === 'loot' ? 'E / ' : ''}Tab / Esc）</button></header>
      ${this.placementBar()}<div class="cs-inv">${this.host.touch() ? container + own : own + container}
        <aside class="cs-details">${this.details()}</aside>
      </div>
      <footer class="cs-inv-foot" role="status">${esc(this.status || this.hint())}</footer>`;
  }
  /** Inventory/loot do not pause simulation. Refresh derived numbers without rebuilding the grid or losing a drag. */
  refreshWeight() {
    const values = this.host.services.inventoryReadout(); if (!values) return;
    for (const [selector, value] of [['[data-weight]', values.weight], ['[data-carry-limit]', values.limit]] as const) {
      const el = this.el.querySelector<HTMLElement>(selector), text = value.toFixed(1);
      if (el && el.textContent !== text) el.textContent = text;
    }
  }
  /** While placing: rotate the preview and cancel as buttons too (a phone has no R or Esc), as the original panel did. */
  private placementBar() {
    if (!this.placement || !this.selected) return '';
    const i = this.item(), d = i && D.ITEMS[i.id];
    return `<div class="cs-row cs-place-bar">${d && d.w !== d.h ? '<button type="button" data-do="inv-place-rotate">旋转预览</button>' : ''}<button type="button" data-do="inv-place-cancel">取消移动</button></div>`;
  }
  private hint() {
    if (this.placement) return `${this.placement.quantity ? `拆分 ${this.placement.quantity} 件：` : ''}点目标格放置${this.host.touch() ? '' : ' · R 旋转 · Esc 取消'}`;
    return this.host.touch() ? '选中物品 → 移动格位 → 点目标格 · 选中枪后点主武器槽即装备' : '单击查看 · 双击快捷转移 · 拖放可交换物品（R 旋转）· 枪拖到主武器槽即装备';
  }
  /**
   * The primary-weapon slot, on your own side as at the station. It shows the knife, always kept, when no gun is
   * equipped, and lights up while the selected item could go in. Its width is fixed (three cells, the longest gun) so
   * a swap does not shift the columns beside it.
   */
  private slot(l: CarriedInventoryView) {
    const w = D.equippedWeapon(l), cell = this.cell(), sel = this.selected, i = this.item();
    const ready = !!sel && !!i && !this.equipError(sel.source, i);
    return `<h3>主武器 <span>${this.host.touch() ? '选中枪后点这里' : '把枪拖到这里装备'}</span></h3><div class="cs-slot${l.weapon ? '' : ' empty'}${ready ? ' ready' : ''}" data-equip-slot role="button" tabindex="0" aria-label="主武器槽：${esc(w.name)}" title="把背包或搜刮箱里的枪拖到这里装备" style="width:${3 * cell + 18}px"><span class="inventory-art" style="min-height:${cell - 14}px">${itemArtwork(l.weapon ?? 'knife', 3 * cell, cell - 14)}</span><b>${esc(w.name)}</b><span>${!l.weapon ? '随身匕首 · 始终保留' : w.magazine ? `弹匣 ${this.host.magazine()} / ${w.magazine}${l.relief ? ' · 救济' : ''}` : '没装弹匣'}</span></div>`;
  }
  /** Why `item` cannot go into the weapon slot from `source`, or null. Bag space for the swap is the Runtime's check. */
  private equipError(source: Source, item: D.Item) {
    if (!D.isGun(item.id)) return '只有枪械可以放进主武器槽。';
    if (source === 'safe') return '安全箱里的枪械请先移回背包，再装备主武器。';
    return null;
  }
  /** Equip through the matching service: equipItem from the backpack, equipLoot from the open container. */
  private equip(source: Source, uid: string) {
    const i = this.inv(source)?.items.find(entry => entry.uid === uid); if (!i) return;
    const error = this.equipError(source, i);
    if (error) { this.host.toast(error, true); this.status = error; this.render(); return; }
    const ref = source === 'container' ? this.host.lootRef() : null;
    if (source === 'container' && (!ref || this.mode !== 'loot')) return;
    const r = ref ? this.host.services.equipLoot(ref, uid) : this.host.services.equipItem(uid);
    this.result(r, true, NO_SPACE);
    if (r === 'committed') this.host.toast(`已装备${D.ITEMS[i.id].name}。`);
  }
  /** Display name of the open container, taken from the latest frame by the host. */
  containerLabel = '物资箱';
  private containerName() { return this.containerLabel; }

  private grid(inv: D.Inventory, source: Source) {
    const cell = this.cell(), sel = this.selected;
    const items = inv.items.map(i => {
      const d = D.ITEMS[i.id], size = D.itemSize(i), on = sel?.uid === i.uid && sel.source === source;
      return `<div tabindex="0" role="button" aria-label="${esc(d.name)} × ${i.qty}" aria-pressed="${on}" title="${esc(d.name)} × ${i.qty} · ${D.itemWeight(i).toFixed(2)} kg" data-uid="${i.uid}" data-source="${source}" data-kind="${d.kind}" class="item ${on ? 'selected' : ''}" style="left:${i.x * cell + 1}px;top:${i.y * cell + 1}px;width:${size.w * cell - 2}px;height:${size.h * cell - 2}px"><span class="inventory-art">${itemArtwork(i, size.w * cell - 10, size.h * cell - 27, !!i.rotated)}</span><span class="item-label ${i.relief ? 'relief' : ''} ${labelFits(d.short || d.name, size.w * cell) ? '' : 'tight'}">${esc(d.short || d.name)}</span>${i.qty > 1 ? `<span class="qty">${i.qty}</span>` : ''}</div>`;
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
    if (!i || !sel) return `<h3>选中物品查看详情</h3><p class="cs-sub">${this.mode === 'loot' ? '把物品拖到另一侧的空格，或拖到可合并的同类物品上；枪可以直接拖到主武器槽装备。' : '拖动整理背包与安全箱；把枪拖到主武器槽即可装备。安全箱里的物品撤离失败也会保留。'}</p>`;
    const d = D.ITEMS[i.id], size = D.itemSize(i), carried = sel.source !== 'container';
    const btn = (label: string, action: string, extra = '') => `<button type="button" data-do="${action}" ${extra}>${label}</button>`;
    const actions = [
      carried && SUPPLY_IDS.includes(i.id) ? btn('使用', 'inv-use') : '',
      !this.equipError(sel.source, i) ? btn('装备主武器', 'inv-equip') : '',
      sel.source === 'container' ? btn('拿到背包', 'inv-quick') : btn(sel.source === 'safe' ? '放入背包' : '放入安全箱', 'inv-quick'),
      d.w !== d.h ? btn('旋转', 'inv-rotate') : '',
      btn('移动格位', 'inv-place'),
      i.qty > 1 ? `<label class="cs-split">拆分 <input type="number" min="1" max="${i.qty - 1}" value="${Math.max(1, Math.floor(i.qty / 2))}" data-split aria-label="拆分数量"></label>${btn('拆分放置', 'inv-split')}` : '',
      carried ? btn('丢弃', 'inv-drop', 'class="cs-danger"') : '',
    ].join('');
    const facts = [...attachmentLines(null, i.id), ...gunPartsLine(i) ? [gunPartsLine(i)!] : []];
    const note = D.isGun(i.id) ? sel.source === 'safe' ? this.equipError('safe', i) : '换下的枪和弹匣余弹放回背包；放不下时不会换枪。'
      : carried ? '' : '收入背包或安全箱后，才能使用。';
    return `<h3>${esc(d.name)}</h3><p class="cs-sub">${LABEL[sel.source]} · ${size.w} × ${size.h} 格 · ${i.qty} 件 · ${D.itemWeight(i).toFixed(2)} kg${i.relief ? ' · 救济' : ''}</p><p class="cs-desc">${esc(d.description ?? '')}</p>${facts.map(l => `<p class="cs-sub cs-maker">${esc(l)}</p>`).join('')}<div class="cs-row cs-actions">${actions}</div>${note ? `<p class="cs-sub">${note}</p>` : ''}`;
  }

  // --- actions ---
  /** Returns true when the click was handled by the panel. */
  onClick(e: MouseEvent): boolean {
    const target = e.target as HTMLElement, action = target.closest<HTMLElement>('[data-do]')?.dataset.do;
    if (action?.startsWith('inv-')) { this.lastClick = null; this.action(action); return true; }
    // Touch and click-to-place: the selected gun goes into the slot on a tap, in or out of placement mode.
    if (target.closest('[data-equip-slot]')) {
      this.lastClick = null;
      if (this.selected) this.equip(this.selected.source, this.selected.uid);
      else { this.status = '先选中背包或搜刮箱里的枪，再点主武器槽装备。'; this.render(); }
      return true;
    }
    const grid = target.closest<HTMLElement>('[data-grid]');
    if (this.placement && this.selected && grid) {
      const at = this.cellAt(grid, e.clientX, e.clientY);
      this.commit(this.selected.source, grid.dataset.grid as Source, this.selected.uid, at.x, at.y, this.placement.rotated, this.placement.quantity);
      return true;
    }
    const item = target.closest<HTMLElement>('[data-uid]');
    if (item && grid) {
      const selected = { uid: item.dataset.uid!, source: item.dataset.source as Source }, at = performance.now();
      // The first selection rebuilds the panel. Track identity across that rebuild instead of relying on a dblclick target.
      const twice = !this.host.touch() && e.detail > 0 && this.lastClick?.uid === selected.uid && this.lastClick.source === selected.source && at - this.lastClick.at <= 350;
      this.selected = selected; this.placement = null; this.status = '';
      this.lastClick = !this.host.touch() && e.detail > 0 && !twice ? { ...selected, at } : null;
      if (twice) this.action('inv-quick'); else this.render();
      return true;
    }
    this.lastClick = null;
    return false;
  }
  private action(a: string) {
    const sel = this.selected, i = this.item(); if (!sel || !i) return;
    switch (a) {
      case 'inv-place-rotate': if (this.placement) { this.placement.rotated = !(this.placement.rotated ?? i.rotated); this.render(); } break;
      case 'inv-place-cancel': this.placement = null; this.status = ''; this.render(); break;
      case 'inv-use': { const r = this.host.services.useSupply(i.id, sel.source as 'bag' | 'safe', i.uid); if (r === 'committed') this.host.used?.(); this.result(r); break; }
      case 'inv-equip': this.equip(sel.source, i.uid); break;
      case 'inv-drop': this.result(this.host.services.dropItem(i.uid, sel.source as 'bag' | 'safe')); break;
      case 'inv-place': this.placement = {}; this.status = ''; this.render(); break;
      case 'inv-rotate': {
        const inv = this.inv(sel.source)!;
        if (this.mode === 'inventory' && sel.source !== 'container' && D.fits(inv, i.id, i.x, i.y, i.uid, !i.rotated)) this.result(this.host.services.rotateCarried(sel.source, i.uid), false);
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
        if (this.mode === 'inventory' && sel.source !== 'container') { this.result(this.host.services.quickTransferCarried(sel.source, i.uid), true, '放不下这件物品，请先整理目标容器。'); break; }
        const at = firstAvailableSlot(dst, i);
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
      if (from === 'container' || to === 'container') return 'invalid';
      result = this.host.services.moveCarried({ from, to, uid, x, y, rotated, quantity });
    }
    this.result(result);
    return result;
  }
  private result(r: MutationResult, clear = true, rejected = '操作未完成，请检查所需物资和可用空间。') {
    if (r === 'committed') { if (clear) { this.selected = null; } this.placement = null; this.status = ''; }
    else if (r === 'publish-failed') { this.host.toast('进度已保存，但当前页面恢复失败。请导出备份后刷新页面。', true); this.selected = null; this.placement = null; this.host.saveFailed(); }
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
    this.drag = { uid: it.uid, source: src, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, grabX: e.clientX - r.left, grabY: e.clientY - r.top, rotated: !!it.rotated, active: false, ghost: null, pointerId: e.pointerId };
  }
  pointerMove(e: PointerEvent) {
    const d = this.drag; if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    if (!d.active) { d.active = true; this.lastClick = null; this.selected = { uid: d.uid, source: d.source }; this.ghost(); }
    this.moveGhost(e.clientX, e.clientY);
  }
  pointerUp(e: PointerEvent): boolean {
    const d = this.drag; if (!d || e.pointerId !== d.pointerId) return false;
    this.drag = null;
    if (!d.active) return false;
    const slot = this.slotAt(e.clientX, e.clientY), target = slot ? null : this.dropTarget(e.clientX, e.clientY, d);
    d.ghost?.remove(); this.el.querySelectorAll('.drop-preview').forEach(n => n.remove());
    if (slot) this.equip(d.source, d.uid);
    else if (target) this.commit(d.source, target.source, d.uid, target.x, target.y, d.rotated);
    else { this.status = '拖放未完成，物品仍在原处。'; this.render(); }
    return true;
  }
  /** R while dragging or placing toggles rotation; Esc cancels. Returns true when consumed. */
  key(k: string): boolean {
    // The new ghost and its drop preview follow the pointer at once, without waiting for the next move.
    if (k === 'r' && this.drag?.active) { const d = this.drag; d.rotated = !d.rotated; [d.grabX, d.grabY] = [d.grabY, d.grabX]; this.ghost(); this.moveGhost(d.x, d.y); return true; }
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
    g.innerHTML = `<span class="inventory-art">${itemArtwork(it, size.w * cell - 10, size.h * cell - 27, d.rotated)}</span>`;
    // Not inside the panel: the docked panel is centred with a transform, which makes it the containing block of a fixed
    // child, so the ghost landed off the cursor and its overflow gave the panel a scrollbar. The sample root is fixed and
    // untransformed, and a re-render of the panel mid-drag no longer wipes the ghost.
    (this.el.closest('.coast-sample') ?? document.body).appendChild(g); d.ghost = g;
  }
  private moveGhost(cx: number, cy: number) {
    const d = this.drag!; if (!d.ghost) return;
    d.ghost.style.transform = `translate(${cx - d.grabX}px, ${cy - d.grabY}px)`;
    this.el.querySelectorAll('.drop-preview').forEach(n => n.remove());
    this.el.querySelectorAll('.cs-slot.over').forEach(n => n.classList.remove('over', 'invalid'));
    const it = this.inv(d.source)!.items.find(i => i.uid === d.uid)!, foot = this.el.querySelector('.cs-inv-foot'), slot = this.slotAt(cx, cy);
    if (slot) {
      // The cursor, not the ghost's corner, picks the slot: it has no cells to align to.
      const error = this.equipError(d.source, it);
      slot.classList.add('over'); slot.classList.toggle('invalid', !!error);
      if (foot) foot.textContent = error || `松开即装备 ${D.ITEMS[it.id].name}`;
      return;
    }
    const t = this.dropTarget(cx, cy, d); if (!t) return;
    const size = D.itemSize({ ...it, rotated: d.rotated }), cell = t.cell;
    const src = this.inv(d.source)!, dst = d.source === t.source ? src : this.inv(t.source)!;
    const error = placementError(src, dst, d.uid, t.x, t.y, d.rotated);
    const p = document.createElement('div'); p.className = `drop-preview${error ? ' invalid' : ''}`;
    p.style.cssText = `left:${t.x * cell}px;top:${t.y * cell}px;width:${size.w * cell}px;height:${size.h * cell}px`;
    t.grid.appendChild(p);
    if (foot) foot.textContent = error || `放置 ${D.ITEMS[it.id].name} × ${it.qty} · ${size.w}×${size.h} 格`;
  }
  private slotAt(cx: number, cy: number) {
    const slot = document.elementsFromPoint(cx, cy).find(n => (n as HTMLElement).dataset?.equipSlot !== undefined) as HTMLElement | undefined;
    return slot && this.el.contains(slot) ? slot : null;
  }
  private dropTarget(cx: number, cy: number, d: Drag) {
    const ghostLeft = cx - d.grabX, ghostTop = cy - d.grabY;
    const grid = (document.elementsFromPoint(cx, cy).find(n => (n as HTMLElement).dataset?.grid) as HTMLElement | undefined);
    if (!grid || !this.el.contains(grid)) return null;
    const r = grid.getBoundingClientRect(), cell = Number(grid.dataset.cell);
    return { grid, cell, source: grid.dataset.grid as Source, x: Math.round((ghostLeft - r.left) / cell), y: Math.round((ghostTop - r.top) / cell) };
  }
}
