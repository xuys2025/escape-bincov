/** Pure game rules. No renderer, browser globals, or wall-clock timers are required. */
import { ATTACHMENTS, BRAND_NAMES, GUNS, partTier, type GunId, type PartTier } from './gunsmith/catalog';
import { checkInstall } from './gunsmith/compat';
import { effectiveWeapon } from './gunsmith/stats';
import { buildOf, factoryState, gunSale, gunSize, gunUids, gunWeight, validateGun, type GunInstance, type GunState } from './gunsmith/instance';
import { migrateProfile, type ProfileV2 } from './gunsmith/migrate';
import { validPresets, type GunPreset } from './gunsmith/presets';

/** `attachment`: a gunsmith part as a loose item (#28 M2-02); `part` stays the hideout's repair and crafting material. */
export type ItemKind = 'weapon' | 'ammo' | 'medical' | 'food' | 'part' | 'valuable' | 'quest' | 'accessory' | 'attachment';
export interface ItemDef {
  id: string; name: string; short: string; w: number; h: number; weight: number;
  stack: number; buy: number; sell: number; kind: ItemKind; description: string; color: number;
}
export interface WeaponDef {
  id: string; name: string; ammo: string | null; magazine: number; damage: number;
  range: number; cooldown: number; reload: number; pellets: number; spread: number;
  /** The gun's own independent critical source, 0 to 1 (docs/CRITICAL-PERK-DESIGN.md section 2.1). Every new weapon sets it; the knife never crits. */
  crit: number;
}
export interface EnemyDef {
  id: string; name: string; hp: number; speed: number; damage: number; range: number;
  vision: number; cooldown: number; color: number;
}
export interface LootEntry { id: string; weight: number; min: number; max: number }
export type LootTable = LootEntry[];
/**
 * `gun`: a gun item's installed parts and device switches (src/gunsmith/instance.ts). Every gun item has it and no
 * other item does (profile v3, record v8); the gun's uid, type and body relief flag are this item's `uid`, `id`, `relief`.
 */
export interface Item { uid: string; id: string; qty: number; x: number; y: number; relief?: boolean; rotated?: boolean; gun?: GunState }
export interface Inventory { w: number; h: number; items: Item[] }
/** ammo is the total loaded count; ammoRelief is its unsellable subset. */
export interface Magazine { ammo: number; ammoRelief: number }
/**
 * The equipped slot. `weapon` is the gun type; `weaponUid` and `gun` are the equipped gun's uid and state, the same
 * instance it has as an item (equip and unequip move it), all three null with no gun. The magazine stays here.
 */
export interface Equipment extends Magazine { weapon: string | null; weaponUid: string | null; gun: GunState | null; relief: boolean }
export type Outcome = 'extract' | 'death' | 'timeout';
export interface RunSummary {
  outcome: Outcome; kills: number; keptValue: number; lostValue: number; message: string;
  seed: number; recovered: boolean;
}
/** The profile. Version 3 holds gun instances; older versions are only read, through migrateSave or migrateProfile. */
export interface SaveDataV1 {
  version: 3; cash: number; stash: Inventory; bag: Inventory; safe: Inventory;
  equipment: Equipment; quests: Record<string, boolean>;
  upgraded: boolean; settings: { volume: number }; stats: { runs: number; extracts: number; kills: number };
  activeRun: null | { seed: number; runId?: string }; lastResult?: RunSummary;
  /** Undelivered relief supplies stay at the hideout; they never enter a raid automatically. */
  reliefSupplies?: { id: string; qty: number }[];
  /**
   * Saved workbench builds (#28 M2-07, gunsmith/presets.ts): absent when there are none, so a profile without presets
   * is byte for byte what older clients wrote. An older client refuses a record holding them (its strict decode drops
   * the field and the canonical comparison fails), never overwriting it.
   */
  gunPresets?: GunPreset[];
}
export interface RunLoadout extends Equipment { bag: Inventory; safe: Inventory; runId?: string }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

const item = (id: string, name: string, short: string, w: number, h: number, weight: number,
  stack: number, buy: number, sell: number, kind: ItemKind, description: string, color: number): ItemDef =>
  ({ id, name, short, w, h, weight, stack, buy, sell, kind, description, color });
/**
 * A gun the gunsmith catalog adds to the game (#28 M2-01): its name, footprint, weight and prices are the catalog's, so
 * the two cannot drift apart; the cell label, the description and the colour are the item's own.
 */
const gunItem = (id: GunId, short: string, description: string, color: number): ItemDef => {
  const g = GUNS[id];
  return item(id, g.stats.name, short, g.w, g.h, g.weight, 1, g.buy, g.sell, 'weapon', description, color);
};
/**
 * The 20 sample attachments of #28 M2-02 that are items, with each one's cell label and description (its benefit, then
 * its cost, from ATTACHMENTS.md). Name (the function name; the brand stays in the details), footprint, weight and
 * prices are the catalog's. They are unique items under their own uids, never stacked, and their item id is the
 * catalog id, which a part keeps on a gun (PartNode.id). #28 M3-02 adds the forty wave-one parts (ART-SPEC 8.2), M3-06
 * the other forty (six of them came early with wave two's P0 art).
 */
