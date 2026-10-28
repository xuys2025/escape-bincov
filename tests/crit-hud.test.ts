import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { BulletState } from '../src/checkpoint';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { frameView } from '../src/raid-runtime/presentation';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import type { BreathView, CritChanceView, HudView, PublishedView, RaidIntent, StampedEvent } from '../src/raid-runtime/contract';
import { BREATH_FULL, breathChance } from '../src/breath';
import { critBreakdown, critSources, snapshotChance, type CritBreakdown, type CritInput, type PerkId } from '../src/perks';
import { critHud } from '../src/perk-copy';
import { arm, perkBench, reopen, LANE, type Bench } from './fixtures/shooting-bench';
import { oldRecord } from './fixtures/old-saves';

// CP-T09 of #77 (docs/CRITICAL-PERK-DESIGN.md section 2.3): the raid HUD's critical chance. The Runtime projects it into
// HudView.crit from the very snapshot a shot fired now takes (CoastRaidRuntime.shotCrit), the breath charge left out and,
// while the charge holds a target, put in; perk-copy's critHud turns it into the weapon card's lines. The HUD only
// reads: nothing here pops up, rolls or derives a chance again.

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const intent = (patch: Partial<RaidIntent> = {}): RaidIntent => ({ ...emptyIntent(), aim: LANE.aim, ...patch });
/** The precise aim held on the desktop (the right button). */
const AIM: Partial<RaidIntent> = { precise: true };
const FRAME = 1000 / 60;
/** Frames of 60 Hz covering `seconds`. */
const frames = (seconds: number) => Array.from({ length: Math.round(seconds * 60) }, () => FRAME);
const hud = (b: Bench): HudView => b.runtime.current().frame.hud;
/** What a shot fired now draws on: technique 10 with no perk, focus or breath charge, unless given. */
const input = (patch: Partial<CritInput>): CritInput => ({ technique: 10, weapon: null, perks: [], focus: false, breath: 0, ...patch });
const breakdown = (patch: Partial<CritInput>): CritBreakdown => critBreakdown(critSources(input(patch))!);
/** The projection of a v3 raid with a gun and no target: its static breakdown only. */
const still = (patch: Partial<CritInput>): CritChanceView => ({ rule: 'v3', gun: breakdown(patch), onTarget: null });

/** Stand the first live enemy of `kind` `distance` px down the lane, east of the player; returns its uid. */
function foe(b: Bench, distance: number, kind = 'elite'): string {
    const uid = b.runtime.enemies.find(e => e.hp > 0 && e.id === kind)!.uid;
    b.driver.placeEnemy(uid, { x: LANE.at.x + distance, y: LANE.at.y });
    return uid;
}
/** Drives the bench's Runtime on its own wall clock; the first frame only starts the clock, a frame of 0 ms takes no time. */
function pilot(b: Bench) {
    let wall: number | null = null;
    const frame = (ms: number, patch: Partial<RaidIntent> = {}): PublishedView => { wall = wall === null ? 1000 : wall + ms; return b.runtime.advance(wall, intent(patch)); };
    return { frame, play: (lengths: readonly number[], patch: Partial<RaidIntent> = {}) => lengths.reduce((_, ms) => frame(ms, patch), b.runtime.current()) };
}
/** Supplies put in the bag, as if picked up. */
function stock(b: Bench, items: Record<string, number>) {
    const c = b.runtime.snapshot();
    for (const [id, qty] of Object.entries(items)) assert.equal(D.addItem(c.loadout.bag, id, qty), 0);
    b.runtime.restore(c);
}
/** The rounds of the one player shot among `events`, as the Runtime holds them. */
function shotOf(b: Bench, events: readonly StampedEvent[]): BulletState[] {
    const shots = events.filter(e => e.type === 'shot' && e.shooter === 'player');
    assert.equal(shots.length, 1, 'one player shot');
    return shots[0].type === 'shot' ? shots[0].pellets.map(p => b.runtime.bullets.find(x => x.uid === p.bullet)!) : [];
}
/** The record a v4 client wrote for the same deployment, holding a raid of `version`, resumed by a reopened page. */
function oldRaid(version: 1 | 2): Bench {
    const b = perkBench(['technique-15-a'], 15), record = oldRecord(JSON.parse(b.data.get(SESSION_KEY)!), 4);
    delete record.perksBackup;
    record.expansion.version = version; delete record.expansion.growth.perks; record.expansion.raid.version = version;
    if (version === 1) { delete record.expansion.charm; delete record.expansion.awards; delete record.expansion.raid.shockAt; delete record.expansion.raid.mapEvent; }
    b.data.set(SESSION_KEY, JSON.stringify(record));
    const page = reopen(b), old = arm({ ...b, ...page, driver: createRuntimeTestDriver(page.runtime, '?test=1') }, 'carbine');
    assert.equal(old.runtime.layered!.raid!.version, version);
    return old;
}

