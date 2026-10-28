import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { decodeStoredProfile } from '../src/profile-codec';
import { SESSION_KEY } from '../src/recovery-store';
import type { GunEdit } from '../src/hideout-runtime';
import { locateGun, planGunEdit, type GunEditPlan } from '../src/gunsmith/edit';
import { gunUids, gunWeight, nodesOf, repeatedUids } from '../src/gunsmith/instance';
import { OFF, gun, hold, node, put, reason, yard } from './fixtures/workbench';

// Gunsmith M2-04 (docs/gunsmith/CONTRACTS.md, 「改装事务（M2-04）」): the workbench's edit transaction. planGunEdit works
// out a candidate on a profile without touching it; the hideout Runtime's GunsmithSession previews it, binds it to the
// base inventory and a token, and commits it in one write. tests/gunsmith-edit-conservation.test.ts plays random legal
// edit sequences on top of these cases.

/** A profile at the base with empty containers and no gun in hand. */
function base(): D.SaveDataV1 {
    const p = D.newSave();
    p.stash = D.createInventory(10, 6); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2);
    p.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
    return p;
}
function done(plan: GunEditPlan) {
    assert.ok(plan.ok, plan.ok ? '' : `${plan.code}: ${plan.reason}`);
    return plan as Extract<GunEditPlan, { ok: true }>;
}
function refused(plan: GunEditPlan, code: string, edit: number | null = null) {
    assert.equal(plan.ok, false);
    const r = plan as Extract<GunEditPlan, { ok: false }>;
    assert.deepEqual([r.code, r.edit], [code, edit], r.reason);
    if (r.preview) assert.deepEqual(r.preview.refusal, { code: r.code, reason: r.reason });
    return r;
}
const items = (p: D.SaveDataV1) => [...p.stash.items, ...p.bag.items, ...p.safe.items];
const find = (p: D.SaveDataV1, uid: string) => items(p).find(i => i.uid === uid);
/** Every part, loose or installed, as uid -> id and relief flag; and every uid of the profile once. */
function parts(p: D.SaveDataV1) {
    const out = new Map<string, string>(), guns = [...items(p).filter(i => i.gun).map(i => i.gun!), ...(p.equipment.gun ? [p.equipment.gun] : [])];
    for (const i of items(p)) if (D.isAttachment(i.id)) out.set(i.uid, `${i.id}${i.relief ? ' relief' : ''}`);
    for (const n of guns.flatMap(g => nodesOf(g.parts))) { assert.ok(!out.has(n.uid), `${n.uid} is held twice`); out.set(n.uid, `${n.id}${n.relief ? ' relief' : ''}`); }
    return out;
}
function uids(p: D.SaveDataV1) {
    const all = items(p).flatMap(i => D.itemUids(i)).concat(D.equipmentUids(p.equipment));
    assert.deepEqual(repeatedUids(all), [], 'every uid once');
    return all.sort();
}
/** Rounds of `ammo` in the containers and the magazine, ordinary and relief apart. */
function rounds(p: D.SaveDataV1, ammo: string) {
    const loose = (relief: boolean) => items(p).filter(i => i.id === ammo && !!i.relief === relief).reduce((n, i) => n + i.qty, 0);
    const loaded = p.equipment.weapon && D.WEAPONS[p.equipment.weapon].ammo === ammo ? p.equipment : null;
    return { normal: loose(false) + (loaded ? loaded.ammo - loaded.ammoRelief : 0), relief: loose(true) + (loaded?.ammoRelief ?? 0) };
}
/** A committed plan: a strictly valid profile that holds the same parts, rounds and uids as before, and the same cash. */
function conserved(before: D.SaveDataV1, plan: Extract<GunEditPlan, { ok: true }>) {
    const after = plan.profile;
    assert.deepEqual(decodeStoredProfile(structuredClone(after)), after, 'the strict codec reads it back unchanged');
    assert.deepEqual(parts(after), parts(before), 'no part made or lost, each keeps its uid, type and relief flag');
    assert.deepEqual(uids(after).filter(uid => !find(after, uid) || D.ITEMS[find(after, uid)!.id].kind !== 'ammo'),
        uids(before).filter(uid => !find(before, uid) || D.ITEMS[find(before, uid)!.id].kind !== 'ammo'), 'the same uids, new round stacks aside');
    for (const ammo of ['ammo9', 'ammoR', 'shell']) assert.deepEqual(rounds(after, ammo), rounds(before, ammo), `${ammo} rounds conserved`);
    assert.equal(after.cash, before.cash);
    const located = locateGun(after, plan.preview.gun.uid)!;
    assert.deepEqual(located.state, plan.preview.after, 'the gun is the previewed candidate');
}

