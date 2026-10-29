import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { ATTACHMENTS, SLOT_NAMES, type Slot } from '../src/gunsmith/catalog';
import { checkInstall, removalCascade } from '../src/gunsmith/compat';
import { locateGun, planGunEdit, type GunEdit, type GunEditPlan } from '../src/gunsmith/edit';
import { buildOf, factoryState, gunUids, nodesOf, repeatedUids, type GunState, type PartNode } from '../src/gunsmith/instance';
import type { SessionRecord } from '../src/recovery-store';
import { reason, yard } from './fixtures/workbench';

/*
 * Gunsmith M2-04: random workbench edits through the real hideout Runtime keep every part, gun, round and coin, the
 * idea of M1-07's conservation test (tests/fixtures/conservation.ts) applied to the edit transaction.
 *
 * Every seed stocks a yard with a gun in hand (full magazine, some relief rounds), more guns in the stash and bag,
 * loose sample parts (some relief) and rounds of both kinds; half the seeds pack the stash nearly full. Each step either
 * shuffles the base (quick moves, the safe, equipping, sorting) or opens the workbench on a random gun and builds a
 * random edit list, edit by edit as a player taps: removals, installs of owned parts that fit (and some that do not),
 * moves of parts the list took off, previews of parts not owned. Edits the planner refuses are dropped (the session
 * refuses them too and keeps its preview). The list is previewed through the session; a confirmable one is committed,
 * sometimes after the base changed under it (stale, previewed again) or after a forced write failure and retrySave.
 *
 * After every step the stored record is decoded and checked: every uid in it once; the same parts (uid, type, relief
 * flag), loose or on a gun; the same guns; the same rounds of each kind, magazine included, and other goods; the same
 * cash; the session holding the committed profile. A commit holds exactly the previewed candidate: the parts that went
 * on are on the gun, the parts that came off lie in the stash. A preview never writes; a used token commits nothing.
 */

const SEEDS = 120, STEPS = 20, FAIL_RATE = .12, STALE_RATE = .08;
type Rng = () => number;
const int = (rng: Rng, n: number) => Math.floor(rng() * n);
const pick = <T>(rng: Rng, list: readonly T[]): T => list[int(rng, list.length)];
/**
 * The loose parts a seed holds, 0 to 2 of each: those of the fixture's guns, and the rail parts. Since #28 M3-06 every
 * catalog part is an item; the other guns' own parts would only crowd the containers.
 */
const FIXTURE_GUNS: readonly string[] = ['mb4a1', 'gb17', 'carbine', 'pistol', 'shotgun'];
const SAMPLE = Object.keys(D.ITEMS).filter(id => D.isAttachment(id) && (!ATTACHMENTS[id].guns || ATTACHMENTS[id].guns!.some(g => FIXTURE_GUNS.includes(g))));
const CATALOG = Object.keys(ATTACHMENTS);
const SLOTS = Object.keys(SLOT_NAMES) as Slot[];
const CONTAINERS = ['stash', 'bag', 'safe'] as const;
type Yard = ReturnType<typeof yard>;
type Stats = Map<string, number>;
const count = (stats: Stats, key: string, n = 1) => { if (n) stats.set(key, (stats.get(key) ?? 0) + n); };
const free = (inv: D.Inventory) => inv.w * inv.h - inv.items.reduce((n, i) => { const s = D.itemSize(i); return n + s.w * s.h; }, 0);

