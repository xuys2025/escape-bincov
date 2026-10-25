/**
 * Save migration to gun instances (#28 M0-06): pure functions that bring a profile v2 to v3 and a session record v3 to
 * v7 to v8. Every old gun becomes a factory instance (nothing installed, devices off) under the uid it already has;
 * only the equipped gun, which old saves keep without a uid, gets one: `gun-v6`, or `gun-v6-2`, `gun-v6-3` ... when a
 * string anywhere in the save already is that. Nothing else changes: the migration adds the gun fields, raises the
 * profile and record versions and adds gunsBackup, so stripping those gives back the input exactly. The perk and enemy
 * backups stay as they were: a v6/v7 record keeps its enemyBackup key, which is how a v8 record says enemy rules are on.
 *
 * Deterministic and idempotent (a v3 profile or v8 record comes back as an equal copy after the same checks); no
 * clock, RNG or entity serials. Every result is checked as the new format: each gun valid (validateGun) and no gun,
 * part or item uid used twice. domain migrateSave calls migrateProfile for profiles v0-v2, and decodeSession calls
 * migrateRecord for records v2-v7 after the old format's own strict check, then checks the result as v8
 * (docs/gunsmith/CONTRACTS.md, the M0-06 section).
 */
import type { Equipment, SaveDataV1 } from '../domain';
import type { SessionRecord } from '../recovery-store';
import type { GunId } from './catalog';
import { factoryState, gunUids, isGunId, repeatedUids, validateGun } from './instance';

/** The guns a save from before the catalog can hold: the three that were items. The test ties them to domain WEAPONS. */
export const OLD_GUNS: readonly GunId[] = ['pistol', 'shotgun', 'carbine'];
/** The equipped slot before gun instances: the gun type and magazine, with no uid or state. */
export type EquipmentV2 = Omit<Equipment, 'weaponUid' | 'gun'>;
/** A profile before gun instances (v2): no item has a `gun` field and the equipped slot names no gun uid. Read only. */
export type ProfileV2 = Omit<SaveDataV1, 'version' | 'equipment'> & { version: 2; equipment: EquipmentV2 };
/**
 * A session record before gun instances: v3 without an expansion, v4 with a v1/v2 one, v5 with a v3 one, v6 and v7 as
 * v4 and v5 with enemy rules on (#81, they hold enemyBackup), and no `gunsBackup`; its profile is v2. What decodeSession
 * checks by the old rules and hands to migrateRecord. Its nested loadouts, ground loot and containers are typed as the
 * current ones but hold no gun fields.
 */
export type RecordV7 = Omit<SessionRecord, 'version' | 'profile' | 'gunsBackup'> & { version: 3 | 4 | 5 | 6 | 7; profile: ProfileV2 };

type Json = Record<string, any>;
const EQUIPPED = 'gun-v6';
const obj = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value: Json, key: string) => Object.hasOwn(value, key);
const reject = (): never => { throw new Error('存档格式不支持或内容不完整，当前进度未改动。'); };

/**
 * Every gun holder of one save, each inventory once: items, ground loot and equipped slots. `mirrors` are the items of
 * the profile's safe while a raid is live, a copy of the raid loadout's safe: migrated like the rest but not counted
 * twice for uniqueness. `uids` are other item uids the guns must not share (the charm).
 */
interface Holders { items: Json[]; loot: Json[]; slots: Json[]; mirrors: Set<Json>; uids: string[] }
function inventory(h: Holders, value: unknown, mirror = false) {
    if (!obj(value) || !Array.isArray(value.items) || !value.items.every(obj)) reject();
    const items = (value as Json).items as Json[];
    h.items.push(...items);
    if (mirror) for (const item of items) h.mirrors.add(item);
}
function slot(h: Holders, value: unknown) {
    if (!obj(value)) reject();
    h.slots.push(value as Json);
}
function world(h: Holders, loot: unknown, containers: unknown) {
    if (!Array.isArray(loot) || !loot.every(obj) || !Array.isArray(containers) || !containers.every(obj)) reject();
    h.loot.push(...(loot as Json[]));
    for (const container of containers as Json[]) inventory(h, container.inventory);
}
function carried(h: Holders, raid: Json) {
    if (!obj(raid.loadout)) reject();
    inventory(h, raid.loadout.bag); inventory(h, raid.loadout.safe); slot(h, raid.loadout);
}
function profileHolders(h: Holders, profile: Json, live: boolean) {
    inventory(h, profile.stash); inventory(h, profile.bag); inventory(h, profile.safe, live); slot(h, profile.equipment);
}
/** A classic checkpoint (`raid`) and a layered raid (`expansion.raid`) each carry a loadout, ground loot and containers. */
function recordHolders(record: Json): Holders {
    const h: Holders = { items: [], loot: [], slots: [], mirrors: new Set(), uids: [] };
    const classic = record.raid, expanded = own(record, 'expansion'), expansion = expanded ? record.expansion : null;
    if ((classic !== null && !obj(classic)) || (expanded && !obj(expansion))) reject();
    const layered = expansion?.raid ?? null;
    if (layered !== null && (!obj(layered) || !obj(layered.maps))) reject();
    profileHolders(h, record.profile, classic !== null || layered !== null);
    if (classic) { carried(h, classic); world(h, classic.loot, classic.containers ?? []); }
    if (expansion?.charm) {
        if (!obj(expansion.charm) || isGunId(expansion.charm.id) || own(expansion.charm, 'gun')) reject();
        h.uids.push(expansion.charm.uid);
    }
    if (layered) {
        carried(h, layered);
        for (const map of Object.values(layered.maps)) { if (!obj(map)) reject(); world(h, (map as Json).loot, (map as Json).containers); }
    }
    return h;
}

