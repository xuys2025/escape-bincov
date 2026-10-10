import { H, PROPS, T, W, tileBlocked, type PropDef } from './layout';

export interface Rect { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number };
/** Feet box of a walker around its foot point. */
export const FOOT = { hw: 6, up: 5, down: 2 };
/** Planned routes keep this many px of air around obstacles, so following them never scrapes a corner (F03). */
const CLEARANCE = 3;
/** Walking into the edge of an obstacle slides the walker sideways by up to this many px (corner correction). */
const NUDGE = 10;

/** Collision world: tiles (walls, water, void) plus the footprints of standing props. Rebuilt when props change. */
export class Collision {
  rects: Rect[] = [];
  gateOpen = false;
  private grids: [Uint8Array | null, Uint8Array | null] = [null, null];
  private gw = W * 2; private gh = H * 2;

  rebuild(visible: (p: PropDef) => boolean, gateOpen: boolean) {
    this.gateOpen = gateOpen;
    this.rects = PROPS.filter(p => p.blocks !== false && visible(p)).map(p => {
      if (p.box) return { x: p.tx * T + p.box.x, y: p.ty * T + p.box.y, w: p.box.w, h: p.box.h };
      const i = p.inset ?? 0;
      return { x: p.tx * T + i, y: p.ty * T + Math.max(0, i - 2), w: p.tw * T - i * 2, h: p.th * T - Math.max(0, i - 2) - Math.min(i, 2) };
    });
    this.grids = [null, null];
  }
  /** Feet box at (x, y), grown by `pad` px on every side, overlaps a wall, water or a standing prop. */
  blocked(x: number, y: number, pad = 0): boolean {
    const x0 = x - FOOT.hw - pad, x1 = x + FOOT.hw + pad, y0 = y - FOOT.up - pad, y1 = y + FOOT.down + pad;
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [x, y0], [x, y1], [x0, y], [x1, y]]) if (tileBlocked(Math.floor(px / T), Math.floor(py / T), this.gateOpen)) return true;
    for (const r of this.rects) if (x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h) return true;
    return false;
  }
  /**
   * Move with axis separation so the walker slides along walls. When a straight push (one axis only) is blocked by
   * the edge of something, a sideways step of up to NUDGE px that frees the way is taken, so a lamp post or a wall
   * corner is walked around instead of stopping dead.
   */
  slide(p: Pt, dx: number, dy: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    const sx = dx / steps, sy = dy / steps, step = Math.hypot(sx, sy);
    for (let i = 0; i < steps; i++) {
      const mx = !!sx && !this.blocked(p.x + sx, p.y);
      if (mx) p.x += sx;
      const my = !!sy && !this.blocked(p.x, p.y + sy);
      if (my) p.y += sy;
      if (sy && !my && Math.abs(sx) < Math.abs(sy) * .3) this.nudge(p, 'x', sy, step);
      else if (sx && !mx && Math.abs(sy) < Math.abs(sx) * .3) this.nudge(p, 'y', sx, step);
    }
  }
  private nudge(p: Pt, axis: 'x' | 'y', push: number, step: number) {
    for (let o = 1; o <= NUDGE; o++) for (const s of [-1, 1]) {
      const nx = axis === 'x' ? p.x + s * o : p.x + push, ny = axis === 'x' ? p.y + push : p.y + s * o;
      const side = axis === 'x' ? { x: p.x + s * Math.min(o, step), y: p.y } : { x: p.x, y: p.y + s * Math.min(o, step) };
      if (!this.blocked(nx, ny) && !this.blocked(side.x, side.y)) { p.x = side.x; p.y = side.y; return; }
    }
  }
  private nav(pad: number): Uint8Array {
    const k = pad ? 1 : 0, cached = this.grids[k];
    if (cached) return cached;
    const g = new Uint8Array(this.gw * this.gh);
    for (let y = 0; y < this.gh; y++) for (let x = 0; x < this.gw; x++) g[y * this.gw + x] = this.blocked(x * 16 + 8, y * 16 + 8, pad) ? 1 : 0;
    return this.grids[k] = g;
  }
  line(a: Pt, b: Pt, pad = 0): boolean {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
    for (let i = 1; i <= n; i++) if (this.blocked(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, pad)) return false;
    return true;
  }
  /**
   * Route from `from` to `to`. Returns null when there is no way, and an empty list when the walker already stands
   * at the goal (same 16 px cell, or the nearest open spot to a blocked goal is where it stands). A route keeps
   * CLEARANCE px away from obstacles when it can; tight spots fall back to an exact route.
   */
  path(from: Pt, to: Pt): Pt[] | null {
    // The destination is decided on the exact grid: a click on something solid goes to the nearest spot where the
    // walker can actually stand. Clearance only shapes the route there, never moves the destination.
    const g = this.nav(0), gw = this.gw, gh = this.gh;
    const [gx, gy] = this.cell(to);
    if (g[gy * gw + gx] || this.blocked(to.x, to.y)) {
      let best = -1, bd = 1e9;
      for (let y = Math.max(0, gy - 4); y <= Math.min(gh - 1, gy + 4); y++) for (let x = Math.max(0, gx - 4); x <= Math.min(gw - 1, gx + 4); x++) {
        const d = (x * 16 + 8 - to.x) ** 2 + (y * 16 + 8 - to.y) ** 2; if (!g[y * gw + x] && d < bd) { bd = d; best = y * gw + x; }
      }
      if (best < 0) return null;
      to = { x: (best % gw) * 16 + 8, y: Math.floor(best / gw) * 16 + 8 };
    }
    return this.route(from, to, CLEARANCE) ?? this.route(from, to, 0);
  }
  private cell(p: Pt) { return [Math.max(0, Math.min(this.gw - 1, Math.floor(p.x / 16))), Math.max(0, Math.min(this.gh - 1, Math.floor(p.y / 16)))]; }
  private route(from: Pt, to: Pt, pad: number): Pt[] | null {
    const g = this.nav(pad), gw = this.gw, gh = this.gh;
    const [gx, gy] = this.cell(to), [sx, sy] = this.cell(from), start = sy * gw + sx, goal = gy * gw + gx;
    if (start === goal) return [];
    const cost = new Float32Array(gw * gh).fill(Infinity), prev = new Int32Array(gw * gh).fill(-1), open: number[] = [start];
    const inOpen = new Uint8Array(gw * gh); inOpen[start] = 1;
    cost[start] = 0;
    const h = (i: number) => Math.hypot(i % gw - gx, Math.floor(i / gw) - gy);
    let guard = 0;
    while (open.length && guard++ < 8000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (cost[open[i]] + h(open[i]) < cost[open[bi]] + h(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0]; inOpen[cur] = 0;
      if (cur === goal) break;
      const cx = cur % gw, cy = Math.floor(cur / gw);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx; if (g[ni] && ni !== goal) continue;
        if (dx && dy && (g[cy * gw + nx] || g[ny * gw + cx])) continue;
        const c = cost[cur] + (dx && dy ? 1.414 : 1);
        if (c < cost[ni]) { cost[ni] = c; prev[ni] = cur; if (!inOpen[ni]) { inOpen[ni] = 1; open.push(ni); } }
      }
    }
    if (prev[goal] < 0) return null;
    const pts: Pt[] = [];
    for (let i = goal; i >= 0 && i !== start; i = prev[i]) pts.unshift({ x: (i % gw) * 16 + 8, y: Math.floor(i / gw) * 16 + 8 });
    pts[pts.length - 1] = to;
    // String-pull: drop waypoints that a straight walk can skip, checked with the same clearance as the grid.
    const out: Pt[] = []; let anchor = from;
    for (let i = 0; i < pts.length; i++) {
      const next = pts[i + 1];
      if (!next || !this.line(anchor, next, pad)) { out.push(pts[i]); anchor = pts[i]; }
    }
    return out;
  }
}
