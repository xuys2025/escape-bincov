/** Offline release HTML; only explicit test hooks prepare inventories and inject write failure. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = resolve(option('out', 'test-results/station-relief')), html = await readFile(option('html', 'dist/index.html'), 'utf8');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(),
  methodology: 'Real offline release, Runtime and SaveSession. Fixtures run at the menu; fixed clock isolates inventory writes. Mouse clicks use original UI. No real-device claim.', steps: [], errors: [], external: [] };
let context, page;
async function open(size = [1280, 720], tabs = false) {
  await context?.close(); context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, offline: true });
  await context.route('https://relief.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://relief.test/')) report.external.push(r.url()); });
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => report.errors.push(String(e.stack)));
  await page.clock.setFixedTime(new Date());
  await page.goto(`https://relief.test/?test=1${tabs ? '&entry=tabs' : ''}`);
  await page.waitForFunction(() => window.__bincov?.hideoutRuntime);
  await page.evaluate(() => {
    const { app, saveSession: s, hideoutRuntime: r } = window.__bincov;
    if (!s.ensureRpg()) throw Error('fixture upgrade');
    const ticket = s.prepareExpansionMutation(d => {
      d.profile.cash = 0; d.profile.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
      for (const key of ['bag', 'stash', 'safe']) d.profile[key].items = [];
      delete d.profile.reliefSupplies;
    });
    if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('fixture commit');
    r.snapshot(); if (app.state !== 'menu') throw Error('fixture must remain at menu');
  });
}
const profile = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot().profile);
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const kit = p => ({ weapon: p.equipment.weapon, relief: p.equipment.relief,
  ammo: p.bag.items.filter(i => i.id === 'ammo9').reduce((n, i) => n + i.qty, 0),
  bandage: p.bag.items.filter(i => i.id === 'bandage').reduce((n, i) => n + i.qty, 0) });
const expected = { weapon: 'pistol', relief: true, ammo: 12, bandage: 1 };
async function shot(name) { await page.screenshot({ path: resolve(out, `${name}.png`) }); }
async function step(name, fn) {
  const row = { name, status: 'running' }; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); row.status = 'passed'; console.log('PASS', name); }
  catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; await shot(`fail-${report.steps.length}`).catch(() => {}); console.log('FAIL', name, e.message); }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
try {
  await step('R1 Runtime entry grants once before any renderer exists', async () => {
    await open(); const result = await page.evaluate(() => window.__bincov.hideoutRuntime.enter()); assert.ok(result.ok);
    assert.equal(await page.locator('#station-yard').count(), 0); assert.deepEqual(kit(await profile()), expected);
    const saved = await raw(); assert.ok(await page.evaluate(() => window.__bincov.hideoutRuntime.enter().ok)); assert.equal(await raw(), saved);
    assert.deepEqual(kit(JSON.parse(saved).profile), expected); return { result, kit: expected };
  });
  for (const size of [[1280, 720], [1920, 1080]]) await step(`R2 ${size.join('x')} title enters yard with saved kit; view remount cannot issue relief`, async () => {
    await open(size); await page.locator('[data-action="enter"]').click(); await page.waitForFunction(() => window.__station?.mounted);
    assert.deepEqual(kit(await profile()), expected); await shot(`entry-${size.join('x')}`);
    await page.evaluate(async () => {
      await window.__station.reseed(() => {
        const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => {
          d.profile.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 }; d.profile.bag.items = [];
        });
        if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('view-only fixture');
      });
      await window.__station.remount(1);
    });
    assert.deepEqual(kit(await profile()), { weapon: null, relief: false, ammo: 0, bandage: 0 });
    assert.ok(await page.evaluate(() => window.__bincov.hideoutRuntime.enter().ok)); assert.deepEqual(kit(await profile()), expected);
    return { size, entry: expected, viewOnlyRemount: 'no relief writes' };
  });
  await step('R3 failed entry stays at menu with original bytes; refresh and retry grant once', async () => {
    await open(); const before = await raw(), p = await profile();
    await page.evaluate(() => { const write = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) {
      if (k === 'escape-bincov.session.v2') throw new DOMException('relief write fixture', 'QuotaExceededError'); return write.call(this, k, v);
    }; });
    await page.locator('[data-action="enter"]').click();
    await page.waitForFunction(() => !window.__bincov.app.storageOK);
    assert.equal(await page.evaluate(() => window.__bincov.app.state), 'menu'); assert.equal(await page.locator('#station-yard').count(), 0);
    assert.equal(await raw(), before); assert.deepEqual(await profile(), p);
    await page.locator('[data-action="refresh"]').waitFor({ state: 'visible' }); await shot('entry-write-failed');
    await page.locator('[data-action="refresh"]').click(); await page.locator('[data-action="enter"]').click();
    await page.waitForFunction(() => window.__station?.mounted); assert.deepEqual(kit(await profile()), expected);
    await page.reload(); await page.locator('[data-action="enter"]').click(); await page.waitForFunction(() => window.__station?.mounted);
    assert.deepEqual(kit(await profile()), expected); return { preserved: true, reloads: 2, kit: expected };
  });
  await step('R4 legacy tab entry still grants the same kit and explicit claim cannot duplicate it', async () => {
    await open(undefined, true); await page.locator('[data-action="enter"]').click();
    assert.deepEqual(kit(await profile()), expected); const saved = await raw();
    assert.equal(await page.evaluate(() => window.__bincov.hideoutRuntime.claimRelief().ok), false); assert.equal(await raw(), saved);
    return { kit: expected, explicitDuplicateRefused: true };
  });
  await step('R5 antidote no-effect message uses the canonical item name', async () => {
    await open(); await page.locator('[data-action="enter"]').click(); await page.waitForFunction(() => window.__station?.mounted);
    await page.evaluate(async () => window.__station.reseed(() => {
      const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => {
        d.profile.bag.items = [{ uid: 'relief-test-antidote', id: 'antidote', qty: 1, x: 0, y: 0 }]; d.expansion.body.pollution = 0;
      }); if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('supply fixture');
    }));
    await page.locator('#station-yard [data-quick="gear"]').click();
    await page.locator('#station-yard [data-grid="bag"] [data-uid="relief-test-antidote"]').click();
    await page.locator('#station-yard [data-act="use"]').click();
    const toast = page.locator('#station-yard .toast').last(); await toast.waitFor();
    assert.equal(await toast.textContent(), '当前没有污染，使用除藻药剂没有效果。');
    await toast.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
    assert.equal((await profile()).bag.items[0].qty, 1); await shot('antidote-name'); return { message: await toast.textContent() };
  });
} finally { await context?.close(); await browser.close(); }
