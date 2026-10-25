// Maintainer-only format conversion. Keeps generated source pixels/geometry; only the WebP is shipped in the HTML.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const source = 'assets/county-map/county-terrain-source.png';
const output = 'assets/county-map/county-terrain.webp';
const bytes = await readFile(source);
const browser = await chromium.launch(browserOptions);
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return { data: canvas.toDataURL('image/webp', .88), width: canvas.width, height: canvas.height };
  }, `data:image/png;base64,${bytes.toString('base64')}`);
  if (!result.data.startsWith('data:image/webp;base64,')) throw new Error('Browser did not encode WebP');
  const webp = Buffer.from(result.data.split(',')[1], 'base64');
  await writeFile(output, webp);
  await writeFile('assets/county-map/manifest.json', JSON.stringify({ source, output, width: result.width, height: result.height,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'), sha256: createHash('sha256').update(webp).digest('hex'),
    bytes: webp.length, encoding: 'WebP quality 0.88, unchanged dimensions', browser: browser.version(), generator: 'OpenAI built-in image_gen' }, null, 2) + '\n');
  console.log(`${output}: ${result.width}x${result.height}, ${webp.length} bytes`);
} finally { await browser.close(); }
