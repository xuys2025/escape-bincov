import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { BulletState, EnemyState } from '../src/checkpoint';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import type { RaidIntent, StampedEvent } from '../src/raid-runtime/contract';
import { activeRaidCheckpoint, applyActiveRaidSnapshot } from '../src/raid-state-projection';
import { resolveLayerShot, type ShotObservation } from '../src/layer-transition';
import { criticalChance } from '../src/rpg';
import type { ExpansionState } from '../src/expansion-state';
import { characterCritChance, critChance, critMultiplier, critSources, snapshotChance, type CritInput, type CritSnapshot, type PerkId } from '../src/perks';
import type { Cell } from '../src/spatial';
import { arm, perkBench, reopen, LANE, type Bench } from './fixtures/shooting-bench';
import { plainCrit, prototypeRaid, prototypeWorld } from './fixtures/layered';
import { makeV4 } from './fixtures/old-saves';

// CP-T04 of #77 (docs/CRITICAL-PERK-DESIGN.md sections 2 and 4.2, docs/tasks/critical-perk-contract.md section 3): a
// gun shot in a v3 raid snapshots its critical sources once, every pellet keeps its own copy, and each hit on a live
// enemy rolls that snapshot once from the raid's RNG. v2 raids keep the old formula and v1 raids never crit. Shots here
// are fired without a held precise aim, so they carry no breath charge (technique-15-a): breath-runtime.test.ts has it.

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
const intent = (patch: Partial<RaidIntent> = {}): RaidIntent => ({ ...emptyIntent(), aim: LANE.aim, ...patch });
/** The first RNG state from which `count` draws pass `test`. */
function rngWhere(count: number, test: (draws: number[]) => boolean): number {
    for (let s = 1; ; s++) { const random = D.seededRandom(s); if (test(Array.from({ length: count }, () => random()))) return s; }
}
/** The RNG state after `count` draws from `state`. */
const drawn = (state: number, count: number) => { const random = D.seededRandom(state); for (let i = 0; i < count; i++) random(); return random.getState(); };
/** What critSources takes for a shot: technique 10 and the pistol, with nothing else unless given. */
const input = (patch: Partial<CritInput> = {}): CritInput => ({ technique: 10, weapon: D.WEAPONS.pistol, perks: [], focus: false, breath: 0, ...patch });
const snapshotOf = (patch: Partial<CritInput> = {}): CritSnapshot => ({ sources: critSources(input(patch))!, multiplier: critMultiplier(patch.perks ?? []), target: null });

/** Stand the first live enemy of `kind` `distance` px east of the player on the bench lane, calm; returns its uid. */
function target(b: Bench, distance: number, kind = 'elite', hp?: number): string {
    const uid = b.runtime.enemies.find(e => e.hp > 0 && e.id === kind)!.uid;
    b.driver.placeEnemy(uid, { x: LANE.at.x + distance, y: LANE.at.y }, hp);
    return uid;
}
/** The raid's random state, set as a checkpoint holding it would set it. */
function seed(b: Bench, rng: number) { const c = b.runtime.snapshot(); c.rng = rng; b.runtime.restore(c); }
/** Supplies put in the bag, as if picked up. */
function stock(b: Bench, items: Record<string, number>) {
    const c = b.runtime.snapshot();
    for (const [id, qty] of Object.entries(items)) assert.equal(D.addItem(c.loadout.bag, id, qty), 0);
    b.runtime.restore(c);
}
/** A click at wall time `at` ms (the shot leaves at the end of that frame), then `frames` frames of 100 ms; the events published. */
function fire(b: Bench, at: number, frames = 0): StampedEvent[] {
    const events = [...b.runtime.advance(at, intent({ firePressed: true })).events];
    for (let i = 1; i <= frames; i++) events.push(...b.runtime.advance(at + i * 100, intent()).events);
    return events;
}
const hurts = (events: readonly StampedEvent[], uid: string) => events.flatMap(e => e.type === 'hurt' && e.uid === uid ? [e] : []);
/** The rounds of the latest player shot among `events`, as the Runtime holds them. */
function shotRounds(b: Bench, events: readonly StampedEvent[]): BulletState[] {
    const shot = events.filter(e => e.type === 'shot' && e.shooter === 'player').at(-1);
    assert.ok(shot?.type === 'shot');
    return shot.pellets.map(p => b.runtime.bullets.find(x => x.uid === p.bullet)!);
}
const health = (b: Bench, uid: string) => b.runtime.enemies.find(e => e.uid === uid)!.hp;

