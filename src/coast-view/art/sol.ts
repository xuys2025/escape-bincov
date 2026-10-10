/**
 * Composition of Sol's first-batch samples (assets/coast/v1). Each painter returns null when a part has no sample,
 * so the caller keeps its procedural placeholder for it. Shadows, light, outlines of other actors and fades stay
 * runtime-owned, as the asset manifest requires.
 */
import { WALL_H, type WallSpec } from './structures';
import { P, canvas, hash, rect } from './paint';
import { soften } from './surface';

export type SolArt = ReadonlyMap<string, HTMLCanvasElement>;

const id = (name: string) => `coast-${name}-v1`;
const get = (art: SolArt, name: string) => art.get(id(name)) ?? null;

/**
 * Softened copies of the round-2 environment samples, made once per decoded art set. The samples carry single-pixel
 * static (asphalt b doubles asphalt a's contrast and is 10 levels brighter, so a/b tiles read as a checkerboard) and
 * high-contrast blotches on wall caps and faces; pulling each toward its mean keeps the painted clusters and palette
 * while the runtime adds the large-scale wear (surface.ts). Revised samples should arrive at these values (see the
 * Opus hand-off), after which the softening can be dropped.
 */
const SOFT: Record<string, [keep: number, mean?: number]> = {
  'ground-asphalt-a': [.55, 62], 'ground-asphalt-b': [.36, 62], 'ground-yard-a': [.62, 92], 'ground-yard-b': [.62, 92],
  'ground-tile-a': [.85], 'ground-tile-b': [.85], 'wall-core': [.3], 'wall-exterior-a': [.5], 'wall-exterior-b': [.5], 'wall-interior': [.75],
};
const softened = new WeakMap<SolArt, Map<string, HTMLCanvasElement | null>>();
function soft(art: SolArt, name: string): HTMLCanvasElement | null {
  let cache = softened.get(art);
  if (!cache) { cache = new Map(); softened.set(art, cache); }
  if (!cache.has(name)) {
    const src = get(art, name), rule = SOFT[name];
    cache.set(name, src && rule ? soften(src, rule[0], rule[1]) : src);
  }
  return cache.get(name)!;
}

/**
 * Manifest directions are E, SE, S, NE, N; W, SW and NW mirror E, SE and NE (pixelPolicy.actorMirror). Revision 2
 * bodies carry only weak ambient shading and directional light comes from the runtime lightmap, so mirroring does not
 * flip a visible key light (ART-R09).
 */
const PLAYER_DIR: Record<number, [string, boolean]> = { 0: ['e', false], 1: ['se', false], 2: ['s', false], 3: ['se', true], 4: ['e', true], 5: ['ne', true], 6: ['n', false], 7: ['ne', false] };

export function solPlayerFrame(art: SolArt, dir: number, frame: number): HTMLCanvasElement | null {
  const [d, mirror] = PLAYER_DIR[dir] ?? PLAYER_DIR[0];
  const src = get(art, `player-body-${d}-f${frame}`);
  if (!src) return null;
  const { c, g } = canvas(src.width, src.height);
  if (mirror) { g.translate(src.width, 0); g.scale(-1, 1); }
  g.drawImage(src, 0, 0);
  return c;
}

/** Grip (8,4) is the rotation pivot and the muzzle sits at x=28 on the barrel axis row 4. */
export function solWeapon(art: SolArt, weapon: string) {
  const src = weapon === 'carbine' ? get(art, 'weapon-carbine-held') : null;
  if (!src) return null;
  const { c, g } = canvas(src.width, src.height); g.drawImage(src, 0, 0);
  return { canvas: c, pivotX: 8, pivotY: 4, forward: 0, muzzle: 28 - 8, support: 12 };
}

/**
 * Composed wall cell: 32 px cap (core plus an edge strip on every open side) above a 48 px face. Door and window
 * parts replace the face; north-south doors, north-south windows and gaps have no sample and stay procedural.
 */
