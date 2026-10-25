import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { RealHideoutRuntime, type PerkBoard, type Result } from '../src/hideout-runtime';
import { derivedLimits, type Attribute } from '../src/expansion-state';
import { BREATH_MAX, PERK_IDS, perkModifiers, type PerkId, type PerkModifiers } from '../src/perks';
import { ATTRIBUTE_NAMES, PERK_TEXT, choicePreview, critContext, critView, defaultPerkAttribute, perkDone, perkFailure, perkPanel, perkPendingName, perkRetried, perkWaiting, resetPreview, type CritContext } from '../src/perk-copy';
import { factoryState } from '../src/gunsmith/instance';

// CP-T09 (#77): the perk copy and the view models both base screens draw (docs/CRITICAL-PERK-DESIGN.md sections 2.3,
// 3 and 5). The names are the spec's; every number in an effect line must be the rule's number from perkModifiers.
const SPEC_NAMES: Record<PerkId, string> = {
    'strength-15-a': '负重行家', 'strength-15-b': '长途奔袭', 'strength-20-a': '重装步伐', 'strength-20-b': '耐力储备',
    'strength-25-a': '近身猛击', 'strength-25-b': '快速回气', 'strength-30-a': '搬运大师', 'strength-30-b': '持久奔袭',
    'constitution-15-a': '强健体魄', 'constitution-15-b': '医疗适应', 'constitution-20-a': '凝血体质', 'constitution-20-b': '补给吸收',
    'constitution-25-a': '耐污体质', 'constitution-25-b': '稳定心神', 'constitution-30-a': '坚韧躯体', 'constitution-30-b': '高效救护',
    'technique-15-a': '屏息狙击', 'technique-15-b': '压枪高手', 'technique-20-a': '致命直觉', 'technique-20-b': '熟练装填',
    'technique-25-a': '要害打击', 'technique-25-b': '稳固握持', 'technique-30-a': '神射手', 'technique-30-b': '装填大师',
};
/** The one modifier a perk changes (each of the 24 changes exactly one: perk-rules.test.ts). */
function changed(id: PerkId): [keyof PerkModifiers, PerkModifiers[keyof PerkModifiers]] {
    const base = perkModifiers([]), with1 = perkModifiers([id]);
    const keys = (Object.keys(base) as (keyof PerkModifiers)[]).filter(k => JSON.stringify(base[k]) !== JSON.stringify(with1[k]));
    assert.equal(keys.length, 1, id);
    return [keys[0], with1[keys[0]]];
}

test('the 24 perks carry the spec names, each id once, with an effect line', () => {
    assert.deepEqual(Object.keys(PERK_TEXT).sort(), [...PERK_IDS].sort());
    for (const id of PERK_IDS) {
        assert.equal(PERK_TEXT[id].name, SPEC_NAMES[id], id);
        assert.ok(PERK_TEXT[id].effect.length > 0, id);
    }
    assert.equal(new Set(PERK_IDS.map(id => PERK_TEXT[id].name)).size, 24);
    assert.deepEqual(ATTRIBUTE_NAMES, { strength: '力量', constitution: '体质', technique: '技巧' });
});

test('every effect line states the number perkModifiers applies', () => {
    for (const id of PERK_IDS) {
        const [kind, value] = changed(id), effect = PERK_TEXT[id].effect;
        if (kind === 'hp' || kind === 'stamina' || kind === 'carry') assert.ok(effect.includes(`+${value}`), `${id}: ${effect}`);
        else if (kind === 'crit') {
            const [source] = value as { chance: number }[];
            assert.ok(effect.includes(`独立 ${source.chance * 100}% 暴击来源`), `${id}: ${effect}`);
        } else if (kind === 'critMultiplier') assert.ok(effect.includes(`${value}`), `${id}: ${effect}`);
        else if (kind === 'breath') assert.ok(effect.includes(`${BREATH_MAX * 100}%`) && effect.includes('每秒增加 10 个百分点'), `${id}: ${effect}`);
        else assert.ok(effect.includes(`×${(value as number).toFixed(2)}`), `${id}: ${effect}`);
        // An independent source is never written as points added to the final chance.
        if (kind === 'crit') assert.doesNotMatch(effect, /\+|个百分点/, id);
    }
    // The limit, multiplier and crit kinds name what they change (the scope).
    for (const [id, words] of [['strength-15-a', '负重上限'], ['strength-20-b', '耐力上限'], ['constitution-15-a', '生命上限'], ['strength-15-b', '冲刺耐力消耗'],
        ['constitution-20-a', '流血'], ['technique-15-b', '后坐'], ['technique-20-b', '换弹时间'], ['technique-25-a', '暴击伤害倍率']] as const)
        assert.ok(PERK_TEXT[id].effect.includes(words), id);
});

