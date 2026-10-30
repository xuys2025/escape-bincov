import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as D from '../src/domain';
import * as Shop from '../src/shop';
import { ATTACHMENTS, GUNS, isPremium, partTier } from '../src/gunsmith/catalog';
import { buildOf, factoryState, gunWeight, isGunId, type PartNode } from '../src/gunsmith/instance';
import { effectiveStats } from '../src/gunsmith/stats';
import { coneOf } from '../src/shooting';
import { decodeStoredProfile } from '../src/profile-codec';
import { arm, benchRaid, mouseHold, replay } from './fixtures/shooting-bench';

// #28 M2-01: G17 and M4A1 are real guns, and every "is it a gun" check reads one answer, D.isGun.
// #28 M2-02: the 20 sample attachments are items; only the workbench (M2-04, src/gunsmith/edit.ts) puts one on a gun.

const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path.split('\\').join('/')] : [];
});

test('one answer to "is it a gun": the WEAPONS rows but the knife, each a catalog gun and a weapon item', () => {
    const guns = Object.keys(D.WEAPONS).filter(id => D.isGun(id));
    assert.deepEqual(guns, ['pistol', 'shotgun', 'carbine', 'gb17', 'mb4a1', 'pb226', 'mpb5', 'vb9', 'mb870', 'mb1014', 'akb74', 'akb103', 'augb',
        'mb1911', 'umpb45', 'pb90', 'svdb', 'mb14', 'mb700', 'rpkb']);
    // Every catalog gun is an item since #28 M3-05.
    assert.deepEqual([...guns].sort(), Object.keys(GUNS).sort());
    // Every weapon item but the knife is a gun, and nothing else is.
    assert.deepEqual(Object.keys(D.ITEMS).filter(id => D.ITEMS[id].kind === 'weapon' && id !== 'knife'), guns);
    // Each is a catalog gun, so the gunsmith rules (instances, stats, saves) can read it.
    for (const id of guns) assert.ok(isGunId(id), id);
    // The knife, enemy weapon looks, the retired #39 sample id, catalog guns that are no items yet and odd values are not.
    for (const id of ['knife', 'rifle', 'club', 'claw', 'm4a1', 'smg', 'ammo45', 'ammo9', 'toString', '__proto__', '', null, undefined, ['pistol'], 7])
        assert.equal(D.isGun(id), false, String(id));
});

test('the gunsmith guns are items and weapons made from the catalog: stats, name, footprint, weight and prices', () => {
    for (const id of ['gb17', 'mb4a1', 'pb226', 'mpb5', 'vb9', 'mb870', 'mb1014', 'akb74', 'akb103', 'augb', 'mb1911', 'umpb45', 'pb90', 'svdb', 'mb14', 'mb700', 'rpkb'] as const) {
        const gun = GUNS[id], item = D.ITEMS[id];
        assert.deepEqual(D.WEAPONS[id], gun.stats, id);
        assert.notEqual(D.WEAPONS[id], gun.stats, `${id}: a copy, never the catalog's own object`);
        assert.deepEqual({ name: item.name, w: item.w, h: item.h, weight: item.weight, stack: item.stack, buy: item.buy, sell: item.sell, kind: item.kind },
            { name: gun.stats.name, w: gun.w, h: gun.h, weight: gun.weight, stack: 1, buy: gun.buy, sell: gun.sell, kind: 'weapon' }, id);
    }
    // Every gun's description states its factory capacity, the old three's included.
    for (const id of Object.keys(D.WEAPONS).filter(id => D.isGun(id))) assert.ok(D.ITEMS[id].description.includes(`${D.WEAPONS[id].magazine} 发`), id);
    // Born as factory instances wherever guns are born: a new item, the test driver, the range (gunsmith-readers.test.ts).
    const inv = D.createInventory(6, 5);
    assert.equal(D.addItem(inv, 'gb17'), 0); assert.equal(D.addItem(inv, 'mb4a1'), 0);
    for (const item of inv.items) assert.deepEqual(item.gun, { parts: [], devices: { laser: false, light: false } }, item.id);
    // The G17's magazine sits in its grip; the M4A1's hangs below, a second row (#28 M3-12).
    assert.deepEqual(inv.items.map(i => D.itemSize(i)), [{ w: 2, h: 1 }, { w: 4, h: 2 }]);
});

