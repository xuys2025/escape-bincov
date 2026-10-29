/**
 * Isolated #143 resource-mechanics experiment. The journal is NOT a live save or a new storage writer.
 * Seed resources and owner-observed commands replay together; callers publish a detached plan atomically.
 * Integer action milliseconds stop during pause/offline. Replaying never reads a clock or draws random numbers.
 */
import * as D from './domain';
import { gunUids, validateGun } from './gunsmith/instance';
import { hasExactKeys as exact, hasOwnStringKey, identity, validInventory, whole } from './profile-codec';
import { assertSkillProgress, compileSkillEffects, type SkillProgress } from './skill-tree';

export interface SkillMechanicVitals {
    hpMilli: number; maxHpMilli: number; waterMilli: number; satietyMilli: number; pollutionMilli: number; bleeding: boolean;
}
export interface SkillScanTarget { id: string; revealed: boolean; inRange: boolean; lineOfSight: boolean; opened: boolean }
export interface SkillMechanicSeed {
    runId: string; progress: SkillProgress; bag: D.Inventory; equipment: D.Equipment; vitals: SkillMechanicVitals;
    protectedItems: string[]; containers: SkillScanTarget[];
}
type CommandBase = { id: string; runId: string; atMs: number };
export type SkillMechanicCommand = CommandBase & (
    { kind: 'advance'; paused: boolean; reloading: boolean; sprinting: boolean }
    | { kind: 'hurt'; amountMilli: number; enemy: boolean }
    | { kind: 'hostile' | 'fire' | 'reload' | 'scan' }
    | { kind: 'mark-salvage'; uid: string; marked: boolean }
    | { kind: 'observe'; target: SkillScanTarget });
export interface SkillMechanicJournal {
    kind: 'bincov-skill-mechanics'; version: 1; seed: SkillMechanicSeed; commands: SkillMechanicCommand[];
}
type Counters = { transferred: number; generatedAmmo: number; usedScrap: number; regeneratedMilli: number; usedBandages: number;
    salvaged: number; scans: number; fired: number; firedRelief: number };
