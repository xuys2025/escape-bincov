import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../src/domain';
import { SaveSession, createSessionState, type MutationResult, type SessionState } from '../../src/session';
import { SESSION_KEY, decodeSession, type SessionRecord } from '../../src/recovery-store';
import { decodePortableBackup, encodeRecoveryBackup } from '../../src/save-backup';
import { RealHideoutRuntime, type Result } from '../../src/hideout-runtime';
import { CoastRaidRuntime } from '../../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../../src/raid-runtime/test-support';
import { firstAvailableSlot, moveQuantity } from '../../src/loot';
import * as S from '../../src/shop';
import { ATTACHMENTS, type GunId } from '../../src/gunsmith/catalog';
import { checkInstall, type Part, type Placement } from '../../src/gunsmith/compat';
import { deviceEffects, factoryState, gunUids, gunWeight, nodesOf, repeatedUids, type GunState, type PartNode } from '../../src/gunsmith/instance';

/*
 * Gunsmith M1-07 (docs/gunsmith/TASKS.md): conservation and round trips under random legal play. The 200 fixed seeds of
 * 30 steps run from tests/gunsmith-conservation.test.ts (seeds 1 to 100) and gunsmith-conservation-2.test.ts (101 to 200).
 *
 * Every seed stocks a save with several gun instances (two carbines of different builds, a shotgun holding a relief
 * part, a relief pistol, a fitted pistol in the safe, a fitted carbine in hand) and normal and relief rounds, then plays
 * a random legal sequence through the real APIs: the yard Runtime (moves, quick moves, the safe, equipping, the shop,
 * deployment, backup export and import), the raid Runtime (swaps, drops, pickups, crates and corpses, kills, stairs,
 * checkpoints, extraction and death) and SaveSession (the raid inventory's moves, the old tab page's import). Any write
 * may be forced to fail; the player then retries the save, and the step is done again or the staged change commits.
 *
 * After every step the stored record is decoded and checked against a model of what the step may change:
 *   - every uid in the record is unique (items, guns, parts, ground loot, containers, enemies, rounds);
 *   - every gun keeps its uid, type, relief flag and exact part tree (its signature); guns, and the parts on them, appear
 *     or go only by the documented rules: bought (a new factory gun), sold, born in the world, picked up from a classic
 *     raid's ground under a new item uid, lost with the bag and the gun in hand on death, left behind in the raid;
 *   - normal and relief rounds (and every other good) are counted apart and conserved the same way;
 *   - cash changes only by the shop's quoted totals;
 *   - a failed write leaves the stored bytes and the game exactly as they were, and its retry applies the step once;
 *   - the session holds what was committed, and a gun weighs the same in the bag, the safe, the stash, on the ground
 *     and in hand: the carried totals of the yard and the raid equal an independent sum.
 * The seed is printed with the steps taken when a check fails. To replay, run the first test file with GUNSMITH_SEEDS
 * (for example "17" or "1-20"): it plays those seeds and the second file skips.
 */

const NOW = 1800000000000, STEPS = 30, CASH_FLOOR = 1000, FAIL_RATE = .1;
/** The ground uids a classic raid deals from counters; a gun picked up from under one takes a new item uid (D.placeGroundGun). */
const RAID_LOCAL = /^(?:enemy|loot|entity|pursuit)-[0-9]+$/;
const RELIEF_PART_REFUSAL = '这把枪装有救济配件，不能整枪出售。';

function seedList(spec: string): number[] {
    return spec.split(',').flatMap(part => {
        const [a, b] = part.split('-').map(Number);
        return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
    });
}

type Rng = () => number;
const int = (rng: Rng, n: number) => Math.floor(rng() * n);
const pick = <T>(rng: Rng, list: readonly T[]): T => list[int(rng, list.length)];
const pickItem = (rng: Rng, inv: D.Inventory): D.Item | null => inv.items.length ? pick(rng, inv.items) : null;
const describe = (i: D.Item) => `${i.id}${i.relief ? '(relief)' : ''}${i.gun ? `#${i.uid}` : ` x${i.qty}`}`;

/** One browser origin: its storage (which can be made to fail), the session, the yard Runtime and, while a raid runs, its Runtime. */
interface Page {
    data: Map<string, string>; failing: boolean; state: SessionState; saves: SaveSession; yard: RealHideoutRuntime;
    raid: CoastRaidRuntime | null; driver: ReturnType<typeof createRuntimeTestDriver> | null;
}
function openPage(): Page {
    const page = { data: new Map<string, string>(), failing: false, raid: null, driver: null } as unknown as Page;
    const storage: D.StorageLike = { getItem: k => page.data.get(k) ?? null, setItem: (k, v) => { if (page.failing) throw new Error('quota'); page.data.set(k, v); } };
    page.state = createSessionState(); page.saves = new SaveSession(page.state, () => storage, undefined, () => NOW);
    assert.ok(page.saves.initialize(), page.state.storageError);
    page.yard = new RealHideoutRuntime(page.state, page.saves, () => NOW);
    return page;
}
const raw = (p: Page) => p.data.get(SESSION_KEY)!;
function startRaid(p: Page) {
    p.raid = new CoastRaidRuntime(p.state, p.saves); p.raid.freezeAI = true;
    p.driver = createRuntimeTestDriver(p.raid, '?test=1');
}

