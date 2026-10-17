import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserOptions } from './browser-options.mjs';
import { failSessionWritesOnClick, restoreSessionWrites } from './storage-fault.mjs';
import { openPause, resumeStalls, running, stallResumes } from './stall-resume.mjs';

const out=resolve('test-results/mobile-ux'); await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),method:'Offline Chromium touch emulation, trusted taps and explicit ?test=1 fixtures on the 2.5D raid host. Includes failure injection; not physical phone validation. Notch insets are emulated with the DevTools safe-area override (env(safe-area-inset-*)).',steps:[],errors:[],requests:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,offline:true});
await resumeStalls(context);
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>report.errors.push(e.message));context.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url())});
const action=(name,id)=>page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
const raid=name=>page.locator(`.coast-sample [data-do="${name}"]`);
const inPanel=selector=>page.locator(`.coast-sample [data-panel] ${selector}`);
const shot=name=>page.screenshot({path:resolve(out,`${name}.png`)});
const host=(fn,arg)=>page.evaluate(fn,arg);
const drive=(name,...args)=>page.evaluate(([n,a])=>window.__bincovSample.driver[n](...a),[name,args]);
/** Notch insets as a phone reports them to env(safe-area-inset-*); zeros clear them. */
const cdp=await context.newCDPSession(page);
const insets=(left=0,right=0,bottom=0,top=0)=>cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top,left,right,bottom}});
const panelIs=v=>page.waitForFunction(v=>window.__bincovSample?.host?.panel===v,v,{timeout:20000});
const ready=()=>page.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch&&!!document.querySelector('.coast-sample canvas'),null,{timeout:30000});
async function step(name,fn){const e={name,status:'running'};report.steps.push(e);try{await fn();assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);e.status='passed';console.log('PASS',name)}catch(error){e.status='failed';e.error=error.stack;throw error}}
async function reachable(selector){return page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=48&&r.height>=48&&r.y>=0&&r.bottom<=innerHeight&&r.x>=0&&r.right<=innerWidth&&!!hit&&(hit===el||el.contains(hit));})}
/**
 * Landscape sizes never pause the raid; a pause left open by an earlier step is resumed. Two published frames at the
 * new size come first: on a slow software-GL runner the first frame after a resize can stall past 2 s and pause.
 */
async function settle(){
 const r=await host(()=>window.__bincovSample.host.lastBatch.stamp.revision);
 await page.waitForFunction(r=>window.__bincovSample.host.lastBatch.stamp.revision>=r+2,r,{timeout:20000});
 if(await host(()=>window.__bincovSample.host.panel==='pause')){await raid('resume').tap();await panelIs(null);}
 await running(page);
}
async function resize(width,height){await page.setViewportSize({width,height});await settle();}
/** Enemies frozen, the player on the road at (700, 784), healthy. */
async function fixture(){
 await drive('freezeAI',true);await drive('placePlayer',{x:700,y:784},0,'coast');
 const max=await host(()=>window.__bincovSample.host.lastBatch.frame.hud.maxHp);await drive('vitals',{hp:max,bleeding:false,pollution:0});
 await page.waitForFunction(()=>Math.abs(window.__bincovSample.host.lastBatch.frame.player.x-700)<1);
 await running(page);
}
/** Carried bag and safe through one validated session write (the same commit path a transfer uses). */
async function carry({bag,safe}){
 const ok=await host(([bag,safe])=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>{const l=d.expansion.raid.loadout;if(bag)l.bag.items=bag;if(safe)l.safe.items=safe;});return !!t&&s.commitExpansionMutation(t)==='committed';},[bag??null,safe??null]);
 assert.ok(ok,'carried inventory fixture committed');
}
/**
 * Arm a storage fault for the next trusted pointerdown on `selector` (the action button acts on press). It first waits for
 * a periodic checkpoint, so the next one is two seconds away and the pressed action is the write that fails.
 */
