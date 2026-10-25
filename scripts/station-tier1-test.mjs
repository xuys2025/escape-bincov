/** PR34: offline production HTML, real session and UI; save fixtures/faults require ?test=1. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { skipOpening, throughYard } from './yard-entry.mjs';
import * as D from '../src/domain.ts';
/** The legacy key only ever held profiles up to v2: the same profile without gun fields (save v6 added them). */
const legacyProfile = s => { const p = structuredClone(s); p.version = 2; delete p.equipment.weaponUid; delete p.equipment.gun; for (const inv of [p.stash, p.bag, p.safe]) for (const i of inv.items) delete i.gun; return p; };

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const cpuRate = Number(option('cpu-rate', '1'));
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1 && cpuRate <= 20, 'cpu-rate must be between 1 and 20');
const out = resolve(option('out', 'test-results/tier1/browser'));
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), startedAt: new Date().toISOString(),
  methodology: 'Packaged HTML routed offline. Real localStorage/SaveSession and mouse/touch UI. Legacy runs=7 and charm inventory are explicit fixtures; quota is injected. Only quota transaction cases fix Date so the unrelated five-second checkpoint cannot consume the fault; timers, animation and real UI keep running. Narrow screens emulate touch, not real devices. No mock Runtime or renderer.', cpuRate, steps: [], errors: [], external: [], screenshots: [] };
