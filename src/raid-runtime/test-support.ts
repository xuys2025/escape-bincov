/** Explicit test-only driver. Do not import from the ordinary application entry. */
import { CoastRaidRuntime } from './runtime';
import { wrapCoastRuntime } from './host';
import type { SaveSession, SessionState } from '../session';
import type { Point } from '../world';
import { WEAPONS } from '../domain';

export function createRuntimeTestDriver(runtime: CoastRaidRuntime, search: string) {
    if (new URLSearchParams(search).get('test') !== '1') throw new Error('Runtime fixtures require ?test=1.');
    return {
        freezeAI(value: boolean) { runtime.freezeAI = value; },
        placePlayer(point: Point, angle = runtime.player.rotation, mapId?: string) {
            if (![point.x, point.y, angle].every(Number.isFinite)) throw new Error('Invalid fixture coordinates.');
            if (runtime.layered) {
                const state = runtime.snapshotExpansion();
                if (mapId && !state.raid!.maps[mapId]) throw new Error('Unknown fixture map.');
                if (mapId) state.raid!.currentMap = mapId;
                state.raid!.player = { x: point.x, y: point.y, rotation: angle }; runtime.restoreExpansion(state);
            } else {
                if (mapId && mapId !== 'coast') throw new Error('Classic raid has only coast.');
                const state = runtime.snapshot(); state.player = { x: point.x, y: point.y, rotation: angle }; runtime.restore(state);
            }
            runtime.epoch++; runtime.revelation.reset();
        },
        placeEnemy(uid: string, point: Point, hp?: number) {
            const state = runtime.snapshot(), enemy = state.enemies.find(e => e.uid === uid);
            if (!enemy) throw new Error('Unknown enemy.');
            Object.assign(enemy, point, { home: { ...point }, target: { ...point }, path: [] });
            if (hp !== undefined) enemy.hp = hp;
            runtime.restore(state);
        },
        /** Kill through the Runtime's own damage path, so kills, the corpse container and hurt/death events stay consistent. */
        kill(uid: string) {
            const enemy = runtime.enemies.find(e => e.uid === uid);
            if (!enemy) throw new Error('Unknown enemy.');
            runtime.damageEnemy(enemy, enemy.hp + 1000);
        },
        door(id: string, open: boolean) {
            const state = runtime.snapshotExpansion(), doors = state.raid!.maps[state.raid!.currentMap].doors;
            if (!(id in doors)) throw new Error('Unknown door.'); doors[id] = open; runtime.restoreExpansion(state);
        },
        weapon(id: 'pistol' | 'carbine' | 'shotgun') {
            const state = runtime.snapshot(); state.loadout.weapon = id; state.loadout.ammo = WEAPONS[id].magazine; // a full magazine; more fails checkpoint validation
            state.loadout.ammoRelief = 0; state.knife = false; state.reloadLeft = 0; state.fireCooldown = 0; runtime.restore(state);
        },
    };
}

/** Explicit ?test=1 host: the same v1 port and services as production, plus the fixture driver. */
export function createTestCoastHost(session: SessionState, saves: SaveSession, search: string) {
    if (new URLSearchParams(search).get('test') !== '1') throw new Error('Runtime fixtures require ?test=1.');
    const core = new CoastRaidRuntime(session, saves);
    return { ...wrapCoastRuntime(core, session, saves), driver: createRuntimeTestDriver(core, search) };
}
