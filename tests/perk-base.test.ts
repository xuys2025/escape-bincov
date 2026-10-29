import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { decodePortableBackup } from '../src/save-backup';
import { RealHideoutRuntime, type HideoutEvent, type PerkBoard, type Result } from '../src/hideout-runtime';
import { derivedLimits, type Attribute } from '../src/expansion-state';
import { PERK_IDS, perkModifiers, type PerkId } from '../src/perks';
import { makeV4 } from './fixtures/old-saves';

// CP-T08 (#77): choosing perks at the base and the 500-cash reset, as one HideoutRuntime service for the yard and the
// old tab page (docs/CRITICAL-PERK-DESIGN.md section 5). Acceptance CP-07..09, CP-19..23 and CP-25 at service level.
const NOW = 1800000000000;
function origin() {
    let failing = false;
    const data = new Map<string, string>(), clock = { now: NOW };
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing) throw new Error('quota'); data.set(k, v); } };
    return { data, storage, clock, fail: (value = true) => { failing = value; }, advance: (ms: number) => { clock.now += ms; } };
}
type Origin = ReturnType<typeof origin>;
/** One page on the origin: its SaveSession and Runtime; `enter` walks into the station (the upgrade boundary). */
function page(o: Origin = origin(), enter = true) {
    const state = createSessionState(), saves = new SaveSession(state, () => o.storage, undefined, () => o.clock.now);
    const initialized = saves.initialize(), runtime = new RealHideoutRuntime(state, saves, () => o.clock.now), events: HideoutEvent[] = [];
    runtime.subscribe(e => events.push(e));
    if (enter && initialized) assert.ok(runtime.enter().ok);
    const setup = (action: (draft: ExpansionDraft) => void) => {
        const ticket = saves.prepareExpansionMutation(action); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
        runtime.snapshot(); events.length = 0;
    };
    return { o, state, saves, runtime, events, setup,
        get raw() { return o.data.get(SESSION_KEY)!; }, get record() { return decodeSession(o.data.get(SESSION_KEY)!); } };
}
type Page = ReturnType<typeof page>;
/** The same bytes opened in a fresh origin, so the original page keeps its write ownership. */
function reopen(p: Page) { const o = origin(); o.data.set(SESSION_KEY, p.raw); o.clock.now = p.o.clock.now; return page(o, false); }
function reason(result: Result) { assert.equal(result.ok, false); return !result.ok && result.reason; }
function token(result: Result & { token?: string }) { assert.ok(result.ok && result.token, JSON.stringify(result)); return result.token!; }
const choose = (p: Page, id: string) => p.runtime.choosePerk(id, token(p.runtime.previewPerk(id)));
const reset = (p: Page, attribute: Attribute) => p.runtime.resetPerks(attribute, token(p.runtime.previewPerkReset(attribute)));
const levels = (strength: number, constitution: number, technique: number) => ({ strength, constitution, technique });
/** Permanent levels, a selection and cash; hp and stamina at their limits. */
function grown(p: Page, permanent: Record<Attribute, number>, perks: PerkId[] = [], cash = 1200) {
    p.setup(d => {
        Object.assign(d.expansion.growth, { permanent, perks }); d.profile.cash = cash;
        const limits = derivedLimits(d.expansion); d.expansion.body.hp = limits.hp; d.expansion.body.stamina = limits.stamina;
    });
}
/** The record the previous client (session v4) writes for the same state: expansion and raid v2, no perks, no gun fields. */
function asV4(text: string): string {
    const r = JSON.parse(text); assert.equal(r.version, 9); assert.deepEqual(r.expansion.growth.perks, []);
    makeV4(r);
    return JSON.stringify(r);
}

