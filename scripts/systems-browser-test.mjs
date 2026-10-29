import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { deployFromYard } from './yard-entry.mjs';
import { batch, dragItem, frames, raidReady, waitPanel } from './raid-view.mjs';
import * as D from '../src/domain.ts';
import { spacePath, traversable } from '../src/spatial.ts';
import { MALL_ANCHORS, mallWorldV4 } from '../src/mall-world.ts';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls } from './stall-resume.mjs';
const out = resolve('test-results'); await mkdir(out, {recursive:true});
const report = {startedAt:new Date().toISOString(), htmlSha256:createHash('sha256').update(await readFile(resolve('dist/index.html'))).digest('hex'), methodology:'Offline built HTML; native buttons, keyboard, touch and reload. Raids run on the 2.5D host (mall layout 4), the walking base is the station yard. Explicit fixtures fund ordinary materials, restore damaged body, position at registered mall anchors through the ?test=1 driver, freeze enemy AI for transaction/connector checks, trigger terminal conditions and rewind the saved base cursor to verify offline recovery. Scoped write failures target the intended bag, floor or terminal transaction while allowing unrelated periodic checkpoints. These fixtures do not prove natural balance or reference-image fidelity. Ordinary entry has a separate context without test hooks.', steps:[],errors:[],requests:[]};
const browser = await chromium.launch(browserOptions); report.browser=browser.version();
const ctx = await browser.newContext({viewport:{width:1280,height:720},offline:true});
await resumeStalls(ctx);
const page = await ctx.newPage(); page.setDefaultTimeout(30000); page.on('pageerror',e=>report.errors.push(e.stack ?? e.message)); ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
const action=(name,id)=>page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
const doButton=(name,p=page)=>p.locator(`.coast-sample [data-do="${name}"]`);
const MALL=mallWorldV4();
// Stored record, profile, live expansion (the raid Runtime's capture during a raid) and the open panel (old page or raid host).
const state=()=>page.evaluate(()=>{const a=window.__bincov.app;return {raw:localStorage.getItem('escape-bincov.session.v2'),profile:a.save,expansion:window.__bincov.saveSession.captureExpansion(),overlay:a.overlay,panel:window.__bincovSample?.host?.panel??null};});
async function step(name,task){const row={name,status:'running'};report.steps.push(row);try{await task();assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);row.status='passed';console.log('PASS',name);}catch(e){row.status='failed';row.error=e.stack;throw e;}}
const fault=(scope='any')=>page.evaluate(scope=>{window.__systemSet=Storage.prototype.setItem;const baseline=JSON.stringify(window.__bincov.app.loadout?.bag),map=window.__bincovSample?.host?.lastBatch?.stamp.world.mapId;Storage.prototype.setItem=function(k,v){if(k==='escape-bincov.session.v2'){const record=JSON.parse(v),blocked=scope==='any'||scope==='bag'&&JSON.stringify(record.expansion?.raid?.loadout.bag)!==baseline||scope==='layer'&&record.expansion?.raid?.currentMap!==map||scope==='terminal'&&!!record.terminal;if(blocked){window.__systemPreFailureRaw=localStorage.getItem(k);throw new DOMException('System fixture failure','QuotaExceededError');}}return window.__systemSet.call(this,k,v);};},scope);
const recover=()=>page.evaluate(()=>{Storage.prototype.setItem=window.__systemSet;});
const mapId=(p=page)=>p.evaluate(()=>window.__bincovSample.host.lastBatch.stamp.world.mapId);
/**
 * On a slow machine (CI draws these floors a few times a second) the first frames after a placement or a floor change can
 * take over two seconds, which stall-pauses the raid, and the next real input would meet the pause panel. Draw frames
 * until two in a row take under a second (at most 20), then resume if the latest Runtime notice is the stall pause.
 */
