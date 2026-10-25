import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENTS, GUNS, SLOT_NAMES, type GunId } from '../src/gunsmith/catalog';
import { checkInstall, MAX_DEPTH, MAX_PARTS, removalCascade, validateBuild, type Build, type BuildCheck, type InstallCheck, type Part, type Placement,
    type Rejection } from '../src/gunsmith/compat';
import { DOCS, docExpectation } from './fixtures/gunsmith-docs';

const GUN_IDS = Object.keys(GUNS) as GunId[], PART_IDS = Object.keys(ATTACHMENTS);
const bare = (gun: string): Build => ({ gun, parts: [] });
/** Install `ids` in order where checkInstall places them; each one must be accepted. */
function fit(build: Build, ...ids: string[]): Build {
    let b = build;
    for (const id of ids) {
        const r = checkInstall(b, id);
        assert.ok(r.ok, `${b.gun} + ${id}: ${r.ok ? '' : r.reason}`);
        b = { gun: b.gun, parts: [...b.parts, { uid: `${id}-${b.parts.length}`, id, ...r.at }] };
    }
    return b;
}
const uidOf = (b: Build, id: string) => b.parts.find(p => p.id === id)!.uid;
function refused(r: InstallCheck | BuildCheck, code: Rejection, reason: string, why = '') {
    assert.equal(r.ok, false, `${why} should be refused`);
    if (!r.ok) assert.deepEqual({ code: r.code, reason: r.reason }, { code, reason }, why);
}
const placed = (r: InstallCheck, at: Placement, why = '') => assert.deepEqual(r, { ok: true, at }, why);

/** For every gun and attachment: accepted on the bare gun, and accepted once one other part is in first. */
const REACH = (() => {
    const out = new Map<string, { direct: boolean; eventual: boolean }>();
    for (const gun of GUN_IDS) {
        const first = PART_IDS.map(id => ({ id, r: checkInstall(bare(gun), id) }));
        const helpers = first.flatMap(({ id, r }) => r.ok ? [{ gun, parts: [{ uid: 'helper', id, ...r.at }] }] : []);
        for (const { id, r } of first) {
            const direct = r.ok, eventual = direct || helpers.some(b => checkInstall(b, id).ok);
            out.set(`${gun} ${id}`, { direct, eventual });
        }
    }
    return out;
})();

test('all 2000 gun x attachment pairs match the docs, on the bare gun and once a base, handguard or prerequisite is in', () => {
    assert.equal(REACH.size, 2000);
    const wrong: string[] = [];
    for (const gun of DOCS.guns) for (const part of DOCS.parts) {
        const want = docExpectation(gun.id, part.id), got = REACH.get(`${gun.id} ${part.id}`)!;
        if (want.direct !== got.direct || want.eventual !== got.eventual) wrong.push(`${gun.id} ${part.id}: docs ${JSON.stringify(want)}, module ${JSON.stringify(got)}`);
    }
    assert.deepEqual(wrong, []);
});

test('every attachment fits at least one gun in some legal build', () => {
    for (const id of PART_IDS) assert.ok(GUN_IDS.some(gun => REACH.get(`${gun} ${id}`)!.eventual), id);
    for (const gun of GUN_IDS) assert.ok(PART_IDS.filter(id => REACH.get(`${gun} ${id}`)!.eventual).length >= 3, `${gun} has mods to choose from`);
});

