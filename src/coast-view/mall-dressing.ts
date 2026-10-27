/**
 * Mall dressing table for the 2.5D view: which ground material, wall face and furniture sprite each cell of a mall
 * floor shows. Pure data from the map's cells, regions and furniture decorations (src/mall-layout-v2.ts); nothing here
 * decides collision, visibility or loot. Each choice is a list of asset ids in preference order, so a missing sample
 * falls back to the next one (and finally to the procedural placeholder of the caller).
 */
import { MALL_FURNITURE, parseFurnitureName, type FurnitureName } from '../mall-layout-v2';

export interface DressRegion { id?: string; x: number; y: number; w: number; h: number; inside?: boolean }
export interface DressDecoration { x: number; y: number; kind: string; name: string }
export interface DressMap {
    mapId: string;
    cells: readonly (readonly string[])[];
    regions: readonly DressRegion[];
    decorations: readonly DressDecoration[];
    /** Layout 4: every region is furnished, so every room gets its floor, lights and clutter (layouts 2 and 3: the route). */
    full?: boolean;
}
/**
 * `x, y`: top-left of the canvas in world px; `z`: south edge used for depth sorting; `layer` overhead draws above actors.
 * `foot`: the piece's footprint and height, for its contact shadow. Asset ids starting with `procedural:` are painted by
 * art/mall.ts instead of loaded.
 */
export interface DressSprite {
    assets: readonly string[]; x: number; y: number; z: number; layer: 'sorted' | 'overhead'; emit: boolean;
    foot?: { x: number; y: number; w: number; h: number; lift: number };
}
export const PROCEDURAL = 'procedural:';

const TILE = 32;
const hash = (x: number, y: number, salt: number) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};
const id = (name: string) => `mall-${name}-v1`;
const pick = (x: number, y: number, salt: number, options: readonly string[]) => options[Math.floor(hash(x, y, salt) * options.length)];

/** Canvas sizes of the mall samples (Sol batch 1 brief); the sprite stands on its footprint's south edge. */
export const MALL_SPRITE_SIZE: Record<string, readonly [number, number]> = {
    'prop-gondola': [32, 72], 'prop-fridge': [32, 80], 'prop-partition': [32, 80], 'prop-column': [32, 80], 'prop-directory': [32, 80],
    'prop-pylon': [32, 96], 'stairs-up': [96, 144], 'stairs-down': [96, 112], 'prop-sandbags-2': [64, 46], 'prop-sofa-s': [64, 52],
    'prop-cart': [32, 54], 'prop-promo-table': [64, 54], 'prop-pallet-wrapped': [32, 56], 'prop-ice-bed': [64, 54], 'prop-scale-counter': [32, 56],
    'prop-freezer': [64, 54], 'prop-bench': [64, 50], 'prop-planter': [32, 62], 'prop-bed': [64, 84], 'prop-coffee-table': [32, 44],
    'prop-floor-lamp': [32, 76], 'cafe-set': [64, 58], 'prop-planter-box': [64, 56], 'prop-stanchions': [64, 44],
    'prop-adboard-fallen': [64, 44], 'overhead-umbrella': [64, 88], 'sign-hanging-green': [48, 18],
    'prop-gondola-toppled': [64, 44], 'prop-debris': [32, 44], 'prop-cart-fallen': [32, 44], 'prop-sandbags-1': [32, 46],
};
const SINGLE: Partial<Record<FurnitureName, string>> = {
    column: 'prop-column', directory: 'prop-directory', pylon: 'prop-pylon', 'stairs-up': 'stairs-up', 'stairs-down': 'stairs-down',
    sandbags: 'prop-sandbags-2', sofa: 'prop-sofa-s', cart: 'prop-cart', 'promo-table': 'prop-promo-table', pallet: 'prop-pallet-wrapped',
    'ice-bed': 'prop-ice-bed', 'scale-counter': 'prop-scale-counter', freezer: 'prop-freezer', bench: 'prop-bench', planter: 'prop-planter',
    bed: 'prop-bed', 'coffee-table': 'prop-coffee-table', 'coffee-table-wide': 'prop-coffee-table', 'floor-lamp': 'prop-floor-lamp',
    'planter-box': 'prop-planter-box', stanchions: 'prop-stanchions', adboard: 'prop-adboard-fallen', partition: 'prop-partition',
    'gondola-toppled': 'prop-gondola-toppled', debris: 'prop-debris',
};
/**
 * Layout-4 pieces painted by the view (art/mall-furniture.ts) until Sol's samples arrive: canvas height above the
 * footprint, so a drawn sample of the same size can replace one without moving anything.
 */
