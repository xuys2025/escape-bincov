/** Repeated real input across each same-layer entrance of the 2.5D mall (layout 4); explicit spatial fixtures. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { MALL_PASSAGES } from '../src/mall-world.ts';
import { browserOptions } from './browser-options.mjs';
import { raidReady, frames } from './raid-view.mjs';
const out=resolve('test-results');await mkdir(out,{recursive:true});
const report={htmlSha256:createHash('sha256').update(await readFile('dist/index.html')).digest('hex'),startedAt:new Date().toISOString(),methodology:'Offline built mall on the 2.5D view (layout 4; the passages come from the shared skeleton). Explicit candidates position the player 40px outside each passage, and enemy AI is frozen through the test driver. Keyboard walking/sprinting crosses the actual scene geometry ten round trips per mode; health/stamina are reset between sprint loops. This checks geometry/input and conservation, not combat, natural travel or human/reference-image recognition. Past half of the 600 s raid clock (slow runners), the same seed is deployed again in a fresh page before the next passage.',passages:[],errors:[],requests:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();let ctx,page;
const open=async()=>{ctx=await browser.newContext({viewport:{width:1280,height:720},offline:true});page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.stack??e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});};
const snapshot=()=>page.evaluate(()=>{const b=window.__bincovSample.host.lastBatch,s=window.__bincov.saveSession.captureExpansion();return{map:s.raid.currentMap,shown:b.stamp.world.mapId,x:b.frame.player.x,y:b.frame.player.y,roster:s.raid.roster,counts:Object.fromEntries(Object.entries(s.raid.maps).map(([id,m])=>[id,{enemies:m.enemies.length,loot:m.loot.length,containers:m.containers.length}])),zone:document.querySelector('.coast-sample [data-where]').textContent};});
/** Body reset through the session (the Runtime is the attached owner): full health and stamina, no exhaustion or pain. */
const rested=()=>page.evaluate(()=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>{const b=d.expansion.body;b.hp=100;b.stamina=100;b.bleeding=false;b.exhausted=false;b.effects.pain=0;});if(!t||s.commitExpansionMutation(t)!=='committed')throw new Error('Body reset rejected');});
/**
 * On a slow runner (CI's software GL) the frames after a jump to another floor or spot can be more than 2 s apart, and the
 * Runtime then stall-pauses the raid ("画面暂时停顿…"), as it would for a player. Resume it through the pause panel, as a
 * player would, and wait until it has stayed running for a few frames. Resuming drops held keys until they are pressed again.
 */
const running=async()=>{for(let i=0;i<5;i++){const now=await page.evaluate(()=>({panel:window.__bincovSample.host.panel,phase:window.__bincovSample.host.lastBatch.frame.phase}));
 if(now.phase==='running'&&now.panel===null){await frames(page,3);if(await page.evaluate(()=>window.__bincovSample.host.lastBatch.frame.phase==='running'))return;continue;}
 assert.equal(now.panel,'pause',`the raid waits on ${now.panel}`);
 // Only the Runtime's own stall pause is resumed here; any other pause is a failure of the step.
 assert.ok(await page.evaluate(()=>{const h = window.__bincovSample.host, seen = h.__stallSeen ?? 0, stalls = h.eventLog.filter(e => e.type === 'notice' && /^画面暂时停顿/.test(e.detail?.text ?? '') && e.seq > seen); if (!stalls.length) return false; h.__stallSeen = Math.max(...stalls.map(e => e.seq)); return true;}),'the raid paused without the Runtime\'s stall notice');
 report.stallResumes=(report.stallResumes??0)+1;console.log('STALL: resumed a stall pause');await page.locator('.coast-sample [data-do="resume"]').click();
 await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.phase==='running',null,{timeout:30000});}
 throw new Error('the raid did not stay running');};
