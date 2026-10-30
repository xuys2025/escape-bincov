// Rehearse importing incoming metadata in this process; leave source/manifest untouched.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GUNSMITH_ART} from '../../../../../src/art/gunsmith-art-meta.ts';
import {gunArtLayout} from '../../../../../src/art/gunsmith-layout.ts';
import {NO_MAG} from '../../../../../src/gunsmith/signature.ts';
import {canvas,decode,blit} from '../../m3-w3/source/pixels.mjs';
process.chdir(fileURLToPath(new URL('../../../../../',import.meta.url)));
const dir='docs/gunsmith/art/m4-mags',incoming=JSON.parse(readFileSync('assets/gunsmith/incoming/m4-mags/manifest.json')),formal=JSON.parse(readFileSync('assets/gunsmith/manifest.json'));
const key=a=>a.id.replace(/-v\d+$/,''),images=new Map(formal.assets.map(a=>[key(a),decode(a.file)]));
const paint=l=>{const c=canvas(l.w,l.h);for(const a of l.layers)blit(c,images.get(a.key),a.x,a.y);return c;};
const hash=b=>createHash('sha256').update(b).digest('hex');
const before=[];
for(const gun of ['svdb','vb9'])for(const code of ['h','i','w'])for(const gloves of code==='h'?[false,true]:[false]){const l=gunArtLayout(gun,[],code,gloves);before.push({gun,code,gloves,layout:l,rgba:paint(l).data});}
for(const a of incoming.assets){GUNSMITH_ART[key(a)]=a;images.set(key(a),decode(a.file));}
const checks=[];
for(const b of before){const l=gunArtLayout(b.gun,[],b.code,b.gloves),r=l.layers.find(x=>x.label==='receiver'),m=l.layers.find(x=>x.label==='mag');
  assert.ok(m&&r);assert.ok(l.layers.indexOf(m)<l.layers.indexOf(r));assert.deepEqual([l.w,l.h,l.tip,l.grip,l.hand,l.bore,l.forward],[b.layout.w,b.layout.h,b.layout.tip,b.layout.grip,b.layout.hand,b.layout.bore,b.layout.forward]);
  const rendered=paint(l);assert.deepEqual(rendered.data,b.rgba);
  const empty=gunArtLayout(b.gun,[{uid:'art-check-empty',id:NO_MAG,slot:'mag',relief:false,children:[]}],b.code,b.gloves);assert.ok(!empty.layers.some(x=>x.label==='mag'));
  assert.notDeepEqual(paint(empty).data,b.rgba);
  checks.push({gun:b.gun,output:b.code,gloves:b.gloves,status:'pass',originalRGBA:hash(b.rgba),recombinedRGBA:hash(rendered.data),differingPixels:0,magBeforeReceiver:true,emptyMagLayerAbsent:true,tip:l.tip,grip:l.grip,hand:l.hand});
}
const report={schema:1,date:'2026-10-30',status:'pass',factoryLayouts:8,emptyLayouts:8,checks,method:'Process-local incoming metadata injection into real gunArtLayout; actual PNG rendering in layer order. Includes H with gloves and H bare side views. No source/manifest writes and no gameplay integration.'};
writeFileSync(`${dir}/source/runtime-layout-check.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,factoryLayouts:8,emptyLayouts:8,differingPixels:0}));
