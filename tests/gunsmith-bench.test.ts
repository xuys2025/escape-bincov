/** The workbench screen's model (#28 M2-05): guns, positions, candidates, the edits a click appends, and the scores. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { planGunEdit, type GunEdit } from '../src/gunsmith/edit';
import { buildOf, factoryState } from '../src/gunsmith/instance';
import type { Build } from '../src/gunsmith/compat';
import {
    SCORE_ROWS, benchGuns, benchParts, benchStats, candidateBuild, candidates, capped, positions, remountEdits, replaceEdits, sourceOf, without,
} from '../src/gunsmith/bench';

const build = (gun: string, parts: [string, string, string | null, string][] = []): Build =>
    ({ gun, parts: parts.map(([uid, id, parent, slot]) => ({ uid, id, parent, slot: slot as Build['parts'][number]['slot'] })) });
/** An M4A1 equipped with 28 rounds, a G17 and some parts in the stash, one part in the bag. */
function profile() {
    const p = D.newSave(); p.stash = D.createInventory(10, 6); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2);
    p.equipment = { weapon: 'mb4a1', weaponUid: 'm4', gun: factoryState(), ammo: 28, ammoRelief: 0, relief: false };
    for (const id of ['gb17', 'O03', 'H01', 'F01', 'F01', 'G10']) assert.equal(D.addItem(p.stash, id), 0);
    assert.equal(D.addItem(p.bag, 'O08'), 0);
    return p;
}
const key = (b: Build, k: string) => positions(b).find(p => p.key === k)!;

test('bench lists the base guns, the equipped one first, with its magazine', () => {
    const p = profile(), guns = benchGuns(p);
    assert.deepEqual(guns.map(g => [g.id, g.where]), [['mb4a1', 'equipment'], ['gb17', 'stash']]);
    assert.deepEqual(guns[0].magazine, { ammo: 28, capacity: 30 });
    assert.equal(guns[1].magazine, null);
    assert.equal(guns[0].weight, 2.9);
});

test('positions: native slots in body order; rails a handguard opens are closed until it is on, naming item openers only', () => {
    const bare = positions(build('mb4a1'));
    assert.deepEqual(bare.map(p => p.key), ['gun/stock/0', 'gun/top/0', 'gun/handguard/0', 'gun/barrel/0', 'gun/muzzle/0', 'gun/grip/0', 'gun/mag/0', 'gun/under/0', 'gun/side/0']);
    const under = bare.find(p => p.slot === 'under')!;
    // AR 长导轨护木 (H02) also opens it, but it is not an item yet, so the reason names only the one a player can own.
    assert.equal(under.open, false); assert.equal(under.reason, '需要 AR 短导轨护木');
    const railed = positions(build('mb4a1', [['h', 'H01', null, 'handguard'], ['f', 'F01', 'h', 'under']]));
    assert.deepEqual(railed.filter(p => p.parent === 'h').map(p => [p.slot, p.part?.id ?? null, p.place]),
        [['under', 'F01', '下导轨 · 由 AR 短导轨护木提供'], ['side', null, '侧导轨 · 由 AR 短导轨护木提供']]);
    assert.ok(!railed.some(p => !p.open));
    // The carbine's top rail needs the base A07; G17's side mount is native though no sample part fits it yet.
    assert.equal(positions(build('carbine')).find(p => p.slot === 'top')!.reason, '需要卡宾顶部基座');
    assert.ok(positions(build('gb17')).some(p => p.slot === 'pistolSide' && p.open));
});

test('candidates: what fits first, owned before not owned; refusals keep their reason; parts on another gun are named', () => {
    const p = profile(), m4 = build('mb4a1');
    const top = candidates(p, 'm4', m4, key(m4, 'gun/top/0'));
    assert.deepEqual(top.map(c => [c.id, !!c.loose, c.refusal]), [['O03', true, null], ['O08', true, null]]);
    assert.equal(top[1].loose!.from, 'bag');
    const under = candidates(p, 'm4', m4, key(m4, 'gun/under/0'));
    assert.ok(under.every(c => c.refusal === '需要 AR 短导轨护木'));
    // Two loose F01: one copy to install, the count says two; once one is on the build it is no longer loose.
    const railed = build('mb4a1', [['h', 'H01', null, 'handguard']]), f = candidates(p, 'm4', railed, key(railed, 'h/under/0')).find(c => c.id === 'F01')!;
    assert.equal(f.count, 2);
    const uid = p.stash.items.find(i => i.id === 'F01')!.uid, on = build('mb4a1', [['h', 'H01', null, 'handguard'], [uid, 'F01', 'h', 'under']]);
    const again = candidates(p, 'm4', on, key(on, 'h/under/0')).find(c => c.id === 'F01')!;
    assert.equal(again.current, true); assert.equal(again.count, 1);
    // The replacement check takes off what sits there first: the installed scope is no refusal for its own position.
    const scoped = build('mb4a1', [['o', 'O03', null, 'top']]);
    assert.ok(candidates(p, 'm4', scoped, key(scoped, 'gun/top/0')).every(c => c.refusal === null));
    // G17: the suppressor needs the barrel group; a part on another gun with no loose copy is named.
    const g17 = build('gb17'), m03 = candidates(p, 'g', g17, key(g17, 'gun/muzzle/0')).find(c => c.id === 'M03')!;
    assert.equal(m03.refusal, '需要九系精瞄枪管组'); assert.equal(m03.loose, null); assert.equal(m03.elsewhere, null);
    const q = profile(); q.equipment.gun = { parts: [{ uid: 'x', id: 'O01', slot: 'micro', relief: false, children: [] }], devices: { laser: false, light: false } };
    q.equipment.weapon = 'gb17';
    const g = q.stash.items.find(i => i.id === 'gb17')!.uid, micro = candidates(q, g, g17, key(g17, 'gun/micro/0')).find(c => c.id === 'O01')!;
    assert.equal(micro.elsewhere, 'G17 通用手枪');
});