const ATTACHMENT_ITEMS: Readonly<Record<string, readonly [short: string, description: string]>> = {
  O01: ['点瞄', '快速举枪，手枪点射较清楚。稳定收益较小。'],
  O03: ['红点', '低重量、快速精瞄。持续射击稳定收益较小。'],
  O08: ['远距镜', '远距观察与稳定首发。举枪和转向恢复慢。'],
  M03: ['短消音', '降低枪声吸引范围。重量及举枪时间增加；装在手枪上要先装九系精瞄枪管组。'],
  M06: ['制退器', '提高持续射击控制。枪声吸引范围增加。'],
  B01: ['精瞄管', '精瞄稳定，提供九系消音接口。举枪略慢；不改变弹种。'],
  B08: ['精确枪管', '提高精瞄稳定与有效距离。重量增加、举枪变慢。'],
  H01: ['短护木', '提供 1 个下导轨、1 个侧位，轻便。控制收益小。'],
  H05: ['卡宾护木', '提供 1 个下导轨、1 个侧位。增加重量和成本。'],
  S01: ['轻托', '轻量、快速举枪。连续控制弱于稳定托。'],
  S02: ['稳定托', '降低连续射击散布增长。更重、举枪慢。'],
  P01: ['轻握把', '快速举枪、轻。控制收益小。'],
  P02: ['稳握把', '连续点射恢复好。重量与成本高。'],
  F01: ['短前握', '适度控制、代价小。少量增重。'],
  F03: ['斜握把', '转向后和移动后恢复快。持续控制较弱。'],
  G01: ['加长匣', '容量提高到 24 发。换弹变慢、增重。'],
  G10: ['快换匣', '容量 20 发，换弹快。减少连续射击时间。'],
  T01: ['激光器', '近距离腰射更集中。开启时增加被正面敌人发现的风险。'],
  T05: ['泛光灯', '较宽的近距可交互物轮廓提示。照亮范围也会暴露自己。'],
  A07: ['顶基座', '开放顶部导轨，并让半自动卡宾枪能装远距瞄具。增重。'],
  A01: ['微基座', '开放微型瞄具位，能装点瞄。自身不提供射击增益，增重。'],
  A02: ['微基座', '开放微型瞄具位，能装点瞄。自身不提供射击增益，增重。'],
  A04: ['顶基座', '开放顶部导轨，能装瞄具。增重，举枪略慢。'],
  A05: ['顶基座', '开放顶部导轨，能装瞄具。增重。'],
  A06: ['顶基座', '开放顶部导轨，能装瞄具。增重。'],
  A08: ['侧基座', '从机匣侧面开放顶部导轨，能装瞄具。增重。'],
  B03: ['短枪管', '举枪和移动后恢复更快，枪身更轻。有效距离降低。'],
  B05: ['短枪管', '举枪快，近距弹丸覆盖更宽。中距命中集中度下降。'],
  B06: ['收束管', '霰弹在中距更集中。重量和举枪时间增加。'],
  B07: ['紧凑管', '近距操控更好，枪身更轻。有效距离和持续控制下降。'],
  B09: ['精确管', '旧卡宾的精瞄更稳。增重，转向后恢复较慢。'],
  H02: ['长护木', '提供 1 个下导轨、2 个侧位，连续射击更稳。更重、举枪慢。'],
  H03: ['木护木', '轻便、便宜，举枪快。不提供下导轨或侧位。'],
  H04: ['导轨护木', '提供 1 个下导轨、2 个侧位。增重。'],
  H06: ['紧凑护木', '轻便，提供 1 个侧位。没有前握把接口。'],
  H07: ['扩展护木', '提供 1 个下导轨、2 个侧位。比紧凑护木重。'],
  H08: ['导轨护木', '提供 1 个下导轨、1 个侧位。增重，换弹略慢。'],
  H09: ['稳固护木', '提供 1 个下导轨、1 个侧位，连续射击更稳。增重，举枪略慢。'],
  S03: ['紧凑托', '移动和转向后恢复快，减轻重量。精瞄稳定性下降。'],
  S04: ['实心托', '点射和连续射击更稳。重量增加。'],
  S05: ['伸缩托', '举枪快、轻。稳定收益小。'],
  S07: ['缓冲托', '射击后恢复更快。增重。'],
  S08: ['控制托', '连续射击更容易收束。增重，举枪慢。'],
  P03: ['防滑握', '射击后恢复较快。略重。'],
  P04: ['木握把', '轻、便宜。稳定收益小。'],
  P06: ['控制握', '近距连续射击更稳。增重，举枪略慢。'],
  P07: ['握片', '手枪连续点射恢复更快。增加少量重量。'],
  G03: ['快换匣', '容量 25 发，换弹快。持续射击时间缩短。'],
  G06: ['扩弹仓', '弹仓增加到 8 发。补满更慢、增重。'],
  G07: ['扩弹仓', '弹仓增加到 9 发。补满更慢、增重。'],
  G08: ['扩容匣', '容量提高到 45 发。换弹变慢、增重。'],
  G09: ['弹鼓', '容量提高到 60 发。很重，举枪和换弹都慢；装上后枪多占一行格子。'],
  M01: ['消焰器', '枪声吸引范围略减，后坐略减。收益很小。'],
  M02: ['补偿器', '减少连续射击的散布增长和后坐。枪声传播更明显。'],
  M05: ['消焰器', '枪声吸引范围略减，连续射击略稳。稳定收益小。'],
  M07: ['消音器', '大幅降低枪声吸引范围。枪身变长、增重、举枪慢。'],
  M10: ['收束器', '霰弹弹丸散布更小。近距覆盖面积变小。'],
  M11: ['收束组', '双管霰弹的弹丸更集中。牺牲近距离容错。'],
  T04: ['小激光', '手枪近距离腰射更集中。开启时增加被正面敌人发现的风险。'],
  T08: ['组合器', '手枪激光加小范围照明。比单一激光器重，开启时同样会暴露自己。'],
  // #28 M3-07 wave two, P0 (the maintainer took it in ahead of the rest, 2026-10-28): the AUG's six parts.
  O05: ['全息', '移动后准星恢复更快，精瞄更稳。举枪稍慢。'],
  O10: ['双档镜', '兼顾近距与远距，精瞄稳定。比单档远距镜重、贵，举枪慢。'],
  F04: ['挡手', '轻，举枪快。控制收益小。'],
  F07: ['重握把', '持续射击控制最强。很重，举枪慢。'],
  T02: ['轻激光', '近距离腰射更集中，很轻。作用距离较短；开启时增加被正面敌人发现的风险。'],
  T10: ['远组合', '远距激光加窄光束照明。最重，举枪较慢；开启时同样会暴露自己。'],
};
const attachmentItem = (id: string, [short, description]: readonly [string, string]): ItemDef => {
  const a = ATTACHMENTS[id];
  return item(id, a.name, short, a.w, a.h, a.weight, 1, a.buy, a.sell, 'attachment', description, 0x8a9692);
};

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
  gb17: gunItem('gb17', 'G17', '使用 9 毫米弹，弹匣容量 17 发。轻便的通用手枪，能装微型瞄具、枪口件和手枪侧挂设备。', 0x8a9390),
  mb4a1: gunItem('mb4a1', 'M4A1', '使用卡宾枪弹，弹匣容量 30 发，全自动。模块化步枪，护木、枪托、握把和弹匣都能更换。', 0x7c8775),
  // #28 M3-01: the wave-one guns, on the three existing ammunition groups.
  pb226: gunItem('pb226', 'P226', '使用 9 毫米弹，弹匣容量 15 发。稳重的手枪，装上基座能用微型瞄具，也能换枪管、握片、枪口件和手枪侧挂设备。', 0x8b8e86),
  mpb5: gunItem('mpb5', 'MP5', '使用 9 毫米弹，弹匣容量 30 发，全自动。近战冲锋枪，枪管、护木、枪托和弹匣都能更换，装上基座能用顶部瞄具。', 0x7f8a86),
  vb9: gunItem('vb9', 'Vector', '使用 9 毫米弹，弹匣容量 25 发，全自动，射速很高。机身自带顶部、下方和侧面导轨。', 0x6f7672),
  mb870: gunItem('mb870', 'M870', '使用霰弹，管状弹仓 6 发，泵动。枪管、护木、枪托、握把和弹仓都能更换，装上基座能用顶部瞄具。', 0xa0784f),
  mb1014: gunItem('mb1014', 'M1014', '使用霰弹，管状弹仓 7 发，半自动。自带顶部导轨，枪管、护木、枪托、握把和弹仓都能更换。', 0x7a807a),
  akb74: gunItem('akb74', 'AK-74', '使用卡宾枪弹，弹匣容量 30 发，全自动。后坐平稳；护木、枪托、握把、枪管和弹匣都能更换，侧置基座能装顶部瞄具。', 0x9a7650),
  akb103: gunItem('akb103', 'AK-103', '使用卡宾枪弹，弹匣容量 30 发，全自动。单发伤害更高、后坐更重；配件和 AK-74 通用，另能装重弹鼓。', 0x6d726c),
  // #28 M3-05, early: wave two's P0 gun (2026-10-28), on an existing ammunition group.
  augb: gunItem('augb', 'AUG', '使用卡宾枪弹，弹匣容量 30 发，全自动。无托结构，枪身短、占 3 格，转向快；换弹慢。机身自带顶部、下方和侧面导轨，枪口件和弹匣能换。', 0x76805e),
  ...Object.fromEntries(Object.entries(ATTACHMENT_ITEMS).map(([id, text]) => [id, attachmentItem(id, text)])),
};

