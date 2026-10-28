// Cut the hurt and recovery frames out of the accepted art sheets (#96 pixel-v2 for groups A and B, #122 for group C) into
// runtime PNGs under assets/coast/poses, and write their manifest and the importer src/coast-view/pose-assets.ts. A sheet
// is 3 columns (idle, hurt, recovery) by 5 rows
// (E, SE, S, NE, N) at exactly 8x nearest-neighbour. Every 8x8 block must be one colour, and column 0 must equal the
// runtime idle frame once driftMap's one-level canvas drift is restored, or nothing is written.
// Usage: node --import tsx scripts/export-hurt-poses.ts [--check]
//   --check writes nothing: it compares the committed frames pixel for pixel (deflate output may differ between Node
//   versions) and the manifest and importer text with what the sheets give, and exits 1 on any difference.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, type RGBA } from './title-art/png';

/** [art style, logical width, logical height, folder of the style's runtime body frames in assets/coast, accepted sheet
 *  edition] of each sheet: group A is main's four enemy kinds; groups B (#96) and C (#122) are #81's 18 archetypes
 *  (src/enemy-archetypes.ts) in their own style. */
export const POSE_KINDS = [
  ['scav', 32, 48, 'v1', 'pixel-v2'], ['salt', 32, 48, 'v1', 'pixel-v2'], ['elite', 32, 48, 'v1', 'pixel-v2'], ['creature', 40, 28, 'v1', 'pixel-v2'],
  ['raider-melee', 32, 48, 'enemy-v1', 'pixel-v2'], ['raider-gunner', 32, 48, 'enemy-v1', 'pixel-v2'], ['raider-lookout', 32, 48, 'enemy-v1', 'pixel-v2'],
  ['raider-boss', 32, 48, 'enemy-v1', 'v1'], ['tide-ritualist', 32, 48, 'enemy-v1', 'v1'], ['mercenary-scout', 32, 48, 'enemy-v1', 'v1'],
  ['mercenary-assault', 32, 48, 'enemy-v1', 'v1'], ['mercenary-support', 32, 48, 'enemy-v1', 'v1'], ['recovery-leader', 32, 48, 'enemy-v1', 'v1'],
  ['blockade-sentry', 32, 48, 'enemy-v1', 'v1'], ['blockade-patrol', 32, 48, 'enemy-v1', 'v1'], ['blockade-sergeant', 32, 48, 'enemy-v1', 'v1'],
  ['salt-dazed', 32, 48, 'enemy-v1', 'v1'], ['tide-chaser', 32, 48, 'enemy-v1', 'v1'], ['salt-hulk', 32, 48, 'enemy-v1', 'v1'],
  ['tidal-crab', 32, 48, 'enemy-v1', 'v1'], ['saltback-dog', 32, 48, 'enemy-v1', 'v2'], ['sac-spitter', 32, 48, 'enemy-v1', 'v2'],
] as const;
/** Styles the game draws no arms on: they attack with claws, and CoastView.syncArms shows arms only with a visible weapon.
 *  A pose may move their shoulder rows. */
export const ARMLESS: ReadonlySet<string> = new Set(['creature', 'salt-dazed', 'tide-chaser', 'salt-hulk', 'tidal-crab', 'saltback-dog', 'sac-spitter']);
/** [pose, sheet column, body frame index]: Sol's idle and walk frames are 0-4. */
export const POSES = [['hurt', 1, 5], ['recovery', 2, 6]] as const;
export const DIRS = ['e', 'se', 's', 'ne', 'n'] as const;
const SCALE = 8, OUT_DIR = 'assets/coast/poses';
export const MANIFEST = `${OUT_DIR}/manifest.json`, IMPORTER = 'src/coast-view/pose-assets.ts';
function poseKind(kind: string) {
  const k = POSE_KINDS.find(k => k[0] === kind);
  if (!k) throw new Error(`${kind} has no pose sheet`);
  return k;
}
export const sheetPath = (kind: string) => `assets/hit-feel/sources/${kind}-hurt-sheet-${poseKind(kind)[4]}.png`;
export const idlePath = (kind: string, dir: string) => `assets/coast/${poseKind(kind)[3]}/coast-${kind}-body-${dir}-f0-v1.png`;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const colour = (f: RGBA, i: number) => ((f.data[i] << 24) | (f.data[i + 1] << 16) | (f.data[i + 2] << 8) | f.data[i + 3]) >>> 0;

export type PoseAsset = { id: string; file: string; w: number; h: number; anchor: number[]; kind: string; dir: string;
  frameIndex: number; pose: string; sheet: string; sha256: string };

