import * as D from './domain';

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const identityOrder = (a: D.Item, b: D.Item) => compareText(a.id, b.id) || Number(!!a.relief) - Number(!!b.relief) || compareText(a.uid, b.uid);
/** Largest footprint first; a gun counts at its own size (parts may grow it). */
function packingOrder(a: D.Item, b: D.Item): number {
    const da = D.itemSize({ id: a.id, gun: a.gun }), db = D.itemSize({ id: b.id, gun: b.gun });
    return db.w * db.h - da.w * da.h || Math.max(db.w, db.h) - Math.max(da.w, da.h) || identityOrder(a, b);
}
function valid(inventories: D.Inventory[]): boolean {
    const seen = new Set<string>();
    return inventories.every(inv => Number.isInteger(inv.w) && inv.w > 0 && Number.isInteger(inv.h) && inv.h > 0 && inv.items.every(item => {
        const def = Object.hasOwn(D.ITEMS, item.id) ? D.ITEMS[item.id] : undefined;
        if (!def || !item.uid || seen.has(item.uid) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > def.stack) return false;
        seen.add(item.uid); return D.fits(inv, item, item.x, item.y, item.uid, !!item.rotated);
    }));
}
/** Preserve all item fields and its UID when a remaining stack needs a new footprint. */
function place(inv: D.Inventory, item: D.Item, preferredRotation = !!item.rotated): boolean {
    const size = D.itemSize({ id: item.id, gun: item.gun }), directions = size.w === size.h ? [preferredRotation] : [preferredRotation, !preferredRotation];
    for (const rotated of directions) for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++) {
        if (!D.fits(inv, item, x, y, undefined, rotated)) continue;
        const placed = { ...item, x, y }; if (rotated) placed.rotated = true; else delete placed.rotated;
        inv.items.push(placed); return true;
    }
    return false;
}
function mergeInto(items: D.Item[], item: D.Item): number {
    let left = item.qty;
    for (const target of items) {
        if (target.id !== item.id || !!target.relief !== !!item.relief) continue;
        const amount = Math.min(left, D.ITEMS[item.id].stack - target.qty);
        target.qty += amount; left -= amount; if (!left) break;
    }
    return left;
}

/** All bag items or none; existing stash coordinates, equipment and safe contents stay intact. */
export function transferBagToStash(profile: Pick<D.SaveDataV1, 'bag' | 'stash'>): boolean {
    if (!valid([profile.bag, profile.stash])) return false;
    const stash = structuredClone(profile.stash);
    for (const item of [...profile.bag.items].sort(packingOrder)) {
        const qty = mergeInto(stash.items, item);
        if (qty && !place(stash, { ...item, qty })) return false;
    }
    profile.stash.items = stash.items; profile.bag.items = []; return true;
}

/** Merge compatible stacks, then pack largest footprints first. Failure preserves the original layout. */
export function organizeStash(profile: Pick<D.SaveDataV1, 'stash'>): boolean {
    if (!valid([profile.stash])) return false;
    const merged: D.Item[] = [];
    for (const item of [...profile.stash.items].sort(identityOrder)) {
        const qty = mergeInto(merged, item); if (qty) merged.push({ ...item, qty });
    }
    const stash = { ...profile.stash, items: [] as D.Item[] };
    for (const item of merged.sort(packingOrder)) if (!place(stash, item, false)) return false;
    profile.stash.items = stash.items; return true;
}
