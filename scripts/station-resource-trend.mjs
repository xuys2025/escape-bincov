/**
 * R3 resource identity and separated 60-round workloads. Initial helpers below are frozen copies of Sol R2's
 * fixtures/input/traversal/release gates; the original station-round2-recheck.mjs is not changed.
 * Usage: node --import tsx scripts/station-resource-trend.mjs --mode=remount|shared|context --rounds=60 --snapshots --out=<new dir>
 * --mode=probe records cold/first-return/context identities. Render-fixture prewarming is documented below;
 * it tests bounded resource domains, not gameplay correctness. PARTIAL exit 0 means sampling completed, not acceptance.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import * as D from '../src/domain.ts';
import { assertFrames } from './station-acceptance-gates.mjs';
import { readManagedTables, readPixiEvents } from './pixi-managed-gate.mjs';

const out = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'test-results/astra-resource-r3/probe'); await mkdir(out, { recursive: true });
// --html=<file> runs the same checks against another build (the saved pre-fix build for failure controls).
const htmlPath = process.argv.find(a => a.startsWith('--html='))?.slice(7) ?? 'dist/index.html';
let html = await readFile(htmlPath, 'utf8');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, browser: browser.version(), startedAt: new Date().toISOString(), methodology: 'Packaged offline build at https://station.test/ (routed, no network). Real session/localStorage, real DOM input in headless Chrome; phone sizes are viewport/touch emulation. ?test=1 fixtures: player placement, save seeding through SaveSession transactions while the yard is closed, player placement and save seeding only. Menu actions use real CDP touch or mouse input. Wall controls recompose the frozen render frame with culling disabled; lighting clock is fixed only for brightness comparison after timing. Village AI/exit placement is an explicit fixture. No mock Runtime or simulated raid result.', steps: [], errors: [], external: [] };
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
const until = async (fn, ms = 8000, label = 'condition', arg) => { await page.waitForFunction(fn, arg, { timeout: ms }).catch(() => { throw new Error(`timeout: ${label}`); }); };
const place = (x, y, d = 6) => page.evaluate(([x, y, d]) => window.__station.host.place(x, y, d), [x, y, d]);
const shot = name => page.screenshot({ path: resolve(out, `${name}.png`) });
const panel = () => page.evaluate(() => window.__station.host.ui.kind);
const framesIn = async ms => { const a = await page.evaluate(() => window.__station.host.frames); await page.waitForTimeout(ms); return (await page.evaluate(() => window.__station.host.frames)) - a; };
const walkIn = async keys => { for (const [k, ms] of keys) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); } };
// Additional independent checks: no product patches, real input for all menu actions.
const tap = async (x,y) => {const c=await ctx.newCDPSession(page);try{await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:31}]});await page.waitForTimeout(50);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await c.detach();}await page.waitForTimeout(120);};
const centre = async sel=>{const audit=await page.locator(sel).evaluate(async e=>{const before=e.getBoundingClientRect().toJSON(),animations=[];for(let p=e;p;p=p.parentElement)for(const a of p.getAnimations()){if(a.playState==='running'){animations.push({name:a.animationName,time:a.currentTime,owner:p.className});await a.finished.catch(()=>{});}}return{before,after:e.getBoundingClientRect().toJSON(),animations};});if(audit.animations.length){report.coverage.animationWaits??=[];report.coverage.animationWaits.push({selector:sel,...audit});}const b=await page.locator(sel).boundingBox();assert.ok(b,sel);return{x:b.x+b.width/2,y:b.y+b.height/2};};
const tapSel = async sel=>{const p=await centre(sel);await tap(p.x,p.y);};
const menu = ()=>page.evaluate(()=>window.__station.host.ui.menuOpen);
const powerFixture = p=>preset(p==='restored'?'repaired':'parts');
// Exact composition without advancing simulation. The reference relights and renders every wall at the same frozen frame, including culled walls.
// It bypasses the culling/lighting-call branch, while L1 separately tests the lighting formula on actual pixels.
function auditWalls({pixels=false,negative=false}={}) {
 const sc=window.__station.host.scene,r=window.__station.host.app.renderer;
 const all=sc.uprights.filter(u=>u.wall&&u.sprite.visible), v=sc.view,c=sc.cam;
 const rows=all.map(u=>{const b=u.sprite.getLocalBounds();return{id:u.wall.x+','+u.wall.y,owner:u.wall.owner,renderable:u.sprite.renderable,x:u.sprite.x+b.x-c.x,y:u.sprite.y+b.y-c.y,w:b.width,h:b.height};});
 const inside=a=>a.x<v.w&&a.x+a.w>0&&a.y<v.h&&a.y+a.h>0;
 const missing=rows.filter(a=>inside(a)&&!a.renderable), seen=rows.filter(a=>inside(a)&&a.renderable).map(a=>a.id);
 let different=0;
 if(pixels){
  const redraw=()=>{r.render({container:sc.groundRoot,target:sc.worldRT,clear:true,clearColor:0x0a0c0e});r.render({container:sc.lightRoot,target:sc.lightRT,clear:true,clearColor:0});r.render({container:sc.lightHolder,target:sc.worldRT,clear:false});r.render({container:sc.upperRoot,target:sc.worldRT,clear:false});r.render({container:sc.depthGlow,target:sc.glowRT,clear:true,clearColor:0});r.render({container:sc.glowHolder,target:sc.worldRT,clear:false});r.render({container:sc.glowRoot,target:sc.worldRT,clear:false});};
  const a=new Uint8Array(r.extract.pixels(sc.worldRT).pixels), flags=all.map(u=>u.sprite.renderable);
  if(negative){const u=all.find((u,i)=>rows[i].owner==='yard'&&inside(rows[i])&&rows[i].renderable);if(!u)throw Error('no visible yard wall for negative');u.sprite.renderable=false;}
  else for(const u of all){u.sprite.renderable=true;if(u.lit&&typeof sc.lightWall==='function'){u.lit.tints.fill(-1);sc.lightWall(u);}}
  redraw();const b=r.extract.pixels(sc.worldRT).pixels;
  for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])different++;
  all.forEach((u,i)=>u.sprite.renderable=flags[i]);redraw();
 }
 return{cam:{...c},viewport:{w:v.w,h:v.h},walls:rows.length,culled:rows.filter(a=>!a.renderable).length,seen,missing,different};
}
async function traverse(pixelChecks=false){
 const cells=await page.evaluate(()=>{const h=window.__station.host,out=[];for(const y of [2.5,7.5,12.5,17.5,22.5])for(const x of [2.5,8.5,14.5,20.5,26.5,32.5]){let p=null;for(let d=0;d<=4&&!p;d++)for(let dy=-d;dy<=d&&!p;dy++)for(let dx=-d;dx<=d&&!p;dx++){const a=x+dx,b=y+dy;if(a>=1.5&&a<=33.5&&b>=1.5&&b<=23.5&&!h.col.blocked(a*32,b*32))p=[a,b];}if(!p)throw Error('no legal camera point');out.push(p);}return out;});
 const seen=new Set(),rows=[];
 for(const at of cells){await place(...at);await page.waitForTimeout(100);const a=await page.evaluate(auditWalls,{pixels:pixelChecks});rows.push({at,...a,seenCount:a.seen.length});for(const id of a.seen)seen.add(id);assert.deepEqual(a.missing,[],'visible bounds culled');assert.equal(a.different,0,'all-wall pixel control exposes missing drawing');}
 await place(17.5,18.6);await page.waitForTimeout(1500);
 const expected=await page.evaluate(()=>window.__station.host.scene.uprights.filter(u=>u.wall&&u.sprite.visible).map(u=>u.wall.x+','+u.wall.y));
 assert.deepEqual(expected.filter(id=>!seen.has(id)),[],'traversal missed wall population');
 return{points:cells,wallPopulation:expected.length,visited:seen.size,rows:pixelChecks?rows:undefined};
}
const measures=async()=>{const c=await ctx.newCDPSession(page);await c.send('HeapProfiler.collectGarbage');await c.detach();await page.waitForTimeout(200);return page.evaluate(source=>{const h=window.__station.host,s=h.scene;return{...window.__station.counts(),scene:s.textures.size,wallFrameGroups:(()=>{if(!(s.wallCellTextures instanceof Map)||!s.wallCellTextures.size||!(s.masonry instanceof Map))throw Error('wall cache contract missing');return s.wallCellTextures.size;})(),wallFrames:s.wallCellTextures?[...s.wallCellTextures.values()].reduce((n,a)=>n+a.length,0):null,masonry:s.masonry?.size??null,tables:(0,eval)('('+source+')')(h.app.renderer)};},readManagedTables.toString());};
const retain = ()=>page.evaluate(()=>{const h=window.__station.host,s=h.scene;window.__round2Released={app:new WeakRef(h.app),scene:new WeakRef(s),frames:s.wallCellTextures?[...s.wallCellTextures.values()].flat().map(t=>new WeakRef(t)):[],sources:[...s.textures.values()].map(t=>new WeakRef(t.source))};});
const released=async()=>{const a=await page.evaluate(()=>{const w=window.__round2Released,s=w.scene.deref();return{scene:s?{textures:s.textures.size,npc:s.npcCanvases.size,frames:s.wallCellTextures?.size??null,masonry:s.masonry?.size??null,targets:[s.worldRT,s.lightRT,s.glowRT].map(t=>t.destroyed)}:null,frames:w.frames.map(w=>w.deref()).filter(Boolean).map(t=>t.destroyed),sources:w.sources.map(w=>w.deref()).filter(Boolean).map(t=>t.destroyed)};});if(a.scene){assert.equal(a.scene.textures,0);assert.equal(a.scene.npc,0);assert.equal(a.scene.frames,0);assert.equal(a.scene.masonry,0);assert.deepEqual(a.scene.targets,[true,true,true]);}assert.ok(a.frames.every(Boolean));assert.ok(a.sources.every(Boolean));return a;};
const compare=(a,b)=>{for(const k of ['listeners','tickers','views','apps','parked','roots','canvases'])assert.equal(b[k],a[k],k);assert.ok(b.gpuTextures<=a.gpuTextures+2,'fully visited GPU resources grew');for(const t of b.tables.tables){const old=a.tables.tables.find(x=>x.name===t.name);assert.ok(old);assert.ok(t.live<=old.live+2,t.name+' live grew');assert.ok(t.empty<=old.empty,t.name+' empty grew');}};

// R3 keeps Sol's action/traversal/release helpers above. The original R script is unchanged.
import {installProbe,inventory,warmVariants,markRelease,checkRelease} from './station-resource-probe.mjs';
const mode=process.argv.find(a=>a.startsWith('--mode='))?.slice(7)??'probe';
const rounds=Number(process.argv.find(a=>a.startsWith('--rounds='))?.slice(9)??60);
const snapshots=process.argv.includes('--snapshots');
let cdp;
report.mode=mode;report.rounds=rounds;report.buildSHA256=createHash('sha256').update(html).digest('hex');
report.protocol={viewport:[1280,720],seed:42,warmupRounds:3,coverage:'30 legal camera points / 194 wall positions; current facility/power fixture; 8 directions x 5 body/rim frames; gates open/closed; current NPC pose frame/rim variants',
  sampling:'after action + same variant/traversal warm + home position (17.5,18.6), 1500ms settle; three CDP GCs separated by 200ms; CDP Performance JSHeapUsedSize; no live JSHandles or console argument collection',
  separation:'fresh offline context per process/mode; remount-only, shared-trip-only and context-only series not pooled; warmups excluded; exact packaged HTML',
  caution:'render fixtures are resource prewarm only; existing real menu input/real extraction transactions unchanged; snapshots on rounds 0/30/60 when enabled'};
report.rows=[];report.strictFailures=[];report.ownershipFailures=[];
async function gc(){await cdp.send('Runtime.releaseObjectGroup',{objectGroup:'resource-probe'});for(let i=0;i<3;i++){await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(200);}}
async function sample(label,detail=false){
  await gc();
  const metrics=await cdp.send('Performance.getMetrics');
  const counts=await page.evaluate(src=>{const h=window.__station.host,s=h.scene;return {...window.__station.counts(),scene:s.textures.size,wallFrameGroups:s.wallCellTextures.size,wallFrames:[...s.wallCellTextures.values()].reduce((n,a)=>n+a.length,0),tables:(0,eval)('('+src+')')(h.app.renderer)};},readManagedTables.toString());
  counts.heap=metrics.metrics.find(m=>m.name==='JSHeapUsedSize').value;
  const objects=await page.evaluate(inventory,{paths:detail});
  const row={label,counts,objects};
  if(detail) await writeFile(resolve(out,label+'-identities.json'),JSON.stringify(row,null,2));
  return row;
}
async function snapshot(label){
  const chunks=[],onChunk=e=>chunks.push(e.chunk);cdp.on('HeapProfiler.addHeapSnapshotChunk',onChunk);
  try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false,captureNumericValue:false});}
  finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',onChunk);}
  const data=chunks.join('');await writeFile(resolve(out,label+'.heapsnapshot'),data);
  report.snapshots??=[];report.snapshots.push({label,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
async function warm(){const variants=await page.evaluate(warmVariants);const coverage=await traverse();return{variants,coverage};}
async function trip(){
  await page.evaluate(markRelease);await retain();await page.keyboard.press('7');
  await page.locator('#station-yard >> label.world:has(input[value="buildings"])').click();await page.locator('#station-yard >> #seed').fill('42');await page.locator('[data-act="deploy"]').click();
  await page.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch,null,{timeout:20000});
  assert.equal(await page.evaluate(()=>window.__round2Released.app.deref()===window.__bincovSample.host.app),true);
  const freed=await released();
  await page.evaluate(()=>{window.__bincovSample.driver.freezeAI(true);window.__bincovSample.driver.placePlayer({x:208,y:122},Math.PI/2);});
  await page.keyboard.down('e');try{await page.waitForFunction(()=>window.__bincov.app.state==='result',null,{timeout:20000});}finally{await page.keyboard.up('e');}
  await page.waitForFunction(()=>!document.querySelector('.coast-sample'));
  await page.waitForFunction(()=>window.__station.counts().parked===1&&window.__station.counts().apps===0);
  const parked=await page.evaluate(src=>{const a=window.__round2Released.app.deref();return{children:a.stage.children.length,ticker:a.ticker.started,attached:a.canvas.isConnected,events:(0,eval)('('+src+')')(a.renderer),tables:a.renderer.gc._managedResourceHashes.map(d=>({name:d.context.name,live:Object.values(d.context[d.hash]).filter(Boolean).length,empty:Object.values(d.context[d.hash]).filter(x=>x===null).length}))};},readPixiEvents.toString());
  assert.equal(parked.children,0);assert.equal(parked.ticker,false);assert.equal(parked.attached,false);assert.equal(parked.events.attached,false);assert.equal(parked.events.native,0);assert.ok(Object.values(parked.events.roots).every(v=>!v));assert.ok(parked.tables.every(t=>t.empty===0));
  await page.locator('[data-action="return"]').click();await yardReady();await until(()=>window.__station.host.ui.kind==='report',8000);await page.locator('.report [data-act="close"]').click();
  return{freed,parked};
}
async function remount(){await page.evaluate(markRelease);await page.evaluate(()=>window.__station.remount(1));await yardReady();}
async function context(){
  await page.evaluate(()=>{window.__lose=window.__station.host.app.renderer.gl.getExtension('WEBGL_lose_context');if(!window.__lose)throw Error('No lose extension');window.__lose.loseContext();});
  await page.waitForTimeout(500);const lostFrames=await framesIn(300);
  await page.evaluate(()=>window.__lose.restoreContext());await page.waitForTimeout(900);const restoredFrames=await framesIn(300);assert.ok(lostFrames>5&&restoredFrames>5);return{lostFrames,restoredFrames};
}
const strict=(a,b,label)=>{try{compare(a,b);}catch(e){report.strictFailures.push({label,error:e.message});}};
function ownerChecks(base,row){
  const checks=[];const check=(name,ok)=>{if(!ok)checks.push(name);};
  check('exact scene texture key population',JSON.stringify(base.objects.textures.map(t=>t.key).sort())===JSON.stringify(row.objects.textures.map(t=>t.key).sort()));
  check('wall group count',row.counts.wallFrameGroups===base.counts.wallFrameGroups);check('wall frame count',row.counts.wallFrames===base.counts.wallFrames);
  for(const key of ['listeners','tickers','views','apps','parked','roots','canvases'])check(key,row.counts[key]===base.counts[key]);
  check('same renderer identity',row.objects.rendererId===base.objects.rendererId);
  if(row.release){check('no undestroyed view-owned resource',row.release.liveUndestroyed.length===0);check('released caches empty',!row.release.sceneCaches||Object.values(row.release.sceneCaches).every(n=>n===0));}
  // Not a new PASS threshold: exact warmed per-table populations, plus identity output for any deviations.
  for(const t of row.counts.tables.tables){const b=base.counts.tables.tables.find(b=>b.name===t.name);check(t.name+' exact live',t.live===b.live);check(t.name+' exact empty',t.empty===b.empty);}
  if(checks.length)report.ownershipFailures.push({label:row.label,checks});
}
try{
  await open({fixture:preset('repaired'),q:'&sample=village'});cdp=await ctx.newCDPSession(page);await cdp.send('Performance.enable');
  await page.evaluate(installProbe);await page.evaluate(()=>window.__resourcePhase='cold');await traverse();
  report.initial=await sample('cold',true);
  if(mode==='probe'){
    await page.evaluate(()=>window.__resourcePhase='first-trip');report.firstAction=await trip();await traverse();report.firstReturn=await sample('first-return',true);strict(report.initial.counts,report.firstReturn.counts,'first-return');
    for(let i=1;i<=3;i++){await page.evaluate(i=>window.__resourcePhase='restore-'+i,i);await context();await traverse();const row=await sample('restore-'+i,true);report.rows.push(row);strict(report.firstReturn.counts,row.counts,row.label);}
    await remount();await traverse();report.final=await sample('final-remount',true);report.release=await page.evaluate(checkRelease);
  }else{
    assert.ok(['remount','shared','context'].includes(mode));const action=mode==='remount'?remount:mode==='shared'?trip:context;
    report.prewarm=await warm();report.warmups=[];
    for(let i=1;i<=3;i++){await page.evaluate(i=>window.__resourcePhase='warmup-'+i,i);await action();await warm();report.warmups.push(await sample('warmup-'+i));}
    report.baseline=await sample('round-0',true);if(snapshots)await snapshot('round-0');
    for(let i=1;i<=rounds;i++){
      await page.evaluate(i=>window.__resourcePhase='round-'+i,i);const actionResult=await action();await warm();const row=await sample('round-'+i,i===rounds);
      if(mode!=='context')row.release=await page.evaluate(checkRelease);
      row.action=actionResult;strict(report.baseline.counts,row.counts,row.label);ownerChecks(report.baseline,row);
      // Full identities are retained in the Node report, not on the game page.
      report.rows.push(row);console.log(mode,i,row.counts.heap,row.counts.gpuTextures,row.counts.tables.live,row.counts.tables.empty);
      if(snapshots&&(i===30||i===rounds))await snapshot('round-'+i);
      await writeFile(resolve(out,'progress.json'),JSON.stringify({mode,done:i,heap:row.counts.heap,strictFailures:report.strictFailures.length,ownershipFailures:report.ownershipFailures.length}));
    }
    if(mode==='context'){await remount();await warm();report.afterFinalRemount=await sample('after-final-remount',true);report.release=await page.evaluate(checkRelease);}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.frameAudit,[]);assert.deepEqual(report.external,[]);
}catch(e){report.fatal=String(e.stack??e);process.exitCode=1;console.error(report.fatal);}
finally{
  report.finishedAt=new Date().toISOString();report.status=report.fatal?'INCOMPLETE':report.strictFailures.length||report.ownershipFailures.length?'PARTIAL':'BOUNDED_CHECKS_PASS_HEAP_PENDING';
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));await cdp?.detach().catch(()=>{});await ctx?.close().catch(()=>{});await browser.close();console.log(report.status);
}
