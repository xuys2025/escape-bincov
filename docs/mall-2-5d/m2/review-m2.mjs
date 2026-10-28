// Render exact exported pixels at integer zoom for visual QA; never creates or modifies art.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';
const manifest = JSON.parse(await readFile('assets/mall/manifest.json', 'utf8'));
const browser = await chromium.launch(browserOptions), page = await browser.newPage();
try {
  for (const batch of ['p1', 'p2', 'p3']) {
    const entries = await Promise.all(manifest.assets.filter(a => a.batch === `m2-${batch}` && a.kind !== 'emit').map(async a => ({ ...a, url: 'data:image/png;base64,' + (await readFile(a.file)).toString('base64') })));
    const result = await page.evaluate(async ({ batch, entries }) => {
      const groups = [...new Set(entries.map(e => e.id.replace(/-(end-w|end-e|mid-a|mid-b|single|a|b)-v1$/, '-v1')))];
      const cols = batch === 'p2' ? 3 : 4, rowHeight = batch === 'p1' ? 230 : 340;
      const c = document.createElement('canvas'); c.width = cols * 280; c.height = 55 + Math.ceil(groups.length / cols) * rowHeight;
      const g = c.getContext('2d'); g.fillStyle = '#292d2d'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
      g.fillStyle = '#eee8d7'; g.font = 'bold 18px monospace'; g.fillText(`M2 ${batch.toUpperCase()} / actual exported sprites at 2x`, 20, 28);
      for (let i = 0; i < groups.length; i++) {
        const row = entries.filter(e => e.id.replace(/-(end-w|end-e|mid-a|mid-b|single|a|b)-v1$/, '-v1') === groups[i]);
        const pieces = row[0].kind === 'ground' ? row : [row.at(-1)];
        const x = (i % cols) * 280, y = 55 + Math.floor(i / cols) * rowHeight;
        g.fillStyle = '#ccc5b5'; g.font = '13px monospace'; g.fillText(groups[i].replace('mall-prop-', '').replace('mall-ground-', '').replace('-v1', ''), x + 12, y + 18);
        let xx = x + (280 - pieces.reduce((n, e) => n + e.w * 2, 0)) / 2;
        for (const e of pieces) { const img = new Image(); img.src = e.url; await img.decode(); g.drawImage(img, xx, y + 35, e.w * 2, e.h * 2); xx += e.w * 2; }
      }
      return c.toDataURL();
    }, { batch, entries });
    await writeFile(`docs/mall-2-5d/m2/${batch}-overview.png`, Buffer.from(result.split(',')[1], 'base64'));
  }
  const entries = await Promise.all(manifest.assets.filter(a => a.batch === 'm2-p3' && a.kind === 'ground').map(async a => ({ ...a, url: 'data:image/png;base64,' + (await readFile(a.file)).toString('base64') })));
  const tiles = await page.evaluate(async entries => {
    const c = document.createElement('canvas'); c.width = 1400; c.height = 320;
    const g = c.getContext('2d'); g.fillStyle = '#292d2d'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
    for (let i = 0; i < 5; i++) { const pair = entries.slice(i * 2, i * 2 + 2), imgs = await Promise.all(pair.map(async e => { const img = new Image(); img.src = e.url; await img.decode(); return img; }));
      g.fillStyle = '#ccc5b5'; g.font = '14px monospace'; g.fillText(pair[0].id.replace('mall-ground-', '').replace('-a-v1', ''), i * 280 + 10, 24);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.drawImage(imgs[(x + y) % 2], i * 280 + 10 + x * 128, 42 + y * 128, 128, 128);
    }
    return c.toDataURL();
  }, entries);
  await writeFile('docs/mall-2-5d/m2/ground-repeat.png', Buffer.from(tiles.split(',')[1], 'base64'));
} finally { await browser.close(); }
