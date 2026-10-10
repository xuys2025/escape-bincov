/** Real keyboard/mouse events on isolated offline builds; scene fixtures only remove combat noise. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const { values } = parseArgs({ options: { entry: { type: 'string', default: 'dist/index.html' }, filter: { type: 'string', default: '' }, report: { type: 'string', default: 'desktop-input' } } });
const out = resolve('test-results', values.report);
await mkdir(out, { recursive: true });
// Audio assertions use the native AudioContext and normal autoplay policy, unlocked by real clicks.
const browser = await chromium.launch({ ...browserOptions, args: browserOptions.args.filter(arg => !arg.startsWith('--autoplay-policy=')) });
const report = { startedAt: new Date().toISOString(), browser: browser.version(), entry: values.entry,
  method: 'Offline Chromium keyboard/mouse and native AudioContext. Touch capability is emulated; positions and enemy cooldowns are fixtures. No physical-device or audible-output certification.', cases: [] };
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const state = page => page.evaluate(() => {
  const { app } = __bincov, r = app.raid;
  return { x: r.player.x, y: r.player.y, elapsed: r.elapsed, hp: r.hp, bleeding: r.bleeding, mag: r.mag,
    bag: app.loadout.bag, overlay: app.overlay, touch: document.documentElement.classList.contains('mobile'),
    audio: window.__audioContexts.map(context => context.state) };
});
async function test(name, options, check) {
  if (values.filter && !new RegExp(values.filter).test(name)) return;
  const result = { name, status: 'running', errors: [], requests: [] };
  report.cases.push(result);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => result.errors.push(error.message));
  context.on('request', request => { if (/^https?:/.test(request.url())) result.requests.push(request.url()); });
  await page.addInitScript(() => {
    window.__audioContexts = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.__audioContexts.push(this); }
    };
  });
  try {
    await page.goto(pathToFileURL(resolve(values.entry)).href + '?test=1&entry=tabs');
    await action(page, 'enter').click();
    await page.locator('#seed').fill('42');
    await action(page, 'deploy').click();
    await page.waitForFunction(() => __bincov.app.raid?.player?.active && !__bincov.app.overlay);
    await page.evaluate(() => {
      const r = __bincov.app.raid;
      r.player.setPosition(700, 784); r.hp = 100; r.bleeding = 0;
      r.enemies.forEach(e => { e.cooldown = 9999; });
    });
    result.detail = await check(page);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.requests, []);
    result.status = 'passed';
    console.log('PASS', name);
  } catch (error) {
    result.status = 'failed'; result.error = error.stack;
    result.state = await state(page).catch(() => null);
    console.error('FAIL', name, error.message);
  } finally {
    await page.screenshot({ path: resolve(out, `${report.cases.length}.png`) }).catch(() => {});
    await context.close();
    await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
async function keyboardAndMouse(page, touchLayout) {
  const before = await state(page);
  await page.keyboard.down('d'); await page.waitForTimeout(350); await page.keyboard.up('d');
  const moved = await state(page);
  const canvas = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .6, canvas.y + canvas.height * .45);
  await page.mouse.down({ button: 'right' });
  await page.mouse.down(); await page.waitForTimeout(500);
  await page.mouse.up(); await page.mouse.up({ button: 'right' });
  const fired = await state(page);
  await page.waitForTimeout(250);
  const released = await state(page);
  const detail = { touch: before.touch, moved: moved.x - before.x, shots: moved.mag - fired.mag, afterRelease: released.mag };
  assert.ok(detail.moved > 15, JSON.stringify(detail));
  assert.equal(detail.shots, 1, 'Mouse holds must stay single-shot, including in touch layout');
  assert.equal(released.mag, fired.mag, 'No shot on release');
  assert.equal(before.touch, touchLayout, 'Touch capability must not force phone layout at desktop sizes');
  if (touchLayout) {
    await page.touchscreen.tap(canvas.x + canvas.width * .6, canvas.y + canvas.height * .45);
    await page.waitForTimeout(250);
    assert.equal((await state(page)).mag, fired.mag, 'Canvas taps must not synthesize mouse shots');
  }
  return detail;
}
try {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await test(`desktop keyboard/mouse ${width}x${height}`, { viewport: { width, height } }, page => keyboardAndMouse(page, false));
    await test(`touch laptop keyboard/mouse ${width}x${height}`, { viewport: { width, height }, hasTouch: true, isMobile: false }, page => keyboardAndMouse(page, false));
  }
  await test('keyboard/mouse remain usable in compact touch layout', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, page => keyboardAndMouse(page, true));

  await test('Esc resumes the native audio context on every pause cycle', {}, async page => {
    await page.waitForFunction(() => window.__audioContexts.length && window.__audioContexts.every(c => c.state === 'running'));
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => __bincov.app.overlay === 'pause');
      const paused = await state(page); await page.waitForTimeout(150);
      assert.equal((await state(page)).elapsed, paused.elapsed);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const resumed = await state(page);
      assert.equal(resumed.overlay, ''); assert.ok(resumed.elapsed > paused.elapsed);
      assert.deepEqual(resumed.audio, ['running'], 'Game resumes but its native audio context stays suspended');
    }
    // Closing other panels and clicking Continue share the same working resume path.
    await page.keyboard.press('m'); await page.keyboard.press('Escape');
    assert.deepEqual((await state(page)).audio, ['running']);
    await page.keyboard.press('Escape'); await action(page, 'close').click();
    await page.waitForFunction(() => window.__audioContexts.every(c => c.state === 'running'));
  });
  await test('manual pause suspends native audio until an explicit resume', {}, async page => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => __bincov.app.overlay === 'pause' && window.__audioContexts.every(c => c.state === 'suspended'));
    await page.waitForTimeout(200);
    assert.deepEqual((await state(page)).audio, ['suspended']);
    await action(page, 'close').click();
    await page.waitForFunction(() => window.__audioContexts.every(c => c.state === 'running'));
  });
  await test('blur pauses audio and releases held keys before keyboard resume', {}, async page => {
    await page.keyboard.down('d'); await page.waitForTimeout(150);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => __bincov.app.overlay === 'pause' && window.__audioContexts.every(c => c.state === 'suspended'));
    const paused = await state(page);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const resumed = await state(page);
    assert.deepEqual(resumed.audio, ['running']); assert.equal(resumed.x, paused.x);
    await page.keyboard.up('d');
  });
  await test('ineffective healing preserves held movement and all medical items', {}, async page => {
    const before = await state(page);
    assert.ok(before.bag.items.some(i => ['bandage', 'medkit'].includes(i.id)));
    await page.keyboard.down('d'); await page.waitForTimeout(200);
    await page.keyboard.press('q', { delay: 60 }); await page.waitForTimeout(150);
    const rejected = await state(page);
    await page.waitForTimeout(350); const after = await state(page);
    await page.keyboard.up('d');
    assert.match(await page.locator('#toast').innerText(), /生命已满/);
    assert.deepEqual(after.bag, before.bag); assert.equal(after.hp, 100); assert.equal(after.bleeding, 0);
    assert.equal(after.overlay, '');
    assert.ok(after.x > rejected.x + 15, `Held D stopped after Q: ${rejected.x} -> ${after.x}`);
    return { before: before.x, afterQ: rejected.x, after: after.x };
  });
  await test('failed medical write rolls back and pause still clears held movement', {}, async page => {
    await page.evaluate(() => {
      const r = __bincov.app.raid; r.hp = 60; r.bleeding = 0;
      window.__setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new Error('Injected medical write failure'); };
    });
    const before = await state(page);
    await page.keyboard.down('d'); await page.keyboard.press('q');
    await page.waitForFunction(() => __bincov.app.overlay === 'checkpoint-error');
    const failed = await state(page);
    assert.equal(failed.hp, before.hp); assert.deepEqual(failed.bag, before.bag);
    await page.waitForTimeout(150); assert.equal((await state(page)).x, failed.x);
    await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
    await action(page, 'retry-checkpoint').click(); await page.keyboard.press('Escape');
    await page.waitForTimeout(300); assert.equal((await state(page)).x, failed.x, 'Paused input must not revive on resume');
    await page.keyboard.up('d'); await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
    assert.ok((await state(page)).x > failed.x + 15);
  });
} finally {
  await browser.close();
}
assert.ok(report.cases.length, 'No selected test cases');
assert.equal(report.cases.filter(c => c.status === 'failed').length, 0, 'Desktop input regression failed; see report.json');