export const PAINTED_LIFT: Partial<Record<FurnitureName, number>> = {
    'shelf-wall': 48, rack: 56, counter: 24, 'glass-case': 26, 'kitchen-line': 24, sink: 26, stall: 44, lockers: 46, switchgear: 48,
    'clothes-rail': 22, barrier: 12, 'diner-table': 20, desk: 30, cabinet: 26, safe: 20, mannequin: 24, 'fitting-room': 44, vending: 40,
    checkout: 24, 'ball-pool': 36, slide: 24, 'bamboo-screen': 48, car: 18, dumpster: 40, container: 62, 'ac-unit': 24,
};
/**
 * Drawn base of a painted piece narrower than its footprint (x, y, w, h in px inside the footprint), for its shadow:
 * a shadow under the whole footprint would sit apart from a thin rail or a mannequin's stand.
 */
const PAINTED_BASE: Partial<Record<FurnitureName, readonly [number, number, number, number]>> = {
    mannequin: [10, 14, 12, 8], 'clothes-rail': [0, 12, 32, 9], vending: [3, 6, 26, 20], cabinet: [5, 8, 22, 18], safe: [4, 8, 24, 18],
    'ac-unit': [2, 8, 28, 20], barrier: [0, 9, 32, 14], 'diner-table': [4, 6, 56, 24], slide: [4, 8, 58, 16], 'bamboo-screen': [12, 0, 8, 96],
    checkout: [6, 2, 20, 60], dumpster: [2, 6, 60, 22], car: [6, 14, 84, 38],
};
/** Look of a painted piece by the region it stands in (the stock on a wall shelf, a counter's finish). */
const LOOKS: Partial<Record<FurnitureName, Record<string, string>>> = {
    'shelf-wall': { 'F1-01': 'pharmacy', 'F1-06': 'grocery', 'F1-07': 'phones', 'F1-08': 'hardware', 'F2-01': 'clothes' },
    counter: { 'F1-02': 'diner', 'F2-01': 'boutique', 'F1-08': 'wood' },
};
const EMITS = new Set(['prop-fridge-a', 'prop-fridge-b', 'prop-directory', 'prop-pylon', 'prop-floor-lamp', 'wall-curtain', 'wall-curtain-broken', 'wall-window-2f']);

const contains = (r: DressRegion, x: number, y: number) => x * TILE >= r.x && x * TILE < r.x + r.w && y * TILE >= r.y && y * TILE < r.y + r.h;
const regionAt = (m: DressMap, x: number, y: number) => m.regions.find(r => r.inside !== false && contains(r, x, y)) ?? m.regions.find(r => contains(r, x, y));
/** The building's cells (both floors): x 8..64, y 6..48. */
export const insideFootprint = (x: number, y: number) => x >= 8 && x <= 64 && y >= 6 && y <= 48;
export const MALL_FOOTPRINT = { x: 8 * TILE, y: 6 * TILE, w: 57 * TILE, h: 43 * TILE } as const;

