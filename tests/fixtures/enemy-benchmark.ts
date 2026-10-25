import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as Session from '../../src/session';
import type * as Runtime from '../../src/raid-runtime/runtime';
import type { RaidIntent } from '../../src/raid-runtime/contract';
import { makeV4 } from './old-saves';

export type BenchmarkModules = { session: typeof Session; runtime: typeof Runtime };
export type BenchmarkCase = { world: 'classic' | 'building' | 'mall'; seed: number; hz: number; seconds: number };
const NOW = 1800000000000;

/** Load rules from another checkout while keeping this exact fixture/input protocol. */
export async function loadBenchmarkModules(root: string): Promise<BenchmarkModules> {
  const [session, runtime] = await Promise.all([
    import(pathToFileURL(resolve(root, 'src/session.ts')).href),
    import(pathToFileURL(resolve(root, 'src/raid-runtime/runtime.ts')).href),
  ]);
  return { session, runtime };
}

/** Preserve identity relationships, replacing only generated run/item IDs (including embedded IDs).
 * No numeric rounding: AI positions, path nodes, timers and RNG remain exact.
 */
export function canonicalBehavior(value: unknown, runId: string): string {
  const ids = new Map<string, string>();
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') return v.split(runId).join('<run>').replace(/bc-[a-z0-9]+-[a-z0-9]+/g, id => {
      if (!ids.has(id)) ids.set(id, `<item-${ids.size}>`);
      return ids.get(id)!;
    });
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, visit(x)]));
    return v;
  };
  return JSON.stringify(visit(value));
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function memoryStorage(data = new Map<string, string>()) {
  let writes = 0;
  return { data, storage: { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); writes++; } }, get writes() { return writes; } };
}

/** Deterministic input policy: walk a small square; aim at nearest living enemy, fire once/second,
 * reload at second 4/8. No test driver, AI freezing, artificial enemies or renderer is used.
 */
function input(modules: BenchmarkModules, r: Runtime.CoastRaidRuntime, frame: number, hz: number): RaidIntent {
  const t = frame / hz, phase = Math.floor(t / 3) % 4;
  const target = r.enemies.filter(e => e.hp > 0).sort((a, b) =>
    Math.hypot(a.x - r.player.x, a.y - r.player.y) - Math.hypot(b.x - r.player.x, b.y - r.player.y))[0];
  const previous = (frame - 1) / hz;
  const secondEdge = Math.floor(t) !== Math.floor(previous);
  return { ...modules.runtime.emptyIntent(), move: { x: [1, 0, -1, 0][phase], y: [0, 1, 0, -1][phase], sprint: false },
    aim: target ? Math.atan2(target.y - r.player.y, target.x - r.player.x) : 0,
    firePressed: secondEdge, precise: true, commands: secondEdge && Math.floor(t) % 4 === 0 ? ['reload'] : [] };
}

