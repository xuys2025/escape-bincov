/** Controlled world fixtures, real wheel/key input on the 2.5D raid host. HTTP mode is diagnostic, not offline acceptance. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls } from './stall-resume.mjs';
import { batch, drive, frames, panel, raidReady, waitPanel } from './raid-view.mjs';
import { BUILDING_WORLD } from '../src/building-world.ts';
import { corridor, traversable } from '../src/spatial.ts';

const entry = process.env.BINCOV_TEST_URL || pathToFileURL(resolve('dist/index.html')).href;
const url = new URL(entry);
if (url.protocol !== 'file:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))
  throw new Error('BINCOV_TEST_URL must use file:// or a local HTTP server.');
url.searchParams.set('test', '1'); url.searchParams.set('entry', 'tabs');
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const report = { mode: url.protocol === 'file:' ? 'offline' : 'local HTTP diagnostic', browser: '', results: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();

// Real body-walkable points of the deployed street map separated by a wall inside the 43 px interaction range, found
// with the Runtime's own rule (body clearance 10, no body corridor). East of the resident block, so no door is involved.
const street = { definition: BUILDING_WORLD.maps.coast, doors: {}, highTide: false };
const W = street.definition.cells[0].length * 32, H = street.definition.cells.length * 32;
let occluded;
for (let y = 16; y < H && !occluded; y += 16) for (let x = 21 * 32; x < W && !occluded; x += 16) {
  if (!traversable(street, { x, y }, 'body', 10)) continue;
  for (const dx of [-24, 0, 24]) for (const dy of [-24, 0, 24]) {
    const a = { x, y }, b = { x: x + dx, y: y + dy };
    if (!occluded && traversable(street, b, 'body', 10) && !corridor(street, a, b, 'body', 10)) occluded = { a, b };
  }
}
assert.ok(occluded, 'The line-of-sight fixture uses actual map geometry');

async function suite(viewport, touch = false) {
  const label = `${viewport.width}x${viewport.height}${touch ? '-touch' : ''}`;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, offline: url.protocol === 'file:' });
  await resumeStalls(context);
  const errors = [], external = [];
  await context.route(/^https?:/, route => {
    if (url.protocol === 'http:' && new URL(route.request().url()).origin === url.origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const action = name => page.locator(`[data-action="${name}"]`);
  const doButton = name => page.locator(`.coast-sample [data-do="${name}"]`);
  // Published raid state: host panel, loot context, clock, player, magazine, the source list (rows and selection).
  const state = () => page.evaluate(() => {
    const h = window.__bincovSample.host, b = h.lastBatch;
    return { panel: h.panel, target: h.services.lootContext()?.containerId, elapsed: b.stamp.simulationTime, x: b.frame.player.x, y: b.frame.player.y, mag: b.frame.hud.weapon.mag,
      phase: b.frame.phase, choices: (b.frame.interaction?.choices ?? []).map(c => c.id),
      selected: document.querySelector('.coast-sample [data-choices]:not([hidden]) li[aria-current]')?.getAttribute('data-id') ?? null,
      rows: [...document.querySelectorAll('.coast-sample [data-choices]:not([hidden]) li[data-id]')].map(el => ({ id: el.dataset.id, text: el.textContent })),
      enemies: b.frame.actors.filter(a => a.alive).map(a => [a.uid, Math.round(a.x), Math.round(a.y), a.state.ai]).join(';') };
  });
  /** The wheel is read on the canvas: use a point the HUD does not cover. */
  const canvasPoint = () => page.evaluate(({ w, h }) => {
    for (const [x, y] of [[w * .72, h * .62], [w * .3, h * .62], [w * .72, h * .38], [w * .3, h * .38], [w * .5, h * .78]])
      if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y };
    throw new Error('No free canvas point');
  }, { w: viewport.width, h: viewport.height });
  const wheel = async delta => { const p = await canvasPoint(); await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, delta); await frames(page, 2); };
  const selected = id => page.waitForFunction(value => document.querySelector('.coast-sample [data-choices]:not([hidden]) li[aria-current]')?.getAttribute('data-id') === value, id);
  /** Move one container (and nothing else) through the session's transaction; the attached Runtime restores it. */
  const moveContainer = (id, at) => page.evaluate(({ id, at }) => {
    const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => {
      const r = d.expansion.raid, c = r.maps[r.currentMap].containers.find(c => c.id === id); Object.assign(c, at);
    });
    if (!t || s.commitExpansionMutation(t) !== 'committed') throw new Error(`Container move rejected: ${window.__bincov.app.storageError}`);
  }, { id, at });
  const step = async (name, work) => {
    const result = { viewport: label, name, status: 'running' }; report.results.push(result);
    try { await work(); assert.deepEqual(errors, []); assert.deepEqual(external, []); result.status = 'passed'; console.log(`PASS ${label}: ${name}`); }
    catch (error) { result.status = 'failed'; result.error = error.stack; result.state = await state().catch(() => null); await page.screenshot({ path: resolve(out, `loot-target-failed-${label}.png`) }); throw error; }
  };
  try {
    await page.goto(url.href); await action('enter').click(); await page.locator('#seed').fill('42'); await action('deploy').click();
    await raidReady(page);
    // Fixture: an outdoor crate with two scavengers killed on it through the Runtime's own damage path (one corpse
    // container each), then the three inventories set through the session's transaction. Enemies stay frozen.
    const fixture = await page.evaluate(() => {
      const { app, saveSession } = window.__bincov, h = window.__bincovSample.host, driver = window.__bincovSample.driver;
      driver.freezeAI(true);
      const crate = h.lastBatch.frame.containers.filter(c => c.kind === 'crate' && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0];
      if (!crate) throw new Error('No outdoor crate for the fixture');
      const scavs = h.lastBatch.frame.actors.filter(a => a.kind === 'scav' && a.alive).slice(0, 2);
      for (const e of scavs) { driver.placeEnemy(e.uid, { x: crate.x, y: crate.y }); driver.kill(e.uid); }
      const corpses = scavs.map(e => `corpse-${e.uid}`);
      driver.placePlayer({ x: crate.x, y: crate.y }, 0, 'coast');
      const t = saveSession.prepareExpansionMutation(d => {
        const r = d.expansion.raid, boxes = r.maps[r.currentMap].containers, by = id => boxes.find(c => c.id === id);
        by(crate.id).inventory.items = []; by(corpses[0]).inventory.items = [];
        by(corpses[1]).inventory.items = [{ uid: 'target-fuse', id: 'fuse', qty: 1, x: 0, y: 0 }];
        Object.assign(d.expansion.body, { hp: 100, bleeding: false, pollution: 0 });
      });
      if (!t || saveSession.commitExpansionMutation(t) !== 'committed') throw new Error(`Overlapping fixture must pass strict validation: ${app.storageError}`);
      driver.weapon('pistol');
      return { crate: crate.id, corpses, x: crate.x, y: crate.y };
    });
    await frames(page, 4);
    await step('guide returns to pause on close and Escape; loot danger stays above item details', async () => {
      await page.keyboard.press('Escape'); await waitPanel(page, 'pause');
      await doButton('guide').click(); await page.locator('.coast-sample [data-panel] h2', { hasText: '行动指南' }).waitFor();
      let elapsed = (await state()).elapsed;
      await doButton('pause-back').click(); await page.locator('.coast-sample [data-do="resume"]').waitFor();
      assert.equal((await state()).panel, 'pause');
      await frames(page, 6); assert.equal((await state()).elapsed, elapsed, 'the guide keeps the raid paused');
      await doButton('guide').click(); await page.keyboard.press('Escape'); await frames(page, 6);
      assert.equal((await state()).panel, 'pause', 'Escape closes the guide back to the pause panel');
      assert.equal((await state()).elapsed, elapsed);
      await doButton('resume').click(); await waitPanel(page, null);
      if (touch) await page.locator(`.coast-sample [data-choices] li[data-id="${fixture.corpses[1]}"]`).tap();
      else { for (let i = 0; i < 3 && (await state()).selected !== fixture.corpses[1]; i++) await wheel(100); await selected(fixture.corpses[1]); await page.keyboard.press('e'); }
      await waitPanel(page, 'loot');
      await page.locator('.coast-sample [data-uid="target-fuse"]').click();
      // The loot window's own danger line names a blow at once (the world keeps running while looting).
      await drive(page, 'hurt', 3);
      await page.waitForFunction(() => /正在遭受攻击/.test(document.querySelector('.coast-sample [data-panel] [data-risk]')?.textContent ?? ''), null, { timeout: 15000 });
      await drive(page, 'vitals', { bleeding: true, pollution: 80 });
      await frames(page, 10);
      assert.equal((await state()).panel, 'loot');
      // Health, time left, bleeding and pollution stay readable above the item details: in the loot window's danger
      // line everywhere, and in the HUD status where the docked panel leaves it uncovered (not on a short phone).
      await page.waitForFunction(() => /生命\s*\d+.*封锁倒计时.*流血.*污染/.test(document.querySelector('.coast-sample [data-panel] [data-risk]').textContent));
      const risk = await page.locator('.coast-sample [data-panel] [data-risk]').boundingBox(), details = await page.locator('.coast-sample .cs-details').boundingBox(), sheet = await page.locator('.coast-sample [data-panel]').boundingBox();
      assert.ok(risk && risk.y >= 0 && risk.y + risk.height <= viewport.height && risk.x >= 0 && risk.x + risk.width <= viewport.width + 1, 'The danger line is on screen');
      assert.ok(risk.y + risk.height <= details.y + 1, 'The danger line stays above the item details');
      if (!touch) {
        await page.waitForFunction(() => /流血.*污染/.test(document.querySelector('.coast-sample [data-state]').textContent));
        const status = await page.locator('.coast-sample .cs-status').boundingBox();
        assert.ok(status.y >= 0 && status.y + status.height <= viewport.height);
        assert.ok(status.y + status.height <= sheet.y + 1 || status.x + status.width <= sheet.x + 1, 'The docked panel must not cover the HUD status');
      }
      assert.ok(details.y >= sheet.y - 1, 'Details stay inside the panel');
      elapsed = (await state()).elapsed; await page.waitForFunction(t => window.__bincovSample.host.lastBatch.stamp.simulationTime > t, elapsed);
      await page.screenshot({ path: resolve(out, `loot-danger-${label}.png`) });
      await drive(page, 'vitals', { hp: 100, bleeding: false, pollution: 0 });
      await page.locator('.coast-sample [data-panel] [data-do="close"]').click(); await waitPanel(page, null);
    });
    if (touch) {
      await step('phone taps an exact source, including an empty corpse, and closes before choosing another', async () => {
        await page.waitForFunction(() => document.querySelector('.coast-sample [data-act]')?.textContent === '搜刮');
        await page.waitForFunction(() => document.querySelectorAll('.coast-sample [data-choices]:not([hidden]) li[data-id]').length === 3);
        await page.locator(`.coast-sample [data-choices] li[data-id="${fixture.corpses[0]}"]`).tap();
        await waitPanel(page, 'loot');
        const id = (await state()).target; assert.equal(id, fixture.corpses[0]); await page.mouse.wheel(0, 100); await frames(page, 2); assert.equal((await state()).target, id);
        await page.locator('.coast-sample [data-panel] [data-do="close"]').tap(); await waitPanel(page, null);
        await page.locator(`.coast-sample [data-choices] li[data-id="${fixture.corpses[1]}"]`).tap(); await waitPanel(page, 'loot');
        assert.equal((await state()).target, fixture.corpses[1]);
      });
      return;
    }
    await step('all overlapping sources appear, empty sources remain and same-name corpses have distinct numbers', async () => {
      await page.waitForFunction(() => document.querySelectorAll('.coast-sample [data-choices]:not([hidden]) li[data-id]').length === 3);
      const s = await state(); assert.deepEqual(new Set(s.rows.map(r => r.id)), new Set([fixture.crate, ...fixture.corpses]));
      assert.match(s.rows.find(r => r.id === fixture.corpses[0]).text, /1 · 已搜空$/);
      assert.match(s.rows.find(r => r.id === fixture.corpses[1]).text, /2$/);
      assert.match(s.rows.find(r => r.id === fixture.crate).text, /已搜空$/);
      await frames(page, 20); // the camera settles on the placed player before the capture
      await page.screenshot({ path: resolve(out, `loot-targets-${label}.png`) });
    });
    await step('wheel moves both ways, wraps, and E opens exactly the highlighted source', async () => {
      const s = await state(), index = s.rows.findIndex(r => r.id === s.selected), next = s.rows[(index + 1) % 3].id;
      await wheel(100); await selected(next); await wheel(-100); await selected(s.selected);
      await wheel(-100); await selected(s.rows[(index + 2) % 3].id);
      await wheel(100); await selected(s.selected);
      for (let i = 0; i < 3 && (await state()).selected !== fixture.corpses[1]; i++) await wheel(100);
      await selected(fixture.corpses[1]); await page.keyboard.press('e');
      await waitPanel(page, 'loot');
      assert.equal((await state()).target, fixture.corpses[1]);
      assert.equal(await page.locator('.coast-sample [data-source="container"][data-uid="target-fuse"]').count(), 1);
    });
    await step('wheel cannot switch a source inside loot, inventory or pause; closing preserves selection', async () => {
      await page.mouse.wheel(0, 100); await frames(page, 2); assert.equal((await state()).target, fixture.corpses[1]);
      assert.equal(await page.locator('.coast-sample [data-prompt]').isVisible(), false);
      assert.equal(await page.locator('.coast-sample [data-choices]').isVisible(), false);
      await page.keyboard.press('Escape'); await waitPanel(page, null); await selected(fixture.corpses[1]);
      for (const key of ['Tab', 'Escape']) {
        const before = (await state()).selected;
        await page.keyboard.press(key); await page.waitForFunction(() => !!window.__bincovSample.host.panel); await page.mouse.wheel(0, 100); await frames(page, 2);
        await page.keyboard.press('Escape'); await waitPanel(page, null); await selected(before);
      }
    });
    await step('movement, gunfire, clock and enemies continue while the list is visible', async () => {
      // Enemies run for this step; movement and the shot use real input. The walk starts 40 px out (reach is 43 px) and
      // heads across the sources while aiming precisely (right button, 0.7 of the walking speed), so the first walking
      // frame keeps them in reach unless that frame lasts over a second (CI draws this scene at a few frames per second).
      // Every frame is recorded in the page, and the list and its selection are read on the first frame the player moved.
      const edge = [[-40, 0, 'd'], [40, 0, 'a'], [0, -40, 's'], [0, 40, 'w']].map(([dx, dy, key]) => ({ x: fixture.x + dx, y: fixture.y + dy, key }))
        .find(p => traversable(street, p, 'body', 10) && corridor(street, p, fixture, 'body', 10));
      assert.ok(edge, 'a walkable start at the edge of reach with a clear walk across the sources');
      await drive(page, 'placePlayer', { x: edge.x, y: edge.y }, 0, 'coast'); await selected(fixture.corpses[1]);
      // Enemies near the fixture are parked far away first (the far ones keep acting): a slow machine lets the AI run for
      // several seconds here, long enough for a neighbour to walk over and kill the player.
      const parking = [];
      for (let r = 640; r < 3000 && parking.length < 24; r += 48) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = { x: fixture.x + dx * r, y: fixture.y + dy * r };
        if (traversable(street, p, 'body', 10)) parking.push(p);
      }
      const parked = await page.evaluate(({ fixture, parking }) => {
        const h = window.__bincovSample.host, d = window.__bincovSample.driver, near = h.lastBatch.frame.actors.filter(a => a.kind !== 'player' && a.alive && Math.hypot(a.x - fixture.x, a.y - fixture.y) < 600);
        near.forEach((a, i) => d.placeEnemy(a.uid, parking[i]));
        return near.length;
      }, { fixture, parking });
      assert.ok(parked <= parking.length, 'every enemy near the fixture has a parking spot');
      await drive(page, 'freezeAI', false);
      const before = await state();
      await page.evaluate(() => {
        const h = window.__bincovSample.host, seen = window.__walk = { frames: [], done: false };
        const f = () => {
          const b = h.lastBatch, list = document.querySelector('.coast-sample [data-choices]:not([hidden])');
          seen.frames.push({ x: b.frame.player.x, y: b.frame.player.y, selected: (b.frame.interaction?.choices ?? []).find(c => c.selected)?.id ?? null,
            shown: list?.querySelector('li[aria-current]')?.getAttribute('data-id') ?? null });
          if (!seen.done && seen.frames.length < 2000) requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      });
      const p = await canvasPoint(); await page.mouse.move(p.x, p.y); await page.mouse.down({ button: 'right' });
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.player.state.precise);
      await page.keyboard.down(edge.key);
      try { await page.waitForFunction(p => { const q = window.__bincovSample.host.lastBatch.frame.player; return q.x !== p.x || q.y !== p.y; }, before, { timeout: 15000 }); }
      finally { await page.keyboard.up(edge.key); }
      const walk = await page.evaluate(() => { window.__walk.done = true; return window.__walk.frames; });
      const moved = walk.find(r => r.x !== before.x || r.y !== before.y);
      assert.ok(moved, 'a frame with the player moved was recorded');
      assert.equal(moved.selected, fixture.corpses[1], 'walking keeps the selected source');
      assert.equal(moved.shown, fixture.corpses[1], 'the list shows the selected source while walking');
      // The shot: a left press while the right button is held (precise aim), the same chord the HUD offers.
      try { await page.mouse.down(); await page.mouse.up(); await page.waitForFunction(m => window.__bincovSample.host.lastBatch.frame.hud.weapon.mag === m - 1, before.mag); }
      finally { await page.mouse.up({ button: 'right' }); }
      await page.waitForFunction(e => { const b = window.__bincovSample.host.lastBatch; return b.frame.actors.filter(a => a.alive).map(a => [a.uid, Math.round(a.x), Math.round(a.y), a.state.ai]).join(';') !== e; }, before.enemies);
      const after = await state(); assert.ok(after.x !== before.x || after.y !== before.y, 'real movement'); assert.equal(after.mag, before.mag - 1);
      assert.ok(after.elapsed > before.elapsed); assert.notEqual(after.enemies, before.enemies, 'enemies keep acting');
      assert.equal(after.panel, null);
      await drive(page, 'freezeAI', true);
      await drive(page, 'placePlayer', { x: fixture.x, y: fixture.y }, 0, 'coast'); await frames(page, 4);
      // A long walking frame may have carried the player out of reach after that first frame; the next steps start
      // with the same selection as before, picked with the wheel.
      for (let i = 0; i < 3 && (await state()).selected !== fixture.corpses[1]; i++) await wheel(100);
      await selected(fixture.corpses[1]);
    });
    await step('ground loot beside a selected container is picked up one by one from 附近, while E still opens the container', async () => {
      // docs/LOOTING.md: with a container in reach, 附近 lists the ground items for pickup one by one.
      const uid = await drive(page, 'spawnLoot', 'bandage', 1, { x: fixture.x + 8, y: fixture.y }); await frames(page, 4);
      const s = await state();
      assert.ok(s.selected, 'a container stays selected');
      const toggle = page.locator('.coast-sample [data-choices] [data-near-toggle]');
      await toggle.waitFor(); assert.match(await toggle.innerText(), /附近 1/);
      await page.keyboard.press('e'); await waitPanel(page, 'loot');
      assert.equal((await state()).target, s.selected, 'E opens the selected container');
      await page.keyboard.press('Escape'); await waitPanel(page, null);
      const bandages = () => page.evaluate(() => window.__bincov.app.loadout.bag.items.filter(i => i.id === 'bandage').reduce((n, i) => n + i.qty, 0));
      const before = await bandages();
      await toggle.click();
      const row = page.locator(`.coast-sample [data-choices] [data-ground="${uid}"]`); await row.waitFor();
      assert.match(await row.innerText(), /拾取 · .+×1/);
      await row.click();
      await page.waitForFunction(uid => !window.__bincovSample.host.lastBatch.frame.loot.some(l => l.uid === uid), uid);
      assert.equal(await bandages(), before + 1, 'the picked item is in the bag');
      await page.waitForFunction(() => !document.querySelector('.coast-sample [data-choices] [data-near-toggle]'));
      assert.equal((await state()).selected, s.selected, 'the selected container is unchanged');
    });
    await step('a departing selection falls back to an accessible target without renumbering corpses', async () => {
      const away = [{ x: fixture.x + 100, y: fixture.y }, { x: fixture.x - 100, y: fixture.y }, { x: fixture.x, y: fixture.y + 100 }, { x: fixture.x, y: fixture.y - 100 }]
        .find(p => traversable(street, p, 'body', 10));
      await moveContainer(fixture.corpses[1], away);
      await page.waitForFunction(id => !document.querySelector(`.coast-sample [data-choices]:not([hidden]) li[data-id="${id}"]`), fixture.corpses[1]);
      const s = await state(); assert.ok(s.selected && s.selected !== fixture.corpses[1]);
      assert.match(s.rows.find(r => r.id === fixture.corpses[0]).text, /1 · 已搜空$/);
      await page.keyboard.press('e'); await waitPanel(page, 'loot');
      assert.equal((await state()).target, s.selected); await page.keyboard.press('Escape'); await waitPanel(page, null);
      await moveContainer(fixture.corpses[1], { x: fixture.x, y: fixture.y });
    });
    await step('crowded lists keep every target reachable and the selected row visible', async () => {
      await page.evaluate(fixture => {
        const h = window.__bincovSample.host, driver = window.__bincovSample.driver;
        for (const e of h.lastBatch.frame.actors.filter(a => a.alive && a.kind === 'scav').slice(0, 6)) { driver.placeEnemy(e.uid, { x: fixture.x, y: fixture.y }); driver.kill(e.uid); }
        if (!h.services.checkpoint()) throw new Error('Crowded fixture must remain recoverable');
      }, fixture);
      await page.waitForFunction(() => document.querySelectorAll('.coast-sample [data-choices]:not([hidden]) li[data-id]').length > 4);
      const count = (await state()).rows.length, seen = new Set();
      for (let i = 0; i < count; i++) {
        const s = await state(); seen.add(s.selected);
        // One synchronous read: the host redraws the list each frame.
        assert.ok(await page.evaluate(() => {
          const el = document.querySelector('.coast-sample [data-choices] li[aria-current]'); if (!el) return false;
          const row = el.getBoundingClientRect(), list = el.parentElement.getBoundingClientRect();
          return row.top >= list.top - 1 && row.bottom <= list.bottom + 1 && row.bottom <= innerHeight && row.top >= 0;
        }), 'The selected row stays visible');
        await wheel(100);
      }
      assert.equal(seen.size, count);
      await page.screenshot({ path: resolve(out, `loot-targets-crowded-${label}.png`) });
    });
    await step('leaving range removes stale targets and E cannot reopen a remote source', async () => {
      await drive(page, 'placePlayer', { x: 900, y: 784 }, 0, 'coast');
      await page.waitForFunction(() => !document.querySelector('.coast-sample [data-choices]:not([hidden]) li[data-id]'));
      await page.keyboard.press('e'); await frames(page, 4); assert.equal((await state()).panel, null);
    });
    await step('walls and high tide exclude inaccessible sources; selected flooded corpse disappears', async () => {
      await moveContainer(fixture.corpses[1], occluded.b); await drive(page, 'placePlayer', occluded.a, 0, 'coast'); await frames(page, 4);
      assert.ok(!(await state()).choices.includes(fixture.corpses[1]), 'a source behind a wall is not offered');
      // The red-tide pool by the sea wall is dry at low tide (seed 42 starts low) and floods at the tide change.
      const pool = { x: 63 * 32 + 16, y: 10 * 32 + 16 };
      await moveContainer(fixture.corpses[1], pool); await drive(page, 'placePlayer', pool, 0, 'coast');
      await page.waitForFunction(id => window.__bincovSample.host.lastBatch.frame.interaction?.choices.some(c => c.id === id && c.selected) ?? window.__bincovSample.host.lastBatch.frame.interaction?.ref.id === id, fixture.corpses[1]);
      assert.equal((await batch(page)).frame.highTide, false);
      await drive(page, 'clock', 299.6);
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.highTide, null, { timeout: 30000 });
      await page.waitForFunction(id => !(window.__bincovSample.host.lastBatch.frame.interaction?.choices ?? []).some(c => c.id === id) && window.__bincovSample.host.lastBatch.frame.interaction?.ref.id !== id, fixture.corpses[1]);
    });
    await step('extraction takes priority even with a container under the player', async () => {
      const exit = (await batch(page)).map.exits[0].at;
      await moveContainer(fixture.corpses[1], exit); await drive(page, 'placePlayer', exit, 0, 'coast'); await drive(page, 'vitals', { bleeding: false });
      await page.waitForFunction(() => document.querySelector('.coast-sample [data-prompt]')?.textContent.includes('撤离'));
      await wheel(100); assert.equal(await page.locator('.coast-sample [data-choices]:not([hidden]) li[data-id]').count(), 0);
      // The host's panel on every frame while E is held, until the ending: the extraction wins over the container.
      await page.evaluate(() => {
        const seen = window.__panelsWhileE = [], h = window.__bincovSample.host;
        const f = () => { seen.push({ panel: h.panel, at: h.lastBatch.stamp.simulationTime }); if (h.lastBatch.frame.phase !== 'ending') requestAnimationFrame(f); }; requestAnimationFrame(f);
      });
      await page.keyboard.down('e');
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'ending', null, { timeout: 30000 });
      await page.keyboard.up('e');
      const watched = await page.evaluate(() => window.__panelsWhileE), panels = watched.map(w => w.panel);
      // The watch covers the whole three-second hold, however many frames the machine drew in that time.
      const span = watched.at(-1).at - watched[0].at;
      assert.ok(watched.length >= 3 && span >= 2.5, `frames seen while E is held: ${watched.length} over ${span.toFixed(2)} s`);
      assert.deepEqual([...new Set(panels.filter(p => p !== 'ending'))], [null], 'E held for extraction never opens a panel');
      await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'), null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.__bincov.app.save.lastResult?.outcome), 'extract');
    });
  } finally { await context.close(); }
}
try {
  await suite({ width: 1280, height: 720 });
  await suite({ width: 1920, height: 1080 });
  await suite({ width: 844, height: 390 }, true);
} finally {
  await writeFile(resolve(out, 'loot-target-report.json'), JSON.stringify(report, null, 2)); await browser.close();
}