/** Ground material ids, preferred first. Unlisted regions keep the large tile inside and the plaza paving outside. */
export function mallGround(m: DressMap, x: number, y: number): string[] {
    const r = regionAt(m, x, y)?.id ?? '';
    const by: Record<string, string> = {
        'O-02': 'ground-plaza', 'F1-11': 'ground-terrazzo', 'F2-14': 'ground-terrazzo', 'F1-12': 'ground-terrazzo', 'F2-15': 'ground-terrazzo',
        'F1-04': 'ground-tile-fresh', 'F1-05': 'ground-tile-cold', 'F2-13': 'ground-wood', 'F2-18': 'ground-deck',
    };
    // Layout 4 floors the rest from the same samples (Sol's M2 batch adds concrete, carpet, rubber and asphalt).
    const full: Record<string, string> = {
        'F1-01': 'ground-tile-cold', 'F1-02': 'ground-tile-fresh', 'F1-07': 'ground-terrazzo', 'F1-14': 'ground-terrazzo', 'F2-01': 'ground-wood',
        'F2-04': 'ground-wood', 'F2-06': 'ground-deck', 'F2-07': 'ground-wood', 'F2-08': 'ground-wood', 'F2-11': 'ground-tile-cold',
    };
    const base = by[r] ?? (m.full ? full[r] : undefined) ?? (r.startsWith('O-') || !insideFootprint(x, y) ? 'ground-plaza' : 'ground-tile-large');
    const fallback = base === 'ground-plaza' ? [] : ['ground-tile-large'];
    return [...[`${base}-${hash(x >> 1, y >> 1, 3) < .5 ? 'a' : 'b'}`, `${base}-a`].map(id), ...fallback.map(f => id(`${f}-a`))];
}

const furnitureAt = (m: DressMap) => {
    const at = new Map<string, ReturnType<typeof parseFurnitureName>>();
    for (const d of m.decorations) { const f = parseFurnitureName(d.name); if (f) at.set(`${Math.floor(d.x / TILE)},${Math.floor(d.y / TILE)}`, f); }
    return at;
};
/** Wall cells that are furniture are drawn as props, never as wall segments. */
export function mallWallCells(m: DressMap): { x: number; y: number }[] {
    const f = furnitureAt(m), out: { x: number; y: number }[] = [];
    m.cells.forEach((row, y) => row.forEach((c, x) => { if (c === 'wall' && !f.has(`${x},${y}`)) out.push({ x, y }); }));
    return out;
}
const BACK_OF_HOUSE = new Set(['F1-09', 'F1-10', 'F1-15', 'F2-09', 'F2-10', 'F2-17', 'F1-13', 'F2-16', 'F2-12']);
/** Face of a wall cell as seen from the south: glass curtain at the lobbies, service block at back-of-house rooms. */
export function mallWallFace(m: DressMap, x: number, y: number): string[] {
    const south = regionAt(m, x, y + 1)?.id ?? '', own = m.regions.find(r => contains(r, x, y))?.id ?? '';
    if (m.mapId === 'mall-f1' && y === 6 && x >= 54 && x <= 63) return [id(hash(x, y, 9) < .2 ? 'wall-curtain-broken' : 'wall-curtain'), id('wall-curtain')];
    if (m.mapId === 'mall-f2' && y === 6 && x >= 54 && x <= 63) return [id('wall-window-2f'), id('wall-facade-int-a'), id('wall-service-a')];
    if (BACK_OF_HOUSE.has(own) || BACK_OF_HOUSE.has(south)) return [id(hash(x, y, 7) < .5 ? 'wall-service-a' : 'wall-service-b'), id('wall-service-a')];
    return [id('wall-facade-int-a'), id('wall-service-a')];
}

/**
 * How a wall cell is drawn. F1's map edge is the blockade hoarding. On F2 everything outside the building is the drop
 * to the street, except the ring of cells around the terrace, which is its low parapet.
 */
export type WallRole = 'wall' | 'boundary' | 'parapet' | 'void';
export function mallWallRole(m: DressMap, x: number, y: number): WallRole {
    const rows = m.cells.length, cols = m.cells[0].length;
    if (m.mapId !== 'mall-f2') return y === 0 || x === 0 || y === rows - 1 || x === cols - 1 ? 'boundary' : 'wall';
    if (insideFootprint(x, y)) return 'wall';
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const c = m.cells[y + dy]?.[x + dx];
        if (c && c !== 'wall' && !insideFootprint(x + dx, y + dy)) return 'parapet';
    }
    return 'void';
}
/** Wall height above the ground line for each role (the 2.5D wall face is 48 px; the parapet stands 24 px). */
export const WALL_LIFT: Record<WallRole, number> = { wall: 48, boundary: 48, parapet: 24, void: 0 };
export function mallWallParts(m: DressMap, x: number, y: number): { cap: string[]; face: string[]; rail: string[] } {
    const role = mallWallRole(m, x, y);
    if (role === 'boundary') return { cap: [id('wall-hoarding-cap'), id('wall-cap')], face: [id(hash(x, y, 5) < .7 ? 'wall-hoarding-a' : 'wall-hoarding-b'), id('wall-hoarding-a')], rail: [] };
    if (role === 'parapet') return { cap: [id('wall-parapet-cap'), id('wall-cap')], face: [id('wall-parapet-face')], rail: [id('wall-parapet-rail')] };
    if (role === 'void') return { cap: [], face: [], rail: [] };
    return { cap: [id('wall-cap')], face: mallWallFace(m, x, y), rail: [] };
}

