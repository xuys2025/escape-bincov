/** Optional offline handoff module; ordinary game packaging remains unchanged. */
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out = 'test-results/coast-runtime';
await mkdir(out, { recursive: true });
const result = await build({ entryPoints: ['src/raid-runtime/index.ts'], bundle: true, write: false,
  format: 'esm', platform: 'neutral', target: 'es2022', metafile: true });
const inputs = Object.keys(result.metafile.inputs).sort();
if (inputs.some(p => /phaser|pixi|test-support|src\/(game|main|ui)\.ts/.test(p))) throw Error('Runtime has a renderer or fixture dependency.');
const bytes = result.outputFiles[0].contents;
await writeFile(`${out}/coast-runtime.mjs`, bytes);
await writeFile(`${out}/module.json`, JSON.stringify({ entry: 'src/raid-runtime/index.ts', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), inputs }, null, 2));
console.log(`Built ${out}/coast-runtime.mjs (${bytes.length} bytes), no renderer or test driver.`);
