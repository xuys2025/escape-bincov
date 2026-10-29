import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { decodeStoredProfile } from '../src/profile-codec';
import { planGunEdit, type GunEditPlan } from '../src/gunsmith/edit';
import { FACTORY_MAGS, GUNS, factoryMagOf, partDef, type GunId } from '../src/gunsmith/catalog';
import { buildOf, detachable, gunSale, gunSize, gunWeight, magless, validateGun } from '../src/gunsmith/instance';
import { effectiveWeapon } from '../src/gunsmith/stats';
import { benchGuns, benchParts, magEdits, partFits, positions } from '../src/gunsmith/bench';
import { gunPartsLine, saleLines } from '../src/gunsmith/item-facts';
import { NO_MAG, drawnParts, partsOfSignature, partsSignature } from '../src/gunsmith/signature';
import { gunArtLayout } from '../src/art/gunsmith-layout';
import { GUNSMITH_ART } from '../src/art/gunsmith-art-meta';
import { FACTORY_MAG_ART } from '../src/art/items';
import { artId } from '../src/art/item-images';
import { OFF, gun, hold, node, put, yard } from './fixtures/workbench';

// #28 M4-07 (#142, maintainer 2026-10-29): the factory magazine comes off at the workbench. The gun is one row again,
// holds nothing and cannot fire; the magazine is a loose item of its own that only its gun type takes back, and put back
// the gun is as it was. Rules in docs/gunsmith/CONTRACTS.md, 「拆下弹匣（M4-07）」.

const DETACHABLE: GunId[] = ['mpb5', 'umpb45', 'akb74', 'akb103', 'mb4a1', 'augb', 'mb14', 'rpkb'];
function base(): D.SaveDataV1 {
    const p = D.newSave();
    p.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2);
    p.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
    return p;
}
function done(plan: GunEditPlan) {
    assert.ok(plan.ok, plan.ok ? '' : `${plan.code}: ${plan.reason}`);
    return plan as Extract<GunEditPlan, { ok: true }>;
}
function refused(plan: GunEditPlan, code: string, edit: number | null, reason?: string) {
    assert.equal(plan.ok, false);
    const r = plan as Extract<GunEditPlan, { ok: false }>;
    assert.deepEqual([r.code, r.edit], [code, edit], r.reason);
    if (reason) assert.equal(r.reason, reason);
}
const items = (p: D.SaveDataV1) => [...p.stash.items, ...p.bag.items, ...p.safe.items];
const find = (p: D.SaveDataV1, uid: string) => items(p).find(i => i.uid === uid);
const out = <T extends object>(state: T) => ({ ...state, magOut: true as const });

test('the factory magazines: the box magazines that make a gun two rows and are their own layer, items outside the shelf and the finds', () => {
    // Every two-row gun but the SVD and the Vector, whose magazines are painted on the receiver (Sol redraws them).
    const twoRows = (Object.keys(GUNS) as GunId[]).filter(id => GUNS[id].h === 2);
    assert.deepEqual(twoRows.filter(id => !detachable(id)).sort(), ['svdb', 'vb9']);
    assert.deepEqual(Object.keys(FACTORY_MAGS).sort(), [...DETACHABLE].sort());
    for (const gunId of DETACHABLE) {
        const id = FACTORY_MAGS[gunId]!, def = partDef(id), item = D.ITEMS[id];
        assert.equal(id, `${gunId}-mag`); assert.equal(factoryMagOf(id), gunId);
        assert.ok(GUNSMITH_ART[`gs-${gunId}-mag-factory-i`], `${gunId}: its magazine is a layer of its own`);
        assert.deepEqual([item.kind, item.w, item.h, item.stack, item.name, item.buy, item.sell], ['attachment', 1, 1, 1, def.name, def.buy, def.sell]);
        assert.ok(item.name.endsWith('原厂弹匣') && item.description.includes(`容量 ${GUNS[gunId].stats.magazine} 发`), item.name);
        assert.deepEqual(def.mods, { weight: 0 }, 'on the gun it is the factory part: no factor, no capacity of its own');
        assert.ok(def.weight > 0 && def.weight < GUNS[gunId].weight && def.sell < GUNS[gunId].sell);
        assert.deepEqual(D.attachmentFacts(id), { brand: '原厂', guns: [D.WEAPONS[gunId].name] });
        assert.ok(!D.MERCHANTS.arms.stock.includes(id) && !benchParts().includes(id), 'only ever off a gun, never a shelf or a bench candidate');
    }
    // Each has an inventory picture: its gun's magazine image (gunsmith-compose.ts) until Sol draws an icon.
    assert.deepEqual([...FACTORY_MAG_ART], Object.values(FACTORY_MAGS));
    for (const id of Object.values(FACTORY_MAGS)) assert.equal(artId(id!), id);
    for (const id of ['pistol', 'gb17', 'pb90', 'mb870', 'svdb', 'vb9', 'mb700']) assert.equal(detachable(id), false, id);
    for (const id of ['G08', 'svdb-mag', 'mpb5', 'toString', '']) assert.equal(factoryMagOf(id), null, id);
});

