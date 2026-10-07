import type { SessionState, SaveSession } from '../session';
import type { LootTransfer } from '../loot';
import type { RaidRuntime, TargetRef } from './contract';
import { CoastRaidRuntime } from './runtime';

/** Production handoff: expose the v1 port and durable services, never mutable simulation internals. */
export function createCoastRaidHost(session: SessionState, saves: SaveSession, freezeFrames = true) {
    return wrapCoastRuntime(new CoastRaidRuntime(session, saves, freezeFrames), session, saves);
}

/** Shared by the production factory and the explicit ?test=1 factory; exposes the same port and services. */
export function wrapCoastRuntime(core: CoastRaidRuntime, session: SessionState, saves: SaveSession) {
    const runtime: RaidRuntime = Object.freeze({
        advance: core.advance.bind(core), current: core.current.bind(core), pause: core.pause.bind(core),
        resume: core.resume.bind(core), setBlocked: core.setBlocked.bind(core), dispose: core.dispose.bind(core),
    });
    const services = Object.freeze({
        selectTarget: core.selectTarget.bind(core), activate: core.activate.bind(core),
        transferLoot: (ref: TargetRef, request: LootTransfer) => core.transferLoot(ref, request),
        useSupply: core.useSupply.bind(core), equipItem: core.equipItem.bind(core), heal: core.heal.bind(core),
        dropItem: core.dropItem.bind(core),
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
    return Object.freeze({ runtime, services });
}
