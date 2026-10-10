import * as D from '../domain';
import type { CartView, FacilityInfo, HideoutSnapshot, RunWorld } from '../hideout-runtime/contract';
import { RECIPES } from '../expansion-state';
import { itemArt } from './items';
import { esc, gridHtml } from './grid';

export const btn = (label: string, act: string, cls = '', extra = '') => `<button class="${cls}" data-act="${act}" ${extra}>${label}</button>`;
const kindName: Record<D.ItemKind, string> = { weapon: '武器', ammo: '弹药', medical: '医疗用品', food: '食品', part: '零件', valuable: '贵重物资', quest: '任务物品', accessory: '饰品' };
const occupied = (inv: D.Inventory) => inv.items.reduce((n, i) => n + D.ITEMS[i.id].w * D.ITEMS[i.id].h, 0);
const icon = (id: string, px = 32) => `<img class="ico" alt="" src="${itemArt(id)}" style="height:${px}px">`;
const total = (s: HideoutSnapshot, id: string) => [s.profile.stash, s.profile.bag, s.profile.safe].reduce((n, inv) => n + D.count(inv, id), 0);
/** Supplies the station can use on the spot (the Runtime decides whether each one does anything now). */
export const SUPPLIES = ['bandage', 'medkit', 'antidote', 'water', 'food', 'analgesic', 'focus', 'strengthDose', 'constitutionDose', 'techniqueDose', 'luckySachet', 'unluckySachet'];

export function detailsHtml(item: D.Item | null, source: string | null, mode: 'gear' | 'shop') {
  if (!item) return `<aside class="details empty"><b>选中一件物品</b><span>单击查看 · 拖动整理${mode === 'gear' ? ' · 双击在仓库与背包间转移 · 拖动时按 R 旋转' : ' · 拖到待买或待卖，再统一结算'}</span></aside>`;
  const d = D.ITEMS[item.id], size = D.itemSize(item);
  const gun = D.WEAPONS[item.id] && item.id !== 'knife';
  const acts = mode === 'gear' ? [
    gun && source !== 'safe' ? btn('装备', 'equip', 'primary') : '',
    d.kind === 'accessory' ? btn('佩戴', 'charm-equip', 'primary') : '',
    SUPPLIES.includes(item.id) ? btn('使用', 'use') : '',
    source === 'stash' ? btn('放入背包', 'quick') : btn('放入仓库', 'quick'),
    btn(source === 'safe' ? '移回背包' : '放入安全箱', 'secure'),
    d.w !== d.h ? btn('旋转', 'rotate') : '',
    item.qty > 1 ? btn('拆分一半', 'split') : '',
  ].join('') : '';
  return `<aside class="details"><img class="dico" alt="" src="${itemArt(item.id)}"><div class="dtext"><small>${kindName[d.kind]}${item.relief ? ' · 救济 · 不可出售' : ''}</small><b>${esc(d.name)}${item.qty > 1 ? ` × ${item.qty}` : ''}</b><span>${esc(d.description)}</span></div><dl><div><dt>占用</dt><dd>${size.w} × ${size.h}</dd></div><div><dt>重量</dt><dd>${(d.weight * item.qty).toFixed(2)} kg</dd></div><div><dt>${mode === 'shop' ? '买价' : '售价'}</dt><dd>${mode === 'shop' ? (d.buy ? `¥ ${d.buy}` : '—') : item.relief ? '—' : `¥ ${d.sell * item.qty}`}</dd></div></dl><div class="dacts">${acts}</div></aside>`;
}

const charmRow = (charm: string | null) => charm ? `<div class="charm">${icon(charm, 20)}<span>护符 · ${esc(D.ITEMS[charm]?.name ?? charm)}</span>${btn('取下', 'charm-unequip', 'mini')}</div>` : '';