test('CP-07: a new save shows 12 locked nodes; only the permanent integer level opens one; full levels open all 24 candidates', () => {
    const p = page(), board = p.runtime.perkBoard();
    assert.equal(board.blocked, null);
    for (const attribute of ['strength', 'constitution', 'technique'] as const) {
        const view = board.attributes[attribute];
        assert.equal(view.permanent, 10);
        assert.deepEqual(view.nodes, [15, 20, 25, 30].map(tier => ({ attribute, tier, options: [`${attribute}-${tier}-a`, `${attribute}-${tier}-b`], status: 'locked', requires: tier })));
        assert.deepEqual({ ...view.reset, blocked: view.reset.blocked?.reason }, { cost: 500, cash: 700, chosen: [], blocked: 'no-effect' });
    }
    // A training fraction near 1 and a +5 dose never open a node: only the permanent level 15 does.
    p.setup(d => { d.expansion.growth.permanent.constitution = 14; d.expansion.growth.progress.constitution = .99; d.expansion.body.effects.constitution = 180; });
    assert.equal(p.runtime.snapshot().body.attributes.constitution.effective, 19);
    assert.equal(p.runtime.perkBoard().attributes.constitution.nodes[0].status, 'locked');
    assert.equal(reason(p.runtime.previewPerk('constitution-15-a')), 'locked');
    p.setup(d => { d.expansion.growth.permanent.constitution = 15; d.expansion.growth.progress.constitution = 0; });
    assert.equal(p.runtime.perkBoard().attributes.constitution.nodes[0].status, 'open');
    // Full levels: 12 open nodes with the 24 candidates, each one previewable; nothing is chosen for the player.
    grown(p, levels(30, 30, 30), [], 700);
    const raw = p.raw, revision = p.saves.revision, nodes = Object.values(p.runtime.perkBoard().attributes).flatMap(a => a.nodes);
    assert.equal(nodes.length, 12); assert.ok(nodes.every(n => n.status === 'open'));
    assert.deepEqual(nodes.flatMap(n => n.options), PERK_IDS);
    for (const id of PERK_IDS) assert.ok(p.runtime.previewPerk(id).ok, id);
    // Reading the board and previewing write and announce nothing.
    assert.equal(p.raw, raw); assert.equal(p.saves.revision, revision); assert.deepEqual(p.events, []);
    assert.deepEqual(p.record.expansion!.growth.perks, []);
});

test('CP-08/CP-09: crossing tiers opens them all without picking; any tier first, a and b mixed, one per node, kept on reload, read-only in a raid', () => {
    const p = page(); grown(p, levels(26, 10, 10));
    assert.deepEqual(p.runtime.perkBoard().attributes.strength.nodes.map(n => n.status), ['open', 'open', 'open', 'locked']);
    assert.deepEqual(p.record.expansion!.growth.perks, [], 'nothing is chosen for the player');
    for (const id of ['strength-25-b', 'strength-15-a', 'strength-20-b']) assert.ok(choose(p, id).ok, id);
    assert.deepEqual(p.record.expansion!.growth.perks, ['strength-15-a', 'strength-20-b', 'strength-25-b'], 'stored in catalog order');
    assert.equal(reason(p.runtime.previewPerk('strength-15-b')), 'rule', 'a chosen node changes only through a reset');
    assert.equal(reason(p.runtime.previewPerk('strength-30-a')), 'locked');
    for (const bad of ['toString', '__proto__', 'constructor', 'strength-15-c', 'luck-15-a', '']) assert.equal(reason(p.runtime.previewPerk(bad)), 'rule', bad);
    assert.equal(reason(p.runtime.previewPerkReset('luck' as Attribute)), 'rule');
    const chosen = p.runtime.perkBoard().attributes.strength.nodes;
    assert.deepEqual(chosen.map(n => n.status === 'chosen' ? n.id : n.status), ['strength-15-a', 'strength-20-b', 'strength-25-b', 'locked']);
    assert.deepEqual(reopen(p).runtime.perkBoard().attributes.strength.nodes, chosen);
    // Open nodes never hold a departure back. In the raid the board stays readable and refuses every change.
    const early = token(p.runtime.previewPerkReset('strength'));
    const start = p.runtime.deploy({ world: 'buildings', seed: 'cp-09' }); assert.ok(start.ok);
    const raid = p.raw, board = p.runtime.perkBoard();
    assert.equal(board.blocked?.reason, 'locked'); assert.equal(board.attributes.strength.reset.blocked?.reason, 'locked');
    assert.deepEqual(board.attributes.strength.nodes, chosen);
    assert.equal(reason(p.runtime.resetPerks('strength', early)), 'locked'); assert.equal(reason(p.runtime.previewPerkReset('strength')), 'locked');
    assert.ok(p.runtime.startRaid(start.runId!).ok);
    assert.equal(p.runtime.perkBoard().blocked?.reason, 'locked'); assert.equal(reason(p.runtime.previewPerk('strength-30-a')), 'locked');
    assert.equal(p.raw, raid);
});

