import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { decodeSession, SESSION_KEY } from '../src/recovery-store';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';
import { newStory, repairDeficit, STORY_CABINET, STORY_WORLD, validateStory } from '../src/story';
import { MARKET_WORLD, MARKET_ANCHORS, marketRunConfig } from '../src/market-world';
import { generateRunBase, WORLD } from '../src/world';
import { BUILDING_WORLD } from '../src/building-world';
import { spacePath, traversable } from '../src/spatial';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import type { TargetRef } from '../src/raid-runtime/contract';
import { isPristine } from '../src/fresh-start';

const at = (x: number, y: number) => ({ x: (x + .5) * 32, y: (y + .5) * 32 });
function fixture(raw?: string) {
    const data = new Map<string, string>(raw ? [[SESSION_KEY, raw]] : []);
    let failed = false, writes = 0;
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (failed) throw Error('quota'); data.set(k, v); writes++; } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize());
    const base = new RealHideoutRuntime(state, saves, () => 1800000000000);
    if (!state.save.activeRun) assert.ok(base.enter().ok);
    const setup = (fn: (d: ExpansionDraft) => void) => { const ticket = saves.prepareExpansionMutation(fn); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed'); };
    return { state, saves, base, data, storage, setup, get raw() { return data.get(SESSION_KEY)!; }, get writes() { return writes; }, fail(v = true) { failed = v; } };
}
function raid(f = fixture(), seed = 42) {
    assert.ok(f.saves.beginRun(seed, true, { marketStory: true }), f.state.storageError); f.state.state = 'run';
    const runtime = new CoastRaidRuntime(f.state, f.saves), driver = createRuntimeTestDriver(runtime, '?test=1'); driver.freezeAI(true);
    return { ...f, runtime, driver, f };
}
const cabinetRef = (r: CoastRaidRuntime): TargetRef => ({ kind: 'container', id: STORY_CABINET, mapId: 'coast', runId: r.session.loadout!.runId! });
function observeBreaker(r: ReturnType<typeof raid>) {
    r.driver.placePlayer(MARKET_ANCHORS['ch01-sc-breaker']);
    assert.ok(r.runtime.observeStory(r.runtime.storySources().find(s => s.ref.id === 'ch01-sc-breaker')!.ref));
}
function hearCall(r: ReturnType<typeof raid>) {
    r.driver.placePlayer(MARKET_ANCHORS[STORY_CABINET]);
    assert.ok(r.runtime.activate(cabinetRef(r.runtime)));
    r.runtime.resume();
}

test('market supplies replace original non-tide records before grouping; 60 source records and original unique quests', () => {
    const scenarios: [number[], boolean, number[]][] = [[[0, 0, 0], false, [3, 2, 1]], [[2, 1, 0], false, [1, 1, 1]], [[3, 0, 1], false, [0, 2, 0]], [[3, 2, 1], false, [0, 0, 0]], [[0, 0, 0], true, [0, 0, 0]]];
    for (const [owned, complete, expected] of scenarios) for (let seed = 1; seed <= 60; seed++) {
        const p = D.newSave(); p.quests.repair = complete;
        ['scrap', 'wire', 'fuse'].forEach((id, i) => D.addItem([p.stash, p.bag, p.safe][i], id, owned[i]));
        const before = structuredClone(p), config = marketRunConfig(seed, p), cabinet = config.containers.find(c => c.id === STORY_CABINET)!;
        assert.deepEqual(p, before); assert.deepEqual(Object.values(repairDeficit(p)), expected);
        assert.deepEqual(cabinet.items.map(i => [i.id, i.qty]), ['scrap', 'wire', 'fuse'].flatMap((id, i) => expected[i] ? [[id, expected[i]]] : []));
        assert.equal(config.loot.length + config.containers.reduce((sum, c) => sum + c.items.length, 0), 60);
        assert.ok(config.loot.length >= 40 && config.containers.length <= 10);
        assert.ok(config.containers.reduce((sum, c) => sum + c.items.length, 0) <= 20);
        assert.deepEqual(config.loot.filter(i => ['sample', 'ledger'].includes(i.id)), generateRunBase(seed).loot.filter(i => ['sample', 'ledger'].includes(i.id)));
        assert.deepEqual(config.exits, generateRunBase(seed).exits);
    }
});

