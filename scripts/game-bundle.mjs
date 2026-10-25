// The game script (src/main.ts) as the formal build packs it. scripts/build.mjs and the live diagnostics that swap a
// variant into dist/index.html build it here, so loader, target and define cannot drift apart (#60 Q-B06); a caller
// overrides only what differs, such as minify or a probe plugin, where it builds. Importing this module builds and
// writes nothing: the page template stays in build.mjs and the ZIPs in package.mjs. scripts/ci/game-bundle.test.mjs
// builds the heap diagnostics' variant on every CI run.
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const options = {
  entryPoints: ['src/main.ts'], bundle: true, write: false, minify: true, target: 'es2020', format: 'iife', legalComments: 'inline',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
};

/** Builds the game script in memory. Each override replaces a whole top-level esbuild option. */
export const buildGameScript = async (overrides = {}) => (await build({ ...options, ...overrides })).outputFiles[0].text;

/** `js` escaped so that it cannot end the inline script element holding it. */
export const inlineScript = js => js.replace(/<\/script/gi, '<\\/script');

/** A packaged page with its game script, the last inline script, replaced by `js`. */
export function withGameScript(html, js) {
  const at = html.lastIndexOf('<script>'), end = html.lastIndexOf('</script>');
  return html.slice(0, at + 8) + inlineScript(js) + html.slice(end);
}

/**
 * Heap-diagnostic probe, never part of the formal build: appends to src/pixi-app.ts a reader of the shared page pool
 * that returns primitives only, never exposing or retaining an Application or host. It reads that module's private
 * `parked` and `current` and its `gpuTextures`; renaming them there means renaming them here.
 */
export const pagePoolProbe = { name: 'read-only-page-pool', setup(b) { b.onLoad({ filter: /[\\/]src[\\/]pixi-app\.ts$/ }, async args => ({ loader: 'ts', resolveDir: dirname(args.path), contents: await readFile(args.path, 'utf8') + `
;globalThis.__solPagePool = () => ({ parked: !!parked, currentIsParked: current === parked, stageChildren: parked?.stage.children.length ?? null, tickerStarted: parked?.ticker.started ?? null, canvasConnected: parked?.canvas.isConnected ?? null, gpuTextures: gpuTextures() });
` })); } };
