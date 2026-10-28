/**
 * Stored-profile decoding and the persisted-data checks that every save format shares. Works on parsed values:
 * reading file or record text (byte limits, JSON) stays with save-backup and recovery-store, which call into this
 * module, never the other way round. Checks return booleans so that each format keeps its own error message.
 *
 * Two profile formats are read. Version 3 (record v8) holds gun instances: every gun item, every gun on the ground and
 * the equipped slot carry a gun state (src/gunsmith/instance.ts), and gun, part and item uids are unique together.
 * Versions 1 and 2 (records v2 to v7) are the old format, where no `gun` or `weaponUid` field may appear: they are
 * checked by the old rules and migrated (docs/gunsmith/CONTRACTS.md, the M0-06 section), never repaired.
 */
import { ITEMS, WEAPONS, cleanOldSave, createInventory, equippedWeapon, fits, isGun, itemUids, migrateSave, type Inventory, type Item, type SaveDataV1 } from './domain';
import { gunUids, validateGun } from './gunsmith/instance';
import { validPresets } from './gunsmith/presets';
import type { ProfileV2 } from './gunsmith/migrate';

/** Upper bound for money, counters and quantities. Seeds and RNG states are 32-bit: UINT32_MAX. */
export const COUNT_MAX = 1e9;
export const UINT32_MAX = 0xffffffff;
/** A stored profile is at most 1 MiB: a backup file as written, a profile held in another record as compact JSON. */
export const PROFILE_MAX_BYTES = 1024 * 1024;

export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;
export function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function whole(value: unknown, min: number, max: number): value is number { return finite(value, min, max) && Number.isSafeInteger(value); }
/** Item uids and run ids. */
export function identity(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
/** JSON IDs must be strings as well as own keys: hasOwn alone coerces ['pistol'], while a truthy lookup accepts
 * Object.prototype names. Validate before indexing or migrating; migration may otherwise silently drop gear. */
export function hasOwnStringKey<T extends object>(table: T, value: unknown): value is keyof T & string {
  return typeof value === 'string' && Object.hasOwn(table, value);
}
export function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}

/**
 * One persisted inventory: the exact grid size, known items within their stack size, uids unique across `seen`
 * (the caller chooses the scope and gets the accepted uids added), whole in-bounds positions, no overlap.
 * `rotation`: whether this format may store rotated items. `exact`: also reject unknown inventory and item fields.
 * `guns`: the gun format (profile v3, record v8). A gun item must carry a valid gun state (validateGun), takes the cells
 * its parts grow it to, and its part uids join `seen` like item uids; no other item may have a `gun` field. Without it
 * (the old format) no item may have one at all.
 * `each` runs for an item that passed, before it is recorded; it may throw the caller's own error.
 */
export function validInventory(value: unknown, w: number, h: number, seen: Set<string>,
  rules: { rotation: boolean; exact: boolean; guns: boolean }, each?: (item: Item) => void): value is Inventory {
  if (rules.exact && !hasExactKeys(value, ['w', 'h', 'items'])) return false;
  const inv = value as Inventory | null;
  if (!inv || inv.w !== w || inv.h !== h || !Array.isArray(inv.items) || inv.items.length > w * h) return false;
  const placed = createInventory(w, h);
  for (const item of inv.items as unknown[]) {
    if (!item || typeof item !== 'object') return false;
    const i = item as Item, gun = rules.guns && isGun(i.id);
    if (rules.exact && !hasExactKeys(i, ['uid', 'id', 'qty', 'x', 'y', ...('relief' in i ? ['relief'] : []), ...('rotated' in i ? ['rotated'] : []), ...(gun ? ['gun'] : [])])) return false;
    if (!hasOwnStringKey(ITEMS, i.id) || !whole(i.qty, 1, ITEMS[i.id].stack) || !identity(i.uid) || seen.has(i.uid)
      || (i.relief !== undefined && typeof i.relief !== 'boolean')
      || (i.rotated !== undefined && (!rules.rotation || typeof i.rotated !== 'boolean'))) return false;
    // The gun state is checked before anything reads its parts (the footprint below).
    if (gun ? !validateGun(i.id, i.uid, i.gun).ok : Object.hasOwn(i, 'gun')) return false;
    const uids = itemUids(i);
    if (uids.some(uid => seen.has(uid)) || !fits(placed, i, i.x, i.y, undefined, !!i.rotated)) return false;
    each?.(i);
    for (const uid of uids) seen.add(uid);
    placed.items.push(i);
  }
  return true;
}
/**
 * The equipped slot: a gun that is not the knife (or none), a magazine within its size. In the gun format the slot also
 * names the gun: `weaponUid` and `gun` are both null without a gun, otherwise a valid instance whose uids join `seen`,
 * and the size is that instance's effective capacity (equippedWeapon, M1-05). The old format may hold neither field and
 * keeps the gun type's size.
 */
