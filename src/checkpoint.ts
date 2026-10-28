import * as D from './domain';
import type { EnemyTactics } from './enemy-archetypes';
import { SURVIVAL as B } from './balance';
import { WORLD, WORLD_W, WORLD_H, generateRun, type Point, type RunConfig } from './world';
import { decodeOldStoredProfile, decodeStoredProfile, finite, hasOwnStringKey, identity, validInventory, whole, COUNT_MAX, UINT32_MAX } from './profile-codec';
import type { LootContainer } from './loot';
import type { CritSnapshot } from './perks';
import { gunUids, validateGun, type GunState } from './gunsmith/instance';
import type { ProfileV2 } from './gunsmith/migrate';

export const WORLD_VERSION = 'coast-v2';
export interface ActorState extends Point { rotation: number }
export interface EnemyState extends ActorState {
  /** Present only for an authored archetype in a layered v4 action. Never added to an old active enemy. */
  tactics?: EnemyTactics;
  uid: string; id: string; hp: number; home: Point; target: Point;
  state: 'patrol' | 'investigate' | 'chase' | 'attack' | 'return';
  timer: number; cooldown: number; path: Point[]; repath: number; alert: number;
}
/** Ground loot. `gun`: a gun on the ground carries its state as an item does (record v8); nothing else has one. */
export interface LootState extends Point { uid: string; id: string; qty: number; relief: boolean; gun?: GunState }
export interface BulletState extends ActorState {
  uid: string; vx: number; vy: number; left: number; damage: number; enemy: boolean; owner?: string;
  /**
   * The shot's critical snapshot (src/perks.ts): on every player round of a v3 layered raid, taken when the shot was
   * fired and never changed in flight. Enemy rounds, classic raids and v1/v2 raids never carry it.
   */
  crit?: CritSnapshot;
}
export interface RaidCheckpoint {
  version: 2; worldVersion: typeof WORLD_VERSION; seed: number; runId: string;
  loadout: D.RunLoadout; player: ActorState;
  hp: number; stamina: number; pollution: number; bleeding: number; kills: number; elapsed: number;
  highTide: boolean; knife: boolean; reloadLeft: number; fireCooldown: number;
  warned: boolean; tideChanged: boolean; shotNoise: Point | null; noiseRadius: number; noiseTime: number;
  hitTime: number; exhausted: boolean; stepTime: number; noteSeen: string[];
  rng: number; nextEntity: number; enemies: EnemyState[]; loot: LootState[]; bullets: BulletState[];
  /** Missing in older checkpoints: their remaining supplies stay on the ground. */
  containers?: LootContainer[];
}

/** The deployment checkpoint and debit are committed together, before a scene exists. */
export function initialCheckpoint(config: RunConfig, carried: D.RunLoadout): RaidCheckpoint {
  const loadout = structuredClone(carried);
  Object.assign(loadout, D.reloadMagazine(loadout, loadout.ammo, loadout.ammoRelief, loadout.bag));
  const random = D.seededRandom(config.seed + 771);
  const enemies: EnemyState[] = config.enemies.map((e, i) => ({ ...e, uid: `enemy-${i}`, rotation: 0, hp: D.ENEMIES[e.id].hp,
    home: { x: e.x, y: e.y }, target: { x: e.x, y: e.y }, state: 'patrol', timer: random() * 3,
    cooldown: 1 + random(), path: [], repath: 0, alert: 0 }));
  const containers: LootContainer[] = config.containers.map(crate => {
    const inventory = D.createInventory(6, 5);
    for (const item of crate.items) if (D.addItem(inventory, item.id, item.qty)) throw new Error('物资箱空间不足。');
    return { id: crate.id, runId: loadout.runId!, kind: 'crate', name: crate.name, x: crate.x, y: crate.y, inventory };
  });
  return { version: 2, worldVersion: WORLD_VERSION, seed: config.seed, runId: loadout.runId!, loadout,
    player: { ...config.spawn, rotation: 0 }, hp: B.maxHealth, stamina: B.maxStamina, pollution: 0, bleeding: 0,
    kills: 0, elapsed: 0, highTide: config.initialHigh, knife: false, reloadLeft: 0, fireCooldown: 0,
    warned: false, tideChanged: false, shotNoise: null, noiseRadius: 510, noiseTime: 0, hitTime: 0,
    exhausted: false, stepTime: 0, noteSeen: [], rng: random.getState(), nextEntity: 1,
    enemies, loot: config.loot.map((l, i) => ({ ...l, uid: `loot-${i}`, relief: false, ...D.factoryGun(l.id) })), bullets: [], containers };
}

