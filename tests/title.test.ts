import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { clampStep, normalizePointer, follow, layerOffset, motionAllowed, decorRandom, poseFrame, twinkle, blink, MAX_STEP_MS } from '../src/title/motion';
import { LAYERS, GROUPS, OPENINGS, SCENE_W, SCENE_H, type LayerName } from '../src/title/layout';
import { paintFog } from '../scripts/title-art/sky';
import { validateTitleArt } from '../scripts/title-art/generate';
import { decodePng, encodePng, extrude } from '../scripts/title-art/png';

const manifest = JSON.parse(readFileSync('assets/title/manifest.json', 'utf8'));

test('pointer normalisation saturates at and beyond the viewport edges', () => {
    assert.deepEqual(normalizePointer(0, 0, 1280, 720), { x: -1, y: -1 });
    assert.deepEqual(normalizePointer(640, 360, 1280, 720), { x: 0, y: 0 });
    assert.deepEqual(normalizePointer(1280, 720, 1280, 720), { x: 1, y: 1 });
    assert.deepEqual(normalizePointer(-50, 9000, 1280, 720), { x: -1, y: 1 });
    assert.deepEqual(normalizePointer(10, 10, 0, 0), { x: 0, y: 0 });
});

test('camera follow is frame-rate independent and never overshoots', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) a = follow(a, 1, 16, .26);
    for (let i = 0; i < 120; i++) b = follow(b, 1, 8, .26);
    assert.ok(Math.abs(a - b) < 1e-6);
    assert.ok(a > .97 && a <= 1);
    assert.equal(follow(.3, .3, 16, .26), .3);
    assert.equal(follow(0, 1, 16, 0), 1);
});

test('frame steps are clamped so resuming never fast-forwards motion', () => {
    assert.equal(clampStep(16), 16);
    assert.equal(clampStep(90_000), MAX_STEP_MS);
    assert.equal(clampStep(-5), 0);
    assert.equal(clampStep(Number.NaN), 0);
});

test('parallax has continuous subpixel positions and a bounded horizontal comfort range', () => {
    for (const [name, max] of Object.entries(GROUPS)) {
        assert.equal(layerOffset(1, max.x), max.x ? -max.x : 0, name);
        assert.equal(layerOffset(-1, max.x), max.x, name);
        assert.ok(Object.is(layerOffset(0, max.x), 0));
        for (let v = -1; v <= 1; v += .05) assert.ok(Math.abs(layerOffset(v, max.x)) <= max.x);
    }
    const order = ['harbor', 'room', 'desk', 'chair', 'fore'] as const;
    order.slice(1).forEach((name, i) => assert.ok(GROUPS[name].x > GROUPS[order[i]].x, `${name} must move more than ${order[i]}`));
    assert.equal(GROUPS.far.x, 0, 'The horizon must remain fixed');
    for (const group of Object.values(GROUPS)) {
        assert.equal(group.y, 0, 'Camera must never bob vertically');
        assert.ok(group.x <= 4, 'Foreground travel exceeded the comfort budget');
    }
    assert.equal(layerOffset(.125, 4), -.5, 'Fractional movement was rounded back to visible jumps');
    assert.ok(Math.abs(layerOffset(.126, 4) - layerOffset(.125, 4)) < .005);
});

test('any one stop condition halts the whole scene', () => {
    const on = { enabled: true, reduced: false, hidden: false, active: true };
    assert.equal(motionAllowed(on), true);
    assert.equal(motionAllowed({ ...on, enabled: false }), false);
    assert.equal(motionAllowed({ ...on, reduced: true }), false);
    assert.equal(motionAllowed({ ...on, hidden: true }), false);
    assert.equal(motionAllowed({ ...on, active: false }), false);
});

test('decoration randomness is deterministic and separate per seed', () => {
    const a = decorRandom(7), b = decorRandom(7), c = decorRandom(8);
    const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
    assert.deepEqual(sa, sb);
    assert.notDeepEqual(sa, sc);
    assert.ok(sa.every(v => v >= 0 && v < 1));
});

test('pose frames, blinks and twinkles stay in their discrete states', () => {
    for (let v = -1; v <= 1; v += .01) { const f = poseFrame(v, 5); assert.ok(f >= 0 && f <= 4 && Number.isInteger(f)); }
    assert.equal(poseFrame(0, 5), 2);
    for (let t = 0; t < 10_000; t += 37) assert.ok([0, .5, 1].includes(twinkle(t, 2300, .3)));
    assert.equal(blink(0, 1000, .2), true);
    assert.equal(blink(500, 1000, .2), false);
});

