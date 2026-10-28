import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { ATTACHMENTS, GUNS } from '../src/gunsmith/catalog';
import { deviceParts, devicesOn, partOn, settleDevices, toggleDevice } from '../src/gunsmith/devices';
import { buildOf, factoryState, validateGun, type GunState, type PartNode } from '../src/gunsmith/instance';
import { effectiveStats, laserHandling } from '../src/gunsmith/stats';
import { coneOf } from '../src/shooting';
import { emptyIntent } from '../src/raid-runtime/runtime';
import { advanceLegacyEnemy, type LegacyEnemyWorld } from '../src/raid-runtime/enemy-ai';
import { advanceTacticalEnemy } from '../src/raid-runtime/tactical-enemy';
import { archetype, initialTactics } from '../src/enemy-archetypes';
import { InputState } from '../src/coast-view/input';
import type { EnemyState } from '../src/checkpoint';
import type { RaidIntent, StampedEvent } from '../src/raid-runtime/contract';
import { arm, benchRaid, reopen, LANE } from './fixtures/shooting-bench';

// #28 M2-03: device switches per part, the laser's hip help in range fading with the raise, the light's outlines under
// the reveal rules, and the exposure a device on costs. docs/gunsmith/CONTRACTS.md 「激光、灯光与枪声（M2-03、M2-11）」.

Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720 }); // InputState reads them in a field initializer
const node = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid, id, slot, relief: false, children });
/** An M4A1 with a short handguard and, on its one side rail, the close laser / the close floodlight / the universal combiner. */
const LASER = [node('fit-h01', 'H01', 'handguard', [node('fit-t01', 'T01', 'side')])];
const LIGHT = [node('fit-h01', 'H01', 'handguard', [node('fit-t05', 'T05', 'side')])];
const COMBINER = [node('fit-h01', 'H01', 'handguard', [node('fit-t09', 'T09', 'side')])];
/** The long handguard's two side rails: the far laser and the close floodlight, two devices with a switch each. */
const BOTH = [node('fit-h02', 'H02', 'handguard', [node('fit-t03', 'T03', 'side'), node('fit-t05', 'T05', 'side')])];
const near = (a: number, b: number, eps = 1e-12) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const state = (parts: PartNode[], laser = false, light = false): GunState => ({ parts: structuredClone(parts), devices: { laser, light } });
const calm = () => ({ raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 });

/** The bench lane's raid (AI frozen, settled aim) with an M4A1 fitted with `parts`, and a frame clock of its own. */
function rig(parts: PartNode[] = []) {
    const b = arm(benchRaid(), 'mb4a1');
    if (parts.length) b.driver.fit(parts);
    b.runtime.handling = calm();
    let ms = 1000;
    const frame = (intent: Partial<RaidIntent> = {}) => b.runtime.advance(ms += 20, { ...emptyIntent(), aim: b.runtime.player.rotation, ...intent });
    return { ...b, frame, gun: () => b.state.loadout!.gun! };
}
const rejected = (events: readonly StampedEvent[]) => events.flatMap(e => e.type === 'rejected' && e.action === 'device' ? [e.reason] : []);

test('device parts are named by their effects: a laser, a light, both on two rails, or one combiner', () => {
    assert.deepEqual(deviceParts([]), []);
    assert.deepEqual(deviceParts(LASER), [{ uid: 'fit-t01', id: 'T01', laser: true, light: false }]);
    assert.deepEqual(deviceParts(BOTH), [{ uid: 'fit-t03', id: 'T03', laser: true, light: false }, { uid: 'fit-t05', id: 'T05', laser: false, light: true }]);
    assert.deepEqual(deviceParts(COMBINER), [{ uid: 'fit-t09', id: 'T09', laser: true, light: true }]);
    // Every tactical part is a device, every device part is tactical.
    for (const a of Object.values(ATTACHMENTS)) assert.equal(a.quota !== null, a.cat === 'tactical', a.id);
    // A part reads its own effect's switch; a combiner is on with either.
    const [t03, t05] = deviceParts(BOTH), [t09] = deviceParts(COMBINER);
    assert.deepEqual([partOn(t03, { laser: true, light: false }), partOn(t05, { laser: true, light: false })], [true, false]);
    assert.deepEqual([false, true].map(laser => partOn(t09, { laser, light: !laser })), [true, true]);
    assert.deepEqual(devicesOn(state(BOTH, false, true)), ['fit-t05']);
    assert.deepEqual(devicesOn(state(BOTH, true, true)), ['fit-t03', 'fit-t05']);
    assert.deepEqual(devicesOn(factoryState()), []);
});

