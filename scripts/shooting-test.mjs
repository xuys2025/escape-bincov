/**
 * Shooting alignment on the 2.5D raid host (PR #39 S1), with real mouse and touch input. Fixtures only place the player,
 * hand weapons and freeze enemies. Each step reads the host's published batches through a wrapped frame() and the
 * view's own drawing (weapon sprite transform, muzzle-flash sprites, tracer Graphics instructions, spark particles).
 *   a. a still pointer keeps the published aim while the camera eases (45 and 90 degree moves, 100 and 300 px, hip and precise);
 *      a-edge: the same with precise aim at the map's west edge (#80), at 1280x720 and 1920x1080, where the look-ahead
 *      must stop on the edge (the range's firing line, where the follow camera is held, and 24 px inside the edge);
 *   b. firing with a still pointer does not move the aim (pistol, shotgun, carbine);
 *   c. eight directions x pistol, shotgun, carbine, sample M4A1: the flash sits on the barrel tip read from the weapon art
 *      through the sprite's transform, and tracers leave that tip (their line passes it, they never start behind it);
 *   d. flush against a wall, a closed door and a convex corner: the bullet stops at the surface ('blocked', never
 *      'start-blocked') where an independent grid walk from the body puts it, and a revealed impact shows sparks;
 *   e. a salt firing out of an unrevealed room draws no tracer pixel over that room;
 *   f. fire modes: a held mouse fires a pistol once and the M4A1 every 0.1 s; a held touch stick repeats the pistol; the
 *      inner ring never fires and precise aim stays off on touch;
 *   g. a blow's flash and kick on an enemy are drawn from the hit's own frame (#75), on as many frames as before at 60,
 *      30 and 15 frames a second and on one at 12 and 10; the kick goes 2 px the way the bullet flew (east and south) and
 *      the blood sprays back toward the shooter; the enemy's body shows its hurt frame, then its recovery frame;
 *   h. on the host, a critical hit turns the hit marker critical and a kill of that target keeps it; every kill marker
 *      asks for one kill confirm sound.
 * Waits use raid time or published state; a stall pause resumed during a step (slow software GL) repeats that step.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls, running, stallResumes } from './stall-resume.mjs';

const { values } = parseArgs({ options: { entry: { type: 'string', default: 'dist/index.html' }, filter: { type: 'string', default: '' }, report: { type: 'string', default: 'shooting' } } });
const out = resolve('test-results', values.report);
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { startedAt: new Date().toISOString(), browser: browser.version(), entry: values.entry,
  method: 'Offline Chromium, real CDP mouse (1280x720) and multi-touch (844x390, DPR 2) on the 2.5D raid host, seed 42, layered coast map. Fixtures place the player and enemies, hand weapons and freeze AI.',
  steps: [] };
const AIM_H = 22, TILE = 32, HOME = { x: 700, y: 784 };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const r3 = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const max = a => a.reduce((m, x) => Math.max(m, x), 0);

/* ---------------------------------------------------------------- page side ---------------------------------------------------------------- */

/** Wrap the host's frame() to record each published batch after it is drawn, and the view's spark and impact-sound calls. */
function install() {
  if (window.__shoot) return;
  const h = window.__bincovSample.host, P = window.__shoot = { rec: false, watch: false, log: [], key: '', since: null, quiet: 0, t: 0, sparks: [], sounds: [] };
  const tracer = g => {
    let stroke = null, rect = null;
    for (const i of g.context?.instructions ?? []) for (const q of i.data?.path?.instructions ?? []) {
      if (i.action === 'stroke' && q.action === 'moveTo') stroke = [q.data[0], q.data[1]];
      else if (i.action === 'stroke' && q.action === 'lineTo' && stroke) stroke.push(q.data[0], q.data[1]);
      else if (i.action === 'fill' && q.action === 'rect') rect = [q.data[0], q.data[1]];
    }
    return { stroke: stroke?.length === 4 ? stroke : null, rect };
  };
  const frame = Object.getPrototypeOf(h).frame;
  h.frame = function () {
    frame.call(this);
    const b = this.last; if (!b) return;
    const f = b.frame, p = f.player, v = this.view;
    P.t = b.stamp.simulationTime;
    const key = `${p.aim}|${v.cam.x}|${v.cam.y}|${p.x}|${p.y}`;
    if (key !== P.key) { P.key = key; P.since = P.t; P.quiet = 0; } else P.quiet++;
    for (const s of P.sparks) if (s.visible === undefined) s.visible = s.parts.some(q => q.s.visible);
    if (!P.rec) return;
    const ptr = this.input.pointer;
    const row = { t: P.t, rev: b.stamp.revision, phase: f.phase, stalls: window.__stallResumes ?? 0, ptr: { x: ptr.x, y: ptr.y },
      cam: { x: v.cam.x, y: v.cam.y }, lead: v.camF.lead?.m ?? 0,
      p: { x: p.x, y: p.y, aim: p.aim, precise: p.state.precise, weapon: p.weapon }, hudAim: f.hud.aim ? { ...f.hud.aim } : null, revealed: { ...f.revealed },
      ev: b.events.filter(e => e.type === 'shot' || e.type === 'impact').map(e => { const { stamp, ...rest } = e; return JSON.parse(JSON.stringify(rest)); }),
      bl: f.bullets.map(q => ({ uid: q.uid, x: q.x, y: q.y, vx: q.vx, vy: q.vy, enemy: q.enemy })) };
    if (P.watch) {
      const w = v.actors.get('player')?.weapon;
      row.gun = w ? { x: w.x, y: w.y, rot: w.rotation, sx: w.scale.x, sy: w.scale.y, ax: w.anchor.x, ay: w.anchor.y, tw: w.texture.width, th: w.texture.height } : null;
      row.muzzles = v.muzzles.map(m => ({ x: m.s.x, y: m.s.y, t: m.t }));
      row.tracers = [...v.bullets].map(([uid, e]) => ({ uid, visible: e.g.visible, ...tracer(e.g) }));
    }
    P.log.push(row);
  };
  const fx = h.view.fx, sparks = fx.sparks;
  fx.sparks = function (...a) { const n = this.live.length, r = sparks.apply(this, a); P.sparks.push({ x: a[0], y: a[1], parts: this.live.slice(n), t: P.t }); return r; };
  // The raid time last published when a button or finger is released: no shot of a later batch may follow it.
  for (const type of ['mouseup', 'pointerup']) addEventListener(type, () => { P.released ??= h.lastBatch?.stamp.simulationTime ?? null; }, true);
  const sound = h.sound.out, impact = sound.impact;
  sound.impact = function (...a) { P.sounds.push({ k: 'impact', t: P.t }); return impact.apply(this, a); };
}
/** Barrel tip of a held weapon's art, independently of the view: right edge of the last column with any opaque pixel,
 *  at the middle of that column's opaque rows (texture px). */
