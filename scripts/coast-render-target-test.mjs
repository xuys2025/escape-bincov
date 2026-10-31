// Real packaged sample, targeted RT ownership checks. No total-heap or original R/K sign-off.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { readManagedTables, readPixiEvents } from './pixi-managed-gate.mjs';
import { atRaidRelease, releasedState, watchOldPage, yardReport } from './yard-entry.mjs';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = resolve(option('out', 'test-results/coast-render-targets'));
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
const size = process.argv.includes('--wide') ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { html: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), size,
  method: 'Offline packaged game; real yard departure, viewport ResizeObserver, native WEBGL_lose_context and UI settlement. Explicit test=1 only for weak resource identity, setViewTiles coverage, AI freezing and player placement. Each replaced source uid checked individually; no heap threshold.', checks: [], errors: [], requests: [] };
const context = await browser.newContext({ offline: true, viewport: size });
await context.route('https://targets.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://targets.test/')) report.requests.push(r.url()); });
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on('pageerror', e => report.errors.push(String(e.stack)));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
const cdp = await context.newCDPSession(page);
const tables = () => page.evaluate(source => (0, eval)(`(${source})`)(window.__bincovSample.host?.app.renderer ?? window.__targetProbe.renderer.deref()), readManagedTables.toString());

async function check(name, fn) {
  const row = { name }; report.checks.push(row);
  try { await fn(row); row.status = 'passed'; }
  catch (error) { row.status = 'failed'; row.error = String(error.stack); process.exitCode = 1; await page.screenshot({ path: resolve(out, `failure-${report.checks.length}.png`) }).catch(() => {}); }
  console.log(row.status, name, row.error?.split('\n')[0] ?? '');
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
async function deploy() {
  await page.locator('#station-yard [data-quick="deploy"]').click();
  await page.locator('#station-yard label.world:has(input[value="buildings"])').click();
  await page.locator('#station-yard #seed').fill('42');
  await page.locator('#station-yard [data-act="deploy"]').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
  await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  await page.waitForFunction(() => window.__bincovSample.host.stats.frames > 5);
}
const state = () => page.evaluate(() => {
  const h = window.__bincovSample.host, b = h.lastBatch;
  return { elapsed: b.stamp.simulationTime, phase: b.frame.phase, player: { x: b.frame.player.x, y: b.frame.player.y }, contextLost: h.contextLost };
});
async function pause() {
  if ((await state()).phase !== 'paused') await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'paused');
}
async function markTargets() {
  return page.evaluate(() => {
    const h = window.__bincovSample.host, v = h.view;
    const refs = [v.worldRT, v.lightRT, v.upRT].map(t => ({ uid: t.source.uid, texture: new WeakRef(t), source: new WeakRef(t.source) }));
    window.__targetProbe.current = refs;
    window.__targetProbe.retired.push(...refs);
    return refs.map(t => t.uid);
  });
}
async function waitTargetsChanged(old) {
  await page.waitForFunction(old => {
    const h = window.__bincovSample.host, r = h.app.renderer, v = h.view;
    const d = r.gc._managedResourceHashes.find(d => d.context.name === 'glTexture'), table = d.context[d.hash];
    return [v.worldRT, v.lightRT, v.upRT].every(t => t && !old.includes(t.source.uid) && table[t.source.uid] === t.source);
  }, old);
}
const targetState = () => page.evaluate(() => {
  const h = window.__bincovSample.host, r = h.app.renderer, v = h.view;
  const d = r.gc._managedResourceHashes.find(d => d.context.name === 'glTexture'), table = d.context[d.hash];
  const inspect = t => {
    const source = t.source.deref(), texture = t.texture.deref();
    return { uid: t.uid, slot: !Object.hasOwn(table, t.uid) ? 'absent' : table[t.uid] === null ? 'null' : 'live',
      textureReleased: !texture || texture.destroyed, sourceReleased: !source || source.destroyed, gpuReleased: !source || source._gpuData?.[r.uid] == null };
  };
  return { old: window.__targetProbe.current.map(inspect),
    current: [v.worldRT, v.lightRT, v.upRT].map(t => ({ uid: t.source.uid, live: table[t.source.uid] === t.source, destroyed: t.destroyed || t.source.destroyed })),
    sameRenderer: window.__targetProbe.renderer.deref() === r, count: window.__bincovSample.counts().renderTextures,
    textureSlots: { live: Object.values(table).filter(Boolean).length, empty: Object.values(table).filter(x => x === null).length } };
});
function assertTargets(row) {
  assert.equal(row.sameRenderer, true, 'same shared renderer');
  assert.equal(row.count, 3, 'exactly three current view targets');
  assert.ok(row.current.every(t => t.live && !t.destroyed), 'all current targets uploaded and alive');
  assert.ok(row.old.every(t => t.textureReleased && t.sourceReleased && t.gpuReleased), 'old texture/source/GPU resources released');
  assert.ok(row.old.every(t => t.slot === 'absent'), 'each destroyed target uid must leave the managed hash');
}
async function collect() {
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); }
}
const pixels = () => page.evaluate(() => {
  const h = window.__bincovSample.host, image = h.app.renderer.extract.pixels(h.view.upRT), data = image.pixels;
  let colored = 0; const colors = new Set();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 30 && data[i + 3] > 0) colored++;
    colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return { width: image.width, height: image.height, colored, colors: colors.size };
});

