import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { BulletState } from '../src/checkpoint';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import type { BreathView, PublishedView, RaidIntent, StampedEvent } from '../src/raid-runtime/contract';
import { BUILDING_WORLD } from '../src/building-world';
import { changeLayer } from '../src/layer-transition';
import { BREATH_FULL, breathChance } from '../src/breath';
import { characterCritChance, snapshotChance, type CritSnapshot, type PerkId } from '../src/perks';
import { arm, perkBench, reopen, LANE, type Bench, type Gun } from './fixtures/shooting-bench';
import { makeV4 } from './fixtures/old-saves';

// CP-T07 of #77 (docs/CRITICAL-PERK-DESIGN.md section 4, docs/tasks/critical-perk-contract.md section 4): the breath
// charge of technique-15-a inside the one raid Runtime, through real frames and real shots. src/breath.ts and
// tests/breath.test.ts hold the pure rules; here the Runtime feeds them every substep and owns every interrupt.

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const intent = (patch: Partial<RaidIntent> = {}): RaidIntent => ({ ...emptyIntent(), aim: LANE.aim, ...patch });
/** The precise aim held on the desktop (the right button). */
const AIM: Partial<RaidIntent> = { precise: true };
const FRAME = 1000 / 60;
const IDLE: BreathView = { target: null, seconds: 0, chance: 0, full: BREATH_FULL };
/** Technique 15 and the carbine: 2.75% and 8% combine to 10.53%; with the full breath it is 37.371% (spec 2.1). */
const PLAIN = 1 - (1 - characterCritChance(15)) * .92, FULL = 1 - (1 - characterCritChance(15)) * .92 * .7;

/** A v3 raid holding `perks` (the breath perk unless told otherwise) at technique 15, `gun` armed on the bench lane. */
const breathBench = (gun: Gun = 'carbine', perks: PerkId[] = ['technique-15-a'], reserve = 60) => arm(perkBench(perks, 15), gun, { reserve });
/** Stand the `which`-th live enemy of `kind` `distance` px down the lane, east of the player; returns its uid. */
function foe(b: Bench, distance: number, kind = 'elite', which = 0, hp?: number): string {
    const uid = b.runtime.enemies.filter(e => e.hp > 0 && e.id === kind)[which].uid;
    b.driver.placeEnemy(uid, { x: LANE.at.x + distance, y: LANE.at.y }, hp);
    return uid;
}
/** Frame lengths (ms) covering `seconds` exactly: `rate` frames a second, or an uneven pattern repeated with its last frame cut short. */
function frames(seconds: number, rate: number | readonly number[] = 60): number[] {
    if (typeof rate === 'number') return Array.from({ length: Math.round(seconds * rate) }, () => 1000 / rate);
    const out: number[] = [];
    for (let left = seconds * 1000, i = 0; left > 1e-9; i++) { const ms = Math.min(rate[i % rate.length], left); out.push(ms); left -= ms; }
    return out;
}
/**
 * Drives one bench's Runtime on its own wall clock (ms); the first frame only starts the Runtime's clock. `keep` tops up
 * that enemy's health after every frame, so a string of shots stays on one live target.
 */
function pilot(b: Bench, keep?: string) {
    let wall: number | null = null;
    const frame = (ms: number, patch: Partial<RaidIntent> = {}): PublishedView => {
        wall = wall === null ? 1000 : wall + ms;
        const batch = b.runtime.advance(wall, intent(patch)), e = keep ? b.runtime.enemies.find(a => a.uid === keep)! : null;
        if (e && e.hp > 0 && e.hp < D.ENEMIES[e.id].hp) b.driver.placeEnemy(e.uid, { x: e.x, y: e.y }, D.ENEMIES[e.id].hp);
        return batch;
    };
    return {
        frame,
        get wall() { return wall ?? 1000; },
        /** Hold `patch` over frames of these lengths, `last` added to the final frame's intent; the final batch. */
        play(lengths: readonly number[], patch: Partial<RaidIntent> = {}, last: Partial<RaidIntent> = {}): PublishedView {
            let batch = b.runtime.current();
            lengths.forEach((ms, i) => { batch = frame(ms, i === lengths.length - 1 ? { ...patch, ...last } : patch); });
            return batch;
        },
    };
}
/** The published charge rests on `target` for `seconds`, its chance by the rule (or is empty), and the Runtime's own state agrees. */
function charged(b: Bench, view: BreathView | null, target: string | null, seconds = 0, label = '') {
    assert.ok(view, `${label}: the raid owns the perk`);
    assert.equal(view.target, target, label);
    assert.ok(near(view.seconds, seconds) && near(view.chance, breathChance(seconds)), `${label}: ${view.seconds} s, ${view.chance} (want ${seconds} s)`);
    assert.deepEqual(b.runtime.breath, { target: view.target, seconds: view.seconds }, label);
}
const hud = (b: Bench) => b.runtime.current().frame.hud.breath;
/** Every round the player fired among `events`, as the Runtime holds them right after that frame. */
const roundsIn = (b: Bench, events: readonly StampedEvent[]): BulletState[] =>
    events.flatMap(e => e.type === 'shot' && e.shooter === 'player' ? e.pellets.map(p => b.runtime.bullets.find(x => x.uid === p.bullet)!) : []);
