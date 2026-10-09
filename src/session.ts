import * as D from './domain';
import { moveQuantity, placementError, type LootContainer, type LootEndpoint, type LootTransfer } from './loot';
import { initialCheckpoint, type RaidCheckpoint } from './checkpoint';
import { generateRun } from './world';
import { decodeSession, RecoveryStore, type SessionRecord } from './recovery-store';
import { newExpansion, type ExpansionState, type WorldResolver, type EndReason } from './expansion-state';
import { resolveExpansionWorld } from './expansion-worlds';
import { initializeMallRaid, mallRunConfig } from './mall-world';
import { initializeBuildingRaid, buildingRunConfig } from './building-world';
import { creditTraining } from './rpg';
import { advanceRealTime } from './base';

export type GameState = 'menu' | 'hideout' | 'run' | 'result';

/** Persistent progress and the in-memory raid share one source of truth. */
export interface SessionState {
    save: D.SaveDataV1;
    state: GameState;
    loadout: D.RunLoadout | null;
    result: D.RunSummary | null;
    storageOK: boolean;
    recovery: boolean;
    conflict: boolean;
    pendingSettlement: D.SaveDataV1 | null;
    pendingExpansion: ExpansionState | null;
    pendingReason: EndReason | null;
    checkpoint: RaidCheckpoint | null;
    expansion: ExpansionState | null;
    storageError: string;
    lastSavedAt: number;
}

export function createSessionState(): SessionState {
    return {
        save: D.newSave(), state: 'menu', loadout: null, result: null,
        storageOK: true, recovery: false, conflict: false, pendingSettlement: null,
        checkpoint: null, expansion: null, pendingExpansion: null, pendingReason: null, storageError: '', lastSavedAt: 0,
    };
}

/** Only these live scene values participate in inventory/medical rollback. */
export interface PlayerVitals {
    hp: number;
    stamina: number;
    pollution: number;
    bleeding: number;
}

export type MutationResult = 'committed' | 'rejected' | 'blocked' | 'save-failed';
export type SessionMutation = () => boolean | void;
export interface ExpansionDraft { profile: D.SaveDataV1; legacyRaid: RaidCheckpoint | null; expansion: ExpansionState }
/** Opaque ticket: candidate data is retained privately and cannot be rerolled or edited by a caller. */
export interface ExpansionTransaction { readonly kind: 'expansion-transaction' }

/**
 * Coordinates domain rules and durable writes without DOM, Phaser or audio.
 * Storage is resolved lazily: even accessing browser localStorage can throw.
 * Callers own rendering, scene transitions and effects after a successful commit.
 */
export class SaveSession {
    private store: RecoveryStore | null = null;
    private raid: { capture(): RaidCheckpoint; restore(value: RaidCheckpoint): void } | null = null;
    private layered: { capture(): ExpansionState; restore(value: ExpansionState): void } | null = null;
    private owned = true;
    private prepared = new WeakMap<ExpansionTransaction, { revision: number; before: string; draft: ExpansionDraft }>();
    constructor(
        private readonly session: SessionState,
        private readonly storage: () => D.StorageLike,
        private readonly resolveWorld: WorldResolver = resolveExpansionWorld,
    ) {}

    attachRaid(raid: typeof this.raid) { this.raid = raid; }
    attachExpansion(layered: typeof this.layered) { this.layered = layered; }
    persist(save = this.session.save, snapshot?: RaidCheckpoint | null, terminal?: SessionRecord['terminal'], expansion = this.session.expansion): boolean {
        if (this.session.conflict || !this.owned) return false;
        try {
            if (!this.store) throw new Error('存档尚未加载，请刷新重试。');
            const liveExpansion = expansion === this.session.expansion;
            if (expansion === this.session.expansion && this.layered) expansion = this.layered.capture();
            if (liveExpansion && expansion?.version === 2) { expansion = structuredClone(expansion); advanceRealTime(expansion, Date.now()); }
            if (expansion?.raid?.version === 2) { expansion = structuredClone(expansion); creditTraining(expansion, expansion.raid!.training); }
            const checkpoint = save.activeRun ? structuredClone(snapshot === undefined ? this.raid?.capture() ?? this.session.checkpoint : snapshot) : null;
            if (checkpoint && snapshot === undefined && this.session.loadout) checkpoint.loadout = structuredClone(this.session.loadout);
            if (checkpoint) D.checkpointSafe(save, checkpoint.loadout.safe, checkpoint.runId);
            else if (expansion?.raid) D.checkpointSafe(save, expansion.raid.loadout.safe, expansion.raid.runId);
            const committed = this.store.commit(save, checkpoint, terminal, expansion);
            this.session.checkpoint = committed.raid;
            this.session.expansion = structuredClone(committed.expansion ?? null);
            this.session.lastSavedAt = committed.savedAt;
            this.session.storageOK = true;
            this.session.storageError = '';
            if (this.layered && committed.expansion) this.layered.restore(committed.expansion);
            return true;
        } catch (error) {
            this.session.storageOK = false;
            this.session.storageError = error instanceof Error ? error.message : '存档写入失败。';
            return false;
        }
    }

