/** Real keyboard/mouse events on isolated offline builds, on the 2.5D raid host; fixtures only remove combat noise. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { openPause, resumeStalls, running, stallResumes } from './stall-resume.mjs';

const { values } = parseArgs({ options: { entry: { type: 'string', default: 'dist/index.html' }, filter: { type: 'string', default: '' }, report: { type: 'string', default: 'desktop-input' } } });
const out = resolve('test-results', values.report);
await mkdir(out, { recursive: true });
// Audio assertions use the native AudioContext and normal autoplay policy, unlocked by real clicks.
const browser = await chromium.launch({ ...browserOptions, args: browserOptions.args.filter(arg => !arg.startsWith('--autoplay-policy=')) });
const report = { startedAt: new Date().toISOString(), browser: browser.version(), entry: values.entry,
  method: 'Offline Chromium keyboard/mouse and native AudioContext. Touch capability is emulated; positions and enemy cooldowns are fixtures. No physical-device or audible-output certification.', cases: [] };
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const raidDo = (page, name) => page.locator(`.coast-sample [data-do="${name}"]`);
/** Published raid state (the host's last batch), its open panel and the page's audio contexts. */
const state = page => page.evaluate(() => {
  const { app } = __bincov, h = window.__bincovSample.host, b = h.lastBatch, f = b.frame;
  return { x: f.player.x, y: f.player.y, elapsed: b.stamp.simulationTime, hp: f.hud.hp, maxHp: f.hud.maxHp, bleeding: f.hud.bleeding, mag: f.hud.weapon.mag,
    bag: app.loadout.bag, panel: h.panel, phase: f.phase, touch: document.documentElement.classList.contains('mobile'),
    audio: window.__audioContexts.map(context => context.state) };
});
const waitPanel = (page, value) => page.waitForFunction(v => window.__bincovSample.host.panel === v, value, { timeout: 20000 });
/** n display frames: "nothing happens" checks wait on frames, not milliseconds (a slow software-GL runner draws a few a second). */
const frames = (page, n = 3) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
/** Simulated raid time passes (the Runtime advanced at least `seconds`) while whatever the caller holds stays held. */
const simulated = async (page, seconds) => { const t = (await state(page)).elapsed; await page.waitForFunction(([t, s]) => window.__bincovSample.host.lastBatch.stamp.simulationTime >= t + s, [t, seconds], { timeout: 20000 }); };
/** Hold D until the player has started to move, so a later check about held movement starts from real movement. */
const holdRight = async page => { const x = (await state(page)).x; await page.keyboard.down('d'); await page.waitForFunction(x => window.__bincovSample.host.lastBatch.frame.player.x > x + 1, x, { timeout: 20000 }); };
/**
 * Hold a key until the player has moved `distance` px to the right (or the wait times out), then release it. A stall
 * pause resumed meanwhile (a slow runner) clears held keys, as any resume does, so the key is pressed again.
 */
