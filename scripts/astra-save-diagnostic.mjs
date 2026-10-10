// ASTRA-SAVE-01: separate decoder rejection, Storage.setItem failure and optimistic revision mismatch.
// Synthetic candidates/faults identify error channels; none establishes the historical screenshot's cause.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { createSessionState, SaveSession } from '../src/session.ts';
import { SESSION_KEY, RecoveryStore, decodeSession } from '../src/recovery-store.ts';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime.ts';
import { WEAPONS } from '../src/domain.ts';
const out=resolve('test-results/astra-lifecycle/save'); await mkdir(out,{recursive:true});
const report={at:new Date().toISOString(),historicalConclusion:'unconfirmed; no original candidate bytes, stack or write result',checks:[]};
const commit=RecoveryStore.prototype.commit;
let stacks=[];
RecoveryStore.prototype.commit=function(...args){try{return commit.apply(this,args);}catch(e){stacks.push({message:e.message,stack:e.stack});throw e;}};
try {
  for(const fault of ['quota','invalid-candidate','revision']) {
    const state=createSessionState(), data=new Map();let attempts=0,fail=false;
    const saves=new SaveSession(state,()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{attempts++;if(fail)throw new DOMException('injected quota','QuotaExceededError');data.set(k,v);}}));
    assert.equal(saves.initialize(),true);state.state='hideout';assert.equal(saves.beginRun(42,true),true);state.state='run';
    const runtime=new CoastRaidRuntime(state,saves);runtime.advance(0,emptyIntent());
    if(fault==='quota')fail=true;
    if(fault==='invalid-candidate')runtime.mag=WEAPONS[state.loadout.weapon].magazine+1;
    if(fault==='revision'){const other=JSON.parse(data.get(SESSION_KEY));other.revision++;data.set(SESSION_KEY,JSON.stringify(other));}
    const before=data.get(SESSION_KEY),start=attempts;stacks=[];
    assert.equal(runtime.checkpoint(),false);
    assert.equal(runtime.current().frame.phase,'paused');assert.equal(data.get(SESSION_KEY),before);
    assert.equal(attempts-start,fault==='quota'?1:0);assert.equal(stacks.length,1);
    report.checks.push({fault,writeAttempts:attempts-start,bytesUnchanged:true,phase:runtime.current().frame.phase,error:state.storageError,origin:stacks[0]});
  }
} finally {RecoveryStore.prototype.commit=commit;}
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
try {
  const ctx=await browser.newContext({offline:true,viewport:{width:1280,height:720}}),p=await ctx.newPage(),errors=[],requests=[];
  p.on('pageerror',e=>errors.push(e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await p.addInitScript(()=>{
    window.__saveProbe={writes:[],errors:[]}; const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k!=='escape-bincov.session.v2')return set.call(this,k,v);try{const r=set.call(this,k,v);window.__saveProbe.writes.push({result:'written',bytes:v.length});return r;}catch(e){window.__saveProbe.writes.push({result:'failed',name:e.name,stack:e.stack});throw e;}};
    window.Error=new Proxy(Error,{construct(t,a){const e=new t(...a);if(/存档|保存/.test(String(a[0])))window.__saveProbe.errors.push({message:e.message,stack:e.stack});return e;}});
  });
  await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?sample=village');
  await p.locator('[data-action="enter"]').click();await p.locator('#seed').fill('42');await p.locator('[data-action="deploy"]').click();await p.waitForSelector('.coast-sample canvas');
  assert.deepEqual(await p.evaluate(()=>[typeof window.__bincov,typeof window.__bincovSample]),['undefined','undefined']);
  const points=[];
  for(let i=0;i<3;i++){
    if(i){await p.locator('[data-do="resume"]').click();await p.keyboard.down('a');await p.waitForTimeout(200);await p.keyboard.up('a');}
    await p.waitForTimeout(2300);await p.keyboard.press('Escape');
    const record=decodeSession(await p.evaluate(k=>localStorage.getItem(k),SESSION_KEY)),r=record.expansion.raid;
    points.push({elapsed:r.elapsed,player:{x:r.player.x,y:r.player.y},outsideVillage:!(r.player.x>=96&&r.player.x<1184&&r.player.y>=32&&r.player.y<864),revision:record.revision,map:r.currentMap});
  }
  const diagnostic=await p.evaluate(()=>window.__saveProbe);
  assert.ok(points.every(p=>p.outsideVillage&&p.map==='coast'));assert.ok(points[2].elapsed>points[0].elapsed);
  assert.deepEqual(diagnostic.errors,[]);assert.ok(diagnostic.writes.every(w=>w.result==='written'));assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  report.checks.push({case:'ordinary-entry-outside-village',hooksAbsent:true,points,...diagnostic,pageErrors:errors,requests,status:'passed'});
  console.log('3 classified synthetic failure channels + ordinary outside-village checkpoints passed; historical ASTRA-SAVE-01 remains unconfirmed.');
}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e.message);}
finally{await browser.close();await writeFile(resolve(out,'diagnostic.json'),JSON.stringify(report,null,2)+'\n');}
