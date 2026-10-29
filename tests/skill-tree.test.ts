import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, SKILL_BRANCHES, skillDefinition, type SkillBranch, type SkillId } from '../src/skill-tree-catalog';
import { assertSkillProgress, compileSkillEffects, creditSkillMilliXp, decodeSkillProgress, encodeSkillProgress, newSkillProgress, planLearnSkill,
    planReadSkillManual, planSkillRespec, skillBoard, skillEffects, type SkillEffectContext, type SkillProgress, type SkillPlan } from '../src/skill-tree';
import * as D from '../src/domain';
import { newExpansion, upgradeToRpg, validateExpansion } from '../src/expansion-state';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { critChance } from '../src/perks';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const value = <T extends object>(p: SkillPlan<T>) => { assert.ok(p.ok, !p.ok ? p.reason : ''); return p.progress; };
function funded() { let p = newSkillProgress(); for (const b of SKILL_BRANCHES) p = creditSkillMilliXp(p, b, 3300000); return p; }
function learn(p: SkillProgress, id: SkillId, count = 1) { for (let n = 0; n < count; n++) p = value(planLearnSkill(p, id, 'base')); return p; }
function prerequisites(id: SkillId) {
    const d = skillDefinition(id)!; let p = funded();
    for (const s of SKILLS.filter(s => s.branch === d.branch && s.tier < d.tier)) {
        for (let rank = 0; rank < s.max && skillBoard(p).branches[d.branch].spent < d.tier; rank++) p = learn(p, s.id);
    }
    return p;
}
const context: SkillEffectContext = { at: 10, lastKillAt: 9, breachUntil: 11, lastHostileAt: 0, ambushReadyAt: 10,
    aiming: true, emergencyUntil: 11, respiteUntil: 11 };