test('an install takes an owned loose part onto the gun with its uid and relief flag, and leaves the input alone', () => {
    const p = base();
    put(p.stash, gun('m4', 'mb4a1'));
    put(p.stash, { uid: 'o03', id: 'O03' });
    put(p.bag, { uid: 'rs02', id: 'S02', relief: true });
    const before = structuredClone(p);
    const plan = done(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'o03' }, { kind: 'install', uid: 'rs02', at: { parent: null, slot: 'stock' } }]));
    assert.deepEqual(p, before, 'planning never writes its input');
    const m4 = find(plan.profile, 'm4')!;
    assert.deepEqual(m4.gun, { parts: [node('o03', 'O03', 'top'), node('rs02', 'S02', 'stock', [], true)], devices: OFF });
    assert.equal(find(plan.profile, 'o03'), undefined); assert.equal(find(plan.profile, 'rs02'), undefined);
    assert.deepEqual(plan.preview.installs, [{ uid: 'o03', id: 'O03', parent: null, slot: 'top', from: 'stash' }, { uid: 'rs02', id: 'S02', parent: null, slot: 'stock', from: 'bag' }]);
    assert.deepEqual([plan.preview.removals, plan.preview.moves, plan.preview.unloaded, plan.preview.refusal], [[], [], null, null]);
    assert.deepEqual(plan.preview.weight, { before: 2.9, after: gunWeight({ id: 'mb4a1', parts: m4.gun!.parts }) });
    assert.equal(plan.preview.weight.after, 3.21);
    assert.deepEqual([plan.preview.capacity, plan.preview.size], [{ before: 30, after: 30 }, { before: { w: 4, h: 1 }, after: { w: 4, h: 1 } }]);
    assert.deepEqual(plan.preview.gun, { uid: 'm4', id: 'mb4a1', relief: false, where: 'stash' });
    // The relief stock stays relief on the gun: the gun can no longer be sold whole.
    assert.equal(D.itemSale(m4).restricted, true);
    conserved(p, plan);
});

test('one list builds the steady M4A1 of PLAN section 11, a foregrip under the handguard the same list puts on', () => {
    const p = base();
    put(p.bag, gun('m4', 'mb4a1'));
    for (const [uid, id] of [['h01', 'H01'], ['f01', 'F01'], ['s02', 'S02'], ['p02', 'P02'], ['m06', 'M06'], ['o03', 'O03']]) put(p.stash, { uid, id });
    const edits: GunEdit[] = [{ kind: 'install', uid: 'h01' }, { kind: 'install', uid: 'f01', at: { parent: 'h01', slot: 'under' } },
        { kind: 'install', uid: 's02' }, { kind: 'install', uid: 'p02' }, { kind: 'install', uid: 'm06' }, { kind: 'install', uid: 'o03' }];
    const plan = done(planGunEdit(p, 'm4', edits));
    assert.deepEqual(find(plan.profile, 'm4')!.gun!.parts, [node('h01', 'H01', 'handguard', [node('f01', 'F01', 'under')]), node('s02', 'S02', 'stock'),
        node('p02', 'P02', 'grip'), node('m06', 'M06', 'muzzle'), node('o03', 'O03', 'top')]);
    assert.deepEqual(plan.preview.installs.map(i => [i.uid, i.parent, i.from]), [['h01', null, 'stash'], ['f01', 'h01', 'stash'], ['s02', null, 'stash'],
        ['p02', null, 'stash'], ['m06', null, 'stash'], ['o03', null, 'stash']]);
    assert.equal(p.stash.items.length, 6); assert.equal(plan.profile.stash.items.length, 0);
    conserved(p, plan);
});

