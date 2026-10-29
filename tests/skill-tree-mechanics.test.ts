import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { factoryState } from '../src/gunsmith/instance';
import { decodeStoredProfile } from '../src/profile-codec';
import { SKILL_BRANCHES, skillDefinition, type SkillId } from '../src/skill-tree-catalog';
import { newSkillProgress, creditSkillMilliXp, planLearnSkill, type SkillProgress } from '../src/skill-tree';
import { beginSkillResearchRaid, newSkillResearch, recordSkillResearchEvent, skillResearchView } from '../src/skill-tree-research';
import { newSkillMechanics, planSkillMechanic, skillMechanicView, encodeSkillMechanics, decodeSkillMechanics,
    type SkillMechanicCommand, type SkillMechanicJournal, type SkillMechanicSeed } from '../src/skill-tree-mechanics';

function selection(ids: SkillId[]): SkillProgress {
    let p = newSkillProgress();
    for (const branch of SKILL_BRANCHES) {
        p = creditSkillMilliXp(p, branch, 3300000);
        if (!ids.some(id => skillDefinition(id)!.branch === branch)) continue;
        const basics = branch === 'combat' ? ['combat-grip', 'combat-reload'] : branch === 'survival'
            ? ['survival-breath', 'survival-needs'] : ['search-carry', 'search-notice'];
        for (let n = 0; n < 5; n++) {
            const r = planLearnSkill(p, basics[n < 3 ? 0 : 1], 'base'); assert.ok(r.ok); p = r.progress;
        }
    }
    for (const id of ids) { const r = planLearnSkill(p, id, 'base'); assert.ok(r.ok); p = r.progress; }
    return p;
}
function seed(ids: SkillId[] = []): SkillMechanicSeed {
    return { runId: 'lab-143', progress: selection(ids), bag: D.createInventory(6, 5),
        equipment: { weapon: 'pistol', weaponUid: 'held', gun: factoryState(), relief: false, ammo: 0, ammoRelief: 0 },
        vitals: { hpMilli: 20000, maxHpMilli: 100000, waterMilli: 100000, satietyMilli: 100000, pollutionMilli: 0, bleeding: false },
        protectedItems: [], containers: [] };
}
function stock(s: SkillMechanicSeed, id: string, qty: number, relief = false) {
    let n = s.bag.items.length; assert.equal(D.addItem(s.bag, id, qty, relief, false, true, () => `stock-${++n}`), 0);
}
function step(j: SkillMechanicJournal, kind: SkillMechanicCommand['kind'], fields: Record<string, unknown> = {}) {
    return planSkillMechanic(j, { id: `cmd-${j.commands.length}`, runId: j.seed.runId, atMs: skillMechanicView(j).atMs, kind,
        ...fields } as SkillMechanicCommand).journal;
}
const advance = (j: SkillMechanicJournal, atMs: number, flags: Record<string, boolean> = {}) =>
    step(j, 'advance', { atMs, paused: false, reloading: false, sprinting: false, ...flags });
const quantity = (j: SkillMechanicJournal, id: string, relief?: boolean) => skillMechanicView(j).bag.items
    .filter(i => i.id === id && (relief === undefined || !!i.relief === relief)).reduce((n, i) => n + i.qty, 0);

test('automatic feed moves one real matching round after its warmup, preserving relief provenance and effective capacity', () => {
    const s = seed(['combat-auto-feed']); stock(s, 'ammo9', 12); stock(s, 'ammo9', 3, true); stock(s, 'shell', 5);
    let j = newSkillMechanics(s); const original = encodeSkillMechanics(j);
    j = advance(j, 6999); assert.equal(skillMechanicView(j).equipment.ammo, 0);
    j = advance(j, 7000); assert.equal(skillMechanicView(j).equipment.ammoRelief, 1);
    j = advance(j, 600000);
    const v = skillMechanicView(j); assert.equal(v.equipment.ammo, D.equippedWeapon(s.equipment).magazine);
    assert.equal(v.equipment.ammoRelief, 3); assert.equal(quantity(j, 'ammo9') + v.equipment.ammo, 15);
    assert.equal(quantity(j, 'ammo9', true) + v.equipment.ammoRelief, 3); assert.equal(quantity(j, 'shell'), 5);
    assert.equal(JSON.parse(original).seed.bag.items[0].qty, 12); assert.deepEqual(s.bag, JSON.parse(original).seed.bag);
});

