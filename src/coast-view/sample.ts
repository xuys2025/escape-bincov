/**
 * The raid view: every raid runs on this Pixi host over the real Runtime, and a new mall raid deploys layout revision 3.
 * Raids started before the switch (classic coast checkpoints, mall layout 1) resume and settle here too. Only one host
 * may own the SaveSession at a time.
 *
 * ?sample=village and ?sample=mall remain playtest entries: they preselect the area, pick a village seed in the dressed
 * corner, and mark the areas the samples have not dressed yet.
 */
import { app, audio, saveSession } from '../app';
import { createCoastRaidHost } from '../raid-runtime';
import { createTestCoastHost } from '../raid-runtime/test-support';
import { navigation } from '../navigation';
import { gpuTextures, managedSlots } from '../pixi-app';
import { sampleEnabled } from '../raid-areas';
import { exportSave } from '../save-export';
import { toast } from '../toast';
import { CoastSampleHost } from './host';
import { CoastView, type ViewOptions } from './scene';
import { lifecycle } from './scope';
import { isMallWorld } from '../mall-world';

// Node tests render the UI without a location: no flags there.
const params = () => new URLSearchParams(globalThis.location?.search ?? '');
/**
 * The view draws every raid in the save: coast-buildings, mall layouts 1-3 (a raid keeps the layout it deployed on
 * until it ends) and the classic coast's checkpoint raids started before that area closed.
 */
export const sampleSupports = () => !!app.expansion?.raid || !!app.checkpoint;

let starting = false;
let testDriver: unknown = null;

export async function startCoastSample(paused = false): Promise<boolean> {
  if (app.coastSample || starting || !sampleSupports()) return false;
  starting = true;
  let created: ReturnType<typeof createCoastRaidHost> | null = null;
  try {
    navigation().enterExternalRun();
    const test = params().get('test') === '1';
    const p = params();
    const opts: ViewOptions = {
      debug: test && p.get('debug') === '1', xray: p.get('xray') !== '0', mood: Number(p.get('mood') ?? 0) === 1 ? 1 : 0,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      viewTiles: p.get('view') === '28' ? 28 : 24, collapseTall: p.get('collapse') !== '0',
      weather: p.get('weather') === 'clear' ? 'clear' : 'rain',
      scale: p.get('crisp') === '1' ? 'near' : p.get('crisp') === '0' ? 'fit' : 'whole',
      art: null, mallArt: null, sampleMarks: sampleEnabled(),
    };
    // Loaded on demand: esbuild still inlines the modules, but the app's module graph (and Node tests) never import PNGs.
    // The mall samples are optional: without them the mall floors keep the generic placeholder pipeline.
    if (p.get('art') !== 'placeholder') [opts.art, opts.mallArt] = await Promise.all([
      // The hurt and recovery frames (#75) are optional too: without them a blow keeps the idle body.
      import('./assets').then(m => m.loadCoastAssets()).then(art => import('./pose-assets').then(m => m.withPoses(art)).catch(error => { console.error(error); return art; })),
      isMallWorld(app.expansion?.raid?.worldVersion) ? import('./mall-art-load').then(m => m.loadMallAssets()).catch(error => { console.error(error); return null; }) : null,
    ]);
    created = test ? createTestCoastHost(app, saveSession, location.search) : createCoastRaidHost(app, saveSession);
    const host: CoastSampleHost = new CoastSampleHost(created, app, saveSession, opts, () => finish(host), exportSave);
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
    toast('新画面启动失败，行动已保存。刷新后可继续。');
    navigation().changeState('menu');
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
  // The result screen plays the extract/death cue; a run settled from the pause menu still has audio suspended.
  audio.start();
  navigation().changeState('result');
}

function expose(driver: unknown) {
  testDriver = driver;
  (window as unknown as { __bincovSample: unknown }).__bincovSample = {
    get host() { return app.coastSample; }, get driver() { return testDriver; },
    get initial() { return app.coastSample; },
    counts: () => ({ ...lifecycle, liveViews: CoastView.live.size, canvases: document.querySelectorAll('canvas').length,
      sampleRoots: document.querySelectorAll('.coast-sample').length,
      art: [...CoastView.live].some(v => v.opts.art) ? 'sol' : 'placeholder',
      mallArt: [...CoastView.live].some(v => v.opts.mallArt) ? 'sol' : 'placeholder',
      atlasPages: [...CoastView.live].reduce((n, v) => n + v.tex.atlas.stats.pages, 0),
      largeTextures: [...CoastView.live].reduce((n, v) => n + v.tex.atlas.stats.largeTextures, 0),
      gpuTextures: gpuTextures(),
      managedEmpty: managedSlots().empty, managedLive: managedSlots().live,
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
