/**
 * 试枪场 (src/range) on an isolated offline build: real mouse clicks on the 2.5D raid canvas and on the range panel. The
 * page's read-only ?test=1 hook (window.__bincovRange) is only read, never driven. The page must leave browser storage
 * alone; every gun (the old three, G17 and M4A1) must land hits on the 5-tile target and the panel must count them; the M4A1 must fire while
 * the button is held; presses on the panel must never fire or turn the
 * aim; the hit-feel A/B switch must flip the view option and its label; the panel must fit 1280x720 and 1920x1080; abandoning settles in memory and reloads a fresh range. A phone page
 * without ?test=1 checks the touch layout and that no test hook exists there.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { clickUncoveredCanvas } from './canvas-click.mjs';
import { frames } from './raid-view.mjs';
import { resumeStalls, running, stallResumes } from './stall-resume.mjs';

const HOOK = '__bincovRange';
const { values } = parseArgs({ options: { entry: { type: 'string', default: 'dist/index.html' }, filter: { type: 'string', default: '' }, report: { type: 'string', default: 'range' } } });
const out = resolve('test-results', values.report);
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { startedAt: new Date().toISOString(), browser: browser.version(), entry: values.entry,
  method: 'Offline Chromium; real mouse clicks on the game canvas and on the panel, taps on an emulated touch phone. The page hook is read only.', cases: [] };
const address = query => pathToFileURL(resolve(values.entry)).href + query;

/** Every call to a Storage method from the page's first script on, and what the two stores hold. */
const spyStorage = context => context.addInitScript(() => {
  window.__storageCalls = [];
  for (const name of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function (...args) { window.__storageCalls.push(`${name}(${String(args[0] ?? '')})`); return original.apply(this, args); };
  }
});
const storage = p => p.evaluate(() => {
  let sizes;
  try { sizes = [localStorage.length, sessionStorage.length]; } catch { sizes = 'unavailable'; }
  return { calls: window.__storageCalls, sizes };
});
const untouched = async p => { const s = await storage(p); assert.deepEqual(s.calls, []); assert.ok(s.sizes === 'unavailable' || s.sizes.every(n => n === 0), JSON.stringify(s)); return s; };

/** The published state the checks read: range counts, the HUD's weapon and aim, the player, raid time and panels. */
const state = p => p.evaluate(() => {
  const r = window.__bincovRange, b = r.host.lastBatch, f = b.frame;
  return { stats: r.stats(), weapon: f.hud.weapon, aim: f.hud.aim, player: { x: f.player.x, y: f.player.y, aim: f.player.aim },
    time: b.stamp.simulationTime, panel: r.host.panel, phase: f.phase };
});
/** Raid time passes: the Runtime advanced at least `seconds` (the raid clock, not the wall clock). */
const simulated = async (p, seconds) => {
  const t = (await state(p)).time;
  await p.waitForFunction(([t, s]) => window.__bincovRange.host.lastBatch.stamp.simulationTime >= t + s, [t, seconds], { timeout: 30000 });
};
/** The aim has recovered: body sway, bloom and drift are low, and the gun is loaded. */
const steady = p => p.waitForFunction(() => {
  const h = window.__bincovRange.host.lastBatch.frame.hud;
  return h.aim.sway < .1 && h.aim.bloom < .1 && h.aim.drift < .005 && !h.weapon.reloading && h.weapon.mag > 0;
}, null, { timeout: 30000 });
const held = (p, id) => p.waitForFunction(id => window.__bincovRange.host.lastBatch.frame.hud.weapon.id === id, id, { timeout: 20000 });
/**
 * Point the mouse at a target's chest (where the view draws aim and bullets) and keep it there until the camera, which
 * leads a little toward the aim, has settled. Returns the client point.
 */
