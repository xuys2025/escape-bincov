import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as D from '../src/domain';
import { SaveSession, createSessionState } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { decodeBackup } from '../src/save-backup';
import { factoryState, withV8Footprints } from '../src/gunsmith/instance';
import { overflow, relayoutProfile } from '../src/gunsmith/relayout';
import { planGunEdit } from '../src/gunsmith/edit';
import { migrateLayout } from '../src/gunsmith/relayout-record';
import { entityUid } from '../src/expansion-state';
import { gun, node, yard } from './fixtures/workbench';
import { v8Record } from './fixtures/old-saves';

// #28 M3-12 (docs/gunsmith/CONTRACTS.md, M3-12): footprints follow the magazine and the stash grew to 10 x 8 (12 rows
// built out), so a record v8 or a profile file laid out by the old footprints is laid out again on read. Each case is a
// layout the v8 rules accept (one row per gun, the stash 6 or 9 rows) that overlaps under the current ones.
const NOW = 1800000000000;
const SAVES = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'gunsmith-v5-saves.json'), 'utf8'));

const m4 = (uid: string, x: number, y: number): D.Item => ({ uid, id: 'mb4a1', qty: 1, x, y, gun: factoryState() });
const watch = (uid: string, x: number, y: number): D.Item => ({ uid, id: 'watch', qty: 1, x, y });
/** A G17 with its long magazine: 2 x 1 by the v8 rules, 2 x 2 now. */
const longG17 = (uid: string, x: number, y: number): D.Item => ({ qty: 1, x, y, ...gun(uid, 'gb17', [node(`${uid}-g01`, 'G01', 'mag')]) });
/** Watches on every cell of `inv` that `taken` leaves free, row by row. */
function fill(inv: D.Inventory, prefix: string, taken: (x: number, y: number) => boolean) {
    for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++) if (!taken(x, y)) inv.items.push(watch(`${prefix}-${x}-${y}`, x, y));
}
/** Every item a profile holds, as uid -> id, gun included: what a relayout must keep. */
const held = (p: D.SaveDataV1) => Object.fromEntries([p.stash, p.bag, p.safe].flatMap(inv => inv.items).map(i => [i.uid, `${i.id}${i.gun ? JSON.stringify(i.gun) : ''}`]));
const at = (inv: D.Inventory, uid: string) => { const i = inv.items.find(x => x.uid === uid); return i && [i.x, i.y, !!i.rotated]; };
/** The text a v8 client wrote for this yard's record, its profile stocked by `stock` under the v8 rules (stash 6 or 9 rows). */
function v8Text(stock: (p: D.SaveDataV1) => void): string {
    const r = JSON.parse(yard(() => {}).raw);
    delete r.story; delete r.storyBackup; delete r.layoutBackup; r.version = 8; r.profile.stash.h = r.profile.upgraded ? 9 : 6;
    stock(r.profile);
    return JSON.stringify(r);
}
function opened(text: string) {
    const data = new Map([[SESSION_KEY, text]]), storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => NOW);
    return { state, saves, initialized: saves.initialize(), get raw() { return data.get(SESSION_KEY)!; } };
}