/** One leg: hold `key` until the player passes `target` on `axis`; after a stall pause, resume and press the keys again. */
const leg=async(key,axis,target,direction,sprint)=>{const passed=()=>page.evaluate(({axis,target,direction})=>direction*(window.__bincovSample.host.lastBatch.frame.player[axis]-target)>=0,{axis,target,direction});
 for(let attempt=0;attempt<4;attempt++){await page.keyboard.down(key);
  try{await page.waitForFunction(({axis,target,direction})=>{const b=window.__bincovSample.host.lastBatch;return direction*(b.frame.player[axis]-target)>=0||b.frame.phase!=='running';},{axis,target,direction},{timeout:20000});}
  finally{await page.keyboard.up(key);}
  if(await passed())return;
  if(sprint)await page.keyboard.up('Shift');await running();if(sprint){await rested();await page.keyboard.down('Shift');}}
 throw new Error(`${key} did not reach ${axis} ${target}`);};
/** A fresh profile deploys the seed-41 mall raid with frozen AI; returns its starting snapshot. */
const deployMall=async()=>{await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await page.locator('[data-action="enter"]').click();await page.locator('#run-world').selectOption('mall');await page.locator('#seed').fill('41');await page.locator('[data-action="deploy"]').click();
 const world=await raidReady(page);assert.equal(world.worldVersion,'mall-v4');await page.evaluate(()=>window.__bincovSample.driver.freezeAI(true));return snapshot();};
try{
 await open();let initial=await deployMall();
 for(const p of MALL_PASSAGES){
  // The raid clock follows real time, and a slow runner spends it ~4x faster than a desktop: past half of the 600 s raid,
  // deploy the same seed again in a new page so no passage meets the raid's timeout (which ends the raid mid-walk).
  if(await page.evaluate(()=>window.__bincov.saveSession.captureExpansion().raid.elapsed)>300){await ctx.close();await open();initial=await deployMall();report.redeploys=(report.redeploys??0)+1;console.log('REDEPLOY: fresh raid before',p.id);}
  const axis=['P-N','P-S'].includes(p.id)?'y':'x',forward=axis==='x'?'d':'s',backward=axis==='x'?'a':'w',row={id:p.id,map:p.map,modes:[]};report.passages.push(row);
  for(const sprint of [false,true]){
   await page.evaluate(({p,axis})=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>{const r=d.expansion.raid;r.currentMap=p.map;r.player={...p.at,rotation:0};r.player[axis]-=40;d.expansion.body.hp=100;d.expansion.body.stamina=100;d.expansion.body.bleeding=false;d.expansion.body.exhausted=false;d.expansion.body.effects.pain=0;});if(!t||s.commitExpansionMutation(t)!=='committed')throw new Error('Passage fixture rejected');},{p,axis});
   const start={...p.at,[axis]:p.at[axis]-40};
   await page.waitForFunction(({map,start})=>{const b=window.__bincovSample.host.lastBatch;return b.stamp.world.mapId===map&&Math.hypot(b.frame.player.x-start.x,b.frame.player.y-start.y)<1;},{map:p.map,start});await running();
   const before=await snapshot();
   for(let loop=0;loop<10;loop++){
    if(sprint){await rested();await page.keyboard.down('Shift');}
    for(const [key,target,direction] of [[forward,p.at[axis]+40,1],[backward,p.at[axis]-40,-1]])await leg(key,axis,target,direction,sprint);
    if(sprint)await page.keyboard.up('Shift');
    const current=await snapshot();assert.equal(current.map,p.map);assert.equal(current.shown,p.map);assert.deepEqual(current.roster,initial.roster);assert.deepEqual(current.counts,initial.counts);assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
   }
   // Diagonal grazing must remain on the same layer and return across the opening.
   // Both keys held for at least 130 ms and three published frames, so the graze really moves on a slow runner too.
   await running();const tangent=axis==='x'?'w':'a';await page.keyboard.down(tangent);await page.keyboard.down(forward);await Promise.all([page.waitForTimeout(130),frames(page,3)]);await page.keyboard.up(tangent);await page.keyboard.up(forward);await frames(page,2);
   const after=await snapshot();assert.equal(after.map,p.map);assert.ok(after.zone.includes(p.map==='mall-f1'?'一层':'二层'),after.zone);row.modes.push({sprint,roundTrips:10,before,after});
  }
  await page.screenshot({path:resolve(out,`mall-passage-${p.id}-1280x720.png`)});console.log('PASS',p.id,'walk/sprint 10 round trips each');
 }
 report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await page?.keyboard.up('Shift').catch(()=>{});report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'mall-passages-report.json'),JSON.stringify(report,null,2));await ctx?.close();await browser.close();}
