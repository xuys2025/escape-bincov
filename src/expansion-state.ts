import * as D from './domain';
import { archetype, actorArchetype, actorDefinition, initialTactics } from './enemy-archetypes';
import { ARMED_LEADERS, armoryGuns } from './enemy-armory';
import { validFit } from './gunsmith/presets';
import { RECOVERY_POSTS } from './enemy-recovery';
import { BLOCKADE_POSTS } from './enemy-blockade';
import { perkLimitBonus, perkModifiers, validPerkSelection, BREATH_MAX, CRIT_SOURCE_IDS, FOCUS_CRIT, type CritSnapshot, type CritSourceId, type PerkId, type PerkModifiers } from './perks';
import type { ActorState, BulletState, EnemyState, LootState, RaidCheckpoint } from './checkpoint';
import type { LootContainer } from './loot';
import type { Point } from './world';
import { inSpace, separation, checkpointBodyFits, validateSpaces, type SpaceDefinition } from './spatial';
import { finite, hasExactKeys, hasOwnStringKey, identity, validInventory, whole, COUNT_MAX, UINT32_MAX } from './profile-codec';
import { gunUids, validateGun } from './gunsmith/instance';
import type { ProfileV2 } from './gunsmith/migrate';

export const EXPANSION_VERSION = 1;
export const ATTRIBUTES = ['strength', 'constitution', 'technique'] as const;
export type Attribute = typeof ATTRIBUTES[number];
export type Attributes = Record<Attribute, number>;
export const EFFECTS = ['pain', 'energized', 'analgesia', 'focus', 'strength', 'constitution', 'technique', 'injectionFatigue', 'luck'] as const;
const EFFECT_MAX = { pain: 60, energized: 600, analgesia: 180, focus: 120, strength: 180, constitution: 180, technique: 180, injectionFatigue: 120, luck: 300 };
export type Effect = typeof EFFECTS[number];
export const FACILITIES = ['rest', 'medical', 'training', 'workbench', 'blackmarket'] as const;
export type Facility = typeof FACILITIES[number];
export type EndReason = D.Outcome | 'abandon';
export interface BodyState {
    hp: number; stamina: number; mental: number; water: number; satiety: number; pollution: number;
    bleeding: boolean; exhausted: boolean; effects: Record<Effect, number>;
    /** Kept separately from effect lifetimes; leaving the base suspends this treatment. */
    treatment: { bleeding: number; pain: number; injectionFatigue: number };
    luckEffect: number;
}
export interface GrowthState {
    permanent: Attributes; progress: Attributes; reputation: Record<string, number>; luck: number;
    /** Required in v3 and absent before it: the chosen perk ids, as validPerkSelection (src/perks.ts) accepts them. */
    perks?: PerkId[];
}
export interface TrainingState {
    quantity: Attributes; credited: Attributes;
    eligibleDamage: Record<string, number>; healedByEnemy: Record<string, number>;
    motion: { anchor: Point | null; windowStarted: number; localSeconds: number };
}
export interface ProductionBatch {
    id: string; recipe: 'bandage' | 'medkit' | 'antidote'; duration: number; remaining: number;
    workbenchLevel: 1 | 2 | 3;
    paidCash: number; paidItems: { id: string; qty: number }[];
    result: { id: string; qty: number }[];
}
export interface BaseState {
    facilities: Record<Facility, number>; queue: ProductionBatch[]; completed: ProductionBatch[];
    nextBatch: number; cursor: number; location: 'base' | 'raid' | 'settlement';
    restSeconds: number; energizedGranted: boolean; extractedPearl: boolean;
    training: { startedAt: number; quantity: number; credited: Attributes; activeSeconds: number; attribute: Attribute | null };
}
export interface LayerState {
    doors: Record<string, boolean>; localTime: number;
    enemies: EnemyState[]; loot: LootState[]; containers: LootContainer[]; bullets: BulletState[];
    noise: { at: Point; radius: number; remaining: number } | null;
}
export interface PursuitState {
    id: string; enemy: EnemyState; sourceMap: string; targetMap: string; entry: string;
    path: Point[]; distance: number; speed: number; registeredAt: number; arrivalAt: number; waiting: boolean;
}
/**
 * `version` is the raid's rules identity, kept until it settles: 1 no RPG; 2 RPG with the old critical rule; 3 RPG
 * with Perk critical snapshots; 4 enemy tactics with the old critical rule; 5 both systems.
 * Only 3 and 5 belong to a v3 expansion. Restoring never changes a live raid's rules.
 */
