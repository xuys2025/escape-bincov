import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIM_LEAD, CAMERA_HOLD, EDGE_FADE, PRECISE_LEAD, aimLead, leadRoom, pointerLead, snapAxis, stepLead, type AxisHold, type CameraBounds, type Lead } from '../src/coast-view/camera';

// Playtest F-04: while walking, the player trembled 1 world px on screen (round(p) - round(camF) flips with the two
// fractions). The replay below is the host loop after the fix: frame i starts at its vsync plus U(0..J ms) of
// frame-start jitter, the Runtime moves the player on the deltas of those starts (ActiveClock), and the camera smooths on
// the same deltas (host.ts `follow`, scene.ts camera(): k = 1 - exp(-8 dt)). `clock: 'vsync'` smooths on the rAF
// timestamps instead (the old host's ticker.deltaMS), and `motion: false` drops the motion rule, for the controls.
const rng = (seed: number) => () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), 1 | t); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** Steady follow lag of the smoothed camera behind a player walking at v (one frame per vsync). */
const lagOf = (v: number, hz: number) => { const dt = 1 / hz, k = 1 - Math.exp(-8 * dt); return v * dt * (1 - k) / k; };
interface Row { t: number; p: number; camF: number; motion: number; at: number; held: number; raw: number }
function replay(o: { hz: number; v: number; target: number; seed: number; seconds: number; stopAt?: number; jitter?: number; clock?: 'runtime' | 'vsync';
  lo?: number; hi?: number; p0?: number; flick?: { at: number; by: number }; motion?: boolean }) {
  const r = rng(o.seed), P = 1000 / o.hz, J = o.jitter ?? 3, lo = o.lo ?? -1e9, hi = o.hi ?? 1e9;
  let p = o.p0 ?? 1000.3, target = o.target, camF = p + target, hold: AxisHold | undefined, prev = r() * J;
  const rows: Row[] = [];
  for (let i = 1; i <= o.seconds * o.hz; i++) {
    const t0 = i * P + r() * J, dt = Math.min(.1, Math.max(0, (t0 - prev) / 1000)); prev = t0;
    const t = i * P / 1000;
    if (t < (o.stopAt ?? Infinity)) p += o.v * dt;
    if (o.flick && t >= o.flick.at) { target += o.flick.by; o = { ...o, flick: undefined }; }
    const motion = (p + target - camF) * (1 - Math.exp(-(o.clock === 'vsync' ? P / 1000 : dt) * 8)); camF += motion;
    const s = snapAxis(camF, p, lo, hi, hold, o.motion === false ? 0 : motion); hold = { held: s.held, raw: s.raw };
    rows.push({ t, p, camF, motion, ...s });
  }
  return rows;
}
/** Changes of a whole-pixel series, and reversals (a change against the direction of the previous one). */
const changes = (xs: number[]) => {
  let n = 0, reversals = 0, last = 0;
  for (let i = 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1]; if (!d) continue; n++; if (last && Math.sign(d) !== Math.sign(last)) reversals++; last = d; }
  return { n, reversals };
};
const HZ = [60, 144], SPEEDS = [78.4, 112, 190]; // precise walk, walk, sprint (balance.ts)
/** Steady offsets with every fraction 0..0.99: the lead puts the offset at `f` after the steady lag. */
const steady = (f: number, v: number, hz: number) => -360 + f + lagOf(v, hz);

test('a steady walk keeps the player still on screen for every offset fraction (3 and 8 ms frame-start jitter)', () => {
  for (const jitter of [3, 8]) for (const hz of HZ) for (const v of SPEEDS) {
    let worst = 0, reversals = 0, oldRuns = 0, oldReversals = 0, runs = 0;
    for (let f = 0; f < 100; f++) for (let seed = 1; seed <= 10; seed++) {
      const rows = replay({ hz, v, target: steady(f / 100, v, hz), seed, seconds: 6, jitter }).filter(r => r.t >= 1);
      const now = changes(rows.map(r => Math.round(r.p) - r.at)), old = changes(rows.map(r => Math.round(r.p) - Math.round(r.camF)));
      worst = Math.max(worst, now.n); reversals += now.reversals; runs++;
      if (old.reversals) oldRuns++; oldReversals += old.reversals;
    }
    const label = `${hz} Hz, ${v} px/s, ${jitter} ms`;
    assert.ok(worst <= 1, `${label}: the player moved ${worst} times on screen in 5 s`);
    assert.equal(reversals, 0, `${label}: on-screen reversals`);
    // Control: today's Math.round(camF) on the same replay trembles in nearly every run, at 10+ reversals a second.
    assert.ok(oldRuns >= runs * .95, `${label}: old formula reversed in only ${oldRuns}/${runs} runs`);
    assert.ok(oldReversals / runs / 5 >= 10, `${label}: old formula ${(oldReversals / runs / 5).toFixed(1)} reversals/s`);
  }
});

