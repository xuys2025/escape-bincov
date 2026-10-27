/**
 * Mall floors in the 2.5D view (layout revisions 2 and 3, Sol's samples, issue #47): the ground bake, wall compositions,
 * door headers, furniture, signs, wall pieces, emission overlays, lights and ambient zones, all read from the dressing
 * table (mall-dressing.ts). Display only: collision, visibility and loot stay with the Runtime. The per-map part
 * (`mallDress`) is computed once per map and view; `buildMall` places sprites on every rebuild.
 */
import { Sprite } from 'pixi.js';
import type { MapDef, Point } from '../raid-runtime/contract';
import type { GroundMaterial } from './appearance';
import { canvas, rect } from './art/paint';
import { Lattice } from './art/surface';
import type { MallGroundBake } from './art/mall-ground';
import type { AmbientZone, Light } from './lighting';
import { mallCanvas, mallEmitId, mallPick, type MallArt } from './mall-art';
import {
  PROCEDURAL, WALL_LIFT, mallDecals, mallGround, mallLights, mallLintels, mallOpenings, mallProps, mallSigns, mallStandIns,
  mallWallCells, mallWallParts, mallWallProps, mallWallRole, mallZone, type DressMap, type DressSprite, type WallRole,
} from './mall-dressing';
import { MALL_FURNITURE, parseFurnitureName } from '../mall-layout-v2';
import { mallFullyDressed, mallRegionDressed } from '../mall-layout-v4';
import type { Textures } from './textures';

export type OccluderKind = 'wall' | 'door' | 'roof' | 'ceiling' | 'canopy' | 'lintel' | 'prop';
/** A sprite that follows its owner's fade, visibility and culling: wall signs, aisle signs, emission overlays. */
export interface Link { sprite: Sprite; key: string; emit: boolean }
/** The part of an occluder the mall builder sets; the scene owns the rest. */
export interface MallOccluder { sprite: Sprite; z: number; links?: Link[]; tintAt?: Point }
export interface MallContext {
  tex: Textures;
  art: MallArt;
  add(key: string, x: number, y: number, z: number, kind: OccluderKind, keepBottom: number): MallOccluder;
  addSprite(sprite: Sprite): void;
}

/** `edges`: open sides of a wall's cap (n s e w, 'x' = open); `link`: parapet neighbours carrying the rail (n s e w, '1'). */
interface WallPiece { x: number; y: number; role: WallRole; lift: number; cap: string | null; face: string | null; rail: string | null; link: string; edges: string; tint: Point }
export interface MallDress {
  dress: DressMap;
  ground: MallGroundBake;
  zone: AmbientZone;
  walls: WallPiece[];
  lintels: { x: number; y: number; asset: string }[];
  props: (DressSprite & { asset: string })[];
  signs: (DressSprite & { asset: string })[];
  wallProps: (DressSprite & { asset: string })[];
  lights: Light[];
  /** Entries whose generic stair marker is replaced by the drawn flight beside them. */
  flights: Set<string>;
  /** Entrances (world px rectangle of the open cells, the wall line's direction), for the door guides. */
  openings: { x: number; y: number; w: number; h: number; wall: 'ew' | 'ns' }[];
}

const T = 32;
const ZONES = ['indoor', 'outdoor', 'drop'] as const;
/**
 * Bottom canvas rows of a fading prop that stay solid: its transparent bottom rows plus four rows of foot, so the drawn
 * base stays on the floor. The stairwell is a hole in the floor, so none of it fades (that would show the floor it
 * replaces).
 */
const keepOf = (asset: string, c: HTMLCanvasElement) => /stairs-down/.test(asset) ? 1000 : bottomGap(c) + 4;
/** Colour of an emission overlay by what glows: cold cases, display panels, exit signs, emergency lamps, lamps, daylight. */
const glowOf = (asset: string) => /fridge|freezer/.test(asset) ? 0xbfe0ea : /exit/.test(asset) ? 0x7fe08f : /emergency/.test(asset) ? 0xe8f0e8
  : /floor-lamp/.test(asset) ? 0xf0c890 : /directory|pylon/.test(asset) ? 0xcfe5dc : 0x9fb0b8;

