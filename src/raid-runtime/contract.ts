/** Opus v1 with additive R6 facts (2026-10-09); no simulation or save schema changes. */
import type { Inventory } from '../domain';
import type { LootTransfer } from '../loot';
import type { CritBreakdown } from '../perks';
import type { MutationResult } from '../session';

/** Durable actions and detached reads offered to a raid view. Implemented by raid-runtime/host, never by a view.
 * Read again after any transaction: rollback/restore may replace loadout and world objects. */
export interface CoastServices {
    cancelStart(): void;
    activate(ref: TargetRef): boolean;
    transferLoot(ref: TargetRef, request: LootTransfer): MutationResult;
    useSupply(id: string, from?: 'bag' | 'safe', uid?: string): MutationResult;
    equipItem(uid: string): MutationResult;
    dropItem(uid: string, from?: 'bag' | 'safe'): MutationResult;
    /** Live carried kg, including worn charm and loaded rounds; views only format this value. */
    carriedWeight(): number;
    /** Live movement limit in kg. Session expansion is the last checkpoint and can still contain expired buffs. */
    carryLimit(): number;
    retrySave(): boolean;
    retrySettlement(): boolean;
    settlement(): { reason: 'extract' | 'death' | 'timeout' | 'abandon' | null; committed: boolean; retryable: boolean; result: unknown };
    abandon(): void;
    checkpoint(): boolean;
    lootContext(): { containerId: string; runId: string } | null;
    lootInventory(ref: TargetRef): Inventory | null;
    /** Playtest sample gun, only from an explicit URL mark (see playtestMarks). */
    sampleGun(id: 'm4a1' | null): void;
}
export interface CoastHandle { runtime: RaidRuntime; services: CoastServices }

