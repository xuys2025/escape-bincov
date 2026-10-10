import * as D from './domain';
import type { BulletState, EnemyState } from './checkpoint';
import type { ExpansionState, WorldDefinition } from './expansion-state';
import type { Point } from './world';
import { SURVIVAL } from './balance';
import { criticalChance, enemyDamage, trainingEfficiency } from './rpg';
import { effectiveAttributes, entityUid } from './expansion-state';
import { luckInventory } from './reputation-luck';
import { pursuitPosition } from './pursuit';
import { corridor, findLanding, separation, spacePath, traversable, type SpaceContext } from './spatial';


/** Optional observation only: never changes collision order, RNG or persistence. */
export interface ShotObservation {
    bullet: BulletState; reason: 'blocked' | 'hit-actor' | 'range' | 'bounds' | 'start-blocked';
    lastFree: Point; contact: Point | null; normal: Point | null; surface: 'wall' | 'door' | 'actor' | null;
    target: string | null; damage: number; critical: boolean; dead: boolean; angle: number | null;
}
export type ShotObserver = (event: ShotObservation) => void;
function observeShot(observer: ShotObserver | undefined, context: SpaceContext, bullet: BulletState, distance: number,
    target: string | null = null, damage = 0, critical = false, dead = false, range = false): void {
    if (!observer) return;
    const speed = Math.hypot(bullet.vx, bullet.vy), dx = speed ? bullet.vx / speed : 0, dy = speed ? bullet.vy / speed : 0;
    const at = { x: bullet.x + dx * distance, y: bullet.y + dy * distance };
    const tile = context.definition.tile, x = Math.floor((at.x + dx * 1e-7) / tile), y = Math.floor((at.y + dy * 1e-7) / tile);
    const bounds = !context.definition.cells[y]?.[x];
    const cornerX = Math.abs(at.x / tile - Math.round(at.x / tile)) < 1e-8;
    const cornerY = Math.abs(at.y / tile - Math.round(at.y / tile)) < 1e-8;
    const normal = !target && !range && distance > 0 && cornerX !== cornerY ? (cornerX ? { x: -Math.sign(dx), y: 0 } : { x: 0, y: -Math.sign(dy) }) : null;
    observer({ bullet: { ...bullet }, reason: target ? 'hit-actor' : range ? 'range' : distance === 0 ? 'start-blocked' : bounds ? 'bounds' : 'blocked',
        lastFree: { x: bullet.x + dx * Math.max(0, distance - 1e-7), y: bullet.y + dy * Math.max(0, distance - 1e-7) },
        contact: at, normal, surface: target ? 'actor' : range || bounds ? null : context.definition.doors.some(d => d.x === x && d.y === y && !context.doors[d.id]) ? 'door' : 'wall',
        target, damage, critical, dead, angle: target ? Math.atan2(-bullet.vy, -bullet.vx) : null });
}

/** Distance to the first opaque grid boundary along a finite ray (windows transmit bullets). */
export function shotBarrier(context: SpaceContext, bullet: BulletState, dx: number, dy: number): number {
    const tile = context.definition.tile;
    let x = Math.floor(bullet.x / tile), y = Math.floor(bullet.y / tile);
    const clear = (cx: number, cy: number) => traversable(context, { x: (cx + .5) * tile, y: (cy + .5) * tile }, 'bullet');
    if (!clear(x, y)) return 0;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    let tx = dx === 0 ? Infinity : ((sx > 0 ? x + 1 : x) * tile - bullet.x) / dx;
    let ty = dy === 0 ? Infinity : ((sy > 0 ? y + 1 : y) * tile - bullet.y) / dy;
    const stepX = dx === 0 ? Infinity : tile / Math.abs(dx), stepY = dy === 0 ? Infinity : tile / Math.abs(dy);
    while (Math.min(tx, ty) <= bullet.left) {
        const distance = Math.min(tx, ty), crossX = tx <= ty, crossY = ty <= tx;
        // At a corner include both adjoining cells, so a ray cannot pass between touching walls.
        if ((crossX && !clear(x + sx, y)) || (crossY && !clear(x, y + sy))) return distance;
        if (crossX) { x += sx; tx += stepX; }
        if (crossY) { y += sy; ty += stepY; }
        if (!clear(x, y)) return distance;
    }
    return Infinity;
}

/** Exact first circle intersection; distance is measured along the existing remaining trajectory. */
export function shotIntersection(bullet: BulletState, enemy: Point, dx: number, dy: number, radius = 14): number | null {
    const x = enemy.x - bullet.x, y = enemy.y - bullet.y, projected = x * dx + y * dy;
    const perpendicular2 = x * x + y * y - projected * projected;
    if (perpendicular2 > radius * radius) return null;
    const chord = Math.sqrt(Math.max(0, radius * radius - perpendicular2));
    if (projected + chord < 0) return null;
    const distance = Math.max(0, projected - chord);
    return distance <= bullet.left ? distance : null;
}

