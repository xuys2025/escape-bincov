import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, SKILL_BRANCHES, skillDefinition, type SkillId } from '../src/skill-tree-catalog';
import { creditSkillMilliXp, newSkillProgress, planLearnSkill, skillBoard } from '../src/skill-tree';
import { beginSkillResearchRaid, decodeSkillResearch, encodeSkillResearch, endSkillResearchRaid, newSkillResearch,
    recordSkillResearchEvent, skillResearchView, type SkillResearchEvent, type SkillResearchState } from '../src/skill-tree-research';
import * as D from '../src/domain';
import { enemyDamage, useRpgItemResult } from '../src/rpg';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

const manifest = () => ({ enemies: [{ id: 'enemy-0', hp: 100, elite: false }, { id: 'elite', hp: 200, elite: true }],
    containers: [{ id: 'crate', crate: true, origins: ['item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-5'] },
        { id: 'corpse', crate: false, origins: ['corpse-item'] }], regions: ['ground/room', 'upstairs/room'] });
function start(progress = newSkillProgress()) { return beginSkillResearchRaid(newSkillResearch(progress), manifest()); }
type Payload<T = SkillResearchEvent> = T extends SkillResearchEvent ? Omit<T, 'id' | 'runId' | 'at'> : never;
function event(state: SkillResearchState, payload: Payload, at = (state.raid?.events.at(-1)?.at ?? 0) + 1): SkillResearchEvent {
    return { ...payload, id: 'event-' + state.raid!.events.length, runId: state.raid!.id, at } as SkillResearchEvent;
}
function step(state: SkillResearchState, payload: Payload, at?: number) { return recordSkillResearchEvent(state, event(state, payload, at)).state; }
function allocated(target: SkillId) {
    const definition = skillDefinition(target)!; let p = newSkillProgress();
    for (const b of SKILL_BRANCHES) p = creditSkillMilliXp(p, b, 3300000);
    const take = (id: SkillId) => { const result = planLearnSkill(p, id, 'base'); assert.ok(result.ok); p = result.progress; };
    for (const s of SKILLS.filter(s => s.branch === definition.branch && s.tier < definition.tier)) {
        for (let n = 0; n < s.max && skillBoard(p).branches[definition.branch].spent < definition.tier; n++) take(s.id);
    }
    for (let n = 0; n < definition.max; n++) take(target);
    return p;
}
const raw = (s: SkillResearchState) => encodeSkillResearch(s);

