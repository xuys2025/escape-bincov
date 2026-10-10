/** Controlled world fixtures, real wheel/key input. HTTP mode is diagnostic, not offline acceptance. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { isWalkable, lineOfSight, WORLD_W, WORLD_H } from '../src/world.ts';

const entry = process.env.BINCOV_TEST_URL || pathToFileURL(resolve('dist/index.html')).href;
const url = new URL(entry);
if (url.protocol !== 'file:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))
  throw new Error('BINCOV_TEST_URL must use file:// or a local HTTP server.');
url.searchParams.set('test', '1'); url.searchParams.set('entry', 'tabs');
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const report = { mode: url.protocol === 'file:' ? 'offline' : 'local HTTP diagnostic', browser: '', results: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();

// Find real walkable points separated by a wall within the existing 43px interaction range.
let occluded;
for (let y = 16; y < WORLD_H && !occluded; y += 16) for (let x = 16; x < WORLD_W && !occluded; x += 16) {
  if (!isWalkable(x, y, false)) continue;
  for (const dx of [-24, 0, 24]) for (const dy of [-24, 0, 24]) {
    const a = { x, y }, b = { x: x + dx, y: y + dy };
    if (isWalkable(b.x, b.y, false) && !lineOfSight(a, b, false, 10)) occluded = { a, b };
  }
}
assert.ok(occluded, 'The LOS fixture uses actual map geometry');

async function suite(viewport, touch = false) {
  const label = `${viewport.width}x${viewport.height}${touch ? '-touch' : ''}`;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, offline: url.protocol === 'file:' });
  const errors = [], external = [];
  await context.route(/^https?:/, route => {
    if (url.protocol === 'http:' && new URL(route.request().url()).origin === url.origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  const action = name => page.locator(`[data-action="${name}"]`);
  const state = () => page.evaluate(() => {
    const a = window.__bincov.app, r = a.raid;
    return { overlay: a.overlay, target: a.lootContext?.containerId, elapsed: r.elapsed, x: r.player.x, y: r.player.y, mag: r.mag,
      lastStall: r.lastStall,
      selected: document.querySelector('.loot-targets [aria-current]')?.getAttribute('data-loot-target'),
      rows: [...document.querySelectorAll('[data-loot-target]')].map(el => ({ id: el.dataset.lootTarget, text: el.textContent })),
      enemyTimer: r.enemies.find(e => e.hp > 0)?.timer };
  });
  const wheel = async delta => {
    await page.mouse.move(viewport.width / 2, viewport.height / 2); await page.mouse.wheel(0, delta);
    await page.waitForTimeout(80); // Wheel delivery and HUD painting happen on subsequent browser frames.
  };
  const selected = id => page.waitForFunction(value => document.querySelector('.loot-targets [aria-current]')?.getAttribute('data-loot-target') === value, id);
  const step = async (name, work) => {
    const result = { viewport: label, name, status: 'running' }; report.results.push(result);
    try { await work(); assert.deepEqual(errors, []); assert.deepEqual(external, []); result.status = 'passed'; console.log(`PASS ${label}: ${name}`); }
    catch (error) { result.status = 'failed'; result.error = error.stack; result.state = await state(); await page.screenshot({ path: resolve(out, `loot-target-failed-${label}.png`) }); throw error; }
  };
  try {
    await page.goto(url.href); await action('enter').click(); await page.locator('#seed').fill('42'); await action('deploy').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
    const fixture = await page.evaluate(() => {
      const a = window.__bincov.app, r = a.raid, crate = r.containers[0];
      r.enemies.forEach(e => { e.sprite.setPosition(208, 1456); e.home = e.target = { x: 208, y: 1456 }; e.timer = e.cooldown = 9999; e.path = []; e.state = 'patrol'; });
      r.loot.forEach(l => l.sprite.setPosition(208, 1456));
      const enemies = r.enemies.filter(e => e.id === 'scav').slice(0, 2);
      for (const e of enemies) { e.sprite.setPosition(crate.x, crate.y); r.damageEnemy(e, 10000); }
      const corpses = enemies.map(e => r.containers.find(c => c.id === `corpse-${e.uid}`));
      crate.inventory.items = []; corpses[0].inventory.items = [];
      corpses[1].inventory.items = [{ uid: 'target-fuse', id: 'fuse', qty: 1, x: 0, y: 0 }];
      r.player.setPosition(crate.x, crate.y); r.hp = 100; r.bleeding = 0; r.mag = 8; r.syncMagazine();
      if (!r.checkpoint()) throw new Error('Overlapping fixture must pass strict checkpoint validation');
      return { crate: crate.id, corpses: corpses.map(c => c.id), name: corpses[0].name, x: crate.x, y: crate.y };
    });
    await step('guide returns to pause on close and Escape; loot danger stays above item details', async () => {
      await page.keyboard.press('Escape'); await action('help').click();
      let elapsed = (await state()).elapsed;
      await action('close').click(); assert.equal((await state()).overlay, 'pause');
      await page.waitForTimeout(100); assert.equal((await state()).elapsed, elapsed);
      await action('help').click(); await page.keyboard.press('Escape'); assert.equal((await state()).overlay, 'pause');
      await action('close').click();
      if (touch) await page.locator(`[data-loot-target="${fixture.corpses[1]}"] button`).tap();
      else { for (let i = 0; i < 3 && (await state()).selected !== fixture.corpses[1]; i++) await wheel(100); await page.keyboard.press('e'); }
      await page.locator('[data-uid="target-fuse"]').click();
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.hurt(3); r.bleeding = 1; r.pollution = 80; r.updateHud(); });
      assert.equal((await state()).overlay, 'loot');
      assert.match(await page.locator('#loot-hit').innerText(), /攻击/);
      assert.match(await page.locator('#loot-condition').innerText(), /流血.*污染/);
      const header = await page.locator('.loot-header').boundingBox(), detail = await page.locator('.loot-details').boundingBox();
      assert.ok(header.y >= 0 && header.y + header.height <= viewport.height);
      assert.ok(detail.y >= header.y + header.height - 1, 'Details must not cover fixed danger header');
      elapsed = (await state()).elapsed; await page.waitForTimeout(200); assert.ok((await state()).elapsed > elapsed);
      await page.screenshot({ path: resolve(out, `loot-danger-${label}.png`) });
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.bleeding = 0; r.pollution = 0; r.hp = 100; });
      await action('close').click();
    });
    if (touch) {
      await step('phone taps an exact source, including an empty corpse, and closes before choosing another', async () => {
        await page.waitForFunction(() => document.querySelector('#touch-interact')?.textContent === '搜刮');
        assert.equal(await page.locator('[data-loot-target]').count(), 3);
        await page.locator(`[data-loot-target="${fixture.corpses[0]}"] button`).tap();
        await page.waitForFunction(() => window.__bincov.app.overlay === 'loot');
        const id = (await state()).target; assert.equal(id, fixture.corpses[0]); await wheel(100); assert.equal((await state()).target, id);
        await action('close').tap(); await page.locator(`[data-loot-target="${fixture.corpses[1]}"] button`).tap();
        assert.equal((await state()).target, fixture.corpses[1]);
      });
      return;
    }
    await step('all overlapping sources appear, empty sources remain and same-name corpses have distinct numbers', async () => {
      await page.waitForFunction(() => document.querySelectorAll('[data-loot-target]').length === 3);
      const s = await state(); assert.deepEqual(new Set(s.rows.map(r => r.id)), new Set([fixture.crate, ...fixture.corpses]));
      assert.match(s.rows.find(r => r.id === fixture.corpses[0]).text, /1 · 已搜空/);
      assert.match(s.rows.find(r => r.id === fixture.corpses[1]).text, /2$/);
      assert.match(s.rows.find(r => r.id === fixture.crate).text, /已搜空/);
      await page.waitForTimeout(350); // Let the camera settle after the position fixture.
      await page.screenshot({ path: resolve(out, `loot-targets-${label}.png`) });
    });
    await step('wheel moves both ways, wraps, and E opens exactly the highlighted source', async () => {
      const s = await state(), index = s.rows.findIndex(r => r.id === s.selected), next = s.rows[(index + 1) % 3].id;
      await wheel(100); await selected(next); await wheel(-100); await selected(s.selected);
      await wheel(-100); await selected(s.rows[(index + 2) % 3].id);
      await wheel(100); await selected(s.selected);
      for (let i = 0; i < 3 && (await state()).selected !== fixture.corpses[1]; i++) { await wheel(100); await page.waitForTimeout(80); }
      await selected(fixture.corpses[1]); await page.keyboard.press('e');
      await page.waitForFunction(() => window.__bincov.app.overlay === 'loot');
      assert.equal((await state()).target, fixture.corpses[1]);
      assert.equal(await page.locator('[data-source="container"][data-uid="target-fuse"]').count(), 1);
    });
    await step('wheel cannot switch a source inside loot, inventory or pause; closing preserves selection', async () => {
      await wheel(100); assert.equal((await state()).target, fixture.corpses[1]);
      assert.equal(await page.locator('#interaction').isVisible(), false);
      await page.keyboard.press('Escape'); await selected(fixture.corpses[1]);
      for (const key of ['Tab', 'Escape']) {
        const before = (await state()).selected;
        await page.keyboard.press(key); await page.waitForFunction(() => !!window.__bincov.app.overlay); await wheel(100);
        await page.keyboard.press('Escape'); await selected(before);
      }
    });
    await step('movement, gunfire, clock and enemies continue while the list is visible', async () => {
      const before = await state(); await page.keyboard.down('d'); await page.waitForTimeout(80); await page.keyboard.up('d');
      await page.mouse.click(viewport.width / 2, viewport.height / 2); await page.waitForTimeout(180);
      const after = await state(); assert.notEqual(after.x, before.x); assert.equal(after.mag, before.mag - 1);
      assert.ok(after.elapsed > before.elapsed); assert.ok(after.enemyTimer < before.enemyTimer);
      assert.equal(after.overlay, ''); assert.equal(after.selected, before.selected);
    });
    await step('ground loot remains accessible beside a selected container', async () => {
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.spawnLoot(r.player.x, r.player.y, 'sample', 1); });
      await page.locator('#interaction [data-action="nearby"]').click();
      await action('pickup-loot').click(); await page.waitForFunction(() => window.__bincov.app.loadout.bag.items.some(i => i.id === 'sample'));
      await page.keyboard.press('Escape'); await selected(fixture.corpses[1]);
    });
    await step('a departing selection falls back to an accessible target without renumbering corpses', async () => {
      await page.evaluate(id => { window.__bincov.app.raid.getLootContainer(id).x += 100; }, fixture.corpses[1]);
      await page.waitForFunction(id => !document.querySelector(`[data-loot-target="${id}"]`), fixture.corpses[1]);
      const s = await state(); assert.ok(s.selected && s.selected !== fixture.corpses[1]);
      assert.match(s.rows.find(r => r.id === fixture.corpses[0]).text, /1 · 已搜空/);
      await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincov.app.overlay === 'loot');
      assert.equal((await state()).target, s.selected); await page.keyboard.press('Escape');
      await page.evaluate(id => { window.__bincov.app.raid.getLootContainer(id).x -= 100; }, fixture.corpses[1]);
    });
    await step('crowded lists keep every target reachable and the selected row visible', async () => {
      await page.evaluate(fixture => {
        const r = window.__bincov.app.raid;
        for (const e of r.enemies.filter(e => e.hp > 0 && e.id === 'scav').slice(0, 6)) {
          e.sprite.setPosition(fixture.x, fixture.y); r.damageEnemy(e, 10000);
        }
        if (!r.checkpoint()) throw new Error('Crowded fixture must remain recoverable');
      }, fixture);
      await page.waitForFunction(() => document.querySelectorAll('[data-loot-target]').length > 4);
      const count = (await state()).rows.length, seen = new Set();
      for (let i = 0; i < count; i++) {
        const s = await state(); seen.add(s.selected);
        assert.ok(await page.locator('.loot-targets [aria-current]').evaluate(el => {
          const row = el.getBoundingClientRect(), list = el.parentElement.getBoundingClientRect();
          return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
        }));
        await wheel(100);
      }
      assert.equal(seen.size, count);
      await page.screenshot({ path: resolve(out, `loot-targets-crowded-${label}.png`) });
    });
    await step('leaving range removes stale targets and E cannot reopen a remote source', async () => {
      await page.evaluate(() => { window.__bincov.app.raid.player.setPosition(900, 784); });
      await page.waitForFunction(() => !document.querySelector('[data-loot-target]'));
      await page.keyboard.press('e'); assert.equal((await state()).overlay, '');
    });
    await step('walls and high tide exclude inaccessible sources; selected flooded corpse disappears', async () => {
      await page.evaluate(({ occluded, id }) => {
        const r = window.__bincov.app.raid, c = r.getLootContainer(id);
        r.highTide = false; r.player.setPosition(occluded.a.x, occluded.a.y); c.x = occluded.b.x; c.y = occluded.b.y;
      }, { occluded, id: fixture.corpses[1] });
      await page.waitForTimeout(100); assert.ok(!(await state()).rows.some(r => r.id === fixture.corpses[1]));
      await page.evaluate(id => {
        const r = window.__bincov.app.raid, c = r.getLootContainer(id);
        c.x = 63 * 32 + 16; c.y = 10 * 32 + 16; r.player.setPosition(c.x, c.y); r.highTide = false;
      }, fixture.corpses[1]); await selected(fixture.corpses[1]);
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.elapsed = r.config.tideAt - .01; });
      await page.waitForFunction(() => window.__bincov.app.raid.highTide);
      await page.waitForFunction(() => !document.querySelector('[data-loot-target]'));
    });
    await step('extraction takes priority even with a container under the player', async () => {
      await page.evaluate(id => {
        const r = window.__bincov.app.raid, exit = r.config.exits[0], c = r.getLootContainer(id);
        c.x = exit.x; c.y = exit.y; r.player.setPosition(exit.x, exit.y); r.hitTime = 0; r.bleeding = 0;
      }, fixture.corpses[1]);
      await page.waitForFunction(() => document.querySelector('#interaction')?.textContent.includes('撤离'));
      await wheel(100); assert.equal(await page.locator('[data-loot-target]').count(), 0);
      await page.keyboard.down('e'); await page.waitForFunction(() => window.__bincov.app.state === 'result'); await page.keyboard.up('e');
      assert.equal(await page.locator('.loot-modal').count(), 0);
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
