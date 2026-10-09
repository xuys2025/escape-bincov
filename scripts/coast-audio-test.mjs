// Village sample sound, measured at the speakers: an init script taps every node connected to the AudioContext
// destination with a ScriptProcessor and records each 512-sample block that is actually rendered (peak, full-band RMS
// and a high-emphasis band). A cue counts only when its event is followed by a real onset in that output, never by
// call counts. Chrome runs WITHOUT --autoplay-policy=no-user-gesture-required, so the browser's gesture rules apply.
// ?test=1 is used to read the published frame/event log and for placement fixtures; actions are real keys and clicks.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { executablePath } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_AUDIO_OUT || 'test-results/coast-audio'); await mkdir(out, { recursive: true });
const url = pathToFileURL(resolve(process.env.BINCOV_SAMPLE_HTML || 'dist/index.html')).href + '?test=1&sample=village';
const report = { startedAt: new Date().toISOString(), method: 'Output tap on the destination; onsets in a high-emphasis band (first difference) above 2.5x the trailing median; no autoplay override.', checks: [], errors: [], requests: [] };
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
await context.addInitScript(() => {
  const connect = AudioNode.prototype.connect, tap = window.__tap = { blocks: [], contexts: [] };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const res = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode && !this.__tapped && !this.__isTap) {
      this.__tapped = true; const ctx = this.context; tap.contexts.push(ctx);
      const sp = ctx.createScriptProcessor(512, 1, 1); sp.__isTap = true; let last = 0;
      sp.onaudioprocess = e => {
        const d = e.inputBuffer.getChannelData(0); let peak = 0, sum = 0, hf = 0;
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; const df = d[i] - last; hf += df * df; last = d[i]; }
        // Goertzel magnitude at the four extraction-chime notes (330/440/550/660 Hz).
        const tone = [330, 440, 550, 660].map(f => { const c = 2 * Math.cos(2 * Math.PI * f / ctx.sampleRate); let s1 = 0, s2 = 0; for (let i = 0; i < d.length; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / d.length; });
        tap.blocks.push({ t: performance.now(), peak, full: Math.sqrt(sum / d.length), hf: Math.sqrt(hf / d.length), tone });
      };
      connect.call(this, sp); connect.call(sp, ctx.destination);
    }
    return res;
  };
  // Event arrival times: each new host event log entry is stamped on the frame it appears.
  const ev = window.__events = []; let host = null, seq = 0;
  const loop = () => {
    const h = window.__bincov?.app?.coastSample;
    if (h !== host) { host = h; seq = 0; }
    if (h) for (const e of h.eventLog) if (e.seq > seq) { seq = e.seq; ev.push({ t: performance.now(), type: e.type, ...e.detail }); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
const now = () => page.evaluate(() => performance.now());
const blocks = (t0, t1 = Infinity) => page.evaluate(([a, b]) => window.__tap.blocks.filter(x => x.t >= a && x.t < b), [t0, t1]);
const events = (t0, t1 = Infinity) => page.evaluate(([a, b]) => window.__events.filter(x => x.t >= a && x.t < b), [t0, t1]);
const ctxState = () => page.evaluate(() => window.__tap.contexts.map(c => c.state));
/** Onsets in the high-emphasis band: a block above k x the median of the preceding ~0.4 s, at least 120 ms apart. */
function onsets(bs, k = 2.5, floor = .0003, minGap = 120) {
  const out = []; let last = -1e9;
  for (let j = 12; j < bs.length; j++) {
    const prev = bs.slice(Math.max(0, j - 40), j - 2).map(b => b.hf).sort((a, b) => a - b), med = prev[prev.length >> 1];
    if (bs[j].hf > med * k && bs[j].hf > floor && bs[j].t - last > minGap) { out.push(bs[j].t); last = bs[j].t; }
  }
  return out;
}
const stats = bs => ({ blocks: bs.length, peak: +Math.max(0, ...bs.map(b => b.peak)).toFixed(4), rmsMedian: +([...bs.map(b => b.full)].sort((a, b) => a - b)[bs.length >> 1] ?? 0).toFixed(4) });
/** Every event in `evs` must have an output onset within [-60, +350] ms of its arrival. */
function sounded(evs, ons) { return evs.map(e => ({ type: e.type, t: Math.round(e.t), onset: ons.some(o => o >= e.t - 60 && o <= e.t + 350) })); }
const plots = [];
async function check(id, task) {
  const entry = { id, status: 'running' }; report.checks.push(entry);
  try { entry.detail = await task(); entry.status = 'passed'; }
  catch (error) { entry.status = 'failed'; entry.error = String(error?.stack ?? error).slice(0, 1200); }
  console.log(`${entry.status === 'passed' ? 'PASS' : 'FAIL'}  ${id}${entry.error ? `\n      ${entry.error.split('\n')[0]}` : ''}`);
}
/** Window of output around an action, for the plots and the checks. */
async function capture(label, action, settle = 500) {
  const t0 = await now(); await action(); await wait(settle); const t1 = await now();
  const bs = await blocks(t0 - 300, t1), ev = await events(t0 - 300, t1), on = onsets(bs);
  plots.push({ label, t0: t0 - 300, t1, bs, ev, on });
  return { bs, ev, on, t0, t1 };
}
const S = () => page.evaluate(() => { const h = window.__bincov.app.coastSample, b = h?.lastBatch; return b ? { panel: h.panel, phase: b.frame.phase, p: b.frame.player, hud: b.frame.hud, loot: b.frame.loot, containers: b.frame.containers, actors: b.frame.actors, exits: b.map.exits } : null; });
const drv = (fn, ...a) => page.evaluate(([fn, a]) => window.__bincovSample.driver[fn](...a), [fn, a]);
const toScreen = (x, y) => page.evaluate(([x, y]) => { const v = window.__bincovSample.host.view, r = document.querySelector('.coast-sample canvas').getBoundingClientRect(); return { x: r.left + (x - v.cam.x) * v.view.s / v.view.dpr, y: r.top + (y - v.cam.y) * v.view.s / v.view.dpr }; }, [x, y]);
const click = async () => { await page.mouse.down(); await wait(30); await page.mouse.up(); };
async function deploy(first) {
  if (first) await page.locator('[data-action="enter"]').click();
  await page.locator('#seed').fill('20261008'); await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch); await drv('freezeAI', true); await wait(800);
}
async function aimAway() { const s = await S(); const at = await toScreen(s.p.x + 140, s.p.y - 22); await page.mouse.move(at.x, at.y); await wait(150); }
async function shots(n = 3, label = 'shots') {
  await aimAway();
  const c = await capture(label, async () => { for (let i = 0; i < n; i++) { await click(); await wait(650); } }, 300);
  // A gun shot, or a knife swing when the run has no primary weapon (lost by an earlier failed run).
  const fired = c.ev.filter(e => (e.type === 'shot' && e.shooter === 'player') || (e.type === 'melee' && e.attacker === 'player')), s = sounded(fired, c.on);
  return { fired: fired.length, sounded: s.filter(x => x.onset).length, onsets: c.on.length, ...stats(c.bs) };
}
async function pauseWith(fn) { await fn(); await page.waitForFunction(() => window.__bincov.app.coastSample.panel === 'pause'); await wait(400); }
async function resume() { await page.locator('.coast-sample [data-do="resume"]').click(); await page.waitForFunction(() => window.__bincov.app.coastSample.lastBatch.frame.phase === 'running'); await wait(500); await drv('freezeAI', true); }
async function silentWhilePaused() {
  const t0 = await now(); await wait(900); const t1 = await now(), bs = await blocks(t0, t1);
  return { blocksWhilePaused: bs.length, states: await ctxState(), peak: stats(bs).peak };
}
/** Hold E at the north checkpoint through the settlement; the chime must follow the committed settlement. */
async function exitAndSettle(label) {
  const s = await S(), ex = s.exits.find(e => e.id === 'north');
  await drv('placePlayer', { x: ex.at.x, y: ex.at.y + 8 }, Math.PI / 2, 'coast'); await wait(800);
  let tHold = 0;
  const c = await capture(label, async () => {
    await page.keyboard.down('e');
    await page.waitForFunction(() => window.__bincov.app.coastSample?.lastBatch?.frame.phase === 'ending' || window.__bincov.app.state === 'result', null, { timeout: 8000 });
    tHold = await now(); await page.keyboard.up('e');
    await page.waitForFunction(() => window.__bincov.app.state === 'result');
  }, 1500);
  // Each chime note must rise above its level before the settlement (Goertzel bins at 330/440/550/660 Hz): every note >= 3x,
  // mean >= 4x (330 Hz shares its band with the sea ambience).
  const before = c.bs.filter(b => b.t < tHold - 300), after = c.bs.filter(b => b.t >= tHold - 100);
  const notes = [0, 1, 2, 3].map(k => { const base = before.map(b => b.tone[k]).sort((a, b) => a - b), med = base[base.length >> 1], top = Math.max(...after.map(b => b.tone[k])); return +(top / med).toFixed(1); });
  return { outcome: await page.evaluate(() => window.__bincov.app.result?.outcome), noteRise: notes, chime: notes.every(r => r >= 3) && notes.reduce((a, b) => a + b, 0) / 4 >= 4, cuePeak: stats(after).peak, states: await ctxState() };
}

try {
  await page.goto(url); await wait(800);
  // 1. First entry: one click on 进入水产站 is the user gesture; deploy; ambience and the first shots are audible.
  await deploy(true);
  await check('A1 first entry: the AudioContext runs after the first click, ambience reaches the output', async () => {
    const t0 = await now(); await wait(1000); const bs = await blocks(t0), st = stats(bs), states = await ctxState();
    assert.deepEqual(states, ['running']); assert.ok(bs.length > 60, 'rendered blocks'); assert.ok(st.rmsMedian > .003, `ambience rms ${st.rmsMedian}`);
    return { states, ...st };
  });
  await check('A2 gunshots: every player shot is followed by a real onset (peak well above ambience)', async () => {
    const r = await shots(3); assert.equal(r.fired, 3); assert.equal(r.sounded, 3, JSON.stringify(r)); assert.ok(r.peak > .1, `peak ${r.peak}`); return r;
  });
  await check('A3 footsteps: walking 3 s gives periodic onsets; standing still 2 s gives none', async () => {
    const still = await capture('standing still', async () => {}, 2000);
    const walk = await capture('walking (W)', async () => { await page.keyboard.down('s'); await wait(3000); await page.keyboard.up('s'); }, 200);
    const gaps = walk.on.slice(1).map((t, i) => t - walk.on[i]).sort((a, b) => a - b);
    // Steady ambience may cross the detector once; footsteps must give a train at the 0.42 s cadence.
    assert.ok(still.on.length <= 1, `onsets while standing ${still.on.length}`); assert.ok(walk.on.length >= 5 && walk.on.length >= 3 * Math.max(1, still.on.length), `steps heard ${walk.on.length}`);
    const median = gaps[gaps.length >> 1]; assert.ok(median > 330 && median < 520, `step spacing ${median} ms (0.42 s cadence)`);
    return { still: still.on.length, walking: walk.on.length, medianGapMs: Math.round(median) };
  });
  await check('A4 melee: knife swings are audible', async () => {
    await page.keyboard.press('2'); await wait(400); await aimAway();
    const c = await capture('knife', async () => { for (let i = 0; i < 2; i++) { await click(); await wait(700); } }, 200);
    await page.keyboard.press('1'); await wait(400);
    const swings = c.ev.filter(e => e.type === 'melee' && e.attacker === 'player'), s = sounded(swings, c.on);
    assert.ok(swings.length >= 2 && s.every(x => x.onset), JSON.stringify(s)); return { swings: swings.length, ...stats(c.bs) };
  });
  await check('A5 pickup: picking up ground loot and taking an item from a crate are audible', async () => {
    let s = await S(); const item = s.loot.filter(l => l.regionId === null).sort((a, b) => Math.hypot(a.x - s.p.x, a.y - s.p.y) - Math.hypot(b.x - s.p.x, b.y - s.p.y))[0];
    await drv('placePlayer', { x: item.x - 18, y: item.y }, 0, 'coast'); await wait(500);
    const ground = await capture('ground pickup (E)', async () => { await page.keyboard.press('e'); }, 700);
    s = await S(); const crate = s.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null).sort((a, b) => Math.hypot(a.x - s.p.x, a.y - s.p.y) - Math.hypot(b.x - s.p.x, b.y - s.p.y))[0];
    await drv('placePlayer', { x: crate.x - 24, y: crate.y }, 0, 'coast'); await wait(500);
    await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincov.app.coastSample.panel === 'loot');
    await page.locator('[data-grid="container"] [data-uid]').first().click(); await wait(200);
    const taken = await capture('crate item to bag', async () => { await page.locator('[data-do="inv-quick"]').click(); }, 700);
    await page.keyboard.press('Escape'); await wait(300);
    const g = sounded(ground.ev.filter(e => e.type === 'looted'), ground.on), t = sounded(taken.ev.filter(e => e.type === 'looted'), taken.on);
    assert.ok(g.length >= 1 && g.every(x => x.onset), `ground ${JSON.stringify(g)}`); assert.ok(t.length >= 1 && t.every(x => x.onset), `crate ${JSON.stringify(t)}`);
    return { ground: g, crate: t, groundPeak: stats(ground.bs).peak, cratePeak: stats(taken.bs).peak };
  });
  await check('A6 hits and enemy fire: an adjacent scav and a salt rifleman attack; every hit on the player and every enemy shot is audible', async () => {
    const s = await S(), scav = s.actors.find(a => a.alive && a.kind === 'scav'), salt = s.actors.find(a => a.alive && a.kind === 'salt');
    await drv('placePlayer', { x: 640, y: 456 }, 0, 'coast'); await drv('placeEnemy', scav.uid, { x: 664, y: 456 }); await drv('placeEnemy', salt.uid, { x: 800, y: 456 }); await wait(300);
    // Diagnostic only: identify actual output calls during A6. The original gate below is unchanged.
    await page.evaluate(() => { const h = window.__bincovSample.host; window.__a6Cues = []; for (const key of ['hit','heartbeat','shot','impact','whiz','step']) { const normal = h.sound.out[key]; h.sound.out[key] = function (...args) { window.__a6Cues.push({ t: performance.now(), key }); return normal.apply(this,args); }; } });
    const c = await capture('enemy attacks (AI on 3 s)', async () => { await drv('freezeAI', false); await wait(3000); await drv('freezeAI', true); }, 400);
    // Attack cues may overlap inside 120 ms. Retain each above-threshold output block for event matching;
    // thresholds and [-60,+350] ms remain unchanged. Footstep counts and quiet-bleed gate retain 120 ms dedup.
    const attackOnsets = onsets(c.bs, 2.5, .0003, 0);
    const hurt = sounded(c.ev.filter(e => e.type === 'hurt' && e.uid === 'player' && e.cause === 'blow'), attackOnsets), fire = sounded(c.ev.filter(e => e.type === 'shot' && e.shooter !== 'player'), attackOnsets);
    report.a6 = { attacks: { events: c.ev, output: c.bs, onsets: c.on, attackOnsets }, cues: await page.evaluate(() => window.__a6Cues), hp: (await S()).hud.hp };
    assert.ok(hurt.length >= 1 && hurt.every(x => x.onset), `hurt ${JSON.stringify(hurt)}`); assert.ok(fire.length >= 1 && fire.every(x => x.onset), `enemy shots ${JSON.stringify(fire)}`);
    await drv('placeEnemy', scav.uid, { x: 104, y: 860 }); await drv('placeEnemy', salt.uid, { x: 136, y: 860 }); await wait(300);
    // Bleeding publishes a hurt with cause 'bleed' every frame: standing still while bleeding must stay quiet (no hit cue).
    const bleeding = (await S()).hud.bleeding, quiet = await capture('standing while bleeding', async () => {}, 1500);
    report.a6 = { attacks: { events: c.ev, output: c.bs, onsets: c.on }, quiet: { events: quiet.ev, output: quiet.bs, onsets: quiet.on, start: quiet.t0, end: quiet.t1 }, cues: await page.evaluate(() => window.__a6Cues), hp: (await S()).hud.hp, bleeding };
    const ticks = quiet.ev.filter(e => e.type === 'hurt' && e.cause === 'bleed').length;
    if (bleeding) { assert.ok(ticks > 20, `bleed ticks ${ticks}`); assert.equal(quiet.on.length, 0, `onsets while bleeding ${quiet.on.length} on=${JSON.stringify(quiet.on)} ev=${JSON.stringify(quiet.ev.filter(e => !(e.type === 'hurt' && e.cause === 'bleed')).map(e => ({ t: Math.round(e.t), type: e.type, cause: e.cause, dmg: e.damage, uid: e.uid })))} hp=${(await S()).hud.hp}`); assert.ok(stats(quiet.bs).peak < .1, `peak while bleeding ${stats(quiet.bs).peak}`); }
    return { hurt: hurt.length, enemyShots: fire.length, hp: Math.round((await S()).hud.hp), ...stats(c.bs), bleeding, bleedTicks: ticks, bleedingOnsets: quiet.on.length, bleedingPeak: stats(quiet.bs).peak };
  });
  await check('A7 heal: Q uses a supply audibly', async () => {
    const before = (await S()).hud.heals;
    const c = await capture('heal (Q)', async () => { await page.keyboard.press('q'); }, 900);
    const after = (await S()).hud.heals; assert.equal(after, before - 1, 'a supply was used'); assert.ok(c.on.length >= 1, 'heal cue onset');
    return { heals: [before, after], onsets: c.on.length, ...stats(c.bs) };
  });
  // 2. Pause and resume.
  await check('B1 Esc pause suspends the output (no rendered blocks); 继续 restores it and shots are audible again', async () => {
    await pauseWith(() => page.keyboard.press('Escape'));
    const paused = await silentWhilePaused(); await resume(); const after = await shots(2, 'shots after resume');
    assert.ok(paused.blocksWhilePaused <= 6, `blocks while paused ${paused.blocksWhilePaused}`); assert.deepEqual(paused.states, ['suspended']);
    assert.equal(after.sounded, 2); assert.deepEqual(await ctxState(), ['running']);
    return { paused, after };
  });
  // 3. Leave the window (another tab in front) and come back.
  await check('B2 switching to another tab pauses and silences; coming back and pressing 继续 brings the sound back', async () => {
    // A real tab switch first; headless Chrome may keep the page visible and focused, in which case the same window
    // blur and document visibilitychange events the game listens for are dispatched with document.hidden reporting true.
    const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront(); await wait(600);
    const real = await page.evaluate(() => ({ hidden: document.hidden, focus: document.hasFocus(), panel: window.__bincov.app.coastSample.panel }));
    let method = 'real tab switch';
    if (real.panel !== 'pause') {
      method = 'window blur + visibilitychange (headless kept the page visible)';
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => window.__bincov.app.coastSample.panel === 'pause'); await wait(300);
    }
    const away = await silentWhilePaused();
    await page.evaluate(() => { delete document.hidden; delete document.visibilityState; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.bringToFront(); await other.close(); await wait(300);
    const back = await silentWhilePaused();
    await resume(); const after = await shots(2, 'shots after coming back');
    assert.ok(away.blocksWhilePaused <= 6, `blocks while away ${away.blocksWhilePaused}`); assert.deepEqual(away.states, ['suspended']);
    assert.ok(back.blocksWhilePaused <= 6, 'still paused and silent until 继续'); assert.equal(after.sounded, 2, JSON.stringify(after)); assert.deepEqual(await ctxState(), ['running']);
    return { method, real, away, back, after };
  });
  // 4. Volume: the pause panel slider writes the one saved setting; 0 is silent, 100% is louder than the default.
  let loud = null;
  await check('C1 volume from the pause panel: 0% silences shots and ambience; 100% is louder than the 35% default; the value persists', async () => {
    const base = await shots(2, 'shots at 35%');
    await pauseWith(() => page.keyboard.press('Escape'));
    await page.locator('.coast-sample [data-volume]').focus(); await page.keyboard.press('Home'); await wait(200);
    await resume(); const zero = await shots(2, 'shots at 0%');
    await pauseWith(() => page.keyboard.press('Escape'));
    await page.locator('.coast-sample [data-volume]').focus(); await page.keyboard.press('End'); await wait(200);
    const label = await page.locator('.coast-sample [data-volume-label]').textContent();
    await page.screenshot({ path: resolve(out, 'pause-volume-1280x720.png') });
    await resume(); loud = await shots(2, 'shots at 100%');
    const saved = await page.evaluate(() => window.__bincov.app.save.settings.volume);
    assert.equal(zero.sounded, 0, 'no shot is audible at 0%'); assert.ok(zero.peak < .002, `peak at 0% ${zero.peak}`);
    assert.ok(loud.peak > base.peak * 1.3 && loud.rmsMedian > base.rmsMedian * 2, `100% ${loud.peak}/${loud.rmsMedian} vs 35% ${base.peak}/${base.rmsMedian}`);
    assert.equal(label, '100%'); assert.equal(saved, 1);
    const run = await S(); assert.equal(run.phase, 'running'); assert.equal(await page.evaluate(() => window.__bincov.app.storageError), '');
    return { base, zero, loud, saved };
  });
  // 5. Refresh and continue from the checkpoint: the saved volume is kept and sound returns after 进入 + 继续.
  await check('D1 refresh: the run resumes paused and silent; after 进入 and 继续 the sound is back at the saved volume', async () => {
    assert.equal(await page.evaluate(() => window.__bincovSample.host.services.checkpoint()), true);
    await page.reload(); await page.locator('[data-action="enter"]').click(); await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch); await wait(600);
    const label = await page.locator('.coast-sample [data-volume-label]').textContent();
    const paused = await silentWhilePaused(); await resume(); const after = await shots(2, 'shots after refresh');
    assert.equal(label, '100%'); assert.equal(after.sounded, 2); assert.ok(paused.blocksWhilePaused <= 6 || paused.peak < .002, JSON.stringify(paused));
    // Back to the default 35% for the rest of the runs (0 -> 7 steps of 5%).
    await pauseWith(() => page.keyboard.press('Escape'));
    await page.locator('.coast-sample [data-volume]').focus(); await page.keyboard.press('Home'); for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight'); await wait(200);
    const back = await page.locator('.coast-sample [data-volume-label]').textContent(); await resume();
    assert.equal(back, '35%');
    return { label, paused, after, back };
  });
  // 6. Settlement and consecutive runs.
  await check('E1 run 1 extracts: the result screen plays the extraction chime', async () => {
    const r = await exitAndSettle('run 1 settlement'); assert.equal(r.outcome, 'extract'); assert.ok(r.chime, `chime ${JSON.stringify(r)}`); return r;
  });
  // The audio service now schedules cues asked for while resume() is pending, so the death cue starts in the very first
  // block rendered after the pause, together with the ambience: there is no preceding output for the onset detector to
  // compare with. The cue is therefore measured by level: the peak of the settlement window against the peak of the
  // ambience alone once the cue has died away. Measured over 16 runs of this check with the cue: 2.11-2.89x, peak
  // 0.113-0.159 (docs/coast-sample-view/opus-experience-20261009/evidence/audio-e2-calibration.json); with the cue dropped (the original game before the fix) both windows sit at the ambience, about 0.05,
  // so about 1x. The sea swell moves the ambience peak by about +-20%, hence 1.6x and a 0.09 floor.
  await check('E2 run 2: deploy again, shots audible, abandon from the pause menu: the death cue still plays', async () => {
    await page.locator('[data-action="return"]').click(); await wait(500); await deploy(false);
    const s = await shots(2, 'run 2 shots'); assert.equal(s.sounded, 2, JSON.stringify(s));
    await pauseWith(() => page.keyboard.press('Escape'));
    await page.locator('.coast-sample [data-do="abandon"]').click();
    const c = await capture('run 2 abandon from pause', async () => { await page.locator('.coast-sample [data-do="abandon-yes"]').click(); await page.waitForFunction(() => window.__bincov.app.state === 'result'); }, 1800);
    const outcome = await page.evaluate(() => window.__bincov.app.result?.outcome);
    const ambience = await capture('ambience after the death cue', async () => {}, 900), cue = stats(c.bs).peak, quiet = stats(ambience.bs).peak;
    assert.equal(outcome, 'death'); assert.ok(cue >= quiet * 1.6 && cue > .09, `death cue peak ${cue} vs ambience ${quiet} (onsets ${c.on.length})`);
    return { shots: s, cueOnsets: c.on.length, cuePeak: cue, ambiencePeak: quiet, ...stats(c.bs), states: await ctxState() };
  });
  await check('E3 run 3: deploy again, ambience, shots and footsteps audible, extract with the chime', async () => {
    await page.locator('[data-action="return"]').click(); await wait(500); await deploy(false);
    const t0 = await now(); await wait(800); const amb = stats(await blocks(t0));
    const s = await shots(2, 'run 3 shots');
    const walk = await capture('run 3 walking', async () => { await page.keyboard.down('s'); await wait(2000); await page.keyboard.up('s'); }, 200);
    const r = await exitAndSettle('run 3 settlement');
    assert.ok(amb.rmsMedian > .003, `ambience ${amb.rmsMedian}`); assert.equal(s.sounded, 2, JSON.stringify(s)); assert.ok(walk.on.length >= 3, `steps ${walk.on.length}`); assert.equal(r.outcome, 'extract'); assert.ok(r.chime, JSON.stringify(r));
    return { ambience: amb, shots: s, steps: walk.on.length, result: r, contexts: (await ctxState()).length };
  });
} catch (error) { report.failure = String(error?.stack ?? error).slice(0, 1500); console.log('FAIL', report.failure.split('\n')[0]); }