test('a gun without its magazine: one row, lighter by the magazine, the body sells without it, capacity 0; another magazine makes it whole', () => {
    for (const id of DETACHABLE) {
        const mag = partDef(FACTORY_MAGS[id]!), bare = { id, parts: [], magOut: true as const };
        assert.deepEqual(gunSize(bare), { w: GUNS[id].w, h: 1 }); assert.deepEqual(gunSize(bare, true), { w: 1, h: GUNS[id].w });
        assert.equal(gunWeight(bare), Math.round((GUNS[id].weight - mag.weight) * 1000) / 1000);
        // Gun and magazine sold apart pay what the whole gun pays.
        assert.equal(gunSale({ ...bare, relief: false }).value + mag.sell, gunSale({ id, parts: [], relief: false }).value);
        assert.equal(effectiveWeapon(buildOf(bare)).magazine, 0);
        assert.ok(magless(true, []) && !magless(undefined, []) && !magless(true, [{ slot: 'mag', parent: null }]));
    }
    // An AK-74 with its magazine out takes the extended one: three rows and 45 rounds; the body still sells without its own.
    const g08 = [node('g08', 'G08', 'mag')], ak = { id: 'akb74' as const, parts: g08, magOut: true as const };
    assert.deepEqual(gunSize(ak), { w: 4, h: 3 }); assert.equal(effectiveWeapon(buildOf(ak)).magazine, 45);
    assert.equal(gunWeight(ak), gunWeight({ id: 'akb74', parts: g08 }), 'the replacing weight is the same either way');
    assert.equal(gunSale({ ...ak, relief: false }).value, gunSale({ id: 'akb74', parts: g08, relief: false }).value - partDef('akb74-mag').sell);
});

test('a stored magOut is strict: only true, only on a gun whose magazine comes off; the codec reads it back unchanged', () => {
    assert.deepEqual(validateGun('mb4a1', 'm4', out({ parts: [], devices: OFF })), { ok: true });
    for (const bad of [{ parts: [], devices: OFF, magOut: false }, { parts: [], devices: OFF, magOut: 1 }, { parts: [], devices: OFF, magOut: true, extra: 1 }])
        assert.equal(validateGun('mb4a1', 'm4', bad).ok, false, JSON.stringify(bad));
    for (const id of ['gb17', 'svdb', 'vb9', 'pistol', 'mb870']) assert.equal(validateGun(id, 'g', out({ parts: [], devices: OFF })).ok, false, id);
    // A factory magazine is never a node: put back, it is the factory part again.
    assert.equal(validateGun('mb4a1', 'm4', out({ parts: [node('m', 'mb4a1-mag', 'mag')], devices: OFF })).ok, false);
    const p = base();
    put(p.stash, { ...gun('m4', 'mb4a1'), gun: out({ parts: [], devices: OFF }) });
    put(p.stash, { uid: 'mag', id: 'mb4a1-mag' });
    hold(p, 'ak', 'akb74'); p.equipment.gun!.magOut = true;
    assert.deepEqual(decodeStoredProfile(structuredClone(p)), p);
    const wrong = structuredClone(p); (wrong.equipment.gun as { magOut: unknown }).magOut = false;
    assert.throws(() => decodeStoredProfile(wrong));
});