test('CP-19: the first choice is free and counts once written; preview and cancel change nothing; a replaced or repeated token is stale', () => {
    const p = page(); grown(p, levels(10, 15, 10), [], 700);
    const raw = p.raw, revision = p.saves.revision, state = structuredClone(p.state), first = p.runtime.previewPerk('constitution-15-a');
    token(first);
    assert.deepEqual(first.preview, { kind: 'choice', id: 'constitution-15-a', attribute: 'constitution', tier: 15, scope: ['hp'],
        modifiers: { before: perkModifiers([]), after: perkModifiers(['constitution-15-a']) },
        limits: { hp: { before: 115, after: 135 }, stamina: { before: 100, after: 100 }, carry: { before: 24, after: 24 } },
        body: { hp: { before: 115, after: 115 }, stamina: { before: 100, after: 100 } } });
    // A preview and its cancel (no confirm) write, change and announce nothing.
    assert.equal(p.raw, raw); assert.equal(p.saves.revision, revision); assert.deepEqual(p.state, state); assert.deepEqual(p.events, []);
    const second = token(p.runtime.previewPerk('constitution-15-a'));
    assert.equal(reason(p.runtime.choosePerk('constitution-15-a', first.token!)), 'stale', 'a newer preview replaced it');
    assert.equal(reason(p.runtime.choosePerk('constitution-15-b', second)), 'stale', 'a token confirms only its own request');
    assert.equal(p.raw, raw);
    assert.ok(p.runtime.choosePerk('constitution-15-a', second).ok);
    assert.deepEqual(p.events, [{ type: 'committed', rev: revision + 1, action: 'perk-choice' }]);
    const record = p.record;
    assert.deepEqual(record.expansion!.growth.perks, ['constitution-15-a']); assert.equal(record.profile.cash, 700, 'free');
    assert.equal(record.expansion!.body.hp, 115, 'a higher limit refills nothing'); assert.equal(p.runtime.snapshot().body.hpMax, 135);
    // A repeated click is stale and writes nothing; the node is chosen now.
    const chosen = p.raw;
    assert.equal(reason(p.runtime.choosePerk('constitution-15-a', second)), 'stale');
    assert.equal(reason(p.runtime.previewPerk('constitution-15-a')), 'rule');
    assert.equal(p.raw, chosen); assert.deepEqual(p.state.expansion!.growth.perks, ['constitution-15-a']);
});

test('CP-19: a failed choice write shows nothing, keeps that exact candidate for the retry, and the retry selects it once', () => {
    const p = page(); grown(p, levels(10, 10, 20));
    const raw = p.raw, save = structuredClone(p.state.save), expansion = structuredClone(p.state.expansion), confirm = token(p.runtime.previewPerk('technique-20-a'));
    p.o.fail(); assert.equal(reason(p.runtime.choosePerk('technique-20-a', confirm)), 'storage');
    assert.equal(p.raw, raw); assert.deepEqual(p.state.save, save); assert.deepEqual(p.state.expansion, expansion);
    assert.deepEqual(p.events.map(e => e.type), ['save-failed']); assert.equal(p.runtime.snapshot().storage.pendingBase, true);
    // While it waits, the board says why, a repeated click and new previews refuse, and the backup holds the candidate.
    assert.equal(p.runtime.perkBoard().blocked?.reason, 'storage');
    assert.equal(reason(p.runtime.choosePerk('technique-20-a', confirm)), 'storage'); assert.equal(reason(p.runtime.previewPerk('technique-15-b')), 'storage');
    const backup = decodePortableBackup(p.runtime.exportBackup()); assert.ok(backup.kind === 'session');
    assert.deepEqual(backup.record.expansion!.growth.perks, ['technique-20-a']);
    p.o.fail(false); assert.ok(p.runtime.retrySave().ok);
    assert.deepEqual(p.record.expansion!.growth.perks, ['technique-20-a']); assert.equal(p.runtime.snapshot().storage.pendingBase, false);
    assert.ok(p.runtime.retrySave().ok); assert.deepEqual(p.record.expansion!.growth.perks, ['technique-20-a']);
    assert.equal(reason(p.runtime.choosePerk('technique-20-a', confirm)), 'stale');
    assert.equal(p.runtime.perkBoard().attributes.technique.nodes[1].status, 'chosen');
});