test('full-screen layers cover their largest parallax travel, so edges never show', () => {
    for (const name of ['sky', 'room'] as LayerName[]) {
        const L = LAYERS[name], g = GROUPS[L.group];
        assert.ok(L.x <= -g.x && L.x + L.w >= SCENE_W + g.x, `${name} horizontal margin`);
        assert.ok(L.y <= -g.y, `${name} top margin`);
    }
    assert.ok(LAYERS.room.y + LAYERS.room.h >= SCENE_H + GROUPS.room.y);
    // The unified master uses a complete 960x540 outdoor plate with no shifted horizon.
    assert.equal(LAYERS.harbor.x + 4, 0);
    assert.equal(LAYERS.harbor.y + 3, 0);
    assert.ok(LAYERS.harbor.y + LAYERS.harbor.h > OPENINGS.door.y + OPENINGS.door.h + GROUPS.harbor.y);
    const sky = decodePng(readFileSync(manifest.layers.sky.file));
    for (let x=0;x<sky.w;x++) assert.equal(sky.data[x*4+3],255,'painted top margin, not transparent padding');
    // Fog tiles span the scene plus the far group's travel.
    for (const name of ['fogHigh', 'fogLow'] as const) assert.equal(LAYERS[name].w % 4, 0);
    // Outdoor effects are bounded by real openings in the room layer.
    for (const o of Object.values(OPENINGS)) assert.ok(o.x > 0 && o.y >= 0 && o.x + o.w < SCENE_W && o.y + o.h < SCENE_H);
});

test('fog tiles repeat seamlessly (two periods equal the tile twice)', () => {
    for (const name of ['fogHigh', 'fogLow'] as const) {
        const one = paintFog(name), two = paintFog(name, 2);
        for (let y = 0; y < one.h; y++) {
            const row = one.data.subarray(y * one.w, (y + 1) * one.w);
            assert.deepEqual(two.data.subarray(y * two.w, y * two.w + one.w), row);
            assert.deepEqual(two.data.subarray(y * two.w + one.w, (y + 1) * two.w), row);
        }
    }
});

test('the room layer is open at the door and window, and solid elsewhere', () => {
    const room = decodePng(readFileSync(manifest.layers.room.file));
    const s = LAYERS.room.res ?? 1, at = (x: number, y: number) => room.data[(((y - LAYERS.room.y) * s) * room.w + (x - LAYERS.room.x) * s)*4+3];
    assert.equal(at(OPENINGS.door.x + 40, OPENINGS.door.y + 120), 0);
    assert.equal(at(OPENINGS.window.x + 40, OPENINGS.window.y + 100), 0);
    assert.notEqual(at(100, 200), 0);
    assert.notEqual(at(560, 300), 0);
});

test('exterior pier owns no interior floor below the threshold; room owns the floor', () => {
    const pier = decodePng(readFileSync(manifest.layers.pierFront.file));
    // First extraction accidentally included interior boards to the bottom of the canvas.
    // The corrected source ends before row 402; downstream floor must be fully transparent.
    for (let y = 405 * (LAYERS.pierFront.res ?? 1); y < pier.h; y++) for (let x = 0; x < pier.w; x++)
        assert.equal(pier.data[(y * pier.w + x) * 4 + 3], 0, `indoor pixels in exterior pier at ${x},${y}`);
    const room = decodePng(readFileSync(manifest.layers.room.file)), s = LAYERS.room.res ?? 1;
    for (const [x,y] of [[360,432],[430,466],[280,510]])
        assert.ok(room.data[((y - LAYERS.room.y) * s * room.w + (x - LAYERS.room.x) * s) * 4 + 3] >= 250, 'interior floor must be covered by room, allowing generated near-opaque alpha');
    assert.ok(LAYERS.pierFront.group !== LAYERS.room.group, 'threshold and outside must retain independent depth');
});

