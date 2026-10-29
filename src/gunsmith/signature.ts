/**
 * A gun configuration's signature (#28 M2-10; ART-SPEC 4.2): every installed part as "<mount path>=<id>", sorted, with
 * the art's mount names (side rails side1, side2; the rear grip rearGrip; a base mount). Empty for a factory gun. The
 * raid Runtime publishes it for the gun in hand instead of the part tree, so the view never sees a uid; the art cache keys
 * on it. Pure: the catalog's slot names only.
 */
import type { Slot } from './catalog';
import { magless, type PartNode } from './instance';

/** The art mount of each catalog slot (ART-SPEC 3.3); a second side rail is side2. */
export const MOUNT: Readonly<Record<Slot, string>> = {
    micro: 'micro', top: 'top', under: 'under', side: 'side1', pistolSide: 'pistolSide', bipod: 'bipod',
    muzzle: 'muzzle', barrel: 'barrel', handguard: 'handguard', stock: 'stock', grip: 'rearGrip', mag: 'mag', base: 'mount',
};
const SLOT_OF: Readonly<Record<string, Slot>> = { ...Object.fromEntries(Object.entries(MOUNT).map(([slot, mount]) => [mount, slot as Slot])), side2: 'side' };

/** The art's stand-in for a magazine that is not there (#28 M4-07): in the mag slot it draws nothing, not the factory one. */
export const NO_MAG = 'empty';
/**
 * The parts the art draws for a gun state: its own, and NO_MAG in the mag slot while the gun holds no magazine
 * (instance.ts magless), so its pictures and signature leave the magazine out. Never a stored part.
 */
export function drawnParts(gun: { parts: readonly PartNode[]; magOut?: true } | null | undefined): readonly PartNode[] {
    if (!gun) return [];
    return magless(gun.magOut, gun.parts) ? [...gun.parts, { uid: 'no-mag', id: NO_MAG, slot: 'mag', relief: false, children: [] }] : gun.parts;
}

export function partsSignature(parts: readonly PartNode[]): string {
    const out: string[] = [];
    const walk = (nodes: readonly PartNode[], path: string) => {
        let sides = 0;
        for (const n of nodes) {
            const mount = MOUNT[n.slot] === 'side1' ? `side${++sides}` : MOUNT[n.slot], here = path ? `${path}/${mount}` : mount;
            out.push(`${here}=${n.id}`); walk(n.children, here);
        }
    };
    walk(parts, '');
    return out.sort().join(',');
}

/**
 * The part tree a signature describes, parents before children, each part under its mount path as its uid (no real
 * uid is ever needed to draw it). Null for text that is not a signature.
 */
export function partsOfSignature(sig: string): PartNode[] | null {
    if (sig === '') return [];
    const entries = sig.split(',').map(e => { const at = e.lastIndexOf('='); return [e.slice(0, at), e.slice(at + 1)] as const; });
    const nodes = new Map<string, PartNode>(), roots: PartNode[] = [];
    for (const [path, id] of [...entries].sort((a, b) => a[0].split('/').length - b[0].split('/').length)) {
        const steps = path.split('/'), mount = steps.at(-1)!, slot = SLOT_OF[mount];
        if (!path || !id || !slot || nodes.has(path)) return null;
        const node: PartNode = { uid: path, id, slot, relief: false, children: [] }, parent = steps.length > 1 ? nodes.get(steps.slice(0, -1).join('/')) : null;
        if (steps.length > 1 && !parent) return null;
        (parent ? parent.children : roots).push(node); nodes.set(path, node);
    }
    return roots;
}
