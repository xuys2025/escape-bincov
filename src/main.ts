import Phaser from 'phaser';
import { loadPixelFont } from './font';
import { loadTitleArt } from './title/assets';
import { BootScene, MenuScene, HideoutScene, RaidScene, ResultScene } from './game';
import { BaseScene } from './base-scene';
import { app, audio, saveSession } from './app';
import { initSave, installInventoryDrag, closeOverlay, setOverlay, persist, toast, render } from './ui';
import { SAVE_KEY } from './domain';
import { SESSION_KEY, ownSession } from './recovery-store';
import { playerInput } from './input';
import { installControls } from './mobile';
import { sampleEnabled } from './coast-view/sample';

async function boot() {
    await Promise.all([loadPixelFont(), loadTitleArt()]);
    const ownership = await ownSession(navigator.locks);
    initSave(ownership.owned);
    if (sampleEnabled()) app.runWorld = 'buildings';
    app.menuMotion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    app.game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 960, height: 540, backgroundColor: '#122021', pixelArt: true, roundPixels: true, antialias: false, audio: { noAudio: true }, input: { mouse: { preventDefaultWheel: true } }, fps: { target: 60, smoothStep: false }, scene: [BootScene, MenuScene, HideoutScene, BaseScene, RaidScene, ResultScene], render: { powerPreference: 'high-performance' } });
    const coarse = matchMedia('(pointer: coarse)'), fine = matchMedia('(any-pointer: fine)');
    installInventoryDrag();
    const controls = installControls(name => setOverlay(app.baseWalking ? 'base-menu' : name), () => app.state === 'run' || app.baseWalking, () => audio.start());
    let previousWidth = 0, previousHeight = 0;
    function resize() {
        const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
        // Phone layout is a presentation choice, not permission to use a keyboard or mouse.
        // Hybrid computers and wide coarse-only screens keep the desktop UI.
        const touch = coarse.matches && !fine.matches && Math.min(innerWidth, innerHeight) < 900 && Math.max(innerWidth, innerHeight) < 1200;
        const modeChanged = playerInput.touch !== touch;
        playerInput.touch = touch;
        document.documentElement.classList.toggle('mobile', touch);
        const width = visualViewport?.width ?? innerWidth, height = visualViewport?.height ?? innerHeight;
        document.documentElement.style.setProperty('--view-height', `${height}px`);
        const style = getComputedStyle(document.documentElement);
        const safeX = (parseFloat(style.getPropertyValue('--safe-left')) || 0) + (parseFloat(style.getPropertyValue('--safe-right')) || 0);
        const safeY = (parseFloat(style.getPropertyValue('--safe-top')) || 0) + (parseFloat(style.getPropertyValue('--safe-bottom')) || 0);
        const scale = touch ? Math.min((width - safeX) / 960, (height - safeY) / 540) : Math.max(.25, Math.floor(Math.min(innerWidth / 960, innerHeight / 540)) || Math.min(innerWidth / 960, innerHeight / 540));
        document.getElementById('frame')!.style.transform = touch ? 'none' : `scale(${scale})`;
        document.documentElement.style.setProperty('--world-scale', String(scale));
        if (app.game?.canvas) app.game.scale.updateBounds();
        const changed = Math.abs(width - previousWidth) > 2 || Math.abs(height - previousHeight) > 2;
        previousWidth = width; previousHeight = height;
        // The village sample host handles its own resize, pause and input release.
        if ((changed || modeChanged) && (app.state === 'run' || app.baseWalking) && !editing && !app.coastSample) {
            app.raid?.releaseInput(); playerInput.clear(); const baseSaved = app.base?.checkpoint() ?? true; controls();
            if (!app.pendingSettlement && app.overlay !== 'checkpoint-error') setOverlay(app.baseWalking ? baseSaved ? 'base-menu' : 'base-save-error' : touch && (innerWidth < innerHeight || height < 280) ? 'rotate' : 'pause');
        }
        if ((modeChanged || (changed && app.state === 'hideout' && !editing)) && app.game?.isBooted) render();
    }
    addEventListener('resize', resize); visualViewport?.addEventListener('resize', resize); coarse.addEventListener('change', resize); fine.addEventListener('change', resize);
    app.game.events.once('ready', resize); resize();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
        if (!e.matches) return;
        app.menuMotion = false;
        if (app.state === 'menu') {
            app.game?.scene.getScene('Menu').events.emit('title-motion', false);
            render();
        }
    });
    const suspend = () => {
        if (app.coastSample) { audio.stop(); return; }
        app.raid?.releaseInput(); const baseSaved = app.base?.checkpoint() ?? true; playerInput.clear(); controls(); audio.stop();
        if (!baseSaved) setOverlay('base-save-error');
        if (app.state === 'run' && !app.pendingSettlement) setOverlay('pause');
    };
    addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
    addEventListener('pagehide', () => { suspend(); ownership.release(); });
    addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
    addEventListener('beforeunload', e => { app.raid?.checkpoint(); app.coastSample?.checkpoint(); app.base?.checkpoint(); if (app.pendingSettlement || !app.storageOK) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('contextmenu', e => { if ((e.target as HTMLElement).closest('#game, #touch-controls')) e.preventDefault(); });
    addEventListener('pointermove', e => { if (e.pointerType === 'mouse') playerInput.pointer = { x: e.clientX, y: e.clientY }; });
    const game = document.getElementById('game')!;
    game.addEventListener('wheel', e => {
        if (app.state === 'run' && app.raid?.cycleLootTarget(e.deltaY)) e.preventDefault();
    }, { passive: false });
    let pointerType = '';
    game.addEventListener('pointerdown', e => { pointerType = e.pointerType; });
    // Mouse chords emit mousedown for each button; pointerdown only fires for the first.
    // Remember the source to reject compatibility mouse events synthesized from a touch.
    game.addEventListener('mousedown', e => {
        if (pointerType !== 'mouse' || app.overlay) return;
        playerInput.pointer = { x: e.clientX, y: e.clientY }; playerInput.mouse(e.button, true); audio.start();
    });
    addEventListener('mouseup', e => playerInput.mouse(e.button, false));
    addEventListener('pointercancel', () => { playerInput.clear(); controls(); });
    addEventListener('keydown', e => {
        if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
        if (app.coastSample) return;
        const modal = app.state === 'menu' ? document.querySelector<HTMLElement>('#ui [aria-modal="true"]') : null;
        if (modal && e.key === 'Tab') {
            const targets = Array.from(modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const index = targets.indexOf(document.activeElement as HTMLButtonElement);
            if (index < 0 || (e.shiftKey ? index === 0 : index === targets.length - 1)) {
                e.preventDefault(); targets[e.shiftKey ? targets.length - 1 : 0]?.focus();
            }
            return;
        }
        if (app.state === 'run' && ['Tab', ' ', 'Escape'].includes(e.key)) e.preventDefault();
        if (e.repeat) return;
        if (app.state === 'run') {
            if (e.key === 'Tab') setOverlay(['inventory', 'loot'].includes(app.overlay) ? '' : 'inventory');
            else if (e.key.toLowerCase() === 'e' && app.overlay === 'loot') { app.raid?.suppressHeldInput('E'); setOverlay(''); }
            else if (e.key.toLowerCase() === 'm') setOverlay(app.overlay === 'map' ? '' : 'map');
            else if (e.key === 'Escape') { if (app.overlay) closeOverlay(); else setOverlay('pause'); }
            else if (!app.overlay) playerInput.key(e.key, true);
        } else if (app.baseWalking) {
            if (e.key === 'Escape') { if (app.overlay) closeOverlay(); else setOverlay('base-menu'); }
            else if (!app.overlay) playerInput.key(e.key, true);
        } else if (e.key === 'Escape') closeOverlay();
    });
    addEventListener('keyup', e => playerInput.key(e.key, false));
    addEventListener('storage', e => {
        if (e.key !== SESSION_KEY && e.key !== SAVE_KEY && e.key !== null) return;
        saveSession.markConflict();
        if (app.state === 'run' && !app.coastSample) { setOverlay('pause'); app.raid?.lock(); }
        toast('另一个窗口已更新存档，本页已停止操作。请导出需要保留的进度，再刷新本页。');
    });
    // Explicitly opt-in acceptance hooks; never available in the normal game.
    if (new URLSearchParams(location.search).get('test') === '1')
        (window as any).__bincov = { app, persist, setOverlay, saveSession, playerInput };
}
void boot();