const settled=async(p=page)=>{
 await p.evaluate(()=>new Promise(r=>{let last=performance.now(),quiet=0,n=0;const f=now=>{quiet=now-last<1000?quiet+1:0;last=now;if(++n>=20||quiet>=2)r();else requestAnimationFrame(f);};requestAnimationFrame(f);}));
 const stalled=await p.evaluate(()=>{const h=window.__bincovSample.host,n=h.eventLog.filter(e=>e.type==='notice').at(-1);return h.panel==='pause'&&/画面暂时停顿/.test(n?.detail?.text??'')&&!!document.querySelector('.coast-sample [data-panel] [data-do="resume"]:not([disabled])');});
 if(stalled){await doButton('resume',p).click();await waitPanel(p,null);}
};
const onMap=async(id,p=page)=>{await p.waitForFunction(id=>window.__bincovSample?.host?.lastBatch?.stamp.world.mapId===id,id,{timeout:45000});await settled(p);};
/** Stand at a point of the current floor (validated body fit), let the view settle, and write the checkpoint. */
async function stand(pt,p=page){await p.evaluate(pt=>{const h=window.__bincovSample.host;window.__bincovSample.driver.placePlayer({x:pt.x,y:pt.y},-Math.PI/2,h.lastBatch.stamp.world.mapId);},pt);await settled(p);await p.evaluate(()=>{if(!window.__bincovSample.host.services.checkpoint())throw new Error('Anchor checkpoint failed');});}
/** A crate's own point can sit beside furniture: stand on it, or on the nearest free point in reach of it. */
async function standAt(pt,floor){const def=MALL.maps[floor],ctxS={definition:def,doors:{},highTide:false};const spot=[[0,0],[0,16],[0,-16],[16,0],[-16,0],[16,16],[-16,16],[16,-16],[-16,-16],[0,28],[28,0],[-28,0],[0,-28]].map(([dx,dy])=>({x:pt.x+dx,y:pt.y+dy})).find(p=>traversable(ctxS,p,'body',10));assert.ok(spot,`no standing point near ${JSON.stringify(pt)}`);await stand(spot);}
/** The crate standing at a registered anchor of the given floor, from the live capture. */
const crateAt=(s,floor,pt)=>s.expansion.raid.maps[floor].containers.find(c=>c.x===pt.x&&c.y===pt.y);
/**
 * After a failed write the host may write a checkpoint of the rolled-back state (the bag-scoped fault lets it through),
 * so the stored bytes can be newer than the pre-failure bytes. What must hold is the rollback itself: the stored record
 * keeps the pre-failure bag, crates and floor.
 */