/** Distances are world pixels; cooldown/reload are seconds; spread is radians. */
export const WEAPONS: Record<string, WeaponDef> = {
  knife: { id: 'knife', name: '水手匕首', ammo: null, magazine: 0, damage: 30, range: 48, cooldown: 0.46, reload: 0, pellets: 1, spread: 0, crit: 0 },
  pistol: { id: 'pistol', name: '旧式手枪', ammo: 'ammo9', magazine: 8, damage: 27, range: 440, cooldown: 0.29, reload: 1.25, pellets: 1, spread: 0.07, crit: 0.05 },
  shotgun: { id: 'shotgun', name: '双管霰弹枪', ammo: 'shell', magazine: 2, damage: 15, range: 290, cooldown: 0.72, reload: 1.9, pellets: 6, spread: 0.27, crit: 0.03 },
  carbine: { id: 'carbine', name: '半自动卡宾枪', ammo: 'ammoR', magazine: 12, damage: 39, range: 660, cooldown: 0.24, reload: 1.65, pellets: 1, spread: 0.035, crit: 0.08 },
  // #28 M2-01: the gunsmith catalog's factory rows. The old three above stay literal; the catalog test keeps them equal.
  gb17: { ...GUNS.gb17.stats },
  mb4a1: { ...GUNS.mb4a1.stats },
  pb226: { ...GUNS.pb226.stats },
  mpb5: { ...GUNS.mpb5.stats },
  vb9: { ...GUNS.vb9.stats },
  mb870: { ...GUNS.mb870.stats },
  mb1014: { ...GUNS.mb1014.stats },
  akb74: { ...GUNS.akb74.stats },
  akb103: { ...GUNS.akb103.stats },
  augb: { ...GUNS.augb.stats },
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
/** The attachments that are items, of one acquisition tier (the catalog's partTier), in item order. */
const partsOf = (tier: PartTier): string[] => Object.keys(ATTACHMENT_ITEMS).filter(id => partTier(ATTACHMENTS[id]) === tier);
/**
 * Common parts the arms counter stocks as well (#28 M2 review 2026-10-27): the G17's micro sight and extended magazine,
 * so a G17 bought there can be modified at once. Like the basic parts, they are the shop's and never a find.
 */
const SHELF_COMMON = ['O01', 'G01'];
/**
 * Wave-one guns the arms counter stocks as well (maintainer 2026-10-28, #28 M3): the P226 and the M870. The other
 * gunsmith guns are found only; what the shop sells is to be studied (M4-01).
 */
const SHELF_GUNS = ['pb226', 'mb870'];
/**
 * Fixed stock, no rotation (that is #28 M4-01). The arms counter also stocks the G17, every basic-tier attachment that
 * is an item (#28 M2-13, PLAN section 10: basic parts are stocked steadily) and SHELF_COMMON, after the old goods so their places
 * in the catalog do not move. The catalog is one 6x5 page: every stocked pack must fit it, which
 * tests/gunsmith-acquire.test.ts checks (catalog pages are M2-08).
 */
export const MERCHANTS: Record<'arms' | 'med', { name: string; subtitle: string; stock: string[] }> = {
  arms: { name: '老栓', subtitle: '武器 · 零件', stock: ['pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'scrap', 'wire', 'fuse', 'battery',
    'gb17', ...SHELF_GUNS, ...partsOf('basic'), ...SHELF_COMMON] },
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
/**
 * Is `id` a gun the player can own, carry, equip and save: a WEAPONS row other than the knife (#28 M2-01). This is the
 * one answer every "is it a gun" check reads: the equipped gun's readers, carrying and swapping, relief, the save
 * checks and the item panels. Each such gun is also a catalog gun and an item (tests/domain.test.ts), so the gunsmith
 * rules can read it; the knife, enemy weapon looks and catalog guns that are not items yet (M3) are not guns here.
 */
export const isGun = (id: unknown): id is GunId => typeof id === 'string' && id !== 'knife' && Object.hasOwn(WEAPONS, id);
/** Is `id` a gunsmith attachment that is an item (#28 M2-02): its item id is its catalog id (ATTACHMENTS). */
export const isAttachment = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(ITEMS, id) && ITEMS[id].kind === 'attachment';
/**
 * What the item details add for an attachment (ATTACHMENTS.md: the brand shows only in the details): its maker, and
 * the names of the guns a player can own that it can go on, at once or once a base, handguard or barrel it needs is
 * installed (compat checkInstall on a bare gun: placed, or only an opener or a prerequisite missing). Null for any
 * other item. M2-08 adds whether the stash holds such a gun and which base is missing.
 */
export function attachmentFacts(id: string): { brand: string; guns: string[] } | null {
  if (!isAttachment(id)) return null;
  const guns = Object.keys(GUNS).filter(gun => {
    if (!isGun(gun)) return false;
    const fit = checkInstall({ gun, parts: [] }, id);
    return fit.ok || fit.code === 'opener' || fit.code === 'needs';
  });
  return { brand: BRAND_NAMES[ATTACHMENTS[id].brand], guns: guns.map(gun => WEAPONS[gun].name) };
}
/** The equipped slot as the gun readers below take it: a profile's equipment or a raid loadout. */
type GunSlot = Pick<Equipment, 'weapon' | 'weaponUid' | 'gun' | 'relief'>;
/**
 * The gun the slot holds, as the one instance it is: its uid, type, body relief flag, installed parts and switches;
 * null without a gun (no weapon, or the knife). Every reader of the equipped gun starts here (#28 M1-05): its effective
 * numbers through buildOf of these parts (equippedWeapon, the Runtime's currentWeapon and grip), its weight and its
 * value. A slot that names a gun always carries its uid and state (profile v3, record v8, validEquipment); one that
 * does not is a bug, and reading it throws rather than fire, weigh or price a modified gun as a factory one.
 */
export function equippedGun(slot: GunSlot): GunInstance | null {
  if (!isGun(slot.weapon)) return null;
  if (slot.weaponUid === null || !slot.gun) throw new Error(`The equipped ${slot.weapon} holds no gun instance.`);
  return { uid: slot.weaponUid, id: slot.weapon, relief: slot.relief, ...slot.gun };
}
/**
 * The equipped gun as it fires: the effective WeaponDef of its build (gunsmith/stats.ts), attachments and their
 * guardrails included; WEAPONS for no gun (the knife). Fresh objects every call: the Runtime caches its own.
 */
export function equippedWeapon(slot: GunSlot): WeaponDef {
  const gun = equippedGun(slot);
  return gun ? effectiveWeapon(buildOf(gun)) : WEAPONS[slot.weapon || 'knife'];
}
/** Kg of the equipped gun, every installed part counted once (gunsmith gunWeight); 0 without a gun. */
export function equippedWeight(slot: GunSlot): number {
  const gun = equippedGun(slot);
  return gun ? gunWeight(gun) : 0;
}
/** `current` rounds, `relief` of them relief, clamped to a magazine of `capacity`. */
function fillMagazine(capacity: number, current: unknown, relief: unknown): Magazine {
  const ammo = integer(current, 0, capacity);
  return { ammo, ammoRelief: integer(relief, 0, ammo) };
}
/**
 * A stored magazine as the gun in `slot` holds it: clamped to that instance's effective capacity (equippedWeapon),
 * relief to what is loaded; nothing without a gun. migrateSave, beginRun and settleRun clean the magazine this way;
 * unloading never clamps (unloadMagazine).
 */
function cleanMagazine(slot: GunSlot, current: unknown, relief: unknown): Magazine {
  return fillMagazine(isGun(slot.weapon) ? equippedWeapon(slot).magazine : 0, current, relief);
}
const emptyEquipment = (): Equipment => ({ weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 });
/** What a new item of this id is born with: a gun leaves the factory with nothing installed, anything else has no state. */
export const factoryGun = (id: string): Pick<Item, 'gun'> => isGun(id) ? { gun: factoryState() } : {};
/** Every uid an item holds: its own and, for a gun, each installed part's (record-wide unique). For a checked item. */
export const itemUids = (item: Pick<Item, 'uid' | 'gun'>): string[] => item.gun ? gunUids({ uid: item.uid, parts: item.gun.parts }) : [item.uid];
/**
 * What an item is worth to the shop, component by component: the sell price of everything in it that is not relief (a
 * gun's body at the gun's price and each installed part at its loose price, gunSale; any other item its price times the
 * quantity), and whether a relief component (the item itself, a relief gun body or a relief part) bars selling it
 * whole. Such a sale is refused with the reason, never made by stripping or destroying the relief parts.
 */
export function itemSale(item: Pick<Item, 'id' | 'qty' | 'relief' | 'gun'>): { value: number; restricted: boolean } {
  if (item.gun && isGun(item.id)) return gunSale({ id: item.id, relief: !!item.relief, parts: item.gun.parts });
  return { value: item.relief ? 0 : ITEMS[item.id].sell * item.qty, restricted: !!item.relief };
}
/** Every uid the equipped slot holds: the gun's and its parts', none without a gun. */
export const equipmentUids = (e: Equipment): string[] => e.weaponUid !== null && e.gun ? gunUids({ uid: e.weaponUid, parts: e.gun.parts }) : [];
/** A gun state as text with its keys sorted, so two equal states compare equal whatever order their keys were read in. */
export function gunKey(gun: GunState | null | undefined): string {
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted((value as Record<string, unknown>)[key])])) : value;
  return JSON.stringify(sorted(gun ?? null));
}
/** What placement reads of the thing being placed: an item id, or an item, whose gun state can grow its footprint. */
export type Footprint = string | Pick<Item, 'id' | 'gun'>;

