// Restore the tool's connected-joint treatment on the immutable native pixel grid.
// Only named ink pixels change; no generated image is resampled into a runtime sprite.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canvas, decode, dot, rect, blit, text, save, colors } from '../../m3-w3/source/pixels.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
process.chdir(root);
const docs = 'docs/gunsmith/art/svd-joint', incoming = 'assets/gunsmith/incoming/svd-joint';
mkdirSync(incoming, { recursive: true });
mkdirSync(`${docs}/preview`, { recursive: true });
const formal = JSON.parse(readFileSync('assets/gunsmith/manifest.json'));
const hash = b => createHash('sha256').update(b).digest('hex');
const steel = '#425a60', wood = '#5c4236', barrel = '#829c9d';
// Inclusive horizontal runs: [x, y, length, palette color]. W is finished separately.
const designs = [
    { old: 'gs-svdb-receiver-i-v2', revision: 3, runs: [
        [29, 7, 1, steel], [27, 8, 1, wood], [28, 8, 2, steel],
        [26, 9, 1, wood], [27, 9, 1, steel],
        ...[5, 6, 7, 8].map(y => [54, y, 1, steel]), [72, 6, 2, barrel],
    ] },
    { old: 'gs-svdb-receiver-w-v2', revision: 3, runs: [
        [56, 15, 2, wood], [58, 15, 2, steel],
        [55, 16, 3, wood], [58, 16, 2, steel],
        [54, 17, 4, wood], [58, 17, 2, steel],
        [53, 18, 5, wood], [58, 18, 2, steel], [52, 19, 5, wood],
        ...Array.from({ length: 8 }, (_, i) => [108, 10 + i, 2, steel]),
        [144, 12, 4, barrel], [144, 13, 4, barrel],
    ] },
    { old: 'gs-svdb-receiver-h-v1', revision: 2, runs: [
        [10, 3, 2, '#784d3d'], [12, 3, 1, '#393733'],
        [11, 4, 1, '#784d3d'], [12, 4, 1, '#393733'],
        [28, 3, 2, '#625b4f'],
    ] },
];
const assets = [], edits = [], images = [];
for (const d of designs) {
    const old = formal.assets.find(a => a.id === d.old);
    if (!old || hash(readFileSync(old.file)) !== old.sha256) throw Error(`Changed baseline: ${d.old}`);
    const before = decode(old.file), after = { ...before, data: Buffer.from(before.data) };
    const ink = old.output === 'held' ? '242321' : '122027', changed = [];
    for (const [x, y, n, color] of d.runs) for (let dx = 0; dx < n; dx++) {
        const i = (y * after.w + x + dx) * 4;
        if (before.data[i + 3] !== 255 || before.data.subarray(i, i + 3).toString('hex') !== ink) throw Error(`Non-ink edit: ${d.old} ${x + dx},${y}`);
        dot(after, x + dx, y, color);
        changed.push({ x: x + dx, y, before: `#${ink}`, after: color });
    }
    const id = old.id.replace(/-v\d+$/, `-v${d.revision}`), file = `${incoming}/${id}.png`;
    save(file, after);
    const bytes = readFileSync(file);
    assets.push({ ...old, id, file, revision: d.revision, bytes: bytes.length, sha256: hash(bytes),
        replacesSha256: old.sha256, colors: colors(after), source: `${docs}/source/edits.json`, sourceRect: null,
        exportMethod: 'image_gen joint-treatment reference; native-grid ink-only finishing; unchanged alpha, coordinates and magazine pixels' });
    edits.push({ id, baselineId: old.id, baselineFile: old.file, baselineSha256: old.sha256, changedPixels: changed });
    images.push({ old, before, after });
}
const totals = { files: assets.length, pngBytes: assets.reduce((n, a) => n + a.bytes, 0) };
writeFileSync(`${incoming}/manifest.json`, JSON.stringify({ schema: 1, revision: 1, batch: 'SVD-JOINT', totals, assets }, null, 2) + '\n');
writeFileSync(`${docs}/source/edits.json`, JSON.stringify({ schema: 1, baseline: 'd60e7c0db6e2783244422736656bc571edc0d879',
    formalManifestSha256: hash(readFileSync('assets/gunsmith/manifest.json')), assets: edits }, null, 2) + '\n');

// Review sheets contain labels/backdrops; delivered runtime PNGs stay transparent.
function panel(w, h, color = '#141c1b') { const c = canvas(w, h); rect(c, color, 0, 0, w, h); return c; }
const comparison = panel(1160, 1064);
text(comparison, 'SVD SEAM REPAIR - NATIVE PIXEL COMPARISON', 20, 16, '#bdcfca', 3);
let y = 56;
for (const { old, before, after } of [images[1], images[0], images[2]]) {
    const code = old.output === 'bench' ? 'W' : old.output === 'inventory' ? 'I' : 'H';
    const scale = old.output === 'bench' ? 6 : old.output === 'inventory' ? 6 : 8;
    text(comparison, `${code} BEFORE ${scale}X`, 20, y, '#cb9362', 2);
    blit(comparison, before, 20, y + 20, scale);
    y += before.h * scale + 28;
    text(comparison, `${code} AFTER ${scale}X`, 20, y, '#bdcfca', 2);
    blit(comparison, after, 20, y + 20, scale);
    y += after.h * scale + 36;
}
save(`${docs}/preview/before-after-dark.png`, comparison);
const contact = panel(1160, 780);
text(contact, 'AFTER - DARK / MID / LIGHT - 1X AND INTEGER SCALE', 16, 16, '#bdcfca', 2);
for (let k = 0; k < 3; k++) {
    const bg = ['#141c1b', '#46534f', '#d7d4c6'][k], top = 48 + k * 240;
    rect(contact, bg, 12, top, 1136, 232);
    let xx = 28;
    for (const { old, after } of [images[1], images[0], images[2]]) {
        const code = old.output === 'bench' ? 'W' : old.output === 'inventory' ? 'I' : 'H';
        text(contact, `${code} 1X`, xx, top + 12, k === 2 ? '#122027' : '#bdcfca', 2);
        blit(contact, after, xx, top + 32);
        text(contact, `${code} 3X`, xx, top + 80, k === 2 ? '#122027' : '#bdcfca', 2);
        blit(contact, after, xx, top + 100, 3);
        xx += old.output === 'bench' ? 576 : old.output === 'inventory' ? 310 : 140;
    }
}
save(`${docs}/preview/contact-three-backgrounds.png`, contact);
const h = images[2], use = panel(680, 250);
text(use, 'H SIDE VIEW - GROUND AND HUD - NO GLOVES', 16, 16, '#bdcfca', 2);
for (const [i, bg] of ['#3c4034', '#142323'].entries()) {
    rect(use, bg, 16 + i * 332, 48, 316, 186);
    text(use, i === 0 ? 'GROUND PREVIEW' : 'HUD PREVIEW', 28 + i * 332, 60, '#bdcfca', 2);
    text(use, 'BEFORE 3X', 28 + i * 332, 88, '#cb9362', 2); blit(use, h.before, 180 + i * 332, 84, 3);
    text(use, 'AFTER 3X', 28 + i * 332, 142, '#bdcfca', 2); blit(use, h.after, 180 + i * 332, 138, 3);
    blit(use, h.after, 28 + i * 332, 194, 2);
}
save(`${docs}/preview/held-ground-hud.png`, use);
console.log(JSON.stringify({ ...totals, changedPixels: edits.map(a => ({ id: a.id, count: a.changedPixels.length })) }));