test('control: the same hold on the rAF clock (the old host) moves the player on screen, so the camera must follow the Runtime clock', () => {
  let worst = 0;
  for (let f = 0; f < 100; f++) for (let seed = 1; seed <= 10; seed++) {
    const rows = replay({ hz: 144, v: 190, target: steady(f / 100, 190, 144), seed, seconds: 6, clock: 'vsync' }).filter(r => r.t >= 1);
    worst = Math.max(worst, changes(rows.map(r => Math.round(r.p) - r.at)).n);
  }
  assert.ok(worst > 5, `sprint at 144 Hz on the vsync clock: worst ${worst} changes in 5 s`);
  // The browser check's `loaded` run (scripts/coast-sample-test.mjs V-CAM): a 60 Hz sprint whose frames start up to 12 ms
  // late, judged 0.7-1.5 s into the walk (more than 2 changes or any reversal fails). The rAF clock fails it for every
  // offset, the Runtime clock for none.
  for (const clock of ['vsync', 'runtime'] as const) {
    let failing = 0;
    for (let f = 0; f < 100; f++) {
      const xs = replay({ hz: 60, v: 190, target: steady(f / 100, 190, 60), seed: 26 + f, seconds: 1.5, jitter: 12, clock }).filter(r => r.t > .7).map(r => Math.round(r.p) - r.at);
      const c = changes(xs); if (c.n > 2 || c.reversals > 0) failing++;
    }
    assert.equal(failing, clock === 'vsync' ? 100 : 0, `${clock} clock, late frames: ${failing}/100 offsets fail`);
  }
});

test('trap: an offset taken from the rounded player is the old trembling camera again', () => {
  for (const hz of HZ) for (const v of SPEEDS) {
    const trembling: number[] = [];
    for (let f = 0; f < 100; f++) {
      const rows = replay({ hz, v, target: steady(f / 100, v, hz), seed: f + 1, seconds: 3 });
      let hold: AxisHold | undefined; const trapped: number[] = [];
      for (const r of rows) {
        // Without the hold it is exactly Math.round(camF), every frame.
        assert.equal(snapAxis(r.camF, Math.round(r.p), -1e9, 1e9).at, Math.round(r.camF));
        const s = snapAxis(r.camF, Math.round(r.p), -1e9, 1e9, hold, r.motion); hold = s; trapped.push(Math.round(r.p) - s.at);
      }
      if (changes(trapped.slice(hz)).reversals > 0) trembling.push(f);
    }
    // With the hold the offset still swings +-0.5 px with the player's fraction: about half the offsets (those near .5)
    // keep reversing on screen, while the unrounded player gives none (first test).
    assert.ok(trembling.length >= 40 && trembling.includes(50), `${hz} Hz, ${v} px/s: ${trembling.length} trembling offsets`);
  }
});

test('the ground scrolls in the player\'s own steps and stays within 1 px of the old camera', () => {
  for (const hz of HZ) for (const v of SPEEDS) for (let f = 0; f < 100; f += 3) for (const seed of [1, 2]) {
    // From a standstill through the walk and the stop: the held offset changes while the lag builds and decays.
    const rows = replay({ hz, v, target: steady(f / 100, v, hz), seed, seconds: 4, stopAt: 2 });
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (a.held === b.held) assert.equal(b.at - a.at, Math.round(b.p) - Math.round(a.p), `${hz} Hz, ${v} px/s, frame ${i}`);
      // The held offset changes only when the smoothed offset leaves the hold (by 2-3 px in the first frames of a walk:
      // the player starts at full speed, the camera eases in, as before), or when the camera waits (motion rule).
      else assert.ok(Math.abs(b.camF - b.p - a.held) > CAMERA_HOLD && b.held === Math.round(b.camF - b.p) || b.raw === a.raw, `${hz} Hz, ${v} px/s, frame ${i}`);
    }
    for (const r of rows) assert.ok(Math.abs(r.at - Math.round(r.camF)) <= 1, `at ${r.at}, old ${Math.round(r.camF)}`);
  }
});

