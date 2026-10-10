// Ordinary packaged entry: inject browser resource faults; no product test hooks.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { decodeSession } from '../src/recovery-store.ts';
import { readPixiEvents } from './pixi-managed-gate.mjs';
const out = resolve(process.env.BINCOV_LIFECYCLE_OUT || 'test-results/coast-lifecycle');
await mkdir(out, { recursive: true });
const report = { at: new Date().toISOString(), checks: [], requests: [] };
report.method = 'First four original checks: ordinary offline entry, no product test hooks. Fifth additional check: explicit test=1 read-only Runtime time and weak-release probe. All use real yard departure controls and native WEBGL_lose_context; no yard-frame proxy for raid time.';
report.viewport = process.env.BINCOV_LIFECYCLE_WIDE ? [1920,1080] : [1280,720];
report.html = process.env.BINCOV_LIFECYCLE_HTML || 'dist/index.html';
report.buildSHA256 = createHash('sha256').update(await readFile(report.html)).digest('hex');
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const key = 'escape-bincov.session.v2';
async function open(test = false) {
  const ctx = await browser.newContext({ viewport: process.env.BINCOV_LIFECYCLE_WIDE ? { width: 1920, height: 1080 } : { width: 1280, height: 720 }, offline: true });
  ctx.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  const p = await ctx.newPage(); p.setDefaultTimeout(6000);
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => {
    window.__life = { fault: '', contexts: [], writes: [], faults: [] };
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args) {
      const result = get.apply(this, args);
      if (result && /webgl/.test(args[0]) && !window.__life.contexts.some(x => x.canvas === this))
        window.__life.contexts.push({ canvas: this, gl: result });
      return result;
    };
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value) {
      if (window.__life.fault === 'asset' && value.startsWith('data:image/png') && !this.hasAttribute('data-weapon-icon')) {
        window.__life.faults.push({kind:'asset',stage:'cold-image-src'});
        window.__life.fault = ''; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return;
      }
      src.set.call(this, value);
    } });
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    const decodedPNGs = new WeakSet();
    CanvasRenderingContext2D.prototype.drawImage = function(...args) {
      // The yard has already decoded the coast PNG set. Test failure while the raid copies one of those
      // decoded assets, rather than accidentally failing the unrelated HUD weapon-icon Image.src.
      if (window.__life.fault === 'asset' && decodedPNGs.has(args[0]) && document.querySelector('.coast-sample canvas')) {
        window.__life.faults.push({kind:'asset',stage:'cached-PNG-copy',sourceSize:[args[0].width,args[0].height]});
        window.__life.fault = ''; throw Error('injected cached asset copy failure');
      }
      if (window.__life.fault === 'view' && document.querySelector('.coast-sample canvas')) {
        window.__life.faults.push({kind:'view',stage:'view-drawImage'});
        window.__life.fault = ''; throw Error('injected view texture failure');
      }
      const result = draw.apply(this, args);
      if (args[0] instanceof HTMLImageElement && args[0].src.startsWith('data:image/png')) decodedPNGs.add(this.canvas);
      return result;
    };
    const observe = ResizeObserver.prototype.observe;
    ResizeObserver.prototype.observe = function(target, ...args) {
      if (window.__life.fault === 'observer' && target.matches('.coast-sample')) {
        window.__life.faults.push({kind:'observer',stage:'mount-observe'});
        window.__life.fault = ''; throw Error('injected mount observer failure');
      }
      return observe.call(this, target, ...args);
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (k === 'escape-bincov.session.v2') {
        if (window.__life.fault === 'save') { window.__life.writes.push('QuotaExceededError'); throw new DOMException('injected write failure', 'QuotaExceededError'); }
        window.__life.writes.push('written');
      }
      return set.call(this, k, v);
    };
  });
  await p.goto(pathToFileURL(resolve(process.env.BINCOV_LIFECYCLE_HTML || 'dist/index.html')).href + '?sample=village' + (test ? '&test=1' : ''));
  await p.locator('[data-action="enter"]').click();
  await departure(p);
  return { ctx, p, errors };
}
async function departure(p) {
  // Current ordinary entry is the yard; do not escape to old tabs or use test entry parameters.
  await p.locator('#station-yard [data-quick="deploy"]').waitFor({state:'visible',timeout:20000});
  await p.locator('#station-yard [data-quick="deploy"]').click();
  await p.locator('#station-yard label.world:has(input[value="buildings"])').click();
  await p.locator('#station-yard #seed').fill('42');
}
const deploy = p => p.locator('#station-yard [data-act="deploy"]').click();
const clock = p => p.locator('.coast-sample [data-time]').textContent();
const bytes = p => p.evaluate(k => localStorage.getItem(k), key);
async function check(name, fn) {
  const s = { name }; report.checks.push(s);
  try { Object.assign(s, await fn()); s.status = 'passed'; }
  catch (e) { s.status = 'failed'; s.failure = e.stack; process.exitCode = 1; }
  console.log(s.status, name, s.failure?.split('\n')[0] || '');
  await writeFile(resolve(out, 'lifecycle.json'), JSON.stringify(report, null, 2) + '\n');
}
try {
  for (const fault of ['asset', 'view', 'observer']) await check(`startup-${fault}-cleanup-and-retry`, async () => {
    const { ctx, p, errors } = await open();
    try {
      await p.evaluate(f => { window.__life.fault = f; }, fault);
      await deploy(p);
      await p.waitForSelector('[data-action="enter"]');
      const saved = await bytes(p); decodeSession(saved);
      const roots = await p.locator('.coast-sample').count();
      report.checks.at(-1).beforeRetry = { roots, errors: [...errors] };
      const consumed=await p.evaluate(()=>window.__life.faults);
      assert.equal(consumed.length,1,'startup fault must be consumed exactly once');
      assert.equal(consumed[0].kind,fault,'fault must hit the intended startup boundary');
      await p.locator('[data-action="enter"]').click();
      await p.waitForSelector('.coast-sample [data-do="resume"]');
      assert.equal(await p.locator('.coast-sample').count(), 1);
      assert.equal(roots, 0);
      assert.equal(JSON.parse(await bytes(p)).expansion.raid.runId, JSON.parse(saved).expansion.raid.runId);
      assert.equal(errors.filter(e => /already has a Runtime/.test(e)).length, 0);
      return { rootsAfterFailure: roots, sameRunResumed: true, expectedErrors: errors };
    } finally { report.checks.at(-1).errors = errors; report.checks.at(-1).faultState=await p.evaluate(()=>({armed:window.__life.fault,consumed:window.__life.faults})).catch(()=>null); await p.screenshot({path:resolve(out,`startup-${fault}-last-state.png`)}).catch(()=>{}); await ctx.close(); }
  });
  await check('ordinary-context-loss-native-restore-and-settlement', async () => {
    const { ctx, p, errors } = await open();
    try {
      await deploy(p);
      await p.waitForSelector('.coast-sample canvas'); await p.waitForTimeout(600);
      assert.deepEqual(await p.evaluate(() => [typeof window.__bincov, typeof window.__bincovSample]), ['undefined', 'undefined']);
      const initialClock = await clock(p); await p.waitForTimeout(2300);
      assert.notEqual(await clock(p), initialClock, 'ordinary in-raid HUD clock advances before loss (positive control)');
      await p.screenshot({path:resolve(out,'context-before-loss.png')});
      await p.evaluate(() => {
        const c = window.__life.contexts.find(x => x.canvas.closest('.coast-sample'));
        window.__life.live = c;
        window.__life.loss = c.gl.getExtension('WEBGL_lose_context'); window.__life.loss.loseContext();
      });
      await p.waitForSelector('.coast-sample [data-panel]:not([hidden])'); await p.waitForTimeout(150);
      const paused = await bytes(p); decodeSession(paused);
      const lostClock = await clock(p);
      await p.keyboard.press('Escape');
      await p.evaluate(() => document.querySelector('[data-do="resume"]')?.click());
      assert.equal(await p.locator('[data-do="resume"]').isEnabled(), false);
      await p.keyboard.down('d');
      await p.waitForTimeout(2300);
      assert.ok((await bytes(p)) === paused, 'context loss must keep the world and saved time frozen');
      assert.equal(await clock(p), lostClock, 'in-raid HUD logical clock freezes while context is lost');
      await p.evaluate(() => window.__life.loss.restoreContext());
      await p.waitForFunction(() => !window.__life.live.gl.isContextLost()); await p.waitForTimeout(200);
      assert.equal(await p.evaluate(() => window.__life.live.canvas === document.querySelector('.coast-sample canvas')), true, 'same canvas restored');
      await p.screenshot({ path: resolve(out, 'context-restored-paused.png') });
      assert.ok(await p.locator('[data-do="resume"]').isVisible());
      await p.waitForTimeout(2300);
      assert.equal(await bytes(p), paused, 'restored canvas must remain paused with a held movement key');
      assert.equal(await clock(p), lostClock, 'restored in-raid clock remains paused before explicit resume');
      await p.keyboard.up('d');
      await p.locator('[data-do="resume"]').click(); await p.waitForTimeout(2300);
      const resumed = decodeSession(await bytes(p));
      assert.ok(resumed.expansion.raid.elapsed > JSON.parse(paused).expansion.raid.elapsed);
      assert.notEqual(await clock(p), lostClock, 'in-raid HUD clock advances after explicit resume');
      await p.screenshot({path:resolve(out,'context-restored-running.png')});
      await p.keyboard.press('Escape');
      const beforeEnd = await bytes(p);
      await p.evaluate(() => { window.__life.fault = 'save'; });
      await p.locator('[data-do="abandon"]').click(); await p.locator('[data-do="abandon-yes"]').click();
      await p.waitForSelector('[data-do="retry-settlement"]');
      assert.equal(await bytes(p), beforeEnd);
      assert.equal(await p.locator('.coast-sample').count(), 1);
      await p.evaluate(() => { window.__life.fault = ''; });
      await p.locator('[data-do="retry-settlement"]').click();
      await p.waitForSelector('[data-action="return"]');
      assert.equal(await p.locator('.coast-sample').count(), 0);
      const terminal = decodeSession(await bytes(p)); assert.equal(terminal.profile.activeRun, null);
      const released = await p.evaluate(() => ({ attached:window.__life.live.canvas.isConnected, roots:document.querySelectorAll('.coast-sample').length }));
      assert.equal(released.attached, false, 'settlement detaches the retired raid canvas');
      assert.equal(released.roots, 0, 'settlement removes raid view');
      await p.locator('[data-action="return"]').click();
      await p.locator('#station-yard .report [data-act="close"]').click({timeout:20000});
      await departure(p); await deploy(p); await p.waitForSelector('.coast-sample canvas');
      assert.deepEqual(errors, []);
      return { hooksAbsent: true, lostFrozen: true, heldMovementBlocked: true, nativeRestored: true, restoredRemainedPaused: true, failedSettlementRetained: true, nextRaidMounted: true, initialClock, lostClock, pausedElapsed:JSON.parse(paused).expansion.raid.elapsed, resumedElapsed:resumed.expansion.raid.elapsed, released };
    } finally { report.checks.at(-1).errors = errors; await p.screenshot({path:resolve(out,'context-last-state.png')}).catch(()=>{}); await ctx.close(); }
  });
  await check('direct-raid-runtime-time-freeze-restore-and-release', async () => {
    // Additional direct observation; the four original cases above remain ordinary and require hooks absent.
    const {ctx,p,errors}=await open(true);
    // The production Runtime port intentionally hides mutable core fields. Its published stamp is assigned
    // directly from core.elapsed; observing the last consumed batch neither advances nor republishes it.
    const state=()=>p.evaluate(()=>{const h=window.__bincovSample.host,b=h.lastBatch;return{elapsed:b.stamp.simulationTime,phase:b.frame.phase,player:{x:b.frame.player.x,y:b.frame.player.y},hp:b.frame.hud.hp,frames:h.stats.frames};});
    try {
      await deploy(p);await p.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch);
      const running=await state();assert.ok([running.elapsed,running.player.x,running.player.y,running.hp].every(Number.isFinite),'published Runtime values must exist');await p.waitForTimeout(500);assert.ok((await state()).elapsed>running.elapsed+.1,'real Runtime advances before loss');
      await p.evaluate(()=>{const c=window.__life.contexts.find(x=>x.canvas.closest('.coast-sample'));window.__life.live=c;window.__life.loss=c.gl.getExtension('WEBGL_lose_context');window.__life.loss.loseContext();});
      await p.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.phase==='paused');
      const lost=await state();await p.keyboard.down('d');await p.waitForTimeout(900);const lostEnd=await state();
      assert.equal(lostEnd.elapsed,lost.elapsed,'exact Runtime.elapsed frozen while lost');assert.deepEqual(lostEnd.player,lost.player);assert.equal(lostEnd.hp,lost.hp);assert.equal(lostEnd.phase,'paused');
      await p.evaluate(()=>window.__life.loss.restoreContext());await p.waitForFunction(()=>!window.__life.live.gl.isContextLost());await p.waitForTimeout(200);
      const restored=await state();await p.waitForTimeout(900);const pausedEnd=await state();
      assert.equal(restored.elapsed,lost.elapsed);assert.equal(pausedEnd.elapsed,lost.elapsed,'exact Runtime.elapsed frozen after native restore');assert.deepEqual(pausedEnd.player,lost.player);assert.equal(pausedEnd.phase,'paused');
      await p.locator('[data-do="resume"]').click();await p.waitForTimeout(600);const resumed=await state();assert.equal(resumed.phase,'running');assert.ok(resumed.elapsed>pausedEnd.elapsed+.1);assert.deepEqual(resumed.player,pausedEnd.player,'held movement remains suppressed on resume');await p.keyboard.up('d');
      await p.keyboard.press('Escape');await p.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.phase==='paused');
      await p.evaluate(()=>{const h=window.__bincovSample.host,v=h.view;window.__life.retired={host:new WeakRef(h),runtime:new WeakRef(h.runtime),view:new WeakRef(v),app:new WeakRef(h.app),targets:[v.worldRT,v.lightRT,v.upRT].map(t=>({texture:new WeakRef(t),source:new WeakRef(t.source)}))};});
      await p.locator('[data-do="abandon"]').click();await p.locator('[data-do="abandon-yes"]').click();await p.locator('[data-action="return"]').waitFor();await p.waitForFunction(()=>!document.querySelector('.coast-sample'));
      const cdp=await ctx.newCDPSession(p);for(let i=0;i<3;i++){await cdp.send('HeapProfiler.collectGarbage');await p.waitForTimeout(200);}await cdp.detach();
      const released=await p.evaluate(src=>{const w=window.__life.retired,a=w.app.deref(),status=(r,k)=>{const x=r.deref();return !x?'collected':x[k]?'released':'alive';};let runtime='collected';const port=w.runtime.deref();if(port){try{port.current();runtime='alive';}catch(e){runtime=e.message==='Runtime disposed.'?'released':String(e);}}return{host:status(w.host,'closed'),runtime,view:status(w.view,'destroyed'),targets:w.targets.map(t=>({texture:status(t.texture,'destroyed'),source:status(t.source,'destroyed')})),stage:a.stage.children.length,ticker:a.ticker.started,attached:a.canvas.isConnected,events:(0,eval)('('+src+')')(a.renderer),counts:window.__bincovSample.counts()};},readPixiEvents.toString());
      for(const k of ['host','runtime','view'])assert.notEqual(released[k],'alive',k+' released or collected');assert.ok(['collected','released'].includes(released.runtime),'Runtime must be collected or reject current() specifically as disposed');assert.ok(released.targets.every(t=>t.texture!=='alive'&&t.source!=='alive'));assert.equal(released.stage,0);assert.equal(released.ticker,false);assert.equal(released.attached,false);assert.equal(released.events.attached,false);assert.equal(released.events.native,0);assert.ok(Object.values(released.events.roots).every(v=>!v));assert.equal(released.counts.apps,0);assert.equal(released.counts.views,0);assert.deepEqual(errors,[]);
      return{method:'Explicit test=1 read-only Runtime/weak-release probe, same real yard departure and UI resume/abandon; no clock mutation or simulated settlement',running,lost,lostEnd,restored,pausedEnd,resumed,released};
    } finally {report.checks.at(-1).errors=errors;await p.screenshot({path:resolve(out,'direct-runtime-last-state.png')}).catch(()=>{});await ctx.close();}
  });
} finally { await browser.close(); }
assert.deepEqual(report.requests, []);
report.finishedAt = new Date().toISOString();
report.summary = {passed:report.checks.filter(c=>c.status==='passed').length,total:report.checks.length};
await writeFile(resolve(out,'lifecycle.json'),JSON.stringify(report,null,2)+'\n');
