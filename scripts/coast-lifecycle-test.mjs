// Ordinary packaged entry: inject browser resource faults; no product test hooks.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { decodeSession } from '../src/recovery-store.ts';
const out = resolve(process.env.BINCOV_LIFECYCLE_OUT || 'test-results/coast-lifecycle');
await mkdir(out, { recursive: true });
const report = { at: new Date().toISOString(), checks: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const key = 'escape-bincov.session.v2';
async function open() {
  const ctx = await browser.newContext({ viewport: process.env.BINCOV_LIFECYCLE_WIDE ? { width: 1920, height: 1080 } : { width: 1280, height: 720 }, offline: true });
  ctx.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  const p = await ctx.newPage(); p.setDefaultTimeout(6000);
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => {
    window.__life = { fault: '', contexts: [], writes: [] };
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args) {
      const result = get.apply(this, args);
      if (result && /webgl/.test(args[0]) && !window.__life.contexts.some(x => x.canvas === this))
        window.__life.contexts.push({ canvas: this, gl: result });
      return result;
    };
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value) {
      if (window.__life.fault === 'asset' && value.startsWith('data:image/png')) {
        window.__life.fault = ''; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return;
      }
      src.set.call(this, value);
    } });
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(...args) {
      if (window.__life.fault === 'view' && document.querySelector('.coast-sample canvas')) {
        window.__life.fault = ''; throw Error('injected view texture failure');
      }
      return draw.apply(this, args);
    };
    const observe = ResizeObserver.prototype.observe;
    ResizeObserver.prototype.observe = function(target, ...args) {
      if (window.__life.fault === 'observer' && target.matches('.coast-sample')) {
        window.__life.fault = ''; throw Error('injected mount observer failure');
      }
      return observe.call(this, target, ...args);
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (k === 'escape-bincov.session.v2') {
        if (window.__life.fault === 'save') { window.__life.writes.push('QuotaExceededError'); throw new DOMException('injected write failure', 'QuotaExceededError'); }
        window.__life.writes.push('written');
      }
      return set.call(this, k, v);
    };
  });
  await p.goto(pathToFileURL(resolve('dist/index.html')).href + '?sample=village');
  await p.locator('[data-action="enter"]').click();
  await p.locator('#seed').fill('42');
  return { ctx, p, errors };
}
const bytes = p => p.evaluate(k => localStorage.getItem(k), key);
async function check(name, fn) {
  const s = { name }; report.checks.push(s);
  try { Object.assign(s, await fn()); s.status = 'passed'; }
  catch (e) { s.status = 'failed'; s.failure = e.stack; process.exitCode = 1; }
  console.log(s.status, name, s.failure?.split('\n')[0] || '');
  await writeFile(resolve(out, 'lifecycle.json'), JSON.stringify(report, null, 2) + '\n');
}
try {
  for (const fault of ['asset', 'view', 'observer']) await check(`startup-${fault}-cleanup-and-retry`, async () => {
    const { ctx, p, errors } = await open();
    try {
      await p.evaluate(f => { window.__life.fault = f; }, fault);
      await p.locator('[data-action="deploy"]').click();
      await p.waitForSelector('[data-action="enter"]');
      const saved = await bytes(p); decodeSession(saved);
      const roots = await p.locator('.coast-sample').count();
      report.checks.at(-1).beforeRetry = { roots, errors: [...errors] };
      await p.locator('[data-action="enter"]').click();
      await p.waitForSelector('.coast-sample [data-do="resume"]');
      assert.equal(await p.locator('.coast-sample').count(), 1);
      assert.equal(roots, 0);
      assert.equal(JSON.parse(await bytes(p)).expansion.raid.runId, JSON.parse(saved).expansion.raid.runId);
      assert.equal(errors.filter(e => /already has a Runtime/.test(e)).length, 0);
      return { rootsAfterFailure: roots, sameRunResumed: true, expectedErrors: errors };
    } finally { report.checks.at(-1).errors = errors; await ctx.close(); }
  });
  await check('ordinary-context-loss-native-restore-and-settlement', async () => {
    const { ctx, p, errors } = await open();
    try {
      await p.locator('[data-action="deploy"]').click();
      await p.waitForSelector('.coast-sample canvas'); await p.waitForTimeout(600);
      assert.deepEqual(await p.evaluate(() => [typeof window.__bincov, typeof window.__bincovSample]), ['undefined', 'undefined']);
      await p.evaluate(() => {
        const c = window.__life.contexts.find(x => x.canvas.closest('.coast-sample'));
        window.__life.live = c;
        window.__life.loss = c.gl.getExtension('WEBGL_lose_context'); window.__life.loss.loseContext();
      });
      await p.waitForSelector('.coast-sample [data-panel]:not([hidden])'); await p.waitForTimeout(150);
      const paused = await bytes(p); decodeSession(paused);
      await p.keyboard.press('Escape');
      await p.evaluate(() => document.querySelector('[data-do="resume"]')?.click());
      await p.waitForTimeout(2300);
      assert.ok((await bytes(p)) === paused, 'context loss must keep the world and saved time frozen');
      await p.evaluate(() => window.__life.loss.restoreContext());
      await p.waitForFunction(() => !window.__life.live.gl.isContextLost()); await p.waitForTimeout(200);
      assert.equal(await p.evaluate(() => window.__life.live.canvas === document.querySelector('.coast-sample canvas')), true, 'same canvas restored');
      await p.screenshot({ path: resolve(out, 'context-restored-paused.png') });
      assert.ok(await p.locator('[data-do="resume"]').isVisible());
      await p.locator('[data-do="resume"]').click(); await p.waitForTimeout(2300);
      const resumed = decodeSession(await bytes(p));
      assert.ok(resumed.expansion.raid.elapsed > JSON.parse(paused).expansion.raid.elapsed);
      await p.keyboard.press('Escape');
      const beforeEnd = await bytes(p);
      await p.evaluate(() => { window.__life.fault = 'save'; });
      await p.locator('[data-do="abandon"]').click(); await p.locator('[data-do="abandon-yes"]').click();
      await p.waitForSelector('[data-do="retry-settlement"]');
      assert.equal(await bytes(p), beforeEnd);
      assert.equal(await p.locator('.coast-sample').count(), 1);
      await p.evaluate(() => { window.__life.fault = ''; });
      await p.locator('[data-do="retry-settlement"]').click();
      await p.waitForSelector('[data-action="return"]');
      assert.equal(await p.locator('.coast-sample').count(), 0);
      const terminal = decodeSession(await bytes(p)); assert.equal(terminal.profile.activeRun, null);
      await p.locator('[data-action="return"]').click();
      await p.locator('[data-action="deploy"]').click(); await p.waitForSelector('.coast-sample canvas');
      assert.deepEqual(errors, []);
      return { hooksAbsent: true, lostFrozen: true, nativeRestored: true, failedSettlementRetained: true, nextRaidMounted: true };
    } finally { report.checks.at(-1).errors = errors; await ctx.close(); }
  });
} finally { await browser.close(); }
assert.deepEqual(report.requests, []);
