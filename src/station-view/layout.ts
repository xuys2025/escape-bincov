/**
 * Water station (hideout) layout. One tile is 32 world px; the view is a 3/4 top-down projection where ground y maps 1:1 to the
 * screen and height is drawn upward (a wall of height H at row y covers screen rows y*32+32-H-32 .. y*32+32).
 * North is up. The sea lies south of the compound, the main gate opens onto the sea-wall road.
 */
import { STATION_POOLS, STATION_TRAINING } from '../hideout-runtime/training';

export const T = 32;
export const W = 35, H = 28;
export const WALL_H = 48;
export const YARD_WALL_H = 30;

export type Floor = 'void' | 'road' | 'yard' | 'sea' | 'dock' | 'cold' | 'canteen' | 'dorm' | 'gen' | 'radio' | 'work' | 'clinic' | 'shed';
export type RoomId = 'cold' | 'canteen' | 'dorm' | 'gen' | 'radio' | 'work' | 'clinic';
export type WallStyle = 'yard' | 'panel' | 'tile' | 'brick' | 'block' | 'clinic';
export interface Room {
  id: RoomId; name: string; x: number; y: number; w: number; h: number; floor: Floor; wall: WallStyle;
  doors: [number, number][]; windows: [number, number][];
  /** Interior ambient when the room is lit (restored power) and on emergency power. */
  ambient: { on: number; off: number };
}
/** Outer rects are inclusive wall rings; interiors are x+1..x+w-2, y+1..y+h-2. */
export const ROOMS: Room[] = [
  { id: 'cold', name: '冷库', x: 1, y: 1, w: 8, h: 7, floor: 'cold', wall: 'panel', doors: [[4, 7], [5, 7]], windows: [], ambient: { on: 0x48586a, off: 0x1d2128 } },
  { id: 'canteen', name: '食堂', x: 8, y: 1, w: 10, h: 7, floor: 'canteen', wall: 'tile', doors: [[13, 7]], windows: [[10, 7], [11, 7], [15, 7], [16, 7]], ambient: { on: 0x5a4c3e, off: 0x2a221c } },
  { id: 'dorm', name: '宿舍', x: 17, y: 1, w: 5, h: 7, floor: 'dorm', wall: 'tile', doors: [[17, 4]], windows: [[19, 7], [20, 7]], ambient: { on: 0x4a3f36, off: 0x221d19 } },
  { id: 'gen', name: '发电机房', x: 24, y: 1, w: 4, h: 7, floor: 'gen', wall: 'block', doors: [[25, 7]], windows: [], ambient: { on: 0x4a4038, off: 0x2a1614 } },
  { id: 'radio', name: '电台', x: 27, y: 1, w: 7, h: 7, floor: 'radio', wall: 'block', doors: [[27, 4]], windows: [[29, 7], [31, 7]], ambient: { on: 0x3a463e, off: 0x1c2420 } },
  { id: 'work', name: '加工间', x: 1, y: 10, w: 8, h: 6, floor: 'work', wall: 'tile', doors: [[8, 12]], windows: [[3, 15], [6, 15]], ambient: { on: 0x4a5450, off: 0x1e2221 } },
  { id: 'clinic', name: '卫生所', x: 26, y: 11, w: 8, h: 6, floor: 'clinic', wall: 'clinic', doors: [[28, 16]], windows: [[30, 16], [32, 16]], ambient: { on: 0x52605a, off: 0x232a27 } },
];
export const COMPOUND = { x: 1, y: 1, w: 33, h: 21 };
export const MAIN_GATE: [number, number][] = [[26, 21], [27, 21], [28, 21]];
export const DOCK_GATE: [number, number][] = [[5, 21], [6, 21]];
/** Repair shed canopy (open front) against the workshop's south wall. */
export const SHED = { x: 1, y: 16, w: 7, h: 3 };
/** Training lanes and nursery pools are the Runtime's own constants: the drawing cannot disagree with the rule. */
export const TRAINING_ZONE = { x: STATION_TRAINING.x, y: STATION_TRAINING.y, w: STATION_TRAINING.w, h: STATION_TRAINING.h };
export const POOLS = STATION_POOLS.map(p => ({ ...p }));