test('at the base a grown gun keeps its place and what it now covers moves; the bag and safe overflow into the stash; the v8 text is kept once', () => {
    const text = v8Text(p => {
        p.stash.items = [m4('s-m4', 0, 0), watch('s-w', 1, 1)];
        p.bag.items = [m4('b-m4', 0, 0)]; fill(p.bag, 'b-w', (x, y) => y === 0 && x < 4);
        p.safe.items = [longG17('s-g17', 0, 0), watch('f-w0', 0, 1), watch('f-w1', 1, 1)];
    });
    const stored = JSON.parse(text), after = decodeSession(text), p = after.profile;
    assert.deepEqual([after.version, after.layoutBackup, after.gunsBackup, p.stash.h, p.stash.w], [10, text, stored.gunsBackup, D.STASH_ROWS, D.STASH_W]);
    assert.deepEqual(held(p), held(stored.profile), 'every item once, the same instance');
    // The stash's M4A1 stays and the watch under its new row moves to the first free cell.
    assert.deepEqual([at(p.stash, 's-m4'), at(p.stash, 's-w')], [[0, 0, false], [4, 0, false]]);
    // The full bag cannot take the four watches its M4A1 now covers, nor the safe the two under its G17: the stash does.
    assert.deepEqual([at(p.bag, 'b-m4'), at(p.safe, 's-g17')], [[0, 0, false], [0, 0, false]]);
    assert.deepEqual(['b-w-0-1', 'b-w-1-1', 'b-w-2-1', 'b-w-3-1', 'f-w0', 'f-w1'].map(uid => at(p.stash, uid)),
        [[5, 0, false], [6, 0, false], [7, 0, false], [8, 0, false], [9, 0, false], [4, 1, false]]);
    assert.equal(JSON.stringify(decodeSession(text)), JSON.stringify(after), 'deterministic');
    assert.equal(decodeSession(JSON.stringify(after)).layoutBackup, text, 'a v9 record reads as it is');
    // Opened: the first write stores v9 with the v8 bytes, later writes keep them, never a v9 text in their place.
    const page = opened(text);
    assert.equal(page.initialized, true); assert.deepEqual(page.state.save, after.profile);
    const first = JSON.parse(page.raw);
    assert.deepEqual([first.version, first.layoutBackup], [10, text]);
    assert.ok(page.saves.persist()); assert.equal(JSON.parse(page.raw).layoutBackup, text);
    assert.deepEqual(opened(page.raw).state.save, after.profile);
    // Nothing moves when nothing overlaps: an upgraded stash only gains its rows.
    const upgraded = v8Text(q => { q.upgraded = true; q.stash = { w: 10, h: 9, items: [watch('deep', 9, 8)] }; });
    const grown = decodeSession(upgraded).profile;
    assert.deepEqual([grown.stash.h, grown.stash.items], [D.STASH_UPGRADED_ROWS, [watch('deep', 9, 8)]]);
});

test('what the stash cannot hold goes into the bag, and what nothing holds into the stash overflow, never refused for room', () => {
    // Twelve M4A1s two to a row and watches down the right, the v8 stash full; by the current rules only six keep their row.
    const guns = (skip: string | null) => (p: D.SaveDataV1) => {
        p.stash.items = [];
        for (let y = 0; y < 6; y++) for (const x of [0, 4]) if (`m4-${x}-${y}` !== skip) p.stash.items.push(m4(`m4-${x}-${y}`, x, y));
        for (let y = 0; y < 6; y++) for (const x of [8, 9]) p.stash.items.push(watch(`w-${x}-${y}`, x, y));
        p.bag.items = []; p.safe.items = [];
    };
    const text = v8Text(guns('m4-4-5')), stored = JSON.parse(text), p = decodeSession(text).profile;
    assert.deepEqual(held(p), held(stored.profile));
    // Rows 6 and 7 take two of the five moved guns; the bag takes the other three, the last turned.
    assert.deepEqual(['m4-0-1', 'm4-4-1'].map(uid => at(p.stash, uid)), [[0, 6, false], [4, 6, false]]);
    assert.deepEqual(['m4-0-3', 'm4-4-3', 'm4-0-5'].map(uid => at(p.bag, uid)), [[0, 0, false], [0, 2, false], [4, 0, true]]);
    // One gun more and the bag cannot take the last: it lies in the overflow, the first place below the stash.
    const full = v8Text(guns(null)), after = decodeSession(full), q = after.profile;
    assert.deepEqual(held(q), held(JSON.parse(full).profile));
    assert.deepEqual([q.stash.h, at(q.stash, 'm4-4-5'), D.stashOverflow(q.stash).map(i => i.uid), D.stashShownRows(q.stash)], [D.STASH_ROWS, [0, 8, false], ['m4-4-5'], 10]);
    assert.equal(JSON.stringify(decodeSession(JSON.stringify(after))), JSON.stringify(after), 'a v9 record with an overflow reads as it is');
    assert.deepEqual(relayoutProfile(withV8Footprints(() => JSON.parse(full).profile)), q);
    const page = opened(full);
    assert.equal(page.initialized, true); assert.deepEqual(page.state.save, q);
    // Only past D.STASH_OVERFLOW_ROWS is it refused.
    const stash = D.createInventory(D.STASH_W, D.STASH_ROWS), many = Array.from({ length: D.STASH_W * D.STASH_OVERFLOW_ROWS + 1 }, (_, i) => watch(`x-${i}`, 0, 0));
    assert.throws(() => overflow(structuredClone(stash), many), /按新的占格放不下/);
    overflow(stash, many.slice(1));
    assert.equal(D.stashShownRows(stash), D.STASH_ROWS + D.STASH_OVERFLOW_ROWS);
});