test('a smaller magazine unloads the rounds above it into the stash, ordinary first, relief rounds apart', () => {
    // 28 rounds, 5 of them relief: the 8 above 20 are all ordinary; they top up the stash's stack of 28, then start one.
    const p = base();
    hold(p, 'm4', 'mb4a1', [], 28, 5);
    put(p.bag, { uid: 'g10', id: 'G10' });
    assert.equal(D.addItem(p.stash, 'ammoR', 28), 0);
    let plan = done(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'g10' }]));
    assert.deepEqual(plan.preview.capacity, { before: 30, after: 20 });
    assert.deepEqual(plan.preview.unloaded, { ammo: 'ammoR', normal: 8, relief: 0 });
    assert.deepEqual([plan.profile.equipment.ammo, plan.profile.equipment.ammoRelief], [20, 5]);
    assert.deepEqual(plan.profile.stash.items.filter(i => i.id === 'ammoR').map(i => [i.qty, !!i.relief]), [[30, false], [6, false]]);
    conserved(p, plan);
    // 28 rounds, 25 relief: the 3 ordinary ones go, then 5 relief rounds into a relief stack of their own.
    p.equipment.ammoRelief = 25;
    plan = done(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'g10' }]));
    assert.deepEqual(plan.preview.unloaded, { ammo: 'ammoR', normal: 3, relief: 5 });
    assert.deepEqual([plan.profile.equipment.ammo, plan.profile.equipment.ammoRelief], [20, 20]);
    assert.deepEqual(rounds(plan.profile, 'ammoR'), { normal: 31, relief: 25 });
    assert.deepEqual(plan.profile.stash.items.filter(i => i.id === 'ammoR').map(i => [i.qty, !!i.relief]), [[30, false], [1, false], [5, true]]);
    conserved(p, plan);
    // Taking the G17's extended magazine off: 24 -> 17, five 9 mm rounds out; the magazine itself goes to the stash.
    const g = base();
    hold(g, 'g17', 'gb17', [node('g01', 'G01', 'mag')], 22, 2);
    const off = done(planGunEdit(g, 'g17', [{ kind: 'remove', uid: 'g01' }]));
    assert.deepEqual([off.preview.capacity, off.preview.unloaded], [{ before: 24, after: 17 }, { ammo: 'ammo9', normal: 5, relief: 0 }]);
    assert.deepEqual(off.preview.removals, [{ uid: 'g01', id: 'G01', with: null }]);
    assert.deepEqual([off.profile.equipment.ammo, off.profile.equipment.ammoRelief, D.count(off.profile.stash, 'ammo9')], [17, 2, 5]);
    assert.ok(find(off.profile, 'g01'));
    conserved(g, off);
    // A larger magazine loads nothing by itself.
    const up = base();
    hold(up, 'g17', 'gb17', [], 15, 0);
    put(up.stash, { uid: 'g01', id: 'G01' });
    const grown = done(planGunEdit(up, 'g17', [{ kind: 'install', uid: 'g01' }]));
    assert.deepEqual([grown.preview.capacity, grown.preview.unloaded, grown.profile.equipment.ammo], [{ before: 17, after: 24 }, null, 15]);
});

test('a removal takes what sits on the part and what needs it; a device coming off turns its switch off, others stay', () => {
    const fitted = () => [node('h01', 'H01', 'handguard', [node('f01', 'F01', 'under'), node('t01', 'T01', 'side')]), node('o03', 'O03', 'top')];
    const p = base();
    put(p.bag, gun('m4', 'mb4a1', fitted(), { laser: true, light: false }));
    // The foregrip alone: the laser stays on.
    let plan = done(planGunEdit(p, 'm4', [{ kind: 'remove', uid: 'f01' }]));
    assert.deepEqual(plan.preview.after.devices, { laser: true, light: false });
    assert.deepEqual(plan.preview.removals, [{ uid: 'f01', id: 'F01', with: null }]);
    conserved(p, plan);
    // The handguard: the foregrip and the laser on it come off with it, each a loose item again under its own uid.
    plan = done(planGunEdit(p, 'm4', [{ kind: 'remove', uid: 'h01' }]));
    assert.deepEqual(plan.preview.removals, [{ uid: 'h01', id: 'H01', with: null }, { uid: 'f01', id: 'F01', with: 'h01' }, { uid: 't01', id: 'T01', with: 'h01' }]);
    assert.deepEqual(find(plan.profile, 'm4')!.gun, { parts: [node('o03', 'O03', 'top')], devices: OFF });
    assert.deepEqual(['h01', 'f01', 't01'].map(uid => [find(plan.profile, uid)?.id, plan.profile.stash.items.some(i => i.uid === uid)]), [['H01', true], ['F01', true], ['T01', true]]);
    conserved(p, plan);
    // A light the same way.
    const l = base();
    put(l.stash, gun('m4', 'mb4a1', [node('h01', 'H01', 'handguard', [node('t05', 'T05', 'side')])], { laser: false, light: true }));
    const dark = done(planGunEdit(l, 'm4', [{ kind: 'remove', uid: 't05' }]));
    assert.deepEqual(dark.preview.after.devices, OFF);
    // A part that loses what it needs comes off too: the G17's suppressor without the barrel that carries it.
    const g = base();
    put(g.stash, gun('g17', 'gb17', [node('b01', 'B01', 'barrel'), node('m03', 'M03', 'muzzle')]));
    const bare = done(planGunEdit(g, 'g17', [{ kind: 'remove', uid: 'b01' }]));
    assert.deepEqual(bare.preview.removals, [{ uid: 'b01', id: 'B01', with: null }, { uid: 'm03', id: 'M03', with: 'b01' }]);
    assert.deepEqual(bare.preview.size, { before: { w: 3, h: 1 }, after: { w: 2, h: 1 } });
    conserved(g, bare);
});

