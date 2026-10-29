import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { emptyIntent } from '../src/raid-runtime/runtime';
import type { RaidIntent } from '../src/raid-runtime/contract';
import { shotBarrier } from '../src/layer-transition';
import type { Point } from '../src/world';
import { createRangeRaid, ShootingRange, FIRING_LINE, MOVER, RANGE_WEAPONS, TARGETS } from '../src/range/raid';
import { GUNS } from '../src/gunsmith/catalog';

// 试枪场 (src/range): the playtest page's raid. The page itself is checked in a browser by scripts/range-test.mjs.
const open = () => { const raid = createRangeRaid(); return { ...raid, range: new ShootingRange(raid.core) }; };
type Range = ReturnType<typeof open>;
/** One display frame at wall time `t` seconds, the way the page's decorated advance runs it. */
const frame = (r: Range, t: number, intent: Partial<RaidIntent> = {}) =>
    r.range.observe(r.core.advance(1000 + t * 1000, { ...emptyIntent(), aim: 0, ...intent }));
const at = (r: Range, id: string) => r.range.positions().find(p => p.id === id)!;
const aimAt = (r: Range, id: string) => { const p = at(r, id); return Math.atan2(p.y - r.core.player.y, p.x - r.core.player.x); };
/** Distance from point p to the segment a-b. */
const off = (a: Point, b: Point, p: Point) => {
    const dx = b.x - a.x, dy = b.y - a.y, k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(a.x + dx * k - p.x, a.y + dy * k - p.y);
};

test('range: the raid lives in memory, the AI is frozen and the player stands on the firing line facing east', () => {
    const r = open();
    assert.equal(r.session.storageOK, true);
    assert.equal(r.core.freezeAI, true);
    assert.equal(r.core.layered!.raid!.currentMap, 'coast');
    assert.deepEqual({ x: r.core.player.x, y: r.core.player.y, aim: r.core.player.rotation }, { ...FIRING_LINE, aim: 0 });
    assert.equal(r.session.loadout!.weapon, 'pistol');
    assert.equal(D.count(r.session.loadout!.bag, 'ammo9'), D.ITEMS.ammo9.stack, 'the bag starts with a full stack');
    // The targets are the toughest kind at full health, and the roster agrees (a checkpoint validates both).
    const roster = r.core.snapshotExpansion().raid!.roster;
    for (const p of r.range.positions()) {
        const e = r.core.enemies.find(a => a.uid === p.uid)!;
        assert.equal(e.id, 'elite'); assert.equal(e.hp, D.ENEMIES.elite.hp);
        assert.equal(roster.find(a => a.uid === p.uid)!.id, 'elite');
    }
    assert.equal(r.saves.persist(), true, 'a checkpoint of the set-up range validates');
});

test('range: fixed targets stand 5, 10, 15 and 20 tiles out, each with a clear line of fire', () => {
    const r = open(), world = r.core.layeredWorld!, raid = r.core.layered!.raid!;
    const context = { definition: world.maps.coast, doors: raid.maps.coast.doors, highTide: false };
    for (const t of TARGETS) {
        const p = at(r, t.id), distance = Math.hypot(p.x - FIRING_LINE.x, p.y - FIRING_LINE.y);
        assert.deepEqual({ x: p.x, y: p.y }, t.at);
        assert.ok(Math.abs(distance - t.tiles * 32) <= 1, `${t.id} at ${distance} px`);
        // No wall on the way, and every nearer target at least 6 px clear of the 14 px hit circle along the line.
        const dx = (p.x - FIRING_LINE.x) / distance, dy = (p.y - FIRING_LINE.y) / distance;
        for (const highTide of [false, true]) assert.ok(shotBarrier({ ...context, highTide }, { uid: 'probe', ...FIRING_LINE, rotation: 0, vx: dx, vy: dy, left: distance, damage: 1, enemy: false }, dx, dy) > distance);
        for (const other of TARGETS.filter(o => o.tiles < t.tiles)) assert.ok(off(FIRING_LINE, p, other.at) >= 20, `${other.id} shields ${t.id}`);
    }
    // The moving target is never behind a fixed one, wherever it is on its walk.
    for (let s = 0; s <= 3.2; s += .05) {
        const m = ShootingRange.moverAt(s);
        assert.ok(m.y >= MOVER.from && m.y <= MOVER.to && m.x === MOVER.x);
        for (const t of TARGETS.filter(o => Math.hypot(o.at.x - FIRING_LINE.x, o.at.y - FIRING_LINE.y) < Math.hypot(m.x - FIRING_LINE.x, m.y - FIRING_LINE.y)))
            assert.ok(off(FIRING_LINE, m, t.at) > 14, `${t.id} shields the moving target at ${m.y}`);
    }
});

test('range: hits and shots are counted per target and a hit target is back at full health after the frame', () => {
    const r = open(), uid = at(r, 'd5').uid;
    let t = 0;
    // A new Runtime starts unsteady: let the aim settle before shooting.
    for (; t < 2; t += 1 / 60) frame(r, t, { aim: aimAt(r, 'd5') });
    for (let i = 0; i < 6; i++) {
        frame(r, t, { aim: aimAt(r, 'd5'), firePressed: true, source: 'mouse-keyboard' });
        for (const end = t + .8; t < end; t += 1 / 60) {
            frame(r, t, { aim: aimAt(r, 'd5') });
            assert.equal(r.core.enemies.find(e => e.uid === uid)!.hp, D.ENEMIES.elite.hp);
        }
    }
    assert.equal(r.range.stats.shots, 6);
    assert.ok(r.range.stats.hits.d5 >= 4, JSON.stringify(r.range.stats));
    assert.deepEqual(Object.entries(r.range.stats.hits).filter(([id]) => id !== 'd5').map(([, n]) => n), [0, 0, 0, 0]);
    assert.equal(r.session.storageOK, true);
});

