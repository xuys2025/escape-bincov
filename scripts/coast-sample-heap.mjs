// F20 heap regression for the village sample (OPUS-MEM-01). Repeats Sol's full cycle (base -> deploy -> stairs -> back
// -> extraction or abandonment -> result -> base), collects garbage through CDP after each cycle and takes heap
// snapshots at two cycles of an unminified copy of the packaged page, so constructors keep their names.
//
// It fails when any view, host, Runtime, Pixi application/renderer, texture, sprite or canvas instance accumulates
// between the snapshots, or when an explicit resource count is not zero after a cycle. The heap trend (Sol's statistic:
// mean of cycles 6-10 against the last five) and the largest self-size changes are reported, not used as a pass bar.
//
// Every wait returns a boolean. A truthy object result comes back as a JSHandle that the inspector keeps alive: Sol's
// F20 run waited on `host.lastBatch` that way, which pinned one PublishedView per cycle and inflated the trend.
//
//   pnpm build && node scripts/coast-sample-heap.mjs
//   BINCOV_HEAP_CYCLES=30 BINCOV_HEAP_SNAP=10,30 BINCOV_HEAP_KEEP=1 node scripts/coast-sample-heap.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_HEAP_OUT || 'test-results/coast-sample/heap'); await mkdir(out, { recursive: true });
const CYCLES = Number(process.env.BINCOV_HEAP_CYCLES || 20), SNAP = (process.env.BINCOV_HEAP_SNAP || '6,20').split(',').map(Number);
const TRACKED = /^_?(CoastSampleHost|CoastView|CoastRaidRuntime|InventoryPanel|Textures|Atlas|Fx|Lighting|Scope|Application|WebGLRenderer|Sprite|Container|Graphics|Texture|TextureSource|CanvasSource|ImageSource|RenderTexture|HTMLCanvasElement|WebGL2RenderingContext)\d?$/;

