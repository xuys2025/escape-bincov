import { departureWarnings } from '../qol';
import * as D from '../domain';
import * as B from '../base';
import * as Shop from '../shop';
import { moveQuantity, placementError } from '../loot';
import { organizeStash, transferBagToStash } from '../inventory-actions';
import { ATTRIBUTES, FACILITIES, RECIPES, derivedLimits, effectiveAttributes, newExpansion, rpgEnabled, stationUpgraded, upgradeToRpg, type ExpansionState } from '../expansion-state';
import { addPerk, canChoosePerk, isPerkId, perkModifiers, perkNode, perkNodes, removeAttributePerks, type PerkId, type PerkModifiers, type PerkNodeStatus } from '../perks';
import { useRpgItemResult } from '../rpg';
import { equipCharm, unequipCharm } from '../reputation-luck';
import { decodePortableBackup, encodeRecoveryBackup } from '../save-backup';
import { generateRun } from '../world';
import { SaveSession, type SessionState, type ExpansionDraft, type ExpansionTransaction } from '../session';
import { locateGun, planGunEdit, type GunEdit, type GunEditFault, type GunEditPlan, type GunEditPreview } from '../gunsmith/edit';
import { PRESET_LIMIT, PRESET_NAME_MAX, defaultPresetName, presetName, validPreset, type GunPreset, type PresetNode } from '../gunsmith/presets';
import { craftPremium, premiumLock, PREMIUM_REFUSALS } from '../gunsmith/premium';
import { validPractice } from './training';
import type * as C from './contract';
const ok = (): C.Result => ({ ok: true });
const fail = (reason: C.FailReason, message = '操作未完成，请检查条件后重试。'): C.Result => ({ ok: false, reason, message });
const source = (s: string): s is C.Source => ['stash', 'bag', 'safe'].includes(s);

/** How the workbench's refusals answer (planGunEdit's codes); every other code is a rule the edit breaks. */
const GUNSMITH_FAILS: Partial<Record<GunEditFault, C.FailReason>> = {
    raid: 'locked', 'missing-gun': 'missing-item', 'missing-part': 'missing-item', unowned: 'missing-item', space: 'space', footprint: 'space', unchanged: 'no-effect',
};
const gunsmithFail = (code: GunEditFault, message: string) => fail(GUNSMITH_FAILS[code] ?? 'rule', message);
/** A confirm the base moved under; and one whose token is not the latest preview's (or a preview that cannot be confirmed). */
const STALE_EDIT = '仓库或装备已改变，请重新预览改装。', OLD_PREVIEW = '请按最新的改装预览确认。';

/** The fee for resetting one attribute's perks (docs/CRITICAL-PERK-DESIGN.md section 5). */
const PERK_RESET_COST = 500;
type PerkState = Pick<ExpansionDraft, 'profile' | 'expansion'>;
/** A perk change on one candidate: the selection and fee it commits, and its preview. */
interface PerkPlan<P extends C.PerkChange> { perks: PerkId[]; cost: number; preview: P }
const delta = (before: number, after: number): C.PerkDelta => ({ before, after });
/** Perks change only at the upgraded station base: no raid, settlement or other location. */
const perkStation = ({ profile, expansion: e }: PerkState) => !stationUpgraded(e) || e.raid || e.base.location !== 'base' || profile.activeRun ? fail('locked') : null;
function perkChange(e: ExpansionState, after: PerkId[]): C.PerkChange {
    const was = derivedLimits(e), next = derivedLimits({ ...e, growth: { ...e.growth, perks: after } });
    const from = perkModifiers(e.growth.perks ?? []), to = perkModifiers(after);
    return { scope: (Object.keys(from) as (keyof PerkModifiers)[]).filter(k => JSON.stringify(from[k]) !== JSON.stringify(to[k])),
        modifiers: { before: from, after: to },
        limits: { hp: delta(was.hp, next.hp), stamina: delta(was.stamina, next.stamina), carry: delta(was.carry, next.carry) },
        body: { hp: delta(e.body.hp, Math.min(e.body.hp, next.hp)), stamina: delta(e.body.stamina, Math.min(e.body.stamina, next.stamina)) } };
}
/**
 * What a confirmation binds: the request, the whole profile and the perk facts with the limits shown. It leaves out
 * what base time moves (hp, stamina, effect timers, production), which the five-second checkpoints commit while a
 * dialog is open, unless a dose running out moves a limit. The confirm cuts hp and stamina as they are then.
 */
const perkKey = (request: string, { profile, expansion: e }: PerkState, { limits }: C.PerkChange) =>
    JSON.stringify([request, profile, e.growth.perks ?? [], e.growth.permanent, limits]);
