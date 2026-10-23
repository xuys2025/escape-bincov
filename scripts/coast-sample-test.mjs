// Village sample (?sample=village) on the real coast Runtime: wiring checks through the ordinary menu/base/deploy
// flow of the offline build. Fixtures use the explicit ?test=1 Runtime driver only to place actors; every gameplay
// action goes through real input, the v1 port and the Runtime transaction services. Storage faults patch the real
// localStorage write for the session key.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { deployFromYard } from './yard-entry.mjs';
import { browserOptions } from './browser-options.mjs';
import { readManagedTables, readPixiEvents } from './pixi-managed-gate.mjs';
const managed = page => page.evaluate(readManagedTablesSource => (0,eval)('('+readManagedTablesSource+')')(window.__bincovSample.host.app.renderer), readManagedTables.toString());
const pixiEvents = page => page.evaluate(source => (0,eval)('('+source+')')(window.__bincovSample.host.app.renderer), readPixiEvents.toString());

const out = resolve(process.env.BINCOV_SAMPLE_OUT || 'test-results/coast-sample'); await mkdir(out, { recursive: true });
const htmlPath = resolve(process.env.BINCOV_SAMPLE_HTML || 'dist/index.html'), url = pathToFileURL(htmlPath).href;
const buildSHA256 = createHash('sha256').update(await readFile(htmlPath)).digest('hex');
// --group=animation keeps the complete V03/V04 death flow, the F08 gait check, the V-CAM camera check and V10/V11
// feedback/tide flow (eight checks).
const group = process.argv.find(a => a.startsWith('--group='))?.slice(8);
assert.ok(group === undefined || group === 'animation', 'unknown test group');
const report = { startedAt: new Date().toISOString(), build: url, buildSHA256, seed: '42', group: group ?? 'all', steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const wait = ms => new Promise(r => setTimeout(r, ms));
async function step(name, task) {
  const entry = { name, status: 'running' }; report.steps.push(entry);
  try { entry.detail = await task(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); entry.status = 'passed'; }
  catch (error) { entry.status = 'failed'; entry.error = String(error?.stack ?? error).slice(0, 1200); }
  console.log(`${entry.status === 'passed' ? 'PASS' : 'FAIL'}  ${name}${entry.error ? `\n      ${entry.error.split('\n')[0]}` : ''}`);
}
async function open(query, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, ...options });
  context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  await page.goto(url + query);
  return { context, page };
}
const action = (page, name) => page.locator(`[data-action="${name}"]`);
async function deploy(page, { enter = true } = {}) {
  if (enter) await action(page, 'enter').click();
  await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
  await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
}
const now = page => page.evaluate(() => {
  const h = window.__bincovSample.host, b = h.lastBatch;
  return { stamp: b.stamp, phase: b.frame.phase, player: b.frame.player, hud: b.frame.hud, doors: b.frame.doors, interaction: b.frame.interaction,
    map: b.stamp.world.mapId, rebuilds: h.view.stats.rebuilds, panel: h.panel };
});
const events = (page, type) => page.evaluate(t => window.__bincovSample.host.eventLog.filter(e => !t || e.type === t), type);
const clearEvents = page => page.evaluate(() => { window.__bincovSample.host.eventLog.length = 0; });
const place = (page, x, y, angle = 0, map) => page.evaluate(([x, y, a, m]) => window.__bincovSample.driver.placePlayer({ x, y }, a, m), [x, y, angle, map]);
const frames = (page, n = 3) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const failWrites = page => page.evaluate(() => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('Injected fault', 'QuotaExceededError'); return window.__set.call(this, k, v); }; });
// Fail only the terminal settlement write: every in-raid checkpoint is marked location=raid, the settlement is not.
const failSettlementWrites = page => page.evaluate(() => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'escape-bincov.session.v2' && !String(v).includes('"location":"raid"')) throw new DOMException('Injected fault', 'QuotaExceededError'); return window.__set.call(this, k, v); }; });
const restoreWrites = page => page.evaluate(() => { Storage.prototype.setItem = window.__set; });

const ROOM = { x: 304, y: 192, w: 320, h: 240 }, ROOM_ID = 'coast-buildings-v1/resident-layout-1/coast/region/resident-ground';
// Pixels of the view's composited render target (no HTML), re-presented from the same batch at a fixed view time while
// the real pause holds simulation time (ambient light follows raid time). The first call stores the baseline. Roofs and
// ceilings are stripped for every probe (a fully faded roof), so a pass depends on region gating, not on the roof
// covering the room; `leak` forces the withheld decals visible as the positive control.
const roomPixels = (page, compare, leak = false) => page.evaluate(([r, compare, leak]) => {
  const h = window.__bincovSample.host, v = h.view; h.app.ticker.stop();
  const fades = v.updateFades, reveal = v.fx.reveal;
  v.updateFades = function (...a) { fades.apply(this, a); this.occluders.forEach(o => { if (o.kind === 'roof' || o.kind === 'ceiling') o.sprite.visible = false; }); };
  if (leak) v.fx.reveal = function (rv) { reveal.call(this, rv); this.decals.forEach(d => { d.s.visible = true; }); };
  // The camera may still be easing while paused: every probe reuses the baseline camera.
  if (!compare) window.__probeCam = { ...v.camF }; v.camF = { ...window.__probeCam }; v.shake = 0;
  v.time = 1; v.present({ ...h.lastBatch, events: [] }, 0); h.app.render(); delete v.updateFades; delete v.fx.reveal;
  const { pixels, width } = h.app.renderer.extract.pixels(v.upRT), k = v.view.k, rows = pixels.length / 4 / width;
  const x0 = Math.max(0, Math.round((r.x - v.cam.x) * k)), y0 = Math.max(0, Math.round((r.y - v.cam.y) * k));
  const x1 = Math.min(width, Math.round((r.x + r.w - v.cam.x) * k)), y1 = Math.min(rows, Math.round((r.y + r.h - v.cam.y) * k));
  const crop = []; for (let y = y0; y < y1; y++) crop.push(pixels.slice((y * width + x0) * 4, (y * width + x1) * 4));
  h.app.ticker.start();
  if (!compare) { window.__probeBase = crop; return { size: [x1 - x0, y1 - y0] }; }
  let changed = 0; crop.forEach((row, y) => { const a = window.__probeBase[y]; for (let i = 0; i < row.length; i += 4) if (row[i] !== a[i] || row[i + 1] !== a[i + 1] || row[i + 2] !== a[i + 2]) changed++; });
  return { size: [x1 - x0, y1 - y0], changed };
}, [ROOM, compare, leak]);

