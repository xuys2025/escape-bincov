/** Real-time automated play: read game state, act only through keyboard/mouse. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { findPath, lineOfSight } from '../src/world.ts';
import { corridor, spacePath } from '../src/spatial.ts';
import { ITEMS, fits } from '../src/domain.ts';
import { browserOptions } from './browser-options.mjs';
import { readNaturalPlayState } from './natural-play-state.mjs';
import { prepareNaturalLoadout, PreparationBlocked } from './natural-play-preparation.mjs';
import { NATURAL_PREPARATION_POLICY, NATURAL_RETREAT_POLICY, naturalRetreatReason, chooseSafeContainer, confirmedNativeTransfer } from './natural-play-policy.mjs';

const minutes = Number(process.env.BINCOV_PLAY_MINUTES || 10);
assert.ok(minutes >= 1 && minutes <= 60);
const world = process.env.BINCOV_PLAY_WORLD || 'coast';
const firstSeed = Number(process.env.BINCOV_PLAY_SEED || 42);
assert.ok(Number.isInteger(firstSeed) && firstSeed > 0 && firstSeed <= 0xffffffff - 60);
const entry = resolve(process.env.BINCOV_PLAY_ENTRY || 'dist/index.html');
assert.ok(['coast', 'buildings'].includes(world), 'BINCOV_PLAY_WORLD must be coast or buildings');
const report = { htmlSha256: createHash('sha256').update(await readFile(entry)).digest('hex'), entry, startedAt: new Date().toISOString(), minutes, world, firstSeed,
  methodology: `Automated real-time session on ${world === 'coast' ? 'the classic coast' : 'the layered street with new enemy encounters'} (2.5D view). Test hook is read-only: no teleports, no clock changes, no changes to health, enemies, inventory or RNG. All actions use visible buttons and real keyboard/mouse, including E opening and native inventory drag for crates and corpses. This is not a human fun/balance evaluation.`, preparationPolicy: NATURAL_PREPARATION_POLICY, preparation: [], decisions: [], timing: { method: 'Wall intervals attributed to the previous observed UI state (including its UI actions); simulation sums nonnegative published run-clock deltas. Neither is a GPU/active-fun measurement.', runWallSeconds: 0, baseWallSeconds: 0, resultWallSeconds: 0, otherWallSeconds: 0, simulationSeconds: 0 }, enemyPhases: {}, containerLoot: { opened: [], transfers: [], threatenedClosures: 0 }, samples: [], outcomes: [], errors: [], externalRequests: [] };
report.retreatPolicy = NATURAL_RETREAT_POLICY;
const out = resolve(process.env.BINCOV_PLAY_OUT || 'test-results'); await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
const page = await context.newPage();
page.on('pageerror', e => report.errors.push(e.message));
context.on('request', r => { if (/^https?:/.test(r.url())) report.externalRequests.push(r.url()); });
const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const space = s => ({ definition: s.map, doors: s.doors, highTide: s.high });
const route = (s, to) => world === 'coast' ? findPath(s, to, s.high) : spacePath(space(s), s, to);
const sight = (s, to) => world === 'coast' ? lineOfSight(s, to) : corridor(space(s), s, to, 'sight');
let held = new Set(), runNumber = 0, goal = null, path = [], repathAt = 0, lastSample = 0, streetStep = 0, retreating = false;
const streetApproach = [{ x:6.5*32,y:24.5*32 },{ x:20.5*32,y:24.5*32 }];
report.observationPolicy = 'First complete a native transfer at a dynamically reachable container whose route passes the original 220px/LOS danger boundary. Then approach a visible new enemy and observe its actual windup. No game-state mutations.';
let visited = new Set(), lastPosition, stuckAt = Date.now(), lastHeal = 0;
let observedAt = null, observedState = 'hideout', observedRun = null, observedSimulation = 0;
function observeTime(s, now) {
  const key = observedState === 'run' ? 'runWallSeconds' : observedState === 'hideout' ? 'baseWallSeconds' : observedState === 'result' ? 'resultWallSeconds' : 'otherWallSeconds';
  if (observedAt !== null) report.timing[key] += Math.max(0, now - observedAt) / 1000;
  if (s?.state === 'run') report.timing.simulationSeconds += Math.max(0, s.elapsed - (s.runId === observedRun ? observedSimulation : 0));
  observedAt = now;
  if (s) { observedState = s.state; observedRun = s.runId ?? null; observedSimulation = s.elapsed ?? 0; }
}
async function keys(next) {
  for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
  for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
  held = next;
}
/** Read the published frame and the test driver's cumulative total; nothing here changes the world. */
async function snapshot() {
  return page.evaluate(readNaturalPlayState);
}
/** Client point of a world point on the chest plane, where shots are aimed. */
const screenOf = point => page.evaluate(p => window.__bincovSample.host.view.worldToClient({ x: p.x, y: p.y - 22 }), point);
function destination(inv, item) {
  const stack = inv.items.find(other => other.id === item.id && !!other.relief === !!item.relief && other.qty + item.qty <= ITEMS[item.id].stack);
  if (stack) return { x: stack.x, y: stack.y };
  for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++) if (fits(inv, item.id, x, y, undefined, !!item.rotated)) return { x, y };
  return null;
}
async function lootOpenContainer(s) {
  await keys(new Set());
  const container = s.containers.find(c => c.id === s.lootContext?.containerId);
  if (!container?.inventory) { await page.keyboard.press('Escape'); return; }
  if (!report.containerLoot.opened.some(c => c.run === runNumber && c.id === container.id)) {
    report.containerLoot.opened.push({ run: runNumber, id: container.id, kind: container.kind, elapsed: s.elapsed });
    await page.screenshot({ path: resolve(out, `natural-play-container-${runNumber}-${report.containerLoot.opened.length}.png`) });
  }
  if (s.hp < 60 || s.bleeding || s.enemies.some(e => dist(e, s) < 220 && sight(s, e))) {
    report.containerLoot.threatenedClosures++;
    visited.add(`${container.x},${container.y}`); goal = null;
    await page.keyboard.press('Escape'); return;
  }
  const candidate = container.inventory.items.map(item => ({ item, cell: destination(s.bag, item) })).find(candidate => candidate.cell);
  if (!candidate) { visited.add(`${container.x},${container.y}`); goal = null; await page.keyboard.press('Escape'); return; }
  const { item, cell } = candidate;
  // The panel places an item by the ghost's top-left corner: grab just inside the item, release just inside the cell.
  const from = await page.locator(`.coast-sample [data-source="container"][data-uid="${item.uid}"]`).boundingBox();
  const to = await page.locator('.coast-sample [data-grid="bag"]').evaluate((el, at) => {
    const r = el.getBoundingClientRect(), size = Number(el.dataset.cell) * r.width / el.offsetWidth;
    return { x: r.left + at.x * size + 6, y: r.top + at.y * size + 6 };
  }, cell);
  if (!from) { await page.keyboard.press('Escape'); return; }
  await page.mouse.move(from.x + 6, from.y + 6); await page.mouse.down();
  await page.mouse.move(from.x + 22, from.y + 22, { steps: 3 }); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(80);
  const after = await snapshot();
  if (confirmedNativeTransfer(s, after, container.id, item)) {
    const first = report.containerLoot.transfers.length === 0;
    report.containerLoot.transfers.push({ run: runNumber, containerId: container.id, kind: container.kind, item: item.id, qty: item.qty, elapsed: s.elapsed });
    if (first) { visited.add(`${container.x},${container.y}`); goal = null; await page.keyboard.press('Escape'); }
  }
  else { visited.add(`${container.x},${container.y}`); goal = null; await page.keyboard.press('Escape'); }
}
try {
  await page.goto(pathToFileURL(entry).href + '?test=1&entry=tabs');
  await action('enter').click();
  const start = Date.now(), deadline = start + minutes * 60000;
  report.timing.playStartedAt = new Date(start).toISOString(); observedAt = start;
  while (Date.now() < deadline || (await snapshot()).state === 'run') {
    const s = await snapshot(), now = Date.now();
    observeTime(s, now);
    if (s.pending && s.state === 'run') {
      // Say why the terminal write failed: the session's storage error and the Runtime's last rejections.
      const why = await page.evaluate(() => { const a = window.__bincov.app, h = window.__bincovSample?.host;
        return { storageOK: a.storageOK, storageError: a.storageError, conflict: a.conflict, rejected: h?.eventLog?.filter(e => e.type === 'rejected').slice(-6) }; });
      report.storageFailure = why;
      assert.fail(`Storage must stay available: ${JSON.stringify(why)}`);
    }
    assert.equal(s.pending, s.state === 'run' ? false : undefined, 'Storage must stay available');
    if (s.state === 'result') {
      await keys(new Set()); report.outcomes.push(s.result);
      console.log('Run completed', s.result.outcome, 'kills', s.result.kills);
      await action('return').click(); continue;
    }
    if (s.state === 'hideout') {
      if (now >= deadline) break;
      await prepareNaturalLoadout(page, report.preparation, runNumber + 1);
      await page.locator('#run-world').selectOption(world);
      await page.locator('#seed').fill(String(firstSeed + runNumber++)); await action('deploy').click();
      await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 30000 });
      goal = null; path = []; visited = new Set(); lastPosition = null; stuckAt = now; streetStep = 0; retreating = false;
      continue;
    }
    if (s.state !== 'run') throw new Error('Unexpected state ' + s.state);
    for (const e of s.enemies.filter(e => e.tactics && dist(e, s) < 430 && sight(s, e))) {
      const key = `${e.tactics.archetype}/${e.tactics.phase}`;
      report.enemyPhases[key] = (report.enemyPhases[key] ?? 0) + 1;
    }
    // A street run may incidentally interact with stairs while looting. Its published landing is the route back;
    // traversal remains native E and keyboard movement, never a fixture teleport.
    if (world === 'buildings' && s.map.id !== 'coast') {
      goal = s.map.entries[0]?.at ?? goal;
      if (goal && dist(goal, s) < 35 && !s.overlay) { await keys(new Set()); await page.keyboard.press('e'); continue; }
    }
    // A loot overlay keeps the world running. Finish or close it before combat input.
    if (s.overlay === 'loot') { await lootOpenContainer(s); continue; }
    if (s.overlay) {
      assert.equal(s.saveError, false, 'World checkpoints and the settlement must remain writable during natural play');
      if (s.overlay === 'ending') { await keys(new Set()); await page.waitForTimeout(200); continue; }
      await keys(new Set()); await page.keyboard.press('Escape'); continue;
    }
    if (now - lastSample > 30000) {
      const sample = { realSeconds: Math.round((now - start) / 1000), run: runNumber, elapsed: Math.round(s.elapsed), hp: Math.round(s.hp), kills: s.kills, highTide: s.high, ammo: s.ammo, medical: s.medical, goal: goal?.id ?? null, x: Math.round(s.x), y: Math.round(s.y) };
      report.samples.push(sample); console.log('PLAY', JSON.stringify(sample)); lastSample = now;
      await writeFile(resolve(out, 'natural-play-progress.json'), JSON.stringify(report, null, 2));
    }
    if (now - lastHeal > 1500 && s.medical && (s.hp < 70 || s.bleeding)) { await page.keyboard.press('q'); lastHeal = now; }
    if (s.mag === 0 && s.ammo && !s.reload) await page.keyboard.press('r');
    const target = s.enemies.filter(e => dist(e, s) < 430 && sight(s, e)).sort((a, b) => dist(a, s) - dist(b, s))[0];
    const observedWindup = Object.keys(report.enemyPhases).some(key => key.endsWith('/windup'));
    const needsFirstLoot = report.containerLoot.transfers.length === 0;
    const waitingForTell = world === 'buildings' && !observedWindup && !needsFirstLoot;
    if (target && (!needsFirstLoot || dist(target, s) < 220) && !(waitingForTell && target.tactics) && s.mag && !s.reload && s.cooldown <= 0) {
      const { x, y } = await screenOf(target);
      if (x > 0 && x < 1280 && y > 0 && y < 720) await page.mouse.click(x, y, { delay: 40 });
    }
    const retreatReason = naturalRetreatReason(s);
    if (!retreating && retreatReason) report.decisions.push({ run: runNumber, elapsed: s.elapsed, reason: retreatReason });
    retreating ||= !!retreatReason;
    const evacuate = retreating || now >= deadline || s.elapsed >= 550;
    if (evacuate) {
      goal = [...s.exits].sort((a, b) => dist(a, s) - dist(b, s))[0] ?? s.map.entries[0]?.at;
      if (dist(goal, s) < 43) {
        await keys(new Set()); await page.keyboard.down('e'); await page.waitForTimeout(3300); await page.keyboard.up('e'); continue;
      }
    } else if (needsFirstLoot) {
      if (goal && dist(goal, s) < 35) {
        await keys(new Set());
        if (s.interaction?.kind === 'container') {
          await page.keyboard.press('e', { delay: 70 });
          if ((await snapshot()).overlay === 'loot') continue;
        }
        report.decisions.push({ run: runNumber, elapsed: s.elapsed, reason: 'first-loot-interaction-unavailable', target: goal.id, interaction: s.interaction?.kind ?? null });
        visited.add(`${goal.x},${goal.y}`); goal = null;
      }
      const chosen = chooseSafeContainer(s, visited, route, sight);
      if (!chosen) throw new Error('Natural first loot blocked: no live route satisfies the original 220px/LOS danger boundary');
      if (goal?.id !== chosen.container.id) report.decisions.push({ run: runNumber, elapsed: s.elapsed, reason: 'safe-first-container', target: chosen.container.id, routePoints: chosen.path.length });
      goal = chosen.container;
    } else if (waitingForTell && s.map.id === 'coast' && streetStep < streetApproach.length) {
      if(dist(streetApproach[streetStep],s)<35)streetStep++;
      goal=streetApproach[Math.min(streetStep,streetApproach.length-1)];
    } else if (waitingForTell && s.map.id === 'coast' && target?.tactics) {
      const radius=Math.min(160,Math.max(28,target.tactics.range*.75)),bearing=Math.atan2(s.y-target.y,s.x-target.x);
      const candidates=Array.from({length:8},(_,i)=>({x:target.x+Math.cos(bearing+i*Math.PI/4)*radius,y:target.y+Math.sin(bearing+i*Math.PI/4)*radius}));
      goal=candidates.filter(p=>route(s,p).length).sort((a,b)=>dist(a,s)-dist(b,s))[0]??target;
      if(dist(goal,s)<12){await keys(new Set());await page.waitForTimeout(120);continue;}
    } else if (!goal || dist(goal, s) < 35) {
      if (goal) {
        await keys(new Set()); await page.keyboard.press('e', { delay: 70 });
        if ((await snapshot()).overlay === 'loot') continue;
        visited.add(`${goal.x},${goal.y}`);
      }
      // Later looting uses the same live route/danger boundary as the first native transfer.
      const choices = [...s.containers, ...s.loot.map(l => ({ ...l, id: `ground-${l.id}-${l.x},${l.y}`, items: 1 }))];
      const chosen = chooseSafeContainer({ ...s, containers: choices }, visited, route, sight);
      if (chosen) goal = chosen.container;
      else { retreating = true; goal = null; await keys(new Set()); continue; }
    }
    if (!lastPosition || dist(lastPosition, s) > 10) { lastPosition = { x: s.x, y: s.y }; stuckAt = now; }
    if (now - stuckAt > 7000) { visited.add(`${goal.x},${goal.y}`); goal = null; stuckAt = now; await keys(new Set()); continue; }
    if (now >= repathAt || !path.length) { path = route(s, goal); repathAt = now + 750; }
    while (path.length && dist(path[0], s) < 12) path.shift();
    const point = path[0] ?? goal, next = new Set();
    if (point.x - s.x > 6) next.add('d'); if (point.x - s.x < -6) next.add('a');
    if (point.y - s.y > 6) next.add('s'); if (point.y - s.y < -6) next.add('w');
    if (evacuate && next.size) next.add('Shift');
    await keys(next); await page.waitForTimeout(120);
    if (now > deadline + 150000) throw new Error('Could not finish the final run within the session limit');
  }
  await keys(new Set());
  const final = await snapshot();
  report.finalStats = final.stats;
  if (final.state === 'result') report.outcomes.push(final.result);
  await page.screenshot({ path: resolve(out, 'natural-play-end.png') });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  assert.ok(report.containerLoot.transfers.length > 0, 'Natural play must visibly open a container and complete at least one native drag transfer');
  if (world === 'buildings') assert.ok(Object.keys(report.enemyPhases).some(key => key.endsWith('/windup')), 'observe a new enemy preparing an attack during real play');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; if (error instanceof PreparationBlocked) report.preparationBlocked = { reason: error.reason, facts: error.facts }; console.error(error); process.exitCode = 1; }
finally {
  observeTime(null, Date.now());
  await keys(new Set()).catch(() => {}); await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'natural-play-report.json'), JSON.stringify(report, null, 2));
}
