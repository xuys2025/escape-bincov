import * as D from '../domain';
import { getLegacyEnemyProfile } from '../enemy-profile';
import { actorArchetype, actorDefinition, enemyBoundary } from '../enemy-archetypes';
import { blockadeProgram, BLOCKADE_WAIT, BLOCKADE_PASSAGE } from '../enemy-blockade';
import { WORLD, type Point } from '../world';
import type { BulletState } from '../checkpoint';
import { tideFlooded } from '../spatial';
import { isMallWorld } from '../mall-world';
import { rpgMultipliers } from '../rpg';
import { coneOf, driftOf } from '../shooting';
import { BREATH_FULL, breathChance } from '../breath';
import { perkRaidRules } from '../expansion-state';
import { critBreakdown } from '../perks';
import { ATTACHMENTS } from '../gunsmith/catalog';
import type { CoastRaidRuntime } from './runtime';
import type { ActorView, CritChanceView, DevicesView, MapDef, RegionDef, TerrainCode, ViewFrame, WorldKey } from './contract';

export function freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) freeze(child);
    }
    return value;
}
export const contains = (r: RegionDef, p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
/**
 * Whether a point is shown now: outdoors, or every room containing it revealed (rooms may overlap; fail closed). The
 * rule frameView's region of an actor follows, and the view's shownAt; the devices obey it too (#28 M2-03).
 */
export const pointShown = (map: MapDef, revealed: Readonly<Record<string, boolean>>, p: Point) =>
    map.regions.every(r => !r.inside || !contains(r, p) || revealed[r.id] === true);

export function mapView(r: CoastRaidRuntime, key: WorldKey): MapDef {
    const space = r.space?.definition, data = r.mapData;
    const prefix = `${key.worldVersion}/${key.layoutRevision ?? '-'}/${key.mapId}`;
    const mall = isMallWorld(key.worldVersion);
    const buildingId = `${prefix}/building/${mall ? 'mall' : 'resident'}`;
    const regions: RegionDef[] = (space?.regions ?? []).map(region => {
        // Identity is authored metadata, never display copy. These existing view IDs do not enter a save.
        if (!region.id) throw new Error(`Missing region id: ${key.mapId}/${region.name}`);
        return { ...region, id: region.id, inside: region.inside !== false,
            sealed: !!region.sealed, buildingId: mall && region.inside === false ? null : buildingId };
    });
    const buildings = data.buildings.map(b => ({ ...b, id: `${prefix}/building/${b.kind}/${b.x},${b.y}`, regionIds: [] as string[] }));
    if (mall) {
        // Inclusive tile bounds x=8..64, y=6..48 include the east/south facade cells.
        buildings.push({ id: buildingId, name: '滨湾商场', kind: 'mall', x: 8 * 32, y: 6 * 32, w: 57 * 32, h: 43 * 32,
            regionIds: regions.filter(a => a.inside).map(a => a.id) });
    } else if (space && regions.length) {
        const x = Math.min(...regions.map(a => a.x)), y = Math.min(...regions.map(a => a.y));
        buildings.push({ id: buildingId, name: '褪色居民楼', kind: WORLD.buildings.find(b => b.name === '褪色居民楼')!.kind,
            x, y, w: Math.max(...regions.map(a => a.x + a.w)) - x, h: Math.max(...regions.map(a => a.y + a.h)) - y,
            regionIds: regions.filter(a => a.inside).map(a => a.id) });
    }
    const cells = space?.cells.map(row => [...row]) ?? data.tiles.map(row => row.map(t => t === 3 ? 'wall' as const : t === 4 ? 'tide' as const : 'floor' as const));
    const map: MapDef = {
        key, name: space?.name ?? '沿海封锁区', floor: space?.floor ?? '室外 / 一楼', tile: 32,
        cols: cells[0].length, rows: cells.length, cells, terrain: data.tiles.map(row => [...row] as TerrainCode[]),
        doors: (space?.doors ?? []).map(d => ({ ...structuredClone(d), wall: d.anchors[0].x !== d.anchors[1].x ? 'ns' : 'ew' })),
        entries: (space?.entries ?? []).map(e => ({ id: e.id, at: { ...e.at }, label: e.label ?? '楼层入口', targetMap: e.targetMap,
            kind: e.label?.startsWith('上楼') ? 'up' : e.label?.startsWith('下楼') ? 'down' : 'portal' })),
        regions, buildings,
        decorations: (space?.decorations ?? []).map(d => ({ ...d, id: `${prefix}/decor/${d.kind}/${d.x},${d.y}/${d.name}` })),
        exits: r.visibleExits.map(e => ({ id: e.id, name: e.name, at: { x: e.x, y: e.y }, radius: 48 })),
        notes: data.notes.map(n => ({ id: n.title, title: n.title, at: { x: n.x, y: n.y } })),
        bounds: { x: 0, y: 0, w: cells[0].length * 32, h: cells.length * 32 },
    };
    return freeze(map);
}

/** Same predicate and 16px invalidation as RaidScene.drawRoofs; not exploration memory. */
export class Revelation {
    private signature = '';
    private value: Record<string, boolean> = {};
    reset() { this.signature = ''; }
    read(r: CoastRaidRuntime, map: MapDef): Record<string, boolean> {
        const signature = `${r.epoch}:${map.key.mapId}:${Math.floor(r.player.x / 16)},${Math.floor(r.player.y / 16)}:${JSON.stringify(r.space?.doors)}`;
        if (signature === this.signature) return this.value;
        this.signature = signature;
        this.value = Object.fromEntries(map.regions.map(region => {
            const near = { x: Math.max(region.x + 40, Math.min(region.x + region.w - 40, r.player.x)),
                y: Math.max(region.y + 40, Math.min(region.y + region.h - 40, r.player.y)) };
            return [region.id, !region.inside || !region.sealed && (contains(region, r.player)
                || Math.hypot(r.player.x - near.x, r.player.y - near.y) < 80 && r.sight(r.player, near))];
        }));
        return this.value;
    }
}

export const bulletOwner = (b: BulletState): string | null => b.enemy ? b.owner ?? null : 'player';

const floodCache = new WeakMap<MapDef, readonly number[]>();
function floodedCells(map: MapDef, high: boolean): readonly number[] {
    if (!high) return EMPTY_FLOOD;
    let cells = floodCache.get(map);
    if (!cells) {
        const doors = new Set(map.doors.map(d => d.y * map.cols + d.x));
        cells = Object.freeze(map.cells.flatMap((row, y) => row.flatMap((cell, x) =>
            tideFlooded(cell, high) && !doors.has(y * map.cols + x) ? [y * map.cols + x] : [])));
        floodCache.set(map, cells);
    }
    return cells;
}
const EMPTY_FLOOD: readonly number[] = Object.freeze([]);

/**
 * HudView.crit: the snapshot a shot fired now would take (CoastRaidRuntime.shotCrit), once without the breath charge and,
 * while the charge holds a target, once with it, each as critBreakdown prints it. One derivation for the shot and the
 * HUD; nothing here rolls. A v1 or v2 raid gets only its old-rule mark, a classic raid nothing.
 */
function critChanceView(r: CoastRaidRuntime): CritChanceView | null {
    const version = r.layered?.raid?.version;
    if (version === undefined) return null;
    if (!perkRaidRules(r.layered?.raid)) return { rule: 'old', gun: null, onTarget: null };
    const w = r.currentWeapon, { target, seconds } = r.breath, plain = r.shotCrit(w, { chance: 0, target: null });
    const aimed = plain && target !== null ? r.shotCrit(w, { chance: breathChance(seconds), target }) : undefined;
    return { rule: 'v3', gun: plain ? critBreakdown(plain.sources) : null, onTarget: aimed ? critBreakdown(aimed.sources) : null };
}

/**
 * HudView.devices (#28 M2-03): the device parts of the gun in hand with their switches, the laser's beam as the Runtime
 * casts it (CoastRaidRuntime.laserBeam) and what the light outlines. The light shows containers and ground items within
 * its reach and arc along the aim, in line of sight from the body, on this floor (the only one whose containers and
 * loot the Runtime holds) and only where shown: never an enemy, nothing inside a room not revealed. Null with the knife
 * drawn, without a gun, or with a gun that has no device.
 */
function devicesView(r: CoastRaidRuntime, map: MapDef, revealed: Readonly<Record<string, boolean>>): DevicesView | null {
    const d = r.devices;
    if (!d) return null;
    const beam = r.laserBeam(), { x, y, rotation } = r.player, light = d.light;
    const lit = (p: Point) => {
        const dx = p.x - x, dy = p.y - y, off = Math.atan2(dy, dx) - rotation;
        return !!light && Math.hypot(dx, dy) <= light.radius && Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= light.arc / 2
            && pointShown(map, revealed, p) && r.sight(r.player, p);
    };
    return {
        parts: d.parts.map(p => ({ uid: p.uid, name: ATTACHMENTS[p.id].name, laser: p.laser, light: p.light, on: p.on })),
        laser: beam && { to: beam.to, hit: beam.hit, inRange: beam.inRange },
        light: light && { radius: light.radius, arc: light.arc, lit: [...r.containers.filter(lit).map(c => c.id), ...r.loot.filter(lit).map(l => l.uid)] },
        spot: d.spot,
    };
}

export function frameView(r: CoastRaidRuntime, map: MapDef, velocities: ReadonlyMap<string, Point>): ViewFrame {
    const revealed = r.revelation.read(r, map);
    const checkpointOwner=r.enemies.find(e=>e.hp>0&&e.id==='blockade-sentry'&&blockadeProgram(e))
        ??r.enemies.find(e=>e.hp>0&&e.id==='blockade-sergeant'&&blockadeProgram(e))
        ??r.enemies.find(e=>e.hp>0&&e.id==='blockade-patrol'&&blockadeProgram(e));
    // Overlap fails closed: a containing unrevealed room wins; deterministic ties by stable ID.
    const regionAt = (p: Point) => map.regions.filter(a => a.inside && contains(a, p))
        .sort((a, b) => Number(!!revealed[a.id]) - Number(!!revealed[b.id]) || a.id.localeCompare(b.id, 'en'))[0]?.id ?? null;
    const limits = r.limits, needs = r.layered?.raid ? r.layered.body : null;
    const actor = (e: typeof r.player | typeof r.enemies[number], player: boolean): ActorView => {
        const enemy = player ? null : e as typeof r.enemies[number], hp = enemy?.hp ?? r.hp;
        const uid = enemy?.uid ?? 'player', velocity = velocities.get(uid) ?? { x: 0, y: 0 };
        const spec = enemy ? actorArchetype(enemy) : undefined;
        const registration=enemy&&enemy.uid===checkpointOwner?.uid?blockadeProgram(enemy):null;
        const containerId = `corpse-${uid}`, profile = spec ? { bodyKind: spec.body, weapon: spec.weapon } : enemy ? getLegacyEnemyProfile(enemy.id) : null;
        return { uid, kind: profile?.bodyKind ?? 'player', x: e.x, y: e.y, aim: e.rotation,
            vx: velocity.x, vy: velocity.y, hp, maxHp: enemy ? actorDefinition(enemy).hp : limits.hp, alive: hp > 0,
            weapon: profile?.weapon ?? r.weaponLook,
            ...(player && r.heldGun ? { gun: r.heldGun } : {}),
            ...(enemy?.tactics && spec ? { tactics: { archetype: enemy.id, name: spec.name, phase: enemy.tactics.phase,
                stance: enemy.tactics.stance, awareness: enemy.tactics.awareness, left: enemy.tactics.phaseLeft,
                total: enemy.tactics.phase === 'windup' ? spec.windup : enemy.tactics.phase === 'reload' ? spec.reload
                    : enemy.tactics.phase === 'recovery' ? spec.recovery : enemy.tactics.phase === 'release' && spec.attack === 'pounce' ? .3 : 0,
                range: spec.range, aim: enemy.tactics.lockedAim,
                warningLeft: Math.max(0, (spec.stance === 'conditional' ? 4 : 1.5) - enemy.tactics.warning),
                boundary: enemyBoundary(enemy),
                ...(registration?{checkpoint:{phase:registration.phase,waited:registration.waited,waiting:BLOCKADE_WAIT,passage:BLOCKADE_PASSAGE}}:{}) } } : {}),
            state: { moving: !!(velocity.x || velocity.y), sprinting: player && r.sprinting, precise: player && r.intent.precise,
                reloading: enemy?.tactics?.phase === 'reload' ? { left: enemy.tactics.phaseLeft, total: spec!.reload } : player && r.reloadLeft > 0 ? { left: r.reloadLeft, total: r.reloadTime } : null,
                attackCooldown: Math.max(0, enemy?.cooldown ?? r.fireCooldown), hurtLeft: player ? r.hitTime : r.hurtTimers.get(uid) ?? 0, ai: enemy?.state ?? null },
            regionId: regionAt(e), corpse: hp > 0 ? null : { angle: e.rotation - (enemy && !r.layered ? Math.PI / 2 : 0),
                containerId: r.containers.some(c => c.id === containerId) ? containerId : null } };
    };
    const w = r.currentWeapon, loadout = r.session.loadout ?? r.terminalLoadout, grip = r.grip, body = r.layered ? rpgMultipliers(r.layered).recoil : 1;
    return {
        player: actor(r.player, true), actors: r.enemies.map(e => actor(e, false)),
        bullets: r.bullets.map(b => ({ uid: b.uid, x: b.x, y: b.y, vx: b.vx, vy: b.vy, enemy: b.enemy, owner: bulletOwner(b) })),
        loot: r.loot.map(l => ({ uid: l.uid, item: l.id, qty: l.qty, x: l.x, y: l.y, regionId: regionAt(l) })),
        containers: r.containers.map(c => ({ id: c.id, runId: c.runId, kind: c.kind, name: c.name, x: c.x, y: c.y,
            stacks: c.inventory.items.length, totalQty: c.inventory.items.reduce((n, i) => n + i.qty, 0),
            ownerUid: c.kind === 'corpse' ? c.id.slice('corpse-'.length) : null, regionId: regionAt(c) })),
        doors: { ...r.space?.doors }, highTide: r.highTide, flooded: floodedCells(map, r.highTide), revealed: { ...revealed }, interaction: r.targetView(),
        hud: { hp: r.hp, maxHp: limits.hp, stamina: r.stamina, maxStamina: limits.stamina, pollution: r.pollution, bleeding: !!r.bleeding,
            needs: needs ? { mental: needs.mental, water: needs.water, satiety: needs.satiety } : null,
            timeLeft: Math.max(0, r.config.duration - r.elapsed), tideWarning: r.warned && !r.tideChanged, highTide: r.highTide,
            weapon: { id: w.id, name: w.name, mag: r.mag, magSize: w.magazine, reserve: w.ammo ? D.count(loadout.bag, w.ammo) : 0, reloading: r.reloadLeft > 0 },
            // The cone a shot fired now meets: with the laser resting on a body in range, the laser's (shotGrip).
            aim: { mode: grip.mode, cone: coneOf(r.handling, w, r.shotGrip, body), drift: driftOf(r.handling, grip, body),
                raise: r.handling.raise, sway: r.handling.sway, bloom: r.handling.bloom },
            breath: r.breathOwned ? { target: r.breath.target, seconds: r.breath.seconds, chance: breathChance(r.breath.seconds), full: BREATH_FULL } : null,
            crit: critChanceView(r),
            devices: devicesView(r, map, revealed), sight: r.gunSight,
            heals: D.count(loadout.bag, 'bandage') + D.count(loadout.bag, 'medkit'), hitDirections: r.hitDirections.map(h => ({ angle: h.angle, left: h.left })) },
        phase: r.ending ? 'ending' : r.paused ? 'paused' : r.overlay ? 'blocked' : 'running',
    };
}