    initialize(owned = true): boolean {
        const s = this.session;
        this.owned = owned; this.raid = null; this.layered = null;
        try {
            this.store = new RecoveryStore(this.storage(), () => Date.now(), this.resolveWorld);
            const loaded = this.store.load();
            s.save = loaded.save; s.checkpoint = loaded.raid; s.expansion = loaded.expansion; s.recovery = loaded.legacyRecovery;
            if (s.expansion?.version === 2) advanceRealTime(s.expansion, Date.now());
            if (s.expansion?.base.location === 'settlement' && !s.save.activeRun) {
                s.expansion.base.location = 'base'; s.expansion.base.cursor = Math.max(s.expansion.base.cursor, Date.now());
            }
            s.lastSavedAt = this.store.record?.savedAt ?? 0;
            if (!owned) {
                s.storageOK = false; s.storageError = '此存档正在另一窗口使用，或浏览器不支持安全写入。请关闭其他游戏页，再刷新；也可导出备份。';
                return false;
            }
            return this.persist(s.save, loaded.raid);
        } catch (error) {
            s.storageOK = false;
            s.storageError = error instanceof Error ? error.message : '存档读取失败，原始数据未被覆盖。';
            return false;
        }
    }
    original(): string | null { return this.store?.original() ?? null; }
    /** Reason of this exact terminal record only; older records may have no reason. */
    terminalReason(runId: string): EndReason | null {
        const terminal = this.store?.record?.terminal;
        return terminal?.runId === runId ? terminal.reason ?? null : null;
    }
    currentRecord(): SessionRecord | null { return this.store?.record ? structuredClone(this.store.record) : null; }
    /** Includes the exact pending growth/body/queue candidate instead of exporting only gear. */
    backupRecord(snapshot?: RaidCheckpoint | null): SessionRecord | null {
        const s = this.session, record = this.currentRecord();
        if (!record) return null;
        record.profile = structuredClone(s.pendingSettlement ?? s.save);
        record.raid = s.pendingSettlement ? null : structuredClone(snapshot === undefined ? this.raid?.capture() ?? s.checkpoint : snapshot);
        if (s.expansion) record.expansion = structuredClone(s.pendingSettlement ? s.pendingExpansion! : this.layered?.capture() ?? s.expansion);
        if (s.pendingSettlement) record.terminal = { runId: s.save.activeRun!.runId!, outcome: s.pendingSettlement.lastResult!.outcome,
            ...(record.expansion ? { reason: s.pendingReason! } : {}) };
        const raid = record.expansion?.raid ?? record.raid;
        if (raid) D.checkpointSafe(record.profile, raid.loadout.safe, raid.runId);
        return record;
    }