test('market world keeps geometry and both authored access routes at either tide; all three exits remain', () => {
    assert.deepEqual(MARKET_WORLD.maps.coast.cells, BUILDING_WORLD.maps.coast.cells);
    const front = [[5,33],[20,33],[25,33],[25,36],[26,37],[28,37]], service = [[5,33],[5,43],[25,43],[25,41],[25,40],[26,40],[28,40],[28,37]];
    for (const highTide of [false, true]) {
        const context = { definition: MARKET_WORLD.maps.coast, doors: Object.fromEntries(MARKET_WORLD.maps.coast.doors.map(d => [d.id, false])), highTide };
        for (const route of [front, service]) for (let i = 0; i < route.length - 1; i++) {
            const a = at(...route[i] as [number, number]), b = at(...route[i + 1] as [number, number]);
            assert.ok(traversable(context, a, 'body', 10)); assert.ok(spacePath(context, a, b).length, `${JSON.stringify(route[i])} -> ${JSON.stringify(route[i+1])}`);
        }
        for (const exit of WORLD.exits) assert.ok(spacePath(context, at(28, 37), exit).length);
    }
    assert.equal(WORLD.exits.length, 3); assert.deepEqual(MARKET_WORLD.maps['resident-f2'].cells, BUILDING_WORLD.maps['resident-f2'].cells);
});

test('all street encounter variants deploy with protected fixed cabinet and persisted deficit from pre-transfer inventory', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const f = fixture(); f.setup(d => { D.addItem(d.profile.bag, 'scrap', 2); D.addItem(d.profile.safe, 'wire', 1); });
        assert.ok(f.saves.beginRun(seed, true, { marketStory: true }), f.state.storageError);
        const record = decodeSession(f.raw), raid = record.expansion!.raid!, layer = raid.maps.coast, cabinet = layer.containers.find(c => c.id === STORY_CABINET)!;
        assert.equal(raid.worldVersion, STORY_WORLD); assert.deepEqual(record.story.currentRun?.cues, []);
        assert.deepEqual([cabinet.x, cabinet.y], [MARKET_ANCHORS[STORY_CABINET].x, MARKET_ANCHORS[STORY_CABINET].y]);
        assert.deepEqual(['scrap','wire','fuse'].map(id => D.count(cabinet.inventory, id)), [1,1,1]);
        for (const entity of [...layer.loot, ...layer.enemies, ...layer.containers.filter(c => c !== cabinet)]) assert.ok(Math.hypot(entity.x-cabinet.x, entity.y-cabinet.y) >= 43);
    }
});

test('actual v9 browser bytes migrate once; repair completion alone never invents knowledge; legacy active worlds stay intact', () => {
    const raw = readFileSync(new URL('./fixtures/market-v9.json', import.meta.url), 'utf8');
    const old = JSON.parse(raw), migrated = decodeSession(raw);
    assert.equal(old.version, 9); assert.equal(migrated.storyBackup, raw); assert.deepEqual(migrated.story, newStory(old.profile));
    const done = structuredClone(old); done.profile.quests.repair = true;
    const story = decodeSession(JSON.stringify(done)).story;
    assert.deepEqual(story.completedNodes, ['ch01-n01', 'ch01-n02']); assert.deepEqual(story.clues, []); assert.equal(story.choices.call, 'unselected');
    const f = fixture(raw); assert.equal(decodeSession(f.raw).storyBackup, raw); assert.ok(f.saves.persist()); assert.equal(decodeSession(f.raw).storyBackup, raw);
    assert.ok(f.saves.beginRun(42, true));
    const legacy: any = JSON.parse(f.raw); delete legacy.story; delete legacy.storyBackup; legacy.version = 9;
    const upgraded = decodeSession(JSON.stringify(legacy)); assert.deepEqual(upgraded.expansion, legacy.expansion); assert.equal(upgraded.story.currentRun, null);
    const future = { ...old, version: 11 }; assert.throws(() => decodeSession(JSON.stringify(future)));
});

