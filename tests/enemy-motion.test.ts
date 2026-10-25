import test from 'node:test';
import assert from 'node:assert/strict';
import { enemyMotion } from '../src/coast-view/enemy-motion';
import type { ActorView } from '../src/raid-runtime/contract';

const actor = (id: string, phase: string, left: number, aim = 0) => ({ alive: true,
  tactics: { archetype: id, phase, left, total: 1, aim } }) as ActorView;

test('creature anticipation survives restore, release differs, and recovery returns to the foot-anchored neutral pose', () => {
  for (const id of ['tidal-crab', 'saltback-dog', 'sac-spitter', 'salt-dazed', 'tide-chaser', 'salt-hulk']) {
    const a = actor(id, 'windup', .2), pose = enemyMotion(a, false), idle = { x: 1, y: 1, tilt: 0 };
    assert.notDeepEqual(pose, idle, id);
    assert.deepEqual(enemyMotion(structuredClone(a), false), pose, 'restoring cannot restart preparation');
    assert.notDeepEqual(enemyMotion(actor(id, 'release', .1), false), pose);
    assert.deepEqual(enemyMotion(actor(id, 'recovery', .2), false), idle);
    assert.deepEqual(enemyMotion(a, true), idle, 'reduced motion retains HUD telegraphs without body deformation');
    assert.deepEqual(enemyMotion({ ...a, alive: false }, false), idle, 'death animation is not mixed with a combat pose');
    assert.deepEqual(enemyMotion(actor(id, 'idle', 0), false), idle);
  }
});

test('body leans mirror with attack direction while armed actors retain the existing grip pose', () => {
  const right = enemyMotion(actor('salt-hulk', 'windup', 0, 0), false);
  const left = enemyMotion(actor('salt-hulk', 'windup', 0, Math.PI), false);
  assert.equal(left.tilt, -right.tilt); assert.equal(left.x, right.x); assert.equal(left.y, right.y);
  for (const id of ['raider-melee', 'tide-ritualist', 'mercenary-support', 'blockade-sentry'])
    assert.deepEqual(enemyMotion(actor(id, 'windup', 0), false), { x: 1, y: 1, tilt: 0 });
});
