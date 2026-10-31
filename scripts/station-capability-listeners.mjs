/**
 * SOL-R3-CAP-LISTENER-01 on the packaged build: who owns each 'change' listener of Pixi's batch-sampler uniform groups
 * while restored WebGL contexts switch between 8 and 16 batchable textures. Only the capability query is simulated,
 * with the same getParameter shim as station-context-program C5 (MAX_TEXTURE_IMAGE_UNITS reads 8 while window.__units
 * is set); losses, restores and drawing are real. Each workload runs in a fresh page, rounds of (8, 8, 16, 16) restores:
 *   probe: C5's scratch draw after each restore. Its no-batch Graphics render data then sits in Pixi's pool, so the
 *          shader that render data uses is test-made and is labelled apart from the product's.
 *   idle:  no scratch draw; the yard stays up (product only).
 *   remount: no scratch draw; the yard view is closed and entered again after each restore (product only).
 *   trip:  no scratch draw. After each restore a real yard -> village (buildings, seed 42) -> yard trip on the shared
 *          renderer; samples in the yard and in the village (product only).
 * A listener is the bind group of one shader. It is matched to the current users of that shader: the graphics adaptor,
 * BatcherPipe batchers, product Graphics render data, the probe's pooled render data, and the title's renderer. The
 * title keeps its own Pixi renderer for the page's life (src/title/scene.ts prepareTitleRenderer, since #64); its
 * graphics adaptor Shader listens on the 16-texture group from boot and its batchers borrow the page's DefaultShader.
 * That renderer is only reachable from the menu, so each page takes it there (a WeakRef) before entering the yard.
 * A shader seen earlier that has no user now is reported as 'kept' if it is still alive after GC (the page's
 * per-count DefaultShader).
 * Checks after three CDP GCs: no listener whose shader was collected or never seen; one DefaultShader per texture
 * count; per group, the same DefaultShader listeners at the end of every round and, of the graphics adaptor's Shaders
 * (new on every context change), only the current one; of the title renderer, only its graphics adaptor's one Shader;
 * the yard still draws and walks.
 * Usage: node --import tsx scripts/station-capability-listeners.mjs [--html=dist/index.html]
 *        [--out=test-results/cap-listener] [--workload=probe,idle,remount,trip] [--rounds=3]
 * Exit 1 on any failed check. On the pre-fix build (1dbacb4) probe and trip fail the first three checks; idle and
 * remount pass there too (in them the yard by itself reused no pooled render data after a switch).
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { watchOldPage, yardReport } from './yard-entry.mjs';
import * as D from '../src/domain.ts';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = resolve(arg('out') ?? 'test-results/cap-listener'); await mkdir(out, { recursive: true });
const htmlPath = arg('html') ?? 'dist/index.html', html = await readFile(htmlPath, 'utf8');
const workloads = (arg('workload') ?? 'probe,idle,remount,trip').split(','), rounds = Number(arg('rounds') ?? 3);
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, buildSHA256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), simulated: 'MAX_TEXTURE_IMAGE_UNITS only', rounds, startedAt: new Date().toISOString(), steps: [], errors: [], external: [] };
let ctx, page;

/** Repaired-quest save so the yard can deploy (built with the game's own domain code). */
function fixture() {
  const s = D.newSave(), add = (inv, id, qty) => assert.equal(D.addItem(inv, id, qty), 0, `fixture: no room for ${id}`);
  add(s.stash, 'scrap', 8); add(s.stash, 'wire', 5); add(s.stash, 'fuse', 3); add(s.stash, 'cloth', 4); add(s.stash, 'bandage', 2); add(s.bag, 'food', 2);
  return { cash: 6000, quests: { ...s.quests, repair: true }, upgraded: false, stash: s.stash, bag: s.bag, safe: s.safe, equipment: s.equipment };
}
const yardReady = () => page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
async function open(village) {
  ctx = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  ctx.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
  await ctx.addInitScript(() => {
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const get = C.prototype.getParameter;
      C.prototype.getParameter = function (p) { return p === 0x8872 && window.__units ? window.__units : get.call(this, p); };
    }
  });
  page = await ctx.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(`[console] ${m.text()}`); });
  await page.goto(`https://station.test/?test=1${village ? '&sample=village' : ''}`);
  await page.waitForFunction(() => window.__bincov?.title);
  await page.evaluate(() => { window.__capTitle = new WeakRef(window.__bincov.title.debug().app.renderer); });
  await page.locator('[data-action="enter"]').click(); await yardReady();
  if (village) {
    await page.evaluate(fx => window.__station.reseed(() => {
      const { saveSession: s } = window.__bincov, t = s.prepareExpansionMutation(d => { for (const k of ['cash', 'quests', 'upgraded', 'stash', 'bag', 'safe', 'equipment']) d.profile[k] = structuredClone(fx[k]); });
      if (s.commitExpansionMutation(t) !== 'committed') throw new Error('fixture write failed');
    }), fixture());
    await yardReady();
  }
  await page.waitForTimeout(500);
}
async function restore(units) {
  await page.evaluate(n => { window.__units = n === 16 ? 0 : n; }, units);
  await page.evaluate(() => { window.__lose = window.__station.host.app.renderer.gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await page.waitForTimeout(500); await page.evaluate(() => window.__lose.restoreContext()); await page.waitForTimeout(900);
  return page.evaluate(() => window.__station.host.app.renderer.limits.maxBatchableTextures);
}
async function gc() { const c = await ctx.newCDPSession(page); for (let i = 0; i < 3; i++) { await c.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); } await c.detach(); }

/**
 * Listener owners on every batch-sampler group seen so far. Holds only WeakRefs/WeakMaps on the page. With `draw`,
 * then makes C5's scratch draw and remembers its render data (Pixi pools it; the test does not hold it).
 */
const sample = (label, draw = false) => page.evaluate(([label, draw]) => {
  const W = window, app = W.__station?.mounted ? W.__station.host.app : W.__bincovSample.host.app, r = app.renderer;
  const a = r.renderPipes.graphics._adaptor, title = W.__capTitle?.deref(), ta = title?.renderPipes.graphics._adaptor;
  const S = (W.__capOwners ??= { groups: {}, groupList: [], bindGroups: new WeakMap(), nextBindGroup: 0, shaders: [], probe: [] });
  const g0 = a.shader.resources.batchSamplers, units = r.limits.maxBatchableTextures;
  if (!S.groupList.some(x => x.ref.deref() === g0)) S.groupList.push({ units, ref: new WeakRef(g0) });
  const users = new Map(), use = (shader, who) => { if (shader) (users.get(shader) ?? users.set(shader, new Set()).get(shader)).add(who); };
  use(a.shader, 'graphics-adaptor');
  for (const v of Object.values(r.renderPipes.batch._batchersByInstructionSet)) for (const b of Object.values(v)) use(b?.shader, 'batch-pipe');
  for (const c of Object.values(r.graphicsContext._managedContexts.items)) use(c?._gpuData?.[r.uid]?.graphicsData?.batcher?.shader, 'product-render-data');
  for (const w of S.probe) use(w.deref()?.batcher?.shader, 'probe-render-data (test)');
  use(ta?.shader, 'title-graphics-adaptor');
  for (const v of Object.values(title?.renderPipes.batch._batchersByInstructionSet ?? {})) for (const b of Object.values(v)) use(b?.shader, 'title-batch-pipe');
  for (const shader of users.keys()) {
    let i = S.shaders.findIndex(x => x.ref.deref() === shader);
    if (i < 0) { S.shaders.push({ ref: new WeakRef(shader), units: shader.maxTextures ?? null, adaptor: shader === a.shader, title: !!ta && shader === ta.shader, first: label, firstUsers: [...users.get(shader)] }); i = S.shaders.length - 1; }
    for (const bg of shader._ownedBindGroups ?? []) if (!S.bindGroups.has(bg)) S.bindGroups.set(bg, { id: S.nextBindGroup++, shader: i });
  }
  const groups = S.groupList.map(({ units, ref }) => {
    const ev = ref.deref()?._events?.change, list = ev ? (Array.isArray(ev) ? ev : [ev]) : [];
    return { units, listeners: list.map(e => {
      const seen = S.bindGroups.get(e.context), sh = seen ? S.shaders[seen.shader] : null, alive = sh?.ref.deref();
      const now = alive ? users.get(alive) : null;
      return { bindGroup: seen?.id ?? null, shader: seen?.shader ?? null, kind: !sh ? 'unseen' : sh.adaptor ? 'graphics-shader' : sh.title ? 'title-graphics-shader' : 'default-shader', units: sh?.units ?? null,
        owner: now ? [...now].sort().join('+') : !sh ? 'never seen with a shader' : alive ? 'kept (no current user)' : 'collected shader',
        first: sh ? `${sh.first}: ${sh.firstUsers.join('+')}` : null };
    }) };
  });
  if (draw) {
    const s = W.__station.host.scene, G = s.curtain.constructor, RT = s.worldRT.constructor, g = new G();
    g.context.batchMode = 'no-batch'; g.rect(0, 0, 16, 16).fill(0xff0000).rect(16, 0, 16, 16).fill(0x00ff00);
    g.position.set(8, 8); g.tint = 0x808080; const t = RT.create({ width: 48, height: 48 });
    r.render({ container: g, target: t, clear: true, clearColor: 0x000000 });
    const rd = r.graphicsContext.getContextRenderData(g.context);
    if (!S.probe.some(w => w.deref() === rd)) S.probe.push(new WeakRef(rd));
    g.destroy({ context: true }); t.destroy(true);
  }
  const defaultShaders = S.shaders.filter(x => !x.adaptor && !x.title).map((x, i) => ({ units: x.units, alive: !!x.ref.deref(), first: `${x.first}: ${x.firstUsers.join('+')}` }));
  return { label, units, groups, defaultShaders };
}, [label, draw]);

async function trip(rows, label) {
  await page.keyboard.press('7');
  await page.locator('#station-yard >> label.world:has(input[value="buildings"])').click(); await page.locator('#station-yard >> #seed').fill('42'); await page.locator('[data-act="deploy"]').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 20000 }); await page.waitForTimeout(600);
  rows.push(await sample(label + '-village'));
  await page.evaluate(() => { window.__bincovSample.driver.freezeAI(true); window.__bincovSample.driver.placePlayer({ x: 208, y: 122 }, Math.PI / 2); });
  await watchOldPage(page);
  await page.keyboard.down('e'); try { await page.waitForFunction(() => window.__bincov.app.state === 'result', null, { timeout: 20000 }); } finally { await page.keyboard.up('e'); }
  // After the outro the yard walks in by itself and opens the raid's one report (#163).
  await page.waitForFunction(() => !document.querySelector('.coast-sample')); await yardReady();
  await page.waitForFunction(() => window.__station.host.ui.kind === 'report', null, { timeout: 8000 }); await yardReport(page); await page.locator('.report [data-act="close"]').click();
}
/** Default-shader listener identities per group; the graphics adaptor's Shader is made new on every context change. */
const ids = row => Object.fromEntries(row.groups.map(g => [g.units, g.listeners.filter(l => l.kind !== 'graphics-shader').map(l => l.bindGroup).sort((a, b) => a - b).join(',')]));
const compact = row => ({ label: row.label, units: row.units, groups: Object.fromEntries(row.groups.map(g => [g.units, g.listeners.map(l => `${l.kind}#${l.shader}:${l.owner}`)])) });

