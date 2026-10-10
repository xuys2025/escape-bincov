/** Run against saved real successful captures; each one-field regression must be rejected. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertFrames,assertFallback,assertSupplyRefused,assertSupplyUsed,assertTraining,assertTitlePreserved} from './station-acceptance-gates.mjs';
const dir=resolve(process.argv[2]??'docs/station-yard/sol-acceptance-20261010/evidence');
const read=async f=>JSON.parse((await readFile(f,'utf8')).replace(/^\uFEFF/,''));
const report=await read(resolve(dir,'station-complete/report.json'));
const rows=[];
function check(name,fn,expectedFailure=false) {
  let threw=false,error=null;try{fn();}catch(e){threw=true;error=e.message;}
  assert.equal(threw,expectedFailure,name+' negative-control effectiveness');
  rows.push({name,expectedFailure,rejected:threw,error});
}
const clone=v=>structuredClone(v);
const supply=report.coverage.supplyUsed, refusal=report.coverage.supplyRefused, training=report.coverage.training;
check('successful supply capture',()=>assertSupplyUsed(supply.before,supply.after));
for(const [key,value]of [['qty',supply.before.qty],['satiety',supply.before.satiety+1]]) {
  const changed=clone(supply.after);changed[key]=value;
  check('supply wrong '+key,()=>assertSupplyUsed(supply.before,changed),true);
}
check('refused supply capture',()=>assertSupplyRefused(refusal.before,refusal.after));
for(const change of ['cash','body']) {
  const changed=clone(refusal.after);if(change==='cash')changed.profile.cash--;else changed.body.satiety--;
  check('refusal changed '+change,()=>assertSupplyRefused(refusal.before,changed),true);
}
check('training capture',()=>assertTraining(training));
for(const change of ['reward','effectiveTime','pausedTime','wallClock']) {
  const changed=clone(training);
  if(change==='reward')changed.afterProgress+=.001;
  if(change==='effectiveTime')changed.after.activeSeconds++;
  if(change==='pausedTime')changed.pauses[0].after++;
  if(change==='wallClock')changed.wallSeconds=119;
  check('training wrong '+change,()=>assertTraining(changed),true);
}
check('zero frame errors',()=>assertFrames([]));
check('internal caught frame errors',()=>assertFrames([{message:'injected frame error (test)',count:3}]),true);
const logged=report.expectedLogs[0].lines;
check('precise fallback stack',()=>assertFallback(logged));
check('extra error alongside fallback',()=>assertFallback([...logged,'[console] other failure']),true);
check('same message substring only',()=>assertFallback([logged[0].replace('needs WebGL','unexpected needs WebGL')]),true);
check('extra non-stack text',()=>assertFallback([logged[0]+'\nnon-stack frame failure']),true);
const title=await read(resolve(dir,'title-first-round-trip-1280x720.json'));
check('full title save capture',()=>assertTitlePreserved(title.before,title.after));
for(const change of ['body','growth','facility','queue','backup','unexpectedField']) {
  const changed=clone(title.after);
  if(change==='body')changed.expansion.body.hp--;
  if(change==='growth')changed.expansion.growth.progress.technique+=.001;
  if(change==='facility')changed.expansion.base.facilities.rest++;
  if(change==='queue')changed.expansion.base.nextBatch++;
  if(change==='backup')changed.legacyBackup='modified';
  if(change==='unexpectedField')changed.expansion.unknown=1;
  check('title changed '+change,()=>assertTitlePreserved(title.before,changed),true);
}
await mkdir(dir,{recursive:true});await writeFile(resolve(dir,'negative-controls.json'),JSON.stringify({rows,summary:{passed:rows.length,total:rows.length}},null,2));
console.log(rows.length+' / '+rows.length+' effective controls passed');