try {
  await page.goto('https://targets.test/?sample=village&test=1');
  await page.locator('[data-action="enter"]').click(); await deploy(); await pause();
  await page.evaluate(() => { const h = window.__bincovSample.host; window.__targetProbe = { renderer: new WeakRef(h.app.renderer), app: new WeakRef(h.app), retired: [], current: [] }; });
  report.initialTables = await tables();

  await check('20 actual viewport changes release each replaced target slot', async row => {
    row.samples = [];
    for (let i = 0; i < 20; i++) {
      const old = await markTargets();
      await page.setViewportSize(i % 2 ? size : { width: size.width - 80, height: size.height - 20 });
      await waitTargetsChanged(old); row.samples.push(await targetState());
    }
    row.samples.forEach(assertTargets);
  });

  await check('view-size changes release targets without deleting other live resources or null slots', async row => {
    // One explicitly test-owned RT creates a real unrelated null entry. It must survive the view's targeted cleanup.
    const probeUid = await page.evaluate(() => {
      const h = window.__bincovSample.host, t = h.view.worldRT.constructor.create({ width: 4, height: 4 });
      const uid = t.source.uid; h.app.renderer.texture.bind(t.source); t.destroy(true); return uid;
    });
    row.probeUid = probeUid; row.samples = [];
    try {
      for (let i = 0; i < 12; i++) {
        const old = await markTargets();
        const preservation = await page.evaluate(({ old, probeUid, tiles }) => {
          const h = window.__bincovSample.host, r = h.app.renderer;
          const before = r.gc._managedResourceHashes.map(d => ({ d, entries: Object.entries(d.context[d.hash]) }));
          h.view.setViewTiles(tiles);
          const changed = [], observed = {};
          for (const { d, entries } of before) {
            const table = d.context[d.hash]; observed[d.context.name] = entries.length;
            for (const [uid, resource] of entries) {
              if (d.context.name === 'glTexture' && old.includes(Number(uid))) continue;
              if (!Object.hasOwn(table, uid) || table[uid] !== resource) changed.push({ table: d.context.name, uid });
            }
          }
          const d = r.gc._managedResourceHashes.find(d => d.context.name === 'glTexture');
          return { changed, observed, unrelatedNullKept: Object.hasOwn(d.context[d.hash], probeUid) && d.context[d.hash][probeUid] === null };
        }, { old, probeUid, tiles: i % 2 ? 24 : 28 });
        await waitTargetsChanged(old); row.samples.push({ ...(await targetState()), preservation });
      }
      for (const sample of row.samples) {
        assert.deepEqual(sample.preservation.changed, [], 'every other table entry preserves its exact resource identity');
        assert.equal(sample.preservation.unrelatedNullKept, true, 'unrelated real released probe slot is not swept');
        assertTargets(sample);
      }
    } finally {
      // Remove only the test-owned sentinel, never a product entry or product-observed failure.
      await page.evaluate(uid => { const d = window.__bincovSample.host.app.renderer.gc._managedResourceHashes.find(d => d.context.name === 'glTexture'); if (d.context[d.hash][uid] === null) delete d.context[d.hash][uid]; }, probeUid);
    }
  });

  await check('six native context restores release old targets and preserve paused Runtime time', async row => {
    row.samples = [];
    for (let i = 0; i < 6; i++) {
      await pause(); const old = await markTargets(), before = await state();
      await page.evaluate(() => {
        window.__targetProbe.loss = window.__bincovSample.host.app.renderer.gl.getExtension('WEBGL_lose_context');
        if (!window.__targetProbe.loss) throw Error('WEBGL_lose_context unavailable');
        window.__targetProbe.loss.loseContext();
      });
      await page.waitForFunction(() => window.__bincovSample.host.contextLost);
      await page.waitForTimeout(200); const lost = await state();
      await page.evaluate(() => window.__targetProbe.loss.restoreContext());
      await page.waitForFunction(() => !window.__bincovSample.host.contextLost);
      await waitTargetsChanged(old); await page.waitForTimeout(200);
      row.samples.push({ ...(await targetState()), before, lost, restored: await state() });
    }
    for (const sample of row.samples) {
      assert.equal(sample.lost.elapsed, sample.before.elapsed); assert.equal(sample.restored.elapsed, sample.before.elapsed);
      assert.deepEqual(sample.restored.player, sample.before.player); assert.equal(sample.restored.phase, 'paused');
      assertTargets(sample);
    }
    await collect();
    row.release = await page.evaluate(() => ({ marked: window.__targetProbe.retired.length,
      texturesCollected: window.__targetProbe.retired.filter(t => !t.texture.deref()).length,
      sourcesCollected: window.__targetProbe.retired.filter(t => !t.source.deref()).length }));
    assert.equal(row.release.texturesCollected, row.release.marked, 'all retired textures collect');
    assert.equal(row.release.sourcesCollected, row.release.marked, 'all retired sources collect');
  });

  await check('restored world pixels and real keyboard input remain usable', async row => {
    await page.evaluate(() => window.__bincovSample.driver.placePlayer({ x: 640, y: 456 }, 0, 'coast'));
    await page.waitForFunction(() => { const p = window.__bincovSample.host.lastBatch.frame.player; return p.x === 640 && p.y === 456; });
    row.before = await state(); await page.locator('[data-do="resume"]').click();
    // Resume requests a Runtime transition; syncPanels suppresses keys held until its next published frame.
    // Start the movement only once the real pause panel has closed, as a fresh post-resume input.
    await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'running' && window.__bincovSample.host.panel === null);
    await page.keyboard.down('d');
    try { await page.waitForFunction(before => Math.hypot(window.__bincovSample.host.lastBatch.frame.player.x - before.x, window.__bincovSample.host.lastBatch.frame.player.y - before.y) > 3, row.before.player); }
    finally { await page.keyboard.up('d'); }
    row.after = await state(); assert.equal(row.after.phase, 'running'); assert.ok(row.after.elapsed > row.before.elapsed);
    await pause(); row.pixels = await pixels();
    assert.ok(row.pixels.colored > 1000 && row.pixels.colors > 32, 'restored render target contains actual world image');
    await page.screenshot({ path: resolve(out, 'restored-world.png') });
  });

  await check('real settlement, parked shared renderer and another yard departure release and rebuild cleanly', async row => {
    await pause(); await markTargets();
    await page.evaluate(() => { const h = window.__bincovSample.host; window.__targetProbe.host = new WeakRef(h); window.__targetProbe.view = new WeakRef(h.view); });
    // After the outro the yard walks in at once and takes the renderer back (#163): the parked state is read as the raid
    // lets go of it; what needs a garbage collection is checked once the yard is up (the raid's objects stay collectable).
    await watchOldPage(page);
    await atRaidRelease(page, ({ managed, events }) => {
      const w = window.__targetProbe, a = w.app.deref(), r = a.renderer;
      const d = r.gc._managedResourceHashes.find(d => d.context.name === 'glTexture'), table = d.context[d.hash];
      return { stage: a.stage.children.length, attached: a.canvas.isConnected, ticker: a.ticker.started,
        old: w.current.map(t => {
          const source = t.source.deref();
          return { uid: t.uid, absent: !Object.hasOwn(table, t.uid), sourceReleased: !source || source.destroyed, gpuReleased: !source || source._gpuData?.[r.uid] == null };
        }),
        tables: (0, eval)(`(${managed})`)(r), events: (0, eval)(`(${events})`)(r), counts: window.__bincovSample.counts() };
    }, { managed: readManagedTables.toString(), events: readPixiEvents.toString() });
    await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
    row.parked = await releasedState(page);
    assert.equal(row.parked.stage, 0); assert.equal(row.parked.attached, false); assert.equal(row.parked.ticker, false);
    assert.equal(row.parked.tables.empty, 0); assert.equal(row.parked.counts.renderTextures, 0);
    assert.equal(row.parked.events.attached, false); assert.equal(row.parked.events.native, 0);
    assert.ok(Object.values(row.parked.events.roots).every(v => !v));
    assert.ok(row.parked.old.every(t => t.absent && t.sourceReleased && t.gpuReleased));
    await yardReport(page);
    await collect();
    row.retired = await page.evaluate(() => { const w = window.__targetProbe; return { hostCollected: !w.host.deref(), viewCollected: !w.view.deref() }; });
    assert.deepEqual(row.retired, { hostCollected: true, viewCollected: true });
    await page.locator('#station-yard .report [data-act="close"]').click();
    row.yardSameRenderer = await page.evaluate(() => window.__station.host.app.renderer === window.__targetProbe.renderer.deref());
    assert.equal(row.yardSameRenderer, true);
    await collect();
    row.returnedRelease = await page.evaluate(() => window.__targetProbe.current.map(t => ({ uid: t.uid, textureCollected: !t.texture.deref(), sourceCollected: !t.source.deref() })));
    assert.ok(row.returnedRelease.every(t => t.textureCollected && t.sourceCollected), 'all retired targets collect after the next owner renders');
    await deploy(); await pause(); row.remounted = await targetState();
    assertTargets(row.remounted); row.pixels = await pixels();
    assert.ok(row.pixels.colored > 1000 && row.pixels.colors > 32);
    await page.screenshot({ path: resolve(out, 'next-raid.png') });
  });
  report.finalTables = await tables();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []);
} catch (error) {
  report.fatal = String(error.stack); process.exitCode = 1;
} finally {
  report.summary = { passed: report.checks.filter(c => c.status === 'passed').length, total: report.checks.length };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close(); console.log(report.summary, report.fatal ?? '');
}