/**
 * An entrance: one to three open cells in a wall line, between two jambs (`wall` is the wall line's direction). Through a
 * two-cell-thick wall the second line of cells is `twin`.
 */
export interface MallOpening { wall: 'ew' | 'ns'; cells: { x: number; y: number }[]; facade: boolean; twin?: { x: number; y: number }[] }
/**
 * Entrances of a mall floor: gaps of one to three cells in a wall line, open on both sides, that join two different
 * places (two rooms, a room and a corridor, or the building and the outside). A gap inside one room or one corridor
 * (between shelving, the mouth of a dead end, beside a lone corner-marker pillar) is not an entrance.
 */
export function mallOpenings(m: DressMap): MallOpening[] {
    const f = furnitureAt(m), wall = (x: number, y: number) => m.cells[y]?.[x] === 'wall' && !f.has(`${x},${y}`) && mallWallRole(m, x, y) !== 'void';
    const open = (x: number, y: number) => { const c = m.cells[y]?.[x]; return !!c && c !== 'wall'; };
    const lone = (x: number, y: number) => !wall(x - 1, y) && !wall(x + 1, y) && !wall(x, y - 1) && !wall(x, y + 1);
    // The innermost room on each side (rooms may overlap), a corridor, or the outside.
    const place = (x: number, y: number) => insideFootprint(x, y)
        ? m.regions.filter(r => r.inside !== false && contains(r, x, y)).sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id ?? regionAt(m, x, y)?.id ?? '' : 'outside';
    const band = (x: number, y: number) => insideFootprint(x, y) && (x <= 9 || x >= 63 || y <= 7 || y >= 47);
    const out: MallOpening[] = [];
    // `along(i)` steps along the wall line, `across(i, s)` to either side of it.
    const scan = (dir: 'ew' | 'ns', lines: number, length: number, cell: (line: number, i: number) => [number, number]) => {
        for (let line = 0; line < lines; line++) for (let i = 1; i < length - 1; i++) {
            const [px, py] = cell(line, i - 1), [x0, y0] = cell(line, i);
            if (!wall(px, py) || wall(x0, y0) || !open(x0, y0)) continue;
            const side = (x: number, y: number, s: number): [number, number] => dir === 'ew' ? [x, y + s] : [x + s, y];
            const through = (x: number, y: number) => !wall(x, y) && open(x, y) && open(...side(x, y, -1)) && open(...side(x, y, 1));
            // The gap ends at the next jamb: a wall in the line, or a corner where a wall across the line meets it.
            let end = i; while (end < length && end - i < 4 && through(...cell(line, end))) end++;
            // A corner jamb is a wall running across the line beside its end (two cells of it, not a wall alongside).
            const [ex, ey] = cell(line, end), corner = !wall(ex, ey) && (wall(...side(ex, ey, -1)) && wall(...side(ex, ey, -2)) || wall(...side(ex, ey, 1)) && wall(...side(ex, ey, 2)));
            if (end === i || end - i > 3 || !wall(ex, ey) && !corner) continue;
            // Jambs: no lone pillars, and not two walls running across the line (a slot between two parallel walls).
            const acrossWall = (x: number, y: number) => dir === 'ew' ? wall(x, y - 1) && wall(x, y + 1) : wall(x - 1, y) && wall(x + 1, y);
            if (lone(px, py) || !corner && (lone(ex, ey) || acrossWall(px, py) && acrossWall(ex, ey))) continue;
            const cells = [...Array(end - i).keys()].map(k => cell(line, i + k));
            const [mx, my] = cells[cells.length >> 1], a = place(...side(mx, my, -1)), b = place(...side(mx, my, 1));
            if (a === b) continue;
            out.push({ wall: dir, cells: cells.map(([x, y]) => ({ x, y })), facade: cells.some(([x, y]) => band(x, y)) && (a === 'outside' || b === 'outside') });
        }
    };
    const rows = m.cells.length, cols = m.cells[0].length;
    scan('ew', rows, cols, (y, x) => [x, y]);
    scan('ns', cols, rows, (x, y) => [x, y]);
    // One doorway through a two-cell-thick wall is one entrance: keep the outer line (the facade's), the inner as its twin.
    const key = (o: MallOpening, shift: number) => o.cells.map(c => o.wall === 'ns' ? `${c.x + shift},${c.y}` : `${c.x},${c.y + shift}`).join(' ');
    const merged: MallOpening[] = [];
    for (const o of out) {
        const pair = merged.find(p => p.wall === o.wall && (key(p, 1) === key(o, 0) || key(p, -1) === key(o, 0)));
        if (!pair) { merged.push(o); continue; }
        if (o.facade && !pair.facade) { const inner = pair.cells; Object.assign(pair, { cells: o.cells, facade: true, twin: inner }); }
        else pair.twin = o.cells;
    }
    return merged;
}
/**
 * Entrances in east-west walls get a header at wall height (north-south openings show no face in this projection): the
 * facade's are entrance headers, the rest shutters.
 */
