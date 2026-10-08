/**
 * Composition of Sol's first-batch samples (assets/coast/v1). Each painter returns null when a part has no sample,
 * so the caller keeps its procedural placeholder for it. Shadows, light, outlines of other actors and fades stay
 * runtime-owned, as the asset manifest requires.
 */
import { WALL_H, type WallSpec } from './structures';
import { P, canvas, hash, rect } from './paint';

export type SolArt = ReadonlyMap<string, HTMLCanvasElement>;

const id = (name: string) => `coast-${name}-v1`;
const get = (art: SolArt, name: string) => art.get(id(name)) ?? null;

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
  return { canvas: c, pivotX: 8, pivotY: 4, forward: 0, muzzle: 28 - 8 };
}

/**
 * Composed wall cell: 32 px cap (core plus an edge strip on every open side) above a 48 px face. Door and window
 * parts replace the face; north-south doors, north-south windows and gaps have no sample and stay procedural.
 */
export function solWall(art: SolArt, s: WallSpec): HTMLCanvasElement | null {
  if (s.kind === 'door-ns' || s.kind === 'gap' || s.kind === 'window-ns') return null;
  const face = s.kind === 'window-ew' ? 'wall-window-ew' : s.kind === 'door-ew' ? (s.open ? 'wall-door-ew-open' : 'wall-door-ew-closed')
    : s.face === 'int' ? 'wall-interior' : hash(s.x, s.y, 11) < .5 ? 'wall-exterior-a' : 'wall-exterior-b';
  const core = get(art, 'wall-core'), front = get(art, face);
  if (!core || !front) return null;
  const { c, g } = canvas(32, 32 + WALL_H);
  g.drawImage(core, 0, 0);
  const edge = (name: string, x: number, y: number) => { const e = get(art, name); if (e) g.drawImage(e, x, y); };
  if (!s.n) edge('wall-edge-n', 0, 0);
  if (!s.s) edge('wall-edge-s', 0, 29);
  if (!s.w) edge('wall-edge-w', 0, 0);
  if (!s.e) edge('wall-edge-e', 29, 0);
  if (s.ruined) for (let i = 0; i < 3; i++) { const k = hash(s.x, s.y, 40 + i); if (k < .5) g.clearRect(2 + Math.floor(k * 50) % 26, !s.n ? 0 : 29, 3, 3); }
  g.drawImage(front, 0, 32);
  // Wall ends keep a one-pixel light/dark side so runs of identical faces still read as separate masses.
  if (!s.w) rect(g, s.face === 'int' ? P.plasterLight : P.concreteLight, 0, 32, 1, WALL_H);
  if (!s.e) rect(g, s.face === 'int' ? P.plasterDark : P.concreteDeep, 31, 32, 1, WALL_H);
  return c;
}

const GROUND: Record<string, string> = { asphalt: 'ground-asphalt', yard: 'ground-yard', tile: 'ground-tile' };
/** Ground cell from the a/b pair by position hash; returns false when the material has no sample. */
export function solGround(art: SolArt, g: CanvasRenderingContext2D, mat: string, tx: number, ty: number, x: number, y: number): boolean {
  const base = GROUND[mat]; if (!base) return false;
  const src = get(art, `${base}-${hash(tx, ty, 17) < .5 ? 'a' : 'b'}`);
  if (!src) return false;
  g.drawImage(src, x, y);
  return true;
}
