import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import * as D from '../src/domain';
import { addPerk, canChoosePerk, characterCritChance, critBreakdown, critChance, critMultiplier, critSources, perkLimitBonus, perkModifiers, perkNodes,
    removeAttributePerks, snapshotChance, validPerkSelection, CRIT_SOURCE_IDS, PERK_IDS,
    type CritInput, type CritSource, type PerkId, type PerkModifiers } from '../src/perks';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
const level = (strength: number, constitution = 10, technique = 10) => ({ strength, constitution, technique });
const none = perkModifiers([]);
const shot = (input: Partial<CritInput> = {}): CritInput => ({ technique: 10, weapon: D.WEAPONS.pistol, perks: [], focus: false, breath: 0, ...input });
const chance = (input: Partial<CritInput> = {}) => critChance(critSources(shot(input))!);

test('each of the 24 perks changes exactly one modifier, by its design value', () => {
    assert.deepEqual(none, { hp: 0, stamina: 0, carry: 0, sprintCost: 1, staminaRecovery: 1, overweight: 1, knifeDamage: 1, heal: 1, bleedChance: 1,
        absorption: 1, pollutionGain: 1, mentalLoss: 1, enemyDamage: 1, recoil: 1, reload: 1, crit: [], critMultiplier: 1.5, breath: false });
    const spec: Record<PerkId, [keyof PerkModifiers, unknown]> = {
        'strength-15-a': ['carry', 4], 'strength-15-b': ['sprintCost', .88], 'strength-20-a': ['overweight', .7], 'strength-20-b': ['stamina', 20],
        'strength-25-a': ['knifeDamage', 1.2], 'strength-25-b': ['staminaRecovery', 1.2], 'strength-30-a': ['carry', 6], 'strength-30-b': ['sprintCost', .82],
        'constitution-15-a': ['hp', 20], 'constitution-15-b': ['heal', 1.2], 'constitution-20-a': ['bleedChance', .7], 'constitution-20-b': ['absorption', 1.25],
        'constitution-25-a': ['pollutionGain', .8], 'constitution-25-b': ['mentalLoss', .75], 'constitution-30-a': ['enemyDamage', .9], 'constitution-30-b': ['heal', 1.3],
        'technique-15-a': ['breath', true], 'technique-15-b': ['recoil', .8], 'technique-20-a': ['crit', [{ id: 'technique-20-a', chance: .05 }]], 'technique-20-b': ['reload', .85],
        'technique-25-a': ['critMultiplier', 1.7], 'technique-25-b': ['recoil', .85], 'technique-30-a': ['crit', [{ id: 'technique-30-a', chance: .1 }]], 'technique-30-b': ['reload', .8],
    };
    for (const id of PERK_IDS) {
        const m = perkModifiers([id]), [kind, value] = spec[id];
        assert.deepEqual((Object.keys(none) as (keyof PerkModifiers)[]).filter(k => !isDeepStrictEqual(m[k], none[k])), [kind], id);
        assert.deepEqual(m[kind], value, id);
    }
});

