import type { GunTimbre } from './gun-timbre';
import { VOICE_BUDGET, admit } from './feedback-budget';

/**
 * Where a cue happens relative to the listener: stereo position (-1 left .. 1 right) and level (0..1). Omitted, a cue
 * plays centred at full level, exactly as before.
 */
export type Spot = { pan: number; gain: number };

/**
 * One gun family's report (#75 H-02), layered like a real shot: a bright crack (high-passed noise), the body (noise and
 * a falling triangle), a low sine boom just after, a long low tail, and the action's square clicks (slide, bolt, pump).
 * Lengths and delays in seconds, cutoffs and pitches in Hz, gains before the shot's level.
 */
type Report = {
  crack: readonly [cutoff: number, gain: number, length: number];
  body: readonly [cutoff: number, gain: number, length: number, from: number, to: number, toneGain: number];
  boom: readonly [from: number, to: number, length: number, gain: number];
  tail: readonly [cutoff: number, gain: number, length: number];
  action: readonly (readonly [from: number, to: number, length: number, gain: number, delay: number])[];
};
const REPORTS: Readonly<Record<GunTimbre, Report>> = {
  pistol9: { crack: [2200, .36, .045], body: [420, .7, .13, 230, 42, .3], boom: [80, 34, .12, .17], tail: [300, .08, .22], action: [[1300, 950, .02, .04, .09]] },
  pistol45: { crack: [1500, .3, .05], body: [360, .66, .15, 175, 34, .31], boom: [66, 30, .16, .22], tail: [260, .09, .3], action: [[1100, 820, .022, .045, .1]] },
  // Short, for ten or more rounds a second.
  smg: { crack: [2500, .3, .03], body: [520, .56, .085, 260, 60, .22], boom: [92, 40, .075, .12], tail: [320, .05, .12], action: [[1650, 1250, .014, .03, .045]] },
  carbine: { crack: [2700, .36, .04], body: [460, .7, .14, 250, 42, .29], boom: [72, 32, .15, .19], tail: [240, .09, .38], action: [[900, 620, .026, .05, .12]] },
  rifle: { crack: [3100, .42, .035], body: [520, .68, .13, 285, 46, .27], boom: [66, 30, .17, .21], tail: [220, .1, .46], action: [[1500, 1050, .015, .03, .07]] },
  lmg: { crack: [2700, .36, .035], body: [460, .68, .12, 225, 40, .29], boom: [58, 28, .16, .25], tail: [220, .09, .3], action: [[1200, 900, .015, .03, .06]] },
  dmr: { crack: [3300, .44, .04], body: [480, .7, .17, 205, 36, .3], boom: [56, 26, .22, .25], tail: [200, .11, .6], action: [[1000, 720, .02, .045, .14]] },
  // The bolt is worked after the echo.
  bolt: { crack: [3500, .46, .045], body: [460, .74, .19, 190, 32, .31], boom: [52, 24, .26, .27], tail: [180, .12, .75], action: [[900, 700, .03, .06, .45], [700, 520, .035, .06, .6]] },
  'shotgun-double': { crack: [1300, .34, .05], body: [340, .92, .3, 140, 34, .3], boom: [60, 26, .26, .27], tail: [160, .13, .65], action: [] },
  'shotgun-pump': { crack: [1400, .34, .05], body: [350, .96, .28, 150, 34, .3], boom: [62, 26, .24, .26], tail: [170, .12, .55], action: [[560, 320, .045, .07, .4], [420, 260, .05, .07, .52]] },
  'shotgun-semi': { crack: [1500, .32, .045], body: [360, .92, .25, 155, 36, .29], boom: [64, 28, .22, .25], tail: [180, .11, .45], action: [[1000, 700, .02, .045, .09]] },
};

/**
 * A suppressor on top of a family's report (#28 M2-11): clearly quieter and duller but still audible. The crack and the
 * body are cut and low-passed, the boom softened and the bright tail dropped; the action's clicks stay, so a muffled
 * shot is still heard. Factors of each voice's gain; `lowpass` in Hz.
 */
export const SUPPRESSED = Object.freeze({ crack: .25, body: .35, boom: .55, lowpass: 1100 });