test('eject: the factory magazine goes into the stash as its own item, relief as the body; the gun is a row shorter', () => {
    for (const relief of [false, true]) {
        const p = base();
        put(p.stash, gun('m4', 'mb4a1', [], OFF, relief ? { relief: true } : {}));
        const before = structuredClone(p), plan = done(planGunEdit(p, 'm4', [{ kind: 'eject' }]));
        assert.deepEqual(p, before, 'planning never writes its input');
        const v = plan.preview;
        assert.deepEqual(v.after, { parts: [], devices: OFF, magOut: true });
        assert.deepEqual(v.removals, [{ uid: 'mag-m4', id: 'mb4a1-mag', with: null }]);
        assert.deepEqual([v.size.before, v.size.after], [{ w: 4, h: 2 }, { w: 4, h: 1 }]);
        assert.deepEqual([v.capacity.before, v.capacity.after], [30, 0]);
        assert.equal(v.weight.after, Math.round((GUNS.mb4a1.weight - partDef('mb4a1-mag').weight) * 1000) / 1000);
        const mag = find(plan.profile, 'mag-m4')!;
        assert.deepEqual([mag.id, mag.qty, !!mag.relief], ['mb4a1-mag', 1, relief]);
        assert.deepEqual(find(plan.profile, 'm4')!.gun, { parts: [], devices: OFF, magOut: true });
        assert.deepEqual(decodeStoredProfile(structuredClone(plan.profile)), plan.profile, 'the strict codec reads it back');
    }
    // The uid is another free one when `mag-<gun>` is taken.
    const p = base();
    put(p.stash, gun('m4', 'mb4a1')); put(p.stash, { uid: 'mag-m4', id: 'scrap' });
    assert.deepEqual(done(planGunEdit(p, 'm4', [{ kind: 'eject' }])).preview.removals.map(r => r.uid), ['mag-2-m4']);
});

test('eject from the gun in hand unloads every round into the stash, ordinary and relief apart', () => {
    const p = base();
    hold(p, 'ak', 'akb74', [], 30, 4);
    const plan = done(planGunEdit(p, 'ak', [{ kind: 'eject' }]));
    assert.deepEqual(plan.preview.unloaded, { ammo: 'ammoR', normal: 26, relief: 4 });
    assert.deepEqual([plan.profile.equipment.ammo, plan.profile.equipment.ammoRelief, plan.profile.equipment.gun!.magOut], [0, 0, true]);
    assert.deepEqual(plan.profile.stash.items.filter(i => i.id === 'ammoR').map(i => [i.qty, !!i.relief]), [[26, false], [4, true]]);
    assert.ok(D.equippedMagless(plan.profile.equipment)); assert.equal(D.equippedWeapon(plan.profile.equipment).magazine, 0);
});

