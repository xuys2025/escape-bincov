/** Ordinary URL acceptance. Fixtures seed only the legacy storage key; no test globals or query parameters. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserOptions} from './browser-options.mjs';
import * as D from '../src/domain.ts';
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'test-results/station-ordinary');
await mkdir(out,{recursive:true});
const html=await readFile('dist/index.html','utf8'),browser=await chromium.launch(browserOptions);
const report={startedAt:new Date().toISOString(),browser:browser.version(),methodology:'Offline packaged HTML, https://station.test/ without query. Legacy fixture written to old key only. Real enter/reload controls; no __bincov/__station or injected product methods.',steps:[],errors:[],external:[]};
try {
  for(const fixture of ['new','legacy-dark','legacy-restored']) {
    const ctx=await browser.newContext({viewport:{width:1280,height:720},offline:true});
    const row={name:fixture,status:'running'};report.steps.push(row);
    try {
      let profile=null,bytes=null;
      if(fixture!=='new') {
        profile=D.newSave();profile.cash=1842;profile.quests.repair=fixture==='legacy-restored';profile.stats={runs:3,extracts:2,kills:5};
        assert.equal(D.addItem(profile.stash,'watch',1),0);assert.equal(D.addItem(profile.stash,'scrap',2),0);bytes=JSON.stringify(profile);
        await ctx.addInitScript(b=>{if(!localStorage.getItem('escape-bincov.session.v2'))localStorage.setItem('escape-bincov.save.v1',b);},bytes);
      }
      await ctx.route('https://station.test/',r=>r.fulfill({contentType:'text/html',body:html}));
      ctx.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!=='https://station.test/')report.external.push(r.url());});
      const page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto('https://station.test/');await page.locator('[data-action="enter"]').click();
      await page.locator('#station-yard canvas').waitFor();await page.waitForTimeout(1200);
      const inspect=()=>page.evaluate(()=>{const root=document.querySelector('#station-yard')?.shadowRoot;return{url:location.href,bincov:'__bincov'in window,station:'__station'in window,frame:getComputedStyle(document.querySelector('#frame')).visibility,sub:root?.querySelector('#hud-sub')?.textContent,quickVisible:!!root?.querySelector('.quick')&&getComputedStyle(root.querySelector('.quick')).display!=='none',save:JSON.parse(localStorage.getItem('escape-bincov.session.v2'))};});
      const first=await inspect();
      assert.equal(first.url,'https://station.test/');assert.equal(first.bincov,false);assert.equal(first.station,false);assert.equal(first.frame,'hidden');assert.equal(first.quickVisible,true);
      assert.equal(first.save.version,4);assert.equal(first.save.expansion.version,2);
      if(profile) {assert.deepEqual(first.save.profile,profile);assert.equal(first.save.legacyBackup,bytes);assert.match(first.sub,fixture==='legacy-restored'?/供电正常/:/应急供电/);}
      await page.screenshot({path:resolve(out,fixture+'.png')});
      await page.reload();await page.locator('[data-action="enter"]').click();await page.locator('#station-yard canvas').waitFor();await page.waitForTimeout(400);
      const after=await inspect();assert.deepEqual(after.save.profile,first.save.profile);assert.equal(after.save.legacyBackup,first.save.legacyBackup);assert.equal(after.bincov,false);assert.equal(after.station,false);assert.equal(after.quickVisible,true);
      assert.deepEqual(errors,[]);assert.deepEqual(report.external,[]);
      Object.assign(row,{status:'passed',first,after,errors});
    }catch(e){row.status='failed';row.error=String(e.stack??e);report.errors.push(row.error);}
    finally {await ctx.close();}
    console.log(row.status.toUpperCase(),fixture,row.error??'');
  }
} finally {
  await browser.close();report.finishedAt=new Date().toISOString();report.summary={passed:report.steps.filter(x=>x.status==='passed').length,total:report.steps.length};
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(report.summary);
  if(report.summary.passed!==report.summary.total||report.errors.length||report.external.length)process.exitCode=1;
}