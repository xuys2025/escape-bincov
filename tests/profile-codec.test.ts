import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { PROFILE_MAX_BYTES, decodeProfileDocument, decodeStoredProfile, validInventory } from '../src/profile-codec';
import { RecoveryStore } from '../src/recovery-store';
import { newExpansion, upgradeToRpg, type LayeredRaid } from '../src/expansion-state';
import { oldProfile } from './fixtures/old-saves';

// A gun item carries its factory state, as D.addItem makes one (profile v3).
const item = (uid: string, id: string, x: number, y: number, extra: Partial<D.Item> = {}): D.Item => ({ uid, id, qty: 1, x, y, ...D.factoryGun(id), ...extra });

test('stored profiles keep the 1 MiB limit on their compact JSON, never on source whitespace', () => {
  const save = D.newSave();
  save.lastResult = { outcome: 'extract', kills: 0, keptValue: 0, lostValue: 0, message: '', seed: 1, recovered: false };
  const legacyKey = (text: string) => ({ getItem: (key: string) => key === D.SAVE_KEY ? text : null, setItem() {} });
  // The old key (a v2 profile at most) may be padded past 1 MiB and still loads; content past 1 MiB is refused like a backup file.
  const padded = JSON.stringify(oldProfile(save)).replace('{', '{' + ' '.repeat(PROFILE_MAX_BYTES));
  assert.equal(new RecoveryStore(legacyKey(padded)).load().save.cash, save.cash);
  const oversized = { ...save, lastResult: { ...save.lastResult, message: 'x'.repeat(PROFILE_MAX_BYTES) } };
  assert.throws(() => new RecoveryStore(legacyKey(JSON.stringify(oldProfile(oversized)))).load(), /1 MiB/);
  assert.throws(() => decodeStoredProfile(oversized), /1 MiB/);
  assert.equal(decodeStoredProfile(save).cash, save.cash);
});

test('a stored profile decodes from parsed data into a copy that shares nothing with it', () => {
  const save = D.newSave(), decoded = decodeProfileDocument(save);
  assert.deepEqual(decoded, save);
  decoded.bag.items[0].qty = 1; decoded.quests.repair = true;
  assert.notEqual(save.bag.items[0].qty, 1); assert.equal(save.quests.repair, false);
});

test('one inventory check serves every format: rotation and unknown fields are per format, uids share the caller scope', () => {
  const inv = (...items: unknown[]) => ({ w: 6, h: 5, items });
  const check = (value: unknown, rules = { rotation: true, exact: false, guns: true }, seen = new Set<string>()) => validInventory(value, 6, 5, seen, rules);
  assert.ok(check(inv(item('a', 'pistol', 0, 0), item('b', 'pistol', 0, 1))));
  assert.ok(check(inv(item('a', 'pistol', 0, 0, { rotated: true }))));
  assert.equal(check(inv(item('a', 'pistol', 0, 0, { rotated: true })), { rotation: false, exact: false, guns: true }), false);
  const noted = { ...item('a', 'ammo9', 0, 0), note: 'x' };
  assert.ok(check(inv(noted)));
  assert.equal(check(inv(noted), { rotation: true, exact: true, guns: true }), false);
  assert.equal(check(inv(item('a', 'pistol', 0, 0), item('b', 'pistol', 1, 0))), false, 'overlap');
  assert.equal(check(inv(item('a', 'pistol', 5, 0))), false, 'outside the grid');
  assert.equal(check(inv(item('a', 'pistol', 0, 0, { qty: 2 }))), false, 'above the stack size');
  for (const bad of [null, 5, 'x', []]) assert.equal(check(inv(bad), { rotation: true, exact: true, guns: true }), false);
  const seen = new Set(['a']);
  assert.equal(check(inv(item('a', 'ammo9', 0, 0)), undefined, seen), false, 'uid taken by another inventory');
  assert.ok(check(inv(item('b', 'ammo9', 0, 0)), undefined, seen)); assert.ok(seen.has('b'));
  const visited: string[] = [];
  assert.ok(validInventory(inv(item('c', 'ammo9', 0, 0), item('d', 'ammo9', 1, 0)), 6, 5, new Set(), { rotation: true, exact: true, guns: true }, i => visited.push(i.uid)));
  assert.deepEqual(visited, ['c', 'd']);
});

test('the station upgrade is one in-place step to v3 and leaves a v3 state alone', () => {
  const state = newExpansion(1000); state.base.cursor = 5000;
  upgradeToRpg(state, 3000);
  assert.equal(state.version, 3); assert.equal(state.charm, null); assert.equal(state.awards!.length, 0); assert.deepEqual(state.growth.perks, []);
  assert.equal(state.base.cursor, 5000);
  const behind = newExpansion(1000); upgradeToRpg(behind, 3000); assert.equal(behind.base.cursor, 3000);
  state.awards!.push('first'); upgradeToRpg(state, 9000);
  assert.deepEqual(state.awards, ['first']); assert.equal(state.base.cursor, 5000);
  // A v2 state gains the empty perk selection and nothing else; one still holding a raid stays v2 until it settles.
  const v2 = newExpansion(1000); Object.assign(v2, { version: 2, charm: null, awards: ['a'] }); v2.growth.permanent.strength = 25;
  const before = structuredClone(v2), raiding = structuredClone(v2);
  upgradeToRpg(v2, 9000); assert.deepEqual(v2, { ...before, version: 3, growth: { ...before.growth, perks: [] } });
  raiding.raid = structuredClone({ version: 2 }) as LayeredRaid; upgradeToRpg(raiding, 9000);
  assert.equal(raiding.version, 2); assert.equal('perks' in raiding.growth, false);
});