function barrelTip(look) {
  const c = window.__bincovSample.host.view.tex.canvas(`weapon:${look}:#4a463c`), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let x = c.width - 1; x >= 0; x--) {
    const rows = []; for (let y = 0; y < c.height; y++) if (d[(y * c.width + x) * 4 + 3] > 0) rows.push(y);
    if (rows.length) return { u: x + 1, v: (rows[0] + rows.at(-1) + 1) / 2, w: c.width, h: c.height };
  }
  throw new Error(`Empty weapon art: ${look}`);
}

/* ---------------------------------------------------------------- node helpers ---------------------------------------------------------------- */

const drive = (page, name, ...args) => page.evaluate(([n, a]) => window.__bincovSample.driver[n](...a), [name, args]);
const simTime = page => page.evaluate(() => window.__bincovSample.host.lastBatch.stamp.simulationTime);
const waitRaid = async (page, seconds, from) => { const t = from ?? await simTime(page);
  await page.waitForFunction(([t, s]) => window.__bincovSample.host.lastBatch.stamp.simulationTime >= t + s, [t, seconds], { polling: 'raf', timeout: 60000 }); };
/** Aim, camera and body unchanged for `quiet` seconds of raid time and at least four frames, counted from now. */
async function settle(page, quiet = .5) {
  await page.evaluate(() => { const P = window.__shoot; P.key = ''; P.since = null; P.quiet = 0; });
  await page.waitForFunction(q => { const P = window.__shoot; return P.since !== null && P.t - P.since >= q && P.quiet >= 4; }, quiet, { polling: 'raf', timeout: 60000 });
}
const rec = (page, watch = false) => page.evaluate(w => { const P = window.__shoot; P.log = []; P.rec = true; P.watch = w; P.released = null; }, watch);
const released = page => page.evaluate(() => window.__shoot.released);
const stop = page => page.evaluate(() => { const P = window.__shoot; P.rec = P.watch = false; const l = P.log; P.log = []; return l; });
/** Published aim and the player's chest on screen. */
const state = page => page.evaluate(() => { const h = window.__bincovSample.host, p = h.lastBatch.frame.player; return { aim: p.aim, chest: h.view.worldToClient({ x: p.x, y: p.y - 22 }) }; });
const onCanvas = (page, pt) => page.evaluate(pt => document.elementFromPoint(pt.x, pt.y)?.tagName === 'CANVAS', pt);
const shotsOf = (log, shooter = 'player') => log.flatMap(r => r.ev.filter(e => e.type === 'shot' && e.shooter === shooter).map(e => ({ ...e, t: r.t, rev: r.rev })));
const touch = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, radiusX: 2, radiusY: 2, force: 1 })) });
/** Put the pointer on the chest-plane point at `theta`, `d` world px out, until the published aim is within `tol`. */
async function aimAt(page, theta, d = 110, tol = .02) {
  let st;
  for (let i = 0; i < 6; i++) {
    const target = await page.evaluate(([th, d]) => { const h = window.__bincovSample.host, p = h.lastBatch.frame.player, q = h.view.worldToClient({ x: p.x + Math.cos(th) * d, y: p.y - 22 + Math.sin(th) * d }); return { x: Math.round(q.x), y: Math.round(q.y) }; }, [theta, d]);
    assert.ok(await onCanvas(page, target), `aim point ${JSON.stringify(target)} is covered`);
    await page.mouse.move(target.x, target.y); await settle(page, .35);
    st = await state(page);
    if (Math.abs(wrap(st.aim - theta)) < tol) break;
  }
  return st;
}
/** Steady hands: sway and bloom of the held gun have recovered (published hud.aim). */
const steady = page => page.waitForFunction(() => { const a = window.__bincovSample.host.lastBatch.frame.hud.aim; return !a || (a.sway < .05 && a.bloom < .05 && a.raise <= 1); }, null, { polling: 'raf', timeout: 30000 });

async function context(name, options) {
  const touchCtx = !!options.hasTouch;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, ...options });
  await resumeStalls(ctx);
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  ctx.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await page.goto(pathToFileURL(resolve(values.entry)).href + '?test=1&entry=tabs');
  const act = n => page.locator(`[data-action="${n}"]`);
  if (touchCtx) await act('enter').tap({ timeout: 60000 }); else await act('enter').click({ timeout: 60000 });
  await page.locator('#seed').fill('42');
  if (touchCtx) await act('deploy').tap(); else await act('deploy').click();
  // A phone viewport on a software renderer can take over a minute to deploy and draw its first running frame.
  await page.waitForFunction(() => window.__bincovSample?.host?.lastBatch && !window.__bincovSample.host.panel && window.__bincovSample.host.lastBatch.frame.phase === 'running', null, { timeout: 120000 });
  await page.evaluate(install);
  await drive(page, 'freezeAI', true);
  const maxHp = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.hud.maxHp);
  await drive(page, 'vitals', { hp: maxHp, bleeding: false, pollution: 0 });
  await place(page, HOME);
  return { name, ctx, page, cdp: await ctx.newCDPSession(page), errors, requests };
}
async function place(page, point, angle = 0, map = 'coast') {
  await drive(page, 'placePlayer', point, angle, map);
  await page.waitForFunction(([x, y]) => { const p = window.__bincovSample.host.lastBatch.frame.player; return Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6; }, [point.x, point.y]);
  await running(page);
}
async function step(id, name, c, fn) {
  if (values.filter && !new RegExp(values.filter).test(id)) return;
  const entry = { id, name, status: 'running' }; report.steps.push(entry);
  const t0 = Date.now();
  for (let attempt = 1; ; attempt++) {
    const stalls = await stallResumes(c.page);
    try {
      entry.detail = await fn(c.page, c);
      assert.deepEqual(c.errors, [], 'page errors'); assert.deepEqual(c.requests, [], 'network requests');
      entry.status = 'passed'; console.log('PASS', id, name);
      break;
    } catch (error) {
      // A stall pause resumed meanwhile releases held buttons and sticks: that attempt measured nothing. Repeat it (twice at most).
      const stalled = (await stallResumes(c.page)) !== stalls;
      if (stalled && attempt < 3) { entry.stallRetries = attempt; await running(c.page); continue; }
      entry.status = 'failed'; entry.error = error.message; entry.detail ??= error.detail;
      console.error('FAIL', id, name, error.message.split('\n')[0]);
      break;
    } finally {
      await c.page.mouse.up({ button: 'right' }).catch(() => {}); await c.page.mouse.up().catch(() => {});
      if (c.touch) await touch(c.cdp, 'touchEnd', []).catch(() => {});
    }
  }
  entry.seconds = r3((Date.now() - t0) / 1000, 1);
  await save();
}
/** Fail with the measured numbers attached to the step. */
function check(ok, message, detail) { if (!ok) { const e = new Error(message); e.detail = detail; throw e; } }
const save = () => writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');