export interface WallTile {
  x: number; y: number; h: number; style: WallStyle;
  /** Room whose wall this is ('yard' for the compound); faces exposed to the south get an exterior or interior face. */
  owner: RoomId | 'yard';
  face: 'ext' | 'int' | null; window: boolean; gate?: 'main' | 'dock';
  /** Doorway: walkable, drawn as a lintel band at wall-top height. */
  door: boolean;
}

const key = (x: number, y: number) => `${x},${y}`;
export const walls = new Map<string, WallTile>();
export const floors: Floor[][] = Array.from({ length: H }, () => Array<Floor>(W).fill('void'));
export const roomAt: (RoomId | null)[][] = Array.from({ length: H }, () => Array<RoomId | null>(W).fill(null));

function ring(r: { x: number; y: number; w: number; h: number }, visit: (x: number, y: number, side: 'n' | 's' | 'e' | 'w') => void) {
  for (let x = r.x; x < r.x + r.w; x++) { visit(x, r.y, 'n'); visit(x, r.y + r.h - 1, 's'); }
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) { visit(r.x, y, 'w'); visit(r.x + r.w - 1, y, 'e'); }
}

// Ground outside and inside the compound.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  floors[y][x] = y >= 24 ? 'sea' : y >= 22 ? 'road' : (x >= COMPOUND.x && x < COMPOUND.x + COMPOUND.w && y >= COMPOUND.y && y < COMPOUND.y + COMPOUND.h) ? 'yard' : 'void';
}
for (let y = 24; y <= 26; y++) for (let x = 5; x <= 7; x++) floors[y][x] = 'dock';
for (let y = SHED.y; y < SHED.y + SHED.h; y++) for (let x = SHED.x; x < SHED.x + SHED.w; x++) floors[y][x] = 'shed';
for (const r of ROOMS) for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) { floors[y][x] = r.floor; roomAt[y][x] = r.id; }

ring(COMPOUND, (x, y) => walls.set(key(x, y), { x, y, h: YARD_WALL_H, style: 'yard', owner: 'yard', face: null, window: false, door: false }));
for (const r of ROOMS) ring(r, (x, y) => {
  const prev = walls.get(key(x, y));
  // Buildings stand against the compound wall: their wall wins (full height) where the two coincide.
  if (!prev || prev.owner === 'yard') walls.set(key(x, y), { x, y, h: WALL_H, style: r.wall, owner: r.id, face: null, window: false, door: false });
});
for (const r of ROOMS) {
  for (const [x, y] of r.doors) { const w = walls.get(key(x, y))!; w.door = true; floors[y][x] = r.floor; roomAt[y][x] = r.id; }
  for (const [x, y] of r.windows) walls.get(key(x, y))!.window = true;
}
for (const [x, y] of MAIN_GATE) { const w = walls.get(key(x, y))!; w.gate = 'main'; }
for (const [x, y] of DOCK_GATE) { const w = walls.get(key(x, y))!; w.door = true; w.gate = 'dock'; floors[y][x] = 'yard'; }
// Faces: a wall whose south neighbour is not a wall shows its face; exterior if the tile below is outside the owner.
for (const w of walls.values()) {
  if (w.door || w.gate === 'main') continue;
  const below = walls.get(key(w.x, w.y + 1));
  if (below && !below.door && !below.gate) continue;
  const r = ROOMS.find(q => q.id === w.owner);
  w.face = r && w.y === r.y && w.x > r.x && w.x < r.x + r.w - 1 ? 'int' : 'ext';
}
export const wallAt = (x: number, y: number) => walls.get(key(x, y));

/**
 * Every doorway with the spaces on its two sides (null = open ground). Side doors sit in north-south walls; seen in
 * the 3/4 view they show only as a gap in the wall top, so the view adds a door leaf, light spill, a destination sign
 * and lifts the neighbouring roof when the player comes close (F01).
 */
