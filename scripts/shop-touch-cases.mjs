/** Emulated touch cart regression for both merchants. Fresh ordinary UI; only session-write fault injection.
 * Used by test:shop-drag in CI. This does not replace physical-device or human acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const sha = value => createHash('sha256').update(value ?? '').digest('hex'), KEY = 'escape-bincov.session.v2';
const read = p => p.evaluate(key => ({ save: structuredClone(window.__bincov.app.save), cart: structuredClone(window.__bincov.app.shop), stored: localStorage.getItem(key), toast: document.getElementById('toast')?.textContent || '', ghost: !!document.querySelector('.inventory-drag-ghost'), dragging: document.documentElement.classList.contains('inventory-dragging') }), KEY);
const summarize = s => ({ cash: s.save.cash, stash: s.save.stash.items.map(x => ({ id: x.id, uid: x.uid, qty: x.qty, x: x.x, y: x.y })), buy: s.cart.buy.items.map(x => ({ id: x.id, qty: x.qty, x: x.x, y: x.y })), sell: s.cart.sell.items.map(x => ({ id: x.id, qty: x.qty, x: x.x, y: x.y })), storedSHA256: sha(s.stored), ghost: s.ghost, dragging: s.dragging });
async function place(p, source, id, target, x = 0, y = 0) { await p.locator(`.shop-layout [data-source="${source}"][data-item-id="${id}"]`).first().tap(); await p.locator('[data-action="place-item"]').tap(); const grid = p.locator(`.shop-layout [data-grid="${target}"]`), cell = await grid.evaluate(el => Number(el.dataset.cell) * el.getBoundingClientRect().width / el.offsetWidth); await grid.tap({ position: { x: (x + .5) * cell, y: (y + .5) * cell } }); }
const total = p => p.locator('.shop-checkout strong').evaluate(el => { const n = Number(el.textContent.replace(/[^0-9]/g, '')); return el.textContent.includes('可得') ? -n : n; });
export async function testShopTouch({ browser, html, out, step, report }) {
    for (const merchant of ['arms', 'med']) {
        const id = merchant === 'arms' ? 'pistol' : 'bandage', ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, offline: true }), p = await ctx.newPage();
        p.setDefaultTimeout(12000);
        p.on('pageerror', e => report.errors.push(e.message));
        ctx.on('request', r => { if (/^https?:/.test(r.url()))
            report.requests.push(r.url()); });
        try {
            await p.goto(pathToFileURL(html).href + '?test=1&entry=tabs');
            await p.locator('[data-action="enter"]').tap();
            await p.locator(`[data-action="tab"][data-id="${merchant}"]`).tap();
            await p.waitForFunction(m => window.__bincov.app.shop?.merchant === m, merchant);
            await step(merchant + ' touch merchant -> buy -> merchant, no durable or money changes', async () => { const before = await read(p); await place(p, 'merchant', id, 'buy', 1, 1); const staged = await read(p); assert.equal(staged.cart.buy.items.length, 1); assert.deepEqual([staged.cart.buy.items[0].x, staged.cart.buy.items[0].y], [1, 1]); assert.deepEqual(staged.save, before.save); assert.equal(staged.stored, before.stored); assert.equal(staged.ghost, false); await p.screenshot({ path: out + '/' + merchant + '-touch-buy.png' }); await place(p, 'buy', id, 'merchant', 0, 4); const back = await read(p); assert.equal(back.cart.buy.items.length, 0); assert.deepEqual(back.save, before.save); assert.equal(back.stored, before.stored); assert.equal(await p.locator('.shop-layout [draggable="true"]').count(), 0); return { before: summarize(before), staged: summarize(staged), back: summarize(back) }; });
            await step(merchant + ' touch purchase -> stash -> sell -> stash, staging sale and cancelling preserve save', async () => { const before = await read(p); await place(p, 'merchant', id, 'buy', 0, 0); const due = await total(p); await p.locator('[data-action="checkout"]').tap(); const purchased = await read(p); assert.equal(purchased.save.cash, before.save.cash - due); assert.equal(purchased.save.stash.items.length, before.save.stash.items.length + 1); assert.equal(purchased.save.stash.items.filter(x => x.id === id).length, 1); await place(p, 'stash', id, 'sell', 0, 0); const staged = await read(p); assert.equal(staged.cart.sell.items.length, 1); assert.deepEqual(staged.save, purchased.save); assert.equal(staged.stored, purchased.stored); await place(p, 'sell', id, 'stash', 6, 3); const back = await read(p); assert.equal(back.cart.sell.items.length, 0); assert.equal(back.cart.stash.items.length, purchased.save.stash.items.length); assert.deepEqual(back.save, purchased.save); assert.equal(back.stored, purchased.stored); return { due, purchased: summarize(purchased), staged: summarize(staged), back: summarize(back) }; });
            await step(merchant + ' mixed buy/sell write failure preserves whole save and whole cart; retry settles exactly once', async () => {
                await place(p, 'stash', id, 'sell', 1, 0);
                await place(p, 'merchant', id, 'buy', 1, 1);
                const before = await read(p), due = await total(p), oldUID = before.cart.sell.items[0].uid, qty = before.cart.buy.items[0].qty;
                assert(before.cart.buy.items.length === 1 && before.cart.sell.items.length === 1);
                let attempts = 0;
                await p.evaluate(key => { window.__shopOriginalSet = Storage.prototype.setItem; window.__shopFailedWrites = 0; Storage.prototype.setItem = function (k, v) { if (k === key) {
                    window.__shopFailedWrites++;
                    throw new DOMException('Sol mixed checkout fault', 'QuotaExceededError');
                } return window.__shopOriginalSet.call(this, k, v); }; }, KEY);
                let failed;
                try {
                    await p.locator('[data-action="checkout"]').tap();
                    failed = await read(p);
                    attempts = await p.evaluate(() => window.__shopFailedWrites);
                }
                finally {
                    await p.evaluate(() => { Storage.prototype.setItem = window.__shopOriginalSet; delete window.__shopOriginalSet; });
                }
                assert(attempts > 0);
                assert.deepEqual(failed.save, before.save);
                assert.deepEqual(failed.cart, before.cart);
                assert.equal(failed.stored, before.stored);
                assert.match(failed.toast, /保存失败/);
                await p.screenshot({ path: out + '/' + merchant + '-touch-write-failed.png' });
                await p.locator('[data-action="checkout"]').tap();
                const done = await read(p);
                assert.equal(done.save.cash, before.save.cash - due);
                assert.equal(done.save.stash.items.length, before.save.stash.items.length);
                const bought = done.save.stash.items.filter(x => x.id === id);
                assert.equal(bought.length, 1);
                assert.equal(bought[0].qty, qty);
                assert.notEqual(bought[0].uid, oldUID);
                assert.equal(done.save.stash.items.some(x => x.uid === oldUID), false);
                assert.deepEqual(done.save.stash.items.filter(x => x.id !== id), before.save.stash.items.filter(x => x.id !== id));
                assert.equal(done.cart.buy.items.length, 0);
                assert.equal(done.cart.sell.items.length, 0);
                assert.notEqual(done.stored, before.stored);
                assert.equal(await p.locator('[data-action="checkout"]').isDisabled(), true);
                return { due, failedWriteAttempts: attempts, before: summarize(before), failed: summarize(failed), done: summarize(done) };
            });
        }
        catch (e) {
            report.steps.push({ name: merchant + ' setup', status: 'failed', error: e.stack });
            process.exitCode = 1;
        }
        finally {
            await ctx.close();
        }
    }
}
