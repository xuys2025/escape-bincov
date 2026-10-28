import * as D from './domain';
import { installStreetEncounter } from './enemy-encounters';
import { installMallEncounter } from './enemy-mall';
import { moveQuantity, placementError, type LootContainer, type LootEndpoint, type LootTransfer } from './loot';
import { initialCheckpoint, type RaidCheckpoint } from './checkpoint';
import { generateRun } from './world';
import { decodeSession, recordUpgradeFields, RecoveryStore, SavePreparationError, StorageConflictError, type SessionRecord } from './recovery-store';
import { newExpansion, rpgEnabled, stationUpgraded, upgradeToRpg, type ExpansionState, type WorldResolver, type EndReason } from './expansion-state';
import { resolveExpansionWorld } from './expansion-worlds';
import { initializeMallRaid, mallRunConfig, mallWorldV2, mallWorldV3, mallWorldV4 } from './mall-world';
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
    /** In-memory diagnostic. publish requires export/reload, never another write from this page. */
    storageFailure: 'prepare' | 'storage' | 'publish' | null;
    storageError: string;
    lastSavedAt: number;
}

export function createSessionState(): SessionState {
    return {
        save: D.newSave(), state: 'menu', loadout: null, result: null,
        storageOK: true, recovery: false, conflict: false, pendingSettlement: null,
        checkpoint: null, expansion: null, pendingExpansion: null, pendingReason: null, storageFailure: null, storageError: '', lastSavedAt: 0,
    };
}

/** Only these live scene values participate in inventory/medical rollback. */
export interface PlayerVitals {
    hp: number;
    stamina: number;
    pollution: number;
    bleeding: number;
}

export type MutationResult = 'committed' | 'rejected' | 'blocked' | 'save-failed' | 'publish-failed';
export type SessionMutation = () => boolean | void;
export interface ExpansionDraft { profile: D.SaveDataV1; legacyRaid: RaidCheckpoint | null; expansion: ExpansionState }
/** Opaque ticket: candidate data is retained privately and cannot be rerolled or edited by a caller. */
export interface ExpansionTransaction { readonly kind: 'expansion-transaction' }

/**
 * Coordinates domain rules and durable writes without DOM, rendering or audio.
 * Storage is resolved lazily: even accessing browser localStorage can throw.
 * Callers own rendering, scene transitions and effects after a successful commit.
 */
export class SaveSession {
    private store: RecoveryStore | null = null;
    private raid: { capture(): RaidCheckpoint; restore(value: RaidCheckpoint): void } | null = null;
    private layered: { capture(): ExpansionState; restore(value: ExpansionState): void } | null = null;
    private owned = true;
    private publicationFailure: SessionRecord | null = null;
    private lastPublication: SessionRecord | null = null;
    /** Durable publication failure is terminal for this page, independent of ownership/conflicts. */
    get requiresReload(): boolean { return this.publicationFailure !== null; }
    private failPublication(record: SessionRecord, error: unknown): false {
        const s = this.session;
        this.publicationFailure = record;
        s.save = record.profile; s.checkpoint = record.raid; s.expansion = record.expansion ?? null;
        s.loadout = record.expansion?.raid?.loadout ?? record.raid?.loadout ?? null;
        s.lastSavedAt = record.savedAt;
        s.storageOK = false; s.storageFailure = 'publish';
        s.storageError = '进度已保存，但当前页面恢复失败。请导出备份后刷新页面。' + (error instanceof Error ? `（${error.message}）` : '');
        this.deferred = null;
        return false;
    }
    /**
     * Finish synchronous publication of this session's latest successful write (no writes/rules in action).
     * A clock/capture/restore fault here retains that committed record and requires page reload; false never
     * authorizes rollback or replay. Also propagates a nested publication failure to the caller.
     */
    publishCommitted(action: () => void): boolean {
        if (this.session.conflict || !this.owned || this.requiresReload || !this.lastPublication) return false;
        const committed = this.lastPublication;
        try { action(); return !this.requiresReload; }
        catch (error) { return this.failPublication(committed, error); }
    }
    /** Set only around importRecord's commit: a confirmed import may write an older record version (RecoveryStore.commit). */
    private importing: false | SessionRecord = false;
    private deferred: ExpansionTransaction | null = null;
    private committingDeferred = false;
    // Tickets are owned by callers (or deferred); abandoning one releases its candidate through WeakMap GC.
    // This is not a queue of every historical candidate. Do not replace it with a Map without explicit disposal.
    private prepared = new WeakMap<ExpansionTransaction, { revision: number; before: string; draft: ExpansionDraft }>();
    constructor(
        private readonly session: SessionState,
        private readonly storage: () => D.StorageLike,
        private readonly resolveWorld: WorldResolver = resolveExpansionWorld,
        private readonly now: () => number = () => Date.now(),
    ) {}

