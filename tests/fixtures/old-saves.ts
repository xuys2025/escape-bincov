/**
 * Saves as the clients before gun instances wrote them (profile v2, session records v3 to v7), made from current ones by
 * taking away exactly what the migration adds (src/gunsmith/migrate.ts): every `gun` state, the equipped slots' `gun`
 * and `weaponUid`, `gunsBackup`, and the versions; goods those clients never had stand in as older ones (oldGoods).
 * Real old bytes are frozen in gunsmith-v5-saves.json; these helpers are for tests that need an old save of their own
 * shape (a legacy key, a v4 backup with a live v2 raid ...).
 */
import * as D from '../../src/domain';
import type { SessionRecord } from '../../src/recovery-store';
import { withV8Footprints } from '../../src/gunsmith/instance';

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
/**
 * In place: goods no client before gun instances could hold become stand-ins from the share they were carved from (#28
 * M2-13 deals them out in raids and sells some): the G17 a pistol and the M4A1 a carbine (guns), an attachment a watch
 * (the gun or valuable share). Each keeps its uid and its place, and is no larger than before. Real old saves hold none,
 * so their bytes come back as stored; a test that wants such goods refused puts them in after this.
 */
function oldGoods(value: unknown): void {
    for (const item of holders(value).items) {
        const id = item.id === 'gb17' ? 'pistol' : item.id === 'mb4a1' ? 'carbine' : D.isAttachment(item.id) ? 'watch' : null;
        if (id) { item.id = id; item.qty = 1; }
    }
}
/** The v2 profile an old client would have stored for this one: the stash at its old rows too (v8Record). */
export function oldProfile(profile: D.SaveDataV1): any {
    const copy = withoutGuns(v8Record({ version: 9, profile } as SessionRecord).profile); oldGoods(copy);
    return { ...copy, version: 2 };
}
/**
 * The record a v8 client (before footprints followed the magazine, #28 M3-12) would have stored for this v9 one: no
 * layoutBackup, the stash 6 or 9 rows. Its guns lie where they are, which the v8 footprints (one row) always allow; a
 * stash item below the old rows has no v8 place, so that throws.
 */
export function v8Record(record: SessionRecord): any {
    const copy: any = structuredClone(record), rows = copy.profile.upgraded ? 9 : 6;
    if (!withV8Footprints(() => copy.profile.stash.items.every((i: D.Item) => i.y + D.itemSize(i).h <= rows))) throw new Error('a stash item below the v8 rows');
    delete copy.layoutBackup; copy.version = 8; copy.profile.stash.h = rows;
    return copy;
}
/**
 * The record an old client would have stored for this v9 one: v3 without an expansion, v4 with a v1/v2 one, v5 with a v3
 * one, v6 and v7 as v4 and v5 with enemy rules on (it holds enemyBackup), or `version` when a test relabels it on
 * purpose. Embedded backups (strings) are kept as they are.
 */
export function oldRecord(record: SessionRecord, version?: 3 | 4 | 5 | 6 | 7): any {
    const copy: any = withoutGuns(v8Record(record)), enemies = copy.enemyBackup !== undefined;
    oldGoods(copy);
    delete copy.gunsBackup; copy.profile.version = 2;
    copy.version = version ?? (!copy.expansion ? 3 : (copy.expansion.version === 3 ? 5 : 4) + (enemies ? 2 : 0));
    return copy;
}
/**
 * In place: the v4 record the client before perks wrote for this v9 one with a v3 expansion: gun fields gone, expansion
 * and raid v2, no perk selection, perksBackup or enemy rules. Works on a record from before gun instances as well.
 */
export function makeV4(record: any): void {
    const old = oldRecord(record, 4);
    delete old.perksBackup; delete old.enemyBackup; old.expansion.version = 2; delete old.expansion.growth.perks;
    if (old.expansion.raid) old.expansion.raid.version = 2;
    for (const key of Object.keys(record)) delete record[key];
    Object.assign(record, old);
}
