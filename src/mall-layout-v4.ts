/**
 * Mall layout revision 4 (data only): revision 3 plus every region it left undressed. Same skeleton, regions, passages,
 * stairs, anchors and exits as revisions 2 and 3; the revision-1 corner markers, the short F2 shelves, the fashion
 * island, the ball pool and the bamboo partition are replaced by named furniture, so every blocking cell is a piece the
 * view can draw. Revisions 2 and 3 stay as saved raids know them.
 *
 * Kept clear (tests/mall-layout-v4.test.ts): stair landings and their landing circles, the seven same-floor passage lanes,
 * exit circles, both spawns, the fixed test anchors, the north-south corridors beside the supermarket, the home-store
 * aisles, and the F2 fashion-store posts and crate stores of the raider encounter (src/enemy-mall.ts). Parallel rows of
 * fixtures keep two open rows between them.
 */
import { MALL_V2_REGIONS, MALL_V3_LAYOUT, type Placement } from './mall-layout-v2';

const F1: readonly Placement[] = [
    // F1-01 pharmacy: medicine shelves on the back wall, the dispensing counter (staff rows behind it), one shelf run
    // and waiting chairs for customers. The west door's passage lane and the fixed crate anchor stay clear.
    { type: 'shelf-wall', x: 12, y: 8, n: 13 }, { type: 'counter', x: 13, y: 11, n: 10 },
    { type: 'gondola', x: 13, y: 14, n: 6 }, { type: 'bench', x: 19, y: 16 },
    // F1-02 fried chicken: kitchen line and drinks coolers on the back wall, the order counter, nine tables.
    { type: 'kitchen-line', x: 11, y: 21, n: 10 }, { type: 'fridge', x: 22, y: 21, n: 3 }, { type: 'counter', x: 11, y: 24, n: 9 },
    ...[28, 31, 34].flatMap(y => [12, 16, 20].map(x => ({ type: 'diner-table', x, y }) as Placement)),
    // F1-06 convenience store: back shelves, one island, the till by the door, a vending machine.
    { type: 'counter', x: 58, y: 19 }, { type: 'shelf-wall', x: 59, y: 19, n: 4 }, { type: 'gondola', x: 60, y: 22, n: 3 }, { type: 'vending', x: 62, y: 24 },
    // F1-07 phone shop: wall display, glass counter with the staff row behind it.
    { type: 'shelf-wall', x: 59, y: 29, n: 4 }, { type: 'glass-case', x: 60, y: 32, n: 3 },
    // F1-08 hardware: pegboard wall, counter; the east door (P-E, through the facade) keeps its lane.
    { type: 'shelf-wall', x: 58, y: 38, n: 4 }, { type: 'counter', x: 60, y: 41, n: 3 },
    // F1-09 north storeroom: racking along the back wall and a second row clear of the doorway.
    { type: 'rack', x: 31, y: 8, n: 5 }, { type: 'pallet', x: 37, y: 8 }, { type: 'rack', x: 39, y: 8, n: 4 },
    { type: 'rack', x: 30, y: 11, n: 5 }, { type: 'rack', x: 40, y: 11, n: 3 },
    // F1-10 switch room.
    { type: 'switchgear', x: 46, y: 15, n: 5 },
    // F1-12 south-east lobby: outside the S-E landing circle and the P-L lane.
    { type: 'planter', x: 57, y: 44 }, { type: 'bench', x: 57, y: 47 }, { type: 'vending', x: 63, y: 47 },
    // F1-13 west service hall: lockers, racking, a pallet and a trolley; the S-W landing stays open.
    { type: 'lockers', x: 9, y: 47, n: 4 }, { type: 'rack', x: 18, y: 44, n: 6 }, { type: 'pallet', x: 24, y: 47 },
    { type: 'cart', x: 11, y: 44 }, { type: 'vending', x: 26, y: 41 },
    // F1-14 checkouts and south hall: six lanes either side of the south doors' lane.
    ...[31, 34, 37, 44, 47, 50].map(x => ({ type: 'checkout', x, y: 44 }) as Placement),
    { type: 'cart', x: 30, y: 47 }, { type: 'planter', x: 38, y: 47 }, { type: 'bench', x: 44, y: 47 }, { type: 'cart', x: 52, y: 47 },
    // O-01 promenade: planters, a bench, an abandoned car, a barrier line; the old spawn and P-W lane stay clear.
    { type: 'planter', x: 2, y: 7 }, { type: 'bench', x: 6, y: 18 }, { type: 'planter', x: 2, y: 22 }, { type: 'car', x: 2, y: 28 },
    { type: 'planter', x: 2, y: 34 }, { type: 'adboard', x: 5, y: 38 }, { type: 'barrier', x: 2, y: 45, n: 3 },
    // O-03 east alley: condensers on the facade, a skip, a car, pallets, a barrier before the loading yard.
    { type: 'dumpster', x: 67, y: 7 }, { type: 'ac-unit', x: 65, y: 10 }, { type: 'ac-unit', x: 65, y: 16 }, { type: 'car', x: 71, y: 12 },
    { type: 'pallet', x: 73, y: 19 }, { type: 'ac-unit', x: 65, y: 33 }, { type: 'barrier', x: 66, y: 42, n: 3 },
    // O-04 south street: two cars, a barrier line, a skip, sandbags; the south exit and P-S lane stay clear. Pieces stand
    // north of row 53: the hoarding along the map edge hides what stands against it.
    { type: 'dumpster', x: 2, y: 52 }, { type: 'car', x: 24, y: 50 }, { type: 'barrier', x: 30, y: 52, n: 4 }, { type: 'planter', x: 37, y: 49 },
    { type: 'sandbags', x: 44, y: 52 }, { type: 'car', x: 47, y: 50 },
    // O-05 loading yard: a container, pallets, a skip; the loading exit stays clear.
    { type: 'pallet', x: 59, y: 51 }, { type: 'pallet', x: 60, y: 51 }, { type: 'dumpster', x: 63, y: 52 }, { type: 'container', x: 70, y: 50 },
];

