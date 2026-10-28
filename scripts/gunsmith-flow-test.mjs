/**
 * Gunsmith end to end (#28 M2-14): the packaged game offline on the tab page (?test=1&entry=tabs; the yard's workbench
 * is test:gunsmith-bench), with the real Runtime, SaveSession and localStorage.
 *   desktop 1280x720 and 1920x1080: buy a G17, a micro sight and a long magazine from 老栓, fit them on the workbench,
 *   equip the gun, deploy: the gun in hand is drawn as built and holds 24 rounds; reload the page mid-raid and resume
 *   with the same gun; extract: the gun comes home with its parts; deploy again and die: the gun goes with its parts,
 *   nothing of it left anywhere.
 *   phone 740x300 (touch): the same G17 put in hand through the save session, deploy, resume after a reload, die.
 * Enemy positions and health use the explicit ?test=1 driver; buying, the workbench, equipping, deploying and the
 * three-second extraction use real input.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { reportFilter, stepFilter } from './step-filter.mjs';
import { raidReady, frames, drive } from './raid-view.mjs';
import { placeAt } from './inventory-actions.mjs';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
const out = resolve(option('out', 'test-results/gunsmith-flow')), filter = stepFilter();
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), startedAt: new Date().toISOString(),
  methodology: 'Packaged HTML offline on the tab page; real input for buying, the workbench, equipping, deploying and extraction; the ?test=1 driver for enemy positions and health.', steps: [], errors: [], external: [], screenshots: [] };
let context, page, touch = false;
const SIG = 'mag=G01,micro=O01';

const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const waitState = (state, timeout = 30000) => page.waitForFunction(s => window.__bincov?.app.state === s, state, { timeout });
const save = () => page.evaluate(() => structuredClone(window.__bincov.app.save));
const shot = async name => { await page.screenshot({ path: resolve(out, `${name}.png`) }); report.screenshots.push(`${name}.png`); };
const tap = el => touch ? el.tap() : el.click();
/** Every copy of `id` the profile holds, loose or on a gun (equipped or in a container). */
function copies(p, id) {
  const nodes = parts => parts.flatMap(n => [n, ...nodes(n.children)]);
  let n = 0;
  for (const inv of [p.stash, p.bag, p.safe]) for (const i of inv.items) { if (i.id === id) n += i.qty; if (i.gun) n += nodes(i.gun.parts).filter(x => x.id === id).length; }
  if (p.equipment.gun) n += nodes(p.equipment.gun.parts).filter(x => x.id === id).length;
  return n;
}