/* ---------------------------------------------------------------- the steps ---------------------------------------------------------------- */

/** Step a's moves: the pointer `radius` css px from the chest at theta0, then turned 45 and 90 degrees more, with the right
 *  button held for precise aim. After each turn the published aim is recorded for 1.2 s of raid time from the first frame
 *  that read the new pointer; each case ends with the camera and the look-ahead (world px) its last frame drew. */
async function turnsAt(page, precise, radius, theta0 = 0) {
  const cases = [];
  if (precise) await page.mouse.down({ button: 'right' });
  let theta = theta0;
  for (const turn of [0, 45, 90]) {
    theta += turn * Math.PI / 180;
    const before = await state(page), target = { x: Math.round(before.chest.x + Math.cos(theta) * radius), y: Math.round(before.chest.y + Math.sin(theta) * radius) };
    assert.ok(await onCanvas(page, target), `pointer target covered: ${JSON.stringify(target)}`);
    if (turn) await rec(page);
    await page.mouse.move(target.x, target.y);
    if (turn) {
      await page.waitForFunction(([x, y]) => window.__shoot.log.some(r => Math.abs(r.ptr.x - x) < .01 && Math.abs(r.ptr.y - y) < .01), [target.x, target.y], { polling: 'raf' });
      const t0 = await page.evaluate(([x, y]) => window.__shoot.log.find(r => Math.abs(r.ptr.x - x) < .01 && Math.abs(r.ptr.y - y) < .01).t, [target.x, target.y]);
      await waitRaid(page, 1.2, t0);
      const log = (await stop(page)).filter(r => Math.abs(r.ptr.x - target.x) < .01 && Math.abs(r.ptr.y - target.y) < .01);
      const drift = max(log.map(r => Math.abs(wrap(r.p.aim - log[0].p.aim))));
      cases.push({ precise, radius, turnDeg: turn, toDeg: r3(theta * 180 / Math.PI, 1), aimAtStopDeg: r3(log[0].p.aim * 180 / Math.PI, 3), seconds: r3(log.at(-1).t - log[0].t, 3),
        maxDriftRad: r3(drift, 5), maxDriftDeg: r3(drift * 180 / Math.PI, 2), camEnd: log.at(-1).cam, leadEnd: r3(log.at(-1).lead, 2) });
    }
    await settle(page);
  }
  if (precise) { await page.mouse.up({ button: 'right' }); await settle(page); }
  return cases;
}

/** a. A still pointer: the camera eases after the move, the published aim must not. */
async function stillPointer(page) {
  const cases = [];
  for (const precise of [false, true]) for (const radius of [100, 300]) cases.push(...await turnsAt(page, precise, radius));
  const worst = cases.reduce((m, c) => c.maxDriftRad > m.maxDriftRad ? c : m);
  check(worst.maxDriftRad <= .01, `aim turned ${worst.maxDriftRad} rad (${worst.maxDriftDeg} deg) under a still pointer`, { cases });
  return { cases };
}

/**
 * a-edge. Step a's precise moves where the camera meets the map's west edge (#80, found by the gunsmith M0-07 prototype).
 * There the clamp held one axis of the look-ahead while the other kept easing and turned the aim under a still pointer
 * (main f73e9de on the range's firing line: 8.47 degrees at 1280x720, 3.6-3.7 at 1920x1080); the look-ahead now stops on
 * the edge. Both desktop sizes, step a's 300 px moves (the 100 px ones turned the aim by at most 2.9 degrees there), on two
 * spots of the range's street: the firing line, where the follow camera is already held by the edge (no room, so no
 * look-ahead), and 24 px inside the edge, where the moves toward it must carry the camera onto the edge and stop there.
 * Without the right button there is no look-ahead, so hip aim is step a's alone.
 */
