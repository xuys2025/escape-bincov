import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENTS } from '../src/gunsmith/catalog';
import { buildOf, type PartNode } from '../src/gunsmith/instance';
import { effectiveStats } from '../src/gunsmith/stats';
import { BRACE_AFTER, emptyIntent } from '../src/raid-runtime/runtime';
import { FACTORY_LEAD, POINTER_LEAD, PRECISE_LEAD, aimLead, pointerLead, scopeScale, touchScopeLead } from '../src/coast-view/camera';
import { InputState } from '../src/coast-view/input';
import type { RaidIntent, StampedEvent } from '../src/raid-runtime/contract';
import { arm, benchRaid, reopen } from './fixtures/shooting-bench';

// #28 M3-11: the scope look-ahead of M0 review decision 7 and the bipod's braced handling in the raid.
// docs/gunsmith/CONTRACTS.md 「瞄具前探与脚架（M3-11）」.

Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720 }); // InputState reads them in a field initializer
const node = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid, id, slot, relief: false, children });
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const calm = () => ({ raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 });
/** The bench lane's raid (AI frozen, settled aim) with `gun` fitted with `parts`, and a frame clock of its own. */
function rig(gun: string, parts: PartNode[] = []) {
    const b = arm(benchRaid(), 'mb4a1');
    if (gun !== 'mb4a1') b.driver.weapon(gun);
    if (parts.length) b.driver.fit(parts);
    b.runtime.handling = calm();
    let ms = 1000;
    const frame = (intent: Partial<RaidIntent> = {}, step = 20) => b.runtime.advance(ms += step, { ...emptyIntent(), aim: b.runtime.player.rotation, ...intent });
    return { ...b, frame };
}
const rejected = (events: readonly StampedEvent[]) => events.flatMap(e => e.type === 'rejected' && e.action === 'scope' ? [e.reason] : []);

test('decision 7: close sights add no look-ahead; O06 x1.25, O07 x1.5, O08 and O09 x2, the two-mode O10 and O11 x1.5 and x2', () => {
    const view = (id: string) => ATTACHMENTS[id].mods.view ?? [1];
    for (const id of ['O01', 'O02', 'O03', 'O04', 'O05', 'O12']) assert.deepEqual(view(id), [1], id);
    assert.deepEqual(['O06', 'O07', 'O08', 'O09', 'O10', 'O11'].map(view), [[1.25], [1.5], [2], [2], [1.5, 2], [1.5, 2]]);
    // No other part looks farther, and none farther than the x2 cap.
    for (const a of Object.values(ATTACHMENTS)) if (a.mods.view) { assert.equal(a.cat, 'optic', a.id); assert.ok(Math.max(...a.mods.view) <= 2, a.id); }
});

test('the camera: a scope stretches the precise look-ahead along the pointer, x2 at most, x1.5 down on a short screen', () => {
    // The factory scale is the old lead exactly, wherever the pointer is.
    for (const [qx, qy] of [[300, 0], [0, 200], [-150, 90], [40, -30], [0, 0]]) assert.deepEqual(pointerLead(qx, qy, true, FACTORY_LEAD), pointerLead(qx, qy, true), `${qx},${qy}`);
    assert.deepEqual([scopeScale(1, 720), scopeScale(.5, 720), scopeScale(2, 720), scopeScale(2.5, 1080)], [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 2 }]);
    assert.deepEqual([scopeScale(2, 479), scopeScale(2, 480), scopeScale(1.25, 300)], [{ x: 2, y: 1.5 }, { x: 2, y: 2 }, { x: 1.25, y: 1.25 }]);
    // A far pointer: the ellipse doubled, 163 across and 116 down; a short screen keeps down to x1.5.
    const x2 = scopeScale(2, 720);
    assert.ok(near(pointerLead(1000, 0, true, x2).m, 2 * PRECISE_LEAD.x)); assert.ok(near(pointerLead(0, 1000, true, x2).m, 2 * PRECISE_LEAD.y));
    assert.ok(near(pointerLead(0, 1000, true, scopeScale(2, 400)).m, 1.5 * PRECISE_LEAD.y));
    // A near pointer: the share doubles too, so the scope reaches farther there as well.
    assert.ok(near(pointerLead(100, 0, true, x2).m, 2 * POINTER_LEAD * 100));
    // Only the length changes: the direction is the pointer's, so a still pointer keeps its aim.
    for (const [qx, qy] of [[300, 120], [-80, 260], [5, -400]]) for (const s of [x2, scopeScale(2, 400), scopeScale(1.25, 720)]) {
        const a = pointerLead(qx, qy, true), b = pointerLead(qx, qy, true, s);
        assert.deepEqual([b.ux, b.uy], [a.ux, a.uy]); assert.ok(b.m >= a.m);
    }
    assert.equal(pointerLead(300, 0, false, x2).m, 0, 'no precise aim, no look-ahead');
    // Touch: only the part beyond the factory, in step with the raise; nothing at the factory scale.
    const a = aimLead(.4, true), t = touchScopeLead(.4, x2, 1), half = touchScopeLead(.4, x2, .5), f = touchScopeLead(.4, FACTORY_LEAD, 1);
    assert.ok(near(t.x, a.x) && near(t.y, a.y)); assert.ok(near(half.x, a.x / 2) && near(half.y, a.y / 2)); assert.deepEqual([f.x + 0, f.y + 0], [0, 0]);
});

