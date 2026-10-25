import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { BulletState } from '../src/checkpoint';
import { createSessionState, SaveSession } from '../src/session';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { wrapCoastRuntime } from '../src/raid-runtime/host';
import { idleFrame } from '../src/input';
import { advanceBaseRecovery } from '../src/base';
import { advanceEffects, advanceRaidBody, enemyDamage, perkEffects, rpgMultipliers, useRpgItemResult } from '../src/rpg';
import { derivedLimits, newExpansion, upgradeToRpg, type BodyState, type ExpansionState } from '../src/expansion-state';
import { resolveLayerShot } from '../src/layer-transition';
import { perkModifiers, PERK_IDS, type PerkId } from '../src/perks';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

// Passive perk effects (#77 CP-T05; docs/CRITICAL-PERK-DESIGN.md section 3): each perk at its application points and
// nowhere else (CP-11), the CP-10 products, the stamina clamp and limit rules (CP-21), and no perk in v2 or classic
// raids (CP-22). Every effect is measured where the game applies it: the rules on a raid body, and the Runtime itself.
const NOW = 1800000000000, MAXED = { strength: 30, constitution: 30, technique: 30 };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const ALL_A = PERK_IDS.filter(id => id.endsWith('-a')), ALL_B = PERK_IDS.filter(id => id.endsWith('-b'));
type Version = 2 | 3;

/**
 * A raid body on the prototype world, every attribute at 30 (each node open) and needs full, with `perks` chosen. A v2
 * state never holds perks; here it carries the list anyway, to show that nothing below v3 reads it.
 */
function raidBody(perks: readonly PerkId[], version: Version = 3): ExpansionState {
    const start = newExpansion(NOW); upgradeToRpg(start, NOW);
    const state = prototypeRaid(D.newSave(), prototypeWorld(), start), raid = state.raid!;
    Object.assign(raid, { version, shockAt: -10, mapEvent: 'none' }); raid.maps.downstairs.bullets = [];
    state.version = version; state.growth.permanent = { ...MAXED }; state.growth.perks = [...perks];
    return state;
}
/** The same body at the station, with no raid. */
function stationBody(perks: readonly PerkId[], version: Version = 3): ExpansionState {
    const state = newExpansion(NOW); upgradeToRpg(state, NOW);
    state.version = version; state.growth.permanent = { ...MAXED }; state.growth.perks = [...perks];
    return state;
}
/** `read` changed by using one `id` on a raid body set to `patch`. */
function used(perks: readonly PerkId[], version: Version, id: string, patch: Partial<BodyState>, read: (s: ExpansionState) => number) {
    const s = raidBody(perks, version); Object.assign(s.body, patch);
    const before = read(s); assert.ok(useRpgItemResult(s, id).ok, id); return read(s) - before;
}
/** `read` changed by `seconds` of a raid on a body set to `patch`. */
function lived(perks: readonly PerkId[], version: Version, patch: Partial<BodyState>, read: (s: ExpansionState) => number, seconds = 1, sprint = false, flooded = false) {
    const s = raidBody(perks, version); Object.assign(s.body, patch);
    const before = read(s); advanceRaidBody(s, seconds, sprint, 0, flooded); return read(s) - before;
}
/** A body after one direct enemy blow of `amount` (enemy-1); `random` is the bleeding roll's draw. */
function struck(perks: readonly PerkId[], version: Version, amount: number, random = .99, patch: Partial<BodyState> = {}) {
    const s = raidBody(perks, version); Object.assign(s.body, patch); enemyDamage(s, amount, 'enemy-1', random); return s;
}

