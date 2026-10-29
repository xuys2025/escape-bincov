import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { defaultWorld, raidWorlds, sampleEnabled, sampleMallLayout, sampleMode, villageSeed } from '../src/raid-areas';
import { SAMPLE_AREA } from '../src/sample-area';
import { generateRunBase } from '../src/world';

test('village selection matches the pre-migration implementation at fixed inputs', () => {
  // Captured by executing 393ad575 before moving the definition, not calculated from the new bounds.
  const oldResults = [[0, 5], [1, 5], [3, 5], [42, 48], [400, 407], [999999999, 1000000000],
    [1793250000000, 1793250000000], [4294967295, 4294967301]];
  assert.deepEqual(SAMPLE_AREA, { x: 96, y: 32, w: 1088, h: 832 });
  for (const [from, expected] of oldResults) {
    assert.equal(villageSeed(from), expected);
    const run = generateRunBase(expected);
    assert.ok(run.spawn.x >= 96 && run.spawn.x < 1184 && run.spawn.y >= 32 && run.spawn.y < 864);
    assert.ok(run.exits.some(e => e.id === 'north'));
  }
});

test('village search retains half-open bounds, north requirement, 400 attempts and fallback', () => {
  // Execute the real selector with only its world producer replaced; no production injection API is needed.
  const code = ts.transpileModule(readFileSync(new URL('../src/raid-areas.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = createRequire(import.meta.url), calls: number[] = [];
  let world = { spawn: { x: 96, y: 32 }, exits: [{ id: 'south' }] };
  let northAt: number | undefined;
  const exports: { villageSeed?: (from: number) => number } = {};
  runInNewContext(code, { exports, URLSearchParams, require: (id: string) => id === './world'
    ? { generateRunBase: (seed: number) => { calls.push(seed); return seed === northAt
      ? { spawn: { x: 96, y: 32 }, exits: [{ id: 'north' }] } : world; } }
    : id === './sample-area' ? { SAMPLE_AREA } : require(id) });
  const select = exports.villageSeed!;
  assert.equal(select(42), 42);
  assert.deepEqual(calls, Array.from({ length: 400 }, (_, i) => 42 + i));
  northAt = 441; calls.length = 0;
  assert.equal(select(42), 441, 'the 400th candidate can succeed'); assert.equal(calls.length, 400);
  northAt = 442; calls.length = 0;
  assert.equal(select(42), 42, 'the 401st candidate is never inspected'); assert.equal(calls.length, 400);
  northAt = undefined;
  for (const [x, y, inside] of [[96, 32, true], [1183, 863, true], [95, 32, false], [96, 31, false], [1184, 32, false], [96, 864, false]] as const) {
    calls.length = 0; world = { spawn: { x, y }, exits: [{ id: 'north' }] };
    assert.equal(select(400), 400);
    assert.equal(calls.length, inside ? 1 : 400, `spawn ${x},${y}`);
  }
});

test('ordinary, explicit test and sample URL selection retain world and mall layout choices', () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    for (const [search, worlds, mode, chosen] of [
      ['', ['buildings', 'mall'], null, 'buildings'],
      ['?test=1', ['coast', 'buildings', 'mall'], null, 'buildings'],
      ['?sample=village', ['buildings', 'mall'], 'village', 'buildings'],
      ['?test=1&sample=mall', ['coast', 'buildings', 'mall'], 'mall', 'mall'],
      ['?sample=mall', ['buildings', 'mall'], 'mall', 'mall'],
      ['?sample=unknown&test=0', ['buildings', 'mall'], null, 'buildings'],
    ] as const) {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: { search } });
      assert.deepEqual(raidWorlds(), worlds); assert.equal(sampleMode(), mode);
      assert.equal(sampleEnabled(), mode !== null); assert.equal(defaultWorld(), chosen);
      assert.equal(sampleMallLayout('mall'), 4); assert.equal(sampleMallLayout('buildings'), undefined);
    }
  } finally {
    if (before) Object.defineProperty(globalThis, 'location', before); else Reflect.deleteProperty(globalThis, 'location');
  }
});