test('range: a target taken down within one long frame stands up again and checkpoints stay valid', () => {
    const r = open(), uid = at(r, 'd5').uid;
    r.range.arm('mb4a1');
    for (let t = 0; t < 2; t += 1 / 60) frame(r, t, { aim: aimAt(r, 'd5') });
    // Hold the rifle for one 1.9 s frame (the Runtime pauses on anything longer): far more than 190 health lands at once.
    frame(r, 2, { aim: aimAt(r, 'd5'), firePressed: true, fireHeld: true });
    const batch = frame(r, 3.9, { aim: aimAt(r, 'd5'), fireHeld: true });
    assert.ok(batch.events.some(e => e.type === 'death' && e.uid === uid), 'the burst took the target down inside the frame');
    const e = r.core.enemies.find(a => a.uid === uid)!;
    assert.equal(e.hp, D.ENEMIES.elite.hp);
    assert.deepEqual({ x: e.x, y: e.y }, TARGETS[0].at);
    assert.equal(r.core.containers.some(c => c.id === `corpse-${uid}`), false);
    assert.equal(r.core.kills, 0);
    assert.equal(r.saves.persist(), true, 'kills, corpses and roster still agree');
    // At most 36 a round (a critical hit), so the hits up to the fall are all counted.
    assert.ok(r.range.stats.hits.d5 >= 6, JSON.stringify(r.range.stats));
});

test('range: every gun of the catalog and the knife can be armed, each firing as its handling says, and the bag never runs dry', () => {
    const r = open();
    let t = 0;
    assert.deepEqual(RANGE_WEAPONS.filter(w => w !== 'knife').sort(), Object.keys(GUNS).sort(), 'all twenty guns (#28 M3)');
    for (const weapon of [...RANGE_WEAPONS, 'pistol', 'knife', 'mb4a1', 'knife', 'mb4a1'] as const) {
        r.range.arm(weapon);
        const b = frame(r, t += .02);
        assert.equal(b.frame.hud.weapon.id, weapon, weapon);
        assert.equal(b.frame.hud.aim.mode, weapon === 'knife' ? 'semi' : GUNS[weapon].handling.mode, weapon);
    }
    // Pistol clicks for 30 s: the magazine reloads from the bag, and the bag is topped up before it runs out. The shots
    // outnumber a full bag and magazine.
    r.range.arm('pistol');
    for (let i = 0; i < 100; i++) {
        frame(r, t += .3, { firePressed: true });
        assert.ok(D.count(r.session.loadout!.bag, 'ammo9') >= D.ITEMS.ammo9.stack / 2 - 1, `shot ${i}`);
    }
    assert.ok(r.range.stats.shots > D.ITEMS.ammo9.stack + D.WEAPONS.pistol.magazine, `${r.range.stats.shots} shots`);
    assert.equal(r.session.storageOK, true);
});

test('range: the moving target walks across the street on raid time and stops when switched off or paused', () => {
    const r = open(), y = () => at(r, 'mover').y;
    frame(r, 0);
    assert.equal(y(), MOVER.from);
    for (let t = 1 / 60; t <= 1 + 1e-9; t += 1 / 60) frame(r, t);
    assert.ok(Math.abs(y() - (MOVER.from + MOVER.speed)) < 1.5, `${y()}`);
    // It turns at the south edge and comes back.
    for (let t = 1 + 1 / 60; t <= 2.5; t += 1 / 60) frame(r, t);
    assert.ok(Math.abs(y() - (MOVER.to - (2.5 * MOVER.speed - (MOVER.to - MOVER.from)))) < 1.5, `${y()}`);
    const stopped = y();
    r.range.setMoving(false);
    for (let t = 2.5; t <= 3; t += 1 / 60) frame(r, t);
    assert.equal(y(), stopped);
    r.range.setMoving(true);
    r.core.pause('blur');
    for (let t = 3; t <= 3.5; t += 1 / 60) frame(r, t);
    assert.equal(y(), stopped);
    assert.equal(r.session.storageOK, true);
});

test('range: reset puts the counts, the targets and the player back', () => {
    const r = open();
    r.range.arm('carbine');
    let t = 0;
    for (; t < 1.5; t += 1 / 60) frame(r, t, { aim: aimAt(r, 'd10') });
    frame(r, t, { aim: aimAt(r, 'd10'), firePressed: true });
    for (const end = t + 1.5; t < end; t += 1 / 60) frame(r, t, { aim: aimAt(r, 'd10'), move: { x: 1, y: 0, sprint: false } });
    assert.ok(r.range.stats.shots > 0 && r.core.player.x > FIRING_LINE.x + 20 && at(r, 'mover').y > MOVER.from);
    r.range.reset();
    assert.deepEqual(r.range.stats, { shots: 0, hits: { d5: 0, d10: 0, d15: 0, d20: 0, mover: 0 } });
    assert.deepEqual({ x: r.core.player.x, y: r.core.player.y, aim: r.core.player.rotation }, { ...FIRING_LINE, aim: 0 });
    assert.equal(at(r, 'mover').y, MOVER.from);
    for (const target of TARGETS) assert.deepEqual((({ x, y }) => ({ x, y }))(at(r, target.id)), target.at);
    frame(r, t += 1 / 60);
    assert.equal(r.saves.persist(), true);
});
