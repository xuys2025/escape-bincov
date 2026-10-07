import Phaser from 'phaser';
import { LAYERS, type LayerName } from './layout';
import sky from '../../assets/title/title-sky-ready.png';
import fogHigh from '../../assets/title/title-fog-high-new.png';
import fogLow from '../../assets/title/title-fog-low-new.png';
import harbor from '../../assets/title/title-harbor-ready.png';
import pierFront from '../../assets/title/title-pier-master-v3.png';
import boat from '../../assets/title/title-boat-master-v3.png';
import mooring from '../../assets/title/title-mooring-master-v3.png';
import room from '../../assets/title/title-room-ready.png';
import lamp from '../../assets/title/title-lamp-master-v3.png';
import desk from '../../assets/title/title-desk-master-v3.png';
import light from '../../assets/title/title-light-new.png';
import radioFx from '../../assets/title/title-radio-fx-new.png';
import chair from '../../assets/title/title-chair-master-v3.png';
import fore from '../../assets/title/title-fore-master-v3.png';
import sparks from '../../assets/title/title-sparks-new.png';
import rain from '../../assets/title/title-rain-new.png';
import wordmark from '../../assets/title/title-wordmark-industrial-v5.png';

/** Inline data URLs; the build checks each file against assets/title/manifest.json. */
export const TITLE_ART: Record<LayerName, string> = { sky, fogHigh, fogLow, harbor, boat, mooring, pierFront, room, lamp, desk, light, radioFx, chair, fore, sparks, rain, wordmark };

const decoded = new Map<LayerName, HTMLImageElement>();
let failure = '';

/** Decode every title layer before Phaser starts, so the first menu frame is complete. */
export async function loadTitleArt(): Promise<void> {
    // The HTML wordmark is drawn from a CSS variable so menu markup never imports binary assets.
    document.documentElement.style.setProperty('--title-wordmark', `url("${TITLE_ART.wordmark}")`);
    const started = performance.now();
    await Promise.all((Object.keys(TITLE_ART) as LayerName[]).map(async name => {
        if (LAYERS[name].html) return;
        const image = new Image();
        image.src = TITLE_ART[name];
        try { await image.decode(); decoded.set(name, image); }
        catch (error) { failure ||= `${name}: ${error instanceof Error ? error.message : String(error)}`; }
    }));
    performance.measure('title-art-decode', { start: started, end: performance.now() });
    if (failure) console.error('Title artwork failed to decode; showing the plain menu backdrop.', failure);
}

/** Register decoded layers as nearest-filtered textures (idempotent). */
export function registerTitleTextures(scene: Phaser.Scene) {
    for (const [name, image] of decoded) {
        const spec = LAYERS[name];
        if (scene.textures.exists(spec.key)) continue;
        const texture = (spec.frames ?? 1) > 1
            ? scene.textures.addSpriteSheet(spec.key, image, { frameWidth: spec.w * (spec.res ?? 1), frameHeight: spec.h * (spec.res ?? 1) })
            : scene.textures.addImage(spec.key, image);
        texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
}

export const titleArtReady = () => !failure && decoded.size === Object.values(LAYERS).filter(layer => !layer.html).length;
export const titleArtFailure = () => failure;
