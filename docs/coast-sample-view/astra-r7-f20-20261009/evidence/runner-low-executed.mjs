/** F20 extension: original result-page / one CDP GC + window.gc workload; no relaxed heap threshold.
 * Default: unchanged formal HTML, seed42, 60 cycles, no heap snapshots or extra in-page probes.
 * Named/snapshot and seed3/high-tide runs are explicitly separate diagnostics, never substituted for strict results.
 */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {browserOptions} from './browser-options.mjs';
const out=resolve(process.env.R7_OUT||'test-results/astra-r7/strict60');await mkdir(out,{recursive:true});
const cyclesN=Number(process.env.R7_CYCLES||60), seed=Number(process.env.R7_SEED||42);
const named=process.env.R7_NAMED==='1', snaps=(process.env.R7_SNAPS||'').split(',').filter(Boolean).map(Number);
const high=seed===3, control=process.env.R7_PIN==='1';
assert(cyclesN>=1&&cyclesN<=60);assert([42,3].includes(seed));
let html=await readFile('dist/index.html','utf8');const formalSHA256=createHash('sha256').update(html).digest('hex');let htmlPath=resolve('dist/index.html');
if(named){const {build}=await import('esbuild');const b=await build({entryPoints:['src/main.ts'],bundle:true,write:false,minify:false,target:'es2020',format:'iife',loader:{'.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});const at=html.lastIndexOf('<script>'),end=html.lastIndexOf('</script>');html=html.slice(0,at+8)+b.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+html.slice(end);htmlPath=resolve(out,'named.html');await writeFile(htmlPath,html);}
const report={startedAt:new Date().toISOString(),node:process.version,formalSHA256,loadedSHA256:createHash('sha256').update(html).digest('hex'),named,seed,cyclesRequested:cyclesN,snapshots:snaps,pinControl:control,method:'1280x720 offline; original alternating upstairs/basement and abandon/extract; result page after sample DOM removal; one CDP HeapProfiler.collectGarbage followed by window.gc in original counts evaluation; primitive waits; no page reload or base recovery. 6-10 baseline retained, 16-20/36-40/56-60 compared separately. Snapshots occur AFTER the per-cycle sample; additional snapshot GC can perturb subsequent cycles, so named/snapshot data is auxiliary.',cycles:[],errors:[],requests:[]};
const browser=await chromium.launch({...browserOptions,args:[...browserOptions.args,'--enable-precise-memory-info','--js-flags=--expose-gc']});report.browser=browser.version();
const ctx=await browser.newContext({viewport:{width:1280,height:720},offline:true}),p=await ctx.newPage();p.setDefaultTimeout(10000);
p.on('pageerror',e=>report.errors.push(e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
const cdp=await ctx.newCDPSession(p),action=n=>p.locator(`[data-action="${n}"]`);
const frames=()=>p.evaluate(()=>new Promise(r=>{let i=0;const f=()=>++i>=4?r():requestAnimationFrame(f);requestAnimationFrame(f);}));
const place=(x,y)=>p.evaluate(([x,y])=>window.__bincovSample.driver.placePlayer({x,y},0),[x,y]);
async function snapshot(label){const chunks=[],on=e=>chunks.push(e.chunk);cdp.on('HeapProfiler.addHeapSnapshotChunk',on);try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false,captureNumericValue:false});}finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',on);}const file=resolve(out,`${label}.heapsnapshot`);await writeFile(file,chunks.join(''));console.log('SNAPSHOT',label);}
const save=()=>writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
let pinned=null;
try{
 await p.goto(pathToFileURL(htmlPath).href+'?test=1&sample=village');await action('enter').click();
 for(let i=0;i<cyclesN;i++){
  await p.locator('#run-world').selectOption('buildings');await p.locator('#seed').fill(String(seed));await action('deploy').click();await p.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch);await p.evaluate(()=>window.__bincovSample.driver.freezeAI(true));
  // Explicit positive control only. Formal/diagnostic long runs never create an object handle to a game owner.
  if(control&&i===0)pinned=await p.evaluateHandle(()=>window.__bincovSample.host);
  const map=i%2?'resident-b1':'resident-f2';await place(i%2?496:560,272);await frames();await p.keyboard.press('e');await p.waitForFunction(m=>window.__bincovSample.host.lastBatch.stamp.world.mapId===m,map);await p.keyboard.press('e');await p.waitForFunction(()=>window.__bincovSample.host.lastBatch.stamp.world.mapId==='coast');
  let highCache;
  if(high){await frames();highCache=await p.evaluate(()=>{const h=window.__bincovSample.host,v=h.view;return{high:h.lastBatch.frame.highTide,flooded:h.lastBatch.frame.flooded.length,shown:v.tide.shown.length,alpha:v.tide.alpha,bakes:[...v.bakes.keys()],atlas:{...v.tex.atlas.stats},tideKeys:[...v.tex.canvases.keys()].filter(k=>k.startsWith('tide:')).sort()};});assert.equal(highCache.high,true);assert.equal(highCache.flooded,106);assert.equal(highCache.shown,106);assert(highCache.tideKeys.length>0);}
  if(i%2){
   if(high){const exit=await p.evaluate(()=>window.__bincovSample.host.lastBatch.map.exits.find(e=>e.active));assert(exit,'active exit');await place(exit.x,exit.y);}else await place(208,122);
   await frames();await p.keyboard.down('e');await p.waitForFunction(()=>window.__bincov.app.state==='result',{}, {timeout:6000});await p.keyboard.up('e');
  }else{await p.keyboard.press('Escape');await p.locator('[data-do="abandon"]').click();await p.locator('[data-do="abandon-yes"]').click();await p.waitForFunction(()=>window.__bincov.app.state==='result');}
  await p.waitForFunction(()=>!document.querySelector('.coast-sample'));await cdp.send('HeapProfiler.collectGarbage');
  const result=await p.evaluate(()=>{window.gc?.();return{outcome:window.__bincov.app.result.outcome,counts:window.__bincovSample.counts()};});
  for(const k of ['apps','views','listeners','tickers','timers','renderTextures','liveViews','observers','sampleRoots','atlasPages','largeTextures'])assert.equal(result.counts[k],0,`cycle ${i+1} ${k}`);
  assert.equal(result.counts.parked,1);if(i>0)assert(result.counts.gpuTextures<=report.cycles[0].counts.gpuTextures);assert.equal(result.outcome,i%2?'extract':'death');
  report.cycles.push({cycle:i+1,map,...result,...(highCache?{highCache}:{})});await save();console.log('CYCLE',i+1,result.outcome,result.counts.heap);
  if(snaps.includes(i+1))await snapshot('cycle-'+(i+1));
  if(control&&i===0){await snapshot('pinned');await pinned.dispose();pinned=null;await cdp.send('HeapProfiler.collectGarbage');await p.evaluate(()=>{window.gc?.();});await snapshot('released');}
  await action('return').click();assert.equal(await p.evaluate(()=>window.__bincov.app.state),'hideout');
 }
 const heaps=report.cycles.map(c=>c.counts.heap),mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
 report.windows=[];for(let start=1;start+4<=heaps.length;start+=5)report.windows.push({from:start,to:start+4,mean:mean(heaps.slice(start-1,start+4))});
 const baseline=mean(heaps.slice(5,10));report.comparisons=[20,40,60].filter(n=>heaps.length>=n).map(n=>({baseline:'6-10',tail:`${n-4}-${n}`,baselineMean:baseline,tailMean:mean(heaps.slice(n-5,n)),growthBytes:mean(heaps.slice(n-5,n))-baseline}));
 await p.waitForTimeout(2000);await cdp.send('HeapProfiler.collectGarbage');report.afterIdle=await p.evaluate(()=>performance.memory?.usedJSHeapSize);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.resourceStatus='passed';report.memoryStatus=report.comparisons.some(c=>c.growthBytes>0)?'PARTIAL':'no-growth-observed; independent evidence still required';report.status=report.memoryStatus==='PARTIAL'?'partial':'passed';if(report.status==='partial')process.exitCode=1;
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);}finally{await pinned?.dispose();await cdp.detach();await browser.close();report.finishedAt=new Date().toISOString();await save();}
console.log(JSON.stringify({status:report.status,cycles:report.cycles.length,comparisons:report.comparisons}));
