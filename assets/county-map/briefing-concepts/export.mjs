// Maintainer-only, mechanical atlas slicing and WebP encoding. Run from the repository root.
// No painted pixels are synthesized; source PNGs remain the editable master artifacts.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from '../../../scripts/browser-options.mjs';

const root = new URL('./', import.meta.url);
const atlasGroups = [
  { file: 'atlas-civic.png', ids: ['old-town', 'mall', 'hospital', 'old-hospital'] },
  { file: 'atlas-infrastructure.png', ids: ['factory', 'laboratory', 'highway', 'market'] },
  { file: 'atlas-coast.png', ids: ['observatory', 'lighthouse', 'harbor', 'freighter'] },
];
const names = ['老城街区', '滨湾商场', '县医院', '县医院旧址', '工厂区', '隐秘实验室', '西线国道', '水产市场', '观测站与泵房', '灯塔岬角', '旧渔港', '远汐号'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch(browserOptions);
const sources = [], assets = [];
try {
  const page = await browser.newPage();
  for (const group of atlasGroups) {
    const bytes = await readFile(new URL(group.file, root));
    const result = await page.evaluate(async data => {
      const image = new Image(); image.src = data; await image.decode();
      const width = image.naturalWidth, height = image.naturalHeight;
      if (width !== 1536 || height !== 1024) throw new Error(`Unexpected atlas size: ${width}x${height}`);
      const canvas = document.createElement('canvas'); canvas.width = width / 2; canvas.height = height / 2;
      const ctx = canvas.getContext('2d');
      const crops = [0, 1, 2, 3].map(index => {
        const x = index % 2 * canvas.width, y = Math.floor(index / 2) * canvas.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        return { rect: [x, y, canvas.width, canvas.height], data: canvas.toDataURL('image/webp', .88) };
      });
      return { width, height, crops };
    }, `data:image/png;base64,${bytes.toString('base64')}`);
    sources.push({ file: group.file, sha256: hash(bytes), bytes: bytes.length, width: result.width, height: result.height });
    for (const [index, crop] of result.crops.entries()) {
      if (!crop.data.startsWith('data:image/webp;base64,')) throw new Error('WebP encoder unavailable');
      const output = Buffer.from(crop.data.split(',')[1], 'base64');
      const id = group.ids[index], file = `${id}.webp`;
      await writeFile(new URL(file, root), output);
      assets.push({ id, name: names[assets.length], file, source: group.file, crop: crop.rect,
        width: crop.rect[2], height: crop.rect[3], bytes: output.length, sha256: hash(output), status: 'briefing-art' });
    }
  }
  const manifest = { generator: 'OpenAI built-in image_gen', use: 'Region briefing concepts, not gameplay screenshots or implemented levels',
    encoding: 'Exact four-quadrant crop, unchanged scale, WebP quality 0.88', browser: browser.version(), sources, assets };
  await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ directory: fileURLToPath(root), sources: sources.length, assets: assets.length,
    totalWebpBytes: assets.reduce((sum, a) => sum + a.bytes, 0) }));
} finally { await browser.close(); }
