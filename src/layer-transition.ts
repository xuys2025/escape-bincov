import * as D from './domain';
import { getLegacyEnemyProfile } from './enemy-profile';
import { archetype, enemyDefinition } from './enemy-archetypes';
import { presetState } from './gunsmith/presets';
import { canDamageEnemy } from './enemy-relations';
import { enemyDamageAfterArmor } from './enemy-defense';
import { enemyPost } from './enemy-posts';
import type { BulletState, EnemyState } from './checkpoint';
import type { ExpansionState, LayeredRaid, WorldDefinition } from './expansion-state';
import type { Point } from './world';
import { SURVIVAL } from './balance';
import { criticalChance, enemyDamage, trainingEfficiency } from './rpg';
import { effectiveAttributes, entityUid, rpgEnabled, enemyRules, perkRaidRules } from './expansion-state';
import { luckInventory } from './reputation-luck';
import { snapshotChance } from './perks';
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

/** Live enemies a ray meets before `stop`, nearest first and ties by uid: the layer's own and the pursuers it still owns. */
function enemiesOnRay(raid: LayeredRaid, mapId: string, ray: BulletState, dx: number, dy: number, stop: number) {
    const actors = [...raid.maps[mapId].enemies, ...raid.pursuits.filter(p => p.sourceMap === mapId).map(p => p.enemy)];
    return actors.filter(e => e.hp > 0).map(enemy => ({ enemy, distance: shotIntersection(ray, enemy, dx, dy) }))
        .filter((h): h is { enemy: EnemyState; distance: number } => h.distance !== null && h.distance < stop)
        .sort((a, b) => a.distance - b.distance || a.enemy.uid.localeCompare(b.enemy.uid, 'en'));
}

/**
 * The enemy a precise aim rests on, for the breath charge (technique-15-a): the one a bullet flying straight along
 * `raid.player.rotation` from the body centre would meet (no drift, no cone), `reach` px long (pass the bullet's range,
 * weapon range plus the muzzle offset). Walls and closed doors stop the ray, windows pass it; the candidates, the hit
 * radius and the tie order are resolveLayerShot's. Read-only.
 */
export function aimTarget(raid: LayeredRaid, world: WorldDefinition, reach: number): string | null {
    if (!(reach > 0)) return null;
    const mapId = raid.currentMap, { x, y, rotation } = raid.player, dx = Math.cos(rotation), dy = Math.sin(rotation);
    const ray = { uid: 'aim', x, y, rotation, vx: dx, vy: dy, left: reach, damage: 0, enemy: false }; // a probe, never stored
    const stop = shotBarrier({ definition: world.maps[mapId], doors: raid.maps[mapId].doors, highTide: raid.highTide }, ray, dx, dy);
    return enemiesOnRay(raid, mapId, ray, dx, dy, stop)[0]?.enemy.uid ?? null;
}

/** Actual damage and corpse ownership shared by ordinary and departing shots. */
export function damageLayerEnemy(state: ExpansionState, mapId: string, enemy: EnemyState, amount: number, gun = true,
    source: { owner: string; at: Point; incomingAngle?: number } = { owner: 'player', at: state.raid!.player }): void {
    if (enemy.hp <= 0 || amount <= 0) return;
    if (source.owner !== 'player') {
        const attacker = [...state.raid!.maps[mapId].enemies, ...state.raid!.pursuits.filter(p => p.sourceMap === mapId).map(p => p.enemy)]
            .find(e => e.uid === source.owner);
        if (!enemyRules(state.raid) || !attacker || !canDamageEnemy(attacker, enemy)) return;
    }
    const raid = state.raid!, layer = raid.maps[mapId], actual = Math.min(enemy.hp, enemyDamageAfterArmor(enemy, source.at, amount, source.incomingAngle));
    enemy.hp -= actual;
    if (mapId === raid.currentMap) {
        const at = enemy.tactics ? source.at : raid.player;
        enemy.state = 'chase'; enemy.alert = 6; enemy.target = { x: at.x, y: at.y };
        if (enemy.tactics) {
            enemy.tactics.stance = 'hostile'; enemy.tactics.awareness = 1;
            enemy.tactics.memory = { at: { ...enemy.target }, time: raid.elapsed, source: 'damage', target: source.owner };
        }
    }
    if (gun && source.owner === 'player') raid.training.quantity.technique += actual / 400 * (raid.version >= 2 ? trainingEfficiency(state) : 1);
    if (enemy.hp > 0) return;
    if (source.owner === 'player') raid.kills++;
    if (enemy.tactics) { enemy.tactics.killedBy = source.owner; enemy.tactics.phase = 'idle'; enemy.tactics.phaseLeft = 0; }
    const event = raid.pursuits.find(p => p.enemy.uid === enemy.uid);
    if (event) {
        raid.pursuits = raid.pursuits.filter(p => p !== event);
        layer.enemies.push(enemy);
    }
    const inventory = D.createInventory(6, 5);
    const tactics = enemy.tactics;
    const gunDef = tactics?.equipment ? D.WEAPONS[tactics.equipment] : undefined;
    const drops = tactics ? [
        ...(tactics.equipment ? [{ id: tactics.equipment, qty: 1 }] : []),
        ...(gunDef?.ammo && tactics.magazine + tactics.reserve > 0 ? [{ id: gunDef.ammo, qty: tactics.magazine + tactics.reserve }] : []),
        ...tactics.supplies,
    ] : D.corpseLoot(raid.seed + raid.kills * 47, getLegacyEnemyProfile(enemy.id).corpseLootRolls, enemy.id === 'elite');
    const random = D.seededRandom(raid.rng);
    const allocate = () => entityUid(raid, raid.nextEntity++);
    for (const drop of drops) {
        if (D.addItem(inventory, drop.id, drop.qty, false, false, true, allocate)) throw new Error('尸体容器容量不足。');
        if (!tactics) { random(); random(); }
        // A leader's gun keeps its parts (#28 M4-02): the same build, each part under a fresh uid of this raid.
        if (tactics?.fit && drop.id === tactics.equipment) inventory.items.find(i => i.id === drop.id)!.gun = presetState(tactics.fit, allocate);
    }
    raid.rng = random.getState();
    if (raid.version >= 2 && !tactics) luckInventory(state, mapId, inventory, enemy);
    layer.containers.push({ id: `corpse-${enemy.uid}`, runId: raid.runId, kind: 'corpse',
        name: `${enemyDefinition(enemy.id).name}遗体`, x: enemy.x, y: enemy.y, inventory });
}

