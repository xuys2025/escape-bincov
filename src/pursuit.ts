import type { Point } from './world';
import type { ExpansionState, PursuitState, WorldDefinition } from './expansion-state';
import { findLanding, separation, spacePath, traversable, type SpaceContext } from './spatial';

export function pursuitPosition(event: PursuitState, elapsed: number): Point {
    let left = Math.max(0, Math.min(event.distance, (elapsed - event.registeredAt) * event.speed));
    for (let i = 1; i < event.path.length; i++) {
        const a = event.path[i - 1], b = event.path[i], distance = separation(a, b);
        if (left <= distance && distance > 0) return { x: a.x + (b.x - a.x) * left / distance, y: a.y + (b.y - a.y) * left / distance };
        left -= distance;
    }
    return { ...event.path.at(-1)! };
}

/** The saved enemy projection is the previous frame's progress, including after reload. */
function previousProgress(event: PursuitState, current: number): number {
    let offset = 0, progress = 0, nearest = Infinity;
    for (let i = 1; i < event.path.length && offset <= current; i++) {
        const a = event.path[i - 1], b = event.path[i], length = separation(a, b);
        const fraction = length === 0 ? 0 : Math.max(0, Math.min(1, (current - offset) / length,
            ((event.enemy.x - a.x) * (b.x - a.x) + (event.enemy.y - a.y) * (b.y - a.y)) / (length * length)));
        const distance = separation(event.enemy, { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
        if (distance < nearest) { nearest = distance; progress = offset + fraction * length; }
        offset += length;
    }
    return progress;
}

function refuge(context: SpaceContext, from: Point): Point | null {
    if (traversable(context, from, 'body', 10)) return { ...from };
    const map = context.definition, cells: Point[] = [];
    for (let y = 0; y < map.cells.length; y++) for (let x = 0; x < map.cells[y].length; x++) {
        const point = { x: (x + .5) * map.tile, y: (y + .5) * map.tile };
        if (traversable(context, point, 'body', 10)) cells.push(point);
    }
    cells.sort((a, b) => separation(from, a) - separation(from, b) || a.y - b.y || a.x - b.x);
    return cells.find(p => spacePath({ ...context, highTide: false }, from, p, true).length) ?? null;
}

/** Progress belongs to the event, including its projection on a visible source map.
 * Returns whether ownership or a door changed and needs an immediate durable commit. */
export function advancePursuits(state: ExpansionState, world: WorldDefinition, tideChanged = false): boolean {
    const raid = state.raid!;
    let changed = false;
    for (const event of [...raid.pursuits].sort((a, b) => a.arrivalAt - b.arrivalAt || a.enemy.uid.localeCompare(b.enemy.uid, 'en'))) {
        const source = raid.maps[event.sourceMap], map = world.maps[event.sourceMap];
        const context = { definition: map, doors: source.doors, highTide: raid.highTide };
        let position = pursuitPosition(event, raid.elapsed);
        if (tideChanged) {
            const route = spacePath(context, position, map.entries.find(e => e.id === event.entry)!.at, true);
            if (!route.length) {
                const safe = refuge(context, position);
                if (safe) position = safe;
                Object.assign(event.enemy, position, { state: 'return', target: { ...position }, path: [], repath: 0 });
                source.enemies.push(event.enemy); raid.pursuits = raid.pursuits.filter(p => p !== event);
                changed = true; continue;
            }
            event.path = [{ ...position }, ...route, { ...map.entries.find(e => e.id === event.entry)!.at }];
            event.distance = event.path.slice(1).reduce((sum, p, i) => sum + separation(event.path[i], p), 0);
            event.registeredAt = raid.elapsed; event.arrivalAt = raid.elapsed + event.distance / event.speed + 1; event.waiting = false;
            changed = true;
        }
        // Scan only newly traversed segments and the body's clearance, never the old route prefix.
        // Retain intermediate segments when a frame crosses a turn or several doors.
        const current = Math.max(0, Math.min(event.distance, (raid.elapsed - event.registeredAt) * event.speed));
        const from = Math.max(0, previousProgress(event, current) - 10), to = Math.min(event.distance, current + 10);
        let offset = 0;
        for (let i = 1; i < event.path.length && offset <= to; i++) {
            const a = event.path[i - 1], b = event.path[i], segment = separation(a, b);
            const start = Math.max(0, from - offset), end = Math.min(segment, to - offset);
            offset += segment;
            if (end < start) continue;
            const steps = Math.max(1, Math.ceil((end - start) / 4));
            for (let step = 0; step <= steps; step++) {
                const fraction = segment === 0 ? 0 : (start + (end - start) * step / steps) / segment;
                const x = Math.floor((a.x + (b.x - a.x) * fraction) / map.tile), y = Math.floor((a.y + (b.y - a.y) * fraction) / map.tile);
                const door = map.doors.find(d => d.x === x && d.y === y);
                if (door && !source.doors[door.id]) { source.doors[door.id] = true; changed = true; }
            }
        }
        Object.assign(event.enemy, position);
        if (raid.elapsed < event.arrivalAt) continue;
        const entry = map.entries.find(e => e.id === event.entry)!, target = raid.maps[event.targetMap];
        const occupied: Point[] = target.enemies.filter(e => e.hp > 0);
        occupied.push(...raid.pursuits.filter(p => p !== event && p.sourceMap === event.targetMap && p.enemy.hp > 0).map(p => pursuitPosition(p, raid.elapsed)));
        if (raid.currentMap === event.targetMap) occupied.push(raid.player);
        const landing = findLanding({ definition: world.maps[event.targetMap], doors: target.doors, highTide: raid.highTide }, entry.landing, occupied);
        if (!landing) { if (!event.waiting) changed = true; event.waiting = true; continue; }
        Object.assign(event.enemy, landing, { target: { ...landing }, home: { ...landing }, path: [], repath: 0, state: 'patrol' });
        if (event.enemy.tactics) {
            // The witnessed connector is the only known destination. Acquire fresh sight on arrival;
            // source-map coordinates are not meaningful on another floor. Ammo and report latch stay paid.
            Object.assign(event.enemy.tactics, { memory: null, awareness: 0, stance: 'idle', warning: 0 });
        }
        target.enemies.push(event.enemy); raid.pursuits = raid.pursuits.filter(p => p !== event); changed = true;
    }
    return changed;
}
