/**
 * The 2.5D raid view is the default (no ?sample): the deploy panels offer 沿海街区 and 滨湾商场 only (the classic coast
 * area is closed), both run on the Pixi view without the playtest marks, a new mall raid uses layout 3, raids started
 * before the switch (classic coast, mall layout 1) resume on the same 2.5D view, and a browser without WebGL gets a
 * notice instead of the game while its save stays byte for byte. The ordinary entry has no test interface: checks read
 * the page and the stored session.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { deployFromYard, skipOpening, throughYard } from './yard-entry.mjs';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = resolve(option('out', 'test-results/raid-default'));
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
const ORIGIN = 'https://default.test/';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { html: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), checks: [], errors: [], requests: [] };
const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
await context.route(`${ORIGIN}**`, r => r.fulfill({ contentType: 'text/html', body: html }));
context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(ORIGIN)) report.requests.push(r.url()); });
let page = await open();

async function open() {
  const p = await context.newPage(); p.setDefaultTimeout(30000);
  p.on('pageerror', e => report.errors.push(String(e.stack)));
  p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  return p;
}
async function check(name, fn) {
  const row = { name }; report.checks.push(row);
  try { row.result = await fn() ?? null; row.status = 'passed'; }
  catch (error) { row.status = 'failed'; row.error = String(error.stack); process.exitCode = 1; await page.screenshot({ path: resolve(out, `failure-${report.checks.length}.png`) }).catch(() => {}); }
  console.log(row.status, name, row.error?.split('\n')[0] ?? '');
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
const shot = name => page.screenshot({ path: resolve(out, `${name}.png`) });
/** World versions in the stored session (the record nests JSON strings, so walk those too). */
const stored = () => page.evaluate(() => {
  const found = [], walk = v => {
    if (typeof v === 'string' && /^[[{]/.test(v)) { try { walk(JSON.parse(v)); } catch { /* not JSON */ } return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) { if (k === 'worldVersion' && typeof x === 'string') found.push(x); else walk(x); }
  };
  walk(localStorage.getItem('escape-bincov.session.v2'));
  return [...new Set(found)];
});
const storage = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
async function title(query = '') {
  await page.goto(`${ORIGIN}${query}`);
  await page.locator('[data-action="enter"]').waitFor();
}
async function yard(query = '') {
  // A new save plays the opening first on the ordinary entry; skip it as a player can.
  await title(query); await page.locator('[data-action="enter"]').click(); await skipOpening(page);
  await page.locator('#station-yard [data-quickmenu], #station-yard [data-quick="deploy"]').first().waitFor({ state: 'attached' });
}
/** The yard's area choices, read from its departure panel (opened and closed again). */
async function yardWorlds() {
  const go = page.locator('#station-yard [data-quick="deploy"]');
  if (!await go.isVisible()) await page.locator('#station-yard [data-quickmenu]').click();
  await go.click();
  await page.locator('#station-yard label.world').first().waitFor();
  const r = await page.evaluate(() => {
    const root = document.querySelector('#station-yard').shadowRoot ?? document.querySelector('#station-yard');
    const inputs = [...root.querySelectorAll('label.world input')];
    return { worlds: inputs.map(i => i.value), checked: inputs.find(i => i.checked)?.value ?? null, names: [...root.querySelectorAll('label.world b')].map(b => b.textContent) };
  });
  return r;
}
const pixiRunning = () => page.waitForFunction(() => document.documentElement.dataset.coastSample === 'run' && !!document.querySelector('.coast-sample canvas'));
const where = async () => { await page.waitForFunction(() => (document.querySelector('.coast-sample [data-where]')?.textContent ?? '').length > 0); return page.locator('.coast-sample [data-where]').textContent(); };
/** Abandon from the pause panel (a resumed raid opens on it; a running one opens it with Esc). */
async function abandonPixi() {
  if (!await page.locator('.coast-sample [data-do="abandon"]').isVisible()) await page.keyboard.press('Escape');
  await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
  await page.waitForFunction(() => !document.querySelector('.coast-sample') && !!document.querySelector('#ui [data-action="return"]'), null, { timeout: 30000 });
}
/**
 * A raid started before the switch, left mid-raid: a classic coast checkpoint raid (test pages still deploy the closed
 * area) or a mall layout 1 raid (no panel deploys layout 1 any more, so it is begun through the session's own call).
 */
async function startedBefore(world) {
  if (world === 'coast') {
    await yard('?test=1&sample=village');
    const choice = await yardWorlds();
    assert.deepEqual(choice.worlds, ['coast', 'buildings', 'mall'], 'test pages still offer the classic area');
    await page.locator('#station-yard label.world:has(input[value="coast"])').click();
    await page.locator('#station-yard #seed').fill('7');
    await page.locator('#station-yard [data-act="deploy"]').click();
    await pixiRunning();
  } else {
    await title('?test=1&entry=tabs'); await page.locator('[data-action="enter"]').click();
    await page.waitForFunction(() => window.__bincov?.app.state === 'hideout');
    assert.equal(await page.evaluate(() => window.__bincov.saveSession.beginRun(7, 'mall')), true, 'mall layout 1 raid begun');
  }
}
/** Continue from the ordinary title: the raid comes back on the 2.5D view, paused, with no test interface. */
async function resumeOrdinary() {
  await title(); await page.locator('[data-action="enter"]').click();
  await pixiRunning();
  await page.locator('.coast-sample [data-do="abandon"]').waitFor();
  return { where: await where(), testInterface: await page.evaluate(() => !!window.__bincov || !!window.__bincovSample) };
}

await check('R1 yard: the deploy panel offers 沿海街区 (selected) and 滨湾商场; 沿海封锁区 is closed', async () => {
  await yard();
  const r = await yardWorlds();
  assert.deepEqual(r, { worlds: ['buildings', 'mall'], checked: 'buildings', names: ['沿海街区', '滨湾商场'] });
  await page.waitForTimeout(800); await shot('R1-yard-deploy-panel');
  return r;
});

await check('R2 old tab page (页签 from the yard): the area list has the same two areas', async () => {
  await yard(); await throughYard(page);
  const r = await page.evaluate(() => ({ options: [...document.querySelectorAll('#run-world option')].map(o => [o.value, o.textContent, o.selected]),
    note: document.querySelector('.departure-note strong')?.textContent ?? null }));
  assert.deepEqual(r.options, [['buildings', '沿海街区 · 居民楼', true], ['mall', '滨湾商场 · 两层与露台', false]]);
  assert.ok(!r.note?.includes('沿海封锁区'), r.note);
  return r;
});

await check('R3 沿海街区 deploys on the 2.5D view; outside the dressed corner there is no playtest mark', async () => {
  await yard(); await deployFromYard(page, { world: 'buildings', seed: 42 });
  await pixiRunning();
  const text = await where();
  assert.ok(text.startsWith('沿海街区 · 室外 / 一楼'), text);
  assert.ok(!text.includes('样板外'), text);
  assert.deepEqual(await stored(), ['coast-buildings-v1']);
  assert.equal(await page.evaluate(() => !!window.__bincov || !!window.__bincovSample), false, 'no test interface on the ordinary entry');
  await page.waitForTimeout(1500); await shot('R3-street-2.5d-seed42');
  await abandonPixi();
  return { where: text };
});

await check('R4 滨湾商场 deploys layout 3 on the 2.5D view', async () => {
  await yard(); await deployFromYard(page, { world: 'mall', seed: 42 });
  await pixiRunning();
  const text = await where();
  assert.ok(text.startsWith('滨湾商场'), text);
  assert.ok(!text.includes('样板外'), text);
  assert.deepEqual(await stored(), ['mall-v3']);
  await page.waitForTimeout(1500); await shot('R4-mall-2.5d');
  await abandonPixi();
  return { where: text };
});

await check('R5 a classic coast raid started before the area closed resumes on the 2.5D view and settles', async () => {
  await startedBefore('coast');
  assert.ok((await stored()).includes('coast-v2'), 'a classic checkpoint raid was deployed');
  const r = await resumeOrdinary();
  assert.deepEqual(r, { where: '沿海封锁区 · 室外 / 一楼', testInterface: false });
  await page.waitForFunction(() => !!document.querySelector('.coast-sample [data-state]')?.textContent.trim());
  assert.doesNotMatch(await page.locator('.coast-sample [data-state]').textContent(), /精神|水分|饱食/, 'classic raids keep their original status line');
  await page.waitForTimeout(1200); await shot('R5-classic-resume-2.5d');
  await abandonPixi();
  assert.ok((await page.locator('#ui').innerText()).includes('行动报告'), 'the result page follows');
  assert.deepEqual(await stored(), [], 'the settled raid left no world in the save');
  return r;
});

await check('R6 a mall layout 1 raid started before the switch resumes on the 2.5D view and settles', async () => {
  await startedBefore('mall');
  assert.deepEqual(await stored(), ['mall-v1']);
  const r = await resumeOrdinary();
  assert.ok(r.where.startsWith('滨湾商场 · 一层'), r.where);
  assert.equal(r.testInterface, false);
  await page.waitForTimeout(1200); await shot('R6-mall-v1-resume-2.5d');
  await abandonPixi();
  assert.deepEqual(await stored(), []);
  return r;
});

await check('R7 the view follows the raid, not the playtest flag: ?sample=village draws a mall raid with the mall art', async () => {
  await yard('?test=1&sample=village'); await deployFromYard(page, { world: 'mall', seed: 42 });
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
  const r = await page.evaluate(() => ({ mallArt: window.__bincovSample.counts().mallArt, art: window.__bincovSample.counts().art }));
  assert.deepEqual(r, { mallArt: 'sol', art: 'sol' });
  assert.deepEqual(await stored(), ['mall-v3']);
  await abandonPixi();
  return r;
});

await check('R10 county map: previews cannot deploy, selections preserve the seed, and desktop/phone layouts remain reachable', async () => {
  await yard(); await yardWorlds();
  const root = page.locator('#station-yard'), go = root.locator('[data-act="deploy"]');
  assert.equal(await root.locator('.county-node').count(), 12);
  assert.equal(await root.locator('.county-node.unbuilt').count(), 10);
  await root.locator('#seed').fill('county-82');
  for (const id of ['hospital', 'old-hospital', 'factory', 'laboratory', 'highway', 'market', 'observatory', 'lighthouse', 'harbor', 'freighter']) {
    await root.locator(`[data-region="${id}"]`).click();
    assert.equal(await go.isDisabled(), true, id);
    assert.match(await root.locator('.region-development').innerText(), /暂未开发/);
    assert.match(await root.locator('.region-eyebrow strong').innerText(), /暂未开发/);
    assert.equal(await root.locator('input[name="world"]:checked').count(), 0);
    assert.equal(await root.locator('#seed').inputValue(), 'county-82');
    // Even if a stale/modified DOM enables the button, a preview must never deploy the previous playable world.
    await go.evaluate(b => { b.disabled = false; b.click(); });
    assert.equal(await root.count(), 1, 'unbuilt region stays in the yard');
    assert.deepEqual(await stored(), [], 'preview must not create an active raid');
  }
  await root.locator('input[value="mall"]').check();
  assert.equal(await go.isDisabled(), false);
  assert.equal(await root.locator('#seed').inputValue(), 'county-82');
  assert.equal(await root.locator('.region-brief h3').innerText(), '滨湾商场');
  // Radio keyboard navigation survives rendering the new briefing, rather than losing focus to the page.
  await root.locator('input[value="mall"]').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await root.locator('input[value="buildings"]').isChecked(), true);
  const layout = [];
  for (const [width, height] of [[1280, 720], [1920, 1080], [844, 390], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    // Resize repaints the panel while Playwright waits for element stability.
    // Scroll the freshly resolved node synchronously before measuring its layout.
    await root.locator('.county-heading').evaluate(el => el.scrollIntoView({ block: 'nearest' }));
    const geometry = await root.locator('.county-chart').evaluate(chart => {
      // Focus and scrollIntoView scroll any scroll container; the chart must not be one, or the map slides off its frame.
      chart.scrollLeft = chart.scrollTop = 999;
      const box = r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      const meet = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
      const frame = chart.getBoundingClientRect(), stage = chart.querySelector('.county-stage').getBoundingClientRect(), shadow = chart.getRootNode();
      const overlays = [...chart.closest('.county-survey').querySelectorAll('.county-heading, .county-legend')].map(o => box(o.getBoundingClientRect())).filter(o => o.right > o.left);
      // Markers are the twelve region nodes and the station; each is a landmark pin with its label on one side.
      const marks = [...chart.querySelectorAll('.county-node, .county-base')].map(n => {
        const pin = n.querySelector('.node-pin').getBoundingClientRect();
        const x = stage.left + stage.width * parseFloat(n.style.getPropertyValue('--x')) / 100, y = stage.top + stage.height * parseFloat(n.style.getPropertyValue('--y')) / 100;
        return { el: n, name: n.querySelector('b').textContent, r: box(n.getBoundingClientRect()), off: Math.hypot(pin.left + pin.width / 2 - x, pin.top + pin.height / 2 - y), pin: [pin.left + pin.width / 2, pin.top + pin.height / 2] };
      });
      return { clipped: marks.filter(({ r }) => r.left < frame.left - 1 || r.right > frame.right + 1 || r.top < frame.top - 1 || r.bottom > frame.bottom + 1).map(m => m.name),
        overlapping: marks.flatMap((a, i) => marks.slice(i + 1).filter(b => meet(a.r, b.r)).map(b => [a.name, b.name])),
        covered: marks.filter(m => overlays.some(o => meet(m.r, o))).map(m => m.name),
        // The pin centre is the landmark on the art, and a click there reaches that region's control.
        misplaced: marks.filter(m => m.off > 1.5).map(m => [m.name, Math.round(m.off * 10) / 10]),
        missed: marks.filter(m => m.el.matches('.county-node') && !m.el.contains(shadow.elementFromPoint(...m.pin))).map(m => m.name),
        // The art keeps its 3:2 proportions, is centred and is cropped by at most 6% per axis to fill the chart.
        stretched: Math.abs(stage.width / stage.height - 1.5) > .01, cropped: Math.max(1 - frame.width / stage.width, 1 - frame.height / stage.height) > .065,
        offCentre: Math.abs(stage.left + stage.right - frame.left - frame.right) > 2 || Math.abs(stage.top + stage.bottom - frame.top - frame.bottom) > 2,
        overflow: chart.closest('.pbody').scrollWidth > chart.closest('.pbody').clientWidth + 1 };
    });
    assert.deepEqual(geometry, { clipped: [], overlapping: [], covered: [], misplaced: [], missed: [], stretched: false, cropped: false, offCentre: false, overflow: false }, `${width}x${height}`);
    await shot(`R10-county-map-${width}x${height}`);
    // An unbuilt pick shows its briefing art without hiding the 暂未开发 status or the planning note.
    await root.locator('[data-region="lighthouse"]').click();
    const brief = await root.locator('.region-brief').evaluate(b => {
      const r = s => b.querySelector(s).getBoundingClientRect(), meet = (a, c) => Math.min(a.right, c.right) > Math.max(a.left, c.left) && Math.min(a.bottom, c.bottom) > Math.max(a.top, c.top);
      const art = r('.region-art');
      return { status: meet(art, r('.region-eyebrow strong')), note: meet(art, r('.region-development')), image: (b.querySelector('.region-art img')?.naturalWidth ?? 0) > 0 };
    });
    assert.deepEqual(brief, { status: false, note: false, image: true }, `${width}x${height} briefing`);
    await shot(`R10-county-preview-${width}x${height}`);
    await root.locator('input[value="buildings"]').check();
    await go.evaluate(el => el.scrollIntoView({ block: 'nearest' })); assert.equal(await go.isVisible(), true);
    assert.equal(await go.isDisabled(), false);
    await go.screenshot({ path: resolve(out, `R10-deploy-${width}x${height}.png`) });
    layout.push({ width, height, ...geometry });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  return layout;
});

await check('R11 county map motion: a pick patches the map in place, every animation ends, reduced motion stops them and closing the panel ends them', async () => {
  await yard(); await yardWorlds();
  const root = page.locator('#station-yard');
  const panel = () => page.evaluate(() => {
    const r = document.querySelector('#station-yard').shadowRoot;
    return r.getAnimations().filter(a => a.effect?.target?.isConnected && a.effect.target.closest('.k-deploy'))
      .map(a => ({ name: a.animationName ?? a.transitionProperty, iterations: a.effect.getComputedTiming().iterations }));
  });
  // Tag the live nodes, pick 旧渔港 and look in the same task: a rebuilt map would hand back new elements without the
  // tags, and getAnimations() flushes style, so the glide is seen however slow the runner is.
  const kept = await page.evaluate(() => {
    const r = document.querySelector('#station-yard').shadowRoot;
    for (const s of ['.county-stage', '#seed', '[data-region="harbor"]', '.region-art']) r.querySelector(s).__kept = true;
    r.querySelector('[data-region="harbor"]').click();
    const stage = r.querySelector('.county-stage');
    return { stage: stage.__kept === true, seed: r.querySelector('#seed').__kept === true, node: r.querySelector('[data-region="harbor"]').__kept === true,
      art: r.querySelector('.region-art').__kept === true, glide: stage.getAnimations().some(a => a.transitionProperty === '--map-x'), focus: r.activeElement?.dataset.region ?? null,
      moving: r.getAnimations().filter(a => a.effect?.target?.isConnected && a.effect.target.closest('.k-deploy'))
        .map(a => ({ name: a.animationName ?? a.transitionProperty, iterations: a.effect.getComputedTiming().iterations })) };
  });
  // The briefing art is keyed per region, so its reveal replays; everything else is the same element, mid-glide.
  const { moving, ...identity } = kept;
  assert.deepEqual(identity, { stage: true, seed: true, node: true, art: false, glide: true, focus: 'harbor' });
  assert.ok(moving.length > 0, 'a pick animates');
  assert.deepEqual(moving.filter(a => !Number.isFinite(a.iterations)), [], 'nothing in the panel loops forever');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await root.locator('[data-region="factory"]').click();
  await root.locator('input[value="mall"]').check();
  assert.deepEqual(await panel(), [], 'reduced motion: picks change at once');
  assert.equal(await root.locator('.county-route .route-bed').evaluate(p => getComputedStyle(p).strokeDashoffset), '0px', 'reduced motion still draws the whole route');
  await page.emulateMedia({ reducedMotion: null });
  await root.locator('[data-region="observatory"]').click();
  await page.keyboard.press('Escape');
  await root.locator('.county-deploy').waitFor({ state: 'detached' });
  assert.deepEqual(await panel(), [], 'closing the panel leaves no animation running');
  return { moving };
});

await check('R8 without WebGL the page shows the notice instead of the game and leaves the save untouched', async () => {
  await title();
  const before = await storage();
  assert.ok(Object.keys(before).length > 0, 'a save exists to protect');
  await page.close();
  page = await open();
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : get.call(this, type, ...rest); };
    Object.defineProperty(navigator, 'gpu', { get: () => undefined });
  });
  await page.goto(ORIGIN);
  await page.locator('.webgl-required').waitFor();
  const r = await page.evaluate(() => ({ heading: document.querySelector('.webgl-required h2')?.textContent, frame: !!document.getElementById('frame'), canvases: document.querySelectorAll('canvas').length }));
  assert.deepEqual(r, { heading: '需要支持 WebGL 的浏览器', frame: false, canvases: 0 });
  await page.waitForTimeout(500);
  assert.deepEqual(await storage(), before, 'storage unchanged byte for byte');
  await shot('R8-webgl-required-1280');
  await page.setViewportSize({ width: 390, height: 844 }); await shot('R8-webgl-required-390');
  return r;
});

