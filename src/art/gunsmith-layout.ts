/**
 * Gunsmith art layout (#28 M2-10; ART-SPEC section 4): where each of Sol's images goes when a gun's configuration is
 * drawn in one output (H held, I inventory cell, W workbench). Pure: it reads the art metadata and the gun's part tree,
 * never an image. Each child image is placed at its parent's mount minus its own anchor, in whole pixels; the frame is
 * the union of all images moved to (0, 0). gunsmith-compose.ts draws the result. The rules reproduce Sol's approved
 * preview assemblies (tests/fixtures/gunsmith-assemblies.json): replaced parts (stock, rear grip, magazine, barrel,
 * handguard, the factory rear sight) fall back to the factory image, a part with no image in an output keeps the
 * factory one (the held rear grips), the muzzle sits on the barrel when there is one, and the held output adds gloves.
 */
import { ATTACHMENTS } from '../gunsmith/catalog';
import type { PartNode } from '../gunsmith/instance';
import { MOUNT, partsSignature } from '../gunsmith/signature';
import { GUNSMITH_ART, GUNSMITH_ART_REVISION, GUNSMITH_VIRTUAL } from './gunsmith-art-meta';
import type { ArtPoint, GunsmithArt } from './gunsmith-art-types';

export type ArtCode = 'h' | 'i' | 'w';
/** One image of a layout, top-left at (x, y) on the layout's canvas. `key` is a GUNSMITH_ART key (or a virtual one). */
export interface ArtLayer { key: string; label: string; x: number; y: number; w: number; h: number }
export interface ArtLayout {
    /** The cache key without the holder's kind: gs:<output>:<gun>:<signature>:r<art revision>. */
    key: string;
    w: number; h: number;
    /** Back to front. */
    layers: ArtLayer[];
    /** The muzzle: the right edge of the outermost column at the barrel's row (a half pixel for the old carbine). */
    tip: ArtPoint | null;
    /** Held only: the pivot, the barrel's centre row and the forward offset, from the receiver; the front hand. */
    grip?: ArtPoint; bore?: number; forward?: number; hand?: ArtPoint;
    /** A laser's or light's emitting point, when one is on the gun. */
    beam?: ArtPoint;
}

/** Slots whose part replaces a factory part, in Sol's order, with the factory image's name stem. */
const REPLACED: readonly (readonly [string, string])[] = [['stock', 'stock'], ['rearGrip', 'reargrip'], ['mag', 'mag'], ['barrel', 'barrel'], ['handguard', 'handguard'], ['top', 'top']];
/** Default layer order, back to front (ART-SPEC 3.4); a part marked aboveReceiver goes just over the receiver. */
const ORDER: Readonly<Record<string, number>> = {
    stock: 0, rearGrip: 1, mag: 2, barrel: 3, receiver: 4, handguard: 5, under: 6, bipod: 6, mount: 7, top: 8,
    muzzle: 9, side1: 10, side2: 10, pistolSide: 10, 'glove-rear': 11, 'glove-front': 12, 'glove-foregrip': 12,
};
/**
 * The old guns' inventory images are the procedural ones (art/inventory.ts), cut into layers as Sol cut them (the
 * manifest's `virtual`, #28 M3-03): the pistol's and the double-barrel's whole receivers, the carbine's receiver,
 * factory handguard and factory barrel. gunsmith-compose.ts paints them.
 */
export const artOf = (key: string): GunsmithArt | undefined => GUNSMITH_ART[key] ?? GUNSMITH_VIRTUAL[key];
/** A part's image in an output: the variant drawn for this gun first (gs-h04-h-akb103), else the shared one. */
const partArt = (id: string, code: ArtCode, gun: string) => {
    const shared = `gs-${id.toLowerCase()}-${code}`, own = `${shared}-${gun}`;
    return artOf(own) ? own : artOf(shared) ? shared : null;
};

