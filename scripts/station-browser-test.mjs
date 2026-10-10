/**
 * Station yard on the real Runtime (default hideout entry). Offline packaged build, real localStorage session, real
 * keyboard / mouse / touch input. ?test=1 only reads state, places the player and seeds save fixtures through the
 * session's own transaction (the yard is closed while a fixture is written, so no fixture plays an event).
 * Usage: pnpm test:station [--only=A1,G3,...]   (step-id prefixes)   ->  test-results/station/{report.json, *.png}
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import * as D from '../src/domain.ts';
import { assertFrames, assertFallback, assertSupplyRefused, assertSupplyUsed, assertTraining } from './station-acceptance-gates.mjs';
import { readManagedTables, readPixiEvents } from './pixi-managed-gate.mjs';

const out = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'test-results/station'); await mkdir(out, { recursive: true });
// --html=<file> runs the same checks against another build (the saved pre-fix build for failure controls).
const htmlPath = process.argv.find(a => a.startsWith('--html='))?.slice(7) ?? 'dist/index.html';
const html = await readFile(htmlPath, 'utf8');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, browser: browser.version(), startedAt: new Date().toISOString(), methodology: 'Packaged offline build at https://station.test/ (routed, no network). Real session/localStorage, real DOM input in headless Chrome; phone sizes are viewport/touch emulation. ?test=1 fixtures: player placement, save seeding through SaveSession transactions while the yard is closed, storage fault injection, production time shortening. No mock Runtime and no simulated raid result.', steps: [], errors: [], external: [] };
let ctx = null, page = null;
report.frameAudit = []; report.expectedLogs = []; report.warnings = []; report.coverage = {}; let expectedFrameErrors = false;

// ---------------- fixtures (built with the game's own domain code) ----------------
function preset(name) {
  const s = D.newSave(), add = (inv, id, qty) => { assert.equal(D.addItem(inv, id, qty), 0, `fixture: no room for ${id}`); };
  const fx = { cash: s.cash, quests: { ...s.quests }, upgraded: false, facilities: null, attribute: null, stats: null };
  add(s.stash, 'scrap', 3); add(s.stash, 'wire', 2); add(s.stash, 'fuse', 1); add(s.stash, 'cloth', 4); add(s.stash, 'watch', 1); add(s.bag, 'food', 2);
  if (name !== 'parts') { fx.quests.repair = true; fx.cash = 6000; add(s.stash, 'scrap', 5); add(s.stash, 'wire', 3); add(s.stash, 'fuse', 2); add(s.stash, 'bandage', 2); }
  if (name === 'built') { s.stash.h = 9; fx.upgraded = true; fx.facilities = { rest: 3, medical: 3, training: 3, workbench: 3, blackmarket: 0 }; fx.attribute = 'strength'; }
  return { ...fx, stash: s.stash, bag: s.bag, safe: s.safe, equipment: s.equipment };
}
const SEED = fx => {
  const { saveSession: s } = window.__bincov;
  const t = s.prepareExpansionMutation(d => {
    for (const k of ['cash', 'quests', 'upgraded', 'stash', 'bag', 'safe', 'equipment']) d.profile[k] = structuredClone(fx[k]);
    if (fx.stats) d.profile.stats = fx.stats;
    if (fx.body) Object.assign(d.expansion.body, fx.body);
    if (fx.facilities) Object.assign(d.expansion.base.facilities, fx.facilities);
    if (fx.attribute) d.expansion.base.training.attribute = fx.attribute;
  });
  if (s.commitExpansionMutation(t) !== 'committed') throw new Error('fixture write failed');
};

// ---------------- harness ----------------
async function newPage({ size = [1280, 720], mobile = false, init = null } = {}) {
  if (ctx) await ctx.close().catch(() => {});
  ctx = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
  await ctx.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  ctx.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.exposeBinding('__solFrameFailure', (_source, value) => { report.frameAudit.push({ ...value, expected: expectedFrameErrors }); });
  await page.addInitScript(() => {
    const seen = new WeakSet();
    setInterval(() => {
      const h = window.__station?.host;
      if (!h || seen.has(h)) return;
      seen.add(h);
      const original = h.frameFailed;
      h.frameFailed = function (error) {
        original.call(this, error);
        window.__solFrameFailure({ message: String(error?.message ?? error), count: this.errors.reduce((n,e) => n + e.count, 0) });
      };
    }, 20);
  });
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'warning') report.warnings.push({text:m.text(),url:page.url()}); if (m.type() === 'error' && !(expectedFrameErrors && m.text().split('\n')[0] === '[station] frame failed, skipped and continuing: Error: injected frame error (test)')) report.errors.push(`[console] ${m.text()}`); });
  return page;
}
async function yardReady(p = page) { await p.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8); }
/** Title -> 进入 -> yard, optional save preset and player placement (tiles). */
async function open({ q = '', fixture = null, at = null, size, mobile } = {}) {
  await newPage({ size, mobile });
  await page.goto(`https://station.test/?test=1${q}`);
  await page.locator('[data-action="enter"]').click();
  await yardReady();
  if (fixture) { await page.evaluate(([src, fx]) => window.__station.reseed(() => (0, eval)(src)(fx)), [`(${SEED})`, fixture]); await yardReady(); }
  if (at) await place(...at);
  if (process.argv.includes('--negative=frame')) await page.evaluate(()=>{window.__station.host.injectFrameErrors=1;});
  await page.waitForTimeout(250);
}
async function step(name, fn) {
  if (only && !only.some(o => name.startsWith(o))) return;
  const row = { name, status: 'running' }, t0 = Date.now(); report.steps.push(row);
  const errors0 = report.errors.length, frames0 = report.frameAudit.length;
  try {
    row.detail = await fn() ?? '';
    assertFrames(report.frameAudit.slice(frames0).filter(e => !e.expected));
    if (page && !page.isClosed()) assertFrames(await page.evaluate(() => window.__station?.host?.errors ?? []));
    assert.deepEqual(report.errors.slice(errors0), [], 'page errors'); assert.deepEqual(report.external, [], 'network');
    row.status = 'passed'; console.log('PASS', name, row.detail);
  } catch (e) {
    row.status = 'failed'; row.error = String(e.stack ?? e); console.log('FAIL', name, e.message ?? e);
    await page?.screenshot({ path: resolve(out, `fail-${report.steps.length}.png`) }).catch(() => {});
  }
  row.ms = Date.now() - t0;
}
const st = () => page.evaluate(() => { const { col, errors, ...r } = window.__station.host.debug; return { ...r, errors: errors.length }; });
const snap = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const until = async (fn, ms = 8000, label = 'condition', arg) => { await page.waitForFunction(fn, arg, { timeout: ms }).catch(() => { throw new Error(`timeout: ${label}`); }); };
const place = (x, y, d = 6) => page.evaluate(([x, y, d]) => window.__station.host.place(x, y, d), [x, y, d]);
const shot = name => page.screenshot({ path: resolve(out, `${name}.png`) });
const panel = () => page.evaluate(() => window.__station.host.ui.kind);
const toWorldClick = async (x, y) => { const s = await page.evaluate(([x, y]) => window.__station.host.scene.toScreen(x * 32, y * 32), [x, y]); await page.mouse.click(s.x, s.y); };
const cellCenter = async (grid, x, y, p = page) => { const g = p.locator(`[data-grid="${grid}"]`); const b = await g.boundingBox(); const cell = Number(await g.getAttribute('data-cell')); return { x: b.x + 1 + cell * (x + .5), y: b.y + 1 + cell * (y + .5) }; };
const itemBox = async (grid, id, p = page) => { const el = p.locator(`[data-grid="${grid}"] .item[aria-label^="${D.ITEMS[id].name} "]`).first(); return { uid: await el.getAttribute('data-uid'), box: await el.boundingBox() }; };
const drag = async (from, to, p = page) => {
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
  await p.waitForTimeout(60); await p.mouse.up(); await p.waitForTimeout(150);
};
const fault = on => page.evaluate(on => {
  window.__write ??= Storage.prototype.setItem;
  Storage.prototype.setItem = on ? function (k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('fixture', 'QuotaExceededError'); return window.__write.call(this, k, v); } : window.__write;
}, on && !process.argv.includes('--negative=storage'));
const framesIn = async ms => { const a = await page.evaluate(() => window.__station.host.frames); await page.waitForTimeout(ms); return (await page.evaluate(() => window.__station.host.frames)) - a; };
const waitRoute = () => page.evaluate(async () => { const h = window.__station.host, t0 = performance.now(); await new Promise(r => setTimeout(r, 120)); while (h['path'] && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 50)); });
const walkIn = async keys => { for (const [k, ms] of keys) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); } };
const record = () => page.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2')));