export function gearHtml(s: HideoutSnapshot, cell: number, selected: string | null, departure: { weight: number; carry: number }, details = '', charm: string | null = null) {
  const p = s.profile, e = p.equipment, w = D.WEAPONS[e.weapon || 'knife'];
  const ammo = w.ammo ? D.count(p.bag, w.ammo) : 0;
  const over = departure.weight > departure.carry;
  return `<div class="gear">
    <section class="col left">
      <h3><i>01</i>随身装备</h3>
      <div class="slot ${e.weapon ? '' : 'emptyslot'}" data-slot="weapon" title="把枪拖到这里装备">
        <img alt="" src="${itemArt(e.weapon || 'knife')}" style="height:${Math.round(cell * .6)}px"><div><b>${esc(w.name)}</b>
        <span>${e.weapon ? `弹匣 ${e.ammo} / ${w.magazine}${e.relief ? ' · 救济' : ''} · 背包备用 ${w.ammo ? `${ammo} 发` : '—'}` : '随身匕首 · 始终保留 · 把枪拖到这里装备'}</span></div>
        ${e.weapon ? btn('卸下', 'unequip', 'mini') : ''}
      </div>${charmRow(charm)}
      <h3><i>02</i>背包 <small>${occupied(p.bag)} / ${p.bag.w * p.bag.h} 格</small></h3>${gridHtml(p.bag, 'bag', cell, selected, { empty: '背包是空的' })}
      <div class="meter ${over ? 'over' : ''}"><span>携行重量 <small>含装备与安全箱</small></span><b>${departure.weight.toFixed(1)} <small>/ ${departure.carry.toFixed(1)} kg</small></b><i style="width:${Math.min(100, departure.weight / departure.carry * 100)}%"></i></div>
      <h3><i>安</i>安全箱 <small>撤离失败也保留</small></h3>${gridHtml(p.safe, 'safe', cell, selected)}
    </section>
    <section class="col stash"><h3><i>03</i>仓库 <small>${occupied(p.stash)} / ${p.stash.w * p.stash.h} 格 · 出击时留在站里</small></h3>${gridHtml(p.stash, 'stash', cell, selected, { empty: '仓库空置' })}
      <div class="upgrade">${p.upgraded ? '<span class="ok">已扩建 · 10 × 9 格</span>' : `${btn(`扩建仓库 · ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', '', !p.quests.repair ? 'disabled' : '')}<small>${p.quests.repair ? '扩建后增至 90 格' : `完成「${D.QUESTS.repair.name}」后可扩建`}</small>`}</div>
      ${details}
    </section>
  </div>${p.reliefSupplies?.length ? `<div class="relief">有救济补给待领取 ${btn('领取救济补给', 'relief')}</div>` : ''}`;
}

/**
 * Phones and short windows: two containers side by side (stacked when the screen is taller than wide), the second
 * one switchable, so every grid keeps cells of at least 36 px and full item names.
 */
export function gearCompactHtml(s: HideoutSnapshot, cell: number, selected: string | null, departure: { weight: number; carry: number }, paneB: 'stash' | 'safe', details: string, charm: string | null = null) {
  const p = s.profile, e = p.equipment, w = D.WEAPONS[e.weapon || 'knife'], ammo = w.ammo ? D.count(p.bag, w.ammo) : 0, over = departure.weight > departure.carry;
  const inv = paneB === 'stash' ? p.stash : p.safe;
  return `<div class="cgear">
    <div class="cbar"><div class="slot chip ${e.weapon ? '' : 'emptyslot'}" data-slot="weapon" title="把枪拖到这里装备"><img alt="" src="${itemArt(e.weapon || 'knife')}"><b>${esc(w.name)}</b><span>${e.weapon ? `${e.ammo} / ${w.magazine}${w.ammo ? ` · 备用 ${ammo}` : ''}` : '拖枪到这里装备'}</span>${e.weapon ? btn('卸下', 'unequip', 'mini') : ''}</div>
      <div class="cweight ${over ? 'over' : ''}">携行 <b>${departure.weight.toFixed(1)}</b> / ${departure.carry.toFixed(1)} kg</div></div>${charmRow(charm)}
    <div class="panes">
      <section class="pane"><h3>背包 <small>${occupied(p.bag)} / ${p.bag.w * p.bag.h}</small></h3><div class="pane-scroll">${gridHtml(p.bag, 'bag', cell, selected, { empty: '背包是空的' })}</div></section>
      <section class="pane"><nav class="seg tabs2">${btn(`仓库 <small>${occupied(p.stash)} / ${p.stash.w * p.stash.h}</small>`, 'pane:stash', paneB === 'stash' ? 'on' : '')}${btn('安全箱 <small>失败也保留</small>', 'pane:safe', paneB === 'safe' ? 'on' : '')}${paneB === 'stash' && !p.upgraded ? btn(`扩建 ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', 'mini grow', !p.quests.repair ? `disabled title="完成「${D.QUESTS.repair.name}」后可扩建"` : '') : ''}</nav><div class="pane-scroll">${gridHtml(inv, paneB, cell, selected, { empty: paneB === 'stash' ? '仓库空置' : '安全箱是空的' })}</div></section>
    </div>${details}</div>`;
}

/** Bought goods go to the stash by the existing rules; the buy grid is a shopping list (CartView.placement). */
const checkoutNote = '成交后自动放入仓库';
export function shopCompactHtml(c: CartView, cell: number, selected: string | null, cash: number, mode: 'buy' | 'sell') {
  const [a, b] = mode === 'buy' ? [['商人物品', c.catalog, 'merchant'], ['待买', c.buy, 'buy']] as const : [['仓库', c.stash, 'stash'], ['待卖', c.sell, 'sell']] as const;
  return `<div class="cshop">
    <nav class="seg tabs2">${btn(`买入 <small>${c.buy.items.length} 件 · ¥ ${c.totals.buy}</small>`, 'mode:buy', mode === 'buy' ? 'on' : '')}${btn(`卖出 <small>${c.sell.items.length} 件 · ¥ ${c.totals.sell}</small>`, 'mode:sell', mode === 'sell' ? 'on' : '')}</nav>
    <div class="panes">
      <section class="pane"><h3>${a[0]} <small>${mode === 'buy' ? '按包购买' : '整组出售'}</small></h3><div class="pane-scroll">${gridHtml(a[1], a[2], cell, selected)}</div></section>
      <section class="pane"><h3>${b[0]} <small>¥ ${mode === 'buy' ? c.totals.buy : c.totals.sell}${mode === 'buy' ? ` · ${checkoutNote}` : ''}</small></h3><div class="pane-scroll">${gridHtml(b[1], b[2], cell, selected, { empty: '拖到这里' })}</div></section>
    </div>
    <footer class="checkout compact"><div class="sum"><b class="${c.totals.net > cash ? 'bad' : ''}">${c.totals.net >= 0 ? `支出 ¥ ${c.totals.net}` : `收入 ¥ ${-c.totals.net}`}</b><small>结算后 ¥ ${(cash - c.totals.net).toLocaleString()}</small></div>${c.warnings.length ? `<p class="warn">${c.warnings.map(esc).join('<br>')}</p>` : ''}<div class="acts">${btn('清空', 'cart-reset', 'mini', c.dirty ? '' : 'disabled')}${btn('结算', 'cart-settle', 'primary', c.dirty ? '' : 'disabled')}</div></footer></div>`;
}

export function shopHtml(c: CartView, cell: number, selected: string | null, cash: number) {
  return `<div class="shop">
    <section><h3>商人物品 <small>按包购买</small></h3>${gridHtml(c.catalog, 'merchant', cell, selected)}</section>
    <section class="buffer"><h3>待买 <small>¥ ${c.totals.buy}</small></h3>${gridHtml(c.buy, 'buy', cell, selected, { empty: '拖到这里' })}<h3>待卖 <small>¥ ${c.totals.sell}</small></h3>${gridHtml(c.sell, 'sell', cell, selected, { empty: '拖到这里' })}</section>
    <section><h3>仓库 <small>整组出售</small></h3>${gridHtml(c.stash, 'stash', cell, selected)}</section>
  </div>
  <footer class="checkout"><div class="sum"><span>待买 ¥ ${c.totals.buy}</span><span>待卖 ¥ ${c.totals.sell}</span><b class="${c.totals.net > cash ? 'bad' : ''}">${c.totals.net >= 0 ? `支出 ¥ ${c.totals.net}` : `收入 ¥ ${-c.totals.net}`}</b><small>结算后现金 ¥ ${(cash - c.totals.net).toLocaleString()} · ${checkoutNote}</small></div>${c.warnings.length ? `<p class="warn">${c.warnings.map(esc).join('<br>')}</p>` : ''}<div class="acts">${btn('清空', 'cart-reset', '', c.dirty ? '' : 'disabled')}${btn('结算', 'cart-settle', 'primary', c.dirty ? '' : 'disabled')}</div></footer>`;
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
  return `<div class="radio"><div class="quests">${cards}</div><aside class="log"><small>水产站值守记录 · 第 ${s.day} 天</small><h4>${s.power === 'restored' ? '供电已恢复。' : '目前靠应急电源供电。'}</h4><p>出击前查好路线，涉水会积累污染。以下时间从出击开始计算。</p><dl><div><dt>04:30</dt><dd>电台预警，离开浅滩。</dd></div><div><dt>05:00</dt><dd>潮位变化，高架路与海堤仍可通行。</dd></div></dl><div class="stats"><div><b>${p.stats.runs}</b><span>累计出击</span></div><div><b>${p.stats.extracts}</b><span>成功撤离</span></div><div><b>${p.stats.kills}</b><span>击败敌人</span></div></div><p class="muted">交付时会扣除仓库、背包或安全箱中的所需物资。放进安全箱的任务物品，撤离失败也保留。</p></aside></div>`;
}

export function generatorHtml(s: HideoutSnapshot) {
  const q = D.QUESTS.repair, done = s.profile.quests.repair;
  const needs = Object.entries(q.needs).map(([item, n]) => ({ item, n, have: total(s, item) })), ready = needs.every(x => x.have >= x.n);
  return `<div class="gen"><div class="note-paper"><small>维修单</small><p>小蔡在水产市场留了备用物资：泵机零件三个、绝缘线圈两卷、陶瓷保险管一支。拿齐了就回来修电源。</p><p class="hand">旧交易厅后面配电间，我爸的工具柜，第二层。</p></div>
  <div class="gen-state ${done ? 'on' : ''}"><b>${done ? '供电正常' : '应急供电'}</b><span>${done ? '净水泵、电台和院里的灯都接上了。' : '只够电台和几盏应急灯。'}</span></div>
  ${done ? `<p class="muted">${esc(q.radio)}</p>` : `<ul class="needs">${needs.map(x => `<li class="${x.have >= x.n ? 'ok' : ''}">${icon(x.item, 24)}<span>${esc(D.ITEMS[x.item].name)}</span><b>${Math.min(x.have, x.n)} / ${x.n}</b></li>`).join('')}</ul>${btn('交付维修物资', 'quest:repair', ready ? 'primary wide' : 'wide', ready ? '' : 'disabled')}`}</div>`;
}

const WORLDS: { id: RunWorld; name: string; note: string }[] = [
  { id: 'coast', name: '沿海封锁区', note: '经典规则 · 每局 10 分钟' },
  { id: 'buildings', name: '沿海街区', note: '居民楼 · 可进入建筑' },
  { id: 'mall', name: '滨湾商场', note: '两层与露台' },
];
export function deployHtml(s: HideoutSnapshot, dep: { warnings: string[]; weight: number; carry: number }, world: RunWorld, seed: string) {
  const p = s.profile, e = p.equipment, w = D.WEAPONS[e.weapon || 'knife'];
  const meds = D.count(p.bag, 'bandage') + D.count(p.bag, 'medkit');
  const checks = [
    { ok: !!e.weapon, label: e.weapon ? `主武器 · ${w.name}` : '未装备主武器' },
    { ok: !w.ammo || D.count(p.bag, w.ammo) > 0, label: w.ammo ? `备用弹药 · ${D.ITEMS[w.ammo].name} ${D.count(p.bag, w.ammo)} 发` : '匕首 · 不需要弹药' },
    { ok: meds > 0, label: meds ? `止血用品 · ${meds} 件在背包` : '背包里没有止血用品' },
    { ok: dep.weight <= dep.carry, label: `携行重量 · ${dep.weight.toFixed(1)} / ${dep.carry.toFixed(1)} kg` },
    { ok: s.body.hp >= s.body.hpMax, label: `生命 · ${Math.floor(s.body.hp)} / ${s.body.hpMax}` },
  ];
  return `<div class="deploy"><h3>行动区域</h3><div class="worlds">${WORLDS.map(x => `<label class="world ${x.id === world ? 'on' : ''}"><input type="radio" name="world" value="${x.id}" ${x.id === world ? 'checked' : ''}><b>${x.name}</b><small>${x.note}</small></label>`).join('')}</div>
  <label class="seedrow">行动种子 <input id="seed" maxlength="16" placeholder="留空随机" value="${esc(seed)}" aria-label="行动种子"><small>输入相同的数字或文字，可重现本局初始配置。</small></label>
  <h3>出发前检查</h3><ul class="checks">${checks.map(c => `<li class="${c.ok ? 'ok' : 'bad'}"><i></i>${esc(c.label)}</li>`).join('')}</ul>
  <p class="rule">撤离失败会丢失背包物资和主武器，安全箱保留。出击即写入存档，院门打开后不能撤回。</p>
  <div class="go"><span>${dep.warnings.length ? esc(dep.warnings.join(' · ')) : '装备与快捷补给已备齐'}</span>${btn('开门出击 <span aria-hidden="true">→</span>', 'deploy', 'primary big')}</div></div>`;
}

export function facilityHtml(f: FacilityInfo, s: HideoutSnapshot, pendingSeconds = 0) {
  const pips = Array.from({ length: f.maxLevel }, (_, i) => `<i class="${i < f.level ? 'on' : ''}"></i>`).join('');
  const short = f.cost ? s.profile.cash < f.cost.cash || f.cost.items.some(i => i.have < i.qty) : false;
  const costHtml = f.cost ? `<div class="cost"><b>${f.level ? '升级' : '修建'}费用</b><ul><li class="${s.profile.cash >= f.cost.cash ? 'ok' : ''}"><span>现金</span><b>¥ ${f.cost.cash}</b></li>${f.cost.items.map(i => `<li class="${i.have >= i.qty ? 'ok' : ''}">${icon(i.id, 20)}<span>${esc(D.ITEMS[i.id].name)}</span><b>${Math.min(i.have, i.qty)} / ${i.qty}</b></li>`).join('')}</ul><small>只使用普通物资，救济物资不计入。</small>${f.locked ? `<p class="warn">${esc(f.locked)}</p>` : ''}${btn(f.locked ? '暂不能修建' : short ? '现金或材料不足' : f.level ? `升级到 ${f.level + 1} 级` : '修建设施', `build:${f.id}`, 'primary wide', f.locked || short ? 'disabled' : '')}</div>` : '<p class="ok">已达到最高等级。</p>';
  let extra = '';
  const b = s.base;
  if (f.id === 'training') {
    const names = { strength: '力量', constitution: '体质', technique: '技巧' } as const, seconds = Math.min(120, b.training.activeSeconds + pendingSeconds);
    extra = `<h4>主动练习</h4><p class="muted">选好练习项目，再到院里训练区（育苗池之间）实际走动，每满 120 秒获得一次练习收益；十分钟内共享 1 点训练量上限。每五秒存档一次。</p><div class="seg">${(Object.keys(names) as (keyof typeof names)[]).map(a => btn(names[a], `practice:${a}`, b.training.attribute === a ? 'on' : '')).join('')}</div><div class="bar"><span>本轮练习 ${Math.floor(seconds)} / 120 秒</span><i style="width:${seconds / 120 * 100}%"></i></div><div class="bar"><span>十分钟训练量 ${b.training.quantity.toFixed(2)} / 1 · 剩余 ${Math.ceil(b.training.windowLeft / 60)} 分</span><i style="width:${b.training.quantity * 100}%"></i></div>${f.level ? b.training.attribute ? '' : '<p class="warn">先选一个练习项目。</p>' : '<p class="warn">修建训练区后才能练习。</p>'}`;
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

export function bodyHtml(s: HideoutSnapshot) {
  const b = s.body, names = { strength: '力量', constitution: '体质', technique: '技巧' } as const;
  const bar = (label: string, v: number, max: number, cls = '') => `<div class="stat ${cls}"><span>${label}</span><b>${v.toFixed(0)}${max !== 100 || label === '生命' || label === '耐力' ? ` / ${max}` : ''}</b><i style="width:${Math.min(100, v / max * 100)}%"></i></div>`;
  return `<div class="body"><div class="stats2">${bar('生命', b.hp, b.hpMax, 'hp')}${bar('耐力', b.stamina, b.staminaMax)}${bar('精神', b.mental, 100)}${bar('水分', b.water, 100)}${bar('饱食', b.satiety, 100)}${bar('污染', b.pollution, 100, 'pol')}</div>
  <div class="attrs">${(Object.keys(names) as (keyof typeof names)[]).map(a => `<div><span>${names[a]}</span><b>${b.attributes[a].effective}</b><small>成长 ${(b.attributes[a].progress * 100).toFixed(1)}%</small></div>`).join('')}</div>
  ${b.effects.length ? `<p class="muted">状态：${b.effects.map(e => `${esc(e.name)} ${Math.ceil(e.seconds / 60)} 分`).join(' · ')}</p>` : ''}
  <p class="muted">负重上限 ${b.carry.toFixed(1)} kg。在站里休息会慢慢恢复，休息区和医疗区的等级越高恢复越快。</p></div>`;
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

export function menuHtml(volume: number) {
  return `<div class="menu">${btn('继续', 'close', 'primary wide')}<label class="vol">游戏音量 <b id="volv">${Math.round(volume * 100)}%</b><input id="vol" type="range" min="0" max="1" step="0.05" value="${volume}" aria-label="游戏音量"></label>${btn('操作说明', 'help', 'wide')}${btn('切换到旧版页签', 'tabs', 'wide')}
  <h4>本地存档</h4><p class="muted">更换浏览器或游玩地址前，请先导出备份。</p><div class="seg">${btn('导出存档', 'export')}${btn('导入存档', 'import')}</div><input id="backup-file" type="file" accept=".json,application/json" hidden>
  ${btn('返回主菜单', 'title', 'wide')}</div>`;
}

/** Save failed or another window took the save over: nothing else can be done until it is resolved. */
export function storageHtml(s: HideoutSnapshot) {
  const conflict = s.storage.conflict;
  return `<div class="storage"><p>${conflict ? '另一个窗口已经接管了存档，本页不能再写入。请先导出需要保留的进度，再刷新本页。' : '最近一次操作没能写入浏览器存档，已经回滚；训练和基地进度还保留在本页，重试成功前不会丢失。'}</p>
  <div class="acts">${conflict ? '' : btn('重试保存', 'retry-save', 'primary')}${btn('导出存档', 'export')}${conflict ? btn('刷新页面', 'reload') : ''}</div>
  <p class="muted">${conflict ? '刷新后会读取最新的存档。' : '也可以先导出备份，再检查浏览器存储空间或隐私设置。'}</p></div>`;
}

export function importConfirmHtml(name: string) {
  return `<div class="confirm"><p>用「${esc(name)}」覆盖当前存档？当前的物资、设施和成长都会被备份里的内容替换。</p><div class="acts">${btn('确认覆盖', 'import-confirm', 'danger')}${btn('取消', 'close')}</div></div>`;
}