test('only attachment items are listed, and where one comes from', () => {
    assert.equal(benchParts().length, 20);
    assert.match(sourceOf('P01'), /^修理铺有售 · ¥ \d+$/);
    assert.equal(sourceOf('O08'), '行动中的高风险处可能找到');
    assert.equal(sourceOf('O03'), '行动中可能找到');
});

test('a click appends edits that planGunEdit accepts; replacing a handguard moves its rail parts onto the new one', () => {
    const p = profile(), uid = (id: string) => p.stash.items.find(i => i.id === id)!.uid;
    const m4 = buildOf({ id: 'mb4a1', parts: [] });
    let edits: GunEdit[] = replaceEdits(key(m4, 'gun/handguard/0'), 'H01', { uid: uid('H01') });
    let plan = planGunEdit(p, 'm4', edits); assert.ok(plan.ok);
    const h = plan.preview.after.parts[0].uid, railed = buildOf({ id: 'mb4a1', parts: plan.preview.after.parts });
    edits = [...edits, ...replaceEdits(key(railed, `${h}/under/0`), 'F01', { uid: uid('F01') })];
    plan = planGunEdit(p, 'm4', edits); assert.ok(plan.ok);
    // H02 (the long handguard, not an item) in place of H01: previewed by id, the foregrip moves across.
    const before = buildOf({ id: 'mb4a1', parts: plan.preview.after.parts }), at = key(before, 'gun/handguard/0');
    edits = [...edits, ...replaceEdits(at, 'H02', null)];
    plan = planGunEdit(p, 'm4', edits); assert.equal(plan.ok, false);
    assert.ok(!plan.ok && plan.preview); const swapped = plan.preview!;
    // H01 and the foregrip were only previewed in this list: swapping H01 out leaves both loose (the net change).
    assert.deepEqual([swapped.removals, swapped.installs.map(i => i.id)], [[], ['H02']]);
    const fresh = swapped.installs.find(i => i.id === 'H02')!.uid;
    const more = remountEdits(before, at.part!, fresh, buildOf({ id: 'mb4a1', parts: swapped.after.parts }));
    assert.deepEqual(more, [{ kind: 'install', uid: uid('F01'), at: { parent: fresh, slot: 'under' } }]);
    plan = planGunEdit(p, 'm4', [...edits, ...more]);
    assert.ok(!plan.ok && plan.preview && plan.preview.refusal?.code === 'unowned');
    assert.deepEqual(plan.preview!.after.parts.map(n => [n.id, n.children.map(c => c.id)]), [['H02', ['F01']]]);
    // The same move in the comparison's hypothetical build.
    assert.deepEqual(candidateBuild(before, at, 'H02')!.parts.map(x => x.id).sort(), ['F01', 'H02']);
    // Back to factory: one removal, children with it.
    assert.deepEqual(replaceEdits(at, null, null), [{ kind: 'remove', uid: at.part!.uid }]);
    assert.deepEqual(without(before, at).parts, []);
});

test('scores: 50 at the references, parts move them the way their stats do, never 0 or 100; guardrails are named', () => {
    const rows = SCORE_ROWS.map(r => r.key);
    assert.deepEqual(rows, ['fire', 'acc', 'ctl', 'hdl', 'feed', 'kg', 'noise']);
    for (const gun of ['pistol', 'gb17', 'shotgun', 'carbine', 'mb4a1']) {
        const s = benchStats(build(gun)).scores;
        for (const k of rows) if (k !== 'kg') assert.ok(s[k] > 0 && s[k] < 100, `${gun} ${k} ${s[k]}`);
        assert.equal(s.noise, 50);
    }
    const m4 = benchStats(build('mb4a1')).scores, scoped = benchStats(build('mb4a1', [['o', 'O08', null, 'top']]));
    assert.ok(scoped.scores.acc > m4.acc && scoped.scores.hdl < m4.hdl && scoped.scores.kg > m4.kg);
    assert.equal(scoped.scores.fire, m4.fire, 'no part changes fire');
    const quiet = benchStats(build('gb17', [['b', 'B01', null, 'barrel'], ['m', 'M03', null, 'muzzle']]));
    assert.ok(quiet.scores.noise < 50); assert.equal(quiet.numbers.noise, 255); assert.equal(quiet.numbers.suppressed, true);
    const g10 = benchStats(build('mb4a1', [['g', 'G10', null, 'mag']]));
    assert.equal(g10.numbers.magazine, 20); assert.ok(g10.numbers.reload < 2.1);
    assert.equal(benchStats(build('mb4a1', [['h', 'H01', null, 'handguard'], ['t', 'T01', 'h', 'side']])).numbers.devices, true);
    // Stacking recoil parts past the 40% guardrail: the comparison says some of the gain is lost.
    const stacked = build('mb4a1', [['s', 'S02', null, 'stock'], ['p', 'P02', null, 'grip'], ['h', 'H01', null, 'handguard'], ['f', 'F01', 'h', 'under'], ['m', 'M06', null, 'muzzle']]);
    assert.deepEqual(capped(build('mb4a1')), []);
    // Kick: S02 0.85 x F01 0.92 x M06 0.75 = 0.5865, under the 0.6 floor, so the comparison names it.
    assert.deepEqual(capped(stacked), ['kick']);
});
