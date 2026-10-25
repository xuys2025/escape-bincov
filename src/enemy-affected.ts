import type { ArchetypeId } from './enemy-archetypes';
import type { Point } from './world';

/** Dangerous market service yard sample, never a patient queue or a civilian residence.
 * These are local posts; the western public road remains outside all warning boundaries. */
export const AFFECTED_SQUAD = 'market-affected-v2';
const at = (x: number, y: number): Readonly<Point> => Object.freeze({ x: (x + .5) * 32, y: (y + .5) * 32 });
export const AFFECTED_POSTS: readonly Readonly<{ id: ArchetypeId; home: Readonly<Point>; fallback: Readonly<Point>; patrol: readonly Readonly<Point>[] }>[] = Object.freeze([
    Object.freeze({ id: 'salt-dazed', home: at(18,34), fallback: at(18,34), patrol: Object.freeze([at(18,34),at(18,33)]) }),
    Object.freeze({ id: 'tide-chaser', home: at(24,34), fallback: at(24,34), patrol: Object.freeze([at(24,34),at(24,33)]) }),
    Object.freeze({ id: 'tide-ritualist', home: at(28,34), fallback: at(28,34), patrol: Object.freeze([at(28,34),at(28,33)]) }),
    Object.freeze({ id: 'salt-hulk', home: at(32,34), fallback: at(32,34), patrol: Object.freeze([at(32,34)]) }),
]);
