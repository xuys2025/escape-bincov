/**
 * Isolated #143 research journal, not a second production save service. A replay derives all XP and trigger state
 * from a frozen deployment snapshot and owner-observed events. No event changes the real world or live save.
 * Journal replay is deliberately bounded/auditable; benchmark and replace it with validated checkpoint counters
 * before wiring automatic weapons to production. World IDs/provenance must come from the transaction owner.
 */
import type { SkillBranch } from './skill-tree-catalog';
import { assertSkillProgress, compileSkillEffects, creditSkillMilliXp, newSkillProgress, skillEffects, type SkillEffectContext, type SkillProgress } from './skill-tree';

interface Manifest {
    enemies: { id: string; hp: number; elite: boolean }[];
    containers: { id: string; crate: boolean; origins: string[] }[];
    regions: string[];
}
interface EventBase { id: string; runId: string; at: number }
export type SkillResearchEvent = EventBase & (
    { kind: 'damage'; enemy: string; before: number; after: number; player: boolean }
    | { kind: 'hurt'; enemy: string | null; before: number; after: number; maxHp: number; bleeding: boolean }
    | { kind: 'heal'; actual: number; stoppedBleeding: boolean; item: 'medkit' | 'bandage' | 'other' }
    | { kind: 'activity'; from: number; to: number; progressing: boolean; paused: boolean }
    | { kind: 'container'; container: string }
    | { kind: 'take'; container: string; origin: string; source: 'world' | 'player' }
    | { kind: 'region'; region: string }
    | { kind: 'shot'; aimed: boolean }
    | { kind: 'reload' } | { kind: 'hostile' });
interface ResearchRaid { id: string; snapshot: SkillProgress; manifest: Manifest; events: SkillResearchEvent[] }
export interface SkillResearchState {
    kind: 'bincov-skills-research'; version: 1; sequence: number; progress: SkillProgress; raid: ResearchRaid | null;
}
function fail(): never { throw new Error('Invalid skill research checkpoint.'); }
const exact = (v: unknown, fields: readonly string[]): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).length === fields.length && fields.every(f => Object.hasOwn(v, f));
const number = (n: unknown, max = 1e6): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
const id = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-][a-zA-Z0-9_./:-]{0,159}$/.test(s);
const MAX_EVENTS = 8192, MAX_TEXT = 4000000;
const EVENT_FIELDS = {
    damage: ['enemy', 'before', 'after', 'player'], hurt: ['enemy', 'before', 'after', 'maxHp', 'bleeding'],
    heal: ['actual', 'stoppedBleeding', 'item'], activity: ['from', 'to', 'progressing', 'paused'],
    container: ['container'], take: ['container', 'origin', 'source'], region: ['region'], shot: ['aimed'], reload: [], hostile: [],
} as const;
function checkManifest(v: unknown): asserts v is Manifest {
    if (!exact(v, ['enemies', 'containers', 'regions']) || !Array.isArray(v.enemies) || !Array.isArray(v.containers)
        || !Array.isArray(v.regions) || v.enemies.length > 1024 || v.containers.length > 2048 || v.regions.length > 2048) fail();
    const enemies = new Set<string>(), containers = new Set<string>(), origins = new Set<string>(), regions = new Set<string>();
    for (const e of v.enemies) {
        if (!exact(e, ['id', 'hp', 'elite']) || !id(e.id) || !number(e.hp) || typeof e.elite !== 'boolean' || enemies.has(e.id)) fail();
        enemies.add(e.id);
    }
    for (const c of v.containers) {
        if (!exact(c, ['id', 'crate', 'origins']) || !id(c.id) || typeof c.crate !== 'boolean' || !Array.isArray(c.origins)
            || c.origins.length > 1000 || containers.has(c.id)) fail();
        containers.add(c.id);
        for (const origin of c.origins) { if (!id(origin) || origins.has(origin) || origins.size >= 10000) fail(); origins.add(origin); }
    }
    for (const r of v.regions) { if (!id(r) || regions.has(r)) fail(); regions.add(r); }
}
function checkEvent(v: unknown): asserts v is SkillResearchEvent {
    if (!v || typeof v !== 'object' || !Object.hasOwn(v, 'kind')) fail();
    const e = v as SkillResearchEvent;
    if (typeof e.kind !== 'string' || !Object.hasOwn(EVENT_FIELDS, e.kind) || !exact(v, ['id', 'runId', 'at', 'kind', ...EVENT_FIELDS[e.kind]])
        || !id(e.id) || !id(e.runId) || !number(e.at, 600)) fail();
    switch (e.kind) {
        case 'damage': if (!id(e.enemy) || !number(e.before) || !number(e.after) || e.after > e.before || typeof e.player !== 'boolean') fail(); break;
        case 'hurt': if (e.enemy !== null && !id(e.enemy) || !number(e.before) || !number(e.after) || !number(e.maxHp)
            || e.maxHp === 0 || e.before > e.maxHp || e.after > e.before || typeof e.bleeding !== 'boolean') fail(); break;
        case 'heal': if (!number(e.actual) || typeof e.stoppedBleeding !== 'boolean' || !['medkit', 'bandage', 'other'].includes(e.item)) fail(); break;
        case 'activity': if (!number(e.from, 600) || !number(e.to, 600) || e.from > e.to || e.to !== e.at
            || typeof e.progressing !== 'boolean' || typeof e.paused !== 'boolean') fail(); break;
        case 'container': if (!id(e.container)) fail(); break;
        case 'take': if (!id(e.container) || !id(e.origin) || !['world', 'player'].includes(e.source)) fail(); break;
        case 'region': if (!id(e.region)) fail(); break;
        case 'shot': if (typeof e.aimed !== 'boolean') fail(); break;
        case 'reload': case 'hostile': break;
    }
}
const signature = (e: SkillResearchEvent) => JSON.stringify(Object.entries(e).sort(([a], [b]) => a.localeCompare(b)));
const blankContext = (): SkillEffectContext => ({ at: 0, lastKillAt: null, breachUntil: null, lastHostileAt: 0,
    ambushReadyAt: 0, aiming: false, emergencyUntil: null, respiteUntil: null });