async function aimAt(p, id) {
  let last = null;
  for (let i = 0; i < 12; i++) {
    const at = await p.evaluate(id => { const r = window.__bincovRange, t = r.targets().find(a => a.id === id); return r.host.view.worldToClient({ x: t.x, y: t.y - 22 }); }, id);
    await p.mouse.move(at.x, at.y);
    if (last && Math.hypot(at.x - last.x, at.y - last.y) < .5) return at;
    last = at;
    await frames(p, 4);
  }
  return last;
}
/** The panel's text for a selector inside its shadow root. */
const panelText = (p, selector) => p.evaluate(s => document.querySelector('.range-panel').shadowRoot.querySelector(s).textContent, selector);
/** Boxes of the range panel and of the raid HUD parts it must not cover. */
const layout = p => p.evaluate(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hud = [...document.querySelectorAll('.coast-sample .cs-status, .coast-sample .cs-keys, .coast-sample .cs-arms, .coast-sample .cs-info, .coast-sample .cs-clock, .coast-sample .cs-touch button')]
    .filter(el => el.getBoundingClientRect().width > 0).map(el => ({ name: `${el.className} ${el.textContent.slice(0, 8)}`.trim(), ...box(el) }));
  const rg = document.querySelector('.range-panel').shadowRoot.querySelector('.rg');
  return { panel: { ...box(rg), sideways: rg.scrollWidth > rg.clientWidth + 1 }, hud, view: { w: innerWidth, h: innerHeight } };
});
function fits({ panel, hud, view }, label) {
  assert.ok(panel.w > 0 && panel.l >= 0 && panel.t >= 0 && panel.r <= view.w && panel.b <= view.h, `${label}: panel outside the view ${JSON.stringify(panel)}`);
  // Twenty guns in a row of buttons (#28 M3) must not push the panel sideways on a narrow phone panel.
  assert.equal(panel.sideways, false, `${label}: the panel scrolls sideways`);
  for (const part of hud) assert.ok(!(panel.l < part.r && part.l < panel.r && panel.t < part.b && part.t < panel.b), `${label}: panel covers ${part.name}`);
}

async function test(name, options, query, check) {
  if (values.filter && !new RegExp(values.filter).test(name)) return;
  const result = { name, status: 'running', errors: [], requests: [] };
  report.cases.push(result);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, ...options });
  await spyStorage(context);
  await resumeStalls(context, HOOK);
  const p = await context.newPage();
  p.setDefaultTimeout(20000);
  p.on('pageerror', error => result.errors.push(error.message));
  context.on('request', request => { if (/^https?:/.test(request.url())) result.requests.push(request.url()); });
  try {
    await p.goto(address(query));
    await p.waitForFunction(() => !!document.querySelector('.coast-sample canvas') && !!document.querySelector('.range-panel'), null, { timeout: 60000 });
    result.detail = await check(p);
    result.stallResumes = await stallResumes(p);
    result.storage = await untouched(p);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.requests, []);
    result.status = 'passed';
    console.log('PASS', name);
  } catch (error) {
    result.status = 'failed'; result.error = error.stack;
    result.state = await (query.includes('test=1') ? state(p) : storage(p)).catch(() => null);
    console.error('FAIL', name, error.message);
  } finally {
    await p.screenshot({ path: resolve(out, `${report.cases.length}.png`) }).catch(() => {});
    await context.close();
    await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}

/** Select a gun on the panel, then click at the 5-tile target until a hit lands; the panel must show the new count. */
async function hitWith(p, gun) {
  await p.locator(`[data-gun="${gun}"]`).click();
  await held(p, gun);
  const before = (await state(p)).stats;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await running(p, 30000, HOOK);
    await steady(p);
    const at = await aimAt(p, 'd5'), shots = (await state(p)).stats.shots;
    assert.ok(await clickUncoveredCanvas(p, at.x, at.y), `the 5-tile target is covered at ${at.x}, ${at.y}`);
    // A click that met a stall pause is dropped: aim and click again.
    if (!await p.waitForFunction(n => window.__bincovRange.stats().shots > n, shots, { timeout: 10000 }).then(() => true, () => false)) continue;
    await simulated(p, .6); // a bullet crosses the 160 px in about 0.2 s
    const now = (await state(p)).stats;
    if (now.hits.d5 <= before.hits.d5) continue;
    await p.waitForFunction(n => document.querySelector('.range-panel').shadowRoot.querySelector('[data-hits="d5"]').textContent === String(n), now.hits.d5, { timeout: 10000 });
    return { gun, attempts: attempt, hits: now.hits.d5 - before.hits.d5, shots: now.shots - before.shots };
  }
  assert.fail(`${gun}: no hit on the 5-tile target in 8 clicks`);
}

/** Hold the left button with the M4A1: several shots, published as automatic fire; none after the release. */
async function holdRifle(p) {
  await p.locator('[data-gun="mb4a1"]').click();
  await held(p, 'mb4a1');
  for (let attempt = 1; attempt <= 4; attempt++) {
    await running(p, 30000, HOOK);
    await steady(p);
    const at = await aimAt(p, 'd5'), before = await state(p), stalls = await stallResumes(p);
    let outcome, during;
    await p.mouse.down();
    try {
      outcome = await (await p.waitForFunction(([n, s]) => window.__bincovRange.stats().shots >= n + 6 ? 'fired'
        : (window.__stallResumes ?? 0) !== s ? 'stalled' : false, [before.stats.shots, stalls], { timeout: 30000 })).jsonValue();
      during = await state(p);
    } finally { await p.mouse.up(); }
    if (outcome !== 'fired') continue;
    await frames(p, 3);
    const released = await state(p);
    await simulated(p, .5);
    const after = await state(p);
    assert.equal(during.aim.mode, 'auto');
    assert.equal(after.stats.shots, released.stats.shots, 'shots after the button was released');
    assert.equal(await panelText(p, '[data-aim="mode"]'), '全自动');
    return { attempts: attempt, shots: released.stats.shots - before.stats.shots, mode: during.aim.mode, at };
  }
  assert.fail('the held M4A1 did not fire six shots');
}

