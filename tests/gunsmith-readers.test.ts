import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import { coneOf, driftOf, handlingOf } from '../src/shooting';
import { perkEffects, rpgMultipliers } from '../src/rpg';
import type { PerkId } from '../src/perks';
import { createRangeRaid, ShootingRange } from '../src/range/raid';
import { SaveSession, createSessionState } from '../src/session';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { arm, benchRaid, perkBench, type Bench } from './fixtures/shooting-bench';
import { decodeStoredProfile } from '../src/profile-codec';
import { effectiveWeapon } from '../src/gunsmith/stats';
import { buildOf, gunWeight, type PartNode } from '../src/gunsmith/instance';

// #28 M1-05: every reader of the equipped gun's numbers goes through the gunsmith entry (D.equippedGun, the equipped
// instance, and the effective stats of its parts). Nothing can modify the old three guns yet, so each reader must give
// exactly what it gave when it looked WEAPONS, handlingOf and ITEMS up by id. The oracles below are those old readers,
// copied from before M1-05.

const FACTORY = ['pistol', 'shotgun', 'carbine'] as const;
/** An equipped slot as the saves keep it: `weapon` as one instance with `parts` (a factory gun by default), or no gun. */
const slot = (weapon: string | null, parts: PartNode[] = []) => weapon && weapon !== 'knife'
    ? { weapon, weaponUid: `held-${weapon}`, gun: { parts, devices: { laser: false, light: false } }, relief: false }
    : { weapon, weaponUid: null, gun: null, relief: false };
const integer = (value: unknown, fallback = 0, max = 1e9) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
const isGun = (id: unknown): id is string => typeof id === 'string' && id !== 'knife' && Object.hasOwn(D.WEAPONS, id);
/** The old domain cleanMagazine: the stored magazine clamped to WEAPONS[id].magazine. */
function oldClean(weaponId: unknown, current: unknown, relief: unknown): D.Magazine {
    const ammo = isGun(weaponId) ? integer(current, 0, D.WEAPONS[weaponId].magazine) : 0;
    return { ammo, ammoRelief: integer(relief, 0, ammo) };
}
/** The old domain reloadMagazine, by weapon id. */
function oldReload(weaponId: string, current: number, currentRelief: number, bag: D.Inventory): D.Magazine {
    const magazine = oldClean(weaponId, current, currentRelief);
    if (!isGun(weaponId)) return magazine;
    const weapon = D.WEAPONS[weaponId];
    for (const relief of [true, false]) for (const entry of bag.items) {
        if (entry.id !== weapon.ammo || !!entry.relief !== relief) continue;
        const take = Math.min(entry.qty, weapon.magazine - magazine.ammo);
        entry.qty -= take;
        magazine.ammo += take;
        if (relief) magazine.ammoRelief += take;
    }
    bag.items = bag.items.filter(entry => entry.qty > 0);
    return magazine;
}
/** The old CoastRaidRuntime.carriedWeight (no sample gun in hand), by the loadout's weapon id. */
function oldCarried(r: Bench['runtime']): number {
    const l = r.session.loadout!, w = D.WEAPONS[l.weapon || 'knife'];
    return D.weight(l.bag) + D.weight(l.safe) + (l.weapon ? D.ITEMS[l.weapon].weight : 0) + D.ITEMS.knife.weight
        + (w.ammo ? D.ITEMS[w.ammo].weight * r.mag : 0) + (r.layered?.charm ? D.ITEMS[r.layered.charm.id].weight : 0);
}

test('the equipped gun\'s instance, weapon and weight: the old three read as from WEAPONS and ITEMS, through the gunsmith', () => {
    for (const id of FACTORY) {
        const held = slot(id), w = D.equippedWeapon(held);
        assert.deepEqual(D.equippedGun(held), { uid: `held-${id}`, id, relief: false, parts: [], devices: { laser: false, light: false } });
        assert.deepEqual(w, D.WEAPONS[id]);
        assert.notEqual(w, D.WEAPONS[id], 'the effective stats, worked out fresh, not the table row');
        assert.equal(D.equippedWeight(held), D.ITEMS[id].weight);
    }
    // No gun is the knife: its row, no weight. Neither the knife, the retired #39 sample id nor an old look id is a gun
    // (D.isGun, #28 M2-01; every catalog gun is an item since M3-05).
    for (const weapon of [null, 'knife']) {
        assert.equal(D.equippedGun(slot(weapon)), null);
        assert.equal(D.equippedWeapon(slot(weapon)), D.WEAPONS.knife);
        assert.equal(D.equippedWeight(slot(weapon)), 0);
    }
    for (const weapon of ['m4a1', 'rifle']) assert.equal(D.equippedGun({ ...slot(null), weapon }), null, weapon);
});