test('one switch per part: two devices switch apart, a combiner switches both effects at once, nothing else changes', () => {
    const two = state(BOTH);
    assert.equal(toggleDevice(two, 'laser'), true); assert.deepEqual(two.devices, { laser: true, light: false });
    assert.equal(toggleDevice(two, 'light'), true); assert.deepEqual(two.devices, { laser: true, light: true });
    assert.equal(toggleDevice(two, 'laser'), true); assert.deepEqual(two.devices, { laser: false, light: true });
    assert.deepEqual(two.parts, BOTH, 'the parts are untouched');
    const combiner = state(COMBINER);
    assert.equal(toggleDevice(combiner, 'light'), true); assert.deepEqual(combiner.devices, { laser: true, light: true });
    assert.equal(toggleDevice(combiner, 'laser'), true); assert.deepEqual(combiner.devices, { laser: false, light: false });
    // A combiner stored half on reads on, and its one switch turns it off as a whole.
    const half = state(COMBINER, true, false);
    assert.equal(toggleDevice(half, 'light'), true); assert.deepEqual(half.devices, { laser: false, light: false });
    // No part with the effect: refused, unchanged.
    for (const [parts, effect] of [[[], 'laser'], [LASER, 'light'], [LIGHT, 'laser']] as const) {
        const s = state(parts as PartNode[]), before = structuredClone(s);
        assert.equal(toggleDevice(s, effect), false); assert.deepEqual(s, before);
    }
    // Every state a switch can reach is one the save accepts.
    for (const s of [two, combiner, half]) assert.deepEqual(validateGun('mb4a1', 'gun-1', s), { ok: true });
});

test('a device goes off with its part: the save refuses a switch on without its part, settleDevices turns it off', () => {
    // The laser on, then the laser taken off the rail (the workbench, M2-04, settles before anything goes on again).
    const s = state(LASER, true);
    s.parts[0].children = [];
    assert.equal(validateGun('mb4a1', 'gun-1', s).ok, false);
    settleDevices(s);
    assert.deepEqual(s.devices, { laser: false, light: false }); assert.deepEqual(validateGun('mb4a1', 'gun-1', s), { ok: true });
    // A light put on the rail the laser left starts off, even though the laser's switch was on.
    const swap = state(LASER, true);
    swap.parts[0].children = [node('fit-t05', 'T05', 'side')];
    settleDevices(swap); assert.deepEqual(swap.devices, { laser: false, light: false });
    // The parts still there keep their switches; a combiner takes one setting.
    const both = state(BOTH, true, false); settleDevices(both); assert.deepEqual(both.devices, { laser: true, light: false });
    const combiner = state(COMBINER, false, true); settleDevices(combiner); assert.deepEqual(combiner.devices, { laser: true, light: true });
});

/** The settled cone at `raise` for a weapon and handling (no sway, bloom or drift). */
const coneAt = (raise: number, s: { weapon: D.WeaponDef; handling: Parameters<typeof coneOf>[2] }) => coneOf({ ...calm(), raise }, s.weapon, s.handling);

test('decision 9: the hip grip and the laser help only from the hip and fade out as the aim rises', () => {
    const m4 = GUNS.mb4a1, factory = { weapon: m4.stats, handling: m4.handling };
    // The hip grip: .8 from the hip, nothing once raised.
    const grip = effectiveStats({ gun: 'mb4a1', parts: buildOf({ id: 'mb4a1', parts: [node('h', 'H01', 'handguard', [node('f', 'F06', 'under')])] }).parts });
    assert.ok(near(coneAt(0, grip) / coneAt(0, factory), .8) && near(coneAt(1, grip) / coneAt(1, factory), 1));
    // The close laser on (.7): its handling has the laser's hip cone and the same aimed cone; halfway up it is between.
    const lit = effectiveStats(buildOf({ id: 'mb4a1', parts: LASER }), ['fit-t01']), laser = { weapon: lit.weapon, handling: laserHandling(lit.handling, lit.laser!) };
    assert.deepEqual(lit.laser, { hip: m4.handling.hip * .7, range: 240 });
    assert.ok(near(coneAt(0, laser) / coneAt(0, factory), .7) && near(coneAt(1, laser), coneAt(1, factory)));
    const half = coneAt(.5, laser);
    assert.ok(half > coneAt(.5, factory) * .7 && half < coneAt(.5, factory), 'fading, not gone');
    // Linear in the raise, as the stance itself is: the help is what is left of the hip-to-aimed gap.
    assert.ok(near(half, (coneAt(0, laser) + coneAt(1, laser)) / 2));
    // Both together: .8 x .7 = .56 from the hip, held at the .6 floor; aimed, still the factory cone.
    const stack = effectiveStats(buildOf({ id: 'mb4a1', parts: [node('h', 'H01', 'handguard', [node('f', 'F06', 'under'), node('t', 'T01', 'side')])] }), ['t']);
    const both = { weapon: stack.weapon, handling: laserHandling(stack.handling, stack.laser!) };
    assert.ok(near(coneAt(0, both) / coneAt(0, factory), .6) && near(coneAt(1, both), coneAt(1, factory)));
});

