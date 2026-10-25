import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { generateRunBase } from '../src/world';
import { factoryGun } from '../src/domain';

function fixture(layout: 0 | 1 | 2 | 3, legacy = false) {
  const data = new Map<string, string>(); let fail = false, writes = 0;
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (fail) throw Error('quota'); data.set(k, v); writes++; } };
  let state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
  assert.ok(saves.initialize()); state.state = 'hideout';
  assert.ok(saves.beginRun(42, layout ? 'mall' : false, { mallLayout: layout || 1 }));
  if (legacy) {
    const record = JSON.parse(data.get(SESSION_KEY)!);
    record.raid.worldVersion = 'coast-v1'; delete record.raid.containers;
    record.raid.loot = generateRunBase(42).loot.map((l, i) => ({ ...l, uid: `loot-${i}`, relief: false, ...factoryGun(l.id) }));
    data.set(SESSION_KEY, JSON.stringify(record));
  }
  state = createSessionState(); saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
  assert.ok(saves.initialize(), state.storageError); assert.ok(saves.resumeRun()); state.state = 'run';
  const r = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(r, '?test=1'); driver.freezeAI(true);
  return { data, state, saves, storage, r, driver, fail: (v: boolean) => { fail = v; }, get writes() { return writes; } };
}
for (const [layout, legacy] of [[0, false], [0, true], [1, false], [2, false], [3, false]] as const) {
  test(`PR64 restored ${layout}/${legacy}: pause, live backup, terminal retry and conflict`, () => {
    for (const reason of ['extract', 'death', 'abandon', 'timeout'] as const) {
      const f = fixture(layout, legacy), { r, driver } = f;
      r.pause('overlay'); r.advance(10000, emptyIntent()); assert.equal(r.elapsed, 0);
      r.resume(); r.advance(11000, emptyIntent()); r.advance(11125, emptyIntent()); assert.equal(r.elapsed, .125);
      driver.magazine(2); driver.vitals({ hp: 50, stamina: 30, pollution: 20, bleeding: true });
      driver.clock(301); driver.spawnLoot('scrap', 1, r.player);
      if (r.containers.length) driver.container(r.containers[0].id, [{ id: 'scrap', qty: 2 }]);
      driver.hurt(1);
      const backup = f.saves.backupRecord()!; decodeSession(JSON.stringify(backup));
      assert.equal((backup.expansion?.raid ?? backup.raid)!.elapsed, 301);
      assert.notEqual((f.saves.currentRecord()!.expansion?.raid ?? f.saves.currentRecord()!.raid)!.elapsed, 301);
      assert.equal(backup.expansion?.raid ? backup.expansion.body.hp : backup.raid!.hp, r.hp);
      f.fail(true); const raw = f.data.get(SESSION_KEY), writes = f.writes; r.finish(reason);
      assert.ok(f.state.pendingSettlement); assert.equal(f.data.get(SESSION_KEY), raw);
      const pending = structuredClone(f.state.pendingSettlement); decodeSession(JSON.stringify(f.saves.backupRecord()));
      f.fail(false); assert.ok(r.retrySettlement(), f.state.storageError); assert.equal(f.writes, writes + 1);
      assert.deepEqual(f.state.save, pending); assert.equal(r.retrySettlement(), false); r.finish(reason);
      assert.equal(f.writes, writes + 1); assert.equal(f.state.save.stats.runs, 1); r.dispose();
    }
    const f = fixture(layout, legacy); f.fail(true); f.r.finish('extract'); f.fail(false);
    const otherState = createSessionState(), other = new SaveSession(otherState, () => f.storage);
    assert.ok(other.initialize()); assert.ok(other.setVolume(.25)); const raw = f.data.get(SESSION_KEY);
    assert.equal(f.r.retrySettlement(), false); assert.equal(f.state.conflict, true); assert.equal(f.r.settlement.retryable, false);
    decodeSession(JSON.stringify(f.saves.backupRecord())); assert.equal(f.r.retrySettlement(), false); assert.equal(f.data.get(SESSION_KEY), raw);
  });
}
