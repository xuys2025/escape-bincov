/**
 * 试枪场 (shooting range, maintainer 2026-10-22): a playtest raid for comparing weapon handling. One layered building
 * raid (coast-buildings-v1, seed 42) on a SaveSession whose storage is a Map in this page's memory, so nothing here
 * reads or writes browser storage or the real save. The Runtime is the real one with its AI frozen. The targets are
 * enemies of the coast map moved to fixed spots by the same snapshot → edit → restore path as the ?test=1 driver
 * (raid-runtime/test-support.ts), and `observe` keeps them standing after every advance. No DOM here.
 */
import * as D from '../domain';
import { createSessionState, SaveSession } from '../session';
import { CoastRaidRuntime } from '../raid-runtime/runtime';
import type { PublishedView } from '../raid-runtime/contract';
import type { EnemyState } from '../checkpoint';
import type { ExpansionState } from '../expansion-state';
import { drawAim, SWAY } from '../shooting';
import { checkpointBodyFits, traversable } from '../spatial';
import type { Point } from '../world';

export type RangeWeapon = 'pistol' | 'carbine' | 'shotgun' | 'm4a1' | 'knife';
export const RANGE_WEAPONS: readonly RangeWeapon[] = ['pistol', 'carbine', 'shotgun', 'm4a1', 'knife'];

const SEED = 42, MAP = 'coast', KIND = 'elite';
/**
 * Where the player stands, facing east: the shooting bench's lane (tests/fixtures/shooting-bench.ts LANE), an outdoor
 * street on the coast map of that seed with more than 700 px of clear line east. The camera stops at the map's west
 * edge, so the street east of it fills the screen: 1280 px wide shows about 17 tiles of it, 1920 px all 20.
 */
export const FIRING_LINE: Readonly<Point> = { x: 208, y: 1104 };
/**
 * Fixed targets 5, 10, 15 and 20 tiles (32 px) from the firing line, within a pixel. They stand staggered across the
 * street, never in single file: a body stops every shot that passes within 14 px of its centre, so a target in front
 * would shield the ones behind it. All stand on the north half of the street, because the warehouse wall south of it
 * hides anyone standing close to it in the 2.5D view.
 */
export const TARGETS: readonly { id: string; tiles: number; at: Readonly<Point> }[] = [
    { id: 'd5', tiles: 5, at: { x: 358, y: 1048 } },
    { id: 'd10', tiles: 10, at: { x: 522, y: 1040 } },
    { id: 'd15', tiles: 15, at: { x: 686, y: 1064 } },
    { id: 'd20', tiles: 20, at: { x: 848, y: 1104 } },
];
/**
 * The moving target walks back and forth across the street, from its north edge to its south edge, about 13 tiles
 * out, at walking pace (px per raid second). It crosses in the gap between two warehouses, so no wall hides it at the
 * south edge, and no fixed target stands between it and the firing line.
 */
export const MOVER = { id: 'mover', x: 628, from: 1040, to: 1136, speed: 60 } as const;

/** A layered building raid on a SaveSession over a Map in memory; the Runtime is built but not started. */
export function createRangeRaid() {
    const data = new Map<string, string>();
    const storage: D.StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
    const session = createSessionState(), saves = new SaveSession(session, () => storage);
    if (!saves.initialize()) throw new Error(session.storageError || 'The range save did not start.');
    session.state = 'hideout';
    if (!saves.beginRun(SEED, true)) throw new Error(session.storageError || 'The range raid did not start.');
    session.state = 'run';
    return { session, saves, core: new CoastRaidRuntime(session, saves) };
}

/** The loadout gun's ammunition and the rounds the bag lacks for a full stack, once it holds less than `below` of one. */
function short(loadout: D.RunLoadout, below: number) {
    const ammo = D.equippedWeapon(loadout).ammo;
    if (!ammo) return null;
    const stack = D.ITEMS[ammo].stack, have = D.count(loadout.bag, ammo);
    return have < stack * below ? { ammo, rounds: stack - have } : null;
}
/**
 * Keep the range from running dry: the gun's ammunition is topped up to a full stack when a gun is handed out, and
 * again whenever the bag holds less than half a stack (a full bag simply takes what fits).
 */
function stock(loadout: D.RunLoadout, below = .5) {
    const need = short(loadout, below);
    if (need) D.addItem(loadout.bag, need.ammo, need.rounds);
}
const facing = (at: Point) => Math.atan2(FIRING_LINE.y - at.y, FIRING_LINE.x - at.x);
const hurt = (e: EnemyState | undefined) => !!e && e.hp < D.ENEMIES[e.id].hp;

