/** Visual evidence for the master composition and threshold under extreme parallax. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
const out=resolve('test-results/title-depth-v3');await mkdir(out,{recursive:true});
const report={date:new Date().toISOString(),methodology:'Unmodified offline game screenshots. Default pose uses reduced motion; four extreme poses use real mouse input. Threshold crops are direct browser screenshots of the visible canvas, not retouched assets. Visual acceptance is separate from this script.',views:[],errors:[],externalRequests:[]};
const browser=await chromium.launch(browserOptions),ctx=await browser.newContext({viewport:{width:1920,height:1080},offline:true,reducedMotion:'reduce'});
ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');await page.locator('.title-enter').waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:resolve(out,'centre.png')});
 await page.screenshot({path:resolve(out,'threshold-centre.png'),clip:{x:655,y:650,width:470,height:390}});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.title-motion').click();
 for(const [name,x,y] of [['top-left',1,1],['top-right',1919,1],['bottom-left',1,1079],['bottom-right',1919,1079]]){
  await page.mouse.move(x,y,{steps:12});await page.waitForTimeout(1700);
  await page.screenshot({path:resolve(out,name+'.png')});
  await page.screenshot({path:resolve(out,'threshold-'+name+'.png'),clip:{x:655,y:650,width:470,height:390}});
  const s=await page.evaluate(()=>window.__bincov.app.game.scene.getScene('Menu').title.snapshot());
  assert.ok(Math.abs(s.groups.fore[0])>Math.abs(s.groups.desk[0])&&Math.abs(s.groups.desk[0])>Math.abs(s.groups.harbor[0]));
  report.views.push({name,camera:s.camera,groups:s.groups});
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.status='passed';
}catch(e){report.status='failed';report.failure=String(e.stack);process.exitCode=1;}
finally{await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
