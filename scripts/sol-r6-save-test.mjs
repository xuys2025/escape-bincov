// R6-V4: real automatic checkpoints; no manual checkpoint for the failure, no candidate written by this probe.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {browserOptions} from './browser-options.mjs';
import {decodeSession} from '../src/recovery-store.ts';
const out=resolve(process.env.BINCOV_R6_OUT||'test-results/sol-r6-20261009');await mkdir(out,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const report={startedAt:new Date().toISOString(),node:process.version,method:'Five fresh contexts per coordinate/build; same window scene, real >2s automatic checkpoint. Native Storage and Error taps record outcome, never change it. In-memory backup decode and player-only counterfactual never written.',runs:[],errors:[],requests:[]};
const b=await chromium.launch(browserOptions);report.browser=b.version();
try{for(const build of [{id:'old-1c1c935',html:resolve(out,'1c1c935.html')},{id:'current-14abea3',html:resolve('dist/index.html')}])for(const point of [[360,342],[368,344]])for(let n=1;n<=5;n++){
 const ctx=await b.newContext({viewport:{width:1280,height:720},offline:true});ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
 const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 await p.addInitScript(()=>{window.__saveProbe={writes:[],errors:[]};const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k!=='escape-bincov.session.v2')return set.call(this,k,v);let row={at:performance.now(),bytes:v.length,result:'pending'};try{const r=set.call(this,k,v);row.result='written';return r;}catch(e){row.result='failed';row.error=e.name+': '+e.message;throw e;}finally{window.__saveProbe.writes.push(row);}};window.Error=new Proxy(Error,{construct(t,args){const e=new t(...args);if(/存档|保存/.test(String(args[0])))window.__saveProbe.errors.push({at:performance.now(),message:e.message,stack:e.stack});return e;}});});
 await p.goto(pathToFileURL(build.html).href+'?test=1&sample=village');await p.locator('[data-action="enter"]').click();await p.locator('#seed').fill('42');await p.locator('[data-action="deploy"]').click();await p.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch);
 await p.evaluate(()=>{const d=window.__bincovSample.driver;d.freezeAI(true);d.placePlayer({x:464,y:436},-Math.PI/2,'coast');d.door('resident-front',true);});
 await p.waitForTimeout(200);
 const before=await p.evaluate(()=>({bytes:localStorage.getItem('escape-bincov.session.v2'),writes:window.__saveProbe.writes.length}));
 const start=await p.evaluate(([x,y])=>{const d=window.__bincovSample.driver;d.placePlayer({x,y},Math.PI,'coast');const f=window.__bincovSample.host.lastBatch.frame;return{at:performance.now(),elapsed:f.hud.elapsed};},point);
 const candidate=await p.evaluate(()=>JSON.stringify(window.__bincovSample.host.services.backup()));
 let error=null;try{decodeSession(candidate);}catch(e){error=e.message;}
 const fixed=JSON.parse(candidate);fixed.expansion.raid.player.x=368;fixed.expansion.raid.player.y=344;
 let counterfactualError=null;try{decodeSession(JSON.stringify(fixed));}catch(e){counterfactualError=e.message;}
 await p.waitForTimeout(2600);
 const after=await p.evaluate(()=>{const h=window.__bincovSample.host;return{bytes:localStorage.getItem('escape-bincov.session.v2'),phase:h.lastBatch.frame.phase,panel:h.panel,player:[h.lastBatch.frame.player.x,h.lastBatch.frame.player.y],storageOK:window.__bincov.app.storageOK,storageError:window.__bincov.app.storageError,rejected:h.eventLog.filter(e=>e.type==='rejected'),trace:window.__saveProbe,panelText:document.querySelector('.coast-sample [data-panel]')?.textContent};});
 const old=point[0]===360,delta=after.trace.writes.slice(before.writes);
 const row={build:build.id,htmlSHA256:hash(await readFile(build.html)),trial:n,point,start,beforeRevision:JSON.parse(before.bytes).revision,afterRevision:JSON.parse(after.bytes).revision,candidateSHA256:hash(candidate),candidateDecodeError:error,playerOnlyCounterfactualDecodeError:counterfactualError,beforeSHA256:hash(before.bytes),afterSHA256:hash(after.bytes),sameBytes:before.bytes===after.bytes,writeAttempts:delta.length,writes:delta,phase:after.phase,panel:after.panel,player:after.player,storageOK:after.storageOK,storageError:after.storageError,rejected:after.rejected,validationErrors:after.trace.errors,panelText:after.panelText,status:'running'};
 report.runs.push(row);await writeFile(resolve(out,'save-placement.json'),JSON.stringify(report,null,2)+'\n');
 try{if(old){assert(error);assert.equal(counterfactualError,null,'only coordinate repair makes candidate valid');assert.equal(delta.length,0,'decoder fails before setItem');assert.equal(row.sameBytes,true);assert.equal(after.phase,'paused');assert.equal(after.panel,'pause');assert(after.rejected.some(e=>e.detail?.action==='checkpoint'));assert.equal(after.storageError,error,'live rejection matches independently decoded candidate');assert(after.trace.errors.length>0,'retain native validation error stack (formal bundle has minified names)');}
 else{assert.equal(error,null);assert.equal(counterfactualError,null);assert(delta.length>0);assert(delta.every(w=>w.result==='written'));assert.equal(after.phase,'running');assert.equal(after.storageError,'');decodeSession(after.bytes);}
 row.status='passed';}catch(e){row.status='failed';row.failure=e.stack;process.exitCode=1;}
 if(n===1)await p.screenshot({path:resolve(out,'save-'+build.id+'-'+point.join('-')+'.png')});
 console.log(row.status,build.id,point,n,'writes',delta.length,'candidate',error||'valid');await ctx.close();await writeFile(resolve(out,'save-placement.json'),JSON.stringify(report,null,2)+'\n');
}}finally{await b.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'save-placement.json'),JSON.stringify(report,null,2)+'\n');}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
