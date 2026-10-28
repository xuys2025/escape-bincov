import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';

function fixture(layered: boolean, freezeFrames = true) {
    const state = createSessionState(), data = new Map<string, string>();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
    assert.ok(saves.initialize()); assert.ok(saves.enableRpg());
    state.state = 'hideout'; assert.ok(saves.beginRun(42, layered)); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves, freezeFrames);
    const driver = createRuntimeTestDriver(runtime, '?test=1'); driver.freezeAI(true);
    return { state, data, runtime, driver };
}

test('HUD needs follow live body decay before the next checkpoint, while pause freezes them', () => {
    const { state, data, runtime: r, driver } = fixture(true);
    driver.vitals({ mental: 71.501, water: 62.501, satiety: 53.501 });
    assert.ok(r.checkpoint());
    const saved = structuredClone(state.expansion), bytes = [...data];
    r.advance(0, emptyIntent());
    const first = r.current().frame.hud.needs;
    assert.deepEqual(first, { mental: 71.501, water: 62.501, satiety: 53.501 });
    const next = r.advance(200, emptyIntent()).frame.hud.needs;
    assert.ok(next);
    const body = r.snapshotExpansion().body;
    assert.deepEqual(next, { mental: body.mental, water: body.water, satiety: body.satiety });
    assert.deepEqual(Object.values(next).map(Math.round), [71, 62, 53]);
    assert.deepEqual(state.expansion, saved, 'displaying live needs does not commit a checkpoint');
    assert.deepEqual([...data], bytes);
    assert.deepEqual(first, { mental: 71.501, water: 62.501, satiety: 53.501 }, 'old frames stay detached');
    r.pause('overlay');
    const paused = r.current().frame.hud.needs;
    assert.deepEqual(r.advance(10000, emptyIntent()).frame.hud.needs, paused);
    assert.equal(state.expansion!.body.water, paused!.water, 'ordinary pause still saves its checkpoint');
});

test('HUD needs never share the mutable body, including when frame freezing is disabled', () => {
    for (const freezeFrames of [true, false]) {
        const { runtime: r, driver } = fixture(true, freezeFrames);
        const needs = r.current().frame.hud.needs;
        assert.ok(needs); assert.notEqual(needs, r.layered!.body);
        if (freezeFrames) assert.ok(Object.isFrozen(needs));
        driver.vitals({ mental: 14, water: 25, satiety: 36 });
        const next = r.current().frame.hud.needs;
        assert.deepEqual(next, { mental: 14, water: 25, satiety: 36 });
        assert.notDeepEqual(needs, next);
        assert.equal(Object.isFrozen(r.layered!.body), false, 'publishing must not freeze simulation state');
        if (!freezeFrames) {
            (next as { water: number }).water = 0;
            assert.equal(r.layered!.body.water, 25, 'a consumer cannot mutate the body through a frame');
        }
    }
});

test('a classic checkpoint has no HUD needs even when its session has an expansion body', () => {
    const { state, runtime } = fixture(false);
    assert.ok(state.expansion?.body); assert.equal(state.expansion.raid, null);
    assert.equal(runtime.current().frame.hud.needs, null);
    runtime.advance(0, emptyIntent());
    assert.equal(runtime.advance(200, emptyIntent()).frame.hud.needs, null);
});
