import * as D from './domain';
import { validateCheckpoint, type RaidCheckpoint } from './checkpoint';
import { decodeOldStoredProfile, decodeStoredProfile, identity, utf8Bytes, whole, UINT32_MAX } from './profile-codec';
import { enemyRules, validateExpansion, type ExpansionState, type WorldResolver, type EndReason } from './expansion-state';
import { resolveExpansionWorld } from './expansion-worlds';
import { migrateRecord, type RecordV7 } from './gunsmith/migrate';

/** A separate versioned record isolates old clients that silently discard unknown fields. */
export const SESSION_KEY = 'escape-bincov.session.v2';
export const SESSION_MAX_BYTES = 2 * 1024 * 1024;
/**
 * The record every write stores: `version` 8, the gun instance format (profile v3), whatever else it carries. Which
 * expansion it carries is the expansion's own `version`; whether enemy rules (#81) are on is whether it holds
 * `enemyBackup`. Records v2 to v7 are only read: decodeSession checks one by its own rules and migrates it to v8
 * (migrateRecord, docs/gunsmith/CONTRACTS.md section M0-06).
 */
export interface SessionRecord {
  format: 'escape-bincov-session'; version: 8; revision: number; savedAt: number;
  profile: D.SaveDataV1; raid: RaidCheckpoint | null;
  terminal: { runId: string; outcome: D.Outcome; reason?: EndReason } | null;
  /** Exact pre-migration bytes. Retained even if an old tab later changes the old key. */
  legacyBackup: string | null;
  /** Exact v2 session bytes retained on the first rotation-format migration. */
  migrationBackup: string | null;
  /**
   * The exact v3 to v7 record text the first v8 write replaced, taken by decodeSession when it migrates that record (a
   * live raid included); null for a new game, a legacy-key migration and a v2 record, whose bytes legacyBackup and
   * migrationBackup keep. Retained once, never replaced by a v8 text. An explicit import treats it as perksBackup and
   * enemyBackup (recordUpgradeFields, RecoveryStore.commit).
   */
  gunsBackup: string | null;
  /** Present exactly when the record carries an expansion. It is part of this same atomic record, never a second key. */
  expansion?: ExpansionState;
  /** Present with an expansion: the exact bytes of the record without one that the first write with one replaced, retained once. */
  systemsBackup?: string | null;
  /**
   * Present exactly with a v3 (perk) expansion: the exact text with a v1/v2 expansion that the first write with a v3 one
   * replaced (null when the store held none then), retained once and never replaced. A later explicit import of a v1/v2
   * expansion starts a new cycle.
   */
  perksBackup?: string | null;
  /**
   * Present exactly while enemy rules are on (#81, records 6 and 7 before v8): the exact text the first write with a
   * live enemy raid (LayeredRaid 4/5) replaced, retained once. The key stays through later raids and settlements, so
   * the rules stay on; only an explicit import starts a fresh cycle. Needs an expansion.
   */
  enemyBackup?: string | null;
}
/** Enemy rules (#81) are on for this record: it holds enemyBackup, a string or null. */
export const enemyRecord = (record: Pick<SessionRecord, 'enemyBackup'> | null | undefined): boolean => record?.enemyBackup !== undefined;
/**
 * The fields a write of `expansion` sets beside the common ones, given the record it replaces (`previous`; for an
 * explicit import, the imported record or null) and that record's exact text (`raw`, null for an import): the version,
 * always 8; gunsBackup, which only a migration sets (decodeSession), so it is previous's; perksBackup with a v3
 * expansion; enemyBackup once enemy rules are on, which they stay once a record has had them (main's rule for records 6
 * and 7). Shared by candidate validation, pending exports and durable writes; never nests the same generation again.
 */
export function recordUpgradeFields(expansion: ExpansionState | null, previous: SessionRecord | null, raw: string | null) {
  const enemies = !!expansion && (enemyRecord(previous) || enemyRules(expansion.raid));
  return { version: 8 as const, gunsBackup: previous?.gunsBackup ?? null,
    perksBackup: expansion?.version === 3
      ? previous?.expansion?.version === 3 ? previous.perksBackup! : previous?.expansion ? raw : null
      : undefined,
    enemyBackup: enemies ? enemyRecord(previous) ? previous!.enemyBackup! : raw : undefined };
}
const failure = (): never => { throw new Error('无法读取这份存档。请导出原始备份后使用兼容版本，当前进度未被覆盖。'); };
/**
 * A legacy-key profile names a gun field: an item with `gun` in any inventory the lenient repair reads (stash, the v0
 * `inventory`, bag, safe; a list or an object holding `items`), or the slot with `gun` or `weaponUid`.
 */