test('CP-20: the reset needs a chosen perk and 500 cash; refusals, cancels and outdated confirmations never charge', () => {
    const p = page(); grown(p, levels(20, 10, 10), ['strength-20-b'], 499);
    const board = p.runtime.perkBoard();
    assert.deepEqual({ ...board.attributes.strength.reset, blocked: board.attributes.strength.reset.blocked?.reason }, { cost: 500, cash: 499, chosen: ['strength-20-b'], blocked: 'funds' });
    assert.deepEqual(board.attributes.constitution.reset.chosen, []); assert.equal(board.attributes.constitution.reset.blocked?.reason, 'no-effect');
    const raw = p.raw;
    assert.equal(reason(p.runtime.previewPerkReset('strength')), 'funds'); assert.equal(reason(p.runtime.previewPerkReset('constitution')), 'no-effect');
    assert.equal(p.raw, raw);
    p.setup(d => { d.profile.cash = 500; });
    assert.equal(p.runtime.perkBoard().attributes.strength.reset.blocked, null);
    const rich = p.raw, preview = p.runtime.previewPerkReset('strength'), first = token(preview);
    assert.equal(p.raw, rich); assert.deepEqual(p.events, []);
    assert.deepEqual(preview.preview, { kind: 'reset', attribute: 'strength', cost: 500, cash: { before: 500, after: 0 }, removed: ['strength-20-b'], scope: ['stamina'],
        modifiers: { before: perkModifiers(['strength-20-b']), after: perkModifiers([]) },
        limits: { hp: { before: 100, after: 100 }, stamina: { before: 140, after: 120 }, carry: { before: 30, after: 30 } },
        body: { hp: { before: 100, after: 100 }, stamina: { before: 140, after: 120 } } });
    // Not confirming changes nothing. Once the profile moves on (cash 499 here), the old confirmation is stale and pays nothing.
    p.setup(d => { d.profile.cash = 499; });
    const poorer = p.raw;
    assert.equal(reason(p.runtime.resetPerks('strength', first)), 'stale');
    assert.equal(p.raw, poorer); assert.equal(p.state.save.cash, 499); assert.deepEqual(p.state.expansion!.growth.perks, ['strength-20-b']);
    p.setup(d => { d.profile.cash = 500; });
    assert.equal(reason(p.runtime.resetPerks('strength', first)), 'stale', 'a confirmation is used up by its first attempt, even if the profile returns');
    assert.equal(p.state.save.cash, 500);
    p.setup(d => { d.profile.cash = 600; });
    const confirm = token(p.runtime.previewPerkReset('strength'));
    assert.ok(p.runtime.resetPerks('strength', confirm).ok);
    assert.equal(p.record.profile.cash, 100); assert.deepEqual(p.record.expansion!.growth.perks, []);
    // A repeated click and the now empty selection cannot charge again.
    const paid = p.raw;
    assert.equal(reason(p.runtime.resetPerks('strength', confirm)), 'stale'); assert.equal(reason(p.runtime.previewPerkReset('strength')), 'no-effect');
    assert.equal(p.runtime.perkBoard().attributes.strength.reset.blocked?.reason, 'no-effect');
    assert.equal(p.raw, paid); assert.equal(p.state.save.cash, 100);
});

test('CP-21: a reset clears one attribute and cuts hp and stamina to the lower limits, as neither damage nor training; choosing again refills nothing', () => {
    const p = page();
    p.setup(d => {
        Object.assign(d.expansion.growth, { permanent: levels(20, 15, 25), progress: { strength: .3, constitution: .45, technique: .1 },
            perks: ['strength-20-b', 'constitution-15-a', 'technique-15-b', 'technique-25-b'] });
        Object.assign(d.expansion.body, { hp: 135, stamina: 140, mental: 55, pollution: 12 });
        d.expansion.body.effects.pain = 30; d.expansion.body.treatment.pain = 10; d.expansion.base.training.credited.constitution = .2; d.profile.cash = 1200;
    });
    const before = p.record;
    assert.ok(reset(p, 'constitution').ok);
    // Exactly the fee, the attribute's perks and the cut: levels, progress, training, pain, mental and the rest stay.
    const expected = structuredClone(before); expected.revision++; expected.profile.cash = 700;
    expected.expansion!.growth.perks = ['strength-20-b', 'technique-15-b', 'technique-25-b']; expected.expansion!.body.hp = 115;
    assert.deepEqual(p.record, expected);
    assert.ok(reset(p, 'strength').ok);
    assert.deepEqual(p.record.expansion!.growth.perks, ['technique-15-b', 'technique-25-b']);
    assert.equal(p.record.expansion!.body.stamina, 120); assert.equal(p.record.profile.cash, 200);
    // Choosing the same perks again raises the limits and refills nothing: a reset is no free healing.
    assert.ok(choose(p, 'constitution-15-a').ok); assert.ok(choose(p, 'strength-20-b').ok);
    const { body } = p.runtime.snapshot();
    assert.deepEqual([body.hp, body.hpMax, body.stamina, body.staminaMax], [115, 135, 120, 140]);
    assert.equal(p.record.profile.cash, 200, 'choosing again is free');
});

