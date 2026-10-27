/**
 * Procedural stand-ins for the layout-4 mall furniture (issue #47), drawn until Sol's samples arrive: the same footprint,
 * canvas and anchor the samples will use (mall-dressing.ts `PAINTED_LIFT`), so swapping in a drawn sample changes no
 * placement or collision. Projection as the samples: a point at depth `d` px into the footprint (north 0) and height `z`
 * px stands at canvas y = lift + d - z; 24 px is about a metre. Light from the top left; nothing here bakes shadows of
 * other objects. Run pieces are painted per module: `end` says which sides close the run ('w', 'e', 'we', or 'm').
 */
import { PAINTED_LIFT } from '../mall-dressing';
import { MALL_FURNITURE, type FurnitureName } from '../../mall-layout-v2';
import { mix, shade } from './mall';
import { canvas, disc, dot, hash, line, rect, type Ctx } from './paint';

const lit = (c: string, t = .18) => mix(c, '#ffffff', t), dark = (c: string, t = .3) => mix(c, '#000000', t);
interface Pen { g: Ctx; L: number; W: number; D: number; west: boolean; east: boolean }
/** Canvas row of a point `d` px into the footprint at height `z`. */
const Y = (p: Pen, d: number, z: number) => p.L + d - z;
/**
 * A box over [x, x+w) × [d, d+dd) from height z0 to h: its top face and its south face, lit north and west edges, dark
 * east edge, a crease between top and front and a dark foot. `open` sides of a run module skip their edge lines.
 */
function box(p: Pen, x: number, d: number, w: number, dd: number, h: number, top: string, front: string, z0 = 0, west = true, east = true) {
    const { g } = p, yt = Y(p, d, h), yf = Y(p, d + dd, h), yb = Y(p, d + dd, z0);
    rect(g, top, x, yt, w, dd); rect(g, front, x, yf, w, yb - yf);
    rect(g, lit(top), x, yt, w, 1);
    if (west) { rect(g, lit(top, .1), x, yt, 1, dd); rect(g, lit(front, .1), x, yf, 1, yb - yf); }
    if (east) { rect(g, dark(top, .2), x + w - 1, yt, 1, dd); rect(g, dark(front, .25), x + w - 1, yf, 1, yb - yf); }
    rect(g, dark(front, .35), x, yf, w, 1); rect(g, dark(front, .45), x, yb - 1, w, 1);
}
const pick = <T>(seed: number, k: number, list: readonly T[]) => list[Math.floor(hash(seed, k, 53) * list.length)];

// --- Tall fixtures against a wall or in rows ---------------------------------------------------------------------------