async function stillPointerAtEdge(page) {
  const cases = [], line = { x: 208, y: 1104 }; // FIRING_LINE in src/range/raid.ts: the same seed 42 coast map
  try {
    for (const [width, height] of [[1280, 720], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(w => window.__bincovSample.host.view.view.W === w, width);
      await running(page);
      const w = await page.evaluate(() => window.__bincovSample.host.view.view.w);
      for (const spot of [{ name: 'firing line', at: line, theta0: 0 }, { name: '24 px inside the edge', at: { x: w / 2 + 24, y: line.y }, theta0: Math.PI / 2 }]) {
        await place(page, spot.at, 0); await settle(page);
        // The follow camera's left edge against the map's (CoastView.camBounds): negative while the edge holds it.
        const followX = await page.evaluate(() => { const v = window.__bincovSample.host.view; return v.camF.x - v.camBounds().x0; });
        for (const c of await turnsAt(page, true, 300, spot.theta0)) cases.push({ size: `${width}x${height}`, spot: spot.name, followX: r3(followX, 2), ...c });
      }
    }
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForFunction(() => window.__bincovSample.host.view.view.W === 1280);
    await place(page, HOME); await settle(page);
  }
  const worst = cases.reduce((m, c) => c.maxDriftRad > m.maxDriftRad ? c : m);
  check(worst.maxDriftRad <= .01, `aim turned ${worst.maxDriftRad} rad (${worst.maxDriftDeg} deg) under a still pointer at the edge (${worst.size} ${worst.spot}, ${worst.radius} px to ${worst.toDeg} deg)`, { cases });
  // The spots must stay where the edge holds the camera, or this would pass in open ground.
  const off = cases.filter(c => c.spot === 'firing line' ? !(c.followX < -100 && c.camEnd.x === 0) : !(c.followX > 20 && c.followX < 28 && c.camEnd.x === 0 && c.leadEnd > 10));
  check(!off.length, `${off.length} cases not at the edge (firing line: follow camera beyond it, camera on it; 24 px inside: the moves end on it with a look-ahead)`, { cases, off });
  return { cases };
}

/** b. Firing with a still pointer: recoil kick and shake are drawing only. */
async function kickKeepsAim(page) {
  const cases = [];
  for (const gun of ['pistol', 'shotgun', 'carbine']) {
    await drive(page, 'weapon', gun);
    await aimAt(page, Math.PI / 6, 120); await settle(page);
    const before = await state(page);
    await rec(page); await page.mouse.down(); await page.mouse.up(); await waitRaid(page, .6);
    const log = await stop(page);
    check(shotsOf(log).length === 1, `${gun}: expected one shot`, { shots: shotsOf(log).length });
    cases.push({ gun, maxAimChangeRad: max(log.map(r => Math.abs(wrap(r.p.aim - before.aim)))) });
  }
  const worst = cases.reduce((m, c) => c.maxAimChangeRad > m.maxAimChangeRad ? c : m);
  check(worst.maxAimChangeRad < 1e-3, `${worst.gun}: firing moved the aim ${worst.maxAimChangeRad} rad`, { cases });
  return { cases };
}

/** c. Flash on the drawn barrel tip; tracers leave that tip. */
async function muzzleAndTracers(page) {
  const cases = [], tips = {};
  const guns = [['pistol', null], ['shotgun', null], ['carbine', null], ['m4a1', 'm4a1']];
  for (let k = 0; k < 8; k++) {
    const theta = wrap(k * Math.PI / 4);
    await drive(page, 'sampleGun', null); await drive(page, 'weapon', 'pistol');
    await aimAt(page, theta, 110);
    for (const [gun, sample] of guns) {
      await drive(page, 'sampleGun', null);
      if (sample) await drive(page, 'sampleGun', sample); else await drive(page, 'weapon', gun);
      await steady(page); await settle(page, .2);
      await rec(page, true); await page.mouse.down(); await page.mouse.up();
      await page.waitForFunction(() => window.__shoot.log.some(r => r.ev.some(e => e.type === 'shot' && e.shooter === 'player')), null, { polling: 'raf' });
      const uids = await page.evaluate(() => window.__shoot.log.flatMap(r => r.ev).find(e => e.type === 'shot' && e.shooter === 'player').pellets.map(p => p.bullet));
      // Until every pellet's tracer has been drawn once, or its bullet has ended.
      await page.waitForFunction(uids => uids.every(u => window.__shoot.log.some(r => r.tracers?.some(q => q.uid === u && q.visible && (q.stroke || q.rect)))
        || window.__shoot.log.some(r => r.ev.some(e => e.type === 'impact' && e.bullet === u))), uids, { polling: 'raf', timeout: 20000 });
      const log = await stop(page);
      const i = log.findIndex(r => r.ev.some(e => e.type === 'shot' && e.shooter === 'player')), row = log[i], g = row.gun;
      const look = row.p.weapon; tips[look] ??= await page.evaluate(barrelTip, look);
      const t = tips[look], c = Math.cos(g.rot), s = Math.sin(g.rot);
      const lx = (t.u - g.ax * g.tw) * g.sx, ly = (t.v - g.ay * g.th) * g.sy;
      const tip = { x: g.x + lx * c - ly * s, y: g.y + lx * s + ly * c };
      const flash = row.muzzles.reduce((m, q) => !m || q.t < m.t ? q : m, null);
      const flashToTip = flash ? Math.hypot(flash.x - tip.x, flash.y - tip.y) : Infinity;
      const flashToDesign = flash ? Math.hypot(flash.x - (tip.x + 1.5 * c), flash.y - (tip.y + 1.5 * s)) : Infinity;
      const pellets = uids.map(uid => {
        const first = log.slice(i).map(r => r.tracers?.find(q => q.uid === uid)).find(q => q && q.visible && (q.stroke || q.rect));
        if (!first) return { uid, drawn: false };
        // The drawn tracer: tail (moveTo) to head (lineTo), or the head pixel alone. Its line through the head, extended to
        // the barrel: how far it passes from the tip, and where along it the tracer starts relative to the tip.
        const head = first.stroke ? { x: first.stroke[2], y: first.stroke[3] } : { x: first.rect[0], y: first.rect[1] };
        const tail = first.stroke ? { x: first.stroke[0], y: first.stroke[1] } : head;
        const b = log.flatMap(r => r.bl).find(q => q.uid === uid), v = Math.hypot(b.vx, b.vy);
        const len = Math.hypot(head.x - tail.x, head.y - tail.y), u = len > 1e-6 ? { x: (head.x - tail.x) / len, y: (head.y - tail.y) / len } : { x: b.vx / v, y: b.vy / v };
        return { uid, drawn: true, offTipPx: r3(Math.abs((tip.x - head.x) * -u.y + (tip.y - head.y) * u.x), 2), startsBeyondTipPx: r3((tail.x - tip.x) * u.x + (tail.y - tip.y) * u.y, 2),
          spreadRad: r3(wrap(Math.atan2(b.vy, b.vx) - g.rot), 4) };
      });
      cases.push({ gun, dirDeg: k * 45, look, aimDeg: r3(row.p.aim * 180 / Math.PI, 2), gunDeg: r3(g.rot * 180 / Math.PI, 2), cone: r3(row.hudAim?.cone ?? NaN, 4),
        tip: { x: r3(tip.x, 2), y: r3(tip.y, 2) }, flash, flashToTipPx: r3(flashToTip, 2), flashToDesignPx: r3(flashToDesign, 2), pellets });
    }
  }
  await drive(page, 'sampleGun', null); await drive(page, 'weapon', 'pistol');
  const all = cases.flatMap(c => c.pellets.map(p => ({ ...p, gun: c.gun, dirDeg: c.dirDeg })));
  const summary = Object.fromEntries(guns.map(([gun]) => {
    const cs = cases.filter(c => c.gun === gun), ps = all.filter(p => p.gun === gun && p.drawn);
    return [gun, { flashToTipMaxPx: max(cs.map(c => c.flashToTipPx)), flashToDesignMaxPx: max(cs.map(c => c.flashToDesignPx)),
      tracerOffTipMaxPx: max(ps.map(p => p.offTipPx)), tracerStartBehindTipMaxPx: max(ps.map(p => -p.startsBeyondTipPx)), undrawn: all.filter(p => p.gun === gun && !p.drawn).length }];
  }));
  const fail = [];
  for (const c of cases) {
    // The flash is drawn 1.5 px beyond the tip on a whole pixel (up to 0.71 px rounding): 2 px plus that rounding.
    if (!(c.flashToTipPx <= 2.25)) fail.push(`${c.gun} ${c.dirDeg}deg flash ${c.flashToTipPx} px from the tip`);
    for (const p of c.pellets) {
      if (!p.drawn) continue;
      if (!(p.offTipPx <= 1.5)) fail.push(`${c.gun} ${c.dirDeg}deg tracer passes ${p.offTipPx} px from the tip (spread ${p.spreadRad} rad)`);
      if (!(p.startsBeyondTipPx >= -.75)) fail.push(`${c.gun} ${c.dirDeg}deg tracer starts ${-p.startsBeyondTipPx} px behind the tip`);
    }
  }
  check(!fail.length, `${fail.length} misaligned: ${fail.slice(0, 6).join('; ')}`, { summary, cases });
  return { summary, cases };
}

/** Independent grid walk: first distance at which a ray from `from` enters a bullet-blocking cell (corners count both
 *  neighbours), as the bullet channel defines them: walls, closed doors and the map's outside block; windows pass. */
function firstBlock(map, from, angle, range = 1000) {
  const blocked = (x, y) => { if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return true;
    const d = map.doors.find(q => q.x === x && q.y === y); if (d) return !map.doorState[d.id]; return map.cells[y][x] === 'wall'; };
  const dx = Math.cos(angle), dy = Math.sin(angle), sx = Math.sign(dx), sy = Math.sign(dy);
  let x = Math.floor(from.x / TILE), y = Math.floor(from.y / TILE);
  if (blocked(x, y)) return 0;
  let tx = dx ? ((sx > 0 ? x + 1 : x) * TILE - from.x) / dx : Infinity, ty = dy ? ((sy > 0 ? y + 1 : y) * TILE - from.y) / dy : Infinity;
  while (Math.min(tx, ty) <= range) {
    const t = Math.min(tx, ty), cx = tx <= ty, cy = ty <= tx;
    if ((cx && blocked(x + sx, y)) || (cy && blocked(x, y + sy))) return t;
    if (cx) { x += sx; tx += TILE / Math.abs(dx); }
    if (cy) { y += sy; ty += TILE / Math.abs(dy); }
    if (blocked(x, y)) return t;
  }
  return Infinity;
}

/** d. Flush against walls, a closed door and a convex corner (touch stick: exact directions). */
async function walls(page, c) {
  const near = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.filter(a => a.alive && a.x > 200 && a.x < 700 && a.y > 150 && a.y < 560).map(a => a.uid));
  for (const uid of near) await drive(page, 'kill', uid);
  const map = await page.evaluate(() => { const b = window.__bincovSample.host.lastBatch;
    return { cols: b.map.cols, rows: b.map.rows, cells: b.map.cells, doors: b.map.doors.map(d => ({ id: d.id, x: d.x, y: d.y })), doorState: b.frame.doors, regions: b.map.regions.map(r => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })) }; });
  const o = await page.evaluate(() => { for (let d = 0; d < 200; d += 8) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) {
    const x = Math.round(innerWidth * .62 + dx), y = Math.round(innerHeight * .42 + dy); if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y }; } return null; });
  assert.ok(o, 'no free canvas point for the aim stick');
  const spots = [
    { name: 'outside the south wall (11,12)', at: { x: 368, y: 426.01 }, dirs: [-90, -45, -135] },
    { name: 'outside the closed front door (14,12)', at: { x: 464, y: 426.01 }, dirs: [-90] },
    { name: 'convex SW corner, diagonal', at: { x: 309.99, y: 426.01 }, dirs: [-45] },
    { name: 'west face just above the SW corner', at: { x: 309.99, y: 410 }, dirs: [25, 0] },
    { name: 'inside the west room at the closed west door (13,10)', at: { x: 405.99, y: 336 }, dirs: [0, 45] },
  ];
  const cases = []; let id = 40;
  for (const spot of spots) {
    await place(page, spot.at, 0);
    for (const deg of spot.dirs) {
      const a = deg * Math.PI / 180;
      await drive(page, 'weapon', 'pistol'); await running(page);
      await page.evaluate(() => { window.__shoot.sparks = []; window.__shoot.sounds = []; });
      await rec(page); id++;
      await touch(c.cdp, 'touchStart', [{ id, ...o }]); await touch(c.cdp, 'touchMove', [{ id, x: o.x + Math.cos(a) * 60, y: o.y + Math.sin(a) * 60 }]);
      await page.waitForFunction(() => window.__shoot.log.some(r => r.ev.some(e => e.type === 'shot' && e.shooter === 'player')), null, { polling: 'raf' });
      await touch(c.cdp, 'touchEnd', []);
      const shot = await page.evaluate(() => window.__shoot.log.flatMap(r => r.ev).find(e => e.type === 'shot' && e.shooter === 'player'));
      const uid = shot.pellets[0].bullet;
      await page.waitForFunction(uid => window.__shoot.log.some(r => r.ev.some(e => e.type === 'impact' && e.bullet === uid)), uid, { polling: 'raf' });
      await waitRaid(page, .05);
      const log = await stop(page), fx = await page.evaluate(() => ({ sparks: window.__shoot.sparks.map(s => ({ x: s.x, y: s.y, visible: s.visible })), sounds: window.__shoot.sounds }));
      const row = log.find(r => r.ev.some(e => e.type === 'impact' && e.bullet === uid)), imp = row.ev.find(e => e.type === 'impact' && e.bullet === uid);
      const angle = shot.pellets[0].angle, from = { x: spot.at.x, y: spot.at.y }, dist = firstBlock(map, from, angle);
      const expected = { x: from.x + Math.cos(angle) * dist, y: from.y + Math.sin(angle) * dist };
      const at = imp.contact ?? imp.lastFree, shown = map.regions.every(r => !(imp.lastFree.x >= r.x && imp.lastFree.x < r.x + r.w && imp.lastFree.y >= r.y && imp.lastFree.y < r.y + r.h) || row.revealed[r.id] === true);
      const spark = fx.sparks.find(s => Math.abs(s.x - imp.lastFree.x) < .01 && Math.abs(s.y - imp.lastFree.y - .5) < .01);
      cases.push({ spot: spot.name, dirDeg: deg, reason: imp.reason, surface: imp.surface, origin: shot.pellets[0].origin, contact: { x: r3(at.x, 2), y: r3(at.y, 2) },
        expected: { x: r3(expected.x, 2), y: r3(expected.y, 2) }, offExpectedPx: r3(Math.hypot(at.x - expected.x, at.y - expected.y), 3), shown, spark: !!spark, sparkVisible: spark?.visible ?? null, impactSound: fx.sounds.length > 0 });
    }
  }
  const fail = cases.filter(k => k.reason !== 'blocked' || !(k.offExpectedPx < .5) || (k.shown && !(k.spark && k.sparkVisible)));
  check(!fail.length, `${fail.length} wall shots wrong: ${fail.map(k => `${k.spot} ${k.dirDeg}deg ${k.reason} ${k.offExpectedPx}px spark ${k.spark}/${k.sparkVisible}`).join('; ')}`, { cases });
  return { cases };
}