test('bases open micro and top slots; A07 also qualifies the carbine for long-range scopes', () => {
    refused(checkInstall(bare('carbine'), 'O03'), 'opener', '需要卡宾顶部基座');
    refused(checkInstall(bare('carbine'), 'O08'), 'opener', '需要卡宾顶部基座');
    const carbine = fit(bare('carbine'), 'A07'), a07 = uidOf(carbine, 'A07');
    for (const id of ['O03', 'O04', 'O05', 'O06', 'O07', 'O08', 'O09', 'O10', 'O11', 'O12']) placed(checkInstall(carbine, id), { parent: a07, slot: 'top' }, id);
    refused(checkInstall(carbine, 'O01'), 'slot', '这把枪没有微型瞄具位');
    for (const [gun, base, reason] of [['pistol', 'A01', '需要旧手枪微型基座'], ['pb226', 'A02', '需要 P226 微型基座'], ['mb1911', 'A03', '需要单排微型基座']]) {
        refused(checkInstall(bare(gun), 'O01'), 'opener', reason, gun);
        const b = fit(bare(gun), base);
        placed(checkInstall(b, 'O02'), { parent: uidOf(b, base), slot: 'micro' }, gun);
        refused(checkInstall(b, 'O03'), 'slot', '这把枪没有顶部导轨', gun);
    }
    placed(checkInstall(bare('gb17'), 'O01'), { parent: null, slot: 'micro' }, 'the G17 has its own micro mount');
    for (const [gun, base, reason] of [['mpb5', 'A04', '需要 MP 顶部基座'], ['shotgun', 'A05', '需要双管顶部基座'], ['mb870', 'A06', '需要泵动顶部基座'],
        ['akb74', 'A08', '需要 AK 侧置基座'], ['akb103', 'A08', '需要 AK 侧置基座'], ['rpkb', 'A08', '需要 AK 侧置基座']]) {
        refused(checkInstall(bare(gun), 'O03'), 'opener', reason, gun);
        placed(checkInstall(fit(bare(gun), base), 'O03'), { parent: `${base}-0`, slot: 'top' }, gun);
    }
});

test('long-range scopes go only on the guns WEAPONS.md qualifies, whatever is installed', () => {
    for (const gun of GUN_IDS) for (const id of ['O08', 'O09', 'O10', 'O11']) {
        const r = checkInstall(bare(gun), id);
        if (!DOCS.longScope.has(gun)) refused(r, 'scope', '这把枪不能装远距瞄具', `${gun} ${id}`);
        else assert.equal(r.ok || r.code === 'opener', true, `${gun} ${id}`);
    }
    refused(checkInstall(fit(bare('mpb5'), 'A04'), 'O08'), 'scope', '这把枪不能装远距瞄具', 'a top base is not a qualification');
    refused(checkInstall(bare('umpb45'), 'O09'), 'scope', '这把枪不能装远距瞄具', 'nor is a native top rail');
    assert.ok(checkInstall(fit(bare('rpkb'), 'A08'), 'O09').ok && checkInstall(bare('mb4a1'), 'O10').ok && checkInstall(bare('mb700'), 'O11').ok);
});

test('handguards open under and side slots as ATTACHMENTS.md counts them; a reason names the handguard or the one in the way', () => {
    refused(checkInstall(bare('mb4a1'), 'F01'), 'opener', '需要 AR 短导轨护木或 AR 长导轨护木');
    refused(checkInstall(bare('mb4a1'), 'T01'), 'opener', '需要 AR 短导轨护木或 AR 长导轨护木');
    refused(checkInstall(bare('mpb5'), 'T01'), 'opener', '需要 MP 紧凑护木或 MP 扩展护木');
    refused(checkInstall(bare('mpb5'), 'F01'), 'opener', '需要 MP 扩展护木');
    refused(checkInstall(bare('carbine'), 'F01'), 'opener', '需要卡宾导轨护木');
    refused(checkInstall(fit(bare('mpb5'), 'H06'), 'F01'), 'blocked', '与当前护木不兼容');
    refused(checkInstall(fit(bare('akb74'), 'H03'), 'T01'), 'blocked', '与当前护木不兼容');
    refused(checkInstall(fit(bare('akb103'), 'H03'), 'F02'), 'blocked', '与当前护木不兼容');
    for (const doc of DOCS.parts.filter(p => p.heading === '护木')) for (const gun of doc.guns!) {
        const b = fit(bare(gun), doc.id), holder = uidOf(b, doc.id);
        if (doc.provides.under) placed(checkInstall(b, 'F01'), { parent: holder, slot: 'under' }, doc.id);
        const sides = doc.provides.side ?? 0, devices = ['T01', 'T05'].slice(0, sides);
        const lit = fit(b, ...devices);
        for (const p of lit.parts.slice(1)) assert.deepEqual([p.parent, p.slot], [holder, 'side'], doc.id);
        if (sides === 1) refused(checkInstall(lit, 'T05'), 'full', '侧导轨已被占用', doc.id);
        if (sides === 2) refused(checkInstall(lit, 'T07'), 'full', '侧导轨已被占用', doc.id);
    }
});