const STOCK: Record<string, { frame: string; back: string; goods: readonly string[] }> = {
    pharmacy: { frame: '#b9b7aa', back: '#d7d4c6', goods: ['#e6e2d4', '#7fa38a', '#7d93b0', '#b56a5e', '#d8cf9c'] },
    grocery: { frame: '#5f645c', back: '#3f433e', goods: ['#b5523f', '#d0a64a', '#5a7fa8', '#7a9a52', '#c9c0ac'] },
    phones: { frame: '#43474a', back: '#2c3033', goods: ['#1e2224', '#262b2e'] },
    hardware: { frame: '#5c5048', back: '#9a7a52', goods: ['#8e9296', '#c9a23a', '#a8483a', '#6d7a84'] },
    clothes: { frame: '#5a564e', back: '#7d776a', goods: ['#6a7f96', '#a35f52', '#d2c8b0', '#4f5c4a', '#8c6f8c', '#3e4652'] },
};
/** Wall shelving, 2 m: four shelves of goods (look by shop), overstock on top. */
function shelfWall(p: Pen, look: string, seed: number) {
    const s = STOCK[look] ?? STOCK.grocery, { g } = p, h = 48;
    box(p, 0, 0, p.W, p.D, h, dark(s.frame, .1), s.back, 0, p.west, p.east);
    // Overstock boxes on the top face.
    for (let k = 0; k < 2; k++) if (hash(seed, k, 3) < .6) { const x = 3 + k * 14, w = 9 + Math.floor(hash(seed, k, 5) * 4); rect(p.g, '#8a6f4d', x, Y(p, 6, h), w, 10); rect(p.g, '#9c805b', x, Y(p, 6, h), w, 2); }
    const front = Y(p, p.D, h);
    if (look === 'hardware') {
        for (let y = front + 3; y < front + h - 8; y += 4) for (let x = 2 + (y & 4 ? 2 : 0); x < p.W - 1; x += 4) dot(g, '#6d5538', x, y);
        for (let k = 0; k < 5; k++) {
            const x = 3 + Math.floor(hash(seed, k, 7) * (p.W - 8)), y = front + 5 + Math.floor(hash(seed, k, 9) * 26), c = pick(seed, k, s.goods);
            rect(g, c, x, y, 2, 8 + (k % 3) * 2); rect(g, lit(c), x, y, 1, 3); if (k % 2) rect(g, c, x - 1, y, 4, 2);
        }
        rect(g, s.frame, 0, front + h - 8, p.W, 8); rect(g, lit(s.frame), 0, front + h - 8, p.W, 1);
        return;
    }
    for (const top of [4, 15, 26, 37]) {
        const y0 = front + top;
        rect(g, s.frame, 0, y0 + 9, p.W, 2); rect(g, lit(s.frame), 0, y0 + 9, p.W, 1);
        for (let x = 1; x < p.W - 1;) {
            const w = look === 'phones' ? 5 : 2 + Math.floor(hash(seed + x, top, 11) * 4), c = pick(seed + x, top, s.goods);
            if (look === 'clothes') { rect(g, c, x, y0 + 1, w, 8); rect(g, lit(c, .12), x, y0 + 1, 1, 8); }
            else if (look === 'phones') { rect(g, c, x, y0 + 2, 4, 7); rect(g, '#5d7f8a', x + 1, y0 + 3, 2, 4); dot(g, '#a9c4c8', x + 1, y0 + 3); rect(g, '#d8d0b8', x, y0 + 9, 3, 1); }
            else if (hash(seed + x, top, 13) > .18) { const hh = 5 + Math.floor(hash(seed + x, top, 15) * 4); rect(g, c, x, y0 + 9 - hh, w, hh); rect(g, lit(c), x, y0 + 9 - hh, w, 1); }
            x += w + 1;
        }
    }
    if (p.west) rect(g, s.frame, 0, front, 2, h); if (p.east) rect(g, dark(s.frame), p.W - 2, front, 2, h);
}
/** Warehouse pallet racking, 2.3 m: orange uprights, blue beams, cartons on three levels. */
function rack(p: Pen, seed: number) {
    const { g } = p, h = 56, front = Y(p, p.D, h);
    // Cartons on the top deck.
    for (let k = 0; k < 2; k++) { const x = 2 + k * 15, w = 12; rect(g, '#8a6f4d', x, Y(p, 4, h), w, p.D - 8); rect(g, '#9c805b', x, Y(p, 4, h), w, 2); line(g, '#6f5638', x + 6, Y(p, 4, h), x + 6, Y(p, p.D - 5, h)); }
    for (const z of [2, 20, 38]) {
        const y = front + h - z - 18;
        for (let k = 0; k < 3; k++) if (hash(seed, z + k, 17) < .78) {
            const x = 2 + k * 10, w = 8, hh = 9 + Math.floor(hash(seed, z + k, 19) * 7), c = pick(seed, z + k, ['#8a6f4d', '#9c805b', '#7d6448', '#b8a77a']);
            rect(g, c, x, y + 16 - hh, w, hh); rect(g, lit(c), x, y + 16 - hh, w, 1); rect(g, dark(c, .2), x + w - 1, y + 16 - hh, 1, hh);
        }
        rect(g, '#3e5a74', 0, y + 16, p.W, 2); rect(g, lit('#3e5a74'), 0, y + 16, p.W, 1);
    }
    rect(g, '#3e5a74', 0, front, p.W, 2);
    for (const x of [...p.west ? [0] : [], ...p.east ? [p.W - 3] : []]) { rect(g, '#b8642e', x, Y(p, 0, h), 3, h + p.D); rect(g, lit('#b8642e'), x, Y(p, 0, h), 1, h + p.D); for (let y = front + 3; y < front + h; y += 6) dot(g, '#5a3418', x + 1, y); }
}
/** Electrical switchgear, 2 m: grey-green cabinets, louvres, meters and a warning plate. */
function switchgear(p: Pen, seed: number) {
    const { g } = p, h = 48, body = '#6f7a6c';
    box(p, 0, 0, p.W, p.D, h, lit(body, .08), body, 0, p.west, p.east);
    const front = Y(p, p.D, h);
    rect(g, dark(body, .25), 15, front + 2, 1, h - 4);
    for (let y = front + 30; y < front + 42; y += 3) { rect(g, dark(body, .3), 3, y, 10, 1); rect(g, dark(body, .3), 18, y, 10, 1); }
    rect(g, '#2a2e2a', 4, front + 6, 8, 6); rect(g, '#7fa070', 5, front + 7, 3, 2); dot(g, hash(seed, 1, 21) < .5 ? '#d04a3a' : '#5fbf6f', 9, front + 8);
    rect(g, '#d0b040', 20, front + 8, 7, 6); line(g, '#2a2620', 23, front + 9, 23, front + 11); dot(g, '#2a2620', 23, front + 12);
    rect(g, '#2f322e', 13, front + 18, 1, 6); rect(g, '#2f322e', 17, front + 18, 1, 6);
}
/** Staff lockers, 1.9 m: steel blue-grey doors with vents and handles; some doors ajar. */
function lockers(p: Pen, seed: number) {
    const { g } = p, h = 46, body = '#6a7a80';
    box(p, 0, 0, p.W, p.D, h, lit(body, .1), body, 0, p.west, p.east);
    const front = Y(p, p.D, h);
    for (const x of [0, 16]) {
        rect(g, dark(body, .3), x, front + 1, 1, h - 2);
        for (let y = front + 4; y < front + 12; y += 2) rect(g, dark(body, .35), x + 4, y, 8, 1);
        rect(g, '#c8ccc8', x + 12, front + 22, 2, 4);
        if (hash(seed, x, 23) < .25) { rect(g, '#1d2224', x + 2, front + 2, 12, h - 4); rect(g, lit(body), x + 12, front + 2, 3, h - 4); }
    }
}
/** Toilet cubicles, 1.8 m partitions: the pan seen from above, a door on the south face (some open). */
function stall(p: Pen, seed: number) {
    const { g } = p, h = 44, panel = '#9aa59e';
    rect(g, '#b7bdb4', 0, Y(p, 0, 0), p.W, p.D); // tiled floor inside
    disc(g, '#e4e4dc', 16, Y(p, 10, 0), 6, 5); disc(g, '#bfc0b8', 16, Y(p, 11, 0), 3, 2);
    rect(g, '#d8d8d0', 11, Y(p, 1, 0), 10, 4);
    // Partitions: the west one, the back wall top, and the door front.
    box(p, 0, 0, 2, p.D, h, lit(panel), panel, 0, true, false);
    if (p.east) box(p, p.W - 2, 0, 2, p.D, h, lit(panel), panel, 0, false, true);
    rect(g, lit(panel), 0, Y(p, 0, h), p.W, 2);
    const open = hash(seed, 2, 29) < .4, y = Y(p, p.D, h);
    rect(g, open ? '#2a2e2c' : panel, 2, y, p.W - 4, h - 4); rect(g, dark(panel, .35), 2, y, p.W - 4, 1);
    if (!open) { rect(g, dark(panel, .2), p.W - 7, y + 20, 3, 2); rect(g, '#c05a4a', p.W - 8, y + 16, 2, 2); }
    else rect(g, lit(panel), 2, y, 3, h - 4);
}
/** Drinks machine, 1.8 m: lit front with rows of cans. */
function vending(p: Pen, seed: number) {
    const { g } = p, h = 44, x = 3, w = 26, body = pick(seed, 1, ['#a8483a', '#3e5a74', '#d0a64a']);
    box(p, x, 6, w, 20, h, lit(body, .1), body);
    const front = Y(p, 26, h);
    rect(g, '#1e2224', x + 3, front + 3, 15, 30);
    for (let row = 0; row < 5; row++) for (let k = 0; k < 4; k++) { const c = pick(seed + row, k, ['#c9c0ac', '#b5523f', '#5a7fa8', '#7a9a52', '#d0a64a']); rect(g, c, x + 4 + k * 4, front + 4 + row * 6, 2, 4); rect(g, lit(c, .3), x + 4 + k * 4, front + 4 + row * 6, 1, 1); }
    rect(g, '#cfe0d8', x + 20, front + 6, 4, 3); rect(g, '#2a2a28', x + 20, front + 12, 4, 6); rect(g, '#1a1a18', x + 4, front + 36, 14, 4);
    if (hash(seed, 3, 31) < .5) line(g, '#dfe8e8', x + 6, front + 5, x + 14, front + 20); // cracked glass
}
/** Outdoor condenser: a grey box with a round fan grille on top. */
function acUnit(p: Pen) {
    const { g } = p, h = 30, body = '#8e9290';
    box(p, 2, 8, 28, 20, h, lit(body, .1), body);
    disc(g, '#4a4e4c', 16, Y(p, 18, h), 8, 8); disc(g, '#2e3230', 16, Y(p, 18, h), 6, 6);
    line(g, '#6a6e6c', 10, Y(p, 18, h), 22, Y(p, 18, h)); line(g, '#6a6e6c', 16, Y(p, 12, h), 16, Y(p, 24, h));
    const front = Y(p, 28, h);
    for (let y = front + 4; y < front + h - 3; y += 3) rect(g, dark(body, .25), 5, y, 22, 1);
    rect(g, '#5a5048', 6, front + h - 2, 4, 2); rect(g, '#5a5048', 22, front + h - 2, 4, 2);
}

