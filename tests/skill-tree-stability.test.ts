import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SKILLS, SKILL_BRANCHES, skillDefinition, type SkillId } from '../src/skill-tree-catalog';
import { creditSkillMilliXp, newSkillProgress, planLearnSkill, skillBoard, compileSkillEffects } from '../src/skill-tree';
import { beginSkillResearchRaid, newSkillResearch, recordSkillResearchEvent, encodeSkillResearch, decodeSkillResearch,
    skillResearchView, type SkillResearchState, type SkillResearchEvent } from '../src/skill-tree-research';
import { newSkillMechanics, skillMechanicView, planSkillMechanic, decodeSkillMechanics, encodeSkillMechanics,
    type SkillMechanicSeed, type SkillMechanicCommand } from '../src/skill-tree-mechanics';
import { factoryState } from '../src/gunsmith/instance';

function selected(ids: SkillId[]) {
    let p = newSkillProgress();
    for (const branch of SKILL_BRANCHES) p = creditSkillMilliXp(p, branch, 3300000);
    for (const id of ids) {
        const d = skillDefinition(id)!;
        for (const s of SKILLS.filter(s => s.branch === d.branch && s.tier < d.tier)) {
            for (let n = 0; n < s.max && skillBoard(p).branches[d.branch].spent < d.tier; n++) {
                const r = planLearnSkill(p, s.id, 'base'); assert.ok(r.ok); p = r.progress;
            }
        }
        const r = planLearnSkill(p, id, 'base'); assert.ok(r.ok); p = r.progress;
    }
    return p;
}
function research(ids: SkillId[] = []) {
    return beginSkillResearchRaid(newSkillResearch(ids.length ? selected(ids) : newSkillProgress()), {
        enemies: [{ id: 'enemy', hp: 10, elite: false }], containers: [], regions: [] });
}
function record(s: SkillResearchState, fields: Record<string, unknown>) {
    return recordSkillResearchEvent(s, { id: `event-${s.raid!.events.length}`, runId: s.raid!.id, at: s.raid!.events.at(-1)?.at ?? 0,
        ...fields } as SkillResearchEvent).state;
}
function seed(ids: SkillId[] = [], weapon = 'pistol'): SkillMechanicSeed {
    return { runId: 'stability', progress: selected(ids), bag: D.createInventory(6, 5),
        equipment: { weapon, weaponUid: 'held', gun: factoryState(), relief: false, ammo: 0, ammoRelief: 0 },
        vitals: { hpMilli: 20000, maxHpMilli: 100000, waterMilli: 100000, satietyMilli: 100000, pollutionMilli: 0, bleeding: false },
        protectedItems: [], containers: [], completedQuests: [] };
}

test('a dead enemy cannot be killed again by a positive sub-epsilon before-HP under new event identities', () => {
    let s = record(research(), { kind: 'damage', enemy: 'enemy', before: 10, after: 0, player: true });
    const saved = encodeSkillResearch(s); assert.equal(skillResearchView(s).earnedMilli.combat, 21000);
    for (const before of [Number.MIN_VALUE, 1e-12, 1e-9, 1e-8]) {
        assert.throws(() => record(s, { kind: 'damage', enemy: 'enemy', before, after: 0, player: true }));
        assert.equal(encodeSkillResearch(s), saved);
    }
    s = record(decodeSkillResearch(saved), { kind: 'damage', enemy: 'enemy', before: 0, after: 0, player: true });
    assert.equal(skillResearchView(s).earnedMilli.combat, 21000);
});

test('paused activity cannot advance the global action clock or expire kill-window effects', () => {
    let s = record(research(['combat-break']), { kind: 'damage', enemy: 'enemy', before: 10, after: 0, player: true, at: 1 });
    const saved = encodeSkillResearch(s);
    assert.throws(() => record(s, { kind: 'activity', from: 1, to: 100, at: 100, progressing: true, paused: true }));
    assert.throws(() => record(s, { kind: 'activity', from: 100, to: 100, at: 100, progressing: false, paused: true }));
    assert.equal(encodeSkillResearch(s), saved);
    s = record(s, { kind: 'activity', from: 1, to: 1, at: 1, progressing: false, paused: true });
    s = record(decodeSkillResearch(encodeSkillResearch(s)), { kind: 'reload', at: 1 });
    assert.ok(skillResearchView(s).triggers.at(-1)!.reload < .8);
});

