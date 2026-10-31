import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserOptions } from './browser-options.mjs';
import { failSessionWritesOnClick, restoreSessionWrites } from './storage-fault.mjs';
import { openPause, resumeStalls, running, stallResumes } from './stall-resume.mjs';

const out=resolve('test-results/mobile'); await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),method:'Chromium touch emulation with real CDP multi-touch, fault injection, complete checkpoint comparisons and offline requests blocked. Not physical iPhone/Android or Safari validation.',steps:[],errors:[],requests:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,offline:true,acceptDownloads:true});
await resumeStalls(context);
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
context.on('request',r=>{if(/^https?:/.test(r.url())) report.requests.push(r.url())});
const action=(name,id)=>page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
const shot=name=>page.screenshot({path:resolve(out,`${name}.png`)});
// Raids run on the 2.5D host: published frame, its open panel and the explicit ?test=1 driver.
const runtime=()=>page.evaluate(()=>{const {app}=__bincov,h=window.__bincovSample?.host,b=h?.lastBatch;return {state:app.state,panel:h?.panel??null,storageOK:app.storageOK,error:app.storageError,stats:app.save.stats,raid:b?{x:b.frame.player.x,y:b.frame.player.y,aim:b.frame.player.aim,elapsed:b.stamp.simulationTime,mag:b.frame.hud.weapon.mag,hp:b.frame.hud.hp,maxHp:b.frame.hud.maxHp,phase:b.frame.phase}:null}});
const raid=name=>page.locator(`.coast-sample [data-do="${name}"]`);
const panelIs=v=>page.waitForFunction(v=>window.__bincovSample?.host?.panel===v,v,{timeout:20000});
const drive=(name,...args)=>page.evaluate(([n,a])=>window.__bincovSample.driver[n](...a),[name,args]);
const ready=()=>page.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch&&!!document.querySelector('.coast-sample canvas'),null,{timeout:30000});
/** n display frames: "nothing happens" checks wait on frames, not milliseconds (a slow runner draws a few per second). */
const frames=(n=3)=>page.evaluate(n=>new Promise(r=>{let i=0;const f=()=>++i>=n?r():requestAnimationFrame(f);requestAnimationFrame(f);}),n);
/** The host's last event number, and the player's shots published after one: a held stick may empty the magazine on a
 * slow runner and the automatic reload then refills it, so shots are counted from the Runtime's events, not the magazine. */