test('no "is it a gun" check outside the domain reads the weapon table or the catalog by itself', () => {
    for (const file of sources('src')) {
        if (file.startsWith('src/gunsmith/')) continue; // catalog membership is the gunsmith rules' own question
        const text = readFileSync(file, 'utf8');
        assert.deepEqual(text.match(/\bisGunId\(/g) ?? [], [], `${file}: use D.isGun`);
        assert.deepEqual(text.match(/WEAPONS\[[^\]]+\]\s*&&|hasOwn(?:StringKey)?\((?:D\.)?WEAPONS\b/g)?.filter(() => file !== 'src/domain.ts') ?? [], [], `${file}: use D.isGun`);
    }
    // The domain answers it once, from WEAPONS.
    assert.equal(readFileSync('src/domain.ts', 'utf8').match(/Object\.hasOwn\(WEAPONS,/g)?.length, 1);
});

const SAMPLE_PARTS = ['O01', 'O03', 'O08', 'M03', 'M06', 'B01', 'B08', 'H01', 'H05', 'S01', 'S02', 'P01', 'P02', 'F01', 'F03', 'G01', 'G10', 'T01', 'T05', 'A07'];
/** #28 M3-02: the forty wave-one parts (ART-SPEC 8.2), after M2's twenty. */
const WAVE_PARTS = ['A01', 'A02', 'A04', 'A05', 'A06', 'A08', 'B03', 'B05', 'B06', 'B07', 'B09', 'H02', 'H03', 'H04', 'H06', 'H07', 'H08', 'H09', 'S03', 'S04', 'S05',
    'S07', 'S08', 'P03', 'P04', 'P06', 'P07', 'G03', 'G06', 'G07', 'G08', 'G09', 'M01', 'M02', 'M05', 'M07', 'M10', 'M11', 'T04', 'T08'];
/** #28 M3-06, early: the six parts of wave two's P0 art (the AUG's two configurations), then the other 34. */
const WAVE_TWO_P0 = ['O05', 'O10', 'F04', 'F07', 'T02', 'T10'];
const WAVE_TWO = ['O02', 'O04', 'O06', 'O07', 'O09', 'O11', 'O12', 'M04', 'M08', 'M09', 'M12', 'B02', 'B04', 'B10', 'H10', 'S06', 'S09', 'S10', 'P05', 'P08',
    'F02', 'F05', 'F06', 'F08', 'G02', 'G04', 'G05', 'G11', 'G12', 'T03', 'T06', 'T07', 'T09', 'A03'];
const ITEM_PARTS = [...SAMPLE_PARTS, ...WAVE_PARTS, ...WAVE_TWO_P0, ...WAVE_TWO];
const node = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid, id, slot, relief: false, children });
/** The first free cell of `inv` for an item of `id` (a fixture helper: forged items are placed where they fit). */
function free(inv: D.Inventory, id: string) {
    for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++) if (D.fits(inv, id, x, y)) return { x, y };
    throw new Error(`no room for ${id}`);
}