test('feed follows modified gun capacity and never invents rounds for an empty bag or an empty gun slot', () => {
    const s = seed(['combat-auto-feed']);
    s.equipment.weapon = 'gb17';
    s.equipment.gun!.parts.push({ uid: 'mag', id: 'G01', slot: 'mag', relief: false, children: [] });
    stock(s, 'ammo9', 40);
    let j = advance(newSkillMechanics(s), 600000); assert.equal(skillMechanicView(j).equipment.ammo, 24);
    assert.equal(quantity(j, 'ammo9'), 16);
    s.bag = D.createInventory(6, 5); j = advance(newSkillMechanics(s), 600000); assert.equal(skillMechanicView(j).equipment.ammo, 0);
    s.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 }; stock(s, 'ammo9', 10);
    j = advance(newSkillMechanics(s), 600000); assert.equal(quantity(j, 'ammo9'), 10);
});

test('busy intervals discard ticks, pause cannot advance action time, and firing or enemy contact restarts warmup', () => {
    const s = seed(['combat-auto-feed']); stock(s, 'ammo9', 20);
    let j = advance(newSkillMechanics(s), 20000, { reloading: true }); assert.equal(skillMechanicView(j).equipment.ammo, 0);
    j = advance(j, 21000); assert.equal(skillMechanicView(j).equipment.ammo, 1);
    j = step(j, 'fire'); assert.equal(skillMechanicView(j).equipment.ammo, 0);
    j = advance(j, 27999); assert.equal(skillMechanicView(j).equipment.ammo, 0);
    j = step(j, 'hostile'); j = advance(j, 34998); assert.equal(skillMechanicView(j).equipment.ammo, 0);
    j = advance(j, 34999); assert.equal(skillMechanicView(j).equipment.ammo, 1);
    assert.throws(() => advance(j, 35000, { paused: true }));
    assert.deepEqual(skillMechanicView(advance(j, 34999, { paused: true })), skillMechanicView(j));
    j = advance(j, 50000, { sprinting: true }); assert.equal(skillMechanicView(j).equipment.ammo, 1);
    j = advance(j, 50999); assert.equal(skillMechanicView(j).equipment.ammo, 2);
});

test('firing and normal reload conserve ordinary and relief ammunition across a checkpoint', () => {
    const s = seed(['combat-auto-feed']); stock(s, 'ammo9', 15); stock(s, 'ammo9', 5, true);
    let j = advance(newSkillMechanics(s), 9000); j = step(j, 'fire'); j = step(j, 'reload');
    j = decodeSkillMechanics(encodeSkillMechanics(j)); j = step(j, 'fire'); j = step(j, 'fire');
    const v = skillMechanicView(j);
    assert.equal(quantity(j, 'ammo9') + v.equipment.ammo + v.counters.fired, 20);
    assert.equal(quantity(j, 'ammo9', true) + v.equipment.ammoRelief + v.counters.firedRelief, 5);
    assert.equal(v.counters.fired, 3); assert.equal(v.counters.firedRelief, 3);
});

test('field press consumes ordinary scrap, produces only the current gun ammo and stops at six rounds per run', () => {
    for (const [weapon, ammo] of [['pistol', 'ammo9'], ['shotgun', 'shell'], ['carbine', 'ammoR']]) {
        const s = seed(['combat-field-press']); s.equipment.weapon = weapon; stock(s, 'scrap', 4); stock(s, 'scrap', 5, true);
        let j = advance(newSkillMechanics(s), 17999); assert.equal(quantity(j, ammo), 0);
        j = advance(j, 600000); const v = skillMechanicView(j);
        assert.equal(quantity(j, ammo, false), 6); assert.equal(quantity(j, 'scrap', false), 1); assert.equal(quantity(j, 'scrap', true), 5);
        assert.equal(v.counters.generatedAmmo, 6); assert.equal(v.counters.usedScrap, 3); assert.equal(v.equipment.ammo, 0);
        assert.ok(6 * D.ITEMS[ammo].sell < 3 * D.ITEMS.scrap.sell);
    }
});

