/**
 * Coast-view camera rules (village, mall and the station-yard mall entry share them). Pure math with no Pixi imports,
 * so Node tests can replay the follow loop. Display only: the Runtime, input and saves never see these values.
 */

/** Aim look-ahead along the aim, world px: as far as an x-by-y ellipse reaches in that direction. Half the old 48 x 34
 *  by default (playtest F-04: the view slid with every mouse flick); the right button (precise aim) keeps the old reach,
 *  1.7 x 48 x 34. The lead points exactly along the aim (PR #39): the pointer then stays on the aim's ray while the
 *  camera eases, so the easing never turns the aim. A lead off the ray did, by up to 29 degrees near the player. */
export const AIM_LEAD = { x: 24, y: 17 } as const, PRECISE_LEAD = { x: 81.6, y: 57.8 } as const;
export const aimLead = (aim: number, precise: boolean) => {
  const l = precise ? PRECISE_LEAD : AIM_LEAD, c = Math.cos(aim), s = Math.sin(aim), r = l.x * l.y / Math.hypot(l.y * c, l.x * s);
  return { x: c * r, y: s * r };
};

/** Share of the pointer's distance from the screen's centring point the precise mouse look-ahead takes before the cap. */
export const POINTER_LEAD = .35;
/** A look-ahead as a length along a unit direction. */
export interface Lead { m: number; ux: number; uy: number }
/** How much farther a scope's precise look-ahead reaches, across and down (1 is the factory reach). */
export interface LeadScale { x: number; y: number }
export const FACTORY_LEAD: LeadScale = { x: 1, y: 1 };
/** M0 review decision 7 (#28 M3-11): a scope reaches x2 at most (163 x 116 world px); under 480 CSS px tall, x1.5 down. */
export const SCOPE_MAX = 2, SHORT_SCREEN = 480, SHORT_SCOPE_Y = 1.5;
/** The look-ahead scale of a sight whose `view` is `view`, on a screen `cssHeight` px tall. */
export const scopeScale = (view: number, cssHeight: number): LeadScale => {
  const s = Math.min(SCOPE_MAX, Math.max(1, view));
  return { x: s, y: cssHeight < SHORT_SCREEN ? Math.min(s, SHORT_SCOPE_Y) : s };
};
/**
 * A scope on touch (#28 M3-11, from the M0-07 prototype): touch has no precise look-ahead (maintainer, 2026-10-22), so a
 * scope adds only its part beyond the factory, the precise ellipse along the aim times (scale - 1), in step with the
 * raised aim (hud.aim.raise, 0 to 1: the aim stick held in the inner ring while standing). The stick aims without the
 * camera, so this cannot turn the aim. The factory scale adds nothing.
 */
export const touchScopeLead = (aim: number, scale: LeadScale, raise: number) => {
  const l = aimLead(aim, true), k = Math.min(1, Math.max(0, raise));
  return { x: l.x * Math.max(0, scale.x - 1) * k, y: l.y * Math.max(0, scale.y - 1) * k };
};
/**
 * Mouse look-ahead (PR #39). Only a precise aim (the right button) looks ahead: along the pointer's offset (qx, qy) from
 * the point the camera centres on, world px, a share of that distance capped by the PRECISE_LEAD ellipse in that
 * direction. Without the button the camera stays on the player, so moving the mouse never slides the world under it.
 * It depends on where the pointer is on screen, never on the aim: a lead that followed the aim fed back into the aim
 * read through the moving camera and kept turning it after the mouse stopped (up to 29 degrees, or 78 with the right
 * button). With the player drawn behind the centre along the pointer's own line, a still pointer keeps its aim however
 * the lead's length eases. Touch keeps aimLead: its aim comes from the stick, not through the camera.
 *
 * A scope (`scale`, #28 M3-11) stretches the ellipse's axes and the share together: the share alone already stops the
 * lead at 0.35 of the half screen (134 px across a 1280 x 720 view), so the ellipse alone would do little. Only the
 * length changes, never the direction, so a still pointer keeps its aim; the factory scale is the old lead exactly.
 */
export function pointerLead(qx: number, qy: number, precise: boolean, scale: LeadScale = FACTORY_LEAD): Lead {
  const d = Math.hypot(qx, qy); if (d < 1e-9) return { m: 0, ux: 1, uy: 0 };
  const ux = qx / d, uy = qy / d, ax = PRECISE_LEAD.x * scale.x, ay = PRECISE_LEAD.y * scale.y;
  return { m: precise ? Math.min(ax * ay / Math.hypot(ay * ux, ax * uy), POINTER_LEAD * Math.max(scale.x, scale.y) * d) : 0, ux, uy };
}
/**
 * One frame of the mouse look-ahead with easing share k: the direction follows the pointer at once and only the length
 * eases. Turning keeps just the part of the old length along the new direction, so no sideways swing is left to run
 * after the pointer stops; easing the length moves the camera along the pointer's line and never turns the aim.
 * `room` (leadRoom) caps the length at once, the part kept from the old length included, so the camera stops on the map
 * edge instead of being held there by the clamp while the length keeps easing.
 */