export interface LayeredRaid {
    version: 1 | 2 | 3 | 4 | 5; worldVersion: string; layoutRevision: string; seed: number; runId: string;
    currentMap: string; player: ActorState; loadout: D.RunLoadout;
    elapsed: number; initialHigh: boolean; highTide: boolean; warned: boolean; tideChanged: boolean;
    kills: number; rng: number; nextEntity: number; maps: Record<string, LayerState>; pursuits: PursuitState[];
    training: TrainingState; reloadLeft: number; fireCooldown: number; knife: boolean; hitTime: number;
    /** Stable birth roster prevents ownership transfer from changing the population. */
    roster: { uid: string; id: string }[];
    eventRolled: boolean;
    mapEvent?: 'none' | 'neutral' | 'good' | 'bad';
    /** RPG (v2+) checkpoint: last qualifying shock, measured on the global action clock. */
    shockAt?: number;
}
/** RPG (v2+) generated identities stay unique when loot survives into another action; v2 and v3 share the format. */
export function entityUid(raid: Pick<LayeredRaid, 'version' | 'runId'>, serial: number): string {
    return rpgEnabled(raid) ? `entity-${raid.runId}-${serial}` : `entity-${serial}`;
}
/** 1: no RPG. 2: RPG (charm, awards). 3: v2 plus the perk selection (`growth.perks`). */
export interface ExpansionState {
    version: 1 | 2 | 3; body: BodyState; growth: GrowthState; base: BaseState; raid: LayeredRaid | null;
    charm?: D.Item | null;
    awards?: string[];
}
/** RPG is on: an expansion from v2, or a layered raid deployed from one. Any later version keeps meaning this. */
export function rpgEnabled(value: { version: number } | null | undefined): boolean { return !!value && value.version >= 2; }
/** Raid identities are independent capabilities, not an ordered feature ladder. */
export const enemyRules = (raid: { version: number } | null | undefined): boolean => raid?.version === 4 || raid?.version === 5;
export const perkRaidRules = (raid: { version: number } | null | undefined): boolean => raid?.version === 3 || raid?.version === 5;
/** The expansion has passed the latest station-boundary upgrade (upgradeToRpg): v3. */
export const stationUpgraded = (state: Pick<ExpansionState, 'version'> | null | undefined) => state?.version === 3;
export interface WorldDefinition {
    id: string; revision: string; maps: Record<string, SpaceDefinition>;
    enemyCount: number; spawnMap: string; spawn: Point;
}
export type WorldResolver = (version: string) => WorldDefinition | undefined;
const triple = (value: number): Attributes => ({ strength: value, constitution: value, technique: value });
export function newTraining(): TrainingState {
    return { quantity: triple(0), credited: triple(0), eligibleDamage: {}, healedByEnemy: {}, motion: { anchor: null, windowStarted: 0, localSeconds: 0 } };
}
export function newExpansion(now: number, oldRaid?: RaidCheckpoint | null): ExpansionState {
    return { version: 1,
        body: { hp: oldRaid?.hp ?? 100, stamina: oldRaid?.stamina ?? 100, mental: 100, water: 100, satiety: 100,
            pollution: oldRaid?.pollution ?? 0, bleeding: !!oldRaid?.bleeding, exhausted: oldRaid?.exhausted ?? false,
            effects: Object.fromEntries(EFFECTS.map(e => [e, 0])) as BodyState['effects'],
            treatment: { bleeding: 0, pain: 0, injectionFatigue: 0 }, luckEffect: 0 },
        growth: { permanent: triple(10), progress: triple(0), reputation: {}, luck: 1 },
        base: { facilities: Object.fromEntries(FACILITIES.map(f => [f, 0])) as BaseState['facilities'], queue: [], completed: [], nextBatch: 1,
            cursor: now, location: oldRaid ? 'raid' : 'base', restSeconds: 0, energizedGranted: false, extractedPearl: false,
            training: { startedAt: now, quantity: 0, credited: triple(0), activeSeconds: 0, attribute: null } }, raid: null };
}
/**
 * The station-boundary upgrade to the current version, in place. Callers run it only with no live raid and no pending
 * settlement. v1 to v2 starts with no charm or awards and base time counts from `now`; v2 to v3 adds an empty perk
 * selection and nothing else (no pick, no training credit). A v2 state still holding a raid stays v2 until that raid
 * settles. Idempotent: v3 is left as is.
 */
export function upgradeToRpg(state: ExpansionState, now: number): void {
    if (state.version === 1) { state.version = 2; state.charm = null; state.awards = []; state.base.cursor = Math.max(state.base.cursor, now); }
    if (state.version === 2 && state.raid === null) { state.version = 3; state.growth.perks = []; }
}
export function effectiveAttributes(state: ExpansionState): Attributes {
    return Object.fromEntries(ATTRIBUTES.map(a => [a, Math.max(1, Math.min(40, state.growth.permanent[a] + (state.body.effects[a] > 0 ? 5 : 0)))])) as Attributes;
}
/** The perks in force: a v3 expansion's selection. v1 and v2 hold none, so no perk ever reaches their raids. */
export const activePerks = (state: Pick<ExpansionState, 'version' | 'growth'>): readonly PerkId[] => state.version === 3 ? state.growth.perks ?? [] : [];
/** Attribute formulas plus, in v3 only, the perks' fixed bonuses (once). The strict validator uses the same limits. */
export function derivedLimits(state: ExpansionState) {
    const a = effectiveAttributes(state), bonus = perkLimitBonus(activePerks(state));
    return { hp: 100 + 3 * (a.constitution - 10) + bonus.hp, stamina: 100 + 2 * (a.strength - 10) + bonus.stamina, carry: 24 + .6 * (a.strength - 10) + bonus.carry };
}