export interface Doorway { x: number; y: number; side: boolean; a: RoomId | null; b: RoomId | null; name: { a: string; b: string } }
const placeName = (r: RoomId | null) => r ? ROOMS.find(q => q.id === r)!.name : '院子';
export const DOORWAYS: Doorway[] = [];
for (const r of ROOMS) for (const [x, y] of r.doors) {
  const side = !!wallAt(x, y - 1) && !!wallAt(x, y + 1);
  const [pa, pb] = side ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]];
  const a = roomAt[pa[1]]?.[pa[0]] ?? null, b = roomAt[pb[1]]?.[pb[0]] ?? null;
  DOORWAYS.push({ x, y, side, a, b, name: { a: placeName(a), b: placeName(b) } });
}

export interface Station {
  id: StationId; name: string; who?: string;
  /** Where the player stands to use it (world px) and the point shown as its anchor. */
  stand: { x: number; y: number }; anchor: { x: number; y: number };
  /** Panel shown for the station; facility stations open the facility panel. */
  panel: 'gear' | 'arms' | 'med' | 'radio' | 'generator' | 'deploy' | 'facility' | 'board' | 'chat';
  facility?: 'rest' | 'medical' | 'training' | 'workbench' | 'blackmarket';
  room: RoomId | null; radius: number; hotkey?: string;
}
export type StationId = 'gear' | 'arms' | 'med' | 'radio' | 'generator' | 'deploy' | 'rest' | 'medical' | 'training' | 'workbench' | 'blackmarket' | 'board' | 'cook';
const at = (x: number, y: number) => ({ x: x * T, y: y * T });
export const STATIONS: Station[] = [
  { id: 'gear', name: '仓库与整备', stand: at(4.5, 5.2), anchor: at(4.5, 3.6), panel: 'gear', room: 'cold', radius: 46, hotkey: 'Tab' },
  { id: 'arms', name: '修理铺', who: '老栓', stand: at(4.5, 18.6), anchor: at(4, 16.5), panel: 'arms', room: null, radius: 44 },
  { id: 'med', name: '卫生所', who: '许医生', stand: at(28.5, 14.7), anchor: at(28.5, 12.6), panel: 'med', room: 'clinic', radius: 44 },
  { id: 'radio', name: '电台任务', who: '小蔡', stand: at(30.5, 4.6), anchor: at(30.5, 2.8), panel: 'radio', room: 'radio', radius: 46, hotkey: 'J' },
  { id: 'generator', name: '发电机', stand: at(25.5, 5.0), anchor: at(25.9, 3.4), panel: 'generator', room: 'gen', radius: 40 },
  { id: 'deploy', name: '出击准备', stand: at(27.5, 20.2), anchor: at(27.5, 21.2), panel: 'deploy', room: null, radius: 50, hotkey: 'G' },
  { id: 'rest', name: '休息区', stand: at(19.5, 5.2), anchor: at(19.5, 3.6), panel: 'facility', facility: 'rest', room: 'dorm', radius: 44 },
  { id: 'medical', name: '医疗区', stand: at(30.6, 14.6), anchor: at(31.5, 13.4), panel: 'facility', facility: 'medical', room: 'clinic', radius: 40 },
  { id: 'training', name: '训练区', stand: at(20.5, 10.6), anchor: at(20.5, 9.4), panel: 'facility', facility: 'training', room: null, radius: 40 },
  { id: 'workbench', name: '工作台', stand: at(4.5, 13.7), anchor: at(4.5, 12.2), panel: 'facility', facility: 'workbench', room: 'work', radius: 44 },
  { id: 'blackmarket', name: '黑市商人', stand: at(6.5, 26.2), anchor: at(9, 25.6), panel: 'facility', facility: 'blackmarket', room: null, radius: 44 },
  { id: 'board', name: '寻人板', stand: at(10.5, 8.6), anchor: at(10.5, 7.3), panel: 'board', room: null, radius: 34 },
  { id: 'cook', name: '食堂', who: '炊事员', stand: at(14.5, 4.8), anchor: at(14.5, 2.9), panel: 'chat', room: 'canteen', radius: 40 },
];

