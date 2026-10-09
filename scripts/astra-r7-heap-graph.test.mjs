import {test} from 'node:test';import assert from 'node:assert/strict';import {dominators} from './astra-r7-heap-graph.mjs';
function graph(edges){const starts=[0],targets=[];for(const row of edges){targets.push(...row);starts.push(targets.length);}return{starts:Uint32Array.from(starts),targets:Uint32Array.from(targets),sizes:Float64Array.from(edges.map((_,i)=>i+1))};}
function reachable(edges,removed=-1){const seen=new Set();if(removed===0)return seen;const q=[0];seen.add(0);for(const u of q)for(const v of edges[u])if(v!==removed&&!seen.has(v)){seen.add(v);q.push(v);}return seen;}
test('dominator graph handles cycles, diamonds, sharing and unreachable nodes',()=>{
 const edges=[[1,2],[3],[3],[4],[3],[]],g=graph(edges),r=dominators(g.starts,g.targets,g.sizes);
 assert.deepEqual([...r.idom],[0,0,0,0,3,-1]);assert.equal(r.retained[3],9);assert.equal(r.retained[0],15);
});
test('graph dominators and retained sums match independent vertex-removal reachability',()=>{
 let seed=42;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let run=0;run<100;run++){const edges=Array.from({length:18},()=>[]);for(let a=0;a<18;a++)for(let b=0;b<18;b++)if(rand()<.13)edges[a].push(b);
 const g=graph(edges),r=dominators(g.starts,g.targets,g.sizes),live=reachable(edges);
 for(const d of live){const without=reachable(edges,d);const expected=[...live].filter(n=>!without.has(n));const actual=[...live].filter(n=>{for(let p=n;;p=r.idom[p]){if(p===d)return true;if(!p||p<0)return false;}});assert.deepEqual(actual,expected);assert.equal(r.retained[d],expected.reduce((s,n)=>s+g.sizes[n],0));}
 }
});