async function open(size) {
  await context?.close(); touch = size[0] < 900;
  context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.route('https://flow.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://flow.test/')) report.external.push(r.url()); });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(String(e.stack)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto('https://flow.test/?test=1&entry=tabs'); await page.locator('[data-action="enter"]').waitFor();
  await tap(action('enter')); await waitState('hideout');
}
/** A rested body, cash for the shop and empty bag, as the base's own transactions would leave them. */
async function fixture(extra = null) {
  const ok = await page.evaluate(extra => {
    const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => {
      if (d.expansion) Object.assign(d.expansion.body, { hp: 100, stamina: 100, pollution: 0, bleeding: false });
      d.profile.cash = 4000;
      if (extra) Object.assign(d.profile, extra);
    });
    return !!t && s.commitExpansionMutation(t) === 'committed';
  }, extra);
  assert.ok(ok, 'fixture committed');
  await page.evaluate(() => window.__bincov.persist?.());
}
/** The Runtime's stall pause on slow runners is resumed as a player would; any other pause fails. */
async function running() {
  for (let i = 0; i < 5; i++) {
    const now = await page.evaluate(() => ({ panel: window.__bincovSample.host.panel, phase: window.__bincovSample.host.lastBatch.frame.phase }));
    if (now.phase === 'running' && now.panel === null) { await frames(page, 3); return; }
    assert.equal(now.panel, 'pause', `the raid waits on ${now.panel}`);
    await page.locator('.coast-sample [data-do="resume"]').click();
    await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'running', null, { timeout: 30000 });
  }
  throw new Error('the raid did not stay running');
}
async function deploy(seed) {
  await page.locator('#seed').fill(String(seed));
  await tap(action('deploy')); await waitState('run'); await raidReady(page);
  await drive(page, 'freezeAI', true); await running();
}
/** The gun in hand as the raid view publishes and draws it. */
const held = () => page.evaluate(() => {
  const h = window.__bincovSample.host, f = h.lastBatch.frame, art = h.view.weaponOf(f.player);
  return { gun: f.player.gun ?? null, magSize: f.hud.weapon.magSize, composite: !!art.tip, card: !!document.querySelector('.coast-sample [data-weapon-icon]')?.getAttribute('src') };
});
const resultShown = (timeout = 60000) => page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'), null, { timeout });
async function standAt(point) {
  await drive(page, 'placePlayer', point, 0);
  await page.waitForFunction(p => { const f = window.__bincovSample.host.lastBatch.frame.player; return Math.hypot(f.x - p.x, f.y - p.y) < 1; }, point);
  await page.waitForTimeout(1200); await running();
}
/** Reload mid-raid and enter again: the raid resumes from its last checkpoint. */
async function reloadAndResume() {
  await page.reload({ waitUntil: 'load' }); await page.locator('[data-action="enter"]').waitFor();
  await tap(action('enter')); await waitState('run'); await raidReady(page);
  await drive(page, 'freezeAI', true); await running();
}
/** Death by an enemy's blow: one health left, a club enemy beside the player, the AI let go. */
async function die() {
  const at = await page.evaluate(() => { const p = window.__bincovSample.host.lastBatch.frame.player; return { x: Math.round(p.x), y: Math.round(p.y) }; });
  const foe = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(a => a.alive && a.kind !== 'player')?.uid);
  assert.ok(foe, 'an enemy on the map');
  await drive(page, 'vitals', { hp: 1, bleeding: false, pollution: 0 });
  await drive(page, 'placeEnemy', foe, { x: at.x + 20, y: at.y });
  await drive(page, 'freezeAI', false);
  await resultShown(90000);
}

async function step(name, fn) {
  if (!filter.selects(name)) return;
  const row = { name }, errorStart = report.errors.length; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors.slice(errorStart), []); assert.deepEqual(report.external, []); row.status = 'passed'; console.log('PASS', name); }
  catch (e) { row.status = 'failed'; row.error = String(e.stack); await shot(`failure-${report.steps.length}`).catch(() => {}); console.log('FAIL', name, e.message); }
}