const fail = (): never => { throw new Error('行动检查点损坏或版本不兼容。原始存档已保留，请导出备份。'); };
function point(value: any): boolean { return !!value && finite(value.x, 0, WORLD_W) && finite(value.y, 0, WORLD_H); }
function actor(value: any): boolean { return point(value) && finite(value.rotation, -100, 100); }
function bool(value: unknown): boolean { return typeof value === 'boolean'; }
function inventoryIdentity(inv: D.Inventory): string {
  return JSON.stringify([inv.w, inv.h, inv.items.map(i => [i.uid, i.id, i.qty, i.x, i.y, !!i.relief, !!i.rotated, D.gunKey(i.gun)])]);
}

/**
 * Strict validation before rebuilding any world objects; never normalize a partial raid. The profile's version names
 * the format: v3 (record v8) holds gun instances on the loadout, on ground guns and in containers, and one uid space
 * for every item, gun and part that no ground uid, enemy, round or container may share; v2 (records up to v7) holds
 * none and keeps the old rules, which decodeSession applies before migrating such a record.
 */
export function validateCheckpoint(value: unknown, profile: D.SaveDataV1 | ProfileV2, legacy = false): RaidCheckpoint {
  const c = value as RaidCheckpoint, guns = profile.version === 3;
  if (!c || c.version !== (legacy ? 1 : 2) || ![WORLD_VERSION, 'coast-v1'].includes(c.worldVersion) || !whole(c.seed, 0, UINT32_MAX)
      || typeof c.runId !== 'string' || c.runId !== profile.activeRun?.runId || c.seed !== profile.activeRun.seed
      || !c.loadout || c.loadout.runId !== c.runId || !actor(c.player)) fail();
  // Carried gear follows the stored-profile rules: checked as the profile it settles into, failing with that profile's errors.
  const l = c.loadout, slot = { weapon: l.weapon, ammo: l.ammo, ammoRelief: l.ammoRelief, relief: l.relief };
  if (guns) decodeStoredProfile({ ...profile, activeRun: null, bag: l.bag, safe: l.safe, equipment: { ...slot, weaponUid: l.weaponUid, gun: l.gun } });
  else decodeOldStoredProfile({ ...profile, activeRun: null, bag: l.bag, safe: l.safe, equipment: slot });
  if (inventoryIdentity(profile.safe) !== inventoryIdentity(c.loadout.safe) || profile.bag.items.length || profile.equipment.weapon !== null) fail();
  for (const key of ['hp', 'stamina', 'pollution'] as const) if (!finite(c[key], 0, 100)) fail();
  if (!finite(c.bleeding, 0, 1) || !finite(c.elapsed, 0, 600) || !whole(c.kills, 0, 25)) fail();
  for (const key of ['highTide', 'knife', 'warned', 'tideChanged', 'exhausted'] as const) if (!bool(c[key])) fail();
  for (const key of ['reloadLeft', 'fireCooldown', 'noiseTime', 'hitTime'] as const) if (!finite(c[key], 0, 10)) fail();
  if (!finite(c.stepTime, -10, 10) || !finite(c.noiseRadius, 0, 2000) || (c.shotNoise !== null && !point(c.shotNoise))
      || !whole(c.rng, 0, UINT32_MAX) || !whole(c.nextEntity, 1, COUNT_MAX)) fail();
  if (!Array.isArray(c.noteSeen) || c.noteSeen.length > WORLD.notes.length || new Set(c.noteSeen).size !== c.noteSeen.length
      || c.noteSeen.some(n => !WORLD.notes.some(w => w.title === n))) fail();
  const config = generateRun(c.seed);
  if (c.highTide !== (c.tideChanged ? !config.initialHigh : config.initialHigh)
      || c.warned !== (c.elapsed >= config.warningAt) || c.tideChanged !== (c.elapsed >= config.tideAt)) fail();
  const ids = new Set<string>();
  // World uids come from the raid's counters; a dropped gun keeps its item uid on the ground (the gun format, M1-04).
  const id = (uid: unknown, item = false) => {
    if (typeof uid !== 'string' || !(/^(enemy|loot|entity)-[0-9]+$/.test(uid) || item && identity(uid)) || ids.has(uid)) return fail();
    ids.add(uid);
    if (/^entity-[0-9]+$/.test(uid) && Number(uid.slice(7)) >= c.nextEntity) fail();
  };
  if (!Array.isArray(c.enemies) || c.enemies.length !== config.enemies.length) fail();
  c.enemies.forEach((e, i) => {
    id(e.uid);
    if (e.tactics !== undefined || e.uid !== `enemy-${i}` || e.id !== config.enemies[i].id || !actor(e) || !point(e.home) || !point(e.target)
        || !finite(e.hp, 0, D.ENEMIES[e.id].hp) || !['patrol', 'investigate', 'chase', 'attack', 'return'].includes(e.state)
        || !Array.isArray(e.path) || e.path.length > 4000 || !e.path.every(point)) fail();
    for (const key of ['timer', 'cooldown', 'repath', 'alert'] as const) if (!finite(e[key], -10000, 10000)) fail();
  });
  if (c.kills !== c.enemies.filter(e => e.hp <= 0).length) fail();
  if (!Array.isArray(c.loot) || c.loot.length > 4000 || !Array.isArray(c.bullets) || c.bullets.length > 1000) fail();
  // Every item, gun and part uid the raid holds (the gun format adds the equipped gun and every part); checked above
  // through the profile rules, so the reads are safe. Container and ground gun parts join it below.
  const items = [...profile.stash.items, ...c.loadout.bag.items, ...c.loadout.safe.items];
  const itemIds = new Set(guns ? [...items.flatMap(D.itemUids), ...D.equipmentUids(c.loadout)] : items.map(item => item.uid));
  for (const l of c.loot) {
    id(l.uid, guns && D.isGun(l.id));
    if (!point(l) || !hasOwnStringKey(D.ITEMS, l.id) || !whole(l.qty, 1, D.ITEMS[l.id].stack) || !bool(l.relief)) fail();
    // A gun on the ground carries a valid state (the gun format) and nothing else carries one.
    if (guns && D.isGun(l.id) ? !validateGun(l.id, l.uid, l.gun).ok : Object.hasOwn(l, 'gun')) fail();
    if (l.gun) for (const part of gunUids({ uid: l.uid, parts: l.gun.parts }).slice(1)) { if (itemIds.has(part)) fail(); itemIds.add(part); }
  }
  for (const b of c.bullets) {
    id(b.uid);
    if (!actor(b) || !finite(b.vx, -1000, 1000) || !finite(b.vy, -1000, 1000) || !finite(b.left, 0, 2000)
        || !finite(b.damage, 0, 1000) || !bool(b.enemy)) fail();
  }
  if (c.worldVersion === WORLD_VERSION && !Array.isArray(c.containers)) fail();
  if (c.worldVersion !== WORLD_VERSION && c.containers !== undefined) fail();
  const containers = new Set<string>();
  if (c.containers !== undefined) {
    if (!Array.isArray(c.containers) || c.containers.length > config.containers.length + config.enemies.length) fail();
    for (const container of c.containers) {
      if (!container || typeof container.id !== 'string' || containers.has(container.id) || container.runId !== c.runId
          || !point(container) || typeof container.name !== 'string' || !container.name.length || container.name.length > 100) fail();
      containers.add(container.id);
      if (container.kind === 'crate') {
        const original = config.containers.find(crate => crate.id === container.id);
        if (!original || container.x !== original.x || container.y !== original.y) fail();
      } else if (container.kind === 'corpse') {
        if (!/^corpse-enemy-[0-9]+$/.test(container.id)) fail();
        const enemy = c.enemies.find(entry => `corpse-${entry.uid}` === container.id);
        if (!enemy || enemy.hp > 0) fail();
      } else fail();
      if (!validInventory(container.inventory, 6, 5, itemIds, { rotation: !legacy, exact: false, guns })) fail();
    }
  }
  // The gun format keeps items and the world apart (M0 review): no item, gun or part uid is a ground, enemy, round or
  // container uid. Nor is a ground uid a container id: a dropped gun keeps its item uid on the ground (M1-04), which
  // could name a crate, and picking it up would then fail every write. The old format never checked this (its ground
  // uids are raid counters); real old raids pass it, and decodeSession checks them again as v8.
  if (guns && ([...itemIds].some(uid => ids.has(uid) || containers.has(uid)) || [...ids].some(uid => containers.has(uid)))) fail();
  return { ...structuredClone(c), version: 2, worldVersion: WORLD_VERSION, containers: structuredClone(c.containers ?? []) };
}
