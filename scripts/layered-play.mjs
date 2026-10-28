/** Normal action clock and actual input; read-only hooks never mutate a world. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { mallWorldV4 } from '../src/mall-world.ts';
import { corridor, spacePath } from '../src/spatial.ts';
import { browserOptions } from './browser-options.mjs';
import { buyAffordable } from './inventory-actions.mjs';
import { clickUncoveredCanvas } from './canvas-click.mjs';
const out=resolve(process.env.BINCOV_PLAY_OUT || 'test-results');await mkdir(out,{recursive:true});
// New mall raids deploy layout 4; the route waits upstairs halfway between the S-N and S-E stairs.
const MALL = mallWorldV4(), closed = m => ({ definition: MALL.maps[m], doors: Object.fromEntries(MALL.maps[m].doors.map(d => [d.id, false])), highTide: false });
const entry = (m, id) => MALL.maps[m].entries.find(e => e.id === id).at;
const upstairs = (() => { const p = spacePath(closed('mall-f2'), entry('mall-f2', 'S-N-down'), entry('mall-f2', 'S-E-down')); return p[Math.floor(p.length / 2)]; })();
const report={startedAt:new Date().toISOString(),methodology:'Offline packaged HTML on the 2.5D view, normal unaccelerated clock and ordinary 25-enemy layout-4 mall deployment. Hooks are read-only. Native shopping, item transfers, keyboard movement, firing, healing, E stairs and extraction. Automatic navigation knows the immutable map and visible state; this is not human balance or physical-phone evidence.',samples:[],runs:[],errors:[],requests:[],transitions:[]};
report.htmlSha256=createHash('sha256').update(await readFile(resolve('dist/index.html'))).digest('hex');report.node=process.version;report.platform=process.platform;report.aimClicks={fired:0,occluded:0};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();const ctx=await browser.newContext({viewport:{width:1280,height:720},offline:true});const page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.stack??e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
await page.addInitScript(()=>{window.__layerFrames=[];let previous=performance.now();function frame(now){if(window.__bincov?.app.state==='run'&&window.__bincovSample?.host&&!window.__bincovSample.host.panel)window.__layerFrames.push(now-previous);previous=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);});
const act=(name,id)=>page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let held=new Set(),runNo=0,phase=0,lastSample=-60,lastHeal=0,runStarted=0,lastMap='',lastPosition=null,stuck=0,lastObserved=0,transitionStarted=0;
async function keys(next){for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held=next;}
/** Read-only: the published frame and a captured (never committed) copy of the layered state. */
async function info(){return page.evaluate(()=>{const a=window.__bincov.app,S=window.__bincovSample,h=S?.host;if(a.state!=='run'||!h?.lastBatch)return{state:a.state,result:a.save.lastResult,stats:a.save.stats,heap:performance.memory?.usedJSHeapSize??null};const b=h.lastBatch,f=b.frame,hud=f.hud,s=window.__bincov.saveSession.captureExpansion(),c=S.counts();return{state:a.state,overlay:h.panel,saveError:!!document.querySelector('.coast-sample [data-do="retry-save"], .coast-sample [data-do="retry-settlement"]'),expansion:s,x:f.player.x,y:f.player.y,hp:hud.hp,bleeding:hud.bleeding,elapsed:b.stamp.simulationTime,map:b.stamp.world.mapId,high:hud.highTide,mag:hud.weapon.mag,reload:hud.weapon.reloading,cooldown:f.player.state.attackCooldown,ammo:a.loadout.bag.items.filter(i=>i.id==='ammo9').reduce((n,i)=>n+i.qty,0),medical:a.loadout.bag.items.filter(i=>['bandage','medkit'].includes(i.id)).reduce((n,i)=>n+i.qty,0),enemies:f.actors.filter(e=>e.alive).map(e=>({id:e.kind,x:e.x,y:e.y})),exits:b.map.exits.map(e=>({...e.at,id:e.id,name:e.name})),heap:performance.memory?.usedJSHeapSize??null,textures:c.gpuTextures,atlasPages:c.atlasPages};});}
const screenOf=point=>page.evaluate(p=>window.__bincovSample.host.view.worldToClient({x:p.x,y:p.y-22}),point);
async function deploy(){
 await act('tab','arms').click();await buyAffordable(page,'ammo9',3);await act('tab','med').click();await buyAffordable(page,'medkit');await act('tab','gear').click();
 for(let i=0;i<20;i++){const items=page.locator('[data-source="stash"][data-uid]');const choices=await items.evaluateAll(elements=>elements.filter(el=>/9毫米|绷带|急救|净水|罐头/.test(el.getAttribute('aria-label')??el.textContent??'')).map(el=>el.dataset.uid));if(!choices.length)break;await page.locator(`[data-source="stash"][data-uid="${choices[0]}"]`).dblclick();if((await items.evaluateAll(es=>es.map(e=>e.dataset.uid))).includes(choices[0]))break;}
 await page.locator('#run-world').selectOption('mall');await page.locator('#seed').fill('41');await act('deploy').click();await page.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch,null,{timeout:30000});phase=0;lastSample=-60;lastMap='mall-f1';lastPosition=null;stuck=0;lastObserved=0;runStarted=Date.now();runNo++;console.log('MALL run',runNo);
}
function route(s){
 if(phase===0)return{map:'mall-f1',at:entry('mall-f1','S-N-up'),entry:'S-N-up'};
 if(phase===1)return{map:'mall-f2',at:upstairs};
 if(runNo===1&&phase===2&&s.elapsed<570)return{map:'mall-f2',at:upstairs,wait:true};
 if(phase===2)return{map:'mall-f2',at:entry('mall-f2','S-E-down'),entry:'S-E-down'};
 if(phase===3)return{map:'mall-f1',at:MALL.spawn};
 if(runNo===1&&s.elapsed<590)return{map:'mall-f1',at:MALL.spawn,wait:true};
 return{map:'mall-f1',at:[...s.exits].sort((a,b)=>distance(a,s)-distance(b,s))[0],extract:true};
}
try{
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await act('enter').click();
 while(report.runs.length<3){
  const s=await info();assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
  if(s.state==='hideout'){await deploy();continue;}
  if(s.state==='result'){
   await keys(new Set());const frames=await page.evaluate(()=>window.__layerFrames.splice(0));frames.sort((a,b)=>a-b);const percentile=p=>frames[Math.floor((frames.length-1)*p)]??null;
   report.runs.push({run:runNo,result:s.result,realSeconds:(Date.now()-runStarted)/1000,lastObservedElapsed:lastObserved,frames:{count:frames.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),maximum:frames.at(-1)},heap:s.heap});console.log('MALL completed',JSON.stringify(report.runs.at(-1)));
   await act('return').click();await page.waitForTimeout(30000);report.runs.at(-1).menu=await info();if(runNo>=3)break;continue;
  }
  if(s.state!=='run')throw new Error('Unexpected '+s.state);
  lastObserved=s.elapsed;
  assert.equal(s.saveError,false,'world checkpoints and the settlement stay writable');
  if(s.overlay==='ending'){await keys(new Set());await page.waitForTimeout(200);continue;}
  if(s.overlay){await keys(new Set());await page.keyboard.press('Escape');continue;}
  if(s.map!==lastMap){report.transitions.push({run:runNo,from:lastMap,to:s.map,elapsed:s.elapsed,inputToObservedMilliseconds:transitionStarted?Date.now()-transitionStarted:null});transitionStarted=0;console.log('MALL floor',s.map,s.elapsed);lastMap=s.map;phase++;}
  if(s.elapsed-lastSample>=60){lastSample=s.elapsed;report.samples.push({run:runNo,elapsed:s.elapsed,hp:s.hp,map:s.map,high:s.high,x:s.x,y:s.y,phase,body:s.expansion.body,entities:Object.fromEntries(Object.entries(s.expansion.raid.maps).map(([id,m])=>[id,{alive:m.enemies.filter(e=>e.hp>0).length,dead:m.enemies.filter(e=>!e.hp).length,loot:m.loot.length,containers:m.containers.length,bullets:m.bullets.length}])),pursuits:s.expansion.raid.pursuits.length,textures:s.textures,atlasPages:s.atlasPages,heap:s.heap});console.log('MALL sample',runNo,Math.round(s.elapsed),s.map,'HP',s.hp);await writeFile(resolve(out,'layered-play-progress.json'),JSON.stringify(report,null,2));}
  const context={definition:MALL.maps[s.map],doors:s.expansion.raid.maps[s.map].doors,highTide:s.high};
  if(Date.now()-lastHeal>1500&&s.medical&&(s.hp<75||s.bleeding)){await page.keyboard.press('q');lastHeal=Date.now();}
  if(!s.mag&&s.ammo&&!s.reload)await page.keyboard.press('r');
  const enemy=s.enemies.filter(e=>distance(e,s)<400&&corridor(context,s,e,'sight')).sort((a,b)=>distance(a,s)-distance(b,s))[0];
  if(enemy&&s.mag&&!s.reload&&s.cooldown<=0){const {x,y}=await screenOf(enemy);if(x>0&&x<1280&&y>0&&y<720){const clicked=await clickUncoveredCanvas(page,x,y,{delay:20});report.aimClicks[clicked?'fired':'occluded']++;}}
  let goal=route(s);
  if(s.hp<25&&!s.medical){phase=4;goal={map:s.map,at:s.map==='mall-f2'?entry('mall-f2','S-E-down'):[...s.exits].sort((a,b)=>distance(a,s)-distance(b,s))[0],entry:s.map==='mall-f2'?'S-E-down':undefined,extract:s.map==='mall-f1'};}
  if(distance(goal.at,s)<(goal.entry||goal.extract?36:16)){
   await keys(new Set());if(goal.entry){transitionStarted=Date.now();await page.keyboard.press('e');await page.waitForTimeout(100);}
   else if(goal.extract){if(runNo===1&&s.elapsed<599){await page.waitForTimeout(150);continue;}await page.keyboard.down('e');await page.waitForTimeout(3300);await page.keyboard.up('e');}
   else if(!goal.wait){phase++;await page.screenshot({path:resolve(out,`layered-play-run-${runNo}-phase-${phase}.png`)});}else await page.waitForTimeout(150);continue;
  }
  const path=spacePath(context,s,goal.at),next=path.find(p=>distance(p,s)>10)??goal.at;if(!path.length)throw new Error(`No path in ${s.map}`);
  const dx=next.x-s.x,dy=next.y-s.y,set=new Set();if(Math.abs(dx)>1)set.add(dx>0?'d':'a');if(Math.abs(dy)>1)set.add(dy>0?'s':'w');
  if(lastPosition&&distance(lastPosition,s)<1){stuck++;if(stuck>40)throw new Error(`Navigation stuck at ${s.x},${s.y}`);}else stuck=0;lastPosition={x:s.x,y:s.y};
  await keys(set);await page.waitForTimeout(Math.max(16,Math.min(80,distance(next,s)/128*450)));
 }
 assert.ok(report.runs.some(r=>r.realSeconds>=599&&r.lastObservedElapsed>=599&&r.result.outcome==='timeout'),'At least one unaccelerated full 600-second action');assert.equal(report.runs.length,3);assert.ok(report.transitions.some(t=>t.to==='mall-f2'));assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;report.diagnostic=await info().catch(()=>null);await page.screenshot({path:resolve(out,'layered-play-failure.png')}).catch(()=>{});console.error(e);process.exitCode=1;}
finally{await keys(new Set()).catch(()=>{});report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'layered-play-report.json'),JSON.stringify(report,null,2));await ctx.close();await browser.close();}
