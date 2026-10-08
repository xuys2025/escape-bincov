/** Headless coastal raid. Rules transplanted from RaidScene at f144147; no renderer/DOM imports. */
import * as D from '../domain';
import { SURVIVAL as B } from '../balance';
import { WORLD, TILE, isWalkable, lineOfSight, findPath, findDryRefuge, generateRun, type RunConfig, type Point, type MapData } from '../world';
import { WORLD_VERSION, type ActorState, type RaidCheckpoint, type EnemyState as Enemy, type LootState, type BulletState } from '../checkpoint';
import { mapPresentation, buildingRunConfig } from '../building-world';
import { resolveExpansionWorld } from '../expansion-worlds';
import { derivedLimits, entityUid, type ExpansionState, type WorldDefinition, type EndReason } from '../expansion-state';
import { advanceRaidBody, enemyDamage, recordMotion, rpgMultipliers, useRpgItem } from '../rpg';
import { corridor, doorAnchor, interactionTarget, spacePath, toggleDoor, traversable, type Interaction as SpatialInteraction, type SpaceContext } from '../spatial';
import { advanceLayerShots, changeLayer, damageLayerEnemy, type ShotObservation } from '../layer-transition';
import { advancePursuits } from '../pursuit';
import { ActiveClock, PlayerInput, type InputFrame } from '../input';
import { SaveSession, type SessionState, type ExpansionTransaction, type MutationResult } from '../session';
import type { LootContainer, LootTransfer } from '../loot';
import type { RaidRuntime, RaidIntent, PublishedView, WorldKey, MapDef, StampedEvent, ViewEventBody, Durability, WeaponLook, TargetRef, Interaction } from './contract';
import { mapView, frameView, freeze, Revelation } from './presentation';
export const emptyIntent = (): RaidIntent => ({ move: { x: 0, y: 0, sprint: false }, aim: null, precise: false,
    firePressed: false, fireHeld: false, interactPressed: false, interactHeld: false, commands: [], selectTarget: null, source: 'mouse-keyboard' });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const wrap = (angle: number) => ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const owners = new WeakMap<SaveSession, CoastRaidRuntime>();