test('the 100 attachments that are items are made from the catalog: function name, footprint, weight, prices, one per item', () => {
    // The factory magazines (#28 M4-07) are attachment items too, outside the catalog's hundred, and so are 老栓精工's
    // twenty (M4-09), after them in the catalog's order.
    assert.deepEqual(Object.keys(D.ITEMS).filter(id => D.isAttachment(id) && Object.hasOwn(ATTACHMENTS, id) && !isPremium(id)), ITEM_PARTS);
    const premium = Object.keys(ATTACHMENTS).filter(isPremium);
    assert.deepEqual(Object.keys(D.ITEMS).filter(id => isPremium(id)), [...premium].sort());
    for (const id of [...ITEM_PARTS, ...premium]) {
        const a = ATTACHMENTS[id], item = D.ITEMS[id];
        assert.deepEqual({ name: item.name, w: item.w, h: item.h, weight: item.weight, stack: item.stack, buy: item.buy, sell: item.sell, kind: item.kind },
            // A rare part sells on the late shelf only, at RARE_MARKUP times its catalog price (#28 M4-03).
            { name: a.name, w: a.w, h: a.h, weight: a.weight, stack: 1, buy: partTier(a) === 'rare' ? Math.round(a.buy * D.RARE_MARKUP / 10) * 10 : a.buy, sell: a.sell, kind: 'attachment' }, id);
        // The brand shows only in the details (maintainer, 2026-10-12): never in the name, the cell label or the description.
        assert.ok(!/北堤|盐湾|滨机|老栓精工/.test(item.name + item.short + item.description), id);
        // The cell label fits the cell: three characters in one cell, four in two.
        assert.ok([...item.short].length <= (item.w === 1 ? 3 : 4), `${id} ${item.short}`);
        assert.equal(D.isGun(id), false, id);
    }
    // Every catalog part is an item since #28 M3-06, 老栓精工's too (M4-09); nothing else is an attachment.
    assert.deepEqual([...ITEM_PARTS, ...premium].sort(), Object.keys(ATTACHMENTS).sort());
    for (const id of ['Z99', 'pistol', 'ammo9', 'ammo45', 'toString', '__proto__', '', null]) assert.equal(D.isAttachment(id), false, String(id));
    // Never stacked: two of a part are two items under two uids, no gun state, and a move never merges them.
    const inv = D.createInventory(6, 5);
    assert.equal(D.addItem(inv, 'O03', 2), 0);
    assert.equal(inv.items.length, 2); assert.notEqual(inv.items[0].uid, inv.items[1].uid);
    assert.ok(inv.items.every(i => i.qty === 1 && !('gun' in i)));
    assert.equal(D.moveItem(inv, inv.items[1].uid, inv.items[0].x, inv.items[0].y), false);
    assert.equal(inv.items.length, 2);
});

test('loose footprints (M0 review decision 9): long parts take 2x1, every other part 1x1, across all 120', () => {
    const LONG = ['O08', 'O09', 'O10', 'O11', 'M03', 'M04', 'M07', 'M08', 'M12', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10',
        'H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'F08', 'G09',
        // 老栓精工 (#28 M4-09): the far scope, the three suppressors, both handguards and the six stocks.
        'J02', 'J06', 'J07', 'J08', 'J10', 'J12', 'J13', 'J15', 'J16', 'J17', 'J19', 'J20'];
    for (const a of Object.values(ATTACHMENTS)) assert.deepEqual([a.w, a.h], LONG.includes(a.id) ? [2, 1] : [1, 1], a.id);
    // The sample: the long scope, the suppressor, the rifle barrel, both handguards and both stocks are long.
    assert.deepEqual(SAMPLE_PARTS.filter(id => ATTACHMENTS[id].w === 2), ['O08', 'M03', 'B08', 'H01', 'H05', 'S01', 'S02']);
    // Each fits the smallest store it can go into, the 2x2 safe (the 4x3 buy and sell lists are larger).
    for (const id of SAMPLE_PARTS) assert.equal(D.addItem(D.createInventory(2, 2), id), 0, id);
});