const NOW = 1800000000000;
/** A real Runtime on an in-memory origin, entered at the station (v3), with permanent levels, perks and cash set. */
function station(permanent: Record<Attribute, number>, perks: PerkId[] = [], cash = 1200, more?: (d: ExpansionDraft) => void) {
    let failing = false;
    const data = new Map<string, string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing) throw new Error('quota'); data.set(k, v); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => NOW);
    assert.ok(saves.initialize());
    const runtime = new RealHideoutRuntime(state, saves, () => NOW);
    assert.ok(runtime.enter().ok);
    const ticket = saves.prepareExpansionMutation(d => {
        Object.assign(d.expansion.growth, { permanent, perks }); d.profile.cash = cash;
        const limits = derivedLimits(d.expansion); d.expansion.body.hp = limits.hp; d.expansion.body.stamina = limits.stamina;
        more?.(d);
    });
    assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    return { runtime, fail: (value = true) => { failing = value; }, ctx: (): CritContext => critContext(runtime.snapshot(), runtime.perkBoard()) };
}
const levels = (strength: number, constitution: number, technique: number) => ({ strength, constitution, technique });
const carbine = (d: ExpansionDraft) => { d.profile.equipment = { weapon: 'carbine', weaponUid: 'test-gun', gun: factoryState(), ammo: 0, ammoRelief: 0, relief: false }; };

test('the board view: locked cards name the permanent level, open cards are buttons, a chosen node shows its pick and closes the other', () => {
    const s = station(levels(26, 10, 15), ['strength-20-b']), board = s.runtime.perkBoard(), v = perkPanel(board, 'strength');
    assert.equal(v.blocked, null);
    assert.deepEqual(v.tiers.map(t => t.tier), [15, 20, 25, 30]);
    assert.deepEqual(v.tiers.map(t => t.cards.map(c => c.state)), [['open', 'open'], ['other', 'chosen'], ['open', 'open'], ['locked', 'locked']]);
    assert.deepEqual(v.tiers[3].cards.map(c => [c.status, c.enabled]), [['永久力量 30 级解锁', false], ['永久力量 30 级解锁', false]]);
    assert.deepEqual(v.tiers[1].cards.map(c => [c.name, c.status, c.enabled]), [['重装步伐', '重置本属性后才能改选', false], ['耐力储备', '已选择', false]]);
    assert.ok(v.tiers[0].cards.every(c => c.enabled && c.status === ''));
    assert.deepEqual(v.tabs.map(t => t.detail), ['26 级 · 已选 1 · 可选 2', '10 级 · 已选 0', '15 级 · 已选 0 · 可选 1']);
    assert.deepEqual(v.reset, { label: '花费 ¥500 重置力量全部 Perk', enabled: true, reason: null });
    // Nothing chosen, and too little cash, disable the reset with the reason.
    assert.deepEqual(perkPanel(board, 'technique').reset, { label: '花费 ¥500 重置技巧全部 Perk', enabled: false, reason: '技巧还没有已选的 Perk。' });
    const poor = perkPanel(station(levels(20, 10, 10), ['strength-20-b'], 499).runtime.perkBoard(), 'strength').reset;
    assert.deepEqual(poor, { label: '花费 ¥500 重置力量全部 Perk', enabled: false, reason: '现金不足：重置需要 ¥500，现有 ¥499。' });
    // A panel opens on the first attribute with a node to choose.
    assert.equal(defaultPerkAttribute(board), 'strength');
    assert.equal(defaultPerkAttribute(station(levels(10, 10, 15)).runtime.perkBoard()), 'technique');
    assert.equal(defaultPerkAttribute(station(levels(10, 10, 10)).runtime.perkBoard()), 'strength');
});

