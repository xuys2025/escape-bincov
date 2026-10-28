// Read-only source navigation; uses the exact dependency model used by check:ci.
import { resolve } from 'node:path';
import { adjacency, cyclesIn, moduleReport, sourceGraph, sourceProject } from './source-graph.mjs';

try {
  const args = process.argv.slice(2), json = args.includes('--json');
  if (args.length === 1 && args[0] === '--help') {
    console.log('pnpm architecture [src/path.ts] [--json]\n只读 TS 依赖图；类型/静态/动态边分列，不是调用图或测试覆盖保证。');
  } else {
    const files = args.filter(a => a !== '--json');
    if (args.filter(a => a === '--json').length > 1 || files.length > 1 || files.some(f => f.startsWith('-'))) throw Error('Usage: pnpm architecture [src/path.ts] [--json]');
    const root = resolve('.'), model = sourceGraph(sourceProject(root), root);
    if (model.problems.length) throw Error(model.problems.join('\n'));
    const report = files.length ? moduleReport(model, files[0].replaceAll('\\', '/')) : {
      modules: model.nodes.size,
      edges: [...model.nodes.values()].flatMap(n => n.edges).reduce((n, e) => ({ ...n, [e.kind]: n[e.kind] + 1 }), { static: 0, dynamic: 0, type: 0 }),
      runtimeCycles: cyclesIn(adjacency(model)),
      mostConsumers: [...model.nodes.keys()].map(file => ({ file, consumers: new Set(moduleReport(model, file).consumers.map(c => c.from)).size }))
        .sort((a, b) => b.consumers - a.consumers || a.file.localeCompare(b.file)).slice(0, 10),
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('静态源码依赖（值形式导入保守计入；不执行游戏、不推断运行时调用）');
      console.log(JSON.stringify(report, null, 2));
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