test('expanded catalog is 48 unique stable IDs, sixteen per branch; prototype-looking IDs never become choices', () => {
    assert.equal(SKILLS.length, 48); assert.equal(new Set(SKILLS.map(s => s.id)).size, 48);
    assert.deepEqual(SKILLS.slice(0, 24).map(s => s.id), [
        'combat-grip', 'combat-reload', 'combat-aim', 'combat-melee', 'combat-burst', 'combat-move', 'combat-break', 'combat-ambush',
        'survival-breath', 'survival-heal', 'survival-needs', 'survival-clot', 'survival-environment', 'survival-calm', 'survival-emergency', 'survival-respite',
        'search-carry', 'search-notice', 'search-tags', 'search-step', 'search-quiet', 'search-scrap', 'search-finds', 'search-pack']);
    for (const branch of SKILL_BRANCHES) assert.equal(SKILLS.filter(s => s.branch === branch).length, 16);
    for (const unknown of ['constructor', '__proto__', ['combat-grip'], 'strength-15-a', '', null]) {
        assert.equal(skillDefinition(unknown), undefined);
        assert.equal(planLearnSkill(funded(), unknown as string, 'base').ok, false);
    }
});
test('XP threshold, overflow and levels use integer thousandths; available points cannot drift', () => {
    let p = creditSkillMilliXp(newSkillProgress(), 'combat', 79999);
    assert.equal(skillBoard(p).branches.combat.level, 0);
    p = creditSkillMilliXp(p, 'combat', 1);
    assert.deepEqual(skillBoard(p).branches.combat, { level: 1, xp: 0, required: 100, spent: 0, available: 1 });
    p = creditSkillMilliXp(p, 'combat', 260000);
    assert.deepEqual(skillBoard(p).branches.combat, { level: 3, xp: 40, required: 140, spent: 0, available: 3 });
    assert.equal(skillBoard(p).characterLevel, 4); assert.equal(skillBoard(p).branches.search.available, 0);
    p = creditSkillMilliXp(p, 'combat', 3300000); assert.equal(skillBoard(p).branches.combat.level, 15);
    assert.equal(p.xpMilli.combat, 3300000); assert.equal(skillBoard(p).branches.combat.required, 0);
    assert.equal(skillBoard(funded()).characterLevel, 46);
});
test('invalid XP values cannot be converted into points or ignored', () => {
    for (const n of [NaN, Infinity, -1, .5, 3300001]) assert.throws(() => creditSkillMilliXp(newSkillProgress(), 'combat', n));
    assert.throws(() => creditSkillMilliXp(newSkillProgress(), 'constructor' as SkillBranch, 1));
});
test('learning spends only its own branch, honors the 5/10 lower-tier gates and refuses a fourth rank', () => {
    let p = creditSkillMilliXp(newSkillProgress(), 'search', 3300000);
    assert.deepEqual(planLearnSkill(p, 'combat-grip', 'base'), { ok: false, reason: 'points' });
    assert.deepEqual(planLearnSkill(p, 'search-step', 'base'), { ok: false, reason: 'tier' });
    p = learn(p, 'search-carry', 3); p = learn(p, 'search-notice', 2);
    assert.deepEqual(planLearnSkill(p, 'search-carry', 'base'), { ok: false, reason: 'rank' });
    p = learn(p, 'search-step', 3);
    assert.equal(skillBoard(p).branches.search.available, 7);
    assert.deepEqual(planLearnSkill(p, 'search-pack', 'base'), { ok: false, reason: 'tier' });
    p = learn(p, 'search-quiet', 2); p = learn(p, 'search-pack');
    assert.deepEqual(planLearnSkill(p, 'search-finds', 'base'), { ok: false, reason: 'exclusive' });
});
test('a valid allocation can exhaust 15 points but cannot unlock everything', () => {
    let p = prerequisites('combat-break'); p = learn(p, 'combat-break');
    for (const s of SKILLS.filter(s => s.branch === 'combat' && s.tier !== 10)) {
        while (skillBoard(p).branches.combat.available && p.ranks.find(r => r.id === s.id)?.rank !== s.max) p = learn(p, s.id);
    }
    assert.equal(skillBoard(p).branches.combat.spent, 15);
    const unfilled = SKILLS.find(s => s.branch === 'combat' && s.tier !== 10 && (p.ranks.find(r => r.id === s.id)?.rank ?? 0) < s.max)!;
    assert.deepEqual(planLearnSkill(p, unfilled.id, 'base'), { ok: false, reason: 'points' });
});
test('previews are detached and cannot learn/read/respec during a raid or pending settlement', () => {
    const original = funded(), text = encodeSkillProgress(original), plan = planLearnSkill(original, 'combat-grip', 'base');
    assert.ok(plan.ok); plan.progress.xpMilli.combat = 0; assert.equal(encodeSkillProgress(original), text);
    for (const location of ['raid', 'settlement'] as const) {
        assert.equal(planLearnSkill(original, 'combat-grip', location).ok, false);
        assert.equal(planReadSkillManual(newSkillProgress(), 'combat', 1, location).ok, false);
        assert.equal(planSkillRespec(learn(original, 'combat-grip'), 'combat', { cash: 500, manuals: 1, useManual: false }, location).ok, false);
    }
});
test('manuals plan exactly one item, leave other XP unchanged, and never consume a capped/no-item manual', () => {
    const p = newSkillProgress(), result = planReadSkillManual(p, 'survival', 1, 'base');
    assert.ok(result.ok); assert.equal(result.consumed, 1); assert.equal(result.progress.xpMilli.survival, 100000);
    assert.equal(p.xpMilli.survival, 0); assert.equal(result.progress.xpMilli.combat, 0);
    assert.deepEqual(planReadSkillManual(p, 'survival', 0, 'base'), { ok: false, reason: 'book' });
    assert.deepEqual(planReadSkillManual(funded(), 'survival', 1, 'base'), { ok: false, reason: 'maximum' });
    assert.throws(() => planReadSkillManual(p, 'survival', NaN, 'base'));
});
test('respec conserves XP and branch point totals, charges one chosen payment, and refuses empty/insufficient payments', () => {
    const p = learn(learn(funded(), 'combat-grip', 2), 'search-carry');
    assert.deepEqual(planSkillRespec(p, 'combat', { cash: 499, manuals: 1, useManual: false }, 'base'), { ok: false, reason: 'funds' });
    assert.deepEqual(planSkillRespec(p, 'combat', { cash: 500, manuals: 0, useManual: true }, 'base'), { ok: false, reason: 'book' });
    const cash = planSkillRespec(p, 'combat', { cash: 500, manuals: 1, useManual: false }, 'base'); assert.ok(cash.ok);
    assert.equal(cash.cashCost, 500); assert.equal(cash.consumed, 0); assert.deepEqual(cash.progress.xpMilli, p.xpMilli);
    assert.equal(skillBoard(cash.progress).branches.combat.available, 15); assert.equal(skillBoard(cash.progress).branches.search.spent, 1);
    const manual = planSkillRespec(p, 'combat', { cash: 0, manuals: 1, useManual: true }, 'base'); assert.ok(manual.ok);
    assert.equal(manual.cashCost, 0); assert.equal(manual.consumed, 1);
    assert.deepEqual(planSkillRespec(cash.progress, 'combat', { cash: 500, manuals: 1, useManual: false }, 'base'), { ok: false, reason: 'empty' });
});
test('strict progress decoding rejects unknown fields, wrong values, duplicate/unsorted IDs, unmet tiers and point debt', () => {
    const valid = learn(prerequisites('combat-break'), 'combat-break');
    assert.deepEqual(decodeSkillProgress(encodeSkillProgress(valid)), valid);
    const bad = [null, [], {}, { ...valid, extra: 1 }, { ...valid, version: 2 }, { ...valid, xpMilli: { ...valid.xpMilli, extra: 0 } },
        { ...valid, xpMilli: { ...valid.xpMilli, combat: '3300000' } }, { ...valid, ranks: [{ id: 'combat-grip', rank: 0 }] },
        { ...valid, ranks: [{ id: 'combat-grip', rank: 4 }] }, { ...valid, ranks: [{ id: 'combat-grip', rank: 1, extra: true }] },
        { ...valid, ranks: [{ id: 'combat-grip', rank: 1 }, { id: 'combat-grip', rank: 1 }] },
        { ...valid, ranks: [{ id: 'combat-reload', rank: 1 }, { id: 'combat-grip', rank: 1 }] },
        { ...valid, ranks: [{ id: 'combat-burst', rank: 1 }] }, { ...newSkillProgress(), ranks: [{ id: 'combat-grip', rank: 1 }] },
        { ...valid, ranks: [...valid.ranks, { id: 'combat-ambush', rank: 1 }] }];
    for (const value of bad) assert.throws(() => decodeSkillProgress(JSON.stringify(value)), JSON.stringify(value));
    assert.throws(() => decodeSkillProgress('{"version":1,"xpMilli":{"combat":0,"survival":0,"search":0},"ranks":[],"__proto__":{}}'));
    assert.throws(() => decodeSkillProgress(' '.repeat(16001))); assert.throws(() => decodeSkillProgress('{'));
});