test('prerequisites: M03 on G17 and P226 needs B01, M04 on M1911 needs B02; elsewhere they need nothing', () => {
    for (const gun of ['gb17', 'pb226']) {
        refused(checkInstall(bare(gun), 'M03'), 'needs', '需要九系精瞄枪管组', gun);
        placed(checkInstall(fit(bare(gun), 'B01'), 'M03'), { parent: null, slot: 'muzzle' }, gun);
        assert.ok(checkInstall(bare(gun), 'M01').ok && checkInstall(bare(gun), 'M02').ok, `${gun}: other muzzle parts need no barrel`);
    }
    refused(checkInstall(bare('mb1911'), 'M04'), 'needs', '需要重型手枪接口组');
    assert.ok(checkInstall(fit(bare('mb1911'), 'B02'), 'M04').ok);
    assert.ok(checkInstall(bare('mpb5'), 'M03').ok && checkInstall(bare('vb9'), 'M03').ok && checkInstall(bare('umpb45'), 'M04').ok);
    refused(checkInstall(fit(bare('gb17'), 'B01', 'M02'), 'M03'), 'full', '枪口位已被占用', 'one muzzle device at a time');
    // A loaded tree is held to the same rule.
    refused(validateBuild({ gun: 'pb226', parts: [{ uid: 'm', id: 'M03', parent: null, slot: 'muzzle' }] }), 'needs', '需要九系精瞄枪管组');
});

test('conflicts: one sight per top rail, one foregrip per under rail, a bipod slot only on four guns, a pistol side slot only on three', () => {
    refused(checkInstall(fit(bare('mb4a1'), 'O03'), 'O04'), 'full', '顶部导轨已被占用');
    refused(checkInstall(fit(bare('carbine'), 'A07', 'O12'), 'O08'), 'full', '顶部导轨已被占用');
    refused(checkInstall(fit(bare('gb17'), 'O01'), 'O02'), 'full', '微型瞄具位已被占用');
    refused(checkInstall(fit(bare('mb4a1'), 'H01', 'F01'), 'F07'), 'full', '下导轨已被占用');
    refused(checkInstall(fit(bare('vb9'), 'F06'), 'F03'), 'full', '下导轨已被占用');
    refused(checkInstall(fit(bare('svdb'), 'F08'), 'F08'), 'full', '支撑脚架位已被占用');
    const bipods = ['svdb', 'mb14', 'mb700', 'rpkb'], pistolSides = ['gb17', 'mb1911', 'pb226'];
    for (const gun of GUN_IDS) {
        const bipod = checkInstall(bare(gun), 'F08');
        if (bipods.includes(gun)) placed(bipod, { parent: null, slot: 'bipod' }, gun); else refused(bipod, 'slot', '这把枪没有支撑脚架位', gun);
        for (const id of ['T04', 'T08']) {
            const r = checkInstall(bare(gun), id);
            if (pistolSides.includes(gun)) placed(r, { parent: null, slot: 'pistolSide' }, `${gun} ${id}`); else refused(r, 'slot', '这把枪没有手枪侧挂位', `${gun} ${id}`);
        }
    }
    refused(checkInstall(fit(bare('pistol'), 'A01'), 'T04'), 'slot', '这把枪没有手枪侧挂位', 'a micro base adds no pistol side slot');
    refused(checkInstall(fit(bare('pb226'), 'A02', 'T04'), 'T08'), 'full', '手枪侧挂位已被占用');
    refused(checkInstall(bare('mb870'), 'M11'), 'gun', '不适配这把枪');
    refused(checkInstall(bare('akb74'), 'G09'), 'gun', '不适配这把枪');
});

test('effect quotas: one laser and one light per gun, and a combiner takes both', () => {
    const ak = fit(bare('akb74'), 'H04');
    assert.ok(checkInstall(fit(ak, 'T01'), 'T05').ok, 'a laser and a light side by side');
    for (const [first, second, code] of [['T01', 'T02', 'laser'], ['T03', 'T01', 'laser'], ['T05', 'T06', 'light'], ['T07', 'T05', 'light'],
        ['T01', 'T09', 'laser'], ['T05', 'T09', 'light'], ['T09', 'T02', 'laser'], ['T09', 'T07', 'light'], ['T09', 'T10', 'laser']] as const) {
        refused(checkInstall(fit(ak, first), second), code, code === 'laser' ? '一把枪只能装一个激光' : '一把枪只能装一个灯光', `${first} then ${second}`);
    }
    // The quota is per gun, across rails: a pistol laser and a combiner on the pistol side slot count the same.
    const g17 = fit(bare('gb17'), 'T08');
    refused(checkInstall(g17, 'T04'), 'full', '手枪侧挂位已被占用');
    const h04 = uidOf(ak, 'H04');
    refused(validateBuild({ gun: 'akb74', parts: [...ak.parts, { uid: 'a', id: 'T01', parent: h04, slot: 'side' }, { uid: 'b', id: 'T10', parent: h04, slot: 'side' }] }),
        'laser', '一把枪只能装一个激光', 'a loaded tree');
});

