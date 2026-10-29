import { attachmentLines, gunPartsLine, saleLines, saleValue } from '../gunsmith/item-facts';
import * as D from '../domain';
import { countyMapHtml, deploymentRegion, deploymentWorld, regionBriefHtml, type CountyArt } from './deploy-map';
import type { Attribute, CartView, FacilityInfo, HideoutSnapshot, PerkBoard, RunWorld, TrainingProgress } from '../hideout-runtime/contract';
import { ATTRIBUTE_NAMES, PERK_UI, critContext, critView, perkPanel, perkWaiting, type CritView, type PerkCardView, type PerkPanelView, type PerkPreviewView } from '../perk-copy';
import { RECIPES } from '../expansion-state';
import { shopQuote, type ShopQuote, type ShopSource } from '../shop';
import { itemArt } from './items';
import { itemPicture } from '../art/item-images';
import { gridHtml } from './grid';
import { esc } from '../html';
import { SUPPLY_IDS } from '../rpg';

export const btn = (label: string, act: string, cls = '', extra = '') => `<button class="${cls}" data-act="${act}" ${extra}>${label}</button>`;
const kindName: Record<D.ItemKind, string> = { weapon: '武器', ammo: '弹药', medical: '医疗用品', food: '食品', part: '零件', valuable: '贵重物资', quest: '任务物品', accessory: '饰品', attachment: '配件' };
const occupied = (inv: D.Inventory) => inv.items.reduce((n, i) => n + D.ITEMS[i.id].w * D.ITEMS[i.id].h, 0);
const icon = (id: string, px = 32) => `<img class="ico" alt="" src="${itemArt(id)}" style="height:${px}px">`;
const total = (s: HideoutSnapshot, id: string) => [s.profile.stash, s.profile.bag, s.profile.safe].reduce((n, inv) => n + D.count(inv, id), 0);
/** Supplies the station can use on the spot (the Runtime decides whether each one does anything now). */

/** Shop price text on the item's trading side: 买入 / 卖出 with the whole pack or stack, or 不可出售. */
const quoteText = (q: ShopQuote) => q.total === null ? '不可出售' : `${q.side === 'buy' ? '买入' : '卖出'} ¥ ${q.total}`;

/** `uses` lists open quests that still need this item (shop mode); it joins the kind line so the height stays fixed. */
/** `profile`: the base the details look at for the guns an attachment fits (#28 M2-08). */
export function detailsHtml(item: D.Item | null, source: string | null, mode: 'gear' | 'shop', uses: string[] = [], profile: Readonly<D.SaveDataV1> | null = null) {
  if (!item) return `<aside class="details empty"><b>选中一件物品</b><span>单击查看${mode === 'gear' ? ' · 拖动整理 · 双击在仓库与背包间转移 · 拖动时按 R 旋转' : ' · 双击加入或放回 · 拖到待买或待卖，再统一结算'}</span></aside>`;
  const d = D.ITEMS[item.id], size = D.itemSize(item);
  const quote = mode === 'shop' ? shopQuote(source as ShopSource, item) : null;
  const usesText = uses.length ? ` · 任务用途：${esc(uses.join('、'))}` : '';
  // A gun sells as its body and parts (itemSale), never at the factory price (#28 M2-08).
  const sale = saleValue(item);
  const price = quote ? `<dt>${quote.side === 'buy' ? '买入' : '卖出'}</dt><dd>${quote.total === null ? '不可出售' : `¥ ${quote.total}`}</dd>` : `<dt>售价</dt><dd>${sale.value === null ? item.relief ? '—' : esc(sale.note ?? '') : `¥ ${sale.value}`}</dd>`;
  const gun = D.isGun(item.id), parts = gunPartsLine(item), lines = saleLines(item);
  // An attachment's maker, the guns it fits and which gun at the base takes it; a gun's parts; selling, each part's price.
  // Selling a gun with parts: its composition on one line (the details keep a fixed height), in place of the parts line.
  const selling = quote?.side === 'sell' && lines ? `出售构成：${lines.join(' · ')}` : null;
  const maker = [...attachmentLines(profile, item.id), ...selling ? [] : parts ? [parts] : []].map(l => `<span class="dmaker">${esc(l)}</span>`).join('')
    + (selling ? `<span class="dmaker dsale" title="${esc(selling)}">${esc(selling)}</span>` : '');
  const acts = mode === 'gear' ? [
    gun && source !== 'safe' ? btn('装备主武器', 'equip', 'primary') : '',
    gun ? btn('改装', 'gunsmith') : '',
    d.kind === 'accessory' ? btn('佩戴', 'charm-equip', 'primary') : '',
    SUPPLY_IDS.includes(item.id) ? btn('使用', 'use') : '',
    source === 'stash' ? btn('放入背包', 'quick') : btn('放入仓库', 'quick'),
    btn(source === 'safe' ? '移回背包' : '放入安全箱', 'secure', gun && source === 'safe' ? 'primary' : ''),
    d.w !== d.h ? btn('旋转', 'rotate') : '',
    item.qty > 1 ? btn('拆分一半', 'split') : '',
  ].join('') : '';
  return `<aside class="details"><img class="dico" alt="" src="${itemPicture(item, 999, 999).url}"><div class="dtext"><small${usesText ? ` title="${usesText.slice(3)}"` : ''}>${kindName[d.kind]}${item.relief ? ' · 救济 · 不可出售' : ''}${usesText}</small><b>${esc(d.name)}${item.qty > 1 ? ` × ${item.qty}` : ''}</b><span>${esc(d.description)}</span>${maker}</div><dl><div><dt>占用</dt><dd>${size.w} × ${size.h}</dd></div><div><dt>重量</dt><dd>${D.itemWeight(item).toFixed(2)} kg</dd></div><div>${price}</div></dl><div class="dacts">${acts}</div>${mode === 'gear' && gun && source === 'safe' ? '<p class="equip-note">安全箱里的枪械请先移回背包，再装备主武器。</p>' : ''}</aside>`;
}

