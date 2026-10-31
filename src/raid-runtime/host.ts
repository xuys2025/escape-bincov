import type { SessionState, SaveSession } from '../session';
import { moveQuantity, type LootTransfer } from '../loot';
import * as D from '../domain';
import type { CarriedEndpoint, CarriedInventoryView, CarriedPlacement, CoastHandle, RaidRuntime, TargetRef } from './contract';
import { CoastRaidRuntime } from './runtime';

/** Production handoff: expose the v1 port and durable services, never mutable simulation internals. */
export function createCoastRaidHost(session: SessionState, saves: SaveSession, freezeFrames = true) {
    return wrapCoastRuntime(new CoastRaidRuntime(session, saves, freezeFrames), session, saves);
}

/** Shared by the production factory and the explicit ?test=1 factory; exposes the same port and services. */
export function wrapCoastRuntime(core: CoastRaidRuntime, session: SessionState, saves: SaveSession) {
    const endpoint = (value: unknown): value is CarriedEndpoint => value === 'bag' || value === 'safe';
    const uid = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
    const placement = (value: CarriedPlacement) => !!value && typeof value === 'object' && !Array.isArray(value)
        && endpoint(value.from) && endpoint(value.to) && uid(value.uid)
        && Number.isInteger(value.x) && value.x >= 0 && Number.isInteger(value.y) && value.y >= 0
        && (value.rotated === undefined || typeof value.rotated === 'boolean')
        && (value.quantity === undefined || Number.isInteger(value.quantity) && value.quantity > 0);
    const runtime: RaidRuntime = Object.freeze({
        advance: core.advance.bind(core), current: core.current.bind(core), pause: core.pause.bind(core),
        resume: core.resume.bind(core), resetClock: core.resetClock.bind(core), setBlocked: core.setBlocked.bind(core), dispose: core.dispose.bind(core),
    });
    const services = Object.freeze({
        story: core.story.bind(core), storySources: core.storySources.bind(core), observeStory: core.observeStory.bind(core),
        cancelStart: core.cancelStart.bind(core),
        selectTarget: core.selectTarget.bind(core), activate: core.activate.bind(core),
        transferLoot: (ref: TargetRef, request: LootTransfer) => core.transferLoot(ref, request),
        useSupply: core.useSupply.bind(core), equipItem: core.equipItem.bind(core), equipLoot: core.equipLoot.bind(core), heal: core.heal.bind(core),
        dropItem: core.dropItem.bind(core), carriedWeight: core.carriedWeight.bind(core), carryLimit: core.carryLimit.bind(core),
        inventoryView: (): CarriedInventoryView | null => {
            const l = session.loadout;
            return l ? structuredClone({ bag: l.bag, safe: l.safe, weapon: l.weapon, weaponUid: l.weaponUid, gun: l.gun, relief: l.relief }) : null;
        },
        inventoryReadout: () => session.loadout ? { weight: core.carriedWeight(), limit: core.carryLimit() } : null,
        // Keep the former panel's mutate boundary, including its guards and rollback/world capture. Using the
        // Runtime transaction helper here would change paused/lifecycle acceptance and event/error presentation.
        // Resolve loadout inside the callback: rejected and failed transactions can replace every inventory object.
        moveCarried: (request: CarriedPlacement) => saves.mutate(() => {
            const l = session.loadout;
            return !!l && placement(request) && moveQuantity(l[request.from], l[request.to], request.uid, request.x, request.y, request.rotated, request.quantity);
        }),
        quickTransferCarried: (from: CarriedEndpoint, itemUid: string) => saves.mutate(() => {
            const l = session.loadout;
            return !!l && endpoint(from) && uid(itemUid) && D.transferItem(l[from], l[from === 'bag' ? 'safe' : 'bag'], itemUid);
        }),
        rotateCarried: (source: CarriedEndpoint, itemUid: string) => saves.mutate(() => {
            const l = session.loadout;
            return !!l && endpoint(source) && uid(itemUid) && D.rotateItem(l[source], itemUid);
        }),
        retrySave: core.retrySave.bind(core), retrySettlement: core.retrySettlement.bind(core),
        settlement: () => core.settlement, abandon: () => core.finish('abandon'),
        reloadCommitted: core.reloadCommitted.bind(core), checkpoint: core.checkpoint.bind(core),
        lootContext: () => structuredClone(core.lootContext),
        lootInventory: (ref: TargetRef) => {
            if (ref.kind !== 'container' || ref.runId !== session.loadout?.runId || ref.mapId !== (core.space?.definition.id ?? 'coast') || !core.canLootContainer(ref.id, ref.runId)) return null;
            return structuredClone(core.getLootContainer(ref.id)!.inventory);
        },
        backup: () => saves.backupRecord(),
    });
    // Preserve additional internal/test services in inference, while checking the view's port at its factory.
    return Object.freeze({ runtime, services }) satisfies CoastHandle;
}
