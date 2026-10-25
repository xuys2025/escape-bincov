import test from 'node:test';
import assert from 'node:assert/strict';
import * as session from '../src/session';
import * as runtime from '../src/raid-runtime/runtime';
import { canonicalBehavior, runBenchmarkCase } from './fixtures/enemy-benchmark';

test('benchmark canonicalization preserves identity and exact numeric behavior while removing volatile IDs', () => {
  const a = { runId: 'bc-abc-3', uid: 'entity-bc-abc-3-4', items: ['bc-abc-1', 'bc-abc-2', 'bc-abc-1'], timer: .123456789 };
  const b = { runId: 'bc-def-6', uid: 'entity-bc-def-6-4', items: ['bc-def-4', 'bc-def-5', 'bc-def-4'], timer: .123456789 };
  assert.equal(canonicalBehavior(a, a.runId), canonicalBehavior(b, b.runId));
  assert.notEqual(canonicalBehavior(a, a.runId), canonicalBehavior({ ...a, timer: .123456788 }, a.runId));
  assert.notEqual(canonicalBehavior(a, a.runId), canonicalBehavior({ ...a, items: ['bc-abc-1', 'bc-abc-1', 'bc-abc-2'] }, a.runId));
});
for (const world of ['classic', 'building', 'mall'] as const) test(`benchmark ${world} repeats real AI and restores its midpoint checkpoint`, () => {
  const sample = { world, seed: 42, hz: 5, seconds: 2 };
  const a = runBenchmarkCase({ session, runtime }, sample), b = runBenchmarkCase({ session, runtime }, sample);
  assert.equal(a.behaviorHash, b.behaviorHash); assert.equal(a.finalHash, b.finalHash);
  assert.ok(Math.abs(a.simulationSeconds - 2) < 1e-12); assert.equal(a.frames, 10);
  assert.ok(a.initialEntities.activeEnemies > 0); assert.ok(a.initialEntities.worldEnemies >= a.initialEntities.activeEnemies);
  assert.equal(a.recovery.length, 1); assert.ok(a.recovery.every(result => result.restored));
});