export interface SkillMechanicView {
    atMs: number; bag: D.Inventory; equipment: D.Equipment; vitals: SkillMechanicVitals; marked: string[];
    containers: SkillScanTarget[]; counters: Counters; lastScan: string[];
}
type State = SkillMechanicView & { due: Record<'feed' | 'press' | 'salvage' | 'regen', number>; scanReady: number; serial: number };
const MAX_ACTION_MS = 600000, MAX_COMMANDS = 4096, MAX_TEXT = 2000000;
const periods = { feed: 1000, press: 12000, salvage: 10000, regen: 2000 } as const;
// Simultaneous resource changes have one ordering, independent of the frame partition.
const order = ['salvage', 'press', 'feed', 'regen'] as const;
function bad(): never { throw new Error('Invalid skill mechanics research checkpoint or command.'); }
const initialDue = (at: number) => ({ feed: at + 7000, press: at + 18000, salvage: at + 16000, regen: at + 10000 });
function checkTarget(v: unknown): asserts v is SkillScanTarget {
    if (!exact(v, ['id', 'revealed', 'inRange', 'lineOfSight', 'opened']) || !identity(v.id)
        || ['revealed', 'inRange', 'lineOfSight', 'opened'].some(k => typeof v[k] !== 'boolean')) bad();
}
function checkSeed(v: unknown): asserts v is SkillMechanicSeed {
    if (!exact(v, ['runId', 'progress', 'bag', 'equipment', 'vitals', 'protectedItems', 'containers'])
        || typeof v.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(v.runId)) bad();
    assertSkillProgress(v.progress);
    const seen = new Set<string>();
    if (!validInventory(v.bag, 6, 5, seen, { rotation: true, exact: true, guns: true })) bad();
    const e = v.equipment;
    if (!exact(e, ['weapon', 'weaponUid', 'gun', 'relief', 'ammo', 'ammoRelief']) || typeof e.relief !== 'boolean'
        || !whole(e.ammo, 0, 1000) || !whole(e.ammoRelief, 0, e.ammo)) bad();
    if (e.weapon === null) {
        if (e.weaponUid !== null || e.gun !== null || e.ammo !== 0 || e.ammoRelief !== 0 || e.relief) bad();
    } else {
        if (!D.isGun(e.weapon) || !validateGun(e.weapon, e.weaponUid, e.gun).ok) bad();
        const equipment = e as unknown as D.Equipment;
        if (equipment.ammo > D.equippedWeapon(equipment).magazine) bad();
        for (const uid of gunUids({ uid: equipment.weaponUid!, parts: equipment.gun!.parts })) {
            if (seen.has(uid)) bad(); seen.add(uid);
        }
    }
    const b = v.vitals;
    if (!exact(b, ['hpMilli', 'maxHpMilli', 'waterMilli', 'satietyMilli', 'pollutionMilli', 'bleeding'])
        || !whole(b.maxHpMilli, 1, 1000000) || !whole(b.hpMilli, 0, b.maxHpMilli) || typeof b.bleeding !== 'boolean'
        || ['waterMilli', 'satietyMilli', 'pollutionMilli'].some(k => !whole(b[k], 0, 100000))) bad();
    if (!Array.isArray(v.protectedItems) || v.protectedItems.length > Object.keys(D.ITEMS).length
        || v.protectedItems.some(id => !hasOwnStringKey(D.ITEMS, id)) || new Set(v.protectedItems).size !== v.protectedItems.length) bad();
    if (!Array.isArray(v.containers) || v.containers.length > 256) bad();
    for (const target of v.containers) checkTarget(target);
    if (new Set(v.containers.map(t => t.id)).size !== v.containers.length) bad();
}
const common = ['id', 'runId', 'atMs', 'kind'];
function checkCommand(v: unknown): asserts v is SkillMechanicCommand {
    if (!v || typeof v !== 'object' || Array.isArray(v)) bad();
    const c = v as Record<string, unknown>;
    if (!identity(c.id) || !identity(c.runId) || !whole(c.atMs, 0, MAX_ACTION_MS) || typeof c.kind !== 'string') bad();
    switch (c.kind) {
        case 'advance':
            if (!exact(c, [...common, 'paused', 'reloading', 'sprinting'])
                || ['paused', 'reloading', 'sprinting'].some(k => typeof c[k] !== 'boolean')) bad(); break;
        case 'hurt':
            if (!exact(c, [...common, 'amountMilli', 'enemy']) || !whole(c.amountMilli, 0, 1000000) || typeof c.enemy !== 'boolean') bad(); break;
        case 'mark-salvage':
            if (!exact(c, [...common, 'uid', 'marked']) || !identity(c.uid) || typeof c.marked !== 'boolean') bad(); break;
        case 'observe':
            if (!exact(c, [...common, 'target'])) bad(); checkTarget(c.target); break;
        case 'hostile': case 'fire': case 'reload': case 'scan': if (!exact(c, common)) bad(); break;
        default: bad();
    }
}
/** Canonical property order makes idempotency independent of a JSON object's key order. */
function commandKey(c: SkillMechanicCommand): string {
    const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
    return JSON.stringify(sorted(c));
}
function initial(seed: SkillMechanicSeed): State {
    return { atMs: 0, bag: structuredClone(seed.bag), equipment: structuredClone(seed.equipment), vitals: structuredClone(seed.vitals),
        containers: structuredClone(seed.containers), marked: [], counters: { transferred: 0, generatedAmmo: 0, usedScrap: 0,
            regeneratedMilli: 0, usedBandages: 0, salvaged: 0, scans: 0, fired: 0, firedRelief: 0 }, lastScan: [],
        due: initialDue(0), scanReady: 0, serial: 0 };
}
function consume(bag: D.Inventory, entry: D.Item, count = 1): void {
    entry.qty -= count; bag.items = bag.items.filter(item => item.qty > 0);
}
/** All generated outputs are ordinary. Failed placement rolls back both consumption and deterministic uid allocation. */
function exchange(s: State, seed: SkillMechanicSeed, sourceUid: string, output: string, count: number): boolean {
    const bag = structuredClone(s.bag), item = bag.items.find(i => i.uid === sourceUid);
    if (!item || item.relief || item.qty < 1) return false;
    consume(bag, item);
    let serial = s.serial;
    const used = new Set(s.bag.items.flatMap(D.itemUids));
    if (s.equipment.weaponUid) for (const uid of gunUids({ uid: s.equipment.weaponUid, parts: s.equipment.gun!.parts })) used.add(uid);
    const allocate = () => { let uid: string; do { uid = `skill-${seed.runId}-${++serial}`; } while (used.has(uid)); used.add(uid); return uid; };
    if (D.addItem(bag, output, count, false, false, true, allocate) !== 0) return false;
    s.bag = bag; s.serial = serial; return true;
}
function feed(s: State, seed: SkillMechanicSeed): void {
    const e = s.equipment;
    if (!D.isGun(e.weapon) || e.ammo >= D.equippedWeapon(e).magazine) return;
    const ammo = D.equippedWeapon(e).ammo;
    const source = [true, false].flatMap(relief => s.bag.items.filter(i => i.id === ammo && !!i.relief === relief && !seed.protectedItems.includes(i.id)))[0];
    if (!source) return;
    // Delegate capacity, ammo matching and relief semantics to the game's existing reload rule, limited to one round.
    const one = { w: s.bag.w, h: s.bag.h, items: [{ ...structuredClone(source), qty: 1 }] };
    const loaded = D.reloadMagazine(e, e.ammo, e.ammoRelief, one), delta = loaded.ammo - e.ammo;
    if (delta) { consume(s.bag, source, delta); Object.assign(e, loaded); s.counters.transferred += delta; }
}
const questItems = new Set(Object.values(D.QUESTS).flatMap(q => Object.keys(q.needs)));
function salvageable(seed: SkillMechanicSeed, item: D.Item | undefined): item is D.Item {
    return !!item && item.id === 'battery' && !item.relief && !questItems.has(item.id) && !seed.protectedItems.includes(item.id);
}
function advance(s: State, seed: SkillMechanicSeed, c: Extract<SkillMechanicCommand, { kind: 'advance' }>, effects: ReturnType<ReturnType<typeof compileSkillEffects>>): void {
    if (c.atMs < s.atMs || c.paused && c.atMs !== s.atMs) bad();
    while (true) {
        const next = Math.min(...Object.values(s.due)); if (next > c.atMs) break;
        for (const k of order) {
            if (s.due[k] !== next) continue;
            s.due[k] += periods[k];
            if (s.vitals.hpMilli === 0 || c.paused) continue;
            const busy = c.sprinting || c.reloading;
            if (k === 'feed' && effects.autoFeedRounds && !busy) feed(s, seed);
            if (k === 'press' && effects.pressRounds && !busy && s.counters.generatedAmmo < 6 && D.isGun(s.equipment.weapon)) {
                const ammo = D.equippedWeapon(s.equipment).ammo;
                const scrap = s.bag.items.find(i => i.id === 'scrap' && !i.relief && !seed.protectedItems.includes(i.id));
                if (scrap && ammo && ['ammo9', 'ammoR', 'shell'].includes(ammo)
                    && exchange(s, seed, scrap.uid, ammo, 2)) { s.counters.generatedAmmo += 2; s.counters.usedScrap++; }
            }
            if (k === 'salvage' && effects.salvageYield && !busy && s.counters.salvaged < 3) {
                const item = s.bag.items.find(i => s.marked.includes(i.uid) && salvageable(seed, i));
                if (item && exchange(s, seed, item.uid, 'scrap', 1)) s.counters.salvaged++;
                s.marked = s.marked.filter(uid => s.bag.items.some(i => i.uid === uid));
            }
            if (k === 'regen' && effects.regenerationHp && !c.sprinting) {
                const v = s.vitals, cap = Math.floor(v.maxHpMilli * .6);
                if (!v.bleeding && v.pollutionMilli <= 40000 && v.waterMilli > 20000 && v.satietyMilli > 20000) {
                    const amount = Math.max(0, Math.min(1000, cap - v.hpMilli, 30000 - s.counters.regeneratedMilli,
                        v.waterMilli - 20000, v.satietyMilli - 20000));
                    v.hpMilli += amount; v.waterMilli -= amount; v.satietyMilli -= amount; s.counters.regeneratedMilli += amount;
                }
            }
        }
    }
    s.atMs = c.atMs;
}
function apply(s: State, seed: SkillMechanicSeed, c: SkillMechanicCommand, effects: ReturnType<ReturnType<typeof compileSkillEffects>>): void {
    if (c.runId !== seed.runId) bad();
    if (c.kind === 'advance') { advance(s, seed, c, effects); return; }
    // Observations/actions cannot jump the clock: active elapsed time must be reported explicitly first.
    if (c.atMs !== s.atMs) bad();
    if (c.kind === 'observe') {
        const target = s.containers.find(t => t.id === c.target.id); if (!target) bad();
        // A discovered room/opened container cannot be made unknown again by a stale observation.
        if (target.revealed && !c.target.revealed || target.opened && !c.target.opened) bad();
        Object.assign(target, c.target); return;
    }
    if (c.kind === 'mark-salvage') {
        if (c.marked && !salvageable(seed, s.bag.items.find(i => i.uid === c.uid))) bad();
        s.marked = s.marked.filter(uid => uid !== c.uid); if (c.marked) s.marked.push(c.uid); return;
    }
    if (s.vitals.hpMilli === 0) return;
    if (c.kind === 'hostile') s.due = initialDue(s.atMs);
    if (c.kind === 'hurt' && c.amountMilli > 0) {
        s.vitals.hpMilli = Math.max(0, s.vitals.hpMilli - c.amountMilli); s.due = initialDue(s.atMs);
        if (c.enemy && s.vitals.hpMilli > 0 && s.vitals.hpMilli * 4 <= s.vitals.maxHpMilli && effects.autoAidHp && s.counters.usedBandages === 0) {
            const bandage = [true, false].flatMap(relief => s.bag.items.filter(i => i.id === 'bandage' && !!i.relief === relief && !seed.protectedItems.includes(i.id)))[0];
            if (bandage) {
                consume(s.bag, bandage); s.vitals.hpMilli = Math.min(s.vitals.maxHpMilli, s.vitals.hpMilli + 10000);
                s.vitals.bleeding = false; s.counters.usedBandages++;
            }
        }
    }
    if (c.kind === 'fire' && D.isGun(s.equipment.weapon) && s.equipment.ammo > 0) {
        s.equipment.ammo--; s.counters.fired++;
        if (s.equipment.ammoRelief) { s.equipment.ammoRelief--; s.counters.firedRelief++; }
        s.due = initialDue(s.atMs);
    }
    if (c.kind === 'reload') Object.assign(s.equipment, D.reloadMagazine(s.equipment, s.equipment.ammo, s.equipment.ammoRelief, s.bag));
    if (c.kind === 'scan' && effects.scanCharges && s.counters.scans < 3 && s.atMs >= s.scanReady) {
        const found = s.containers.filter(t => t.revealed && t.inRange && t.lineOfSight && !t.opened).map(t => t.id);
        s.lastScan = found;
        if (found.length) { s.counters.scans++; s.scanReady = s.atMs + 30000; }
    }
}
function replay(value: unknown): State {
    if (!exact(value, ['kind', 'version', 'seed', 'commands']) || value.kind !== 'bincov-skill-mechanics' || value.version !== 1) bad();
    checkSeed(value.seed);
    if (!Array.isArray(value.commands) || value.commands.length > MAX_COMMANDS) bad();
    const s = initial(value.seed), ids = new Set<string>();
    const effects = compileSkillEffects(value.seed.progress)({ at: 0, lastKillAt: null, breachUntil: null, lastHostileAt: 0,
        ambushReadyAt: 0, aiming: false, emergencyUntil: null, respiteUntil: null });
    for (const c of value.commands) {
        checkCommand(c); if (ids.has(c.id)) bad(); ids.add(c.id); apply(s, value.seed, c, effects);
    }
    return s;
}
function publicView(s: State): SkillMechanicView {
    const { due: _due, scanReady: _ready, serial: _serial, ...view } = s; return structuredClone(view);
}
export function newSkillMechanics(seed: SkillMechanicSeed): SkillMechanicJournal {
    const journal: SkillMechanicJournal = { kind: 'bincov-skill-mechanics', version: 1, seed: structuredClone(seed), commands: [] };
    replay(journal); return journal;
}
export function skillMechanicView(journal: SkillMechanicJournal): SkillMechanicView { return publicView(replay(journal)); }
/** A repeated identical command returns the same plan; reusing its identity for another payload is an error. */
export function planSkillMechanic(journal: SkillMechanicJournal, command: SkillMechanicCommand) {
    const s = replay(journal); checkCommand(command);
    const previous = journal.commands.find(c => c.id === command.id);
    if (previous) {
        if (commandKey(previous) !== commandKey(command)) bad();
        return { journal: structuredClone(journal), view: publicView(s), duplicate: true };
    }
    if (journal.commands.length === MAX_COMMANDS) bad();
    apply(s, journal.seed, command, compileSkillEffects(journal.seed.progress)({ at: 0, lastKillAt: null, breachUntil: null, lastHostileAt: 0,
        ambushReadyAt: 0, aiming: false, emergencyUntil: null, respiteUntil: null }));
    const next = structuredClone(journal); next.commands.push(structuredClone(command));
    return { journal: next, view: publicView(s), duplicate: false };
}
export function encodeSkillMechanics(journal: SkillMechanicJournal): string {
    replay(journal); const text = JSON.stringify(journal); if (text.length > MAX_TEXT) bad(); return text;
}
export function decodeSkillMechanics(text: string): SkillMechanicJournal {
    if (typeof text !== 'string' || text.length > MAX_TEXT) bad();
    const parsed: unknown = JSON.parse(text); replay(parsed); return structuredClone(parsed) as SkillMechanicJournal;
}