test('press cannot convert relief or protected scrap; insufficient space rolls back the entire exchange', () => {
    const relief = seed(['combat-field-press']); stock(relief, 'scrap', 5, true);
    assert.equal(skillMechanicView(advance(newSkillMechanics(relief), 600000)).counters.generatedAmmo, 0);
    const protectedSeed = seed(['combat-field-press']); stock(protectedSeed, 'scrap', 5); protectedSeed.protectedItems = ['scrap'];
    assert.equal(quantity(advance(newSkillMechanics(protectedSeed), 600000), 'scrap'), 5);
    const full = seed(['combat-field-press']); stock(full, 'scrap', 5);
    for (let n = 1; n < 30; n++) full.bag.items.push({ uid: `fill-${n}`, id: 'cloth', qty: 10, x: n % 6, y: Math.floor(n / 6) });
    const j = advance(newSkillMechanics(full), 600000);
    assert.deepEqual(skillMechanicView(j).bag, full.bag); assert.equal(skillMechanicView(j).counters.generatedAmmo, 0);
});

test('regeneration spends exactly one water and satiety per HP, with 60 percent and 30 HP per-run caps', () => {
    const s = seed(['survival-regeneration']); let j = advance(newSkillMechanics(s), 9999);
    assert.equal(skillMechanicView(j).vitals.hpMilli, 20000);
    j = advance(j, 10000); assert.equal(skillMechanicView(j).vitals.hpMilli, 21000);
    j = advance(j, 600000); let v = skillMechanicView(j);
    assert.equal(v.vitals.hpMilli, 50000); assert.equal(v.counters.regeneratedMilli, 30000);
    assert.equal(v.vitals.waterMilli, 70000); assert.equal(v.vitals.satietyMilli, 70000);
    s.vitals.hpMilli = 59500; j = advance(newSkillMechanics(s), 600000); v = skillMechanicView(j);
    assert.equal(v.vitals.hpMilli, 60000); assert.equal(v.counters.regeneratedMilli, 500); assert.equal(v.vitals.waterMilli, 99500);
    assert.equal(v.vitals.hpMilli - s.vitals.hpMilli, s.vitals.satietyMilli - v.vitals.satietyMilli);
});

test('regeneration cannot revive, heal bleeding or highly polluted bodies, exhaust essential reserves or trigger while sprinting', () => {
    for (const changes of [{ hpMilli: 0 }, { hpMilli: 70000 }, { bleeding: true }, { pollutionMilli: 40001 },
        { waterMilli: 20000 }, { satietyMilli: 20000 }]) {
        const s = seed(['survival-regeneration']); Object.assign(s.vitals, changes);
        const v = skillMechanicView(advance(newSkillMechanics(s), 600000)); assert.deepEqual(v.vitals, s.vitals);
    }
    const s = seed(['survival-regeneration']); s.vitals.waterMilli = 20500;
    let j = advance(newSkillMechanics(s), 600000); assert.equal(skillMechanicView(j).counters.regeneratedMilli, 500);
    j = advance(newSkillMechanics(seed(['survival-regeneration'])), 600000, { sprinting: true });
    assert.equal(skillMechanicView(j).counters.regeneratedMilli, 0);
});

test('damage resets regeneration warmup and a save/load does not refill its run budget or catch up offline', () => {
    let j = advance(newSkillMechanics(seed(['survival-regeneration'])), 10000);
    j = step(j, 'hurt', { amountMilli: 1000, enemy: false });
    j = decodeSkillMechanics(encodeSkillMechanics(j)); const before = skillMechanicView(j);
    assert.deepEqual(skillMechanicView(decodeSkillMechanics(encodeSkillMechanics(j))), before);
    j = advance(j, 19999); assert.equal(skillMechanicView(j).counters.regeneratedMilli, 1000);
    j = advance(j, 20000); assert.equal(skillMechanicView(j).counters.regeneratedMilli, 2000);
    j = advance(j, 600000); assert.equal(skillMechanicView(j).counters.regeneratedMilli, 30000);
});