/** The rules shared by the board, the previews and the confirms, on a state at the current time. */
function choicePlan(state: PerkState, id: string): PerkPlan<C.PerkChoicePreview> | C.Result {
    const refused = perkStation(state); if (refused) return refused;
    const perks = state.expansion.growth.perks ?? [], permanent = state.expansion.growth.permanent;
    if (!isPerkId(id)) return fail('rule');
    const { attribute, tier } = perkNode(id);
    if (!(permanent[attribute] >= tier)) return fail('locked');
    if (!canChoosePerk(perks, permanent, id)) return fail('rule');
    const after = addPerk(perks, id);
    return { perks: after, cost: 0, preview: { kind: 'choice', id, attribute, tier, ...perkChange(state.expansion, after) } };
}
function resetPlan(state: PerkState, attribute: C.Attribute): PerkPlan<C.PerkResetPreview> | C.Result {
    const refused = perkStation(state); if (refused) return refused;
    const { profile: { cash }, expansion: e } = state, perks = e.growth.perks ?? [];
    if (!ATTRIBUTES.includes(attribute)) return fail('rule');
    const after = removeAttributePerks(perks, attribute);
    if (after.length === perks.length) return fail('no-effect');
    if (cash < PERK_RESET_COST) return fail('funds');
    return { perks: after, cost: PERK_RESET_COST, preview: { kind: 'reset', attribute, cost: PERK_RESET_COST, cash: delta(cash, cash - PERK_RESET_COST),
        removed: perks.filter(id => !after.includes(id)), ...perkChange(e, after) } };
}
const perkBlock = (result: C.Result | PerkPlan<C.PerkChange> | null): C.PerkBlock | null => result && 'ok' in result && !result.ok ? { reason: result.reason, message: result.message } : null;
function perkNodeView(node: PerkNodeStatus): C.PerkNodeView {
    const shown = { attribute: node.attribute, tier: node.tier, options: [`${node.attribute}-${node.tier}-a`, `${node.attribute}-${node.tier}-b`] as const };
    return node.status === 'chosen' ? { ...shown, status: 'chosen', id: node.id } : node.status === 'open' ? { ...shown, status: 'open' } : { ...shown, status: 'locked', requires: node.tier };
}
/** One facade over the existing session. No second profile, renderer, RNG or timer is created. */
export class RealHideoutRuntime implements C.HideoutRuntime {
    private listeners = new Set<(event: C.HideoutEvent) => void>();
    private observed = 0;
    private previous: { profile: D.SaveDataV1; expansion: ExpansionState | null };
    private publishing = false;
    private disposed = false;
    private active = false;
    private lastInput = 0;
    private activityStart = 0;
    private acceptedMilliseconds = 0;
    private lastPosition: { x: number; y: number } | null = null;
    private samples: (C.PracticeSample & { attribute: C.Attribute })[] = [];
    private pending: { ticket: ExpansionTransaction; draft: ExpansionDraft; seconds: number; revision: number; before: string } | null = null;
    private lastTick: number;
    private preparedRun: string | null = null;
    private arrival: C.HideoutSnapshot['arrival'] = null;
    private importPreview: { text: string; token: string; rev: number } | null = null;
    /** The latest perk preview: confirmable once, for the same request on the same facts (perkKey). */
    private perkPreview: { token: string; request: string; key: string } | null = null;
    private serial = 0;
    constructor(private readonly state: SessionState, private readonly saves: SaveSession, private readonly now = () => Date.now(), private readonly activityAllowed = () => true) {
        this.observed = saves.revision; this.previous = this.capture(); this.lastTick = now();
    }
    private capture() { return { profile: structuredClone(this.state.save), expansion: this.saves.captureExpansion() }; }
    private emit(event: C.HideoutEvent) {
        for (const listener of [...this.listeners]) { try { listener(structuredClone(event)); } catch { /* A view cannot undo an already durable transaction. */ } }
    }
    private sync(action = 'external') {
        if (this.saves.requiresReload || this.observed === this.saves.revision || this.publishing) return;
        this.saves.publishCommitted(() => {
            const initialLoad = this.observed === 0, before = this.previous, after = this.capture();
            // Another entry committed independently: samples belonged to the previous revision, never its replacement.
            if (action === 'external') {
                this.samples = []; this.lastPosition = null; this.activityStart = this.lastInput = this.now(); this.acceptedMilliseconds = 0;
            }
            this.observed = this.saves.revision; this.previous = after;
            this.publishing = true;
            try {
                this.emit({ type: 'committed', rev: this.observed, action });
                if (initialLoad || action === 'import') return;
                if (!before.profile.quests.repair && after.profile.quests.repair) this.emit({ type: 'power-restored' });
                if (after.expansion) {
                    for (const f of FACILITIES) if (after.expansion.base.facilities[f] > (before.expansion?.base.facilities[f] ?? 0))
                        this.emit({ type: 'facility-built', facility: f, level: after.expansion.base.facilities[f] });
                    for (const batch of after.expansion.base.completed) if (!before.expansion?.base.completed.some(b => b.id === batch.id))
                        this.emit({ type: 'production-complete', batch: batch.id });
                    for (const a of ATTRIBUTES) {
                        const old = before.expansion?.base.training, next = after.expansion.base.training;
                        const amount = next.credited[a] - (old?.startedAt === next.startedAt ? old.credited[a] : 0);
                        if (amount > 0) this.emit({ type: 'practice-credited', attribute: a, amount });
                    }
                }
            } finally { this.publishing = false; }
        });
    }
    private complete(action: string, publish: () => void = () => {}): C.Result {
        return this.saves.publishCommitted(() => { publish(); this.sync(action); }) ? ok() : this.failed(action);
    }