type PendingEvent = {
    body: ViewEventBody;
    world: WorldKey;
    epoch: number;
    durability: Durability;
};
export class CoastRaidRuntime implements RaidRuntime {
    layered: ExpansionState | null;
    readonly config: RunConfig;
    player: ActorState = { x: 0, y: 0, rotation: 0 };
    enemies: Enemy[] = [];
    loot: LootState[] = [];
    bullets: BulletState[] = [];
    containers: LootContainer[] = [];
    hp: number = B.maxHealth;
    stamina: number = B.maxStamina;
    pollution = 0;
    bleeding = 0;
    kills = 0;
    elapsed = 0;
    highTide = false;
    mag = 0;
    magRelief = 0;
    knife = false;
    reloadLeft = 0;
    fireCooldown = 0;
    extractTime = 0;
    warned = false;
    tideChanged = false;
    exhausted = false;
    stepTime = 0;
    hitTime = 0;
    hitNotice = 0;
    hitDirections: {
        sector: number;
        angle: number;
        left: number;
    }[] = [];
    hurtTimers = new Map<string, number>();
    sprinting = false;
    shotNoise: Point | null = null;
    noiseRadius = 510;
    noiseTime = 0;
    noteSeen = new Set<string>();
    private random = D.seededRandom(0);
    private nextEntity = 1;
    private checkpointAt = 0;
    private clock = new ActiveClock();
    private lastNow: number | null = null;
    inputFrame: InputFrame = new PlayerInput().read(false);
    intent: RaidIntent = emptyIntent();
    inputSuppressed = false;
    overlay = '';
    locked = false;
    extracted = false;
    ending = false;
    disposed = false;
    private suppressFire = false;
    private suppressInteract = false;
    lootTargetId = '';
    lootContext: {
        containerId: string;
        runId: string;
    } | null = null;
    readonly revelation = new Revelation();
    private mapCache = new Map<string, MapData>();
    epoch = 1;
    private revision = 0;
    private seq = 0;
    private batch!: PublishedView;
    private viewMap!: MapDef;
    private queue: PendingEvent[] = [];
    private dirty = true;
    private inAdvance = false;
    private pendingLayer: {
        ticket: ExpansionTransaction;
        events: PendingEvent[];
        action: string;
        suppress: boolean;
        from: string;
    } | null = null;
    readonly terminalLoadout: D.RunLoadout;
    /** Test driver owns this switch; never installed on the ordinary browser entry. */
    freezeAI = false;
    lastStall: {
        seconds: number;
        at: number;
    } | null = null;
    constructor(readonly session: SessionState, readonly saves: SaveSession, private readonly freezeFrames = true) {
        if (owners.has(saves))
            throw new Error('This session already has a Runtime.');
        if (session.state !== 'run' || !session.loadout || !session.save.activeRun || !session.storageOK || session.conflict || session.pendingSettlement)
            throw new Error('Resume or deploy a valid owned raid before creating Runtime.');
        this.layered = session.expansion?.raid ? structuredClone(session.expansion) : null;
        if (this.layered?.raid?.worldVersion && this.layered.raid.worldVersion !== 'coast-buildings-v1')
            throw new Error('Sample Runtime supports coastal raids only.');
        this.config = this.layered ? buildingRunConfig(this.layered.raid!.seed) : generateRun(session.checkpoint!.seed);
        this.terminalLoadout = structuredClone(session.loadout);
        if (this.layered)
            this.restoreExpansion(this.layered);
        else if (session.checkpoint)
            this.restore(session.checkpoint);
        else
            throw new Error('Missing deployment checkpoint.');
        this.checkpointAt = this.elapsed;
        owners.set(saves, this);
        if (this.layered)
            saves.attachExpansion({ capture: () => this.snapshotExpansion(), restore: state => this.restoreExpansion(state) });
        else
            saves.attachRaid({ capture: () => this.snapshot(), restore: value => this.restore(value) });
        this.publish(new Map());
    }
    get limits() { return this.layered ? derivedLimits(this.layered) : { hp: B.maxHealth, stamina: B.maxStamina, carry: B.carryLimit }; }
    get paused() { return this.locked || ['pause', 'help', 'abandon', 'rotate', 'checkpoint-error'].includes(this.overlay); }
    get currentWeapon() { return D.WEAPONS[!this.knife && (this.session.loadout ?? this.terminalLoadout).weapon || 'knife']; }
    private worldKey(): WorldKey {
        const r = this.layered?.raid;
        return { runId: this.terminalLoadout.runId!, worldVersion: r?.worldVersion ?? WORLD_VERSION, layoutRevision: r?.layoutRevision ?? null, mapId: r?.currentMap ?? 'coast' };
    }
    private emit(body: ViewEventBody, durability: Durability = 'accepted') { this.queue.push({ body, durability, world: this.worldKey(), epoch: this.epoch }); this.dirty = true; }
    say(text: string, seconds = 7) { this.emit({ type: 'notice', text, seconds }); }
    private rejected(action: string, reason: string) { this.emit({ type: 'rejected', action, reason }); }
    private releaseInput() {
        this.suppressFire ||= this.intent.fireHeld;
        this.suppressInteract ||= this.intent.interactHeld;
        this.intent = emptyIntent();
        this.inputFrame = new PlayerInput().read(false);
        this.clock.reset();
        this.extractTime = 0;
        this.sprinting = false;
    }
    suppressHeldInput() { this.suppressFire ||= this.intent.fireHeld; this.suppressInteract ||= this.intent.interactHeld; this.extractTime = 0; this.inputSuppressed = true; }
    private setOverlay(value: string) {
        if (this.overlay === 'checkpoint-error' && !this.session.storageOK && value !== 'checkpoint-error')
            return;
        this.releaseInput();
        this.overlay = value;
        this.dirty = true;
    }
    pause(reason: 'overlay' | 'blur' | 'stall' | 'context-lost') {
        this.assertLive();
        if (this.ending)
            return;
        this.setOverlay('pause');
        this.checkpoint();
        if (reason === 'stall')
            this.say('画面暂时停顿，行动已暂停。准备好后继续。');
    }
    resume() { this.assertLive(); if (this.ending || this.session.conflict || !this.session.storageOK)
        return; this.setOverlay(''); }
    setBlocked(blocked: boolean) { this.assertLive(); if (this.ending || this.paused)
        return; this.setOverlay(blocked ? 'inventory' : ''); if (!blocked)
        this.lootContext = null; }
    private assertLive() { if (this.disposed)
        throw new Error('Runtime disposed.'); }
    current(): PublishedView { this.assertLive(); return this.dirty ? this.publish(new Map()) : this.batch; }
    dispose() {
        if (this.disposed)
            return;
        if (!this.ending || this.session.pendingSettlement || !this.session.result)
            throw new Error('Settlement must be committed before disposal.');
        this.releaseOwnership();
    }
    /** Startup rollback only: no simulated frame or terminal transaction may be discarded. */
    cancelStart() {
        if (this.disposed) return;
        if (this.lastNow !== null || this.ending || this.session.pendingSettlement)
            throw new Error('Only an unstarted Runtime may cancel startup.');
        this.releaseOwnership();
    }
    private releaseOwnership() {
        if (owners.get(this.saves) === this) {
            this.saves.attachRaid(null);
            this.saves.attachExpansion(null);
            owners.delete(this.saves);
        }
        this.releaseInput();
        this.queue = [];
        this.disposed = true;
    }
    advance(nowMs: number, intent: RaidIntent): PublishedView {
        this.assertLive();
        if (this.inAdvance)
            throw new Error('Reentrant Runtime advance.');
        if (!Number.isFinite(nowMs) || this.lastNow !== null && nowMs < this.lastNow)
            throw new Error('Expected monotonic foreground milliseconds.');
        if (![intent.move.x, intent.move.y, intent.aim ?? 0].every(Number.isFinite))
            throw new Error('Nonfinite input.');
        this.lastNow = nowMs;
        this.inAdvance = true;
        const before = new Map<string, Point>([['player', { ...this.player }], ...this.enemies.map(e => [e.uid, { x: e.x, y: e.y }] as [
                string,
                Point
            ])]);
        const epoch = this.epoch;
        let seconds = 0;
        try {
            if (this.session.conflict) {
                this.locked = true;
                this.releaseInput();
            }
            if (this.lootContext && !this.canLootContainer(this.lootContext.containerId, this.lootContext.runId)) {
                this.lootContext = null;
                this.setOverlay('');
            }
            if (this.session.state !== 'run' || this.extracted || this.paused || this.ending)
                this.clock.reset();
            else {
                const tick = this.clock.tick(nowMs);
                if (tick.stalled) {
                    this.lastStall = { seconds: tick.seconds, at: nowMs };
                    this.pause('stall');
                }
                else {
                    seconds = tick.seconds;
                    this.elapsed += seconds;
                    if (this.elapsed >= this.config.duration) {
                        this.extracted = true;
                        this.finish('timeout');
                    }
                    else {
                        if (!intent.fireHeld)
                            this.suppressFire = false;
                        if (!intent.interactHeld)
                            this.suppressInteract = false;
                        const effective = this.overlay ? emptyIntent() : { ...intent, fireHeld: intent.fireHeld && !this.suppressFire, interactHeld: intent.interactHeld && !this.suppressInteract };
                        this.intent = effective;
                        const frame: InputFrame = { x: effective.move.x, y: effective.move.y, sprint: effective.move.sprint, aim: null,
                            pointer: { x: 0, y: 0 }, precise: effective.precise, firePressed: effective.firePressed, fireHeld: effective.fireHeld,
                            interactHeld: effective.interactHeld, actions: new Set([...effective.commands, ...(effective.interactPressed ? ['interact' as const] : [])]), touch: intent.source === 'touch' };
                        this.inputSuppressed = false;
                        if (effective.selectTarget)
                            this.selectTarget({ ...this.worldKey(), kind: 'container', id: effective.selectTarget });
                        for (let i = 0; i < tick.steps; i++) {
                            if (this.session.state !== 'run' || this.paused || this.ending)
                                break;
                            this.inputFrame = i === 0 ? frame : { ...frame, actions: new Set(), firePressed: false, fireHeld: false };
                            if (this.inputSuppressed)
                                this.inputFrame = { ...this.inputFrame, x: 0, y: 0, sprint: false, aim: null, firePressed: false, fireHeld: false, interactHeld: false, actions: new Set() };
                            for (const [uid, t] of this.hurtTimers)
                                this.hurtTimers.set(uid, Math.max(0, t - seconds / tick.steps));
                            this.step(seconds / tick.steps);
                        }
                        if (this.session.state === 'run' && !this.paused && !this.ending && this.elapsed - this.checkpointAt >= 2)
                            this.checkpoint();
                    }
                }
            }
            const velocities = new Map<string, Point>();
            if (seconds > 0 && epoch === this.epoch)
                for (const [uid, p] of [['player', this.player] as const, ...this.enemies.map(e => [e.uid, e] as const)]) {
                    const old = before.get(uid);
                    if (old)
                        velocities.set(uid, { x: (p.x - old.x) / seconds, y: (p.y - old.y) / seconds });
                }
            return this.publish(velocities);
        }
        finally {
            this.inAdvance = false;
        }
    }
    private publish(velocities: ReadonlyMap<string, Point>): PublishedView {
        const world = this.worldKey();
        for (const e of this.queue)
            if (e.body.type === 'hurt' && e.body.uid !== 'player' && e.epoch === this.epoch && e.world.mapId === world.mapId)
                this.hurtTimers.set(e.body.uid, .07);
        if (!this.viewMap || this.viewMap.key.mapId !== world.mapId || this.batch?.stamp.epoch !== this.epoch)
            this.viewMap = mapView(this, world);
        const stamp = { world, epoch: this.epoch, revision: ++this.revision, simulationTime: this.elapsed };
        const events: StampedEvent[] = this.queue.map(e => ({ ...e.body, seq: ++this.seq, durability: e.durability,
            stamp: { ...stamp, world: e.world, epoch: e.epoch } }));
        this.queue = [];
        this.batch = { stamp, map: this.viewMap, frame: frameView(this, this.viewMap, velocities), events };
        if (this.freezeFrames)
            freeze(this.batch);
        this.dirty = false;
        return this.batch;
    }
    checkpoint(): boolean {
        if (this.locked || this.extracted || this.session.pendingSettlement || this.session.conflict)
            return false;
        const ok = this.saves.persist();
        if (ok)
            this.checkpointAt = this.elapsed;
        else {
            this.setOverlay('checkpoint-error');
            this.rejected('checkpoint', this.session.storageError);
        }
        return ok;
    }
    snapshot(): RaidCheckpoint {
        this.syncMagazine();
        return structuredClone({ version: 2, worldVersion: WORLD_VERSION, seed: this.config.seed, runId: this.terminalLoadout.runId!,
            loadout: this.session.loadout ?? this.terminalLoadout, player: this.player, hp: this.hp, stamina: this.stamina, pollution: this.pollution,
            bleeding: this.bleeding, kills: this.kills, elapsed: this.elapsed, highTide: this.highTide, knife: this.knife,
            reloadLeft: this.reloadLeft, fireCooldown: this.fireCooldown, warned: this.warned, tideChanged: this.tideChanged,
            shotNoise: this.shotNoise, noiseRadius: this.noiseRadius, noiseTime: this.noiseTime, hitTime: this.hitTime,
            exhausted: this.exhausted, stepTime: this.stepTime, noteSeen: [...this.noteSeen], rng: this.random.getState(), nextEntity: this.nextEntity,
            enemies: this.enemies, loot: this.loot, containers: this.containers, bullets: this.bullets });
    }
    /** Persistence rollback/internal projection sync. Deliberately preserves clock and epoch. */
    restore(c: RaidCheckpoint) {
        this.session.loadout = structuredClone(c.loadout);
        const keys = ['hp', 'stamina', 'pollution', 'bleeding', 'kills', 'elapsed', 'highTide', 'knife', 'reloadLeft', 'fireCooldown',
            'warned', 'tideChanged', 'noiseRadius', 'noiseTime', 'hitTime', 'exhausted', 'stepTime', 'nextEntity'] as const;
        Object.assign(this, Object.fromEntries(keys.map(k => [k, c[k]])));
        Object.assign(this.player, c.player);
        this.mag = c.loadout.ammo;
        this.magRelief = c.loadout.ammoRelief;
        this.player.rotation = wrap(c.player.rotation);
        this.random = D.seededRandom(c.rng);
        this.noteSeen = new Set(c.noteSeen);
        this.shotNoise = c.shotNoise ? { ...c.shotNoise } : null;
        const sync = <T extends {
            uid: string;
        }>(old: T[], values: T[]) => values.map(v => Object.assign(old.find(e => e.uid === v.uid) ?? {} as T, structuredClone(v)));
        this.enemies = this.layered ? sync(this.enemies, c.enemies) : structuredClone(c.enemies);
        this.loot = this.layered ? sync(this.loot, c.loot) : structuredClone(c.loot);
        this.bullets = this.layered ? sync(this.bullets, c.bullets) : structuredClone(c.bullets);
        for (const actor of [...this.enemies, ...this.bullets])
            actor.rotation = wrap(actor.rotation);
        this.containers = structuredClone(c.containers ?? []);
        this.dirty = true;
    }
    /** Rebuild from a SaveSession-validated checkpoint (not arbitrary imported JSON). */
    reloadCommitted() {
        this.assertLive();
        if (this.ending || this.session.conflict)
            throw new Error('Cannot reload this raid.');
        const record = this.saves.currentRecord();
        if (!record || record.profile.activeRun?.runId !== this.terminalLoadout.runId)
            throw new Error('Wrong run.');
        if (record.expansion?.raid)
            this.restoreExpansion(record.expansion);
        else if (record.raid)
            this.restore(record.raid);
        else
            throw new Error('No checkpoint.');
        this.epoch++;
        this.revelation.reset();
        this.hurtTimers.clear();
        this.hitDirections = [];
        this.queue = [];
        this.pendingLayer = null;
        this.releaseInput();
        this.dirty = true;
    }
    private allocateEntityUid() { const serial = this.nextEntity++; return this.layered?.raid ? entityUid(this.layered.raid, serial) : `entity-${serial}`; }
    spawnLoot(x: number, y: number, id: string, qty: number, relief = false) { this.loot.push({ uid: this.allocateEntityUid(), x, y, id, qty, relief }); }
    nearbyLoot() { return this.loot.filter(l => distance(l, this.player) < 43 && this.sight(l, this.player, this.highTide, this.space ? 10 : 0)).sort((a, b) => distance(a, this.player) - distance(b, this.player) || a.uid.localeCompare(b.uid)); }
    private transaction(action: string, mutate: () => boolean | void): MutationResult {
        if (this.disposed || this.ending || this.locked || this.session.state !== 'run' || this.session.conflict || this.paused) {
            if (!this.disposed)
                this.rejected(action, 'blocked');
            return 'blocked';
        }
        const mark = this.queue.length;
        let result: MutationResult;
        try {
            result = this.saves.mutate(mutate, this);
        }
        catch (error) {
            this.queue.splice(mark);
            this.rejected(action, String(error));
            throw error;
        }
        if (result === 'committed')
            for (const e of this.queue.slice(mark))
                e.durability = 'committed';
        else {
            this.queue.splice(mark);
            this.rejected(action, result);
            if (result === 'save-failed')
                this.setOverlay('checkpoint-error');
        }
        this.dirty = true;
        return result;
    }
    pickupLoot(uid: string): boolean {
        const loot = this.nearbyLoot().find(l => l.uid === uid);
        if (!loot) {
            this.rejected('pickup', 'out-of-range');
            return false;
        }
        return this.transaction('pickup', () => {
            const before = loot.qty, left = D.addItem(this.session.loadout!.bag, loot.id, before, !!loot.relief);
            if (left === before)
                return false;
            loot.qty = left;
            if (!left)
                this.loot.splice(this.loot.indexOf(loot), 1);
            this.emit({ type: 'looted', source: uid, item: loot.id, qty: before - left, partial: left > 0, to: 'bag' });
        }) === 'committed';
    }
    heal() {
        if (this.disposed || this.ending || this.paused || this.session.conflict || !this.session.loadout)
            return;
        const bag = this.session.loadout!.bag;
        const id = this.bleeding && D.count(bag, 'bandage') ? 'bandage' : D.count(bag, 'medkit') ? 'medkit' : D.count(bag, 'bandage') ? 'bandage' : null;
        if (id)
            this.transaction('heal', () => { if (!this.useItem(id))
                return false; this.say(`已使用${D.ITEMS[id].name}`); });
        else
            this.say('背包中没有绷带或急救包。');
    }
    useSupply(id: string, from: 'bag' | 'safe' = 'bag', uid?: string) { return this.transaction('use-item', () => this.useItem(id, this.session.loadout![from], uid)); }
    dropItem(uid: string, from: 'bag' | 'safe' = 'bag'): MutationResult {
        return this.transaction('drop', () => {
            const inventory = this.session.loadout![from], item = inventory.items.find(i => i.uid === uid);
            if (!item) return false;
            inventory.items = inventory.items.filter(i => i.uid !== uid);
            this.spawnLoot(this.player.x, this.player.y, item.id, item.qty, !!item.relief);
        });
    }
    equipItem(uid: string) {
        return this.transaction('equip', () => {
            this.syncMagazine();
            if (!D.equipRun(this.session.loadout!, uid))
                return false;
            this.mag = this.session.loadout!.ammo;
            this.magRelief = this.session.loadout!.ammoRelief;
            this.knife = false;
            this.reloadLeft = 0;
            this.startReload();
        });
    }
    transferLoot(ref: TargetRef, request: LootTransfer): MutationResult {
        if (!this.validRef(ref) || this.paused || ref.kind !== 'container' || !this.canLootContainer(ref.id, ref.runId)) {
            this.rejected('transfer', 'stale-target');
            return 'rejected';
        }
        const container = this.getLootContainer(ref.id)!;
        const inv = request.from === 'container' ? container.inventory : this.session.loadout![request.from];
        const item = inv.items.find(i => i.uid === request.uid), before = item?.qty ?? 0;
        const result = this.saves.transferLoot(container, request);
        if (result === 'committed' && item && request.from === 'container' && request.to !== 'container') {
            const left = this.getLootContainer(ref.id)!.inventory.items.find(i => i.uid === request.uid)?.qty ?? 0;
            this.emit({ type: 'looted', source: ref.id, item: item.id, qty: before - left, partial: left > 0, to: request.to }, 'committed');
        }
        else if (result !== 'committed') {
            this.rejected('transfer', result);
            if (result === 'save-failed')
                this.setOverlay('checkpoint-error');
        }
        this.dirty = true;
        return result;
    }
    private validRef(ref: TargetRef) { const world = this.worldKey(); return !this.disposed && !this.ending && !this.session.conflict && ref.runId === world.runId && ref.mapId === world.mapId; }
    selectTarget(ref: TargetRef): boolean {
        if (!this.validRef(ref) || ref.kind !== 'container' || !this.lootTargets().some(c => c.id === ref.id)) {
            this.rejected('select-target', 'stale-target');
            return false;
        }
        this.lootTargetId = ref.id;
        this.dirty = true;
        return true;
    }
    finish(reason: EndReason) {
        if (this.ending || this.session.conflict)
            return;
        this.syncMagazine();
        Object.assign(this.terminalLoadout, structuredClone(this.session.loadout!));
        if (!this.saves.prepareSettlement(reason, this.kills))
            return;
        this.ending = this.locked = true;
        this.releaseInput();
        this.retrySettlement();
    }
    retrySettlement(): boolean {
        if (!this.session.pendingSettlement)
            return false;
        // Preserve final world view while SaveSession restores terminal body/base and detaches.
        const world = this.layered;
        const ok = this.saves.retrySettlement();
        this.layered = world;
        if (ok)
            this.session.state = 'result';
        else
            this.rejected('settlement', this.session.storageError);
        this.dirty = true;
        return ok;
    }
    get settlement() { return { committed: this.ending && !this.session.pendingSettlement && !!this.session.result, retryable: !!this.session.pendingSettlement && !this.session.conflict, result: structuredClone(this.session.result) }; }
    get layeredWorld(): WorldDefinition | null { return this.layered?.raid ? resolveExpansionWorld(this.layered.raid.worldVersion) ?? null : null; }
    get space(): SpaceContext | null {
        const raid = this.layered?.raid, world = this.layeredWorld;
        return raid && world ? { definition: world.maps[raid.currentMap], doors: raid.maps[raid.currentMap].doors, highTide: this.highTide } : null;
    }
    get mapData(): MapData {
        const map = this.space?.definition;
        if (!map)
            return WORLD;
        if (!this.mapCache.has(map.id))
            this.mapCache.set(map.id, mapPresentation(map));
        return this.mapCache.get(map.id)!;
    }
    get visibleExits() { return !this.space || ['coast', 'mall-f1'].includes(this.space.definition.id) ? this.config.exits : []; }
    walkable(x: number, y: number, highTide = false, radius = 10): boolean {
        return this.space ? traversable({ ...this.space, highTide }, { x, y }, 'body', radius) : isWalkable(x, y, highTide, radius);
    }
    sight(a: Point, b: Point, highTide = false, radius = 0): boolean {
        return this.space ? corridor({ ...this.space, highTide }, a, b, radius ? 'body' : 'sight', radius) : lineOfSight(a, b, highTide, radius);
    }
    path(from: Point, to: Point, highTide = false): Point[] {
        return this.space ? spacePath({ ...this.space, highTide }, from, to, true) : findPath(from, to, highTide);
    }
    dryRefuge(from: Point): Point | null {
        if (!this.space)
            return findDryRefuge(from);
        const context = { ...this.space, highTide: true }, map = context.definition, points: Point[] = [];
        for (let y = 0; y < map.cells.length; y++)
            for (let x = 0; x < map.cells[y].length; x++) {
                const point = { x: x * 32 + 16, y: y * 32 + 16 };
                if (traversable(context, point, 'body', 10))
                    points.push(point);
            }
        points.sort((a, b) => distance(from, a) - distance(from, b) || a.y - b.y || a.x - b.x);
        return points.find(p => spacePath({ ...context, highTide: false }, from, p, true).length) ?? null;
    }
    snapshotExpansion(): ExpansionState {
        if (!this.layered?.raid)
            throw new Error('没有多层行动。');
        const state = structuredClone(this.layered), raid = state.raid!, c = this.snapshot(), layer = raid.maps[raid.currentMap];
        Object.assign(state.body, { hp: this.hp, stamina: this.stamina, pollution: this.pollution, bleeding: !!this.bleeding, exhausted: this.exhausted });
        Object.assign(raid, { player: c.player, loadout: c.loadout, elapsed: c.elapsed, highTide: c.highTide, warned: c.warned, tideChanged: c.tideChanged,
            kills: c.kills, rng: c.rng, nextEntity: c.nextEntity, reloadLeft: c.reloadLeft, fireCooldown: c.fireCooldown, knife: c.knife, hitTime: c.hitTime });
        const projected = raid.pursuits.filter(p => p.sourceMap === raid.currentMap);
        layer.enemies = c.enemies.filter(e => !projected.some(p => p.enemy.uid === e.uid));
        projected.forEach(p => { const enemy = c.enemies.find(e => e.uid === p.enemy.uid); if (enemy)
            p.enemy = enemy; });
        Object.assign(layer, { loot: c.loot, containers: c.containers!, bullets: c.bullets,
            noise: c.shotNoise && c.noiseTime > 0 ? { at: c.shotNoise, radius: c.noiseRadius, remaining: c.noiseTime } : null });
        return state;
    }
    restoreExpansion(state: ExpansionState): void {
        this.layered = structuredClone(state);
        // A durable terminal write restores body/base state before the scene stops.
        if (!this.layered.raid)
            return;
        const raid = this.layered.raid!, layer = raid.maps[raid.currentMap];
        this.restore({ version: 2, worldVersion: WORLD_VERSION, seed: raid.seed, runId: raid.runId, loadout: raid.loadout, player: raid.player,
            hp: state.body.hp, stamina: state.body.stamina, pollution: state.body.pollution, bleeding: Number(state.body.bleeding),
            kills: raid.kills, elapsed: raid.elapsed, highTide: raid.highTide, knife: raid.knife, reloadLeft: raid.reloadLeft, fireCooldown: raid.fireCooldown,
            warned: raid.warned, tideChanged: raid.tideChanged, shotNoise: layer.noise?.at ?? null, noiseRadius: layer.noise?.radius ?? 510, noiseTime: layer.noise?.remaining ?? 0,
            hitTime: raid.hitTime, exhausted: state.body.exhausted, stepTime: this.stepTime, noteSeen: [], rng: raid.rng, nextEntity: raid.nextEntity,
            enemies: [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === raid.currentMap).map(p => p.enemy)], loot: layer.loot, containers: layer.containers, bullets: layer.bullets });
    }
    getLootContainer(id: string): LootContainer | undefined { return this.containers.find(container => container.id === id); }
    canLootContainer(id: string, runId: string): boolean {
        const container = this.getLootContainer(id);
        return !!container && !!runId && !!this.player && this.session.state === 'run' && !this.disposed
            && this.session.loadout?.runId === runId && this.session.save.activeRun?.runId === runId && container.runId === runId
            && !this.locked && !this.extracted && this.hp > 0 && !this.session.pendingSettlement && !this.session.conflict
            && distance(this.player, container) < 43 && this.walkable(container.x, container.y, this.highTide)
            && this.sight(this.player, container, this.highTide, 10);
    }
    lootTargets(): LootContainer[] {
        const targets = this.containers.filter(container => this.canLootContainer(container.id, container.runId));
        // Stable ties preserve creation order, including the numbers on overlapping corpses.
        targets.sort((a, b) => distance(a, this.player) - distance(b, this.player));
        if (!targets.some(container => container.id === this.lootTargetId))
            this.lootTargetId = targets[0]?.id || '';
        return targets;
    }
    lootTargetName(container: LootContainer): string {
        const sameName = this.containers.filter(other => other.name === container.name);
        return sameName.length > 1 ? `${container.name} ${sameName.findIndex(other => other.id === container.id) + 1}` : container.name;
    }
    createLootContainer(id: string, kind: LootContainer['kind'], name: string, x: number, y: number, items: {
        id: string;
        qty: number;
    }[]): void {
        if (this.getLootContainer(id))
            return;
        const inventory = D.createInventory(6, 5);
        for (const item of items) {
            if (D.addItem(inventory, item.id, item.qty))
                throw new Error('战利品超过容器容量');
        }
        this.containers.push({ id, runId: this.session.loadout!.runId!, kind, name, x, y, inventory });
    }
    syncMagazine() {
        if (this.session.loadout) {
            this.session.loadout.ammo = this.mag;
            this.session.loadout.ammoRelief = this.magRelief;
        }
    }
    loadMagazine() { const loaded = D.reloadMagazine(this.session.loadout!.weapon || 'knife', this.mag, this.magRelief, this.session.loadout!.bag); this.mag = loaded.ammo; this.magRelief = loaded.ammoRelief; this.syncMagazine(); }
    carriedWeight() { const l = this.session.loadout!, w = D.WEAPONS[l.weapon || 'knife']; return D.weight(l.bag) + D.weight(l.safe) + (l.weapon ? D.ITEMS[l.weapon].weight : 0) + D.ITEMS.knife.weight + (w.ammo ? D.ITEMS[w.ammo].weight * this.mag : 0) + (this.layered?.charm ? D.ITEMS[this.layered.charm.id].weight : 0); }
    carryLimit() { return this.layered ? derivedLimits(this.layered).carry : B.carryLimit; }
    useItem(id: string, inv: D.Inventory = this.session.loadout!.bag, itemUid?: string) {
        const chosen = itemUid ? inv.items.find(i => i.uid === itemUid && i.id === id && i.qty > 0) : null;
        if (itemUid && !chosen)
            return false;
        if (this.layered) {
            if (!D.count(inv, id))
                return false;
            const state = this.snapshotExpansion();
            if (!useRpgItem(state, id)) {
                this.say('当前状态无需使用这件补给。');
                return false;
            }
            if (chosen) {
                chosen.qty--;
                if (!chosen.qty)
                    inv.items = inv.items.filter(i => i.uid !== chosen.uid);
            }
            else
                D.removeItem(inv, id, 1);
            state.raid!.loadout = structuredClone(this.session.loadout!);
            this.restoreExpansion(state);
            return true;
        }
        if (!['bandage', 'medkit', 'water', 'food', 'antidote'].includes(id) || !D.count(inv, id))
            return false;
        if (id === 'bandage') {
            if (this.hp >= B.maxHealth && !this.bleeding) {
                this.say('生命已满，且没有流血，无需使用绷带。');
                return false;
            }
            this.hp = Math.min(B.maxHealth, this.hp + B.bandageHeal);
            this.bleeding = 0;
        }
        if (id === 'medkit') {
            if (this.hp >= B.maxHealth && !this.bleeding) {
                this.say('生命已满，且没有流血，无需使用急救包。');
                return false;
            }
            this.hp = Math.min(B.maxHealth, this.hp + B.medkitHeal);
            this.bleeding = 0;
        }
        if (id === 'water') {
            this.stamina = B.maxStamina;
            this.pollution = Math.max(0, this.pollution - B.waterCleanse);
        }
        if (id === 'food') {
            this.stamina = Math.min(B.maxStamina, this.stamina + B.foodStamina);
            this.hp = Math.min(B.maxHealth, this.hp + B.foodHeal);
        }
        if (id === 'antidote')
            this.pollution = Math.max(0, this.pollution - B.antidoteCleanse);
        if (chosen) {
            chosen.qty--;
            if (!chosen.qty)
                inv.items = inv.items.filter(i => i.uid !== chosen.uid);
        }
        else
            D.removeItem(inv, id, 1);
        this.say(`已使用${D.ITEMS[id].name}`);
        return true;
    }
    move(sprite: ActorState, dx: number, dy: number, canEscapeFlood = false) {
        const escaping = canEscapeFlood && !this.walkable(sprite.x, sprite.y, true, 10) && this.walkable(sprite.x, sprite.y, false, 10);
        const high = this.highTide && !escaping;
        if (this.walkable(sprite.x + dx, sprite.y, high, 10))
            sprite.x += dx;
        if (this.walkable(sprite.x, sprite.y + dy, high, 10))
            sprite.y += dy;
    }
    startReload() {
        const w = this.currentWeapon;
        if (w.ammo && !this.reloadLeft && this.mag < w.magazine) {
            if (!D.count(this.session.loadout!.bag, w.ammo)) {
                this.say('背包中没有适用的备用弹药。');
                return;
            }
            this.reloadLeft = w.reload;
        }
    }
    step(dt: number) {
        const tideFlipped = !this.tideChanged && this.elapsed >= this.config.tideAt;
        if (this.layered?.raid) {
            const layer = this.layered.raid.maps[this.layered.raid.currentMap];
            layer.localTime = Math.min(this.elapsed, layer.localTime + dt);
        }
        this.fireCooldown = Math.max(0, this.fireCooldown - dt);
        this.noiseTime = Math.max(0, this.noiseTime - dt);
        this.hitTime = Math.max(0, this.hitTime - dt);
        this.hitNotice = Math.max(0, this.hitNotice - dt);
        this.hitDirections = this.hitDirections.map(hit => ({ ...hit, left: hit.left - dt })).filter(hit => hit.left > 0);
        if (this.elapsed >= this.config.duration) {
            this.extracted = true;
            this.finish('timeout');
            return;
        }
        if (!this.warned && this.elapsed >= this.config.warningAt) {
            this.warned = true;
            this.say('潮汐预警：30 秒后潮位变化。请离开浅滩，走高架路或海堤。', 12);
        }
        if (tideFlipped) {
            this.tideChanged = true;
            this.highTide = !this.highTide;
            for (const e of this.enemies) {
                e.path = [];
                e.repath = 0;
                if (this.highTide && !this.walkable(e.x, e.y, true, 10)) {
                    const refuge = this.dryRefuge(e);
                    if (refuge) {
                        e.target = refuge;
                        e.state = 'return';
                        e.path = this.path(e, refuge, false);
                    }
                }
            }
            this.say(this.highTide ? '涨潮了，浅滩无法通行。高架路和海堤仍可通行。' : '退潮了，浅滩可以通行。涉水仍会积累污染。', 10);
        }
        const input = !this.overlay, frame = this.inputFrame;
        const dx = input ? frame.x : 0, dy = input ? frame.y : 0;
        if (input) {
            if (frame.actions.has('reload'))
                this.startReload();
            if (frame.actions.has('heal'))
                this.heal();
            if (frame.actions.has('primary')) {
                this.knife = false;
                this.reloadLeft = 0;
            }
            if (frame.actions.has('knife')) {
                this.knife = true;
                this.reloadLeft = 0;
            }
        }
        if (this.paused)
            return;
        if (this.stamina <= B.exhaustedAt)
            this.exhausted = true;
        if (this.stamina >= B.sprintRecoveryAt)
            this.exhausted = false;
        const beforeMove = { x: this.player.x, y: this.player.y };
        const limits = this.layered ? derivedLimits(this.layered) : { hp: B.maxHealth, stamina: B.maxStamina, carry: B.carryLimit };
        const moving = !!(dx || dy), over = Math.max(0, this.carriedWeight() - limits.carry), sprint = input && frame.sprint && moving && !this.exhausted;
        this.sprinting = sprint;
        const speed = (sprint ? B.sprintSpeed : B.walkSpeed) * (this.inputFrame.precise && !sprint ? B.aimSpeedFactor : 1) / Math.max(1, 1 + over * B.overloadSlowdownPerKg) * (this.layered ? rpgMultipliers(this.layered).movement : 1);
        if (moving) {
            const len = Math.max(1, Math.hypot(dx, dy));
            this.move(this.player, dx / len * speed * dt, dy / len * speed * dt, true);
            this.stepTime -= dt;
            if (this.stepTime <= 0) {
                this.stepTime = sprint ? .25 : .42;
                if (sprint && this.noiseTime <= .15) {
                    this.shotNoise = { x: this.player.x, y: this.player.y };
                    this.noiseRadius = B.sprintNoiseRange;
                    this.noiseTime = .15;
                }
            }
        }
        const beforeEnvironment = this.hp;
        if (this.layered) {
            const state = this.snapshotExpansion(), flooded = this.space!.definition.cells[Math.floor(this.player.y / 32)]?.[Math.floor(this.player.x / 32)] === 'tide';
            const spent = advanceRaidBody(state, dt, sprint, this.carriedWeight(), flooded);
            recordMotion(state, beforeMove, this.player, dt, spent, this.carriedWeight());
            this.restoreExpansion(state);
        }
        else
            this.stamina = clamp(this.stamina + (sprint ? -(B.sprintDrain + over) : B.staminaRecovery) * dt, 0, B.maxStamina);
        if (input) {
            if (!this.inputSuppressed && this.intent.aim !== null)
                this.player.rotation = wrap(this.intent.aim);
            if (frame.firePressed || frame.fireHeld)
                this.shoot();
        }
        if (this.reloadLeft > 0) {
            this.reloadLeft = Math.max(0, this.reloadLeft - dt);
            if (this.reloadLeft === 0) {
                this.loadMagazine();
            }
        }
        const flooded = this.mapData.tiles[Math.floor(this.player.y / TILE)]?.[Math.floor(this.player.x / TILE)] === 4;
        if (!this.layered) {
            this.pollution = clamp(this.pollution + (flooded ? (this.highTide ? B.pollutionHighTide : B.pollutionLowTide) : -B.pollutionRecovery) * dt, 0, 100);
            this.hp -= dt * (this.bleeding * B.bleedDamage + (this.pollution > B.pollutionDamageThreshold ? (this.pollution - B.pollutionDamageBase) * B.pollutionDamageFactor : 0));
        }
        if (this.hp < beforeEnvironment)
            this.emit({ type: 'hurt', uid: 'player', at: { x: this.player.x, y: this.player.y },
                damage: beforeEnvironment - this.hp, critical: false, angle: null });
        if (this.hp <= 0) {
            this.emit({ type: 'death', uid: 'player', corpseAngle: this.player.rotation, containerId: null });
            this.finish('death');
            return;
        }
        if (this.layered) {
            const state = this.snapshotExpansion();
            const changed = advancePursuits(state, this.layeredWorld!, tideFlipped);
            if (changed) {
                if (!this.layerMutation(candidate => { Object.assign(candidate, state); }))
                    return;
            }
            else
                this.restoreExpansion(state);
        }
        for (const e of this.enemies)
            if (e.hp > 0 && !this.freezeAI) {
                if (this.layered?.raid?.pursuits.some(p => p.enemy.uid === e.uid))
                    continue;
                this.updateEnemy(e, dt);
                if (this.session.state !== 'run' || this.locked)
                    return;
            }
        this.updateBullets(dt);
        if (this.session.state !== 'run' || this.locked)
            return;
        this.interact(dt, input, moving);
        if (this.session.state !== 'run' || this.locked)
            return;
    }
    updateEnemy(e: Enemy, dt: number) {
        const def = D.ENEMIES[e.id], dist = distance(e, this.player), sees = dist < def.vision && this.sight(e, this.player);
        e.timer -= dt;
        e.cooldown -= dt;
        e.repath -= dt;
        e.alert = Math.max(0, e.alert - dt);
        const escaping = this.highTide && !this.walkable(e.x, e.y, true, 10);
        if (escaping) {
            const refuge = this.dryRefuge(e);
            if (refuge) {
                if (!e.path.length || e.repath <= 0) {
                    e.path = this.path(e, refuge, false);
                    e.repath = 1;
                }
                while (e.path.length && distance(e, e.path[0]) < 10)
                    e.path.shift();
                const target = e.path[0] || refuge, angle = Math.atan2(target.y - e.y, target.x - e.x);
                e.rotation = wrap(angle);
                this.move(e, Math.cos(angle) * def.speed * dt, Math.sin(angle) * def.speed * dt, true);
            }
            return;
        }
        if (sees) {
            e.state = dist < def.range ? 'attack' : 'chase';
            e.target = { x: this.player.x, y: this.player.y };
            e.alert = 5;
        }
        else if (this.noiseTime > 0 && this.shotNoise && distance(e, this.shotNoise) < this.noiseRadius) {
            e.state = 'investigate';
            e.target = { ...this.shotNoise };
            e.alert = 5;
        }
        else if ((e.state === 'chase' || e.state === 'attack') && e.alert <= 0) {
            e.state = 'return';
            e.target = e.home;
        }
        if (e.state === 'investigate' && distance(e, e.target) < 24 && e.alert <= 0) {
            e.state = 'return';
            e.target = e.home;
        }
        if (e.state === 'return' && distance(e, e.home) < 28) {
            e.state = 'patrol';
            e.timer = 0;
        }
        if (e.state === 'patrol' && e.timer <= 0) {
            const p = { x: e.home.x + (this.random() - .5) * 170, y: e.home.y + (this.random() - .5) * 170 };
            if (this.walkable(p.x, p.y, this.highTide))
                e.target = p;
            e.timer = 3 + this.random() * 4;
        }
        if (e.state === 'attack' && sees) {
            e.rotation = wrap(Math.atan2(this.player.y - e.y, this.player.x - e.x));
            if (e.cooldown <= 0) {
                e.cooldown = def.cooldown;
                const angle = e.rotation + (this.random() - .5) * .16;
                if (e.id === 'salt' || e.id === 'elite') {
                    const bullet = { uid: this.allocateEntityUid(), x: e.x + Math.cos(angle) * 18, y: e.y + Math.sin(angle) * 18, rotation: wrap(angle), vx: Math.cos(angle) * 365, vy: Math.sin(angle) * 365, left: def.range + 70, damage: def.damage, enemy: true, ...(this.layered ? { owner: e.uid } : {}) };
                    this.bullets.push(bullet);
                    this.shotEvent(e.uid, 'rifle', [bullet], [angle]);
                }
                else if (!this.space || this.sight(e, this.player, this.highTide, 10)) {
                    this.emit({ type: 'melee', attacker: e.uid, angle: e.rotation, range: def.range, hit: 'player' });
                    this.hurt(def.damage, e, e.uid);
                }
            }
            return;
        }
        if (distance(e, e.target) > 12) {
            if (e.repath <= 0) {
                e.path = this.path(e, e.target, this.highTide);
                e.repath = .9 + this.random() * .6;
            }
            let target = e.target;
            if (!this.sight(e, target, this.highTide, 10) || !this.walkable(target.x, target.y, this.highTide)) {
                while (e.path.length && distance(e, e.path[0]) < 14)
                    e.path.shift();
                if (e.path.length)
                    target = e.path[0];
                else
                    return;
            }
            const angle = Math.atan2(target.y - e.y, target.x - e.x);
            if (this.space) {
                const next = { x: e.x + Math.cos(angle) * (def.speed * dt + 12), y: e.y + Math.sin(angle) * (def.speed * dt + 12) };
                const door = this.space.definition.doors.find(d => Math.floor(next.x / 32) === d.x && Math.floor(next.y / 32) === d.y);
                if (door && !this.space.doors[door.id]) {
                    this.layerMutation(state => { state.raid!.maps[state.raid!.currentMap].doors[door.id] = true; }, false, 'door', [{ type: 'door', id: door.id, open: true, by: e.uid }]);
                    return;
                }
            }
            e.rotation = wrap(angle);
            this.move(e, Math.cos(angle) * def.speed * dt, Math.sin(angle) * def.speed * dt, true);
        }
    }
    private layerMutation(action: (state: ExpansionState) => boolean | void, suppress = false, name = 'world', events: ViewEventBody[] = []): boolean {
        const mark = this.queue.length, from = this.worldKey().mapId;
        let ticket: ExpansionTransaction | null;
        try {
            ticket = this.saves.prepareExpansionMutation(draft => action(draft.expansion));
        }
        catch (error) {
            this.queue.splice(mark);
            this.rejected(name, String(error));
            throw error;
        }
        const staged = this.queue.splice(mark);
        if (!ticket) {
            this.rejected(name, 'unreachable-or-rejected');
            return false;
        }
        for (const body of events)
            staged.push({ body, world: this.worldKey(), epoch: this.epoch, durability: 'committed' });
        return this.commitLayer({ ticket, events: staged, action: name, suppress, from });
    }
    private commitLayer(pending: NonNullable<CoastRaidRuntime['pendingLayer']>): boolean {
        const result = this.saves.commitExpansionMutation(pending.ticket);
        if (result !== 'committed') {
            this.rejected(pending.action, result);
            if (result === 'save-failed') {
                this.pendingLayer = pending;
                this.setOverlay('checkpoint-error');
            }
            return false;
        }
        this.pendingLayer = null;
        this.queue.push(...pending.events.map(e => ({ ...e, durability: 'committed' as const })));
        if (pending.from !== this.worldKey().mapId) {
            this.epoch++;
            this.revelation.reset();
            this.emit({ type: 'layer', from: pending.from, to: this.worldKey().mapId, via: pending.action.replace('entry:', '') }, 'committed');
        }
        if (pending.suppress)
            this.suppressHeldInput();
        this.dirty = true;
        return true;
    }
    retrySave(): boolean {
        this.assertLive();
        if (this.ending)
            return this.retrySettlement();
        const ok = this.pendingLayer ? this.commitLayer(this.pendingLayer) : this.checkpoint();
        if (ok)
            this.setOverlay('');
        return ok;
    }
    private shotEvent(shooter: string, weapon: WeaponLook, bullets: BulletState[], angles: number[]) {
        this.emit({ type: 'shot', shotId: `${shooter}:${bullets[0].uid}`, shooter, weapon,
            pellets: bullets.map((b, i) => ({ bullet: b.uid, origin: { x: b.x, y: b.y }, angle: angles[i] })) });
    }
    shoot() {
        const w = this.currentWeapon;
        if (this.fireCooldown > 0 || this.reloadLeft > 0)
            return;
        if (w.ammo && this.mag <= 0) {
            this.startReload();
            return;
        }
        this.fireCooldown = w.cooldown;
        if (!w.ammo) {
            const hit = this.enemies.find(e => e.hp > 0 && distance(e, this.player) < w.range
                && Math.abs(wrap(Math.atan2(e.y - this.player.y, e.x - this.player.x) - this.player.rotation)) < 1.15
                && this.sight(this.player, e, this.highTide, this.space ? 10 : 0));
            this.emit({ type: 'melee', attacker: 'player', angle: this.player.rotation, range: w.range, hit: hit?.uid ?? null });
            if (hit)
                this.damageEnemy(hit, w.damage);
            return;
        }
        this.mag--;
        if (this.magRelief > 0)
            this.magRelief--;
        this.syncMagazine();
        this.shotNoise = { x: this.player.x, y: this.player.y };
        this.noiseRadius = B.gunNoiseRange;
        this.noiseTime = .6;
        const aim = (this.inputFrame.precise ? .35 : 1) * (this.layered ? rpgMultipliers(this.snapshotExpansion()).recoil : 1);
        const pellets: BulletState[] = [], angles: number[] = [];
        for (let i = 0; i < w.pellets; i++) {
            const angle = this.player.rotation + (this.random() - .5) * w.spread * aim;
            const b = { uid: this.allocateEntityUid(), x: this.player.x + Math.cos(angle) * 17, y: this.player.y + Math.sin(angle) * 17,
                rotation: wrap(angle), vx: Math.cos(angle) * 760, vy: Math.sin(angle) * 760, left: w.range, damage: w.damage, enemy: false };
            this.bullets.push(b);
            pellets.push(b);
            angles.push(angle);
        }
        this.shotEvent('player', w.id as WeaponLook, pellets, angles);
    }
    damageEnemy(e: Enemy, damage: number, incomingAngle = Math.atan2(this.player.y - e.y, this.player.x - e.x)) {
        if (e.hp <= 0)
            return;
        const hp = e.hp, angle = incomingAngle;
        if (this.layered) {
            const state = this.snapshotExpansion(), raid = state.raid!, map = raid.currentMap;
            const target = raid.maps[map].enemies.find(a => a.uid === e.uid) ?? raid.pursuits.find(p => p.enemy.uid === e.uid)?.enemy;
            if (target) {
                damageLayerEnemy(state, map, target, damage, false);
                this.restoreExpansion(state);
            }
        }
        else {
            e.hp = D.applyDamage(e.hp, damage);
            e.state = 'chase';
            e.alert = 6;
            e.target = { x: this.player.x, y: this.player.y };
            if (e.hp <= 0) {
                this.kills++;
                e.rotation = wrap(e.rotation + Math.PI / 2);
                const drops = D.rollLoot(this.config.seed + this.kills * 47, e.id === 'elite' ? 3 : 1);
                for (let i = 0; i < drops.length; i++) {
                    this.random();
                    this.random();
                }
                this.createLootContainer(`corpse-${e.uid}`, 'corpse', `${D.ENEMIES[e.id].name}遗体`, e.x, e.y, drops);
            }
        }
        const now = this.enemies.find(a => a.uid === e.uid)!;
        this.hurtTimers.set(e.uid, .07);
        this.emit({ type: 'hurt', uid: e.uid, at: { x: e.x, y: e.y }, damage: hp - now.hp, critical: false, angle });
        if (now.hp <= 0)
            this.emit({ type: 'death', uid: e.uid, corpseAngle: now.rotation - (this.layered ? 0 : Math.PI / 2), containerId: `corpse-${e.uid}` });
    }
    private showIncomingHit(source?: Point) {
        if (source) {
            const angle = Math.atan2(source.y - this.player.y, source.x - this.player.x), sector = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
            this.hitDirections = this.hitDirections.filter(h => h.sector !== sector);
            this.hitDirections.push({ sector, angle, left: 1 });
        }
        this.hitNotice = 1;
    }
    hurt(amount: number, source?: Point, owner?: string) {
        if (this.extracted)
            return;
        const hp = this.hp;
        this.showIncomingHit(source);
        if (this.layered) {
            const state = this.snapshotExpansion();
            enemyDamage(state, amount, owner, this.random());
            state.raid!.rng = this.random.getState();
            this.restoreExpansion(state);
        }
        else {
            this.hp = D.applyDamage(this.hp, amount);
            this.hitTime = .25;
            if (this.random() < B.bleedChance)
                this.bleeding = 1;
        }
        this.extractTime = 0;
        this.emit({ type: 'hurt', uid: 'player', at: { ...this.player }, damage: hp - this.hp, critical: false,
            angle: source ? Math.atan2(source.y - this.player.y, source.x - this.player.x) : null });
        if (this.hp <= 0) {
            this.emit({ type: 'death', uid: 'player', corpseAngle: this.player.rotation, containerId: null });
            this.finish('death');
        }
    }
    private observeShot(e: ShotObservation) {
        this.emit({ type: 'impact', bullet: e.bullet.uid, reason: e.reason, lastFree: e.lastFree, contact: e.contact, normal: e.normal, surface: e.surface, target: e.target });
        if (e.target) {
            this.emit({ type: 'hurt', uid: e.target, at: e.contact ?? e.lastFree, damage: e.damage, critical: e.critical, angle: e.angle });
            if (e.dead) {
                const enemy = this.enemies.find(a => a.uid === e.target);
                this.emit({ type: 'death', uid: e.target, corpseAngle: enemy?.rotation ?? this.player.rotation, containerId: e.target === 'player' ? null : `corpse-${e.target}` });
            }
        }
    }
    updateBullets(dt: number) {
        if (this.layered) {
            const state = this.snapshotExpansion();
            advanceLayerShots(state, this.layeredWorld!, state.raid!.currentMap, dt, undefined, source => { this.showIncomingHit(source); this.extractTime = 0; }, e => this.observeShot(e));
            this.restoreExpansion(state);
            if (this.hp <= 0)
                this.finish('death');
            return;
        }
        // Classic sampling, reverse bullet order and first live array hit are deliberately retained.
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i], speed = Math.hypot(b.vx, b.vy), steps = Math.ceil(speed * dt / 7);
            let remove = false;
            for (let j = 0; j < steps; j++) {
                const previous = { x: b.x, y: b.y }, previousTile = this.mapData.tiles[Math.floor(b.y / TILE)]?.[Math.floor(b.x / TILE)];
                b.x += b.vx * dt / steps;
                b.y += b.vy * dt / steps;
                b.left -= speed * dt / steps;
                const x = Math.floor(b.x / TILE), y = Math.floor(b.y / TILE), tile = this.mapData.tiles[y]?.[x];
                if (tile === 3 || tile === undefined || b.left <= 0) {
                    const startBlocked = previousTile === 3 || previousTile === undefined;
                    const blocked = tile === 3, bounds = tile === undefined;
                    const dx = b.x - previous.x, dy = b.y - previous.y;
                    const tx = dx ? ((dx > 0 ? x : x + 1) * TILE - previous.x) / dx : Infinity;
                    const ty = dy ? ((dy > 0 ? y : y + 1) * TILE - previous.y) / dy : Infinity;
                    const crossX = Math.floor(previous.x / TILE) !== x, crossY = Math.floor(previous.y / TILE) !== y;
                    const unique = crossX !== crossY;
                    const t = crossX && !crossY ? tx : crossY && !crossX ? ty : Math.min(tx, ty);
                    this.emit({ type: 'impact', bullet: b.uid, reason: startBlocked ? 'start-blocked' : blocked ? 'blocked' : bounds ? 'bounds' : 'range', lastFree: previous,
                        contact: blocked && Number.isFinite(t) && t >= 0 && t <= 1 ? { x: previous.x + dx * t, y: previous.y + dy * t } : null,
                        normal: blocked && unique && !startBlocked ? crossX ? { x: -Math.sign(dx), y: 0 } : { x: 0, y: -Math.sign(dy) } : null,
                        surface: blocked ? 'wall' : null, target: null });
                    remove = true;
                    break;
                }
                const target = b.enemy ? distance(b, this.player) < 12 ? 'player' : null : this.enemies.find(e => e.hp > 0 && distance(e, b) < 14)?.uid ?? null;
                if (target) {
                    this.emit({ type: 'impact', bullet: b.uid, reason: 'hit-actor', lastFree: previous, contact: { x: b.x, y: b.y }, normal: null, surface: 'actor', target });
                    if (target === 'player')
                        this.hurt(b.damage, { x: this.player.x - b.vx, y: this.player.y - b.vy });
                    else
                        this.damageEnemy(this.enemies.find(e => e.uid === target)!, b.damage, Math.atan2(-b.vy, -b.vx));
                    remove = true;
                    break;
                }
            }
            if (remove)
                this.bullets.splice(i, 1);
            if (this.session.state !== 'run' || this.locked)
                return;
        }
    }
    private target(): SpatialInteraction | null {
        if (this.ending || this.session.conflict)
            return null;
        const targets = this.lootTargets(), nearby = this.nearbyLoot();
        if (!this.space) {
            const exit = this.visibleExits.find(e => distance(e, this.player) < 48);
            if (exit)
                return { id: exit.id, kind: 'exit', at: exit, label: exit.name };
            const candidates = [...nearby.map(l => ({ at: l, kind: 'ground' as const, id: l.uid, label: `拾取 · ${D.ITEMS[l.id].name} × ${l.qty}` })),
                ...targets.map(c => ({ at: c, kind: 'container' as const, id: c.id, label: `搜刮 · ${this.lootTargetName(c)}` }))];
            candidates.sort((a, b) => distance(a.at, this.player) - distance(b.at, this.player) || a.at.x - b.at.x || a.at.y - b.at.y || a.id.localeCompare(b.id));
            const chosen = this.inputFrame.touch ? candidates[0] : candidates.find(c => c.kind === 'container' && c.id === this.lootTargetId) ?? candidates.find(c => c.kind === 'ground' && c.id === nearby[0]?.uid);
            if (chosen)
                return chosen;
            const note = this.mapData.notes.find(n => distance(n, this.player) < 43);
            return note ? { id: note.title, kind: 'note', at: note, label: `阅读 · ${note.title}` } : null;
        }
        const candidates: SpatialInteraction[] = [
            ...this.visibleExits.map(e => ({ id: e.id, kind: 'exit' as const, at: e, label: e.name })),
            ...this.space.definition.entries.map(e => ({ id: e.id, kind: 'entry' as const, at: e.at, label: e.label ?? '楼层入口' })),
            ...this.loot.map(l => ({ id: l.uid, kind: 'ground' as const, at: l, label: `拾取 · ${D.ITEMS[l.id].name} × ${l.qty}` })),
            ...this.containers.map(c => ({ id: c.id, kind: 'container' as const, at: c, label: `搜刮 · ${c.name}${c.inventory.items.length ? '' : ' · 已搜空'}` })),
            ...this.mapData.notes.map(n => ({ id: n.title, kind: 'note' as const, at: n, label: `阅读 · ${n.title}` })),
        ];
        for (const door of this.space.definition.doors) {
            const at = doorAnchor(this.space, door.id, this.player);
            if (at)
                candidates.push({ id: door.id, kind: 'door', at, label: this.space.doors[door.id] ? '关门' : '开门' });
        }
        let target = interactionTarget(this.space, this.player, candidates);
        if ((target?.kind === 'container' || target?.kind === 'ground') && !this.inputFrame.touch) {
            const c = targets.find(c => c.id === this.lootTargetId);
            if (c)
                target = { id: c.id, kind: 'container', at: c, label: `搜刮 · ${this.lootTargetName(c)}` };
        }
        return target;
    }
    targetView(): Interaction | null {
        const t = this.target();
        if (!t)
            return null;
        return { kind: t.kind, ref: { runId: this.worldKey().runId, mapId: this.worldKey().mapId, kind: t.kind, id: t.id },
            at: { x: t.at.x, y: t.at.y }, label: t.label, hold: t.kind === 'exit' ? { required: B.extractionSeconds, progress: this.extractTime } : null,
            choices: t.kind === 'exit' || this.space && !['container', 'ground'].includes(t.kind) ? [] : this.lootTargets().map(c => ({ id: c.id, name: this.lootTargetName(c), empty: !c.inventory.items.length, selected: c.id === this.lootTargetId })) };
    }
    activate(ref: TargetRef): boolean {
        if (!this.validRef(ref) || this.paused || this.overlay) {
            this.rejected('interact', 'stale-or-blocked');
            return false;
        }
        if (ref.kind === 'container' && this.canLootContainer(ref.id, ref.runId)) {
            this.lootContext = { containerId: ref.id, runId: ref.runId };
            this.suppressHeldInput();
            this.setOverlay('loot');
            return true;
        }
        const target = this.target();
        if (!target || target.id !== ref.id || target.kind !== ref.kind) {
            this.rejected('interact', 'stale-target');
            return false;
        }
        if (target.kind === 'entry')
            return this.layerMutation(state => changeLayer(state, this.layeredWorld!, target.id, e => this.observeShot(e)), true, `entry:${target.id}`);
        if (target.kind === 'door') {
            const open = !this.space!.doors[target.id];
            return this.layerMutation(state => {
                const raid = state.raid!, layer = raid.maps[raid.currentMap];
                const living = [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === raid.currentMap).map(p => p.enemy)].filter(e => e.hp > 0);
                const result = toggleDoor({ definition: this.space!.definition, doors: layer.doors, highTide: raid.highTide }, target.id, raid.player, living);
                return result !== 'unreachable' && result !== 'occupied';
            }, true, 'door', [{ type: 'door', id: target.id, open, by: 'player' }]);
        }
        if (target.kind === 'ground')
            return this.pickupLoot(target.id);
        if (target.kind === 'note') {
            const note = this.mapData.notes.find(n => n.title === target.id)!;
            this.say(`${note.title}：${note.text}`, 14);
            if (!this.layered)
                this.noteSeen.add(note.title);
            if (this.inputFrame.touch)
                this.setOverlay('reading');
            return true;
        }
        return false;
    }
    interact(dt: number, input: boolean, moving: boolean) {
        const target = this.targetView();
        if (target?.kind === 'exit') {
            if (input && this.inputFrame.interactHeld && !moving && !this.hitTime) {
                this.extractTime += dt;
                this.emit({ type: 'extract-progress', progress: this.extractTime, required: B.extractionSeconds });
                if (this.extractTime >= B.extractionSeconds) {
                    this.extracted = true;
                    this.finish('extract');
                }
            }
            else
                this.extractTime = 0;
        }
        else {
            this.extractTime = 0;
            if (input && target && this.inputFrame.actions.has('interact'))
                this.activate(target.ref);
        }
    }
}
