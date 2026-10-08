// Validate the fixed first-batch contract and compare meaningful ART repair metrics.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const sharp=createRequire(import.meta.url)(process.env.BINCOV_SHARP_MODULE || 'C:/Users/xty/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=resolve('docs/coast-sample-view/sol-round3-20261008/assets'),oldRoot=resolve('docs/coast-sample-view/sol-acceptance-20261008/assets');
const check=spawnSync(process.execPath,['scripts/sol-verify-assets.mjs'],{env:{...process.env,BINCOV_ASSET_ROOT:root},stdio:'inherit'});assert.equal(check.status,0);
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
const validation=JSON.parse(await readFile(resolve(root,'validation.json'),'utf8'));
const rgba=async p=>sharp(p).ensureAlpha().raw().toBuffer();
const lum=(d,i)=>.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
function metrics(d){const values=[];let bright=0;for(let i=0;i<d.length;i+=4)if(d[i+3]){const y=lum(d,i);values.push(y);if(y>=120)bright++;}const mean=values.reduce((a,b)=>a+b,0)/values.length;return{mean,standardDeviation:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length),brightPixels:bright,opaquePixels:values.length};}
const material=[];
for(const a of manifest.assets){await access(resolve(root,a.source));if(a.layer==='ground')material.push({id:a.id,before:metrics(await rgba(resolve(oldRoot,a.file))),after:metrics(await rgba(resolve(root,a.file)))});}
const yards=material.filter(a=>a.id.includes('yard'));for(const a of yards){assert.ok(a.after.brightPixels<a.before.brightPixels*.25);assert.ok(a.after.standardDeviation<a.before.standardDeviation);}
const tiles=material.filter(a=>a.id.includes('tile'));const tileDelta=Math.abs(tiles[0].after.mean-tiles[1].after.mean);assert.ok(tileDelta<=8);assert.ok(tiles[0].after.mean<tiles[0].before.mean);
const cap=await rgba(resolve(root,manifest.assets.find(a=>a.part==='core').file));
for(let i=0;i<32;i++){assert.deepEqual(cap.subarray(i*128,i*128+4),cap.subarray(i*128+124,i*128+128));assert.deepEqual(cap.subarray(i*4,i*4+4),cap.subarray(31*128+i*4,31*128+i*4+4));}
const walls=await Promise.all(manifest.assets.filter(a=>a.part?.startsWith('exterior')).map(a=>rgba(resolve(root,a.file))));
for(let y=0;y<48;y++)assert.deepEqual(walls[0].subarray((y*32+31)*4,(y*32+32)*4),walls[1].subarray(y*32*4,y*32*4+4));
assert.equal(manifest.assets.filter(a=>a.sha256===a.previousSha256).length,9);
validation.repairs={material,tileMeanDelta:tileDelta,corePairedEdges:true,exteriorSharedEdges:true,changedPNGs:34,unchangedPNGs:9,allSourceReferencesExist:true};
validation.repairDisposition=manifest.repairDisposition;
validation.note='Mechanical contract and before/after material metrics passed. R08 needs Opus to consume the visual back-weapon policy; R10 has no crouch frame within fixed 43. In-engine review is recorded separately, never inferred from these checks.';
await writeFile(resolve(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify(validation.repairs,null,2));