test('a blocked board disables every open card and the reset, with the reason', () => {
    const board: PerkBoard = station(levels(20, 10, 10), ['strength-20-b']).runtime.perkBoard();
    for (const [reason, text] of [['storage', '上次的更改还没写入存档：请先重试保存或导出备份。'], ['conflict', '存档已由另一个窗口接管，本页不能更改 Perk。'],
        ['locked', '出击准备、行动中或结算还没保存时不能更改 Perk。']] as const) {
        const block = { reason, message: '' }, blocked: PerkBoard = { blocked: block, attributes: Object.fromEntries(Object.entries(board.attributes)
            .map(([a, view]) => [a, { ...view, reset: { ...view.reset, blocked: block } }])) as PerkBoard['attributes'] };
        const v = perkPanel(blocked, 'strength');
        assert.equal(v.blocked, text);
        assert.ok(v.tiers.flatMap(t => t.cards).every(c => !c.enabled));
        assert.deepEqual(v.reset, { label: '花费 ¥500 重置力量全部 Perk', enabled: false, reason: text });
    }
});

test('the static critical display: the design examples, one independent source per row, knife and empty hand not applicable', () => {
    const ctx = (weapon: string | null, perks: PerkId[] = [], technique = 10, focus = false) => critView({ technique, weapon, focus, perks });
    assert.deepEqual([ctx('pistol').total, ctx('shotgun').total, ctx('carbine').total], ['6.90%', '4.94%', '9.84%']);
    assert.deepEqual(ctx('carbine').rows, [{ label: '角色 · 技巧 10', text: '独立 2.00% 暴击来源' }, { label: '半自动卡宾枪', text: '独立 8.00% 暴击来源' }]);
    const full = ctx('carbine', ['technique-20-a', 'technique-25-a', 'technique-30-a'], 30, true);
    assert.equal(full.title, '枪械暴击 · 半自动卡宾枪');
    assert.deepEqual(full.rows.map(r => r.label), ['角色 · 技巧 30', '半自动卡宾枪', '致命直觉', '神射手', '专注剂']);
    assert.deepEqual(full.rows.map(r => r.text), ['独立 5.00% 暴击来源', '独立 8.00% 暴击来源', '独立 5.00% 暴击来源', '独立 10.00% 暴击来源', '独立 5.00% 暴击来源']);
    assert.equal(full.total, `${((1 - .95 * .92 * .95 * .9 * .95) * 100).toFixed(2)}%`);
    assert.ok(full.notes.includes('暴击伤害 ×1.7（要害打击）'));
    assert.ok(ctx('pistol').notes.includes('暴击伤害 ×1.5'));
    for (const row of full.rows) assert.doesNotMatch(row.text, /\+|个百分点/);
    // The breath perk adds no static source (no target outside a raid); the panel says it counts on its target only.
    const breath = ctx('carbine', ['technique-15-a'], 15);
    assert.equal(breath.total, '10.53%'); assert.equal(breath.rows.length, 2);
    assert.ok(breath.notes.some(n => n.startsWith('屏息狙击另计')));
    for (const weapon of [null, 'knife']) assert.deepEqual(ctx(weapon), { title: '枪械暴击：不适用', total: null, rows: [], notes: ['没有装备枪械；匕首不随机暴击。'] });
    // The context reads effective technique (doses included), the gun in hand, focus and the chosen perks.
    const s = station(levels(10, 10, 20), ['technique-20-a'], 1200, d => { carbine(d); d.expansion.body.effects.focus = 60; d.expansion.body.effects.technique = 100; });
    assert.deepEqual(s.ctx(), { technique: 25, weapon: 'carbine', focus: true, perks: ['technique-20-a'] });
});