const foe = (uid: string, x: number, y: number, kind = 'scav', hp = D.ENEMIES[kind].hp): EnemyState => ({ uid, id: kind, x, y, hp, rotation: 0,
    home: { x, y }, target: { x, y }, state: 'patrol', timer: 2, cooldown: .7, path: [], repath: 0, alert: 0 });
/** The prototype raid (tests/fixtures/layered.ts) as a raid of `version` on a matching expansion, with no round in flight. */
function prototype(version: 1 | 2 | 3, cells: [number, number, Cell][] = []) {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    for (const [x, y, cell] of cells) world.maps.upstairs.cells[y][x] = cell;
    if (version > 1) { Object.assign(state, { version, charm: null, awards: [] }); Object.assign(raid, { version, shockAt: -10, mapEvent: 'none' }); }
    if (version === 3) state.growth.perks = [];
    raid.maps.downstairs.bullets = [];
    return { world, profile, state, raid };
}
/**
 * One player round on the upstairs layer of the prototype from (40, 100) along +x (its wall is 248 px out) into
 * `enemies`, resolved once. A v3 round carries the plain pistol snapshot unless `round` says otherwise. Returns what the
 * hit callback and the observer saw, the health each enemy lost and the RNG state before the shot.
 */
function resolve(version: 1 | 2 | 3, enemies: EnemyState[], { round = {}, edit, cells }: { round?: Partial<BulletState>; edit?: (state: ExpansionState) => void; cells?: [number, number, Cell][] } = {}) {
    const { world, state, raid } = prototype(version, cells);
    raid.maps.upstairs.enemies = enemies; edit?.(state);
    const rng = raid.rng, hp = enemies.map(e => e.hp), feedback: boolean[] = [], observed: ShotObservation[] = [];
    const done = resolveLayerShot(state, world, 'upstairs', { uid: 'shot-9', x: 40, y: 100, rotation: 0, vx: 500, vy: 0, left: 240, damage: 5, enemy: false,
        ...(version === 3 ? { crit: plainCrit() } : {}), ...round }, true, (_uid, critical) => feedback.push(critical), undefined, e => observed.push(e));
    return { state, raid, done, rng, feedback, critical: observed.filter(e => e.target).map(e => e.critical), dealt: enemies.map((e, i) => hp[i] - e.hp) };
}

test('CP-16: a shot that spends its round snapshots once and hands every pellet its own copy; a cooling click or an empty magazine snapshots nothing', () => {
    const b = arm(perkBench(), 'shotgun'), r = b.runtime, rng = r.snapshot().rng;
    const pellets = shotRounds(b, fire(b, 1000)), expected = snapshotOf({ weapon: D.WEAPONS.shotgun });
    assert.equal(pellets.length, 6); assert.equal(r.mag, D.WEAPONS.shotgun.magazine - 1);
    for (const p of pellets) assert.deepEqual(p.crit, expected);
    assert.equal(new Set(pellets.map(p => p.crit)).size, 6, 'one copy per pellet, never a shared object');
    // Taking the snapshot draws nothing: the six spread draws are all the shot takes from the RNG.
    assert.equal(r.snapshot().rng, drawn(rng, 6));
    // 0.1 s later the gun still cools for 0.62 s, beyond the 0.15 s a click may wait: no round and no snapshot.
    const uids = r.bullets.map(x => x.uid).sort(), cooled = r.snapshot().rng;
    assert.ok(!fire(b, 1100).some(e => e.type === 'shot'));
    assert.equal(r.mag, D.WEAPONS.shotgun.magazine - 1); assert.deepEqual(r.bullets.map(x => x.uid).sort(), uids); assert.equal(r.snapshot().rng, cooled);
    // A pull on an empty magazine starts a reload instead: no round, no snapshot, no draw.
    b.driver.magazine(0); r.advance(2000, intent()); // by now the pellets have flown out of range
    const emptied = r.snapshot().rng;
    assert.ok(!fire(b, 2100).some(e => e.type === 'shot'));
    assert.deepEqual(r.bullets, []); assert.ok(r.reloadLeft > 0); assert.equal(r.snapshot().rng, emptied);
});

