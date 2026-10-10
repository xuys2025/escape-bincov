/** Comparative rendering measurement. Pass a real baseline HTML; never edits game state. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {browserOptions} from './browser-options.mjs';
assert.ok(process.argv[2],'Usage: node scripts/art-performance.mjs /path/to/baseline.html');
const files={baseline:resolve(process.argv[2]),candidate:resolve('dist/index.html')};
const report={method:'Sequential ABBA at each viewport, isolated offline contexts, real seed-42 deployment, read-only state access, 120 warm-up RAF frames and 180 sampled intervals; no other local browser suites running. Headless measurement, not a real-device guarantee.',html:{},samples:[],errors:[],externalRequests:[]};
for(const[k,path]of Object.entries(files))report.html[k]=createHash('sha256').update(await readFile(path)).digest('hex');
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
try{
  for(const[width,height]of[[1280,720],[1920,1080]])for(const version of['baseline','candidate','candidate','baseline']){
    const context=await browser.newContext({viewport:{width,height},offline:true,reducedMotion:'reduce'});
    context.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    const start=performance.now();await page.goto(pathToFileURL(files[version]).href+'?test=1&entry=tabs');
    await page.locator('[data-action="enter"]').waitFor();const bootMs=performance.now()-start;
    await page.locator('[data-action="enter"]').click();await page.locator('#seed').fill('42');
    await page.locator('[data-action="deploy"]').click();await page.waitForFunction(()=>window.__bincov.app.raid?.player?.active);
    const measured=await page.evaluate(async()=>{
      for(let i=0;i<120;i++)await new Promise(requestAnimationFrame);
      const values=[];let last=await new Promise(requestAnimationFrame),start=last;
      for(let i=0;i<180;i++){const now=await new Promise(requestAnimationFrame);values.push(now-last);last=now;}
      values.sort((a,b)=>a-b);const{app}=window.__bincov;
      return{fps:180000/(last-start),frameP95:values[Math.floor(values.length*.95)],frameMax:values.at(-1),state:app.state,overlay:app.overlay,sceneChildren:app.raid.children.length,textureCount:Object.keys(app.game.textures.list).length};
    });
    assert.equal(measured.state,'run');assert.equal(measured.overlay,'');
    const sample={version,width,height,bootMs,...measured};report.samples.push(sample);console.log(JSON.stringify(sample));await context.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.status='passed';
}finally{await mkdir('test-results/art-review',{recursive:true});await writeFile('test-results/art-review/performance.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
