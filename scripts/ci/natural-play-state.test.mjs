import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { readNaturalPlayState } from '../natural-play-state.mjs';

function fixture() {
  const app = { state: 'run', save: { lastResult: null, stats: { kills: 0 } }, loadout: { bag: { items: [] } } };
  const host = {
    lastBatch: { stamp: { world: { runId: 'run-1', mapId: 'coast' }, simulationTime: 30 }, map: { tile: 32, cells: [], doors: [], entries: [], exits: [] },
      frame: { hud: { hp: 100, bleeding: false, highTide: false, weapon: { mag: 12, reloading: false } }, player: { state: { attackCooldown: 0 }, x: 10, y: 20 }, doors: [], loot: [], containers: [], actors: [] } },
    services: { lootContext: () => null }, eventLog: [{ type: 'death', detail: { uid: 'enemy-1', killer: 'player' } }],
  };
  const sample = { host, driver: { killCount: () => 1 } };
  // Execute the serialized callback in a separate realm, as Playwright does. No module closure can supply the count.
  const read = () => runInNewContext(`(${readNaturalPlayState.toString()})()`, { window: { __bincov: { app }, __bincovSample: sample }, document: { querySelector: () => null } });
  return { app, host, sample, read };
}

test('natural-play samples retain cumulative kills when the bounded event log evicts a death or the view remounts', () => {
  const { host, sample, read } = fixture();
  assert.equal(read().kills, 1);
  for (let i = 0; i < 1000; i++) {
    host.eventLog.push({ type: 'shot', detail: {} });
    if (host.eventLog.length > 1000) host.eventLog.shift();
  }
  assert.equal(host.eventLog.filter(e => e.type === 'death').length, 0);
  assert.equal(read().kills, 1);
  sample.host = { ...host, eventLog: [] };
  assert.equal(read().kills, 1);
});

test('natural-play reports the committed result after the Runtime and test driver have been released', () => {
  const { app, sample, read } = fixture();
  app.state = 'result'; app.save.lastResult = { outcome: 'extract', kills: 2 }; app.save.stats.kills = 2;
  sample.host = null; sample.driver = null;
  const result = read();
  assert.equal(result.result, app.save.lastResult); assert.equal(result.stats.kills, 2);
});

test('natural-play refuses a missing cumulative observation rather than silently falling back to recent events', () => {
  const { sample, read } = fixture();
  sample.driver = null;
  assert.throws(read, /killCount/);
});
