// Four-size screenshots of the village sample on the real Runtime (offline build, seed 42, explicit ?test=1 fixtures
// only to place the player/enemies/doors and freeze AI). Placeholder art; not final assets.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_SHOTS_OUT || 'test-results/coast-sample/shots'); await mkdir(out, { recursive: true });
const url = pathToFileURL(resolve('dist/index.html')).href + '?test=1&sample=village';
const S = Math.PI / 2, N = -Math.PI / 2, W = Math.PI;
const SCENES = [
  { id: 'cross', note: '街口全景', run: d => d.placePlayer({ x: 640, y: 456 }, 0, 'coast') },
  { id: 'longwall', note: '居民楼北侧（二层收起，被挡人物显示轮廓）', run: (d, e) => { d.placePlayer({ x: 464, y: 204 }, S, 'coast'); d.placeEnemy(e[0], { x: 368, y: 206 }); } },
  { id: 'door', note: '正门关闭：室内未揭示', run: d => { d.placePlayer({ x: 464, y: 436 }, N, 'coast'); d.door('resident-front', false); } },
  { id: 'door-open', note: '开门站门洞：屋顶淡出、前墙局部淡化', run: d => { d.placePlayer({ x: 464, y: 436 }, N, 'coast'); d.door('resident-front', true); d.placePlayer({ x: 464, y: 404 }, N, 'coast'); } },
  { id: 'reveal', note: '居民楼一楼室内揭示', run: d => { d.placePlayer({ x: 464, y: 436 }, N, 'coast'); d.door('resident-front', true); d.door('resident-west', true); d.placePlayer({ x: 472, y: 340 }, W, 'coast'); } },
  { id: 'window', note: '贴西墙窗口向外瞄准', run: (d, e) => { d.placePlayer({ x: 464, y: 436 }, N, 'coast'); d.door('resident-front', true); d.placePlayer({ x: 360, y: 342 }, W, 'coast'); d.placeEnemy(e[1], { x: 232, y: 342 }); } },
  { id: 'loot', note: '最近的真实物资箱', run: (d, _e, f) => { const c = f.containers.filter(c => c.kind === 'crate' && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0]; d.placePlayer({ x: c.x + 14, y: c.y + 12 }, N, 'coast'); } },
  { id: 'enemies', note: '真实敌人种类外观', run: (d, e) => { d.placePlayer({ x: 640, y: 456 }, 0, 'coast'); e.slice(0, 4).forEach((uid, i) => d.placeEnemy(uid, { x: 720 + i * 34, y: 430 + (i % 2) * 30 })); } },
  { id: 'extract', note: '北线检查口撤离点', run: d => d.placePlayer({ x: 208, y: 128 }, S, 'coast') },
  { id: 'outside', note: '样板范围外：通用占位画面与边界标记', run: d => d.placePlayer({ x: 104, y: 860 }, 0, 'coast') },
  { id: 'upstairs', note: '二楼（真实落点）', run: d => d.placePlayer({ x: 304, y: 80 }, S, 'resident-f2') },
  { id: 'basement', note: '地下层（真实落点）', run: d => d.placePlayer({ x: 240, y: 80 }, S, 'resident-b1') },
];
const ONLY = process.env.SHOT_SIZES; const SIZES_ALL = [
  { w: 1280, h: 720, dpr: 1, touch: false }, { w: 1920, h: 1080, dpr: 1, touch: false },
  { w: 844, h: 390, dpr: 3, touch: true }, { w: 640, h: 300, dpr: 3, touch: true },
];
const SIZES = ONLY ? SIZES_ALL.filter(s => ONLY.split(',').includes(s.w + 'x' + s.h)) : SIZES_ALL;
const browser = await chromium.launch(browserOptions);
const index = { startedAt: new Date().toISOString(), browser: browser.version(), seed: '42', url: '?test=1&sample=village', shots: [], errors: [], requests: [], console: [], anomalies: [] };
for (const size of SIZES) {
  const context = await browser.newContext({ viewport: size.touch ? { width: 844, height: 390 } : { width: size.w, height: size.h }, deviceScaleFactor: size.dpr, hasTouch: size.touch, isMobile: size.touch, offline: true });
  context.on('request', r => { if (/^https?:/.test(r.url())) index.requests.push(r.url()); });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => index.errors.push(e.message));
  page.on('console', message => { if (index.console.length < 200) index.console.push({ size: `${size.w}x${size.h}`, type: message.type(), text: message.text().slice(0, 1500) }); });
  // Observe real test-context writes without changing their outcome or recording save contents.
  await page.addInitScript(() => {
    window.__solStorageTrace = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key !== 'escape-bincov.session.v2') return set.call(this, key, value);
      const trace = { at: performance.now(), bytes: new TextEncoder().encode(value).length, result: 'pending' };
      try { const result = set.call(this, key, value); trace.result = 'written'; return result; }
      catch (error) { trace.result = 'failed'; trace.error = `${error.name}: ${error.message}`; throw error; }
      finally { window.__solStorageTrace.push(trace); if (window.__solStorageTrace.length > 30) window.__solStorageTrace.shift(); }
    };
  });
  await page.goto(url);
  const go = name => page.locator(`[data-action="${name}"]`);
  if (size.touch) { await go('enter').tap(); await page.locator('#seed').fill('42'); await go('deploy').tap(); }
  else { await go('enter').click(); await page.locator('#seed').fill('42'); await go('deploy').click(); }
  await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch);
  if (size.touch) await page.setViewportSize({ width: size.w, height: size.h });
  await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  for (const scene of SCENES) {
    await page.evaluate(([src]) => {
      const run = new Function('S', 'N', 'W', 'return ' + src)(Math.PI / 2, -Math.PI / 2, Math.PI), h = window.__bincovSample.host, f = h.lastBatch.frame;
      const enemies = f.actors.filter(a => a.alive).sort((a, b) => a.kind.localeCompare(b.kind) || a.uid.localeCompare(b.uid));
      const kinds = [...new Map(enemies.map(a => [a.kind, a.uid])).values()];
      run(window.__bincovSample.driver, [...kinds, ...enemies.map(a => a.uid)], f);
    }, [scene.run.toString()]);
    await page.waitForTimeout(1100);
    const file = `${scene.id}-${size.w}x${size.h}.png`;
    await page.screenshot({ path: resolve(out, file) });
    const info = await page.evaluate(() => { const h = window.__bincovSample.host, b = h.lastBatch; return { map: b.stamp.world.mapId, epoch: b.stamp.epoch, player: [b.frame.player.x, b.frame.player.y], phase: b.frame.phase, panel: h.panel, storageError: window.__bincov.app.storageError || '', storageOK: window.__bincov.app.storageOK, rejected: h.eventLog.filter(e => e.type === 'rejected').slice(-5), writes: window.__solStorageTrace.slice(-5) }; });
    if (process.env.SHOT_DEBUG) console.log(scene.id, JSON.stringify(info));
    index.shots.push({ file, scene: scene.id, note: scene.note, size: `${size.w}x${size.h}`, dpr: size.dpr, touch: size.touch, ...info });
    if (info.phase !== 'running' || info.panel !== null || info.storageError || !info.storageOK) index.anomalies.push({ file, ...info });
    console.log('shot', file);
  }
  await context.close();
}
await browser.close();
index.finishedAt = new Date().toISOString();
await writeFile(resolve(out, 'index.json'), JSON.stringify(index, null, 2));
console.log(`${index.shots.length} shots; anomalies ${index.anomalies.length}; errors ${index.errors.length}; external requests ${index.requests.length}`);
if (index.anomalies.length || index.errors.length || index.requests.length) process.exitCode = 1;
