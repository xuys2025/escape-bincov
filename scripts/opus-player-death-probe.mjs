// OPUS-DEATH-01 boundary probe, not a gate: the player's own death from real enemy fire (AI unfrozen, no damage driver),
// under both art modes. Records what the view presents after the player's death event and screenshots the page then.
// The sample host stops presenting once the settlement is committed (it then leaves for the result screen), so this
// documents how much of the shared fall the player can actually see; it asserts only that the death really happened.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_PLAYER_DEATH_OUT || 'test-results/opus-player-death'); await mkdir(out, { recursive: true });
const url = pathToFileURL(resolve(process.env.BINCOV_SAMPLE_HTML || 'dist/index.html')).href;
const report = { startedAt: new Date().toISOString(), seed: '42', runs: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
try {
  for (const art of ['sol', 'placeholder']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
    context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
    await page.goto(`${url}?test=1&sample=village${art === 'placeholder' ? '&art=placeholder' : ''}`);
    await page.locator('[data-action="enter"]').click(); await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42');
    await page.locator('[data-action="deploy"]').click(); await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
    await page.evaluate(() => {
      const d = window.__bincovSample.driver; d.freezeAI(true); d.placePlayer({ x: 640, y: 456 }, 0, 'coast');
      [['enemy-6', 704, 456], ['enemy-9', 576, 456], ['enemy-18', 640, 392], ['enemy-23', 640, 520], ['enemy-24', 704, 392]].forEach(([u, x, y]) => d.placeEnemy(u, { x, y }));
    });
    const mode = await page.evaluate(() => window.__bincovSample.counts().art); assert.equal(mode, art);
    // Observe after the real present; never touch deathT, events or panels.
    await page.evaluate(() => {
      const h = window.__bincovSample.host, v = h.view, present = Object.getPrototypeOf(v).present, log = window.__playerDeath = { rows: [] };
      v.present = function (batch, dt) {
        present.call(this, batch, dt);
        const a = batch.frame.player, g = this.actors.get(a.uid);
        log.rows.push({ alive: a.alive, hp: a.hp, phase: batch.frame.phase, death: batch.events.some(e => e.type === 'death' && e.uid === a.uid), deathT: g.deathT,
          rotation: g.body.rotation, body: g.body.visible, weapon: g.weapon.visible, corpse: !!g.corpse?.visible, panelBefore: h.panel });
      };
    });
    const t0 = Date.now(); await page.evaluate(() => window.__bincovSample.driver.freezeAI(false));
    await page.waitForFunction(() => window.__playerDeath.rows.some(r => !r.alive), null, { timeout: 60000 });
    await page.screenshot({ path: resolve(out, `player-death-${art}.png`) });
    await page.waitForFunction(() => window.__bincov.app.state === 'result');
    const rows = await page.evaluate(() => window.__playerDeath.rows), outcome = await page.evaluate(() => window.__bincov.app.result?.outcome);
    const dead = rows.filter(r => !r.alive);
    assert.equal(outcome, 'death'); assert.ok(dead.length > 0 && dead[0].death, 'a real player death event was presented');
    report.runs.push({ art, secondsToDeath: (Date.now() - t0) / 1000, outcome, lastAlive: rows.filter(r => r.alive).at(-1), presentedAfterDeath: dead.length, dead });
    console.log(`${art}: death after ${report.runs.at(-1).secondsToDeath}s; frames presented after the death event: ${dead.length}; deathT ${dead.map(r => r.deathT.toFixed(4)).join(',')}`);
    await context.close();
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'player-death.json'), JSON.stringify(report, null, 2));
}
assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []);