interface Node { key: string; label: string; art: GunsmithArt; x: number; y: number; parent: Node | null }
const add = (p: ArtPoint, x: number, y: number): [number, number] => [p[0] + x, p[1] + y];

/**
 * The layout of `gun` with `parts` in output `code`; null when the gun has no receiver image there (old art stays).
 * `gloves: false` leaves the held output's hands off: the gun alone, as it lies on the ground or shows on the HUD card.
 */
export function gunArtLayout(gun: string, parts: readonly PartNode[], code: ArtCode, gloves = true): ArtLayout | null {
    const rootKey = `gs-${gun}-receiver-${code}`, rootArt = artOf(rootKey);
    if (!rootArt) return null;
    const root: Node = { key: rootKey, label: 'receiver', art: rootArt, x: 0, y: 0, parent: null };
    const nodes: Node[] = [root], byUid = new Map<string, Node>();
    const attach = (key: string, label: string, parent: Node, at: ArtPoint): Node => {
        const art = artOf(key)!, anchor = art.anchor ?? [0, 0];
        const node: Node = { key, label, art, x: parent.x + at[0] - anchor[0], y: parent.y + at[1] - anchor[1], parent };
        nodes.push(node); return node;
    };
    // Replaced slots on the receiver: the installed part's image, else the factory image, else nothing.
    const done = new Set<string>();
    for (const [mount, stem] of REPLACED) {
        const at = rootArt.mounts?.[mount];
        if (!at) continue;
        const part = parts.find(p => MOUNT[p.slot] === mount), key = part && partArt(part.id, code, gun), factory = `gs-${gun}-${stem}-factory-${code}`;
        if (part && key) { byUid.set(part.uid, attach(key, mount, root, at)); done.add(part.uid); }
        else if (artOf(factory)) attach(factory, mount, root, at);
        // A replacing part with no image here (the held rear grips) is drawn as the factory part; its children too have no place.
        if (part && !key) done.add(part.uid);
    }
    // Added parts, parents before children. The muzzle goes on the barrel when one is drawn (ART-SPEC 3.4).
    const walk = (list: readonly PartNode[], parent: Node) => {
        let side = 0;
        for (const p of list) {
            let node = byUid.get(p.uid) ?? null;
            if (!done.has(p.uid)) {
                let mount = MOUNT[p.slot];
                if (mount === 'side1') mount = `side${++side}`;
                const key = partArt(p.id, code, gun), barrel = mount === 'muzzle' ? nodes.find(n => n.parent === parent && n.label === 'barrel' && n.art.mounts?.muzzle) : undefined;
                const holder = barrel ?? parent, at = holder.art.mounts?.[mount];
                // An optic is labelled top on either sight mount, as in Sol's records.
                if (key && at) { node = attach(key, mount === 'micro' ? 'top' : mount, holder, at); byUid.set(p.uid, node); }
            }
            if (node) walk(p.children, node);
        }
    };
    walk(parts, root);
    // Held: the rear glove on the grip unless the receiver has it painted on (the approved carbine); the front hand on the
    // foregrip, else on the handguard (no glove when its image has one painted on), else the receiver's hand.
    let hand: ArtPoint | undefined;
    if (code === 'h') {
        const glove = (which: string, at: ArtPoint) => {
            if (!gloves) return;
            const key = `gs-glove-${which}-h`, art = artOf(key)!, anchor = art.anchor ?? [0, 0];
            nodes.push({ key, label: `glove-${which}`, art, x: at[0] - anchor[0], y: at[1] - anchor[1], parent: root });
        };
        if (!rootArt.wholeCanvasLayer && rootArt.grip) glove('rear', rootArt.grip);
        const fore = nodes.find(n => n.label === 'under' && n.art.hand), guard = nodes.find(n => n.label === 'handguard' && n.art.hand);
        if (fore) { hand = add(fore.art.hand!, fore.x, fore.y); glove('foregrip', hand); }
        else if (guard) { hand = add(guard.art.hand!, guard.x, guard.y); if (!guard.art.embeddedFrontGlove) glove('front', hand); }
        else if (rootArt.hand) hand = rootArt.hand;
    }
    const lo = [Math.min(...nodes.map(n => n.x)), Math.min(...nodes.map(n => n.y))];
    const hi = [Math.max(...nodes.map(n => n.x + n.art.w)), Math.max(...nodes.map(n => n.y + n.art.h))];
    const shift = (p: ArtPoint): [number, number] => [p[0] - lo[0], p[1] - lo[1]];
    const rank = (n: Node) => n.art.layer === 'aboveReceiver' ? 4.5 : ORDER[n.label] ?? 8;
    const layers = [...nodes].sort((a, b) => rank(a) - rank(b)).map(n => ({ key: n.key, label: n.label, x: n.x - lo[0], y: n.y - lo[1], w: n.art.w, h: n.art.h }));
    const tipNode = nodes.find(n => n.label === 'muzzle' && n.art.tip) ?? nodes.find(n => n.label === 'barrel' && n.art.tip) ?? root;
    const device = nodes.find(n => n.art.beam);
    const layout: ArtLayout = {
        key: `gs:${code}${gloves ? '' : '-bare'}:${gun}:${partsSignature(parts)}:r${GUNSMITH_ART_REVISION}`, w: hi[0] - lo[0], h: hi[1] - lo[1], layers,
        tip: tipNode.art.tip ? shift(add(tipNode.art.tip, tipNode.x, tipNode.y)) : null,
    };
    if (device) layout.beam = shift(add(device.art.beam!, device.x, device.y));
    if (code === 'h') {
        if (rootArt.grip) layout.grip = shift(rootArt.grip);
        if (rootArt.bore !== undefined) layout.bore = rootArt.bore - lo[1];
        if (rootArt.forward !== undefined) layout.forward = rootArt.forward;
        if (hand) layout.hand = shift(hand);
    }
    return layout;
}

