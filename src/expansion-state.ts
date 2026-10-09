import * as D from './domain';
import type { ActorState, BulletState, EnemyState, LootState, RaidCheckpoint } from './checkpoint';
import type { LootContainer } from './loot';
import type { Point } from './world';
import { inSpace, separation, traversable, checkpointBodyFits, validateSpaces, type SpaceDefinition } from './spatial';

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
export interface LayeredRaid {
    version: 1 | 2; worldVersion: string; layoutRevision: string; seed: number; runId: string;
    currentMap: string; player: ActorState; loadout: D.RunLoadout;
    elapsed: number; initialHigh: boolean; highTide: boolean; warned: boolean; tideChanged: boolean;
    kills: number; rng: number; nextEntity: number; maps: Record<string, LayerState>; pursuits: PursuitState[];
    training: TrainingState; reloadLeft: number; fireCooldown: number; knife: boolean; hitTime: number;
    /** Stable birth roster prevents ownership transfer from changing the population. */
    roster: { uid: string; id: string }[];
    eventRolled: boolean;
    mapEvent?: 'none' | 'neutral' | 'good' | 'bad';
    /** v2 RPG checkpoint: last qualifying shock, measured on the global action clock. */
    shockAt?: number;
}
/** v2 generated identities stay unique when loot survives into another action. */
export function entityUid(raid: Pick<LayeredRaid, 'version' | 'runId'>, serial: number): string {
    return raid.version === 2 ? `entity-${raid.runId}-${serial}` : `entity-${serial}`;
}
export interface ExpansionState {
    version: 1 | 2; body: BodyState; growth: GrowthState; base: BaseState; raid: LayeredRaid | null;
    charm?: D.Item | null;
    awards?: string[];
}
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
export function effectiveAttributes(state: ExpansionState): Attributes {
    return Object.fromEntries(ATTRIBUTES.map(a => [a, Math.max(1, Math.min(40, state.growth.permanent[a] + (state.body.effects[a] > 0 ? 5 : 0)))])) as Attributes;
}
export function derivedLimits(state: ExpansionState) {
    const a = effectiveAttributes(state);
    return { hp: 100 + 3 * (a.constitution - 10), stamina: 100 + 2 * (a.strength - 10), carry: 24 + .6 * (a.strength - 10) };
}