    /** Explicit, atomic opt-in. M0 does not silently activate unfinished gameplay for players. */
    enableExpansion(now = Date.now()): boolean {
        const s = this.session;
        if (!this.store?.record || s.expansion || s.pendingSettlement || s.conflict || !this.owned) return false;
        return this.persist(s.save, undefined, undefined, newExpansion(now, s.checkpoint));
    }
    enableRpg(now = Date.now()): boolean {
        const s = this.session;
        if (s.save.activeRun || s.pendingSettlement || s.conflict || !this.owned) return false;
        const expansion = structuredClone(s.expansion ?? newExpansion(now));
        if (expansion.version === 1) { expansion.version = 2; expansion.charm = null; expansion.awards = []; expansion.base.cursor = Math.max(expansion.base.cursor, now); }
        return this.persist(s.save, null, undefined, expansion);
    }
    private expansionBefore(): string {
        const s = this.session;
        return JSON.stringify([s.save, this.raid?.capture() ?? s.checkpoint, this.layered?.capture() ?? s.expansion, s.loadout]);
    }
    prepareExpansionMutation(action: (draft: ExpansionDraft) => boolean | void): ExpansionTransaction | null {
        const s = this.session, record = this.store?.record;
        if (!record || !s.expansion || s.conflict || s.pendingSettlement || !this.owned) return null;
        const before = this.expansionBefore();
        const draft: ExpansionDraft = { profile: structuredClone(s.save), legacyRaid: structuredClone(this.raid?.capture() ?? s.checkpoint), expansion: structuredClone(this.layered?.capture() ?? s.expansion) };
        if (draft.expansion.version === 2) advanceRealTime(draft.expansion, Date.now());
        if (action(draft) === false) return null;
        const raid = draft.expansion.raid ?? draft.legacyRaid;
        if (raid) D.checkpointSafe(draft.profile, raid.loadout.safe, raid.runId);
        decodeSession(JSON.stringify({ ...record, version: 4, profile: draft.profile, raid: draft.legacyRaid, expansion: draft.expansion,
            terminal: draft.profile.activeRun ? null : record.terminal }), this.resolveWorld);
        const ticket: ExpansionTransaction = Object.freeze({ kind: 'expansion-transaction' });
        this.prepared.set(ticket, { revision: record.revision, before, draft: structuredClone(draft) });
        return ticket;
    }
    commitExpansionMutation(ticket: ExpansionTransaction): MutationResult {
        const s = this.session, prepared = this.prepared.get(ticket);
        if (s.conflict || s.pendingSettlement || !this.owned) return 'blocked';
        if (!prepared || this.store?.record?.revision !== prepared.revision || this.expansionBefore() !== prepared.before) return 'rejected';
        if (!this.persist(prepared.draft.profile, prepared.draft.legacyRaid, undefined, prepared.draft.expansion)) return 'save-failed';
        s.save = structuredClone(prepared.draft.profile);
        s.loadout = structuredClone(prepared.draft.expansion.raid?.loadout ?? prepared.draft.legacyRaid?.loadout ?? null);
        if (prepared.draft.legacyRaid) this.raid?.restore(prepared.draft.legacyRaid);
        if (s.expansion) this.layered?.restore(s.expansion);
        this.prepared.delete(ticket);
        return 'committed';
    }
    resumeRun(): boolean {
        const s = this.session;
        const loadout = s.expansion?.raid?.loadout ?? s.checkpoint?.loadout;
        if (!loadout || !s.storageOK || s.conflict || s.pendingSettlement || s.state !== 'menu') return false;
        s.loadout = structuredClone(loadout);
        return true;
    }

    markConflict(): void {
        this.session.conflict = true;
        this.session.storageOK = false;
    }

    beginRun(seed: number, buildings: boolean | 'mall' = false): boolean {
        const s = this.session;
        if (s.state !== 'hideout' || s.conflict || s.pendingSettlement || s.save.activeRun) return false;
        const candidate = structuredClone(s.save);
        const loadout = D.beginRun(candidate, seed);
        const config = buildings === 'mall' ? mallRunConfig(seed) : buildings ? buildingRunConfig(seed) : generateRun(seed);
        let checkpoint: RaidCheckpoint | null = buildings ? null : initialCheckpoint(config, loadout);
        const expansion = buildings ? structuredClone(s.expansion ?? newExpansion(Date.now())) : structuredClone(s.expansion);
        if (expansion?.version === 2) advanceRealTime(expansion, Date.now());
        if (buildings) {
            if (expansion!.version === 1) { expansion!.version = 2; expansion!.charm = null; expansion!.awards = []; expansion!.base.cursor = Math.max(expansion!.base.cursor, Date.now()); }
            Object.assign(loadout, D.reloadMagazine(loadout.weapon || 'knife', loadout.ammo, loadout.ammoRelief, loadout.bag));
            if (buildings === 'mall') initializeMallRaid(expansion!, loadout, config);
            else initializeBuildingRaid(expansion!, loadout, config);
        }
        if (expansion) expansion.base.location = 'raid';
        if (!this.persist(candidate, checkpoint, null, expansion)) return false;
        s.save = candidate;
        s.loadout = structuredClone(expansion?.raid?.loadout ?? checkpoint!.loadout);
        return true;
    }

