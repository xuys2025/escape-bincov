// Validate delivered PNG bytes and native-pixel contracts, without relying on the exporter to self-report.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';
import { build } from 'esbuild';

const contracts = await build({ stdin: { contents: "export { MALL_FURNITURE } from './src/mall-layout-v2.ts'; export { PAINTED_LIFT } from './src/coast-view/mall-dressing.ts';", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { MALL_FURNITURE, PAINTED_LIFT } = await import('data:text/javascript;base64,' + Buffer.from(contracts.outputFiles[0].text).toString('base64'));

const manifest = JSON.parse(await readFile('assets/mall/manifest.json', 'utf8'));
const previous = JSON.parse(execFileSync('git', ['show', '60a0d938753baf12eeaa376bcf333668e0dc44cd:assets/mall/manifest.json'], { encoding: 'utf8' }));
const sources = { sources: (await Promise.all(['p0', 'p1', 'p2', 'p3'].map(async batch => JSON.parse(await readFile(`docs/mall-2-5d/m2/${batch}-sources.json`, 'utf8'))))).flatMap(s => s.sources) };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok, reason) => { if (!ok) throw new Error(reason); };
assert(manifest.revision === 5, 'Expected manifest revision 5');
assert(new Set(manifest.assets.map(a => a.id)).size === manifest.assets.length, 'Duplicate asset id');
for (const a of previous.assets) assert(JSON.stringify(a) === JSON.stringify(manifest.assets.find(b => b.id === a.id)), `Legacy metadata changed: ${a.id}`);
for (const s of sources.sources) assert(sha(await readFile(s.file)) === s.sha256, `Source hash: ${s.file}`);
const delivery = manifest.assets.filter(a => a.batch?.startsWith('m2-'));
assert(delivery.length === 126 && delivery.filter(a => a.kind === 'prop').length === 105 && delivery.filter(a => a.kind === 'ground').length === 10, 'M2 coverage');
const byId = Object.fromEntries(manifest.assets.map(a => [a.id, a]));
const browser = await chromium.launch(browserOptions), page = await browser.newPage();
const decoded = new Map();
const seen = new Set();
try {
  for (const a of manifest.assets) {
    const bytes = await readFile(a.file);
    assert(sha(bytes) === a.sha256, `PNG hash: ${a.id}`);
    assert(bytes.readUInt32BE(16) === a.w && bytes.readUInt32BE(20) === a.h, `PNG size: ${a.id}`);
    if (!a.batch?.startsWith('m2-')) continue;
    if (a.kind === 'prop') {
      const type = Object.keys(PAINTED_LIFT).filter(name => a.id === `mall-prop-${name}-v1` || a.id.startsWith(`mall-prop-${name}-`)).sort((a, b) => b.length - a.length)[0];
      assert(type, `Unknown furniture type: ${a.id}`); seen.add(type);
      const rule = MALL_FURNITURE[type];
      assert(a.footprint[0] === rule.w && a.footprint[1] === rule.h && a.collision === rule.kind && a.lift === PAINTED_LIFT[type], `Live source contract: ${a.id}`);
    }
    assert(a.w === a.footprint[0] * 32 && a.h === a.footprint[1] * 32 + a.lift, `Projection canvas: ${a.id}`);
    assert(a.anchor[0] === 0 && a.anchor[1] === (a.kind === 'ground' ? 0 : a.h), `Anchor: ${a.id}`);
    assert(a.sourceSha256 === sources.sources.find(s => s.file === a.source)?.sha256, `Source provenance: ${a.id}`);
    const pixels = await page.evaluate(async url => {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0); return [...g.getImageData(0, 0, c.width, c.height).data];
    }, `data:image/png;base64,${bytes.toString('base64')}`);
    decoded.set(a.id, pixels);
    const colours = new Set(); let opaque = 0;
    for (let p = 0; p < pixels.length; p += 4) {
      const alpha = pixels[p + 3]; assert(alpha === 0 || alpha === 255, `Non-binary alpha: ${a.id}`);
      if (alpha) { opaque++; colours.add(pixels.slice(p, p + 3).join(',')); }
    }
    assert(opaque > 0, `Empty PNG: ${a.id}`);
    assert(colours.size <= 28, `Pixel palette: ${a.id}`);
    const shaped = /-(car|dumpster|ball-pool|bamboo-screen)-v1$/.test(a.id);
    if ((a.collision === 'B' && !shaped) || a.kind === 'ground') assert(opaque === a.w * a.h, `Rectangular B body/ground must fill projected footprint: ${a.id}`);
    if (a.collision === 'B' && shaped && !a.id.includes('bamboo-screen')) {
      const xs = [], ys = [];
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (pixels[(y * a.w + x) * 4 + 3]) { xs.push(x); ys.push(y); }
      assert(Math.min(...xs) === 0 && Math.max(...xs) === a.w - 1 && Math.max(...ys) === a.h - 1, `Shaped B full width/south extent: ${a.id}`);
    }
    if (a.id === 'mall-prop-bamboo-screen-v1') for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (x < 12 || x >= 20) assert(pixels[(y * a.w + x) * 4 + 3] === 0, 'Bamboo thin centreline alpha');
    if (a.emit) assert(byId[a.emit]?.kind === 'emit', `Missing emit: ${a.id}`);
  }
  assert(seen.size === Object.keys(PAINTED_LIFT).length, 'Every live painted furniture type needs delivered art');
  let masks = 0, seams = 0;
  for (const a of delivery.filter(a => a.emit)) {
    const body = decoded.get(a.id), mask = decoded.get(a.emit); masks++;
    for (let p = 0; p < body.length; p += 4) if (mask[p + 3]) assert(mask.slice(p, p + 4).every((v, i) => v === body[p + i]), `Emission outside authored body: ${a.id}`);
  }
  const groups = [...new Set(delivery.filter(a => a.tile === 'ew' && a.kind === 'prop').map(a => a.id.replace(/-(end-w|end-e|mid-a|mid-b|single)-v1$/, '')))];
  for (const group of groups) {
    const pieces = ['end-w', 'mid-a', 'mid-b', 'end-e'].map(role => byId[`${group}-${role}-v1`]);
    for (let i = 0; i < 3; i++) {
      const left = pieces[i], right = pieces[i + 1], l = decoded.get(left.id), r = decoded.get(right.id);
      for (let y = 0; y < left.h; y++) for (let k = 0; k < 4; k++) assert(l[(y * left.w + left.w - 1) * 4 + k] === r[y * right.w * 4 + k], `Open-edge seam: ${left.id} -> ${right.id} row ${y}`);
      seams++;
    }
  }
  let tilePairs = 0;
  for (const material of ['concrete', 'carpet', 'rubber', 'tile-wc', 'asphalt']) {
    const variants = ['a', 'b'].map(v => decoded.get(`mall-ground-${material}-${v}-v1`));
    for (const l of variants) for (const r of variants) {
      if (material === 'tile-wc') {
        for (const pixels of [l, r]) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (x % 8 === 0 || y % 8 === 0)
          assert(pixels.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4).every((v, k) => v === l[k]), 'WC exact 8px grout phase');
      } else if (material === 'rubber') {
        // Colour changes at a mat boundary are intentional. Compare seam gradients with the authored
        // internal 32px block boundary, rather than forcing unlike adjacent mat colours to be equal.
        const jump = (a, b, pa, pb) => [0, 1, 2].reduce((s, k) => s + Math.abs(a[pa + k] - b[pb + k]), 0) / 3;
        let sx = 0, sy = 0, ix = 0, iy = 0;
        for (let n = 0; n < 64; n++) {
          sx += jump(l, r, (n * 64 + 63) * 4, n * 64 * 4); sy += jump(l, r, (63 * 64 + n) * 4, n * 4);
          ix += jump(l, l, (n * 64 + 31) * 4, (n * 64 + 32) * 4); iy += jump(l, l, (31 * 64 + n) * 4, (32 * 64 + n) * 4);
        }
        assert(sx / 64 <= ix / 64 + 18 && sy / 64 <= iy / 64 + 18, 'Rubber periodic block gradient');
      } else for (let n = 0; n < 64; n++) for (let k = 0; k < 4; k++) {
        assert(l[(n * 64 + 63) * 4 + k] === r[n * 64 * 4 + k], `Ground X edge ${material}`);
        assert(l[(63 * 64 + n) * 4 + k] === r[n * 4 + k], `Ground Y edge ${material}`);
      }
      tilePairs++;
    }
  }
  const report = { status: 'PASS', browser: browser.version(), manifestRevision: manifest.revision,
    totalAssets: manifest.assets.length, legacyAssetsUnchanged: previous.assets.length, sourceHashes: sources.sources.length,
    deliveryPngs: delivery.length, furnitureTypes: seen.size, bodies: 105, groundTiles: 10, masks, joinedPairs: seams, tilePairs,
    checks: ['all PNG SHA-256 and dimensions', 'legacy metadata unchanged', 'source provenance', 'live MALL_FURNITURE and PAINTED_LIFT contracts for all 26 types', 'binary alpha', '28-colour native palette',
      'footprint/lift canvas and anchors', 'rectangular B full footprint; shaped B extent; explicit bamboo centreline exception', 'nonempty emit masks only on authored body pixels', 'matching open-edge RGBA at every row', 'A/B periodic ground edge combinations'],
    runtimeIntegration: 'PENDING: new IDs registered; layout-4 procedural dressing fallback retained', remaining: ['in-game visual acceptance', 'human/device review', 'facades/cores/stairs and optional signs'] };
  await writeFile('docs/mall-2-5d/m2/m2-validation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
