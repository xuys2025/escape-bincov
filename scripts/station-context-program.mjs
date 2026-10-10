/**
 * ASTRA-R3 context-restore lifetimes on the packaged build: the old yard render targets' managed slots, and the
 * graphics program kept across WebGL context restores (ASTRA-R3-PIXI-01). The yard stays mounted on the real
 * renderer; WEBGL_lose_context loses and restores the context.
 * Phase C emulates a device whose restored context reports fewer texture units: a getParameter shim in the test
 * browser (MAX_TEXTURE_IMAGE_UNITS only, while window.__units is set). It changes no game code.
 * The draw check renders a non-batched Graphics (batchMode 'no-batch', so Pixi's graphics adaptor draws it) with a
 * position and tint into a scratch target and reads the pixels back, so the program, its uniforms and its samplers
 * are exercised in the current context. Scratch draws happen after the slot readings of the same probe.
 * Usage: node scripts/station-context-program.mjs [--html=dist/index.html] [--out=test-results/opus-r3/program]
 *        [--reference=<report.json of a run on the pre-fix build>]
 * With --reference, each kept program's source (graphics-N suffix normalised) must equal the source Pixi itself
 * compiled for the same texture count in that run. Exit 1 on any failed check. On the pre-fix build (saved copy of
 * ce732ff6) this is the failure control: S1, S2, P1, C2 and C3 fail there; C1, C4 and R1 pass on both builds.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = resolve(arg('out') ?? 'test-results/opus-r3/program'); await mkdir(out, { recursive: true });
const htmlPath = arg('html') ?? 'dist/index.html', html = await readFile(htmlPath, 'utf8');
const reference = arg('reference') ? JSON.parse(await readFile(arg('reference'), 'utf8')) : null;
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, buildSHA256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), startedAt: new Date().toISOString(), steps: [], probes: [], errors: [], external: [] };
let ctx, page;

async function open() {
  const wide=process.argv.includes('--wide');
  ctx = await browser.newContext({ offline: true, viewport: wide ? {width:1920,height:1080} : { width: 1280, height: 720 }, deviceScaleFactor: 1 });
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
  await page.goto('https://station.test/?test=1');
  await page.locator('[data-action="enter"]').click();
  await page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
  await page.waitForTimeout(500);
  report.viewport=page.viewportSize();
  report.hardware=await page.evaluate(()=>{const gl=window.__station.host.app.renderer.gl,e=gl.getExtension('WEBGL_debug_renderer_info');return{version:gl.getParameter(gl.VERSION),vendor:e?gl.getParameter(e.UNMASKED_VENDOR_WEBGL):null,renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null};});
  await page.screenshot({path:resolve(out,'yard-before-restores.png')});
}
async function step(name, fn) {
  const row = { name, status: 'running' }; report.steps.push(row);
  const errors0 = report.errors.length;
  try { row.detail = await fn(); assert.deepEqual(report.errors.slice(errors0), [], 'page errors'); row.status = 'passed'; console.log('PASS', name, JSON.stringify(row.detail).slice(0, 300)); }
  catch (e) { row.status = 'failed'; row.error = String(e.stack ?? e); console.log('FAIL', name, e.message); await page.screenshot({ path: resolve(out, `fail-${report.steps.length}.png`) }).catch(() => {}); }
}

/** Old targets' uids, the glTexture table (keys, nulls), and the timing/activity of the host. */
const slots = () => page.evaluate(() => {
  const h = window.__station.host, s = h.scene, r = h.app.renderer;
  const d = r.gc._managedResourceHashes.find(d => d.context.name === 'glTexture'), t = d.context[d.hash];
  const keys = Object.keys(t), empty = keys.filter(k => t[k] === null);
  return { targets: [s.worldRT, s.lightRT, s.glowRT].map(x => x.source.uid), keys:keys.map(Number), empty: empty.length, live: keys.length - empty.length, emptyKeys: empty.map(Number), time: h.time, frames: h.frames, active: h.active };
});
const has = (uids, keys) => uids.filter(u => keys.includes(u));
/** The previous targets after three CDP GCs: 'collected', 'destroyed' (still reachable but released) or 'alive'. */
async function oldTargets() {
  const cdp = await ctx.newCDPSession(page);
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); }
  await cdp.detach();
  return page.evaluate(() => window.__oldTargets.map(o => Object.fromEntries(Object.entries(o).map(([k, w]) => { const x = w.deref(); return [k, !x ? 'collected' : x.destroyed ? 'destroyed' : 'alive']; }))));
}
async function lose() {
  await page.evaluate(() => { window.__lose = window.__station.host.app.renderer.gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => ({ time: window.__station.host.time, frames: window.__station.host.frames, active: window.__station.host.active, lost: window.__station.host.app.renderer.gl.isContextLost() }));
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => ({ time: window.__station.host.time, frames: window.__station.host.frames, active: window.__station.host.active }));
  return { lost: a.lost, activeWhileLost: b.active, framesWhileLost: b.frames - a.frames, secondsWhileLost: +(b.time - a.time).toFixed(3) };
}
async function restore() {
  await page.evaluate(() => window.__lose.restoreContext());
  await page.waitForTimeout(900);
  return page.evaluate(() => ({ lost: window.__station.host.app.renderer.gl.isContextLost(), active: window.__station.host.active, maxBatchable: window.__station.host.app.renderer.limits.maxBatchableTextures }));
}
/** The adaptor's program identity (WeakRef list, not a strong page array) and a real draw through it. */
const probe = label => page.evaluate(label => {
  const h = window.__station.host, s = h.scene, r = h.app.renderer, gl = r.gl;
  const a = r.renderPipes.graphics._adaptor, p = a.shader.glProgram, refs = (window.__programRefs ??= []);
  let index = refs.findIndex(w => w.deref() === p); if (index < 0) { refs.push(new WeakRef(p)); index = refs.length - 1; }
  const samplers = a.shader.resources.batchSamplers;
  const groups = (window.__samplerRefs ??= []);
  if (!groups.some(x=>x.ref.deref()===samplers)) groups.push({units:r.limits.maxBatchableTextures,ref:new WeakRef(samplers)});
  const ownerShaders=[['graphics',a.shader],...Object.entries(r.renderPipes.batch._batchersByInstructionSet).flatMap(([id,v])=>Object.entries(v).map(([name,b])=>['batch:'+id+':'+name,b.shader]))];
  const samplerGroups=groups.map(({units,ref})=>{const group=ref.deref(),events=group?._events?.change,es=events?(Array.isArray(events)?events:[events]):[];return{units,listeners:group?.listenerCount('change')??null,owners:es.map(e=>({type:e.context?.constructor?.name,matched:ownerShaders.filter(([,s])=>s?._ownedBindGroups?.includes(e.context)).map(([name])=>name),resources:e.context?.resources?Object.values(e.context.resources).map(v=>v?._resourceType??null):null}))};});
  const G = s.curtain.constructor, RT = s.worldRT.constructor;
  const g = new G(); g.context.batchMode = 'no-batch';
  g.rect(0, 0, 16, 16).fill(0xff0000).rect(16, 0, 16, 16).fill(0x00ff00).rect(0, 16, 32, 16).fill(0x0000ff);
  g.position.set(8, 8); g.tint = 0x808080;
  const t = RT.create({ width: 48, height: 48 });
  while (gl.getError()) { /* clear */ }
  r.render({ container: g, target: t, clear: true, clearColor: 0x000000 });
  const { pixels, width } = r.extract.pixels(t), at = (x, y) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
  const pd = r.shader._programDataHash[p._key];
  let uniformErrors = 0; const samplerValues = [];
  if (pd) {
    for (const n in pd.uniformData) { gl.getUniform(pd.program, pd.uniformData[n].location); if (gl.getError()) uniformErrors++; }
    for (let i = 0; i < r.limits.maxBatchableTextures; i++) { const loc = gl.getUniformLocation(pd.program, `uTextures[${i}]`); samplerValues.push(loc ? gl.getUniform(pd.program, loc) : null); }
  }
  const glError = gl.getError();
  g.destroy({ context: true }); t.destroy(true);
  const norm = x => x.replace(/(SHADER_NAME graphics-(?:vertex|fragment))(?:-\d+)?$/gm, '$1');
  return {
    label, adaptorIsSubclass: Object.getPrototypeOf(a.constructor) !== Function.prototype, programIndex: index, programsSeen: refs.length,
    shaderName: /SHADER_NAME (\S+)/.exec(p.fragment)?.[1], samplerArray: Number(/uTextures\[(\d+)\]/.exec(p.fragment)?.[1]),
    maxBatchable: r.limits.maxBatchableTextures, source: { vertex: norm(p.vertex), fragment: norm(p.fragment) },
    gpu: pd ? { isProgram: gl.isProgram(pd.program), linked: gl.getProgramParameter(pd.program, gl.LINK_STATUS), uniforms: Object.keys(pd.uniformData).sort(), uniformErrors, samplerValues } : null,
    glError, samplerListeners: samplers.listenerCount('change'),
    samplerGroups,
    pixels: { red: at(16, 16), green: at(32, 16), blue: at(24, 32), outside: at(4, 4) },
  };
}, label);
const hash = s => createHash('sha256').update(s).digest('hex');
function record(p) { const { source, ...rest } = p; const row = { ...rest, vertexSHA256: hash(source.vertex), fragmentSHA256: hash(source.fragment) }; report.probes.push(row); return row; }
function drawOk(p) {
  assert.ok(p.gpu, 'program data for the current context');
  assert.equal(p.gpu.isProgram && p.gpu.linked, true, 'linked WebGLProgram in the current context');
  assert.equal(p.gpu.uniformErrors, 0, 'uniform locations belong to the current context'); assert.equal(p.glError, 0, 'GL error');
  assert.deepEqual(p.gpu.samplerValues, [...Array(p.maxBatchable).keys()], 'batch samplers bound to units 0..n-1');
  assert.equal(p.samplerArray, p.maxBatchable, 'program built for the current batch texture count');
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
  assert.ok(near(p.pixels.red, [128, 0, 0, 255]) && near(p.pixels.green, [0, 128, 0, 255]) && near(p.pixels.blue, [0, 0, 128, 255]) && near(p.pixels.outside.slice(0, 3), [0, 0, 0]),
    'tinted, translated draw: ' + JSON.stringify(p.pixels));
}