/** Fully transparent pixels match whatever colour they store (the templates went through a canvas, which clears it). */
export function samePixels(a: RGBA, b: RGBA): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  for (let i = 0; i < a.data.length; i += 4)
    if (!(a.data[i + 3] === 0 && b.data[i + 3] === 0) && [0, 1, 2, 3].some(k => a.data[i + k] !== b.data[i + k])) return false;
  return true;
}

/** The logical frame in a sheet cell; throws unless every 8x8 block is one colour. */
function cell(sheet: RGBA, row: number, col: number, w: number, h: number, name: string): RGBA {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const at = (dx: number, dy: number) => ((row * h * SCALE + y * SCALE + dy) * sheet.w + (col * w + x) * SCALE + dx) * 4, i0 = at(0, 0);
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) for (let k = 0; k < 4; k++)
      if (sheet.data[at(dx, dy) + k] !== sheet.data[i0 + k]) throw new Error(`${name} row ${row} column ${col}: block (${x},${y}) is not one colour`);
    data.set(sheet.data.subarray(i0, i0 + 4), (y * w + x) * 4);
  }
  return { w, h, data };
}

/**
 * The sheets went through a canvas, whose premultiplied alpha can move a channel of a semi-transparent pixel by one level.
 * #81's archetype bodies have such pixels (main's four kinds have none). Maps each drifted colour of the sheet's idle
 * column to the runtime idle frame's colour at the same pixel. Throws on any other difference (alpha, an opaque pixel,
 * a step above one level), on a colour standing for two runtime colours, and on a drifted colour that the idle frame
 * itself uses, since restoring it would change real pixels too.
 */
export function driftMap(sheetIdle: RGBA, idle: RGBA, name: string): Map<number, number> {
  if (sheetIdle.w !== idle.w || sheetIdle.h !== idle.h) throw new Error(`${name}: column 0 is ${sheetIdle.w}x${sheetIdle.h}, the runtime idle frame ${idle.w}x${idle.h}`);
  const map = new Map<number, number>(), own = new Set<number>();
  for (let i = 0; i < idle.data.length; i += 4) {
    if (idle.data[i + 3]) own.add(colour(idle, i));
    if (sheetIdle.data[i + 3] === 0 && idle.data[i + 3] === 0) continue;
    const from = colour(sheetIdle, i), to = colour(idle, i), alpha = idle.data[i + 3];
    if (from === to) continue;
    if (sheetIdle.data[i + 3] !== alpha || alpha === 255 || [0, 1, 2].some(k => Math.abs(sheetIdle.data[i + k] - idle.data[i + k]) > 1))
      throw new Error(`${name}: column 0 is not the runtime idle frame at (${i / 4 % idle.w},${Math.floor(i / 4 / idle.w)})`);
    if ((map.get(from) ?? to) !== to) throw new Error(`${name}: colour ${from.toString(16)} stands for two runtime colours`);
    map.set(from, to);
  }
  for (const from of map.keys()) if (own.has(from)) throw new Error(`${name}: drifted colour ${from.toString(16)} is also an idle colour`);
  return map;
}

/** A copy of a frame with each drifted colour of a driftMap restored. */
export function restoreDrift(f: RGBA, map: ReadonlyMap<number, number>): RGBA {
  const data = new Uint8Array(f.data);
  for (let i = 0; i < data.length; i += 4) {
    const to = map.get(colour(f, i));
    if (to !== undefined) data.set([to >>> 24, (to >>> 16) & 255, (to >>> 8) & 255, to & 255], i);
  }
  return { w: f.w, h: f.h, data };
}

/** The frames and their manifest entries (hashes still to fill in), and the source sheet hashes, computed in memory. */
export function cutPoses() {
  const coast = JSON.parse(readFileSync('assets/coast/manifest.json', 'utf8')) as { assets: { file: string; anchor: number[] }[] };
  const sources: Record<string, string> = {}, entries: { asset: PoseAsset; frame: RGBA }[] = [];
  for (const [kind, w, h] of POSE_KINDS) {
    const bytes = readFileSync(sheetPath(kind)), sheet = decodePng(bytes);
    if (sheet.w !== 3 * w * SCALE || sheet.h !== 5 * h * SCALE) throw new Error(`${sheetPath(kind)}: ${sheet.w}x${sheet.h}, want ${3 * w * SCALE}x${5 * h * SCALE}`);
    sources[sheetPath(kind)] = sha(bytes);
    for (const [row, dir] of DIRS.entries()) {
      const idle = decodePng(readFileSync(idlePath(kind, dir))), drift = driftMap(cell(sheet, row, 0, w, h, kind), idle, `${kind} ${dir}`);
      if (!samePixels(restoreDrift(cell(sheet, row, 0, w, h, kind), drift), idle)) throw new Error(`${kind} ${dir}: column 0 is not the runtime idle frame`);
      const anchor = coast.assets.find(a => a.file === idlePath(kind, dir))?.anchor;
      if (!anchor) throw new Error(`${idlePath(kind, dir)} is not in assets/coast/manifest.json`);
      for (const [pose, col, frameIndex] of POSES) {
        const id = `coast-${kind}-body-${dir}-f${frameIndex}-v1`;
        entries.push({ asset: { id, file: `${OUT_DIR}/${id}.png`, w, h, anchor, kind, dir: dir.toUpperCase(), frameIndex, pose, sheet: sheetPath(kind), sha256: '' },
          frame: restoreDrift(cell(sheet, row, col, w, h, kind), drift) });
      }
    }
  }
  return { sources, entries };
}

