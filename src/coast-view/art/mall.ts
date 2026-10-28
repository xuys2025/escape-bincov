/**
 * Procedural pieces of the mall that read by exact geometry rather than texture: the stairs (tread / riser bands in the
 * 1:1 ground projection), gondola-top aisle signs and the ground clutter used until the drawn decals arrive. Light comes
 * from the top left; nothing here bakes lamps, night or cast shadows of other objects.
 */
import { canvas, dot, hash, line, rect, type Ctx } from './paint';

const RISE = 48;
export const mix = (a: string, b: string, t: number) => {
    const p = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return `#${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('')}`;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither shade over a rectangle: `level` 0..1 of pixels take the colour (keeps hard pixel edges). */
export function shade(g: Ctx, color: string, x: number, y: number, w: number, h: number, level: number) {
    g.fillStyle = color;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (BAYER[(((y + j) & 3) << 2) | ((x + i) & 3)] < level * 16) g.fillRect(x + i, y + j, 1, 1);
}

/**
 * Flight rising north over `rows` cells to one storey (48 px), `cols` cells wide. Canvas `cols*32 x (rows*32 + 48)`,
 * bottom row = ground line of the footprint's south edge. Eight steps: 12 px treads (lit) and 6 px risers (dark),
 * yellow anti-slip strip behind each nosing, balustrade walls on both sides, darker as the flight climbs under the floor
 * above. Steps keep their order on screen because a step further north is also higher.
 */
export function paintMallStairsUp(cols = 3, rows = 3): HTMLCanvasElement {
    const W = cols * 32, D = rows * 32, H = D + RISE, N = 8, d = D / N, r = RISE / N, side = 5;
    const { c, g } = canvas(W, H);
    const row = (yg: number, h: number) => RISE + yg - h;
    for (let i = N - 1; i >= 0; i--) {
        const t = i / (N - 1), top = Math.round(row(D - (i + 1) * d, (i + 1) * r)), riserTop = Math.round(row(D - i * d, (i + 1) * r));
        const tread = mix('#8d877b', '#4a4741', .55 * t), riser = mix('#4c4943', '#2a2926', .5 * t);
        rect(g, tread, side, top, W - side * 2, riserTop - top);
        for (let k = 0; k < 7; k++) { const x = side + 6 + Math.floor(hash(i, k, 31) * (W - side * 2 - 12)); dot(g, mix(tread, '#5f5b53', .6), x, top + 3 + (k % 4)); }
        shade(g, mix(tread, '#6d685e', .5), side + 10, top + 2, W - side * 2 - 20, 3, .35); // worn walking line
        rect(g, mix('#a8913a', '#5a5030', .5 * t), side, riserTop - 3, W - side * 2, 2);
        rect(g, mix('#c2bba7', '#6a665c', .5 * t), side, riserTop - 1, W - side * 2, 1);
        rect(g, riser, side, riserTop, W - side * 2, Math.round(r));
        rect(g, mix(riser, '#1d1c1a', .5), side, riserTop + Math.round(r) - 1, W - side * 2, 1);
    }
    // The west balustrade shades the steps beside it (light from the top left).
    shade(g, '#24221f', side, 0, 3, H - 16, .55);
    // Balustrade walls: their tops rise with the flight, which in this projection is a straight strip; the south ends
    // stand 16 px high as small faces at the foot of the flight.
    for (const x0 of [0, W - side]) {
        rect(g, '#77726a', x0, 0, side, H - 16); rect(g, '#99927f', x0, 0, 1, H - 16); rect(g, '#3a3833', x0 + side - 1, 0, 1, H - 16);
        rect(g, '#5f5b53', x0, H - 16, side, 16); rect(g, '#8a8476', x0, H - 16, side, 1); rect(g, '#46433d', x0, H - 2, side, 2);
        rect(g, '#b2ac9b', x0 + 2, 0, 1, H - 17);
        for (let y = 6; y < H - 18; y += 18) rect(g, '#5d5a52', x0 + 1, y, 3, 2);
    }
    // Climbing into the floor above: the top steps fade toward the dark under the upper slab.
    const img = g.getImageData(side, 0, W - side * 2, 34), px = img.data;
    for (let y = 0; y < 34; y++) {
        const k = .82 * (1 - y / 34) ** 1.4;
        for (let x = 0; x < W - side * 2; x++) { const i = (y * (W - side * 2) + x) * 4; if (px[i + 3]) for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round(px[i + ch] * (1 - k) + 20 * k); }
    }
    g.putImageData(img, side, 0);
    rect(g, '#2a2825', side, 0, W - side * 2, 3); rect(g, '#5d5951', side, 3, W - side * 2, 1);
    return c;
}

/**
 * Stairwell opening on the upper floor: the flight goes down northward from the open south edge (the landing).
 * Canvas `cols*32 x (rows*32 + 16)`: rails 16 px high on the north, east and west edges; each lower tread shows a
 * 6 px band below the nearer one; the far wall of the well drops to the floor below.
 */
export function paintMallStairsDown(cols = 3, rows = 3): HTMLCanvasElement {
    const W = cols * 32, D = rows * 32, RAIL = 16, H = D + RAIL, N = 8, d = D / N, r = RISE / N, side = 4;
    const { c, g } = canvas(W, H);
    const row = (yg: number, h: number) => RAIL + yg - h;
    // Far (north) wall of the well, seen from the south, from the upper floor level down to the lowest step.
    const wallTop = row(0, 0), wallBottom = Math.round(row(0, -RISE));
    for (let y = wallTop; y < wallBottom; y++) rect(g, mix('#4d4a44', '#1e1d1b', (y - wallTop) / (wallBottom - wallTop)), side, y, W - side * 2, 1);
    for (let k = 0; k < 5; k++) rect(g, '#3c3a35', side + 8 + k * 18, wallTop + 4, 1, wallBottom - wallTop - 8);
    // Treads from the deepest (north) to the nearest so nearer, higher steps cover the ones behind them.
    for (let i = N - 1; i >= 0; i--) {
        const t = i / (N - 1), top = Math.round(row(D - (i + 1) * d, -(i + 1) * r)), bottom = Math.round(row(D - i * d, -(i + 1) * r));
        const tread = mix('#77726a', '#2c2b28', .2 + .6 * t);
        rect(g, tread, side, top, W - side * 2, bottom - top);
        rect(g, mix('#a8913a', '#3c3626', .3 + .5 * t), side, top, W - side * 2, 1);
        rect(g, mix(tread, '#151413', .5), side, top - 1, W - side * 2, 1);
    }
    // Slab lip at the open south edge (the landing), with its anti-slip strip.
    rect(g, '#99927f', side, H - 3, W - side * 2, 1); rect(g, '#a8913a', side, H - 2, W - side * 2, 2);
    // Guard rails: north rail across the top, side rails along the edges (straight strips in this projection).
    const post = (x: number, y: number) => { rect(g, '#5a5750', x, y, 2, RAIL); rect(g, '#8e897c', x, y, 2, 1); };
    for (let x = side; x < W - side; x += 12) post(x, 0);
    rect(g, '#aaa597', side, 0, W - side * 2, 2); rect(g, '#5a5750', side, 6, W - side * 2, 1);
    for (const x0 of [0, W - side]) {
        rect(g, '#6f6b62', x0, 0, side, H); rect(g, '#aaa597', x0 + 1, 0, 2, H - RAIL); rect(g, '#3d3b36', x0 + (x0 ? 0 : side - 1), 0, 1, H);
        for (let y = 4; y < H - RAIL; y += 14) rect(g, '#5a5750', x0 + 1, y, 2, 3);
    }
    shade(g, '#1a1918', side, wallTop, 3, wallBottom - wallTop, .5);
    return c;
}

/** Aisle board standing on a gondola top (blank; the engine writes the text). Anchor: bottom centre of the post. */
/** Height of the cafe set's canvas above its 2x1 footprint (chair backs rise 27 px). */
export const CAFE_LIFT = 26;
/**
 * Terrace cafe set, centred on its one blocking cell, at the scale of the 48 px player and the 64 px umbrella: a round bistro table
 * (22 px top at 21 px height, pedestal and base) between two chairs facing it (12 px seats at 13 px, backs leaning
 * outward). Weathered green-grey metal like the drawn samples; light from the top left. Canvas 64 x (32 + CAFE_LIFT),
 * bottom row = the footprint's south edge.
 */
export function paintCafeSet(): HTMLCanvasElement {
    const W = 64, L = CAFE_LIFT, { c, g } = canvas(W, 32 + L);
    const frame = '#6b7369', frameLit = '#8b9488', frameDark = '#4a5048', seat = '#7d867a', seatDark = '#5c6359';
    // Ground point (x, depth d within the footprint, height h) to canvas.
    const at = (x: number, d: number, h: number) => [Math.round(x), Math.round(L + d - h)] as const;
    const disc = (cx: number, cy: number, r: number, color: string) => {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * .6) dot(g, color, cx + x, cy + y);
    };
    const chair = (side: -1 | 1) => {
        // Chairs tucked in close to the table (the set spans x 5..59 of the canvas, centred on its one blocking cell).
        const x0 = side < 0 ? 8 : 45, x1 = x0 + 11, outer = side < 0 ? x0 : x1, d0 = 10, d1 = 21, sh = 13, back = 27;
        // Backrest on the outer side, leaning outward: three rails over two uprights, drawn back to front.
        for (let d = d0; d <= d1; d++) for (let h = sh; h <= back; h++) {
            const lean = Math.round((h - sh) / (back - sh) * 3) * side, [px, py] = at(outer + lean, d, h);
            const rail = h === back || h === back - 5 || h === back - 10, upright = d === d0 || d === d1;
            if (rail || upright) dot(g, rail && h === back ? frameLit : d === d1 ? frame : frameDark, px, py);
        }
        // Back legs show only below the seat's north edge; front legs run from the seat to the ground.
        for (const x of [x0 + 1, x1 - 1]) { const [px, top] = at(x, d1, sh), [, bottom] = at(x, d1, 0); rect(g, frame, px, top + 2, 1, bottom - top - 1); dot(g, frameDark, px, bottom); }
        for (const x of [x0 + 1, x1 - 1]) { const [px, top] = at(x, d0, sh), [, bottom] = at(x, d0, 0); rect(g, frameDark, px, top + 2, 1, bottom - top - 1); }
        // Seat: lattice top and a two-pixel front edge.
        const [sx, sy] = at(x0, d0, sh), [, ey] = at(x0, d1, sh);
        rect(g, seat, sx, sy, x1 - x0 + 1, ey - sy + 1);
        for (let y = sy + 1; y < ey; y += 3) rect(g, seatDark, sx + 1, y, x1 - x0 - 1, 1);
        rect(g, frameLit, sx, sy, x1 - x0 + 1, 1); rect(g, frameDark, sx, ey + 1, x1 - x0 + 1, 2);
    };
    chair(-1); chair(1);
    // Table: flat base on the ground, pedestal, then the top with its rim and the umbrella's hole.
    const [bx, by] = at(32, 16, 0), [tx, ty] = at(32, 16, 21);
    disc(bx, by, 5, '#3e423b'); disc(bx - 1, by - 1, 3, '#4f544b');
    rect(g, frameDark, bx - 1, ty, 3, by - ty); rect(g, frame, bx - 1, ty, 1, by - ty);
    disc(tx, ty + 2, 11, '#5f5b4e'); disc(tx, ty, 11, '#8c8771'); disc(tx - 2, ty - 2, 7, '#9b9580'); disc(tx - 3, ty - 3, 4, '#a39d84');
    for (let a = 0; a < 12; a++) { const x = Math.round(tx + Math.cos(a / 12 * Math.PI * 2) * 7), y = Math.round(ty + Math.sin(a / 12 * Math.PI * 2) * 7); dot(g, '#7a7564', x, y); }
    rect(g, '#2a2925', tx - 1, ty - 1, 2, 2);
    return c;
}