test('in a raid what the carried bag or safe cannot hold lies under the player and a crate\'s at the crate, as drops: a gun under its uid, the rest new loot; the profile safe stays the raid safe', () => {
    const record = v8Record(decodeSession(JSON.stringify(SAVES.liveRaidV5))), raid = record.expansion.raid;
    const box = Object.values<any>(raid.maps).flatMap(m => m.containers)[0], n = raid.nextEntity;
    // The bag's M4A1 grows over the G17 and two watches below it; the safe's G17 over two watches; the crate's M4A1 over four.
    raid.loadout.bag.items = [m4('r-m4', 0, 0), longG17('r-p', 0, 1)]; fill(raid.loadout.bag, 'r-b', (x, y) => y === 0 && x < 4 || y === 1 && x < 2);
    raid.loadout.safe.items = [longG17('r-g17', 0, 0), watch('r-f0', 0, 1), watch('r-f1', 1, 1)];
    record.profile.safe = structuredClone(raid.loadout.safe);
    box.inventory.items = [m4('c-m4', 0, 0)]; fill(box.inventory, 'c-w', (x, y) => y === 0 && x < 4);
    const text = JSON.stringify(record), after = decodeSession(text), r = after.expansion!.raid!;
    assert.deepEqual([after.version, after.layoutBackup, after.profile.stash.h], [10, text, D.STASH_ROWS]);
    const all = Object.values(r.maps).flatMap(m => m.loot), map = r.maps[r.currentMap].loot;
    const ground = (uids: string[]) => uids.map(uid => { const l = all.find(x => x.uid === uid); return l && [l.id, l.x, l.y]; });
    const serials = (from: number, count: number) => Array.from({ length: count }, (_, i) => entityUid(r, from + i));
    const player = [r.player.x, r.player.y], crate = [box.x, box.y];
    assert.deepEqual(ground(['r-p', ...serials(n, 4)]), [['gb17', ...player], ...Array(4).fill(['watch', ...player])]);
    assert.deepEqual(all.find(l => l.uid === 'r-p')!.gun, longG17('r-p', 0, 0).gun, 'the gun keeps its state');
    assert.ok(['r-p', ...serials(n, 4)].every(uid => map.some(l => l.uid === uid)), 'on the map the player is on');
    assert.deepEqual(ground(serials(n + 4, 4)), Array(4).fill(['watch', ...crate]));
    assert.equal(r.nextEntity, n + 8);
    assert.doesNotMatch(JSON.stringify(after.expansion), /"(r-b-[23]-1|r-f[01]|c-w-[0-3]-1)"/, 'the moved watches have no old uid left');
    assert.deepEqual([at(r.loadout.bag, 'r-m4'), at(r.loadout.safe, 'r-g17')], [[0, 0, false], [0, 0, false]]);
    assert.deepEqual(after.profile.safe, r.loadout.safe);
    // The raid resumes on the migrated record.
    const page = opened(text);
    assert.equal(page.initialized, true); assert.ok(page.saves.resumeRun());
    // A classic raid drops the carried overflow at the player too, under its own counter.
    const classic = v8Record(decodeSession(JSON.stringify(SAVES.classicRaidV5))), c = classic.raid, k = c.nextEntity;
    c.loadout.bag.items = [m4('k-m4', 0, 0)]; fill(c.loadout.bag, 'k-b', (x, y) => y === 0 && x < 4);
    const settled = decodeSession(JSON.stringify(classic)).raid!;
    assert.deepEqual([0, 1, 2, 3].map(i => { const l = settled.loot.find(x => x.uid === `entity-${k + i}`); return l && [l.id, l.x, l.y]; }),
        Array(4).fill(['watch', c.player.x, c.player.y]));
    assert.equal(settled.nextEntity, k + 4);
});

