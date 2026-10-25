/** Follow-up for a noisy single browser comparison; run alone, never until a desired result.
 * Five interleaved pairs, identical strict input and native stationary controls, 12 seconds each.
 * Every sample must pass the unchanged absolute policy. Median p95 advance/present must stay within 20%.
 * This browser-only diagnostic does not replace the standard matrix, Node physics, phone or natural play.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {cpus,release} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {browserOptions} from './browser-options.mjs';
import {raidReady,frames} from './raid-view.mjs';
import {decodeSession,SESSION_KEY} from '../src/recovery-store.ts';

const options=new Map(process.argv.slice(2).map(arg=>{const m=/^--(baseline|current|fixture|policy|out)=(.+)$/.exec(arg);if(!m)throw Error(`Unknown argument: ${arg}`);return [m[1],m[2]];}));
for(const key of ['baseline','fixture','policy'])assert.ok(options.has(key),`--${key}=PATH required`);
const files={baseline:resolve(options.get('baseline')),current:resolve(options.get('current')??'dist/index.html')};
const out=resolve(options.get('out')??'test-results/enemy-performance-paired');await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const policyBytes=await readFile(options.get('policy')),policy=JSON.parse(policyBytes),budgets=policy.budgets;
assert.equal(policy.protocol,'enemy-native-performance-v1');assert.equal(policy.status,'PASS');
assert.equal(policy.seed,42);assert.equal(policy.policy,'stationary');assert.equal(policy.focus,'raider-gunner');assert.equal(policy.radius,240);assert.equal(policy.heal,false);
const raw=await readFile(options.get('fixture'),'utf8'),saved=decodeSession(raw),raid=saved.expansion.raid;
assert.equal(raid.seed,42);assert.equal(raid.highTide,false);assert.equal(raid.elapsed,0);assert.equal(raid.roster.length,25);
const artifacts=Object.fromEntries(await Promise.all(Object.entries(files).map(async([k,path])=>{const b=await readFile(path);return [k,{path,bytes:b.length,sha256:hash(b)}];})));
assert.equal(artifacts.baseline.sha256,policy.artifact.sha256,'the actual baseline HTML must match the recorded policy');
const summary=values=>{const s=[...values].sort((a,b)=>a-b),at=q=>s[Math.floor((s.length-1)*q)]??0;assert.ok(values.every(n=>Number.isFinite(n)&&n>=0));return {count:s.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};};
const viewport={width:1920,height:1080};
const report={protocol:'enemy-browser-paired-v1',at:new Date().toISOString(),repetitions:5,seconds:12,relativeFactor:1.2,
  method:'Five fixed interleaved AB/BA pairs of the failed 1920 low-tide condition, identical strict save and original native stationary input. Compare median of the five p95 values; omit no samples. Every individual sample must still pass all original absolute budgets. Original single-matrix failure remains separate.',
  fixtureSha256:hash(raw),policySha256:hash(policyBytes),artifacts,budgets,rows:[],comparison:[],errors:[],external:[],failures:[],status:'RUNNING',
  environment:{node:process.version,platform:process.platform,os:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length}};
for(const field of ['node','platform','os','cpu','logicalCpus'])assert.equal(report.environment[field],policy.environment[field],`same ${field}`);
const fail=(name,actual,limit)=>{if(!Number.isFinite(actual)||actual>limit)report.failures.push({name,actual,limit});};
const browser=await chromium.launch(browserOptions);report.environment.browser=browser.version();assert.equal(browser.version(),policy.environment.browser);
async function sample(version,pair) {
  const ctx=await browser.newContext({viewport,offline:true}),p=await ctx.newPage();p.setDefaultTimeout(60000);
  try {
    p.on('pageerror',e=>report.errors.push({version,pair,error:String(e)}));p.on('request',r=>{if(/^https?:/.test(r.url()))report.external.push(r.url());});
    await p.addInitScript(([key,raw])=>localStorage.setItem(key,raw),[SESSION_KEY,raw]);
    await p.goto(pathToFileURL(files[version]).href+'?test=1&entry=tabs');await p.locator('[data-action="enter"]').click();await raidReady(p);
    const resume=p.locator('.coast-sample [data-do="resume"]');if(await resume.isVisible())await resume.click();await frames(p,30);
    const measurement=p.evaluate(()=>new Promise((resolve,reject)=>{
      const h=window.__bincovSample.host,gap=[],advance=[],present=[],phases=new Set(),attackPhases=new Set();
      let previous=performance.now(),started=previous,lastFrame=-1;const timeout=setTimeout(()=>reject(Error('Twelve-second sample timed out')),30000);
      const tick=()=>{try {
        const now=performance.now(),b=h.lastBatch;gap.push(now-previous);previous=now;phases.add(b.frame.phase);
        for(const a of b.frame.actors)if(a.tactics)attackPhases.add(a.tactics.phase);
        if(h.stats.frames!==lastFrame){advance.push(h.stats.advanceMs);present.push(h.stats.presentMs);lastFrame=h.stats.frames;}
        if(now-started<12000){requestAnimationFrame(tick);return;}clearTimeout(timeout);
        const canvas=document.querySelector('.coast-sample canvas'),gl=canvas.getContext('webgl2')??canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');
        resolve({seconds:(now-started)/1000,gap,advance,present,phases:[...phases],attackPhases:[...attackPhases],counts:window.__bincovSample.counts(),
          atlas:{...h.view.tex.atlas.stats},estimatedTextureBytes:h.view.textureBytes(),environment:{dpr:devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,userAgent:navigator.userAgent}});
      }catch(e){clearTimeout(timeout);reject(e);}};requestAnimationFrame(tick);
    }));
    const result=measurement.then(value=>({value}),error=>({error:String(error)})),started=performance.now();
    while(performance.now()-started<12200) {
      const aim=await p.evaluate(()=>{const h=window.__bincovSample.host,b=h.lastBatch;if(b.frame.phase!=='running')return null;
        const player=b.frame.player,target=b.frame.actors.filter(a=>a.alive&&h.view.actorShown(a.uid)).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];
        return target?h.view.worldToClient({x:target.x,y:target.y-22}):null;});
      if(aim){await p.mouse.move(aim.x,aim.y);await p.mouse.click(aim.x,aim.y);}
      if(performance.now()-started>2500&&Math.floor((performance.now()-started)/1000)%3===0)await p.keyboard.press('r');
      await p.waitForTimeout(250);
    }
    const outcome=await result;if(outcome.error)throw Error(outcome.error);const m=outcome.value;
    const row={version,pair,viewport,highTide:false,...m,gap:summary(m.gap),advance:summary(m.advance),present:summary(m.present)};
    assert.deepEqual(row.environment,policy.browser.find(b=>b.viewport.width===1920&&!b.highTide).environment);
    assert.ok(row.seconds>=11.9&&row.advance.count>100&&row.present.count>100&&row.gap.count>100);
    assert.deepEqual(row.phases,['running']);assert.ok(row.attackPhases.some(p=>['windup','release','recovery','reload'].includes(p)));
    for(const [name,value,limit] of [['advance-p95',row.advance.p95,budgets.advanceP95Ms],['advance-p99',row.advance.p99,budgets.advanceP99Ms],
      ['present-p95',row.present.p95,budgets.presentP95Ms],['present-p99',row.present.p99,budgets.presentP99Ms],['frame-p95',row.gap.p95,budgets.frameP95Ms],
      ['frame-p99',row.gap.p99,budgets.frameP99Ms],['atlas-pages',row.atlas.pages,budgets.atlasPages],['texture-bytes',row.estimatedTextureBytes,budgets.estimatedTextureBytes]])fail(`${version}/${pair}/${name}`,value,limit);
    report.rows.push(row);console.log(version,pair,JSON.stringify({advance:row.advance.p95,present:row.present.p95,frames:row.present.count,atlas:row.atlas.frames}));
  } finally {await ctx.close();}
}
try {
  for(let pair=0;pair<5;pair++)for(const version of pair%2?['current','baseline']:['baseline','current'])await sample(version,pair);
  for(const metric of ['advance','present']) {
    const values=version=>report.rows.filter(r=>r.version===version).map(r=>r[metric].p95),before=values('baseline'),after=values('current');
    assert.equal(before.length,5);assert.equal(after.length,5);const baseline=summary(before).p50,current=summary(after).p50,limit=Math.max(.5,baseline)*1.2;
    report.comparison.push({metric,baselineValues:before,currentValues:after,baselineMedian:baseline,currentMedian:current,limit});fail(`paired/${metric}`,current,limit);
  }
  for(const [version,a] of Object.entries(artifacts))fail(`${version}/html`,a.bytes,budgets.htmlBytes);
  fail('current/portable',(await stat('release/Escape-Bincov-portable.zip')).size,budgets.portableBytes);
  if(report.errors.length||report.external.length)report.failures.push({name:'errors-or-external-requests'});
  report.status=report.failures.length?'BUDGET_BLOCKED':'PASS';
}catch(e){report.status='ERROR';report.errors.push(String(e?.stack??e));}
finally {await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(report.status,JSON.stringify(report.failures));if(report.status!=='PASS')process.exitCode=1;
