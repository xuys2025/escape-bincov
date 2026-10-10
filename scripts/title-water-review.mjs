/** Pixel evidence: actual visible water, reflection, edges and freeze semantics. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { decodePng } from './title-art/png.ts';

const out=resolve('test-results/title-water');
await mkdir(out,{recursive:true});
const report={date:new Date().toISOString(),methodology:'Offline file:// current packaged game. Screenshots are unmodified. Water diagnostic uses ?test=1 to disable rain and hold the camera; a separate static capture uses reduced motion. Synthetic state is limited to these controls; no saved-game fixture.',checks:[],errors:[],externalRequests:[]};
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1920,height:1080},offline:true,reducedMotion:'reduce',recordVideo:{dir:out,size:{width:1920,height:1080}}});
context.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));
const state=()=>page.evaluate(()=>window.__bincov.app.game.scene.getScene('Menu').title.snapshot());
const diff=(a,b)=>{
 const x=decodePng(a),y=decodePng(b);assert.equal(x.w,y.w);assert.equal(x.h,y.h);let n=0;
 for(let i=0;i<x.data.length;i+=4)if(x.data[i]!==y.data[i]||x.data[i+1]!==y.data[i+1]||x.data[i+2]!==y.data[i+2])n++;
 return n;
};
try{
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');
 await page.locator('.title-enter').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
 await page.screenshot({path:resolve(out,'static-1920x1080.png')});
 await page.screenshot({path:resolve(out,'boat-static.png'),clip:{x:690,y:330,width:324,height:340}});
 const logo=await page.locator('.title-mark-art').boundingBox();assert.ok(logo.y/1080>.1&&logo.y/1080<.17,'Logo must be in the approved upper-left zone');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.title-motion').click();
 await page.evaluate(()=>{const s=window.__bincov.app.game.scene.getScene('Menu');s.title.setRain(false);s.events.emit('title-overlay',true);});
 await page.waitForTimeout(300);
 const clips={water:{x:1500,y:405,width:210,height:65},reflection:{x:735,y:534,width:215,height:108}};
 const first={};for(const [name,clip] of Object.entries(clips))first[name]=await page.screenshot({path:resolve(out,name+'-a.png'),clip});
 const before=await state();await page.waitForTimeout(2400);const after=await state();
 for(const [name,clip] of Object.entries(clips)){
  const second=await page.screenshot({path:resolve(out,name+'-b.png'),clip}),pixels=diff(first[name],second);
  assert.ok(pixels>20,name+' is animated in state but invisible in the rendered image');
  report.checks.push({name:'visible '+name+' changes without rain',changedPixels:pixels});
 }
 assert.deepEqual(before.camera,after.camera);report.checks.push({name:'fixed-camera diagnostic',camera:before.camera});
 await page.evaluate(()=>window.__bincov.app.game.scene.getScene('Menu').events.emit('title-overlay',false));
 for(const [name,x,y] of [['upper-right',1900,20],['lower-left',20,1060]]){
  await page.mouse.move(x,y,{steps:20});await page.waitForTimeout(1300);
  await page.screenshot({path:resolve(out,'parallax-'+name+'.png')});
 }
 const pose=await page.evaluate(()=>{
  const t=window.__bincov.app.game.scene.getScene('Menu').title;
  const a=t.snapshot();document.querySelector('.title-motion').click();const b=t.snapshot();
  return {before:[a.groups,a.boatY,a.lamp,a.waterFrame],after:[b.groups,b.boatY,b.lamp,b.waterFrame]};
 });
 assert.deepEqual(pose.after,pose.before);await page.waitForTimeout(600);
 report.checks.push({name:'motion toggle preserves pose',...pose});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=String(e.stack);process.exitCode=1;}
finally{
 await context.close();await page.video().saveAs(resolve(out,'water-and-parallax.webm'));await browser.close();
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