const charmRow = (charm: string | null) => charm ? `<div class="charm">${icon(charm, 20)}<span>护符 · ${esc(D.ITEMS[charm]?.name ?? charm)}</span>${btn('取下', 'charm-unequip', 'mini')}</div>` : '';
export const gearActions = (p: Readonly<D.SaveDataV1>, hint = true) => `<div class="gear-actions">${btn('背包全部入库', 'stash-all', '', p.bag.items.length ? 'title="背包全部移入仓库，空间不足时全部留在原处；装备与安全箱不变"' : 'disabled title="背包是空的"')}${btn('整理仓库', 'sort-stash', '', p.stash.items.length ? 'title="只整理仓库：合并同类堆叠，大件优先排列，必要时旋转"' : 'disabled title="仓库是空的"')}${hint ? '<small>入库空间不足时全部留在原处；装备与安全箱不变。</small>' : ''}</div>`;

export function gearHtml(s: HideoutSnapshot, cell: number, selected: string | null, departure: { weight: number; carry: number }, details = '') {
  const p = s.profile, e = p.equipment, w = D.equippedWeapon(e);
  const ammo = w.ammo ? D.count(p.bag, w.ammo) : 0;
  const over = departure.weight > departure.carry;
  return `<div class="gear">
    <section class="col left" style="width:${p.bag.w * cell}px">
      <h3><i>01</i>主武器槽</h3>
      <div class="slot ${e.weapon ? '' : 'emptyslot'}" data-slot="weapon" aria-label="主武器槽" title="把仓库或背包里的枪拖到这里装备">
        <img alt="" src="${itemPicture({ id: e.weapon || 'knife', gun: e.gun }, 999, 999).url}" style="height:${Math.round(cell * .6)}px"><div><b>${esc(w.name)}</b>
        <span>${e.weapon ? `${w.magazine ? `弹匣 ${e.ammo} / ${w.magazine}` : '没装弹匣'}${e.relief ? ' · 救济' : ''} · 背包备用 ${w.ammo ? `${ammo} 发` : '—'}` : '随身匕首 · 始终保留 · 把枪拖到这里装备'}</span></div>
        ${e.weapon ? `<span class="slot-acts">${btn('改装', `gunsmith:${e.weaponUid}`, 'mini')}${btn('卸下', 'unequip', 'mini')}</span>` : ''}
      </div>${charmRow(s.charm?.id ?? null)}
      <h3><i>02</i>背包 <small>${occupied(p.bag)} / ${p.bag.w * p.bag.h} 格</small></h3>${gridHtml(p.bag, 'bag', cell, selected, { empty: '背包是空的' })}
      <div class="meter ${over ? 'over' : ''}"><span>携行重量 <small>含装备与安全箱</small></span><b>${departure.weight.toFixed(1)} <small>/ ${departure.carry.toFixed(1)} kg</small></b><i style="width:${Math.min(100, departure.weight / departure.carry * 100)}%"></i></div>
      <h3><i>安</i>安全箱 <small>撤离失败也保留</small></h3>${gridHtml(p.safe, 'safe', cell, selected)}
    </section>
    <section class="col stash" style="width:${p.stash.w * cell}px"><h3><i>03</i>仓库 <small>${occupied(p.stash)} / ${p.stash.w * p.stash.h} 格${p.upgraded ? ' · 已扩建' : ''} · 出击时留在站里${overflowNote(p.stash)}</small></h3><div class="stash-scroll">${gridHtml(p.stash, 'stash', cell, selected, { empty: '仓库空置' })}</div>
      ${p.upgraded ? '' : `<div class="upgrade">${btn(`扩建仓库 · ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', '', !p.quests.repair ? 'disabled' : '')}<small>${p.quests.repair ? `扩建后增至 ${D.STASH_W * D.STASH_UPGRADED_ROWS} 格` : `完成「${D.QUESTS.repair.name}」后可扩建`}</small></div>`}
      ${details}
    </section>
  </div>${p.reliefSupplies?.length ? `<div class="relief">有救济补给待领取 ${btn('领取救济补给', 'relief')}</div>` : ''}`;
}

/**
 * Phones and short windows: two containers side by side (stacked when the screen is taller than wide), the second
 * one switchable, so every grid keeps cells of at least 36 px and full item names.
 */
export function gearCompactHtml(s: HideoutSnapshot, cell: number, selected: string | null, departure: { weight: number; carry: number }, paneB: 'stash' | 'safe', details: string) {
  const p = s.profile, e = p.equipment, w = D.equippedWeapon(e), ammo = w.ammo ? D.count(p.bag, w.ammo) : 0, over = departure.weight > departure.carry;
  const inv = paneB === 'stash' ? p.stash : p.safe;
  return `<div class="cgear">${gearActions(p)}
    <p class="gear-hint">主武器槽 · 选中枪械后点「装备主武器」</p>
    <div class="cbar"><div class="slot chip ${e.weapon ? '' : 'emptyslot'}" data-slot="weapon" aria-label="主武器槽" title="把仓库或背包里的枪拖到这里装备"><img alt="" src="${itemPicture({ id: e.weapon || 'knife', gun: e.gun }, 999, 999).url}"><b>${esc(w.name)}</b><span>${e.weapon ? `${w.magazine ? `${e.ammo} / ${w.magazine}` : '没装弹匣'}${w.ammo ? ` · 备用 ${ammo}` : ''}` : '拖枪到这里装备'}</span>${e.weapon ? `<span class="slot-acts">${btn('改装', `gunsmith:${e.weaponUid}`, 'mini')}${btn('卸下', 'unequip', 'mini')}</span>` : ''}</div>
      <div class="cweight ${over ? 'over' : ''}">携行 <b>${departure.weight.toFixed(1)}</b> / ${departure.carry.toFixed(1)} kg</div></div>${charmRow(s.charm?.id ?? null)}
    <div class="panes">
      <section class="pane"><h3>背包 <small>${occupied(p.bag)} / ${p.bag.w * p.bag.h}</small></h3><div class="pane-scroll">${gridHtml(p.bag, 'bag', cell, selected, { empty: '背包是空的' })}</div></section>
      <section class="pane"><nav class="seg tabs2">${btn(`仓库 <small>${occupied(p.stash)} / ${p.stash.w * p.stash.h}</small>${D.stashOverflow(p.stash).length ? ' <b class="bad">溢出</b>' : ''}`, 'pane:stash', paneB === 'stash' ? 'on' : '')}${btn('安全箱 <small>失败也保留</small>', 'pane:safe', paneB === 'safe' ? 'on' : '')}${paneB === 'stash' && !p.upgraded ? btn(`扩建 ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', 'mini grow', !p.quests.repair ? `disabled title="完成「${D.QUESTS.repair.name}」后可扩建"` : '') : ''}</nav><div class="pane-scroll">${gridHtml(inv, paneB, cell, selected, { empty: paneB === 'stash' ? '仓库空置' : '安全箱是空的' })}</div></section>
    </div>${details}</div>`;
}

/** Bought goods go to the stash by the existing rules; the buy grid is a shopping list (CartView.placement). */
const checkoutNote = '成交后自动放入仓库';
/** The yard shop sells from the stash only; `outside` counts sellable stacks still in the bag or safe. */
const stashNote = (outside: number) => `整组出售${outside > 0 ? ` · 背包与安全箱 ${outside} 件需先入库` : ''}`;
/** The stash overflow (#28 M3-12) in a stash heading, while it holds something. */
const overflowNote = (stash: D.Inventory) => { const n = D.stashOverflow(stash).length; return n ? ` <b class="bad">溢出 ${n} 件 · 清空前不能出击</b>` : ''; };
export function shopCompactHtml(c: CartView, cell: number, sel: { src: string; uid: string } | null, cash: number, mode: 'buy' | 'sell', outside = 0) {
  const [a, b] = mode === 'buy' ? [['商人物品', c.catalog, 'merchant'], ['待买', c.buy, 'buy']] as const : [['仓库', c.stash, 'stash'], ['待卖', c.sell, 'sell']] as const;
  const selected = sel?.uid ?? null;
  // Compact layouts have no details panel: the pane holding the selected item shows its price in its one-line header.
  // Match source and uid like the desktop details: a quick move keeps the uid but leaves the old source selected,
  // and the destination pane must keep its running total.
  const picked = (inv: D.Inventory, src: ShopSource) => {
    const it = sel?.src === src ? inv.items.find(i => i.uid === sel.uid) : undefined;
    return it ? `${esc(D.ITEMS[it.id].short || D.ITEMS[it.id].name)} · ${quoteText(shopQuote(src, it))}` : null;
  };
  return `<div class="cshop">
    <nav class="seg tabs2">${btn(`买入 <small>${c.buy.items.length} 件 · ¥ ${c.totals.buy}</small>`, 'mode:buy', mode === 'buy' ? 'on' : '')}${btn(`卖出 <small>${c.sell.items.length} 件 · ¥ ${c.totals.sell}</small>`, 'mode:sell', mode === 'sell' ? 'on' : '')}</nav>
    <div class="panes">
      <section class="pane"><h3>${a[0]} <small>${picked(a[1], a[2]) ?? (mode === 'buy' ? '按包购买' : stashNote(outside) + overflowNote(c.stash))}</small></h3>${mode === 'buy' ? browseBar(c) : ''}<div class="pane-scroll">${gridHtml(a[1], a[2], cell, selected, mode === 'buy' ? { empty: '没有符合条件的商品' } : {})}</div></section>
      <section class="pane"><h3>${b[0]} <small>${picked(b[1], b[2]) ?? `¥ ${mode === 'buy' ? c.totals.buy : c.totals.sell}${mode === 'buy' ? ` · ${checkoutNote}` : ''}`}</small></h3><div class="pane-scroll">${gridHtml(b[1], b[2], cell, selected, { empty: '拖到这里' })}</div></section>
    </div>
    <footer class="checkout compact"><div class="sum"><b class="${c.totals.net > cash ? 'bad' : ''}">${c.totals.net >= 0 ? `支出 ¥ ${c.totals.net}` : `收入 ¥ ${-c.totals.net}`}</b><small>结算后 ¥ ${(cash - c.totals.net).toLocaleString()}</small></div>${c.stale ? '<p class="warn">仓库已改变，请刷新清单后重新选择物品。</p>' : ''}${c.warnings.length ? `<p class="warn">${c.warnings.map(esc).join('<br>')}</p>` : ''}<div class="acts">${btn(c.stale ? '刷新清单' : '清空', 'cart-reset', 'mini', c.dirty || c.stale ? '' : 'disabled')}${btn('结算', 'cart-settle', 'primary', c.dirty && !c.stale ? '' : 'disabled')}</div></footer></div>`;
}

/** Short category names for the catalog's buttons. */
const BROWSE_NAMES: Partial<Record<D.ItemKind, string>> = { weapon: '枪械', ammo: '弹药', part: '零件', attachment: '配件', medical: '医疗', food: '食品', valuable: '贵重', accessory: '饰品', quest: '任务' };
/**
 * The catalog's filter (#28 M2-08): all or one kind of the stock, only what fits the base's guns (when the stock has
 * attachments), and the pages when there is more than one.
 */
function browseBar(c: CartView) {
  const b = c.browse, kinds = ['all', ...b.kinds] as const;
  if (b.kinds.length < 2 && b.pages < 2) return '';
  const chips = kinds.map(k => btn(k === 'all' ? '全部' : BROWSE_NAMES[k] ?? k, `browse-kind:${k}`, k === b.kind ? 'on' : '', `aria-pressed="${k === b.kind}"`)).join('');
  const fits = b.kinds.includes('attachment') ? btn('只看适配我的枪', 'browse-fits', b.fits ? 'on' : '', `aria-pressed="${b.fits}"`) : '';
  const pager = b.pages > 1 ? `${btn('←', `browse-page:${b.page - 1}`, '', b.page ? 'aria-label="上一页"' : 'disabled aria-label="上一页"')}<small>${b.page + 1} / ${b.pages}</small>${btn('→', `browse-page:${b.page + 1}`, '', b.page < b.pages - 1 ? 'aria-label="下一页"' : 'disabled aria-label="下一页"')}` : '';
  return `<nav class="seg browse" aria-label="商品分类">${chips}${fits}${pager}</nav>`;
}
export function shopHtml(c: CartView, cell: number, selected: string | null, cash: number, outside = 0) {
  return `<div class="shop">
    <section><h3>商人物品 <small>按包购买</small></h3>${browseBar(c)}${gridHtml(c.catalog, 'merchant', cell, selected, { empty: '没有符合条件的商品' })}</section>
    <section class="buffer"><h3>待买 <small>¥ ${c.totals.buy}</small></h3>${gridHtml(c.buy, 'buy', cell, selected, { empty: '拖到这里' })}<h3>待卖 <small>¥ ${c.totals.sell}</small></h3>${gridHtml(c.sell, 'sell', cell, selected, { empty: '拖到这里' })}</section>
    <section><h3>仓库 <small>${stashNote(outside)}${overflowNote(c.stash)}</small></h3><div class="stash-scroll">${gridHtml(c.stash, 'stash', cell, selected)}</div></section>
  </div>
  <footer class="checkout"><div class="sum"><span>待买 ¥ ${c.totals.buy}</span><span>待卖 ¥ ${c.totals.sell}</span><b class="${c.totals.net > cash ? 'bad' : ''}">${c.totals.net >= 0 ? `支出 ¥ ${c.totals.net}` : `收入 ¥ ${-c.totals.net}`}</b><small>结算后现金 ¥ ${(cash - c.totals.net).toLocaleString()} · ${checkoutNote}</small></div>${c.stale ? '<p class="warn">仓库已改变，请刷新清单后重新选择物品。</p>' : ''}${c.warnings.length ? `<p class="warn">${c.warnings.map(esc).join('<br>')}</p>` : ''}<div class="acts">${btn(c.stale ? '刷新清单' : '清空', 'cart-reset', '', c.dirty || c.stale ? '' : 'disabled')}${btn('结算', 'cart-settle', 'primary', c.dirty && !c.stale ? '' : 'disabled')}</div></footer>`;
}

/** Selling goods an open quest still needs: the Runtime asks for this explicit confirmation (quest-sale token). */
export function saleConfirmHtml(warnings: string[]) {
  return `<div class="confirm"><p>这次出售会用掉还没完成的任务物资：</p><ul class="warnlist">${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul><div class="acts">${btn('确认出售', 'sale-confirm', 'primary')}${btn('再想想', 'close')}</div></div>`;
}

export function questsHtml(s: HideoutSnapshot) {
  const p = s.profile;
  const cards = Object.entries(D.QUESTS).map(([id, q], i) => {
    const done = p.quests[id], needs = Object.entries(q.needs).map(([item, n]) => ({ item, n, have: total(s, item) })), ready = needs.every(x => x.have >= x.n);
    return `<article class="quest ${done ? 'done' : ready ? 'ready' : ''}"><header><span>0${i + 1}</span><b>${esc(q.name)}</b><em>${done ? '已交付' : ready ? '可以交付' : '等待物资'}</em></header><p>${esc(q.description)}</p>${done ? `<p class="reply">${esc(q.radio)}</p>` : `<ul>${needs.map(x => `<li class="${x.have >= x.n ? 'ok' : ''}">${icon(x.item, 20)}<span>${esc(D.ITEMS[x.item].name)}</span><b>${Math.min(x.have, x.n)} / ${x.n}</b></li>`).join('')}</ul>`}<footer><b>¥ ${q.reward}</b><small>${id === 'repair' ? '另解锁仓库扩建与基地设施' : '任务报酬'}</small>${done ? '<span class="tick">已完成</span>' : btn('交付物资', `quest:${id}`, ready ? 'primary' : '', ready ? '' : 'disabled')}</footer></article>`;
  }).join('');
  return `<div class="radio"><div class="quests">${cards}</div><aside class="log"><small>水产站值守记录 · 累计出击 ${p.stats.runs} 次</small><h4>${s.power === 'restored' ? '供电已恢复。' : '目前靠应急电源供电。'}</h4><p>出击前查好路线，涉水会积累污染。以下时间从出击开始计算。</p><dl><div><dt>04:30</dt><dd>电台预警，离开浅滩。</dd></div><div><dt>05:00</dt><dd>潮位变化，高架路与海堤仍可通行。</dd></div></dl><div class="stats"><div><b>${p.stats.runs}</b><span>累计出击</span></div><div><b>${p.stats.extracts}</b><span>成功撤离</span></div><div><b>${p.stats.kills}</b><span>击败敌人</span></div></div><p class="muted">交付时会扣除仓库、背包或安全箱中的所需物资。放进安全箱的任务物品，撤离失败也保留。</p></aside></div>`;
}

export function generatorHtml(s: HideoutSnapshot) {
  const q = D.QUESTS.repair, done = s.profile.quests.repair;
  const needs = Object.entries(q.needs).map(([item, n]) => ({ item, n, have: total(s, item) })), ready = needs.every(x => x.have >= x.n);
  return `<div class="gen"><div class="note-paper"><small>维修单</small><p>小蔡在水产市场留了备用物资：泵机零件三个、绝缘线圈两卷、陶瓷保险管一支。拿齐了就回来修电源。</p><p class="hand">旧交易厅后面配电间，我爸的工具柜，第二层。</p></div>
  <div class="gen-state ${done ? 'on' : ''}"><b>${done ? '供电正常' : '应急供电'}</b><span>${done ? '净水泵、电台和院里的灯都接上了。' : '只够电台和几盏应急灯。'}</span></div>
  ${done ? `<p class="muted">${esc(q.radio)}</p>` : `<ul class="needs">${needs.map(x => `<li class="${x.have >= x.n ? 'ok' : ''}">${icon(x.item, 24)}<span>${esc(D.ITEMS[x.item].name)}</span><b>${Math.min(x.have, x.n)} / ${x.n}</b></li>`).join('')}</ul>${btn('交付维修物资', 'quest:repair', ready ? 'primary wide' : 'wide', ready ? '' : 'disabled')}`}</div>`;
}

export function deployHtml(s: HideoutSnapshot, dep: { warnings: string[]; weight: number; carry: number }, world: RunWorld, seed: string, worlds: readonly RunWorld[], preview: string | null, art: CountyArt['regions'], narrow: boolean) {
  const p = s.profile, e = p.equipment, w = D.WEAPONS[e.weapon || 'knife'], overflow = D.stashOverflow(p.stash).length, stop = D.deployBlocker(p);
  const region = deploymentRegion(worlds, world, preview), open = deploymentWorld(region, worlds) !== null, canDeploy = open && !stop;
  const bare = D.equippedMagless(e);
  const meds = D.count(p.bag, 'bandage') + D.count(p.bag, 'medkit');
  const checks = [
    { ok: !!e.weapon && !bare, label: e.weapon ? `主武器 · ${w.name}${bare ? ' · 没装弹匣' : ''}` : '未装备主武器' },
    { ok: !w.ammo || D.count(p.bag, w.ammo) > 0, label: w.ammo ? `备用弹药 · ${D.ITEMS[w.ammo].name} ${D.count(p.bag, w.ammo)} 发` : '匕首 · 不需要弹药' },
    { ok: meds > 0, label: meds ? `止血用品 · ${meds} 件在背包` : '背包里没有止血用品' },
    { ok: dep.weight <= dep.carry, label: `携行重量 · ${dep.weight.toFixed(1)} / ${dep.carry.toFixed(1)} kg` },
    { ok: s.body.hp >= s.body.hpMax, label: `生命 · ${Math.floor(s.body.hp)} / ${s.body.hpMax}` },
    // Only while an old save's overflow (#28 M3-12) still holds something.
    ...(overflow ? [{ ok: false, label: `仓库溢出区 · ${overflow} 件待取出` }] : []),
  ];
  const ready = checks.filter(c => c.ok).length, clear = canDeploy && !dep.warnings.length;
  return `<div class="deploy county-deploy">${countyMapHtml(region, worlds, narrow)}<aside class="county-briefing" aria-label="区域情报与出击准备">
  ${regionBriefHtml(region, worlds, art)}<div class="county-preflight"><h3>出发前检查<span class="${ready === checks.length ? 'ok' : 'bad'}">${ready} / ${checks.length}</span></h3><ul class="checks">${checks.map(c => `<li class="${c.ok ? 'ok' : 'bad'}"><i></i>${esc(c.label)}</li>`).join('')}</ul>
  <p class="rule">撤离失败会丢失背包物资和主武器，安全箱保留。出击即写入存档。</p></div>
  <div class="go"><span class="${clear ? 'ok' : ''}">${stop ? esc(stop) : canDeploy ? dep.warnings.length ? esc(dep.warnings.join(' · ')) : '装备与快捷补给已备齐' : '选择地图上已开放的区域即可出击。'}</span><div class="go-row">
  <label class="seedrow" title="相同种子可重现初始配置">种子 <input id="seed" maxlength="16" placeholder="留空随机" value="${esc(seed)}" aria-label="行动种子"></label>${btn(open ? '开门出击 <span aria-hidden="true">→</span>' : '暂未开发', 'deploy', 'primary big', canDeploy ? '' : 'disabled')}</div></div></aside></div>`;
}

export function trainingHint(t: TrainingProgress): string {
  if (t.status === 'conflict') return '存档已由另一窗口接管，练习暂停。';
  if (t.status === 'stale') return '存档已改变，请先导出待保存进度。';
  if (t.status === 'storage') return '练习等待保存，请重试保存或导出备份。';
  if (t.status === 'locked') return '当前不能练习。';
  if (t.status === 'unavailable') return '修建训练区后才能练习。';
  if (t.status === 'select') return '先选一个练习项目。';
  if (t.capped) return `十分钟训练量已达上限，等待 ${Math.ceil(t.windowLeft)} 秒。`;
  if (Object.values(t.pendingGrowth).some(n => n > 1e-9)) return '有练习收益待保存，保存后计入成长。';
  if (t.pendingWindow) return '新一轮练习待保存，保存后更新训练量。';
  if (t.windowExpired) return '下一次有效走动开始新一轮练习。';
  return '在训练区实际走动，每五秒保存。';
}
export const trainingSeconds = (t: TrainingProgress) => `已保存 ${t.saved.activeSeconds.toFixed(1)} 秒 · 待保存 ${t.pendingSeconds.toFixed(1)} 秒`;
/** The workbench's gunsmith entry (#28 M2-05): open at any workbench level, the bench needs no building (M0 decision 5). */
export const benchEntryHtml = () => `<div class="bench-entry"><div><b>改枪工作台</b><span>改装装备中和仓库、背包、安全箱里的枪。不用先修建工作台。</span></div>${btn('打开改枪', 'gunsmith', 'primary')}</div>`;
export function facilityHtml(f: FacilityInfo, s: HideoutSnapshot, training: TrainingProgress) {
  const pips = Array.from({ length: f.maxLevel }, (_, i) => `<i class="${i < f.level ? 'on' : ''}"></i>`).join('');
  const short = f.cost ? s.profile.cash < f.cost.cash || f.cost.items.some(i => i.have < i.qty) : false;
  const costHtml = f.cost ? `<div class="cost"><b>${f.level ? '升级' : '修建'}费用</b><ul><li class="${s.profile.cash >= f.cost.cash ? 'ok' : ''}"><span>现金</span><b>¥ ${f.cost.cash}</b></li>${f.cost.items.map(i => `<li class="${i.have >= i.qty ? 'ok' : ''}">${icon(i.id, 20)}<span>${esc(D.ITEMS[i.id].name)}</span><b>${Math.min(i.have, i.qty)} / ${i.qty}</b></li>`).join('')}</ul><small>只使用普通物资，救济物资不计入。</small>${f.locked ? `<p class="warn">${esc(f.locked)}</p>` : ''}${btn(f.locked ? '暂不能修建' : short ? '现金或材料不足' : f.level ? `升级到 ${f.level + 1} 级` : '修建设施', `build:${f.id}`, 'primary wide', f.locked || short ? 'disabled' : '')}</div>` : '<p class="ok">已达到最高等级。</p>';
  let extra = '';
  const b = s.base;
  if (f.id === 'training') {
    const names = { strength: '力量', constitution: '体质', technique: '技巧' } as const, seconds = Math.min(120, training.activeSeconds);
    extra = `<h4>主动练习</h4><p class="muted">选好练习项目，再到院里训练区（育苗池之间）实际走动，每满 120 秒获得一次练习收益；十分钟内共享 1 点训练量上限。每五秒存档一次。</p><div class="seg">${(Object.keys(names) as (keyof typeof names)[]).map(a => btn(names[a], `practice:${a}`, training.attribute === a ? 'on' : '')).join('')}</div><div class="bar"><span>本轮有效练习 ${Math.floor(seconds)} / 120 秒</span><i style="width:${seconds / 120 * 100}%"></i></div><p class="muted" data-training-seconds>${trainingSeconds(training)}</p><div class="bar"><span>已保存训练量 ${training.saved.quantity.toFixed(2)} / 1 · ${training.pendingWindow ? '上一轮' : `剩余 ${Math.ceil(training.windowLeft / 60)} 分`}</span><i style="width:${training.saved.quantity * 100}%"></i></div><p class="${training.status === 'ready' ? 'muted' : 'warn'}" data-training-status>${trainingHint(training)}</p>`;
  }
  if (f.id === 'workbench') {
    extra = `<h4>配方</h4>${(Object.keys(RECIPES) as (keyof typeof RECIPES)[]).map(id => { const r = RECIPES[id]; return `<div class="row">${icon(id, 24)}<span><b>${esc(D.ITEMS[id].name)} × ${r.result[0].qty}</b><small>${r.seconds / 60} 分钟 · ¥ ${r.cash} + ${r.materials.map(m => `${esc(D.ITEMS[m.id].name)} × ${m.qty}`).join('、')} · 工作台 ${r.level} 级${r.medical ? ' / 医疗区 1 级' : ''}</small></span>${btn('排入生产', `enqueue:${id}`, 'mini', f.level >= r.level ? '' : 'disabled')}</div>`; }).join('')}
    <h4>生产队列 ${b.queue.length} / ${f.level}</h4>${b.queue.map((q, i) => `<div class="row">${icon(q.recipe, 24)}<span><b>${esc(D.ITEMS[q.recipe].name)}</b><small>${i === 0 ? q.remaining === 0 ? '等待成品位' : `剩余 ${fmt(q.remaining)}` : '等待生产'}</small><i class="prog" style="width:${(1 - q.remaining / q.duration) * 100}%"></i></span>${i ? btn('取消并退款', `cancel:${q.id}`, 'mini') : ''}</div>`).join('') || '<p class="muted">队列空闲。</p>'}
    <h4>成品 ${b.completed.length} / 3</h4>${b.completed.map(q => `<div class="row ready">${icon(q.recipe, 24)}<span><b>${q.result.map(r => `${esc(D.ITEMS[r.id].name)} × ${r.qty}`).join('、')}</b><small>领取到</small></span>${btn('仓库', `claim:${q.id}:stash`, 'mini')}${btn('背包', `claim:${q.id}:bag`, 'mini')}${btn('安全箱', `claim:${q.id}:safe`, 'mini')}</div>`).join('') || '<p class="muted">还没有成品。</p>'}`;
  }
  if (f.id === 'blackmarket' && f.level) extra = '<p class="muted">船上的人只收货、不卖货。货单尚未开放。</p>';
  return `<div class="facility"><div class="lvl"><span class="pips">${pips}</span><b>${f.level ? `${f.level} 级` : '未修建'}</b></div><p>${esc(f.explanation)}</p>${costHtml}${extra}</div>`;
}
const fmt = (sec: number) => sec >= 60 ? `${Math.floor(sec / 60)} 分 ${Math.floor(sec % 60)} 秒` : `${Math.ceil(sec)} 秒`;

const EFFECT_NAMES: Record<string, string> = { pain: '疼痛', energized: '精力充沛', analgesia: '镇痛', focus: '专注', strength: '力量增强', constitution: '体质增强', technique: '技巧增强', injectionFatigue: '注射后疲劳', luck: '香包余韵' };
/** Body and growth: vitals, attributes, the perk board of one attribute (spec 5) and the static critical display (spec 2.3). */
export function bodyHtml(s: HideoutSnapshot, board: PerkBoard, attribute: Attribute) {
  const b = s.body;
  const bar = (label: string, v: number, max: number, cls = '') => `<div class="stat ${cls}"><span>${label}</span><b>${v.toFixed(0)}${max !== 100 || label === '生命' || label === '耐力' ? ` / ${max}` : ''}</b><i style="width:${Math.min(100, v / max * 100)}%"></i></div>`;
  return `<div class="body"><div class="stats2">${bar('生命', b.hp, b.hpMax, 'hp')}${bar('耐力', b.stamina, b.staminaMax)}${bar('精神', b.mental, 100)}${bar('水分', b.water, 100)}${bar('饱食', b.satiety, 100)}${bar('污染', b.pollution, 100, 'pol')}</div>
  <div class="attrs">${(Object.keys(ATTRIBUTE_NAMES) as Attribute[]).map(a => `<div><span>${ATTRIBUTE_NAMES[a]}</span><b>${b.attributes[a].effective}</b><small>成长 ${(b.attributes[a].progress * 100).toFixed(1)}%</small></div>`).join('')}</div>
  ${perksHtml(perkPanel(board, attribute))}${critHtml(critView(critContext(s, board)))}
  ${b.effects.length ? `<p class="muted">状态：${b.effects.map(e => `${esc(EFFECT_NAMES[e.name] ?? e.name)} ${Math.ceil(e.seconds / 60)} 分`).join(' · ')}</p>` : ''}
  <p class="muted">负重上限 ${b.carry.toFixed(1)} kg。在站里休息会慢慢恢复，休息区和医疗区的等级越高恢复越快。</p></div>`;
}
/** Only an open card on an unblocked board is a button; chosen, other-side and locked cards are plain text. */
const perkCard = (c: PerkCardView) => {
  const inner = `<b>${esc(c.name)}</b><span>${esc(c.effect)}</span>${c.status ? `<em>${esc(c.status)}</em>` : ''}`;
  return c.state === 'open' ? `<button class="pcard open" data-act="perk:${c.id}" ${c.enabled ? '' : 'disabled'}>${inner}</button>` : `<div class="pcard ${c.state}">${inner}</div>`;
};
function perksHtml(v: PerkPanelView) {
  const tabs = v.tabs.map(t => btn(`${t.name} <small>${esc(t.detail)}</small>`, `perk-attr:${t.attribute}`, t.attribute === v.attribute ? 'on' : '', `aria-pressed="${t.attribute === v.attribute}"`)).join('');
  return `<section class="perks"><h4>${PERK_UI.title} <small>${PERK_UI.hint}</small></h4><nav class="seg perk-tabs" aria-label="${PERK_UI.switcher}">${tabs}</nav>
  ${v.blocked ? `<p class="warn" data-perk-blocked>${esc(v.blocked)}</p>` : ''}${v.tiers.map(t => `<div class="ptier"><b>${t.tier}<small>级</small></b>${t.cards.map(perkCard).join('')}</div>`).join('')}
  <div class="preset">${btn(esc(v.reset.label), `perk-reset:${v.attribute}`, 'danger', v.reset.enabled ? '' : 'disabled')}<small>${esc(v.reset.reason ?? PERK_UI.resetHint)}</small></div></section>`;
}
function critHtml(c: CritView) {
  return `<section class="crit"><h4>${esc(c.title)}${c.total ? ` <b>${esc(c.total)}</b>` : ''}</h4>${c.rows.length ? `<ul>${c.rows.map(r => `<li><span>${esc(r.label)}</span><b>${esc(r.text)}</b></li>`).join('')}</ul>` : ''}${c.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}</section>`;
}
/** Choice or reset preview from the Runtime; the confirm commits exactly what it shows (token). */
export function perkConfirmHtml(v: PerkPreviewView, reset: boolean) {
  return `<div class="confirm perk-confirm"><p class="ptitle"><b>${esc(v.title)}</b><small>${esc(v.subtitle)}</small></p>${v.lines.map(l => `<p>${esc(l)}</p>`).join('')}${v.note ? `<p class="muted">${esc(v.note)}</p>` : ''}
  ${v.changes.length ? `<ul class="pchanges">${v.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${v.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}
  <div class="acts">${btn(esc(v.confirm), 'perk-ok', reset ? 'danger' : 'primary')}${btn(PERK_UI.cancel, 'close', 'perk-cancel')}</div></div>`;
}

export function boardHtml() {
  const rows = [['第一排', '船工宿舍 · 字被雨泡开了'], ['第二排', '南湾冰鲜 · 名字看不清'], ['第三排', '蔡建平 · 水产市场电工'], ['第四排', '西线国道大巴 · 一家四口']];
  return `<div class="board"><p class="muted">食堂门口的寻人板。纸条压在图钉下面，被雨打湿过又晾干。</p><ul>${rows.map(([r, n]) => `<li><small>${r}</small><b>${esc(n)}</b></li>`).join('')}</ul><p class="hand">第三排是小蔡的字。</p></div>`;
}

export function reportHtml(summary: D.RunSummary, s: HideoutSnapshot) {
  const ok = summary.outcome === 'extract';
  return `<div class="report ${ok ? 'ok' : 'bad'}"><div class="stamp">行动报告 <b>${ok ? '成功撤离' : '撤离失败'}</b></div><h2>${ok ? '你回来了。' : summary.outcome === 'timeout' ? '撤离时间已过。' : '未能撤离。'}</h2><p>${esc(summary.message)}</p><div class="stats"><div><b>${summary.kills}</b><span>击败敌人</span></div><div><b>¥ ${summary.keptValue}</b><span>保留物资估值</span></div><div><b>${s.profile.stats.extracts} / ${s.profile.stats.runs}</b><span>累计撤离 / 出击</span></div></div>${btn('回到站里', 'close', 'primary wide')}</div>`;
}

export function helpHtml(touch: boolean) {
  const rows = touch ? [['左下摇杆', '走动'], ['点地面', '走到那里'], ['点人或设施', '走过去并打开'], ['交互', '和附近的人或设施互动'], ['右下快捷栏', '整备、修理铺、卫生所、任务、设施、身体、出击，窄屏收在“功能”里'], ['页签', '切换到旧版页签界面（备用入口）'], ['面板标题', '点标题切换到其他功能']] :
    [['WASD / 方向键', '走动，按住 Shift 快走'], ['E / 空格', '和附近的人或设施互动'], ['鼠标左键', '点地面走过去；点人或设施会走过去并打开'], ['1 – 7', '直接打开：整备、修理铺、卫生所、任务、设施、身体、出击（面板上方的页签也能切换）'], ['Tab / J / C / G', '整备 / 电台任务 / 身体与成长 / 出击准备（旧快捷键照常可用）'], ['0', '切换到旧版页签界面（备用入口）'], ['滚轮 / + -', '缩放视野'], ['Esc', '关闭面板 / 菜单'], ['拖动物品时按 R', '旋转']];
  return `<div class="help"><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div>`;
}

/** `resetCopy`: a pre-reset copy is stored locally, so the menu also offers to restore it. */
export function menuHtml(volume: number, resetCopy = false) {
  return `<div class="menu">${btn('继续', 'close', 'primary wide')}<label class="vol">游戏音量 <b id="volv">${Math.round(volume * 100)}%</b><input id="vol" type="range" min="0" max="1" step="0.05" value="${volume}" aria-label="游戏音量"></label>${btn('操作说明', 'help', 'wide')}${btn('切换到旧版页签', 'tabs', 'wide')}
  <h4>本地存档</h4><p class="muted">更换浏览器或游玩地址前，请先导出备份。</p><div class="seg">${btn('导出存档', 'export')}${btn('导入存档', 'import')}</div>
  ${btn('清空存档，重新开始', 'reset', 'danger wide')}${resetCopy ? btn('恢复清空前的存档', 'reset-restore', 'wide') : ''}
  ${btn('返回主菜单', 'title', 'wide')}</div>`;
}

/** Fresh start confirmation (yard menu only): a backup download and a local copy come before the wipe. */
export function resetConfirmHtml() {
  return `<div class="confirm"><p>除音量设置外，现金、物资、仓库扩容、任务、设施、身体、成长和出击记录都会回到新开局。</p><p class="muted">确认后会先下载一份当前存档的备份，本机也会另存一份，需要时可在菜单「恢复清空前的存档」找回。本机只保存一份；当前存档如果还是没动过的新开局，就不另存，原来那一份保留。</p><div class="acts">${btn('下载备份并清空', 'reset-confirm', 'danger')}${btn('再想想', 'close')}</div></div>`;
}

/**
 * Save failed or another window took the save over: nothing else can be done until it is resolved. `pending` names a
 * perk change whose write failed: the Runtime keeps it, and only the retry writes it (once).
 */
export function storageHtml(s: HideoutSnapshot, pending = '') {
  if (s.storage.reloadRequired && !s.storage.conflict) return `<div class="storage"><p>进度已写入存档，但当前页面恢复失败。请导出备份后刷新页面；本页不会再次写入。</p><div class="acts">${btn('导出存档', 'export')}${btn('刷新页面', 'reload')}</div></div>`;
  const conflict = s.storage.conflict;
  return `<div class="storage"><p>${conflict ? '另一个窗口已经接管了存档，本页不能再写入。请先导出需要保留的进度，再刷新本页。' : pending ? esc(perkWaiting(pending)) : '最近一次操作没能写入浏览器存档，已经回滚；训练和基地进度还保留在本页，重试成功前不会丢失。'}</p>
  <div class="acts">${conflict ? '' : btn('重试保存', 'retry-save', 'primary')}${btn('导出存档', 'export')}${conflict ? btn('刷新页面', 'reload') : ''}</div>
  <p class="muted">${conflict ? '刷新后会读取最新的存档。' : '也可以先导出备份，再检查浏览器存储空间或隐私设置。'}</p></div>`;
}

export function importConfirmHtml(name: string) {
  return `<div class="confirm"><p>用「${esc(name)}」覆盖当前存档？当前的物资、设施和成长都会被备份里的内容替换。</p><div class="acts">${btn('确认覆盖', 'import-confirm', 'danger')}${btn('取消', 'close')}</div></div>`;
}