/** Deterministic research roll only; production must decide how this joins its existing RNG/transaction contract. */
function roll(run: string, container: string) {
    let h = 2166136261;
    for (const c of run + '/' + container) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 0x100000000;
}
function replay(raid: ResearchRaid) {
    const context = blankContext(), seen = new Set<string>(), effectAt = compileSkillEffects(raid.snapshot);
    const originCap = effectAt(context).searchOriginCap;
    const hp = new Map(raid.manifest.enemies.map(e => [e.id, e.hp]));
    const medical = new Map<string, { damage: number; healed: number }>();
    const opened = new Set<string>(), taken = new Set<string>(), visited = new Set<string>(), perContainer = new Map<string, number>();
    const bonuses: { container: string; scrap: number; ordinary: number }[] = [];
    const triggers: { event: string; ambushCrit: number; reload: number; emergencyBaseHeal: number }[] = [];
    let damage = 0, killXp = 0, injury = 0, healing = 0, clots = 0, active = 0, activityUntil = 0, crates = 0;
    let bleeding = false, emergencyTriggered = false, respiteReady = 0;
    for (const e of raid.events) {
        checkEvent(e);
        if (e.runId !== raid.id || e.at < context.at || seen.has(e.id)) fail();
        // Pause is a marker on the stopped action clock, not elapsed wall time that expires skill windows.
        if (e.kind === 'activity' && e.paused && (e.from !== context.at || e.to !== context.at)) fail();
        seen.add(e.id); context.at = e.at;
        const before = effectAt({ ...context, aiming: e.kind === 'shot' && e.aimed });
        switch (e.kind) {
            case 'damage': {
                // Both numbers are the owner's stored HP, not independently recomputed approximations.
                // An epsilon comparison admits positive HP on a dead enemy and can award another kill.
                const known = hp.get(e.enemy); if (known === undefined || e.before !== known) fail();
                hp.set(e.enemy, e.after);
                if (e.player && e.before > 0 && e.after < e.before) {
                    damage += e.before - e.after; context.lastHostileAt = e.at;
                    if (e.after === 0) {
                        killXp += raid.manifest.enemies.find(enemy => enemy.id === e.enemy)!.elite ? 40 : 20;
                        context.lastKillAt = e.at; context.breachUntil = e.at + 5;
                    }
                }
                break;
            }
            case 'hurt': {
                if (e.enemy !== null && !hp.has(e.enemy)) fail();
                if (e.enemy !== null && e.before > e.after) {
                    context.lastHostileAt = e.at;
                    const record = medical.get(e.enemy) ?? { damage: 0, healed: 0 };
                    const eligible = Math.min(50 - record.damage, e.before - e.after);
                    record.damage += eligible; injury += eligible; medical.set(e.enemy, record);
                    if (e.bleeding) bleeding = true;
                    if (!emergencyTriggered && e.after > 0 && e.after <= e.maxHp * .25) { emergencyTriggered = true; context.emergencyUntil = e.at + 15; }
                }
                break;
            }
            case 'heal': {
                const isMedical = e.item !== 'other'; let remaining = e.actual;
                for (const [, record] of [...medical].sort(([a], [b]) => a.localeCompare(b))) {
                    const used = Math.min(remaining, record.damage - record.healed); record.healed += used; remaining -= used;
                    if (isMedical) healing += used;
                }
                const stopped = bleeding && e.stoppedBleeding;
                if (e.stoppedBleeding) bleeding = false;
                if (isMedical && stopped) clots++;
                if (isMedical && (e.actual > 0 || stopped)) {
                    if (e.at >= respiteReady) { context.respiteUntil = e.at + 8; respiteReady = e.at + 30; }
                    if (e.item === 'medkit') { triggers.push({ event: e.id, ambushCrit: 0, reload: 1, emergencyBaseHeal: before.emergencyBaseHeal }); context.emergencyUntil = null; }
                }
                break;
            }
            case 'activity':
                if (e.from < activityUntil) fail();
                activityUntil = e.to; if (e.progressing && !e.paused) active += e.to - e.from; break;
            case 'container': {
                const container = raid.manifest.containers.find(c => c.id === e.container); if (!container) fail();
                if (!opened.has(e.container)) {
                    opened.add(e.container);
                    if (container.crate) {
                        crates++;
                        const scrap = crates <= 3 && roll(raid.id, e.container) < before.scrapChance ? 1 : 0;
                        const ordinary = crates === 1 && before.guaranteedFind ? 1 : 0;
                        if (scrap || ordinary) bonuses.push({ container: e.container, scrap, ordinary });
                    }
                }
                break;
            }
            case 'take': {
                const container = raid.manifest.containers.find(c => c.id === e.container);
                if (!container || !container.origins.includes(e.origin)) fail();
                if (e.source === 'world' && !taken.has(e.origin)) {
                    taken.add(e.origin); const count = perContainer.get(e.container) ?? 0;
                    perContainer.set(e.container, count + 1);
                }
                break;
            }
            case 'region':
                if (!raid.manifest.regions.includes(e.region)) fail(); visited.add(e.region); break;
            case 'shot':
                triggers.push({ event: e.id, ambushCrit: before.ambushCrit, reload: 1, emergencyBaseHeal: 0 });
                if (before.ambushCrit > 0) context.ambushReadyAt = e.at + 20;
                context.lastHostileAt = e.at; break;
            case 'reload':
                triggers.push({ event: e.id, ambushCrit: 0, reload: before.reload, emergencyBaseHeal: 0 }); context.breachUntil = null; break;
            case 'hostile': context.lastHostileAt = e.at; break;
        }
    }
    const milli = (value: number) => Math.min(3300000, Math.floor(value + 1e-8));
    const earned: Record<SkillBranch, number> = {
        combat: milli(damage * 100 + killXp * 1000),
        survival: milli(Math.min(40000, (injury + 2 * healing) * 100 + clots * 5000) + active * 10000 / 60),
        search: milli(opened.size * 10000 + [...perContainer.values()].reduce((n, count) => n + Math.min(originCap, count), 0) * 3000 + visited.size * 10000),
    };
    let progress = structuredClone(raid.snapshot);
    for (const branch of ['combat', 'survival', 'search'] as const) progress = creditSkillMilliXp(progress, branch, earned[branch]);
    return { progress, context, bonuses, triggers, earned };
}
function inspect(value: unknown): asserts value is SkillResearchState {
    if (!exact(value, ['kind', 'version', 'sequence', 'progress', 'raid']) || value.kind !== 'bincov-skills-research' || value.version !== 1
        || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || value.sequence > 1e9) fail();
    assertSkillProgress(value.progress);
    if (value.raid !== null) {
        if (!exact(value.raid, ['id', 'snapshot', 'manifest', 'events']) || value.sequence === 0 || value.raid.id !== `research-${value.sequence}`
            || !Array.isArray(value.raid.events) || value.raid.events.length > MAX_EVENTS) fail();
        assertSkillProgress(value.raid.snapshot); checkManifest(value.raid.manifest);
        // The envelope/snapshot/manifest above are checked; replay validates every individual event before use.
        const result = replay(value.raid as unknown as ResearchRaid);
        const actual = value.progress as SkillProgress, expected = result.progress;
        if (actual.ranks.length !== expected.ranks.length || actual.ranks.some((s, i) => s.id !== expected.ranks[i].id || s.rank !== expected.ranks[i].rank)
            || actual.xpMilli.combat !== expected.xpMilli.combat || actual.xpMilli.survival !== expected.xpMilli.survival
            || actual.xpMilli.search !== expected.xpMilli.search) fail();
    }
}
export const newSkillResearch = (progress: SkillProgress = newSkillProgress()): SkillResearchState => {
    assertSkillProgress(progress); return { kind: 'bincov-skills-research', version: 1, sequence: 0, progress: structuredClone(progress), raid: null };
};
/** Manifest must be captured from authoritative world records at deployment, not from arbitrary UI requests. */
export function beginSkillResearchRaid(state: SkillResearchState, manifest: Manifest): SkillResearchState {
    inspect(state); checkManifest(manifest); if (state.raid || state.sequence === 1e9) fail();
    const next = structuredClone(state); next.sequence++;
    next.raid = { id: `research-${next.sequence}`, snapshot: structuredClone(next.progress), manifest: structuredClone(manifest), events: [] };
    return next;
}
/** Duplicate delivery is harmless only when its complete payload agrees. Reused IDs with changed facts are errors. */
export function recordSkillResearchEvent(state: SkillResearchState, event: SkillResearchEvent): { state: SkillResearchState; duplicate: boolean } {
    inspect(state); checkEvent(event); if (!state.raid || event.runId !== state.raid.id) fail();
    const existing = state.raid.events.find(e => e.id === event.id);
    if (existing) { if (signature(existing) !== signature(event)) fail(); return { state: structuredClone(state), duplicate: true }; }
    if (state.raid.events.length === MAX_EVENTS) fail();
    const next = structuredClone(state); next.raid!.events.push(structuredClone(event)); next.progress = replay(next.raid!).progress;
    // Refuse before publishing a candidate that its own checkpoint codec cannot save/reopen.
    if (JSON.stringify(next).length > MAX_TEXT) fail();
    return { state: next, duplicate: false };
}
/** Ending an action does not erase earned XP; old-run events are no longer accepted. */
export function endSkillResearchRaid(state: SkillResearchState): SkillResearchState {
    inspect(state); if (!state.raid) fail(); const next = structuredClone(state); next.raid = null; return next;
}
export function skillResearchView(state: SkillResearchState, aiming = false) {
    inspect(state); if (typeof aiming !== 'boolean') fail();
    const result = state.raid ? replay(state.raid) : { context: blankContext(), bonuses: [], triggers: [], earned: { combat: 0, survival: 0, search: 0 } };
    return { effects: skillEffects(state.raid?.snapshot ?? state.progress, { ...result.context, aiming }), bonuses: structuredClone(result.bonuses),
        triggers: structuredClone(result.triggers), earnedMilli: { ...result.earned } };
}
/** Strict lab checkpoint. Does not read, write, migrate or replace escape-bincov.session.v2. */
export function encodeSkillResearch(state: SkillResearchState): string { inspect(state); const text = JSON.stringify(state); if (text.length > MAX_TEXT) fail(); return text; }
export function decodeSkillResearch(text: string): SkillResearchState {
    if (typeof text !== 'string' || text.length > MAX_TEXT) fail(); const value: unknown = JSON.parse(text); inspect(value); return structuredClone(value);
}