export function runBenchmarkCase(modules: BenchmarkModules, sample: BenchmarkCase) {
  assert.ok(Number.isInteger(sample.hz) && sample.hz >= 1 && sample.hz <= 240);
  assert.ok(Number.isInteger(sample.seconds) && sample.seconds >= 2 && sample.seconds <= 60);
  const { createSessionState, SaveSession } = modules.session;
  const memory = memoryStorage(), state = createSessionState();
  const saves = new SaveSession(state, () => memory.storage, undefined, () => NOW);
  assert.ok(saves.initialize(), state.storageError);
  state.state = 'hideout';
  assert.ok(saves.beginRun(sample.seed, sample.world === 'mall' ? 'mall' : sample.world === 'building', { mallLayout: 3, legacyEnemies: true }), state.storageError);
  // Compare the historical RPG rules, not a new Perk deployment. Keep all identities, population and RNG.
  // makeV4 also takes away the gun instance fields, so the record is the v4 one the client before perks wrote.
  const record: any = saves.currentRecord();
  if (record?.expansion?.version === 3 && record.expansion.raid) {
    makeV4(record);
    memory.storage.setItem('escape-bincov.session.v2', JSON.stringify(record));
    assert.ok(saves.initialize(), state.storageError);
  }
  state.state = 'run';
  const r = new modules.runtime.CoastRaidRuntime(state, saves);
  const runId = state.loadout!.runId!;
  const active = (runtime: Runtime.CoastRaidRuntime) => {
    if (!runtime.layered) return runtime.snapshot();
    const snapshot = runtime.snapshotExpansion();
    return { raid: snapshot.raid, body: snapshot.body };
  };
  const signature = (runtime: Runtime.CoastRaidRuntime) => canonicalBehavior(active(runtime), runId);
  const initial = r.snapshot(), initialEntities = { activeEnemies: r.enemies.length, bullets: r.bullets.length,
    loot: r.loot.length, containers: r.containers.length,
    worldEnemies: r.layered ? Object.values(r.layered.raid!.maps).reduce((sum, layer) => sum + layer.enemies.length, 0) : r.enemies.length };
  const behavior = createHash('sha256'), events: Record<string, number> = {};
  const recovery: { frame: number; simulationSeconds: number; restored: boolean; checkpointHash: string; restoredHash: string }[] = [];
  const started = performance.now(); let advanceMs = 0, frames = 0, peakBullets = 0;
  r.advance(0, modules.runtime.emptyIntent()); behavior.update(signature(r));
  for (let frame = 1; frame <= sample.hz * sample.seconds && !r.ending; frame++) {
    const intent = input(modules, r, frame, sample.hz), before = performance.now();
    const batch = r.advance(frame * 1000 / sample.hz, intent);
    advanceMs += performance.now() - before; frames++;
    peakBullets = Math.max(peakBullets, r.bullets.length);
    for (const event of batch.events) events[event.type] = (events[event.type] ?? 0) + 1;
    behavior.update(canonicalBehavior({ frame, events: batch.events }, runId));
    if (frame % sample.hz === 0) behavior.update(signature(r));
    if (frame === sample.hz * Math.floor(sample.seconds / 2) && !r.ending) {
      assert.ok(r.checkpoint(), state.storageError);
      const expected = hash(signature(r));
      // Copy bytes to model a reload without introducing a second writer into the active session.
      const loaded = memoryStorage(new Map(memory.data)), restoredState = createSessionState();
      const restoredSaves = new SaveSession(restoredState, () => loaded.storage, undefined, () => NOW);
      assert.ok(restoredSaves.initialize(), restoredState.storageError);
      assert.ok(restoredSaves.resumeRun()); restoredState.state = 'run';
      const restored = new modules.runtime.CoastRaidRuntime(restoredState, restoredSaves);
      const actual = hash(signature(restored));
      recovery.push({ frame, simulationSeconds: r.elapsed, restored: expected === actual, checkpointHash: expected, restoredHash: actual });
      restored.cancelStart();
    }
  }
  const finalHash = hash(signature(r)); behavior.update(signature(r));
  return { ...sample, worldVersion: r.current().stamp.world.worldVersion, layoutRevision: r.current().stamp.world.layoutRevision,
    requestedSimulationSeconds: sample.seconds, simulationSeconds: r.elapsed, frames, initialEntities, peakBullets,
    advanceMs, wallMs: performance.now() - started, writes: memory.writes, behaviorHash: behavior.digest('hex'), finalHash,
    recovery, summary: { phase: r.current().frame.phase, ending: r.ending, result: state.result?.outcome ?? null,
      hp: r.hp, kills: r.kills, ammo: r.mag, rng: r.snapshot().rng, initialRng: initial.rng,
      player: { ...r.player }, enemies: r.enemies.reduce<Record<string, number>>((counts, e) => {
        const key = `${e.id}:${e.hp > 0 ? e.state : 'dead'}`; counts[key] = (counts[key] ?? 0) + 1; return counts;
      }, {}), events } };
}