/** Rule-level measures, each on a fresh body. */
const RULES = {
    sprintDrain: (p, v) => -lived(p, v, {}, s => s.body.stamina, 1, true),
    /** The extra drain of sprinting 10 kg over the limit (the limit's own perks moved with it). */
    overweightDrain: (p, v) => {
        const drain = (kg: number) => { const s = raidBody(p, v); advanceRaidBody(s, 1, true, derivedLimits(s).carry + kg, false); return 100 - s.body.stamina; };
        return drain(10) - drain(0);
    },
    recovery: (p, v) => lived(p, v, { stamina: 50 }, s => s.body.stamina),
    stationStamina: (p, v) => { const s = stationBody(p, v); s.body.stamina = 50; advanceBaseRecovery(s, 1); return s.body.stamina - 50; },
    waterStamina: (p, v) => used(p, v, 'water', { stamina: 50 }, s => s.body.stamina),
    foodStamina: (p, v) => used(p, v, 'food', { stamina: 50 }, s => s.body.stamina),
    bandageHp: (p, v) => used(p, v, 'bandage', { hp: 50 }, s => s.body.hp),
    medkitHp: (p, v) => used(p, v, 'medkit', { hp: 50 }, s => s.body.hp),
    foodHp: (p, v) => used(p, v, 'food', { hp: 50 }, s => s.body.hp),
    stationHp: (p, v) => { const s = stationBody(p, v); s.body.hp = 50; advanceBaseRecovery(s, 60); return s.body.hp - 50; },
    /** Constitution training from one bandage after an enemy dealt 30 qualifying damage. */
    healTraining: (p, v) => {
        const s = raidBody(p, v); s.body.hp = 50; s.raid!.training.eligibleDamage['enemy-1'] = 30;
        assert.ok(useRpgItemResult(s, 'bandage').ok); return s.raid!.training.quantity.constitution;
    },
    /** The same after two medkits on 50 qualifying damage: the 50-per-enemy cap. */
    healCap: (p, v) => {
        const s = raidBody(p, v); s.body.hp = 10; s.raid!.training.eligibleDamage['enemy-1'] = 50;
        assert.ok(useRpgItemResult(s, 'medkit').ok && useRpgItemResult(s, 'medkit').ok); return s.raid!.training.quantity.constitution;
    },
    foodSatiety: (p, v) => used(p, v, 'food', { satiety: 40 }, s => s.body.satiety),
    waterWater: (p, v) => used(p, v, 'water', { water: 40 }, s => s.body.water),
    waterPollution: (p, v) => -used(p, v, 'water', { pollution: 50 }, s => s.body.pollution),
    antidote: (p, v) => -used(p, v, 'antidote', { pollution: 80 }, s => s.body.pollution),
    floodPollution: (p, v) => lived(p, v, { pollution: 20 }, s => s.body.pollution, 1, false, true),
    dryPollution: (p, v) => -lived(p, v, { pollution: 20 }, s => s.body.pollution),
    mentalDecay: (p, v) => -lived(p, v, { mental: 80 }, s => s.body.mental, 100),
    bleedDamage: (p, v) => -lived(p, v, { bleeding: true }, s => s.body.hp),
    /** Thirst, hunger and pollution damage together. */
    needsDamage: (p, v) => -lived(p, v, { water: 0, satiety: 0, pollution: 90 }, s => s.body.hp),
    blowDamage: (p, v) => 100 - struck(p, v, 30).body.hp,
    /** An enemy round through the shot resolver (layer-transition), which hands the hit to enemyDamage. */
    roundDamage: (p, v) => {
        const s = raidBody(p, v), raid = s.raid!;
        const round: BulletState = { uid: 'round', x: raid.player.x + 30, y: raid.player.y, rotation: Math.PI, vx: -365, vy: 0, left: 60, damage: 12, enemy: true, owner: 'enemy-1' };
        assert.ok(resolveLayerShot(s, prototypeWorld(), raid.currentMap, round, true)); return 100 - s.body.hp;
    },
    eligibleDamage: (p, v) => struck(p, v, 30).raid!.training.eligibleDamage['enemy-1'],
    /** A blow of 21: at or above 20 it starts pain. */
    painAt21: (p, v) => struck(p, v, 21).body.effects.pain,
    painAt40: (p, v) => struck(p, v, 40).body.effects.pain,
    shock: (p, v) => 80 - struck(p, v, 40, .99, { mental: 80 }).body.mental,
    /** Whether a blow whose bleeding draw is 0.15 starts bleeding (1) or not (0). */
    bleedAt15: (p, v) => Number(struck(p, v, 5, .15).body.bleeding),
} satisfies Record<string, (perks: readonly PerkId[], version: Version) => number>;

const LANE = { x: 208, y: 1104 };
/**
 * A raid deployed after choosing `perks` at the station (every attribute 30): layered (buildings world, expansion and
 * raid v3) or the classic coast checkpoint raid beside the same v3 expansion; `version: 2` turns the layered raid and
 * its expansion into v2 while keeping the perk list. Frozen AI, a pistol with reserve rounds and a bandage, the player
 * on a clear lane facing east. `reset` returns to that start before each measure.
 */