export interface RangeStats {
    /** Shots fired and knife swings. */
    shots: number;
    /** Hurt events per target id: every shotgun pellet that lands counts. */
    hits: Record<string, number>;
}

export class ShootingRange {
    stats: RangeStats = ShootingRange.zero();
    moving = true;
    /** Each target id with the enemy standing in for it, and the reverse lookup. */
    private readonly uids: readonly { id: string; uid: string }[];
    private readonly ids: ReadonlyMap<string, string>;
    /** Raid seconds the moving target has walked, and the raid time `observe` saw last. */
    private walked = 0;
    private seen: number;

    constructor(readonly core: CoastRaidRuntime) {
        const state = core.snapshotExpansion(), raid = state.raid!, world = core.layeredWorld;
        if (raid.worldVersion !== 'coast-buildings-v1' || raid.seed !== SEED || !world?.maps[MAP]) throw new Error('The range needs the seed 42 building raid.');
        // Every spot must hold a body at either tide (the tide turns at five minutes), as checkpoints require.
        const path = Array.from({ length: (MOVER.to - MOVER.from) / 4 + 1 }, (_, i) => ({ x: MOVER.x, y: MOVER.from + i * 4 }));
        for (const p of [FIRING_LINE, ...TARGETS.map(t => t.at), ...path]) for (const highTide of [false, true]) {
            const context = { definition: world.maps[MAP], doors: raid.maps[MAP].doors, highTide };
            if (!checkpointBodyFits(context, p) || !traversable(context, p, 'body', 10)) throw new Error(`Range spot does not fit a body: (${p.x}, ${p.y}).`);
        }
        const chosen = raid.maps[MAP].enemies.filter(e => e.hp > 0).slice(0, TARGETS.length + 1);
        if (chosen.length < TARGETS.length + 1) throw new Error('The range needs five enemies on the coast map.');
        this.uids = [...TARGETS, MOVER].map((t, i) => ({ id: t.id, uid: chosen[i].uid }));
        this.ids = new Map(this.uids.map(t => [t.uid, t.id]));
        // The targets all become the toughest kind (190 health): within one frame a shotgun blast or a short burst
        // cannot take one down before observe restores it. The roster records each enemy's kind, so it changes too.
        for (const e of chosen) { e.id = KIND; raid.roster.find(r => r.uid === e.uid)!.id = KIND; }
        core.freezeAI = true;
        this.lineUp(state);
        stock(raid.loadout, 1);
        core.restoreExpansion(state);
        core.epoch++; core.revelation.reset();
        this.seen = core.elapsed;
    }
    private static zero(): RangeStats { return { shots: 0, hits: Object.fromEntries([...TARGETS, MOVER].map(t => [t.id, 0])) }; }

    /** Where the moving target stands after walking `seconds`: north edge to south edge and back, at a steady pace. */
    static moverAt(seconds: number): Point {
        const span = MOVER.to - MOVER.from, d = (seconds * MOVER.speed) % (2 * span);
        return { x: MOVER.x, y: MOVER.from + (d <= span ? d : 2 * span - d) };
    }
    /** The player on the firing line facing east and every target at its spot, in a layered state about to be restored. */
    private lineUp(state: ExpansionState) {
        const raid = state.raid!, layer = raid.maps[MAP];
        raid.currentMap = MAP;
        raid.player = { x: FIRING_LINE.x, y: FIRING_LINE.y, rotation: 0 };
        // Bullets may only be in flight on the current floor.
        for (const map of Object.values(raid.maps)) map.bullets = [];
        this.stand(raid, layer.enemies, layer.containers, this.uids);
    }
    /**
     * Stand these targets at their spots, at full health and calm (a hit leaves an enemy chasing, and a chasing enemy
     * follows the player through a door). One taken down within a frame stands up again: no corpse, no kill counted.
     */
    private stand(owner: { kills: number }, enemies: EnemyState[], containers: { id: string }[], which: readonly { id: string; uid: string }[]) {
        const corpses = new Set<string>();
        for (const { id, uid } of which) {
            const e = enemies.find(a => a.uid === uid);
            if (!e) continue;
            if (e.hp <= 0) corpses.add(`corpse-${uid}`);
            const at = TARGETS.find(t => t.id === id)?.at ?? ShootingRange.moverAt(this.walked);
            Object.assign(e, { x: at.x, y: at.y, rotation: facing(at), home: { ...at }, target: { ...at }, path: [], state: 'patrol', alert: 0, hp: D.ENEMIES[e.id].hp });
        }
        owner.kills -= corpses.size;
        for (let i = containers.length - 1; i >= 0; i--) if (corpses.has(containers[i].id)) containers.splice(i, 1);
    }

