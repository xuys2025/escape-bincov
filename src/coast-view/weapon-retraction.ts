import type { Point, WeaponLook } from '../raid-runtime/contract';
import { timbreOfLook, type GunTimbre } from '../gun-timbre';

/**
 * How far (world px) and for how long (display seconds) a gun pulls back after a shot, by its sound family (#75 H-09):
 * pistols and submachine guns least, shotguns and the bolt-action most. The carbine and the assault rifles keep #119's
 * signed-off 3 px and 80 ms. Each pulse ends before the family's next automatic shot. Not the gun's angular handling.
 */
export const RETRACTION: Readonly<Record<GunTimbre, Readonly<{ px: number; seconds: number }>>> = Object.freeze({
    pistol9: { px: 2, seconds: .06 }, pistol45: { px: 2.5, seconds: .07 }, smg: { px: 2, seconds: .05 },
    carbine: { px: 3, seconds: .08 }, rifle: { px: 3, seconds: .08 }, lmg: { px: 3, seconds: .07 },
    dmr: { px: 4, seconds: .1 }, bolt: { px: 4.5, seconds: .12 },
    'shotgun-double': { px: 5, seconds: .13 }, 'shotgun-pump': { px: 5, seconds: .13 }, 'shotgun-semi': { px: 4, seconds: .1 },
});

/** A held look's pulse (today's looks map through timbreOfLook; gunsmith M2-11 will map guns); melee looks have none. */
export function retractionOf(weapon: WeaponLook): Readonly<{ px: number; seconds: number }> | null {
    const timbre = timbreOfLook(weapon);
    return timbre ? RETRACTION[timbre] : null;
}

export type RetractionState = { weapon: WeaponLook | null; seq: number; left: number };
export const idleRetraction = (): RetractionState => ({ weapon: null, seq: 0, left: 0 });
export type RetractionShot = Readonly<{ seq: number; weapon: WeaponLook }>;

/** One bounded state per drawn actor, discarded with that actor/map/epoch. No deferred per-shot queue.
 * Every shot packet draws the original pose, including packets with several shots or a repeated event. The first
 * following packet without a shot first ages the pulse on the scene's existing display clock. An interval longer
 * than the pulse expires it without drawing a late peak. Thus at 10 Hz even a single shot can have no recoil frame;
 * never move a shot's muzzle or defer an expired pulse to force one into view.
 */
export function stepRetraction(state: RetractionState, weapon: WeaponLook, dt: number, eligible: boolean, shot?: RetractionShot): number {
    if (state.weapon !== weapon) { state.weapon = weapon; state.left = 0; }
    const pulse = eligible ? retractionOf(weapon) : null;
    if (!pulse) state.left = 0;
    if (shot) {
        if (shot.seq > state.seq) {
            state.seq = shot.seq;
            state.left = pulse && shot.weapon === weapon ? pulse.seconds : 0;
        } else state.left = Math.max(0, state.left - Math.max(0, dt));
        return 0;
    }
    if (!pulse) return 0;
    state.left = Math.max(0, state.left - Math.max(0, dt));
    return pulse.px * state.left / pulse.seconds;
}

/** The original whole-pixel grip projection when back=0. Arms and weapon rim use the resulting sprite transform. */
export function heldWeaponOffset(angle: number, forward: number, off: number, back: number): Point {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: Math.round(c * (forward - back) + s * off), y: Math.round(s * (forward - back) - c * off) };
}
