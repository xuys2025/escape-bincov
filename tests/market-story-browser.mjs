/** Manual browser integration for #83's non-presentation contract. Requires the real baseline v9 HTML named in the
 * provenance file; never substitute the current build. Run after pnpm package. This does not sign off Opus's UI. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { browserOptions } from '../scripts/browser-options.mjs';

const out = resolve('test-results/market-story'); await mkdir(out, { recursive: true });
const provenance = JSON.parse(await readFile('tests/fixtures/market-v9-provenance.json', 'utf8'));
const oldHtml = await readFile(process.env.BINCOV_STORY_V9_HTML || resolve(out, 'baseline-v9.html'));
assert.equal(createHash('sha256').update(oldHtml).digest('hex'), provenance.htmlSha256, 'must use the recorded real v9 baseline');
const built = await build({ stdin: { contents: `
import * as D from './src/domain';
import { SaveSession, createSessionState } from './src/session';
import { ownSession } from './src/recovery-store';
import { RealHideoutRuntime } from './src/hideout-runtime';
import { CoastRaidRuntime } from './src/raid-runtime/runtime';
import { createRuntimeTestDriver } from './src/raid-runtime/test-support';
import { MARKET_ANCHORS } from './src/market-world';
if(new URLSearchParams(location.search).get('test') !== '1') throw Error('test-only harness');
const owner = await ownSession(navigator.locks), state = createSessionState();
const saves = new SaveSession(state, () => localStorage), initialized = saves.initialize(owner.owned);
const base = new RealHideoutRuntime(state, saves);
if (initialized && !state.save.activeRun) base.enter();
window.storyTest = { D, state, saves, base, owner, initialized, anchors: MARKET_ANCHORS,
 mount() { if(state.state==='menu') saves.resumeRun(); state.state='run'; this.core=new CoastRaidRuntime(state,saves); this.driver=createRuntimeTestDriver(this.core,'?test=1'); this.driver.freezeAI(true); },
 deploy() { if(!saves.beginRun(42,true,{marketStory:true})) throw Error(state.storageError); this.mount(); },
 place(id) { this.driver.placePlayer(MARKET_ANCHORS[id]); },
 cabinet() { return {kind:'container',id:'ch01-sc-toolcab',mapId:'coast',runId:state.loadout.runId}; },
 setup(fn) { const ticket=saves.prepareExpansionMutation(fn); if(!ticket || saves.commitExpansionMutation(ticket)!=='committed') throw Error(state.storageError); },
 fail(value) { window.__originalSetItem ??= Storage.prototype.setItem; Storage.prototype.setItem=value ? function(k,v){if(k==='escape-bincov.session.v2')throw new DOMException('quota','QuotaExceededError');return window.__originalSetItem.call(this,k,v);} : window.__originalSetItem; }
};
`, resolveDir: process.cwd(), sourcefile: 'market-story-browser-harness.ts', loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', write: false });
const currentHtml = await readFile('dist/index.html');
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/legacy') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(oldHtml); }
  else if (path === '/current') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(currentHtml); }
  else if (path === '/harness.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(built.outputFiles[0].contents); }
  else if (path === '/harness') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>Market story contract test</title><script type="module" src="/harness.js"></script>'); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(browserOptions), context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const report = { browser: browser.version(), baseline: provenance, steps: [], errors: [], methodology: 'Real Chromium localStorage and Web Locks with real v9/current game HTML. Story operations use a separate test-only bundle of production Runtime APIs and the existing explicit test driver, without a presentation layer. Quota failures are injected into Storage.setItem. No UI, audio, natural-play or human comprehension signoff.' };
context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
context.on('request', req => { if (/^https?:/.test(req.url()) && !req.url().startsWith(origin + '/')) report.errors.push('External request: ' + req.url()); });
let page;
const raw = p => p.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
async function harness() { const p = await context.newPage(); await p.goto(origin + '/harness?test=1'); await p.waitForFunction(() => window.storyTest); return p; }
async function step(name, work) { const entry = { name, status: 'running' }; report.steps.push(entry); try { await work(); assert.deepEqual(report.errors, []); entry.status = 'passed'; console.log('PASS', name); } catch (e) { entry.status = 'failed'; entry.error = e.stack; throw e; } }
let original, activeBackup, activeBytes;
try {
  await step('real v9 game -> current migration preserves exact bytes, empty knowledge and outer version isolation', async () => {
    page = await context.newPage(); await page.goto(origin + '/legacy?test=1&entry=tabs');
    await page.waitForFunction(() => localStorage.getItem('escape-bincov.session.v2'));
    original = await raw(page); assert.equal(JSON.parse(original).version, 9); await page.close();
    page = await harness(); const record = JSON.parse(await raw(page));
    assert.equal(record.version, 10); assert.equal(record.storyBackup, original); assert.deepEqual(record.story.clues, []);
  });
  await step('second real window cannot acquire the writer lock or change story progress', async () => {
    const before = await raw(page), second = await harness();
    assert.equal(await second.evaluate(() => window.storyTest.initialized), false);
    assert.equal(await second.evaluate(() => window.storyTest.saves.persist()), false);
    assert.equal(await raw(second), before); await second.close();
  });
  await step('cabinet open failure rolls back; retry commits call and cue once; real reload resumes exact contents', async () => {
    await page.evaluate(() => { const t=window.storyTest; t.deploy(); t.place('ch01-sc-toolcab'); t.fail(true); });
    const before = await raw(page);
    assert.equal(await page.evaluate(() => window.storyTest.core.activate(window.storyTest.cabinet())), false);
    assert.equal(await raw(page), before);
    assert.deepEqual(await page.evaluate(() => window.storyTest.state.story.clues), []);
    assert.ok(!await page.evaluate(() => window.storyTest.core.current().events.some(e=>e.type==='story-cue')));
    await page.evaluate(() => window.storyTest.fail(false));
    assert.equal(await page.evaluate(() => window.storyTest.core.retrySave()), true);
    const contents = await page.evaluate(() => structuredClone(window.storyTest.core.getLootContainer('ch01-sc-toolcab')));
    activeBytes = await raw(page); activeBackup = await page.evaluate(() => window.storyTest.base.exportBackup());
    await page.close(); page = await harness(); await page.evaluate(() => window.storyTest.mount());
    assert.deepEqual(await page.evaluate(() => structuredClone(window.storyTest.core.getLootContainer('ch01-sc-toolcab'))), contents);
    assert.ok(!await page.evaluate(() => window.storyTest.core.current().events.some(e=>e.type==='story-cue')));
    const reopened = await raw(page); assert.equal(await page.evaluate(() => window.storyTest.core.activate(window.storyTest.cabinet())), true); assert.equal(await raw(page), reopened);
  });
  await step('failure retains knowledge, unchecked tell stays truthful, failed choice never advances its reply', async () => {
    await page.evaluate(() => { const t=window.storyTest; t.core.finish('abandon'); t.core.dispose(); t.state.state='hideout'; t.talk=t.base.openStory('call'); });
    assert.equal(await page.evaluate(() => window.storyTest.talk.choose('defer').ok), true);
    await page.evaluate(() => { const t=window.storyTest; t.talk=t.base.openStory('call'); t.fail(true); });
    const before = await raw(page); assert.equal(await page.evaluate(() => window.storyTest.talk.choose('tell').ok), false); assert.equal(await raw(page), before);
    assert.equal(await page.evaluate(() => window.storyTest.talk.view().id), 'ch01-dlg-call');
    await page.evaluate(() => { const t=window.storyTest; t.fail(false); if(!t.base.retrySave().ok)throw Error('retry failed'); });
    assert.equal(await page.evaluate(() => window.storyTest.talk.choose('tell').ok), true);
    assert.equal(await page.evaluate(() => window.storyTest.talk.view().id), 'ch01-dlg-tell-unchecked');
    assert.deepEqual(await page.evaluate(() => window.storyTest.state.story.clues), ['heard-call']);
  });
  await step('repair reward and nodes are one transaction; duplicate submission does not reward; full active backup imports and restores', async () => {
    await page.evaluate(() => { const t=window.storyTest; t.setup(d=>{for(const [id,n] of Object.entries(t.D.QUESTS.repair.needs)) t.D.addItem(d.profile.stash,id,n);}); t.talk=t.base.openStory(); t.fail(true); });
    const before = await raw(page), cash = JSON.parse(before).profile.cash;
    assert.equal(await page.evaluate(() => window.storyTest.talk.choose('submit').ok), false); assert.equal(await raw(page), before);
    await page.evaluate(() => { const t=window.storyTest; t.fail(false); t.base.retrySave(); });
    assert.equal(await page.evaluate(() => window.storyTest.talk.choose('submit').ok), true);
    assert.equal(JSON.parse(await raw(page)).profile.cash, cash + 420); assert.deepEqual(JSON.parse(await raw(page)).story.completedNodes, ['ch01-n01','ch01-n02']);
    assert.equal(await page.evaluate(() => window.storyTest.base.submitQuest('repair').ok), false);
    const bad = JSON.parse(activeBackup); bad.record.story.choices.call='told'; bad.record.story.clues=[];
    assert.equal(await page.evaluate(text => window.storyTest.base.previewImport(text).ok, JSON.stringify(bad)), false);
    const imported = await page.evaluate(text => { const t=window.storyTest, preview=t.base.previewImport(text); return preview.ok && t.base.importBackup(text,preview.token).ok; }, activeBackup);
    assert.equal(imported, true); assert.deepEqual(JSON.parse(await raw(page)).story, JSON.parse(activeBytes).story);
  });
  await step('the actual v9 page rejects a current story save without overwriting its bytes', async () => {
    const before = await raw(page); await page.close(); page = await context.newPage();
    await page.goto(origin + '/legacy?test=1&entry=tabs'); await page.waitForFunction(() => window.__bincov);
    assert.equal(await page.evaluate(() => window.__bincov.app.storageOK), false); assert.equal(await raw(page), before);
    await page.close(); page = await context.newPage(); await page.goto(origin + '/current?test=1&entry=tabs');
    await page.waitForFunction(() => window.__bincov);
    assert.equal(await page.evaluate(() => window.__bincov.app.storageOK), true);
    assert.equal(JSON.parse(await raw(page)).expansion.raid.worldVersion, 'coast-story-v1');
  });
  report.status = 'passed';
} finally {
  await writeFile(resolve(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