// --- Counters and tables ---------------------------------------------------------------------------------------------

const COUNTER: Record<string, [string, string]> = { service: ['#b9ad92', '#6d6658'], diner: ['#a8a8a0', '#8a3a32'], boutique: ['#8a7458', '#4a3a2e'], wood: ['#9c805b', '#5c4a36'] };
/** Counter, 1 m: laminate top and a front panel (look by shop); the diner's has a white band, the boutique a brass rail. */
function counter(p: Pen, look: string, seed: number) {
    const [top, front] = COUNTER[look] ?? COUNTER.service, { g } = p, h = 24;
    box(p, 0, 4, p.W, p.D - 6, h, top, front, 0, p.west, p.east);
    const y = Y(p, p.D - 2, h);
    if (look === 'diner') rect(g, '#d8d0c0', 0, y + 8, p.W, 3);
    if (look === 'boutique') rect(g, '#b89a50', 0, y + 4, p.W, 1);
    // Something left on one module in four: a till (screen towards the shop), or a few papers.
    if (seed === 0) { rect(g, '#5a5c58', 10, Y(p, 8, h + 4), 12, 10); rect(g, lit('#5a5c58'), 10, Y(p, 8, h + 4), 12, 1); rect(g, dark('#5a5c58', .2), 10, Y(p, 18, h + 4), 12, 4); rect(g, '#2a2c2e', 12, Y(p, 9, h + 9), 8, 5); rect(g, '#7fa070', 13, Y(p, 10, h + 8), 4, 2); }
    else if (seed === 1) { rect(g, '#d8d4c8', 8, Y(p, 10, h), 8, 6); rect(g, '#bdb8aa', 10, Y(p, 12, h), 8, 6); }
}
/** Glass display counter, 1 m: dark frame, glass front showing phones, a reflection streak on top. */
function glassCase(p: Pen, seed: number) {
    const { g } = p, h = 26, frame = '#3a3e40';
    box(p, 0, 4, p.W, p.D - 6, h, '#7d9aa0', '#5f7a80', 0, p.west, p.east);
    const top = Y(p, 4, h), y = Y(p, p.D - 2, h);
    for (let k = 0; k < 3; k++) { const x = 4 + k * 9; rect(g, '#1e2224', x, top + 8, 5, 8); rect(g, '#6d8f98', x + 1, top + 9, 3, 5); }
    line(g, '#c8dcdc', 3, top + 3, 12, top + 12);
    rect(g, frame, 0, y, p.W, 2); rect(g, frame, 0, y + h - 3, p.W, 3);
    for (let k = 0; k < 4; k++) rect(g, pick(seed, k, ['#d8d0b8', '#8e9296', '#1e2224']), 3 + k * 7, y + 8, 4, 3);
    if (p.west) rect(g, frame, 0, top, 2, p.D - 6 + h); if (p.east) rect(g, frame, p.W - 2, top, 2, p.D - 6 + h);
}
/** Fryer line, 1 m: steel with two fryer wells, a griddle and knobs. */
function kitchenLine(p: Pen, seed: number) {
    const { g } = p, h = 24, steel = '#9a9c98';
    box(p, 0, 2, p.W, p.D - 4, h, lit(steel, .08), dark(steel, .2), 0, p.west, p.east);
    const top = Y(p, 2, h);
    if (hash(seed, 1, 41) < .6) { rect(g, '#2a2620', 4, top + 6, 10, 14); rect(g, '#5a4a28', 5, top + 7, 8, 12); rect(g, '#2a2620', 18, top + 6, 10, 14); rect(g, '#4a3e24', 19, top + 7, 8, 12); }
    else { rect(g, '#3a3a38', 3, top + 5, 26, 16); for (let x = 5; x < 28; x += 4) line(g, '#545450', x, top + 6, x, top + 19); }
    const y = Y(p, p.D - 2, h);
    for (const x of [6, 14, 22]) disc(g, '#2a2a28', x, y + 6, 1.5);
    rect(g, dark(steel, .35), 0, y + 12, p.W, 1);
}
/** Wash basins, 0.9 m: a counter with a white basin per module and a tap. */
function sink(p: Pen) {
    const { g } = p, h = 22, top = '#8e8a80';
    box(p, 0, 2, p.W, p.D - 8, h, top, dark(top, .15), 0, p.west, p.east);
    disc(g, '#e4e4dc', 16, Y(p, 12, h), 8, 5); disc(g, '#b8b8b0', 16, Y(p, 13, h), 5, 3); rect(g, '#c8ccc8', 15, Y(p, 3, h + 5), 2, 5);
}
/** Fast-food table for four: a laminate top on a pedestal between two stools each side. */
function dinerTable(p: Pen, seed: number) {
    const { g } = p, h = 18;
    for (const x of [4, 52]) for (const d of [8, 22]) { rect(g, '#5a5a56', x + 3, Y(p, d + 4, 12), 2, 12); disc(g, '#a8483a', x + 4, Y(p, d + 4, 12), 4, 3); disc(g, lit('#a8483a'), x + 3, Y(p, d + 3, 12), 2, 1); }
    rect(g, '#5a5a56', 30, Y(p, 16, h), 4, h); disc(g, '#3a3a38', 32, Y(p, 16, 0), 6, 2);
    box(p, 14, 5, 36, 20, h, '#d8d0c0', '#8a3a32', h - 3);
    if (hash(seed, 1, 43) < .5) { rect(g, '#c9a23a', 22, Y(p, 10, h + 3), 5, 4); rect(g, '#b5523f', 34, Y(p, 14, h + 2), 4, 3); }
}
/** Office desk with a monitor, keyboard and a chair pulled out in front. */
function desk(p: Pen, seed: number) {
    const { g } = p, h = 18, top = '#9a968a';
    box(p, 3, 1, 58, 18, h, top, dark(top, .35), h - 3);
    rect(g, dark(top, .45), 5, Y(p, 19, h - 3), 2, h - 3); rect(g, dark(top, .45), 57, Y(p, 19, h - 3), 2, h - 3); rect(g, dark(top, .3), 44, Y(p, 19, h - 3), 12, h - 4);
    rect(g, '#2a2c2e', 16, Y(p, 4, h + 12), 14, 10); rect(g, hash(seed, 1, 47) < .3 ? '#5d7f8a' : '#1a1c1e', 17, Y(p, 4, h + 11), 12, 7); rect(g, '#3a3c3e', 22, Y(p, 5, h + 2), 2, 2);
    rect(g, '#5a5c5e', 15, Y(p, 11, h), 14, 3); rect(g, '#d8d4c8', 36, Y(p, 6, h), 8, 6);
    const cx = 24 + Math.floor(hash(seed, 2, 47) * 10);
    rect(g, '#2e3032', cx - 5, Y(p, 24, 22), 10, 9); rect(g, '#3e4042', cx - 5, Y(p, 27, 12), 10, 4); rect(g, '#2e3032', cx - 1, Y(p, 30, 8), 2, 8); line(g, '#2e3032', cx - 5, Y(p, 30, 0), cx + 5, Y(p, 30, 0));
}
/** Filing cabinet (grey drawers) or the finance room's safe (dark steel with a dial). */
function cabinet(p: Pen, safe: boolean) {
    const { g } = p, h = safe ? 26 : 32, body = safe ? '#4f5a52' : '#8a8a84', x = safe ? 4 : 5, w = safe ? 24 : 22;
    box(p, x, 8, w, 18, h, lit(body, .1), body);
    const y = Y(p, 26, h);
    if (safe) { disc(g, '#c8ccc8', x + 12, y + 12, 4); disc(g, '#2a2e2a', x + 12, y + 12, 2); rect(g, '#c8ccc8', x + 18, y + 10, 2, 6); rect(g, dark(body), x + 2, y + 2, w - 4, 1); }
    else for (let k = 0; k < 4; k++) { rect(g, dark(body, .3), x + 1, y + 1 + k * 8, w - 2, 1); rect(g, '#c8ccc8', x + 9, y + 4 + k * 8, 4, 1); }
}
/** Checkout lane: the belt counter runs north-south, the till at its south end faces the shopper. */
function checkout(p: Pen, seed: number) {
    const { g } = p, h = 24, body = '#8a8478';
    box(p, 6, 2, 20, p.D - 4, h, '#9a968a', body);
    rect(g, '#3a3a38', 9, Y(p, 4, h), 14, 36); for (let d = 6; d < 40; d += 4) rect(g, '#55554f', 9, Y(p, d, h), 14, 1);
    rect(g, '#c8ccc8', 8, Y(p, 4, h), 1, 36); rect(g, '#c8ccc8', 23, Y(p, 4, h), 1, 36);
    rect(g, '#c8c4b4', 10, Y(p, 46, h + 10), 12, 10); rect(g, '#d8d4c4', 10, Y(p, 46, h + 10), 12, 2); rect(g, '#2a2c2e', 12, Y(p, 47, h + 9), 8, 4);
    rect(g, hash(seed, 1, 53) < .5 ? '#7fa070' : '#1a1c1e', 13, Y(p, 47, h + 8), 6, 2);
    rect(g, '#b8642e', 4, Y(p, 50, h + 16), 2, 16); rect(g, '#3a3c3a', 3, Y(p, 50, h + 18), 4, 3); // lane number post
}

