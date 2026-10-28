/**
 * The shape of one gunsmith art record (ART-SPEC section 7.2), as scripts/gunsmith-assets.mjs writes it into
 * gunsmith-art-meta.ts. Coordinates are whole pixels from the image's top-left, except `bore` and a tip's y, which may
 * be half pixels (a one-pixel barrel row r is written r + 0.5).
 */
export type ArtOutput = 'held' | 'inventory' | 'bench' | 'icon24' | 'icon32';
export type ArtPoint = readonly [number, number];
export interface GunsmithArt {
    w: number; h: number;
    output: ArtOutput;
    /** The gun of a receiver or factory part (or a part drawn for one gun only). */
    gun?: string;
    /** The attachment id of a part, or the item id of an icon. */
    item?: string;
    role: 'receiver' | 'factory' | 'part' | 'glove' | 'icon';
    /** The mount it sits on (ART-SPEC 3.3), or a glove's place. */
    slot?: string;
    anchor?: ArtPoint;
    mounts?: Readonly<Record<string, ArtPoint>>;
    /** Held receivers: the pivot, the barrel's centre row, the forward offset. */
    grip?: ArtPoint; bore?: number; forward?: number;
    tip?: ArtPoint; hand?: ArtPoint; beam?: ArtPoint;
    /** 'aboveReceiver' draws a part over the receiver (the pistol's extended magazine). */
    layer?: string;
    /** The image is the gun's whole canvas, placed at the origin (the approved carbine split into layers). */
    wholeCanvasLayer?: boolean;
    /** The carbine's factory handguard has the front glove painted on. */
    embeddedFrontGlove?: boolean;
    wholeGunCanvas?: boolean;
}