test('auto aid uses a real relief-first bandage on a nonfatal low-health enemy hit only once, and gives no revive', () => {
    const s = seed(['survival-auto-aid']); s.vitals.hpMilli = 40000; s.vitals.bleeding = true;
    stock(s, 'bandage', 2); stock(s, 'bandage', 1, true);
    let j = step(newSkillMechanics(s), 'hurt', { amountMilli: 15000, enemy: true });
    let v = skillMechanicView(j); assert.equal(v.vitals.hpMilli, 35000); assert.equal(v.vitals.bleeding, false);
    assert.equal(quantity(j, 'bandage', true), 0); assert.equal(quantity(j, 'bandage', false), 2);
    j = decodeSkillMechanics(encodeSkillMechanics(j)); j = step(j, 'hurt', { amountMilli: 15000, enemy: true });
    assert.equal(skillMechanicView(j).vitals.hpMilli, 20000); assert.equal(quantity(j, 'bandage'), 2);
    j = step(j, 'hurt', { amountMilli: 99999, enemy: true }); v = skillMechanicView(j);
    assert.equal(v.vitals.hpMilli, 0); assert.equal(v.counters.usedBandages, 1);
    j = advance(j, 600000); assert.equal(skillMechanicView(j).vitals.hpMilli, 0);
});

test('auto aid refuses missing bandages, environment hits, zero damage and fatal hits', () => {
    for (const [amountMilli, enemy, stocked] of [[15000, true, false], [15000, false, true], [0, true, true], [50000, true, true]] as const) {
        const s = seed(['survival-auto-aid']); s.vitals.hpMilli = 20000; if (stocked) stock(s, 'bandage', 1);
        const v = skillMechanicView(step(newSkillMechanics(s), 'hurt', { amountMilli, enemy }));
        assert.equal(v.counters.usedBandages, 0); assert.equal(v.vitals.hpMilli, Math.max(0, 20000 - amountMilli));
    }
});

test('salvage requires explicit marking, excludes relief and protected or quest materials, and limits three lossy conversions', () => {
    const s = seed(['search-auto-salvage']); stock(s, 'battery', 4); stock(s, 'battery', 1, true); stock(s, 'wire', 1);
    let j = advance(newSkillMechanics(s), 16000); assert.equal(quantity(j, 'scrap'), 0);
    for (const item of s.bag.items.filter(i => !i.relief && i.id === 'battery')) j = step(j, 'mark-salvage', { uid: item.uid, marked: true });
    assert.throws(() => step(j, 'mark-salvage', { uid: s.bag.items.find(i => i.relief)!.uid, marked: true }));
    assert.throws(() => step(j, 'mark-salvage', { uid: s.bag.items.find(i => i.id === 'wire')!.uid, marked: true }));
    j = advance(j, 600000); const v = skillMechanicView(j);
    assert.equal(quantity(j, 'battery'), 2); assert.equal(quantity(j, 'battery', true), 1); assert.equal(quantity(j, 'scrap', false), 3);
    assert.equal(v.counters.salvaged, 3); assert.ok(3 * D.ITEMS.scrap.sell < 3 * D.ITEMS.battery.sell);
    const protectedSeed = seed(['search-auto-salvage']); stock(protectedSeed, 'battery', 1); protectedSeed.protectedItems = ['battery'];
    assert.throws(() => step(newSkillMechanics(protectedSeed), 'mark-salvage', { uid: protectedSeed.bag.items[0].uid, marked: true }));
});

test('salvage placement failures preserve marked materials and leave no partially generated output', () => {
    const s = seed(['search-auto-salvage']); stock(s, 'battery', 2);
    let serial = 0; assert.equal(D.addItem(s.bag, 'cloth', 280, false, false, true, () => `full-${++serial}`), 0);
    let j = step(newSkillMechanics(s), 'mark-salvage', { uid: s.bag.items[0].uid, marked: true });
    j = advance(j, 600000); assert.deepEqual(skillMechanicView(j).bag, s.bag); assert.equal(skillMechanicView(j).counters.salvaged, 0);
});

test('field scan reports only visible reachable unopened container IDs, spends no charge on empty results, and honors cooldown and run cap', () => {
    const s = seed(['search-field-scan']);
    s.containers = ['known', 'fog', 'far', 'wall', 'open'].map(id => ({ id, revealed: id !== 'fog', inRange: id !== 'far',
        lineOfSight: id !== 'wall', opened: id === 'open' }));
    let j = step(newSkillMechanics(s), 'scan'); assert.deepEqual(skillMechanicView(j).lastScan, ['known']);
    j = step(j, 'scan'); assert.equal(skillMechanicView(j).counters.scans, 1);
    j = advance(j, 29999); j = step(j, 'scan'); assert.equal(skillMechanicView(j).counters.scans, 1);
    j = advance(j, 30000); j = step(j, 'scan'); assert.equal(skillMechanicView(j).counters.scans, 2);
    j = advance(j, 60000); j = step(j, 'scan'); j = advance(j, 90000); j = step(j, 'scan');
    assert.equal(skillMechanicView(j).counters.scans, 3);
    s.containers = []; j = step(newSkillMechanics(s), 'scan'); assert.equal(skillMechanicView(j).counters.scans, 0);
});