export function mallLintels(m: DressMap): { x: number; y: number; assets: string[] }[] {
    return mallOpenings(m).filter(o => o.wall === 'ew').flatMap(o => o.cells.map(({ x, y }) => ({ x, y, assets: o.facade ? [id('wall-lintel-entrance')] : [id('wall-lintel-shutter')] })));
}

/** Wall-mounted pieces (anchor: bottom centre, `up` px above the wall's ground line) and hanging lights, by floor. */
const WALL_PROPS: Record<string, readonly [string, number, number, number][]> = {
    'mall-f1': [['wallprop-exit', 60, 6, 47], ['wallprop-emergency', 56, 6, 40], ['wallprop-emergency', 49, 17, 40],
        ['wallprop-hydrant', 33, 13, 18], ['wallprop-hydrant', 51, 17, 18], ['wallprop-exit', 37, 13, 47]],
    'mall-f2': [['sign-board-wall', 59, 6, 34], ['wallprop-exit', 56, 6, 40], ['wallprop-emergency', 62, 6, 40]],
};
const TUBES: Record<string, readonly [number, number, boolean][]> = {
    'mall-f1': [[34, 24, false], [43, 27, false], [50, 24, false], [38, 30, false], [47, 27, true], [59, 10, false], [41, 16, false], [36, 37, false], [48, 37, true]],
    'mall-f2': [[59, 21, false], [59, 28, true], [59, 35, false], [60, 12, false]],
};
export function mallWallProps(m: DressMap): DressSprite[] {
    return (WALL_PROPS[m.mapId] ?? []).map(([name, x, y, up]) => {
        const [w, h] = name === 'sign-board-wall' ? [64, 20] : name === 'wallprop-hydrant' ? [22, 30] : name === 'wallprop-exit' ? [20, 10] : [16, 10];
        return { assets: [id(name)], x: x * TILE + 16 - w / 2, y: (y + 1) * TILE - up - h, z: (y + 1) * TILE + .1, layer: 'sorted', emit: name !== 'wallprop-hydrant' && name !== 'sign-board-wall' };
    });
}
/**
 * Ceiling lights as light only: the view cuts the ceiling away, so a fixture drawn at ceiling height reads as an object
 * lying on the floor. `x, y`: the lit floor point in world px; broken tubes flicker.
 */
