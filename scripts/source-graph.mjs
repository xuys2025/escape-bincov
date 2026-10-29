// Shared static architecture model. No game modules are executed.
// "static" means a value-form import/export (conservative: TS may erase an unused
// value import); "dynamic" is a literal import()/unshadowed require(). Type edges
// remain queryable but never create runtime cycles. This is not a JS call graph.
import ts from 'typescript';
import { isBuiltin } from 'node:module';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

export const sourcePath = (root, path) => relative(root, path).replaceAll('\\', '/');
export function sourceFiles(dir, extensions = ['.ts']) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path, extensions) : extensions.some(ext => path.endsWith(ext)) ? [path] : [];
  }).sort();
}

export function sourceProject(root) {
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw Error(parsed.errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('\n'));
  return ts.createProgram(sourceFiles(resolve(root, 'src')), parsed.options);
}

export function sourceGraph(program, root) {
  const files = program.getSourceFiles().filter(f => !f.isDeclarationFile && sourcePath(root, f.fileName).startsWith('src/'));
  const checker = program.getTypeChecker(), nodes = new Map(), problems = [];
  for (const file of files) {
    const from = sourcePath(root, file.fileName), edges = [];
    const at = node => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    const add = (spec, kind, node) => {
      if (!spec || !ts.isStringLiteralLike(spec)) {
        problems.push(`${from}:${at(node)} non-literal module load cannot be checked`); return;
      }
      const resolved = ts.resolveModuleName(spec.text, file.fileName, program.getCompilerOptions(), ts.sys).resolvedModule;
      let to;
      if (resolved && !resolved.isExternalLibraryImport) to = sourcePath(root, resolved.resolvedFileName);
      else if (spec.text.startsWith('.')) {
        const asset = resolve(dirname(file.fileName), spec.text);
        if (existsSync(asset) && statSync(asset).isFile()) to = sourcePath(root, asset);
        else { problems.push(`${from}:${at(node)} unresolved local module: ${spec.text}`); return; }
      } else if (resolved || isBuiltin(spec.text)) to = `package:${spec.text}`;
      else { problems.push(`${from}:${at(node)} unresolved package: ${spec.text}`); return; }
      edges.push({ to, kind, line: at(node) });
    };
    const visit = node => {
      if (ts.isImportDeclaration(node)) {
        const c = node.importClause, bindings = c?.namedBindings;
        const type = c?.isTypeOnly || c && !c.name && bindings && ts.isNamedImports(bindings)
          && bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly);
        add(node.moduleSpecifier, type ? 'type' : 'static', node);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const c = node.exportClause;
        const type = node.isTypeOnly || c && ts.isNamedExports(c) && c.elements.length > 0 && c.elements.every(e => e.isTypeOnly);
        add(node.moduleSpecifier, type ? 'type' : 'static', node);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        add(node.moduleReference.expression, node.isTypeOnly ? 'type' : 'static', node);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        add(node.argument.literal, 'type', node);
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], 'dynamic', node);
        else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          const declarations = checker.getSymbolAtLocation(node.expression)?.declarations ?? [];
          if (!declarations.some(d => !d.getSourceFile().isDeclarationFile)) add(node.arguments[0], 'dynamic', node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    nodes.set(from, { file, edges: edges.sort((a, b) => a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)) });
  }
  return { nodes: new Map([...nodes].sort(([a], [b]) => a.localeCompare(b))), problems: problems.sort() };
}

export function adjacency(model, includeTypes = false) {
  return new Map([...model.nodes].map(([file, node]) => [file,
    new Set(node.edges.filter(e => includeTypes || e.kind !== 'type').map(e => e.to))]));
}

// Shortest paths give actionable failures without dumping the entire dependency tree.
export function dependencyPaths(graph, roots) {
  const paths = new Map();
  for (const root of roots) {
    if (!graph.has(root)) throw Error(`Unknown source module: ${root}`);
    paths.set(root, [root]);
  }
  const queue = [...paths.keys()];
  for (let i = 0; i < queue.length; i++) for (const dep of graph.get(queue[i]) ?? []) {
    if (!paths.has(dep)) { paths.set(dep, [...paths.get(queue[i]), dep]); queue.push(dep); }
  }
  return paths;
}