/** e. A salt inside the unrevealed ground floor fires through the west window: no tracer pixel over its room. */
async function hiddenRoom(page) {
  const actors = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.filter(a => a.alive).map(a => ({ uid: a.uid, kind: a.kind })));
  const shooter = actors.find(a => a.kind === 'salt');
  assert.ok(shooter, 'seed 42 has a salt on the coast map');
  await page.evaluate(([keep, all]) => { const d = window.__bincovSample.driver; for (const uid of all) if (uid !== keep) d.kill(uid); }, [shooter.uid, actors.map(a => a.uid)]);
  const room = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.regions.find(r => r.inside));
  for (const door of ['resident-front', 'resident-west', 'resident-east']) await drive(page, 'door', door, false);
  await drive(page, 'placeEnemy', shooter.uid, { x: 368, y: 336 }, 76);
  // Far enough west that a bullet leaving the window is published outside the room at least once even on CI's slowest
  // frames (365 px/s x .5 s = 183 px between frames; the player stands 218 px past the window).
  await place(page, { x: 112, y: 336 }, 0);
  const maxHp = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.hud.maxHp);
  await drive(page, 'vitals', { hp: maxHp, bleeding: false });
  await rec(page, true);
  await drive(page, 'freezeAI', false);
  // At least two of the salt's shots (1.2 s apart) and their flight past the window.
  await page.waitForFunction(uid => window.__shoot.log.filter(r => r.ev.some(e => e.type === 'shot' && e.shooter === uid)).length >= 2, shooter.uid, { polling: 'raf', timeout: 30000 });
  await waitRaid(page, .4);
  await drive(page, 'freezeAI', true);
  const log = await stop(page);
  // Drawn on whole pixels: the head pixel of a bullet first shown just outside the window may straddle the wall line by up
  // to a pixel (rounding), which shows nothing of the room. A leak is a drawn point more than a pixel inside (before the
  // fix tails reached up to 8 px in).
  const inRoom = (x, y) => x >= room.x + 1 && x < room.x + room.w - 1 && y >= room.y + 1 && y < room.y + room.h - 1;
  const enemyBullets = new Set(shotsOf(log, shooter.uid).flatMap(s => s.pellets.map(p => p.bullet)));
  let drawn = 0; const over = [];
  for (const r of log) for (const q of r.tracers ?? []) {
    if (!enemyBullets.has(q.uid) || !q.visible || r.revealed[room.id]) continue;
    // Drawn on the chest plane: the ground under a drawn point is AIM_H px further south. Sample the tail every 0.5 px.
    const pts = [];
    if (q.rect) pts.push([q.rect[0] + .5, q.rect[1] + .5]);
    if (q.stroke) { const [x0, y0, x1, y1] = q.stroke, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / .5); for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); }
    if (pts.length) drawn++;
    const bad = pts.filter(([x, y]) => inRoom(x, y + AIM_H));
    if (bad.length) over.push({ t: r3(r.t, 3), uid: q.uid, overRoomPx: r3(Math.max(...bad.map(([x]) => room.x + room.w > x ? x - room.x : 0)), 2), stroke: q.stroke, rect: q.rect });
  }
  const detail = { shooter, shots: shotsOf(log, shooter.uid).length, revealedEver: log.some(r => r.revealed[room.id]), tracerFramesDrawn: drawn, framesOverRoom: over.length, sample: over.slice(0, 3) };
  check(!detail.revealedEver, 'the room was revealed: the case shows nothing', detail);
  check(detail.shots >= 2 && drawn > 0, 'the salt did not fire or no tracer was drawn', detail);
  check(!over.length, `${over.length} tracer frames drew over the hidden room`, detail);
  return detail;
}