export interface MallLight { x: number; y: number; r: number; broken: boolean }
/** Tubes of the rooms layout 4 furnishes: about one per shop and two in the big halls, a few broken. */
const FULL_TUBES: Record<string, readonly [number, number, boolean][]> = {
    'mall-f1': [[17, 13, false], [22, 10, true], [17, 27, false], [17, 34, false], [14, 22, true], [60, 21, false], [60, 31, false], [60, 40, true],
        [36, 10, false], [49, 16, true], [60, 46, false], [14, 45, false], [22, 45, true], [35, 46, false], [47, 46, false]],
    'mall-f2': [[16, 12, false], [28, 11, false], [38, 12, false], [20, 18, true], [48, 17, false], [37, 23, false], [45, 30, false], [52, 26, true],
        [44, 39, false], [52, 42, false], [35, 43, false], [34, 36, true], [24, 39, false], [24, 45, false], [13, 25, false], [26, 24, true],
        [25, 31, false], [26, 37, true], [12, 38, false], [12, 45, true], [60, 46, false], [17, 32, false]],
};
export function mallLights(m: DressMap): MallLight[] {
    return [...TUBES[m.mapId] ?? [], ...m.full ? FULL_TUBES[m.mapId] ?? [] : []].map(([x, y, broken]) => ({ x: x * TILE + 16, y: y * TILE + 16, r: broken ? 80 : 115, broken }));
}

/** One sprite per furniture piece (multi-cell pieces at their north-west part) plus the umbrellas over cafe sets. */
export function mallProps(m: DressMap): DressSprite[] {
    const at = furnitureAt(m), out: DressSprite[] = [];
    const same = (x: number, y: number, type: string) => at.get(`${x},${y}`)?.type === type;
    for (const [key, f] of at) {
        if (!f || f.dx !== 0 || f.dy !== 0) continue;
        const [x, y] = key.split(',').map(Number), t = MALL_FURNITURE[f.type];
        let names: string[];
        const painted = f.type in PAINTED_LIFT;
        if (painted) {
            // Run modules close where the run ends; the seed varies stock and wear between a few versions per piece.
            const run = 'run' in t, end = run ? `${same(x - 1, y, f.type) ? '' : 'w'}${same(x + 1, y, f.type) ? '' : 'e'}` || 'm' : '';
            names = [`furniture:${f.type}:${LOOKS[f.type]?.[regionAt(m, x, y)?.id ?? ''] ?? ''}:${end}:${Math.floor(hash(x, y, 101) * 4)}`];
        } else if (f.type === 'gondola') {
            const w = same(x - 1, y, 'gondola'), e = same(x + 1, y, 'gondola');
            names = !w ? ['prop-gondola-end-w'] : !e ? ['prop-gondola-end-e']
                : [`prop-gondola-${pick(x, y, 17, ['mid-full-a', 'mid-full-b', 'mid-full-a', 'mid-sparse', 'mid-looted'])}`, 'prop-gondola-mid-full-a'];
        } else if (f.type === 'fridge') names = [`prop-fridge-${hash(x, y, 19) < .7 ? 'a' : 'b'}`, 'prop-fridge-a'];
        else if (f.type === 'cafe-table' || f.type === 'bistro-set') names = ['cafe-set'];
        else names = [SINGLE[f.type]!];
        const size = painted ? [t.w * TILE, t.h * TILE + PAINTED_LIFT[f.type]!] as const
            : MALL_SPRITE_SIZE[names[0].replace(/-(end-[ew]|mid-.*|[ab])$/, '')] ?? MALL_SPRITE_SIZE[names[0]] ?? [t.w * TILE, t.h * TILE];
        const south = (y + t.h) * TILE, stairs = f.type === 'stairs-up' || f.type === 'stairs-down';
        // Painted by the view: the stairs, the cafe set (the drawn sample fits a whole set into one cell, too small) and the
        // layout-4 pieces that have no sample yet.
        const cafe = names[0] === 'cafe-set', lamp = f.type === 'floor-lamp';
        const procedural = stairs ? PROCEDURAL + f.type : cafe ? PROCEDURAL + 'cafe-set' : painted ? PROCEDURAL + names[0] : null;
        // Every piece is centred on its footprint. Most fill it exactly; the one-cell cafe table's set is wider (chairs
        // reaching into the cells beside), the two-cell table of layout 3 narrower (it spans the sofa behind it).
        // The floor lamp stands in the middle of its cell on a small round base: only the base touches the floor.
        // A piece narrower than its footprint casts its shadow from the drawn piece, not from the whole footprint.
        const left = x * TILE + (t.w * TILE - size[0]) / 2;
        const base = painted ? PAINTED_BASE[f.type] : undefined;
        out.push({ assets: procedural ? [procedural] : names.map(id), x: left, y: south - size[1], z: south, layer: 'sorted',
            emit: names.some(n => EMITS.has(n)), foot: cafe ? { x: left + 6, y: y * TILE, w: size[0] - 12, h: t.h * TILE, lift: size[1] - t.h * TILE }
                : lamp ? { x: x * TILE + 11, y: y * TILE + 12, w: 10, h: 8, lift: 8 }
                : base ? { x: x * TILE + base[0], y: y * TILE + base[1], w: base[2], h: base[3], lift: size[1] - t.h * TILE }
                : { x: Math.max(x * TILE, left), y: y * TILE, w: Math.min(t.w * TILE, size[0]), h: t.h * TILE, lift: stairs ? 0 : size[1] - t.h * TILE } });
        if (cafe) {
            const [uw, uh] = MALL_SPRITE_SIZE['overhead-umbrella'];
            // The pole stands in the table's centre.
            out.push({ assets: [id('overhead-umbrella')], x: x * TILE + t.w * 16 - uw / 2, y: y * TILE + 16 - (uh - 1), z: south, layer: 'overhead', emit: false });
        }
    }
    return out.sort((a, b) => a.z - b.z || a.x - b.x);
}

