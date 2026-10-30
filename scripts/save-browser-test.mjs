import { placeAt } from './inventory-actions.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { throughYard } from './yard-entry.mjs';
import { browserOptions } from './browser-options.mjs';
import { raidReady, frames, drive, panel, waitPanel, stand } from './raid-view.mjs';
import { failSessionWritesOnClick, restoreSessionWrites } from './storage-fault.mjs';

const out = resolve('test-results');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const report = { startedAt: new Date().toISOString(), browser: browser.version(), steps: [], errors: [], externalRequests: [], methodology: 'Storage-failure injection and inventory/position fixtures with real UI buttons, downloads, file import and a real three-second E hold. Raids run on the 2.5D view; positions and enemy readiness use the explicit ?test=1 driver. Not a natural-play difficulty test.' };
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
/**
 * On a slow runner (CI's software GL) the first frames after a mount can be more than 2 s apart, and the Runtime then
 * stall-pauses the raid ("画面暂时停顿…"), as it would for a player; keys then do nothing. Where a step needs the raid
 * running, resume it through the pause panel, as a player would, and wait until it has stayed running for a few frames.
 */
async function running(p) {
  for (let i = 0; i < 5; i++) {
    const now = await p.evaluate(() => ({ panel: window.__bincovSample.host.panel, phase: window.__bincovSample.host.lastBatch.frame.phase }));
    if (now.phase === 'running' && now.panel === null) {
      await frames(p, 3);
      if (await p.evaluate(() => window.__bincovSample.host.lastBatch.frame.phase === 'running')) return;
      continue;
    }
    assert.equal(now.panel, 'pause', `the raid waits on ${now.panel}`);
    // Only the Runtime's own stall pause is resumed here; any other pause is a failure of the step.
    assert.ok(await p.evaluate(() => { const h = window.__bincovSample.host, seen = h.__stallSeen ?? 0, stalls = h.eventLog.filter(e => e.type === 'notice' && /^画面暂时停顿/.test(e.detail?.text ?? '') && e.seq > seen); if (!stalls.length) return false; h.__stallSeen = Math.max(...stalls.map(e => e.seq)); return true; }), 'the raid paused without the Runtime\'s stall notice');
    report.stallResumes = (report.stallResumes ?? 0) + 1; console.log('STALL: resumed a stall pause');
    await p.locator('.coast-sample [data-do="resume"]').click();
    await p.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'running', null, { timeout: 30000 });
  }
  throw new Error('the raid did not stay running');
}
async function step(name, work) {
  const item = { name, status: 'running' }; report.steps.push(item);
  try { await work(); assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); item.status = 'passed'; console.log('PASS', name); }
  catch (error) { item.status = 'failed'; item.error = error.stack; throw error; }
}
let backupPath, beforeRaidStats;
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
      app.save.stats.runs = 6; app.save.stats.extracts = 6; // Eligible progress; this case checks durable turn-in and reload.
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
    assert.equal(saved.stash.h, 12);
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
    assert.equal(exported.format, 'escape-bincov-recovery-backup'); assert.equal(exported.formatVersion, 9);
    assert.equal(exported.record.expansion.version, 3); assert.deepEqual(exported.record.profile, expected);
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
    assert.equal(await page.evaluate(() => !!window.__bincov.app.coastSample || !!document.querySelector('.coast-sample')), false, 'no raid view started');
    await failStorage(false);
  });
  await step('failed safe transfer rolls back live containers', async () => {
    beforeRaidStats = (await state()).save.stats;
    await action('tab', 'gear').click(); await page.locator('#seed').fill('42'); await action('deploy').click();
    await raidReady(page); await drive(page, 'freezeAI', true); await running(page);
    const item = page.locator('.coast-sample [data-panel] [data-source="bag"][aria-label^="密封绷带"]');
    let before;
    for (let attempt = 0; ; attempt++) {
      await page.keyboard.press('Tab'); await waitPanel(page, 'inventory');
      await item.click();
      before = await page.evaluate(() => window.__bincov.app.loadout);
      // Bag to safe through the panel's quick transfer; a failed write restores both containers and shows the save dialog.
      // The fault arms on the click itself, so a periodic checkpoint just before it cannot take the failure instead.
      await failSessionWritesOnClick(page, '.coast-sample [data-do="inv-quick"]');
      try { await page.locator('.coast-sample [data-do="inv-quick"]').click({ timeout: 10000 }); break; }
      catch (error) {
        // A stall pause on a slow runner closed the panel before the tap (nothing was written): resume and open it again.
        if (attempt >= 2 || await panel(page) !== 'pause' || await page.evaluate(() => window.__failedSessionWrites) > 0) throw error;
        await running(page);
      }
    }
    await waitPanel(page, 'pause'); await page.locator('.coast-sample [data-do="retry-save"]').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__bincov.app.loadout), before);
    await restoreSessionWrites(page); await page.locator('.coast-sample [data-do="retry-save"]').click(); await waitPanel(page, null);
  });
  await step('real extraction freezes on failed save; backup contains the collected sample', async () => {
    // The guaranteed sample lies on the street, with no container in reach to take the E press instead.
    const sample = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.loot.find(l => l.item === 'sample'));
    assert.ok(sample, 'the run placed its sample on the street');
    await stand(page, { x: sample.x, y: sample.y }); await running(page);
    await page.keyboard.press('e', { delay: 100 });
    await page.waitForFunction(() => window.__bincov.app.loadout.bag.items.some(i => i.id === 'sample'));
    const exit = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.exits[0].at);
    await stand(page, exit); await running(page); await failStorage(true, true);
    await page.keyboard.down('e');
    try {
      await page.waitForFunction(() => document.querySelector('.coast-sample [data-ending-title]')?.textContent === '撤离成功 · 正在保存结算'
        && !!document.querySelector('.coast-sample [data-do="retry-settlement"]'), null, { timeout: 30000 });
    } finally { await page.keyboard.up('e'); }
    const pending = await state(); assert.equal(pending.state, 'run'); assert.equal(pending.pending.lastResult.outcome, 'extract');
    // Neither Esc nor M hides an unsaved settlement, and the world stays stopped.
    await page.keyboard.press('Escape'); await page.keyboard.press('m'); await frames(page, 3);
    assert.equal(await panel(page), 'ending');
    const elapsed = await page.evaluate(() => window.__bincovSample.host.lastBatch.stamp.simulationTime);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.__bincovSample.host.lastBatch.stamp.simulationTime), elapsed);
    const downloadPromise = page.waitForEvent('download'); await page.locator('.coast-sample [data-do="backup"]').click();
    backupPath = resolve(out, 'pending-settlement-backup.json'); await (await downloadPromise).saveAs(backupPath);
    const envelope = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(envelope.formatVersion, 9); assert.equal(envelope.record.expansion.base.location, 'settlement');
    const backup = envelope.record.profile;
    assert.equal(backup.activeRun, null); assert.ok(backup.bag.items.some(i => i.id === 'sample'));
    await page.screenshot({ path: resolve(out, 'save-failure.png') });
  });
  await step('retry saves once; refresh retains extraction and loot', async () => {
    await failStorage(false); await page.locator('.coast-sample [data-do="retry-settlement"]').click();
    await action('return').waitFor({ timeout: 30000 });
    const saved = (await state()).save;
    assert.equal(saved.stats.extracts, beforeRaidStats.extracts + 1); assert.equal(saved.stats.runs, beforeRaidStats.runs + 1);
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
      assert.equal(saved.stats.extracts, beforeRaidStats.extracts + 1); assert.ok(saved.bag.items.some(i => i.id === 'sample'));
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
      await raidReady(p); await running(p);
      await p.keyboard.press('Escape'); await waitPanel(p, 'pause');
      await p.evaluate(() => {
        window.__realStorageWrite = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'escape-bincov.session.v2' && !JSON.parse(value).profile.activeRun) throw new DOMException('Injected quota failure', 'QuotaExceededError');
          return window.__realStorageWrite.call(this, key, value);
        };
      });
      await p.locator('.coast-sample [data-do="abandon"]').click();
      await p.locator('.coast-sample [data-do="abandon-yes"]').click();
      await p.waitForFunction(() => document.querySelector('.coast-sample [data-ending-title]')?.textContent === '已放弃行动 · 正在保存结算'
        && !!document.querySelector('.coast-sample [data-do="retry-settlement"]'), null, { timeout: 30000 });
      const pending = await p.evaluate(() => window.__bincov.app.pendingSettlement);
      assert.ok(pending);
      const latest = await p.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2')));
      latest.profile = structuredClone(pending); latest.profile.cash += 111; latest.raid = null; latest.revision++; latest.terminal = null;
      const peer = await shared.newPage();
      await peer.goto('https://bincov.test/writer');
      await peer.evaluate(save => localStorage.setItem('escape-bincov.session.v2', JSON.stringify(save)), latest);
      await p.waitForFunction(() => window.__bincov.app.conflict && !window.__bincov.app.storageOK);
      await p.evaluate(() => { Storage.prototype.setItem = window.__realStorageWrite; });
      // The newer record from the other window must not be overwritten: no retry is offered, only the backup.
      await p.waitForFunction(() => !document.querySelector('.coast-sample [data-do="retry-settlement"]'));
      assert.equal(await p.locator('.coast-sample [data-ending-row] [data-do="backup"]').count(), 1);
      assert.equal(await p.evaluate(() => window.__bincovSample.host.services.settlement().retryable), false);
      assert.equal(await p.evaluate(() => window.__bincov.persist()), false);
      assert.deepEqual(await p.evaluate(() => window.__bincov.app.pendingSettlement), pending);
      assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2'))), latest);
      const downloadPromise = p.waitForEvent('download');
      await p.locator('.coast-sample [data-do="backup"]').click();
      const file = resolve(out, 'conflict-settlement-backup.json');
      await (await downloadPromise).saveAs(file);
      const backup = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(backup.formatVersion, 9); assert.deepEqual(backup.record.profile, pending);
    } finally { await shared.close(); }
  });
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    for (const mode of ['tabs', 'yard', 'checkpoint', 'terminal']) await step(`durable publication failure stops ${mode} at ${viewport.width}`, async () => {
      const fresh = await browser.newContext({ viewport, offline: true, acceptDownloads: true });
      fresh.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
      try {
        const p = await fresh.newPage(); p.setDefaultTimeout(30000);
        p.on('pageerror', error => report.errors.push(error.message));
        p.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
        p.on('dialog', dialog => dialog.accept());
        await p.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
        await p.locator('[data-action="enter"]').click();
        if (mode === 'yard') {
          await p.locator('[data-action="base-enter"]').click();
          await p.waitForFunction(() => !!document.querySelector('#station-yard')?.shadowRoot?.querySelector('[data-alarm]'));
        } else if (mode === 'checkpoint' || mode === 'terminal') {
          await p.locator('[data-action="deploy"]').click(); await raidReady(p);
          await p.evaluate(() => window.__bincovSample.host.runtime.pause()); await waitPanel(p, 'pause');
          if (mode === 'terminal') await p.locator('.coast-sample [data-do="abandon"]').click();
        }
        // Bounded injection: the native setItem really succeeds; only the next publication clone throws once.
        // All production entry points and download/reload controls remain unchanged; hooks require ?test=1.
        await p.evaluate(() => {
          const write = Storage.prototype.setItem, clone = window.structuredClone;
          window.__publicationWrites = 0; let armed = false, fired = false;
          Storage.prototype.setItem = function(key, value) {
            write.call(this, key, value);
            if (key === 'escape-bincov.session.v2') { window.__publicationWrites++; armed = !fired; }
          };
          window.structuredClone = function(value, options) {
            if (armed) { armed = false; fired = true; window.structuredClone = clone; throw new Error('Injected publication failure'); }
            return clone(value, options);
          };
        });
        if (mode === 'terminal') await p.locator('.coast-sample [data-do="abandon-yes"]').click();
        else await p.evaluate(mode => {
          const { saveSession, hideoutRuntime, setOverlay } = window.__bincov;
          if (mode === 'checkpoint') window.__bincovSample.host.services.checkpoint();
          else if (mode === 'yard') hideoutRuntime.setVolume(.31);
          else { saveSession.setVolume(.31); setOverlay(''); }
        }, mode);
        await p.waitForFunction(() => window.__bincov.app.storageFailure === 'publish');
        const root = mode === 'yard' ? p.locator('#station-yard') : mode === 'tabs' ? p.locator('#ui .overlay') : p.locator('.coast-sample');
        await root.getByText(/进度已保存|结算已保存/).filter({ visible: true }).first().waitFor();
        assert.equal(await root.getByRole('button', { name: '重试保存', exact: true }).count(), 0);
        const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2')));
        const attempts = await p.evaluate(() => {
          const { saveSession, hideoutRuntime } = window.__bincov;
          return [saveSession.persist(), saveSession.retrySettlement(), hideoutRuntime.retrySave().ok,
            window.__bincovSample?.host.services.retrySave() ?? false];
        });
        assert.deepEqual(attempts, [false, false, false, false]);
        assert.equal(await p.evaluate(() => window.__publicationWrites), 1);
        assert.deepEqual(await p.evaluate(() => window.__bincov.saveSession.backupRecord()), stored);
        await root.getByRole('button', { name: '刷新页面', exact: true }).waitFor();
        if (mode === 'yard') await root.locator('.dialog').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
        await p.screenshot({ path: resolve(out, `publication-${mode}-${viewport.width}.png`) });
        const download = p.waitForEvent('download');
        await root.getByRole('button', { name: mode === 'yard' ? '导出存档' : '导出备份', exact: true }).click();
        const file = resolve(out, `publication-${mode}-${viewport.width}.json`);
        await (await download).saveAs(file);
        assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).record, stored);
        await root.getByRole('button', { name: '刷新页面', exact: true }).click();
        await p.waitForFunction(() => !!window.__bincov && window.__bincov.app.storageOK);
        assert.deepEqual(await p.evaluate(() => window.__bincov.app.save), stored.profile);
      } finally { await fresh.close(); }
    });
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; await page.screenshot({ path: resolve(out, 'save-regression-failure.png') }).catch(() => {}); }
finally { await context.close(); await browser.close(); report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'save-browser-report.json'), JSON.stringify(report, null, 2)); }