export function resolveLayerShot(state: ExpansionState, world: WorldDefinition, mapId: string, bullet: BulletState, playerPresent: boolean, hitFeedback?: (uid: string, critical: boolean) => void, playerHitFeedback?: (source: Point) => void, observer?: ShotObserver): boolean {
    const raid = state.raid!, layer = raid.maps[mapId], speed = Math.hypot(bullet.vx, bullet.vy);
    if (speed === 0 || bullet.left <= 0 || bullet.damage <= 0) return false;
    const dx = bullet.vx / speed, dy = bullet.vy / speed;
    const context = { definition: world.maps[mapId], doors: layer.doors, highTide: raid.highTide };
    const stop = shotBarrier(context, bullet, dx, dy);
    if (bullet.enemy) {
        const actors = [...layer.enemies, ...raid.pursuits.filter(p => p.sourceMap === mapId).map(p => p.enemy)];
        const owner = enemyRules(raid) ? actors.find(e => e.uid === bullet.owner && e.tactics) : undefined;
        if (owner) {
            const playerDistance = playerPresent ? shotIntersection(bullet, raid.player, dx, dy, 12) : null;
            const first = actors.filter(e => e.hp > 0 && e.uid !== owner.uid).map(enemy => ({ enemy, distance: shotIntersection(bullet, enemy, dx, dy) }))
                .filter((h): h is { enemy: EnemyState; distance: number } => h.distance !== null && h.distance < stop && h.distance < (playerDistance ?? Infinity))
                .sort((a, b) => a.distance - b.distance || a.enemy.uid.localeCompare(b.enemy.uid, 'en'))[0];
            if (first) {
                const hp = first.enemy.hp;
                damageLayerEnemy(state, mapId, first.enemy, bullet.damage, true, { owner: owner.uid, at: { x: bullet.x, y: bullet.y }, incomingAngle: Math.atan2(-dy, -dx) });
                const damage = hp - first.enemy.hp;
                observeShot(observer, context, bullet, first.distance, first.enemy.uid, damage, false, first.enemy.hp <= 0);
                if (damage > 0) hitFeedback?.(first.enemy.uid, false);
                return true;
            }
        }
        if (playerPresent) {
            const hit = shotIntersection(bullet, raid.player, dx, dy, 12);
            if (hit !== null && hit < stop) {
                const hp = state.body.hp;
                const random = D.seededRandom(raid.rng);
                if (rpgEnabled(raid)) enemyDamage(state, bullet.damage, bullet.owner, random());
                else { state.body.hp = Math.max(0, state.body.hp - bullet.damage); raid.hitTime = .25; if (random() < SURVIVAL.bleedChance) state.body.bleeding = true; }
                raid.rng = random.getState();
                observeShot(observer, context, bullet, hit, 'player', hp - state.body.hp, false, state.body.hp <= 0);
                playerHitFeedback?.({ x: raid.player.x - bullet.vx, y: raid.player.y - bullet.vy });
                return true;
            }
        }
    } else {
        const hits = enemiesOnRay(raid, mapId, bullet, dx, dy, stop);
        if (hits[0]) {
            let critical = false, multiplier = 1.5;
            // Each raid keeps the critical rule it was deployed with until it settles (contract sections 1 and 3). v1
            // never crits. v2 rolls the old centre-closeness formula. v3 rolls the shot's own snapshot for the enemy hit,
            // so where the round meets the body and how big the body is never change the chance, and a critical hit
            // multiplies the damage once by the snapshot's multiplier. Either roll draws raid.rng once per hit on a live
            // enemy; a miss, a wall or a corpse draws nothing. A v3 player round without a snapshot is corrupt and
            // throws: it never falls back to another rule.
            if (raid.version === 2 || raid.version === 4) {
                const enemy = hits[0].enemy, perpendicular = Math.abs((enemy.x - bullet.x) * dy - (enemy.y - bullet.y) * dx);
                const chance = criticalChance(effectiveAttributes(state).technique, 1 - Math.min(1, perpendicular / 14), state.body.effects.focus > 0 ? .05 : 0);
                const random = D.seededRandom(raid.rng); critical = random() < chance; raid.rng = random.getState();
            } else if (perkRaidRules(raid)) {
                if (!bullet.crit) throw new Error('命中参数无效。');
                const chance = snapshotChance(bullet.crit, hits[0].enemy.uid), random = D.seededRandom(raid.rng);
                critical = random() < chance; raid.rng = random.getState(); multiplier = bullet.crit.multiplier;
            }
            const hp = hits[0].enemy.hp;
            damageLayerEnemy(state, mapId, hits[0].enemy, bullet.damage * (critical ? multiplier : 1), true, { owner: 'player', at: { x: bullet.x, y: bullet.y }, incomingAngle: Math.atan2(-dy, -dx) });
            observeShot(observer, context, bullet, hits[0].distance, hits[0].enemy.uid, hp - hits[0].enemy.hp, critical, hits[0].enemy.hp <= 0);
            hitFeedback?.(hits[0].enemy.uid, critical); return true;
        }
    }
    if (stop <= bullet.left) observeShot(observer, context, bullet, stop);
    return stop <= bullet.left;
}

