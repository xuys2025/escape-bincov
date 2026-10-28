import test from 'node:test';
import assert from 'node:assert/strict';
import { SampleSound, type HitCueOut, type SoundOut } from '../src/coast-view/sound';
import type { PublishedView, StampedEvent } from '../src/raid-runtime/contract';

const recorder = () => {
  const calls: string[] = [], args: Record<string, unknown[][]> = {};
  const out = new Proxy({}, { get: (_t, name: string) => (...a: unknown[]) => {
    (args[name] ??= []).push(a);
    calls.push(a.length ? `${name}:${a.map(x => typeof x === 'object' ? 'spot' : x).join(',')}` : name);
  } }) as SoundOut & HitCueOut;
  return { calls, args, out };
};
type Over = { phase?: string; moving?: boolean; sprinting?: boolean; reloading?: boolean; heals?: number; alive?: boolean; hp?: number; region?: string | null;
  map?: string; actors?: { uid: string; x: number; y: number; alive?: boolean; weapon?: string;
    tactics?: { archetype: string; phase?: string; stance?: string } }[];
  bullets?: { uid: string; x: number; y: number; vx: number; vy: number; enemy: boolean; owner?: string }[] };
const batch = (o: Over = {}) => ({
  stamp: { world: { mapId: o.map ?? 'coast' } },
  frame: { phase: o.phase ?? 'running', player: { x: 400, y: 300, alive: o.alive ?? true, regionId: o.region ?? null, state: { moving: !!o.moving, sprinting: !!o.sprinting } },
    actors: o.actors ?? [], bullets: o.bullets ?? [],
    hud: { hp: o.hp ?? 100, maxHp: 100, heals: o.heals ?? 2, weapon: { reloading: !!o.reloading } } },
}) as unknown as PublishedView;
const ev = (body: Record<string, unknown>, mapId = 'coast') => ({ ...body, stamp: { world: { mapId } } }) as unknown as StampedEvent;
const only = (calls: string[], names: string[]) => calls.filter(c => names.includes(c.split(':')[0]));

test('spit uses wet cues, never ballistic whizzes or metal hits, and hidden spitters remain silent', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  const actors = [{ uid: 'spitter', x: 440, y: 300, tactics: { archetype: 'sac-spitter' } }];
  s.frame(batch({ actors }), 0); calls.length = 0;
  s.event(ev({ type: 'shot', shooter: 'spitter', weapon: 'claw', pellets: [] }), 'coast');
  s.frame(batch({ actors, bullets: [{ uid: 'acid', owner: 'spitter', x: 405, y: 300, vx: -180, vy: 0, enemy: true }] }), .1);
  s.event(ev({ type: 'impact', owner: 'spitter', reason: 'blocked', surface: 'wall', lastFree: { x: 410, y: 300 } }), 'coast');
  assert.deepEqual(calls, ['shot:spit,spot', 'shot:acid-hit,spot']);
  calls.length = 0;
  s.event(ev({ type: 'shot', shooter: 'spitter', weapon: 'claw', pellets: [] }), 'coast', () => false, () => false);
  s.event(ev({ type: 'impact', owner: 'spitter', reason: 'blocked', surface: 'wall', lastFree: { x: 410, y: 300 } }), 'coast', () => false);
  assert.deepEqual(calls, []);
  s.frame(batch({ actors: [{ uid: 'spitter', x: 440, y: 300 }] }), 0);
  s.event(ev({ type: 'shot', shooter: 'spitter', weapon: 'rifle', pellets: [] }), 'coast');
  assert.deepEqual(calls, ['shot:rifle,spot,0.55'], 'a later frame cannot retain a stale creature identity');
});

test('enemy phase cues are positional once per edge, including a release that skips its zero-time frame', () => {
  const { calls, out, args } = recorder(), sound = new SampleSound(out);
  const actor = { uid: 'animal', x: 500, y: 300, alive: true, weapon: 'claw',
    tactics: { archetype: 'saltback-dog', phase: 'idle', stance: 'hostile' } };
  sound.frame(batch({ actors: [actor] }), 0); calls.length = 0;
  actor.tactics.phase = 'windup'; sound.frame(batch({ actors: [actor] }), .05);
  for (let i = 0; i < 20; i++) sound.frame(batch({ actors: [actor] }), .05);
  actor.tactics.phase = 'recovery'; sound.frame(batch({ actors: [actor] }), .05);
  sound.frame(batch({ actors: [actor] }), .05);
  assert.deepEqual(calls, ['enemy:dog,prepare,spot', 'enemy:dog,release,spot']);
  assert.ok((args.enemy[0][2] as { pan: number }).pan > 0);
  actor.tactics.archetype = 'blockade-sentry'; actor.weapon = 'rifle'; actor.tactics.phase = 'reload';
  sound.frame(batch({ actors: [actor] }), .05); sound.frame(batch({ actors: [actor] }), .05);
  assert.equal(calls.filter(c => c === 'enemy:radio,reload,spot').length, 1);
});