    grantRelief(): boolean {
        const candidate = structuredClone(this.session.save);
        if (this.session.pendingSettlement || !D.grantRelief(candidate) || !this.persist(candidate)) return false;
        this.session.save = candidate;
        return true;
    }

    setVolume(volume: number): boolean {
        if (this.session.pendingSettlement) return false;
        const candidate = structuredClone(this.session.save);
        candidate.settings.volume = volume;
        if (!this.persist(candidate)) return false;
        this.session.save = candidate;
        return true;
    }

    /** Stage once; keep this exact candidate for retries and backup on failure. */
    prepareSettlement(reason: EndReason, kills: number): boolean {
        const s = this.session;
        if (s.state !== 'run' || !s.loadout || s.conflict || s.pendingSettlement) return false;
        const candidate = structuredClone(s.save);
        const outcome = reason === 'abandon' ? 'death' : reason;
        if (!D.settleRun(candidate, s.loadout, outcome, kills)) return false;
        s.pendingSettlement = candidate;
        s.pendingReason = reason;
        s.pendingExpansion = structuredClone(this.layered?.capture() ?? s.expansion);
        if (s.pendingExpansion) {
            if (s.pendingExpansion.version === 2) advanceRealTime(s.pendingExpansion, Date.now());
            if (s.pendingExpansion.raid?.version === 2) {
                creditTraining(s.pendingExpansion, s.pendingExpansion.raid.training);
                if (reason === 'death') Object.assign(s.pendingExpansion.body, { hp: 1, stamina: 0, mental: 20, water: 40, satiety: 40, pollution: 50 });
                if (reason !== 'extract') s.pendingExpansion.charm = null;
                if (reason === 'extract' && [s.loadout.bag, s.loadout.safe].some(inv => inv.items.some(i => i.id === 'pearl' && !i.relief))) s.pendingExpansion.base.extractedPearl = true;
            }
            // Legacy worlds retain their original rules until their terminal commit.
            const old = this.raid?.capture() ?? s.checkpoint;
            if (old) Object.assign(s.pendingExpansion.body, { hp: old.hp, stamina: old.stamina, pollution: old.pollution, bleeding: !!old.bleeding, exhausted: old.exhausted });
            s.pendingExpansion.raid = null;
            s.pendingExpansion.base.location = 'settlement';
            s.pendingExpansion.base.cursor = Math.max(s.pendingExpansion.base.cursor, Date.now());
        }
        return true;
    }

    retrySettlement(): boolean {
        const s = this.session;
        const candidate = s.pendingSettlement;
        if (!candidate) return false;
        const expansion = structuredClone(s.pendingExpansion);
        // Waiting for storage is not time spent recovering in the base.
        if (expansion) { if (expansion.version === 2) advanceRealTime(expansion, Date.now()); expansion.base.location = 'base'; expansion.base.cursor = Math.max(expansion.base.cursor, Date.now()); }
        if (!this.persist(candidate, null, { runId: s.save.activeRun!.runId!, outcome: candidate.lastResult!.outcome,
            ...(expansion ? { reason: s.pendingReason! } : {}) }, expansion)) return false;
        s.save = candidate;
        s.result = candidate.lastResult!;
        s.pendingSettlement = null;
        s.pendingExpansion = null; s.pendingReason = null;
        s.loadout = null;
        this.raid = null;
        this.layered = null;
        return true;
    }

    /** Accept only a candidate already validated by decodeBackup. */
    importSave(candidate: D.SaveDataV1): boolean {
        const s = this.session;
        if (s.state !== 'hideout' || s.pendingSettlement || candidate.activeRun || !this.persist(candidate, null, null, null)) return false;
        s.save = structuredClone(candidate);
        s.recovery = false;
        return true;
    }
    importRecord(record: SessionRecord): boolean {
        const s = this.session;
        const expansion = structuredClone(record.expansion ?? null);
        if (expansion?.version === 2) advanceRealTime(expansion, Date.now());
        if (expansion?.base.location === 'settlement' && !record.profile.activeRun) {
            expansion.base.location = 'base'; expansion.base.cursor = Math.max(expansion.base.cursor, Date.now());
        }
        if (s.state !== 'hideout' || s.pendingSettlement || s.save.activeRun || !this.persist(record.profile, record.raid, record.terminal, expansion)) return false;
        s.save = structuredClone(record.profile); s.recovery = false; s.loadout = null;
        return true;
    }