export type Point = Readonly<{
    x: number;
    y: number;
}>;
export type Rect = Readonly<{
    x: number;
    y: number;
    w: number;
    h: number;
}>;
export type WorldKey = Readonly<{
    runId: string;
    worldVersion: string;
    layoutRevision: string | null;
    mapId: string;
}>;
export const worldKeyString = (k: WorldKey) => `${k.runId}|${k.worldVersion}|${k.layoutRevision ?? '-'}|${k.mapId}`;
export type FrameStamp = Readonly<{
    world: WorldKey;
    epoch: number;
    revision: number;
    simulationTime: number;
}>;
export type Cell = 'floor' | 'wall' | 'window' | 'low' | 'tide';
export type TerrainCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DoorDef = Readonly<{
    id: string;
    x: number;
    y: number;
    wall: 'ew' | 'ns';
    anchors: readonly [
        Point,
        Point
    ];
}>;
export type EntryDef = Readonly<{
    id: string;
    at: Point;
    label: string;
    targetMap: string;
    kind: 'up' | 'down' | 'portal';
}>;
export type RegionDef = Readonly<{
    id: string;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    inside: boolean;
    sealed: boolean;
    buildingId: string | null;
}>;
export type BuildingDef = Readonly<{
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
    w: number;
    h: number;
    regionIds: readonly string[];
}>;
export type NoteDef = Readonly<{
    id: string;
    at: Point;
    title: string;
}>;
export type ExitDef = Readonly<{
    id: string;
    name: string;
    at: Point;
    radius: number;
}>;
export type DecorationDef = Readonly<{
    id: string;
    x: number;
    y: number;
    kind: 'B' | 'M' | 'V';
    name: string;
}>;
export type MapDef = Readonly<{
    key: WorldKey;
    name: string;
    floor: string;
    tile: 32;
    cols: number;
    rows: number;
    cells: readonly (readonly Cell[])[];
    terrain: readonly (readonly TerrainCode[])[];
    doors: readonly DoorDef[];
    entries: readonly EntryDef[];
    regions: readonly RegionDef[];
    buildings: readonly BuildingDef[];
    decorations: readonly DecorationDef[];
    exits: readonly ExitDef[];
    notes: readonly NoteDef[];
    bounds: Rect;
}>;
export type ActorKind = 'player' | 'scav' | 'salt' | 'elite' | 'creature';
export type WeaponLook = 'pistol' | 'shotgun' | 'carbine' | 'knife' | 'club' | 'claw' | 'rifle';
export type ActorView = Readonly<{
    uid: string;
    kind: ActorKind;
    x: number;
    y: number;
    aim: number;
    vx: number;
    vy: number;
    hp: number;
    maxHp: number;
    alive: boolean;
    weapon: WeaponLook;
    /** New encounters only; legacy projections omit this field. Visual phase, not a second combat clock. */
    tactics?: Readonly<{ archetype: string; name: string; phase: 'idle' | 'windup' | 'release' | 'recovery' | 'reload';
        stance: 'idle' | 'warning' | 'hostile' | 'retreat'; awareness: number; left: number; total: number; range: number; aim: number;
        warningLeft: number; boundary: Readonly<{ at: Point; radius: number }> | null;
        /** One available guard projects the received permission and static ground markings, never a view-owned timer. */
        checkpoint?: Readonly<{ phase:'none'|'waiting'|'granted'|'engaged'; waited:number; waiting:Rect; passage:Rect }> }>;
    state: Readonly<{
        moving: boolean;
        sprinting: boolean;
        precise: boolean;
        reloading: Readonly<{
            left: number;
            total: number;
        }> | null;
        attackCooldown: number;
        hurtLeft: number;
        ai: 'patrol' | 'investigate' | 'chase' | 'attack' | 'return' | null;
    }>;
    regionId: string | null;
    corpse: Readonly<{
        angle: number;
        containerId: string | null;
    }> | null;
}>;
export type BulletView = Readonly<{
    uid: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    enemy: boolean;
    owner: string | null;
}>;
export type GroundLootView = Readonly<{
    uid: string;
    item: string;
    qty: number;
    x: number;
    y: number;
    regionId: string | null;
}>;
export type ContainerView = Readonly<{
    id: string;
    runId: string;
    kind: 'crate' | 'corpse';
    name: string;
    x: number;
    y: number;
    stacks: number;
    totalQty: number;
    ownerUid: string | null;
    regionId: string | null;
}>;
export type TargetRef = Readonly<{
    runId: string;
    mapId: string;
    kind: Interaction['kind'];
    id: string;
}>;
export type Interaction = Readonly<{
    ref: TargetRef;
    kind: 'exit' | 'entry' | 'door' | 'ground' | 'container' | 'note' | 'talk';
    at: Point;
    label: string;
    hold: Readonly<{
        required: number;
        progress: number;
    }> | null;
    choices: readonly Readonly<{
        id: string;
        name: string;
        empty: boolean;
        selected: boolean;
    }>[];
    /** Ground items in pickup reach (the Runtime's nearbyLoot rule), nearest first, while E names a container or a ground
     * item: docs/LOOTING.md「附近」. Each is picked up on its own through activate({ kind: 'ground', id }); empty otherwise. */
    nearby: readonly Readonly<{
        id: string;
        item: string;
        qty: number;
    }>[];
}>;
/**
 * The player's weapon handling as the next shot would meet it (PR #39). Display only: the Runtime decides every shot.
 * Angles are radians; `drift` turns the centre of the cone toward the shooter's right (clockwise on the map).
 */
export type AimView = Readonly<{
    mode: 'semi' | 'auto';
    /** Full cone angle a shot fired now scatters over (stance, sway, bloom and the body's state). */
    cone: number;
    drift: number;
    /** Precise aim raised, body sway and bloom, each 0 to 1. */
    raise: number;
    sway: number;
    bloom: number;
}>;
/**
 * The breath charge (technique-15-a, src/breath.ts) as the next shot would snapshot it. Display only: the Runtime times
 * the charge and decides every shot, and a view shows these numbers without deriving them again.
 */