/** Colour of the standing board per sign; the engine writes the text. */
export const SIGN_COLORS: Record<string, string> = { aisle: '#5f8456', fresh: '#4a7391', cold: '#8fa7ac', home: '#a8977a' };
/**
 * Signs stand on top of fixtures (gondola ends, weighing counters, the fridge wall, home-store partitions), never hang
 * from the cut-away ceiling. `top`: height of the fixture's top face above its ground line.
 */
export function mallSigns(m: DressMap): DressSprite[] {
    const at = furnitureAt(m), out: DressSprite[] = [];
    const stand = (x: number, y: number, top: number, kind: string): DressSprite =>
        ({ assets: [PROCEDURAL + 'sign:' + kind], x: x * TILE + 16 - 13, y: (y + 1) * TILE - top - 24 - 16, z: (y + 1) * TILE + .05, layer: 'sorted', emit: false });
    // Aisle numbers run west to east, then north to south, over the gondola runs (their west ends carry the board).
    const ends = [...at].flatMap(([key, f]) => {
        const [x, y] = key.split(',').map(Number);
        return f?.type === 'gondola' && at.get((x - 1) + ',' + y)?.type !== 'gondola' ? [[x, y]] : [];
    }).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    ends.forEach(([x, y], i) => out.push(stand(x, y, 40, 'aisle:' + (i + 1))));
    const extra: Record<string, readonly [number, number, number, string][]> = {
        'mall-f1': [[38, 36, 24, 'fresh'], [36, 39, 24, 'fresh'], [48, 33, 48, 'cold']],
        // The home-store boards stand in the middle of their four-module partition, over the sofa's centre.
        'mall-f2': [[58.5, 17, 48, 'home'], [58.5, 31, 48, 'home']],
    };
    for (const [x, y, top, kind] of extra[m.mapId] ?? []) out.push(stand(x, y, top, kind));
    return out;
}

/**
 * Ground clutter of a looted, flooded mall (V only: never blocks, never reads as loot): litter and cart tracks in the
 * aisles, spilled goods below gondolas, glass under the lobby glazing, mud trodden in at the main entrance, water stains
 * around the cold cases and on the terrace. Free floor cells only; stable per cell, never from the raid RNG.
 */