// --- Fashion -----------------------------------------------------------------------------------------------------------

/** Clothes rail, 1.5 m: a chrome bar on end posts with garments hanging from it. */
function clothesRail(p: Pen, seed: number) {
    const { g } = p, bar = 36, d = 16;
    for (let x = 1; x < p.W - 1;) {
        const w = 3 + Math.floor(hash(seed + x, 1, 59) * 3), c = pick(seed + x, 2, STOCK.clothes.goods), len = 18 + Math.floor(hash(seed + x, 3, 59) * 8);
        if (hash(seed + x, 4, 59) > .15) { rect(g, c, x, Y(p, d, bar - 2), w, len); rect(g, lit(c, .15), x, Y(p, d, bar - 2), 1, len); rect(g, dark(c, .25), x + w - 1, Y(p, d, bar - 2), 1, len); }
        x += w;
    }
    rect(g, '#c8ccc8', 0, Y(p, d, bar), p.W, 2); rect(g, '#8e9296', 0, Y(p, d, bar) + 2, p.W, 1);
    for (const x of [...p.west ? [1] : [], ...p.east ? [p.W - 3] : []]) { rect(g, '#8e9296', x, Y(p, d, bar), 2, bar); rect(g, '#5a5c5e', x - 1, Y(p, d + 4, 0) - 2, 4, 2); }
}
/** Shop mannequin on a stand, dressed in a stock colour. */
function mannequin(p: Pen, seed: number) {
    const { g } = p, skin = '#c8c0b0', cloth = pick(seed, 1, STOCK.clothes.goods), cx = 16, d = 18;
    disc(g, '#5a5c5e', cx, Y(p, d, 0), 5, 2); rect(g, '#5a5c5e', cx, Y(p, d, 16), 1, 16);
    rect(g, dark(cloth, .2), cx - 3, Y(p, d, 18), 7, 6);
    rect(g, cloth, cx - 5, Y(p, d, 33), 11, 16); rect(g, lit(cloth, .15), cx - 5, Y(p, d, 33), 2, 16);
    rect(g, skin, cx - 7, Y(p, d, 31), 2, 10); rect(g, skin, cx + 6, Y(p, d, 31), 2, 10);
    disc(g, skin, cx, Y(p, d, 37), 3, 3); dot(g, lit(skin), cx - 1, Y(p, d, 38));
}
/** Two-cell fitting booth: panel walls, a curtain on the south side drawn half open. */
function fittingRoom(p: Pen, seed: number) {
    const { g } = p, h = 44, panel = '#b8b0a0';
    rect(g, '#6d6a62', 2, Y(p, 2, 0), 60, 60); // floor inside
    rect(g, '#8a7458', 46, Y(p, 8, 14), 12, 6); // stool
    box(p, 0, 0, 64, 3, h, lit(panel), panel);
    box(p, 0, 0, 3, 64, h, lit(panel), panel, 0, true, false); box(p, 61, 0, 3, 64, h, lit(panel), panel, 0, false, true);
    box(p, 31, 0, 2, 64, h, lit(panel), panel, 0, false, false);
    const y = Y(p, 64, h), curtain = pick(seed, 1, ['#7a4a5a', '#4f5c4a', '#3e4652']);
    rect(g, '#c8ccc8', 3, y, 58, 2);
    for (const [x, w] of [[3, 18], [33, 10]] as const) for (let k = 0; k < w; k++) rect(g, k % 3 ? curtain : dark(curtain, .25), x + k, y + 2, 1, h - 4);
}

