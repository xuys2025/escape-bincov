/** Headless coastal raid. Rules transplanted from RaidScene at f144147; no renderer/DOM imports. */
import * as D from '../domain';
import { getLegacyEnemyProfile } from '../enemy-profile';
import { actorArchetype, actorDefinition, enemyDefinition } from '../enemy-archetypes';
import { advanceTacticalEnemy, type TacticalEffects } from './tactical-enemy';
import { advanceLegacyEnemy, type LegacyEnemyEffects } from './enemy-ai';
import { syncRecoveryCargo } from '../enemy-recovery';
import { blockadeProgram, requestBlockadeRegistration, BLOCKADE_WAIT, inCheckpointRect } from '../enemy-blockade';
import { SURVIVAL as B } from '../balance';
import { WORLD, TILE, isWalkable, lineOfSight, findPath, findDryRefuge, generateRun, type RunConfig, type Point, type MapData } from '../world';
import { WORLD_VERSION, type ActorState, type RaidCheckpoint, type EnemyState as Enemy, type LootState, type BulletState } from '../checkpoint';
import { mapPresentation, buildingRunConfig } from '../building-world';
import { isMallWorld, mallRunConfig } from '../mall-world';
import { resolveExpansionWorld } from '../expansion-worlds';
import { derivedLimits, effectiveAttributes, entityUid, enemyRules, perkRaidRules, type ExpansionState, type WorldDefinition, type EndReason } from '../expansion-state';
import { activeRaidCheckpoint, applyActiveRaidSnapshot, type ActiveRaidSnapshot } from '../raid-state-projection';
import { advanceRaidBody, enemyDamage, perkEffects, recordMotion, rpgMultipliers, useRpgItemResult } from '../rpg';
import { corridor, doorAnchor, interactionTarget, spacePath, toggleDoor, traversable, type Interaction as SpatialInteraction, type SpaceContext } from '../spatial';
import { advanceLayerShots, aimTarget, changeLayer, damageLayerEnemy, type ShotObservation } from '../layer-transition';
import { critMultiplier, critSources, type CritSnapshot } from '../perks';
import { advanceBreath, breathChance, clearBreath, idleBreath } from '../breath';
import { advancePursuits } from '../pursuit';
import { advanceAim, coneOf, drawAim, driftOf, handlingOf, preciseHeld, recoil, turnAim, unsteadyAim, SAMPLE_GUNS, SWAY, type AimState, type Handling, type Motion } from '../shooting';
import { effectiveStats } from '../gunsmith/stats';
import { buildOf, gunWeight } from '../gunsmith/instance';
import { ActiveClock, idleFrame, type InputFrame } from '../input';
import { SaveSession, type SessionState, type ExpansionTransaction, type MutationResult } from '../session';
import type { LootContainer, LootTransfer } from '../loot';
import type { RaidRuntime, RaidIntent, PublishedView, WorldKey, MapDef, StampedEvent, ViewEventBody, Durability, WeaponLook, TargetRef, Interaction, HurtCause } from './contract';
import { mapView, frameView, freeze, Revelation, bulletOwner } from './presentation';
export const emptyIntent = (): RaidIntent => ({ move: { x: 0, y: 0, sprint: false }, aim: null, precise: false,
    firePressed: false, fireHeld: false, aimHeld: false, interactPressed: false, interactHeld: false, commands: [], selectTarget: null, source: 'mouse-keyboard' });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const wrap = (angle: number) => ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const owners = new WeakMap<SaveSession, CoastRaidRuntime>();
/** How long a click that found the gun cooling or reloading may wait to fire (seconds). */
const CLICK_WINDOW = .15;
/** Rounding allowance (seconds) for a shot or reload due exactly at a substep's end. */
const DUE = 1e-9;
/**
 * A player's bullet starts at the body's centre, never at a muzzle that may stand in or beyond a wall, and its range
 * counts from this old muzzle distance (px), so walls, doors and corners stop it by the same collision as in flight.
 */