function holdsGunFields(raw: Record<string, any>): boolean {
  const own = (value: unknown, key: string) => !!value && typeof value === 'object' && Object.hasOwn(value, key);
  const items = (inv: any): unknown[] => Array.isArray(inv) ? inv : inv && typeof inv === 'object' && Array.isArray(inv.items) ? inv.items : [];
  return [raw.stash, raw.inventory, raw.bag, raw.safe].some(inv => items(inv).some(item => own(item, 'gun')))
    || own(raw.equipment, 'gun') || own(raw.equipment, 'weaponUid');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}

/**
 * The strict checks of one parsed record by the rules of its own format, changing `r` in place to the checked copies of
 * its profile, checkpoint and expansion. Version 8 is the gun format: profile v3, exact keys, an expansion (if any) that
 * names itself, perksBackup beside a v3 expansion and enemyBackup (only with an expansion) for enemy rules, which a live
 * enemy raid requires. Versions 2 to 7 are the old format: profile v1/v2, and the record version names what it carries
 * (none for 2 and 3, a v1/v2 expansion for 4 and 6, a v3 one for 5 and 7, enemy rules for 6 and 7).
 */
function checkRecord(r: any, resolveWorld: WorldResolver): void {
  const current = r.version === 8, legacy = r.version === 2;
  const expanded = current ? Object.hasOwn(r, 'expansion') : r.version >= 4;
  const perks = current ? expanded && r.expansion?.version === 3 : r.version === 5 || r.version === 7;
  const enemies = current ? Object.hasOwn(r, 'enemyBackup') : r.version >= 6;
  if (!Number.isSafeInteger(r.revision) || r.revision < 1 || !Number.isSafeInteger(r.savedAt) || r.savedAt < 0
      || (r.legacyBackup !== null && typeof r.legacyBackup !== 'string') || !r.profile || r.profile.version !== (current ? 3 : legacy ? 1 : 2)
      || (!legacy && r.migrationBackup !== null && typeof r.migrationBackup !== 'string')
      || (current && r.gunsBackup !== null && typeof r.gunsBackup !== 'string')
      || (expanded && (r.systemsBackup !== null && typeof r.systemsBackup !== 'string'))
      || (perks && (r.perksBackup !== null && typeof r.perksBackup !== 'string'))
      || (enemies && (!expanded || (r.enemyBackup !== null && typeof r.enemyBackup !== 'string')))
      || (!expanded && (r.expansion !== undefined || r.systemsBackup !== undefined))
      || (!perks && r.perksBackup !== undefined)
      || (!enemies && r.enemyBackup !== undefined)) return failure();
  if (current || expanded) {
    const keys = ['format', 'version', 'revision', 'savedAt', 'profile', 'raid', 'terminal', 'legacyBackup', 'migrationBackup',
      ...(current ? ['gunsBackup'] : []), ...(expanded ? ['expansion', 'systemsBackup'] : []), ...(perks ? ['perksBackup'] : []),
      ...(enemies ? ['enemyBackup'] : [])];
    if (Object.keys(r).length !== keys.length || keys.some(key => !Object.hasOwn(r, key))) return failure();
  }
  if (expanded) {
    // An old record's version names the expansion it carries (5 and 7 exactly a v3 one) and its live enemy raid (a
    // LayeredRaid 4 only in 6, a 5 only in 7). A v8 record holds a live enemy raid only with enemy rules on.
    if (!current && ((r.version === 5 || r.version === 7) !== (r.expansion?.version === 3)
        || r.expansion?.raid?.version === 4 && r.version !== 6 || r.expansion?.raid?.version === 5 && r.version !== 7)) return failure();
    if (current && enemyRules(r.expansion?.raid) && !enemies) return failure();
    if (!r.profile.activeRun && r.expansion?.base?.location === 'settlement' && r.terminal === null) return failure();
  }
  const active = r.profile.activeRun;
  // Profile fields keep the strict rules of a stored profile (inventory, economy, 1 MiB) of the record's own format.
  const checked: D.SaveDataV1 | RecordV7['profile'] = current ? decodeStoredProfile({ ...r.profile, activeRun: null }) : decodeOldStoredProfile({ ...r.profile, activeRun: null });
  checked.activeRun = active ? { seed: active.seed, runId: active.runId } : null;
  // Never discard the strict decoder's normalized result and then trust unchecked fields.
  if (canonical(checked) !== canonical({ ...r.profile, version: current ? 3 : 2 })) return failure();
  r.profile = checked;
  if (active) {
    if (!identity(active.runId) || r.terminal !== null) return failure();
    if (legacy && r.raid?.loadout && [...r.raid.loadout.bag.items, ...r.raid.loadout.safe.items].some((i: D.Item) => i.rotated !== undefined)) return failure();
    if (expanded && r.expansion?.raid !== null && r.raid === null) {
      // Layered worlds have their own complete, strictly validated checkpoint.
      if (!r.expansion?.raid) return failure();
    } else r.raid = validateCheckpoint(r.raid, r.profile, legacy);
  } else if (r.raid !== null) return failure();
  if (r.terminal !== null && (!r.terminal || !identity(r.terminal.runId)
      || !['death', 'timeout', 'extract'].includes(r.terminal.outcome) || r.profile.lastResult?.outcome !== r.terminal.outcome)) return failure();
  if (r.terminal?.reason !== undefined && (!expanded || !['death', 'timeout', 'extract', 'abandon'].includes(r.terminal.reason)
      || (r.terminal.reason === 'abandon' ? r.terminal.outcome !== 'death' : r.terminal.reason !== r.terminal.outcome))) return failure();
  if (expanded) r.expansion = validateExpansion(r.expansion, r.profile, r.raid, resolveWorld);
}

