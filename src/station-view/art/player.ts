import { canvas, line, rect, type Ctx } from '../paint';

type Facing = 'e' | 'se' | 's' | 'ne' | 'n';
type Elbow = readonly [x: number, y: number];
// Sleeve ends of the shared revision-2 coast-player-body-*-v1 samples; recheck them when that art changes.
// Side/back-quarter views hide the far arm behind the torso/pack.
const ELBOWS: Record<Facing, readonly (readonly Elbow[])[]> = {
  e:  [[[22,27]], [[21,27]], [[20,27]], [[19,27]], [[20,27]]],
  se: [[[10,26],[24,25]], [[10,26],[23,25]], [[10,28],[23,26]], [[10,26],[24,26]], [[10,27],[25,25]]],
  s:  [[[8,26],[25,26]], [[9,26],[26,26]], [[9,25],[25,26]], [[8,26],[26,26]], [[9,26],[24,26]]],
  ne: [[[25,27]], [[25,27]], [[24,27]], [[25,27]], [[24,27]]],
  n:  [[[8,26],[25,26]], [[9,26],[26,26]], [[8,26],[25,26]], [[10,26],[25,26]], [[8,26],[25,26]]],
};

function forearm(g: Ctx, [x, y]: Elbow, side: number, sway: number) {
  const hx = x + side + sway, hy = y + 5;
  // Integer pixel strips preserve the delivered jacket palette and one-pixel outline at the normal yard zoom.
  for (let dx = -2; dx <= 1; dx++) line(g, '#242321', x + dx, y, hx + dx, hy);
  line(g, '#59604a', x - 1, y, hx - 1, hy); line(g, '#4b4842', x, y, hx, hy);
  rect(g, '#242321', hx - 2, hy, 4, 4);
  rect(g, '#75634e', hx - 1, hy, 2, 3); rect(g, '#c3a26a', hx - 1, hy, 2, 1);
  rect(g, '#393733', hx, hy + 2, 1, 1);
}

/**
 * Complete only the yard's empty-handed player. Combat sources intentionally omit forearms/hands; never mutate them.
 * Bake into the existing 32x48 cached body so feet, light, rims and emission silhouettes all use the same pixels.
 * Mirror the completed pose once, including the hands; f0 is idle and f1-f4 follow the delivered walking frames.
 */
export function paintStationPlayer(src: HTMLCanvasElement, dir: string, frame: number, mirror: boolean): HTMLCanvasElement {
  const { c, g } = canvas(src.width, src.height);
  if (mirror) { g.translate(src.width, 0); g.scale(-1, 1); }
  g.drawImage(src, 0, 0);
  const elbows = ELBOWS[dir as Facing]?.[frame];
  if (!elbows) return c;
  const sway = frame ? [0, -1, 0, 1][frame - 1] : 0;
  for (const [i, elbow] of elbows.entries()) {
    const side = elbows.length === 1 ? 1 : i === 0 ? -1 : 1;
    forearm(g, elbow, side, sway * side);
  }
  return c;
}
