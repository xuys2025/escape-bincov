// Curate round3 evidence; normalize text for committed-byte hashes, keep all raw originals in test-results.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
assert.equal(process.versions.node.split('.')[0],'24');
const raw=resolve('test-results/sol-round3'),root=resolve('docs/coast-sample-view/sol-round3-20261008'),out=resolve(root,'evidence');
await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFile(resolve(raw,p),'utf8').then(JSON.parse);
const files=[
 ['unit.log','unit.log'],['package.log','package.log'],['core.json','core.json'],
 ['final-gates.json','final-gates.json'],['final-gates-runner.mjs','final-gates-runner.mjs'],
 ['wiring-final/report.json','wiring.json'],['wiring-final.log','wiring.log'],
 ['wiring-revised/report.json','wiring-revised.json'],['wiring-revised.log','wiring-revised.log'],['revised-variant-exits.json','revised-variant-exits.json'],
 ['boundaries-final/sample-boundaries.json','sample-boundaries.json'],['sample-boundaries-final.log','sample-boundaries.log'],['boundaries-final-exit.json','boundaries-exit.json'],
 ['target-final/target-loot-probe.json','target-loot.json'],['target-loot-final.log','target-loot.log'],
 ['heap-final/heap-report.json','heap-report.json'],['heap-final/shader-cache.json','shader-cache.json'],['heap-final.log','heap.log'],
 ['save-diagnostic/save-diagnostic.json','save-diagnostic.json'],['save-diagnostic.log','save-diagnostic.log'],['save-diagnostic-exit.json','save-diagnostic-exit.json'],
 ['mall/layered-play-report.json','layered-play-report.json'],['layered-play.log','layered-play.log'],
 ['shots/index.json','shots-original/index.json'],['shots.log','shots-original.log'],
 ['shots-revised/index.json','shots-revised/index.json'],['shots-revised.log','shots-revised.log'],['shots-revised-exit.json','shots-revised-exit.json'],
 ['visibility/visibility-probe.json','visibility-probe.json'],['visibility.log','visibility.log'],['visibility-exit.json','visibility-exit.json'],
 ['occlusion/occlusion.json','occlusion.json'],['occlusion-final.log','occlusion.log'],
 ['occlusion-revised/occlusion.json','occlusion-revised.json'],['occlusion-revised.log','occlusion-revised.log'],['occlusion-final-exits.json','occlusion-exits.json'],
 ['occlusion-first-fixture.json','occlusion-first-fixture.json'],
 ['art-revised/index.json','art-revised/index.json'],['art-revised/variant.json','art-revised/variant.json'],['art-revised.log','art-revised.log'],
 ['remote-baseline.json','remote-baseline.json'],['regressions.json','regressions.json'],
 ['boundaries-final/drop-save-fault.png','drop-save-fault.png'],['boundaries-final/mall-click-guard.png','mall-click-guard.png'],
 ['target-final/duplicate-targets.png','duplicate-targets.png'],['target-final/partial-save-fault.png','partial-save-fault.png'],
 ['visibility/hidden-room-probe.png','hidden-room-probe.png'],
 ['occlusion-revised/front-wall.png','occlusion-front-wall.png'],['occlusion-revised/front-wall-positive.png','occlusion-front-wall-positive.png']
];
for(const name of await readdir(resolve(raw,'regressions')))if(name.endsWith('.log'))files.push(['regressions/'+name,'regressions/'+name]);
for(const name of await readdir(resolve(raw,'art-revised')))if(name.endsWith('.png'))files.push(['art-revised/'+name,'art-revised/'+name]);
for(const scene of ['inventory','loot-panel','map','reading'])for(const size of ['1280x720','640x300']){const name=scene+'-'+size+'.png';files.push(['shots-revised/'+name,'shots-revised/'+name]);}
for(const name of ['door-1280x720.png','window-1920x1080.png','outside-1280x720.png'])files.push(['shots/'+name,'shots-original/'+name]);
const evidence=[];
for(const [source,file] of files){const original=await readFile(resolve(raw,source)),text=['.json','.log','.mjs','.md','.txt'].includes(extname(file));let bytes=original;if(text){let s=original.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');if(file.endsWith('.log'))s=s.split('\n').map(l=>l.trimEnd()).join('\n');if(file.endsWith('.mjs'))s=s.trimEnd()+'\n';bytes=Buffer.from(s);}await mkdir(dirname(resolve(out,file)),{recursive:true});await writeFile(resolve(out,file),bytes);evidence.push({file:'evidence/'+file,bytes:bytes.length,sha256:hash(bytes),raw:'test-results/sol-round3/'+source,...(text?{normalization:'UTF-8, LF'+(file.endsWith('.log')?'; log trailing whitespace removed':file.endsWith('.mjs')?'; terminal blank lines removed':''),originalBytes:original.length,originalSha256:hash(original)}:{})});}
const [remote,wiring,revised,bound,heap,shader,save,mall,shots,shotsRevised,reg,finalGates,occlusion,occlusionRevised]=await Promise.all(['remote-baseline.json','wiring-final/report.json','wiring-revised/report.json','boundaries-final/sample-boundaries.json','heap-final/heap-report.json','heap-final/shader-cache.json','save-diagnostic/save-diagnostic.json','mall/layered-play-report.json','shots/index.json','shots-revised/index.json','regressions.json','final-gates.json','occlusion/occlusion.json','occlusion-revised/occlusion.json'].map(read));
const git=(...a)=>execFileSync('git',['-c','safe.directory=D:/bincov/pr22-runtime',...a],{maxBuffer:16777216});
const artifacts={};for(const file of ['dist/index.html','start the game.html','release/Escape-Bincov-portable.zip','release/Escape-Bincov-web.zip','docs/release-manifest.json']){const bytes=await readFile(file),baseline=git('show','6a7e6b1:'+file);assert.ok(bytes.equals(baseline),file+' changed');artifacts[file]={bytes:bytes.length,sha256:hash(bytes),equals6a7e6b1:true};}
assert.equal(wiring.steps.length,27);assert.ok(wiring.steps.every(s=>s.status==='passed'));assert.ok(revised.steps.every(s=>s.status==='passed'));assert.equal(reg.length,20);assert.ok(reg.every(x=>x.exitCode===0));
assert.equal(mall.status,'passed');assert.equal(mall.runs.length,3);assert.equal(occlusion.status,'passed');assert.equal(occlusionRevised.status,'passed');assert.deepEqual(heap.accumulated,[]);
for(const s of [shots,shotsRevised]){assert.equal(s.shots.length,68);assert.deepEqual(s.anomalies,[]);assert.deepEqual(s.errors,[]);assert.deepEqual(s.requests,[]);}
const f20=bound.steps.find(s=>s.id.startsWith('F20'));
const verification={at:new Date().toISOString(),overallStatus:'engineering-regressions-passed; F20-strict-no-growth-not-signed-off; ART-R08/R10-unresolved; revised-first-batch-delivered',
 baseline:remote,environment:{node:process.version,pnpm:'11.19.0 (Corepack)',os:os.platform()+' '+os.release(),arch:os.arch(),cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,totalMemoryBytes:os.totalmem(),browser:heap.browser,execution:'Chrome headless; physical-device/human performance not claimed'},
 scope:{sourceChanged:false,runtimeAssetIntegrationChanged:false,generatedArtifactsChanged:false,push:false,merge:false,publish:false,assets:{player:25,wall:11,ground:6,weapon:1,total:43,changed:34,unchanged:9}},
 commands:{core:await read('core.json'),finalGates,regressions:reg,unit:{status:'passed',passed:223},package:{status:'passed',unchanged:true},wiring:{status:'passed',passed:27},revisedWiring:{status:'passed',passed:27,variant:'evidence/art-revised/variant.json'},
 boundaries:{status:'partial',passed:bound.steps.filter(s=>s.status==='passed').length,total:bound.steps.length,exitCode:(await read('boundaries-final-exit.json')).exitCode},
 heap:{status:'tracked-instances-pass; strict-total-heap-partial',cycles:30,exitCode:finalGates.find(s=>s.id==='heap-final').exitCode,accumulated:heap.accumulated,trend:heap.trend,selfSize:heap.selfSize,shaderRetainedBytes:shader.shaderStrings.newRetainedBytes,shaderBytesPerMount:shader.shaderStrings.newRetainedBytes/20,packaged20CycleTrend:f20.detail.growthBytes},
 mall:{status:mall.status,runs:mall.runs.map(r=>({run:r.run,outcome:r.result.outcome,realSeconds:r.realSeconds})),aimClicks:mall.aimClicks},
 screenshots:{original:68,revisedVariant:68,total:136,anomalies:0,pageErrors:0,externalRequests:0,saveErrors:0},
 saveDiagnostic:{status:save.status,passed:save.checks.length,exitCode:(await read('save-diagnostic-exit.json')).exitCode,historicalRootCause:'unconfirmed; repaired test-driver causes do not establish the historical outside screenshot cause'},
 occlusion:{original:occlusion.status,revisedVariant:occlusionRevised.status,casesPerVariant:8,scope:'Representative front wall/closed door four fade levels; does not cover all material/roof combinations'},
 assets:{status:'43/43 mechanical checks passed; 25 unique player frames',manifest:'assets/manifest.json',validation:'assets/validation.json'}},
 harnessNotes:['Initial PowerShell wrapper ran node --version before reading LASTEXITCODE, overwriting it. That suite-exits.json is not used as exit-code evidence. Final gates use spawnSync status, boundaries were rerun with immediate capture, all 20 regressions capture immediately.','The first occlusion fixture selected an off-screen wall; zero positive-control pixels correctly failed the probe. Final fixtures use a front-door-neighbour wall and require controlOpaquePixels > 0.'],
 limitations:['ASTRA-SAVE-01 historical anomaly not reproduced and not declared fixed','F20 total heap still grows; no Pixi/library/lifecycle change in this scope','ART-R08 visual back-weapon policy awaits Opus; not applied in preview variant','ART-R10 crouch frames absent under fixed 43 assets; idle fallback not signed off','Mirror-lighting preference awaits Opus final art review','No physical phone, human G12, WebGL context-loss test, exact local-commit remote CI or deployment'],
 artifacts,evidence};
await writeFile(resolve(root,'verification.json'),JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify({evidence:evidence.length,bytes:evidence.reduce((n,x)=>n+x.bytes,0),regressions:reg.length,mall:verification.commands.mall,heap:verification.commands.heap,artifacts},null,2));
