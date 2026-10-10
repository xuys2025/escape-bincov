/**
 * Base shops (修理铺 arms, 卫生所 med): real mouse drag and drop on the cart grids, from a fresh profile (¥700, empty
 * warehouse). Buying, selling, dragging back to cancel, refused drops, Esc/R/focus loss mid-drag, click-to-place and
 * touch tap-to-place, and checkout with a failed storage write followed by a retry. The only fixture is that write
 * fault; everything else goes through the visible UI. ?test=1 is used to read state, never to change the cart.
 *
 * On builds before the fix the first drag already fails: Chromium starts no native drag (-webkit-user-drag: none) and
 * the drop never reaches 待买, without any message.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { placeAt } from './inventory-actions.mjs';
import { testShopTouch } from './shop-touch-cases.mjs';

const html = resolve(process.env.BINCOV_SHOP_HTML || 'dist/index.html');
const out = resolve(process.env.BINCOV_SHOP_OUT || 'test-results/shop-drag'); await mkdir(out, { recursive: true });
const KEY = 'escape-bincov.session.v2';
const browser = await chromium.launch(browserOptions);
const report = { html, browser: browser.version(), startedAt: new Date().toISOString(), steps: [], errors: [], requests: [] };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function step(name, work) {
  const row = { name, status: 'running' }; report.steps.push(row);
  try { row.detail = await work(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); row.status = 'passed'; }
  catch (e) { row.status = 'failed'; row.error = String(e?.stack ?? e).slice(0, 1500); }
  console.log(`${row.status === 'passed' ? 'PASS' : 'FAIL'}  ${name}${row.error ? `\n      ${row.error.split('\n')[0]}` : ''}`);
}
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, ...options });
  context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  await page.goto(pathToFileURL(html).href + '?test=1&entry=tabs');
  return { context, page };
}
const action = (page, name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const state = page => page.evaluate(key => {
  const { app } = window.__bincov, list = grid => [...document.querySelectorAll(`.shop-layout [data-grid="${grid}"] [data-uid]`)].map(n => n.dataset.itemId);
  return { cash: app.save.cash, stash: app.save.stash.items.map(i => `${i.id}×${i.qty}`), stored: localStorage.getItem(key), buy: list('buy'), sell: list('sell'), stashGrid: list('stash'),
    toast: document.getElementById('toast')?.textContent ?? '',
    dragging: document.documentElement.classList.contains('inventory-dragging'), ghost: !!document.querySelector('.inventory-drag-ghost') };
}, KEY);
/** The visible cart total: positive to pay, negative to receive. */
const total = page => page.locator('.shop-checkout strong').evaluate(el => { const n = Number(el.textContent.replace(/[^0-9]/g, '')); return el.textContent.includes('可得') ? -n : n; });
const clearToast = page => page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.textContent = ''; });
/** Centre of cell (x, y) of a grid in page pixels. */
async function cellPoint(page, grid, x = 0, y = 0) {
  return page.locator(`.shop-layout [data-grid="${grid}"]`).evaluate((el, [x, y]) => {
    const r = el.getBoundingClientRect(), k = r.width / el.offsetWidth, cell = Number(el.dataset.cell) * k;
    return { x: r.left + (x + .5) * cell, y: r.top + (y + .5) * cell };
  }, [x, y]);
}
/**
 * Press on an item, move past the 5 px drag threshold, run `during` (with the pointer over the target), release over
 * the target cell. Returns what the page showed mid-drag.
 */
async function drag(page, source, id, target, x = 0, y = 0, during) {
  const item = page.locator(`.shop-layout [data-source="${source}"][data-item-id="${id}"]`).first();
  const a = await item.boundingBox(); assert.ok(a, `${source}/${id} on screen`);
  const to = await cellPoint(page, target, x, y);
  await page.mouse.move(a.x + 12, a.y + 12); await page.mouse.down();
  await page.mouse.move(a.x + 24, a.y + 24, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 14 });
  const mid = await page.evaluate(() => ({ ghost: !!document.querySelector('.inventory-drag-ghost'), preview: document.querySelector('.drop-preview')?.dataset.valid ?? null, previewW: document.querySelector('.drop-preview')?.style.width ?? null }));
  if (during) await during();
  await page.mouse.move(to.x + 1, to.y + 1);
  await page.mouse.up(); await wait(150);
  return mid;
}