function validEquipment(value: any, seen: Set<string>, guns: boolean): boolean {
  if (!value || typeof value.relief !== 'boolean' || !whole(value.ammo, 0, COUNT_MAX) || !whole(value.ammoRelief, 0, COUNT_MAX)) return false;
  const gun = value.weapon === null ? null : isGun(value.weapon) ? WEAPONS[value.weapon] : undefined;
  if (gun === undefined || value.ammoRelief > value.ammo) return false;
  if (!guns) return value.ammo <= (gun?.magazine ?? 0) && !Object.hasOwn(value, 'weaponUid') && !Object.hasOwn(value, 'gun');
  if (!Object.hasOwn(value, 'weaponUid') || !Object.hasOwn(value, 'gun')) return false;
  if (value.weapon === null) return value.ammo === 0 && value.weaponUid === null && value.gun === null;
  // The capacity is read from the instance only once it is known to be valid.
  if (!validateGun(value.weapon, value.weaponUid, value.gun).ok || value.ammo > equippedWeapon(value).magazine) return false;
  const uids = gunUids({ uid: value.weaponUid, parts: value.gun.parts });
  if (uids.some(uid => seen.has(uid))) return false;
  for (const uid of uids) seen.add(uid);
  return true;
}

const invalid = (): never => { throw new Error('存档格式不支持或内容不完整，当前进度未改动。'); };
/** The error for a stored profile over PROFILE_MAX_BYTES, worded for the oversized file a player picked. */
export function profileTooLarge(): never { throw new Error('文件超过 1 MiB，请选择游戏导出的存档备份。'); }

/**
 * The strict rules of a settled stored profile in its own format (version 1 or 2 old, 3 with gun instances): no live
 * raid, whole economy and counters, every inventory and the equipped slot in one uid space. Throws, never repairs.
 */
function checkProfile(raw: any): void {
  if (!raw || ![1, 2, 3].includes(raw.version) || raw.activeRun !== null || !whole(raw.cash, 0, COUNT_MAX) || typeof raw.upgraded !== 'boolean') invalid();
  if (!raw.settings || !finite(raw.settings.volume, 0, 1)) invalid();
  if (!raw.stats || !['runs', 'extracts', 'kills'].every(k => whole(raw.stats[k], 0, COUNT_MAX)) || raw.stats.extracts > raw.stats.runs) invalid();
  if (!raw.quests || !['repair', 'sample', 'ledger'].every(k => typeof raw.quests[k] === 'boolean')) invalid();
  const guns = raw.version === 3, seen = new Set<string>(), rules = { rotation: raw.version >= 2, exact: false, guns };
  for (const [name, w, h] of [['stash', 10, raw.upgraded ? 9 : 6], ['bag', 6, 5], ['safe', 2, 2]] as const)
    if (!validInventory(raw[name], w, h, seen, rules)) invalid();
  if (!validEquipment(raw.equipment, seen, guns)) invalid();
  // Presets (#28 M2-07) only in the gun format, never an empty list: no presets is no field.
  if (Object.hasOwn(raw, 'gunPresets') && (!guns || !validPresets(raw.gunPresets) || !raw.gunPresets.length)) invalid();
}

/**
 * A parsed settled backup: a bare v1/v2/v3 profile, or the export envelope around one (its formatVersion equal to the
 * profile's). Strict: rejects instead of repairing (an old profile holding a gun field included), rejects a live raid,
 * then normalises through migrateSave, which migrates an old profile. The result is v3 and shares no objects with the input.
 */
export function decodeProfileDocument(parsed: any): SaveDataV1 {
  if (parsed?.format === 'escape-bincov-backup' && (![1, 2, 3].includes(parsed.formatVersion) || parsed.save?.version !== parsed.formatVersion))
    throw new Error('此备份来自不兼容的版本，当前进度未改动。');
  const raw = parsed?.format === 'escape-bincov-backup' ? parsed.save : parsed;
  checkProfile(raw);
  return migrateSave(raw);
}

/**
 * A profile held inside another record (a session's profile, the legacy key) or the profile a classic raid's gear
 * settles into. Same rules as a backup file; the size limit applies to the compact JSON, so source whitespace never counts.
 */
export function decodeStoredProfile(value: unknown): SaveDataV1 {
  if (utf8Bytes(JSON.stringify(value)) > PROFILE_MAX_BYTES) profileTooLarge();
  return decodeProfileDocument(value);
}

/**
 * A v1/v2 profile held in a record from before gun instances (session v2 to v7), or the profile such a record's classic
 * raid gear settles into: the old rules and normalization, kept in the old format (not migrated), so decodeSession can
 * compare it with the stored profile and then migrate the whole record at once.
 */
export function decodeOldStoredProfile(value: unknown): ProfileV2 {
  if (utf8Bytes(JSON.stringify(value)) > PROFILE_MAX_BYTES) profileTooLarge();
  const raw = value as any;
  if (!raw || ![1, 2].includes(raw.version)) invalid();
  checkProfile(raw);
  return cleanOldSave(raw);
}
