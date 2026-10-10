// Playtest launcher check without any test interface: open 城中村试玩.html, follow its redirect to the offline game with
// ?sample=village, enter the base, deploy with an empty seed and confirm the run starts inside the dressed village
// corner (the HUD never shows the outside-sample marker) on the Pixi sample host.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_LAUNCHER_OUT || 'test-results/coast-launcher'); await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), runs: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions);
try {
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
    context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
    const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(pathToFileURL(resolve('城中村试玩.html')).href);
    await page.waitForURL(/start%20the%20game\.html\?sample=village/);
    await page.locator('[data-action="enter"]').click();
    const world = await page.locator('#run-world').inputValue(), seed = await page.locator('#seed').inputValue();
    await page.locator('[data-action="deploy"]').click();
    await page.waitForSelector('.coast-sample canvas'); await page.waitForTimeout(1500);
    const run = await page.evaluate(() => ({ where: document.querySelector('.coast-sample [data-where]')?.textContent ?? '', hooks: typeof window.__bincov, sample: typeof window.__bincovSample }));
    if (i === 0) await page.screenshot({ path: resolve(out, 'launcher-deploy-1280x720.png') });
    report.runs.push({ url: page.url().replace(/^.*\//, ''), world, seed, ...run });
    assert.equal(world, 'buildings'); assert.equal(seed, ''); assert.equal(run.hooks, 'undefined'); assert.equal(run.sample, 'undefined');
    assert.ok(run.where.startsWith('沿海封锁区') && !run.where.includes('样板外'), run.where);
    await context.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []);
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(resolve(out, 'launcher.json'), JSON.stringify(report, null, 2));
}
console.log(`launcher: ${report.runs.length} fresh deploys, all inside the village corner`);