test('same-kind multipliers multiply and fixed bonuses add: 0.68, 0.68, 1.56 and 0.7216 (CP-10)', () => {
    const factors: PerkId[] = ['strength-15-b', 'strength-20-a', 'strength-25-b', 'strength-30-b', 'constitution-15-b', 'constitution-20-a',
        'constitution-25-b', 'constitution-30-b', 'technique-15-b', 'technique-20-b', 'technique-25-b', 'technique-30-b'];
    const bonuses: PerkId[] = ['strength-15-a', 'strength-20-b', 'strength-25-a', 'strength-30-a', 'constitution-15-a', 'constitution-20-b',
        'constitution-25-a', 'constitution-30-a', 'technique-15-a', 'technique-20-a', 'technique-25-a', 'technique-30-a'];
    for (const perks of [factors, bonuses]) assert.ok(validPerkSelection(perks, level(30, 30, 30)), 'both are full, reachable builds');
    const m = perkModifiers(factors);
    assert.ok(near(m.recoil, .68) && near(m.reload, .68) && near(m.heal, 1.56) && near(m.sprintCost, .7216));
    assert.deepEqual({ ...m, recoil: 0, reload: 0, heal: 0, sprintCost: 0 },
        { ...none, recoil: 0, reload: 0, heal: 0, sprintCost: 0, overweight: .7, staminaRecovery: 1.2, bleedChance: .7, mentalLoss: .75 });
    assert.ok(near(.18 * m.bleedChance, .126), 'bleeding 18% becomes 12.6%');
    assert.ok(near(16 * m.heal, 24.96), 'a bandage heals 16 x 1.56');
    assert.deepEqual(perkModifiers(bonuses), { ...none, hp: 20, stamina: 20, carry: 10, knifeDamage: 1.2, absorption: 1.25, pollutionGain: .8,
        enemyDamage: .9, crit: [{ id: 'technique-20-a', chance: .05 }, { id: 'technique-30-a', chance: .1 }], critMultiplier: 1.7, breath: true });
    assert.deepEqual(perkLimitBonus(bonuses), { hp: 20, stamina: 20, carry: 10 });
    assert.equal(critMultiplier(bonuses), 1.7);
    assert.equal(critMultiplier(factors), 1.5);
});

test('every id counts once, the input order never matters, and ids outside the catalog count for nothing', () => {
    const set: PerkId[] = ['technique-25-b', 'strength-30-b', 'technique-30-a', 'technique-15-b', 'strength-15-b', 'technique-20-a'];
    const m = perkModifiers(set);
    assert.deepEqual(perkModifiers([...set].reverse()), m);
    assert.deepEqual(perkModifiers([...set, ...set]), m);
    assert.deepEqual(m.crit.map(s => s.id), ['technique-20-a', 'technique-30-a']);
    assert.deepEqual(perkLimitBonus(['strength-15-a', 'strength-15-a', 'constitution-15-a', 'constitution-15-a']), { hp: 20, stamina: 0, carry: 4 });
    assert.deepEqual(perkModifiers(['toString', '__proto__', 'constructor', 'hasOwnProperty', 'strength-15-c', 'luck-15-a', ''] as unknown as PerkId[]), none);
});

test('every weapon states its own critical source; the knife and an empty hand get no sources at all', () => {
    // The gunsmith guns state the catalog's (#28 M2-01, M3-01).
    assert.deepEqual(Object.fromEntries(Object.values(D.WEAPONS).map(w => [w.id, w.crit])), { knife: 0, pistol: .05, shotgun: .03, carbine: .08, gb17: .05, mb4a1: .05,
        pb226: .05, mpb5: .04, vb9: .04, mb870: .03, mb1014: .03, akb74: .05, akb103: .06 });
    // @ts-expect-error a weapon that does not state `crit` does not compile
    const unstated: D.WeaponDef = { id: 'x', name: 'x', ammo: 'ammo9', magazine: 1, damage: 1, range: 1, cooldown: 1, reload: 1, pellets: 1, spread: 0 };
    assert.equal(unstated.crit, undefined);
    const all: PerkId[] = ['technique-15-a', 'technique-20-a', 'technique-30-a'];
    assert.equal(critSources(shot({ technique: 40, weapon: D.WEAPONS.knife, perks: all, focus: true, breath: .3 })), null);
    assert.equal(critSources(shot({ technique: 40, weapon: null, perks: all, focus: true, breath: .3 })), null);
    assert.ok(critSources(shot({ weapon: D.WEAPONS.mb4a1 }))!.some(s => s.id === 'weapon' && s.chance === .05));
});

