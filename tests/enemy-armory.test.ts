import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { archetype, ENEMY_ARCHETYPES } from '../src/enemy-archetypes';
import { ARMED_LEADERS, ARMORY, armamentOf, armoryGuns } from '../src/enemy-armory';
import { validateExpansion, type ExpansionState } from '../src/expansion-state';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { damageLayerEnemy } from '../src/layer-transition';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY } from '../src/recovery-store';
import { GUNS } from '../src/gunsmith/catalog';
import { validFit } from '../src/gunsmith/presets';
import { nodesOf, validateGun } from '../src/gunsmith/instance';

// #28 M4-02 (#140, maintainer 2026-10-29): the armed enemies hold catalog guns by faction and rank, the leaders' with one
// to three parts, and their bodies yield that very gun. #152 adds opt-in gun combat for new encounters. Rules in
// docs/gunsmith/CONTRACTS.md, 「敌人拿什么枪就掉什么枪（M4-02）」.

function deployed(seed: number) {
    const data = new Map<string, string>(), storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout';
    assert.ok(saves.beginRun(seed, true), `seed ${seed}`);
    assert.ok(data.get(SESSION_KEY));
    return state;
}
const armed = (e: ExpansionState) => Object.values(e.raid!.maps).flatMap(m => m.enemies).filter(x => x.tactics?.equipment);
const check = (e: ExpansionState, profile: D.SaveDataV1) => validateExpansion(structuredClone(e), profile, null, resolveExpansionWorld);

test('the table: every archetype that shoots has its guns, all catalog guns, never the bolt-action M700', () => {
    const shooters = Object.keys(ENEMY_ARCHETYPES).filter(id => archetype(id)!.attack === 'projectile');
    assert.deepEqual(Object.keys(ARMORY).filter(id => id !== 'tide-ritualist').sort(), shooters.sort());
    for (const [id, row] of Object.entries(ARMORY)) for (const [gun, weight] of row) {
        assert.ok(Object.hasOwn(GUNS, gun) && D.isGun(gun) && weight > 0, `${id} ${gun}`);
        assert.notEqual(gun, 'mb700');
    }
    assert.deepEqual([...ARMED_LEADERS].sort(), ['blockade-sergeant', 'raider-boss', 'recovery-leader']);
});

test('the draw: fixed by the raid seed and the uid; the rare guns a minority; leaders carry one to three parts that fit', () => {
    assert.deepEqual(armamentOf(7, 'raider-boss', 'enemy-3'), armamentOf(7, 'raider-boss', 'enemy-3'));
    for (const id of Object.keys(ARMORY)) {
        const seen = new Map<string, number>();
        for (let n = 0; n < 900; n++) {
            const arms = armamentOf(n, id, `enemy-${n % 17}`)!;
            assert.ok(armoryGuns(id).includes(arms.gun), `${id} ${arms.gun}`);
            seen.set(arms.gun, (seen.get(arms.gun) ?? 0) + 1);
            if (ARMED_LEADERS.has(id)) {
                assert.ok(validFit(arms.gun, arms.fit), `${id} ${arms.gun} ${JSON.stringify(arms.fit)}`);
                const count = nodesOfFit(arms.fit);
                assert.ok(count >= 1 && count <= 3, `${id}: ${count} parts`);
            } else assert.deepEqual(arms.fit, []);
        }
        // Every gun of the row turns up, each about as often as its weight says.
        const total = ARMORY[id].reduce((n, [, w]) => n + w, 0);
        for (const [gun, w] of ARMORY[id]) assert.ok(Math.abs(seen.get(gun)! / 900 - w / total) < .06, `${id} ${gun} ${seen.get(gun)}`);
    }
});
const nodesOfFit = (fit: { children: unknown[] }[]): number => fit.reduce((n, p) => n + 1 + nodesOfFit(p.children as never), 0);