const fail = (): never => { throw new Error('建筑、角色或基地存档损坏或版本不兼容。原始数据已保留。'); };
function obj(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: unknown, keys: readonly string[]) { if (!hasExactKeys(value, keys)) fail(); }
function attributes(value: unknown, min: number, max: number, integral = false) {
    exactKeys(value, ATTRIBUTES);
    for (const a of ATTRIBUTES) if (!(integral ? whole((value as Attributes)[a], min, max) : finite((value as Attributes)[a], min, max))) fail();
}
function dictionary(value: unknown, max: number) {
    if (!obj(value) || Object.keys(value).length > 1000 || Object.entries(value).some(([id, amount]) => !identity(id) || !finite(amount, 0, max))) fail();
}
function goods(value: unknown) {
    if (!Array.isArray(value) || value.length > 30 || value.some(i => !obj(i) || Object.keys(i).length !== 2 || !hasOwnStringKey(D.ITEMS, i.id) || !whole(i.qty, 1, 300))) fail();
}
export const RECIPES = {
    bandage: { level: 1, medical: 0, seconds: 600, cash: 35, materials: [{ id: 'cloth', qty: 2 }], result: [{ id: 'bandage', qty: 2 }] },
    medkit: { level: 2, medical: 0, seconds: 1200, cash: 100, materials: [{ id: 'bandage', qty: 3 }], result: [{ id: 'medkit', qty: 1 }] },
    antidote: { level: 3, medical: 1, seconds: 1800, cash: 100, materials: [{ id: 'water', qty: 2 }], result: [{ id: 'antidote', qty: 1 }] },
} as const;
export const PRODUCTION_SPEED = [1, 1, .85, .7] as const;
function batch(value: ProductionBatch) {
    exactKeys(value, ['id', 'recipe', 'duration', 'remaining', 'workbenchLevel', 'paidCash', 'paidItems', 'result']);
    if (!obj(value) || !identity(value.id) || !['bandage', 'medkit', 'antidote'].includes(value.recipe)
        || !whole(value.workbenchLevel, 1, 3) || !finite(value.duration, 1, 1800) || !finite(value.remaining, 0, value.duration) || !whole(value.paidCash, 0, COUNT_MAX)) fail();
    goods(value.paidItems); goods(value.result);
    const recipe = RECIPES[value.recipe];
    const matchingGoods = (a: readonly { id: string; qty: number }[], b: readonly { id: string; qty: number }[]) =>
        a.length === b.length && a.every((i, index) => i.id === b[index].id && i.qty === b[index].qty);
    if (value.workbenchLevel < recipe.level || value.duration !== recipe.seconds * PRODUCTION_SPEED[value.workbenchLevel]
        || value.paidCash !== recipe.cash || !matchingGoods(value.paidItems, recipe.materials) || !matchingGoods(value.result, recipe.result)) fail();
}
/**
 * A v3 player round's critical snapshot (docs/tasks/critical-perk-contract.md section 3), checked as stored: never
 * completed or reordered. Sources are exact `{ id, chance }` records in CRIT_SOURCE_IDS order, so each id once, and
 * always hold the character and weapon sources; those two may differ from today's (a dose wore off, another gun was
 * drawn), so only 0..1 is checked. The perk sources are exactly the owned perks' own, because the selection cannot
 * change during a raid (`owned` is perkModifiers of it), and so is the multiplier; focus has its fixed chance. The
 * breath source needs technique-15-a and is there exactly when `target` names an enemy of the roster.
 */
function critSnapshot(value: unknown, owned: PerkModifiers, roster: readonly { uid: string }[]) {
    exactKeys(value, ['sources', 'multiplier', 'target']);
    const { sources, multiplier, target } = value as CritSnapshot, chances = new Map<CritSourceId, number>();
    if (!Array.isArray(sources)) fail();
    let last = -1;
    for (const source of sources) {
        exactKeys(source, ['id', 'chance']);
        const index = CRIT_SOURCE_IDS.indexOf(source.id);
        if (index <= last || !finite(source.chance, 0, 1)) fail();
        last = index; chances.set(source.id, source.chance);
    }
    const perk = (id: CritSourceId) => owned.crit.find(s => s.id === id)?.chance, breath = chances.get('technique-15-a');
    if (!chances.has('character') || !chances.has('weapon') || multiplier !== owned.critMultiplier
        || chances.get('technique-20-a') !== perk('technique-20-a') || chances.get('technique-30-a') !== perk('technique-30-a')
        || (chances.has('focus') && chances.get('focus') !== FOCUS_CRIT)
        || (breath === undefined ? target !== null : !owned.breath || !(breath > 0 && breath <= BREATH_MAX) || !roster.some(e => e.uid === target))) fail();
}

/**
 * Complete validation is shared by imports and the single-record commit, before publishing state. The profile's version
 * names the gun format: with v3 (record v8) the raid loadout names its gun (`weaponUid`, `gun`), gun items and ground
 * guns carry valid states, and every gun and part uid joins the item uids that no entity may share; with v2 (records up
 * to v7) none of those fields may appear, as before.
 */