// --- Play area and bamboo ----------------------------------------------------------------------------------------------

/** Ball pool, 4×3: padded low walls, a net on posts, coloured balls. */
function ballPool(p: Pen, seed: number) {
    const { g } = p, wall = 14, net = 36, pad = '#3e6a9a';
    rect(g, '#5a7a9a', 4, Y(p, 4, wall - 6), 120, 88);
    for (let k = 0; k < 260; k++) { const x = 6 + Math.floor(hash(seed, k, 61) * 116), d = 6 + Math.floor(hash(seed, k + 300, 61) * 84); disc(g, pick(seed, k, ['#c84a3a', '#d8b040', '#4a7ac8', '#5aa05a', '#e0e0d8']), x, Y(p, d, wall - 5), 1.5); }
    for (const [x, d, w, dd] of [[0, 0, 128, 4], [0, 0, 4, 96], [124, 0, 4, 96]] as const) box(p, x, d, w, dd, wall, '#d8b040', pad);
    box(p, 0, 92, 128, 4, wall, '#d8b040', pad);
    // Net: posts at the corners and midpoints, a dithered mesh between their tops and the padded wall.
    for (const x of [0, 62, 124]) for (const d of [0, 92]) rect(g, '#c8ccc8', x + 1, Y(p, d + 2, net), 2, net - wall);
    shade(g, '#d8dcd8', 1, Y(p, 94, net), 126, net - wall, .25);
    rect(g, '#c8ccc8', 0, Y(p, 94, net), 128, 1); rect(g, '#c8ccc8', 0, Y(p, 2, net), 128, 1);
}
/** Plastic slide: a ladder at the west end, the chute running down to the east. */
function slide(p: Pen) {
    const { g } = p, top = 30;
    box(p, 4, 8, 16, 16, top, '#d8b040', '#c84a3a');
    for (let z = 4; z < top; z += 6) rect(g, '#e0e0d8', 6, Y(p, 24, z), 12, 1);
    for (let x = 20; x < 62; x++) { const z = Math.round(top - (x - 20) * (top - 4) / 42); rect(g, '#4a7ac8', x, Y(p, 10, z), 1, 12); rect(g, lit('#4a7ac8'), x, Y(p, 10, z), 1, 2); rect(g, dark('#4a7ac8'), x, Y(p, 22, z), 1, 3); }
}
/** Bamboo screen running north-south down the middle of its three cells. */
function bambooScreen(p: Pen) {
    const { g } = p, h = 48, x = 12, w = 8;
    box(p, x, 0, w, p.D, h, '#b8b070', '#8a9a52');
    for (let d = 6; d < p.D; d += 12) rect(g, '#7a8a46', x, Y(p, d, h), w, 1);
    const y = Y(p, p.D, h);
    for (let k = 0; k < w; k += 3) { rect(g, k % 2 ? '#9aaa5e' : '#7a8a46', x + k, y, 2, h); for (let z = 8; z < h; z += 12) rect(g, '#5a6a36', x + k, y + z, 2, 1); }
}

