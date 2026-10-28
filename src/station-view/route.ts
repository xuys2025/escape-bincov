/**
 * The station yard as the hideout's default view (decisions of 2026-10-10: enter the yard by default, the old tab page
 * stays as a shortcut fallback). This module is in the app's static graph; the Pixi view, its PNGs and its CSS load on
 * demand, so Node tests that import the UI never touch them.
 *
 * Ownership: the yard and the old tab page share the one HideoutRuntime / SaveSession. The Pixi Application is the one
 * the raid view parks between mounts. Every switch away from the yard flushes first; a failed flush keeps the yard and its dialog.
 */
import { app, audio, hideoutRuntime } from '../app';
import { navigation } from '../navigation';
import { gpuTextures, managedSlots, parkApp, takeApp } from '../pixi-app';
import { raidWorlds, sampleMallLayout, sampleMode, villageSeed } from '../raid-areas';
import { toast } from '../toast';
import { lifecycle } from '../view-lifecycle/scope';
import type { HideoutSnapshot, RunWorld } from '../hideout-runtime/contract';
import type { StationHost } from './host';

type Arrival = HideoutSnapshot['arrival'];
const params = () => new URLSearchParams(globalThis.location?.search ?? '');
/** Test fixture only (`?test=1&entry=tabs`): the legacy suites keep the old tab page as the hideout entry. */
export const stationDefault = () => !(params().get('test') === '1' && params().get('entry') === 'tabs');

let current: { host: StationHost; root: HTMLElement; pixi: import('pixi.js').Application } | null = null;
let starting = false;
/** Delivered-art report (test hook only reads it). */
let artReport: unknown = null;
/** Test hook (?test=1 only): the live host and lifecycle counters. */
let exposed = false;

/** Title "进入" / tab page "回到院子": upgrade at the boundary, then mount the yard. */
export async function enterStation(): Promise<boolean> {
  if (current || starting) return false;
  const entered = hideoutRuntime.enter();
  if (!entered.ok) { navigation().render(); toast(entered.message); return false; }
  return openStation(null);
}
/** Result page "返回": the Runtime hands over a one-time arrival; the yard plays the walk-in and the report. */
export async function returnToStation(): Promise<boolean> {
  if (current || starting) return false;
  const back = hideoutRuntime.returnToBase();
  if (!back.ok) { toast(back.message); return false; }
  return openStation(hideoutRuntime.consumeArrival());
}

/** The handle the page sees while the yard owns the hideout view (set before the old page is cleared). */
const handle = { checkpoint: () => !current || current.host.busy || hideoutRuntime.flush().ok };

