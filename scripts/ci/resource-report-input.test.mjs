import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inventory, checkRelease } from '../station-resource-probe.mjs';
import { readManagedTables } from '../pixi-managed-gate.mjs';

// Use the current producer functions over synthetic resources, without a browser or actual heap/resource sampling.
function observations(nullPlaceholder = false) {
  const source = { uid: 99, destroyed: false }, texture = { uid: 100, source, width: 32, height: 32 };
  const geometry = { uid: 0 }, buffers = [0, 1, 2].map(uid => ({ uid }));
  const names = ['graphics', 'graphicsContext', 'glBuffer', 'glTexture', 'glGeometry', 'tilingSprite'];
  const tables = Object.fromEntries(names.map(name => [name, {}]));
  tables.glGeometry[0] = geometry; buffers.forEach((value, i) => { tables.glBuffer[i] = value; });
  const renderer = { gc: { _running: false, _managedResourceHashes: names.map(name => ({ context: { name, items: tables[name] }, hash: 'items' })) }, renderPipes: { batch: { _batchersByInstructionSet: {} } } };
  const scene = { textures: new Map([['fixed-scene', texture]]), wallCellTextures: new Map([[texture, [texture]]]), masonry: new Map(), npcCanvases: new Map() };
  const host = { scene, app: { renderer } }, ids = new WeakMap(); let next = 1;
  const before = globalThis.window;
  try {
    const retired = { uid: 7, destroyed: true };
    globalThis.window = { __station: { host }, __resourceProbe: { id(value) { if (!ids.has(value)) ids.set(value, next++); return ids.get(value); }, registrations: new WeakMap() },
      __resourceReleased: { host: new WeakRef(host), scene: new WeakRef(scene), objects: [new WeakRef(retired)] } };
    const sample = (label, firstKey) => {
      for (const key of Object.keys(tables.glTexture)) delete tables.glTexture[key];
      tables.glTexture[99] = source;
      for (let i = 0; i < 3; i++) tables.glTexture[firstKey + i] = { uid: firstKey + i, destroyed: false };
      if (nullPlaceholder && firstKey === 3) tables.glTexture[0] = null;
      return { label, counts: { heap: 1000, scene: scene.textures.size, wallFrameGroups: scene.wallCellTextures.size, wallFrames: 1,
        gpuTextures: Object.keys(tables.glTexture).length, tables: readManagedTables(renderer) }, objects: inventory(), release: checkRelease() };
    };
    return { baseline: sample('round-0', 0), next: sample('round-1', 3) };
  } finally { if (before === undefined) delete globalThis.window; else globalThis.window = before; }
}
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
function report(mode) {
  const { baseline } = observations();
  return { mode, rounds: 60, status: 'PARTIAL', baseline, rows: Array.from({ length: 60 }, (_, index) => {
    const row = structuredClone(baseline); row.label = `round-${index + 1}`; row.counts.heap += index + 1; return row;
  }), errors: [], frameAudit: [], external: [], strictFailures: [{ fixture: 'retired host is intentionally retained' }], ownershipFailures: [] };
}
function input(root, mutate = () => {}) {
  const reports = {};
  for (const mode of ['remount', 'shared', 'context']) {
    const r = report(mode); mutate(r, mode); reports[mode] = r;
    mkdirSync(join(root, `long-${mode}`), { recursive: true }); save(join(root, `long-${mode}`, 'report.json'), r);
  }
  mkdirSync(join(root, 'sol-r-repro')); save(join(root, 'sol-r-repro', 'report.json'), { fixture: true });
  mkdirSync(join(root, 'identity-probe'));
  const { baseline, next } = observations();
  save(join(root, 'identity-probe', 'report.json'), { initial: baseline, firstReturn: next, status: 'PARTIAL', strictFailures: [] });
  for (const name of ['cold', 'first-return', 'restore-1', 'restore-2', 'restore-3', 'final-remount']) save(join(root, 'identity-probe', `${name}-identities.json`), baseline);
  return reports;
}
const cli = (tool, ...args) => spawnSync(process.execPath, [`scripts/station-resource-${tool}.mjs`, ...args], { encoding: 'utf8', timeout: 15000 });
const temporary = fn => { const root = mkdtempSync(join(tmpdir(), 'bincov-resource-input-')); try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); } };