/** Original, synthesized audio. Nothing is fetched and no recorded samples are used. */
export class SynthAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: AudioBufferSourceNode;
  private swell?: OscillatorNode;
  private volume = 0.35;
  private noise?: AudioBuffer;
  private lastStep = 0;
  private ambientNodes: AudioNode[] = [];
  /** Live voices in start order; `decor` ones go first when a crowded fight spends the budget (#75 H-07). */
  private voices = new Map<AudioScheduledSourceNode, { nodes: AudioNode[]; decor: boolean }>();
  private decorVoices = 0;
  /** Voices the budget refused or cut short since the page loaded, by kind, for the acceptance measurements. */
  dropped = { decor: 0, core: 0 };
  /**
   * resume() is asynchronous: until it settles the context still reports 'suspended'. Cues asked for in that window are
   * scheduled anyway (they start the moment the context runs) instead of being dropped; the window is bounded in time
   * and voices, so a resume that never settles cannot queue a burst.
   */
  private resumeAt = -1;
  private ambientFilter?: BiquadFilterNode;

  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.03);
  }

  /** Context and master gain for the station yard's own ambience; null until start() has created them. */
  bus(): { context: AudioContext; output: AudioNode } | null {
    return this.context && this.master ? { context: this.context, output: this.master } : null;
  }

  /** Call from the first user gesture; browsers otherwise suspend AudioContext. */
  start(): void {
    try {
      if (!this.context) {
        const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        // A soft limiter preserves headroom when several nearby enemies fire.
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 18;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        this.master.connect(limiter).connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        let low = 0;
        for (let i = 0; i < data.length; i++) {
          low = (low + (Math.random() * 2 - 1) * 0.08) / 1.08;
          data[i] = low * 3;
        }
      }
      if (this.context.state === 'suspended') {
        const at = this.resumeAt = performance.now();
        void this.context.resume().catch(() => undefined).finally(() => { if (this.resumeAt === at) this.resumeAt = -1; });
      }
      if (!this.ambience && this.master && this.noise) {
        const noise = this.context.createBufferSource();
        noise.buffer = this.noise;
        noise.loop = true;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        const level = this.context.createGain();
        level.gain.value = 0.085;
        noise.connect(filter).connect(level).connect(this.master);
        this.ambientFilter = filter;
        const tide = this.context.createOscillator();
        const amount = this.context.createGain();
        tide.frequency.value = 0.13;
        amount.gain.value = 0.035;
        tide.connect(amount).connect(level.gain);
        tide.start();
        noise.start();
        this.ambience = noise;
        this.swell = tide;
        this.ambientNodes = [noise, filter, level, tide, amount];
      }
    } catch { /* Audio is optional, including in restricted local-file browsers. */ }
  }

  stop(): void {
    try { this.ambience?.stop(); this.swell?.stop(); } catch { /* Already stopped. */ }
    for (const [voice, { nodes }] of this.voices) {
      voice.onended = null;
      try { voice.stop(); } catch { /* Already stopped. */ }
      for (const node of nodes) node.disconnect();
    }
    this.voices.clear();
    this.decorVoices = 0;
    for (const node of this.ambientNodes) node.disconnect();
    this.ambientNodes = [];
    this.ambience = undefined;
    this.swell = undefined;
    this.ambientFilter = undefined;
    this.resumeAt = -1;
    if (this.context) void this.context.suspend().catch(() => undefined);
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[], decor: boolean): void {
    this.voices.set(source, { nodes, decor });
    if (decor) this.decorVoices++;
    source.onended = () => this.release(source);
  }

  private release(source: AudioScheduledSourceNode): void {
    const voice = this.voices.get(source);
    if (!voice) return;
    this.voices.delete(source);
    if (voice.decor) this.decorVoices--;
    source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }

  /**
   * Whether a cue may be scheduled now: running and within the voice budget (feedback-budget.ts; at the limit a core cue
   * cuts the oldest decorative voice short), or inside a fresh resume window (with a smaller budget).
   */
  private ready(decor: boolean): boolean {
    if (!this.context || !this.master) return false;
    if (this.context.state !== 'running') return this.resumeAt >= 0 && performance.now() - this.resumeAt < 1000 && this.voices.size < 16;
    const verdict = admit(this.voices.size, decor, this.decorVoices, VOICE_BUDGET.soft, VOICE_BUDGET.hard);
    if (verdict === 'drop') { this.dropped[decor ? 'decor' : 'core']++; return false; }
    if (verdict === 'evict') {
      for (const [source, voice] of this.voices) {
        if (!voice.decor) continue;
        try { source.stop(); } catch { /* Already stopped. */ }
        this.release(source);
        break;
      }
      this.dropped.decor++;
    }
    return true;
  }

  /** Output for one voice: straight to the master, or through its own level and stereo position. */
  private route(nodes: AudioNode[], spot?: Spot): AudioNode {
    if (!spot || !this.context) return this.master!;
    const level = this.context.createGain(); level.gain.value = Math.max(0, Math.min(1, spot.gain));
    let out: AudioNode = level;
    if (typeof this.context.createStereoPanner === 'function') {
      const pan = this.context.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, spot.pan));
      level.connect(pan); out = pan; nodes.push(pan);
    }
    out.connect(this.master!); nodes.push(level);
    return level;
  }

  /** `decor`: a decorative layer (report tail, action clicks, footsteps); a cue placed far away is decorative anyway. */
  private tone(frequency: number, length: number, gain: number, type: OscillatorType = 'sine', endFrequency = frequency, delay = 0, spot?: Spot, decor = false): void {
    decor ||= spot !== undefined && spot.gain < VOICE_BUDGET.far;
    if (!this.ready(decor)) return;
    const ctx = this.context!;
    const at = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), at + length);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), at + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    const nodes: AudioNode[] = [oscillator, envelope];
    oscillator.connect(envelope).connect(this.route(nodes, spot));
    this.trackVoice(oscillator, nodes, decor);
    oscillator.start(at);
    oscillator.stop(at + length + 0.025);
  }

  /** A noise burst through a high-pass at `cutoff` Hz; `lowpass` (Hz) also cuts its top, for a muffled sound. */
  private hiss(length: number, gain: number, cutoff: number, delay = 0, spot?: Spot, decor = false, lowpass?: number): void {
    decor ||= spot !== undefined && spot.gain < VOICE_BUDGET.far;
    if (!this.noise || !this.ready(decor)) return;
    const ctx = this.context!, at = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    const nodes: AudioNode[] = [source, filter, envelope];
    let shaped: AudioNode = source.connect(filter);
    if (lowpass !== undefined) {
      const dull = ctx.createBiquadFilter();
      dull.type = 'lowpass';
      dull.frequency.value = lowpass;
      nodes.push(dull); shaped = shaped.connect(dull);
    }
    shaped.connect(envelope).connect(this.route(nodes, spot));
    this.trackVoice(source, nodes, decor);
    source.start(at, Math.random() * 2);
    source.stop(at + length + 0.02);
  }

  /**
   * A gunshot or other attack sound. A GunTimbre plays that family's report at `level` (enemies' shots are quieter),
   * muffled when `suppressed` (#28 M2-11, SUPPRESSED); 'pistol', 'shotgun' and 'enemy' are the single report every gun
   * shared before #75 H-02, kept for the range's classic A/B setting; 'knife', 'spit' and 'acid-hit' are the melee and
   * spitter cues.
   */
  shot(kind = 'pistol', spot?: Spot, level = 1, suppressed = false): void {
    if (Object.hasOwn(REPORTS, kind)) { this.report(REPORTS[kind as GunTimbre], level, spot, suppressed); return; }
    if (kind === 'spit') {
      this.hiss(.22, .28, 180, 0, spot); this.hiss(.12, .2, 260, .09, spot);
      this.tone(150, .18, .12, 'triangle', 48, 0, spot); return;
    }
    if (kind === 'acid-hit') { this.hiss(.2, .16, 240, 0, spot); this.tone(100, .09, .05, 'sine', 38, 0, spot); return; }
    if (kind === 'knife') { this.hiss(0.12, 0.35, 900, 0, spot); this.tone(320, 0.08, 0.05, 'triangle', 90, 0, spot); return; }
    const shotgun = kind === 'shotgun';
    const quiet = kind === 'enemy' ? 0.55 : 1;
    if (suppressed) {
      // The classic report muffled the same way: blast low-passed and a third as loud, crack lower and shorter, no
      // bright tail, and the action's click.
      this.hiss((shotgun ? 0.3 : 0.16) * .7, (shotgun ? 1.05 : 0.72) * quiet * .32, 160, 0, spot, false, SUPPRESSED.lowpass);
      this.tone((shotgun ? 140 : 210) * .6, (shotgun ? 0.2 : 0.12) * .6, 0.3 * quiet * .3, 'triangle', 30, 0, spot);
      this.tone(72, 0.13, 0.18 * quiet * .55, 'sine', 32, 0.025, spot);
      this.tone(1300, .03, .05 * quiet, 'square', 700, .02, spot);
      return;
    }
    this.hiss(shotgun ? 0.3 : 0.16, (shotgun ? 1.05 : 0.72) * quiet, 380, 0, spot);
    this.tone(shotgun ? 140 : 210, shotgun ? 0.2 : 0.12, 0.3 * quiet, 'triangle', 36, 0, spot);
    this.tone(72, 0.13, 0.18 * quiet, 'sine', 32, 0.025, spot);
    this.hiss(0.06, 0.09 * quiet, 1500, 0.11, spot);
  }

  private report(r: Report, level: number, spot?: Spot, suppressed = false): void {
    const [cc, cg, cl] = r.crack, [bc, bg, bl, from, to, tg] = r.body, [of, ot, ol, og] = r.boom, [tc, tgain, tl] = r.tail;
    const s = suppressed ? SUPPRESSED : null;
    this.hiss(cl, cg * level * (s?.crack ?? 1), cc, 0, spot, false, s?.lowpass);
    this.hiss(bl, bg * level * (s?.body ?? 1), bc, 0, spot, false, s?.lowpass);
    this.tone(from, bl * .85, tg * level * (s?.body ?? 1), 'triangle', to, 0, spot);
    this.tone(of, ol, og * level * (s?.boom ?? 1), 'sine', ot, .02, spot);
    // In a crowded fight the tail and the action's clicks go first; the crack, body and boom are the shot itself. A
    // suppressor drops the bright tail; the clicks stay.
    if (!s) this.hiss(tl, tgain * level, tc, .04, spot, true);
    for (const [f, t, l, g, d] of r.action) this.tone(f, l, g * level, 'square', t, d, spot, true);
  }

  /** Short, positional enemy action cues; shared timbres keep simultaneous encounters within the voice budget. */
  enemy(voice: string, phase: 'prepare' | 'release' | 'warning' | 'reload', spot?: Spot): void {
    if (phase === 'reload') { this.hiss(.10, .13, 1400, 0, spot); this.tone(420, .05, .055, 'square', 220, .07, spot); return; }
    if (voice === 'radio' || voice === 'raider') {
      if (phase === 'warning') {
        this.tone(voice === 'radio' ? 680 : 270, .10, .075, 'triangle', 390, 0, spot);
        this.hiss(.13, .10, 800, .08, spot);
      } else { this.hiss(.09, .10, 950, 0, spot); this.tone(330, .05, .04, 'triangle', 180, .04, spot); }
      return;
    }
    const release = phase === 'release';
    if (voice === 'crab') {
      this.tone(release ? 720 : 920, .055, .08, 'square', 310, 0, spot);
      this.tone(610, .045, .06, 'triangle', 240, release ? .04 : .13, spot);
    } else if (voice === 'dog') {
      this.tone(release ? 190 : 100, release ? .12 : .26, .13, 'sawtooth', 55, 0, spot);
      this.hiss(.13, .11, 200, .02, spot);
    } else if (voice === 'spit') {
      this.tone(85, .25, .10, 'triangle', 155, 0, spot); this.hiss(.18, .12, 160, .06, spot);
    } else if (voice === 'heavy') {
      this.tone(release ? 80 : 120, .23, release ? .20 : .10, 'triangle', 28, 0, spot);
      this.hiss(release ? .16 : .30, .16, 100, 0, spot);
    } else if (voice === 'polearm') {
      this.hiss(release ? .12 : .20, .18, release ? 1000 : 380, 0, spot);
      this.tone(180, .08, .04, 'triangle', 95, 0, spot);
    } else {
      this.hiss(.20, .14, 260, 0, spot); this.tone(release ? 165 : 95, .19, .07, 'sawtooth', 45, 0, spot);
    }
  }

  step(): void {
    if (!this.context || this.context.currentTime - this.lastStep < 0.17) return;
    this.lastStep = this.context.currentTime;
    this.hiss(0.06, 0.18, 180, 0, undefined, true);
    this.tone(78 + Math.random() * 22, 0.08, 0.07, 'triangle', 40, 0, undefined, true);
  }
  hit(spot?: Spot): void { this.hiss(0.16, 0.6, 80, 0, spot); this.tone(110, 0.17, 0.15, 'sawtooth', 30, 0, spot); }
  /**
   * The player's own body taking a blow, centred: a short falling grunt over a close smack, one onset like the other
   * cues. Its harmonics and the smack carry on small speakers, where a low sine thump alone would not.
   */
  pain(): void { this.tone(150, 0.16, 0.2, 'sawtooth', 70); this.hiss(0.12, 0.62, 240); }
  /** A critical hit confirmed: two quick bright ticks over the blow's own sound. */
  crit(spot?: Spot): void { this.tone(1700, 0.035, 0.16, 'square', 1300, 0, spot); this.tone(2300, 0.05, 0.11, 'triangle', 2100, 0.03, spot); }
  /** A kill confirmed: a short low thunk with a falling tail, centred like the kill marker it comes with. */
  kill(): void { this.tone(150, 0.2, 0.22, 'triangle', 55); this.tone(300, 0.06, 0.09, 'square', 160); this.hiss(0.12, 0.22, 500, 0.02); }
  pickup(): void { this.tone(660, 0.08, 0.08, 'triangle', 880); this.tone(990, 0.1, 0.06, 'sine', 1100, 0.07); }
  /** An item going into the bag: a short cloth rustle under the pickup chime, so looting reads clearly over the sea. */
  stow(): void { this.hiss(0.07, 0.24, 1700); this.hiss(0.05, 0.14, 2800, 0.05); this.pickup(); }
  click(spot?: Spot): void { this.tone(480, 0.045, 0.07, 'square', 240, 0, spot); }
  /** A round passing close by: a short airy crack falling in pitch. */
  whiz(spot?: Spot): void { this.hiss(0.1, 0.22, 2600, 0, spot); this.tone(1900, 0.08, 0.035, 'sawtooth', 520, 0, spot); }
  /**
   * A round striking a wall or door. Given its surface (#75 H-05), a wall cracks like stone (a bright snap and grit) and
   * a door knocks like wood (a low hollow thud); without one it is the single cue both shared before.
   */
  impact(spot?: Spot, surface?: 'wall' | 'door'): void {
    if (surface === 'wall') { this.hiss(0.05, 0.2, 1900, 0, spot); this.tone(1150, 0.03, 0.06, 'square', 420, 0, spot); this.hiss(0.1, 0.06, 700, 0.02, spot); return; }
    if (surface === 'door') { this.tone(240, 0.07, 0.075, 'triangle', 110, 0, spot); this.hiss(0.06, 0.09, 600, 0, spot); this.tone(520, 0.025, 0.03, 'square', 300, 0.01, spot); return; }
    this.tone(820, 0.035, 0.06, 'square', 260, 0, spot); this.hiss(0.05, 0.16, 1400, 0, spot);
  }
  /** Trigger on an empty chamber. */
  dry(): void { this.tone(1500, 0.022, 0.05, 'square', 1100); this.tone(320, 0.03, 0.04, 'triangle', 200, 0.012); }
  /** One heartbeat (two low thumps), for very low health. */
  heartbeat(): void { this.tone(58, 0.12, 0.22, 'sine', 40); this.tone(54, 0.1, 0.16, 'sine', 38, 0.2); }
  /**
   * Room tone: muffle (0..1) closes the sea ambience's low-pass, as heard from inside a building. Only callers that
   * want it use it; the original game never calls it.
   */
  setRoomTone(muffle: number): void {
    if (!this.context) return;
    this.ambientFilter?.frequency.setTargetAtTime(700 - 360 * Math.max(0, Math.min(1, muffle)), this.context.currentTime, 0.25);
  }
  radio(): void {
    this.hiss(0.5, 0.17, 800);
    this.tone(870, 0.16, 0.06, 'sine');
    this.tone(650, 0.19, 0.06, 'sine', 650, 0.25);
    this.hiss(0.2, 0.08, 1200, 0.5);
  }
  death(): void { this.tone(170, 1.5, 0.18, 'triangle', 24); this.hiss(0.8, 0.22, 100); }
  extract(): void { [330, 440, 550, 660].forEach((note, i) => this.tone(note, 0.55, 0.075, 'triangle', note, i * 0.17)); }
}