test('a shot gathers its sources: the design examples with the real guns (CP-04)', () => {
    assert.ok(near(chance(), .069));
    assert.ok(near(chance({ weapon: D.WEAPONS.shotgun }), .0494));
    assert.ok(near(chance({ weapon: D.WEAPONS.carbine }), .0984));
    const charged: Partial<CritInput> = { weapon: D.WEAPONS.carbine, perks: ['technique-15-a'], breath: .3 };
    assert.ok(near(chance(charged), .36888));
    assert.ok(near(chance({ ...charged, focus: true }), .400436));
    assert.ok(near(chance({ ...charged, technique: 15 }), .37371));
    assert.ok(near(chance({ ...charged, technique: 15, focus: true }), .4050245));
    assert.deepEqual(critSources(shot({ ...charged, technique: 15, focus: true, perks: ['technique-30-a', 'technique-15-a', 'technique-20-a'] })), [
        { id: 'character', chance: characterCritChance(15) }, { id: 'weapon', chance: .08 }, { id: 'technique-15-a', chance: .3 },
        { id: 'technique-20-a', chance: .05 }, { id: 'technique-30-a', chance: .1 }, { id: 'focus', chance: .05 }]);
});

test('the technique drug moves only the character source, by 0.75 points; focus is one source however often it is taken (CP-04)', () => {
    const input: Partial<CritInput> = { weapon: D.WEAPONS.carbine, perks: ['technique-15-a', 'technique-20-a'], focus: true, breath: .2 };
    const plain = critSources(shot({ ...input, technique: 12 }))!, dosed = critSources(shot({ ...input, technique: 17 }))!;
    assert.deepEqual(dosed.map(s => s.id), plain.map(s => s.id));
    dosed.forEach((s, i) => s.id === 'character' ? assert.ok(near(s.chance - plain[i].chance, .0075)) : assert.equal(s.chance, plain[i].chance));
    assert.deepEqual(plain.filter(s => s.id === 'focus'), [{ id: 'focus', chance: .05 }]);
    assert.equal(critChance([...plain, { id: 'focus', chance: .05 }]), critChance(plain), 'another dose adds no second source');
    assert.deepEqual(critBreakdown([...plain, ...plain]), critBreakdown(plain));
    assert.equal(critSources(shot({ ...input, focus: false }))!.some(s => s.id === 'focus'), false);
});

test('the breath source needs technique-15-a and a charge above 0; its chance stays within 0 to 30%', () => {
    const ids = (input: Partial<CritInput>) => critSources(shot(input))!.map(s => s.id);
    assert.deepEqual(ids({ breath: .3 }), ['character', 'weapon'], 'without the perk aiming adds nothing');
    assert.deepEqual(ids({ perks: ['technique-15-a'], breath: 0 }), ['character', 'weapon'], 'no target, no charge');
    assert.deepEqual(critSources(shot({ perks: ['technique-15-a'], breath: .15 }))!.find(s => s.id === 'technique-15-a'), { id: 'technique-15-a', chance: .15 });
    for (const breath of [-.01, .31, NaN, Infinity]) assert.throws(() => critSources(shot({ perks: ['technique-15-a'], breath })), /命中参数无效/, String(breath));
    for (const bad of [{ technique: NaN }, { technique: -Infinity }, { weapon: { ...D.WEAPONS.pistol, crit: NaN } }, { weapon: { ...D.WEAPONS.pistol, crit: 1.01 } },
        { weapon: { ...D.WEAPONS.pistol, crit: -.01 } }]) assert.throws(() => critSources(shot(bad)), /命中参数无效/);
});

test('the chance depends on the sources alone and is the same in every order, exactly (CP-01, CP-02)', () => {
    const sources = critSources(shot({ technique: 13, weapon: D.WEAPONS.carbine, perks: ['technique-15-a', 'technique-20-a'], focus: true, breath: .17 }))!;
    const expected = critBreakdown(sources);
    const orders = <T>(list: T[]): T[][] => list.length < 2 ? [list] : list.flatMap((x, i) => orders(list.filter((_, j) => j !== i)).map(rest => [x, ...rest]));
    for (const order of orders(sources)) {
        assert.equal(critChance(order), expected.chance);
        assert.deepEqual(critBreakdown(order), expected);
    }
    const snapshot = { sources: sources.filter(s => s.id !== 'technique-15-a'), multiplier: critMultiplier([]), target: null };
    for (const uid of ['entity-r-1', 'entity-r-2', 'entity-9']) assert.equal(snapshotChance(snapshot, uid), critChance(snapshot.sources), uid);
});

