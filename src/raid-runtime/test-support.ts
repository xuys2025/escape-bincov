/** Explicit test-only driver. Do not import from the ordinary application entry. */
import { CoastRaidRuntime } from './runtime';
import { wrapCoastRuntime } from './host';
import type { SaveSession, SessionState } from '../session';
import type { Point } from '../world';
import { ITEMS, addItem, createInventory, equippedWeapon } from '../domain';
import { derivedLimits } from '../expansion-state';
import { checkpointBodyFits } from '../spatial';
import { isWalkable } from '../world';

export function createRuntimeTestDriver(runtime: CoastRaidRuntime, search: string) {
    if (new URLSearchParams(search).get('test') !== '1') throw new Error('Runtime fixtures require ?test=1.');
    const checkPosition = (point: Point, mapId = runtime.layered?.raid?.currentMap ?? 'coast') => {
        const raid = runtime.layered?.raid, world = runtime.layeredWorld;
        const fits = Number.isFinite(point.x) && Number.isFinite(point.y) && (raid && world
            ? !!world.maps[mapId] && !!raid.maps[mapId] && checkpointBodyFits({ definition: world.maps[mapId], doors: raid.maps[mapId].doors, highTide: false }, point)
            : mapId === 'coast' && isWalkable(point.x, point.y, false, 10));
        if (!fits) throw new Error(`Invalid fixture position on ${mapId}: (${point.x}, ${point.y}); body overlaps obstacle or bounds.`);
    };
    return {
        freezeAI(value: boolean) { runtime.freezeAI = value; },
        placePlayer(point: Point, angle = runtime.player.rotation, mapId?: string) {
            checkPosition(point, mapId);
            if (!Number.isFinite(angle)) throw new Error(`Invalid fixture angle: ${angle}.`);
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
            checkPosition(point);
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
            const state = runtime.snapshot();
            // Another gun in hand is another instance: a factory one under a new uid (the slot names its gun, record v8).
            if (state.loadout.weapon !== id || state.loadout.weaponUid === null) {
                const scratch = createInventory(6, 5); addItem(scratch, id);
                Object.assign(state.loadout, { weaponUid: scratch.items[0].uid, gun: scratch.items[0].gun });
            }
            // A full magazine of the instance's effective capacity; more fails checkpoint validation.
            state.loadout.weapon = id; state.loadout.ammo = equippedWeapon(state.loadout).magazine;
            state.loadout.ammoRelief = 0; state.knife = false; state.reloadLeft = 0; state.fireCooldown = 0; runtime.restore(state);
        },
        /** Hand the playtest sample gun (SAMPLE_GUNS in src/shooting.ts) or take it back; the loadout is untouched. */
        sampleGun(id: 'm4a1' | null) { runtime.setSampleGun(id); },
        /** Rounds in the equipped gun's magazine (0 to its effective size); relief rounds never exceed what is loaded. */
        magazine(rounds: number) {
            const state = runtime.snapshot(), w = equippedWeapon(state.loadout);
            if (!w.magazine || !Number.isInteger(rounds) || rounds < 0 || rounds > w.magazine) throw new Error(`Invalid magazine fixture: ${rounds}.`);
            state.loadout.ammo = rounds; state.loadout.ammoRelief = Math.min(state.loadout.ammoRelief, rounds); state.reloadLeft = 0; runtime.restore(state);
        },
        /**
         * Player body through the snapshot the next checkpoint writes. Health stays above 0 (a death goes through `hurt`);
         * water, satiety and mental exist only on layered raids.
         */
        vitals(v: { hp?: number; stamina?: number; pollution?: number; bleeding?: boolean; water?: number; satiety?: number; mental?: number }) {
            const ok = (n: number | undefined, max: number, min = 0) => n === undefined || (Number.isFinite(n) && n >= min && n <= max);
            if (runtime.layered?.raid) {
                const state = runtime.snapshotExpansion(), limits = derivedLimits(state), b = state.body;
                if (!ok(v.hp, limits.hp, .01) || !ok(v.stamina, limits.stamina) || !ok(v.pollution, 100) || !ok(v.water, 100) || !ok(v.satiety, 100) || !ok(v.mental, 100))
                    throw new Error(`Invalid vitals fixture: ${JSON.stringify(v)}.`);
                for (const k of ['hp', 'stamina', 'pollution', 'water', 'satiety', 'mental'] as const) if (v[k] !== undefined) b[k] = v[k]!;
                if (v.bleeding !== undefined) b.bleeding = v.bleeding;
                runtime.restoreExpansion(state);
            } else {
                if (v.water !== undefined || v.satiety !== undefined || v.mental !== undefined) throw new Error('A classic raid has no body needs.');
                if (!ok(v.hp, 100, .01) || !ok(v.stamina, 100) || !ok(v.pollution, 100)) throw new Error(`Invalid vitals fixture: ${JSON.stringify(v)}.`);
                const state = runtime.snapshot();
                for (const k of ['hp', 'stamina', 'pollution'] as const) if (v[k] !== undefined) state[k] = v[k]!;
                if (v.bleeding !== undefined) state.bleeding = v.bleeding ? 1 : 0;
                runtime.restore(state);
            }
        },
        /**
         * Move the raid clock forward to `elapsed` seconds, as a checkpoint taken then would hold it: the warning and tide
         * flags follow the time (crossing a threshold here sets them without the radio line or the tide's enemy reroute,
         * so set the clock just short of a threshold to watch the Runtime cross it).
         */
        clock(elapsed: number) {
            const state = runtime.snapshot(), c = runtime.config, initialHigh = runtime.layered?.raid?.initialHigh ?? c.initialHigh;
            if (!Number.isFinite(elapsed) || elapsed < state.elapsed || elapsed >= c.duration) throw new Error(`Invalid clock fixture: ${elapsed}.`);
            state.elapsed = elapsed; state.warned = elapsed >= c.warningAt; state.tideChanged = elapsed >= c.tideAt;
            state.highTide = state.tideChanged ? !initialHigh : initialHigh;
            runtime.restore(state);
        },
        /** Loose loot on the ground at a point the body could stand on, with a fresh entity UID from the run's allocator. */
        spawnLoot(id: string, qty: number, point: Point, relief = false) {
            if (!ITEMS[id] || !Number.isInteger(qty) || qty < 1 || qty > ITEMS[id].stack) throw new Error(`Invalid loot fixture: ${id} x ${qty}.`);
            checkPosition(point);
            runtime.spawnLoot(point.x, point.y, id, qty, relief);
            const uid = runtime.loot[runtime.loot.length - 1].uid;
            runtime.restore(runtime.snapshot());
            return uid;
        },
        /** Replace a container's items on the current map (packed in order; throws when they do not fit). */
        container(id: string, items: { id: string; qty: number; relief?: boolean }[]) {
            const state = runtime.snapshot(), c = state.containers.find(x => x.id === id);
            if (!c) throw new Error('Unknown container.');
            const inv = { ...c.inventory, items: [] as typeof c.inventory.items };
            for (const it of items) if (addItem(inv, it.id, it.qty, !!it.relief) > 0) throw new Error(`Container fixture does not fit: ${it.id} x ${it.qty}.`);
            c.inventory = inv; runtime.restore(state);
        },
        /** A blow to the player through the Runtime's own damage path (hit direction from `from`, bleeding roll, death). */
        hurt(amount: number, from?: Point) {
            if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid hurt fixture: ${amount}.`);
            runtime.hurt(amount, from);
        },
    };
}

/** Explicit ?test=1 host: the same v1 port and services as production, plus the fixture driver. */
export function createTestCoastHost(session: SessionState, saves: SaveSession, search: string) {
    if (new URLSearchParams(search).get('test') !== '1') throw new Error('Runtime fixtures require ?test=1.');
    const core = new CoastRaidRuntime(session, saves);
    // Art fixtures must freeze before the host's first tick, not after an asynchronous browser round trip.
    core.freezeAI = new URLSearchParams(search).get('freezeAI') === '1';
    return { ...wrapCoastRuntime(core, session, saves), driver: createRuntimeTestDriver(core, search) };
}
