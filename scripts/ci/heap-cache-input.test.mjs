import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// V8's flat-table layout with optional metadata/columns; this is a synthetic graph, not a heap capture.
function snapshot(id, bytes) {
  return { snapshot: { meta: {
    node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'],
    node_types: [['synthetic', 'string'], 'string', 'number', 'number', 'number', 'number', 'number'],
    edge_fields: ['type', 'name_or_index', 'to_node'], edge_types: [['property', 'weak', 'element', 'hidden'], 'string_or_number', 'node'],
  }, node_count: 2, edge_count: 1, trace_function_count: 0 },
  nodes: [0, 0, 1, 0, 1, 0, 0, 1, 1, id, bytes, 0, 0, 0], edges: [0, 2, 7],
  strings: ['Window', '#define SHADER_NAME fixture_shader\nvoid main() {}', 'retainedShader'] };
}
function run(change = () => {}, previousReport) {
  const root = mkdtempSync(join(tmpdir(), 'bincov-shader-input-'));
  try {
    const a = snapshot(3, 64), b = snapshot(5, 80); change(a, b);
    for (const [cycle, data] of [[10, a], [30, b]]) writeFileSync(join(root, `cycle-${cycle}.heapsnapshot`), JSON.stringify(data));
    if (previousReport !== undefined) writeFileSync(join(root, 'shader-cache.json'), previousReport);
    const result = spawnSync(process.execPath, ['scripts/sol-heap-cache-inspect.mjs'], {
      encoding: 'utf8', timeout: 15000, env: { ...process.env, BINCOV_HEAP_OUT: root },
    });
    const written = existsSync(join(root, 'shader-cache.json'));
    const reportText = written ? readFileSync(join(root, 'shader-cache.json'), 'utf8') : null;
    return { ...result, written, reportText, report: written ? JSON.parse(reportText) : null };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function rejected(change, field) {
  const result = run(change); assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Invalid heap snapshot/); assert.match(result.stderr, field); assert.equal(result.written, false);
}

test('shader cache CLI preserves valid V8 flat-table observations and limited attribution', () => {
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report.shaderStrings, { cycle10: { count: 1, bytes: 64 }, cycle30: { count: 1, bytes: 80 },
    newRetainedCount: 1, newRetainedBytes: 80, sample: [{ id: 5, type: 'string', shader: 'fixture_shader', bytes: 80 }] });
  assert.equal(result.report.ownerPaths[0][1].edge, 'property:retainedShader');
  assert.match(result.report.method, /Not a proof that all retained heap bytes have this cause/);
  assert.equal('status' in result.report, false);
});

test('shader cache CLI rejects absent or inexact consumed byte counts before report output', () => {
  for (const value of [null, '80', -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1e308]) rejected((a, b) => { b.nodes[10] = value; }, /self_size/);
  rejected(a => { a.nodes[10] = null; }, /cycle-10.*self_size/);
  const result = run((a, b) => { b.nodes[10] = Number.MAX_SAFE_INTEGER; });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.report.shaderStrings.newRetainedBytes, Number.MAX_SAFE_INTEGER);
});

test('shader cache CLI validates consumed metadata indices and flat-table lengths', () => {
  rejected((a, b) => { b.snapshot.meta.node_fields[3] = 'other'; }, /node_fields/);
  rejected((a, b) => { b.nodes.pop(); }, /nodes/);
  rejected((a, b) => { b.nodes[7] = 9; }, /type/);
  rejected((a, b) => { b.nodes[8] = 99; }, /name/);
  rejected((a, b) => { b.nodes[9] = 1; }, /id/);
  rejected((a, b) => { b.snapshot.meta.edge_fields[2] = 'other'; }, /edge_fields/);
  const result = run((a, b) => {
    for (const s of [a, b]) {
      [s.snapshot.meta.node_fields[0], s.snapshot.meta.node_fields[1]] = ['name', 'type'];
      [s.snapshot.meta.node_types[0], s.snapshot.meta.node_types[1]] = [s.snapshot.meta.node_types[1], s.snapshot.meta.node_types[0]];
      for (let i = 0; i < s.nodes.length; i += 7) [s.nodes[i], s.nodes[i + 1]] = [s.nodes[i + 1], s.nodes[i]];
      [s.snapshot.meta.edge_fields[0], s.snapshot.meta.edge_fields[1]] = ['name_or_index', 'type'];
      [s.snapshot.meta.edge_types[0], s.snapshot.meta.edge_types[1]] = [s.snapshot.meta.edge_types[1], s.snapshot.meta.edge_types[0]];
      [s.edges[0], s.edges[1]] = [s.edges[1], s.edges[0]];
    }
  });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.report.shaderStrings.newRetainedBytes, 80);
});

