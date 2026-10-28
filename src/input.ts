/**
 * The Runtime's per-substep input frame and its foreground clock. Devices are read by coast-view/input.ts (InputState)
 * and reach the Runtime as a RaidIntent; no gameplay rules or renderer objects live here.
 */
export type InputAction = 'reload' | 'heal' | 'primary' | 'knife' | 'laser' | 'light' | 'interact';
export interface InputFrame {
  x: number; y: number; sprint: boolean; aim: { x: number; y: number } | null;
  pointer: { x: number; y: number }; precise: boolean;
  firePressed: boolean; fireHeld: boolean; interactHeld: boolean;
  actions: ReadonlySet<InputAction>; touch: boolean;
}

/** A frame with every control released: no movement, aim, fire, interaction or command. */
export const idleFrame = (): InputFrame => ({
  x: 0, y: 0, sprint: false, aim: null, pointer: { x: 480, y: 270 }, precise: false,
  firePressed: false, fireHeld: false, interactHeld: false, actions: new Set(), touch: false,
});

/** Wall-clock foreground time; simulation uses bounded substeps, never a clamped clock. */
export class ActiveClock {
  private previous: number | null = null;
  reset() { this.previous = null; }
  tick(now: number) {
    const seconds = this.previous === null ? 0 : Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    return { seconds, stalled: seconds > 2, steps: Math.max(1, Math.ceil(Math.min(seconds, 2) / .04)) };
  }
}
