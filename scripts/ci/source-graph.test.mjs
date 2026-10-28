import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';
import { adjacency, cyclesIn, dependencyPaths, headlessProblems, moduleReport, sourceGraph } from '../source-graph.mjs';

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'bincov-architecture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const program = ts.createProgram(Object.keys(files).filter(f => f.endsWith('.ts')).map(f => join(root, f)), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: ['node'], typeRoots: [resolve('node_modules/@types')],
    skipLibCheck: true, noEmit: true,
  });
  return { model: sourceGraph(program, root), program };
}

test('literal lazy loads and re-exports participate in cycles; type-only back edges do not', t => {
  const { model } = fixture(t, {
    'src/a.ts': "export const load = () => import('./b'); export type T = number;",
    'src/b.ts': "export { c } from './c'; export { type T } from './a';",
    'src/c.ts': "import { load } from './a'; export const c = load;",
    'src/types.ts': "import type { T } from './a'; export type { T }; export type Other = import('./b').T;",
    'src/self.ts': "void import('./self'); export const value = 1;",
  });
  assert.deepEqual(model.problems, []);
  assert.deepEqual(cyclesIn(adjacency(model)), [['src/a.ts', 'src/b.ts', 'src/c.ts'], ['src/self.ts']]);
  assert.deepEqual(model.nodes.get('src/b.ts').edges.map(e => [e.to, e.kind]), [['src/a.ts', 'type'], ['src/c.ts', 'static']]);
  assert.equal(adjacency(model).get('src/types.ts').size, 0);
  const report = moduleReport(model, 'src/a.ts');
  assert.ok(report.consumers.some(c => c.from === 'src/b.ts' && c.kind === 'type'));
  assert.deepEqual(report.transitiveRuntimeModules, ['src/b.ts', 'src/c.ts']);
});

test('side effects, mixed and empty exports remain runtime edges; import-equals and require are visible', t => {
  const { model } = fixture(t, {
    'src/a.ts': "import './side'; export {} from './side'; export { type T, value } from './side'; import { type T } from './side'; import legacy = require('./legacy'); const r = require('./legacy'); export { legacy, r };",
    'src/side.ts': 'export type T = number; export const value = 1;',
    'src/legacy.ts': 'export const value = 2;',
    'src/shadow.ts': "const require = (x: string) => x; require('./not-a-module'); export {};",
  });
  assert.deepEqual(model.problems, []);
  assert.deepEqual(new Set(model.nodes.get('src/a.ts').edges.map(e => e.kind)), new Set(['static', 'type', 'dynamic']));
  assert.equal(model.nodes.get('src/shadow.ts').edges.length, 0);
  assert.deepEqual([...adjacency(model).get('src/a.ts')], ['src/legacy.ts', 'src/side.ts']);
});

test('missing targets and non-literal loads fail explicitly; existing resource leaves are resolved', t => {
  const { model } = fixture(t, {
    'src/a.ts': "import './missing'; const name = './b'; void import(name); import './style.css'; void import('../assets/a.webp'); import 'uninstalled-example-package'; import 'node:misspelled-module';",
    'src/style.css': 'body {}', 'assets/a.webp': 'fixture bytes',
  });
  assert.equal(model.problems.length, 4);
  assert.ok(model.problems.some(p => p.includes('unresolved local module: ./missing')));
  assert.ok(model.problems.some(p => p.includes('non-literal module load')));
  assert.ok(model.problems.some(p => p.includes('unresolved package: uninstalled-example-package')));
  assert.deepEqual(model.nodes.get('src/a.ts').edges.map(e => e.to), ['assets/a.webp', 'src/style.css']);
});

test('headless boundary follows new helper modules and type edges, reporting the path to views and assets', t => {
  const { model, program } = fixture(t, {
    'src/session.ts': "import { value } from './helper'; export { value };",
    'src/helper.ts': "export type { View } from './coast-view/contract'; export const value = () => import('./coast-view/scene');",
    'src/coast-view/contract.ts': 'export type View = number;',
    'src/coast-view/scene.ts': "import '../style.css'; export const scene = 1;",
    'src/style.css': 'body {}',
  });
  const problems = headlessProblems(model, program, ['src/session.ts']);
  assert.ok(problems.some(p => p.includes('src/session.ts -> src/helper.ts -> src/coast-view/contract.ts')));
  assert.ok(problems.some(p => p.includes('src/helper.ts -> src/coast-view/scene.ts')));
  assert.ok(problems.some(p => p.endsWith('src/style.css')));
  assert.throws(() => dependencyPaths(adjacency(model), ['src/typo.ts']), /Unknown source module/);
});

test('headless browser global detection follows aliases but allows encoding, injected locks and local names', t => {
  const { model, program } = fixture(t, {
    'src/session.ts': "export { save } from './helper';",
    'src/helper.ts': "const browser = globalThis; export const save = () => browser.document.title; export const store = () => localStorage.clear(); export const computed = () => browser['sessionStorage']; const { navigator: nav } = browser; export { nav }; export const badLock = () => new LockManager();",
    'src/allowed.ts': "export const size = (s: string) => new TextEncoder().encode(s).length; export const own = (locks: LockManager) => locks.request('key', () => {}); export const local = () => { const document = { title: 'local' }; return document.title; };",
  });
  assert.deepEqual(headlessProblems(model, program, ['src/allowed.ts']), []);
  const problems = headlessProblems(model, program, ['src/session.ts']);
  assert.ok(problems.some(p => /src\/session.ts -> src\/helper.ts:1 document/.test(p)));
  assert.ok(problems.some(p => p.endsWith('localStorage')));
  for (const name of ['sessionStorage', 'navigator', 'LockManager']) assert.ok(problems.some(p => p.endsWith(name)), name);
});

test('CLI rejects invalid arguments and unknown files instead of producing an empty successful report', () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/architecture.mjs', ...args], { encoding: 'utf8' });
  for (const args of [['--wat'], ['src/a.ts', 'src/b.ts'], ['--json', '--json'], ['src/not-here.ts']]) {
    const result = cli(...args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Usage:|Unknown source module/);
  }
  const result = cli('src/session.ts', '--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.file, 'src/session.ts');
  assert.ok(report.dependencies.some(e => e.to === 'src/recovery-store.ts'));
  assert.ok(report.consumers.some(e => e.from === 'src/raid-runtime/runtime.ts'));
  assert.equal(cli('--help').status, 0);
});