const effectCases = [
    ['combat-grip', 'recoil', .88], ['combat-reload', 'reload', .88], ['combat-aim', 'aimTime', .85], ['combat-melee', 'knifeDamage', 1.18],
    ['combat-burst', 'burstBloom', .85], ['combat-move', 'sprintCost', .85], ['combat-break', 'reload', .8], ['combat-ambush', 'ambushCrit', .1],
    ['survival-breath', 'sprintCost', .88], ['survival-heal', 'heal', 1.15], ['survival-needs', 'needsLoss', .88],
    ['survival-clot', 'bleedChance', .85], ['survival-environment', 'pollutionGain', .85], ['survival-calm', 'mentalLoss', .85],
    ['survival-emergency', 'emergencyBaseHeal', .3], ['survival-respite', 'staminaRecovery', 1.3],
    ['search-carry', 'carryKg', 3], ['search-notice', 'noticeRadius', 1.24], ['search-tags', 'materialTags', 3],
    ['search-step', 'overweight', .82], ['search-quiet', 'stepNoise', .88], ['search-scrap', 'scrapChance', .15],
    ['search-finds', 'guaranteedFind', true], ['search-pack', 'materialWeight', .9],
    ['combat-recovery', 'recoilRecovery', 1.15], ['combat-hipfire', 'hipfireBloom', .91], ['combat-switch', 'weaponSwitch', .82],
    ['combat-flinch', 'hitFlinch', .82], ['combat-execute', 'executeDamage', 1.12], ['combat-steady-step', 'aimingMoveBloom', .88],
    ['combat-auto-feed', 'autoFeedRounds', 1], ['combat-field-press', 'pressRounds', 2],
    ['survival-stamina', 'staminaBonus', 12], ['survival-metabolism', 'supplyAbsorption', 1.12], ['survival-pain', 'painDuration', .85],
    ['survival-coagulation', 'bleedDamage', .88], ['survival-recovery', 'staminaRecovery', 1.15], ['survival-grit', 'lowHealthDamage', .94],
    ['survival-regeneration', 'regenerationHp', 1], ['survival-auto-aid', 'autoAidHp', 10],
    ['search-container-limit', 'searchOriginCap', 1.6], ['search-light-meds', 'medicineWeight', .91],
    ['search-overweight-stamina', 'overweightStamina', .88], ['search-memory', 'memorySeconds', 3], ['search-scout', 'detectionRadius', .94],
    ['search-route-efficiency', 'staminaRecovery', 1.09], ['search-auto-salvage', 'salvageYield', 1], ['search-field-scan', 'scanCharges', 1],
] as const;
for (const [id, field, expected] of effectCases) test(`actual numeric effect: ${id}; no borrowed prerequisite bonus is counted twice`, () => {
    const before = prerequisites(id), after = learn(before, id, skillDefinition(id)!.max);
    const observed = { ...context, selfHpRatio: .2, targetHpRatio: .2, carryRatio: .5, aiming: id !== 'combat-hipfire' };
    const base = skillEffects(before, observed)[field], result = skillEffects(after, observed)[field];
    if (typeof expected === 'boolean') assert.equal(result, expected);
    else if (base === 0) close(result as number, expected);
    else close((result as number) / (base as number), expected);
});
test('junctions cost two points, are mutually exclusive within their branch, and can coexist with one specialization', () => {
    let p = prerequisites('combat-auto-feed');
    p = creditSkillMilliXp(newSkillProgress(), 'combat', 1080000);
    p = learn(p, 'combat-grip', 3); p = learn(p, 'combat-reload', 2);
    const before = skillBoard(p).branches.combat.available;
    p = learn(p, 'combat-auto-feed'); assert.equal(skillBoard(p).branches.combat.available, before - 2);
    assert.deepEqual(planLearnSkill(p, 'combat-field-press', 'base'), { ok: false, reason: 'exclusive' });
    p = creditSkillMilliXp(p, 'combat', 3300000); p = learn(p, 'combat-burst', 3); p = learn(p, 'combat-break');
    assert.equal(skillBoard(p).branches.combat.spent, 11);
    const budget = creditSkillMilliXp(newSkillProgress(), 'combat', 780000);
    const five = learn(learn(budget, 'combat-grip', 3), 'combat-reload', 2);
    assert.equal(skillBoard(five).branches.combat.available, 1);
    assert.deepEqual(planLearnSkill(five, 'combat-auto-feed', 'base'), { ok: false, reason: 'points' });
    const illegal = funded(); illegal.ranks = [...prerequisites('combat-auto-feed').ranks,
        { id: 'combat-auto-feed', rank: 1 }, { id: 'combat-field-press', rank: 1 }];
    assert.throws(() => assertSkillProgress(illegal));
});
test('compiled evaluation is detached, matches direct evaluation and enforces observed-condition boundaries', () => {
    const p = learn(prerequisites('combat-execute'), 'combat-execute', 3), compiled = compileSkillEffects(p);
    for (const targetHpRatio of [0, .25, .250001, null]) {
        const c = { ...context, targetHpRatio }; assert.deepEqual(compiled(c), skillEffects(p, c));
    }
    close(compiled({ ...context, targetHpRatio: .25 }).executeDamage, 1.12);
    close(compiled({ ...context, targetHpRatio: 0 }).executeDamage, 1);
    p.ranks = []; close(compiled({ ...context, targetHpRatio: .25 }).executeDamage, 1.12);
    const first = compiled(context); first.recoil = 900; assert.notEqual(compiled(context).recoil, 900);
    assert.throws(() => compiled({ ...context, selfHpRatio: null } as unknown as SkillEffectContext));
    assert.throws(() => compiled({ ...context, carryRatio: -1 }));
    assert.throws(() => compiled({ ...context, sprinting: 1 } as unknown as SkillEffectContext));
    const scout = learn(prerequisites('search-scout'), 'search-scout', 3);
    close(skillEffects(scout, { ...context, sprinting: true }).detectionRadius, 1);
    close(skillEffects(scout, { ...context, lastHostileAt: 5 }).detectionRadius, 1);
});
test('timed effects have exact expiry boundaries; preview has no side effects and never grants healing by itself', () => {
    const p = learn(prerequisites('combat-break'), 'combat-break'), text = encodeSkillProgress(p);
    const expiry = skillEffects(p, { ...context, at: 11 }); close(expiry.reload, .88);
    const move = learn(prerequisites('combat-move'), 'combat-move', 3);
    close(skillEffects(move, { ...context, at: 13 }).sprintCost, 1);
    const ambush = learn(prerequisites('combat-ambush'), 'combat-ambush');
    assert.equal(skillEffects(ambush, { ...context, at: 5, lastKillAt: null }).ambushCrit, 0);
    assert.equal(skillEffects(ambush, { ...context, aiming: false }).ambushCrit, 0);
    assert.equal(skillEffects(ambush, { ...context, ambushReadyAt: 11 }).ambushCrit, 0);
    assert.equal(encodeSkillProgress(p), text);
    assert.throws(() => skillEffects(p, { ...context, at: NaN }));
    assert.throws(() => skillEffects(p, { ...context, at: null } as unknown as SkillEffectContext));
    assert.throws(() => skillEffects(p, { ...context, ambushReadyAt: null } as unknown as SkillEffectContext));
    assert.throws(() => skillEffects(p, { ...context, lastHostileAt: 20 }));
});
test('research state never mutates real attributes/Perks; current production codecs refuse an injected skill field', () => {
    const profile = D.newSave(), expansion = newExpansion(0); upgradeToRpg(expansion, 0);
    const raw = JSON.stringify({ profile, expansion });
    skillEffects(learn(prerequisites('survival-emergency'), 'survival-emergency'), context);
    assert.equal(JSON.stringify({ profile, expansion }), raw);
    assert.doesNotThrow(() => validateExpansion(expansion, profile, null, resolveExpansionWorld));
    const injected = structuredClone(expansion) as typeof expansion & { skills: SkillProgress }; injected.skills = funded();
    assert.throws(() => validateExpansion(injected, profile, null, resolveExpansionWorld));
    assert.throws(() => critChance([{ id: 'combat-ambush', chance: .1 }] as never), 'a future crit-source migration is necessary, not an optional-field shortcut');
});
test('mixed grants/choices/respec/roundtrips conserve branch points over 2400 deterministic operations', () => {
    let rng = 143, p = newSkillProgress();
    for (let i = 0; i < 2400; i++) {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        const b = SKILL_BRANCHES[rng % 3], before = encodeSkillProgress(p);
        if (rng % 7 < 2) p = creditSkillMilliXp(p, b, 10000);
        else if (rng % 7 < 5) { const result = planLearnSkill(p, SKILLS[(rng >>> 3) % SKILLS.length].id, 'base'); if (result.ok) p = result.progress; else assert.equal(encodeSkillProgress(p), before); }
        else if (rng % 7 === 5) { const result = planSkillRespec(p, b, { cash: 500, manuals: 0, useManual: false }, 'base'); if (result.ok) p = result.progress; }
        else p = decodeSkillProgress(encodeSkillProgress(p));
        assertSkillProgress(p);
        for (const branch of SKILL_BRANCHES) { const view = skillBoard(p).branches[branch]; assert.equal(view.spent + view.available, view.level); assert.ok(view.available >= 0); }
    }
});