const lastSeq=()=>page.evaluate(()=>window.__bincovSample.host.eventLog.at(-1)?.seq??0);
const shotsSince=seq=>page.evaluate(s=>window.__bincovSample.host.eventLog.filter(e=>e.seq>s&&e.type==='shot'&&e.detail.shooter==='player').length,seq);
/** A point on the raid canvas itself (not on a HUD card or button), as a fraction of the window. */
const canvasPoint=(fx,fy)=>page.evaluate(([fx,fy])=>{
  for(let d=0;d<200;d+=8)for(const [dx,dy] of [[0,0],[d,0],[-d,0],[0,d],[0,-d]]){const x=Math.round(innerWidth*fx+dx),y=Math.round(innerHeight*fy+dy);if(document.elementFromPoint(x,y)?.tagName==='CANVAS')return {x,y};}
  throw new Error(`No free canvas point near ${fx},${fy}`);
},[fx,fy]);
async function step(name,fn){const entry={name,status:'running'};report.steps.push(entry);try{await fn();assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);entry.status='passed';console.log('PASS',name)}catch(e){entry.status='failed';entry.error=e.stack;throw e}}
const center=async selector=>{const r=await page.locator(selector).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2}};
let cdp;
const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:2,radiusY:2,force:1}))});
try{
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await action('enter').waitFor({timeout:60000});cdp=await context.newCDPSession(page);
 await step('portrait hideout matrix keeps controls readable and reachable',async()=>{
  await shot('menu-390');await action('enter').tap({timeout:60000});
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
  await action('container','bag').tap();await page.setViewportSize({width:844,height:390});await page.locator('#seed').fill('42');await action('deploy').tap();await ready();
  await drive('freezeAI',true);await drive('placePlayer',{x:700,y:784},0,'coast');
  await page.waitForFunction(()=>Math.abs(window.__bincovSample.host.lastBatch.frame.player.x-700)<1&&window.__bincovSample.host.input.touch);
  await running(page);
 });
 await step('two trusted touch pointers move and fire together; release stops fire',async()=>{
  // Floating sticks: a touch on the left half moves, on the right half aims; 56 px is full deflection, firing needs 0.62.
  const left=await canvasPoint(.3,.55),right=await canvasPoint(.62,.45),before=await runtime();
  await touch('touchStart',[{id:1,...left}]);await touch('touchStart',[{id:1,...left},{id:2,...right}]);
  await touch('touchMove',[{id:1,x:left.x+32,y:left.y},{id:2,x:right.x+40,y:right.y}]);
  await page.waitForFunction(([x,m])=>{const f=window.__bincovSample.host.lastBatch.frame;return f.player.x>x+30&&f.hud.weapon.mag<=m-2;},[before.raid.x,before.raid.mag],{timeout:20000});
  const after=await runtime();assert.ok(after.raid.x>before.raid.x+30,JSON.stringify(after));assert.ok(after.raid.mag<=before.raid.mag-2,JSON.stringify(after));
  await touch('touchEnd',[]);const stopped=(await runtime()).raid,released=await lastSeq();await frames(4);
  const later=(await runtime()).raid;assert.equal(await shotsSince(released),0,'release stops fire');assert.ok(later.mag>=stopped.mag);assert.ok(Math.abs(later.x-stopped.x)<1);await shot('combat-844');
 });
 await step('move stick alone turns the player toward the walk direction (aim stick idle, issue #26 F08) and never fires',async()=>{
  await drive('placePlayer',{x:700,y:784},0,'coast');await page.waitForFunction(()=>Math.abs(window.__bincovSample.host.lastBatch.frame.player.x-700)<1);await running(page);
  const left=await canvasPoint(.3,.55),before=await runtime(),facing=()=>page.evaluate(()=>window.__bincovSample.host.lastBatch.frame.player.aim);
  const off=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
  await touch('touchStart',[{id:6,...left}]);await touch('touchMove',[{id:6,x:left.x-32,y:left.y}]);
  await page.waitForFunction(x=>{const p=window.__bincovSample.host.lastBatch.frame.player;return p.x<x-15&&Math.abs(Math.atan2(Math.sin(p.aim-Math.PI),Math.cos(p.aim-Math.PI)))<.05;},before.raid.x,{timeout:20000});
  const west=await facing(),walked=await runtime();await shot('touch-facing-west-844');
  await touch('touchMove',[{id:6,x:left.x,y:left.y+32}]);
  await page.waitForFunction(()=>{const a=window.__bincovSample.host.lastBatch.frame.player.aim;return Math.abs(Math.atan2(Math.sin(a-Math.PI/2),Math.cos(a-Math.PI/2)))<.05;},null,{timeout:20000});
  const south=await facing();
  await touch('touchEnd',[]);await frames(3);const kept=await facing(),after=await runtime();
  assert.ok(walked.raid.x<before.raid.x-15,JSON.stringify({before,walked}));
  assert.ok(off(west,Math.PI)<.05,`west ${west}`);assert.ok(off(south,Math.PI/2)<.05,`south ${south}`);assert.ok(off(kept,south)<1e-9,'facing stays after release');
  assert.equal(after.raid.mag,before.raid.mag,'moving never fires');
 });
 await step('rejected healing preserves the other thumb movement without consuming medicine',async()=>{
  const max=(await runtime()).raid.maxHp;await drive('vitals',{hp:max,bleeding:false});await drive('placePlayer',{x:700,y:784},0,'coast');
  await page.waitForFunction(()=>Math.abs(window.__bincovSample.host.lastBatch.frame.player.x-700)<1);await running(page);
  const before=await page.evaluate(()=>__bincov.app.loadout.bag),left=await canvasPoint(.3,.55),heal=await center('.coast-sample [data-heal]');
  // The move touch starts at the stick's origin and is then dragged; the heal button gets its own finger.
  await touch('touchStart',[{id:4,...left}]);
  const held={id:4,x:left.x+32,y:left.y};
  // The move stick is live (the player walks) before the heal button gets its own finger.
  await touch('touchMove',[held]);await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.player.x>702,null,{timeout:20000});
  await touch('touchStart',[held,{id:5,...heal}]);
  await page.waitForFunction(()=>document.querySelector('.coast-sample [data-toast]')?.classList.contains('on'),null,{timeout:20000});
  const toast=await page.locator('.coast-sample [data-toast]').innerText();
  // CDP touchMove carries the remaining active points; touchEnd would release every finger.
  await touch('touchMove',[held]);const rejected=(await runtime()).raid;
  let after;
  try{await page.waitForFunction(x=>window.__bincovSample.host.lastBatch.frame.player.x>x+15,rejected.x,{timeout:20000});after=(await runtime()).raid;}
  finally{await touch('touchEnd',[]);}
  assert.match(toast, /生命已满/);
  assert.equal(after.hp,max);assert.ok(after.x>rejected.x+15,JSON.stringify({rejected,after}));
  assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.bag),before);
 });
 await step('pointer cancellation and rotation never leave movement, fire or extraction held',async()=>{
  const right=await canvasPoint(.62,.45);await touch('touchStart',[{id:3,...right}]);await touch('touchMove',[{id:3,x:right.x+40,y:right.y}]);await page.waitForTimeout(100);await touch('touchCancel',[]);
  const mag=(await runtime()).raid.mag,cancelled=await lastSeq();await frames(4);assert.equal(await shotsSince(cancelled),0,'a cancelled touch leaves no fire held');assert.ok((await runtime()).raid.mag>=mag);
  // Held upright, the raid pauses with the rotate notice and 继续 waits for landscape.
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>window.__bincovSample.host.panel==='pause'&&document.querySelector('.coast-sample [data-panel] h2')?.textContent==='横过来，准备出发。',null,{timeout:20000});
  assert.equal(await raid('resume').isDisabled(),true,'继续 waits for landscape');
  const elapsed=(await runtime()).raid.elapsed;await frames(3);assert.equal((await runtime()).raid.elapsed,elapsed);await shot('rotate-390');
  await page.setViewportSize({width:844,height:390});
  await page.waitForFunction(()=>document.querySelector('.coast-sample [data-panel] h2')?.textContent==='已暂停',null,{timeout:20000});
  await raid('resume').tap();await panelIs(null);await running(page);
  // Phones have their own pause button.
  await openPause(page,()=>page.locator('.coast-sample [data-pause]').tap());const paused=(await runtime()).raid.elapsed;await frames(3);assert.equal((await runtime()).raid.elapsed,paused);await raid('resume').tap();await panelIs(null);
 });
 await step('loot pickup commits removal with inventory; checkpoint restores bullets and RNG',async()=>{
  // A loose sample on the ground under the player (no container in reach), picked up with the action button. The step
  // before walks until a threshold, which a slow runner overshoots by whole frames, so the player is put back first.
  await drive('placePlayer',{x:700,y:784},0,'coast');await page.waitForFunction(()=>Math.abs(window.__bincovSample.host.lastBatch.frame.player.x-700)<1);await running(page);
  const uid=await drive('spawnLoot','sample',1,{x:700,y:784});
  await page.waitForFunction(()=>document.querySelector('.coast-sample [data-act]')?.textContent==='拾取',null,{timeout:20000});
  await page.locator('.coast-sample [data-act]').tap();
  await page.waitForFunction(()=>__bincov.app.loadout.bag.items.some(i=>i.id==='sample'),null,{timeout:20000});
  // Fire with the aim stick and pause while the shots are still in flight, so the checkpoint holds live bullets and the
  // random state after them. A bullet flies 0.58 s; on a slow runner that is two frames, shorter than a touch round trip
  // (lift the stick, tap 暂停), so the pause is taken on the first published frame with a bullet, through the host's own
  // pause (the touch pause button is checked in the step before). The stick is held still before it lifts: a fast
  // release starts a fling, and Chromium spends the next tap on ending it.
  const aim=await canvasPoint(.62,.45);let expected;
  for(let attempt=0;attempt<6&&!expected;attempt++){
   if(attempt){await raid('resume').tap();await panelIs(null);}
   await running(page);await drive('magazine',8);
   await touch('touchStart',[{id:9,...aim}]);await touch('touchMove',[{id:9,x:aim.x+40,y:aim.y}]);
   await page.waitForFunction(()=>{const h=window.__bincovSample.host;if(!h.lastBatch.frame.bullets.length)return false;h.pause();return true;},null,{timeout:20000});
   await touch('touchMove',[{id:9,x:aim.x+40,y:aim.y}]);await page.waitForTimeout(120);await touch('touchEnd',[]);
   await panelIs('pause');
   await drive('vitals',{hp:72});
   assert.equal(await page.evaluate(()=>window.__bincovSample.host.services.checkpoint()),true,'checkpoint written while paused');
   const saved=await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('escape-bincov.session.v2'));return {body:r.expansion.body.hp,raid:r.expansion.raid};});
   if(saved.raid.maps[saved.raid.currentMap].bullets.length){expected=saved;report.bulletCheckpoint={attempts:attempt+1,bullets:saved.raid.maps[saved.raid.currentMap].bullets.length,rng:saved.raid.rng};}
  }
  assert.ok(expected,'a checkpoint caught bullets in flight');
  assert.equal(expected.body,72);assert.ok(!expected.raid.maps.coast.loot.some(l=>l.uid===uid),'the picked-up loot left the saved world');
  await page.reload();await action('enter').waitFor({timeout:60000});assert.equal(await page.evaluate(()=>__bincov.app.save.stats.runs),1);
  // A resumed raid is a new Runtime: enemies are frozen again for the fixture.
  await action('enter').tap();await ready();await drive('freezeAI',true);
  await panelIs('pause');const restored=await runtime();assert.equal(restored.raid.hp,72);
  assert.deepEqual(await page.evaluate(()=>__bincov.app.loadout.bag),expected.raid.loadout.bag);
  assert.equal(await page.evaluate(uid=>window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid),uid),false,'the picked-up loot stays gone after the reload');
  // The resumed Runtime holds exactly the saved raid: bullets in flight, random state, enemies, loot and the clock.
  const live=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__bincov.saveSession.captureExpansion().raid)));
  assert.deepEqual(live,expected.raid);
  await shot('restored-844');
 });
 await step('live backup round trip and failed medical transaction preserve consistent state',async()=>{
  // The pause panel offers the live backup.
  const promise=page.waitForEvent('download');await raid('backup').tap();const file=resolve(out,'live-backup.json');await (await promise).saveAs(file);
  const backup=JSON.parse(await readFile(file,'utf8'));assert.equal(backup.formatVersion,10);assert.equal(backup.record.expansion.version,3);assert.equal(backup.record.expansion.raid.version,5);assert.ok('enemyBackup' in backup.record);assert.equal(backup.record.expansion.body.hp,72);
  await raid('resume').tap();await panelIs(null);await running(page);
  // Inventory stays live: let any reload finish before comparing the medical transaction's before/after loadout.
  await page.waitForFunction(()=>!window.__bincovSample.host.lastBatch.frame.hud.weapon.reloading);
  const live=()=>page.evaluate(()=>({loadout:__bincov.app.loadout,hp:window.__bincovSample.host.lastBatch.frame.hud.hp,loot:__bincov.saveSession.captureExpansion().raid.maps.coast.loot}));
  await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');
  await page.locator('.coast-sample [data-panel] [data-source="bag"][aria-label^="密封绷带"]').tap();await raid('inv-use').waitFor();
  const before=await live();
  await failSessionWritesOnClick(page,'[data-do="inv-use"]');
  await raid('inv-use').tap();
  // A failed write rolls back and pauses on the save-error panel.
  await page.waitForFunction(()=>window.__bincovSample.host.panel==='pause'&&!!document.querySelector('.coast-sample [data-do="retry-save"]'),null,{timeout:20000});
  const failed=await live();assert.deepEqual({loadout:failed.loadout,hp:failed.hp},{loadout:before.loadout,hp:before.hp});
  await restoreSessionWrites(page);await raid('retry-save').tap();await panelIs(null);assert.equal((await runtime()).storageOK,true);await running(page);
  await page.locator('.coast-sample [data-bag]').tap();await panelIs('inventory');
  await page.locator('.coast-sample [data-panel] [data-source="bag"][aria-label^="赤潮封存样本"]').tap();await raid('inv-drop').waitFor();
  const beforeDrop=await live();
  await failSessionWritesOnClick(page,'[data-do="inv-drop"]');
  await raid('inv-drop').tap();
  await page.waitForFunction(()=>window.__bincovSample.host.panel==='pause'&&!!document.querySelector('.coast-sample [data-do="retry-save"]'),null,{timeout:20000});
  const afterDrop=await live();assert.deepEqual({loadout:afterDrop.loadout,loot:afterDrop.loot},{loadout:beforeDrop.loadout,loot:beforeDrop.loot});
  // Saved while held upright: the raid stays paused behind the rotate notice (the touch buttons are hidden) until landscape.
  await page.setViewportSize({width:390,height:844});await frames(3);
  await restoreSessionWrites(page);await raid('retry-save').tap();
  await page.waitForFunction(()=>document.querySelector('.coast-sample [data-panel] h2')?.textContent==='横过来，准备出发。',null,{timeout:20000});
  const held=await runtime();await frames(6);const still=await runtime();
  assert.deepEqual({panel:still.panel,phase:still.raid.phase,elapsed:still.raid.elapsed,storageOK:still.storageOK},{panel:'pause',phase:'paused',elapsed:held.raid.elapsed,storageOK:true});
  await page.setViewportSize({width:844,height:390});
  await page.waitForFunction(()=>document.querySelector('.coast-sample [data-panel] h2')?.textContent==='已暂停',null,{timeout:20000});
  await raid('resume').tap();await panelIs(null);await running(page);
  // Phones abandon from their own pause button.
  await openPause(page,()=>page.locator('.coast-sample [data-pause]').tap());await raid('abandon').tap();await raid('abandon-yes').tap();
  await action('return').tap({timeout:30000});
  await action('tab','home').tap();await page.locator('#backup-file').setInputFiles(file);await action('confirm-import').tap();await action('enter').tap();await ready();await drive('freezeAI',true);
  await panelIs('pause');assert.equal((await runtime()).raid.hp,72);
 });
 await step('short landscape layout fits all active touch targets and map text remains readable',async()=>{
  if(await raid('resume').count()){await raid('resume').tap();await panelIs(null);}
  await running(page);
  for(const [width,height] of [[800,360],[844,390],[915,412],[932,430],[667,375],[740,300]]){
   await page.setViewportSize({width,height});await frames(3);
   await page.waitForFunction(()=>window.__bincovSample.host.panel===null);
   // Every touch button the raid view shows (the sticks float under the thumbs, so there are none to measure); a hidden
   // one, such as 设备 on a gun without devices (#28 M2-03), is not a target.
   const bad=await page.locator('.coast-sample .cs-touch button').evaluateAll(nodes=>nodes.filter(el=>{if(el.hidden||!el.getClientRects().length)return false;const r=el.getBoundingClientRect();return r.width<48||r.height<48||r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1}).map(el=>el.getAttribute('aria-label')||el.textContent));
   assert.deepEqual(bad,[],`${width}x${height}`);
  }
  await shot('combat-740');await page.locator('.coast-sample .cs-touch [data-do="map"]').tap();await panelIs('map');await page.locator('.coast-sample [data-map]').waitFor();await shot('map-740');await raid('close').tap();await panelIs(null);
 });
 await step('hold extraction is cancellable and successful settlement cannot restore the run',async()=>{
  const exit=await page.evaluate(()=>window.__bincovSample.host.lastBatch.map.exits[0].at);
  const max=(await runtime()).raid.maxHp;await drive('vitals',{hp:max,bleeding:false,pollution:0});await drive('placePlayer',exit,0,'coast');
  await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.interaction?.kind==='exit'&&document.querySelector('.coast-sample [data-act]')?.textContent==='按住撤离',null,{timeout:20000});
  await running(page);
  const point=await center('.coast-sample [data-act]');
  await touch('touchStart',[{id:9,...point}]);
  await page.waitForFunction(()=>(window.__bincovSample.host.lastBatch.frame.interaction?.hold?.progress??0)>.3,null,{timeout:20000});
  await touch('touchCancel',[]);
  // Lifting the finger (or a cancel) stops the hold: the progress returns to zero.
  await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.interaction?.hold?.progress===0,null,{timeout:20000});
  await touch('touchStart',[{id:10,...point}]);
  await page.waitForFunction(()=>__bincov.app.state==='result'&&!document.querySelector('.coast-sample'),null,{timeout:30000});await touch('touchEnd',[]);
  assert.equal((await runtime()).stats.extracts,1);report.stallResumes=await stallResumes(page);await page.reload();await action('enter').waitFor({timeout:60000});
  assert.deepEqual(await page.evaluate(()=>({checkpoint:__bincov.app.checkpoint,raid:__bincov.app.expansion?.raid??null,activeRun:__bincov.app.save.activeRun})),{checkpoint:null,raid:null,activeRun:null});
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