test('the panel prints two decimals, "<100%" when rounding would claim a sure hit, and "100%" only for an explicit 100% source (CP-03)', () => {
    const b = critBreakdown(critSources(shot({ weapon: D.WEAPONS.carbine, perks: ['technique-15-a'], focus: true, breath: .3 }))!);
    assert.deepEqual([b.text, b.guaranteed], ['40.04%', false]);
    assert.ok(near(b.chance, .400436));
    assert.deepEqual(b.sources.map(s => [s.id, s.text]), [['character', '2.00%'], ['weapon', '8.00%'], ['technique-15-a', '30.00%'], ['focus', '5.00%']]);
    assert.equal(critBreakdown(critSources(shot())!).text, '6.90%');
    assert.equal(critBreakdown(critSources(shot({ technique: 15, weapon: D.WEAPONS.carbine, perks: ['technique-15-a'], focus: true, breath: .3 }))!).text, '40.50%');
    const zero = critBreakdown([{ id: 'weapon', chance: 0 }, { id: 'focus', chance: 0 }]);
    assert.deepEqual([zero.chance, zero.guaranteed, zero.text], [0, false, '0.00%']);
    assert.equal(critBreakdown([]).text, '0.00%');
    const sure = critBreakdown([{ id: 'focus', chance: .2 }, { id: 'weapon', chance: 1 }]);
    assert.deepEqual([sure.chance, sure.guaranteed, sure.text, sure.sources.map(s => s.text)], [1, true, '100%', ['100%', '20.00%']]);
    const almost = critBreakdown([{ id: 'weapon', chance: .999 }, { id: 'focus', chance: .999 }]);
    assert.deepEqual([almost.guaranteed, almost.text, almost.sources.map(s => s.text)], [false, '<100%', ['99.90%', '99.90%']]);
    assert.equal(critBreakdown([{ id: 'weapon', chance: .99999 }]).text, '<100%');
    assert.equal(critBreakdown([{ id: 'weapon', chance: .99994 }]).text, '99.99%');
    // Sources just below 100% may combine to exactly 1 in floating point; that is still no guaranteed hit.
    const many = critBreakdown(CRIT_SOURCE_IDS.map(id => ({ id, chance: 1 - 1e-9 })));
    assert.deepEqual([many.chance, many.guaranteed, many.text], [1, false, '<100%']);
    for (const bad of [[{ id: 'toString', chance: .1 }], [{ id: '__proto__', chance: .1 }], [{ id: 'weapon', chance: NaN }],
        [{ id: 'focus', chance: .05 }, { id: 'focus', chance: .1 }]]) assert.throws(() => critBreakdown(bad as CritSource[]), /命中参数无效/);
});

test('only the permanent integer level opens a node: 14 with progress near 1 stays locked (CP-07, CP-08)', () => {
    const growth = { permanent: level(14, 14, 14), progress: level(.999999, .999999, .999999) };
    assert.ok(perkNodes([], growth.permanent).every(n => n.status === 'locked'));
    for (const id of PERK_IDS) assert.equal(canChoosePerk([], growth.permanent, id), false, id);
    assert.equal(canChoosePerk([], level(14.999), 'strength-15-a'), false);
    assert.ok(perkNodes([], level(10, 10, 10)).every(n => n.status === 'locked'), 'a new save has nothing open');
    assert.deepEqual(perkNodes([], level(15, 14, 14)).filter(n => n.status === 'open').map(n => `${n.attribute}-${n.tier}`), ['strength-15']);
    assert.deepEqual(perkNodes([], level(26)).filter(n => n.attribute === 'strength').map(n => n.status), ['open', 'open', 'open', 'locked'],
        'crossing several tiers opens each of them and chooses none');
    const full = perkNodes([], level(30, 30, 30));
    assert.equal(full.length, 12);
    assert.ok(full.every(n => n.status === 'open'));
    assert.equal(PERK_IDS.filter(id => canChoosePerk([], level(30, 30, 30), id)).length, 24);
});

