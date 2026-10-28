/**
 * How hard a blow lands on screen (#75 H-03, H-04, H-06), worked out from published events only: damage, the Runtime and
 * the save never see any of it. Pure rules; CoastView.present applies them.
 */
import type { Point } from '../raid-runtime/contract';

export type BlowTier = 0 | 1 | 2;
/**
 * Per tier: the kick (world px, the way the round travelled), the flash and kick lengths (s), how much longer the hurt
 * pose holds (s, the heavy blow's short pause) and the camera's push when the blow lands on the player (world px).
 * Tier 0 is the blow as it was before these rounds. The heavier tiers' lengths avoid whole multiples of 1/60 s, so a
 * 60 Hz frame never lands exactly on an end (where float rounding would decide).
 */
export const BLOW_TIERS: readonly Readonly<{ kick: number; flash: number; kickT: number; hold: number; pulse: number }>[] = [
  { kick: 2, flash: .07, kickT: .08, hold: 0, pulse: 2.5 },
  { kick: 3, flash: .09, kickT: .095, hold: .03, pulse: 3.5 },
  { kick: 4, flash: .11, kickT: .125, hold: .07, pulse: 5 },
];
/** Reduced motion keeps the flash but no kick beyond tier 0's and no camera push. */
export const REDUCED_KICK = 2;
/** The camera's blow push and the gun's recoil share one offset; together they never pass this (world px). */
export const MAX_CAMERA_PUSH = 8;

/**
 * A blow's tier from the rounds of one shot that struck the body in it (1 for melee or a round of unknown shot), whether
 * any was critical and whether it killed. Not the damage: a double-barrel killing a 1 hp target is not the lightest.
 */
export function blowTier(pellets: number, critical: boolean, lethal: boolean): BlowTier {
  if (lethal && (critical || pellets >= 4)) return 2;
  return critical || lethal || pellets >= 3 ? 1 : 0;
}

/** Blood drops for a blow of `pellets` rounds: one spray that grows with the rounds, not one spray per round. */
export const bloodDrops = (pellets: number, again: boolean) => again ? Math.min(6, 2 * pellets) : Math.min(14, 6 + 2 * (pellets - 1));

/**
 * The camera offset after a blow on the player: pushed `pulse` px the way the blow travelled (its angle points back at
 * the source), then clamped with whatever recoil is already there to MAX_CAMERA_PUSH, so a burst cannot run away.
 */
export function pushCamera(offset: Point, angle: number, pulse: number): Point {
  const x = offset.x - Math.cos(angle) * pulse, y = offset.y - Math.sin(angle) * pulse, d = Math.hypot(x, y);
  return d > MAX_CAMERA_PUSH ? { x: x * MAX_CAMERA_PUSH / d, y: y * MAX_CAMERA_PUSH / d } : { x, y };
}

/**
 * Which shot fired each round (from shot events; hurt events name the round since #113) and which shot last struck each
 * body. A later batch's rounds of a shot already shown on a body are the same blow (H-04): no second flash or kick.
 */
export class ShotBlows {
  private shotOf = new Map<string, string>();
  private shown = new Map<string, { shot: string; age: number }>();
  /** How long a body remembers the shot that struck it (s); the rounds of one shot land within a few frames. */
  static readonly MEMORY = .3;

  shot(shotId: string, bullets: readonly string[]) { for (const b of bullets) this.shotOf.set(b, shotId); }
  of(bullet: string | undefined): string | null { return bullet ? this.shotOf.get(bullet) ?? null : null; }
  /** Whether `uid` already showed a blow from `shot` (always false for an unknown shot). */
  seen(uid: string, shot: string | null) { return shot !== null && this.shown.get(uid)?.shot === shot; }
  mark(uid: string, shot: string | null) { if (shot !== null) this.shown.set(uid, { shot, age: 0 }); else this.shown.delete(uid); }
  /**
   * Once per presented batch: forget rounds that neither fly any more nor are named by this batch's events (a round's
   * last impact and hurt can come in the batch that removes it), and body marks older than MEMORY.
   */
  prune(live: ReadonlySet<string>, named: ReadonlySet<string>, dt: number) {
    for (const b of this.shotOf.keys()) if (!live.has(b) && !named.has(b)) this.shotOf.delete(b);
    for (const [uid, m] of this.shown) if ((m.age += dt) > ShotBlows.MEMORY) this.shown.delete(uid);
  }
  clear() { this.shotOf.clear(); this.shown.clear(); }
  get size() { return { rounds: this.shotOf.size, bodies: this.shown.size }; }
}