export type BreathView = Readonly<{
    /** Enemy uid the precise aim rests on, or null: no charge. */
    target: string | null;
    /** Effective seconds aimed at `target`, uncapped (0 without one). */
    seconds: number;
    /** The breath source's own chance, 0 to 0.3: 0.1 per second, full from 3 s on. It counts only on a hit on `target`. */
    chance: number;
    /** Seconds that charge it in full (3): a view's progress runs from 0 to this, and `seconds` beyond it adds nothing. */
    full: number;
}>;
/**
 * The critical chance of the gun in hand (docs/CRITICAL-PERK-DESIGN.md section 2.3) as a shot fired now would snapshot
 * it: CoastRaidRuntime.shotCrit derives it for the HUD and for the shot alike, and a view prints these values without
 * deriving them again. Display only: the Runtime decides every shot.
 */
export type CritChanceView = Readonly<{
    /**
     * 'v3': the new rule, independent sources multiplied (spec 2.1). 'old': a v1 or v2 raid keeps the critical rule it
     * started with until it settles, so it shows no perk value.
     */
    rule: 'v3' | 'old';
    /** v3 with a gun in hand: its static breakdown, the breath charge left out. Null with the knife (it never crits: not applicable) and in an old raid. */
    gun: Readonly<CritBreakdown> | null;
    /** v3 while the breath charge (HudView.breath) holds a target: the breakdown a shot fired now has on a hit on that enemy, the charge included. */
    onTarget: Readonly<CritBreakdown> | null;
}>;
export type HudView = Readonly<{
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    pollution: number;
    bleeding: boolean;
    /** Live layered body values, detached from simulation state; null for classic raids. Never checkpoint-derived. */
    needs: Readonly<{ mental: number; water: number; satiety: number }> | null;
    timeLeft: number;
    tideWarning: boolean;
    highTide: boolean;
    weapon: Readonly<{
        id: string;
        name: string;
        mag: number;
        magSize: number;
        reserve: number;
        reloading: boolean;
    }>;
    aim: AimView;
    /** Null unless this raid owns technique-15-a (a v3 raid). With the knife drawn the charge stays empty. */
    breath: BreathView | null;
    /** Null in a classic raid, which has no such critical rule to show. */
    crit: CritChanceView | null;
    heals: number;
    hitDirections: readonly Readonly<{
        angle: number | null;
        left: number;
    }>[];
}>;
export type HurtCause = 'blow' | 'bleed' | 'pollution' | 'dehydration' | 'starvation' | 'limit-change';
export type ViewFrame = Readonly<{
    player: ActorView;
    actors: readonly ActorView[];
    bullets: readonly BulletView[];
    loot: readonly GroundLootView[];
    containers: readonly ContainerView[];
    doors: Readonly<Record<string, boolean>>;
    highTide: boolean;
    /** Row-major indices y * map.cols + x of tidal cells currently submerged; permanent water is map.terrain. */
    flooded: readonly number[];
    revealed: Readonly<Record<string, boolean>>;
    interaction: Interaction | null;
    hud: HudView;
    phase: 'running' | 'paused' | 'blocked' | 'ending';
}>;
export type Durability = 'accepted' | 'committed';
export type PelletView = Readonly<{
    bullet: string;
    origin: Point;
    angle: number;
}>;
export type ImpactReason = 'blocked' | 'hit-actor' | 'range' | 'bounds' | 'start-blocked';
export type ViewEventBody = {
    type: 'shot';
    shotId: string;
    shooter: string;
    weapon: WeaponLook;
    pellets: readonly PelletView[];
} | {
    type: 'melee';
    attacker: string;
    angle: number;
    range: number;
    hit: string | null;
} | {
    type: 'impact';
    bullet: string;
    /** player, enemy UID, or null when an old enemy bullet has no recorded owner. */
    owner: string | null;
    reason: ImpactReason;
    lastFree: Point;
    contact: Point | null;
    normal: Point | null;
    surface: 'wall' | 'door' | 'actor' | null;
    target: string | null;
} | {
    type: 'hurt';
    cause: HurtCause;
    uid: string;
    at: Point;
    damage: number;
    critical: boolean;
    /** Live bullet identity for presentation correlation with shot.pellets. Not persisted; melee/other blows omit it.
     * A restored bullet may have an identity without a witnessed shot, so consumers must retain an unknown-source fallback. */
    bullet?: string;
    /**
     * Radians from the hurt actor back toward the blow's source: against a bullet's flight, toward a melee attacker. Null
     * when the source is unknown. The view sprays blood this way and knocks the body the opposite way.
     */
    angle: number | null;
} | {
    type: 'death';
    uid: string;
    /** Authored encounters identify the final attacker; older four-ID events omit this field. */
    killer?: string;
    corpseAngle: number;
    containerId: string | null;
} | {
    type: 'door';
    id: string;
    open: boolean;
    by: string;
} | {
    type: 'looted';
    source: string;
    item: string;
    qty: number;
    partial: boolean;
    to: 'bag' | 'safe' | 'equip';
} | {
    type: 'layer';
    from: string;
    to: string;
    via: string;
} | {
    type: 'extract-progress';
    progress: number;
    required: number;
} | {
    type: 'rejected';
    action: string;
    /** Stable failure code, or a player-facing explanation for a refused supply/storage error.
     * Door refusals distinguish 'unreachable' from 'occupied'; no success side effects survive rejection.
     */
    reason: string;
} | {
    type: 'notice';
    text: string;
    seconds: number;
};
export type StampedEvent = Readonly<{
    seq: number;
    stamp: FrameStamp;
    durability: Durability;
} & ViewEventBody>;
export type PublishedView = Readonly<{
    stamp: FrameStamp;
    map: MapDef;
    frame: ViewFrame;
    events: readonly StampedEvent[];
}>;
/**
 * One display frame's input, read at `nowMs` of `advance`. `aim` is a ground-plane angle in radians (null keeps the
 * facing). Commands and `interactPressed` act in the frame's first substep. The trigger is different: `firePressed`
 * (a click) and a new hold take effect at the frame's own time; a hold fires at the weapon's rate over a frame's
 * interval only while this frame still reports it, so a release never lets another shot out. Input changing on frame
 * boundaries fires at the same raid times at any display rate. Whether holding repeats depends on the weapon
 * (automatic) and on `source` (touch repeats semi-automatic guns too).
 */
