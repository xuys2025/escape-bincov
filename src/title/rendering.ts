import Phaser from 'phaser';
import { LAYERS, SCENE_W, SCENE_H, type LayerName } from './layout';

const MOVING = new Set<LayerName>(['room', 'lamp', 'desk', 'chair', 'fore', 'boat', 'light', 'radioFx']);
const TEXEL_SCALE = 2;

/** Expand each painted pixel without mixing it with its neighbours. Filtering
 * then spans half a painted pixel, rather than smearing two enlarged pixels.
 * Immutable copies are cached once, including across menu/station round-trips. */
export function motionTexture(scene: Phaser.Scene, name: LayerName) {
    const spec = LAYERS[name];
    if (!MOVING.has(name)) return spec.key;
    // Grid layers already hold 3x3 texels per art pixel: linear filtering then only
    // softens a sixth of a pixel at block edges during subpixel motion. No copy needed.
    if ((spec.res ?? 1) > 1) {
        scene.textures.get(spec.key).setFilter(Phaser.Textures.FilterMode.LINEAR);
        return spec.key;
    }
    const key = `${spec.key}-motion`;
    if (!scene.textures.exists(key)) {
        const source = scene.textures.get(spec.key).getSourceImage() as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = source.width * TEXEL_SCALE;
        canvas.height = source.height * TEXEL_SCALE;
        const context = canvas.getContext('2d')!;
        context.imageSmoothingEnabled = false;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const texture = scene.textures.addCanvas(key, canvas)!;
        if (spec.frames) scene.textures.addSpriteSheet(key, texture, { frameWidth: spec.w * TEXEL_SCALE, frameHeight: spec.h * TEXEL_SCALE });
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    return key;
}

/** Only the title uses a denser render surface. World coordinates remain 960x540;
 * entering gameplay restores its original surface, camera and input scale. */
export function mountTitleSurface(scene: Phaser.Scene) {
    const scale = scene.scale, camera = scene.cameras.main;
    const previous = { w: scale.width, h: scale.height, round: camera.roundPixels };
    const resize = () => {
        // Match title.css's fixed-size crop on tall phones. Cap at 1080p so a
        // high-DPR phone or 4K display cannot create an unbounded render target.
        const portrait = innerWidth <= 600 && innerWidth / innerHeight <= .75;
        const cssScale = portrait ? 1 : Math.max(innerWidth / SCENE_W, innerHeight / SCENE_H);
        const units = Math.min(120, Math.max(60, Math.ceil(60 * cssScale * devicePixelRatio)));
        const w = units * 16, h = units * 9;
        if (scale.width !== w || scale.height !== h) scale.resize(w, h);
        camera.setSize(w, h).setZoom(w / SCENE_W).centerOn(SCENE_W / 2, SCENE_H / 2).setRoundPixels(false);
    };
    resize();
    addEventListener('resize', resize);
    return () => {
        removeEventListener('resize', resize);
        scale.resize(previous.w, previous.h);
        camera.setSize(previous.w, previous.h).setZoom(1).setScroll(0, 0).setRoundPixels(previous.round);
    };
}