test('details: each attachment\'s maker and the guns a player can own that it fits, at once or with the part it needs', () => {
    const M4 = 'M4A1 模块步枪', CARBINE = '半自动卡宾枪', G17 = 'G17 通用手枪', P226 = 'P226 稳定手枪', MP5 = 'MP5 近战冲锋枪', VECTOR = 'Vector 9mm 高速冲锋枪';
    const M870 = 'M870 泵动霰弹枪', M1014 = 'M1014 半自动霰弹枪', AK74 = 'AK-74 稳定步枪', AK103 = 'AK-103 重型步枪', AUG = 'AUG 紧凑步枪';
    const M1911 = 'M1911 重型手枪', UMP = 'UMP45 重弹冲锋枪', P90 = 'P90 紧凑冲锋枪', SVD = 'SVD 精确步枪', M14 = 'M14 半自动精确步枪', M700 = 'M700 栓动步枪', RPK = 'RPK 支援机枪';
    // Since #28 M3-05 every catalog gun is a gun a player can own: the rail and optic parts fit many of them (the RPK's
    // rails come with H10, its optics with A08).
    const UNDER = [MP5, UMP, VECTOR, M870, M1014, CARBINE, AK74, AK103, M4, AUG, RPK], SIDE = [MP5, UMP, P90, VECTOR, M870, M1014, CARBINE, AK74, AK103, M4, AUG, RPK];
    const LONG = [CARBINE, AK74, AK103, M4, AUG, SVD, M14, M700, RPK];
    const expected: Record<string, [string, string[]]> = {
        O01: ['北堤', ['旧式手枪', G17, M1911, P226]], O03: ['北堤', [MP5, UMP, P90, VECTOR, '双管霰弹枪', M870, M1014, CARBINE, AK74, AK103, M4, AUG, SVD, M14, M700, RPK]], O08: ['北堤', LONG],
        M03: ['盐湾', [G17, P226, MP5, VECTOR]], M06: ['盐湾', [CARBINE, AK74, AK103, M4, AUG, RPK]], B01: ['滨机', [G17, P226]], B08: ['滨机', [M4]],
        H01: ['滨机', [M4]], H05: ['滨机', [CARBINE]], S01: ['滨机', [M4]], S02: ['滨机', [M4]], P01: ['滨机', [M4]], P02: ['滨机', [M4]],
        F01: ['滨机', UNDER], F03: ['滨机', UNDER], G01: ['滨机', [G17]], G10: ['滨机', [M4, AUG]],
        T01: ['盐湾', SIDE], T05: ['盐湾', SIDE], A07: ['滨机', [CARBINE]],
        // A few of wave one's: a gun's own part, a part three guns share, the pistols' side devices.
        A02: ['滨机', [P226]], A08: ['滨机', [AK74, AK103, RPK]], G09: ['滨机', [AK103, RPK]], M01: ['盐湾', ['旧式手枪', G17, P226, MP5, VECTOR]], T04: ['盐湾', [G17, M1911, P226]],
        // Wave two's: the long optic, a foregrip, a side device, the RPK's handguard, the bipod, a two-gun suppressor.
        O10: ['北堤', LONG], F07: ['滨机', UNDER], T10: ['盐湾', SIDE], H10: ['滨机', [RPK]], F08: ['滨机', [SVD, M14, M700, RPK]], M04: ['盐湾', [M1911, UMP]],
    };
    assert.deepEqual(Object.keys(expected).slice(0, 20), SAMPLE_PARTS);
    for (const [id, [brand, guns]] of Object.entries(expected)) assert.deepEqual(D.attachmentFacts(id), { brand, guns }, id);
    for (const id of ITEM_PARTS) assert.ok(D.attachmentFacts(id)!.guns.length > 0, `${id} fits a gun a player can own`);
    for (const id of ['pistol', 'ammo9', 'Z99', 'bandage']) assert.equal(D.attachmentFacts(id), null, id);
    // The three detail panels print them (the old tabs, the yard, the raid bag) through the shared lines (M2-08).
    const facts = readFileSync('src/gunsmith/item-facts.ts', 'utf8');
    assert.ok(facts.includes('D.attachmentFacts(') && facts.includes('制造商：'));
    for (const file of ['src/ui.ts', 'src/station-view/panels.ts', 'src/coast-view/inventory.ts']) assert.ok(readFileSync(file, 'utf8').includes('attachmentLines('), file);
});