test('a camera held at a fractional map edge stays put; crossed bounds give one whole-pixel midpoint', () => {
  // Walking west into the west edge (lo = 10.4, e.g. a HUD-top bound): one value, today's Math.round(10.4).
  const edge = replay({ hz: 60, v: -112, target: -384 - 24, seed: 3, seconds: 3, lo: 10.4, hi: 5000, p0: 300.3 });
  assert.deepEqual([...new Set(edge.map(r => r.at))], [10]);
  // Control: clamping the float first and then snapping the offset wobbles between 10 and 11 with the player's fraction.
  const floatFirst = new Set(edge.map(r => Math.round(r.p) + Math.round(Math.max(10.4, r.camF) - r.p)));
  assert.deepEqual([...floatFirst].sort(), [10, 11]);
  // A view wider than the map (lo > hi): the midpoint, as today.
  const crossed = replay({ hz: 60, v: 112, target: -360, seed: 4, seconds: 2, lo: 30.7, hi: 20.2 });
  assert.deepEqual([...new Set(crossed.map(r => r.at))], [Math.round((30.7 + 20.2) / 2)]);
});

test('after stopping the camera settles monotonically within 1.2 s', () => {
  for (const hz of HZ) for (const v of SPEEDS) for (let f = 0; f < 100; f++) for (const seed of [1, 2, 3]) {
    // Target fractions sit .005 off the hold's edge: an offset exactly on it converges arbitrarily late (as with round(camF)).
    const rows = replay({ hz, v, target: -360 + (f + .5) / 100, seed, seconds: 4, stopAt: 2 });
    const i0 = rows.findIndex(r => r.t >= 2); let last = rows[i0].t;
    for (let i = i0 + 1; i < rows.length; i++) {
      const d = rows[i].at - rows[i - 1].at;
      assert.ok(d >= 0, `${hz} Hz, ${v} px/s, fraction ${f / 100}: the camera stepped back after the stop`);
      if (d) last = rows[i].t;
    }
    assert.ok(last - 2 <= 1.2, `${hz} Hz, ${v} px/s, fraction ${f / 100}: last step ${(last - 2).toFixed(3)} s after the stop`);
    assert.ok(Math.abs(rows.at(-1)!.camF - rows.at(-1)!.p - rows.at(-1)!.held) <= CAMERA_HOLD);
  }
});

test('a walk start, an aim flick against the walk and a stop never step the camera against the smoothed camera', () => {
  let against = 0, without = 0, runs = 0, runsWithout = 0;
  for (const hz of HZ) for (const v of SPEEDS) for (let f = 0; f < 100; f += 2) for (const seed of [1, 2, 3]) {
    // From a standstill; at 1 s the aim flicks behind the walk (the lead moves 48 px back); the player stops at 2 s.
    const run = { hz, v, target: -360 + f / 100, seed, seconds: 3.5, stopAt: 2, flick: { at: 1, by: -48 } };
    const count = (rows: Row[]) => rows.slice(1).filter((b, i) => b.at !== rows[i].at && Math.sign(b.at - rows[i].at) === -Math.sign(b.motion)).length;
    const rows = replay(run), n = count(rows);
    against += n; runs++;
    // Waiting never takes it further from the smoothed camera than the hold plus the player's half pixel.
    for (const r of rows) assert.ok(Math.abs(r.at - r.camF) <= CAMERA_HOLD + .5 + 1e-9, `${hz} Hz, ${v} px/s: at ${r.at}, smoothed ${r.camF.toFixed(2)}`);
    // Control: without the motion rule the held offset shrinks in whole px while the player advances in whole px, and
    // the ground steps back (Math.round(camF) never did).
    const m = count(replay({ ...run, motion: false })); without += m; if (m) runsWithout++;
  }
  assert.equal(against, 0, 'camera steps against the smoothed motion');
  assert.ok(runsWithout >= runs / 2 && without > runs, `control: ${without} back steps in ${runsWithout}/${runs} runs without the rule`);
});