async function walkRight(page, distance) {
  const start = (await state(page)).x;
  for (let attempt = 0; attempt < 4; attempt++) {
    const stalls = await stallResumes(page);
    await page.keyboard.down('d');
    let outcome;
    try {
      outcome = await (await page.waitForFunction(([x, d, s]) => window.__bincovSample.host.lastBatch.frame.player.x > x + d ? 'moved'
        : (window.__stallResumes ?? 0) !== s ? 'stalled' : false, [start, distance, stalls], { timeout: 20000 })).jsonValue();
    } finally { await page.keyboard.up('d'); }
    if (outcome === 'moved') break;
    await running(page);
  }
  return (await state(page)).x - start;
}
async function test(name, options, check) {
  if (values.filter && !new RegExp(values.filter).test(name)) return;
  const result = { name, status: 'running', errors: [], requests: [] };
  report.cases.push(result);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, ...options });
  await resumeStalls(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
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
    await action(page, 'enter').click({ timeout: 60000 });
    await page.locator('#seed').fill('42');
    await action(page, 'deploy').click();
    await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch && !window.__bincovSample.host.panel && window.__bincovSample.host.lastBatch.frame.phase === 'running');
    await page.evaluate(() => {
      const d = window.__bincovSample.driver, max = window.__bincovSample.host.lastBatch.frame.hud.maxHp;
      d.freezeAI(true); d.placePlayer({ x: 700, y: 784 }, 0, 'coast'); d.vitals({ hp: max, bleeding: false });
    });
    await page.waitForFunction(() => Math.abs(window.__bincovSample.host.lastBatch.frame.player.x - 700) < 1);
    await running(page);
    result.detail = await check(page);
    result.stallResumes = await stallResumes(page);
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
  const moved = await walkRight(page, 15);
  const aimed = await state(page);
  const canvas = await page.locator('.coast-sample canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .6, canvas.y + canvas.height * .45);
  // Right-button aim, then fire: the left press arrives as a chord (one mousedown per button).
  await page.mouse.down({ button: 'right' });
  await page.mouse.down();
  await page.waitForFunction(m => window.__bincovSample.host.lastBatch.frame.hud.weapon.mag < m, aimed.mag, { timeout: 20000 });
  // Keep both buttons held over several frames: a held mouse must not fire again.
  await frames(page, 5);
  await page.mouse.up(); await page.mouse.up({ button: 'right' });
  const fired = await state(page);
  await frames(page, 3);
  const released = await state(page);
  const detail = { touch: before.touch, moved, shots: aimed.mag - fired.mag, afterRelease: released.mag };
  assert.ok(detail.moved > 15, JSON.stringify(detail));
  assert.equal(detail.shots, 1, 'Mouse holds must stay single-shot, including in touch layout');
  assert.equal(released.mag, fired.mag, 'No shot on release');
  assert.equal(before.touch, touchLayout, 'Touch capability must not force phone layout at desktop sizes');
  if (touchLayout) {
    await page.touchscreen.tap(canvas.x + canvas.width * .6, canvas.y + canvas.height * .45);
    await frames(page, 3);
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
      await openPause(page);
      const paused = await state(page); await frames(page, 3);
      assert.equal((await state(page)).elapsed, paused.elapsed);
      await page.keyboard.press('Escape');
      await page.waitForFunction(t => !window.__bincovSample.host.panel && window.__bincovSample.host.lastBatch.stamp.simulationTime > t, paused.elapsed);
      await page.waitForFunction(() => window.__audioContexts.every(c => c.state === 'running'));
      const resumed = await state(page);
      assert.equal(resumed.panel, null); assert.ok(resumed.elapsed > paused.elapsed);
      assert.deepEqual(resumed.audio, ['running'], 'Game resumes but its native audio context stays suspended');
    }
    // Closing other panels and clicking Continue share the same working resume path.
    await running(page);
    await page.keyboard.press('m'); await waitPanel(page, 'map'); await page.keyboard.press('Escape'); await waitPanel(page, null);
    assert.deepEqual((await state(page)).audio, ['running']);
    await openPause(page); await raidDo(page, 'resume').click();
    await page.waitForFunction(() => window.__audioContexts.every(c => c.state === 'running') && !window.__bincovSample.host.panel);
  });
  await test('manual pause suspends native audio until an explicit resume', {}, async page => {
    await openPause(page);
    await page.waitForFunction(() => window.__bincovSample.host.panel === 'pause' && window.__audioContexts.every(c => c.state === 'suspended'));
    await frames(page, 3);
    assert.deepEqual((await state(page)).audio, ['suspended']);
    await raidDo(page, 'resume').click();
    await page.waitForFunction(() => window.__audioContexts.every(c => c.state === 'running'));
  });
  await test('blur pauses audio and releases held keys before keyboard resume', {}, async page => {
    await holdRight(page);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => window.__bincovSample.host.panel === 'pause' && window.__audioContexts.every(c => c.state === 'suspended'));
    const paused = await state(page);
    // Resume as a person does, after the paused view is drawn. A resume before that frame leaves the audio suspended
    // (main.ts suspends it on blur; the raid's sound layer restarts it only after it has seen a paused frame); reported.
    await frames(page, 2);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__bincovSample.host.panel && window.__bincovSample.host.lastBatch.frame.phase === 'running');
    await page.waitForFunction(() => window.__audioContexts.every(c => c.state === 'running'));
    // D is still physically down: let raid time pass and require that it does not move the player.
    await simulated(page, .3);
    const resumed = await state(page);
    assert.deepEqual(resumed.audio, ['running']); assert.equal(resumed.x, paused.x, 'Held D revived after the blur pause');
    await page.keyboard.up('d');
  });
  await test('ineffective healing preserves held movement and all medical items', {}, async page => {
    const before = await state(page);
    assert.ok(before.bag.items.some(i => ['bandage', 'medkit'].includes(i.id)));
    await holdRight(page);
    await page.keyboard.press('q', { delay: 60 });
    // The rejected heal is reported through the host's toast.
    await page.waitForFunction(() => document.querySelector('.coast-sample [data-toast]')?.classList.contains('on'));
    const toast = await page.locator('.coast-sample [data-toast]').innerText(), rejected = await state(page);
    let after;
    try {
      // A stall pause resumed meanwhile (slow runner) clears held keys, as any resume does: press D again only then.
      for (let moved = null; moved !== 'moved';) {
        const stalls = await stallResumes(page) ?? 0;
        moved = await (await page.waitForFunction(([x, s]) => window.__bincovSample.host.lastBatch.frame.player.x > x + 15 ? 'moved'
          : (window.__stallResumes ?? 0) !== s ? 'stalled' : false, [rejected.x, stalls], { timeout: 20000 })).jsonValue();
        if (moved !== 'moved') { await page.keyboard.up('d'); await running(page); await page.keyboard.down('d'); }
      }
      after = await state(page);
    } finally { await page.keyboard.up('d'); }
    assert.match(toast, /生命已满/);
    assert.deepEqual(after.bag, before.bag); assert.equal(after.hp, before.maxHp); assert.equal(after.bleeding, false);
    assert.equal(after.panel, null);
    assert.ok(after.x > rejected.x + 15, `Held D stopped after Q: ${rejected.x} -> ${after.x}`);
    return { before: before.x, afterQ: rejected.x, after: after.x, toast: await page.locator('.coast-sample [data-toast]').innerText() };
  });
  await test('failed medical write rolls back and pause still clears held movement', {}, async page => {
    await page.evaluate(() => { window.__bincovSample.driver.vitals({ hp: 60, bleeding: false }); });
    await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.hud.hp === 60);
    // Arm the fault on the trusted Q keydown, right after a periodic checkpoint (the next is two seconds of raid time away),
    // so the heal is the write that fails rather than a checkpoint that happened to run first on a slow runner.
    const savedAt = await page.evaluate(() => window.__bincov.app.lastSavedAt);
    await page.waitForFunction(t => window.__bincov.app.lastSavedAt > t, savedAt, { timeout: 20000 });
    await page.evaluate(() => {
      window.__setItem = Storage.prototype.setItem; window.__medicalFaults = 0;
      const arm = e => {
        if (!e.isTrusted || e.key.toLowerCase() !== 'q') return;
        removeEventListener('keydown', arm, true);
        Storage.prototype.setItem = () => { window.__medicalFaults++; throw new Error('Injected medical write failure'); };
      };
      addEventListener('keydown', arm, true);
    });
    const before = await state(page);
    await page.keyboard.down('d'); await page.keyboard.press('q');
    // A failed write pauses the raid on the save-error panel.
    await page.waitForFunction(() => window.__bincovSample.host.panel === 'pause' && !!document.querySelector('.coast-sample [data-do="retry-save"]'));
    const failed = await state(page);
    assert.equal(failed.hp, before.hp); assert.deepEqual(failed.bag, before.bag);
    await frames(page, 3); assert.equal((await state(page)).x, failed.x);
    assert.ok(await page.evaluate(() => window.__medicalFaults) > 0, 'the heal attempted the failing write');
    await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
    // Retry writes, then resumes play by itself (an extra Esc would pause again).
    await raidDo(page, 'retry-save').click();
    await page.waitForFunction(() => !window.__bincovSample.host.panel && window.__bincovSample.host.lastBatch.frame.phase === 'running');
    await simulated(page, .3); assert.equal((await state(page)).x, failed.x, 'Paused input must not revive on resume');
    await page.keyboard.up('d');
    assert.ok(await walkRight(page, 15) > 15);
  });
} finally {
  await browser.close();
}
assert.ok(report.cases.length, 'No selected test cases');
assert.equal(report.cases.filter(c => c.status === 'failed').length, 0, 'Desktop input regression failed; see report.json');