test('v3: the static chance of the gun in hand is critBreakdown of the inputs a shot takes, the M4A1 and doses included', () => {
    // Technique 10 and nothing else (spec 2.1): the pistol 6.9%, the shotgun 4.94%, the carbine 9.84%; the M4A1
    // carries its own 5% weapon source (maintainer, 2026-10-23), the pistol's figure.
    for (const [gun, weapon, text] of [['pistol', D.WEAPONS.pistol, '6.90%'], ['shotgun', D.WEAPONS.shotgun, '4.94%'],
        ['carbine', D.WEAPONS.carbine, '9.84%'], ['mb4a1', D.WEAPONS.mb4a1, '6.90%']] as const) {
        const b = arm(perkBench(), gun), view = hud(b);
        assert.deepEqual(view.crit, still({ weapon }), gun);
        assert.equal(view.crit!.gun!.text, text, gun);
        assert.equal(view.breath, null, `${gun}: no breath perk, no charge`);
    }
    assert.deepEqual(hud(arm(perkBench(), 'mb4a1')).crit!.gun!.sources.find(s => s.id === 'weapon'), { id: 'weapon', chance: .05, text: '5.00%' });
    // The technique A line at 30: two independent perk sources and the 1.7 multiplier (which the chance ignores).
    const perks: PerkId[] = ['technique-20-a', 'technique-25-a', 'technique-30-a'], b = arm(perkBench(perks, 30), 'carbine'), r = b.runtime;
    assert.deepEqual(hud(b).crit, still({ technique: 30, weapon: D.WEAPONS.carbine, perks }));
    // A technique dose (effective 35) moves only the character source; focus adds its 5% while it lasts.
    stock(b, { techniqueDose: 1, focus: 1 });
    assert.equal(r.useSupply('techniqueDose'), 'committed'); assert.equal(r.useSupply('focus'), 'committed');
    const dosed = hud(b).crit!;
    assert.deepEqual(dosed, still({ technique: 35, weapon: D.WEAPONS.carbine, perks, focus: true }));
    assert.deepEqual(dosed.gun!.sources.map(s => s.id), ['character', 'weapon', 'technique-20-a', 'technique-30-a', 'focus']);
    // What the HUD prints is what the next shot snapshots.
    const p = pilot(b), [round] = shotOf(b, p.frame(0, { firePressed: true }).events);
    assert.deepEqual(critBreakdown(round.crit!.sources), dosed.gun);
    // Focus running out drops its source from the very next frame.
    const live = r.snapshotExpansion(); live.body.effects.focus = .001; r.restoreExpansion(live);
    assert.deepEqual(p.frame(100).frame.hud.crit, still({ technique: 35, weapon: D.WEAPONS.carbine, perks }));
});