/** The rounds of the one player shot among `events`. */
function shotOf(b: Bench, events: readonly StampedEvent[]): BulletState[] {
    assert.equal(events.filter(e => e.type === 'shot' && e.shooter === 'player').length, 1, 'one player shot');
    return roundsIn(b, events);
}
const fired = (events: readonly StampedEvent[]) => events.some(e => e.type === 'shot' && e.shooter === 'player');
/** The breath part of a round's snapshot: its chance (0 without the source) and the target it names. */
const breathIn = (crit: CritSnapshot | undefined) => ({ chance: crit?.sources.find(s => s.id === 'technique-15-a')?.chance ?? 0, target: crit?.target ?? null });
/** The round's snapshot took `seconds` of breath on `target`. */
function carries(round: BulletState, target: string | null, seconds: number, label = '') {
    const breath = breathIn(round.crit);
    assert.equal(breath.target, target, label);
    assert.ok(near(breath.chance, breathChance(seconds)), `${label}: ${breath.chance} (want ${seconds} s)`);
}
const hurts = (events: readonly StampedEvent[], uid: string) => events.flatMap(e => e.type === 'hurt' && e.uid === uid ? [[e.critical, e.damage]] : []);
/** The first RNG state from which `count` draws pass `test`. */
function rngWhere(count: number, test: (draws: number[]) => boolean): number {
    for (let s = 1; ; s++) { const random = D.seededRandom(s); if (test(Array.from({ length: count }, () => random()))) return s; }
}
/** The raid's random state, set as a checkpoint holding it would set it. */
function seed(b: Bench, rng: number) { const c = b.runtime.snapshot(); c.rng = rng; b.runtime.restore(c); }
/** Supplies put in the bag, as if picked up. */
function stock(b: Bench, items: Record<string, number>) {
    const c = b.runtime.snapshot();
    for (const [id, qty] of Object.entries(items)) assert.equal(D.addItem(c.loadout.bag, id, qty), 0);
    b.runtime.restore(c);
}

test('CP-12: 0, 1, 1.5, 3 and 4.5 s of breath give 0, 10, 15, 30 and 30% in the shot snapshot, alike at 20, 60, 144 Hz and on uneven frames', () => {
    const plan: [number, number][] = [[0, 0], [1, .1], [1.5, .15], [3, .3], [4.5, .3]];
    for (const rate of [20, 60, 144, [7, 23, 16, 41]] as const) {
        const b = breathBench(), uid = foe(b, 320), p = pilot(b, uid), label = String(rate);
        const crits = plan.map(([seconds]) => {
            // The first frame fires as the clock starts, no time aimed; every later shot ends a hold of `seconds`.
            const batch = seconds === 0 ? p.frame(0, { ...AIM, firePressed: true }) : p.play(frames(seconds, rate), AIM, { firePressed: true });
            // The shot took the whole charge: its frame ends with none, though the precise aim is still held.
            assert.deepEqual(batch.frame.hud.breath, IDLE, label);
            return shotOf(b, batch.events)[0].crit!;
        });
        crits.forEach((crit, i) => {
            const [seconds, chance] = plan[i], breath = breathIn(crit), what = `${label} after ${seconds} s`;
            assert.deepEqual(crit.sources.filter(s => s.id !== 'technique-15-a'), [{ id: 'character', chance: characterCritChance(15) }, { id: 'weapon', chance: .08 }], what);
            assert.ok(near(breath.chance, chance), `${what}: ${breath.chance}`);
            assert.equal(breath.target, seconds ? uid : null, what);
            assert.equal(crit.sources.some(s => s.id === 'technique-15-a'), seconds > 0, what);
        });
        // A full charge counts on its own enemy only: 37.371% there (spec 2.1), the plain 10.53% on any other.
        assert.ok(near(snapshotChance(crits[3], uid), FULL) && near(snapshotChance(crits[3], 'enemy-2'), PLAIN), label);
    }
});

