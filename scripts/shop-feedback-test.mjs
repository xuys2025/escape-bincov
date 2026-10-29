// Packaged game, real transactions and visible controls; only inventory setup uses ?test=1.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { stepFilter } from './step-filter.mjs';
const option = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const cpuRate = Number(option('cpu-rate', '1')), filter = stepFilter(), only = filter.prefixes ?? [];
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1 && cpuRate <= 24, 'cpu-rate must be between 1 and 24');
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/shop-feedback'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions), report = { sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), cpuRate, only, checks: [] };
let context, page, errors = [], currentCheck, throttleSession;
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
async function open(size, kind, tabs = false, fixedTime = true) {
  await throttleSession?.detach(); throttleSession = undefined;
  await context?.close(); context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, hasTouch: size[0] < 500 });
  errors = [];
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://shop.test/')) errors.push(`External request: ${r.url()}`); });
  await context.route('https://shop.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(String(e.stack)));
  if (fixedTime) await page.clock.setFixedTime(new Date());
  else await page.addInitScript(() => {
    // Pin the business checkpoint clock only. Native performance/Event timestamps and frames keep running.
    const now = Date.now(); Date.now = () => now;
  });
  await page.goto(`https://shop.test/?test=1${tabs ? '&entry=tabs' : ''}`);
  await page.waitForFunction(() => window.__bincov?.hideoutRuntime);
  await page.evaluate(kind => {
    const s = window.__bincov.saveSession; if (!s.ensureRpg()) throw Error('fixture upgrade');
    const ticket = s.prepareExpansionMutation(d => {
      d.profile.cash = kind === 'funds' ? 0 : 5000;
      d.profile.stash.items = kind === 'space' ? Array.from({ length: d.profile.stash.w * d.profile.stash.h }, (_, i) => ({ uid: `full-${i}`, id: 'scrap', qty: 5, x: i % d.profile.stash.w, y: Math.floor(i / d.profile.stash.w) }))
        : kind.startsWith('goods') ? [{ uid: 'st-watch', id: 'watch', qty: 1, x: 0, y: 0 }, { uid: 'st-relief', id: 'ammo9', qty: 12, relief: true, x: 1, y: 0 }, { uid: 'st-pistol', id: 'pistol', qty: 1, x: 2, y: 0, gun: { parts: [], devices: { laser: false, light: false } } }] : [];
      // 'goods': one sellable watch still in the bag; 'goods-clear': nothing outside the stash.
      if (kind.startsWith('goods')) { d.profile.bag.items = kind === 'goods' ? [{ uid: 'bag-watch', id: 'watch', qty: 1, x: 0, y: 0 }] : []; d.profile.safe.items = []; }
    });
    if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('fixture commit');
  }, kind);
  await page.locator('[data-action="enter"]').click();
  if (tabs) await page.locator('[data-action="tab"][data-id="arms"]').click();
  else {
    await page.waitForFunction(() => window.__station?.mounted);
    const quick = page.locator('#station-yard [data-quick="arms"]');
    if (!await quick.isVisible()) await page.locator('#station-yard [data-quickmenu]').click();
    await quick.click();
  }
}
async function pistolTarget() {
  const uid = await page.evaluate(() => window.__station.host.ui.shop.view().catalog.items.find(i => i.id === 'pistol').uid);
  const item = page.locator(`#station-yard [data-grid="merchant"] [data-uid="${uid}"]`);
  await item.scrollIntoViewIfNeeded();
  await page.evaluate(async () => { const root = document.querySelector('#station-yard').shadowRoot; await Promise.all([...root.querySelectorAll('.panel')].flatMap(e => e.getAnimations()).map(a => a.finished.catch(() => {}))); });
  const box = await item.boundingBox(); assert.ok(box, 'merchant pistol is visible');
  return { item, uid, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
// Playwright already queues start/end within a tap. Queue BOTH taps before awaiting renderer acknowledgments
// so yard frames cannot become an unintended pause between gestures (CI-SHOP-TOUCH-01).
// Explicit CDP timestamps and a real main-thread stall are used only by the timing regression below.
async function doubleTap({ x, y, uid }, { inputGapMs, blockSecondUpMs = 0 } = {}) {
  const trace = { mode: 'queued-cdp-touch', interactionCpuRate: cpuRate, inputGapMs: inputGapMs ?? null, blockSecondUpMs, events: [] };
  currentCheck.taps = trace;
  let cdp, listening = false;
  try {
    await page.evaluate(blockMs => {
      const events = [], types = ['pointerdown', 'pointerup', 'pointercancel']; let ups = 0;
      const listener = e => {
        const receivedAt = performance.now(), timeStamp = e.timeStamp;
        if (e.type === 'pointerup' && ++ups === 2 && blockMs) {
          const until = performance.now() + blockMs; while (performance.now() < until) { /* deliberate long task */ }
        }
        const item = e.composedPath().find(el => el instanceof HTMLElement && el.matches('.item[data-uid]'));
        events.push({ type: e.type, timeStamp, receivedAt, beforeHandlerAt: performance.now(),
          pointerId: e.pointerId, pointerType: e.pointerType, trusted: e.isTrusted, uid: item?.dataset.uid ?? null });
      };
      for (const type of types) addEventListener(type, listener, { capture: true });
      window.__shopTapTrace = { events, dispose: () => { for (const type of types) removeEventListener(type, listener, { capture: true }); } };
    }, blockSecondUpMs);
    listening = true;
    cdp = await context.newCDPSession(page);
    if (cpuRate > 1) {
      // Stress the gesture/transaction, not page bootstrap. Keep the Emulation session: detach resets its throttle.
      throttleSession = await context.newCDPSession(page);
      await throttleSession.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    }
    const base = Date.now() / 1000 - 1;
    const sequence = [['touchStart', [{ x, y }]], ['touchEnd', []], ['touchStart', [{ x, y }]], ['touchEnd', []]];
    const results = await Promise.allSettled(sequence.map(([type, touchPoints], i) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints, ...(inputGapMs === undefined ? {} : { timestamp: base + (i < 2 ? 0 : inputGapMs / 1000) }),
    })));
    const rejected = results.find(r => r.status === 'rejected'); if (rejected) throw rejected.reason;
  } finally {
    try {
      if (listening) trace.events = await page.evaluate(() => {
        const trace = window.__shopTapTrace; trace.dispose(); delete window.__shopTapTrace; return trace.events;
      });
    } finally { await cdp?.detach(); }
    const ups = trace.events.filter(e => e.type === 'pointerup');
    trace.gapMs = ups.length === 2 ? ups[1].timeStamp - ups[0].timeStamp : null;
    trace.handlerGapMs = ups.length === 2 ? ups[1].beforeHandlerAt - ups[0].beforeHandlerAt : null;
  }
  assert.deepEqual(trace.events.map(e => e.type), ['pointerdown', 'pointerup', 'pointerdown', 'pointerup'], 'ordered real taps without cancellation');
  assert.ok(trace.events.every(e => e.trusted && e.pointerType === 'touch'), 'browser input pipeline must produce trusted touch pointers');
  assert.ok(trace.events.filter(e => e.type === 'pointerdown').every(e => e.uid === uid), 'both taps hit the same merchant item');
  return trace;
}
async function check(name, fn) {
  if (!filter.selects(name)) return;
  const row = { name }; report.checks.push(row);
  currentCheck = row;
  try { row.detail = await fn(); assert.deepEqual(errors, []); row.status = 'passed'; }
  catch (e) { row.status = 'failed'; row.error = `${e.stack ?? e}${row.taps ? `; taps=${JSON.stringify(row.taps)}` : ''}`; process.exitCode = 1; }
  await page?.screenshot({ path: resolve(out, `${report.checks.length}.png`) }).catch(() => {});
  console.log(row.status, name, row.error?.split('\n')[0] ?? '');
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
try {
  for (const size of [[1280, 720], [1920, 1080], [390, 844]]) for (const kind of ['funds', 'space']) await check(`${size.join('x')} ${kind} rejection`, async () => {
    await open(size, kind);
    const target = await pistolTarget();
    if (size[0] < 500) {
      await doubleTap(target);
    } else await target.item.dblclick();
    await page.waitForFunction(() => window.__station.host.ui.shop.view().buy.items.length === 1);
    const before = await raw(); await page.locator('#station-yard [data-act="cart-settle"]').click();
    const toast = page.locator('#station-yard .toast').last(); await toast.waitFor();
    const message = await toast.innerText(); assert.match(message, kind === 'funds' ? /现金不足/ : /仓库空间不足/);
    assert.equal(await raw(), before); assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().buy.items.length), 1);
    await toast.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
    const box = await toast.boundingBox(); assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size[0] + 1 && box.y + box.height <= size[1] + 1);
    return { message, box, unchangedSave: true };
  });
  await check('timing: quick input survives a long task before its second pointerup handler', async () => {
    // Playwright's fake clock caches timeStamp at its first read. Use native event times for this gate.
    await open([390, 844], 'funds', false, false);
    currentCheck.clock = { nativeInputTime: true, frozenDateNow: true };
    const before = await raw(), target = await pistolTarget();
    const taps = await doubleTap(target, { inputGapMs: 80, blockSecondUpMs: 450 });
    assert.ok(taps.gapMs >= 0 && taps.gapMs < 320, 'actual pointer timestamps are inside the quick-transfer window');
    assert.ok(taps.handlerGapMs > 320, 'a real long task must delay handler processing beyond the old window');
    assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().buy.items.length), 1, 'quick input still enters the cart after the stall');
    assert.equal(await raw(), before, 'entering cart does not settle or write a save');
    return { unchangedSave: true };
  });
  await check('timing: inputs 350 ms apart remain separate selections even when queued together', async () => {
    await open([390, 844], 'funds', false, false);
    currentCheck.clock = { nativeInputTime: true, frozenDateNow: true };
    const before = await raw(), target = await pistolTarget();
    const taps = await doubleTap(target, { inputGapMs: 350 });
    assert.ok(taps.gapMs >= 320, 'actual pointer timestamps are outside the quick-transfer window');
    assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().buy.items.length), 0, 'separate input never enters the cart');
    assert.ok(await page.locator(`#station-yard [data-grid="merchant"] [data-uid="${target.uid}"].sel`).count(), 'second input still selects the pistol');
    assert.equal(await raw(), before);
    return { unchangedSave: true };
  });
  for (const tabs of [false, true]) await check(`${tabs ? 'tabs' : 'yard'} refreshes stale empty cart without reopening`, async () => {
    await open([1280, 720], 'stale', tabs);
    await page.evaluate(() => {
      const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => { d.profile.stash.items.push({ uid: 'new-stock', id: 'watch', qty: 1, x: 0, y: 0 }); });
      if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('external commit');
      window.__bincov.hideoutRuntime.snapshot();
      if (window.__station?.mounted) window.__station.host.ui.refresh(true);
    });
    if (tabs) await page.locator('[data-action="tab"][data-id="arms"]').click();
    const before = await raw(), reset = page.locator(tabs ? '[data-action="cart-reset"]' : '#station-yard [data-act="cart-reset"]');
    await reset.waitFor(); assert.equal(await reset.innerText(), '刷新清单'); assert.ok(await reset.isEnabled());
    await reset.click(); assert.equal(await raw(), before);
    await page.locator(`${tabs ? '' : '#station-yard '}[data-grid="stash"] [data-uid="new-stock"]`).waitFor();
    if (!tabs) assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().stale), false);
    return { unchangedSave: true, newStockVisible: true };
  });
  for (const kind of ['funds', 'space']) await check(`legacy tabs show the same ${kind} rejection`, async () => {
    await open([1280, 720], kind, true);
    const uid = await page.evaluate(() => window.__bincov.app.shop.catalog.items.find(i => i.id === 'pistol').uid);
    const item = await page.locator(`[data-grid="merchant"] [data-uid="${uid}"]`).boundingBox();
    const target = await page.locator('[data-grid="buy"]').boundingBox();
    await page.mouse.move(item.x + 10, item.y + 10); await page.mouse.down();
    await page.mouse.move(target.x + 10, target.y + 10, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => window.__bincov.app.shop.buy.items.length === 1);
    const before = await raw(); await page.locator('[data-action="checkout"]').click();
    const message = await page.locator('#toast').innerText(); assert.match(message, kind === 'funds' ? /现金不足/ : /仓库空间不足/);
    assert.equal(await raw(), before); return { message, unchangedSave: true };
  });
  await check('another window still locks settlement and cannot be overwritten through refresh', async () => {
    await open([1280, 720], 'funds');
    const peer = await context.newPage(); await peer.goto('https://shop.test/?test=1');
    await peer.waitForFunction(() => window.__bincov?.saveSession);
    // A real other-window storage event, with valid new bytes; no mutation of this window's state flags.
    const newer = await peer.evaluate(() => {
      const key = 'escape-bincov.session.v2', record = JSON.parse(localStorage.getItem(key));
      record.revision++; record.profile.cash += 1; const raw = JSON.stringify(record); localStorage.setItem(key, raw); return raw;
    });
    await page.waitForFunction(() => window.__bincov.app.conflict);
    const result = await page.evaluate(() => {
      const shop = window.__station.host.ui.shop; shop.reset(); return shop.settle();
    });
    assert.equal(result.reason, 'conflict'); assert.equal(await raw(), newer); await peer.close();
    return { result, newerSavePreserved: true };
  });

  // #26 F03 yard shop: side-aware price, quest use, real quick-move reasons, stash-first note, compact price.
  // Selections are single clicks or single taps on different items; the only double tap reuses doubleTap above.
  const shot = name => page.screenshot({ path: resolve(out, `${name}.png`) });
  const yard = sel => page.locator(`#station-yard ${sel}`);
  async function itemTarget(grid, uid) {
    const item = yard(`[data-grid="${grid}"] [data-uid="${uid}"]`);
    await item.scrollIntoViewIfNeeded();
    await page.evaluate(async () => { const root = document.querySelector('#station-yard').shadowRoot; await Promise.all([...root.querySelectorAll('.panel')].flatMap(e => e.getAnimations()).map(a => a.finished.catch(() => {}))); });
    const box = await item.boundingBox(); assert.ok(box, `${grid} ${uid} is visible`);
    return { item, uid, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  // Every grid's cell size, the merchant pistol's box and the details height: a selection must not change any of them.
  const shopGeometry = () => page.evaluate(() => {
    const root = document.querySelector('#station-yard').shadowRoot, uid = window.__station.host.ui.shop.view().catalog.items.find(i => i.id === 'pistol').uid;
    const r = root.querySelector(`[data-grid="merchant"] [data-uid="${uid}"]`).getBoundingClientRect(), details = root.querySelector('.panel .details');
    return { cells: Object.fromEntries([...root.querySelectorAll('.grid')].map(g => [g.dataset.grid, Number(g.dataset.cell)])), pistol: [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10), details: details ? Math.round(details.getBoundingClientRect().height * 10) / 10 : null };
  });
  const horizontalOverflow = () => page.evaluate(() => { const p = document.querySelector('#station-yard').shadowRoot.querySelector('.panel'); return p.scrollWidth - p.clientWidth; });
  const uidOf = id => page.evaluate(id => window.__station.host.ui.shop.view().catalog.items.find(i => i.id === id).uid, id);
  for (const size of [[1280, 720], [1920, 1080], [1280, 600]]) await check(`F03 C1 ${size.join('x')} details price by side and fixed shop geometry`, async () => {
    await open(size, 'goods');
    await itemTarget('merchant', await uidOf('pistol'));
    const geometry = await shopGeometry(), before = await raw(), rows = [], hint = await yard('.panel .details.empty').innerText();
    const picks = [['merchant', await uidOf('ammo9'), '买入 ¥ 84'], ['merchant', await uidOf('scrap'), '买入 ¥ 85', '任务用途：让灯亮起来'],
      ['stash', 'st-watch', '卖出 ¥ 240'], ['stash', 'st-pistol', '卖出 ¥ 150'], ['stash', 'st-relief', '不可出售']];
    for (const [grid, uid, price, use] of picks) {
      await yard(`[data-grid="${grid}"] [data-uid="${uid}"]`).click();
      await yard(`[data-grid="${grid}"] [data-uid="${uid}"].sel`).waitFor();
      // Geometry first: on the old build the first click grows the details and the fit loop shrinks every cell.
      assert.deepEqual(await shopGeometry(), geometry, `selecting ${grid} ${uid} must keep the shop geometry`);
      const shown = await yard('.panel .details').evaluate(el => ({ dl: el.querySelector('dl').innerText.replace(/\s+/g, ' '), kind: el.querySelector('.dtext small').textContent, clipped: el.scrollHeight - el.clientHeight }));
      assert.ok(shown.dl.endsWith(price), `${uid}: ${shown.dl}`); if (use) assert.ok(shown.kind.includes(use), shown.kind);
      assert.ok(shown.clipped <= 1, `details content fits its fixed box (${shown.clipped}px)`);
      rows.push({ uid, ...shown });
      if (size[1] !== 600 && (uid === 'st-pistol' || use)) await shot(`F03-C1-${size.join('x')}-${grid}`);
    }
    assert.match(hint, /双击加入或放回/, 'the empty details mention the double-click move');
    assert.equal(await raw(), before, 'selection never writes the save');
    return { geometry, hint, rows };
  });
  for (const size of [[1280, 720], [390, 844]]) await check(`F03 C2 ${size.join('x')} quick move of relief goods names the rule`, async () => {
    await open(size, 'goods');
    if (size[0] < 500) await yard('[data-act="mode:sell"]').tap();
    const target = await itemTarget('stash', 'st-relief'), before = await raw();
    if (size[0] < 500) await doubleTap(target); else await target.item.dblclick();
    const toast = yard('.toast').last(); await toast.waitFor();
    const message = await toast.innerText(); assert.equal(message, '这件物品不可出售。');
    assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().sell.items.length), 0, 'sell list stays empty');
    assert.equal(await raw(), before);
    if (size[0] > 500) { await toast.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); }); await shot(`F03-C2-${size.join('x')}-relief-toast`); }
    return { message, unchangedSave: true };
  });
  await check('F03 C2 1280x720 quick move on a changed stash asks for a refresh', async () => {
    await open([1280, 720], 'goods');
    await page.evaluate(() => {
      const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => { d.profile.stash.items.push({ uid: 'new-stock', id: 'watch', qty: 1, x: 9, y: 5 }); });
      if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('external commit');
      window.__bincov.hideoutRuntime.snapshot(); window.__station.host.ui.refresh(true);
    });
    const target = await itemTarget('merchant', await uidOf('pistol')), before = await raw();
    await target.item.dblclick();
    const toast = yard('.toast').last(); await toast.waitFor();
    const message = await toast.innerText(); assert.equal(message, '仓库已改变，请刷新清单后重新选择物品。');
    assert.equal(await page.evaluate(() => window.__station.host.ui.shop.view().buy.items.length), 0, 'buy list stays empty');
    assert.equal(await raw(), before);
    return { message, unchangedSave: true };
  });
  for (const [size, kind, expected] of [[[1280, 720], 'goods', '整组出售 · 背包与安全箱 1 件需先入库'], [[1280, 720], 'goods-clear', '整组出售'], [[844, 390], 'goods', '整组出售 · 背包与安全箱 1 件需先入库']]) await check(`F03 C3 ${size.join('x')} ${kind} stash header`, async () => {
    await open(size, kind);
    const compact = size[0] < 900;
    if (compact) await yard('[data-act="mode:sell"]').click();
    const header = yard(compact ? '.cshop .pane' : '.shop section').filter({ has: page.locator('[data-grid="stash"]') }).locator('h3 small');
    await header.waitFor();
    const text = await header.innerText(), cut = await header.evaluate(el => el.scrollWidth - el.clientWidth), overflow = await horizontalOverflow();
    assert.equal(text, expected); assert.ok(cut <= 1, `header text is not cut (${cut}px)`); assert.ok(overflow <= 1, `no horizontal panel overflow (${overflow}px)`);
    return { text, cut, overflow };
  });
  for (const size of [[844, 390], [390, 844]]) await check(`F03 C4 ${size.join('x')} compact header shows the selected price`, async () => {
    await open(size, 'goods');
    const press = loc => size[0] < 500 ? loc.tap() : loc.click(), header = yard('.cshop .pane h3 small').first(), rows = [];
    const pistol = await itemTarget('merchant', await uidOf('pistol')), box = await pistol.item.boundingBox(), before = await raw();
    assert.equal(await header.innerText(), '按包购买');
    const expectHeader = async (grid, uid, text) => {
      await yard(`[data-grid="${grid}"] [data-uid="${uid}"].sel`).waitFor();
      const shown = await header.innerText(), cut = await header.evaluate(el => el.scrollWidth - el.clientWidth), overflow = await horizontalOverflow();
      assert.equal(shown, text); assert.ok(cut <= 1, `header text is not cut (${cut}px)`); assert.ok(overflow <= 1, `no horizontal panel overflow (${overflow}px)`);
      rows.push({ uid, shown, cut, overflow });
    };
    await press(pistol.item); await expectHeader('merchant', pistol.uid, '手枪 · 买入 ¥ 320');
    assert.deepEqual(await pistol.item.boundingBox(), box, 'selecting the pistol does not move it before a second tap');
    await shot(`F03-C4-${size.join('x')}-buy`);
    await press(yard('[data-act="mode:sell"]'));
    await press(yard('[data-grid="stash"] [data-uid="st-watch"]')); await expectHeader('stash', 'st-watch', '怀表 · 卖出 ¥ 240');
    await shot(`F03-C4-${size.join('x')}-sell`);
    await press(yard('[data-grid="stash"] [data-uid="st-relief"]')); await expectHeader('stash', 'st-relief', '9mm · 不可出售');
    assert.equal(await raw(), before, 'selection never writes the save');
    return { rows };
  });
  // A quick move keeps the uid but the selection still names the old pane: neither header may turn into that item's price.
  for (const size of [[844, 390], [390, 844]]) await check(`F03 C4 ${size.join('x')} compact headers keep totals after a quick move`, async () => {
    await open(size, 'goods');
    const touch = size[0] < 500, before = await raw(), rows = [];
    const headers = () => page.evaluate(() => [...document.querySelector('#station-yard').shadowRoot.querySelectorAll('.cshop .pane h3 small')].map(e => e.textContent));
    await (touch ? yard('[data-act="mode:sell"]').tap() : yard('[data-act="mode:sell"]').click());
    for (const [from, to, total] of [['stash', 'sell', '¥ 240'], ['sell', 'stash', '¥ 0']]) {
      const target = await itemTarget(from, 'st-watch');
      if (touch) await doubleTap(target); else await target.item.dblclick();
      await yard(`[data-grid="${to}"] [data-uid="st-watch"]`).waitFor();
      const shown = await headers(), sell = await page.evaluate(() => window.__station.host.ui.shop.view().sell.items.map(i => i.uid));
      assert.deepEqual(sell, to === 'sell' ? ['st-watch'] : [], `${from} -> ${to} moved the watch`);
      rows.push({ from, to, shown, expected: ['整组出售 · 背包与安全箱 1 件需先入库', total] });
      if (to === 'sell') await shot(`F03-C4-${size.join('x')}-quick-sell`);
    }
    // Both directions are compared at once so a failure shows every header that went wrong.
    assert.deepEqual(rows.map(r => r.shown), rows.map(r => r.expected), 'quick moves keep the stash note and the sell total');
    assert.equal(await raw(), before, 'quick moves only change the cart, never the save');
    return { rows };
  });
  assert.deepEqual(filter.problems(report.checks.length), [], '--only: every prefix must match a check and at least one check must run');
} finally { try { await throttleSession?.detach(); } finally { await context?.close(); await browser.close(); } }
