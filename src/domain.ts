/** Pure game rules. No renderer, browser globals, or wall-clock timers are required. */
export type ItemKind = 'weapon' | 'ammo' | 'medical' | 'food' | 'part' | 'valuable' | 'quest' | 'accessory';
export interface ItemDef {
  id: string; name: string; short: string; w: number; h: number; weight: number;
  stack: number; buy: number; sell: number; kind: ItemKind; description: string; color: number;
}
export interface WeaponDef {
  id: string; name: string; ammo: string | null; magazine: number; damage: number;
  range: number; cooldown: number; reload: number; pellets: number; spread: number;
}
export interface EnemyDef {
  id: string; name: string; hp: number; speed: number; damage: number; range: number;
  vision: number; cooldown: number; color: number;
}
export interface LootEntry { id: string; weight: number; min: number; max: number }
export type LootTable = LootEntry[];
export interface Item { uid: string; id: string; qty: number; x: number; y: number; relief?: boolean; rotated?: boolean }
export interface Inventory { w: number; h: number; items: Item[] }
/** ammo is the total loaded count; ammoRelief is its unsellable subset. */
export interface Magazine { ammo: number; ammoRelief: number }
export interface Equipment extends Magazine { weapon: string | null; relief: boolean }
export type Outcome = 'extract' | 'death' | 'timeout';
export interface RunSummary {
  outcome: Outcome; kills: number; keptValue: number; lostValue: number; message: string;
  seed: number; recovered: boolean;
}
export interface SaveDataV1 {
  version: 2; cash: number; stash: Inventory; bag: Inventory; safe: Inventory;
  equipment: Equipment; quests: Record<string, boolean>;
  upgraded: boolean; settings: { volume: number }; stats: { runs: number; extracts: number; kills: number };
  activeRun: null | { seed: number; runId?: string }; lastResult?: RunSummary;
  /** Undelivered relief supplies stay at the hideout; they never enter a raid automatically. */
  reliefSupplies?: { id: string; qty: number }[];
}
export interface RunLoadout extends Equipment { bag: Inventory; safe: Inventory; runId?: string }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

const item = (id: string, name: string, short: string, w: number, h: number, weight: number,
  stack: number, buy: number, sell: number, kind: ItemKind, description: string, color: number): ItemDef =>
  ({ id, name, short, w, h, weight, stack, buy, sell, kind, description, color });