test('CP-12: a held automatic trigger splits the charge at each shot instant, the same at every frame rate', () => {
    // The M4A1 held with the precise aim for 0.95 s from the clock's start: a round every 0.1 s, each taking the
    // 0.1 s (1%) charged since the round before, the first one none.
    const run = (rate: number | readonly number[]) => {
        const b = breathBench('mb4a1'), uid = foe(b, 320), p = pilot(b, uid), rounds = roundsIn(b, p.frame(0, { ...AIM, firePressed: true, fireHeld: true }).events);
        for (const ms of frames(.95, rate)) rounds.push(...roundsIn(b, p.frame(ms, { ...AIM, fireHeld: true }).events));
        return { uid, shots: rounds.map(x => ({ ...breathIn(x.crit), chance: Math.round(breathIn(x.crit).chance * 1e9) / 1e9 })) };
    };
    const base = run(60);
    assert.deepEqual(base.shots, [{ chance: 0, target: null }, ...Array(9).fill({ chance: .01, target: base.uid })]);
    for (const rate of [20, 144, [7, 23, 16, 41]] as const) assert.deepEqual(run(rate), base, String(rate));
});

test('CP-13: the edge of the hit circle charges as fast as its centre; walking with the precise button charges, walking on touch does not; no perk, no charge', () => {
    // The ray passes the target's centre 0, 7 and 13.9 px off: inside its 14 px hit circle, all alike; 14.1 px misses it.
    const aimed = (offset: number) => {
        const b = breathBench(), uid = foe(b, 320), p = pilot(b), aim = Math.asin(offset / 320);
        p.frame(0, { ...AIM, aim });
        return { b, uid, view: p.play(frames(2), { ...AIM, aim }).frame.hud.breath };
    };
    for (const offset of [0, 7, 13.9, -13.9]) { const a = aimed(offset); charged(a.b, a.view, a.uid, 2, `${offset} px off`); }
    const wide = aimed(14.1);
    charged(wide.b, wide.view, null, 0, '14.1 px off');

    const walking = (patch: Partial<RaidIntent>) => {
        const b = breathBench(), uid = foe(b, 320), p = pilot(b);
        p.frame(0, patch);
        return { b, uid, p, view: p.play(frames(1.5), patch).frame.hud.breath };
    };
    const step = { move: { x: 1, y: 0, sprint: false } }, touch = { source: 'touch' as const, aimHeld: true };
    // The precise button keeps the aim raised in a slowed walk (#39), so a desktop walk charges.
    const desk = walking({ ...AIM, ...step });
    assert.ok(desk.b.runtime.player.x > LANE.at.x + 100, 'walked toward the target');
    charged(desk.b, desk.view, desk.uid, 1.5, 'desktop walk');
    // The touch aim stick raises the aim only standing still: a walk never charges.
    const stroll = walking({ ...touch, ...step });
    assert.ok(stroll.b.runtime.player.x > LANE.at.x + 100);
    charged(stroll.b, stroll.view, null, 0, 'touch walk');
    // Standing with the stick in the inner ring charges; the first walking frame clears it.
    const stand = walking(touch);
    charged(stand.b, stand.view, stand.uid, 1.5, 'touch standing');
    charged(stand.b, stand.p.frame(FRAME, { ...touch, ...step }).frame.hud.breath, null, 0, 'touch walk after standing');
    // Past the fire ring a standing player keeps the aim and the carbine fires at its rate: every round after the first
    // takes the 0.24 s charged since the one before.
    const ring = breathBench(), target = foe(ring, 320), f = pilot(ring, target), rounds: BulletState[] = [];
    for (const ms of [0, ...frames(1)]) rounds.push(...roundsIn(ring, f.frame(ms, { ...touch, fireHeld: true }).events));
    assert.deepEqual(rounds.map(x => breathIn(x.crit).target), [null, target, target, target, target]);
    assert.ok(rounds.slice(1).every(x => near(breathIn(x.crit).chance, .024)), JSON.stringify(rounds.map(x => breathIn(x.crit))));

    // Without the perk a held precise aim adds nothing: no published charge, no breath source, no target.
    const none = breathBench('carbine', []), n = pilot(none);
    foe(none, 320); n.frame(0, AIM);
    const batch = n.play(frames(2), AIM, { firePressed: true });
    assert.equal(batch.frame.hud.breath, null);
    assert.deepEqual(breathIn(shotOf(none, batch.events)[0].crit), { chance: 0, target: null });
    assert.deepEqual(none.runtime.breath, { target: null, seconds: 0 });
});