test('shader cache CLI rejects incomplete incoming edges and invalid referenced table offsets', () => {
  rejected((a, b) => { b.nodes[4] = null; }, /edge_count/);
  rejected((a, b) => { b.nodes[4] = 0; }, /edges/);
  rejected((a, b) => { b.edges.pop(); }, /edges/);
  rejected((a, b) => { b.edges[0] = 9; }, /type/);
  rejected((a, b) => { b.edges[1] = 99; }, /name_or_index/);
  for (const offset of [null, 1, 14]) rejected((a, b) => { b.edges[2] = offset; }, /to_node/);
  const result = run((a, b) => { b.edges = [2, 999, 7]; });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.report.ownerPaths[0][1].edge, 'element:999');
});

test('shader cache CLI rejects unsafe shader byte sums but preserves a valid zero-match graph', () => {
  rejected((a, b) => { b.nodes[0] = 1; b.nodes[1] = 1; b.nodes[3] = Number.MAX_SAFE_INTEGER; }, /self_size total/);
  const result = run((a, b) => { for (const s of [a, b]) s.strings[1] = 'ordinary string'; });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.report.shaderStrings.newRetainedBytes, 0); assert.equal(result.report.shaderStrings.cycle30.count, 0);
});

test('shader cache CLI rejects ambiguous fields, malformed tables and unsafe identities', () => {
  rejected(a => { a.snapshot.meta.node_fields[6] = 'id'; }, /cycle-10.*node_fields/);
  rejected((a, b) => { b.snapshot.meta.edge_fields.push('to_node'); }, /edge_fields/);
  rejected(a => { a.snapshot.meta.node_types[0] = null; }, /node_types/);
  rejected((a, b) => { b.snapshot.meta.edge_types[0][0] = null; }, /edge_types/);
  rejected((a, b) => { b.strings[0] = null; }, /strings/);
  rejected(a => { a.nodes = null; }, /nodes/);
  rejected((a, b) => { b.edges = null; }, /edges/);
  for (const value of [null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    rejected(a => { a.nodes[9] = value; }, /cycle-10.*id/);
    rejected((a, b) => { b.nodes[4] = value; }, /edge_count/);
    rejected((a, b) => { b.nodes[8] = value; }, /name/);
  }
  rejected((a, b) => { b.nodes[4] = Number.MAX_SAFE_INTEGER; b.nodes[11] = 1; }, /edge_count total/);
});

test('shader cache CLI leaves unconsumed metadata and extra columns unconstrained', () => {
  const result = run((a, b) => {
    for (const s of [a, b]) {
      s.snapshot.node_count = null; s.snapshot.edge_count = 'unused';
      s.snapshot.meta.node_fields.push('future_column');
      s.snapshot.meta.node_types.push('future_metadata');
      s.snapshot.meta.node_types[0].push('future_node'); s.nodes[0] = 2;
      s.nodes = [...s.nodes.slice(0, 7), null, ...s.nodes.slice(7), { future: true }];
      s.edges[2] = 8;
    }
    // The earlier snapshot is used only for node identities and bytes, never for incoming paths.
    delete a.edges; delete a.snapshot.meta.edge_fields; delete a.snapshot.meta.edge_types;
    a.nodes[4] = null; a.nodes[12] = null;
    b.snapshot.meta.edge_fields.push('future_column'); b.edges.push({ future: true });
    b.snapshot.meta.edge_types[0].push('future_edge'); b.edges[0] = 4;
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.shaderStrings.newRetainedBytes, 80);
  assert.equal(result.report.ownerPaths[0][1].edge, 'future_edge:retainedShader');
  assert.equal(result.report.ownerPaths[0][1].type, 'future_node');
  const empty = run((a, b) => {
    for (const s of [a, b]) { s.nodes = []; s.edges = []; s.strings = []; }
  });
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(empty.report.shaderStrings, { cycle10: { count: 0, bytes: 0 }, cycle30: { count: 0, bytes: 0 },
    newRetainedCount: 0, newRetainedBytes: 0, sample: [] });
  assert.deepEqual(empty.report.ownerPaths, []);
});

test('shader cache CLI keeps node-id comparison and strong-edge name semantics', () => {
  const retained = run((a, b) => { b.nodes[9] = a.nodes[9]; });
  assert.equal(retained.status, 0, retained.stderr);
  assert.equal(retained.report.shaderStrings.newRetainedCount, 0);
  assert.deepEqual(retained.report.ownerPaths, []);
  const weak = run((a, b) => { b.edges[0] = 1; });
  assert.equal(weak.status, 0, weak.stderr);
  assert.equal(weak.report.shaderStrings.newRetainedBytes, 80);
  assert.deepEqual(weak.report.ownerPaths, []);
  const hidden = run((a, b) => { b.edges = [3, Number.MAX_SAFE_INTEGER, 7]; });
  assert.equal(hidden.status, 0, hidden.stderr);
  assert.equal(hidden.report.ownerPaths[0][1].edge, `hidden:${Number.MAX_SAFE_INTEGER}`);
  rejected((a, b) => { b.edges = [3, 1.5, 7]; }, /name_or_index/);
});

test('shader cache CLI checks exact byte sums for both snapshots and preserves prior reports on rejection', () => {
  const bothShaders = (s, bytes) => { s.nodes[0] = 1; s.nodes[1] = 1; s.nodes[3] = bytes; s.nodes[10] = 1; };
  const boundary = run((a, b) => { for (const s of [a, b]) bothShaders(s, Number.MAX_SAFE_INTEGER - 1); });
  assert.equal(boundary.status, 0, boundary.stderr);
  assert.equal(boundary.report.shaderStrings.cycle10.bytes, Number.MAX_SAFE_INTEGER);
  assert.equal(boundary.report.shaderStrings.cycle30.bytes, Number.MAX_SAFE_INTEGER);
  rejected(a => { bothShaders(a, Number.MAX_SAFE_INTEGER); }, /self_size total/);
  const previous = '{ "previous": "keep these exact bytes" }\n';
  for (const change of [(a, b) => { b.nodes[10] = null; }, (a, b) => { bothShaders(b, Number.MAX_SAFE_INTEGER); }]) {
    const result = run(change, previous);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /Invalid heap snapshot/);
    assert.equal(result.reportText, previous);
  }
});

test('shader cache CLI preserves the seven-hop attribution boundary and twelve-node sample limit', () => {
  function chain(s, hops) {
    s.nodes = [1, 1, 5, 80, 0, 0, 0]; s.edges = [];
    for (let i = 1; i <= hops; i++) {
      s.nodes.push(0, i === hops ? 0 : 2, 5 + i * 2, 0, 1, 0, 0);
      s.edges.push(0, 2, (i - 1) * 7);
    }
  }
  const seven = run((a, b) => { chain(b, 7); });
  assert.equal(seven.status, 0, seven.stderr); assert.equal(seven.report.ownerPaths[0].length, 8);
  const eight = run((a, b) => { chain(b, 8); });
  assert.equal(eight.status, 0, eight.stderr); assert.deepEqual(eight.report.ownerPaths, []);
  const sampled = run((a, b) => {
    b.nodes = []; b.edges = [];
    for (let i = 0; i < 13; i++) b.nodes.push(1, 1, 5 + i * 2, 1, 0, 0, 0);
  });
  assert.equal(sampled.status, 0, sampled.stderr);
  assert.equal(sampled.report.shaderStrings.newRetainedCount, 13);
  assert.equal(sampled.report.shaderStrings.newRetainedBytes, 13);
  assert.equal(sampled.report.shaderStrings.sample.length, 12);
});
