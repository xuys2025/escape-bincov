import test from 'node:test';
import assert from 'node:assert/strict';
import { SampleSound, type SoundOut } from '../src/coast-view/sound';
import type { PublishedView, StampedEvent } from '../src/raid-runtime/contract';

const recorder = () => {
  const calls: string[] = [], args: Record<string, unknown[][]> = {};
  const out = new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => {
    (args[name] ??= []).push(a);
    calls.push(a.length ? `${name}:${a.map(x => typeof x === 'object' ? 'spot' : x).join(',')}` : name);
  } }) as SoundOut;
  return { calls, args, out };
};
type Over = { phase?: string; moving?: boolean; sprinting?: boolean; reloading?: boolean; heals?: number; alive?: boolean; hp?: number; region?: string | null;
  map?: string; actors?: { uid: string; x: number; y: number }[]; bullets?: { uid: string; x: number; y: number; vx: number; vy: number; enemy: boolean }[] };
const batch = (o: Over = {}) => ({
  stamp: { world: { mapId: o.map ?? 'coast' } },
  frame: { phase: o.phase ?? 'running', player: { x: 400, y: 300, alive: o.alive ?? true, regionId: o.region ?? null, state: { moving: !!o.moving, sprinting: !!o.sprinting } },
    actors: o.actors ?? [], bullets: o.bullets ?? [],
    hud: { hp: o.hp ?? 100, maxHp: 100, heals: o.heals ?? 2, weapon: { reloading: !!o.reloading } } },
}) as unknown as PublishedView;
const ev = (body: Record<string, unknown>, mapId = 'coast') => ({ ...body, stamp: { world: { mapId } } }) as unknown as StampedEvent;
const only = (calls: string[], names: string[]) => calls.filter(c => names.includes(c.split(':')[0]));

test('样板音效：开枪、近战、受击、拾取与开门按原 RaidScene 的提示音映射，只认当前地图事件', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  s.event(ev({ type: 'shot', shooter: 'player', weapon: 'shotgun' }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'rifle', pellets: [] }), 'coast');
  s.event(ev({ type: 'melee', attacker: 'player' }), 'coast');
  s.event(ev({ type: 'melee', attacker: 'enemy-2' }), 'coast');
  s.event(ev({ type: 'hurt', uid: 'player', damage: 11, angle: 1, at: { x: 400, y: 300 } }), 'coast');
  s.event(ev({ type: 'looted', item: 'wire' }), 'coast');
  s.event(ev({ type: 'door', id: 'x', by: 'player' }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'player', weapon: 'pistol' }, 'resident-f2'), 'coast');
  assert.deepEqual(calls, ['shot:shotgun', 'shot:enemy', 'shot:knife', 'hit', 'stow', 'click']);
});

test('样板音效：他人的枪声、受击、撞墙和开门按方位左右声像、随距离减弱；玩家自己的声音居中', () => {
  const { args, out } = recorder(), s = new SampleSound(out);
  s.frame(batch({ actors: [{ uid: 'enemy-3', x: 700, y: 300 }, { uid: 'enemy-4', x: 100, y: 300 }] }), 1 / 60);
  s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'rifle', pellets: [] }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'enemy-4', weapon: 'rifle', pellets: [] }), 'coast');
  const [right, left] = args.shot.map(a => a[1] as { pan: number; gain: number });
  assert.ok(right.pan > .5 && left.pan < -.5, `pans ${right.pan} ${left.pan}`);
  assert.ok(right.gain < 1 && right.gain >= .28);
  s.event(ev({ type: 'hurt', uid: 'enemy-3', damage: 20, angle: 0, at: { x: 1400, y: 300 } }), 'coast');
  assert.equal((args.hit[0][0] as { gain: number }).gain, .28, 'a far blow is quiet but audible');
  s.event(ev({ type: 'impact', reason: 'blocked', surface: 'wall', lastFree: { x: 420, y: 300 } }), 'coast');
  s.event(ev({ type: 'impact', reason: 'blocked', surface: 'wall', lastFree: { x: 2400, y: 300 } }), 'coast');
  assert.equal(args.impact.length, 1, 'only nearby wall strikes are heard');
  s.event(ev({ type: 'door', id: 'x', by: 'enemy-4' }), 'coast');
  assert.ok((args.click[0][0] as { pan: number }).pan < 0, 'a door opened by someone on the left');
});

