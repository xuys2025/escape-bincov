// Import rehearsal in one process. Never writes game code, formal PNGs or generated metadata.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,docs,incoming,assemble} from './assemble.mjs';
import {rows} from './design.mjs';
import {GUNSMITH_ART} from '../../../../../src/art/gunsmith-art-meta.ts';
import {gunArtLayout} from '../../../../../src/art/gunsmith-layout.ts';
import {gunSize,buildOf} from '../../../../../src/gunsmith/instance.ts';
import {validateBuild} from '../../../../../src/gunsmith/compat.ts';
import {GUNS} from '../../../../../src/gunsmith/catalog.ts';
const guns=Object.keys(GUNS),held=guns.map(g=>[g,JSON.stringify(gunArtLayout(g,[],'h'))]);
for(const a of incoming.assets)GUNSMITH_ART[a.id.replace(/-v\d+$/,'')]=a;
const checks=[];
for(const row of rows)for(const part of row.variants){
 const parts=part?[{id:part,slot:'mag',uid:'m3-w3-'+part,relief:false,children:[]}]:[],gun={id:row.gun,parts};
 assert.ok(validateBuild(buildOf(gun)).ok,row.gun+'/'+part+' compatible');const size=gunSize(gun);assert.deepEqual([size.w,size.h],row.size);
 for(const code of ['i','w']){
  const actual=gunArtLayout(row.gun,parts,code),expected=assemble(row.gun,part,code).record;
  assert.deepEqual([actual.w,actual.h,actual.tip],[expected.w,expected.h,expected.tip]);assert.deepEqual(actual.layers.map(l=>({key:l.key,label:l.label,origin:[l.x,l.y]})),expected.layers);
  const f=code==='i'?1:2;assert.ok(actual.w<=size.w*36*f&&actual.h<=size.h*26*f);
  checks.push({gun:row.gun,part:part??'factory',code,status:'pass',size:[actual.w,actual.h],cells:[size.w,size.h]});
 }
}
for(const [gun,old]of held)assert.equal(JSON.stringify(gunArtLayout(gun,[],'h')),old,gun+' held unchanged');
const report={schema:1,status:'pass',codeHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'Process-local GUNSMITH_ART injection; real validateBuild, gunSize and gunArtLayout. No formal importer or source files written.',configurations:checks.length/2,layouts:checks.length,heldUnchanged:guns.length,checks,scope:'Importer rehearsal for 21 brief configurations, not live-game screenshots or exhaustive loadout testing. Opus integrates after visual acceptance.'};
writeFileSync(resolve(root,docs+'/source/runtime-layout-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,configurations:report.configurations,layouts:report.layouts,heldUnchanged:report.heldUnchanged}));