const MUZZLE = 17;
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
    /**
     * Weapon handling (src/shooting.ts): stance, sway, bloom and drift. Runtime-only and never saved; a Runtime built
     * from a checkpoint (page load, reloadCommitted) starts unsteady, so a refresh cannot clear the cost of shooting.
     */
    handling: AimState = unsteadyAim();
    /**
     * The breath charge of technique-15-a (src/breath.ts): the enemy a precise aim rests on and the effective seconds
     * aimed at it. Runtime-only and never saved, like `handling`: a Runtime built from a checkpoint (page load,
     * reloadCommitted) starts idle, the internal restoreExpansion syncs keep it, and the interrupts of spec section 4.2
     * clear it: releaseInput (every panel and pause, blur, a stall, the conflict lock, reloadCommitted, the raid's end),
     * suppressHeldInput (opening loot, a door), a layer change (commitLayer), a successful shot (shoot), drawing another
     * weapon (draw), starting a reload, real health loss and the target's death. Leaving the precise aim, sprinting and
     * losing sight clear it in advanceBreath.
     */
    readonly breath = idleBreath();
    /**
     * The trigger as the last frame's intent left it. Held fire covers a frame's interval only when that frame's own
     * sample still holds it, so a release is never followed by a shot; a click or a new hold takes effect at its frame's
     * own time (see pull). Input that changes on frame boundaries then fires at the same raid times at any display rate.
     */
    private trigger = { held: false, touch: false };
    /** Seconds a click that found the gun busy may still fire: one click, never a queue. */
    private clickLeft = 0;
    /** Remaining flight time for rounds born in this substep. Consumed before flight, never part of a checkpoint. */
    private newbornFlight: Map<string, number> | null = null;
    /** Playtest sample gun with its own magazine; the loadout keeps the real weapon and its rounds (`base`). */
    private sample: { def: D.WeaponDef; base: { mag: number; relief: number } } | null = null;
    /**
     * The loadout gun's effective numbers (gunsmith/stats.ts) and weight, for the instance `key` names: its uid, type,
     * installed parts and switches. The gun in hand is read several times a frame, so they are worked out once per
     * instance (docs/gunsmith/CONTRACTS.md, M1-05) and frozen, since every reader shares them. Never saved. The
     * switches are in the key already; M2-03 passes the switched-on devices to effectiveStats.
     */
    private armed: { key: string; weapon: D.WeaponDef; grip: Handling; weight: number } | null = null;
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
    /** Bind once. The controller can request effects but cannot allocate IDs, publish events or commit storage. */
    private readonly enemyEffects: LegacyEnemyEffects = {
        random: () => this.random(),
        fire: (enemy, angle) => {
            const def = D.ENEMIES[enemy.id];
            const bullet = { uid: this.allocateEntityUid(), x: enemy.x + Math.cos(angle) * 18, y: enemy.y + Math.sin(angle) * 18,
                rotation: wrap(angle), vx: Math.cos(angle) * 365, vy: Math.sin(angle) * 365, left: def.range + 70,
                damage: def.damage, enemy: true, ...(this.layered ? { owner: enemy.uid } : {}) };
            this.bullets.push(bullet);
            this.shotEvent(enemy.uid, getLegacyEnemyProfile(enemy.id).weapon, [bullet], [angle]);
        },
        strike: enemy => {
            const def = D.ENEMIES[enemy.id];
            this.emit({ type: 'melee', attacker: enemy.uid, angle: enemy.rotation, range: def.range, hit: 'player' });
            this.hurt(def.damage, enemy, enemy.uid);
        },
        openDoor: (enemy, id) => {
            this.layerMutation(state => { state.raid!.maps[state.raid!.currentMap].doors[id] = true; }, false,
                'door', [{ type: 'door', id, open: true, by: enemy.uid }]);
        },
    };
    private readonly tacticalEffects: TacticalEffects = {
        openDoor: (enemy, id) => this.enemyEffects.openDoor(enemy, id),
        notice: (enemy, message) => {
            if (distance(this.player, enemy) < 360 && this.sight(this.player, enemy)) this.say(`${enemyDefinition(enemy.id).name}：${message}`, 3);
        },
        strike: (enemy, targetId) => {
            this.emit({ type: 'melee', attacker: enemy.uid, angle: enemy.rotation, range: actorDefinition(enemy).range, hit: targetId });
            if (targetId === 'player') this.hurt(actorDefinition(enemy).damage, enemy, enemy.uid);
            else {
                const state = this.snapshotExpansion(), raid = state.raid!, map = raid.currentMap;
                const target = raid.maps[map].enemies.find(e => e.uid === targetId);
                if (target) {
                    const hp = target.hp;
                    damageLayerEnemy(state, map, target, actorDefinition(enemy).damage, false, { owner: enemy.uid, at: { x: enemy.x, y: enemy.y } });
                    this.restoreExpansion(state);
                    if (target.hp < hp) {
                        this.emit({ type: 'hurt', cause: 'blow', uid: targetId, at: { x: target.x, y: target.y },
                            damage: hp - target.hp, critical: false, angle: Math.atan2(enemy.y - target.y, enemy.x - target.x) });
                        if (target.hp <= 0) this.emit({ type: 'death', uid: targetId, killer: enemy.uid, corpseAngle: target.rotation, containerId: `corpse-${targetId}` });
                    }
                }
            }
        },
        fire: (enemy, angle) => {
            const def = actorArchetype(enemy)!, speed = def.attack === 'spit' ? 180 : 365;
            // Start at the body: the normal segment collision cannot shoot through a wall beside a muzzle.
            const bullet: BulletState = { uid: this.allocateEntityUid(), x: enemy.x, y: enemy.y, rotation: angle,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, left: def.range, damage: def.damage, enemy: true, owner: enemy.uid };
            this.bullets.push(bullet); this.shotEvent(enemy.uid, def.weapon, [bullet], [angle]);
        },
    };
    private checkpointAt = 0;
    private clock = new ActiveClock();
    private lastNow: number | null = null;
    inputFrame: InputFrame = idleFrame();
    intent: RaidIntent = emptyIntent();
    inputSuppressed = false;
    overlay = '';
    locked = false;
    extracted = false;
    ending = false;
    private endingReason: EndReason | null = null;
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
        const world = this.layered?.raid?.worldVersion;
        if (world && world !== 'coast-buildings-v1' && !isMallWorld(world))
            throw new Error('Sample Runtime does not support this world.');
        this.config = this.layered ? (isMallWorld(world) ? mallRunConfig : buildingRunConfig)(this.layered.raid!.seed)
            : generateRun(session.checkpoint!.seed);
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
    /**
     * The loadout gun's effective numbers (#28 M1-05: buildOf of the instance D.equippedGun returns, through
     * effectiveStats), recomputed only when that instance changes; null when the loadout has no gun.
     */
    private equipped() {
        const gun = D.equippedGun(this.session.loadout ?? this.terminalLoadout);
        if (!gun) return null;
        const key = JSON.stringify(gun);
        if (this.armed?.key !== key) {
            const stats = effectiveStats(buildOf(gun));
            this.armed = { key, weapon: Object.freeze(stats.weapon), grip: Object.freeze(stats.handling), weight: gunWeight(gun) };
        }
        return this.armed;
    }
    /**
     * The weapon in hand as it fires: the loadout gun's effective stats, the knife's, or the #39 sample rifle's. The
     * knife and the sample keep WEAPONS, SAMPLE_GUNS and handlingOf (M2-01 retires the sample).
     */
    get currentWeapon(): D.WeaponDef { return this.knife ? D.WEAPONS.knife : this.sample?.def ?? this.equipped()?.weapon ?? D.WEAPONS.knife; }
    /** How the held weapon is drawn: the sample rifle borrows the rifle look. */
    get weaponLook(): WeaponLook { return this.currentWeapon.id === 'm4a1' ? 'rifle' : this.currentWeapon.id as WeaponLook; }
    /** Handling of the weapon in hand, from the same source as currentWeapon. */
    get grip(): Handling { const gun = !this.knife && !this.sample && this.equipped(); return gun ? gun.grip : handlingOf(this.currentWeapon.id); }
    get sampleGun() { return this.sample?.def.id ?? null; }
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
        this.trigger = { held: false, touch: false };
        this.clickLeft = 0;
        this.newbornFlight = null;
        this.intent = emptyIntent();
        this.inputFrame = idleFrame();
        this.clock.reset();
        this.extractTime = 0;
        this.sprinting = false;
        clearBreath(this.breath);
    }
    /** Held input stops counting for the rest of the frame; the precise aim with it, so the breath charge goes at once. */
    suppressHeldInput() {
        this.suppressFire ||= this.intent.fireHeld; this.suppressInteract ||= this.intent.interactHeld;
        this.trigger = { held: false, touch: false }; this.clickLeft = 0; this.extractTime = 0; this.inputSuppressed = true;
        clearBreath(this.breath);
    }
    private setOverlay(value: string) {
        if (this.overlay === 'checkpoint-error' && !this.session.storageOK && value !== 'checkpoint-error')
            return;
        if (value !== 'loot') this.lootContext = null;
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
    resetClock() { this.assertLive(); this.clock.reset(); }
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
                    const startedAt = this.elapsed, endsAt = startedAt + seconds;
                    // Timeout wins over this frame's input. Otherwise each substep sees its own time: using endsAt
                    // throughout would let a late-arriving pursuit attack for the whole frame and advance tides early.
                    if (endsAt >= this.config.duration) {
                        this.elapsed = endsAt;
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
                        // Released somewhere in this interval: no held shot may follow the release.
                        if (!effective.fireHeld)
                            this.trigger = { held: false, touch: this.trigger.touch };
                        const frame: InputFrame = { x: effective.move.x, y: effective.move.y, sprint: effective.move.sprint, aim: null,
                            pointer: { x: 0, y: 0 }, precise: effective.precise, firePressed: effective.firePressed, fireHeld: effective.fireHeld,
                            interactHeld: effective.interactHeld, actions: new Set([...effective.commands, ...(effective.interactPressed ? ['interact' as const] : [])]), touch: intent.source === 'touch' };
                        this.inputSuppressed = false;
                        if (effective.selectTarget)
                            this.selectTarget({ ...this.worldKey(), kind: 'container', id: effective.selectTarget });
                        for (let i = 0; i < tick.steps; i++) {
                            if (this.session.state !== 'run' || this.paused || this.ending)
                                break;
                            // Derive from the frame origin rather than accumulating rounding error. A failed commit
                            // can pause mid-frame; the snapshot then retains exactly the substeps that ran.
                            this.elapsed = startedAt + seconds * ((i + 1) / tick.steps);
                            this.inputFrame = i === 0 ? frame : { ...frame, actions: new Set(), firePressed: false, fireHeld: false };
                            if (this.inputSuppressed)
                                this.inputFrame = { ...this.inputFrame, x: 0, y: 0, sprint: false, aim: null, firePressed: false, fireHeld: false, interactHeld: false, actions: new Set() };
                            for (const [uid, t] of this.hurtTimers)
                                this.hurtTimers.set(uid, Math.max(0, t - seconds / tick.steps));
                            this.step(seconds / tick.steps);
                        }
                        if (this.session.state === 'run' && !this.paused && !this.ending)
                            this.pull(this.overlay ? emptyIntent() : effective);
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
    snapshot(): ActiveRaidSnapshot {
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
        if (this.sample)
            this.sample.base = { mag: c.loadout.ammo, relief: c.loadout.ammoRelief };
        else {
            this.mag = c.loadout.ammo;
            this.magRelief = c.loadout.ammoRelief;
        }
        this.player.rotation = wrap(c.player.rotation);
        this.random = D.seededRandom(c.rng);
        this.noteSeen = new Set(c.noteSeen);
        this.shotNoise = c.shotNoise ? { ...c.shotNoise } : null;
        const sync = <T extends {
            uid: string;
        }>(old: T[], values: T[]) => values.map(v => Object.assign(old.find(e => e.uid === v.uid) ?? {} as T, structuredClone(v)));
        // Layered simulation may restore during an AI iteration (for example an enemy opening a door). Preserve
        // actor identity by uid so the iterator keeps updating the live actor, not a detached pre-transaction copy.
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
        this.handling = unsteadyAim();
        this.releaseInput();
        this.dirty = true;
    }
    private allocateEntityUid() { const serial = this.nextEntity++; return this.layered?.raid ? entityUid(this.layered.raid, serial) : `entity-${serial}`; }
    /** New ground loot under a new entity uid; a gun is born a factory instance. */
    spawnLoot(x: number, y: number, id: string, qty: number, relief = false) { this.loot.push({ uid: this.allocateEntityUid(), x, y, id, qty, relief, ...D.factoryGun(id) }); }
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
            const discarded = this.queue.splice(mark);
            // A no-effect supply explains its refusal before returning false. Keep that explanation
            // in the rejection, never any tentative success events or notices from a failed write.
            const explanation = result === 'rejected' && (action === 'heal' || action === 'use-item')
                ? discarded.find(e => e.body.type === 'notice')?.body : undefined;
            this.rejected(action, explanation?.type === 'notice' ? explanation.text : result);
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
            if (loot.gun) {
                // A gun comes off the ground whole, as the same instance (D.placeGroundGun), or stays where it lies.
                if (!D.placeGroundGun(this.session.loadout!.bag, loot)) return false;
                this.loot.splice(this.loot.indexOf(loot), 1);
                this.emit({ type: 'looted', source: uid, item: loot.id, qty: 1, partial: false, to: 'bag' });
                return;
            }
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
            // A gun lies on the ground as itself, under its item uid with its state; anything else becomes new ground loot.
            if (item.gun) this.loot.push({ uid: item.uid, x: this.player.x, y: this.player.y, id: item.id, qty: 1, relief: !!item.relief, gun: item.gun });
            else this.spawnLoot(this.player.x, this.player.y, item.id, item.qty, !!item.relief);
        });
    }
    equipItem(uid: string) {
        this.setSampleGun(null);
        return this.transaction('equip', () => {
            this.draw();
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
        this.endingReason = this.session.pendingReason;
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
    get settlement() { return { reason: this.ending ? this.saves.terminalReason(this.terminalLoadout.runId!) ?? this.endingReason : null, committed: this.ending && !this.session.pendingSettlement && !!this.session.result, retryable: !!this.session.pendingSettlement && !this.session.conflict, result: structuredClone(this.session.result) }; }
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
    /**
     * Capture live state, not the last committed record; snapshot also synchronizes live ammo.
     * Clone layered first, then overlay current entities; pursuits retain enemy ownership.
     * The returned candidate is isolated, but only SaveSession can make it durable.
     * No clock/RNG advance or publication occurs here; a missing layered raid throws.
     * @see applyActiveRaidSnapshot
     */
    snapshotExpansion(): ExpansionState {
        if (!this.layered?.raid)
            throw new Error('没有多层行动。');
        const state = structuredClone(this.layered), c = this.snapshot();
        applyActiveRaidSnapshot(state.body, state.raid!, c);
        return state;
    }
    restoreExpansion(state: ExpansionState): void {
        this.layered = structuredClone(state);
        // A durable terminal write restores body/base state before the scene stops.
        if (!this.layered.raid)
            return;
        this.restore(activeRaidCheckpoint(state.body, this.layered.raid, this.stepTime));
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
            this.session.loadout.ammo = this.sample?.base.mag ?? this.mag;
            this.session.loadout.ammoRelief = this.sample?.base.relief ?? this.magRelief;
        }
    }
    loadMagazine() {
        if (this.sample) { this.mag = this.sample.def.magazine; return; }
        const loaded = D.reloadMagazine(this.session.loadout!, this.mag, this.magRelief, this.session.loadout!.bag); this.mag = loaded.ammo; this.magRelief = loaded.ammoRelief; this.syncMagazine();
    }
    /**
     * Hand the player a playtest sample gun (SAMPLE_GUNS) or take it back. The loadout, its weapon and its rounds stay
     * untouched and are what every checkpoint saves; the sample's own magazine reloads from an endless reserve.
     */
    setSampleGun(id: keyof typeof SAMPLE_GUNS | null) {
        this.assertLive();
        if ((this.sample?.def.id ?? null) === id) return;
        if (id !== null && !Object.hasOwn(SAMPLE_GUNS, id)) throw new Error(`Unknown sample gun: ${id}.`);
        if (this.sample) { this.mag = this.sample.base.mag; this.magRelief = this.sample.base.relief; }
        this.sample = id ? { def: SAMPLE_GUNS[id], base: { mag: this.mag, relief: this.magRelief } } : null;
        if (this.sample) { this.mag = this.sample.def.magazine; this.magRelief = 0; }
        this.knife = false;
        this.reloadLeft = 0;
        this.draw();
        this.dirty = true;
    }
    /** Another weapon comes to hand: the aim starts from the hip again (drawAim) and the breath charge is gone. */
    private draw() { drawAim(this.handling, SWAY); clearBreath(this.breath); }
    /** Kg carried: bag, safe, the loadout gun with its parts (gunsmith gunWeight) and loaded rounds, the knife, the charm. */
    carriedWeight() { const l = this.session.loadout!, gun = this.equipped(); return D.weight(l.bag) + D.weight(l.safe) + (gun?.weight ?? 0) + D.ITEMS.knife.weight + (gun?.weapon.ammo ? D.ITEMS[gun.weapon.ammo].weight * (this.sample?.base.mag ?? this.mag) : 0) + (this.layered?.charm ? D.ITEMS[this.layered.charm.id].weight : 0); }
    carryLimit() { return this.layered ? derivedLimits(this.layered).carry : B.carryLimit; }
    useItem(id: string, inv: D.Inventory = this.session.loadout!.bag, itemUid?: string) {
        const chosen = itemUid ? inv.items.find(i => i.uid === itemUid && i.id === id && i.qty > 0) : null;
        if (itemUid && !chosen)
            return false;
        if (this.layered) {
            if (!D.count(inv, id))
                return false;
            const state = this.snapshotExpansion();
            const effect = useRpgItemResult(state, id);
            if (!effect.ok) {
                this.say(effect.message);
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
    /**
     * Seconds a reload of the held weapon takes: its effective reload time (attachments within their guardrail), which
     * the reload perks (technique-20-b, 30-b) shorten once more in a v3 raid.
     */
    get reloadTime() { return this.currentWeapon.reload * perkEffects(this.layered).reload; }
    startReload() {
        const w = this.currentWeapon;
        if (w.ammo && !this.reloadLeft && this.mag < w.magazine) {
            if (!this.sample && !D.count(this.session.loadout!.bag, w.ammo)) {
                this.say('背包中没有适用的备用弹药。');
                return;
            }
            this.reloadLeft = this.reloadTime;
            // Starting a reload interrupts the breath charge (spec 4.2); a click that finds no rounds to load does not.
            clearBreath(this.breath);
        }
    }
    /** The raid owns technique-15-a: a v3 raid whose selection holds it. v1, v2 and classic raids never charge. */
    get breathOwned() { return perkRaidRules(this.layered?.raid) && perkEffects(this.layered).breath; }
    /**
     * aimTarget (layer-transition.ts) for the body, aim, tide and enemies as they stand now: the current layer read from
     * the live Runtime fields, its own enemies and the pursuers it still owns together as `enemies` holds them, and the
     * reach of a round from the gun in hand. Allocates two small objects; nothing is cloned or written.
     */
    private breathSight(): string | null {
        const raid = this.layered!.raid!, mapId = raid.currentMap;
        const live = { ...raid, player: this.player, highTide: this.highTide, pursuits: [], maps: { [mapId]: { ...raid.maps[mapId], enemies: this.enemies } } };
        return aimTarget(live, this.layeredWorld!, this.currentWeapon.range + MUZZLE);
    }
    step(dt: number) {
        this.newbornFlight = new Map();
        const tideFlipped = !this.tideChanged && this.elapsed >= this.config.tideAt;
        if (this.layered?.raid) {
            const layer = this.layered.raid.maps[this.layered.raid.currentMap];
            layer.localTime = Math.min(this.elapsed, layer.localTime + dt);
        }
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
                if (this.knife) this.draw();
                this.knife = false;
                this.reloadLeft = 0;
            }
            if (frame.actions.has('knife')) {
                if (!this.knife) this.draw();
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
        // The heavy-stride perk (strength-20-a) scales only this slowdown, never the overweight stamina cost.
        const speed = (sprint ? B.sprintSpeed : B.walkSpeed) * (this.inputFrame.precise && !sprint ? B.aimSpeedFactor : 1) / Math.max(1, 1 + over * B.overloadSlowdownPerKg * perkEffects(this.layered).overweight) * (this.layered ? rpgMultipliers(this.layered).movement : 1);
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
        let environment: Partial<Record<HurtCause, number>> = {};
        if (this.layered) {
            const state = this.snapshotExpansion(), flooded = this.space!.definition.cells[Math.floor(this.player.y / 32)]?.[Math.floor(this.player.x / 32)] === 'tide';
            const spent = advanceRaidBody(state, dt, sprint, this.carriedWeight(), flooded, loss => { environment = loss; });
            recordMotion(state, beforeMove, this.player, dt, spent, this.carriedWeight());
            this.restoreExpansion(state);
        }
        else
            this.stamina = clamp(this.stamina + (sprint ? -(B.sprintDrain + over) : B.staminaRecovery) * dt, 0, B.maxStamina);
        let turned = 0;
        if (input && !this.inputSuppressed && this.intent.aim !== null) {
            const before = this.player.rotation;
            this.player.rotation = wrap(this.intent.aim);
            turned = Math.abs(wrap(this.player.rotation - before));
        }
        const walked = Math.hypot(this.player.x - beforeMove.x, this.player.y - beforeMove.y);
        const steady = input && !this.inputSuppressed, stick = steady && this.intent.source === 'touch' && this.intent.aimHeld;
        // The breath charge (technique-15-a) grows over this substep on the enemy the aim rests on now, a gun in hand.
        // Health drained over the substep (bleeding, thirst, hunger, pollution) is real damage (spec 4.2) and leaves it
        // empty for the whole substep; a lower limit's clip is no damage (spec 3.4). Classic raids, which drain after the
        // trigger, never charge.
        const drained = Object.entries(environment).some(([cause, amount]) => cause !== 'limit-change' && amount! > 0);
        if (drained) clearBreath(this.breath);
        const owned = this.breathOwned && !!this.currentWeapon.ammo;
        this.runTrigger(dt, beforeMove, { pace: dt > 0 ? walked / (B.walkSpeed * dt) : 0, sprint, precise: steady && frame.precise,
            hold: stick ? this.intent.fireHeld ? 'fire' : 'aim' : undefined }, turned, { owned, sight: owned && !drained ? this.breathSight() : null });
        const flooded = this.mapData.tiles[Math.floor(this.player.y / TILE)]?.[Math.floor(this.player.x / TILE)] === 4;
        if (!this.layered) {
            this.pollution = clamp(this.pollution + (flooded ? (this.highTide ? B.pollutionHighTide : B.pollutionLowTide) : -B.pollutionRecovery) * dt, 0, 100);
            environment = { bleed: dt * this.bleeding * B.bleedDamage, pollution: dt * (this.pollution > B.pollutionDamageThreshold ? (this.pollution - B.pollutionDamageBase) * B.pollutionDamageFactor : 0) };
            // The drain stops at 0, as a blow does (applyDamage): a classic raid settles its health into the body, which
            // accepts 0 to the limit, so a bleed-out past zero would fail the terminal write.
            this.hp = Math.max(0, this.hp - dt * (this.bleeding * B.bleedDamage + (this.pollution > B.pollutionDamageThreshold ? (this.pollution - B.pollutionDamageBase) * B.pollutionDamageFactor : 0)));
        }
        this.environmentHurt(beforeEnvironment - this.hp, environment);
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
                // A failed world commit pauses here; later actors must not move away from its retained baseline.
                if (this.session.state !== 'run' || this.paused)
                    return;
            }
        this.updateBullets(dt);
        if (this.session.state !== 'run' || this.paused)
            return;
        this.interact(dt, input, moving);
        if (this.session.state !== 'run' || this.locked)
            return;
    }
    updateEnemy(e: Enemy, dt: number) {
        if (enemyRules(this.layered?.raid) && e.tactics) advanceTacticalEnemy(this, this.tacticalEffects, e, dt);
        else advanceLegacyEnemy(this, this.enemyEffects, e, dt);
        if(e.tactics?.version===2&&e.tactics.program.kind==='recovery') {
            const live=this.enemies.find(a=>a.uid===e.uid);if(live)syncRecoveryCargo(live,this.containers);
        }
    }
    private layerMutation(action: (state: ExpansionState) => boolean | void | 'unreachable' | 'occupied', suppress = false, name = 'world', events: ViewEventBody[] = []): boolean {
        const mark = this.queue.length, from = this.worldKey().mapId;
        let ticket: ExpansionTransaction | null;
        let refusal = 'unreachable-or-rejected';
        try {
            ticket = this.saves.prepareExpansionMutation(draft => {
                const result = action(draft.expansion);
                if (typeof result === 'string') { refusal = result; return false; }
                return result;
            });
        }
        catch (error) {
            this.queue.splice(mark);
            this.rejected(name, String(error));
            throw error;
        }
        const staged = this.queue.splice(mark);
        if (!ticket) {
            this.rejected(name, refusal);
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
            // A retained ticket whose baseline moved can never commit; nothing of it was applied or published.
            else if (result === 'rejected' && this.pendingLayer === pending)
                this.pendingLayer = null;
            return false;
        }
        this.pendingLayer = null;
        this.queue.push(...pending.events.map(e => ({ ...e, durability: 'committed' as const })));
        if (pending.from !== this.worldKey().mapId) {
            // A layer change interrupts the breath charge (spec 4.2); its target stayed on the layer left behind.
            clearBreath(this.breath);
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
        const pending = this.pendingLayer;
        let ok = pending ? this.commitLayer(pending) : this.checkpoint();
        // A dropped stale ticket leaves the live world as the state to save.
        if (!ok && pending && !this.pendingLayer)
            ok = this.checkpoint();
        if (ok)
            this.setOverlay('');
        return ok;
    }
    private shotEvent(shooter: string, weapon: WeaponLook, bullets: BulletState[], angles: number[]) {
        this.emit({ type: 'shot', shotId: `${shooter}:${bullets[0].uid}`, shooter, weapon,
            pellets: bullets.map((b, i) => ({ bullet: b.uid, origin: { x: b.x, y: b.y }, angle: angles[i] })) });
    }
    /**
     * The trigger over one substep of `dt` seconds: the cooldown, a reload and the aim advance, and each shot falls due at
     * its own instant (when the gun is ready and the trigger wants it), fired from where the body was then. `from` is
     * the body before this substep's move; the body moved in a straight line to where it is now. `breath` says whether
     * the breath charge may grow (`owned`: technique-15-a and a gun in hand) and on which enemy (`sight`) over the
     * substep, so it is split at each shot exactly as the aim is; pull's zero-length call passes none and charges nothing.
     */
    private runTrigger(dt: number, from: Point, motion: Motion, turned: number, breath?: { owned: boolean; sight: string | null }) {
        if (turned)
            turnAim(this.handling, SWAY, turned);
        const to = { x: this.player.x, y: this.player.y }, aiming = preciseHeld(motion);
        let t = 0;
        const pass = (s: number) => {
            if (s <= 0)
                return;
            t += s;
            this.fireCooldown = Math.max(0, this.fireCooldown - s);
            this.clickLeft = Math.max(0, this.clickLeft - s);
            this.reloadLeft = Math.max(0, this.reloadLeft - s);
            advanceAim(this.handling, this.grip, SWAY, s, motion);
            if (breath)
                advanceBreath(this.breath, s, breath.owned, aiming, breath.sight);
        };
        for (;;) {
            // An event due at the very end of the substep (within rounding) belongs to it, at every display rate.
            if (this.reloadLeft > 0) {
                // A reload ends at its own instant; a trigger still wanting fire may shoot right after it.
                if (this.reloadLeft > dt - t + DUE)
                    break;
                pass(Math.min(this.reloadLeft, dt - t));
                this.reloadLeft = 0;
                this.loadMagazine();
                continue;
            }
            const due = this.fireCooldown;
            if (due > dt - t + DUE || !this.wantsFire(due))
                break;
            pass(Math.min(due, dt - t));
            this.fireCooldown = 0;
            const k = dt > 0 ? t / dt : 1;
            if (!this.shoot({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, Math.max(0, dt - t)))
                break;
        }
        pass(dt - t);
    }
    /**
     * Semi-automatic guns fire once per click, and keep firing at their own rate while a touch aim stick is held past the
     * fire ring; automatic guns fire while either is held. Nothing fires behind a panel or after input was suppressed.
     */
    private wantsFire(due: number) {
        if (this.overlay || this.inputSuppressed || this.paused)
            return false;
        return this.clickLeft > 0 && this.clickLeft + DUE >= due || this.trigger.held && (this.grip.mode === 'auto' || this.trigger.touch);
    }
    /** The frame's own trigger change, taking effect at the frame's time: a click, a press or a release. */
    private pull(intent: RaidIntent) {
        if (this.inputSuppressed) {
            this.trigger = { held: false, touch: false };
            this.clickLeft = 0;
            return;
        }
        if (intent.firePressed)
            this.clickLeft = CLICK_WINDOW;
        this.trigger = { held: intent.fireHeld, touch: intent.source === 'touch' };
        this.runTrigger(0, this.player, { pace: 0, sprint: false, precise: intent.precise }, 0);
    }
    /**
     * One shot or knife swing from `at` (default: where the body stands); false when the magazine is empty, which starts
     * a reload if the bag has rounds and otherwise waits for a new pull. The caller decides that the gun is ready.
     * runTrigger supplies this substep's remaining flight seconds; a frame-end pull has no active flight batch.
     */
    shoot(at: Point = this.player, flightSeconds?: number): boolean {
        const w = this.currentWeapon, h = this.grip;
        this.clickLeft = 0;
        if (w.ammo && this.mag <= 0) {
            this.startReload();
            if (!this.reloadLeft)
                this.trigger.held = false;
            return false;
        }
        this.fireCooldown = w.cooldown;
        if (!w.ammo) {
            const hit = this.enemies.find(e => e.hp > 0 && distance(e, at) < w.range
                && Math.abs(wrap(Math.atan2(e.y - at.y, e.x - at.x) - this.player.rotation)) < 1.15
                && this.sight(at, e, this.highTide, this.space ? 10 : 0));
            this.emit({ type: 'melee', attacker: 'player', angle: this.player.rotation, range: w.range, hit: hit?.uid ?? null });
            if (hit)
                this.damageEnemy(hit, w.damage * perkEffects(this.layered).knifeDamage);
            return true;
        }
        this.mag--;
        if (this.magRelief > 0)
            this.magRelief--;
        this.syncMagazine();
        // The round is spent: the shot's one critical snapshot is taken now, the breath charge included, and every pellet
        // carries its own copy.
        const crit = this.shotCrit(w, { chance: breathChance(this.breath.seconds), target: this.breath.target });
        this.shotNoise = { x: at.x, y: at.y };
        this.noiseRadius = B.gunNoiseRange;
        this.noiseTime = .6;
        // Random scatter over the cone, around a centre that recoil has pushed toward the shooter's right. `w` and `h` are
        // the gun's effective stats; the RPG body multiplier and the recoil perk scale apply once each, here.
        const body = this.layered ? rpgMultipliers(this.layered).recoil : 1;
        const cone = coneOf(this.handling, w, h, body), centre = this.player.rotation + driftOf(this.handling, h, body);
        const pellets: BulletState[] = [], angles: number[] = [];
        for (let i = 0; i < w.pellets; i++) {
            const angle = centre + (this.random() - .5) * cone;
            const b = { uid: this.allocateEntityUid(), x: at.x, y: at.y,
                rotation: wrap(angle), vx: Math.cos(angle) * 760, vy: Math.sin(angle) * 760, left: w.range + MUZZLE, damage: w.damage, enemy: false,
                ...(crit ? { crit: structuredClone(crit) } : {}) };
            this.bullets.push(b);
            if (flightSeconds !== undefined) this.newbornFlight?.set(b.uid, flightSeconds);
            pellets.push(b);
            angles.push(angle);
        }
        // The charge went into this shot (spec 4.2): a precise aim held on charges again from zero, hit or miss.
        clearBreath(this.breath);
        recoil(this.handling, h, perkEffects(this.layered).recoil);
        this.shotEvent('player', this.weaponLook, pellets, angles);
        return true;
    }
    /**
     * The critical snapshot of a gun shot fired now (docs/tasks/critical-perk-contract.md section 3), in v3 raids only:
     * the effective technique (the technique drug included), the gun fired `w` (a sample gun included), the owned perks
     * and whether the focus drug lasts, all as they are at this instant, plus the breath charge `breath` with the enemy
     * it rests on (a charge without a target counts nothing). Classic, v1 and v2 raids keep their own rules: undefined;
     * so does the knife. The HUD (presentation.ts, HudView.crit) reads the same snapshot, so it prints what a shot takes.
     * Reads only; draws no random number.
     */
    shotCrit(w: D.WeaponDef, breath: { chance: number; target: string | null }): CritSnapshot | undefined {
        const state = this.layered;
        if (!state || !perkRaidRules(state.raid)) return undefined;
        const perks = state.growth.perks ?? [], charge = breath.target === null ? 0 : breath.chance;
        const sources = critSources({ technique: effectiveAttributes(state).technique, weapon: w, perks, focus: state.body.effects.focus > 0, breath: charge });
        return sources ? { sources, multiplier: critMultiplier(perks), target: sources.some(s => s.id === 'technique-15-a') ? breath.target : null } : undefined;
    }
    damageEnemy(e: Enemy, damage: number, incomingAngle = Math.atan2(this.player.y - e.y, this.player.x - e.x), bullet?: string) {
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
                const drops = D.rollLoot(this.config.seed + this.kills * 47, getLegacyEnemyProfile(e.id).corpseLootRolls);
                for (let i = 0; i < drops.length; i++) {
                    this.random();
                    this.random();
                }
                this.createLootContainer(`corpse-${e.uid}`, 'corpse', `${D.ENEMIES[e.id].name}遗体`, e.x, e.y, drops);
            }
        }
        const now = this.enemies.find(a => a.uid === e.uid)!;
        this.hurtTimers.set(e.uid, .07);
        this.emit({ type: 'hurt', cause: 'blow', uid: e.uid, at: { x: e.x, y: e.y }, damage: hp - now.hp, critical: false, angle,
            ...(bullet === undefined ? {} : { bullet }) });
        if (now.hp <= 0) {
            this.emit({ type: 'death', uid: e.uid, ...(enemyRules(this.layered?.raid) ? { killer: 'player' } : {}), corpseAngle: now.rotation - (this.layered ? 0 : Math.PI / 2), containerId: `corpse-${e.uid}` });
            this.targetDied(e.uid);
        }
    }
    /** The breath charge's target died (spec 4.2): the charge goes now, not when the next substep finds no live enemy there. */
    private targetDied(uid: string) { if (uid === this.breath.target) clearBreath(this.breath); }
    /** Attribute actual aggregate HP loss without changing damage, clock, or RNG. */
    private environmentHurt(damage: number, losses: Partial<Record<HurtCause, number>>) {
        const parts = Object.entries(losses).filter(([, amount]) => amount! > 0) as [HurtCause, number][];
        const total = parts.reduce((sum, [, amount]) => sum + amount, 0);
        let left = damage;
        for (let i = 0; damage > 0 && total > 0 && i < parts.length; i++) {
            const [cause, amount] = parts[i];
            const attributed = i === parts.length - 1 ? left : Math.min(left, damage * amount / total);
            left -= attributed;
            if (attributed > 0) this.emit({ type: 'hurt', cause, uid: 'player', at: { x: this.player.x, y: this.player.y }, damage: attributed, critical: false, angle: null });
        }
    }
    private showIncomingHit(source?: Point) {
        if (source) {
            const angle = Math.atan2(source.y - this.player.y, source.x - this.player.x), sector = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
            this.hitDirections = this.hitDirections.filter(h => h.sector !== sector);
            this.hitDirections.push({ sector, angle, left: 1 });
        }
        this.hitNotice = 1;
    }
    hurt(amount: number, source?: Point, owner?: string, bullet?: string) {
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
        // Real damage interrupts the breath charge (spec 4.2); a blow that took no health does not.
        if (this.hp < hp)
            clearBreath(this.breath);
        this.extractTime = 0;
        this.emit({ type: 'hurt', cause: 'blow', uid: 'player', at: { ...this.player }, damage: hp - this.hp, critical: false,
            angle: source ? Math.atan2(source.y - this.player.y, source.x - this.player.x) : null,
            ...(bullet === undefined ? {} : { bullet }) });
        if (this.hp <= 0) {
            this.emit({ type: 'death', uid: 'player', corpseAngle: this.player.rotation, containerId: null });
            this.finish('death');
        }
    }
    private observeShot(e: ShotObservation) {
        this.emit({ type: 'impact', bullet: e.bullet.uid, owner: bulletOwner(e.bullet), reason: e.reason, lastFree: e.lastFree, contact: e.contact, normal: e.normal, surface: e.surface, target: e.target });
        if (e.target && e.damage > 0) {
            this.emit({ type: 'hurt', cause: 'blow', uid: e.target, at: e.contact ?? e.lastFree, damage: e.damage, critical: e.critical, angle: e.angle, bullet: e.bullet.uid });
            if (e.dead) {
                const enemy = this.enemies.find(a => a.uid === e.target);
                const killer = enemyRules(this.layered?.raid) ? bulletOwner(e.bullet) : null;
                this.emit({ type: 'death', uid: e.target, ...(killer ? { killer } : {}), corpseAngle: enemy?.rotation ?? this.player.rotation, containerId: e.target === 'player' ? null : `corpse-${e.target}` });
                this.targetDied(e.target);
            }
        }
    }
    updateBullets(dt: number) {
        const newborn = this.newbornFlight;
        this.newbornFlight = null;
        const flightSeconds = (bullet: BulletState) => newborn?.get(bullet.uid) ?? dt;
        if (this.layered) {
            const hp = this.hp, state = this.snapshotExpansion();
            advanceLayerShots(state, this.layeredWorld!, state.raid!.currentMap, dt, undefined, source => { this.showIncomingHit(source); this.extractTime = 0; }, e => this.observeShot(e), flightSeconds);
            this.restoreExpansion(state);
            // An enemy round that took health is real damage (spec 4.2), as a blow through hurt is.
            if (this.hp < hp)
                clearBreath(this.breath);
            if (this.hp <= 0)
                this.finish('death');
            return;
        }
        // Classic sampling, reverse bullet order and first live array hit are deliberately retained.
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i], seconds = flightSeconds(b), speed = Math.hypot(b.vx, b.vy), steps = Math.ceil(speed * seconds / 7);
            let remove = false;
            for (let j = 0; j < steps; j++) {
                const previous = { x: b.x, y: b.y }, previousTile = this.mapData.tiles[Math.floor(b.y / TILE)]?.[Math.floor(b.x / TILE)];
                b.x += b.vx * seconds / steps;
                b.y += b.vy * seconds / steps;
                b.left -= speed * seconds / steps;
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
                    this.emit({ type: 'impact', bullet: b.uid, owner: bulletOwner(b), reason: startBlocked ? 'start-blocked' : blocked ? 'blocked' : bounds ? 'bounds' : 'range', lastFree: previous,
                        contact: blocked && Number.isFinite(t) && t >= 0 && t <= 1 ? { x: previous.x + dx * t, y: previous.y + dy * t } : null,
                        normal: blocked && unique && !startBlocked ? crossX ? { x: -Math.sign(dx), y: 0 } : { x: 0, y: -Math.sign(dy) } : null,
                        surface: blocked ? 'wall' : null, target: null });
                    remove = true;
                    break;
                }
                const target = b.enemy ? distance(b, this.player) < 12 ? 'player' : null : this.enemies.find(e => e.hp > 0 && distance(e, b) < 14)?.uid ?? null;
                if (target) {
                    this.emit({ type: 'impact', bullet: b.uid, owner: bulletOwner(b), reason: 'hit-actor', lastFree: previous, contact: { x: b.x, y: b.y }, normal: null, surface: 'actor', target });
                    if (target === 'player')
                        this.hurt(b.damage, { x: this.player.x - b.vx, y: this.player.y - b.vy }, undefined, b.uid);
                    else
                        this.damageEnemy(this.enemies.find(e => e.uid === target)!, b.damage, Math.atan2(-b.vy, -b.vx), b.uid);
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
            ...this.enemies.filter(e => e.hp > 0 && e.tactics && actorArchetype(e)?.stance === 'conditional')
                .map(e => ({ id: e.uid, kind: 'talk' as const, at: e, label: `询问 · ${enemyDefinition(e.id).name}` })),
        ];
        for (const door of this.space.definition.doors) {
            const at = doorAnchor(this.space, door.id, this.player);
            if (at)
                candidates.push({ id: door.id, kind: 'door', at, label: this.space.doors[door.id] ? '关门' : '开门' });
        }
        let target = interactionTarget(this.space, this.player, candidates);
        // In the marked area registration outranks the old notice, while loot/doors/entries keep their normal priority.
        // Reuse the real talk range/corridor filter rather than accepting an arbitrary officer reference.
        if(target?.kind==='note'&&inCheckpointRect(BLOCKADE_WAIT,this.player)) {
            const registration=interactionTarget(this.space,this.player,candidates.filter(c=>c.kind==='talk'&&blockadeProgram(this.enemies.find(e=>e.uid===c.id)!)));
            if(registration)target={...registration,label:'登记 / 通行查询'};
        }
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
            choices: t.kind === 'exit' || this.space && !['container', 'ground'].includes(t.kind) ? [] : this.lootTargets().map(c => ({ id: c.id, name: this.lootTargetName(c), empty: !c.inventory.items.length, selected: c.id === this.lootTargetId })),
            nearby: t.kind === 'container' || t.kind === 'ground' ? this.nearbyLoot().map(l => ({ id: l.uid, item: l.id, qty: l.qty })) : [] };
    }
    /** Explicit ground refs use nearbyLoot's range/tide/occlusion rules, independent of E's
     * preferred target. Inventory and remaining ground loot commit together or both roll back.
     * A ref is scoped to its run/map; overlays and pauses still block activation.
     */
    activate(ref: TargetRef): boolean {
        if (!this.validRef(ref) || this.paused || this.overlay) {
            this.rejected('interact', 'stale-or-blocked');
            return false;
        }
        if (ref.kind === 'ground')
            return this.pickupLoot(ref.id);
        if (ref.kind === 'container' && this.canLootContainer(ref.id, ref.runId)) {
            this.lootContext = { containerId: ref.id, runId: ref.runId };
            this.suppressHeldInput();
            this.setOverlay('loot');
            return true;
        }
        if (ref.kind === 'door' && (!this.space || !doorAnchor(this.space, ref.id, this.player))) {
            this.rejected('door', 'unreachable');
            return false;
        }
        const target = this.target();
        if (!target || target.id !== ref.id || target.kind !== ref.kind) {
            this.rejected('interact', 'stale-target');
            return false;
        }
        if (target.kind === 'entry') {
            const previous = new Set(this.layered!.raid!.pursuits.map(p => p.id));
            return this.layerMutation(state => {
                const changed = changeLayer(state, this.layeredWorld!, target.id, e => this.observeShot(e));
                if (changed && state.raid!.pursuits.some(p => p.enemy.tactics && !previous.has(p.id)))
                    this.say('有人看见你进入楼梯，正在从原入口跟来。', 5);
                return changed;
            }, true, `entry:${target.id}`);
        }
        if (target.kind === 'talk') {
            const enemy = this.enemies.find(e => e.uid === target.id)!;
            const access=blockadeProgram(enemy);
            if(access) {
                if(access.phase==='none') {
                    if(!this.enemies.some(e=>e.uid===access.leader&&e.hp>0)) {
                        this.say('登记暂不可用，请从外围公共道路绕行。',10);return true;
                    }
                    const accepted=this.layerMutation(state=>requestBlockadeRegistration(state.raid!,enemy.uid),true,'registration');
                    if(accepted)this.say('登记已受理。请到哨兵左侧的金色等候标记内连续停留四秒；许可只限公共通道。',10);
                    return accepted;
                }
                this.say(access.phase==='engaged'?'通行许可已暂停，请脱离交火区域。':access.phase==='granted'
                    ?'本次行动已登记，请沿绿色公共通道通过，后场仍受限。':'请在金色等候标记内连续停留四秒；离开后需重新等待。',10);
                return true;
            }
            const t=enemy.tactics!,program=t.version===2?t.program:null;
            const text = enemy.tactics!.stance === 'hostile' ? '正在交火，请远离现场。' :
                program?.kind==='recovery' ? program.phase==='delivered' ? '回收完成，请从公共通道绕行。'
                    : program.phase==='withdraw' ? '正在撤回，请从公共通道绕行。'
                    : '正在回收物资，请从外围公共通道绕行。进入黄色边界后请在四秒警告结束前退出。' :
                '黄色边界内是限制区，请从外围公共通道绕行。可以在边界外询问；进入后请在四秒警告结束前退出。';
            // Information only: asking never buys immunity, clears a warning or resets combat on refresh.
            this.say(`${enemyDefinition(enemy.id).name}：${text}`, 9); return true;
        }
        if (target.kind === 'door') {
            const open = !this.space!.doors[target.id];
            return this.layerMutation(state => {
                const raid = state.raid!, layer = raid.maps[raid.currentMap];
                const living = [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === raid.currentMap).map(p => p.enemy)].filter(e => e.hp > 0);
                const result = toggleDoor({ definition: this.space!.definition, doors: layer.doors, highTide: raid.highTide }, target.id, raid.player, living);
                return result === 'unreachable' || result === 'occupied' ? result : true;
            }, true, 'door', [{ type: 'door', id: target.id, open, by: 'player' }]);
        }
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