if (!group) { // Desktop flow: one run through every wiring point, ending in a settlement
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await step('W00 sample deploy mounts the Pixi host on the real Runtime', async () => {
    await deploy(page);
    const s = await page.evaluate(() => ({ state: window.__bincov.app.state, world: window.__bincovSample.host.lastBatch.stamp.world, roots: document.querySelectorAll('.coast-sample').length }));
    assert.equal(s.state, 'run'); assert.equal(s.world.worldVersion, 'coast-buildings-v1'); assert.equal(s.roots, 1);
    return s;
  });
  await step('W01 holding the left mouse button fires once (press edge)', async () => {
    await place(page, 640, 456, 0); await page.mouse.move(1100, 330); await frames(page, 4); await clearEvents(page);
    const mag = (await now(page)).hud.weapon.mag;
    await page.mouse.down(); await wait(1500); await page.mouse.up(); await frames(page, 3);
    const shots = (await events(page, 'shot')).filter(e => e.detail.shooter === 'player'), after = (await now(page)).hud.weapon.mag;
    assert.equal(shots.length, 1); assert.equal(after, mag - 1);
    return { shots: shots.length, mag: [mag, after] };
  });
  await step('W02 one shotgun trigger is one shot batch with six real pellets', async () => {
    await page.evaluate(() => window.__bincovSample.driver.weapon('shotgun')); await frames(page, 3); await clearEvents(page);
    await page.mouse.click(1100, 330); await frames(page, 4);
    const shots = (await events(page, 'shot')).filter(e => e.detail.shooter === 'player');
    assert.equal(shots.length, 1); assert.equal(shots[0].detail.pellets.length, 6);
    return { pellets: shots[0].detail.pellets.length };
  });
  await step('W03 holding E toggles the door exactly once; the event is committed', async () => {
    await page.evaluate(() => window.__bincovSample.driver.weapon('pistol'));
    await place(page, 464, 432, -Math.PI / 2); await frames(page, 4); await clearEvents(page);
    assert.equal((await now(page)).doors['resident-front'], false);
    await page.keyboard.down('e'); await wait(1000); await page.keyboard.up('e'); await frames(page, 3);
    const doors = await events(page, 'door');
    assert.equal(doors.length, 1); assert.equal(doors[0].durability, 'committed'); assert.equal((await now(page)).doors['resident-front'], true);
    return doors[0];
  });
  await step('W04 failed door write rolls back, shows retry, and the retried ticket commits once', async () => {
    await clearEvents(page); await failWrites(page);
    await page.keyboard.press('e'); await frames(page, 4);
    const failed = await now(page), rejected = await events(page, 'rejected');
    assert.equal(failed.doors['resident-front'], true, 'door state unchanged'); assert.equal((await events(page, 'door')).length, 0);
    assert.ok(rejected.length >= 1); assert.equal(failed.phase, 'paused'); assert.equal(failed.panel, 'pause');
    assert.ok(await page.locator('[data-do="retry-save"]').isVisible());
    await restoreWrites(page); await page.locator('[data-do="retry-save"]').click(); await frames(page, 4);
    const after = await now(page);
    assert.equal(after.doors['resident-front'], false); assert.equal(after.panel, null);
    return { rejected: rejected.map(r => r.detail), door: after.doors['resident-front'] };
  });
  await step('W05 Esc pause freezes time; after resume a still-held key needs release and re-press', async () => {
    await place(page, 640, 456, 0); await frames(page, 3);
    await page.keyboard.down('d'); await wait(200);
    await page.keyboard.press('Escape'); await frames(page, 2);
    const a = (await now(page)).stamp.simulationTime; await wait(500); const b = (await now(page)).stamp.simulationTime;
    await page.locator('[data-do="resume"]').click(); await frames(page, 3);
    const x1 = (await now(page)).player.x; await wait(400); const x2 = (await now(page)).player.x;
    await page.keyboard.up('d'); await page.keyboard.down('d'); await wait(300); const x3 = (await now(page)).player.x; await page.keyboard.up('d');
    assert.equal(a, b); assert.ok(Math.abs(x2 - x1) < .5); assert.ok(x3 > x2 + 5);
    return { frozen: [a, b], x: [x1, x2, x3] };
  });
  await step('W06 loot panel blocks input while the world runs; taking an item is one committed transfer', async () => {
    const crate = await page.evaluate(() => { const f = window.__bincovSample.host.lastBatch.frame;
      return f.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0]; });
    assert.ok(crate, 'a crate with items exists');
    await place(page, crate.x, crate.y + 12, -Math.PI / 2); await frames(page, 4);
    const target = (await now(page)).interaction; assert.equal(target?.kind, 'container');
    await clearEvents(page); await page.keyboard.press('e'); await frames(page, 4);
    const t0 = await now(page); assert.equal(t0.panel, 'loot'); assert.equal(t0.phase, 'blocked');
    // Shift stands for the gameplay keys here: a movement key would leave the loot window (issue #26 F13, test:loot).
    await page.keyboard.down('Shift'); await wait(400); const t1 = await now(page); await page.keyboard.up('Shift');
    assert.ok(t1.stamp.simulationTime > t0.stamp.simulationTime); assert.ok(Math.abs(t1.player.y - t0.player.y) < .5);
    await page.locator('[data-panel] [data-grid="container"] .item').first().click(); await page.locator('[data-do="inv-quick"]').click(); await frames(page, 4);
    const looted = (await events(page, 'looted')).filter(e => e.durability === 'committed');
    assert.equal(looted.length, 1);
    await page.keyboard.press('Tab'); await frames(page, 3);
    assert.equal((await now(page)).panel, null); assert.equal((await now(page)).phase, 'running');
    return { crate: crate.name, looted: looted[0].detail, choices: target.choices.length };
  });
  // --- Inventory, loot, map, reading and HUD panels: native pointer/keyboard operations only. ---
  const bagItems = (page, src = 'bag') => page.evaluate(s => window.__bincov.app.loadout[s].items.map(i => ({ uid: i.uid, id: i.id, qty: i.qty, x: i.x, y: i.y, rotated: !!i.rotated })), src);
  const cellBox = (page, grid, x, y) => page.evaluate(([g, x, y]) => { const el = document.querySelector(`[data-panel] [data-grid="${g}"]`), r = el.getBoundingClientRect(), c = Number(el.dataset.cell); return { x: r.left + x * c, y: r.top + y * c, c }; }, [grid, x, y]);
  const itemEl = (page, uid) => page.locator(`[data-panel] .item[data-uid="${uid}"]`);
  // Grab 6 px inside the item's top-left corner and release 6 px inside the target cell, so the ghost lands on that cell.
  async function dragItem(page, uid, grid, x, y) {
    const from = await itemEl(page, uid).boundingBox(), to = await cellBox(page, grid, x, y);
    await page.mouse.move(from.x + 6, from.y + 6); await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 3 }); await page.mouse.move(to.x + 6, to.y + 6, { steps: 6 });
    const preview = await page.locator('[data-panel] .drop-preview').count();
    await page.mouse.up(); await frames(page, 2);
    return preview;
  }
  await step('U01 inventory: mouse drag moves a bag item to the exact cell with a live drop preview', async () => {
    await page.keyboard.press('Tab'); await frames(page, 3);
    assert.equal((await now(page)).panel, 'inventory'); assert.equal((await now(page)).phase, 'blocked');
    const water = (await bagItems(page)).find(i => i.id === 'water');
    const preview = await dragItem(page, water.uid, 'bag', 4, 3);
    const moved = (await bagItems(page)).find(i => i.uid === water.uid);
    assert.equal(preview, 1); assert.deepEqual([moved.x, moved.y], [4, 3]);
    return { from: [water.x, water.y], to: [moved.x, moved.y] };
  });
  await step('U02 inventory: rotate turns a 3x1 carbine (in place, or through the rotated placement preview when it does not fit); fixture item added through the real save session', async () => {
    await page.keyboard.press('Tab'); await frames(page, 2);
    const added = await page.evaluate(() => window.__bincov.saveSession.mutate(() => { window.__bincov.app.loadout.bag.items.push({ uid: 'bc-fixture-carbine', id: 'carbine', qty: 1, x: 0, y: 4 }); }));
    assert.equal(added, 'committed', await page.evaluate(() => window.__bincov.app.storageError));
    await page.keyboard.press('Tab'); await frames(page, 3);
    const before = await itemEl(page, 'bc-fixture-carbine').boundingBox();
    await itemEl(page, 'bc-fixture-carbine').click(); await page.locator('[data-do="inv-rotate"]').click(); await frames(page, 2);
    // Standing 1x3 at the bottom row does not fit, so the panel switches to the rotated placement preview.
    const preview = await page.locator('[data-panel] [data-grid="bag"] .placement-cell').count();
    // Placement cells are visual only (pointer-events: none): click the grid at the first valid cell.
    if (preview) { const c = await page.locator('[data-panel] [data-grid="bag"] .placement-cell').first().boundingBox(); await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2); await frames(page, 2); }
    const after = await itemEl(page, 'bc-fixture-carbine').boundingBox(), item = (await bagItems(page)).find(i => i.uid === 'bc-fixture-carbine');
    assert.equal(item.rotated, true); assert.ok(before.width > before.height && after.height > after.width);
    assert.ok(preview > 0);
    return { before: [before.width, before.height], after: [after.width, after.height], at: [item.x, item.y], previewCells: preview };
  });
  await step('U03 inventory: split 5 of 24 rounds into the safe; the remainder stays in the bag stack', async () => {
    const ammo = (await bagItems(page)).find(i => i.id === 'ammo9');
    await itemEl(page, ammo.uid).click(); await page.locator('[data-split]').fill('5'); await page.locator('[data-do="inv-split"]').click(); await frames(page, 2);
    const cells = await page.locator('[data-panel] [data-grid="safe"] .placement-cell').count();
    const to = await cellBox(page, 'safe', 0, 0); await page.mouse.click(to.x + to.c / 2, to.y + to.c / 2); await frames(page, 2);
    const bag = (await bagItems(page)).find(i => i.uid === ammo.uid), safe = await bagItems(page, 'safe');
    assert.ok(cells > 0); assert.equal(bag.qty, 19); assert.equal(safe.length, 1); assert.equal(safe[0].id, 'ammo9'); assert.equal(safe[0].qty, 5);
    return { bag: bag.qty, safe: safe[0].qty, placementCells: cells };
  });
  await step('U04 inventory: quick transfer moves the safe stack back and merges it into the bag stack', async () => {
    const safe = (await bagItems(page, 'safe'))[0];
    await itemEl(page, safe.uid).click(); await page.locator('[data-do="inv-quick"]').click(); await frames(page, 2);
    const ammo = (await bagItems(page)).filter(i => i.id === 'ammo9');
    assert.equal((await bagItems(page, 'safe')).length, 0); assert.deepEqual(ammo.map(i => i.qty), [24]);
    return { bag: ammo[0].qty };
  });
  await step('U05 inventory: a failed write rolls the move back and opens the original save-failure retry', async () => {
    const water = (await bagItems(page)).find(i => i.id === 'water');
    await failWrites(page);
    await dragItem(page, water.uid, 'bag', 5, 1); await frames(page, 4);
    const after = (await bagItems(page)).find(i => i.uid === water.uid), s = await now(page);
    await restoreWrites(page);
    assert.deepEqual([after.x, after.y], [water.x, water.y]); assert.equal(s.panel, 'pause');
    await page.locator('[data-do="retry-save"]').click(); await frames(page, 4);
    const r = await now(page); assert.equal(r.panel, null); assert.equal(r.phase, 'running');
    return { kept: [after.x, after.y], panel: s.panel };
  });
  await step('U06 loot: click-to-place puts a container item on the chosen cell through one committed transfer', async () => {
    const crate = await page.evaluate(() => { const f = window.__bincovSample.host.lastBatch.frame;
      return f.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0]; });
    await place(page, crate.x, crate.y + 12, -Math.PI / 2); await frames(page, 4);
    await clearEvents(page); await page.keyboard.press('e'); await frames(page, 4);
    assert.equal((await now(page)).panel, 'loot');
    const first = page.locator('[data-panel] [data-grid="container"] .item').first(), uid = await first.getAttribute('data-uid');
    await first.click(); await page.locator('[data-do="inv-place"]').click(); await frames(page, 2);
    const grid = (await page.locator('[data-panel] [data-grid="safe"] .placement-cell').count()) ? 'safe' : 'bag';
    const cell = await page.locator(`[data-panel] [data-grid="${grid}"] .placement-cell`).last().boundingBox(), box = await cellBox(page, grid, 0, 0);
    const target = { x: Math.round((cell.x - box.x) / box.c), y: Math.round((cell.y - box.y) / box.c) };
    await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2); await frames(page, 4);
    const placed = (await bagItems(page, grid)).find(i => i.x === target.x && i.y === target.y);
    const looted = (await events(page, 'looted')).filter(e => e.durability === 'committed');
    assert.ok(placed, 'item on the chosen cell'); assert.equal(looted.length, 1);
    await page.keyboard.press('e'); await frames(page, 3); assert.equal((await now(page)).panel, null);
    return { uid, grid, target, item: placed.id };
  });
  await step('U07 map: M opens the floor map (blocked, time runs), floor tabs switch, an exit choice drives the HUD guide', async () => {
    await place(page, 640, 456, 0, 'coast'); await frames(page, 3);
    await page.keyboard.press('m'); await frames(page, 3);
    const s0 = await now(page); assert.equal(s0.panel, 'map'); assert.equal(s0.phase, 'blocked');
    const tabs = await page.locator('[data-panel] [data-do="map-floor"]').count();
    await page.locator('[data-panel] [data-do="map-floor"]').nth(1).click();
    const current = await page.locator('[data-panel] [data-do="map-floor"][aria-current]').getAttribute('data-id');
    const exit = await page.locator('[data-panel] [data-exit] option').nth(1).getAttribute('value');
    await page.locator('[data-panel] [data-exit]').selectOption(exit); await wait(300);
    const t = await now(page); assert.ok(t.stamp.simulationTime > s0.stamp.simulationTime);
    await page.keyboard.press('m'); await frames(page, 6);
    const nav = await page.locator('[data-exit-nav]').textContent();
    assert.ok(tabs >= 3); assert.notEqual(current, 'coast'); assert.ok(nav.startsWith(exit), nav); assert.equal((await now(page)).phase, 'running');
    return { tabs, current, exit, nav };
  });
  await step('U08 reading: E on a note opens its text in the reading panel; E closes it', async () => {
    const note = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.notes.find(n => n.title === '市场停业告示'));
    await place(page, note.at.x, note.at.y + 14, -Math.PI / 2); await frames(page, 4);
    assert.equal((await now(page)).interaction?.kind, 'note');
    await page.keyboard.press('e'); await frames(page, 6);
    const s = await now(page), title = await page.locator('[data-panel] h2').textContent(), text = await page.locator('[data-panel] .cs-reading').textContent();
    assert.equal(s.panel, 'reading'); assert.equal(s.phase, 'blocked'); assert.equal(title, note.title); assert.ok(text.length > 10);
    await page.keyboard.press('e'); await frames(page, 3); assert.equal((await now(page)).panel, null); assert.equal((await now(page)).phase, 'running');
    return { title, chars: text.length };
  });
  await step('U09 HUD: stamina, status/weight, exit guide, quest count and key hints are filled from the frame', async () => {
    await frames(page, 30);
    const h = await page.evaluate(() => { const q = s => document.querySelector(`.coast-sample ${s}`); return { st: q('[data-st-text]').textContent, state: q('[data-state]').textContent, nav: q('[data-exit-nav]').textContent, quests: q('[data-quest-count]').textContent, keys: q('.cs-keys')?.textContent ?? '' }; });
    assert.match(h.st, /^\d+$/); assert.match(h.state, /kg/); assert.ok(h.nav.length > 2); assert.ok(h.quests.length > 0); assert.match(h.keys, /地图/);
    return h;
  });
  await step('W07 canvas offset: pointer -> chest plane -> logic angle matches an independent recomputation', async () => {
    await place(page, 640, 456, 0); await page.addStyleTag({ content: '.coast-sample .cs-canvas{inset:60px 0 0 90px !important}' }); await wait(300);
    await page.mouse.move(400, 200); await wait(900);
    const probe = await page.evaluate(() => {
      const h = window.__bincovSample.host, v = h.view, c = document.querySelector('.coast-sample canvas'), r = c.getBoundingClientRect(), p = h.lastBatch.frame.player;
      const wx = (400 - r.left) * (c.width / r.width) / v.view.s + v.cam.x, wy = (200 - r.top) * (c.height / r.height) / v.view.s + v.cam.y;
      return { aim: p.aim, expect: Math.atan2(wy + 22 - p.y, wx - p.x), rect: [r.left, r.top, r.width, r.height] };
    });
    await page.addStyleTag({ content: '.coast-sample .cs-canvas{inset:0 !important}' }); await wait(200);
    assert.ok(Math.abs(probe.aim - probe.expect) < .01 && Math.abs(probe.aim) > .1); assert.deepEqual(probe.rect, [90, 60, 1190, 660]);
    return probe;
  });
  await step('W08 unrevealed interior hides enemies; revealing the room shows them', async () => {
    const uid = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.alive).uid);
    await page.evaluate(([uid]) => { const d = window.__bincovSample.driver; d.door('resident-front', false); d.placeEnemy(uid, { x: 368, y: 336 }); }, [uid]);
    await place(page, 464, 440, -Math.PI / 2); await frames(page, 4);
    const hidden = await page.evaluate(u => window.__bincovSample.host.view.actorShown(u), uid);
    await place(page, 464, 330, Math.PI); await frames(page, 6);
    const shown = await page.evaluate(u => window.__bincovSample.host.view.actorShown(u), uid);
    assert.equal(hidden, false); assert.equal(shown, true);
    return { uid, hidden, shown };
  });
  await step('V01 a corpse killed in an unrevealed room adds 0 changed pixels (closed, reopened-and-closed, rebuilt, after a floor change); reveal shows it', async () => {
    const probe = (compare, leak = false) => roomPixels(page, compare, leak);
    const state = () => page.evaluate(id => { const h = window.__bincovSample.host, f = h.lastBatch.frame; return { revealed: f.revealed[id] === true, hiddenFx: h.view.hiddenFx, error: window.__bincov.app.storageError }; }, ROOM_ID);
    const pause = async on => { await page.evaluate(on => on ? window.__bincovSample.host.pause('overlay') : window.__bincovSample.host.resume(), on); await frames(page, 4); };
    const enemies = (await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.filter(a => a.alive).map(a => a.uid))).slice(1);
    const door = open => page.evaluate(o => window.__bincovSample.driver.door('resident-front', o), open);
    const conditions = [
      ['closed', async () => { await door(false); await place(page, 464, 440, -Math.PI / 2, 'coast'); }],
      ['reopened-and-closed', async () => { await door(true); await frames(page, 4); await door(false); await place(page, 464, 448, -Math.PI / 2, 'coast'); }],
      ['rebuilt', async () => { await place(page, 464, 448, -Math.PI / 2, 'coast'); }],
      ['after-floor-change', async () => { await place(page, 304, 80, Math.PI / 2, 'resident-f2'); await frames(page, 6); await place(page, 464, 448, -Math.PI / 2, 'coast'); }],
    ];
    const results = [];
    for (const [i, [name, setup]] of conditions.entries()) {
      const uid = enemies[i];
      await page.evaluate(u => window.__bincovSample.driver.placeEnemy(u, { x: 104, y: 860 }), uid);
      await setup(); await frames(page, 8); await pause(true);
      await probe(false); const before = await state();
      // Use the same body-valid cell in the unrevealed room for all four lifecycle conditions.
      await page.evaluate(u => { const d = window.__bincovSample.driver; d.placeEnemy(u, { x: 368, y: 336 }); d.kill(u); }, uid);
      await frames(page, 6);
      const hidden = await probe(true), after = await state(), shown = await page.evaluate(u => window.__bincovSample.host.view.actorShown(u), uid);
      const control = i === 0 ? await probe(true, true) : null;
      await pause(false);
      assert.equal(before.revealed, false, name); assert.equal(after.revealed, false, name); assert.equal(hidden.changed, 0, name);
      assert.ok(after.hiddenFx >= before.hiddenFx + 14, name); assert.equal(shown, false, name); assert.equal(after.error, '', name);
      if (control) assert.ok(control.changed > 0, 'forcing the hidden decals visible must change pixels');
      results.push({ name, changed: hidden.changed, hiddenFx: after.hiddenFx, ...(control ? { controlChanged: control.changed } : {}) });
    }
    await place(page, 464, 330, Math.PI, 'coast'); await frames(page, 8);
    const revealed = await state(), corpse = await page.evaluate(u => window.__bincovSample.host.view.actorShown(u), enemies[0]);
    assert.equal(revealed.revealed, true); assert.equal(revealed.hiddenFx, 0); assert.equal(corpse, true);
    return { results, revealed: revealed.hiddenFx };
  });
  await step('V02 held carbine facing away stays inside the body: 0 weapon pixels above the head for N/NE/NW; side views still show it', async () => {
    // Same frame presented twice at a fixed camera, with and without the weapon sprite; pixels of the composited target
    // that differ are the weapon's. `full` restores the old unshortened length as the positive control.
    const AWAY = { NE: -Math.PI / 4, N: -Math.PI / 2, NW: -3 * Math.PI / 4 }, SIDE = { E: 0, W: Math.PI, SE: Math.PI / 4, S: Math.PI / 2 };
    const weaponPixels = (full = false) => page.evaluate(full => {
      const h = window.__bincovSample.host, v = h.view, p = h.lastBatch.frame.player, g = v.actors.get(p.uid); h.app.ticker.stop();
      const grab = weapon => {
        // present() renders the world target itself, so the weapon is adjusted from a hook that runs before that.
        const xray = v.updateXray;
        v.updateXray = function (...a) { xray.apply(this, a); if (full) g.weapon.scale.x = 1; g.weapon.visible = weapon; g.wrim.visible = false; };
        v.time = 1; v.shake = 0; v.present({ ...h.lastBatch, events: [] }, 0); delete v.updateXray; h.app.render();
        const { pixels, width } = h.app.renderer.extract.pixels(v.upRT), k = v.view.k;
        // Columns +-24 px around the player, rows from 60 px above the feet to the feet; row index 0 is 60 px up.
        const x0 = Math.round((p.x - 24 - v.cam.x) * k), y0 = Math.round((p.y - 60 - v.cam.y) * k), n = Math.round(48 * k), m = Math.round(60 * k);
        const rows = []; for (let y = 0; y < m; y++) rows.push(pixels.slice(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x0 + n) * 4));
        return rows;
      };
      const a = grab(true), b = grab(false), k = v.view.k, head = Math.round((60 - 39) * k);
      let above = 0, total = 0;
      a.forEach((row, y) => { for (let i = 0; i < row.length; i += 4) if (row[i] !== b[y][i] || row[i + 1] !== b[y][i + 1] || row[i + 2] !== b[y][i + 2]) { total++; if (y < head) above++; } });
      h.app.ticker.start();
      return { above, total };
    }, full);
    await page.evaluate(() => window.__bincovSample.driver.weapon('carbine'));
    const result = {};
    for (const [name, angle] of Object.entries({ ...AWAY, ...SIDE })) {
      // The aim follows the pointer, so the pointer is moved along the same direction from the screen centre.
      await place(page, 640, 456, angle, 'coast'); await page.mouse.move(640 + Math.cos(angle) * 220, 360 + Math.sin(angle) * 220); await frames(page, 12);
      const aim = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.player.aim);
      assert.ok(Math.abs(Math.atan2(Math.sin(aim - angle), Math.cos(aim - angle))) < .2, `${name}: aim ${aim}`);
      result[name] = { aim: +aim.toFixed(3), ...await weaponPixels() };
      if (name === 'N') result.controlN = await weaponPixels(true);
    }
    for (const name of Object.keys(AWAY)) assert.equal(result[name].above, 0, `${name}: weapon above the head`);
    for (const name of ['E', 'W']) assert.ok(result[name].total > 20, `${name}: side view shows the gun`);
    assert.ok(result.controlN.above > 0, 'an unshortened carbine aimed north must reach above the head');
    return result;
  });
  await step('W09 stairs: entering upstairs and the basement commits, raises epoch and rebuilds the view', async () => {
    await place(page, 560, 272, -Math.PI / 2); await frames(page, 3); const a = await now(page);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'resident-f2'); await frames(page, 3);
    const b = await now(page);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'coast'); await frames(page, 3);
    await place(page, 496, 272, -Math.PI / 2); await frames(page, 3);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'resident-b1'); await frames(page, 3);
    const c = await now(page);
    await page.screenshot({ path: resolve(out, 'check-basement-1280x720.png') });
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'coast'); await frames(page, 3);
    assert.equal(b.stamp.epoch, a.stamp.epoch + 1); assert.ok(b.rebuilds > a.rebuilds); assert.equal(c.map, 'resident-b1');
    return { epochs: [a.stamp.epoch, b.stamp.epoch, c.stamp.epoch], rebuilds: [a.rebuilds, b.rebuilds, c.rebuilds] };
  });
  await step('W10 refresh restores the committed checkpoint into a paused sample host', async () => {
    await place(page, 640, 456, 0); await frames(page, 3);
    const saved = await page.evaluate(() => window.__bincovSample.host.services.checkpoint());
    const before = await now(page);
    await page.reload(); await action(page, 'enter').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
    const after = await now(page);
    assert.equal(saved, true); assert.equal(after.panel, 'pause'); assert.equal(after.map, before.map);
    assert.deepEqual([after.player.x, after.player.y], [before.player.x, before.player.y]);
    await page.locator('[data-do="resume"]').click(); await page.evaluate(() => window.__bincovSample.driver.freezeAI(true)); await frames(page, 3);
    return { position: [after.player.x, after.player.y], epoch: after.stamp.epoch };
  });
  await step('W11 20 view remounts on the live Runtime keep listeners, tickers, apps, canvases, atlas and GPU textures flat', async () => {
    const first = await page.evaluate(() => window.__bincovSample.counts());
    const firstTables = await managed(page);
    await page.evaluate(() => window.__bincovSample.remount(20)); await frames(page, 5);
    const last = await page.evaluate(() => window.__bincovSample.counts());
    for (const k of ['listeners', 'tickers', 'observers', 'apps', 'parked', 'views', 'renderTextures', 'liveViews', 'canvases', 'sampleRoots', 'atlasPages', 'largeTextures', 'gpuTextures']) assert.equal(last[k], first[k], k);
    // R7-F20-FE-01: each park rebuilds Pixi's GC-managed hashes without the released entries' null placeholders, so
    // twenty remounts leave no more placeholders than one, and the live entries are the same set size.
    assert.ok(last.managedEmpty <= first.managedEmpty, `placeholders ${first.managedEmpty} -> ${last.managedEmpty}`);
    assert.equal(last.managedLive, first.managedLive, 'live managed entries');
    const lastTables = await managed(page);
    for (const table of lastTables.tables) { const before = firstTables.tables.find(t=>t.name===table.name); assert(before, table.name); assert.equal(table.live,before.live,table.name+' live'); assert(table.empty<=before.empty,table.name+' null slots'); }
    assert.equal(lastTables.live,last.managedLive); assert.equal(lastTables.empty,last.managedEmpty);
    // R7-F20-FE-02: Pixi's event system is detached, so the real mouse input of the earlier steps (drags, clicks, aim)
    // left no native event in its pooled federated events.
    const events = await page.evaluate(() => { const e = window.__bincovSample.host.app.renderer.events; return { attached: !!e.domElement, root: e._rootPointerEvent?.nativeEvent ?? null, wheel: e._rootWheelEvent?.nativeEvent ?? null, menu: e._rootContextMenuEvent?.nativeEvent ?? null }; });
    assert.deepEqual(events, { attached: false, root: null, wheel: null, menu: null });
    const eventContract = await pixiEvents(page); assert.equal(eventContract.attached,false); assert.equal(eventContract.native,0); assert(Object.values(eventContract.roots).every(v=>!v));
    return { first, last, events, firstTables, lastTables, eventContract };
  });
  await step('W11b the renderer is reused across remounts; a lost context is replaced by a fresh renderer on the next mount', async () => {
    const r = await page.evaluate(async () => {
      const s = window.__bincovSample, app0 = s.host.app;
      await s.remount(1); const reused = s.host.app === app0;
      // Lose the live context, then remount: parking keeps the lost renderer, taking it must replace it.
      const app1 = s.host.app; app1.renderer.gl.getExtension('WEBGL_lose_context').loseContext();
      await new Promise(r => setTimeout(r, 100));
      await s.remount(1); await new Promise(r => setTimeout(r, 300));
      const app2 = s.host.app;
      return { reused, replaced: app2 !== app1, lost: app2.renderer.gl.isContextLost(), counts: s.counts(), frames: s.host.stats.frames };
    });
    // The loss paused the shared Runtime (as in play); the test remount kept that Runtime, so resume it here.
    const paused = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.phase);
    await page.evaluate(() => window.__bincovSample.host.resume()); await frames(page, 6);
    const frames2 = await page.evaluate(() => window.__bincovSample.host.stats.frames), phase = (await now(page)).phase;
    assert.equal(paused, 'paused'); assert.equal(phase, 'running');
    assert.equal(r.reused, true); assert.equal(r.replaced, true); assert.equal(r.lost, false);
    assert.equal(r.counts.apps, 1); assert.equal(r.counts.parked, 0); assert.ok(frames2 > r.frames);
    return { ...r, paused, frames2, phase };
  });
  await step('W12 extraction holds 3 s; a failed settlement write keeps the raid and retries into the result screen', async () => {
    await place(page, 208, 122, Math.PI / 2); await frames(page, 4);
    assert.equal((await now(page)).interaction?.kind, 'exit');
    await page.keyboard.down('e'); await wait(2400); const mid = (await now(page)).interaction?.hold?.progress; await page.keyboard.up('e'); await frames(page, 3);
    const reset = (await now(page)).interaction?.hold?.progress;
    await failSettlementWrites(page);
    await page.keyboard.down('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'ending', null, { timeout: 8000 }); await page.keyboard.up('e');
    await frames(page, 4);
    const retry = await page.locator('[data-do="retry-settlement"]').isVisible(), pending = await page.evaluate(() => !!window.__bincov.app.pendingSettlement);
    // The reason (R6-L1) survives the failed write: the retry panel already names the ending being saved.
    const failed = await page.evaluate(() => { const s = window.__bincovSample.host.services.settlement(); return { reason: s.reason, committed: s.committed, title: document.querySelector('[data-ending-title]')?.textContent }; });
    await page.evaluate(()=>{ window.__solGateRenderer=window.__bincovSample.host.app.renderer; });
    await restoreWrites(page); await page.locator('[data-do="retry-settlement"]').click();
    // A committed result can precede the host's next presentation frame; wait for the curtain itself.
    await page.waitForFunction(() => document.querySelector('.coast-sample')?.dataset.outro === 'extract');
    const curtain = await page.evaluate(() => ({ outro: document.querySelector('.coast-sample')?.dataset.outro ?? null, text: document.querySelector('.coast-sample [data-curtain-text]')?.textContent ?? null }));
    await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'));
    const end = await page.evaluate(() => ({ state: window.__bincov.app.state, outcome: window.__bincov.app.result?.outcome, pending: !!window.__bincov.app.pendingSettlement, counts: window.__bincovSample.counts(), sample: !!window.__bincov.app.coastSample }));
    assert.ok(mid > 2 && mid < 3); assert.equal(reset, 0); assert.equal(retry, true); assert.equal(pending, true);
    assert.deepEqual(failed, { reason: 'extract', committed: false, title: '撤离成功 · 正在保存结算' });
    assert.deepEqual(curtain, { outro: 'extract', text: '撤离成功' });
    assert.equal(end.outcome, 'extract'); assert.equal(end.pending, false); assert.equal(end.sample, false);
    for (const k of ['listeners', 'tickers', 'apps', 'views', 'renderTextures', 'liveViews', 'sampleRoots']) assert.equal(end.counts[k], 0, k);
    // Parked after a real settlement: no null placeholders left in the renderer's managed hashes (R7-F20-FE-01).
    assert.equal(end.counts.parked, 1); assert.equal(end.counts.managedEmpty, 0, 'placeholders left on the parked renderer');
    const parkedTables = await page.evaluate(source => (0,eval)('('+source+')')(window.__solGateRenderer),readManagedTables.toString());
    assert.equal(parkedTables.empty,0); assert.equal(parkedTables.live,end.counts.managedLive);
    const parkedEvents = await page.evaluate(source => (0,eval)('('+source+')')(window.__solGateRenderer),readPixiEvents.toString());
    assert.equal(parkedEvents.attached,false); assert.equal(parkedEvents.native,0); assert(Object.values(parkedEvents.roots).every(v=>!v));
    await page.evaluate(()=>{delete window.__solGateRenderer;});
    return { mid, reset, failed, curtain, ...end, parkedTables, parkedEvents };
  });
  await step('W13 a second run abandons through the pause menu and settles as a failure; the outro says 已放弃行动, not 你倒下了', async () => {
    await action(page, 'return').click(); await deploy(page, { enter: false });
    await page.keyboard.press('Escape'); await frames(page, 2);
    await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
    await page.waitForFunction(() => document.querySelector('.coast-sample')?.dataset.outro === 'abandon');
    const curtain = await page.evaluate(() => ({ reason: window.__bincovSample.host.services.settlement().reason, outro: document.querySelector('.coast-sample')?.dataset.outro ?? null, text: document.querySelector('.coast-sample [data-curtain-text]')?.textContent ?? null }));
    await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'));
    const r = await page.evaluate(() => ({ outcome: window.__bincov.app.result?.outcome, counts: window.__bincovSample.counts() }));
    assert.equal(r.outcome, 'death', 'abandon settles under the original failure rules'); assert.equal(r.counts.apps, 0);
    assert.deepEqual(curtain, { reason: 'abandon', outro: 'abandon', text: '已放弃行动' });
    return { ...r, curtain };
  });
  await context.close();
}
// Real Runtime deaths (driver.kill -> damageEnemy, so hurt/death events, kills and the corpse container are the game's own)
// watched from inside the view: the real present runs unchanged and each watched actor's graphics are read after it.
// Nothing primes deathT, injects or reorders events, or removes corpses. `strip` also crops the composited target through
// one actor's fall. Pixel readbacks stall software renderers, so V03 records natural frames separately and advances its
// pixel contract at an explicit 1/60s view delta with the automatic ticker stopped. Runtime kills and events remain real.
const watchDeaths = (page, uids, strip = null) => page.evaluate(([uids, strip]) => {
  const h = window.__bincovSample.host, v = h.view, present = Object.getPrototypeOf(v).present, log = window.__deaths = { rows: [], crops: [], hold: false };
  v.present = function (batch, dt) {
    const rebuilds = this.stats.rebuilds; present.call(this, batch, dt);
    for (const uid of uids) {
      const a = [batch.frame.player, ...batch.frame.actors].find(x => x.uid === uid), g = this.actors.get(uid); if (!a || !g) continue;
      log.rows.push({ uid, dt, alive: a.alive, death: batch.events.some(e => e.type === 'death' && e.uid === uid), rebuilt: this.stats.rebuilds > rebuilds,
        map: batch.stamp.world.mapId, epoch: batch.stamp.epoch, deathT: g.deathT, rotation: g.body.rotation, body: g.body.visible, weapon: g.weapon.visible,
        corpse: !!g.corpse?.visible, hasCorpse: !!g.corpse, corpseKey: g.corpseKey, shown: this.actorShown(uid) });
      const marks = [() => true, () => g.deathT >= .04, () => g.deathT >= .08, () => g.deathT >= .12, () => !!g.corpse, () => g.deathT >= .3];
      if (uid !== strip || a.alive || !marks[log.crops.length]?.()) continue;
      const k = this.view.k, c = document.createElement('canvas'); c.width = c.height = 216; const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false;
      cg.drawImage(h.app.renderer.extract.canvas(this.upRT), Math.round((a.x - 36 - this.cam.x) * k), Math.round((a.y - 56 - this.cam.y) * k), 72 * k, 72 * k, 0, 0, 216, 216);
      log.crops.push({ deathT: g.deathT, rotation: g.body.rotation, corpse: !!g.corpse, canvas: c });
      if (log.crops.length === 3) { log.hold = true; h.app.ticker.stop(); }
    }
  };
}, [uids, strip]);
const endWatch = page => page.evaluate(() => {
  const v = window.__bincovSample.host.view, log = window.__deaths; delete v.present; delete window.__deaths;
  const data = c => c.getContext('2d').getImageData(0, 0, 216, 216).data, base = log.crops[0] && data(log.crops[0].canvas);
  const crops = log.crops.map(c => { const d = data(c.canvas); let changed = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2]) changed++; return { deathT: c.deathT, rotation: c.rotation, corpse: c.corpse, changedFromDeathFrame: changed }; });
  let png = null;
  if (log.crops.length) {
    const s = document.createElement('canvas'); s.width = 216 * log.crops.length; s.height = 240; const g = s.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#111'; g.fillRect(0, 0, s.width, s.height); g.fillStyle = '#fff'; g.font = '13px monospace';
    log.crops.forEach((c, i) => { g.drawImage(c.canvas, i * 216, 24); g.fillText(`deathT ${c.deathT.toFixed(3)}s${c.corpse ? ' corpse' : ''}`, i * 216 + 6, 16); });
    png = s.toDataURL();
  }
  return { rows: log.rows, crops, png };
});
const saveStrip = (w, name) => w.png ? writeFile(resolve(out, name), Buffer.from(w.png.split(',')[1], 'base64')) : null;
const deadGraphics = page => page.evaluate(() => {
  const v = window.__bincovSample.host.view, f = window.__bincovSample.host.lastBatch.frame;
  return f.actors.filter(a => !a.alive).map(a => { const g = v.actors.get(a.uid); return { uid: a.uid, deathT: g.deathT, rotation: g.body.rotation, body: g.body.visible, hasCorpse: !!g.corpse, shown: v.actorShown(a.uid) }; });
});
const noFall = (rows, label) => { for (const r of rows) assert.ok(r.deathT === 0 && r.rotation === 0 && !r.body && !r.weapon, `${label}: ${JSON.stringify(r)}`); };

