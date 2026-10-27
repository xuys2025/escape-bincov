// Source-health ratchets over src: every export has a user, runtime import cycles only shrink, and the pure rule
// modules stay free of DOM and renderer code. Exports used by tests or scripts count as used.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

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

const runtimeImports = () => {
  const graph = new Map();
  for (const file of ours.filter(inSrc)) {
    const from = rel(file.fileName), edges = new Set();
    for (const statement of file.statements) {
      const spec = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ? statement.moduleSpecifier : null;
      if (!spec || !ts.isStringLiteral(spec)) continue;
      const clause = ts.isImportDeclaration(statement) ? statement.importClause : null;
      const typeOnly = ts.isExportDeclaration(statement) ? statement.isTypeOnly : !!clause && (clause.isTypeOnly
        || (!clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0
          && clause.namedBindings.elements.every(e => e.isTypeOnly)));
      if (typeOnly) continue;
      const resolved = ts.resolveModuleName(spec.text, file.fileName, program.getCompilerOptions(), ts.sys).resolvedModule;
      edges.add(resolved && !resolved.isExternalLibraryImport ? rel(resolved.resolvedFileName) : `package:${spec.text}`);
    }
    graph.set(from, edges);
  }
  return graph;
};

test('runtime import cycles in src stay within the known ones', () => {
  const graph = runtimeImports();
  let next = 0; const index = new Map(), low = new Map(), stack = [], onStack = new Set(), cycles = [];
  const connect = v => {
    index.set(v, next); low.set(v, next); next++; stack.push(v); onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!index.has(w)) { connect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const component = []; let w;
    do { w = stack.pop(); onStack.delete(w); component.push(w); } while (w !== v);
    if (component.length > 1) cycles.push(component.sort());
  };
  for (const v of graph.keys()) if (!index.has(v)) connect(v);
  const unexpected = cycles.filter(c => !KNOWN_CYCLES.some(known => c.every(file => known.includes(file))));
  assert.deepEqual(unexpected, [], 'New or larger runtime import cycle: break it, or record why in #60 and KNOWN_CYCLES.');
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