test('the net change counts: a part on and off again stays put, a part off and on again elsewhere moves', () => {
    const p = base();
    hold(p, 'm4', 'mb4a1', [node('h01a', 'H01', 'handguard', [node('f01', 'F01', 'under')])], 10, 0);
    put(p.stash, { uid: 'h01b', id: 'H01' });
    put(p.bag, { uid: 'f03', id: 'F03', x: 3, y: 2 });
    const edits: GunEdit[] = [
        { kind: 'remove', uid: 'f01' }, { kind: 'install', uid: 'f03', at: { parent: 'h01a', slot: 'under' } }, // F03 goes on ...
        { kind: 'remove', uid: 'h01a' }, // ... and comes off with the handguard: it never left the bag
        { kind: 'install', uid: 'h01b' }, { kind: 'install', uid: 'f01', at: { parent: 'h01b', slot: 'under' } }, // F01 moves over
    ];
    const plan = done(planGunEdit(p, 'm4', edits));
    assert.deepEqual(plan.profile.equipment.gun!.parts, [node('h01b', 'H01', 'handguard', [node('f01', 'F01', 'under')])]);
    assert.deepEqual(plan.preview.removals, [{ uid: 'h01a', id: 'H01', with: null }]);
    assert.deepEqual(plan.preview.installs, [{ uid: 'h01b', id: 'H01', parent: null, slot: 'handguard', from: 'stash' }]);
    assert.deepEqual(plan.preview.moves, [{ uid: 'f01', id: 'F01', parent: 'h01b', slot: 'under' }]);
    assert.deepEqual(find(plan.profile, 'f03'), { uid: 'f03', id: 'F03', qty: 1, x: 3, y: 2 }, 'F03 never left its cell');
    conserved(p, plan);
    // Off and back where it was: no change at all, and the laser it carries keeps its switch.
    const q = base();
    hold(q, 'm4', 'mb4a1', [node('h01', 'H01', 'handguard', [node('t01', 'T01', 'side'), node('f01', 'F01', 'under')])], 0, 0, { laser: true, light: false });
    const same = refused(planGunEdit(q, 'm4', [{ kind: 'remove', uid: 't01' }, { kind: 'install', uid: 't01', at: { parent: 'h01', slot: 'side' } }]), 'unchanged');
    assert.deepEqual(same.preview!.after, q.equipment.gun);
    assert.equal(same.reason, '还没有改动。');
    refused(planGunEdit(q, 'm4', []), 'unchanged');
});

test('refusals name the edit: compat\'s reason for a part that does not fit, and a part gone, on another gun, not a part, twice or not on', () => {
    const p = base();
    put(p.stash, gun('m4', 'mb4a1'));
    put(p.bag, gun('g17', 'gb17', [node('b01', 'B01', 'barrel')]));
    for (const [uid, id] of [['h05', 'H05'], ['f01', 'F01'], ['o03', 'O03'], ['med', 'medkit']]) put(p.stash, { uid, id });
    const before = structuredClone(p);
    const at = (edits: GunEdit[], code: string, edit: number | null, reason?: string | RegExp) => {
        const r = refused(planGunEdit(p, 'm4', edits), code, edit);
        if (edit !== null) assert.equal(r.preview, null, 'an edit that cannot be made previews nothing');
        if (typeof reason === 'string') assert.equal(r.reason, reason); else if (reason) assert.match(r.reason, reason);
    };
    at([{ kind: 'install', uid: 'h05' }], 'gun', 0, '不适配这把枪');
    at([{ kind: 'install', uid: 'f01' }], 'opener', 0, /^需要 AR 短导轨护木/);
    at([{ kind: 'install', uid: 'o03' }, { kind: 'install', uid: 'gone' }], 'missing-part', 1, '这个配件已不在原位置，请重新选择。');
    at([{ kind: 'install', uid: 'b01' }], 'missing-part', 0, '这个配件装在别的枪上，请先拆下。');
    at([{ kind: 'install', uid: 'med' }], 'not-part', 0, '这件物品不是配件。');
    at([{ kind: 'install', uid: 'g17' }], 'not-part', 0);
    at([{ kind: 'install', uid: 'o03' }, { kind: 'install', uid: 'o03', at: { parent: null, slot: 'top' } }], 'installed', 1, '这个配件已经装在枪上。');
    at([{ kind: 'remove', uid: 'o03' }], 'not-installed', 0, '这个配件不在这把枪上。');
    at([{ kind: 'install', uid: 'o03', at: { parent: 'nowhere', slot: 'top' } }], 'place', 0, '不能装在这个位置');
    for (const bad of [{ kind: 'install' }, { kind: 'fly', uid: 'o03' }, { kind: 'install', uid: 'o03', id: 'O03' }, { kind: 'install', uid: 'o03', at: { parent: 1, slot: 'top' } },
        { kind: 'install', uid: 'o03', at: null }, { kind: 'remove' }, null, 'o03', ['o03']]) at([bad as unknown as GunEdit], 'structure', 0, '配件结构无效');
    at(Array.from({ length: 65 }, () => ({ kind: 'remove', uid: 'o03' }) as GunEdit), 'structure', null);
    refused(planGunEdit(p, 'nope', [{ kind: 'install', uid: 'o03' }]), 'missing-gun');
    refused(planGunEdit(p, 'o03', [{ kind: 'install', uid: 'f01' }]), 'missing-gun');
    p.activeRun = { seed: 7 };
    assert.equal(refused(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'o03' }]), 'raid').reason, '行动中不能改装枪械。');
    p.activeRun = null;
    assert.deepEqual(p, before);
});

