/**
 * Village sample sound: the game's existing SynthAudio (fully synthesized, offline), driven the way the original
 * RaidScene drives it. Cues come from published Runtime events and HUD state transitions only; nothing here changes the
 * simulation. Audio follows the published phase: it is suspended while the run is paused (Esc, focus loss, stall, lost
 * GPU context) and started again when play resumes, so leaving and returning to the window restores it.
 */
import type { SynthAudio } from '../audio';
import type { PublishedView, StampedEvent } from '../raid-runtime/contract';

export type SoundOut = Pick<SynthAudio, 'start' | 'stop' | 'shot' | 'step' | 'hit' | 'pickup' | 'click' | 'radio' | 'extract' | 'death'>;

export class SampleSound {
  private live: boolean | null = null;
  private stepLeft = 0;
  private reloading = false;
  private heals: number | null = null;
  private startedAt = -1e9;

  constructor(private readonly out: SoundOut) {}

  /** Once per presented batch, before its events. */
  frame(b: PublishedView, dt: number) {
    const f = b.frame, live = f.phase !== 'paused';
    if (live !== this.live) {
      this.live = live;
      if (live) { this.out.start(); this.startedAt = performance.now(); } else this.out.stop();
    }
    const p = f.player, w = f.hud.weapon;
    if (!live || f.phase === 'ending') { this.stepLeft = 0; this.reloading = w.reloading; this.heals = f.hud.heals; return; }
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
  }

  /** Each new event exactly once (the host passes events in sequence order). */
  event(e: StampedEvent, mapId: string) {
    if (e.stamp.world.mapId !== mapId) return;
    switch (e.type) {
      case 'shot': this.out.shot(e.shooter === 'player' ? e.weapon : 'enemy'); break;
      case 'melee': if (e.attacker === 'player') this.out.shot('knife'); break;
      // A blow, not the per-frame bleed/pollution tick (angle null, a fraction of a point each frame).
      case 'hurt': if (e.damage >= 1) this.out.hit(); break;
      case 'looted': this.out.pickup(); break;
      case 'door': this.out.click(); break;
      default: break;
    }
  }

  /**
   * The settlement is saved: extraction chime or death cue, as the original plays when its settlement commits. A run
   * settled from the pause menu has the context suspended, and SynthAudio drops cues until resume() has resolved, so
   * the cue is played once the restart has had time to take effect (see the audio service hand-off).
   */
  settled(outcome: string | undefined) {
    const cue = () => { if (outcome === 'extract') this.out.extract(); else this.out.death(); };
    // Abandoning from the pause menu restarts audio on the very frame the settlement commits: wait for the resume.
    if (this.live === false || performance.now() - this.startedAt < 300) { this.out.start(); setTimeout(cue, 150); } else cue();
  }

  /** A supply used from the inventory panel (bag or safe) committed. */
  used() { this.out.pickup(); }
  /** A radio line is shown (not a note being read). */
  radio() { this.out.radio(); }
}
