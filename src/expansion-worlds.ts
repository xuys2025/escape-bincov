import type { WorldResolver } from './expansion-state';
import { BUILDING_WORLD } from './building-world';
import { MARKET_WORLD } from './market-world';
import { MALL_WORLD, mallWorldV2, mallWorldV3, mallWorldV4 } from './mall-world';

/** Production layouts are registered here, never supplied by imported save data.
 * M0's two-map prototype is an explicit test fixture, not a selectable game map. */
export const resolveExpansionWorld: WorldResolver = version => version === BUILDING_WORLD.id ? BUILDING_WORLD
    : version === MARKET_WORLD.id ? MARKET_WORLD
    : version === MALL_WORLD.id ? MALL_WORLD : version === 'mall-v2' ? mallWorldV2() : version === 'mall-v3' ? mallWorldV3()
    : version === 'mall-v4' ? mallWorldV4() : undefined;