test('observations require actual source/run/map/range; projections write nothing; save failure publishes no cue', () => {
    const r = raid(), f = r.f, source = r.runtime.storySources().find(s => s.ref.id === 'ch01-sc-breaker')!;
    const raw = f.raw, writes = f.writes;
    for (let n = 0; n < 30; n++) { r.runtime.story(); r.runtime.storySources(); }
    assert.equal(f.raw, raw); assert.equal(f.writes, writes); assert.equal(r.runtime.observeStory(source.ref), false);
    r.driver.placePlayer(source.at);
    assert.equal(r.runtime.observeStory({ ...source.ref, world: { ...source.ref.world, runId: 'foreign' } }), false);
    assert.equal(r.runtime.observeStory({ ...source.ref, world: { ...source.ref.world, mapId: 'resident-f2' } }), false);
    f.fail(); assert.equal(r.runtime.observeStory(source.ref), false); assert.equal(f.raw, raw); assert.deepEqual(f.state.story.clues, []);
    assert.ok(!r.runtime.current().events.some(e => e.type === 'story-cue'));
    f.fail(false); assert.ok(r.runtime.retrySave()); assert.deepEqual(f.state.story.clues, ['breaker-down']);
    assert.equal(r.runtime.observeStory(source.ref), false); assert.equal(f.state.story.memory.xiaocai.breakerReported, false);
    r.runtime.cancelStart();
});

test('first cabinet opening commits call and run cue together; retry opens it, restore/reopen never rerolls or replays', () => {
    const r = raid(), f = r.f; r.driver.placePlayer(MARKET_ANCHORS[STORY_CABINET]);
    const before = f.raw, cabinet = structuredClone(r.runtime.getLootContainer(STORY_CABINET)!);
    f.fail(); assert.equal(r.runtime.activate(cabinetRef(r.runtime)), false); assert.equal(r.runtime.lootContext, null); assert.equal(f.raw, before);
    f.fail(false); assert.ok(r.runtime.retrySave()); assert.deepEqual(r.runtime.lootContext, { containerId: STORY_CABINET, runId: f.state.loadout!.runId });
    assert.deepEqual(f.state.story.clues, ['heard-call']); assert.deepEqual(f.state.story.currentRun!.cues, ['ch01-sc-call']);
    r.runtime.resume(); const writes = f.writes; assert.ok(r.runtime.activate(cabinetRef(r.runtime))); assert.equal(f.writes, writes);
    assert.deepEqual(r.runtime.getLootContainer(STORY_CABINET), cabinet);
    r.runtime.cancelStart(); const restored = fixture(f.raw); assert.ok(restored.saves.resumeRun()); restored.state.state = 'run';
    const live = new CoastRaidRuntime(restored.state, restored.saves);
    assert.deepEqual(live.getLootContainer(STORY_CABINET), cabinet); assert.ok(!live.current().events.some(e => e.type === 'story-cue'));
    assert.ok(live.activate(cabinetRef(live))); assert.deepEqual(restored.state.story.currentRun!.cues, ['ch01-sc-call']); live.cancelStart();
});

test('freezer proximity is once per run, restores silently and retains knowledge after failed settlement retry', () => {
    const r = raid(), f = r.f; r.driver.placePlayer(MARKET_ANCHORS['ch01-sc-freezer']);
    r.runtime.advance(0, emptyIntent()); r.runtime.advance(16, emptyIntent());
    assert.ok(f.state.story.clues.includes('freezer-knocks')); assert.deepEqual(f.state.story.currentRun!.cues, ['ch01-sc-freezer']);
    const saved = structuredClone(f.state.story); r.runtime.advance(32, emptyIntent()); assert.deepEqual(f.state.story, saved);
    observeBreaker(r); hearCall(r); f.fail(); r.runtime.finish('abandon');
    assert.ok(f.state.pendingSettlement); assert.equal(f.saves.backupRecord()!.story.currentRun, null); assert.deepEqual(f.saves.backupRecord()!.story.clues, f.state.story.clues);
    const pending = structuredClone(f.state.pendingSettlement); f.fail(false); assert.ok(r.runtime.retrySettlement());
    assert.deepEqual(f.state.save, pending); assert.equal(f.state.story.currentRun, null); assert.equal(f.state.story.clues.length, 3);
    r.runtime.dispose(); f.state.state = 'hideout'; assert.ok(f.saves.beginRun(43, true, { marketStory: true }));
    assert.deepEqual(f.state.story.currentRun!.cues, []); assert.equal(f.state.story.clues.length, 3);
});