/**
 * The box, around the receiver's top-left corner, that every picture of `gun` in output `code` fits in: the factory
 * gun, each part with an image alone, and each with every child it carries (a muzzle on a barrel, rail parts on a
 * handguard, an optic on a base). Parts sit on fixed mounts and children only on their parent, so these builds reach
 * every edge any build reaches. The workbench draws the gun at one place and scale inside it: a new part then changes
 * only its own pixels. Null when the gun has no receiver image there.
 */
export function artFrame(gun: string, code: ArtCode): { x: number; y: number; w: number; h: number } | null {
    const ids = Object.keys(ATTACHMENTS).filter(id => { const g = ATTACHMENTS[id].guns as readonly string[] | null; return (!g || g.includes(gun)) && partArt(id, code, gun); });
    const node = (id: string, children: PartNode[] = []): PartNode => ({ uid: id, id, slot: ATTACHMENTS[id].mount, relief: false, children });
    const builds: PartNode[][] = [[], ...ids.map(id => [node(id)])];
    for (const p of ids) for (const c of ids) {
        if (ATTACHMENTS[p].mount === 'barrel' && ATTACHMENTS[c].mount === 'muzzle') builds.push([node(p), node(c)]);
        else if (c !== p && ATTACHMENTS[p].provides[ATTACHMENTS[c].mount]) builds.push([node(p, [node(c)])]);
    }
    let box: [number, number, number, number] | null = null;
    for (const parts of builds) {
        const l = gunArtLayout(gun, parts, code), r = l?.layers.find(x => x.label === 'receiver');
        if (!l || !r) continue;
        const e = [-r.x, -r.y, l.w - r.x, l.h - r.y];
        box = box ? [Math.min(box[0], e[0]), Math.min(box[1], e[1]), Math.max(box[2], e[2]), Math.max(box[3], e[3])] : [e[0], e[1], e[2], e[3]];
    }
    // || 0: a receiver at the picture's edge gives -0.
    return box && { x: box[0] || 0, y: box[1] || 0, w: box[2] - box[0], h: box[3] - box[1] };
}