function bench(perks: readonly PerkId[], layered: boolean, version: Version = 3) {
    const state = createSessionState(), data = new Map<string, string>();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }), undefined, () => NOW);
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.enableRpg());
    const ticket = saves.prepareExpansionMutation(d => { d.expansion.growth.permanent = { ...MAXED }; d.expansion.growth.perks = [...perks]; });
    assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    assert.ok(saves.beginRun(42, layered, { legacyEnemies: true })); state.state = 'run';
    const r = new CoastRaidRuntime(state, saves), driver = createRuntimeTestDriver(r, '?test=1');
    assert.equal(r.layered?.raid?.version ?? null, layered ? 3 : null); assert.deepEqual(state.expansion!.growth.perks, perks);
    driver.freezeAI(true); driver.placePlayer(LANE, 0); driver.weapon('pistol');
    const kit = r.snapshot(); assert.equal(D.addItem(kit.loadout.bag, 'ammo9', 40), 0); assert.equal(D.addItem(kit.loadout.bag, 'bandage', 1), 0); r.restore(kit);
    if (version === 2) { const s = r.snapshotExpansion(); s.version = 2; s.raid!.version = 2; r.restoreExpansion(s); }
    const start = layered ? r.snapshotExpansion() : null, classic = layered ? null : r.snapshot();
    const reset = () => {
        if (start) r.restoreExpansion(structuredClone(start)); else r.restore(structuredClone(classic!));
        r.handling = { raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 }; r.inputFrame = idleFrame();
    };
    return { r, driver, services: wrapCoastRuntime(r, state, saves).services, reset };
}
type Bench = ReturnType<typeof bench>;
/** Distance walked east in one 0.1 s step. */
function walk(b: Bench) { const x = b.r.player.x; b.r.inputFrame = { ...idleFrame(), x: 1 }; b.r.step(.1); return b.r.player.x - x; }
/** Scrap in the bag up to at least 37 kg carried: over the 36 kg limit of strength 30, under 40 kg (strength-15-a). */
function loadUp(b: Bench) {
    const c = b.r.snapshot(), stacks = Math.ceil((37 - b.r.carriedWeight()) / (5 * D.ITEMS.scrap.weight));
    for (let i = 0; i < stacks; i++) assert.equal(D.addItem(c.loadout.bag, 'scrap', 5), 0);
    b.r.restore(c);
}
/** The first live enemy, standing 30 px ahead of the player; returns its hp reader. */
function foeAhead(b: Bench) {
    const uid = b.r.enemies.find(e => e.hp > 0)!.uid;
    b.driver.placeEnemy(uid, { x: LANE.x + 30, y: LANE.y });
    return () => b.r.enemies.find(e => e.uid === uid)!.hp;
}
/** Runtime measures: what the raid itself does and publishes. */
const RUNTIME = {
    hp: b => b.r.current().frame.hud.hp,
    stamina: b => b.r.current().frame.hud.stamina,
    hpLimit: b => b.r.current().frame.hud.maxHp,
    staminaLimit: b => b.r.current().frame.hud.maxStamina,
    /** What the raid inventory prints and the Runtime slows by. */
    carryLimit: b => { assert.equal(b.services.carryLimit(), b.r.carryLimit()); return b.services.carryLimit(); },
    bagCells: b => b.r.session.loadout!.bag.w * b.r.session.loadout!.bag.h,
    walk,
    load: b => { loadUp(b); return b.r.carriedWeight(); },
    walkLoaded: b => { loadUp(b); return walk(b); },
    runSprint: b => { const before = b.r.stamina; b.r.inputFrame = { ...idleFrame(), x: 1, sprint: true }; b.r.step(.1); return before - b.r.stamina; },
    runRecovery: b => { b.driver.vitals({ stamina: 50 }); b.r.step(.1); return b.r.stamina - 50; },
    runBlow: b => { const before = b.r.hp; b.driver.hurt(30); return before - b.r.hp; },
    runBandage: b => { b.driver.vitals({ hp: 50 }); assert.ok(b.r.useItem('bandage')); return b.r.hp - 50; },
    knife: b => { const hp = foeAhead(b), before = hp(); b.r.knife = true; assert.ok(b.r.shoot()); return before - hp(); },
    gunDamage: b => { assert.ok(b.r.shoot()); return b.r.bullets.at(-1)!.damage; },
    recoilBloom: b => { assert.ok(b.r.shoot()); return b.r.handling.bloom; },
    recoilDrift: b => { assert.ok(b.r.shoot()); return b.r.handling.drift; },
    recoilSettle: b => { assert.ok(b.r.shoot()); return b.r.handling.settle; },
    fireCooldown: b => { assert.ok(b.r.shoot()); return b.r.fireCooldown; },
    /** The published cone from a calm hip aim and from a full precise aim: inherent cone and body multiplier. */
    cone: b => b.r.current().frame.hud.aim.cone,
    preciseCone: b => { b.r.handling.raise = 1; return b.r.current().frame.hud.aim.cone; },
    reload: b => {
        b.driver.magazine(0); b.r.startReload();
        const ring = b.r.current().frame.player.state.reloading!;
        assert.equal(ring.total, ring.left, 'the reload ring starts from zero'); return b.r.reloadLeft;
    },
} satisfies Record<string, (b: Bench) => number>;

