// Per-round glTexture slot audit of a context-restore trend report (station-resource-trend --mode=context): keys that
// left the table, keys that came in, and null placeholders with the identity their uid had in the previous sample.
// Before the R3 fix each restore leaves the three replaced render-target sources as placeholders; after it they leave
// the table and three new target sources come in. Usage: node scripts/station-resource-target-slots.mjs <report.json> <out.json>
import { readFile, writeFile } from 'node:fs/promises';
const [input, out] = process.argv.slice(2); if (!out) throw Error('report and output required');
const r = JSON.parse(await readFile(input, 'utf8'));
if (r.mode !== 'context') throw Error('context-mode report required');
const table = s => new Map(s.objects.rows.filter(o => o.table === 'glTexture').map(o => [o.key, o]));
const seq = [r.baseline, ...r.rows], rows = [];
for (let i = 1; i < seq.length; i++) {
  const prev = table(seq[i - 1]), cur = table(seq[i]);
  const was = k => { const o = prev.get(k); return o ? (o.live ? { type: o.type, textureKey: o.textureKey, label: o.label } : 'null') : 'absent'; };
  const removed = [...prev.keys()].filter(k => !cur.has(k)), added = [...cur.keys()].filter(k => !prev.has(k));
  const nulls = [...cur].filter(([, o]) => !o.live).map(([k]) => k);
  rows.push({ label: seq[i].label, live: cur.size - nulls.length, empty: nulls.length, removed: removed.map(k => ({ key: k, was: was(k) })),
    added: added.map(k => ({ key: k, live: cur.get(k).live, type: cur.get(k).type, textureKey: cur.get(k).textureKey })),
    newNulls: nulls.filter(k => was(k) !== 'null').map(k => ({ key: k, was: was(k) })) });
}
const count = f => rows.reduce((n, x) => n + f(x), 0);
const summary = {
  input, buildSHA256: r.buildSHA256, rounds: rows.length, baselineEmpty: table(r.baseline).size - [...table(r.baseline).values()].filter(o => o.live).length,
  finalEmpty: rows.at(-1).empty, removed: count(x => x.removed.length), added: count(x => x.added.length), newNulls: count(x => x.newNulls.length),
  everyRoundThreeOut: rows.every(x => x.removed.length === 3 && x.removed.every(o => o.was !== 'absent' && o.was !== 'null' && o.was.textureKey === null)),
  everyRoundThreeIn: rows.every(x => x.added.length === 3 && x.added.every(o => o.live && o.textureKey === null)),
  everyNewNullWasLive: rows.every(x => x.newNulls.every(o => typeof o.was === 'object')),
  note: 'type is the minified constructor name of the recorded build; textureKey null = not a scene.textures entry (the render targets, lighting and atmosphere sources).',
};
await writeFile(out, JSON.stringify({ summary, rows }, null, 2));
console.log(summary);