export function createInventory(w: number, h: number): Inventory {
  return { w: Math.max(1, integer(w, 1, 30)), h: Math.max(1, integer(h, 1, 30)), items: [] };
}
/** Cells an item takes. A gun with parts may be larger than its type (gunSize); a factory gun is exactly its ITEMS size. */
export function itemSize(item: Pick<Item, 'id' | 'rotated' | 'gun'>) {
  if (item.gun && isGun(item.id)) return gunSize({ id: item.id, parts: item.gun.parts }, !!item.rotated);
  const d = ITEMS[item.id];
  return item.rotated ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}
/** `what`: an id for something new, or the item itself (its gun state counts) when an existing item moves. */
export function fits(inv: Inventory, what: Footprint, x: number, y: number, ignoreUid?: string, rotated = false): boolean {
  const id = typeof what === 'string' ? what : what.id;
  const def = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!def) return false;
  const size = itemSize({ id, rotated, gun: typeof what === 'string' ? undefined : what.gun });
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + size.w > inv.w || y + size.h > inv.h) return false;
  return inv.items.every(other => {
    if (other.uid === ignoreUid) return true;
    const d = itemSize(other);
    return x + size.w <= other.x || x >= other.x + d.w || y + size.h <= other.y || y >= other.y + d.h;
  });
}
function space(inv: Inventory, what: Footprint, rotated = false, autoRotate = true): { x: number; y: number; rotated?: boolean } | null {
  const size = typeof what === 'string' ? itemSize({ id: what }) : itemSize({ id: what.id, gun: what.gun });
  const orientations = autoRotate && size.w !== size.h ? [rotated, !rotated] : [rotated];
  for (const direction of orientations) for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++)
    if (fits(inv, what, x, y, undefined, direction)) return { x, y, ...(direction ? { rotated: true } : {}) };
  return null;
}
/** New items. A gun is born a factory instance under a new uid (factoryGun); stacks merge first. */
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
    inv.items.push({ uid: allocate(), id, qty: take, ...pos, ...(relief ? { relief: true } : {}), ...factoryGun(id) });
    left -= take;
  }
  return left;
}
/**
 * Put an existing item that is in no inventory yet into `inv` whole, at the first free cell (its own orientation
 * first, then the other with `autoRotate`). It keeps its uid and every field, a gun its state: this is how a gun moves
 * without becoming another gun. False, and nothing changes, when it does not fit.
 */