export const ITEMS: Record<string, ItemDef> = {
  knife: item('knife', '水手匕首', '匕首', 1, 2, 0.35, 1, 0, 0, 'weapon', '随身携带的旧匕首。撤离失败也不会丢失。', 0xb4c3bf),
  pistol: item('pistol', '旧式手枪', '手枪', 2, 1, 0.8, 1, 320, 150, 'weapon', '使用 9 毫米弹，弹匣容量 8 发。适合近距离交火。', 0xa7aaa0),
  shotgun: item('shotgun', '双管霰弹枪', '双管', 3, 1, 2.7, 1, 780, 370, 'weapon', '使用霰弹，可装填 2 发。近距离更容易让多枚弹丸命中。', 0xc58458),
  carbine: item('carbine', '半自动卡宾枪', '卡宾', 3, 1, 2.4, 1, 1200, 580, 'weapon', '使用卡宾枪弹，弹匣容量 12 发。适合远距离点射。', 0x929e78),
  ammo9: item('ammo9', '9 毫米弹', '9mm', 1, 1, 0.012, 40, 7, 3, 'ammo', '旧式手枪用弹药。商店按包出售，背包数量按发计算。', 0xcba96c),
  shell: item('shell', '霰弹', '霰弹', 1, 1, 0.045, 20, 16, 7, 'ammo', '双管霰弹枪用弹药。', 0xc76650),
  ammoR: item('ammoR', '卡宾枪弹', '卡宾弹', 1, 1, 0.022, 30, 12, 5, 'ammo', '半自动卡宾枪用弹药。', 0xcbbd88),
  bandage: item('bandage', '密封绷带', '绷带', 1, 1, 0.12, 4, 45, 18, 'medical', '止血，恢复 16 点生命。', 0xdad9bd),
  medkit: item('medkit', '急救包', '急救包', 2, 1, 0.65, 2, 160, 65, 'medical', '恢复 55 点生命并止血。', 0xc96959),
  antidote: item('antidote', '除藻药剂', '除藻剂', 1, 1, 0.2, 3, 120, 50, 'medical', '降低 55 点污染。', 0x8bb4a0),
  water: item('water', '净水瓶', '净水', 1, 2, 0.6, 2, 35, 14, 'food', '恢复全部耐力，降低 12 点污染。', 0x83a9ba),
  food: item('food', '鱼松罐头', '罐头', 1, 1, 0.3, 3, 50, 20, 'food', '恢复 12 点生命和 50 点耐力。', 0xcbaa76),
  cloth: item('cloth', '清洁布料', '布料', 1, 1, 0.1, 10, 15, 5, 'part', '制作绷带所需的清洁布料。', 0xcac5ae),
  analgesic: item('analgesic', '镇痛片', '镇痛', 1, 1, .05, 3, 80, 30, 'medical', '镇痛180秒，暂时压制疼痛。不能止血或恢复生命。', 0xd5c7aa),
  focus: item('focus', '专注剂', '专注', 1, 1, .1, 2, 140, 50, 'medical', '专注120秒，随机爆头概率增加5个百分点。', 0xb0cdb7),
  strengthDose: item('strengthDose', '力量强化针剂', '力量针', 1, 1, .1, 1, 0, 150, 'medical', '力量临时增加5，持续180秒；结束后疲劳120秒。', 0xc99569),
  constitutionDose: item('constitutionDose', '体质强化针剂', '体质针', 1, 1, .1, 1, 0, 150, 'medical', '体质临时增加5，持续180秒；结束后疲劳120秒。', 0x9fac72),
  techniqueDose: item('techniqueDose', '技巧强化针剂', '技巧针', 1, 1, .1, 1, 0, 150, 'medical', '技巧临时增加5，持续180秒；结束后疲劳120秒。', 0x8eb7bb),
  luckyCharm: item('luckyCharm', '旧护身符', '护身符', 1, 1, .05, 1, 0, 80, 'accessory', '戴上后，近来似乎更顺利。', 0xc1b48a),
  unluckyCharm: item('unluckyCharm', '破损护符', '残护符', 1, 1, .05, 1, 0, 80, 'accessory', '戴上后，总觉得有些不安。', 0x9c8275),
  luckySachet: item('luckySachet', '旧香包', '香包', 1, 1, .05, 1, 0, 40, 'medical', '使用后，一阵熟悉的香气让人安心。效果持续300秒。', 0xc3b192),
  unluckySachet: item('unluckySachet', '潮湿香包', '潮香包', 1, 1, .05, 1, 0, 40, 'medical', '使用后，一股潮湿的气味挥之不去。效果持续300秒。', 0x929b89),
  scrap: item('scrap', '泵机零件', '零件', 1, 1, 0.55, 5, 85, 35, 'part', '水产站维修用零件，共需 3 个。泵壳上还留着盐渍。', 0x9caaa0),
  wire: item('wire', '绝缘线圈', '线圈', 1, 1, 0.25, 5, 65, 28, 'part', '水产站维修用线圈，共需 2 卷。铜芯还完好。', 0xbf8054),
  fuse: item('fuse', '陶瓷保险管', '保险管', 1, 1, 0.1, 4, 100, 45, 'part', '水产站维修用保险管，共需 1 支。', 0xd0c5a1),
  battery: item('battery', '观测仪电池', '电池', 1, 2, 0.8, 2, 160, 75, 'part', '潮汐观测站的备用电池，还剩一些电。可出售。', 0xa99a5e),
  watch: item('watch', '防水怀表', '怀表', 1, 1, 0.15, 2, 0, 240, 'valuable', '指针停在 03:17。表壳完好，可以卖个好价钱。', 0xccaa69),
  pearl: item('pearl', '雾色海珠', '海珠', 1, 1, 0.08, 3, 0, 360, 'valuable', '表面像蒙着一层雾，离水后仍泛着微光。可出售。', 0xb0cec0),
  sample: item('sample', '赤潮封存样本', '样本', 1, 1, 0.25, 1, 0, 100, 'quest', '潮汐观测站封存的赤潮样本，用于任务「瓶中的潮声」。', 0xc26654),
  ledger: item('ledger', '港口船册', '船册', 2, 1, 0.45, 1, 0, 130, 'quest', '旧渔港的值班船册，用于任务「未归的第七艘船」。', 0xd2c396),
};