test('the readers take the equipped instance\'s own parts, and refuse a gun slot without its instance', () => {
    // No old gun has a feed module, and G17 becomes an item only in M2-01, so a G17 with its extended magazine (17 to
    // 24 rounds, heavier) shows the instance's parts reach every reader: capacity, numbers, weight, reload, the raid.
    const g01: PartNode = { uid: 'part-g01', id: 'G01', slot: 'mag', relief: false, children: [] };
    const modded = slot('gb17', [g01]), factory = slot('gb17');
    assert.deepEqual([D.equippedWeapon(factory).magazine, D.equippedWeapon(modded).magazine], [17, 24]);
    assert.deepEqual(D.equippedWeapon(modded), effectiveWeapon(buildOf({ id: 'gb17', parts: [g01] })));
    assert.equal(D.equippedWeight(modded), gunWeight({ id: 'gb17', parts: [g01] }));
    assert.ok(D.equippedWeight(modded) > D.equippedWeight(factory));
    const bag = D.createInventory(6, 5); D.addItem(bag, 'ammo9', 40);
    assert.deepEqual(D.reloadMagazine(modded, 3, 0, bag), { ammo: 24, ammoRelief: 0 });
    assert.equal(D.count(bag, 'ammo9'), 19);
    // A raid starts and settles with the magazine the instance holds: 24 is kept, more is cut to 24, never to 17.
    const save = D.newSave(), at = save.equipment.weaponUid;
    save.equipment = { ...modded, weaponUid: at, ammo: 24, ammoRelief: 5 };
    const loadout = D.beginRun(save, 7);
    assert.deepEqual([loadout.weaponUid, loadout.gun, loadout.ammo, loadout.ammoRelief], [at, modded.gun, 24, 5]);
    loadout.ammo = 30;
    assert.ok(D.settleRun(save, loadout, 'extract', 0));
    assert.deepEqual([save.equipment.weaponUid, save.equipment.gun, save.equipment.ammo, save.equipment.ammoRelief], [at, modded.gun, 24, 5]);
    // A slot that names a gun but holds no instance is a bug: the readers throw instead of reading a factory gun.
    for (const broken of [{ ...modded, gun: null }, { ...modded, weaponUid: null }]) {
        assert.throws(() => D.equippedGun(broken), /holds no gun instance/);
        assert.throws(() => D.equippedWeapon(broken), /holds no gun instance/);
        assert.throws(() => D.equippedWeight(broken), /holds no gun instance/);
    }
});

test('unloading gives back the stored rounds as they are; the saves cap a magazine at its instance\'s capacity', () => {
    // An equipped pistol holding more rounds than it takes (8): unequipping returns all 10, ordinary and relief apart.
    const save = D.newSave(), relief = (inv: D.Inventory) => inv.items.filter(i => i.id === 'ammo9' && i.relief).reduce((n, i) => n + i.qty, 0);
    const ordinary = D.count(save.stash, 'ammo9') - relief(save.stash);
    save.equipment.ammo = 10; save.equipment.ammoRelief = 3;
    assert.ok(D.unequip(save));
    assert.deepEqual([D.count(save.stash, 'ammo9') - relief(save.stash), relief(save.stash)], [ordinary + 7, 3]);
    // A stored profile holds at most the effective capacity of the equipped instance; no gun holds no rounds.
    for (const id of FACTORY) {
        const profile = D.newSave(), cap = D.equippedWeapon(slot(id)).magazine;
        profile.equipment = { ...slot(id), ammo: cap, ammoRelief: 1 };
        assert.equal(decodeStoredProfile(profile).equipment.ammo, cap, id);
        profile.equipment.ammo = cap + 1;
        assert.throws(() => decodeStoredProfile(profile), /存档格式不支持/, id);
    }
    const empty = D.newSave(); empty.equipment = { ...slot(null), ammo: 1, ammoRelief: 0 };
    assert.throws(() => decodeStoredProfile(empty), /存档格式不支持/);
    // A layered raid's loadout likewise (validateExpansion): a full magazine of its instance commits, one more does not.
    const b = benchRaid(), cap = D.equippedWeapon(b.state.loadout!).magazine;
    const full = b.saves.prepareExpansionMutation(d => { d.expansion.raid!.loadout.ammo = cap; });
    assert.ok(full); assert.equal(b.saves.commitExpansionMutation(full), 'committed');
    assert.throws(() => b.saves.prepareExpansionMutation(d => { d.expansion.raid!.loadout.ammo = cap + 1; }), /行动|存档/);
});

