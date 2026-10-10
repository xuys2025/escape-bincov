// Copy a Sol asset delivery into assets/coast/v1 and rewrite assets/coast/manifest.json.
// Usage: node scripts/coast-import-assets.mjs <delivery manifest.json>
// Every PNG must match the delivery's own SHA-256 and the IDs must cover exactly the current runtime import set.
import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('Usage: node scripts/coast-import-assets.mjs <delivery manifest.json>');
const delivery = JSON.parse(await readFile(src, 'utf8'));
const current = JSON.parse(await readFile('assets/coast/manifest.json', 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');

const ids = (list) => list.map((a) => a.id).sort().join('\n');
if (ids(delivery.assets) !== ids(current.assets)) throw new Error('Delivery IDs differ from the runtime import set; extend assets.ts first.');

const assets = [];
let changed = 0;
for (const old of current.assets) {
  const a = delivery.assets.find((x) => x.id === old.id);
  const from = join(dirname(src), a.file);
  const bytes = await readFile(from);
  if (sha(bytes) !== a.sha256) throw new Error(`Hash mismatch in delivery: ${a.id}`);
  if (a.width !== old.w || a.height !== old.h) throw new Error(`Size changed: ${a.id}`);
  if (JSON.stringify(a.anchor) !== JSON.stringify(old.anchor)) throw new Error(`Anchor changed: ${a.id}`);
  if (a.sha256 !== old.sha256) { await copyFile(from, old.file); changed++; }
  assets.push({ ...old, sha256: a.sha256, revision: a.revision ?? 1, ...(a.heldGripLocal ? { heldGripLocal: a.heldGripLocal } : {}) });
}
const out = {
  schema: 1,
  source: relative('.', src).replaceAll('\\', '/'),
  note: 'Runtime copies of Sol samples (1x PNG). Identity and anchors from the source manifest.',
  revision: delivery.revision ?? 1,
  assets,
};
await writeFile('assets/coast/manifest.json', JSON.stringify(out, null, 2) + '\n');
console.log(`Imported ${assets.length} assets, ${changed} replaced.`);