test('CP-04: a real shot snapshots the technique of that instant (dose included), the gun fired (the M4A1 included), focus and the owned perks', () => {
    // Technique 10 and nothing else: the pistol 6.9%, the shotgun 4.94%, the carbine 9.84% (spec 2.1); the M4A1
    // states its own 5% weapon source.
    for (const [gun, weapon, chance] of [['pistol', D.WEAPONS.pistol, .069], ['shotgun', D.WEAPONS.shotgun, .0494], ['carbine', D.WEAPONS.carbine, .0984],
        ['mb4a1', D.WEAPONS.mb4a1, 1 - .98 * .95]] as const) {
        const b = arm(perkBench(), gun), [round] = shotRounds(b, fire(b, 1000));
        assert.deepEqual(round.crit, snapshotOf({ weapon }), gun); assert.ok(near(critChance(round.crit!.sources), chance), gun);
    }
    // The technique A line: 20-a and 30-a are independent 5% and 10% sources and 25-a sets the multiplier to 1.7.
    const b = arm(perkBench(['technique-20-a', 'technique-25-a', 'technique-30-a'], 30), 'carbine'), r = b.runtime;
    const [plain] = shotRounds(b, fire(b, 1000));
    assert.deepEqual(plain.crit, { sources: [{ id: 'character', chance: characterCritChance(30) }, { id: 'weapon', chance: .08 },
        { id: 'technique-20-a', chance: .05 }, { id: 'technique-30-a', chance: .1 }], multiplier: 1.7, target: null });
    // A technique dose (effective 35) moves only the character source, by 0.75 points; focus adds one 5% source.
    stock(b, { techniqueDose: 1, focus: 2 });
    assert.equal(r.useSupply('techniqueDose'), 'committed'); assert.equal(r.useSupply('focus'), 'committed');
    const [dosed] = shotRounds(b, fire(b, 1500)), sources = dosed.crit!.sources;
    assert.deepEqual(sources.map(s => s.id), ['character', 'weapon', 'technique-20-a', 'technique-30-a', 'focus']);
    assert.ok(near(sources[0].chance - characterCritChance(30), .0075)); assert.deepEqual(sources.slice(1), [...plain.crit!.sources.slice(1), { id: 'focus', chance: .05 }]);
    // CP-02: the chances of not critting multiply, in any order of the sources.
    const chance = snapshotChance(dosed.crit!, 'enemy-2');
    assert.ok(near(chance, 1 - sources.reduce((miss, s) => miss * (1 - s.chance), 1)) && chance < sources.reduce((sum, s) => sum + s.chance, 0));
    assert.equal(snapshotChance({ ...dosed.crit!, sources: [...sources].reverse() }, 'enemy-2'), chance);
    // Another dose of focus a second later refreshes its timer and adds no second source.
    r.advance(2500, intent()); assert.equal(r.useSupply('focus'), 'committed');
    assert.deepEqual(shotRounds(b, fire(b, 3000))[0].crit, dosed.crit);
});

test('CP-02 and the technique A line: a hit rolls its snapshot once with the chances of not critting multiplied, and technique-25-a deals x1.7 once', () => {
    const perks: PerkId[] = ['technique-20-a', 'technique-25-a', 'technique-30-a'];
    const p = critChance(critSources(input({ technique: 30, weapon: D.WEAPONS.carbine, perks }))!), plain = critChance(critSources(input({ technique: 30, weapon: D.WEAPONS.carbine }))!);
    const sum = characterCritChance(30) + .08 + .05 + .1; // what adding the chances would give
    assert.ok(near(p, 1 - .95 * .92 * .95 * .9) && plain < p && p < sum);
    // One carbine round (one spread draw, then the hit's roll) into a calm elite 100 px out.
    const hit = (owned: PerkId[], lo: number, hi: number) => {
        const b = arm(perkBench(owned, 30), 'carbine'), uid = target(b, 100);
        seed(b, rngWhere(2, d => d[1] >= lo && d[1] < hi));
        const blows = hurts(fire(b, 1000, 3), uid);
        assert.equal(blows.length, 1);
        assert.ok(near(blows[0].damage, 39 * (blows[0].critical ? critMultiplier(owned) : 1)));
        return blows[0].critical;
    };
    assert.equal(hit(perks, p - .02, p), true);
    assert.equal(hit(perks, p, sum), false, 'the sources never add up');
    assert.equal(hit(perks, plain, p), true);
    assert.equal(hit([], plain, p), false, 'without 20-a and 30-a the same draw is no critical hit');
    assert.equal(hit([], 0, plain), true);
});