test('CP-21/CP-25: base recovery and production settle under the old perks first, in the same single write as the change', () => {
    const p = page();
    p.setup(d => {
        d.expansion.growth.permanent = levels(10, 15, 10); d.expansion.base.facilities.workbench = 1; D.addItem(d.profile.stash, 'cloth', 2);
        d.expansion.body.hp = derivedLimits(d.expansion).hp;
    });
    assert.ok(p.runtime.enqueue('bandage').ok);
    const queued = p.record.expansion!.base.queue[0].remaining, revision = p.saves.revision;
    p.o.advance(60000);
    const preview = p.runtime.previewPerk('constitution-15-a');
    assert.deepEqual(preview.preview?.body.hp, { before: 115, after: 115 }, 'the minute before the choice recovered up to the old limit only');
    assert.ok(p.runtime.choosePerk('constitution-15-a', token(preview)).ok);
    let record = p.record;
    assert.equal(record.revision, revision + 1, 'one write');
    assert.equal(record.expansion!.body.hp, 115, 'no recovery under the new perk before it was chosen, and no refill');
    assert.equal(record.expansion!.base.cursor, p.o.clock.now);
    assert.equal(record.expansion!.base.queue[0].remaining, queued - 60, 'production advanced in the same candidate');
    // Afterwards natural recovery continues toward the new limit at the usual rate.
    p.o.advance(60000); p.runtime.tick(p.o.clock.now);
    assert.ok(Math.abs(p.record.expansion!.body.hp - 116) < 1e-9);
    // The reset settles its minute under the chosen perk, then cuts, still in one write with production.
    p.o.advance(60000);
    const cut = p.runtime.previewPerkReset('constitution');
    assert.ok(Math.abs(cut.preview!.body.hp.before - 117) < 1e-9); assert.equal(cut.preview!.body.hp.after, 115);
    const written = p.saves.revision;
    assert.ok(p.runtime.resetPerks('constitution', token(cut)).ok);
    record = p.record;
    assert.equal(record.revision, written + 1); assert.equal(record.expansion!.body.hp, 115); assert.deepEqual(record.expansion!.growth.perks, []);
    assert.equal(record.expansion!.base.queue[0].remaining, queued - 180); assert.equal(record.expansion!.base.cursor, p.o.clock.now);
});

test('CP-21: a failed reset write charges nothing yet, keeps one candidate for the retry, and the retry pays exactly once', () => {
    const p = page(); grown(p, levels(20, 10, 10), ['strength-20-b'], 1200);
    const raw = p.raw, save = structuredClone(p.state.save), expansion = structuredClone(p.state.expansion), confirm = token(p.runtime.previewPerkReset('strength'));
    p.o.fail(); assert.equal(reason(p.runtime.resetPerks('strength', confirm)), 'storage');
    assert.equal(p.raw, raw); assert.deepEqual(p.state.save, save); assert.deepEqual(p.state.expansion, expansion);
    assert.equal(p.runtime.snapshot().profile.cash, 1200);
    // Repeated clicks and new previews wait for the retry instead of preparing a second charge; the backup holds one.
    assert.equal(reason(p.runtime.resetPerks('strength', confirm)), 'storage'); assert.equal(reason(p.runtime.previewPerkReset('strength')), 'storage');
    const backup = decodePortableBackup(p.runtime.exportBackup()); assert.ok(backup.kind === 'session');
    assert.equal(backup.record.profile.cash, 700); assert.deepEqual(backup.record.expansion!.growth.perks, []); assert.equal(backup.record.expansion!.body.stamina, 120);
    // An old-tab writer cannot overwrite the waiting candidate either.
    p.o.fail(false); assert.equal(p.saves.setVolume(.2), false); assert.equal(p.raw, raw);
    assert.ok(p.runtime.retrySave().ok);
    assert.equal(p.record.profile.cash, 700); assert.deepEqual(p.record.expansion!.growth.perks, []); assert.equal(p.record.expansion!.body.stamina, 120);
    assert.ok(p.runtime.retrySave().ok); assert.equal(p.record.profile.cash, 700);
    assert.equal(reason(p.runtime.resetPerks('strength', confirm)), 'stale'); assert.equal(reason(p.runtime.previewPerkReset('strength')), 'no-effect');
    assert.equal(p.state.save.cash, 700);
});

