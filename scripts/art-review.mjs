/**
 * Runtime art audit; diagnostic atlases are explicitly distinct from game captures.
 *
 * Item art comes from the game's own painters (src/art/items.ts, inventory.ts, portraits.ts): they are bundled into a
 * diagnostic sheet that paints every item at its runtime sizes, and the tab page's displayed art must match them pixel
 * for pixel. World art comes from the 2.5D raid view's texture cache (actors, corpses, crates, ground supplies) and from
 * real 2.5D captures of six places and the high tide.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { ITEMS } from '../src/domain.ts';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls, running } from './stall-resume.mjs';

const out = resolve('test-results/art-review');
await mkdir(out, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const report = { htmlSha256: hash(await readFile('dist/index.html')), method: 'Item art from the game\'s own painters (bundled into an independent diagnostic sheet at native / 3x sizes) and compared pixel for pixel with the art the tab page shows. World textures read from the live 2.5D raid view (fresh seed 42). Scene captures are 2.5D raid frames with enemies frozen and the player placed by the explicit ?test=1 driver; rendering remains active. No screenshot editing.', checks: [], errors: [], externalRequests: [] };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
// The painters, with Sol's gunsmith art decoded as the game decodes it before its first frame (#28 M2-10; since M3 the
// wave-one guns and parts have no hand-drawn placeholders of their own).
const painters = (await build({ stdin: { contents: "export { paintItem, ITEM_ART_IDS } from './src/art/items.ts'; export { paintInventoryItem, inventoryArtSize } from './src/art/inventory.ts'; export { paintPortrait } from './src/art/portraits.ts'; export { loadGunsmithArt } from './src/art/gunsmith-compose.ts';", resolveDir: resolve('.'), loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: '__art', platform: 'browser', loader: { '.png': 'dataurl' } })).outputFiles[0].text;
/** In-page: pixel statistics and a PNG of a canvas. */
const STATS = `window.__stats = c => {
  const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let count = 0, translucent = 0, left = c.width, top = c.height, right = -1, bottom = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const a = pixels[(y * c.width + x) * 4 + 3]; if (a) { count++; if (a !== 255) translucent++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); } }
  return { width: c.width, height: c.height, occupied: count, translucent, bounds: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }, png: c.toDataURL() };
};`;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, reducedMotion: 'reduce' });
  await resumeStalls(context);
  context.on('page', page => page.on('pageerror', e => report.errors.push(String(e))));
  context.on('request', req => { if (/^https?:/.test(req.url())) report.externalRequests.push(req.url()); });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
  await page.locator('[data-action="enter"]').waitFor({ timeout: 60000 });

  // ---- Item art: every item at its runtime sizes, from the game's painters ----
  const sheet = await context.newPage();
  await sheet.setContent('<html><body></body></html>');
  await sheet.addScriptTag({ content: painters }); await sheet.addScriptTag({ content: STATS });
  await sheet.evaluate(() => window.__art.loadGunsmithArt());
  const textures = await sheet.evaluate(ids => {
    const paint = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; fn(g); return window.__stats(c); };
    const list = [];
    for (const id of ids) {
      const [w, h] = window.__art.inventoryArtSize(id);
      list.push({ key: `item-small-${id}`, ...paint(24, 24, g => window.__art.paintItem(g, id, 24)) });
      list.push({ key: `item-${id}`, ...paint(32, 32, g => window.__art.paintItem(g, id, 32)) });
      list.push({ key: `item-inventory-${id}`, ...paint(w, h, g => window.__art.paintInventoryItem(g, id)) });
    }
    for (const kind of ['arms', 'med']) list.push({ key: `portrait-${kind}`, ...paint(48, 48, g => window.__art.paintPortrait(g, kind)) });
    return list;
  }, Object.keys(ITEMS));
  const byKey = Object.fromEntries(textures.map(t => [t.key, t]));
  assert.ok(textures.every(t => t.occupied > 0 && t.translucent === 0), 'Native pixel art must be nonempty without antialiased edges');
  for (const size of [24, 32]) {
    const entries = Object.keys(ITEMS).map(id => byKey[`item-${size === 24 ? 'small-' : ''}${id}`]);
    assert.ok(entries.every(t => t && t.width === size && t.height === size && t.occupied > 0), `Missing ${size}px item art`);
    assert.equal(new Set(entries.map(t => t.png)).size, Object.keys(ITEMS).length, `Two ${size}px item icons are identical`);
    report.checks.push(`All ${Object.keys(ITEMS).length} ${size}px item paintings present, nonempty and unique`);
  }
  const inventoryArt = Object.keys(ITEMS).map(id => byKey[`item-inventory-${id}`]);
  assert.equal(new Set(inventoryArt.map(t => t.png)).size, Object.keys(ITEMS).length);
  assert.notEqual(byKey['portrait-arms'].png, byKey['portrait-med'].png);
  report.checks.push(`All ${Object.keys(ITEMS).length} proportioned inventory paintings and both merchant portraits are present and unique`);

  // The tab page shows exactly these paintings (gear grids, detail icon, merchant portrait).
  await page.locator('[data-action="enter"]').click();
  await page.locator('.hideout').waitFor();
  const pixelsOf = (p, sel) => p.locator(sel).evaluateAll(imgs => Promise.all(imgs.map(async img => {
    await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0); return { art: img.closest('[data-item-id], [data-uid]')?.getAttribute('data-item-id') ?? null, data: [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].join(',') };
  })));
  const paintedPixels = (key) => sheet.evaluate(png => new Promise(done => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); done([...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].join(',')); }; i.src = png; }), byKey[key].png);
  const shown = await pixelsOf(page, '.item[data-item-id] .inventory-art-image');
  assert.ok(shown.length >= 3, `the gear tab shows item art (${shown.length})`);
  for (const s of shown) assert.equal(s.data, await paintedPixels(`item-inventory-${s.art}`), `${s.art}: the tab page's inventory art is not the painter's`);
  const firstItem = page.locator('.item[data-item-id]').first(), firstId = await firstItem.getAttribute('data-item-id');
  await firstItem.click();
  const detail = await page.locator('.details .detail-icon img').evaluate(async img => { await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].join(','); });
  assert.equal(detail, await paintedPixels(`item-${firstId}`), `${firstId}: the detail icon is not the 32 px painting`);
  await page.locator('[data-action="tab"][data-id="arms"]').click();
  const portrait = await page.locator('.merchant-portrait').evaluate(async img => { await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].join(','); });
  assert.equal(portrait, await paintedPixels('portrait-arms'), 'the merchant portrait is not the painter\'s');
  report.checks.push(`The tab page shows the painters' art: ${shown.length} inventory images, the ${firstId} detail icon and the 修理铺 portrait`);
  await page.locator('[data-action="tab"][data-id="gear"]').click();

  assert.equal(await page.evaluate(() => document.fonts.check('16px "Bincov Text"', '滨科夫水产站')), true);
  async function atlas(name, cards) {
    const a = await context.newPage(); await a.setViewportSize({ width: 1280, height: 1100 });
    await a.setContent(`<html lang="zh-CN"><style>*{box-sizing:border-box}body{margin:24px;background:#101c22;color:#eee4c5;font:16px sans-serif}h1{font-size:24px}p{font-size:14px;color:#c1cdbf}main{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}article{padding:12px;background:#1e3035;border-top:2px solid #617a7c;min-height:216px}b{display:block;font-size:16px;margin-bottom:8px}small{display:block;color:#a8c3ba;font:12px monospace}section{display:flex;align-items:center;gap:12px;margin-top:8px;height:100px}.native{height:34px;background:#0e191f}img{image-rendering:pixelated}</style><h1>${name} · 实际运行纹理审查</h1><p>上：原尺寸，下：3× 最近邻诊断放大；本图是纹理排列，不是游戏画面。</p><main></main></html>`);
    await a.evaluate(cards => { for (const card of cards) { const art = document.createElement('article'), b = document.createElement('b'), label = document.createElement('small'); b.textContent = card.name; label.textContent = card.id; art.append(b, label); for (const scale of [1, 3]) { const row = document.createElement('section'); if (scale === 1) row.className = 'native'; row.style.height = `${Math.max(...card.textures.map(t => t.height)) * scale + 4}px`; for (const t of card.textures) { const img = document.createElement('img'); img.src = t.png; img.width = t.width * scale; img.height = t.height * scale; row.append(img); } art.append(row); } document.querySelector('main').append(art); } }, cards);
    if (name === 'inventory-items') await a.addStyleTag({ content: 'main{grid-template-columns:repeat(3,1fr)}' });
    await a.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
    await a.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
    await a.addStyleTag({ content: 'article img{filter:grayscale(1)}' });
    await a.screenshot({ path: resolve(out, `${name}-gray.png`), fullPage: true });
    await a.close(); await page.bringToFront();
  }
  await atlas('items', Object.entries(ITEMS).map(([id, item]) => ({ id, name: item.name, textures: [byKey[`item-small-${id}`], byKey[`item-${id}`]] })));
  await atlas('inventory-items', Object.entries(ITEMS).map(([id, item]) => ({ id, name: item.name, textures: [byKey[`item-inventory-${id}`]] })));
  // A background tab gets throttled animation frames (and the raid would stall): keep the game page in front.
  await sheet.close(); await page.bringToFront();

  // ---- Title and menu text render in the embedded face ----
  await page.locator('[data-action="tab"][data-id="home"]').click(); await page.locator('[data-action="menu"]').click();
  await page.locator('.title-enter strong').waitFor();
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '.title-enter strong' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  assert.ok(fonts.some(f => f.isCustomFont && f.familyName === 'Bincov Text' && f.glyphCount > 0), 'Visible Chinese text must actually render in the embedded face');
  report.renderedFonts = fonts;
  await cdp.detach();
  report.checks.push('Embedded Bincov Text font ready before the game starts');

  // ---- World art: the 2.5D raid view's own textures ----
  await page.locator('[data-action="enter"]').click(); await page.locator('.hideout').waitFor();
  await page.locator('#seed').fill('42'); await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
  await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  await page.addScriptTag({ content: STATS });
  const world = await page.evaluate(ids => {
    const t = window.__bincovSample.host.view.tex, read = (key, make) => { make(); return { key, ...window.__stats(t.canvas(key)) }; };
    const kinds = ['player', 'scav', 'salt', 'elite', 'creature'];
    return {
      actors: kinds.map(k => read(`actor:${k}:2:0`, () => t.actor(k, 2, 0))),
      corpses: kinds.slice(1).map(k => read(`corpse:${k}:1`, () => t.corpse(k, 1))),
      crates: ['full', 'empty', 'open'].map(look => read(`crate:${look}`, () => t.crate(look))),
      loot: ids.map(id => read(`loot:${id}`, () => t.loot(id))),
      art: window.__bincovSample.counts().art,
    };
  }, Object.keys(ITEMS));
  assert.equal(world.art, 'sol', 'the raid view loaded the delivered art');
  assert.ok([...world.actors, ...world.corpses, ...world.crates, ...world.loot].every(t => t.occupied > 0), 'empty world texture');
  assert.equal(new Set(world.actors.map(t => t.png)).size, 5, 'five actor identities');
  for (const c of world.corpses) assert.ok(!world.actors.some(a => a.png === c.png), `${c.key} reuses a standing actor`);
  assert.equal(new Set(world.corpses.map(t => t.png)).size, 4, 'four separate corpses');
  assert.equal(new Set(world.crates.map(t => t.png)).size, 3, 'full, empty and open crates differ');
  assert.equal(new Set(world.loot.map(t => t.png)).size, Object.keys(ITEMS).length, 'Ground supplies must have distinct object silhouettes');
  report.checks.push('2.5D view: five actor identities, four separate corpses, distinct full/empty/open crates and distinct ground supplies');
  await atlas('actors', [...world.actors, ...world.corpses, ...world.crates].map(t => ({ id: t.key, name: t.key, textures: [t] })));
  await atlas('ground-supplies', Object.entries(ITEMS).map(([id, item], i) => ({ id: `loot:${id}`, name: item.name, textures: [world.loot[i]] })));
  report.textures = [...textures, ...world.actors, ...world.corpses, ...world.crates, ...world.loot].map(({ png, ...t }) => ({ ...t, pngSha256: hash(Buffer.from(png.split(',')[1], 'base64')) }));

  // ---- 2.5D captures of six places at both sizes, then the high tide ----
  /** Stand on the nearest walkable point to (x, y) (the driver refuses a body that does not fit). */
  const standNear = (x, y) => page.evaluate(([x, y]) => {
    const d = window.__bincovSample.driver;
    for (let r = 0; r <= 96; r += 8) for (let a = 0; a < (r ? 16 : 1); a++) {
      const p = { x: x + Math.round(Math.cos(a * Math.PI / 8) * r), y: y + Math.round(Math.sin(a * Math.PI / 8) * r) };
      try { d.placePlayer(p, 0, 'coast'); return p; } catch { /* try the next point */ }
    }
    throw new Error(`No walkable point near (${x}, ${y})`);
  }, [x, y]);
  const frames = n => page.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  const settle = async () => { await frames(20); await page.waitForTimeout(800); };

  // ---- An emptied crate keeps its empty look in the save and after a reload ----
  // Real input: E opens an outdoor crate and each stack goes to the bag by its 拿到背包 button (the Runtime's loot
  // transaction, committed with the world snapshot); then the page reloads and the raid resumes from what was stored.
  const crate = await page.evaluate(() => {
    const b = window.__bincovSample.host.lastBatch, p = b.frame.player;
    return b.frame.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null)
      .sort((a, c) => a.stacks - c.stacks || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(c.x - p.x, c.y - p.y))[0] ?? null;
  });
  assert.ok(crate, 'an outdoor crate with supplies');
  const crateLook = () => page.evaluate(id => {
    const h = window.__bincovSample.host, v = h.view, e = v.crates.get(id), c = h.lastBatch.frame.containers.find(c => c.id === id);
    const saved = JSON.parse(localStorage.getItem('escape-bincov.session.v2')).expansion?.raid, stored = saved?.maps[saved.currentMap]?.containers.find(c => c.id === id);
    return { look: e?.look ?? null, texture: !!e && e.s.texture === v.tex.crate(e.look), drawn: !!e?.s.visible, stacks: c?.stacks ?? null, stored: stored?.inventory.items.length ?? null };
  }, crate.id);
  const full = await crateLook();
  let target = null;
  for (const [dx, dy] of [[0, 26], [0, -26], [26, 0], [-26, 0]]) {
    await standNear(crate.x + dx, crate.y + dy); await frames(3);
    target = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.interaction?.ref.id ?? null);
    if (target === crate.id) break;
  }
  assert.equal(target, crate.id, 'the crate is the interaction target');
  // E opens the crate (again, if a stall pause on a slow runner closed its panel: the Runtime pauses, the panel closes).
  const openCrate = async () => {
    await running(page); await page.keyboard.press('e');
    await page.waitForFunction(id => window.__bincovSample.host.panel === 'loot' && window.__bincovSample.host.services.lootContext()?.containerId === id, crate.id);
    // The view lifts the lid on the next frames it draws with the panel up.
    await frames(3);
  };
  await openCrate();
  const open = await crateLook();
  // A stack can go in two steps: the first tops up the bag's own stack of that item (获得 …（部分）), the next takes the rest.
  const units = () => page.evaluate(id => window.__bincovSample.host.lastBatch.frame.containers.find(c => c.id === id).totalQty, crate.id);
  for (let left = await units(), tries = 0; left > 0; left = await units()) {
    assert.ok(++tries <= crate.stacks * 2, 'each stack leaves the crate within two transfers');
    if (await page.evaluate(() => window.__bincovSample.host.panel) !== 'loot') await openCrate();
    await page.locator('.coast-sample [data-source="container"][data-uid]').first().click(); await page.locator('.coast-sample [data-do="inv-quick"]').click();
    await page.waitForFunction(([id, left]) => window.__bincovSample.host.lastBatch.frame.containers.find(c => c.id === id).totalQty < left, [crate.id, left], { timeout: 20000 })
      .catch(async () => {
        const why = await page.evaluate(() => ({ toast: document.querySelector('.coast-sample [data-toast]')?.textContent, status: document.querySelector('.coast-sample .cs-inv-foot')?.textContent,
          bag: window.__bincov.app.loadout.bag.items.map(i => `${i.id}x${i.qty}`) }));
        await page.screenshot({ path: resolve(out, 'empty-crate-failure.png') });
        throw new Error(`拿到背包 moved nothing out of the crate: ${JSON.stringify(why)}`);
      });
  }
  const emptied = await crateLook();
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__bincovSample.host.panel === null); await settle();
  const closed = await crateLook();
  await page.reload(); await page.locator('[data-action="enter"]').click({ timeout: 60000 });
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch); await settle();
  const restored = await crateLook();
  assert.equal(await page.evaluate(() => window.__bincovSample.host.panel), 'pause', 'the reloaded raid resumes paused');
  await page.locator('.coast-sample [data-do="resume"]').click(); await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  const saved = await page.evaluate(() => window.__bincovSample.host.services.checkpoint());
  report.crate = { id: crate.id, stacks: crate.stacks, full, open, emptied, closed, restored, saved };
  assert.deepEqual([full.look, full.texture, full.drawn], ['full', true, true], 'the crate shows full before looting');
  assert.equal(open.look, 'open', 'the crate shows open while its panel is up');
  assert.deepEqual(emptied, { look: 'empty', texture: true, drawn: true, stacks: 0, stored: 0 }, 'the last transfer shows the crate empty and stores it empty');
  assert.deepEqual(closed, emptied, 'closing the panel keeps it empty');
  assert.deepEqual(restored, emptied, 'after a reload the restored crate looks empty and the save holds it empty');
  assert.equal(saved, true, 'the restored raid passes a validated checkpoint write');
  report.checks.push('Empty crate: emptied through the loot panel, stored empty, and restored with the empty look after a reload');
  const views = [['village', 650, 464], ['market', 650, 1072], ['observatory', 1700, 600], ['harbor', 1990, 944], ['pump', 1750, 1520], ['station', 500, 1520]];
  report.worldViews = [];
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const [name, x, y] of views) {
      const at = await standNear(x, y); await settle();
      assert.equal(await page.evaluate(() => window.__bincovSample.host.panel), null, `${name}: scene capture blocked by a panel`);
      await page.screenshot({ path: resolve(out, `${width}x${height}-${name}.png`) });
      report.worldViews.push({ viewport: { width, height }, name, fixture: at });
    }
  }
  // The raid clock past the tide change (the driver sets the flags a checkpoint at that time would hold).
  if (!await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.highTide)) await page.evaluate(() => window.__bincovSample.driver.clock(301));
  await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.highTide);
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const at = await standNear(1940, 944); await settle();
    assert.equal(await page.evaluate(() => window.__bincovSample.host.panel), null, 'High-tide capture blocked by a panel');
    await page.screenshot({ path: resolve(out, `${width}x${height}-high-tide.png`) });
    report.worldViews.push({ viewport: { width, height }, name: 'high-tide', fixture: at });
  }
  report.checks.push(`2.5D captures: ${report.worldViews.length} views including the high tide`);
  // Retired with the Phaser view (its sprites and static world texture no longer exist), and where the 2.5D view is checked:
  // - world.png: the view has no single world texture; the six place captures and the high tide above are its frames.
  // - corpse art after a checkpoint restore: test:coast-animation V03/V04 (CI batch-7: a kill in view, and corpses rebuilt
  //   by an epoch, the stairs or a reload).
  // - untinted loose loot after a restore: no counterpart; the view tints ground supplies by design (light, glint, tide).
  // - the empty-crate sprite after a restore: the empty crate step above (this suite, CI batch-4).
  // - the actor-heading lineup (a screenshot without assertions): facings in test:coast-animation F08 (CI) and
  //   test:coast-sample V02 (manual run only).
  // - layered sprite resynchronisation: the view rebuilds from the frame; revealed rooms after a restore are checked in
  //   test:issue26-spatial S05 (CI batch-4).
  // test:coast-sample W10 (refresh restores the checkpoint) and V08 (the open lid) are manual runs only: CI batch-7 runs
  // the animation group alone.
  await context.close();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  report.status = 'passed'; console.log(JSON.stringify({ checks: report.checks, textures: report.textures.length, errors: report.errors, externalRequests: report.externalRequests }));
} finally { await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