// Waveform evidence: rendered output envelope per capture, with event and onset markers.
try {
  const png = await page.evaluate(plots => {
    const W = 900, H = 90, c = document.createElement('canvas'); c.width = W; c.height = (H + 22) * plots.length; const g = c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.font = '13px sans-serif';
    plots.forEach((p, i) => {
      const y0 = i * (H + 22), sx = t => (t - p.t0) / Math.max(1, p.t1 - p.t0) * W;
      g.fillStyle = '#ddd'; g.fillText(p.label, 6, y0 + 15);
      g.fillStyle = '#5a7f9a'; for (const b of p.bs) { const h = Math.min(H - 4, b.peak * 300); g.fillRect(sx(b.t), y0 + 22 + H - h, 2, h); }
      g.fillStyle = '#9fd39a'; for (const b of p.bs) if (b.tone) { const h = Math.min(H - 4, Math.max(...b.tone) * 2500); g.fillRect(sx(b.t), y0 + 22 + H - h, 1, h); }
      g.fillStyle = '#e6c470'; for (const t of p.on) g.fillRect(sx(t), y0 + 22, 1, H);
      g.fillStyle = '#d0573f'; for (const e of p.ev) if (['shot', 'melee', 'hurt', 'looted'].includes(e.type)) g.fillRect(sx(e.t) - 1, y0 + 22, 3, 6);
    });
    return c.toDataURL();
  }, plots.map(p => ({ label: p.label, t0: p.t0, t1: p.t1, on: p.on, ev: p.ev.map(e => ({ t: e.t, type: e.type })), bs: p.bs.map(b => ({ t: b.t, peak: b.peak, tone: b.tone })) })));
  await writeFile(resolve(out, 'audio-waveforms.png'), Buffer.from(png.split(',')[1], 'base64'));
} catch (error) { report.plotError = String(error); }
await browser.close();
report.finishedAt = new Date().toISOString();
report.passed = report.checks.filter(c => c.status === 'passed').length; report.failed = report.checks.length - report.passed;
await writeFile(resolve(out, 'audio-output.json'), JSON.stringify({ plots }, null, 2));
await writeFile(resolve(out, 'audio.json'), JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.checks.length} passed; errors ${report.errors.length}; external requests ${report.requests.length}`);
if (report.failed || report.failure || report.errors.length || report.requests.length) process.exitCode = 1;
