// Generate the gunsmith art modules from assets/gunsmith/manifest.json (Sol's #28 M2-09 delivery; ART-SPEC section 7).
// Usage: node scripts/gunsmith-assets.mjs
// Writes src/art/gunsmith-art-meta.ts (sizes, anchors and mounts, and the old guns' virtual inventory layers: no images,
// so unit tests can read it) and
// src/art/gunsmith-assets.ts (the PNG imports esbuild inlines as data URLs). Every PNG must match its manifest hash,
// bytes and size, ids must be unique and match their files, each role carries its fields, and every anchor and mount
// lies on the canvas. build.mjs checks the imports and hashes again on every build.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('assets/gunsmith/manifest.json', 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const fail = message => { throw new Error(`gunsmith art: ${message}`); };
const OUTPUTS = { held: 'h', inventory: 'i', bench: 'w', icon24: 'q24', icon32: 'q32' };
const GLOVES = ['gloveRear', 'gloveFront', 'gloveForegrip'];
const point = p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n));
/** On the canvas: a pixel inside it, or (edge) a right or bottom edge such as a tip's x = w. */
const inside = (a, p, edge = false) => point(p) && p[0] >= 0 && p[1] >= 0 && (edge ? p[0] <= a.w && p[1] <= a.h : p[0] < a.w && p[1] < a.h);

if (manifest.schema !== 1 || !Number.isInteger(manifest.revision)) fail('unknown manifest schema');
const ids = new Set(), files = new Set();
for (const a of manifest.assets) {
  if (ids.has(a.id)) fail(`duplicate id ${a.id}`);
  ids.add(a.id); files.add(a.file);
  if (a.file !== `assets/gunsmith/v1/${a.id}.png`) fail(`${a.id}: file ${a.file}`);
  const bytes = await readFile(a.file);
  if (sha(bytes) !== a.sha256) fail(`hash mismatch: ${a.id}`);
  if (bytes.length !== a.bytes) fail(`byte count mismatch: ${a.id}`);
  if (bytes.readUInt32BE(16) !== a.w || bytes.readUInt32BE(20) !== a.h) fail(`size mismatch: ${a.id}`);
  if (!Object.hasOwn(OUTPUTS, a.output)) fail(`${a.id}: output ${a.output}`);
  // A part drawn for one gun only names that gun after the output (ART-SPEC 7.1): gs-m01-h-pistol-v1.
  if (!new RegExp(`-${OUTPUTS[a.output]}(-[a-z0-9]+)?-v\\d+$`).test(a.id)) fail(`${a.id}: name does not end in its output`);
  for (const [name, p] of Object.entries(a.mounts ?? {})) if (!inside(a, p)) fail(`${a.id}: mount ${name} off the canvas`);
  for (const key of ['anchor', 'grip', 'hand', 'beam']) if (a[key] != null && !inside(a, a[key], key === 'anchor' && a.role === 'glove')) fail(`${a.id}: ${key} off the canvas`);
  if (a.tip != null && !inside(a, a.tip, true)) fail(`${a.id}: tip off the canvas`);
  switch (a.role) {
    case 'receiver':
      if (!a.gun || !a.mounts) fail(`${a.id}: a receiver names its gun and mounts`);
      // The tip may come from the factory barrel instead (ART-SPEC 3.4).
      if (a.output === 'held' && (!point(a.grip) || typeof a.bore !== 'number' || typeof a.forward !== 'number')) fail(`${a.id}: a held receiver needs grip, bore and forward`);
      break;
    case 'factory': if (!a.gun || !a.slot || !point(a.anchor)) fail(`${a.id}: a factory part names its gun, slot and anchor`); break;
    case 'part': if (!a.item || !a.slot || !point(a.anchor)) fail(`${a.id}: a part names its item, slot and anchor`); break;
    case 'glove': if (a.output !== 'held' || !GLOVES.includes(a.slot) || !point(a.anchor)) fail(`${a.id}: a glove is held, one of ${GLOVES}, with an anchor`); break;
    case 'icon': if (!a.item || a.w !== a.h || a.w !== (a.output === 'icon24' ? 24 : 32)) fail(`${a.id}: an icon is a ${a.output} square of its item`); break;
    default: fail(`${a.id}: role ${a.role}`);
  }
}
for (const file of await readdir('assets/gunsmith/v1')) if (!files.has(`assets/gunsmith/v1/${file}`)) fail(`assets/gunsmith/v1/${file} is not in the manifest`);