test('put back: a loose factory magazine of this gun type ends magOut and is used up; out and back in one list changes nothing', () => {
    const p = base();
    put(p.stash, { ...gun('m4', 'mb4a1'), gun: out({ parts: [], devices: OFF }) });
    put(p.bag, { uid: 'mag', id: 'mb4a1-mag' });
    const plan = done(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'mag' }]));
    assert.deepEqual(plan.preview.after, { parts: [], devices: OFF }, 'the gun is a factory gun again');
    assert.deepEqual(plan.preview.installs, [{ uid: 'mag', id: 'mb4a1-mag', parent: null, slot: 'mag', from: 'bag' }]);
    assert.equal(find(plan.profile, 'mag'), undefined); assert.deepEqual(gunSize({ id: 'mb4a1', ...find(plan.profile, 'm4')!.gun! }), { w: 4, h: 2 });
    // Out and back in, at the mag slot or with no place named: nothing to confirm.
    const q = base(); put(q.stash, gun('m4', 'mb4a1'));
    for (const at of [undefined, { parent: null, slot: 'mag' as const }])
        refused(planGunEdit(q, 'm4', [{ kind: 'eject' }, { kind: 'install', uid: 'mag-m4', ...at ? { at } : {} }]), 'unchanged', null);
    // A magazine put back and taken out again in one list stays where it was.
    refused(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'mag' }, { kind: 'eject' }]), 'unchanged', null);
});

test('the magazine slot keeps the factory rule: a replacing magazine on a gun with its own keeps that one inside; with its own out, taking it off leaves none', () => {
    const p = base();
    put(p.stash, gun('ak', 'akb74', [node('g08', 'G08', 'mag')]));
    const back = done(planGunEdit(p, 'ak', [{ kind: 'remove', uid: 'g08' }]));
    assert.deepEqual(back.preview.after, { parts: [], devices: OFF }); assert.deepEqual(back.preview.size.after, { w: 4, h: 2 });
    const q = base();
    put(q.stash, { ...gun('ak', 'akb74', [node('g08', 'G08', 'mag')]), gun: out({ parts: [node('g08', 'G08', 'mag')], devices: OFF }) });
    const none = done(planGunEdit(q, 'ak', [{ kind: 'remove', uid: 'g08' }]));
    assert.deepEqual(none.preview.after, { parts: [], devices: OFF, magOut: true }); assert.deepEqual(none.preview.size.after, { w: 4, h: 1 });
    assert.equal(none.preview.capacity.after, 0);
    // Out, then the extended one in: three rows, 45 rounds.
    const r = base(); put(r.stash, gun('ak', 'akb74')); put(r.stash, { uid: 'g08', id: 'G08' });
    const ext = done(planGunEdit(r, 'ak', [{ kind: 'eject' }, { kind: 'install', uid: 'g08' }]));
    assert.deepEqual([ext.preview.size.after, ext.preview.capacity.after, ext.preview.after.magOut], [{ w: 4, h: 3 }, 45, true]);
    assert.ok(find(ext.profile, 'mag-ak'));
});

