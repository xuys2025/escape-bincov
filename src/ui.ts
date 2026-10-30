import { attachmentLines, gunPartsLine, saleLines, saleValue } from './gunsmith/item-facts';
import { departureWarnings } from './qol';
import * as Shop from './shop';
import * as D from './domain';
import { generateRun } from './world';
import { SURVIVAL } from './balance';
import { decodePortableBackup } from './save-backup';
import { SESSION_MAX_BYTES } from './recovery-store';
import { app, audio, saveSession, hideoutRuntime } from './app';
import type { SessionMutation } from './session';
import { titleScreen } from './title-screen';
import { moveQuantity, placementError } from './loot';
import { transferBagToStash, organizeStash } from './inventory-actions';
import { ATTRIBUTES, EFFECTS, FACILITIES, RECIPES, derivedLimits, effectiveAttributes, rpgEnabled, type ExpansionState, type Facility } from './expansion-state';
import { craftPremium, premiumOrders, PREMIUM_LOCKED_NOTE, PREMIUM_OPEN_NOTE } from './gunsmith/premium';
import { FACILITY_COSTS, FACILITY_NAMES, buildFacility, enqueueProduction, claimProduction, cancelProduction } from './base';
import { equipCharm, unequipCharm, reputationTier } from './reputation-luck';
import { mallRunConfig } from './mall-world';
import { useRpgItem } from './rpg';
import type { ExpansionDraft } from './session';
import type { Attribute, Result } from './hideout-runtime/contract';
import { PERK_UI, choicePreview, critContext, critView, defaultPerkAttribute, perkDone, perkFailure, perkPanel, perkPendingName, perkRetried, perkWaiting, resetPreview,
    type CritView, type PerkCardView, type PerkPanelView, type PerkPreviewView } from './perk-copy';