    attachRaid(raid: typeof this.raid) { this.raid = raid; }
    attachExpansion(layered: typeof this.layered) { this.layered = layered; }
    /**
     * Commit a checkpoint; callers own transaction rollback and publication of save/loadout.
     * Same-reference expansion means live input: capture the port, then advance v2 real time.
     * A separate candidate skips that time advance; RPG training credit still runs.
     * undefined snapshot captures live coast state; null explicitly supplies no coast snapshot.
     * Safe-box synchronization can mutate save before the single-record store commit.
     * Success updates session checkpoint/expansion and restores the expansion port.
     * false with requiresReload means the write succeeded but publication failed: no rollback/retry;
     * other false results are pre-commit failures; callers own their rollback;
     * caught errors update storage/conflict status. Never split profile/world/expansion writes.
     * @see mutate, prepareExpansionMutation, commitExpansionMutation
     */
    persist(save = this.session.save, snapshot?: RaidCheckpoint | null, terminal?: SessionRecord['terminal'], expansion = this.session.expansion): boolean {
        if (this.session.conflict || !this.owned || this.requiresReload || this.deferred && !this.committingDeferred) return false;
        let committed: SessionRecord;
        let phase: 'prepare' | 'storage' = 'prepare';
        try {
            if (!this.store) throw new Error('存档尚未加载，请刷新重试。');
            const liveExpansion = expansion === this.session.expansion;
            if (liveExpansion && this.layered) expansion = this.layered.capture();
            if (liveExpansion && rpgEnabled(expansion)) { expansion = structuredClone(expansion!); advanceRealTime(expansion, this.now()); }
            if (rpgEnabled(expansion?.raid)) { expansion = structuredClone(expansion!); creditTraining(expansion, expansion.raid!.training); }
            const checkpoint = save.activeRun ? structuredClone(snapshot === undefined ? this.raid?.capture() ?? this.session.checkpoint : snapshot) : null;
            if (checkpoint && snapshot === undefined && this.session.loadout) checkpoint.loadout = structuredClone(this.session.loadout);
            if (checkpoint) D.checkpointSafe(save, checkpoint.loadout.safe, checkpoint.runId);
            else if (expansion?.raid) D.checkpointSafe(save, expansion.raid.loadout.safe, expansion.raid.runId);
            phase = 'storage';
            committed = this.store.commit(save, checkpoint, terminal, expansion, this.importing);
        } catch (error) {
            if (error instanceof StorageConflictError) this.markConflict();
            this.session.storageOK = false;
            this.session.storageFailure = error instanceof SavePreparationError ? 'prepare' : phase;
            this.session.storageError = error instanceof Error ? error.message : '存档写入失败。';
            return false;
        }
        this.lastPublication = committed;
        // Past the durable boundary, an exception must never undo the profile or invite another write.
        try {
            this.session.checkpoint = structuredClone(committed.raid);
            this.session.expansion = structuredClone(committed.expansion ?? null);
            this.session.lastSavedAt = committed.savedAt;
            if (this.layered && committed.expansion) this.layered.restore(structuredClone(committed.expansion));
            this.session.storageOK = true; this.session.storageFailure = null; this.session.storageError = '';
            return true;
        } catch (error) { return this.failPublication(committed, error); }
    }