test('five-second checkpoints during an open dialog keep its confirmation; a dose running out makes it stale', () => {
    const p = page(); grown(p, levels(20, 15, 10), ['strength-20-b'], 1200);
    p.setup(d => { d.expansion.body.hp = 100; });
    const preview = p.runtime.previewPerkReset('strength'), revision = p.saves.revision;
    p.o.advance(6000); p.runtime.tick(p.o.clock.now); assert.equal(p.saves.revision, revision + 1, 'a checkpoint was written');
    assert.ok(p.runtime.resetPerks('strength', token(preview)).ok);
    // hp kept recovering in between; the reset kept what was there then.
    assert.equal(preview.preview!.body.hp.before, 100); assert.ok(p.record.expansion!.body.hp > 100);
    // A constitution dose running out between preview and confirm lowers the limits shown: stale, and nothing written.
    p.setup(d => { d.expansion.body.effects.constitution = 3; });
    const dosed = p.runtime.previewPerk('constitution-15-a');
    assert.deepEqual(dosed.preview!.limits.hp, { before: 130, after: 150 });
    p.o.advance(4000);
    const raw = p.raw;
    assert.equal(reason(p.runtime.choosePerk('constitution-15-a', token(dosed))), 'stale'); assert.equal(p.raw, raw);
    const fresh = p.runtime.previewPerk('constitution-15-a');
    assert.deepEqual(fresh.preview!.limits.hp, { before: 115, after: 135 });
    assert.ok(p.runtime.choosePerk('constitution-15-a', token(fresh)).ok);
});

test('CP-20/CP-25: raids and a pending settlement refuse every perk change; the settlement candidate and its export stay exact', () => {
    const p = page(); grown(p, levels(20, 10, 10), ['strength-20-b'], 1200);
    const early = token(p.runtime.previewPerkReset('strength'));
    const start = p.runtime.deploy({ world: 'buildings', seed: 'cp-25' }); assert.ok(start.ok); assert.ok(p.runtime.startRaid(start.runId!).ok);
    // A settlement waiting for its write: locked before the attempt, storage after it failed. Nothing writes or changes.
    assert.ok(p.saves.prepareSettlement('extract', 0));
    const exported = p.runtime.exportBackup(), pending = p.raw;
    assert.equal(p.runtime.perkBoard().blocked?.reason, 'locked');
    assert.equal(reason(p.runtime.resetPerks('strength', early)), 'locked'); assert.equal(reason(p.runtime.previewPerkReset('strength')), 'locked');
    p.o.fail(); assert.equal(p.saves.retrySettlement(), false);
    assert.equal(p.runtime.perkBoard().blocked?.reason, 'storage');
    assert.equal(reason(p.runtime.resetPerks('strength', early)), 'storage'); assert.equal(reason(p.runtime.previewPerk('strength-15-a')), 'storage');
    assert.equal(p.runtime.exportBackup(), exported); assert.equal(p.raw, pending);
    const backup = decodePortableBackup(exported); assert.ok(backup.kind === 'session');
    assert.equal(backup.record.terminal?.runId, start.runId); assert.deepEqual(backup.record.expansion!.growth.perks, ['strength-20-b']);
    assert.equal(backup.record.expansion!.raid, null); assert.equal(backup.record.profile.cash, p.state.pendingSettlement!.cash);
    p.o.fail(false); assert.ok(p.saves.retrySettlement()); p.state.state = 'result'; assert.ok(p.runtime.returnToBase().ok);
    // Back at the station, the confirmation from before the raid is outdated; a new one pays once.
    const cash = p.state.save.cash;
    assert.equal(reason(p.runtime.resetPerks('strength', early)), 'stale');
    assert.ok(reset(p, 'strength').ok); assert.equal(p.record.profile.cash, cash - 500); assert.deepEqual(p.record.expansion!.growth.perks, []);
});