/** A random legal build of `want` parts for an old gun, installed where compat.checkInstall places each; switches random. */
function build(rng: Rng, gun: 'pistol' | 'shotgun' | 'carbine', next: () => string, want: number, reliefChance = 0): GunState {
    const ids = Object.keys(ATTACHMENTS).filter(id => !ATTACHMENTS[id].guns || ATTACHMENTS[id].guns!.includes(gun));
    let parts: Part[] = [];
    const relief = new Map<string, boolean>();
    for (let n = 0; n < want; n++) {
        const open = ids.filter(id => checkInstall({ gun, parts }, id).ok);
        if (!open.length) break;
        const id = pick(rng, open), at = (checkInstall({ gun, parts }, id) as { ok: true; at: Placement }).at, uid = next();
        parts = [...parts, { uid, id, parent: at.parent, slot: at.slot }];
        relief.set(uid, rng() < reliefChance);
    }
    const node = (p: Part): PartNode => ({ uid: p.uid, id: p.id, slot: p.slot, relief: relief.get(p.uid)!, children: parts.filter(c => c.parent === p.uid).map(node) });
    const tree = parts.filter(p => p.parent === null).map(node), have = deviceEffects(tree);
    return { parts: tree, devices: { laser: have.laser && rng() < .5, light: have.light && rng() < .5 } };
}

/** A new save in the yard, stocked through one committed candidate (installing by hand stands in for the M2 workbench). */
function stocked(seed: number, rng: Rng): Page {
    const page = openPage(); assert.ok(page.yard.enter().ok);
    let n = 0;
    const next = () => `s${seed}-${++n}`;
    const carbineA = build(rng, 'carbine', next, 1 + int(rng, 5));
    let carbineB = build(rng, 'carbine', next, int(rng, 5));
    while (D.gunKey(carbineB) === D.gunKey(carbineA)) carbineB = build(rng, 'carbine', next, 1 + int(rng, 5));
    const shotgun = build(rng, 'shotgun', next, 1 + int(rng, 3), .4);
    nodesOf(shotgun.parts)[0].relief = true; // a normal gun holding a relief part: never sold whole
    const reliefPistol = build(rng, 'pistol', next, int(rng, 3)), safePistol = build(rng, 'pistol', next, int(rng, 3), .3);
    const held = build(rng, 'carbine', next, int(rng, 5)), cash = 4000 + int(rng, 4000);
    const ticket = page.saves.prepareExpansionMutation(d => {
        const p = d.profile, gun = (id: string, state: GunState, relief = false): D.Item => ({ uid: next(), id, qty: 1, x: 0, y: 0, ...(relief ? { relief: true } : {}), gun: state });
        p.cash = cash; p.stash = D.createInventory(10, 6); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2);
        for (const [inv, item] of [[p.stash, gun('carbine', carbineA)], [p.stash, gun('carbine', carbineB)], [p.stash, gun('shotgun', shotgun)],
            [p.bag, gun('pistol', reliefPistol, true)], [p.safe, gun('pistol', safePistol)]] as const) assert.ok(D.placeItem(inv, item));
        for (const [inv, id, qty, relief] of [[p.stash, 'ammoR', 24, false], [p.stash, 'ammoR', 9, true], [p.bag, 'ammo9', 20, false],
            [p.bag, 'ammo9', 12, true], [p.stash, 'shell', 10, false], [p.bag, 'shell', 4, true], [p.stash, 'medkit', 1, false],
            [p.bag, 'bandage', 2, false], [p.stash, 'watch', 2, false]] as const) assert.equal(D.addItem(inv, id, qty, relief), 0);
        p.equipment = { weapon: 'carbine', weaponUid: next(), gun: held, relief: false, ammo: 7, ammoRelief: 3 };
    });
    assert.ok(ticket, page.state.storageError); assert.equal(page.saves.commitExpansionMutation(ticket), 'committed');
    return page;
}

// ---- What a record holds -------------------------------------------------------------------------------------------

type Goods = Map<string, number>;
/** A record's goods and guns: owned (stash, carried, in hand with its rounds) and in the raid's world (ground, crates, corpses). */
interface Census {
    record: SessionRecord; owned: Goods; world: Goods;
    /** Every gun: uid to its signature (type, relief flag and the exact part tree with its switches). */
    guns: Map<string, string>; mine: Set<string>;
    /** The independent sum of what is carried: bag, safe, the gun in hand with its rounds and the knife. */
    carried: number;
}
const sig = (id: string, relief: boolean, gun: GunState) => `${id}${relief ? ' relief' : ''} ${D.gunKey(gun)}`;
const good = (id: string, relief: boolean) => relief ? `${id} relief` : id;
const add = (goods: Goods, key: string, qty: number) => { if (qty) goods.set(key, (goods.get(key) ?? 0) + qty); };
const kg = (i: Pick<D.Item, 'id' | 'qty' | 'gun'>) => i.gun ? gunWeight({ id: i.id as GunId, parts: i.gun.parts }) : D.ITEMS[i.id].weight * i.qty;
const layersOf = (r: SessionRecord) => r.expansion?.raid ? Object.values(r.expansion.raid.maps) : r.raid ? [r.raid] : [];