import { paintItem } from './art/items';
import { artId, itemArtwork, painted } from './art/item-images';
import { paintPortrait } from './art/portraits';
import { sampleSupports, startCoastSample } from './coast-view/sample';
import { enterStation, returnToStation, stationDefault } from './station-view/route';
import { raidWorlds, sampleMallLayout, sampleMode, villageSeed } from './raid-areas';
import { provideNavigation } from './navigation';
import { exportSave } from './save-export';
import { toast } from './toast';
import { openingAutoplay, playOpening } from './opening/gate';
import { showScreen, titleScene } from './screen';
import { esc } from './html';
import { SUPPLY_IDS } from './rpg';
import { Workbench } from './gunsmith-view/bench';
// The raid view and the station yard switch screens through this port rather than importing the page.
provideNavigation({ changeState, enterExternalRun, render, hideoutExternal, startPreparedHideoutRaid });
let phoneLayout = false;
/** Phone layout, set by main.ts from the device and screen size: a presentation choice, not an input mode. */
export function setPhoneLayout(on: boolean) { phoneLayout = on; }
const touchLayout = () => phoneLayout;
/** The gunsmith workbench overlay (#28 M2-05): the yard's panel, on the same HideoutRuntime. */
let bench: Workbench | null = null;
function openBench(gun: string) {
    // A failed write shows the page's own storage alarm on the next paint; the toast says what happened.
    bench = new Workbench(hideoutRuntime, gun, { toast: text => toast(text), sound: () => {}, storage: () => render() });
    setOverlay('gunsmith');
}
function benchOverlayHtml(b: Workbench) {
    // On phones the panel brings its own header with the page tabs and the close button.
    const head = touchLayout() ? '' : `<header><h2>改枪工作台</h2><span>选好配件，按「确认」才会改到枪上</span><b>现金 ¥ ${app.save.cash.toLocaleString()}</b><button type="button" data-gs="close">关闭 <kbd>Esc</kbd></button></header>`;
    return `<div class="overlay gs-page"><section class="panel modal gs-host${touchLayout() ? ' phone' : ''}" role="dialog" aria-modal="true" aria-label="改枪工作台">${head}${b.html({ compact: touchLayout() })}</section></div>`;
}
type InventoryDrag = { uid: string; source: string; token: number; rotated?: boolean };
let activeDrag: InventoryDrag | null = null;
let dragToken = 0;
let pointerDrag: { pointerId: number; drag: InventoryDrag; startX: number; startY: number; x: number; y: number; cell: number; started: boolean } | null = null;
let dragGhost: HTMLElement | null = null;
let suppressDragClick = false;
/** Body and growth tab: the perk attribute shown (set on first paint), the open preview, and a change waiting for the retry. */
let perkAttr: Attribute | null = null;
let perkDialog: { kind: 'choice'; id: string; token: string; view: PerkPreviewView } | { kind: 'reset'; attribute: Attribute; token: string; view: PerkPreviewView } | null = null;
let perkPending = '';
const ui = () => document.getElementById('ui')!;
function clearSelection() { app.selected = ''; app.placement = false; app.placementRotated = undefined; app.placementQuantity = undefined; }
function saved(ok: boolean): boolean {
    if (!ok && !app.conflict && !app.storageOK)
        toast(saveSession.requiresReload ? app.storageError : '存档保存失败。请检查浏览器是否允许保存数据，然后重试。');
    return ok;
}
export function persist(save: D.SaveDataV1 = app.save): boolean {
    return saved(saveSession.persist(save));
}
export function initSave(owned = true) {
    saved(saveSession.initialize(owned));
    audio.setVolume(app.save.settings.volume);
}
/** Hand the hideout view to the station yard: state is already 'hideout' (set by the Runtime) and the old page is cleared. */
export function hideoutExternal(): boolean {
    if (app.pendingSettlement) { setOverlay('save-error'); return false; }
    app.overlay = ''; app.shop = null; clearSelection();
    showScreen('none', app.menuMotion); render(); return true;
}
/** The old tab page's way back into the walking hideout: the station yard. */
function walkIn() { void enterStation(); }
/** Title "enter": the yard by default, the old tab page as the fallback; reports an interrupted raid once. */
function enterHideout() {
    if (stationDefault()) void enterStation(); else changeState('hideout');
    if (app.recovery) {
        toast('上次行动中断，已按撤离失败处理。安全箱内的物品和水手匕首保留。');
        app.recovery = false;
    }
}
const walkInLabel = () => '回到院子';
/** Enter the run state for the raid host (coast-view/sample.ts), which draws and owns the whole raid. */
export function enterExternalRun() { app.state = 'run'; app.overlay = ''; clearSelection(); showScreen('none', app.menuMotion); render(); }
/** Switch the page's own screens (title, tab page, result); a raid always goes through enterExternalRun. */
export function changeState(state: Exclude<typeof app.state, 'run'>) {
    if (state === 'hideout' && !app.pendingSettlement && !saved(saveSession.ensureRpg())) return;
    if (app.pendingSettlement) { setOverlay('save-error'); return; }
    app.state = state; app.overlay = ''; clearSelection();
    if (state === 'hideout') saved(saveSession.grantRelief());
    showScreen(state, app.menuMotion); render();
}
const btn = (label: string, action: string, cls = '', extra = '') => `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
function preparedWeight(){const s=app.save,w=D.equippedWeapon(s.equipment);return D.weight(s.bag)+D.weight(s.safe)+D.ITEMS.knife.weight+D.equippedWeight(s.equipment)+(w.ammo?D.ITEMS[w.ammo].weight*s.equipment.ammo:0)+(app.expansion?.charm ? D.ITEMS[app.expansion.charm.id].weight : 0);}
function inventoryCell() { return !touchLayout() && innerWidth >= 1700 && innerHeight >= 900 ? 80 : 54; }
function itemIcon(id: string, small = false) {
    const size = small ? 24 : 32, art = artId(id), url = art ? painted(`item-${small ? 'small-' : ''}${art}`, size, size, c => paintItem(c, art, size)) : '';
    return url ? `<img class="item-icon${small ? ' compact-icon' : ''}" width="${small ? 24 : 32}" height="${small ? 24 : 32}" alt="" draggable="false" src="${url}">` : '';
}
function merchantPortrait(id: string): string {
    const url = id === 'arms' || id === 'med' ? painted(`portrait-${id}`, 48, 48, c => paintPortrait(c, id)) : '';
    return url ? `<img class="merchant-portrait" width="48" height="48" alt="" draggable="false" src="${url}">` : '';
}
function shopping() { return app.state === 'hideout' && ['arms', 'med'].includes(app.tab); }
/** The catalog's filter and page on this page (#28 M2-08); it holds across merchants and checkouts. */
let shopBrowse: Shop.ShopBrowse = Shop.BROWSE_ALL;
function cart() {
    if (!app.shop || app.shop.merchant !== app.tab) {
        // A kind the other merchant does not stock falls back to all.
        if (shopBrowse.kind !== 'all' && !Shop.stockKinds(app.tab as Shop.Merchant, app.save, rpgEnabled(app.expansion)).includes(shopBrowse.kind)) shopBrowse = Shop.BROWSE_ALL;
        app.shop = Shop.createCart(app.save, app.tab as Shop.Merchant, rpgEnabled(app.expansion), shopBrowse);
    }
    return app.shop;
}
/** The filter buttons above the catalog: all or one kind, only what fits the base's guns, the pages. */
function shopBrowseBar(): string {
    const merchant = app.tab as Shop.Merchant, rpg = rpgEnabled(app.expansion), kinds = Shop.stockKinds(merchant, app.save, rpg);
    const page = Shop.catalogPage(app.save, merchant, rpg, shopBrowse);
    if (kinds.length < 2 && page.pages < 2) return '';
    const chip = (id: string, label: string, on: boolean) => btn(label, 'shop-browse', on ? 'active' : '', `data-id="${id}" aria-pressed="${on}"`);
    const chips = ['all', ...kinds].map(k => chip(`kind:${k}`, k === 'all' ? '全部' : kindName[k as D.ItemKind], shopBrowse.kind === k)).join('');
    const fits = kinds.includes('attachment') ? chip('fits', '只看适配我的枪', shopBrowse.fits) : '';
    const pager = page.pages > 1 ? `${btn('←', 'shop-browse', '', `data-id="page:${page.page - 1}" ${page.page ? '' : 'disabled'}`)}<small>${page.page + 1} / ${page.pages}</small>${btn('→', 'shop-browse', '', `data-id="page:${page.page + 1}" ${page.page < page.pages - 1 ? '' : 'disabled'}`)}` : '';
    return `<div class="shop-browse">${chips}${fits}${pager}</div>`;
}
function inventory(source: string): D.Inventory {
    if (shopping() && ['merchant', 'buy', 'sell', 'stash'].includes(source)) return Shop.shopInventory(cart(), source as Shop.ShopSource);
    if (source !== 'bag' && source !== 'safe' && source !== 'stash') throw new Error('无效物品栏。');
    return app.save[source];
}
const kindName: Record<D.ItemKind, string> = {
    weapon: '武器', ammo: '弹药', medical: '医疗用品', food: '食品',
    part: '零件', valuable: '贵重物资', quest: '任务物品', accessory: '饰品', attachment: '配件',
};
/**
 * The gunsmith lines under an item's description (#28 M2-08): an attachment's maker and guns and, at the base, which
 * gun there takes it; a gun's parts. '' for other items.
 */
function attachmentLine(item: Pick<D.Item, 'id' | 'gun'>, cls: string): string {
    const parts = gunPartsLine(item), lines = [...attachmentLines(app.state === 'hideout' ? app.save : null, item.id), ...parts ? [parts] : []];
    return lines.map(l => `<p class="${cls}">${esc(l)}</p>`).join('');
}
function occupied(inv: D.Inventory) {
    return inv.items.reduce((sum, item) => sum + D.ITEMS[item.id].w * D.ITEMS[item.id].h, 0);
}
function equipmentPanel(equipment: D.Equipment, bag: D.Inventory, safe: D.Inventory) {
    const weapon = D.equippedWeapon(equipment);
    const ammo = equipment.ammo;
    return `<section class="safe-section equipment-section"><h3 class="section-title"><b class="section-number">01</b>随身装备 <span>携行</span></h3><div class="equip"><div class="equipment-caption"><span>${equipment.weapon ? '主武器' : '随身匕首'}</span>${equipment.relief ? '<span class="orange">救济</span>' : ''}</div><div class="equipped-icon">${itemArtwork({ id: weapon.id, gun: equipment.gun }, inventoryCell() === 80 ? 312 : 204, inventoryCell() === 80 ? 102 : 52)}</div><div class="equipment-name"><strong>${weapon.name}</strong>${equipment.weapon ? `<span id="equipped-ammo">${weapon.magazine ? `${ammo} / ${weapon.magazine}` : '没装弹匣'}</span>` : '<span>始终保留</span>'}</div>${equipment.weapon ? btn('卸下主武器', 'unequip', 'text-button') : ''}${equipment.weapon && equipment.weaponUid && app.state === 'hideout' ? btn('改装', 'gunsmith-open', 'text-button', `data-id="${equipment.weaponUid}"`) : ''}</div>${weapon.ammo ? `<p class="reserve-ammo">背包备用弹药 <span>${D.ITEMS[weapon.ammo].name} · ${D.count(bag, weapon.ammo)} 发</span></p>` : '<p class="reserve-ammo">装备枪械后，备用弹药放在背包。</p>'}<h3 class="section-title secure-heading">安全箱 <span>失败也保留</span></h3><div class="secure-kit">${grid(safe, 'safe')}<div class="knife-card">${itemIcon('knife')}<strong>水手匕首</strong><span>随身携带<br>始终保留</span></div></div></section>`;
}
function bagPanel(bag: D.Inventory, weight: number) {
    const limit = carryLimit();
    return `<section class="bag-section loot-player"><h3 class="section-title"><b class="section-number">02</b>背包 <span>${occupied(bag)} / ${bag.w * bag.h} 格</span></h3>${grid(bag, 'bag')}<div class="load-meter ${weight > limit ? 'overloaded' : ''}"><span>携行重量</span><strong><span>${weight.toFixed(1)}</span> <small>/ ${limit} kg</small></strong><i style="width:${Math.min(100, weight / limit * 100)}%"></i></div><div class="inv-help">含装备、弹药与安全箱</div></section>`;
}
function grid(inv: D.Inventory, source: string, cell = inventoryCell()) {
    if (touchLayout()) cell = 54;
    if (touchLayout() && source === 'stash' && !app.inventoryGrid && !shopping())
        return `<div class="inventory-list">${inv.items.map(i => `<button class="inventory-row" data-uid="${i.uid}" data-item-id="${i.id}" data-source="${source}" aria-pressed="${app.selected === i.uid}">${itemIcon(i.id)}<span><strong>${D.ITEMS[i.id].name}</strong><small>${D.itemSize(i).w} × ${D.itemSize(i).h} 格 · ${D.itemWeight(i).toFixed(2)} kg${i.relief ? ' · 救济' : ''}</small></span><b>× ${i.qty}</b></button>`).join('') || '<p class="muted">仓库空置</p>'}</div>`;

    // The stash overflow (#28 M3-12) shows below the grid, marked; nothing can be placed there.
    const rows = D.stashShownRows(inv), band = rows > inv.h ? `<div class="overflow-band" style="top:${inv.h * cell}px;height:${(rows - inv.h) * cell}px"><span>溢出区 · 只能取出，清空后才能出击</span></div>` : '';
    return `<div class="grid" data-grid="${source}" data-cell="${cell}" style="width:${inv.w * cell}px;height:${rows * cell}px;--cell:${cell}px">${band}${inv.items.map(i => {
        const d = D.ITEMS[i.id];
        const size = D.itemSize(i);
        return `<div tabindex="0" role="button" aria-label="${d.name} × ${i.qty}" aria-pressed="${app.selected === i.uid}" title="${d.name} × ${i.qty} · ${D.itemWeight(i).toFixed(2)} kg" draggable="false" data-uid="${i.uid}" data-item-id="${i.id}" data-source="${source}" data-kind="${d.kind}" class="item ${app.selected === i.uid ? 'selected' : ''}" style="left:${i.x * cell + 1}px;top:${i.y * cell + 1}px;width:${size.w * cell - 2}px;height:${size.h * cell - 2}px"><span class="inventory-art">${itemArtwork(i, size.w * cell - 10, size.h * cell - 27, !!i.rotated)}</span><span class="item-label ${i.relief ? 'relief' : ''}">${d.short || d.name}</span>${i.qty > 1 ? `<span class="qty">${i.qty}</span>` : ''}</div>`;
    }).join('')}${placementCells(inv, source, cell)}${!inv.items.length ? '<div class="empty-hint">暂无物品</div>' : ''}</div>`;
}
function placementCells(inv: D.Inventory, source: string, cell: number) {
    const item = app.placement ? inventory(app.selectedSource).items.find(i => i.uid === app.selected) : null;
    if (!item) return '';
    return Array.from({ length: inv.w * inv.h }, (_, index) => {
        const x = index % inv.w, y = Math.floor(index / inv.w);
        return (shopping() ? !Shop.shopPlacementError(cart(), app.selectedSource as Shop.ShopSource, source as Shop.ShopSource, item.uid, x, y) : !placementError(inventory(app.selectedSource), inv, item.uid, x, y, app.placementRotated, app.placementQuantity))
            ? `<i class="placement-cell" style="left:${x * cell}px;top:${y * cell}px;width:${cell}px;height:${cell}px"></i>` : '';
    }).join('');
}
function placementControls() {
    const item = app.selected ? selected() : null, size = item ? D.itemSize({ ...item, rotated: app.placementRotated ?? item.rotated }) : null;
    return app.placement ? `<div class="placement-controls"><span class="placement-hint">${app.placementRotated !== undefined && size ? `旋转预览 ${size.w} × ${size.h} 格：` : ''}${app.placementQuantity ? `拆分 ${app.placementQuantity} 件：` : ''}点选虚线格位确认，取消会保留原位置。</span>${!shopping() && item && D.ITEMS[item.id].w !== D.ITEMS[item.id].h ? btn('旋转预览', 'rotate-preview') : ''}${btn('取消移动', 'clear-selection')}</div>` : '';
}
function itemDescription(id: string) {
    return D.ITEMS[id].description + (id === 'bandage' ? touchLayout() ? ' 放在背包中，可点「治疗」使用。' : ' 放在背包中可按 Q 使用。' : id === 'knife' ? touchLayout() ? ' 点「匕首」切换。' : ' 按 2 切换。' : '');
}
function details() {
    const item = app.selected && !app.placement ? inventory(app.selectedSource).items.find(i => i.uid === app.selected) : null;
    if (shopping()) return shopDetails(item);
    if (!item) return `<aside class="details details-empty"><div class="section-label">出发前检查</div><h3>选中一件物品</h3><p class="muted">查看用途、重量和操作。</p><dl class="field-notes"><div><dt>弹药</dt><dd>换弹只使用背包内的弹药。</dd></div><div><dt>安全箱</dt><dd>放入这里的物品，撤离失败也会保留。</dd></div></dl><div class="inv-help">单击查看 · 拖动整理${app.state === 'hideout' ? '<br>双击在仓库与背包间转移' : ''}</div>${app.save.reliefSupplies?.length ? btn('领取救济补给', 'relief') : ''}</aside>`;
    const d = D.ITEMS[item.id];
    const actions = `${D.isGun(item.id) && app.selectedSource !== 'safe' ? btn('装备主武器', 'equip', 'primary') : ''}${D.isGun(item.id) && app.state === 'hideout' ? btn('改装', 'gunsmith-open', '', `data-id="${item.uid}"`) : ''}${btn(app.selectedSource === 'stash' ? '放入背包' : '放入仓库', 'transfer')}${btn(app.selectedSource !== 'safe' ? '放入安全箱' : '放入背包', 'secure')}${!item.relief ? btn('去商店出售', 'sell') : ''}`;
    const baseActions = app.state === 'hideout' && rpgEnabled(app.expansion) ? `${d.kind === 'accessory' ? btn('佩戴', 'charm-equip') : ''}${SUPPLY_IDS.includes(item.id) ? btn('使用', 'use-base') : ''}` : '';
    const size = D.itemSize(item);
    return `<aside class="details"><div class="item-heading"><div class="detail-icon">${itemIcon(item.id)}</div><div><div class="section-label">${kindName[d.kind]}</div><h3>${d.name}</h3></div>${touchLayout() ? btn('关闭详情', 'clear-selection', 'detail-close') : ''}</div><div class="detail-body"><p class="item-description">${itemDescription(item.id)}</p>${attachmentLine(item, 'small item-maker')}<dl class="item-facts"><div><dt>占用</dt><dd>${size.w} × ${size.h} 格</dd></div><div><dt>重量</dt><dd>${D.itemWeight(item).toFixed(2)} kg</dd></div><div><dt>数量</dt><dd>${item.qty}</dd></div><div><dt>售价</dt><dd>${saleValue(item).value === null ? esc(saleValue(item).note ?? '不可出售') : '¥ ' + saleValue(item).value}</dd></div></dl>${item.relief ? '<p class="small orange">救济物资 · 不可出售</p>' : ''}${D.isGun(item.id) && app.selectedSource === 'safe' ? '<p class="small">枪械先放入背包，再选中并装备主武器。</p>' : ''}<div class="item-actions">${actions}${baseActions}${d.w !== d.h ? btn('旋转', 'rotate-item') : ''}${btn('移动格位', 'place-item')}${splitControl(item)}</div></div></aside>`;
}
/** Host calls after a successful runtime.deploy and its animation. Uses the committed checkpoint. */
export async function startPreparedHideoutRaid(runId: string): Promise<boolean> {
    const result = hideoutRuntime.startRaid(runId); if (!result.ok) return false;
    app.shop = null;
    await startCoastSample(); return !!app.coastSample;
}
const WORLD_OPTION: Record<'coast' | 'buildings' | 'mall', string> = { coast: '沿海封锁区 · 经典规则', buildings: '沿海街区 · 居民楼', mall: '滨湾商场 · 两层与露台' };
function deploy() {
    const stop = D.deployBlocker(app.save);
    if (stop) { toast(stop); return; }
    const cfg = app.runWorld === 'mall' ? mallRunConfig(app.seed || Date.now()) : generateRun(app.seed || (sampleMode() === 'village' && app.runWorld === 'buildings' ? villageSeed() : Date.now()));
    if (!saved(saveSession.beginRun(cfg.seed, app.runWorld === 'mall' ? 'mall' : app.runWorld === 'buildings', { mallLayout: sampleMallLayout(app.runWorld) }))) return;
    app.shop = null; void startCoastSample();
}
function checkout() {
    const current = cart(); app.overlay = '';
    if (mutate(() => {
        const result = Shop.settleCartResult(app.save, current, rpgEnabled(app.expansion));
        if (!result.ok) toast(Shop.cartRejectionMessage[result.reason]);
        return result.ok;
    }, '交易完成，物资已存入仓库。', null)) { app.shop = null; render(); }
}
function shopDetails(item: D.Item | null | undefined) {
    if (!item) return `<aside class="details shop-details details-empty"><p>从商人拖到待买区，从仓库拖到待卖区。选中物品可查看用途，再点「移动格位」选择位置。</p></aside>`;
    const def = D.ITEMS[item.id], size = D.itemSize(item), buying = ['merchant', 'buy'].includes(app.selectedSource), uses = Shop.questUses(app.save, item.id);
    return `<aside class="details shop-details"><h3>${def.name} × ${item.qty}</h3><p>${def.description}</p>${attachmentLine(item, 'item-maker')}${!buying && saleLines(item) ? `<p class="item-maker">${saleLines(item)!.map(esc).join('<br>')}</p>` : ''}<p>${size.w} × ${size.h} 格 · ${D.itemWeight(item).toFixed(2)} kg · ${buying ? '购买' : '出售'} ¥ ${(buying ? def.buy : def.sell) * item.qty}${item.relief ? ' · 救济，不可出售' : ''}</p>${uses.length ? `<p class="orange">任务用途：${uses.join('、')}</p>` : ''}<div class="item-actions">${btn('移动格位', 'place-item')}${btn('关闭详情', 'clear-selection')}</div></aside>`;
}
export function render() {
    cancelInventoryDrag();
    document.documentElement.dataset.state = app.state;
    document.documentElement.style.setProperty('--inventory-cell', `${inventoryCell()}px`);
    document.documentElement.dataset.overlay = app.overlay;
    document.documentElement.dataset.container = app.mobileContainer;
    document.dispatchEvent(new Event('bincov-ui'));
    document.body.dataset.screen = app.state;
    if (app.state === 'menu') {
        const focusedAction = (document.activeElement as HTMLElement | null)?.dataset.action;
        const overlay = overlayHtml();
        ui().innerHTML = titleScreen({ runs: app.save.stats.runs, extracts: app.save.stats.extracts, motion: app.menuMotion,
            overlay: !!overlay, storageOK: app.storageOK, resume: !!(app.checkpoint || app.expansion?.raid), touch: touchLayout() }) + overlay;
        // Freeze pointer parallax while a dialog is open over the scene.
        titleScene()?.setOverlay(!!overlay);
        bind();
        if (overlay) {
            const modal = ui().querySelector<HTMLElement>('.modal');
            modal?.setAttribute('role', 'dialog');
            modal?.setAttribute('aria-modal', 'true');
            modal?.setAttribute('aria-label', modal.querySelector('h2')?.textContent || '行动指南');
            modal?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        } else if (focusedAction === 'close' || focusedAction === 'title-motion') {
            ui().querySelector<HTMLButtonElement>(`[data-action="${focusedAction === 'close' ? 'help' : 'title-motion'}"]`)?.focus({ preventScroll: true });
        }
        return;
    }
    if (app.state === 'hideout' && app.station) { ui().innerHTML = ''; return; }
    if (app.state === 'hideout') renderHideout();
    // The raid host draws its own HUD and panels; nothing of the old page shows during a raid.
    if (app.state === 'run') { ui().innerHTML = ''; return; }
    if (app.state === 'result') {
        const r = app.result;
        ui().innerHTML = `<div class="overlay"><div class="panel result"><div class="stamp">行动报告 <span>${r?.outcome === 'extract' ? '成功撤离' : '撤离失败'}</span></div><h2>${r?.outcome === 'extract' ? '你回来了。' : r?.outcome === 'timeout' ? '撤离时间已过。' : '未能撤离。'}</h2><p>${r?.outcome === 'extract' ? '装备和物资已带回水产站，进度已保存。' : '背包内的物资和主武器已丢失，安全箱内的物品和水手匕首保留。'}</p><div class="stats"><div><strong>${r?.kills || 0}</strong><span>击败敌人</span></div><div><strong>¥ ${r?.keptValue || 0}</strong><span>保留物资估值</span></div><div><strong>${app.save.stats.extracts} / ${app.save.stats.runs}</strong><span>累计撤离 / 出击</span></div></div>${btn('返回水产站　 →', 'return', 'primary')}</div></div>`;
        bind();
    }
}
function shopCheckout() {
    if (app.placement) return `<div class="shop-placement">${placementControls()}</div>`;
    const c = cart(), totals = Shop.cartTotals(c);
    const stale = Shop.cartStale(app.save, c);
    return `<div class="shop-checkout"><strong>${totals.net >= 0 ? '需付' : '可得'} ¥ ${Math.abs(totals.net)}</strong>${stale ? btn('刷新清单', 'cart-reset') : ''}${btn('统一结算', 'checkout', 'primary', Shop.cartDirty(c) && !stale ? '' : 'disabled')}<span>${stale ? Shop.cartRejectionMessage.stale : '背包、安全箱物品请先移入仓库。救济物资不可出售。'}</span></div>`;
}
const carryLimit = () => rpgEnabled(app.expansion) ? derivedLimits(app.expansion!).carry : SURVIVAL.carryLimit;
function expansionAction(action: (draft: ExpansionDraft) => boolean | void, message: string): boolean {
    try {
        const ticket = saveSession.prepareExpansionMutation(action);
        if (!ticket) { toast('操作未完成，请检查条件、物资和可用空间。'); return false; }
        const result = saveSession.commitExpansionMutation(ticket);
        if (result !== 'committed') { saved(false); return false; }
        clearSelection(); render(); if (message) toast(message, 'success'); return true;
    } catch (error) { toast(error instanceof Error ? error.message : '操作未完成。'); return false; }
}
const attributeNames = { strength: '力量', constitution: '体质', technique: '技巧' };
const effectNames = { pain: '疼痛', energized: '精力充沛', analgesia: '镇痛', focus: '专注', strength: '力量增强', constitution: '体质增强', technique: '技巧增强', injectionFatigue: '注射后疲劳', luck: '香包余韵' };
/**
 * Body and growth. The perk board, its previews and the static critical display read the shared HideoutRuntime (the same
 * service as the yard); choices and resets go through it too, never through this page's own save writes.
 */
function propertyPanel() {
    const state = app.expansion;
    if (!state) return '';
    const a = effectiveAttributes(state), limits = derivedLimits(state), b = state.body, board = hideoutRuntime.perkBoard();
    perkAttr ??= defaultPerkAttribute(board);
    return `<section class="rpg-property"><div class="rpg-layout"><div class="rpg-main"><h3>身体与成长</h3><div class="rpg-cards">${[['生命', `${b.hp.toFixed(0)} / ${limits.hp}`], ['耐力', `${b.stamina.toFixed(0)} / ${limits.stamina}`], ['精神', b.mental.toFixed(0)], ['水分', b.water.toFixed(0)], ['饱食', b.satiety.toFixed(0)], ['污染', b.pollution.toFixed(0)]].map(([name,value]) => `<div><span>${name}</span><strong>${value}</strong></div>`).join('')}</div><div class="rpg-cards">${ATTRIBUTES.map(key => `<div><span>${attributeNames[key]}</span><strong>${state.growth.permanent[key]}${a[key] !== state.growth.permanent[key] ? ` + ${a[key] - state.growth.permanent[key]}` : ''}</strong><small>成长 ${(state.growth.progress[key] * 100).toFixed(1)}%</small></div>`).join('')}</div></div>${perkBoardHtml(perkPanel(board, perkAttr))}<div class="rpg-side">${critHtml(critView(critContext(hideoutRuntime.snapshot(), board)))}<p>负重上限 ${limits.carry.toFixed(1)} kg</p><p>${b.bleeding ? '流血 · ' : ''}${EFFECTS.filter(e => b.effects[e] > 0).map(e => `${effectNames[e]} ${Math.ceil(b.effects[e])}秒`).join(' · ') || '没有限时状态'}</p><h4>护符</h4><p>${state.charm ? `${itemIcon(state.charm.id)} ${D.ITEMS[state.charm.id].name} ${btn('收起护符', 'charm-unequip')}` : '未佩戴 · 在物品详情中选择护符佩戴'}</p>${Object.entries(state.growth.reputation).map(([faction,value]) => `<p>${esc(faction)} · ${reputationTier(value)}（${value}）</p>`).join('')}<p class="muted">行动中的有效负重移动、耐力消耗和射击伤害会积累成长。基地恢复不会产生训练收益。</p></div></div></section>`;
}
/** Only an open card on an unblocked board is a button; chosen, other-side and locked cards are plain text. */
function perkCardHtml(c: PerkCardView) {
    const inner = `<strong>${esc(c.name)}</strong><span>${esc(c.effect)}</span>${c.status ? `<em>${esc(c.status)}</em>` : ''}`;
    return c.state === 'open' ? btn(inner, 'perk-pick', 'perk-card open', `data-id="${c.id}" ${c.enabled ? '' : 'disabled'}`) : `<div class="perk-card ${c.state}">${inner}</div>`;
}
function perkBoardHtml(v: PerkPanelView) {
    const tabs = v.tabs.map(t => btn(`${t.name}<small>${esc(t.detail)}</small>`, 'perk-attr', t.attribute === v.attribute ? 'active' : '', `data-id="${t.attribute}" aria-pressed="${t.attribute === v.attribute}"`)).join('');
    return `<section class="rpg-perks"><h4>${PERK_UI.title} <span>${PERK_UI.hint}</span></h4><div class="perk-tabs" role="group" aria-label="${PERK_UI.switcher}">${tabs}</div>${v.blocked ? `<p class="orange small" data-perk-blocked>${esc(v.blocked)}</p>` : ''}${v.tiers.map(t => `<div class="perk-tier"><b>${t.tier}<small>级</small></b>${t.cards.map(perkCardHtml).join('')}</div>`).join('')}<div class="perk-reset">${btn(esc(v.reset.label), 'perk-reset', 'danger', `data-id="${v.attribute}" ${v.reset.enabled ? '' : 'disabled'}`)}<span class="perk-note">${esc(v.reset.reason ?? PERK_UI.resetHint)}</span></div></section>`;
}
function critHtml(c: CritView) {
    return `<div class="rpg-crit"><h4>${esc(c.title)}${c.total ? `<strong>${esc(c.total)}</strong>` : ''}</h4>${c.rows.length ? `<dl>${c.rows.map(r => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.text)}</dd></div>`).join('')}</dl>` : ''}${c.notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>`;
}
function perkOverlayHtml(d: NonNullable<typeof perkDialog>) {
    const v = d.view;
    return `<div class="overlay"><section class="panel modal perk-modal" role="dialog" aria-modal="true" aria-label="${d.kind === 'choice' ? PERK_UI.choiceDialog : PERK_UI.resetDialog}"><div class="section-label">${esc(v.subtitle)}</div><h2>${esc(v.title)}</h2>${v.lines.map(l => `<p>${esc(l)}</p>`).join('')}${v.note ? `<p class="muted">${esc(v.note)}</p>` : ''}${v.changes.length ? `<ul class="perk-changes">${v.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${v.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}<div class="actions">${btn(esc(v.confirm), 'perk-confirm', d.kind === 'choice' ? 'primary' : 'danger')}${btn(PERK_UI.cancel, 'close', 'perk-cancel')}</div></section></div>`;
}
/** Card or reset button: the Runtime previews or refuses; nothing is written before the confirm. */
function previewPerkTab(kind: 'choice' | 'reset', subject: string) {
    const r = kind === 'choice' ? hideoutRuntime.previewPerk(subject) : hideoutRuntime.previewPerkReset(subject as Attribute);
    if (!r.ok || !r.token || !r.preview) { perkRefused(r, kind); render(); return; }
    const ctx = critContext(hideoutRuntime.snapshot(), hideoutRuntime.perkBoard());
    perkDialog = r.preview.kind === 'choice' ? { kind: 'choice', id: subject, token: r.token, view: choicePreview(r.preview, ctx) }
        : { kind: 'reset', attribute: subject as Attribute, token: r.token, view: resetPreview(r.preview, ctx) };
    setOverlay('perk');
}
/** Success is shown only after the Runtime wrote the change; a failed write stays in the Runtime for retrySave. */
function confirmPerkTab() {
    const d = perkDialog; if (!d || app.overlay !== 'perk') return;
    perkDialog = null; app.overlay = '';
    const subject = d.kind === 'choice' ? d.id : d.attribute, unsaved = !hideoutRuntime.snapshot().storage.ok;
    const r = d.kind === 'choice' ? hideoutRuntime.choosePerk(d.id, d.token) : hideoutRuntime.resetPerks(d.attribute, d.token);
    if (r.ok) toast(perkDone(d.kind, subject), 'success');
    else {
        // With storage fine before, a storage answer means this change's own write failed and waits for the retry.
        const kept = r.reason === 'storage' && !unsaved;
        if (kept) perkPending = perkPendingName(d.kind, subject);
        perkRefused(r, d.kind, kept);
    }
    clearSelection(); render();
}
function perkRefused(r: Result, kind: 'choice' | 'reset', kept = false) { if (!r.ok) toast(perkFailure(r.reason, kind, kept)); }
/** The tab page's storage retry for base writes: only the HideoutRuntime commits a change it keeps after a failed write. */
function retryBaseSave() {
    const pending = perkPending, r = hideoutRuntime.retrySave();
    if (r.ok) { toast(pending ? perkRetried(pending) : '已重新保存。', 'success'); perkPending = ''; }
    else toast(r.message);
    render();
}
/** A failed or blocked base write: say so and offer the retry and the export (both through the HideoutRuntime). */
function storageAlarm() {
    if (app.pendingSettlement) return '';
    const { storage } = hideoutRuntime.snapshot();
    if (storage.conflict) return `<div class="save-alarm" role="alert"><span>存档已被另一个窗口接管，本页不能写入。请先导出需要保留的进度，再刷新本页。</span>${btn('导出存档', 'export-save')}${btn('刷新页面', 'refresh')}</div>`;
    if (storage.reloadRequired) return `<div class="save-alarm" role="alert"><span>进度已保存，但当前页面恢复失败。请导出备份后刷新页面。</span>${btn('导出存档', 'export-save')}${btn('刷新页面', 'refresh')}</div>`;
    // A kept candidate always comes with a failed write (storage not ok) until retrySave commits it.
    if (storage.ok) { perkPending = ''; return ''; }
    return `<div class="save-alarm" role="alert"><span>${perkPending ? esc(perkWaiting(perkPending)) : '最近一次操作没能写入存档。请重试保存，或先导出备份。'}</span>${btn('重试保存', 'retry-save', 'primary')}${btn('导出存档', 'export-save')}</div>`;
}
function facilityPanel() {
    const state = app.expansion;
    if (!state) return '';
    const facility = FACILITIES.includes(app.baseFacility as Facility) ? app.baseFacility as Facility : 'rest', level = state.base.facilities[facility], cost = FACILITY_COSTS[facility][level];
    const explanation = { rest: '提高生命与精神恢复速度，并缩短获得精力充沛所需的休息。', medical: '提高生命恢复和止血、镇痛、疲劳治疗速度。', training: '提高行动训练效率。在训练区实际走动，每满 120 秒获得一次练习收益。', workbench: '有限队列串行生产；领完一批，再为后续成品腾出位置。', blackmarket: '需要修好电源，并成功带回一颗普通黑珍珠。货单尚未开放。' };
    const locked = facility !== 'rest' && !app.save.quests.repair || facility === 'blackmarket' && !state.base.extractedPearl;
    return `<section class="facility-panel"><nav class="facility-tabs">${FACILITIES.map(id => btn(FACILITY_NAMES[id], 'facility-select', facility === id ? 'active' : '', `data-id="${id}"`)).join('')}</nav><h3>${FACILITY_NAMES[facility]} · ${level ? `${level} 级` : '未修建'}</h3><p>${explanation[facility]}</p>${cost ? `<p>费用 ¥${cost.cash} · ${cost.items.map(i => `${D.ITEMS[i.id].name} × ${i.qty}`).join('、')}（仅普通物资）</p>${locked ? '<p class="orange">先完成供电任务；黑市还需要成功带回黑珍珠。</p>' : ''}${btn(level ? '升级设施' : '修建设施', 'facility-build', 'primary', locked ? 'disabled' : '')}` : '<p>已达到最高等级。</p>'}${facility === 'training' ? `<h4>主动练习</h4><p>十分钟内共享 1 点训练量上限；更换项目保留同一额度。</p>${ATTRIBUTES.map(id => btn(attributeNames[id], 'practice-select', state.base.training.attribute === id ? 'active' : '', `data-id="${id}"`)).join('')}` : ''}${facility === 'workbench' ? `<h4>配方</h4>${Object.entries(RECIPES).map(([id,r]) => `<div class="production-row"><span>${r.result.map(i => `${D.ITEMS[i.id].name} × ${i.qty}`).join('、')} · ${r.seconds / 60}分钟<br>¥${r.cash} + ${r.materials.map(i => `${D.ITEMS[i.id].name} × ${i.qty}`).join('、')} · 工作台 ${r.level}级${r.medical ? ' / 医疗区1级' : ''}</span>${btn('排入生产', 'production-enqueue', '', `data-id="${id}"`)}</div>`).join('')}<h4>生产队列 ${state.base.queue.length} / ${state.base.facilities.workbench}</h4>${state.base.queue.map((b,i) => `<div class="production-row"><span>${D.ITEMS[b.recipe].name} · ${i === 0 ? b.remaining === 0 ? '等待成品位' : `剩余 ${Math.ceil(b.remaining)}秒` : '等待生产'}</span>${i ? btn('取消并退款', 'production-cancel', '', `data-id="${b.id}"`) : ''}</div>`).join('')}<h4>待领取 ${state.base.completed.length} / 3</h4>${state.base.completed.map(b => `<div class="production-row"><span>${b.result.map(i => `${D.ITEMS[i.id].name} × ${i.qty}`).join('、')}</span>${btn('整批领入仓库', 'production-claim', '', `data-id="${b.id}"`)}</div>`).join('')}${premiumPanel(state)}` : ''}</section>`;
}
/** 老栓精工 (#28 M4-09) under the workbench, as the yard shows it (station-view/panels.ts premiumHtml). */
function premiumPanel(state: ExpansionState) {
    const o = premiumOrders(app.save, state);
    const rows = o.rows.map(r => `<div class="production-row"><span>${esc(r.name)} · ${esc(r.guns)}<br>底料 ${esc(r.base ?? r.bases)} · ¥${r.price}${r.why ? ` · <b class="orange">${esc(r.why)}</b>` : ''}</span>${btn('定制', 'premium-craft', '', `data-id="${r.id}"${r.why ? ' disabled' : ''}`)}</div>`).join('');
    return `<h4>老栓精工定制 · 精工件坯 ${o.blanks} 份</h4>${o.lock ? `<p>${esc(o.lock)}${esc(PREMIUM_LOCKED_NOTE)}</p>` : `<p>${esc(PREMIUM_OPEN_NOTE)}</p>${rows}`}`;
}
function renderHideout() {
    const scrollPositions = new Map<string, number>();
    ui().querySelectorAll<HTMLElement>(`.shop-layout[data-merchant="${app.tab}"] [data-grid]`).forEach(grid => {
        scrollPositions.set(grid.dataset.grid!, grid.parentElement!.scrollTop);
    });
    // The body tab keeps its scroll while a perk preview opens and closes (the perk board sits below the vitals on phones).
    const bodyScroll = app.tab === 'body' ? ui().querySelector<HTMLElement>('.content.body-content')?.scrollTop ?? 0 : 0;
    const s = app.save;
    const inventoryTools = `<div class="inventory-tools">${btn('背包全部入库', 'stash-all', '', 'title="整包入库，空间不足则全部保留；装备与安全箱不变"')}${btn('整理仓库', 'sort-stash', '', 'title="同类合堆、大件优先，排不下则保持原样"')}</div>`;
    let body = '';
    if (app.tab === 'gear') {
        const weight = preparedWeight();
        body = `${touchLayout() ? `<div class="mobile-inventory-tabs">${[['stash','仓库'],['bag','背包'],['safe','安全箱 / 装备']].map(([id,label]) => btn(label, 'container', app.mobileContainer === id ? 'active' : '', `data-id="${id}"`)).join('')}${btn(app.inventoryGrid ? '物资列表' : '格位整理', 'grid-mode')}</div>` : ''}${placementControls()}${touchLayout() ? inventoryTools : ''}<div class="columns gear-columns">${equipmentPanel(s.equipment, s.bag, s.safe)}${bagPanel(s.bag, weight)}<section class="stash-section"><h3 class="section-title"><b class="section-number">03</b>仓库 <span>${occupied(s.stash)} / ${s.stash.w * s.stash.h} 格</span></h3><div class="stash-scroll">${grid(s.stash, 'stash')}</div><div class="inv-help">${s.upgraded ? '已扩建' : '未扩建'} · ${s.stash.w} × ${s.stash.h} 格 · 出击时留在水产站</div></section></div>${details()}`;
    } else if (app.tab === 'body') { body = propertyPanel();
    } else if (app.tab === 'facilities') { body = facilityPanel();
    } else if (app.tab === 'arms' || app.tab === 'med') {
        const c = cart(), merchant = D.MERCHANTS[c.merchant], totals = Shop.cartTotals(c);
        body = `<div class="merchant-heading">${merchantPortrait(app.tab)}<div><h3>${merchant.name}<span>${merchant.subtitle}</span></h3><p>先选物品，再一起结算。放回原侧可取消。</p></div></div><div class="shop-layout" data-merchant="${app.tab}"><section><h3>商人物品 · 按包购买</h3>${shopBrowseBar()}${grid(c.catalog, 'merchant', 54)}</section><section class="shop-buffer"><div><h3>待买 · ¥ ${totals.buy}</h3>${grid(c.buy, 'buy', 54)}</div><div><h3>待卖 · ¥ ${totals.sell}</h3>${grid(c.sell, 'sell', 54)}</div></section><section><h3>仓库 · 整组出售</h3>${grid(c.stash, 'stash', 54)}</section></div>${details()}`;
    } else if (app.tab === 'quests') {
        body = `<div class="quests">${Object.entries(D.QUESTS).map(([id, q], i) => {
            const complete = s.quests[id];
            const needs = Object.entries(q.needs).map(([itemId, needed]) => ({ itemId, needed, have: [s.stash, s.bag, s.safe].reduce((sum, inv) => sum + D.count(inv, itemId), 0) }));
            const requirements = D.questRequirements(s, id), ready = !requirements.length && needs.every(({ have, needed }) => have >= needed);
            return `<article class="quest ${complete ? 'complete' : ''}"><div class="quest-status"><span class="mono">0${i + 1}</span><span>${complete ? '已交付' : requirements.length ? '尚未开放' : ready ? '可以交付' : '等待物资'}</span></div><h3>${q.name}</h3><p>${q.description}</p>${requirements.map(r => `<p class="quest-unlock">${r}</p>`).join('')}${D.questShelfText(id, complete) ? `<p class="quest-unlock">${D.questShelfText(id, complete)}</p>` : ''}${complete ? `<p class="quest-reply">${q.radio}</p>` : `<ul class="quest-needs">${needs.map(({ itemId, needed, have }) => {
                return `<li class="${have >= needed ? 'ready' : ''}"><span>${D.ITEMS[itemId].name}</span><strong>${Math.min(have, needed)} <span>/ ${needed}</span></strong></li>`;
            }).join('')}</ul>`}<div class="quest-footer"><div><strong>¥ ${q.reward}</strong><span>${id === 'repair' ? '另解锁仓库扩建' : '任务报酬'}</span></div>${complete ? '<span class="completion-mark">✓ 已完成</span>' : btn('交付物资', 'quest', ready ? 'primary' : '', `data-id="${id}" ${ready ? '' : 'disabled'}`)}</div></article>`;
        }).join('')}</div><p class="content-note">交付时会扣除仓库、背包或安全箱中的所需物资。放进安全箱的任务物品，撤离失败也保留。</p>`;
    } else {
        body = `<div class="station-layout"><section class="station-log"><div class="section-label">水产站值守记录 · 累计出击 ${s.stats.runs} 次</div><h3>${s.quests.repair ? '供电已恢复。' : '目前靠应急电源供电。'}</h3><p class="station-copy">出击前查好路线，涉水会积累污染。<br>以下时间从出击开始计算。</p><dl class="tide-notes"><div><dt>04:30</dt><dd>电台预警，离开浅滩。</dd></div><div><dt>05:00</dt><dd>潮位变化，高架路与海堤仍可通行。</dd></div></dl><div class="station-upgrade">${btn(s.upgraded ? '仓库已扩建' : `扩建仓库 · ¥ ${D.STASH_UPGRADE_COST}`, 'upgrade', '', s.upgraded ? 'disabled' : '')}<p class="inv-help">${s.upgraded ? `仓库容量已增至 ${D.STASH_W * D.STASH_UPGRADED_ROWS} 格。` : `完成「${D.QUESTS.repair.name}」后可扩建至 ${D.STASH_W * D.STASH_UPGRADED_ROWS} 格。`}</p></div></section><section class="station-controls"><div class="station-stats"><div><strong>${s.stats.runs}</strong><span>累计出击</span></div><div><strong>${s.stats.extracts}</strong><span>成功撤离</span></div><div><strong>${s.stats.kills}</strong><span>击败敌人</span></div></div><label class="volume-control"><span>游戏音量 <span id="volume-label">${Math.round(s.settings.volume * 100)}%</span></span><input aria-label="游戏音量" id="volume" type="range" min="0" max="1" step="0.05" value="${s.settings.volume}"></label><div class="save-controls"><div><h3>本地存档</h3><p>更换浏览器或游玩地址前，请先导出备份。</p></div><div class="save-actions">${btn('导出存档', 'export-save')}${btn('导入存档', 'import-save')}</div><input id="backup-file" type="file" accept=".json,application/json" hidden></div><div class="station-links">${btn('行动指南', 'help', 'text-button')}${btn('返回主菜单', 'menu', 'text-button')}${btn(walkInLabel(), 'base-enter')}</div></section></div>`;
    }
    ui().innerHTML = `<div class="panel hideout ${shopping() ? 'shopping' : ''}"><header class="topbar"><div class="station-identity"><span class="section-label">滨科夫 · 沿海避难点</span><h2>滨科夫水产站</h2></div><div class="right"><span class="station-signal"><i></i>${s.quests.repair ? '供电已恢复 · 信号稳定' : '应急供电 · 信号微弱'}</span><div class="cash"><span>可用现金</span><strong>¥ ${s.cash.toLocaleString()}</strong></div></div></header><nav class="tabs" aria-label="水产站功能">${[['gear', '整备'], ['arms', '修理铺'], ['med', '卫生所'], ['quests', '电台任务'], ['home', '水产站'], ...(rpgEnabled(app.expansion) ? [['body', '身体与成长'], ['facilities', '基地设施']] : [])].map(([id, name]) => btn(name, 'tab', app.tab === id ? 'active' : '', `data-id="${id}" ${app.tab === id ? 'aria-current="page"' : ''}`)).join('')}${app.tab === 'gear' && !touchLayout() ? inventoryTools : ''}</nav>${storageAlarm()}<div class="content ${shopping() ? 'shop-content' : app.tab === 'gear' ? 'gear-content' : app.tab === 'body' ? 'body-content' : ''}">${body}</div><footer class="bottom-bar">${shopping() ? shopCheckout() : `<div class="departure-note"><strong>行动规则 <span>每局限时 10 分钟</span></strong><p>撤离失败会丢失背包物资和主武器，安全箱保留。</p></div>`}<label class="seed-label">行动区域<select id="run-world" aria-label="行动区域">${raidWorlds().map(w => `<option value="${w}" ${app.runWorld === w ? 'selected' : ''}>${WORLD_OPTION[w]}</option>`).join('')}</select></label><label class="seed-label">行动种子 <input class="seed" aria-label="行动种子" title="留空随机生成；输入相同的数字或文字，可重现本局初始配置。" id="seed" placeholder="留空随机" value="${esc(app.seed)}" maxlength="16"></label>${btn(walkInLabel(), 'base-enter')}<div class="departure-check"><p id="departure-warnings">${departureWarnings(s).join(' · ') || '装备与快捷补给已备齐'}</p>${btn('出击 <span aria-hidden="true">→</span>', 'deploy', 'primary')}</div></footer></div>${overlayHtml()}`;
    bind();
    ui().querySelectorAll<HTMLElement>('.shop-layout [data-grid]').forEach(grid => {
        grid.parentElement!.scrollTop = scrollPositions.get(grid.dataset.grid!) || 0;
    });
    const content = ui().querySelector<HTMLElement>('.content.body-content'); if (content) content.scrollTop = bodyScroll;
    // Like the title dialogs: the keyboard lands in the perk preview (on its cancel button; main.ts keeps Tab inside it).
    if (app.overlay === 'perk') ui().querySelector<HTMLElement>('.perk-modal .perk-cancel')?.focus({ preventScroll: true });
}
function overlayHtml() {
    if (saveSession.requiresReload && !app.conflict) return `<div class="overlay"><div class="panel modal"><h2>进度已保存，请刷新页面</h2><p>当前页面恢复失败。本页不会再次写入，请导出备份后刷新页面。</p><div class="actions">${btn('导出备份', 'export-save')}${btn('刷新页面', 'refresh')}</div></div></div>`;
    if (!app.storageOK && app.state === 'menu')
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">本地存档</div><h2>暂时无法打开存档</h2><p>${esc(app.storageError || '请允许浏览器存储后刷新重试。')}</p><div class="actions">${btn('导出原始存档', 'export-original')}${btn('刷新重试', 'refresh', 'primary')}</div></div></div>`;
    if (app.pendingSettlement)
        return `<div class="overlay"><div class="panel modal"><div class="section-label orange">保存失败</div><h2>结算尚未保存</h2><p>行动已结束，本次结果暂存在当前页面。</p><p>${app.conflict ? '另一个窗口已更新存档。请先下载结算备份，再刷新页面。导入备份会覆盖该窗口保存的进度。' : '浏览器未能保存进度。请检查存储设置后重试，或先下载结算备份。'}</p><p class="small orange">保存成功或确认备份下载完成前，不要关闭或刷新页面。</p><div class="actions">${btn('重试保存', 'retry-save', 'primary', app.conflict ? 'disabled' : '')}${btn('下载结算备份', 'export-save')}</div><p class="small muted">备份包含本次行动结果，可在「水产站」页点击「导入存档」恢复。</p></div></div>`;
    if (app.overlay === 'import-save' && (app.pendingImport || app.pendingRecoveryImport))
        return `<div class="overlay"><div class="panel modal"><h2>导入这份存档？</h2><p>现金 ¥ ${(app.pendingImport || app.pendingRecoveryImport!.profile).cash} · 累计出击 ${(app.pendingImport || app.pendingRecoveryImport!.profile).stats.runs} 次</p><p>导入会替换此浏览器中本游戏的进度，两个存档不会合并。请先导出当前存档。</p><div class="actions">${btn('先导出当前存档', 'export-save')}${btn('确认导入', 'confirm-import', 'primary')}${btn('取消', 'close')}</div></div></div>`;
    if (!app.overlay)
        return '';
    if (app.overlay === 'gunsmith' && bench) return benchOverlayHtml(bench);
    if (app.overlay === 'shop-leave') return `<div class="overlay"><section class="panel modal"><h2>放弃未结算的清单？</h2><p>待买、待卖和仓库位置会恢复。现金与物资尚未改变。</p><div class="actions">${btn('继续挑选', 'close')}${btn('放弃清单并离开', 'shop-leave-confirm', 'danger')}</div></section></div>`;
    if (app.overlay === 'perk') return perkDialog ? perkOverlayHtml(perkDialog) : '';
    if (app.overlay === 'shop-quest') return `<div class="overlay"><section class="panel modal"><h2>这些任务物资会不够交付</h2><ul>${Shop.saleWarnings(app.save, cart()).map(w => `<li>「${w.quest}」需要 ${D.ITEMS[w.id].name} ${w.needed} 件；本次卖出 ${w.sold} 件，整笔交易后剩 ${w.remaining} 件。</li>`).join('')}</ul><div class="actions">${btn('取消，继续挑选', 'close')}${btn('仍要结算', 'checkout-confirm', 'danger')}</div></section></div>`;
    return `<div class="overlay"><div class="panel modal" style="width:610px"><div class="section-label">${touchLayout() ? '手机触控操作' : '键盘与鼠标操作'}</div><h2>行动指南</h2>${touchLayout() ? '<p class="touch-guide">左半屏按住拖动是移动，拖远冲刺；右半屏按住拖动是瞄准，拖远持续开火，松开即停。靠近物资点「搜刮」或「拾取」；几个箱子重叠时，点名称直接打开那一个。在撤离区站稳，按住「按住撤离」3 秒。背包和地图不暂停行动。</p>' : ''}<div class="help-grid">${[['W A S D', '移动'], ['鼠标', '瞄准'], ['左键 / 右键', '攻击 / 精瞄'], ['Shift', '冲刺'], ['R', '换弹'], ['E', '交互 / 搜刮 / 阅读'], ['按住 E 3 秒', '撤离（绿色标记内）'], ['滚轮', '切换搜刮目标'], ['Q', '快捷治疗'], ['Tab', '背包（不暂停）'], ['M', '地图（不暂停）'], ['1 / 2', '主武器 / 匕首'], ['F / G', '开关枪上的灯光 / 激光'], ['V', '切换双档瞄具'], ['Esc', '暂停 / 关闭面板']].map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('')}</div><p>每局限时 10 分钟。备用弹药放在背包中，${touchLayout() ? '靠近物资点击拾取，打开地图查看本局撤离点。在绿色圈内站稳，按住撤离按钮满 3 秒。枪上装了激光或灯光时，点「设备」开关；装了双档瞄具时，点「切档」。' : '靠近箱子或尸体后，用滚轮切换高亮目标，按 E 打开双栏；关闭后可再选其他目标。散落物按 E 拾取。物品可拖入背包、安全箱或放回。搜刮不暂停。按 M 查看本局撤离点，在绿色圈内站稳，按住 E 满 3 秒撤离。'}</p><p>出击 4 分 30 秒后电台预警，5 分钟时潮位变化。涉水会积累污染；在背包中使用除藻药剂可降低污染。${touchLayout() ? '治疗按钮' : 'Q'}使用背包中的绷带或急救包。</p><p>行动中死亡、超时或放弃均按撤离失败处理：丢失背包物资和主武器，保留安全箱内的物品和水手匕首。刷新可恢复最近成功保存的进度。</p>${btn('关闭指南', 'close', 'primary')}</div></div>`;
}
export function closeOverlay() {
    if (app.overlay === 'gunsmith' && bench) {
        // Esc closes the bench's own sheet or answers its question with "stay"; a waiting preview asks before it closes.
        if (bench.dismiss()) { render(); return; }
        if (!bench.requestClose()) { render(); return; }
        bench.dispose(); bench = null;
    }
    setOverlay(app.overlay === 'help' ? app.helpReturn : '');
}
export function setOverlay(value: string) {
    activeDrag = null; app.selectedSource = '';
    if (value === 'help' && app.overlay !== 'help') app.helpReturn = app.overlay;
    app.overlay = app.pendingSettlement ? 'save-error' : value; clearSelection();
    render();
}
/** The save-error dialog's retry for a staged settlement (the page keeps it until a write succeeds or a backup is taken). */
export function retrySettlement(): boolean {
    if (!app.pendingSettlement) return false;
    if (!saved(saveSession.retrySettlement())) { setOverlay('save-error'); return false; }
    if (app.result!.outcome === 'extract') audio.extract(); else audio.death();
    changeState('result');
    return true;
}
export function importSave(candidate: D.SaveDataV1): boolean {
    if (!saved(saveSession.importSave(candidate))) return false;
    app.pendingImport = null;
    audio.setVolume(app.save.settings.volume);
    setOverlay('');
    toast('存档已导入并保存。');
    return true;
}
function selected() { return inventory(app.selectedSource).items.find(x => x.uid === app.selected); }
export function mutate(action: SessionMutation, message = '', rejectionMessage: string | null = '操作未完成，请检查所需物资和可用空间。'): boolean {
    const result = saveSession.mutate(action);
    if (result === 'blocked') return false;
    if (result === 'rejected') {
        if (rejectionMessage) toast(rejectionMessage);
        render();
        return false;
    }
    if (result === 'publish-failed') { clearSelection(); toast(app.storageError); render(); return false; }
    if (result === 'save-failed') {
        clearSelection();
        toast('保存失败，物资和进度已恢复到操作前。请检查浏览器存储设置后重试。');
        render();
        return false;
    }
    if (message) toast(message);
    clearSelection(); render(); return true;
}
function splitControl(item: D.Item) {
    return item.qty > 1 ? `<label class="split-control">拆分数量 <input id="split-quantity" type="number" min="1" max="${item.qty - 1}" step="1" value="1" aria-label="拆分数量"></label>${btn('拆分并放置', 'split-item')}` : '';
}
function beginDrag(uid: string, source: string): InventoryDrag {
    return { uid, source, token: ++dragToken, rotated: inventory(source).items.find(i => i.uid === uid)?.rotated };
}
export function cancelInventoryDrag() {
    pointerDrag = null; activeDrag = null; dragGhost?.remove(); dragGhost = null;
    document.documentElement.classList.remove('inventory-dragging'); clearPlacementPreview();
}
function drawPointerDrag() {
    if (!pointerDrag || !activeDrag || !dragContextValid(activeDrag)) { cancelInventoryDrag(); return; }
    const item = inventory(activeDrag.source).items.find(i => i.uid === activeDrag!.uid);
    if (!item) { cancelInventoryDrag(); return; }
    const size = D.itemSize({ ...item, rotated: activeDrag.rotated ?? item.rotated });
    if (!dragGhost) { dragGhost = document.createElement('div'); dragGhost.className = 'inventory-drag-ghost'; document.body.append(dragGhost); }
    dragGhost.textContent = `${D.ITEMS[item.id].short} × ${item.qty}`;
    Object.assign(dragGhost.style, { left: `${pointerDrag.x + 10}px`, top: `${pointerDrag.y + 10}px`, width: `${size.w * pointerDrag.cell}px`, height: `${size.h * pointerDrag.cell}px` });
    const target = document.elementFromPoint(pointerDrag.x, pointerDrag.y)?.closest<HTMLElement>('[data-grid]');
    if (target && ui().contains(target)) previewDrop(target, { clientX: pointerDrag.x, clientY: pointerDrag.y });
    else clearPlacementPreview();
}
/**
 * Mouse dragging for every grid (gear and the base shops) uses pointer events: the browser's native drag would be
 * cancelled at once by the pointercancel/pointerout guards below and is blocked by -webkit-user-drag: none. Keyboard
 * events stay available, so R rotates (except in a shop cart, which keeps each item's orientation) and Esc cancels.
 */
export function installInventoryDrag() {
    addEventListener('pointermove', e => {
        if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
        if (!(e.buttons & 1)) { cancelInventoryDrag(); return; }
        pointerDrag.x = e.clientX; pointerDrag.y = e.clientY;
        if (!pointerDrag.started && Math.hypot(e.clientX - pointerDrag.startX, e.clientY - pointerDrag.startY) < 5) return;
        pointerDrag.started = true; activeDrag = pointerDrag.drag;
        document.documentElement.classList.add('inventory-dragging'); drawPointerDrag();
    });
    addEventListener('pointerup', e => {
        if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
        const started = pointerDrag.started, drag = activeDrag;
        if (started) {
            suppressDragClick = true; setTimeout(() => { suppressDragClick = false; }, 0);
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-grid]');
            // Released over a grid: place, or say why not. Released anywhere else: the item simply stays where it was.
            if (target && ui().contains(target)) {
                if (drag && dragContextValid(drag)) commitDrop(target, e, drag);
                else toast('拖放未完成，物品仍在原处。');
            }
        }
        cancelInventoryDrag();
    });
    addEventListener('click', e => { if (suppressDragClick) { e.preventDefault(); e.stopImmediatePropagation(); suppressDragClick = false; } }, true);
    addEventListener('keydown', e => {
        if (!pointerDrag?.started || !activeDrag) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancelInventoryDrag(); }
        else if (e.key.toLowerCase() === 'r') {
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.repeat || shopping() || !dragContextValid(activeDrag)) return;
            activeDrag.rotated = !(activeDrag.rotated ?? false); drawPointerDrag();
        }
    }, true);
    addEventListener('pointercancel', cancelInventoryDrag);
    addEventListener('blur', cancelInventoryDrag);
    addEventListener('pagehide', cancelInventoryDrag);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelInventoryDrag(); });
    document.addEventListener('pointerout', e => { if (!e.relatedTarget) cancelInventoryDrag(); });
}
function clearPlacementPreview() {
    ui().querySelectorAll('.drop-preview').forEach(node => node.remove());
}
function dragContextValid(drag: InventoryDrag) {
    return !!activeDrag && drag.token === activeDrag.token && drag.uid === activeDrag.uid && drag.source === activeDrag.source
        && app.state === 'hideout' && !app.conflict && !app.pendingSettlement;
}
type DropPoint = { clientX: number; clientY: number };
function dropPosition(el: HTMLElement, e: DropPoint) {
    const cell = Number(el.dataset.cell), r = el.getBoundingClientRect(), scale = r.width / el.offsetWidth;
    return { x: Math.floor((e.clientX - r.left) / scale / cell), y: Math.floor((e.clientY - r.top) / scale / cell), cell };
}
function previewDrop(el: HTMLElement, e: DropPoint) {
    clearPlacementPreview();
    if (!activeDrag || !dragContextValid(activeDrag)) return;
    const from = inventory(activeDrag.source), to = inventory(el.dataset.grid!);
    const item = from.items.find(i => i.uid === activeDrag!.uid);
    if (!item) return;
    const { x, y, cell } = dropPosition(el, e), def = D.ITEMS[item.id], size = D.itemSize({ ...item, rotated: activeDrag.rotated ?? item.rotated });
    const error = shopping() ? Shop.shopPlacementError(cart(), activeDrag.source as Shop.ShopSource, el.dataset.grid as Shop.ShopSource, item.uid, x, y) : placementError(from, to, item.uid, x, y, activeDrag.rotated);
    const preview = document.createElement('div');
    preview.className = 'drop-preview' + (error ? ' invalid' : '');
    preview.dataset.valid = String(!error);
    Object.assign(preview.style, { left: `${x * cell}px`, top: `${y * cell}px`, width: `${size.w * cell}px`, height: `${size.h * cell}px` });
    preview.title = error || `放置 ${def.name} × ${item.qty} · ${size.w}×${size.h} 格`;
    el.appendChild(preview);
}
function commitDrop(el: HTMLElement, e: DropPoint, drag: InventoryDrag) {
    clearPlacementPreview();
    try {
        if (!dragContextValid(drag)) { toast('拖放未完成，物品仍在原处。'); return; }
        const target = el.dataset.grid!, { x, y } = dropPosition(el, e), rotated = activeDrag!.rotated;
        // A catalog item dropped back on the catalog is a change of mind, not a placement: nothing to say.
        if (shopping() && drag.source === 'merchant' && target === 'merchant') { activeDrag = null; return; }
        const error = shopping() ? Shop.shopPlacementError(cart(), drag.source as Shop.ShopSource, target as Shop.ShopSource, drag.uid, x, y) : placementError(inventory(drag.source), inventory(target), drag.uid, x, y, rotated);
        // Consume the drag once, including rejected placements.
        activeDrag = null;
        if (error) { toast(error); render(); return; }
        if (shopping()) { Shop.moveShopItem(cart(), drag.source as Shop.ShopSource, target as Shop.ShopSource, drag.uid, x, y); clearSelection(); render(); }
        else mutate(() => moveQuantity(inventory(drag.source), inventory(target), drag.uid, x, y, rotated));
    } catch { activeDrag = null; toast('拖放未完成，物品仍在原处。'); }
}
function bind() {
    ui().querySelectorAll<HTMLButtonElement>('[data-gs]').forEach(el => el.onclick = () => {
        if (!bench || el.disabled) return;
        audio.start(); audio.click();
        const value = el.closest('[data-gs-form]')?.querySelector('input')?.value ?? '';
        if (bench.act(el.dataset.gs!, el.dataset.arg ?? '', value) === 'close') { bench.dispose(); bench = null; setOverlay(''); } else render();
    });
    // The workbench's rename field: Enter clicks its save button; the form itself never submits.
    ui().querySelectorAll<HTMLFormElement>('form[data-gs-form]').forEach(form => form.onsubmit = e => e.preventDefault());
    const once = bench?.focusOnce();
    if (once) ui().querySelector<HTMLInputElement>(once)?.select();
    ui().querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.onclick = () => {
        const a = el.dataset.action!, id = el.dataset.id!;
        if (app.conflict && !['export-save', 'export-original', 'refresh'].includes(a)) {
            toast('另一个窗口已更新存档。请刷新此页，加载最新进度。');
            return;
        }
        audio.start();
        audio.click();
        if (app.pendingSettlement && a !== 'export-save' && a !== 'retry-save') return;
        if (shopping() && ['tab', 'deploy', 'menu', 'base-enter'].includes(a) && !(a === 'tab' && id === app.tab) && Shop.cartDirty(cart())) {
            app.shopLeave = { action: a as NonNullable<typeof app.shopLeave>['action'], id }; setOverlay('shop-leave'); return;
        }
        switch (a) {
            case 'checkout': if (Shop.saleWarnings(app.save, cart()).length) setOverlay('shop-quest'); else checkout(); break;
            case 'checkout-confirm': checkout(); break;
            case 'cart-reset': app.shop = null; clearSelection(); render(); break;
            case 'shop-browse': {
                // Only the catalog is built again; the buy and sell lists stay (#28 M2-08).
                const [what, value] = id.split(':');
                shopBrowse = what === 'kind' ? { kind: value as Shop.ShopBrowse['kind'], fits: shopBrowse.fits, page: 0 } : what === 'fits' ? { ...shopBrowse, fits: !shopBrowse.fits, page: 0 } : { ...shopBrowse, page: Number(value) };
                const page = Shop.catalogPage(app.save, app.tab as Shop.Merchant, rpgEnabled(app.expansion), shopBrowse);
                shopBrowse = { ...shopBrowse, page: page.page }; cart().catalog = page.catalog; clearSelection(); render(); break;
            }
            case 'shop-leave-confirm': {
                const next = app.shopLeave; app.shopLeave = null; app.shop = null; app.overlay = ''; clearSelection();
                if (next?.action === 'tab') { app.tab = next.id; render(); }
                else if (next?.action === 'menu') changeState('menu');
                else if (next?.action === 'deploy') deploy();
                else if (next?.action === 'base-enter') walkIn();
                break;
            }
            case 'container': app.mobileContainer = id; if (!app.placement) clearSelection(); render(); break;
            case 'grid-mode': app.inventoryGrid = !app.inventoryGrid; clearSelection(); render(); break;
            case 'place-item': app.placement = true; app.placementQuantity = undefined; app.placementRotated = undefined; if (app.selectedSource === 'stash') app.inventoryGrid = true; render(); break;
            case 'split-item': {
                const item = selected(), qty = Number((document.getElementById('split-quantity') as HTMLInputElement)?.value);
                if (!item || !Number.isInteger(qty) || qty < 1 || qty >= item.qty) { toast('请输入小于当前数量的正整数。'); break; }
                app.placement = true; app.placementQuantity = qty; app.placementRotated = undefined; if (app.selectedSource === 'stash') app.inventoryGrid = true; render(); break;
            }
            case 'rotate-preview': app.placementRotated = !(app.placementRotated ?? selected()?.rotated); render(); break;
            case 'rotate-item': {
                const i = selected(); if (!i) break;
                if (D.fits(inventory(app.selectedSource), i.id, i.x, i.y, i.uid, !i.rotated)) mutate(() => D.rotateItem(inventory(app.selectedSource), i.uid));
                else { app.placement = true; app.placementQuantity = undefined; app.placementRotated = !i.rotated; if (app.selectedSource === 'stash') app.inventoryGrid = true; render(); }
                break;
            }
            case 'clear-selection': clearSelection(); render(); break;
            case 'refresh': location.reload(); break;
            case 'export-original': {
                try {
                    const raw = saveSession.original(); if (!raw) { toast('浏览器内没有可导出的存档。'); break; }
                    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
                    const link = document.createElement('a'); link.href = url; link.download = 'Escape-Bincov-original-save.json'; link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch { toast('无法读取原始存档，请检查浏览器存储权限。'); }
                break;
            }
            case 'title-motion':
                if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    toast('系统已开启「减少动态效果」，景物保持静止。');
                    break;
                }
                app.menuMotion = !app.menuMotion;
                titleScene()?.setMotion(app.menuMotion);
                render();
                break;
            // The staged settlement keeps its own retry; any other failed base write retries through the HideoutRuntime.
            case 'retry-save': if (app.pendingSettlement) retrySettlement(); else retryBaseSave(); break;
            case 'export-save': exportSave(); break;
            case 'import-save': document.getElementById('backup-file')?.click(); break;
            case 'confirm-import':
                if (app.pendingRecoveryImport) {
                    // A failed write keeps the dialog open and reports it like a settled-save import.
                    if (saved(saveSession.importRecord(app.pendingRecoveryImport))) { app.pendingRecoveryImport = null; changeState('menu'); toast('备份已导入，可继续保存的行动。'); }
                } else if (app.pendingImport) importSave(app.pendingImport);
                break;
            case 'enter':
                // A saved raid resumes on the raid host, paused.
                if (sampleSupports()) {
                    if (saveSession.resumeRun()) void startCoastSample(true);
                    break;
                }
                // A new save's first entry plays the opening first (docs/OPENING-CUTSCENE-PLAN.md section 3).
                if (openingAutoplay(app.save.stats.runs, false)) { void playOpening('first').then(enterHideout); break; }
                enterHideout();
                break;
            case 'opening':
                void playOpening('replay').then(() => { if (app.state !== 'menu') return; render(); ui().querySelector<HTMLElement>('[data-action="opening"]')?.focus(); });
                break;
            case 'return':
                // The yard plays the walk-in with the Runtime's one-time arrival; if it cannot, the tab page still works.
                if (stationDefault()) void returnToStation().then(ok => { if (!ok && app.state === 'result') changeState('hideout'); });
                else changeState('hideout');
                break;
            case 'menu':
                changeState('menu');
                break;
            case 'help':
                setOverlay('help');
                break;
            case 'close':
                closeOverlay();
                break;
            case 'tab':
                if (app.tab !== id) app.shop = null;
                app.tab = id;
                clearSelection();
                render();
                break;
            case 'deploy': deploy(); break;
            case 'quest':
                mutate(() => D.submitQuest(app.save, id), D.QUESTS[id].radio, D.questRequirements(app.save, id).join('；') || '物资还没凑齐，请查看任务清单。');
                break;
            case 'upgrade':
                mutate(() => D.upgradeStash(app.save), '仓库已扩建。', `扩建需要完成「${D.QUESTS.repair.name}」，并支付 ¥${D.STASH_UPGRADE_COST}。`);
                break;
            case 'unequip':
                mutate(() => D.unequip(app.save), '主武器已放入仓库。', '仓库放不下武器和枪内子弹，请先腾出空间。');
                break;
            case 'relief':
                mutate(() => D.grantRelief(app.save), '救济物资已放入背包或仓库，放不下的留在水产站。', '暂时领不了救济补给，请先整理背包或仓库。');
                break;
            case 'sell':
                toast(app.selectedSource === 'stash' ? '将物品放进待卖区，再统一结算。' : '先在整备中移入仓库，再到商店出售。');
                app.tab = 'arms'; app.shop = null; clearSelection(); render();
                break;
            case 'gunsmith-open': if (id) openBench(id); break;
            case 'equip':
                mutate(() => D.equip(app.save, app.selected), '主武器已装备。', '无法装备，请给换下的武器和弹药腾出空间。');
                break;
            case 'stash-all':
                if (app.state === 'hideout' && !shopping()) mutate(() => transferBagToStash(app.save), '背包物品已全部入库，装备与安全箱保留。', app.save.bag.items.length ? '仓库空间不足，背包物品全部留在原处。' : '背包已经是空的。');
                break;
            case 'sort-stash':
                if (app.state === 'hideout' && !shopping()) mutate(() => organizeStash(app.save), '仓库已整理。', '当前无法重新排布，仓库保持原样。');
                break;
            case 'transfer': {
                const to = app.selectedSource === 'stash' ? 'bag' : 'stash';
                mutate(() => D.transferItem(inventory(app.selectedSource), inventory(to), app.selected), '物资已转移。', '放不下这件物品，请先整理目标容器。');
                break;
            }
            case 'secure': {
                const to = app.selectedSource === 'safe' ? 'bag' : 'safe';
                mutate(() => D.transferItem(inventory(app.selectedSource), inventory(to), app.selected), '物资已转移。', '放不下这件物品，请先整理目标容器。');
                break;
            }
            case 'base-enter': walkIn(); break;
            case 'facility-select': app.baseFacility = id; render(); break;
            case 'perk-attr': perkAttr = id as Attribute; render(); break;
            case 'perk-pick': previewPerkTab('choice', id); break;
            case 'perk-reset': previewPerkTab('reset', id); break;
            case 'perk-confirm': confirmPerkTab(); break;
            case 'facility-build': expansionAction(draft => buildFacility(draft.profile, draft.expansion, app.baseFacility as Facility), '设施已修建。'); break;
            case 'production-enqueue': expansionAction(draft => enqueueProduction(draft.profile, draft.expansion, id as keyof typeof RECIPES), '材料已支付，生产已排入队列。'); break;
            case 'production-claim': expansionAction(draft => claimProduction(draft.profile, draft.expansion, id, 'stash'), '整批物资已放入仓库。'); break;
            case 'production-cancel': expansionAction(draft => cancelProduction(draft.profile, draft.expansion, id), '材料与现金已退回。'); break;
            case 'premium-craft': expansionAction(draft => craftPremium(draft.profile, draft.expansion, id) === null, '老栓做好了，已放进仓库。'); break;
            case 'practice-select': expansionAction(draft => { draft.expansion.base.training.attribute = id as 'strength' | 'constitution' | 'technique'; }, '练习项目已更换。'); break;
            case 'charm-equip': expansionAction(draft => equipCharm(draft.profile, draft.expansion, app.selected, app.selectedSource as 'stash' | 'bag' | 'safe'), '护符已佩戴。'); break;
            case 'charm-unequip': expansionAction(draft => unequipCharm(draft.profile, draft.expansion), '护符已收起。'); break;
            case 'use-base': expansionAction(draft => {
                const inv = draft.profile[app.selectedSource as 'stash' | 'bag' | 'safe'], item = inv.items.find(i => i.uid === app.selected);
                if (!item || !useRpgItem(draft.expansion, item.id)) return false;
                item.qty--; if (!item.qty) inv.items = inv.items.filter(i => i.uid !== item.uid); return true;
            }, '补给已使用。'); break;
        }
    });
    ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(el => { el.onclick = () => { if (app.placement) return; app.selected = el.dataset.uid!; app.selectedSource = el.dataset.source!; ui().querySelectorAll<HTMLElement>('[data-uid]').forEach(node => { const active = node.dataset.uid === app.selected; node.classList.toggle('selected', active); node.setAttribute('aria-pressed', String(active)); }); const panel = ui().querySelector('.details'); if (panel)
        panel.outerHTML = details(); bind(); }; el.onkeydown = e => { if (e.key === 'Enter')
        el.click(); }; el.ondblclick = () => {
            if (app.conflict || app.pendingSettlement || shopping() || app.placement || touchLayout()) return;
            const from = el.dataset.source!, uid = el.dataset.uid!;
            if (app.state === 'hideout') mutate(() => D.transferItem(inventory(from), inventory(from === 'stash' ? 'bag' : 'stash'), uid), '物资已转移。', '目标容器空间不足，请先整理。');
        };
        el.onpointerdown = e => {
            if (touchLayout() || e.button !== 0 || app.placement || app.conflict || app.pendingSettlement) return;
            const grid = el.closest<HTMLElement>('[data-grid]'); if (!grid) return;
            const drag = beginDrag(el.dataset.uid!, el.dataset.source!);
            pointerDrag = { pointerId: e.pointerId, drag, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
                cell: Number(grid.dataset.cell) * grid.getBoundingClientRect().width / grid.offsetWidth, started: false };
            el.setPointerCapture(e.pointerId);
        };
    });
    ui().querySelectorAll<HTMLElement>('[data-grid]').forEach(el => {
        el.onclick = e => {
            if (!app.placement || !app.selected) return;
            const r = el.getBoundingClientRect(), cell = Number(el.dataset.cell);
            const x = Math.floor((e.clientX - r.left) / (r.width / el.offsetWidth) / cell), y = Math.floor((e.clientY - r.top) / (r.height / el.offsetHeight) / cell);
            if (shopping()) { if (Shop.moveShopItem(cart(), app.selectedSource as Shop.ShopSource, el.dataset.grid as Shop.ShopSource, app.selected, x, y)) { clearSelection(); render(); } else toast('请按清单规则放入有效空格。'); return; }
            if (mutate(() => moveQuantity(inventory(app.selectedSource), inventory(el.dataset.grid!), app.selected, x, y, app.placementRotated, app.placementQuantity))) { clearSelection(); render(); }
        };

    });
    const worldSelect = document.getElementById('run-world') as HTMLSelectElement | null;
    if (worldSelect) worldSelect.onchange = () => { app.runWorld = worldSelect.value === 'mall' ? 'mall' : worldSelect.value === 'buildings' ? 'buildings' : 'coast'; };
    const seed = document.getElementById('seed') as HTMLInputElement | null;
    if (seed)
        seed.oninput = () => app.seed = seed.value;
    const volume = document.getElementById('volume') as HTMLInputElement | null;
    if (volume)
        volume.oninput = () => {
            if (saved(saveSession.setVolume(Number(volume.value)))) audio.setVolume(app.save.settings.volume);
            else volume.value = String(app.save.settings.volume);
            document.getElementById('volume-label')!.textContent = Math.round(app.save.settings.volume * 100) + '%';
        };
    const file = document.getElementById('backup-file') as HTMLInputElement | null;
    if (file) file.onchange = async () => {
        const selectedFile = file.files?.[0];
        if (!selectedFile) return;
        try {
            if (selectedFile.size > SESSION_MAX_BYTES + 512) throw new Error('文件超过行动备份大小限制，请选择游戏导出的备份。');
            const candidate = decodePortableBackup(await selectedFile.text());
            if (app.state !== 'hideout' || app.conflict || app.pendingSettlement) return;
            app.pendingImport = candidate.kind === 'settled' ? candidate.save : null; app.pendingRecoveryImport = candidate.kind === 'session' ? candidate.record : null; setOverlay('import-save');
        } catch (error) { toast(error instanceof Error ? error.message : '无法读取存档文件。'); }
        file.value = '';
    };
}
