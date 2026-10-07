import * as D from '../domain';
import { SURVIVAL as B } from '../balance';
import { WORLD, type Point } from '../world';
import type { CoastRaidRuntime } from './runtime';
import type { ActorView, MapDef, RegionDef, TerrainCode, ViewFrame, WorldKey } from './contract';

/** Explicit definition keys survive array reordering; these IDs never enter a save. */
const regionKeys: Record<string, string> = {
    'coast:褪色居民楼 · 一楼': 'resident-ground',
    'resident-f2:西侧住户': 'west-home', 'resident-f2:东侧住户': 'east-home',
    'resident-f2:公共走廊': 'hall', 'resident-f2:储藏室': 'storage',
    'resident-b1:工具间': 'tools', 'resident-b1:设备间': 'equipment', 'resident-b1:公共走廊': 'hall',
};
export function freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) freeze(child);
    }
    return value;
}
export const contains = (r: RegionDef, p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

export function mapView(r: CoastRaidRuntime, key: WorldKey): MapDef {
    const space = r.space?.definition, data = r.mapData;
    const prefix = `${key.worldVersion}/${key.layoutRevision ?? '-'}/${key.mapId}`;
    const residentId = `${prefix}/building/resident`;
    const regions: RegionDef[] = (space?.regions ?? []).map(region => {
        const definitionKey = region.id ?? regionKeys[`${key.mapId}:${region.name}`];
        if (!definitionKey) throw new Error(`Unmapped region: ${key.mapId}/${region.name}`);
        return { ...region, id: region.id ?? `${prefix}/region/${definitionKey}`, inside: region.inside !== false,
            sealed: !!region.sealed, buildingId: residentId };
    });
    const buildings = data.buildings.map(b => ({ ...b, id: `${prefix}/building/${b.kind}/${b.x},${b.y}`, regionIds: [] as string[] }));
    if (space && regions.length) {
        const x = Math.min(...regions.map(a => a.x)), y = Math.min(...regions.map(a => a.y));
        buildings.push({ id: residentId, name: '褪色居民楼', kind: WORLD.buildings.find(b => b.name === '褪色居民楼')!.kind,
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

export function frameView(r: CoastRaidRuntime, map: MapDef, velocities: ReadonlyMap<string, Point>): ViewFrame {
    const revealed = r.revelation.read(r, map);
    // Overlap fails closed: a containing unrevealed room wins; deterministic ties by stable ID.
    const regionAt = (p: Point) => map.regions.filter(a => a.inside && contains(a, p))
        .sort((a, b) => Number(!!revealed[a.id]) - Number(!!revealed[b.id]) || a.id.localeCompare(b.id, 'en'))[0]?.id ?? null;
    const limits = r.limits;
    const actor = (e: typeof r.player | typeof r.enemies[number], player: boolean): ActorView => {
        const enemy = player ? null : e as typeof r.enemies[number], hp = enemy?.hp ?? r.hp;
        const uid = enemy?.uid ?? 'player', velocity = velocities.get(uid) ?? { x: 0, y: 0 };
        const containerId = `corpse-${uid}`;
        return { uid, kind: enemy ? enemy.id as ActorView['kind'] : 'player', x: e.x, y: e.y, aim: e.rotation,
            vx: velocity.x, vy: velocity.y, hp, maxHp: enemy ? D.ENEMIES[enemy.id].hp : limits.hp, alive: hp > 0,
            weapon: enemy ? enemy.id === 'scav' ? 'club' : enemy.id === 'creature' ? 'claw' : 'rifle' : r.currentWeapon.id as ActorView['weapon'],
            state: { moving: !!(velocity.x || velocity.y), sprinting: player && r.sprinting, precise: player && r.intent.precise,
                reloading: player && r.reloadLeft > 0 ? { left: r.reloadLeft, total: r.currentWeapon.reload } : null,
                attackCooldown: Math.max(0, enemy?.cooldown ?? r.fireCooldown), hurtLeft: player ? r.hitTime : r.hurtTimers.get(uid) ?? 0, ai: enemy?.state ?? null },
            regionId: regionAt(e), corpse: hp > 0 ? null : { angle: e.rotation - (enemy && !r.layered ? Math.PI / 2 : 0),
                containerId: r.containers.some(c => c.id === containerId) ? containerId : null } };
    };
    const w = r.currentWeapon, loadout = r.session.loadout ?? r.terminalLoadout;
    return {
        player: actor(r.player, true), actors: r.enemies.map(e => actor(e, false)),
        bullets: r.bullets.map(b => ({ uid: b.uid, x: b.x, y: b.y, vx: b.vx, vy: b.vy, enemy: b.enemy, owner: b.owner ?? null })),
        loot: r.loot.map(l => ({ uid: l.uid, item: l.id, qty: l.qty, x: l.x, y: l.y, regionId: regionAt(l) })),
        containers: r.containers.map(c => ({ id: c.id, runId: c.runId, kind: c.kind, name: c.name, x: c.x, y: c.y,
            stacks: c.inventory.items.length, totalQty: c.inventory.items.reduce((n, i) => n + i.qty, 0),
            ownerUid: c.kind === 'corpse' ? c.id.slice('corpse-'.length) : null, regionId: regionAt(c) })),
        doors: { ...r.space?.doors }, highTide: r.highTide, revealed: { ...revealed }, interaction: r.targetView(),
        hud: { hp: r.hp, maxHp: limits.hp, stamina: r.stamina, maxStamina: limits.stamina, pollution: r.pollution, bleeding: !!r.bleeding,
            timeLeft: Math.max(0, r.config.duration - r.elapsed), tideWarning: r.warned && !r.tideChanged, highTide: r.highTide,
            weapon: { id: w.id, name: w.name, mag: r.mag, magSize: w.magazine, reserve: w.ammo ? D.count(loadout.bag, w.ammo) : 0, reloading: r.reloadLeft > 0 },
            heals: D.count(loadout.bag, 'bandage') + D.count(loadout.bag, 'medkit'), hitDirections: r.hitDirections.map(h => ({ angle: h.angle, left: h.left })) },
        phase: r.ending ? 'ending' : r.paused ? 'paused' : r.overlay ? 'blocked' : 'running',
    };
}