test('CP-06: shotgun pellets roll one by one on the shot\'s one snapshot, a critical pellet deals x1.5 once, and training counts the health taken', () => {
    const b = arm(perkBench(), 'shotgun'), r = b.runtime, uid = target(b, 40);
    const p = critChance(critSources(input({ weapon: D.WEAPONS.shotgun }))!); // 4.94%
    // Six spread draws come first, then one roll for each pellet that lands: a state whose rolls mix both outcomes.
    const s = rngWhere(12, d => d.slice(6).some(x => x < p) && d.slice(6).some(x => x >= p));
    const random = D.seededRandom(s), rolls = Array.from({ length: 12 }, () => random()).slice(6), crits = rolls.filter(x => x < p).length;
    seed(b, s);
    const hp = health(b, uid), trained = r.snapshotExpansion().raid!.training.quantity.technique;
    const blows = hurts(fire(b, 1000, 2), uid);
    assert.equal(blows.length, 6); assert.ok(crits > 0 && crits < 6);
    assert.equal(blows.filter(e => e.critical).length, crits);
    for (const e of blows) assert.equal(e.damage, e.critical ? 22.5 : 15);
    const total = 15 * 6 + 7.5 * crits, after = r.snapshotExpansion().raid!;
    assert.equal(hp - health(b, uid), total); assert.equal(after.rng, drawn(s, 12));
    assert.ok(near(after.training.quantity.technique - trained, total / 400));
    // A critical carbine round on 30 health takes 30, trains on those 30 and leaves one corpse.
    const k = arm(perkBench(), 'carbine'), weak = target(k, 100, 'elite', 30);
    seed(k, rngWhere(2, d => d[1] < critChance(snapshotOf({ weapon: D.WEAPONS.carbine }).sources)));
    const before = k.runtime.snapshotExpansion().raid!.training.quantity.technique;
    assert.deepEqual(hurts(fire(k, 1000, 3), weak).map(e => [e.critical, e.damage]), [[true, 30]]);
    const done = k.runtime.snapshotExpansion().raid!;
    assert.ok(near(done.training.quantity.technique - before, 30 / 400));
    assert.equal(done.maps.coast.containers.filter(c => c.id === `corpse-${weak}`).length, 1);
});

test('CP-17: drawing another weapon or focus running out after the shot never changes the round in flight', () => {
    const b = arm(perkBench(), 'carbine'), r = b.runtime, uid = target(b, 320);
    stock(b, { focus: 1 }); assert.equal(r.useSupply('focus'), 'committed');
    const live = r.snapshotExpansion(); live.body.effects.focus = .05; r.restoreExpansion(live); // runs out in the next frame
    const fired = snapshotOf({ weapon: D.WEAPONS.carbine, focus: true });
    // A roll that is critical only while focus counts: 9.84% for the carbine alone, 14.35% with focus.
    seed(b, rngWhere(2, d => d[1] >= critChance(snapshotOf({ weapon: D.WEAPONS.carbine }).sources) && d[1] < critChance(fired.sources)));
    const events = fire(b, 1000), [round] = shotRounds(b, events);
    assert.deepEqual(round.crit, fired);
    events.push(...r.advance(1100, intent({ commands: ['knife'] })).events);
    assert.equal(r.currentWeapon.id, 'knife'); assert.equal(r.snapshotExpansion().body.effects.focus, 0);
    assert.deepEqual(r.bullets.find(x => x.uid === round.uid)!.crit, fired, 'the round in flight keeps the snapshot of its shot');
    for (let t = 1200; t <= 1500; t += 100) events.push(...r.advance(t, intent()).events);
    assert.deepEqual(hurts(events, uid).map(e => [e.critical, e.damage]), [[true, 39 * 1.5]]);
});

