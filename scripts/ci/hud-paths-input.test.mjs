import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Synthetic V8 flat tables, never a captured heap. Freeze the original CLI as a negative control.
const before = readFileSync(new URL('./fixtures/hud-paths-before-validation.txt', import.meta.url), 'utf8');
const sentinel = '{ "previous": "keep these exact bytes" }\n';
function snapshot() {
  return { snapshot: { meta: {
    node_fields: ['type', 'name', 'id', 'edge_count', 'unused'],
    node_types: [['synthetic', 'native', 'string', 'object'], 'string', 'number', 'number', 'future'],
    edge_fields: ['type', 'name_or_index', 'to_node'],
    edge_types: [['property', 'weak', 'element', 'hidden'], 'string_or_number', 'node'],
  }, node_count: 2, edge_count: 1 }, nodes: [0, 0, 1, 1, null, 1, 1, 3, 0, null],
  edges: [0, 2, 5], strings: ['Window', 'cs-hud fixture', 'retainedHUD', 'PRIVATE_SNAPSHOT_CONTENT'] };
}
const cli = (script, out, files) => spawnSync(process.execPath, [script, out, ...files], { encoding: 'utf8', timeout: 15000 });
function run(change = () => {}, { previous, compare = false, badJson = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bincov-hud-input-'));
  try {
    const graphs = [snapshot(), snapshot()]; change(...graphs);
    const files = graphs.map((graph, i) => {
      const file = join(root, `input-${i}.heapsnapshot`);
      writeFileSync(file, badJson && i === 1 ? '{ "PRIVATE_SNAPSHOT_CONTENT": broken }' : JSON.stringify(graph));
      return file;
    });
    const out = join(root, 'hud.json');
    if (previous !== undefined) writeFileSync(out, previous);
    const result = cli('scripts/sol-f20-hud-paths.mjs', out, files);
    const reportText = existsSync(out) ? readFileSync(out, 'utf8') : null;
    const report = result.status === 0 ? JSON.parse(result.stdout) : null;
    let old;
    if (compare) {
      const script = join(root, 'before.mjs'), oldOut = join(root, 'before.json'); writeFileSync(script, before);
      const baseline = cli(script, oldOut, files);
      old = { ...baseline, reportText: existsSync(oldOut) ? readFileSync(oldOut, 'utf8') : null,
        report: baseline.status === 0 ? JSON.parse(baseline.stdout) : null };
    }
    return { ...result, report, reportText, old };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function rejected(change, field) {
  // Check both absent output and an existing sentinel for every malformed graph.
  for (const previous of [undefined, sentinel]) {
    const result = run(change, { previous });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Invalid heap snapshot .*input-[01]\.heapsnapshot\./);
    assert.match(result.stderr, field);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes('PRIVATE_SNAPSHOT_CONTENT'), false);
    assert.equal(result.reportText, previous ?? null);
  }
}
function parity(change) {
  const result = run(change, { compare: true });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.old.status, 0, result.old.stderr);
  assert.equal(result.reportText, result.old.reportText); assert.equal(result.stdout, result.old.stdout);
  return result.report[1].hud;
}

test('HUD paths CLI keeps the original two-node strong path and valid output bytes', () => {
  const hud = parity();
  assert.deepEqual(hud, [{ node: { id: 3, type: 'native', name: 'cs-hud fixture' }, reachable: true,
    path: [{ id: 1, type: 'synthetic', name: 'Window' }, { id: 3, type: 'native', name: 'cs-hud fixture', via: 'property:retainedHUD' }] }]);
});

test('HUD paths CLI distinguishes valid unreachable and weak-only graphs', () => {
  for (const change of [(a, b) => { b.nodes[3] = 0; b.edges = []; }, (a, b) => { b.edges[0] = 1; }]) {
    const hud = parity(change); assert.equal(hud[0].reachable, false); assert.deepEqual(hud[0].path, []);
  }
  const empty = parity((a, b) => { b.nodes = []; b.edges = []; b.strings = []; });
  assert.deepEqual(empty, []);
});

test('HUD paths CLI rejects missing or inexact edge_count before replacing a report', () => {
  for (const value of [null, '1', -1, 0.5, Number.MAX_SAFE_INTEGER + 1, 1e308]) {
    rejected((a, b) => { b.nodes[3] = value; }, /input-1.*edge_count/);
  }
  rejected((a, b) => { delete b.nodes[3]; }, /edge_count/);
  rejected((a, b) => { b.snapshot.meta.node_fields[3] = 'other'; }, /node_fields.*edge_count/);
  rejected((a, b) => { b.nodes.pop(); }, /nodes/);
  rejected((a, b) => { b.nodes[3] = 0; }, /edges/);
  rejected((a, b) => { b.nodes[3] = Number.MAX_SAFE_INTEGER; b.nodes[8] = 1; }, /edge_count total/);
});

test('HUD paths original CLI is an effective negative control for null edge_count', () => {
  const result = run((a, b) => { b.nodes[3] = null; }, { previous: sentinel, compare: true });
  assert.equal(result.old.status, 0, result.old.stderr);
  assert.equal(result.old.report[1].hud[0].reachable, false);
  assert.equal(result.status, 1); assert.match(result.stderr, /edge_count/); assert.equal(result.reportText, sentinel);
});