for (const merchant of ['arms', 'med']) {
  const { context, page } = await open();
  await action(page, 'enter').click(); await wait(300);
  await action(page, 'tab', merchant).click(); await wait(300);
  const goods = merchant === 'arms' ? 'pistol' : 'bandage', label = merchant === 'arms' ? '修理铺' : '卫生所';
  const start = await state(page);
  await step(`${label}: drag 商人物品 -> 待买 lands on the chosen cell with a live preview; no money or save changes before checkout`, async () => {
    const mid = await drag(page, 'merchant', goods, 'buy', 1, 1);
    const s = await state(page);
    assert.deepEqual(s.buy, [goods], 'the pack is in 待买');
    const placed = await page.evaluate(id => { const i = window.__bincov.app.shop.buy.items.find(i => i.id === id); return i && [i.x, i.y]; }, goods);
    assert.deepEqual(placed, [1, 1], 'on the cell it was released over');
    assert.equal(mid.ghost, true, 'a drag ghost follows the pointer'); assert.equal(mid.preview, 'true', 'a valid drop preview over 待买');
    assert.equal(s.cash, start.cash); assert.deepEqual(s.stash, start.stash); assert.equal(s.stored, start.stored, 'nothing written before checkout');
    assert.equal(s.dragging, false); assert.equal(s.ghost, false);
    return { mid, cash: s.cash };
  });
  await step(`${label}: drag 待买 -> 商人物品 cancels the purchase`, async () => {
    await drag(page, 'buy', goods, 'merchant', 0, 4);
    const s = await state(page);
    assert.deepEqual(s.buy, []); assert.equal(s.cash, start.cash); assert.equal(s.stored, start.stored);
    return { buy: s.buy };
  });
  await step(`${label}: refused drops say why and move nothing; a catalog item dropped back on the catalog is a quiet cancel`, async () => {
    await clearToast(page);
    await drag(page, 'merchant', goods, 'sell', 0, 0);
    const refused = await state(page);
    assert.deepEqual(refused.sell, []); assert.deepEqual(refused.buy, []); assert.match(refused.toast, /先放入待买或待卖区/);
    await clearToast(page);
    await drag(page, 'merchant', goods, 'merchant', 5, 4);
    const back = await state(page);
    assert.equal(back.toast, '', 'no message for a change of mind'); assert.deepEqual(back.buy, []);
    return { refused: refused.toast };
  });
  await step(`${label}: focus loss, Esc and R mid-drag: the drag ends cleanly (or keeps the item's orientation) and the next drag works`, async () => {
    // Window blur while dragging (headless Chrome keeps focus, so the event is dispatched as the browser would).
    const blurMid = await drag(page, 'merchant', goods, 'buy', 0, 0, () => page.evaluate(() => window.dispatchEvent(new Event('blur'))));
    const blurred = await state(page);
    assert.equal(blurMid.ghost, true, 'the drag was under way when focus was lost');
    assert.deepEqual(blurred.buy, [], 'released after focus loss: nothing placed'); assert.equal(blurred.ghost, false); assert.equal(blurred.dragging, false);
    await drag(page, 'merchant', goods, 'buy', 0, 0, () => page.keyboard.press('Escape'));
    const escaped = await state(page);
    assert.deepEqual(escaped.buy, [], 'Esc cancels'); assert.equal(escaped.ghost, false);
    let widths = null;
    await drag(page, 'merchant', goods, 'buy', 0, 0, async () => {
      const before = await page.evaluate(() => document.querySelector('.drop-preview')?.style.width);
      await page.keyboard.press('r'); await page.mouse.move((await cellPoint(page, 'buy', 0, 0)).x + 2, (await cellPoint(page, 'buy', 0, 0)).y + 2);
      widths = [before, await page.evaluate(() => document.querySelector('.drop-preview')?.style.width)];
    });
    const after = await state(page);
    assert.ok(widths[0], 'a preview was shown'); assert.equal(widths[0], widths[1], 'R does not rotate a cart item'); assert.deepEqual(after.buy, [goods], 'the next drag after blur/Esc/R works');
    await drag(page, 'buy', goods, 'merchant', 0, 4);
    return { widths };
  });
  await step(`${label}: click-to-place (选中 → 移动格位 → 点格) still works and does not start a drag`, async () => {
    await placeAt(page, 'merchant', goods, 'buy');
    const s = await state(page); assert.deepEqual(s.buy, [goods]); assert.equal(s.ghost, false);
    return { buy: s.buy };
  });
  await step(`${label}: checkout with a failed storage write keeps money, warehouse and cart; the retry buys once`, async () => {
    const before = await state(page), due = await total(page);
    await page.evaluate(key => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('Injected fault', 'QuotaExceededError'); return window.__set.call(this, k, v); }; }, KEY);
    await clearToast(page); await action(page, 'checkout').click(); await wait(200);
    const failed = await state(page);
    await page.evaluate(() => { Storage.prototype.setItem = window.__set; });
    assert.equal(failed.cash, before.cash, 'no money taken'); assert.deepEqual(failed.stash, before.stash, 'warehouse unchanged');
    assert.equal(failed.stored, before.stored, 'stored save unchanged'); assert.deepEqual(failed.buy, [goods], 'cart kept for a retry');
    assert.match(failed.toast, /保存失败/);
    await action(page, 'checkout').click(); await wait(200);
    const done = await state(page);
    assert.ok(due > 0); assert.equal(done.cash, before.cash - due, `paid exactly once: ${before.cash} - ${due}`); assert.equal(done.stash.length, before.stash.length + 1); assert.deepEqual(done.buy, []);
    assert.notEqual(done.stored, before.stored, 'the purchase is saved');
    return { cash: [before.cash, failed.cash, done.cash], due, stash: done.stash };
  });
  await step(`${label}: drag 仓库 -> 待卖, back to 仓库 (cancel), again to 待卖, then sell`, async () => {
    const before = await state(page);
    await drag(page, 'stash', goods, 'sell', 0, 0);
    const staged = await state(page);
    assert.deepEqual(staged.sell, [goods]); assert.equal(staged.cash, before.cash); assert.equal(staged.stored, before.stored, 'nothing written while staging a sale');
    await drag(page, 'sell', goods, 'stash', 6, 3);
    const back = await state(page);
    assert.deepEqual(back.sell, []); assert.ok(back.stashGrid.includes(goods), 'back in the warehouse grid'); assert.equal(back.stored, before.stored);
    await drag(page, 'stash', goods, 'sell', 1, 0);
    const income = -(await total(page));
    await action(page, 'checkout').click(); await wait(200);
    const sold = await state(page);
    assert.ok(income > 0); assert.equal(sold.cash, before.cash + income, `sold once: ${before.cash} + ${income}`); assert.equal(sold.stash.length, before.stash.length - 1); assert.deepEqual(sold.sell, []);
    return { cash: [before.cash, sold.cash], income };
  });
  await page.screenshot({ path: resolve(out, `${merchant}-1280x720.png`) });
  await context.close();
}