test('a part the player lacks previews under a placeholder, takes parts under it, and is never committed', () => {
    const p = base();
    put(p.stash, gun('m4', 'mb4a1'));
    put(p.stash, { uid: 'f01', id: 'F01' });
    const r = refused(planGunEdit(p, 'm4', [{ kind: 'install', id: 'H02' }, { kind: 'install', uid: 'f01', at: { parent: 'unowned-1', slot: 'under' } },
        { kind: 'install', id: 'O08' }]), 'unowned');
    assert.equal(r.reason, '还没有「AR 长导轨护木」「轻型远距镜」。先买到，或换回已有的配件。');
    assert.deepEqual(r.preview!.installs, [{ uid: 'unowned-1', id: 'H02', parent: null, slot: 'handguard', from: null },
        { uid: 'f01', id: 'F01', parent: 'unowned-1', slot: 'under', from: 'stash' }, { uid: 'unowned-2', id: 'O08', parent: null, slot: 'top', from: null }]);
    assert.deepEqual(r.preview!.after.parts, [node('unowned-1', 'H02', 'handguard', [node('f01', 'F01', 'under')]), node('unowned-2', 'O08', 'top')]);
    assert.ok(r.preview!.weight.after > r.preview!.weight.before);
    assert.equal('profile' in r, false);
    // Any catalog part may be previewed, an item or not; an unknown id is compat's refusal.
    refused(planGunEdit(p, 'm4', [{ kind: 'install', id: 'Z99' }]), 'unknown', 0);
    // A placeholder never takes a uid the profile holds.
    put(p.bag, { uid: 'unowned-1', id: 'medkit' });
    assert.deepEqual(refused(planGunEdit(p, 'm4', [{ kind: 'install', id: 'O03' }]), 'unowned').preview!.installs.map(i => i.uid), ['unowned-1-2']);
});

