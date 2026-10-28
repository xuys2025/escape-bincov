/**
 * The configurations of Sol's approved preview assemblies (gunsmith-assemblies.json) as part trees, shared by the art
 * layout unit test and the browser check that draws them and compares the pixels with Sol's previews.
 */
import type { PartNode } from '../../src/gunsmith/instance';

let n = 0;
export const part = (id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid: `u${++n}`, id, slot, relief: false, children });
export const CONFIGS: Record<string, Record<string, () => PartNode[]>> = {
    mb4a1: {
        factory: () => [],
        light: () => [part('S01', 'stock'), part('H01', 'handguard', [part('F03', 'under')]), part('O03', 'top'), part('G10', 'mag'), part('P01', 'grip')],
        stable: () => [part('S02', 'stock'), part('B08', 'barrel'), part('M06', 'muzzle'), part('H01', 'handguard', [part('F01', 'under')]), part('O08', 'top'), part('P02', 'grip')],
        laser: () => [part('H01', 'handguard', [part('T01', 'side')])],
        'p0-all': () => [part('O03', 'top'), part('M06', 'muzzle'), part('H01', 'handguard', [part('F01', 'under')])],
    },
    gb17: { factory: () => [], custom: () => [part('B01', 'barrel'), part('M03', 'muzzle'), part('O01', 'micro'), part('G01', 'mag')] },
    carbine: { factory: () => [], custom: () => [part('A07', 'base', [part('O08', 'top')]), part('H05', 'handguard', [part('F01', 'under'), part('T05', 'side')]), part('M06', 'muzzle')] },
    pistol: { factory: () => [] }, shotgun: { factory: () => [] },
};
