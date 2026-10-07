/**
 * Hand passes on the shared 640x360 grid (global coordinates). They replace generated
 * pseudo-detail with readable objects that belong to this game: a tide chart and a
 * lockdown calendar instead of an illegible portrait and note. (The radio and rifle are
 * Codex redraws pasted into the desk source; see generate.ts.)
 * Colours are named here and snapped to the shared palette.
 */
import { painter, type Cells, type Palette } from './pixel-grid';

export const RESERVED = ['#a8473c', '#6e2e28', '#4f7a76'];
const shade = '#3a2a22', paperD = '#7a6a4c', paperM = '#9c8a64', paperL = '#b9a57a', paperH = '#d2bf8e';
const red = RESERVED[0], redD = RESERVED[1], teal = RESERVED[2], brass = '#8a6a36', glowH = '#f6dc98';

/** Pillar between the door and window (room layer). */
export function touchRoom(c: Cells, pal: Palette) {
    const { px, rect, line } = painter(c, pal);
    // Tide chart: grid, curve over a little more than two cycles and a "now" mark.
    rect(shade, 359, 98, 25, 37);
    rect(paperM, 357, 96, 24, 36); rect(paperL, 366, 96, 15, 36); rect(paperH, 357, 96, 24, 1);
    for (let x = 360; x < 380; x += 4) rect(paperD, x, 99, 1, 28);
    for (let y = 101; y < 128; y += 5) rect(paperD, 359, y, 21, 1);
    let prev = 0;
    for (let x = 359; x < 380; x++) {
        const y = Math.round(113 - Math.sin((x - 359) / 21 * Math.PI * 2.1 + .4) * 8);
        if (x > 359) line(red, x - 1, prev, x, y);
        prev = y;
    }
    rect(teal, 371, 98, 1, 30);
    rect(brass, 368, 94, 2, 2); px(glowH, 368, 94);
    rect(paperD, 359, 129, 9, 1); rect(paperD, 370, 129, 7, 1);
    // Lockdown calendar: days already passed are crossed out, today is boxed.
    // Seven 3-pixel day cells with 1-pixel gaps plus a 1-pixel margin each side: 29 wide.
    const calX = 354, calW = 1 + 7 * 4 - 1 + 1;
    rect(shade, calX + 2, 139, calW, 31);
    rect(paperM, calX, 137, calW, 31); rect(paperL, calX + 11, 137, calW - 11, 31); rect(paperH, calX, 137, calW, 1);
    rect(red, calX, 138, calW, 4); rect(redD, calX, 141, calW, 1);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
        const x = calX + 1 + col * 4, y = 144 + row * 5, day = row * 7 + col;
        rect(paperD, x, y, 3, 1);
        if (day < 17) { px(red, x, y + 1); px(red, x + 2, y + 1); px(red, x + 1, y + 2); px(red, x, y + 3); px(red, x + 2, y + 3); }
        else if (day === 17) { rect(teal, x - 1, y, 5, 1); rect(teal, x - 1, y + 4, 5, 1); rect(teal, x - 1, y, 1, 4); rect(teal, x + 3, y, 1, 4); }
    }
}