function census(record: SessionRecord): Census {
    const c: Census = { record, owned: new Map(), world: new Map(), guns: new Map(), mine: new Set(), carried: 0 }, uids: string[] = [];
    const gun = (uid: string, id: string, relief: boolean, state: GunState, mine: boolean) => {
        assert.ok(!c.guns.has(uid), `the gun ${uid} is held twice`);
        c.guns.set(uid, sig(id, relief, state)); if (mine) c.mine.add(uid);
        uids.push(...gunUids({ uid, parts: state.parts }));
        // One weight wherever the gun is: as an item (bag, safe, stash, ground, crate) and in the slot, the gunsmith's.
        const own = gunWeight({ id: id as GunId, parts: state.parts });
        assert.equal(D.itemWeight({ id, qty: 1, gun: state }), own, `${uid} weighs its parts as an item`);
        assert.equal(D.equippedWeight({ weapon: id, weaponUid: uid, gun: state, relief }), own, `${uid} weighs the same in hand`);
    };
    const item = (i: Pick<D.Item, 'uid' | 'id' | 'qty' | 'relief' | 'gun'>, mine: boolean) => {
        if (i.gun) gun(i.uid, i.id, !!i.relief, i.gun, mine);
        else { add(mine ? c.owned : c.world, good(i.id, !!i.relief), i.qty); uids.push(i.uid); }
    };
    const slot = (e: D.Equipment) => {
        if (!e.weapon) { assert.deepEqual([e.weaponUid, e.gun, e.ammo, e.ammoRelief], [null, null, 0, 0], 'an empty slot'); return; }
        gun(e.weaponUid!, e.weapon, e.relief, e.gun!, true);
        const ammo = D.WEAPONS[e.weapon].ammo!;
        add(c.owned, good(ammo, false), e.ammo - e.ammoRelief); add(c.owned, good(ammo, true), e.ammoRelief);
    };
    const carried = (bag: D.Inventory, safe: D.Inventory, e: D.Equipment) => [...bag.items, ...safe.items].reduce((sum, i) => sum + kg(i), D.ITEMS.knife.weight)
        + (e.weapon ? gunWeight({ id: e.weapon as GunId, parts: e.gun!.parts }) + D.ITEMS[D.WEAPONS[e.weapon].ammo!].weight * e.ammo : 0);
    const p = record.profile, raid = record.expansion?.raid ?? record.raid;
    // In a raid the profile's safe mirrors the carried one; it is counted once, as carried.
    for (const inv of raid ? [p.stash, p.bag] : [p.stash, p.bag, p.safe]) for (const i of inv.items) item(i, true);
    slot(p.equipment);
    if (record.expansion?.charm) uids.push(record.expansion.charm.uid);
    if (raid) {
        const l = raid.loadout;
        assert.deepEqual(p.safe, l.safe, 'the profile safe mirrors the carried safe');
        for (const inv of [l.bag, l.safe]) for (const i of inv.items) item(i, true);
        slot(l);
        c.carried = carried(l.bag, l.safe, l);
        for (const layer of layersOf(record)) {
            for (const g of layer.loot) item(g, false);
            for (const box of layer.containers ?? []) { uids.push(box.id); for (const i of box.inventory.items) item(i, false); }
            for (const e of layer.enemies) uids.push(e.uid);
            for (const b of layer.bullets) uids.push(b.uid);
        }
        for (const pursuit of record.expansion?.raid?.pursuits ?? []) uids.push(pursuit.id, pursuit.enemy.uid);
    } else c.carried = carried(p.bag, p.safe, p.equipment);
    assert.deepEqual(repeatedUids(uids), [], 'every uid in the record is unique');
    return c;
}

// ---- What a step may change ------------------------------------------------------------------------------------------

type Effect =
    | { kind: 'same' }
    /** Goods and guns moved between the carried kit and the raid's world; `renamed`: a classic ground gun picked up under a new uid. */
    | { kind: 'move'; renamed?: string }
    | { kind: 'shop'; bought: string[]; sold: D.Item[]; net: number }
    | { kind: 'deploy' } | { kind: 'kill'; corpse: string } | { kind: 'extract' } | { kind: 'death' };
const SAME: Effect = { kind: 'same' };

