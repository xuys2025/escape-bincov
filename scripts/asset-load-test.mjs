// Ordinary offline entry, fresh browser context per fault: no game test hooks or preloaded image cache.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { skipOpening } from './yard-entry.mjs';
const option = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/asset-load'));
await mkdir(out, { recursive: true });
const report = { sha256: createHash('sha256').update(html).digest('hex'), checks: [], external: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const key = 'escape-bincov.session.v2';
try {
  // Encoding preserves every source RGBA byte (the packer verifies this). Chrome premultiplies PNG and WebP
  // differently: require exact alpha/opaque pixels and at most one premultiplied colour step at translucent edges.
  const packed = JSON.parse(await readFile('assets/coast/packed/manifest.json', 'utf8'));
  const originals = JSON.parse(await readFile('assets/coast/manifest.json', 'utf8')).assets;
  const sheets = await Promise.all(packed.sheets.map(async s => [s.file, `data:image/webp;base64,${(await readFile(s.file)).toString('base64')}`]));
  const sources = await Promise.all(originals.map(async a => [a.id, `data:image/png;base64,${(await readFile(a.file)).toString('base64')}`]));
  const pixelPage = await browser.newPage();
  try {
    const pixels = await pixelPage.evaluate(async ({ packed, sheets, sources }) => {
      const load = url => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; });
      const decoded = new Map(await Promise.all(sheets.map(async ([key, url]) => [key, await load(url)])));
      const originals = new Map(sources); let frames = 0, pixels = 0, translucentRounding = 0, maxPremultipliedDifference = 0;
      for (const f of packed.frames) {
        const original = await load(originals.get(f.id));
        const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = f.w; a.height = b.height = f.h;
        a.getContext('2d').drawImage(original, 0, 0); b.getContext('2d').drawImage(decoded.get(f.sheet), f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        const old = a.getContext('2d').getImageData(0, 0, f.w, f.h).data, current = b.getContext('2d').getImageData(0, 0, f.w, f.h).data;
        if (original.naturalWidth !== f.w || original.naturalHeight !== f.h) throw new Error(`Packed dimensions differ: ${f.id}`);
        for (let i = 0; i < old.length; i += 4) {
          const alpha = old[i + 3]; if (alpha !== current[i + 3]) throw new Error(`Packed alpha differs: ${f.id}`);
          for (let channel = 0; channel < 3; channel++) {
            const difference = Math.abs(Math.round(old[i + channel] * alpha / 255) - Math.round(current[i + channel] * alpha / 255));
            maxPremultipliedDifference = Math.max(maxPremultipliedDifference, difference);
            if (difference > 1 || alpha === 255 && old[i + channel] !== current[i + channel]) throw new Error(`Packed colour differs: ${f.id}`);
            if (old[i + channel] !== current[i + channel]) translucentRounding++;
          }
        }
        frames++; pixels += f.w * f.h;
      }
      return { frames, pixels, translucentRounding, maxPremultipliedDifference };
    }, { packed, sheets, sources });
    assert.equal(pixels.frames, originals.length); report.pixels = pixels; console.log('passed lossless coast packing and bounded browser rounding', pixels);
  } finally { await pixelPage.close(); }
  for (const [asset, path] of [['station', 'assets/station/v1/station-npc-xu-s-idle-f0-v1.png'], ['coast', 'assets/coast/packed/legacy.webp']]) {
    const url = `data:image/${path.endsWith('.webp') ? 'webp' : 'png'};base64,${(await readFile(path)).toString('base64')}`;
    for (const fault of ['decode', 'draw']) {
      const row = { asset, fault }; report.checks.push(row);
      const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
      await context.route('https://assets.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
      context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://assets.test/')) report.external.push(r.url()); });
      const page = await context.newPage(); page.setDefaultTimeout(12000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(({ url, fault }) => {
        window.__assetProbe = { consumed: 0, attempts: 0 };
        const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value) {
          if (value === url) {
            window.__assetProbe.attempts++;
            if (fault === 'decode' && !window.__assetProbe.consumed) {
              window.__assetProbe.consumed++; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return;
            }
          }
          src.set.call(this, value);
        } });
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function(...args) {
          if (fault === 'draw' && args[0] instanceof HTMLImageElement && args[0].src === url && !window.__assetProbe.consumed) {
              window.__assetProbe.consumed++; throw new Error('injected cold image draw failure');
          }
          return draw.apply(this, args);
        };
      }, { url, fault });
      try {
        await page.goto('https://assets.test/');
        await page.locator('[data-action="enter"]').waitFor();
        const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, key);
        await page.locator('[data-action="enter"]').click(); await skipOpening(page);
        await page.locator('[data-action="base-enter"]').waitFor();
        assert.equal(await page.locator('#station-yard').count(), 0, 'failed cold load must remove the yard and restore usable tabs');
        assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, key), before);
        assert.deepEqual(await page.evaluate(() => [typeof window.__bincov, typeof window.__station]), ['undefined', 'undefined']);
        await page.locator('[data-action="base-enter"]').click();
        await page.locator('#station-yard [data-quick="gear"]').waitFor();
        assert.equal(await page.locator('#station-yard').count(), 1);
        row.probe = await page.evaluate(() => window.__assetProbe);
        assert.equal(row.probe.consumed, 1); assert.equal(row.probe.attempts, 2, 'retry must decode again in the same page');
        assert.deepEqual(errors, []); assert.deepEqual(report.external, []);
        await page.screenshot({ path: resolve(out, `${asset}-${fault}.png`) });
        row.status = 'passed';
      } catch (e) { row.status = 'failed'; row.error = String(e.stack); row.errors = errors; process.exitCode = 1; }
      finally { await context.close(); }
      console.log(row.status, asset, fault, row.error?.split('\n')[0] ?? '');
      await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
    }
  }
} finally { await browser.close(); }
