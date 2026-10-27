import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/,'');
const { chromium }=await import(pathToFileURL(root+'/node_modules/playwright/index.mjs'));
const { browserOptions }=await import(pathToFileURL(root+'/scripts/browser-options.mjs'));
const out=root+'/test-results/weapon-retraction';await mkdir(out,{recursive:true});
const report={method:'Offline actual Runtime packets, deep frozen and replayed into the same fresh scene A disabled / B enabled. No repeated Runtime.advance for A/B; render dt 1/60. Screenshot fixture freezes camera smoothing and ambient RNG equally.',cases:[],errors:[],requests:[]};
report.entry=pathToFileURL(root+'/dist/index.html').href+'?test=1&entry=tabs';
report.htmlSha256=createHash('sha256').update(await readFile(root+'/dist/index.html')).digest('hex');
report.startedAt=new Date().toISOString();
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
try {
for(const size of [[1280,720],[1920,1080]]) {
 const ctx=await browser.newContext({viewport:{width:size[0],height:size[1]},offline:true});const page=await ctx.newPage();page.setDefaultTimeout(60000);
 page.on('pageerror',e=>report.errors.push(e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
 await page.goto(report.entry);
 await page.locator('[data-action="enter"]').click();await page.locator('#seed').fill('42');await page.locator('[data-action="deploy"]').click();
 await page.waitForFunction(()=>window.__bincovSample?.host?.lastBatch?.frame.phase==='running',null,{timeout:120000});
 await page.evaluate(()=>{const h=window.__bincovSample.host;h.app.ticker.stop();h.view.onRebuild=undefined;window.__bincovSample.driver.freezeAI(true);});
 for(const gun of ['pistol','shotgun']) for(const dir of [0,Math.PI/4,-Math.PI/2]) {
  await page.evaluate(({gun,dir})=>{
   const h=window.__bincovSample.host,d=window.__bincovSample.driver,v=h.view;
   d.placePlayer({x:700,y:784},dir);d.weapon(gun);h.runtime.resetClock();
   const intent={move:{x:0,y:0,sprint:false},aim:dir,precise:false,firePressed:false,fireHeld:false,aimHeld:false,interactPressed:false,interactHeld:false,commands:[],selectTarget:null,source:'mouse-keyboard'};
   const t=performance.now(),warm=h.runtime.advance(t,intent),packets=[];
   for(let i=1;i<=8;i++)packets.push(h.runtime.advance(t+i*1000/60,{...intent,firePressed:i===1}));
   const freeze=x=>{if(x&&typeof x==='object'){Object.freeze(x);for(const q of Object.values(x))freeze(q);}return x;};
   window.__retraction={warm:freeze(warm),packets:freeze(packets),before:JSON.stringify(packets),cam:structuredClone(v.cam),camF:structuredClone(v.camF),gun,dir};
  },{gun,dir});
  const both={};
  for(const mode of ['A','B']) {
   const result=await page.evaluate(mode=>{
    const h=window.__bincovSample.host,v=h.view,q=window.__retraction;
    v.opts.weaponRetraction=mode==='B';v.mapKey='';v.time=0;v.rngState=7;v.shake=0;v.recoil={x:0,y:0};v.cam=structuredClone(q.cam);v.camF=structuredClone(q.camF);v.light.lights=[];
    v.present(q.warm,0,0);
    const read=packet=>{
     const a=packet.frame.player,g=v.actors.get('player'),w=g.weapon,art=v.tex.weapon(a.weapon,a.kind),data=art.canvas.getContext('2d').getImageData(0,0,art.canvas.width,art.canvas.height).data;
     let tip;
     for(let x=art.canvas.width-1;x>=0&&!tip;x--){const ys=[];for(let y=0;y<art.canvas.height;y++)if(data[(y*art.canvas.width+x)*4+3])ys.push(y);if(ys.length)tip={x:x+1,y:(ys[0]+ys.at(-1)+1)/2};}
     const c=Math.cos(w.rotation),s=Math.sin(w.rotation),lx=(tip.x-w.anchor.x*w.texture.width)*w.scale.x,ly=(tip.y-w.anchor.y*w.texture.height)*w.scale.y;
     const at={x:w.x+lx*c-ly*s,y:w.y+lx*s+ly*c};
     const flashErrors=v.muzzles.map(m=>Math.hypot(m.s.x-Math.round(at.x+c*1.5),m.s.y-Math.round(at.y+s*1.5)));
     const arm=g.arms[0],end={x:arm.x+Math.cos(arm.rotation)*arm.scale.x,y:arm.y+Math.sin(arm.rotation)*arm.scale.x};
     return {shot:packet.events.filter(e=>e.type==='shot'&&e.shooter==='player').length,weapon:{x:w.x,y:w.y,rotation:w.rotation,sx:w.scale.x,sy:w.scale.y},tip:at,flash:v.muzzles.map(m=>({x:m.s.x,y:m.s.y,t:m.t})),flashErrors,
      triggerSleeveError:Math.hypot(end.x-w.x,end.y-w.y),rimError:Math.hypot(g.wrim.x-w.x,g.wrim.y-w.y),
      tracers:[...v.bullets].map(([uid,b])=>({uid,from:b.from,off:b.off,born:b.born})),left:g.retraction?.left??null};
    };
    q.rows=[];
    for(let i=0;i<q.packets.length;i++){v.present(q.packets[i],1/60,0);q.rows.push(read(q.packets[i]));}
    q.savedRows=JSON.parse(JSON.stringify(q.rows));
    // Re-render the same sequence only to capture its peak frame, with all scene comparison state reset again.
    v.mapKey='';v.time=0;v.rngState=7;v.shake=0;v.recoil={x:0,y:0};v.cam=structuredClone(q.cam);v.camF=structuredClone(q.camF);v.light.lights=[];v.present(q.warm,0,0);
    v.present(q.packets[0],1/60,0);v.present(q.packets[1],1/60,0);h.app.render();
    return {rows:q.savedRows,packetsUnchanged:q.before===JSON.stringify(q.packets),pellets:q.packets[0].events.filter(e=>e.type==='shot'&&e.shooter==='player').flatMap(e=>e.pellets)};
   },mode);
   both[mode]=result;
   if(dir===0)await page.screenshot({path:`${out}/${size.join('x')}-${gun}-${mode}-after-shot.png`});
  }
  assert.equal(both.A.rows[0].shot,1);assert.deepEqual(both.A.rows[0].weapon,both.B.rows[0].weapon,'shot frame pose unchanged');assert.deepEqual(both.A.rows[0].tip,both.B.rows[0].tip,'shot frame opaque-pixel muzzle unchanged');
  assert.deepEqual(both.A.rows[0].flash,both.B.rows[0].flash,'new shot flash unchanged');assert.deepEqual(both.A.rows.map(r=>r.tracers),both.B.rows.map(r=>r.tracers),'tracer birth from/off never moved');
  assert.ok(both.A.packetsUnchanged&&both.B.packetsUnchanged);assert.deepEqual(both.A.pellets,both.B.pellets);
  assert.ok(Math.hypot(both.A.rows[1].weapon.x-both.B.rows[1].weapon.x,both.A.rows[1].weapon.y-both.B.rows[1].weapon.y)>=1,'a subsequent frame visibly retracts');
  for(const r of both.B.rows){assert.ok(r.flashErrors.every(e=>e<1e-9));assert.ok(r.triggerSleeveError<1e-8);assert.equal(r.rimError,0);}
  assert.deepEqual(both.A.rows.at(-1).weapon,both.B.rows.at(-1).weapon,'80ms recovery ends without changing the angle');
  report.cases.push({size,gun,dir,...both});console.log('PASS A/B',size.join('x'),gun,dir);
 }
 // Actual scene ownership checks, using copies only as documented scope/visibility fixtures.
 report.boundaries??=[];
 report.boundaries.push(await page.evaluate(()=>{
  const h=window.__bincovSample.host,v=h.view,q=window.__retraction,base=q.packets[0],next=q.packets[1];v.opts.weaponRetraction=true;
  const reset=()=>{v.mapKey='';v.present(q.warm,0,0);};const left=()=>v.actors.get('player')?.retraction?.left??0;
  reset();v.present(base,1/60,0);v.present(next,1,0);const expired=left();
  reset();v.present(base,1/60,0);const epoch=structuredClone(next);epoch.stamp.epoch++;epoch.events=[];v.present(epoch,1/60,0);const epochLeft=left(),epochFlash=v.muzzles.length;
  // A hidden-room fixture retains the true map and puts the shooter inside a real unrevealed region.
  const hidden=structuredClone(base),r=hidden.map.regions.find(r=>r.w>48&&r.h>48);let hiddenLeft=0,hiddenFlash=0,revealLeft=0;
  if(r){hidden.frame.player.x=r.x+r.w/2;hidden.frame.player.y=r.y+r.h/2;hidden.frame.player.regionId=r.id;hidden.frame.revealed[r.id]=false;reset();v.present(hidden,1/60,0);hiddenLeft=left();hiddenFlash=v.muzzles.length;const revealed=structuredClone(hidden);revealed.events=[];revealed.frame.revealed[r.id]=true;v.present(revealed,1/60,0);revealLeft=left();}
  return {expired,epochLeft,epochFlash,hiddenFixture:!!r,hiddenLeft,hiddenFlash,revealLeft};
 }));
 await ctx.close();
}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
for(const r of report.boundaries){assert.equal(r.expired,0);assert.equal(r.epochLeft,0);assert.equal(r.epochFlash,0);assert.equal(r.hiddenFixture,true);assert.equal(r.hiddenLeft,0);assert.equal(r.hiddenFlash,0);assert.equal(r.revealLeft,0);}
report.status='passed';
} catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e.stack);} finally {report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
