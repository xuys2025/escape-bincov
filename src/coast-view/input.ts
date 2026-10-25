import type { RaidIntent } from '../raid-runtime/contract';

type Action = 'reload' | 'heal' | 'primary' | 'knife' | 'interact';
type Stick = { id: number; x: number; y: number; distance: number };
const ACTION_KEYS: Record<string, Action> = { r: 'reload', q: 'heal', '1': 'primary', '2': 'knife', e: 'interact' };

/** The InputState name of a key event, the same for its press and release. Letters, digits and Shift go by the physical
 *  key (e.code): with Shift held a US layout reports 2 as "@" and a 1 released as "!", and AZERTY digits are symbols
 *  without it. Other keys keep e.key. */
export function inputKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') return 'shift';
  return e.key;
}
/** Whether an InputState key name (see inputKey) is one of the four movement keys: WASD, or ZQSD on AZERTY. */
export const isMoveKey = (key: string) => key === 'w' || key === 'a' || key === 's' || key === 'd';

export class InputState {
  touch = false;
  pointer = { x: innerWidth / 2, y: innerHeight / 2, inside: false };
  private keys = new Set<string>();
  private actions = new Set<Action>();
  private sticks = new Map<'move' | 'aim', Stick>();
  private mouseFire = false;
  private pressed = false;
  private precise = false;
  private interaction: number | null = null;
  private suppressedKeys = new Set<string>();
  private suppressedButtons = new Set<number>();
  private selected: string | null = null;

  /** A non-repeat keydown is a fresh press, even if blur hid the preceding keyup. Keep repeats suppressed across panels. */
  key(key: string, down: boolean, repeat = false) {
    key = key.toLowerCase();
    if (!down) { this.suppressedKeys.delete(key); this.keys.delete(key); return; }
    if (this.suppressedKeys.has(key)) {
      if (repeat) return;
      this.suppressedKeys.delete(key);
    }
    if (!this.keys.has(key) && ACTION_KEYS[key]) this.actions.add(ACTION_KEYS[key]);
    this.keys.add(key);
  }
  mouse(button: number, down: boolean) {
    if (!down) this.suppressedButtons.delete(button);
    else if (this.suppressedButtons.has(button)) return;
    if (button === 0) { if (down && !this.mouseFire) this.pressed = true; this.mouseFire = down; }
    if (button === 2) this.precise = down;
  }
  press(action: Action) { this.actions.add(action); }
  select(id: string) { this.selected = id; }
  beginStick(kind: 'move' | 'aim', id: number): boolean {
    if (this.sticks.has(kind) || [...this.sticks.values()].some(s => s.id === id)) return false;
    this.sticks.set(kind, { id, x: 0, y: 0, distance: 0 }); return true;
  }
  moveStick(kind: 'move' | 'aim', id: number, x: number, y: number) {
    const s = this.sticks.get(kind); if (!s || s.id !== id) return;
    const distance = Math.min(1, Math.hypot(x, y)), length = Math.max(1, Math.hypot(x, y));
    Object.assign(s, { x: x / length, y: y / length, distance });
  }
  stick(kind: 'move' | 'aim') { return this.sticks.get(kind) ?? null; }
  interact(id: number) { if (this.interaction !== null) return false; this.interaction = id; this.press('interact'); return true; }
  release(id: number) {
    for (const [k, s] of this.sticks) if (s.id === id) this.sticks.delete(k);
    if (this.interaction === id) this.interaction = null;
  }
  suppressHeld(extraKey?: string) {
    for (const k of this.keys) this.suppressedKeys.add(k);
    if (extraKey) this.suppressedKeys.add(extraKey.toLowerCase());
    if (this.mouseFire) this.suppressedButtons.add(0);
    if (this.precise) this.suppressedButtons.add(2);
    this.clear();
  }
  clear() { this.keys.clear(); this.actions.clear(); this.sticks.clear(); this.mouseFire = this.pressed = this.precise = false; this.interaction = null; }

  read(enabled: boolean, aimFromPointer: (x: number, y: number) => number | null): RaidIntent {
    const move = this.sticks.get('move'), aim = this.sticks.get('aim');
    const movingStick = this.touch && move && move.distance > .18 ? move : null;
    const aimingStick = this.touch && aim && aim.distance > .18 ? aim : null;
    const commands: RaidIntent['commands'][number][] = [];
    for (const a of this.actions) if (a !== 'interact') commands.push(a);
    const intent: RaidIntent = {
      move: {
        x: movingStick ? movingStick.x : Number(this.keys.has('d')) - Number(this.keys.has('a')),
        y: movingStick ? movingStick.y : Number(this.keys.has('s')) - Number(this.keys.has('w')),
        sprint: movingStick ? movingStick.distance >= .9 : this.keys.has('shift'),
      },
      // Touch follows the twin-stick convention: with the aim stick idle the body faces where the move stick walks
      // (issue #26 F08). Firing below still needs the aim stick.
      aim: this.touch ? (aimingStick ? Math.atan2(aimingStick.y, aimingStick.x) : movingStick ? Math.atan2(movingStick.y, movingStick.x) : null) : aimFromPointer(this.pointer.x, this.pointer.y),
      precise: !aimingStick && this.precise,
      firePressed: this.pressed,
      // The trigger is held by the aim stick past its fire ring or, outside the phone layout, by the left button. The
      // Runtime decides by gun type whether holding repeats (automatic guns, semi-automatic ones on touch) or only the
      // click fires; a mouse on the phone layout stays one shot per click.
      fireHeld: !!aimingStick && aimingStick.distance >= .62 || !this.touch && this.mouseFire,
      aimHeld: !!aimingStick,
      interactPressed: this.actions.has('interact'),
      interactHeld: (this.touch && this.interaction !== null) || this.keys.has('e'),
      commands, selectTarget: this.selected,
      source: this.touch ? 'touch' : 'mouse-keyboard',
    };
    this.actions.clear(); this.pressed = false; this.selected = null;
    if (!enabled) return { ...intent, move: { x: 0, y: 0, sprint: false }, aim: null, precise: false, firePressed: false, fireHeld: false, aimHeld: false, interactPressed: false, interactHeld: false, commands: [], selectTarget: null };
    return intent;
  }
}
