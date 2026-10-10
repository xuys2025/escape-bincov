/** Offline acceptance. Fixtures accelerate travel/time; input and settlement stay real. */
import { placeAt } from './inventory-actions.mjs';
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { executablePath, browserOptions } from './browser-options.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test-results');
const smoke = process.argv.includes('--smoke');
const entry = join(root, 'dist', 'index.html');
const url = pathToFileURL(entry).href + '?test=1&entry=tabs';
const SAVE_KEY = 'escape-bincov.session.v2';
const report = {
  startedAt: new Date().toISOString(), mode: smoke ? 'smoke' : 'full', entry: url,
  browser: executablePath, offline: true, viewports: [], screenshots: [],
  methodology: [
    'Each viewport uses a fresh isolated browser context and the single file:// HTML; no development server.',
    'HTTP(S) access is blocked and attempted requests fail acceptance.',
    'Travel, enemy positions, health and elapsed time use explicit test fixtures. Movement, aiming, firing, looting, dragging and extraction use browser input.',
    'Success, combat death and timeout are three consecutive runs per context, followed by reload and a fourth interrupted run.',
    'FPS is sampled from Phaser actualFps and requestAnimationFrame in headless Chrome; this is not a claim about every physical GPU.',
    'The test does not establish 30–60 minutes of subjective replay value or natural ten-minute difficulty balance.',
  ],
};
await access(entry);
await access(executablePath);
await mkdir(out, { recursive: true });

const browser = await chromium.launch(browserOptions);
report.browserVersion = browser.version();
let activePage;

function rounded(value) { return Math.round(value * 100) / 100; }
async function saveReport() { await writeFile(join(out, smoke ? 'browser-smoke.json' : 'browser-report.json'), JSON.stringify(report, null, 2)); }