/** f. Desktop fire modes: a held left button fires a pistol once and the sample M4A1 every 0.1 s. */
async function desktopModes(page) {
  await drive(page, 'sampleGun', null); await drive(page, 'weapon', 'pistol');
  await aimAt(page, 0, 120); await running(page);
  await rec(page); await page.mouse.down(); await waitRaid(page, .8); await page.mouse.up(); await waitRaid(page, .1);
  const pistol = shotsOf(await stop(page)).length;
  await drive(page, 'sampleGun', 'm4a1'); await running(page);
  await rec(page); const t0 = await simTime(page); await page.mouse.down(); await waitRaid(page, 1.05, t0);
  await page.evaluate(() => { window.__shoot.released = null; }); await page.mouse.up(); await waitRaid(page, .3);
  const m4Release = await released(page), log = await stop(page), m4 = shotsOf(log), frameDt = (log.at(-1).t - log[0].t) / Math.max(1, log.length - 1);
  await drive(page, 'sampleGun', null);
  const interval = m4.length > 1 ? (m4.at(-1).t - m4[0].t) / (m4.length - 1) : NaN;
  const detail = { pistolShots: pistol, m4a1Shots: m4.length, m4a1MeanInterval: r3(interval, 4), frameDt: r3(frameDt, 4), m4a1ShotsAfterRelease: m4.filter(q => q.t > m4Release).length };
  check(pistol === 1, `held pistol fired ${pistol} shots`, detail);
  check(m4Release !== null && detail.m4a1ShotsAfterRelease === 0, 'the M4A1 fired after the button was released', detail);
  check(m4.length >= 9 && Math.abs(interval - .1) <= Math.max(.012, 1.5 * frameDt / (m4.length - 1)), `held M4A1: ${m4.length} shots, ${interval} s apart`, detail);
  return detail;
}
/** f. Touch: the outer ring repeats the pistol at its own rate; the inner ring only aims, and precise aim never turns on. */
async function touchModes(page, c) {
  const o = await page.evaluate(() => { for (let d = 0; d < 200; d += 8) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) {
    const x = Math.round(innerWidth * .62 + dx), y = Math.round(innerHeight * .45 + dy); if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y }; } return null; });
  assert.ok(o, 'no free canvas point for the aim stick');
  await place(page, HOME, 0); await drive(page, 'weapon', 'pistol'); await running(page);
  await rec(page);
  await touch(c.cdp, 'touchStart', [{ id: 1, ...o }]); await touch(c.cdp, 'touchMove', [{ id: 1, x: o.x + 60, y: o.y }]);
  await page.waitForFunction(() => window.__shoot.log.some(r => r.ev.some(e => e.type === 'shot' && e.shooter === 'player')), null, { polling: 'raf' });
  const t0 = await page.evaluate(() => window.__shoot.log.find(r => r.ev.some(e => e.type === 'shot' && e.shooter === 'player')).t);
  await waitRaid(page, 1.0, t0); await page.evaluate(() => { window.__shoot.released = null; }); await touch(c.cdp, 'touchEnd', []); await waitRaid(page, .5);
  const outerRelease = await released(page), log = await stop(page), shots = shotsOf(log).filter(s => s.t <= t0 + 1.0 + 1e-9), frameDt = (log.at(-1).t - log[0].t) / Math.max(1, log.length - 1);
  const interval = shots.length > 1 ? (shots.at(-1).t - shots[0].t) / (shots.length - 1) : NaN;
  await drive(page, 'weapon', 'pistol'); await running(page);
  await rec(page);
  await touch(c.cdp, 'touchStart', [{ id: 2, ...o }]); await touch(c.cdp, 'touchMove', [{ id: 2, x: o.x + 25, y: o.y - 8 }]);
  await waitRaid(page, .6); await touch(c.cdp, 'touchEnd', []); await waitRaid(page, .1);
  const inner = await stop(page);
  const detail = { outerShotsAfterRelease: shotsOf(log).filter(q => q.t > outerRelease).length, outerShots: shots.length, outerMeanInterval: r3(interval, 4), frameDt: r3(frameDt, 4), innerShots: shotsOf(inner).length, innerPreciseEver: inner.some(r => r.p.precise),
    innerAimDeg: r3((inner.at(-3)?.p.aim ?? NaN) * 180 / Math.PI, 2) };
  check(shots.length >= 3 && Math.abs(interval - .29) <= Math.max(.015, 1.5 * frameDt / (shots.length - 1)), `outer ring: ${shots.length} shots, ${interval} s apart`, detail);
  check(outerRelease !== null && detail.outerShotsAfterRelease === 0, 'the pistol fired after the finger lifted', detail);
  check(detail.innerShots === 0 && !detail.innerPreciseEver, 'the inner ring fired or turned precise aim on', detail);
  return detail;
}