/** Everything about a mall floor that depends only on the map and the samples. */
export function mallDress(m: MapDef, art: MallArt, reduced: boolean): MallDress {
  const dress: DressMap = { mapId: m.key.mapId, cells: m.cells, regions: m.regions, decorations: m.decorations, full: mallFullyDressed(m.key.layoutRevision) };
  const cols = m.cols, rows = m.rows, zones = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) zones[y * cols + x] = ZONES.indexOf(mallZone(dress, x, y));
  const zoneAt = (x: number, y: number) => x < 0 || y < 0 || x >= cols || y >= rows ? 1 : zones[y * cols + x];
  const inside = (p: Point) => m.regions.filter(r => r.inside && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h).map(r => r.id);

  // Walls: every drawn wall cell (not furniture, not the drop) with its parts and open sides.
  const drawn = new Uint8Array(cols * rows);
  const all = mallWallCells(dress).filter(c => mallWallRole(dress, c.x, c.y) !== 'void');
  for (const c of all) drawn[c.y * cols + c.x] = 1;
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && drawn[y * cols + x] === 1;
  // A lone blocking cell (an unnamed corner marker) is a pillar, not a stub of wall that reads as a door frame.
  const pillars = all.filter(({ x, y }) => mallWallRole(dress, x, y) === 'wall' && !isWall(x - 1, y) && !isWall(x + 1, y) && !isWall(x, y - 1) && !isWall(x, y + 1));
  const cells = all.filter(c => !pillars.includes(c));
  // South of a side entrance the wall steps down (a low jamb, then half height), so its top no longer covers the gap.
  const openingList = mallOpenings(dress), low = new Map<string, number>();
  for (const o of openingList.filter(o => o.wall === 'ns')) for (const line of [o.cells, o.twin ?? []]) {
    const last = line[line.length - 1]; if (!last) continue;
    if (isWall(last.x, last.y + 1)) low.set(`${last.x},${last.y + 1}`, 16);
    if (isWall(last.x, last.y + 1) && isWall(last.x, last.y + 2)) low.set(`${last.x},${last.y + 2}`, 32);
  }
  const walls: WallPiece[] = cells.map(({ x, y }) => {
    const role = mallWallRole(dress, x, y), parts = mallWallParts(dress, x, y);
    const edges = role === 'wall' ? [isWall(x, y - 1), isWall(x, y + 1), isWall(x + 1, y), isWall(x - 1, y)].map(w => w ? '-' : 'x').join('') : '----';
    // Lit from the floor in front of the wall, or from its own cell when that floor is the drop or another wall.
    const front = !isWall(x, y + 1) && zoneAt(x, y + 1) !== 2;
    const link = role === 'parapet' ? [isWall(x, y - 1), isWall(x, y + 1), isWall(x + 1, y), isWall(x - 1, y)].map(w => w ? '1' : '0').join('') : '';
    return { x, y, role, lift: role === 'wall' ? low.get(`${x},${y}`) ?? WALL_LIFT.wall : WALL_LIFT[role], cap: mallPick(art, parts.cap), face: mallPick(art, parts.face), rail: mallPick(art, parts.rail),
      link, edges, tint: front ? { x: x * T + 16, y: (y + 1) * T + 8 } : { x: x * T + 16, y: y * T + 16 } };
  });

  const resolve = <S extends DressSprite>(list: S[]) => list.flatMap(s => { const asset = mallPick(art, s.assets); return asset ? [{ ...s, asset }] : []; });
  const column = (x: number, y: number): DressSprite => ({ assets: ['mall-prop-column-v1'], x: x * T, y: (y + 1) * T - 80, z: (y + 1) * T, layer: 'sorted', emit: false,
    foot: { x: x * T, y: y * T, w: T, h: T, lift: 48 } });
  const props = resolve([...mallProps(dress), ...mallStandIns(dress), ...pillars.map(p => column(p.x, p.y))]);
  const lintels = mallLintels(dress).flatMap(l => { const asset = mallPick(art, l.assets); return asset ? [{ x: l.x, y: l.y, asset }] : []; });

  // Ground: floor sample per cell (none for the drop and the tidal mud), decals, cast-shadow sources.
  const drop = new Uint8Array(cols * rows), wall = new Uint8Array(cols * rows), outdoor = new Uint8Array(cols * rows);
  const furniture = new Map<string, string>();
  for (const d of m.decorations) { const f = parseFurnitureName(d.name); if (f) furniture.set(`${Math.floor(d.x / T)},${Math.floor(d.y / T)}`, f.type); }
  const floor: (HTMLCanvasElement | null)[][] = [], mat: GroundMaterial[][] = [];
  for (let y = 0; y < rows; y++) {
    floor.push([]); mat.push([]);
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x, c = m.cells[y][x], f = furniture.get(`${x},${y}`), well = f === 'stairs-down';
      drop[i] = zones[i] === 2 ? 1 : 0; outdoor[i] = zones[i] === 1 ? 1 : 0;
      wall[i] = drawn[i] || (f && MALL_FURNITURE[f as keyof typeof MALL_FURNITURE].kind === 'B') ? 1 : 0;
      // No floor under the stairwell: the opening is dark wherever its sprite does not cover it.
      const ids = drop[i] || well || c === 'tide' ? [] : mallGround(dress, x, y), sample = mallCanvas(art, ids);
      floor[y].push(sample);
      mat[y].push(drop[i] || well ? 'void' : c === 'tide' ? 'mud' : outdoor[i] ? 'concrete' : /wood|deck/.test(mallPick(art, ids) ?? '') ? 'wood' : 'tile');
    }
  }
  const W = cols * T, H = rows * T;
  const ground: MallGroundBake = {
    geo: { cols, rows, wall, mat, outdoor, wear: new Lattice(72, 5, W, H), grain: new Lattice(22, 6, W, H), damp: new Lattice(40, 7, W, H) },
    floor, drop, walls: cells, guides: [], sills: openingList,
    decals: mallDecals(dress).flatMap(d => { const c = mallCanvas(art, d.assets, d.seed); return c ? [{ c, x: d.x, y: d.y }] : []; }),
    // Shadows start at the piece's drawn base: sofas, beds and benches leave transparent rows below it, and a shadow
    // cast from the cell's edge would sit apart from them (the piece would look as if it floated).
    feet: props.flatMap(p => {
      if (!p.foot || p.layer !== 'sorted') return [];
      // Only a footprint that reaches the sprite's bottom row is trimmed; a piece's own small foot (the lamp) is exact.
      if (p.foot.y + p.foot.h !== p.z) return [p.foot];
      const c = mallCanvas(art, [p.asset]), gap = c ? bottomGap(c) : 0;
      // The contact band spans the drawn piece, not the whole footprint: the bed and the bench are narrower than their cells.
      const [l, r] = c ? sideSpan(c) : [0, p.foot.w], x0 = Math.max(p.foot.x + 2, p.x + l), x1 = Math.min(p.foot.x + p.foot.w - 2, p.x + r);
      return [{ ...p.foot, h: Math.max(8, p.foot.h - gap), ...x1 > x0 ? { band: { x: x0, w: x1 - x0 } } : {} }];
    }),
  };

  // Lights: ceiling tubes (light only), the glow of cold cases, panels and lamps, wall lamps and daylight through glazing.
  const lights: Light[] = [];
  const light = (x: number, y: number, r: number, color: number, k: number, flicker?: number) => lights.push({ x, y, r, color, k, region: null, regions: inside({ x, y }), ...flicker === undefined ? {} : { flicker } });
  for (const t of mallLights(dress)) light(t.x, t.y, t.r, t.broken ? 0x9a9680 : 0xb8b49c, t.broken ? .32 : .5, t.broken && !reduced ? (t.x * 7 + t.y * 13) % 997 : undefined);
  for (const p of props) {
    if (/fridge/.test(p.asset)) light(p.x + 16, p.z + 12, 46, 0x7aa0aa, .42);
    else if (/freezer/.test(p.asset)) light(p.x + 32, p.z + 8, 54, 0x7aa0aa, .32);
    else if (/floor-lamp/.test(p.asset)) light(p.x + 16, p.z - 16, 64, 0xc89a5a, .5);
    else if (/directory|pylon/.test(p.asset)) light(p.x + 16, p.z + 6, 40, 0x8fb8a8, .3);
    else if (/furniture:vending/.test(p.asset)) light(p.x + 16, p.z + 10, 44, 0xb8c8d0, .34);
  }
  const wallProps = resolve(mallWallProps(dress));
  for (const p of wallProps) {
    if (/emergency/.test(p.asset)) light(p.x + 8, p.z + 24, 56, 0xb8c0b8, .38);
    else if (/exit/.test(p.asset)) light(p.x + 10, p.z + 18, 30, 0x5fbf6f, .45);
  }
  for (const w of walls) if (w.face && /curtain|window/.test(w.face) && zoneAt(w.x, w.y + 1) === 0) light(w.x * T + 16, (w.y + 1.6) * T, 70, 0x8796a0, .45);

  const rooms = m.regions.filter(r => r.inside);
  const undressed = (x: number, y: number) => { const r = rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h); return !!r && !mallRegionDressed(m.key.layoutRevision, r.id); };
  const flights = new Set(m.entries.filter(e => {
    const ex = Math.floor(e.at.x / T), ey = Math.floor(e.at.y / T);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (/^stairs-/.test(furniture.get(`${ex + dx},${ey + dy}`) ?? '')) return true;
    return false;
  }).map(e => e.id));
  // Arrows from the stair point toward the flight (the nearest stairs cell in a straight line), on the cells between.
  for (const e of m.entries.filter(e => flights.has(e.id))) {
    const ex = Math.floor(e.at.x / T), ey = Math.floor(e.at.y / T);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const cells: [number, number][] = [];
      let x = ex, y = ey;
      for (let i = 0; i < 4 && !/^stairs-/.test(furniture.get(`${x},${y}`) ?? ''); i++) { cells.push([x, y]); x += dx; y += dy; }
      if (!/^stairs-/.test(furniture.get(`${x},${y}`) ?? '')) continue;
      ground.guides.push(...cells.map(([cx, cy]) => ({ x: cx, y: cy, dx, dy })));
      break;
    }
  }
  return {
    dress, ground, walls, lintels, props, wallProps, lights, flights, signs: resolve(mallSigns(dress)),
    // Guides cover the whole doorway, both lines of a thick wall.
    openings: openingList.map(o => {
      const all = [...o.cells, ...o.twin ?? []], x0 = Math.min(...all.map(c => c.x)), y0 = Math.min(...all.map(c => c.y));
      return { x: x0 * T, y: y0 * T, w: (Math.max(...all.map(c => c.x)) - x0 + 1) * T, h: (Math.max(...all.map(c => c.y)) - y0 + 1) * T, wall: o.wall };
    }),
    // Rooms outside the dressed route sit a little darker, so the route reads as the lit way through.
    zone: (x, y) => { const z = ZONES[zoneAt(Math.floor(x / T), Math.floor(y / T))]; return z === 'indoor' && undressed(x, y) ? 'dim' : z; },
  };
}