test('every runtime title import matches the imported-art manifest', () => {
    validateTitleArt();
    const imports=readFileSync('src/title/assets.ts','utf8');
    for (const name of Object.keys(LAYERS) as LayerName[]) {
        const entry = manifest.layers[name], bytes = readFileSync(entry.file);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${name} file hash`);
        const decoded = decodePng(bytes);
        assert.equal(createHash('sha256').update(decoded.data).digest('hex'),entry.pixelSha256,`${name} pixels`);
        assert.ok(imports.includes(entry.file),`${name} manifest is not the runtime import`);
        const res = LAYERS[name].res ?? 1;
        assert.equal(decoded.w, LAYERS[name].w * res * (LAYERS[name].frames ?? 1), `${name} width`);
        assert.equal(decoded.h,LAYERS[name].h * res,`${name} height`);
    }
});

test('grid layers share one 640x360 art-pixel grid and one palette', () => {
    const palette = JSON.parse(readFileSync('assets/title/palette.json', 'utf8'));
    assert.equal(palette.grid, '640x360');
    const colours = new Set<string>(palette.colours);
    const grid = palette.logicalPerArtPixel * palette.texelsPerLogical;
    assert.equal(grid, 3, 'one art pixel must be exactly 3x3 texels');
    for (const name of Object.keys(LAYERS) as LayerName[]) {
        const L = LAYERS[name];
        if (!L.res) continue;
        assert.equal(L.res, palette.texelsPerLogical, `${name} texel density`);
        const im = decodePng(readFileSync(manifest.layers[name].file)), fw = L.w * L.res;
        // Global grid phase: texel column i of a frame starts at scene texel L.x*res + i.
        const block = (v: number, origin: number) => Math.floor((origin * L.res! + v) / grid);
        for (let y = 0; y < im.h; y += 7) for (let x = 0; x < im.w; x += 5) {
            const p = (y * im.w + x) * 4;
            if (im.data[p + 3] === 0) continue;
            assert.equal(im.data[p + 3], 255, `${name} alpha is binary`);
            const c = '#' + [0, 1, 2].map(k => im.data[p + k].toString(16).padStart(2, '0')).join('');
            assert.ok(colours.has(c), `${name} colour ${c} is outside the shared palette`);
            // Neighbouring texels inside the same art pixel carry the same colour.
            const fx = x % fw, nx = x + 1, ny = y + 1;
            if (nx % fw && nx < im.w && block(fx + 1, L.x) === block(fx, L.x)) {
                const q = (y * im.w + nx) * 4;
                if (im.data[q + 3]) assert.deepEqual([...im.data.subarray(q, q + 3)], [...im.data.subarray(p, p + 3)], `${name} block split at ${x},${y}`);
            }
            if (ny < im.h && block(ny, L.y) === block(y, L.y)) {
                const q = (ny * im.w + x) * 4;
                if (im.data[q + 3]) assert.deepEqual([...im.data.subarray(q, q + 3)], [...im.data.subarray(p, p + 3)], `${name} block split at ${x},${y}`);
            }
        }
    }
});

test('border preparation extrudes existing RGBA, including alpha, without shifting content',()=>{
    const input={w:2,h:2,data:Uint8Array.from([1,2,3,255,4,5,6,0,7,8,9,255,10,11,12,255])};
    const output=extrude(input,2,1),decoded=decodePng(encodePng(output));
    assert.deepEqual(decoded,output);
    assert.deepEqual([...output.data.slice(0,4)],[1,2,3,255]);
    assert.deepEqual([...output.data.slice((1*6+2)*4,(1*6+3)*4)],[1,2,3,255]);
    assert.deepEqual([...output.data.slice(-4)],[10,11,12,255]);
});

test('the wordmark keeps real heading text and only whole-pixel sizes', () => {
    const source = readFileSync('src/title-screen.ts', 'utf8');
    assert.match(source, /<h1 class="title-mark">[^]*逃离 滨科夫[^]*<\/h1>/);
    assert.doesNotMatch(source, /\.png/, 'menu markup must not import binary assets (unit tests load it in Node)');
    const { frameWidth, frameHeight } = manifest.layers.wordmark;
    const css = readFileSync('src/title.css', 'utf8');
    const sizes = [...css.matchAll(/\.title-mark-art \{[^}]*?width: (\d+)px; height: (\d+)px/g)].map(m => [Number(m[1]), Number(m[2])]);
    assert.ok(sizes.length >= 3);
    for (const [w, h] of sizes) {
        assert.equal(w % frameWidth, 0, `wordmark width ${w} is not a whole multiple`);
        assert.equal(h, frameHeight * (w / frameWidth), `wordmark height ${h} does not match ${w}`);
    }
});