test('reloads and stored magazines stop at the effective capacity exactly where they stopped at WEAPONS', () => {
    const bags: [string, number, boolean][][] = [[], [['ammo9', 40, false]], [['ammo9', 3, true], ['ammo9', 25, false]],
        [['shell', 7, false], ['shell', 2, true]], [['ammoR', 30, false], ['ammoR', 30, false], ['ammoR', 4, true]],
        [['ammo9', 9, false], ['shell', 9, false], ['ammoR', 9, false]]];
    const fill = (contents: [string, number, boolean][]) => {
        const bag = D.createInventory(6, 5); let n = 0;
        for (const [id, qty, relief] of contents) assert.equal(D.addItem(bag, id, qty, relief, false, true, () => `u${n++}`), 0);
        return bag;
    };
    let cases = 0;
    for (const weapon of [...FACTORY, 'knife', null]) for (const current of [-3, 0, 1, 2, 7, 8, 12, 30, 2.5, NaN])
        for (const relief of [0, 1, 5, 99]) for (const contents of bags) {
            const was = fill(contents), now = fill(contents), at = `${weapon} ${current} ${relief} ${JSON.stringify(contents)}`;
            assert.deepEqual(D.reloadMagazine(slot(weapon), current, relief, now), oldReload(weapon || 'knife', current, relief, was), at);
            assert.deepEqual(now, was, at);
            cases++;
        }
    assert.equal(cases, 5 * 10 * 4 * 6);
    // A stored magazine reaches cleanMagazine through migrateSave: clamped to the capacity, relief to what is loaded.
    for (const id of FACTORY) for (const ammo of [0, 1, D.WEAPONS[id].magazine, D.WEAPONS[id].magazine + 1, 99]) for (const ammoRelief of [0, 1, 99]) {
        const { equipment } = D.migrateSave({ version: 2, equipment: { weapon: id, relief: false, ammo, ammoRelief } });
        assert.deepEqual({ ammo: equipment.ammo, ammoRelief: equipment.ammoRelief }, oldClean(id, ammo, ammoRelief), `${id} ${ammo} ${ammoRelief}`);
    }
});

test('the Runtime reads the effective stats: the old three fire, reload, weigh and show exactly as before', () => {
    const handling: PerkId[] = ['technique-15-b', 'technique-20-b', 'technique-25-b', 'technique-30-b'];
    for (const [b, reload] of [[benchRaid(), 1], [perkBench(handling, 30), .85 * .8]] as const) {
        const r = b.runtime, perks = perkEffects(r.layered);
        assert.equal(perks.reload, reload, 'the second raid holds both reload perks');
        for (const id of FACTORY) {
            arm(b, id);
            const w = r.currentWeapon, h = r.grip, row = D.WEAPONS[id];
            assert.deepEqual([w, h], [row, handlingOf(id)], id);
            assert.ok(w !== row && h !== handlingOf(id), `${id}: from the effective stats, not the tables`);
            // Worked out once per build: every read shares the same frozen objects.
            assert.ok(r.currentWeapon === w && r.grip === h && Object.isFrozen(w) && Object.isFrozen(h), id);
            // The reload perks still multiply once, on top.
            assert.equal(r.reloadTime, row.reload * perks.reload, id);
            assert.equal(r.carriedWeight(), oldCarried(r), id);
            // The HUD weapon card and the aim view read the same numbers.
            const hud = r.current().frame.hud, body = rpgMultipliers(r.layered!).recoil;
            assert.deepEqual(hud.weapon, { id, name: row.name, mag: row.magazine, magSize: row.magazine, reserve: D.count(r.session.loadout!.bag, row.ammo!), reloading: false }, id);
            assert.equal(hud.aim.cone, coneOf(r.handling, row, handlingOf(id), body), id);
            assert.equal(hud.aim.drift, driftOf(r.handling, handlingOf(id), body), id);
            // A full magazine does not reload; one round short does, for the perk-scaled time.
            r.startReload();
            assert.equal(r.reloadLeft, 0, id);
            b.driver.magazine(row.magazine - 1); r.startReload();
            assert.equal(r.reloadLeft, r.reloadTime, id);
            // The test driver takes 0 to the capacity, and a reload from empty takes from the bag what the old one took.
            assert.throws(() => b.driver.magazine(row.magazine + 1), /Invalid magazine fixture/);
            b.driver.magazine(0);
            const bag = structuredClone(r.session.loadout!.bag), expected = oldReload(id, 0, 0, bag);
            r.loadMagazine();
            assert.deepEqual([{ ammo: r.mag, ammoRelief: r.magRelief }, r.session.loadout!.bag], [expected, bag], id);
            assert.equal(r.mag, row.magazine, id);
        }
        // The knife keeps its own tables.
        const s = r.snapshot(); s.knife = true; r.restore(s);
        assert.ok(r.currentWeapon === D.WEAPONS.knife && r.grip === handlingOf('knife') && r.weaponLook === 'knife');
        const back = r.snapshot(); back.knife = false; r.restore(back);
        assert.deepEqual(r.currentWeapon, D.WEAPONS.carbine);
    }
});

