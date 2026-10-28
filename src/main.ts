import { drawGunLayout, gunArtCaches, loadGunsmithArt } from './art/gunsmith-compose';
import { gunArtLayout } from './art/gunsmith-layout';
import { loadPixelFont } from './font';
import { loadTitleArt } from './title/art';
import { prepareTitleRenderer } from './title/scene';
import { app, audio, saveSession, hideoutRuntime } from './app';
import { initSave, installInventoryDrag, closeOverlay, setOverlay, setPhoneLayout, persist, render, startPreparedHideoutRaid } from './ui';
import { toast } from './toast';
import { SAVE_KEY } from './domain';
import { SESSION_KEY, ownSession } from './recovery-store';
import { defaultWorld } from './raid-areas';
import { showWebglRequired, webglSupported } from './webgl';
import { showScreen, titleScene } from './screen';

async function boot() {
    // Devices without WebGL are not supported: show the notice before the save is read.
    if (!webglSupported()) { showWebglRequired(); return; }
    // 试枪场 (?range=1): a playtest page on an in-memory save (src/range). It leaves here, before the real save is opened.
    const range = new URLSearchParams(location.search).get('range') === '1';
    // Sol's gunsmith images (24 KB) decode once here, so every view draws them synchronously (art/gunsmith-compose.ts).
    await Promise.all([loadPixelFont(), range ? null : loadTitleArt(), loadGunsmithArt()]);
    if (range) { const { startRange } = await import('./range'); await startRange(); return; }
    const ownership = await ownSession(navigator.locks);
    initSave(ownership.owned);
    app.runWorld = defaultWorld();
    app.menuMotion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    await prepareTitleRenderer();
    const coarse = matchMedia('(pointer: coarse)'), fine = matchMedia('(any-pointer: fine)');
    installInventoryDrag();
    let previousWidth = 0, previousHeight = 0, shown = false;
    function resize() {
        const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
        // Phone layout is a presentation choice, not permission to use a keyboard or mouse.
        // Hybrid computers and wide coarse-only screens keep the desktop UI.
        const touch = coarse.matches && !fine.matches && Math.min(innerWidth, innerHeight) < 900 && Math.max(innerWidth, innerHeight) < 1200;
        const modeChanged = document.documentElement.classList.contains('mobile') !== touch;
        document.documentElement.classList.toggle('mobile', touch);
        setPhoneLayout(touch);
        const width = visualViewport?.width ?? innerWidth, height = visualViewport?.height ?? innerHeight;
        document.documentElement.style.setProperty('--view-height', `${height}px`);
        const style = getComputedStyle(document.documentElement);
        const safeX = (parseFloat(style.getPropertyValue('--safe-left')) || 0) + (parseFloat(style.getPropertyValue('--safe-right')) || 0);
        const safeY = (parseFloat(style.getPropertyValue('--safe-top')) || 0) + (parseFloat(style.getPropertyValue('--safe-bottom')) || 0);
        const scale = touch ? Math.min((width - safeX) / 960, (height - safeY) / 540) : Math.max(.25, Math.floor(Math.min(innerWidth / 960, innerHeight / 540)) || Math.min(innerWidth / 960, innerHeight / 540));
        document.getElementById('frame')!.style.transform = touch ? 'none' : `scale(${scale})`;
        document.documentElement.style.setProperty('--world-scale', String(scale));
        const changed = Math.abs(width - previousWidth) > 2 || Math.abs(height - previousHeight) > 2;
        previousWidth = width; previousHeight = height;
        // The raid and yard hosts handle their own resize, pause and input release.
        if ((modeChanged || (changed && app.state === 'hideout' && !editing)) && shown) render();
    }
    addEventListener('resize', resize); visualViewport?.addEventListener('resize', resize); coarse.addEventListener('change', resize); fine.addEventListener('change', resize);
    resize();
    // The title screen: the layered scene behind the HTML menu.
    showScreen('menu', app.menuMotion); render(); shown = true;
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
        if (!e.matches) return;
        app.menuMotion = false;
        if (app.state === 'menu') {
            titleScene()?.setMotion(false);
            render();
        }
    });
    const suspend = () => {
        audio.stop();
        // The raid host pauses itself; the yard pauses practice by itself (visibility and focus), and leaving the page
        // writes its pending input first.
        app.station?.checkpoint();
    };
    addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
    addEventListener('pagehide', () => { suspend(); ownership.release(); });
    addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
    addEventListener('beforeunload', e => { app.coastSample?.checkpoint(); app.station?.checkpoint(); if (app.pendingSettlement || !app.storageOK) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('contextmenu', e => { if ((e.target as HTMLElement).closest('#game')) e.preventDefault(); });
    addEventListener('keydown', e => {
        if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
        if (app.coastSample || app.station) return;
        // Title dialogs and the tab page's perk preview keep Tab inside themselves.
        const modal = app.state === 'menu' || app.state === 'hideout' ? document.querySelector<HTMLElement>('#ui [aria-modal="true"]') : null;
        if (modal && e.key === 'Tab') {
            const targets = Array.from(modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const index = targets.indexOf(document.activeElement as HTMLButtonElement);
            if (index < 0 || (e.shiftKey ? index === 0 : index === targets.length - 1)) {
                e.preventDefault(); targets[e.shiftKey ? targets.length - 1 : 0]?.focus();
            }
            return;
        }
        if (e.repeat) return;
        if (e.key === 'Escape') closeOverlay();
    });
    addEventListener('storage', e => {
        if (e.key !== SESSION_KEY && e.key !== SAVE_KEY && e.key !== null) return;
        saveSession.markConflict();
        toast('另一个窗口已更新存档，本页已停止操作。请导出需要保留的进度，再刷新本页。');
    });
    // Explicitly opt-in acceptance hooks; never available in the normal game.
    if (new URLSearchParams(location.search).get('test') === '1')
        (window as any).__bincov = { app, persist, setOverlay, saveSession, hideoutRuntime, startPreparedHideoutRaid, gunsmithArt: { layout: gunArtLayout, draw: drawGunLayout, caches: gunArtCaches }, get title() { return titleScene(); } };
}
void boot();
