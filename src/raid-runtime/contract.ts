/** Opus v1 with additive R6 facts (2026-10-09); no simulation or save schema changes. */
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
    kind: 'exit' | 'entry' | 'door' | 'ground' | 'container' | 'note';
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
}>;
export type HudView = Readonly<{
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    pollution: number;
    bleeding: boolean;
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
    angle: number | null;
} | {
    type: 'death';
    uid: string;
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
export type RaidIntent = Readonly<{
    move: Readonly<{
        x: number;
        y: number;
        sprint: boolean;
    }>;
    aim: number | null;
    precise: boolean;
    firePressed: boolean;
    fireHeld: boolean;
    interactPressed: boolean;
    interactHeld: boolean;
    commands: readonly ('reload' | 'heal' | 'primary' | 'knife')[];
    selectTarget: string | null;
    source: 'mouse-keyboard' | 'touch';
}>;
export interface RaidRuntime {
    advance(nowMs: number, intent: RaidIntent): PublishedView;
    pause(reason: 'overlay' | 'blur' | 'stall' | 'context-lost'): void;
    resume(): void;
    setBlocked(blocked: boolean): void;
    current(): PublishedView;
    dispose(): void;
}