export function placeItem(inv: Inventory, item: Item, autoRotate = true): boolean {
  const pos = space(inv, item, !!item.rotated, autoRotate);
  if (!pos) return false;
  const placed: Item = { ...item, x: pos.x, y: pos.y };
  if (pos.rotated) placed.rotated = true; else delete placed.rotated;
  inv.items.push(placed);
  return true;
}
/** Ground uids a classic or v1 raid deals out from a counter (loot-3, entity-12): a later raid deals the same ones again. */
const RAID_LOCAL = /^(?:enemy|loot|entity|pursuit)-[0-9]+$/;
/**
 * A gun from the ground into `inv` whole, as the same instance: its state and relief flag, and its uid unless that is
 * raid-local. A dropped gun kept its item uid and v2/v3 raids name their entities with the run id, so those stay; a gun
 * born on the ground of a classic or v1 raid takes a new item uid, or a later raid's ground loot could collide with it.
 * False, and nothing changes, when it does not fit.
 */
export function placeGroundGun(inv: Inventory, loot: Pick<Item, 'uid' | 'id' | 'gun'> & { relief: boolean }): boolean {
  return placeItem(inv, { uid: RAID_LOCAL.test(loot.uid) ? uid() : loot.uid, id: loot.id, qty: 1, x: 0, y: 0,
    ...(loot.relief ? { relief: true } : {}), gun: loot.gun ? clone(loot.gun) : factoryState() });
}
export function moveItem(inv: Inventory, itemUid: string, x: number, y: number, rotated?: boolean): boolean {
  const selected = inv.items.find(i => i.uid === itemUid);
  if (!selected) return false;
  const direction = rotated ?? !!selected.rotated;
  if (fits(inv, selected, x, y, itemUid, direction)) { selected.x = x; selected.y = y; if (direction) selected.rotated = true; else delete selected.rotated; return true; }
  const target = inv.items.find(i => i.uid !== itemUid && i.x === x && i.y === y);
  if (target && target.id === selected.id && !!target.relief === !!selected.relief && target.qty + selected.qty <= ITEMS[target.id].stack) {
    target.qty += selected.qty;
    inv.items.splice(inv.items.indexOf(selected), 1);
    return true;
  }
  return false;
}
export function rotateItem(inv: Inventory, itemUid: string): boolean {
  const item = inv.items.find(i => i.uid === itemUid), size = item && itemSize({ id: item.id, gun: item.gun });
  return !!item && !!size && size.w !== size.h && moveItem(inv, itemUid, item.x, item.y, !item.rotated);
}
export function transferItem(from: Inventory, to: Inventory, itemUid: string, x?: number, y?: number): boolean {
  const selected = from.items.find(i => i.uid === itemUid);
  if (!selected) return false;
  if (from === to) return x !== undefined && y !== undefined && moveItem(from, itemUid, x, y);
  const trial = clone(to);
  if (x !== undefined && y !== undefined) {
    if (fits(trial, selected, x, y, undefined, !!selected.rotated)) trial.items.push({ ...selected, x, y });
    else {
      const target = trial.items.find(i => i.x === x && i.y === y);
      if (!target || target.id !== selected.id || !!target.relief !== !!selected.relief || target.qty + selected.qty > ITEMS[target.id].stack) return false;
      target.qty += selected.qty;
    }
  } else if (selected.gun ? !placeItem(trial, clone(selected)) : addItem(trial, selected.id, selected.qty, !!selected.relief, !!selected.rotated) > 0) return false;
  to.items = trial.items;
  from.items.splice(from.items.indexOf(selected), 1);
  return true;
}
export const count = (inv: Inventory, id: string): number => inv.items.reduce((sum, i) => sum + (i.id === id ? i.qty : 0), 0);
/**
 * Kg of one inventory entry. A gun weighs with its installed parts (gunsmith gunWeight), as it does equipped
 * (equippedWeight), so moving it between a container and the slot never changes a carried total; a factory gun is
 * exactly its ITEMS weight. Anything else is its ITEMS weight times the quantity.
 */
export const itemWeight = (item: Pick<Item, 'id' | 'qty' | 'gun'>): number =>
  item.gun && isGun(item.id) ? gunWeight({ id: item.id, parts: item.gun.parts }) * item.qty : ITEMS[item.id].weight * item.qty;
export const weight = (inv: Inventory): number => Math.round(inv.items.reduce((sum, i) => sum + itemWeight(i), 0) * 1000) / 1000;
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
    version: 3, cash: 700, stash: createInventory(10, 6), bag: createInventory(6, 5), safe: createInventory(2, 2),
    equipment: { weapon: 'pistol', weaponUid: uid(), gun: factoryState(), relief: false, ammo: 0, ammoRelief: 0 }, quests: { repair: false, sample: false, ledger: false },
    upgraded: false, settings: { volume: 0.35 }, stats: { runs: 0, extracts: 0, kills: 0 }, activeRun: null,
  };
  addItem(save.bag, 'ammo9', 32);
  addItem(save.bag, 'bandage', 2);
  addItem(save.bag, 'water');
  addItem(save.stash, 'medkit');
  addItem(save.stash, 'ammo9', 24);
  return save;
}
const ITEM_UID = /^[a-zA-Z0-9_-]{1,100}$/;
/** A uid of `used` or a fresh one, recorded in `used`. */
function claim(used: Set<string>, wanted: unknown): string {
  let itemUid = typeof wanted === 'string' && ITEM_UID.test(wanted) && !used.has(wanted) ? wanted : uid();
  while (used.has(itemUid)) itemUid = uid();
  used.add(itemUid);
  return itemUid;
}
/**
 * The state a gun keeps through cleaning: its stored one when that is valid under `gunUid` and none of its part uids
 * is taken yet (then they are taken), otherwise a factory state. Strict decoders check first, so they never reach the
 * fallback; it only keeps a lenient repair from inventing an invalid gun.
 */