const gaps = new WeakMap<HTMLCanvasElement, number>(), spans = new WeakMap<HTMLCanvasElement, [number, number]>();

/** The first opaque column and one past the last, over the whole sprite. */
function sideSpan(c: HTMLCanvasElement): [number, number] {
  let s = spans.get(c);
  if (!s) {
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    let l = c.width, r = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { if (x < l) l = x; if (x + 1 > r) r = x + 1; }
    s = r > l ? [l, r] : [0, c.width];
    spans.set(c, s);
  }
  return s;
}
/** Transparent rows at the bottom of a sprite (between its drawn base and the footprint's south edge). */
function bottomGap(c: HTMLCanvasElement): number {
  let n = gaps.get(c);
  if (n === undefined) {
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    n = 0;
    for (let y = c.height - 1; y >= 0; y--, n++) { let any = false; for (let x = 0; x < c.width && !any; x++) any = d[(y * c.width + x) * 4 + 3] > 0; if (any) break; }
    gaps.set(c, n);
  }
  return n;
}

/** One canvas per wall composition: cap (with its open edges) above a face as tall as the wall; parapets carry a rail. */
function paintWallPiece(art: MallArt, w: WallPiece): HTMLCanvasElement {
  const { c, g } = canvas(T, T + w.lift), get = (id: string) => art.get(id);
  const cap = w.cap && get(w.cap);
  if (cap) g.drawImage(cap, 0, 0); else rect(g, '#46433d', 0, 0, T, T);
  const [n, s, e, west] = w.edges.split('').map(x => x === 'x');
  const edge = (id: string, x: number, y: number) => { const im = get(id); if (im) g.drawImage(im, x, y); };
  if (n) edge('mall-wall-edge-n-v1', 0, 0);
  if (s) edge('mall-wall-edge-s-v1', 0, T - 3);
  if (e) edge('mall-wall-edge-e-v1', T - 3, 0);
  if (west) edge('mall-wall-edge-w-v1', 0, 0);
  const face = w.face && get(w.face);
  // A low wall shows the foot of the face (skirting and base), not its top band.
  if (face && w.lift) g.drawImage(face, 0, Math.max(0, face.height - w.lift), T, Math.min(w.lift, face.height), 0, T, T, Math.min(w.lift, face.height));
  // The glass rail stands on the cap's centre line: an east-west run shows the rail itself, a north-south run its top as
  // a line along the cap. Both stop at the centre where the run ends, so corners and tees join.
  if (w.rail) {
    const rail = get(w.rail), [n, s, e, west] = w.link.split('').map(c => c === '1'), across = e || west || !(n || s);
    if (n || s) { const y0 = n ? 0 : 15, y1 = s ? T : 17; rect(g, '#b8c6c4', 14, y0, 2, y1 - y0); rect(g, '#6d7674', 16, y0, 1, y1 - y0); }
    if (across) {
      const x0 = west || !e ? 0 : 14, x1 = e || !west ? T : 17;
      if (rail) g.drawImage(rail, x0, 0, x1 - x0, rail.height, x0, 16 - rail.height, x1 - x0, rail.height);
      else rect(g, '#b8c6c4', x0, 14, x1 - x0, 2);
    }
  }
  return c;
}
/** Emission mask as plain white over its shape, so the overlay's tint sets the colour. */
function glowCanvas(mask: HTMLCanvasElement): HTMLCanvasElement {
  const { c, g } = canvas(mask.width, mask.height);
  g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Place the floor's pieces. Every wall, header and piece of furniture is an occluder; signs and glows follow their owner. */
export function buildMall(ctx: MallContext, d: MallDress) {
  const { tex, art } = ctx, owners = new Map<string, MallOccluder>();
  const sample = (asset: string, seed = 0) => { const key = `mall:${asset}`; tex.ensure(key, () => mallCanvas(art, [asset], seed)!); return key; };
  const glow = (owner: MallOccluder, asset: string, x: number, y: number, z = owner.z) => {
    const emit = mallEmitId(art, asset); if (!emit) return;
    const key = `mall:${emit}|glow`, t = tex.ensure(key, () => glowCanvas(art.get(emit)!));
    const s = new Sprite(t); s.position.set(x, y); s.zIndex = z + .002; s.blendMode = 'add'; s.tint = glowOf(asset); s.alpha = .5;
    ctx.addSprite(s); (owner.links ??= []).push({ sprite: s, key, emit: true });
  };
  const follow = (owner: MallOccluder | undefined, key: string, x: number, y: number, z: number) => {
    const s = new Sprite(tex.atlas.get(key)); s.position.set(x, y); s.zIndex = z; ctx.addSprite(s);
    if (owner) (owner.links ??= []).push({ sprite: s, key, emit: false });
  };

  for (const w of d.walls) {
    const key = `mall:wall:${w.cap}|${w.face}|${w.rail}|${w.link}|${w.edges}|${w.lift}`;
    tex.ensure(key, () => paintWallPiece(art, w));
    // A cut-away wall keeps the cell it blocks solid (its bottom 32 rows), so a ghosted wall never reads as floor.
    const y = w.y * T - w.lift, o = ctx.add(key, w.x * T, y, (w.y + 1) * T, 'wall', Math.min(32, T + w.lift));
    o.tintAt = w.tint; owners.set(`${w.x},${w.y}`, o);
    if (w.face) glow(o, w.face, w.x * T, y + T);
  }
  for (const l of d.lintels) {
    const o = ctx.add(sample(l.asset), l.x * T, l.y * T - 48, (l.y + 1) * T + .05, 'lintel', 0);
    o.tintAt = { x: l.x * T + 16, y: (l.y + 1) * T + 8 }; owners.set(`${l.x},${l.y}`, o);
    glow(o, l.asset, l.x * T, l.y * T - 48);
  }
  for (const p of d.props) {
    const key = sample(p.asset), c = tex.canvas(key);
    const o = ctx.add(key, p.x, p.y, p.layer === 'overhead' ? p.z + .5 : p.z, p.layer === 'overhead' ? 'canopy' : 'prop', p.layer === 'overhead' ? 0 : keepOf(p.asset, c));
    o.tintAt = p.layer === 'overhead' ? { x: p.x + c.width / 2, y: p.z } : { x: p.x + c.width / 2, y: p.z - 6 };
    if (p.foot) for (let y = p.foot.y; y < p.foot.y + p.foot.h; y += T) for (let x = p.foot.x; x < p.foot.x + p.foot.w; x += T) owners.set(`${x / T},${y / T}`, o);
    if (!p.asset.startsWith(PROCEDURAL)) glow(o, p.asset, p.x, p.y);
  }
  // Signs stand on their fixture and wall pieces hang on their wall: both fade and hide with it.
  for (const s of d.signs) follow(owners.get(`${Math.floor((s.x + 13) / T)},${Math.floor(s.z / T) - 1}`), sample(s.asset), s.x, s.y, s.z);
  for (const s of d.wallProps) {
    const key = sample(s.asset), w = tex.canvas(key).width, owner = owners.get(`${Math.floor((s.x + w / 2) / T)},${Math.floor(s.z / T) - 1}`);
    follow(owner, key, s.x, s.y, s.z);
    if (owner) glow(owner, s.asset, s.x, s.y, s.z);
  }
}
