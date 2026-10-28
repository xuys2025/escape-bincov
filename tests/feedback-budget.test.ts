import test from 'node:test';
import assert from 'node:assert/strict';
import { Container, Texture } from 'pixi.js';
import { PARTICLE_BUDGET, VOICE_BUDGET, admit } from '../src/feedback-budget';
import { Fx } from '../src/coast-view/fx';
import { SynthAudio } from '../src/audio';
import type { Textures } from '../src/coast-view/textures';

test('admit: decorative feedback stops at the soft limit; core feedback takes the oldest decorative place at the hard limit', () => {
  assert.equal(admit(9, true, 0, 10, 20), 'add');
  assert.equal(admit(10, true, 5, 10, 20), 'drop');
  assert.equal(admit(10, false, 5, 10, 20), 'add');
  assert.equal(admit(19, false, 0, 10, 20), 'add');
  assert.equal(admit(20, false, 3, 10, 20), 'evict');
  assert.equal(admit(20, false, 0, 10, 20), 'drop');
  assert.equal(admit(20, true, 3, 10, 20), 'drop');
});

const particles = (f: Fx) => (f as unknown as { live: { decor: boolean; settle: string }[] }).live;

test('particles: smoke and far blood stop at the soft limit, and blood near the player still lands in a full street', () => {
  const { soft, hard, far } = PARTICLE_BUDGET, rnd = () => .5;
  const f = new Fx({ pixel: () => Texture.WHITE } as unknown as Textures, new Container(), new Container(), () => []);
  f.focus = { x: 0, y: 0 };
  for (let i = 0; i < 200; i++) f.smoke(0, 0, 10, rnd);
  assert.equal(particles(f).length, soft);
  assert.deepEqual(f.dropped, { decor: 600 - soft, core: 0 });
  f.blood(far + 40, 0, 10, 0, rnd);
  assert.deepEqual(f.dropped, { decor: 606 - soft, core: 0 }, 'blood far from the player is decorative');

  for (let i = 0; i < 30; i++) f.blood(20, 0, 10, 0, rnd);
  assert.equal(particles(f).length, hard);
  assert.equal(particles(f).filter(p => !p.decor).length, 180, 'every drop of near blood landed');
  assert.deepEqual(f.dropped, { decor: 606 - soft + 180 - (hard - soft), core: 0 }, 'the oldest smoke made room');

  for (let i = 0; i < (hard - 180) / 4; i++) f.blood(20, 0, 10, 0, rnd, 4);
  assert.equal(particles(f).filter(p => p.decor).length, 0);
  f.blood(20, 0, 10, 0, rnd, 2);
  assert.equal(f.dropped.core, 2, 'with no decoration left, core particles past the hard limit are dropped');
  assert.equal(particles(f).length, hard);

  f.clear();
  assert.deepEqual(f.dropped, { decor: 0, core: 0 });
  for (let i = 0; i < soft; i++) f.dust(0, 0, rnd, 1);
  assert.equal(particles(f).length, soft, 'the decorative count starts over after clear()');
});

type Voice = { onended: null | (() => void); stops: number };
const synth = () => {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = (): Voice => ({
    gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), pan: param(),
    connect() { return this; }, disconnect() {}, start() {}, stop(this: Voice) { this.stops++; }, onended: null, stops: 0,
  } as unknown as Voice);
  class Context {
    state = 'running'; sampleRate = 8000; currentTime = 0; destination = node();
    createGain = node; createDynamicsCompressor = node; createBiquadFilter = node; createOscillator = node; createBufferSource = node; createStereoPanner = node;
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }
  (globalThis as unknown as { window: unknown }).window = { AudioContext: Context };
  const audio = new SynthAudio();
  audio.start();
  const voices = (audio as unknown as { voices: Map<Voice, { decor: boolean }> }).voices;
  return { audio, voices, decor: () => [...voices.values()].filter(v => v.decor).length };
};

test('voices: far shots, tails and clicks stop at the soft limit; a confirmed kill cuts the oldest tail short at the hard limit', () => {
  const { soft, hard, far } = VOICE_BUDGET, { audio, voices, decor } = synth();
  // A rifle report is six voices: crack, body noise, body tone, boom (core), tail and one action click (decorative).
  for (let i = 0; i < 20; i++) audio.shot('rifle', { pan: 0, gain: far - .05 });
  assert.equal(voices.size, soft);
  assert.equal(decor(), soft, 'a far shot is decorative throughout');
  assert.deepEqual(audio.dropped, { decor: 120 - soft, core: 0 });

  for (let i = 0; i < 8; i++) audio.shot('rifle');
  assert.equal(voices.size, hard);
  assert.equal(hard - decor(), 32, "the player's own reports are all there");
  assert.deepEqual(audio.dropped, { decor: 120 - soft + 16, core: 0 }, 'their tails and clicks were not added');

  const oldest = [...voices.keys()].slice(0, 3);
  audio.kill();
  assert.equal(voices.size, hard);
  assert.equal(hard - decor(), 35);
  for (const v of oldest) { assert.equal(voices.has(v), false); assert.equal(v.stops, 2, 'cut short: stopped again, now'); }

  for (let i = 0; i < 21; i++) audio.kill();
  assert.equal(decor(), 0);
  assert.equal(audio.dropped.core, 2, 'with no decoration left, a core cue past the hard limit is dropped');

  for (const v of [...voices.keys()]) v.onended?.();
  assert.equal(voices.size, 0);
  for (let i = 0; i < 20; i++) audio.shot('rifle', { pan: 0, gain: far - .05 });
  assert.equal(voices.size, soft, 'ended voices free their decorative places');
  audio.stop();
  assert.equal(voices.size, 0);
});

test('voices: footsteps are decorative, the player pain and hit cues are core', () => {
  const { soft, far } = VOICE_BUDGET, { audio, voices } = synth();
  for (let i = 0; i < soft / 2; i++) audio.shot('rifle', { pan: 0, gain: far - .05 });
  const before = voices.size, dropped = audio.dropped.decor;
  (audio as unknown as { context: { currentTime: number } }).context.currentTime = 1;
  audio.step();
  assert.equal(voices.size, before, 'a footstep past the soft limit is not added');
  assert.equal(audio.dropped.decor, dropped + 2);
  audio.pain(); audio.hit({ pan: .5, gain: .8 }); audio.crit({ pan: .5, gain: .8 });
  assert.equal(voices.size, before + 6);
  assert.equal(audio.dropped.core, 0);
});