const stored=s=>JSON.parse(s.raw).expansion.raid,preFailure=()=>page.evaluate(()=>JSON.parse(window.__systemPreFailureRaw).expansion.raid);
const openLoot=async id=>{await page.waitForFunction(id=>window.__bincovSample.host.lastBatch.frame.interaction?.ref.id===id||window.__bincovSample.host.lastBatch.frame.interaction?.choices.some(c=>c.id===id&&c.selected),id);await page.keyboard.press('e');await waitPanel(page,'loot');await page.locator('.coast-sample [data-grid="container"]').waitFor();};
const closePanel=async()=>{await page.locator('.coast-sample [data-panel] [data-do="close"]').click();await waitPanel(page,null);};
const freeze=(p=page)=>p.evaluate(()=>window.__bincovSample.driver.freezeAI(true));
try {
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await action('enter').click();await page.locator('#ui .panel.hideout').waitFor();
 const funded=D.newSave(); funded.cash=100000; funded.quests.repair=true; funded.upgraded=true; funded.stash=D.createInventory(D.STASH_W,D.STASH_UPGRADED_ROWS);
 for(const [id,qty] of Object.entries({scrap:35,wire:20,bandage:15,medkit:5,fuse:10,battery:10,pearl:5,watch:3,cloth:10,water:6,luckyCharm:1,unluckyCharm:1,analgesic:1,strengthDose:1}))assert.equal(D.addItem(funded.stash,id,qty),0);
 await page.evaluate(profile=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>{Object.assign(d.profile,profile);d.expansion.base.extractedPearl=true;d.expansion.body.hp=20;d.expansion.body.mental=40;d.expansion.body.water=50;d.expansion.body.satiety=50;d.expansion.body.bleeding=true;});if(!t||s.commitExpansionMutation(t)!=='committed')throw new Error('Funding fixture rejected');},funded);
 // The walking base is the station yard: real movement, and a failed write when leaving keeps the yard and its storage dialog.
 await step('station yard movement is real; a failed write on leaving keeps the yard and its storage dialog until retried',async()=>{
  await action('base-enter').first().click();await page.waitForFunction(()=>!!window.__station?.host&&document.documentElement.dataset.station==='yard',null,{timeout:30000});
  const yard=()=>page.evaluate(()=>({...window.__station.host.debug,mounted:window.__station.mounted}));
  // D is held until the yard has moved the player (a fixed 250 ms can pass between two frames on a slow machine).
  const before=(await yard()).player.x;await page.keyboard.down('d');
  try{await page.waitForFunction(x=>window.__station.host.debug.player.x>x,before,{timeout:30000});}finally{await page.keyboard.up('d');}
  const original=(await state()).raw;await fault();await page.keyboard.press('0');
  await page.waitForFunction(()=>window.__station.host.debug.dialog==='storage');
  assert.equal((await state()).raw,original);assert.equal((await yard()).mounted,true);assert.equal(await page.evaluate(()=>window.__bincov.app.state),'hideout');
  for(const size of [{width:1920,height:1080},{width:1280,height:720}]){await page.setViewportSize(size);await frames(page,2);assert.equal((await yard()).dialog,'storage');assert.equal((await yard()).mounted,true);}
  await recover();await page.locator('#station-yard .dialog [data-act="retry-save"]').click();await page.waitForFunction(()=>window.__station.host.debug.dialog===null);
  await page.keyboard.press('0');await page.locator('#ui .panel.hideout').waitFor();assert.equal(await page.evaluate(()=>window.__station.mounted),false);
  await action('tab','facilities').click();assert.match(await page.locator('.facility-panel').innerText(),/休息区/);
 });
 await step('failed facility payment rolls back cash, material, grade and bytes; next click commits once',async()=>{
  const before=await state();await fault();await action('facility-build').click();const after=await state();assert.equal(after.raw,before.raw);assert.equal(after.profile.cash,before.profile.cash);assert.equal(after.expansion.base.facilities.rest,0);assert.deepEqual(after.profile.stash,before.profile.stash);await recover();await action('facility-build').click();const saved=await state();assert.equal(saved.profile.cash,before.profile.cash-200);assert.equal(saved.expansion.base.facilities.rest,1);
  await action('facility-build').click();await action('facility-build').click();assert.equal((await state()).expansion.base.facilities.rest,3);
 });
 await step('all five facilities expose costs and gates; finite recipe queue debits each batch once',async()=>{
  for(const facility of ['medical','training','blackmarket','workbench']){await action('facility-select',facility).click();await action('facility-build').click();assert.equal((await state()).expansion.base.facilities[facility],1);}
  await action('facility-build').click();await action('facility-build').click();assert.equal((await state()).expansion.base.facilities.workbench,3);
  for(let i=0;i<3;i++)await action('production-enqueue','bandage').click();const q=(await state()).expansion.base.queue;assert.equal(q.length,3);assert.ok(q.every(b=>b.duration===420));const cash=(await state()).profile.cash;await action('production-enqueue','bandage').click();assert.equal((await state()).profile.cash,cash);
  const tail=q[2];await action('production-cancel',tail.id).click();assert.equal((await state()).expansion.base.queue.length,2);assert.equal((await state()).profile.cash,cash+35);
 });
 await step('offline time restores damaged body and finishes only paid batches; claim rollback and single receipt',async()=>{
  const raw=JSON.parse((await state()).raw);raw.expansion.base.cursor-=1800000;await page.evaluate(raw=>localStorage.setItem('escape-bincov.session.v2',JSON.stringify(raw)),raw);await page.reload();await action('enter').click();
  assert.equal((await state()).expansion.base.completed.length,2);assert.equal((await state()).expansion.base.queue.length,0);assert.equal((await state()).expansion.body.bleeding,false);assert.ok((await state()).expansion.body.hp>20);
  await action('tab','facilities').click();await action('facility-select','workbench').click();const id=(await state()).expansion.base.completed[0].id,before=await state();await fault();await action('production-claim',id).click();assert.equal((await state()).raw,before.raw);assert.deepEqual((await state()).profile.stash,before.profile.stash);await recover();await action('production-claim',id).click();assert.equal((await state()).expansion.base.completed.length,1);assert.equal(await action('production-claim',id).count(),0);
 });
 await step('charm swap, body panel and medical use commit the item and effect together',async()=>{
  await action('tab','gear').click();const charm=(await state()).profile.stash.items.find(i=>i.id==='luckyCharm');await page.locator(`[data-source="stash"][data-uid="${charm.uid}"]`).click();await action('charm-equip').click();assert.equal((await state()).expansion.charm.id,'luckyCharm');
  const dose=(await state()).profile.stash.items.find(i=>i.id==='strengthDose');await page.locator(`[data-source="stash"][data-uid="${dose.uid}"]`).click();await action('use-base').click();assert.ok((await state()).expansion.body.effects.strength>170);assert.equal((await state()).profile.stash.items.some(i=>i.uid===dose.uid),false);await action('tab','body').click();assert.match(await page.locator('.rpg-property').innerText(),/力量[\s\S]*10 \+ 5/);assert.doesNotMatch(await page.locator('.rpg-property').innerText(),/幸运.*[0-9]/);
  await page.screenshot({path:resolve(out,'rpg-base-1280x720.png')});await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:resolve(out,'rpg-base-1920x1080.png')});await page.setViewportSize({width:1280,height:720});
 });
 await step('mall native deployment (layout 4) has 25 enemies, two floors, one clock and two valid exits',async()=>{
  await action('tab','gear').click();await page.locator('#run-world').selectOption('mall');await page.locator('#seed').fill('42');await action('deploy').click();await raidReady(page);await freeze();
  const s=await state();assert.equal(s.expansion.raid.worldVersion,'mall-v4');assert.equal(s.expansion.raid.roster.length,25);assert.equal(Object.keys(s.expansion.raid.maps).length,2);assert.equal(s.expansion.raid.currentMap,'mall-f1');assert.equal((await batch(page)).map.exits.length,2);
  await page.evaluate(()=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>{d.expansion.body.hp=100;d.expansion.body.bleeding=false;});if(!t||s.commitExpansionMutation(t)!=='committed')throw new Error('Transaction combat fixture rejected');});
 });
 /** Drag the crate's first item into the first bag cell that fits it; a scoped fault can make the write fail. */
 async function crateDrop(floor,anchor){
  const before=await state(),container=crateAt(before,floor,anchor),item=container.inventory.items[0],bag=before.expansion.raid.loadout.bag;let dest=null;
  for(let y=0;y<bag.h&&!dest;y++)for(let x=0;x<bag.w&&!dest;x++)if(D.fits(bag,item.id,x,y,undefined,!!item.rotated))dest={x,y};assert.ok(dest);
  return {before,container,item,drop:()=>dragItem(page,page.locator(`.coast-sample [data-source="container"][data-uid="${item.uid}"]`),'bag',dest.x,dest.y)};
 }
 await step('mall native crate transfer keeps both inventories atomic and persists remaining contents after a floor round trip',async()=>{
  const box=crateAt(await state(),'mall-f1',MALL_ANCHORS.box1);assert.ok(box,'layout 4 keeps the first-floor crate on its anchor');
  await standAt(MALL_ANCHORS.box1,'mall-f1');await openLoot(box.id);
  const {before,container,item,drop}=await crateDrop('mall-f1',MALL_ANCHORS.box1);
  await fault('bag');await drop();await waitPanel(page,'pause');{const now=await state(),saved=stored(now),pre=await preFailure();assert.deepEqual(saved.loadout.bag,pre.loadout.bag);assert.deepEqual(saved.maps['mall-f1'].containers,pre.maps['mall-f1'].containers);assert.deepEqual(saved.loadout.bag,before.expansion.raid.loadout.bag);}assert.deepEqual((await state()).expansion.raid.loadout.bag,before.expansion.raid.loadout.bag);assert.deepEqual(crateAt(await state(),'mall-f1',MALL_ANCHORS.box1).inventory,container.inventory);
  await recover();await doButton('retry-save').click();await waitPanel(page,null);await openLoot(box.id);await drop();await frames(page,2);assert.equal(crateAt(await state(),'mall-f1',MALL_ANCHORS.box1).inventory.items.some(i=>i.uid===item.uid),false);
  await closePanel();const stairs=MALL.maps['mall-f1'].entries[0];await stand(stairs.at);await page.keyboard.press('e');await onMap('mall-f2');await page.keyboard.press('e');await onMap('mall-f1');assert.equal(crateAt(await state(),'mall-f1',MALL_ANCHORS.box1).inventory.items.some(i=>i.uid===item.uid),false);
 });
 await step('map and backpack block a nearby connector; a failed floor write preserves successful loot and retries once',async()=>{
  const entry=MALL.maps['mall-f1'].entries.find(e=>e.id==='S-W-up');await stand(entry.at);
  for(const key of ['m','Tab']){
   await page.keyboard.press(key);await page.waitForFunction(()=>!!window.__bincovSample.host.panel);const before=await state();
   await page.keyboard.down('e');await page.keyboard.down('w');await frames(page,12);
   const panel=await state();assert.equal(panel.expansion.raid.currentMap,'mall-f1');assert.deepEqual({x:panel.expansion.raid.player.x,y:panel.expansion.raid.player.y},{x:before.expansion.raid.player.x,y:before.expansion.raid.player.y});
   await closePanel();await frames(page,15);const held=await state();assert.equal(held.expansion.raid.currentMap,'mall-f1');assert.deepEqual({x:held.expansion.raid.player.x,y:held.expansion.raid.player.y},{x:before.expansion.raid.player.x,y:before.expansion.raid.player.y});
   await page.keyboard.up('e');await page.keyboard.up('w');
  }
  const before=await state();await fault('layer');await page.keyboard.press('e');await waitPanel(page,'pause');
  assert.match(await page.locator('.coast-sample [data-panel] h2').innerText(),/存档保存失败/);
  const failed=await state();{const saved=stored(failed),pre=await preFailure();assert.equal(saved.currentMap,'mall-f1');assert.deepEqual(saved.loadout,pre.loadout);assert.deepEqual(saved.maps['mall-f1'].containers,pre.maps['mall-f1'].containers);}assert.equal(failed.expansion.raid.currentMap,'mall-f1');assert.deepEqual(failed.expansion.raid.loadout,before.expansion.raid.loadout);assert.deepEqual(failed.expansion.raid.maps['mall-f1'].containers,before.expansion.raid.maps['mall-f1'].containers);
  await recover();await doButton('retry-save').click();await onMap('mall-f2');await waitPanel(page,null);const retried=await state();assert.equal(retried.expansion.raid.currentMap,'mall-f2');assert.deepEqual(retried.expansion.raid.loadout,before.expansion.raid.loadout);assert.deepEqual(retried.expansion.raid.maps['mall-f1'].containers,before.expansion.raid.maps['mall-f1'].containers);
  await page.keyboard.press('e');await onMap('mall-f1');
  assert.ok(await page.evaluate(()=>window.__bincovSample.host.services.checkpoint()));await page.reload();await action('enter').click();await raidReady(page);await waitPanel(page,'pause');
  const restored=await state();assert.equal(restored.expansion.raid.currentMap,'mall-f1');assert.deepEqual(restored.expansion.raid.loadout,before.expansion.raid.loadout);assert.deepEqual(restored.expansion.raid.maps['mall-f1'].containers,before.expansion.raid.maps['mall-f1'].containers);
  await freeze();await doButton('resume').click();await waitPanel(page,null);
 });
 // Ten round trips per connector in every layout: tests/mall-runtime.test.ts G-06. Here one real E round trip each, on the 2.5D host.
 await step('all four paired mall connectors take a real round trip each with no duplicated population',async()=>{
  for(const entry of MALL.maps['mall-f1'].entries){
   await stand(entry.at);const before=(await state()).expansion.raid.elapsed;await page.keyboard.press('e');await onMap('mall-f2');await page.keyboard.press('e');await onMap('mall-f1');const s=(await state()).expansion.raid;assert.ok(s.elapsed>=before);assert.equal(s.roster.length,25);
  }
 });
 await step('upstairs fixed crate supports failed and successful native transfer, floor round trip and refresh without duplicating either end',async()=>{
  const up=MALL.maps['mall-f1'].entries.find(e=>e.id==='S-N-up');await stand(up.at);await page.keyboard.press('e');await onMap('mall-f2');
  const target=crateAt(await state(),'mall-f2',MALL_ANCHORS.box2);assert.ok(target,'layout 4 keeps the upstairs crate on its anchor');
  await standAt(MALL_ANCHORS.box2,'mall-f2');await openLoot(target.id);
  const {before,container:box,item,drop}=await crateDrop('mall-f2',MALL_ANCHORS.box2),bag=before.expansion.raid.loadout.bag;
  await fault('bag');await drop();await waitPanel(page,'pause');const failed=await state();{const saved=stored(failed),pre=await preFailure();assert.deepEqual(saved.loadout.bag,pre.loadout.bag);assert.deepEqual(saved.maps['mall-f2'].containers,pre.maps['mall-f2'].containers);assert.deepEqual(saved.loadout.bag,bag);}assert.deepEqual(failed.expansion.raid.loadout.bag,bag);assert.deepEqual(crateAt(failed,'mall-f2',MALL_ANCHORS.box2).inventory,box.inventory);
  await recover();await doButton('retry-save').click();await waitPanel(page,null);await openLoot(box.id);await drop();await frames(page,2);await closePanel();const after=await state();assert.equal(crateAt(after,'mall-f2',MALL_ANCHORS.box2).inventory.items.some(i=>i.uid===item.uid),false);
  const down=MALL.maps['mall-f2'].entries.find(e=>e.id==='S-N-down');await stand(down.at);await page.keyboard.press('e');await onMap('mall-f1');await page.keyboard.press('e');await onMap('mall-f2');
  assert.ok(await page.evaluate(()=>window.__bincovSample.host.services.checkpoint()));await page.reload();await action('enter').click();await raidReady(page);await waitPanel(page,'pause');
  const restored=await state();assert.equal(restored.expansion.raid.currentMap,'mall-f2');assert.deepEqual(restored.expansion.raid.loadout.bag,after.expansion.raid.loadout.bag);assert.equal(crateAt(restored,'mall-f2',MALL_ANCHORS.box2).inventory.items.some(i=>i.uid===item.uid),false);
  await freeze();await doButton('resume').click();await waitPanel(page,null);await page.keyboard.press('e');await onMap('mall-f1');
 });
 await step('mall floor preview does not move the player; terrace stays upstairs and reload restores it',async()=>{
  const entry=MALL.maps['mall-f1'].entries.find(e=>e.id==='S-N-up');await stand(entry.at);await page.keyboard.press('e');await onMap('mall-f2');await stand(MALL_ANCHORS.edge);
  await page.keyboard.press('m');await waitPanel(page,'map');await page.locator('.coast-sample [data-do="map-floor"][data-id="mall-f1"]').click();assert.equal(await mapId(),'mall-f2');assert.equal((await batch(page)).map.exits.length,0);await closePanel();
  await page.screenshot({path:resolve(out,'mall-terrace-1280x720.png')});await page.setViewportSize({width:1920,height:1080});await frames(page,10);await page.screenshot({path:resolve(out,'mall-terrace-1920x1080.png')});
  // Freeze aim before sampling: the pause stops the Runtime; reload also checkpoints in beforeunload/pagehide.
  await page.keyboard.press('Escape');await waitPanel(page,'pause');await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.phase==='paused');
  const sample=await page.evaluate(()=>{const ok=window.__bincovSample.host.services.checkpoint();return{ok,live:window.__bincov.saveSession.captureExpansion().raid.player,durable:JSON.parse(localStorage.getItem('escape-bincov.session.v2')).expansion.raid.player};});
  assert.equal(sample.ok,true);assert.deepEqual(sample.live,sample.durable);report.terraceCheckpointSample=sample;const before=sample.live;await page.reload();await action('enter').click();await raidReady(page);assert.equal((await state()).expansion.raid.currentMap,'mall-f2');assert.deepEqual((await state()).expansion.raid.player,before);
  await page.setViewportSize({width:1280,height:720});
 });
 await step('scene tide flip reroutes the persisted source pursuit once and leaves upstairs dry',async()=>{
  await waitPanel(page,'pause');await freeze();await doButton('resume').click();await waitPanel(page,null);
  // A body-walkable start on the first floor's east side with a real route to the S-N stairs (layout 4 geometry).
  const f1={definition:MALL.maps['mall-f1'],doors:{},highTide:false},entry=MALL.maps['mall-f1'].entries.find(e=>e.id==='S-N-up');
  let start=null,route=null;
  for(const [tx,ty] of [[71,25],[70,25],[69,25],[71,24],[71,26],[68,25],[66,25],[63,25],[60,25]]){const p={x:tx*32+16,y:ty*32+16};if(!traversable(f1,p,'body',10))continue;const path=spacePath(f1,p,entry.at,true);if(path.length){start=p;route=[p,...path,entry.at];break;}}
  assert.ok(start,'a pursuit start with a route to the stairs');
  const distance=route.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-route[i].x,p.y-route[i].y),0);
  await page.evaluate(({start,entry,route,distance})=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>{const r=d.expansion.raid;r.elapsed=299.9;r.initialHigh=false;r.highTide=false;r.warned=true;r.tideChanged=false;r.currentMap='mall-f2';r.player={...entry.landing,rotation:0};for(const p of r.pursuits)r.maps[p.sourceMap].enemies.push(p.enemy);r.pursuits=[];const enemy=r.maps['mall-f1'].enemies.find(e=>e.hp>0);r.maps['mall-f1'].enemies=r.maps['mall-f1'].enemies.filter(e=>e!==enemy);Object.assign(enemy,start,{state:'chase',target:entry.at,path:[],alert:5});r.pursuits=[{id:`pursuit-${r.nextEntity++}`,enemy,sourceMap:'mall-f1',targetMap:'mall-f2',entry:entry.id,path:route,distance,speed:30,registeredAt:299.9,arrivalAt:299.9+distance/30+1,waiting:false}];});if(!t||s.commitExpansionMutation(t)!=='committed')throw new Error('Tide pursuit fixture rejected');},{start,entry,route,distance});
  await page.waitForFunction(()=>window.__bincov.saveSession.captureExpansion().raid.elapsed>300.1,null,{timeout:30000});const s=(await state()).expansion.raid;assert.equal(s.highTide,true);assert.equal(s.tideChanged,true);assert.equal(s.currentMap,'mall-f2');assert.ok(s.pursuits.length===0||s.pursuits[0].registeredAt>=300,'The Runtime forwards the tide boundary to the pursuit engine');assert.equal(MALL.maps['mall-f2'].cells.flat().includes('tide'),false);
 });
 for(const viewport of [{width:844,height:390},{width:640,height:300}])await step(`station yard and mall native touch at ${viewport.width}x${viewport.height}`,async()=>{
  const mobile=await browser.newContext({viewport,isMobile:true,hasTouch:true,offline:true}),p=await mobile.newPage();p.setDefaultTimeout(30000);await resumeStalls(mobile);p.on('pageerror',e=>report.errors.push(e.stack??e.message));mobile.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
  const a=(name,id)=>p.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
  // A fresh page boots the game and its title renderer first: allow a slow machine its time before the first tap.
  try{await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await a('enter').tap({timeout:60000});await p.locator('#ui .panel.hideout').waitFor();
   // The yard: stand at the rest area and open it with the touch action button.
   await a('base-enter').first().tap();await p.waitForFunction(()=>!!window.__station?.host,null,{timeout:30000});
   await p.evaluate(()=>window.__station.host.place(19.5,5.2,2));await p.waitForFunction(()=>window.__station.host.debug.focus==='rest');
   await p.locator('#station-yard .touch-act').tap();await p.waitForFunction(()=>window.__station.host.debug.panel==='facility');
   assert.match(await p.locator('#station-yard .k-facility').innerText(),/休息区/);await p.screenshot({path:resolve(out,`base-touch-${viewport.width}x${viewport.height}.png`)});
   await p.evaluate(()=>window.__station.host.ui.close());await p.keyboard.press('0');await p.locator('#ui .panel.hideout').waitFor();
   await p.locator('#run-world').selectOption('mall');await p.locator('#seed').fill('41');await a('deploy').tap();await raidReady(p);await freeze(p);
   const up=MALL.maps['mall-f1'].entries.find(e=>e.id==='S-N-up');await stand(up.at,p);
   await p.waitForFunction(label=>document.querySelector('.coast-sample [data-act]')?.getAttribute('aria-label')===label,up.label);
   // A floor-changing tap is acknowledged only once the page has drawn the new floor: several seconds on a slow machine.
   await p.locator('.coast-sample [data-act]').tap({timeout:45000});await onMap('mall-f2',p);
   await p.locator('.coast-sample .cs-touch [data-do="map"]').tap();await waitPanel(p,'map');await p.locator('.coast-sample [data-do="map-floor"][data-id="mall-f1"]').tap();assert.equal(await mapId(p),'mall-f2');
   await p.locator('.coast-sample [data-panel] [data-do="close"]').tap();await waitPanel(p,null);await p.screenshot({path:resolve(out,`mall-touch-${viewport.width}x${viewport.height}.png`)});
   await p.locator('.coast-sample [data-act]').tap({timeout:45000});await onMap('mall-f1',p);
  }finally{await mobile.close();}
 });
 await step('native terminal scenes commit death, timeout, abandonment and extraction once; failed settlement retains its candidate',async()=>{
  const stats=()=>page.evaluate(()=>window.__bincov.app.save.stats.runs);
  const settled=()=>page.waitForFunction(()=>window.__bincov.app.state==='result'&&!document.querySelector('.coast-sample'),null,{timeout:30000});
  if(await page.evaluate(()=>window.__bincov.app.state==='run')){if(await page.evaluate(()=>window.__bincovSample.host.panel)!=='pause'){await page.keyboard.press('Escape');await waitPanel(page,'pause');}await doButton('abandon').click();await doButton('abandon-yes').click();await settled();}
  for(const reason of ['timeout','death','abandon','extract']){
   await action('return').click();await page.locator('#ui .panel.hideout').waitFor();await page.evaluate(()=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>Object.assign(d.expansion.body,{hp:100,stamina:100,mental:80,water:80,satiety:80,pollution:0,bleeding:false,exhausted:false}));if(!t||s.commitExpansionMutation(t)!=='committed')throw new Error('Terminal body fixture rejected');});await page.locator('#run-world').selectOption('mall');await page.locator('#seed').fill('42');await action('deploy').click();await raidReady(page);await freeze();
   const before=await stats(),beforeState=await state(),runId=beforeState.profile.activeRun.runId;
   if(reason==='timeout'){await fault('terminal');await page.evaluate(()=>window.__bincovSample.driver.clock(599.95));await page.waitForFunction(()=>window.__bincov.app.pendingSettlement);assert.equal((await state()).raw,await page.evaluate(()=>window.__systemPreFailureRaw));assert.equal(await stats(),before);assert.ok((await state()).profile.activeRun);await waitPanel(page,'ending');await recover();await doButton('retry-settlement').click();}
   else if(reason==='death')await page.evaluate(()=>window.__bincovSample.driver.hurt(1000));
   else if(reason==='abandon'){await page.keyboard.press('Escape');await waitPanel(page,'pause');await doButton('abandon').click();await doButton('abandon-yes').click();}
   else{await page.evaluate(()=>window.__bincovSample.driver.vitals({hp:100,bleeding:false}));const exit=(await batch(page)).map.exits[0].at;await stand(exit);await page.keyboard.down('e');await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.phase==='ending',null,{timeout:30000});await page.keyboard.up('e');}
   await settled();const s=await state();assert.equal(await stats(),before);assert.equal(s.profile.stats.extracts,beforeState.profile.stats.extracts+(reason==='extract'?1:0));assert.equal(JSON.parse(s.raw).terminal.runId,runId);assert.equal(s.profile.activeRun,null);assert.equal(s.expansion.raid,null);assert.equal(s.expansion.base.location,'base');assert.equal(s.profile.lastResult.outcome,reason==='abandon'?'death':reason);assert.equal(s.overlay,'');assert.equal(await page.evaluate(()=>window.__bincov.saveSession.retrySettlement()),false);await frames(page,6);assert.equal(await stats(),before);
  }
 });
 await step('ordinary offline mall entry (2.5D view, layout 4) exposes no test hook and saves native movement, map view and refresh recovery',async()=>{
  // A fresh page boots the game, the yard and the raid view on a slow machine (CI): waits get 30 s, the first tap 60 s.
  const ordinary=await browser.newContext({viewport:{width:1280,height:720},offline:true}),p=await ordinary.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>report.errors.push(e.stack??e.message));ordinary.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});const a=name=>p.locator(`[data-action="${name}"]`);
  try{await p.goto(pathToFileURL(resolve('dist/index.html')).href);assert.equal(await p.evaluate(()=>typeof window.__bincov),'undefined');await a('enter').click({timeout:60000});await deployFromYard(p,{world:'mall',seed:41});await p.waitForSelector('.coast-sample [data-where]');const saved=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('escape-bincov.session.v2')).expansion.raid);const before=await saved();await p.keyboard.down('w');await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));await p.keyboard.up('w');/* W stays down across drawn frames; the walk then reaches the record with the next two-second checkpoint, however long a frame is. */await p.waitForFunction(([key,y])=>JSON.parse(localStorage.getItem(key)).expansion.raid.player.y<y,['escape-bincov.session.v2',before.player.y],{timeout:30000});const after=await saved();assert.equal(after.worldVersion,'mall-v4');assert.ok(after.player.y<before.player.y);assert.ok(after.elapsed>before.elapsed);await p.keyboard.press('m');await p.locator('[data-do="map-floor"][data-id="mall-f2"]').click();assert.equal((await saved()).currentMap,'mall-f1');await p.keyboard.press('m');await p.waitForSelector('.coast-sample [data-panel]',{state:'hidden'});await p.screenshot({path:resolve(out,'mall-ordinary-1280x720.png')});await p.reload();await a('enter').click();await p.waitForSelector('.coast-sample [data-where]');assert.equal((await saved()).currentMap,'mall-f1');assert.equal(await p.evaluate(()=>typeof window.__bincov),'undefined');}
  finally{await ordinary.close();}
 });
 report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;report.diagnostic=await state().catch(()=>null);console.error(e);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'systems-browser-report.json'),JSON.stringify(report,null,2));await ctx.close();await browser.close();}
