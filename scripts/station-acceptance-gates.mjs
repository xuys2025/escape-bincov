/** Independent acceptance oracles. Mutated real captures must fail, not merely produce diagnostics. */
import assert from 'node:assert/strict';
export function assertFrames(records) {
  assert.ok(Array.isArray(records), 'frame error list missing');
  for (const e of records) { assert.ok(Number.isInteger(e.count) && e.count > 0, 'frame error count missing'); }
  assert.deepEqual(records, [], 'normal flow internal frame errors');
}
export function assertFallback(lines) {
  const expected = '[console] Error: Station yard needs WebGL (got canvas).';
  assert.equal(lines.length,1,'no-WebGL whitelist requires exactly one error');
  const [headline,...stack]=lines[0].split('\n');assert.equal(headline,expected,'unexpected no-WebGL error');
  assert.ok(stack.length>0 && stack.every(line=>/^    at \S+ \(https:\/\/station\.test\/\?test=1:\d+:\d+\)$/.test(line)), 'unexpected text appended to expected fallback error');
  return lines;
}
export function assertSupplyRefused(before, after) {
  assert.deepEqual(after.profile, before.profile, 'refused supply changed inventory/profile');
  assert.deepEqual(after.body, before.body, 'refused supply changed body');
}
export function assertSupplyUsed(before, after) {
  assert.equal(after.qty, before.qty - 1, 'supply not consumed exactly once');
  assert.ok(Math.abs(after.satiety - Math.min(100,before.satiety + 35)) < .3, 'food rule should restore 35, allowing only passive recovery');
}
export function assertTraining(d) {
  const quantity = .25 * (1 + Math.min(.2,.05*d.level));
  assert.ok(d.wallSeconds >= 120, 'real foreground walk lasted less than 120 seconds');
  assert.ok(d.trace.acceptedSeconds >= 120 && d.trace.acceptedSeconds <= d.wallSeconds + 1, 'effective seconds exceed wall-clock or insufficient');
  assert.ok(Math.abs(d.after.quantity-d.before.quantity-quantity) < 1e-9, 'wrong training quantity');
  assert.ok(Math.abs(d.afterProgress-d.beforeProgress-.2*quantity) < 1e-9, 'wrong growth reward');
  assert.ok(Math.abs(d.after.activeSeconds-d.before.activeSeconds+120-d.trace.acceptedSeconds) < 1e-6, 'effective time does not match persisted seconds');
  assert.deepEqual(d.trace.events, [{type:'practice-credited',attribute:'technique',amount:.2*quantity}], 'credit event mismatch');
  assert.ok(d.pauses.length >= 3);
  for (const p of d.pauses) assert.equal(p.after,p.before,p.name+' counted paused time');
}
export function assertTitlePreserved(before, after) {
  const expected = structuredClone(before), actual = structuredClone(after);
  assert.equal(before.version,4); assert.equal(before.expansion.version,2,'round-trip must start after controlled upgrade');
  assert.ok(after.revision >= before.revision); assert.ok(after.savedAt >= before.savedAt);
  const elapsed = (after.expansion.base.cursor-before.expansion.base.cursor)/1000;
  assert.ok(elapsed >= 0 && elapsed < 60, 'unexpected round-trip clock delta');
  // restSeconds is gameplay state, not disposable metadata. Verify its actual bounded rule.
  expected.expansion.base.restSeconds = Math.min(120,before.expansion.base.restSeconds+elapsed);
  assert.ok(Math.abs(expected.expansion.base.restSeconds-actual.expansion.base.restSeconds)<1e-6,'rest progress mismatch');
  actual.expansion.base.restSeconds = expected.expansion.base.restSeconds;
  for (const x of [expected,actual]) { delete x.revision; delete x.savedAt; delete x.expansion.base.cursor; }
  assert.deepEqual(actual,expected,'title round-trip changed non-metadata save fields');
  return {allowedMetadata:['revision','savedAt','expansion.base.cursor'],verifiedGameplayClock:{elapsed,restSeconds:after.expansion.base.restSeconds}};
}
