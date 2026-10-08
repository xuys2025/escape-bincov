import test from 'node:test';
import assert from 'node:assert/strict';
import { SampleSound, type SoundOut } from '../src/coast-view/sound';
import type { PublishedView, StampedEvent } from '../src/raid-runtime/contract';

const recorder = () => {
  const calls: string[] = [];
  const out = new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => { calls.push(a.length ? `${name}:${a.join(',')}` : name); } }) as SoundOut;
  return { calls, out };
};
type Over = { phase?: string; moving?: boolean; sprinting?: boolean; reloading?: boolean; heals?: number; alive?: boolean };
const batch = (o: Over = {}) => ({
  stamp: { world: { mapId: 'coast' } },
  frame: { phase: o.phase ?? 'running', player: { alive: o.alive ?? true, state: { moving: !!o.moving, sprinting: !!o.sprinting } },
    hud: { heals: o.heals ?? 2, weapon: { reloading: !!o.reloading } } },
}) as unknown as PublishedView;
const ev = (body: Record<string, unknown>, mapId = 'coast') => ({ ...body, stamp: { world: { mapId } } }) as unknown as StampedEvent;

test('样板音效：开枪、近战、受击、拾取与开门按原 RaidScene 的提示音映射，只认当前地图事件', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  s.event(ev({ type: 'shot', shooter: 'player', weapon: 'shotgun' }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'rifle' }), 'coast');
  s.event(ev({ type: 'melee', attacker: 'player' }), 'coast');
  s.event(ev({ type: 'melee', attacker: 'enemy-2' }), 'coast');
  s.event(ev({ type: 'hurt', uid: 'player', damage: 11, angle: 1 }), 'coast');
  s.event(ev({ type: 'looted', item: 'wire' }), 'coast');
  s.event(ev({ type: 'door', id: 'x' }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'player', weapon: 'pistol' }, 'resident-f2'), 'coast');
  assert.deepEqual(calls, ['shot:shotgun', 'shot:enemy', 'shot:knife', 'hit', 'pickup', 'click']);
});

test('样板音效：流血和污染每帧的小额受伤不播放受击音', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  for (let i = 0; i < 60; i++) s.event(ev({ type: 'hurt', uid: 'player', damage: .03, angle: null }), 'coast');
  assert.deepEqual(calls, []);
  s.event(ev({ type: 'hurt', uid: 'player', damage: 1, angle: null }), 'coast');
  assert.deepEqual(calls, ['hit']);
});

test('样板音效：暂停时挂起、恢复时重启，结算阶段不挂起；首帧按当前阶段决定', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch({ phase: 'paused' }), 0); s.frame(batch({ phase: 'paused' }), 0);
  s.frame(batch({ phase: 'running' }), 0); s.frame(batch({ phase: 'blocked' }), 0);
  s.frame(batch({ phase: 'paused' }), 0); s.frame(batch({ phase: 'ending' }), 0);
  assert.deepEqual(calls, ['stop', 'start', 'stop', 'start']);
});

test('样板音效：脚步按原节奏（步行 0.42 秒、疾跑 0.25 秒），换弹开始和完成各一声，治疗消耗补给播放拾取音', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 0); calls.length = 0;
  for (let i = 0; i < 60; i++) s.frame(batch({ moving: true }), 1 / 60);
  assert.equal(calls.filter(c => c === 'step').length, 3, '1 s walking: steps at 0, 0.42, 0.84 s');
  calls.length = 0; s.frame(batch(), 1 / 60);
  for (let i = 0; i < 60; i++) s.frame(batch({ moving: true, sprinting: true }), 1 / 60);
  assert.equal(calls.filter(c => c === 'step').length, 4, '1 s sprinting: 0, 0.25, 0.5, 0.75 s');
  calls.length = 0;
  s.frame(batch({ reloading: true }), 1 / 60); s.frame(batch({ reloading: true }), 1 / 60); s.frame(batch({ reloading: false }), 1 / 60);
  s.frame(batch({ heals: 1 }), 1 / 60); s.frame(batch({ heals: 1 }), 1 / 60);
  assert.deepEqual(calls, ['click', 'click', 'pickup']);
  calls.length = 0; for (let i = 0; i < 30; i++) s.frame(batch({ moving: true, phase: 'paused' }), 1 / 60);
  assert.ok(!calls.includes('step'), 'no footsteps while paused');
});

test('样板音效：结算提示音在运行中立即播放；从暂停菜单放弃时先重启音频，等恢复后再播放', async () => {
  const live = recorder(), a = new SampleSound(live.out);
  a.frame(batch(), 0); await new Promise(r => setTimeout(r, 320)); live.calls.length = 0;
  a.settled('extract'); assert.deepEqual(live.calls, ['extract']);
  const paused = recorder(), b = new SampleSound(paused.out);
  b.frame(batch({ phase: 'paused' }), 0); paused.calls.length = 0;
  b.settled('death'); assert.deepEqual(paused.calls, ['start']);
  await new Promise(r => setTimeout(r, 200)); assert.deepEqual(paused.calls, ['start', 'death']);
});
