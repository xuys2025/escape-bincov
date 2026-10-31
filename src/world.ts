/** All world positions are pixels. Art and collision share this hand-authored tile map. */
export const TILE = 32;
export const COLS = 72;
export const ROWS = 52;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export interface Point { x: number; y: number }
export interface Building { x: number; y: number; w: number; h: number; name: string; kind: string }
export interface Zone extends Building { sub: string }
export interface Exit extends Point { id: string; name: string }
export interface Note extends Point { title: string; text: string }
export interface GroundLoot extends Point { id: string; qty: number }
export interface CrateConfig extends Point { id: string; name: string; items: { id: string; qty: number }[] }
export interface MapData {
  tiles: number[][];
  buildings: Building[];
  zones: Zone[];
  spawns: Point[];
  exits: Exit[];
  lootSpots: Point[];
  enemySpots: Point[];
  notes: Note[];
}
export interface RunConfig {
  seed: number;
  duration: 600;
  tideAt: 300;
  warningAt: 270;
  initialHigh: boolean;
  spawn: Point;
  exits: Exit[];
  enemies: (Point & { id: string })[];
  loot: GroundLoot[];
  containers: CrateConfig[];
}

const center = (x: number, y: number): Point => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });

export function createWorld(): MapData {
  const tiles: number[][] = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) =>
    x === 0 || y === 0 || y === ROWS - 1 || x >= 65 ? 2 : 0));
  const buildings: Building[] = [];
  const lootSpots: Point[] = [];
  const rect = (x: number, y: number, w: number, h: number, tile: number) => {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) tiles[row][col] = tile;
  };
  const road = (x: number, y: number, w: number, h: number) => rect(x, y, w, h, 1);
  // Four raised streets form a permanent evacuation network around the floodplain.
  road(5, 2, 3, 48);
  road(33, 3, 3, 47);
  road(45, 3, 3, 47);
  road(59, 3, 4, 47);
  road(5, 3, 58, 3);
  road(5, 23, 58, 3);
  road(5, 43, 58, 3);
  road(5, 48, 58, 2);
  // An abandoned drainage basin: shallow crossings open at low tide.
  rect(37, 34, 8, 6, 2);
  rect(48, 34, 11, 6, 2);
  rect(37, 36, 8, 2, 4);
  rect(48, 36, 11, 2, 4);
  // Old harbor: a raised spine remains accessible in either tide.
  rect(63, 26, 8, 8, 2);
  rect(62, 28, 9, 3, 6);
  rect(64, 26, 6, 2, 4);
  rect(64, 31, 6, 3, 4);
  // Red-tide pools along the sea wall, with the seawall street untouched.
  rect(63, 8, 2, 11, 4);
  rect(63, 41, 2, 8, 4);

  const house = (x: number, y: number, w: number, h: number, name: string, kind: string, northDoor = false) => {
    rect(x, y, w, h, 3);
    rect(x + 1, y + 1, w - 2, h - 2, 5);
    const door = x + Math.floor(w / 2) - 1;
    rect(door, y + h - 1, 2, 1, 5);
    if (northDoor) rect(door, y, 2, 1, 5);
    buildings.push({ x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE, name, kind });
    lootSpots.push(center(x + 1, y + 1), center(x + w - 2, y + 1), center(x + w - 2, y + h - 2));
  };
  // Village courtyards open onto two broad alleys rather than a random maze.
  road(8, 13, 25, 2);
  road(19, 6, 2, 17);
  house(10, 7, 7, 5, '褪色居民楼', 'home');
  house(23, 7, 8, 5, '船工宿舍', 'home');
  house(10, 16, 7, 6, '海声修理铺', 'workshop', true);
  house(23, 16, 8, 6, '停业杂货铺', 'shop', true);
  // Market has a navigable internal aisle and individual stalls.
  road(8, 33, 25, 2);
  house(10, 27, 9, 5, '南湾冰鲜', 'market');
  house(22, 27, 9, 5, '滨禾水产', 'market');
  house(10, 36, 9, 6, '空置冷库', 'warehouse', true);
  house(22, 36, 9, 6, '旧交易厅', 'market', true);
  // Inland buffer and the observation compound.
  house(38, 8, 6, 8, '废弃配电所', 'utility', true);
  house(49, 8, 9, 9, '潮汐观测站', 'observatory', true);
  house(49, 19, 7, 4, '封存样本室', 'laboratory');
  house(38, 27, 6, 6, '泵站值班室', 'utility', true);
  // Harbor sheds, inland pump house and the starting fisheries station.
  house(49, 27, 9, 6, '旧渔港船务所', 'harbor', true);
  house(49, 40, 9, 8, '海堤泵房', 'pump', true);
  house(10, 46, 12, 4, '滨科夫水产站', 'shelter', true);
  // Quay and courtyard caches. Flooded caches contain extra valuables.
  for (const [x, y] of [
    [3, 5], [3, 12], [3, 20], [3, 29], [3, 40], [8, 45], [26, 46], [29, 47],
    [18, 8], [21, 11], [18, 18], [21, 21], [9, 32], [20, 29], [20, 39], [32, 41],
    [37, 5], [41, 18], [38, 21], [43, 26], [38, 41], [43, 42], [40, 46], [44, 48],
    [49, 6], [55, 6], [58, 12], [57, 20], [51, 24], [57, 24], [58, 28], [58, 32],
    [60, 19], [62, 22], [60, 33], [62, 39], [60, 46], [64, 29], [67, 29], [70, 29],
    [65, 26], [68, 27], [65, 32], [68, 33], [39, 36], [42, 37], [50, 36], [55, 37],
    [63, 10], [64, 15], [63, 43], [64, 47], [32, 7], [32, 19], [9, 24], [28, 24],
  ]) lootSpots.push(center(x, y));
  const enemySpots = [
    [12, 13], [25, 13], [20, 18], [28, 22], [9, 9], [31, 8], [14, 24], [28, 24],
    [12, 33], [27, 33], [20, 36], [32, 38], [18, 42], [29, 46], [38, 19], [43, 21],
    [39, 26], [42, 41], [37, 46], [43, 47], [49, 6], [56, 6], [50, 17], [58, 20],
    [51, 24], [58, 27], [50, 30], [57, 33], [61, 35], [65, 29], [68, 29], [61, 20],
    [61, 10], [52, 49], [58, 43], [50, 45], [57, 49], [61, 47], [32, 17], [9, 40],
  ].map(([x, y]) => center(x, y));
  const zone = (x: number, y: number, w: number, h: number, name: string, sub: string): Zone => ({
    x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE, name, sub, kind: 'district',
  });
  return {
    tiles, buildings, lootSpots, enemySpots,
    zones: [
      zone(9, 6, 23, 17, '城中村巷道', '沿巷道搜索，留意拐角'),
      zone(9, 26, 23, 17, '水产市场', '市场里留有水产站的维修物资'),
      zone(48, 6, 11, 17, '潮汐观测站', '赤潮样本封存在站内'),
      zone(48, 26, 23, 8, '旧渔港', '去船务所找港口船册'),
      zone(48, 39, 11, 9, '海堤泵房', '沿海堤可避开被淹的浅滩'),
    ],
    spawns: [center(6, 47), center(6, 38), center(6, 20)],
    exits: [
      { ...center(6, 3), id: 'north', name: '北线检查口' },
      { ...center(6, 48), id: 'station', name: '水产站接应点' },
      { ...center(61, 48), id: 'seawall', name: '南堤信号灯' },
    ],
    notes: [
      { ...center(8, 46), title: '水产站维修单', text: '小蔡在水产市场留了备用物资：泵机零件三个、绝缘线圈两卷、陶瓷保险管一支。拿齐了就回来修电源。' },
      { ...center(20, 33), title: '市场停业告示', text: '即日起停止收购、出售红色贝类。冷柜内如有敲击声，请离开，不要开柜。——滨科夫县水产联络处' },
      { ...center(53, 17), title: '观测站记录', text: '今天的潮峰又比预报晚了三十秒。退潮时，传感器录到一段像心跳的声音。样本已封存，等人来取。' },
      { ...center(58, 30), title: '港口值班笔记', text: '第七艘船每天回港，船主那栏却一直空着。船册先别销毁，带回水产站交给许医生。' },
      { ...center(58, 45), title: '泵房便笺', text: '海堤主路高于警戒潮位。低地淹了就沿路灯走，别踩发红的水。' },
    ],
  };
}