export type LightKind = 'bulb' | 'tube' | 'sodium' | 'flood' | 'fire' | 'lantern' | 'red' | 'radio' | 'string' | 'clinic' | 'stove';
export interface LightDef {
  id: string; x: number; y: number; r: number; color: number; k: number; kind: LightKind;
  /** Height of the lamp head above its ground point (for the glow sprite). */
  head: number;
  /** Light domain: the room it lights (clipped to that interior), or null for open ground. */
  room: RoomId | null;
  /** 'any' always on; 'restored' needs the repaired generator; 'emergency' only before the repair. */
  power: 'any' | 'restored' | 'emergency';
  flicker?: number;
  /** Spill through a window or door onto the ground: it lights the ground and people, not the masonry around it. */
  ground?: boolean;
}
const L = (id: string, x: number, y: number, r: number, color: number, k: number, kind: LightKind, room: RoomId | null, power: LightDef['power'], head = 34, flicker?: number): LightDef =>
  ({ id, x: x * T, y: y * T, r, color, k, kind, room, power, head, flicker });
export const LIGHTS: LightDef[] = [
  // Courtyard
  L('pole-nw', 9.4, 9.2, 190, 0xffa75a, .95, 'sodium', null, 'restored', 70),
  L('pole-ne', 22.6, 9.2, 190, 0xffa75a, .95, 'sodium', null, 'restored', 70),
  L('pole-sw', 9.4, 19.4, 180, 0xffa75a, .85, 'sodium', null, 'restored', 70),
  L('flood-gate', 25, 19.2, 200, 0xfff0d0, .9, 'flood', null, 'restored', 74),
  L('flood-canteen', 16.5, 9.0, 250, 0xffe6c4, .62, 'flood', null, 'restored', 62),
  L('barrel-fire', 21.5, 18.4, 92, 0xff7a2c, .95, 'fire', null, 'any', 14, 3),
  L('lantern-door', 13.5, 8.4, 70, 0xffb860, .7, 'lantern', null, 'emergency', 30, 5),
  L('emer-gate', 27.5, 20.1, 80, 0xffc070, .55, 'lantern', null, 'emergency', 40, 9),
  L('string-a', 11.5, 9.8, 84, 0xffd890, .55, 'string', null, 'restored', 50),
  L('string-b', 15.5, 9.8, 84, 0xffd890, .55, 'string', null, 'restored', 50),
  L('string-c', 19.5, 9.8, 84, 0xffd890, .55, 'string', null, 'restored', 50),
  L('shed-lamp', 5.6, 17.9, 96, 0xfff1c4, .95, 'bulb', null, 'any', 44, 11),
  L('dock-lantern', 9.4, 25.6, 90, 0xffb05a, .85, 'lantern', null, 'any', 22, 7),
  L('road-lamp', 23.5, 22.9, 130, 0xffa75a, .6, 'sodium', null, 'restored', 70),
  // Interiors
  L('cold-tube', 4.5, 3.8, 120, 0xd6ecff, .95, 'tube', 'cold', 'restored', 44),
  L('cold-lantern', 4.6, 4.4, 60, 0xffc27a, .8, 'lantern', 'cold', 'emergency', 14, 2),
  L('canteen-a', 11, 4.2, 110, 0xffc890, .95, 'bulb', 'canteen', 'restored', 40),
  L('canteen-b', 14.5, 4.2, 110, 0xffc890, .95, 'bulb', 'canteen', 'restored', 40),
  L('stove', 15.6, 2.6, 70, 0xff7a2c, .8, 'stove', 'canteen', 'any', 10, 4),
  L('canteen-candle', 11.5, 4.6, 46, 0xffc070, .6, 'lantern', 'canteen', 'emergency', 10, 6),
  L('dorm-bulb', 19.5, 4, 80, 0xffbf80, .8, 'bulb', 'dorm', 'restored', 40),
  L('gen-red', 25.9, 4.2, 70, 0xff3a2a, .8, 'red', 'gen', 'emergency', 44, 8),
  L('gen-bulb', 25.9, 4.6, 90, 0xffd5a0, .9, 'bulb', 'gen', 'restored', 44),
  L('radio-dial', 30.5, 2.8, 64, 0x9dffb0, .7, 'radio', 'radio', 'any', 10, 12),
  L('radio-lamp', 29.4, 3, 86, 0xffd090, .85, 'bulb', 'radio', 'restored', 24),
  L('work-tube', 4.5, 12.6, 110, 0xe0f4ff, .9, 'tube', 'work', 'restored', 44),
  L('clinic-tube', 29.5, 13.2, 120, 0xe4fff0, .9, 'clinic', 'clinic', 'restored', 44),
  L('clinic-desk', 28.5, 13.6, 56, 0xffd8a0, .8, 'lantern', 'clinic', 'any', 16, 13),
];

