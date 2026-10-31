import type { SaveDataV1 } from './domain';
import { decodeProfileDocument, PROFILE_MAX_BYTES, profileTooLarge, utf8Bytes } from './profile-codec';
import { decodeSession, SESSION_MAX_BYTES, type SessionRecord } from './recovery-store';
import type { WorldResolver } from './expansion-state';

/** Backups are complete, settled snapshots; importing never resumes a live raid. The envelope version is the profile's (3). */
export function encodeBackup(save: SaveDataV1): string {
  if (save.activeRun) throw new Error('请先结束行动，再导出存档。');
  return JSON.stringify({ format: 'escape-bincov-backup', formatVersion: save.version, createdAt: new Date().toISOString(), save }, null, 2);
}

export function decodeBackup(text: string): SaveDataV1 {
  if (utf8Bytes(text) > PROFILE_MAX_BYTES) profileTooLarge();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('无法读取存档。请选择游戏导出的 JSON 备份文件。'); }
  return decodeProfileDocument(parsed);
}

/** Live backups use a distinct envelope whose version is the record's (10); this decoder also accepts legacy exports. */
export function encodeRecoveryBackup(record: SessionRecord, resolveWorld?: WorldResolver): string {
  decodeSession(JSON.stringify(record), resolveWorld);
  return JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: record.version, record });
}
export function decodePortableBackup(text: string, resolveWorld?: WorldResolver): { kind: 'settled'; save: SaveDataV1 } | { kind: 'session'; record: SessionRecord } {
  if (utf8Bytes(text) > SESSION_MAX_BYTES + 512) throw new Error('存档文件过大。');
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('无法读取存档：文件不是有效的 JSON。'); }
  if (parsed?.format === 'escape-bincov-recovery-backup') {
    // Full backups 2 to 7 hold records from before gun instances; decodeSession migrates them like a stored one.
    if (![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(parsed.formatVersion) || parsed.record?.version !== parsed.formatVersion) throw new Error('此备份来自不兼容的版本，请使用兼容版本导入。');
    return { kind: 'session', record: decodeSession(JSON.stringify(parsed.record), resolveWorld) };
  }
  if (parsed?.format === 'escape-bincov-session') return { kind: 'session', record: decodeSession(text, resolveWorld) };
  return { kind: 'settled', save: decodeBackup(text) };
}