async function suite(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, offline: true });
  const record = { viewport, steps: [], errors: [], externalRequests: [], screenshots: [], fps: null };
  report.viewports.push(record);
  context.on('request', request => { if (/^https?:/i.test(request.url())) record.externalRequests.push(request.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => { window.__longTasks = []; new PerformanceObserver(list => { window.__longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))); }).observe({ entryTypes: ['longtask'] }); });
  page.on('pageerror', error => record.errors.push({ type: 'pageerror', message: error.stack || error.message }));
  page.on('console', message => { if (message.type() === 'error') record.errors.push({ type: 'console', message: message.text() }); });
  const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
  const waitState = state => page.waitForFunction(expected => window.__bincov?.app.state === expected, state);
  const hold = async (key, milliseconds) => { await page.keyboard.down(key); try { await page.waitForTimeout(milliseconds); } finally { await page.keyboard.up(key); } };
  const screenshot = async name => {
    const path = join(out, `${label}-${name}.png`);
    await page.screenshot({ path });
    record.screenshots.push(path); report.screenshots.push(path);
  };
  const state = () => page.evaluate(() => {
    const { app } = window.__bincov;
    return { state: app.state, cash: app.save.cash, stats: app.save.stats, safe: app.save.safe, bag: app.save.bag, stash: app.save.stash, equipment: app.save.equipment, quests: app.save.quests, activeRun: app.save.activeRun, result: app.save.lastResult, volume: app.save.settings.volume };
  });
  const run = () => page.evaluate(() => {
    const raid = window.__bincov.app.raid;
    return { x: raid.player.x, y: raid.player.y, rotation: raid.player.rotation, elapsed: raid.elapsed, hp: raid.hp, mag: raid.mag, high: raid.highTide, enemies: raid.enemies.length, alive: raid.enemies.filter(e => e.hp > 0).length, loot: raid.loot.length, crates: raid.config.containers.length, originalLootEntries: raid.loot.length + raid.config.containers.reduce((sum, container) => sum + container.items.length, 0), seed: raid.config.seed };
  });
  async function step(name, task) {
    const start = performance.now();
    const item = { name, status: 'running' };
    record.steps.push(item);
    try {
      const result = await task();
      assert.deepEqual(record.errors, [], 'Browser console/page errors');
      assert.deepEqual(record.externalRequests, [], 'The standalone build attempted external network access');
      item.status = 'passed';
      if (result !== undefined) item.detail = result;
      console.log(`PASS ${label} · ${name}`);
    } catch (error) {
      item.status = 'failed'; item.error = error.stack || String(error);
      record.failureState = await page.evaluate(() => ({overlay:__bincov.app.overlay,error:__bincov.app.storageError,elapsed:__bincov.app.raid?.elapsed,stall:__bincov.app.raid?.lastStall,now:performance.now(),longTasks:window.__longTasks.slice(-15)}));
      console.log(JSON.stringify(record.failureState));
      throw error;
    } finally { item.durationMs = rounded(performance.now() - start); await saveReport(); }
  }
  async function deploy(seed) {
    await page.locator('#seed').fill(String(seed));
    await action('deploy').click();
    await waitState('run');
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active && window.__bincov.app.raid.enemies.length === 25);
    assert.equal((await run()).seed, seed);
    const combat = await page.locator('#game canvas').boundingBox();
    const scale = Math.floor(Math.min(viewport.width / 960, viewport.height / 540));
    assert.equal(combat.width, 960 * scale); assert.equal(combat.height, 540 * scale);
    const sceneKeys = await page.evaluate(() => window.__bincov.app.game.scene.getScenes(true).map(scene => scene.scene.key));
    assert.deepEqual(sceneKeys, ['Raid'], 'Only the current scene may continue running');
  }
  async function aimAt(point) {
    const screen = await page.evaluate(({ x, y }) => {
      const { app } = window.__bincov, camera = app.raid.cameras.main;
      const box = app.game.canvas.getBoundingClientRect();
      return { x: box.x + ((x - camera.scrollX) * camera.zoom + camera.x) * box.width / 960, y: box.y + ((y - camera.scrollY) * camera.zoom + camera.y) * box.height / 540 };
    }, point);
    assert.ok(screen.x >= 0 && screen.x < viewport.width && screen.y >= 0 && screen.y < viewport.height, 'Fixture target must be visible');
    await page.mouse.move(screen.x, screen.y);
    await page.waitForTimeout(100);
    return screen;
  }
  async function settleCamera() { await page.waitForTimeout(550); }
  async function collectSample() {
    await page.evaluate(() => {
      const raid = window.__bincov.app.raid;
      raid.enemies.forEach(enemy => { enemy.cooldown = 9999; });
      const sample = raid.loot.find(item => item.id === 'sample');
      if (!sample) throw new Error('Guaranteed sample missing');
      raid.player.setPosition(sample.sprite.x, sample.sprite.y);
      raid.bleeding = 0; raid.hp = 100;
    });
    await settleCamera();
    await page.keyboard.press('e', { delay: 110 });
    await page.waitForFunction(() => window.__bincov.app.loadout.bag.items.some(item => item.id === 'sample'));
  }

  try {
    await step('offline viewport title and fixed logical canvas', async () => {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__bincov?.app.game?.canvas && window.__bincov.app.game.scene.isActive('Menu'));
      await action('enter').waitFor();
      assert.match(await page.locator('h1').innerText(), /逃离[\s\S]*滨科夫/);
      const bounds = await page.evaluate(() => {
        const game = window.__bincov.app.game, canvas = game.canvas, rect = canvas.getBoundingClientRect(), camera = game.scene.getScene('Menu').cameras.main;
        return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, renderWidth: canvas.width, renderHeight: canvas.height,
          logicalWidth: camera.width / camera.zoom, logicalHeight: camera.height / camera.zoom };
      });
      assert.equal(bounds.logicalWidth, 960); assert.equal(bounds.logicalHeight, 540);
      assert.equal(bounds.renderWidth, viewport.width); assert.equal(bounds.renderHeight, viewport.height);
      assert.equal(bounds.width, viewport.width); assert.equal(bounds.height, viewport.height);
      assert.equal(bounds.x, 0); assert.equal(bounds.y, 0);
      await screenshot('menu');
      return bounds;
    });
    await step('hideout, merchant price and pointer inventory drag', async () => {
      await action('enter').click(); await waitState('hideout');
      assert.deepEqual(await page.locator('#game canvas').evaluate(c => [c.width, c.height]), [960, 540], 'Menu render density must not leak into gameplay');
      // Hideout panels use the viewport; combat retains the fixed logical canvas.
      const bounds = await page.locator('#game canvas').boundingBox();
      assert.equal(bounds.width, Math.min(viewport.width, 1808)); assert.equal(bounds.height, viewport.height);
      assert.equal(bounds.x, (viewport.width - bounds.width) / 2);
      assert.equal(bounds.y, (viewport.height - bounds.height) / 2);
      const initial = await state();
      assert.equal(initial.bag.w, 6); assert.equal(initial.bag.h, 5);
      assert.equal(initial.safe.w, 2); assert.equal(initial.safe.h, 2);
      await action('tab', 'arms').click();
      await placeAt(page, 'merchant', 'ammo9', 'buy');
      assert.match(await page.locator('.shop-checkout').innerText(), /需付 ¥ 84/);
      assert.equal((await state()).cash, initial.cash);
      await action('checkout').click();
      const purchased = await state();
      assert.equal(purchased.cash, initial.cash - 84);
      const count = inv => inv.items.filter(item => item.id === 'ammo9').reduce((sum, item) => sum + item.qty, 0);
      assert.equal(count(purchased.stash), count(initial.stash) + 12);
      await action('tab', 'gear').click();
      const bandage = purchased.bag.items.find(item => item.id === 'bandage');
      assert.ok(bandage, 'Starter bandage is available for drag test');
      const grid = page.locator('[data-grid="bag"]');
      const geometry = await grid.evaluate(element => ({ width: element.getBoundingClientRect().width, cell: Number(element.dataset.cell), baseWidth: element.offsetWidth }));
      const scale = geometry.width / geometry.baseWidth;
      await page.locator(`[data-uid="${bandage.uid}"]`).dragTo(grid, { targetPosition: { x: 5.4 * geometry.cell * scale, y: 4.4 * geometry.cell * scale } });
      const moved = (await state()).bag.items.find(item => item.uid === bandage.uid);
      assert.equal(moved.x, 5); assert.equal(moved.y, 4);
      await page.locator(`[data-uid="${bandage.uid}"]`).click();
      await action('secure').click();
      assert.equal((await state()).safe.items.filter(item => item.id === 'bandage').reduce((sum,item)=>sum+item.qty,0),bandage.qty);
      assert.equal((await state()).bag.items.filter(item=>item.id==='bandage').length,0);
      await screenshot('hideout');
      return { purchasedRounds: 12, charged: 84, nativeDragCell: [5, 4], safeBandages: bandage.qty };
    });
    await step('seeded deployment: 25 enemies and 60 original loot entries across ground and crates', async () => {
      await deploy(42);
      const current = await run();
      assert.equal(current.enemies, 25); assert.equal(current.originalLootEntries, 60);
      assert.ok(current.crates > 0 && current.crates <= 10);
      const committed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, SAVE_KEY);
      assert.ok(committed.activeRun); assert.equal(committed.bag.items.length, 0);
      await screenshot('raid');
      return current;
    });
    if (smoke) return;

    await step('real WASD movement and pointer mapping', async () => {
      await page.evaluate(() => {
        const raid = window.__bincov.app.raid;
        raid.player.setPosition(208, 784);
        raid.enemies.forEach(enemy => { enemy.cooldown = 9999; });
      });
      await settleCamera();
      const before = await run();
      await hold('d', 450); const right = await run();
      assert.ok(right.x > before.x + 15, 'D moves the actor right');
      await hold('w', 450); const up = await run();
      assert.ok(up.y < right.y - 15, 'W moves the actor up');
      await settleCamera();
      const target = { x: up.x + 140, y: up.y + 20 };
      await aimAt(target);
      const aimed = await run(), expected = Math.atan2(target.y - aimed.y, target.x - aimed.x);
      const error = Math.abs(Math.atan2(Math.sin(aimed.rotation - expected), Math.cos(aimed.rotation - expected)));
      assert.ok(error < 0.12, `Pointer direction mismatch at ${label}: ${error}`);
      return { movementX: rounded(right.x - before.x), movementY: rounded(up.y - right.y), aimErrorRadians: rounded(error) };
    });
    await step('25-enemy, 60-original-loot battle performance sample', async () => {
      await page.evaluate(() => {
        const raid = window.__bincov.app.raid;
        raid.player.setPosition(700, 784); raid.hp = 100; raid.bleeding = 0;
        const enemy = raid.enemies.find(candidate => candidate.id === 'salt');
        enemy.sprite.setPosition(900, 784); enemy.home = { x: 900, y: 784 }; enemy.target = { x: 700, y: 784 }; enemy.cooldown = 0.5;
      });
      await settleCamera();
      const before = await run();
      assert.equal(before.alive, 25); assert.equal(before.originalLootEntries, 60);
      record.fps = await page.evaluate(() => new Promise(resolveSample => {
        const start = performance.now(), values = [], intervals = [];
        let previous = start, frames = 0, stayedInRun = true;
        function sample(now) {
          const { app } = window.__bincov;
          stayedInRun &&= app.state === 'run';
          if (frames++) intervals.push(now - previous);
          previous = now;
          const fps = app.game.loop.actualFps;
          if (frames % 10 === 0 && Number.isFinite(fps) && fps > 0) values.push(fps);
          if (now - start < 5000) { requestAnimationFrame(sample); return; }
          values.sort((a, b) => a - b); intervals.sort((a, b) => a - b);
          const average = values.reduce((a, b) => a + b, 0) / values.length;
          resolveSample({ measuredMs: now - start, frames, samples: values.length, average, minimum: values[0], median: values[Math.floor(values.length / 2)], frameIntervalP95Ms: intervals[Math.floor(intervals.length * .95)], stayedInRun, target60ApproxMet: average >= 55 });
        }
        requestAnimationFrame(sample);
      }));
      assert.ok(record.fps.samples >= 2 && record.fps.average > 0, 'FPS sampler produced measurements');
      assert.equal(record.fps.stayedInRun, true);
      await page.evaluate(() => { const raid = window.__bincov.app.raid; raid.enemies.forEach(enemy => { enemy.cooldown = 9999; }); raid.hp = 100; raid.bleeding = 0; });
      return record.fps;
    });
    await step('actual aimed pistol shot consumes ammunition and hits an enemy', async () => {
      const fixture = await page.evaluate(() => {
        const raid = window.__bincov.app.raid;
        raid.player.setPosition(700, 784);
        raid.bullets.forEach(bullet => bullet.sprite.destroy()); raid.bullets = [];
        const index = raid.enemies.findIndex(enemy => enemy.id === 'scav');
        raid.enemies.forEach((other,otherIndex)=>{if(otherIndex!==index){other.sprite.setPosition(208,1456);other.home={x:208,y:1456};other.target={x:208,y:1456};other.timer=9999;other.alert=0;other.state='patrol';other.path=[];}});
        const enemy = raid.enemies[index];
        enemy.sprite.setPosition(820, 784); enemy.hp = 56; enemy.cooldown = 9999;
        enemy.home = { x: 820, y: 784 }; enemy.target = { x: 820, y: 784 }; enemy.timer = 9999;
        return { index, hp: enemy.hp, mag: raid.mag };
      });
      await settleCamera();
      await page.keyboard.press('1');
      const target = await page.evaluate(index => { const enemy = window.__bincov.app.raid.enemies[index]; return { x: enemy.sprite.x, y: enemy.sprite.y }; }, fixture.index);
      await aimAt(target);
      await page.mouse.down({ button: 'right' });
      try {
        await page.mouse.down({ button: 'left' }); await page.waitForTimeout(90); await page.mouse.up({ button: 'left' });
        await page.waitForFunction(({ index, hp }) => window.__bincov.app.raid.enemies[index].hp < hp, fixture);
      } finally { await page.mouse.up({ button: 'left' }); await page.mouse.up({ button: 'right' }); }
      const result = await run();
      assert.equal(result.mag, fixture.mag - 1);
      return { beforeAmmo: fixture.mag, afterAmmo: result.mag, damagedEnemyIndex: fixture.index };
    });
    await step('real E pickup, pause, map and persisted volume controls', async () => {
      await collectSample();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__bincov.app.overlay === 'pause');
      const paused = await run();
      await page.waitForTimeout(500);
      assert.equal((await run()).elapsed, paused.elapsed, 'Pause must stop the action clock');
      const volume = page.locator('#volume');
      await volume.focus(); await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      assert.equal(Number(await volume.inputValue()), 0.2);
      assert.equal((await state()).volume, 0.2);
      await action('close').click();
      await page.keyboard.press('m');
      await page.locator('#map').waitFor();
      const mapTime = (await run()).elapsed;
      await page.waitForTimeout(250);
      assert.ok((await run()).elapsed > mapTime, 'Map is not a pause');
      await screenshot('map');
      await page.keyboard.press('m');
      return { volume: 0.2, sampleLootedByKeyboard: true };
    });
    await step('tide warning, high-tide transition and real movement out of flood', async () => {
      await page.evaluate(() => {
        const raid = window.__bincov.app.raid;
        raid.highTide = false; raid.drawFlood(); raid.elapsed = raid.config.warningAt - .01;
        raid.player.setPosition(63 * 32 + 16, 10 * 32 + 16);
        raid.hp = 100; raid.bleeding = 0;
      });
      await page.waitForFunction(() => document.getElementById('warning')?.textContent.includes('潮汐预警'));
      await page.evaluate(() => { const raid = window.__bincov.app.raid; raid.elapsed = raid.config.tideAt - .01; });
      await page.waitForFunction(() => window.__bincov.app.raid.highTide === true);
      const afterFlip = await run();
      await hold('a', 600);
      const escaped = await run();
      assert.ok(escaped.x < 63 * 32 - 10, 'Player can leave the high-tide strip');
      // Regression: actor center is dry but the collision radius still overlaps water.
      await page.evaluate(() => { window.__bincov.app.raid.player.setPosition(63 * 32 - 1, 10 * 32 + 16); });
      await hold('a', 450);
      assert.ok((await run()).x < 63 * 32 - 20, 'Half-overlapping flood boundary must not trap the actor');
      await screenshot('high-tide');
      return { warningAt: 270, tideAt: 300, xAfterFlip: rounded(afterFlip.x), xAfterMovement: rounded(escaped.x) };
    });

    const beforeResults = await state();
    await step('first run: actual three-second extraction retains loot and gear', async () => {
      await page.evaluate(() => {
        const raid = window.__bincov.app.raid;
        const exit = raid.config.exits[0];
        raid.player.setPosition(exit.x, exit.y); raid.hp = 100; raid.bleeding = 0; raid.pollution = 0;
        raid.enemies.forEach(enemy => { enemy.cooldown = 9999; });
        raid.bullets.forEach(bullet => bullet.sprite.destroy()); raid.bullets = [];
      });
      await settleCamera();
      const start = performance.now();
      await page.keyboard.down('e');
      try { await page.waitForFunction(() => window.__bincov.app.state === 'result', null, { timeout: 12000 }); }
      finally { await page.keyboard.up('e'); }
      const elapsed = performance.now() - start, saved = await state();
      assert.ok(elapsed >= 2500, 'Extraction must perform a real three-second progress bar');
      assert.equal(saved.result.outcome, 'extract'); assert.equal(saved.activeRun, null);
      assert.equal(saved.stats.runs, 1); assert.equal(saved.stats.extracts, 1);
      assert.ok(saved.bag.items.some(item => item.id === 'sample'));
      assert.equal(saved.equipment.weapon, 'pistol');
      assert.deepEqual(saved.safe, beforeResults.safe); assert.equal(saved.cash, beforeResults.cash);
      await screenshot('result-extract');
      return { actualHoldMs: rounded(elapsed), savedRuns: saved.stats.runs };
    });
    await step('second run: actual enemy attack causes death and protects the safe', async () => {
      await action('return').click(); await deploy(43);
      await page.evaluate(() => {
        const raid = window.__bincov.app.raid;
        raid.player.setPosition(700, 784); raid.hp = 1; raid.bleeding = 0; raid.pollution = 0;
        const enemy = raid.enemies.find(candidate => candidate.id === 'scav');
        enemy.sprite.setPosition(720, 784); enemy.cooldown = 0; enemy.target = { x: 700, y: 784 }; enemy.state = 'attack';
      });
      await waitState('result');
      const saved = await state();
      assert.equal(saved.result.outcome, 'death'); assert.equal(saved.stats.runs, 2);
      assert.equal(saved.bag.items.length, 0); assert.equal(saved.equipment.weapon, null);
      assert.deepEqual(saved.safe, beforeResults.safe); assert.equal(saved.cash, beforeResults.cash);
      assert.deepEqual(saved.quests, beforeResults.quests);
      await screenshot('result-death');
    });
    await step('third run: timeout and three-run persistence after reload', async () => {
      await action('return').click(); await deploy(44);
      await page.evaluate(() => { window.__bincov.app.raid.elapsed = 599.99; });
      await waitState('result');
      const saved = await state();
      assert.equal(saved.result.outcome, 'timeout'); assert.equal(saved.stats.runs, 3);
      assert.equal(saved.stats.extracts, 1); assert.equal(saved.bag.items.length, 0);
      assert.deepEqual(saved.safe, beforeResults.safe); assert.equal(saved.cash, beforeResults.cash);
      await screenshot('result-timeout');
      await page.reload({ waitUntil: 'load' }); await waitState('menu'); await action('enter').waitFor();
      assert.deepEqual(await state(), { ...saved, state: 'menu' });
      return { completedRuns: 3, outcomes: ['extract', 'death', 'timeout'], volumeAfterReload: (await state()).volume };
    });
    await step('fourth run: midrun reload restores carried items and the matching world checkpoint', async () => {
      await action('enter').click(); await waitState('hideout');
      const medkit = (await state()).stash.items.find(item => item.id === 'medkit');
      assert.ok(medkit, 'An untouched warehouse medkit can test carried-item recovery');
      await page.locator(`[data-uid="${medkit.uid}"]`).click(); await action('transfer').click();
      assert.ok((await state()).bag.items.some(item => item.id === 'medkit'));
      const stashBefore = (await state()).stash;
      await deploy(45);
      await collectSample();
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => window.__bincov.app.overlay === 'inventory');
      const sampleUid = await page.evaluate(() => window.__bincov.app.loadout.bag.items.find(item => item.id === 'sample').uid);
      await page.locator(`[data-uid="${sampleUid}"]`).click(); await action('secure').click();
      const checkpoint = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).profile, SAVE_KEY);
      assert.ok(checkpoint.activeRun); assert.ok(checkpoint.safe.items.some(item => item.id === 'sample'));
      await page.reload({ waitUntil: 'load' }); await waitState('menu'); await action('enter').waitFor();
      const recovered = await state();
      assert.ok(recovered.activeRun); assert.equal(recovered.stats.runs, 4);
      assert.equal(recovered.result.outcome, 'timeout', 'Reload must not settle the new run');
      assert.ok(await page.evaluate(() => __bincov.app.checkpoint.loadout.bag.items.some(i => i.id === 'medkit')));
      assert.equal(recovered.bag.items.length, 0); assert.equal(recovered.equipment.weapon, null);
      assert.deepEqual(recovered.stash, stashBefore); assert.deepEqual(recovered.safe, checkpoint.safe);
      assert.equal(recovered.cash, beforeResults.cash); assert.deepEqual(recovered.quests, beforeResults.quests);
      await action('enter').click(); await waitState('run'); await page.waitForFunction(() => __bincov.app.raid?.player?.active);
      assert.equal(await page.evaluate(() => __bincov.app.overlay), 'pause'); await screenshot('recovered-raid');
      return { carriedMedkitRestored: true, safeSamplePreserved: true, noExtraSettlement: recovered.stats.runs === 4 };
    });
  } finally {
    if (record.steps.some(item => item.status === 'failed')) {
      try { await screenshot('failure'); } catch { /* Preserve original failure. */ }
    }
    await context.close(); activePage = undefined;
  }
}

try {
  await suite({ width: 1280, height: 720 });
  await suite({ width: 1920, height: 1080 });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error);
  console.error(report.failure); process.exitCode = 1;
  if (activePage) { try { await activePage.screenshot({ path: join(out, 'unexpected-failure.png') }); } catch {} }
} finally {
  report.finishedAt = new Date().toISOString();
  await saveReport();
  await browser.close();
  console.log(`Browser acceptance ${report.status}: ${join(out, smoke ? 'browser-smoke.json' : 'browser-report.json')}`);
}