export const WORLD = createWorld();

export function isWalkable(x: number, y: number, highTide = false, radius = 10): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false;
  const minX = Math.floor((x - radius) / TILE), maxX = Math.floor((x + radius) / TILE);
  const minY = Math.floor((y - radius) / TILE), maxY = Math.floor((y + radius) / TILE);
  for (let row = minY; row <= maxY; row++) for (let col = minX; col <= maxX; col++) {
    const tile = WORLD.tiles[row]?.[col];
    if (tile === undefined || tile === 2 || tile === 3 || (highTide && tile === 4)) return false;
  }
  return true;
}

/** Breadth-first search on permanent tile centers; no diagonal corner cutting. */
export function findPath(from: Point, to: Point, highTide = false): Point[] {
  const sx = Math.floor(from.x / TILE), sy = Math.floor(from.y / TILE);
  const tx = Math.floor(to.x / TILE), ty = Math.floor(to.y / TILE);
  if (!isWalkable(sx * TILE + 16, sy * TILE + 16, highTide) || !isWalkable(tx * TILE + 16, ty * TILE + 16, highTide)) return [];
  const start = sy * COLS + sx, goal = ty * COLS + tx;
  const parent = new Int32Array(COLS * ROWS).fill(-1);
  const queue = new Int32Array(COLS * ROWS);
  let read = 0, write = 1;
  queue[0] = start;
  parent[start] = start;
  while (read < write) {
    const current = queue[read++];
    if (current === goal) {
      const result: Point[] = [];
      let at = goal;
      while (at !== start) { result.push(center(at % COLS, Math.floor(at / COLS))); at = parent[at]; }
      result.push(center(sx, sy));
      return result.reverse();
    }
    const x = current % COLS, y = Math.floor(current / COLS);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, next = ny * COLS + nx;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || parent[next] !== -1) continue;
      if (!isWalkable(nx * TILE + 16, ny * TILE + 16, highTide)) continue;
      parent[next] = current;
      queue[write++] = next;
    }
  }
  return [];
}