test('the switch keys reach the Runtime: F the light, G the laser; a repeat or a panel sends nothing', () => {
    const input = new InputState(), read = (enabled = true) => input.read(enabled, () => 0).commands;
    input.key('g', true); assert.deepEqual(read(), ['laser']);
    input.key('g', true); assert.deepEqual(read(), [], 'a held key does not repeat');
    input.key('g', false); input.key('F', true); assert.deepEqual(read(), ['light']);
    input.key('f', false); input.key('g', true); assert.deepEqual(read(false), [], 'a panel takes the frame');
    // The touch button presses the commands itself (one per part); they arrive together.
    input.press('laser'); input.press('light'); assert.deepEqual(read(), ['laser', 'light']);
});

test('switching in a raid: on the gun instance, shown on the HUD, saved by the checkpoint, kept after a reload', () => {
    const r = rig(LASER);
    assert.deepEqual(r.runtime.current().frame.hud.devices, { parts: [{ uid: 'fit-t01', name: '近距激光器', laser: true, light: false, on: false }], laser: null, light: null, spot: 1 });
    const on = r.frame({ commands: ['laser'] });
    assert.deepEqual(r.gun().devices, { laser: true, light: false });
    assert.deepEqual(on.frame.hud.devices!.parts.map(p => p.on), [true]);
    assert.ok(on.frame.hud.devices!.laser, 'the beam is published while the laser is on');
    assert.equal(on.frame.hud.devices!.spot, ATTACHMENTS.T01.mods.spot);
    assert.ok(r.runtime.checkpoint());
    assert.deepEqual(r.saves.currentRecord()!.expansion!.raid!.loadout.gun!.devices, { laser: true, light: false });
    // A page reload resumes the raid from that checkpoint with the laser still on, and its effects with it.
    const page = reopen(r);
    assert.deepEqual(page.runtime.current().frame.hud.devices!.parts.map(p => p.on), [true]);
    assert.ok(page.runtime.laserBeam());
    // The reloaded page owns the save now (the old one is a stale window): off again there, and its checkpoint saves that.
    page.runtime.advance(5000, { ...emptyIntent(), aim: page.runtime.player.rotation, commands: ['laser'] });
    assert.deepEqual(page.state.loadout!.gun!.devices, { laser: false, light: false });
    assert.ok(page.runtime.checkpoint());
    assert.deepEqual(page.saves.currentRecord()!.expansion!.raid!.loadout.gun!.devices, { laser: false, light: false });
    assert.equal(r.runtime.checkpoint(), false, 'the old page may not write over it');
});

test('switching is refused, with a reason and nothing changed, for an effect the gun lacks, with the knife drawn, and on a factory gun', () => {
    const r = rig(LASER);
    assert.deepEqual(rejected(r.frame({ commands: ['light'] }).events), ['这把枪没有装灯光。']);
    r.frame({ commands: ['knife'] });
    assert.deepEqual(rejected(r.frame({ commands: ['laser'] }).events), ['先换回主武器，再开关设备。']);
    assert.deepEqual(r.gun().devices, { laser: false, light: false });
    // The devices count only with the gun in hand: the HUD drops them with the knife drawn.
    assert.equal(r.runtime.current().frame.hud.devices, null);
    r.frame({ commands: ['primary'] });
    const factory = rig();
    assert.deepEqual(rejected(factory.frame({ commands: ['laser', 'light'] }).events), ['这把枪没有装激光。', '这把枪没有装灯光。']);
    assert.equal(factory.runtime.current().frame.hud.devices, null);
    // Two devices: the touch button's two commands in one frame switch both, each its own.
    const two = rig(BOTH);
    two.frame({ commands: ['laser', 'light'] });
    assert.deepEqual(two.gun().devices, { laser: true, light: true });
    assert.equal(two.runtime.current().frame.hud.devices!.spot, ATTACHMENTS.T03.mods.spot! * ATTACHMENTS.T05.mods.spot!);
    two.frame({ commands: ['light'] });
    assert.deepEqual(two.gun().devices, { laser: true, light: false });
});

