// Contract probes feed detached batches into the real Pixi view. They never alter
// a saved world; synthetic data is explicitly distinguished from gameplay tests.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { createRequire } from 'node:module';
const sharp=createRequire(import.meta.url)(process.env.BINCOV_SHARP_MODULE || 'C:/Users/xty/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const out=resolve(process.env.BINCOV_SOL_OUT || 'test-results/sol-acceptance');await mkdir(out,{recursive:true});
const report={method:'Detached synthetic v1 PublishedView batches on real Pixi view; tick stopped during probes. Tests visibility ownership, not gameplay logic.',errors:[],requests:[]};
const browser=await chromium.launch(browserOptions),ctx=await browser.newContext({viewport:{width:1280,height:720},offline:true}),p=await ctx.newPage();report.browser=browser.version();p.on('pageerror',e=>report.errors.push(e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&sample=village');await p.locator('[data-action="enter"]').click();await p.locator('#seed').fill('42');await p.locator('[data-action="deploy"]').click();await p.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch);await p.evaluate(()=>window.__bincovSample.driver.freezeAI(true));
report.visibility=await p.evaluate(()=>{
 const h=window.__bincovSample.host,v=h.view;h.app.ticker.stop();const b=structuredClone(h.lastBatch),room=b.map.regions.find(r=>r.inside&&!r.sealed),point={x:room.x+room.w/2,y:room.y+room.h/2};
 b.frame.revealed[room.id]=false;const alive=b.frame.actors[0],corpse=b.frame.actors[1];for(const a of [alive,corpse])Object.assign(a,point,{regionId:room.id,vx:0,vy:0});Object.assign(corpse,{alive:false,hp:0,corpse:{angle:0,containerId:null}});
 b.frame.loot=[{uid:'sol-hidden-loot',item:'scrap',qty:1,...point,regionId:room.id}];const crate=b.frame.containers.find(c=>c.kind==='crate');Object.assign(crate,point,{regionId:room.id});b.frame.bullets=[{uid:'sol-hidden-bullet',...point,vx:760,vy:0,enemy:false,owner:alive.uid}];b.events=[];
 const decals0=v.fx.decals.length;v.present(b,0);const decals1=v.fx.decals.length;
 const stamp=structuredClone(b.stamp),event=(type,detail,seq)=>({type,...detail,seq,durability:'accepted',stamp});b.events=[event('shot',{shooter:alive.uid,weapon:'pistol',pellets:[{bullet:'sol-hidden-bullet',origin:point,angle:0}]},10001),event('impact',{bullet:'sol-hidden-bullet',owner:alive.uid,reason:'blocked',lastFree:point,contact:point,normal:{x:-1,y:0},surface:'wall',target:null},10002),event('hurt',{cause:'blow',uid:alive.uid,damage:1,hp:50,angle:0},10003)];const particles=v.fx.count,flashes=v.muzzles.length;v.present(b,0);
 const ag=v.actors.get(alive.uid),cg=v.actors.get(corpse.uid);const hidden={actor:ag.body.visible,weapon:ag.weapon.visible,rim:ag.rim.visible,weaponRim:ag.wrim.visible,corpse:cg.corpse.visible,crate:v.crates.get(crate.id).s.visible,loot:v.loot.get('sol-hidden-loot').visible,bullet:v.bullets.get('sol-hidden-bullet').g.visible,muzzleAdded:v.muzzles.length-flashes,particlesAdded:v.fx.count-particles,bloodDecalsAdded:decals1-decals0,bloodDecalsVisible:v.fx.decals.filter(d=>d.region===room.id&&d.s.visible).length,bloodDecalsWithheld:v.fx.decals.filter(d=>d.region===room.id&&!d.s.visible).length,visibleLightsInRoom:v.light.pool.filter(s=>s.visible&&s.x>=room.x&&s.x<room.x+room.w&&s.y>=room.y&&s.y<room.y+room.h).length};
 // F12: source-stamped impacts must not become target-layer sparks.
 b.events=[{...event('impact',{bullet:'sol-source',reason:'blocked',lastFree:{x:640,y:456},contact:{x:640,y:456},normal:{x:-1,y:0},surface:'wall',target:null},10004),stamp:{...stamp,epoch:stamp.epoch-1,world:{...stamp.world,mapId:'resident-f2'}}}];const count=v.fx.count,dropped=v.stats.droppedEvents;v.present(b,0);const stale={fxAdded:v.fx.count-count,dropped:v.stats.droppedEvents-dropped};
 // F08: range/bounds removals from transmissive terrain have no wall sparks.
 b.events=[event('impact',{bullet:'sol-range',reason:'range',lastFree:{x:640,y:456},contact:null,normal:null,surface:null,target:null},10005)];const before=v.fx.count;v.present(b,0);const range={fxAdded:v.fx.count-before};
 window.__solHiddenProbe=b;return{room,point,hidden,stale,range,status:hidden.bloodDecalsVisible?'failed':'passed'};
});
await p.evaluate(()=>{const h=window.__bincovSample.host;h.app.renderer.render({container:h.app.stage});});
const withDecals=await p.screenshot({path:resolve(out,'hidden-room-probe.png')});
await p.evaluate(()=>{const h=window.__bincovSample.host,v=h.view;for(const d of v.fx.decals)d.s.visible=false;window.__solHiddenProbe.events=[];v.present(window.__solHiddenProbe,0);h.app.renderer.render({container:h.app.stage});});
const withoutDecals=await p.screenshot({path:resolve(out,'hidden-room-without-decals.png')});
const a=await sharp(withDecals).removeAlpha().raw().toBuffer(),b=await sharp(withoutDecals).removeAlpha().raw().toBuffer();let changedPixels=0;for(let i=0;i<a.length;i+=3)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changedPixels++;
report.visibility.pixelComparison={changedPixels,method:'Identical hidden PublishedView and camera; only corpse blood decal visibility differs, forced stage rendering before screenshots.'};
const hidden=report.visibility.hidden;const leaks=['actor','weapon','rim','weaponRim','corpse','crate','loot','bullet','muzzleAdded','particlesAdded','bloodDecalsVisible','visibleLightsInRoom'].filter(k=>!!hidden[k]);report.visibility.failures=leaks;report.visibility.status=changedPixels||leaks.length||report.visibility.stale.fxAdded||report.visibility.stale.dropped!==1||report.visibility.range.fxAdded?'failed':'passed';report.visibility.note='Decals may be allocated internally; their region-owned sprites must remain withheld. Real Runtime V01, roof-removed negative and positive controls, is recorded separately.';
report.at=new Date().toISOString();await writeFile(resolve(out,'visibility-probe.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();if(report.visibility.status==='failed'||report.errors.length||report.requests.length)process.exitCode=1;
