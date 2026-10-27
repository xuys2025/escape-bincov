import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOW_TIERS, MAX_CAMERA_PUSH, ShotBlows, bloodDrops, blowTier, pushCamera } from '../src/coast-view/blow-feel';

test('强冲击档（#75 H-03）：按同一枪打中的弹丸数、暴击、致死分三档，不看扣血；0 档就是原来的受击', () => {
  assert.equal(blowTier(1, false, false), 0);
  assert.equal(blowTier(2, false, false), 0);
  assert.equal(blowTier(3, false, false), 1, 'three pellets of one shot');
  assert.equal(blowTier(1, true, false), 1, 'a critical');
  assert.equal(blowTier(1, false, true), 1, 'a kill, however little damage it took');
  assert.equal(blowTier(1, true, true), 2, 'a critical kill');
  assert.equal(blowTier(4, false, true), 2, 'a kill by four pellets of one shot');
  assert.equal(blowTier(3, false, true), 1);
  assert.deepEqual({ ...BLOW_TIERS[0] }, { kick: 2, flash: .07, kickT: .08, hold: 0, pulse: 2.5 });
  for (let t = 1; t < BLOW_TIERS.length; t++) for (const k of ['kick', 'flash', 'kickT', 'hold', 'pulse'] as const)
    assert.ok(BLOW_TIERS[t][k] > BLOW_TIERS[t - 1][k], `tier ${t} ${k} grows`);
  // The new tiers' lengths are no whole number of 60 Hz frames, so frame counts do not hang on float rounding (tier 0's
  // 0.15 s pose is, and syncActor's microsecond rule has handled it since #99).
  for (const t of BLOW_TIERS.slice(1)) for (const s of [t.flash, t.kickT, .15 + t.hold]) assert.ok(Math.abs(s * 60 - Math.round(s * 60)) > .05, `${s} s`);
});

test('按开火合并（#75 H-04）：血迹一次喷完、随弹丸数加量并有上限；同一枪后到的弹丸只补少量', () => {
  assert.equal(bloodDrops(1, false), 6, 'one round: as before');
  assert.equal(bloodDrops(6, false), 14, 'six pellets: one bigger spray, not 36 drops');
  assert.equal(bloodDrops(3, true), 6);
  assert.equal(bloodDrops(1, true), 2);
});

test('按开火合并：弹丸记住来自哪一枪，同一枪再打中同一身体算同一次受击；飞行结束且本批没提到的弹丸、过时的标记会释放', () => {
  const s = new ShotBlows();
  s.shot('shot-a', ['a1', 'a2', 'a3']); s.shot('shot-b', ['b1']);
  assert.equal(s.of('a2'), 'shot-a'); assert.equal(s.of('zz'), null); assert.equal(s.of(undefined), null);
  assert.equal(s.seen('enemy-1', 'shot-a'), false);
  s.mark('enemy-1', 'shot-a');
  assert.equal(s.seen('enemy-1', 'shot-a'), true);
  assert.equal(s.seen('enemy-1', 'shot-b'), false, 'another shot is another blow');
  assert.equal(s.seen('enemy-2', 'shot-a'), false, 'another body is another blow');
  assert.equal(s.seen('enemy-1', null), false, 'a round of unknown shot never merges');
  // a1 still flies, a2 is named by this batch's hurt, a3 and b1 are gone.
  s.prune(new Set(['a1']), new Set(['a2']), 1 / 60);
  assert.deepEqual([s.of('a1'), s.of('a2'), s.of('a3'), s.of('b1')], ['shot-a', 'shot-a', null, null]);
  s.prune(new Set(), new Set(), ShotBlows.MEMORY);
  assert.equal(s.seen('enemy-1', 'shot-a'), false, 'the mark ages out');
  assert.deepEqual(s.size, { rounds: 0, bodies: 0 });
  s.shot('shot-c', ['c1']); s.mark('enemy-3', 'shot-c'); s.clear();
  assert.deepEqual(s.size, { rounds: 0, bodies: 0 });
});

test('镜头脉冲（#75 H-06）：玩家中弹时镜头顺着打击方向推一下；和开枪后坐叠加时不超过上限', () => {
  // A blow from the east (its angle points back at the source, east = 0) pushes the view west.
  const p = pushCamera({ x: 0, y: 0 }, 0, 2.5);
  assert.ok(Math.abs(p.x + 2.5) < 1e-9 && Math.abs(p.y) < 1e-9);
  const q = pushCamera({ x: 0, y: 0 }, Math.PI / 2, 3.5);
  assert.ok(Math.abs(q.y + 3.5) < 1e-9, 'from the south: pushed north');
  let r = { x: 0, y: 0 };
  for (let i = 0; i < 10; i++) r = pushCamera(r, 0, 5);
  assert.ok(Math.abs(Math.hypot(r.x, r.y) - MAX_CAMERA_PUSH) < 1e-9, 'a burst stops at the cap');
});