test('CP-18: a checkpoint keeps rounds in flight with their snapshots and RNG; a reopened page lands the same hits and restores never repeat one', () => {
    // Six pellets leave for an elite 120 px out with 25 health: two pellets kill it, the rest fly past the corpse.
    const p = critChance(critSources(input({ technique: 20, weapon: D.WEAPONS.shotgun, perks: ['technique-20-a'] }))!);
    const setup = () => {
        const b = arm(perkBench(['technique-20-a'], 20), 'shotgun'), uid = target(b, 120, 'elite', 25);
        seed(b, rngWhere(7, d => d[6] < p)); // after the six spread draws, the first roll is critical
        fire(b, 1000);
        return { b, uid };
    };
    /** Four frames of 100 ms after the frame at `from` ms. */
    const fly = (runtime: CoastRaidRuntime, uid: string, from = 1000) => {
        const events: StampedEvent[] = [];
        for (let t = from + 100; t <= from + 400; t += 100) events.push(...runtime.advance(t, intent()).events);
        return { blows: hurts(events, uid).map(e => [e.critical, e.damage]), state: runtime.snapshotExpansion() };
    };
    const { b, uid } = setup(), r = b.runtime, rounds = structuredClone(r.bullets);
    assert.equal(rounds.length, 6); assert.ok(rounds.every(x => x.crit && x.crit.sources.some(s => s.id === 'technique-20-a')));
    assert.ok(r.checkpoint());
    const saved = decodeSession(b.data.get(SESSION_KEY)!).expansion!.raid!;
    assert.deepEqual(saved.maps.coast.bullets, rounds); assert.equal(saved.rng, r.snapshot().rng);
    // A page reload rebuilds the Runtime from that record: the same rounds and RNG, and the same hits as the page that
    // kept running (its first frame only starts its clock).
    const page = reopen(b), again = page.runtime;
    again.freezeAI = true;
    assert.deepEqual(again.bullets, rounds); assert.equal(again.snapshot().rng, saved.rng);
    again.advance(1000, intent());
    const kept = fly(r, uid), resumed = fly(again, uid);
    assert.ok(kept.blows.length >= 2 && kept.blows[0][0] === true, JSON.stringify(kept.blows));
    assert.deepEqual(resumed.blows, kept.blows); assert.deepEqual(resumed.state.raid, kept.state.raid);
    assert.equal(kept.state.raid!.maps.coast.containers.filter(c => c.id === `corpse-${uid}`).length, 1);
    // Restoring the same checkpoint again and again never repeats a hit: the rounds fly again from it and land the
    // same blows once, and after the hits are saved, restores bring back exactly that world.
    const other = setup(), inFlight = structuredClone(other.b.runtime.bullets);
    assert.ok(other.b.runtime.checkpoint());
    const first = fly(other.b.runtime, other.uid);
    assert.deepEqual(first.blows, kept.blows);
    other.b.runtime.reloadCommitted();
    assert.equal(health(other.b, other.uid), 25); assert.deepEqual(other.b.runtime.bullets, inFlight);
    other.b.runtime.advance(2000, intent()); // a reload restarts the clock: this frame only starts it
    const second = fly(other.b.runtime, other.uid, 2000);
    assert.deepEqual(second.blows, first.blows); assert.deepEqual(second.state.raid, first.state.raid);
    assert.ok(other.b.runtime.checkpoint());
    // The checkpoint credits the training earned so far; the hits, corpse, RNG and training quantity are the flight's.
    const committed = other.b.runtime.snapshotExpansion().raid!, world = (raid: typeof committed) => ({ coast: raid.maps.coast, kills: raid.kills, rng: raid.rng, quantity: raid.training.quantity });
    assert.deepEqual(world(committed), world(second.state.raid!));
    for (let i = 0; i < 2; i++) { other.b.runtime.reloadCommitted(); assert.deepEqual(other.b.runtime.snapshotExpansion().raid, committed); }
});

test('CP-18: settling a round when the player takes the stairs gives the hit it would have had in flight', () => {
    // At the resident stairs (coast 560, 272) facing west: an elite 96 px out along a clear floor row.
    const run = (depart: boolean) => {
        const b = arm(perkBench(), 'carbine'), r = b.runtime, uid = r.enemies.find(e => e.hp > 0 && e.id === 'elite')!.uid;
        b.driver.placePlayer({ x: 560, y: 272 }, Math.PI); b.driver.placeEnemy(uid, { x: 464, y: 272 });
        seed(b, rngWhere(2, d => d[1] < .05)); // a critical roll for the plain carbine snapshot
        const events = [...r.advance(1000, intent({ aim: Math.PI, firePressed: true })).events];
        events.push(...r.advance(1010, intent({ aim: Math.PI, interactPressed: depart })).events);
        assert.equal(r.current().map.key.mapId, depart ? 'resident-f2' : 'coast');
        for (let t = 1100; t <= 1300; t += 100) events.push(...r.advance(t, intent({ aim: Math.PI })).events);
        const raid = r.snapshotExpansion().raid!, enemy = [...Object.values(raid.maps).flatMap(m => m.enemies), ...raid.pursuits.map(e => e.enemy)].find(e => e.uid === uid)!;
        return { blows: hurts(events, uid).map(e => [e.critical, e.damage]), hp: enemy.hp, rng: raid.rng };
    };
    const flight = run(false);
    assert.deepEqual(flight.blows, [[true, 39 * 1.5]]);
    assert.deepEqual(run(true), flight);
});