test('the gun must still fit where it lies, and the stash must take what comes off, or nothing is planned', () => {
    // A G17 with its barrel set in the stash, a watch beside it: the suppressor makes it 3x1.
    const p = base();
    put(p.stash, gun('g17', 'gb17', [node('b01', 'B01', 'barrel')], OFF, { x: 0, y: 0 }));
    put(p.stash, { uid: 'watch', id: 'watch', x: 2, y: 0 });
    put(p.bag, { uid: 'm03', id: 'M03' });
    let r = refused(planGunEdit(p, 'g17', [{ kind: 'install', uid: 'm03' }]), 'footprint');
    assert.equal(r.reason, '改装后枪身变大，在仓库原来的位置放不下，请先腾出空间。');
    assert.deepEqual(r.preview!.size, { before: { w: 2, h: 1 }, after: { w: 3, h: 1 } });
    p.stash.items = p.stash.items.filter(i => i.uid !== 'watch');
    const grown = done(planGunEdit(p, 'g17', [{ kind: 'install', uid: 'm03' }]));
    assert.deepEqual(find(grown.profile, 'g17')!.x, 0); assert.deepEqual(D.itemSize(find(grown.profile, 'g17')!), { w: 3, h: 1 });
    conserved(p, grown);
    // Lying rotated it grows downwards; in the 2x2 safe it cannot grow at all.
    const q = base();
    put(q.stash, gun('g17', 'gb17', [node('b01', 'B01', 'barrel')], OFF, { x: 4, y: 0, rotated: true }));
    put(q.stash, { uid: 'watch', id: 'watch', x: 4, y: 2 });
    put(q.bag, { uid: 'm03', id: 'M03' });
    refused(planGunEdit(q, 'g17', [{ kind: 'install', uid: 'm03' }]), 'footprint');
    q.stash.items = q.stash.items.filter(i => i.uid !== 'watch');
    const down = done(planGunEdit(q, 'g17', [{ kind: 'install', uid: 'm03' }]));
    assert.deepEqual([D.itemSize(find(down.profile, 'g17')!), find(down.profile, 'g17')!.rotated], [{ w: 1, h: 3 }, true]);
    const s = base();
    put(s.safe, gun('g17', 'gb17', [node('b01', 'B01', 'barrel')]));
    put(s.bag, { uid: 'm03', id: 'M03' });
    assert.equal(refused(planGunEdit(s, 'g17', [{ kind: 'install', uid: 'm03' }]), 'footprint').reason, '改装后枪身变大，在安全箱原来的位置放不下，请先腾出空间。');
    // What comes off needs room in the stash: a full stash refuses the handguard, a free 1x2 gap takes it turned.
    const full = base();
    hold(full, 'm4', 'mb4a1', [node('h01', 'H01', 'handguard')]);
    assert.equal(D.addItem(full.stash, 'fuse', 240), 0);
    r = refused(planGunEdit(full, 'm4', [{ kind: 'remove', uid: 'h01' }]), 'space');
    assert.equal(r.reason, '仓库放不下拆下的 AR 短导轨护木，请先腾出空间。');
    assert.deepEqual(r.preview!.removals, [{ uid: 'h01', id: 'H01', with: null }]);
    full.stash.items = full.stash.items.filter(i => !(i.x === 3 && (i.y === 2 || i.y === 3)));
    const turned = done(planGunEdit(full, 'm4', [{ kind: 'remove', uid: 'h01' }]));
    assert.deepEqual(find(turned.profile, 'h01'), { uid: 'h01', id: 'H01', qty: 1, x: 3, y: 2, rotated: true });
    conserved(full, turned);
    // Rounds a smaller magazine unloads need room too: refused with no room, merged into a stack with room.
    const rounds28 = base();
    hold(rounds28, 'm4', 'mb4a1', [], 28, 0);
    put(rounds28.bag, { uid: 'g10', id: 'G10' });
    assert.equal(D.addItem(rounds28.stash, 'fuse', 240), 0);
    assert.equal(refused(planGunEdit(rounds28, 'm4', [{ kind: 'install', uid: 'g10' }]), 'space').reason, '仓库没有空位放卸出的 8 发卡宾枪弹，请先腾出空间。');
    rounds28.stash.items[0] = { uid: 'stack', id: 'ammoR', qty: 22, x: 0, y: 0 };
    const merged = done(planGunEdit(rounds28, 'm4', [{ kind: 'install', uid: 'g10' }]));
    assert.equal(find(merged.profile, 'stack')!.qty, 30);
    conserved(rounds28, merged);
    const pistol = base();
    hold(pistol, 'g17', 'gb17', [node('g01', 'G01', 'mag')], 24, 0);
    assert.equal(D.addItem(pistol.stash, 'fuse', 240), 0);
    pistol.stash.items[0] = { uid: 'gap', id: 'ammo9', qty: 40, x: 0, y: 0 };
    pistol.stash.items[1] = { uid: 'free', id: 'fuse', qty: 4, x: 1, y: 0 };
    assert.equal(refused(planGunEdit(pistol, 'g17', [{ kind: 'remove', uid: 'g01' }]), 'space').reason, '仓库放不下拆下的 G17 加长匣，请先腾出空间。');
    pistol.stash.items.splice(1, 1);
    assert.equal(refused(planGunEdit(pistol, 'g17', [{ kind: 'remove', uid: 'g01' }]), 'space').reason, '仓库没有空位放卸出的 7 发 9 毫米弹，请先腾出空间。');
});

test('a part that is not an item yet stays on the gun: it cannot lie loose', () => {
    const p = base();
    hold(p, 'cb', 'carbine', [node('m05', 'M05', 'muzzle')]);
    assert.equal(refused(planGunEdit(p, 'cb', [{ kind: 'remove', uid: 'm05' }]), 'loose').reason, '步枪消焰器暂时不能拆下。');
});

// ---- The hideout Runtime's GunsmithSession -----------------------------------------------------------------------

/** An M4A1 in hand with 28 rounds (4 relief) and a short handguard; a quick magazine and a foregrip in the bag. */
const stocked = (p: D.SaveDataV1) => {
    hold(p, 'm4', 'mb4a1', [node('h01', 'H01', 'handguard')], 28, 4);
    put(p.bag, { uid: 'g10', id: 'G10' }); put(p.bag, { uid: 'f01', id: 'F01' });
    put(p.stash, { uid: 'watch', id: 'watch' }); assert.equal(D.addItem(p.stash, 'ammoR', 10), 0);
};
const quickMag: GunEdit[] = [{ kind: 'install', uid: 'g10' }, { kind: 'install', uid: 'f01', at: { parent: 'h01', slot: 'under' } }];