/** Nearest high-tide refuge reachable by the low-tide route, for tide transitions. */
export function findDryRefuge(from: Point): Point | null {
  if (!isWalkable(from.x, from.y, false)) return null;
  if (isWalkable(from.x, from.y, true)) return { ...from };
  const sx = Math.floor(from.x / TILE), sy = Math.floor(from.y / TILE);
  const queue: Point[] = [center(sx, sy)];
  const visited = new Set<number>([sy * COLS + sx]);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (isWalkable(point.x, point.y, true)) return point;
    const x = Math.floor(point.x / TILE), y = Math.floor(point.y / TILE);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, key = ny * COLS + nx;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || visited.has(key)) continue;
      visited.add(key);
      const next = center(nx, ny);
      if (isWalkable(next.x, next.y, false)) queue.push(next);
    }
  }
  return null;
}

/** radius=0 checks sight; radius=10 checks a body's straight movement corridor. */
export function lineOfSight(a: Point, b: Point, highTide = false, radius = 0): boolean {
  if (![a.x, a.y, b.x, b.y, radius].every(Number.isFinite) || radius < 0) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isWalkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, highTide, radius)) return false;
  }
  return true;
}

export function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'number') return Number.isFinite(seed) ? seed >>> 0 : 1;
  // Entering a numeric seed displayed in a run report must reproduce that run.
  if (/^\d+$/.test(seed.trim()) && Number.isSafeInteger(Number(seed))) return Number(seed) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