test('an accepted event must not turn a valid checkpoint into a journal over the strict serialized-size limit', () => {
    const container = 'c'.repeat(160), origin = 'o'.repeat(160);
    const s = beginSkillResearchRaid(newSkillResearch(), { enemies: [], containers: [{ id: container, crate: false, origins: [origin] }], regions: [] });
    const event = (i: number): SkillResearchEvent => ({ id: 'e'.repeat(154) + String(i).padStart(6, '0'), runId: s.raid!.id, at: 0,
        kind: 'take', container, origin, source: 'player' });
    const overhead = JSON.stringify(s).length, entryLength = JSON.stringify(event(0)).length;
    const count = Math.floor((4000000 - overhead + 1) / (entryLength + 1)); assert.ok(count < 8192);
    for (let i = 0; i < count; i++) s.raid!.events.push(event(i));
    const saved = encodeSkillResearch(s); assert.ok(saved.length <= 4000000);
    assert.ok(JSON.stringify({ ...s, raid: { ...s.raid, events: [...s.raid!.events, event(count)] } }).length > 4000000);
    assert.throws(() => recordSkillResearchEvent(s, event(count)));
    assert.equal(encodeSkillResearch(s), saved); assert.deepEqual(decodeSkillResearch(saved), s);
});

test('fractional and subnormal live HP can be killed once, with exact continuity surviving JSON roundtrips', () => {
    for (const hp of [Number.MIN_VALUE, 1e-12, .30000000000000004, Math.PI, 1000000]) {
        let s = beginSkillResearchRaid(newSkillResearch(), { enemies: [{ id: 'enemy', hp, elite: false }], containers: [], regions: [] });
        s = record(s, { kind: 'damage', enemy: 'enemy', before: hp, after: hp / 2, player: true });
        s = decodeSkillResearch(encodeSkillResearch(s));
        s = record(s, { kind: 'damage', enemy: 'enemy', before: hp / 2, after: 0, player: true });
        assert.equal(skillResearchView(s).earnedMilli.combat, Math.min(3300000, Math.floor(hp * 100 + 20000 + 1e-8)));
    }
});

test('automatic feed supports every currently accepted gun and ammo, conserving ordinary and relief quantities', () => {
    const guns = Object.keys(D.WEAPONS).filter(D.isGun); assert.ok(guns.length >= 20);
    for (const weapon of guns) {
        const s = seed(['combat-auto-feed'], weapon), capacity = D.equippedWeapon(s.equipment).magazine, ammo = D.equippedWeapon(s.equipment).ammo!;
        let serial = 0;
        assert.equal(D.addItem(s.bag, ammo, capacity + 3, false, false, true, () => `ordinary-${++serial}`), 0);
        assert.equal(D.addItem(s.bag, ammo, 3, true, false, true, () => `relief-${++serial}`), 0);
        const j = newSkillMechanics(s), c: SkillMechanicCommand = { id: 'advance', runId: s.runId, atMs: 600000, kind: 'advance', paused: false, reloading: false, sprinting: false };
        const result = planSkillMechanic(j, c), v = result.view;
        assert.equal(v.equipment.ammo, capacity, weapon); assert.equal(v.equipment.ammoRelief, Math.min(3, capacity), weapon);
        const left = v.bag.items.filter(i => i.id === ammo).reduce((n, i) => n + i.qty, 0);
        assert.equal(left + v.equipment.ammo, capacity + 6, weapon);
        assert.deepEqual(skillMechanicView(decodeSkillMechanics(encodeSkillMechanics(result.journal))), v);
    }
});

test('300 deterministic random legal allocations yield finite effects and never mutate a frozen selection', () => {
    let rng = 143;
    for (let sample = 0; sample < 300; sample++) {
        let p = selected([]);
        for (let n = 0; n < 160; n++) {
            rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
            const r = planLearnSkill(p, SKILLS[rng % SKILLS.length].id, 'base'); if (r.ok) p = r.progress;
        }
        const original = JSON.stringify(p), evaluate = compileSkillEffects(p);
        for (const hp of [0, .25, .35, 1]) for (const target of [null, 0, .25, 1]) for (const sprinting of [true, false]) {
            const effects = evaluate({ at: 100, lastHostileAt: 0, lastKillAt: 99, breachUntil: 101, ambushReadyAt: 0,
                emergencyUntil: 101, respiteUntil: 101, aiming: !sprinting, selfHpRatio: hp, targetHpRatio: target, carryRatio: .5, sprinting });
            for (const value of Object.values(effects)) assert.ok(typeof value === 'boolean' || Number.isFinite(value) && value >= 0);
            assert.ok(effects.lowHealthDamage >= .94 && effects.executeDamage <= 1.12);
        }
        assert.equal(JSON.stringify(p), original);
        for (const b of SKILL_BRANCHES) { const board = skillBoard(p).branches[b]; assert.equal(board.available + board.spent, 15); }
    }
});