{ // Touch: the cart keeps tap-to-place; no drag starts from a touch.
  const { context, page } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await step('touch 844x390: tap-to-place moves 商人物品 -> 待买; items are not draggable', async () => {
    await action(page, 'enter').tap(); await wait(300);
    await action(page, 'tab', 'arms').tap(); await wait(300);
    const draggable = await page.evaluate(() => [...document.querySelectorAll('.shop-layout [data-uid]')].some(n => n.getAttribute('draggable') === 'true'));
    await page.locator('.shop-layout [data-source="merchant"][data-item-id="pistol"]').tap();
    await page.locator('[data-action="place-item"]').tap();
    const to = await cellPoint(page, 'buy', 0, 0); await page.touchscreen.tap(to.x, to.y); await wait(200);
    const s = await state(page);
    assert.equal(draggable, false); assert.deepEqual(s.buy, ['pistol']); assert.equal(s.ghost, false);
    return { buy: s.buy };
  });
  await context.close();
}

await testShopTouch({ browser, html, out, step, report });
await browser.close();
report.finishedAt = new Date().toISOString();
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const passed = report.steps.filter(s => s.status === 'passed').length;
console.log(`${passed}/${report.steps.length} passed; errors ${report.errors.length}; external requests ${report.requests.length}`);
if (passed !== report.steps.length || report.errors.length || report.requests.length) process.exitCode = 1;