const entries = (goods: Goods) => [...goods].filter(([, n]) => n !== 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const sameGoods = (actual: Goods, expected: Goods, what: string) => assert.deepEqual(entries(actual), entries(expected), what);
const sum = (...parts: [Goods, number][]): Goods => { const out: Goods = new Map(); for (const [g, sign] of parts) for (const [k, n] of g) add(out, k, sign * n); return out; };
const gunList = (guns: Map<string, string>) => [...guns].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const sorted = (set: Iterable<string>) => [...set].sort();
const only = (guns: Map<string, string>, keep: (uid: string) => boolean) => new Map([...guns].filter(([uid]) => keep(uid)));

function expectStep(before: Census, after: Census, effect: Effect) {
    const cash = before.record.profile.cash - (effect.kind === 'shop' ? effect.net : 0);
    assert.equal(after.record.profile.cash, cash, 'cash changes only by the quoted shop totals');
    const guns = (expected: Map<string, string>, mine: Iterable<string>, what: string) => {
        assert.deepEqual(gunList(after.guns), gunList(expected), `${what}: every gun as itself, parts and all`);
        assert.deepEqual(sorted(after.mine), sorted(mine), `${what}: the guns owned`);
    };
    switch (effect.kind) {
        case 'same':
            sameGoods(after.owned, before.owned, 'owned goods unchanged'); sameGoods(after.world, before.world, 'the world unchanged');
            return guns(before.guns, before.mine, 'nothing moved');
        case 'move': {
            sameGoods(sum([after.owned, 1], [after.world, 1]), sum([before.owned, 1], [before.world, 1]), 'goods carried and lying are conserved');
            const expected = new Map(before.guns);
            if (effect.renamed) {
                const born = [...after.guns.keys()].filter(uid => !before.guns.has(uid));
                assert.equal(born.length, 1, 'a classic ground gun comes off the ground under one new uid');
                assert.equal(after.guns.get(born[0]), before.guns.get(effect.renamed), 'the same gun, parts and all');
                expected.delete(effect.renamed); expected.set(born[0], after.guns.get(born[0])!);
            }
            assert.deepEqual(gunList(after.guns), gunList(expected), 'every gun as itself, parts and all');
            return;
        }
        case 'shop': {
            const bought: Goods = new Map(), sold: Goods = new Map(), boughtGuns: string[] = [];
            for (const id of effect.bought) if (D.ITEMS[id].kind === 'weapon') boughtGuns.push(id); else add(bought, good(id, false), D.buyQuantity(id));
            const expected = new Map(before.guns);
            for (const i of effect.sold) if (i.gun) assert.ok(expected.delete(i.uid), `sold ${i.uid}`); else add(sold, good(i.id, !!i.relief), i.qty);
            sameGoods(after.owned, sum([before.owned, 1], [bought, 1], [sold, -1]), 'the trade moves exactly the listed goods');
            sameGoods(after.world, before.world, 'the world unchanged');
            const born = [...after.guns.keys()].filter(uid => !before.guns.has(uid));
            assert.deepEqual(born.map(uid => after.guns.get(uid)).sort(), boughtGuns.map(id => sig(id, false, factoryState())).sort(), 'a bought gun is a new factory gun');
            for (const uid of born) expected.set(uid, after.guns.get(uid)!);
            return guns(expected, [...before.mine].filter(uid => expected.has(uid)).concat(born), 'the trade');
        }
        case 'deploy':
            assert.equal(before.world.size, 0);
            sameGoods(after.owned, before.owned, 'the kit goes into the raid as it is');
            for (const [uid, s] of before.guns) assert.equal(after.guns.get(uid), s, `${uid} goes into the raid as itself`);
            for (const uid of after.guns.keys()) assert.ok(before.guns.has(uid) || !after.mine.has(uid), `${uid} is the world's`);
            assert.deepEqual(sorted(after.mine), sorted(before.mine));
            return;
        case 'kill': {
            assert.ok(!layersOf(before.record).some(l => (l.containers ?? []).some(b => b.id === effect.corpse)), 'one body, one corpse');
            const body = layersOf(after.record).flatMap(l => l.containers ?? []).find(b => b.id === effect.corpse);
            const drops: Goods = new Map(), expected = new Map(before.guns);
            for (const i of body?.inventory.items ?? []) if (i.gun) expected.set(i.uid, sig(i.id, !!i.relief, i.gun)); else add(drops, good(i.id, !!i.relief), i.qty);
            sameGoods(after.owned, before.owned, 'a kill takes nothing from the kit');
            sameGoods(after.world, sum([before.world, 1], [drops, 1]), 'the body brings its corpse');
            return guns(expected, before.mine, 'a kill');
        }
        case 'extract':
            sameGoods(after.owned, before.owned, 'extraction brings the whole kit home');
            sameGoods(after.world, new Map(), 'what was left in the raid stays there');
            return guns(only(before.guns, uid => before.mine.has(uid)), before.mine, 'extraction');
        case 'death': {
            const l = (before.record.expansion?.raid ?? before.record.raid)!.loadout, lost: Goods = new Map(), gone = new Set<string>();
            for (const i of l.bag.items) if (i.gun) gone.add(i.uid); else add(lost, good(i.id, !!i.relief), i.qty);
            if (l.weapon) {
                gone.add(l.weaponUid!);
                const ammo = D.WEAPONS[l.weapon].ammo!;
                add(lost, good(ammo, false), l.ammo - l.ammoRelief); add(lost, good(ammo, true), l.ammoRelief);
            }
            sameGoods(after.owned, sum([before.owned, 1], [lost, -1]), 'death loses the bag and the gun in hand with its rounds, the safe stays');
            sameGoods(after.world, new Map(), 'what was left in the raid stays there');
            const kept = (uid: string) => before.mine.has(uid) && !gone.has(uid);
            return guns(only(before.guns, kept), [...before.mine].filter(kept), 'death');
        }
    }
}

/** What the session shows is what was committed, and its carried totals weigh every gun with its parts. */
function expectSession(p: Page, c: Census) {
    assert.deepEqual(JSON.parse(JSON.stringify(p.state.save)), c.record.profile, 'the session holds the committed profile');
    if (p.raid) {
        assert.deepEqual(JSON.parse(JSON.stringify(p.state.loadout)), (c.record.expansion?.raid ?? c.record.raid)!.loadout, 'and the committed kit');
        const carried = p.raid.carriedWeight();
        assert.ok(Math.abs(carried - c.carried) < 1e-9, `the raid carries ${carried} kg, the items weigh ${c.carried} kg`);
    } else {
        const departure = p.yard.departure().weight;
        assert.ok(Math.abs(departure - c.carried) < 1e-9, `the yard departs with ${departure} kg, the items weigh ${c.carried} kg`);
    }
}

// ---- Steps ------------------------------------------------------------------------------------------------------------

interface Context { seed: number; rng: Rng; page: Page; before: Census; stats: Stats }
interface Stats { done: Map<string, number>; failed: Map<string, number> }
const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
/** One step through the real APIs. */
interface Plan<T = any> {
    /** Coverage name, and the step as the log prints it. */
    kind: string; label: string;
    run(): T;
    /** The outcome is a write that failed (as opposed to a refusal, which writes nothing). */
    failed(outcome: T): boolean;
    /** The step took effect (for coverage); and what it may have changed. */
    ok(outcome: T): boolean; effect(outcome: T): Effect;
    /** After a failed write the player retries the save: the step is done again, or the retry commits the staged change. */
    retry: 'again' | { staged(): T };
    /** Checks and bookkeeping once the step is done (starting or ending a raid, switching to another page). */
    after?(outcome: T): void;
    /** False when the step injects and retries a failure on another page itself. */
    failable?: boolean;
}
interface Op { weight: number; plan(ctx: Context): Plan | null }

const yardStep = (kind: string, label: string, run: () => Result, effect: Effect = SAME, after?: (r: Result) => void): Plan<Result> =>
    ({ kind, label, run, failed: r => !r.ok && r.reason === 'storage', ok: r => r.ok, effect: r => r.ok ? effect : SAME, retry: 'again', after });
const raidStep = (kind: string, label: string, run: () => MutationResult, effect: Effect = { kind: 'move' }): Plan<MutationResult> =>
    ({ kind, label, run, failed: r => r === 'save-failed', ok: r => r === 'committed', effect: r => r === 'committed' ? effect : SAME, retry: 'again' });
const sources = ['stash', 'bag', 'safe'] as const;

/** The yard's grid move: a free cell or a random one (a swap, a merge or a refusal), sometimes splitting a stack. */
function target(rng: Rng, inv: D.Inventory, item: D.Item) {
    const free = rng() < .6 ? firstAvailableSlot(inv, item) : null;
    const at = free ?? { x: int(rng, inv.w), y: int(rng, inv.h), rotated: rng() < .3 ? !item.rotated : !!item.rotated };
    return { ...at, quantity: item.qty > 1 && rng() < .3 ? 1 + int(rng, item.qty - 1) : undefined };
}

const STATION: Op[] = [
    { weight: 3, plan: ({ rng, page: p }) => {
        const from = pick(rng, ['stash', 'bag'] as const), item = pickItem(rng, p.state.save[from]);
        return item && yardStep('quick', `quick move ${describe(item)} from the ${from}`, () => p.yard.quickMove(from, item.uid));
    } },
    { weight: 2, plan: ({ rng, page: p }) => {
        const from = pick(rng, sources), item = pickItem(rng, p.state.save[from]);
        return item && yardStep('secure', `secure ${describe(item)} from the ${from}`, () => p.yard.secure(from, item.uid));
    } },
    { weight: 3, plan: ({ rng, page: p }) => {
        const from = pick(rng, sources), to = pick(rng, sources), item = pickItem(rng, p.state.save[from]);
        if (!item) return null;
        const at = target(rng, p.state.save[to], item);
        return yardStep('move', `move ${describe(item)} ${from} to ${to} (${at.x},${at.y}${at.rotated ? ' rotated' : ''}${at.quantity ? ` ${at.quantity}` : ''})`,
            () => p.yard.move(from, to, item.uid, at.x, at.y, at.rotated, at.quantity));
    } },
    { weight: 2, plan: ({ rng, page: p }) => {
        const guns = (['stash', 'bag'] as const).flatMap(from => p.state.save[from].items.filter(i => i.gun).map(i => ({ from, i })));
        if (!guns.length) return null;
        const { from, i } = pick(rng, guns);
        return yardStep('equip', `equip ${describe(i)} from the ${from}`, () => p.yard.equip(from, i.uid), SAME,
            r => { if (r.ok) assert.deepEqual([p.state.save.equipment.weaponUid, p.state.save.equipment.gun], [i.uid, i.gun]); });
    } },
    { weight: 1, plan: ({ page: p }) => p.state.save.equipment.weapon ? yardStep('unequip', 'unequip', () => p.yard.unequip()) : null },
    { weight: 1, plan: ({ rng, page: p }) => rng() < .5 ? yardStep('tidy', 'sort the stash', () => p.yard.sortStash()) : yardStep('tidy', 'stash the bag', () => p.yard.stashAll()) },
    { weight: 3, plan: ctx => shopStep(ctx) },
    { weight: 1.5, plan: ctx => stationBackup(ctx) },
    { weight: 2.5, plan: ({ rng, page: p }) => {
        const world = pick(rng, ['coast', 'buildings', 'mall'] as const), seed = String(1 + int(rng, 1e9)), mallLayout = world === 'mall' ? pick(rng, [1, 2, 3] as const) : undefined;
        return { ...yardStep(`deploy ${world}`, `deploy to the ${world} (seed ${seed})`, () => p.yard.deploy({ world, seed, mallLayout }), { kind: 'deploy' }),
            after: (r: Result & { runId?: string }) => { assert.ok(r.ok, r.ok ? '' : r.message); assert.ok(p.yard.startRaid(r.runId!).ok); startRaid(p); } };
    } },
];

/** A shopping list at the arms dealer: random packs (keeping the cash floor) and random stash items, guns with relief parts refused whole. */
function shopStep({ rng, page: p, stats }: Context): Plan | null {
    const shop = p.yard.openShop('arms'), bought: string[] = [], sold: D.Item[] = [];
    for (let n = int(rng, 3); n > 0; n--) {
        const offer = pick(rng, shop.view().catalog.items), price = D.ITEMS[offer.id].buy * offer.qty;
        if (p.state.save.cash - shop.view().totals.net - price < CASH_FLOOR) continue; // relief never applies to these saves
        const cell = S.firstShopCell(4, 3, (x, y) => shop.placementError('merchant', 'buy', offer.uid, x, y));
        if (!('x' in cell)) continue;
        assert.ok(shop.place('merchant', 'buy', offer.uid, cell.x, cell.y).ok);
        bought.push(offer.id);
    }
    for (let n = int(rng, 3); n > 0; n--) {
        const item = pickItem(rng, shop.view().stash);
        if (!item) break;
        const refusal = S.saleRefusal(item), cell = S.firstShopCell(4, 3, (x, y) => shop.placementError('stash', 'sell', item.uid, x, y));
        if (refusal) {
            // Refused whole with its reason, never stripped: relief goods, and a normal gun holding a relief part.
            assert.ok(!('x' in cell) && cell.reason === refusal, `${describe(item)}: ${refusal}`);
            const placed = shop.place('stash', 'sell', item.uid, 0, 0);
            assert.ok(!placed.ok && placed.message === refusal);
            if (item.gun && !item.relief) { assert.equal(refusal, RELIEF_PART_REFUSAL); assert.ok(nodesOf(item.gun.parts).some(part => part.relief)); count(stats.done, 'sale refused (relief part)'); }
            continue;
        }
        if (!('x' in cell)) continue;
        assert.ok(shop.place('stash', 'sell', item.uid, cell.x, cell.y).ok);
        sold.push(structuredClone(item));
    }
    if (!bought.length && !sold.length) return null;
    const view = shop.view();
    // The quote the player sees, item by item, is what the settlement charges.
    const net = view.buy.items.reduce((n, i) => n + S.shopQuote('buy', i).total!, 0) - view.sell.items.reduce((n, i) => n + S.shopQuote('sell', i).total!, 0);
    assert.equal(view.totals.net, net);
    const label = `trade: buy ${bought.join(' ') || 'nothing'}; sell ${sold.map(describe).join(' ') || 'nothing'} (net ${net})`;
    return { ...yardStep(bought.length ? sold.length ? 'buy and sell' : 'buy' : 'sell', label, () => {
        const first = shop.settle();
        return !first.ok && first.confirmation ? shop.settle(first.confirmation.token) : first;
    }, { kind: 'shop', bought, sold, net }) };
}

/** Export the save and import it: back into this page, into a fresh page's yard, or through a fresh old tab page. */
function stationBackup(ctx: Context): Plan | null {
    const { rng, page: p, stats } = ctx, where = pick(rng, ['this yard', 'a fresh yard', 'a fresh tab page'] as const), profile = structuredClone(p.state.save);
    const check = () => assert.deepEqual(decodeSession(raw(ctx.page)).profile, JSON.parse(JSON.stringify(profile)), 'the imported save is the exported one');
    if (where === 'this yard') return yardStep('backup', 'export and import in this yard', () => {
        const text = p.yard.exportBackup(), preview = p.yard.previewImport(text);
        assert.ok(preview.ok && preview.token);
        return p.yard.importBackup(text, preview.token!);
    }, SAME, r => { assert.ok(r.ok); check(); });
    return { kind: 'backup', label: `export and import in ${where}`, failable: false, failed: () => false, ok: () => true, effect: () => SAME, retry: 'again', run: () => {
        const text = p.yard.exportBackup(), fresh = openPage();
        const load = () => {
            if (where === 'a fresh yard') {
                const preview = fresh.yard.previewImport(text);
                assert.ok(preview.ok && preview.token);
                return fresh.yard.importBackup(text, preview.token!).ok;
            }
            const decoded = decodePortableBackup(text);
            assert.equal(decoded.kind, 'session');
            return fresh.saves.importRecord((decoded as { record: SessionRecord }).record);
        };
        if (where === 'a fresh yard') assert.ok(fresh.yard.enter().ok); else fresh.state.state = 'hideout';
        if (rng() < FAIL_RATE) {
            // The import cannot be written: the fresh page keeps its own save; it retries the save, then imports again.
            const bytes = raw(fresh); fresh.failing = true;
            try { assert.equal(load(), false); } finally { fresh.failing = false; }
            assert.equal(raw(fresh), bytes);
            assert.ok(where === 'a fresh yard' ? fresh.yard.retrySave().ok : fresh.saves.persist());
            count(stats.failed, 'import');
        }
        assert.ok(load(), fresh.state.storageError);
        if (where === 'a fresh tab page') assert.ok(fresh.yard.enter().ok);
        ctx.page = fresh; check();
        return true;
    } };
}

const mapOf = (rt: CoastRaidRuntime) => rt.layered?.raid?.currentMap ?? 'coast';
/** Put the player beside a point of the current map, as walking there would; false when no nearby spot is free. */
function standBy(p: Page, at: { x: number; y: number }): boolean {
    for (const [dx, dy] of [[0, 0], [0, 14], [14, 0], [-14, 0], [0, -14], [0, 26], [26, 0], [-26, 0], [0, -26], [18, 18], [-18, -18]]) {
        try { p.driver!.placePlayer({ x: at.x + dx, y: at.y + dy }); return true; } catch { /* blocked here */ }
    }
    return false;
}

const RAID: Op[] = [
    { weight: 2, plan: ({ rng, page: p }) => {
        const gun = pickItem(rng, { ...p.state.loadout!.bag, items: p.state.loadout!.bag.items.filter(i => i.gun) });
        return gun && raidStep('raid equip', `equip ${describe(gun)} from the bag`, () => p.raid!.equipItem(gun.uid), SAME);
    } },
    { weight: 3, plan: ({ rng, page: p }) => {
        // The raid inventory panel: quick moves, placed moves and rotations go through SaveSession.mutate.
        const from = pick(rng, ['bag', 'safe'] as const), to = pick(rng, ['bag', 'safe'] as const), item = pickItem(rng, p.state.loadout![from]);
        if (!item) return null;
        const kit = () => p.state.loadout!, how = pick(rng, ['quick', 'place', 'rotate'] as const);
        if (how === 'rotate') return raidStep('raid move', `rotate ${describe(item)} in the ${from}`, () => p.saves.mutate(() => D.rotateItem(kit()[from], item.uid)), SAME);
        if (how === 'quick') return from === to ? null : raidStep('raid move', `quick move ${describe(item)} ${from} to ${to}`, () => p.saves.mutate(() => D.transferItem(kit()[from], kit()[to], item.uid)), SAME);
        const at = target(rng, kit()[to], item);
        return raidStep('raid move', `move ${describe(item)} ${from} to ${to} (${at.x},${at.y}${at.quantity ? ` ${at.quantity}` : ''})`,
            () => p.saves.mutate(() => moveQuantity(kit()[from], kit()[to], item.uid, at.x, at.y, at.rotated, at.quantity)), SAME);
    } },
    { weight: 3, plan: ({ rng, page: p }) => {
        const from = pick(rng, ['bag', 'safe'] as const), item = pickItem(rng, p.state.loadout![from]);
        return item && { ...raidStep('drop', `drop ${describe(item)} from the ${from}`, () => p.raid!.dropItem(item.uid, from)),
            after: (r: MutationResult) => { if (r === 'committed' && item.gun) assert.deepEqual(p.raid!.loot.find(l => l.uid === item.uid)?.gun, item.gun, 'a dropped gun lies as itself'); } };
    } },
    { weight: 3, plan: ({ rng, page: p }) => {
        const rt = p.raid!;
        let lying = rt.nearbyLoot()[0];
        if (!lying || rng() < .5) {
            const far = rt.loot.length ? pick(rng, rt.loot) : null;
            if (!far || !standBy(p, far)) return null;
            lying = rt.nearbyLoot().find(l => l.uid === far.uid) ?? rt.nearbyLoot()[0];
            if (!lying) return null;
        }
        const renamed = lying.gun && RAID_LOCAL.test(lying.uid) ? lying.uid : undefined, uid = lying.uid;
        return { kind: renamed ? 'pickup (classic ground gun)' : 'pickup', label: `pick up ${lying.id}${lying.gun ? `#${uid}` : ` x${lying.qty}`}`, run: () => rt.pickupLoot(uid),
            failed: (r: boolean) => !r && !p.state.storageOK, ok: (r: boolean) => r, effect: (r: boolean) => r ? { kind: 'move', renamed } : SAME, retry: 'again' };
    } },
    { weight: 4, plan: ({ rng, page: p }) => {
        const rt = p.raid!, box = rt.containers.length ? pick(rng, rt.containers) : null;
        if (!box || !(rt.canLootContainer(box.id, box.runId) || standBy(p, box) && rt.canLootContainer(box.id, box.runId))) return null;
        const from = pick(rng, ['container', 'bag', 'safe'] as const), to = from === 'container' ? pick(rng, ['bag', 'safe'] as const) : pick(rng, ['container', 'container', from === 'bag' ? 'safe' : 'bag'] as const);
        const inv = (end: typeof from) => end === 'container' ? rt.getLootContainer(box.id)!.inventory : p.state.loadout![end];
        const item = pickItem(rng, inv(from));
        if (!item) return null;
        const at = target(rng, inv(to), item), ref = { runId: box.runId, mapId: mapOf(rt), kind: 'container', id: box.id } as const;
        const request = { runId: box.runId, containerId: box.id, from, to, uid: item.uid, x: at.x, y: at.y, rotated: at.rotated, ...(at.quantity ? { quantity: at.quantity } : {}) };
        return raidStep(box.kind, `${describe(item)} ${from} to ${to} at ${box.id}`, () => rt.transferLoot(ref, request));
    } },
    { weight: 1.5, plan: ({ rng, page: p }) => {
        const rt = p.raid!, alive = rt.enemies.filter(e => e.hp > 0);
        if (!alive.length) return null;
        const enemy = pick(rng, alive), corpse = `corpse-${enemy.uid}`;
        // A kill happens in the simulation; the next checkpoint writes the body and its corpse with it.
        return { kind: 'kill', label: `kill ${enemy.id}#${enemy.uid}`, run: () => { if (enemy.hp > 0) p.driver!.kill(enemy.uid); return rt.checkpoint(); },
            failed: (r: boolean) => !r, ok: (r: boolean) => r, effect: () => ({ kind: 'kill', corpse }), retry: { staged: () => { assert.ok(rt.retrySave()); return true; } } };
    } },
    { weight: 1.5, plan: ({ rng, page: p }) => {
        const rt = p.raid!, world = rt.layeredWorld;
        if (!world) return null;
        const from = mapOf(rt), entries = world.maps[from].entries;
        if (!entries.length) return null;
        const entry = pick(rng, entries);
        try { p.driver!.placePlayer(entry.at, 0, from); } catch { return null; }
        const ref = { runId: p.state.loadout!.runId!, mapId: from, kind: 'entry', id: entry.id } as const;
        return { kind: 'stairs', label: `take ${entry.id} from ${from}`, run: () => rt.activate(ref), failed: (r: boolean) => !r && !p.state.storageOK,
            ok: (r: boolean) => r, effect: () => SAME, retry: { staged: () => { assert.ok(rt.retrySave()); return true; } },
            after: (r: boolean) => { assert.equal(mapOf(rt), r ? entry.targetMap : from, 'one change of layer, carried kit and all'); } };
    } },
    { weight: 1, plan: ctx => raidBackup(ctx) },
    { weight: .5, plan: ({ page: p }) => ({ kind: 'checkpoint', label: 'checkpoint', run: () => p.raid!.checkpoint(), failed: (r: boolean) => !r, ok: (r: boolean) => r, effect: () => SAME, retry: 'again' }) },
    { weight: 1.5, plan: ({ rng, page: p }) => {
        const rt = p.raid!, reason = rng() < .5 ? 'extract' as const : 'death' as const;
        return { kind: reason, label: `settle by ${reason}`, run: () => { rt.finish(reason); return rt.settlement; },
            failed: (s: typeof rt.settlement) => !s.committed && s.retryable, ok: (s: typeof rt.settlement) => s.committed, effect: () => ({ kind: reason }),
            retry: { staged: () => { assert.ok(rt.retrySettlement()); return rt.settlement; } },
            after: (s: typeof rt.settlement) => {
                assert.ok(s.committed); assert.equal(p.state.save.lastResult?.outcome, reason);
                // Nothing stays staged: a second retry grants nothing and writes nothing.
                const bytes = raw(p); assert.equal(rt.retrySettlement(), false); assert.equal(p.saves.retrySettlement(), false); assert.equal(raw(p), bytes);
                rt.dispose(); p.raid = null; p.driver = null;
                assert.equal(p.state.state, 'result'); assert.ok(p.yard.returnToBase().ok);
            } };
    } },
];

/** Export the live raid (the old tab page's full backup) and resume it on a fresh page, which plays on. */
function raidBackup(ctx: Context): Plan {
    const { rng, page: p, stats } = ctx;
    return { kind: 'raid backup', label: 'export the live raid and resume it on a fresh page', failable: false, failed: () => false, ok: () => true, effect: () => SAME, retry: 'again', run: () => {
        const text = encodeRecoveryBackup(p.saves.backupRecord()!), decoded = decodePortableBackup(text);
        assert.equal(decoded.kind, 'session');
        const record = (decoded as { record: SessionRecord }).record, fresh = openPage();
        fresh.state.state = 'hideout';
        if (rng() < FAIL_RATE) {
            const bytes = raw(fresh); fresh.failing = true;
            try { assert.equal(fresh.saves.importRecord(record), false); } finally { fresh.failing = false; }
            assert.equal(raw(fresh), bytes); assert.ok(fresh.saves.persist());
            count(stats.failed, 'import');
        }
        assert.ok(fresh.saves.importRecord(record), fresh.state.storageError);
        fresh.state.state = 'menu'; assert.ok(fresh.saves.resumeRun()); fresh.state.state = 'run';
        startRaid(fresh);
        const live = (r: SessionRecord) => JSON.stringify(r.expansion?.raid ?? r.raid);
        // The backup holds the live raid (its player stands where the last step put them), and the fresh page resumes exactly that.
        assert.deepEqual(JSON.parse(live(decodeSession(raw(fresh)))), JSON.parse(live(record)), 'the raid resumes exactly as exported');
        ctx.page = fresh;
        return true;
    } };
}

/** Everything the session and the Runtimes hold in memory. */
function memory(p: Page): string {
    const scene = p.raid && (p.raid.layered ? p.raid.snapshotExpansion() : p.raid.snapshot());
    return JSON.stringify([p.state.save, p.state.loadout, p.state.expansion, scene]);
}
/** Retry the save the way the player does after a failed write: the yard's or the raid's retry button. */
function retrySave(p: Page) { if (p.raid) assert.ok(p.raid.retrySave(), p.state.storageError); else assert.ok(p.yard.retrySave().ok, p.state.storageError); }

/** One step, with a forced write failure first when `fail`; returns what the step may have changed. */
function play(ctx: Context, plan: Plan, fail: boolean, log: string[]): Effect {
    const p = ctx.page;
    let out: unknown;
    if (fail && plan.failable !== false) {
        const bytes = raw(p), before = memory(p);
        p.failing = true;
        try { out = plan.run(); } finally { p.failing = false; }
        assert.equal(raw(p), bytes, `${plan.label}: nothing is written while storage fails`);
        if (plan.failed(out)) {
            log.push(`  (the write failed: ${p.state.storageError || 'save-failed'}; retried)`);
            count(ctx.stats.failed, plan.retry === 'again' ? p.raid ? 'raid' : 'station' : plan.kind);
            if (plan.retry === 'again') {
                assert.equal(memory(p), before, `${plan.label}: a failed write leaves the game as it was`);
                retrySave(p);
                expectStep(ctx.before, census(decodeSession(raw(p))), SAME);
                out = plan.run();
            } else out = plan.retry.staged();
        } else assert.equal(plan.effect(out).kind, 'same', `${plan.label}: refused before writing, so nothing changed`);
    } else out = plan.run();
    plan.after?.(out);
    if (plan.ok(out)) count(ctx.stats.done, plan.kind);
    return plan.effect(out);
}

function weighted(rng: Rng, ops: Op[]): Op {
    let left = rng() * ops.reduce((n, op) => n + op.weight, 0);
    return ops.find(op => (left -= op.weight) < 0) ?? ops[ops.length - 1];
}

function playSeed(seed: number, stats: Stats) {
    const rng = D.seededRandom(Math.imul(seed, 0x9e3779b1) >>> 0), log: string[] = [];
    let step = 0;
    try {
        const page = stocked(seed, rng), first = census(decodeSession(raw(page)));
        const ctx: Context = { seed, rng, page, before: first, stats };
        let stored = raw(page);
        expectSession(page, first);
        for (step = 1; step <= STEPS; step++) {
            let plan: Plan | null = null;
            for (let tries = 0; tries < 30 && !plan; tries++) plan = weighted(rng, ctx.page.raid ? RAID : STATION).plan(ctx);
            if (!plan) continue;
            const fail = rng() < FAIL_RATE;
            log.push(`${step}. ${plan.label}${fail ? ' [storage fails]' : ''}`);
            const effect = play(ctx, plan, fail, log);
            if (raw(ctx.page) === stored) {
                // Nothing was written, so nothing may have been done: no step reports success without its write.
                assert.equal(effect.kind, 'same', `${plan.label}: done without a write`);
                expectSession(ctx.page, ctx.before);
                continue;
            }
            stored = raw(ctx.page);
            const after = census(decodeSession(stored));
            expectStep(ctx.before, after, effect);
            expectSession(ctx.page, after);
            ctx.before = after;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed ${seed}, step ${step}: ${message}\nsteps:\n${log.join('\n')}`, { cause: error });
    }
}

/**
 * Play the seeds of `seeds` (a list such as "1-100"; GUNSMITH_SEEDS replaces it), report what was done, and check that
 * every kind of step really happened, often enough to mean something. Two test files split the 200 seeds so the unit
 * run can play them in parallel.
 */
export function playConservation(t: TestContext, seeds: string): void {
    const stats: Stats = { done: new Map(), failed: new Map() }, clock = Date.now, chosen = process.env.GUNSMITH_SEEDS;
    // Item uids carry the clock (D.uid; the sessions and Runtimes take NOW). A clock that ticks once per read sorts every
    // new uid after the earlier ones, so uids compare in the order they were made, as with a real clock, and a seed replays
    // the same steps whether it runs alone (GUNSMITH_SEEDS) or after others.
    let tick = 0;
    Date.now = () => NOW + tick++;
    try { for (const seed of seedList(chosen ?? seeds)) playSeed(seed, stats); } finally { Date.now = clock; }
    const list = (counts: Map<string, number>) => [...counts].sort().map(([kind, n]) => `${kind} ${n}`).join(', ');
    t.diagnostic(`done: ${list(stats.done)}`);
    t.diagnostic(`failed and retried: ${list(stats.failed)}`);
    if (chosen) return;
    for (const kind of ['quick', 'secure', 'move', 'equip', 'unequip', 'tidy', 'buy', 'sell', 'buy and sell', 'sale refused (relief part)', 'backup',
        'deploy coast', 'deploy buildings', 'deploy mall', 'raid equip', 'raid move', 'drop', 'pickup', 'pickup (classic ground gun)',
        'crate', 'corpse', 'kill', 'stairs', 'raid backup', 'checkpoint', 'extract', 'death'])
        assert.ok((stats.done.get(kind) ?? 0) >= 5, `${kind}: ${stats.done.get(kind) ?? 0} times`);
    for (const kind of ['station', 'raid', 'import', 'kill', 'stairs', 'extract', 'death'])
        assert.ok((stats.failed.get(kind) ?? 0) >= 3, `failed ${kind}: ${stats.failed.get(kind) ?? 0} times`);
}