test('snapAxis holds the whole-pixel offset within CAMERA_HOLD, rounds a fresh one and waits rather than step back', () => {
  const at = (r: ReturnType<typeof snapAxis>) => [r.at, r.held, r.raw];
  assert.deepEqual(at(snapAxis(100.2, 50.6, -1e9, 1e9)), [101, 50, 101], 'offset 49.6 rounds to 50 on the drawn player 51');
  assert.deepEqual(at(snapAxis(100.2, 50.6, -1e9, 1e9, { held: 49, raw: 100 })), [100, 49, 100], '0.6 from the held 49: kept');
  assert.deepEqual(at(snapAxis(100.4, 50.6, -1e9, 1e9, { held: 49, raw: 100 })), [101, 50, 101], '0.8 from the held 49: rounded again');
  assert.deepEqual(at(snapAxis(100.2, 50.6, -1e9, 1e9, { held: Number.NaN, raw: 0 })), [101, 50, 101], 'a non-finite hold is ignored');
  assert.deepEqual(at(snapAxis(100.2, 50.6, 120.4, 300)), [120, 50, 101], 'clamped to the rounded bound');
  // The player stepped from 50 to 51 while the offset fell from 50 to 48.4 (held 48): 51 + 48 = 99 would step back from
  // 100 while the smoothed camera moved forward, so the camera waits at 100 and the offset becomes 49.
  assert.deepEqual(at(snapAxis(99.4, 51, -1e9, 1e9, { held: 50, raw: 100 }, .2)), [100, 49, 100]);
  assert.deepEqual(at(snapAxis(99.4, 51, -1e9, 1e9, { held: 50, raw: 100 }, -.2)), [99, 48, 99], 'with the smoothed camera moving back it may step back');
  assert.deepEqual(at(snapAxis(99.4, 51, -1e9, 1e9, { held: 50, raw: 100 })), [99, 48, 99], 'no motion given: no rule');
});

test('aim look-ahead: half the old 48 x 34 by default; the right button keeps the old 1.7 x reach', () => {
  assert.deepEqual(AIM_LEAD, { x: 24, y: 17 });
  assert.deepEqual(aimLead(0, false), { x: 24, y: 0 });
  assert.equal(aimLead(Math.PI / 2, false).y, 17);
  assert.equal(aimLead(Math.PI, true).x, -81.6);
  assert.equal(aimLead(Math.PI / 2, true).y, 57.8);
  assert.ok(Math.abs(PRECISE_LEAD.x - 1.7 * 48) < 1e-9 && Math.abs(PRECISE_LEAD.y - 1.7 * 34) < 1e-9, 'precise reach unchanged');
});

test('aim look-ahead points along the aim, so easing toward it never turns the aim under a still pointer (PR #39)', () => {
  for (const precise of [false, true]) for (let k = 0; k < 64; k++) {
    const aim = -Math.PI + k * Math.PI / 32, l = aimLead(aim, precise), e = precise ? PRECISE_LEAD : AIM_LEAD;
    // Parallel to the aim, and as long as the ellipse reaches in that direction.
    assert.ok(Math.abs(l.x * Math.sin(aim) - l.y * Math.cos(aim)) < 1e-9, `${aim} ${precise}`);
    assert.ok(Math.abs((l.x / e.x) ** 2 + (l.y / e.y) ** 2 - 1) < 1e-9, `${aim} ${precise}`);
    // A pointer anywhere on the aim's ray stays on it when the camera moves by the lead: the angle is unchanged.
    const p = { x: Math.cos(aim) * 90, y: Math.sin(aim) * 90 }, moved = { x: p.x + l.x, y: p.y + l.y };
    assert.ok(Math.abs(Math.atan2(Math.sin(Math.atan2(moved.y, moved.x) - aim), Math.cos(Math.atan2(moved.y, moved.x) - aim))) < 1e-9);
  }
});

