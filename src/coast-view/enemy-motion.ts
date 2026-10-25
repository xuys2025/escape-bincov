import type { ActorView } from '../raid-runtime/contract';

/** A pose is reconstructed from published phase time, never advanced on a separate animation clock.
 * The sprite keeps its foot anchor; collision, aim and movement remain Runtime-owned. */
export function enemyMotion(actor: ActorView, reducedMotion: boolean) {
  const t = actor.tactics, neutral = { x: 1, y: 1, tilt: 0 };
  if (!t || !actor.alive || reducedMotion) return neutral;
  const prepare = t.phase === 'windup' ? Math.max(0, Math.min(1, 1 - t.left / Math.max(.001, t.total))) : 0;
  const release = t.phase === 'release' ? 1 : t.phase === 'recovery' ? Math.max(0, 1 - (t.total - t.left) / .3) : 0;
  const facing = Math.cos(t.aim) < 0 ? -1 : 1;
  switch (t.archetype) {
    case 'tidal-crab': return { x: 1 + .10 * prepare - .04 * release, y: 1 - .08 * prepare + .08 * release, tilt: 0 };
    case 'saltback-dog': return { x: 1 - .08 * prepare + .12 * release, y: 1 - .16 * prepare - .04 * release, tilt: 0 };
    case 'sac-spitter': return { x: 1 + .03 * prepare + .06 * release, y: 1 + .13 * prepare - .08 * release, tilt: 0 };
    case 'salt-dazed': return { x: 1, y: 1, tilt: facing * (-.08 * prepare + .12 * release) };
    case 'tide-chaser': return { x: 1 + .06 * release, y: 1 - .10 * prepare, tilt: facing * (-.07 * prepare + .10 * release) };
    case 'salt-hulk': return { x: 1 + .04 * prepare, y: 1 + .04 * prepare - .06 * release, tilt: facing * (-.10 * prepare + .15 * release) };
    default: return neutral; // Armed humans keep the articulated shoulder/grip pipeline.
  }
}

/** Shared timbres express body/action families, while the visible archetype supplies role identity. */
export function enemyVoice(archetype: string): string {
  if (archetype === 'tidal-crab') return 'crab';
  if (archetype === 'saltback-dog') return 'dog';
  if (archetype === 'sac-spitter') return 'spit';
  if (archetype === 'salt-hulk') return 'heavy';
  if (archetype === 'salt-dazed' || archetype === 'tide-chaser') return 'salt';
  if (archetype === 'tide-ritualist') return 'polearm';
  return archetype.startsWith('raider-') ? 'raider' : 'radio';
}