test('a v8 client\'s profile file is laid out again on import, its leftovers in the overflow; a current one reads as it is', () => {
    const profile = (rows: number, items: D.Item[]) => {
        const p: any = structuredClone(yard(() => {}).state.save);
        p.stash = { w: 10, h: rows, items }; p.activeRun = null;
        return JSON.stringify({ format: 'escape-bincov-backup', formatVersion: 3, createdAt: '2026-10-28T00:00:00.000Z', save: p }, null, 2);
    };
    const old = decodeBackup(profile(6, [m4('s-m4', 0, 0), watch('s-w', 1, 1)]));
    assert.deepEqual([old.stash.h, at(old.stash, 's-m4'), at(old.stash, 's-w')], [D.STASH_ROWS, [0, 0, false], [4, 0, false]]);
    const current = decodeBackup(profile(D.STASH_ROWS, old.stash.items));
    assert.deepEqual(current, old);
    // Seven rows were never a stash; the old rows with the current footprints overlapping are not either.
    assert.throws(() => decodeBackup(profile(7, [])));
    assert.throws(() => decodeBackup(profile(D.STASH_ROWS, [m4('s-m4', 0, 0), watch('s-w', 1, 1)])));
    const crowded: D.Item[] = [];
    for (let y = 0; y < 6; y++) for (const x of [0, 4]) crowded.push(m4(`m4-${x}-${y}`, x, y));
    for (let y = 0; y < 6; y++) for (const x of [8, 9]) crowded.push(watch(`w-${x}-${y}`, x, y));
    const crowdedProfile = decodeBackup(profile(6, crowded));
    assert.deepEqual(D.stashOverflow(crowdedProfile.stash).map(i => i.uid), ['m4-4-5']);
    // The overflow is the stash's only: an item below the bag, or one reaching across the stash's last row, is refused.
    const raw = JSON.parse(profile(D.STASH_ROWS, [m4('s-m4', 0, 0)]));
    assert.throws(() => decodeBackup(JSON.stringify({ ...raw, save: { ...raw.save, bag: { w: 6, h: 5, items: [watch('b', 0, 5)] } } })));
    assert.throws(() => decodeBackup(profile(D.STASH_ROWS, [m4('s-m4', 0, D.STASH_ROWS - 1)])));
    assert.equal(decodeBackup(profile(D.STASH_ROWS, [m4('s-m4', 0, D.STASH_ROWS)])).stash.items.length, 1);
    assert.throws(() => decodeBackup(profile(D.STASH_ROWS, [m4('s-m4', 0, D.STASH_ROWS + D.STASH_OVERFLOW_ROWS - 1)])));
});