test('mouse look-ahead follows the pointer on screen, never the aim, so a still pointer keeps its aim (PR #39)', () => {
  // Without the right button the camera stays on the player; with it, along the pointer's offset, a share of its
  // distance capped by the precise ellipse in that direction.
  assert.deepEqual(pointerLead(120, 0, false), { m: 0, ux: 1, uy: 0 });
  const near = pointerLead(30, 0, true), far = pointerLead(0, 400, true), aimed = pointerLead(-300, -300, true);
  assert.ok(Math.abs(near.m - 10.5) < 1e-9 && near.ux === 1);
  assert.ok(Math.abs(far.m - 57.8) < 1e-9 && far.uy === 1, 'capped by the 81.6 x 57.8 ellipse vertically');
  assert.ok(Math.abs(aimed.m - aimLead(Math.atan2(-1, -1), true).x / Math.cos(Math.atan2(-1, -1))) < 1e-9);
  assert.deepEqual(pointerLead(0, 0, true), { m: 0, ux: 1, uy: 0 });
  // A step turns at once and eases only the length; turning keeps the old length's part along the new direction.
  const turned = stepLead({ m: 20, ux: 1, uy: 0 }, { m: 24, ux: 0, uy: 1 }, .5);
  assert.deepEqual(turned, { m: 12, ux: 0, uy: 1 });
  assert.deepEqual(stepLead({ m: 20, ux: 1, uy: 0 }, { m: 24, ux: -1, uy: 0 }, 0), { m: 0, ux: -1, uy: 0 });
  // The player is drawn behind the centring point by the lead; the pointer sits q ahead of it. Whatever length the lead
  // eases to, the pointer stays on the player's line through it: the aim does not move.
  for (const [qx, qy] of [[90, 10], [-40, 120], [300, -260], [5, -3]]) {
    const want = pointerLead(qx, qy, true), aim = (m: number) => Math.atan2(qy + m * want.uy, qx + m * want.ux);
    for (const m of [0, want.m * .3, want.m, want.m * 2]) assert.ok(Math.abs(aim(m) - Math.atan2(qy, qx)) < 1e-12);
  }
});

// #80 (found by the gunsmith M0-07 scope prototype): where the camera meets the map edge, the clamp held one axis of the
// precise look-ahead while the other kept easing, and a still pointer's aim turned for about a second (8.4 degrees at
// 1280 x 720 on the range's firing line). The replay below is scene.ts camera() and aimFromClient() for a standing
// player (the follow has settled) at the scale of 1280 x 720 (a 768 x 432 world px view at 5/3) and of 1920 x 1080
// (960 x 540 at 2), on the coast map (72 x 52 tiles, no margin past its edge) and on the resident building's second
// floor (12 x 10 tiles, 96 px margin, 40 more on top), which is narrower than the view: the camera's x stays at the
// midpoint there. Bounds as CoastView.camBounds gives them; `edge: false` is the old rule.
const COAST = { w: 2304, h: 1664, pad: 0 }, FLOOR = { w: 384, h: 320, pad: 96 };
const VIEWS = [{ name: '1280x720', w: 768, h: 432, s: 5 / 3 }, { name: '1920x1080', w: 960, h: 540, s: 2 }];
type View = typeof VIEWS[number];
type At = { x: number; y: number };
const boundsOf = (m: typeof COAST, v: View): CameraBounds => ({ x0: -m.pad, x1: m.w + m.pad - v.w, y0: -m.pad - (m.pad ? 40 : 0), y1: m.h + m.pad - v.h });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function edgeScene(view: View, player: At, edge = true, map = COAST) {
  const bd = boundsOf(map, view);
  const chest = { x: player.x, y: player.y - 22 }, camF = { x: chest.x - view.w / 2, y: chest.y - view.h / 2 };
  const clamp = (v: number, lo: number, hi: number) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  const want = (at: At) => pointerLead(at.x - view.w / 2, at.y - view.h / 2, true);
  const room = (w: Lead) => edge ? leadRoom(camF.x, camF.y, w.ux, w.uy, bd) : Infinity;
  const cam = (l: Lead) => ({ x: clamp(camF.x + l.m * l.ux, bd.x0, bd.x1), y: clamp(camF.y + l.m * l.uy, bd.y0, bd.y1) });
  const s = {
    bd, camF, lead: { m: 0, ux: 1, uy: 0 } as Lead,
    cam: () => cam(s.lead),
    /** The canvas point (world px) `r` css px from the drawn chest toward theta. */
    pointer(theta: number, r: number): At { const c = cam(s.lead); return { x: chest.x - c.x + Math.cos(theta) * r / view.s, y: chest.y - c.y + Math.sin(theta) * r / view.s }; },
    /** aimFromClient: through the camera this pointer is about to ask for. */
    aim(at: At) { const w = want(at), c = cam(stepLead(s.lead, w, 0, room(w))); return Math.atan2(at.y + c.y - chest.y, at.x + c.x - chest.x); },
    /** camera(): one 60 Hz frame of the look-ahead (the settled follow stays put). */
    frame(at: At) { const w = want(at); s.lead = stepLead(s.lead, w, 1 - Math.exp(-8 / 60), room(w)); },
  };
  return s;
}
/** test:shooting step a in the replay, right button held: settle on theta0, turn 45 degrees, then 90 more, and take the
 *  largest change of the aim over the 1.2 s after each turn. `each` sees every frame. */