/** Frames that draw a blow's flash (70 ms) and kick (80 ms), from the hit's own frame on: 4 each at 60 Hz, 2 at 30 and 1
 *  at 15, 12 and 10 (Pixi caps a frame at 100 ms). They used to start a frame after the hit, and at 12 and 10 Hz that
 *  frame outlived both and drew neither (#75). */
const BLOW_FRAMES = { 60: [4, 4], 30: [2, 2], 15: [1, 1], 12: [1, 1], 10: [1, 1] };
/** Body poses from the hit's own frame on, for a kind whose art has pose frames (#75): H hurt (90 ms), R recovery (60 ms),
 *  then the idle body. At 12 and 10 Hz the hit's frame shows hurt and the next is already past the recovery. */
const POSE_FRAMES = { 60: 'HHHHHRRR', 30: 'HHRR', 15: 'HR', 12: 'H', 10: 'H' };
/** Bullets for g: flying east at every rate in BLOW_FRAMES, and south at 60 Hz so that each axis of the kick is checked. */
const BLOWS = [...Object.keys(BLOW_FRAMES).map(Number).reverse().map(hz => ({ hz, dir: 'east', vx: 1, vy: 0 })), { hz: 60, dir: 'south', vx: 0, vy: 1 }];
/** More bullets for g, east at 60 Hz, on the enemy drawn as one of #81's archetypes (#75): group B's three have their own
 *  hurt and recovery bodies; the raider boss has its own body but no poses, so it keeps its own frames throughout. */
const STYLED_BLOWS = [['raider-melee', POSE_FRAMES[60]], ['raider-gunner', POSE_FRAMES[60]], ['raider-lookout', POSE_FRAMES[60]], ['raider-boss', '']]
  .map(([style, pose]) => ({ hz: 60, dir: 'east', vx: 1, vy: 0, style, pose }));
/** g. A blow on slow frames: copies of the live batch, one living enemy 64 px east of the player and hit by a bullet from
 *  BLOWS (drawn in its kind's style) or STYLED_BLOWS, are presented at each rate's fixed delta with the ticker stopped (the
 *  Runtime, input and save never see them). */
async function blowOnSlowFrames(page) {
  const runs = await page.evaluate(blows => {
    const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, f = b.frame, p = f.player, foe = f.actors.find(a => a.alive);
    if (!foe) return null;
    const { tactics: _, ...plain } = foe, at = { x: Math.round(p.x) + 64, y: Math.round(p.y) };
    h.app.ticker.stop();
    try {
      return blows.map(({ hz, dir, vx, vy, style, pose: want }) => {
        // A styled enemy carries the tactics fields the view reads, with that archetype.
        const tactics = style ? { tactics: { archetype: style, name: style, phase: 'idle', stance: 'idle', awareness: 0, left: 0, total: 1, range: 30, aim: Math.PI, warningLeft: 0, boundary: null } } : {};
        const moved = { ...plain, ...at, vx: 0, vy: 0, regionId: p.regionId, ...tactics };
        const batch = events => ({ ...b, events, frame: { ...f, actors: f.actors.map(a => a.uid === foe.uid ? moved : a) } });
        // The Runtime's angle for a bullet's hit (layer-transition.ts): atan2(-vy, -vx), back toward the shooter.
        const hit = { type: 'hurt', cause: 'blow', uid: foe.uid, at, damage: 10, critical: false, angle: Math.atan2(-vy, -vx), seq: 0, stamp: b.stamp, durability: 'accepted' };
        const dt = 1 / hz;
        // Idle frames age any earlier flash or kick away; the body then stands where no kick puts it.
        for (let i = 0; i < 3; i++) v.present(batch([]), .1);
        const g = v.actors.get(foe.uid), rest = { x: g.body.x, y: g.body.y }, before = new Set(v.fx.live);
        // H hurt, R recovery, - one of the body's own idle and walk frames, ? anything else (another style, the placeholder).
        const own = n => g.body.texture === v.tex.actor(moved.kind, g.dir, n, style);
        const pose = () => own(5) ? 'H' : own(6) ? 'R' : [0, 1, 2, 3, 4].some(own) ? '-' : '?';
        const read = () => ({ body: g.body.visible, flash: g.flash.visible, kick: [g.body.x - rest.x, g.body.y - rest.y], pose: pose() });
        v.present(batch([hit]), dt);
        // The blow's blood drops, still in the air after one frame: each one's speed along the bullet (px/s).
        const blood = v.fx.live.filter(q => !before.has(q) && q.settle === 'decal').map(q => Math.round(q.vx * vx + q.vy * vy));
        // The hit's own frame first, then a quarter of a second.
        const frames = [read()];
        for (let i = 1; i * dt < .25; i++) { v.present(batch([]), dt); frames.push(read()); }
        return { hz, dir, style, want, bullet: [vx, vy], uid: foe.uid, kind: foe.kind, frames, blood };
      });
    } finally { h.app.ticker.start(); }
  }, [...BLOWS, ...STYLED_BLOWS]);
  check(runs, 'no living enemy to hit');
  const cases = runs.map(r => {
    const flash = r.frames.map(q => q.flash), kick = r.frames.map(q => q.kick[0] !== 0 || q.kick[1] !== 0);
    const count = s => s.filter(Boolean).length, leading = s => s.slice(0, count(s)).every(Boolean);
    return { hz: r.hz, dir: r.dir, style: r.style ?? null, enemy: `${r.kind} ${r.uid}`, flashFrames: count(flash), kickFrames: count(kick), fromFirstFrame: leading(flash) && leading(kick),
      kicksPx: [...new Set(r.frames.filter((q, i) => kick[i]).map(q => q.kick.join(',')))], wantPx: r.bullet.map(d => d * 2).join(','), drawn: r.frames.every(q => q.body),
      hitFrame: { flash: r.frames[0].flash, kickPx: r.frames[0].kick.join(',') }, flashByFrame: flash.map(Number).join(''), kickByFrame: kick.map(Number).join(''),
      bloodAlongBullet: r.blood, poseByFrame: r.frames.map(q => q.pose).join(''), wantPose: (r.want ?? POSE_FRAMES[r.hz]).padEnd(r.frames.length, '-') };
  });
  const fail = cases.flatMap(c => {
    const [flash, kick] = BLOW_FRAMES[c.hz], out = [], at = `${c.hz} Hz ${c.dir}${c.style ? ` as ${c.style}` : ''}`;
    if (!c.drawn) out.push(`${at}: the enemy was not drawn`);
    if (c.flashFrames !== flash || c.kickFrames !== kick || !c.fromFirstFrame) out.push(`${at}: flash on ${c.flashFrames} and kick on ${c.kickFrames} frames, by frame ${c.flashByFrame} / ${c.kickByFrame} (want ${flash} and ${kick} from the hit's own frame)`);
    // Knocked 2 px the way the bullet flew (#75), while the blood still sprays back toward the shooter.
    if (c.kicksPx.some(k => k !== c.wantPx)) out.push(`${at}: kicked ${c.kicksPx.join(' / ')} px (want ${c.wantPx})`);
    if (!c.bloodAlongBullet.length || c.bloodAlongBullet.some(s => s >= 0)) out.push(`${at}: blood speeds along the bullet ${c.bloodAlongBullet.join(' / ') || 'none'} (want all below 0, back toward the shooter)`);
    if (c.poseByFrame !== c.wantPose) out.push(`${at}: body poses ${c.poseByFrame} (want ${c.wantPose})`);
    return out;
  });
  check(!fail.length, fail.join('; '), { cases });
  await running(page);
  return { cases };
}

