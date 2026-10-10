// Focused retained paths in the exact packaged (minified) build. Names are extracted from the recorded HTML,
// not guessed from a previous build. All outputs are aggregate counts / field names, no stored save strings.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {unpack,dominators} from './astra-r7-heap-graph.mjs';
import {buildNames} from './station-resource-build-map.mjs';
// --html=<build that produced the snapshots> (default dist/index.html). Its names must be verified in the build map,
// and a report.json next to the snapshots must record the same build.
const [first,last,out]=process.argv.slice(2).filter(a=>!a.startsWith('--'));if(!out)throw Error('first last output required');
const html=await readFile(process.argv.find(a=>a.startsWith('--html='))?.slice(7)??'dist/index.html','utf8');
const build=buildNames(html),buildSHA256=build.sha256;
for(const f of [first,last]){const r=join(dirname(f),'report.json');if(existsSync(r)&&JSON.parse(await readFile(r,'utf8')).buildSHA256!==buildSHA256)throw Error(f+' was recorded with another build');}
const classFor=needle=>{const at=html.indexOf(needle);if(at<0)throw Error('Missing class marker '+needle);const start=html.lastIndexOf('=class',at);const declaration=html.slice(start-40,start+50);const name=/([\w$]+)=class(?: ([\w$]+))?/.exec(declaration);if(!name)throw Error(declaration);return name[2]??name[1];};
const aliases={
  [classFor('wallCellTextures')]: 'HideoutScene',
  [classFor('this.frameFailed(d)')]: 'StationHost',
  [classFor('this.handle=t;')]: 'CoastSampleHost',
  [classFor('freezeFrames')]: 'CoastRaidRuntime',
  [classFor('upHolder')]: 'CoastView',
  [build.QuadGeometry]:'QuadGeometry',[build.Buffer]:'Buffer',[build.CanvasSource]:'CanvasSource',[build.TextureSource]:'TextureSource',[build.HideoutScene]:'HideoutScene',[build.Texture]:'Texture',
};
const a=unpack(JSON.parse(await readFile(first,'utf8'))),b=unpack(JSON.parse(await readFile(last,'utf8')));
// RenderTexture has a short inner class name (build.RenderTexture, e.g. "c") that is not unique. Match the Texture instance shape too.
function renderTextures(g){const rows=[];for(let i=0;i<g.count;i++){const d=g.describe(i);if(d.type!=='object'||d.name!==build.RenderTexture)continue;const names=new Set();for(let e=g.starts[i];e<g.starts[i+1];e++)names.add(g.edgeName(e));if(names.has('property:frame')&&names.has('property:orig')&&names.has('property:_source'))rows.push(i);}return rows;}
const count=g=>{const result=Object.fromEntries(Object.entries(aliases).map(([name,role])=>[role+':'+name,0]));result['RenderTexture:shape-verified-'+build.RenderTexture]=renderTextures(g).length;for(let i=0;i<g.count;i++){const d=g.describe(i);if(d.type==='object'&&aliases[d.name]){const key=aliases[d.name]+':'+d.name;result[key]++;}}return result;};
const dom=dominators(b.starts,b.targets,b.sizes),parent=new Int32Array(b.count).fill(-1),via=new Uint32Array(b.count),q=new Uint32Array(b.count);parent[0]=0;let tail=1;
for(let head=0;head<tail;head++){const u=q[head];for(let e=b.starts[u];e<b.starts[u+1];e++){const v=b.targets[e];if(parent[v]<0){parent[v]=u;via[v]=e;q[tail++]=v;}}}
const path=i=>{const p=[];for(let n=0;n<70;n++){p.push({...b.describe(i),...(i?{via:b.edgeName(via[i])}:{})});if(i===0||parent[i]<0)break;i=parent[i];}return p.reverse();};
const selected=[],seen={};
const oldIds=new Set(a.ids);
const strings=[...Array(b.count).keys()].filter(i=>!oldIds.has(b.ids[i])&&b.describe(i).type.includes('string')).sort((i,j)=>b.sizes[j]-b.sizes[i]).slice(0,8);
for(const i of strings)selected.push({...b.describe(i),role:'new string (content omitted)',reachable:parent[i]>=0,graphRetainedBytes:dom.retained[i],path:path(i)});
for(const i of renderTextures(b)){const d=b.describe(i);selected.push({...d,role:'RenderTexture (shape verified)',reachable:parent[i]>=0,graphRetainedBytes:dom.retained[i],path:path(i)});}
for(let i=0;i<b.count;i++){
 const d=b.describe(i);if(d.type!=='object'||!aliases[d.name])continue;
 // All host/scene/quad instances; up to six buffers/sources (large source populations otherwise drown the useful paths).
 const limit=/Host|Scene|Geometry/.test(aliases[d.name])?50:6;
 if((seen[d.name]??0)>=limit)continue;seen[d.name]=(seen[d.name]??0)+1;
 selected.push({...d,role:aliases[d.name],reachable:parent[i]>=0,graphRetainedBytes:dom.retained[i],path:path(i)});
}
await writeFile(out,JSON.stringify({first,last,buildSHA256,aliases,before:count(a),after:count(b),method:'Same V8 graph parser/dominators as R7; weak edges excluded. BFS root paths; graph retained sizes overlap and are not GPU/native retained memory. Minified names derived from the recorded HTML and verified per build SHA in station-resource-build-map.mjs.',examples:selected},null,2));
console.log({out,before:count(a),after:count(b)});