async function failWritesOnPointerdown(selector){const savedAt=await host(()=>window.__bincov.app.lastSavedAt);await page.waitForFunction(t=>window.__bincov.app.lastSavedAt>t,savedAt);await page.evaluate(selector=>{window.__write=Storage.prototype.setItem;window.__failedSessionWrites=0;const arm=e=>{if(!e.isTrusted||!(e.target instanceof Element)||!e.target.closest(selector))return;document.removeEventListener('pointerdown',arm,true);Storage.prototype.setItem=function(k,v){if(k==='escape-bincov.session.v2'){window.__failedSessionWrites++;throw new Error('Injected quota failure');}return window.__write.call(this,k,v);};};document.addEventListener('pointerdown',arm,true);},selector);}
/** Overlap area between the visible toast and every listed HUD element that is shown. */
const overlaps=(toastSel,targets)=>page.evaluate(([toastSel,targets])=>{const a=document.querySelector(toastSel).getBoundingClientRect();return [...document.querySelectorAll(targets.join(','))].filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&!el.hidden&&el.getBoundingClientRect().width>0;}).map(el=>{const b=el.getBoundingClientRect();return {text:el.textContent.trim().slice(0,30),area:Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y))}}).filter(x=>x.area>0);},[toastSel,targets]);
const toastOn=()=>page.waitForFunction(()=>document.querySelector('.coast-sample [data-toast]')?.classList.contains('on'),null,{timeout:20000});
const toastOff=()=>page.waitForFunction(()=>!document.querySelector('.coast-sample [data-toast]')?.classList.contains('on'),null,{timeout:20000});
try {
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await action('enter').tap({timeout:60000});await page.locator('#seed').fill('42');await action('deploy').tap();await ready();await fixture();
 await step('seven phone sizes have immediately reachable inventory and detail exits',async()=>{
  for(const [width,height] of [[667,375],[740,300],[740,340],[740,341],[844,390],[915,412],[932,430]]){
   await resize(width,height);await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');assert.ok(await reachable('.coast-sample [data-panel] [data-do="close"]'),`${width}x${height}: close`);
   // Bag and safe share one panel (no container tabs on the 2.5D view).
   assert.equal(await inPanel('[data-grid="safe"]').count(),1);assert.equal(await inPanel('[data-grid="bag"]').count(),1);
   await inPanel('[data-source="bag"][aria-label^="密封绷带"]').tap();await raid('inv-use').waitFor();
   // Details sit beside the bag and safe on phones: the close and the item's first action show without scrolling the panel.
   assert.ok(await reachable('.coast-sample [data-panel] [data-do="close"]'),`${width}x${height}: close with details`);
   assert.ok(await reachable('.coast-sample [data-do="inv-use"]'),`${width}x${height}: use`);
   if(width===740&&height===300)await shot('details-740');await raid('close').tap();await panelIs(null);
  }
 });
 await step('placement cancel and close/reopen keep inventory selectable and unchanged',async()=>{
  await resize(844,390);await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');const before=await host(()=>__bincov.app.loadout.bag);
  await inPanel('[data-source="bag"][aria-label^="密封绷带"]').tap();await raid('inv-place').tap();
  // The placement bar sits under the panel header, so 取消移动 shows without scrolling.
  assert.ok(await reachable('.coast-sample [data-do="inv-place-cancel"]'),'取消移动 is reachable');assert.ok(await inPanel('.placement-cell').count());
  await raid('inv-place-cancel').tap();assert.equal(await inPanel('.placement-cell').count(),0,'cancel leaves placement');
  await raid('inv-place').tap();assert.ok(await inPanel('.placement-cell').count());
  await raid('close').tap();await panelIs(null);await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');await inPanel('[data-source="bag"][aria-label^="密封绷带"]').tap();
  assert.equal(await host(()=>window.__bincovSample.host.inv.placement),null);assert.equal(await raid('inv-use').count(),1);
  assert.deepEqual(await host(()=>__bincov.app.loadout.bag),before);await shot('inventory-844');
  // A stall pause on a slow runner may have closed the panel already (resumeStalls resumed it).
  if(await host(()=>window.__bincovSample.host.panel==='inventory'))await raid('close').tap();await panelIs(null);
 });
 const feedbackTargets=['.coast-sample [data-prompt]','.coast-sample .cs-status','.coast-sample [data-radio]','.coast-sample .cs-arms','.coast-sample .cs-clock','.coast-sample .cs-info','.coast-sample .cs-touch button'];
 await step('success toast does not cover nearby text, warning or combat buttons',async()=>{
  for(const [width,height] of [[667,375],[740,300],[740,340],[740,341],[844,390],[915,412],[932,430]]){
   await resize(width,height);await fixture();await toastOff();
   await carry({bag:[]});await drive('vitals',{hp:53,bleeding:true});
   const fuse=await drive('spawnLoot','fuse',1,{x:700,y:784});await drive('spawnLoot','water',1,{x:720,y:784});
   await page.waitForFunction(()=>(document.querySelector('.coast-sample [data-prompt]')?.textContent??'').includes('陶瓷保险管'));await page.locator('.coast-sample [data-act]').tap();
   await page.waitForFunction(uid=>!window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid)&&(document.querySelector('.coast-sample [data-prompt]')?.textContent??'').includes('净水瓶'),fuse);
   await toastOn();
   // On short phones the toast sits above the touch buttons, so it covers neither the status card nor anything else.
   const overlap=await overlaps('.coast-sample [data-toast]',feedbackTargets);
   (report.toastOverlaps??=[]).push({size:`${width}x${height}`,step:'pickup',overlap});
   assert.deepEqual(overlap,[],`${width}x${height}`);
   // Phones have no keys: the medical shortcut shows no Q.
   assert.doesNotMatch(await page.locator('.coast-sample .cs-heal').innerText(),/Q/);
   if(width===844||width===740&&height===300)await shot(`feedback-${width}`);
  }
 });
 await step('three nearby items keep bleeding warnings clear after pickup on short phones',async()=>{
  report.threeItemFeedback=[];
  const cases=[[640,300],[640,340],[640,341],[667,375],[740,300],[740,340],[740,341],[844,390],[915,412],[932,430]];
  for(const [width,height] of cases){
   await resize(width,height);await fixture();await toastOff();
   await carry({bag:[]});await drive('vitals',{hp:53,bleeding:true});
   const uids=[await drive('spawnLoot','fuse',1,{x:700,y:784}),await drive('spawnLoot','water',1,{x:720,y:784}),await drive('spawnLoot','bandage',1,{x:730,y:784})];
   await page.waitForFunction(()=>(document.querySelector('.coast-sample [data-prompt]')?.textContent??'').includes('陶瓷保险管'));
   await page.locator('.coast-sample [data-act]').tap();
   await page.waitForFunction(uid=>!window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid),uids[0]);await toastOn();
   await page.waitForFunction(()=>document.querySelector('.coast-sample [data-drain]').innerText.includes('流血'));
   const label=`${width}x${height}: after pickup`;
   const geometry=await page.evaluate(()=>{const t=document.querySelector('.coast-sample [data-toast]').getBoundingClientRect();return {toast:t.toJSON(),width:innerWidth,height:innerHeight,drain:document.querySelector('.coast-sample [data-drain]').innerText};});
   // The bleeding readout lives in the status card, so the card itself is left out of its own check.
   const overlap=await overlaps('.coast-sample [data-toast]',feedbackTargets),drainOverlap=await overlaps('.coast-sample [data-drain]',feedbackTargets.filter(s=>!s.endsWith('.cs-status')));
   report.threeItemFeedback.push({label,...geometry,overlap,drainOverlap});
   (report.toastOverlaps??=[]).push({size:`${width}x${height}`,step:'three items',overlap});
   assert.deepEqual(overlap,[],label);
   assert.deepEqual(drainOverlap,[],`${label}: bleeding readout and controls`);
   assert.ok(geometry.toast.x>=0&&geometry.toast.right<=geometry.width&&geometry.toast.y>=0&&geometry.toast.bottom<=geometry.height,label);
   // The 2.5D bleeding warning is the drain readout beside the health bar.
   assert.match(geometry.drain,/流血/,`${label}: bleeding readout`);
   assert.doesNotMatch(await page.locator('.coast-sample .cs-heal').innerText(),/Q/);
   if(width===640&&height===300)await shot('feedback-640');
   // 附近 (docs/LOOTING.md): with several loose items in reach, the list picks the chosen one without moving (once, at 844).
   if(width===844){
    const toggle=page.locator('.coast-sample [data-choices] [data-near-toggle]');await toggle.waitFor();assert.match(await toggle.innerText(),/附近 [2-9]/);
    const at=await host(()=>({...window.__bincovSample.host.lastBatch.frame.player}));
    await toggle.tap();const row=page.locator(`.coast-sample [data-choices] [data-ground="${uids[2]}"]`);await row.waitFor();await row.tap();
    await page.waitForFunction(uid=>!window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid),uids[2]);
    const now=await host(()=>({...window.__bincovSample.host.lastBatch.frame.player}));assert.ok(Math.hypot(now.x-at.x,now.y-at.y)<1,'附近 picks the item without moving');
   }
   await page.waitForFunction(()=>(document.querySelector('.coast-sample [data-prompt]')?.textContent??'').includes('净水瓶'));
   await toastOff();
  }
 });
 await step('two quick pickups of the same supply count up in one toast',async()=>{
  await resize(844,390);await fixture();await toastOff();await carry({bag:[]});
  const uids=[await drive('spawnLoot','bandage',1,{x:700,y:784}),await drive('spawnLoot','bandage',1,{x:712,y:784})];
  const left=()=>host(uids=>uids.filter(uid=>window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid)).length,uids);
  // Both pickups must land inside the toast's 2.8 s: the action button stays put, so it is tapped directly rather than
  // through a locator that first waits for it to hold still across frames (seconds on a slow software-GL runner).
  const act=await page.locator('.coast-sample [data-act]').boundingBox(),at={x:act.x+act.width/2,y:act.y+act.height/2};
  for(const n of [1,0]){
   await page.waitForFunction(()=>(document.querySelector('.coast-sample [data-prompt]')?.textContent??'').includes('密封绷带'));
   await page.touchscreen.tap(at.x,at.y);
   await page.waitForFunction(([uids,n])=>uids.filter(uid=>window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid)).length===n,[uids,n]);
  }
  assert.equal(await left(),0);
  assert.equal(await page.locator('.coast-sample [data-toast]').textContent(),'获得 密封绷带 ×1 × 2');
  await toastOff();
 });
 await step('notch insets keep the HUD and touch buttons in the safe area and world markers on their targets',async()=>{
  report.safeArea=[];
  for(const [width,height,left,right,bottom] of [[932,430,44,12,20],[844,390,47,47,21],[667,375,0,44,0]]){
   await resize(width,height);await insets(left,right,bottom);await settle();await fixture();await toastOff();await carry({bag:[]});
   const uid=await drive('spawnLoot','water',1,{x:712,y:784});
   await page.waitForFunction(()=>(document.querySelector('.coast-sample [data-prompt]')?.textContent??'').includes('净水瓶'));
   const g=await page.evaluate(()=>{
    const h=window.__bincovSample.host,t=h.lastBatch.frame.interaction,want=h.view.worldToClient(t.at),pr=document.querySelector('.coast-sample [data-prompt]').getBoundingClientRect();
    const safe=document.querySelector('.coast-sample .cs-hud').getBoundingClientRect().toJSON();
    const cards=['.cs-status','.cs-clock','.cs-arms','.cs-info','.cs-touch button'].flatMap(s=>[...document.querySelectorAll('.coast-sample '+s)]).filter(el=>el.getBoundingClientRect().width>0)
     .map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent.trim().slice(0,12),out:r.left<safe.left-.5||r.right>safe.right+.5||r.top<safe.top-.5||r.bottom>safe.bottom+.5};});
    return {safe,prompt:Math.round(pr.left+pr.width/2),want:Math.round(want.x),outside:cards.filter(c=>c.out).map(c=>c.text)};
   });
   const label=`${width}x${height} insets ${left}/${right}/${bottom}`;report.safeArea.push({label,...g});
   assert.deepEqual(g.outside,[],`${label}: HUD cards and touch buttons stay inside the safe area`);
   assert.ok(Math.abs(g.prompt-g.want)<=1,`${label}: the prompt sits over its item (${g.prompt} vs ${g.want})`);
   // The pickup toast still covers no HUD element with the insets in place.
   await page.locator('.coast-sample [data-act]').tap();
   await page.waitForFunction(uid=>!window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid),uid);await toastOn();
   assert.deepEqual(await overlaps('.coast-sample [data-toast]',feedbackTargets),[],`${label}: toast`);
   if(width===932)await shot('safe-area-932');
   await toastOff();
  }
  await insets();
 });
 await step('short phone reading remains visible with reachable exit and a live clock',async()=>{
  for(const height of [300,340,341]){
  await resize(740,height);await fixture();
  const note=await host(()=>window.__bincovSample.host.lastBatch.map.notes.find(n=>n.title==='水产站维修单').at);await drive('placePlayer',note,0,'coast');
  await page.waitForFunction(()=>document.querySelector('.coast-sample [data-act]')?.textContent==='阅读');await page.locator('.coast-sample [data-act]').tap();await panelIs('reading');
  assert.match(await page.locator('.coast-sample .cs-reading').innerText(),/泵机零件三个/);assert.ok(await reachable('.coast-sample [data-panel] [data-do="close"]'));
  const before=await host(()=>window.__bincovSample.host.lastBatch.stamp.simulationTime);
  await page.waitForFunction(t=>window.__bincovSample.host.lastBatch.stamp.simulationTime>t,before);if(height===300)await shot('reading-740');await raid('close').tap();await panelIs(null);
  }
 });
 await step('short phone reload is visible on its button',async()=>{
  for(const height of [300,340,341]){
  await resize(740,height);await fixture();await carry({bag:[{uid:'ux-ammo',id:'ammo9',qty:12,x:0,y:0}]});await drive('magazine',1);
  await page.locator('.coast-sample [data-reload]').tap();
  // The magazine readout and the weapon card show the reload; the button keeps its label.
  await page.waitForFunction(()=>document.querySelector('.coast-sample [data-mag]').textContent==='换弹中'&&document.querySelector('.coast-sample [data-weapon]').classList.contains('reloading'));
  assert.ok(await reachable('.coast-sample [data-reload]'));if(height===300)await shot('reload-740');
  await page.waitForFunction(()=>!window.__bincovSample.host.lastBatch.frame.hud.weapon.reloading);
  }
 });
 await step('nearby list picks the stackable item without moving; failure restores world and bag',async()=>{
  await resize(844,390);await fixture();
  await carry({bag:Array.from({length:30},(_,i)=>({uid:'ux-b'+i,id:'bandage',qty:i?4:3,x:i%6,y:Math.floor(i/6)}))});
  // The stack lies under the player, the water just beside it: the action button takes the nearest (the stack).
  const id=await drive('spawnLoot','bandage',3,{x:700,y:784}),water=await drive('spawnLoot','water',1,{x:720,y:784});
  await page.waitForFunction(()=>(document.querySelector('.coast-sample [data-prompt]')?.textContent??'').includes('密封绷带'));
  const snapshot=()=>host(([id,water])=>({bag:__bincov.app.loadout.bag,loot:window.__bincov.saveSession.captureExpansion().raid.maps.coast.loot.filter(l=>l.uid===id||l.uid===water)}),[id,water]);
  const before=await snapshot();
  await failWritesOnPointerdown('.coast-sample [data-act]');
  await page.locator('.coast-sample [data-act]').tap();
  await page.waitForFunction(()=>window.__bincovSample.host.panel==='pause'&&!!document.querySelector('.coast-sample [data-do="retry-save"]'));
  assert.ok(await host(()=>window.__bincovSample.host.eventLog.some(e=>e.type==='rejected'&&e.detail.action==='pickup'&&e.detail.reason==='save-failed')),'the pickup itself was the failed write');
  assert.deepEqual(await snapshot(),before,'a failed pickup restores both the world and the bag');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__write;});assert.ok(await host(()=>window.__failedSessionWrites)>0);
  await raid('retry-save').tap();await panelIs(null);await running(page);
  await page.locator('.coast-sample [data-act]').tap();
  await page.waitForFunction(()=>__bincov.app.loadout.bag.items.reduce((n,i)=>n+i.qty,0)===120);
  const after=await snapshot();
  assert.deepEqual(after.loot.map(l=>[l.uid===id?'stack':'water',l.qty]).sort(),[['stack',2],['water',1]],'one bandage fits; the rest and the water stay on the ground');
  await shot('nearby-844');
  // Picking one named loose item through 附近 is checked in the three-items step; the old "附近没有…" empty state is gone
  // by design (the 附近 row leaves with the last item in reach).
 });
 await step('quick therapy does not consume safe medicine; supply picker explicitly uses it',async()=>{
  await fixture();await drive('vitals',{hp:40});
  await carry({bag:[],safe:[{uid:'ux-medkit',id:'medkit',qty:1,x:0,y:0},{uid:'ux-relief-bandage',id:'bandage',qty:1,x:0,y:1,relief:true},{uid:'ux-normal-bandage',id:'bandage',qty:1,x:1,y:1}]});
  const hp=()=>host(()=>window.__bincovSample.host.lastBatch.frame.hud.hp);
  await page.locator('.coast-sample [data-heal]').tap();
  // Quick therapy uses only the bag: the radio says there is nothing to use.
  await page.waitForFunction(()=>(document.querySelector('.coast-sample [data-radio]')?.textContent??'').includes('背包中没有绷带或急救包'));
  assert.equal(await hp(),40);assert.equal(await host(()=>__bincov.app.loadout.safe.items[0].qty),1);
  await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');assert.ok(await reachable('.coast-sample [data-panel] [data-do="close"]'));await shot('supplies-844');
  await inPanel('[data-uid="ux-medkit"]').tap();await raid('inv-use').tap();await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.hud.hp===95);
  assert.equal(await host(()=>__bincov.app.loadout.safe.items.length),2);
  await drive('vitals',{hp:60});await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.hud.hp===60);
  await inPanel('[data-uid="ux-normal-bandage"]').tap();await raid('inv-use').tap();await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.hud.hp===76);
  assert.deepEqual(await host(()=>__bincov.app.loadout.safe.items.map(i=>[i.uid,i.qty,i.relief])),[['ux-relief-bandage',1,true]]);await raid('close').tap();await panelIs(null);
 });
 await step('rotated safe restores from the durable checkpoint after refresh',async()=>{
  await carry({safe:[{uid:'ux-med',id:'medkit',qty:1,x:0,y:0},{uid:'ux-water',id:'water',qty:1,x:0,y:1,rotated:true}]});
  assert.equal(await host(()=>window.__bincovSample.host.services.checkpoint()),true);
  const safe=await host(()=>__bincov.app.loadout.safe);await openPause(page,()=>page.locator('.coast-sample [data-pause]').tap());
  report.stallResumes=await stallResumes(page);
  await page.reload();await action('enter').tap({timeout:60000});await ready();await drive('freezeAI',true);
  assert.deepEqual(await host(()=>__bincov.app.loadout.safe),safe);await panelIs('pause');
  await raid('resume').tap();await panelIs(null);await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');await shot('rotated-safe-844');
 });
 await step('manual rotation preview cancels unchanged and failed placement rolls back',async()=>{
  await raid('close').tap();await panelIs(null);
  await carry({bag:[{uid:'ux-rotate-water',id:'water',qty:1,x:0,y:0},{uid:'ux-block',id:'bandage',qty:1,x:1,y:0}]});
  await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');
  const before=await host(()=>__bincov.app.loadout.bag),placement=()=>host(()=>window.__bincovSample.host.inv.placement);
  // The bandage beside it blocks a turn in place, so 旋转 previews the turned shape for placement.
  await inPanel('[data-uid="ux-rotate-water"]').tap();await raid('inv-rotate').tap();
  assert.deepEqual(await placement(),{rotated:true});assert.ok(await inPanel('.placement-cell').count());
  await raid('inv-place-cancel').tap();assert.equal(await placement(),null);assert.deepEqual(await host(()=>__bincov.app.loadout.bag),before);
  const cellAt=async(x,y)=>page.locator('.coast-sample [data-panel] [data-grid="bag"]').evaluate((el,[x,y])=>{const c=Number(el.dataset.cell);return {x:x*c+c/2,y:y*c+c/2};},[x,y]);
  await inPanel('[data-uid="ux-rotate-water"]').tap();await raid('inv-rotate').tap();
  await failSessionWritesOnClick(page,'.coast-sample [data-grid="bag"]');
  await inPanel('[data-grid="bag"]').tap({position:await cellAt(0,1)});
  await page.waitForFunction(()=>window.__bincovSample.host.panel==='pause'&&!!document.querySelector('.coast-sample [data-do="retry-save"]'));
  assert.deepEqual(await host(()=>__bincov.app.loadout.bag),before);assert.equal(await placement(),null);
  await restoreSessionWrites(page);await raid('retry-save').tap();await panelIs(null);await running(page);
  await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');await inPanel('[data-uid="ux-rotate-water"]').tap();await raid('inv-rotate').tap();
  await inPanel('[data-grid="bag"]').tap({position:await cellAt(0,1)});
  await page.waitForFunction(()=>{const i=__bincov.app.loadout.bag.items.find(i=>i.uid==='ux-rotate-water');return i.x===0&&i.y===1&&i.rotated===true;});
  await raid('close').tap();await panelIs(null);
 });
 await step('desktop rotation preview can cancel, leave its tab and commit in both required sizes',async()=>{
  for(const viewport of [{width:1280,height:720},{width:1920,height:1080}]){
   const desktop=await browser.newContext({viewport,offline:true});await resumeStalls(desktop);
   desktop.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url())});
   try{
    const p=await desktop.newPage();p.on('pageerror',e=>report.errors.push(e.message));
    await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await p.locator('[data-action="enter"]').click({timeout:60000});
    await p.evaluate(()=>{__bincov.app.save.bag.items=[{uid:'desktop-water',id:'water',qty:1,x:0,y:0},{uid:'desktop-block',id:'bandage',qty:1,x:1,y:0}];});
    await p.locator('[data-action="tab"][data-id="gear"]').click();const before=await p.evaluate(()=>__bincov.app.save.bag);
    await p.locator('[data-uid="desktop-water"]').click();await p.locator('[data-action="rotate-item"]').click();await p.locator('[data-action="clear-selection"]').click();assert.deepEqual(await p.evaluate(()=>__bincov.app.save.bag),before);
    await p.locator('[data-uid="desktop-water"]').click();await p.locator('[data-action="rotate-item"]').click();await p.locator('[data-action="tab"][data-id="med"]').click();await p.locator('[data-action="tab"][data-id="gear"]').click();assert.equal(await p.evaluate(()=>__bincov.app.placement),false);
    await p.locator('[data-uid="desktop-water"]').click();await p.locator('[data-action="rotate-item"]').click();const grid=p.locator('[data-grid="bag"]'),box=await grid.boundingBox();await grid.click({position:{x:box.width/12,y:box.height*1.5/5}});assert.deepEqual(await p.evaluate(()=>{const i=__bincov.app.save.bag.items.find(i=>i.uid==='desktop-water');return[i.x,i.y,i.rotated]}),[0,1,true]);
   }finally{await desktop.close();}
  }
 });
 if(process.env.BINCOV_LEGACY_HTML) await step('actual v0.2.0 raid migrates once; old HTML refuses the rotated record without overwriting',async()=>{
  let legacyContext=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,offline:true});
  const track=c=>{c.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url())});c.on('page',p=>p.on('pageerror',e=>report.errors.push(e.message)))};track(legacyContext);
  const legacyUrl=pathToFileURL(resolve(process.env.BINCOV_LEGACY_HTML)).href+'?test=1&entry=tabs';
  try{
   const oldPage=await legacyContext.newPage();await oldPage.goto(legacyUrl);await oldPage.locator('[data-action="enter"]').tap();await oldPage.locator('#seed').fill('42');await oldPage.locator('[data-action="deploy"]').tap();await oldPage.waitForFunction(()=>__bincov.app.raid?.player?.active);await oldPage.locator('[data-panel="pause"]').tap();
   const bytes=await oldPage.evaluate(()=>localStorage.getItem('escape-bincov.session.v2'));assert.equal(JSON.parse(bytes).version,2);await legacyContext.close();
   legacyContext=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,offline:true});
   track(legacyContext);await legacyContext.addInitScript(bytes=>{if(location.protocol!=='file:')return;const key='escape-bincov.session.v2';if(!localStorage.getItem(key))localStorage.setItem(key,bytes);window.__beforeRecord=localStorage.getItem(key);},bytes);
   const next=await legacyContext.newPage();await next.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await next.waitForFunction(()=>window.__bincov);
   assert.equal(await next.evaluate(()=>__bincov.saveSession.currentRecord().migrationBackup),bytes);assert.equal(await next.evaluate(()=>__bincov.app.checkpoint.version),2);
   // The migrated raid resumes on the 2.5D host, paused; turning the water in place commits through the raid's inventory.
   await next.locator('[data-action="enter"]').tap();await next.waitForFunction(()=>window.__bincovSample?.host?.panel==='pause');await next.locator('.coast-sample [data-do="resume"]').tap();
   await next.waitForFunction(()=>window.__bincovSample.host.panel===null);await next.locator('.coast-sample [data-bag]').tap();
   await next.locator('.coast-sample [data-panel] [data-source="bag"][aria-label^="净水瓶"]').tap();await next.locator('.coast-sample [data-do="inv-rotate"]').tap();
   await next.waitForFunction(()=>__bincov.app.loadout.bag.items.find(i=>i.id==='water').rotated===true);await next.close();
   const refused=await legacyContext.newPage();await refused.goto(legacyUrl);await refused.getByRole('heading',{name:'暂时无法打开存档'}).waitFor();assert.equal(await refused.evaluate(()=>__bincov.app.storageOK),false);assert.match(await refused.evaluate(()=>__bincov.app.storageError),/无法读取这份存档/);assert.equal(await refused.evaluate(()=>localStorage.getItem('escape-bincov.session.v2')===window.__beforeRecord),true);
  }finally{await legacyContext.close();}
 });
 report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;console.error(error);await shot('failure').catch(()=>{});}
finally{await context.close();await browser.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));}