export function cyclesIn(graph) {
  let next = 0;
  const index = new Map(), low = new Map(), stack = [], onStack = new Set(), cycles = [];
  const connect = v => {
    index.set(v, next); low.set(v, next++); stack.push(v); onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!index.has(w)) { connect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const component = []; let w;
    do { w = stack.pop(); onStack.delete(w); component.push(w); } while (w !== v);
    if (component.length > 1 || graph.get(v).has(v)) cycles.push(component.sort());
  };
  for (const v of graph.keys()) if (!index.has(v)) connect(v);
  return cycles.sort((a, b) => a.join().localeCompare(b.join()));
}

export const HEADLESS_ROOTS = [
  'src/domain.ts', 'src/balance.ts', 'src/world.ts', 'src/session.ts',
  'src/recovery-store.ts', 'src/save-backup.ts',
  'src/skill-tree-research.ts', 'src/skill-tree-mechanics.ts',
  'src/raid-runtime/runtime.ts', 'src/hideout-runtime/runtime.ts',
];
const browserGlobals = new Set(['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'fetch']);
const browserModule = path => /(^src\/(?:coast-view|station-view|gunsmith-view|view-lifecycle|title|opening|art)\/)|(^src\/(?:app|main|ui|pixi-app|navigation)\.ts$)/.test(path);
export function headlessProblems(model, program, roots = HEADLESS_ROOTS) {
  // Follow type edges too: a core contract must not borrow view types.
  const paths = dependencyPaths(adjacency(model, true), roots), problems = [], checker = program.getTypeChecker();
  for (const [path, chain] of paths) {
    if (!model.nodes.has(path) || browserModule(path)) {
      problems.push(`Headless dependency: ${chain.join(' -> ')}`); continue;
    }
    const file = model.nodes.get(path).file;
    const visit = node => {
      if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node) {
        let symbol = checker.getSymbolAtLocation(node);
        if (ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node && ts.isStringLiteralLike(node)) {
          symbol = checker.getTypeAtLocation(node.parent.expression).getProperty(node.text);
        }
        if (ts.isBindingElement(node.parent) && ts.isObjectBindingPattern(node.parent.parent)) {
          const key = node.parent.propertyName ?? node.parent.name;
          if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) symbol = checker.getTypeAtLocation(node.parent.parent).getProperty(key.text);
        }
        if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        const declarations = symbol?.declarations ?? [];
        // TextEncoder is also a Node API. LockManager is an existing injected port,
        // not permission to read navigator.locks or instantiate browser globals.
        const portable = node.text === 'LockManager' && ts.isTypeReferenceNode(node.parent) || declarations.length && declarations.every(d =>
          d.parent?.name?.text === 'TextEncoder' || d.parent?.name?.text === 'LockManager');
        const ambientGlobal = browserGlobals.has(symbol?.getName()) && declarations.length && declarations.every(d => d.getSourceFile().isDeclarationFile);
        if (ambientGlobal || !portable && declarations.length && declarations.every(d => /lib\.dom(?:\.iterable)?\.d\.ts$/.test(d.getSourceFile().fileName))) {
          const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
          problems.push(`DOM dependency: ${chain.join(' -> ')}:${line} ${symbol.getName()}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...new Set(problems)].sort();
}

export function moduleReport(model, file) {
  if (!model.nodes.has(file)) throw Error(`Unknown source module: ${file}`);
  return {
    file, dependencies: model.nodes.get(file).edges,
    consumers: [...model.nodes].flatMap(([from, node]) => node.edges.filter(e => e.to === file).map(e => ({ from, kind: e.kind, line: e.line }))),
    transitiveRuntimeModules: [...dependencyPaths(adjacency(model), [file]).keys()].filter(p => p !== file && model.nodes.has(p)).sort(),
  };
}