test('the laser tightens the hip cone only while its beam rests on a body within its range, and fades as the aim rises', () => {
    const r = rig(LASER), m4 = GUNS.mb4a1.handling;
    r.frame({ commands: ['laser'] });
    const target = r.runtime.enemies.find(e => e.hp > 0)!.uid, place = (d: number) => r.driver.placeEnemy(target, { x: LANE.at.x + d, y: LANE.at.y });
    const cone = () => { r.runtime.handling = calm(); return r.runtime.current().frame.hud.aim.cone; };
    // Nothing on the line: the plain cone, and the beam runs on to twice its range with no dot.
    const plain = cone(), open = r.runtime.laserBeam()!;
    assert.deepEqual([open.hit, open.inRange, open.target], [false, false, null]);
    assert.ok(near(open.to.x - LANE.at.x, 480, 1e-9));
    // A body 150 px out (the beam meets it 14 px short of its centre): within the 240 px range.
    place(150);
    const beam = r.runtime.laserBeam()!;
    assert.deepEqual([beam.hit, beam.inRange, beam.target], [true, true, target]);
    assert.ok(near(beam.to.x - LANE.at.x, 136, 1e-9), JSON.stringify(beam));
    assert.ok(near(cone() / plain, .7), 'the close laser\'s .7 from the hip');
    // Raised halfway the help fades, raised fully it is gone (the HUD reads the handling a shot would meet).
    const at = (raise: number) => coneOf({ ...calm(), raise }, r.runtime.currentWeapon, r.runtime.shotGrip);
    const bare = (raise: number) => coneOf({ ...calm(), raise }, r.runtime.currentWeapon, r.runtime.grip);
    assert.ok(at(.5) > bare(.5) * .7 && at(.5) < bare(.5));
    assert.ok(near(at(1), bare(1)));
    assert.deepEqual([r.runtime.grip.hip, r.runtime.shotGrip.hip], [m4.hip, m4.hip * .7]);
    // 300 px out it is beyond the range: the dot still shows, the cone does not tighten.
    place(300);
    const far = r.runtime.laserBeam()!;
    assert.deepEqual([far.hit, far.inRange, far.target], [true, false, target]);
    assert.ok(near(cone(), plain));
    // Switched off: no beam, the plain cone at any distance.
    place(150); r.frame({ commands: ['laser'] });
    assert.equal(r.runtime.laserBeam(), null); assert.ok(near(cone(), plain));
});

test('a shot takes the laser\'s cone: the same raid and draw scatter .7 as far with the laser on a body in range', () => {
    const fire = (laser: boolean) => {
        const r = rig(LASER), target = r.runtime.enemies.find(e => e.hp > 0)!.uid;
        r.driver.placeEnemy(target, { x: LANE.at.x + 150, y: LANE.at.y });
        r.frame({ commands: laser ? ['laser'] : [] });
        r.runtime.handling = calm();
        const shot = r.frame({ firePressed: true }).events.find(e => e.type === 'shot' && e.shooter === 'player');
        assert.ok(shot?.type === 'shot');
        return shot.pellets[0].angle - LANE.aim;
    };
    const off = fire(false), on = fire(true);
    assert.ok(Math.abs(off) > 1e-6, 'the draw scatters the shot at all');
    assert.ok(near(on / off, .7, 1e-9), `${on} / ${off}`);
});