function stock(seed: number, rng: Rng) {
    let n = 0;
    const uid = () => `e${seed}-${++n}`;
    const part = (id: string, slot: Slot, children: PartNode[] = []): PartNode => ({ uid: uid(), id, slot, relief: rng() < .15, children });
    return (p: D.SaveDataV1) => {
        p.cash = 3000;
        // Mostly an M4A1 in hand, whose quick magazine unloads rounds; half the magazines hold mostly relief rounds.
        const inHand = pick(rng, ['mb4a1', 'mb4a1', 'gb17', 'carbine'] as const), ammo = D.WEAPONS[inHand].magazine - int(rng, 3);
        p.equipment = { weapon: inHand, weaponUid: uid(), gun: factoryState(), relief: false, ammo,
            ammoRelief: rng() < .5 ? int(rng, Math.min(8, ammo) + 1) : ammo - int(rng, Math.min(6, ammo) + 1) };
        // Guns in the stash and bag; two come fitted, a device on the handguard, its switch often on.
        const fitted: [string, GunState][] = [
            ['mb4a1', { parts: [part('H01', 'handguard', [part('T01', 'side'), part('F03', 'under')])], devices: { laser: rng() < .7, light: false } }],
            ['carbine', { parts: [part('H05', 'handguard', [part('T05', 'side')]), part('A07', 'base', [part('O03', 'top')])], devices: { laser: false, light: rng() < .7 } }],
        ];
        for (const [id, state] of [...fitted, ...['mb4a1', 'gb17', 'carbine', 'gb17', 'pistol', 'shotgun'].map(id => [id, factoryState()] as const)])
            D.placeItem(rng() < .65 ? p.stash : p.bag, { uid: uid(), id, qty: 1, x: 0, y: 0, gun: state });
        // Loose parts, some relief, and always one quick magazine.
        D.placeItem(p.bag, { uid: uid(), id: 'G10', qty: 1, x: 0, y: 0 });
        for (const id of SAMPLE) for (let k = int(rng, 3); k > 0; k--)
            D.placeItem(p[pick(rng, ['stash', 'stash', 'bag', 'bag', 'safe'] as const)], { uid: uid(), id, qty: 1, x: 0, y: 0, ...(rng() < .15 ? { relief: true } : {}) });
        D.addItem(p.stash, 'ammoR', 5 + int(rng, 40)); D.addItem(p.stash, 'ammoR', int(rng, 12), true);
        D.addItem(p.bag, 'ammo9', int(rng, 30)); D.addItem(p.stash, 'ammo9', int(rng, 10), true);
        // Half the seeds keep the stash nearly full, so room runs out for what comes off and for a gun that grows.
        if (rng() < .5) for (const keep = int(rng, 5); free(p.stash) > keep && D.addItem(p.stash, 'watch', 1) === 0;) { /* fill */ }
    };
}

/** The record's parts, guns and goods (rounds in the magazine counted with their kind), and every uid once. */
function census(record: SessionRecord) {
    const p = record.profile, uids: string[] = [], parts: string[] = [], guns: string[] = [], goods = new Map<string, number>();
    const tag = (uid: string, id: string, relief: boolean | undefined) => `${uid} ${id}${relief ? ' relief' : ''}`;
    const add = (key: string, qty: number) => { if (qty) goods.set(key, (goods.get(key) ?? 0) + qty); };
    const gun = (uid: string, id: string, relief: boolean, state: GunState) => {
        guns.push(tag(uid, id, relief));
        for (const n of nodesOf(state.parts)) parts.push(tag(n.uid, n.id, n.relief));
        uids.push(...gunUids({ uid, parts: state.parts }));
    };
    for (const c of CONTAINERS) for (const i of p[c].items) {
        if (i.gun) { gun(i.uid, i.id, !!i.relief, i.gun); continue; }
        uids.push(i.uid);
        if (D.isAttachment(i.id)) parts.push(tag(i.uid, i.id, i.relief)); else add(`${i.id}${i.relief ? ' relief' : ''}`, i.qty);
    }
    const e = p.equipment;
    if (e.weapon) {
        gun(e.weaponUid!, e.weapon, e.relief, e.gun!);
        const ammo = D.WEAPONS[e.weapon].ammo!;
        add(ammo, e.ammo - e.ammoRelief); add(`${ammo} relief`, e.ammoRelief);
    }
    assert.deepEqual(repeatedUids(uids), [], 'every uid in the record is unique');
    // A yard transfer may give a loose part a new uid (D.transferItem goes through addItem, CONTRACTS M2-02), so across
    // shuffles parts are compared by type; across a workbench step by uid as well (`parts`).
    return { parts: parts.sort(), totals: { kinds: parts.map(t => t.slice(t.indexOf(' ') + 1)).sort(), guns: guns.sort(),
        goods: [...goods].sort(([a], [b]) => a < b ? -1 : 1), cash: p.cash } };
}