test('refusals: a fixed magazine, one out already, one on, another gun type, a relief magazine on an ordinary gun, another place', () => {
    const p = base();
    put(p.stash, gun('g17', 'gb17')); put(p.stash, gun('svd', 'svdb'));
    put(p.stash, gun('ak', 'akb74', [node('g08', 'G08', 'mag')]));
    put(p.stash, { ...gun('m4', 'mb4a1'), gun: out({ parts: [], devices: OFF }) });
    put(p.stash, gun('m4b', 'mb4a1'));
    put(p.stash, { uid: 'akmag', id: 'akb74-mag' }); put(p.stash, { uid: 'rmag', id: 'mb4a1-mag', relief: true });
    put(p.stash, { uid: 'mag', id: 'mb4a1-mag' });
    refused(planGunEdit(p, 'g17', [{ kind: 'eject' }]), 'mag', 0, '这把枪的弹匣不能拆下。');
    refused(planGunEdit(p, 'svd', [{ kind: 'eject' }]), 'mag', 0, '这把枪的弹匣不能拆下。');
    refused(planGunEdit(p, 'm4', [{ kind: 'eject' }]), 'mag', 0, '这把枪的原厂弹匣已经拆下了。');
    refused(planGunEdit(p, 'm4b', [{ kind: 'eject' }, { kind: 'eject' }]), 'mag', 1, '这把枪的原厂弹匣已经拆下了。');
    refused(planGunEdit(p, 'ak', [{ kind: 'eject' }]), 'mag', 0, '先拆下装着的弹匣。');
    refused(planGunEdit(p, 'm4b', [{ kind: 'install', uid: 'mag' }]), 'mag', 0, '这把枪的原厂弹匣还在枪上。');
    refused(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'akmag' }]), 'mag', 0, 'AK-74 原厂弹匣只能装回AK-74 稳定步枪。');
    refused(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'rmag' }]), 'mag', 0, '救济的原厂弹匣只能装回救济枪。');
    refused(planGunEdit(p, 'm4', [{ kind: 'install', uid: 'mag', at: { parent: null, slot: 'stock' } }]), 'place', 0);
    refused(planGunEdit(p, 'm4b', [{ kind: 'eject' }, { kind: 'install', uid: 'mag-m4b', at: { parent: null, slot: 'stock' } }]), 'place', 1);
    // A relief magazine goes back on a relief gun, an ordinary one on any of its type.
    const q = base();
    put(q.stash, { ...gun('m4', 'mb4a1', [], OFF, { relief: true }), gun: out({ parts: [], devices: OFF }) });
    put(q.stash, { uid: 'rmag', id: 'mb4a1-mag', relief: true });
    assert.ok(done(planGunEdit(q, 'm4', [{ kind: 'install', uid: 'rmag' }])));
    // No room in the stash for the magazine: nothing is planned. (A gun in the stash frees its own row for it.)
    const full = base(); full.stash = D.createInventory(1, 1); put(full.stash, { uid: 's', id: 'scrap' }); hold(full, 'm4', 'mb4a1');
    refused(planGunEdit(full, 'm4', [{ kind: 'eject' }]), 'space', null);
});

test('the bench: the mag position says the magazine is out; its two cards append the edits; a loose factory magazine fits only its own guns', () => {
    const p = base();
    put(p.stash, { ...gun('m4', 'mb4a1'), gun: out({ parts: [], devices: OFF }) });
    put(p.stash, gun('m4b', 'mb4a1')); put(p.stash, gun('ak', 'akb74', [node('g08', 'G08', 'mag')]));
    put(p.bag, { uid: 'mag', id: 'mb4a1-mag' }); put(p.bag, { uid: 'rmag', id: 'mb4a1-mag', relief: true });
    const guns = benchGuns(p), m4 = guns.find(g => g.uid === 'm4')!, m4b = guns.find(g => g.uid === 'm4b')!, ak = guns.find(g => g.uid === 'ak')!;
    const at = (g: typeof m4) => { const build = buildOf({ id: g.id, ...g.state }); return { build, at: positions(build).find(x => x.slot === 'mag' && x.parent === null)! }; };
    assert.equal(at(m4).at.out, true); assert.equal(at(m4b).at.out, false); assert.equal(at(ak).at.out, false);
    assert.deepEqual(magEdits(p, m4, at(m4).build, at(m4).at, 'factory', null), { edits: [{ kind: 'install', uid: 'mag' }] }, 'an ordinary one, not the relief one');
    assert.deepEqual(magEdits(p, m4, at(m4).build, at(m4).at, 'factory', 'mag-m4'), { edits: [{ kind: 'install', uid: 'mag-m4' }] }, 'the one this preview took out first');
    assert.deepEqual(magEdits(p, m4b, at(m4b).build, at(m4b).at, 'empty', null), { edits: [{ kind: 'eject' }] });
    assert.deepEqual(magEdits(p, ak, at(ak).build, at(ak).at, 'empty', null), { edits: [{ kind: 'remove', uid: 'g08' }, { kind: 'eject' }] });
    assert.deepEqual(magEdits(p, ak, at(ak).build, at(ak).at, 'factory', null), { edits: [{ kind: 'remove', uid: 'g08' }] });
    const bare = base(); put(bare.stash, { ...gun('m4', 'mb4a1'), gun: out({ parts: [], devices: OFF }) });
    const g = benchGuns(bare)[0], b = buildOf({ id: g.id, ...g.state });
    assert.deepEqual(magEdits(bare, g, b, positions(b).find(x => x.slot === 'mag')!, 'factory', null), { reason: '基地里没有能装回的M4A1 原厂弹匣。' });
    assert.deepEqual(partFits(p, 'mb4a1-mag').map(f => [f.uid, f.reason]), [['m4', null], ['m4b', '它的原厂弹匣还在枪上']]);
    assert.deepEqual(partFits(p, 'akb74-mag').map(f => [f.uid, f.reason]), [['ak', '它的原厂弹匣还在枪上']]);
});