/** h. Hit confirmation on the host (#75): the impact, hurt and death events a player's round publishes, for one living
 *  enemy moved next to the player, go through the host's own feedback (as coast-sample's marker checks do). A critical
 *  hit turns the marker critical, a kill of that target keeps it, a plain hit starts plain again, and every kill marker
 *  asks for one confirm sound. The Runtime and the save never see these events. */
async function hitConfirm(page) {
  const r = await page.evaluate(() => {
    const h = window.__bincovSample.host, b = h.lastBatch, f = b.frame, p = f.player, foe = f.actors.find(a => a.alive);
    if (!foe) return null;
    const at = { x: Math.round(p.x) + 48, y: Math.round(p.y) }, moved = { ...foe, ...at, vx: 0, vy: 0, regionId: p.regionId };
    const copy = { ...b, events: [], frame: { ...f, actors: f.actors.map(a => a.uid === foe.uid ? moved : a) } };
    const ev = body => ({ ...body, seq: 0, stamp: b.stamp, durability: 'accepted' });
    const impact = ev({ type: 'impact', bullet: 'probe-bullet', owner: 'player', reason: 'hit-actor', lastFree: at, contact: at, normal: null, surface: 'actor', target: foe.uid });
    const hurt = critical => ev({ type: 'hurt', cause: 'blow', uid: foe.uid, at, damage: 10, critical, angle: Math.PI });
    const death = ev({ type: 'death', uid: foe.uid, corpseAngle: 0, containerId: null });
    const pop = document.querySelector('[data-hitpop]'), out = h.sound.out, kill = out.kill;
    let kills = 0;
    out.kill = function (...a) { kills++; return kill.apply(this, a); };
    const read = () => ({ on: pop.classList.contains('on'), crit: pop.classList.contains('crit'), kill: pop.classList.contains('kill'), markT: Math.round(h.markT * 100) / 100, kills });
    const feed = (...events) => { for (const e of events) h.feedback(e, copy); return read(); };
    try {
      return { plain: feed(impact, hurt(false)), crit: feed(impact, hurt(true)), critKill: feed(death),
        plainAgain: feed(impact, hurt(false)), plainKill: feed(death) };
    } finally { out.kill = kill; }
  });
  check(r, 'no living enemy to mark');
  const want = { plain: [false, false, .2, 0], crit: [true, false, .3, 0], critKill: [true, true, .42, 1], plainAgain: [false, false, .2, 1], plainKill: [false, true, .42, 2] };
  const fail = Object.entries(want).flatMap(([k, [crit, kill, markT, kills]]) => {
    const s = r[k];
    return s.on && s.crit === crit && s.kill === kill && s.markT === markT && s.kills === kills ? [] : [`${k}: ${JSON.stringify(s)} (want crit ${crit}, kill ${kill}, ${markT} s, ${kills} confirm sounds)`];
  });
  check(!fail.length, fail.join('; '), r);
  return r;
}

/* ---------------------------------------------------------------- run ---------------------------------------------------------------- */

let desktop, phone;
try {
  desktop = await context('desktop', {});
  await step('a', 'a still pointer keeps the aim while the camera eases', desktop, stillPointer);
  await step('a-edge', 'at the map edge a still pointer keeps the aim too: the look-ahead stops on the edge', desktop, stillPointerAtEdge);
  await step('b', 'firing with a still pointer keeps the aim', desktop, kickKeepsAim);
  await step('c', 'muzzle flash on the barrel tip; tracers leave the tip', desktop, muzzleAndTracers);
  await step('g', 'a blow\'s flash and kick are drawn on slow frames', desktop, blowOnSlowFrames);
  await step('h', 'a critical hit turns the hit marker critical; each kill marker asks for one confirm sound', desktop, hitConfirm);
  await step('f-desktop', 'mouse fire modes: pistol once, M4A1 every 0.1 s', desktop, desktopModes);
  await step('e', 'a shot out of an unrevealed room draws nothing over it', desktop, hiddenRoom);
  desktop.stallResumes = await stallResumes(desktop.page);
  phone = await context('phone', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  phone.touch = true;
  await touchReady(phone.page);
  await step('d', 'walls, a closed door and a corner stop the bullet at the surface', phone, walls);
  await step('f-touch', 'touch fire modes: outer ring repeats, inner ring never fires', phone, touchModes);
  phone.stallResumes = await stallResumes(phone.page);
} catch (error) {
  report.failure = error.stack; console.error(error);
} finally {
  report.stallResumes = { desktop: desktop?.stallResumes ?? null, phone: phone?.stallResumes ?? null };
  report.finishedAt = new Date().toISOString();
  const failed = report.steps.filter(s => s.status !== 'passed');
  report.status = report.failure || failed.length ? 'failed' : 'passed';
  await save();
  await desktop?.ctx.close().catch(() => {}); await phone?.ctx.close().catch(() => {}); await browser.close();
  if (report.status !== 'passed') process.exitCode = 1;
  console.log(report.status === 'passed' ? 'shooting: all steps passed' : `shooting: ${failed.map(s => s.id).join(', ') || 'setup'} failed`);
}
async function touchReady(page) { await page.waitForFunction(() => window.__bincovSample.host.input.touch === true); await running(page); }