let context, page, mobileInput = false;
const yard = selector => page.locator(`#station-yard ${selector}`);
const snapshot = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const ready = () => page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
const shot = async name => { await page.screenshot({ path: resolve(out, `${name}.png`) }); report.screenshots.push(`${name}.png`); };
const tap = async locator => { if (mobileInput) await locator.tap(); else await locator.click(); };
async function open({ size = [1280, 720], legacy, test = true, mobile = false, fixedTime = false } = {}) {
  await context?.close();
  context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
  mobileInput = mobile;
  await context.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
  if (legacy) await context.addInitScript(s => { if (!localStorage.getItem('escape-bincov.session.v2')) localStorage.setItem('escape-bincov.save.v1', s); }, JSON.stringify(legacyProfile(legacy)));
  page = await context.newPage(); page.setDefaultTimeout(15000);
  if (fixedTime) await page.clock.setFixedTime(new Date());
  if (cpuRate > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  page.on('pageerror', e => report.errors.push(String(e.stack)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(`https://station.test/${test ? '?test=1' : ''}`);
  await tap(page.locator('[data-action="enter"]'));
  if (test) await ready(); else { await skipOpening(page); await yard('#hud-sub').waitFor(); }
}
async function panel(kind) {
  const current = await page.evaluate(() => window.__station.host.ui.kind);
  if (current === kind) return;
  if (current) await tap(yard('.panel [data-act="close"]'));
  const button = yard(`[data-quick="${kind}"]`);
  if (!await button.isVisible()) await tap(yard('[data-quickmenu]'));
  await tap(button);
  await page.waitForFunction(kind => window.__station.host.ui.kind === kind, kind);
  await settled();
}
async function settled() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const root = document.querySelector('#station-yard')?.shadowRoot;
    const animations = [...(root?.querySelectorAll('.panel:not([hidden]), .modal:not([hidden])') ?? [])]
      .flatMap(el => el.getAnimations()).filter(a => a.effect?.getTiming().iterations !== Infinity);
    await Promise.all(animations.map(a => a.finished.catch(() => {})));
  });
}
async function tabs() {
  if (await page.evaluate(() => window.__station.host.ui.kind)) await tap(yard('.panel [data-act="close"]'));
  await throughYard(page, { tap: mobileInput });
}
async function readable(selector) {
  await settled();
  // Check the current node atomically: the real five-second commit can replace panel contents while an element
  // handle is waiting to scroll. Poll only this read, not player actions, until the unchanged layout checks hold.
  const measurement = await page.waitForFunction(selector => {
    const el = selector.startsWith('#station-yard ')
      ? document.querySelector('#station-yard')?.shadowRoot?.querySelector(selector.slice('#station-yard '.length))
      : document.querySelector(selector);
    if (!el) return false;
    el.getBoundingClientRect(); // Flush layout before asking about newly started CSS animations.
    if (el.closest('.panel, .modal')?.getAnimations().some(a => a.playState === 'running' || a.pending)) return false;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect(), clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    const box = { x: r.x, y: r.y, width: r.width, height: r.height }, viewport = { width: innerWidth, height: innerHeight };
    const fits = r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    return el.isConnected && fits && !clipped ? { box, viewport, clipped } : false;
  }, selector, { timeout: 15000 });
  const { box, viewport, clipped } = await measurement.jsonValue(); await measurement.dispose();
  assert.ok(box.width > 0 && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'text must fit the viewport');
  assert.equal(clipped, false, 'text must not be clipped');
}
async function assertCounts(n) {
  assert.match(await yard('#hud-sub').innerText(), new RegExp(`^累计出击 ${n} 次 ·`));
  await panel('radio');
  assert.equal(await yard('.log > small').innerText(), `水产站值守记录 · 累计出击 ${n} 次`);
  await tabs();
  await tap(page.locator('[data-action="tab"][data-id="home"]'));
  assert.equal(await page.locator('.station-log .section-label').innerText(), `水产站值守记录 · 累计出击 ${n} 次`);
  assert.equal((await snapshot()).profile.stats.runs, n);
  await tap(page.locator('[data-action="base-enter"]').first()); await ready();
}
function charmFixture() {
  const p = D.newSave(); p.stash = D.createInventory(10, 6); p.bag = D.createInventory(6, 5);
  assert.equal(D.addItem(p.stash, 'luckyCharm'), 0); assert.equal(D.addItem(p.bag, 'unluckyCharm'), 0);
  return p;
}
async function seedCharms() {
  const fx = charmFixture();
  await page.evaluate(async fx => { await window.__station.reseed(() => {
    const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => { d.profile.stash = fx.stash; d.profile.bag = fx.bag; });
    if (s.commitExpansionMutation(t) !== 'committed') throw Error('fixture not committed');
  }); }, fx);
  await ready(); return fx;
}
async function equip(src, uid) {
  // Separate two single selections across a retry from the yard's 320ms quick-transfer double click.
  await page.waitForTimeout(350);
  await tap(yard(`[data-grid="${src}"] [data-uid="${uid}"]`));
  await tap(yard('[data-act="charm-equip"]'));
}
async function fault(on) {
  await page.evaluate(on => {
    window.__tier1Write ??= Storage.prototype.setItem;
    Storage.prototype.setItem = on ? function(k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('tier1 quota fixture', 'QuotaExceededError'); return window.__tier1Write.call(this, k, v); } : window.__tier1Write;
  }, on);
}
async function retry() {
  await fault(false); await tap(yard('.dialog [data-act="retry-save"]'));
  await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().storage.ok && !window.__station.host.ui.dialogKind);
}
function identityCount(s, uid) { return [s.profile.stash, s.profile.bag, s.profile.safe].flatMap(i => i.items).filter(i => i.uid === uid).length + (s.charm?.uid === uid ? 1 : 0); }
async function step(name, fn) {
  const row = { name }, errorStart = report.errors.length; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors.slice(errorStart), []); assert.deepEqual(report.external, []);
    if (page.url().includes('test=1')) assert.deepEqual(await page.evaluate(() => window.__station?.host?.errors ?? []), []);
    row.status = 'passed'; console.log('PASS', name);
  } catch (e) { row.status = 'failed'; row.error = String(e.stack); await shot(`failure-${report.steps.length}`).catch(() => {}); console.log('FAIL', name, e.message); }
}
try {
  await step('ordinary-new-save-zero', async () => {
    await open({ test: false }); await shot('ordinary-zero-1280');
    assert.equal(await page.evaluate(() => '__bincov' in window || '__station' in window), false);
    assert.equal(JSON.parse(await raw()).profile.stats.runs, 0);
    assert.match(await yard('#hud-sub').innerText(), /^累计出击 0 次 ·/); await readable('#station-yard #hud-sub');
  });
  for (const [w, h] of [[1280, 720], [1920, 1080], [390, 844]]) {
    await step(`legacy-seven-copy-${w}x${h}`, async () => {
      const legacy = D.newSave(); legacy.stats.runs = 7;
      await open({ size: [w, h], legacy, mobile: w === 390 });
      await readable('#station-yard #hud-sub'); await shot(`seven-hud-${w}`);
      await panel('radio'); await readable('#station-yard .log > small'); await shot(`seven-radio-${w}`);
      const radio = await yard('.log > small').innerText();
      await tabs(); await tap(page.locator('[data-action="tab"][data-id="home"]'));
      await readable('.station-log .section-label'); await shot(`seven-tabs-${w}`);
      assert.equal(radio, '水产站值守记录 · 累计出击 7 次');
      assert.equal(await page.locator('.station-log .section-label').innerText(), radio);
      assert.equal(JSON.parse(await raw()).legacyBackup, JSON.stringify(legacyProfile(legacy)));
      await tap(page.locator('[data-action="base-enter"]').first()); await ready(); await assertCounts(7);
      await page.reload(); await tap(page.locator('[data-action="enter"]')); await ready(); await assertCounts(7);
    });
    await step(`charm-snapshot-and-gear-${w}x${h}`, async () => {
      await open({ size: [w, h], mobile: w === 390 }); const fx = await seedCharms(); await panel('gear');
      assert.equal((await snapshot()).charm, null); assert.equal(await yard('.charm').count(), 0);
      const uid = fx.stash.items[0].uid; await equip('stash', uid);
      await readable('#station-yard .charm'); await shot(`charm-gear-${w}`);
      assert.equal((await snapshot()).charm.uid, uid); assert.match(await yard('.charm').innerText(), new RegExp(D.ITEMS.luckyCharm.name));
      await page.evaluate(() => { const s = window.__bincov.hideoutRuntime.snapshot(); s.charm.id = 'unluckyCharm'; s.charm.qty = 99; });
      assert.equal((await snapshot()).charm.id, 'luckyCharm'); assert.equal((await snapshot()).charm.qty, 1);
      await page.reload(); await tap(page.locator('[data-action="enter"]')); await ready(); await panel('gear');
      assert.equal((await snapshot()).charm.uid, uid); assert.match(await yard('.charm').innerText(), new RegExp(D.ITEMS.luckyCharm.name));
      await tap(yard('[data-act="charm-unequip"]')); assert.equal((await snapshot()).charm, null); assert.equal(identityCount(await snapshot(), uid), 1);
    });
  }
  await step('old-tabs-equip-and-unequip-refresh-yard', async () => {
    await open(); const fx = await seedCharms(), uid = fx.stash.items[0].uid; await tabs();
    await page.locator('[data-action="tab"][data-id="gear"]').click();
    await page.locator(`[data-grid="stash"] [data-uid="${uid}"]`).click();
    await page.locator('[data-action="charm-equip"]').click();
    assert.equal((await snapshot()).charm.uid, uid);
    await page.locator('[data-action="tab"][data-id="body"]').click();
    assert.match(await page.locator('.rpg-property').innerText(), new RegExp(D.ITEMS.luckyCharm.name)); await shot('old-tabs-charm');
    await page.locator('[data-action="base-enter"]').first().click(); await ready(); await panel('gear');
    assert.match(await yard('.charm').innerText(), new RegExp(D.ITEMS.luckyCharm.name));
    await tabs(); await page.locator('[data-action="tab"][data-id="body"]').click();
    await page.locator('[data-action="charm-unequip"]').click(); assert.equal((await snapshot()).charm, null);
    await page.locator('[data-action="base-enter"]').first().click(); await ready(); await panel('gear');
    assert.equal(await yard('.charm').count(), 0); assert.equal(identityCount(await snapshot(), uid), 1);
  });
  await step('quota-equip-replace-remove-preserve-inventory-and-retry-once', async () => {
    await open({ fixedTime: true }); const fx = await seedCharms(); await panel('gear');
    const lucky = fx.stash.items[0].uid, unlucky = fx.bag.items[0].uid;
    for (const [src, uid] of [['stash', lucky], ['bag', unlucky], [null, null]]) {
      const before = await snapshot(), bytes = await raw(); await fault(true);
      if (src) await equip(src, uid); else await tap(yard('[data-act="charm-unequip"]'));
      await yard('.dialog [data-act="retry-save"]').waitFor(); await shot(`quota-${src ?? 'remove'}`);
      const after = await snapshot(); assert.equal(await raw(), bytes); assert.deepEqual(after.charm, before.charm); assert.deepEqual(after.profile, before.profile);
      await retry(); assert.deepEqual((await snapshot()).charm, before.charm);
      if (src) await equip(src, uid); else await tap(yard('[data-act="charm-unequip"]'));
      assert.equal((await snapshot()).charm?.uid ?? null, uid);
      for (const id of [lucky, unlucky]) assert.equal(identityCount(await snapshot(), id), 1);
      if (src) assert.match(await yard('.charm').innerText(), new RegExp(D.ITEMS[(await snapshot()).charm.id].name));
      else assert.equal(await yard('.charm').count(), 0);
    }
  });
  await step('departure-failure-seven-success-eight-refresh-no-double-count', async () => {
    const legacy = D.newSave(); legacy.stats.runs = 7; await open({ legacy, fixedTime: true });
    const bytes = await raw(); await panel('deploy'); await fault(true); await tap(yard('[data-act="deploy"]'));
    await yard('.dialog [data-act="retry-save"]').waitFor(); assert.equal(await raw(), bytes);
    assert.equal((await snapshot()).profile.stats.runs, 7); assert.match(await yard('#hud-sub').innerText(), /^累计出击 7 次 ·/);
    await retry(); await assertCounts(7); await panel('deploy'); await tap(yard('[data-act="deploy"]'));
    const s = await snapshot(); assert.equal(s.profile.stats.runs, 8); const runId = s.profile.activeRun.runId;
    await page.reload(); await page.waitForFunction(() => window.__bincov);
    assert.equal((await snapshot()).profile.stats.runs, 8); assert.equal((await snapshot()).profile.activeRun.runId, runId);
  });
} finally {
  await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.steps.filter(s => s.status === 'passed').length, total: report.steps.length };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary)); if (report.summary.passed !== report.summary.total || report.errors.length || report.external.length) process.exitCode = 1;
}