    /** Commit staged container contents and character gear in one recovery record. */
    transferLoot(container: LootContainer, request: LootTransfer): MutationResult {
        const s = this.session;
        if (s.state !== 'run' || !s.loadout || !s.save.activeRun || s.conflict || s.pendingSettlement) return 'blocked';
        if (!request.runId || request.runId !== s.loadout.runId || request.runId !== s.save.activeRun.runId ||
            request.runId !== container.runId || !container.id || request.containerId !== container.id) return 'rejected';
        const validEndpoint = (endpoint: LootEndpoint) => endpoint === 'container' || endpoint === 'bag' || endpoint === 'safe';
        if (!validEndpoint(request.from) || !validEndpoint(request.to)) return 'rejected';
        if (s.expansion?.raid) {
            const ticket = this.prepareExpansionMutation(draft => {
                const raid = draft.expansion.raid!, recorded = raid.maps[raid.currentMap].containers.find(c => c.id === container.id);
                if (!recorded || JSON.stringify(recorded.inventory) !== JSON.stringify(container.inventory)) return false;
                const endpoints = { container: recorded.inventory, bag: raid.loadout.bag, safe: raid.loadout.safe };
                const from = endpoints[request.from], to = endpoints[request.to];
                if (placementError(from, to, request.uid, request.x, request.y, request.rotated, request.quantity)) return false;
                return moveQuantity(from, to, request.uid, request.x, request.y, request.rotated, request.quantity);
            });
            return ticket ? this.commitExpansionMutation(ticket) : 'rejected';
        }
        const checkpoint = structuredClone(this.raid?.capture() ?? s.checkpoint);
        const recorded = checkpoint?.containers?.find(entry => entry.id === container.id);
        if (!checkpoint || !recorded || recorded.runId !== request.runId ||
            JSON.stringify(recorded.inventory) !== JSON.stringify(container.inventory)) return 'rejected';
        const staged = structuredClone(container.inventory);
        const result = this.mutate(() => {
            const endpoints = { container: staged, bag: s.loadout!.bag, safe: s.loadout!.safe };
            const from = endpoints[request.from], to = endpoints[request.to];
            if (placementError(from, to, request.uid, request.x, request.y, request.rotated, request.quantity)) return false;
            return moveQuantity(from, to, request.uid, request.x, request.y, request.rotated, request.quantity);
        }, null, () => {
            checkpoint.loadout = structuredClone(s.loadout!);
            recorded.inventory = staged;
            return checkpoint;
        });
        if (result === 'committed' && (request.from === 'container' || request.to === 'container')) container.inventory = staged;
        return result;
    }

    /**
     * Actions are synchronous. With an attached scene, matching world changes
     * belong in this transaction and roll back with its checkpoint. External
     * effects and scene transitions must wait until the commit succeeds.
     * A rejected action, failed write or exception restores all participants.
     */
    mutate(action: SessionMutation, player: PlayerVitals | null = null, stagedWorld?: () => RaidCheckpoint): MutationResult {
        const s = this.session;
        if (s.conflict || s.pendingSettlement || !this.owned) return 'blocked';
        const before = structuredClone(s.save);
        const expansionBefore = structuredClone(s.expansion);
        const carried = s.loadout ? structuredClone(s.loadout) : null;
        const scene = this.raid?.capture();
        const layered = this.layered?.capture();
        const vitals = player ? {
            hp: player.hp, stamina: player.stamina,
            pollution: player.pollution, bleeding: player.bleeding,
        } : null;
        const rollback = () => {
            s.save = before;
            s.expansion = expansionBefore;
            s.loadout = carried;
            if (scene) this.raid?.restore(scene);
            if (layered) this.layered?.restore(layered);
            if (player && vitals) Object.assign(player, vitals);
        };
        try {
            if (action() === false) {
                rollback();
                return 'rejected';
            }
            if (s.state === 'run' && s.loadout) D.checkpointSafe(s.save, s.loadout.safe, s.loadout.runId);
            else D.grantRelief(s.save);
            if (!this.persist(s.save, stagedWorld?.())) {
                rollback();
                return 'save-failed';
            }
            return 'committed';
        } catch (error) {
            rollback();
            throw error;
        }
    }
}
