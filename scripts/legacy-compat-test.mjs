import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

// Supply an actual earlier release HTML; do not replace it with a hand-written old client.
if (!process.argv[2]) throw new Error('Usage: node scripts/legacy-compat-test.mjs <legacy-release.html>');
const legacyPath = resolve(process.argv[2]);
const [legacy, current] = await Promise.all([readFile(legacyPath, 'utf8'), readFile(resolve('dist/index.html'), 'utf8')]);
const report = {
  methodology: 'Two actual bundled builds on one locally fulfilled HTTPS origin, followed by a second current-build window. Fixture changes use each build’s own persistence function. No external server.',
  legacySha256: createHash('sha256').update(legacy).digest('hex'),
  currentSha256: createHash('sha256').update(current).digest('hex'),
  startedAt: new Date().toISOString(), steps: [], errors: [],
};
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
report.browser = browser.version();
await context.route('https://bincov-compat.test/**', route => route.fulfill({
  status: 200, contentType: 'text/html; charset=utf-8',
  body: new URL(route.request().url()).pathname.startsWith('/legacy') ? legacy : current,
}));
context.on('page', p => p.on('pageerror', error => report.errors.push(error.message)));
async function step(name, work) {
  const item = { name, status: 'running' }; report.steps.push(item);
  try { await work(); assert.deepEqual(report.errors, []); item.status = 'passed'; console.log('PASS', name); }
  catch (error) { item.status = 'failed'; item.error = error.stack; throw error; }
}
const oldPage = await context.newPage(), newPage = await context.newPage();
const currentRaw = p => p.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
let original, saved;
try {
  await step('actual v1 build migrates without altering its original bytes', async () => {
    await oldPage.goto('https://bincov-compat.test/legacy?test=1&entry=tabs');
    await oldPage.locator('[data-action="enter"]').click();
    await oldPage.evaluate(() => { window.__bincov.app.save.cash = 1842; assertPersist();
      function assertPersist() { if (!window.__bincov.persist()) throw new Error('Legacy fixture did not save'); }
    });
    original = await oldPage.evaluate(() => localStorage.getItem('escape-bincov.save.v1'));
    await newPage.goto('https://bincov-compat.test/current?test=1&entry=tabs');
    await newPage.locator('[data-action="enter"]').click();
    const migrated = JSON.parse(await currentRaw(newPage));
    assert.equal(migrated.profile.cash, 1842); assert.equal(migrated.legacyBackup, original);
    assert.equal(await newPage.evaluate(() => localStorage.getItem('escape-bincov.save.v1')), original);
  });
  await step('stale v1 writes stop the current window but cannot overwrite v2 progress', async () => {
    assert.equal(await newPage.evaluate(() => { window.__bincov.app.save.cash = 2842; return window.__bincov.persist(); }), true);
    saved = await currentRaw(newPage);
    assert.equal(await oldPage.evaluate(() => { window.__bincov.app.save.cash = 42; return window.__bincov.persist(); }), true);
    await newPage.waitForFunction(() => window.__bincov.app.conflict);
    assert.equal(await currentRaw(newPage), saved);
    assert.equal(await newPage.evaluate(() => window.__bincov.persist()), false);
    await oldPage.reload(); await oldPage.locator('[data-action="enter"]').click();
    assert.equal(await oldPage.evaluate(() => window.__bincov.app.save.cash), 42);
    assert.equal(await currentRaw(oldPage), saved);
    await newPage.reload(); await newPage.locator('[data-action="enter"]').click();
    assert.equal(await newPage.evaluate(() => window.__bincov.app.save.cash), 2842);
    assert.equal(JSON.parse(await currentRaw(newPage)).legacyBackup, original);
  });
  await step('a second new-build window cannot become a writer until ownership is released', async () => {
    saved = await currentRaw(newPage);
    const peer = await context.newPage();
    await peer.goto('https://bincov-compat.test/current-second?test=1&entry=tabs');
    await peer.waitForFunction(() => !!window.__bincov);
    assert.equal(await peer.evaluate(() => window.__bincov.app.storageOK), false);
    assert.equal(await peer.evaluate(() => window.__bincov.persist()), false);
    assert.equal(await currentRaw(peer), saved);
    await newPage.close(); await peer.reload();
    await peer.locator('[data-action="enter"]').click();
    assert.equal(await peer.evaluate(() => window.__bincov.app.storageOK), true);
    assert.equal(await peer.evaluate(() => window.__bincov.app.save.cash), 2842);
  });
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally {
  await context.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  await mkdir(resolve('test-results'), { recursive: true });
  await writeFile(resolve('test-results/legacy-compat-report.json'), JSON.stringify(report, null, 2));
}
