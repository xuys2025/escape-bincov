// Village sample (?sample=village) on the real coast Runtime: wiring checks through the ordinary menu/base/deploy
// flow of the offline build. Fixtures use the explicit ?test=1 Runtime driver only to place actors; every gameplay
// action goes through real input, the v1 port and the Runtime transaction services. Storage faults patch the real
// localStorage write for the session key.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_SAMPLE_OUT || 'test-results/coast-sample'); await mkdir(out, { recursive: true });
const url = pathToFileURL(resolve(process.env.BINCOV_SAMPLE_HTML || 'dist/index.html')).href;
const report = { startedAt: new Date().toISOString(), seed: '42', steps: [], errors: [], requests: [] };
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

{ // Desktop flow: one run through every wiring point, ending in a settlement
  const { context, page } = await open('?test=1&sample=village');
  await step('W00 sample deploy mounts the Pixi host on the real Runtime; RaidScene never starts', async () => {
    await deploy(page);
    const s = await page.evaluate(() => ({ state: window.__bincov.app.state, raid: !!window.__bincov.app.raid, world: window.__bincovSample.host.lastBatch.stamp.world, roots: document.querySelectorAll('.coast-sample').length }));
    assert.equal(s.state, 'run'); assert.equal(s.raid, false); assert.equal(s.world.worldVersion, 'coast-buildings-v1'); assert.equal(s.roots, 1);
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
    await page.keyboard.down('w'); await wait(400); const t1 = await now(page); await page.keyboard.up('w');
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
    const ROOM = { x: 304, y: 192, w: 320, h: 240 }, ROOM_ID = 'coast-buildings-v1/resident-layout-1/coast/region/resident-ground';
    // Pixels of the view's composited render target (no HTML), re-presented from the same batch at a fixed view time while
    // the real pause holds simulation time (ambient light follows raid time). The first call stores the baseline. Roofs and
    // ceilings are stripped for every probe (a fully faded roof), so a pass depends on region gating, not on the roof
    // covering the room; `leak` forces the withheld decals visible as the positive control.
    const probe = (compare, leak = false) => page.evaluate(([r, compare, leak]) => {
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
      await page.evaluate(([u, i]) => { const d = window.__bincovSample.driver; d.placeEnemy(u, { x: 352 + i * 30, y: 336 }); d.kill(u); }, [uid, i]);
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
  await step('W11 20 view remounts on the live Runtime keep listeners, tickers, apps, canvases and textures flat', async () => {
    const first = await page.evaluate(() => window.__bincovSample.counts());
    await page.evaluate(() => window.__bincovSample.remount(20)); await frames(page, 5);
    const last = await page.evaluate(() => window.__bincovSample.counts());
    for (const k of ['listeners', 'tickers', 'observers', 'apps', 'views', 'renderTextures', 'liveViews', 'canvases', 'sampleRoots', 'atlasPages', 'largeTextures']) assert.equal(last[k], first[k], k);
    return { first, last };
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
    await restoreWrites(page); await page.locator('[data-do="retry-settlement"]').click();
    await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'));
    const end = await page.evaluate(() => ({ state: window.__bincov.app.state, outcome: window.__bincov.app.result?.outcome, pending: !!window.__bincov.app.pendingSettlement, counts: window.__bincovSample.counts(), sample: !!window.__bincov.app.coastSample }));
    assert.ok(mid > 2 && mid < 3); assert.equal(reset, 0); assert.equal(retry, true); assert.equal(pending, true);
    assert.equal(end.outcome, 'extract'); assert.equal(end.pending, false); assert.equal(end.sample, false);
    for (const k of ['listeners', 'tickers', 'apps', 'views', 'renderTextures', 'liveViews', 'sampleRoots']) assert.equal(end.counts[k], 0, k);
    return { mid, reset, ...end };
  });
  await step('W13 a second run abandons through the pause menu and settles as a failure', async () => {
    await action(page, 'return').click(); await deploy(page, { enter: false });
    await page.keyboard.press('Escape'); await frames(page, 2);
    await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
    await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'));
    const r = await page.evaluate(() => ({ outcome: window.__bincov.app.result?.outcome, counts: window.__bincovSample.counts() }));
    assert.equal(r.outcome, 'death', 'abandon settles under the original failure rules'); assert.equal(r.counts.apps, 0);
    return r;
  });
  await context.close();
}
{ // Touch
  const { context, page } = await open('?test=1&sample=village', { hasTouch: true });
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
{ // Entries without the test flag
  const { context, page } = await open('?sample=village');
  await step('W15 ?sample=village without ?test=1 exposes no test interface and still plays on the real Runtime', async () => {
    await action(page, 'enter').click(); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
    await page.waitForSelector('.coast-sample canvas'); await wait(600);
    const s = await page.evaluate(() => ({ test: typeof window.__bincovSample, bincov: typeof window.__bincov, world: document.querySelector('#run-world')?.value ?? null, roots: document.querySelectorAll('.coast-sample').length }));
    assert.equal(s.test, 'undefined'); assert.equal(s.bincov, 'undefined'); assert.equal(s.roots, 1);
    return s;
  });
  await context.close();
  const plain = await open('?test=1');
  await step('W16 the ordinary entry is unchanged: residential raids still use the Phaser RaidScene', async () => {
    const page = plain.page;
    await action(page, 'enter').click(); await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
    await page.waitForFunction(() => !!window.__bincov.app.raid?.player?.active);
    const s = await page.evaluate(() => ({ sample: document.querySelectorAll('.coast-sample').length, coastSample: !!window.__bincov.app.coastSample, canvases: document.querySelectorAll('canvas').length }));
    assert.equal(s.sample, 0); assert.equal(s.coastSample, false);
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