export const manifestText = (sources: Record<string, string>, assets: readonly PoseAsset[]) => JSON.stringify({
  schema: 1,
  source: 'assets/hit-feel/sources/*-hurt-sheet-<edition>.png (#96 pixel-v2, #122 v1 and v2); editions in POSE_KINDS',
  generator: 'scripts/export-hurt-poses.ts',
  note: 'Runtime hurt (frame 5) and recovery (frame 6) bodies cut from the pixel-v2 sheets, with the one-level canvas drift on semi-transparent pixels restored to the idle frames\' colours. Anchors are the idle frames\'.',
  sources,
  assets,
}, null, 2) + '\n';

export function importerText(assets: readonly { id: string; file: string }[]): string {
  const name = (a: { id: string }) => `p${a.id.replace(/^coast-/, '').replace(/-v1$/, '').replaceAll('-', '_')}`;
  return `/**
 * Hurt and recovery body frames (#75; art from #96 and #122): frame indices 5 and 6 beside Sol's idle and walk frames
 * 0-4, named the same way (an archetype's under its own style), so Textures.actor and its flash, rim and edge find them
 * by frame. Generated by scripts/export-hurt-poses.ts from ${MANIFEST}; build.mjs checks every hash.
 */
${assets.map(a => `import ${name(a)} from '../../${a.file}';`).join('\n')}

const POSE_URLS: Readonly<Record<string, string>> = {
${assets.map(a => `  '${a.id}': ${name(a)},`).join('\n')}
};

let loaded: Promise<ReadonlyMap<string, HTMLCanvasElement>> | null = null;

/**
 * Decodes the pose frames once per page and adds them to a loaded coast art map under their manifest IDs. The map is
 * changed in place and returned, so a caller can chain it after loadCoastAssets. A failed decode rejects and is retried
 * on the next call, like the coast assets themselves.
 */
export async function withPoses(art: Map<string, HTMLCanvasElement>): Promise<Map<string, HTMLCanvasElement>> {
  loaded ??= Promise.all(Object.entries(POSE_URLS).map(([id, url]) => new Promise<[string, HTMLCanvasElement]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); if (!g) throw new Error('Canvas 2D unavailable');
        g.drawImage(img, 0, 0); resolve([id, c]);
      } catch (error) { reject(new Error(\`Pose frame failed to prepare: \${id}\`, { cause: error })); }
    };
    img.onerror = () => reject(new Error(\`Pose frame failed to decode: \${id}\`));
    img.src = url;
  }))).then(entries => new Map(entries)).catch(error => { loaded = null; throw error; });
  for (const [id, canvas] of await loaded) art.set(id, canvas);
  return art;
}
`;
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/export-hurt-poses.ts')) {
  const { sources, entries } = cutPoses();
  if (process.argv.includes('--check')) {
    const problems: string[] = [], committed = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { assets: PoseAsset[] };
    entries.forEach(({ asset, frame }, i) => {
      const bytes = readFileSync(asset.file);
      if (!samePixels(decodePng(bytes), frame)) problems.push(`${asset.file}: pixels differ from the sheet`);
      asset.sha256 = committed.assets[i]?.sha256 ?? '';
      if (asset.sha256 !== sha(bytes)) problems.push(`${asset.file}: manifest hash differs from the file`);
    });
    if (readFileSync(MANIFEST, 'utf8') !== manifestText(sources, entries.map(e => e.asset))) problems.push(`${MANIFEST} is out of date`);
    if (readFileSync(IMPORTER, 'utf8') !== importerText(entries.map(e => e.asset))) problems.push(`${IMPORTER} is out of date`);
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log(`Pose frames up to date: ${entries.length} frames from ${Object.keys(sources).length} sheets.`);
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const { asset, frame } of entries) { const png = encodePng(frame); writeFileSync(asset.file, png); asset.sha256 = sha(png); }
    writeFileSync(MANIFEST, manifestText(sources, entries.map(e => e.asset)));
    writeFileSync(IMPORTER, importerText(entries.map(e => e.asset)));
    console.log(`Exported ${entries.length} pose frames from ${Object.keys(sources).length} sheets.`);
  }
}