export function solWall(art: SolArt, s: WallSpec): HTMLCanvasElement | null {
  if (s.kind === 'door-ns' || s.kind === 'gap' || s.kind === 'window-ns') return null;
  const face = s.kind === 'window-ew' ? 'wall-window-ew' : s.kind === 'door-ew' ? (s.open ? 'wall-door-ew-open' : 'wall-door-ew-closed')
    : s.face === 'int' ? 'wall-interior' : hash(s.x, s.y, 11) < .5 ? 'wall-exterior-a' : 'wall-exterior-b';
  const core = soft(art, 'wall-core'), front = soft(art, face);
  if (!core || !front) return null;
  const { c, g } = canvas(32, 32 + WALL_H);
  g.drawImage(core, 0, 0);
  // Wall tops must read darker than every floor (asphalt ~60, yard ~90, tile ~109), or a one-tile wall looks like a
  // walkable slab. The sample's texture is kept (softened, so the blotches no longer read as a hedge); only its value
  // drops (124 -> ~66), so the edge strips become the rim.
  g.globalCompositeOperation = 'multiply'; rect(g, '#8a8780', 0, 0, 32, 32); g.globalCompositeOperation = 'source-over';
  // Cap seam every other cell and a few chips, so a long wall top reads as laid blocks rather than one flat band.
  if ((s.x + s.y) % 2 === 0) rect(g, '#3a3833', 0, 3, 1, 26);
  for (let i = 0; i < 2; i++) { const k = hash(s.x, s.y, 50 + i); if (k < .45) rect(g, '#5b5850', 4 + Math.floor(k * 50) % 22, 8 + i * 9, 2, 1); }
  const edge = (name: string, x: number, y: number) => { const e = get(art, name); if (e) g.drawImage(e, x, y); };
  if (!s.n) edge('wall-edge-n', 0, 0);
  if (!s.s) edge('wall-edge-s', 0, 29);
  if (!s.w) edge('wall-edge-w', 0, 0);
  if (!s.e) edge('wall-edge-e', 29, 0);
  if (s.ruined) for (let i = 0; i < 3; i++) { const k = hash(s.x, s.y, 40 + i); if (k < .5) g.clearRect(2 + Math.floor(k * 50) % 26, !s.n ? 0 : 29, 3, 3); }
  g.drawImage(front, 0, 32);
  if (s.kind === 'wall') facadeWear(g, s);
  // Wall ends keep a one-pixel light/dark side so runs of identical faces still read as separate masses.
  if (!s.w) rect(g, s.face === 'int' ? P.plasterLight : P.concreteLight, 0, 32, 1, WALL_H);
  if (!s.e) rect(g, s.face === 'int' ? P.plasterDark : P.concreteDeep, 31, 32, 1, WALL_H);
  return c;
}

/**
 * Face detail on plain wall cells (doors and windows keep their own art): a lit top course under the cap, a darker
 * damp foot, and, on some exterior cells, a rust or water streak running down from the top. Variants follow wallKey's
 * four-way split so the atlas keeps one texture per variant.
 */
function facadeWear(g: CanvasRenderingContext2D, s: WallSpec) {
  const v = Math.floor(hash(s.x, s.y, 11) * 4), top = 32, foot = 32 + WALL_H;
  g.fillStyle = 'rgba(232,224,204,.16)'; g.fillRect(0, top, 32, 2);
  g.fillStyle = 'rgba(24,22,18,.18)'; g.fillRect(0, foot - 6, 32, 6);
  g.fillStyle = 'rgba(24,22,18,.14)'; g.fillRect(0, foot - 3, 32, 3);
  if (s.face !== 'ext') return;
  if (v === 2) { g.fillStyle = 'rgba(120,77,61,.45)'; g.fillRect(21, top + 2, 1, 15); g.fillRect(22, top + 4, 1, 9); g.fillStyle = 'rgba(120,77,61,.25)'; g.fillRect(20, top + 8, 1, 10); }
  if (v === 3) { g.fillStyle = 'rgba(40,44,42,.22)'; g.fillRect(7, top + 2, 3, 22); g.fillRect(8, top + 24, 2, 8); }
}

const GROUND: Record<string, string> = { asphalt: 'ground-asphalt', yard: 'ground-yard', tile: 'ground-tile' };
/** Ground cell from the a/b pair by position hash; returns false when the material has no sample. */
export function solGround(art: SolArt, g: CanvasRenderingContext2D, mat: string, tx: number, ty: number, x: number, y: number): boolean {
  const base = GROUND[mat]; if (!base) return false;
  const src = soft(art, `${base}-${hash(tx, ty, 17) < .5 ? 'a' : 'b'}`);
  if (!src) return false;
  g.drawImage(src, x, y);
  return true;
}