function keptGun(id: string, gunUid: string, stored: unknown, used: Set<string>): GunState {
  const state = stored as GunState;
  if (!validateGun(id, gunUid, stored).ok) return factoryState();
  const parts = gunUids({ uid: gunUid, parts: state.parts }).slice(1);
  if (parts.some(part => used.has(part))) return factoryState();
  parts.forEach(part => used.add(part));
  return clone(state);
}
/**
 * Lenient inventory repair (legacy key, migrateSave): unknown items dropped, overlaps placed anew, bad or repeated uids
 * reissued. `guns`: the format carries gun states (profile v3); a gun keeps its state (keptGun) and, when it has to be
 * placed anew, its uid. Without it no item gets a `gun` field: migrateProfile adds the factory states afterwards.
 */
function cleanInventory(raw: unknown, w: number, h: number, used = new Set<string>(), allowRotation = true, guns = true): Inventory {
  const inv = createInventory(w, h);
  const entries = isObject(raw) && Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
  for (const entry of entries.slice(0, 900)) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !Object.hasOwn(ITEMS, entry.id)) continue;
    let qty = integer(entry.qty ?? entry.quantity, 1, ITEMS[entry.id].stack * w * h);
    if (!qty) continue;
    const kept = { ...(entry.relief === true ? { relief: true } : {}), ...(allowRotation && typeof entry.rotated === 'boolean' ? { rotated: entry.rotated } : {}) };
    if (guns && isGun(entry.id)) {
      // The gun keeps its uid and state wherever it lands; only extra copies of a forged quantity are new factory guns.
      const itemUid = claim(used, entry.uid), gun: Item = { uid: itemUid, id: entry.id, qty: 1, x: entry.x, y: entry.y, ...kept, gun: keptGun(entry.id, itemUid, entry.gun, used) };
      if (fits(inv, gun, entry.x, entry.y, undefined, !!gun.rotated)) inv.items.push(gun);
      else if (!placeItem(inv, gun, false)) continue;
      if (!--qty) continue;
    } else if (qty <= ITEMS[entry.id].stack && fits(inv, entry.id, entry.x, entry.y, undefined, allowRotation && entry.rotated === true)) {
      inv.items.push({ uid: claim(used, entry.uid), id: entry.id, qty, x: entry.x, y: entry.y, ...kept });
      continue;
    }
    const firstNewItem = inv.items.length;
    addItem(inv, entry.id, qty, entry.relief === true, allowRotation && entry.rotated === true, false);
    for (const added of inv.items.slice(firstNewItem)) {
      while (used.has(added.uid)) added.uid = uid();
      used.add(added.uid);
      if (!guns) delete added.gun; // the old format: migrateProfile gives every gun its state
    }
  }
  return inv;
}
/** A gun uid and state for the equipped slot of a v3 profile being cleaned (keptGun), both null without a gun. */
function keptSlot(weapon: string | null, equipped: Record<string, any>, used: Set<string>): Pick<Equipment, 'weaponUid' | 'gun'> {
  if (weapon === null) return { weaponUid: null, gun: null };
  const weaponUid = claim(used, equipped.weaponUid);
  return { weaponUid, gun: keptGun(weapon, weaponUid, equipped.gun, used) };
}
/** The lenient normalization shared by both formats; `guns`: the stored profile is v3 and carries gun states. */
function cleanSave(raw: Record<string, any>, guns: boolean): SaveDataV1 | ProfileV2 {
  const upgraded = raw.upgraded === true, rotation = raw.version === 2 || raw.version === 3;
  const equipped = isObject(raw.equipment) ? raw.equipment : {};
  const quests = isObject(raw.quests) ? raw.quests : {};
  const stats = isObject(raw.stats) ? raw.stats : {};
  const settings = isObject(raw.settings) ? raw.settings : {};
  const used = new Set<string>();
  const stash = cleanInventory(raw.stash ?? raw.inventory, 10, upgraded ? 9 : 6, used, rotation, guns);
  const bag = cleanInventory(raw.bag, 6, 5, used, rotation, guns), safe = cleanInventory(raw.safe, 2, 2, used, rotation, guns);
  const weapon = isGun(equipped.weapon) ? equipped.weapon : null, relief = equipped.relief === true;
  // A v3 slot keeps its stored gun (keptSlot) and its magazine is clamped to that instance. An old slot held a factory
  // gun that has no uid until migrateProfile issues one, so the old rule stands there: a factory gun's capacity.
  const held = guns ? keptSlot(weapon, equipped, used) : null;
  const magazine = held ? cleanMagazine({ weapon, relief, ...held }, equipped.ammo, equipped.ammoRelief)
    : fillMagazine(isGun(weapon) ? effectiveWeapon(buildOf({ id: weapon, parts: [] })).magazine : 0, equipped.ammo, equipped.ammoRelief);
  const slot = { weapon, relief, ...magazine };
  const save = {
    version: guns ? 3 : 2, cash: integer(raw.cash, 0), stash, bag, safe,
    equipment: held ? { ...slot, ...held } : slot,
    quests: Object.fromEntries(Object.keys(QUESTS).map(key => [key, quests[key] === true])), upgraded,
    settings: { volume: typeof settings.volume === 'number' && Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : 0.35 },
    stats: { runs: integer(stats.runs), extracts: integer(stats.extracts), kills: integer(stats.kills) },
    activeRun: isObject(raw.activeRun) ? { seed: integer(raw.activeRun.seed, 1, 0xffffffff), ...(typeof raw.activeRun.runId === 'string' ? { runId: raw.activeRun.runId } : {}) } : null,
  } as SaveDataV1 | ProfileV2;
  if (guns && validPresets(raw.gunPresets) && raw.gunPresets.length) (save as SaveDataV1).gunPresets = structuredClone(raw.gunPresets);
  if (Array.isArray(raw.reliefSupplies)) {
    const pending = raw.reliefSupplies.filter(isObject);
    const supplies = ['ammo9', 'bandage'].map(id => ({ id, qty: Math.min(id === 'ammo9' ? 12 : 1, pending.reduce((sum, entry) => sum + (entry.id === id ? integer(entry.qty) : 0), 0)) })).filter(entry => entry.qty > 0);
    if (supplies.length) save.reliefSupplies = supplies;
  }
  if (isObject(raw.lastResult) && ['extract', 'death', 'timeout'].includes(raw.lastResult.outcome)) {
    // Run seeds are 32-bit (normalizeSeed: Date.now() >>> 0), the same range activeRun.seed accepts above.
    save.lastResult = { outcome: raw.lastResult.outcome, kills: integer(raw.lastResult.kills), keptValue: integer(raw.lastResult.keptValue), lostValue: integer(raw.lastResult.lostValue), seed: integer(raw.lastResult.seed, 0, 0xffffffff), recovered: raw.lastResult.recovered === true, message: typeof raw.lastResult.message === 'string' ? raw.lastResult.message.slice(0, 500) : '' };
  }
  return save;
}
/** A profile v0–v2 normalized by the old lenient rules and kept in that format (v2): what a stored v2 profile is compared with. */
export function cleanOldSave(raw: Record<string, any>): ProfileV2 { return cleanSave(raw, false) as ProfileV2; }
/**
 * Any stored profile as the current version (3). A v3 profile is normalized keeping its gun states; v0–v2 is
 * normalized by the old rules, then migrated (migrateProfile: every gun a factory instance, the equipped one a new
 * uid). Anything else starts a new save, as before.
 */
