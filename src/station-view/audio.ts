/**
 * Synthesised sound for the station (no audio files): a rain bed that is muffled indoors, the generator hum and
 * radio static by distance, the sea near the dock, footsteps, and short UI cues. It plays through the game's
 * SynthAudio (same context, master volume and limiter) and starts on the first user gesture.
 */
export interface AudioBus { context: AudioContext; output: AudioNode }
export type Cue = 'ok' | 'error' | 'open' | 'close' | 'pick' | 'drop' | 'coins' | 'build' | 'deliver' | 'step' | 'stepWet' | 'gate' | 'relay' | 'lampOn' | 'credit';

export class StationAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rain!: { gain: GainNode; filter: BiquadFilterNode };
  private hum!: { gain: GainNode; osc: OscillatorNode[] };
  private radio!: GainNode; private sea!: GainNode; private fire!: GainNode;
  private noise!: AudioBuffer;
  private sources: AudioScheduledSourceNode[] = [];
  muted = false;

  constructor(private bus: () => AudioBus | null) {}

  /** Build the ambience once the shared context exists (the caller has started SynthAudio from a gesture). */
  start() {
    const bus = this.bus();
    if (!bus || this.ctx === bus.context) return;
    this.stop();
    const c = this.ctx = bus.context;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(bus.output);
    const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .2; }
    const loop = (filterType: BiquadFilterType, freq: number, q = .7) => {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.loopStart = Math.random();
      const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(this.master); src.start(); this.sources.push(src);
      return { gain: g, filter: f };
    };
    this.rain = loop('lowpass', 3200);
    this.radio = loop('bandpass', 1800, 2.5).gain;
    this.sea = loop('lowpass', 420).gain;
    this.fire = loop('bandpass', 900, .8).gain;
    const hg = c.createGain(); hg.gain.value = 0; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(hg).connect(this.master);
    const oscs = [50, 100, 150.5].map((f, i) => { const o = c.createOscillator(); o.type = i ? 'sine' : 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = [.5, .3, .12][i]; o.connect(g).connect(lp); o.start(); this.sources.push(o); return o; });
    this.hum = { gain: hg, osc: oscs };
  }
  /** Stop the loops and leave the shared context to the rest of the game. */
  stop() {
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    this.sources = [];
    if (this.ctx) this.master.disconnect();
    this.ctx = null;
  }

  /** Per-frame ambience: listener indoors or not, distances to the generator / radio / sea / fire, generator running. */
  ambience(p: { indoor: boolean; gen: number; radio: number; sea: number; fire: number; running: boolean; starting: number }) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime, near = (d: number, r: number) => Math.max(0, 1 - d / r);
    this.rain.gain.gain.setTargetAtTime(p.indoor ? .22 : .5, t, .3);
    this.rain.filter.frequency.setTargetAtTime(p.indoor ? 520 : 3200, t, .3);
    const humLevel = p.running ? .05 + .32 * near(p.gen, 420) : 0;
    this.hum.gain.gain.setTargetAtTime(humLevel * (p.starting < 1 ? p.starting : 1), t, .15);
    for (const [i, o] of this.hum.osc.entries()) o.frequency.setTargetAtTime([50, 100, 150.5][i] * (.6 + .4 * Math.min(1, p.starting)), t, .2);
    this.radio.gain.setTargetAtTime(.05 * near(p.radio, 220) * (.6 + .4 * Math.random()), t, .05);
    this.sea.gain.setTargetAtTime(.08 + .3 * near(p.sea, 320), t, .4);
    this.fire.gain.setTargetAtTime(.12 * near(p.fire, 160) * (.7 + .3 * Math.random()), t, .05);
  }

  cue(name: Cue) {
    const c = this.ctx; if (!c || this.muted || c.state !== 'running') return;
    const t = c.currentTime;
    const tone = (f: number, at: number, dur: number, type: OscillatorType = 'square', gain = .06, slide?: number) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + at);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + at + dur);
      g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(gain, t + at + .005); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      o.connect(g).connect(this.master); o.start(t + at); o.stop(t + at + dur + .02);
    };
    const burst = (at: number, dur: number, freq: number, gain = .2, type: BiquadFilterType = 'bandpass') => {
      const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
      const g = c.createGain(); g.gain.setValueAtTime(gain, t + at); g.gain.exponentialRampToValueAtTime(.0001, t + at + dur);
      s.connect(f).connect(g).connect(this.master); s.start(t + at, Math.random()); s.stop(t + at + dur + .02);
    };
    switch (name) {
      case 'ok': tone(660, 0, .08); tone(990, .06, .1); break;
      case 'error': tone(180, 0, .16, 'square', .05, 140); break;
      case 'open': burst(0, .12, 1400, .08); tone(420, .02, .06, 'triangle', .04); break;
      case 'close': burst(0, .08, 900, .06); break;
      case 'pick': tone(880, 0, .04, 'triangle', .04); break;
      case 'drop': burst(0, .05, 600, .12, 'lowpass'); tone(240, 0, .05, 'triangle', .05); break;
      case 'coins': [1320, 1760, 1480, 1980].forEach((f, i) => tone(f, i * .05, .12, 'triangle', .045)); break;
      case 'build': for (let i = 0; i < 3; i++) { burst(i * .14, .07, 300 + i * 80, .3, 'lowpass'); tone(110 + i * 20, i * .14, .06, 'square', .05); } tone(660, .46, .14, 'triangle', .05); break;
      case 'deliver': tone(523, 0, .1, 'triangle', .05); tone(659, .09, .1, 'triangle', .05); tone(784, .18, .18, 'triangle', .05); break;
      case 'step': burst(0, .04, 500 + Math.random() * 200, .05, 'lowpass'); break;
      case 'stepWet': burst(0, .07, 1600 + Math.random() * 600, .05); break;
      case 'gate': burst(0, .5, 300, .25, 'lowpass'); tone(90, 0, .5, 'sawtooth', .05, 70); burst(.42, .1, 900, .2); break;
      case 'relay': burst(0, .05, 2000, .4); tone(70, .02, .3, 'square', .08, 45); break;
      case 'lampOn': tone(2400 + Math.random() * 600, 0, .05, 'sine', .02); burst(0, .03, 4000, .05); break;
      case 'credit': tone(784, 0, .08, 'triangle', .04); tone(1046, .07, .12, 'triangle', .04); break;
    }
  }
}