export interface MallDecalSpot { kind: 'litter' | 'glass' | 'cardboard' | 'water' | 'mud' | 'tracks' | 'cans'; x: number; y: number; seed: number; assets: string[] }
const DRAWN_DECAL: Partial<Record<MallDecalSpot['kind'], string>> = { litter: 'litter', glass: 'glass', cardboard: 'cardboard', water: 'water', mud: 'footprints', cans: 'spill' };
export function mallDecals(m: DressMap): MallDecalSpot[] {
    const f = furnitureAt(m), out: MallDecalSpot[] = [], used = new Set<string>();
    const free = (x: number, y: number) => m.cells[y]?.[x] === 'floor' && !f.has(x + ',' + y) && !used.has(x + ',' + y);
    const put = (kind: MallDecalSpot['kind'], x: number, y: number, wide = false) => {
        if (!free(x, y) || wide && !free(x + 1, y)) return;
        used.add(x + ',' + y); if (wide) used.add((x + 1) + ',' + y);
        const seed = Math.floor(hash(x, y, 91) * 1e6), drawn = DRAWN_DECAL[kind];
        out.push({ kind, x: x * TILE, y: y * TILE, seed, assets: [...drawn ? [id('decal-' + drawn + (seed % 2 ? '-a' : '-b'))] : [], PROCEDURAL + 'decal:' + kind] });
    };
    m.cells.forEach((row, y) => row.forEach((_, x) => {
        if (f.get(x + ',' + (y - 1))?.type === 'gondola' && hash(x, y, 7) < .22) put('cans', x, y);
        if (m.mapId === 'mall-f1' && y === 7 && x >= 54 && x <= 63 && hash(x, 6, 9) < .25) put('glass', x, y);
        if (m.mapId === 'mall-f1' && x >= 58 && x <= 62 && y >= 7 && y <= 10 && hash(x, y, 13) < .5) put('mud', x, y);
    }));
    const rate: Record<string, number> = { 'O-02': .07, 'F1-03': .1, 'F1-04': .08, 'F1-05': .08, 'F1-11': .1, 'F2-13': .05, 'F2-14': .06, 'F2-18': .08 };
    m.cells.forEach((row, y) => row.forEach((_, x) => {
        const r = regionAt(m, x, y)?.id ?? '', aisle = m.mapId === 'mall-f1' && y >= 14 && y <= 19 && x >= 27 && x <= 56;
        // Rooms outside the dressed route get a little litter too, so their floors do not read as untouched; layout 4
        // dresses every room and street.
        const other = m.full ? (r.startsWith('O-') ? .04 : .05) : r && !r.startsWith('O-') ? .025 : 0;
        if (hash(x, y, 23) >= (rate[r] ?? (aisle ? .08 : other))) return;
        const k = hash(x, y, 29);
        if (r === 'F1-05' || r === 'F1-04' || r === 'F2-18') put(k < .35 ? 'water' : 'litter', x, y, k < .35);
        else if (r === 'F1-03' || aisle) put(k < .35 ? 'tracks' : k < .55 ? 'cardboard' : 'litter', x, y, k < .55);
        else put(k < .3 ? 'cardboard' : k < .45 ? 'water' : 'litter', x, y, k < .45);
    }));
    return out;
}

/** Ambient of a cell: indoors in the footprint, the drop to the street beside the second floor, open air elsewhere. */
export function mallZone(m: DressMap, x: number, y: number): 'indoor' | 'outdoor' | 'drop' {
    if (insideFootprint(x, y)) return 'indoor';
    return m.mapId === 'mall-f2' && m.cells[y]?.[x] === 'wall' && mallWallRole(m, x, y) === 'void' ? 'drop' : 'outdoor';
}

/**
 * Low collision cells the layout does not name (revision-1 corner markers and fixtures outside the dressed route) get a
 * stand-in piece of clutter, so no cell that blocks movement looks like open floor. Blocking (B) cells without a name
 * are drawn as wall segments.
 */
export function mallStandIns(m: DressMap): DressSprite[] {
    const at = furnitureAt(m), out: DressSprite[] = [];
    m.cells.forEach((row, y) => row.forEach((c, x) => {
        if (c !== 'low' || at.has(`${x},${y}`)) return;
        const name = pick(x, y, 31, ['prop-pallet-wrapped', 'prop-cart-fallen', 'prop-sandbags-1', 'prop-pallet-wrapped', 'prop-debris']);
        const h = MALL_SPRITE_SIZE[name][1];
        out.push({ assets: [id(name)], x: x * TILE, y: (y + 1) * TILE - h, z: (y + 1) * TILE, layer: 'sorted', emit: false,
            foot: { x: x * TILE, y: y * TILE, w: TILE, h: TILE, lift: h - TILE } });
    }));
    return out;
}