test('scan observations cannot introduce nonexistent containers, hide discovered rooms, reopen containers or carry contents', () => {
    const s = seed(['search-field-scan']); s.containers = [{ id: 'box', revealed: false, inRange: true, lineOfSight: true, opened: false }];
    let j = step(newSkillMechanics(s), 'observe', { target: { ...s.containers[0], revealed: true } });
    assert.throws(() => step(j, 'observe', { target: s.containers[0] }));
    assert.throws(() => step(j, 'observe', { target: { ...s.containers[0], id: 'invented' } }));
    assert.throws(() => step(j, 'observe', { target: { ...s.containers[0], contents: ['pearl'] } }));
    j = step(j, 'observe', { target: { ...s.containers[0], revealed: true, opened: true } });
    assert.throws(() => step(j, 'observe', { target: { ...s.containers[0], revealed: true } }));
});

test('shared salvage/press resources are processed chronologically and produce identical results for one frame or 600 frames', () => {
    const s = seed(['combat-field-press', 'survival-regeneration', 'search-auto-salvage']); stock(s, 'battery', 4);
    let start = newSkillMechanics(s);
    for (const item of s.bag.items) start = step(start, 'mark-salvage', { uid: item.uid, marked: true });
    const one = advance(start, 600000), split = structuredClone(start);
    for (let atMs = 1000; atMs <= 600000; atMs += 1000) split.commands.push({ id: `tick-${atMs}`, runId: s.runId, kind: 'advance', atMs,
        paused: false, reloading: false, sprinting: false });
    assert.deepEqual(skillMechanicView(split), skillMechanicView(one));
    assert.equal(skillMechanicView(one).counters.generatedAmmo, 6); assert.equal(skillMechanicView(one).counters.salvaged, 3);
    assert.equal(quantity(one, 'battery') + skillMechanicView(one).counters.salvaged, 4);
    assert.equal(quantity(one, 'scrap') + skillMechanicView(one).counters.usedScrap, 3);
});

test('idempotent retries survive JSON key order and checkpoint roundtrips; changed identities and stale run capabilities are rejected', () => {
    let j = advance(newSkillMechanics(seed(['survival-regeneration'])), 20000);
    const command = j.commands[0], duplicate = planSkillMechanic(decodeSkillMechanics(encodeSkillMechanics(j)),
        JSON.parse(JSON.stringify(command, Object.keys(command).reverse())));
    assert.ok(duplicate.duplicate); assert.deepEqual(duplicate.view, skillMechanicView(j)); assert.equal(duplicate.journal.commands.length, 1);
    assert.throws(() => planSkillMechanic(j, { ...command, atMs: 20001 }));
    assert.throws(() => step(j, 'hostile', { runId: 'old-run' }));
    const before = encodeSkillMechanics(j); const p = planSkillMechanic(j, { id: 'new', kind: 'hostile', runId: j.seed.runId, atMs: 20000 });
    p.view.vitals.hpMilli = 0; p.journal.seed.vitals.hpMilli = 0; assert.equal(encodeSkillMechanics(j), before);
    j = duplicate.journal; assert.equal(encodeSkillMechanics(j), before);
});

