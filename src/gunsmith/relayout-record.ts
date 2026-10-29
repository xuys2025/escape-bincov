/**
 * A session record v8 to v9 (#28 M3-12): laid out again under the footprints that follow the magazine (relayout.ts has
 * the rules and the base). In a raid, what the carried bag or safe cannot hold lies on the ground under the player, and
 * what a crate or corpse cannot hold on the ground at that container, as a drop leaves it (raid-runtime dropItem): a gun
 * as itself under its uid, anything else new ground loot under the raid's next entity uid. The profile's safe stays the
 * raid safe's copy, and what the stash cannot hold lies in its overflow. Deterministic: the only serials are the
 * record's own counter. Kept apart from relayout.ts, which profile-codec imports, because entityUid's module imports
 * profile-codec.
 */
import * as D from '../domain';
import type { SessionRecord } from '../recovery-store';
import type { LootState } from '../checkpoint';
import type { LootContainer } from '../loot';
import { entityUid } from '../expansion-state';
import { layOutBase, layoutRefused, overflow } from './relayout';

type Json = Record<string, any>;
type Uid = () => string;
const toGround = (item: D.Item, at: { x: number; y: number }, uid: Uid): LootState =>
    ({ uid: item.gun ? item.uid : uid(), id: item.id, qty: item.qty, x: at.x, y: at.y, relief: !!item.relief, ...(item.gun ? { gun: item.gun } : {}) });
/** A raid's world: what a crate or corpse cannot hold lies at it. */
function relayoutWorld(loot: LootState[], containers: readonly LootContainer[], uid: Uid) {
    for (const c of containers) for (const item of D.relayoutInventory(c.inventory)) loot.push(toGround(item, c, uid));
}
/** A raid's carried bag and safe: what they cannot hold lies under the player. */
function relayoutCarried(loadout: D.RunLoadout, player: { x: number; y: number }, loot: LootState[], uid: Uid) {
    for (const item of [...D.relayoutInventory(loadout.bag), ...D.relayoutInventory(loadout.safe)]) loot.push(toGround(item, player, uid));
}

/**
 * A checked record v8 as v9, laid out under the current footprints; `original` is its stored text, kept as
 * layoutBackup, null when it was migrated from v2 to v7 just before (their bytes are in gunsBackup or migrationBackup).
 * Throws when it cannot; the input is not changed. decodeSession checks the result again by the v9 rules.
 */
export function migrateLayout(record: Json, original: string | null): SessionRecord {
    if (record.version !== 8 || (original !== null && typeof original !== 'string')) return layoutRefused();
    const out = structuredClone(record), p = out.profile as D.SaveDataV1;
    const classic = out.raid, layered = out.expansion?.raid ?? null;
    if (classic) {
        const uid = () => `entity-${classic.nextEntity++}`;
        relayoutCarried(classic.loadout, classic.player, classic.loot, uid);
        relayoutWorld(classic.loot, classic.containers ?? [], uid);
    }
    if (layered) {
        const uid = () => entityUid(layered, layered.nextEntity++);
        relayoutCarried(layered.loadout, layered.player, layered.maps[layered.currentMap].loot, uid);
        for (const map of Object.values(layered.maps) as Json[]) relayoutWorld(map.loot, map.containers, uid);
    }
    if (classic || layered) {
        // Live: the bag is empty (the raid carries it) and the profile's safe is the carried safe's copy.
        p.stash.h = D.stashRows(p.upgraded);
        p.safe = structuredClone((classic ?? layered).loadout.safe);
        overflow(p.stash, [...D.relayoutInventory(p.stash), ...D.relayoutInventory(p.bag)]);
    } else layOutBase(p);
    out.version = 9;
    out.layoutBackup = original;
    return out as SessionRecord;
}