    initialize(owned = true): boolean {
        const s = this.session;
        if (this.requiresReload) return false; // Recreate the page/session instead of detaching a half-restored Runtime.
        this.owned = owned; this.raid = null; this.layered = null;
        try {
            this.store = new RecoveryStore(this.storage(), () => this.now(), this.resolveWorld);
            const loaded = this.store.load();
            s.save = loaded.save; s.checkpoint = loaded.raid; s.expansion = loaded.expansion; s.recovery = loaded.legacyRecovery;
            if (rpgEnabled(s.expansion)) advanceRealTime(s.expansion!, this.now());
            if (s.expansion?.base.location === 'settlement' && !s.save.activeRun) {
                s.expansion.base.location = 'base'; s.expansion.base.cursor = Math.max(s.expansion.base.cursor, this.now());
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
    get revision(): number { return this.store?.record?.revision ?? 0; }
    get ownsStorage(): boolean { return this.owned; }
    /** Live detached capture when a Runtime is attached; session.expansion alone is the last published checkpoint. */
    captureExpansion(): ExpansionState | null { return structuredClone(this.requiresReload ? this.store!.record!.expansion ?? null : this.layered?.capture() ?? this.session.expansion); }
    /** Idempotent station-boundary upgrade to the current expansion (upgradeToRpg); never converts a live raid. */
    ensureRpg(): boolean {
        const s = this.session;
        if (s.save.activeRun || s.pendingSettlement || s.conflict || !this.owned) return false;
        return stationUpgraded(s.expansion) ? s.storageOK : this.enableRpg();
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
        if (this.requiresReload) return record;
        const deferred = this.deferred && this.prepared.get(this.deferred);
        if (deferred) {
            record.profile = structuredClone(deferred.draft.profile); record.raid = structuredClone(deferred.draft.legacyRaid);
            record.expansion = structuredClone(deferred.draft.expansion);
            Object.assign(record, recordUpgradeFields(record.expansion, this.currentRecord(), this.original()));
            return record;
        }
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
    enableExpansion(now = this.now()): boolean {
        const s = this.session;
        if (!this.store?.record || s.expansion || s.pendingSettlement || s.conflict || !this.owned) return false;
        return this.persist(s.save, undefined, undefined, newExpansion(now, s.checkpoint));
    }
    enableRpg(now = this.now()): boolean {
        const s = this.session;
        if (s.save.activeRun || s.pendingSettlement || s.conflict || !this.owned) return false;
        const expansion = structuredClone(s.expansion ?? newExpansion(now));
        upgradeToRpg(expansion, now);
        return this.persist(s.save, null, undefined, expansion);
    }
    private expansionBefore(): string {
        const s = this.session;
        return JSON.stringify([s.save, this.raid?.capture() ?? s.checkpoint, this.layered?.capture() ?? s.expansion, s.loadout]);
    }
    /**
     * Prepare a private complete candidate tied to the revision and captured live baseline.
     * action may synchronously edit draft only; defer external effects until committed.
     * v2 real time advances in the draft first; ineligible/rejected returns null, errors throw.
     * Retaining the callback's draft cannot change the privately cloned candidate afterward.
     * Commit rejects a changed baseline; committed publishes and consumes the ticket once.
     * publish-failed means already durable: consumes the ticket and blocks this page until reload.
     * save-failed retains the same candidate for retry without rerunning action or its costs.
     * Failure alone is not exclusive: retainExpansionTransaction explicitly reserves a ticket.
     * Callers own pending presentation events; SaveSession owns the candidate and write right.
     * @see commitExpansionMutation, retainExpansionTransaction
     */
    prepareExpansionMutation(action: (draft: ExpansionDraft) => boolean | void): ExpansionTransaction | null {
        const s = this.session, record = this.store?.record;
        if (!record || !s.expansion || s.conflict || s.pendingSettlement || !this.owned || this.deferred || this.requiresReload) return null;
        const before = this.expansionBefore();
        const draft: ExpansionDraft = { profile: structuredClone(s.save), legacyRaid: structuredClone(this.raid?.capture() ?? s.checkpoint), expansion: structuredClone(this.layered?.capture() ?? s.expansion) };
        if (rpgEnabled(draft.expansion)) advanceRealTime(draft.expansion, this.now());
        if (action(draft) === false) return null;
        const raid = draft.expansion.raid ?? draft.legacyRaid;
        if (raid) D.checkpointSafe(draft.profile, raid.loadout.safe, raid.runId);
        // Use exactly the same format and one-time backup fields as the eventual commit (v8: perksBackup beside a v3
        // expansion, enemyBackup once enemy rules are on), and the systemsBackup key every record with an expansion has.
        decodeSession(JSON.stringify({ ...record, ...recordUpgradeFields(draft.expansion, record, this.original()),
            systemsBackup: record.systemsBackup ?? null, profile: draft.profile, raid: draft.legacyRaid, expansion: draft.expansion,
            terminal: draft.profile.activeRun ? null : record.terminal }), this.resolveWorld);
        const ticket: ExpansionTransaction = Object.freeze({ kind: 'expansion-transaction' });
        this.prepared.set(ticket, { revision: record.revision, before, draft: structuredClone(draft) });
        return ticket;
    }
    /** Keep a failed base checkpoint exclusive until this exact ticket commits. Old tabs cannot overwrite it. */
    retainExpansionTransaction(ticket: ExpansionTransaction): void {
        if (!this.requiresReload && this.prepared.has(ticket) && !this.deferred) this.deferred = ticket;
    }
    /** Publish only after persistence succeeds; retry/ownership contract: {@link prepareExpansionMutation}. */
    commitExpansionMutation(ticket: ExpansionTransaction): MutationResult {
        const s = this.session, prepared = this.prepared.get(ticket);
        if (s.conflict || s.pendingSettlement || !this.owned || this.requiresReload || this.deferred && this.deferred !== ticket) return 'blocked';
        if (!prepared || this.store?.record?.revision !== prepared.revision || this.expansionBefore() !== prepared.before) return 'rejected';
        // All detached publication allocations precede the write.
        const legacyRaid = structuredClone(prepared.draft.legacyRaid);
        this.committingDeferred = this.deferred === ticket;
        let saved: boolean;
        try { saved = this.persist(prepared.draft.profile, prepared.draft.legacyRaid, undefined, prepared.draft.expansion); } finally { this.committingDeferred = false; }
        if (!saved) { if (this.requiresReload) { this.prepared.delete(ticket); return 'publish-failed'; } return 'save-failed'; }
        if (this.deferred === ticket) this.deferred = null;
        this.prepared.delete(ticket);
        // persist already restored the expansion once. These copies and the classic port complete publication.
        return this.publishCommitted(() => {
            s.save = structuredClone(this.lastPublication!.profile);
            s.loadout = structuredClone(this.lastPublication!.expansion?.raid?.loadout ?? this.lastPublication!.raid?.loadout ?? null);
            if (legacyRaid) this.raid?.restore(legacyRaid);
        }) ? 'committed' : 'publish-failed';
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

    /** Layout is chosen only on deployment; active raids restore their saved world/revision. */
    beginRun(seed: number, buildings: boolean | 'mall' = false, options: { mallLayout?: 1 | 2 | 3 | 4; legacyEnemies?: boolean } = {}): boolean {
        const s = this.session;
        if (this.requiresReload || s.state !== 'hideout' || s.conflict || s.pendingSettlement || s.save.activeRun) return false;
        // Layered raids store seeds 1..0xffffffff (older pages reject 0), so seed 0 deploys as seed 1; the coast keeps 0.
        if (buildings && !(seed >>> 0)) seed = 1;
        const candidate = structuredClone(s.save);
        const loadout = D.beginRun(candidate, seed);
        const config = buildings === 'mall' ? mallRunConfig(seed) : buildings ? buildingRunConfig(seed) : generateRun(seed);
        let checkpoint: RaidCheckpoint | null = buildings ? null : initialCheckpoint(config, loadout);
        const expansion = buildings ? structuredClone(s.expansion ?? newExpansion(this.now())) : structuredClone(s.expansion);
        if (rpgEnabled(expansion)) advanceRealTime(expansion!, this.now());
        if (buildings) {
            // Deploying is a station boundary: an older expansion upgrades in this same candidate, so the raid is v3.
            upgradeToRpg(expansion!, this.now());
            Object.assign(loadout, D.reloadMagazine(loadout, loadout.ammo, loadout.ammoRelief, loadout.bag));
            if (buildings === 'mall') initializeMallRaid(expansion!, loadout, config, options.mallLayout === 4 ? mallWorldV4() : options.mallLayout === 3 ? mallWorldV3() : options.mallLayout === 2 ? mallWorldV2() : undefined);
            else initializeBuildingRaid(expansion!, loadout, config);
            if (buildings === true && !options.legacyEnemies) installStreetEncounter(expansion!.raid!, this.resolveWorld(expansion!.raid!.worldVersion)!);
            if (buildings === 'mall' && (options.mallLayout === 3 || options.mallLayout === 4) && !options.legacyEnemies) installMallEncounter(expansion!.raid!, this.resolveWorld(expansion!.raid!.worldVersion)!);
        }
        if (expansion) expansion.base.location = 'raid';
        const publishedLoadout = structuredClone(expansion?.raid?.loadout ?? checkpoint!.loadout);
        if (!this.persist(candidate, checkpoint, null, expansion)) return false;
        s.save = candidate;
        s.loadout = publishedLoadout;
        return true;
    }

    /** A no-op is a successful entry check, but is not a newly claimed kit. */
    grantReliefResult(): 'committed' | 'unchanged' | 'blocked' | 'save-failed' | 'publish-failed' {
        if (this.session.pendingSettlement || this.session.conflict || !this.owned || this.deferred || this.requiresReload) return 'blocked';
        const candidate = structuredClone(this.session.save);
        if (!D.grantRelief(candidate)) return 'unchanged';
        if (!this.persist(candidate)) return this.session.conflict ? 'blocked' : this.requiresReload ? 'publish-failed' : 'save-failed';
        this.session.save = candidate;
        return 'committed';
    }
    /** Existing callers still distinguish newly delivered relief from no change. */
    grantRelief(): boolean { return this.grantReliefResult() === 'committed'; }

    setVolume(volume: number): boolean {
        if (this.session.pendingSettlement || this.requiresReload) return false;
        const candidate = structuredClone(this.session.save);
        candidate.settings.volume = volume;
        if (!this.persist(candidate)) return false;
        this.session.save = candidate;
        return true;
    }

    /** Stage once; keep this exact candidate for retries and backup on failure. */
    prepareSettlement(reason: EndReason, kills: number): boolean {
        const s = this.session;
        if (this.requiresReload || s.state !== 'run' || !s.loadout || s.conflict || s.pendingSettlement) return false;
        const candidate = structuredClone(s.save);
        const outcome = reason === 'abandon' ? 'death' : reason;
        if (!D.settleRun(candidate, s.loadout, outcome, kills)) return false;
        s.pendingSettlement = candidate;
        s.pendingReason = reason;
        s.pendingExpansion = structuredClone(this.layered?.capture() ?? s.expansion);
        if (s.pendingExpansion) {
            if (rpgEnabled(s.pendingExpansion)) advanceRealTime(s.pendingExpansion, this.now());
            if (rpgEnabled(s.pendingExpansion.raid)) {
                creditTraining(s.pendingExpansion, s.pendingExpansion.raid!.training);
                if (reason === 'death') Object.assign(s.pendingExpansion.body, { hp: 1, stamina: 0, mental: 20, water: 40, satiety: 40, pollution: 50 });
                if (reason !== 'extract') s.pendingExpansion.charm = null;
                if (reason === 'extract' && [s.loadout.bag, s.loadout.safe].some(inv => inv.items.some(i => i.id === 'pearl' && !i.relief))) s.pendingExpansion.base.extractedPearl = true;
            }
            // Legacy worlds retain their original rules until their terminal commit.
            const old = this.raid?.capture() ?? s.checkpoint;
            if (old) Object.assign(s.pendingExpansion.body, { hp: old.hp, stamina: old.stamina, pollution: old.pollution, bleeding: !!old.bleeding, exhausted: old.exhausted });
            s.pendingExpansion.raid = null;
            s.pendingExpansion.base.location = 'settlement';
            s.pendingExpansion.base.cursor = Math.max(s.pendingExpansion.base.cursor, this.now());
        }
        return true;
    }

    retrySettlement(): boolean {
        const s = this.session;
        const candidate = s.pendingSettlement;
        if (!candidate || this.requiresReload) return false;
        const expansion = structuredClone(s.pendingExpansion);
        // Waiting for storage is not time spent recovering in the base.
        if (expansion) { if (rpgEnabled(expansion)) advanceRealTime(expansion, this.now()); expansion.base.location = 'base'; expansion.base.cursor = Math.max(expansion.base.cursor, this.now()); }
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
        return this.publishCommitted(() => { s.save = structuredClone(this.lastPublication!.profile); s.recovery = false; });
    }
    /**
     * A confirmed full-record import. An older expansion stays as it is (a v4 backup with a live v2 raid keeps
     * expansion v2 until that raid settles); the next station boundary (ensureRpg) upgrades it. The record keeps the
     * imported gunsBackup, perksBackup and enemyBackup, unless both it and this origin hold a v3 (perk) expansion: then
     * the origin keeps its own (RecoveryStore.commit).
     */
    importRecord(record: SessionRecord): boolean {
        const s = this.session;
        const expansion = structuredClone(record.expansion ?? null);
        if (rpgEnabled(expansion)) advanceRealTime(expansion!, this.now());
        if (expansion?.base.location === 'settlement' && !record.profile.activeRun) {
            expansion.base.location = 'base'; expansion.base.cursor = Math.max(expansion.base.cursor, this.now());
        }
        if (s.state !== 'hideout' || s.pendingSettlement || s.save.activeRun) return false;
        this.importing = record;
        try { if (!this.persist(record.profile, record.raid, record.terminal, expansion)) return false; } finally { this.importing = false; }
        return this.publishCommitted(() => { s.save = structuredClone(this.lastPublication!.profile); s.recovery = false; s.loadout = null; });
    }

    /** Commit staged container contents and character gear in one recovery record. */
    transferLoot(container: LootContainer, request: LootTransfer): MutationResult {
        const s = this.session;
        if (this.requiresReload || s.state !== 'run' || !s.loadout || !s.save.activeRun || s.conflict || s.pendingSettlement) return 'blocked';
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
     * A rejected action or pre-commit failure restores all participants. publish-failed never rolls back;
     * no further callback/write is allowed on this page. The committed record remains exportable.
     */
    mutate(action: SessionMutation, player: PlayerVitals | null = null, stagedWorld?: () => RaidCheckpoint): MutationResult {
        const s = this.session;
        if (s.conflict || s.pendingSettlement || !this.owned || this.requiresReload) return 'blocked';
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
                if (this.requiresReload) return 'publish-failed';
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