export function migrateSave(raw: unknown): SaveDataV1 {
  if (isObject(raw) && raw.version === 3) return cleanSave(raw, true) as SaveDataV1;
  if (!isObject(raw) || (raw.version !== undefined && ![0, 1, 2].includes(raw.version))) return newSave();
  return migrateProfile(cleanOldSave(raw));
}
export function beginRun(save: SaveDataV1, seed: number): RunLoadout {
  if (save.activeRun) throw new Error('上次行动尚未结算，暂时不能出击。');
  const runId = uid();
  const loadout: RunLoadout = { bag: clone(save.bag), safe: clone(save.safe), ...clone(save.equipment), ...cleanMagazine(save.equipment, save.equipment.ammo, save.equipment.ammoRelief), runId };
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
/** Settlement value: every component that is not relief, a gun's parts included (itemSale). */
const inventoryValue = (inv: Inventory) => inv.items.reduce((sum, i) => sum + itemSale(i).value, 0);
/** The equipped gun's settlement value: its body unless relief, plus its parts that are not relief. */
const equippedValue = (e: Equipment) => { const held = equippedGun(e); return held ? gunSale(held).value : 0; };
export function settleRun(save: SaveDataV1, loadout: RunLoadout, outcome: Outcome, kills: number): RunSummary | null {
  if (!save.activeRun?.runId || save.activeRun.runId !== loadout.runId) return null;
  const magazine = cleanMagazine(loadout, loadout.ammo, loadout.ammoRelief);
  const ammoId = isGun(loadout.weapon) ? equippedWeapon(loadout).ammo : null;
  const carriedValue = inventoryValue(loadout.bag) + equippedValue(loadout) + (ammoId ? (magazine.ammo - magazine.ammoRelief) * ITEMS[ammoId].sell : 0);
  save.safe = clone(loadout.safe);
  const summary: RunSummary = {
    outcome, kills: integer(kills), keptValue: inventoryValue(loadout.safe) + (outcome === 'extract' ? carriedValue : 0),
    lostValue: outcome === 'extract' ? 0 : carriedValue, seed: save.activeRun.seed, recovered: false,
    message: outcome === 'extract' ? '成功撤离，装备和物资已带回水产站。' : outcome === 'death' ? '撤离失败，背包物资和主武器丢失。安全箱内的物品和水手匕首保留。' : '撤离超时，背包物资和主武器丢失。安全箱内的物品和水手匕首保留。',
  };
  save.bag = outcome === 'extract' ? clone(loadout.bag) : createInventory(6, 5);
  save.equipment = outcome === 'extract' ? { weapon: loadout.weapon, weaponUid: loadout.weaponUid, gun: clone(loadout.gun), relief: loadout.relief, ...magazine } : emptyEquipment();
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
 * Relief goods are unsellable, a gun counts with its parts (itemSale) and not at all while a relief part bars
 * selling it whole, and the copies an unfinished quest still needs are not counted
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
    if (entry.gun) { const sale = itemSale(entry); if (!sale.restricted) value += sale.value; continue; } // no quest needs a gun
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
    save.equipment = { weapon: 'pistol', weaponUid: uid(), gun: factoryState(), relief: true, ammo: 0, ammoRelief: 0 };
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
/**
 * The equipped gun as the item it becomes when it leaves the slot: the same uid, state and body relief flag, so it
 * comes back as the gun it is. Null without a gun.
 */
function heldItem(e: Equipment): Item | null {
  if (!isGun(e.weapon)) return null;
  return { uid: e.weaponUid ?? uid(), id: e.weapon, qty: 1, x: 0, y: 0, ...(e.relief ? { relief: true } : {}), gun: e.gun ? clone(e.gun) : factoryState() };
}
/** The slot holding `item`, a gun item, as that same instance: its uid, state and relief flag, an empty magazine. */
const slotOf = (item: Item): Equipment =>
  ({ weapon: item.id, weaponUid: item.uid, gun: item.gun ? clone(item.gun) : factoryState(), relief: !!item.relief, ammo: 0, ammoRelief: 0 });
/**
 * Swap at the hideout: the chosen gun item becomes the equipped gun and the one it replaces goes back into the same
 * container as the same instance, then the old magazine's rounds (ordinary and relief kept apart). All or nothing.
 */
export function equip(save: SaveDataV1, itemUid: string): boolean {
  if (save.activeRun) return false;
  for (const inv of [save.bag, save.stash]) {
    const selected = inv.items.find(i => i.uid === itemUid);
    if (!selected || !isGun(selected.id)) continue;
    const trial = clone(inv), held = heldItem(save.equipment);
    trial.items.splice(inv.items.indexOf(selected), 1);
    if (held && !placeItem(trial, held)) return false;
    if (!unloadMagazine(trial, save.equipment)) return false;
    inv.items = trial.items;
    save.equipment = slotOf(selected);
    return true;
  }
  return false;
}
/** The equipped gun goes to the stash as the same instance, with its rounds; nothing changes when either does not fit. */
export function unequip(save: SaveDataV1): boolean {
  if (save.activeRun || !save.equipment.weapon) return false;
  const stash = clone(save.stash), held = heldItem(save.equipment);
  if (!held || !placeItem(stash, held)) return false;
  if (!unloadMagazine(stash, save.equipment)) return false;
  save.stash = stash;
  save.equipment = emptyEquipment();
  return true;
}
/**
 * Raid weapon swaps return the replaced gun and its rounds to the backpack only; safe contents remain untouched. The
 * chosen gun comes from the backpack or, from an open container (#26 F15), `from`; the safe is never a source. The
 * guns move as the same instances. All or nothing: a refused swap leaves the loadout and `from` as they were.
 */
export function equipRun(loadout: RunLoadout, itemUid: string, from: Inventory = loadout.bag): boolean {
  if (from === loadout.safe) return false;
  const selected = from.items.find(entry => entry.uid === itemUid);
  if (!selected || !isGun(selected.id)) return false;
  const trial = clone(loadout.bag), held = heldItem(loadout);
  if (from === loadout.bag) trial.items.splice(from.items.indexOf(selected), 1);
  if (held && !placeItem(trial, held)) return false;
  if (!unloadMagazine(trial, loadout)) return false;
  if (from !== loadout.bag) from.items = from.items.filter(entry => entry !== selected);
  loadout.bag = trial;
  Object.assign(loadout, slotOf(selected));
  return true;
}
/**
 * The rounds in `equipment`'s magazine back into `inv`, ordinary and relief kept apart. Called only against a trial
 * inventory so a failed unload cannot partially commit. The stored count comes back as it is, never clamped to the
 * gun's capacity first: rounds a changed build no longer holds (the M2 workbench) must not vanish on the way out.
 */
function unloadMagazine(inv: Inventory, equipment: Equipment): boolean {
  if (!isGun(equipment.weapon)) return true;
  const ammo = integer(equipment.ammo), relief = integer(equipment.ammoRelief, 0, ammo), ammoId = equippedWeapon(equipment).ammo!;
  return addItem(inv, ammoId, ammo - relief) === 0 && addItem(inv, ammoId, relief, true) === 0;
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
/**
 * Takes exactly the missing rounds of the equipped gun's own ammunition out of `bag` (edited in place), up to the
 * effective capacity of the gun in `slot` (equippedWeapon). Relief rounds are loaded first and retain their identity,
 * independently of the gun's origin.
 */
export function reloadMagazine(slot: GunSlot, current: number, currentRelief: number, bag: Inventory): Magazine {
  if (!isGun(slot.weapon)) return fillMagazine(0, current, currentRelief);
  const weapon = equippedWeapon(slot), magazine = fillMagazine(weapon.magazine, current, currentRelief);
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
/**
 * Gunsmith finds (#28 M2-13 and M3; the acquisition section of docs/gunsmith/CONTRACTS.md). The gunsmith guns the shop
 * does not stock, and the common and rare attachments that are items, come only out of the gun and valuable shares of the
 * loot: each gun or valuable record or drop is a find with chance `share`, so quest, food, medicine and ammunition supply
 * stays exactly what it was. A find from a gun record of a map's loot is a gun with chance `gun` (never on a corpse: an
 * enemy's sidearm does not turn into another gun), a rare one with chance `rareGun` wherever it lies (a flooded cache
 * holds too few gun records to carry them). Any other find is an attachment, rare with chance `rare` at a high-risk
 * source (a flooded cache, an elite's corpse), common otherwise. Basic parts are the shop's (MERCHANTS). Proposals,
 * tuned in M4-02; #28 M3 lowered `rare` from 1/3 so that each of the five rare parts stays rarer than each of the 39
 * common ones.
 */
export const GUNSMITH_FINDS = { share: 1 / 6, gun: 1 / 4, rareGun: 1 / 8, rare: 1 / 6 } as const;
const FIND_PARTS = { common: partsOf('common').filter(id => !SHELF_COMMON.includes(id)), rare: partsOf('rare') };
/** The guns that are found, by the catalog's tier (#28 M3): every gun that is an item but those the arms counter stocks. */
const FIND_GUNS = (() => {
  const found = Object.keys(WEAPONS).filter((id): id is GunId => isGun(id) && !MERCHANTS.arms.stock.includes(id));
  return { common: found.filter(id => GUNS[id].tier !== 'rare'), rare: found.filter(id => GUNS[id].tier === 'rare') };
})();
/**
 * What the record or drop `id` becomes, or null when it stays as it is. Draws from `random` only for a gun or a
 * valuable, so a caller's own stream decides finds and nothing else. `risky`: a high-risk source; `gun`: the find may
 * be a gun.
 */
export function gunsmithFind(id: string, random: () => number, source: { risky: boolean; gun: boolean }): string | null {
  const carved = isGun(id) || Object.hasOwn(ITEMS, id) && ITEMS[id].kind === 'valuable';
  if (!carved || random() >= GUNSMITH_FINDS.share) return null;
  const pool = source.gun && isGun(id) && random() < GUNSMITH_FINDS.gun ? FIND_GUNS[random() < GUNSMITH_FINDS.rareGun ? 'rare' : 'common']
    : FIND_PARTS[source.risky && random() < GUNSMITH_FINDS.rare ? 'rare' : 'common'];
  return pool[Math.floor(random() * pool.length)];
}
/**
 * A legacy enemy's corpse in a layered raid: the old roll (rollLoot: same seed, table and count), then each gun or
 * valuable drop judged for a gunsmith find on a stream of its own, an elite's corpse being a high-risk source. Enemies
 * with #81 tactics keep their own contents (their equipment, rounds and supplies); classic raids keep rollLoot.
 */
export function corpseLoot(seed: number, rolls: number, elite: boolean): { id: string; qty: number }[] {
  const drops = rollLoot(seed, rolls), random = seededRandom(seed + 61211);
  for (const drop of drops) {
    const found = gunsmithFind(drop.id, random, { risky: elite, gun: false });
    if (found) { drop.id = found; drop.qty = 1; }
  }
  return drops;
}
