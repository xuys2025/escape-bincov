/**
 * Mall art for the 2.5D view: the decoded samples (mall-art-load.ts, imported on demand) plus the procedural pieces of
 * art/mall.ts behind the same `procedural:` ids the dressing table uses. This module imports no PNG, so the scene and
 * Node tests can use it; only a mall raid with art loads the samples.
 */
import { paintAisleSign, paintCafeSet, paintMallDecal, paintMallStairsDown, paintMallStairsUp, type MallDecal } from './art/mall';
import { PAINTED_TYPES, paintMallFurniture } from './art/mall-furniture';
import { PROCEDURAL, SIGN_COLORS } from './mall-dressing';
import type { FurnitureName } from '../mall-layout-v2';

export type MallArt = ReadonlyMap<string, HTMLCanvasElement>;

const painted = new Map<string, HTMLCanvasElement>();
/** First asset id of a preference list that `mallCanvas` can draw (a decoded sample or a known procedural piece). */
export function mallPick(art: MallArt | null, ids: readonly string[]): string | null {
  for (const id of ids) {
    if (!id.startsWith(PROCEDURAL)) { if (art?.has(id)) return id; continue; }
    const name = id.slice(PROCEDURAL.length);
    if (name === 'stairs-up' || name === 'stairs-down' || name === 'cafe-set' || name.startsWith('sign:') || name.startsWith('decal:')) return id;
    if (name.startsWith('furniture:') && PAINTED_TYPES.has(name.split(':')[1])) return id;
  }
  return null;
}
/**
 * First available canvas for a list of asset ids in preference order: a decoded sample, or a procedural piece
 * (`procedural:stairs-up`, `procedural:sign:<kind>`, `procedural:decal:<kind>` with `seed`,
 * `procedural:furniture:<type>:<look>:<end>:<variant>`). Null when nothing fits.
 */
export function mallCanvas(art: MallArt | null, ids: readonly string[], seed = 0): HTMLCanvasElement | null {
  const id = mallPick(art, ids); if (!id) return null;
  if (!id.startsWith(PROCEDURAL)) return art!.get(id)!;
  const name = id.slice(PROCEDURAL.length), key = name.startsWith('decal:') ? `${name}:${seed}` : name;
  let c = painted.get(key);
  if (!c) {
    c = name === 'stairs-up' ? paintMallStairsUp(3, 3) : name === 'stairs-down' ? paintMallStairsDown(3, 3) : name === 'cafe-set' ? paintCafeSet()
      : name.startsWith('sign:') ? signOf(name.slice(5))
      : name.startsWith('furniture:') ? furnitureOf(name.slice(10))
      : paintMallDecal(name.slice(6) as MallDecal, seed);
    painted.set(key, c);
  }
  return c;
}
/** `sign:<kind>` or `sign:aisle:<n>`: the board colour of the kind and its mark (department pictogram or aisle number). */
const signOf = (spec: string) => { const [kind, n] = spec.split(':'); return paintAisleSign(SIGN_COLORS[kind] ?? SIGN_COLORS.aisle, n ?? kind); };
/** `furniture:<type>:<look>:<end>:<variant>` (mall-dressing.ts `mallProps`). */
const furnitureOf = (spec: string) => { const [type, look, end, variant] = spec.split(':'); return paintMallFurniture(type as FurnitureName, look, end, Number(variant) || 0); };
/** Emission mask paired with a sample (`<id>-emit`), if Sol delivered one. */
export const mallEmitId = (art: MallArt | null, id: string): string | null => {
  const emit = id.replace(/-v1$/, '-emit-v1'); return emit !== id && art?.has(emit) ? emit : null;
};
