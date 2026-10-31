// All sound is synthesized with Web Audio: rain, distant surf, radio static, thunder, part clicks, extraction tones. Off by default.
export function createAudio() {
  let ctx = null, master = null, on = false, noise = null, brown = null;

  function buffers() {
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }
  function loop(buf, filters, gain) {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    let node = src;
    for (const [type, f, q] of filters) { const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f; if (q) bq.Q.value = q; node.connect(bq); node = bq; }
    const g = ctx.createGain(); g.gain.value = gain; node.connect(g); g.connect(master);
    src.start();
    return g;
  }
  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    buffers();
    loop(noise, [['highpass', 900], ['lowpass', 6500]], 0.07);     // rain
    loop(noise, [['bandpass', 2600, 0.6]], 0.025);                  // rain on sheet metal
    loop(brown, [['lowpass', 380]], 0.28);                          // surf and wind
    // drips from the eaves
    const drip = () => {
      if (!ctx) return;
      if (on) blip(1400 + Math.random() * 900, 0.03, 0.025, 'sine');
      setTimeout(drip, 250 + Math.random() * 1400);
    };
    drip();
  }
  function blip(freq, dur, vol, type = 'square', when = 0) {
    if (!ctx || !on) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    get on() { return on; },
    toggle() {
      if (!ctx) init();
      on = !on;
      ctx.resume?.();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.35);
      return on;
    },
    /** Radio typing static */
    tick() { if (on && Math.random() < 0.7) blip(2200 + Math.random() * 1600, 0.018, 0.012, 'square'); },
    thunder(distance = 1) {
      if (!ctx || !on) return;
      const t = ctx.currentTime + 0.6 + distance * 1.4;
      const src = ctx.createBufferSource(); src.buffer = brown;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1.1, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.35, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
      src.connect(lp); lp.connect(g); g.connect(master);
      src.start(t, Math.random()); src.stop(t + 4.5);
    },
    snap(i = 0) { blip(260 + i * 18, 0.05, 0.08, 'square'); blip(1800, 0.012, 0.03, 'square', 0.004); },
    holdTone(p) { if (on && Math.random() < 0.25) blip(330 + p * 600, 0.06, 0.03, 'triangle'); },
    success() { [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.18, 0.06, 'triangle', i * 0.09)); },
    warn() { blip(880, 0.12, 0.05, 'square'); blip(660, 0.16, 0.05, 'square', 0.16); },
  };
}