test('CP-01: where a round meets the body and what kind of enemy takes it never change the chance; the same draw gives the same result', () => {
    // The plain pistol snapshot gives 6.9%: a draw of 3% to 6.5% is a critical hit wherever the round lands and one of
    // 7% to 9.5% never is. The callback, the observer and the damage agree.
    const low = rngWhere(1, ([d]) => d >= .03 && d < .065), high = rngWhere(1, ([d]) => d >= .07 && d < .095);
    for (const [rng, critical] of [[low, true], [high, false]] as const)
        for (const kind of ['creature', 'scav', 'elite']) for (const offset of [0, 7, 13.9, -13.9]) {
            const shot = resolve(3, [foe('enemy-a', 200, 100 + offset, kind)], { edit: s => { s.raid!.rng = rng; } }), label = `${kind} ${offset}`;
            assert.deepEqual([shot.feedback, shot.critical, shot.dealt], [[critical], [critical], [critical ? 7.5 : 5]], label);
            assert.equal(shot.raid.rng, drawn(rng, 1), label);
        }
    // Under the old v2 rule (10% at the centre, about 2% at the edge) the same draws depend on the spot.
    const v2 = (rng: number, offset: number) => resolve(2, [foe('enemy-a', 200, 100 + offset)], { edit: s => { s.raid!.rng = rng; } }).feedback[0];
    assert.deepEqual([v2(low, 0), v2(low, 13.9), v2(high, 0), v2(high, 13.9)], [true, false, true, false]);
});

test('CP-05: a miss, a wall, a corpse and the knife draw no critical roll, and enemy rounds never use the player rule', () => {
    const sure = rngWhere(1, ([d]) => d < .01), quiet = (shot: ReturnType<typeof resolve>) => {
        assert.deepEqual([shot.feedback, shot.raid.rng], [[], shot.rng]); assert.ok(shot.dealt.every(d => d === 0));
    };
    const edit = (s: ExpansionState) => { s.raid!.rng = sure; };
    quiet(resolve(3, [foe('enemy-a', 200, 140)], { edit })); // off the line
    quiet(resolve(3, [foe('enemy-a', 200, 100)], { edit, cells: [[4, 3, 'wall']] })); // behind a wall
    quiet(resolve(3, [foe('enemy-d', 120, 100, 'scav', 0)], { edit })); // a corpse on the line
    // A corpse in front: the live enemy behind it takes the hit and the one roll.
    const behind = resolve(3, [foe('enemy-d', 120, 100, 'scav', 0), foe('enemy-a', 200, 100)], { edit });
    assert.deepEqual([behind.feedback, behind.dealt, behind.raid.rng], [[true], [0, 7.5], drawn(sure, 1)]);
    // The knife: a swing that lands deals the knife's own damage and draws nothing.
    const b = arm(perkBench(), 'carbine'), r = b.runtime, uid = target(b, 30);
    r.advance(1000, intent({ commands: ['knife'] }));
    const rng = r.snapshot().rng, events = fire(b, 1100);
    assert.ok(events.some(e => e.type === 'melee' && e.hit === uid));
    assert.deepEqual(hurts(events, uid).map(e => [e.critical, e.damage]), [[false, D.WEAPONS.knife.damage]]); assert.equal(r.snapshot().rng, rng);
    // An enemy round into the player: a v3 raid gives exactly what a v2 raid gives, no critical rule and no snapshot.
    const enemyRound = (version: 2 | 3) => {
        const { world, state, raid } = prototype(version);
        raid.currentMap = 'upstairs'; raid.player = { x: 200, y: 100, rotation: 0 }; raid.rng = sure;
        assert.ok(resolveLayerShot(state, world, 'upstairs', { uid: 'shot-e', x: 40, y: 100, rotation: 0, vx: 365, vy: 0, left: 240, damage: 20, enemy: true, owner: 'enemy-0' }, true));
        return { body: state.body, rng: raid.rng, training: raid.training };
    };
    const v3 = enemyRound(3);
    assert.deepEqual(v3, enemyRound(2)); assert.equal(v3.body.hp, 100 - 20); assert.equal(v3.rng, drawn(sure, 1));
});

test('CP-22: v2 raids keep the old centre-closeness formula and v1 raids never crit; neither reads a snapshot', () => {
    // Golden values of the old rule (rpg.ts criticalChance) at technique 10: 10% at the centre, 6% halfway to the edge,
    // 2% at the edge, focus adding 5 points.
    assert.ok(near(criticalChance(10, 1, 0), .1) && near(criticalChance(10, .5, 0), .06) && near(criticalChance(10, 0, 0), .02) && near(criticalChance(10, 1, .05), .15));
    // A v2 round follows it exactly, even when it carries a snapshot that would always crit.
    const always: CritSnapshot = { sources: [{ id: 'weapon', chance: 1 }], multiplier: 1.7, target: null };
    for (const [offset, focus] of [[0, false], [7, false], [13.9, false], [0, true], [-7, true]] as const) {
        const chance = criticalChance(10, 1 - Math.min(1, Math.abs(offset) / 14), focus ? .05 : 0);
        for (const [lo, hi, critical] of [[chance - .005, chance, true], [chance, chance + .005, false]] as const) {
            const rng = rngWhere(1, ([d]) => d >= lo && d < hi);
            const shot = resolve(2, [foe('enemy-a', 200, 100 + offset)], { round: { crit: always }, edit: s => { s.raid!.rng = rng; s.body.effects.focus = focus ? 60 : 0; } });
            assert.deepEqual([shot.feedback, shot.dealt, shot.raid.rng], [[critical], [critical ? 7.5 : 5], drawn(rng, 1)], `${offset} ${focus} ${critical}`);
        }
    }
    // v1: no roll, no draw, plain damage.
    const v1 = resolve(1, [foe('enemy-a', 200, 100)], { round: { crit: always }, edit: s => { s.raid!.rng = rngWhere(1, ([d]) => d < .01); } });
    assert.deepEqual([v1.feedback, v1.dealt, v1.raid.rng === v1.rng], [[false], [5], true]);
});