async function run(workload) {
  const row = { name: `${workload}: ${rounds}×(8,8,16,16) simulated capability switches`, status: 'running' }; report.steps.push(row);
  const errors0 = report.errors.length, rows = [], roundEnds = [];
  try {
    await open(workload === 'trip');
    assert.equal(await page.evaluate(() => window.__station.host.app.renderer.limits.maxBatchableTextures), 16, 'this 8/16 comparison requires native 16 capability');
    rows.push(await sample('start', workload === 'probe'));
    for (let i = 1; i <= rounds; i++) {
      for (const u of [8, 8, 16, 16]) {
        const label = `r${i}-${u}-${rows.length}`;
        assert.equal(await restore(u), u, 'restored capability');
        if (workload === 'trip') await trip(rows, label);
        if (workload === 'remount') { await page.evaluate(() => window.__station.remount(1)); await yardReady(); }
        rows.push(await sample(label, workload === 'probe'));
      }
      await gc(); const end = await sample(`r${i}-end-gc`); rows.push(end); roundEnds.push(end);
    }
    const last = roundEnds.at(-1), listeners = last.groups.flatMap(g => g.listeners);
    const pic = await page.evaluate(() => { const s = window.__station.host.scene, { pixels } = window.__station.host.app.renderer.extract.pixels(s.worldRT); let sum = 0, sq = 0, n = 0; for (let i = 0; i < pixels.length; i += 16) { const l = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3; sum += l; sq += l * l; n++; } const m = sum / n; return { mean: +m.toFixed(1), sd: +Math.sqrt(sq / n - m * m).toFixed(1) }; });
    const p0 = await page.evaluate(() => window.__station.host.debug.player.x); await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d');
    const walked = +((await page.evaluate(() => window.__station.host.debug.player.x)) - p0).toFixed(1);
    await page.screenshot({ path: resolve(out, `${workload}-after.png`) });
    const perCount = Object.entries(Object.groupBy(last.defaultShaders, d => d.units)).map(([u, l]) => [u, l.length]);
    row.detail = {
      listenersAfterGC: Object.fromEntries(last.groups.map(g => [g.units, g.listeners.length])),
      perRoundListenersAfterGC: roundEnds.map(r => Object.fromEntries(r.groups.map(g => [g.units, g.listeners.length]))),
      ownersAfterGC: Object.fromEntries(last.groups.map(g => [g.units, g.listeners.map(l => `${l.kind}#${l.shader}/${l.units}: ${l.owner} (first ${l.first})`)])),
      defaultShaders: last.defaultShaders, picture: pic, walked,
    };
    row.samples = rows.map(compact);
    // All outcomes are recorded before the first assertion stops the step (failure controls keep the full picture).
    row.detail.checks = {
      noReleasedOrUnknownShaderListener: listeners.every(l => l.owner !== 'collected shader' && l.owner !== 'never seen with a shader'),
      oneDefaultShaderPerCount: perCount.every(([, n]) => n === 1),
      sameDefaultShaderListenersEachRound: roundEnds.every(r => JSON.stringify(ids(r)) === JSON.stringify(ids(roundEnds[0]))),
      onlyCurrentGraphicsShader: JSON.stringify(listeners.filter(l => l.kind === 'graphics-shader').map(l => l.owner)) === '["graphics-adaptor"]',
      onlyTitleGraphicsShader: JSON.stringify(listeners.filter(l => l.kind === 'title-graphics-shader').map(l => l.owner)) === '["title-graphics-adaptor"]',
      yardDrawsAndWalks: pic.mean > 3 && pic.sd > 3 && walked > 8,
    };
    assert.deepEqual(listeners.filter(l => l.owner === 'collected shader' || l.owner === 'never seen with a shader').map(l => `${l.units}:${l.first}`), [], 'listeners left by released or unknown shaders');
    assert.ok(perCount.every(([, n]) => n === 1), 'one DefaultShader per texture count: ' + JSON.stringify(perCount));
    assert.deepEqual(roundEnds.map(ids), roundEnds.map(() => ids(roundEnds[0])), 'same default-shader listener identities at every round end');
    assert.deepEqual(listeners.filter(l => l.kind === 'graphics-shader').map(l => l.owner), ['graphics-adaptor'], 'only the current graphics adaptor Shader listens');
    assert.deepEqual(listeners.filter(l => l.kind === 'title-graphics-shader').map(l => l.owner), ['title-graphics-adaptor'], 'the title renderer adds only its graphics adaptor Shader');
    assert.ok(pic.mean > 3 && pic.sd > 3, 'world target not blank: ' + JSON.stringify(pic));
    assert.ok(walked > 8, `keyboard walk after the switches: ${walked}`);
    assert.deepEqual(report.errors.slice(errors0), [], 'page errors');
    row.status = 'passed'; console.log('PASS', row.name, JSON.stringify(row.detail.listenersAfterGC), JSON.stringify(row.detail.perRoundListenersAfterGC));
  } catch (e) {
    row.status = 'failed'; row.error = String(e.stack ?? e); row.samples ??= rows.map(compact);
    console.log('FAIL', row.name, e.message.split('\n')[0], row.detail ? JSON.stringify([row.detail.perRoundListenersAfterGC, row.detail.checks]) : '');
    await page?.screenshot({ path: resolve(out, `fail-${workload}.png`) }).catch(() => {});
  } finally { await ctx?.close().catch(() => {}); ctx = page = null; }
}

try {
  for (const w of workloads) { assert.ok(['probe', 'idle', 'remount', 'trip'].includes(w), 'workload: ' + w); await run(w); }
} finally {
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.steps.filter(s => s.status === 'passed').length, total: report.steps.length };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  console.log(report.summary, report.external.length ? report.external : '');
  if (report.summary.passed !== report.summary.total || report.external.length) process.exitCode = 1;
}
