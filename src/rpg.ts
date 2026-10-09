import * as D from './domain';
import { ATTRIBUTES, derivedLimits, effectiveAttributes, type Attribute, type ExpansionState, type TrainingState } from './expansion-state';
import { separation } from './spatial';
import type { Point } from './world';

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export const shortage = (value: number) => value >= 30 ? 0 : value >= 10 ? (30 - value) / 20 : 1 + (10 - value) / 10;
export const trainingYield = (quantity: number) => quantity <= 1 ? .2 * quantity : quantity <= 3 ? .2 + .1 * (quantity - 1) : Math.min(.45, .4 + .01 * (quantity - 3));
export const trainingEfficiency = (state: ExpansionState) => 1 + Math.min(.2, .05 * state.base.facilities.training);

export function creditTraining(state: ExpansionState, training: Pick<TrainingState, 'quantity' | 'credited'>): void {
    for (const attribute of ATTRIBUTES) {
        const earned = trainingYield(training.quantity[attribute]), delta = Math.max(0, earned - training.credited[attribute]);
        training.credited[attribute] = Math.max(training.credited[attribute], earned);
        addProgress(state, attribute, delta);
    }
}
export function addProgress(state: ExpansionState, attribute: Attribute, quantity: number): void {
    const growth = state.growth;
    if (growth.permanent[attribute] >= 30) { growth.progress[attribute] = 0; return; }
    const total = growth.progress[attribute] + Math.max(0, quantity), points = Math.floor(total + 1e-12);
    growth.permanent[attribute] = Math.min(30, growth.permanent[attribute] + points);
    growth.progress[attribute] = growth.permanent[attribute] === 30 ? 0 : Math.max(0, total - points);
}
export function rewardAttribute(state: ExpansionState, attribute: Attribute, points = 1): void {
    state.growth.permanent[attribute] = Math.min(30, state.growth.permanent[attribute] + points);
    if (state.growth.permanent[attribute] === 30) state.growth.progress[attribute] = 0;
}
export function rpgMultipliers(state: ExpansionState) {
    const body = state.body, attributes = effectiveAttributes(state), pain = body.effects.pain > 0 && body.effects.analgesia === 0;
    const pollution = body.pollution <= 40 ? 1 : body.pollution <= 70 ? 1 - (body.pollution - 40) / 150 : .8 - (body.pollution - 70) / 150;
    return { deterioration: clamp(1 - .01 * (attributes.constitution - 10), .8, 1.09),
        recoil: clamp(1 - .01 * (attributes.technique - 10), .8, 1.09) * (1 + .1 * shortage(body.mental)) * (pain ? 1.15 : 1),
        movement: pain ? .9 : 1,
        recovery: clamp((1 - .1 * shortage(body.mental)) * (1 - .2 * shortage(body.water)) * (1 - .1 * shortage(body.satiety))
            * pollution * (body.effects.energized > 0 ? 1.15 : 1) * (body.effects.injectionFatigue > 0 ? .8 : 1), .25, 2),
        drain: clamp((1 + .05 * shortage(body.satiety)) * (body.effects.energized > 0 ? .9 : 1), .25, 2) };
}
/** Expirations are discrete boundaries; increasing a limit never fills the resource. */
export function advanceEffects(state: ExpansionState, seconds: number): void {
    const effects = state.body.effects;
    let fatigue = Math.max(0, effects.injectionFatigue - seconds);
    const oldFatigue = effects.injectionFatigue;
    for (const key of Object.keys(effects) as (keyof typeof effects)[]) {
        const before = effects[key]; effects[key] = Math.max(0, before - seconds);
        if (ATTRIBUTES.includes(key as Attribute) && before > 0 && effects[key] === 0) fatigue = Math.max(fatigue, 120 - Math.max(0, seconds - before));
    }
    effects.injectionFatigue = fatigue;
    if (oldFatigue === 0 && fatigue > 0) state.body.treatment.injectionFatigue = 0;
    if (!effects.luck) state.body.luckEffect = 0;
    const limits = derivedLimits(state);
    state.body.hp = Math.min(state.body.hp, limits.hp); state.body.stamina = Math.min(state.body.stamina, limits.stamina);
}
export function advanceRaidBody(state: ExpansionState, seconds: number, sprint: boolean, weight: number, flooded: boolean, observeDamage?: (loss: { bleed: number; dehydration: number; starvation: number; pollution: number; 'limit-change': number }) => void): number {
    const body = state.body, limits = derivedLimits(state), m = rpgMultipliers(state), oldStamina = body.stamina;
    body.mental = clamp(body.mental - .015 * m.deterioration * seconds);
    body.water = clamp(body.water - (.04 + (sprint ? .04 : 0)) * m.deterioration * seconds);
    body.satiety = clamp(body.satiety - (.025 + (sprint ? .015 : 0)) * m.deterioration * seconds);
    body.pollution = clamp(body.pollution + (flooded ? (state.raid!.highTide ? 7 : 2.5) * m.deterioration : -.2) * seconds);
    body.stamina = clamp(body.stamina + (sprint ? -(24 + Math.max(0, weight - limits.carry)) * m.drain : 15 * m.recovery) * seconds, 0, limits.stamina);
    if (body.stamina <= 5) body.exhausted = true; if (body.stamina >= 25) body.exhausted = false;
    const beforeDamage = body.hp;
    const loss = observeDamage ? { bleed: seconds * (body.bleeding ? .65 : 0), dehydration: seconds * (body.water === 0 ? .5 : 0), starvation: seconds * (body.satiety === 0 ? .25 : 0), pollution: seconds * (body.pollution > 70 ? (body.pollution - 60) * .06 : 0), 'limit-change': 0 } : null;
    body.hp = Math.max(0, body.hp - seconds * ((body.bleeding ? .65 : 0) + (body.water === 0 ? .5 : 0) + (body.satiety === 0 ? .25 : 0)
        + (body.pollution > 70 ? (body.pollution - 60) * .06 : 0)));
    const spent = sprint ? Math.max(0, oldStamina - body.stamina) : 0;
    const afterDamage = body.hp;
    advanceEffects(state, seconds);
    if (loss) {
        const sum = loss.bleed + loss.dehydration + loss.starvation + loss.pollution;
        const scale = sum ? (beforeDamage - afterDamage) / sum : 0;
        loss.bleed *= scale; loss.dehydration *= scale; loss.starvation *= scale; loss.pollution *= scale;
        loss['limit-change'] = Math.max(0, afterDamage - body.hp);
        observeDamage!(loss);
    }
    return spent;
}
export function recordMotion(state: ExpansionState, before: Point, after: Point, seconds: number, staminaSpent: number, weight: number): void {
    const raid = state.raid!, training = raid.training, motion = training.motion;
    if (separation(before, after) < .01) return;
    if (!motion.anchor) motion.anchor = { x: before.x, y: before.y };
    if (raid.elapsed - motion.windowStarted >= 60) { motion.windowStarted = raid.elapsed; motion.localSeconds = 0; motion.anchor = { x: before.x, y: before.y }; }
    if (separation(motion.anchor, after) > 64) { motion.anchor = { x: after.x, y: after.y }; motion.localSeconds = 0; }
    const valid = Math.min(seconds, Math.max(0, 15 - motion.localSeconds)); motion.localSeconds += valid;
    if (weight >= derivedLimits(state).carry * .75) training.quantity.strength += valid / 180 * trainingEfficiency(state);
    if (seconds > 0) training.quantity.constitution += staminaSpent * valid / seconds / 600 * trainingEfficiency(state);
}
export function enemyDamage(state: ExpansionState, amount: number, enemyUid?: string, random = .99): void {
    const body = state.body, raid = state.raid!, actual = Math.min(body.hp, Math.max(0, amount));
    body.hp -= actual; raid.hitTime = .25;
    if (random < .18) { if (!body.bleeding) body.treatment.bleeding = 0; body.bleeding = true; }
    if (actual >= 20) {
        if (body.effects.pain === 0) body.treatment.pain = 0;
        body.effects.pain = 60;
        if (raid.version === 2 && raid.elapsed - raid.shockAt! >= 10) { body.mental = Math.max(0, body.mental - 4); raid.shockAt = raid.elapsed; }
    }
    if (enemyUid) raid.training.eligibleDamage[enemyUid] = Math.min(50 - (raid.training.healedByEnemy[enemyUid] ?? 0), (raid.training.eligibleDamage[enemyUid] ?? 0) + actual);
}
export function healingTraining(state: ExpansionState, actual: number): void {
    const training = state.raid?.training;
    if (!training) return;
    let left = actual, qualified = 0;
    for (const enemy of Object.keys(training.eligibleDamage).sort()) {
        const amount = Math.min(left, training.eligibleDamage[enemy], 50 - (training.healedByEnemy[enemy] ?? 0));
        training.eligibleDamage[enemy] -= amount; training.healedByEnemy[enemy] = (training.healedByEnemy[enemy] ?? 0) + amount;
        left -= amount; qualified += amount;
    }
    training.quantity.constitution += qualified / 50 * trainingEfficiency(state);
}
export function useRpgItem(state: ExpansionState, id: string): boolean {
    const body = state.body, limits = derivedLimits(state), before = JSON.stringify(body), oldHp = body.hp;
    if (id === 'bandage' || id === 'medkit') { body.hp = Math.min(limits.hp, body.hp + (id === 'bandage' ? 16 : 55)); body.bleeding = false; }
    else if (id === 'water') { body.stamina = limits.stamina; body.pollution = Math.max(0, body.pollution - 12); body.water = Math.min(100, body.water + 40); }
    else if (id === 'food') { body.hp = Math.min(limits.hp, body.hp + 12); body.stamina = Math.min(limits.stamina, body.stamina + 50); body.satiety = Math.min(100, body.satiety + 35); }
    else if (id === 'antidote') body.pollution = Math.max(0, body.pollution - 55);
    else if (id === 'analgesic') body.effects.analgesia = 180;
    else if (id === 'focus') body.effects.focus = 120;
    else if (['strengthDose', 'constitutionDose', 'techniqueDose'].includes(id)) body.effects[id.replace('Dose', '') as Attribute] = 180;
    else if (id === 'luckySachet' || id === 'unluckySachet') { body.effects.luck = 300; body.luckEffect = id === 'luckySachet' ? 1 : -1; }
    else return false;
    if (JSON.stringify(body) === before) return false;
    healingTraining(state, body.hp - oldHp); return true;
}

export function criticalChance(technique: number, closeness: number, direct = 0): number {
    if (![technique, closeness, direct].every(Number.isFinite) || closeness < 0 || closeness > 1) throw new Error('命中参数无效。');
    return clamp(.02 + .0015 * (technique - 10) + .08 * closeness + direct, 0, .25);
}