test('CP-14: another enemy stepping into the aim restarts the charge, and the first one back starts over too', () => {
    const b = breathBench(), r = b.runtime, first = foe(b, 320), p = pilot(b);
    p.frame(0, AIM);
    charged(b, p.play(frames(1), AIM).frame.hud.breath, first, 1);
    const other = r.enemies.find(e => e.hp > 0 && e.id === 'scav')!, home = { x: other.x, y: other.y };
    b.driver.placeEnemy(other.uid, { x: LANE.at.x + 200, y: LANE.at.y });
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, other.uid, .5, 'a nearer enemy took the aim');
    b.driver.placeEnemy(other.uid, home);
    charged(b, p.play(frames(.25), AIM).frame.hud.breath, first, .25, 'back on the first one: no time carried over');
});

test('CP-14: a wall or a closed door cuts the aim; through the open door it charges, and shutting the door by hand clears it at once', () => {
    const b = breathBench(), r = b.runtime, uid = r.enemies.find(e => e.hp > 0 && e.id === 'elite')!.uid, p = pilot(b);
    const north = { ...AIM, aim: -Math.PI / 2 };
    // Outside the resident building, an enemy behind its south wall.
    b.driver.placePlayer({ x: 400, y: 436 }, north.aim); b.driver.placeEnemy(uid, { x: 400, y: 330 });
    p.frame(0, north);
    charged(b, p.play(frames(.5), north).frame.hud.breath, null, 0, 'wall');
    // Before the front door, the same enemy inside on the line through it.
    b.driver.placePlayer({ x: 464, y: 436 }, north.aim); b.driver.placeEnemy(uid, { x: 464, y: 330 });
    charged(b, p.play(frames(.5), north).frame.hud.breath, null, 0, 'closed door');
    b.driver.door('resident-front', true);
    charged(b, p.play(frames(1), north).frame.hud.breath, uid, 1, 'open door');
    b.driver.door('resident-front', false);
    charged(b, p.frame(FRAME, north).frame.hud.breath, null, 0, 'the door shut on the aim');
    b.driver.door('resident-front', true);
    charged(b, p.play(frames(.5), north).frame.hud.breath, uid, .5, 'open again: from zero');
    // E at the door shuts it and suppresses held input: the charge goes in that frame.
    const shut = p.frame(FRAME, { ...north, interactPressed: true });
    assert.equal(r.space!.doors['resident-front'], false);
    charged(b, shut.frame.hud.breath, null, 0, 'shut by hand');
});

test('CP-14: going out of reach or the target dying clears the charge, the death in its own frame', () => {
    // The pistol's round reaches 457 px: the hit circle's near edge is 426 px out at 440 and 466 px out at 480.
    const gun = breathBench('pistol'), far = foe(gun, 440), g = pilot(gun);
    g.frame(0, AIM);
    charged(gun, g.play(frames(1), AIM).frame.hud.breath, far, 1, 'in reach');
    gun.driver.placeEnemy(far, { x: LANE.at.x + 480, y: LANE.at.y });
    charged(gun, g.frame(FRAME, AIM).frame.hud.breath, null, 0, 'out of reach');

    // A round that kills the target clears the charge in that very frame, though the aim still rests on the spot.
    const b = breathBench(), weak = foe(b, 320, 'elite', 0, 30), p = pilot(b);
    p.frame(0, AIM);
    carries(shotOf(b, p.play(frames(1), AIM, { firePressed: true }).events)[0], weak, 1);
    let died = false;
    for (let i = 0; i < 60 && !died; i++) {
        const batch = p.frame(FRAME, AIM);
        died = batch.events.some(e => e.type === 'death' && e.uid === weak);
        if (died) charged(b, batch.frame.hud.breath, null, 0, 'the target died');
        else assert.equal(batch.frame.hud.breath!.target, weak, 'charging on it again while the round flies');
    }
    assert.ok(died);
    // Killed another way (the knife, the fixture), at once too.
    const next = foe(b, 320, 'elite', 0);
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, next, .5);
    b.driver.kill(next);
    charged(b, hud(b), null, 0, 'killed');
});

