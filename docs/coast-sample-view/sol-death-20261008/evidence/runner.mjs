import {spawn,spawnSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
assert.equal(process.version,'v24.19.0');
const root=resolve('test-results/sol-death-20261008');await mkdir(root,{recursive:true});
const group=process.argv[2]||'core',corepack='C:/Program Files/nodejs/node_modules/corepack/dist/corepack.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(args)=>{const r=spawnSync('git',['-c','safe.directory=D:/bincov/pr22-runtime',...args],{maxBuffer:12*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;};
if(group==='baseline'){
 const head=git(['rev-parse','HEAD']).toString().trim();assert.equal(head,'bf099cc9a2f3aef86c7b45feea357d8ce940cbbb');
 const main=git(['rev-parse','origin/main']).toString().trim();
 const headers={'User-Agent':'bincov-local-verification','Accept':'application/vnd.github+json'};
 const get=async url=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,url);return r.json();};
 const [pr,comments,reviews]=await Promise.all([get('https://api.github.com/repos/xuys2025/escape-bincov/pulls/22'),get('https://api.github.com/repos/xuys2025/escape-bincov/issues/22/comments'),get('https://api.github.com/repos/xuys2025/escape-bincov/pulls/22/reviews')]);
 const checks=await get('https://api.github.com/repos/'+pr.head.repo.full_name+'/commits/'+pr.head.sha+'/check-runs');
 const response=await fetch('https://xuys2025.github.io/escape-bincov/',{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const pages=Buffer.from(await response.arrayBuffer()),mainHTML=git(['show','origin/main:dist/index.html']);
 const report={at:new Date().toISOString(),head,branch:git(['branch','--show-current']).toString().trim(),main,initialStatus:git(['status','--porcelain=v1']).toString(),node:process.version,platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,totalMemory:os.totalmem(),pr:{url:pr.html_url,state:pr.state,merged:pr.merged,headRepository:pr.head.repo.full_name,headBranch:pr.head.ref,headSHA:pr.head.sha,body:pr.body,comments:comments.map(c=>({url:c.html_url,at:c.updated_at,body:c.body})),reviews:reviews.map(c=>({state:c.state,at:c.submitted_at,body:c.body})),checks:checks.check_runs.map(c=>({name:c.name,status:c.status,conclusion:c.conclusion,headSHA:c.head_sha}))},pages:{url:response.url,bytes:pages.length,sha256:hash(pages),mainHTMLSHA256:hash(mainHTML),equalsMain:pages.equals(mainHTML)},scope:'Local OPUS-DEATH-01 verification only; no remote mutations.'};
 await writeFile(resolve(root,'baseline.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({head,main,pr:report.pr.state,remoteHead:report.pr.headSHA,pages:report.pages,node:process.version}));process.exit(0);
}
const run=async(id,args,extra={})=>{const started=new Date().toISOString();let output='';const result=await new Promise((done,fail)=>{const c=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,PATH:dirname(process.execPath)+';'+process.env.PATH,...extra},stdio:['ignore','pipe','pipe']});c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>output+=b);c.on('error',fail);c.on('close',(exitCode,signal)=>done({exitCode,signal}));});await writeFile(resolve(root,id+'.log'),output.replace(/\r\n/g,'\n'));console.log(id,JSON.stringify(result));return{id,args,environment:extra,node:process.version,started,finished:new Date().toISOString(),...result};};
let jobs=[];
if(group==='core')jobs=['test','package'].map(id=>[id,[corepack,'pnpm',id],{}]);
if(group==='target')jobs=[['sol-visual',['scripts/sol-round4-visual.mjs'],{BINCOV_VISUAL_OUT:root+'/visual'}],['sample',['scripts/coast-sample-test.mjs'],{BINCOV_SAMPLE_OUT:root+'/sample'}]];
if(group==='lifecycle')jobs=[['lifecycle-1280',['--import','tsx','scripts/coast-lifecycle-test.mjs'],{BINCOV_LIFECYCLE_OUT:root+'/lifecycle-1280',BINCOV_LIFECYCLE_WIDE:''}],['lifecycle-1920',['--import','tsx','scripts/coast-lifecycle-test.mjs'],{BINCOV_LIFECYCLE_OUT:root+'/lifecycle-1920',BINCOV_LIFECYCLE_WIDE:'1'}]];
if(group==='shots')jobs=[['shots',['scripts/coast-sample-shots.mjs'],{BINCOV_SHOTS_OUT:root+'/shots'}]];
const suites={visual:['ui','tactical','art','title','title-water'],inventory:['save-browser','expansion','qol-expansion','loot','loot-target','qol','portable'],world:['buildings','systems','mall-passages','mall-landing'],input:['browser','desktop-input','mobile','mobile-ux']};
if(suites[group])jobs=suites[group].map(s=>['regression-'+s,[corepack,'pnpm','test:'+s],{}]);
assert(jobs.length,'Unknown group '+group);const rows=[];
for(const[id,args,env]of jobs){rows.push(await run(id,args,env));await writeFile(resolve(root,group+'.json'),JSON.stringify(rows,null,2)+'\n');if(group==='core'&&rows.at(-1).exitCode)break;}
if(rows.some(r=>r.exitCode!==0))process.exitCode=1;
