// Deterministic atlas slicing/resizing only. Creative source art is produced by built-in image_gen.
// Run after reviewing the versioned source PNGs; never overwrites legacy actor art.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const roles = [
  ...['raider-melee', 'raider-gunner', 'raider-lookout'].map(id => ({ id, height: 39 })),
  { id: 'raider-boss', width: 30, height: 39, sheetVersion: 2, looseGrid: true },
  { id: 'tidal-crab', width: 29, height: 23, corpseVersion: 2, looseGrid: true },
  { id: 'saltback-dog', width: 30, height: 27, sheetVersion: 2, looseGrid: true },
  { id: 'sac-spitter', width: 30, height: 26, sheetVersion: 3, corpseVersion: 3, looseGrid: true },
  { id: 'salt-dazed', width: 28, height: 39, sheetVersion: 2, looseGrid: true },
  { id: 'tide-chaser', width: 30, height: 39, sheetVersion: 2, looseGrid: true },
  { id: 'tide-ritualist', width: 30, height: 39, sheetVersion: 2, looseGrid: true },
  { id: 'salt-hulk', width: 28, height: 43, looseGrid: true },
  ...['mercenary-scout', 'mercenary-assault', 'mercenary-support', 'recovery-leader',
    'blockade-sentry', 'blockade-patrol', 'blockade-sergeant'].map(id => ({ id, width: id === 'mercenary-scout' ? 28 : 30, height: 39,
      sheetVersion: ['mercenary-scout', 'blockade-sentry'].includes(id) ? 1 : 2, looseGrid: true })),
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch(browserOptions);
const exportBrowser = browser.version();
const page = await browser.newPage();
const assets = [], sources = {};
await mkdir('assets/coast/enemy-v1', { recursive: true });
try {
  for (const spec of roles) for (const part of ['sheet', 'corpse']) {
    const role = spec.id;
    const source = `assets/enemies/sources/${role}-${part}-v${part === 'sheet' ? spec.sheetVersion ?? 1 : spec.corpseVersion ?? 1}.png`, bytes = await readFile(source);
    sources[source] = sha(bytes);
    const frames = await page.evaluate(async ({ url, part, spec }) => {
      const img = new Image(); img.src = url; await img.decode();
      const src = document.createElement('canvas'); src.width = img.width; src.height = img.height;
      const ctx = src.getContext('2d'); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      function bounds(x, y, w, h) {
        let left = w, top = h, right = -1, bottom = -1;
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
          if (pixels[((y + dy) * img.width + x + dx) * 4 + 3] < 16) continue;
          left = Math.min(left, dx); top = Math.min(top, dy); right = Math.max(right, dx); bottom = Math.max(bottom, dy);
        }
        if (right < left) throw new Error('Empty frame');
        return { left, top, right, bottom };
      }
      const cells = [];
      const rows = part === 'sheet' ? 5 : 1, cols = rows;
      const rowCuts = Array.from({ length: rows + 1 }, (_, i) => Math.round(i * img.height / rows));
      if (spec.looseGrid && part === 'sheet') for (let i = 1; i < rows; i++) {
        const desired = rowCuts[i], reach = Math.floor(img.height / rows * .18);
        const candidates = Array.from({ length: 2 * reach + 1 }, (_, j) => desired + j - reach)
          .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b);
        const cut = candidates.find(y => {
          for (let x = 0; x < img.width; x++) if (pixels[(y * img.width + x) * 4 + 3] >= 16) return false;
          return true;
        });
        if (cut === undefined) throw new Error(`No transparent row gutter: ${spec.id} row ${i}`);
        rowCuts[i] = cut;
      }
      for (let r = 0; r < rows; r++) {
        const y = rowCuts[r], h = rowCuts[r + 1] - y;
        const cuts = Array.from({ length: cols + 1 }, (_, i) => Math.round(i * img.width / cols));
        // Generated atlases can have a few pixels of column drift. For those sources, cut only on an empty
        // alpha column near the authored grid boundary; never erase a nose or include part of the next body.
        if (spec.looseGrid && part === 'sheet') for (let i = 1; i < cols; i++) {
          const desired = cuts[i], reach = Math.floor(img.width / cols * .18);
          const candidates = Array.from({ length: 2 * reach + 1 }, (_, j) => desired + j - reach)
            .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b);
          const cut = candidates.find(x => {
            for (let yy = y; yy < y + h; yy++) if (pixels[(yy * img.width + x) * 4 + 3] >= 16) return false;
            return true;
          });
          if (cut === undefined) throw new Error(`No transparent column gutter: ${spec.id} row ${r} column ${i}`);
          cuts[i] = cut;
        }
        for (let f = 0; f < cols; f++) {
          const x = cuts[f], w = cuts[f + 1] - x;
          cells.push({ x, y, w, h, r, f, b: bounds(x, y, w, h) });
        }
      }
      const top = Math.min(...cells.map(c => c.b.top)), bottom = Math.max(...cells.map(c => c.b.bottom));
      const left = Math.min(...cells.map(c => c.b.left - c.w / 2)), right = Math.max(...cells.map(c => c.b.right - c.w / 2));
      // One scale for the atlas, one foot baseline per direction. Keep offsets between gait frames;
      // remove only source-row drift so a row cannot contain the next direction's head or feet.
      const rowBottoms = Array.from({ length: rows }, (_, r) => Math.max(...cells.filter(c => c.r === r).map(c => c.b.bottom)));
      const height = spec.looseGrid ? Math.max(...cells.map(c => rowBottoms[c.r] - c.b.top + 1)) : bottom - top + 1;
      const scale = Math.min(spec.height / height, (spec.width ?? Infinity) / (right - left + 1));
      const centre = spec.width ? (left + right) / 2 : 0;
      return cells.map(c => {
        const out = document.createElement('canvas'); out.width = part === 'sheet' ? 32 : 48; out.height = part === 'sheet' ? 48 : 32;
        const g = out.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        if (part === 'sheet') g.drawImage(src, c.x, c.y, c.w, c.h, 16 - (c.w / 2 + centre) * scale, 48 - ((spec.looseGrid ? rowBottoms[c.r] : bottom) + 1) * scale, c.w * scale, c.h * scale);
        else {
          const w = c.b.right - c.b.left + 1, h = c.b.bottom - c.b.top + 1, s = Math.min(42 / w, 26 / h);
          g.drawImage(src, c.b.left, c.b.top, w, h, (48 - w * s) / 2, (32 - h * s) / 2, w * s, h * s);
        }
        return { row: c.r, frame: c.f, width: out.width, height: out.height, data: out.toDataURL().split(',')[1] };
      });
    }, { url: `data:image/png;base64,${bytes.toString('base64')}`, part, spec });
    for (const frame of frames) {
      const dir = ['e', 'se', 's', 'ne', 'n'][frame.row];
      const id = `coast-${role}-${part === 'sheet' ? `body-${dir}-f${frame.frame}` : 'corpse-e'}-v1`;
      const file = `assets/coast/enemy-v1/${id}.png`, png = Buffer.from(frame.data, 'base64');
      await writeFile(file, png);
      assets.push({ id, file, w: frame.width, h: frame.height, anchor: part === 'sheet' ? [16, 48] : [24, 16],
        kind: role, dir: part === 'sheet' ? dir.toUpperCase() : 'E', frameIndex: frame.frame,
        part: `coast-${role}`, grip: null, muzzle: null, sha256: sha(png), revision: 1,
        ...(part === 'sheet' ? { heldGripLocal: [16, 26] } : {}) });
    }
  }
} finally { await browser.close(); }
for (const file of ['prompts-v1.json', 'prompts-v2.json', 'prompts-v4.json', 'prompts-v5.json', 'prompts-v6.json', 'prompts-v7.json',
  ...['salt-dazed', 'tide-ritualist', 'mercenary-assault', 'mercenary-support', 'recovery-leader', 'blockade-patrol', 'blockade-sergeant'].map(id => `${id}-sheet-v1.png`),
  'tide-chaser-sheet-v1.png', 'saltback-dog-sheet-v1.png', 'sac-spitter-sheet-v2.png', 'raider-boss-sheet-v1.png', 'tidal-crab-corpse-v1.png']) {
  const path = `assets/enemies/sources/${file}`; sources[path] = sha(await readFile(path));
}
await writeFile('assets/enemies/manifest.json', JSON.stringify({ schema: 1, mode: 'built-in image_gen', exportBrowser,
  provenance: 'Original generated game assets; prompts and source PNGs retained. No external downloaded art.',
  prompts: ['prompts-v1.json', 'prompts-v2.json', 'prompts-v4.json', 'prompts-v5.json', 'prompts-v6.json', 'prompts-v7.json'].map(p => `assets/enemies/sources/${p}`), sources, assets }, null, 2) + '\n');
const coast = JSON.parse(await readFile('assets/coast/manifest.json', 'utf8'));
coast.assets = [...coast.assets.filter(a => !a.file.startsWith('assets/coast/enemy-v1/')), ...assets];
await writeFile('assets/coast/manifest.json', JSON.stringify(coast, null, 2) + '\n');
execFileSync(process.env.BINCOV_ART_PYTHON || 'python', ['scripts/pack-coast-art.py'], { stdio: 'inherit' });
console.log(`Exported ${assets.length} enemy frames, ${coast.assets.length} total coast assets.`);