// The old guns' inventory pictures stay procedural (art/inventory.ts); `virtual` cuts them into layers (#28 M3-03): a
// whole copy with `clearRects` emptied and `fillRects` filled, or the `rect` alone, on the whole canvas or cropped.
const rect = r => Array.isArray(r) && r.length === 4 && r.every(n => Number.isInteger(n) && n >= 0);
for (const v of manifest.virtual ?? []) {
  if (!/^gs-[a-z0-9]+-[a-z0-9]+(-factory)?-i$/.test(v.key) || ids.has(`${v.key}-v1`)) fail(`virtual ${v.key}: key`);
  if (v.output !== 'inventory' || !v.sourceKey || !['receiver', 'factory'].includes(v.role)) fail(`virtual ${v.key}: an inventory layer of a source picture`);
  if (v.rect !== undefined && !rect(v.rect)) fail(`virtual ${v.key}: rect`);
  for (const r of v.clearRects ?? []) if (!rect(r)) fail(`virtual ${v.key}: clearRects`);
  for (const [color, ...r] of v.fillRects ?? []) if (!/^#[0-9a-f]{6}$/.test(color) || !rect(r)) fail(`virtual ${v.key}: fillRects`);
  if (v.rect && !v.wholeCanvasLayer && (v.w !== v.rect[2] || v.h !== v.rect[3])) fail(`virtual ${v.key}: a cropped layer is its rect's size`);
  for (const [name, p] of Object.entries(v.mounts ?? {})) if (!inside(v, p)) fail(`virtual ${v.key}: mount ${name} off the canvas`);
  if (v.anchor != null && !inside(v, v.anchor)) fail(`virtual ${v.key}: anchor off the canvas`);
  if (v.tip != null && !inside(v, v.tip, true)) fail(`virtual ${v.key}: tip off the canvas`);
}

// The runtime key drops the version suffix (ART-SPEC 7.1): a v2 replaces its v1 without code changes.
const key = id => id.replace(/-v\d+$/, '');
const FIELDS = ['output', 'gun', 'item', 'role', 'slot', 'anchor', 'mounts', 'grip', 'bore', 'forward', 'tip', 'hand', 'beam', 'layer',
  'wholeCanvasLayer', 'embeddedFrontGlove', 'wholeGunCanvas'];
const VIRTUAL_FIELDS = [...FIELDS, 'sourceKey', 'rect', 'clearRects', 'fillRects'];
const meta = manifest.assets.map(a => {
  const out = { w: a.w, h: a.h };
  for (const f of FIELDS) if (a[f] !== undefined && a[f] !== null) out[f] = a[f];
  return `  '${key(a.id)}': ${JSON.stringify(out)},`;
});
const virtual = (manifest.virtual ?? []).map(v => {
  const out = { w: v.w, h: v.h };
  for (const f of VIRTUAL_FIELDS) if (v[f] !== undefined && v[f] !== null) out[f] = v[f];
  return `  '${v.key}': ${JSON.stringify(out)},`;
});
const head = `/**
 * Gunsmith art from Sol (manifest revision ${manifest.revision}, batch ${manifest.batch}; ${manifest.assets.length} independent 1x PNG).
 * Generated by scripts/gunsmith-assets.mjs from assets/gunsmith/manifest.json; do not edit. Keys drop the version suffix.
 */`;
await writeFile('src/art/gunsmith-art-meta.ts', `${head}
import type { GunsmithArt, VirtualArt } from './gunsmith-art-types';

export const GUNSMITH_ART_REVISION = ${manifest.revision};
export const GUNSMITH_ART: Readonly<Record<string, GunsmithArt>> = {
${meta.join('\n')}
};
/** The old guns' inventory layers, cut from their procedural pictures (art/gunsmith-compose.ts paints them). */
export const GUNSMITH_VIRTUAL: Readonly<Record<string, VirtualArt>> = {
${virtual.join('\n')}
};
`);
const lines = manifest.assets.map(a => `import ${'g' + a.id.replace(/[^a-z0-9]/gi, '_')} from '../../${a.file}';`);
const table = manifest.assets.map(a => `  '${key(a.id)}': ${'g' + a.id.replace(/[^a-z0-9]/gi, '_')},`);
await writeFile('src/art/gunsmith-assets.ts', `${head}
${lines.join('\n')}

/** Each PNG as the data URL esbuild inlines, by the key of GUNSMITH_ART. */
export const GUNSMITH_ART_URLS: Readonly<Record<string, string>> = {
${table.join('\n')}
};
`);
console.log(`src/art/gunsmith-art-meta.ts, src/art/gunsmith-assets.ts: ${manifest.assets.length} assets, ${virtual.length} virtual layers, revision ${manifest.revision}`);