function edgeDrift(s: ReturnType<typeof edgeScene>, theta0: number, r: number, each = () => {}) {
  let worst = 0, theta = theta0;
  const hold = (at: At, frames: number, a0?: number) => {
    for (let i = 0; i < frames; i++) { const a = s.aim(at); if (a0 !== undefined) worst = Math.max(worst, Math.abs(wrap(a - a0))); s.frame(at); each(); }
  };
  hold(s.pointer(theta, r), 120);
  for (const turn of [45, 90]) {
    theta += turn * Math.PI / 180;
    const at = s.pointer(theta, r);
    hold(at, 72, s.aim(at)); hold(at, 48);
  }
  return worst;
}
const SPOTS = (v: View) => [
  { name: 'firing line (the follow is held by the west edge)', at: { x: 208, y: 1104 }, map: COAST },
  { name: '24 px inside the edge', at: { x: v.w / 2 + 24, y: 1104 }, map: COAST },
  { name: 'open ground', at: { x: 1150, y: 1128 }, map: COAST },
  { name: 'middle of the resident second floor', at: { x: 192, y: 160 }, map: FLOOR },
];

test('the mouse look-ahead stops on the map edge, so a still pointer keeps its aim there as in open ground (#80)', () => {
  for (const v of VIEWS) for (const spot of SPOTS(v)) {
    let worst = 0, control = 0;
    for (const r of [100, 300]) for (let d = 0; d < 360; d += 15) {
      const s = edgeScene(v, spot.at, true, spot.map);
      // The camera never rests on a bound with a look-ahead on it: the clamp never holds an axis of the look-ahead.
      worst = Math.max(worst, edgeDrift(s, d * Math.PI / 180, r, () => {
        if (s.lead.m === 0) return;
        const x = s.camF.x + s.lead.m * s.lead.ux, y = s.camF.y + s.lead.m * s.lead.uy;
        assert.ok(x >= s.bd.x0 - 1e-9 && x <= s.bd.x1 + 1e-9 && y >= s.bd.y0 - 1e-9 && y <= s.bd.y1 + 1e-9, `${v.name} ${spot.name}: look-ahead past the edge`);
      }));
      control = Math.max(control, edgeDrift(edgeScene(v, spot.at, false, spot.map), d * Math.PI / 180, r));
    }
    assert.ok(worst < 1e-9, `${v.name}, ${spot.name}: the aim turned ${worst} rad under a still pointer`);
    // Control: the old rule turns it wherever an edge holds the camera, never in open ground. Over these 48 cases the
    // replay's worst at 1280 x 720 / 1920 x 1080 is 16.3 / 3.9 degrees on the firing line, 3.9 / 3.1 degrees 24 px inside
    // the edge and 8.2 / 7.3 degrees on the resident floor. For test:shooting a-edge's first case (from 0 degrees, 300 px)
    // it gives 8.47 / 3.69 degrees, where the browser measured 8.47 / 3.64-3.74 on main f73e9de.
    if (spot.name === 'open ground') assert.ok(control < 1e-9, `${v.name}: open ground control ${control}`);
    else assert.ok(control > .05, `${v.name}, ${spot.name}: control only ${(control * 180 / Math.PI).toFixed(2)} degrees`);
  }
});