test('CP-22: classic and v2 raids fire rounds without a snapshot, and a v2 hit still rolls the old formula', () => {
    // A classic checkpoint raid.
    const state = createSessionState(), data = new Map<string, string>();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
    assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42), true); state.state = 'run';
    const classic = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(classic, '?test=1');
    driver.freezeAI(true); driver.weapon('shotgun'); classic.advance(1000, intent({ firePressed: true }));
    assert.equal(classic.layered, null); assert.equal(classic.bullets.length, 6); assert.ok(classic.bullets.every(x => !('crit' in x)));
    // The record a v4 client wrote for the same deployment: a v2 raid, resumed by this page.
    const b = perkBench(), record = JSON.parse(b.data.get(SESSION_KEY)!);
    assert.deepEqual(record.expansion.raid.maps.coast.bullets, []);
    makeV4(record);
    b.data.set(SESSION_KEY, JSON.stringify(record));
    const page = reopen(b), v2 = arm({ ...b, ...page, driver: createRuntimeTestDriver(page.runtime, '?test=1') }, 'pistol');
    assert.equal(v2.runtime.layered!.raid!.version, 2);
    const uid = target(v2, 60);
    // 7% to 8.5%: a critical hit under the old rule near the centre (at least 8.5% within 3 px of it, and a pistol round
    // lands within 2 px at 60 px), never under the 6.9% pistol snapshot of a v3 raid.
    seed(v2, rngWhere(2, d => d[1] >= .07 && d[1] < .085));
    const events = fire(v2, 1000), [round] = shotRounds(v2, events);
    assert.equal('crit' in round, false);
    const speed = Math.hypot(round.vx, round.vy), enemy = v2.runtime.enemies.find(e => e.uid === uid)!;
    const off = Math.abs((enemy.x - round.x) * round.vy / speed - (enemy.y - round.y) * round.vx / speed);
    assert.ok(criticalChance(10, 1 - off / 14) >= .085, String(off));
    for (let t = 1100; t <= 1300; t += 100) events.push(...v2.runtime.advance(t, intent()).events);
    assert.deepEqual(hurts(events, uid).map(e => [e.critical, e.damage]), [[true, 27 * 1.5]]);
});

test('a round\'s snapshot survives every projection: Runtime snapshot and restore, the expansion capture and restore, the shared projection and the record', () => {
    const b = arm(perkBench(['technique-30-a'], 30), 'shotgun'), r = b.runtime;
    fire(b, 1000);
    const rounds = structuredClone(r.bullets);
    assert.equal(rounds.length, 6); assert.ok(rounds.every(x => x.crit?.sources.some(s => s.id === 'technique-30-a')));
    const c = r.snapshot(); assert.deepEqual(c.bullets, rounds);
    r.restore(c); assert.deepEqual(r.bullets, rounds);
    const state = r.snapshotExpansion(), mapId = state.raid!.currentMap;
    assert.deepEqual(state.raid!.maps[mapId].bullets, rounds);
    r.restoreExpansion(state); assert.deepEqual(r.bullets, rounds);
    // raid-state-projection.ts, both directions.
    const projected = activeRaidCheckpoint(state.body, state.raid!, 0); assert.deepEqual(projected.bullets, rounds);
    const copy = structuredClone(state); copy.raid!.maps[mapId].bullets = [];
    applyActiveRaidSnapshot(copy.body, copy.raid!, structuredClone(projected)); assert.deepEqual(copy.raid!.maps[mapId].bullets, rounds);
    // The checkpoint record, decoded (validated) and read back by a reopened page.
    assert.ok(r.checkpoint());
    assert.deepEqual(decodeSession(b.data.get(SESSION_KEY)!).expansion!.raid!.maps[mapId].bullets, rounds);
    assert.deepEqual(reopen(b).runtime.bullets, rounds);
});

