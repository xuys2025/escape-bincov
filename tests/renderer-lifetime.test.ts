import test from 'node:test';
import assert from 'node:assert/strict';
import type { Application } from 'pixi.js';
import { releaseManagedSlots } from '../src/coast-view/renderer-lifetime';

type Table = Record<string, object | null>;
const app = (tables: Record<string, Table>, running = false) => ({
  renderer: { gc: { _running: running, _managedResourceHashes: Object.entries(tables).map(([name, items]) => ({ context: { name, items }, hash: 'items' })) } },
}) as unknown as Application;

test('releaseManagedSlots drops only the given null placeholders of the named table', () => {
  const live = { uid: 2 };
  const glTexture: Table = { 1: null, 2: live, 4: null }, glBuffer: Table = { 1: null, 3: null };
  assert.equal(releaseManagedSlots(app({ glTexture, glBuffer }), 'glTexture', [1, 2, 3]), 1);
  assert.deepEqual(Object.keys(glTexture), ['2', '4'], 'a live slot and an unrelated placeholder stay');
  assert.equal(glTexture[2], live);
  assert.deepEqual(glBuffer, { 1: null, 3: null }, 'same uid in another table (another uid space) is untouched');
});

test('releaseManagedSlots leaves the tables alone while Pixi GC walks them, or if their shape changed', () => {
  const glTexture: Table = { 1: null };
  assert.equal(releaseManagedSlots(app({ glTexture }, true), 'glTexture', [1]), 0);
  assert.deepEqual(glTexture, { 1: null });
  assert.equal(releaseManagedSlots(app({ glBuffer: { 1: null } }), 'glTexture', [1]), 0, 'no such table');
  assert.equal(releaseManagedSlots({ renderer: {} } as unknown as Application, 'glTexture', [1]), 0, 'no gc');
  assert.equal(releaseManagedSlots({ renderer: { gc: { _running: false } } } as unknown as Application, 'glTexture', [1]), 0, 'no hash list');
});