test('tree limits and structure: at most 12 parts, three levels, no cycles, known ids, real parents', () => {
    assert.equal(MAX_PARTS, 12); assert.equal(MAX_DEPTH, 3);
    const part = (uid: string, id: string, parent: string | null, slot = 'side'): Part => ({ uid, id, parent, slot: slot as Part['slot'] });
    refused(validateBuild({ gun: 'mb4a1', parts: Array.from({ length: 13 }, (_, i) => part(`u${i}`, 'T01', null)) }), 'count', '最多装 12 个配件');
    const chain = [part('a', 'H02', null, 'handguard'), part('b', 'H02', 'a'), part('c', 'H02', 'b'), part('d', 'H02', 'c')];
    refused(validateBuild({ gun: 'mb4a1', parts: chain }), 'depth', '配件最多装三层');
    const three = validateBuild({ gun: 'mb4a1', parts: chain.slice(0, 3) });
    assert.ok(!three.ok && three.code !== 'depth', 'three levels pass the depth limit');
    for (const [parts, why] of [
        [[part('a', 'T01', 'b'), part('b', 'T05', 'a')], 'a cycle'],
        [[part('a', 'T01', 'a')], 'its own parent'],
        [[part('a', 'T01', 'nobody')], 'a missing parent'],
        [[part('a', 'O03', null, 'top'), part('a', 'T01', null)], 'a repeated uid'],
        [[part('', 'O03', null, 'top')], 'an empty uid'],
        [[part('a', 'O03', null, 'scope')], 'an unknown slot'],
    ] as const) refused(validateBuild({ gun: 'mb4a1', parts }), 'structure', '配件结构无效', why);
    for (const id of ['Z99', '__proto__', 'toString', 'constructor', 'o01']) refused(validateBuild({ gun: 'mb4a1', parts: [part('a', id, null)] }), 'unknown', '无法识别这个配件', id);
    for (const gun of ['m4a1', 'knife', '__proto__', 'toString', '']) refused(validateBuild(bare(gun)), 'unknown', '无法识别这把枪', gun);
    refused(validateBuild({ gun: 'mb4a1', parts: [part('a', 'O03', null, 'under')] }), 'place', '不能装在这个位置');
    refused(validateBuild({ gun: 'mb4a1', parts: [part('a', 'O03', null, 'top'), part('b', 'O04', null, 'top')] }), 'full', '顶部导轨已被占用');
    refused(validateBuild({ gun: 'mb4a1', parts: [part('a', 'M11', null, 'muzzle')] }), 'gun', '不适配这把枪');
    // An invalid build refuses every install the way validateBuild refuses it.
    refused(checkInstall({ gun: 'mb4a1', parts: chain }, 'O03'), 'depth', '配件最多装三层');
    refused(checkInstall(bare('mb4a1'), 'Z99'), 'unknown', '无法识别这个配件');
    // The fullest legal builds reach 11 parts on two levels; no gun's slots allow more.
    const fullest = {
        akb74: ['A08', 'O09', 'M07', 'B07', 'H04', 'S04', 'P03', 'F07', 'T01', 'T05', 'G08'],
        akb103: ['A08', 'O09', 'M07', 'B07', 'H04', 'S04', 'P03', 'F07', 'T01', 'T05', 'G09'],
        rpkb: ['A08', 'O09', 'M07', 'H10', 'S04', 'P03', 'F07', 'T01', 'T05', 'G09', 'F08'],
    };
    for (const [gun, ids] of Object.entries(fullest)) {
        const b = fit(bare(gun), ...ids);
        assert.ok(validateBuild(b).ok && b.parts.length === 11, gun);
        assert.deepEqual(PART_IDS.filter(id => checkInstall(b, id).ok), [], `${gun}: nothing else fits`);
    }
    for (const gun of Object.values(GUNS)) {
        const native = Object.values(gun.slots).reduce((sum, n) => sum + n, 0);
        const opened = Object.keys(gun.slots).reduce((sum, slot) => sum + Math.max(0, ...Object.values(ATTACHMENTS)
            .filter(a => a.mount === slot && a.guns?.includes(gun.id)).map(a => Object.values(a.provides).reduce((s, n) => s + n, 0))), 0);
        assert.ok(native + opened <= 11, `${gun.id} holds at most ${native + opened} parts`);
    }
});

