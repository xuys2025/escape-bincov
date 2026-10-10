import { departureWarnings } from '../qol';
import * as D from '../domain';
import * as B from '../base';
import * as Shop from '../shop';
import { moveQuantity, placementError } from '../loot';
import { ATTRIBUTES, FACILITIES, RECIPES, derivedLimits, effectiveAttributes, newExpansion, type ExpansionState } from '../expansion-state';
import { useRpgItem } from '../rpg';
import { equipCharm, unequipCharm } from '../reputation-luck';
import { decodePortableBackup, encodeRecoveryBackup } from '../save-backup';
import { generateRun } from '../world';
import { SaveSession, type SessionState, type ExpansionDraft, type ExpansionTransaction } from '../session';
import { validPractice } from './training';
import type * as C from './contract';
const ok = (): C.Result => ({ ok: true });
const fail = (reason: C.FailReason, message = '操作未完成，请检查条件后重试。'): C.Result => ({ ok: false, reason, message });
const source = (s: string): s is C.Source => ['stash', 'bag', 'safe'].includes(s);
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
    private pending: { ticket: ExpansionTransaction; draft: ExpansionDraft } | null = null;
    private lastTick: number;
    private preparedRun: string | null = null;
    private arrival: C.HideoutSnapshot['arrival'] = null;
    private importPreview: { text: string; token: string; rev: number } | null = null;
    private serial = 0;
    constructor(private readonly state: SessionState, private readonly saves: SaveSession, private readonly now = () => Date.now(), private readonly activityAllowed = () => true) {
        this.observed = saves.revision; this.previous = this.capture(); this.lastTick = now();
    }
    private capture() { return { profile: structuredClone(this.state.save), expansion: this.saves.captureExpansion() }; }
    private emit(event: C.HideoutEvent) {
        for (const listener of [...this.listeners]) { try { listener(structuredClone(event)); } catch { /* A view cannot undo an already durable transaction. */ } }
    }
    private sync(action = 'external') {
        if (this.observed === this.saves.revision || this.publishing) return;
        const initialLoad = this.observed === 0, before = this.previous, after = this.capture();
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
    }
    private guard(base = true, retry = false): C.Result | null {
        if (this.disposed || this.publishing) return fail('locked');
        if (this.state.conflict || !this.saves.ownsStorage) return fail('conflict', '存档已由另一窗口接管，本页不能写入。');
        if (!retry && (!this.state.storageOK || this.pending)) return fail('storage', '请先重试保存或导出备份。');
        if (this.state.pendingSettlement) return fail('locked', '结算尚未保存。');
        if (base && (this.state.state !== 'hideout' || this.state.save.activeRun || this.state.expansion?.version !== 2)) return fail('locked');
        return null;
    }
    private failed(action: string): C.Result {
        this.publishing = true; try { this.emit({ type: 'save-failed', action }); } finally { this.publishing = false; }
        return fail(this.state.conflict ? 'conflict' : 'storage', this.state.storageError || '存档未写入，操作已回滚。');
    }
    private applySamples(draft: ExpansionDraft) {
        for (const sample of this.samples) B.practice(draft.expansion, sample.attribute, sample.from, sample.to, sample.seconds, sample.now);
    }
    private transaction(action: string, apply: (draft: ExpansionDraft) => boolean | C.Result, keep = false): C.Result {
        this.sync(); const blocked = this.guard(); if (blocked) return blocked;
        let rejection: C.Result = fail('rule'), candidate: ExpansionDraft | null = null;
        let ticket: ExpansionTransaction | null;
        try { ticket = this.saves.prepareExpansionMutation(draft => {
            this.applySamples(draft);
            const result = apply(draft);
            if (result === false || typeof result === 'object' && !result.ok) { rejection = result === false ? fail('rule') : result; return false; }
            if (['move', 'quick-move', 'secure', 'equip', 'unequip', 'shop', 'quest', 'stash-upgrade'].includes(action)) D.grantRelief(draft.profile);
            candidate = structuredClone(draft); return true;
        }); } catch { return fail('rule', '操作数据无效，当前进度未改动。'); }
        if (!ticket) return rejection;
        const result = this.saves.commitExpansionMutation(ticket);
        if (result !== 'committed') {
            if (result === 'save-failed') { if (keep) { this.pending = { ticket, draft: candidate! }; this.saves.retainExpansionTransaction(ticket); } return this.failed(action); }
            return fail(result === 'rejected' ? 'stale' : 'conflict');
        }
        this.samples = []; this.lastTick = this.now(); this.sync(action); return ok();
    }
    enter(): C.Result {
        const blocked = this.guard(false); if (blocked) return blocked;
        if (this.state.save.activeRun || !['menu', 'hideout'].includes(this.state.state)) return fail('locked', '请先恢复或结束原行动。');
        if (!this.saves.ensureRpg()) return this.failed('upgrade');
        this.state.state = 'hideout'; this.lastTick = this.now(); this.sync('enter'); return ok();
    }
    snapshot(): C.HideoutSnapshot {
        this.sync(); const s = this.state, e = structuredClone(s.expansion) ?? newExpansion(this.now()), limits = derivedLimits(e), effective = effectiveAttributes(e);
        return structuredClone({ rev: this.saves.revision, profile: s.save,
            base: { ...e.base, training: { ...e.base.training, windowLeft: Math.max(0, 600000 - Math.max(0, this.now() - e.base.training.startedAt)) / 1000 } },
            body: { ...e.body, hpMax: limits.hp, staminaMax: limits.stamina, carry: limits.carry,
                effects: Object.entries(e.body.effects).filter(([, seconds]) => seconds > 0).map(([name, seconds]) => ({ name, seconds })),
                attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, { base: e.growth.permanent[a], effective: effective[a], progress: e.growth.progress[a] }])) as C.BodyView['attributes'] },
            power: s.save.quests.repair ? 'restored' : 'emergency',
            storage: { ok: s.storageOK, conflict: s.conflict || !this.saves.ownsStorage, pendingSettlement: !!s.pendingSettlement, pendingBase: !!this.pending || !!this.samples.length, upgradeRequired: s.expansion?.version !== 2 },
            day: s.save.stats.runs + 1, phase: s.state === 'hideout' && this.preparedRun && s.save.activeRun?.runId === this.preparedRun ? 'departing' : s.state, arrival: this.arrival });
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
        return this.transaction('quick-move', d => D.transferItem(d.profile[from], d.profile[from === 'stash' ? 'bag' : 'stash'], uid) || fail('space'));
    }
    secure(from: C.Source, uid: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!source(from)) return fail('rule');
        return this.transaction('secure', d => D.transferItem(d.profile[from], d.profile[from === 'safe' ? 'bag' : 'safe'], uid) || fail('space'));
    }
    equip(from: C.Source, uid: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!['stash', 'bag'].includes(from) || !this.state.save[from].items.some(i => i.uid === uid)) return fail('rule');
        return this.transaction('equip', d => D.equip(d.profile, uid));
    }
    unequip() { return this.transaction('unequip', d => D.unequip(d.profile) || fail('space')); }
    useSupply(from: C.Source, uid: string): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!source(from)) return fail('rule');
        return this.transaction('supply', d => {
            const inv = d.profile[from], item = inv.items.find(i => i.uid === uid);
            if (!item || !useRpgItem(d.expansion, item.id)) return false;
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
    cancel(batchId: string) { return this.transaction('cancel', d => d.expansion.base.queue.findIndex(b => b.id === batchId) <= 0 ? fail('rule') : B.cancelProduction(d.profile, d.expansion, batchId) || fail('space')); }
    claim(batchId: string, target: C.Source): C.Result { const blocked = this.guard(); if (blocked) return blocked; return source(target) ? this.transaction('claim', d => !d.expansion.base.completed.some(b => b.id === batchId) ? fail('stale') : B.claimProduction(d.profile, d.expansion, batchId, target) || fail('space')) : fail('rule'); }
    selectPractice(attribute: C.Attribute): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!ATTRIBUTES.includes(attribute)) return fail('rule');
        return this.transaction('practice-select', d => { if (!d.expansion.base.facilities.training) return false; d.expansion.base.training.attribute = attribute; return true; });
    }
    practice(sample: C.PracticeSample): void {
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
    retrySave(): C.Result {
        const blocked = this.guard(false, true); if (blocked) return blocked;
        if (this.pending) {
            const result = this.saves.commitExpansionMutation(this.pending.ticket);
            if (result === 'rejected') return fail('stale', '旧入口已改变存档，请先导出待保存进度。');
            if (result !== 'committed') return this.failed('retry');
            this.pending = null; this.samples = []; this.lastTick = this.now(); this.sync('retry'); return ok();
        }
        if (!this.saves.persist()) return this.failed('retry'); this.sync('retry'); return ok();
    }
    exportBackup(): string {
        const record = this.saves.backupRecord(); if (!record) return this.saves.original() ?? '';
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
        if (!record.profile.activeRun && record.expansion?.version === 1) {
            record.expansion.version = 2; record.expansion.charm = null; record.expansion.awards = [];
            record.expansion.base.cursor = Math.max(record.expansion.base.cursor, this.now());
        }
        if (!this.saves.importRecord(record)) return this.failed('import');
        this.importPreview = null; this.samples = []; this.arrival = null; this.preparedRun = null;
        if (this.state.save.activeRun) this.state.state = 'menu';
        this.sync('import'); return ok();
    }
    setVolume(volume: number): C.Result {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) return fail('rule');
        return this.transaction('volume', d => { d.profile.settings.volume = volume; return true; });
    }
    departure() {
        const s = this.snapshot(), p = s.profile, weapon = D.WEAPONS[p.equipment.weapon || 'knife'];
        const weight = D.weight(p.bag) + D.weight(p.safe) + D.ITEMS.knife.weight + (p.equipment.weapon ? D.ITEMS[p.equipment.weapon].weight : 0)
            + (weapon.ammo ? D.ITEMS[weapon.ammo].weight * p.equipment.ammo : 0) + (this.state.expansion?.charm ? D.ITEMS[this.state.expansion.charm.id].weight : 0);
        return { warnings: [...departureWarnings(s.profile), ...(weight > s.body.carry ? ['携行重量超过当前负重'] : []), ...(s.body.hp < s.body.hpMax ? ['生命尚未恢复'] : [])], weight, carry: s.body.carry };
    }
    deploy(req: { world: C.RunWorld; seed: string }): C.Result & { runId?: string } {
        const blocked = this.guard(); if (blocked) return blocked;
        if (!req || !['coast', 'buildings', 'mall'].includes(req.world) || typeof req.seed !== 'string' || req.seed.length > 200) return fail('rule');
        if (this.samples.length) { const flushed = this.transaction('checkpoint', () => true, true); if (!flushed.ok) return flushed; }
        const seed = generateRun(req.seed.trim() || this.now()).seed;
        if (!this.saves.beginRun(seed, req.world === 'mall' ? 'mall' : req.world === 'buildings')) return this.failed('deploy');
        this.preparedRun = this.state.save.activeRun!.runId!; this.arrival = null; this.setActivity(false); this.sync('deploy');
        return { ok: true, runId: this.preparedRun };
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
        this.arrival = { runId: terminal.runId, summary: structuredClone(this.state.result) }; this.state.state = 'hideout'; this.lastTick = this.now(); this.sync('return'); return ok();
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
        let cart = Shop.createCart(this.state.save, merchant, true), confirmation: { token: string; key: string } | null = null;
        const warnings = () => Shop.saleWarnings(this.state.save, cart).map(w => `${w.quest}：${D.ITEMS[w.id].name}还需${w.needed}，出售后剩${w.remaining}`);
        const key = () => JSON.stringify([cart, warnings(), this.state.save.quests]);
        const validSource = (value: string) => ['merchant', 'buy', 'sell', 'stash'].includes(value);
        return {
            view: () => structuredClone({ merchant, ...D.MERCHANTS[merchant], catalog: cart.catalog, buy: cart.buy, sell: cart.sell, stash: cart.stash, totals: Shop.cartTotals(cart), dirty: Shop.cartDirty(cart), warnings: warnings(), placement: 'automatic-stash' }),
            placementError: (from, to, uid, x, y) => validSource(from) && validSource(to) ? Shop.shopPlacementError(cart, from, to, uid, x, y) : '无效容器。',
            place: (from, to, uid, x, y) => {
                const blocked = this.guard(); if (blocked) return blocked;
                if (!validSource(from) || !validSource(to)) return fail('rule');
                const message = Shop.shopPlacementError(cart, from, to, uid, x, y); if (message) return fail('rule', message);
                confirmation = null; return Shop.moveShopItem(cart, from, to, uid, x, y) ? ok() : fail('rule');
            },
            settle: token => {
                const blocked = this.guard(); if (blocked) return blocked;
                if (JSON.stringify(this.state.save.stash) !== cart.original) return fail('stale', '仓库已改变，请重置购物车。');
                const list = warnings();
                if (list.length && (!confirmation || confirmation.token !== token || confirmation.key !== key())) {
                    confirmation = { token: `sale-${++this.serial}`, key: key() };
                    return { ok: false, reason: 'rule', message: '出售会消耗未完成任务，请确认。', confirmation: { kind: 'quest-sale', token: confirmation.token, warnings: list } };
                }
                const result = this.transaction('shop', d => { const r = Shop.settleCartResult(d.profile, cart, true); return r.ok ? true : fail(r.reason); });
                if (result.ok) { cart = Shop.createCart(this.state.save, merchant, true); confirmation = null; } return result;
            },
            reset: () => { if (!this.guard()) { cart = Shop.createCart(this.state.save, merchant, true); confirmation = null; } },
        };
    }
}
