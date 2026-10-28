/** PR35: production HTML and real Runtime/session. Save fixtures and fault injection require ?test=1. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { skipOpening, throughYard } from './yard-entry.mjs';
import { reportFilter, stepFilter } from './step-filter.mjs';
import * as D from '../src/domain.ts';
import { validPractice } from '../src/hideout-runtime/training.ts';
import { newExpansion, derivedLimits, upgradeToRpg } from '../src/expansion-state.ts';
import { decodeSession } from '../src/recovery-store.ts';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = resolve(option('out', 'test-results/tier2/browser')), htmlPath = option('html', 'dist/index.html');
const filter = stepFilter(), html = await readFile(htmlPath, 'utf8');
const cpuRate = Number(option('cpu-rate', '1'));
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1 && cpuRate <= 20);
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), node: process.version, platform: process.platform, browser: browser.version(),
  startedAt: new Date().toISOString(), cpuRate, methodology: 'Offline packaged HTML, real Runtime/SaveSession/localStorage and existing mouse/touch controls. Save fixtures, player placement, quota and visibility gates are test-only. Fixed Date is used only for isolated rejection/layout/rollback cases, never the full 120-second training. Practice inputs and scene render are observed; original methods receive unchanged arguments exactly once. 390x844 is touch/viewport emulation, not a real phone. Full real-clock training also uses a 640x360 auxiliary viewport to reduce software rasterization cost, with a 540-second wall budget and unchanged 120 effective seconds/reward assertions. Old-build controls assert existing rendered behavior, not the absence of a new API.', steps: [], screenshots: [], errors: [], external: [] };
let context, page, mobile;
const yard = selector => page.locator(`#station-yard ${selector}`);
const ready = () => page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
const snap = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const progress = () => page.evaluate(() => window.__bincov.hideoutRuntime.trainingProgress());
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const tap = locator => mobile ? locator.tap() : locator.click();
async function open(size = [1280, 720], fixed = false, ordinary = false) {
  await context?.close(); mobile = size[0] < 600;
  context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
  await context.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: new URL(r.request().url()).pathname === '/peer' ? '<title>peer</title>' : html }));
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  if (cpuRate > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  page.on('pageerror', e => report.errors.push(String(e.stack)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  if (fixed) await page.clock.setFixedTime(new Date());
  await page.goto(`https://station.test/${ordinary ? '' : '?test=1'}`); await tap(page.locator('[data-action="enter"]'));
  if (ordinary) { await skipOpening(page); await yard('#hud-sub').waitFor(); } else await ready();
}
async function seed({ training = true, seconds = 0, quantity = 0, body = {} } = {}) {
  // Upgraded as the station boundary does, so the growth it hands the live save carries its (empty) perk selection.
  const p = D.newSave(), e = newExpansion(Date.now()); upgradeToRpg(e, Date.now()); const l = derivedLimits(e);
  p.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2); p.quests.repair = true; p.cash = 6000;
  for (const id of ['water', 'food', 'bandage', 'medkit', 'antidote', 'focus', 'luckySachet', 'unluckySachet', 'scrap']) assert.equal(D.addItem(p.bag, id, 2), 0);
  e.base.facilities.training = training ? 1 : 0; e.base.training.attribute = training ? 'technique' : null;
  e.base.training.activeSeconds = seconds; e.base.training.quantity = quantity;
  Object.assign(e.body, { hp: l.hp, stamina: l.stamina, water: 100, satiety: 100, pollution: 0, bleeding: false }, body);
  await page.evaluate(async ({ p, e }) => { await window.__station.reseed(() => {
    const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => {
      for (const key of ['stash', 'bag', 'safe', 'quests', 'cash', 'equipment', 'stats']) d.profile[key] = p[key];
      d.expansion.body = e.body; d.expansion.growth = e.growth; d.expansion.base = e.base;
      d.expansion.base.cursor = d.expansion.base.training.startedAt = Date.now();
    }); if (s.commitExpansionMutation(ticket) !== 'committed') throw Error('fixture commit failed');
  }); }, { p, e });
  await ready(); await page.evaluate(() => {
    const h = window.__station.host; h.place(10.6, 16.3);
    const rt = window.__bincov.hideoutRuntime;
    window.__tier2Offered = []; window.__tier2Accepted = [];
    window.__tier2PracticeOriginal ??= rt.practice;
    // Test-only observation of the original validated queue, independent of the new projection.
    // Geometry-valid calls can still fail clock/continuity checks on a slow renderer.
    rt.practice = function(sample) {
      window.__tier2Offered.push(structuredClone(sample)); const count = this.samples.length;
      const result = window.__tier2PracticeOriginal.call(this, sample);
      if (this.samples.length > count) window.__tier2Accepted.push(structuredClone(sample));
      return result;
    };
    const render = h.scene.render;
    h.scene.render = function(dt, state) { window.__tier2Rendered = structuredClone(state.training); return render.call(this, dt, state); };
  });
}
async function panel(kind) {
  const current = await page.evaluate(() => window.__station.host.ui.kind);
  if (current === kind) return;
  if (current) await tap(yard('.panel [data-act="close"]'));
  const button = yard(`[data-quick="${kind}"]`); if (!await button.isVisible()) await tap(yard('[data-quickmenu]'));
  await tap(button); await page.waitForFunction(kind => window.__station.host.ui.kind === kind, kind);
  await page.evaluate(async () => { await document.fonts.ready; }); await page.waitForTimeout(250);
}
async function trainingPanel() { await panel('facility'); await tap(yard('[data-act="fac:training"]')); }
async function shot(name) { await page.screenshot({ path: resolve(out, `${name}.png`) }); report.screenshots.push(`${name}.png`); }
async function readable(selector) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const measurement = await page.waitForFunction(selector => {
    const root = document.querySelector('#station-yard')?.shadowRoot, el = root?.querySelector(selector); if (!el) return false;
    el.getBoundingClientRect();
    if ([...el.getAnimations(), ...(el.closest('.panel, .modal')?.getAnimations() ?? [])].some(a => a.playState === 'running' || a.pending) || Number(getComputedStyle(el).opacity) < .95) return false;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
      && el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 ? { x: r.x, y: r.y, w: r.width, h: r.height, text: el.textContent } : false;
  }, selector); const value = await measurement.jsonValue(); await measurement.dispose(); return value;
}
async function walk(key, ms) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); }
async function observedSamples() {
  const { offered, accepted } = await page.evaluate(() => ({ offered: window.__tier2Offered, accepted: window.__tier2Accepted }));
  assert.ok(offered.length >= accepted.length && accepted.length > 0, 'real keyboard movement must have validated samples');
  assert.ok(accepted.every(validPractice), 'accepted movement must satisfy the original geometry/speed rule');
  return { offeredCount: offered.length, acceptedCount: accepted.length, seconds: accepted.reduce((n, s) => n + s.seconds, 0) };
}
async function fault(on) { await page.evaluate(on => {
  window.__tier2Write ??= Storage.prototype.setItem;
  Storage.prototype.setItem = on ? function(k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('tier2 quota fixture', 'QuotaExceededError'); return window.__tier2Write.call(this, k, v); } : window.__tier2Write;
}, on); }
async function use(id) {
  await panel('gear'); const s = await snap(), item = s.profile.bag.items.find(i => i.id === id);
  assert.ok(item); await tap(yard(`[data-grid="bag"] [data-uid="${item.uid}"]`)); await tap(yard('[data-act="use"]'));
}
async function step(name, fn) {
  if (!filter.selects(name)) return;
  const row = { name, status: 'running' }, start = Date.now(), errors = report.errors.length; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors.slice(errors), []); assert.deepEqual(report.external, []);
    if (page.url().includes('test=1')) assert.deepEqual(await page.evaluate(() => window.__station?.host?.errors ?? []), []);
    row.status = 'passed'; console.log('PASS', name);
  } catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; console.log('FAIL', name, e.message); await shot(`fail-${report.steps.length}`).catch(() => {}); }
  row.ms = Date.now() - start; await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
try {
  await step('P01 rejected clock samples do not fill the existing scene ring or training prompt', async () => {
    await open(undefined, true); await seed(); const before = await raw();
    await page.keyboard.down('d'); await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__station.host.frame(.25); }); await page.keyboard.up('d');
    const rendered = await page.evaluate(() => window.__tier2Rendered), text = await yard('.prompt').innerText();
    assert.equal((await snap()).base.training.activeSeconds, 0); assert.equal(await raw(), before);
    assert.equal(rendered.progress, 0, 'rejected real-clock samples must not fill the ring'); assert.match(text, /0 \/ 120 秒/);
    await shot('rejected-frames-1280'); return { rendered, text };
  });
  await step('P02 cap stays visibly full and explains waiting instead of accumulating display seconds', async () => {
    await open(undefined, true); await seed({ quantity: 1 });
    await page.keyboard.down('d'); await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__station.host.frame(.25); }); await page.keyboard.up('d');
    const rendered = await page.evaluate(() => window.__tier2Rendered), text = await yard('.prompt').innerText();
    assert.equal(rendered.progress, 1, 'capped training ring must represent the cap'); assert.match(text, /训练量已达上限/);
    await trainingPanel(); assert.match(await yard('.facility').innerText(), /等待 600 秒/); await readable('[data-training-status]'); await shot('cap-wait-1280'); return { rendered, text };
  });
  for (const size of [[1280, 720], [1920, 1080], [390, 844]]) await step(`P03 ${size.join('x')} accepted sub-checkpoint ring, hint and panel share Runtime values`, async () => {
    await open(size); await seed(); await walk('d', 1350); await page.clock.setFixedTime(new Date());
    const offered = await observedSamples(), v = await progress(); assert.equal(v.saved.activeSeconds, 0);
    assert.ok(v.pendingSeconds > 0 && v.pendingSeconds < 5);
    assert.ok(Math.abs(v.pendingSeconds - offered.seconds) < 1e-8, 'pending must equal the actual validated frame samples, not wall time');
    assert.equal(v.activeSeconds, v.pendingSeconds); const text = await yard('.prompt').innerText();
    assert.match(text, new RegExp(`待保存 ${v.pendingSeconds.toFixed(1).replace('.', '\\.')} 秒`));
    const rendered = await page.evaluate(() => window.__tier2Rendered); assert.ok(Math.abs(rendered.progress - v.activeSeconds / 120) < 1e-8);
    await readable('.prompt'); await shot(`training-yard-${size.join('x')}`); const before = await raw();
    await trainingPanel(); assert.equal(await yard('[data-training-seconds]').innerText(), `已保存 0.0 秒 · 待保存 ${v.pendingSeconds.toFixed(1)} 秒`);
    await readable('[data-training-seconds]'); await readable('[data-training-status]'); await shot(`training-panel-${size.join('x')}`);
    const after = await progress(); for (let i = 0; i < 8; i++) assert.deepEqual(await progress(), after); assert.equal(await raw(), before);
    return { offered, view: v, rendered, text };
  });
  await step('P04 reward checkpoint quota retains exact candidate; backup and retry credit once', async () => {
    await open(); await seed({ seconds: 119.95 }); const before = await raw(), initial = await snap();
    await page.evaluate(() => { window.__tier2Events = []; window.__bincov.hideoutRuntime.subscribe(e => window.__tier2Events.push(e)); });
    await fault(true); await walk('d', 1800); await page.waitForFunction(() => window.__station.host.ui.dialogKind === 'storage');
    const offered = await observedSamples(), v = await progress(); assert.equal(v.status, 'storage'); assert.equal(v.saved.activeSeconds, 119.95);
    assert.ok(v.pendingSeconds > 0 && v.pendingSeconds < 5); assert.ok(v.saved.activeSeconds + v.pendingSeconds >= 120);
    assert.ok(Math.abs(v.pendingSeconds - offered.seconds) < 1e-8, 'failed candidate must contain exactly the actually accepted queue samples');
    assert.ok(v.pendingGrowth.technique > 0); assert.equal(v.quantity, .2625); assert.equal(await raw(), before);
    assert.equal((await snap()).body.attributes.technique.progress, initial.body.attributes.technique.progress);
    assert.equal(await page.evaluate(() => window.__tier2Events.filter(e => e.type === 'practice-credited').length), 0);
    await shot('training-quota-before-retry');
    const download = page.waitForEvent('download'); await tap(yard('.dialog [data-act="export"]'));
    const backupPath = resolve(out, 'candidate-backup.json'); await (await download).saveAs(backupPath);
    const backup = JSON.parse(await readFile(backupPath, 'utf8')); assert.equal(backup.record.expansion.base.training.activeSeconds, v.activeSeconds); assert.equal(backup.record.expansion.base.training.quantity, v.quantity);
    await fault(false); await tap(yard('.dialog [data-act="retry-save"]')); assert.equal((await progress()).pendingSeconds, 0);
    assert.ok(await page.evaluate(() => window.__bincov.hideoutRuntime.retrySave().ok));
    assert.equal(await page.evaluate(() => window.__tier2Events.filter(e => e.type === 'practice-credited').length), 1);
    assert.equal((await progress()).quantity, v.quantity); await shot('training-quota-after-retry'); return { offered, before: v, after: await progress() };
  });
  for (const size of [[1280, 720], [1920, 1080], [390, 844]]) await step(`S01 ${size.join('x')} compound no-effect rejection is readable and consumes nothing`, async () => {
    await open(size, true); await seed(); const before = await raw(), s = await snap(); await use('water');
    const message = '水分和耐力已满，且没有污染，饮水没有效果。'; assert.ok((await yard('.toasts').innerText()).includes(message));
    await readable('.toast.error'); await shot(`supply-no-effect-${size.join('x')}`); assert.equal(await raw(), before); assert.deepEqual((await snap()).body, s.body); assert.deepEqual((await snap()).profile, s.profile);
    return { message, items: D.count(s.profile.bag, 'water') };
  });
  await step('S02 missing/non-supply results are stable; secondary and sustained effects retain existing behavior', async () => {
    await open(undefined, true); await seed(); const before = await raw();
    const refused = await page.evaluate(() => { const r = window.__bincov.hideoutRuntime, s = r.snapshot(); return [r.useSupply('bag', 'missing'), r.useSupply('bag', s.profile.bag.items.find(i => i.id === 'scrap').uid)]; });
    assert.deepEqual(refused.map(r => r.reason), ['missing-item', 'not-supply']); assert.equal(await raw(), before);
    const effects = [];
    for (const [id, body, field] of [['water', { pollution: 12 }, 'pollution'], ['water', { stamina: 20 }, 'stamina'], ['food', { hp: 40 }, 'hp'], ['food', { stamina: 20 }, 'stamina'], ['medkit', { bleeding: true }, 'bleeding']]) {
      await seed({ body }); const before = await snap(); await use(id); const after = await snap(); assert.notEqual(after.body[field], before.body[field]); assert.equal(D.count(after.profile.bag, id), 1); effects.push({ id, field, before: before.body[field], after: after.body[field] });
    }
    await seed(); const sustained = await page.evaluate(() => {
      const r = window.__bincov.hideoutRuntime, uid = id => r.snapshot().profile.bag.items.find(i => i.id === id).uid;
      return [r.useSupply('bag', uid('focus')), r.useSupply('bag', uid('focus')), r.useSupply('bag', uid('luckySachet')), r.useSupply('bag', uid('unluckySachet'))];
    }); assert.deepEqual(sustained.map(r => r.ok ? 'ok' : r.reason), ['ok', 'no-effect', 'ok', 'ok']); return { refused, effects, sustained };
  });
  await step('S03 supply write failure rolls back; retry saves first, explicit reuse consumes exactly once', async () => {
    await open(undefined, true); await seed({ body: { stamina: 20 } }); const before = await raw(), s = await snap();
    await fault(true); await use('water'); await page.waitForFunction(() => window.__station.host.ui.dialogKind === 'storage');
    assert.equal(await raw(), before); assert.deepEqual((await snap()).body, s.body); assert.deepEqual((await snap()).profile, s.profile); await shot('supply-quota-before-retry');
    await fault(false); await tap(yard('.dialog [data-act="retry-save"]')); assert.equal(D.count((await snap()).profile.bag, 'water'), 2);
    await page.waitForTimeout(350); await use('water'); const after = await snap(); assert.equal(D.count(after.profile.bag, 'water'), 1); assert.equal(after.body.stamina, after.body.staminaMax);
    await shot('supply-quota-after-reuse'); return { before: s.body.stamina, after: after.body.stamina, count: 1 };
  });
  await step('S04 real storage peer conflict outranks missing/supply rules and preserves newest bytes', async () => {
    await open(undefined, true); await seed(); const peer = await context.newPage(); await peer.goto('https://station.test/peer');
    const latest = await peer.evaluate(() => { const k = 'escape-bincov.session.v2', record = JSON.parse(localStorage.getItem(k)); record.revision++; record.profile.cash++; const text = JSON.stringify(record); localStorage.setItem(k, text); return text; });
    assert.equal(decodeSession(latest).profile.cash, 6001, 'peer replacement must be a valid complete save');
    await page.bringToFront(); await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().storage.conflict);
    assert.equal(await page.evaluate(() => window.__bincov.hideoutRuntime.useSupply('bag', 'missing').reason), 'conflict'); assert.equal((await progress()).status, 'conflict'); assert.equal(await raw(), latest); return { revision: JSON.parse(latest).revision };
  });
  await step('P05 old tabs, yard switching and reload follow durable progress and old supply callers', async () => {
    await open(undefined, true); await seed({ seconds: 12, body: { hp: 40 } }); await throughYard(page);
    await page.locator('[data-action="tab"][data-id="gear"]').click();
    const item = (await snap()).profile.bag.items.find(i => i.id === 'bandage');
    await page.locator(`[data-source="bag"][data-uid="${item.uid}"]`).click(); await page.locator('[data-action="use-base"]').click();
    assert.equal(D.count((await snap()).profile.bag, 'bandage'), 1); assert.equal((await snap()).body.hp, 56);
    await page.locator('[data-action="base-enter"]').first().click(); await ready(); assert.equal((await progress()).saved.activeSeconds, 12);
    await page.reload(); await tap(page.locator('[data-action="enter"]')); await ready(); assert.equal((await progress()).saved.activeSeconds, 12); assert.equal((await progress()).pendingSeconds, 0);
    return { savedSeconds: 12, bandages: 1, hp: 56 };
  });
  await step('P06 full real-clock 120-second training; idle/panel/hidden/focus gates never add accepted time', async () => {
    // A smaller auxiliary viewport reduces software rasterization cost. The three product sizes are tested above.
    // The original host caps each frame to .05 seconds; slow runners need more wall time, never a fake clock.
    const viewport = [640, 360]; await open(viewport); await seed(); const start = Date.now(), pauses = [];
    const total = async () => { const v = await progress(); return v.activeSeconds + v.quantity / .2625 * 120; };
    const pause = async (name, action) => { const a = await total(); await action(); const b = await total(); assert.ok(Math.abs(a - b) < 1e-8, name); pauses.push({ name, before: a, after: b }); };
    await pause('idle', () => page.waitForTimeout(700));
    await pause('open panel', async () => { await panel('gear'); await walk('d', 700); await tap(yard('.panel [data-act="close"]')); });
    for (const field of ['hidden', 'hasFocus']) await pause(`${field} gate simulation`, async () => {
      await page.evaluate(field => { Object.defineProperty(document, field, { configurable: true, value: field === 'hidden' ? true : () => false }); }, field);
      await walk('d', 700); await page.evaluate(field => { delete document[field]; }, field);
    });
    await page.evaluate(() => window.__station.host.place(10.6, 16.3));
    const trace = []; let i = 0;
    while ((await snap()).base.training.quantity === 0 && Date.now() - start < 540000) {
      await walk(i++ % 2 ? 'a' : 'd', 2200); const v = await progress(); trace.push({ wallSeconds: (Date.now() - start) / 1000, ...v });
      if (i % 12 === 0) console.log('TRAIN', Math.round((Date.now() - start) / 1000), v.saved.activeSeconds.toFixed(1), v.pendingSeconds.toFixed(1));
    }
    const end = await snap(); assert.equal(end.base.training.quantity, .2625); assert.ok(Math.abs(end.body.attributes.technique.progress - .0525) < 1e-9); assert.ok((Date.now() - start) / 1000 >= 120);
    await trainingPanel(); await shot('training-real-120-credit'); return { viewport, wallBudgetSeconds: 540, wallSeconds: (Date.now() - start) / 1000, pauses, trace, training: end.base.training, growth: end.body.attributes.technique.progress };
  });
  await step('O01 ordinary offline entry has no test globals and uses the current UI', async () => {
    await open(undefined, false, true); assert.equal(await page.evaluate(() => '__bincov' in window || '__station' in window), false);
    await tap(yard('[data-quick="facility"]')); await tap(yard('[data-act="fac:training"]')); assert.match(await yard('.facility').innerText(), /已保存.*待保存/); await shot('ordinary-offline-1280');
  });
} finally {
  const filterProblems = reportFilter(filter, report.steps.length); if (filterProblems.length) report.filterProblems = filterProblems;
  report.finishedAt = new Date().toISOString(); report.passed = report.steps.every(s => s.status === 'passed') && report.errors.length === 0 && report.external.length === 0 && !filterProblems.length;
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close();
}
