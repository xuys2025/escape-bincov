// Optional importer rehearsal against the current game's real layout function. Does not write game files.
// Standalone validate.mjs remains independent of these imports.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root,docs,manifest } from './assemble.mjs';
import { GUNSMITH_ART } from '../../../../../src/art/gunsmith-art-meta.ts';
import { gunArtLayout } from '../../../../../src/art/gunsmith-layout.ts';
import { validateBuild } from '../../../../../src/gunsmith/compat.ts';
import { buildOf } from '../../../../../src/gunsmith/instance.ts';
const saved=JSON.parse(readFileSync(resolve(root,docs+'/assembly-records.json')));
for(const a of manifest.assets)GUNSMITH_ART[a.id.replace(/-v\d+$/,'')]=a;
let next=0;const tree=parts=>parts.map(([id,slot,children=[]])=>({uid:`p0-${++next}`,id,slot,relief:false,children:tree(children)}));
const checks=[];
for(const [configuration,parts] of Object.entries(saved.configurations)) {
  const build=tree(parts);assert.ok(validateBuild(buildOf({id:'akb74',parts:build})).ok,configuration+' valid build');
  for(const code of ['h','i','w']) {
    const actual=gunArtLayout('akb74',build,code),expected=saved.assemblies.find(a=>a.configuration===configuration&&a.code===code);
    assert.deepEqual([actual.w,actual.h,actual.tip],[expected.w,expected.h,expected.tip]);
    assert.deepEqual(actual.layers.map(l=>({key:l.key,label:l.label,origin:[l.x,l.y]})),expected.layers);
    if(code==='h')assert.deepEqual([actual.grip,actual.bore,actual.forward,actual.hand],[expected.grip,expected.bore,expected.forward,expected.hand]);
    if(expected.beam)assert.deepEqual(actual.beam,expected.beam);
    checks.push({configuration,code,status:'pass',size:[actual.w,actual.h]});
  }
}
const bare=gunArtLayout('akb74',[],'h',false);assert.deepEqual(bare.layers.map(l=>({key:l.key,label:l.label,origin:[l.x,l.y]})),saved.bareFactory.layers);
const report={status:'pass',codeHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'Incoming metadata injected into a process-local copy of the current exported metadata table; real validateBuild and gunArtLayout; no runtime or build files written',checks,bareFactory:'pass',scope:'Importer rehearsal only. In-game render, eight headings, fire effects, two desktop sizes and maintainer review remain M3-04.'};
writeFileSync(resolve(root,docs+'/runtime-layout-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