/**
 * A stored record as v8. A v8 record is checked as such. A v2 to v7 record is checked by its own (old) rules first, then
 * migrated in memory, a live raid included (migrateRecord: factory guns, the equipped gun a new uid; v3 to v7 keep their
 * text as gunsBackup; v6 and v7 keep enemyBackup, so their enemy rules stay on), and the result is checked again as v8.
 * Nothing is written here: the first commit stores the v8 record. A failed migration or v8 check reads as an
 * incompatible save, never as a repaired one.
 */
export function decodeSession(text: string, resolveWorld: WorldResolver = resolveExpansionWorld): SessionRecord {
  if (utf8Bytes(text) > SESSION_MAX_BYTES) return failure();
  let r: any;
  try { r = JSON.parse(text); } catch { return failure(); }
  if (!r || r.format !== 'escape-bincov-session' || ![2, 3, 4, 5, 6, 7, 8].includes(r.version)) return failure();
  checkRecord(r, resolveWorld);
  if (r.version === 8) return structuredClone(r);
  const old: RecordV7 = { ...structuredClone(r), version: r.version >= 4 ? r.version : 3, migrationBackup: r.version === 2 ? text : r.migrationBackup };
  let migrated: any;
  try {
    migrated = JSON.parse(JSON.stringify(migrateRecord(old, r.version >= 3 ? text : null)));
    checkRecord(migrated, resolveWorld);
  } catch { return failure(); }
  return migrated as SessionRecord;
}

/** A real compare/write ownership failure, distinct from quota or serialization errors. */
export class StorageConflictError extends Error {}

/** Candidate construction/validation failed before the storage write was attempted. */
export class SavePreparationError extends Error {
  constructor(cause: unknown) { super(cause instanceof Error ? cause.message : '存档候选准备失败。', { cause }); }
}