test('CP-14 and weapons: a sprint, a reload and drawing another weapon clear the charge; with the knife in hand it stays empty', () => {
    const b = breathBench(), r = b.runtime, uid = foe(b, 320), p = pilot(b);
    p.frame(0, AIM); p.play(frames(1), AIM);
    const sprint = p.frame(FRAME, { ...AIM, move: { x: 1, y: 0, sprint: true } });
    assert.ok(sprint.frame.player.state.sprinting);
    charged(b, sprint.frame.hud.breath, null, 0, 'sprint');
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, uid, .5, 'standing again');
    // A reload starts in the frame's first substep: the charge restarts there, and the aim held on charges again.
    p.play(frames(.5), AIM, { firePressed: true }); // spend a round
    p.play(frames(1), AIM);
    const reload = p.frame(FRAME, { ...AIM, commands: ['reload'] });
    assert.ok(r.reloadLeft > 0);
    charged(b, reload.frame.hud.breath, uid, FRAME / 1000, 'a reload began');
    p.play(frames(2), AIM); // the reload ends
    // The knife: cleared in the frame it comes out, and empty while it is in hand.
    const knife = p.frame(FRAME, { ...AIM, commands: ['knife'] });
    assert.equal(r.currentWeapon.id, 'knife');
    charged(b, knife.frame.hud.breath, null, 0, 'knife drawn');
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, null, 0, 'knife in hand');
    // The gun again comes out in the first substep, which then charges.
    charged(b, p.frame(FRAME, { ...AIM, commands: ['primary'] }).frame.hud.breath, uid, FRAME / 1000, 'gun drawn');
    // Another gun equipped from the bag clears it, each time: the M4A1, then the pistol.
    stock(b, { mb4a1: 1, pistol: 1 });
    p.play(frames(.5), AIM);
    assert.equal(r.equipItem(r.session.loadout!.bag.items.find(i => i.id === 'mb4a1')!.uid), 'committed');
    assert.equal(r.currentWeapon.id, 'mb4a1');
    charged(b, hud(b), null, 0, 'M4A1 equipped');
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, uid, .5);
    assert.equal(r.equipItem(r.session.loadout!.bag.items.find(i => i.id === 'pistol')!.uid), 'committed');
    assert.equal(r.currentWeapon.id, 'pistol');
    charged(b, hud(b), null, 0, 'pistol equipped');
});

test('CP-14: real damage clears the charge, blows, enemy rounds and every substep of bleeding alike; a hit that takes no health and a lower limit do not', () => {
    const b = breathBench(), r = b.runtime, uid = foe(b, 320), p = pilot(b);
    p.frame(0, AIM); p.play(frames(1), AIM);
    seed(b, rngWhere(2, d => d.every(x => x >= .5))); // both blows' bleeding rolls fail
    r.hurt(0, { x: r.player.x + 40, y: r.player.y });
    assert.equal(r.hp, 100);
    charged(b, hud(b), uid, 1, 'a blow that took no health');
    b.driver.hurt(5);
    assert.equal(r.hp, 95);
    charged(b, hud(b), null, 0, 'a blow that took 5');
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, uid, .5);
    // An enemy round that lands: its frame ends with no charge.
    const c = r.snapshot(), owner = r.enemies.find(e => e.hp > 0 && e.id === 'salt')!.uid;
    c.bullets.push({ uid: 'enemy-round', x: r.player.x + 15, y: r.player.y, rotation: Math.PI, vx: -365, vy: 0, left: 100, damage: 12, enemy: true, owner });
    r.restore(c);
    const struck = p.frame(FRAME, AIM);
    assert.ok(r.hp < 95 && struck.events.some(e => e.type === 'hurt' && e.uid === 'player' && e.cause === 'blow'));
    charged(b, struck.frame.hud.breath, null, 0, 'an enemy round');
    b.driver.vitals({ bleeding: false }); // whatever that round's roll gave
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, uid, .5);
    // Bleeding takes health every substep: no charge while it lasts. A bandage stops it and the charge starts again.
    b.driver.vitals({ bleeding: true });
    const hp = r.hp, bleeding = p.play(frames(.5), AIM);
    assert.ok(r.hp < hp);
    charged(b, bleeding.frame.hud.breath, null, 0, 'bleeding');
    stock(b, { bandage: 1 });
    assert.equal(r.useSupply('bandage'), 'committed');
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, uid, .5, 'bandaged');
    // A constitution dose running out lowers the health limit and clips health to it: no damage (spec 3.4), no clear.
    stock(b, { constitutionDose: 1 });
    assert.equal(r.useSupply('constitutionDose'), 'committed');
    b.driver.vitals({ hp: 112 });
    const dosed = r.snapshotExpansion(); dosed.body.effects.constitution = .001; r.restoreExpansion(dosed);
    const clip = p.frame(FRAME, AIM);
    assert.equal(r.hp, 100);
    assert.ok(clip.events.some(e => e.type === 'hurt' && e.uid === 'player' && e.cause === 'limit-change'));
    charged(b, clip.frame.hud.breath, uid, .5 + FRAME / 1000, 'a lower limit');
});

