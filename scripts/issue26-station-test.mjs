/** #26 inventory feedback: production HTML, real station UI and durable session; explicit fixtures require ?test=1. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { reportFilter, stepFilter } from './step-filter.mjs';
import * as D from '../src/domain.ts';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
const out = resolve(option('out', 'test-results/issue26/station')), filter = stepFilter();
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), startedAt: new Date().toISOString(),
  methodology: 'Packaged HTML offline; real pointer/touch input, Runtime, SaveSession and localStorage. Explicit inventory fixtures use the session transaction with ?test=1. Storage faults override only the main session write. Date is fixed so background checkpoint writes cannot consume the fault. Narrow viewports emulate touch, not real devices.', steps: [], errors: [], external: [], screenshots: [] };
let context, page, mobile;
const yard = s => page.locator(`#station-yard ${s}`);
const tap = el => mobile ? el.tap() : el.click();
const snapshot = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const writeCount = () => page.evaluate(() => window.__issue26Writes.length);
const ready = () => page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
const shot = async name => { await page.screenshot({ path: resolve(out, `${name}.png`) }); report.screenshots.push(`${name}.png`); };
function fixture() {
  const p = D.newSave(); p.stash = D.createInventory(10, 6); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2);
  p.cash = 700; p.equipment = { weapon: null, weaponUid: null, gun: null, ammo: 0, ammoRelief: 0, relief: false }; return p;
}
function add(inv, id, qty = 1) { assert.equal(D.addItem(inv, id, qty), 0, `fixture ${id}`); return inv.items.at(-1); }
function totals(p) {
  const counts = {};
  for (const inv of [p.bag, p.stash]) for (const item of inv.items) {
    const key = `${item.id}:${!!item.relief}`; counts[key] = (counts[key] ?? 0) + item.qty;
  }
  return counts;
}
function full(inv) {
  for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++) inv.items.push({ uid: `full-${x}-${y}`, id: 'watch', qty: 1, x, y, rotated: false });
}
async function seed(p) {
  await page.evaluate(async p => {
    await window.__station.reseed(() => {
      const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => {
        for (const key of ['cash', 'stash', 'bag', 'safe', 'equipment', 'upgraded']) d.profile[key] = structuredClone(p[key]);
      });
      if (s.commitExpansionMutation(t) !== 'committed') throw Error('fixture did not commit');
    });
  }, p);
  await ready();
}
async function open(p = fixture(), size = [1280, 720]) {
  await context?.close(); mobile = size[0] < 900;
  context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  await context.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  await context.addInitScript(() => {
    // Only checkpoint wall time is fixed. Playwright's full clock also replaces Event.timeStamp with
    // handler time, which would hide whether a real queued double click survives a slow render frame.
    const checkpointTime = Date.now(); Date.now = () => checkpointTime;
    window.__issue26Writes = []; window.__issue26Rejected = 0;
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      const result = write.call(this, k, v);
      if (k === 'escape-bincov.session.v2') window.__issue26Writes.push(JSON.parse(v).revision);
      return result;
    };
  });
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(String(e.stack)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto('https://station.test/?test=1'); await tap(page.locator('[data-action="enter"]')); await ready(); await seed(p); await gear();
  const cpu = Number(option('cpu-rate', '1'));
  if (cpu > 1) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
}
async function gear() {
  const btn = yard('[data-quick="gear"]'); if (!await btn.isVisible()) await tap(yard('[data-quickmenu]'));
  await tap(btn); await yard('[data-grid="bag"]').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelector('#station-yard').shadowRoot.querySelector('.panel').getAnimations()].map(a => a.finished.catch(() => {})));
  });
}
async function readable(selector) {
  const el = yard(selector); await el.scrollIntoViewIfNeeded();
  const r = await el.boundingBox(), size = page.viewportSize();
  assert.ok(r && r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.x + r.width <= size.width + 1 && r.y + r.height <= size.height + 1, `${selector} outside viewport`);
  assert.equal(await el.evaluate(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1), false, `${selector} clipped`);
}
async function reachableGrid(source) {
  const grid = yard(`[data-grid="${source}"]`), items = grid.locator('.item[data-uid]');
  // Compact inventories intentionally scroll. Check actual items at both ends of the fixture, including
  // the final warehouse row, rather than require the entire grid to fit in a short viewport at once.
  for (const item of [items.first(), items.last()]) {
    await item.scrollIntoViewIfNeeded();
    const r = await item.boundingBox(), size = page.viewportSize();
    assert.ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= size.width && r.y + r.height <= size.height, `${source} item outside viewport`);
    assert.ok(await item.evaluate(el => {
      const r = el.getBoundingClientRect(), root = el.getRootNode();
      return [[r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]].every(([x, y]) =>
        root.elementsFromPoint(x, y).some(hit => hit === el || el.contains(hit)));
    }), `${source} item is clipped or covered`);
  }
}
async function select(src, uid) {
  // A deliberate single selection must not become a second click of the preceding quick transfer.
  await page.waitForTimeout(350); await tap(yard(`[data-grid="${src}"] [data-uid="${uid}"]`));
}
async function dbl(src, uid) {
  await page.evaluate(() => {
    window.__issue26PointerTrace = [];
    if (window.__issue26TraceInstalled) return;
    window.__issue26TraceInstalled = true;
    window.addEventListener('pointerup', e => {
      const item = e.composedPath().find(el => el?.dataset?.uid);
      window.__issue26PointerTrace.push({ stamp: e.timeStamp, handled: performance.now(), trusted: e.isTrusted, uid: item?.dataset.uid, x: e.clientX, y: e.clientY });
    }, true);
  });
  const el = yard(`[data-grid="${src}"] [data-uid="${uid}"]`); await el.scrollIntoViewIfNeeded();
  // Delayed mouse commands wait for each renderer acknowledgement, so slow frames can turn
  // the requested double click into two singles (>320 ms). Queue the native double-click input together.
  const r = await el.boundingBox(); assert.ok(r); await page.mouse.dblclick(r.x + 8, r.y + 8);
  report.steps.at(-1).doubleClicks ??= [];
  const trace = await page.evaluate(() => window.__issue26PointerTrace);
  report.steps.at(-1).doubleClicks.push(trace);
  assert.equal(trace.length, 2, 'two native releases must reach the inventory');
  assert.ok(trace.every(e => e.trusted && e.uid === uid), 'both clicks target the same actual item');
  assert.ok(trace[1].stamp - trace[0].stamp < 320, 'test input must be a double click within the unchanged 320 ms window');
}
async function drag(src, uid, to, x, y) {
  const el = yard(`[data-grid="${src}"] [data-uid="${uid}"]`), target = yard(`[data-grid="${to}"]`);
  const a = await el.boundingBox(), b = await target.boundingBox(), cell = Number(await target.getAttribute('data-cell')); assert.ok(a && b);
  await page.mouse.move(a.x + 8, a.y + 8); await page.mouse.down(); await page.mouse.move(a.x + 24, a.y + 20);
  await page.mouse.move(b.x + x * cell + 8, b.y + y * cell + 8, { steps: 8 });
  assert.equal(await target.locator('.preview.good').isVisible(), true, 'valid exchange must show valid placement'); await page.mouse.up();
}
/** Press on an item and move past the drag threshold; the drag stays under way (no release). */
async function hold(src, uid) {
  const a = await yard(`[data-grid="${src}"] [data-uid="${uid}"]`).boundingBox(); assert.ok(a);
  await page.evaluate(() => addEventListener('pointerdown', e => { window.__issue26Pointer = e.pointerId; }, { capture: true, once: true }));
  await page.mouse.move(a.x + 8, a.y + 8); await page.mouse.down(); await page.mouse.move(a.x + 30, a.y + 20, { steps: 4 });
  assert.equal(await page.evaluate(() => window.__station.host.ui.dragging), true, 'drag under way');
}
/** Release the held button over the bag (a real mouse up). */
async function release() { const b = await yard('[data-grid="bag"]').boundingBox(); await page.mouse.move(b.x + 10, b.y + 10); await page.mouse.up(); }
const IDLE = { dragging: false, ghosts: 0, lifted: 0, rootDragging: false, previews: 0 };
const dragState = () => page.evaluate(() => {
  const ui = document.querySelector('#station-yard').shadowRoot.querySelector('.ui');
  return { dragging: window.__station.host.ui.dragging, ghosts: ui.querySelectorAll('.ghost').length, lifted: ui.querySelectorAll('.lifted').length,
    rootDragging: ui.classList.contains('dragging'), previews: ui.querySelectorAll('.grid .preview:not([hidden])').length };
});
async function fault(on) {
  await page.evaluate(on => {
    window.__issue26Write ??= Storage.prototype.setItem;
    Storage.prototype.setItem = on ? function(k, v) { if (k === 'escape-bincov.session.v2') { window.__issue26Rejected++; throw new DOMException('issue26 quota fixture', 'QuotaExceededError'); } return window.__issue26Write.call(this, k, v); } : window.__issue26Write;
  }, on);
}
async function recover() {
  await fault(false); await tap(yard('.dialog [data-act="retry-save"]'));
  await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().storage.ok && !window.__station.host.ui.dialogKind);
}
async function step(name, fn) {
  if (!filter.selects(name)) return;
  const row = { name }, errorStart = report.errors.length; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors.slice(errorStart), []); assert.deepEqual(report.external, []);
    assert.deepEqual(await page.evaluate(() => window.__station?.host?.errors ?? []), []); row.status = 'passed'; console.log('PASS', name);
  } catch (e) { row.status = 'failed'; row.error = String(e.stack); await shot(`failure-${report.steps.length}`).catch(() => {}); console.log('FAIL', name, e.message); }
}
try {
  await step('F01-existing-mouse-double-click-roundtrip', async () => {
    const p = fixture(), gun = add(p.stash, 'pistol'); await open(p); const writes = await writeCount();
    await dbl('stash', gun.uid); let after = (await snapshot()).profile; assert.equal(D.count(after.bag, 'pistol'), 1); assert.equal(after.stash.items.length, 0); assert.equal(await writeCount(), writes + 1);
    await dbl('bag', after.bag.items[0].uid); after = (await snapshot()).profile; assert.equal(D.count(after.stash, 'pistol'), 1); assert.equal(after.bag.items.length, 0); assert.equal(await writeCount(), writes + 2);
    assert.deepEqual(JSON.parse(await raw()).profile.stash, after.stash);
    await page.reload(); await tap(page.locator('[data-action="enter"]')); await ready();
    assert.deepEqual((await snapshot()).profile.stash, after.stash); return { committedTransfers: 2, countBefore: totals(p), countAfter: totals(after) };
  });
  await step('F01-full-bag-keeps-item-and-shows-reason', async () => {
    const p = fixture(), gun = add(p.stash, 'pistol'); full(p.bag); await open(p); const before = await raw();
    await dbl('stash', gun.uid); assert.deepEqual((await snapshot()).profile.stash, p.stash); assert.deepEqual((await snapshot()).profile.bag, p.bag); assert.equal(await raw(), before);
    assert.match(await yard('.toasts').innerText(), /空间|放不下/);
  });
  await step('F01-queued-double-click-survives-busy-frame', async () => {
    const p = fixture(), gun = add(p.stash, 'pistol'); await open(p); const writes = await writeCount();
    await page.evaluate(uid => {
      // Run after GridDrag's first release handler. The second physical click is already queued,
      // but cannot be handled until this simulated long frame finishes.
      const busy = e => {
        if (!e.composedPath().some(el => el?.dataset?.uid === uid)) return;
        window.removeEventListener('pointerup', busy);
        const until = performance.now() + 400; while (performance.now() < until) { /* simulated long frame */ }
      };
      window.addEventListener('pointerup', busy);
    }, gun.uid);
    await dbl('stash', gun.uid);
    const after = (await snapshot()).profile;
    assert.equal(D.count(after.bag, 'pistol'), 1); assert.equal(after.stash.items.length, 0);
    assert.equal(await writeCount(), writes + 1); assert.deepEqual(JSON.parse(await raw()).profile.bag, after.bag);
  });
  await step('F01-double-click-storage-failure-rolls-back', async () => {
    const p = fixture(), gun = add(p.stash, 'pistol'); await open(p); const before = await raw(); await fault(true); await dbl('stash', gun.uid);
    await yard('.dialog [data-act="retry-save"]').waitFor(); assert.equal(await raw(), before); assert.deepEqual((await snapshot()).profile.stash, p.stash); assert.deepEqual((await snapshot()).profile.bag, p.bag);
    assert.ok(await page.evaluate(() => window.__issue26Rejected > 0));
    await recover(); const writes = await writeCount(); await dbl('stash', gun.uid); assert.equal(D.count((await snapshot()).profile.bag, 'pistol'), 1); assert.equal(await writeCount(), writes + 1);
  });
  for (const failWrite of [false, true]) await step(`F02-real-drag-swap-${failWrite ? 'storage-rollback' : 'persistent'}`, async () => {
    const p = fixture(), a = add(p.stash, 'watch'), b = add(p.bag, 'fuse'); await open(p); const before = await raw();
    if (failWrite) await fault(true); const writes = await writeCount();
    await drag('stash', a.uid, 'bag', b.x, b.y);
    if (failWrite) {
      await yard('.dialog [data-act="retry-save"]').waitFor(); assert.equal(await raw(), before); assert.deepEqual((await snapshot()).profile.stash, p.stash); assert.deepEqual((await snapshot()).profile.bag, p.bag); assert.equal(await writeCount(), writes);
      await recover(); await drag('stash', a.uid, 'bag', b.x, b.y);
    } else assert.equal(await writeCount(), writes + 1);
    const after = (await snapshot()).profile;
    assert.equal(after.bag.items.find(i => i.uid === a.uid)?.id, 'watch'); assert.equal(after.stash.items.find(i => i.uid === b.uid)?.id, 'fuse');
    assert.deepEqual(totals(after), totals(p)); assert.deepEqual(JSON.parse(await raw()).profile.stash, after.stash); assert.deepEqual(JSON.parse(await raw()).profile.bag, after.bag);
  });
  await step('F02-storage-dialog-mid-drag-ends-the-drag', async () => {
    const p = fixture(), a = add(p.stash, 'watch'); await open(p); const before = await raw();
    await hold('stash', a.uid);
    // The yard's own five-second checkpoint fails mid-drag (wall time moves on) and opens the storage dialog.
    await fault(true); await page.evaluate(() => { const t = Date.now() + 6000; Date.now = () => t; });
    await yard('.dialog [data-act="retry-save"]').waitFor(); await release();
    assert.deepEqual(await dragState(), IDLE, 'released under the dialog: no ghost, lifted item or dragging state');
    assert.equal(await raw(), before); assert.deepEqual((await snapshot()).profile.stash, p.stash); assert.deepEqual((await snapshot()).profile.bag, p.bag);
    await recover(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => window.__station.host.ui.kind), null, 'after the retry Tab closes 整备 again');
    await gear(); await drag('stash', a.uid, 'bag', 0, 0);
    assert.equal((await snapshot()).profile.bag.items.find(i => i.uid === a.uid)?.id, 'watch'); assert.deepEqual(await dragState(), IDLE);
  });
  await step('F02-focus-loss-hidden-page-or-lost-release-cancels-the-drag', async () => {
    const p = fixture(), a = add(p.stash, 'watch'); await open(p);
    const ends = {
      blur: () => page.evaluate(() => dispatchEvent(new Event('blur'))),
      hidden: () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))),
      // The button went up outside the window: the next move reports no button and no release came before it.
      lostRelease: () => page.evaluate(() => dispatchEvent(new PointerEvent('pointermove', { pointerId: window.__issue26Pointer, pointerType: 'mouse', buttons: 0, clientX: 4, clientY: 4 }))),
    };
    for (const [name, end] of Object.entries(ends)) {
      await hold('stash', a.uid); await end();
      assert.deepEqual(await dragState(), IDLE, `${name}: the drag ends at once`);
      await end(); assert.deepEqual(await dragState(), IDLE, `${name}: a second cancel changes nothing`);
      await release(); assert.deepEqual(await dragState(), IDLE, `${name}: the later release drops nothing`);
      // Focus loss writes the yard's checkpoint (main.ts), so the stored inventories are compared, not the bytes.
      const stored = JSON.parse(await raw()).profile, now = (await snapshot()).profile;
      assert.deepEqual([now.stash, now.bag, stored.stash, stored.bag], [p.stash, p.bag, p.stash, p.bag], `${name}: nothing moved`);
    }
    await drag('stash', a.uid, 'bag', 0, 0);
    assert.equal((await snapshot()).profile.bag.items.find(i => i.uid === a.uid)?.id, 'watch'); assert.deepEqual(await dragState(), IDLE);
  });
  for (const size of [[1280, 720], [1920, 1080], [390, 844], [844, 390]]) {
    await step(`F05-F09-F10-visible-and-persistent-${size.join('x')}`, async () => {
      const p = fixture(), gun = add(p.bag, 'pistol'); add(p.bag, 'bandage', 3); add(p.safe, 'food', 1);
      add(p.stash, 'bandage', 2); const cloth = add(p.stash, 'cloth', 2); cloth.x = 8; cloth.y = 5;
      await open(p, size); await readable('[data-act="stash-all"]'); await readable('[data-act="sort-stash"]'); await shot(`gear-${size.join('x')}`);
      await reachableGrid('bag'); await reachableGrid('stash');
      assert.equal(await yard('.panel .pbody').evaluate(e => e.scrollWidth > e.clientWidth + 2), false, 'inventory panel must not clip horizontally');
      await select('bag', gun.uid); assert.equal(await yard('[data-act="equip"]').innerText(), '装备主武器'); await readable('[data-act="equip"]'); await shot(`equip-${size.join('x')}`);
      await tap(yard('[data-act="equip"]')); assert.equal((await snapshot()).profile.equipment.weapon, 'pistol'); assert.match(await yard('.toasts').innerText(), /已装备主武器/);
      const before = (await snapshot()).profile;
      await tap(yard('[data-act="stash-all"]')); const stocked = (await snapshot()).profile;
      assert.equal(stocked.bag.items.length, 0); assert.deepEqual(totals(stocked), totals(before)); assert.deepEqual(stocked.equipment, before.equipment); assert.deepEqual(stocked.safe, before.safe);
      assert.equal(await yard('[data-act="stash-all"]').isDisabled(), true);
      await tap(yard('[data-act="sort-stash"]')); const sorted = (await snapshot()).profile;
      assert.deepEqual(totals(sorted), totals(before)); assert.deepEqual(sorted.safe, before.safe); assert.deepEqual(sorted.equipment, before.equipment);
      assert.notDeepEqual(sorted.stash.items, stocked.stash.items); assert.deepEqual(JSON.parse(await raw()).profile.stash, sorted.stash);
      await page.reload(); await tap(page.locator('[data-action="enter"]')); await ready(); assert.deepEqual((await snapshot()).profile.stash, sorted.stash);
    });
  }
  await step('F05-safe-gun-explains-return-and-keeps-equip-selection', async () => {
    const p = fixture(), gun = add(p.safe, 'pistol'); await open(p, [390, 844]); await tap(yard('[data-act="pane:safe"]')); await select('safe', gun.uid);
    assert.equal(await yard('[data-act="equip"]').count(), 0); await readable('.equip-note'); assert.match(await yard('.equip-note').innerText(), /先移回背包/);
    await tap(yard('[data-act="secure"]')); assert.equal(D.count((await snapshot()).profile.bag, 'pistol'), 1); assert.equal((await snapshot()).profile.equipment.weapon, null);
    assert.equal(await yard('[data-act="equip"]').innerText(), '装备主武器'); await tap(yard('[data-act="equip"]')); assert.equal((await snapshot()).profile.equipment.weapon, 'pistol');
  });
  await step('F05-old-weapon-return-space-explained', async () => {
    const p = fixture(); full(p.bag); p.bag.items = p.bag.items.filter(i => i.y !== 0 || i.x > 1); const gun = add(p.bag, 'pistol');
    p.equipment = { weapon: 'carbine', weaponUid: 'fixture-carbine', gun: { parts: [], devices: { laser: false, light: false } }, ammo: 2, ammoRelief: 0, relief: false }; await open(p); const before = await raw();
    await select('bag', gun.uid); await tap(yard('[data-act="equip"]'));
    assert.deepEqual((await snapshot()).profile.bag, p.bag); assert.deepEqual((await snapshot()).profile.equipment, p.equipment); assert.equal(await raw(), before);
    assert.match(await yard('.toasts').innerText(), /空间|放不下/); assert.equal(await yard('[data-act="equip"]').count(), 1);
  });
  await step('F05-equip-storage-failure-keeps-selection-for-retry', async () => {
    const p = fixture(), gun = add(p.stash, 'pistol'); await open(p); const before = await raw(); await select('stash', gun.uid); await fault(true);
    await tap(yard('[data-act="equip"]')); await yard('.dialog [data-act="retry-save"]').waitFor();
    assert.equal(await raw(), before); assert.deepEqual((await snapshot()).profile.stash, p.stash); assert.equal((await snapshot()).profile.equipment.weapon, null);
    assert.doesNotMatch(await yard('.toasts').innerText(), /已装备主武器/);
    await recover(); await tap(yard('[data-act="equip"]')); assert.equal((await snapshot()).profile.equipment.weapon, 'pistol'); assert.match(await yard('.toasts').innerText(), /已装备主武器/);
  });
  await step('F09-full-stash-rejects-whole-batch', async () => {
    const p = fixture(); full(p.stash); add(p.bag, 'pistol'); add(p.bag, 'bandage', 2); await open(p); const before = await raw();
    await tap(yard('[data-act="stash-all"]')); assert.deepEqual((await snapshot()).profile.bag, p.bag); assert.deepEqual((await snapshot()).profile.stash, p.stash); assert.equal(await raw(), before);
    assert.match(await yard('.toasts').innerText(), /空间|放不下/); await shot('full-stash-refusal');
  });
  for (const action of ['stash-all', 'sort-stash']) await step(`F09-F10-${action}-storage-failure-rolls-back`, async () => {
    const p = fixture(); add(p.bag, 'bandage', 3); const gun = add(p.stash, 'pistol'); gun.x = 8; gun.y = 4; await open(p); const before = await raw(); await fault(true);
    await tap(yard(`[data-act="${action}"]`)); await yard('.dialog [data-act="retry-save"]').waitFor(); assert.equal(await raw(), before); assert.deepEqual((await snapshot()).profile.bag, p.bag); assert.deepEqual((await snapshot()).profile.stash, p.stash);
    await recover(); await tap(yard(`[data-act="${action}"]`)); const after = (await snapshot()).profile; assert.deepEqual(totals(after), totals(p)); assert.notDeepEqual(after.stash, p.stash);
    assert.deepEqual(JSON.parse(await raw()).profile.stash, after.stash);
  });
} finally {
  await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.steps.filter(s => s.status === 'passed').length, total: report.steps.length };
  const filterProblems = reportFilter(filter, report.steps.length); if (filterProblems.length) report.summary.filterProblems = filterProblems;
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summary));
  if (report.summary.passed !== report.summary.total || report.errors.length || report.external.length) process.exitCode = 1;
}