/** Actual damage and corpse ownership shared by ordinary and departing shots. */
export function damageLayerEnemy(state: ExpansionState, mapId: string, enemy: EnemyState, amount: number, gun = true): void {
    if (enemy.hp <= 0 || amount <= 0) return;
    const raid = state.raid!, layer = raid.maps[mapId], actual = Math.min(enemy.hp, amount);
    enemy.hp -= actual;
    if (mapId === raid.currentMap) { enemy.state = 'chase'; enemy.alert = 6; enemy.target = { x: raid.player.x, y: raid.player.y }; }
    if (gun) raid.training.quantity.technique += actual / 400 * (raid.version === 2 ? trainingEfficiency(state) : 1);
    if (enemy.hp > 0) return;
    raid.kills++;
    const event = raid.pursuits.find(p => p.enemy.uid === enemy.uid);
    if (event) {
        raid.pursuits = raid.pursuits.filter(p => p !== event);
        layer.enemies.push(enemy);
    }
    const inventory = D.createInventory(6, 5);
    const drops = D.rollLoot(raid.seed + raid.kills * 47, enemy.id === 'elite' ? 3 : 1);
    const random = D.seededRandom(raid.rng);
    for (const drop of drops) {
        if (D.addItem(inventory, drop.id, drop.qty, false, false, true, () => entityUid(raid, raid.nextEntity++))) throw new Error('尸体容器容量不足。');
        random(); random();
    }
    raid.rng = random.getState();
    if (raid.version === 2) luckInventory(state, mapId, inventory, enemy);
    layer.containers.push({ id: `corpse-${enemy.uid}`, runId: raid.runId, kind: 'corpse',
        name: `${D.ENEMIES[enemy.id].name}遗体`, x: enemy.x, y: enemy.y, inventory });
}

export function resolveLayerShot(state: ExpansionState, world: WorldDefinition, mapId: string, bullet: BulletState, playerPresent: boolean, hitFeedback?: (uid: string, critical: boolean) => void, playerHitFeedback?: (source: Point) => void, observer?: ShotObserver): boolean {
    const raid = state.raid!, layer = raid.maps[mapId], speed = Math.hypot(bullet.vx, bullet.vy);
    if (speed === 0 || bullet.left <= 0 || bullet.damage <= 0) return false;
    const dx = bullet.vx / speed, dy = bullet.vy / speed;
    const context = { definition: world.maps[mapId], doors: layer.doors, highTide: raid.highTide };
    const stop = shotBarrier(context, bullet, dx, dy);
    if (bullet.enemy) {
        if (playerPresent) {
            const hit = shotIntersection(bullet, raid.player, dx, dy, 12);
            if (hit !== null && hit < stop) {
                const hp = state.body.hp;
                const random = D.seededRandom(raid.rng);
                if (raid.version === 2) enemyDamage(state, bullet.damage, bullet.owner, random());
                else { state.body.hp = Math.max(0, state.body.hp - bullet.damage); raid.hitTime = .25; if (random() < SURVIVAL.bleedChance) state.body.bleeding = true; }
                raid.rng = random.getState();
                observeShot(observer, context, bullet, hit, 'player', hp - state.body.hp, false, state.body.hp <= 0);
                playerHitFeedback?.({ x: raid.player.x - bullet.vx, y: raid.player.y - bullet.vy });
                return true;
            }
        }
    } else {
        const actors = [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === mapId).map(p => p.enemy)];
        const hits = actors.filter(e => e.hp > 0).map(enemy => ({ enemy, distance: shotIntersection(bullet, enemy, dx, dy) }))
            .filter((h): h is { enemy: EnemyState; distance: number } => h.distance !== null && h.distance < stop)
            .sort((a, b) => a.distance - b.distance || a.enemy.uid.localeCompare(b.enemy.uid, 'en'));
        if (hits[0]) {
            let critical = false;
            if (raid.version === 2) {
                const enemy = hits[0].enemy, perpendicular = Math.abs((enemy.x - bullet.x) * dy - (enemy.y - bullet.y) * dx);
                const chance = criticalChance(effectiveAttributes(state).technique, 1 - Math.min(1, perpendicular / 14), state.body.effects.focus > 0 ? .05 : 0);
                const random = D.seededRandom(raid.rng); critical = random() < chance; raid.rng = random.getState();
            }
            const hp = hits[0].enemy.hp;
            damageLayerEnemy(state, mapId, hits[0].enemy, bullet.damage * (critical ? 1.5 : 1));
            observeShot(observer, context, bullet, hits[0].distance, hits[0].enemy.uid, hp - hits[0].enemy.hp, critical, hits[0].enemy.hp <= 0);
            hitFeedback?.(hits[0].enemy.uid, critical); return true;
        }
    }
    if (stop <= bullet.left) observeShot(observer, context, bullet, stop);
    return stop <= bullet.left;
}