    private get live() { return !this.core.disposed && !this.core.ending; }

    /**
     * Hand the player a weapon. A gun of the game is its own instance, a factory one under a new uid unless that gun is
     * already in hand, with a full magazine (its effective capacity) and its ammunition in the bag, set the way the test
     * driver sets it; the sample rifle (SAMPLE_GUNS) carries its own endless reserve. Every switch draws the new weapon
     * as the game does: the aim starts from the hip and the body sways.
     */
    arm(weapon: RangeWeapon) {
        const c = this.core;
        if (!this.live) return;
        if (weapon === 'knife') return this.knife(true);
        if (weapon === 'm4a1') { if (c.sampleGun === 'm4a1') this.knife(false); else c.setSampleGun('m4a1'); return; }
        c.setSampleGun(null);
        const state = c.snapshot(), l = state.loadout;
        if (l.weapon !== weapon || l.weaponUid === null) {
            const scratch = D.createInventory(6, 5); D.addItem(scratch, weapon); // a new item uid and a factory state
            Object.assign(l, { weaponUid: scratch.items[0].uid, gun: scratch.items[0].gun });
        }
        l.weapon = weapon; l.ammo = D.equippedWeapon(l).magazine; l.ammoRelief = 0; // a full magazine; more fails checkpoint validation
        state.knife = false; state.reloadLeft = 0; state.fireCooldown = 0;
        stock(state.loadout, 1);
        c.restore(state);
        drawAim(c.handling, SWAY);
    }
    private knife(on: boolean) {
        const c = this.core;
        if (c.knife === on) return;
        const state = c.snapshot(); state.knife = on; state.reloadLeft = 0; c.restore(state);
        drawAim(c.handling, SWAY);
    }
    /** The moving target stops where it stands, or walks on from there. */
    setMoving(on: boolean) { this.moving = on; }
    /** Counts back to zero, every target at its spot, the moving one back at its start, the player on the firing line. */
    reset() {
        const c = this.core;
        if (!this.live) return;
        this.stats = ShootingRange.zero();
        this.walked = 0;
        const state = c.snapshotExpansion();
        this.lineUp(state);
        c.restoreExpansion(state);
        c.epoch++; c.revelation.reset();
        this.seen = c.elapsed;
    }

    /**
     * Read one published batch right after the Runtime advanced: count the player's shots and swings and the hits on
     * each target. Then put every target that took damage back at full health, walk the moving target on by the raid
     * time that passed (so it waits while the raid is paused) and top up the bag. Returns the batch unchanged.
     */
    observe(batch: PublishedView): PublishedView {
        const c = this.core, ids = this.ids;
        for (const e of batch.events) {
            if (e.type === 'shot' && e.shooter === 'player' || e.type === 'melee' && e.attacker === 'player') this.stats.shots++;
            else if (e.type === 'hurt' && ids.has(e.uid)) this.stats.hits[ids.get(e.uid)!]++;
        }
        const time = batch.stamp.simulationTime, dt = Math.max(0, time - this.seen);
        this.seen = time;
        if (!this.live) return batch;
        // The targets live on the coast map; on another floor only the bag is looked after.
        const here = c.layered?.raid?.currentMap === MAP, walk = here && this.moving && dt > 0;
        if (walk) this.walked += dt;
        const damaged = here && this.uids.some(t => hurt(c.enemies.find(e => e.uid === t.uid)));
        const low = !!c.session.loadout && !!short(c.session.loadout, .5);
        if (!walk && !damaged && !low) return batch;
        const state = c.snapshot();
        if (here) this.stand(state, state.enemies, state.containers,
            this.uids.filter(t => walk && t.id === MOVER.id || hurt(state.enemies.find(e => e.uid === t.uid))));
        stock(state.loadout);
        c.restore(state);
        return batch;
    }

    /** Each target's enemy and where it stands now (read by the ?test=1 checks). */
    positions() {
        return this.uids.map(({ id, uid }) => {
            const e = this.core.enemies.find(a => a.uid === uid);
            return { id, uid, x: e?.x ?? NaN, y: e?.y ?? NaN, hp: e?.hp ?? 0 };
        });
    }
}