test('unknown-field mutation at every nested checkpoint object is rejected without changing the accepted resources', () => {
    const s = seed(['combat-auto-feed', 'survival-regeneration', 'search-field-scan']); let serial = 0;
    D.addItem(s.bag, 'ammo9', 20, false, false, true, () => `item-${++serial}`);
    s.containers = [{ id: 'box', revealed: true, inRange: true, lineOfSight: true, opened: false }];
    let j = newSkillMechanics(s);
    for (const c of [{ id: 'advance', kind: 'advance', atMs: 10000, paused: false, reloading: false, sprinting: false },
        { id: 'scan', kind: 'scan', atMs: 10000 }, { id: 'hurt', kind: 'hurt', atMs: 10000, amountMilli: 1000, enemy: true }] as const)
        j = planSkillMechanic(j, { runId: s.runId, ...c }).journal;
    const saved = encodeSkillMechanics(j), paths: (string | number)[][] = [];
    function walk(v: unknown, path: (string | number)[]) {
        if (Array.isArray(v)) v.forEach((item, i) => walk(item, [...path, i]));
        else if (v && typeof v === 'object') { paths.push(path); for (const [k, child] of Object.entries(v)) walk(child, [...path, k]); }
    }
    walk(j, []); assert.ok(paths.length >= 20);
    for (const path of paths) {
        const corrupt = JSON.parse(saved); let target = corrupt; for (const key of path) target = target[key];
        target.unrecognizedResearchField = true;
        assert.throws(() => decodeSkillMechanics(JSON.stringify(corrupt)), path.join('.'));
    }
    assert.equal(encodeSkillMechanics(j), saved);
});

test('200 irregular multi-phase runs preserve exact resource results under frame splitting and checkpoint reconstruction', () => {
    let rng = 20261029;
    const random = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0);
    for (let trial = 0; trial < 200; trial++) {
        const s = seed([trial % 2 ? 'combat-field-press' : 'combat-auto-feed', trial % 3 ? 'survival-regeneration' : 'survival-auto-aid',
            trial % 2 ? 'search-auto-salvage' : 'search-field-scan']);
        let serial = 0;
        for (const [id, qty, relief] of [['ammo9', 20, false], ['ammo9', 5, true], ['scrap', 5, false], ['battery', 4, false], ['bandage', 3, false]] as const)
            assert.equal(D.addItem(s.bag, id, qty, relief, false, true, () => `stock-${++serial}`), 0);
        const one = newSkillMechanics(s), split = newSkillMechanics(s);
        const append = (j: typeof one, c: Record<string, unknown>) => j.commands.push({ id: `event-${j.commands.length}`, runId: s.runId, ...c } as SkillMechanicCommand);
        const press = { kind: 'approve-press', atMs: 0, uid: s.bag.items.find(i => i.id === 'scrap')!.uid, quantity: 2 };
        append(one, press); append(split, press);
        for (const item of s.bag.items.filter(i => i.id === 'battery')) {
            const c = { kind: 'mark-salvage', atMs: 0, uid: item.uid, marked: true }; append(one, c); append(split, c);
        }
        let clock = 0;
        for (let phase = 0; phase < 20; phase++) {
            const until = clock + 5000 + random() % 5001, reloading = random() % 7 === 0, sprinting = random() % 5 === 0;
            append(one, { kind: 'advance', atMs: until, paused: false, reloading, sprinting });
            while (clock < until) { clock = Math.min(until, clock + 1 + random() % 997); append(split, { kind: 'advance', atMs: clock, paused: false, reloading, sprinting }); }
            const c = phase % 4 === 0 ? { kind: 'hurt', atMs: clock, amountMilli: 1000, enemy: true }
                : { kind: phase % 4 === 1 ? 'fire' : phase % 4 === 2 ? 'reload' : 'hostile', atMs: clock };
            append(one, c); append(split, c);
        }
        const expected = skillMechanicView(one);
        assert.deepEqual(skillMechanicView(split), expected, `partition trial ${trial}`);
        assert.deepEqual(skillMechanicView(decodeSkillMechanics(encodeSkillMechanics(split))), expected);
    }
});
