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

const out = resolve('test-results/coast-sample'); await mkdir(out, { recursive: true });
const url = pathToFileURL(resolve('dist/index.html')).href;
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
  await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch);
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
    await page.locator('[data-do="take"]').first().click(); await frames(page, 4);
    const looted = (await events(page, 'looted')).filter(e => e.durability === 'committed');
    assert.equal(looted.length, 1);
    await page.keyboard.press('Tab'); await frames(page, 3);
    assert.equal((await now(page)).panel, null); assert.equal((await now(page)).phase, 'running');
    return { crate: crate.name, looted: looted[0].detail, choices: target.choices.length };
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
    await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch);
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
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
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