test('V on a two-mode optic: near, far, near again; the HUD and the camera factor follow; nothing is saved', () => {
    const r = rig('mb4a1', [node('fit-o10', 'O10', 'top')]);
    assert.deepEqual(r.runtime.current().frame.hud.sight, { scope: 1.5, modes: 2, mode: 0, bipod: false, braced: false });
    const far = r.frame({ commands: ['scope'] });
    assert.deepEqual(far.frame.hud.sight, { scope: 2, modes: 2, mode: 1, bipod: false, braced: false });
    assert.deepEqual(r.frame({ commands: ['scope'] }).frame.hud.sight!.mode, 0);
    r.frame({ commands: ['scope'] });
    // The mode is the raid's own: a checkpoint and a page reload start again on near.
    assert.ok(r.runtime.checkpoint());
    assert.equal(reopen(r).runtime.current().frame.hud.sight!.mode, 0);
    // The keyboard's V is the command.
    const input = new InputState(), read = () => input.read(true, () => 0).commands;
    input.key('v', true); assert.deepEqual(read(), ['scope']);
    input.key('v', true); assert.deepEqual(read(), [], 'a held key does not repeat');
    input.key('v', false); input.key('V', true); assert.deepEqual(read(), ['scope']);
});

test('V refused without a two-mode optic, with the knife, or without a gun; a one-mode scope has its factor and no mode to switch', () => {
    const one = rig('mb4a1', [node('fit-o08', 'O08', 'top')]);
    assert.deepEqual(one.runtime.current().frame.hud.sight, { scope: 2, modes: 1, mode: 0, bipod: false, braced: false });
    assert.deepEqual(rejected(one.frame({ commands: ['scope'] }).events), ['这把枪的瞄具没有两档。']);
    // A close sight looks no farther: no sight at all on the HUD.
    const red = rig('mb4a1', [node('fit-o03', 'O03', 'top')]);
    assert.equal(red.runtime.current().frame.hud.sight, null);
    assert.deepEqual(rejected(red.frame({ commands: ['scope'] }).events), ['这把枪的瞄具没有两档。']);
    const knife = rig('mb4a1', [node('fit-o10', 'O10', 'top')]);
    knife.frame({ commands: ['knife'] });
    assert.equal(knife.runtime.current().frame.hud.sight, null);
    assert.deepEqual(rejected(knife.frame({ commands: ['scope'] }).events), ['先换回主武器，再切换瞄具档位。']);
});

test('a bipod braces after standing still for BRACE_AFTER and lets go at the first step: the braced handling, on the HUD too', () => {
    const r = rig('svdb', [node('fit-f08', 'F08', 'bipod')]);
    const stats = effectiveStats(buildOf({ id: 'svdb', parts: [node('fit-f08', 'F08', 'bipod')] }));
    assert.ok(stats.braced);
    assert.ok(stats.braced!.precise < stats.handling.precise && stats.braced!.recover > stats.handling.recover, 'F08: a tighter aimed cone, a quicker recovery');
    // Walking: the build's handling.
    r.frame({ move: { x: 1, y: 0, sprint: false } });
    assert.deepEqual(r.runtime.grip, stats.handling); assert.equal(r.runtime.current().frame.hud.sight!.braced, false);
    // Standing still: braced once BRACE_AFTER has passed, not before.
    let t = 0;
    while (t + .02 < BRACE_AFTER - 1e-9) { r.frame(); t += .02; }
    assert.deepEqual(r.runtime.grip, stats.handling, `not yet after ${t.toFixed(2)} s`);
    r.frame(); r.frame();
    assert.deepEqual(r.runtime.grip, stats.braced); assert.deepEqual(r.runtime.current().frame.hud.sight, { scope: 1, modes: 1, mode: 0, bipod: true, braced: true });
    // The first step lets go at once.
    r.frame({ move: { x: 0, y: 1, sprint: false } });
    assert.deepEqual(r.runtime.grip, stats.handling); assert.equal(r.runtime.current().frame.hud.sight!.braced, false);
    // Without a bipod nothing braces, however long the player stands.
    const bare = rig('svdb');
    for (let i = 0; i < 40; i++) bare.frame();
    assert.deepEqual(bare.runtime.grip, effectiveStats(buildOf({ id: 'svdb', parts: [] })).handling);
    assert.equal(bare.runtime.current().frame.hud.sight, null);
});