// Playtest readability (round 5): held-weapon arms, recognisable ground loot, the exit hold ring and the docked panels.
if (!group) {
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await deploy(page);
  await step('V05 readability: arms end on the weapon grip, ground loot uses the item icon, the exit ring draws no stray line, docked loot keeps the player in view', async () => {
    await place(page, 640, 456, 0, 'coast'); await frames(page, 10);
    // Real pointer aim in four directions; the trigger arm must end on the weapon's grip pivot.
    const arms = [];
    for (const t of [0, Math.PI / 2, Math.PI, -Math.PI / 4]) {
      const at = await page.evaluate(t => { const v = window.__bincovSample.host.view, p = window.__bincovSample.host.lastBatch.frame.player, r = document.querySelector('.coast-sample canvas').getBoundingClientRect();
        return { x: r.left + (p.x + Math.cos(t) * 120 - v.cam.x) * v.view.s / v.view.dpr, y: r.top + (p.y - 22 + Math.sin(t) * 120 - v.cam.y) * v.view.s / v.view.dpr }; }, t);
      await page.mouse.move(at.x, at.y); await frames(page, 6);
      arms.push(await page.evaluate(() => { const v = window.__bincovSample.host.view, g = v.actors.get('player'), a = g.arms[0];
        return { gap: Math.hypot(a.x + Math.cos(a.rotation) * a.scale.x - g.weapon.x, a.y + Math.sin(a.rotation) * a.scale.x - g.weapon.y), visible: a.visible, weapon: g.weapon.visible, len: a.scale.x }; }));
    }
    for (const a of arms) { assert.ok(a.gap < .01, `arm reaches the grip: ${JSON.stringify(a)}`); assert.equal(a.visible, a.weapon); }
    const loot = await page.evaluate(() => { const v = window.__bincovSample.host.view; return [...v.loot.values()].slice(0, 20).map(s => [s.texture.width, s.texture.height]); });
    assert.ok(loot.length > 0 && loot.every(([w, h]) => w === 28 && h === 27), `ground loot uses the 24 px item icon plate: ${JSON.stringify(loot.slice(0, 3))}`);
    // Exit hold: the progress ring must stay inside its own circle (no line from the world origin).
    await place(page, 208, 120, Math.PI / 2, 'coast'); await frames(page, 6);
    await page.keyboard.down('e'); await wait(900);
    const ring = await page.evaluate(() => { const v = window.__bincovSample.host.view, b = v.exitG.getLocalBounds(), ex = window.__bincovSample.host.lastBatch.map.exits.find(e => e.id === 'north');
      return { x: b.x, y: b.y, w: b.width, h: b.height, ex: ex.at, progress: window.__bincovSample.host.lastBatch.frame.interaction?.hold?.progress ?? 0 }; });
    await page.keyboard.up('e'); await frames(page, 4);
    assert.ok(ring.progress > 0, 'hold in progress'); assert.ok(ring.w <= 86 && ring.h <= 86 && Math.abs(ring.x + ring.w / 2 - ring.ex.x) < 3, `ring bounds ${JSON.stringify(ring)}`);
    // Docked loot panel: the player is drawn above the panel's top edge.
    const crate = await page.evaluate(() => { const f = window.__bincovSample.host.lastBatch.frame; return f.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0]; });
    await place(page, crate.x - 24, crate.y, 0, 'coast'); await frames(page, 6);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.panel === 'loot'); await frames(page, 40);
    const docked = await page.evaluate(() => { const v = window.__bincovSample.host.view, p = window.__bincovSample.host.lastBatch.frame.player, r = document.querySelector('.coast-sample canvas').getBoundingClientRect();
      return { playerY: r.top + (p.y - v.cam.y) * v.view.s / v.view.dpr, panelTop: document.querySelector('.coast-sample [data-panel]').getBoundingClientRect().top }; });
    await page.screenshot({ path: resolve(out, 'check-loot-docked-1280x720.png') });
    await page.keyboard.press('Escape'); await frames(page, 4);
    assert.ok(docked.playerY < docked.panelTop - 8, `player visible above the docked panel: ${JSON.stringify(docked)}`);
    return { arms, loot: loot.length, ring, docked };
  });
  await context.close();
}