test('a workbench preview writes nothing; confirm commits it once, and a used or replaced token is stale', () => {
    const f = yard(stocked), bench = f.runtime.openGunsmith('m4'), raw = f.raw, writes = f.writes, profile = structuredClone(f.state.save);
    assert.deepEqual(bench.view(), { gun: { uid: 'm4', id: 'mb4a1', relief: false, where: 'equipment', state: profile.equipment.gun! }, edits: [], preview: null, token: null, stale: false });
    const first = bench.preview(quickMag.slice(0, 1)), second = bench.preview(quickMag);
    assert.ok(first.ok && first.token && second.ok && second.token && first.token !== second.token);
    assert.deepEqual(second.preview!.unloaded, { ammo: 'ammoR', normal: 8, relief: 0 });
    assert.deepEqual([f.raw, f.writes, f.state.save], [raw, writes, profile], 'a preview never writes');
    assert.deepEqual(bench.view().edits, quickMag); assert.equal(bench.view().token, second.token);
    const old = bench.confirm(first.token!);
    assert.deepEqual([reason(old), !old.ok && old.message], ['stale', '请按最新的改装预览确认。'], 'only the latest preview confirms');
    assert.equal(f.raw, raw);
    const done = bench.confirm(second.token!);
    assert.deepEqual(done, { ok: true, message: '改装已保存。' });
    const record = f.record;
    assert.equal(record.revision, JSON.parse(raw).revision + 1, 'one write');
    assert.deepEqual(record.profile.equipment.gun, second.preview!.after);
    assert.deepEqual([record.profile.equipment.ammo, record.profile.equipment.ammoRelief, D.count(record.profile.stash, 'ammoR')], [20, 4, 18]);
    assert.equal(record.profile.bag.items.length, 0);
    assert.deepEqual(f.state.save, record.profile, 'the session holds what was committed');
    assert.deepEqual(f.events.filter(e => e.type === 'committed').map(e => e.type === 'committed' && e.action), ['gunsmith']);
    assert.deepEqual(bench.view().preview, null);
    const after = f.raw;
    assert.equal(reason(bench.confirm(second.token!)), 'stale', 'a used token commits nothing more');
    assert.equal(f.raw, after);
});

test('confirm re-checks the base: a moved item stales the preview, a base-time checkpoint does not', () => {
    const f = yard(stocked), bench = f.runtime.openGunsmith('m4');
    let p = bench.preview(quickMag);
    // Five seconds of base time: a checkpoint writes a new revision with the same inventory.
    const revision = f.saves.revision;
    f.advance(6000); f.runtime.tick(f.now);
    assert.equal(f.saves.revision, revision + 1);
    assert.equal(bench.view().stale, false);
    // The watch moves to the bag: the stash changed, so the preview is stale and confirming writes nothing.
    assert.ok(f.runtime.quickMove('stash', 'watch').ok);
    assert.deepEqual([bench.view().stale, bench.view().token], [true, null]);
    const raw = f.raw;
    const moved = bench.confirm(p.token!);
    assert.deepEqual([reason(moved), !moved.ok && moved.message], ['stale', '仓库或装备已改变，请重新预览改装。']);
    assert.equal(f.raw, raw);
    // Preview again, after the checkpoint: it confirms.
    p = bench.preview(bench.view().edits);
    f.advance(6000); f.runtime.tick(f.now);
    assert.ok(bench.confirm(p.token!).ok);
    assert.deepEqual(f.record.profile.equipment.gun!.parts, [node('h01', 'H01', 'handguard', [node('f01', 'F01', 'under')]), node('g10', 'G10', 'mag')]);
});

test('a failed write changes nothing and keeps the preview; after retrySave the same confirm commits it once', () => {
    const f = yard(stocked), bench = f.runtime.openGunsmith('m4'), p = bench.preview(quickMag);
    const raw = f.raw, profile = structuredClone(f.state.save), view = bench.view();
    f.fail();
    assert.equal(reason(bench.confirm(p.token!)), 'storage');
    assert.deepEqual([f.raw, f.state.save, bench.view()], [raw, profile, view], 'nothing changed and the preview stays');
    assert.deepEqual(f.events.map(e => e.type === 'save-failed' && e.action), ['gunsmith']);
    // Still failing: the page waits for a retry first.
    assert.equal(reason(bench.confirm(p.token!)), 'storage');
    f.fail(false);
    assert.ok(f.runtime.retrySave().ok);
    assert.deepEqual(f.state.save, profile, 'the retry wrote the base as it was');
    assert.ok(bench.confirm(p.token!).ok);
    const record = f.record, before = parts(profile), now = parts(record.profile);
    assert.deepEqual(now, before, 'every part once, with its uid');
    assert.deepEqual(rounds(record.profile, 'ammoR'), rounds(profile, 'ammoR'));
    assert.deepEqual(record.profile.equipment.gun, p.preview!.after);
    const committed = f.raw;
    assert.equal(reason(bench.confirm(p.token!)), 'stale', 'a retried confirm never applies twice');
    assert.equal(f.raw, committed);
});