test('saves: a loose attachment is a strictly checked plain item, its uid unique with every gun and part uid', () => {
    const profile = D.newSave();
    for (const id of SAMPLE_PARTS) assert.equal(D.addItem(profile.stash, id), 0, id);
    // A G17 with its extended magazine in the bag: an installed part's uid lives in the same uid space.
    assert.ok(D.placeItem(profile.bag, { uid: 'gun-g17', id: 'gb17', qty: 1, x: 0, y: 0, gun: { parts: [node('part-g01', 'G01', 'mag')], devices: { laser: false, light: false } } }));
    assert.deepEqual(decodeStoredProfile(structuredClone(profile)).stash.items, profile.stash.items);
    const refused = (what: string, change: (p: D.SaveDataV1) => void) => {
        const p = structuredClone(profile); change(p);
        assert.throws(() => decodeStoredProfile(p), /存档格式不支持/, what);
    };
    const loose = (p: D.SaveDataV1, id: string) => p.stash.items.find(i => i.id === id)!;
    const add = (p: D.SaveDataV1, item: Omit<D.Item, 'x' | 'y'>) => p.stash.items.push({ ...item, ...free(p.stash, 'O01') });
    refused('an unknown id', p => add(p, { uid: 'x-z99', id: 'Z99', qty: 1 }));
    refused('a gun state on an attachment', p => { loose(p, 'O03').gun = factoryState(); });
    refused('a stack of an attachment', p => { loose(p, 'O03').qty = 2; });
    refused('a loose part sharing an installed part\'s uid', p => { loose(p, 'O03').uid = 'part-g01'; });
    refused('a loose part sharing the gun\'s uid', p => { loose(p, 'O03').uid = 'gun-g17'; });
    refused('two loose parts under one uid', p => { loose(p, 'O03').uid = loose(p, 'O01').uid; });
    const g17 = (p: D.SaveDataV1) => p.bag.items.find(i => i.id === 'gb17')!.gun!;
    refused('an installed part of an unknown id', p => { g17(p).parts[0].id = 'Z99'; });
    refused('an installed part that does not fit the gun', p => { g17(p).parts[0] = node('part-b08', 'B08', 'barrel'); });
    // In a layered raid the same rules hold for the raid's own bag (validateExpansion).
    const b = benchRaid();
    const ticket = b.saves.prepareExpansionMutation(d => { assert.equal(D.addItem(d.expansion.raid!.loadout.bag, 'O03'), 0); });
    assert.ok(ticket); assert.equal(b.saves.commitExpansionMutation(ticket), 'committed');
    const bagPart = (l: D.RunLoadout) => l.bag.items.find(i => i.id === 'O03')!;
    assert.throws(() => b.saves.prepareExpansionMutation(d => { bagPart(d.expansion.raid!.loadout).uid = d.expansion.raid!.loadout.weaponUid!; }), /行动|存档/);
    assert.throws(() => b.saves.prepareExpansionMutation(d => { bagPart(d.expansion.raid!.loadout).gun = factoryState(); }), /行动|存档/);
});

test('attachments live in bags, on the ground, in crates and in the shop like any item, and stay loose', () => {
    const b = arm(benchRaid(), 'carbine'), r = b.runtime;
    const c = r.snapshot(); assert.equal(D.addItem(c.loadout.bag, 'H05'), 0); r.restore(c);
    const h05 = () => r.session.loadout!.bag.items.find(i => i.id === 'H05');
    // Dropped and picked up again: ground loot, then a bag item again, never a part of the carbine in hand.
    assert.equal(r.dropItem(h05()!.uid), 'committed');
    const ground = r.loot.find(l => l.id === 'H05')!;
    assert.ok(ground && !('gun' in ground)); assert.equal(h05(), undefined);
    assert.equal(r.pickupLoot(ground.uid), true);
    assert.ok(h05()); assert.deepEqual(r.session.loadout!.gun, factoryState());
    // A crate can hold them, and the raid checkpoints.
    const crate = r.containers.find(x => x.kind === 'crate')!;
    b.driver.container(crate.id, [{ id: 'O08', qty: 1 }, { id: 'T05', qty: 1 }]);
    assert.ok(r.checkpoint());
    // The shop buys them back at their sell price (what it stocks is M2-13's, gunsmith-acquire.test.ts).
    const save = D.newSave(); assert.equal(D.addItem(save.stash, 'S02'), 0);
    const cart = Shop.createCart(save, 'arms'), s02 = cart.stash.items.find(i => i.id === 'S02')!;
    assert.equal(Shop.shopQuote('stash', s02).total, ATTACHMENTS.S02.sell);
    assert.ok(Shop.moveShopItem(cart, 'stash', 'sell', s02.uid, 0, 0));
    const cash = save.cash;
    assert.deepEqual(Shop.settleCartResult(save, cart), { ok: true });
    assert.equal(save.cash, cash + ATTACHMENTS.S02.sell); assert.equal(D.count(save.stash, 'S02'), 0);
    assert.ok(!D.MERCHANTS.arms.stock.includes('S02'), 'a common part is found, never steady stock (M2-13; it may rotate onto the shelf, M4-01)');
});