/** Shuffle the base through the yard: what the workbench finds where changes between steps. */
function shuffle(f: Yard, rng: Rng, log: string[]) {
    const p = f.state.save, from = pick(rng, ['stash', 'bag'] as const), item = p[from].items.length ? pick(rng, p[from].items) : null;
    const guns = (['stash', 'bag'] as const).flatMap(c => p[c].items.filter(i => i.gun).map(i => ({ c, i })));
    const op = int(rng, 5);
    if (op === 0 && item) { log.push(`  quick move ${item.id}#${item.uid} from the ${from}`); f.runtime.quickMove(from, item.uid); }
    else if (op === 1 && item) { log.push(`  secure ${item.id}#${item.uid} from the ${from}`); f.runtime.secure(from, item.uid); }
    else if (op === 2 && guns.length) { const g = pick(rng, guns); log.push(`  equip ${g.i.id}#${g.i.uid}`); f.runtime.equip(g.c, g.i.uid); }
    else if (op === 3 && p.equipment.weapon) { log.push('  unequip'); f.runtime.unequip(); }
    else if (op === 4) { log.push('  sort the stash'); f.runtime.sortStash(); }
}

/** A random tap on the candidate `state` of gun `target`, as the edits it makes: mostly what a player would do, sometimes not. */
function randomTap(rng: Rng, p: D.SaveDataV1, target: string, state: GunState): GunEdit[] {
    const gun = locateGun(p, target)!, original = nodesOf(gun.state.parts), on = nodesOf(state.parts);
    const build = buildOf({ id: gun.id, parts: state.parts }), fits = (id: string) => checkInstall(build, id).ok;
    // Owned: loose parts not on this candidate, and parts of this gun the list took off.
    const owned: { uid: string; id: string }[] = [...CONTAINERS.flatMap(c => p[c].items.filter(i => D.isAttachment(i.id) && !on.some(n => n.uid === i.uid))),
        ...original.filter(n => !on.some(o => o.uid === n.uid))];
    const r = rng();
    if (r < .3) {
        if (!on.length) return [];
        // Mostly a part that takes others with it: a handguard or base with parts on it, a barrel a suppressor needs.
        const heavy = on.filter(n => removalCascade(build, n.uid).length);
        return [{ kind: 'remove', uid: pick(rng, heavy.length && rng() < .6 ? heavy : on).uid }];
    }
    if (r < .4) {
        // Swap a part that carries others for another of its kind and move what it carried over (a handguard change).
        const carrier = on.find(n => n.children.length && owned.some(o => o.id === n.id));
        const other = carrier && owned.find(o => o.id === carrier.id);
        if (!carrier || !other) return [];
        const parent = build.parts.find(x => x.uid === carrier.uid)!.parent;
        return [{ kind: 'remove', uid: carrier.uid }, { kind: 'install', uid: other.uid, at: { parent, slot: carrier.slot } },
            ...carrier.children.map(c => ({ kind: 'install', uid: c.uid, at: { parent: other.uid, slot: c.slot } }) as GunEdit)];
    }
    if (r < .86) {
        // Mostly a part that fits; for the gun in hand often the quick magazine, which unloads rounds.
        const fitting = owned.filter(o => fits(o.id)), quick = gun.where === 'equipment' ? fitting.filter(o => o.id === 'G10') : [];
        const part = quick.length && rng() < .6 ? pick(rng, quick) : fitting.length && rng() < .75 ? pick(rng, fitting) : owned.length ? pick(rng, owned) : null;
        if (!part) return [];
        const at = rng() < .6 ? undefined : { parent: pick(rng, [null, ...on.map(n => n.uid)]), slot: rng() < .9 ? ATTACHMENTS[part.id].mount : pick(rng, SLOTS) };
        return [{ kind: 'install', uid: part.uid, ...(at ? { at } : {}) }];
    }
    if (r < .94) {
        const fitting = CATALOG.filter(fits);
        return [{ kind: 'install', id: fitting.length && rng() < .75 ? pick(rng, fitting) : pick(rng, CATALOG) }];
    }
    // A tap that cannot work: a part already on, a uid that is gone, the gun itself or a part of another gun.
    const others = CONTAINERS.flatMap(c => p[c].items.filter(i => i.gun && i.uid !== target).flatMap(i => nodesOf(i.gun!.parts).map(n => n.uid)));
    return [{ kind: 'install', uid: pick(rng, [...on.map(n => n.uid), 'gone', target, ...others]) }];
}

