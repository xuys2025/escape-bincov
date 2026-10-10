import { placeAt } from './inventory-actions.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { throughYard } from './yard-entry.mjs';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report = { startedAt: new Date().toISOString(), browser: browser.version(), steps: [], errors: [], externalRequests: [], methodology: 'Storage-failure injection and inventory/position fixtures with real UI buttons, downloads, file import and a real three-second E hold. Not a natural-play difficulty test.' };
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
context.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const state = () => page.evaluate(() => ({ save: window.__bincov.app.save, state: window.__bincov.app.state, pending: window.__bincov.app.pendingSettlement, overlay: window.__bincov.app.overlay }));
async function failStorage(on, terminalOnly = false) {
  await page.evaluate(({on, terminalOnly}) => {
    window.__realStorageWrite ??= Storage.prototype.setItem;
    Storage.prototype.setItem = on ? function (key, value) {
      if (key === 'escape-bincov.session.v2' && (!terminalOnly || !JSON.parse(value).profile.activeRun)) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return window.__realStorageWrite.call(this, key, value);
    } : window.__realStorageWrite;
  }, {on, terminalOnly});
}
async function step(name, work) {
  const item = { name, status: 'running' }; report.steps.push(item);
  try { await work(); assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); item.status = 'passed'; console.log('PASS', name); }
  catch (error) { item.status = 'failed'; item.error = error.stack; throw error; }
}
let backupPath;
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
  await action('enter').click();
  await step('failed purchase preserves cash and inventory; retry commits once', async () => {
    await action('tab', 'arms').click();
    const before = (await state()).save;
    await placeAt(page, 'merchant', 'ammo9', 'buy');
    await failStorage(true); await action('checkout').click();
    assert.deepEqual((await state()).save, before);
    await failStorage(false); await action('checkout').click();
    assert.equal((await state()).save.cash, before.cash - 84);
  });
  await step('all three quest buttons and storage upgrade commit and survive reload', async () => {
    await page.evaluate(() => {
      const { app, persist } = window.__bincov;
      app.save.cash = 2000;
      [['scrap', 3], ['wire', 2], ['fuse', 1], ['sample', 1], ['ledger', 1]].forEach(([id, qty], i) => app.save.stash.items.push({ id, qty, uid: 'quest-fixture-' + i, x: i, y: 2 }));
      persist();
    });
    await action('tab', 'quests').click();
    for (const id of ['repair', 'sample', 'ledger']) await action('quest', id).click();
    await action('tab', 'home').click();
    await action('upgrade').click();
    const saved = (await state()).save;
    assert.deepEqual(saved.quests, { repair: true, sample: true, ledger: true });
    assert.equal(saved.cash, 2000 + 420 + 650 + 800 - 600);
    assert.equal(saved.stash.h, 9);
    await page.reload(); await action('enter').click();
    assert.deepEqual((await state()).save, saved);
  });
  await step('native backup download, failed import rollback and confirmed import', async () => {
    await action('tab', 'home').click();
    const expected = (await state()).save;
    const downloadPromise = page.waitForEvent('download'); await action('export-save').click();
    const download = await downloadPromise;
    backupPath = resolve(out, 'save-roundtrip.json'); await download.saveAs(backupPath);
    const exported = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(exported.format, 'escape-bincov-recovery-backup'); assert.equal(exported.formatVersion, 4);
    assert.equal(exported.record.expansion.version, 2); assert.deepEqual(exported.record.profile, expected);
    await page.evaluate(() => { window.__bincov.app.save.cash = 123; window.__bincov.persist(); });
    await page.locator('#backup-file').setInputFiles(backupPath);
    await action('confirm-import').waitFor(); await failStorage(true); await action('confirm-import').click();
    assert.equal((await state()).save.cash, 123);
    await failStorage(false); await action('confirm-import').click();
    assert.deepEqual((await state()).save, expected);
    assert.equal((await state()).state, 'menu'); await action('enter').click();
    await page.screenshot({ path: resolve(out, 'save-home.png') });
  });
  await step('failed deployment stays in the hideout with equipment and run count intact', async () => {
    await action('tab', 'gear').click(); await page.locator('#seed').fill('42');
    const before = (await state()).save;
    await failStorage(true); await action('deploy').click();
    assert.equal((await state()).state, 'hideout');
    assert.deepEqual((await state()).save, before);
    assert.equal(await page.evaluate(() => window.__bincov.app.loadout), null);
    assert.equal(await page.evaluate(() => window.__bincov.app.game.scene.isActive('Raid')), false);
    await failStorage(false);
  });
  await step('failed safe transfer rolls back live containers', async () => {
    await action('tab', 'gear').click(); await page.locator('#seed').fill('42'); await action('deploy').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
    await page.evaluate(() => window.__bincov.app.raid.enemies.forEach(e => e.cooldown = 9999));
    await page.keyboard.press('Tab');
    const item = page.locator('[data-source="bag"][aria-label^="密封绷带"]');
    await item.click();
    const before = await page.evaluate(() => window.__bincov.app.loadout);
    await failStorage(true); await action('secure').click();
    assert.deepEqual(await page.evaluate(() => window.__bincov.app.loadout), before);
    await failStorage(false); await action('retry-checkpoint').click(); await action('close').click();
  });
  await step('real extraction freezes on failed save; backup contains the collected sample', async () => {
    await page.evaluate(() => {
      const raid = window.__bincov.app.raid, sample = raid.loot.find(l => l.id === 'sample');
      raid.player.setPosition(sample.sprite.x, sample.sprite.y);
    });
    await page.waitForTimeout(600); await page.keyboard.press('e', { delay: 100 });
    await page.waitForFunction(() => window.__bincov.app.loadout.bag.items.some(i => i.id === 'sample'));
    await page.evaluate(() => { const r = window.__bincov.app.raid; r.player.setPosition(r.config.exits[0].x, r.config.exits[0].y); });
    await page.waitForTimeout(600); await failStorage(true, true);
    await page.keyboard.down('e');
    try { await page.getByRole('heading', { name: '结算尚未保存' }).waitFor(); } finally { await page.keyboard.up('e'); }
    const pending = await state(); assert.equal(pending.state, 'run'); assert.equal(pending.pending.lastResult.outcome, 'extract');
    await page.keyboard.press('Escape'); await page.keyboard.press('m');
    assert.equal((await state()).overlay, 'save-error');
    const elapsed = await page.evaluate(() => window.__bincov.app.raid.elapsed);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.__bincov.app.raid.elapsed), elapsed);
    const downloadPromise = page.waitForEvent('download'); await action('export-save').click();
    backupPath = resolve(out, 'pending-settlement-backup.json'); await (await downloadPromise).saveAs(backupPath);
    const envelope = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(envelope.formatVersion, 4); assert.equal(envelope.record.expansion.base.location, 'settlement');
    const backup = envelope.record.profile;
    assert.equal(backup.activeRun, null); assert.ok(backup.bag.items.some(i => i.id === 'sample'));
    await page.screenshot({ path: resolve(out, 'save-failure.png') });
  });
  await step('retry saves once; refresh retains extraction and loot', async () => {
    await failStorage(false); await action('retry-save').click();
    await action('return').waitFor();
    const saved = (await state()).save;
    assert.equal(saved.stats.extracts, 1); assert.equal(saved.stats.runs, 1);
    await page.reload(); await action('enter').click();
    assert.deepEqual((await state()).save, saved);
    assert.ok(saved.bag.items.some(i => i.id === 'sample'));
  });
  await step('pending backup migrates to an HTTPS origin and survives same-origin path updates', async () => {
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
    try {
      const p = await fresh.newPage();
      // Reserved .test domain: serve the exact release HTML in-browser, no public server.
      const html = await readFile(resolve('dist/index.html'), 'utf8');
      await fresh.route('https://bincov.test/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
      await p.goto('https://bincov.test/index.html');
      assert.equal(await p.evaluate(() => '__bincov' in window), false);
      await p.locator('[data-action="enter"]').click(); await throughYard(p); await p.locator('[data-action="tab"][data-id="home"]').click();
      await p.locator('#backup-file').setInputFiles(backupPath); await p.locator('[data-action="confirm-import"]').click();
      const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2')).profile);
      assert.equal(saved.stats.extracts, 1); assert.ok(saved.bag.items.some(i => i.id === 'sample'));
      await p.goto('https://bincov.test/updated/index.html');
      assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2')).profile), saved);
    } finally { await fresh.close(); }
  });
  await step('a real cross-window storage event protects a pending settlement and its backup', async () => {
    const shared = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, acceptDownloads: true });
    try {
      const html = await readFile(resolve('dist/index.html'), 'utf8');
      // Both pages share a browser origin; all responses are fulfilled locally.
      await shared.route('https://bincov.test/**', route => route.fulfill({
        status: 200, contentType: 'text/html; charset=utf-8',
        body: new URL(route.request().url()).pathname === '/writer' ? '<!doctype html><title>Storage peer</title>' : html,
      }));
      const p = await shared.newPage();
      p.on('pageerror', error => report.errors.push(error.message));
      p.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
      await p.goto('https://bincov.test/game?test=1&entry=tabs');
      await p.locator('[data-action="enter"]').click();
      await p.locator('[data-action="deploy"]').click();
      await p.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      await p.keyboard.press('Escape');
      await p.evaluate(() => {
        window.__realStorageWrite = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'escape-bincov.session.v2' && !JSON.parse(value).profile.activeRun) throw new DOMException('Injected quota failure', 'QuotaExceededError');
          return window.__realStorageWrite.call(this, key, value);
        };
      });
      await p.locator('[data-action="abandon"]').click();
      await p.locator('[data-action="confirm-abandon"]').click();
      await p.getByRole('heading', { name: '结算尚未保存' }).waitFor();
      const pending = await p.evaluate(() => window.__bincov.app.pendingSettlement);
      assert.ok(pending);
      const latest = await p.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2')));
      latest.profile = structuredClone(pending); latest.profile.cash += 111; latest.raid = null; latest.revision++; latest.terminal = null;
      const peer = await shared.newPage();
      await peer.goto('https://bincov.test/writer');
      await peer.evaluate(save => localStorage.setItem('escape-bincov.session.v2', JSON.stringify(save)), latest);
      await p.waitForFunction(() => window.__bincov.app.conflict && !window.__bincov.app.storageOK);
      await p.evaluate(() => { Storage.prototype.setItem = window.__realStorageWrite; });
      assert.equal(await p.locator('[data-action="retry-save"]').isDisabled(), true);
      assert.equal(await p.evaluate(() => window.__bincov.persist()), false);
      assert.deepEqual(await p.evaluate(() => window.__bincov.app.pendingSettlement), pending);
      assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2'))), latest);
      const downloadPromise = p.waitForEvent('download');
      await p.locator('[data-action="export-save"]').click();
      const file = resolve(out, 'conflict-settlement-backup.json');
      await (await downloadPromise).saveAs(file);
      const backup = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(backup.formatVersion, 4); assert.deepEqual(backup.record.profile, pending);
    } finally { await shared.close(); }
  });
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; await page.screenshot({ path: resolve(out, 'save-regression-failure.png') }).catch(() => {}); }
finally { await context.close(); await browser.close(); report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'save-browser-report.json'), JSON.stringify(report, null, 2)); }
