/**
 * Footprints follow the magazine (#28 M3-12, maintainer 2026-10-29): a box magazine makes a gun two rows, a long one or
 * a drum three, and the stash grew to 10 x 8 (12 rows built out), so what the old footprints laid out (a record v8, a
 * v3 profile file) may hold guns that no longer fit where they lie. Input already checked by the v8 rules
 * (withV8Footprints) is laid out again under the current ones, nothing lost:
 *
 * - every inventory keeps each item that still fits where it lies and moves the others to its first free place
 *   (D.relayoutInventory, in order, so the same input always comes out the same);
 * - at the base, what the bag or the safe cannot hold goes into the stash, and what the stash cannot hold into the bag;
 *   anything left over lies in the stash overflow (D.placeBelow, maintainer 2026-10-29), where the player takes it out
 *   before the next raid. Only past D.STASH_OVERFLOW_ROWS is it refused (an error, nothing written).
 *
 * A record's raid is laid out by migrateLayout (relayout-record.ts). Pure: no clock or RNG.
 */
import * as D from '../domain';

/** The refusal of a layout the current footprints cannot hold. */
export const layoutRefused = (): never => { throw new Error('这份存档里的物品按新的占格放不下，当前进度未改动。'); };
/** In place: `items` into the stash overflow, or the refusal. */
export function overflow(stash: D.Inventory, items: readonly D.Item[]): void {
    if (!D.placeBelow(stash, items)) layoutRefused();
}
/** At the base, in place: the stash at its new rows; what the bag or safe cannot hold into the stash, the stash's into the bag, the rest below. */
export function layOutBase(p: D.SaveDataV1): void {
    p.stash.h = D.stashRows(p.upgraded);
    const stash = D.relayoutInventory(p.stash);
    const loose = [...D.relayoutInventory(p.bag), ...D.relayoutInventory(p.safe)].filter(item => !D.placeItem(p.stash, item));
    overflow(p.stash, [...stash, ...loose].filter(item => !D.placeItem(p.bag, item)));
}
/**
 * A settled profile from before footprints followed the magazine (a backup file's, checked by the v8 rules) laid out
 * again under the current ones. Throws when it cannot; the input is not changed.
 */
export function relayoutProfile(profile: D.SaveDataV1): D.SaveDataV1 {
    const p = structuredClone(profile);
    layOutBase(p);
    return p;
}