export function stepLead(prev: Lead, want: Lead, k: number, room = Infinity): Lead {
  const along = Math.min(room, Math.max(0, prev.ux * want.ux + prev.uy * want.uy) * prev.m), to = Math.min(room, want.m);
  return { m: along + (to - along) * k, ux: want.ux, uy: want.uy };
}

/** The camera's allowed top-left range, world px (CoastView.camBounds). An axis whose lo exceeds hi (view wider than the
 *  map there) holds the camera at its midpoint. */
export interface CameraBounds { x0: number; x1: number; y0: number; y1: number }
/**
 * Look-ahead a follow camera keeps per world px between it and its nearest bound. The follow camera reaching a bound
 * leaves no room at all (leadRoom), so without this a walk toward the edge with the right button held dropped the whole
 * look-ahead in one frame (64 world px at 1280 x 720); with it the look-ahead runs out over the follow camera's last
 * 27 px, the camera moving at most four times as fast as the follow camera.
 */
export const EDGE_FADE = 3;
const axisRoom = (f: number, u: number, lo: number, hi: number) => !(f >= lo && f <= hi) ? 0
  : Math.min(EDGE_FADE * Math.min(f - lo, hi - f), u > 0 ? (hi - f) / u : u < 0 ? (f - lo) / -u : Infinity);
/**
 * How far a mouse look-ahead along (ux, uy) may carry the camera from the follow camera (fx, fy): it stops where the
 * camera meets the map edge (#80). A still pointer keeps its aim only while the camera moves along the pointer's line;
 * once the clamp held one axis, easing the length moved the other alone and turned the aim (8.4 degrees at 1280 x 720 on
 * the range's firing line). A follow camera already beyond a bound (the player drawn off centre near the edge, or a map
 * narrower than the view) leaves no room, since any look-ahead there would leave the line from the player through the
 * pointer; EDGE_FADE lets the room run out before that.
 */
export const leadRoom = (fx: number, fy: number, ux: number, uy: number, b: CameraBounds) =>
  Math.min(axisRoom(fx, ux, b.x0, b.x1), axisRoom(fy, uy, b.y0, b.y1));

/** How far the smoothed offset may stray from the held whole-pixel offset before the camera moves. It absorbs the
 *  frame-to-frame wobble of the follow; that wobble stays far below it only while the smoothing runs on the clock the
 *  Runtime moved the player on (host.ts passes those deltas as `follow`). */
export const CAMERA_HOLD = .75;

/** What one camera axis carries to the next frame: the held whole-pixel offset and the unclamped camera it gave. */
export interface AxisHold { held: number; raw: number }

/**
 * One axis of the whole-pixel camera: the smoothed offset from the player, held in whole px and added to the player's
 * drawn (rounded) position, so the player and the world share one rounding and a steady walk keeps the player still on
 * screen. The offset must come from the UNROUNDED player: taken from Math.round(player) it is Math.round(smoothed)
 * again, the old trembling camera.
 *
 * `motion` is this frame's change of `smoothed`. The camera never steps against it, as Math.round(smoothed) never did:
 * while the lag builds at the start of a walk the offset shrinks in whole px as the player advances in whole px, and a
 * step back would shake the ground by 1 px. The camera waits a frame instead and the offset takes up the difference.
 *
 * Bounds are rounded, so a camera held at a map edge never wobbles with the player's fraction; when they cross, the
 * camera sits on their whole-pixel midpoint.
 */
export function snapAxis(smoothed: number, player: number, lo: number, hi: number, prev?: AxisHold, motion = 0): AxisHold & { at: number } {
  const o = smoothed - player, r = Math.round(player);
  const last = prev && Number.isFinite(prev.held) && Number.isFinite(prev.raw) ? prev : undefined;
  let h = last && Math.abs(o - last.held) <= CAMERA_HOLD ? last.held : Math.round(o);
  if (last && motion !== 0 && Math.sign(r + h - last.raw) === -Math.sign(motion)) h = last.raw - r;
  const l = Math.round(lo), u = Math.round(hi);
  return { at: l > u ? Math.round((lo + hi) / 2) : Math.min(u, Math.max(l, r + h)), held: h, raw: r + h };
}
