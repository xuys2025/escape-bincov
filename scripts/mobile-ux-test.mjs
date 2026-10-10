import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORLD } from '../src/world.ts';
import { browserOptions } from './browser-options.mjs';
import { failSessionWritesOnClick, restoreSessionWrites } from './storage-fault.mjs';

const out=resolve('test-results/mobile-ux'); await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),method:'Offline Chromium touch emulation, trusted taps and explicit ?test=1 fixtures. Includes failure injection; not physical phone validation.',steps:[],errors:[],requests:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,offline:true});
const page=await context.newPage();page.setDefaultTimeout(12000);
page.on('pageerror',e=>report.errors.push(e.message));context.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url())});
const action=(name,id)=>page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
const shot=name=>page.screenshot({path:resolve(out,`${name}.png`)});
async function step(name,fn){const e={name,status:'running'};report.steps.push(e);try{await fn();assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);e.status='passed';console.log('PASS',name)}catch(error){e.status='failed';e.error=error.stack;throw error}}
async function reachable(selector){return page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>=48&&r.height>=48&&r.y>=0&&r.bottom<=innerHeight&&r.x>=0&&r.right<=innerWidth&&!!hit&&(hit===el||el.contains(hit));})}
async function resize(width,height){await page.setViewportSize({width,height});await page.waitForTimeout(150);if(await action('close').count())await action('close').tap();}
async function fixture(){await page.evaluate(()=>{const r=__bincov.app.raid;r.player.setPosition(700,784);r.hp=100;r.bleeding=0;r.pollution=0;r.enemies.forEach(e=>{e.cooldown=9999;});r.bullets.forEach(b=>b.sprite.destroy());r.bullets=[];});}
try {
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await action('enter').tap();await page.locator('#seed').fill('42');await action('deploy').tap();await page.waitForFunction(()=>__bincov.app.raid?.player?.active);await fixture();
 await step('seven phone sizes have immediately reachable inventory and detail exits',async()=>{
  for(const [width,height] of [[667,375],[740,300],[740,340],[740,341],[844,390],[915,412],[932,430]]){
   await resize(width,height);await page.locator('[data-panel="inventory"]').tap();assert.ok(await reachable('[data-action="close"]'));
   await action('run-container','safe').tap();assert.equal(await page.locator('[data-grid="safe"]').count(),1);
   await action('run-container','bag').tap();await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();assert.ok(await reachable('[data-action="clear-selection"]'));
   if(width===740)await shot('details-740');await action('clear-selection').tap();await action('close').tap();
  }
 });
 await step('placement cancel and close/reopen keep inventory selectable and unchanged',async()=>{
  await resize(844,390);await page.locator('[data-panel="inventory"]').tap();const before=await page.evaluate(()=>__bincov.app.loadout.bag);
  await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();await action('place-item').tap();assert.ok(await reachable('[data-action="clear-selection"]'));assert.ok(await page.locator('.placement-cell').count());
  await action('close').tap();await page.locator('[data-panel="inventory"]').tap();await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();assert.equal(await page.evaluate(()=>__bincov.app.placement),false);assert.equal(await action('use').count(),1);
  await action('clear-selection').tap();assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.bag),before);await shot('inventory-844');await action('close').tap();
 });
 await step('success toast does not cover nearby text, warning or combat buttons',async()=>{
  for(const [width,height] of [[667,375],[740,300],[740,340],[740,341],[844,390],[915,412],[932,430]]){
   await resize(width,height);
   if(width===932){await page.evaluate(()=>{const s=document.documentElement.style;s.setProperty('--safe-left','44px');s.setProperty('--safe-right','12px');s.setProperty('--safe-bottom','20px');dispatchEvent(new Event('resize'))});if(await action('close').count())await action('close').tap();}
   await fixture();
   await page.evaluate(()=>{const r=__bincov.app.raid;r.hp=53;r.bleeding=1;r.loot.forEach(l=>l.sprite.destroy());r.loot=[];__bincov.app.loadout.bag.items=[];r.spawnLoot(700,784,'fuse',1);r.spawnLoot(720,784,'water',1);});
   await page.waitForFunction(()=>document.getElementById('interaction').textContent.includes('陶瓷保险管'));await page.locator('#touch-interact').tap();
   await page.waitForFunction(()=>document.getElementById('interaction').textContent.includes('净水瓶')&&getComputedStyle(document.getElementById('toast')).opacity==='1');
   const overlap=await page.evaluate(()=>{const a=document.getElementById('toast').getBoundingClientRect();return [document.getElementById('interaction'),document.querySelector('.banner'),...document.querySelectorAll('#touch-controls button')].filter(Boolean).map(el=>{const b=el.getBoundingClientRect();return {text:el.textContent,area:Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y))}}).filter(x=>x.area>0);});
   assert.deepEqual(overlap,[],`${width}x${height}`);assert.doesNotMatch(await page.locator('#warning').innerText(),/Q/);
   if(width===844||width===740)await shot(`feedback-${width}`);
  }
  await page.evaluate(()=>{for(const key of ['--safe-left','--safe-right','--safe-bottom'])document.documentElement.style.removeProperty(key);dispatchEvent(new Event('resize'))});
 });
 await step('three nearby items keep bleeding warnings clear after pickup on short phones',async()=>{
  report.threeItemFeedback=[];
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  const cases=[[640,300],[640,340],[640,341],[667,375],[740,300],[740,340],[740,341],[844,390],[915,412],[932,430],[640,300,true],[640,341,true],[740,300,true]];
  async function threeItems(){
   await page.evaluate(()=>{const {app}=__bincov,r=app.raid;r.hp=53;r.bleeding=1;r.loot.forEach(l=>l.sprite.destroy());r.loot=[];app.loadout.bag.items=[];r.spawnLoot(700,784,'fuse',1);r.spawnLoot(720,784,'water',1);r.spawnLoot(730,784,'bandage',1);});
   await page.waitForFunction(()=>document.querySelector('[data-action="nearby"]')?.textContent==='附近 3');
  }
  async function clearFeedback(label){
   const geometry=await page.evaluate(()=>{
    const toast=document.getElementById('toast'),a=toast.getBoundingClientRect(),warning=document.querySelector('.banner'),w=warning.getBoundingClientRect();
    const targets=['#interaction','.banner','#radio','.vitals','.weapon-hud','.hud-top','#touch-controls button','.stick'];
    const visible=[...document.querySelectorAll(targets.join(','))].filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'});
    const overlap=visible.map(el=>{const b=el.getBoundingClientRect();return {text:el.textContent,area:Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y))}}).filter(x=>x.area>0);
    const warningOverlap=visible.filter(el=>el!==warning).map(el=>{const b=el.getBoundingClientRect();return {text:el.textContent,area:Math.max(0,Math.min(w.right,b.right)-Math.max(w.x,b.x))*Math.max(0,Math.min(w.bottom,b.bottom)-Math.max(w.y,b.y))}}).filter(x=>x.area>0);
    return {toast:{text:toast.textContent,...a.toJSON()},warning:w.toJSON(),interaction:document.getElementById('interaction').getBoundingClientRect().toJSON(),overlap,warningOverlap,width:innerWidth,height:innerHeight};
   });
   report.threeItemFeedback.push({label,...geometry});
   assert.deepEqual(geometry.overlap,[],label);
   assert.deepEqual(geometry.warningOverlap,[],`${label}: warning and controls`);
   assert.ok(geometry.toast.x>=0&&geometry.toast.right<=geometry.width&&geometry.toast.y>=0&&geometry.toast.bottom<=geometry.height,label);
   assert.match(await page.locator('#warning').innerText(),/持续流血.*治疗/);
   assert.doesNotMatch(await page.locator('#warning').innerText(),/Q/);
  }
  for(const [width,height,safe] of cases){
   await resize(width,height);
   await page.evaluate(safe=>{const s=document.documentElement.style;for(const [key,value] of [['--safe-left','44px'],['--safe-right','12px'],['--safe-bottom','20px']]){if(safe)s.setProperty(key,value);else s.removeProperty(key)}dispatchEvent(new Event('resize'));},safe);
   if(await action('close').count())await action('close').tap();await fixture();
   await threeItems();
   await page.locator('#touch-interact').tap();
   await page.waitForFunction(()=>document.querySelector('[data-action="nearby"]')?.textContent==='附近 2'&&getComputedStyle(document.getElementById('toast')).opacity==='1');
   await clearFeedback(`${width}x${height}${safe?' safe':''}: nearby 2`);assert.ok(await reachable('[data-action="nearby"]'));
   if(width===640&&height===300)await shot(safe?'feedback-640-safe':'feedback-640');
   await action('nearby').tap();assert.equal(await action('pickup-loot').count(),2);assert.ok(await reachable('[data-action="close"]'));await action('close').tap();
   // Panel round-trips and screenshots may outlast the real 1.5s success window.
   // Check coalescing separately with two immediate trusted pickup taps.
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0'&&!document.documentElement.dataset.toastKind);
   await threeItems();await page.locator('#touch-interact').tap();
   await page.waitForFunction(()=>document.querySelector('[data-action="nearby"]')?.textContent==='附近 2');
   await page.locator('#touch-interact').tap();
   await page.waitForFunction(()=>!document.querySelector('[data-action="nearby"]')&&document.getElementById('toast').textContent.includes('× 2'));
   await clearFeedback(`${width}x${height}${safe?' safe':''}: repeated pickup`);
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0'&&!document.documentElement.dataset.toastKind);
   assert.equal(await page.locator('#radio').evaluate(el=>getComputedStyle(el).visibility),'visible');
  }
  await page.evaluate(()=>{for(const key of ['--safe-left','--safe-right','--safe-bottom'])document.documentElement.style.removeProperty(key);dispatchEvent(new Event('resize'))});
 });
 await step('short phone reading remains visible with reachable exit and a live clock',async()=>{
  for(const height of [300,340,341]){
  await resize(740,height);await fixture();await page.evaluate(n=>{const r=__bincov.app.raid;r.loot.forEach(l=>l.sprite.destroy());r.loot=[];r.player.setPosition(n.x,n.y);},WORLD.notes[0]);
  await page.waitForFunction(()=>document.getElementById('touch-interact').textContent==='阅读');await page.locator('#touch-interact').tap();await page.waitForFunction(()=>__bincov.app.overlay==='reading');
  assert.match(await page.locator('.reading-text').innerText(),/泵机零件三个/);assert.ok(await reachable('[data-action="close"]'));
  const before=await page.evaluate(()=>__bincov.app.raid.elapsed);await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>__bincov.app.raid.elapsed)>before);if(height===300)await shot('reading-740');await action('close').tap();
  }
 });
 await step('short phone reload is visible on its button',async()=>{
  for(const height of [300,340,341]){
  await resize(740,height);await fixture();await page.evaluate(()=>{const {app}=__bincov;app.raid.mag=1;app.raid.knife=false;app.raid.reloadLeft=0;app.loadout.bag.items=[{uid:'ux-ammo',id:'ammo9',qty:12,x:0,y:0}];});
  await page.locator('[data-command="reload"]').tap();await page.waitForFunction(()=>document.querySelector('[data-command="reload"]').textContent.includes('s'));assert.ok(await reachable('[data-command="reload"]'));if(height===300)await shot('reload-740');await page.waitForFunction(()=>__bincov.app.raid.reloadLeft===0);
  }
 });
 await step('nearby list picks the stackable item without moving; failure restores world and bag',async()=>{
  await resize(844,390);await fixture();
  await page.evaluate(()=>{const {app}=__bincov,r=app.raid;app.loadout.bag.items=Array.from({length:30},(_,i)=>({uid:'ux-b'+i,id:'bandage',qty:i?4:3,x:i%6,y:Math.floor(i/6)}));r.loot.forEach(l=>l.sprite.destroy());r.loot=[];r.spawnLoot(700,784,'water',1);r.spawnLoot(720,784,'bandage',3);});
  await action('nearby').tap();const id=await page.evaluate(()=>__bincov.app.raid.loot.find(l=>l.id==='bandage').uid);
  const before=await page.evaluate(()=>({bag:__bincov.app.loadout.bag,loot:__bincov.app.raid.snapshot().loot}));
  await failSessionWritesOnClick(page,`[data-action="pickup-loot"][data-id="${id}"]`);
  await action('pickup-loot',id).tap();assert.equal(await page.evaluate(()=>__bincov.app.overlay),'checkpoint-error');assert.deepEqual(await page.evaluate(()=>({bag:__bincov.app.loadout.bag,loot:__bincov.app.raid.snapshot().loot})),before);
  await restoreSessionWrites(page);await action('retry-checkpoint').tap();await action('close').tap();await action('nearby').tap();await shot('nearby-844');await action('pickup-loot',id).tap();
  assert.equal(await page.evaluate(()=>__bincov.app.loadout.bag.items.reduce((n,i)=>n+i.qty,0)),120);assert.equal(await page.evaluate(()=>__bincov.app.raid.loot.length),2);assert.equal(await page.evaluate(()=>__bincov.app.raid.loot.find(l=>l.id==='bandage').qty),2);
  await page.evaluate(()=>{__bincov.app.raid.player.setPosition(1000,784);});await page.waitForFunction(()=>document.querySelector('.quick-body').textContent.includes('附近没有'));assert.equal(await action('pickup-loot').count(),0);await action('close').tap();
 });
 await step('quick therapy does not consume safe medicine; supply picker explicitly uses it',async()=>{
  await fixture();await page.evaluate(()=>{const {app}=__bincov;app.raid.hp=40;app.loadout.bag.items=[];app.loadout.safe.items=[{uid:'ux-medkit',id:'medkit',qty:1,x:0,y:0},{uid:'ux-relief-bandage',id:'bandage',qty:1,x:0,y:1,relief:true},{uid:'ux-normal-bandage',id:'bandage',qty:1,x:1,y:1}];});
  await page.locator('[data-command="heal"]').tap();await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>__bincov.app.raid.hp),40);assert.equal(await page.evaluate(()=>__bincov.app.loadout.safe.items[0].qty),1);
  await page.locator('[data-panel="supplies"]').tap();assert.ok(await reachable('[data-action="close"]'));await shot('supplies-844');await action('use-supply','ux-medkit').tap();assert.equal(await page.evaluate(()=>__bincov.app.raid.hp),95);assert.equal(await page.evaluate(()=>__bincov.app.loadout.safe.items.length),2);await page.evaluate(()=>{__bincov.app.raid.hp=60;});await action('use-supply','ux-normal-bandage').tap();assert.equal(await page.evaluate(()=>__bincov.app.raid.hp),76);assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.safe.items.map(i=>[i.uid,i.qty,i.relief])),[['ux-relief-bandage',1,true]]);await action('close').tap();
 });
 await step('rotated safe restores from the durable checkpoint after refresh',async()=>{
  await page.evaluate(()=>{const {app}=__bincov;app.loadout.safe.items=[{uid:'ux-med',id:'medkit',qty:1,x:0,y:0},{uid:'ux-water',id:'water',qty:1,x:0,y:1,rotated:true}];app.raid.checkpoint();});
  const safe=await page.evaluate(()=>__bincov.app.loadout.safe);await page.locator('[data-panel="pause"]').tap();await page.reload();await action('enter').tap();await page.waitForFunction(()=>__bincov.app.raid?.player?.active);assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.safe),safe);assert.equal(await page.evaluate(()=>__bincov.app.overlay),'pause');await action('close').tap();await page.locator('[data-panel="inventory"]').tap();await action('run-container','safe').tap();await shot('rotated-safe-844');
 });
 await step('manual rotation preview cancels unchanged and failed placement rolls back',async()=>{
  await action('run-container','bag').tap();await page.evaluate(()=>{__bincov.app.loadout.bag.items=[{uid:'ux-rotate-water',id:'water',qty:1,x:0,y:0},{uid:'ux-block',id:'bandage',qty:1,x:1,y:0}];__bincov.setOverlay('inventory');});
  const before=await page.evaluate(()=>__bincov.app.loadout.bag);
  await page.locator('[data-uid="ux-rotate-water"]').tap();await action('rotate-item').tap();assert.match(await page.locator('.placement-hint').innerText(),/2 × 1/);await action('clear-selection').tap();assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.bag),before);
  await page.locator('[data-uid="ux-rotate-water"]').tap();await action('rotate-item').tap();
  await failSessionWritesOnClick(page,'[data-grid="bag"]');
  await page.locator('[data-grid="bag"]').tap({position:{x:26,y:78}});assert.equal(await page.evaluate(()=>__bincov.app.overlay),'checkpoint-error');assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.bag),before);assert.equal(await page.evaluate(()=>__bincov.app.placement),false);
  await restoreSessionWrites(page);await action('retry-checkpoint').tap();await action('close').tap();await page.locator('[data-panel="inventory"]').tap();await page.locator('[data-uid="ux-rotate-water"]').tap();await action('rotate-item').tap();await page.locator('[data-grid="bag"]').tap({position:{x:26,y:78}});
  assert.deepEqual(await page.evaluate(()=>{const i=__bincov.app.loadout.bag.items.find(i=>i.uid==='ux-rotate-water');return [i.x,i.y,i.rotated]}),[0,1,true]);
 });
 await step('desktop rotation preview can cancel, leave its tab and commit in both required sizes',async()=>{
  for(const viewport of [{width:1280,height:720},{width:1920,height:1080}]){
   const desktop=await browser.newContext({viewport,offline:true});
   desktop.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url())});
   try{
    const p=await desktop.newPage();p.on('pageerror',e=>report.errors.push(e.message));
    await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await p.locator('[data-action="enter"]').click();
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
   await next.locator('[data-action="enter"]').tap();await next.waitForFunction(()=>__bincov.app.raid?.player?.active);await next.locator('[data-action="close"]').tap();await next.locator('[data-panel="inventory"]').tap();await next.locator('[data-source="bag"][aria-label^="净水瓶"]').tap();await next.locator('[data-action="rotate-item"]').tap();assert.equal(await next.evaluate(()=>__bincov.app.loadout.bag.items.find(i=>i.id==='water').rotated),true);await next.close();
   const refused=await legacyContext.newPage();await refused.goto(legacyUrl);await refused.getByRole('heading',{name:'暂时无法打开存档'}).waitFor();assert.equal(await refused.evaluate(()=>__bincov.app.storageOK),false);assert.match(await refused.evaluate(()=>__bincov.app.storageError),/无法读取这份存档/);assert.equal(await refused.evaluate(()=>localStorage.getItem('escape-bincov.session.v2')===window.__beforeRecord),true);
  }finally{await legacyContext.close();}
 });
 report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1;console.error(error);await shot('failure').catch(()=>{});}
finally{await context.close();await browser.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));}
