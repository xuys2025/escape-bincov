/** EN-04, native street or --world=mall upstairs encounter, AI active. Run alone after pnpm package:
 * node --import tsx scripts/enemy-performance.mjs
 * Real 12-second browser samples; no accelerated clocks or GPU-completion claims.
 * Budget misses are reported and exit 1. Do not relax budgets to fit a result. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { raidReady, frames } from './raid-view.mjs';
import { createSessionState, SaveSession } from '../src/session.ts';
import { decodeSession, SESSION_KEY } from '../src/recovery-store.ts';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime.ts';
import { BUILDING_WORLD } from '../src/building-world.ts';
import { mallWorldV3 } from '../src/mall-world.ts';
import { corridor, spacePath, traversable } from '../src/spatial.ts';
import { archetype } from '../src/enemy-archetypes.ts';
import { SURVIVAL } from '../src/balance.ts';

const options = new Map(process.argv.slice(2).map(arg => {
  const match = /^--(seed|baseline|out|policy|focus|radius|heal|fixture-out|world|retreat-to)=(.+)$/.exec(arg); if (!match) throw Error(`Unknown argument: ${arg}`); return [match[1],match[2]];
}));
const world = options.get('world') ?? 'buildings'; assert.ok(['buildings', 'mall'].includes(world));
const seed = Number(options.get('seed') ?? 42); assert.ok(Number.isInteger(seed) && seed > 0 && seed <= 0xffffffff);
const policy = options.get('policy') ?? 'stationary'; assert.ok(['stationary','strafe','retreat','observe-retreat'].includes(policy));
// Fixed avoidance load: observe the first attack without firing for two seconds, then
// walk away for the rest of the sample. It never stands in for sustained firefight acceptance.
const observeRetreat = policy === 'observe-retreat', inputRevision = 'visible-aim-v2';
const retreatTo = options.get('retreat-to') ?? null;
assert.ok(!retreatTo || observeRetreat, '--retreat-to requires the declared observe-retreat policy');
const focus = options.get('focus') ?? 'raider-gunner',radius=Number(options.get('radius')??240);
assert.ok(archetype(focus));assert.ok(Number.isFinite(radius)&&radius>=32&&radius<=300);
assert.ok(['true','false'].includes(options.get('heal')??'false'));const heal=options.get('heal')==='true';
const out = resolve(options.get('out') ?? 'test-results/enemy-performance'); await mkdir(out, { recursive: true });
// Provisional expansion ceilings, declared before the first measurement. Device-specific;
// passing is necessary for this desktop expansion, not sufficient for phone/balance signoff.
const budgets = { worldEnemies: 25, advanceP95Ms: 8, advanceP99Ms: 16, pathP95Ms: 4, pathMaxMs: 16,
  presentP95Ms: 8, presentP99Ms: 16, frameP95Ms: 33.4, frameP99Ms: 50,
  atlasPages: 3, estimatedTextureBytes: 96 * 1024 ** 2, htmlBytes: 8 * 1024 ** 2 };
// The maintainer explicitly removed the 5 MiB portable ZIP cap on 2026-10-24.
// Continue reporting its actual bytes; frame, texture and HTML budgets remain unchanged.
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b), at = q => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
  assert.ok(values.every(n => Number.isFinite(n) && n >= 0), 'finite nonnegative measurement values');
  return { count: sorted.length, total: values.reduce((a, b) => a + b, 0), p50: at(.5), p95: at(.95), p99: at(.99), max: at(1) };
};
function fixture(highTide) {
  const data = new Map(), state = createSessionState();
  const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }), undefined, () => 1800000000000);
  assert.ok(saves.initialize(), state.storageError); state.state = 'hideout';
  assert.ok(saves.beginRun(seed, world === 'mall' ? 'mall' : true, world === 'mall' ? { mallLayout: 3 } : {}), state.storageError);
  const mapId = world === 'mall' ? 'mall-f2' : 'coast', definition = world === 'mall' ? mallWorldV3() : BUILDING_WORLD;
  const raid = state.expansion.raid, layer = raid.maps[mapId], e = layer.enemies.find(e => e.id === focus);
  assert.ok(e); assert.equal(raid.version, 5);
  raid.initialHigh = raid.highTide = highTide;
  const context = { definition: definition.maps[mapId], doors: layer.doors, highTide };
  const p = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12)
    .map(a => ({ x: e.x + Math.cos(a) * radius, y: e.y + Math.sin(a) * radius }))
    .filter(p => traversable(context, p, 'body', 10) && corridor(context, e, p, 'sight'))
    .sort((a, b) => Math.min(...layer.enemies.filter(o => o !== e).map(o => Math.hypot(o.x - b.x, o.y - b.y)))
      - Math.min(...layer.enemies.filter(o => o !== e).map(o => Math.hypot(o.x - a.x, o.y - a.y))))[0];
  assert.ok(p, 'safe, visible observation point'); raid.currentMap = mapId; raid.player = { ...p, rotation: Math.atan2(e.y - p.y, e.x - p.x) };
  assert.ok(saves.persist(), state.storageError); const raw = data.get(SESSION_KEY); decodeSession(raw);
  const destination = retreatTo ? context.definition.entries.find(e => e.id === retreatTo)?.at : null;
  if (retreatTo) assert.ok(destination && spacePath(context,p,destination).length, 'declared retreat entry has a closed-door body path');
  return { raw, state, saves, target: { x: e.x, y: e.y }, nativeUids: layer.enemies.filter(e => e.tactics).map(e => e.uid), definition: context.definition, destination };
}
// Plan only from immutable geometry/current doors. Input still walks the real Runtime;
// no teleporting, opening doors by mutation, E stair activation or extra AI scheduling.
function routeStep(context, player, destination) {
  if (Math.hypot(destination.x-player.x,destination.y-player.y)<10) return null;
  const path=spacePath(context,player,destination);assert.ok(path.length,'retreat body path remains reachable');
  // Follow the next tile centre, like layered-play. A far visible waypoint can
  // have a shallow diagonal that WASD quantization turns into walking into a wall.
  // The first cell centre can be behind a player already leaving that cell;
  // never backtrack toward it while following the route.
  const forward=path.slice(1).find(p=>Math.hypot(p.x-player.x,p.y-player.y)>10)??destination;
  // At an inside corner the next cell can require finishing the current cell's
  // centre first; unlike straight travel, that alignment is not backtracking.
  const next=corridor(context,player,forward,'body',10)?forward:path[0];
  assert.ok(corridor(context,player,next,'body',10),'retreat has a clear next body waypoint');
  return {angle:Math.atan2(next.y-player.y,next.x-player.x),dx:next.x-player.x,dy:next.y-player.y,distance:Math.hypot(next.x-player.x,next.y-player.y)};
}
if(options.has('fixture-out')) {
  const path=resolve(options.get('fixture-out'));await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,fixture(false).raw);
  console.log('Prepared strict low-tide performance input; no measurement or acceptance claimed.');process.exit(0);
}
const report = { protocol: 'enemy-native-performance-v1', inputRevision, at: new Date().toISOString(), world, seed, policy, retreatTo, focus, radius, heal, budgets,
  source: { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() },
  scope: 'Native roster at the recorded seed; only player observation position and initial tide changed in a strictly decoded save. No extra enemies, freezing, invulnerability or virtual time. Node paths exclude dryRefuge direct spacePath calls. Browser present is CPU submission, not GPU completion. Not natural play or phone acceptance.',
  environment: { node: process.version, platform: process.platform, os: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  input: { aimPreparationSeconds: .6, observeSeconds: observeRetreat ? 2 : 0, playerFires: !observeRetreat,
    retreatRoute: retreatTo ? `Closed-door body path to ${retreatTo}, stopping at landing without changing floors` : 'straight away from initial focus',
    target: 'Browser: alive, revealed, onscreen canvas and clear sight; Node: alive and clear sight in current map. Release trigger when none.',
    devices: 'Node precise and full walk; desktop right mouse and WASD; touch 24px aim / 60px fire, 40px walk (0.714), movement lowers raise. Node frame targeting and browser 250ms targeting remain separate loads.' },
  runtime: [], browser: [], failures: [], errors: [], external: [], status: 'RUNNING' };
const fail = (name, actual, limit) => { if (!Number.isFinite(actual) || actual > limit) report.failures.push({ name, actual, limit }); };
try {
  for (const highTide of [false, true]) for (const hz of [60, 20, 5]) for (let repeat = 0; repeat < 2; repeat++) {
    const f = fixture(highTide); f.state.state = 'run';
    const r = new CoastRaidRuntime(f.state, f.saves), advances = [], paths = [], originalPath = r.path;
    r.path = function (...args) { const start = performance.now(); try { return originalPath.apply(this, args); } finally { paths.push(performance.now() - start); } };
    r.advance(0, emptyIntent());
    const initialEnemies = r.enemies.length, worldEnemies = r.layered.raid.roster.length;
    let lastHeal=-Infinity;
    const nativePhases = {}, nativeAttackEvents = new Map();
    for (let frame = 1; frame <= 12 * hz && !r.ending; frame++) {
      const target = r.enemies.filter(e => e.hp > 0 && r.sight(r.player, e)).sort((a, b) => Math.hypot(a.x-r.player.x,a.y-r.player.y)-Math.hypot(b.x-r.player.x,b.y-r.player.y))[0];
      const firing = !!target && !observeRetreat && frame / hz >= .6;
      const intent = { ...emptyIntent(), aim: target ? Math.atan2(target.y-r.player.y,target.x-r.player.x) : 0,
        firePressed: firing && frame % Math.max(1, Math.round(hz / 3)) === 0, fireHeld: firing, precise: true,
        commands: !observeRetreat && frame % (hz * 3) === 0 ? ['reload'] : [] };
      if (policy !== 'stationary' && (!observeRetreat || frame / hz >= 2)) {
        const step = f.destination ? routeStep({definition:f.definition,doors:r.space.doors,highTide},r.player,f.destination) : null;
        const bearing = f.destination ? step?.angle ?? 0 : policy==='retreat'||observeRetreat?Math.atan2(r.player.y-f.target.y,r.player.x-f.target.x)
          :intent.aim + Math.PI / 2 + (Math.floor(frame / hz) % 2 ? Math.PI : 0);
        // This replay holds precise and never sprints. Cap by the game's walk
        // upper bound, not a guessed sprint speed that slows low-Hz input to a crawl.
        const walkBound = SURVIVAL.walkSpeed * SURVIVAL.aimSpeedFactor;
        const amplitude = f.destination ? step ? Math.min(1,step.distance/(walkBound/hz)) : 0 : 1;
        intent.move = { x: Math.cos(bearing)*amplitude, y: Math.sin(bearing)*amplitude, sprint: false };
      }
      if(heal&&(r.hp<70||r.bleeding)&&frame/hz-lastHeal>=2){intent.commands.push('heal');lastHeal=frame/hz;}
      const start = performance.now(); const batch = r.advance(frame * 1000 / hz, intent); advances.push(performance.now() - start);
      for (const a of batch.frame.actors) if (a.tactics && f.nativeUids.includes(a.uid)) (nativePhases[a.uid] ??= new Set()).add(a.tactics.phase);
      for (const e of batch.events) if (e.type === 'shot' && f.nativeUids.includes(e.shooter) || e.type === 'melee' && f.nativeUids.includes(e.attacker)) nativeAttackEvents.set(e.seq, e);
    }
    const row = { highTide, hz, repeat, seconds: r.elapsed, initialEnemies, worldEnemies, advance: summary(advances), path: summary(paths), ending: r.ending, endPlayer:{...r.player}, endHp:r.hp,
      nativePhases: Object.fromEntries(Object.entries(nativePhases).map(([uid,p]) => [uid,[...p]])), nativeAttackEvents: [...nativeAttackEvents.values()] };
    report.runtime.push(row); r.path = originalPath;
    if (r.elapsed < 11.9) report.failures.push({ name: `runtime/${highTide}/${hz}/${repeat}/short-sample`, seconds: r.elapsed });
    if (observeRetreat && !nativeAttackEvents.size) report.failures.push({ name: `runtime/${highTide}/${hz}/${repeat}/no-native-attack` });
    if (!r.ending) r.finish('abandon'); r.dispose();
    fail(`runtime/${highTide}/${hz}/${repeat}/population`, worldEnemies, budgets.worldEnemies);
    // 20/5 Hz intentionally aggregate larger steps; report them, but do not apply 60 Hz per-frame CPU ceilings.
    if (hz === 60) { fail(`runtime/${highTide}/${repeat}/advance-p95`, row.advance.p95, budgets.advanceP95Ms); fail(`runtime/${highTide}/${repeat}/advance-p99`, row.advance.p99, budgets.advanceP99Ms); }
    fail(`runtime/${highTide}/${hz}/${repeat}/path-p95`, row.path.p95, budgets.pathP95Ms);
    fail(`runtime/${highTide}/${hz}/${repeat}/path-max`, row.path.max, budgets.pathMaxMs);
    console.log('runtime', highTide, hz, repeat, JSON.stringify(row));
  }
  const html = await readFile('dist/index.html'); report.artifact = { bytes: html.length, sha256: createHash('sha256').update(html).digest('hex'), portableBytes: (await stat('release/Escape-Bincov-portable.zip')).size };
  fail('html', html.length, budgets.htmlBytes);
  const browser = await chromium.launch(browserOptions); report.environment.browser = browser.version();
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }]) for (const highTide of [false, true]) {
      console.log('begin-browser', viewport.width, highTide);
      const touch = viewport.width === 844;
      const context = await browser.newContext({ viewport, offline: true, hasTouch: touch, isMobile: touch });
      const page = await context.newPage(); page.setDefaultTimeout(60000);
      const saved = fixture(highTide);
      await page.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [SESSION_KEY, saved.raw]);
      page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
      await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
      await page.locator('[data-action="enter"]').click(); await raidReady(page);
      const resume = page.locator('.coast-sample [data-do="resume"]'); if (await resume.isVisible()) await resume.click();
      await frames(page, 30);
      const cdp = touch ? await context.newCDPSession(page) : null;
      const origin = touch ? await page.evaluate(() => {
        for (let d = 0; d < 160; d += 8) for (const [dx,dy] of [[0,0],[d,0],[-d,0],[0,d],[0,-d]]) {
          const x = Math.round(innerWidth * .62 + dx), y = Math.round(innerHeight * .45 + dy);
          if (document.elementFromPoint(x,y)?.tagName === 'CANVAS') return { x,y };
        } return null;
      }) : null;
      const movementOrigin = touch && policy !== 'stationary' ? await page.evaluate(() => {
        for (let d=0;d<100;d+=8) for (const [dx,dy] of [[0,0],[d,0],[-d,0],[0,d],[0,-d]]) {
          const x=Math.round(innerWidth*.25+dx),y=Math.round(innerHeight*.45+dy);
          if(document.elementFromPoint(x,y)?.tagName==='CANVAS') return {x,y};
        } return null;
      }) : null;
      if (touch) { assert.ok(origin); if(policy!=='stationary') assert.ok(movementOrigin); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...origin }, ...(movementOrigin ? [{id:2,...movementOrigin}]:[])] }); }
      else await page.mouse.down({button:'right'});
      const measurement = page.evaluate(nativeUids => new Promise((resolve, reject) => {
        const h = window.__bincovSample.host, gap = [], advance = [], present = [], phases = new Set(), attackPhases = new Set();
        const nativePhases = {}, nativeAttackEvents = new Map();
        let previous = performance.now(), started = previous, lastFrame = -1;
        const timeout = setTimeout(() => reject(Error('Twelve-second rAF sample did not finish within thirty seconds')), 30000);
        const tick = () => { try {
          const now = performance.now(), batch = h.lastBatch;
          if(!batch)throw Error('Live raid detached before the twelve-second sample finished');
          gap.push(now - previous); previous = now; phases.add(batch.frame.phase);
          for (const a of batch.frame.actors) if (a.tactics) attackPhases.add(a.tactics.phase);
          for (const a of batch.frame.actors) if (a.tactics && nativeUids.includes(a.uid)) (nativePhases[a.uid] ??= new Set()).add(a.tactics.phase);
          for (const e of batch.events) if (e.type === 'shot' && nativeUids.includes(e.shooter) || e.type === 'melee' && nativeUids.includes(e.attacker)) nativeAttackEvents.set(e.seq, e);
          if (h.stats.frames !== lastFrame) { advance.push(h.stats.advanceMs); present.push(h.stats.presentMs); lastFrame = h.stats.frames; }
          if (now - started < 12000) { requestAnimationFrame(tick); return; }
          clearTimeout(timeout);
          const canvas = document.querySelector('.coast-sample canvas'), gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
          resolve({ gap, advance, present, seconds: (now - started) / 1000, phases: [...phases], attackPhases: [...attackPhases],
            endPlayer:{x:batch.frame.player.x,y:batch.frame.player.y}, endHp:batch.frame.hud.hp,
            nativePhases: Object.fromEntries(Object.entries(nativePhases).map(([uid,p]) => [uid,[...p]])), nativeAttackEvents: [...nativeAttackEvents.values()],
            counts: window.__bincovSample.counts(), atlas: { ...h.view.tex.atlas.stats }, estimatedTextureBytes: h.view.textureBytes(),
            activeEnemies: batch.frame.actors.filter(a => a.kind !== 'player').length,
            environment: { dpr: devicePixelRatio, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, userAgent: navigator.userAgent } });
        } catch (error) { clearTimeout(timeout); reject(error); } }; requestAnimationFrame(tick);
      }), saved.nativeUids);
      // Attach a handler immediately while normal input is sent on the same page.
      const result = measurement.then(value => ({ value }), error => ({ error: String(error) }));
      const started = performance.now();
      let held = [],lastHeal=-Infinity;
      while (performance.now() - started < 12200) {
        const snapshot = await page.evaluate(() => {
          const h = window.__bincovSample.host, b = h?.lastBatch; if (!b || b.frame.phase !== 'running') return null;
          const p = b.frame.player, candidates = b.frame.actors.filter(a => a.alive && h.view.actorShown(a.uid))
            .map(a => ({ uid:a.uid, wx:a.x, wy:a.y, ...h.view.worldToClient({ x:a.x, y:a.y-22 }), angle:Math.atan2(a.y-p.y,a.x-p.x) }))
            .filter(a => a.x >= 0 && a.x < innerWidth && a.y >= 0 && a.y < innerHeight && document.elementFromPoint(a.x,a.y)?.tagName === 'CANVAS')
            .sort((a,b) => Math.hypot(a.wx-p.x,a.wy-p.y)-Math.hypot(b.wx-p.x,b.wy-p.y));
          return { player:p, doors:b.frame.doors, candidates };
        });
        const aim = snapshot?.candidates.find(a => corridor({ definition:saved.definition, doors:snapshot.doors, highTide }, snapshot.player, {x:a.wx,y:a.wy}, 'sight'));
        const elapsed = performance.now() - started, preparing = elapsed < 600;
        const step = snapshot && saved.destination ? routeStep({definition:saved.definition,doors:snapshot.doors,highTide},snapshot.player,saved.destination) : null;
        const moving = !!snapshot && policy !== 'stationary' && (!observeRetreat || elapsed >= 2000) && (!saved.destination || !!step);
        const bearing = saved.destination ? step?.angle ?? 0 : policy==='retreat'||observeRetreat?await page.evaluate(target=>{
          const frame=window.__bincovSample?.host?.lastBatch?.frame;
          return frame?Math.atan2(frame.player.y-target.y,frame.player.x-target.x):0;
        },saved.target):(aim?.angle ?? 0) + Math.PI/2 + (Math.floor((performance.now()-started)/1000)%2 ? Math.PI:0);
        if (touch) {
          const distance = aim ? preparing || observeRetreat ? 24 : 60 : 0;
          await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{id:1,x:origin.x+Math.cos(aim?.angle??0)*distance,y:origin.y+Math.sin(aim?.angle??0)*distance},
            ...(movementOrigin ? [{id:2,x:movementOrigin.x+(moving?Math.cos(bearing)*40:0),y:movementOrigin.y+(moving?Math.sin(bearing)*40:0)}]:[])] });
        } else if (aim) { await page.mouse.move(aim.x, aim.y); if (!preparing && !observeRetreat) await page.mouse.click(aim.x, aim.y); }
        if (!touch) {
          const next = moving ? (step
            ? [Math.abs(step.dx)>1?step.dx>0?'d':'a':null,Math.abs(step.dy)>1?step.dy>0?'s':'w':null]
            : [Math.abs(Math.cos(bearing))>.3?Math.cos(bearing)>0?'d':'a':null,Math.abs(Math.sin(bearing))>.3?Math.sin(bearing)>0?'s':'w':null]).filter(Boolean) : [];
          for(const key of held) if(!next.includes(key)) await page.keyboard.up(key);
          for(const key of next) if(!held.includes(key)) await page.keyboard.down(key); held=next;
        }
        if (!observeRetreat && performance.now() - started > 2500 && Math.floor((performance.now() - started) / 1000) % 3 === 0) await page.keyboard.press('r');
        if(heal&&performance.now()-lastHeal>2000&&await page.evaluate(()=>{const h=window.__bincovSample?.host;return h?.lastBatch?.frame.phase==='running'&&(h.lastBatch.frame.hud.hp<70||h.lastBatch.frame.hud.bleeding);})){await page.keyboard.press('q');lastHeal=performance.now();}
        await page.waitForTimeout(step && moving ? Math.max(16,Math.min(80,step.distance/260*1000)) : 250);
      }
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      for(const key of held) await page.keyboard.up(key); if(!touch) await page.mouse.up({button:'right'});
      const outcome = await result;
      if(outcome.error) {
        const end=await page.evaluate(()=>{const a=window.__bincov?.app;return {state:a?.state,result:a?.result??null,pending:!!a?.pendingSettlement};});
        report.failures.push({name:`browser/${viewport.width}/${highTide}/incomplete`,...end});throw Error(outcome.error);
      }
      const measured = outcome.value;
      const row = { viewport, highTide, ...measured, gap: summary(measured.gap), advance: summary(measured.advance), present: summary(measured.present) };
      assert.ok(row.gap.count > 100 && row.advance.count > 100 && row.present.count > 100, 'sufficient live-frame samples');
      report.browser.push(row);
      const key = `browser/${viewport.width}/${highTide}`;
      if (measured.phases.some(p => p !== 'running')) report.failures.push({ name: `${key}/not-continuously-running`, phases: measured.phases });
      if (!measured.attackPhases.some(p => p === 'windup' || p === 'release' || p === 'recovery' || p === 'reload')) report.failures.push({ name: `${key}/no-active-combat` });
      if (observeRetreat && !measured.nativeAttackEvents.length) report.failures.push({ name:`${key}/no-native-attack` });
      for (const [name, actual, limit] of [['advance-p95', row.advance.p95, budgets.advanceP95Ms], ['advance-p99', row.advance.p99, budgets.advanceP99Ms],
        ['present-p95', row.present.p95, budgets.presentP95Ms], ['present-p99', row.present.p99, budgets.presentP99Ms],
        ['frame-p95', row.gap.p95, budgets.frameP95Ms], ['frame-p99', row.gap.p99, budgets.frameP99Ms],
        ['atlas-pages', row.atlas.pages, budgets.atlasPages], ['texture-bytes', row.estimatedTextureBytes, budgets.estimatedTextureBytes]]) fail(`${key}/${name}`, actual, limit);
      await page.screenshot({ path: resolve(out, `${viewport.width}-${highTide ? 'high' : 'low'}.png`) });
      console.log('browser', viewport.width, highTide, JSON.stringify(row)); await context.close();
    }
  } finally { await browser.close(); }
  if (report.errors.length || report.external.length) report.failures.push({ name: 'browser-errors-or-external-requests' });
  if (options.has('baseline')) {
    const old = JSON.parse(await readFile(resolve(options.get('baseline')), 'utf8'));
    assert.equal(old.protocol, report.protocol); assert.equal(old.status,'PASS'); assert.equal(old.seed ?? 42,seed);
    assert.equal(old.inputRevision, inputRevision, 'compare the same targeting and aim input revision');
    assert.equal(old.retreatTo ?? null, retreatTo, 'compare the same fixed retreat route');
    assert.equal(old.world ?? 'buildings', world, 'compare the same world and encounter geometry');
    assert.equal(old.policy ?? 'stationary',policy,'identical input policies for comparison');
    assert.equal(old.focus ?? 'raider-gunner',focus);assert.equal(old.radius ?? 240,radius,'identical observation geometry for comparison');
    assert.equal(old.heal??false,heal,'identical carried-supply input for comparison');
    for (const field of ['node','platform','os','logicalCpus']) assert.equal(old.environment[field],report.environment[field],`same ${field} for comparison`);
    assert.equal(old.environment.cpu,report.environment.cpu); assert.equal(old.environment.browser,report.environment.browser);
    assert.equal(old.browser.length,report.browser.length); assert.equal(old.runtime.length,report.runtime.length);
    report.comparison = { baselineArtifact: old.artifact.sha256, baselineHead: old.source.head, p95: [] };
    for (const row of report.browser) {
      const before = old.browser.find(b => b.viewport.width === row.viewport.width && b.highTide === row.highTide);
      assert.ok(before); assert.deepEqual(before.environment,row.environment,'same browser renderer, DPR and user agent');
      for (const metric of ['advance','present']) {
        const limit = Math.max(.5,before[metric].p95)*1.2;
        report.comparison.p95.push({ key:`${row.viewport.width}/${row.highTide}/${metric}`, before:before[metric].p95,after:row[metric].p95,limit });
        fail(`comparison/${row.viewport.width}/${row.highTide}/${metric}`,row[metric].p95,limit);
      }
    }
    for (const highTide of [false,true]) {
      const average = rows => rows.filter(r => r.hz===60 && r.highTide===highTide).reduce((n,r) => n+r.advance.p95,0)/2;
      const before=average(old.runtime),after=average(report.runtime),limit=Math.max(.5,before)*1.2;
      report.comparison.p95.push({key:`node/${highTide}/advance`,before,after,limit}); fail(`comparison/node/${highTide}`,after,limit);
    }
  }
  report.status = report.failures.length ? 'BUDGET_BLOCKED' : 'PASS';
} catch (error) { report.status = 'ERROR'; report.errors.push(String(error?.stack ?? error)); }
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(report.status, JSON.stringify(report.failures)); if (report.status !== 'PASS') process.exitCode = 1;