test('hidden, paused, distant and dead enemies emit no cues; reveal and resume do not replay old phases', () => {
  const { calls, out } = recorder(), sound = new SampleSound(out);
  const actor = { uid: 'animal', x: 500, y: 300, alive: true, weapon: 'claw',
    tactics: { archetype: 'salt-hulk', phase: 'windup', stance: 'hostile' } };
  sound.frame(batch({ actors: [actor] }), .05, () => false);
  sound.frame(batch({ actors: [actor] }), .05, () => true);
  actor.tactics.phase = 'recovery'; sound.frame(batch({ actors: [actor], phase: 'paused' }), .05);
  sound.frame(batch({ actors: [actor] }), .05);
  actor.x = 1200; actor.tactics.phase = 'windup'; sound.frame(batch({ actors: [actor] }), .05);
  actor.x = 500; actor.alive = false; actor.tactics.phase = 'recovery'; sound.frame(batch({ actors: [actor] }), .05);
  assert.deepEqual(only(calls, ['enemy']), []);
  actor.alive = true; actor.tactics.phase = 'idle'; actor.tactics.stance = 'warning';
  sound.frame(batch({ actors: [actor], map: 'resident-f2' }), .05);
  sound.frame(batch({ actors: [actor], map: 'resident-f2' }), .05);
  assert.deepEqual(only(calls, ['enemy']), ['enemy:heavy,warning,spot']);
});

test('样板音效：开枪、近战、受击、拾取与开门按原 RaidScene 的提示音映射，只认当前地图事件', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  s.event(ev({ type: 'shot', shooter: 'player', weapon: 'shotgun' }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'rifle', pellets: [] }), 'coast');
  s.event(ev({ type: 'melee', attacker: 'player' }), 'coast');
  s.event(ev({ type: 'melee', attacker: 'enemy-2' }), 'coast');
  s.event(ev({ type: 'hurt', cause: 'blow', uid: 'player', damage: 11, angle: 1, at: { x: 400, y: 300 } }), 'coast');
  s.event(ev({ type: 'looted', item: 'wire' }), 'coast');
  s.event(ev({ type: 'door', id: 'x', by: 'player' }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'player', weapon: 'pistol' }, 'resident-f2'), 'coast');
  assert.deepEqual(calls, ['shot:shotgun-double', 'shot:rifle,,0.55', 'shot:knife', 'pain', 'stow', 'click']);
});

test('墙和门（#75 H-05）：子弹打墙和打门是两种撞击声；试枪场的旧版设置回到原来共用的一种', () => {
  let feel: 'enhanced' | 'classic' = 'enhanced';
  const { calls, out } = recorder(), s = new SampleSound(out, () => feel);
  s.frame(batch(), 1 / 60); calls.length = 0;
  const hit = (surface: string) => s.event(ev({ type: 'impact', reason: 'blocked', surface, lastFree: { x: 420, y: 300 } }), 'coast');
  hit('wall'); hit('door');
  assert.deepEqual(calls, ['impact:spot,wall', 'impact:spot,door']);
  calls.length = 0; feel = 'classic'; hit('wall'); hit('door');
  assert.deepEqual(calls, ['impact:spot,', 'impact:spot,'], 'the cue both shared before');
});

test('分枪种枪声（#75 H-02）：按外观取音色族，他人开枪更轻；试枪场的旧版设置回到原来所有枪共用的枪声', () => {
  let feel: 'enhanced' | 'classic' = 'enhanced';
  const { calls, out } = recorder(), s = new SampleSound(out, () => feel);
  s.frame(batch({ actors: [{ uid: 'enemy-3', x: 700, y: 300 }] }), 1 / 60); calls.length = 0;
  const fire = () => {
    for (const weapon of ['pistol', 'carbine', 'shotgun', 'rifle']) s.event(ev({ type: 'shot', shooter: 'player', weapon, pellets: [] }), 'coast');
    s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'carbine', pellets: [] }), 'coast');
  };
  fire();
  assert.deepEqual(calls, ['shot:pistol9', 'shot:carbine', 'shot:shotgun-double', 'shot:rifle', 'shot:carbine,spot,0.55']);
  calls.length = 0; feel = 'classic'; fire();
  assert.deepEqual(calls, ['shot:pistol', 'shot:pistol', 'shot:shotgun', 'shot:pistol', 'shot:enemy,spot'], 'what every gun played before');
});

test('样板音效：他人的枪声、受击、撞墙和开门按方位左右声像、随距离减弱；玩家自己的声音居中', () => {
  const { args, out } = recorder(), s = new SampleSound(out);
  s.frame(batch({ actors: [{ uid: 'enemy-3', x: 700, y: 300 }, { uid: 'enemy-4', x: 100, y: 300 }] }), 1 / 60);
  s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'rifle', pellets: [] }), 'coast');
  s.event(ev({ type: 'shot', shooter: 'enemy-4', weapon: 'rifle', pellets: [] }), 'coast');
  const [right, left] = args.shot.map(a => a[1] as { pan: number; gain: number });
  assert.ok(right.pan > .5 && left.pan < -.5, `pans ${right.pan} ${left.pan}`);
  assert.ok(right.gain < 1 && right.gain >= .28);
  s.event(ev({ type: 'hurt', cause: 'blow', uid: 'enemy-3', damage: 20, angle: 0, at: { x: 1400, y: 300 } }), 'coast');
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

