/**
 * 试枪场 entry (start the game.html?range=1, or 试枪场.html next to it): the shooting range page. The real raid view and
 * Runtime run on the range's in-memory save (raid.ts); the page never opens the real save: no ownSession or initSave,
 * no browser storage, none of the app/saveSession state of the ordinary page (the shared synth audio only). When the
 * raid ends (timeout or abandon) and its in-memory settlement is shown, the page reloads into a fresh range.
 * ?test=1 adds the read-only window.__bincovRange hook for scripts/range-test.mjs.
 */
import { audio } from '../app';
import { esc } from '../html';
import { wrapCoastRuntime } from '../raid-runtime/host';
import type { RaidIntent, RaidRuntime } from '../raid-runtime/contract';
import { CoastSampleHost } from '../coast-view/host';
import type { ViewOptions } from '../coast-view/scene';
import { createRangeRaid, ShootingRange } from './raid';
import { RangePanel } from './panel';

/** Phone layout, the same rule as main.ts resize(): the raid host takes its touch controls from html.mobile. */
function phoneLayout() {
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
        && Math.min(innerWidth, innerHeight) < 900 && Math.max(innerWidth, innerHeight) < 1200;
    document.documentElement.classList.toggle('mobile', touch);
}

export async function startRange(): Promise<void> {
    const params = new URLSearchParams(location.search), test = params.get('test') === '1';
    // The title page: this page without the range flag or any other option.
    const title = location.href.split(/[?#]/)[0];
    try {
        phoneLayout();
        addEventListener('resize', phoneLayout);
        for (const query of ['(pointer: coarse)', '(any-pointer: fine)']) matchMedia(query).addEventListener('change', phoneLayout);
        const { session, saves, core } = createRangeRaid(), range = new ShootingRange(core);
        // The raid view's own URL options (coast-view/sample.ts startCoastSample), without the sample marks.
        const opts: ViewOptions = {
            debug: test && params.get('debug') === '1', xray: params.get('xray') !== '0', mood: Number(params.get('mood') ?? 0) === 1 ? 1 : 0,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            viewTiles: params.get('view') === '28' ? 28 : 24, collapseTall: params.get('collapse') !== '0',
            weather: params.get('weather') === 'clear' ? 'clear' : 'rain',
            scale: params.get('crisp') === '1' ? 'near' : params.get('crisp') === '0' ? 'fit' : 'whole',
            art: null, mallArt: null, sampleMarks: false,
        };
        if (params.get('art') !== 'placeholder') opts.art = await import('../coast-view/assets').then(m => m.loadCoastAssets())
            .then(art => import('../coast-view/pose-assets').then(m => m.withPoses(art)).catch(error => { console.error(error); return art; }));
        const wrapped = wrapCoastRuntime(core, session, saves);
        let panel: RangePanel | null = null;
        // Every batch the Runtime publishes passes the range right after the advance (counts, targets, bag), then the panel.
        const runtime: RaidRuntime = Object.freeze({ ...wrapped.runtime, advance: (now: number, intent: RaidIntent) => {
            const batch = range.observe(wrapped.runtime.advance(now, intent));
            panel?.update(batch);
            return batch;
        } });
        const host: CoastSampleHost = new CoastSampleHost({ runtime, services: wrapped.services }, session, saves, opts,
            () => location.reload(), () => host.toast('试枪场不保存进度，无需备份。'));
        document.documentElement.dataset.coastSample = 'range';
        audio.setVolume(session.save.settings.volume);
        await host.mount(document.body);
        panel = new RangePanel(range, host, title);
        // Browsers start audio only from a gesture; after the first one the raid's sound layer follows pauses by itself.
        const gesture = () => { if (host.lastBatch?.frame.phase === 'running') audio.start(); };
        addEventListener('pointerdown', gesture, true);
        addEventListener('keydown', gesture, true);
        if (test) (window as unknown as { __bincovRange: unknown }).__bincovRange = Object.freeze({
            get host() { return host; },
            stats: () => structuredClone(range.stats),
            targets: () => range.positions(),
        });
    } catch (error) {
        console.error(error);
        delete document.documentElement.dataset.coastSample;
        document.getElementById('frame')?.remove();
        const notice = document.createElement('section');
        notice.className = 'webgl-required panel';
        notice.setAttribute('role', 'alert');
        notice.innerHTML = `<h2>试枪场启动失败</h2><p>刷新页面重试。</p><p><a href="${esc(title)}">返回标题</a></p>`;
        document.body.appendChild(notice);
    }
}
