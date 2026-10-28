// Source-health ratchets over src: every export has a user, runtime import cycles only shrink, and the pure rule
// modules stay free of DOM and renderer code. Exports used by tests or scripts count as used.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { adjacency, cyclesIn, headlessProblems, sourceGraph } from '../source-graph.mjs';

const root = resolve('.');
const ts = createRequire(join(root, 'package.json'))('typescript');
const rel = file => relative(root, file).split(sep).join('/');
const walk = (dir, exts, out = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, exts, out);
    else if (exts.some(ext => name.endsWith(ext))) out.push(path);
  }
  return out;
};
const sources = walk(join(root, 'src'), ['.ts']);
const program = ts.createProgram([...sources, ...walk(join(root, 'tests'), ['.ts']), ...walk(join(root, 'scripts'), ['.mjs', '.js', '.ts'])], {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true, checkJs: false, allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: ['node'],
});
const checker = program.getTypeChecker();
const ours = program.getSourceFiles().filter(f => !f.isDeclarationFile && !f.fileName.includes('/node_modules/'));
const inSrc = file => rel(file.fileName).startsWith('src/');
const target = symbol => {
  for (let i = 0; symbol && symbol.flags & ts.SymbolFlags.Alias && i < 8; i++) symbol = checker.getAliasedSymbol(symbol);
  return symbol;
};

// Rule modules (AGENTS.md section 3): they import only each other and use nothing that only the DOM provides.
const PURE = ['src/domain.ts', 'src/balance.ts', 'src/world.ts', 'src/perks.ts', 'src/breath.ts', 'src/gunsmith/catalog.ts', 'src/gunsmith/compat.ts',
  'src/gunsmith/stats.ts', 'src/gunsmith/instance.ts', 'src/gunsmith/migrate.ts', 'src/gunsmith/edit.ts', 'src/gunsmith/devices.ts', 'src/gunsmith/bench.ts', 'src/gunsmith/presets.ts', 'src/gunsmith/signature.ts', 'src/gunsmith/item-facts.ts'];
// Known runtime cycles, tracked in #60; the two it listed (Q-E05 save codecs, Q-E02 view routers) are gone. A listed
// cycle may shrink or disappear; a new or larger one fails.
const KNOWN_CYCLES = [];

test('every exported declaration in src is used somewhere besides its own declaration', () => {
  const exported = new Map();
  for (const file of ours.filter(inSrc)) {
    const module = checker.getSymbolAtLocation(file);
    for (const symbol of module ? checker.getExportsOfModule(module) : []) {
      const decl = target(symbol)?.declarations?.[0];
      if (decl && decl.getSourceFile() === file) exported.set(target(symbol), `${rel(file.fileName)}:${file.getLineAndCharacterOfPosition(decl.getStart()).line + 1} ${symbol.getName()}`);
    }
  }
  const used = new Set();
  const mark = symbol => { const s = target(symbol); if (s && exported.has(s)) used.add(s); };
  for (const file of ours) {
    const visit = node => {
      if (ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
        mark(checker.getShorthandAssignmentValueSymbol(node.parent)); // `{ app, persist }` refers to the variables
      } else if (ts.isIdentifier(node) && !(node.parent && 'name' in node.parent && node.parent.name === node && ts.isDeclaration?.(node.parent) && !ts.isBindingElement(node.parent))) {
        mark(checker.getSymbolAtLocation(node));
      }
      // `const { play } = await import('./player')` names the export through the destructured module object.
      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
        const name = node.propertyName ?? node.name;
        if (ts.isIdentifier(name)) mark(checker.getTypeAtLocation(node.parent).getProperty(name.text));
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const unused = [...exported].filter(([symbol]) => !used.has(symbol)).map(([, where]) => where).sort();
  assert.deepEqual(unused, [], 'Delete these exports, or use them: nothing in src, tests or scripts refers to them.');
});

const model = sourceGraph(program, root);
const runtimeImports = () => adjacency(model);

test('all source module loads have a resolvable literal target', () => {
  assert.deepEqual(model.problems, []);
});

test('runtime import cycles in src stay within the known ones', () => {
  const unexpected = cyclesIn(runtimeImports()).filter(c => !KNOWN_CYCLES.some(known => c.every(file => known.includes(file))));
  assert.deepEqual(unexpected, [], 'New or larger runtime import cycle (including lazy loads): break it, or record why in #60 and KNOWN_CYCLES.');
});

test('headless rules, saves and runtimes stay independent of views and browser globals transitively', () => {
  assert.deepEqual(headlessProblems(model, program), []);
});

test('the rule modules import only each other and use nothing that only the DOM provides', () => {
  const graph = runtimeImports();
  for (const file of PURE) for (const dep of graph.get(file) ?? []) assert.ok(PURE.includes(dep), `${file} imports ${dep}`);
  const domOnly = [];
  for (const file of ours.filter(f => PURE.includes(rel(f.fileName)))) {
    const visit = node => {
      if (ts.isIdentifier(node)) {
        const decls = target(checker.getSymbolAtLocation(node))?.declarations ?? [];
        if (decls.length && decls.every(d => /lib\.dom(\.iterable)?\.d\.ts$/.test(d.getSourceFile().fileName))) {
          domOnly.push(`${rel(file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.deepEqual(domOnly, []);
});