test('removing a part sends its children, and parts that needed it, to the pending-removal list', () => {
    const carbine = fit(bare('carbine'), 'A07', 'O08', 'H05', 'F01', 'T01', 'M05', 'B09');
    assert.deepEqual(removalCascade(carbine, uidOf(carbine, 'A07')), [uidOf(carbine, 'O08')]);
    assert.deepEqual(removalCascade(carbine, uidOf(carbine, 'H05')), [uidOf(carbine, 'F01'), uidOf(carbine, 'T01')]);
    for (const leaf of ['O08', 'F01', 'T01', 'M05', 'B09']) assert.deepEqual(removalCascade(carbine, uidOf(carbine, leaf)), [], leaf);
    const g17 = fit(bare('gb17'), 'B01', 'M03', 'O01', 'T04');
    assert.deepEqual(removalCascade(g17, uidOf(g17, 'B01')), [uidOf(g17, 'M03')]);
    const m1911 = fit(bare('mb1911'), 'A03', 'O02', 'B02', 'M04', 'G02');
    assert.deepEqual(removalCascade(m1911, uidOf(m1911, 'A03')), [uidOf(m1911, 'O02')]);
    assert.deepEqual(removalCascade(m1911, uidOf(m1911, 'B02')), [uidOf(m1911, 'M04')]);
    const mp5 = fit(bare('mpb5'), 'B03', 'M03', 'H07', 'F02', 'T03', 'T06', 'A04', 'O05');
    assert.deepEqual(removalCascade(mp5, uidOf(mp5, 'B03')), [], 'the MP5 needs no barrel for its suppressor');
    assert.deepEqual(removalCascade(mp5, uidOf(mp5, 'H07')), ['F02', 'T03', 'T06'].map(id => uidOf(mp5, id)));
    assert.deepEqual(removalCascade(mp5, 'not-installed'), []);
    for (const b of [carbine, g17, m1911, mp5]) for (const p of b.parts) {
        const gone = new Set([p.uid, ...removalCascade(b, p.uid)]);
        assert.ok(validateBuild({ gun: b.gun, parts: b.parts.filter(q => !gone.has(q.uid)) }).ok, `${b.gun} without ${p.id}`);
    }
});

test('a placement may be named; it must be a slot of that type with room', () => {
    const m4 = fit(bare('mb4a1'), 'H02'), h02 = uidOf(m4, 'H02');
    placed(checkInstall(m4, 'O03', { parent: null, slot: 'top' }), { parent: null, slot: 'top' });
    placed(checkInstall(m4, 'T01', { parent: h02, slot: 'side' }), { parent: h02, slot: 'side' });
    refused(checkInstall(m4, 'O03', { parent: null, slot: 'under' }), 'place', '不能装在这个位置');
    refused(checkInstall(m4, 'O03', { parent: h02, slot: 'top' }), 'place', '不能装在这个位置');
    refused(checkInstall(m4, 'T01', { parent: 'nobody', slot: 'side' }), 'place', '不能装在这个位置');
    refused(checkInstall(fit(m4, 'F05'), 'F01', { parent: h02, slot: 'under' }), 'full', '下导轨已被占用');
});