test('damage credits real loss once, rejects stale HP, and awards elite kills without overkill or corpse XP', () => {
    let s = start();
    s = step(s, { kind: 'damage', enemy: 'enemy-0', before: 100, after: 80, player: true });
    assert.equal(s.progress.xpMilli.combat, 2000);
    const before = raw(s);
    assert.throws(() => step(s, { kind: 'damage', enemy: 'enemy-0', before: 100, after: 0, player: true })); assert.equal(raw(s), before);
    s = step(s, { kind: 'damage', enemy: 'enemy-0', before: 80, after: 0, player: true });
    assert.equal(s.progress.xpMilli.combat, 30000);
    s = step(s, { kind: 'damage', enemy: 'enemy-0', before: 0, after: 0, player: true }); assert.equal(s.progress.xpMilli.combat, 30000);
    s = step(s, { kind: 'damage', enemy: 'elite', before: 200, after: 0, player: true }); assert.equal(s.progress.xpMilli.combat, 90000);
    assert.equal(skillBoard(s.progress).branches.combat.level, 1);
});
test('non-player damage updates the authoritative enemy HP but gives no player damage/kill XP', () => {
    let s = start(); s = step(s, { kind: 'damage', enemy: 'elite', before: 200, after: 100, player: false });
    assert.equal(s.progress.xpMilli.combat, 0);
    s = step(s, { kind: 'damage', enemy: 'elite', before: 100, after: 0, player: true }); assert.equal(s.progress.xpMilli.combat, 50000);
});
test('same-event retries are idempotent across reloads; a changed payload under the same ID is rejected', () => {
    const s = start(), e = event(s, { kind: 'damage', enemy: 'enemy-0', before: 100, after: 50, player: true });
    const first = recordSkillResearchEvent(s, e).state, restored = decodeSkillResearch(raw(first));
    const retry = recordSkillResearchEvent(restored, e); assert.equal(retry.duplicate, true); assert.equal(raw(retry.state), raw(first));
    assert.throws(() => recordSkillResearchEvent(restored, { ...e, after: 40 } as SkillResearchEvent)); assert.equal(raw(s), raw(start()));
});
test('fractional hits are summed before rounding, so split simulation steps preserve XP', () => {
    let whole = start(), split = start(); whole = step(whole, { kind: 'damage', enemy: 'enemy-0', before: 100, after: 97, player: true });
    for (let i = 0; i < 30; i++) split = step(split, { kind: 'damage', enemy: 'enemy-0', before: 100 - i / 10, after: 100 - (i + 1) / 10, player: true });
    assert.equal(whole.progress.xpMilli.combat, 300); assert.equal(split.progress.xpMilli.combat, 300);
});
test('the current game damage and healing functions feed the research ledger using their actual HP delta', () => {
    const game = prototypeRaid(D.newSave(), prototypeWorld()); game.raid!.version = 2;
    let s = start(); const before = game.body.hp;
    enemyDamage(game, 37, 'enemy-0', .01);
    s = step(s, { kind: 'hurt', enemy: 'enemy-0', before, after: game.body.hp, maxHp: 100, bleeding: game.body.bleeding });
    const injured = game.body.hp; assert.equal(useRpgItemResult(game, 'medkit').ok, true);
    s = step(s, { kind: 'heal', actual: game.body.hp - injured, stoppedBleeding: !game.body.bleeding, item: 'medkit' });
    assert.equal(s.progress.xpMilli.survival, 16100); assert.equal(game.body.hp, 100);
    const noEffect = useRpgItemResult(game, 'medkit'); assert.equal(noEffect.ok, false);
    s = step(s, { kind: 'heal', actual: 0, stoppedBleeding: false, item: 'medkit' }); assert.equal(s.progress.xpMilli.survival, 16100);
});
test('environmental hurt, excess healing, food and repeated clotting do not create medical XP', () => {
    let s = start(); s = step(s, { kind: 'hurt', enemy: null, before: 100, after: 50, maxHp: 100, bleeding: false });
    s = step(s, { kind: 'heal', actual: 50, stoppedBleeding: true, item: 'medkit' }); assert.equal(s.progress.xpMilli.survival, 0);
    s = step(s, { kind: 'hurt', enemy: 'enemy-0', before: 100, after: 80, maxHp: 100, bleeding: true });
    s = step(s, { kind: 'heal', actual: 200, stoppedBleeding: true, item: 'other' }); assert.equal(s.progress.xpMilli.survival, 2000);
    s = step(s, { kind: 'heal', actual: 200, stoppedBleeding: true, item: 'medkit' }); assert.equal(s.progress.xpMilli.survival, 2000);
    s = step(s, { kind: 'hurt', enemy: 'enemy-0', before: 100, after: 80, maxHp: 100, bleeding: true });
    s = step(s, { kind: 'heal', actual: 0, stoppedBleeding: true, item: 'bandage' }); assert.equal(s.progress.xpMilli.survival, 9000);
    s = step(s, { kind: 'heal', actual: 0, stoppedBleeding: true, item: 'bandage' }); assert.equal(s.progress.xpMilli.survival, 9000);
});
test('one enemy supplies at most 50 eligible HP and all medical XP is capped at 40 per run', () => {
    let s = start();
    for (let i = 0; i < 10; i++) {
        s = step(s, { kind: 'hurt', enemy: 'enemy-0', before: 100, after: 40, maxHp: 100, bleeding: false });
        s = step(s, { kind: 'heal', actual: 60, stoppedBleeding: false, item: 'medkit' });
    }
    assert.equal(s.progress.xpMilli.survival, 15000);
    for (let i = 0; i < 10; i++) {
        s = step(s, { kind: 'hurt', enemy: 'elite', before: 100, after: 40, maxHp: 100, bleeding: true });
        s = step(s, { kind: 'heal', actual: 60, stoppedBleeding: true, item: 'medkit' });
    }
    assert.equal(s.progress.xpMilli.survival, 40000);
});
test('effective activity cannot overlap; pause and idle intervals do not train, partitioning preserves the minute yield', () => {
    let one = start(), many = start(); one = step(one, { kind: 'activity', from: 0, to: 60, progressing: true, paused: false }, 60);
    for (let i = 0; i < 60; i++) many = step(many, { kind: 'activity', from: i, to: i + 1, progressing: true, paused: false }, i + 1);
    assert.equal(one.progress.xpMilli.survival, 10000); assert.equal(many.progress.xpMilli.survival, 10000);
    many = step(many, { kind: 'activity', from: 60, to: 120, progressing: false, paused: false }, 120);
    // A pause is observed on the stopped action clock; its wall duration is never an action interval.
    many = step(many, { kind: 'activity', from: 120, to: 120, progressing: true, paused: true }, 120);
    assert.equal(many.progress.xpMilli.survival, 10000);
    assert.throws(() => step(many, { kind: 'activity', from: 0, to: 181, progressing: true, paused: false }, 181));
});
test('first-open, original-record provenance and map-qualified region identity survive close/drop/split/reload attempts', () => {
    let s = start(); s = step(s, { kind: 'container', container: 'crate' }); s = step(s, { kind: 'container', container: 'crate' });
    for (let i = 0; i < 6; i++) s = step(s, { kind: 'take', container: 'crate', origin: `item-${i}`, source: 'world' });
    assert.equal(s.progress.xpMilli.search, 25000);
    s = decodeSkillResearch(raw(s)); s = step(s, { kind: 'take', container: 'crate', origin: 'item-0', source: 'world' });
    s = step(s, { kind: 'take', container: 'corpse', origin: 'corpse-item', source: 'player' }); assert.equal(s.progress.xpMilli.search, 25000);
    assert.throws(() => step(s, { kind: 'take', container: 'crate', origin: 'split-new-id', source: 'world' }));
    assert.throws(() => step(s, { kind: 'take', container: 'corpse', origin: 'item-0', source: 'world' }));
    s = step(s, { kind: 'region', region: 'ground/room' }); s = step(s, { kind: 'region', region: 'upstairs/room' });
    s = step(s, { kind: 'region', region: 'ground/room' }); assert.equal(s.progress.xpMilli.search, 45000);
});
test('a completed run retains progression and rejects delayed events; the next run has a different capability', () => {
    let s = start(); const e = event(s, { kind: 'container', container: 'crate' });
    s = recordSkillResearchEvent(s, e).state; s = endSkillResearchRaid(s); assert.equal(s.progress.xpMilli.search, 10000);
    assert.throws(() => recordSkillResearchEvent(s, e)); s = beginSkillResearchRaid(s, manifest());
    assert.equal(s.raid!.id, 'research-2'); assert.throws(() => recordSkillResearchEvent(s, e));
});
test('newly earned levels cannot replace an active deployment snapshot or sneak in a skill allocation', () => {
    let p = creditSkillMilliXp(newSkillProgress(), 'combat', 80000), s = start(p);
    s = step(s, { kind: 'damage', enemy: 'elite', before: 200, after: 0, player: true });
    assert.equal(s.raid!.snapshot.xpMilli.combat, 80000); assert.equal(s.progress.xpMilli.combat, 140000);
    const plan = planLearnSkill(s.progress, 'combat-grip', 'base'); assert.ok(plan.ok);
    assert.throws(() => encodeSkillResearch({ ...s, progress: plan.progress }));
    p = s.progress; const ended = endSkillResearchRaid(s); const learned = planLearnSkill(p, 'combat-grip', 'base'); assert.ok(learned.ok);
    assert.doesNotThrow(() => encodeSkillResearch({ ...ended, progress: learned.progress }));
});
test('kill windows expire, refresh without stacking, and breach affects only the next reload', () => {
    let s = start(allocated('combat-break'));
    s = step(s, { kind: 'damage', enemy: 'enemy-0', before: 100, after: 0, player: true }, 1);
    assert.ok(Math.abs(skillResearchView(s).effects.reload - .704) < 1e-9);
    s = step(s, { kind: 'reload' }, 2); let triggers = skillResearchView(s).triggers;
    assert.ok(Math.abs(triggers.at(-1)!.reload - .704) < 1e-9);
    s = step(s, { kind: 'reload' }, 2); assert.ok(Math.abs(skillResearchView(s).triggers.at(-1)!.reload - .88) < 1e-9);
    s = step(s, { kind: 'damage', enemy: 'elite', before: 200, after: 0, player: true }, 3);
    s = step(s, { kind: 'reload' }, 8); triggers = skillResearchView(s).triggers; assert.ok(Math.abs(triggers.at(-1)!.reload - .88) < 1e-9);
});
test('ambush snapshots once on an aimed shot, respects hostile contact/cooldown and never changes past shots', () => {
    let s = start(allocated('combat-ambush'));
    s = step(s, { kind: 'hostile' }, 2); s = step(s, { kind: 'shot', aimed: true }, 7);
    assert.equal(skillResearchView(s).triggers.at(-1)!.ambushCrit, 0);
    s = step(s, { kind: 'shot', aimed: true }, 13); assert.equal(skillResearchView(s).triggers.at(-1)!.ambushCrit, .1);
    s = step(s, { kind: 'shot', aimed: true }, 19); assert.equal(skillResearchView(s).triggers.at(-1)!.ambushCrit, 0);
    s = decodeSkillResearch(raw(s)); s = step(s, { kind: 'shot', aimed: true }, 33);
    assert.deepEqual(skillResearchView(s).triggers.map(t => t.ambushCrit), [0, .1, 0, .1]);
});
test('emergency is once per run, adds only base-medkit healing, has an exact expiry, and cannot revive death', () => {
    let s = start(allocated('survival-emergency'));
    s = step(s, { kind: 'hurt', enemy: 'enemy-0', before: 100, after: 20, maxHp: 100, bleeding: false }, 1);
    s = step(s, { kind: 'heal', actual: 50, stoppedBleeding: false, item: 'medkit' }, 2);
    assert.equal(skillResearchView(s).triggers.at(-1)!.emergencyBaseHeal, .3);
    s = step(s, { kind: 'hurt', enemy: 'elite', before: 70, after: 20, maxHp: 100, bleeding: false }, 3);
    s = step(s, { kind: 'heal', actual: 50, stoppedBleeding: false, item: 'medkit' }, 4);
    assert.equal(skillResearchView(s).triggers.at(-1)!.emergencyBaseHeal, 0);
    let expired = start(allocated('survival-emergency'));
    expired = step(expired, { kind: 'hurt', enemy: 'enemy-0', before: 100, after: 20, maxHp: 100, bleeding: false }, 1);
    expired = step(expired, { kind: 'heal', actual: 50, stoppedBleeding: false, item: 'medkit' }, 16);
    assert.equal(skillResearchView(expired).triggers.at(-1)!.emergencyBaseHeal, 0);
    let dead = start(allocated('survival-emergency'));
    dead = step(dead, { kind: 'hurt', enemy: 'enemy-0', before: 100, after: 0, maxHp: 100, bleeding: false }, 1);
    assert.equal(skillResearchView(dead).effects.emergencyBaseHeal, 0);
});
test('respite only follows an effective medical use and cannot be refreshed before its cooldown', () => {
    let s = start(allocated('survival-respite'));
    s = step(s, { kind: 'heal', actual: 0, stoppedBleeding: false, item: 'medkit' }, 1); assert.equal(skillResearchView(s).effects.staminaRecovery, 1);
    s = step(s, { kind: 'heal', actual: 10, stoppedBleeding: false, item: 'medkit' }, 2); assert.equal(skillResearchView(s).effects.staminaRecovery, 1.3);
    s = step(s, { kind: 'heal', actual: 10, stoppedBleeding: false, item: 'medkit' }, 9);
    s = step(s, { kind: 'hostile' }, 10); assert.equal(skillResearchView(s).effects.staminaRecovery, 1);
    s = step(s, { kind: 'heal', actual: 10, stoppedBleeding: false, item: 'bandage' }, 32); assert.equal(skillResearchView(s).effects.staminaRecovery, 1.3);
});
test('bonus loot is a detached deterministic plan, one first-crate find, never a new XP source or a redraw on reload', () => {
    let s = start(allocated('search-finds')); s = step(s, { kind: 'container', container: 'corpse' });
    assert.deepEqual(skillResearchView(s).bonuses, []);
    s = step(s, { kind: 'container', container: 'crate' }); const view = skillResearchView(s);
    assert.deepEqual(view.bonuses, [{ container: 'crate', scrap: 0, ordinary: 1 }]);
    assert.equal(view.earnedMilli.search, 20000);
    const restored = decodeSkillResearch(raw(s)); assert.deepEqual(skillResearchView(restored).bonuses, view.bonuses);
    s = step(s, { kind: 'container', container: 'crate' }); assert.deepEqual(skillResearchView(s).bonuses, view.bonuses);
    view.bonuses[0].ordinary = 999; assert.equal(skillResearchView(s).bonuses[0].ordinary, 1);
    let scraps = start(allocated('search-scrap')); scraps = step(scraps, { kind: 'container', container: 'crate' });
    assert.deepEqual(skillResearchView(decodeSkillResearch(raw(scraps))).bonuses, skillResearchView(scraps).bonuses);
});
test('strict checkpoint rejects inconsistent XP, unknown events, duplicate provenance, chronology and replayed journal IDs', () => {
    let s = start(); s = step(s, { kind: 'container', container: 'crate' }); const encoded = raw(s);
    const mutations = [
        (v: any) => { v.extra = true; }, (v: any) => { v.version = 2; }, (v: any) => { v.progress.xpMilli.search++; },
        (v: any) => { v.raid.events.push(v.raid.events[0]); }, (v: any) => { v.raid.events[0].extra = true; },
        (v: any) => { v.raid.events[0].kind = 'constructor'; }, (v: any) => { v.raid.events[0].runId = 'wrong'; },
        (v: any) => { v.raid.events[0].kind = ['container']; },
        (v: any) => { v.raid.manifest.containers[1].origins.push('item-0'); }, (v: any) => { v.raid.events[0].at = 601; },
    ];
    for (const mutate of mutations) { const v = JSON.parse(encoded); mutate(v); assert.throws(() => decodeSkillResearch(JSON.stringify(v))); }
    assert.throws(() => step(s, { kind: 'region', region: 'unknown-room' }));
    assert.throws(() => step(s, { kind: 'shot', aimed: true }, 0));
    assert.throws(() => beginSkillResearchRaid(s, manifest()));
    assert.throws(() => decodeSkillResearch(' '.repeat(4000001))); assert.throws(() => decodeSkillResearch('{'));
    assert.equal(raw(s), encoded);
});
test('valid JSON key order does not alter identity, while source objects and returned snapshots remain detached', () => {
    const p = newSkillProgress(), original = JSON.stringify(p), m = manifest(); let s = beginSkillResearchRaid(newSkillResearch(p), m);
    m.enemies[0].hp = 999; p.xpMilli.combat = 3000000; assert.equal(s.raid!.manifest.enemies[0].hp, 100);
    s = step(s, { kind: 'container', container: 'crate' });
    const v = JSON.parse(raw(s)); v.progress = { ranks: v.progress.ranks, xpMilli: { search: 10000, survival: 0, combat: 0 }, version: 1 };
    assert.doesNotThrow(() => decodeSkillResearch(JSON.stringify(v)));
    assert.equal(original, JSON.stringify(newSkillProgress()));
});

test('expanded search training raises only the frozen original-record cap, never clone, quantity or player-dropped XP', () => {
    const trained = allocated('search-container-limit');
    trained.xpMilli.search = 980000;
    const m = manifest(); m.containers[0].origins = Array.from({ length: 10 }, (_, i) => `origin-${i}`);
    let s = beginSkillResearchRaid(newSkillResearch(trained), m);
    s = step(s, { kind: 'container', container: 'crate' });
    for (const origin of m.containers[0].origins) s = step(s, { kind: 'take', container: 'crate', origin, source: 'world' });
    assert.equal(skillResearchView(s).earnedMilli.search, 34000);
    s = step(s, { kind: 'take', container: 'crate', origin: 'origin-0', source: 'player' });
    s = step(s, { kind: 'take', container: 'crate', origin: 'origin-0', source: 'world' });
    assert.equal(skillResearchView(s).earnedMilli.search, 34000);
    assert.deepEqual(skillResearchView(decodeSkillResearch(encodeSkillResearch(s))), skillResearchView(s));
});