type Name = keyof typeof RULES | keyof typeof RUNTIME;
type Values = Record<Name, number>;
const ruleValues = (perks: readonly PerkId[], version: Version) =>
    Object.fromEntries(Object.entries(RULES).map(([name, read]) => [name, read(perks, version)])) as Record<keyof typeof RULES, number>;
function runtimeValues(b: Bench) {
    return Object.fromEntries(Object.entries(RUNTIME).map(([name, read]) => { b.reset(); return [name, read(b)]; })) as Record<keyof typeof RUNTIME, number>;
}
const measure = (perks: readonly PerkId[]): Values => ({ ...ruleValues(perks, 3), ...runtimeValues(bench(perks, true)) });

/** Walk distance with the scrap load against `limit` kg, the slowdown coefficient scaled by `factor`. */
const slowed = (b: Values, limit: number, factor = 1) => b.walk / Math.max(1, 1 + Math.max(0, b.load - limit) * .045 * factor);
const times = (name: Name, factor: number): Row['applies'] => ({ [name]: (b: Values) => b[name] * factor });
interface Row {
    /** Where the effect applies (spec section 3). */
    at: string;
    /** The measures it changes, each as its expected value from the no-perk values. */
    applies: Partial<Record<Name, (base: Values) => number>>;
    /** Where it must not apply: the spec's own exclusions, measured unchanged (with every other measure). */
    outside: Name[];
}
const CRIT = 'critical sources and the breath charge (CP-T04, CP-T07), no passive effect';
const TABLE: Record<PerkId, Row> = {
    'strength-15-a': { at: 'derivedLimits carry: Runtime limit, inventory readout, overweight', applies: { carryLimit: b => b.carryLimit + 4, walkLoaded: b => slowed(b, b.carryLimit + 4) },
        outside: ['bagCells', 'hpLimit', 'staminaLimit', 'overweightDrain', 'sprintDrain'] },
    'strength-15-b': { at: 'advanceRaidBody sprint drain, overweight extra included', applies: { ...times('sprintDrain', .88), ...times('overweightDrain', .88), ...times('runSprint', .88) },
        outside: ['recovery', 'runRecovery', 'walkLoaded'] },
    'strength-20-a': { at: 'Runtime step: speed / (1 + 0.045 x kg over x 0.70)', applies: { walkLoaded: b => slowed(b, b.carryLimit, .7) },
        outside: ['overweightDrain', 'walk', 'carryLimit'] },
    'strength-20-b': { at: 'derivedLimits stamina: HUD limit, water refills to it', applies: { staminaLimit: b => b.staminaLimit + 20, waterStamina: b => b.waterStamina + 20 },
        outside: ['stamina', 'recovery', 'hpLimit'] },
    'strength-25-a': { at: 'Runtime shoot, knife branch', applies: times('knife', 1.2), outside: ['gunDamage'] },
    'strength-25-b': { at: 'advanceRaidBody natural recovery, inside the 0.25..2 clamp', applies: { ...times('recovery', 1.2), ...times('runRecovery', 1.2) },
        outside: ['foodStamina', 'waterStamina', 'stationStamina', 'sprintDrain'] },
    'strength-30-a': { at: 'derivedLimits carry: Runtime limit, inventory readout, overweight', applies: { carryLimit: b => b.carryLimit + 6, walkLoaded: b => slowed(b, b.carryLimit + 6) },
        outside: ['bagCells', 'hpLimit', 'staminaLimit', 'overweightDrain', 'sprintDrain'] },
    'strength-30-b': { at: 'advanceRaidBody sprint drain, overweight extra included', applies: { ...times('sprintDrain', .82), ...times('overweightDrain', .82), ...times('runSprint', .82) },
        outside: ['recovery', 'runRecovery', 'walkLoaded'] },
    'constitution-15-a': { at: 'derivedLimits hp: HUD limit', applies: { hpLimit: b => b.hpLimit + 20 }, outside: ['hp', 'bandageHp', 'staminaLimit'] },
    'constitution-15-b': { at: 'useRpgItemResult bandage and medkit hp; training counts the actual heal',
        applies: { ...times('bandageHp', 1.2), ...times('medkitHp', 1.2), ...times('runBandage', 1.2), ...times('healTraining', 1.2) },
        outside: ['foodHp', 'stationHp', 'healCap'] },
    'constitution-20-a': { at: 'enemyDamage bleeding roll, 18% to 12.6%', applies: { bleedAt15: () => 0 }, outside: ['bleedDamage', 'blowDamage'] },
    'constitution-20-b': { at: 'useRpgItemResult water restored and satiety restored', applies: { ...times('waterWater', 1.25), ...times('foodSatiety', 1.25) },
        outside: ['foodHp', 'foodStamina', 'waterStamina', 'waterPollution'] },
    'constitution-25-a': { at: 'advanceRaidBody pollution gain in the water', applies: times('floodPollution', .8), outside: ['dryPollution', 'antidote', 'waterPollution'] },
    'constitution-25-b': { at: 'advanceRaidBody mental decay and the enemyDamage shock', applies: { ...times('mentalDecay', .75), ...times('shock', .75) },
        outside: ['painAt40', 'cone'] },
    'constitution-30-a': { at: 'enemyDamage, before pain, the shock and the training record; blows and rounds',
        applies: { ...times('blowDamage', .9), ...times('roundDamage', .9), ...times('runBlow', .9), ...times('eligibleDamage', .9), painAt21: () => 0 },
        outside: ['bleedDamage', 'needsDamage', 'shock'] },
    'constitution-30-b': { at: 'useRpgItemResult bandage and medkit hp; training counts the actual heal',
        applies: { ...times('bandageHp', 1.3), ...times('medkitHp', 1.3), ...times('runBandage', 1.3), ...times('healTraining', 1.3) },
        outside: ['foodHp', 'stationHp', 'healCap'] },
    'technique-15-a': { at: CRIT, applies: {}, outside: ['recoilBloom', 'cone', 'gunDamage'] },
    'technique-15-b': { at: 'Runtime shoot: recoil(aim, h, 0.80), bloom and kick increments', applies: { ...times('recoilBloom', .8), ...times('recoilDrift', .8) },
        outside: ['cone', 'preciseCone', 'recoilSettle', 'fireCooldown', 'gunDamage', 'reload'] },
    'technique-20-a': { at: CRIT, applies: {}, outside: ['gunDamage', 'knife'] },
    'technique-20-b': { at: 'Runtime startReload (reloadTime) and the published reload ring', applies: times('reload', .85), outside: ['fireCooldown', 'recoilBloom'] },
    'technique-25-a': { at: CRIT, applies: {}, outside: ['gunDamage', 'knife'] },
    'technique-25-b': { at: 'Runtime shoot: recoil(aim, h, 0.85), bloom and kick increments', applies: { ...times('recoilBloom', .85), ...times('recoilDrift', .85) },
        outside: ['cone', 'preciseCone', 'recoilSettle', 'fireCooldown', 'gunDamage', 'reload'] },
    'technique-30-a': { at: CRIT, applies: {}, outside: ['gunDamage', 'knife'] },
    'technique-30-b': { at: 'Runtime startReload (reloadTime) and the published reload ring', applies: times('reload', .8), outside: ['fireCooldown', 'recoilBloom'] },
};

