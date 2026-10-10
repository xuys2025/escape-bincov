/**
 * Station yard on the real Runtime (default hideout entry). Offline packaged build, real localStorage session, real
 * keyboard / mouse / touch input. ?test=1 only reads state, places the player and seeds save fixtures through the
 * session's own transaction (the yard is closed while a fixture is written, so no fixture plays an event).
 * Usage: node --import tsx scripts/station-round2-recheck.mjs --only=J,K --out=<new evidence directory>
 * Paired draw timing: --only=P --pair-old=<0abe402 HTML> --out=<separate directory>.
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

const out = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'test-results/station-round2-extra'); await mkdir(out, { recursive: true });
// --html=<file> runs the same checks against another build (the saved pre-fix build for failure controls).
const htmlPath = process.argv.find(a => a.startsWith('--html='))?.slice(7) ?? 'dist/index.html';
let html = await readFile(htmlPath, 'utf8');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, browser: browser.version(), startedAt: new Date().toISOString(), methodology: 'Packaged offline build at https://station.test/ (routed, no network). Real session/localStorage, real DOM input in headless Chrome; phone sizes are viewport/touch emulation. ?test=1 fixtures: player placement, save seeding through SaveSession transactions while the yard is closed, player placement and save seeding only. Menu actions use real CDP touch or mouse input. Wall controls recompose the frozen render frame with culling disabled; lighting clock is fixed only for brightness comparison after timing. Village AI/exit placement is an explicit fixture. No mock Runtime or simulated raid result.', steps: [], errors: [], external: [] };
report.buildSHA256 = createHash('sha256').update(html).digest('hex');
let ctx = null, page = null;
const traceInput = process.argv.includes('--input-trace');
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
  if (traceInput) await page.addInitScript(() => {
    const rows = [], ids = new WeakMap(); let next = 1;
    const id = e => { if (!e) return null; if (!ids.has(e)) ids.set(e, next++); return ids.get(e); };
    const add = x => { rows.push({ at: performance.now(), ...x }); if (rows.length > 4000) rows.shift(); };
    window.__solInputTrace = { rows, id, add };
    const roots = new WeakSet();
    setInterval(() => {
      const root = document.querySelector('#station-yard')?.shadowRoot; if (!root) return;
      if (roots.has(root)) return; roots.add(root);
      const close = () => [...root.querySelectorAll('.phead [data-act="close"]')].filter(e => e.getClientRects().length).map(e => ({ id:id(e), connected:e.isConnected, owner:e.closest('.panel,.modal')?.className }));
      new MutationObserver(ms => add({ type:'mutation', records:ms.length, removed:ms.reduce((n,m)=>n+m.removedNodes.length,0), close:close() })).observe(root, {childList:true,subtree:true});
      for (const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click','animationstart','animationend','animationcancel']) root.addEventListener(type, e => {
        const target = e.composedPath()[0], point = e.changedTouches?.[0] ?? e;
        add({type, trusted:e.isTrusted, target:id(target), connected:target.isConnected, action:target.closest?.('[data-act],[data-quick]')?.outerHTML.slice(0,500), x:point.clientX, y:point.clientY, animation:e.animationName, close:close()});
      }, true);
    }, 10);
  });
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
  if (traceInput && page && !page.isClosed()) row.inputTrace = await page.evaluate(() => {
    const root=document.querySelector('#station-yard')?.shadowRoot;
    return { rows:window.__solInputTrace?.rows ?? [], panel:window.__station?.host?.ui.kind,
      html:root?.querySelector('.panel:not([hidden]),.modal:not([hidden])')?.outerHTML,
      animations:root ? root.getAnimations().map(a=>({name:a.animationName,time:a.currentTime,state:a.playState})) : [] };
  }).catch(e=>({error:e.message}));
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
const centre = async sel=>{
 const audit=await page.locator(sel).evaluate(async e=>{const trace=window.__solInputTrace;trace?.add({type:'measure-start',target:trace.id(e),connected:e.isConnected});const before=e.getBoundingClientRect().toJSON(),animations=[];for(let p=e;p;p=p.parentElement)for(const a of p.getAnimations()){if(a.playState==='running'){animations.push({name:a.animationName,time:a.currentTime,owner:p.className});await a.finished.catch(()=>{});}}const after=e.getBoundingClientRect().toJSON();trace?.add({type:'measure-end',target:trace.id(e),connected:e.isConnected,before,after,animations});return{before,after,animations};});
 if(audit.animations.length){report.coverage.animationWaits??=[];report.coverage.animationWaits.push({selector:sel,...audit});}
 // The panel can replace its header between protocol calls. Query and measure the CURRENT connected node
 // in one browser JS turn; do not hold an ElementHandle across animation waits / boundingBox requests.
 const b=await page.evaluate(sel=>{const root=document.querySelector('#station-yard')?.shadowRoot,e=root?.querySelector(sel);const rect=e?.isConnected&&e.getClientRects().length?e.getBoundingClientRect().toJSON():null;const trace=window.__solInputTrace;trace?.add({type:'measure-current',selector:sel,target:trace.id(e),connected:e?.isConnected??false,rect});return rect;},sel);
 report.coverage.coordinateSampling='After existing animation wait, requery and measure current connected DOM node atomically; original real 50ms touch and assertions retained. No action retries.';
 assert.ok(b,sel);return{x:b.x+b.width/2,y:b.y+b.height/2};
};
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

const watchBusy=()=>page.evaluate(()=>{window.__busyAudit={phases:{},bad:[]};setInterval(()=>{const h=window.__station?.host,a=window.__busyAudit;if(!h?.debug.seq)return;const visible=el=>{if(!el||!el.getClientRects().length)return false;for(let p=el;p;p=p.parentElement){const c=getComputedStyle(p);if(p.hidden||c.display==='none'||c.visibility==='hidden')return false;}return true;};const phase=h.debug.seq;a.phases[phase]=(a.phases[phase]??0)+1;const root=document.querySelector('#station-yard').shadowRoot;const shown=[...root.querySelectorAll('.quick,.touch-act,.prompt')].filter(visible).map(e=>e.className);if(shown.length)a.bad.push({phase,shown});},16);});

async function resourceProbe(){
 await open({fixture:preset('repaired'),q:'&sample=village'});await traverse();
 const data={initial:await measures(),village:[],context:[],strictFailures:[]};report.coverage.resourceProbe=data;
 const strict=(a,b,phase)=>{try{compare(a,b);return true;}catch(e){data.strictFailures.push({phase,message:e.message});return false;}};
 for(let cycle=1;cycle<=4;cycle++){
  const before=await measures();await retain();await page.keyboard.press('7');await page.locator('#station-yard >> label.world:has(input[value="buildings"])').click();await page.locator('#station-yard >> #seed').fill('42');await page.locator('[data-act="deploy"]').click();await page.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch,null,{timeout:20000});const freed=await released();assert.equal(await page.evaluate(()=>window.__round2Released.app.deref()===window.__bincovSample.host.app),true);await page.evaluate(()=>{window.__bincovSample.driver.freezeAI(true);window.__bincovSample.driver.placePlayer({x:208,y:122},Math.PI/2);});await page.keyboard.down('e');try{await page.waitForFunction(()=>window.__bincov.app.state==='result',null,{timeout:20000});}finally{await page.keyboard.up('e');}
  await page.waitForFunction(()=>!document.querySelector('.coast-sample'));await page.waitForFunction(()=>window.__station.counts().parked===1&&window.__station.counts().apps===0);const parked=await page.evaluate(source=>{const a=window.__round2Released.app.deref();return{children:a.stage.children.length,ticker:a.ticker.started,attached:a.canvas.isConnected,events:(0,eval)('('+source+')')(a.renderer)};},readPixiEvents.toString());assert.equal(parked.children,0);assert.equal(parked.ticker,false);assert.equal(parked.attached,false);assert.equal(parked.events.attached,false);assert.equal(parked.events.native,0);assert.ok(Object.values(parked.events.roots).every(v=>!v));
  await page.locator('[data-action="return"]').click();await yardReady();await until(()=>window.__station.host.ui.kind==='report',8000);await page.locator('.report [data-act="close"]').click();await traverse();const after=await measures();const row={cycle,before,after,released:freed,parked};data.village.push(row);row.strictPass=strict(before,after,'village-'+cycle);
  row.buffers=await page.evaluate(()=>{const list=window.__station.host.app.renderer.gc._managedResourceHashes,d=list.find(d=>d.context.name==='glBuffer');return Object.entries(d.context[d.hash]).map(([id,b])=>({id,live:!!b,type:b?.constructor?.name,label:b?.label??b?.descriptor?.label??null,bytes:b?.data?.byteLength??b?.descriptor?.size??null,destroyed:b?.destroyed??null}));});
 }
 for(let cycle=1;cycle<=3;cycle++){
  const before=await measures();await page.evaluate(()=>{window.__lose=window.__station.host.app.renderer.gl.getExtension('WEBGL_lose_context');window.__lose.loseContext();});await page.waitForTimeout(500);const lostFrames=await framesIn(300);await page.evaluate(()=>window.__lose.restoreContext());await page.waitForTimeout(900);const restoredFrames=await framesIn(300);assert.ok(lostFrames>5&&restoredFrames>5);await traverse();const restored=await measures(),row={cycle,before,restored,lostFrames,restoredFrames};data.context.push(row);row.strictPass=strict(before,restored,'context-'+cycle);
  await page.waitForTimeout(1500);row.settled=await measures();await retain();await page.evaluate(()=>window.__station.remount(1));await yardReady();row.released=await released();await traverse();row.afterRemount=await measures();row.remountStrictPass=strict(before,row.afterRemount,'context-remount-'+cycle);
 }
 data.final=await measures();data.heap={before:data.initial.heap,after:data.final.heap,deltaBytes:data.final.heap-data.initial.heap,conclusion:'PARTIAL: short diagnostic with changed shared-host population, do not combine with G6 or close F20'};
 // Preserve every strict failure. Plateau after warming is a separate observation, never a rewrite of the cold failure.
 data.warmedVillageStable=data.village.slice(1).every(r=>r.strictPass);data.afterRemountStable=data.context.every(r=>r.remountStrictPass);data.conclusion=data.strictFailures.length?'PARTIAL: strict managed-table observations require owner attribution; wall frame/source release and input parking independently passed':'PASS: bounded resource checks only';assert.deepEqual(data.strictFailures,[],'RESOURCE_PARTIAL: retained strict failures; see coverage.resourceProbe');return data;
}
async function paired(){
 const oldPath=process.argv.find(a=>a.startsWith('--pair-old='))?.slice(11);assert.ok(oldPath,'--pair-old= required');const current=html,old=await readFile(oldPath,'utf8');const rows=[];report.coverage.paired={order:['old','new','new','old'],warmupFrames:30,sampleFrames:120,rows};
 const views=[['clinic',[27.5,12.6],[1920,1080]],['radio',[30.4,5.6],[1280,720]],['workshop',[6.5,13.5],[1920,1080]],['seawall',[17.5,19.8],[1920,1080]]];
 for(const [block,version] of ['old','new','new','old'].entries())for(const power of ['emergency','restored']){
  html=version==='old'?old:current;await open({fixture:powerFixture(power)});const covered=await traverse();
  for(const [name,at,size] of views){await page.setViewportSize({width:size[0],height:size[1]});await place(...at);await page.waitForTimeout(900);
   const performanceSample=await page.evaluate(async()=>{const s=window.__station.host.scene,a=[];for(let i=0;i<150;i++){await new Promise(r=>requestAnimationFrame(r));if(i>=30)a.push(s.stats.frameMs);}a.sort((x,y)=>x-y);return{frames:a.length,avg:a.reduce((a,b)=>a+b,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],min:a[0],max:a.at(-1),raw:a};});
   const brightness=await page.evaluate(async()=>{const s=window.__station.host.scene,original=s.render;let state; s.render=function(dt,st){original.call(this,dt,st);state=st;};await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));s.render=original;s.time=12.5;s.light.time=12.5;original.call(s,0,state);const light=s['app'].renderer.extract.pixels(s.lightRT).pixels;let hash=2166136261;for(const b of light)hash=Math.imul(hash^b,16777619)>>>0;const samples=[];for(let y=2;y<23;y+=2)for(let x=2;x<34;x+=2)samples.push(s.lightAt(x*32,y*32));return{lightmapFNV32:hash,lightmapBytes:light.length,samples,playerTint:s.player.tint,roofTints:[...s.roofs].map(([id,r])=>({id,tint:r.sprite.tint})),mood:s.light.mood,lights:s.light.lights().map(({def,level})=>({id:def.id,level}))};});
   rows.push({block,version,buildSHA256:createHash('sha256').update(html).digest('hex'),power,name,at,size,coveredWalls:covered.wallPopulation,performance:performanceSample,brightness});
  }
 }
 html=current;
 const compare=[];for(const power of ['emergency','restored'])for(const [name] of views){const group=rows.filter(r=>r.power===power&&r.name===name),a=group.find(r=>r.version==='old').brightness;assert.ok(group.every(r=>JSON.stringify(r.brightness)===JSON.stringify(a)),'non-wall fixed-time lightmap or actor/roof brightness changed: '+power+' '+name);const avg=v=>{const r=group.filter(r=>r.version===v);return r.reduce((n,r)=>n+r.performance.avg,0)/r.length;};compare.push({power,name,oldAvg:avg('old'),newAvg:avg('new'),ratio:avg('new')/avg('old'),sameBrightness:true});}
 report.coverage.paired={order:['old','new','new','old'],warmupFrames:30,sampleFrames:120,rows,compare,scope:'headless CPU scene submission, no actual GPU/display/human performance signoff'};return compare;
}
try {
 if(only?.includes('R')) await step('R repeated full-coverage shared-host and context resource diagnostics',resourceProbe);
 if(only?.includes('P')) await step('P paired ABBA full-coverage scene submission and unchanged non-wall lighting', paired);
 for(const power of ['emergency','restored']) await step('J1 '+power+' actual touch centre and four corners of every shortcut',async()=>{
  await open({fixture:powerFixture(power),size:[390,844],mobile:true});const rows=[];report.coverage['touch-'+power]=rows;
  for(const kind of ['gear','arms','med','radio','facility','body','deploy','menu','tabs'])for(const point of [[.5,.5],[.2,.25],[.8,.25],[.2,.75],[.8,.75]]){
   await tapSel('[data-quickmenu]');assert.equal(await menu(),true);assert.equal(await page.locator('.prompt').isVisible(),false);assert.equal(await page.locator('.touch-act').isVisible(),false);
   const sel=kind==='tabs'?'[data-tabs]':'[data-quick="'+kind+'"]', b=await page.locator(sel).boundingBox(),x=b.x+b.width*point[0],y=b.y+b.height*point[1];
   const hit=await page.evaluate(([x,y])=>{const r=document.querySelector('#station-yard').shadowRoot,e=r.elementFromPoint(x,y);return e?.closest('[data-quick]')?.dataset.quick??(e?.closest('[data-tabs]')?'tabs':null);},[x,y]);assert.equal(hit,kind);
   await tap(x,y);
   if(kind==='tabs'){await page.locator('[data-action="base-enter"]').waitFor();assert.equal(await page.evaluate(()=>window.__station.mounted),false);await page.locator('[data-action="base-enter"]').tap();await yardReady();}
   else{await until(k=>window.__station.host.ui.kind===k,3000,kind,kind);assert.equal(await page.locator('.touch-act').isVisible(),false);await tapSel(':is(.panel,.modal):not([hidden]) .phead [data-act="close"]');await until(()=>!window.__station.host.ui.kind);}
   assert.equal(await menu(),false);assert.equal(await page.locator('.touch-act').isVisible(),true);rows.push({kind,point,hit,actual:kind});
  }
  for(const point of [[.5,.5],[.2,.25],[.8,.25],[.2,.75],[.8,.75]]){const b=await page.locator('[data-quickmenu]').boundingBox(),x=b.x+b.width*point[0],y=b.y+b.height*point[1];await tap(x,y);assert.equal(await menu(),true);await tapSel('[data-quickmenu]');assert.equal(await menu(),false);rows.push({kind:'more',point,actual:'menu open/close'});}
  await tapSel('[data-quickmenu]');await page.keyboard.press('Escape');assert.equal(await menu(),false);
  await tapSel('[data-quickmenu]');const a=(await st()).player;await tap(120,300);await page.waitForTimeout(600);const b=(await st()).player;assert.equal(await menu(),false);assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<1);
  await tapSel('[data-quickmenu]');await page.setViewportSize({width:844,height:390});await page.waitForTimeout(500);assert.equal(await menu(),false);await tapSel('[data-quick="gear"]');assert.equal(await panel(),'gear');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);assert.equal(await panel(),'gear');await tapSel(':is(.panel,.modal):not([hidden]) .phead [data-act="close"]');await tapSel('[data-quickmenu]');await page.setViewportSize({width:390,height:780});await page.waitForTimeout(500);assert.equal(await menu(),true);await tapSel('[data-quick="arms"]');assert.equal(await panel(),'arms');
  return{power,taps:rows,sceneWalkPx:Math.hypot(b.x-a.x,b.y-a.y),rotationAndHeight:true,escape:true};
 });

 await step('J2 touch UI hidden for power, departure and return sequences',async()=>{
  await open({fixture:preset('parts'),size:[390,844],mobile:true,q:'&sample=village'});await watchBusy();await tapSel('[data-quickmenu]');await tapSel('[data-quick="radio"]');await tapSel('[data-act="quest:repair"]');await until(()=>window.__station.host.debug.seq==='power',3000);await until(()=>window.__station.host.debug.seq===null,10000);await tapSel('[data-quickmenu]');await tapSel('[data-quick="deploy"]');await page.locator('#station-yard >> label.world:has(input[value="buildings"])').tap();await page.locator('#station-yard >> #seed').fill('42');await tapSel('[data-act="deploy"]');await page.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch,null,{timeout:20000});await page.evaluate(()=>{window.__bincovSample.driver.freezeAI(true);window.__bincovSample.driver.placePlayer({x:208,y:122},Math.PI/2);});await page.keyboard.down('e');try{await page.waitForFunction(()=>window.__bincov.app.state==='result',null,{timeout:20000});}finally{await page.keyboard.up('e');}await page.locator('[data-action="return"]').tap();await yardReady();await until(()=>window.__station.host.ui.kind==='report',8000);const a=await page.evaluate(()=>window.__busyAudit);assert.deepEqual(a.bad,[]);for(const phase of ['power','leave','return'])assert.ok(a.phases[phase]>20,'no sequence samples for '+phase);return a;
 });

 await step('K1 full-yard traversal and independent no-culling pixel oracle',async()=>{
  await open({fixture:preset('repaired'),q:'&sample=village'});const full=await traverse(true);report.coverage.fullTraversal=full;await shot('K1-full-yard');
  const neg=await page.evaluate(auditWalls,{pixels:true,negative:true});assert.ok(neg.different>0,'missing-wall negative not detected');report.coverage.wallNegative=neg;
  // Observe every rendered frame while real WASD moves the camera in both directions.
  const line={from:[17.5,17.6],description:'legal central lane; real movement stops at obstacles, sufficient camera travel required'};report.coverage.motionFixture=line;await place(...line.from);await page.waitForTimeout(400);
  await page.evaluate(source=>{const h=window.__station.host,s=h.scene,original=s.render,audit=(0,eval)('('+source+')');window.__wallMotion={samples:[],total:0,enters:0,leaves:0,last:null};s.render=function(...args){original.apply(this,args);const m=window.__wallMotion;const row=audit({pixels:m.total%30===0});m.total++;row.frame=m.total;const now=new Set(row.seen);if(m.last){m.enters+=row.seen.filter(id=>!m.last.has(id)).length;m.leaves+=[...m.last].filter(id=>!now.has(id)).length;}m.last=now;if(row.missing.length||row.different||m.total%30===1)m.samples.push(row);};},auditWalls.toString());
  await walkIn([['d',6000],['a',10000]]);const vertical=[14.5,20.5];assert.equal(await page.evaluate(([x,y])=>window.__station.host.col.line({x:x*32,y:y*32},{x:x*32,y:8.5*32}),vertical),true,'vertical fixture must be clear');report.coverage.verticalMotionFixture=vertical;await place(...vertical);await page.waitForTimeout(200);await page.evaluate(()=>window.__wallMotion.verticalStart=window.__wallMotion.total);await walkIn([['w',6000],['s',6000]]);
  const motion=await page.evaluate(()=>{const m=window.__wallMotion;return{...m,last:undefined,player:window.__station.host.debug.player};});report.coverage.motion=motion;assert.ok(motion.total>500);assert.ok(motion.enters>10&&motion.leaves>10);motion.cameraSpan=Math.max(...motion.samples.map(a=>a.cam.x))-Math.min(...motion.samples.map(a=>a.cam.x));assert.ok(motion.cameraSpan>=200,'camera did not traverse the culling boundary');const verticalSamples=motion.samples.filter(a=>a.frame>motion.verticalStart);motion.verticalSpan=Math.max(...verticalSamples.map(a=>a.cam.y))-Math.min(...verticalSamples.map(a=>a.cam.y));assert.ok(motion.verticalSpan>=150,'vertical camera did not traverse the culling boundary');assert.ok(motion.samples.every(a=>!a.missing.length&&a.different===0));await shot('K1-motion-return');
  // Start a clean mounted scene so test-side motion closures are not retained during lifecycle measurements.
  await page.evaluate(()=>window.__station.remount(1));await yardReady();await traverse();delete report.coverage.fullTraversal.rows;return{...full,rows:undefined,motion,negativePixels:neg.different};
 });
 await step('K2 fully visited 20 remounts: wall frames/sources released, six Pixi tables, heap observation',async()=>{
  await page.evaluate(()=>window.__station.remount(3));await yardReady();await traverse();const before=await measures(),rows=[];report.coverage.fullyVisitedRemount={before,rows};
  for(let i=1;i<=20;i++){await retain();await page.evaluate(()=>window.__station.remount(1));await yardReady();const freed=await released();const coverage=await traverse();const counts=await measures();rows.push({round:i,coverage,counts,released:freed});compare(before,counts);}
  const after=rows.at(-1).counts;report.heapObservation={before:before.heap,after:after.heap,deltaBytes:after.heap-before.heap,conclusion:'PARTIAL: fully visited short 20-remount observation, historical F20 not closed'};report.coverage.fullyVisitedRemount={before,rows};return{before,after,heap:report.heapObservation};
 });
 await step('K3 fully visited yard/village/yard releases shared resources',async()=>{
  await traverse();const before=await measures();await retain();await page.keyboard.press('7');await page.locator('#station-yard >> label.world:has(input[value="buildings"])').click();await page.locator('#station-yard >> #seed').fill('42');await page.locator('[data-act="deploy"]').click();await page.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch,null,{timeout:20000});
  assert.equal(await page.evaluate(()=>window.__round2Released.app.deref()===window.__bincovSample.host.app),true);const freed=await released();await page.evaluate(()=>{window.__bincovSample.driver.freezeAI(true);window.__bincovSample.driver.placePlayer({x:208,y:122},Math.PI/2);});await page.keyboard.down('e');try{await page.waitForFunction(()=>window.__bincov.app.state==='result',null,{timeout:20000});}finally{await page.keyboard.up('e');}
  await page.waitForFunction(()=>!document.querySelector('.coast-sample'));const parked=await page.evaluate(source=>{const a=window.__round2Released.app.deref();return{counts:window.__station.counts(),children:a.stage.children.length,ticker:a.ticker.started,attached:a.canvas.isConnected,events:(0,eval)('('+source+')')(a.renderer)};},readPixiEvents.toString());assert.equal(parked.children,0);assert.equal(parked.ticker,false);assert.equal(parked.attached,false);assert.equal(parked.events.attached,false);assert.equal(parked.events.native,0);assert.ok(Object.values(parked.events.roots).every(v=>!v));
  await page.locator('[data-action="return"]').click();await yardReady();await until(()=>window.__station.host.ui.kind==='report',8000);await page.locator('.report [data-act="close"]').click();await traverse();const after=await measures();report.coverage.strictVillage={before,after,released:freed,parked};compare(before,after);assert.equal(await page.evaluate(()=>window.__round2Released.app.deref()===window.__station.host.app),true);return{before,after,released:freed,parked};
 });
 await step('K4 fully visited WebGL context restoration: revisit all walls and release remount',async()=>{
  const before=await measures();await page.evaluate(()=>{window.__lose=window.__station.host.app.renderer.gl.getExtension('WEBGL_lose_context');window.__lose.loseContext();});await page.waitForTimeout(500);assert.ok(await framesIn(300)>5);await page.evaluate(()=>window.__lose.restoreContext());await page.waitForTimeout(900);assert.ok(await framesIn(300)>5);const visited=await traverse(true);const restored=await measures();report.coverage.strictContext={before,restored};compare(before,restored);await shot('K4-context-fully-revisited');await retain();await page.evaluate(()=>window.__station.remount(1));await yardReady();const freed=await released();await traverse();const after=await measures();compare(before,after);return{before,restored,after,visited,released:freed};
 });
} finally {
 await ctx?.close().catch(()=>{});await browser.close();report.finishedAt=new Date().toISOString();report.summary={passed:report.steps.filter(s=>s.status==='passed').length,total:report.steps.length};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(report.summary);if(report.summary.passed!==report.summary.total||report.errors.length||report.external.length)process.exitCode=1;
}
