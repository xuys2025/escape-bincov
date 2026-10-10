// In-engine review crops of Sol's first-batch samples against the procedural placeholders (?art=placeholder): the same
// seed, fixtures and camera for both, 1280x720, crops enlarged 3x with nearest-neighbour scaling in the page.
// Output: BINCOV_ART_OUT (default test-results/coast-sample/art)/<crop>-<sol|placeholder>.png and index.json.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_ART_OUT || 'test-results/coast-sample/art'); await mkdir(out, { recursive: true });
// World rectangles around fixed fixtures; `dirs` renders the player in eight aim directions with the carbine.
const CROPS = [
  { id: 'player-dirs', note: '玩家八方向持卡宾枪（E/SE/S/SW/W/NW/N/NE）', dirs: true },
  { id: 'facade', note: '居民楼南立面：墙帽、外立面 a/b、窗、门（关）', setup: d => { d.door('resident-front', false); d.placePlayer({ x: 464, y: 470 }, -Math.PI / 2, 'coast'); }, rect: { x: 316, y: 330, w: 300, h: 110 } },
  { id: 'interior', note: '一楼室内：内墙、瓷砖、开门', setup: d => { d.door('resident-front', true); d.placePlayer({ x: 464, y: 404 }, -Math.PI / 2, 'coast'); }, rect: { x: 316, y: 190, w: 300, h: 160 } },
  { id: 'street', note: '街口地面：沥青 a/b、院地 a/b 与路缘', setup: d => d.placePlayer({ x: 640, y: 456 }, 0, 'coast'), rect: { x: 520, y: 380, w: 260, h: 150 } },
];
const browser = await chromium.launch(browserOptions);
const index = { inputHTML: process.env.BINCOV_ART_HTML || 'dist/index.html', inputVariant: process.env.BINCOV_ART_VARIANT || 'committed-runtime', startedAt: new Date().toISOString(), crops: [], errors: [], requests: [] };
for (const art of ['sol', 'placeholder']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
  ctx.on('request', r => { if (/^https?:/.test(r.url())) index.requests.push(r.url()); });
  const p = await ctx.newPage(); p.on('pageerror', e => index.errors.push(e.message));
  await p.goto(pathToFileURL(resolve(process.env.BINCOV_ART_HTML || 'dist/index.html')).href + '?test=1&entry=tabs&sample=village' + (art === 'placeholder' ? '&art=placeholder' : ''));
  await p.locator('[data-action="enter"]').click(); await p.locator('#run-world').selectOption('buildings'); await p.locator('#seed').fill('42'); await p.locator('[data-action="deploy"]').click();
  await p.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
  await p.evaluate(() => { const d = window.__bincovSample.driver; d.freezeAI(true); d.weapon('carbine'); });
  // Crop of the view's composited render target, enlarged in the page; returns a PNG data URL.
  const grab = (rect, scale = 3) => p.evaluate(([r, scale]) => {
    const h = window.__bincovSample.host, v = h.view, { pixels, width } = h.app.renderer.extract.pixels(v.upRT), k = v.view.k;
    const x0 = Math.round((r.x - v.cam.x) * k), y0 = Math.round((r.y - v.cam.y) * k), w = Math.round(r.w * k), hh = Math.round(r.h * k);
    const src = document.createElement('canvas'); src.width = w; src.height = hh; const img = src.getContext('2d').createImageData(w, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = ((y0 + y) * width + x0 + x) * 4, o = (y * w + x) * 4; for (let c = 0; c < 4; c++) img.data[o + c] = pixels[i + c] ?? 0; }
    src.getContext('2d').putImageData(img, 0, 0);
    const big = document.createElement('canvas'); big.width = w * scale / k; big.height = hh * scale / k; const g = big.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, big.width, big.height);
    return big.toDataURL('image/png');
  }, [rect, scale]);
  const save = async (id, url) => { const file = `${id}-${art}.png`; await writeFile(resolve(out, file), Buffer.from(url.split(',')[1], 'base64')); return file; };
  for (const crop of CROPS) {
    if (crop.dirs) {
      const urls = [];
      for (let d = 0; d < 8; d++) {
        await p.evaluate(a => window.__bincovSample.driver.placePlayer({ x: 640, y: 456 }, a, 'coast'), d * Math.PI / 4);
        await p.mouse.move(640 + Math.cos(d * Math.PI / 4) * 220, 360 + Math.sin(d * Math.PI / 4) * 220); await p.waitForTimeout(500);
        urls.push(await grab({ x: 616, y: 404, w: 48, h: 60 }, 4));
      }
      const url = await p.evaluate(async urls => {
        const imgs = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
        const c = document.createElement('canvas'); c.width = imgs[0].width * 8; c.height = imgs[0].height; const g = c.getContext('2d');
        imgs.forEach((im, i) => g.drawImage(im, i * im.width, 0)); return c.toDataURL('image/png');
      }, urls);
      index.crops.push({ id: crop.id, note: crop.note, art, file: await save(crop.id, url) });
    } else {
      await p.evaluate(src => new Function('d', `(${src})(d)`)(window.__bincovSample.driver), crop.setup.toString());
      await p.mouse.move(640, 200); await p.waitForTimeout(1200);
      index.crops.push({ id: crop.id, note: crop.note, art, file: await save(crop.id, await grab(crop.rect)) });
    }
  }
  index[art] = await p.evaluate(() => window.__bincovSample.counts().art);
  await ctx.close();
}
await browser.close();
await writeFile(resolve(out, 'index.json'), JSON.stringify(index, null, 2));
console.log(`${index.crops.length} crops; errors ${index.errors.length}; external requests ${index.requests.length}; art ${index.sol}/${index.placeholder}`);
if (index.errors.length || index.requests.length || index.sol !== 'sol' || index.placeholder !== 'placeholder') process.exitCode = 1;
