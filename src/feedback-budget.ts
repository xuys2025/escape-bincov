/**
 * One budget rule for particles and sound voices when a fight crowds them (#75 H-07). Feedback is either core (blood,
 * impact sparks; a shot's crack and body, hit, crit, kill and pain) or decorative (smoke, dust, casings; report tails,
 * action clicks, footsteps, anything far from the player). Past `soft` live items decorative ones are no longer added;
 * at `hard` a core one takes the place of the oldest decorative one, or is dropped when none is left.
 */
export type Admit = 'add' | 'drop' | 'evict';

export function admit(live: number, decor: boolean, decorLive: number, soft: number, hard: number): Admit {
  if (live < soft) return 'add';
  if (decor) return 'drop';
  if (live < hard) return 'add';
  return decorLive > 0 ? 'evict' : 'drop';
}

/** Live particles (fx.ts): soft and hard limits, and past `far` world px from the player a particle counts as decorative. */
export const PARTICLE_BUDGET = { soft: 220, hard: 320, far: 420 } as const;
/** Sound voices (audio.ts): `hard` is the 96-voice cap SynthAudio always had; a cue placed this quietly (Spot gain) counts as decorative. */
export const VOICE_BUDGET = { soft: 64, hard: 96, far: .35 } as const;