test('the range hands each gun a full magazine of its effective capacity', () => {
    const raid = createRangeRaid(), range = new ShootingRange(raid.core);
    for (const id of FACTORY) {
        range.arm(id);
        assert.deepEqual([raid.core.currentWeapon, raid.core.mag], [D.WEAPONS[id], D.WEAPONS[id].magazine], id);
    }
    assert.equal(raid.saves.persist(), true, 'the armed range still checkpoints');
});

test('the base departure weight weighs the equipped gun through the gunsmith entry, exactly as ITEMS did', () => {
    const now = 1800000000000, data = new Map<string, string>();
    const state = createSessionState(), saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }), undefined, () => now);
    assert.ok(saves.initialize());
    const hideout = new RealHideoutRuntime(state, saves, () => now, () => true);
    assert.equal(hideout.enter().ok, true);
    for (const weapon of [...FACTORY, null]) {
        const ticket = saves.prepareExpansionMutation(d => { d.profile.equipment = { ...slot(weapon), ammo: weapon ? D.WEAPONS[weapon].magazine : 0, ammoRelief: 0 }; });
        assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
        const p = hideout.snapshot().profile, w = D.WEAPONS[p.equipment.weapon || 'knife'], charm = state.expansion?.charm;
        assert.equal(p.equipment.weapon, weapon);
        const old =D.weight(p.bag) + D.weight(p.safe) + D.ITEMS.knife.weight + (p.equipment.weapon ? D.ITEMS[p.equipment.weapon].weight : 0)
            + (w.ammo ? D.ITEMS[w.ammo].weight * p.equipment.ammo : 0) + (charm ? D.ITEMS[charm.id].weight : 0);
        assert.equal(hideout.departure().weight, old, String(weapon));
    }
});

