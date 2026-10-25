import { ENEMIES } from '../domain';
import type { ActorState, EnemyState } from '../checkpoint';
import type { Point } from '../world';
import type { SpaceContext } from '../spatial';
import { getLegacyEnemyProfile } from '../enemy-profile';

/** The current world owns collision and movement. AI never discovers another layer or reads storage. */
export interface LegacyEnemyWorld {
    readonly player: Point;
    readonly highTide: boolean;
    readonly shotNoise: Point | null;
    readonly noiseTime: number;
    readonly noiseRadius: number;
    readonly space: SpaceContext | null;
    sight(from: Point, to: Point, highTide?: boolean, radius?: number): boolean;
    walkable(x: number, y: number, highTide?: boolean, radius?: number): boolean;
    path(from: Point, to: Point, highTide?: boolean): Point[];
    dryRefuge(from: Point): Point | null;
    move(actor: ActorState, dx: number, dy: number, canEscapeFlood?: boolean): void;
}

/**
 * RNG, attacks and durable doors stay owned by the Runtime. Calls happen synchronously in the old order;
 * openDoor must use the existing candidate transaction and publish its event only after a successful write.
 * An effect may restore live entity state (including on failure), so no movement follows a door attempt.
 */
export interface LegacyEnemyEffects {
    random(): number;
    fire(enemy: EnemyState, angle: number): void;
    strike(enemy: EnemyState): void;
    openDoor(enemy: EnemyState, id: string): void;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const wrap = (angle: number) => ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

/**
 * Compatibility controller for the four shipped enemy IDs. dt is simulation seconds, positions are world pixels.
 * Mutates only this enemy plus the explicitly owned effects; no extra RNG draws, clocks or persistent fields.
 * This preserves the shipped five-state behaviour, not the planned 18 archetypes' confirmation/attack phases.
 */
export function advanceLegacyEnemy(world: LegacyEnemyWorld, effects: LegacyEnemyEffects, e: EnemyState, dt: number): void {
    const profile = getLegacyEnemyProfile(e.id);
    const def = ENEMIES[e.id], dist = distance(e, world.player), sees = dist < def.vision && world.sight(e, world.player);
    e.timer -= dt;
    e.cooldown -= dt;
    e.repath -= dt;
    e.alert = Math.max(0, e.alert - dt);
    const escaping = world.highTide && !world.walkable(e.x, e.y, true, 10);
    if (escaping) {
        const refuge = world.dryRefuge(e);
        if (refuge) {
            if (!e.path.length || e.repath <= 0) {
                e.path = world.path(e, refuge, false);
                e.repath = 1;
            }
            while (e.path.length && distance(e, e.path[0]) < 10)
                e.path.shift();
            const target = e.path[0] || refuge, angle = Math.atan2(target.y - e.y, target.x - e.x);
            e.rotation = wrap(angle);
            world.move(e, Math.cos(angle) * def.speed * dt, Math.sin(angle) * def.speed * dt, true);
        }
        return;
    }
    if (sees) {
        e.state = dist < def.range ? 'attack' : 'chase';
        e.target = { x: world.player.x, y: world.player.y };
        e.alert = 5;
    }
    else if (world.noiseTime > 0 && world.shotNoise && distance(e, world.shotNoise) < world.noiseRadius) {
        e.state = 'investigate';
        e.target = { ...world.shotNoise };
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
        const p = { x: e.home.x + (effects.random() - .5) * 170, y: e.home.y + (effects.random() - .5) * 170 };
        if (world.walkable(p.x, p.y, world.highTide))
            e.target = p;
        e.timer = 3 + effects.random() * 4;
    }
    if (e.state === 'attack' && sees) {
        e.rotation = wrap(Math.atan2(world.player.y - e.y, world.player.x - e.x));
        if (e.cooldown <= 0) {
            e.cooldown = def.cooldown;
            const angle = e.rotation + (effects.random() - .5) * .16;
            if (profile.attack === 'projectile') effects.fire(e, angle);
            else if (!world.space || world.sight(e, world.player, world.highTide, 10)) effects.strike(e);
        }
        return;
    }
    if (distance(e, e.target) > 12) {
        if (e.repath <= 0) {
            e.path = world.path(e, e.target, world.highTide);
            e.repath = .9 + effects.random() * .6;
        }
        let target = e.target;
        if (!world.sight(e, target, world.highTide, 10) || !world.walkable(target.x, target.y, world.highTide)) {
            while (e.path.length && distance(e, e.path[0]) < 14)
                e.path.shift();
            if (e.path.length) target = e.path[0];
            else return;
        }
        const angle = Math.atan2(target.y - e.y, target.x - e.x);
        if (world.space) {
            const next = { x: e.x + Math.cos(angle) * (def.speed * dt + 12), y: e.y + Math.sin(angle) * (def.speed * dt + 12) };
            const door = world.space.definition.doors.find(d => Math.floor(next.x / 32) === d.x && Math.floor(next.y / 32) === d.y);
            if (door && !world.space.doors[door.id]) {
                effects.openDoor(e, door.id);
                return;
            }
        }
        e.rotation = wrap(angle);
        world.move(e, Math.cos(angle) * def.speed * dt, Math.sin(angle) * def.speed * dt, true);
    }
}
