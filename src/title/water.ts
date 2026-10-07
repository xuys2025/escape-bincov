import Phaser from 'phaser';
import { LAYERS, ANCHORS } from './layout';
import { decorRandom, wave } from './motion';
/** Pixel water is rendered between the harbour painting and its near-pier occluders. */
export function mountWater(scene: Phaser.Scene, group: Phaser.GameObjects.Container) {
    // Graphics replays every rectangle command on EVERY display frame, even when
    // draw() hasn't changed the water. Rasterize only the two small water regions
    // at their animation cadence; normal rendering then submits two image quads.
    const plane = (key: string, x: number, y: number, w: number, h: number) => {
        const texture = scene.textures.createCanvas(key, w, h)!;
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
        const context = texture.getContext();
        context.imageSmoothingEnabled = false;
        const image = scene.add.image(x, y, key).setOrigin(0);
        return {
            image,
            clear() { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, w, h); context.translate(-x, -y); },
            rect(color: number, alpha: number, px: number, py: number, width: number, height: number) {
                context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
                context.globalAlpha = alpha;
                context.fillRect(px, py, width, height);
            },
            blit(source: HTMLCanvasElement, px: number, py: number) { context.globalAlpha = 1; context.drawImage(source, px, py); },
            strip(source: HTMLCanvasElement, row: number, px: number, py: number, alpha: number) {
                context.globalAlpha = alpha;
                context.drawImage(source, 0, row, source.width, 2, px, py, source.width, 2);
            },
            refresh() { texture.refresh(); },
            destroy() { image.destroy(); scene.textures.remove(key); },
        };
    };
    const back = plane('title-water-back-live', 280, 180, 664, 230);
    const front = plane('title-water-front-live', LAYERS.boat.x - 8, LAYERS.boat.y + 80, LAYERS.boat.w + 16, LAYERS.boat.h - 60);
    const shade = scene.add.rectangle(-4, ANCHORS.horizon, 968, 250, 0x102a39, .15).setOrigin(0);
    group.add([shade, back.image]);
    const source = scene.textures.get(LAYERS.boat.key).getSourceImage() as HTMLImageElement;
    // Hull sampling works in logical scene pixels; grid layers store 2 texels per pixel.
    const canvas = document.createElement('canvas');
    canvas.width = LAYERS.boat.w;
    canvas.height = LAYERS.boat.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height), w = canvas.width, h = canvas.height;
    const bottoms = Array.from({ length: w }, (_, x) => {
        for (let y = h - 1; y >= 90; y--) {
            if (data[(y * w + x) * 4 + 3] > 192) return y;
        }
        return -1;
    });
    // Hull shade and reflected colours are immutable. Bake them once, then move
    // the shade and a few horizontal reflection strips instead of repainting
    // thousands of overlapping coloured rectangles at every water update.
    const plate = () => { const c = document.createElement('canvas'); c.width = w + 20; c.height = h + 60; return c; };
    const shadow = plate(), reflection = plate();
    const shadowCtx = shadow.getContext('2d')!, reflectionCtx = reflection.getContext('2d')!;
    let reflectionTop = reflection.height, reflectionBottom = 0;
    for (let x = 4; x < w - 4; x += 2) {
        const bottom = bottoms[x];
        if (bottom < 100) continue;
        shadowCtx.fillStyle = '#0b1d29';
        for (let d = 0; d < 22; d += 2) {
            shadowCtx.globalAlpha = .56 * (1 - d / 24);
            shadowCtx.fillRect(x + 7, bottom - 3 + d, 7, 2);
        }
        for (let d = 3; d < 46; d += 2) {
            const sy = Math.round(bottom - d * 3), p = (sy * w + x) * 4;
            if (sy < 0 || data[p + 3] < 192 || (x + d) % 9 < 3) continue;
            const warm = data[p] > 150 && data[p] > data[p + 2] * 1.5;
            const r = Math.round(data[p] * (warm ? .9 : .4)), g = Math.round(data[p + 1] * (warm ? .85 : .5)), b = Math.round(data[p + 2] * .6 + 8);
            reflectionCtx.fillStyle = `rgb(${r},${g},${b})`;
            reflectionCtx.globalAlpha = (warm ? .85 : .65) * (1 - d / 55);
            reflectionCtx.fillRect(x + 10, bottom + d, 4, 1);
            reflectionTop = Math.min(reflectionTop, bottom + d);
            reflectionBottom = Math.max(reflectionBottom, bottom + d + 1);
        }
    }
    const rng = decorRandom(0x74a731);
    const ripples = Array.from({ length: 110 }, () => {
        const y = 198 + Math.floor(rng() * 174), x = 285 + Math.floor(rng() * 635), depth = (y - 196) / 174;
        return { x, y, width: 2 + Math.floor(depth * 9 + rng() * 5), period: 2600 + rng() * 4200, phase: rng() };
    });
    // The actual window lamps: these broken bands remain tied to their light sources.
    const bands = [{ x: 642, y: 190 }, { x: 766, y: 188 }, { x: 425, y: 190 }];
    let last = -1, lastBob = 0;
    function draw(ms: number, bob: number) {
        const step = Math.floor(ms / 120);
        // Let the contact edge follow the continuously moving boat between
        // cached water frames without forcing a texture upload each display frame.
        front.image.y = LAYERS.boat.y + 80 + bob - lastBob;
        if (step === last)
            return;
        last = step;
        lastBob = bob;
        front.image.y = LAYERS.boat.y + 80;
        back.clear();
        front.clear();
        for (const r of ripples) {
            const a = .055 + (wave(ms, r.period, r.phase) + 1) * .07;
            const dx = Math.round(wave(ms, r.period * 1.4, r.phase) * 2);
            back.rect(0x92b4bb, a, r.x + dx, r.y, r.width, 1);
        }
        for (const b of bands)
            for (let k = 0; k < 25; k++) {
                const y = b.y + 15 + k * 4, wide = 2 + Math.floor(k * .32), dx = Math.round(wave(ms, 3600, k * .123) * wide);
                back.rect(0xd7ad67, .1 + (wave(ms, 4100, k * .27) + 1) * .055, b.x + dx - wide / 2 | 0, y, wide, 1);
            }
        const bx = LAYERS.boat.x, by = LAYERS.boat.y;
        back.blit(shadow, bx - 10 + Math.round(wave(ms, 5300)), by + bob);
        for (let row = reflectionTop; row < reflectionBottom; row += 2) {
            const depth = (row - reflectionTop) / Math.max(1, reflectionBottom - reflectionTop);
            const dx = Math.round(wave(ms, 4400, row * .037) * (1 + depth * 4));
            back.strip(reflection, row, bx - 10 + dx, by + row, .86 + .14 * wave(ms, 5100, row * .037));
        }
        for (let x = 4; x < w - 4; x += 2) {
            const bottom = bottoms[x];
            if (bottom < 100)
                continue;
            const edge = by + bottom + bob;
            const chop = Math.round(wave(ms, 3800, x * .019));
            // Water overlaps the last hull pixels: a cutout edge must not sit above the sea.
            front.rect(0x183546, .94, bx + x, edge - 5 + chop, 2, 7);
            if (x % 13 < 5)
                front.rect(0x6e96a1, .4 + .12 * wave(ms, 3800, x * .019), bx + x - 1, edge - 3 + chop, 4, 1);
        }
        back.refresh();
        front.refresh();
    }
    draw(0, 0);
    return { front: front.image, draw, get frame() { return last; }, destroy() { back.destroy(); front.destroy(); } };
}