test('nothing but the workbench (M2-04) installs an attachment: equipping refuses one, and nothing else writes a gun\'s parts', () => {
    const save = D.newSave(); assert.equal(D.addItem(save.bag, 'O03'), 0);
    const uid = save.bag.items.find(i => i.id === 'O03')!.uid, before = structuredClone(save);
    assert.equal(D.equip(save, uid), false); assert.deepEqual(save, before);
    const loadout: D.RunLoadout = { ...structuredClone(save.equipment), bag: structuredClone(save.bag), safe: D.createInventory(2, 2) };
    assert.equal(D.equipRun(loadout, uid), false); assert.deepEqual(loadout.gun, before.equipment.gun);
    // No module outside the gunsmith rules assigns or splices a gun's parts, children or switches.
    for (const file of sources('src')) {
        if (file.startsWith('src/gunsmith/')) continue;
        const text = readFileSync(file, 'utf8');
        assert.deepEqual(text.match(/\.(?:parts|children)\s*=(?!=)|\.(?:parts|children)\.(?:push|splice|unshift|pop|shift)\(|\.devices(?:\.(?:laser|light))?\s*=(?!=)/g) ?? [], [], file);
    }
});

test('a fitted M4A1 fires differently in the Runtime: magazine, recoil, cone and weight; a factory one stays as it was', () => {
    // The steady direction of PLAN section 11, its feed swapped for the quick magazine: H01 with F01 under it, S02, M06, G10, O03.
    const parts = [node('fit-h01', 'H01', 'handguard', [node('fit-f01', 'F01', 'under')]), node('fit-s02', 'S02', 'stock'),
        node('fit-m06', 'M06', 'muzzle'), node('fit-g10', 'G10', 'mag'), node('fit-o03', 'O03', 'top')];
    const factory = arm(benchRaid(), 'mb4a1'), fitted = arm(benchRaid(), 'mb4a1');
    const s = fitted.runtime.snapshot();
    s.loadout.gun = { parts: structuredClone(parts), devices: { laser: false, light: false } };
    s.loadout.ammo = D.equippedWeapon(s.loadout).magazine; s.loadout.ammoRelief = 0;
    fitted.runtime.restore(s);
    fitted.runtime.handling = { raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 };
    const f = factory.runtime, m = fitted.runtime, stats = effectiveStats(buildOf({ id: 'mb4a1', parts }));
    // The factory gun reads its catalog row; the fitted one its build.
    assert.deepEqual([f.currentWeapon, f.grip], [D.WEAPONS.mb4a1, GUNS.mb4a1.handling]);
    assert.deepEqual([m.currentWeapon, m.grip], [stats.weapon, stats.handling]);
    assert.deepEqual([f.currentWeapon.magazine, m.currentWeapon.magazine, m.mag], [30, 20, 20]);
    assert.ok(m.reloadTime < f.reloadTime, 'the quick magazine reloads faster');
    // Recoil: brake, stock and foregrip together reach the guardrail, 60% of the factory bloom and kick.
    for (const k of ['bloom', 'bloomMax', 'kick', 'kickMax'] as const) assert.ok(Math.abs(m.grip[k] - GUNS.mb4a1.handling[k] * .6) < 1e-15, k);
    // The same held burst: ten shots each; the fitted gun ends it less bloomed and drifted, with fewer rounds left.
    const a = replay(factory, mouseHold(0, .95), 1.2, 60), z = replay(fitted, mouseHold(0, .95), 1.2, 60);
    assert.deepEqual([a.shots.length, z.shots.length], [10, 10]);
    assert.ok(z.aims.at(-1)!.drift < a.aims.at(-1)!.drift && z.aims.at(-1)!.cone < a.aims.at(-1)!.cone, JSON.stringify([a.aims.at(-1), z.aims.at(-1)]));
    assert.deepEqual([f.mag, m.mag], [20, 10]);
    // A raised aim is tighter through the red dot (O03), from the same calm stance (the cone the HUD and a shot take).
    const calm = { raise: 1, sway: 0, bloom: 0, drift: 0, settle: 0 };
    assert.ok(Math.abs(coneOf(calm, m.currentWeapon, m.grip) / coneOf(calm, f.currentWeapon, f.grip) - .9) < 1e-12);
    // Weight: every part counts on the gun, and the fewer rounds left in it weigh less.
    const kg = gunWeight({ id: 'mb4a1', parts }) - GUNS.mb4a1.weight + (m.mag - f.mag) * D.ITEMS.ammoR.weight;
    assert.ok(Math.abs(m.carriedWeight() - f.carriedWeight() - kg) < 1e-9, `${m.carriedWeight()} ${f.carriedWeight()} ${kg}`);
    // It checkpoints as the same fitted instance.
    assert.ok(m.checkpoint());
    assert.deepEqual(fitted.saves.currentRecord()!.expansion!.raid!.loadout.gun!.parts, parts);
});
