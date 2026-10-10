/**
 * Tidal water over the mud flats. The cells come only from the Runtime's frame.flooded (R6-L4): row-major indices of
 * tide cells submerged right now, empty at low tide. Nothing is inferred from terrain codes, so the water shows exactly
 * where bodies are blocked and nowhere else; the permanent sea stays in the baked ground.
 *
 * Each flooded cell gets a body tile (silty, greener and lighter than the deep sea, so flats, sea and dry road read as
 * three surfaces) and, on sides that meet dry ground, a foam edge drawn inside the cell. The layer fades in or out when
 * the tide turns (instant with reduced motion, and on the first frame after a map is entered or loaded); the foam
 * breathes slowly in view time only. Display only: nothing here reaches the Runtime or a save.
 */
import { Container, Sprite } from 'pixi.js';
import type { MapDef } from '../raid-runtime/contract';
import { canvas, hash, rect } from './art/paint';
import type { Textures } from './textures';

const C = { body: '#46564f', silt: '#4d5a4f', deep: '#3f4d48', ripple: '#6d7d75', foam: '#a9b0a0', foamDim: '#879086' };
const BODY_VARIANTS = 4;

function paintBody(v: number) {
  const { c, g } = canvas(32, 32), h = (i: number) => hash(v, i, 73);
  rect(g, C.body, 0, 0, 32, 32);
  for (let i = 0; i < 3; i++) rect(g, C.silt, Math.floor(h(i) * 20), Math.floor(h(i + 3) * 26), 8 + Math.floor(h(i + 6) * 8), 3 + Math.floor(h(i + 9) * 3));
  for (let i = 0; i < 2; i++) rect(g, C.deep, Math.floor(h(i + 12) * 22), Math.floor(h(i + 14) * 28), 6 + Math.floor(h(i + 16) * 6), 2);
  for (let i = 0; i < 3; i++) rect(g, C.ripple, Math.floor(h(i + 20) * 20), 5 + i * 10 + Math.floor(h(i + 23) * 4), 5 + Math.floor(h(i + 26) * 6), 1);
  return c;
}
/** Foam along the open sides (bit 1 N, 2 E, 4 S, 8 W): a broken two-pixel band just inside the cell edge. */
function paintFoam(mask: number) {
  const { c, g } = canvas(32, 32);
  const band = (horizontal: boolean, at: number, inward: number, seed: number) => {
    for (let i = 0; i < 32; i += 4) {
      const k = hash(seed, i, 79), len = 2 + Math.floor(k * 3);
      const [x, y, w, hh] = horizontal ? [i, at, len, 1] : [at, i, 1, len];
      rect(g, C.foam, x, y, w, hh);
      if (k > .35) rect(g, C.foamDim, horizontal ? x + 1 : x + inward, horizontal ? y + inward : y + 1, horizontal ? len : 1, horizontal ? 1 : len);
    }
  };
  if (mask & 1) band(true, 0, 1, 1);
  if (mask & 2) band(false, 31, -1, 2);
  if (mask & 4) band(true, 31, -1, 3);
  if (mask & 8) band(false, 0, 1, 4);
  return c;
}

export class Tide {
  readonly layer = new Container();
  private body = new Container();
  private foam = new Container();
  private map: MapDef | null = null;
  private source: readonly number[] | null = null;
  private cells = new Set<number>();
  private level = 0;
  private target = 0;
  private fresh = true;

  constructor(private readonly tex: Textures, private readonly reducedMotion: boolean) {
    this.layer.addChild(this.body, this.foam);
    this.layer.visible = false;
  }

  /** A new map or epoch: drop the old cells; the next sync shows the current tide without a fade. */
  setMap(m: MapDef) {
    this.map = m; this.source = null; this.cells.clear(); this.clear();
    this.level = this.target = 0; this.fresh = true; this.layer.visible = false;
  }

  /** Once per presented frame with the frame's flooded cells. `time` is view time (deterministic for probes). */
  sync(flooded: readonly number[], dt: number, time: number) {
    if (flooded !== this.source) {
      this.source = flooded;
      // The Runtime keeps one frozen array per map while the tide is high, so a new reference means a real change.
      if (flooded.length) this.build(flooded);
      this.target = flooded.length ? 1 : 0;
    }
    if (this.fresh || this.reducedMotion) this.level = this.target;
    else this.level = this.target > this.level ? Math.min(this.target, this.level + dt / .9) : Math.max(this.target, this.level - dt / 1.4);
    this.fresh = false;
    if (this.level <= 0 && this.target === 0 && this.cells.size) { this.cells.clear(); this.clear(); }
    this.layer.visible = this.level > 0;
    this.body.alpha = this.level;
    this.foam.alpha = this.level * (this.reducedMotion ? .85 : .72 + .16 * Math.sin(time * 1.3));
  }

  /** Submerged and drawn at least half in: drizzle rings and glints use this, like open water. */
  wet(x: number, y: number) {
    const m = this.map; if (!m || this.level < .5) return false;
    return this.cells.has(Math.floor(y / 32) * m.cols + Math.floor(x / 32));
  }
  /** Cells currently drawn (read by checks). */
  get shown() { return this.layer.visible ? [...this.cells] : []; }
  get alpha() { return this.layer.visible ? this.level : 0; }

  private build(flooded: readonly number[]) {
    const m = this.map; if (!m) return;
    this.clear(); this.cells = new Set(flooded);
    const cols = m.cols, sea = (x: number, y: number) => m.terrain[y]?.[x] === 2;
    // A side is open (gets foam) where the neighbour is neither flooded nor permanent sea.
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < m.rows && !this.cells.has(y * cols + x) && !sea(x, y);
    for (const i of this.cells) {
      const x = i % cols, y = Math.floor(i / cols);
      const v = Math.floor(hash(x, y, 71) * BODY_VARIANTS);
      const b = new Sprite(this.tex.ensure(`tide:body:${v}`, () => paintBody(v))); b.position.set(x * 32, y * 32); this.body.addChild(b);
      const mask = (open(x, y - 1) ? 1 : 0) | (open(x + 1, y) ? 2 : 0) | (open(x, y + 1) ? 4 : 0) | (open(x - 1, y) ? 8 : 0);
      if (mask) { const f = new Sprite(this.tex.ensure(`tide:foam:${mask}`, () => paintFoam(mask))); f.position.set(x * 32, y * 32); this.foam.addChild(f); }
    }
  }
  private clear() { for (const layer of [this.body, this.foam]) for (const c of layer.removeChildren()) c.destroy(); }
}

/**
 * A wading band at an actor's feet: water over the boots with a bright broken foam rim where it meets the shins, and a
 * wider ripple below, drawn in front of the legs.
 */
export function paintWade() {
  const { c, g } = canvas(32, 11);
  const row = (y: number, x0: number, x1: number, color: string) => rect(g, color, x0, y, x1 - x0, 1);
  row(0, 9, 23, '#c3c8b8'); for (const x of [11, 16, 20]) rect(g, C.foam, x, 0, 2, 1);
  row(1, 6, 26, C.foam); row(2, 4, 28, C.body); row(3, 3, 29, C.body); row(4, 3, 29, C.silt); row(5, 4, 28, C.body);
  row(6, 2, 8, C.ripple); row(6, 24, 30, C.ripple); row(7, 1, 6, C.foamDim); row(7, 26, 31, C.foamDim);
  row(8, 5, 27, C.ripple); row(9, 9, 23, C.foamDim); row(10, 12, 20, C.ripple);
  return c;
}