/** Original run generation, before grouping: random calls and item positions stay stable. */
export function generateRunBase(seed: number | string): Omit<RunConfig, 'containers'> {
  const normalized = normalizeSeed(seed);
  let state = normalized;
  const random = () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = <T>(source: T[]) => {
    const values = [...source];
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  const spawn = { ...WORLD.spawns[Math.floor(random() * WORLD.spawns.length)] };
  const exits = shuffled(WORLD.exits).slice(0, 2).map(exit => ({ ...exit }));
  const initialHigh = random() < 0.5;
  const enemyPositions = shuffled(WORLD.enemySpots.filter(p => Math.hypot(p.x - spawn.x, p.y - spawn.y) > 240));
  const enemies = enemyPositions.slice(0, 23).map((p, i) => ({ ...p, id: i % 5 === 0 ? 'creature' : i % 3 === 0 ? 'salt' : 'scav' }));
  // Two guaranteed guards protect the sample and the ship register.
  enemies.push({ ...center(54, 12), id: 'elite' }, { ...center(54, 30), id: 'elite' });
  const items = ['scrap', 'wire', 'bandage', 'ammo9', 'water', 'food', 'shell', 'ammoR', 'fuse', 'battery', 'medkit', 'antidote', 'watch', 'pearl', 'pistol', 'shotgun', 'carbine'];
  const weighted = [0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const loot = shuffled(WORLD.lootSpots).slice(0, 58).map(p => {
    const tideTile = WORLD.tiles[Math.floor(p.y / TILE)][Math.floor(p.x / TILE)] === 4;
    const id = tideTile && random() < 0.6 ? (random() < 0.5 ? 'pearl' : 'watch') : items[weighted[Math.floor(random() * weighted.length)]];
    const qty = id === 'ammo9' ? 6 + Math.floor(random() * 7) : id === 'ammoR' ? 4 + Math.floor(random() * 5) : id === 'shell' ? 2 + Math.floor(random() * 3) : ['scrap', 'wire'].includes(id) ? 1 + Math.floor(random() * 2) : 1;
    return { ...p, id, qty };
  });
  loot.push({ ...center(52, 10), id: 'sample', qty: 1 }, { ...center(51, 29), id: 'ledger', qty: 1 });
  return { seed: normalized, duration: 600, tideAt: 300, warningAt: 270, initialHigh, spawn, exits, enemies, loot };
}

/** Group existing nearby supplies without rolling, adding, or discarding any loot. */
export function partitionRunLoot(entries: readonly GroundLoot[], maxContainers = 10): Pick<RunConfig, 'loot' | 'containers'> {
  const zones = entries.map(p => WORLD.zones.findIndex(z => p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h));
  const eligible = entries.map((p, i) => zones[i] >= 0 && p.id !== 'sample' && p.id !== 'ledger'
    && isWalkable(p.x, p.y, true)
    && WORLD.exits.every(exit => Math.hypot(exit.x - p.x, exit.y - p.y) >= 48)
    && WORLD.notes.every(note => Math.hypot(note.x - p.x, note.y - p.y) >= 43));
  const used = new Set<number>();
  const containers: CrateConfig[] = [];
  for (let anchor = 0; anchor < entries.length && containers.length < maxContainers; anchor++) {
    if (!eligible[anchor] || used.has(anchor)) continue;
    const point = entries[anchor];
    // One bounded breadth-first search per anchor measures the actual permanent route.
    const tileKey = (p: Point) => Math.floor(p.y / TILE) * COLS + Math.floor(p.x / TILE);
    const distances = new Map<number, number>([[tileKey(point), 0]]);
    const queue = [center(Math.floor(point.x / TILE), Math.floor(point.y / TILE))];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i], steps = distances.get(tileKey(current))!;
      if (steps === 6) continue;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const next = { x: current.x + dx * TILE, y: current.y + dy * TILE }, key = tileKey(next);
        if (distances.has(key) || !isWalkable(next.x, next.y, true)) continue;
        distances.set(key, steps + 1);
        queue.push(next);
      }
    }
    const partners = entries.map((p, i) => ({ index: i, point: p, steps: distances.get(tileKey(p)) }))
      .filter(p => p.index > anchor && eligible[p.index] && !used.has(p.index) && zones[p.index] === zones[anchor] && p.steps !== undefined)
      .sort((a, b) => a.steps! - b.steps! || a.point.x - b.point.x || a.point.y - b.point.y || a.index - b.index);
    const partner = partners[0];
    if (!partner) continue;
    used.add(anchor);
    used.add(partner.index);
    containers.push({ id: `crate-${anchor}`, name: `${WORLD.zones[zones[anchor]].name}物资箱`, x: point.x, y: point.y,
      items: [point, partner.point].map(({ id, qty }) => ({ id, qty })) });
  }
  return { loot: entries.filter((_p, i) => !used.has(i)).map(p => ({ ...p })), containers };
}

export function generateRun(seed: number | string): RunConfig {
  const run = generateRunBase(seed);
  return { ...run, ...partitionRunLoot(run.loot) };
}
