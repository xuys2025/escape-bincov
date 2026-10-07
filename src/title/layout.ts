/** Logical artwork coordinates; imported source images remain immutable. */
export const SCENE_W = 960, SCENE_H = 540;
export const GROUPS = {
    // Fixed horizon and no vertical camera travel. Depth is a small horizontal cue,
    // not an orbit of the room when the pointer crosses the menu.
    far: { x: 0, y: 0 }, harbor: { x: 0, y: 0 }, room: { x: 1, y: 0 }, lamp: { x: 1, y: 0 }, desk: { x: 2, y: 0 }, chair: { x: 3, y: 0 }, fore: { x: 4, y: 0 },
} as const;
export type GroupName = keyof typeof GROUPS;
export type LayerSpec = {
    key: string;
    group: GroupName;
    x: number;
    y: number;
    w: number;
    h: number;
    frames?: number;
    html?: boolean;
    /** Texels per logical pixel. Grid layers use 2, so one 640x360 art pixel is exactly 3x3 texels. */
    res?: number;
};
const layers = {
    sky: { key: 'title-sky-ready', group: 'far', x: -2, y: -2, w: 964, h: 544, res: 2 },
    harbor: { key: 'title-harbor-ready', group: 'harbor', x: -4, y: -3, w: 968, h: 546, res: 2 },
    fogHigh: { key: 'title-fog-high-new', group: 'harbor', x: 0, y: 158, w: 320, h: 44 },
    fogLow: { key: 'title-fog-low-new', group: 'harbor', x: 0, y: 200, w: 384, h: 40 },
    boat: { key: 'title-boat-master-v3', group: 'harbor', x: 337, y: 62, w: 164, h: 232, res: 2 },
    mooring: { key: 'title-mooring-master-v3', group: 'harbor', x: 344, y: 232, w: 152, h: 62, frames: 3 },
    pierFront: { key: 'title-pier-master-v3', group: 'harbor', x: 0, y: 28, w: 960, h: 540, res: 2 },
    room: { key: 'title-room-ready', group: 'room', x: -6, y: -4, w: 972, h: 548, res: 2 },
    lamp: { key: 'title-lamp-master-v3', group: 'lamp', x: 551, y: -5, w: 148, h: 116, frames: 5, res: 2 },
    desk: { key: 'title-desk-master-v3', group: 'desk', x: 382, y: 232, w: 588, h: 314, res: 2 },
    light: { key: 'title-light-new', group: 'desk', x: 452, y: 96, w: 360, h: 300 },
    radioFx: { key: 'title-radio-fx-new', group: 'desk', x: 0, y: 0, w: 16, h: 8, frames: 4 },
    chair: { key: 'title-chair-master-v3', group: 'chair', x: 234, y: 365, w: 352, h: 182, res: 2 },
    fore: { key: 'title-fore-master-v3', group: 'fore', x: 785, y: -11, w: 200, h: 562, res: 2 },
    sparks: { key: 'title-sparks-new', group: 'harbor', x: 0, y: 0, w: 8, h: 4, frames: 8 },
    rain: { key: 'title-rain-new', group: 'harbor', x: 0, y: 0, w: 6, h: 16, frames: 3 },
    wordmark: { key: 'title-wordmark-industrial-v5', group: 'fore', x: 0, y: 0, w: 144, h: 72, html: true },
} satisfies Record<string, LayerSpec>;
export type LayerName = keyof typeof layers;
export const LAYERS: Record<LayerName, LayerSpec> = layers;
export const OPENINGS = {
    door: { x: 343, y: 30, w: 161, h: 371 }, window: { x: 736, y: 56, w: 204, h: 214 },
    windowLeft: { x: 608, y: 75, w: 109, h: 178 }, windowTopLeft: { x: 606, y: 0, w: 112, h: 57 },
    windowTopRight: { x: 735, y: 0, w: 206, h: 33 }, doorGlass: { x: 293, y: 61, w: 26, h: 162 },
} as const;
export const ANCHORS = {
    lampPivot: { x: 626, y: 0 }, lampBulb: { x: 625, y: 99 }, radioDial: { x: 659, y: 305 }, radioLed: { x: 626, y: 303 },
    bollard: { x: 370, y: 307 }, boatBow: { x: 467, y: 240 }, horizon: 196,
} as const;
/** Registered bright pixels on the imported harbour. */
export const FAR_LIGHTS: readonly (readonly [
    number,
    number,
    'warm' | 'red'
])[] = [
    [425, 178, 'warm'], [642, 182, 'warm'], [680, 176, 'warm'], [766, 166, 'warm'], [823, 184, 'warm'], [856, 176, 'warm'], [810, 153, 'red'],
];
