import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { ATTACHMENTS, GUNS, type GunId } from '../src/gunsmith/catalog';
import { buildOf, type PartNode } from '../src/gunsmith/instance';
import { effectiveStats } from '../src/gunsmith/stats';
import { benchStats } from '../src/gunsmith/bench';
import { coneOf, driftOf } from '../src/shooting';
import { perkEffects, rpgMultipliers } from '../src/rpg';
import type { PerkId } from '../src/perks';
import { dominatedPairs, findings, KINDS, kindsOf, measured } from '../scripts/build-search';
import { arm, mouse, perkBench, replay } from './fixtures/shooting-bench';

// #28 M4-05 (PLAN section 11): the quick, quiet, steady and big-magazine builds each have their use, nothing is worth
// having for free, and the character's factors land once on a fitted gun. Rules in docs/gunsmith/CONTRACTS.md,
// 「配装对比与占优修正（M4-05）」; the comparison itself is scripts/build-compare.ts.

const GUN_IDS = Object.keys(GUNS) as GunId[];

test('no part is matched in everything by another part for the same position', () => {
    assert.deepEqual(dominatedPairs(), []);
});

test('the four kinds of build: each leads at its own aim, none is matched in every number, and nothing costs nothing', () => {
    const big = GUN_IDS.filter(gun => Object.values(ATTACHMENTS).some(a => (a.mods.magazine ?? 0) > GUNS[gun].stats.magazine && (!a.guns || a.guns.includes(gun))));
    assert.deepEqual(big.sort(), ['akb103', 'akb74', 'gb17', 'mb1014', 'mb14', 'mb1911', 'mb870', 'rpkb', 'umpb45']);
    for (const gun of GUN_IDS) {
        const kinds = kindsOf(gun), factory = measured({ gun, parts: [] });
        assert.deepEqual(Object.keys(kinds).sort(), [...big.includes(gun) ? ['big'] : [], 'quick', 'quiet', 'steady'].sort(), gun);
        // Each kind is what it says against the factory gun.
        assert.ok(measured(kinds.quick!).raise < factory.raise, `${gun} ${KINDS.quick.name}`);
        const aim = (kind: keyof typeof KINDS, b = kinds[kind]!) => { const s = benchStats(b); return KINDS[kind].aim(s.scores, s.stats.weapon.magazine); };
        assert.ok(aim('steady') > aim('steady', { gun, parts: [] }), `${gun} ${KINDS.steady.name}`);
        if (kinds.big) assert.ok(measured(kinds.big).magazine > factory.magazine, `${gun} ${KINDS.big.name}`);
        assert.deepEqual(findings(gun, kinds), [], gun);
    }
    // 安静 is quieter than the factory gun wherever a muzzle part is quieter: every gun but the three shotguns.
    const louder = GUN_IDS.filter(gun => !(measured(kindsOf(gun).quiet!).noise < measured({ gun, parts: [] }).noise));
    assert.deepEqual(louder.sort(), ['mb1014', 'mb870', 'shotgun']);
});

test('the check catches a part that costs nothing: the light stock as it was before M4-05', () => {
    const mods = ATTACHMENTS.S01.mods, kept = { ...mods };
    try {
        delete (mods as { kick?: number }).kick;
        assert.ok(findings('mb4a1').includes('mb4a1: S01 costs nothing'));
    } finally {
        Object.assign(mods, kept);
    }
    assert.deepEqual(findings('mb4a1'), []);
});

const node = (uid: string, id: string, slot: PartNode['slot'], children: PartNode[] = []): PartNode => ({ uid, id, slot, relief: false, children });

test('a fitted gun in a raid: the RPG body multiplier and the #92 perks multiply once on its effective numbers', () => {
    // M4A1 at its recoil guardrail with the quick magazine, fired by a character with both recoil and both reload perks.
    const perks: PerkId[] = ['technique-15-b', 'technique-20-b', 'technique-25-b', 'technique-30-b'];
    const parts = [node('h02', 'H02', 'handguard', [node('f07', 'F07', 'under')]), node('s02', 'S02', 'stock'), node('m06', 'M06', 'muzzle'), node('g10', 'G10', 'mag')];
    const b = arm(perkBench(perks, 30), 'mb4a1'), r = b.runtime, s = r.snapshot();
    s.loadout.gun = { parts: structuredClone(parts), devices: { laser: false, light: false } };
    s.loadout.ammo = D.equippedWeapon(s.loadout).magazine; s.loadout.ammoRelief = 0;
    r.restore(s);
    r.handling = { raise: 0, sway: 0, bloom: 0, drift: 0, settle: 0 };
    const stats = effectiveStats(buildOf({ id: 'mb4a1', parts })), fx = perkEffects(r.layered), body = rpgMultipliers(r.layered!).recoil;
    assert.deepEqual([fx.recoil, fx.reload], [.8 * .85, .85 * .8]);
    // The Runtime holds the build's own numbers: no perk or body factor is folded into them.
    assert.deepEqual([r.currentWeapon, r.grip], [stats.weapon, stats.handling]);
    for (const k of ['bloom', 'kick'] as const) assert.ok(Math.abs(r.grip[k] - GUNS.mb4a1.handling[k] * .6) < 1e-15, k);
    // Reload: the quick magazine's 0.8, then the perks' 0.68 once.
    assert.equal(r.reloadTime, GUNS.mb4a1.stats.reload * .8 * fx.reload);
    // The HUD's cone and drift take the body multiplier once.
    const hud = () => r.current().frame.hud.aim;
    assert.equal(hud().cone, coneOf(r.handling, stats.weapon, stats.handling, body));
    assert.equal(hud().drift, driftOf(r.handling, stats.handling, body));
    // One shot from a calm aim: the build's bloom and drift per shot times the perk scale once; the cone the HUD then
    // shows adds that bloom with the body multiplier once on top.
    const log = replay(b, mouse([0]), 0, 60);
    assert.equal(log.shots.length, 1);
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-12;
    assert.ok(near(r.handling.bloom, stats.handling.bloom / stats.handling.bloomMax * fx.recoil), `${r.handling.bloom}`);
    assert.ok(near(r.handling.drift, stats.handling.kick / stats.handling.kickMax * fx.recoil), `${r.handling.drift}`);
    const calm = { ...r.handling, bloom: 0, drift: 0 };
    assert.ok(near(log.aims.at(-1)!.cone - coneOf(calm, stats.weapon, stats.handling, body), GUNS.mb4a1.handling.bloom * .6 * fx.recoil * body));
});
