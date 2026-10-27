import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActiveClock, idleFrame } from '../src/input';
import { InputState } from '../src/coast-view/input';

// InputState reads innerWidth/innerHeight in a field initializer; Node has no window.
Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720 });
const read = (input: InputState, enabled = true) => input.read(enabled, () => null);

test('two independent thumbs, third pointer ownership and cancel do not stick', () => {
  const input = new InputState(); input.touch = true;
  assert.ok(input.beginStick('move', 1)); assert.ok(input.beginStick('aim', 2));
  assert.equal(input.beginStick('aim', 3), false);
  input.moveStick('move', 1, 1, 0); input.moveStick('aim', 2, 0, -1);
  let intent = read(input); assert.equal(intent.move.x, 1); assert.equal(intent.move.sprint, true); assert.equal(intent.fireHeld, true);
  input.release(3); assert.equal(read(input).fireHeld, true);
  input.release(2); intent = read(input); assert.equal(intent.fireHeld, false); assert.equal(intent.move.x, 1);
  input.clear(); intent = read(input); assert.equal(intent.move.x, 0); assert.equal(intent.interactHeld, false);
});
test('aim-only inner ring, held fire outer ring, no shot on release or resume', () => {
  const input = new InputState(); input.touch = true; input.beginStick('aim', 2);
  input.moveStick('aim', 2, .35, 0); assert.notEqual(read(input).aim, null); assert.equal(read(input).fireHeld, false);
  input.moveStick('aim', 2, .8, 0); assert.equal(read(input).fireHeld, true);
  assert.equal(read(input, false).fireHeld, false);
  input.clear(); input.release(2); assert.equal(read(input).firePressed, false); assert.equal(read(input).fireHeld, false);
});
test('desktop clicks once and reports the held button; command repeats and lost releases are cleared', () => {
  const input = new InputState(); input.mouse(0, true);
  // The press is one click; the held button is reported for automatic guns (the Runtime never repeats a semi-automatic one).
  const first = read(input); assert.equal(first.firePressed, true); assert.equal(first.fireHeld, true);
  assert.equal(read(input).firePressed, false); assert.equal(read(input).fireHeld, true);
  input.mouse(0, false); assert.equal(read(input).fireHeld, false);
  input.key('R', true); assert.ok(read(input).commands.includes('reload'));
  input.key('R', true); const repeat = read(input); assert.equal(repeat.commands.length, 0); assert.equal(repeat.interactPressed, false);
  input.key('e', true); input.clear(); assert.equal(read(input).interactHeld, false);
});
test('clock counts a 125ms frame in full and resets across pause', () => {
  const clock = new ActiveClock(); clock.tick(1000);
  const frame = clock.tick(1125); assert.equal(frame.seconds, .125); assert.equal(frame.steps, 4);
  assert.equal(clock.tick(4125).stalled, true);
  clock.reset(); assert.equal(clock.tick(90000).seconds, 0);
});
test('the idle frame releases every control and is never shared', () => {
  const frame = idleFrame();
  assert.deepEqual({ ...frame, actions: [...frame.actions] }, {
    x: 0, y: 0, sprint: false, aim: null, pointer: { x: 480, y: 270 }, precise: false,
    firePressed: false, fireHeld: false, interactHeld: false, actions: [], touch: false,
  });
  assert.notEqual(idleFrame().actions, frame.actions); assert.notEqual(idleFrame().pointer, frame.pointer);
});
test('phone layout accepts keyboard movement, sprint, interaction and single-shot mouse input', () => {
  const input = new InputState(); input.touch = true;
  input.key('w', true); input.key('d', true); input.key('shift', true); input.key('e', true);
  input.mouse(2, true); input.mouse(0, true);
  const intent = read(input);
  assert.equal(intent.move.x, 1); assert.equal(intent.move.y, -1); assert.equal(intent.move.sprint, true);
  assert.equal(intent.interactHeld, true); assert.equal(intent.precise, true); assert.equal(intent.firePressed, true);
  assert.equal(intent.fireHeld, false); assert.equal(read(input).firePressed, false);
  input.mouse(0, false); input.mouse(2, false); input.key('w', false); input.key('d', false);
  input.key('shift', false); input.key('e', false);
  const released = read(input);
  assert.equal(released.move.x, 0); assert.equal(released.move.y, 0); assert.equal(released.precise, false);
  assert.equal(released.move.sprint, false); assert.equal(released.interactHeld, false); assert.equal(released.firePressed, false);
});
test('active sticks take priority without discarding held physical keys', () => {
  const input = new InputState(); input.touch = true;
  input.key('d', true); input.mouse(2, true);
  input.beginStick('move', 1); input.moveStick('move', 1, -1, 0);
  input.beginStick('aim', 2); input.moveStick('aim', 2, 0, 1);
  const touch = read(input);
  assert.equal(touch.move.x, -1); assert.equal(touch.aim, Math.PI / 2);
  assert.equal(touch.fireHeld, true); assert.equal(touch.precise, false);
  input.release(1); input.release(2);
  const physical = read(input);
  assert.equal(physical.move.x, 1); assert.equal(physical.aim, null); assert.equal(physical.precise, true);
  assert.equal(physical.fireHeld, false);
  input.clear(); assert.equal(read(input).move.x, 0); assert.equal(read(input).precise, false);
});