try {
  await open();
  report.limits = await page.evaluate(() => ({ maxTextures: window.__station.host.app.renderer.limits.maxTextures, maxBatchable: window.__station.host.app.renderer.limits.maxBatchableTextures }));

  // Placeholders of live sources that were not drawn again since the restore come and go with the animation (the
  // 60-round runs warm every variant first); this checks identities: no slot of any target the yard has replaced.
  const history = new Set();
  await step('S1 context restore: old render-target slots dropped', async () => {
    const rows = [], first = await slots(); first.targets.forEach(u => history.add(u));
    for (let i = 1; i <= 4; i++) {
      await page.evaluate(() => { const s = window.__station.host.scene; window.__oldTargets = [s.worldRT, s.lightRT, s.glowRT].map(t => ({ texture: new WeakRef(t), source: new WeakRef(t.source) })); });
      const before = await slots(), lost = await lose(), back = await restore(); await page.waitForTimeout(300);
      const after = await slots(); after.targets.forEach(u => history.add(u));
      const stale = has([...history].filter(u => !after.targets.includes(u)), after.emptyKeys);
      const retainedTargetKeys=has([...history].filter(u=>!after.targets.includes(u)),after.keys);
      const released = await oldTargets();
      rows.push({ cycle: i, oldTargets: before.targets, newTargets: after.targets, staleTargetSlots: stale, retainedTargetKeys, empty: after.empty, live: after.live, released, ...lost, restored: back });
      assert.deepEqual(stale, [], `cycle ${i}: replaced target placeholders left`);
      assert.deepEqual(retainedTargetKeys,[],`cycle ${i}: old target uid still present (live or null)`);
      assert.ok(released.every(r => r.texture !== 'alive' && r.source !== 'alive'), 'old targets destroyed or collected: ' + JSON.stringify(released));
      assert.ok(after.targets.every(u => !before.targets.includes(u)), 'targets replaced');
      assert.ok(lost.lost && lost.framesWhileLost > 5 && lost.secondsWhileLost > 0.2 && lost.activeWhileLost === false, 'frames and clock run, practice paused while lost');
      assert.ok(!back.lost && back.active, 'active again after restore');
    }
    return { initialEmpty: first.empty, rows };
  });

  await step('S2 window resize: replaced render targets leave no placeholders', async () => {
    const rows = [];
    for (const [w, h] of [[1100, 700], [1920, 1080], [1280, 720]]) {
      const before = await slots(); await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400); const after = await slots();
      after.targets.forEach(u => history.add(u));
      rows.push({ size: [w, h], oldTargets: before.targets, newTargets: after.targets, empty: [before.empty, after.empty] });
      assert.deepEqual(has([...history].filter(u => !after.targets.includes(u)), after.emptyKeys), [], 'replaced target placeholders left');
      assert.deepEqual(has([...history].filter(u=>!after.targets.includes(u)),after.keys),[],'old resized target uid still present (live or null)');
      assert.ok(after.empty <= before.empty, 'placeholders grew');
    }
    return rows;
  });

  await page.setViewportSize(report.viewport); await page.waitForTimeout(500);
  await step('P1 graphics program kept across restores, rebound in each new context', async () => {
    const rows = [record(await probe('start'))];
    for (let i = 1; i <= 3; i++) { await lose(); await restore(); rows.push(record(await probe('restore-' + i))); }
    for (const p of rows) drawOk(p);
    assert.equal(rows[0].adaptorIsSubclass, true, 'kept-program adaptor registered');
    assert.deepEqual(rows.map(p => p.programIndex), [0, 0, 0, 0], 'same GlProgram object');
    assert.deepEqual(new Set(rows.map(p => p.shaderName)).size, 1, 'one program name');
    assert.ok(rows.every(p => p.samplerListeners === rows[0].samplerListeners), 'batch-sampler listeners grew: ' + rows.map(p => p.samplerListeners));
    return rows.map(({ label, programIndex, shaderName, samplerListeners, maxBatchable }) => ({ label, programIndex, shaderName, samplerListeners, maxBatchable }));
  });

  await step('C1 restored context with fewer texture units gets a program for that count', async () => {
    await page.evaluate(() => { window.__units = 8; }); await lose(); const back = await restore();
    const p = record(await probe('units-8')); drawOk(p);
    assert.equal(back.maxBatchable, 8); assert.equal(p.samplerArray, 8);
    return { maxBatchable: p.maxBatchable, programIndex: p.programIndex, shaderName: p.shaderName, samplerValues: p.gpu.samplerValues };
  });

  await step('C2 same reduced capability again reuses its program', async () => {
    await lose(); await restore(); const p = record(await probe('units-8-again')); drawOk(p);
    const c1 = report.probes.find(x => x.label === 'units-8');
    assert.equal(p.programIndex, c1.programIndex, 'program for 8 reused');
    return { programIndex: p.programIndex, shaderName: p.shaderName };
  });

  await step('C3 back to the full capability returns to the first program', async () => {
    await page.evaluate(() => { window.__units = 0; }); await lose(); await restore();
    const p = record(await probe('units-native')); drawOk(p);
    assert.equal(p.maxBatchable, report.limits.maxBatchable); assert.equal(p.programIndex, 0, 'first program reused');
    assert.equal(p.programsSeen, 2, 'two programs for two capabilities');
    return { programIndex: p.programIndex, programsSeen: p.programsSeen, shaderName: p.shaderName };
  });

  await step('C4 kept program sources equal Pixi\'s own compile per capability', async () => {
    const by = n => report.probes.filter(p => p.maxBatchable === n);
    const mine = Object.fromEntries([report.limits.maxBatchable, 8].map(n => [n, [...new Set(by(n).map(p => p.vertexSHA256 + ':' + p.fragmentSHA256))]]));
    for (const n in mine) assert.equal(mine[n].length, 1, `one source for ${n}`);
    if (!reference) return { sources: mine, reference: 'not given' };
    const theirs = Object.fromEntries(Object.keys(mine).map(n => [n, [...new Set(reference.probes.filter(p => p.maxBatchable === Number(n)).map(p => p.vertexSHA256 + ':' + p.fragmentSHA256))]]));
    for (const n in mine) assert.deepEqual(mine[n], theirs[n], `source for ${n} differs from the reference build`);
    return { sources: mine, reference: reference.buildSHA256 };
  });

  const switchRounds=Number(arg('switch-rounds')??0);
  if(switchRounds) await step('C5 repeated simulated capability switches: programs, actual draws and listener ownership', async()=>{
    assert.equal(report.limits.maxBatchable,16,'this 8/16 comparison requires native 16 capability');
    const rows=[];report.capabilitySwitch={simulated:true,rounds:switchRounds,rows};
    for(let i=1;i<=switchRounds;i++) for(const units of [8,8,16,16]){
      await page.evaluate(n=>{window.__units=n===16?0:n;},units);await lose();await restore();
      const p=record(await probe('switch-'+i+'-'+units+'-'+rows.length));drawOk(p);rows.push(p);
    }
    report.capabilitySwitch.programsStable=rows.every(p=>p.programsSeen===2&&p.programIndex===(p.maxBatchable===16?0:1));
    report.capabilitySwitch.sameCapabilityListenersStable=rows.every((p,i)=>!i||p.maxBatchable!==rows[i-1].maxBatchable||p.samplerListeners===rows[i-1].samplerListeners);
    const firstBy=Object.fromEntries([8,16].map(n=>[n,rows.find(p=>p.maxBatchable===n).samplerListeners]));
    report.capabilitySwitch.repeatedCapabilityListenersStable=rows.every(p=>p.samplerListeners===firstBy[p.maxBatchable]);
    assert.equal(report.capabilitySwitch.programsStable,true,'two graphics programs reused');
    assert.equal(report.capabilitySwitch.sameCapabilityListenersStable,true,'same capability recovery listener growth');
    assert.equal(report.capabilitySwitch.repeatedCapabilityListenersStable,true,'repeated capability switch listener growth; owner evidence retained');
    return{programsStable:true,sameCapabilityListenersStable:true,repeatedCapabilityListenersStable:true};
  });

  await step('R1 yard still draws and takes input after the restores', async () => {
    const pic = await page.evaluate(() => { const s = window.__station.host.scene, r = window.__station.host.app.renderer, { pixels } = r.extract.pixels(s.worldRT); let sum = 0, sq = 0, n = 0; for (let i = 0; i < pixels.length; i += 16) { const l = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3; sum += l; sq += l * l; n++; } const m = sum / n; return { mean: +m.toFixed(1), sd: +Math.sqrt(sq / n - m * m).toFixed(1) }; });
    assert.ok(pic.mean > 3 && pic.sd > 3, 'world target not blank: ' + JSON.stringify(pic));
    await page.screenshot({path:resolve(out,'yard-after-restores-same-position.png')});
    const a = await page.evaluate(() => ({ ...window.__station.host.debug.player }));
    await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d');
    const b = await page.evaluate(() => ({ ...window.__station.host.debug.player }));
    assert.ok(b.x - a.x > 8, `keyboard walk after restore: ${a.x} -> ${b.x}`);
    await page.screenshot({ path: resolve(out, 'R1-after-restores.png') });
    return { picture: pic, walked: +(b.x - a.x).toFixed(1) };
  });
} finally {
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.steps.filter(s => s.status === 'passed').length, total: report.steps.length };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await ctx?.close().catch(() => {}); await browser.close();
  console.log(report.summary, report.external.length ? report.external : '');
  if (report.summary.passed !== report.summary.total || report.external.length) process.exitCode = 1;
}