const F2: readonly Placement[] = [
    // F2-01 fashion: fitting rooms and wall rails on the north wall, rows of clothes rails, mannequins on the old island,
    // the till. The raider posts, their alternatives and the crate stores stay open; the escalator landing too.
    { type: 'fitting-room', x: 12, y: 8 }, { type: 'fitting-room', x: 15, y: 8 },
    { type: 'shelf-wall', x: 18, y: 7, n: 7 }, { type: 'shelf-wall', x: 31, y: 7, n: 13 },
    { type: 'clothes-rail', x: 12, y: 11, n: 6 }, { type: 'clothes-rail', x: 11, y: 14, n: 6 }, { type: 'clothes-rail', x: 11, y: 17, n: 6 },
    { type: 'clothes-rail', x: 11, y: 20, n: 6 }, { type: 'mannequin', x: 23, y: 12 }, { type: 'mannequin', x: 23, y: 14 },
    { type: 'clothes-rail', x: 31, y: 11, n: 5 }, { type: 'clothes-rail', x: 31, y: 14, n: 5 }, { type: 'counter', x: 40, y: 15, n: 4 },
    { type: 'clothes-rail', x: 46, y: 20, n: 6 },
    // F2-02 food hall: three gondola rows with two cross aisles, a toppled end; the fixed pair anchor stays open.
    ...[25, 28].flatMap(y => [{ type: 'gondola', x: 34, y, n: 6 }, { type: 'gondola', x: 42, y, n: 6 }, { type: 'gondola', x: 50, y, n: 4 }] as Placement[]),
    { type: 'gondola', x: 34, y: 31, n: 6 }, { type: 'gondola', x: 42, y: 31, n: 6 }, { type: 'gondola', x: 50, y: 31, n: 2 }, { type: 'gondola-toppled', x: 52, y: 31 },
    // F2-03 household goods: three rows of two runs.
    ...[37, 40, 43].flatMap(y => [{ type: 'gondola', x: 42, y, n: 5 }, { type: 'gondola', x: 49, y, n: 5 }] as Placement[]),
    // F2-04 bamboo and wood: the bamboo screen where revision 1 had its partition, display tables, planters.
    { type: 'bamboo-screen', x: 33, y: 40 }, { type: 'promo-table', x: 35, y: 41 }, { type: 'promo-table', x: 35, y: 44 },
    { type: 'planter', x: 31, y: 46 }, { type: 'planter', x: 39, y: 38 },
    // F2-05 promotions: tables and queue posts.
    { type: 'promo-table', x: 31, y: 35 }, { type: 'promo-table', x: 36, y: 35 }, { type: 'stanchions', x: 33, y: 37 },
    // F2-06 play area: the ball pool where revision 1 had it, a slide, a bench.
    { type: 'ball-pool', x: 22, y: 41 }, { type: 'slide', x: 26, y: 45 }, { type: 'bench', x: 19, y: 46 },
    // F2-07 office, F2-08 finance room, F2-09 storeroom (fixed crate anchor open), F2-10 switch room.
    { type: 'desk', x: 11, y: 23 }, { type: 'desk', x: 14, y: 23 }, { type: 'cabinet', x: 17, y: 23 }, { type: 'desk', x: 11, y: 26 }, { type: 'desk', x: 14, y: 26 },
    { type: 'safe', x: 23, y: 23 }, { type: 'cabinet', x: 23, y: 25 }, { type: 'desk', x: 25, y: 24 },
    { type: 'rack', x: 23, y: 29, n: 6 }, { type: 'pallet', x: 23, y: 32 }, { type: 'pallet', x: 24, y: 32 },
    { type: 'switchgear', x: 23, y: 36, n: 5 },
    // F2-11 toilets, F2-12 temporary store.
    { type: 'stall', x: 10, y: 36, n: 5 }, { type: 'sink', x: 10, y: 39, n: 3 },
    { type: 'rack', x: 10, y: 43, n: 5 }, { type: 'pallet', x: 10, y: 46 }, { type: 'pallet', x: 11, y: 46 },
    // F2-15 south-east lobby and F2-16 west service corridor: outside the landing circles and the P-TS lane.
    { type: 'vending', x: 57, y: 43 }, { type: 'bench', x: 57, y: 47 }, { type: 'planter', x: 63, y: 47 },
    { type: 'vending', x: 9, y: 30 }, { type: 'lockers', x: 9, y: 33, n: 2 },
];

/** Whether a layout revision furnishes every region (the view then dims no room and marks none as outside the sample). */
export const mallFullyDressed = (revision: string | null | undefined): boolean => revision === 'mall-layout-4';
/** Whether a region of a layout revision is furnished: every region in layout 4, the demo route (MALL_V2_REGIONS) otherwise. */
export const mallRegionDressed = (revision: string | null | undefined, region: string): boolean =>
    mallFullyDressed(revision) || (MALL_V2_REGIONS as readonly string[]).includes(region);

export const MALL_V4_LAYOUT: Record<'mall-f1' | 'mall-f2', readonly Placement[]> = {
    'mall-f1': [...MALL_V3_LAYOUT['mall-f1'], ...F1],
    'mall-f2': [...MALL_V3_LAYOUT['mall-f2'], ...F2],
};
