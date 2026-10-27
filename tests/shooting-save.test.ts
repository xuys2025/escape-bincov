import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { emptyIntent } from '../src/raid-runtime/runtime';
import { SESSION_KEY } from '../src/recovery-store';
import { unsteadyAim } from '../src/shooting';
import { benchRaid, arm, replay, reopen, mouse, mouseHold } from './fixtures/shooting-bench';

// S5 of PR #39: weapon handling is never saved (maintainer, 2026-10-22). These checks hold the save boundary: the
// record keeps its format, a reload starts the aim at its worst, failed writes cannot reset it, and rounds are never
// made out of nothing. The #39 sample rifle with its endless reserve retired in #28 M2-01: the real M4A1 (`mb4a1`) is a
// saved gun like the others, so its id appears in records; its handling, like every gun's, never does.
const HANDLING_WORDS = ['handling', 'bloom', 'drift', 'sway', 'raise', 'trigger', 'clickLeft'];

test('a refresh mid-fight saves no handling: the new Runtime starts unsteady with the saved rounds, cooldown and bullets', () => {
    const b = arm(benchRaid(), 'pistol');
    replay(b, mouse([0, .3, .6]), .62, 60);
    assert.ok(b.runtime.handling.bloom > 0 && b.runtime.handling.drift > 0);
    assert.ok(b.runtime.checkpoint());
    const raw = b.data.get(SESSION_KEY)!;
    for (const word of HANDLING_WORDS) assert.equal(raw.includes(`"${word}"`), false, word);
    const saved = b.runtime.snapshot();
    const page = reopen(b), r = page.runtime;
    assert.deepEqual(r.handling, unsteadyAim());
    assert.equal(r.mag, D.WEAPONS.pistol.magazine - 3);
    assert.equal(r.fireCooldown, saved.fireCooldown);
    assert.deepEqual(r.bullets.map(x => x.uid), saved.bullets.map(x => x.uid));
    // Within a second of play the reopened aim is calm again; it never starts better than it was.
    assert.ok(r.current().frame.hud.aim.cone > b.runtime.current().frame.hud.aim.cone);
});

test('the M4A1 is saved as the gun it is: its instance and the rounds left in it, never its handling', () => {
    const b = arm(benchRaid(), 'mb4a1', { reserve: 60 }), r = b.runtime, uid = r.session.loadout!.weaponUid;
    const bag = structuredClone(r.session.loadout!.bag);
    // Fifteen shots at .1 s from its 30-round magazine.
    const log = replay(b, mouseHold(0, 1.45), 2, 60);
    assert.ok(log.aims.at(-1)!.bloom > 0, 'the burst bloomed the aim');
    assert.equal(r.mag, D.WEAPONS.mb4a1.magazine - 15);
    assert.ok(r.checkpoint());
    const raw = b.data.get(SESSION_KEY)!, loadout = b.saves.currentRecord()!.expansion!.raid!.loadout;
    for (const word of HANDLING_WORDS) assert.equal(raw.includes(`"${word}"`), false, word);
    assert.deepEqual([loadout.weapon, loadout.weaponUid, loadout.ammo, loadout.ammoRelief], ['mb4a1', uid, D.WEAPONS.mb4a1.magazine - 15, 0]);
    assert.deepEqual(loadout.bag, bag, 'the shots came from the magazine, not the bag');
    // A reopened page holds the same gun with the same rounds, its aim at its worst.
    const page = reopen(b).runtime;
    assert.deepEqual([page.session.loadout!.weaponUid, page.current().frame.hud.weapon.id, page.mag], [uid, 'mb4a1', D.WEAPONS.mb4a1.magazine - 15]);
    assert.deepEqual(page.handling, unsteadyAim());
});

test('a failed write rolls the world back but not the aim; a retried save does not reset it either', () => {
    const b = arm(benchRaid(), 'carbine'), r = b.runtime;
    replay(b, mouse([0, .25, .5]), .55, 60);
    const loot = r.loot[0] ?? null, before = { ...r.handling }, mag = r.mag;
    b.fail(true);
    assert.equal(r.checkpoint(), false);
    if (loot) r.pickupLoot(loot.uid);
    assert.deepEqual(r.handling, before);
    b.fail(false);
    assert.equal(r.retrySave(), true);
    assert.deepEqual(r.handling, before); assert.equal(r.mag, mag);
});

test('stairs keep bloom and drift, and a trigger held through them stays dead until released', () => {
    const b = benchRaid(), r = b.runtime;
    b.driver.freezeAI(true); b.driver.placePlayer({ x: 560, y: 272 }); b.driver.weapon('mb4a1');
    r.handling = { raise: 0, sway: 0, bloom: .8, drift: .6, settle: 0 };
    const mag = r.mag, held = { ...emptyIntent(), aim: 0, fireHeld: true };
    r.advance(1000, { ...held, interactPressed: true, firePressed: true });
    assert.equal(r.current().stamp.world.mapId, 'resident-f2');
    assert.equal(r.mag, mag, 'no shot on the frame that took the stairs');
    assert.ok(r.handling.bloom > .5 && r.handling.drift > .3, JSON.stringify(r.handling));
    r.advance(1050, held); r.advance(1400, held); assert.equal(r.mag, mag);
    r.advance(1450, { ...emptyIntent(), aim: 0 }); r.advance(1500, { ...held, firePressed: true }); assert.equal(r.mag, mag - 1);
});

test('a reload never duplicates rounds: what is left in the gun and the bag is what was carried minus what was fired', () => {
    const b = arm(benchRaid(), 'carbine', { reserve: 24 }), r = b.runtime;
    const count = () => D.count(r.session.loadout!.bag, 'ammoR') + r.mag;
    const total = count();
    replay(b, mouse([0, .3, .6, .9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3, 3.3, 3.6]), 6, 30);
    // Twelve shots empty the magazine and the thirteenth click starts a reload.
    assert.equal(count(), total - 12);
    assert.equal(r.mag, D.WEAPONS.carbine.magazine); assert.equal(D.count(r.session.loadout!.bag, 'ammoR'), total - 24);
    // The M4A1 (no longer the sample with an endless reserve): a held burst empties its 30 rounds, the reload takes the
    // bag's 24, and the burst goes on from those.
    const m4 = arm(benchRaid(), 'mb4a1', { reserve: 24 }), rm = m4.runtime;
    const carried = () => D.count(rm.session.loadout!.bag, 'ammoR') + rm.mag, before = carried();
    const log = replay(m4, mouseHold(0, 5.5), 6, 30);
    assert.ok(log.shots.length > D.WEAPONS.mb4a1.magazine, `${log.shots.length} shots: the burst went on after a reload`);
    assert.equal(carried(), before - log.shots.length);
    assert.equal(D.count(rm.session.loadout!.bag, 'ammoR'), 0);
});
