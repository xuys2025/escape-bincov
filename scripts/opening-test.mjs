// Opening cutscene acceptance (docs/OPENING-CUTSCENE-PLAN.md section 9): when it plays, skip, pause, replay,
// reduced motion, sizes, storage and network untouched, and no growth over repeated plays.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import * as D from '../src/domain.ts';
import { browserOptions } from './browser-options.mjs';
/** The legacy key only ever held profiles up to v2: the same profile without gun fields (save v6 added them). */
const legacyProfile = s => { const p = structuredClone(s); p.version = 2; delete p.equipment.weaponUid; delete p.equipment.gun; for (const inv of [p.stash, p.bag, p.safe]) for (const i of inv.items) delete i.gun; return p; };

const out = resolve('test-results', 'opening'); await mkdir(out, { recursive: true });
const html = pathToFileURL(resolve('dist/index.html')).href;
const report = { htmlSha256: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), startedAt: new Date().toISOString(),
  methodology: 'Offline file:// entry and fresh saves. The ordinary entry is driven like a player (no test hooks); ?test=1&opening=auto pages read the player state and seek. Phone sizes are Chromium emulation.',
  steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();

async function open({ query = '?test=1&opening=auto', viewport = { width: 1280, height: 720 }, mobile = false, reducedMotion = 'no-preference', legacy } = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion, offline: true });
  context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  if (legacy) await context.addInitScript(s => { if (!localStorage.getItem('escape-bincov.session.v2')) localStorage.setItem('escape-bincov.save.v1', s); }, JSON.stringify(legacyProfile(legacy)));
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(String(e.stack ?? e)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(html + query);
  await page.locator('.title-enter').waitFor();
  return { context, page };
}
const state = page => page.evaluate(() => globalThis.__bincovOpening?.state() ?? null);
const shadow = (page, selector) => page.evaluate(s => document.getElementById('opening')?.shadowRoot?.querySelector(s)?.textContent ?? null, selector);
const storage = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
const frame = page => page.evaluate(() => document.getElementById('opening').shadowRoot.querySelector('canvas').toDataURL());
async function seekTo(page, id, fraction) {
  return page.evaluate(([id, fraction]) => {
    const o = globalThis.__bincovOpening, shot = o.shots().find(s => s.id === id);
    const at = Math.round(shot.start + (shot.end - shot.start) * fraction); o.seek(at); return at;
  }, [id, fraction]);
}
async function step(name, run) {
  const started = performance.now();
  await run();
  report.steps.push({ name, ms: Math.round(performance.now() - started) });
  console.log(`PASS ${name}`);
}