/** Antenna beacon on the radio roof: drawn as a glow only (it does not light the ground). */
export const BEACON = { x: 31.5 * T, y: 1.6 * T, head: 92 };

export interface PropDef {
  id: string; kind: string;
  /** Footprint in tiles (top-left, size). Sprites stand on the footprint's south edge. */
  tx: number; ty: number; tw: number; th: number;
  blocks?: boolean; room: RoomId | null;
  /** Shown only from this facility level (or only below it with `below`). */
  facility?: { id: 'rest' | 'medical' | 'training' | 'workbench' | 'blackmarket'; min: number; below?: boolean };
  power?: 'restored' | 'emergency';
  upgraded?: boolean;
  /** Collision inset (px) from the footprint edges. */
  inset?: number;
  /** Sort earlier than the footprint's south edge (things standing at the north edge of their tile). */
  zOffset?: number;
  /** Collision box in px relative to the footprint's top-left, when only part of the prop stands on the ground. */
  box?: { x: number; y: number; w: number; h: number };
}
/** A lamp post's footing: the post is 4 px wide and stands on a small base near the tile's south edge. */
const POLE_BASE = { x: 13, y: 21, w: 6, h: 6 };
const P = (id: string, kind: string, tx: number, ty: number, tw: number, th: number, room: RoomId | null, extra: Partial<PropDef> = {}): PropDef =>
  ({ id, kind, tx, ty, tw, th, room, blocks: true, ...extra });