export function paintAisleSign(color = '#5f8456', glyph = ''): HTMLCanvasElement {
    const { c, g } = canvas(26, 24);
    rect(g, '#2a2926', 0, 0, 26, 15); rect(g, color, 1, 1, 24, 13); rect(g, mix(color, '#cfc6ad', .5), 2, 3, 22, 8);
    rect(g, mix(color, '#ffffff', .25), 1, 1, 24, 1); rect(g, mix(color, '#000000', .35), 1, 13, 24, 1);
    rect(g, '#5d5951', 12, 15, 2, 9); rect(g, '#8a8476', 12, 15, 1, 9);
    // The board's mark in the dark ink of a printed sign: an aisle number, or a pictogram for a department.
    const ink = mix(color, '#141412', .7), rows = GLYPHS[glyph] ?? (/^\d+$/.test(glyph) ? number(glyph) : null);
    if (rows) {
        const x0 = 13 - Math.ceil(rows[0].length / 2);
        rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') dot(g, ink, x0 + i, 4 + j); }));
    }
    return c;
}
/** 3x5 digits; two-digit aisle numbers keep one column between them. */
const DIGITS = ['###,#.#,#.#,#.#,###', '.#.,##.,.#.,.#.,###', '##.,..#,.#.,#..,###', '##.,..#,.#.,..#,##.', '#.#,#.#,###,..#,..#',
    '###,#..,##.,..#,##.', '.##,#..,###,#.#,###', '###,..#,.#.,.#.,.#.', '###,#.#,###,#.#,###', '###,#.#,###,..#,##.'].map(d => d.split(','));
