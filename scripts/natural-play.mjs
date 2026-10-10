/** Real-time automated play: read game state, act only through keyboard/mouse. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { findPath, lineOfSight } from '../src/world.ts';
import { ITEMS, fits } from '../src/domain.ts';
import { browserOptions } from './browser-options.mjs';
import { buyAffordable } from './inventory-actions.mjs';

const minutes = Number(process.env.BINCOV_PLAY_MINUTES || 10);
assert.ok(minutes >= 1 && minutes <= 60);
const report = { htmlSha256: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), startedAt: new Date().toISOString(), minutes, methodology: 'Automated real-time session. Test hook is read-only: no teleports, no clock changes, no changes to health, enemies, inventory or RNG. All actions use visible buttons and real keyboard/mouse, including E opening and native inventory drag for crates and corpses. This is not a human fun/balance evaluation.', containerLoot: { opened: [], transfers: [], threatenedClosures: 0 }, samples: [], outcomes: [], errors: [], externalRequests: [] };
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
const page = await context.newPage();
page.on('pageerror', e => report.errors.push(e.message));
context.on('request', r => { if (/^https?:/.test(r.url())) report.externalRequests.push(r.url()); });
const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let held = new Set(), runNumber = 0, goal = null, path = [], repathAt = 0, lastSample = 0;
let visited = new Set(), lastPosition, stuckAt = Date.now(), lastHeal = 0;
async function keys(next) {
  for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
  for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
  held = next;
}
async function snapshot() {
  return page.evaluate(() => {
    const a = window.__bincov.app, r = a.raid;
    if (a.state !== 'run' || !r?.player?.active) return { state: a.state, result: a.save.lastResult, stats: a.save.stats };
    const box = a.game.canvas.getBoundingClientRect(), c = r.cameras.main;
    return { state: a.state, hp: r.hp, bleeding: r.bleeding, elapsed: r.elapsed, high: r.highTide, kills: r.kills, mag: r.mag, reload: r.reloadLeft, cooldown: r.fireCooldown, x: r.player.x, y: r.player.y,
      exits: r.config.exits, loot: r.loot.map(l => ({ x: l.sprite.x, y: l.sprite.y, id: l.id })),
      overlay: a.overlay, lootContext: a.lootContext, bag: a.loadout.bag,
      containers: r.containers.map(c => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, inventory: c.inventory, available: r.canLootContainer(c.id, c.runId) })),
      enemies: r.enemies.filter(e => e.hp > 0).map(e => ({ x: e.sprite.x, y: e.sprite.y, id: e.id })),
      ammo: a.loadout.bag.items.filter(i => i.id === 'ammo9').reduce((sum, i) => sum + i.qty, 0),
      medical: a.loadout.bag.items.filter(i => ['medkit', 'bandage'].includes(i.id)).reduce((sum, i) => sum + i.qty, 0),
      camera: { x: box.x, y: box.y, scale: box.width / 960, scrollX: c.scrollX, scrollY: c.scrollY }, pending: !!a.pendingSettlement };
  });
}
function destination(inv, item) {
  const stack = inv.items.find(other => other.id === item.id && !!other.relief === !!item.relief && other.qty + item.qty <= ITEMS[item.id].stack);
  if (stack) return { x: stack.x, y: stack.y };
  for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++) if (fits(inv, item.id, x, y, undefined, !!item.rotated)) return { x, y };
  return null;
}
async function lootOpenContainer(s) {
  await keys(new Set());
  const container = s.containers.find(c => c.id === s.lootContext?.containerId);
  if (!container) { await page.keyboard.press('Escape'); return; }
  if (!report.containerLoot.opened.some(c => c.run === runNumber && c.id === container.id)) {
    report.containerLoot.opened.push({ run: runNumber, id: container.id, kind: container.kind, elapsed: s.elapsed });
    await page.screenshot({ path: resolve(out, `natural-play-container-${runNumber}-${report.containerLoot.opened.length}.png`) });
  }
  if (s.hp < 60 || s.bleeding || s.enemies.some(e => dist(e, s) < 220 && lineOfSight(s, e))) {
    report.containerLoot.threatenedClosures++;
    visited.add(`${container.x},${container.y}`); goal = null;
    await page.keyboard.press('Escape'); return;
  }
  const candidate = container.inventory.items.map(item => ({ item, cell: destination(s.bag, item) })).find(candidate => candidate.cell);
  if (!candidate) { visited.add(`${container.x},${container.y}`); goal = null; await page.keyboard.press('Escape'); return; }
  const { item, cell } = candidate;
  const source = page.locator(`[data-source="container"][data-uid="${item.uid}"]`), grid = page.locator('[data-grid="bag"]');
  const geometry = await grid.evaluate(el => ({ cell: Number(el.dataset.cell), scale: el.getBoundingClientRect().width / el.offsetWidth }));
  await source.dragTo(grid, { targetPosition: { x: (cell.x + .4) * geometry.cell * geometry.scale, y: (cell.y + .4) * geometry.cell * geometry.scale } });
  const after = await snapshot();
  const remaining = after.containers?.find(c => c.id === container.id)?.inventory.items.find(i => i.uid === item.uid);
  if (!remaining) report.containerLoot.transfers.push({ run: runNumber, containerId: container.id, kind: container.kind, item: item.id, qty: item.qty, elapsed: s.elapsed });
  else { visited.add(`${container.x},${container.y}`); goal = null; await page.keyboard.press('Escape'); }
}
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
  await action('enter').click();
  const start = Date.now(), deadline = start + minutes * 60000;
  while (Date.now() < deadline || (await snapshot()).state === 'run') {
    const s = await snapshot(), now = Date.now();
    assert.equal(s.pending, s.state === 'run' ? false : undefined, 'Storage must stay available');
    if (s.state === 'result') {
      await keys(new Set()); report.outcomes.push(s.result);
      console.log('Run completed', s.result.outcome, 'kills', s.result.kills);
      await action('return').click(); continue;
    }
    if (s.state === 'hideout') {
      if (now >= deadline) break;
      await action('tab', 'arms').click();
      await buyAffordable(page, 'ammo9', 2);
      await action('tab', 'med').click();
      await buyAffordable(page, 'medkit');
      await action('tab', 'gear').click();
      for (let i = 0; i < 12; i++) {
        const items = page.locator('[data-source="stash"][data-uid]'); const count = await items.count();
        if (!count) break;
        await items.first().dblclick(); if (await items.count() >= count) break;
      }
      await page.locator('#seed').fill(String(42 + runNumber++)); await action('deploy').click();
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      goal = null; path = []; visited = new Set(); lastPosition = null; stuckAt = now;
      continue;
    }
    if (s.state !== 'run') throw new Error('Unexpected state ' + s.state);
    // A loot overlay keeps the world running. Finish or close it before combat input.
    if (s.overlay === 'loot') { await lootOpenContainer(s); continue; }
    if (s.overlay) {
      assert.notEqual(s.overlay, 'checkpoint-error', 'Automatic world checkpoints must remain writable during natural play');
      assert.notEqual(s.overlay, 'save-error', 'Settlement must remain writable during natural play');
      await keys(new Set()); await page.keyboard.press('Escape'); continue;
    }
    if (now - lastSample > 30000) {
      const sample = { realSeconds: Math.round((now - start) / 1000), run: runNumber, elapsed: Math.round(s.elapsed), hp: Math.round(s.hp), kills: s.kills, highTide: s.high, x: Math.round(s.x), y: Math.round(s.y) };
      report.samples.push(sample); console.log('PLAY', JSON.stringify(sample)); lastSample = now;
      await writeFile(resolve(out, 'natural-play-progress.json'), JSON.stringify(report, null, 2));
    }
    if (now - lastHeal > 1500 && s.medical && (s.hp < 70 || s.bleeding)) { await page.keyboard.press('q'); lastHeal = now; }
    if (s.mag === 0 && s.ammo && !s.reload) await page.keyboard.press('r');
    const target = s.enemies.filter(e => dist(e, s) < 430 && lineOfSight(s, e)).sort((a, b) => dist(a, s) - dist(b, s))[0];
    if (target && s.mag && !s.reload && s.cooldown <= 0) {
      const x = s.camera.x + (target.x - s.camera.scrollX) * s.camera.scale, y = s.camera.y + (target.y - s.camera.scrollY) * s.camera.scale;
      if (x > 0 && x < 1280 && y > 0 && y < 720) await page.mouse.click(x, y, { delay: 40 });
    }
    const evacuate = now >= deadline || s.elapsed >= 550 || (s.hp < 35 && !s.medical) || (!s.mag && !s.ammo);
    if (evacuate) {
      goal = [...s.exits].sort((a, b) => dist(a, s) - dist(b, s))[0];
      if (dist(goal, s) < 43) {
        await keys(new Set()); await page.keyboard.down('e'); await page.waitForTimeout(3300); await page.keyboard.up('e'); continue;
      }
    } else if (!goal || dist(goal, s) < 35) {
      if (goal) {
        await keys(new Set()); await page.keyboard.press('e', { delay: 70 });
        if ((await snapshot()).overlay === 'loot') continue;
        visited.add(`${goal.x},${goal.y}`);
      }
      const choices = [...s.containers.filter(c => c.inventory.items.length && (!s.high || findPath(s, c, s.high).length)).map(c => ({ ...c, container: true })), ...s.loot]
        .filter(l => !visited.has(`${l.x},${l.y}`) && !s.enemies.some(e => dist(e, l) < 100));
      goal = choices.sort((a, b) => dist(a, s) * (a.container ? .55 : 1) - dist(b, s) * (b.container ? .55 : 1))[0] ?? s.exits[0];
    }
    if (!lastPosition || dist(lastPosition, s) > 10) { lastPosition = { x: s.x, y: s.y }; stuckAt = now; }
    if (now - stuckAt > 7000) { visited.add(`${goal.x},${goal.y}`); goal = null; stuckAt = now; await keys(new Set()); continue; }
    if (now >= repathAt || !path.length) { path = findPath(s, goal, s.high); repathAt = now + 750; }
    while (path.length && dist(path[0], s) < 12) path.shift();
    const point = path[0] ?? goal, next = new Set();
    if (point.x - s.x > 6) next.add('d'); if (point.x - s.x < -6) next.add('a');
    if (point.y - s.y > 6) next.add('s'); if (point.y - s.y < -6) next.add('w');
    await keys(next); await page.waitForTimeout(120);
    if (now > deadline + 150000) throw new Error('Could not finish the final run within the session limit');
  }
  await keys(new Set());
  const final = await snapshot();
  if (final.state === 'result') report.outcomes.push(final.result);
  await page.screenshot({ path: resolve(out, 'natural-play-end.png') });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  assert.ok(report.containerLoot.transfers.length > 0, 'Natural play must visibly open a container and complete at least one native drag transfer');
  report.status = 'passed'; report.finalStats = final.stats;
} catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally {
  await keys(new Set()).catch(() => {}); await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'natural-play-report.json'), JSON.stringify(report, null, 2));
}