test('dialogue choices stay explicit and durable: unknown, report, defer, unchecked tell, checked tell, no duplicate cash', () => {
    for (const breaker of [false, true]) {
        const r = raid(), f = r.f; hearCall(r); if (breaker) observeBreaker(r);
        r.runtime.finish('abandon'); r.runtime.dispose(); f.state.state = 'hideout';
        const cash = f.state.save.cash, initial = f.raw;
        const first = f.base.openStory('breaker')!; assert.ok(first);
        assert.ok(first.view()!.options.some(o => o.id === (breaker ? 'report' : 'unknown')));
        first.close(); assert.equal(f.raw, initial);
        const call = f.base.openStory('call')!; assert.ok(call.choose('defer').ok); assert.equal(f.state.story.choices.call, 'defer'); call.close();
        const again = f.base.openStory('call')!; f.fail(); assert.equal(again.choose('tell').ok, false); assert.equal(f.state.story.choices.call, 'defer');
        f.fail(false); assert.ok(f.base.retrySave().ok); assert.ok(again.choose('tell').ok);
        assert.equal(again.view()!.id, breaker ? 'ch01-dlg-tell' : 'ch01-dlg-tell-unchecked'); assert.equal(f.state.story.memory.xiaocai.breakerReported, breaker);
        assert.equal(f.state.save.cash, cash); assert.equal(f.base.openStory('call')!.view()!.id, 'ch01-dlg-told');
        assert.equal(f.base.openStory('call')!.choose('defer').ok, false); assert.equal(f.state.story.choices.call, 'told');
    }
});

test('repair uses existing 3/2/1 and 420 once; all nodes roll back on failure; warehouse still costs 600', () => {
    const f = fixture(), talk = f.base.openStory()!;
    const writes = f.writes; assert.ok(talk.choose('submit').ok); assert.equal(talk.view()!.id, 'ch01-dlg-shortage'); assert.equal(f.writes, writes);
    talk.close(); f.setup(d => { for (const [id, qty] of Object.entries(D.QUESTS.repair.needs)) D.addItem(d.profile.stash, id, qty); });
    const submit = f.base.openStory()!, before = structuredClone(f.state.save), raw = f.raw;
    f.fail(); assert.equal(submit.choose('submit').ok, false); assert.deepEqual(f.state.save, before); assert.equal(f.raw, raw); assert.deepEqual(f.state.story.completedNodes, []);
    f.fail(false); assert.ok(f.base.retrySave().ok); assert.ok(submit.choose('submit').ok); assert.equal(submit.view()!.id, 'ch01-dlg-submit');
    assert.equal(f.state.save.cash, before.cash + 420); assert.deepEqual(f.state.story.completedNodes, ['ch01-n01', 'ch01-n02']); assert.deepEqual(f.state.story.clues, []);
    assert.equal(f.base.submitQuest('repair').ok, false); assert.equal(f.base.openStory('breaker')!.choose('report').ok, false);
    const cash = f.state.save.cash; assert.ok(f.base.upgradeStash().ok); assert.equal(f.state.save.cash, cash - 600);
});

test('explicit breaker report is atomic before repair, gives no reward, and never follows from repair alone', () => {
    const r = raid(), f = r.f; observeBreaker(r); r.runtime.finish('abandon'); r.runtime.dispose(); f.state.state = 'hideout';
    const talk = f.base.openStory('breaker')!, cash = f.state.save.cash, raw = f.raw;
    f.fail(); assert.equal(talk.choose('report').ok, false); assert.equal(talk.view()!.id, 'ch01-dlg-breaker');
    assert.equal(f.state.story.memory.xiaocai.breakerReported, false); assert.equal(f.raw, raw);
    f.fail(false); assert.ok(f.base.retrySave().ok); assert.ok(talk.choose('report').ok); assert.equal(talk.view()!.id, 'ch01-dlg-report');
    assert.ok(f.state.story.memory.xiaocai.breakerReported); assert.equal(f.state.save.quests.repair, false); assert.equal(f.state.save.cash, cash);
    assert.equal(f.base.openStory('breaker')!.choose('report').ok, false); assert.ok(talk.choose('thanks').ok);
});