/** The finite segment kernel is shared by normal flight and one-time departure settlement.
 * flightSeconds optionally shortens this step for newborn rounds (0..dt); older rounds keep dt. Birth timing is
 * Runtime-local, never added to the saved bullet. Traversal order, collision and RNG remain shared for all rounds. */
export function advanceLayerShots(state: ExpansionState, world: WorldDefinition, mapId: string, dt: number, hitFeedback?: (uid: string, critical: boolean) => void, playerHitFeedback?: (source: Point) => void, observer?: ShotObserver, flightSeconds?: (bullet: BulletState) => number): void {
    const layer = state.raid!.maps[mapId], survivors: BulletState[] = [];
    for (const bullet of [...layer.bullets].sort((a, b) => a.uid.localeCompare(b.uid, 'en'))) {
        const speed = Math.hypot(bullet.vx, bullet.vy), length = Math.min(bullet.left, speed * (flightSeconds?.(bullet) ?? dt));
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
    const witnesses = source.enemies.filter(e => e.hp > 0 && (!archetype(e.id) || enemyRules(raid) &&
        ['raider-melee', 'mercenary-assault'].includes(e.id) && !enemyPost(e)
        && !(e.tactics?.version===2&&e.tactics.program.kind==='recovery') && e.tactics?.stance === 'hostile' && e.tactics.phase === 'idle'
        && e.tactics.memory?.target === 'player' && e.tactics.memory.source === 'sight' && raid.elapsed - e.tactics.memory.time <= 1)
        && (e.state === 'chase' || e.state === 'attack') && e.alert > 0 && separation(e, raid.player) <= enemyDefinition(e.id).vision
        && corridor(sourceContext, e, raid.player, 'sight'));
    raid.player = { ...landing, rotation: raid.player.rotation };
    raid.currentMap = entry.targetMap;
    settleDepartingShots(state, world, fromId, observer);
    let tacticalBudget = Math.max(0, 2 - raid.pursuits.filter(p => p.enemy.tactics).length);
    for (const enemy of witnesses.filter(e => e.hp > 0).sort((a, b) => a.uid.localeCompare(b.uid, 'en'))) {
        if (enemy.tactics && tacticalBudget === 0) continue;
        const route = spacePath(sourceContext, enemy, entry.at, true);
        if (!route.length) continue;
        const path = [{ x: enemy.x, y: enemy.y }, ...route, { ...entry.at }];
        const distance = path.slice(1).reduce((sum, point, i) => sum + separation(path[i], point), 0);
        const speed = enemyDefinition(enemy.id).speed;
        if (speed <= 0) continue;
        if (enemy.tactics) tacticalBudget--;
        source.enemies = source.enemies.filter(e => e.uid !== enemy.uid);
        raid.pursuits.push({ id: `pursuit-${raid.nextEntity++}`, enemy, sourceMap: fromId, targetMap: entry.targetMap, entry: entry.id,
            path, distance, speed, registeredAt: raid.elapsed, arrivalAt: raid.elapsed + distance / speed + 1, waiting: false });
    }
    raid.training.motion.anchor = null;
    return true;
}