test('样板音效：敌方子弹从身边 30 像素内掠过时只响一次掠空声；远处飞过不响', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  const pass = (y: number, uid: string) => { for (let i = 0; i < 12; i++) s.frame(batch({ bullets: [{ uid, x: 200 + i * 40, y, vx: 2400, vy: 0, enemy: true }] }), 1 / 60); };
  pass(318, 'b-near'); pass(380, 'b-far');
  assert.deepEqual(only(calls, ['whiz']), ['whiz:spot']);
});

test('样板音效：生命低于 30% 时有心跳；空弹匣且无备弹时扣扳机有空响', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  for (let i = 0; i < 120; i++) s.frame(batch({ hp: 20 }), 1 / 60);
  assert.equal(only(calls, ['heartbeat']).length, 3, '2 s at 20 hp: beats at 0, 0.95, 1.9 s');
  calls.length = 0; for (let i = 0; i < 60; i++) s.frame(batch({ hp: 80 }), 1 / 60);
  assert.deepEqual(only(calls, ['heartbeat']), []);
  s.trigger({ magSize: 8, mag: 0, reloading: false, reserve: 0 }); s.trigger({ magSize: 8, mag: 0, reloading: false, reserve: 12 }); s.trigger({ magSize: 8, mag: 3, reloading: false, reserve: 0 });
  assert.deepEqual(only(calls, ['dry']), ['dry']);
});

test('样板音效：进入室内房间或楼层时海声闭合，回到室外打开；只在变化时设置，重启音频后重新设置', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); s.frame(batch(), 1 / 60);
  s.frame(batch({ region: 'room' }), 1 / 60); s.frame(batch({ map: 'resident-f2' }), 1 / 60);
  s.frame(batch({ phase: 'paused' }), 1 / 60); s.frame(batch(), 1 / 60);
  assert.deepEqual(only(calls, ['setRoomTone', 'start', 'stop']), ['start', 'setRoomTone:0', 'setRoomTone:1', 'stop', 'start', 'setRoomTone:0']);
});

test('样板音效：流血和污染每帧的小额受伤不播放受击音', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  for (let i = 0; i < 60; i++) s.event(ev({ type: 'hurt', uid: 'player', damage: .03, angle: null, at: { x: 400, y: 300 } }), 'coast');
  assert.deepEqual(calls, []);
  s.event(ev({ type: 'hurt', uid: 'player', damage: 1, angle: null, at: { x: 400, y: 300 } }), 'coast');
  assert.deepEqual(calls, ['hit']);
});

test('样板音效：暂停时挂起、恢复时重启，结算阶段不挂起；首帧按当前阶段决定', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch({ phase: 'paused' }), 0); s.frame(batch({ phase: 'paused' }), 0);
  s.frame(batch({ phase: 'running' }), 0); s.frame(batch({ phase: 'blocked' }), 0);
  s.frame(batch({ phase: 'paused' }), 0); s.frame(batch({ phase: 'ending' }), 0);
  assert.deepEqual(only(calls, ['start', 'stop']), ['stop', 'start', 'stop', 'start']);
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

test('样板音效：结算提示音立即请求；从暂停菜单放弃时先重启音频再请求（音频服务在恢复期间排定，不再丢弃）', () => {
  const live = recorder(), a = new SampleSound(live.out);
  a.frame(batch(), 0); live.calls.length = 0;
  a.settled('extract'); assert.deepEqual(live.calls, ['extract']);
  const paused = recorder(), b = new SampleSound(paused.out);
  b.frame(batch({ phase: 'paused' }), 0); paused.calls.length = 0;
  b.settled('death'); assert.deepEqual(paused.calls, ['start', 'death']);
});
