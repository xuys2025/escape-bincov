// Assembles the GitHub Pages tree: the official site at the root and the packaged game at play/.
//
//   node scripts/site/build.mjs [--out=pages] [--no-game]
//
// Inputs: site/ (the site's own code, font subset, screenshots and icons), the game art listed in SHARED below
// (copied byte for byte, never re-encoded, so the site keeps no second copy of it) and dist/index.html from
// `pnpm package`. The output directory is generated and ignored by git. play/index.html must be the exact bytes
// of dist/index.html: the mirror and the release manifest check that hash (docs/CI.md, "Pages 与镜像").
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = resolve(root, arg('out') ?? 'pages');
const withGame = !process.argv.includes('--no-game');

const TITLE = ['title-sky-ready', 'title-harbor-ready', 'title-fog-high-new', 'title-fog-low-new', 'title-boat-master-v3',
  'title-mooring-master-v3', 'title-pier-master-v3', 'title-room-ready', 'title-lamp-master-v3', 'title-desk-master-v3',
  'title-light-new', 'title-radio-fx-new', 'title-chair-master-v3', 'title-fore-master-v3', 'title-rain-new',
  'title-sparks-new', 'title-wordmark-industrial-v5'];
const REGIONS = ['old-town', 'mall', 'hospital', 'old-hospital', 'factory', 'laboratory', 'highway', 'market',
  'observatory', 'lighthouse', 'harbor', 'freighter'];
const ENEMIES = ['raider-boss', 'raider-gunner', 'saltback-dog', 'tidal-crab', 'tide-ritualist', 'salt-hulk',
  'mercenary-assault', 'recovery-leader', 'blockade-sergeant', 'blockade-sentry'];
// M4A1 "stable" workbench assembly approved in tests/fixtures/gunsmith-assemblies.json (site/js/bench.js keeps the anchors).
const GUN = ['gs-s02-w-v1', 'gs-p02-w-v1', 'gs-mb4a1-mag-factory-w-v2', 'gs-b08-w-v1', 'gs-mb4a1-receiver-w-v1',
  'gs-h01-w-v1', 'gs-f01-w-v1', 'gs-o08-w-v1', 'gs-m06-w-v1'];

/** [repository path, path inside the site] */
const SHARED = [
  ...TITLE.map(k => [`assets/title/${k}.png`, `assets/title/${k}.png`]),
  ['assets/county-map/county-terrain.webp', 'assets/map/county-terrain.webp'],
  ...REGIONS.map(k => [`assets/county-map/briefing-concepts/${k}.webp`, `assets/map/${k}.webp`]),
  ...ENEMIES.flatMap(k => [0, 1, 2, 3, 4].map(f => [`assets/coast/enemy-v1/coast-${k}-body-s-f${f}-v1.png`, `assets/enemy/${k}-${f}.png`])),
  ...GUN.map(k => [`assets/gunsmith/v1/${k}.png`, `assets/gun/${k.replace(/-v\d+$/, '')}.png`]),
  ['assets/fonts/LICENSE.txt', 'assets/OFL-ChillBitmap.txt'],
];

const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Characters the site writes that its pixel font subset lacks (regenerate with scripts/site/subset-font.py). */
export function missingGlyphs() {
  const site = join(root, 'site');
  const files = ['index.html', ...['js', 'css'].flatMap(dir => readdirSync(join(site, dir)).map(f => `${dir}/${f}`))];
  const have = new Set(readFileSync(join(site, 'assets/fonts/characters.txt'), 'utf8').replace(/\n$/, ''));
  const used = new Set(files.flatMap(f => [...readFileSync(join(site, f), 'utf8')]).filter(c => c.codePointAt(0) > 0x7e && !/\s/.test(c)));
  return [...used].filter(c => !have.has(c)).sort();
}

export function build() {
  const missing = SHARED.map(([from]) => from).filter(from => !existsSync(join(root, from)));
  if (missing.length) throw new Error(`Shared game art missing:\n${missing.join('\n')}`);
  const game = join(root, 'dist/index.html');
  if (withGame && !existsSync(game)) throw new Error('dist/index.html is missing: run `pnpm package` first (or pass --no-game).');
  const glyphs = missingGlyphs();
  if (glyphs.length) throw new Error(`The site font lacks ${glyphs.join('')}: rerun scripts/site/subset-font.py (see its header).`);

  rmSync(out, { recursive: true, force: true });
  cpSync(join(root, 'site'), out, { recursive: true });
  for (const [from, to] of SHARED) {
    const target = join(out, to);
    if (existsSync(target)) throw new Error(`site/${to} would shadow shared art ${from}`);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, from), target);
  }
  if (withGame) {
    mkdirSync(join(out, 'play'), { recursive: true });
    cpSync(game, join(out, 'play/index.html'));
    if (sha(game) !== sha(join(out, 'play/index.html'))) throw new Error('play/index.html differs from dist/index.html');
  }
  return { out, files: SHARED.length, game: withGame ? sha(game) : null };
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const result = build();
  console.log(`Pages tree: ${result.out} (${result.files} shared art files${result.game ? `, play/index.html ${result.game}` : ', no game'})`);
}