test('the laser never reaches into a room not revealed: a hidden body neither stops the beam nor tightens the cone', () => {
    // West of the resident building, aiming east through its west window into the ground floor, which is not revealed
    // from 200 px away (the window's cell is the room's).
    const r = rig([node('fit-h01', 'H01', 'handguard', [node('fit-t03', 'T03', 'side')])]);
    r.frame({ commands: ['laser'] });
    r.driver.placePlayer({ x: 112, y: 336 }, 0);
    const room = r.runtime.current().map.regions.find(g => g.inside)!;
    assert.equal(r.runtime.current().frame.revealed[room.id], false);
    const salt = r.runtime.enemies.find(e => e.hp > 0)!.uid;
    r.driver.placeEnemy(salt, { x: 400, y: 336 });
    assert.ok(r.runtime.sight({ x: 112, y: 336 }, { x: 400, y: 336 }), 'the window lets sight through');
    const hidden = r.runtime.laserBeam()!;
    assert.deepEqual([hidden.hit, hidden.inRange, hidden.target], [false, false, null]);
    assert.ok(hidden.to.x < room.x && hidden.to.x >= room.x - 4, `the beam ends at the room's edge: ${hidden.to.x}`);
    assert.ok(!r.runtime.current().frame.hud.devices!.laser!.inRange);
    // The same body outdoors, short of the window: the beam stops on it, in range.
    r.driver.placeEnemy(salt, { x: 250, y: 336 });
    const shown = r.runtime.laserBeam()!;
    assert.deepEqual([shown.target, shown.hit, shown.inRange], [salt, true, true]);
});

test('the light outlines containers and ground items in its reach and arc, in sight, on this floor, where shown; never an enemy', () => {
    const r = rig(LIGHT), at = (dx: number, dy = 0) => ({ x: LANE.at.x + dx, y: LANE.at.y + dy });
    const ahead = r.driver.spawnLoot('scrap', 1, at(100)), behind = r.driver.spawnLoot('scrap', 1, at(-100));
    const beyond = r.driver.spawnLoot('scrap', 1, at(200)), aside = r.driver.spawnLoot('scrap', 1, at(30, 90));
    const lit = () => r.runtime.current().frame.hud.devices?.light?.lit ?? null;
    assert.equal(lit(), null, 'off: nothing');
    r.frame({ commands: ['light'] });
    // T05: 170 px across 1.6 rad. Behind, beyond the reach and outside the arc (72 degrees off the aim) are not lit.
    assert.deepEqual(lit(), [ahead]);
    for (const uid of [behind, beyond, aside]) assert.ok(r.runtime.loot.some(l => l.uid === uid));
    // An enemy in the beam is never among the outlines; only containers and ground items are.
    const enemy = r.runtime.enemies.find(e => e.hp > 0)!.uid;
    r.driver.placeEnemy(enemy, at(60, 20));
    const ids = lit()!, items = new Set([...r.runtime.loot.map(l => l.uid), ...r.runtime.containers.map(c => c.id)]);
    assert.ok(!ids.includes(enemy) && ids.every(id => items.has(id)), JSON.stringify(ids));
    // A ground item in a room not revealed, in reach and arc and seen through the window, is not lit; one outside is.
    const far = rig([node('fit-h01', 'H01', 'handguard', [node('fit-t06', 'T06', 'side')])]);
    far.frame({ commands: ['light'] });
    far.driver.placePlayer({ x: 112, y: 336 }, 0);
    const inside = far.driver.spawnLoot('scrap', 1, { x: 400, y: 336 }), outside = far.driver.spawnLoot('wire', 1, { x: 250, y: 336 });
    assert.ok(far.runtime.sight({ x: 112, y: 336 }, { x: 400, y: 336 }));
    assert.deepEqual(far.runtime.current().frame.hud.devices!.light!.lit, [outside]);
    assert.ok(far.runtime.loot.some(l => l.uid === inside));
    // Behind the building: outdoors on the far side, in the far light's reach and arc, but no line of sight.
    far.driver.placePlayer({ x: 464, y: 440 }, -Math.PI / 2);
    const across = far.driver.spawnLoot('fuse', 1, { x: 464, y: 200 });
    assert.ok(!far.runtime.sight({ x: 464, y: 440 }, { x: 464, y: 200 }));
    assert.equal(far.runtime.current().frame.hud.devices!.light!.lit.includes(across), false);
    // Another floor: the coast's items are not this floor's, whatever their coordinates.
    const upstairs = rig(LIGHT);
    upstairs.frame({ commands: ['light'] });
    const coast = upstairs.driver.spawnLoot('scrap', 1, { x: 192, y: 196 });
    upstairs.driver.placePlayer({ x: 192, y: 176 }, Math.PI / 2, 'resident-f2');
    assert.equal(upstairs.runtime.current().stamp.world.mapId, 'resident-f2');
    assert.deepEqual(upstairs.runtime.current().frame.hud.devices!.light!.lit, []);
    assert.ok(!upstairs.runtime.loot.some(l => l.uid === coast));
});

