// Substitutes PNG data URLs only in an ignored verification copy, never in src/dist/runtime assets.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root=resolve('docs/coast-sample-view/sol-round3-20261008/assets'),oldRoot=resolve('assets/coast/v1'),out=resolve('test-results/sol-round3/art-revised');
await mkdir(out,{recursive:true});
const m=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
let html=await readFile('dist/index.html','utf8');const originalSha=sha(html),replacements=[];
for(const a of m.assets){const original=await readFile(resolve(oldRoot,a.id+'.png')),replacement=await readFile(resolve(root,a.file));assert.equal(sha(original),a.previousSha256);if(a.sha256===a.previousSha256)continue;const before='data:image/png;base64,'+original.toString('base64'),after='data:image/png;base64,'+replacement.toString('base64');const occurrences=html.split(before).length-1;assert.equal(occurrences,1,a.id);html=html.replace(before,after);replacements.push({id:a.id,before:a.previousSha256,after:a.sha256,occurrences});}
assert.equal(replacements.length,34);
await writeFile(resolve(out,'preview.html'),html);
await writeFile(resolve(out,'variant.json'),JSON.stringify({baseline:'6a7e6b1',source:'dist/index.html',sourceSHA256:originalSha,variantSHA256:sha(html),method:'34 exact PNG data-URL replacements only; no JS/CSS/logic edits; detached verification copy, not integrated deliverable',replacements},null,2)+'\n');
console.log('Created isolated art verification variant with 34 replacements.');