await check('R9 phone (844x390 touch): the 2.5D raid has a weapon button that switches to the knife and back', async () => {
  const phone = await browser.newContext({ offline: true, viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await phone.route(`${ORIGIN}**`, r => r.fulfill({ contentType: 'text/html', body: html }));
  phone.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(ORIGIN)) report.requests.push(r.url()); });
  const desktop = page;
  try {
    page = await phone.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => report.errors.push(String(e.stack)));
    await yard(); await deployFromYard(page, { world: 'buildings', seed: 42 });
    await pixiRunning();
    const swap = page.locator('.coast-sample [data-swap]'), name = page.locator('.coast-sample [data-weapon-name]');
    await swap.waitFor({ state: 'visible' });
    const start = { weapon: await name.textContent(), label: await swap.textContent() };
    await swap.tap();
    await page.waitForFunction(() => document.querySelector('.coast-sample [data-weapon-name]')?.textContent === '水手匕首');
    const knife = { weapon: await name.textContent(), label: await swap.textContent() };
    await shot('R9-phone-knife');
    await swap.tap();
    await page.waitForFunction(w => document.querySelector('.coast-sample [data-weapon-name]')?.textContent === w, start.weapon);
    const back = { weapon: await name.textContent(), label: await swap.textContent() };
    assert.deepEqual({ start, knife, back }, { start: { weapon: start.weapon, label: '匕首' }, knife: { weapon: '水手匕首', label: '主武器' }, back: { weapon: start.weapon, label: '匕首' } });
    assert.notEqual(start.weapon, '水手匕首', 'a new save starts with a primary weapon');
    return { start, knife, back };
  } finally { await phone.close(); page = desktop; }
});

assert.deepEqual(report.requests, [], 'offline: no network requests');
// The legacy raids and the abandoned runs log nothing; any page error fails the suite.
if (report.errors.length) { console.log('page errors:', report.errors); process.exitCode = 1; }
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(`${report.checks.filter(c => c.status === 'passed').length}/${report.checks.length} passed`);
