/**
 * Gunsmith art compositing (#28 M2-10; ART-SPEC section 4): draws a gunsmith-layout.ts layout from Sol's images with
 * Canvas 2D, whole-pixel moves only and no smoothing, and keeps the results in bounded caches keyed by output, gun,
 * configuration and art revision (never a uid). The 115 images (24 KB of PNG) are decoded once per page at boot
 * (loadGunsmithArt), so drawing stays synchronous; until they are decoded every entry returns null and callers keep the
 * old art. Guns without images in an output (the old pistol and shotgun outside the workbench) also return null.
 */
import type { PartNode } from '../gunsmith/instance';
import { GUNSMITH_ART_URLS } from './gunsmith-assets';
import { artFrame, artOf, gunArtLayout, type ArtCode, type ArtLayout } from './gunsmith-layout';
import { GUNSMITH_VIRTUAL } from './gunsmith-art-meta';
import { inventoryArtSize, paintInventoryItem } from './inventory';
import type { ItemArtId } from './items';
import { installGunsmithArt, type ArtBox } from './gunsmith-hooks';
import { partsOfSignature } from '../gunsmith/signature';

const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | null = null;
/** Decode every gunsmith image once; a failed image is skipped (layouts that need it then return null). */
export function loadGunsmithArt(): Promise<void> {
    return loading ??= Promise.all(Object.entries(GUNSMITH_ART_URLS).map(async ([key, url]) => {
        const img = new Image(); img.src = url;
        try { await img.decode(); images.set(key, img); } catch { /* left out: its layouts fall back to the old art */ }
    })).then(() => installGunsmithArt({
        icon: (id, size) => {
            const own = gunsmithIconImage(id, size), small = size === 32 && !own ? gunsmithIconImage(id, 24) : null;
            return own ? { img: own, x: 0, y: 0 } : small ? { img: small, x: 4, y: 4 } : null;
        },
        inventory: id => {
            const layout = gunArtLayout(id, [], 'i');
            return layout ? drawGunLayout(layout) : gunsmithIconImage(id, 24);
        },
        configured: gunInventoryArt, bench: gunBenchArt, releaseBench: releaseBenchArt,
        benchFrame: gun => { if (!frames.has(gun)) frames.set(gun, artFrame(gun, 'w')); return frames.get(gun)!; },
        side: id => {
            if (sides.has(id)) return sides.get(id)!;
            // The old guns' approved held pictures have the hands painted on (wholeCanvasLayer, #28 M3-03): their side view
            // is Sol's bare picture (M3-07), and without one they keep their item icons.
            const old = artOf(`gs-${id}-receiver-h`)?.wholeCanvasLayer, layout = old && !artOf(`gs-${id}-bare-h`) ? null : gunArtLayout(id, [], 'h', false);
            const canvas = layout && drawGunLayout(layout);
            sides.set(id, canvas ?? null);
            return canvas ?? null;
        },
        held: (gun, sig) => {
            const parts = partsOfSignature(sig), layout = parts && gunArtLayout(gun, parts, 'h');
            if (!layout?.grip || !layout.tip || layout.bore === undefined) return null;
            const canvas = drawGunLayout(layout);
            return canvas && { key: layout.key, canvas, grip: layout.grip, forward: layout.forward ?? 0, hand: layout.hand ?? null, tip: layout.tip, bore: layout.bore };
        },
    }));
}

/** The workbench frame of each gun type, kept for the page. */
const frames = new Map<string, ArtBox | null>();
/** The side views of the gunsmith guns (the factory held picture without hands), one per gun type, kept for the page. */
const sides = new Map<string, HTMLCanvasElement | null>();
const virtual = new Map<string, HTMLCanvasElement>();
/**
 * An old gun's inventory layer (#28 M3-03): its procedural picture cut by the manifest's rectangles (VirtualArt), once
 * per page. The approved stacks give the picture back pixel for pixel (Sol's check, and gunsmith-bench A1).
 */