test('样板音效：只按 Runtime 给出的原因判断受击音——打击无论大小都响，流血、污染、缺水、饱食不足、上限下降都不响', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch(), 1 / 60); calls.length = 0;
  for (const cause of ['bleed', 'pollution', 'dehydration', 'starvation', 'limit-change'])
    for (const damage of [.03, 1, 6]) s.event(ev({ type: 'hurt', cause, uid: 'player', damage, angle: null, at: { x: 400, y: 300 } }), 'coast');
  assert.deepEqual(calls, []);
  s.event(ev({ type: 'hurt', cause: 'blow', uid: 'player', damage: .4, angle: null, at: { x: 400, y: 300 } }), 'coast');
  assert.deepEqual(calls, ['pain']);
});

test('样板音效：未揭示房间里的命中和弹着点不发声，枪声照常', () => {
  const { calls, out } = recorder(), s = new SampleSound(out), hidden = (p: { x: number }) => p.x < 300;
  s.frame(batch({ actors: [{ uid: 'enemy-3', x: 200, y: 300 }] }), 1 / 60); calls.length = 0;
  s.event(ev({ type: 'hurt', cause: 'blow', uid: 'enemy-3', damage: 20, angle: 0, at: { x: 200, y: 300 } }), 'coast', p => !hidden(p));
  s.event(ev({ type: 'impact', reason: 'blocked', surface: 'wall', lastFree: { x: 250, y: 300 } }), 'coast', p => !hidden(p));
  assert.deepEqual(calls, []);
  s.event(ev({ type: 'shot', shooter: 'enemy-3', weapon: 'rifle', pellets: [] }), 'coast', p => !hidden(p));
  s.event(ev({ type: 'hurt', cause: 'blow', uid: 'enemy-3', damage: 20, angle: 0, at: { x: 400, y: 300 } }), 'coast', p => !hidden(p));
  assert.deepEqual(calls, ['shot:rifle,spot,0.55', 'hit:spot']);
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

/** A blow in a published batch: every event of one batch carries that batch's revision. */
const blow = (uid: string, revision: number, o: { critical?: boolean; at?: { x: number; y: number } } = {}) => ({ type: 'hurt', cause: 'blow', uid, damage: 9,
  critical: !!o.critical, angle: 0, at: o.at ?? { x: 460, y: 300 }, stamp: { world: { mapId: 'coast' }, revision } }) as unknown as StampedEvent;

test('命中确认：同一批里打在同一身体上的多次打击（如霰弹的六颗弹丸）只响一次，其中有暴击时另响一次暴击声；下一批照常', () => {
  const { calls, out } = recorder(), s = new SampleSound(out);
  s.frame(batch({ actors: [{ uid: 'enemy-3', x: 460, y: 300 }, { uid: 'enemy-4', x: 340, y: 300 }] }), 1 / 60); calls.length = 0;
  for (let i = 0; i < 6; i++) s.event(blow('enemy-3', 7, { critical: i === 2 }), 'coast');
  s.event(blow('enemy-4', 7, { at: { x: 340, y: 300 } }), 'coast');
  assert.deepEqual(calls, ['hit:spot', 'crit:spot', 'hit:spot']);
  calls.length = 0; s.event(blow('enemy-3', 8), 'coast');
  assert.deepEqual(calls, ['hit:spot'], 'the next batch is heard again');
});

test('命中确认：玩家自己中弹播放居中的受伤声，同一批只响一次；未揭示房间里的命中不占这一次；击杀确认音由宿主随击杀标记请求', () => {
  const { calls, out } = recorder(), s = new SampleSound(out), hidden = (p: { x: number }) => p.x < 300;
  s.frame(batch({ actors: [{ uid: 'enemy-3', x: 200, y: 300 }] }), 1 / 60); calls.length = 0;
  s.event(blow('player', 3, { at: { x: 400, y: 300 } }), 'coast'); s.event(blow('player', 3, { at: { x: 400, y: 300 } }), 'coast');
  assert.deepEqual(calls, ['pain']);
  calls.length = 0;
  s.event(blow('enemy-3', 4, { at: { x: 200, y: 300 } }), 'coast', p => !hidden(p));
  s.event(blow('enemy-3', 4, { at: { x: 320, y: 300 } }), 'coast', p => !hidden(p));
  assert.deepEqual(calls, ['hit:spot'], 'a hidden blow is silent and leaves the visible one heard');
  calls.length = 0; s.killed();
  assert.deepEqual(calls, ['kill']);
});