// Unminified copy of dist/index.html: same sources and loaders, only the script is swapped.
const packaged = await readFile('dist/index.html', 'utf8');
const bundle = await build({ entryPoints: ['src/main.ts'], bundle: true, write: false, minify: false, target: 'es2020', format: 'iife', loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
const at = packaged.lastIndexOf('<script>'), end = packaged.lastIndexOf('</script>');
const pagePath = resolve(out, 'unminified.html');
await writeFile(pagePath, packaged.slice(0, at + 8) + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + packaged.slice(end));

const browser = await chromium.launch({ ...browserOptions, args: [...browserOptions.args, '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
const requests = []; ctx.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
const p = await ctx.newPage(); p.setDefaultTimeout(15000);
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.goto(pathToFileURL(pagePath).href + '?test=1&sample=village');
const cdp = await ctx.newCDPSession(p);
const action = n => p.locator(`[data-action="${n}"]`);
const frames = (n = 4) => p.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const place = (x, y, map) => p.evaluate(([x, y, m]) => window.__bincovSample.driver.placePlayer({ x, y }, 0, m), [x, y, map]);
const gc = async () => { for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage'); };

async function snapshot(cycle) {
  const chunks = [], onChunk = e => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const text = chunks.join('');
  if (process.env.BINCOV_HEAP_KEEP) await writeFile(resolve(out, `cycle-${cycle}.heapsnapshot`), text);
  return summarize(JSON.parse(text));
}
/** Count and self size per "type:name" (objects are named by constructor); tracked classes are counted separately. */
function summarize(s) {
  const f = s.snapshot.meta.node_fields, types = s.snapshot.meta.node_types[0], n = f.length;
  const iType = f.indexOf('type'), iName = f.indexOf('name'), iSize = f.indexOf('self_size');
  const groups = new Map(), tracked = {}, shaderNames = new Set(); let total = 0, shaderStrings = 0;
  for (let i = 0; i < s.nodes.length; i += n) {
    const type = types[s.nodes[i + iType]], raw = s.strings[s.nodes[i + iName]];
    const name = type.includes('string') ? '(string)' : raw.slice(0, 80), size = s.nodes[i + iSize];
    // Compiled shader sources carry Pixi's per-compile name (graphics-vertex-12); one new copy per renderer was the leak.
    const shader = type.includes('string') && /#define SHADER_NAME (\S+)/.exec(raw);
    if (shader) { shaderStrings++; shaderNames.add(shader[1]); }
    const key = `${type}:${name}`, g = groups.get(key) ?? { count: 0, size: 0 };
    g.count++; g.size += size; total += size; groups.set(key, g);
    const cls = (type === 'object' || type === 'native') && raw.split(' ')[0];
    if (cls && TRACKED.test(cls)) tracked[cls] = (tracked[cls] ?? 0) + 1;
  }
  return { total, groups, tracked, shaderStrings, shaderNames: [...shaderNames].sort() };
}

const cycles = [], snaps = {};
await action('enter').click();
for (let i = 1; i <= CYCLES; i++) {
  await p.locator('#run-world').selectOption('buildings'); await p.locator('#seed').fill('42'); await action('deploy').click();
  await p.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch); await p.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  const map = i % 2 ? 'resident-f2' : 'resident-b1';
  await place(i % 2 ? 560 : 496, 272); await frames();
  await p.keyboard.press('e'); await p.waitForFunction(m => window.__bincovSample.host.lastBatch.stamp.world.mapId === m, map);
  await p.keyboard.press('e'); await p.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'coast');
  if (i % 2 === 0) { await place(208, 122); await frames(); await p.keyboard.down('e'); await p.waitForFunction(() => window.__bincov.app.state === 'result', {}, { timeout: 8000 }); await p.keyboard.up('e'); }
  else { await p.keyboard.press('Escape'); await p.locator('[data-do="abandon"]').click(); await p.locator('[data-do="abandon-yes"]').click(); await p.waitForFunction(() => window.__bincov.app.state === 'result'); }
  await p.waitForFunction(() => !document.querySelector('.coast-sample'));
  await action('return').click();
  await gc();
  const r = await p.evaluate(() => ({ heap: performance.memory.usedJSHeapSize, counts: window.__bincovSample.counts(), session: (localStorage.getItem('escape-bincov.session.v2') ?? '').length, outcome: window.__bincov.app.result?.outcome ?? null }));
  assert.equal(r.counts.parked, 1, `cycle ${i}: the renderer is parked for reuse`);
  if (i > 1) assert.ok(r.counts.gpuTextures <= cycles[0].counts.gpuTextures, `cycle ${i}: GPU textures ${r.counts.gpuTextures}`);
  for (const k of ['apps', 'views', 'listeners', 'tickers', 'observers', 'timers', 'renderTextures', 'liveViews', 'sampleRoots', 'atlasPages', 'largeTextures']) assert.equal(r.counts[k], 0, `cycle ${i}: ${k}`);
  cycles.push({ cycle: i, ...r });
  console.log('cycle', i, 'heap', r.heap, 'session chars', r.session);
  if (SNAP.includes(i)) snaps[i] = await snapshot(i);
}
const [a, b] = SNAP.map(i => snaps[i]);
const diff = [...new Set([...a.groups.keys(), ...b.groups.keys()])].map(k => {
  const x = a.groups.get(k) ?? { count: 0, size: 0 }, y = b.groups.get(k) ?? { count: 0, size: 0 };
  return { key: k, dCount: y.count - x.count, dSize: y.size - x.size, count: y.count, size: y.size };
}).filter(d => d.dSize || d.dCount).sort((x, y) => y.dSize - x.dSize);
const heaps = cycles.map(c => c.heap), mean = v => v.reduce((x, y) => x + y, 0) / v.length;
const trend = { afterWarmupMean: mean(heaps.slice(5, 10)), lastFiveMean: mean(heaps.slice(-5)) }; trend.growthBytes = trend.lastFiveMean - trend.afterWarmupMean;
const span = SNAP[1] - SNAP[0], perCycle = (b.total - a.total) / span;
// V8 compiled code and its metadata (JIT tiering) against everything else, which is where a view/host leak would land.
const isCode = d => d.key.startsWith('code:') || /^(native|object shape):system \/ (WeakArrayList|TrustedWeakFixedArray|Map)$/.test(d.key);
const codePerCycle = diff.filter(isCode).reduce((n, d) => n + d.dSize, 0) / span, otherPerCycle = diff.filter(d => !isCode(d)).reduce((n, d) => n + d.dSize, 0) / span;
const accumulated = Object.keys({ ...a.tracked, ...b.tracked }).filter(k => (b.tracked[k] ?? 0) > (a.tracked[k] ?? 0)).map(k => `${k} ${a.tracked[k] ?? 0} -> ${b.tracked[k]}`);
const report = { startedAt: new Date().toISOString(), browser: browser.version(), cycles: CYCLES, snapshots: SNAP, trend,
  selfSize: { [SNAP[0]]: a.total, [SNAP[1]]: b.total, perCycle, codePerCycle, otherPerCycle }, tracked: { [SNAP[0]]: a.tracked, [SNAP[1]]: b.tracked }, accumulated,
  sessionChars: [cycles[0].session, cycles.at(-1).session], perCycleHeap: cycles.map(c => ({ cycle: c.cycle, heap: c.heap, outcome: c.outcome })),
  shaderSources: { [SNAP[0]]: { strings: a.shaderStrings, names: a.shaderNames }, [SNAP[1]]: { strings: b.shaderStrings, names: b.shaderNames } },
  gpuTextures: cycles.map(c => c.counts.gpuTextures),
  growth: diff.slice(0, 30), shrink: diff.slice(-10), errors, requests };
await writeFile(resolve(out, 'heap-report.json'), JSON.stringify(report, null, 2));
console.log('heap trend, cycles 6-10 against the last five:', Math.round(trend.growthBytes), 'bytes');
console.log(`retained self size ${a.total} -> ${b.total}: ${Math.round(perCycle)} bytes per cycle (compiled code ${Math.round(codePerCycle)}, other ${Math.round(otherPerCycle)})`);
console.log('tracked instances', JSON.stringify(b.tracked));
console.log(`shader source strings ${a.shaderStrings} -> ${b.shaderStrings}; names ${b.shaderNames.join(', ')}`);
for (const d of diff.slice(0, 12)) console.log(String(d.dSize).padStart(9), String(d.dCount).padStart(6), d.key);
await cdp.detach(); await browser.close();
assert.deepEqual(accumulated, [], 'tracked instances accumulated between snapshots');
assert.equal(b.shaderStrings, a.shaderStrings, 'compiled shader sources accumulated between snapshots');
assert.deepEqual(b.shaderNames, a.shaderNames, 'new shader names were compiled between snapshots');
assert.deepEqual(errors, []); assert.deepEqual(requests, []);
console.log('PASS F20 heap: no tracked instance or shader source accumulates; explicit resource counts are zero after every cycle; one parked renderer');