test('CP-11: each of the 24 perks changes its own application points by its value, and nothing else', () => {
    const base = measure([]), names = Object.keys(base) as Name[];
    // The scenario the expectations rest on: strength 30 carries 36 kg; the scrap load is over that and under 40 kg.
    assert.deepEqual([base.carryLimit, base.hpLimit, base.staminaLimit, base.hp, base.stamina], [36, 160, 140, 100, 100]);
    assert.ok(base.load > 36 && base.load < 40 && base.walkLoaded < base.walk, `load ${base.load}`);
    assert.deepEqual([base.bandageHp, base.medkitHp, base.knife, base.gunDamage, base.reload, base.bleedAt15], [16, 55, 30, 27, 1.25, 1]);
    for (const id of PERK_IDS) {
        const row = TABLE[id], got = measure([id]);
        for (const name of names) {
            const expected = row.applies[name];
            if (expected) {
                assert.notEqual(got[name], base[name], `${id} must change ${name} (${row.at})`);
                assert.ok(near(got[name], expected(base)), `${id} at ${name}: ${got[name]}, expected ${expected(base)} (${row.at})`);
            } else assert.equal(got[name], base[name], `${id} must leave ${name} exactly as it was`);
        }
        assert.ok(row.outside.length > 0 && row.outside.every(name => names.includes(name) && !(name in row.applies)), `${id}: its scope names unchanged measures`);
    }
});

