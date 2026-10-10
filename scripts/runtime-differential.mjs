/** Compare pure Runtime against the preserved, built RaidScene under identical accepted inputs. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

await mkdir('test-results', { recursive: true });
const bundle = await build({ stdin: { contents: `export {CoastRaidRuntime,emptyIntent} from './src/raid-runtime/runtime';
export {SaveSession,createSessionState} from './src/session';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'iife', globalName: 'RuntimeFixture', target: 'es2020' });
const report = { startedAt: new Date().toISOString(), node: process.version, htmlSha256: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'),
  methodology: 'Built RaidScene and pure Runtime receive the same restored checkpoint, fixed Date.now, continuous world angle and frame times. Phaser render loop is stopped; AI, collision, RNG and rule updates remain real. Exact checkpoint and full layered state comparison after every frame; generated inventory UIDs are not normalized. This is simulated time, not real-time or visual acceptance.', cases: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
try {
  for (const layered of [false, true]) for (const seed of [42, 20261007]) {
    const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
    await page.locator('[data-action="enter"]').click();
    if (layered) await page.locator('#run-world').selectOption('buildings');
    await page.locator('#seed').fill(String(seed)); await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(({ layered, seed }) => {
      const { app, saveSession, playerInput } = window.__bincov, old = app.raid;
      app.game.loop.sleep(); old.releaseInput(); app.overlay = '';
      let now = 0; Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
      const wall = Date.now(); Date.now = () => wall;
      if (!old.checkpoint()) throw Error(app.storageError);
      const data = new Map([['escape-bincov.session.v2', JSON.stringify(saveSession.currentRecord())]]);
      const state = RuntimeFixture.createSessionState();
      const saves = new RuntimeFixture.SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }));
      if (!saves.initialize() || !saves.resumeRun()) throw Error(state.storageError);
      state.state = 'run'; const runtime = new RuntimeFixture.CoastRaidRuntime(state, saves);
      if (layered) old.restoreExpansion(runtime.snapshotExpansion()); else old.restore(runtime.snapshot());
      old.releaseInput();
      const diff = (a, b, path = '') => {
        if (Object.is(a, b)) return null;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return { path, baseline: a, runtime: b };
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diff(a[k], b[k], `${path}.${k}`); if (d) return d; }
        return null;
      };
      let shots = 0, frames = 0;
      for (let i = 0; i < 240; i++) {
        now += i % 13 === 0 ? 125 : 16;
        const angle = Math.atan2(Math.sin(i * .037), Math.cos(i * .037));
        const input = { ...RuntimeFixture.emptyIntent(), source: 'touch', aim: angle,
          move: { x: i % 80 < 40 ? 1 : -1, y: 0, sprint: i % 41 < 8 }, precise: i % 17 < 6,
          firePressed: i % 19 === 0, fireHeld: i % 37 < 3, commands: i === 130 ? ['reload'] : i === 180 ? ['knife'] : i === 190 ? ['primary'] : [] };
        playerInput.read = () => ({ x: input.move.x, y: input.move.y, sprint: input.move.sprint,
          aim: { x: Math.cos(angle), y: Math.sin(angle) }, pointer: { x: 0, y: 0 }, precise: input.precise,
          firePressed: input.firePressed, fireHeld: input.fireHeld, interactHeld: false, actions: new Set(input.commands), touch: true });
        old.update(); const batch = runtime.advance(now, input); shots += batch.events.filter(e => e.type === 'shot').length;
        const mismatch = diff(layered ? old.snapshotExpansion() : old.snapshot(), layered ? runtime.snapshotExpansion() : runtime.snapshot());
        if (mismatch) return { layered, seed, status: 'failed', frame: i, now, mismatch };
        frames++; if (runtime.ending) break;
      }
      return { layered, seed, status: 'passed', frames, shots, elapsed: runtime.elapsed, hp: runtime.hp, rng: runtime.snapshot().rng };
    }, { layered, seed });
    result.errors = errors; report.cases.push(result); console.log(JSON.stringify(result));
    await context.close(); assert.equal(result.status, 'passed'); assert.deepEqual(errors, []);
  }
} finally { await browser.close(); await writeFile('test-results/runtime-differential.json', JSON.stringify(report, null, 2)); }
