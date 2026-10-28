/** #28 M2-08: sale lines, where a part fits at the base, the shop's filters and pages, and room for the largest gun. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import * as Shop from '../src/shop';
import { ATTACHMENTS, GUNS, type GunId } from '../src/gunsmith/catalog';
import { checkInstall } from '../src/gunsmith/compat';
import { gunSale, gunSaleLines, gunSize } from '../src/gunsmith/instance';
import { partFits } from '../src/gunsmith/bench';
import { attachmentLines, gunPartsLine, saleLines, saleValue } from '../src/gunsmith/item-facts';
import { gun, hold, node, put } from './fixtures/workbench';

/** An M4A1 in hand, a G17 in the stash. */
function base() {
    const p = D.newSave(); p.stash = D.createInventory(10, 6); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2);
    hold(p, 'm4', 'mb4a1');
    put(p.stash, gun('g17', 'gb17'));
    return p;
}

test('the sale preview lists the body and each part; relief components add nothing and are marked', () => {
    const parts = [node('h', 'H01', 'handguard', [node('f', 'F01', 'under', [], true)]), node('o', 'O03', 'top')];
    const lines = gunSaleLines({ id: 'mb4a1', relief: false, parts });
    assert.deepEqual(lines.map(l => [l.id, l.price, l.relief]), [['mb4a1', GUNS.mb4a1.sell, false], ['H01', ATTACHMENTS.H01.sell, false], ['F01', 0, true], ['O03', ATTACHMENTS.O03.sell, false]]);
    assert.deepEqual(lines.map(l => l.name), ['M4A1 模块步枪', ATTACHMENTS.H01.name, ATTACHMENTS.F01.name, ATTACHMENTS.O03.name]);
    const sale = gunSale({ id: 'mb4a1', relief: false, parts });
    assert.equal(lines.reduce((n, l) => n + l.price, 0), sale.value);
    assert.equal(sale.restricted, true, 'a relief part bars the whole sale');
    assert.deepEqual(gunSaleLines({ id: 'gb17', relief: true, parts: [] }), [{ id: 'gb17', name: 'G17 通用手枪', price: 0, relief: true }]);
});

test('where a part fits at the base: now, or what the gun lacks first; guns it can never go on are left out', () => {
    const p = base();
    assert.deepEqual(partFits(p, 'O03'), [{ uid: 'm4', gun: 'M4A1 模块步枪', where: 'equipment', reason: null }]);
    assert.deepEqual(partFits(p, 'F01').map(f => [f.uid, f.reason]), [['m4', '需要 AR 短导轨护木或 AR 长导轨护木']]);
    assert.deepEqual(partFits(p, 'M03').map(f => [f.uid, f.reason]), [['g17', '需要九系精瞄枪管组']]);
    assert.deepEqual(partFits(p, 'O01').map(f => [f.uid, f.reason]), [['g17', null]]);
    assert.deepEqual(partFits(p, 'A07'), [], 'the carbine base: no carbine at the base');
    // An occupied slot still fits: the part would replace what sits there. A handguard on the M4A1 opens the rail.
    p.equipment.gun = { parts: [node('h', 'H01', 'handguard'), node('o', 'O08', 'top')], devices: { laser: false, light: false } };
    assert.deepEqual(partFits(p, 'O03').map(f => f.reason), [null]);
    assert.deepEqual(partFits(p, 'F01').map(f => f.reason), [null]);
    assert.deepEqual(partFits(p, 'watch'), [], 'not an attachment');
});

test('the catalog: by kind, only what fits the base\'s guns, and pages that each fit 6 x 5 in stock order', () => {
    const p = base(), all = Shop.browseStock(p, 'arms', true, Shop.BROWSE_ALL);
    assert.deepEqual(all, Shop.merchantStock('arms', true));
    assert.ok(Shop.browseStock(p, 'arms', true, { kind: 'attachment', fits: false, page: 0 }).every(D.isAttachment));
    assert.deepEqual(Shop.browseStock(p, 'arms', true, { kind: 'weapon', fits: false, page: 0 }), ['pistol', 'shotgun', 'carbine', 'gb17', 'pb226', 'mb870']);
    // Fits: the M4A1's and the G17's parts on the shelf (the bases and the AK parts are other guns'), and the rounds they fire.
    const fits = Shop.browseStock(p, 'arms', true, { kind: 'all', fits: true, page: 0 });
    assert.deepEqual(fits, Shop.merchantStock('arms', true).filter(id => ['ammo9', 'ammoR', 'P01', 'F01', 'P07', 'M01', 'M05', 'O01', 'G01'].includes(id)));
    assert.deepEqual(Shop.stockKinds('arms', true), ['weapon', 'ammo', 'part', 'attachment']);
    assert.deepEqual(Shop.stockKinds('med', true), ['medical', 'food']);
    // Since #28 M3 the arms counter's stock takes two pages (wave one's basic parts); a long list splits in order and each page fits.
    assert.equal(Shop.catalogPages(all).length, 2);
    assert.equal(Shop.catalogPages(Shop.merchantStock('med', true)).length, 1);
    const long = [...all, ...all, ...all], pages = Shop.catalogPages(long);
    assert.ok(pages.length > 1);
    assert.deepEqual(pages.flat(), long);
    for (const page of pages) {
        const inv = D.createInventory(Shop.CATALOG_W, Shop.CATALOG_H);
        for (const id of page) assert.equal(D.addItem(inv, id, D.buyQuantity(id)), 0);
    }
    assert.deepEqual(Shop.catalogPages([]), [[]]);
    // A page past the end clamps to the last; the cart's catalog is that page.
    const view = Shop.catalogPage(p, 'arms', true, { kind: 'all', fits: false, page: 9 });
    assert.deepEqual([view.page, view.pages], [1, 2]);
    assert.deepEqual(Shop.createCart(p, 'arms', true, { kind: 'ammo', fits: false, page: 0 }).catalog.items.map(i => i.id), ['ammo9', 'shell', 'ammoR']);
});

