// Village sample on the real Runtime: frame interval, Runtime advance and view present/submit, sampled per display
// frame for ~5 s with AI active and the player firing (local machine only; excludes GPU completion time).
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { cpus, totalmem, release } from 'node:os';
const out = resolve('test-results/coast-sample'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ ...browserOptions, args: [...browserOptions.args, '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true })).newPage();
await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs&sample=village');
await page.locator('[data-action="enter"]').click(); await page.locator('#seed').fill('42'); await page.locator('[data-action="deploy"]').click();
await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch);
await page.evaluate(() => window.__bincovSample.driver.placePlayer({ x: 640, y: 456 }, 0, 'coast'));
await page.evaluate(() => { const h = () => window.__bincovSample.host; window.__s = { gap: [], adv: [], pre: [] }; let last = performance.now();
  const f = () => { const n = performance.now(); window.__s.gap.push(n - last); last = n; window.__s.adv.push(h().stats.advanceMs); window.__s.pre.push(h().stats.presentMs); if (window.__s.gap.length < 800) requestAnimationFrame(f); }; requestAnimationFrame(f); });
await page.mouse.move(1000, 330);
const t0 = Date.now(); while (Date.now() - t0 < 5000) { await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(300); }
const s = await page.evaluate(() => window.__s);
const pct = (a, p) => { const b = a.slice(10).sort((x, y) => x - y); return +b[Math.floor((b.length - 1) * p)].toFixed(2); };
const stat = a => ({ p50: pct(a, .5), p95: pct(a, .95), p99: pct(a, .99) });
const counts = await page.evaluate(() => { window.gc?.(); return window.__bincovSample.counts(); });
const environment = await page.evaluate(() => {
  const canvas = document.querySelector('.coast-sample canvas'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return { userAgent: navigator.userAgent, dpr: devicePixelRatio, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null, memory: performance.memory?.usedJSHeapSize ?? null };
});
const report = { at: new Date().toISOString(), viewport: '1280x720 DPR1', note: 'Local desktop GPU; real Runtime with AI active; present excludes GPU completion; not a phone measurement.',
  environment: { node: process.version, platform: process.platform, osRelease: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length,
    ramBytes: totalmem(), browser: browser.version(), ...environment },
  frames: s.gap.length, seconds: +(s.gap.reduce((a, b) => a + b, 0) / 1000).toFixed(1), frameInterval: stat(s.gap), runtimeAdvance: stat(s.adv), viewPresent: stat(s.pre), counts };
await writeFile(resolve(out, 'measure.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