test('choosing: any open node first, one perk per node, catalog order kept, never switched directly (CP-09)', () => {
    const permanent = level(26, 15, 30);
    let perks: PerkId[] = [];
    for (const id of ['technique-30-b', 'strength-25-b', 'constitution-15-a', 'strength-15-a'] as const) {
        assert.ok(canChoosePerk(perks, permanent, id), id);
        perks = addPerk(perks, id);
    }
    assert.deepEqual(perks, ['strength-15-a', 'strength-25-b', 'constitution-15-a', 'technique-30-b']);
    assert.ok(validPerkSelection(perks, permanent));
    assert.deepEqual(perkNodes(perks, permanent).map(n => n.status === 'chosen' ? n.id : `${n.attribute}-${n.tier} ${n.status}`), [
        'strength-15-a', 'strength-20 open', 'strength-25-b', 'strength-30 locked',
        'constitution-15-a', 'constitution-20 locked', 'constitution-25 locked', 'constitution-30 locked',
        'technique-15 open', 'technique-20 open', 'technique-25 open', 'technique-30-b']);
    for (const [id, why] of [['strength-25-a', 'the other side of a chosen node'], ['strength-15-a', 'already chosen'], ['strength-30-a', 'locked'],
        ['constitution-20-a', 'locked'], ['toString', 'prototype name'], ['__proto__', 'prototype name'], ['constructor', 'prototype name'],
        ['strength-15-c', 'unknown side'], ['luck-15-a', 'unknown attribute'], ['', 'empty']] as const)
        assert.equal(canChoosePerk(perks, permanent, id), false, why);
    assert.equal(canChoosePerk(['strength-25-b', 'strength-15-a'], permanent, 'technique-15-a'), false, 'an out-of-order selection is never extended');
    assert.equal(canChoosePerk(['strength-15-a', 'strength-15-b'], permanent, 'technique-15-a'), false, 'nor one with both sides of a node');
});

test('twelve choices in any order end in catalog order, and then nothing more can be chosen (CP-07)', () => {
    const permanent = level(30, 30, 30), wanted = PERK_IDS.filter((_, i) => i % 2 === Math.floor(i / 2) % 2);
    let perks: PerkId[] = [];
    for (const id of [...wanted].reverse()) {
        assert.ok(canChoosePerk(perks, permanent, id), id);
        perks = addPerk(perks, id);
    }
    assert.deepEqual(perks, wanted);
    assert.ok(validPerkSelection(perks, permanent) && perks.length === 12);
    assert.ok(perkNodes(perks, permanent).every(n => n.status === 'chosen'));
    assert.ok(PERK_IDS.every(id => !canChoosePerk(perks, permanent, id)));
});

test('a reset removes the perks of one attribute only and reopens its unlocked nodes', () => {
    const permanent = level(30, 20, 25), perks: PerkId[] = ['strength-15-a', 'strength-30-b', 'constitution-20-b', 'technique-25-a'];
    const left = removeAttributePerks(perks, 'strength');
    assert.deepEqual(left, ['constitution-20-b', 'technique-25-a']);
    assert.ok(validPerkSelection(left, permanent));
    assert.ok(perkNodes(left, permanent).filter(n => n.attribute === 'strength').every(n => n.status === 'open'));
    assert.deepEqual(removeAttributePerks(left, 'strength'), left, 'nothing left to remove');
    assert.deepEqual(removeAttributePerks(perks, 'technique'), ['strength-15-a', 'strength-30-b', 'constitution-20-b']);
    assert.deepEqual([perkLimitBonus(perks).carry, perkLimitBonus(left).carry], [4, 0]);
    assert.ok(canChoosePerk(left, permanent, 'strength-15-b'), 'the other side is free again');
});