test('details, sale preview and pictures: a gun without its magazine says so, sells without it and is drawn without it', () => {
    const item = { uid: 'm4', id: 'mb4a1', qty: 1, x: 0, y: 0, gun: out({ parts: [], devices: OFF }) };
    assert.equal(gunPartsLine(item), '没装弹匣，不能开火');
    assert.equal(gunPartsLine({ ...item, gun: out({ parts: [node('g10', 'G10', 'mag')], devices: OFF }) }), '已装：模块步枪快换匣');
    assert.deepEqual(saleLines(item), [`枪身 M4A1 模块步枪（不含原厂弹匣）：¥ ${GUNS.mb4a1.sell - partDef('mb4a1-mag').sell}`]);
    assert.equal(saleLines({ ...item, gun: { parts: [], devices: OFF } }), null);
    // The art draws no magazine: a stand-in in the mag slot, carried by the signature the raid publishes.
    const drawn = drawnParts(item.gun);
    assert.deepEqual(drawn.map(n => [n.id, n.slot]), [[NO_MAG, 'mag']]);
    assert.equal(drawnParts({ parts: [] }).length, 0);
    assert.deepEqual(partsOfSignature(partsSignature(drawn))!.map(n => n.id), [NO_MAG]);
    for (const code of ['h', 'i', 'w'] as const) {
        const whole = gunArtLayout('mb4a1', [], code)!, bare = gunArtLayout('mb4a1', drawn, code)!;
        assert.ok(whole.layers.some(l => l.label === 'mag') && !bare.layers.some(l => l.label === 'mag'), code);
        assert.notEqual(whole.key, bare.key, `${code}: its own cache key`);
    }
});

test('the hideout: a confirmed eject is one write the record reads back; with the gun in hand the player cannot deploy', () => {
    const y = yard(p => { hold(p, 'ak', 'akb74', [], 30, 0); });
    const s = y.runtime.openGunsmith('ak'), r = s.preview([{ kind: 'eject' }]);
    assert.ok(r.ok && r.token, JSON.stringify(r));
    const writes = y.writes;
    assert.ok(s.confirm(r.token!).ok); assert.equal(y.writes, writes + 1);
    const saved = y.record.profile;
    assert.deepEqual([saved.equipment.gun!.magOut, saved.equipment.ammo], [true, 0]);
    assert.ok(saved.stash.items.some(i => i.uid === 'mag-ak' && i.id === 'akb74-mag'));
    assert.equal(D.deployBlocker(saved), D.NO_MAG_BLOCKS_DEPLOY);
    const deploy = y.runtime.deploy({ world: 'buildings', seed: '1' });
    assert.deepEqual([deploy.ok, !deploy.ok && deploy.message], [false, D.NO_MAG_BLOCKS_DEPLOY]);
    assert.equal(y.saves.beginRun(1, true), false, 'the session refuses it too');
    // Put back, it deploys again.
    const t = y.runtime.openGunsmith('ak'), back = t.preview([{ kind: 'install', uid: 'mag-ak' }]);
    assert.ok(back.ok && back.token); assert.ok(t.confirm(back.token!).ok);
    assert.equal(D.deployBlocker(y.record.profile), null);
});
