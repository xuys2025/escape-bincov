// Art acceptance: inspect decoded pixels, preserved metadata and material paths.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decode } from '../m3-w3/source/pixels.mjs';

process.chdir(fileURLToPath(new URL('../../../../', import.meta.url)));
const dir = 'docs/gunsmith/art/svd-joint', incoming = 'assets/gunsmith/incoming/svd-joint';
const manifest = JSON.parse(readFileSync(`${incoming}/manifest.json`));
const formalBytes = readFileSync('assets/gunsmith/manifest.json'), formal = JSON.parse(formalBytes);
const source = JSON.parse(readFileSync(`${dir}/source/edits.json`));
const hash = b => createHash('sha256').update(b).digest('hex');
const pixel = (p, x, y) => p.data.subarray((y * p.w + x) * 4, (y * p.w + x) * 4 + 4);
const alpha = p => Buffer.from(Array.from({ length: p.w * p.h }, (_, i) => p.data[i * 4 + 3]));
const palette = p => [...new Set(Array.from({ length: p.w * p.h }, (_, i) => p.data[i * 4 + 3] ? p.data.subarray(i * 4, i * 4 + 3).toString('hex') : null).filter(Boolean))].sort();
const sameRect = (a, b, [x, y, w, h]) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) assert.deepEqual(pixel(a, i, j), pixel(b, i, j));
};
function connected(p, start, end, ink) {
    const solid = (x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h && pixel(p, x, y)[3] === 255 && pixel(p, x, y).subarray(0, 3).toString('hex') !== ink;
    const queue = [start], seen = new Set([start.join(',')]);
    if (!solid(...start) || !solid(...end)) return false;
    for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        if (x === end[0] && y === end[1]) return true;
        for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            const key = `${xx},${yy}`;
            if (solid(xx, yy) && !seen.has(key)) { seen.add(key); queue.push([xx, yy]); }
        }
    }
    return false;
}
const checks = [], results = [];
const check = (name, fn) => { try { fn(); checks.push({ name, status: 'pass' }); } catch (e) { checks.push({ name, status: 'fail', error: e.message }); } };
check('Formal manifest is unchanged', () => assert.equal(hash(formalBytes), source.formalManifestSha256));
check('All 636 formal PNGs retain manifest identity and bytes', () => {
    assert.equal(formal.assets.length, 636);
    for (const a of formal.assets) { const b = readFileSync(a.file); assert.equal(hash(b), a.sha256, a.id); assert.equal(b.length, a.bytes, a.id); }
});
check('Only three requested receiver replacements delivered', () => assert.deepEqual(manifest.assets.map(a => a.id).sort(), ['gs-svdb-receiver-h-v2', 'gs-svdb-receiver-i-v3', 'gs-svdb-receiver-w-v3']));
check('Files exactly match batch manifest', () => assert.deepEqual(readdirSync(incoming).sort(), ['manifest.json', ...manifest.assets.map(a => a.file.split('/').at(-1))].sort()));
for (const a of manifest.assets) {
    const edit = source.assets.find(s => s.id === a.id), old = formal.assets.find(o => o.id === edit.baselineId);
    const before = decode(old.file), after = decode(a.file), bytes = readFileSync(a.file);
    const code = a.output === 'bench' ? 'W' : a.output === 'inventory' ? 'I' : 'H';
    const ink = code === 'H' ? '242321' : '122027';
    const seeds = code === 'W' ? [[10, 14], [90, 15], [120, 12], [160, 12]] : code === 'I' ? [[10, 6], [40, 8], [60, 6], [80, 6]] : [[5, 3], [17, 3], [26, 4], [32, 2]];
    const magazine = code === 'W' ? [74, 20, 36, 16] : code === 'I' ? [37, 10, 18, 8] : [14, 6, 6, 4];
    const changing = new Set(edit.changedPixels.map(p => `${p.x},${p.y}`));
    check(`${code}: file SHA, bytes, dimensions, revision and replacesSha256`, () => {
        assert.equal(hash(bytes), a.sha256); assert.equal(bytes.length, a.bytes);
        assert.deepEqual([after.w, after.h], [old.w, old.h]); assert.deepEqual([a.w, a.h], [old.w, old.h]);
        assert.equal(a.revision, old.revision + 1); assert.equal(a.replacesSha256, old.sha256); assert.equal(edit.baselineSha256, old.sha256);
    });
    check(`${code}: every placement field including mounts, grip, bore, hand and tip is unchanged`, () => {
        const omit = o => Object.fromEntries(Object.entries(o).filter(([k]) => !['id', 'file', 'bytes', 'sha256', 'revision', 'replacesSha256', 'colors', 'source', 'sourceRect', 'exportMethod'].includes(k)));
        assert.deepEqual(omit(a), omit(old));
    });
    check(`${code}: alpha is binary and identical to baseline`, () => { assert.deepEqual(alpha(after), alpha(before)); assert.ok([...alpha(after)].every(v => v === 0 || v === 255)); });
    check(`${code}: palette is unchanged and within ART-SPEC limit`, () => { assert.deepEqual(palette(after), palette(before)); assert.equal(palette(after).length, a.colors); assert.ok(a.colors <= (code === 'W' ? 12 : 8)); });
    check(`${code}: only recorded original ink pixels changed; all other pixels exact`, () => {
        let n = 0;
        for (let y = 0; y < after.h; y++) for (let x = 0; x < after.w; x++) {
            if (!pixel(before, x, y).equals(pixel(after, x, y))) { n++; assert.ok(changing.has(`${x},${y}`)); assert.equal(pixel(before, x, y).subarray(0, 3).toString('hex'), ink); }
            else assert.ok(!changing.has(`${x},${y}`));
        }
        assert.equal(n, edit.changedPixels.length);
    });
    check(`${code}: M3-W3 magazine and feed-lip pixels are identical`, () => sameRect(before, after, magazine));
    check(`${code}: muzzle terminal and mounted coordinates retain their original pixels`, () => {
        sameRect(before, after, [before.w - 1, 0, 1, before.h]);
        for (const [x, y] of Object.values(old.mounts)) assert.deepEqual(pixel(before, x, y), pixel(after, x, y));
    });
    if (code !== 'H') check(`${code}: every edited pixel is internal; exterior ink contour is intact`, () => {
        for (const { x, y } of edit.changedPixels) for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) assert.equal(pixel(before, xx, yy)[3], 255, `${x},${y}`);
    });
    const joins = ['stock-receiver', 'receiver-handguard', 'handguard-barrel'].map((name, i) => ({ name,
        beforeSolidPath: connected(before, seeds[i], seeds[i + 1], ink), afterSolidPath: connected(after, seeds[i], seeds[i + 1], ink) }));
    for (const joint of joins) check(`${code}: ${joint.name} has a four-neighbor solid material path without ink`, () => assert.equal(joint.afterSolidPath, true));
    check(`${code}: original defect is reproduced by excluding ink`, () => assert.equal(joins[0].beforeSolidPath, false));
    results.push({ id: a.id, dimensions: [a.w, a.h], colors: a.colors, bytes: a.bytes, changedPixels: changing.size,
        magazineRect: magazine, magazineUnchanged: true, alphaUnchanged: true, mounts: a.mounts, tip: a.tip, joins });
}
check('Batch totals are exact', () => { assert.equal(manifest.totals.files, manifest.assets.length); assert.equal(manifest.totals.pngBytes, manifest.assets.reduce((n, a) => n + a.bytes, 0)); });
const report = { schema: 1, date: '2026-10-29', baseline: source.baseline, status: checks.some(c => c.status === 'fail') ? 'fail' : 'pass',
    passed: checks.filter(c => c.status === 'pass').length, failed: checks.filter(c => c.status === 'fail').length, totals: manifest.totals,
    runtimeArtConsumed: false, assets: results, checks };
writeFileSync(`${dir}/validation.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, passed: report.passed, failed: report.failed, failures: checks.filter(c => c.status === 'fail') }));
if (report.failed) process.exitCode = 1;