try {
  // ================= A. entry and saves =================
  await step('A1 普通入口（无 ?test=1）：标题“进入”直接进院子，无测试接口，存档升级到成长 v2', async () => {
    await newPage();
    await page.goto('https://station.test/'); await page.locator('[data-action="enter"]').click();
    await page.waitForFunction(() => !!document.querySelector('#station-yard')?.shadowRoot?.querySelector('canvas'));
    await page.waitForTimeout(1200);
    const g = await page.evaluate(() => ({ bincov: '__bincov' in window, station: '__station' in window, frame: getComputedStyle(document.querySelector('#frame')).visibility, quick: !!document.querySelector('#station-yard').shadowRoot.querySelector('[data-quick="gear"]') }));
    assert.deepEqual(g, { bincov: false, station: false, frame: 'hidden', quick: true });
    const r = await record(); assert.equal(r.version, 4); assert.equal(r.expansion.version, 2); assert.equal(r.profile.cash, 700);
    await shot('A1-yard-1280x720');
    return `院子挂载，#frame 隐藏；存档 v${r.version}，扩展 v${r.expansion.version}，现金 ${r.profile.cash}`;
  });
  await step('A2 旧档（v1 键）进入院子：现金、任务、统计、物品保留，成长受控启用，原始字节留在 legacyBackup', async () => {
    const s = D.newSave(); s.cash = 1842; s.quests.repair = true; s.stats = { runs: 3, extracts: 2, kills: 5 }; D.addItem(s.stash, 'watch', 1); D.addItem(s.stash, 'scrap', 2);
    const bytes = JSON.stringify(s);
    await newPage({ init: { fn: b => { if (!localStorage.getItem('escape-bincov.session.v2')) localStorage.setItem('escape-bincov.save.v1', b); }, arg: bytes } });
    await page.goto('https://station.test/?test=1'); await page.locator('[data-action="enter"]').click(); await yardReady();
    const x = await snap(), r = await record();
    assert.equal(x.profile.cash, 1842); assert.equal(x.profile.quests.repair, true); assert.deepEqual(x.profile.stats, s.stats); assert.equal(x.power, 'restored');
    assert.ok(x.profile.stash.items.some(i => i.id === 'watch')); assert.equal(x.storage.upgradeRequired, false); assert.equal(r.expansion.version, 2);
    assert.equal(r.legacyBackup, bytes);
    await page.waitForTimeout(600); await shot('A2-legacy-save-restored-power');
    return `现金 1842、修好电源（院子灯亮）、出击 3 次保留；第 ${x.day} 天；legacyBackup 为原始字节`;
  });
  await step('A3 刷新恢复：院子里整理的物品刷新后仍在，进入仍是院子', async () => {
    await open({ fixture: preset('parts') });
    await page.keyboard.press('1'); await until(() => window.__station.host.ui.kind === 'gear', 3000, 'gear');
    const { uid, box } = await itemBox('stash', 'cloth'); await drag({ x: box.x + 10, y: box.y + 10 }, await cellCenter('bag', 4, 2));
    const moved = (await snap()).profile.bag.items.find(i => i.uid === uid); assert.ok(moved, '布料没进背包');
    await page.reload(); await page.locator('[data-action="enter"]').click(); await yardReady();
    const after = (await snap()).profile.bag.items.find(i => i.uid === uid);
    assert.deepEqual([after?.x, after?.y], [moved.x, moved.y]); assert.equal((await st()).panel, null);
    return `布料在背包 (${moved.x}, ${moved.y})，刷新后相同`;
  });

  await step('A4 院子画面启动失败（WebGL 不可用）：自动退回旧页签界面并提示，存档不受影响', async () => {
    // Only contexts asked for after the title (Phaser already has its own) fail; WebGPU is hidden as well.
    await newPage({ init: { fn: () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { if (window.__blockGL && /webgl|webgpu/.test(type)) return null; return get.call(this, type, ...rest); }; Object.defineProperty(navigator, 'gpu', { get: () => undefined }); }, arg: null } });
    await page.goto('https://station.test/?test=1'); await page.locator('[data-action="enter"]').waitFor();
    await page.evaluate(() => { window.__blockGL = true; }); await page.locator('[data-action="enter"]').click();
    await page.locator('#ui .panel.hideout').waitFor({ timeout: 20000 });
    const g = await page.evaluate(() => ({ station: !!window.__bincov.app.station, roots: document.querySelectorAll('#station-yard').length, state: window.__bincov.app.state, toast: document.querySelector('#toast')?.textContent ?? '', running: window.__bincov.app.game.loop.running }));
    assert.deepEqual({ ...g, toast: undefined }, { station: false, roots: 0, state: 'hideout', toast: undefined, running: true });
    assert.match(g.toast, /院子画面启动失败/);
    const r = await record(); assert.equal(r.expansion.version, 2);
    await shot('A4-webgl-fallback-tabs');
    // The yard reports its own startup failure on the console; that one expected line is not a page error.
    const expected = assertFallback(report.errors.slice()); report.expectedLogs.push({ step: 'A4', lines: expected });
    for (const line of expected) report.errors.splice(report.errors.indexOf(line), 1);
    return `Pixi 改用 Canvas 时按失败处理；提示「${g.toast}」；页签界面可用，存档已升级`;
  });

  // ================= B. walking and the repair =================
  await step('B1 键盘走动与碰撞（按住 D；向北撞育苗池停住）', async () => {
    await open({ fixture: preset('parts'), at: [17.5, 17.2] });
    const a = (await st()).player; await walkIn([['d', 1000]]); const b = (await st()).player;
    assert.ok(b.x - a.x > 60, `只移动了 ${(b.x - a.x).toFixed(1)} px`);
    await place(12.5, 12.6); await page.waitForTimeout(100); await walkIn([['w', 900]]);
    const p = (await st()).player; assert.ok(p.y > 11.9 * 32, `走进了池子 y=${(p.y / 32).toFixed(2)}`);
    return `右移 ${(b.x - a.x).toFixed(0)} px；北向停在 y=${(p.y / 32).toFixed(2)} 格`;
  });
  await step('B2 点电台屋顶：寻路穿过两道门进电台，打开任务面板', async () => {
    await place(27.5, 10.5); await page.waitForTimeout(400);
    const p = await page.evaluate(() => window.__station.host.scene.toScreen(30.5 * 32, 7 * 32 - 48 + 8)); await page.mouse.click(p.x, p.y);
    await until(() => window.__station.host.ui.kind === 'radio', 20000, 'radio panel');
    await shot('B2-radio-panel'); const s = await st(); return `面板 ${s.panel}，玩家 (${(s.player.x / 32).toFixed(1)}, ${(s.player.y / 32).toFixed(1)})`;
  });
  await step('B3 交付「让灯亮起来」：真实任务事务 → 供电恢复序列（F02 全景）→ 现金 +420', async () => {
    const before = await snap();
    await page.locator('[data-act="quest:repair"]').click();
    await until(() => window.__station.host.debug.seq === 'power', 3000, 'power sequence');
    const after = await snap(); assert.ok(after.profile.quests.repair && after.power === 'restored'); assert.equal(after.profile.cash, before.profile.cash + 420);
    for (const [i, t] of [[1, 700], [2, 900], [3, 1000]]) { await page.waitForTimeout(t); await shot(`B3-power-${i}`); }
    await until(() => window.__station.host.debug.seq === null, 8000, 'sequence end');
    return `现金 ${before.profile.cash} → ${after.profile.cash}，供电 ${after.power}`;
  });

  // ================= C. gear =================
  await step('C1 整备：Tab 打开，拖动、按 R 旋转、卸下后拖回武器栏、双击回仓库', async () => {
    await open({ fixture: preset('repaired'), at: [15.6, 16.4] });
    await page.keyboard.press('Tab'); await until(() => window.__station.host.ui.kind === 'gear', 3000, 'gear');
    let r = await itemBox('stash', 'cloth'); await drag({ x: r.box.x + 10, y: r.box.y + 10 }, await cellCenter('bag', 4, 2));
    assert.ok((await snap()).profile.bag.items.some(i => i.uid === r.uid), '布料没进背包');
    const w = await itemBox('bag', 'water'), to = await cellCenter('bag', 3, 3);
    await page.mouse.move(w.box.x + 8, w.box.y + 8); await page.mouse.down(); await page.mouse.move(w.box.x + 30, w.box.y + 30); await page.mouse.move(to.x - 8, to.y - 8);
    await page.keyboard.press('r'); await page.mouse.move(to.x - 6, to.y - 6); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(150);
    assert.ok((await snap()).profile.bag.items.find(i => i.uid === w.uid)?.rotated, '净水没有旋转');
    await page.locator('[data-act="unequip"]').click(); await page.waitForTimeout(150); assert.equal((await snap()).profile.equipment.weapon, null);
    const g = await itemBox('stash', 'pistol'), slot = await page.locator('[data-slot="weapon"]').boundingBox();
    await drag({ x: g.box.x + 10, y: g.box.y + 8 }, { x: slot.x + 40, y: slot.y + 20 }); assert.equal((await snap()).profile.equipment.weapon, 'pistol');
    const f = await itemBox('bag', 'food'), food0 = D.count((await snap()).profile.stash, 'food'); await page.mouse.dblclick(f.box.x + 8, f.box.y + 8); await page.waitForTimeout(150);
    assert.equal(D.count((await snap()).profile.stash, 'food'), food0 + 2, '罐头没回仓库'); assert.equal(D.count((await snap()).profile.bag, 'food'), 0);
    await shot('C1-gear-1280x720');
    return '布料→背包，净水旋转，手枪卸下再拖回武器栏，罐头双击回仓库';
  });
  await step('C2 整备：拆分一半、放入安全箱、使用补给（真实 Runtime 接口）', async () => {
    const a = await itemBox('bag', 'ammo9'); await page.mouse.click(a.box.x + 8, a.box.y + 8); await page.waitForTimeout(120);
    const q0 = (await snap()).profile.bag.items.find(i => i.uid === a.uid).qty;
    await page.locator('[data-act="split"]').click(); await page.waitForTimeout(150);
    const bag = (await snap()).profile.bag.items.filter(i => i.id === 'ammo9'); assert.equal(bag.length, 2); assert.equal(bag.reduce((n, i) => n + i.qty, 0), q0);
    const b = await itemBox('bag', 'bandage'), bd = D.count((await snap()).profile.bag, 'bandage'); await page.mouse.click(b.box.x + 8, b.box.y + 8); await page.waitForTimeout(120);
    await page.locator('[data-act="secure"]').click(); await page.waitForTimeout(150);
    assert.equal(D.count((await snap()).profile.safe, 'bandage'), bd, '绷带没进安全箱');
    const fd = await itemBox('stash', 'food'); await page.mouse.click(fd.box.x + 8, fd.box.y + 8); await page.waitForTimeout(120);
    const s0 = await snap(), raw0 = await record(), n0 = D.count(s0.profile.stash, 'food'), sat0 = s0.body.satiety;
    await page.locator('[data-act="use"]').click(); await page.waitForTimeout(150);
    const s1 = await snap(); assertSupplyRefused(s0, s1); assert.deepEqual((await record()).profile, raw0.profile);
    assert.match(await page.locator('#station-yard .toast').last().textContent(), /操作未完成/);
    report.coverage.supplyRefused = { before: s0, after: s1 }; const used = false;
    return `9mm ${q0} 拆成 ${bag.map(i => i.qty).join(' + ')}；绷带进安全箱；罐头${used ? `已使用（饱食 ${sat0.toFixed(0)} → ${s1.body.satiety.toFixed(0)}）` : '未使用（Runtime 拒绝，见提示）'}`;
  });

  await step('C3 补给成功：低饱食真实使用罐头，消耗一件并按规则恢复35', async () => {
    await open({ fixture: { ...preset('repaired'), body: { satiety: 20 } } });
    await page.keyboard.press('1'); await until(() => window.__station.host.ui.kind === 'gear');
    const fd = await itemBox('bag', 'food'); await page.mouse.click(fd.box.x + 8, fd.box.y + 8);
    const before = await snap();
    await page.locator('[data-act="use"]').click(); await page.waitForTimeout(150);
    const after = await snap(), durable = await record();
    const result = { before: { qty: D.count(before.profile.bag, 'food'), satiety: before.body.satiety },
      after: { qty: D.count(after.profile.bag, 'food'), satiety: after.body.satiety } };
    assertSupplyUsed(result.before, result.after);
    assert.deepEqual(durable.profile, after.profile); assert.equal(durable.expansion.body.satiety, after.body.satiety);
    report.coverage.supplyUsed = result; await shot('C3-supply-used'); return result;
  });
  // ================= D. shops =================
  await step('D1 修理铺：走到老栓处，买一包 9mm、卖怀表并结算（真实购物车）', async () => {
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await place(6.5, 19.5); await page.waitForTimeout(300); await walkIn([['a', 450]]); await page.waitForTimeout(100);
    assert.equal((await st()).focus, 'arms');
    await page.keyboard.press('e'); await until(() => window.__station.host.ui.kind === 'arms', 3000, 'arms');
    const cash0 = (await snap()).profile.cash;
    const ammo = await itemBox('merchant', 'ammo9'); await drag({ x: ammo.box.x + 8, y: ammo.box.y + 8 }, await cellCenter('buy', 0, 0));
    const watch = await itemBox('stash', 'watch'); await drag({ x: watch.box.x + 8, y: watch.box.y + 8 }, await cellCenter('sell', 0, 0));
    await shot('D1-shop-cart');
    await page.locator('[data-act="cart-settle"]').click(); await page.waitForTimeout(200);
    const s = await snap(), expect = cash0 - 12 * D.ITEMS.ammo9.buy + D.ITEMS.watch.sell;
    assert.equal(s.profile.cash, expect); assert.ok(!s.profile.stash.items.some(i => i.id === 'watch'));
    return `现金 ${cash0} → ${s.profile.cash}；9mm 自动放入仓库`;
  });
  await step('D2 卖出任务物资：Runtime 要求确认 → 弹出确认 → 确认后成交', async () => {
    await open({ fixture: preset('parts'), at: [4.5, 18.8] });
    await page.keyboard.press('2'); await until(() => window.__station.host.ui.kind === 'arms', 3000, 'arms');
    const cash0 = (await snap()).profile.cash, sc = await itemBox('stash', 'scrap');
    await drag({ x: sc.box.x + 8, y: sc.box.y + 8 }, await cellCenter('sell', 0, 0));
    await page.locator('[data-act="cart-settle"]').click(); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__station.host.ui.dialogKind), 'sale');
    const text = await page.locator('.dialog .warnlist').textContent(); assert.match(text, /让灯亮起来/);
    assert.equal((await snap()).profile.cash, cash0, '确认前就扣了物资');
    await shot('D2-quest-sale-confirm');
    await page.locator('[data-act="sale-confirm"]').click(); await page.waitForTimeout(200);
    const s = await snap(); assert.equal(s.profile.cash, cash0 + 3 * D.ITEMS.scrap.sell); assert.equal(D.count(s.profile.stash, 'scrap'), 0);
    return `确认文案「${text.trim()}」；确认后现金 ${cash0} → ${s.profile.cash}`;
  });

  // ================= E. facilities =================
  await step('E1 休息区：走到宿舍修建 1 级（床铺出现）', async () => {
    await open({ fixture: preset('repaired'), at: [19.5, 5.4] });
    await page.keyboard.press('e'); await until(() => window.__station.host.ui.kind === 'facility', 3000, 'facility');
    await page.locator('[data-act="build:rest"]').click(); await page.waitForTimeout(200);
    assert.equal((await snap()).base.facilities.rest, 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500); await shot('E1-rest-built'); return '休息区 1 级';
  });
  await step('E2 工作台：修建、排入一批绷带；生产完成事件（缩短剩余时间的夹具）后领取到仓库', async () => {
    await place(4.6, 13.8); await page.waitForTimeout(300);
    await page.keyboard.press('e'); await until(() => window.__station.host.ui.kind === 'facility', 3000, 'facility');
    await page.locator('[data-act="build:workbench"]').click(); await page.waitForTimeout(150);
    await page.locator('[data-act="enqueue:bandage"]').click(); await page.waitForTimeout(150);
    let s = await snap(); assert.equal(s.base.facilities.workbench, 1); assert.equal(s.base.queue.length, 1);
    await shot('E2-workbench-queue');
    const n0 = D.count(s.profile.stash, 'bandage');
    await page.evaluate(() => { const { saveSession: x } = window.__bincov; const t = x.prepareExpansionMutation(d => { d.expansion.base.queue[0].remaining = 1; }); x.commitExpansionMutation(t); });
    await until(() => window.__bincov.hideoutRuntime.snapshot().base.completed.length === 1, 9000, 'batch completed');
    await until(() => [...document.querySelector('#station-yard').shadowRoot.querySelectorAll('.toast')].some(t => t.textContent.includes('成品可以领取')), 3000, 'toast');
    await page.locator('[data-act^="claim:"][data-act$=":stash"]').first().click(); await page.waitForTimeout(200);
    s = await snap(); assert.equal(s.base.completed.length, 0); assert.equal(D.count(s.profile.stash, 'bandage'), n0 + 2);
    return `绷带 ${n0} → ${n0 + 2}（整批领取到仓库）`;
  });
  await step('E3 训练区：选练习项目，在育苗池之间走动，五秒检查点写入练习时间', async () => {
    await open({ fixture: preset('built'), at: [10.6, 16.3] });
    await page.keyboard.press('5'); await until(() => window.__station.host.ui.kind === 'facility', 3000, 'facility');
    await page.locator('[data-act="fac:training"]').click(); await page.locator('[data-act="practice:technique"]').click(); await page.waitForTimeout(150);
    assert.equal((await snap()).base.training.attribute, 'technique'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const a = (await snap()).base.training.activeSeconds;
    await walkIn([['d', 2600], ['a', 2600], ['d', 1500]]); await page.waitForTimeout(5300);
    const b = (await snap()).base.training; await shot('E3-training');
    assert.ok(b.activeSeconds - a >= 4, `练习 ${a} → ${b.activeSeconds}`);
    return `已保存练习时间 ${a.toFixed(1)} → ${b.activeSeconds.toFixed(1)} 秒（属性 技巧）`;
  });
  await step('E4 训练：真实有效120秒、规则奖励、静止/面板/后台暂停不计时', async () => {
    await open({ fixture: preset('built'), at: [10.6, 16.3] });
    await page.keyboard.press('5'); await until(() => window.__station.host.ui.kind === 'facility');
    await page.locator('[data-act="fac:training"]').click(); await page.locator('[data-act="practice:technique"]').click();
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.__solPractice = { acceptedSeconds: 0, accepted: 0, offered: 0, events: [] };
      const rt = window.__bincov.hideoutRuntime, original = rt.practice;
      rt.subscribe(e => { if (e.type === 'practice-credited') window.__solPractice.events.push(e); });
      rt.practice = function (sample) { const n = this.samples.length; original.call(this, sample); window.__solPractice.offered++; if (this.samples.length > n) { window.__solPractice.acceptedSeconds += sample.seconds; window.__solPractice.accepted++; } };
    });
    const total = async () => { const x = await snap(); return x.base.training.activeSeconds + x.base.training.quantity / .2875 * 120; };
    const pauses = [];
    const pause = async (name, action) => {
      assert.equal((await page.evaluate(() => window.__bincov.hideoutRuntime.flush())).ok, true);
      const a = await total(), offered0 = await page.evaluate(() => window.__solPractice.acceptedSeconds);
      await action();
      assert.equal((await page.evaluate(() => window.__bincov.hideoutRuntime.flush())).ok, true);
      const b = await total(), offered1 = await page.evaluate(() => window.__solPractice.acceptedSeconds);
      assert.ok(Math.abs(b - a) < 1e-8, name + ' 误计训练'); assert.equal(offered1, offered0, name + ' 接受了训练输入');
      pauses.push({ name, before: a, after: b });
    };
    await pause('静止', () => page.waitForTimeout(1600));
    await pause('面板打开且按住移动键', async () => { await page.keyboard.press('1'); await page.keyboard.down('d'); await page.waitForTimeout(1600); await page.keyboard.up('d'); await page.keyboard.press('Escape'); });
    await pause('失焦门控模拟（实际切窗未测）', async () => {
      await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{value:()=>false,configurable:true});window.dispatchEvent(new Event('blur'));});
      await page.keyboard.down('d');await page.waitForTimeout(1600);await page.keyboard.up('d');
      await page.evaluate(()=>{delete document.hasFocus;window.dispatchEvent(new Event('focus'));});
    });
    await place(10.6,16.3);await page.waitForTimeout(100);
    await pause('隐藏门控模拟', async () => {
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
      await page.keyboard.down('d');await page.waitForTimeout(1600);await page.keyboard.up('d');
      await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    });
    await place(10.6,16.3);await page.waitForTimeout(100);
    const before = await snap(), t0 = Date.now();
    while (Date.now() - t0 < 155000) {
      await walkIn([['d', 2600], ['a', 2600]]);
      if ((await snap()).base.training.quantity > 0) break;
    }
    assert.equal((await page.evaluate(() => window.__bincov.hideoutRuntime.flush())).ok, true);
    const after = await snap(), trace = await page.evaluate(() => window.__solPractice);
    const detail = { wallSeconds: (Date.now()-t0)/1000, before: before.base.training, after: after.base.training,
      beforeProgress: before.body.attributes.technique.progress, afterProgress: after.body.attributes.technique.progress,
      level: after.base.facilities.training, trace, pauses };
    assertTraining(detail); report.coverage.training = detail; await shot('E4-training-credit'); return detail;
  });

  // ================= F. save failures =================
  await step('F1 写入失败：修建被回滚、出现存档对话框；重试保存后关闭，再修建成功', async () => {
    await open({ fixture: preset('repaired'), at: [19.5, 5.4] });
    const s0 = await snap(); await fault(true);
    await page.keyboard.press('e'); await until(() => window.__station.host.ui.kind === 'facility', 3000, 'facility');
    await page.locator('[data-act="build:rest"]').click(); await page.waitForTimeout(250);
    const s1 = await snap(); assert.equal(s1.base.facilities.rest, s0.base.facilities.rest); assert.equal(s1.profile.cash, s0.profile.cash); assert.equal(s1.storage.ok, false);
    assert.equal(await page.evaluate(() => window.__station.host.ui.dialogKind), 'storage'); await shot('F1-save-failed-dialog');
    await page.locator('.dialog [data-act="retry-save"]').click(); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__station.host.ui.dialogKind), 'storage', '仍失败时对话框应保留');
    await fault(false); await page.locator('.dialog [data-act="retry-save"]').click(); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__station.host.ui.dialogKind), null); assert.equal((await snap()).storage.ok, true);
    await page.locator('[data-act="build:rest"]').click(); await page.waitForTimeout(200); assert.equal((await snap()).base.facilities.rest, s0.base.facilities.rest + 1);
    return '失败时状态不变、对话框出现；故障仍在时重试不关闭；恢复后重试成功，修建一次成功';
  });
  await step('F2 五秒检查点失败：练习进度保留，导出备份含未写入进度；重试后写入', async () => {
    await open({ fixture: preset('built'), at: [10.6, 16.3] });
    await fault(true); await walkIn([['d', 2600], ['a', 2600], ['d', 900]]); await page.waitForTimeout(600);
    await until(() => window.__station.host.ui.dialogKind === 'storage', 6000, 'storage dialog');
    const pending = await page.evaluate(() => window.__bincov.hideoutRuntime.snapshot().storage.pendingBase); assert.equal(pending, true);
    const download = page.waitForEvent('download'); await page.locator('.dialog [data-act="export"]').click();
    const path = resolve(out, 'F2-backup.json'); await (await download).saveAs(path);
    const backup = JSON.parse(await readFile(path, 'utf8')); assert.ok(backup.record.expansion.base.training.activeSeconds > 0, '备份里没有练习进度');
    await fault(false); await page.locator('.dialog [data-act="retry-save"]').click(); await page.waitForTimeout(200);
    const r = await record(); assert.ok(r.expansion.base.training.activeSeconds > 0);
    return `备份练习 ${backup.record.expansion.base.training.activeSeconds.toFixed(1)} 秒；重试后存档 ${r.expansion.base.training.activeSeconds.toFixed(1)} 秒`;
  });
  await step('F3 另一窗口接管存档：院子停止写入，只提供导出与刷新', async () => {
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'escape-bincov.session.v2' })));
    await page.waitForTimeout(400);
    assert.equal((await snap()).storage.conflict, true);
    const r = await page.evaluate(() => window.__bincov.hideoutRuntime.build('rest')); assert.equal(r.reason, 'conflict');
    await page.locator('[data-alarm]').click(); await page.waitForTimeout(150);
    const acts = await page.locator('.dialog [data-act]').evaluateAll(els => els.map(e => e.dataset.act));
    assert.ok(acts.includes('export') && acts.includes('reload') && !acts.includes('retry-save'), acts.join());
    await shot('F3-conflict'); return `对话框按钮：${acts.join('、')}`;
  });

  await step('F4 菜单导出存档 → 修建花钱 → 菜单导入刚才的备份：预览后确认覆盖，恢复到导出时', async () => {
    await open({ fixture: preset('repaired') });
    await page.keyboard.press('Escape'); await until(() => window.__station.host.ui.kind === 'menu', 2000, 'menu');
    const download = page.waitForEvent('download'); await page.locator('#station-yard [data-act="export"]').click();
    const path = resolve(out, 'F4-export.json'); await (await download).saveAs(path);
    const before = await snap();
    assert.equal((await page.evaluate(() => window.__bincov.hideoutRuntime.build('rest'))).ok, true);
    const spent = await snap(); assert.equal(spent.base.facilities.rest, 1);
    await page.locator('#station-yard #backup-file').setInputFiles(path);
    await until(() => window.__station.host.ui.dialogKind === 'import', 4000, 'import dialog'); await shot('F4-import-confirm');
    assert.deepEqual((await snap()).profile, spent.profile, '确认前不应覆盖');
    await page.locator('.dialog [data-act="import-confirm"]').click(); await page.waitForTimeout(300);
    const after = await snap(); assert.deepEqual(after.profile, before.profile); assert.equal(after.base.facilities.rest, 0);
    assert.equal(await page.evaluate(() => window.__station.mounted), true);
    return `导出 ${before.profile.cash} → 修建后 ${spent.profile.cash} → 导入后 ${after.profile.cash}，休息区回到 0 级`;
  });

  await step('F5 真实购物存档失败：原字节/身体/队列/rev不变，重试不下单，再结算仅一次', async () => {
    await open({ fixture:preset('repaired') });
    await page.keyboard.press('2'); await until(() => window.__station.host.ui.kind === 'arms');
    const ammo=await itemBox('merchant','ammo9'); await drag({x:ammo.box.x+8,y:ammo.box.y+8},await cellCenter('buy',0,0));
    const before=await snap(), raw=await page.evaluate(()=>localStorage.getItem('escape-bincov.session.v2'));
    await page.evaluate(()=>{ window.__solShopEvents=[];window.__bincov.hideoutRuntime.subscribe(e=>window.__solShopEvents.push(e)); });
    await fault(true); await page.locator('[data-act="cart-settle"]').click(); await page.waitForTimeout(200);
    const failed=await snap();
    assert.equal(await page.evaluate(()=>localStorage.getItem('escape-bincov.session.v2')),raw);
    delete before.base.training.windowLeft;delete failed.base.training.windowLeft;for(const k of ['profile','body','base','rev']) assert.deepEqual(failed[k],before[k],k+' rollback');
    assert.deepEqual(await page.evaluate(()=>window.__solShopEvents.map(e=>e.type)),['save-failed']);
    assert.equal(await page.evaluate(()=>window.__station.host.ui.dialogKind),'storage');
    await shot('F5-shop-rollback'); await fault(false);
    await page.locator('.dialog [data-act="retry-save"]').click(); await page.waitForTimeout(150);
    assert.equal((await snap()).profile.cash,before.profile.cash,'retry must not replay purchase');
    await page.locator('[data-act="cart-settle"]').click(); await page.waitForTimeout(150);
    const after=await snap(); assert.equal(after.profile.cash,before.profile.cash-84);
    assert.equal(D.count(after.profile.stash,'ammo9'),D.count(before.profile.stash,'ammo9')+12);
    await page.reload(); await page.locator('[data-action="enter"]').click(); await yardReady();
    assert.deepEqual((await snap()).profile,after.profile); return {cashBefore:before.profile.cash,cashAfter:after.profile.cash,revBefore:before.rev,revFailed:failed.rev};
  });

  // ================= G. host switching, real raids =================
  const verifyReport = async label => {
    const s=await snap(),last=s.profile.lastResult;
    assert.equal(last.outcome,'extract');
    assert.equal(await page.locator('.report .stamp b').textContent(),'成功撤离');
    assert.equal(await page.locator('.report > p').textContent(),last.message);
    const values=await page.locator('.report .stats b').allTextContents();
    assert.deepEqual(values,[String(last.kills),'¥ '+last.keptValue,s.profile.stats.extracts+' / '+s.profile.stats.runs]);
    (report.coverage.actionReports??=[]).push({label,last,stats:s.profile.stats,displayed:values});
  };
  await step('G1 旧页签备用入口：按 0 回到页签界面（Phaser 宿主），“回到院子”再进院子', async () => {
    await open({ fixture: preset('repaired') });
    await page.keyboard.press('0');
    await until(() => !window.__station.mounted && !!document.querySelector('#ui .panel.hideout'), 5000, 'tab page');
    const g = await page.evaluate(() => ({ state: window.__bincov.app.state, scenes: window.__bincov.app.game.scene.getScenes(true).map(s => s.scene.key), asleep: !window.__bincov.app.game.loop.running, frame: getComputedStyle(document.querySelector('#frame')).visibility }));
    assert.deepEqual(g, { state: 'hideout', scenes: ['Hideout'], asleep: false, frame: 'visible' });
    await shot('G1-old-tabs');
    await page.locator('[data-action="tab"][data-id="arms"]').click(); await page.waitForTimeout(150);
    const shared0=await snap();
    const oldAmmo=await page.locator('.shop-layout [data-source="merchant"][data-item-id="ammo9"]').first().boundingBox();
    const target=await page.locator('.shop-layout [data-grid=buy]').evaluate(g=>{const b=g.getBoundingClientRect(),c=Number(g.dataset.cell)*b.width/g.offsetWidth;return{x:b.x+c*.5,y:b.y+c*.5};});
    await drag({x:oldAmmo.x+12,y:oldAmmo.y+12},target);
    await page.locator('[data-action="checkout"]').click();await page.waitForTimeout(200);
    const shared1=await snap();assert.equal(shared1.profile.cash,shared0.profile.cash-84);
    assert.equal(D.count(shared1.profile.stash,'ammo9'),D.count(shared0.profile.stash,'ammo9')+12);
    await page.locator('[data-action="base-enter"]').first().click(); await yardReady();
    assert.deepEqual((await snap()).profile,shared1.profile); report.coverage.sharedState={cashBefore:shared0.profile.cash,cashAfter:shared1.profile.cash};
    assert.equal(await page.evaluate(() => window.__bincov.app.game.loop.running), false);
    return '页签界面运行 Hideout 场景，院子已卸载；“回到院子”按钮重新挂载院子，Phaser 循环休眠';
  });
  await step('G2 菜单返回主菜单（backToMenu），再进入仍是院子', async () => {
    await page.keyboard.press('Escape'); await until(() => window.__station.host.ui.kind === 'menu', 2000, 'menu');
    await shot('G2-menu'); await page.locator('[data-act="title"]').click();
    await until(() => window.__bincov.app.state === 'menu' && !window.__station.mounted, 4000, 'title');
    await page.locator('[data-action="enter"]').click(); await yardReady();
    return '标题 ⇄ 院子';
  });
  await step('G3 真实出击（沿海封锁区，Phaser）：开门动画 → 局内 → 撤离 → 返回走进院门并显示行动报告', async () => {
    const runs0 = (await snap()).profile.stats.runs;
    await place(27.5, 19.8); await page.keyboard.press('7'); await until(() => window.__station.host.ui.kind === 'deploy', 2000, 'deploy');
    await page.locator('#station-yard >> #seed').fill('42'); await shot('G3-deploy');
    await page.locator('[data-act="deploy"]').click();
    await page.waitForTimeout(1200); assert.equal((await st()).seq, 'leave'); assert.equal((await snap()).phase, 'departing'); await shot('G3-leaving');
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active && !window.__station.mounted, null, { timeout: 15000 });
    const during = await page.evaluate(() => ({ state: window.__bincov.app.state, roots: document.querySelectorAll('#station-yard').length, seed: window.__bincov.app.save.activeRun?.seed }));
    assert.deepEqual(during, { state: 'run', roots: 0, seed: 42 });
    await page.evaluate(() => { const r = window.__bincov.app.raid; r.enemies.forEach(e => e.cooldown = 9999); r.player.setPosition(r.config.exits[0].x, r.config.exits[0].y); });
    await page.waitForTimeout(600); await shot('G3-raid');
    await page.keyboard.down('e'); try { await page.waitForFunction(() => window.__bincov.app.state === 'result', null, { timeout: 15000 }); } finally { await page.keyboard.up('e'); }
    await shot('G3-result'); await page.locator('[data-action="return"]').click(); await yardReady();
    await page.waitForTimeout(500); await shot('G3-walk-in');
    await until(() => window.__station.host.ui.kind === 'report', 8000, 'report');
    const s = await snap(); assert.equal(s.profile.stats.runs, runs0 + 1); assert.equal(s.arrival, null);
    assert.equal(await page.evaluate(() => window.__bincov.hideoutRuntime.consumeArrival()), null);
    await verifyReport('first ordinary raid');
    await page.waitForTimeout(450); await shot('G3-report'); await page.locator('.report [data-act="close"]').click();
    await page.reload(); await page.locator('[data-action="enter"]').click(); await yardReady(); await page.waitForTimeout(400);
    assert.equal((await st()).panel, null, '刷新后不应重播报告');
    return `出击 ${runs0} → ${s.profile.stats.runs}；报告只播放一次`;
  });
  await step('G4 开门动画中刷新：标题恢复原行动（不重开、不进院子），撤离后回到院子', async () => {
    await page.keyboard.press('7'); await until(() => window.__station.host.ui.kind === 'deploy', 2000, 'deploy');
    await page.locator('[data-act="deploy"]').click(); await page.waitForTimeout(900);
    const runId = (await snap()).profile.activeRun.runId;
    await page.reload(); await page.waitForTimeout(400);
    await page.locator('[data-action="enter"]').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active, null, { timeout: 15000 });
    const g = await page.evaluate(() => ({ runId: window.__bincov.app.save.activeRun?.runId, station: !!window.__station?.mounted }));
    assert.deepEqual(g, { runId, station: false });
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(() => { const r = window.__bincov.app.raid; r.enemies.forEach(e => e.cooldown = 9999); r.player.setPosition(r.config.exits[0].x, r.config.exits[0].y); });
    await page.waitForTimeout(600);
    await page.keyboard.down('e'); try { await page.waitForFunction(() => window.__bincov.app.state === 'result', null, { timeout: 15000 }); } finally { await page.keyboard.up('e'); }
    await page.locator('[data-action="return"]').click(); await yardReady(); await until(() => window.__station.host.ui.kind === 'report', 8000, 'report');
    return `恢复的行动 ${runId} 与动画前写入的一致`;
  });
  await step('G5 城中村样板（?sample=village）：院子与局内轮用一个 Pixi 应用；受跟踪计数对照', async () => {
    await open({ q: '&sample=village', fixture: preset('repaired') });
    // Equal settle time on both sides; the yard's own lazily created actor textures are subtracted (see G6).
    const settled = async () => { await page.waitForTimeout(1500); return page.evaluate(() => ({ ...window.__station.counts(), scene: window.__station.host.scene['textures'].size })); };
    const c0 = await settled();
    report.webgl=await page.evaluate(()=>{const gl=window.__station.host.app.renderer.gl,e=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:e?gl.getParameter(e.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};});
    await page.evaluate(()=>{const h=window.__station.host;window.__solIdentity={app:new WeakRef(h.app),scene:new WeakRef(h.scene)};});
    await page.keyboard.press('7'); await until(() => window.__station.host.ui.kind === 'deploy', 2000, 'deploy');
    await page.locator('#station-yard >> label.world:has(input[value="buildings"])').click(); await page.locator('#station-yard >> #seed').fill('42');
    await page.locator('[data-act="deploy"]').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 20000 });
    const c1 = await page.evaluate(() => ({ ...window.__station.counts(), sample: window.__bincovSample.counts().apps }));
    assert.equal(c1.roots, 0); assert.equal(c1.apps, 1); assert.equal(c1.parked, 0);
    assert.equal(await page.evaluate(()=>window.__solIdentity.app.deref()===window.__bincovSample.host.app),true,'shared Application identity changed');
    const released=await page.evaluate(()=>{const s=window.__solIdentity.scene.deref();return s?{collected:false,textures:s.textures.size,npcCanvases:s.npcCanvases.size,targets:[s.worldRT,s.lightRT,s.glowRT].map(t=>t.destroyed)}:{collected:true};});
    if(!released.collected){assert.equal(released.textures,0);assert.equal(released.npcCanvases,0);assert.deepEqual(released.targets,[true,true,true]);}
    report.coverage.releasedYard=released;
    await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
    await page.evaluate(() => window.__bincovSample.driver.placePlayer({ x: 208, y: 122 }, Math.PI / 2));
    await page.waitForTimeout(300); await shot('G5-village-raid');
    await page.keyboard.down('e'); try { await page.waitForFunction(() => window.__bincov.app.state === 'result', null, { timeout: 20000 }); } finally { await page.keyboard.up('e'); }
    await page.waitForFunction(() => !document.querySelector('.coast-sample'));
    const c2 = await page.evaluate(() => window.__station.counts()); assert.equal(c2.parked, 1); assert.equal(c2.apps, 0);
    const parked=await page.evaluate(source=>{const a=window.__solIdentity.app.deref();return{children:a.stage.children.length,ticker:a.ticker.started,attached:a.canvas.isConnected,events:(0,eval)('('+source+')')(a.renderer)};},readPixiEvents.toString());
    assert.equal(parked.children,0);assert.equal(parked.ticker,false);assert.equal(parked.attached,false);assert.equal(parked.events.attached,false);assert.equal(parked.events.native,0);assert.ok(Object.values(parked.events.roots).every(x=>x===false));report.coverage.parkedApplication=parked;
    await page.locator('[data-action="return"]').click(); await yardReady(); await until(() => window.__station.host.ui.kind === 'report', 8000, 'report');
    await verifyReport('village raid');
    await page.waitForTimeout(450); await shot('G5-village-return-report');
    await page.locator('.report [data-act="close"]').click(); const c3 = await settled();
    assert.equal(await page.evaluate(()=>window.__solIdentity.app.deref()===window.__station.host.app),true,'return created another Application');
    await page.evaluate(()=>{delete window.__solIdentity;});
    for (const k of ['listeners', 'tickers', 'views', 'apps', 'parked', 'roots']) assert.equal(c3[k], c0[k], `${k}: ${c0[k]} → ${c3[k]}`);
    assert.ok(c3.gpuTextures - c3.scene <= c0.gpuTextures - c0.scene + 2, `GPU 纹理 ${c0.gpuTextures}（院子 ${c0.scene}）→ ${c3.gpuTextures}（院子 ${c3.scene}）`);
    return `院子 apps ${c0.apps}/parked ${c0.parked} → 局内 apps ${c1.apps}/parked ${c1.parked} → 结果页 parked ${c2.parked} → 回院子相同；GPU 纹理 ${c0.gpuTextures}（院子 ${c0.scene}）→ ${c3.gpuTextures}（院子 ${c3.scene}）`;
  });
  await step('G6 院子重挂 20 次：监听、ticker、视图、应用计数回到基线，GPU 纹理与托管槽不增长', async () => {
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // Both samples 1.5 s after a mount: actor frames are textured lazily, so equal settle time gives equal sets.
    const cdp = await ctx.newCDPSession(page);
    const measure = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(200); return page.evaluate(() => ({ ...window.__station.counts(), scene: window.__station.host.scene['textures'].size })); };
    await page.evaluate(() => window.__station.remount(3)); await yardReady(); await page.waitForTimeout(1500);
    const a = await measure();
    a.tables=await page.evaluate(source=>(0,eval)('('+source+')')(window.__station.host.app.renderer),readManagedTables.toString());
    await page.evaluate(() => window.__station.remount(20)); await yardReady(); await page.waitForTimeout(1500);
    const b = await measure();
    b.tables=await page.evaluate(source=>(0,eval)('('+source+')')(window.__station.host.app.renderer),readManagedTables.toString());
    for(const table of b.tables.tables){const old=a.tables.tables.find(x=>x.name===table.name);assert.ok(old,'managed table missing');assert.ok(table.empty<=old.empty,table.name+' empty slots grew');}
    report.coverage.managedNegative=await page.evaluate(source=>{const read=(0,eval)('('+source+')'),r=window.__station.host.app.renderer,list=r.gc._managedResourceHashes;
      const cases=[['missing-list',{gc:{_running:true}}],['empty-list',{gc:{_running:true,_managedResourceHashes:[]}}],['missing-table',{gc:{_running:true,_managedResourceHashes:list.slice(1)}}],['bad-descriptor',{gc:{_running:true,_managedResourceHashes:[{}]}}]];
      return cases.map(([name,value])=>{try{read(value);return{name,rejected:false};}catch(e){return{name,rejected:true,error:e.message};}});},readManagedTables.toString());
    assert.ok(report.coverage.managedNegative.every(x=>x.rejected),'managed-field negative accepted');
    for (const k of ['listeners', 'tickers', 'views', 'apps', 'parked', 'roots', 'canvases']) assert.equal(b[k], a[k], `${k}: ${a[k]} → ${b[k]}`);
    assert.ok(b.gpuTextures - b.scene <= a.gpuTextures - a.scene + 2, `GPU 纹理 ${a.gpuTextures}（场景 ${a.scene}）→ ${b.gpuTextures}（场景 ${b.scene}）`);
    assert.ok(b.managed.empty <= a.managed.empty + 50, `托管空槽 ${a.managed.empty} → ${b.managed.empty}`);
    report.heapObservation = { before:a, after:b, deltaBytes:b.heap-a.heap, underSmokeLimit:b.heap-a.heap<4e6, noGrowth:b.heap<=a.heap, conclusion:'PARTIAL: short 20-remount observation; historical F20 remains PARTIAL' };
    return `listeners ${b.listeners}，tickers ${b.tickers}，GPU 纹理 ${a.gpuTextures} → ${b.gpuTextures}，托管 ${a.managed.live}/${a.managed.empty} → ${b.managed.live}/${b.managed.empty}，强制回收后堆 ${(a.heap / 1e6).toFixed(1)} → ${(b.heap / 1e6).toFixed(1)} MB`;
  });
  await step('G7 WebGL 上下文丢失后暂停绘制，恢复后继续，循环不中断', async () => {
    const f0 = await framesIn(300);
    await page.evaluate(() => { window.__lose = window.__station.host['app'].renderer.gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
    await page.waitForTimeout(500); const lost = await framesIn(300);
    await page.evaluate(() => window.__lose.restoreContext()); await page.waitForTimeout(800);
    const back = await framesIn(300), s = await st(); await shot('G7-context-restored');
    assert.ok(lost > 5 && back > 5, `丢失 ${lost} 帧，恢复 ${back} 帧`); assert.equal(s.errors, 0);
    await walkIn([['s', 300]]);
    return `丢失期间仍推进 ${lost} 帧（不绘制），恢复后 ${back} 帧，无帧错误`;
  });

  // ================= H. playtest fixes and shortcuts =================
  const sideDoor = async (at, room, sign, walkKey, into) => {
    await place(...at); await page.waitForTimeout(400);
    const hidden = await page.evaluate(() => window.__station.host.scene.lastHidden);
    assert.ok(hidden.includes(room), `没有揭开 ${room} 的屋顶：${hidden}`);
    const tag = await page.evaluate(() => { const el = document.querySelector('#station-yard').shadowRoot.querySelector('.doortag'); return el && !el.hidden ? el.textContent : null; });
    assert.equal(tag, sign);
    if (walkKey) { await walkIn([[walkKey, 900]]); assert.ok((await page.evaluate(() => window.__station.host.scene.lastHidden)).includes(into), `没进 ${into}`); }
    return `揭开 ${hidden.join('、')}；门牌“${tag}”`;
  };
  await step('H1 F01 侧门：发电机房→电台、食堂→宿舍、院子→加工间', async () => {
    await open({ fixture: preset('repaired') });
    const a = await sideDoor([26.2, 4.6, 0], 'radio', '电台 →', 'd', 'radio'); await shot('H1-side-door-gen');
    const b = await sideDoor([15.8, 4.6, 0], 'dorm', '宿舍 →', 'd', 'dorm');
    const c = await sideDoor([9.6, 12.6, 4], 'work', '← 加工间', null, null);
    return [a, b, c].join('；');
  });
  await step('H2 F03：点自己脚下的寻路格不卡死；之后键盘与寻路正常', async () => {
    const res = [];
    for (const [at, click] of [[[9.5, 10.3], [9.5, 10.25]], [[15, 16], [15.3, 16.2]], [[20.3, 18.3], [20.45, 18.45]]]) {
      await place(...at); await page.waitForTimeout(150);
      await toWorldClick(...click); const f = await framesIn(500); assert.ok(f > 20, `点击后 0.5 秒只刷新 ${f} 帧`);
      const y0 = (await st()).player.y; await walkIn([['s', 350]]); assert.ok((await st()).player.y - y0 > 15, '键盘走不动');
      await toWorldClick(at[0] + 2, at[1] + 1.2); await waitRoute();
      const p = (await st()).player; assert.ok(Math.hypot(p.x / 32 - at[0] - 2, p.y / 32 - at[1] - 1.2) < 1.6, `寻路没到 (${(p.x / 32).toFixed(2)}, ${(p.y / 32).toFixed(2)})`);
      res.push(`${f} 帧`);
    }
    assert.equal((await st()).errors, 0); return `0.5 秒内刷新 ${res.join('、')}`;
  });
  await step('H3 F03：点在杆身、墙上、池里、门柱，走到最近的空地', async () => {
    const res = [];
    for (const [name, at, click] of [['杆身', [9.5, 10.9], [9.5, 9.75]], ['南院墙', [15, 19.6], [15.2, 21.4]], ['育苗池里', [14.3, 12.5], [12.5, 11]], ['院门柱', [24, 18], [24.5, 19.7]]]) {
      await place(...at); await page.waitForTimeout(150); await toWorldClick(...click); await waitRoute();
      const f = await framesIn(300), p = (await st()).player, d = Math.hypot(p.x / 32 - click[0], p.y / 32 - click[1]);
      assert.ok(f > 10, `${name} 卡死`); assert.ok(d < 1.6, `${name} 停在 ${d.toFixed(2)} 格外`); res.push(`${name} ${d.toFixed(2)} 格`);
    }
    return res.join('，');
  });
  await step('H4 F03：四杆32候选方向：分别记录执行与障碍跳过（真实鼠标）', async () => {
    const fails = [], directions = []; let n = 0;
    for (const [px, py] of [[9, 9], [22, 9], [9, 19], [24, 19]]) for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, c = { x: px + .5, y: py + .8 }, from = { x: c.x + Math.cos(a) * 2.2, y: c.y + Math.sin(a) * 1.6 }, to = { x: c.x - Math.cos(a) * 2.2, y: c.y - Math.sin(a) * 1.6 };
      const ok = await page.evaluate(([f, t]) => { const h = window.__station.host; return !h.col.blocked(f.x * 32, f.y * 32) && !h.col.blocked(t.x * 32, t.y * 32) && !h['stationAt']({ x: t.x * 32, y: t.y * 32 }); }, [from, to]);
      if (!ok) { const reasons = await page.evaluate(([f,t]) => { const h=window.__station.host; return { fromBlocked:h.col.blocked(f.x*32,f.y*32), toBlocked:h.col.blocked(t.x*32,t.y*32), stationTarget:!!h.stationAt({x:t.x*32,y:t.y*32}) }; }, [from,to]); directions.push({ pole:[px,py],direction:k,from,to,status:'skipped',reasons }); continue; } n++;
      await place(from.x, from.y); await page.waitForTimeout(80); await toWorldClick(to.x, to.y); await waitRoute();
      const p = (await st()).player, d = Math.hypot(p.x / 32 - to.x, p.y / 32 - to.y) * 32;
      directions.push({ pole:[px,py],direction:k,from,to,status:'executed',distancePx:d });
      if (d > 10) fails.push(`${px},${py} 方向 ${k} 差 ${Math.round(d)} px`);
    }
    report.coverage.poles = directions; assert.equal(directions.length, 32); assert.ok(n > 0); assert.deepEqual(fails, []); return { executed: n, skipped: 32-n, directions };
  });
  await step('H5 F03：斜挤杆与墙角的缝、正对杆子直走不卡住；帧出错不停循环', async () => {
    await place(9.65, 11); await page.waitForTimeout(100);
    await page.keyboard.down('w'); await page.keyboard.down('a'); await page.waitForTimeout(700); await page.keyboard.up('w'); await page.keyboard.up('a');
    const a = (await st()).player; await walkIn([['d', 400]]); const b = (await st()).player; assert.ok(b.x - a.x > 15, `从缝里往右 ${(b.x - a.x).toFixed(1)} px`);
    await place(22.5, 11); await page.waitForTimeout(80); await walkIn([['w', 1100]]); const c = (await st()).player; assert.ok(c.y / 32 < 9.6, `停在 y=${(c.y / 32).toFixed(2)}`);
    expectedFrameErrors = true;
    await page.evaluate(() => { window.__station.host.injectFrameErrors = 3; });
    const f = await framesIn(500), errs = await page.evaluate(() => window.__station.host.errors.map(e => `${e.message} ×${e.count}`));
    assert.ok(f > 20); assert.deepEqual(errs, ['injected frame error (test) ×3']);
    await page.evaluate(() => { window.__station.host.errors.length = 0; }); expectedFrameErrors = false;
    return `缝里右移 ${(b.x - a.x).toFixed(0)} px；绕杆到 y=${(c.y / 32).toFixed(2)}；注入 3 次帧错误后继续 ${f} 帧`;
  });
  for (const [w, h] of [[1280, 720], [1024, 720], [844, 390], [390, 844]]) {
    await step(`H6 F02：${w}×${h} 通电序列里所有灯都在画面内，结束后恢复视野`, async () => {
      const mobile = w < 900;
      await open({ fixture: preset('parts'), at: [30.4, 4.6], size: [w, h], mobile });
      const s0 = await page.evaluate(() => window.__station.host.scene.view.s);
      await page.evaluate(() => window.__station.host.rt.submitQuest('repair')); await page.waitForTimeout(3400);
      const r = await page.evaluate(() => { const sc = window.__station.host.scene, out = []; for (const { def } of sc.light.lights()) if (def.power === 'restored' && def.head > 0) { const q = sc.toScreen(def.x, def.y - def.head); if (q.x < 0 || q.y < 0 || q.x > innerWidth || q.y > innerHeight) out.push(def.id); } return { s: sc.view.s, out }; });
      await shot(`H6-power-${w}x${h}`);
      await until(() => window.__station.host.debug.seq === null, 6000, 'sequence end');
      const s1 = await page.evaluate(() => window.__station.host.scene.view.s);
      assert.deepEqual(r.out, []); assert.equal(s1, s0);
      return `平时 ×${s0}，序列中 ×${r.s.toFixed(2)}，结束后 ×${s1}`;
    });
  }
  await step('H7 快捷入口：院子里按 2 修理铺结算、3 卫生所、5 设施切到工作台；页签切换；待买未结算时不让离开', async () => {
    await open({ fixture: preset('repaired'), at: [15.6, 16.4] });
    await page.keyboard.press('2'); await until(() => window.__station.host.ui.kind === 'arms', 2000, 'arms');
    const cash0 = (await snap()).profile.cash, ammo = await itemBox('merchant', 'ammo9');
    await drag({ x: ammo.box.x + 8, y: ammo.box.y + 8 }, await cellCenter('buy', 0, 0));
    await page.locator('.ptabs [data-tab="radio"]').click(); await page.waitForTimeout(200); assert.equal(await panel(), 'arms', '待买未结算时被切走');
    await page.locator('[data-act="cart-settle"]').click(); await page.waitForTimeout(150);
    assert.equal((await snap()).profile.cash, cash0 - 12 * D.ITEMS.ammo9.buy);
    const p0 = (await st()).player; assert.ok(Math.hypot(p0.x / 32 - 15.6, p0.y / 32 - 16.4) < .1, '快捷打开时玩家被带走');
    await page.keyboard.press('3'); await until(() => window.__station.host.ui.kind === 'med', 2000, 'med'); await page.waitForTimeout(300);
    assert.ok((await page.evaluate(() => window.__station.host.scene.lastHidden)).includes('clinic'));
    await shot('H7-clinic-shortcut');
    await page.keyboard.press('5'); await until(() => window.__station.host.ui.kind === 'facility', 2000, 'facility');
    await page.locator('[data-act="fac:workbench"]').click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('#station-yard >> .panel h2').textContent(), '工作台'); assert.ok((await page.evaluate(() => window.__station.host.scene.lastHidden)).includes('work'));
    return `修理铺现金 ${cash0} → ${cash0 - 84}；卫生所看进 clinic；设施切到工作台`;
  });
  await step('H8 手机竖屏：收起的“功能”菜单 → 卫生所；面板标题菜单 → 整备；页签按钮', async () => {
    await open({ fixture: preset('repaired'), at: [15.6, 16.4], size: [390, 844], mobile: true });
    const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('#station-yard').shadowRoot.querySelector('[data-quick="med"]')).display === 'none');
    await shot('H8-mobile-yard-390x844');
    await page.locator('[data-quickmenu]').tap(); await page.waitForTimeout(100); await page.locator('[data-quick="med"]').tap();
    await until(() => window.__station.host.ui.kind === 'med', 3000, 'med');
    await page.locator('[data-tabmenu]').tap(); await page.waitForTimeout(100); await page.locator('.ptabs [data-tab="gear"]').tap();
    await until(() => window.__station.host.ui.kind === 'gear', 3000, 'gear');
    await shot('H8-mobile-gear-390x844'); assert.ok(hidden);
    return '窄屏收起快捷栏；功能菜单与标题菜单可用';
  });
  await step('H8b 手机触屏：左下摇杆拖动走路，靠近修理铺后点“交互”打开面板', async () => {
    await open({ fixture: preset('repaired'), at: [6.5, 19.5], size: [844, 390], mobile: true });
    const cdp = await ctx.newCDPSession(page), touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
    const a = (await st()).player;
    await touch('touchStart', 150, 300); for (let i = 1; i <= 6; i++) { await touch('touchMove', 150 - i * 8, 300); await page.waitForTimeout(16); }
    await page.waitForTimeout(450); await touch('touchEnd');
    const b = (await st()).player; assert.ok(a.x - b.x > 20, `摇杆向左只走了 ${(a.x - b.x).toFixed(1)} px`);
    assert.equal((await st()).focus, 'arms');
    await page.locator('#station-yard .touch-act').tap(); await until(() => window.__station.host.ui.kind === 'arms', 3000, 'arms');
    await shot('H8b-touch-shop-844x390');
    return `摇杆左移 ${(a.x - b.x).toFixed(0)} px；交互按钮打开修理铺`;
  });
  const labelsCut = () => page.evaluate(() => [...document.querySelector('#station-yard').shadowRoot.querySelectorAll('.grid .item .lbl')].filter(l => l.scrollWidth > l.clientWidth + .5).map(l => l.textContent));
  const minCell = () => page.evaluate(() => Math.min(...[...document.querySelector('#station-yard').shadowRoot.querySelectorAll('.grid')].map(g => Number(g.dataset.cell))));
  for (const [w, h] of [[844, 390], [390, 844], [1280, 720], [1920, 1080]]) {
    await step(`H9 物品名完整、格子 ≥ 36 px、无横向溢出：${w}×${h} 整备与修理铺`, async () => {
      const mobile = w < 900, res = [];
      await open({ fixture: preset('built'), at: [4.6, 5.4], size: [w, h], mobile });
      for (const [key, kind, label] of [['1', 'gear', '整备'], ['2', 'arms', '修理铺']]) {
        if (mobile) await page.evaluate(k => window.__station.host.ui.quickOpen(k), kind); else await page.keyboard.press(key);
        await until(k => window.__station.host.ui.kind === k, 3000, kind, kind); await page.waitForTimeout(300);
        const cut = await labelsCut(), cell = await minCell(), over = await page.evaluate(() => { const el = document.querySelector('#station-yard').shadowRoot.querySelector('.panel'); return el.scrollWidth > el.clientWidth + 1; });
        const compact = await page.evaluate(() => document.querySelector('#station-yard').shadowRoot.querySelector('.panel').classList.contains('compact'));
        assert.deepEqual(cut, [], `${label}截断`); assert.ok(cell >= 36 || !mobile && cell >= 28, `${label}格子 ${cell}px`); assert.ok(!over, `${label}横向溢出`); assert.equal(compact, mobile);
        await shot(`H9-${kind}-${w}x${h}`);
        res.push(`${label}${compact ? '（紧凑）' : ''} ${cell}px`);
        if (kind === 'gear') { await page.evaluate(() => window.__station.host.ui.close()); await page.waitForTimeout(150); }
      }
      return res.join('，');
    });
  }
  await step('H10 手机横屏 844×390：仓库拖进背包、背包拖进安全箱、修理铺买入结算', async () => {
    await open({ fixture: preset('repaired'), at: [4.6, 5.4], size: [844, 390], mobile: true });
    await page.evaluate(() => window.__station.host.ui.quickOpen('gear')); await page.waitForTimeout(400);
    const c = await itemBox('stash', 'cloth'); await drag({ x: c.box.x + 8, y: c.box.y + 8 }, await cellCenter('bag', 5, 0));
    assert.ok((await snap()).profile.bag.items.some(i => i.uid === c.uid));
    await page.locator('[data-act="pane:safe"]').tap(); await page.waitForTimeout(150);
    const b = await page.locator(`[data-grid="bag"] .item[data-uid="${c.uid}"]`).boundingBox(); await drag({ x: b.x + 8, y: b.y + 8 }, await cellCenter('safe', 0, 0));
    assert.ok((await snap()).profile.safe.items.some(i => i.uid === c.uid));
    await page.evaluate(() => window.__station.host.ui.quickOpen('arms')); await page.waitForTimeout(400);
    const cash0 = (await snap()).profile.cash, ammo = await itemBox('merchant', 'ammo9'); await drag({ x: ammo.box.x + 8, y: ammo.box.y + 8 }, await cellCenter('buy', 0, 0));
    await page.locator('[data-act="mode:sell"]').tap(); await page.waitForTimeout(150);
    const wt = await itemBox('stash', 'watch'); await drag({ x: wt.box.x + 8, y: wt.box.y + 8 }, await cellCenter('sell', 0, 0));
    await shot('H10-mobile-shop-844x390');
    await page.locator('[data-act="cart-settle"]').tap(); await page.waitForTimeout(200);
    const cash1 = (await snap()).profile.cash; assert.equal(cash1, cash0 - 84 + 240);
    return `布料 仓库→背包→安全箱；现金 ${cash0} → ${cash1}`;
  });
  await step('H11 面板高度：1280×720、1366×768、1920×1080 下整备与修理铺不用滚动', async () => {
    const res = [];
    for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]]) {
      for (const fx of ['repaired', 'built']) {
        await open({ fixture: preset(fx), at: [4.6, 5.4], size: [w, h] });
        for (const key of ['1', '2']) {
          await page.keyboard.press(key); await page.waitForTimeout(400);
          const over = await page.evaluate(() => { const b = document.querySelector('#station-yard').shadowRoot.querySelector('.panel .pbody'); return b ? b.scrollHeight - b.clientHeight : -1; });
          assert.ok(over <= 1, `${w}×${h} ${fx} ${key} 多出 ${over}px`);
          if (w === 1920 && fx === 'built') await shot(`H11-${key === '1' ? 'gear' : 'shop'}-1920x1080`);
          await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        }
      }
      res.push(`${w}×${h}`);
    }
    return `${res.join('、')} 均无需滚动`;
  });
  await step('H12 素材实景：33张逐项覆盖，四NPC工作/近身/说话、遮挡与供电', async () => {
    await open({fixture:preset('parts'),at:[25.5,5]}); await page.waitForTimeout(900); await shot('H12-gen-emergency');
    const visits=[['xu','med',28.5,12.74,28.5,15.9,28.5,14.6],['shuan','arms',4,16.74,4,20.4,4,18.3],['cai','radio',30.5,3.5,30.5,6.5,30.5,5.3],['cook','cook',15.1,3.5,15.1,6.5,15.1,5.1]];
    report.coverage.art=[];
    await page.evaluate(()=>window.__bincov.hideoutRuntime.submitQuest('repair')); await until(()=>window.__station.host.debug.seq===null);
    for(const [look,id,nx,ny,fx,fy,ix,iy]of visits) {
      await place(fx,fy); await page.waitForTimeout(1100); await shot('H12-'+look+'-work');
      await place(ix,iy); await page.waitForTimeout(1100); await shot('H12-'+look+'-idle');
      const idle=await page.evaluate(id=>{const h=window.__station.host,a=h.updateActors(0).find(a=>a.id===id),e=h.scene.actorSprites.get(id),o=h.scene.occluders.get(e.body);return{actor:a,feet:e.body.y,shadow:e.shadow.y,depth:e.body.zIndex,maskDepth:o.zIndex,maskTextureSame:o.texture===e.body.texture};},id);
      assert.equal(idle.feet,idle.shadow+1);assert.equal(idle.maskDepth,idle.depth);assert.equal(idle.maskTextureSame,true);
      if(id==='cook') await page.keyboard.press('e'); else await page.locator('[data-quick="'+id+'"]').click();
      await page.waitForTimeout(1300); await shot('H12-'+look+'-talk');
      const talk=await page.evaluate(id=>window.__station.host.updateActors(0).find(a=>a.id===id),id); assert.equal(talk.pose,'talk');
      await page.keyboard.press('Escape');
      await place(nx+1.7,ny+.7); await page.waitForTimeout(700); await shot('H12-'+look+'-turn-fallback');
      report.coverage.art.push({look,idle,talk,turn:await page.evaluate(id=>window.__station.host.updateActors(0).find(a=>a.id===id),id)});
    }
    // Same actual textures/depth are copied into emission occluders; closed roofs suppress indoor glow.
    await place(17.5,17.6); await page.waitForTimeout(1000);
    const covered=await page.evaluate(()=>window.__station.host.scene.glows.filter(g=>g.room).map(g=>({room:g.room,alpha:g.sprite.alpha,visible:g.sprite.visible})));
    for(const g of covered) {assert.equal(g.alpha,0);assert.equal(g.visible,false);}
    for(const [name,x,y]of [['xu-desk',28.5,12.6],['repair-counter',4,16.7]]) {
      await place(x,y);await page.waitForTimeout(800);await shot('H12-occlusion-'+name);
      const fades=await page.evaluate(()=>[...window.__station.host.scene.propSprites].filter(([,u])=>u.sprite.alpha<.99).map(([id,u])=>({id,alpha:u.sprite.alpha})));
      report.coverage.art.push({occlusion:name,player:(await st()).player,fades}); assert.ok(fades.some(f=>f.id===name && f.alpha<.5),'specific foreground furniture did not fade: '+name);
    }
    await place(25.5,5);await page.waitForTimeout(800);await shot('H12-gen-restored');
    const used=await page.evaluate(()=>window.__station.art());
    assert.equal(used.delivered.length,33);assert.deepEqual(used.rejected,[]);
    const missing=used.delivered.filter(id=>!used.used.includes(id)); report.coverage.artAssets={...used,missing,roofGlows:covered};
    assert.deepEqual(missing,[],'some delivered frames were never selected by the live scene');
    return {delivered:33,selected:used.used.length,missing};
  });
  await step('H13 帧耗时（场景提交，60 帧均值；无头 Chrome，非真机）', async () => {
    const ms = await page.evaluate(async () => { const a = []; for (let i = 0; i < 60; i++) { await new Promise(r => requestAnimationFrame(r)); a.push(window.__station.host.scene.stats.frameMs); } a.sort((x, y) => x - y); return { avg: a.reduce((s, v) => s + v, 0) / a.length, p95: a[Math.floor(a.length * .95)] }; });
    return `均值 ${ms.avg.toFixed(2)} ms，p95 ${ms.p95.toFixed(2)} ms`;
  });
  await step('H14 1920×1080 院子与 1280×720 夜景截图', async () => {
    await open({ fixture: preset('built'), at: [17.5, 17.6], size: [1920, 1080] }); await page.waitForTimeout(800); await shot('H14-yard-1920x1080');
    await place(27.5, 12.6); await page.waitForTimeout(600); await shot('H14-clinic-1920x1080');
    return '已截图';
  });
  for (const [w,h] of [[1280,720],[1920,1080],[844,390],[390,844]]) await step('H16 真实交互/交易/刷新 '+w+'x'+h, async () => {
    const mobile=w<900;
    await open({fixture:preset('repaired'),size:[w,h],mobile});
    const press=async locator=>mobile?locator.tap():locator.click();
    const activate=async kind=>{
      if(await panel()) {
        const tab=page.locator('.ptabs [data-tab="'+kind+'"]');
        if(!await tab.isVisible()) await press(page.locator('[data-tabmenu]'));
        await press(tab);
      } else {
        const button=page.locator('[data-quick="'+kind+'"]');
        if(!await button.isVisible()) await press(page.locator('[data-quickmenu]'));
        await press(button);
      }
      await until(k=>window.__station.host.ui.kind===k,3000,kind,kind);
    };
    const cdp=mobile?await ctx.newCDPSession(page):null;
    const move=async (a,b)=>{
      if(!mobile) return drag(a,b);
      const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:11}]});
      await touch('touchStart',a.x,a.y);
      for(let i=1;i<=12;i++){await touch('touchMove',a.x+(b.x-a.x)*i/12,a.y+(b.y-a.y)*i/12);await page.waitForTimeout(16);}
      await page.waitForTimeout(60);await touch('touchEnd');await page.waitForTimeout(180);
    };
    // Round 2: OPUS-STATION-INPUT-01 is fixed, so 390 px also opens 整备 straight from the folded “功能” menu
    // (the earlier detour through 卫生所 and the panel title menu is no longer needed).
    await activate('gear');
    await page.waitForTimeout(200);
    const cloth=await itemBox('stash','cloth');
    await move({x:cloth.box.x+8,y:cloth.box.y+8},await cellCenter('bag',4,2));
    assert.ok((await snap()).profile.bag.items.some(i=>i.uid===cloth.uid));
    await activate('arms');
    const before=await snap(),ammo=await itemBox('merchant','ammo9');
    await move({x:ammo.box.x+8,y:ammo.box.y+8},await cellCenter('buy',0,0));
    assert.equal(await page.locator('[data-grid="buy"] .item').count(),1,'actual pointer did not add shopping item');
    if(mobile)await page.locator('[data-act="cart-settle"]').tap();else await page.locator('[data-act="cart-settle"]').click();
    await page.waitForTimeout(180);
    const after=await snap();assert.equal(after.profile.cash,before.profile.cash-84);
    assert.equal(D.count(after.profile.stash,'ammo9'),D.count(before.profile.stash,'ammo9')+12);
    assert.deepEqual(await labelsCut(),[]);assert.ok(await minCell()>=36);
    await shot('H16-interaction-'+w+'x'+h);
    await page.reload();await page.locator('[data-action="enter"]').click();await yardReady();
    assert.deepEqual((await snap()).profile,after.profile);
    return {size:[w,h],input:mobile?'CDP touch sequence, tap controls':'real mouse',cashBefore:before.profile.cash,cashAfter:after.profile.cash,refreshPreserved:true};
  });

  await step('H17 390x844 快捷菜单中心点击必须命中整备与修理铺',async()=>{
    report.coverage.mobileMenuHit=[];
    for(const kind of ['gear','arms']) {
      await open({fixture:preset('repaired'),size:[390,844],mobile:true});
      await page.locator('[data-quickmenu]').tap();
      const box=await page.locator('[data-quick="'+kind+'"]').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
      const hit=await page.evaluate(([x,y])=>{const root=document.querySelector('#station-yard').shadowRoot,e=root.elementFromPoint(x,y);return{tag:e.tagName,class:e.className,quick:e.closest('[data-quick]')?.dataset.quick??null,aria:e.getAttribute('aria-label')};},[x,y]);
      await shot('H17-before-'+kind);
      const cdp=await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:19}]});
      await page.waitForTimeout(60);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(300);
      report.coverage.mobileMenuHit.push({kind,box,centre:{x,y},hit,actual:await panel()});
      await shot('H17-after-'+kind);
    }
    assert.deepEqual(report.coverage.mobileMenuHit.map(r=>({expected:r.kind,hit:r.hit.quick,actual:r.actual})),['gear','arms'].map(kind=>({expected:kind,hit:kind,actual:kind})),'OPUS-STATION-INPUT-01: interaction button intercepts quick-menu centres');
    return report.coverage.mobileMenuHit;
  });

  // ================= I. OPUS-STATION-INPUT-01: shortcut menu, interact button, panels (round 2) =================
  // Real input only: CDP touch sequences on phones, the mouse on desktop. No forced clicks, no test API to open panels.
  /** Every visible shortcut button and the interact button, with the points (centre and four inner points) that a
   *  finger would land on and whatever control actually receives them. */
  const controls = () => page.evaluate(() => {
    const root = document.querySelector('#station-yard').shadowRoot, out = [];
    const id = el => el.dataset.quick ?? (el.matches('[data-tabs]') ? 'tabs' : el.matches('[data-quickmenu]') ? 'more' : el.classList.contains('touch-act') ? 'interact' : '?');
    for (const el of root.querySelectorAll('.quick button, .touch-act')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const pts = [[.5, .5], [.2, .25], [.8, .25], [.2, .75], [.8, .75]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]);
      const blocked = pts.map(([x, y]) => { const e = root.elementFromPoint(x, y), c = e?.closest('.quick button, .touch-act'); return c === el ? null : { x: Math.round(x), y: Math.round(y), got: c ? id(c) : (e?.className || e?.tagName || null) }; }).filter(Boolean);
      out.push({ id: id(el), rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, blocked });
    }
    return out;
  });
  const overlaps = list => { const a = list.find(c => c.id === 'interact'); if (!a) return []; return list.filter(c => c !== a && c.rect.x < a.rect.x + a.rect.w && a.rect.x < c.rect.x + c.rect.w && c.rect.y < a.rect.y + a.rect.h && a.rect.y < c.rect.y + c.rect.h).map(c => c.id); };
  const menuOpen = () => page.evaluate(() => document.querySelector('#station-yard').shadowRoot.querySelector('.quick').classList.contains('open'));
  const centreOf = async sel => { const b = await page.locator(sel).boundingBox(); assert.ok(b, `${sel} not on screen`); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  /** One finger: touchStart / touchEnd at a screen point (the browser turns it into the click a player gets). */
  const touchTap = async ({ x, y }) => {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 41 }] }); await page.waitForTimeout(50);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(260); await cdp.detach();
  };
  const tapSel = async sel => touchTap(await centreOf(`#station-yard ${sel}`));
  const tapClose = async () => { await tapSel('.panel:not([hidden]) .phead [data-act="close"]'); await until(() => !window.__station.host.ui.kind, 3000, 'panel closed'); };
  const presetFor = power => preset(power === 'restored' ? 'repaired' : 'parts');

  for (const power of ['emergency', 'restored']) await step(`I1 390×844 ${power === 'restored' ? '通电' : '应急'}：展开“功能”后每个按钮的中心与四角都命中自己；手指点整备、修理铺打开对应面板，关闭后菜单收起`, async () => {
    await open({ fixture: presetFor(power), size: [390, 844], mobile: true });
    // At the gate the interact button targets 出击: the panel a mis-hit used to open.
    const focus = (await st()).focus;
    const closed = await controls();
    assert.deepEqual(closed.filter(c => c.blocked.length), [], 'menu closed: a control is covered');
    await tapSel('[data-quickmenu]'); assert.equal(await menuOpen(), true, '功能 did not open the menu');
    const opened = await controls(); await shot(`I1-menu-open-390x844-${power}`);
    assert.deepEqual(opened.filter(c => c.blocked.length).map(c => ({ id: c.id, blocked: c.blocked })), [], 'menu open: a menu button is covered');
    assert.deepEqual(overlaps(opened), [], 'interact button overlaps the open menu');
    const opens = [];
    for (const kind of ['gear', 'arms']) {
      if (!await menuOpen()) await tapSel('[data-quickmenu]');
      await tapSel(`[data-quick="${kind}"]`);
      await until(k => window.__station.host.ui.kind === k, 3000, kind, kind);
      await page.waitForTimeout(250);
      const onPanel = (await controls()).map(c => c.id);
      assert.ok(!onPanel.includes('interact'), `interact button shown over the ${kind} panel`);
      await shot(`I1-${kind}-panel-390x844-${power}`);
      await tapClose();
      assert.equal(await menuOpen(), false, 'menu left open behind the closed panel');
      opens.push(kind);
    }
    assert.ok((await controls()).some(c => c.id === 'interact'), 'interact button did not come back after the panels closed');
    return { power, focus, menuButtons: opened.filter(c => c.id !== 'more').map(c => c.id), opened: opens };
  });

  await step('I2 横竖屏切换：竖屏展开菜单 → 转横屏 844×390 菜单收起、快捷栏不被挡 → 横屏手指开整备 → 转回竖屏再展开仍命中修理铺', async () => {
    await open({ fixture: preset('repaired'), size: [390, 844], mobile: true });
    await tapSel('[data-quickmenu]'); assert.equal(await menuOpen(), true);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(600);
    assert.equal(await menuOpen(), false, 'menu stayed open across the rotation');
    const land = await controls(); await shot('I2-landscape-844x390');
    assert.deepEqual(land.filter(c => c.blocked.length), [], 'landscape: a control is covered'); assert.deepEqual(overlaps(land), [], 'landscape: interact overlaps the bar');
    await tapSel('[data-quick="gear"]'); await until(() => window.__station.host.ui.kind === 'gear', 3000, 'gear');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
    assert.equal(await panel(), 'gear', 'panel lost across the rotation'); await shot('I2-gear-rotated-back-390x844');
    await tapClose();
    await tapSel('[data-quickmenu]'); const port = await controls();
    assert.deepEqual(port.filter(c => c.blocked.length), [], 'portrait again: a menu button is covered');
    await tapSel('[data-quick="arms"]'); await until(() => window.__station.host.ui.kind === 'arms', 3000, 'arms');
    await tapClose();
    return { landscape: land.map(c => c.id), portrait: port.map(c => c.id) };
  });

  await step('I2b 只改高度（手机地址栏收起 390×844 → 390×780）：菜单保持展开，按钮仍命中自己', async () => {
    await open({ fixture: preset('repaired'), size: [390, 844], mobile: true });
    await tapSel('[data-quickmenu]'); assert.equal(await menuOpen(), true);
    await page.setViewportSize({ width: 390, height: 780 }); await page.waitForTimeout(500);
    assert.equal(await menuOpen(), true, 'a height-only resize folded the menu');
    const c = await controls(); assert.deepEqual(c.filter(x => x.blocked.length), []); assert.deepEqual(overlaps(c), []);
    await tapSel('[data-quick="gear"]'); await until(() => window.__station.host.ui.kind === 'gear', 3000, 'gear');
    return { controls: c.map(x => x.id) };
  });

  await step('I3 菜单开关与往返：“功能”开/关；菜单开着点画面只收起不走路；整备→页签菜单切修理铺→关闭；“交互”恢复并打开老栓', async () => {
    await open({ fixture: preset('repaired'), size: [390, 844], mobile: true, at: [4.6, 19.5] });
    await page.waitForTimeout(300);
    assert.equal((await st()).focus, 'arms', 'fixture: not at Lao Shuan');
    await tapSel('[data-quickmenu]'); assert.equal(await menuOpen(), true);
    await tapSel('[data-quickmenu]'); assert.equal(await menuOpen(), false, '功能 does not close the menu');
    await tapSel('[data-quickmenu]');
    const p0 = (await st()).player;
    await touchTap({ x: 120, y: 300 }); await page.waitForTimeout(600);
    const p1 = (await st()).player;
    assert.equal(await menuOpen(), false, 'tapping the scene left the menu open');
    assert.ok(Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1, `tapping the scene to close the menu also walked ${Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(1)} px`);
    await tapSel('[data-quickmenu]'); await tapSel('[data-quick="gear"]'); await until(() => window.__station.host.ui.kind === 'gear', 3000, 'gear');
    await tapSel('[data-tabmenu]'); await tapSel('.ptabs [data-tab="arms"]'); await until(() => window.__station.host.ui.kind === 'arms', 3000, 'arms tab');
    assert.ok(!(await controls()).some(c => c.id === 'interact'), 'interact shown over the arms panel');
    await tapClose();
    const back = await controls(); assert.deepEqual(back.filter(c => c.blocked.length), []);
    assert.ok(back.some(c => c.id === 'interact'), 'interact missing after the round trip');
    await tapSel('.touch-act'); await until(() => window.__station.host.ui.kind === 'arms', 3000, 'interact -> arms');
    await shot('I3-interact-arms-390x844');
    await tapClose();
    return { closedByScene: true, walked: +Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(2), roundTrip: ['gear', 'arms'], interact: 'arms' };
  });

  for (const [w, h] of [[360, 740], [412, 915], [640, 360], [768, 1024], [932, 430]]) await step(`I4 ${w}×${h}：菜单收起与展开时所有快捷按钮和“交互”互不遮挡，手指点修理铺命中`, async () => {
    await open({ fixture: preset('repaired'), size: [w, h], mobile: true });
    const a = await controls();
    assert.deepEqual(a.filter(c => c.blocked.length), [], 'menu closed: covered'); assert.deepEqual(overlaps(a), [], 'menu closed: overlap');
    let b = a;
    if (a.some(c => c.id === 'more')) {
      await tapSel('[data-quickmenu]'); b = await controls(); await shot(`I4-menu-open-${w}x${h}`);
      assert.deepEqual(b.filter(c => c.blocked.length).map(c => ({ id: c.id, blocked: c.blocked })), [], 'menu open: covered'); assert.deepEqual(overlaps(b), [], 'menu open: overlap');
    } else await shot(`I4-bar-${w}x${h}`);
    await tapSel('[data-quick="arms"]'); await until(() => window.__station.host.ui.kind === 'arms', 3000, 'arms');
    return { folded: a.some(c => c.id === 'more'), controls: b.map(c => c.id) };
  });

  for (const [w, h] of [[1280, 720], [1920, 1080]]) for (const power of ['emergency', 'restored']) await step(`I5 ${w}×${h} ${power === 'restored' ? '通电' : '应急'}：桌面快捷栏用鼠标点整备、修理铺，按钮全部可点`, async () => {
    await open({ fixture: presetFor(power), size: [w, h] });
    const a = await controls(); assert.deepEqual(a.filter(c => c.blocked.length), []);
    for (const kind of ['gear', 'arms']) {
      await page.mouse.click(...Object.values(await centreOf(`#station-yard [data-quick="${kind}"]`)));
      await until(k => window.__station.host.ui.kind === k, 3000, kind, kind);
      await page.mouse.click(...Object.values(await centreOf('#station-yard .panel:not([hidden]) .phead [data-act="close"]')));
      await until(() => !window.__station.host.ui.kind, 3000, 'closed');
    }
    return { controls: a.map(c => c.id) };
  });

  // ================= L. OPUS-STATION-LIGHT-01: wall / roof lighting steps (round 2) =================
  /**
   * Measured on the rendered frame (the world render target, before upscaling): the effective light multiplier
   * (rendered luminance / texture luminance, median over a 4 px band) on both sides of every seam between two plain
   * wall tiles of the same surface: face next to face and top next to top along a row, top above top down a wall
   * column. A per-tile light makes those seams jump; a smooth light keeps them as small as the change inside a tile.
   * A face meeting the top of a side wall at a corner is a change of surface and is not a seam. Pixels under a
   * visible roof or the shed canopy, faded walls, windows, doors and gates are left out.
   */
  const wallSteps = () => page.evaluate(() => {
    const h = window.__station.host, sc = h.scene, app = h['app'];
    const { pixels, width, height } = app.renderer.extract.pixels(sc['worldRT']);
    const cam = sc.cam;
    const covers = [...sc['roofs'].values()].filter(r => r.sprite.visible && r.sprite.alpha > .02).map(r => ({ x: r.sprite.x, y: r.sprite.y, w: r.sprite.width, h: r.sprite.height }));
    if (sc['canopy']?.visible && sc['canopy'].alpha > .02) covers.push({ x: sc['canopy'].x, y: sc['canopy'].y, w: sc['canopy'].width, h: sc['canopy'].height });
    const walls = sc['uprights'].filter(u => u.kind === 'wall' && u.wall && !u.wall.window && !u.wall.door && !u.wall.gate && u.sprite.visible && u.sprite.renderable !== false && u.fade > .99 && u.sprite.alpha > .99);
    const at = new Map(walls.map(u => [u.wall.x + ',' + u.wall.y, u]));
    const cache = new Map();
    const tex = u => { const c = (u.sprite.texture ?? u.sprite.children?.[0]?.texture)?.source?.resource; if (!cache.has(c)) cache.set(c, c.getContext('2d').getImageData(0, 0, c.width, c.height)); return cache.get(c); };
    const faced = u => tex(u).height > 32;
    const band = (u, lx0, lx1, ly0 = 0, ly1 = Infinity) => {
      const td = tex(u), ox = Math.round(u.sprite.x) - cam.x, oy = Math.round(u.sprite.y) - cam.y, vals = [];
      for (let ly = ly0; ly < Math.min(ly1, td.height); ly++) for (let lx = lx0; lx < lx1; lx++) {
        const sx = ox + lx, sy = oy + ly, wx = sx + cam.x, wy = sy + cam.y;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height || covers.some(c => wx >= c.x && wy >= c.y && wx < c.x + c.w && wy < c.y + c.h)) continue;
        const ti = (ly * td.width + lx) * 4; if (td.data[ti + 3] < 255) continue;
        const tl = .3 * td.data[ti] + .59 * td.data[ti + 1] + .11 * td.data[ti + 2]; if (tl < 24) continue;
        const pi = (sy * width + sx) * 4; vals.push((.3 * pixels[pi] + .59 * pixels[pi + 1] + .11 * pixels[pi + 2]) / tl);
      }
      if (vals.length < 16) return null; vals.sort((a, b) => a - b); return vals[vals.length >> 1];
    };
    const edges = [], inner = [];
    const add = (kind, u, a, b) => { if (a != null && b != null) edges.push({ kind, tile: [u.wall.x, u.wall.y], step: Math.abs(a - b), a: +a.toFixed(3), b: +b.toFixed(3) }); };
    for (const u of walls) {
      const right = at.get((u.wall.x + 1) + ',' + u.wall.y), below = at.get(u.wall.x + ',' + (u.wall.y + 1));
      if (right && faced(u) === faced(right)) {
        // Faces: the face rows; tops: the top rows (both in their own surface).
        if (faced(u)) add('face-row', u, band(u, 28, 32, 32), band(right, 0, 4, 32));
        add('top-row', u, band(u, 28, 32, 0, 32), band(right, 0, 4, 0, 32));
      }
      if (below && !faced(u) && !faced(below)) add('top-column', u, band(u, 0, 32, 28, 32), band(below, 0, 32, 0, 4));
      const c = band(u, 12, 16), d = band(u, 16, 20); if (c != null && d != null) inner.push(Math.abs(c - d));
    }
    const sorted = edges.map(e => e.step).sort((a, b) => a - b), q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * p))] : 0;
    inner.sort((a, b) => a - b);
    const kinds = Object.fromEntries(['face-row', 'top-row', 'top-column'].map(k => [k, edges.filter(e => e.kind === k).length]));
    return { edges: edges.length, kinds, median: +q(sorted, .5).toFixed(3), p90: +q(sorted, .9).toFixed(3), max: +q(sorted, 1).toFixed(3), innerP90: +q(inner, .9).toFixed(3), worst: edges.sort((a, b) => b.step - a.step).slice(0, 6) };
  });
  // Views: the clinic at 1920×1080 (Sol's H14), the radio room from inside (Sol's H12), the workshop with its walls
  // and side wall columns, and the yard's south sea wall.
  const LIGHT_VIEWS = [['clinic-1920x1080', [27.5, 12.6], [1920, 1080]], ['radio-1280x720', [30.4, 5.6], [1280, 720]], ['workshop-1920x1080', [6.5, 13.5], [1920, 1080]], ['seawall-1920x1080', [17.5, 19.8], [1920, 1080]]];
  report.coverage.wallLight = [];
  for (const power of ['emergency', 'restored']) for (const [name, at, size] of LIGHT_VIEWS) await step(`L1 ${name} ${power === 'restored' ? '通电' : '应急'}：同一墙面相邻格的接缝处实际渲染明暗跳变 p90 ≤ 0.05、最大 ≤ 0.10（行与列）`, async () => {
    await open({ fixture: preset(power === 'restored' ? 'built' : 'parts'), size, at });
    await page.waitForTimeout(900);
    const m = await wallSteps(); report.coverage.wallLight.push({ name, power, ...m });
    await shot(`L1-${name}-${power}`);
    assert.ok(m.edges >= 8, `only ${m.edges} measurable wall edges in view`);
    assert.ok(m.p90 <= .05 && m.max <= .1, `wall light steps at tile seams: p90 ${m.p90}, max ${m.max} (inside tiles p90 ${m.innerP90}); worst ${JSON.stringify(m.worst.slice(0, 3))}`);
    return m;
  });

} finally {
  await ctx?.close().catch(() => {}); await browser.close();
  const pass = report.steps.filter(s => s.status === 'passed').length;
  report.finishedAt = new Date().toISOString(); report.summary = { passed: pass, total: report.steps.length };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${pass} / ${report.steps.length} passed; page errors ${report.errors.length}; external ${report.external.length}`);
  if (pass !== report.steps.length || report.errors.length || report.external.length || report.frameAudit.some(e => !e.expected)) process.exitCode = 1;
}