test('CP-10: two perks of one kind multiply (0.68, 0.68, 1.56, 0.7216) and fixed bonuses add, where they apply', () => {
    const base = measure([]);
    const pairs: [PerkId[], Name[], number][] = [
        [['technique-15-b', 'technique-25-b'], ['recoilBloom', 'recoilDrift'], .68],
        [['technique-20-b', 'technique-30-b'], ['reload'], .68],
        [['constitution-15-b', 'constitution-30-b'], ['bandageHp', 'medkitHp', 'runBandage', 'healTraining'], 1.56],
        [['strength-15-b', 'strength-30-b'], ['sprintDrain', 'overweightDrain', 'runSprint'], .7216],
    ];
    const got = pairs.map(([perks, names, factor]) => {
        const values = measure(perks);
        for (const name of names) assert.ok(near(values[name], base[name] * factor), `${perks} at ${name}: ${values[name]} != ${base[name]} x ${factor}`);
        return values;
    });
    // In the game's own numbers: the pistol reloads in 0.85 s, a bandage heals 24.96 and a medkit 85.8, a sprint costs 17.3184 a second.
    assert.ok(near(got[1].reload, .85) && near(got[2].bandageHp, 24.96) && near(got[2].medkitHp, 85.8) && near(got[3].sprintDrain, 17.3184));
    // Fixed bonuses add, each once: carry +4 +6, stamina +20, hp +20 (one valid build: one side per node).
    const bonuses = measure(['strength-15-a', 'strength-20-b', 'strength-30-a', 'constitution-15-a']);
    assert.deepEqual([bonuses.carryLimit, bonuses.staminaLimit, bonuses.hpLimit, bonuses.hp, bonuses.stamina], [46, 160, 180, 100, 100]);
    assert.equal(bonuses.walkLoaded, base.walk, 'the load over 36 kg walks at full speed under 46 kg');
});

test('CP-21: stamina factors combine before the one 0.25..2 clamp; extreme states never escape it', () => {
    const multipliers = (perks: readonly PerkId[], patch: Partial<BodyState>, effects: Partial<BodyState['effects']> = {}) => {
        const s = raidBody(perks); Object.assign(s.body, patch); Object.assign(s.body.effects, effects); return rpgMultipliers(s);
    };
    const quick: PerkId[] = ['strength-25-b'], sprinter: PerkId[] = ['strength-15-b', 'strength-30-b'];
    // Every need empty, pollution 100 and injection fatigue: 0.18432 of normal, held at the 0.25 floor with or without
    // the perk (x1.2 is still only 0.221).
    const worst = { mental: 0, water: 0, satiety: 0, pollution: 100 }, fatigue = { injectionFatigue: 60 };
    assert.equal(multipliers([], worst, fatigue).recovery, .25); assert.equal(multipliers(quick, worst, fatigue).recovery, .25);
    // At pollution 70 the state gives 0.24576 (floored to 0.25); the perk multiplies the product before the clamp:
    // 0.294912, not 0.25 x 1.2 = 0.3.
    const low = { ...worst, pollution: 70 };
    assert.equal(multipliers([], low, fatigue).recovery, .25); assert.ok(near(multipliers(quick, low, fatigue).recovery, .294912));
    // Energized with needs met: 1.15 and 1.38, inside the bound.
    assert.ok(near(multipliers([], {}, { energized: 600 }).recovery, 1.15) && near(multipliers(quick, {}, { energized: 600 }).recovery, 1.38));
    // The drain stays inside the bounds at its extremes (1.1 hungry, 0.9 energized), so the sprint perks always count in full.
    assert.ok(near(multipliers(sprinter, { satiety: 0 }).drain, 1.1 * .7216) && near(multipliers(sprinter, {}, { energized: 600 }).drain, .9 * .7216));
    for (const perks of [[], quick, sprinter, ALL_A, ALL_B]) for (const patch of [worst, low, {}, { satiety: 0 }]) for (const effects of [{}, fatigue, { energized: 600 }]) {
        const m = multipliers(perks, patch, effects);
        assert.ok(m.recovery >= .25 && m.recovery <= 2 && m.drain >= .25 && m.drain <= 2, JSON.stringify([perks, patch, effects]));
    }
    // In the raid: 15 x 0.25 a second at the floor either way.
    const tick = (perks: readonly PerkId[]) => {
        const s = raidBody(perks); Object.assign(s.body, { ...worst, stamina: 50 }); Object.assign(s.body.effects, fatigue);
        advanceRaidBody(s, 1, false, 0, false); return s.body.stamina;
    };
    assert.equal(tick([]), 53.75); assert.equal(tick(quick), 53.75);
});

