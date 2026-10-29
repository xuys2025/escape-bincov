/**
 * Pure local research rules for #143. No clocks, random draws, storage, DOM, Session mutations or legacy migration.
 * Callers own preview/revision tokens and must atomically commit returned plans with currency/items/world changes.
 * This component's version 1 is NOT an ExpansionState or SessionRecord version and is not accepted by those codecs.
 */
import { SKILLS, SKILL_BRANCHES, skillDefinition, type SkillBranch, type SkillId } from './skill-tree-catalog';

const SCALE = 1000, MAX_LEVEL = 15, MAX_XP = 3300 * SCALE;
export interface SkillProgress {
    version: 1;
    /** Thousandths of an XP. Levels/available points are derived; never persist a second point balance. */
    xpMilli: Record<SkillBranch, number>;
    /** Catalog order, positive ranks only. Unknown IDs, duplicates and zero-rank entries are invalid. */
    ranks: { id: SkillId; rank: number }[];
}
type Location = 'base' | 'raid' | 'settlement';
type Refusal = 'location' | 'unknown' | 'points' | 'rank' | 'tier' | 'exclusive' | 'empty' | 'funds' | 'book' | 'maximum';
export type SkillPlan<T = object> = { ok: true; progress: SkillProgress } & T | { ok: false; reason: Refusal };
function bad(): never { throw new Error('Invalid skill research progress.'); }
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const integer = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
const branchKnown = (b: unknown): b is SkillBranch => typeof b === 'string' && (SKILL_BRANCHES as readonly string[]).includes(b);
const rankOf = (p: SkillProgress, id: SkillId) => p.ranks.find(s => s.id === id)?.rank ?? 0;
const invested = (p: SkillProgress, branch: SkillBranch, beforeTier = Infinity) => p.ranks.reduce((sum, s) => {
    const d = skillDefinition(s.id)!; return sum + (d.branch === branch && d.tier < beforeTier ? s.rank * d.cost : 0);
}, 0);
function levelOf(milli: number) {
    let level = 0, remainder = milli;
    while (level < MAX_LEVEL && remainder >= (80 + 20 * level) * SCALE) { remainder -= (80 + 20 * level) * SCALE; level++; }
    return { level, remainder, required: level === MAX_LEVEL ? 0 : (80 + 20 * level) * SCALE };
}
export const newSkillProgress = (): SkillProgress => ({ version: 1, xpMilli: { combat: 0, survival: 0, search: 0 }, ranks: [] });
/** Reject rather than normalize: normalization can silently erase a player's selected skill. */
export function assertSkillProgress(value: unknown): asserts value is SkillProgress {
    if (!exact(value, ['version', 'xpMilli', 'ranks']) || value.version !== 1) bad();
    const xp = value.xpMilli;
    if (!exact(xp, SKILL_BRANCHES) || SKILL_BRANCHES.some(b => !integer(xp[b], 0, MAX_XP))
        || !Array.isArray(value.ranks) || value.ranks.length > SKILLS.length) bad();
    let previous = -1;
    for (const item of value.ranks) {
        if (!exact(item, ['id', 'rank'])) bad();
        const d = skillDefinition(item.id), index = SKILLS.findIndex(s => s.id === item.id);
        if (!d || index <= previous || !integer(item.rank, 1, d.max)) bad();
        previous = index;
    }
    const p = value as unknown as SkillProgress;
    for (const b of SKILL_BRANCHES) {
        if (invested(p, b) > levelOf(p.xpMilli[b]).level) bad();
        for (const group of ['specialization', 'junction']) {
            if (p.ranks.filter(s => { const d = skillDefinition(s.id)!; return d.branch === b && d.exclusive === group; }).length > 1) bad();
        }
    }
    for (const s of p.ranks) { const d = skillDefinition(s.id)!; if (invested(p, d.branch, d.tier) < d.tier) bad(); }
}
export function skillBoard(p: SkillProgress) {
    assertSkillProgress(p);
    const branches = Object.fromEntries(SKILL_BRANCHES.map(b => {
        const l = levelOf(p.xpMilli[b]), spent = invested(p, b);
        return [b, { level: l.level, xp: l.remainder / SCALE, required: l.required / SCALE, spent, available: l.level - spent }];
    })) as Record<SkillBranch, { level: number; xp: number; required: number; spent: number; available: number }>;
    return { characterLevel: 1 + SKILL_BRANCHES.reduce((n, b) => n + branches[b].level, 0), branches };
}
/** The event ledger credits the delta of cumulative milli-XP, never independently rounds each damage substep. */
export function creditSkillMilliXp(p: SkillProgress, branch: SkillBranch, quantity: number): SkillProgress {
    assertSkillProgress(p); if (!branchKnown(branch) || !integer(quantity, 0, MAX_XP)) bad();
    const next = structuredClone(p); next.xpMilli[branch] = Math.min(MAX_XP, next.xpMilli[branch] + quantity); return next;
}
export function planLearnSkill(p: SkillProgress, id: string, location: Location): SkillPlan {
    assertSkillProgress(p);
    if (location !== 'base') return { ok: false, reason: 'location' };
    const d = skillDefinition(id); if (!d) return { ok: false, reason: 'unknown' };
    const current = rankOf(p, d.id);
    if (current >= d.max) return { ok: false, reason: 'rank' };
    if (invested(p, d.branch, d.tier) < d.tier) return { ok: false, reason: 'tier' };
    if (d.exclusive && p.ranks.some(s => { const other = skillDefinition(s.id)!; return other.branch === d.branch && other.exclusive === d.exclusive && s.id !== d.id; })) return { ok: false, reason: 'exclusive' };
    if (skillBoard(p).branches[d.branch].available < d.cost) return { ok: false, reason: 'points' };
    const next = structuredClone(p); next.ranks = next.ranks.filter(s => s.id !== d.id); next.ranks.push({ id: d.id, rank: current + 1 });
    next.ranks.sort((a, b) => SKILLS.findIndex(s => s.id === a.id) - SKILLS.findIndex(s => s.id === b.id));
    assertSkillProgress(next); return { ok: true, progress: next };
}
/** A training manual consumes one actual item in its owner's eventual transaction, and is unusable at the cap. */
export function planReadSkillManual(p: SkillProgress, branch: SkillBranch, count: number, location: Location): SkillPlan<{ consumed: 1 }> {
    assertSkillProgress(p); if (!branchKnown(branch) || !integer(count, 0, 1e9)) bad();
    if (location !== 'base') return { ok: false, reason: 'location' };
    if (count < 1) return { ok: false, reason: 'book' };
    if (p.xpMilli[branch] === MAX_XP) return { ok: false, reason: 'maximum' };
    return { ok: true, progress: creditSkillMilliXp(p, branch, 100 * SCALE), consumed: 1 };
}
export function planSkillRespec(p: SkillProgress, branch: SkillBranch, payment: { cash: number; manuals: number; useManual: boolean }, location: Location): SkillPlan<{ cashCost: number; consumed: number }> {
    assertSkillProgress(p);
    if (!branchKnown(branch) || !integer(payment.cash, 0, 1e9) || !integer(payment.manuals, 0, 1e9) || typeof payment.useManual !== 'boolean') bad();
    if (location !== 'base') return { ok: false, reason: 'location' };
    if (!invested(p, branch)) return { ok: false, reason: 'empty' };
    if (payment.useManual ? payment.manuals < 1 : payment.cash < 500) return { ok: false, reason: payment.useManual ? 'book' : 'funds' };
    const next = structuredClone(p); next.ranks = next.ranks.filter(s => skillDefinition(s.id)!.branch !== branch);
    return { ok: true, progress: next, cashCost: payment.useManual ? 0 : 500, consumed: payment.useManual ? 1 : 0 };
}
/** Standalone research envelope only. It must not be injected as an optional field into the current live save. */
export function encodeSkillProgress(p: SkillProgress): string { assertSkillProgress(p); return JSON.stringify(p); }
export function decodeSkillProgress(text: string): SkillProgress {
    if (typeof text !== 'string' || text.length > 16000) bad();
    const parsed: unknown = JSON.parse(text); assertSkillProgress(parsed); return structuredClone(parsed);
}

