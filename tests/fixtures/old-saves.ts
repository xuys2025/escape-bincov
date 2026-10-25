/**
 * Saves as the clients before gun instances wrote them (profile v2, session records v3 to v7), made from current ones by
 * taking away exactly what the migration adds (src/gunsmith/migrate.ts): every `gun` state, the equipped slots' `gun`
 * and `weaponUid`, `gunsBackup`, and the versions. Real old bytes are frozen in gunsmith-v5-saves.json; these helpers
 * are for tests that need an old save of their own shape (a legacy key, a v4 backup with a live v2 raid ...).
 */
import type * as D from '../../src/domain';
import type { SessionRecord } from '../../src/recovery-store';

/** Every object that holds a gun or could: items and ground loot (an id and a qty) and equipped slots (a weapon and ammoRelief). */
export function holders(value: unknown, out = { items: [] as any[], slots: [] as any[] }) {
    if (Array.isArray(value)) value.forEach(v => holders(v, out));
    else if (value && typeof value === 'object') {
        const o = value as any;
        if (Object.hasOwn(o, 'weapon') && Object.hasOwn(o, 'ammoRelief')) out.slots.push(o);
        else if (Object.hasOwn(o, 'id') && Object.hasOwn(o, 'qty')) out.items.push(o);
        Object.values(o).forEach(v => holders(v, out));
    }
    return out;
}
/** A copy without the fields the migration adds to holders. */
export function withoutGuns<T>(value: T): T {
    const copy = structuredClone(value), h = holders(copy);
    for (const item of h.items) delete item.gun;
    for (const slot of h.slots) { delete slot.weaponUid; delete slot.gun; }
    return copy;
}
/** The v2 profile an old client would have stored for this one. */
export const oldProfile = (profile: D.SaveDataV1): any => ({ ...withoutGuns(profile), version: 2 });
/**
 * The record an old client would have stored for this v8 one: v3 without an expansion, v4 with a v1/v2 one, v5 with a v3
 * one, v6 and v7 as v4 and v5 with enemy rules on (it holds enemyBackup), or `version` when a test relabels it on
 * purpose. Embedded backups (strings) are kept as they are.
 */
export function oldRecord(record: SessionRecord, version?: 3 | 4 | 5 | 6 | 7): any {
    const copy: any = withoutGuns(record), enemies = copy.enemyBackup !== undefined;
    delete copy.gunsBackup; copy.profile.version = 2;
    copy.version = version ?? (!copy.expansion ? 3 : (copy.expansion.version === 3 ? 5 : 4) + (enemies ? 2 : 0));
    return copy;
}
/**
 * In place: the v4 record the client before perks wrote for this v8 one with a v3 expansion: gun fields gone, expansion
 * and raid v2, no perk selection, perksBackup or enemy rules. Works on a record from before gun instances as well.
 */
export function makeV4(record: any): void {
    const old = oldRecord(record, 4);
    delete old.perksBackup; delete old.enemyBackup; old.expansion.version = 2; delete old.expansion.growth.perks;
    if (old.expansion.raid) old.expansion.raid.version = 2;
    for (const key of Object.keys(record)) delete record[key];
    Object.assign(record, old);
}