test('CP-11: the clotting perk moves the bleeding threshold from 18% to 12.6%; bleeding itself is unchanged', () => {
    for (const [draw, plain, clotting] of [[.1259, true, true], [.1261, true, false], [.1799, true, false], [.1801, false, false]] as const) {
        assert.equal(struck([], 3, 5, draw).body.bleeding, plain, `${draw} without the perk`);
        assert.equal(struck(['constitution-20-a'], 3, 5, draw).body.bleeding, clotting, `${draw} with constitution-20-a`);
    }
    assert.ok(near(.18 * perkEffects(raidBody(['constitution-20-a'])).bleedChance, .126));
});

test('CP-21: a higher limit never refills a resource; a lower one only clips, with no hit, bleeding or training', () => {
    const s = raidBody(['strength-20-b', 'constitution-15-a']), limits = derivedLimits(s);
    assert.deepEqual([limits.hp, limits.stamina], [180, 160]);
    advanceEffects(s, 1); assert.deepEqual([s.body.hp, s.body.stamina], [100, 100], 'the bonuses do not refill');
    // Full to the higher limits, then the bonuses gone (as a base reset would leave them): the next tick only clips.
    Object.assign(s.body, { hp: 180, stamina: 160 }); s.growth.perks = [];
    const training = structuredClone(s.raid!.training), hitTime = s.raid!.hitTime;
    let losses: Record<string, number> = {};
    advanceRaidBody(s, .001, false, 0, false, loss => { losses = loss; });
    assert.deepEqual([s.body.hp, s.body.stamina], [160, 140]);
    assert.deepEqual(losses, { bleed: 0, dehydration: 0, starvation: 0, pollution: 0, 'limit-change': 20 });
    assert.equal(s.body.bleeding, false); assert.equal(s.raid!.hitTime, hitTime); assert.deepEqual(s.raid!.training, training);
});

test('CP-22: no perk changes anything in a v2 raid or a classic raid, even with a perk list beside it', () => {
    // The rules: a v2 body carrying perks reads none of them.
    for (const perks of [ALL_A, ALL_B]) {
        assert.deepEqual(perkEffects(raidBody(perks, 2)), perkModifiers([]));
        assert.deepEqual(derivedLimits(raidBody(perks, 2)), derivedLimits(raidBody([], 2)));
        assert.deepEqual(ruleValues(perks, 2), ruleValues([], 2));
    }
    assert.deepEqual(perkEffects(null), perkModifiers([]), 'a classic raid has no expansion to read');
    // The Runtime: classic coast raids deployed beside a v3 expansion with perks, and layered raids turned v2.
    for (const [layered, version] of [[false, 3], [true, 2]] as const) {
        const none = runtimeValues(bench([], layered, version));
        for (const perks of [ALL_A, ALL_B]) assert.deepEqual(runtimeValues(bench(perks, layered, version)), none, `${layered ? 'v2' : 'classic'} raid`);
        if (!layered) assert.deepEqual([none.hpLimit, none.staminaLimit, none.carryLimit, none.knife, none.reload], [100, 100, 24, 30, 1.25], 'the classic constants');
    }
});