/** Synchronous single-record commit. A failed setItem leaves the previous revision intact. */
export class RecoveryStore {
  private expected: string | null = null;
  record: SessionRecord | null = null;
  private legacy: string | null = null;
  private migration: string | null = null;
  private systems: string | null = null;
  private loaded = false;
  writable = true;
  constructor(private storage: D.StorageLike, private now = () => Date.now(), private resolveWorld: WorldResolver = resolveExpansionWorld) {}
  load(): { save: D.SaveDataV1; raid: RaidCheckpoint | null; expansion: ExpansionState | null; legacyRecovery: boolean } {
    const text = this.storage.getItem(SESSION_KEY);
    if (text !== null) {
      const record = decodeSession(text, this.resolveWorld); // Unknown/corrupt is never treated as missing.
      this.expected = text; this.record = record; this.legacy = record.legacyBackup; this.migration = record.migrationBackup; this.loaded = true;
      this.systems = record.systemsBackup ?? null;
      return { save: structuredClone(record.profile), raid: structuredClone(record.raid), expansion: structuredClone(record.expansion ?? null), legacyRecovery: false };
    }
    this.legacy = this.storage.getItem(D.SAVE_KEY);
    let save: D.SaveDataV1;
    if (this.legacy !== null) {
      let raw: any;
      try { raw = JSON.parse(this.legacy); } catch { return failure(); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![undefined, 0, 1, 2].includes(raw.version)
          || (!raw.stash && !raw.inventory)) return failure();
      // No client before gun instances wrote `gun` or `weaponUid` (M0 review, decision 2): a v0/v1 profile holding one is
      // refused here, never stripped by the lenient repair below; v2 is checked strictly and refuses it as well.
      if (raw.version !== 2 && holdsGunFields(raw)) return failure();
      // Both paths migrate to profile v3 (migrateSave), every gun a factory instance; the bytes stay as legacyBackup.
      save = raw.version === 2 ? decodeStoredProfile({ ...raw, activeRun: null }) : D.migrateSave(raw);
      if (raw.version === 2) {
        const active = raw.activeRun;
        if (active !== null && (!active || typeof active !== 'object' || Array.isArray(active)
            || !whole(active.seed, 1, UINT32_MAX) || (active.runId !== undefined && !identity(active.runId))
            || Object.keys(active).some(k => k !== 'seed' && k !== 'runId'))) return failure();
        save.activeRun = active;
      }
    } else save = D.newSave();
    const legacyRecovery = !!save.activeRun;
    D.recoverInterrupted(save); // Only a legacy run without a checkpoint uses the old failure rule.
    this.loaded = true; this.expected = null;
    return { save, raid: null, expansion: null, legacyRecovery };
  }
  /**
   * Writes the record as v8, keeping every earlier backup. The stored record guards the write: once it has an expansion,
   * no write may drop it; a v3 (perk) expansion is never written back as v1/v2 and enemy rules are never switched off,
   * except by `explicitImport`, a player-confirmed import (the imported record, or true without one) of an older backup,
   * possibly holding a live v2 raid; it upgrades again at the next station boundary. Importing or resetting a current
   * perk profile keeps this origin's gun, perk and enemy copies; a confirmed older expansion starts a new upgrade cycle,
   * and importing into an origin without a perk profile keeps the imported copies (main's rule, #81, for all three).
   */
  commit(profile: D.SaveDataV1, raid: RaidCheckpoint | null, terminal?: SessionRecord['terminal'], expansion = this.record?.expansion ?? null, explicitImport: boolean | SessionRecord = false): SessionRecord {
    if (!this.loaded || !this.writable) throw new Error('存档未就绪或另一窗口正在使用。');
    if (this.storage.getItem(SESSION_KEY) !== this.expected) throw new StorageConflictError('另一窗口已修改存档，请刷新以加载新进度。');
    let candidate: SessionRecord, text: string, publication: SessionRecord, systems: string | null;
    try {
      const previous = typeof explicitImport === 'object' ? explicitImport : explicitImport ? null : this.record;
      const fields = recordUpgradeFields(expansion, previous, explicitImport ? null : this.expected);
      if (explicitImport && expansion?.version === 3 && this.record?.expansion?.version === 3) {
        fields.gunsBackup = this.record.gunsBackup;
        fields.perksBackup = this.record.perksBackup!;
        if (enemyRecord(this.record)) fields.enemyBackup = this.record.enemyBackup!;
      }
      const had = this.record?.expansion?.version ?? 0;
      const downgrade = '请导入包含角色与基地状态的完整备份，不能降级覆盖当前存档。';
      // Once an expansion has been enabled, imports cannot downgrade and silently discard its state.
      if (had > 0 && expansion === null) throw new Error(downgrade);
      // Likewise an ordinary commit never writes a v3 expansion back as v1/v2 (dropping the perk selection) or switches
      // enemy rules off.
      if (!explicitImport && (had === 3 && expansion?.version !== 3 || enemyRecord(this.record) && fields.enemyBackup === undefined)) throw new Error(downgrade);
      systems = this.systems ?? (expansion && had === 0 ? this.expected : null);
      candidate = { format: 'escape-bincov-session', version: fields.version, revision: (this.record?.revision ?? 0) + 1,
        savedAt: this.now(), profile: structuredClone(profile), raid: structuredClone(raid),
        terminal: terminal === undefined ? (profile.activeRun ? null : this.record?.terminal ?? null) : terminal,
        legacyBackup: this.legacy, migrationBackup: this.migration, gunsBackup: fields.gunsBackup,
        ...(expansion ? { expansion: structuredClone(expansion), systemsBackup: systems } : {}),
        ...(fields.perksBackup !== undefined ? { perksBackup: fields.perksBackup } : {}),
        ...(fields.enemyBackup !== undefined ? { enemyBackup: fields.enemyBackup } : {}) };
      text = JSON.stringify(candidate);
      decodeSession(text, this.resolveWorld);
      // Allocate the caller's detached publication before the durable boundary. Nothing after setItem may clone or call out.
      publication = structuredClone(candidate);
    } catch (error) { throw new SavePreparationError(error); }
    this.storage.setItem(SESSION_KEY, text);
    this.expected = text; this.record = candidate; this.systems = systems;
    return publication;
  }
  original(): string | null { return this.storage.getItem(SESSION_KEY) ?? this.storage.getItem(D.SAVE_KEY); }
}

/** A page-lifetime exclusive lock also protects the read/compare/write critical section. */
export async function ownSession(locks: LockManager | undefined): Promise<{ owned: boolean; release(): void }> {
  if (!locks) return { owned: false, release() {} };
  return new Promise(resolve => {
    void locks.request(SESSION_KEY, { ifAvailable: true }, lock => {
      if (!lock) { resolve({ owned: false, release() {} }); return; }
      return new Promise<void>(release => resolve({ owned: true, release }));
    }).catch(() => resolve({ owned: false, release() {} }));
  });
}