export function validateExpansion(value: unknown, profile: D.SaveDataV1 | ProfileV2, legacyRaid: RaidCheckpoint | null, resolveWorld: WorldResolver): ExpansionState {
    const state = value as ExpansionState, guns = profile.version === 3;
    exactKeys(state, ['version', 'body', 'growth', 'base', 'raid', ...(rpgEnabled(state) ? ['charm', 'awards'] : [])]);
    if (![EXPANSION_VERSION, 2, 3].includes(state.version) || !obj(state.body) || !obj(state.growth) || !obj(state.base)) fail();
    const { body, growth, base } = state;
    if (rpgEnabled(state)) {
        if (!Array.isArray(state.awards) || state.awards.length > 1000 || state.awards.some(id => !identity(id)) || new Set(state.awards).size !== state.awards.length) fail();
        const charm = state.charm;
        // A classic raid's gear (its checkpoint, already checked) is the charm's neighbour too: its bag and safe, and in
        // the gun format its gun and every part. A layered raid's gear is covered below (invIds starts with the charm).
        const carried = legacyRaid?.loadout;
        if (charm !== null) {
            if (!obj(charm) || !identity(charm.uid) || !['luckyCharm', 'unluckyCharm'].includes(charm.id) || charm.qty !== 1 || charm.x !== 0 || charm.y !== 0 || charm.rotated !== undefined || charm.relief !== undefined
                || [profile.stash, profile.bag, profile.safe, state.raid?.loadout.bag, carried?.bag, carried?.safe].filter(Boolean).some(inv => inv!.items.some(i => i.uid === charm.uid))
                // The profile (already checked) also holds part uids and the equipped gun's; in a layered raid invIds covers the loadout's.
                || (guns && [...[profile.stash, profile.bag, profile.safe, ...(carried ? [carried.bag, carried.safe] : [])].flatMap(inv => inv.items.flatMap(D.itemUids)),
                    ...D.equipmentUids(profile.equipment as D.Equipment), ...(carried ? D.equipmentUids(carried) : [])].includes(charm.uid))) fail();
            exactKeys(charm, ['uid', 'id', 'qty', 'x', 'y']);
        }
    }
    exactKeys(body, ['hp', 'stamina', 'mental', 'water', 'satiety', 'pollution', 'bleeding', 'exhausted', 'effects', 'treatment', 'luckEffect']);
    exactKeys(growth, ['permanent', 'progress', 'reputation', 'luck', ...(state.version === 3 ? ['perks'] : [])]);
    exactKeys(base, ['facilities', 'queue', 'completed', 'nextBatch', 'cursor', 'location', 'restSeconds', 'energizedGranted', 'extractedPearl', 'training']);
    attributes(growth.permanent, 10, 30, true); attributes(growth.progress, 0, 1);
    if (ATTRIBUTES.some(a => growth.progress[a] >= 1 || (growth.permanent[a] === 30 && growth.progress[a] !== 0))) fail();
    // Checked as stored, before derivedLimits reads it: never reordered, deduplicated or trimmed to fit.
    if (state.version === 3 && !validPerkSelection(growth.perks, growth.permanent)) fail();
    if (!obj(growth.reputation) || Object.keys(growth.reputation).length > 100 || Object.entries(growth.reputation).some(([id, amount]) => !identity(id) || !whole(amount, -100, 100))
        || !whole(growth.luck, -3, 5)) fail();
    exactKeys(body.effects, EFFECTS);
    for (const e of EFFECTS) if (!finite(body.effects[e], 0, EFFECT_MAX[e])) fail();
    const limits = derivedLimits(state);
    if (!finite(body.hp, 0, limits.hp) || !finite(body.stamina, 0, limits.stamina)
        || ['mental', 'water', 'satiety', 'pollution'].some(k => !finite(body[k as keyof BodyState], 0, 100))
        || typeof body.bleeding !== 'boolean' || typeof body.exhausted !== 'boolean' || !whole(body.luckEffect, -1, 1)
        || (body.effects.luck === 0 && body.luckEffect !== 0)) fail();
    exactKeys(body.treatment, ['bleeding', 'pain', 'injectionFatigue']);
    if (Object.values(body.treatment).some(v => !finite(v, 0, 120))) fail();
    exactKeys(base.facilities, FACILITIES);
    if (FACILITIES.some(f => !whole(base.facilities[f], 0, 3)) || !whole(base.cursor, 0, Number.MAX_SAFE_INTEGER)
        || !whole(base.nextBatch, 1, COUNT_MAX) || !['base', 'raid', 'settlement'].includes(base.location)
        || !finite(base.restSeconds, 0, 120) || typeof base.energizedGranted !== 'boolean' || typeof base.extractedPearl !== 'boolean'
        || !Array.isArray(base.queue) || base.queue.length > base.facilities.workbench || !Array.isArray(base.completed) || base.completed.length > 3) fail();
    const batchIds = new Set<string>();
    for (const b of [...base.queue, ...base.completed]) {
        batch(b);
        const id = /^batch-([0-9]+)$/.exec(b.id);
        if (batchIds.has(b.id) || !id || !whole(Number(id[1]), 1, base.nextBatch - 1)
            || b.workbenchLevel > base.facilities.workbench || base.facilities.medical < RECIPES[b.recipe].medical) fail();
        batchIds.add(b.id);
    }
    if (base.completed.some(b => b.remaining !== 0) || base.queue.some((b, i) => i > 0 && b.remaining !== b.duration)) fail();
    if (!obj(base.training) || !whole(base.training.startedAt, 0, Number.MAX_SAFE_INTEGER) || !finite(base.training.quantity, 0, 1)
        || !finite(base.training.activeSeconds, 0, 120) || (base.training.attribute !== null && !ATTRIBUTES.includes(base.training.attribute))) fail();
    exactKeys(base.training, ['startedAt', 'quantity', 'credited', 'activeSeconds', 'attribute']);
    attributes(base.training.credited, 0, .45);
    if (state.raid === null) {
        if (profile.activeRun && !legacyRaid) fail();
        if (base.location === 'raid' && !legacyRaid) fail();
        if (legacyRaid && base.location !== 'raid') fail();
        return structuredClone(state);
    }
    if (legacyRaid || base.location !== 'raid') fail();
    const raid = state.raid;
    if (!obj(raid)) return fail();
    exactKeys(raid, ['version', 'worldVersion', 'layoutRevision', 'seed', 'runId', 'currentMap', 'player', 'loadout', 'elapsed', 'initialHigh', 'highTide', 'warned', 'tideChanged', 'kills', 'rng', 'nextEntity', 'maps', 'pursuits', 'training', 'reloadLeft', 'fireCooldown', 'knife', 'hitTime', 'roster', 'eventRolled', ...(rpgEnabled(raid) ? ['shockAt', 'mapEvent'] : [])]);
    const world = resolveWorld(raid.worldVersion);
    if (!world) return fail();
    // Perks and critical snapshots travel together; enemy-only v4 keeps its original v2 expansion.
    if (![1, 2, 3, 4, 5].includes(raid.version) || perkRaidRules(raid) !== (state.version === 3)
        || (rpgEnabled(raid) && (!finite(raid.shockAt, -10, raid.elapsed) || !['none', 'neutral', 'good', 'bad'].includes(raid.mapEvent!))) || raid.layoutRevision !== world.revision || !whole(raid.seed, 1, UINT32_MAX)
        || raid.runId !== profile.activeRun?.runId || raid.seed !== profile.activeRun.seed || raid.loadout?.runId !== raid.runId) fail();
    validateSpaces(world.maps);
    exactKeys(raid.maps, Object.keys(world.maps));
    exactKeys(raid.player, ['x', 'y', 'rotation']);
    if (!hasOwnStringKey(raid.maps, raid.currentMap) || !inSpace(world.maps[raid.currentMap], raid.player, 10) || !finite(raid.player.rotation, -100, 100)
        || !finite(raid.elapsed, 0, 600) || !whole(raid.rng, 0, UINT32_MAX) || !whole(raid.nextEntity, 1, COUNT_MAX)
        || !whole(raid.kills, 0, world.enemyCount) || !Array.isArray(raid.roster) || raid.roster.length !== world.enemyCount
        || !Array.isArray(raid.pursuits) || raid.pursuits.length > world.enemyCount) fail();
    for (const flag of ['initialHigh', 'highTide', 'warned', 'tideChanged', 'knife', 'eventRolled'] as const) if (typeof raid[flag] !== 'boolean') fail();
    if (raid.warned !== (raid.elapsed >= 270) || raid.tideChanged !== (raid.elapsed >= 300)
        || raid.highTide !== (raid.tideChanged ? !raid.initialHigh : raid.initialHigh)) fail();
    // A high-tide checkpoint may legitimately contain a character still escaping water;
    // permanent walls/windows/furniture and closed doors are never valid body positions.
    const bodyFits = (mapId: string, p: Point) => checkpointBodyFits({ definition: world.maps[mapId], doors: raid.maps[mapId]?.doors ?? {}, highTide: false }, p);
    if (!bodyFits(raid.currentMap, raid.player)) fail();
    for (const key of ['reloadLeft', 'fireCooldown', 'hitTime'] as const) if (!finite(raid[key], 0, 10)) fail();
    const invIds = new Set<string>(state.charm ? [state.charm.uid] : []);
    const allocated = (id: string) => {
        const prefix = `entity-${raid.runId}-`, rpg = rpgEnabled(raid);
        const match = rpg && id.startsWith(prefix) ? /^([0-9]+)$/.exec(id.slice(prefix.length))
            : /^(?:entity|pursuit)-([0-9]+)$/.exec(id);
        if (rpg && id.startsWith(prefix) && !match) fail();
        if (rpg && id.startsWith('entity-') && !id.startsWith(prefix)) return; // Retained loot from an older action.
        if (match && (!whole(Number(match[1]), 1, COUNT_MAX) || Number(match[1]) >= raid.nextEntity)) fail();
    };
    const inventory = (inv: D.Inventory, w: number, h: number, overflow = 0) => {
        if (!validInventory(inv, w, h, invIds, { rotation: true, exact: true, guns, overflow }, item => D.itemUids(item).forEach(allocated))) fail();
    };
    inventory(profile.stash, D.STASH_W, D.stashRows(profile.upgraded), D.stashOverflowRows(guns)); inventory(raid.loadout.bag, 6, 5); inventory(raid.loadout.safe, 2, 2);
    exactKeys(raid.loadout, ['bag', 'safe', 'weapon', 'ammo', 'ammoRelief', 'relief', 'runId', ...(guns ? ['weaponUid', 'gun'] : [])]);
    const magazine = raid.loadout, gun = magazine.weapon === null ? null : D.isGun(magazine.weapon) ? D.WEAPONS[magazine.weapon] : undefined;
    // The old format caps the magazine at the gun type's size; the gun format at its instance's, below.
    if (gun === undefined || !whole(magazine.ammo, 0, guns ? COUNT_MAX : gun?.magazine ?? 0)
        || !whole(magazine.ammoRelief, 0, magazine.ammo) || typeof magazine.relief !== 'boolean'
        || profile.bag.items.length || profile.equipment.weapon !== null) fail();
    // The equipped gun (gun format): its own uid and its parts' join the item uids, like a gun in the bag. The magazine
    // holds at most the effective capacity of that instance's build (M1-05), read once the instance is known valid.
    if (guns) {
        if (magazine.weapon === null ? magazine.weaponUid !== null || magazine.gun !== null : !validateGun(magazine.weapon, magazine.weaponUid, magazine.gun).ok) fail();
        if (magazine.ammo > D.equippedWeapon(magazine).magazine) fail();
        for (const uid of D.equipmentUids(magazine)) { if (invIds.has(uid)) fail(); allocated(uid); invIds.add(uid); }
    }
    const inventoryIdentity = (inv: D.Inventory) => JSON.stringify([inv.w, inv.h, inv.items.map(i => [i.uid, i.id, i.qty, i.x, i.y, !!i.relief, !!i.rotated, D.gunKey(i.gun)])]);
    if (inventoryIdentity(profile.safe) !== inventoryIdentity(raid.loadout.safe)) fail();
    const entities = new Set<string>(), enemies = new Map<string, EnemyState>(), enemyMaps = new Map<string, string>();
    const containers: { container: LootContainer; mapId: string }[] = [];
    // What the owned perks (checked above) put into every shot snapshot of a v3 raid.
    const owned = perkRaidRules(raid) ? perkModifiers(growth.perks ?? []) : null;
    const entity = (uid: string) => { if (!identity(uid) || entities.has(uid) || invIds.has(uid)) fail(); allocated(uid); entities.add(uid); };
    const point = (p: Point, map: SpaceDefinition) => { if (!obj(p) || !inSpace(map, p)) fail(); };
    const plainPoint = (p: Point, map: SpaceDefinition) => { exactKeys(p, ['x', 'y']); point(p, map); };
    const enemy = (e: EnemyState, map: SpaceDefinition) => {
        if (!obj(e)) return fail();
        const spec = enemyRules(raid) ? actorArchetype(e) : undefined;
        exactKeys(e, ['uid', 'id', 'hp', 'x', 'y', 'rotation', 'home', 'target', 'state', 'timer', 'cooldown', 'path', 'repath', 'alert', ...(spec ? ['tactics'] : [])]);
        entity(e.uid); point(e, map); plainPoint(e.home, map); plainPoint(e.target, map);
        if ((!spec && !hasOwnStringKey(D.ENEMIES, e.id)) || !finite(e.hp, 0, actorDefinition(e).hp) || !finite(e.rotation, -100, 100)
            || !['patrol', 'investigate', 'chase', 'attack', 'return'].includes(e.state) || !Array.isArray(e.path) || e.path.length > 4000) fail();
        if (e.hp > 0 && !bodyFits(map.id, e)) fail();
        e.path.forEach(p => plainPoint(p, map));
        for (const key of ['timer', 'cooldown', 'repath', 'alert'] as const) if (!finite(e[key], -10000, 10000)) fail();
        if (spec) {
            const t = e.tactics!;
            exactKeys(t, ['version', 'squad', 'awareness', 'stance', 'warning', 'memory', 'phase', 'phaseLeft', 'lockedAim', 'magazine', 'reserve', 'signalUsed', 'equipment', 'supplies', 'killedBy', ...(Object.hasOwn(t, 'fit') ? ['fit'] : []), ...(t.version === 2 ? ['program'] : [])]);
            if (t.version === 2) {
                if(!obj(t.program))fail();
                if(t.program.kind==='affected') {
                    exactKeys(t.program, ['kind', 'armament']);
                    if(spec.faction !== 'affected' || (e.id === 'tide-ritualist' ? !['rifle','polearm'].includes(t.program.armament) : t.program.armament !== 'unarmed')) fail();
                } else if(t.program.kind==='recovery') {
                    const p=t.program;exactKeys(p,['kind','leader','crate','phase','leg','since','heardAt']);
                    if(spec.faction!=='mercenaries'||!identity(p.leader)||!identity(p.crate)
                        ||!['collect','loading','advance','delivered','withdraw'].includes(p.phase)||!whole(p.leg,0,2)
                        ||!finite(p.since,0,raid.elapsed)||!finite(p.heardAt,0,raid.elapsed)
                        ||(['collect','loading'].includes(p.phase)&&p.leg!==0)||(p.phase==='delivered'&&p.leg!==2))fail();
                } else if(t.program.kind==='blockade') {
                    const p=t.program;exactKeys(p,['kind','leader','phase','waited','since']);
                    if(spec.faction!=='blockade'||!identity(p.leader)||!['none','waiting','granted','engaged'].includes(p.phase)
                        ||!finite(p.waited,0,Math.min(4,raid.elapsed))||!finite(p.since,0,raid.elapsed)
                        ||p.phase==='none'&&p.waited!==0||p.phase==='granted'&&p.waited!==4||p.phase==='waiting'&&p.waited>=4)fail();
                } else fail();
            }
            const initial = initialTactics(e.id, t.squad, t.version === 2 ? t.program : undefined);
            if (![1,2].includes(t.version) || !identity(t.squad) || !finite(t.awareness, 0, 1) || !finite(t.warning, 0, 5)
                || !['idle', 'warning', 'hostile', 'retreat'].includes(t.stance)
                || !['idle', 'windup', 'release', 'recovery', 'reload'].includes(t.phase) || !finite(t.phaseLeft, 0, 10)
                || !finite(t.lockedAim, -100, 100) || !whole(t.magazine, 0, spec.magazine) || !whole(t.reserve, 0, spec.reserve)
                || typeof t.signalUsed !== 'boolean'
                // The archetype's old gun (a raid from before #28 M4-02), or one of its ARMORY guns; a leader's parts only on one of those.
                || (t.equipment !== initial.equipment && (initial.equipment === null || !(armoryGuns(e.id) as (string | null)[]).includes(t.equipment)))
                || (Object.hasOwn(t, 'fit') && (!ARMED_LEADERS.has(e.id) || !(armoryGuns(e.id) as (string | null)[]).includes(t.equipment) || !validFit(t.equipment, t.fit)))
                || !Array.isArray(t.supplies) || t.supplies.length > 4
                || (e.hp > 0 ? t.killedBy !== null : t.killedBy !== 'player' && !raid.roster.some(r => r.uid === t.killedBy && r.uid !== e.uid))) fail();
            goods(t.supplies);
            const carried = initial.supplies;
            if (new Set(t.supplies.map(s => s.id)).size !== t.supplies.length
                || t.supplies.some(s => !carried.some(c => c.id === s.id && s.qty <= c.qty))) fail();
            const phaseLimit = t.phase === 'windup' ? spec.windup : t.phase === 'reload' ? spec.reload : spec.recovery;
            if (t.phase !== 'release' && t.phaseLeft > phaseLimit) fail();
            if (t.phase === 'idle' && t.phaseLeft !== 0) fail();
            if (t.phase === 'release' && (spec.attack !== 'pounce' ? t.phaseLeft !== 0 : t.phaseLeft > .3)) fail();
            if (t.phase === 'reload' && (spec.magazine === 0 || t.reserve === 0 || t.magazine === spec.magazine)) fail();
            if (t.memory !== null) {
                exactKeys(t.memory, ['at', 'time', 'source', 'target']); plainPoint(t.memory.at, map);
                if (!finite(t.memory.time, 0, raid.elapsed) || !['sight', 'sound', 'report', 'damage'].includes(t.memory.source)
                    || (t.memory.target !== 'player' && !raid.roster.some(r => r.uid === t.memory!.target && r.uid !== e.uid))) fail();
            }
        }
        enemies.set(e.uid, e);
        enemyMaps.set(e.uid, map.id);
    };
    for (const [mapId, layer] of Object.entries(raid.maps)) {
        const map = world.maps[mapId];
        exactKeys(layer, ['doors', 'localTime', 'enemies', 'loot', 'containers', 'bullets', 'noise']);
        if (!obj(layer) || !finite(layer.localTime, 0, raid.elapsed)) fail();
        exactKeys(layer.doors, map.doors.map(d => d.id));
        if (Object.values(layer.doors).some(v => typeof v !== 'boolean')) fail();
        if (!Array.isArray(layer.enemies) || layer.enemies.length > world.enemyCount || !Array.isArray(layer.loot) || layer.loot.length > 4000
            || !Array.isArray(layer.containers) || layer.containers.length > 100 || !Array.isArray(layer.bullets) || layer.bullets.length > 1000
            || (mapId !== raid.currentMap && layer.bullets.length > 0)) fail();
        layer.enemies.forEach(e => enemy(e, map));
        for (const l of layer.loot) {
            // A gun on the ground (gun format) carries its state: its uid is an entity's, its part uids are item uids.
            const ground = guns && D.isGun(l.id);
            exactKeys(l, ['uid', 'id', 'qty', 'relief', 'x', 'y', ...(ground ? ['gun'] : [])]); entity(l.uid); point(l, map);
            if (!hasOwnStringKey(D.ITEMS, l.id) || !whole(l.qty, 1, D.ITEMS[l.id].stack) || typeof l.relief !== 'boolean') fail();
            if (ground) {
                if (!validateGun(l.id, l.uid, l.gun).ok) fail();
                for (const part of gunUids({ uid: l.uid, parts: l.gun!.parts }).slice(1)) { if (invIds.has(part) || entities.has(part)) fail(); allocated(part); invIds.add(part); }
            }
        }
        for (const c of layer.containers) {
            exactKeys(c, ['id', 'runId', 'kind', 'name', 'x', 'y', 'inventory']);
            entity(c.id); point(c, map);
            if (c.runId !== raid.runId || !['crate', 'corpse'].includes(c.kind) || typeof c.name !== 'string' || !c.name.length || c.name.length > 100) fail();
            inventory(c.inventory, 6, 5); containers.push({ container: c, mapId });
        }
        for (const b of layer.bullets) {
            // Every player round of a v3 raid carries its shot's critical snapshot; enemy rounds and older raids never do.
            const snapshot = owned !== null && !b.enemy;
            exactKeys(b, ['uid', 'x', 'y', 'rotation', 'vx', 'vy', 'left', 'damage', 'enemy', ...(rpgEnabled(raid) && b.enemy ? ['owner'] : []), ...(snapshot ? ['crit'] : [])]);
            entity(b.uid); point(b, map);
            if (!finite(b.vx, -1000, 1000) || !finite(b.vy, -1000, 1000) || !finite(b.left, 0, 2000) || !finite(b.damage, 0, 1000)
                || !finite(b.rotation, -100, 100) || typeof b.enemy !== 'boolean'
                || (rpgEnabled(raid) && b.enemy && !raid.roster.some(e => e.uid === b.owner))) fail();
            if (snapshot) critSnapshot(b.crit, owned, raid.roster);
        }
        if (layer.noise !== null) { exactKeys(layer.noise, ['at', 'radius', 'remaining']); plainPoint(layer.noise.at, map); if (!finite(layer.noise.radius, 0, 2000) || !finite(layer.noise.remaining, 0, 10)) fail(); }
    }
    const events = new Set<string>();
    for (const event of raid.pursuits) {
        exactKeys(event, ['id', 'enemy', 'sourceMap', 'targetMap', 'entry', 'path', 'distance', 'speed', 'registeredAt', 'arrivalAt', 'waiting']);
        const from = world.maps[event.sourceMap], target = world.maps[event.targetMap], entry = from?.entries.find(e => e.id === event.entry);
        if (!/^pursuit-[0-9]+$/.test(event.id) || events.has(event.id) || !from || !target || !entry || entry.targetMap !== event.targetMap
            || !Array.isArray(event.path) || !event.path.length || event.path.length > 4000 || !finite(event.distance, 0, 1e6)
            || !finite(event.speed, .01, 1000) || !finite(event.registeredAt, 0, raid.elapsed) || !finite(event.arrivalAt, event.registeredAt + 1, 1e6)
            || typeof event.waiting !== 'boolean' || event.enemy.hp <= 0) fail();
        if (entities.has(event.id) || invIds.has(event.id)) fail(); allocated(event.id);
        events.add(event.id); event.path.forEach(p => plainPoint(p, from)); enemy(event.enemy, from);
        if (!entry) return fail();
        const length = event.path.slice(1).reduce((sum, p, i) => sum + separation(event.path[i], p), 0);
        if (Math.abs(length - event.distance) > 1e-6 || separation(event.path.at(-1)!, entry.at) > 1e-6
            || Math.abs(event.arrivalAt - (event.registeredAt + event.distance / event.speed + 1)) > 1e-6) fail();
    }
    if ([...invIds].some(id => entities.has(id) || events.has(id))) fail();
    const cargoOwners=new Map<string,string>(),recoveryTeams=new Map<string,EnemyState[]>();
    for(const e of enemies.values()) {
        const t=e.tactics,p=t?.version===2?t.program:null;if(p?.kind!=='recovery')continue;
        const leader=enemies.get(p.leader),lt=leader?.tactics,order=lt?.version===2?lt.program:null;
        if(order?.kind!=='recovery')return fail();
        const cargo=containers.find(c=>c.container.id===p.crate),mapId=enemyMaps.get(e.uid);
        const post=RECOVERY_POSTS.find(post=>post.id===e.id);
        if(!leader||leader.id!=='recovery-leader'||order?.kind!=='recovery'||order.leader!==leader.uid
            ||order.crate!==p.crate||lt!.squad!==t!.squad||enemyMaps.get(leader.uid)!==mapId
            ||world.id!=='coast-buildings-v1'||mapId!=='coast'||!post||e.home.x!==post.home.x||e.home.y!==post.home.y
            ||!cargo||cargo.mapId!==mapId||cargo.container.kind!=='crate'
            ||e.id==='recovery-leader'&&e.uid!==p.leader||cargoOwners.has(p.crate)&&cargoOwners.get(p.crate)!==p.leader)fail();
        cargoOwners.set(p.crate,p.leader);
        const team=recoveryTeams.get(p.leader)??[];team.push(e);recoveryTeams.set(p.leader,team);
        if(p.leg>order.leg)fail();
        if(p.phase!=='withdraw') {
            const rank=['collect','loading','advance','delivered','withdraw'];
            if(p.heardAt<p.since||p.since>order.since||p.leg>order.leg||rank.indexOf(p.phase)>rank.indexOf(order.phase))fail();
        }
    }
    for(const team of recoveryTeams.values())if(team.length!==4||new Set(team.map(e=>e.id)).size!==4)fail();
    const checkpointTeams=new Map<string,EnemyState[]>();
    for(const e of enemies.values()) {
        const t=e.tactics,p=t?.version===2?t.program:null;if(p?.kind!=='blockade')continue;
        const leader=enemies.get(p.leader),lt=leader?.tactics,order=lt?.version===2?lt.program:null;
        if(!leader||leader.id!=='blockade-sergeant'||order?.kind!=='blockade'||order.leader!==leader.uid)return fail();
        const post=BLOCKADE_POSTS.find(post=>post.id===e.id),mapId=enemyMaps.get(e.uid);
        if(world.id!=='coast-buildings-v1'||mapId!=='coast'||enemyMaps.get(leader.uid)!==mapId||t!.squad!==lt!.squad
            ||!post||e.home.x!==post.home.x||e.home.y!==post.home.y||e.id==='blockade-sergeant'&&e.uid!==p.leader
            ||p.phase==='granted'&&!['granted','engaged'].includes(order.phase)||p.phase==='waiting'&&order.phase==='none'
            ||p.phase!=='engaged'&&p.since>order.since)fail();
        const team=checkpointTeams.get(p.leader)??[];team.push(e);checkpointTeams.set(p.leader,team);
    }
    for(const team of checkpointTeams.values())if(team.length!==3||new Set(team.map(e=>e.id)).size!==3)fail();
    raid.roster.forEach(e => exactKeys(e, ['uid', 'id']));
    if (new Set(raid.roster.map(e => e.uid)).size !== world.enemyCount || enemies.size !== world.enemyCount
        || raid.roster.some(e => !identity(e.uid) || (!hasOwnStringKey(D.ENEMIES, e.id) && !(enemyRules(raid) && archetype(e.id))) || enemies.get(e.uid)?.id !== e.id)
        || raid.kills !== [...enemies.values()].filter(e => e.hp <= 0 && (!e.tactics || e.tactics.killedBy === 'player')).length) fail();
    for (const { container: c, mapId } of containers.filter(c => c.container.kind === 'corpse')) {
        const dead = enemies.get(c.id.replace(/^corpse-/, ''));
        if (!c.id.startsWith('corpse-') || !dead || dead.hp > 0 || enemyMaps.get(dead.uid) !== mapId) fail();
    }
    exactKeys(raid.training, ['quantity', 'credited', 'eligibleDamage', 'healedByEnemy', 'motion']);
    if (Object.keys(raid.training.eligibleDamage).some(id => !enemies.has(id)) || Object.keys(raid.training.healedByEnemy).some(id => !enemies.has(id))) fail();
    attributes(raid.training.quantity, 0, 1e6); attributes(raid.training.credited, 0, .45);
    dictionary(raid.training.eligibleDamage, 50); dictionary(raid.training.healedByEnemy, 50);
    if (!obj(raid.training.motion) || !finite(raid.training.motion.windowStarted, 0, raid.elapsed) || !finite(raid.training.motion.localSeconds, 0, 15)) fail();
    exactKeys(raid.training.motion, ['anchor', 'windowStarted', 'localSeconds']);
    if (raid.training.motion.anchor !== null) plainPoint(raid.training.motion.anchor, world.maps[raid.currentMap]);
    return structuredClone(state);
}