function virtualLayer(key: string): HTMLCanvasElement | null {
    const v = GUNSMITH_VIRTUAL[key];
    if (!v) return null;
    if (virtual.has(key)) return virtual.get(key)!;
    const [w, h] = inventoryArtSize(v.sourceKey), canvas = (cw: number, ch: number, paint: (c: CanvasRenderingContext2D) => void) => {
        const el = document.createElement('canvas'); el.width = cw; el.height = ch;
        const c = el.getContext('2d')!; c.imageSmoothingEnabled = false; paint(c); return el;
    };
    const original = canvas(w, h, c => paintInventoryItem(c, v.sourceKey as ItemArtId));
    let out: HTMLCanvasElement;
    if (v.rect) {
        const [x, y, rw, rh] = v.rect;
        out = v.wholeCanvasLayer ? canvas(w, h, c => c.drawImage(original, x, y, rw, rh, x, y, rw, rh)) : canvas(rw, rh, c => c.drawImage(original, x, y, rw, rh, 0, 0, rw, rh));
    } else out = canvas(w, h, c => {
        c.drawImage(original, 0, 0);
        for (const [x, y, rw, rh] of v.clearRects ?? []) c.clearRect(x, y, rw, rh);
        for (const [color, x, y, rw, rh] of v.fillRects ?? []) { c.fillStyle = color; c.fillRect(x, y, rw, rh); }
    });
    virtual.set(key, out);
    return out;
}
const source = (key: string): CanvasImageSource | null => images.get(key) ?? virtualLayer(key);

/** Draw a layout on a new canvas, back to front; null before the images are decoded or without a 2D context. */
export function drawGunLayout(layout: ArtLayout): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas'); canvas.width = layout.w; canvas.height = layout.h;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.imageSmoothingEnabled = false;
    for (const l of layout.layers) {
        const img = source(l.key);
        if (!img || !artOf(l.key)) return null;
        c.drawImage(img, l.x, l.y);
    }
    return canvas;
}

/** A least-recently-used map with a fixed size; `drop` sees what falls out (ART-SPEC 4.3). */
class Lru<V> {
    private map = new Map<string, V>();
    constructor(readonly limit: number, private drop: (value: V, key: string) => void = () => {}) {}
    get size() { return this.map.size; }
    get(key: string): V | undefined {
        const v = this.map.get(key);
        if (v !== undefined) { this.map.delete(key); this.map.set(key, v); }
        return v;
    }
    set(key: string, value: V) {
        this.map.delete(key); this.map.set(key, value);
        while (this.map.size > this.limit) { const [k, v] = this.map.entries().next().value!; this.map.delete(k); this.drop(v, k); }
    }
    clear() { for (const [k, v] of this.map) this.drop(v, k); this.map.clear(); }
}

/** An inventory (I) or workbench (W) picture: its data URL, size and the receiver's top-left corner on it. */
interface GunPicture { key: string; url: string; w: number; h: number; origin: readonly [number, number] }
/** I: 64 data URLs per page; W: 4 (current, candidate, two presets), dropped when the workbench closes. */
const inventory = new Lru<GunPicture>(64), bench = new Lru<GunPicture>(4);
function picture(cache: Lru<GunPicture>, gun: string, parts: readonly PartNode[], code: ArtCode): GunPicture | null {
    const layout = gunArtLayout(gun, parts, code);
    if (!layout) return null;
    const hit = cache.get(layout.key);
    if (hit) return hit;
    const canvas = drawGunLayout(layout);
    if (!canvas) return null;
    const r = layout.layers.find(l => l.label === 'receiver');
    const pic = { key: layout.key, url: canvas.toDataURL(), w: layout.w, h: layout.h, origin: [r?.x ?? 0, r?.y ?? 0] as const };
    cache.set(layout.key, pic);
    return pic;
}
/** The inventory picture of `gun` built with `parts`; null without images for it (keep the old art). */
const gunInventoryArt = (gun: string, parts: readonly PartNode[]) => picture(inventory, gun, parts, 'i');
/** The workbench picture of `gun` built with `parts`; null without images for it. */
const gunBenchArt = (gun: string, parts: readonly PartNode[]) => picture(bench, gun, parts, 'w');
/** Close of the workbench: its pictures go (ART-SPEC 4.3). */
const releaseBenchArt = () => bench.clear();
/** The cache sizes, for the resource checks of M2-10 and M5-02. */
export const gunArtCaches = () => ({ inventory: inventory.size, bench: bench.size });

/** The decoded square icon of a gun or part; null when there is none or before decoding. */
const gunsmithIconImage = (item: string, size: 24 | 32): HTMLImageElement | null => images.get(`gs-${item.toLowerCase()}-q${size}`) ?? null;
