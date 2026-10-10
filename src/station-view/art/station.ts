/**
 * Station art delivered by Sol (assets/station/v1, names from the station image specification). Every lookup falls
 * back to the procedural placeholder, so a partial delivery never breaks the scene; an image of the wrong size is
 * rejected and reported, never stretched.
 */
import type { Dir, Pose } from './people';
import { STATION_ASSET_META, STATION_ASSET_URLS } from '../assets';

export type StationArt = Map<string, HTMLCanvasElement>;
export interface ArtReport { delivered: string[]; used: string[]; rejected: { id: string; got: string; want: string }[] }
export const artReport: ArtReport = { delivered: [], used: [], rejected: [] };

let loaded: Promise<StationArt> | null = null;
/** Decode every delivered PNG once per page; the scene copies them into its own textures. */
export function loadStationArt(): Promise<StationArt> {
  loaded ??= Promise.all(Object.entries(STATION_ASSET_URLS).map(([id, url]) => new Promise<[string, HTMLCanvasElement]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0); resolve([id, c]); };
    img.onerror = () => reject(new Error(`Station asset failed to decode: ${id}`));
    img.src = url;
  }))).then(entries => { const art = new Map(entries); artReport.delivered = [...art.keys()].sort(); return art; })
    .catch(error => { loaded = null; throw error; });
  return loaded;
}

const used = new Set<string>();
/** A delivered image of exactly the expected size, or null. */
export function pick(art: StationArt, id: string, w: number, h: number): HTMLCanvasElement | null {
  const c = art.get(id);
  if (!c) return null;
  if (c.width !== w || c.height !== h) {
    if (!artReport.rejected.some(r => r.id === id)) artReport.rejected.push({ id, got: `${c.width}x${c.height}`, want: `${w}x${h}` });
    return null;
  }
  if (!used.has(id)) { used.add(id); artReport.used = [...used].sort(); }
  return c;
}
/** Emission mask registered for a delivered asset in the manifest (or null). */
export const emitOf = (id: string) => STATION_ASSET_META[id]?.emit ?? null;

/**
 * NPC frame. The fallback keeps one character in one style while directions are still missing: the exact frame, the
 * same pose's first frame, idle in that direction, the front-facing pose, then null (procedural placeholder for
 * characters with no delivered frames at all). West is drawn by mirroring east.
 */
export function npcFrame(art: StationArt, look: string, dir: Dir, pose: Pose, frame: number): HTMLCanvasElement | null {
  if (!art.size) return null;
  const d = dir === 'w' ? 'e' : dir, id = (dd: string, p: string, f: number) => `station-npc-${look}-${dd}-${p}-f${f}-v1`;
  const tries: [string, boolean][] = [[id(d, pose, frame), dir === 'w'], [id(d, pose, 0), dir === 'w'], [id(d, 'idle', frame % 2), dir === 'w'], [id('s', pose, frame % 2), false], [id('s', 'idle', frame % 2), false]];
  for (const [key, mirror] of tries) {
    const c = pick(art, key, 32, 48);
    if (!c) continue;
    if (!mirror) return c;
    const m = document.createElement('canvas'); m.width = 32; m.height = 48;
    const g = m.getContext('2d')!; g.translate(32, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
    return m;
  }
  return null;
}
