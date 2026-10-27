/**
 * Which areas a player can deploy to, the one preselected when the page opens, and the `?sample=` playtest flags.
 * Read by the tab page, the station yard and the raid view alike; no page or view state lives here.
 */
import { SAMPLE_AREA } from './coast-view/appearance';
import type { RunWorld } from './hideout-runtime/contract';
import { generateRunBase } from './world';

// Node tests render the UI without a location: no flags there.
const params = () => new URLSearchParams(globalThis.location?.search ?? '');
export type SampleMode = 'village' | 'mall';
export const sampleMode = (): SampleMode | null => { const s = params().get('sample'); return s === 'village' || s === 'mall' ? s : null; };
export const sampleEnabled = () => sampleMode() !== null;
/**
 * Areas a player can deploy to. The classic coast area is closed: it repeated the street's coast map and will be
 * redone as a new map. Raids already started there still resume and settle. Under `?test=1` it stays deployable, so
 * suites can still start a classic checkpoint raid (the kind an old save may hold).
 */
export const raidWorlds = (): RunWorld[] => params().get('test') === '1' ? ['coast', 'buildings', 'mall'] : ['buildings', 'mall'];
/** Area selected when the page opens. */
export const defaultWorld = (): RunWorld => sampleMode() === 'mall' ? 'mall' : 'buildings';
/** Layout revision for a new mall raid: revision 4, every region furnished (older raids keep theirs). */
export const sampleMallLayout = (world: string): 4 | undefined => world === 'mall' ? 4 : undefined;

/**
 * Playtest deploy with an empty seed field: take the first seed from the clock whose spawn lies in the dressed village
 * corner and whose two exits include the north checkpoint there, so the run starts in the finished area. This is the
 * same choice as typing that seed; spawn and exit rules are untouched. A typed seed is always used as typed.
 */
export function villageSeed(from = Date.now()): number {
  const inside = (p: { x: number; y: number }) => p.x >= SAMPLE_AREA.x && p.x < SAMPLE_AREA.x + SAMPLE_AREA.w && p.y >= SAMPLE_AREA.y && p.y < SAMPLE_AREA.y + SAMPLE_AREA.h;
  for (let seed = from; seed < from + 400; seed++) {
    const run = generateRunBase(seed);
    if (inside(run.spawn) && run.exits.some(e => e.id === 'north')) return seed;
  }
  return from;
}
