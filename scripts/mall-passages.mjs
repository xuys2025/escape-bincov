/** Repeated real input across each same-layer entrance; explicit spatial fixtures. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { MALL_PASSAGES } from '../src/mall-world.ts';
import { browserOptions } from './browser-options.mjs';
const out=resolve('test-results');await mkdir(out,{recursive:true});
const report={htmlSha256:createHash('sha256').update(await readFile('dist/index.html')).digest('hex'),startedAt:new Date().toISOString(),methodology:'Offline built mall. Explicit candidates position the player 40px outside each passage and keep enemies on long attack cooldowns. Keyboard walking/sprinting crosses the actual scene geometry ten round trips per mode; health/stamina are reset between sprint loops. This checks geometry/input and conservation, not combat, natural travel or human/reference-image recognition.',passages:[],errors:[],requests:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();const ctx=await browser.newContext({viewport:{width:1280,height:720},offline:true}),page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.stack??e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
const snapshot=()=>page.evaluate(()=>{const r=window.__bincov.app.raid,s=r.snapshotExpansion();return{map:s.raid.currentMap,x:r.player.x,y:r.player.y,roster:s.raid.roster,counts:Object.fromEntries(Object.entries(s.raid.maps).map(([id,m])=>[id,{enemies:m.enemies.length,loot:m.loot.length,containers:m.containers.length}])),roof:r.roofSignature,zone:document.getElementById('zone').textContent};});
try{
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await page.locator('[data-action="enter"]').click();await page.locator('#run-world').selectOption('mall');await page.locator('#seed').fill('41');await page.locator('[data-action="deploy"]').click();await page.waitForFunction(()=>window.__bincov.app.raid?.player?.active);
 const initial=await snapshot();
 for(const p of MALL_PASSAGES){
  const axis=['P-N','P-S'].includes(p.id)?'y':'x',forward=axis==='x'?'d':'s',backward=axis==='x'?'a':'w',row={id:p.id,map:p.map,modes:[]};report.passages.push(row);
  for(const sprint of [false,true]){
   await page.evaluate(({p,axis})=>{const s=window.__bincov.saveSession,t=s.prepareExpansionMutation(d=>{const r=d.expansion.raid;r.currentMap=p.map;r.player={...p.at,rotation:0};r.player[axis]-=40;d.expansion.body.hp=100;d.expansion.body.stamina=100;d.expansion.body.bleeding=false;d.expansion.body.exhausted=false;d.expansion.body.effects.pain=0;for(const m of Object.values(r.maps))for(const e of m.enemies)e.cooldown=1000;});if(!t||s.commitExpansionMutation(t)!=='committed')throw new Error('Passage fixture rejected');},{p,axis});
   const before=await snapshot();
   for(let loop=0;loop<10;loop++){
    if(sprint){await page.evaluate(()=>{const r=window.__bincov.app.raid;r.stamina=100;r.exhausted=false;});await page.keyboard.down('Shift');}
    for(const [key,target,direction] of [[forward,p.at[axis]+40,1],[backward,p.at[axis]-40,-1]]){await page.keyboard.down(key);await page.waitForFunction(({axis,target,direction})=>direction*(window.__bincov.app.raid.player[axis]-target)>=0,{axis,target,direction},{timeout:3000});await page.keyboard.up(key);}
    if(sprint)await page.keyboard.up('Shift');
    const current=await snapshot();assert.equal(current.map,p.map);assert.deepEqual(current.roster,initial.roster);assert.deepEqual(current.counts,initial.counts);assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
   }
   // Diagonal grazing must remain on the same layer and return across the opening.
   const tangent=axis==='x'?'w':'a';await page.keyboard.down(tangent);await page.keyboard.down(forward);await page.waitForTimeout(130);await page.keyboard.up(tangent);await page.keyboard.up(forward);
   const after=await snapshot();assert.equal(after.map,p.map);assert.ok(after.zone.includes(p.map==='mall-f1'?'一层':'二层'));row.modes.push({sprint,roundTrips:10,before,after});
  }
  await page.screenshot({path:resolve(out,`mall-passage-${p.id}-1280x720.png`)});console.log('PASS',p.id,'walk/sprint 10 round trips each');
 }
 report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await page.keyboard.up('Shift').catch(()=>{});report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'mall-passages-report.json'),JSON.stringify(report,null,2));await ctx.close();await browser.close();}