test('exposure: a device on lets enemies in front notice the player from farther, by its spot factor; behind, off or holstered, not', () => {
    const r = rig(BOTH), front = { x: LANE.at.x + 200, y: LANE.at.y }, back = { x: LANE.at.x - 200, y: LANE.at.y };
    assert.deepEqual([r.runtime.exposure(front), r.runtime.exposure(back)], [1, 1]);
    r.frame({ commands: ['laser'] });
    assert.deepEqual([r.runtime.exposure(front), r.runtime.exposure(back)], [ATTACHMENTS.T03.mods.spot, 1]);
    r.frame({ commands: ['light'] });
    assert.equal(r.runtime.exposure(front), ATTACHMENTS.T03.mods.spot! * ATTACHMENTS.T05.mods.spot!, 'two devices on multiply');
    r.frame({ commands: ['knife'] });
    assert.equal(r.runtime.exposure(front), 1, 'with the knife drawn the gun points nowhere');
    // The real controllers, through the Runtime as their world: a scav (vision 220) 240 px in front notices the player
    // only with the laser on (220 x 1.15 = 253).
    const watch = (laser: boolean) => {
        const q = rig(LASER), scav = q.runtime.enemies.find(e => e.id === 'scav' && e.hp > 0)!;
        if (laser) q.frame({ commands: ['laser'] });
        q.driver.placeEnemy(scav.uid, { x: LANE.at.x + 240, y: LANE.at.y });
        const e = q.runtime.enemies.find(a => a.uid === scav.uid)!;
        q.runtime.updateEnemy(e, .05);
        return e.state;
    };
    assert.equal(D.ENEMIES.scav.vision, 220);
    const [off, on] = [watch(false), watch(true)];
    assert.ok(off !== 'chase' && off !== 'attack' && on === 'chase', `${off} ${on}`);
});

/** A bare world for the controllers, the player `distance` px east of the enemy, sight clear, `exposure` as given. */
function world(e: EnemyState, distance: number, exposure?: (from: { x: number; y: number }) => number) {
    return { elapsed: 0, player: { x: e.x + distance, y: e.y }, enemies: [e], highTide: false, shotNoise: null, noiseTime: 0, noiseRadius: 0, space: null,
        sight: () => true, walkable: () => true, path: (_a: unknown, b: { x: number; y: number }) => [b], dryRefuge: () => null,
        move: (a: { x: number; y: number }, dx: number, dy: number) => { a.x += dx; a.y += dy; }, ...exposure ? { exposure } : {} };
}
const legacy = (id: string): EnemyState => ({ uid: 'enemy-1', id, hp: D.ENEMIES[id].hp, x: 200, y: 200, rotation: 0, home: { x: 200, y: 200 },
    target: { x: 200, y: 200 }, state: 'patrol', timer: 5, cooldown: 0, path: [], repath: 0, alert: 0 });

test('exposure in both controllers: the old four see by vision x exposure, the new ones observe the player that far; others unchanged', () => {
    const effects = { random: () => .5, fire() {}, strike() {}, openDoor() {} };
    const seen = (exposure?: number) => { const e = legacy('salt'), w: LegacyEnemyWorld = world(e, 320, exposure === undefined ? undefined : () => exposure); advanceLegacyEnemy(w, effects, e, .05); return e.state; };
    assert.equal(D.ENEMIES.salt.vision, 300);
    assert.deepEqual([seen(), seen(1), seen(1.1)], ['patrol', 'patrol', 'chase']);
    const tactical = (exposure?: number) => {
        const e: EnemyState = { ...legacy('scav'), id: 'raider-gunner', hp: archetype('raider-gunner')!.hp, tactics: initialTactics('raider-gunner', 'test-group') };
        const vision = archetype('raider-gunner')!.vision, w = world(e, vision * 1.1, exposure === undefined ? undefined : () => exposure);
        advanceTacticalEnemy(w, { fire() {}, strike() {}, openDoor() {}, notice() {} }, e, .05);
        return e.tactics!.memory?.source ?? null;
    };
    assert.deepEqual([tactical(), tactical(1.15)], [null, 'sight']);
});
