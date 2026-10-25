import * as D from './domain';

export type LootEndpoint = 'container' | 'bag' | 'safe';

/** World containers are scoped to one raid and retained in its recovery checkpoint. */
export interface LootContainer {
    id: string;
    runId: string;
    kind: 'crate' | 'corpse';
    name: string;
    x: number;
    y: number;
    inventory: D.Inventory;
}

export interface LootTransfer {
    runId: string;
    containerId: string;
    from: LootEndpoint;
    to: LootEndpoint;
    uid: string;
    x: number;
    y: number;
    rotated?: boolean;
    quantity?: number;
}

/** Quick transfer may merge a partial stack or find an empty footprint; it never swaps. */
export function firstAvailableSlot(to: D.Inventory, item: D.Item): { x: number; y: number; rotated: boolean } | null {
    const def = D.ITEMS[item.id]; if (!def) return null;
    const stack = to.items.find(target => target.uid !== item.uid && target.id === item.id && !!target.relief === !!item.relief && target.qty < def.stack);
    if (stack) return { x: stack.x, y: stack.y, rotated: !!stack.rotated };
    const size = D.itemSize({ id: item.id, gun: item.gun }), orientations = size.w === size.h ? [!!item.rotated] : [!!item.rotated, !item.rotated];
    for (const rotated of orientations) for (let y = 0; y < to.h; y++) for (let x = 0; x < to.w; x++)
        if (D.fits(to, item, x, y, undefined, rotated)) return { x, y, rotated };
    return null;
}

type Placement = { kind: 'place' } | { kind: 'merge'; target: D.Item } | { kind: 'swap'; target: D.Item; rotated: boolean };
const at = (item: D.Item, x: number, y: number, rotated: boolean): D.Item => {
    const result = { ...item, x, y }; if (rotated) result.rotated = true; else delete result.rotated; return result;
};

/** Compute both halves of a swap before either inventory changes. */
function placement(from: D.Inventory, to: D.Inventory, uid: string, x: number, y: number, rotated?: boolean, quantity?: number): Placement | string {
    const selected = from.items.find(item => item.uid === uid);
    if (!selected) return '物品已不在原位置，请重新选择。';
    const def = Object.hasOwn(D.ITEMS, selected.id) ? D.ITEMS[selected.id] : undefined;
    if (!def || !Number.isInteger(selected.qty) || selected.qty < 1 || selected.qty > def.stack) return '物品数据无效，无法移动。';
    const qty = quantity ?? selected.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > selected.qty) return '请选择有效的拆分数量。';
    const size = D.itemSize({ ...selected, rotated: rotated ?? selected.rotated });
    if (!Number.isInteger(x) || !Number.isInteger(y)) return '请选择有效的物品格。';
    if (x < 0 || y < 0 || x + size.w > to.w || y + size.h > to.h) return '物品超出目标格子边界。';
    if (from.items.filter(item => item.uid === uid).length !== 1 ||
        (from !== to && to.items.some(item => item.uid === uid))) return '物品标识冲突，无法移动。';
    if (D.fits(to, selected, x, y, from === to && qty === selected.qty ? uid : undefined, rotated ?? !!selected.rotated)) return { kind: 'place' };
    const overlaps = to.items.filter(item => {
        if (item.uid === uid && qty === selected.qty) return false;
        const other = D.itemSize(item);
        return x < item.x + other.w && x + size.w > item.x && y < item.y + other.h && y + size.h > item.y;
    });
    const target = overlaps.length === 1 ? overlaps[0] : undefined;
    if (!target || target.uid === uid) return '该位置已有其他物品，不能同时交换多件。';
    const targetDef = D.ITEMS[target.id];
    if (!targetDef || !Number.isInteger(target.qty) || target.qty < 1 || target.qty > targetDef.stack) return '物品数据无效，无法移动。';
    if (to.items.filter(item => item.uid === target.uid).length !== 1 || (from !== to && from.items.some(item => item.uid === target.uid))) return '物品标识冲突，无法移动。';
    // Stack semantics stay exact-origin; full stacks and relief mismatches never become swaps.
    if (target.id === selected.id) {
        if (target.x !== x || target.y !== y) return '该位置已有其他物品，请对准堆叠左上角。';
        if (!!target.relief !== !!selected.relief) return '救济物资不能与普通物资合并。';
        if (target.qty >= def.stack) return `堆叠上限为 ${def.stack}，目标已满。`;
        return { kind: 'merge', target };
    }
    if (qty !== selected.qty) return '拆分物品不能交换，请选择空位。';
    const remaining = { ...from, items: from.items.filter(item => item.uid !== uid && (from !== to || item.uid !== target.uid)) };
    if (from === to) remaining.items.push(at(selected, x, y, rotated ?? !!selected.rotated));
    const shape = D.itemSize({ id: target.id, gun: target.gun }), orientations = shape.w === shape.h ? [!!target.rotated] : [!!target.rotated, !target.rotated];
    for (const direction of orientations) if (D.fits(remaining, target, selected.x, selected.y, undefined, direction))
        return { kind: 'swap', target, rotated: direction };
    return '原位置放不下交换物品，请腾出空间。';
}

/** Validate placement, partial merging or a reciprocal swap without changing either inventory.
 * null means the operation is allowed, not that the target is empty. Automatic split-to-empty callers must also
 * use D.fits without excluding the source uid; otherwise a second split can silently merge into the first stack. */
export function placementError(from: D.Inventory, to: D.Inventory, uid: string, x: number, y: number, rotated?: boolean, quantity?: number): string | null {
    const result = placement(from, to, uid, x, y, rotated, quantity); return typeof result === 'string' ? result : null;
}

/** Exact placement, partial stack merge, or whole-item swap. A failed preview has no side effects. */
export function moveQuantity(from: D.Inventory, to: D.Inventory, uid: string, x: number, y: number, rotated?: boolean, quantity?: number): boolean {
    const plan = placement(from, to, uid, x, y, rotated, quantity); if (typeof plan === 'string') return false;
    const item = from.items.find(i => i.uid === uid)!, requested = quantity ?? item.qty;
    if (plan.kind === 'swap') {
        const replacement = at(plan.target, item.x, item.y, plan.rotated), placed = at(item, x, y, rotated ?? !!item.rotated);
        const fromIndex = from.items.indexOf(item), toIndex = to.items.indexOf(plan.target);
        from.items[fromIndex] = replacement; to.items[toIndex] = placed; return true;
    }
    if (plan.kind === 'merge') {
        const target = plan.target;
        const moved = Math.min(requested, D.ITEMS[item.id].stack - target.qty);
        target.qty += moved; item.qty -= moved;
        if (!item.qty) from.items.splice(from.items.indexOf(item), 1);
        return true;
    }
    const placed = { ...item, x, y, qty: requested };
    if (rotated ?? item.rotated) placed.rotated = true; else delete placed.rotated;
    if (requested < item.qty) {
        // Allocate a fresh identity through the domain allocator; the source keeps its identity and orientation.
        const split = D.createInventory(6, 5); D.addItem(split, item.id, requested, !!item.relief);
        placed.uid = split.items[0].uid; item.qty -= requested;
    } else from.items.splice(from.items.indexOf(item), 1);
    to.items.push(placed);
    return true;
}