/** Distances are world pixels; cooldown/reload are seconds; spread is radians. */
export const WEAPONS: Record<string, WeaponDef> = {
  knife: { id: 'knife', name: '水手匕首', ammo: null, magazine: 0, damage: 30, range: 48, cooldown: 0.46, reload: 0, pellets: 1, spread: 0 },
  pistol: { id: 'pistol', name: '旧式手枪', ammo: 'ammo9', magazine: 8, damage: 27, range: 440, cooldown: 0.29, reload: 1.25, pellets: 1, spread: 0.07 },
  shotgun: { id: 'shotgun', name: '双管霰弹枪', ammo: 'shell', magazine: 2, damage: 15, range: 290, cooldown: 0.72, reload: 1.9, pellets: 6, spread: 0.27 },
  carbine: { id: 'carbine', name: '半自动卡宾枪', ammo: 'ammoR', magazine: 12, damage: 39, range: 660, cooldown: 0.24, reload: 1.65, pellets: 1, spread: 0.035 },
};
export const ENEMIES: Record<string, EnemyDef> = {
  scav: { id: 'scav', name: '拾荒者', hp: 56, speed: 69, damage: 11, range: 30, vision: 220, cooldown: 0.9, color: 0xab9370 },
  salt: { id: 'salt', name: '盐枭', hp: 76, speed: 56, damage: 12, range: 270, vision: 300, cooldown: 1.2, color: 0xbc7859 },
  creature: { id: 'creature', name: '潮蚀生物', hp: 38, speed: 105, damage: 8, range: 26, vision: 245, cooldown: 0.7, color: 0x83a78b },
  elite: { id: 'elite', name: '守潮人', hp: 190, speed: 49, damage: 20, range: 340, vision: 350, cooldown: 1.15, color: 0xb45245 },
};
export const LOOT_TABLE: LootTable = [
  { id: 'ammo9', weight: 14, min: 6, max: 18 }, { id: 'shell', weight: 6, min: 2, max: 6 },
  { id: 'ammoR', weight: 7, min: 4, max: 12 }, { id: 'bandage', weight: 12, min: 1, max: 2 },
  { id: 'medkit', weight: 5, min: 1, max: 1 }, { id: 'antidote', weight: 6, min: 1, max: 1 },
  { id: 'water', weight: 8, min: 1, max: 1 }, { id: 'food', weight: 9, min: 1, max: 2 },
  { id: 'scrap', weight: 11, min: 1, max: 2 }, { id: 'wire', weight: 10, min: 1, max: 2 },
  { id: 'fuse', weight: 8, min: 1, max: 1 }, { id: 'battery', weight: 6, min: 1, max: 1 },
  { id: 'watch', weight: 4, min: 1, max: 1 }, { id: 'pearl', weight: 2, min: 1, max: 1 },
  { id: 'pistol', weight: 2, min: 1, max: 1 }, { id: 'shotgun', weight: 1, min: 1, max: 1 },
];
export const MERCHANTS: Record<'arms' | 'med', { name: string; subtitle: string; stock: string[] }> = {
  arms: { name: '老栓', subtitle: '武器 · 零件', stock: ['pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'scrap', 'wire', 'fuse', 'battery'] },
  med: { name: '许医生', subtitle: '医疗用品 · 食品', stock: ['bandage', 'medkit', 'antidote', 'water', 'food'] },
};
export const QUESTS: Record<string, { name: string; description: string; needs: Record<string, number>; reward: number; radio: string }> = {
  repair: { name: '让灯亮起来', description: '找齐维修物资，恢复水产站供电。完成后可扩建仓库。', needs: { scrap: 3, wire: 2, fuse: 1 }, reward: 420, radio: '电台通了，灯也稳了。仓库可以扩建了。' },
  sample: { name: '瓶中的潮声', description: '从潮汐观测站带回一份赤潮封存样本。', needs: { sample: 1 }, reward: 650, radio: '样本收到了。瓶里的水面比外海提前三十秒上涨。先别开封。' },
  ledger: { name: '未归的第七艘船', description: '从旧渔港带回港口船册。', needs: { ledger: 1 }, reward: 800, radio: '船册上记了七艘船，码头却只有六个泊位。第七艘还得再查。' },
};
export const SAVE_KEY = 'escape-bincov.save.v1';
export const STASH_UPGRADE_COST = 600;
let serial = 0;
const uid = () => `bc-${Date.now().toString(36)}-${(++serial).toString(36)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const integer = (value: unknown, fallback = 0, max = 1e9): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const isGun = (id: unknown): id is string => typeof id === 'string' && id !== 'knife' && Object.hasOwn(WEAPONS, id);
function cleanMagazine(weaponId: unknown, current: unknown, relief: unknown): Magazine {
  const ammo = isGun(weaponId) ? integer(current, 0, WEAPONS[weaponId].magazine) : 0;
  return { ammo, ammoRelief: integer(relief, 0, ammo) };
}
const emptyEquipment = (): Equipment => ({ weapon: null, relief: false, ammo: 0, ammoRelief: 0 });

export function createInventory(w: number, h: number): Inventory {
  return { w: Math.max(1, integer(w, 1, 30)), h: Math.max(1, integer(h, 1, 30)), items: [] };
}
export function itemSize(item: Pick<Item, 'id' | 'rotated'>) {
  const d = ITEMS[item.id];
  return item.rotated ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}
export function fits(inv: Inventory, id: string, x: number, y: number, ignoreUid?: string, rotated = false): boolean {
  const def = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!def) return false;
  const size = itemSize({ id, rotated });
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + size.w > inv.w || y + size.h > inv.h) return false;
  return inv.items.every(other => {
    if (other.uid === ignoreUid) return true;
    const d = itemSize(other);
    return x + size.w <= other.x || x >= other.x + d.w || y + size.h <= other.y || y >= other.y + d.h;
  });
}
function space(inv: Inventory, id: string, rotated = false, autoRotate = true): { x: number; y: number; rotated?: boolean } | null {
  const orientations = autoRotate && ITEMS[id].w !== ITEMS[id].h ? [rotated, !rotated] : [rotated];
  for (const direction of orientations) for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++)
    if (fits(inv, id, x, y, undefined, direction)) return { x, y, ...(direction ? { rotated: true } : {}) };
  return null;
}
export function addItem(inv: Inventory, id: string, qty = 1, relief = false, rotated = false, autoRotate = true, allocate = uid): number {
  let left = integer(qty);
  const def = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!def) return left;
  for (const existing of inv.items) {
    if (existing.id !== id || !!existing.relief !== relief) continue;
    const take = Math.min(left, def.stack - existing.qty);
    existing.qty += take;
    left -= take;
    if (!left) return 0;
  }
  while (left > 0) {
    const pos = space(inv, id, rotated, autoRotate);
    if (!pos) break;
    const take = Math.min(left, def.stack);
    inv.items.push({ uid: allocate(), id, qty: take, ...pos, ...(relief ? { relief: true } : {}) });
    left -= take;
  }
  return left;
}
export function moveItem(inv: Inventory, itemUid: string, x: number, y: number, rotated?: boolean): boolean {
  const selected = inv.items.find(i => i.uid === itemUid);
  if (!selected) return false;
  const direction = rotated ?? !!selected.rotated;
  if (fits(inv, selected.id, x, y, itemUid, direction)) { selected.x = x; selected.y = y; if (direction) selected.rotated = true; else delete selected.rotated; return true; }
  const target = inv.items.find(i => i.uid !== itemUid && i.x === x && i.y === y);
  if (target && target.id === selected.id && !!target.relief === !!selected.relief && target.qty + selected.qty <= ITEMS[target.id].stack) {
    target.qty += selected.qty;
    inv.items.splice(inv.items.indexOf(selected), 1);
    return true;
  }
  return false;
}
export function rotateItem(inv: Inventory, itemUid: string): boolean {
  const item = inv.items.find(i => i.uid === itemUid);
  return !!item && ITEMS[item.id].w !== ITEMS[item.id].h && moveItem(inv, itemUid, item.x, item.y, !item.rotated);
}
export function transferItem(from: Inventory, to: Inventory, itemUid: string, x?: number, y?: number): boolean {
  const selected = from.items.find(i => i.uid === itemUid);
  if (!selected) return false;
  if (from === to) return x !== undefined && y !== undefined && moveItem(from, itemUid, x, y);
  const trial = clone(to);
  if (x !== undefined && y !== undefined) {
    if (fits(trial, selected.id, x, y, undefined, !!selected.rotated)) trial.items.push({ ...selected, x, y });
    else {
      const target = trial.items.find(i => i.x === x && i.y === y);
      if (!target || target.id !== selected.id || !!target.relief !== !!selected.relief || target.qty + selected.qty > ITEMS[target.id].stack) return false;
      target.qty += selected.qty;
    }
  } else if (addItem(trial, selected.id, selected.qty, !!selected.relief, !!selected.rotated) > 0) return false;
  to.items = trial.items;
  from.items.splice(from.items.indexOf(selected), 1);
  return true;
}
export const count = (inv: Inventory, id: string): number => inv.items.reduce((sum, i) => sum + (i.id === id ? i.qty : 0), 0);
export const weight = (inv: Inventory): number => Math.round(inv.items.reduce((sum, i) => sum + ITEMS[i.id].weight * i.qty, 0) * 1000) / 1000;
export function removeItem(inv: Inventory, id: string, qty: number): boolean {
  if (!Number.isInteger(qty) || qty < 0 || count(inv, id) < qty) return false;
  let left = qty;
  for (const existing of inv.items) {
    if (existing.id !== id) continue;
    const take = Math.min(existing.qty, left);
    existing.qty -= take;
    left -= take;
    if (!left) break;
  }
  inv.items = inv.items.filter(i => i.qty > 0);
  return true;
}
export function newSave(): SaveDataV1 {
  const save: SaveDataV1 = {
    version: 2, cash: 700, stash: createInventory(10, 6), bag: createInventory(6, 5), safe: createInventory(2, 2),
    equipment: { weapon: 'pistol', relief: false, ammo: 0, ammoRelief: 0 }, quests: { repair: false, sample: false, ledger: false },
    upgraded: false, settings: { volume: 0.35 }, stats: { runs: 0, extracts: 0, kills: 0 }, activeRun: null,
  };
  addItem(save.bag, 'ammo9', 32);
  addItem(save.bag, 'bandage', 2);
  addItem(save.bag, 'water');
  addItem(save.stash, 'medkit');
  addItem(save.stash, 'ammo9', 24);
  return save;
}
function cleanInventory(raw: unknown, w: number, h: number, used = new Set<string>(), allowRotation = true): Inventory {
  const inv = createInventory(w, h);
  const entries = isObject(raw) && Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
  for (const entry of entries.slice(0, 900)) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !Object.hasOwn(ITEMS, entry.id)) continue;
    const qty = integer(entry.qty ?? entry.quantity, 1, ITEMS[entry.id].stack * w * h);
    if (!qty) continue;
    if (qty <= ITEMS[entry.id].stack && fits(inv, entry.id, entry.x, entry.y, undefined, allowRotation && entry.rotated === true)) {
      let itemUid = typeof entry.uid === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(entry.uid) && !used.has(entry.uid) ? entry.uid : uid();
      while (used.has(itemUid)) itemUid = uid();
      used.add(itemUid);
      inv.items.push({ uid: itemUid, id: entry.id, qty, x: entry.x, y: entry.y, ...(entry.relief === true ? { relief: true } : {}), ...(allowRotation && typeof entry.rotated === 'boolean' ? { rotated: entry.rotated } : {}) });
    } else {
      const firstNewItem = inv.items.length;
      addItem(inv, entry.id, qty, entry.relief === true, allowRotation && entry.rotated === true, false);
      for (const added of inv.items.slice(firstNewItem)) {
        while (used.has(added.uid)) added.uid = uid();
        used.add(added.uid);
      }
    }
  }
  return inv;
}
export function migrateSave(raw: unknown): SaveDataV1 {
  if (!isObject(raw) || (raw.version !== undefined && ![0, 1, 2].includes(raw.version))) return newSave();
  const upgraded = raw.upgraded === true;
  const equipped = isObject(raw.equipment) ? raw.equipment : {};
  const quests = isObject(raw.quests) ? raw.quests : {};
  const stats = isObject(raw.stats) ? raw.stats : {};
  const settings = isObject(raw.settings) ? raw.settings : {};
  const used = new Set<string>();
  const save: SaveDataV1 = {
    version: 2, cash: integer(raw.cash, 0), stash: cleanInventory(raw.stash ?? raw.inventory, 10, upgraded ? 9 : 6, used, raw.version === 2),
    bag: cleanInventory(raw.bag, 6, 5, used, raw.version === 2), safe: cleanInventory(raw.safe, 2, 2, used, raw.version === 2),
    equipment: { weapon: isGun(equipped.weapon) ? equipped.weapon : null, relief: equipped.relief === true, ...cleanMagazine(equipped.weapon, equipped.ammo, equipped.ammoRelief) },
    quests: Object.fromEntries(Object.keys(QUESTS).map(key => [key, quests[key] === true])), upgraded,
    settings: { volume: typeof settings.volume === 'number' && Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : 0.35 },
    stats: { runs: integer(stats.runs), extracts: integer(stats.extracts), kills: integer(stats.kills) },
    activeRun: isObject(raw.activeRun) ? { seed: integer(raw.activeRun.seed, 1, 0xffffffff), ...(typeof raw.activeRun.runId === 'string' ? { runId: raw.activeRun.runId } : {}) } : null,
  };
  if (Array.isArray(raw.reliefSupplies)) {
    const pending = raw.reliefSupplies.filter(isObject);
    const supplies = ['ammo9', 'bandage'].map(id => ({ id, qty: Math.min(id === 'ammo9' ? 12 : 1, pending.reduce((sum, entry) => sum + (entry.id === id ? integer(entry.qty) : 0), 0)) })).filter(entry => entry.qty > 0);
    if (supplies.length) save.reliefSupplies = supplies;
  }
  if (isObject(raw.lastResult) && ['extract', 'death', 'timeout'].includes(raw.lastResult.outcome)) {
    save.lastResult = { outcome: raw.lastResult.outcome, kills: integer(raw.lastResult.kills), keptValue: integer(raw.lastResult.keptValue), lostValue: integer(raw.lastResult.lostValue), seed: integer(raw.lastResult.seed, 0, 0xffffffff), recovered: raw.lastResult.recovered === true, message: typeof raw.lastResult.message === 'string' ? raw.lastResult.message.slice(0, 500) : '' };
  }
  return save;
}
/** Storage failures are reported to the caller so a run cannot start without its commit. */
export function writeSave(storage: StorageLike, save: SaveDataV1): void { storage.setItem(SAVE_KEY, JSON.stringify(save)); }
export function readSave(storage: StorageLike): SaveDataV1 {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return newSave();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return newSave(); }
  return migrateSave(parsed);
}
export function beginRun(save: SaveDataV1, seed: number): RunLoadout {
  if (save.activeRun) throw new Error('上次行动尚未结算，暂时不能出击。');
  const runId = uid();
  const loadout: RunLoadout = { bag: clone(save.bag), safe: clone(save.safe), ...save.equipment, ...cleanMagazine(save.equipment.weapon, save.equipment.ammo, save.equipment.ammoRelief), runId };
  save.bag = createInventory(6, 5);
  save.equipment = emptyEquipment();
  save.activeRun = { seed: seed >>> 0, runId };
  save.stats.runs += 1;
  return loadout;
}
export function checkpointSafe(save: SaveDataV1, safe: Inventory, runId?: string): void {
  if (!save.activeRun || (runId !== undefined && save.activeRun.runId !== runId)) return;
  save.safe = cleanInventory(safe, 2, 2);
}
const inventoryValue = (inv: Inventory) => inv.items.reduce((sum, i) => sum + (i.relief ? 0 : ITEMS[i.id].sell * i.qty), 0);
export function settleRun(save: SaveDataV1, loadout: RunLoadout, outcome: Outcome, kills: number): RunSummary | null {
  if (!save.activeRun?.runId || save.activeRun.runId !== loadout.runId) return null;
  const magazine = cleanMagazine(loadout.weapon, loadout.ammo, loadout.ammoRelief);
  const ammoId = isGun(loadout.weapon) ? WEAPONS[loadout.weapon].ammo : null;
  const carriedValue = inventoryValue(loadout.bag) + (loadout.weapon && !loadout.relief ? ITEMS[loadout.weapon].sell : 0) + (ammoId ? (magazine.ammo - magazine.ammoRelief) * ITEMS[ammoId].sell : 0);
  save.safe = clone(loadout.safe);
  const summary: RunSummary = {
    outcome, kills: integer(kills), keptValue: inventoryValue(loadout.safe) + (outcome === 'extract' ? carriedValue : 0),
    lostValue: outcome === 'extract' ? 0 : carriedValue, seed: save.activeRun.seed, recovered: false,
    message: outcome === 'extract' ? '成功撤离，装备和物资已带回水产站。' : outcome === 'death' ? '撤离失败，背包物资和主武器丢失。安全箱内的物品和水手匕首保留。' : '撤离超时，背包物资和主武器丢失。安全箱内的物品和水手匕首保留。',
  };
  save.bag = outcome === 'extract' ? clone(loadout.bag) : createInventory(6, 5);
  save.equipment = outcome === 'extract' ? { weapon: loadout.weapon, relief: loadout.relief, ...magazine } : emptyEquipment();
  save.stats.kills += summary.kills;
  if (outcome === 'extract') save.stats.extracts++;
  save.activeRun = null;
  save.lastResult = summary;
  grantRelief(save);
  return summary;
}
export function recoverInterrupted(save: SaveDataV1): RunSummary | null {
  if (!save.activeRun) return null;
  const summary: RunSummary = { outcome: 'death', kills: 0, keptValue: inventoryValue(save.safe), lostValue: 0, seed: save.activeRun.seed, recovered: true, message: '上次行动中断，已按撤离失败处理。安全箱内的物品和水手匕首保留。' };
  save.bag = createInventory(6, 5);
  save.equipment = emptyEquipment();
  save.activeRun = null;
  save.lastResult = summary;
  grantRelief(save);
  return summary;
}
/**
 * Cash plus what the shop would pay for everything stored in the stash, bag and safe.
 * Relief goods are unsellable, and the copies an unfinished quest still needs are not counted
 * (the same quest needs that Shop.questUses / saleWarnings warn about, read from QUESTS here).
 * The equipped weapon and its magazine are left out: relief only asks this when that weapon is
 * absent or a relief gun with an empty magazine.
 * Value held in expansion state is not seen here either (an equipped charm, cash and items paid
 * into workbench batches, finished batches not yet collected): grantRelief only receives the main
 * save. This can only make relief more generous, never stricter than the old cash rule.
 */
export function liquidValue(save: SaveDataV1): number {
  const reserved = new Map<string, number>();
  for (const [key, quest] of Object.entries(QUESTS)) if (!save.quests[key])
    for (const [id, needed] of Object.entries(quest.needs)) reserved.set(id, (reserved.get(id) ?? 0) + needed);
  let value = save.cash;
  for (const inv of [save.stash, save.bag, save.safe]) for (const entry of inv.items) {
    if (entry.relief) continue;
    const kept = Math.min(entry.qty, reserved.get(entry.id) ?? 0);
    if (kept) reserved.set(entry.id, reserved.get(entry.id)! - kept);
    value += ITEMS[entry.id].sell * (entry.qty - kept);
  }
  return value;
}
/** Every gun the player owns at the hideout: the equipped one and those in the stash, bag and safe. */
const ownedGuns = (save: SaveDataV1): { id: string; relief: boolean }[] => [
  ...(isGun(save.equipment.weapon) ? [{ id: save.equipment.weapon, relief: save.equipment.relief }] : []),
  ...[save.stash, save.bag, save.safe].flatMap(inv => inv.items.filter(i => isGun(i.id)).map(i => ({ id: i.id, relief: !!i.relief }))),
];
/** 9mm rounds anywhere: stored (relief or not), loaded in an equipped 9mm gun, or waiting as relief. */
const ammo9Anywhere = (save: SaveDataV1): number =>
  [save.stash, save.bag, save.safe].reduce((sum, inv) => sum + count(inv, 'ammo9'), 0)
  + (isGun(save.equipment.weapon) && WEAPONS[save.equipment.weapon].ammo === 'ammo9' ? save.equipment.ammo : 0)
  + (save.reliefSupplies ?? []).reduce((sum, supply) => sum + (supply.id === 'ammo9' ? supply.qty : 0), 0);
export function grantRelief(save: SaveDataV1): boolean {
  if (save.activeRun) return false;
  let changed = false;
  // Rule A: no gun, and selling everything sellable still cannot buy a pistol. The old
  // cash < 200 test is kept on purpose so the rule is never stricter than before.
  if (!ownedGuns(save).length && (save.cash < 200 || liquidValue(save) < ITEMS.pistol.buy)) {
    save.equipment = { weapon: 'pistol', relief: true, ammo: 0, ammoRelief: 0 };
    // A waiting kit is reused after a failed raid instead of issuing a second pending kit.
    if (!save.reliefSupplies?.length) save.reliefSupplies = [{ id: 'ammo9', qty: 12 }, { id: 'bandage', qty: 1 }];
    changed = true;
  }
  // Rule B: only relief guns (rule A may have just issued one), no 9mm anywhere and not enough
  // to buy one pack. Queue the 12 relief rounds a fresh kit carries. Nothing for ammo9 is pending
  // here, so the merged entry is exactly 12, the migrateSave cap; delivery below is unchanged.
  const guns = ownedGuns(save);
  if (guns.length && guns.every(gun => gun.relief) && guns.some(gun => WEAPONS[gun.id].ammo === 'ammo9')
    && !ammo9Anywhere(save) && liquidValue(save) < buyQuantity('ammo9') * ITEMS.ammo9.buy) {
    save.reliefSupplies = [{ id: 'ammo9', qty: 12 }, ...(save.reliefSupplies ?? []).filter(supply => supply.id !== 'ammo9')];
    changed = true;
  }
  for (const supply of save.reliefSupplies ?? []) {
    const before = supply.qty;
    supply.qty = addItem(save.bag, supply.id, supply.qty, true);
    if (supply.qty) supply.qty = addItem(save.stash, supply.id, supply.qty, true);
    if (supply.qty !== before) changed = true;
  }
  save.reliefSupplies = save.reliefSupplies?.filter(supply => supply.qty > 0);
  if (!save.reliefSupplies?.length) delete save.reliefSupplies;
  return changed;
}
/** Purchases enter the stash. Ammo is bought in packs; prices are still per round. */
export function buyQuantity(id: string): number { return id === 'ammo9' ? 12 : id === 'shell' ? 4 : id === 'ammoR' ? 10 : 1; }
export function buy(save: SaveDataV1, id: string, merchant: 'arms' | 'med'): boolean {
  const def = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (save.activeRun || !def || !MERCHANTS[merchant]?.stock.includes(id) || def.buy <= 0) return false;
  const qty = buyQuantity(id), cost = def.buy * qty;
  if (save.cash < cost) return false;
  const stash = clone(save.stash);
  if (addItem(stash, id, qty) > 0) return false;
  save.stash = stash;
  save.cash -= cost;
  return true;
}
export function sell(save: SaveDataV1, itemUid: string): boolean {
  if (save.activeRun) return false;
  for (const inv of [save.stash, save.bag, save.safe]) {
    const entry = inv.items.find(i => i.uid === itemUid);
    if (!entry) continue;
    if (entry.relief || ITEMS[entry.id].sell <= 0) return false;
    save.cash += ITEMS[entry.id].sell * entry.qty;
    inv.items.splice(inv.items.indexOf(entry), 1);
    return true;
  }
  return false;
}
export function equip(save: SaveDataV1, itemUid: string): boolean {
  if (save.activeRun) return false;
  for (const inv of [save.bag, save.stash]) {
    const selected = inv.items.find(i => i.uid === itemUid);
    if (!selected || !isGun(selected.id)) continue;
    const trial = clone(inv);
    trial.items.splice(inv.items.indexOf(selected), 1);
    if (save.equipment.weapon && addItem(trial, save.equipment.weapon, 1, save.equipment.relief)) return false;
    if (!unloadMagazine(trial, save.equipment)) return false;
    inv.items = trial.items;
    save.equipment = { weapon: selected.id, relief: !!selected.relief, ammo: 0, ammoRelief: 0 };
    return true;
  }
  return false;
}
export function unequip(save: SaveDataV1): boolean {
  if (save.activeRun || !save.equipment.weapon) return false;
  const stash = clone(save.stash);
  if (addItem(stash, save.equipment.weapon, 1, save.equipment.relief)) return false;
  if (!unloadMagazine(stash, save.equipment)) return false;
  save.stash = stash;
  save.equipment = emptyEquipment();
  return true;
}
/** Raid weapon swaps use the backpack only; safe contents remain untouched. */
export function equipRun(loadout: RunLoadout, itemUid: string): boolean {
  const selected = loadout.bag.items.find(entry => entry.uid === itemUid);
  if (!selected || !isGun(selected.id)) return false;
  const trial = clone(loadout.bag);
  trial.items.splice(loadout.bag.items.indexOf(selected), 1);
  if (loadout.weapon && addItem(trial, loadout.weapon, 1, loadout.relief)) return false;
  if (!unloadMagazine(trial, loadout)) return false;
  loadout.bag = trial;
  loadout.weapon = selected.id;
  loadout.relief = !!selected.relief;
  loadout.ammo = 0;
  loadout.ammoRelief = 0;
  return true;
}
/** Called only against a trial inventory so a failed unload cannot partially commit. */
function unloadMagazine(inv: Inventory, equipment: Equipment): boolean {
  if (!isGun(equipment.weapon)) return true;
  const magazine = cleanMagazine(equipment.weapon, equipment.ammo, equipment.ammoRelief);
  const ammoId = WEAPONS[equipment.weapon].ammo!;
  return addItem(inv, ammoId, magazine.ammo - magazine.ammoRelief) === 0 && addItem(inv, ammoId, magazine.ammoRelief, true) === 0;
}
export function submitQuest(save: SaveDataV1, id: string): boolean {
  const quest = QUESTS[id];
  if (save.activeRun || !quest || save.quests[id]) return false;
  const inventories = [save.stash, save.bag, save.safe];
  if (!Object.entries(quest.needs).every(([itemId, needed]) => inventories.reduce((sum, inv) => sum + count(inv, itemId), 0) >= needed)) return false;
  for (const [itemId, needed] of Object.entries(quest.needs)) {
    let left = needed;
    for (const inv of inventories) {
      const take = Math.min(left, count(inv, itemId));
      removeItem(inv, itemId, take);
      left -= take;
    }
  }
  save.quests[id] = true;
  save.cash += quest.reward;
  return true;
}
export function upgradeStash(save: SaveDataV1): boolean {
  if (save.activeRun || save.upgraded || !save.quests.repair || save.cash < STASH_UPGRADE_COST) return false;
  save.cash -= STASH_UPGRADE_COST;
  save.upgraded = true;
  save.stash.h = 9;
  return true;
}
/** Returns total loaded rounds after consuming exactly the missing reserve ammunition. */
export function reload(weaponId: string, current: number, bag: Inventory): number {
  const weapon = Object.hasOwn(WEAPONS, weaponId) ? WEAPONS[weaponId] : undefined;
  if (!weapon || !weapon.ammo) return 0;
  const loaded = Math.min(weapon.magazine, integer(current));
  const taken = Math.min(weapon.magazine - loaded, count(bag, weapon.ammo));
  removeItem(bag, weapon.ammo, taken);
  return loaded + taken;
}
/** Relief rounds are loaded first and retain their identity, independently of the gun's origin. */
export function reloadMagazine(weaponId: string, current: number, currentRelief: number, bag: Inventory): Magazine {
  const magazine = cleanMagazine(weaponId, current, currentRelief);
  if (!isGun(weaponId)) return magazine;
  const weapon = WEAPONS[weaponId];
  for (const relief of [true, false]) for (const entry of bag.items) {
    if (entry.id !== weapon.ammo || !!entry.relief !== relief) continue;
    const take = Math.min(entry.qty, weapon.magazine - magazine.ammo);
    entry.qty -= take;
    magazine.ammo += take;
    if (relief) magazine.ammoRelief += take;
  }
  bag.items = bag.items.filter(entry => entry.qty > 0);
  return magazine;
}
export const applyDamage = (hp: number, damage: number, armor = 0): number => Math.max(0, hp - Math.max(0, damage - Math.max(0, armor)));
export interface RandomStream { (): number; getState(): number }
export function seededRandom(seed: number): RandomStream {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return Object.assign(next, { getState: () => state });
}
export function rollLoot(seed: number, amount: number, table: LootTable = LOOT_TABLE): { id: string; qty: number }[] {
  const rng = seededRandom(seed);
  const entries = table.filter(entry => Object.hasOwn(ITEMS, entry.id) && entry.weight > 0 && Number.isFinite(entry.weight) && Number.isFinite(entry.min) && Number.isFinite(entry.max));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!total) return [];
  return Array.from({ length: integer(amount, 0, 10000) }, () => {
    let pick = rng() * total;
    const entry = entries.find(candidate => (pick -= candidate.weight) < 0) ?? entries[entries.length - 1];
    const min = Math.max(1, integer(entry.min, 1)), max = Math.max(min, integer(entry.max, min));
    return { id: entry.id, qty: min + Math.floor(rng() * (max - min + 1)) };
  });
}