test('v3 with the breath perk: while the charge holds a target the HUD adds the chance on that enemy, the very chance the next shot takes there', () => {
    // Technique 15 and the carbine (spec 2.1): 10.53% static, 37.371% on the target of a full charge.
    const perks: PerkId[] = ['technique-15-a'], b = arm(perkBench(perks, 15), 'carbine'), uid = foe(b, 320), p = pilot(b);
    const STATIC = still({ technique: 15, weapon: D.WEAPONS.carbine, perks });
    const first = p.frame(0, AIM).frame.hud;
    assert.deepEqual([first.crit, first.breath], [STATIC, { target: null, seconds: 0, chance: 0, full: BREATH_FULL }]);
    assert.equal(STATIC.gun!.text, '10.53%');
    const charged = p.play(frames(1.5), AIM).frame.hud, seconds = charged.breath!.seconds;
    assert.equal(charged.breath!.target, uid); assert.ok(near(seconds, 1.5));
    assert.deepEqual(charged.crit, { ...STATIC, onTarget: breakdown({ technique: 15, weapon: D.WEAPONS.carbine, perks, breath: breathChance(seconds) }) });
    assert.ok(near(charged.crit!.onTarget!.chance, 1 - (1 - .0275) * .92 * (1 - breathChance(seconds))));
    // Projecting is a read: frame after frame of the same state gives the same view, and the raid, its RNG and the charge stay.
    const before = JSON.stringify([b.runtime.snapshotExpansion(), b.runtime.breath]), map = b.runtime.current().map;
    for (let i = 0; i < 3; i++) assert.deepEqual(frameView(b.runtime, map, new Map()).hud.crit, charged.crit);
    assert.equal(JSON.stringify([b.runtime.snapshotExpansion(), b.runtime.breath]), before);
    // The next shot, fired this instant (a frame of no time), snapshots exactly that chance on its target, and the static
    // one on any other enemy; the charge went into it, so the HUD is back to the static chance.
    const shot = p.frame(0, { ...AIM, firePressed: true }), [round] = shotOf(b, shot.events);
    assert.equal(snapshotChance(round.crit!, uid), charged.crit!.onTarget!.chance);
    assert.deepEqual(critBreakdown(round.crit!.sources), charged.crit!.onTarget);
    assert.equal(snapshotChance(round.crit!, 'enemy-other'), STATIC.gun!.chance);
    assert.deepEqual(shot.frame.hud.crit, STATIC);
    // A full charge: the spec's 37.371%, and it stays there past 3 s.
    const full = p.play(frames(3.5), AIM).frame.hud;
    assert.equal(full.crit!.onTarget!.text, '37.37%'); assert.ok(near(full.crit!.onTarget!.chance, .37371));
    // The aim off every enemy: no target, no target chance.
    const off = p.play(frames(.2), { ...AIM, aim: -Math.PI / 2 }).frame.hud;
    assert.equal(off.breath!.target, null); assert.deepEqual(off.crit, STATIC);
});

test('the knife is not applicable and its charge stays empty; drawing the gun again brings the static chance back', () => {
    const perks: PerkId[] = ['technique-15-a'], b = arm(perkBench(perks, 15), 'carbine'), p = pilot(b);
    foe(b, 320); p.frame(0, AIM); p.play(frames(1), AIM);
    const knife = p.frame(FRAME, { ...AIM, commands: ['knife'] }).frame.hud;
    assert.equal(b.runtime.currentWeapon.id, 'knife');
    assert.deepEqual([knife.crit, knife.breath], [{ rule: 'v3', gun: null, onTarget: null }, { target: null, seconds: 0, chance: 0, full: BREATH_FULL }]);
    assert.deepEqual(critHud(knife.crit, knife.breath), { label: '枪械暴击：不适用', chance: null, breath: null });
    const gun = p.frame(FRAME, { ...AIM, commands: ['primary'] }).frame.hud;
    assert.deepEqual(gun.crit!.gun, breakdown({ technique: 15, weapon: D.WEAPONS.carbine, perks }));
});