/** The finite segment kernel is shared by normal flight and one-time departure settlement. */
export function advanceLayerShots(state: ExpansionState, world: WorldDefinition, mapId: string, dt: number, hitFeedback?: (uid: string, critical: boolean) => void, playerHitFeedback?: (source: Point) => void, observer?: ShotObserver): void {
    const layer = state.raid!.maps[mapId], survivors: BulletState[] = [];
    for (const bullet of [...layer.bullets].sort((a, b) => a.uid.localeCompare(b.uid, 'en'))) {
        const speed = Math.hypot(bullet.vx, bullet.vy), length = Math.min(bullet.left, speed * dt);
        if (speed === 0) continue;
        if (resolveLayerShot(state, world, mapId, { ...bullet, left: length }, true, hitFeedback, playerHitFeedback, observer)) continue;
        const origin = { ...bullet };
        bullet.x += bullet.vx / speed * length; bullet.y += bullet.vy / speed * length; bullet.left -= length;
        if (bullet.left > 0) survivors.push(bullet);
        else observeShot(observer, { definition: world.maps[mapId], doors: layer.doors, highTide: state.raid!.highTide }, origin, length, null, 0, false, false, true);
    }
    layer.bullets = survivors;
}

/** Resolve only existing source projectiles, then remove them. No ordinary AI or local time advances. */
export function settleDepartingShots(state: ExpansionState, world: WorldDefinition, mapId: string, observer?: ShotObserver): void {
    const raid = state.raid!, layer = raid.maps[mapId];
    for (const bullet of [...layer.bullets].sort((a, b) => a.uid.localeCompare(b.uid, 'en'))) {
        if (!resolveLayerShot(state, world, mapId, bullet, false, undefined, undefined, observer))
            observeShot(observer, { definition: world.maps[mapId], doors: layer.doors, highTide: raid.highTide }, bullet, bullet.left, null, 0, false, false, true);
    }
    layer.bullets = [];
}

/** Mutates only a private candidate. Call through SaveSession.prepareExpansionMutation. */
export function changeLayer(state: ExpansionState, world: WorldDefinition, entryId: string, observer?: ShotObserver): boolean {
    const raid = state.raid;
    if (!raid || raid.worldVersion !== world.id || raid.layoutRevision !== world.revision) return false;
    const fromId = raid.currentMap, from = world.maps[fromId], source = raid.maps[fromId];
    const entry = from.entries.find(e => e.id === entryId);
    const sourceContext = { definition: from, doors: source.doors, highTide: raid.highTide };
    if (!entry || separation(raid.player, entry.at) >= 43 || !corridor(sourceContext, raid.player, entry.at, 'body', 10)) return false;
    const target = raid.maps[entry.targetMap], targetMap = world.maps[entry.targetMap];
    const occupied: Point[] = target.enemies.filter(e => e.hp > 0);
    occupied.push(...raid.pursuits.filter(p => p.sourceMap === entry.targetMap && p.enemy.hp > 0).map(p => pursuitPosition(p, raid.elapsed)));
    const landing = findLanding({ definition: targetMap, doors: target.doors, highTide: raid.highTide }, entry.landing, occupied);
    if (!landing) return false; // No damage, RNG draws, entity allocations, or pursuit registration before this point.
    const witnesses = source.enemies.filter(e => e.hp > 0 && (e.state === 'chase' || e.state === 'attack') && e.alert > 0 && separation(e, raid.player) <= D.ENEMIES[e.id].vision
        && corridor(sourceContext, e, raid.player, 'sight'));
    raid.player = { ...landing, rotation: raid.player.rotation };
    raid.currentMap = entry.targetMap;
    settleDepartingShots(state, world, fromId, observer);
    for (const enemy of witnesses.filter(e => e.hp > 0).sort((a, b) => a.uid.localeCompare(b.uid, 'en'))) {
        const route = spacePath(sourceContext, enemy, entry.at, true);
        if (!route.length) continue;
        const path = [{ x: enemy.x, y: enemy.y }, ...route, { ...entry.at }];
        const distance = path.slice(1).reduce((sum, point, i) => sum + separation(path[i], point), 0);
        const speed = D.ENEMIES[enemy.id].speed;
        if (speed <= 0) continue;
        source.enemies = source.enemies.filter(e => e.uid !== enemy.uid);
        raid.pursuits.push({ id: `pursuit-${raid.nextEntity++}`, enemy, sourceMap: fromId, targetMap: entry.targetMap, entry: entry.id,
            path, distance, speed, registeredAt: raid.elapsed, arrivalAt: raid.elapsed + distance / speed + 1, waiting: false });
    }
    raid.training.motion.anchor = null;
    return true;
}