test('CP-15: pause, blur, an open panel or loot, reloadCommitted and a rebuilt Runtime leave no charge; the internal syncs keep it', () => {
    const b = breathBench(), r = b.runtime, uid = foe(b, 320), p = pilot(b);
    // A corpse 30 px down the lane to loot later; a corpse never takes the aim.
    const scav = foe(b, 30, 'scav');
    b.driver.kill(scav);
    p.frame(0, AIM);
    const charge = (seconds: number, label: string) => charged(b, p.play(frames(seconds), AIM).frame.hud.breath, uid, seconds, label);
    charge(1, 'past a corpse');
    // The Runtime's own syncs keep it: a world restore, a checkpoint, a supply from the bag, a periodic checkpoint.
    r.restoreExpansion(r.snapshotExpansion());
    charged(b, hud(b), uid, 1, 'restoreExpansion');
    assert.ok(r.checkpoint());
    charged(b, hud(b), uid, 1, 'checkpoint');
    stock(b, { focus: 1 });
    assert.equal(r.useSupply('focus'), 'committed');
    charged(b, hud(b), uid, 1, 'a supply used');
    charged(b, p.play(frames(2.5), AIM).frame.hud.breath, uid, 3.5, 'across a periodic checkpoint');
    // Pausing (the menu, a blur) clears it, and paused frames add nothing; after resuming it charges from zero.
    for (const reason of ['overlay', 'blur', 'stall'] as const) {
        r.pause(reason);
        charged(b, hud(b), null, 0, reason);
        charged(b, p.play(frames(.5), AIM).frame.hud.breath, null, 0, `${reason}: paused`);
        r.resume(); p.frame(FRAME, AIM); // the first frame back restarts the clock
        charge(1, `after ${reason}`);
    }
    // A panel the world runs on behind (inventory, map, reading): cleared, and nothing charges while it is open.
    r.setBlocked(true);
    charged(b, hud(b), null, 0, 'panel');
    charged(b, p.play(frames(.5), AIM).frame.hud.breath, null, 0, 'panel open');
    r.setBlocked(false); p.frame(FRAME, AIM);
    charge(1, 'panel closed');
    // Looting the corpse.
    assert.ok(r.activate({ runId: r.terminalLoadout.runId!, mapId: 'coast', kind: 'container', id: `corpse-${scav}` }));
    assert.equal(r.overlay, 'loot');
    charged(b, hud(b), null, 0, 'loot');
    r.setBlocked(false); p.frame(FRAME, AIM);
    charge(1, 'loot closed');
    // reloadCommitted rebuilds the world from the last checkpoint: no charge.
    assert.ok(r.checkpoint());
    r.reloadCommitted();
    charged(b, hud(b), null, 0, 'reloadCommitted');
    p.frame(FRAME, AIM);
    charge(.5, 'after reloadCommitted');
    // A reopened page builds a new Runtime: no charge, though the aim and its target are where they were.
    assert.ok(r.checkpoint());
    const page = reopen(b), again = { ...b, ...page, driver: createRuntimeTestDriver(page.runtime, '?test=1') }, q = pilot(again);
    page.runtime.freezeAI = true;
    charged(again, hud(again), null, 0, 'reopened');
    q.frame(0, AIM);
    charged(again, q.play(frames(1), AIM).frame.hud.breath, uid, 1, 'charging on the reopened page');
});

test('CP-15: taking the stairs leaves the charge behind with its target', () => {
    const b = breathBench(), uid = b.runtime.enemies.find(e => e.hp > 0 && e.id === 'elite')!.uid, p = pilot(b), west = { ...AIM, aim: Math.PI };
    b.driver.placePlayer({ x: 560, y: 272 }, Math.PI); b.driver.placeEnemy(uid, { x: 464, y: 272 });
    p.frame(0, west);
    charged(b, p.play(frames(1), west).frame.hud.breath, uid, 1, 'on the ground floor');
    const up = p.frame(FRAME, { ...west, interactPressed: true });
    assert.equal(up.map.key.mapId, 'resident-f2');
    assert.ok(up.events.some(e => e.type === 'layer'));
    charged(b, up.frame.hud.breath, null, 0, 'upstairs');
});

