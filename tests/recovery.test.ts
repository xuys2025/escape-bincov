import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { generateRun } from '../src/world';
import { initialCheckpoint, validateCheckpoint } from '../src/checkpoint';
import { RecoveryStore, SESSION_KEY, decodeSession } from '../src/recovery-store';
import { oldProfile } from './fixtures/old-saves';

function fixture() {
  const data = new Map<string, string>(); let fail = false;
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); data.set(key, value); } };
  const store = new RecoveryStore(storage, () => 1234), { save } = store.load(); store.commit(save, null);
  return { data, storage, store, save, fail: (value: boolean) => { fail = value; } };
}
test('deployment debit and complete initial world restore together without rerunning beginRun', () => {
  const f = fixture(); const loadout = D.beginRun(f.save, 42), raid = initialCheckpoint(generateRun(42), loadout);
  f.store.commit(f.save, raid);
  const reopened = new RecoveryStore(f.storage).load();
  assert.equal(reopened.save.stats.runs, 1); assert.equal(reopened.save.bag.items.length, 0);
  assert.deepEqual(reopened.raid, raid); assert.equal(raid.loadout.ammo, 8);
  assert.equal(D.count(raid.loadout.bag, 'ammo9'), 24);
});
test('failed checkpoint leaves the complete previous revision; retry cannot resurrect a terminal run', () => {
  const f = fixture(), raid = initialCheckpoint(generateRun(42), D.beginRun(f.save, 42));
  f.store.commit(f.save, raid); const old = f.data.get(SESSION_KEY);
  raid.elapsed = 2; raid.loot.pop(); f.fail(true);
  assert.throws(() => f.store.commit(f.save, raid)); assert.equal(f.data.get(SESSION_KEY), old);
  f.fail(false); const settled = structuredClone(f.save); D.settleRun(settled, raid.loadout, 'extract', 0);
  f.store.commit(settled, null, { runId: raid.runId, outcome: 'extract' });
  const stale = new RecoveryStore(f.storage); const loaded = stale.load();
  assert.equal(loaded.raid, null); assert.equal(loaded.save.stats.extracts, 1);
  assert.throws(() => stale.commit(settled, raid));
});
test('old client writes cannot overwrite the v2 record; migration keeps exact original bytes', () => {
  // A profile as the client before gun instances stored it (no gun fields; a v1 profile holding one is refused).
  const data = new Map<string, string>(), old = { ...oldProfile(D.newSave()), version: 1 }; old.cash = 1842;
  const bytes = JSON.stringify(old); data.set(D.SAVE_KEY, bytes);
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const store = new RecoveryStore(storage), loaded = store.load(); store.commit(loaded.save, null);
  storage.setItem(D.SAVE_KEY, JSON.stringify(D.newSave())); // an old client writing its own key
  const next = new RecoveryStore(storage); assert.equal(next.load().save.cash, 1842);
  assert.equal(next.record?.legacyBackup, bytes);
});
test('malformed, future and inconsistent checkpoints never overwrite stored progress', () => {
  const f = fixture(), raid = initialCheckpoint(generateRun(42), D.beginRun(f.save, 42)); f.store.commit(f.save, raid);
  const valid = f.data.get(SESSION_KEY)!;
  for (const mutate of [(r: any) => { r.version = 99; }, (r: any) => { r.raid = null; },
    (r: any) => { r.raid.rng = -1; }, (r: any) => { r.raid.loot.push(r.raid.loot[0]); },
    (r: any) => { r.raid.loadout.ammoRelief = 999; }, (r: any) => { r.raid.worldVersion = 'future'; },
    (r: any) => { r.profile.reliefSupplies = [{ id: 'carbine', qty: 99 }]; },
    (r: any) => { r.profile.lastResult = { outcome: 'extract', kills: 'invalid' }; }]) {
    const value = JSON.parse(valid); mutate(value); const corrupt = JSON.stringify(value); f.data.set(SESSION_KEY, corrupt);
    assert.throws(() => new RecoveryStore(f.storage).load()); assert.equal(f.data.get(SESSION_KEY), corrupt);
  }
  assert.throws(() => decodeSession('{')); assert.throws(() => validateCheckpoint({}, f.save));
});
test('revision fence rejects a writer holding an older record', () => {
  const f = fixture(), other = new RecoveryStore(f.storage); other.load();
  f.save.cash = 9; f.store.commit(f.save, null);
  assert.throws(() => other.commit(D.newSave(), null), /另一窗口/);
  assert.equal(new RecoveryStore(f.storage).load().save.cash, 9);
});
test('gameplay random state resumes the exact next draws', () => {
  const rng = D.seededRandom(123); for (let i = 0; i < 13; i++) rng();
  const resumed = D.seededRandom(rng.getState());
  assert.deepEqual(Array.from({ length: 20 }, () => resumed()), Array.from({ length: 20 }, () => rng()));
});