// --- Streets and yards -------------------------------------------------------------------------------------------------

/** Abandoned saloon car, side on (east-west): body and windows on the south face, roof and bonnet from above. */
function car(p: Pen, seed: number) {
    const { g } = p, paint = pick(seed, 1, ['#5a6a7a', '#7a4a42', '#c8c4b8', '#4f5c4a']), sill = 6, belt = 20, roof = 32, d0 = 14, d1 = 52;
    // Wheels first (the body hides their tops), then the lower body with rounded ends: bonnet west, boot east.
    for (const x of [18, 74]) { disc(g, '#1a1c1e', x, Y(p, d1, 6), 7, 7); disc(g, '#4a4c4e', x, Y(p, d1, 6), 3, 3); }
    box(p, 6, d0, 84, d1 - d0, belt, lit(paint, .1), paint, sill);
    for (const [x, k] of [[6, 1], [89, -1]] as const) for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
        g.clearRect(x + k * j, Y(p, d0, belt) + i, 1, 1); g.clearRect(x + k * j, Y(p, d1, sill) - 1 - i, 1, 1);
    }
    // Cabin: glass all round (the south side windows are its front face), roof panel on top.
    box(p, 28, d0 + 3, 40, d1 - d0 - 6, roof, lit(paint, .16), '#33404a', belt, false, false);
    rect(g, '#46545c', 20, Y(p, d0 + 3, belt + 1), 8, d1 - d0 - 6); rect(g, '#46545c', 68, Y(p, d0 + 3, belt + 1), 6, d1 - d0 - 6);
    rect(g, lit('#46545c', .25), 21, Y(p, d0 + 5, belt + 1), 2, d1 - d0 - 12);
    const y = Y(p, d1 - 3, roof);
    rect(g, '#55646a', 30, y + 1, 17, roof - belt - 2); rect(g, '#55646a', 49, y + 1, 17, roof - belt - 2); rect(g, '#2a3034', 47, y, 2, roof - belt);
    if (hash(seed, 2, 67) < .5) shade(g, '#c8d4d4', 49, y + 1, 17, roof - belt - 2, .45); // shattered rear door glass
    const s = Y(p, d1, belt);
    rect(g, dark(paint, .25), 46, s + 2, 1, belt - sill - 3); rect(g, lit(paint, .2), 8, s, 80, 1);
    rect(g, '#d8d0b0', 7, s + 3, 3, 3); rect(g, '#a8483a', 86, s + 3, 3, 3); rect(g, '#2a2c2e', 7, s + belt - sill - 4, 82, 2);
    for (let k = 0; k < 7; k++) dot(g, '#7a5a3a', 10 + Math.floor(hash(seed, k, 71) * 76), s + 4 + Math.floor(hash(seed, k + 9, 71) * 9));
}
/** Concrete jersey barrier (low), with a faded red and white band. */
function barrier(p: Pen, seed: number) {
    const { g } = p, h = 20, c = '#9a978e';
    box(p, 0, 9, p.W, 14, h, lit(c, .08), c, 0, p.west, p.east);
    const y = Y(p, 23, h);
    for (let x = 0; x < p.W; x += 8) rect(g, (x / 8 + (seed & 1)) % 2 ? '#d8d0c0' : '#a8483a', x, y + 6, 8, 3);
    if (hash(seed, 1, 73) < .4) rect(g, dark(c, .3), 10, y + 1, 1, 5);
}
/** Commercial bin: green steel body, a lid propped half open, bags spilling. */
function dumpster(p: Pen, seed: number) {
    const { g } = p, h = 32, body = '#4a6650';
    box(p, 2, 6, 60, 22, h, dark(body, .2), body);
    rect(g, '#2a2e2a', 4, Y(p, 8, h), 56, 18);
    for (let k = 0; k < 4; k++) disc(g, pick(seed, k, ['#2e3236', '#3e4a44', '#5a5c5e']), 12 + k * 12, Y(p, 16, h + 2), 6, 4);
    rect(g, lit(body, .1), 2, Y(p, 2, h + 8), 60, 6);
    const y = Y(p, 28, h);
    for (const x of [8, 52]) disc(g, '#1a1c1e', x, Y(p, 28, 2), 3, 3);
    rect(g, dark(body, .3), 2, y + 8, 60, 1); for (let k = 0; k < 5; k++) dot(g, '#7a5a3a', 6 + Math.floor(hash(seed, k, 79) * 52), y + 4 + Math.floor(hash(seed, k + 7, 79) * 20));
}
/** Shipping container, 2.6 m: corrugated sides and roof, a faded stencil band. */
function container(p: Pen, seed: number) {
    const { g } = p, h = 62, c = pick(seed, 1, ['#8a4a3a', '#3e5a74', '#5a6a4a']);
    box(p, 0, 2, 128, 60, h, lit(c, .06), c);
    for (let x = 4; x < 128; x += 6) { rect(g, dark(c, .18), x, Y(p, 62, h) + 1, 2, h - 2); rect(g, lit(c, .08), x + 2, Y(p, 62, h) + 1, 1, h - 2); }
    for (let d = 6; d < 62; d += 6) rect(g, dark(c, .12), 1, Y(p, d, h), 126, 1);
    rect(g, lit(c, .35), 20, Y(p, 62, h) + 14, 60, 6); rect(g, c, 22, Y(p, 62, h) + 15, 56, 4);
    for (let k = 0; k < 10; k++) dot(g, '#6a4a32', 4 + Math.floor(hash(seed, k, 83) * 120), Y(p, 62, h) + 30 + Math.floor(hash(seed, k + 11, 83) * 30));
}