try {
  for (const size of [[1280, 720], [1920, 1080]]) {
    const tag = `${size[0]}x${size[0] === 1280 ? 720 : 1080}`;
    await step(`F-${tag}-buy-fit-deploy-resume-extract-die`, async () => {
      await open(size); await fixture({ bag: { w: 6, h: 5, items: [] } });
      // Buy: the G17, the micro sight and the long magazine (老栓 stocks all three, M2 decision 8).
      await tap(action('tab', 'arms'));
      for (const [id, x] of [['gb17', 0], ['O01', 2], ['G01', 3]]) await placeAt(page, 'merchant', id, 'buy', x, 0);
      await tap(action('checkout'));
      let p = await save();
      const g17 = p.stash.items.find(i => i.id === 'gb17');
      assert.ok(g17 && copies(p, 'O01') === 1 && copies(p, 'G01') === 1, 'bought');
      // Fit them on the workbench (the tab page's overlay is the yard's panel).
      await tap(action('tab', 'gear'));
      await tap(page.locator(`[data-grid="stash"] [data-uid="${g17.uid}"]`)); await tap(action('gunsmith-open', g17.uid));
      const bench = s => page.locator(`.gs-page ${s}`);
      await bench('.gs').waitFor();
      await tap(bench('[data-gs="pos"][data-arg="gun/micro/0"]')); await tap(bench('.gs-list [data-gs="part"][data-arg="O01"]'));
      await tap(bench('[data-gs="pos"][data-arg="gun/mag/0"]')); await tap(bench('.gs-list [data-gs="part"][data-arg="G01"]'));
      await tap(bench('[data-gs="confirm"]'));
      await page.waitForFunction(uid => window.__bincov.app.save.stash.items.find(i => i.uid === uid)?.gun.parts.length === 2, g17.uid);
      await tap(bench('[data-gs="close"]')); await page.locator('.gs-page').waitFor({ state: 'detached' });
      // Equip it and load it: deploy with the built gun.
      await tap(page.locator(`[data-grid="stash"] [data-uid="${g17.uid}"]`)); await tap(action('equip'));
      p = await save();
      assert.equal(p.equipment.weapon, 'gb17'); assert.equal(p.equipment.gun.parts.length, 2);
      await shot(`20-${tag}-equipped`);
      await deploy(91);
      let now = await held();
      assert.deepEqual(now.gun, { id: 'gb17', sig: SIG }); assert.equal(now.magSize, 24); assert.ok(now.composite && now.card);
      await shot(`21-${tag}-raid`);
      // Reload mid-raid: the same gun.
      await reloadAndResume();
      now = await held();
      assert.deepEqual(now.gun, { id: 'gb17', sig: SIG }); assert.equal(now.magSize, 24);
      // Extract: the gun comes home as built.
      await drive(page, 'vitals', { hp: 100, bleeding: false, pollution: 0 });
      const exit = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.exits[0].at);
      await standAt(exit);
      await page.keyboard.down('e'); try { await resultShown(); } finally { await page.keyboard.up('e'); }
      p = await save();
      assert.equal(p.lastResult.outcome, 'extract');
      assert.equal(p.equipment.weapon, 'gb17');
      assert.deepEqual(p.equipment.gun.parts.map(n => n.id).sort(), ['G01', 'O01']);
      assert.deepEqual([copies(p, 'O01'), copies(p, 'G01')], [1, 1]);
      // Deploy again and die: the gun goes with its parts, no copy anywhere.
      await tap(action('return')); await waitState('hideout'); await fixture();
      await deploy(92); await die();
      p = await save();
      assert.equal(p.lastResult.outcome, 'death'); assert.equal(p.equipment.weapon, null);
      assert.deepEqual([copies(p, 'O01'), copies(p, 'G01'), p.stash.items.filter(i => i.id === 'gb17').length], [0, 0, 0]);
      return { tag };
    });
  }

  await step('F-phone-740x300-deploy-resume-die', async () => {
    await open([740, 300]);
    const gun = { parts: [{ uid: 'fl-o01', id: 'O01', slot: 'micro', relief: false, children: [] }, { uid: 'fl-g01', id: 'G01', slot: 'mag', relief: false, children: [] }], devices: { laser: false, light: false } };
    await fixture({ equipment: { weapon: 'gb17', weaponUid: 'fl-g17', gun, relief: false, ammo: 24, ammoRelief: 0 } });
    await page.reload({ waitUntil: 'load' }); await page.locator('[data-action="enter"]').waitFor(); await tap(action('enter')); await waitState('hideout');
    await deploy(93);
    let now = await held();
    assert.deepEqual(now.gun, { id: 'gb17', sig: SIG }); assert.equal(now.magSize, 24); assert.ok(now.composite);
    await shot('22-phone-740x300-raid');
    await reloadAndResume();
    now = await held();
    assert.deepEqual(now.gun, { id: 'gb17', sig: SIG });
    await die();
    const p = await save();
    assert.equal(p.lastResult.outcome, 'death');
    assert.deepEqual([copies(p, 'O01'), copies(p, 'G01')], [0, 0]);
  });
} finally {
  await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.steps.filter(s => s.status === 'passed').length, total: report.steps.length };
  const filterProblems = reportFilter(filter, report.steps.length); if (filterProblems.length) report.summary.filterProblems = filterProblems;
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summary));
  if (report.summary.passed !== report.summary.total || report.errors.length || report.external.length) process.exitCode = 1;
}