/** Every key and string value in `value`: what the equipped uid must differ from (more than the uids; harmless). */
function strings(value: unknown, out = new Set<string>()): Set<string> {
    if (typeof value === 'string') out.add(value);
    else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) { out.add(key); strings(inner, out); }
    return out;
}
/** The first of `gun-v6`, `gun-v6-2`, `gun-v6-3` ... not in `taken`, then taken. Depends on nothing but the save. */
function allocate(taken: Set<string>): string {
    let uid = EQUIPPED;
    for (let n = 2; taken.has(uid); n++) uid = `${EQUIPPED}-${n}`;
    taken.add(uid);
    return uid;
}

/** Old format to new, in place: an old gun item or ground gun gets a factory state, an equipped slot its gun's uid. */
function upgrade(h: Holders, taken: Set<string>) {
    for (const holder of [...h.items, ...h.loot]) {
        if (own(holder, 'gun')) reject(); // An old save never has the field: a mixed or forged value.
        if (!isGunId(holder.id)) continue;
        if (!OLD_GUNS.includes(holder.id)) reject();
        holder.gun = factoryState();
    }
    for (const s of h.slots) {
        if (own(s, 'weaponUid') || own(s, 'gun')) reject();
        if (s.weapon === null) Object.assign(s, { weaponUid: null, gun: null });
        else if (OLD_GUNS.includes(s.weapon)) Object.assign(s, { weaponUid: allocate(taken), gun: factoryState() });
        else reject();
    }
}
/** The new format's gun rules: each gun valid with its state, no state elsewhere, and no gun, part or item uid twice. */
function verify(h: Holders) {
    const uids = [...h.uids];
    for (const holder of [...h.items, ...h.loot]) {
        const gun = isGunId(holder.id);
        if (gun ? !own(holder, 'gun') || !validateGun(holder.id, holder.uid, holder.gun).ok : own(holder, 'gun')) reject();
        if (!h.mirrors.has(holder)) uids.push(...(gun ? gunUids({ uid: holder.uid, parts: holder.gun.parts }) : [holder.uid]));
    }
    for (const s of h.slots) {
        if (!own(s, 'weaponUid') || !own(s, 'gun')) reject();
        if (s.weapon === null ? s.weaponUid !== null || s.gun !== null : !validateGun(s.weapon, s.weaponUid, s.gun).ok) reject();
        if (s.weapon !== null) uids.push(...gunUids({ uid: s.weaponUid, parts: s.gun.parts }));
    }
    if (repeatedUids(uids).length) reject();
}

/**
 * Profile v2 (as decodeStoredProfile or domain migrateSave returns it, a legacy-key profile included) to v3; a v3
 * profile comes back as a checked copy. Throws on anything else, never repairs.
 */
export function migrateProfile(profile: ProfileV2 | SaveDataV1): SaveDataV1 {
    const out: unknown = structuredClone(profile);
    if (!obj(out) || (out.version !== 2 && out.version !== 3)) return reject();
    const h: Holders = { items: [], loot: [], slots: [], mirrors: new Set(), uids: [] };
    profileHolders(h, out, false);
    if (out.version === 2) { upgrade(h, strings(out)); out.version = 3; }
    verify(h);
    return out as SaveDataV1;
}

/**
 * A session record v3 to v7 (as decodeSession returns it, a v2 record already turned into v3 there) to v8, with
 * `original` kept as gunsBackup: decodeSession passes the stored text of a v3-v7 record and null for v2, whose bytes
 * migrationBackup already keeps. perksBackup and enemyBackup stay as they are, so a v6/v7 record keeps enemy rules on.
 * A v8 record comes back as a checked copy and `original` is ignored. Throws on an unknown version, a profile version
 * that does not match, old records already holding gun fields, a gun an old save cannot hold, and any result that
 * breaks the gun rules; never repairs.
 */
export function migrateRecord(record: RecordV7 | SessionRecord, original: string | null): SessionRecord {
    const out: unknown = structuredClone(record);
    if (!obj(out) || out.format !== 'escape-bincov-session' || ![3, 4, 5, 6, 7, 8].includes(out.version) || !obj(out.profile)
        || out.profile.version !== (out.version === 8 ? 3 : 2)) return reject();
    const h = recordHolders(out);
    if (out.version === 8) {
        if (!own(out, 'gunsBackup') || (out.gunsBackup !== null && typeof out.gunsBackup !== 'string')) reject();
    } else {
        // The record version names what it carries: v3 no expansion, v4/v6 a v1/v2 one, v5/v7 a v3 one, and v6/v7 enemy
        // rules, with enemyBackup.
        if (own(out, 'gunsBackup') || (original !== null && typeof original !== 'string') || (out.version === 3) === own(out, 'expansion')
            || (out.version !== 3 && (out.version === 5 || out.version === 7) !== (out.expansion.version === 3)) // recordHolders checked it is an object
            || (out.version >= 6) !== own(out, 'enemyBackup')) reject();
        upgrade(h, strings(out));
        out.profile.version = 3; out.version = 8; out.gunsBackup = original;
    }
    verify(h);
    return out as SessionRecord;
}