test('a choice preview lists scope and value changes, says a raised limit does not refill, and how to change it later', () => {
    const hp = station(levels(10, 15, 10)), preview = hp.runtime.previewPerk('constitution-15-a');
    assert.ok(preview.ok && preview.preview);
    const v = choicePreview(preview.preview!, hp.ctx());
    assert.equal(v.title, '选择「强健体魄」'); assert.equal(v.subtitle, '体质 15 级 · 二选一');
    assert.deepEqual(v.lines, ['生命上限 +20']); assert.equal(v.note, null);
    assert.deepEqual(v.changes, ['生命上限 115 → 135']);
    assert.deepEqual(v.notes, ['当前生命 115 不变：上限提高不会补满，之后照常恢复。', '选择免费，写入存档后生效。', '选定后，只有花费 ¥500 重置体质全部 Perk 才能改选。']);
    assert.equal(v.confirm, '确认选择');
    // Multipliers of one kind multiply: the second recoil perk shows 0.80 -> 0.68.
    const recoil = station(levels(10, 10, 25), ['technique-15-b']), second = choicePreview(recoil.runtime.previewPerk('technique-25-b').preview!, recoil.ctx());
    assert.deepEqual(second.changes, ['枪械后坐力 ×0.80 → ×0.68']);
    assert.deepEqual([second.lines, second.note], [['枪械后坐力 ×0.85'], '只减每发后坐，不改固有散布、射速和霰弹分布。']);
    const sprint = station(levels(30, 10, 10), ['strength-15-b']), both = sprint.runtime.previewPerk('strength-30-b');
    assert.deepEqual(choicePreview(both.preview!, sprint.ctx()).changes, ['冲刺耐力消耗 ×0.88 → ×0.7216']);
    // A critical source: the new independent source and the gun's static chance before and after (technique 20).
    const crit = station(levels(10, 10, 20), [], 1200, carbine), sure = crit.runtime.previewPerk('technique-20-a');
    assert.deepEqual(choicePreview(sure.preview!, crit.ctx()).changes, ['新增一个独立 5% 暴击来源（致命直觉）', '半自动卡宾枪暴击 11.22% → 15.66%']);
    const knife = (d: ExpansionDraft) => { d.profile.equipment = { weapon: null, weaponUid: null, gun: null, ammo: 0, ammoRelief: 0, relief: false }; };
    const bare = station(levels(10, 10, 25), [], 1200, knife), multiplier = bare.runtime.previewPerk('technique-25-a'), late = bare.runtime.previewPerk('technique-20-a');
    assert.ok(multiplier.ok && late.ok);
    assert.deepEqual(choicePreview(multiplier.preview!, bare.ctx()).changes, ['暴击伤害倍率 1.5 → 1.7']);
    assert.deepEqual(choicePreview(late.preview!, bare.ctx()).changes, ['新增一个独立 5% 暴击来源（致命直觉）', '装备枪械后计入；匕首不随机暴击。']);
});

test('a reset preview lists the fee, the perks removed, the lower limits and the cut, and that nothing else changes', () => {
    const s = station(levels(20, 10, 10), ['strength-15-a', 'strength-20-b'], 1200), preview = s.runtime.previewPerkReset('strength');
    assert.ok(preview.ok && preview.preview);
    const v = resetPreview(preview.preview!, s.ctx());
    assert.equal(v.title, '重置力量 Perk'); assert.equal(v.subtitle, '费用 ¥500'); assert.equal(v.confirm, '支付 ¥500 并重置');
    assert.deepEqual(v.lines, ['现金 ¥1,200 → ¥700', '移除：负重行家（15 级）、耐力储备（20 级）']);
    assert.deepEqual(v.changes, ['耐力上限 140 → 120', '负重上限 34.0 kg → 30.0 kg', '当前耐力 140 → 120（裁去超出新上限的部分，不算受伤，也不计训练）']);
    assert.ok(v.notes.some(n => n.includes('不降低永久等级和训练进度')) && v.notes.some(n => n.includes('不会补满')));
});

test('failure messages never claim success; a storage failure says whether this change waits for the retry', () => {
    const reasons = ['stale', 'storage', 'conflict', 'funds', 'no-effect', 'locked', 'rule'] as const;
    for (const kind of ['choice', 'reset'] as const) for (const reason of reasons) {
        const text = perkFailure(reason, kind);
        assert.doesNotMatch(text, /已选择|已重置|已写入/, `${kind} ${reason}`);
        assert.match(text, /没有|不能|还没/, `${kind} ${reason}`);
    }
    assert.equal(perkFailure('storage', 'choice', true), '存档没有写入：这次选择保留在本页，重试保存成功后才生效。');
    assert.equal(perkFailure('storage', 'reset', true), '存档没有写入：重置保留在本页，重试保存成功后才扣款并生效。');
    assert.equal(perkFailure('storage', 'choice'), '上次的更改还没写入存档，这次没有生效。请先重试保存或导出备份。');
    // The waiting change is named until the retry writes it; only then is it reported as in effect.
    assert.equal(perkWaiting(perkPendingName('choice', 'strength-15-b')), '「长途奔袭」没能写入存档，还没有生效；它保留在本页，重试保存成功后才生效，导出的备份也包含它。');
    assert.equal(perkRetried(perkPendingName('reset', 'strength')), '已重新保存，力量 Perk 重置已生效。');
    assert.equal(perkDone('choice', 'strength-15-b'), '已选择「长途奔袭」，已写入存档。');
    // A real refusal from the Runtime maps to its message.
    const s = station(levels(20, 10, 10), [], 1200), refused: Result = s.runtime.previewPerkReset('strength');
    assert.ok(!refused.ok); assert.equal(perkFailure(refused.reason, 'reset'), '本属性没有已选的 Perk，没有扣款。');
});
