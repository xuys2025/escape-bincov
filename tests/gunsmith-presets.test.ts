/** Gunsmith presets (#28 M2-07): the shape and its checks, the profile field, the Runtime's writes, and applying one. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { decodeStoredProfile } from '../src/profile-codec';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { planGunEdit } from '../src/gunsmith/edit';
import { PRESET_LIMIT, defaultPresetName, presetBuild, presetName, presetOf, validPreset, validPresets, type GunPreset } from '../src/gunsmith/presets';
import { presetEdits } from '../src/gunsmith/bench';
import { gun, hold, node, put, reason, yard } from './fixtures/workbench';

const STEADY: GunPreset['parts'] = [{ id: 'H01', slot: 'handguard', children: [{ id: 'F01', slot: 'under', children: [] }] }, { id: 'S02', slot: 'stock', children: [] }];
const preset = (over: Partial<GunPreset> = {}): GunPreset => ({ id: 'preset-1', name: '稳定', gun: 'mb4a1', parts: structuredClone(STEADY), ...over });

test('a preset keeps ids and slots only; names are trimmed and bounded; the checks refuse what the type does not allow', () => {
    const parts = [node('h', 'H01', 'handguard', [node('f', 'F01', 'under', [], true)]), node('s', 'S02', 'stock')];
    assert.deepEqual(presetOf(parts), STEADY, 'no uids, no relief flags');
    assert.deepEqual(presetBuild('mb4a1', STEADY).parts.map(p => [p.uid, p.id, p.parent]), [['p0', 'H01', null], ['p1', 'F01', 'p0'], ['p2', 'S02', null]]);
    assert.deepEqual(['  轻快  配装 ', '', '   ', '一二三四五六七八九十一二三四五六', '一二三四五六七八九十一二三四五六七', 'a\u0007b', 3].map(presetName),
        ['轻快 配装', null, null, '一二三四五六七八九十一二三四五六', null, null, null]);
    assert.ok(validPreset(preset()));
    const bad: [string, unknown][] = [
        ['an extra key', { ...preset(), relief: true }], ['an unknown gun', preset({ gun: 'm4a1' as never })], ['the knife', preset({ gun: 'knife' as never })],
        ['an untrimmed name', preset({ name: ' 稳定' })], ['an empty name', preset({ name: '' })], ['an empty id', preset({ id: '' })],
        ['a part the gun cannot take', preset({ parts: [{ id: 'H05', slot: 'handguard', children: [] }] })],
        ['a foregrip without its rail', preset({ parts: [{ id: 'F01', slot: 'under', children: [] }] })],
        ['an unknown part', preset({ parts: [{ id: 'Z99', slot: 'top', children: [] }] })],
        ['a node with a uid', preset({ parts: [{ id: 'S02', slot: 'stock', children: [], uid: 'x' } as never] })],
        ['thirteen parts', preset({ parts: Array.from({ length: 13 }, () => ({ id: 'O03', slot: 'top', children: [] })) })],
    ];
    for (const [why, value] of bad) assert.equal(validPreset(value), false, why);
    // At most PRESET_LIMIT per gun type, distinct ids; other types count apart.
    const many = (n: number, gunId: GunPreset['gun'] = 'mb4a1') => Array.from({ length: n }, (_, i) => preset({ id: `${gunId}-${i}`, gun: gunId, parts: [] }));
    assert.ok(validPresets([...many(PRESET_LIMIT), ...many(PRESET_LIMIT, 'gb17')]));
    assert.equal(validPresets(many(PRESET_LIMIT + 1)), false);
    assert.equal(validPresets([preset(), preset({ name: '另一套' })]), false, 'duplicate ids');
    assert.equal(defaultPresetName([preset({ name: 'M4A1 配装 1' }), preset({ id: 'b', name: 'M4A1 配装 3' })], 'mb4a1'), 'M4A1 配装 2');
    assert.equal(defaultPresetName([], 'pistol'), '旧式手枪 配装 1');
});

test('the profile field: kept by the strict decoder, refused empty or invalid or in the old format, absent when there are none', () => {
    const p = D.newSave();
    assert.equal(Object.hasOwn(decodeStoredProfile(p), 'gunPresets'), false, 'no presets, no field');
    const withPresets = { ...p, gunPresets: [preset()] };
    assert.deepEqual(decodeStoredProfile(withPresets).gunPresets, [preset()]);
    for (const value of [[], [preset({ name: '' })], {}, [preset(), preset()]]) assert.throws(() => decodeStoredProfile({ ...p, gunPresets: value }), /存档格式不支持/);
    const old = { ...structuredClone(p), version: 2, equipment: { weapon: null, relief: false, ammo: 0, ammoRelief: 0 } } as Record<string, unknown>;
    assert.ok(decodeStoredProfile(old));
    assert.throws(() => decodeStoredProfile({ ...old, gunPresets: [preset()] }), /存档格式不支持/);
});

test('a session record whose profile holds a field the client does not know is refused, not rewritten (how an older client meets presets)', () => {
    const f = yard(() => {});
    const record = JSON.parse(f.raw);
    assert.ok(decodeSession(JSON.stringify(record)));
    record.profile.futureField = [1];
    assert.throws(() => decodeSession(JSON.stringify(record)));
});

const stocked = (p: D.SaveDataV1) => {
    hold(p, 'm4', 'mb4a1', [node('h01', 'H01', 'handguard')], 28);
    put(p.stash, { uid: 'f01', id: 'F01' }); put(p.stash, { uid: 's02', id: 'S02' }); put(p.bag, gun('m4b', 'mb4a1', [node('o03', 'O03', 'top')]));
};

test('the Runtime saves, renames and deletes presets in one write each; the limit, names and a failed write', () => {
    const f = yard(stocked);
    const before = f.writes, saved = f.runtime.savePreset('mb4a1', STEADY);
    assert.deepEqual(saved, { ok: true, message: '预设已保存。', id: 'preset-1' });
    assert.equal(f.writes, before + 1);
    assert.deepEqual(f.record.profile.gunPresets, [{ id: 'preset-1', name: 'M4A1 配装 1', gun: 'mb4a1', parts: STEADY }]);
    assert.equal(f.runtime.savePreset('mb4a1', [], '  空枪 ').id, 'preset-2');
    assert.equal(f.record.profile.gunPresets![1].name, '空枪');
    assert.equal(reason(f.runtime.savePreset('mb4a1', [], '')), 'rule');
    assert.equal(reason(f.runtime.savePreset('mb4a1', [{ id: 'H05', slot: 'handguard', children: [] }])), 'rule');
    assert.equal(reason(f.runtime.savePreset('knife', [])), 'rule');
    for (let i = 3; i <= PRESET_LIMIT; i++) assert.ok(f.runtime.savePreset('mb4a1', []).ok);
    const full = f.runtime.savePreset('mb4a1', []);
    assert.deepEqual([reason(full), !full.ok && full.message], ['rule', `每种枪最多存 ${PRESET_LIMIT} 套预设，先删掉一套。`]);
    assert.ok(f.runtime.savePreset('gb17', []).ok, 'another type counts apart');
    assert.ok(f.runtime.renamePreset('preset-1', '稳定').ok);
    assert.equal(f.record.profile.gunPresets!.find(p => p.id === 'preset-1')!.name, '稳定');
    assert.equal(reason(f.runtime.renamePreset('nope', 'x')), 'missing-item');
    // A failed write keeps nothing; the retry is the yard's.
    const raw = f.raw; f.fail();
    assert.equal(reason(f.runtime.deletePreset('preset-1')), 'storage');
    assert.equal(f.raw, raw); assert.ok(f.state.save.gunPresets!.some(p => p.id === 'preset-1'));
    f.fail(false); assert.ok(f.runtime.retrySave().ok);
    // Deleting the last one leaves no field.
    for (const p of f.state.save.gunPresets!) assert.ok(f.runtime.deletePreset(p.id).ok);
    assert.equal(Object.hasOwn(f.record.profile, 'gunPresets'), false);
    assert.equal(Object.hasOwn(JSON.parse(f.raw).profile, 'gunPresets'), false);
    assert.equal(JSON.parse(f.data.get(SESSION_KEY)!).profile.gunPresets, undefined);
});

test('applying a preset takes this gun\'s parts and loose ones, never another gun\'s; missing parts are listed', () => {
    const f = yard(stocked), p = f.state.save;
    const plan = presetEdits(p, 'm4', STEADY)!;
    assert.deepEqual(plan.missing, []);
    // H01 stays (taken off and put back in its place), F01 and S02 come from the stash.
    assert.deepEqual(plan.edits, [{ kind: 'remove', uid: 'h01' }, { kind: 'install', uid: 'h01', at: { parent: null, slot: 'handguard' } },
        { kind: 'install', uid: 'f01', at: { parent: 'h01', slot: 'under' } }, { kind: 'install', uid: 's02', at: { parent: null, slot: 'stock' } }]);
    const made = planGunEdit(p, 'm4', plan.edits);
    assert.ok(made.ok);
    assert.deepEqual(presetOf(made.preview.after.parts), STEADY);
    assert.deepEqual(made.preview.installs.map(i => i.uid), ['f01', 's02']);
    assert.deepEqual(made.preview.removals, []);
    // The O03 on the other M4A1 is not taken: a preset with a red dot lacks it.
    const dot = presetEdits(p, 'm4', [{ id: 'O03', slot: 'top', children: [] }])!;
    assert.deepEqual(dot.missing, ['O03']);
    assert.deepEqual(dot.edits.at(-1), { kind: 'install', id: 'O03', at: { parent: null, slot: 'top' } });
    // Children of a missing part follow its placeholder; the whole list is still one planGunEdit accepts as a preview.
    const longRail = presetEdits(p, 'm4', [{ id: 'H02', slot: 'handguard', children: [{ id: 'F01', slot: 'under', children: [] }] }])!;
    assert.deepEqual(longRail.missing, ['H02']);
    const shown = planGunEdit(p, 'm4', longRail.edits);
    assert.ok(!shown.ok && shown.preview && shown.preview.refusal?.code === 'unowned');
    assert.equal(presetEdits(p, 'nope', STEADY), null);
});