export const PROPS: PropDef[] = [
  // Cold store: shelving with the stash, gear table, lockers.
  P('cold-shelf-a', 'shelf', 2, 2, 3, 1, 'cold'), P('cold-shelf-b', 'shelf', 5, 2, 3, 1, 'cold'),
  P('cold-shelf-c', 'shelf-tall', 7, 4, 1, 2, 'cold', { upgraded: true }),
  P('gear-table', 'gear-table', 3, 4, 3, 1, 'cold', { inset: 2, power: 'restored' }),
  P('gear-table-dark', 'gear-table-lantern', 3, 4, 3, 1, 'cold', { inset: 2, power: 'emergency' }),
  P('lockers', 'lockers', 2, 4, 1, 2, 'cold'),
  // Canteen
  P('stove', 'stove', 14, 2, 3, 1, 'canteen'),
  P('table-a', 'table-long', 9, 4, 4, 1, 'canteen', { inset: 3 }), P('table-b', 'table-long', 9, 6, 4, 1, 'canteen', { inset: 3 }),
  P('bench-a', 'bench', 9, 3, 4, 1, 'canteen', { blocks: false }), P('bench-b', 'bench', 9, 5, 4, 1, 'canteen', { blocks: false }),
  P('pots', 'pots', 16, 4, 1, 2, 'canteen'),
  P('rice-sacks', 'sacks', 9, 2, 2, 1, 'canteen'),
  // Dorm (rest facility): mats -> bunks -> stove and curtains
  P('mats', 'mats', 18, 2, 3, 3, 'dorm', { blocks: false, facility: { id: 'rest', min: 1, below: true } }),
  P('bunk-a', 'bunk', 18, 2, 1, 2, 'dorm', { facility: { id: 'rest', min: 1 } }),
  P('bunk-b', 'bunk', 20, 2, 1, 2, 'dorm', { facility: { id: 'rest', min: 1 } }),
  P('dorm-heater', 'heater', 19, 2, 1, 1, 'dorm', { facility: { id: 'rest', min: 2 } }),
  P('bunk-c', 'bunk', 20, 5, 1, 2, 'dorm', { facility: { id: 'rest', min: 2 } }),
  P('curtain', 'curtain', 18, 5, 1, 2, 'dorm', { facility: { id: 'rest', min: 3 } }),
  // Generator room / radio room
  P('generator', 'generator', 25, 2, 2, 2, 'gen'),
  P('fuel', 'fuel-tank', 26, 6, 1, 1, 'gen', { inset: 4 }),
  P('radio-desk', 'radio-desk', 29, 2, 3, 1, 'radio'),
  P('radio-cot', 'cot', 32, 4, 1, 2, 'radio'),
  P('radio-chart', 'chart-stand', 28, 2, 1, 1, 'radio'),
  // Processing room (workbench facility)
  P('steel-a', 'steel-table', 3, 12, 3, 1, 'work', { facility: { id: 'workbench', min: 1 } }),
  P('steel-old', 'steel-table-old', 3, 12, 3, 1, 'work', { facility: { id: 'workbench', min: 1, below: true } }),
  P('sink', 'sink', 2, 11, 1, 1, 'work'),
  P('work-shelf', 'shelf', 5, 11, 3, 1, 'work'),
  P('press', 'press', 7, 13, 1, 2, 'work', { facility: { id: 'workbench', min: 2 } }),
  P('leaf-radio', 'door-leaf', 28, 4, 1, 1, 'radio', { blocks: false, zOffset: -28 }),
  P('leaf-dorm', 'door-leaf-wood', 18, 4, 1, 1, 'dorm', { blocks: false, zOffset: -28 }),
  P('leaf-work', 'door-leaf-west', 7, 12, 1, 1, 'work', { blocks: false, zOffset: -28 }),
  P('dryer', 'dryer', 2, 13, 1, 2, 'work', { facility: { id: 'workbench', min: 3 } }),
  // Repair shed (Lao Shuan)
  P('repair-counter', 'counter', 2, 17, 4, 1, null, { inset: 2 }),
  P('vise', 'tool-cart', 6, 16, 1, 1, null),
  P('tires', 'tires', 7, 18, 1, 1, null),
  // Clinic (med shop + medical facility)
  P('xu-desk', 'desk', 28, 13, 2, 1, 'clinic', { inset: 2 }),
  P('med-cabinet', 'cabinet', 27, 12, 1, 1, 'clinic'),
  P('bed-a', 'bed', 31, 12, 2, 1, 'clinic', { facility: { id: 'medical', min: 1 } }),
  P('bed-b', 'bed', 31, 14, 2, 1, 'clinic', { facility: { id: 'medical', min: 2 } }),
  P('drip', 'drip', 30, 12, 1, 1, 'clinic', { facility: { id: 'medical', min: 3 }, blocks: false }),
  P('cot-old', 'stretcher', 31, 13, 2, 1, 'clinic', { facility: { id: 'medical', min: 1, below: true } }),
  // Courtyard: nursery pools, training gear, lamps and clutter
  ...POOLS.map((p, i) => P(`pool-${i}`, 'pool', p.x, p.y, p.w, p.h, null)),
  P('pullup', 'pullup', 20, 12, 1, 1, null, { facility: { id: 'training', min: 1 }, inset: 6 }),
  P('tire-train', 'tire-flat', 19, 14, 1, 1, null, { facility: { id: 'training', min: 2 }, blocks: false }),
  P('sandbag', 'sandbag', 20, 15, 1, 1, null, { facility: { id: 'training', min: 3 }, inset: 6 }),
  P('train-board', 'train-board', 20, 9, 1, 1, null, { inset: 6 }),
  P('pole-nw', 'pole', 9, 9, 1, 1, null, { box: POLE_BASE }), P('pole-ne', 'pole', 22, 9, 1, 1, null, { box: POLE_BASE }),
  P('pole-sw', 'pole', 9, 19, 1, 1, null, { box: POLE_BASE }), P('pole-gate', 'flood-pole', 24, 19, 1, 1, null, { box: POLE_BASE }),
  P('barrel-fire', 'fire-barrel', 21, 18, 1, 1, null, { inset: 6 }),
  P('crates-cold', 'fish-crates', 2, 8, 2, 1, null), P('crates-gate', 'fish-crates', 31, 19, 2, 1, null),
  P('foam-a', 'foam-boxes', 7, 8, 1, 1, null, { inset: 3 }),
  P('drums-a', 'drums', 22, 4, 2, 2, null), P('water-tower', 'water-tower', 22, 2, 2, 2, null),
  P('drums-b', 'drums', 23, 8, 1, 1, null, { inset: 2 }),
  P('bike', 'bike', 24, 15, 1, 1, null, { inset: 6 }),
  P('hull', 'hull', 23, 10, 2, 4, null, { inset: 3 }),
  P('cafe', 'cafe-table', 15, 8, 2, 1, null, { inset: 5 }),
  P('cart', 'hand-cart', 30, 18, 1, 1, null, { inset: 4 }),
  P('baskets', 'baskets', 10, 13, 1, 1, null, { inset: 6 }),
  P('tarp-pile', 'tarp-pile', 12, 17, 2, 1, null, { inset: 3 }),
  P('crates-yard', 'fish-crates', 17, 18, 2, 1, null),
  P('veg-a', 'veg-boxes', 11, 20, 3, 1, null), P('veg-b', 'veg-boxes', 15, 20, 3, 1, null),
  P('nets', 'net-rack', 2, 20, 2, 1, null),
  P('buoys', 'buoys', 30, 9, 2, 1, null),
  P('deploy-board', 'deploy-board', 25, 20, 1, 1, null, { inset: 6 }),
  P('laundry', 'laundry', 18, 8, 3, 1, null, { blocks: false }),
  // Dock and sea
  P('boat', 'boat', 8, 25, 3, 1, null, { facility: { id: 'blackmarket', min: 0 } }),
  P('bollard', 'bollard', 7, 24, 1, 1, null, { inset: 10 }),
  P('barrier-w', 'barrier', 3, 22, 1, 2, null), P('barrier-e', 'barrier', 31, 22, 1, 2, null),
];