    /** `reading`: a read-only view asks, which an event listener may do while this Runtime publishes. */
    private guard(base = true, retry = false, reading = false): C.Result | null {
        if (this.disposed || this.publishing && !reading) return fail('locked');
        if (this.state.conflict || !this.saves.ownsStorage) return fail('conflict', '存档已由另一窗口接管，本页不能写入。');
        if (this.saves.requiresReload) return fail('storage', this.state.storageError);
        if (!retry && (!this.state.storageOK || this.pending)) return fail('storage', '请先重试保存或导出备份。');
        if (this.state.pendingSettlement) return fail('locked', '结算尚未保存。');
        if (base && (this.state.state !== 'hideout' || this.state.save.activeRun || !rpgEnabled(this.state.expansion))) return fail('locked');
        return null;
    }
    private failed(action: string): C.Result {
        this.publishing = true; try { this.emit({ type: this.saves.requiresReload ? 'publish-failed' : 'save-failed', action }); } finally { this.publishing = false; }
        return fail(this.state.conflict ? 'conflict' : 'storage', this.state.storageError || '存档未写入，操作已回滚。');
    }
    private applySamples(draft: Pick<ExpansionDraft, 'expansion'>) {
        let seconds = 0;
        if (this.observed === this.saves.revision) for (const sample of this.samples)
            if (B.practice(draft.expansion, sample.attribute, sample.from, sample.to, sample.seconds, sample.now)) seconds += sample.seconds;
        return seconds;
    }
    private transaction(action: string, apply: (draft: ExpansionDraft) => boolean | C.Result, keep = false): C.Result {
        this.sync(); const blocked = this.guard(); if (blocked) return blocked;
        let rejection: C.Result = fail('rule'), candidate: ExpansionDraft | null = null, seconds = 0;
        let ticket: ExpansionTransaction | null;
        try { ticket = this.saves.prepareExpansionMutation(draft => {
            seconds = this.applySamples(draft);
            const result = apply(draft);
            if (result === false || typeof result === 'object' && !result.ok) { rejection = result === false ? fail('rule') : result; return false; }
            if (['move', 'quick-move', 'secure', 'equip', 'unequip', 'shop', 'quest', 'stash-upgrade', 'gunsmith'].includes(action)) D.grantRelief(draft.profile);
            candidate = structuredClone(draft); return true;
        }); } catch { return fail('rule', '操作数据无效，当前进度未改动。'); }
        if (!ticket) return rejection;
        const result = this.saves.commitExpansionMutation(ticket);
        if (result !== 'committed') {
            if (result === 'publish-failed') { this.pending = null; this.samples = []; return this.failed(action); }
            if (result === 'save-failed') { if (keep) { this.pending = { ticket, draft: candidate!, seconds, revision: this.saves.revision, before: JSON.stringify(this.capture()) }; this.saves.retainExpansionTransaction(ticket); } return this.failed(action); }
            return fail(result === 'rejected' ? 'stale' : 'conflict');
        }
        this.samples = []; return this.complete(action, () => { this.lastTick = this.now(); });
    }
    enter(): C.Result {
        const blocked = this.guard(false); if (blocked) return blocked;
        if (this.state.save.activeRun || !['menu', 'hideout'].includes(this.state.state)) return fail('locked', '请先恢复或结束原行动。');
        if (!this.saves.ensureRpg()) return this.failed('upgrade');
        // Entry owns relief; mounting/remounting a renderer must never issue inventory writes.
        // Preserve accepted training before the shared session advances its revision for relief.
        if (this.samples.length) { const flushed = this.flush(); if (!flushed.ok) return flushed; }
        const relief = this.saves.grantReliefResult();
        if (relief === 'blocked') return this.guard(false) ?? fail('storage', '请先重试保存或导出备份。');
        if (relief === 'save-failed' || relief === 'publish-failed') return this.failed('relief');
        return this.complete('enter', () => { this.state.state = 'hideout'; this.lastTick = this.now(); });
    }
    snapshot(): C.HideoutSnapshot {
        this.sync(); const s = this.state, e = structuredClone(s.expansion) ?? newExpansion(this.now()), limits = derivedLimits(e), effective = effectiveAttributes(e);
        return structuredClone({ rev: this.saves.revision, profile: s.save, charm: e.charm ?? null,
            base: { ...e.base, training: { ...e.base.training, windowLeft: Math.max(0, 600000 - Math.max(0, this.now() - e.base.training.startedAt)) / 1000 } },
            body: { ...e.body, hpMax: limits.hp, staminaMax: limits.stamina, carry: limits.carry,
                effects: Object.entries(e.body.effects).filter(([, seconds]) => seconds > 0).map(([name, seconds]) => ({ name, seconds })),
                attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, { base: e.growth.permanent[a], effective: effective[a], progress: e.growth.progress[a] }])) as C.BodyView['attributes'] },
            power: s.save.quests.repair ? 'restored' : 'emergency',
            storage: { ok: s.storageOK, reloadRequired: this.saves.requiresReload, conflict: s.conflict || !this.saves.ownsStorage, pendingSettlement: !!s.pendingSettlement, pendingBase: !!this.pending || !!this.samples.length, upgradeRequired: !stationUpgraded(s.expansion) },
            day: s.save.stats.runs + 1, phase: s.state === 'hideout' && this.preparedRun && s.save.activeRun?.runId === this.preparedRun ? 'departing' : s.state, arrival: this.arrival });
    }
    trainingProgress(): C.TrainingProgress {
        const now = this.now(), saved = this.saves.captureExpansion() ?? newExpansion(now);
        const stale = !!this.pending && (this.pending.revision !== this.saves.revision || this.pending.before !== JSON.stringify(this.capture()));
        const effective = !stale && this.pending ? structuredClone(this.pending.draft.expansion) : structuredClone(saved);
        const pendingSeconds = stale ? 0 : this.pending ? this.pending.seconds : this.applySamples({ expansion: effective });
        const t = effective.base.training, windowLeft = Math.max(0, 600000 - Math.max(0, now - t.startedAt)) / 1000;
        const windowExpired = windowLeft === 0, capped = t.quantity >= 1 && !windowExpired;
        const status = this.state.conflict || !this.saves.ownsStorage ? 'conflict' : stale ? 'stale'
            : this.pending || !this.state.storageOK ? 'storage'
            : this.disposed || this.state.state !== 'hideout' || this.state.save.activeRun || this.state.pendingSettlement ? 'locked'
            : !saved.base.facilities.training ? 'unavailable' : !t.attribute ? 'select' : capped ? 'capped' : 'ready';
        return { attribute: t.attribute, saved: { activeSeconds: saved.base.training.activeSeconds, quantity: saved.base.training.quantity },
            pendingSeconds, activeSeconds: t.activeSeconds, quantity: t.quantity, windowLeft, windowExpired,
            pendingWindow: t.startedAt !== saved.base.training.startedAt, capped, status,
            pendingGrowth: Object.fromEntries(ATTRIBUTES.map(a => [a, Math.max(0, (effective.growth.permanent[a] - saved.growth.permanent[a])
                + (effective.growth.progress[a] - saved.growth.progress[a]))])) as Record<C.Attribute, number> };
    }
    subscribe(fn: (event: C.HideoutEvent) => void) { if (!this.disposed) this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
    tick(nowMs: number): void {
        this.sync(); if (!Number.isSafeInteger(nowMs) || Math.abs(nowMs - this.now()) > 1000 || nowMs - this.lastTick < 5000 || this.guard()) return;
        this.transaction('checkpoint', () => true, true);
    }
    setActivity(active: boolean): void {
        if (active !== this.active) { this.activityStart = this.lastInput = this.now(); this.acceptedMilliseconds = 0; this.lastPosition = null; }
        this.active = active;
    }
    placementError(from: C.Source, to: C.Source, uid: string, x: number, y: number, rotated: boolean, quantity?: number): string | null {
        if (!source(from) || !source(to)) return '无效容器。';
        return placementError(this.state.save[from], this.state.save[to], uid, x, y, rotated, quantity);
    }
    move(from: C.Source, to: C.Source, uid: string, x: number, y: number, rotated: boolean, quantity?: number): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!source(from) || !source(to)) return fail('rule');
        const error = this.placementError(from, to, uid, x, y, rotated, quantity); if (error) return fail('space', error);
        return this.transaction('move', d => moveQuantity(d.profile[from], d.profile[to], uid, x, y, rotated, quantity));
    }
    split(from: C.Source, uid: string, quantity: number, x: number, y: number, rotated?: boolean): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        const item = source(from) && this.state.save[from].items.find(i => i.uid === uid);
        if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity >= item.qty) return fail('rule');
        return this.move(from, from, uid, x, y, rotated ?? !!item.rotated, quantity);
    }
    quickMove(from: C.Source, uid: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!source(from)) return fail('rule');
        if (!this.state.save[from].items.some(item => item.uid === uid)) return fail('missing-item', '物品已不在原位置，请重新选择。');
        const target = from === 'stash' ? 'bag' : 'stash';
        return this.transaction('quick-move', d => D.transferItem(d.profile[from], d.profile[target], uid) || fail('space', `${target === 'bag' ? '背包' : '仓库'}空间不足，物品仍在原处。`));
    }
    stashAll(): C.Result {
        this.sync(); const blocked = this.guard(); if (blocked) return blocked;
        const count = this.state.save.bag.items.length;
        if (!count) return { ok: true, message: '背包已空，无需入库。' };
        const result = this.transaction('stash-all', d => transferBagToStash(d.profile) || fail('space', '仓库空间不足，背包物品全部留在原处。'));
        return result.ok ? { ok: true, message: `背包 ${count} 组物品已全部入库。装备与安全箱保持不变。` } : result;
    }
    sortStash(): C.Result {
        this.sync(); const blocked = this.guard(); if (blocked) return blocked;
        const candidate = { stash: structuredClone(this.state.save.stash) };
        if (!organizeStash(candidate)) return fail('space', '仓库无法完成整理，物品与原有位置均未改动。');
        if (JSON.stringify(candidate.stash) === JSON.stringify(this.state.save.stash)) return { ok: true, message: '仓库已整理，无需改动。' };
        const result = this.transaction('stash-sort', d => organizeStash(d.profile) || fail('space', '仓库无法完成整理，物品与原有位置均未改动。'));
        return result.ok ? { ok: true, message: '仓库已整理，同类物品已合堆并排列。' } : result;
    }
    secure(from: C.Source, uid: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!source(from)) return fail('rule');
        if (!this.state.save[from].items.some(item => item.uid === uid)) return fail('missing-item', '物品已不在原位置，请重新选择。');
        const target = from === 'safe' ? 'bag' : 'safe';
        return this.transaction('secure', d => D.transferItem(d.profile[from], d.profile[target], uid) || fail('space', `${target === 'bag' ? '背包' : '安全箱'}空间不足，物品仍在原处。`));
    }
    equip(from: C.Source, uid: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!['stash', 'bag'].includes(from)) return fail('rule', '请先把枪械放入背包或仓库，再装备主武器。');
        const item = this.state.save[from].items.find(i => i.uid === uid);
        if (!item) return fail('missing-item', '物品已不在原位置，请重新选择。');
        if (!D.isGun(item.id)) return fail('rule', '这件物品不能装备为主武器。');
        return this.transaction('equip', d => D.equip(d.profile, uid) || fail('space', '无法装备：原武器及弹匣余弹在原容器中放不下，请先腾出空间。'));
    }
    unequip() { return this.transaction('unequip', d => D.unequip(d.profile) || fail('space')); }
    useSupply(from: C.Source, uid: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!source(from)) return fail('rule');
        return this.transaction('supply', d => {
            const inv = d.profile[from], item = inv.items.find(i => i.uid === uid);
            if (!item) return fail('missing-item', '这件物品已不存在，请重新选择补给。');
            const result = useRpgItemResult(d.expansion, item.id); if (!result.ok) return fail(result.reason, result.message);
            if (!--item.qty) inv.items = inv.items.filter(i => i.uid !== uid); return true;
        });
    }
    equipCharm(from: C.Source, uid: string): C.Result { const blocked = this.guard(); if (blocked) return blocked; return source(from) ? this.transaction('charm-equip', d => equipCharm(d.profile, d.expansion, uid, from)) : fail('rule'); }
    unequipCharm() { return this.transaction('charm-unequip', d => unequipCharm(d.profile, d.expansion)); }
    upgradeStash() { return this.transaction('stash-upgrade', d => D.upgradeStash(d.profile)); }
    claimRelief() { return this.transaction('relief', d => D.grantRelief(d.profile)); }
    submitQuest(id: string) { return this.transaction('quest', d => Object.hasOwn(D.QUESTS, id) && D.submitQuest(d.profile, id)); }
    facility(id: C.Facility): C.FacilityInfo {
        const s = this.snapshot(), level = s.base.facilities[id], cost = B.FACILITY_COSTS[id]?.[level];
        return { id, name: B.FACILITY_NAMES[id], level, maxLevel: 3, explanation: { rest: '提高生命与精神恢复速度，并缩短获得精力充沛所需的休息。', medical: '提高生命恢复和止血、镇痛、疲劳治疗速度。', training: '提高行动训练效率。在训练区实际走动，每满 120 秒获得一次练习收益。', workbench: '有限队列串行生产；领完一批，再为后续成品腾出位置。', blackmarket: '需要修好电源，并成功带回一颗普通黑珍珠。货单尚未开放。' }[id],
            cost: cost ? { cash: cost.cash, items: cost.items.map(i => ({ ...i, have: [s.profile.stash, s.profile.bag, s.profile.safe].flatMap(v => v.items).filter(v => v.id === i.id && !v.relief).reduce((n, v) => n + v.qty, 0) })) } : null,
            locked: !FACILITIES.includes(id) ? '无效设施' : level >= 3 ? '已满级' : id !== 'rest' && s.power !== 'restored' ? '需要恢复供电' : id === 'blackmarket' && !s.base.extractedPearl ? '需要撤离带回珍珠' : null };
    }
    build(id: C.Facility): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!FACILITIES.includes(id)) return fail('rule'); const info = this.facility(id);
        if (info.locked) return fail('locked', info.locked);
        return this.transaction('build', d => d.profile.cash < info.cost!.cash ? fail('funds') : B.buildFacility(d.profile, d.expansion, id) || fail('materials'));
    }
    enqueue(recipe: C.Recipe): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!Object.hasOwn(RECIPES, recipe)) return fail('rule');
        return this.transaction('enqueue', d => {
            const r = RECIPES[recipe], b = d.expansion.base;
            if (b.facilities.workbench < r.level || b.facilities.medical < r.medical || b.queue.length >= b.facilities.workbench) return fail('locked');
            return d.profile.cash < r.cash ? fail('funds') : B.enqueueProduction(d.profile, d.expansion, recipe) || fail('materials');
        });
    }
    /** 老栓精工 (#28 M4-09): make premium part `id` now from a base part, a blank and its price; one write or none. */
    craftPremium(id: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        return this.transaction('premium', d => {
            const refusal = craftPremium(d.profile, d.expansion, id);
            return !refusal ? true : fail(refusal, refusal === 'locked' ? premiumLock(d.profile, d.expansion)! : PREMIUM_REFUSALS[refusal]);
        });
    }
    cancel(batchId: string) { return this.transaction('cancel', d => d.expansion.base.queue.findIndex(b => b.id === batchId) <= 0 ? fail('rule') : B.cancelProduction(d.profile, d.expansion, batchId) || fail('space')); }
    claim(batchId: string, target: C.Source): C.Result { const blocked = this.guard(); if (blocked) return blocked; return source(target) ? this.transaction('claim', d => !d.expansion.base.completed.some(b => b.id === batchId) ? fail('stale') : B.claimProduction(d.profile, d.expansion, batchId, target) || fail('space')) : fail('rule'); }
    selectPractice(attribute: C.Attribute): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!ATTRIBUTES.includes(attribute)) return fail('rule');
        return this.transaction('practice-select', d => { if (!d.expansion.base.facilities.training) return false; d.expansion.base.training.attribute = attribute; return true; });
    }
    practice(sample: C.PracticeSample): void {
        this.sync();
        if (!this.active || !this.activityAllowed() || this.guard() || !validPractice(sample) || sample.now > this.now() || this.now() - sample.now > 1000
            || sample.now <= this.lastInput || sample.now - this.lastInput + 1 < sample.seconds * 1000
            || this.acceptedMilliseconds + sample.seconds * 1000 > sample.now - this.activityStart + 1 || this.samples.length >= 4096) return;
        const e = this.saves.captureExpansion(), attribute = e?.base.training.attribute;
        if (!attribute || !e.base.facilities.training) return;
        if (this.lastPosition && Math.hypot(sample.from.x - this.lastPosition.x, sample.from.y - this.lastPosition.y) > .01) {
            this.lastInput = sample.now; this.lastPosition = { ...sample.to }; return;
        }
        this.samples.push({ ...structuredClone(sample), attribute }); this.acceptedMilliseconds += sample.seconds * 1000; this.lastInput = sample.now; this.lastPosition = { ...sample.to };
    }
    /**
     * The committed state as a transaction would prepare it now: base time advanced under the current perks (with
     * `advance`), then the accepted practice samples. Detached; building it changes nothing.
     */
    private perkState(advance: boolean): PerkState {
        const state = { profile: structuredClone(this.state.save), expansion: this.saves.captureExpansion() ?? newExpansion(this.now()) };
        if (advance && rpgEnabled(state.expansion)) B.advanceRealTime(state.expansion, this.now());
        this.applySamples(state);
        return state;
    }
    perkBoard(): C.PerkBoard {
        // Nothing the board shows depends on base time, so it skips that advance.
        const state = this.perkState(false), { perks = [], permanent } = state.expansion.growth;
        const blocked = perkBlock(this.guard(true, false, true) ?? perkStation(state)), nodes = perkNodes(perks, permanent);
        return structuredClone({ blocked, attributes: Object.fromEntries(ATTRIBUTES.map(attribute => [attribute, {
            permanent: permanent[attribute], nodes: nodes.filter(n => n.attribute === attribute).map(perkNodeView),
            reset: { cost: PERK_RESET_COST, cash: state.profile.cash, chosen: perks.filter(id => perkNode(id).attribute === attribute),
                blocked: blocked ?? perkBlock(resetPlan(state, attribute)) } }])) as Record<C.Attribute, C.PerkAttributeView> });
    }
    private previewPerkPlan<P extends C.PerkChange>(request: string, plan: (state: PerkState) => PerkPlan<P> | C.Result): C.Result & { token?: string; preview?: P } {
        const blocked = this.guard(); if (blocked) return blocked;
        let state: PerkState, planned: PerkPlan<P> | C.Result;
        try { state = this.perkState(true); planned = plan(state); } catch { return fail('rule'); }
        if (!('preview' in planned)) return planned;
        const token = `perk-${++this.serial}`; this.perkPreview = { token, request, key: perkKey(request, state, planned.preview) };
        return { ok: true, token, preview: structuredClone(planned.preview) };
    }
    /**
     * Consumes a matching token, then plans again on the transaction's own candidate (base time already advanced under
     * the old perks): only the previewed change on the same facts commits, as one candidate with fee, selection and cut.
     */
    private confirmPerkPlan<P extends C.PerkChange>(action: string, request: string, token: string, plan: (state: PerkState) => PerkPlan<P> | C.Result): C.Result {
        this.sync(); const blocked = this.guard(); if (blocked) return blocked;
        const previewed = this.perkPreview;
        if (!previewed || previewed.token !== token || previewed.request !== request) return fail('stale');
        this.perkPreview = null;
        return this.transaction(action, draft => {
            const planned = plan(draft);
            if (!('preview' in planned) || perkKey(request, draft, planned.preview) !== previewed.key) return fail('stale');
            const { body } = draft.expansion, { hp, stamina } = planned.preview.body;
            draft.profile.cash -= planned.cost; draft.expansion.growth.perks = planned.perks; body.hp = hp.after; body.stamina = stamina.after;
            return true;
        }, true);
    }
    previewPerk(id: string) { return this.previewPerkPlan(`choice:${id}`, state => choicePlan(state, id)); }
    choosePerk(id: string, token: string) { return this.confirmPerkPlan('perk-choice', `choice:${id}`, token, state => choicePlan(state, id)); }
    previewPerkReset(attribute: C.Attribute) { return this.previewPerkPlan(`reset:${attribute}`, state => resetPlan(state, attribute)); }
    resetPerks(attribute: C.Attribute, token: string) { return this.confirmPerkPlan('perk-reset', `reset:${attribute}`, token, state => resetPlan(state, attribute)); }
    retrySave(): C.Result {
        const blocked = this.guard(false, true); if (blocked) return blocked;
        if (this.pending) {
            const result = this.saves.commitExpansionMutation(this.pending.ticket);
            if (result === 'rejected') return fail('stale', '旧入口已改变存档，请先导出待保存进度。');
            if (result !== 'committed') { if (result === 'publish-failed') { this.pending = null; this.samples = []; } return this.failed('retry'); }
            this.pending = null; this.samples = []; return this.complete('retry', () => { this.lastTick = this.now(); });
        }
        if (!this.saves.persist()) return this.failed('retry'); return this.complete('retry');
    }
    exportBackup(): string {
        const record = this.saves.backupRecord(); if (!record) return this.saves.original() ?? '';
        if (this.saves.requiresReload) return encodeRecoveryBackup(record);
        if (this.pending) { record.profile = structuredClone(this.pending.draft.profile); record.expansion = structuredClone(this.pending.draft.expansion); record.raid = null; }
        else if (record.expansion && this.samples.length) { const draft = { profile: record.profile, expansion: record.expansion, legacyRaid: record.raid }; this.applySamples(draft); }
        return encodeRecoveryBackup(record);
    }
    previewImport(text: string): C.Result & { token?: string } {
        const blocked = this.guard(); if (blocked) return blocked;
        try { decodePortableBackup(text); } catch { return fail('rule', '备份损坏或版本不兼容。'); }
        const token = `import-${++this.serial}`; this.importPreview = { text, token, rev: this.saves.revision }; return { ok: true, token };
    }
    importBackup(text: string, token: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!this.importPreview || this.importPreview.text !== text || this.importPreview.token !== token || this.importPreview.rev !== this.saves.revision) return fail('stale', '请重新预览并确认覆盖。');
        const data = decodePortableBackup(text);
        // Existing v4 protection: never silently discard facilities or a live legacy checkpoint.
        if (data.kind === 'settled' || !data.record.expansion) return fail('locked', '当前成长存档不接受降级覆盖；请在旧版入口恢复旧备份后升级。');
        const record = structuredClone(data.record);
        // A settled import is at the station boundary: it upgrades here. A live raid keeps its version until it settles.
        if (!record.profile.activeRun && record.expansion) upgradeToRpg(record.expansion, this.now());
        if (!this.saves.importRecord(record)) return this.failed('import');
        this.importPreview = null; this.samples = []; this.arrival = null; this.preparedRun = null;
        if (this.state.save.activeRun) this.state.state = 'menu';
        return this.complete('import');
    }
    setVolume(volume: number): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) return fail('rule');
        return this.transaction('volume', d => { d.profile.settings.volume = volume; return true; });
    }
    departure() {
        const s = this.snapshot(), p = s.profile, weapon = D.equippedWeapon(p.equipment);
        const weight = D.weight(p.bag) + D.weight(p.safe) + D.ITEMS.knife.weight + D.equippedWeight(p.equipment)
            + (weapon.ammo ? D.ITEMS[weapon.ammo].weight * p.equipment.ammo : 0) + (this.state.expansion?.charm ? D.ITEMS[this.state.expansion.charm.id].weight : 0);
        return { warnings: [...departureWarnings(s.profile), ...(weight > s.body.carry ? ['携行重量超过当前负重'] : []), ...(s.body.hp < s.body.hpMax ? ['生命尚未恢复'] : [])], weight, carry: s.body.carry };
    }
    deploy(req: { world: C.RunWorld; seed: string; mallLayout?: 1 | 2 | 3 | 4 }): C.Result & { runId?: string } {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!req || !['coast', 'buildings', 'mall'].includes(req.world) || typeof req.seed !== 'string' || req.seed.length > 200) return fail('rule');
        const stop = D.deployBlocker(this.state.save);
        if (stop) return fail('rule', stop);
        if (this.samples.length) { const flushed = this.transaction('checkpoint', () => true, true); if (!flushed.ok) return flushed; }
        const seed = generateRun(req.seed.trim() || this.now()).seed;
        if (!this.saves.beginRun(seed, req.world === 'mall' ? 'mall' : req.world === 'buildings', { mallLayout: req.mallLayout })) return this.failed('deploy');
        const completed = this.complete('deploy', () => { this.preparedRun = this.state.save.activeRun!.runId!; this.arrival = null; this.setActivity(false); });
        return completed.ok ? { ok: true, runId: this.preparedRun! } : completed;
    }
    startRaid(runId: string): C.Result {
        const blocked = this.guard(false); if (blocked) return blocked;
        if (this.state.state !== 'hideout' || !this.preparedRun || runId !== this.preparedRun || this.state.save.activeRun?.runId !== runId || !this.state.loadout) return fail('stale');
        this.preparedRun = null; this.state.state = 'run'; return ok();
    }
    returnToBase(): C.Result {
        const blocked = this.guard(false); if (blocked) return blocked;
        const terminal = this.saves.currentRecord()?.terminal;
        if (this.state.state !== 'result' || this.state.save.activeRun || !terminal || !this.state.result || !this.state.save.lastResult) return fail('locked');
        if (!this.saves.ensureRpg()) return this.failed('return');
        return this.complete('return', () => { this.arrival = { runId: terminal.runId, summary: structuredClone(this.state.result!) }; this.state.state = 'hideout'; this.lastTick = this.now(); });
    }
    consumeArrival() { const value = structuredClone(this.arrival); this.arrival = null; return value; }
    flush(): C.Result {
        if (this.pending) return fail('storage', '请先重试保存。');
        return this.transaction('checkpoint', () => true, true);
    }
    backToMenu(): C.Result {
        const result = this.flush(); if (!result.ok) return result;
        this.setActivity(false); this.state.state = 'menu'; return ok();
    }
    dispose(): C.Result {
        if (this.disposed) return ok();
        if (this.pending) return fail('storage', '请先保存或导出待保存进度。');
        if (this.samples.length) { const result = this.transaction('checkpoint', () => true, true); if (!result.ok) return result; }
        this.listeners.clear(); this.disposed = true; this.setActivity(false); return ok();
    }
    openShop(merchant: C.Merchant): C.ShopSession {
        if (!Object.hasOwn(D.MERCHANTS, merchant)) throw new Error('无效商人。');
        let browse: Shop.ShopBrowse = Shop.BROWSE_ALL;
        let cart = Shop.createCart(this.state.save, merchant, true, browse), confirmation: { token: string; key: string } | null = null;
        const warnings = () => Shop.saleWarnings(this.state.save, cart).map(w => `${w.quest}：${D.ITEMS[w.id].name}还需${w.needed}，出售后剩${w.remaining}`);
        const key = () => JSON.stringify([cart, warnings(), this.state.save.quests]);
        const validSource = (value: string) => ['merchant', 'buy', 'sell', 'stash'].includes(value);
        const stale = () => Shop.cartStale(this.state.save, cart);
        const rejected = (reason: Shop.CartRejection) => fail(reason, Shop.cartRejectionMessage[reason]);
        return {
            view: () => structuredClone({ merchant, ...D.MERCHANTS[merchant], catalog: cart.catalog, buy: cart.buy, sell: cart.sell, stash: cart.stash, totals: Shop.cartTotals(cart), dirty: Shop.cartDirty(cart), stale: stale(), warnings: warnings(), placement: 'automatic-stash',
                browse: { ...browse, pages: Shop.catalogPage(this.state.save, merchant, true, browse).pages, kinds: Shop.stockKinds(merchant, this.state.save, true) } } as const),
            placementError: (from, to, uid, x, y) => stale() ? Shop.cartRejectionMessage.stale : validSource(from) && validSource(to) ? Shop.shopPlacementError(cart, from, to, uid, x, y) : '无效容器。',
            place: (from, to, uid, x, y) => {
                const blocked = this.guard(); if (blocked) return blocked;
                if (stale()) return rejected('stale');
                if (!validSource(from) || !validSource(to)) return fail('rule');
                const message = Shop.shopPlacementError(cart, from, to, uid, x, y); if (message) return fail('rule', message);
                confirmation = null; return Shop.moveShopItem(cart, from, to, uid, x, y) ? ok() : fail('rule');
            },
            settle: token => {
                const blocked = this.guard(); if (blocked) return blocked;
                if (stale()) return rejected('stale');
                const list = warnings();
                if (list.length && (!confirmation || confirmation.token !== token || confirmation.key !== key())) {
                    confirmation = { token: `sale-${++this.serial}`, key: key() };
                    return { ok: false, reason: 'rule', message: '出售会消耗未完成任务，请确认。', confirmation: { kind: 'quest-sale', token: confirmation.token, warnings: list } };
                }
                const result = this.transaction('shop', d => { const r = Shop.settleCartResult(d.profile, cart, true); return r.ok ? true : rejected(r.reason); });
                if (result.ok) { cart = Shop.createCart(this.state.save, merchant, true, browse); confirmation = null; } return result;
            },
            reset: () => { if (!this.guard()) { cart = Shop.createCart(this.state.save, merchant, true, browse); confirmation = null; } },
            browse: view => {
                // Only the catalog changes: its packs are templates (buying copies one), so a new page loses nothing.
                const kinds: string[] = ['all', ...Shop.stockKinds(merchant, this.state.save, true)];
                const asked: Shop.ShopBrowse = { kind: kinds.includes(view?.kind) ? view.kind : 'all', fits: view?.fits === true, page: Number.isInteger(view?.page) ? view.page : 0 };
                const page = Shop.catalogPage(this.state.save, merchant, true, asked);
                cart.catalog = page.catalog; browse = { ...asked, page: page.page };
            },
        };
    }
    /**
     * The workbench for one gun (#28 M2-04), shaped like the shop's cart: the player's preview stays private to the
     * session and is written only by confirm, through `transaction` (one SaveSession commit, nothing kept after a
     * failed write). planGunEdit does the rules on the committed profile; the session binds each preview to the
     * equipped slot and the three containers as they were (the positions of the gun and of every part) and to a
     * one-use token. Contract: C.GunsmithSession.
     */
    /** Presets (#28 M2-07): one commit each, through `transaction`; nothing is kept after a failed write. Contract: C.HideoutRuntime. */
    savePreset(gun: string, parts: PresetNode[], name: string | null = null): C.Result & { id?: string } {
        const blocked = this.guard(); if (blocked) return blocked;
        let id = '';
        const r = this.transaction('gunsmith-preset', d => {
            const list = d.profile.gunPresets ?? [];
            if (!D.isGun(gun)) return fail('rule', '这不是能改装的枪。');
            if (list.filter(p => p.gun === gun).length >= PRESET_LIMIT) return fail('rule', `每种枪最多存 ${PRESET_LIMIT} 套预设，先删掉一套。`);
            const label = name === null ? defaultPresetName(list, gun) : presetName(name);
            if (!label) return fail('rule', `预设名要 1 到 ${PRESET_NAME_MAX} 个字。`);
            let n = 1; while (list.some(p => p.id === `preset-${n}`)) n++;
            const preset: GunPreset = { id: `preset-${n}`, name: label, gun, parts: structuredClone(parts) };
            if (!validPreset(preset)) return fail('rule', '预设里的配件结构无效。');
            d.profile.gunPresets = [...list, preset]; id = preset.id;
            return true;
        });
        return r.ok ? { ok: true, message: '预设已保存。', id } : r;
    }
    renamePreset(id: string, name: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        const r = this.transaction('gunsmith-preset', d => {
            const list = d.profile.gunPresets ?? [], at = list.findIndex(p => p.id === id), label = presetName(name);
            if (at < 0) return fail('missing-item', '这套预设已不在了。');
            if (!label) return fail('rule', `预设名要 1 到 ${PRESET_NAME_MAX} 个字。`);
            d.profile.gunPresets = list.map((p, i) => i === at ? { ...p, name: label } : p);
            return true;
        });
        return r.ok ? { ok: true, message: '预设已改名。' } : r;
    }
    deletePreset(id: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        const r = this.transaction('gunsmith-preset', d => {
            const list = d.profile.gunPresets ?? [], left = list.filter(p => p.id !== id);
            if (left.length === list.length) return fail('missing-item', '这套预设已不在了。');
            if (left.length) d.profile.gunPresets = left; else delete d.profile.gunPresets;
            return true;
        });
        return r.ok ? { ok: true, message: '预设已删除。' } : r;
    }
    openGunsmith(gun: string): C.GunsmithSession {
        const inventory = () => { const p = this.state.save; return JSON.stringify([p.equipment, p.stash, p.bag, p.safe]); };
        let shown: { edits: GunEdit[]; preview: GunEditPreview; key: string; token: string | null } | null = null;
        const stale = () => !!shown && shown.key !== inventory();
        return {
            view: () => {
                this.sync();
                const found = locateGun(this.state.save, gun), old = stale();
                return structuredClone({ gun: found && { uid: gun, id: found.id, relief: found.relief, where: found.where, state: found.state },
                    edits: shown?.edits ?? [], preview: shown?.preview ?? null, token: old ? null : shown?.token ?? null, stale: old });
            },
            preview: edits => {
                this.sync(); const blocked = this.guard(); if (blocked) return blocked;
                let requested: GunEdit[], plan: GunEditPlan;
                try { requested = structuredClone([...edits]); plan = planGunEdit(this.state.save, gun, requested); } catch { return fail('rule', '改装数据无效，当前进度未改动。'); }
                if (!plan.ok && !plan.preview) return { ...gunsmithFail(plan.code, plan.reason), ...(plan.edit === null ? {} : { edit: plan.edit }) };
                const token = plan.ok ? `gunsmith-${++this.serial}` : null;
                shown = { edits: requested, preview: plan.preview!, key: inventory(), token };
                return { ok: true, ...(token ? { token } : {}), preview: structuredClone(plan.preview!) };
            },
            confirm: token => {
                this.sync(); const blocked = this.guard(); if (blocked) return blocked;
                const previewed = shown;
                if (!previewed?.token || previewed.token !== token) return fail('stale', OLD_PREVIEW);
                if (stale()) return fail('stale', STALE_EDIT);
                const result = this.transaction('gunsmith', d => {
                    const plan = planGunEdit(d.profile, gun, previewed.edits);
                    if (!plan.ok) return gunsmithFail(plan.code, plan.reason);
                    if (JSON.stringify(plan.preview) !== JSON.stringify(previewed.preview)) return fail('stale', STALE_EDIT);
                    const { equipment, stash, bag, safe } = plan.profile;
                    Object.assign(d.profile, { equipment, stash, bag, safe });
                    return true;
                });
                if (!result.ok) return result;
                if (shown === previewed) shown = null;
                return { ok: true, message: '改装已保存。' };
            },
            reset: () => { shown = null; },
        };
    }
}
