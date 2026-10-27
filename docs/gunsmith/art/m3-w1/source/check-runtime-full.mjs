// Importer rehearsal against the game's actual layout and compatibility rules; process-local metadata only.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root,docs,manifest,configurations,newGuns } from './batch-assemble.mjs';
import { GUNSMITH_ART } from '../../../../../src/art/gunsmith-art-meta.ts';
import { gunArtLayout } from '../../../../../src/art/gunsmith-layout.ts';
import { validateBuild } from '../../../../../src/gunsmith/compat.ts';
import { buildOf,gunSize } from '../../../../../src/gunsmith/instance.ts';
import { ATTACHMENTS,GUNS } from '../../../../../src/gunsmith/catalog.ts';
const saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json')));
for(const a of manifest.assets)GUNSMITH_ART[a.id.replace(/-v\d+$/,'')]=a;
for(const a of manifest.virtual)GUNSMITH_ART[a.key]=a;
let next=0;const tree=parts=>parts.map(([id,slot,children=[]])=>({uid:`w1-${++next}`,id,slot,relief:false,children:tree(children)}));
const checks=[];
for(const [gun,configs]of Object.entries(configurations))for(const [configuration,parts]of Object.entries(configs)){
 const build=tree(parts),valid=validateBuild(buildOf({id:gun,parts:build}));assert.ok(valid.ok,JSON.stringify({gun,configuration,valid}));const size=gunSize({id:gun,parts:build});
 for(const code of ['h','i','w']){
  const actual=gunArtLayout(gun,build,code),expected=saved.assemblies.find(a=>a.gun===gun&&a.configuration===configuration&&a.code===code);
  assert.deepEqual([actual.w,actual.h,actual.tip],[expected.w,expected.h,expected.tip],`${gun}/${configuration}/${code} frame`);
  assert.deepEqual(actual.layers.map(l=>({key:l.key,label:l.label,origin:[l.x,l.y]})),expected.layers,`${gun}/${configuration}/${code} layers`);
  if(code==='h')assert.deepEqual([actual.grip,actual.bore,actual.forward,actual.hand],[expected.grip,expected.bore,expected.forward,expected.hand]);if(expected.beam)assert.deepEqual(actual.beam,expected.beam);
  const limits=code==='h'?[48,16]:code==='i'?[size.w*36,size.h*26]:[size.w*72,size.h*52];assert.ok(actual.w<=limits[0]&&actual.h<=limits[1]);checks.push({gun,configuration,code,status:'pass',size:[actual.w,actual.h],footprint:size});
 }
}
for(const gun of newGuns){const a=gunArtLayout(gun,[],'h',false),b=saved.bareFactories.find(b=>b.gun===gun);assert.deepEqual(a.layers.map(l=>({key:l.key,label:l.label,origin:[l.x,l.y]})),b.layers);}
const newIds=[...new Set(manifest.assets.map(a=>a.item).filter(Boolean))],required=[...new Set([...newIds,'O01','O03','O08','M03','M06','B01','F01','F03','T01','T05'])],available=new Set([...required,...Object.keys(ATTACHMENTS).filter(id=>GUNSMITH_ART[`gs-${id.toLowerCase()}-i`])]);
const fitChecks=[];
for(const gun of Object.keys(configurations))for(const id of required){const a=ATTACHMENTS[id],node=[id,a.mount],prefix=a.needs.filter(n=>n.on.includes(gun)).map(n=>[n.part,ATTACHMENTS[n.part].mount]);
 const candidates=[[...prefix,node]];
 for(const opener of available){const o=ATTACHMENTS[opener];if(opener!==id&&o.provides[a.mount]&&(GUNS[gun].slots[o.mount]??0)>0)candidates.push([...prefix,[opener,o.mount,[node]]]);}
 const candidate=candidates.find(c=>validateBuild(buildOf({id:gun,parts:tree(c)})).ok);if(!candidate)continue;
 const build=tree(candidate),size=gunSize({id:gun,parts:build});
 for(const code of ['h','i','w']){const layout=gunArtLayout(gun,build,code),shared=`gs-${id.toLowerCase()}-${code}`,own=shared+'-'+gun,key=GUNSMITH_ART[own]?own:shared;
  if(code==='h'&&a.mount==='grip'&&!GUNSMITH_ART[key])continue;
  assert.ok(layout.layers.some(l=>l.key===key),`${gun}/${id}/${code} compatible part has artwork and a mount`);
  const limit=code==='h'?[48,16]:code==='i'?[size.w*36,size.h*26]:[size.w*72,size.h*52];assert.ok(layout.w<=limit[0]&&layout.h<=limit[1],`${gun}/${id}/${code} ${layout.w}x${layout.h} <= ${limit}`);
 }
 fitChecks.push({gun,part:id,status:'pass',opener:candidate.map(p=>p[0])});
}
for(const id of newIds)assert.ok(fitChecks.some(c=>c.part===id),id+' has a represented legal fit');
const report={status:'pass',codeHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'Incoming metadata and virtual entries injected only into a process-local exported table; actual validateBuild, gunSize and gunArtLayout; no game files written',configurations:31,checks,fitChecks,bareFactories:{status:'pass',guns:newGuns},scope:'Importer rehearsal only. Official import, virtual image source integration, eight headings, firing effects, two desktop sizes, real devices and maintainer review remain M3-04.'};
writeFileSync(resolve(root,docs+'/runtime-layout-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,configurations:31,layouts:checks.length,bareFactories:newGuns.length,fitRelations:fitChecks.length,newPartIds:newIds.length}));
