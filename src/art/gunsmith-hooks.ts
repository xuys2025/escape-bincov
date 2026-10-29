/**
 * How Sol's gunsmith art (#28 M2-10) reaches the painters and panels: art/gunsmith-compose.ts fills these hooks at boot
 * once its images are decoded. Modules on the unit tests' import graph (item art, the station and tab-page panels)
 * import only this file, never the PNGs. Before the images are decoded, and in unit tests, `gunsmithArt` is null and
 * every caller keeps the old art.
 */
import type { PartNode } from '../gunsmith/instance';

/** A picture as a data URL, its size in pixels and where its receiver's top-left corner sits on it. */
export interface ArtPicture { url: string; w: number; h: number; origin: readonly [number, number] }
/** A box around a receiver's top-left corner, in picture pixels. */
export interface ArtBox { x: number; y: number; w: number; h: number }
export interface GunsmithArtHooks {
    /** Sol's square icon of a gun or part at `size`, with its offset (a part's 24 px icon centred in 32); null without one. */
    icon(id: string, size: 24 | 32): { img: CanvasImageSource; x: number; y: number } | null;
    /** The factory inventory picture of a gunsmith gun, or a part's icon, to paint into its inventory canvas; null without one. */
    inventory(id: string): CanvasImageSource | null;
    /** The inventory picture of `gun` built with `parts` (I); null without images for that gun. */
    configured(gun: string, parts: readonly PartNode[]): ArtPicture | null;
    /** The workbench picture (W); null without images for that gun. */
    bench(gun: string, parts: readonly PartNode[]): ArtPicture | null;
    /** The box every workbench picture of `gun` fits in, around its receiver; null without images for that gun. */
    benchFrame(gun: string): ArtBox | null;
    /** The workbench closed: its pictures go (ART-SPEC 4.3). */
    releaseBench(): void;
    /**
     * The held picture (H) of `gun` with the parts its signature names, a new canvas each call (the raid view caches it):
     * the pivot, forward offset, front hand, muzzle tip and barrel row; null without images for that gun.
     */
    held(gun: string, sig: string): HeldPicture | null;
    /**
     * The whole gun from the side: its factory held picture without the hands, for the ground and the HUD weapon card,
     * where Sol's square close-ups do not read (maintainer, 2026-10-27). Null for items without held images, and for the
     * old guns, whose approved held pictures have the hands painted on.
     */
    side(id: string): HTMLCanvasElement | null;
}
export interface HeldPicture { key: string; canvas: HTMLCanvasElement; grip: readonly [number, number]; forward: number; hand: readonly [number, number] | null; tip: readonly [number, number]; bore: number }
export let gunsmithArt: GunsmithArtHooks | null = null;
export function installGunsmithArt(hooks: GunsmithArtHooks) { gunsmithArt = hooks; }
