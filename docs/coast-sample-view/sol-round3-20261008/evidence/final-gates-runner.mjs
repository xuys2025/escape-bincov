import assert from 'node:assert/strict';
import { openSync, closeSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
assert.equal(process.versions.node.split('.')[0],'24');
const cases=[
 {id:'wiring-final',args:['scripts/coast-sample-test.mjs'],env:{BINCOV_SAMPLE_OUT:'test-results/sol-round3/wiring-final',BINCOV_SAMPLE_HTML:'dist/index.html'}},
 {id:'target-loot-final',args:['--import','tsx','scripts/sol-target-loot-probe.mjs'],env:{BINCOV_SOL_OUT:'test-results/sol-round3/target-final'}},
 {id:'heap-final',args:['scripts/coast-sample-heap.mjs'],env:{BINCOV_HEAP_OUT:'test-results/sol-round3/heap-final',BINCOV_HEAP_CYCLES:'30',BINCOV_HEAP_SNAP:'10,30',BINCOV_HEAP_KEEP:'1'}}
];
const results=[];
for(const c of cases){const log='test-results/sol-round3/'+c.id+'.log',fd=openSync(log,'w'),startedAt=new Date().toISOString();const r=spawnSync(process.execPath,c.args,{env:{...process.env,...c.env},stdio:['ignore',fd,fd]});closeSync(fd);results.push({id:c.id,node:process.version,command:[process.execPath,...c.args],env:c.env,log,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,signal:r.signal,error:r.error?.message??null});writeFileSync('test-results/sol-round3/final-gates.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));if(r.status!==0)process.exitCode=1;}