try {
  await step('OP-01/02 ordinary entry: a new save plays the opening first, Esc skips into the yard, no test hook', async () => {
    const { context, page } = await open({ query: '' });
    const before = await storage(page);
    await page.locator('.title-enter').click();
    await page.locator('#opening').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => [typeof window.__bincovOpening, typeof window.__bincov].join()), 'undefined,undefined');
    assert.equal(await page.evaluate(() => document.getElementById('opening').shadowRoot.activeElement?.className), 'pause', 'focus starts on 暂停');
    assert.equal(await page.evaluate(() => document.getElementById('frame').hasAttribute('inert')), true);
    assert.equal(await page.evaluate(() => document.getElementById('opening').shadowRoot.querySelector('.tag').hidden), true, 'players never see the review tag');
    await page.waitForFunction(() => document.getElementById('opening').shadowRoot.querySelector('.caption').textContent === '台风进港那天夜里');
    assert.equal(await storage(page), before, 'playback reads and writes no storage');
    await page.screenshot({ path: resolve(out, 'ordinary-a01.png') });
    await page.keyboard.press('Escape');
    await page.locator('#opening').waitFor({ state: 'detached' });
    await page.locator('#station-yard').waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(await page.evaluate(() => document.getElementById('frame').hasAttribute('inert')), false);
    await context.close();
  });

  await step('OP-01 a save that has deployed before never autoplays', async () => {
    const legacy = D.newSave(); legacy.stats.runs = 3;
    const { context, page } = await open({ query: '', legacy });
    await page.locator('.title-enter').click();
    await page.locator('#station-yard').waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(await page.locator('#opening').count(), 0);
    await context.close();
  });

  await step('OP-04/06 pause: Space and the button pause without skipping; losing focus pauses; captions follow the clock', async () => {
    const { context, page } = await open();
    await page.locator('.title-enter').click();
    await page.waitForFunction(() => globalThis.__bincovOpening?.state().t > 300);
    await page.keyboard.press('Space');
    const a = await state(page); await page.waitForTimeout(600); const b = await state(page);
    assert.ok(a.paused && b.paused && a.t === b.t, `paused clock moved ${a.t} -> ${b.t}`);
    assert.equal(await shadow(page, '.pause'), '继续');
    await page.keyboard.press('Space'); await page.waitForTimeout(300);
    assert.equal((await state(page)).paused, false); assert.equal(await page.locator('#opening').count(), 1, 'Space never skips');
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    assert.equal((await state(page)).paused, true, 'blur pauses');
    await page.evaluate(() => document.getElementById('opening').shadowRoot.querySelector('.pause').click());
    assert.equal((await state(page)).paused, false);
    await seekTo(page, 'A06', 0.5);
    assert.equal(await shadow(page, '.caption'), '老张：你吓我一跳。已经都弄好了，还不给人歇歇。');
    await seekTo(page, 'A17', 0.4);
    assert.equal(await shadow(page, '.caption'), '［满船嘶吼］');
    for (const [id, f, name] of [['A08', 0.4, 'a08'], ['A14', 0.5, 'a14'], ['C04', 0.98, 'c04-end']]) {
      await seekTo(page, id, f); await page.waitForTimeout(40); await page.screenshot({ path: resolve(out, `1280-${name}.png`) });
    }
    await page.evaluate(() => document.getElementById('opening').shadowRoot.querySelector('.skip').click());
    await page.locator('#opening').waitFor({ state: 'detached' });
    await page.locator('#station-yard').waitFor({ state: 'attached', timeout: 30000 });
    await context.close();
  });

  await step('OP-03 「序幕」 replays on any save, returns to the menu with focus on it; entering afterwards does not replay', async () => {
    const { context, page } = await open();
    const labels = await page.$$eval('.title-menu button', b => b.map(x => x.textContent.trim()));
    assert.deepEqual(labels, ['进入水产站', '行动指南', '序幕']);
    await page.locator('[data-action="opening"]').click();
    await page.locator('#opening').waitFor({ state: 'attached' });
    await page.waitForFunction(() => !!globalThis.__bincovOpening);
    await page.keyboard.press('Escape');
    await page.locator('#opening').waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.state, document.activeElement?.dataset?.action]), ['menu', 'opening']);
    await page.locator('.title-enter').click();
    await page.locator('#station-yard').waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(await page.locator('#opening').count(), 0);
    await context.close();
  });

  await step('OP-05 reduced motion: no pan and no lightning; ordinary motion pans', async () => {
    for (const reducedMotion of ['reduce', 'no-preference']) {
      const { context, page } = await open({ reducedMotion });
      await page.locator('[data-action="opening"]').click();
      await page.waitForFunction(() => !!globalThis.__bincovOpening);
      await page.keyboard.press('Space');
      assert.equal((await state(page)).calm, reducedMotion === 'reduce');
      await seekTo(page, 'C04', 0.3); const early = await frame(page);
      await seekTo(page, 'C04', 0.45); const later = await frame(page);
      if (reducedMotion === 'reduce') assert.equal(early, later, 'C04 holds still in reduced motion');
      else assert.notEqual(early, later, 'C04 pans');
      const strike = await page.evaluate(() => globalThis.__bincovOpening.shots().find(s => s.id === 'A08').start);
      await page.evaluate(at => globalThis.__bincovOpening.seek(at + 1500 + 20), strike); const flash = await frame(page);
      await page.evaluate(at => globalThis.__bincovOpening.seek(at + 1500 + 260), strike); const after = await frame(page);
      if (reducedMotion === 'reduce') {
        // Same moment of the drift except for the ship's few pixels; the frame must not brighten.
        const mean = url => page.evaluate(async u => { const i = new Image(); i.src = u; await i.decode(); const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, 640, 360).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k] + d[k + 1] + d[k + 2]; return s / (d.length / 4); }, url);
        assert.ok(Math.abs(await mean(flash) - await mean(after)) < 2, 'no lightning in reduced motion');
      }
      await context.close();
    }
  });

  await step('OP-07 sizes: 1920x1080 is an exact 3x; phones keep captions and 44 px buttons on screen', async () => {
    for (const [viewport, mobile] of [[{ width: 1920, height: 1080 }, false], [{ width: 390, height: 844 }, true], [{ width: 844, height: 390 }, true]]) {
      const { context, page } = await open({ viewport, mobile });
      await page.locator('[data-action="opening"]').click();
      await page.waitForFunction(() => !!globalThis.__bincovOpening);
      await seekTo(page, 'A06', 0.5); await page.waitForTimeout(40);
      const box = await page.evaluate(() => {
        const r = document.getElementById('opening').shadowRoot, rect = e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
        return { stage: rect(r.querySelector('.stage')), caption: rect(r.querySelector('.caption')), buttons: [...r.querySelectorAll('button')].map(rect), vh: innerHeight, vw: innerWidth };
      });
      if (viewport.width === 1920) assert.deepEqual(box.stage, [0, 0, 1920, 1080]);
      assert.ok(box.buttons.every(([, , w, h]) => w >= 44 && h >= 44), JSON.stringify(box.buttons));
      assert.ok(box.caption[1] >= 0 && box.caption[1] + box.caption[3] <= box.vh && box.caption[3] > 0, JSON.stringify(box));
      await page.screenshot({ path: resolve(out, `${viewport.width}x${viewport.height}-a06.png`) });
      await context.close();
    }
  });

  await step('OP-10 twenty replays leave no player, canvas or listener behind', async () => {
    const { context, page } = await open();
    const cdp = await context.newCDPSession(page);
    const listeners = async () => {
      const count = async expression => {
        const { result } = await cdp.send('Runtime.evaluate', { expression });
        const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
        return listeners.length;
      };
      return { window: await count('window'), document: await count('document'), canvases: await page.evaluate(() => document.querySelectorAll('canvas').length) };
    };
    const play = async () => {
      await page.locator('[data-action="opening"]').click();
      await page.waitForFunction(() => !!globalThis.__bincovOpening);
      await page.evaluate(() => globalThis.__bincovOpening.seek(30000));
      await page.keyboard.press('Escape');
      await page.locator('#opening').waitFor({ state: 'detached' });
      await page.locator('[data-action="opening"]').waitFor();
    };
    await play();
    const warm = await listeners();
    for (let i = 0; i < 20; i++) await play();
    const after = await listeners();
    report.listeners = { warm, after };
    assert.deepEqual(after, warm);
    assert.equal(await page.evaluate(() => typeof globalThis.__bincovOpening), 'undefined');
    await context.close();
  });

  assert.deepEqual(report.requests, [], 'no network requests');
  assert.deepEqual(report.errors, [], 'no page errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'opening-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