test('a v1 or v2 raid shows only that it keeps its old rule, never a perk value; a classic raid shows nothing', () => {
    for (const version of [1, 2] as const) {
        const view = hud(oldRaid(version));
        assert.deepEqual([view.crit, view.breath], [{ rule: 'old', gun: null, onTarget: null }, null], `v${version}`);
        assert.deepEqual(critHud(view.crit, view.breath), { label: '本局沿用旧暴击规则', chance: null, breath: null }, `v${version}`);
    }
    const state = createSessionState(), data = new Map<string, string>();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }));
    assert.equal(saves.initialize(), true); state.state = 'hideout'; assert.equal(saves.beginRun(42), true); state.state = 'run';
    const classic = new CoastRaidRuntime(state, saves);
    assert.equal(classic.layered, null);
    assert.equal(classic.current().frame.hud.crit, null);
    assert.equal(critHud(classic.current().frame.hud.crit, classic.current().frame.hud.breath), null);
});

test('critHud prints the Runtime\'s numbers as they are: two decimals, "<100%", the 0 to 3 s progress and the target\'s chance', () => {
    const v3 = (gun: CritBreakdown, onTarget: CritBreakdown | null = null): CritChanceView => ({ rule: 'v3', gun, onTarget });
    const charge = (target: string | null, seconds: number): BreathView => ({ target, seconds, chance: breathChance(seconds), full: BREATH_FULL });
    const perks: PerkId[] = ['technique-15-a'], gun = breakdown({ technique: 15, weapon: D.WEAPONS.carbine, perks });
    const aimed = (seconds: number) => breakdown({ technique: 15, weapon: D.WEAPONS.carbine, perks, breath: breathChance(seconds) });
    assert.deepEqual(critHud(v3(gun), null), { label: '暴击', chance: '10.53%', breath: null });
    assert.deepEqual(critHud(v3(gun), charge(null, 0)), { label: '暴击', chance: '10.53%', breath: { label: '屏息狙击', share: 0, time: '0.0 / 3.0 秒', full: false, target: null } });
    assert.deepEqual(critHud(v3(gun, aimed(1.5)), charge('enemy-1', 1.5))!.breath, { label: '屏息狙击', share: .5, time: '1.5 / 3.0 秒', full: false, target: `目标 ${aimed(1.5).text}` });
    // Past 3 s the progress stays full; 2.96 s is not full yet; frame times summed to just under 3 s read full.
    assert.deepEqual(critHud(v3(gun, aimed(4.5)), charge('enemy-1', 4.5))!.breath, { label: '屏息狙击', share: 1, time: '3.0 / 3.0 秒', full: true, target: '目标 37.37%' });
    const early = critHud(v3(gun, aimed(2.96)), charge('enemy-1', 2.96))!.breath!;
    assert.deepEqual([early.time, early.full], ['2.9 / 3.0 秒', false]);
    let summed = 0; for (let i = 0; i < 180; i++) summed += 1 / 60;
    assert.ok(summed < 3);
    const summedView = critHud(v3(gun, aimed(summed)), charge('enemy-1', summed))!.breath!;
    assert.deepEqual([summedView.time, summedView.full, summedView.target], ['3.0 / 3.0 秒', true, '目标 37.37%']);
    // Short of a sure hit the chance never reads 100%, and no line ever promises one; only an explicit 100% source reads
    // "100%" (the catalog has none).
    const almost = critBreakdown([{ id: 'character', chance: .99999 }, { id: 'weapon', chance: .99999 }]), sure = critBreakdown([{ id: 'weapon', chance: 1 }]);
    assert.equal(critHud(v3(almost), null)!.chance, '<100%');
    assert.equal(critHud(v3(sure), null)!.chance, '100%');
    assert.equal(critHud(v3(gun, almost), charge('enemy-1', 3))!.breath!.target, '目标 <100%');
    for (const view of [critHud(v3(almost, almost), charge('enemy-1', 3)), critHud(v3(sure), null), critHud(v3(gun, aimed(3)), charge('enemy-1', 3))])
        assert.doesNotMatch(JSON.stringify(view), /必定|必然|保证|一定/);
    assert.deepEqual(critHud({ rule: 'old', gun: null, onTarget: null }, null), { label: '本局沿用旧暴击规则', chance: null, breath: null });
    assert.equal(critHud(null, null), null);
});