test('CP-14: a pursuer this layer still owns takes the aim as any enemy of the layer, until it leaves the layer', () => {
    const b = breathBench(), r = b.runtime, p = pilot(b);
    // A scav chasing the player up the resident stairs, and the player back on the ground floor before it gets there.
    const c = r.snapshotExpansion(), raid = c.raid!, chaser = raid.maps.coast.enemies.find(e => e.id === 'scav')!;
    raid.player = { x: 560, y: 272, rotation: 0 };
    Object.assign(chaser, { x: 528, y: 272, home: { x: 528, y: 272 }, target: { x: 560, y: 272 }, state: 'chase', alert: 5, path: [], repath: 0 });
    assert.ok(changeLayer(c, BUILDING_WORLD, 'resident-up'));
    const pursuit = raid.pursuits.find(x => x.enemy.uid === chaser.uid)!;
    assert.equal(pursuit.sourceMap, 'coast');
    raid.currentMap = 'coast'; raid.player = { x: 400, y: 272, rotation: 0 };
    r.restoreExpansion(c);
    p.frame(0, AIM);
    charged(b, p.play(frames(1), AIM).frame.hud.breath, chaser.uid, 1, 'the pursuer on its way to the stairs');
    assert.ok(r.snapshotExpansion().raid!.pursuits.some(x => x.enemy.uid === chaser.uid), 'still a pursuit');
    // It reaches the stairs and goes up after the player: gone from this layer, and the charge with it.
    const gone = p.play(frames(pursuit.arrivalAt - 1 + .1), AIM);
    assert.ok(!r.snapshotExpansion().raid!.pursuits.some(x => x.enemy.uid === chaser.uid) && !r.enemies.some(e => e.uid === chaser.uid));
    charged(b, gone.frame.hud.breath, null, 0, 'the pursuer left the layer');
});

test('CP-16: a shot snapshots the charge and then clears it; a cooling click and an empty magazine take nothing; every shotgun pellet carries the same target', () => {
    const b = breathBench('shotgun'), r = b.runtime, uid = foe(b, 200), p = pilot(b, uid);
    p.frame(0, AIM);
    const first = p.play(frames(1), AIM, { firePressed: true }), pellets = shotOf(b, first.events);
    assert.equal(pellets.length, 6);
    for (const x of pellets) assert.deepEqual(x.crit, pellets[0].crit);
    assert.equal(new Set(pellets.map(x => x.crit)).size, 6, 'one copy per pellet');
    carries(pellets[0], uid, 1);
    charged(b, first.frame.hud.breath, null, 0, 'the shot took it');
    // The aim held on charges again from zero, with no release needed.
    charged(b, p.play(frames(.1), AIM).frame.hud.breath, uid, .1, 'charging again');
    // 0.1 s after the shot the shotgun still cools for 0.62 s, beyond the 0.15 s a click may wait: no round, and the charge stays.
    const cooling = p.frame(FRAME, { ...AIM, firePressed: true });
    assert.ok(!fired(cooling.events));
    assert.equal(r.mag, 1);
    charged(b, cooling.frame.hud.breath, uid, .1 + FRAME / 1000, 'a cooling click');
    // A later click fires the second barrel with what was charged since the first.
    carries(shotOf(b, p.play(frames(1), AIM, { firePressed: true }).events)[0], uid, 1.1 + FRAME / 1000, 'the second barrel');
    // The magazine is empty now: once the gun has cooled, a click starts a reload from the bag, and that clears the charge.
    assert.equal(r.mag, 0);
    p.play(frames(1), AIM);
    const empty = p.frame(FRAME, { ...AIM, firePressed: true });
    assert.ok(!fired(empty.events) && r.reloadLeft > 0);
    charged(b, empty.frame.hud.breath, null, 0, 'an empty click that starts a reload');
    // With nothing to load, the click takes nothing: no round, no reload, only a notice, and the charge stays.
    const dry = breathBench('carbine', ['technique-15-a'], 0), target = foe(dry, 320), d = pilot(dry);
    dry.driver.magazine(0);
    d.frame(0, AIM); d.play(frames(1), AIM);
    const click = d.frame(FRAME, { ...AIM, firePressed: true });
    assert.ok(!fired(click.events) && click.events.some(e => e.type === 'notice'));
    assert.equal(dry.runtime.reloadLeft, 0);
    charged(dry, click.frame.hud.breath, target, 1 + FRAME / 1000, 'a dry click');
});