test('open ground keeps the #39 look-ahead bit for bit; inside the edge it reaches the edge and stops there', () => {
  for (const v of VIEWS) {
    // Open ground: the same lengths and camera, frame by frame, with and without the edge rule.
    const now = edgeScene(v, { x: 1150, y: 1128 }), old = edgeScene(v, { x: 1150, y: 1128 }, false);
    const seen: Lead[] = [], seenOld: Lead[] = [];
    for (let d = 0; d < 360; d += 30) { edgeDrift(now, d * Math.PI / 180, 300, () => seen.push(now.lead)); edgeDrift(old, d * Math.PI / 180, 300, () => seenOld.push(old.lead)); }
    assert.deepEqual(seen, seenOld);
    assert.ok(Math.max(...seen.map(l => l.m)) > 60, 'open ground looks ahead');
    // 24 px inside the west edge, the pointer far out to the north-west (the last turn of the drift case from south): the
    // look-ahead carries the camera onto the edge and stops there, 24 px west, shorter than the length it asks for.
    const s = edgeScene(v, { x: v.w / 2 + 24, y: 1104 }), free = edgeScene(v, { x: v.w / 2 + 24, y: 1104 }, false);
    edgeDrift(s, Math.PI / 2, 300); edgeDrift(free, Math.PI / 2, 300);
    assert.ok(Math.abs(s.cam().x - s.bd.x0) < 1e-3, `${v.name}: the camera stopped at x ${s.cam().x}`);
    assert.ok(Math.abs(s.lead.m * s.lead.ux + 24) < 1e-3 && s.lead.uy < 0, `${v.name}: look-ahead ${JSON.stringify(s.lead)}`);
    assert.ok(s.lead.m < free.lead.m - 10, `${v.name}: ${s.lead.m} px, the old rule ${free.lead.m}`);
    // On the firing line the follow camera is already held by the edge: no room, so no look-ahead at all.
    const line = edgeScene(v, { x: 208, y: 1104 });
    edgeDrift(line, 0, 300, () => assert.equal(line.lead.m, 0));
  }
});

test('leadRoom: the length a look-ahead may take before the camera meets a bound, fading near the bounds', () => {
  const b: CameraBounds = { x0: 0, x1: 1536, y0: 0, y1: 1232 };
  assert.equal(EDGE_FADE, 3);
  assert.equal(leadRoom(700, 700, 1, 0, b), 836, 'far from the bounds: up to the bound along the line');
  assert.ok(leadRoom(700, 700, .6, .8, b) > PRECISE_LEAD.x, 'open ground never limits the look-ahead');
  assert.equal(leadRoom(24, 866, -1, 0, b), 24);
  assert.ok(Math.abs(leadRoom(24, 866, -.6, -.8, b) - 40) < 1e-12, 'the nearer bound along the line');
  assert.ok(Math.abs(leadRoom(24, 20, -.6, -.8, b) - 25) < 1e-12, 'whichever axis meets its bound first');
  // 24 px from the west bound, any look-ahead keeps 3 x 24 px at most, also along the edge and away from it.
  assert.equal(leadRoom(24, 866, 1, 0, b), 72);
  assert.equal(leadRoom(24, 866, 0, -1, b), 72);
  assert.equal(leadRoom(0, 866, -1, 0, b), 0, 'on the bound, looking out');
  assert.equal(leadRoom(0, 866, 1, 0, b), 0, 'on the bound, looking in');
  // A follow camera beyond a bound (the player drawn off centre) leaves no room in any direction, along the edge too.
  for (const [ux, uy] of [[1, 0], [0, 1], [0, -1], [.6, .8], [-1, 0]]) assert.equal(leadRoom(-176, 866, ux, uy, b), 0);
  // A view wider than the map (the camera held at the midpoint) leaves none either.
  assert.equal(leadRoom(10, 866, 0, 1, { x0: 30, x1: 20, y0: 0, y1: 1232 }), 0);
});