/** `shuffled.parts`: the parts right after a yard move made under the preview, which may re-issue a loose part's uid. */
function workbench(f: Yard, rng: Rng, log: string[], stats: Stats, shuffled: { parts: string[] | null }) {
    const p = f.state.save;
    const guns = [...(p.equipment.weaponUid ? [p.equipment.weaponUid] : []), ...CONTAINERS.flatMap(c => p[c].items.filter(i => i.gun).map(i => i.uid))];
    if (!guns.length) return;
    const inHand = p.equipment.weaponUid;
    const target = inHand && rng() < .35 ? inHand : pick(rng, guns), session = f.runtime.openGunsmith(target), edits: GunEdit[] = [];
    let plan: GunEditPlan | null = null;
    for (let taps = 1 + int(rng, 5); taps > 0; taps--) {
        for (const edit of randomTap(rng, p, target, plan?.preview?.after ?? locateGun(p, target)!.state)) {
            const next = planGunEdit(p, target, [...edits, edit]);
            if (!next.ok && next.edit !== null) {
                assert.equal(next.edit, edits.length, 'an accepted list stays accepted: only the new edit can fail');
                count(stats, `refused ${next.code}`);
                if (rng() < .25) {
                    const shown = session.view(), refused = session.preview([...edits, edit]);
                    assert.deepEqual([refused.ok, refused.edit], [false, edits.length]); assert.deepEqual(session.view(), shown, 'a refused edit leaves the preview as it was');
                }
                break;
            }
            edits.push(edit); plan = next;
        }
    }
    if (!plan) return;
    log.push(`  ${locateGun(p, target)!.id}#${target} (${plan.preview!.gun.where}): ${JSON.stringify(edits)} -> ${plan.ok ? 'ok' : plan.code}`);
    const raw = f.raw, shown = session.preview(edits);
    assert.ok(shown.ok, 'the session previews what the planner accepts');
    assert.equal(f.raw, raw, 'a preview never writes');
    assert.deepEqual(shown.preview, plan.preview, 'the session shows what the planner plans');
    if (!plan.ok) {
        count(stats, `previewed ${plan.code}`);
        assert.equal(shown.token, undefined);
        assert.equal(reason(session.confirm('gunsmith-0')), 'stale');
        assert.equal(f.raw, raw);
        return;
    }
    let token = shown.token!;
    if (rng() < STALE_RATE) {
        // The base changes under the preview: confirming is stale and writes nothing; the player previews again.
        const from = pick(rng, ['stash', 'bag'] as const), item = p[from].items.find(i => i.uid !== target);
        if (item && f.runtime.quickMove(from, item.uid).ok) {
            log.push(`  quick move ${item.id}#${item.uid} under the preview`);
            const moved = f.raw;
            assert.equal(reason(session.confirm(token)), 'stale');
            assert.equal(f.raw, moved);
            count(stats, 'stale');
            shuffled.parts = census(f.record).parts;
            const again = session.preview(edits);
            if (!again.ok || !again.token) return;
            token = again.token;
        }
    }
    if (rng() < FAIL_RATE) {
        const bytes = f.raw, before = structuredClone(f.state.save), view = session.view();
        f.fail();
        try { assert.equal(reason(session.confirm(token)), 'storage'); } finally { f.fail(false); }
        assert.equal(f.raw, bytes, 'a failed write leaves the stored bytes');
        assert.deepEqual([f.state.save, session.view()], [before, view], 'and the base and the preview as they were');
        assert.ok(f.runtime.retrySave().ok);
        count(stats, 'failed and retried');
        log.push('  (the write failed; retried)');
    }
    const committed = planGunEdit(f.state.save, target, edits) as Extract<GunEditPlan, { ok: true }>;
    const result = session.confirm(token);
    assert.ok(result.ok, result.ok ? '' : result.message);
    const after = f.record.profile, held = locateGun(after, target)!, preview = committed.preview;
    assert.deepEqual(held.state, preview.after, 'the gun holds the previewed candidate');
    const items = CONTAINERS.flatMap(c => after[c].items);
    for (const i of preview.installs) assert.ok(!items.some(x => x.uid === i.uid) && nodesOf(held.state.parts).some(n => n.uid === i.uid), `${i.uid} went on`);
    for (const r of preview.removals) assert.ok(after.stash.items.some(x => x.uid === r.uid && x.id === r.id), `${r.uid} lies in the stash`);
    if (preview.unloaded) assert.equal(after.equipment.ammo, preview.capacity.after);
    const used = f.raw;
    assert.equal(reason(session.confirm(token)), 'stale', 'a used token commits nothing more');
    assert.equal(f.raw, used);
    count(stats, 'commit'); count(stats, 'installed', preview.installs.length); count(stats, 'removed', preview.removals.length);
    count(stats, 'removed with a parent', preview.removals.filter(r => r.with).length); count(stats, 'moved', preview.moves.length);
    count(stats, `committed in the ${preview.gun.where}`);
    if (preview.unloaded) { count(stats, 'unloaded'); count(stats, 'unloaded relief', +!!preview.unloaded.relief); }
    if (preview.after.devices.laser || preview.after.devices.light) count(stats, 'switch kept on');
    if ((preview.before.devices.laser && !preview.after.devices.laser) || (preview.before.devices.light && !preview.after.devices.light)) count(stats, 'switch turned off');
}