test('CP-17: a round charged on one enemy that hits another loses only the breath source', () => {
    // A full charge on an elite 600 px out, then a scav steps into the round's path 300 px out (or not).
    const run = (cut: boolean, lo: number, hi: number) => {
        const b = breathBench(), r = b.runtime, aimed = foe(b, 600), other = r.enemies.find(e => e.hp > 0 && e.id === 'scav')!.uid, p = pilot(b);
        p.frame(0, AIM); p.play(frames(3), AIM);
        seed(b, rngWhere(2, d => d[1] >= lo && d[1] < hi)); // one spread draw, then the hit's roll
        const events = [...p.frame(FRAME, { ...AIM, firePressed: true }).events];
        assert.deepEqual(breathIn(shotOf(b, events)[0].crit), { chance: .3, target: aimed });
        if (cut) b.driver.placeEnemy(other, { x: LANE.at.x + 300, y: LANE.at.y });
        for (let i = 0; i < 60; i++) events.push(...p.frame(FRAME, AIM).events);
        return [hurts(events, aimed), hurts(events, other)];
    };
    // A roll between 10.53% and 37.371% is critical on the charged elite and plain on the scav.
    assert.deepEqual(run(false, PLAIN, FULL), [[[true, 39 * 1.5]], []]);
    assert.deepEqual(run(true, PLAIN, FULL), [[], [[false, 39]]]);
    // A roll below 10.53% is critical on the scav too: the character and weapon sources stay (a 56-health scav takes 56).
    assert.deepEqual(run(true, 0, PLAIN), [[], [[true, 56]]]);
});

test('CP-18: a round in flight keeps its breath snapshot through a checkpoint and a reopened page, and lands the same critical hit', () => {
    const b = breathBench(), r = b.runtime, uid = foe(b, 600), p = pilot(b);
    p.frame(0, AIM); p.play(frames(3), AIM);
    seed(b, rngWhere(2, d => d[1] >= PLAIN && d[1] < FULL)); // critical only with the breath source, on its own target
    const [round] = shotOf(b, p.frame(FRAME, { ...AIM, firePressed: true }).events);
    assert.deepEqual(breathIn(round.crit), { chance: .3, target: uid });
    assert.ok(r.checkpoint());
    const saved = decodeSession(b.data.get(SESSION_KEY)!).expansion!.raid!;
    assert.deepEqual(saved.maps.coast.bullets, r.bullets);
    const page = reopen(b), again = page.runtime;
    again.freezeAI = true;
    assert.deepEqual(again.bullets, r.bullets);
    assert.equal(again.snapshot().rng, r.snapshot().rng);
    assert.deepEqual(again.current().frame.hud.breath, IDLE, 'a rebuilt Runtime starts with no charge');
    again.advance(p.wall, intent(AIM)); // its first frame starts its clock
    const fly = (runtime: CoastRaidRuntime) => {
        const events: StampedEvent[] = [];
        for (let i = 1; i <= 60; i++) events.push(...runtime.advance(p.wall + i * FRAME, intent(AIM)).events);
        return { blows: hurts(events, uid), raid: runtime.snapshotExpansion().raid };
    };
    const kept = fly(r), resumed = fly(again);
    assert.deepEqual(kept.blows, [[true, 39 * 1.5]]);
    assert.deepEqual(resumed.blows, kept.blows);
    assert.deepEqual(resumed.raid, kept.raid);
});

test('v2 and classic raids never charge: no published breath, and a held precise aim puts nothing in their rounds', () => {
    const quiet = (b: Bench, label: string) => {
        const r = b.runtime, uid = r.enemies.find(e => e.hp > 0)!.uid, p = pilot(b);
        b.driver.placeEnemy(uid, { x: LANE.at.x + 320, y: LANE.at.y });
        p.frame(0, AIM);
        const batch = p.play(frames(1.5), AIM, { firePressed: true });
        assert.equal(batch.frame.hud.breath, null, label);
        assert.deepEqual(r.breath, { target: null, seconds: 0 }, label);
        assert.equal('crit' in shotOf(b, batch.events)[0], false, label);
    };
    // v2: the record a v4 client wrote for a deployment at the breath perk's level, resumed by this page.
    const v4 = perkBench(['technique-15-a'], 15), record = JSON.parse(v4.data.get(SESSION_KEY)!);
    makeV4(record);
    v4.data.set(SESSION_KEY, JSON.stringify(record));
    const page = reopen(v4), v2 = arm({ ...v4, ...page, driver: createRuntimeTestDriver(page.runtime, '?test=1') }, 'carbine');
    assert.equal(v2.runtime.layered!.raid!.version, 2);
    quiet(v2, 'v2');
    // A classic checkpoint raid.
    const state = createSessionState(), data = new Map<string, string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
    const saves = new SaveSession(state, () => storage);
    assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42), true); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves), classic = arm({ state, saves, runtime, driver: createRuntimeTestDriver(runtime, '?test=1'), storage, data, fail() {} }, 'carbine');
    assert.equal(runtime.layered, null);
    quiet(classic, 'classic');
});