test('partial cabinet loot rolls back both ends, keeps safe items on failure, and only remaining deficits return next run', () => {
    const f = fixture(); f.setup(d => { d.profile.bag.items = []; d.profile.safe.items = []; });
    const r = raid(f); hearCall(r); assert.ok(r.runtime.activate(cabinetRef(r.runtime)));
    const take = (id: string, x: number) => {
        const container = r.runtime.getLootContainer(STORY_CABINET)!, item = container.inventory.items.find(i => i.id === id)!;
        return r.runtime.transferLoot(cabinetRef(r.runtime), { runId: f.state.loadout!.runId!, containerId: container.id, from: 'container', to: 'safe', uid: item.uid, x, y: 0, quantity: 1 });
    };
    const world = r.runtime.snapshotExpansion(), raw = f.raw, safe = structuredClone(f.state.loadout!.safe);
    f.fail(); assert.equal(take('scrap', 0), 'save-failed'); assert.equal(f.raw, raw); assert.deepEqual(f.state.loadout!.safe, safe);
    assert.deepEqual(r.runtime.snapshotExpansion().raid!.maps.coast.containers, world.raid!.maps.coast.containers);
    f.fail(false); assert.ok(r.runtime.retrySave()); r.runtime.resume(); assert.ok(r.runtime.activate(cabinetRef(r.runtime)));
    assert.equal(take('scrap', 0), 'committed'); assert.equal(take('fuse', 1), 'committed');
    assert.equal(D.count(r.runtime.getLootContainer(STORY_CABINET)!.inventory, 'scrap'), 2);
    assert.equal(D.count(f.state.loadout!.safe, 'scrap'), 1); assert.equal(D.count(f.state.loadout!.safe, 'fuse'), 1);
    const beforeReject = f.raw; assert.equal(take('wire', 0), 'rejected'); assert.equal(f.raw, beforeReject);
    r.runtime.finish('abandon'); r.runtime.dispose(); f.state.state = 'hideout';
    assert.ok(f.saves.beginRun(44, true, { marketStory: true }));
    const next = f.state.expansion!.raid!.maps.coast.containers.find(c => c.id === STORY_CABINET)!;
    assert.deepEqual(['scrap','wire','fuse'].map(id => D.count(next.inventory, id)), [2,2,0]);
});

test('a durable story write whose publication fails stays committed/exportable and cannot replay or roll back', () => {
    const f = fixture(); assert.ok(f.saves.beginRun(42, true, { marketStory: true })); f.state.state = 'run';
    const ticket = f.saves.prepareExpansionMutation(d => { d.story.clues.push('breaker-down'); }); assert.ok(ticket);
    const live = structuredClone(f.state.expansion!);
    f.saves.attachExpansion({ capture: () => structuredClone(live), restore: () => { throw Error('publication failed'); } });
    const writes = f.writes; assert.equal(f.saves.commitExpansionMutation(ticket), 'publish-failed'); assert.equal(f.writes, writes + 1);
    assert.deepEqual(decodeSession(f.raw).story.clues, ['breaker-down']); assert.deepEqual(f.saves.backupRecord()!.story.clues, ['breaker-down']);
    assert.equal(f.saves.commitExpansionMutation(ticket), 'blocked'); assert.equal(f.saves.persist(), false); assert.equal(f.writes, writes + 1);
});

test('full export/import preserves facts; malformed dependencies/run/unknown fields refuse without repairing; conflict leaves exact bytes', () => {
    const r = raid(), f = r.f; observeBreaker(r); hearCall(r);
    const record = f.saves.backupRecord()!, text = encodeRecoveryBackup(record), decoded = decodePortableBackup(text);
    assert.equal(decoded.kind, 'session'); if (decoded.kind === 'session') assert.deepEqual(decoded.record, record);
    const mutations = [(s: any) => s.clues.push('invented'), (s: any) => s.clues.push(s.clues[0]), (s: any) => s.currentRun.runId = 'other',
        (s: any) => s.currentRun.mapId = 'resident-f2', (s: any) => s.extra = true, (s: any) => s.currentRun.cues.push('other'),
        (s: any) => { s.clues = []; s.choices.call = 'told'; }, (s: any) => s.completedNodes.push('ch01-n01'), (s: any) => s.currentRun = null];
    for (const mutation of mutations) { const bad = structuredClone(record); mutation(bad.story); assert.throws(() => decodeSession(JSON.stringify(bad))); }
    const empty = newStory(record.profile); empty.memory.xiaocai.breakerReported = true; assert.throws(() => validateStory(empty, record.profile, null));
    r.runtime.resume(); const external = fixture(f.raw); const changed = external.raw; f.data.set(SESSION_KEY, changed);
    assert.equal(r.runtime.checkpoint(), false); assert.equal(f.raw, changed); assert.ok(f.state.conflict); r.runtime.cancelStart();
    const base = fixture(); base.setup(d => { d.story.clues.push('breaker-down'); }); assert.equal(isPristine(base.saves.currentRecord()!), false);
});