test('closing a loot panel does not reuse held movement, fire, aim or interaction', () => {
  const input = new InputState();
  input.key('w', true); input.key('shift', true); input.key('e', true);
  input.mouse(0, true); input.mouse(2, true);
  input.suppressHeld(); input.clear();
  input.key('w', true, true); input.key('shift', true, true); input.key('e', true, true);
  input.mouse(0, true); input.mouse(2, true);
  const blocked = read(input);
  assert.equal(blocked.move.y, 0); assert.equal(blocked.move.sprint, false); assert.equal(blocked.interactHeld, false);
  assert.equal(blocked.firePressed, false); assert.equal(blocked.precise, false);
  assert.equal(blocked.commands.length, 0); assert.equal(blocked.interactPressed, false);
  input.key('d', true); assert.equal(read(input).move.x, 1);
  input.key('w', false); input.key('shift', false); input.key('e', false);
  input.mouse(0, false); input.mouse(2, false);
  input.key('w', true); input.key('shift', true); input.key('e', true);
  input.mouse(0, true); input.mouse(2, true);
  const fresh = read(input);
  assert.equal(fresh.move.y, -1); assert.equal(fresh.move.sprint, true); assert.equal(fresh.interactHeld, true);
  assert.equal(fresh.firePressed, true); assert.equal(fresh.precise, true); assert.equal(fresh.interactPressed, true);
});

test('the E press used to close loot is blocked even when the overlay did not forward keydown', () => {
  const input = new InputState();
  input.suppressHeld('E'); input.clear(); input.key('e', true, true);
  assert.equal(read(input).interactHeld, false);
  input.key('e', false); input.key('e', true);
  assert.equal(read(input).interactHeld, true);
});

test('a fresh keydown recovers a suppressed key whose keyup was lost outside the window (issue #60 D8)', () => {
  const input = new InputState();
  const keys = ['w', 'shift', 'r', 'q', '1', '2', 'e', 'f', 'g'];
  for (const key of keys) input.key(key, true);
  read(input);
  input.suppressHeld();
  // No keyup arrives while the window is unfocused. Held repeats must stay blocked after resuming.
  for (const key of keys) input.key(key, true, true);
  const held = read(input);
  assert.equal(held.move.y, 0); assert.equal(held.move.sprint, false);
  assert.equal(held.interactHeld, false); assert.equal(held.interactPressed, false);
  assert.deepEqual(held.commands, []);
  input.key('w', true, false);
  const walking = read(input);
  assert.equal(walking.move.y, -1); assert.equal(walking.move.sprint, false);
  assert.equal(walking.interactHeld, false); assert.equal(walking.interactPressed, false);
  assert.deepEqual(walking.commands, []);
  // A new non-repeat press proves that this key was released, even without its keyup.
  for (const key of keys) input.key(key, true, false);
  const fresh = read(input);
  assert.equal(fresh.move.y, -1); assert.equal(fresh.move.sprint, true);
  assert.equal(fresh.interactHeld, true); assert.equal(fresh.interactPressed, true);
  assert.deepEqual(fresh.commands, ['reload', 'heal', 'primary', 'knife', 'light', 'laser']);
  assert.deepEqual(read(input).commands, []);
});

test('the Shift modifier observed when leaving loot preserves suppression of an old held key', () => {
  const input = new InputState();
  input.key('shift', true); input.suppressHeld();
  input.key('shift', true, true); input.key('a', true, false);
  assert.deepEqual(read(input).move, { x: -1, y: 0, sprint: false });
  input.key('shift', false);
  input.key('shift', true, true);
  assert.equal(read(input).move.sprint, true, 'a Shift first pressed in the window still enables sprint');
});

test('opening loot cancels active touch sticks and does not resume them on pointer movement', () => {
  const input = new InputState(); input.touch = true;
  input.beginStick('move', 1); input.beginStick('aim', 2); input.interact(3);
  input.moveStick('move', 1, 1, 0); input.moveStick('aim', 2, 1, 0);
  input.suppressHeld();
  input.moveStick('move', 1, 1, 0); input.moveStick('aim', 2, 1, 0);
  const blocked = read(input);
  assert.equal(blocked.move.x, 0); assert.equal(blocked.fireHeld, false); assert.equal(blocked.interactHeld, false);
  input.release(1); input.release(2); input.release(3);
  assert.ok(input.beginStick('move', 1)); input.moveStick('move', 1, 1, 0);
  assert.equal(read(input).move.x, 1);
});

test('the touch aim stick reports aimHeld in either ring; a mouse and a released stick never do (PR #39)', () => {
  const input = new InputState(); input.touch = true;
  assert.ok(input.beginStick('aim', 7));
  input.moveStick('aim', 7, .35, 0); let intent = read(input);
  assert.equal(intent.aimHeld, true); assert.equal(intent.fireHeld, false); assert.equal(intent.precise, false);
  input.moveStick('aim', 7, .8, 0); intent = read(input);
  assert.equal(intent.aimHeld, true); assert.equal(intent.fireHeld, true);
  input.release(7); assert.equal(read(input).aimHeld, false);
  const mouse = new InputState(); mouse.mouse(2, true); mouse.mouse(0, true);
  assert.equal(read(mouse).aimHeld, false);
});
