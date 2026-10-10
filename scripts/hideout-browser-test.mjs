/** Offline production build; real localStorage/session facade. Only fixtures use ?test=1 hooks. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve('test-results/hideout-browser'); await mkdir(out, { recursive: true });
const html = await readFile('dist/index.html', 'utf8');
const browser = await chromium.launch(browserOptions);
const report = { browser: browser.version(), startedAt: new Date().toISOString(), methodology: 'Real offline release HTML, real session and localStorage. Test-only hooks seed facilities and inject quota; no prototype renderer or image acceptance.', steps: [], errors: [], external: [] };
const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
await context.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: new URL(r.request().url()).pathname === '/peer' ? '<!doctype html><title>Peer</title>' : html }));
context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.errors.push(e.stack));
const action = name => page.locator(`[data-action="${name}"]`);
async function step(name, fn) {
 const row = { name, status: 'running' }; report.steps.push(row);
 try { row.detail = await fn(); assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); row.status = 'passed'; console.log('PASS', name); }
 catch(e) { row.status = 'failed'; row.error = String(e.stack); throw e; }
}
const get = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const fault = enabled => page.evaluate(enabled => {
 window.__write ??= Storage.prototype.setItem;
 Storage.prototype.setItem = enabled ? function(k,v) { if(k === 'escape-bincov.session.v2') throw new DOMException('fixture', 'QuotaExceededError'); return window.__write.call(this,k,v); } : window.__write;
}, enabled);
try {
 await step('normal offline entry has no test globals; default old shortcut shares upgraded v2', async () => {
  await page.goto('https://station.test/'); await action('enter').click();
  assert.equal(await page.evaluate(() => '__bincov' in window), false);
  const r = await page.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2'))); assert.equal(r.version,4); assert.equal(r.expansion.version,2); assert.equal(r.profile.cash,700);
  await page.screenshot({ path: resolve(out,'ordinary-1280.png') });
  await page.goto('https://station.test/?test=1&entry=tabs'); await action('enter').click();
  assert.equal((await get()).storage.upgradeRequired,false);
 });
 await step('facade buy and old tab use the same profile; cart itself is disposable', async () => {
  const before = await get();
  const result = await page.evaluate(() => {
   const r=window.__bincov.hideoutRuntime, cart=r.openShop('arms'); window.__cart=cart;
   const item=cart.view().catalog.items.find(i=>i.id==='ammo9'); return cart.place('merchant','buy',item.uid,0,0);
  }); assert.equal(result.ok,true); assert.deepEqual((await get()).profile,before.profile);
  assert.equal(await page.evaluate(()=>window.__cart.settle().ok),true); assert.equal((await get()).profile.cash,before.profile.cash-84);
  await page.locator('[data-action="tab"][data-id="arms"]').click();
  assert.equal(await page.evaluate(()=>window.__bincov.app.save.cash),before.profile.cash-84);
 });
 await step('quota injection rolls back facility, cash and success events; retry is single', async () => {
  await page.evaluate(()=>{const {saveSession:s,hideoutRuntime:r}=window.__bincov; const t=s.prepareExpansionMutation(d=>{d.profile.quests.repair=true; d.profile.cash=5000; d.expansion.base.facilities.training=1; d.profile.stash.items.push({uid:'station-scrap',id:'scrap',qty:3,x:8,y:4});}); s.commitExpansionMutation(t); r.snapshot(); window.__events=[]; r.subscribe(e=>window.__events.push(e));});
  const before=await get(); await fault(true);
  assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.build('rest').reason),'storage');
  const after=await get(); assert.deepEqual(after.profile,before.profile); assert.deepEqual(after.base.facilities,before.base.facilities);
  assert.deepEqual(await page.evaluate(()=>window.__events.map(e=>e.type)),['save-failed']);
  await fault(false); assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.retrySave().ok),true);
  assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.build('rest').ok),true); assert.equal((await get()).base.facilities.rest,1);
 });
 await step('real five-second practice checkpoint failure retains export and blocks shortcut writes', async () => {
  assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.selectPractice('strength').ok),true); await fault(true);
  await page.evaluate(async()=>{
   const r=window.__bincov.hideoutRuntime; r.setActivity(true);
   for(let i=0;i<20;i++){await new Promise(resolve=>setTimeout(resolve,255)); const from={x:i%2?334:332,y:302},to={x:i%2?332:334,y:302}; r.practice({from,to,seconds:.25,now:Date.now()});}
   r.tick(Date.now()); r.setActivity(false);
  });
  assert.equal((await get()).storage.pendingBase,true); assert.equal((await get()).base.training.activeSeconds,0);
  const backup=await page.evaluate(()=>JSON.parse(window.__bincov.hideoutRuntime.exportBackup())); assert.equal(backup.record.expansion.base.training.activeSeconds,5);
  await fault(false); assert.equal(await page.evaluate(()=>window.__bincov.saveSession.setVolume(.12)),false);
  assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.retrySave().ok),true); assert.equal((await get()).base.training.activeSeconds,5);
 });
 await step('prepared departure survives reload during animation without duplicate run count', async () => {
  const before=(await get()).profile.stats.runs;
  const start=await page.evaluate(()=>window.__bincov.hideoutRuntime.deploy({world:'buildings',seed:'42'})); assert.equal(start.ok,true);
  assert.equal((await get()).phase,'departing'); assert.equal((await get()).profile.stats.runs,before+1);
  await page.goto('https://station.test/?test=1&entry=tabs&sample=village'); await page.waitForFunction(()=>window.__bincov);
  assert.equal(await page.evaluate(()=>window.__bincov.app.save.activeRun.runId),start.runId);
  assert.equal(await page.evaluate(()=>window.__bincov.app.save.stats.runs),before+1);
  await action('enter').click(); await page.waitForFunction(()=>window.__bincovSample?.host?.runtime);
  assert.equal(await page.evaluate(()=>window.__bincov.app.game.scene.isActive('Raid')),false);
  return {runId:start.runId};
 });
 await step('real city settlement disposes host; return marker is nonpersistent and single-use', async () => {
  // Resumed sample starts paused. Its real abandon/confirm controls execute normal settlement and disposal.
  await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
  await action('return').waitFor(); assert.equal(await page.evaluate(()=>window.__bincov.app.coastSample),null);
  const result=await page.evaluate(()=>window.__bincov.hideoutRuntime.returnToBase()); assert.equal(result.ok,true);
  assert.ok((await get()).arrival); assert.ok(await page.evaluate(()=>window.__bincov.hideoutRuntime.consumeArrival()));
  assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.consumeArrival()),null);
  await page.reload(); await action('enter').click(); assert.equal((await get()).arrival,null);
 });
 await step('animation-complete bridge starts the existing city host exactly once', async () => {
  const start=await page.evaluate(()=>window.__bincov.hideoutRuntime.deploy({world:'buildings',seed:'42'})); assert.equal(start.ok,true);
  assert.equal(await page.evaluate(id=>window.__bincov.startPreparedHideoutRaid(id),start.runId),true);
  assert.equal(await page.evaluate(id=>window.__bincov.startPreparedHideoutRaid(id),start.runId),false);
  assert.equal(await page.evaluate(()=>window.__bincov.app.game.scene.isActive('Raid')),false);
  // Leave the active raid durable and reload into menu, keeping its checkpoint for the conflict assertion.
  await page.reload(); await page.waitForFunction(()=>window.__bincov);
 });
 await step('real storage peer conflict is read-only and keeps the latest bytes', async () => {
  const peer=await context.newPage(); await peer.goto('https://station.test/peer');
  const raw=await page.evaluate(()=>localStorage.getItem('escape-bincov.session.v2'));
  await peer.evaluate(raw=>localStorage.setItem('escape-bincov.session.v2',raw+' '),raw);
  await page.waitForFunction(()=>window.__bincov.app.conflict);
  assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.setVolume(.3).reason),'conflict');
  assert.equal(await page.evaluate(()=>window.__bincov.hideoutRuntime.retrySave().reason),'conflict');
  assert.equal(await page.evaluate(()=>localStorage.getItem('escape-bincov.session.v2')),raw+' '); await peer.close();
 });
 report.status='passed';
} catch(e) {report.status='failed';report.failure=String(e.stack);process.exitCode=1; console.error(e); await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{report.finishedAt=new Date().toISOString(); await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)); await context.close(); await browser.close();}
