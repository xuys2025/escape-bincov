/**
 * Review evidence for the layered title (not part of CI; takes a few minutes):
 * real screenshots, 3x crops, a style comparison sheet, a ~25 s demo video, a 1:1 frame
 * sequence for a GIF, a 60 s continuity audit and frame-time / load measurements.
 * Output: test-results/title-evidence. Usage: pnpm package && node scripts/title-evidence.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results/title-evidence');
await mkdir(resolve(out, 'frames'), { recursive: true });
const url = pathToFileURL(resolve('dist/index.html')).href;
const manifest = JSON.parse(await readFile('assets/title/manifest.json', 'utf8'));
const report = { startedAt: new Date().toISOString(), htmlBytes: (await stat('dist/index.html')).size, assets: manifest.totals, errors: [], externalRequests: [] };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
const contextFor = async (width, height, extra = {}) => {
  const touch = width < 1000 && (width < 600 || height < 600);
  const context = await browser.newContext({ viewport: { width, height }, offline: true, hasTouch: touch, isMobile: touch, reducedMotion: 'no-preference', ...extra });
  context.on('request', r => { if (/^https?:/.test(r.url())) report.externalRequests.push(r.url()); });
  context.on('page', p => { p.on('pageerror', e => report.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); }); });
  return context;
};
const ready = async page => { await page.locator('.title-enter').waitFor(); await page.evaluate(() => document.fonts.ready); };
const snap = page => page.evaluate(() => window.__bincov.app.game.scene.getScene('Menu').title.snapshot());
// Demo-only pointer marker so viewers can follow the mouse in recordings (not part of the game).
const pointerMarker = page => page.evaluate(() => {
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:9999;width:10px;height:10px;margin:-5px 0 0 -5px;border:2px solid #f0cf83;background:#122027;pointer-events:none;left:50%;top:50%';
  document.body.append(dot);
  addEventListener('pointermove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; });
});

try {
  // 1. Screenshots: desktop, wide, tablet, phones (motion on, pointer centred, fresh save).
  for (const [w, h] of [[1920, 1080], [1280, 720], [2560, 1080], [1024, 768], [768, 1024], [390, 844], [360, 800], [430, 932], [844, 390], [740, 300], [640, 360]]) {
    const context = await contextFor(w, h), page = await context.newPage();
    await page.goto(url); await ready(page);
    await page.mouse.move(w / 2, h / 2); await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(out, `menu-${w}x${h}.png`) });
    await context.close();
  }
  // States: returning player, resumable raid, storage unavailable, guide open (1280×720).
  {
    const context = await contextFor(1280, 720), page = await context.newPage();
    await page.goto(url + '?test=1&entry=tabs'); await ready(page);
    await page.evaluate(() => { const b = window.__bincov; b.app.save.stats.runs = 7; b.app.save.stats.extracts = 4; b.persist(); });
    await page.reload(); await ready(page); await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(out, 'state-returning-1280x720.png') });
    await page.locator('[data-action="help"]').click(); await page.getByRole('dialog').waitFor(); await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, 'state-guide-1280x720.png') });
    await context.close();
    const blocked = await contextFor(1280, 720), bp = await blocked.newPage();
    await bp.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); });
    await bp.goto(url); await bp.locator('.title-screen').waitFor(); await bp.waitForTimeout(800);
    await bp.screenshot({ path: resolve(out, 'state-storage-blocked-1280x720.png') });
    await blocked.close();
  }
  // 2. Style references from the running game: raid and warehouse at 1920×1080.
  {
    const context = await contextFor(1920, 1080), page = await context.newPage();
    await page.goto(url); await ready(page);
    await page.locator('.title-enter').click(); await page.locator('.hideout').waitFor(); await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(out, 'ref-warehouse-1920x1080.png') });
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === 'run', null, { timeout: 15000 }); await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(out, 'ref-raid-1920x1080.png') });
    await context.close();
  }
  // 3. Crops at 3× nearest-neighbour and a side-by-side style sheet, laid out in a page.
  {
    const context = await contextFor(1500, 1200), page = await context.newPage();
    const data = async f => `data:image/png;base64,${(await readFile(resolve(out, f))).toString('base64')}`;
    const concept = await readFile(resolve('docs/title-parallax/concept-reference.png')).then(b => `data:image/png;base64,${b.toString('base64')}`).catch(() => '');
    const crop = (src, x, y, w, h, s, label) => `<figure><div style="width:${w * s}px;height:${h * s}px;overflow:hidden;position:relative"><img src="${src}" style="position:absolute;left:${-x * s}px;top:${-y * s}px;width:${1920 * s}px;image-rendering:pixelated"></div><figcaption>${label}</figcaption></figure>`;
    const menu = await data('menu-1920x1080.png'), raid = await data('ref-raid-1920x1080.png'), stash = await data('ref-warehouse-1920x1080.png');
    await page.setContent(`<html lang="zh-CN"><style>body{margin:24px;background:#0d181d;color:#ece3bf;font:16px sans-serif}figure{display:inline-block;margin:0 16px 16px 0;vertical-align:top}figcaption{margin-top:6px;color:#b3b9a3;font-size:14px}h1{font-size:20px}</style>
      <h1>3× 最近邻放大 · 实际运行截图（1920×1080，每个美术像素 = 2 屏幕像素）</h1>
      ${crop(menu, 104, 140, 220, 100, 3, '字标')}${crop(menu, 1196, 400, 160, 120, 3, '窗框、木桩与雨')}${crop(menu, 1190, 510, 200, 160, 3, '电台')}${crop(menu, 800, 660, 200, 120, 3, '桌边、抽屉与海图')}`);
    await page.screenshot({ path: resolve(out, 'crops-3x.png'), fullPage: true });
    await page.setViewportSize({ width: 1940, height: 1200 });
    await page.setContent(`<html lang="zh-CN"><style>body{margin:20px;background:#0d181d;color:#ece3bf;font:16px sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;image-rendering:pixelated;display:block}p{margin:6px 0 0;color:#b3b9a3;font-size:14px}</style>
      <main><div><img src="${menu}"><p>新主菜单（实际运行）</p></div><div>${concept ? `<img src="${concept}"><p>已认可概念图（概念参考，非实现截图）</p>` : '<p>概念参考缺失</p>'}</div>
      <div><img src="${raid}"><p>局内行动（共享像素网格，主菜单为导入像素素材）</p></div><div><img src="${stash}"><p>水产站仓库（同一 Bincov Text 点阵字体）</p></div></main>`);
    await page.screenshot({ path: resolve(out, 'style-comparison.png'), fullPage: true });
    await context.close();
  }
  // 4. Demo video (~25 s, 1280×720): idle, corners, centre, leave, motion off and on.
  {
    const context = await contextFor(1280, 720, { recordVideo: { dir: out, size: { width: 1280, height: 720 } } }), page = await context.newPage();
    await page.goto(url + '?test=1&entry=tabs'); await ready(page); await pointerMarker(page);
    await page.mouse.move(640, 360); await page.waitForTimeout(3000);
    for (const [x, y, steps, wait] of [[40, 40, 60, 2200], [1240, 680, 90, 2200], [1240, 40, 60, 1800], [40, 680, 90, 1800], [640, 360, 50, 2000]]) { await page.mouse.move(x, y, { steps }); await page.waitForTimeout(wait); }
    await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: null })));
    await page.waitForTimeout(2500);
    await page.locator('[data-action="title-motion"]').click(); await page.waitForTimeout(2500);
    await page.locator('[data-action="title-motion"]').click(); await page.waitForTimeout(3000);
    const video = page.video(); await context.close(); await video.saveAs(resolve(out, 'title-demo-1280x720.webm')); await video.delete();
  }
  // 5. 1:1 frame sequence at 960×540 (scene at native scale) for a GIF preview.
  {
    const context = await contextFor(960, 540), page = await context.newPage();
    await page.goto(url + '?test=1&entry=tabs'); await ready(page);
    await page.mouse.move(480, 270); await page.waitForTimeout(800);
    const times = [];
    const path = [[480, 270], [120, 90], [840, 450], [480, 270]];
    let frame = 0;
    for (let leg = 0; leg + 1 < path.length; leg++) for (let i = 0; i < 30; i++) {
      const t = i / 30, x = path[leg][0] + (path[leg + 1][0] - path[leg][0]) * t, y = path[leg][1] + (path[leg + 1][1] - path[leg][1]) * t;
      await page.mouse.move(x, y); const at = Date.now();
      await page.screenshot({ path: resolve(out, 'frames', `f${String(frame++).padStart(3, '0')}.png`) });
      times.push(Date.now() - at);
    }
    report.gifFrames = { count: frame, meanCaptureMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length) };
    await context.close();
  }
  // 6. 60 s continuity audit: drops only fall (respawn hidden above the openings), fog only advances,
  //    frame poses step by one, the clock never jumps.
  {
    const context = await contextFor(1280, 720), page = await context.newPage();
    await page.goto(url + '?test=1&entry=tabs'); await ready(page);
    await page.mouse.move(900, 500, { steps: 20 });
    report.continuity60s = await page.evaluate(() => new Promise(done => {
      const title = window.__bincov.app.game.scene.getScene('Menu').title;
      let last = title.snapshot(), frames = 0, rainViolations = 0, respawns = 0, fogBack = 0, poseJumps = 0, maxClockStep = 0;
      const seen = { lamp: new Set(), rope: new Set(), boatY: new Set(), needle: new Set() };
      const end = performance.now() + 60000;
      const tick = () => {
        const s = title.snapshot(); frames++;
        s.rain.forEach(([x, y], i) => { const [px, py] = last.rain[i] || [x, y]; if (y >= py && px - x >= 0 && px - x <= 12) return; if (y <= 24) respawns++; else rainViolations++; });
        s.fog.forEach((v, i) => { if (v < last.fog[i]) fogBack++; });
        for (const k of ['lamp', 'rope', 'boatY', 'needle']) { seen[k].add(s[k]); if (Math.abs(s[k] - last[k]) > 1) poseJumps++; }
        maxClockStep = Math.max(maxClockStep, s.clock - last.clock);
        last = s;
        if (performance.now() < end) requestAnimationFrame(tick);
        else done({ frames, rainViolations, respawns, fogBack, poseJumps, maxClockStepMs: maxClockStep, poses: Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])) });
      };
      requestAnimationFrame(tick);
    }));
    assert.equal(report.continuity60s.rainViolations, 0); assert.equal(report.continuity60s.fogBack, 0); assert.equal(report.continuity60s.poseJumps, 0);
    await context.close();
  }
  // 7. Performance: load/decode timing, 60 s desktop sample, 20 s sample at 4× CPU throttle.
  const sample = (page, ms) => page.evaluate(duration => new Promise(done => {
    const times = []; let last = performance.now(); const end = last + duration;
    const frame = now => { times.push(now - last); last = now; if (now < end) requestAnimationFrame(frame); else {
      times.sort((a, b) => a - b); const q = p => +times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(2);
      done({ frames: times.length, p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99), maxMs: q(1), over33ms: times.filter(t => t > 33.4).length, phaserFps: +window.__bincov.app.game.loop.actualFps.toFixed(1) }); } };
    requestAnimationFrame(frame);
  }), ms);
  {
    const context = await contextFor(1920, 1080), page = await context.newPage();
    await page.goto(url + '?test=1&entry=tabs'); await ready(page);
    report.load = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0], decode = performance.getEntriesByName('title-art-decode')[0];
      return { domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd), loadMs: Math.round(nav.loadEventEnd), titleArtDecodeMs: decode ? +decode.duration.toFixed(1) : null, menuReadyMs: Math.round(performance.now()) };
    });
    await page.mouse.move(1300, 700, { steps: 10 }); await page.waitForTimeout(2000);
    report.desktop60s = await sample(page, 60000);
    const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    for (let i = 0; i < 20; i++) {
      await page.locator('.title-enter').click(); await page.locator('[data-action="tab"][data-id="home"]').click();
      await page.locator('[data-action="menu"]').click(); await page.locator('.title-enter').waitFor();
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    report.heapAfter20RoundTrips = { beforeBytes: heapBefore, afterBytes: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null), live: (await snap(page)).live };
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(1500);
    report.cpuThrottle4x20s = await sample(page, 20000);
    await context.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally {
  report.finishedAt = new Date().toISOString();
  report.methodology = 'Windows headless Chrome via Playwright, offline file:// entry. Phone sizes are viewport/touch emulation. ?test=1 reads controller snapshots and writes the explicitly documented returning-player statistics fixture. Frame times come from requestAnimationFrame in headless Chrome without vsync, and the 4x CPU throttle is DevTools emulation; neither is a physical-device measurement. Demo recordings include a demo-only pointer marker.';
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ status: report.status, load: report.load, desktop60s: report.desktop60s, cpuThrottle4x20s: report.cpuThrottle4x20s, continuity60s: report.continuity60s, heap: report.heapAfter20RoundTrips }, null, 1));
}