const fail = (): never => { throw new Error('建筑、角色或基地存档损坏或版本不兼容。原始数据已保留。'); };
function obj(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function n(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function integer(value: unknown, min = 0, max = 1e9): value is number { return n(value, min, max) && Number.isSafeInteger(value); }
function identity(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
function exactKeys(value: unknown, keys: readonly string[]) { if (!obj(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(); }
function attributes(value: unknown, min: number, max: number, whole = false) {
    exactKeys(value, ATTRIBUTES);
    for (const a of ATTRIBUTES) if (!(whole ? integer((value as Attributes)[a], min, max) : n((value as Attributes)[a], min, max))) fail();
}
function dictionary(value: unknown, max: number) {
    if (!obj(value) || Object.keys(value).length > 1000 || Object.entries(value).some(([id, amount]) => !identity(id) || !n(amount, 0, max))) fail();
}
function goods(value: unknown) {
    if (!Array.isArray(value) || value.length > 30 || value.some(i => !obj(i) || Object.keys(i).length !== 2 || !Object.hasOwn(D.ITEMS, i.id) || !integer(i.qty, 1, 300))) fail();
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
        || !integer(value.workbenchLevel, 1, 3) || !n(value.duration, 1, 1800) || !n(value.remaining, 0, value.duration) || !integer(value.paidCash)) fail();
    goods(value.paidItems); goods(value.result);
    const recipe = RECIPES[value.recipe];
    const matchingGoods = (a: readonly { id: string; qty: number }[], b: readonly { id: string; qty: number }[]) =>
        a.length === b.length && a.every((i, index) => i.id === b[index].id && i.qty === b[index].qty);
    if (value.workbenchLevel < recipe.level || value.duration !== recipe.seconds * PRODUCTION_SPEED[value.workbenchLevel]
        || value.paidCash !== recipe.cash || !matchingGoods(value.paidItems, recipe.materials) || !matchingGoods(value.result, recipe.result)) fail();
}

/** Complete validation is shared by imports and the single-record commit, before publishing state. */
export function validateExpansion(value: unknown, profile: D.SaveDataV1, legacyRaid: RaidCheckpoint | null, resolveWorld: WorldResolver): ExpansionState {
    const state = value as ExpansionState;
    exactKeys(state, ['version', 'body', 'growth', 'base', 'raid', ...(state.version === 2 ? ['charm', 'awards'] : [])]);
    if (![EXPANSION_VERSION, 2].includes(state.version) || !obj(state.body) || !obj(state.growth) || !obj(state.base)) fail();
    const { body, growth, base } = state;
    if (state.version === 2) {
        if (!Array.isArray(state.awards) || state.awards.length > 1000 || state.awards.some(id => !identity(id)) || new Set(state.awards).size !== state.awards.length) fail();
        const charm = state.charm;
        if (charm !== null) {
            if (!obj(charm) || !identity(charm.uid) || !['luckyCharm', 'unluckyCharm'].includes(charm.id) || charm.qty !== 1 || charm.x !== 0 || charm.y !== 0 || charm.rotated !== undefined || charm.relief !== undefined
                || [profile.stash, profile.bag, profile.safe, state.raid?.loadout.bag].filter(Boolean).some(inv => inv!.items.some(i => i.uid === charm.uid))) fail();
            exactKeys(charm, ['uid', 'id', 'qty', 'x', 'y']);
        }
    }
    exactKeys(body, ['hp', 'stamina', 'mental', 'water', 'satiety', 'pollution', 'bleeding', 'exhausted', 'effects', 'treatment', 'luckEffect']);
    exactKeys(growth, ['permanent', 'progress', 'reputation', 'luck']);
    exactKeys(base, ['facilities', 'queue', 'completed', 'nextBatch', 'cursor', 'location', 'restSeconds', 'energizedGranted', 'extractedPearl', 'training']);
    attributes(growth.permanent, 10, 30, true); attributes(growth.progress, 0, 1);
    if (ATTRIBUTES.some(a => growth.progress[a] >= 1 || (growth.permanent[a] === 30 && growth.progress[a] !== 0))) fail();
    if (!obj(growth.reputation) || Object.keys(growth.reputation).length > 100 || Object.entries(growth.reputation).some(([id, amount]) => !identity(id) || !integer(amount, -100, 100))
        || !integer(growth.luck, -3, 5)) fail();
    exactKeys(body.effects, EFFECTS);
    for (const e of EFFECTS) if (!n(body.effects[e], 0, EFFECT_MAX[e])) fail();
    const limits = derivedLimits(state);
    if (!n(body.hp, 0, limits.hp) || !n(body.stamina, 0, limits.stamina)
        || ['mental', 'water', 'satiety', 'pollution'].some(k => !n(body[k as keyof BodyState], 0, 100))
        || typeof body.bleeding !== 'boolean' || typeof body.exhausted !== 'boolean' || !integer(body.luckEffect, -1, 1)
        || (body.effects.luck === 0 && body.luckEffect !== 0)) fail();
    exactKeys(body.treatment, ['bleeding', 'pain', 'injectionFatigue']);
    if (Object.values(body.treatment).some(v => !n(v, 0, 120))) fail();
    exactKeys(base.facilities, FACILITIES);
    if (FACILITIES.some(f => !integer(base.facilities[f], 0, 3)) || !integer(base.cursor, 0, Number.MAX_SAFE_INTEGER)
        || !integer(base.nextBatch, 1) || !['base', 'raid', 'settlement'].includes(base.location)
        || !n(base.restSeconds, 0, 120) || typeof base.energizedGranted !== 'boolean' || typeof base.extractedPearl !== 'boolean'
        || !Array.isArray(base.queue) || base.queue.length > base.facilities.workbench || !Array.isArray(base.completed) || base.completed.length > 3) fail();
    const batchIds = new Set<string>();
    for (const b of [...base.queue, ...base.completed]) {
        batch(b);
        const id = /^batch-([0-9]+)$/.exec(b.id);
        if (batchIds.has(b.id) || !id || !integer(Number(id[1]), 1, base.nextBatch - 1)
            || b.workbenchLevel > base.facilities.workbench || base.facilities.medical < RECIPES[b.recipe].medical) fail();
        batchIds.add(b.id);
    }
    if (base.completed.some(b => b.remaining !== 0) || base.queue.some((b, i) => i > 0 && b.remaining !== b.duration)) fail();
    if (!obj(base.training) || !integer(base.training.startedAt, 0, Number.MAX_SAFE_INTEGER) || !n(base.training.quantity, 0, 1)
        || !n(base.training.activeSeconds, 0, 120) || (base.training.attribute !== null && !ATTRIBUTES.includes(base.training.attribute))) fail();
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
    exactKeys(raid, ['version', 'worldVersion', 'layoutRevision', 'seed', 'runId', 'currentMap', 'player', 'loadout', 'elapsed', 'initialHigh', 'highTide', 'warned', 'tideChanged', 'kills', 'rng', 'nextEntity', 'maps', 'pursuits', 'training', 'reloadLeft', 'fireCooldown', 'knife', 'hitTime', 'roster', 'eventRolled', ...(raid.version === 2 ? ['shockAt', 'mapEvent'] : [])]);
    const world = resolveWorld(raid.worldVersion);
    if (!world) return fail();
    if (![1, 2].includes(raid.version) || (raid.version === 2 && (!n(raid.shockAt, -10, raid.elapsed) || !['none', 'neutral', 'good', 'bad'].includes(raid.mapEvent!))) || raid.layoutRevision !== world.revision || !integer(raid.seed, 1, 0xffffffff)
        || raid.runId !== profile.activeRun?.runId || raid.seed !== profile.activeRun.seed || raid.loadout?.runId !== raid.runId) fail();
    validateSpaces(world.maps);
    exactKeys(raid.maps, Object.keys(world.maps));
    exactKeys(raid.player, ['x', 'y', 'rotation']);
    if (!Object.hasOwn(raid.maps, raid.currentMap) || !inSpace(world.maps[raid.currentMap], raid.player, 10) || !n(raid.player.rotation, -100, 100)
        || !n(raid.elapsed, 0, 600) || !integer(raid.rng, 0, 0xffffffff) || !integer(raid.nextEntity, 1)
        || !integer(raid.kills, 0, world.enemyCount) || !Array.isArray(raid.roster) || raid.roster.length !== world.enemyCount
        || !Array.isArray(raid.pursuits) || raid.pursuits.length > world.enemyCount) fail();
    for (const flag of ['initialHigh', 'highTide', 'warned', 'tideChanged', 'knife', 'eventRolled'] as const) if (typeof raid[flag] !== 'boolean') fail();
    if (raid.warned !== (raid.elapsed >= 270) || raid.tideChanged !== (raid.elapsed >= 300)
        || raid.highTide !== (raid.tideChanged ? !raid.initialHigh : raid.initialHigh)) fail();
    // A high-tide checkpoint may legitimately contain a character still escaping water;
    // permanent walls/windows/furniture and closed doors are never valid body positions.
    const bodyFits = (mapId: string, p: Point) => checkpointBodyFits({ definition: world.maps[mapId], doors: raid.maps[mapId]?.doors ?? {}, highTide: false }, p);
    if (!bodyFits(raid.currentMap, raid.player)) fail();
    for (const key of ['reloadLeft', 'fireCooldown', 'hitTime'] as const) if (!n(raid[key], 0, 10)) fail();
    const invIds = new Set<string>(state.charm ? [state.charm.uid] : []);
    const allocated = (id: string) => {
        const prefix = `entity-${raid.runId}-`;
        const match = raid.version === 2 && id.startsWith(prefix) ? /^([0-9]+)$/.exec(id.slice(prefix.length))
            : /^(?:entity|pursuit)-([0-9]+)$/.exec(id);
        if (raid.version === 2 && id.startsWith(prefix) && !match) fail();
        if (raid.version === 2 && id.startsWith('entity-') && !id.startsWith(prefix)) return; // Retained loot from an older action.
        if (match && (!integer(Number(match[1]), 1) || Number(match[1]) >= raid.nextEntity)) fail();
    };
    const inventory = (inv: D.Inventory, w: number, h: number) => {
        exactKeys(inv, ['w', 'h', 'items']);
        if (!obj(inv) || inv.w !== w || inv.h !== h || !Array.isArray(inv.items) || inv.items.length > w * h) fail();
        const checked = D.createInventory(w, h);
        for (const i of inv.items) {
            exactKeys(i, ['uid', 'id', 'qty', 'x', 'y', ...('relief' in i ? ['relief'] : []), ...('rotated' in i ? ['rotated'] : [])]);
            if (!obj(i) || !identity(i.uid) || invIds.has(i.uid) || !Object.hasOwn(D.ITEMS, i.id) || !integer(i.qty, 1, D.ITEMS[i.id].stack)
                || !integer(i.x) || !integer(i.y) || (i.relief !== undefined && typeof i.relief !== 'boolean')
                || (i.rotated !== undefined && typeof i.rotated !== 'boolean') || !D.fits(checked, i.id, i.x, i.y, undefined, !!i.rotated)) fail();
            allocated(i.uid); invIds.add(i.uid); checked.items.push(i);
        }
    };
    inventory(profile.stash, 10, profile.upgraded ? 9 : 6); inventory(raid.loadout.bag, 6, 5); inventory(raid.loadout.safe, 2, 2);
    exactKeys(raid.loadout, ['bag', 'safe', 'weapon', 'ammo', 'ammoRelief', 'relief', 'runId']);
    const magazine = raid.loadout, gun = magazine.weapon === null ? null : D.WEAPONS[magazine.weapon];
    if ((magazine.weapon !== null && (!gun || magazine.weapon === 'knife')) || !integer(magazine.ammo, 0, gun?.magazine ?? 0)
        || !integer(magazine.ammoRelief, 0, magazine.ammo) || typeof magazine.relief !== 'boolean'
        || profile.bag.items.length || profile.equipment.weapon !== null) fail();
    const inventoryIdentity = (inv: D.Inventory) => JSON.stringify([inv.w, inv.h, inv.items.map(i => [i.uid, i.id, i.qty, i.x, i.y, !!i.relief, !!i.rotated])]);
    if (inventoryIdentity(profile.safe) !== inventoryIdentity(raid.loadout.safe)) fail();
    const entities = new Set<string>(), enemies = new Map<string, EnemyState>(), enemyMaps = new Map<string, string>();
    const containers: { container: LootContainer; mapId: string }[] = [];
    const entity = (uid: string) => { if (!identity(uid) || entities.has(uid) || invIds.has(uid)) fail(); allocated(uid); entities.add(uid); };
    const point = (p: Point, map: SpaceDefinition) => { if (!obj(p) || !inSpace(map, p)) fail(); };
    const plainPoint = (p: Point, map: SpaceDefinition) => { exactKeys(p, ['x', 'y']); point(p, map); };
    const enemy = (e: EnemyState, map: SpaceDefinition) => {
        if (!obj(e)) return fail();
        exactKeys(e, ['uid', 'id', 'hp', 'x', 'y', 'rotation', 'home', 'target', 'state', 'timer', 'cooldown', 'path', 'repath', 'alert']);
        entity(e.uid); point(e, map); plainPoint(e.home, map); plainPoint(e.target, map);
        if (!Object.hasOwn(D.ENEMIES, e.id) || !n(e.hp, 0, D.ENEMIES[e.id].hp) || !n(e.rotation, -100, 100)
            || !['patrol', 'investigate', 'chase', 'attack', 'return'].includes(e.state) || !Array.isArray(e.path) || e.path.length > 4000) fail();
        if (e.hp > 0 && !bodyFits(map.id, e)) fail();
        e.path.forEach(p => plainPoint(p, map));
        for (const key of ['timer', 'cooldown', 'repath', 'alert'] as const) if (!n(e[key], -10000, 10000)) fail();
        enemies.set(e.uid, e);
        enemyMaps.set(e.uid, map.id);
    };
    for (const [mapId, layer] of Object.entries(raid.maps)) {
        const map = world.maps[mapId];
        exactKeys(layer, ['doors', 'localTime', 'enemies', 'loot', 'containers', 'bullets', 'noise']);
        if (!obj(layer) || !n(layer.localTime, 0, raid.elapsed)) fail();
        exactKeys(layer.doors, map.doors.map(d => d.id));
        if (Object.values(layer.doors).some(v => typeof v !== 'boolean')) fail();
        if (!Array.isArray(layer.enemies) || layer.enemies.length > world.enemyCount || !Array.isArray(layer.loot) || layer.loot.length > 4000
            || !Array.isArray(layer.containers) || layer.containers.length > 100 || !Array.isArray(layer.bullets) || layer.bullets.length > 1000
            || (mapId !== raid.currentMap && layer.bullets.length > 0)) fail();
        layer.enemies.forEach(e => enemy(e, map));
        for (const l of layer.loot) { exactKeys(l, ['uid', 'id', 'qty', 'relief', 'x', 'y']); entity(l.uid); point(l, map); if (!Object.hasOwn(D.ITEMS, l.id) || !integer(l.qty, 1, D.ITEMS[l.id].stack) || typeof l.relief !== 'boolean') fail(); }
        for (const c of layer.containers) {
            exactKeys(c, ['id', 'runId', 'kind', 'name', 'x', 'y', 'inventory']);
            entity(c.id); point(c, map);
            if (c.runId !== raid.runId || !['crate', 'corpse'].includes(c.kind) || typeof c.name !== 'string' || !c.name.length || c.name.length > 100) fail();
            inventory(c.inventory, 6, 5); containers.push({ container: c, mapId });
        }
        for (const b of layer.bullets) {
            exactKeys(b, ['uid', 'x', 'y', 'rotation', 'vx', 'vy', 'left', 'damage', 'enemy', ...(raid.version === 2 && b.enemy ? ['owner'] : [])]);
            entity(b.uid); point(b, map);
            if (!n(b.vx, -1000, 1000) || !n(b.vy, -1000, 1000) || !n(b.left, 0, 2000) || !n(b.damage, 0, 1000)
                || !n(b.rotation, -100, 100) || typeof b.enemy !== 'boolean'
                || (raid.version === 2 && b.enemy && !raid.roster.some(e => e.uid === b.owner))) fail();
        }
        if (layer.noise !== null) { exactKeys(layer.noise, ['at', 'radius', 'remaining']); plainPoint(layer.noise.at, map); if (!n(layer.noise.radius, 0, 2000) || !n(layer.noise.remaining, 0, 10)) fail(); }
    }
    const events = new Set<string>();
    for (const event of raid.pursuits) {
        exactKeys(event, ['id', 'enemy', 'sourceMap', 'targetMap', 'entry', 'path', 'distance', 'speed', 'registeredAt', 'arrivalAt', 'waiting']);
        const from = world.maps[event.sourceMap], target = world.maps[event.targetMap], entry = from?.entries.find(e => e.id === event.entry);
        if (!/^pursuit-[0-9]+$/.test(event.id) || events.has(event.id) || !from || !target || !entry || entry.targetMap !== event.targetMap
            || !Array.isArray(event.path) || !event.path.length || event.path.length > 4000 || !n(event.distance, 0, 1e6)
            || !n(event.speed, .01, 1000) || !n(event.registeredAt, 0, raid.elapsed) || !n(event.arrivalAt, event.registeredAt + 1, 1e6)
            || typeof event.waiting !== 'boolean' || event.enemy.hp <= 0) fail();
        if (entities.has(event.id) || invIds.has(event.id)) fail(); allocated(event.id);
        events.add(event.id); event.path.forEach(p => plainPoint(p, from)); enemy(event.enemy, from);
        if (!entry) return fail();
        const length = event.path.slice(1).reduce((sum, p, i) => sum + separation(event.path[i], p), 0);
        if (Math.abs(length - event.distance) > 1e-6 || separation(event.path.at(-1)!, entry.at) > 1e-6
            || Math.abs(event.arrivalAt - (event.registeredAt + event.distance / event.speed + 1)) > 1e-6) fail();
    }
    if ([...invIds].some(id => entities.has(id) || events.has(id))) fail();
    raid.roster.forEach(e => exactKeys(e, ['uid', 'id']));
    if (new Set(raid.roster.map(e => e.uid)).size !== world.enemyCount || enemies.size !== world.enemyCount
        || raid.roster.some(e => !identity(e.uid) || !Object.hasOwn(D.ENEMIES, e.id) || enemies.get(e.uid)?.id !== e.id)
        || raid.kills !== [...enemies.values()].filter(e => e.hp <= 0).length) fail();
    for (const { container: c, mapId } of containers.filter(c => c.container.kind === 'corpse')) {
        const dead = enemies.get(c.id.replace(/^corpse-/, ''));
        if (!c.id.startsWith('corpse-') || !dead || dead.hp > 0 || enemyMaps.get(dead.uid) !== mapId) fail();
    }
    exactKeys(raid.training, ['quantity', 'credited', 'eligibleDamage', 'healedByEnemy', 'motion']);
    if (Object.keys(raid.training.eligibleDamage).some(id => !enemies.has(id)) || Object.keys(raid.training.healedByEnemy).some(id => !enemies.has(id))) fail();
    attributes(raid.training.quantity, 0, 1e6); attributes(raid.training.credited, 0, .45);
    dictionary(raid.training.eligibleDamage, 50); dictionary(raid.training.healedByEnemy, 50);
    if (!obj(raid.training.motion) || !n(raid.training.motion.windowStarted, 0, raid.elapsed) || !n(raid.training.motion.localSeconds, 0, 15)) fail();
    exactKeys(raid.training.motion, ['anchor', 'windowStarted', 'localSeconds']);
    if (raid.training.motion.anchor !== null) plainPoint(raid.training.motion.anchor, world.maps[raid.currentMap]);
    return structuredClone(state);
}
