import test from 'node:test';
import assert from 'node:assert/strict';
import { GUNS } from '../src/gunsmith/catalog';
import { GUN_TIMBRES, TIMBRE_OF_GUN, timbreOfLook } from '../src/gun-timbre';
import type { WeaponLook } from '../src/raid-runtime/contract';

test('枪声音色族（#75 H-02）：改枪目录的 20 把枪各有音色族，11 个音色族都有枪用', () => {
  assert.deepEqual(Object.keys(TIMBRE_OF_GUN).sort(), Object.keys(GUNS).sort());
  assert.deepEqual([...new Set(Object.values(TIMBRE_OF_GUN))].sort(), [...GUN_TIMBRES].sort());
  // Same calibre and action, same family: the 9 mm pistols, the shotguns by action, the 7.62 marksman rifles.
  assert.equal(TIMBRE_OF_GUN.gb17, TIMBRE_OF_GUN.pistol);
  assert.notEqual(TIMBRE_OF_GUN.mb1911, TIMBRE_OF_GUN.pistol);
  assert.deepEqual([TIMBRE_OF_GUN.shotgun, TIMBRE_OF_GUN.mb870, TIMBRE_OF_GUN.mb1014], ['shotgun-double', 'shotgun-pump', 'shotgun-semi']);
  assert.equal(TIMBRE_OF_GUN.svdb, TIMBRE_OF_GUN.mb14);
});

test('枪声音色族：现有四种外观各取一族，与目录里同一把枪一致；近战外观没有枪声', () => {
  const guns: [WeaponLook, keyof typeof TIMBRE_OF_GUN][] = [['pistol', 'pistol'], ['carbine', 'carbine'], ['shotgun', 'shotgun'], ['rifle', 'mb4a1']];
  for (const [look, gun] of guns) assert.equal(timbreOfLook(look), TIMBRE_OF_GUN[gun], look);
  assert.equal(new Set(guns.map(([look]) => timbreOfLook(look))).size, 4, 'the four guns in the game today sound different');
  for (const look of ['knife', 'club', 'claw'] as const) assert.equal(timbreOfLook(look), null);
});