/** Ground-level blocked tiles beyond walls: sea, void and pools; props add their own rects. */
export function tileBlocked(x: number, y: number, gateOpen = false): boolean {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const w = wallAt(x, y);
  if (w) return !(w.door || (w.gate === 'main' && gateOpen));
  const f = floors[y][x];
  if (f === 'sea' || f === 'void') return true;
  if (f === 'road' && (x < 4 || x > 30)) return true;
  return false;
}

/** Light domain at a world point: the room interior it is in, or null for open ground. */
export function domainAt(px: number, py: number): RoomId | null {
  const x = Math.floor(px / T), y = Math.floor(py / T);
  if (!(x >= 0 && y >= 0 && x < W && y < H)) return null;
  return roomAt[y][x];
}
export function inRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }) {
  return px >= r.x * T && py >= r.y * T && px < (r.x + r.w) * T && py < (r.y + r.h) * T;
}

export interface Walker { id: string; who: string; look: string; path: [number, number][]; speed: number; pause: number }
/** Ambient residents of the station (mutual-aid group): looping errands, no interaction. */
export const WALKERS: Walker[] = [
  { id: 'bucket', who: '互助会', look: 'resident-a', path: [[13.5, 8.3], [14.2, 9.4], [14.2, 12.4], [18.6, 12.4], [18.6, 15.6], [14.2, 15.6], [10.4, 15.6], [10.4, 9.4]], speed: 34, pause: 2.2 },
  { id: 'porter', who: '互助会', look: 'resident-b', path: [[22.4, 9.4], [22.4, 15.8], [24.2, 17.6], [27.6, 17.8], [24.2, 17.6], [22.4, 15.8]], speed: 30, pause: 3 },
];
export interface Sitter { id: string; look: string; x: number; y: number; dir: 's' | 'n' | 'e' | 'w'; pose: 'sit' | 'idle' | 'warm' | 'smoke'; room: RoomId | null }
export const SITTERS: Sitter[] = [
  { id: 'eater-a', look: 'resident-c', x: 10.4 * T, y: 3.9 * T, dir: 's', pose: 'sit', room: 'canteen' },
  { id: 'eater-b', look: 'resident-d', x: 12.2 * T, y: 5.9 * T, dir: 's', pose: 'sit', room: 'canteen' },
  { id: 'warm-a', look: 'resident-e', x: 20.4 * T, y: 18.7 * T, dir: 'e', pose: 'warm', room: null },
  { id: 'warm-b', look: 'resident-f', x: 21.6 * T, y: 19.6 * T, dir: 'n', pose: 'warm', room: null },
  { id: 'boatman', look: 'boatman', x: 5.4 * T, y: 24.9 * T, dir: 's', pose: 'smoke', room: null },
];