test('a gun weighs the same in a container as in the slot: its parts count in the bag, safe and stash, and every total agrees', () => {
    const can: PartNode = { uid: 'w-can', id: 'M07', slot: 'muzzle', relief: false, children: [] };
    const suppressed = () => ({ parts: [structuredClone(can)], devices: { laser: false, light: false } });
    // The review case: a carbine with the compact suppressor weighed 2.4 kg in a container and 2.75 kg equipped.
    const carbine: D.Item = { uid: 'w-carbine', id: 'carbine', qty: 1, x: 0, y: 0, gun: suppressed() };
    assert.deepEqual([gunWeight({ id: 'carbine', parts: [can] }), D.itemWeight(carbine)], [2.75, 2.75]);
    const bag = D.createInventory(6, 5); bag.items.push(carbine); D.addItem(bag, 'ammoR', 7);
    assert.equal(D.weight(bag), Math.round((2.75 + 7 * D.ITEMS.ammoR.weight) * 1000) / 1000);
    // Factory guns and everything else weigh exactly as before, bit for bit (the old formula read ITEMS for every item).
    const old = (inv: D.Inventory) => Math.round(inv.items.reduce((sum, i) => sum + D.ITEMS[i.id].weight * i.qty, 0) * 1000) / 1000;
    const random = D.seededRandom(707);
    for (let n = 0; n < 200; n++) {
        const inv = D.createInventory(D.STASH_W, D.STASH_UPGRADED_ROWS);
        for (const id of Object.keys(D.ITEMS)) if (random() < .4) D.addItem(inv, id, 1 + Math.floor(random() * D.ITEMS[id].stack), random() < .3);
        assert.ok(Object.is(D.weight(inv), old(inv)), `inventory ${n}`);
        for (const i of inv.items) assert.ok(Object.is(D.itemWeight(i), D.ITEMS[i.id].weight * i.qty), i.id);
    }
    // The yard departure weight (the old tabs' preparedWeight adds the same terms): the fitted carbine in the bag or equipped.
    const now = 1800000000000, data = new Map<string, string>();
    const state = createSessionState(), saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }), undefined, () => now);
    assert.ok(saves.initialize());
    const yard = new RealHideoutRuntime(state, saves, () => now, () => true); assert.ok(yard.enter().ok);
    const ticket = saves.prepareExpansionMutation(d => {
        d.profile.bag.items = [{ ...carbine, gun: suppressed() }]; d.profile.safe.items = [];
        d.profile.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
    });
    assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    const inBag = yard.departure().weight;
    assert.ok(Math.abs(inBag - (2.75 + D.ITEMS.knife.weight)) < 1e-9, String(inBag));
    assert.ok(yard.equip('bag', 'w-carbine').ok);
    assert.equal(state.save.equipment.weaponUid, 'w-carbine');
    assert.ok(Math.abs(yard.departure().weight - inBag) < 1e-9, 'equipping it moves no weight');
    // The raid carried weight: the same kit with the fitted carbine in hand, or in the bag after a swap to a pistol.
    const deploy = yard.deploy({ world: 'buildings', seed: 'weight' }); assert.ok(deploy.ok); assert.ok(yard.startRaid(deploy.runId!).ok);
    const armed = saves.prepareExpansionMutation(d => { assert.equal(D.addItem(d.expansion.raid!.loadout.bag, 'pistol'), 0); });
    assert.ok(armed); assert.equal(saves.commitExpansionMutation(armed), 'committed');
    const raid = new CoastRaidRuntime(state, saves); raid.freezeAI = true;
    const held = raid.carriedWeight(), pistol = state.loadout!.bag.items.find(i => i.id === 'pistol')!;
    assert.equal(raid.equipItem(pistol.uid), 'committed');
    assert.deepEqual(state.loadout!.bag.items.find(i => i.uid === 'w-carbine')?.gun, suppressed());
    assert.ok(Math.abs(raid.carriedWeight() - held) < 1e-9, `${raid.carriedWeight()} vs ${held}`);
});

test('item weights are shown through the one item reader, so a gun\'s parts count in every panel', () => {
    // The raid inventory, the yard detail panel and the old tabs (rows, tiles, details, shop details) used ITEMS weight
    // times the quantity, which leaves a gun's parts out. They read D.itemWeight now; the prices beside them are M2-08's.
    for (const file of ['src/ui.ts', 'src/coast-view/inventory.ts', 'src/station-view/panels.ts']) {
        const text = readFileSync(file, 'utf8');
        assert.deepEqual(text.match(/\.weight \* (?:i|item)\.qty/g) ?? [], [], file);
        assert.ok(text.includes('D.itemWeight('), file);
    }
});

test('the raid readers no longer look the held gun up by id', () => {
    // The knife's own row (WEAPONS.knife, handlingOf) stays; a gun goes through D.equippedGun.
    // Before M1-05 this found five WEAPONS lookups and the gun's ITEMS weight in these files.
    for (const file of ['src/raid-runtime/runtime.ts', 'src/raid-runtime/presentation.ts', 'src/raid-runtime/test-support.ts', 'src/range/raid.ts']) {
        const text = readFileSync(file, 'utf8');
        assert.deepEqual(text.match(/WEAPONS\[[^\]]*\]|ITEMS\[[\w.!]*\.weapon\]/g) ?? [], [], file);
    }
});