test('the validator wants the exact snapshot on every v3 player round and nowhere else: anything else is rejected, never repaired', () => {
    // A v3 raid holding technique-15-a and technique-20-a at technique 20, with a carbine round in flight.
    const b = arm(perkBench(['technique-15-a', 'technique-20-a'], 20), 'carbine'), uid = target(b, 400);
    fire(b, 1000); assert.ok(b.runtime.checkpoint());
    const text = b.data.get(SESSION_KEY)!, round = (record: any) => record.expansion.raid.maps.coast.bullets[0];
    assert.deepEqual(round(JSON.parse(text)).crit, { sources: [{ id: 'character', chance: characterCritChance(20) }, { id: 'weapon', chance: .08 },
        { id: 'technique-20-a', chance: .05 }], multiplier: 1.5, target: null });
    const edited = (change: (crit: any, round: any, record: any) => void) => { const record = JSON.parse(text); change(round(record).crit, round(record), record); return JSON.stringify(record); };
    const breath = (crit: any, chance = .3, on: string | null = uid) => { crit.sources.splice(2, 0, { id: 'technique-15-a', chance }); crit.target = on; };
    const accepted: [string, (crit: any, round: any, record: any) => void][] = [
        ['as written', () => {}],
        ['focus at 5%', crit => { crit.sources.push({ id: 'focus', chance: .05 }); }],
        ['a breath charge on an enemy of the roster', crit => breath(crit)],
        ['another technique and gun than today', crit => { crit.sources[0].chance = characterCritChance(25); crit.sources[1].chance = .03; }],
        ['an enemy round without one', (_crit, x) => { delete x.crit; x.enemy = true; x.owner = uid; }],
    ];
    for (const [why, change] of accepted) assert.doesNotThrow(() => decodeSession(edited(change)), why);
    const rejected: [string, (crit: any, round: any, record: any) => void][] = [
        ['no snapshot', (_crit, x) => { delete x.crit; }],
        ['a null snapshot', (_crit, x) => { x.crit = null; }],
        ['an extra key', crit => { crit.version = 3; }],
        ['no target key', crit => { delete crit.target; }],
        ['sources not a list', crit => { crit.sources = { 0: crit.sources[0] }; }],
        ['an extra source key', crit => { crit.sources[0].note = 'x'; }],
        ['an unknown source', crit => { crit.sources.push({ id: 'luck', chance: .05 }); }],
        ['a prototype name', crit => { crit.sources.push({ id: 'constructor', chance: .05 }); }],
        ['a repeated source', crit => { crit.sources.splice(1, 0, { ...crit.sources[0] }); }],
        ['sources out of catalog order', crit => { crit.sources.reverse(); }],
        ['a chance above 1', crit => { crit.sources[1].chance = 1.5; }],
        ['a negative chance', crit => { crit.sources[0].chance = -.01; }],
        ['a chance as text', crit => { crit.sources[0].chance = '0.05'; }],
        ['no character source', crit => { crit.sources.shift(); }],
        ['no weapon source', crit => { crit.sources.splice(1, 1); }],
        ['an owned perk source missing', crit => { crit.sources.splice(2, 1); }],
        ['an owned perk source at another chance', crit => { crit.sources[2].chance = .06; }],
        ['a perk source not owned', crit => { crit.sources.push({ id: 'technique-30-a', chance: .1 }); }],
        ['focus at another chance', crit => { crit.sources.push({ id: 'focus', chance: .06 }); }],
        ['a multiplier the perks do not give', crit => { crit.multiplier = 1.7; }],
        ['a breath source without a target', crit => breath(crit, .3, null)],
        ['a target without a breath source', crit => { crit.target = uid; }],
        ['a target outside the roster', crit => breath(crit, .3, 'enemy-999')],
        ['a breath charge above 30%', crit => breath(crit, .31)],
        ['a breath charge of 0', crit => breath(crit, 0)],
        ['a breath charge without technique-15-a', (crit, _round, record) => { breath(crit); record.expansion.growth.perks = ['technique-20-a']; }],
        ['a snapshot on an enemy round', (_crit, x) => { x.enemy = true; x.owner = uid; }],
        ['a snapshot in a v2 raid', (_crit, _round, record) => { makeV4(record); }],
    ];
    for (const [why, change] of rejected) assert.throws(() => decodeSession(edited(change)), why);
    // The same v2 record without the snapshot is a valid v2 raid: only the snapshot was wrong there.
    assert.doesNotThrow(() => decodeSession(edited((_crit, x, record) => {
        delete x.crit; makeV4(record);
    })));
});