export type RaidIntent = Readonly<{
    move: Readonly<{
        x: number;
        y: number;
        sprint: boolean;
    }>;
    aim: number | null;
    precise: boolean;
    firePressed: boolean;
    /** The trigger is held: the touch aim stick past its fire ring, or the left button outside the phone layout. */
    fireHeld: boolean;
    /**
     * The touch aim stick is in use (either ring). Standing with it inside the fire ring raises a precise aim, and past
     * the ring the raise holds; unlike `precise` it neither slows the walk nor widens the view (maintainer, 2026-10-22).
     */
    aimHeld: boolean;
    interactPressed: boolean;
    interactHeld: boolean;
    commands: readonly ('reload' | 'heal' | 'primary' | 'knife')[];
    selectTarget: string | null;
    source: 'mouse-keyboard' | 'touch';
}>;
export interface RaidRuntime {
    advance(nowMs: number, intent: RaidIntent): PublishedView;
    /** After mount/first texture bake or layer rebuild, discard the next wall-clock gap.
     * Does not advance simulation, write a checkpoint, resume a pause, or relax monotonic timestamps.
     * Call once after synchronous rendering work completes, never on every frame (real stalls must still pause).
     */
    resetClock(): void;
    pause(reason: 'overlay' | 'blur' | 'stall' | 'context-lost'): void;
    resume(): void;
    setBlocked(blocked: boolean): void;
    current(): PublishedView;
    dispose(): void;
}