test('the buy and sell lists hold the largest legal gun that is an item, with the item parts that make it largest', () => {
    const cart = Shop.createCart(D.newSave(), 'arms'), parts = Object.keys(D.ITEMS).filter(D.isAttachment);
    for (const id of Object.keys(GUNS).filter(D.isGun) as GunId[]) {
        // The parts that lengthen or deepen a gun, one per slot, that this gun takes (an opener counts: it can be fitted).
        let { w, h } = gunSize({ id, parts: [] });
        const grow = new Map<string, { w: number; h: number }>();
        for (const pid of parts) {
            const a = ATTACHMENTS[pid], fit = checkInstall({ gun: id, parts: [] }, pid);
            if (!a.mods.grow || !(fit.ok || fit.code === 'needs' || fit.code === 'opener')) continue;
            const was = grow.get(a.mount) ?? { w: 0, h: 0 };
            grow.set(a.mount, { w: Math.max(was.w, a.mods.grow.w), h: Math.max(was.h, a.mods.grow.h) });
        }
        for (const g of grow.values()) { w += g.w; h += g.h; }
        for (const list of [cart.buy, cart.sell]) assert.ok(w <= list.w && h <= list.h, `${id} ${w}x${h} in ${list.w}x${list.h}`);
    }
});

test('the details lines: maker and guns, which gun at the base takes it, the parts of a gun, its composed sale value', () => {
    const p = base();
    assert.deepEqual(attachmentLines(p, 'F01'), [`制造商：${D.attachmentFacts('F01')!.brand} · 适配：${D.attachmentFacts('F01')!.guns.join('、')}`,
        '装在M4A1 模块步枪（装备中）上：需要 AR 短导轨护木或 AR 长导轨护木。']);
    assert.deepEqual(attachmentLines(p, 'O01').slice(1), ['能装在G17 通用手枪（在仓库）上。']);
    assert.deepEqual(attachmentLines(p, 'A07').slice(1), ['基地里还没有能装它的枪。']);
    assert.equal(attachmentLines(null, 'F01').length, 1, 'in a raid: the maker and guns only');
    assert.deepEqual(attachmentLines(p, 'watch'), []);
    const built = { id: 'mb4a1', qty: 1, gun: { parts: [node('h', 'H01', 'handguard', [node('f', 'F01', 'under')])], devices: { laser: false, light: false } } };
    assert.equal(gunPartsLine(built), `已装：${ATTACHMENTS.H01.name}、${ATTACHMENTS.F01.name}`);
    assert.equal(gunPartsLine({ id: 'mb4a1', gun: { parts: [], devices: { laser: false, light: false } } }), null);
    // The sale value is the composition, not the factory price.
    assert.deepEqual(saleValue(built), { value: GUNS.mb4a1.sell + ATTACHMENTS.H01.sell + ATTACHMENTS.F01.sell, note: null });
    assert.notEqual(saleValue(built).value, D.ITEMS.mb4a1.sell);
    const reliefPart = { ...built, gun: { parts: [node('h', 'H01', 'handguard', [], true)], devices: { laser: false, light: false } } };
    assert.deepEqual(saleValue(reliefPart), { value: null, note: '装有救济配件，不能整枪出售' });
    assert.deepEqual(saleValue({ id: 'watch', qty: 1, relief: true }), { value: null, note: '不可出售' });
    assert.deepEqual(saleLines(reliefPart), [`枪身 M4A1 模块步枪：¥ ${GUNS.mb4a1.sell}`, `配件 ${ATTACHMENTS.H01.name}：救济，不计价`]);
    assert.equal(saleLines({ id: 'mb4a1', gun: { parts: [], devices: { laser: false, light: false } } }), null);
});
