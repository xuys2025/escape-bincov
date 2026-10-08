/**
 * Village sample sound: the game's existing SynthAudio (fully synthesized, offline), driven the way the original
 * RaidScene drives it, plus positional cues. Cues come from published Runtime events and frame state only; nothing here
 * changes the simulation. Audio follows the published phase: it is suspended while the run is paused (Esc, focus loss,
 * stall, lost GPU context) and started again when play resumes, so leaving and returning to the window restores it.
 *
 * Other people's sounds are placed: enemy shots, blows that land on someone else, bullets striking walls and doors
 * worked by others pan toward their side and fade with distance. A round passing close to the player whizzes. The sea
 * ambience closes in indoors. The drizzle is visual only: a continuous hiss bed masked the quiet pickup cue at the
 * output (measured by coast-audio-test A5), so UI feedback wins over the extra ambience.
 */
import type { Spot, SynthAudio } from '../audio';
import type { PublishedView, StampedEvent } from '../raid-runtime/contract';

export type SoundOut = Pick<SynthAudio, 'start' | 'stop' | 'shot' | 'step' | 'hit' | 'pickup' | 'click' | 'radio' | 'extract' | 'death'
  | 'whiz' | 'impact' | 'dry' | 'heartbeat' | 'setRoomTone' | 'stow'>;

/** Closest distance from point p to the segment a-b. */
function segmentDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

export class SampleSound {
  private live: boolean | null = null;
  private stepLeft = 0;
  private reloading = false;
  private heals: number | null = null;
  private beatLeft = 0;
  private listener = { x: 0, y: 0 };
  private where = new Map<string, { x: number; y: number }>();
  private trail = new Map<string, { x: number; y: number }>();
  private whizzed = new Set<string>();
  private ambience = '';

  constructor(private readonly out: SoundOut) {}

  /** Stereo position and level of a sound at world (x, y) for the player standing at the listener. */
  spot(x: number, y: number): Spot {
    const dx = x - this.listener.x, d = Math.hypot(dx, y - this.listener.y);
    return { pan: Math.max(-1, Math.min(1, dx / 360)) * .8, gain: Math.max(.28, Math.min(1, 1 - (d - 120) / 760)) };
  }

  /** Once per presented batch, before its events. */
  frame(b: PublishedView, dt: number) {
    const f = b.frame, live = f.phase !== 'paused';
    if (live !== this.live) {
      this.live = live;
      // A restarted context has a fresh ambience: the room tone is applied again below.
      if (live) { this.out.start(); this.ambience = ''; } else this.out.stop();
    }
    const p = f.player, w = f.hud.weapon;
    this.listener = { x: p.x, y: p.y };
    this.where.clear();
    for (const a of f.actors ?? []) this.where.set(a.uid, { x: a.x, y: a.y });
    if (!live || f.phase === 'ending') { this.stepLeft = 0; this.reloading = w.reloading; this.heals = f.hud.heals; return; }
    // Room tone: indoors (a revealed room or a layered floor) the sea closes in.
    const indoor = b.stamp.world.mapId !== 'coast' || p.regionId != null, key = indoor ? 'in' : 'out';
    if (key !== this.ambience) { this.ambience = key; this.out.setRoomTone(indoor ? 1 : 0); }
    // Footsteps at the original cadence: 0.42 s walking, 0.25 s sprinting, first step on the first moving frame.
    if (p.alive && p.state.moving) {
      this.stepLeft -= dt;
      if (this.stepLeft <= 0) { this.out.step(); this.stepLeft = p.state.sprinting ? .25 : .42; }
    } else this.stepLeft = 0;
    // Reload start and finish each click, as in the original.
    if (w.reloading !== this.reloading) { this.reloading = w.reloading; this.out.click(); }
    // A heal (Q) spends a supply: the original plays the pickup cue for any used supply.
    if (this.heals !== null && f.hud.heals < this.heals) this.out.pickup();
    this.heals = f.hud.heals;
    // Near misses: an enemy round whose path this frame passes within 30 px of the player.
    const seen = new Set<string>();
    for (const bl of f.bullets ?? []) {
      if (!bl.enemy) continue;
      seen.add(bl.uid);
      const from = this.trail.get(bl.uid) ?? { x: bl.x - bl.vx * dt, y: bl.y - bl.vy * dt };
      this.trail.set(bl.uid, { x: bl.x, y: bl.y });
      if (!this.whizzed.has(bl.uid) && segmentDistance(from.x, from.y, bl.x, bl.y, p.x, p.y) < 30) { this.whizzed.add(bl.uid); this.out.whiz(this.spot(bl.x, bl.y)); }
    }
    for (const id of this.trail.keys()) if (!seen.has(id)) { this.trail.delete(id); this.whizzed.delete(id); }
    // Very low health: a slow heartbeat.
    if (p.alive && f.hud.hp / f.hud.maxHp < .3) { this.beatLeft -= dt; if (this.beatLeft <= 0) { this.out.heartbeat(); this.beatLeft = .95; } }
    else this.beatLeft = 0;
  }

  /** Each new event exactly once (the host passes events in sequence order). */
  event(e: StampedEvent, mapId: string) {
    if (e.stamp.world.mapId !== mapId) return;
    const at = (uid: string) => { const p = this.where.get(uid); return p ? this.spot(p.x, p.y) : undefined; };
    switch (e.type) {
      case 'shot': {
        if (e.shooter === 'player') { this.out.shot(e.weapon); break; }
        const s = at(e.shooter) ?? (e.pellets[0] ? this.spot(e.pellets[0].origin.x, e.pellets[0].origin.y) : undefined);
        if (s) this.out.shot('enemy', s); else this.out.shot('enemy');
        break;
      }
      case 'melee': if (e.attacker === 'player') this.out.shot('knife'); break;
      // A blow, not the per-frame bleed/pollution tick (angle null, a fraction of a point each frame).
      case 'hurt': {
        if (e.damage < 1) break;
        const s = e.uid === 'player' ? undefined : this.spot(e.at.x, e.at.y);
        if (s) this.out.hit(s); else this.out.hit();
        break;
      }
      case 'impact': if (e.reason === 'blocked' && (e.surface === 'wall' || e.surface === 'door')) { const s = this.spot(e.lastFree.x, e.lastFree.y); if (s.gain > .3) this.out.impact(s); } break;
      case 'looted': this.out.stow(); break;
      case 'door': { const s = e.by === 'player' ? undefined : at(e.by); if (s) this.out.click(s); else this.out.click(); break; }
      default: break;
    }
  }

  /** The trigger was pulled on an empty magazine with nothing left to load (otherwise the reload click follows). */
  trigger(weapon: { magSize: number; mag: number; reloading: boolean; reserve: number } | undefined) {
    if (weapon && weapon.magSize > 0 && weapon.mag === 0 && !weapon.reloading && weapon.reserve === 0) this.out.dry();
  }

  /**
   * The settlement is saved: extraction chime or death cue, as the original plays when its settlement commits. A run
   * settled from the pause menu still has audio suspended: start it first; the audio service schedules cues asked for
   * while its resume is pending, so the cue plays as soon as the context runs.
   */
  settled(outcome: string | undefined) {
    if (this.live === false) this.out.start();
    if (outcome === 'extract') this.out.extract(); else this.out.death();
  }

  /** A supply used from the inventory panel (bag or safe) committed. */
  used() { this.out.pickup(); }
  /** A radio line is shown (not a note being read). */
  radio() { this.out.radio(); }
}