export interface SkillEffectContext {
    /** All time values use the same global action clock in seconds. The future Runtime owns these facts/timers. */
    at: number; lastKillAt: number | null; breachUntil: number | null; lastHostileAt: number;
    ambushReadyAt: number; aiming: boolean; emergencyUntil: number | null; respiteUntil: number | null;
    /** Optional owner observations; absence is neutral so old research callers retain their original results. */
    selfHpRatio?: number; targetHpRatio?: number | null; carryRatio?: number; sprinting?: boolean;
}
export interface SkillEffects {
    recoil: number; reload: number; aimTime: number; knifeDamage: number; burstBloom: number; sprintCost: number;
    heal: number; needsLoss: number; bleedChance: number; pollutionGain: number; mentalLoss: number;
    carryKg: number; noticeRadius: number; materialTags: number; overweight: number; stepNoise: number;
    scrapChance: number; guaranteedFind: boolean; materialWeight: number; staminaRecovery: number;
    /** Independent critical source for a new shot; never directly add it to an already combined probability. */
    ambushCrit: number;
    /** Add this fraction of the item's BASE heal, separately from the normal multiplier; medkits only. */
    emergencyBaseHeal: number;
    recoilRecovery: number; hipfireBloom: number; weaponSwitch: number; hitFlinch: number; executeDamage: number; aimingMoveBloom: number;
    staminaBonus: number; supplyAbsorption: number; painDuration: number; bleedDamage: number; lowHealthDamage: number;
    searchOriginCap: number; medicineWeight: number; overweightStamina: number; memorySeconds: number; detectionRadius: number;
    autoFeedRounds: number; pressRounds: number; regenerationHp: number; autoAidHp: number; salvageYield: number; scanCharges: number;
}
function assertContext(context: SkillEffectContext): void {
    if (!context || typeof context !== 'object') bad();
    const mandatory = [context.at, context.lastHostileAt, context.ambushReadyAt];
    const timers = [context.lastKillAt, context.breachUntil, context.emergencyUntil, context.respiteUntil];
    if (mandatory.some(t => typeof t !== 'number' || !Number.isFinite(t) || t < 0)
        || timers.some(t => t !== null && (typeof t !== 'number' || !Number.isFinite(t) || t < 0)) || context.lastHostileAt > context.at
        || context.lastKillAt !== null && context.lastKillAt > context.at || typeof context.aiming !== 'boolean') bad();
    for (const key of ['selfHpRatio', 'targetHpRatio', 'carryRatio'] as const) {
        if (!Object.hasOwn(context, key)) continue;
        const v = context[key]; if (key === 'targetHpRatio' && v === null) continue;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > (key === 'carryRatio' ? 1e6 : 1)) bad();
    }
    if (Object.hasOwn(context, 'sprinting') && typeof context.sprinting !== 'boolean') bad();
}
/** Validate/detach one deployment selection once. The returned evaluator owns only numeric benefits, never p. */
export function compileSkillEffects(p: SkillProgress): (context: SkillEffectContext) => SkillEffects {
    assertSkillProgress(p);
    const benefits = new Map(p.ranks.map(s => [s.id, s.rank * skillDefinition(s.id)!.perRank]));
    const n = (id: SkillId) => benefits.get(id) ?? 0;
    const stable = { recoil: 1 - n('combat-grip'),
        aimTime: 1 - n('combat-aim'), knifeDamage: 1 + n('combat-melee'), burstBloom: 1 - n('combat-burst'),
        heal: 1 + n('survival-heal'), needsLoss: 1 - n('survival-needs'),
        bleedChance: 1 - n('survival-clot'), pollutionGain: 1 - n('survival-environment'), mentalLoss: 1 - n('survival-calm'),
        carryKg: n('search-carry'), noticeRadius: 1 + n('search-notice'), materialTags: n('search-tags'),
        overweight: 1 - n('search-step'), stepNoise: 1 - n('search-quiet'), scrapChance: n('search-scrap'),
        guaranteedFind: n('search-finds') > 0, materialWeight: 1 - n('search-pack'),
        recoilRecovery: 1 + n('combat-recovery'), weaponSwitch: 1 - n('combat-switch'), hitFlinch: 1 - n('combat-flinch'),
        staminaBonus: n('survival-stamina'), supplyAbsorption: 1 + n('survival-metabolism'), painDuration: 1 - n('survival-pain'),
        bleedDamage: 1 - n('survival-coagulation'), searchOriginCap: 5 + n('search-container-limit'), medicineWeight: 1 - n('search-light-meds'),
        overweightStamina: 1 - n('search-overweight-stamina'), memorySeconds: n('search-memory'),
        autoFeedRounds: n('combat-auto-feed'), pressRounds: n('combat-field-press'), regenerationHp: n('survival-regeneration'),
        autoAidHp: n('survival-auto-aid'), salvageYield: n('search-auto-salvage'), scanCharges: n('search-field-scan') };
    return context => {
        assertContext(context);
        const active = (until: number | null) => until !== null && context.at < until;
        const moving = context.lastKillAt !== null && context.at - context.lastKillAt < 4 ? n('combat-move') : 0;
        const self = context.selfHpRatio ?? 1, target = context.targetHpRatio ?? null;
        return { ...stable, reload: (1 - n('combat-reload')) * (active(context.breachUntil) ? 1 - n('combat-break') : 1),
            sprintCost: (1 - n('survival-breath')) * (1 - moving),
            staminaRecovery: (1 + n('survival-recovery')) * (1 + (active(context.respiteUntil) ? n('survival-respite') : 0))
                * (1 + ((context.carryRatio ?? 1) <= .75 ? n('search-route-efficiency') : 0)),
            ambushCrit: context.aiming && context.at - context.lastHostileAt >= 6 && context.at >= context.ambushReadyAt ? n('combat-ambush') : 0,
            emergencyBaseHeal: active(context.emergencyUntil) ? n('survival-emergency') : 0,
            hipfireBloom: context.aiming ? 1 : 1 - n('combat-hipfire'), aimingMoveBloom: context.aiming ? 1 - n('combat-steady-step') : 1,
            executeDamage: 1 + (target !== null && target > 0 && target <= .25 ? n('combat-execute') : 0),
            lowHealthDamage: 1 - (self > 0 && self <= .35 ? n('survival-grit') : 0),
            detectionRadius: !context.sprinting && context.at - context.lastHostileAt >= 6 ? 1 - n('search-scout') : 1 };
    };
}
/** Pure preview; consumes no RNG, timers, ammunition or items and grants no resources on level-up. */
export const skillEffects = (p: SkillProgress, context: SkillEffectContext): SkillEffects => compileSkillEffects(p)(context);