/** mulberry32: a small seeded generator, so the walk is the same on every run. */
const seeded = (seed: number) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('seeded walk: checkInstall agrees with validateBuild over every place, and removals leave valid builds', () => {
    const random = seeded(28);
    let accepted = 0, refusedCount = 0;
    for (const gun of GUN_IDS) for (let walk = 0; walk < 10; walk++) {
        let build = bare(gun), serial = 0;
        for (let step = 0; step < 40; step++) {
            if (build.parts.length && random() < .2) {
                const victim = build.parts[Math.floor(random() * build.parts.length)];
                const below = new Set([victim.uid]);
                for (let grew = true; grew;) { grew = false; for (const p of build.parts) if (p.parent && below.has(p.parent) && !below.has(p.uid)) { below.add(p.uid); grew = true; } }
                const cascade = removalCascade(build, victim.uid);
                for (const uid of below) if (uid !== victim.uid) assert.ok(cascade.includes(uid), 'children always go');
                const gone = new Set([victim.uid, ...cascade]);
                build = { gun, parts: build.parts.filter(p => !gone.has(p.uid)) };
                assert.ok(validateBuild(build).ok);
                continue;
            }
            const id = PART_IDS[Math.floor(random() * PART_IDS.length)], r = checkInstall(build, id);
            const places = [null, ...build.parts.map(p => p.uid)].map((parent): Placement => ({ parent, slot: ATTACHMENTS[id].mount }));
            const legal = places.filter(at => validateBuild({ gun, parts: [...build.parts, { uid: `try${serial}`, id, ...at }] }).ok);
            assert.equal(r.ok, legal.length > 0, `${gun} ${build.parts.map(p => p.id).join(',')} + ${id}: ${r.ok ? 'ok' : r.reason}`);
            if (!r.ok) { refusedCount++; continue; }
            assert.ok(legal.some(at => at.parent === r.at.parent && at.slot === r.at.slot));
            build = { gun, parts: [...build.parts, { uid: `p${serial++}`, id, ...r.at }] };
            accepted++;
            assert.ok(validateBuild(build).ok && build.parts.length <= 11);
        }
    }
    assert.ok(accepted > 500 && refusedCount > 2000, `${accepted} accepted, ${refusedCount} refused`);
});

test('rejection reasons are short Chinese sentences that name parts and slots, never internal ids', () => {
    const byCode = new Map<string, Set<string>>();
    const note = (r: InstallCheck | BuildCheck) => { if (!r.ok) byCode.set(r.code, new Set([...byCode.get(r.code) ?? [], r.reason])); };
    for (const gun of GUN_IDS) {
        const busy = [bare(gun), ...PART_IDS.flatMap(id => { const r = checkInstall(bare(gun), id); return r.ok ? [{ gun, parts: [{ uid: 'x', id, ...r.at }] }] : []; })];
        for (const b of busy) for (const id of PART_IDS) note(checkInstall(b, id));
    }
    const ak = fit(bare('akb74'), 'H04', 'T09');
    for (const id of ['T01', 'T05']) note(checkInstall(ak, id));
    note(validateBuild({ gun: 'mb4a1', parts: Array.from({ length: 13 }, (_, i) => ({ uid: `u${i}`, id: 'T01', parent: null, slot: 'side' as const })) }));
    note(validateBuild({ gun: 'mb4a1', parts: [{ uid: 'a', id: 'T01', parent: 'a', slot: 'side' }] }));
    note(validateBuild({ gun: 'mb4a1', parts: ['a', 'b', 'c', 'd'].map((uid, i, all) => ({ uid, id: 'H02', parent: i ? all[i - 1] : null, slot: 'side' as const })) }));
    note(validateBuild(bare('m4a1')));
    note(checkInstall(bare('mb4a1'), 'Z99'));
    note(checkInstall(fit(bare('mb4a1'), 'O03'), 'O04', { parent: null, slot: 'under' }));
    const codes: Rejection[] = ['unknown', 'structure', 'count', 'depth', 'gun', 'scope', 'slot', 'opener', 'blocked', 'full', 'place', 'needs', 'laser', 'light'];
    assert.deepEqual([...byCode.keys()].sort(), [...codes].sort(), 'every refusal path was exercised');
    const internal = [...PART_IDS, ...GUN_IDS, ...Object.keys(SLOT_NAMES), 'longScope', 'optic', 'tactical', 'handguard', 'undefined', 'null', 'NaN', '${', '[object'];
    const all = [...byCode.values()].flatMap(set => [...set]);
    for (const reason of all) {
        assert.match(reason, /^\p{Script=Han}/u, reason);
        assert.ok(reason.length <= 24, reason);
        for (const word of internal) assert.ok(!reason.includes(word), `${reason} shows ${word}`);
    }
    for (const sentence of ['需要卡宾顶部基座', '与当前护木不兼容', '这把枪没有支撑脚架位']) assert.ok(all.includes(sentence), sentence);
});