test('walking toward the edge with the right button held, the look-ahead runs out smoothly instead of dropping at once', () => {
  // The plain stop at the edge (no EDGE_FADE), for the control: no room once the follow camera reaches a bound.
  const plain = (fx: number, fy: number, ux: number, uy: number, b: CameraBounds) => {
    const axis = (f: number, u: number, lo: number, hi: number) => !(f >= lo && f <= hi) ? 0 : u > 0 ? (hi - f) / u : u < 0 ? (f - lo) / -u : Infinity;
    return Math.min(axis(fx, ux, b.x0, b.x1), axis(fy, uy, b.y0, b.y1));
  };
  /** Largest camera step (world px) in one 60 Hz frame while the player walks west from x 900 to the firing line, the
   *  pointer still on screen 300 css px from the centring point toward `deg`, the look-ahead settled before the walk. */
  const walk = (v: View, deg: number, speed: number, room: typeof leadRoom) => {
    const bd = boundsOf(COAST, v), k = 1 - Math.exp(-8 / 60), chestY = 1104 - 22;
    const want = pointerLead(Math.cos(deg * Math.PI / 180) * 300 / v.s, Math.sin(deg * Math.PI / 180) * 300 / v.s, true);
    const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
    let px = 900, camF = { x: px - v.w / 2, y: chestY - v.h / 2 }, lead: Lead = { m: 0, ux: 1, uy: 0 }, last: At | null = null, worst = 0;
    for (let i = 0; i < 60 * 12; i++) {
      if (i >= 120) px = Math.max(208, px - speed / 60);
      camF = { x: camF.x + (px - v.w / 2 - camF.x) * k, y: camF.y + (chestY - v.h / 2 - camF.y) * k };
      lead = stepLead(lead, want, k, room(camF.x, camF.y, want.ux, want.uy, bd));
      const cam = { x: clamp(camF.x + lead.m * lead.ux, bd.x0, bd.x1), y: clamp(camF.y + lead.m * lead.uy, bd.y0, bd.y1) };
      if (last && i > 120) worst = Math.max(worst, Math.hypot(cam.x - last.x, cam.y - last.y));
      last = cam;
    }
    assert.equal(lead.m, 0, 'no look-ahead left on the firing line');
    return worst;
  };
  for (const v of VIEWS) for (const speed of [78.4, 112, 190]) for (let deg = 0; deg < 360; deg += 30) {
    // The follow camera moves at most speed / 60 a frame and the look-ahead shrinks at most EDGE_FADE times as fast.
    const step = walk(v, deg, speed, leadRoom), most = (1 + EDGE_FADE) * speed / 60;
    assert.ok(step <= most + 1e-9, `${v.name}, ${speed} px/s, pointer at ${deg} degrees: the camera stepped ${step.toFixed(2)} px (most ${most.toFixed(2)})`);
    // Control: the plain stop drops the whole look-ahead in one frame unless the pointer looks at the edge it walks into.
    const control = walk(v, deg, speed, plain);
    if (deg < 90 || deg > 270) assert.ok(control > 40, `${v.name}, ${speed} px/s, ${deg} degrees: control stepped only ${control.toFixed(1)} px`);
  }
});

test('stepLead: no room keeps #39 bit for bit; the room caps the eased length and the length a turn keeps at once', () => {
  // The #39 step (main f73e9de), for the bit-for-bit comparison.
  const old = (prev: Lead, want: Lead, k: number) => { const along = Math.max(0, prev.ux * want.ux + prev.uy * want.uy) * prev.m; return { m: along + (want.m - along) * k, ux: want.ux, uy: want.uy }; };
  const r = rng(80), dir = () => { const a = r() * 2 * Math.PI; return { ux: Math.cos(a), uy: Math.sin(a) }; };
  for (let i = 0; i < 20000; i++) {
    const prev = { m: r() * 90, ...dir() }, want = { m: r() * 90, ...dir() }, k = i % 7 ? r() : 0;
    assert.deepEqual(stepLead(prev, want, k), old(prev, want, k));
    // A room the step does not reach changes nothing either (open ground).
    assert.deepEqual(stepLead(prev, want, k, 90 + r() * 1e4), old(prev, want, k));
  }
  const east = { ux: 1, uy: 0 };
  assert.deepEqual(stepLead({ m: 0, ...east }, { m: 60, ...east }, .5, 20), { m: 10, ...east }, 'eases toward the room, not past it');
  assert.deepEqual(stepLead({ m: 50, ...east }, { m: 60, ...east }, .5, 20), { m: 20, ...east }, 'a length over the room drops to it at once');
  assert.deepEqual(stepLead({ m: 50, ...east }, { m: 10, ...east }, .5, 20), { m: 15, ...east }, 'and eases on from there');
  assert.deepEqual(stepLead({ m: 50, ux: 0, uy: 1 }, { m: 60, ...east }, .5, 0), { m: 0, ...east }, 'no room, no look-ahead');
});
