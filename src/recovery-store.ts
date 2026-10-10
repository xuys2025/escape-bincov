import * as D from './domain';
import { validateCheckpoint, type RaidCheckpoint } from './checkpoint';
import { decodeBackup } from './save-backup';
import { validateExpansion, type ExpansionState, type WorldResolver, type EndReason } from './expansion-state';
import { resolveExpansionWorld } from './expansion-worlds';

/** A separate versioned record isolates old clients that silently discard unknown fields. */
export const SESSION_KEY = 'escape-bincov.session.v2';
export const SESSION_MAX_BYTES = 2 * 1024 * 1024;
export interface SessionRecord {
  format: 'escape-bincov-session'; version: 3 | 4; revision: number; savedAt: number;
  profile: D.SaveDataV1; raid: RaidCheckpoint | null;
  terminal: { runId: string; outcome: D.Outcome; reason?: EndReason } | null;
  /** Exact pre-migration bytes. Retained even if an old tab later changes the old key. */
  legacyBackup: string | null;
  /** Exact v2 session bytes retained on the first rotation-format migration. */
  migrationBackup: string | null;
  /** Present only in v4. It is part of this same atomic record, never a second key. */
  expansion?: ExpansionState;
  /** Exact pre-v4 main-record bytes, retained once rather than recursively nesting v4. */
  systemsBackup?: string | null;
}
const failure = (): never => { throw new Error('无法读取这份存档。请导出原始备份后使用兼容版本，当前进度未被覆盖。'); };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function decodeSession(text: string, resolveWorld: WorldResolver = resolveExpansionWorld): SessionRecord {
  if (new TextEncoder().encode(text).length > SESSION_MAX_BYTES) return failure();
  let r: any;
  try { r = JSON.parse(text); } catch { return failure(); }
  if (!r || r.format !== 'escape-bincov-session' || ![2, 3, 4].includes(r.version) || !Number.isSafeInteger(r.revision)
      || r.revision < 1 || !Number.isSafeInteger(r.savedAt) || r.savedAt < 0
      || (r.legacyBackup !== null && typeof r.legacyBackup !== 'string') || !r.profile || r.profile.version !== (r.version === 2 ? 1 : 2)
      || (r.version >= 3 && r.migrationBackup !== null && typeof r.migrationBackup !== 'string')
      || (r.version === 4 && (r.systemsBackup !== null && typeof r.systemsBackup !== 'string'))
      || (r.version !== 4 && (r.expansion !== undefined || r.systemsBackup !== undefined))) return failure();
  if (r.version === 4) {
    const keys = ['format', 'version', 'revision', 'savedAt', 'profile', 'raid', 'terminal', 'legacyBackup', 'migrationBackup', 'expansion', 'systemsBackup'];
    if (Object.keys(r).length !== keys.length || keys.some(key => !Object.hasOwn(r, key))) return failure();
    if (!r.profile.activeRun && r.expansion?.base?.location === 'settlement' && r.terminal === null) return failure();
  }
  const legacy = r.version === 2;
  const active = r.profile.activeRun;
  // Profile fields retain the existing strict inventory and economy validation.
  const checked = decodeBackup(JSON.stringify({ ...r.profile, activeRun: null }));
  checked.activeRun = active ? { seed: active.seed, runId: active.runId } : null;
  // Never discard the strict decoder's normalized result and then trust unchecked fields.
  if (canonical(checked) !== canonical({ ...r.profile, version: 2 })) return failure();
  r.profile = checked;
  if (active) {
    if (typeof active.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(active.runId) || r.terminal !== null) return failure();
    if (legacy && r.raid?.loadout && [...r.raid.loadout.bag.items, ...r.raid.loadout.safe.items].some((i: D.Item) => i.rotated !== undefined)) return failure();
    if (r.version === 4 && r.expansion?.raid !== null && r.raid === null) {
      // Layered worlds have their own complete, strictly validated checkpoint.
      if (!r.expansion?.raid) return failure();
    } else r.raid = validateCheckpoint(r.raid, r.profile, legacy);
  } else if (r.raid !== null) return failure();
  if (r.terminal !== null && (!r.terminal || typeof r.terminal.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.terminal.runId)
      || !['death', 'timeout', 'extract'].includes(r.terminal.outcome) || r.profile.lastResult?.outcome !== r.terminal.outcome)) return failure();
  if (r.terminal?.reason !== undefined && (r.version !== 4 || !['death', 'timeout', 'extract', 'abandon'].includes(r.terminal.reason)
      || (r.terminal.reason === 'abandon' ? r.terminal.outcome !== 'death' : r.terminal.reason !== r.terminal.outcome))) return failure();
  if (r.version === 4) r.expansion = validateExpansion(r.expansion, r.profile, r.raid, resolveWorld);
  return { ...structuredClone(r), version: r.version === 4 ? 4 : 3, migrationBackup: legacy ? text : r.migrationBackup };
}

/** A real compare/write ownership failure, distinct from quota or serialization errors. */
export class StorageConflictError extends Error {}

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
      save = raw.version === 2 ? decodeBackup(JSON.stringify({ ...raw, activeRun: null })) : D.migrateSave(raw);
      if (raw.version === 2) {
        const active = raw.activeRun;
        if (active !== null && (!active || typeof active !== 'object' || Array.isArray(active)
            || !Number.isSafeInteger(active.seed) || active.seed < 1 || active.seed > 0xffffffff
            || (active.runId !== undefined && (typeof active.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(active.runId)))
            || Object.keys(active).some(k => k !== 'seed' && k !== 'runId'))) return failure();
        save.activeRun = active;
      }
    } else save = D.newSave();
    const legacyRecovery = !!save.activeRun;
    D.recoverInterrupted(save); // Only a legacy run without a checkpoint uses the old failure rule.
    this.loaded = true; this.expected = null;
    return { save, raid: null, expansion: null, legacyRecovery };
  }
  commit(profile: D.SaveDataV1, raid: RaidCheckpoint | null, terminal?: SessionRecord['terminal'], expansion = this.record?.expansion ?? null): SessionRecord {
    if (!this.loaded || !this.writable) throw new Error('存档未就绪或另一窗口正在使用。');
    if (this.storage.getItem(SESSION_KEY) !== this.expected) throw new StorageConflictError('另一窗口已修改存档，请刷新以加载新进度。');
    // Once v4 has been enabled, imports cannot downgrade and silently discard its state.
    if (this.record?.version === 4 && expansion === null) throw new Error('请导入包含角色与基地状态的完整备份，不能降级覆盖当前存档。');
    const systems = this.systems ?? (expansion && this.record?.version !== 4 ? this.expected : null);
    const candidate: SessionRecord = { format: 'escape-bincov-session', version: expansion ? 4 : 3, revision: (this.record?.revision ?? 0) + 1,
      savedAt: this.now(), profile: structuredClone(profile), raid: structuredClone(raid),
      terminal: terminal === undefined ? (profile.activeRun ? null : this.record?.terminal ?? null) : terminal,
      legacyBackup: this.legacy, migrationBackup: this.migration,
      ...(expansion ? { expansion: structuredClone(expansion), systemsBackup: systems } : {}) };
    const text = JSON.stringify(candidate);
    decodeSession(text, this.resolveWorld);
    this.storage.setItem(SESSION_KEY, text);
    this.expected = text; this.record = candidate; this.systems = systems;
    return structuredClone(candidate);
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
