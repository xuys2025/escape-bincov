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
function run(change = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'bincov-shader-input-'));
  try {
    const a = snapshot(3, 64), b = snapshot(5, 80); change(a, b);
    for (const [cycle, data] of [[10, a], [30, b]]) writeFileSync(join(root, `cycle-${cycle}.heapsnapshot`), JSON.stringify(data));
    const result = spawnSync(process.execPath, ['scripts/sol-heap-cache-inspect.mjs'], {
      encoding: 'utf8', timeout: 15000, env: { ...process.env, BINCOV_HEAP_OUT: root },
    });
    const written = existsSync(join(root, 'shader-cache.json'));
    return { ...result, written, report: written ? JSON.parse(readFileSync(join(root, 'shader-cache.json'), 'utf8')) : null };
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