test('strict resource checkpoint rejects unknown/coerced fields, UID collisions, overlaps, point debt and clock jumps without mutation', () => {
    const s = seed(['combat-auto-feed']); stock(s, 'ammo9', 10); const valid = newSkillMechanics(s), text = encodeSkillMechanics(valid);
    const corrupt: unknown[] = [null, [], { ...valid, extra: 1 }, { ...valid, version: 2 },
        { ...valid, seed: { ...s, extra: true } }, { ...valid, seed: { ...s, runId: ['run'] } },
        { ...valid, seed: { ...s, vitals: { ...s.vitals, hpMilli: '20000' } } },
        { ...valid, seed: { ...s, equipment: { ...s.equipment, ammoRelief: 1 } } },
        { ...valid, seed: { ...s, equipment: { ...s.equipment, weaponUid: s.bag.items[0].uid } } },
        { ...valid, seed: { ...s, bag: { ...s.bag, items: [...s.bag.items, { ...s.bag.items[0], uid: 'overlap' }] } } }];
    for (const v of corrupt) assert.throws(() => decodeSkillMechanics(JSON.stringify(v)));
    assert.throws(() => step(valid, 'hostile', { atMs: 1000 }));
    assert.throws(() => step(valid, ['hostile'] as never));
    assert.throws(() => advance(valid, 600001)); assert.throws(() => advance(valid, .5));
    assert.throws(() => decodeSkillMechanics(' '.repeat(2000001)));
    assert.throws(() => decodeStoredProfile(valid));
    const first = advance(valid, 1000); const dup = structuredClone(first); dup.commands.push(dup.commands[0]);
    assert.throws(() => decodeSkillMechanics(JSON.stringify(dup)));
    assert.equal(encodeSkillMechanics(valid), text);
});

test('no selected junction means no automatic resource changes even with every eligible material present', () => {
    const s = seed(); stock(s, 'ammo9', 20); stock(s, 'scrap', 5); stock(s, 'battery', 2); stock(s, 'bandage', 2);
    const j = advance(newSkillMechanics(s), 600000), v = skillMechanicView(j);
    assert.deepEqual(v.bag, s.bag); assert.deepEqual(v.equipment, s.equipment); assert.deepEqual(v.vitals, s.vitals);
    assert.ok(Object.values(v.counters).every(n => n === 0));
});

test('automatic healing is bridged as non-training recovery and cannot be laundered into later manual medical XP', () => {
    for (const id of ['survival-regeneration', 'survival-auto-aid'] as const) {
        const s = seed([id]); s.progress.xpMilli.survival = 980000; s.vitals.hpMilli = 30000; stock(s, 'bandage', 2);
        let j = newSkillMechanics(s), xp = beginSkillResearchRaid(newSkillResearch(s.progress), {
            enemies: [{ id: 'enemy', hp: 100, elite: false }], containers: [], regions: [] });
        const record = (id: string, payload: Record<string, unknown>, at: number) => {
            xp = recordSkillResearchEvent(xp, { id, runId: xp.raid!.id, at, ...payload } as never).state;
        };
        j = step(j, 'hurt', { amountMilli: 10000, enemy: true });
        record('injury', { kind: 'hurt', enemy: 'enemy', before: 30, after: 20, maxHp: 100, bleeding: false }, 0);
        j = advance(j, 28000); const recovered = (skillMechanicView(j).vitals.hpMilli - 20000) / 1000;
        assert.equal(recovered, 10);
        record('automatic', { kind: 'heal', actual: recovered, item: 'other', stoppedBleeding: false }, 28);
        assert.equal(skillResearchView(xp).earnedMilli.survival, 1000);
        record('later-medkit', { kind: 'heal', actual: 50, item: 'medkit', stoppedBleeding: false }, 29);
        assert.equal(skillResearchView(xp).earnedMilli.survival, 1000);
    }
});

test('generated item identities are deterministic, skip existing uid collisions and never invoke random allocation', () => {
    const s = seed(['combat-field-press']); stock(s, 'scrap', 5); stock(s, 'cloth', 1);
    s.bag.items[1].uid = 'skill-lab-143-1';
    const random = Math.random; Math.random = () => { throw new Error('mechanics must not consume game randomness'); };
    try {
        const j = advance(newSkillMechanics(s), 600000), first = skillMechanicView(j), second = skillMechanicView(decodeSkillMechanics(encodeSkillMechanics(j)));
        assert.deepEqual(first, second); assert.equal(first.bag.items.find(i => i.id === 'ammo9')!.uid, 'skill-lab-143-2');
        assert.equal(new Set(first.bag.items.map(i => i.uid)).size, first.bag.items.length);
    } finally { Math.random = random; }
});

test('protected ammunition and bandages are excluded from automatic use while explicit manual reload remains available', () => {
    const s = seed(['combat-auto-feed', 'survival-auto-aid']); stock(s, 'ammo9', 12); stock(s, 'bandage', 2);
    s.protectedItems = ['ammo9', 'bandage'];
    let j = advance(newSkillMechanics(s), 20000); assert.equal(skillMechanicView(j).equipment.ammo, 0);
    j = step(j, 'hurt', { amountMilli: 5000, enemy: true });
    assert.equal(skillMechanicView(j).vitals.hpMilli, 15000); assert.equal(quantity(j, 'bandage'), 2);
    j = step(j, 'reload'); assert.equal(skillMechanicView(j).equipment.ammo, 8); assert.equal(quantity(j, 'ammo9'), 4);
});

