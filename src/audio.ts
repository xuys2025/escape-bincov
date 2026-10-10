/**
 * Where a cue happens relative to the listener: stereo position (-1 left .. 1 right) and level (0..1). Omitted, a cue
 * plays centred at full level, exactly as before.
 */
export type Spot = { pan: number; gain: number };

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
  private voices = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private readonly maxVoices = 96;
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
    for (const [voice, nodes] of this.voices) {
      voice.onended = null;
      try { voice.stop(); } catch { /* Already stopped. */ }
      for (const node of nodes) node.disconnect();
    }
    this.voices.clear();
    for (const node of this.ambientNodes) node.disconnect();
    this.ambientNodes = [];
    this.ambience = undefined;
    this.swell = undefined;
    this.ambientFilter = undefined;
    this.resumeAt = -1;
    if (this.context) void this.context.suspend().catch(() => undefined);
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.voices.set(source, nodes);
    source.onended = () => {
      this.voices.delete(source);
      for (const node of nodes) node.disconnect();
      source.onended = null;
    };
  }

  /** Whether a cue may be scheduled now: running, or inside a fresh resume window (with a smaller voice budget). */
  private ready(): boolean {
    if (!this.context || !this.master) return false;
    if (this.context.state === 'running') return this.voices.size < this.maxVoices;
    return this.resumeAt >= 0 && performance.now() - this.resumeAt < 1000 && this.voices.size < 16;
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

  private tone(frequency: number, length: number, gain: number, type: OscillatorType = 'sine', endFrequency = frequency, delay = 0, spot?: Spot): void {
    if (!this.ready()) return;
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
    this.trackVoice(oscillator, nodes);
    oscillator.start(at);
    oscillator.stop(at + length + 0.025);
  }

  private hiss(length: number, gain: number, cutoff: number, delay = 0, spot?: Spot): void {
    if (!this.noise || !this.ready()) return;
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
    source.connect(filter).connect(envelope).connect(this.route(nodes, spot));
    this.trackVoice(source, nodes);
    source.start(at, Math.random() * 2);
    source.stop(at + length + 0.02);
  }

  shot(kind = 'pistol', spot?: Spot): void {
    if (kind === 'knife') { this.hiss(0.12, 0.35, 900, 0, spot); this.tone(320, 0.08, 0.05, 'triangle', 90, 0, spot); return; }
    const shotgun = kind === 'shotgun';
    const level = kind === 'enemy' ? 0.55 : 1;
    this.hiss(shotgun ? 0.3 : 0.16, (shotgun ? 1.05 : 0.72) * level, 380, 0, spot);
    this.tone(shotgun ? 140 : 210, shotgun ? 0.2 : 0.12, 0.3 * level, 'triangle', 36, 0, spot);
    this.tone(72, 0.13, 0.18 * level, 'sine', 32, 0.025, spot);
    this.hiss(0.06, 0.09 * level, 1500, 0.11, spot);
  }

  step(): void {
    if (!this.context || this.context.currentTime - this.lastStep < 0.17) return;
    this.lastStep = this.context.currentTime;
    this.hiss(0.06, 0.18, 180);
    this.tone(78 + Math.random() * 22, 0.08, 0.07, 'triangle', 40);
  }
  hit(spot?: Spot): void { this.hiss(0.16, 0.6, 80, 0, spot); this.tone(110, 0.17, 0.15, 'sawtooth', 30, 0, spot); }
  pickup(): void { this.tone(660, 0.08, 0.08, 'triangle', 880); this.tone(990, 0.1, 0.06, 'sine', 1100, 0.07); }
  /** An item going into the bag: a short cloth rustle under the pickup chime, so looting reads clearly over the sea. */
  stow(): void { this.hiss(0.07, 0.24, 1700); this.hiss(0.05, 0.14, 2800, 0.05); this.pickup(); }
  click(spot?: Spot): void { this.tone(480, 0.045, 0.07, 'square', 240, 0, spot); }
  /** A round passing close by: a short airy crack falling in pitch. */
  whiz(spot?: Spot): void { this.hiss(0.1, 0.22, 2600, 0, spot); this.tone(1900, 0.08, 0.035, 'sawtooth', 520, 0, spot); }
  /** A round striking a wall or door. */
  impact(spot?: Spot): void { this.tone(820, 0.035, 0.06, 'square', 260, 0, spot); this.hiss(0.05, 0.16, 1400, 0, spot); }
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
