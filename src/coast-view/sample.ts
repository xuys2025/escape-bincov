/**
 * Village sample entry (opt-in with ?sample=village). Deploying or resuming a coast-buildings raid mounts the
 * Pixi host on the real Runtime instead of starting the Phaser RaidScene; without the flag nothing changes.
 * Only one of the two may own the SaveSession: the RaidScene is never started while this host is alive.
 */
import { app, audio, saveSession } from '../app';
import { createCoastRaidHost } from '../raid-runtime';
import { createTestCoastHost } from '../raid-runtime/test-support';
import { changeState, enterExternalRun, exportSave, toast } from '../ui';
import { CoastSampleHost, gpuTextures, type CoastHandle } from './host';
import { CoastView, type ViewOptions } from './scene';
import { lifecycle } from './scope';
import { SAMPLE_AREA } from './appearance';
import { generateRunBase } from '../world';

const params = () => new URLSearchParams(location.search);
export const sampleEnabled = () => params().get('sample') === 'village';
export const sampleSupports = () => app.expansion?.raid?.worldVersion === 'coast-buildings-v1';

/**
 * Playtest deploy with an empty seed field: take the first seed from the clock whose spawn lies in the dressed village
 * corner and whose two exits include the north checkpoint there, so the run starts in the finished area. This is the
 * same choice as typing that seed; spawn and exit rules are untouched. A typed seed is always used as typed.
 */
export function villageSeed(from = Date.now()): number {
  const inside = (p: { x: number; y: number }) => p.x >= SAMPLE_AREA.x && p.x < SAMPLE_AREA.x + SAMPLE_AREA.w && p.y >= SAMPLE_AREA.y && p.y < SAMPLE_AREA.y + SAMPLE_AREA.h;
  for (let seed = from; seed < from + 400; seed++) {
    const run = generateRunBase(seed);
    if (inside(run.spawn) && run.exits.some(e => e.id === 'north')) return seed;
  }
  return from;
}

let starting = false;
let testDriver: unknown = null;

export async function startCoastSample(paused = false): Promise<boolean> {
  if (app.coastSample || starting || !sampleSupports()) return false;
  starting = true;
  let created: ReturnType<typeof createCoastRaidHost> | null = null;
  try {
    enterExternalRun();
    // Only one renderer runs: the Phaser loop sleeps while the sample host owns the raid.
    app.game?.loop.sleep();
    const test = params().get('test') === '1';
    const p = params();
    const opts: ViewOptions = {
      debug: test && p.get('debug') === '1', xray: p.get('xray') !== '0', mood: Number(p.get('mood') ?? 0) === 1 ? 1 : 0,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      viewTiles: p.get('view') === '28' ? 28 : 24, collapseTall: p.get('collapse') !== '0',
      weather: p.get('weather') === 'clear' ? 'clear' : 'rain',
      // Loaded on demand: esbuild still inlines the module, but the app's module graph (and Node tests) never import PNGs.
      art: p.get('art') === 'placeholder' ? null : await (await import('./assets')).loadCoastAssets(),
    };
    created = test ? createTestCoastHost(app, saveSession, location.search) : createCoastRaidHost(app, saveSession);
    const host: CoastSampleHost = new CoastSampleHost(created as unknown as CoastHandle, app, saveSession, opts, () => finish(host), exportSave);
    app.coastSample = host;
    document.documentElement.dataset.coastSample = 'run';
    await host.mount(document.body);
    if (paused) host.pause('overlay');
    if (test) expose('driver' in created ? created.driver : null);
    return true;
  } catch (error) {
    console.error(error);
    (app.coastSample as CoastSampleHost | null)?.unmount();
    created?.services.cancelStart();
    testDriver = null;
    app.coastSample = null;
    delete document.documentElement.dataset.coastSample;
    app.game?.loop.wake();
    toast('新画面启动失败，行动已保存。刷新后可继续。');
    changeState('menu');
    return false;
  } finally { starting = false; }
}

/** Settlement is committed: release the Runtime, unmount the view, then hand the result screen to the original UI. */
function finish(host: CoastSampleHost) {
  host.runtime.dispose();
  host.unmount();
  testDriver = null;
  if (app.coastSample === host) app.coastSample = null;
  delete document.documentElement.dataset.coastSample;
  app.game?.loop.wake();
  // The result screen plays the extract/death cue; a run settled from the pause menu still has audio suspended.
  audio.start();
  changeState('result');
}

function expose(driver: unknown) {
  testDriver = driver;
  (window as unknown as { __bincovSample: unknown }).__bincovSample = {
    get host() { return app.coastSample; }, get driver() { return testDriver; },
    get initial() { return app.coastSample; },
    counts: () => ({ ...lifecycle, liveViews: CoastView.live.size, canvases: document.querySelectorAll('canvas').length,
      sampleRoots: document.querySelectorAll('.coast-sample').length,
      art: [...CoastView.live].some(v => v.opts.art) ? 'sol' : 'placeholder',
      atlasPages: [...CoastView.live].reduce((n, v) => n + v.tex.atlas.stats.pages, 0),
      largeTextures: [...CoastView.live].reduce((n, v) => n + v.tex.atlas.stats.largeTextures, 0),
      gpuTextures: gpuTextures(),
      heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0 }),
    /** View-only remount on the same live Runtime: exercises Pixi/listener/texture ownership without ending the raid. */
    async remount(times: number) {
      for (let i = 0; i < times; i++) {
        const old = app.coastSample as CoastSampleHost; if (!old) break;
        old.unmount();
        const next = new CoastSampleHost(old.handle, app, saveSession, old.opts, () => finish(next), exportSave);
        app.coastSample = next; await next.mount(document.body);
        await new Promise(r => setTimeout(r, 60));
      }
    },
  };
}