const RUNS: Partial<Record<FurnitureName, (p: Pen, look: string, seed: number) => void>> = {
    'shelf-wall': shelfWall, rack: (p, _, s) => rack(p, s), counter, 'glass-case': (p, _, s) => glassCase(p, s), 'kitchen-line': (p, _, s) => kitchenLine(p, s),
    'clothes-rail': (p, _, s) => clothesRail(p, s), switchgear: (p, _, s) => switchgear(p, s), lockers: (p, _, s) => lockers(p, s), stall: (p, _, s) => stall(p, s),
    sink: p => sink(p), barrier: (p, _, s) => barrier(p, s),
};
const SINGLES: Partial<Record<FurnitureName, (p: Pen, seed: number) => void>> = {
    'diner-table': dinerTable, desk, cabinet: p => cabinet(p, false), safe: p => cabinet(p, true), mannequin, 'fitting-room': fittingRoom, vending,
    checkout, 'ball-pool': ballPool, slide: p => slide(p), 'bamboo-screen': p => bambooScreen(p), car, dumpster, container, 'ac-unit': p => acUnit(p),
};
/** Furniture types this module paints (the dressing table sends them here as `procedural:furniture:<type>:<look>:<end>:<seed>`). */
export const PAINTED_TYPES = new Set<string>([...Object.keys(RUNS), ...Object.keys(SINGLES)]);
/**
 * One furniture piece (or one module of a run) on a canvas of its footprint plus `PAINTED_LIFT`, bottom row = the
 * footprint's south edge. `seed` varies stock and wear per placement; `end` closes run modules ('w', 'e', 'we', 'm').
 */
export function paintMallFurniture(type: FurnitureName, look = '', end = '', seed = 0): HTMLCanvasElement {
    const t = MALL_FURNITURE[type], W = t.w * 32, D = t.h * 32, L = PAINTED_LIFT[type] ?? 32, { c, g } = canvas(W, D + L);
    const p: Pen = { g, L, W, D, west: !('run' in t) || end.includes('w'), east: !('run' in t) || end.includes('e') };
    const run = RUNS[type], single = SINGLES[type];
    if (run) run(p, look, seed); else if (single) single(p, seed);
    return c;
}