test('bounded journals accept 4096 commands, refuse overflow and never reset clocks or budgets during decoding', () => {
    const j = newSkillMechanics(seed(['survival-regeneration']));
    for (let n = 0; n < 4096; n++) j.commands.push({ id: `pause-${n}`, runId: j.seed.runId, kind: 'advance', atMs: 0,
        paused: true, reloading: false, sprinting: false });
    assert.deepEqual(skillMechanicView(decodeSkillMechanics(encodeSkillMechanics(j))).vitals, j.seed.vitals);
    assert.throws(() => step(j, 'hostile'));
    j.commands.push({ id: 'overflow', runId: j.seed.runId, kind: 'hostile', atMs: 0 });
    assert.throws(() => decodeSkillMechanics(JSON.stringify(j)));
});

test('108 deterministic mixed loadouts conserve ammo, materials and medical supplies through 12960 commands and strict roundtrips', () => {
    const choices = [[null, 'combat-auto-feed', 'combat-field-press'], [null, 'survival-regeneration', 'survival-auto-aid'],
        [null, 'search-auto-salvage', 'search-field-scan']] as const;
    for (const combat of choices[0]) for (const survival of choices[1]) for (const search of choices[2]) for (let variant = 0; variant < 4; variant++) {
        const s = seed([combat, survival, search].filter((id): id is Exclude<typeof id, null> => id !== null));
        stock(s, 'ammo9', 20); stock(s, 'ammo9', 5, true); stock(s, 'scrap', 5); stock(s, 'battery', 4); stock(s, 'bandage', 3);
        s.vitals.hpMilli = 20000 + variant * 20000;
        const j = newSkillMechanics(s);
        for (const item of s.bag.items.filter(i => i.id === 'battery')) j.commands.push({ id: `mark-${item.uid}`, runId: s.runId, atMs: 0,
            kind: 'mark-salvage', uid: item.uid, marked: true });
        let clock = 0, rng = 143 + variant;
        for (let n = 0; n < 120; n++) {
            rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
            let c: SkillMechanicCommand;
            if (n % 3 === 0) { clock += 10000; c = { id: `event-${n}`, runId: s.runId, atMs: clock, kind: 'advance',
                paused: false, reloading: rng % 11 === 0, sprinting: rng % 7 === 0 }; }
            else if (rng % 5 === 0) c = { id: `event-${n}`, runId: s.runId, atMs: clock, kind: 'hurt', amountMilli: 1000, enemy: true };
            else c = { id: `event-${n}`, runId: s.runId, atMs: clock, kind: rng % 4 === 0 ? 'reload' : rng % 4 === 1 ? 'scan' : 'fire' };
            j.commands.push(c);
        }
        const v = skillMechanicView(j), bag = (id: string, relief = false) => v.bag.items.filter(i => i.id === id && !!i.relief === relief).reduce((n, i) => n + i.qty, 0);
        assert.equal(bag('ammo9') + v.equipment.ammo - v.equipment.ammoRelief + v.counters.fired - v.counters.firedRelief, 20 + v.counters.generatedAmmo);
        assert.equal(bag('ammo9', true) + v.equipment.ammoRelief + v.counters.firedRelief, 5);
        assert.equal(bag('scrap') + v.counters.usedScrap, 5 + v.counters.salvaged);
        assert.equal(bag('battery') + v.counters.salvaged, 4); assert.equal(bag('bandage') + v.counters.usedBandages, 3);
        assert.equal(s.vitals.waterMilli - v.vitals.waterMilli, v.counters.regeneratedMilli);
        assert.equal(s.vitals.satietyMilli - v.vitals.satietyMilli, v.counters.regeneratedMilli);
        assert.ok(v.counters.generatedAmmo <= 6 && v.counters.salvaged <= 3 && v.counters.usedBandages <= 1 && v.counters.regeneratedMilli <= 30000);
        assert.deepEqual(skillMechanicView(decodeSkillMechanics(encodeSkillMechanics(j))), v);
    }
});