// OPUS-DEATH-01: the shared actor path under both art modes. The player's own death is not driven here (see the round report).
for (const art of ['sol', 'placeholder']) {
  const { context, page } = await open(`?test=1&entry=tabs&sample=village${art === 'placeholder' ? '&art=placeholder' : ''}`);
  await deploy(page);
  const kill = uid => page.evaluate(u => window.__bincovSample.driver.kill(u), uid);
  const putEnemy = (uid, x, y) => page.evaluate(([u, x, y]) => window.__bincovSample.driver.placeEnemy(u, { x, y }), [uid, x, y]);
  const shownNow = uid => page.evaluate(u => window.__bincovSample.host.view.actorShown(u), uid);
  // A standing fixture must be a position the save accepts (bodyFits), or the next checkpoint is rejected.
  const savable = async () => { assert.equal(await page.evaluate(() => window.__bincovSample.host.services.checkpoint()), true, 'fixture positions pass checkpoint validation'); assert.equal(await page.evaluate(() => window.__bincov.app.storageError), ''); };
  await step(`V03 ${art}: a real Runtime kill in view tips the standing body over its feet, weapon gone, before the corpse replaces it`, async () => {
    assert.equal((await page.evaluate(() => window.__bincovSample.counts())).art, art);
    const uid = 'enemy-3'; // a rifleman: the held weapon must leave with the fall
    // Inside the village sample, so the Sol mode draws its own ground around the fall (enemy bodies are procedural in both modes).
    await place(page, 640, 456, 0, 'coast'); await putEnemy('enemy-6', 768, 456); await frames(page, 8); await savable();
    // Observe a separate real kill without GPU readbacks, a stopped ticker or a substituted delta. This observation
    // cannot certify hardware performance; retain its natural fall-frame count even when the pixel contract passes.
    assert.equal(await shownNow('enemy-6'), true, 'the natural observation starts with an enemy in view');
    await watchDeaths(page, ['enemy-6']); await kill('enemy-6'); await frames(page, 20);
    const naturalRows = (await endWatch(page)).rows.filter(r => !r.alive);
    const naturalFallFrames = naturalRows.filter(r => !r.hasCorpse).length;
    const natural = { frames: naturalRows.length, fallFrames: naturalFallFrames, originalMinimumFallFrames: 3, meetsOriginalMinimum: naturalFallFrames >= 3, deltas: naturalRows.map(r => r.dt) };
    await putEnemy(uid, 704, 456); await frames(page, 8); await savable();
    assert.equal(await shownNow(uid), true, 'the enemy stands in view before the kill');
    const previousDelta = await page.evaluate(() => { const t = window.__bincovSample.host.app.ticker; t.stop(); return t.deltaMS; });
    let w;
    try {
      await watchDeaths(page, [uid], uid); await kill(uid);
      for (let i = 0; i < 60; i++) {
        const probe = await page.evaluate(() => {
          const h = window.__bincovSample.host; h.app.ticker.deltaMS = 1000 / 60; h.frame(); h.app.render();
          const d = window.__deaths; return { hold: d.hold, done: d.crops.length === 6 || d.rows.some(r => !r.alive && r.hasCorpse && r.deathT === 0) };
        });
        if (probe.hold) {
          await page.screenshot({ path: resolve(out, `death-midfall-${art}.png`) });
          await page.evaluate(() => { window.__deaths.hold = false; });
        }
        if (probe.done) break;
      }
      await page.screenshot({ path: resolve(out, `death-corpse-${art}.png`) });
      w = await endWatch(page);
    } finally {
      await page.evaluate(delta => { const h = window.__bincovSample.host; delete h.view.present; delete window.__deaths; h.app.ticker.deltaMS = delta; h.app.ticker.start(); }, previousDelta);
    }
    await saveStrip(w, `death-fall-${art}.png`);
    const dead = w.rows.filter(r => !r.alive), first = dead[0], dying = dead.filter(r => !r.hasCorpse), lying = dead.filter(r => r.hasCorpse);
    assert.equal(first.death, true, 'the first dead frame carries the real death event');
    assert.ok(first.deathT > 0 && first.body && !first.weapon && !first.hasCorpse, `the death frame starts the fall, not the corpse: ${JSON.stringify(first)}`);
    assert.ok(dying.length >= 3, `frames of fall: ${dying.length}`);
    assert.equal(dead.indexOf(lying[0]), dying.length, 'the corpse comes after every falling frame, never before');
    dying.forEach((r, i) => { assert.ok(r.body && !r.weapon && r.shown, 'standing body shown, weapon hidden'); if (i) assert.ok(Math.abs(r.rotation) >= Math.abs(dying[i - 1].rotation)); });
    const facing = Number(lying[0].corpseKey.split(':').at(-1));
    assert.ok(dying.every(r => Math.sign(r.rotation) === facing), 'falls toward the side the corpse lies on');
    assert.ok(Math.abs(dying.at(-1).rotation) >= .9, `tipped ${dying.at(-1).rotation} rad before the corpse`);
    assert.ok(lying[0].deathT >= .16 && lying.every(r => r.corpse && !r.body && !r.weapon && r.shown), 'then only the corpse shows');
    assert.equal(w.crops.length, 6); assert.ok(w.crops[3].changedFromDeathFrame > 0 && !w.crops[3].corpse, 'the tipped body renders differently from the death frame');
    await savable();
    return { art, sampling: { controlledViewDelta: 1 / 60, natural }, deathFrame: first, fallFrames: dying.length, rotations: dying.map(r => +r.rotation.toFixed(3)), handoffDeathT: lying[0].deathT, facing, crops: w.crops };
  });
  await step(`V04 ${art}: no fall for a kill in an unrevealed room (0 changed pixels), nor for corpses rebuilt by an epoch, the stairs or a reload`, async () => {
    const hidden = 'enemy-12', indoor = 'enemy-21';
    const pause = async on => { await page.evaluate(on => on ? window.__bincovSample.host.pause('overlay') : window.__bincovSample.host.resume(), on); await frames(page, 4); };
    // Hidden room: the death event arrives, the body never shows and nothing changes on screen. As in V01 the enemy waits
    // outside the view and is moved into the room in the same task as the kill (the room spot is not a valid standing body).
    await page.evaluate(() => window.__bincovSample.driver.door('resident-front', false)); await place(page, 464, 440, -Math.PI / 2, 'coast');
    await putEnemy(hidden, 104, 860); await frames(page, 8); await savable(); await pause(true);
    await roomPixels(page, false);
    await watchDeaths(page, [hidden]); await page.evaluate(u => { const d = window.__bincovSample.driver; d.placeEnemy(u, { x: 368, y: 336 }); d.kill(u); }, hidden); await frames(page, 12);
    const px = await roomPixels(page, true), hiddenRows = (await endWatch(page)).rows.filter(r => !r.alive); await pause(false);
    assert.ok(hiddenRows.some(r => r.death), 'the real death event reached the view'); noFall(hiddenRows, 'hidden kill');
    assert.ok(hiddenRows.every(r => !r.corpse && !r.shown)); assert.equal(px.changed, 0, 'hidden kill changes no pixels');
    await page.screenshot({ path: resolve(out, `death-hidden-${art}.png`) });
    // Reveal by stepping in (placement raises the epoch: a rebuild): the corpse is simply there.
    await watchDeaths(page, [hidden]); await place(page, 464, 330, Math.PI, 'coast'); await frames(page, 10);
    const revealRows = (await endWatch(page)).rows; noFall(revealRows, 'revealed corpse');
    assert.ok(revealRows.some(r => r.rebuilt) && revealRows.at(-1).corpse && revealRows.at(-1).shown, 'the revealed corpse is shown');
    // A visible indoor kill near the stairs falls; after up and down the stairs the rebuilt corpse does not fall again.
    await place(page, 560, 272, -Math.PI / 2, 'coast'); await putEnemy(indoor, 464, 330); await frames(page, 8); await savable();
    assert.equal(await shownNow(indoor), true);
    await watchDeaths(page, [indoor]); await kill(indoor); await wait(400); await frames(page, 2);
    const indoorRows = (await endWatch(page)).rows.filter(r => !r.alive);
    assert.ok(indoorRows[0].death && indoorRows[0].body && indoorRows[0].deathT > 0 && indoorRows.at(-1).corpse, 'the indoor kill in view falls');
    await watchDeaths(page, [indoor]);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'resident-f2'); await frames(page, 3);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'coast'); await frames(page, 10);
    const stairRows = (await endWatch(page)).rows.filter(r => r.map === 'coast' && r.epoch > indoorRows[0].epoch);
    assert.ok(stairRows.length && stairRows[0].rebuilt, 'returned through a rebuild'); noFall(stairRows, 'after the stairs');
    assert.ok(stairRows.every(r => r.corpse && r.shown && !r.death), 'the old corpse is shown at once, with no death event');
    // Reload from the committed checkpoint: a fresh view meets every corpse lying down (deathT never resets, so 0 means never fell).
    assert.equal(await page.evaluate(() => window.__bincovSample.host.services.checkpoint()), true);
    await page.reload(); await action(page, 'enter').click(); await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch); await frames(page, 4);
    const loaded = await deadGraphics(page), logged = await events(page, 'death');
    await page.screenshot({ path: resolve(out, `death-reload-${art}.png`) });
    await page.locator('[data-do="resume"]').click(); await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
    await watchDeaths(page, ['enemy-3', hidden, indoor]); await frames(page, 15);
    const resumed = (await endWatch(page)).rows;
    assert.deepEqual(logged, [], 'loading emits no death event');
    assert.ok([hidden, indoor, 'enemy-3'].every(u => loaded.some(d => d.uid === u)));
    for (const d of loaded) assert.ok(d.deathT === 0 && d.rotation === 0 && !d.body && d.hasCorpse, `loaded corpse: ${JSON.stringify(d)}`);
    assert.equal(loaded.find(d => d.uid === indoor).shown, true, 'the corpse by the stairs is on screen after the load');
    noFall(resumed, 'resumed after the load'); await savable();
    return { hidden: { frames: hiddenRows.length, changed: px.changed }, reveal: revealRows.length, indoorFallFrames: indoorRows.filter(r => !r.hasCorpse).length, stairs: stairRows.length, loaded, resumed: resumed.length };
  });
  await context.close();
}
// Issue #26 F08 gait, aiming east. The view is driven with copies of the live batch whose player carries the aim and
// velocity under test (the V02 pattern: ticker stopped, explicit 0.05 s view delta), so the Runtime, input and save never
// see the fixture. The negative control is this same step run against the pre-F08 build (BINCOV_SAMPLE_HTML pointing
// at the e9cbaa5 dist/index.html), where it must fail; nothing in this step re-derives the old rule from the new build.
{
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await deploy(page);
  await step('F08 gait: backpedalling plays short reversed steps 3,0,1,0 on the aim\'s body; strafing turns the body 45 deg toward the movement (S: SE, N: NE); forward, standing and a fall are unchanged', async () => {
    await page.evaluate(() => window.__bincovSample.driver.weapon('carbine'));
    await place(page, 640, 456, 0, 'coast'); await page.mouse.move(640 + 220, 360); await frames(page, 12);
    const NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    const CASES = { forward: [112, 0], backpedal: [-112, 0], strafeS: [0, 112], strafeN: [0, -112] };
    const result = {};
    await page.evaluate(() => { window.__gaitCrops = []; });
    for (const [name, [vx, vy]] of Object.entries(CASES)) {
      result[name] = await page.evaluate(([name, vx, vy]) => {
        const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, p = b.frame.player, g = v.actors.get(p.uid); h.app.ticker.stop();
        const textures = []; for (let d = 0; d < 8; d++) for (let f = 0; f <= 4; f++) textures.push([d, f, v.tex.actor('player', d, f)]);
        const read = () => { const t = textures.find(e => e[2] === g.body.texture); return t ? [t[0], t[1]] : [-1, -1]; };
        const batch = (vx, vy) => ({ ...b, events: [], frame: { ...b.frame, player: { ...p, aim: 0, vx, vy } } });
        const cam = { ...v.camF }, rows = [], k = v.view.k;
        // A walk starting from a standstill, as the view meets it after any stop (sense is the new field; harmless before).
        v.camF = { ...cam }; v.shake = 0; v.present(batch(0, 0), 0); g.walk = 0; g.sense = 1;
        for (let i = 0; i < 16; i++) {
          v.camF = { ...cam }; v.shake = 0; v.present(batch(vx, vy), .05); h.app.render();
          const [dir, frame] = read(), walk = g.walk, phase = Math.floor(walk);
          rows.push({ walk: +walk.toFixed(3), dir, frame });
          if (rows.length === 1 || phase !== Math.floor(rows.at(-2).walk)) {
            if (window.__gaitCrops.filter(c => c.name === name).length < 4) {
              const c = document.createElement('canvas'); c.width = c.height = 216; const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false;
              cg.drawImage(h.app.renderer.extract.canvas(v.upRT), Math.round((p.x - 36 - v.cam.x) * k), Math.round((p.y - 60 - v.cam.y) * k), 72 * k, 72 * k, 0, 0, 216, 216);
              window.__gaitCrops.push({ name, dir, frame, canvas: c });
            }
          }
        }
        return rows;
      }, [name, vx, vy]);
      // The last frame is still on the canvas (ticker stopped): a full 1280x720 view of the gait.
      if (name === 'backpedal' || name === 'strafeS') await page.screenshot({ path: resolve(out, `gait-${name}-1280x720.png`) });
      // Standing again: the body returns to the aim with the idle frame.
      result[name + 'Stop'] = await page.evaluate(() => {
        const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, p = b.frame.player, g = v.actors.get(p.uid);
        v.present({ ...b, events: [], frame: { ...b.frame, player: { ...p, aim: 0, vx: 0, vy: 0 } } }, .05);
        let found = [-1, -1]; for (let d = 0; d < 8; d++) for (let f = 0; f <= 4; f++) if (v.tex.actor('player', d, f) === g.body.texture) found = [d, f];
        h.app.ticker.start();
        return { dir: found[0], frame: found[1], sense: g.sense ?? null };
      });
    }
    // Killed mid-strafe: the death batch still carries the velocity of the step the player died in. The fall must start
    // on the aim's body (E), as before F08, not on the hip-turned SE body for one frame and then jump to E.
    const killed = await page.evaluate(() => {
      const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, p = b.frame.player, g = v.actors.get(p.uid); h.app.ticker.stop();
      const read = () => { for (let d = 0; d < 8; d++) for (let f = 0; f <= 4; f++) if (v.tex.actor('player', d, f) === g.body.texture) return [d, f]; return [-1, -1]; };
      const batch = (alive, vx, vy) => ({ ...b, events: [], frame: { ...b.frame, player: { ...p, aim: 0, alive, vx, vy } } });
      const cam = { ...v.camF }, rows = [];
      const show = (alive, vx, vy) => { v.camF = { ...cam }; v.shake = 0; v.present(batch(alive, vx, vy), .05); rows.push({ alive, dir: read()[0], frame: read()[1], deathT: +g.deathT.toFixed(3) }); };
      v.camF = { ...cam }; v.present(batch(true, 0, 0), 0); g.walk = 0; g.sense = 1;
      for (let i = 0; i < 4; i++) show(true, 0, 112);
      // The fall starts as the death event starts it in present() (deathT just above 0), still inside FALL_T for both frames.
      g.deathT = .0001; show(false, 0, 112); show(false, 0, 0);
      // Back to the live fixture: no fall, standing on the aim.
      g.deathT = 0; v.camF = { ...cam }; v.present(batch(true, 0, 0), .05); h.app.ticker.start();
      return rows;
    });
    const strip = await page.evaluate(([names]) => {
      const crops = window.__gaitCrops, order = ['forward', 'backpedal', 'strafeS', 'strafeN'];
      const label = { forward: 'forward (move E)', backpedal: 'backpedal (move W)', strafeS: 'strafe (move S)', strafeN: 'strafe (move N)' };
      const s = document.createElement('canvas'); s.width = 170 + 4 * 216; s.height = 28 + order.length * 240; const g = s.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#111'; g.fillRect(0, 0, s.width, s.height); g.fillStyle = '#fff'; g.font = '13px monospace';
      g.fillText('aim E (0 rad); one crop per walk phase, 0.05 s view steps at 112 px/s', 6, 18);
      order.forEach((n, r) => {
        g.fillText(label[n], 6, 28 + r * 240 + 120);
        crops.filter(c => c.name === n).forEach((c, i) => { g.drawImage(c.canvas, 170 + i * 216, 28 + r * 240 + 20); g.fillText(`body ${names[c.dir] ?? '?'} f${c.frame}`, 176 + i * 216, 28 + r * 240 + 14); });
      });
      delete window.__gaitCrops;
      return s.toDataURL();
    }, [NAMES]);
    await writeFile(resolve(out, 'gait-strip.png'), Buffer.from(strip.split(',')[1], 'base64'));
    const runs = rows => rows.map(r => r.frame).filter((f, i, a) => i === 0 || f !== a[i - 1]);
    const back = [3, 0, 1, 0], phase = r => Math.floor(r.walk);
    const summary = Object.fromEntries(Object.keys(CASES).map(n => [n, { dirs: [...new Set(result[n].map(r => NAMES[r.dir] ?? r.dir))], frames: runs(result[n]) }]));
    // Forward: the body stays E and plays the 1-4 cycle, unchanged from before F08.
    assert.ok(result.forward.every(r => r.dir === 0 && r.frame === 1 + phase(r)), `forward ${JSON.stringify(result.forward)}`);
    assert.deepEqual(runs(result.forward), [1, 2, 3, 4, 1]);
    // Backpedal: the body stays on the aim (E) and plays the short reversed steps.
    assert.ok(result.backpedal.every(r => r.dir === 0 && r.frame === back[phase(r)]), `backpedal ${JSON.stringify(result.backpedal)}`);
    assert.deepEqual(runs(result.backpedal), [3, 0, 1, 0, 3]);
    // Strafes: the hips turn one sector toward the movement, with a forward cycle.
    assert.ok(result.strafeS.every(r => r.dir === 1 && r.frame === 1 + phase(r)), `strafe S ${JSON.stringify(result.strafeS)}`);
    assert.ok(result.strafeN.every(r => r.dir === 7 && r.frame === 1 + phase(r)), `strafe N ${JSON.stringify(result.strafeN)}`);
    for (const n of Object.keys(CASES)) assert.deepEqual(result[n + 'Stop'], { dir: 0, frame: 0, sense: 1 }, `${n}: standing again`);
    assert.ok(killed.slice(0, 4).every(r => r.alive && r.dir === 1), `strafing before the death: SE body ${JSON.stringify(killed)}`);
    assert.deepEqual(killed.slice(4).map(r => [r.alive, r.dir, r.frame, r.deathT > 0 && r.deathT < .16]), [[false, 0, 0, true], [false, 0, 0, true]], `killed mid-strafe: the fall stays on the aim's body ${JSON.stringify(killed)}`);
    summary.killedMidStrafe = killed.map(r => `${r.alive ? 'alive' : 'falling'} ${NAMES[r.dir] ?? r.dir} f${r.frame}`);
    return summary;
  });
  await context.close();
}
// Round 6 (experience pass): combat feedback, the exit pointer, the stateless atmosphere and the end-of-run outro.
// Fixtures only place actors, doors and the player; shots, keys and panels are real input.
if (!group) {
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await deploy(page);
  const screenOf = (x, y) => page.evaluate(([x, y]) => { const v = window.__bincovSample.host.view, r = document.querySelector('.coast-sample canvas').getBoundingClientRect(); return { x: r.left + (x - v.cam.x) * v.view.s / v.view.dpr, y: r.top + (y - v.cam.y) * v.view.s / v.view.dpr }; }, [x, y]);
  const marks = () => page.evaluate(() => window.__marks);
  // Fixture positions must be ones the save accepts (bodyFits), or the next checkpoint is rejected.
  const savable = async () => { assert.equal(await page.evaluate(() => window.__bincovSample.host.services.checkpoint()), true, 'fixture positions pass checkpoint validation'); };
  await step('V06 feedback: hits mark the target, the kill marks bigger, a hit in an unrevealed room marks nothing; reload ring; hurt edge rises and fades', async () => {
    await page.evaluate(() => { const h = window.__bincovSample.host, mark = h.mark.bind(h); window.__marks = []; h.mark = (uid, at, kill) => { const p = h.view.worldToClient(at); window.__marks.push({ uid, kill, at, screen: p }); mark(uid, at, kill); }; });
    await place(page, 640, 456, 0, 'coast');
    const uid = (await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.alive && a.kind === 'scav')?.uid));
    await page.evaluate(u => window.__bincovSample.driver.placeEnemy(u, { x: 704, y: 456 }), uid); await frames(page, 10); await savable();
    const aim = await screenOf(704, 456 - 22); await page.mouse.move(aim.x, aim.y); await frames(page, 6);
    for (let i = 0; i < 8 && await page.evaluate(u => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.uid === u).alive, uid); i++) {
      await page.mouse.down(); await wait(30); await page.mouse.up(); await wait(420);
    }
    const hits = (await events(page, 'impact')).filter(e => e.detail.reason === 'hit-actor' && e.detail.target === uid).length, m = await marks();
    assert.ok(hits >= 1 && m.filter(x => x.uid === uid && !x.kill).length === hits, `every hit marked once: ${hits} hits, ${JSON.stringify(m.map(x => x.kill))}`);
    assert.equal(m.filter(x => x.kill).length, 1, 'one kill marker');
    const target = await screenOf(704, 456 - 22);
    for (const x of m) assert.ok(Math.hypot(x.screen.x - target.x, x.screen.y - target.y) < 28, `marker on the target: ${JSON.stringify(x.screen)} vs ${JSON.stringify(target)}`);
    assert.equal(m.at(-1).kill, true, 'the killing hit shows the kill marker');
    // The real hits above carried owner 'player' (R6-L3); the marker reads only that field now.
    const owners = [...new Set((await events(page, 'impact')).filter(e => e.detail.reason === 'hit-actor' && e.detail.target === uid).map(e => e.detail.owner))];
    assert.deepEqual(owners, ['player'], `owners of the player's hits: ${owners}`);
    // Contract probes through the real feedback path: a player-owned hit inside the closed, unrevealed resident room marks
    // nothing; in the open, a hit owned by an enemy or by nobody (an old enemy round) marks nothing, a player's marks once.
    const probe = await page.evaluate(([room]) => {
      const h = window.__bincovSample.host, b = h.lastBatch, before = window.__marks.length;
      const hit = (owner, at) => h.feedback({ type: 'impact', bullet: 'probe-bullet', owner, reason: 'hit-actor', lastFree: at, contact: at, normal: null, surface: 'actor', target: 'enemy-x', seq: 0, stamp: b.stamp, durability: 'accepted' }, b);
      hit('player', { x: room.x + room.w / 2, y: room.y + room.h / 2 }); const hidden = window.__marks.length - before;
      const open = { x: b.frame.player.x + 40, y: b.frame.player.y };
      hit('enemy-x', open); hit(null, open); const foreign = window.__marks.length - before - hidden;
      hit('player', open); const mine = window.__marks.length - before - hidden - foreign;
      return { revealed: b.frame.revealed[Object.keys(b.frame.revealed).find(k => k.endsWith('/resident-ground'))], hidden, foreign, mine };
    }, [ROOM]);
    assert.equal(probe.revealed, false); assert.equal(probe.hidden, 0, 'no marker for a hit inside an unrevealed room');
    assert.equal(probe.foreign, 0, 'no marker for a hit the player did not own'); assert.equal(probe.mine, 1, 'a player-owned hit in the open marks once');
    const hidden = { marked: probe.hidden };
    // Reload ring: R with a partly used magazine.
    await page.keyboard.press('r'); await frames(page, 6);
    const ring = await page.evaluate(() => ({ on: document.querySelector('[data-cross]').classList.contains('reloading'), deg: parseFloat(document.querySelector('[data-cross]').style.getPropertyValue('--reload')) }));
    await wait(500);
    const ring2 = await page.evaluate(() => parseFloat(document.querySelector('[data-cross]').style.getPropertyValue('--reload')));
    assert.ok(ring.on && ring2 > ring.deg, `reload ring fills: ${ring.deg} -> ${ring2}`);
    await wait(1600);
    // Hurt edge: let a rifleman hit the player, then watch it fade.
    const rifle = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.alive && a.kind === 'salt')?.uid);
    await page.evaluate(u => window.__bincovSample.driver.placeEnemy(u, { x: 704, y: 456 }), rifle); await savable();
    await page.evaluate(u => { window.__hurtLog = []; const h = window.__bincovSample.host; window.__hurtTick = () => window.__hurtLog.push({ t: performance.now(), op: +document.querySelector('[data-hurt]').style.opacity || 0, hp: h.lastBatch.frame.hud.hp }); h.app.ticker.add(window.__hurtTick); window.__bincovSample.driver.freezeAI(false); }, rifle);
    await page.waitForFunction(() => window.__hurtLog.some(r => r.hp < 100), null, { timeout: 15000 });
    await page.evaluate(u => { const d = window.__bincovSample.driver; d.freezeAI(true); d.placeEnemy(u, { x: 104, y: 860 }); }, rifle);
    await wait(1800);
    const hurt = await page.evaluate(() => { window.__bincovSample.host.app.ticker.remove(window.__hurtTick); return window.__hurtLog; });
    const peak = Math.max(...hurt.map(r => r.op)), last = hurt.at(-1);
    assert.ok(peak > .4, `hurt edge peak ${peak}`); assert.ok(last.hp / 100 >= .35 ? last.op < .05 : true, `hurt edge fades at hp ${last.hp}: ${last.op}`);
    // Every real hurt the player took here names a cause; blows are what raised the edge.
    const causes = [...new Set((await events(page, 'hurt')).filter(e => e.detail.uid === 'player').map(e => e.detail.cause))];
    assert.ok(causes.includes('blow') && causes.every(c => ['blow', 'bleed', 'pollution', 'dehydration', 'starvation', 'limit-change'].includes(c)), `hurt causes ${causes}`);
    return { hits, owners, marks: m.length, kill: m.at(-1).kill, hidden, probe, ring: [ring.deg, ring2], hurtPeak: +peak.toFixed(2), hurtEnd: last.op, hp: last.hp, causes };
  });
  await step('V06b the chosen exit: an edge arrow toward it off screen (clear of the HUD cards), a marker over it on screen; off-screen shooters get an edge chevron', async () => {
    await place(page, 640, 456, 0, 'coast'); await frames(page, 8);
    await page.keyboard.press('m'); await page.waitForFunction(() => window.__bincovSample.host.panel === 'map');
    const far = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.exits.find(e => e.id !== 'north'));
    await page.locator('[data-exit]').selectOption(far.name); await page.keyboard.press('m'); await frames(page, 10);
    const edge = await page.evaluate(() => {
      const el = document.querySelector('[data-exitptr]'), box = el.querySelector('span').getBoundingClientRect(), arrow = el.querySelector('i').getBoundingClientRect();
      const cards = ['.cs-status', '.cs-arms', '.cs-info', '.cs-keys', '.cs-clock'].map(s => document.querySelector('.coast-sample ' + s).getBoundingClientRect());
      const hit = r => cards.some(c => r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom);
      return { hidden: el.hidden, edge: el.classList.contains('edge'), text: el.textContent, dir: el.style.getPropertyValue('--dir'), arrow: { x: arrow.x + arrow.width / 2, y: arrow.y + arrow.height / 2 }, overlaps: hit(box) || hit(arrow) };
    });
    const exitScreen = await screenOf(far.at.x, far.at.y - 30), centre = { x: 640, y: 360 };
    const want = Math.atan2(exitScreen.y - centre.y, exitScreen.x - centre.x), got = parseFloat(edge.dir);
    assert.ok(!edge.hidden && edge.edge && edge.text.includes(far.name) && edge.text.includes('格'), JSON.stringify(edge));
    assert.ok(Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want))) < .05, `arrow points at the exit: ${got} vs ${want}`);
    assert.equal(edge.overlaps, false, 'the pointer stays clear of the HUD cards');
    // Near the far exit, standing on the first spot the save accepts: the marker sits over its ring.
    let spot = null;
    for (const [dx, dy] of [[-120, 0], [120, 0], [0, 110], [0, -110], [-90, 80], [90, 80], [-90, -80], [90, -80]]) {
      await place(page, far.at.x + dx, far.at.y + dy, 0, 'coast');
      if (await page.evaluate(() => window.__bincovSample.host.services.checkpoint())) { spot = [dx, dy]; break; }
    }
    assert.ok(spot, 'a valid standing spot near the far exit'); await frames(page, 30);
    const near = await page.evaluate(() => { const el = document.querySelector('[data-exitptr]'), r = el.querySelector('i').getBoundingClientRect(); return { hidden: el.hidden, edge: el.classList.contains('edge'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const ns = await screenOf(far.at.x, far.at.y);
    assert.ok(!near.hidden && !near.edge && Math.abs(near.x - ns.x) < 12 && near.y < ns.y, `marker over the exit: ${JSON.stringify(near)} vs ${JSON.stringify(ns)}`);
    // Under the top cards (the north checkpoint sits at the map's top edge): its ring is in view, so no pointer at all.
    const north = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.exits.find(e => e.id === 'north'));
    await page.evaluate(n => { window.__bincovSample.host.selectedExit = n; }, north.name);
    await place(page, north.at.x + 90, north.at.y + 60, 0, 'coast'); await frames(page, 30);
    const under = await page.evaluate(() => document.querySelector('[data-exitptr]').hidden);
    const ring = await screenOf(north.at.x, north.at.y);
    assert.ok(ring.y > 0 && ring.y < 720 && under, `north ring in view (${JSON.stringify(ring)}), pointer stood aside: ${under}`);
    // Off-screen shooter: a rifleman well above the frame fires; the chevron sits on the top edge pointing up.
    await page.evaluate(() => { window.__bincovSample.host.selectedExit = ''; });
    await place(page, 640, 456, 0, 'coast');
    const rifle = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.alive && a.kind === 'salt')?.uid);
    await page.evaluate(u => window.__bincovSample.driver.placeEnemy(u, { x: 640, y: 200 }), rifle); await frames(page, 4); await savable();
    await page.evaluate(() => window.__bincovSample.driver.freezeAI(false));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-threats] i')].some(e => +e.style.opacity > .5), null, { timeout: 15000 });
    const chevron = await page.evaluate(() => { const e = [...document.querySelectorAll('[data-threats] i')].find(e => +e.style.opacity > .5); const r = e.getBoundingClientRect(); return { y: r.y + r.height / 2, rot: e.style.transform.match(/rotate\(([-\d.e]+)rad\)/)?.[1] }; });
    await page.evaluate(u => { const d = window.__bincovSample.driver; d.freezeAI(true); d.placeEnemy(u, { x: 136, y: 860 }); }, rifle);
    assert.ok(chevron.y < 60 && Math.abs(parseFloat(chevron.rot) + Math.PI / 2) < .35, `chevron on the top edge pointing up: ${JSON.stringify(chevron)}`);
    return { edge, spot, near, under, chevron };
  });
  await step('V07 atmosphere is stateless and bounded: identical pixels on re-present, no drop in a revealed interior, none on a layered floor; the ground bakes once per map', async () => {
    // Grab a frame at view time 7.25, advance the view by half a second (weather, lamps and fades move), then pin the
    // camera back and grab at 7.25 again: stateless air and light draw the same pixels. No live particles are allowed.
    const twice = () => page.evaluate(() => {
      const h = window.__bincovSample.host, v = h.view; h.app.ticker.stop();
      const cam = { ...v.camF }, recoil = { ...v.recoil };
      const grab = (t = 7.25) => { v.camF = { ...cam }; v.recoil = { ...recoil }; v.time = t; v.shake = 0; v.present({ ...h.lastBatch, events: [] }, 0); h.app.render();
        const { pixels } = h.app.renderer.extract.pixels(v.upRT); let sum = 0; for (let i = 0; i < pixels.length; i += 7) sum = (sum * 31 + pixels[i]) >>> 0; return sum; };
      const live = v.fx.live.length, a = grab(); v.present({ ...h.lastBatch, events: [] }, .5); const b = grab(), moved = grab(7.31);
      h.app.ticker.start(); return { a, b, moved, live };
    });
    await place(page, 640, 456, 0, 'coast');
    await page.waitForFunction(() => window.__bincovSample.host.view.fx.live.length === 0, null, { timeout: 15000 }); await frames(page, 10);
    await page.evaluate(() => window.__bincovSample.host.pause('overlay')); await frames(page, 3);
    const { a, b, moved, live } = await twice();
    assert.equal(live, 0); assert.notEqual(moved, a, 'control: 60 ms later the drizzle has moved');
    const outdoors = await page.evaluate(() => ({ ...window.__bincovSample.host.view.weather.stats }));
    await page.evaluate(() => window.__bincovSample.host.resume()); await frames(page, 4);
    assert.equal(a, b, 'two re-presents at one view time draw identical frames');
    assert.ok(outdoors.drops > 10, `drizzle falls outdoors: ${JSON.stringify(outdoors)}`);
    // Inside the revealed resident ground floor: drops that would land there are skipped; none is drawn inside it.
    await page.evaluate(() => window.__bincovSample.driver.door('resident-front', true)); await place(page, 464, 330, Math.PI, 'coast'); await frames(page, 30);
    const inside = await page.evaluate(([room]) => {
      const v = window.__bincovSample.host.view, f = window.__bincovSample.host.lastBatch.frame, id = Object.keys(f.revealed).find(k => k.endsWith('/resident-ground'));
      const inRoom = s => s.visible && s.x >= room.x && s.x < room.x + room.w && s.y >= room.y && s.y < room.y + room.h;
      return { revealed: f.revealed[id], skipped: v.weather.stats.skippedRevealed, splashesInside: v.weather.back.children.filter(inRoom).length };
    }, [{ x: 320, y: 224, w: 288, h: 192 }]);
    assert.equal(inside.revealed, true); assert.ok(inside.skipped > 0, 'drops over the revealed room are skipped'); assert.equal(inside.splashesInside, 0);
    // Upstairs: no weather at all; back on the coast the ground is not baked again.
    const largeBefore = await page.evaluate(() => window.__bincovSample.counts().largeTextures);
    await place(page, 304, 80, Math.PI / 2, 'resident-f2'); await frames(page, 8);
    const upstairs = await page.evaluate(() => { const w = window.__bincovSample.host.view.weather; return { front: w.front.visible, back: w.back.visible }; });
    await place(page, 640, 456, 0, 'coast'); await frames(page, 8);
    const back = await page.evaluate(() => ({ rebuildMs: window.__bincovSample.host.view.stats.rebuildMs, large: window.__bincovSample.counts().largeTextures }));
    assert.deepEqual(upstairs, { front: false, back: false }, 'no weather on a layered floor');
    assert.ok(back.large >= largeBefore && back.rebuildMs < 120, `coast chunks kept: ${JSON.stringify({ largeBefore, ...back })}`);
    return { identical: a === b, outdoors, inside, upstairs, back };
  });
  await step('V08 a crate opens its lid while its loot panel is up; a door passes through an ajar frame', async () => {
    const crate = await page.evaluate(() => { const f = window.__bincovSample.host.lastBatch.frame; return f.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0]; });
    await place(page, crate.x - 24, crate.y, 0, 'coast'); await frames(page, 8);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.panel === 'loot'); await frames(page, 6);
    const open = await page.evaluate(id => window.__bincovSample.host.view.crates.get(id).look, crate.id);
    await page.keyboard.press('Escape'); await frames(page, 6);
    const closed = await page.evaluate(id => window.__bincovSample.host.view.crates.get(id).look, crate.id);
    assert.equal(open, 'open'); assert.equal(closed, 'full');
    await place(page, 464, 436, -Math.PI / 2, 'coast'); await page.evaluate(() => window.__bincovSample.driver.door('resident-front', false)); await frames(page, 8);
    const swing = await page.evaluate(() => new Promise(r => { const v = window.__bincovSample.host.view, seen = []; window.__bincovSample.driver.door('resident-front', true);
      let n = 0; const f = () => { const o = v.doors.get('resident-front'); seen.push(o.key.endsWith('|ajar') ? 'ajar' : o.spec.open ? 'open' : 'closed'); if (++n < 40) requestAnimationFrame(f); else r(seen); }; requestAnimationFrame(f); }));
    assert.ok(swing.includes('ajar') && swing.at(-1) === 'open' && swing.indexOf('open') > swing.lastIndexOf('ajar'), `door frames ${swing.join(',')}`);
    return { crate: [open, closed], swing: swing.filter(s => s === 'ajar').length };
  });
  await context.close();
}
// The outro after a saved settlement: the player's own fall plays to the corpse under the curtain (OPUS-DEATH-02), with
// no further simulation; the canvas grading is cleared for the next mount.
if (!group) {
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await deploy(page);
  await step('V11b low tide (seed 42): the Runtime floods nothing and nothing is drawn as tidal water by the tide strip', async () => {
    await place(page, 61 * 32 + 16, 12 * 32 + 16, 0, 'coast'); await frames(page, 30);
    assert.equal(await page.evaluate(() => window.__bincovSample.host.services.checkpoint()), true, 'fixture position passes checkpoint validation');
    const low = await page.evaluate(() => {
      const h = window.__bincovSample.host, v = h.view, b = h.lastBatch; h.app.ticker.stop();
      const cam = { ...v.camF }, grab = show => {
        const xray = v.updateXray; v.updateXray = function (...a) { xray.apply(this, a); v.tide.layer.visible = show; };
        v.camF = { ...cam }; v.time = 1; v.shake = 0; v.present({ ...b, events: [] }, 0); delete v.updateXray; h.app.render();
        return h.app.renderer.extract.pixels(v.upRT).pixels;
      };
      let a, c; try { a = grab(true); c = grab(false); } finally { delete v.updateXray; h.app.ticker.start(); }
      let changed = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== c[i] || a[i + 1] !== c[i + 1] || a[i + 2] !== c[i + 2]) changed++;
      return { high: b.frame.highTide, flooded: b.frame.flooded.length, shown: v.tide.shown.length, changed };
    });
    await wait(900); await page.screenshot({ path: resolve(out, 'check-tide-low-1280x720.png') });
    assert.deepEqual(low, { high: false, flooded: 0, shown: 0, changed: 0 });
    return low;
  });
  await step('V09 the player\'s death: fall and corpse presented after the settlement commit, curtain 你倒下了, no simulation, grading cleared after', async () => {
    await page.evaluate(() => {
      const d = window.__bincovSample.driver; d.placePlayer({ x: 640, y: 456 }, 0, 'coast');
      [['enemy-6', 704, 456], ['enemy-9', 576, 456], ['enemy-18', 640, 392], ['enemy-23', 640, 520], ['enemy-24', 704, 392]].forEach(([u, x, y]) => d.placeEnemy(u, { x, y }));
      const h = window.__bincovSample.host, v = h.view, present = Object.getPrototypeOf(v).present, log = window.__outro = { rows: [] };
      window.__outroCanvas = h.app.canvas;
      v.present = function (batch, dt) { present.call(this, batch, dt); const g = this.actors.get('player'); log.rows.push({ alive: batch.frame.player.alive, exiting: h.exiting, frames: h.stats.frames, deathT: g.deathT, corpse: !!g.corpse?.visible, body: g.body.visible, filter: h.app.canvas.style.filter, text: document.querySelector('[data-curtain-text]').textContent }); };
      d.freezeAI(false);
    });
    await page.waitForFunction(() => window.__outro.rows.some(r => !r.alive), null, { timeout: 60000 });
    await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'), null, { timeout: 15000 });
    const rows = await page.evaluate(() => window.__outro.rows), after = await page.evaluate(() => window.__outroCanvas.style.filter);
    const outro = rows.filter(r => r.exiting), dead = rows.filter(r => !r.alive);
    assert.ok(dead[0] && outro.length >= 20, `frames presented after the commit: ${outro.length}`);
    assert.ok(outro.every(r => r.frames === outro[0].frames), 'no host frame (and no Runtime advance) during the outro');
    assert.ok(outro.some(r => r.body && r.deathT > 0 && r.deathT < .16) && outro.some(r => r.corpse && r.deathT >= .16), 'the fall plays, then the corpse');
    assert.equal(outro.at(-1).text, '你倒下了'); assert.ok(outro.at(-1).filter.includes('grayscale'), 'the scene greys under the curtain');
    assert.equal(after, '', 'the parked canvas carries no grading');
    assert.equal(await page.evaluate(() => window.__bincov.app.result?.outcome), 'death');
    return { outroFrames: outro.length, fallFrames: outro.filter(r => r.body && r.deathT > 0).length, corpseFrames: outro.filter(r => r.corpse).length, text: outro.at(-1).text };
  });
  await context.close();
}
{ // Damage causes (R6-L2) and the tide (R6-L4) on a fresh run that starts at high tide (seed 3)
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await action(page, 'enter').click(); await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('3'); await action(page, 'deploy').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
  await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  const savable = async () => { assert.equal(await page.evaluate(() => window.__bincovSample.host.services.checkpoint()), true, 'fixture positions pass checkpoint validation'); };
  await step('V10 damage causes: a blow (even under 1 point) pulses the red edge and flashes the body; bleeding, pollution, thirst, hunger and a lowered limit show as readouts under the health bar with a tinted edge and never flash', async () => {
    await place(page, 640, 456, 0, 'coast'); await frames(page, 30); await savable();
    // Contract probes through the host's real feedback path and the view's real event path, on the live page. Continuous
    // causes are fed once per frame for a second, as the Runtime publishes them.
    const running = page.evaluate(async () => {
      window.__drainShot = '';
      const h = window.__bincovSample.host, v = h.view, b = () => h.lastBatch, frame = () => new Promise(res => requestAnimationFrame(() => res()));
      const ev = (cause, damage, angle = null) => ({ type: 'hurt', cause, uid: 'player', at: { x: b().frame.player.x, y: b().frame.player.y }, damage, critical: false, angle, seq: 0, stamp: b().stamp, durability: 'accepted' });
      const read = () => ({ chips: [...document.querySelectorAll('[data-drain] i')].map(i => i.textContent), ail: +document.querySelector('[data-ail]').style.opacity || 0, tint: document.querySelector('[data-ail]').style.getPropertyValue('--ail'), edge: +document.querySelector('[data-hurt]').style.opacity || 0 });
      const flashOf = e => { const g = v.actors.get('player'); g.flashT = 0; v.present({ ...b(), events: [e] }, 0); return g.flashT; };
      const out = { start: read(), sampling: { blowPresentationDelta: 0, clock: 'delivered Pixi ticker delta; wall time reported separately', stages: {} } };
      let feeding = null, presented = 0, ticks = 0;
      const feed = () => {
        const dt = h.app.ticker.deltaMS / 1000; presented += dt; ticks++;
        if (feeding) for (const [c, perSecond] of feeding) h.feedback(ev(c, perSecond * dt), b());
      };
      h.app.ticker.add(feed);
      // Feedback ages by ticker delta, which Pixi caps on slow software renderers. Waiting 1.5 wall seconds
      // can deliver less than the .8-second hold. Measure the actual presentation clock, keep the original
      // expiry assertions and report wall time separately; this is not a natural-frame performance pass.
      const forSeconds = async (name, seconds) => {
        const p0 = presented, t0 = performance.now(), f0 = ticks;
        while (presented - p0 < seconds) {
          if (performance.now() - t0 > 30000) throw Error(`No bounded presentation progress for ${name}`);
          await frame();
        }
        out.sampling.stages[name] = { presentationSeconds: presented - p0, wallMs: performance.now() - t0, ticks: ticks - f0 };
      };
      feeding = [['bleed', 1.2], ['pollution', .5]]; await forSeconds('during', 2); out.during = read();
      // Hold the feed while the test takes a screenshot of the readout.
      window.__drainShot = 'ready'; while (window.__drainShot !== 'taken') await frame();
      feeding = null; await forSeconds('after', 1.5); out.after = read();
      h.feedback(ev('limit-change', 3), b()); await frame(); await frame(); out.limit = read();
      await forSeconds('limitAfter', 3.4); out.limitAfter = read();
      // Sample the event's own presentation before any arbitrary rAF delay decays the pulse. This is the same real
      // feedback path as above; a zero elapsed interval does not advance simulation or age an effect before reading it.
      h.feedback(ev('blow', .4, 1), b()); h.feedbackFrame(b(), 0); out.blow = read();
      await forSeconds('blowAfter', 1.2); out.blowAfter = read();
      h.app.ticker.remove(feed);
      out.flash = Object.fromEntries(['bleed', 'pollution', 'dehydration', 'starvation', 'limit-change', 'blow'].map(c => [c, flashOf(ev(c, c === 'blow' ? .4 : 2, c === 'blow' ? 1 : null))]));
      return out;
    });
    // The page script may fail before it signals; keep its rejection handled and surface it here.
    const settled = running.then(r => ({ r }), error => ({ error }));
    const first = await Promise.race([settled, page.waitForFunction(() => window.__drainShot === 'ready', null, { timeout: 15000 }).then(() => null, () => null)]);
    if (first?.error) throw first.error;
    await page.screenshot({ path: resolve(out, 'check-drain-1280x720.png') });
    await page.evaluate(() => { window.__drainShot = 'taken'; });
    const done = await settled; if (done.error) throw done.error;
    const r = done.r;
    assert.deepEqual(r.start.chips, [], 'no readout before any continuous damage');
    assert.equal(r.during.chips.length, 2, `readouts ${r.during.chips}`);
    assert.match(r.during.chips[0], /^流血 -1\.[0-3]\/秒$/); assert.match(r.during.chips[1], /^污染 -0\.[4-6]\/秒$/);
    assert.equal(r.during.tint, '150,26,16', 'the edge takes the largest cause'); assert.ok(r.during.ail > .2, `tinted edge ${r.during.ail}`);
    assert.ok(r.during.edge < .05, `continuous damage does not pulse the blow edge: ${r.during.edge}`);
    assert.deepEqual(r.after.chips, []); assert.equal(r.after.ail, 0);
    assert.deepEqual(r.limit.chips, ['生命上限下降 -3.0']); assert.deepEqual(r.limitAfter.chips, []);
    assert.ok(r.blow.edge > .3, `a 0.4-point blow still pulses: ${r.blow.edge}`); assert.deepEqual(r.blow.chips, []);
    assert.ok(r.blowAfter.edge < .05, `the single blow pulse fades without another hit: ${r.blowAfter.edge}`);
    for (const [c, t] of Object.entries(r.flash)) assert.equal(t > 0, c === 'blow', `${c} flash ${t}`);
    return r;
  });
  await step('V11 tide: water is drawn exactly on the Runtime\'s flooded cells (none outside, every visible one covered); a body caught there wades; the tide recedes with a fade', async () => {
    const info = await page.evaluate(() => { const b = window.__bincovSample.host.lastBatch, m = b.map, tide = []; m.cells.forEach((row, y) => row.forEach((c, x) => { if (c === 'tide') tide.push(y * m.cols + x); })); return { high: b.frame.highTide, flooded: [...b.frame.flooded], tide, cols: m.cols }; });
    assert.equal(info.high, true, 'seed 3 starts at high tide'); assert.ok(info.flooded.length > 50, `flooded ${info.flooded.length}`);
    assert.ok(info.flooded.every(i => info.tide.includes(i)), 'flooded cells are tide cells');
    // Dry ground two cells west of the east tide strip.
    await place(page, 61 * 32 + 16, 12 * 32 + 16, 0, 'coast'); await frames(page, 30); await savable();
    // The same frame presented twice at a fixed camera and view time, with and without the tide layer: the pixels that
    // differ are the tide's. Each is mapped back to its world cell (one-pixel tolerance at cell borders).
    const probe = await page.evaluate(() => {
      const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, cols = b.map.cols, flooded = new Set(b.frame.flooded); h.app.ticker.stop();
      const cam = { ...v.camF };
      // Everything drawn above the ground (loot, actors, shadows, rain, mist) is hidden in both, so the tide is compared
      // against the bare ground it covers.
      const above = [v.flat, v.shadows, v.sorted, v.xray, v.overhead, v.weather.back, v.weather.front];
      const grab = show => {
        const xray = v.updateXray; v.updateXray = function (...a) { xray.apply(this, a); v.tide.layer.visible = show; for (const c of above) c.visible = false; };
        v.camF = { ...cam }; v.time = 1; v.shake = 0; v.present({ ...b, events: [] }, 0); delete v.updateXray; h.app.render();
        for (const c of above) c.visible = true;
        return h.app.renderer.extract.pixels(v.upRT);
      };
      let on, off;
      try { on = grab(true); off = grab(false); } finally { delete v.updateXray; for (const c of above) if (c) c.visible = true; h.app.ticker.start(); }
      const k = v.view.k, width = on.width, px = on.pixels, qx = off.pixels;
      const cell = (x, y) => Math.floor(y / 32) * cols + Math.floor(x / 32), wet = (x, y) => flooded.has(cell(x, y));
      const perCell = new Map(); let outside = 0, changed = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] === qx[i] && px[i + 1] === qx[i + 1] && px[i + 2] === qx[i + 2]) continue;
        changed++;
        const p = i / 4, wx = v.cam.x + (p % width + .5) / k, wy = v.cam.y + (Math.floor(p / width) + .5) / k;
        if (wet(wx, wy)) perCell.set(cell(wx, wy), (perCell.get(cell(wx, wy)) ?? 0) + 1);
        else if (![[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => wet(wx + dx, wy + dy))) outside++;
      }
      // Flooded cells wholly inside the view.
      const inView = [...flooded].filter(i => { const x = (i % cols) * 32, y = Math.floor(i / cols) * 32; return x >= v.cam.x && y >= v.cam.y && x + 32 <= v.cam.x + v.view.w && y + 32 <= v.cam.y + v.view.h; });
      return { changed, outside, inView: inView.length, covered: inView.filter(i => (perCell.get(i) ?? 0) >= 32 * 32 * k * k * .9).length, minCover: Math.min(...inView.map(i => (perCell.get(i) ?? 0) / (32 * 32 * k * k))), low: inView.filter(i => (perCell.get(i) ?? 0) < 32 * 32 * k * k * .9).map(i => [i % cols, Math.floor(i / cols), +((perCell.get(i) ?? 0) / (32 * 32 * k * k)).toFixed(2)]), cam: [v.cam.x, v.cam.y, v.view.w, v.view.h] };
    });
    await wait(900); await page.screenshot({ path: resolve(out, 'check-tide-high-1280x720.png') });
    assert.ok(probe.inView >= 6, `flooded cells in view ${probe.inView}`); assert.equal(probe.outside, 0, 'no water drawn outside the flooded cells');
    assert.equal(probe.covered, probe.inView, `every flooded cell in view is covered: ${JSON.stringify(probe)}`);
    // Caught by the water: the checkpoint rule lets a body stand where the tide came in; it wades until it walks out.
    await place(page, 63 * 32 + 16, 12 * 32 + 16, Math.PI, 'coast'); await frames(page, 10); await savable();
    const wade = await page.evaluate(() => { const g = window.__bincovSample.host.view.actors.get('player'); return { wade: g.wade.visible, shadow: g.shadow.visible }; });
    await wait(900); await page.screenshot({ path: resolve(out, 'check-tide-wade-1280x720.png') });
    await place(page, 61 * 32 + 16, 12 * 32 + 16, 0, 'coast'); await frames(page, 6);
    const dry = await page.evaluate(() => { const g = window.__bincovSample.host.view.actors.get('player'); return { wade: g.wade.visible, shadow: g.shadow.visible }; });
    assert.deepEqual(wade, { wade: true, shadow: false }); assert.deepEqual(dry, { wade: false, shadow: true });
    // The turn of the tide, presented to the view only (the Runtime turns it at 300 s): 1.4 s fade, then no cells; back in over 0.9 s.
    const fade = await page.evaluate(() => {
      const h = window.__bincovSample.host, t = h.view.tide, real = h.lastBatch.frame.flooded, steps = []; h.app.ticker.stop();
      try {
        t.sync([], .5, 1); steps.push(+t.alpha.toFixed(2)); t.sync([], 1, 1.5); steps.push(+t.alpha.toFixed(2), t.shown.length);
        t.sync(real, .45, 2.5); steps.push(+t.alpha.toFixed(2)); t.sync(real, .5, 3); steps.push(+t.alpha.toFixed(2), t.shown.length === real.length);
      } finally { h.app.ticker.start(); }
      return steps;
    });
    assert.deepEqual(fade, [.64, 0, 0, .5, 1, true]);
    // The floor map colours tide cells by the same flooded list on the floor being played.
    await page.keyboard.press('m'); await frames(page, 6); await wait(300);
    await page.screenshot({ path: resolve(out, 'check-map-tide-1280x720.png') });
    await page.keyboard.press('m'); await frames(page, 4);
    return { flooded: info.flooded.length, ...probe, wade, dry, fade };
  });
  await context.close();
}
// Playtest F-04 camera (src/coast-view/camera.ts; the village, the mall and the yard's mall entry share it). Real keys,
// pointer, Runtime and present; only the clock is fixed, so the check does not depend on the runner's frame rate (CI
// draws this scene below 10 fps): the ticker is stopped and each h.frame() starts at a 60 Hz vsync plus 0-3 ms of
// seeded frame-start jitter (performance.now is stubbed for the Runtime's t0; ticker.deltaMS is the vsync delta).
// `old` is Math.round(camF), the camera before F-04, on the same frames. The negative control is this step against
// the pre-F-04 build (BINCOV_SAMPLE_HTML), where the player trembles, the arms and pistol shimmer and a flick slides 96;
// with only host.ts's `follow` reverted, the `loaded` run fails. It is the last step of the animation group: its
// hundreds of scripted frames are the heaviest GPU burst in the file, and on CI's software GL the page opened right
// after it timed out loading (run 38579899496, twice), so nothing in the group follows it.
{
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await deploy(page);
  await step('V-CAM camera: a walk keeps the player on one screen pixel (walk, sprint, diagonal aim, late frames) with one weapon and arm offset; the ground never steps back and settles within 1.2 s; the mouse look-ahead is 0 px, 81.6 with the right button', async () => {
    await page.evaluate(() => {
      const h = window.__bincovSample.host, v = h.view; h.app.ticker.stop();
      let seed = 26, vsync = performance.now();
      const rnd = () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), 1 | t); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      window.__camFrames = (n, jitter = 3) => {
        const rows = [];
        for (let i = 0; i < n; i++) {
          vsync += 1000 / 60; const t0 = vsync + rnd() * jitter;
          performance.now = () => t0; h.app.ticker.deltaMS = 1000 / 60; h.frame(); delete performance.now;
          const p = h.lastBatch.frame.player, g = v.actors.get(p.uid), a = g.arms[0];
          rows.push({ px: p.x, x: g.body.x - v.cam.x, y: g.body.y - v.cam.y, cx: v.cam.x, old: g.body.x - Math.round(v.camF.x), precise: p.state.precise,
            weapon: `${g.weapon.x - g.body.x},${g.weapon.y - g.body.y}`, arms: g.arms.map(s => `${s.x - g.body.x},${s.y - g.body.y}`).join(' '),
            gap: Math.hypot(a.x + Math.cos(a.rotation) * a.scale.x - g.weapon.x, a.y + Math.sin(a.rotation) * a.scale.x - g.weapon.y) });
        }
        // Finish the batch's GPU work before returning: these frames run back to back without yielding, and on a
        // software-GL runner the queued work would outlive the step and hold up the next page's WebGL start.
        h.app.renderer.gl?.finish();
        return rows;
      };
    });
    const frames = (n, jitter) => page.evaluate(([n, jitter]) => window.__camFrames(n, jitter), [n, jitter]);
    // Pointer at the drawn player's chest plus (dx, dy) world px.
    const pointTo = async (dx, dy) => { const c = await page.evaluate(([dx, dy]) => { const v = window.__bincovSample.host.view, p = v.last.player; return v.worldToClient({ x: p.x + dx, y: p.y - 22 + dy }); }, [dx, dy]); await page.mouse.move(c.x, c.y); };
    const changes = xs => xs.filter((x, i) => i && x !== xs[i - 1]).length;
    // A change against the previous change: the tremble's signature (a lag still settling only steps one way).
    const reversals = xs => { const d = xs.slice(1).map((x, i) => x - xs[i]).filter(Boolean); return d.filter((x, i) => i && Math.sign(x) !== Math.sign(d[i - 1])).length; };
    const steps = rows => rows.slice(1).map((r, i) => r.cx - rows[i].cx);
    await page.evaluate(() => window.__bincovSample.driver.weapon('pistol'));
    const walks = {}; let oldChanges = 0;
    // `loaded`: frames start up to 12 ms late. Only a camera that follows on the Runtime's clock (host.ts `follow`) keeps
    // the player still there; following on ticker.deltaMS moves it for any offset (tests/coast-camera.test.ts replay).
    for (const [name, keys, aim, jitter] of [['walk', ['d'], [250, 0]], ['sprint', ['Shift', 'd'], [250, 0]], ['diagonal', ['d'], [180, -180]], ['loaded', ['Shift', 'd'], [250, 0], 12]]) {
      await place(page, 640, 456, 0, 'coast'); await frames(2); await pointTo(...aim); await frames(60);
      for (const k of keys) await page.keyboard.down(k);
      const rows = await frames(90, jitter);
      for (const k of [...keys].reverse()) await page.keyboard.up(k);
      const after = name === 'walk' ? await frames(75) : [];
      // 0.7-1.5 s into the walk the follow lag has settled (0.4% of it left).
      const steady = rows.slice(42), moved = rows.at(-1).px - rows[0].px, back = steps([...rows, ...after]).filter(d => d < 0).length;
      const w = walks[name] = { moved: +moved.toFixed(1), screen: changes(steady.map(r => r.x)) + changes(steady.map(r => r.y)),
        reversals: reversals(steady.map(r => r.x)) + reversals(steady.map(r => r.y)), old: changes(steady.map(r => r.old)),
        weapon: [...new Set(steady.map(r => r.weapon))], arms: [...new Set(steady.map(r => r.arms))], gap: Math.max(...steady.map(r => r.gap)), back };
      oldChanges += w.old;
      assert.ok(moved >= 120, `${name}: moved ${moved}`);
      assert.ok(w.screen <= 2 && w.reversals === 0, `${name}: the player moved ${w.screen} times on screen while walking steadily ${JSON.stringify(w)}`);
      assert.equal(w.weapon.length, 1, `${name}: weapon offsets from the body ${w.weapon}`);
      assert.equal(w.arms.length, 1, `${name}: arm offsets from the body ${w.arms}`);
      assert.ok(w.gap < .01, `${name}: the trigger arm ends ${w.gap} px from the grip`);
      assert.equal(back, 0, `${name}: the camera stepped back against the walk`);
      if (after.length) {
        // Released: the player stands, the camera takes up its lag forward only, and its last step comes within 1.2 s.
        const last = steps(after).findLastIndex(d => d !== 0) + 1;
        w.release = { creep: after.at(-1).cx - rows.at(-1).cx, lastStepFrame: last };
        assert.ok(after.every(r => r.px === after[0].px), 'standing after the release');
        assert.ok(w.release.creep >= 8 && last <= 72, `release ${JSON.stringify(w.release)}`);
      }
    }
    // In-run control: the old rounding on the same smoothed camera would have trembled.
    assert.ok(oldChanges >= 10, `Math.round(camF) changes on the same frames: ${oldChanges}`);
    // Mouse look-ahead (PR #39): pointer 150 px right, then left of the drawn player: without the right button the view
    // does not slide at all. With it held, the view looks ahead toward the pointer: 330 px out it reaches the full 81.6 px
    // of the precise ellipse each way (2 x 81.6, the reach kept from before F-04).
    await place(page, 640, 456, 0, 'coast'); await frames(2); await pointTo(150, 0); await frames(60);
    const cam = async () => (await frames(1))[0];
    const right = await cam(); await pointTo(-150, 0); await frames(60); const left = await cam();
    await pointTo(-330, 0); await page.mouse.down({ button: 'right' }); await frames(60); const preciseLeft = await cam();
    await pointTo(330, 0); await frames(60); const preciseRight = await cam();
    await page.mouse.up({ button: 'right' }); await frames(2);
    const flick = { slide: right.cx - left.cx, preciseSlide: preciseRight.cx - preciseLeft.cx, precise: [right.precise, left.precise, preciseLeft.precise, preciseRight.precise] };
    assert.deepEqual(flick.precise, [false, false, true, true], 'the right button holds precise aim');
    assert.ok(Math.abs(flick.slide) <= 1, `default look-ahead slide ${flick.slide}`);
    assert.ok(Math.abs(flick.preciseSlide - 163.2) <= 3, `right-button look-ahead slide ${flick.preciseSlide}`);
    return { walks, oldChanges, flick };
  });
  await context.close();
}
if (!group) { // Touch
  const { context, page } = await open('?test=1&entry=tabs&sample=village', { hasTouch: true });
  await step('W14 touch aim stick past 0.62 keeps firing', async () => {
    await deploy(page); await place(page, 640, 456, 0); await frames(page, 3); await clearEvents(page);
    await page.evaluate(() => {
      const c = document.querySelector('.coast-sample canvas'), fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
      fire('pointerdown', 1000, 400); fire('pointermove', 1060, 400);
    });
    await wait(1400);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true })));
    const shots = (await events(page, 'shot')).filter(e => e.detail.shooter === 'player').length;
    assert.ok(shots >= 3); return { shots };
  });
  await context.close();
}
if (!group) { // Item names in the grid panels: three-character labels (保险管 and the like) show in full at every size.
  for (const size of [{ w: 1280, h: 720, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 844, h: 390, dpr: 3, touch: true }, { w: 640, h: 300, dpr: 3, touch: true }]) {
    const { context, page } = await open('?test=1&entry=tabs&sample=village', size.touch ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: size.dpr, hasTouch: true, isMobile: true } : { viewport: { width: size.w, height: size.h } });
    await step(`U11 item labels at ${size.w}x${size.h}: three-character names are not cut (pixel face on desktop, compact face on touch)`, async () => {
      if (size.touch) {
        await action(page, 'enter').tap(); await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action(page, 'deploy').tap();
        await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch); await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
        await page.setViewportSize({ width: size.w, height: size.h });
      } else await deploy(page);
      await place(page, 640, 456, 0, 'coast'); await frames(page, 4);
      // Four 1x1 items with three-character labels, added to the empty safe through the real save session.
      const added = await page.evaluate(() => window.__bincov.saveSession.mutate(() => {
        window.__bincov.app.loadout.safe.items.push(...[['fuse', 0, 0], ['antidote', 1, 0], ['ammoR', 0, 1], ['strengthDose', 1, 1]].map(([id, x, y]) => ({ uid: `bc-label-${id}`, id, qty: 1, x, y })));
      }));
      assert.equal(added, 'committed', await page.evaluate(() => window.__bincov.app.storageError));
      if (size.touch) await page.locator('.coast-sample [data-bag]').tap(); else await page.keyboard.press('Tab');
      await page.waitForFunction(() => window.__bincovSample.host.panel === 'inventory'); await frames(page, 4);
      await page.evaluate(() => document.fonts.ready);
      const labels = await page.evaluate(() => [...document.querySelectorAll('.coast-sample [data-panel] .item')].map(el => {
        const l = el.querySelector('.item-label');
        return { uid: el.dataset.uid, text: l.textContent, tight: l.classList.contains('tight'), font: getComputedStyle(l).fontFamily.split(',')[0], cut: l.scrollWidth > l.clientWidth + 0.5, width: Math.round(el.getBoundingClientRect().width) };
      }));
      await page.screenshot({ path: resolve(out, `check-labels-${size.w}x${size.h}.png`) });
      const fixtures = labels.filter(l => l.uid.startsWith('bc-label-'));
      assert.equal(fixtures.length, 4, JSON.stringify(labels));
      for (const l of labels) assert.equal(l.cut, false, `label cut: ${JSON.stringify(l)}`);
      assert.deepEqual(fixtures.map(l => l.text), ['保险管', '除藻剂', '卡宾弹', '力量针']);
      for (const l of fixtures) assert.equal(l.tight, size.touch, `${size.touch ? 'compact' : 'pixel'} face expected: ${JSON.stringify(l)}`);
      await page.keyboard.press('Escape'); await frames(page, 2);
      return { cell: await page.evaluate(() => Number(document.querySelector('.coast-sample [data-grid]')?.dataset.cell ?? 0)), labels: fixtures };
    });
    await context.close();
  }
}
if (!group) { // Dragging in the docked panels: the ghost stays under the cursor, above the panel, and the panel never grows a scrollbar.
  for (const size of [{ w: 1280, h: 720 }, { w: 1920, h: 1080 }]) {
    const { context, page } = await open('?test=1&entry=tabs&sample=village', { viewport: { width: size.w, height: size.h } });
    await step(`U12 drag at ${size.w}x${size.h}: the ghost follows the cursor above the panel, the docked panel never scrolls, closing mid-drag clears it`, async () => {
      await deploy(page);
      const watch = () => page.evaluate(() => {
        const p = document.querySelector('.coast-sample [data-panel]'), g = document.querySelector('.cs-ghost');
        let ghost = null, onTop = false;
        if (g) {
          // Hit-test a point just inside the ghost with its pointer events briefly on: true when nothing is drawn above it.
          const r = g.getBoundingClientRect(); ghost = { left: r.left, top: r.top };
          g.style.pointerEvents = 'auto'; const hit = document.elementFromPoint(r.left + 4, r.top + 4); g.style.pointerEvents = 'none';
          onTop = !!hit && g.contains(hit);
        }
        return { scroll: [p.scrollWidth - p.clientWidth, p.scrollHeight - p.clientHeight], ghost, onTop, inPanel: !!g && p.contains(g) };
      });
      const results = [];
      for (const mode of ['inventory', 'loot']) {
        if (mode === 'inventory') { await place(page, 640, 456, 0, 'coast'); await frames(page, 4); await page.keyboard.press('Tab'); }
        else {
          const crate = await page.evaluate(() => { const f = window.__bincovSample.host.lastBatch.frame; return f.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0]; });
          await place(page, crate.x - 24, crate.y, 0, 'coast'); await frames(page, 6); await page.keyboard.press('e');
        }
        await page.waitForFunction(m => window.__bincovSample.host.panel === m, mode); await frames(page, 4);
        const item = page.locator('.coast-sample [data-panel] .item[data-uid]').first(), box = await item.boundingBox();
        const grab = { x: box.x + 10, y: box.y + 12 };
        await page.mouse.move(grab.x, grab.y); await page.mouse.down();
        const before = await watch(), path = [];
        // Sweep toward the right edge and the bottom of the screen, where the old ghost overflowed the panel.
        for (const [x, y] of [[grab.x + 40, grab.y + 10], [size.w - 30, grab.y], [size.w - 20, size.h - 20], [grab.x + 120, size.h - 40]]) {
          await page.mouse.move(x, y, { steps: 6 }); await frames(page, 2);
          const s = await watch(); path.push({ x, y, ...s });
          if (path.length === 1) await page.screenshot({ path: resolve(out, `check-drag-mid-${mode}-${size.w}x${size.h}.png`) });
        }
        // Released below the grids (no drop target): nothing moves, the ghost goes away.
        await page.mouse.up(); await frames(page, 4);
        await page.screenshot({ path: resolve(out, `check-drag-${mode}-${size.w}x${size.h}.png`) });
        for (const s of [before, ...path]) assert.deepEqual(s.scroll.map(v => v > 0), [false, false], `${mode}: panel overflow while dragging ${JSON.stringify(s)}`);
        for (const s of path) {
          assert.ok(s.ghost && !s.inPanel && s.onTop, `${mode}: ghost exists outside the panel and is drawn on top ${JSON.stringify(s)}`);
          assert.ok(Math.abs(s.ghost.left - (s.x - 10)) <= 1.5 && Math.abs(s.ghost.top - (s.y - 12)) <= 1.5, `${mode}: ghost under the cursor ${JSON.stringify(s)}`);
        }
        assert.equal(await page.evaluate(() => document.querySelectorAll('.cs-ghost').length), 0, 'ghost removed after the drop');
        await page.keyboard.press('Escape'); await frames(page, 4);
        results.push({ mode, steps: path.length, lastGhost: path.at(-1).ghost });
      }
      // The ghost no longer lives in the panel, so closing the panel mid-drag has to take it away: Tab, and a blur pause.
      const ghosts = () => page.evaluate(() => document.querySelectorAll('.cs-ghost').length);
      for (const how of ['tab', 'blur']) {
        await page.keyboard.press('Tab'); await page.waitForFunction(() => window.__bincovSample.host.panel === 'inventory'); await frames(page, 4);
        const box = await page.locator('.coast-sample [data-panel] .item[data-uid]').first().boundingBox();
        await page.mouse.move(box.x + 10, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + 60, box.y + 40, { steps: 6 }); await frames(page, 2);
        assert.equal(await ghosts(), 1, `${how}: dragging`);
        if (how === 'tab') await page.keyboard.press('Tab'); else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.waitForFunction(p => window.__bincovSample.host.panel === p, how === 'tab' ? null : 'pause'); await frames(page, 2);
        assert.equal(await ghosts(), 0, `${how}: ghost removed with the panel`);
        await page.mouse.up(); await frames(page, 2);
        if (how === 'blur') { await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__bincovSample.host.panel === null); }
        results.push({ closedMidDrag: how, ghosts: await ghosts() });
      }
      return results;
    });
    await context.close();
  }
}
if (!group) { // Short and small screens: map labels never overlap, every exit stays labelled, the map uses the panel height
  for (const size of [{ w: 640, h: 300, dpr: 3, touch: true }, { w: 844, h: 390, dpr: 3, touch: true }, { w: 1280, h: 720, dpr: 1, touch: false }]) {
    const { context, page } = await open('?test=1&entry=tabs&sample=village', size.touch ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: size.dpr, hasTouch: true, isMobile: true } : {});
    await step(`U10 map labels at ${size.w}x${size.h}: no overlap, every exit named, map fills the short panel`, async () => {
      if (size.touch) { await action(page, 'enter').tap(); await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action(page, 'deploy').tap(); await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch); await page.evaluate(() => window.__bincovSample.driver.freezeAI(true)); await page.setViewportSize({ width: size.w, height: size.h }); }
      else await deploy(page);
      await place(page, 640, 456, 0, 'coast'); await frames(page, 4);
      await page.keyboard.press('m'); await frames(page, 4);
      const exits = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.exits.map(e => e.name));
      await page.locator('[data-panel] [data-exit]').selectOption(exits.at(-1)); await frames(page, 2);
      const r = await page.evaluate(() => {
        const h = window.__bincovSample.host, c = document.querySelector('[data-map]'), box = c.getBoundingClientRect();
        return { labels: h.mapLayout.labels, markers: h.mapLayout.markers, canvas: [c.width, c.height], css: [Math.round(box.width), Math.round(box.height)] };
      });
      await page.screenshot({ path: resolve(out, `check-map-${size.w}x${size.h}.png`) });
      const shown = r.labels.filter(l => l.box);
      const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      for (const [i, a] of shown.entries()) for (const b of shown.slice(i + 1)) assert.ok(!hit(a.box, b.box), `${a.name} overlaps ${b.name}`);
      for (const a of shown) assert.ok(!r.markers.some(m => hit(a.box, m)), `${a.name} covers an exit or the player marker`);
      for (const l of shown) assert.ok(l.box.x0 >= 0 && l.box.y0 >= 0 && l.box.x1 <= r.canvas[0] + .5 && l.box.y1 <= r.canvas[1] + .5, `${l.name} leaves the canvas`);
      assert.deepEqual(r.labels.filter(l => l.kind === 'exit' && l.box).map(l => l.name).sort(), [...exits].sort());
      if (size.h <= 480) assert.ok(r.css[1] >= size.h - 60, `short-screen map height ${r.css[1]}`);
      await page.keyboard.press('m'); await frames(page, 3);
      return { css: r.css, shown: shown.map(l => l.name), dropped: r.labels.filter(l => !l.box).map(l => l.name) };
    });
    await context.close();
  }
}
if (!group) { // Entries without the test flag
  const { context, page } = await open('?sample=village');
  await step('W15 ?sample=village without ?test=1 exposes no test interface and still plays on the real Runtime', async () => {
    await action(page, 'enter').click(); await deployFromYard(page, { world: 'buildings', seed: 42 });
    await page.waitForSelector('.coast-sample canvas'); await wait(600);
    const s = await page.evaluate(() => ({ test: typeof window.__bincovSample, bincov: typeof window.__bincov, world: document.querySelector('#run-world')?.value ?? null, roots: document.querySelectorAll('.coast-sample').length }));
    assert.equal(s.test, 'undefined'); assert.equal(s.bincov, 'undefined'); assert.equal(s.roots, 1);
    return s;
  });
  await context.close();
  const plain = await open('?test=1&entry=tabs');
  await step('W16 a test page without sample= runs residential raids on the 2.5D view without the playtest marks', async () => {
    const page = plain.page;
    await action(page, 'enter').click(); await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 60000 });
    await page.waitForFunction(() => (document.querySelector('.coast-sample [data-where]')?.textContent ?? '').length > 0);
    const s = await page.evaluate(() => ({ sample: document.querySelectorAll('.coast-sample').length, coastSample: !!window.__bincov.app.coastSample,
      marks: window.__bincovSample.host.view.opts.sampleMarks, where: document.querySelector('.coast-sample [data-where]').textContent,
      // The title's renderer stays parked off the page; the raid draws on the one shared renderer.
      canvases: document.querySelectorAll('canvas').length }));
    assert.equal(s.sample, 1); assert.equal(s.coastSample, true); assert.equal(s.marks, false); assert.equal(s.canvases, 1);
    assert.ok(s.where.startsWith('沿海街区') && !s.where.includes('样板外'), s.where);
    return s;
  });
  await plain.context.close();
}
await browser.close();
report.finishedAt = new Date().toISOString();
report.passed = report.steps.filter(s => s.status === 'passed').length; report.failed = report.steps.length - report.passed;
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.steps.length} passed; errors ${report.errors.length}; external requests ${report.requests.length}`);
if (report.failed) process.exitCode = 1;
