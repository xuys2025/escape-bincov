import type { EnemyState } from './checkpoint';
import type { ArchetypeId } from './enemy-archetypes';
import type { Point } from './world';
import { AFFECTED_POSTS, AFFECTED_SQUAD } from './enemy-affected';
import { BLOCKADE_POSTS, BLOCKADE_SQUAD } from './enemy-blockade';

/** Static authored content, selected only for newly deployed members of this squad.
 * home identifies a post; target/path/timer and stance already persist its current movement.
 * No new clock, random draw, population or hidden knowledge of squad losses. */
export const MARKET_RAIDERS = 'market-raiders-v1';
const at = (x: number, y: number): Readonly<Point> => Object.freeze({ x: (x + .5) * 32, y: (y + .5) * 32 });
export const MARKET_POSTS: readonly Readonly<{ id: ArchetypeId; home: Readonly<Point>; fallback: Readonly<Point>; patrol: readonly Readonly<Point>[] }>[] = Object.freeze([
    Object.freeze({ id: 'raider-boss', home: at(24, 34), fallback: at(30, 34), patrol: Object.freeze([at(24, 34), at(24, 33)]) }),
    Object.freeze({ id: 'raider-melee', home: at(20, 34), fallback: at(26, 34), patrol: Object.freeze([at(20, 34), at(20, 33)]) }),
    Object.freeze({ id: 'raider-gunner', home: at(28, 34), fallback: at(32, 34), patrol: Object.freeze([at(28, 34), at(28, 33)]) }),
]);
export const MARKET_STORES = at(25, 34);
export function enemyPost(enemy: EnemyState) {
    const posts = enemy.tactics?.squad === MARKET_RAIDERS ? MARKET_POSTS
        : enemy.tactics?.version === 2 && enemy.tactics.program.kind === 'affected' && enemy.tactics.squad === AFFECTED_SQUAD ? AFFECTED_POSTS
        : enemy.tactics?.version === 2 && enemy.tactics.program.kind === 'blockade' && enemy.tactics.squad === BLOCKADE_SQUAD ? BLOCKADE_POSTS : [];
    return posts.find(post => post.id === enemy.id && post.home.x === enemy.home.x && post.home.y === enemy.home.y) ?? null;
}