test('a deployed street raid arms its shooters from their rows, and the record checks it', () => {
    // Seeds with each encounter: 3 the recovery team, 4 the blockade, the rest raiders and mercenaries.
    for (const seed of [11, 12, 13, 14, 23, 24, 42]) {
        const state = deployed(seed), e = state.expansion!;
        const shooters = armed(e);
        assert.ok(shooters.length > 0, `seed ${seed}`);
        for (const x of shooters) {
            const t = x.tactics!;
            assert.ok(armoryGuns(x.id).includes(t.equipment as never), `${x.id} holds ${t.equipment}`);
            assert.equal(Object.hasOwn(t, 'fit'), ARMED_LEADERS.has(x.id) && !!armamentOf(e.raid!.seed, x.id, x.uid)!.fit.length);
        }
        assert.doesNotThrow(() => check(e, state.save), `seed ${seed}`);
    }
});

test('the record refuses a gun off the row, parts on a follower, and parts that do not fit; a raid from before keeps its old guns', () => {
    const state = deployed(14), e = state.expansion!;
    const leader = armed(e).find(x => ARMED_LEADERS.has(x.id))!, follower = armed(e).find(x => !ARMED_LEADERS.has(x.id))!;
    assert.ok(leader && follower);
    const bad = (change: (copy: ExpansionState) => void) => { const copy = structuredClone(e); change(copy); assert.throws(() => check(copy, state.save)); };
    const find = (copy: ExpansionState, uid: string) => Object.values(copy.raid!.maps).flatMap(m => m.enemies).find(x => x.uid === uid)!;
    bad(copy => { find(copy, follower.uid).tactics!.equipment = 'mb700'; });
    bad(copy => { find(copy, follower.uid).tactics!.fit = [{ id: 'P01', slot: 'grip', children: [] }]; });
    bad(copy => { const t = find(copy, leader.uid).tactics!; t.fit = [{ id: 'O08', slot: 'top', children: [{ id: 'O08', slot: 'top', children: [] }] }]; });
    bad(copy => { find(copy, leader.uid).tactics!.fit = []; });
    // A raid installed before M4-02 holds the archetype's old gun (the carbine for every rifle) and no parts.
    const old = structuredClone(e);
    for (const x of armed(old)) { const t = x.tactics!, spec = archetype(x.id)!; t.equipment = ({ pistol: 'pistol', shotgun: 'shotgun', rifle: 'carbine' } as Record<string, string>)[spec.weapon] ?? 'carbine'; delete t.fit; delete t.ballistics; t.magazine = spec.magazine; t.reserve = spec.reserve; }
    assert.doesNotThrow(() => check(old, state.save));
});

test('a body yields the gun it held: a leader\'s with its parts under fresh uids, and the rounds of that gun\'s group', () => {
    for (const seed of [14, 24, 13]) {
        const state = deployed(seed), e = state.expansion!, raid = e.raid!;
        for (const x of armed(e)) {
            const map = Object.entries(raid.maps).find(([, m]) => m.enemies.includes(x))![0], t = x.tactics!, gun = t.equipment!;
            t.magazine = Math.min(2, t.magazine); t.reserve = Math.min(3, t.reserve);
            const rounds = t.magazine + t.reserve, fit = t.fit;
            damageLayerEnemy(e, map, x, 100000);
            const corpse = raid.maps[map].containers.find(c => c.id === `corpse-${x.uid}`)!, item = corpse.inventory.items.find(i => i.id === gun)!;
            assert.ok(item && item.gun, `${x.id} drops ${gun}`);
            assert.deepEqual(validateGun(item.id, item.uid, item.gun), { ok: true });
            assert.deepEqual(nodesOf(item.gun!.parts).map(n => n.id), fit ? nodesOf(fit as never).map((n: { id: string }) => n.id) : []);
            assert.ok(nodesOf(item.gun!.parts).every(n => n.uid.startsWith('entity-')), 'parts under fresh entity uids');
            if (rounds) assert.equal(D.count(corpse.inventory, D.WEAPONS[gun].ammo!), rounds);
        }
        assert.doesNotThrow(() => check(e, state.save), `seed ${seed}`);
    }
});