const number = (n: string) => DIGITS[0].map((_, j) => [...n].map(d => DIGITS[+d][j]).join('.'));
/** 5 px pictograms: fresh (a fish), cold (a snowflake), home (a sofa). */
const GLYPHS: Record<string, string[]> = {
    fresh: ['.....', '.##.#', '####.', '.##.#', '.....'],
    cold: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'],
    home: ['#...#', '#####', '#####', '#...#', '.....'],
};

export type MallDecal = 'litter' | 'glass' | 'cardboard' | 'water' | 'mud' | 'tracks' | 'cans';
export const DECAL_SIZE: Record<MallDecal, readonly [number, number]> = {
    litter: [32, 32], glass: [32, 32], cardboard: [64, 32], water: [64, 32], mud: [32, 32], tracks: [64, 32], cans: [32, 32],
};
/**
 * Ground clutter painted flat on the floor (V class: never blocks, never reads as an object to pick up). Water stains
 * are translucent darkening so the floor material shows through; the rest are opaque pixel clusters.
 */
export function paintMallDecal(kind: MallDecal, seed: number): HTMLCanvasElement {
    const [W, H] = DECAL_SIZE[kind], { c, g } = canvas(W, H), h = (k: number) => hash(seed, k, 71);
    if (kind === 'litter') {
        for (let k = 0; k < 9; k++) {
            const x = 2 + Math.floor(h(k) * (W - 8)), y = 2 + Math.floor(h(k + 20) * (H - 6)), w = 2 + Math.floor(h(k + 40) * 4), hh = 1 + Math.floor(h(k + 60) * 3);
            rect(g, ['#c9c0ac', '#b5ad98', '#d6d0bf', '#9fa7a3'][k % 4], x, y, w, hh); rect(g, '#6f6a5e', x, y + hh, w, 1);
        }
        for (let k = 0; k < 2; k++) { const x = 4 + Math.floor(h(k + 80) * (W - 14)), y = 4 + Math.floor(h(k + 90) * (H - 12)); rect(g, '#aeb7b4', x, y, 6, 4); rect(g, '#d8dedb', x + 1, y, 3, 1); rect(g, '#79817e', x, y + 4, 6, 1); }
    } else if (kind === 'glass') {
        for (let k = 0; k < 14; k++) {
            const x = 2 + Math.floor(h(k) * (W - 6)), y = 2 + Math.floor(h(k + 30) * (H - 6)), l = 1 + Math.floor(h(k + 50) * 3);
            line(g, '#b8cdd0', x, y, x + l, y + (k % 2 ? l : -1)); if (k % 3 === 0) dot(g, '#eef6f4', x, y); dot(g, '#4d5f61', x + 1, y + 1);
        }
    } else if (kind === 'cardboard') {
        const x = 6 + Math.floor(h(1) * 10), y = 5 + Math.floor(h(2) * 6), w = 38, hh = 18;
        rect(g, '#5f4a33', x + 1, y + 1, w, hh); rect(g, '#8a6f4d', x, y, w, hh); rect(g, '#9c805b', x, y, w, 2);
        line(g, '#6f5638', x + 12, y, x + 12, y + hh - 1); line(g, '#6f5638', x + 26, y, x + 26, y + hh - 1);
        rect(g, '#b8a77a', x + 4, y + 7, w - 8, 2); dot(g, '#4a3a28', x + 30, y + 12); dot(g, '#4a3a28', x + 8, y + 4);
    } else if (kind === 'water') {
        // Union of a few ellipses as one mask, so overlaps do not stack; inner pixels darker than the rim.
        const blobs = 3 + Math.floor(h(3) * 3), mask = new Uint8Array(W * H);
        for (let k = 0; k < blobs; k++) {
            const cx = 12 + h(k) * (W - 24), cy = 9 + h(k + 10) * (H - 18), rx = 5 + h(k + 20) * 9, ry = 3 + h(k + 30) * 4;
            for (let y = -Math.ceil(ry); y <= ry; y++) for (let x = -Math.ceil(rx); x <= rx; x++) {
                const q = (x * x) / (rx * rx) + (y * y) / (ry * ry), px = Math.round(cx + x), py = Math.round(cy + y);
                if (q <= 1 && px >= 0 && py >= 0 && px < W && py < H) mask[py * W + px] = Math.max(mask[py * W + px], q > .7 ? 1 : 2);
            }
        }
        for (let i = 0; i < mask.length; i++) if (mask[i]) dot(g, mask[i] === 2 ? 'rgba(18,22,20,.24)' : 'rgba(18,20,18,.13)', i % W, Math.floor(i / W));
        for (let k = 0; k < 4; k++) { const x = 8 + Math.floor(h(k + 50) * (W - 20)), y = 6 + Math.floor(h(k + 60) * (H - 12)); rect(g, 'rgba(150,170,168,.35)', x, y, 4 + (k % 3), 1); }
        for (let x = 4; x < W - 4; x++) if (h(x + 100) < .55) dot(g, '#6b5d48', x, H - 5 - Math.floor(h(x + 140) * 2)); // dried mud line
    } else if (kind === 'mud') {
        for (let k = 0; k < 4; k++) {
            const x = 4 + k * 7 + (k % 2) * 3, y = H - 8 - k * 6;
            rect(g, '#4a3f33', x, y, 3, 4); rect(g, '#5c4f3f', x, y, 3, 1); dot(g, '#4a3f33', x + 1, y + 5);
        }
    } else if (kind === 'tracks') {
        for (let x = 2; x < W - 2; x++) if (h(x) < .7) { dot(g, '#4f4b44', x, 12 + Math.round(Math.sin(x / 9 + seed) * 2)); dot(g, '#4f4b44', x, 19 + Math.round(Math.sin(x / 9 + seed) * 2)); }
    } else {
        for (let k = 0; k < 5; k++) {
            const x = 3 + Math.floor(h(k) * (W - 10)), y = 3 + Math.floor(h(k + 15) * (H - 10)), col = ['#7b6a4f', '#6c7a74', '#8a6a52', '#7a7468'][k % 4];
            rect(g, col, x, y, 4, 3); rect(g, mix(col, '#d0c8b4', .4), x, y, 4, 1); rect(g, '#3b3832', x, y + 3, 4, 1);
        }
        for (let k = 0; k < 18; k++) dot(g, '#c9c0ac', 4 + Math.floor(h(k + 40) * (W - 8)), 4 + Math.floor(h(k + 60) * (H - 8)));
    }
    return c;
}