test('CP-23: a window holding outdated bytes cannot charge or select over the newer write', () => {
    const o = origin(), a = page(o); grown(a, levels(20, 15, 10), ['strength-20-b', 'constitution-15-a'], 1200);
    const b = page(o); // loaded last: a now holds outdated bytes
    assert.ok(reset(b, 'strength').ok); const written = b.raw;
    assert.equal(b.record.profile.cash, 700);
    const outdated = a.runtime.previewPerkReset('strength'); // a still previews its own copy
    assert.equal(reason(a.runtime.resetPerks('strength', token(outdated))), 'conflict');
    assert.equal(o.data.get(SESSION_KEY), written); assert.equal(a.state.conflict, true); assert.equal(a.state.save.cash, 1200);
    assert.equal(a.runtime.perkBoard().blocked?.reason, 'conflict');
    assert.equal(reason(a.runtime.retrySave()), 'conflict'); assert.equal(reason(a.runtime.previewPerk('constitution-15-b')), 'conflict');
    assert.equal(o.data.get(SESSION_KEY), written);
    const c = reopen(b); assert.equal(c.state.save.cash, 700); assert.deepEqual(c.state.expansion!.growth.perks, ['constitution-15-a']);
});

test('CP-22: a station state not yet upgraded (v2) and a live v2 raid refuse every perk change until the station boundary', () => {
    const seed = page(); grown(seed, levels(20, 10, 10), [], 1200);
    const o = origin(); o.data.set(SESSION_KEY, asV4(seed.raw));
    const p = page(o, false), raw = p.raw;
    assert.equal(p.state.expansion!.version, 2);
    p.state.state = 'hideout'; // as a page whose station upgrade has not been written
    assert.equal(p.runtime.snapshot().storage.upgradeRequired, true);
    const board = p.runtime.perkBoard();
    assert.equal(board.blocked?.reason, 'locked'); assert.equal(board.attributes.strength.reset.blocked?.reason, 'locked');
    assert.equal(reason(p.runtime.previewPerk('strength-15-a')), 'locked'); assert.equal(reason(p.runtime.previewPerkReset('strength')), 'locked');
    assert.equal(p.raw, raw); assert.equal(p.record.expansion!.version, 2);
    // The station entry upgrades to v3 with nothing chosen; then the choice works.
    p.state.state = 'menu'; assert.ok(p.runtime.enter().ok); assert.equal(p.record.expansion!.version, 3);
    assert.equal(p.runtime.perkBoard().blocked, null); assert.ok(choose(p, 'strength-15-a').ok);
    // A live v2 raid in a v4 record stays locked until it settles, and nothing is written.
    const raider = page(); assert.ok(raider.runtime.deploy({ world: 'mall', seed: 'cp-22' }).ok);
    const live = origin(); live.data.set(SESSION_KEY, asV4(raider.raw));
    const q = page(live, false), bytes = q.raw;
    assert.equal(q.state.expansion!.raid!.version, 2);
    assert.equal(q.runtime.perkBoard().blocked?.reason, 'locked'); assert.equal(reason(q.runtime.previewPerk('strength-15-a')), 'locked');
    assert.equal(q.raw, bytes);
});

test('a listener may read the board while the Runtime publishes, but cannot start a perk change', () => {
    const p = page(); grown(p, levels(15, 10, 10), [], 700);
    const seen: PerkBoard[] = [], refused: Result[] = [];
    p.runtime.subscribe(e => { if (e.type === 'committed') { seen.push(p.runtime.perkBoard()); refused.push(p.runtime.previewPerk('strength-15-b')); } });
    assert.ok(choose(p, 'strength-15-a').ok);
    assert.equal(seen.length, 1); assert.equal(seen[0].blocked, null); assert.equal(seen[0].attributes.strength.nodes[0].status, 'chosen');
    assert.equal(reason(refused[0]), 'locked');
});