test('migrateLayout takes only a v8 record and its text, and leaves its input alone', () => {
    const r = JSON.parse(v8Text(p => { p.stash.items = [m4('s-m4', 0, 0), watch('s-w', 1, 1)]; }));
    const before = structuredClone(r), out = migrateLayout(r, null);
    assert.deepEqual(r, before); assert.deepEqual([out.version, out.layoutBackup], [9, null]);
    for (const version of [7, 9, '8']) assert.throws(() => migrateLayout({ ...r, version }, null), /按新的占格放不下/);
    assert.throws(() => migrateLayout(r, 8 as never), /按新的占格放不下/);
});

test('the stash overflow: items only leave it, deploying waits until it is empty, sorting brings up what fits, and v8 never had one', () => {
    const y = yard(p => { p.stash.items = [m4('s-m4', 0, 0), { uid: 'o03', id: 'O03', qty: 1, x: 9, y: 0 }, watch('o-w', 0, D.STASH_ROWS), m4('o-m4', 2, D.STASH_ROWS)]; });
    const stash = () => y.state.save.stash;
    assert.deepEqual([D.stashOverflow(stash()).map(i => i.uid), D.stashShownRows(stash())], [['o-w', 'o-m4'], D.STASH_ROWS + 2]);
    // Nothing goes in: no free place below the grid, and a move there is refused.
    assert.equal(D.fits(stash(), 'watch', 0, D.STASH_ROWS + 1), false);
    assert.ok(y.runtime.placementError('stash', 'stash', 's-m4', 6, D.STASH_ROWS, false));
    // Deploying is refused with the reason, by the Runtime and by the session underneath.
    const refused = y.runtime.deploy({ world: 'coast', seed: 'overflow' });
    assert.deepEqual([refused.ok, !refused.ok && refused.message], [false, D.OVERFLOW_BLOCKS_DEPLOY]);
    assert.equal(y.saves.beginRun(1), false);
    // Nor is a gun there modified in place.
    const plan = planGunEdit(y.state.save, 'o-m4', [{ kind: 'install', uid: 'o03' }]);
    assert.deepEqual([plan.ok, !plan.ok && plan.reason], [false, '这把枪在仓库溢出区，先移进仓库或背包再改装。']);
    // Out it comes: the watch to the bag, the M4A1 up by sorting (the stash's own goods first, then the overflow where it fits).
    assert.ok(y.runtime.move('stash', 'bag', 'o-w', 0, 0, false).ok);
    assert.deepEqual(D.stashOverflow(stash()).map(i => i.uid), ['o-m4']);
    assert.ok(y.runtime.stashAll().ok, 'the bag still goes in whole');
    assert.ok(y.runtime.sortStash().ok);
    assert.deepEqual([D.stashOverflow(stash()), D.stashShownRows(stash())], [[], D.STASH_ROWS]);
    assert.ok(y.runtime.deploy({ world: 'coast', seed: 'overflow' }).ok);
    // A full stash keeps the overflow below when sorted.
    const full = yard(p => { D.addItem(p.stash, 'scrap', p.stash.w * p.stash.h * D.ITEMS.scrap.stack); p.stash.items.push(m4('o-m4', 0, D.STASH_ROWS)); });
    assert.ok(full.runtime.sortStash().ok);
    assert.deepEqual(D.stashOverflow(full.state.save.stash).map(i => [i.uid, i.x, i.y]), [['o-m4', 0, D.STASH_ROWS]]);
    // Building the stash out takes the overflow into its new rows.
    const grow = structuredClone(full.state.save); grow.quests.repair = true; grow.cash = D.STASH_UPGRADE_COST;
    assert.ok(D.upgradeStash(grow));
    assert.deepEqual([D.stashOverflow(grow.stash), grow.stash.items.find(i => i.uid === 'o-m4')!.y, grow.stash.h], [[], D.STASH_ROWS, D.STASH_UPGRADED_ROWS]);
    // The v8 rules know no overflow: such a record is refused, its bytes kept.
    const v8 = v8Text(p => { p.stash.items = [watch('o-w', 0, 6)]; });
    assert.throws(() => decodeSession(v8), /无法读取这份存档/);
});
