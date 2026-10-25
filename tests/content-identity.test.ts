import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BUILDING_WORLD, mapPresentation } from '../src/building-world';
import { MALL_WORLD, mallWorldV2, mallWorldV3 } from '../src/mall-world';
import { mapView } from '../src/raid-runtime/presentation';
import type { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import type { SpaceDefinition } from '../src/spatial';
import type { WorldDefinition } from '../src/expansion-state';

// Captured from main 974a3a8 before the metadata move. Keys are sorted, so property insertion order is immaterial.
// A fixed run id and no visible exits isolate the complete static MapDef projection (including all 28 entries).
const baseline = JSON.parse(readFileSync(new URL('./fixtures/content-map-baseline.json', import.meta.url), 'utf8')) as
    { world: string; map: string; sha256: string; entryCount: number }[];
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, canonical(v)])) : value;
function project(world: WorldDefinition, definition: SpaceDefinition) {
    // These are the three read-only Runtime inputs mapView consumes; no simulation or storage is substituted here.
    const source = { space: { definition }, mapData: mapPresentation(definition), visibleExits: [] } as unknown as CoastRaidRuntime;
    return mapView(source, { runId: 'content-identity-test', worldVersion: world.id, layoutRevision: world.revision, mapId: definition.id });
}

test('authored region metadata preserves all nine shipped MapDefs and twenty-eight entry projections', () => {
    const worlds = [BUILDING_WORLD, MALL_WORLD, mallWorldV2(), mallWorldV3()];
    const actual = worlds.flatMap(world => Object.values(world.maps).map(definition => {
        const view = project(world, definition);
        return { world: world.id, map: definition.id, sha256: createHash('sha256').update(JSON.stringify(canonical(view))).digest('hex'), entryCount: view.entries.length };
    }));
    assert.equal(actual.length, 9); assert.equal(actual.reduce((n, v) => n + v.entryCount, 0), 28);
    assert.deepEqual(actual, baseline);
});

test('resident display-name changes and region reordering retain every existing authored identity', () => {
    let count = 0;
    for (const definition of Object.values(BUILDING_WORLD.maps)) {
        const before = project(BUILDING_WORLD, definition), copy = structuredClone(definition);
        for (const region of copy.regions!) {
            assert.ok(region.id, 'the definition owns the identity before any display text is read');
            region.name = `文案调整-${count++}`;
        }
        copy.regions!.reverse();
        const after = project(BUILDING_WORLD, copy);
        assert.deepEqual(after.regions.map(r => r.id).sort(), before.regions.map(r => r.id).sort());
        assert.deepEqual(after.entries, before.entries);
        assert.deepEqual(after.cells, before.cells); assert.deepEqual(after.doors, before.doors);
        assert.ok(after.regions.every(r => r.name.startsWith('文案调整-')));
    }
    assert.equal(count, 8);
});

test('a familiar Chinese name cannot supply a missing region identity', () => {
    const copy = structuredClone(BUILDING_WORLD.maps.coast);
    assert.equal(copy.regions![0].name, '褪色居民楼 · 一楼'); delete copy.regions![0].id;
    assert.throws(() => project(BUILDING_WORLD, copy), /Missing region id/);
});