test('HUD paths CLI rejects ambiguous strides, malformed arrays and missing type tables', () => {
  for (const [change, field] of [
    [b => { delete b.snapshot; }, /node_fields/],
    [b => { b.snapshot.meta.node_fields = []; }, /node_fields/],
    [b => { b.snapshot.meta.node_fields[4] = 'id'; }, /node_fields/],
    [b => { b.snapshot.meta.edge_fields.push('to_node'); }, /edge_fields/],
    [b => { b.snapshot.meta.edge_fields[2] = 'other'; }, /edge_fields/],
    [b => { b.snapshot.meta.node_types[0] = null; }, /node_types/],
    [b => { b.snapshot.meta.edge_types[0][0] = null; }, /edge_types/],
    [b => { b.nodes = null; }, /nodes/], [b => { b.edges = null; }, /edges/],
    [b => { b.strings = null; }, /strings/], [b => { b.edges.pop(); }, /edges/],
  ]) rejected((a, b) => change(b), field);
});

test('HUD paths CLI validates consumed node values and strong-edge indices without leaking strings', () => {
  for (const value of [null, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    rejected((a, b) => { b.nodes[2] = value; }, /id/);
    rejected((a, b) => { b.nodes[0] = value; }, /type/);
    rejected((a, b) => { b.nodes[1] = value; }, /name/);
    rejected((a, b) => { b.edges[0] = value; }, /type/);
    rejected((a, b) => { b.edges[1] = value; }, /name_or_index/);
    rejected((a, b) => { b.edges[2] = value; }, /to_node/);
  }
  rejected((a, b) => { b.nodes[0] = 9; }, /type/);
  rejected((a, b) => { b.nodes[1] = 99; }, /name/);
  rejected((a, b) => { b.strings[1] = null; }, /name/);
  rejected((a, b) => { b.edges[0] = 9; }, /type/);
  rejected((a, b) => { b.edges[1] = 99; }, /name_or_index/);
  rejected((a, b) => { b.strings[2] = null; }, /name_or_index/);
  for (const offset of [1, 10]) rejected((a, b) => { b.edges[2] = offset; }, /to_node/);
  for (const type of [2, 3]) {
    const hud = parity((a, b) => { b.edges[0] = type; b.edges[1] = Number.MAX_SAFE_INTEGER; });
    assert.match(hud[0].path[1].via, /^(element|hidden):9007199254740991$/);
    rejected((a, b) => { b.edges[0] = type; b.edges[1] = 0.5; }, /name_or_index/);
  }
});

test('HUD paths CLI validates either multi-input position before writing output', () => {
  rejected(a => { a.nodes[3] = null; }, /input-0.*edge_count/);
  const result = run(() => {}, { previous: sentinel, badJson: true });
  assert.equal(result.status, 1); assert.match(result.stderr, /input-1.*JSON/);
  assert.equal(result.stderr.includes('PRIVATE_SNAPSHOT_CONTENT'), false); assert.equal(result.reportText, sentinel);
});

test('HUD paths CLI accepts reordered metadata and leaves unconsumed columns unconstrained', () => {
  const result = run((a, b) => {
    for (const s of [a, b]) {
      s.snapshot.node_count = null; s.snapshot.edge_count = 'unused';
      s.snapshot.meta.node_types[0].push('future_type');
      s.snapshot.meta.edge_types[0].push('future_edge');
      s.snapshot.meta.node_types[4] = null; s.nodes[4] = { future: true };
      [s.snapshot.meta.node_fields[0], s.snapshot.meta.node_fields[1]] = ['name', 'type'];
      [s.snapshot.meta.node_types[0], s.snapshot.meta.node_types[1]] = [s.snapshot.meta.node_types[1], s.snapshot.meta.node_types[0]];
      for (let i = 0; i < s.nodes.length; i += 5) [s.nodes[i], s.nodes[i + 1]] = [s.nodes[i + 1], s.nodes[i]];
      [s.snapshot.meta.edge_fields[0], s.snapshot.meta.edge_fields[1]] = ['name_or_index', 'type'];
      [s.snapshot.meta.edge_types[0], s.snapshot.meta.edge_types[1]] = [s.snapshot.meta.edge_types[1], s.snapshot.meta.edge_types[0]];
      [s.edges[0], s.edges[1]] = [s.edges[1], s.edges[0]];
    }
  });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.report[1].hud[0].path[1].via, 'property:retainedHUD');
  const future = parity((a, b) => {
    b.snapshot.meta.node_types[0].push('future_type'); b.nodes[0] = 4;
    b.snapshot.meta.edge_types[0].push('future_edge'); b.edges[0] = 4;
  });
  assert.equal(future[0].path[0].type, 'future_type'); assert.equal(future[0].path[1].via, 'future_edge:retainedHUD');
});

test('HUD paths CLI preserves string omission, label truncation and the eighty-node path limit', () => {
  const hud = parity((a, b) => {
    b.nodes = [0, 0, 1, 1, null, 2, 3, 3, 1, null, 1, 1, 5, 0, null];
    b.edges = [0, 2, 5, 0, 2, 10]; b.strings[1] = 'cs-hud' + 'x'.repeat(300);
  });
  assert.equal(hud[0].node.name.length, 250); assert.equal(hud[0].path[1].name, '(omitted)');
  for (const hops of [79, 80, 81]) {
    const path = parity((a, b) => {
      b.nodes = []; b.edges = [];
      for (let i = 0; i <= hops; i++) {
        b.nodes.push(i === hops ? 1 : 0, i === hops ? 1 : 0, i * 2 + 1, i === hops ? 0 : 1, null);
        if (i < hops) b.edges.push(0, 2, (i + 1) * 5);
      }
    })[0].path;
    assert.equal(path.length, 80); assert.equal(path[0].id, Math.max(0, hops - 79) * 2 + 1);
  }
});

test('HUD paths CLI ignores omitted string-node names and weak-edge payloads', () => {
  const hud = parity((a, b) => {
    b.nodes = [2, null, 1, 1, null, ...b.nodes.slice(5)]; b.edges = [1, null, null];
    b.strings.push(null);
  });
  assert.equal(hud[0].reachable, false);
});