test('M2-04: random workbench edits keep every part, gun, round and coin, through stale previews, failed writes and retries', t => {
    const stats: Stats = new Map();
    for (let seed = 1; seed <= SEEDS; seed++) {
        const rng = D.seededRandom(Math.imul(seed, 0x2545f491) >>> 0), log: string[] = [];
        let step = 0;
        try {
            const f = yard(stock(seed, rng)), first = census(f.record);
            let last = first;
            for (step = 1; step <= STEPS; step++) {
                log.push(`${step}.`);
                const bench = rng() >= .15;
                const shuffled = { parts: null as string[] | null };
                if (bench) workbench(f, rng, log, stats, shuffled); else shuffle(f, rng, log);
                const record = f.record, now = census(record);
                assert.deepEqual(now.totals, first.totals, 'the same kinds of parts, the same guns, rounds, goods and cash');
                if (bench) assert.deepEqual(now.parts, shuffled.parts ?? last.parts, 'the workbench keeps every part under its own uid and relief flag');
                last = now;
                assert.deepEqual(f.state.save, record.profile, 'the session holds the committed profile');
            }
        } catch (error) {
            throw new Error(`seed ${seed}, step ${step}: ${error instanceof Error ? error.message : error}\n${log.join('\n')}`, { cause: error });
        }
    }
    t.diagnostic([...stats].sort().map(([k, n]) => `${k} ${n}`).join(', '));
    // Every kind of outcome happened often enough to mean something (about half of what the seeds give today).
    for (const [kind, least] of [['commit', 400], ['installed', 400], ['removed', 250], ['removed with a parent', 60], ['moved', 15], ['unloaded', 20],
        ['unloaded relief', 10], ['committed in the equipment', 150], ['committed in the stash', 150], ['committed in the bag', 50], ['switch turned off', 20],
        ['switch kept on', 25], ['previewed unowned', 150], ['previewed space', 25], ['previewed footprint', 5], ['previewed unchanged', 60], ['stale', 20],
        ['failed and retried', 50], ['refused installed', 15], ['refused missing-part', 150], ['refused not-part', 10], ['refused gun', 300], ['refused place', 200]] as const)
        assert.ok((stats.get(kind) ?? 0) >= least, `${kind}: ${stats.get(kind) ?? 0} times`);
});