async function openStation(arrival: Arrival): Promise<boolean> {
  app.station = handle;
  if (!navigation().hideoutExternal()) { app.station = null; return false; }
  starting = true;
  let root: HTMLElement | null = null, pixi: import('pixi.js').Application | null = null;
  try {
    document.documentElement.dataset.station = 'yard';
    root = document.createElement('div'); root.id = 'station-yard';
    const shadow = root.attachShadow({ mode: 'open' });
    const [{ StationHost }, { loadStationArt, artReport: report }, { loadCoastAssets }, { default: css }, { default: benchCss }] = await Promise.all([
      import('./host'), import('./art/station'), import('../coast-view/assets'), import('./station.css'), import('../gunsmith-view/bench.css')]);
    artReport = report;
    shadow.innerHTML = `<style>${css}\n${benchCss}</style><div class="stage"></div><div class="mount"></div>`;
    document.body.appendChild(root);
    const [art, sol] = await Promise.all([loadStationArt(), loadCoastAssets()]);
    pixi = await takeApp(); lifecycle.apps++;
    // Without WebGL Pixi falls back to its Canvas 2D renderer, which drops the additive emission pass (people would be
    // drawn as black silhouettes). The yard is only verified on WebGL; anything else takes the tab-page fallback.
    if (pixi.renderer.name !== 'webgl') throw new Error(`Station yard needs WebGL (got ${pixi.renderer.name}).`);
    pixi.canvas.setAttribute('aria-label', '滨科夫水产站：可走动的据点画面');
    shadow.querySelector('.stage')!.appendChild(pixi.canvas);
    const p = params(), test = p.get('test') === '1';
    const host: StationHost = new StationHost({
      app: pixi, shadow, mount: shadow.querySelector<HTMLElement>('.mount')!, rt: hideoutRuntime, sol, art,
      test, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, frozen: test && p.get('freeze') === '1', mood: 'night',
      touch: document.documentElement.classList.contains('mobile'), volume: app.save.settings.volume,
      arrival, world: app.runWorld, seed: app.seed, worlds: raidWorlds(), hooks: {
        departed: runId => { closeStation(); void navigation().startPreparedHideoutRaid(runId).then(ok => { if (!ok) { toast('行动已保存，但没能启动。请在标题页继续行动。'); navigation().changeState('menu'); } }); },
        seedFor: (world: RunWorld) => sampleMode() === 'village' && world === 'buildings' ? String(villageSeed()) : '',
        mallLayout: (world: RunWorld) => sampleMallLayout(world),
        tabs: () => leave(() => navigation().changeState('hideout')),
        title: () => { const r = hideoutRuntime.backToMenu(); if (!r.ok) { failed(r.message); return; } closeStation(); navigation().changeState('menu'); },
        exportSave: () => download(hideoutRuntime.exportBackup()),
        imported: () => {
          // A backup with a live raid resumes from the title, like the old import path.
          if (app.save.activeRun) { closeStation(); navigation().changeState('menu'); toast('备份中有进行中的行动，请在标题页继续。'); }
          else current?.host.resync();
        },
        volume: v => { const r = hideoutRuntime.setVolume(v); if (r.ok) audio.setVolume(app.save.settings.volume); else current?.host.ui.toast(r.message, 'error'); },
        audioStart: () => audio.start(),
        audioBus: () => audio.bus(),
      },
    });
    current = { host, root, pixi };
    host.resync();
    if (test) expose();
    if (test && p.get('at')) { const [x, y, d] = p.get('at')!.split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(y)) host.place(x, y, Number.isFinite(d) ? d : 6); }
    return true;
  } catch (error) {
    console.error(error);
    if (pixi) { resetCanvas(pixi); parkApp(pixi); lifecycle.apps--; }
    root?.remove();
    delete document.documentElement.dataset.station;
    app.station = null; current = null;
    // The old tab page is the fallback entry: the save is untouched, only the view failed.
    navigation().changeState('hideout');
    toast('院子画面启动失败，已切换到页签界面。');
    return false;
  } finally { starting = false; }
}

/** Unmount the yard and hand the page back to the original UI (the caller chooses the next state). */
export function closeStation() {
  const c = current; if (!c) return;
  current = null; app.station = null;
  c.host.destroy();
  resetCanvas(c.pixi); parkApp(c.pixi); lifecycle.apps--;
  c.root.remove();
  delete document.documentElement.dataset.station;
}
const resetCanvas = (pixi: import('pixi.js').Application) => { for (const k of ['width', 'height', 'cursor'] as const) pixi.canvas.style[k] = ''; };

/** Flush, then switch hosts; a failed write keeps the yard with its save dialog. */
function leave(next: () => void) {
  const r = hideoutRuntime.flush();
  if (!r.ok) { failed(r.message); return; }
  closeStation(); next();
}
function failed(message: string) { current?.host.ui.toast(message, 'error'); current?.host.ui.showStorage(); }

function download(text: string) {
  if (!text) { toast('浏览器内没有可导出的存档。'); return; }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `Escape-Bincov-save-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    current?.host.ui.toast('已生成备份文件，请确认下载完成。', 'ok');
  } catch { toast('备份下载失败，请重试。'); }
}

function expose() {
  if (exposed) return; exposed = true;
  (window as unknown as { __station: unknown }).__station = {
    get host() { return current?.host ?? null; },
    get mounted() { return !!current; },
    art: () => artReport,
    counts: () => ({ ...lifecycle, canvases: document.querySelectorAll('canvas').length + (current ? 1 : 0), roots: document.querySelectorAll('#station-yard').length,
      gpuTextures: gpuTextures(), managed: managedSlots(), heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0 }),
    /** Fixture seam: close the yard, let `seed` write the save (no listener sees its events), then enter again. */
    async reseed(seed: () => void) {
      if (current) { const r = hideoutRuntime.flush(); if (!r.ok) throw new Error(r.message); closeStation(); }
      seed(); hideoutRuntime.snapshot();
      await openStation(null);
    },
    /** View-only remount on the same Runtime (lifecycle check): closes the yard and enters it again. */
    async remount(times: number) {
      for (let i = 0; i < times; i++) {
        if (!current || current.host.busy) break;
        const r = hideoutRuntime.flush(); if (!r.ok) break;
        closeStation(); await openStation(null);
        await new Promise(res => setTimeout(res, 60));
      }
      navigation().render();
    },
  };
}