try {
  await test('range: storage, hits with every gun, automatic fire, panel presses, layout and abandon', {}, '?range=1&test=1', async p => {
    await running(p, 60000, HOOK);
    const start = await state(p);
    assert.equal(start.weapon.id, 'pistol');
    assert.equal(await p.evaluate(() => typeof window.__bincov), 'undefined', 'the game test hook stays off on the range');
    await untouched(p);
    const guns = [];
    for (const gun of ['pistol', 'gb17', 'carbine', 'shotgun', 'mb4a1']) guns.push(await hitWith(p, gun));
    const rifle = await holdRifle(p);

    // #28 M2-15: the two M4A1 builds to compare. Each arms the rifle fitted as that build (its own magazine), the view
    // draws it as built, its button shows pressed; the plain M4A1 goes back to the factory gun.
    const build = async (selector, sig, mag) => {
      await p.locator(selector).click();
      await p.waitForFunction(sig => window.__bincovRange.host.lastBatch.frame.player.gun?.sig === sig, sig, { timeout: 20000 });
      const now = await p.evaluate(() => { const f = window.__bincovRange.host.lastBatch.frame; return { id: f.hud.weapon.id, mag: f.hud.weapon.magSize }; });
      assert.deepEqual(now, { id: 'mb4a1', mag }, selector);
      await frames(p, 2);
      return p.evaluate(() => [...document.querySelector('.range-panel').shadowRoot.querySelectorAll('[aria-pressed="true"][data-build], [aria-pressed="true"][data-gun]')].map(b => b.dataset.build ?? b.dataset.gun));
    };
    assert.deepEqual(await build('[data-build="light"]', 'handguard/under=F03,handguard=H01,mag=G10,rearGrip=P01,stock=S01,top=O03', 20), ['light']);
    assert.deepEqual(await build('[data-build="steady"]', 'barrel=B08,handguard/under=F01,handguard=H01,muzzle=M06,rearGrip=P02,stock=S02,top=O08', 30), ['steady']);
    assert.deepEqual(await build('[data-gun="mb4a1"]', '', 30), ['mb4a1']);

    // Presses on the panel: no shot, the magazine untouched, and the host's pointer (the aim's source) never moves. The
    // camera may still settle by a whole pixel, which turns the aim by under 0.01 rad; a press that reached the canvas
    // would swing it toward the panel, west of the player.
    await p.locator('[data-gun="pistol"]').click();
    await held(p, 'pistol');
    await running(p, 30000, HOOK);
    await steady(p);
    await aimAt(p, 'd10');
    await frames(p, 6);
    const pointer = () => p.evaluate(() => { const { x, y } = window.__bincovRange.host.input.pointer; return { x, y }; });
    const before = await state(p), from = await pointer();
    const presses = ['[data-act="mover"]', '[data-act="mover"]', '[data-act="fold"]', '[data-act="fold"]'];
    for (const selector of presses) {
      await p.locator(selector).click();
      await frames(p, 2);
    }
    // The hit-feel A/B switch (#75 H-01) flips the view option the sound layer reads at every shot, and back.
    const feel = () => p.evaluate(() => {
      const button = document.querySelector('.range-panel').shadowRoot.querySelector('[data-act="feel"]');
      return [window.__bincovRange.host.opts.feel ?? 'enhanced', button.textContent, button.getAttribute('aria-pressed')];
    });
    const feels = [await feel()];
    for (let i = 0; i < 2; i++) {
      await p.locator('[data-act="feel"]').click();
      await frames(p, 2);
      feels.push(await feel());
    }
    assert.deepEqual(feels, [['enhanced', '打击感：新版', 'true'], ['classic', '打击感：旧版', 'false'], ['enhanced', '打击感：新版', 'true']]);
    await simulated(p, .3);
    const after = await state(p);
    assert.equal(after.stats.shots, before.stats.shots, 'a panel press fired');
    assert.equal(after.weapon.mag, before.weapon.mag);
    assert.deepEqual(await pointer(), from, 'a panel press moved the pointer the aim follows');
    assert.ok(Math.abs(after.player.aim - before.player.aim) < .01, `a panel press turned the aim: ${before.player.aim} -> ${after.player.aim}`);

    // Reset zeroes the counts on the panel.
    await p.locator('[data-act="reset"]').click();
    await p.waitForFunction(() => { const s = window.__bincovRange.stats(); return s.shots === 0 && Object.values(s.hits).every(n => n === 0); });
    await p.waitForFunction(() => document.querySelector('.range-panel').shadowRoot.querySelector('[data-shots]').textContent === '0');

    // The panel fits beside the HUD at both desktop sizes.
    const sizes = {};
    for (const [width, height] of [[1280, 720], [1920, 1080]]) {
      await p.setViewportSize({ width, height });
      await running(p, 60000, HOOK);
      await frames(p, 10);
      const box = await layout(p);
      fits(box, `${width}x${height}`);
      const player = await p.evaluate(() => { const h = window.__bincovRange.host, f = h.lastBatch.frame.player; return h.view.worldToClient({ x: f.x, y: f.y - 22 }); });
      assert.ok(player.x > box.panel.r, `${width}x${height}: the panel covers the player`);
      sizes[`${width}x${height}`] = box.panel;
    }

    // Abandoning settles the in-memory raid; after the outro the page reloads into a fresh range, storage still unused.
    await untouched(p);
    await p.locator('[data-gun="carbine"]').click();
    await held(p, 'carbine');
    for (let i = 0; i < 5 && await p.evaluate(() => window.__bincovRange.host.panel) !== 'pause'; i++) {
      await running(p, 30000, HOOK);
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => window.__bincovRange.host.panel === 'pause', null, { timeout: 20000 });
      await frames(p, 3); // a stall pause shown in the same moment is resumed within a frame
    }
    assert.equal(await p.evaluate(() => document.querySelector('.range-panel').shadowRoot.querySelector('.rg').hidden), true, 'the range panel hides behind the pause panel');
    const reload = p.waitForEvent('framenavigated', { timeout: 60000 });
    await p.locator('.coast-sample [data-do="abandon"]').click();
    await p.locator('.coast-sample [data-do="abandon-yes"]').click();
    await reload;
    await p.waitForFunction(() => !!window.__bincovRange?.host?.lastBatch, null, { timeout: 60000 });
    await running(p, 60000, HOOK);
    const fresh = await state(p);
    assert.equal(fresh.weapon.id, 'pistol', 'the reloaded range starts over');
    assert.deepEqual(fresh.stats, { shots: 0, hits: { d5: 0, d10: 0, d15: 0, d20: 0, mover: 0 } });
    return { guns, rifle, feels, sizes, reloaded: fresh.weapon.id };
  });

  await test('range: phone layout without the test hook, by touch', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, '?range=1', async p => {
    assert.equal(await p.evaluate(() => typeof window.__bincovRange), 'undefined');
    assert.equal(await p.evaluate(() => typeof window.__bincov), 'undefined');
    assert.equal(await p.evaluate(() => document.documentElement.classList.contains('mobile')), true);
    // Without the hook, a stall pause is resumed by hand; the panel shows again once the raid runs.
    const shown = () => p.evaluate(() => !document.querySelector('.range-panel').shadowRoot.querySelector('.rg').hidden);
    for (let i = 0; i < 20 && !await shown(); i++) {
      await p.evaluate(() => { const b = document.querySelector('.coast-sample [data-panel] [data-do="resume"]'); if (b && !b.disabled) b.click(); });
      await frames(p, 3);
    }
    assert.ok(await shown(), 'the range panel is visible');
    const folded = await p.evaluate(() => document.querySelector('.range-panel').shadowRoot.querySelector('.rg').classList.contains('folded'));
    assert.equal(folded, true, 'a phone starts with the panel folded');
    fits(await layout(p), 'phone folded');
    await p.locator('[data-act="fold"]').tap();
    await p.locator('[data-gun="carbine"]').tap();
    await p.waitForFunction(() => document.querySelector('.range-panel').shadowRoot.querySelector('[data-gun="carbine"]').getAttribute('aria-pressed') === 'true', null, { timeout: 30000 });
    const open = await layout(p);
    fits(open, 'phone open');
    await p.screenshot({ path: resolve(out, 'phone-open.png') });
    return { folded, open: open.panel, hudParts: open.hud.length };
  });
} finally {
  await browser.close();
}
assert.ok(report.cases.length, 'No selected test cases');
assert.equal(report.cases.filter(c => c.status === 'failed').length, 0, 'Shooting range regression failed; see report.json');