test('not during a raid; a gun that has left the base is reported; a candidate that cannot be committed has no token', () => {
    const f = yard(p => { stocked(p); put(p.stash, gun('g17', 'gb17')); });
    const bench = f.runtime.openGunsmith('g17'), hand = f.runtime.openGunsmith('m4');
    // Not owned: previewed with its reason, no token; an illegal edit is refused and the previous preview stays.
    const lacking = bench.preview([{ kind: 'install', id: 'G01' }]);
    assert.ok(lacking.ok); assert.equal(lacking.token, undefined);
    assert.deepEqual(lacking.preview!.refusal, { code: 'unowned', reason: '还没有「G17 加长匣」。先买到，或换回已有的配件。' });
    assert.equal(bench.view().token, null);
    const shown = bench.view(), wrong = bench.preview([{ kind: 'install', id: 'G01' }, { kind: 'install', uid: 'g10' }]);
    assert.deepEqual([reason(wrong), !wrong.ok && wrong.message, wrong.edit], ['rule', '不适配这把枪', 1], 'the reason names the edit');
    assert.deepEqual(bench.view(), shown);
    assert.equal(reason(bench.confirm('gunsmith-1')), 'stale');
    assert.equal(reason(f.runtime.openGunsmith('nope').preview([])), 'missing-item');
    const none = hand.preview([]);
    assert.ok(none.ok && !none.token);
    assert.deepEqual(none.preview!.refusal, { code: 'unchanged', reason: '还没有改动。' });
    // In a raid nothing previews or commits, and the gun in hand is in the raid's loadout, not at the base.
    const ok = hand.preview(quickMag);
    assert.ok(ok.ok);
    const deployed = f.runtime.deploy({ world: 'coast', seed: '5' });
    assert.ok(deployed.ok);
    const raw = f.raw;
    assert.equal(reason(hand.preview(quickMag)), 'locked');
    assert.equal(reason(hand.confirm(ok.token!)), 'locked');
    assert.equal(hand.view().gun, null);
    assert.equal(f.raw, raw);
    assert.equal(planGunEdit(f.state.save, 'g17', [{ kind: 'install', uid: 'f01' }]).ok, false);
});

test('another window\'s write wins: the workbench commit is refused as a conflict and its bytes stay', () => {
    const f = yard(stocked), bench = f.runtime.openGunsmith('m4'), p = bench.preview(quickMag);
    // Another page writes a newer record first (here: the same base, one revision on).
    const other = JSON.stringify({ ...JSON.parse(f.raw), revision: f.saves.revision + 1 });
    f.data.set(SESSION_KEY, other);
    assert.equal(reason(bench.confirm(p.token!)), 'conflict');
    assert.equal(f.raw, other, 'the other window\'s bytes are never overwritten');
    assert.equal(f.state.conflict, true);
    assert.equal(reason(bench.preview(quickMag)), 'conflict');
});

test('a commit through the Runtime keeps every uid once and the stored record strictly valid', () => {
    const f = yard(p => {
        put(p.stash, gun('m4', 'mb4a1', [node('h01', 'H01', 'handguard', [node('t01', 'T01', 'side'), node('f03', 'F03', 'under')]), node('o08', 'O08', 'top')], { laser: true, light: false }));
        for (const [uid, id] of [['s01', 'S01'], ['p01', 'P01'], ['o03', 'O03']]) put(p.bag, { uid, id });
    });
    const before = structuredClone(f.state.save), bench = f.runtime.openGunsmith('m4');
    const p = bench.preview([{ kind: 'remove', uid: 'h01' }, { kind: 'remove', uid: 'o08' }, { kind: 'install', uid: 'o03' }, { kind: 'install', uid: 's01' }, { kind: 'install', uid: 'p01' }]);
    assert.ok(p.ok && p.token);
    assert.deepEqual(p.preview!.removals.map(r => [r.uid, r.with]), [['h01', null], ['t01', 'h01'], ['f03', 'h01'], ['o08', null]]);
    assert.ok(bench.confirm(p.token!).ok);
    const record = f.record, m4 = find(record.profile, 'm4')!;
    assert.deepEqual(m4.gun, { parts: [node('o03', 'O03', 'top'), node('s01', 'S01', 'stock'), node('p01', 'P01', 'grip')], devices: OFF });
    assert.deepEqual(parts(record.profile), parts(before));
    assert.deepEqual(uids(record.profile), uids(before));
    assert.deepEqual(gunUids({ uid: 'm4', parts: m4.gun!.parts }), ['m4', 'o03', 's01', 'p01']);
});