test('summary CLI accepts current producer fields and preserves PARTIAL, failures and numeric observations', () => temporary(root => {
  const expected = input(root), out = join(root, '..', `${root.split(/[\\/]/).at(-1)}-output`);
  try {
    const result = cli('summarize', root, out); assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    for (const mode of ['remount', 'shared', 'context']) {
      assert.equal(summary.modes[mode].status, 'PARTIAL'); assert.equal(summary.modes[mode].strictFailures, 1);
      assert.equal(summary.modes[mode].heap.min, 1001); assert.equal(summary.modes[mode].heap.max, 1060);
      const compact = JSON.parse(readFileSync(join(out, `long-${mode}.json`), 'utf8'));
      assert.deepEqual(compact.strictFailures, expected[mode].strictFailures); assert.equal(compact.rows.length, 60);
      if (mode !== 'context') assert.equal(compact.checks.allTrackedResourcesCollected, false, 'retained destroyed objects are not collected');
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
}));

test('summary CLI rejects incomplete and duplicate rounds before creating any promoted output', () => {
  for (const change of [r => { r.rows = []; }, r => { r.rows.length = 1; }, r => { r.rows.length = 59; },
    r => { r.rows[59].label = 'round-59'; }, r => { r.rows[1].label = 'round-3'; }]) temporary(root => {
    input(root, (r, mode) => { if (mode === 'context') change(r); }); const out = join(root, 'output');
    const result = cli('summarize', root, out); assert.equal(result.status, 1); assert.match(result.stderr, /Invalid resource report context\.rows/); assert.equal(existsSync(out), false);
  });
});

test('summary CLI rejects missing observations instead of equating undefined identities or coercing invalid numbers', () => {
  const cases = [
    ['counts.heap', r => { r.rows[0].counts.heap = null; }], ['counts.heap', r => { r.rows[0].counts.heap = '1000'; }],
    ['counts.heap', r => { r.rows[0].counts.heap = 1e308; }], ['counts.heap', r => { r.rows[0].counts.heap = Number.MAX_SAFE_INTEGER + 1; }],
    ['counts.heap', r => { r.rows[0].counts.heap = 1.5; }],
    ['release.tracked', r => { delete r.rows[0].release.tracked; delete r.rows[0].release.collected; }],
    ['rendererId', r => { delete r.rows[0].objects.rendererId; }],
    ['geometries', r => { r.rows.forEach(row => { row.objects.geometries = []; }); }],
    ['buffers', r => { delete r.rows[0].objects.buffers[0].id; }],
  ];
  for (const [field, change] of cases) temporary(root => {
    input(root, (r, mode) => { if (mode === 'shared') change(r); }); const out = join(root, 'output');
    const result = cli('summarize', root, out); assert.equal(result.status, 1); assert.ok(result.stderr.includes(field), result.stderr); assert.equal(existsSync(out), false);
  });
  temporary(root => {
    input(root, (r, mode) => { if (mode === 'shared') r.rows[0].counts.heap = 'OVERFLOW'; });
    // JSON's numeric grammar allows this literal, but JSON.parse represents it as Infinity.
    const file = join(root, 'long-shared', 'report.json'); writeFileSync(file, readFileSync(file, 'utf8').replace('"OVERFLOW"', '1e400'));
    const out = join(root, 'output'), result = cli('summarize', root, out);
    assert.equal(result.status, 1); assert.match(result.stderr, /counts\.heap/); assert.equal(existsSync(out), false);
  });
});

test('summary CLI accepts the technical safe-integer byte limit without overflowing derived statistics', () => temporary(root => {
  input(root, r => { r.baseline.counts.heap = Number.MAX_SAFE_INTEGER; for (const row of r.rows) row.counts.heap = Number.MAX_SAFE_INTEGER; });
  const out = join(root, '..', `${root.split(/[\\/]/).at(-1)}-output`);
  try {
    const result = cli('summarize', root, out); assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    for (const mode of ['remount', 'shared', 'context']) {
      const heap = summary.modes[mode].heap;
      assert.equal(heap.max, Number.MAX_SAFE_INTEGER);
      for (const [key, value] of Object.entries(heap)) if (key !== 'units') assert.ok(Number.isFinite(value), `${mode}.heap.${key}`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
}));

test('slot CLI preserves a valid partial one-round audit and its explicit observed round count', () => temporary(root => {
  const { baseline, next } = observations(), file = join(root, 'input.json'), out = join(root, 'out.json');
  save(file, { mode: 'context', rounds: 60, baseline, rows: [next], status: 'PARTIAL' });
  const result = cli('target-slots', file, out); assert.equal(result.status, 0, result.stderr);
  const { summary } = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(summary.rounds, 1); assert.equal(summary.everyRoundThreeOut, true); assert.equal(summary.everyRoundThreeIn, true);
}));

test('slot CLI accepts producer null placeholders without requiring unused live identity metadata', () => temporary(root => {
  const { baseline, next } = observations(true), file = join(root, 'input.json'), out = join(root, 'out.json');
  const empty = next.objects.rows.find(row => row.table === 'glTexture' && !row.live);
  assert.ok(empty); assert.equal(Object.hasOwn(empty, 'textureKey'), false);
  save(file, { mode: 'context', baseline, rows: [next], status: 'PARTIAL' });
  const result = cli('target-slots', file, out); assert.equal(result.status, 0, result.stderr);
  const { summary } = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(summary.rounds, 1); assert.equal(summary.finalEmpty, 1); assert.equal(summary.everyRoundThreeOut, false);
  assert.equal(summary.everyNewNullWasLive, true);
}));

test('slot CLI rejects missing rounds, duplicate labels/keys and nonboolean live fields before output', () => {
  const cases = [
    ['rows', r => { r.rows = []; }], ['label', r => { r.rows.push(structuredClone(r.rows[0])); }],
    ['label', r => { r.rows[0].label = 'round-2'; }],
    ['key', r => { const row = r.rows[0].objects.rows.find(row => row.table === 'glTexture'); r.rows[0].objects.rows.push({ ...row }); }],
    ['live', r => { r.rows[0].objects.rows.find(row => row.table === 'glTexture').live = 'false'; }],
  ];
  for (const [field, change] of cases) temporary(root => {
    const { baseline, next } = observations(), r = { mode: 'context', baseline, rows: [next] }; change(r);
    const file = join(root, 'input.json'), out = join(root, 'out.json'); save(file, r);
    const result = cli('target-slots', file, out); assert.equal(result.status, 1); assert.ok(result.stderr.includes(field), result.stderr); assert.equal(existsSync(out), false);
  });
});

test('a real archived aggregate is explicitly rejected as raw input rather than silently adapted', () => temporary(root => {
  // The repository retains compact R3 summaries/raw hashes, not the local sixty-round raw report tree.
  const historical = 'docs/station-yard/astra-resource-r3-20261010/evidence/summary.json';
  const out = join(root, 'out.json'), result = cli('target-slots', historical, out);
  assert.equal(result.status, 1); assert.match(result.stderr, /Invalid resource report context\.mode/); assert.equal(existsSync(out), false);
}));
