import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserOptions } from './browser-options.mjs';
import { failSessionWritesOnClick, restoreSessionWrites } from './storage-fault.mjs';

const out=resolve('test-results/mobile'); await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),method:'Chromium touch emulation with real CDP multi-touch, fault injection, complete checkpoint comparisons and offline requests blocked. Not physical iPhone/Android or Safari validation.',steps:[],errors:[],requests:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,offline:true,acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(12000);
page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
context.on('request',r=>{if(/^https?:/.test(r.url())) report.requests.push(r.url())});
const action=(name,id)=>page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
const shot=name=>page.screenshot({path:resolve(out,`${name}.png`)});
const runtime=()=>page.evaluate(()=>{const {app}=__bincov,r=app.raid;return {state:app.state,overlay:app.overlay,storageOK:app.storageOK,error:app.storageError,stats:app.save.stats,raid:r?{x:r.player.x,y:r.player.y,elapsed:r.elapsed,mag:r.mag,hp:r.hp}:null}});
async function step(name,fn){const entry={name,status:'running'};report.steps.push(entry);try{await fn();assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);entry.status='passed';console.log('PASS',name)}catch(e){entry.status='failed';entry.error=e.stack;throw e}}
const center=async selector=>{const r=await page.locator(selector).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2}};
let cdp;
const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:2,radiusY:2,force:1}))});
try{
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await action('enter').waitFor();cdp=await context.newCDPSession(page);
 await step('portrait hideout matrix keeps controls readable and reachable',async()=>{
  await shot('menu-390');await action('enter').tap();
  for(const [width,height] of [[360,800],[390,844],[412,915],[430,932],[375,667]]){
   await page.setViewportSize({width,height});await action('tab','gear').tap();
   const result=await page.evaluate(()=>{const panel=document.querySelector('.hideout').getBoundingClientRect(), button=document.querySelector('[data-action="deploy"]').getBoundingClientRect();return {panel:{x:panel.x,y:panel.y,right:panel.right,bottom:panel.bottom},button:{width:button.width,height:button.height,bottom:button.bottom},overflow:document.documentElement.scrollWidth>innerWidth}});
   assert.ok(result.panel.right<=width+1 && result.panel.bottom<=height+1);assert.ok(result.button.height>=48 && result.button.bottom<=height);assert.equal(result.overflow,false);
  }
  await page.setViewportSize({width:390,height:844});await shot('gear-390');
  for(const tab of ['arms','med','quests','home']){await action('tab',tab).tap();assert.ok(await action('deploy').isVisible());}
  await shot('station-390');await action('tab','gear').tap();
 });
 await step('tap inventory transfers, native scroll and explicit grid placement',async()=>{
  const bandage=page.locator('[data-source="bag"][aria-label^="密封绷带"]');await bandage.tap();
  await action('secure').tap();assert.equal(await page.evaluate(()=>__bincov.app.save.safe.items.find(i=>i.id==='bandage')?.qty),2);
  await action('container','safe').tap();await page.locator('[data-source="safe"][aria-label^="密封绷带"]').tap();await action('secure').tap();
  await action('container','bag').tap();await bandage.tap();await action('place-item').tap();
  await page.locator('[data-grid="bag"]').tap({position:{x:5*52+26,y:4*52+26}});
  assert.deepEqual(await page.evaluate(()=>{const i=__bincov.app.save.bag.items.find(i=>i.id==='bandage');return [i.x,i.y]}),[5,4]);
  await action('container','stash').tap();assert.ok(await page.locator('.inventory-row').count());await page.locator('.inventory-row').first().tap();await shot('item-details-390');await action('clear-selection').tap();
  await action('container','bag').tap();await page.setViewportSize({width:844,height:390});await page.locator('#seed').fill('42');await action('deploy').tap();await page.waitForFunction(()=>__bincov.app.raid?.player?.active);
  await page.evaluate(()=>{const r=__bincov.app.raid;r.player.setPosition(700,784);r.enemies.forEach(e=>{e.cooldown=9999;});});
 });
 await step('two trusted touch pointers move and fire together; release stops fire',async()=>{
  const left=await center('.move-stick'),right=await center('.aim-stick'),before=await runtime();
  await touch('touchStart',[{id:1,...left}]);await touch('touchStart',[{id:1,...left},{id:2,...right}]);
  await touch('touchMove',[{id:1,x:left.x+32,y:left.y},{id:2,x:right.x+34,y:right.y}]);await page.waitForTimeout(850);
  const after=await runtime();assert.ok(after.raid.x>before.raid.x+30,JSON.stringify(after));assert.ok(after.raid.mag<=before.raid.mag-2,JSON.stringify(after));
  await shot('combat-844');await touch('touchEnd',[]);const stopped=(await runtime()).raid;await page.waitForTimeout(650);
  const later=(await runtime()).raid;assert.equal(later.mag,stopped.mag);assert.ok(Math.abs(later.x-stopped.x)<1);
 });
 await step('rejected healing preserves the other thumb movement without consuming medicine',async()=>{
  await page.evaluate(()=>{const r=__bincov.app.raid;r.hp=100;r.bleeding=0;r.player.setPosition(700,784);});
  const before=await page.evaluate(()=>__bincov.app.loadout.bag),left=await center('.move-stick'),heal=await center('[data-command="heal"]');
  const held={id:4,x:left.x+32,y:left.y};
  await touch('touchStart',[held]);await page.waitForTimeout(150);
  await touch('touchStart',[held,{id:5,...heal}]);await page.waitForTimeout(150);
  // CDP touchMove carries the remaining active points; touchEnd would release every finger.
  await touch('touchMove',[held]);const rejected=(await runtime()).raid;
  await page.waitForTimeout(350);const after=(await runtime()).raid;
  await touch('touchEnd',[]);
  assert.match(await page.locator('#toast').innerText(),/生命已满/);
  assert.equal(after.hp,100);assert.ok(after.x>rejected.x+15,JSON.stringify({rejected,after}));
  assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.bag),before);
 });
 await step('pointer cancellation and rotation never leave movement, fire or extraction held',async()=>{
  const right=await center('.aim-stick');await touch('touchStart',[{id:3,x:right.x+34,y:right.y}]);await page.waitForTimeout(100);await touch('touchCancel',[]);
  const mag=(await runtime()).raid.mag;await page.waitForTimeout(400);assert.equal((await runtime()).raid.mag,mag);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>__bincov.app.overlay==='rotate');
  const elapsed=(await runtime()).raid.elapsed;await page.waitForTimeout(250);assert.equal((await runtime()).raid.elapsed,elapsed);await shot('rotate-390');
  await page.setViewportSize({width:844,height:390});await action('close').tap();
  await page.locator('[data-panel="pause"]').tap();const paused=(await runtime()).raid.elapsed;await page.waitForTimeout(200);assert.equal((await runtime()).raid.elapsed,paused);await action('close').tap();
 });
 await step('loot pickup commits removal with inventory; checkpoint restores bullets and RNG',async()=>{
  await page.evaluate(()=>{const r=__bincov.app.raid,l=r.loot.find(l=>l.id==='sample');r.player.setPosition(l.sprite.x,l.sprite.y);r.bullets.forEach(b=>b.sprite.destroy());r.bullets=[];});
  await page.waitForTimeout(200);await page.locator('#touch-interact').tap();
  await page.waitForFunction(()=>__bincov.app.loadout.bag.items.some(i=>i.id==='sample'));
  await page.locator('[data-panel="pause"]').tap();
  const expected=await page.evaluate(()=>{const {app}=__bincov;app.raid.reloadLeft=0;app.raid.fireCooldown=0;app.raid.shoot();app.raid.reloadLeft=.8;app.raid.fireCooldown=.15;app.raid.hp=72;app.raid.checkpoint();return app.checkpoint});
  await page.reload();await action('enter').waitFor();assert.equal(await page.evaluate(()=>__bincov.app.save.stats.runs),1);
  assert.deepEqual(await page.evaluate(()=>__bincov.app.checkpoint),expected);
  await action('enter').tap();await page.waitForFunction(()=>__bincov.app.raid?.player?.active);
  assert.equal((await runtime()).overlay,'pause');assert.deepEqual(await page.evaluate(()=>__bincov.app.raid.snapshot()),expected);
  assert.equal(await page.evaluate(()=>__bincov.app.raid.loot.some(l=>l.id==='sample')),false);
  await shot('restored-844');
 });
 await step('live backup round trip and failed medical transaction preserve consistent state',async()=>{
  const promise=page.waitForEvent('download');await action('export-save').tap();const file=resolve(out,'live-backup.json');await (await promise).saveAs(file);
  const backup=JSON.parse(await readFile(file,'utf8'));assert.equal(backup.formatVersion,4);assert.equal(backup.record.expansion.version,2);assert.equal(backup.record.raid.hp,72);
  await action('close').tap();
  // The restored checkpoint deliberately includes an unfinished reload. Let it
  // settle before comparing the medical transaction's before/after loadout:
  // inventory stays live, so a concurrent reload legitimately moves ammunition.
  await page.waitForFunction(()=>__bincov.app.raid.reloadLeft===0);
  await page.locator('[data-panel="inventory"]').tap();
  await page.locator('[data-source="bag"][aria-label^="密封绷带"]').tap();
  const before=await page.evaluate(()=>({loadout:__bincov.app.loadout,hp:__bincov.app.raid.hp}));
  await failSessionWritesOnClick(page,'[data-action="use"]');
  await action('use').tap();assert.equal((await runtime()).overlay,'checkpoint-error');
  assert.deepEqual(await page.evaluate(()=>({loadout:__bincov.app.loadout,hp:__bincov.app.raid.hp})),before);
  await restoreSessionWrites(page);await action('retry-checkpoint').tap();assert.equal((await runtime()).storageOK,true);
  await action('close').tap();await page.locator('[data-panel="inventory"]').tap();await page.locator('[data-source="bag"][aria-label^="赤潮封存样本"]').tap();
  const beforeDrop=await page.evaluate(()=>({loadout:__bincov.app.loadout,loot:__bincov.app.raid.snapshot().loot}));
  await failSessionWritesOnClick(page,'[data-action="drop"]');
  await action('drop').tap();assert.equal((await runtime()).overlay,'checkpoint-error');
  assert.deepEqual(await page.evaluate(()=>({loadout:__bincov.app.loadout,loot:__bincov.app.raid.snapshot().loot})),beforeDrop);
  await restoreSessionWrites(page);await action('retry-checkpoint').tap();await action('close').tap();
  await page.locator('[data-panel="pause"]').tap();await action('abandon').tap();await action('confirm-abandon').tap();await action('return').tap();
  await action('tab','home').tap();await page.locator('#backup-file').setInputFiles(file);await action('confirm-import').tap();await action('enter').tap();await page.waitForFunction(()=>__bincov.app.raid?.player?.active);
  assert.equal((await runtime()).raid.hp,72);assert.equal((await runtime()).overlay,'pause');
 });
 await step('short landscape layout fits all active touch targets and map text remains readable',async()=>{
  for(const [width,height] of [[800,360],[844,390],[915,412],[932,430],[667,375],[740,300]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(180);if(await action('close').count())await action('close').tap();
   await page.waitForFunction(()=>__bincov.app.overlay==='');
   const bad=await page.locator('#touch-controls button, #touch-controls .stick').evaluateAll(nodes=>nodes.filter(el=>{const r=el.getBoundingClientRect();return r.width<48||r.height<48||r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1}).map(el=>el.getAttribute('aria-label')));
   assert.deepEqual(bad,[],`${width}x${height}`);
  }
  await shot('combat-740');await page.locator('[data-panel="map"]').tap();await shot('map-740');await action('close').tap();
 });
 await step('hold extraction is cancellable and successful settlement cannot restore the run',async()=>{
  await page.evaluate(()=>{const r=__bincov.app.raid,e=r.config.exits[0];r.player.setPosition(e.x,e.y);r.hp=100;r.bleeding=0;r.pollution=0;r.bullets.forEach(b=>b.sprite.destroy());r.bullets=[]});
  await page.waitForTimeout(150);const point=await center('#touch-interact');
  await touch('touchStart',[{id:9,...point}]);await page.waitForTimeout(600);await touch('touchCancel',[]);
  assert.equal(await page.evaluate(()=>__bincov.playerInput.read(true).interactHeld),false);
  await page.waitForFunction(()=>__bincov.app.raid.extractTime===0);
  await touch('touchStart',[{id:10,...point}]);await page.waitForFunction(()=>__bincov.app.state==='result',null,{timeout:7000});await touch('touchEnd',[]);
  assert.equal((await runtime()).stats.extracts,1);await page.reload();await action('enter').waitFor();assert.equal(await page.evaluate(()=>__bincov.app.checkpoint),null);
 });
 await step('unsupported record stays untouched and original bytes can be exported',async()=>{
  const raw=await page.evaluate(()=>{const key='escape-bincov.session.v2',r=JSON.parse(localStorage.getItem(key));r.version=999;const text=JSON.stringify(r);localStorage.setItem(key,text);return text});
  await page.reload();await page.getByRole('heading',{name:'暂时无法打开存档'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('escape-bincov.session.v2')),raw);
  const targets=await page.locator('.modal button').evaluateAll(nodes=>nodes.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));assert.ok(targets.every(r=>r.width>=48&&r.height>=48));
  const download=page.waitForEvent('download');await action('export-original').tap();const path=resolve(out,'unknown-original.json');await (await download).saveAs(path);assert.equal(await readFile(path,'utf8'),raw);
 });
 report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;console.error(error);process.exitCode=1;await shot('failure').catch(()=>{})}
finally{await context.close();await browser.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2))}
