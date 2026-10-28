/** #26 F01/F02/F05: real packaged HTML, trusted input, and joint inventory/world persistence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls, running } from './stall-resume.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('=');
  if (!arg.startsWith('--') || at < 0) throw new Error('Use --html=path, --out=directory and optional --only=regular-expression.');
  return [arg.slice(2, at), arg.slice(at + 1)];
}));
for (const key of Object.keys(args)) if (!['html', 'out', 'only'].includes(key)) throw new Error(`Unknown option --${key}`);
const only = args.only ? new RegExp(args.only) : null;
const html = resolve(args.html || 'dist/index.html'), out = resolve(args.out || 'test-results/issue26-raid-inventory');
const SAVE_KEY = 'escape-bincov.session.v2', url = pathToFileURL(html).href;
await mkdir(out, { recursive: true });
const report = {
  startedAt: new Date().toISOString(), status: 'running', platform: `${process.platform}/${process.arch}`, node: process.version,
  html, htmlSHA256: createHash('sha256').update(await readFile(html)).digest('hex'),
  checkoutCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), cases: [],
  methodology: [
    'Each independent case starts a fresh offline file:// browser context and deploys through ordinary menu controls.',
    'Fixtures only arrange inventory, player position, equipment and enemy readiness through the explicit ?test=1 hooks. Gameplay operations use trusted Playwright mouse/keyboard input.',
    'Raids run on the 2.5D view (the Phaser view and its classic-coast entry were removed). Inventory assertions compare live carried/world state, profile safe contents and every persisted container.',
    'Storage.prototype.setItem is observed, not replaced with a fake save service. Successful transaction writes are counted inside their trusted browser input event; unrelated periodic checkpoints do not inflate this count.',
    'Quota faults arm at capture of the trusted action, retain the exact pre-action bytes, and exercise the ordinary retry flow. The second window writes a newer real record and triggers the native storage event.',
    '1280×720 runs all cases; 1920×1080 repeats pickup, equipment and swap with actual screenshots. No claimed touch-device or human balance acceptance.',
  ],
};
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const writeReport = () => writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
// A gun item carries its factory state (save v6); the slot names its gun the same way.
const factory = () => ({ parts: [], devices: { laser: false, light: false } });
const item = (uid, id, qty = 1, x = 0, y = 0) => ({ uid, id, qty, x, y, ...(['pistol', 'shotgun', 'carbine'].includes(id) ? { gun: factory() } : {}) });
const fullBag = () => Array.from({ length: 30 }, (_, i) => item(`full-${i}`, 'fuse', 4, i % 6, Math.floor(i / 6)));
const frames = (page, count = 3) => page.evaluate(n => new Promise(done => {
  let i = 0; const step = () => ++i >= n ? done() : requestAnimationFrame(step); requestAnimationFrame(step);
}), count);
const action = (page, id) => page.locator(`[data-action="${id}"]`);

async function runCase(entry, viewport, name, test) {
  const label = `${entry}-${viewport.width}x${viewport.height}-${name}`;
  const record = { entry, viewport, name, status: 'running', errors: [], externalRequests: [], screenshots: [] };
  report.cases.push(record); const started = performance.now();
  const context = await browser.newContext({ viewport, offline: true });
  await resumeStalls(context);
  context.on('request', request => { if (/^https?:/i.test(request.url())) record.externalRequests.push(request.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  context.on('page', p => {
    p.on('pageerror', error => record.errors.push(error.stack || error.message));
    p.on('console', message => { if (message.type() === 'error') record.errors.push(message.text()); });
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const sample = true, query = '?test=1&entry=tabs&sample=village';
  const selector = (source, uid) => `[data-source="${source}"][data-uid="${uid}"]`;
  const button = kind => page.locator(`[data-do="${{ quick: 'inv-quick', equip: 'inv-equip' }[kind]}"]`);
  const panel = () => page.evaluate(() => window.__bincovSample.host.panel);
  const waitPanel = value => page.waitForFunction(value => window.__bincovSample.host.panel === value, value || null);
  const screenshot = async suffix => {
    const path = resolve(out, `${label}-${suffix}.png`); await page.screenshot({ path }); record.screenshots.push(path);
  };
  const snapshot = () => page.evaluate(({ sample, key }) => {
    const a = window.__bincov.app, saves = window.__bincov.saveSession, bytes = localStorage.getItem(key), saved = JSON.parse(bytes);
    const live = saves.captureExpansion().raid, durable = saved.expansion?.raid ?? saved.raid;
    const containers = raid => raid.maps ? Object.values(raid.maps).flatMap(map => map.containers) : raid.containers;
    return {
      live: { loadout: a.loadout, containers: containers(live), profile: a.save },
      persisted: { loadout: durable.loadout, containers: containers(durable), profile: saved.profile },
      bytes, revision: saved.revision, conflict: a.conflict, storageOK: a.storageOK,
      context: window.__bincovSample.host.services.lootContext(),
      toast: document.querySelector('.coast-sample [data-toast]')?.textContent || '',
    };
  }, { sample, key: SAVE_KEY });
  const participants = s => ({ live: s.live, persisted: s.persisted });
  const assertSynced = s => {
    assert.deepEqual(s.live.loadout, s.persisted.loadout, 'carried inventory matches its committed checkpoint');
    assert.deepEqual(s.live.containers, s.persisted.containers, 'all world containers match the same committed checkpoint');
    assert.deepEqual(s.live.profile.safe, s.live.loadout.safe, 'safe contents match the profile');
    assert.deepEqual(s.live.profile, s.persisted.profile, 'profile and world persist together');
  };
  const audit = () => page.evaluate(() => window.__issue26Writes);
  const inputWrites = async () => (await audit()).filter(w => w.trusted && ['click', 'dblclick', 'pointerup'].includes(w.event) && w.ok);
  async function installAudit() {
    await page.evaluate(key => {
      window.__issue26RealSet = Storage.prototype.setItem; window.__issue26Writes = []; window.__issue26Fault = false;
      Storage.prototype.setItem = function (k, value) {
        if (k !== key) return window.__issue26RealSet.call(this, k, value);
        const event = window.event, audit = { event: event?.type ?? null, trusted: !!event?.isTrusted, ok: false, bytes: String(value) };
        window.__issue26Writes.push(audit);
        if (window.__issue26Fault) throw new DOMException('Issue 26 quota fixture', 'QuotaExceededError');
        const result = window.__issue26RealSet.call(this, k, value); audit.ok = true; return result;
      };
    }, SAVE_KEY);
  }
  const resetAudit = () => page.evaluate(() => { window.__issue26Writes = []; });
  async function fixture({ items = [item('incoming', 'sample')], bag = [], safe = [], weapon = 'pistol', ammo = 0 } = {}) {
    if (await panel()) { await page.keyboard.press('Escape'); await waitPanel(''); }
    const crate = await page.evaluate(({ items, bag, safe, weapon, ammo }) => {
      const a = window.__bincov.app, saves = window.__bincov.saveSession;
      {
        const h = window.__bincovSample.host, driver = window.__bincovSample.driver;
        driver.freezeAI(true);
        const box = h.lastBatch.frame.containers.filter(c => c.kind === 'crate' && c.regionId === null).sort((x, y) => Math.hypot(x.x - 640, x.y - 456) - Math.hypot(y.x - 640, y.y - 456))[0];
        if (!box) throw new Error('No exterior crate for the sample fixture');
        driver.placePlayer({ x: box.x, y: box.y + 12 }, -Math.PI / 2, 'coast');
        const ticket = saves.prepareExpansionMutation(draft => {
          const r = draft.expansion.raid, c = r.maps[r.currentMap].containers.find(c => c.id === box.id);
          c.inventory = { w: 6, h: 5, items }; r.loadout.bag.items = bag; r.loadout.safe.items = safe;
          Object.assign(r.loadout, { weapon, weaponUid: weapon ? 'fixture-weapon' : null, gun: weapon ? { parts: [], devices: { laser: false, light: false } } : null, ammo, ammoRelief: 0, relief: false }); r.knife = false; r.reloadLeft = 0;
          Object.assign(draft.expansion.body, { hp: 100, pollution: 0, bleeding: false });
        });
        if (!ticket || saves.commitExpansionMutation(ticket) !== 'committed') throw new Error(`Sample fixture failed strict validation: ${a.storageError}`);
        h.eventLog.length = 0; return { id: box.id, runId: a.loadout.runId };
      }
    }, { items, bag, safe, weapon, ammo });
    await frames(page); await resetAudit(); return crate;
  }
  async function open(crate) {
    // E opens the crate only while the raid runs (a stall pause resumed on a slow runner would swallow it).
    await running(page);
    await page.keyboard.press('e', { delay: 90 }); await waitPanel('loot'); await frames(page);
    assert.equal((await snapshot()).context.containerId, crate.id, 'E opens the fixture container');
    await page.locator('[data-grid="container"]').waitFor();
  }
  async function drag(source, uid, target, x, y, { release = true } = {}) {
    const from = await page.locator(selector(source, uid)).boundingBox(); assert.ok(from);
    const to = await page.locator(`[data-grid="${target}"]`).evaluate((el, at) => {
      const r = el.getBoundingClientRect(), cell = Number(el.dataset.cell) * r.width / el.offsetWidth;
      return { x: r.left + at.x * cell + 6, y: r.top + at.y * cell + 6 };
    }, { x, y });
    await page.mouse.move(from.x + 6, from.y + 6); await page.mouse.down();
    await page.mouse.move(from.x + 22, from.y + 22, { steps: 3 }); await page.mouse.move(to.x, to.y, { steps: 6 });
    const valid = await page.locator('.drop-preview').last().evaluate(el => String(!el.classList.contains('invalid')));
    if (release) { await page.mouse.up(); await frames(page); }
    return valid;
  }
  /** Trusted mouse drag of an item onto the primary-weapon slot (#26 F15); returns the slot's hover state before release. */
  async function dragToSlot(source, uid, { release = true } = {}) {
    const from = await page.locator(selector(source, uid)).boundingBox(), to = await page.locator('[data-equip-slot]').boundingBox();
    assert.ok(from && to);
    await page.mouse.move(from.x + 6, from.y + 6); await page.mouse.down();
    await page.mouse.move(from.x + 22, from.y + 22, { steps: 3 }); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    const state = await page.locator('[data-equip-slot]').evaluate(el => el.classList.contains('invalid') ? 'invalid' : el.classList.contains('over') ? 'over' : 'none');
    const foot = await page.locator('.cs-inv-foot').textContent();
    if (release) { await page.mouse.up(); await frames(page); }
    return { state, foot };
  }
  async function armFault(eventType, targetSelector) {
    await page.evaluate(({ eventType, targetSelector, key }) => {
      const arm = e => {
        if (!e.isTrusted || !e.target.closest(targetSelector)) return;
        document.removeEventListener(eventType, arm, true);
        window.__issue26BytesAtFault = localStorage.getItem(key); window.__issue26Fault = true;
      };
      document.addEventListener(eventType, arm, true);
    }, { eventType, targetSelector, key: SAVE_KEY });
  }
  async function recover() {
    await page.evaluate(() => { window.__issue26Fault = false; });
    await page.locator('[data-do="retry-save"]').click(); await waitPanel('');
    await frames(page);
  }
  try {
    await page.goto(url + query); await action(page, 'enter').click({ timeout: 60000 });
    await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 30000 });
    await installAudit();
    record.detail = await test({ page, context, sample, query, fixture, open, drag, dragToSlot, panel, waitPanel, snapshot, participants, assertSynced, audit, inputWrites, resetAudit, selector, button, armFault, recover, screenshot });
    assert.deepEqual(record.errors, [], 'no browser errors'); assert.deepEqual(record.externalRequests, [], 'no external requests');
    await screenshot('accepted'); record.status = 'passed';
  } catch (error) {
    record.status = 'failed'; record.error = error.stack || String(error); await screenshot('failure').catch(() => {});
  } finally {
    record.durationMs = Math.round(performance.now() - started);
    await page.evaluate(() => { window.__issue26Fault = false; if (window.__issue26RealSet) Storage.prototype.setItem = window.__issue26RealSet; }).catch(() => {});
    await context.close(); await writeReport();
    console.log(`${record.status === 'passed' ? 'PASS' : 'FAIL'} ${label}${record.error ? `\n${record.error.split('\n').slice(0, 3).join('\n')}` : ''}`);
  }
}

const cases = [
  ['carried-inventory-commands', async t => {
    await t.fixture({ bag: [item('own-water', 'water', 2)] });
    await running(t.page); await t.page.keyboard.press('Tab'); await t.waitPanel('inventory');
    await t.page.locator(t.selector('bag', 'own-water')).click(); await t.resetAudit();
    await t.page.locator('[data-do="inv-rotate"]').click(); await frames(t.page);
    let s = await t.snapshot(); assert.equal(s.live.loadout.bag.items[0].rotated, true); t.assertSynced(s);
    assert.equal((await t.inputWrites()).length, 1, 'original in-place rotation commits once');
    await t.resetAudit(); await t.button('quick').click(); await frames(t.page); s = await t.snapshot(); t.assertSynced(s);
    assert.equal(s.live.loadout.bag.items.length, 0); assert.equal(s.live.loadout.safe.items[0].qty, 2); assert.equal((await t.inputWrites()).length, 1);
    const secureUid = s.live.loadout.safe.items[0].uid;
    await t.page.locator(t.selector('safe', secureUid)).click(); await t.resetAudit(); await t.button('quick').click(); await frames(t.page);
    s = await t.snapshot(); t.assertSynced(s); assert.equal(s.live.loadout.safe.items.length, 0); assert.equal((await t.inputWrites()).length, 1);
    const uid = s.live.loadout.bag.items[0].uid;
    await t.page.locator(t.selector('bag', uid)).click(); await t.page.locator('[data-split]').fill('1');
    await t.page.locator('[data-do="inv-split"]').click(); await t.resetAudit();
    const grid = t.page.locator('[data-grid="bag"]'), cell = Number(await grid.getAttribute('data-cell'));
    await grid.click({ position: { x: 2.4 * cell, y: 1.4 * cell } }); await frames(t.page);
    s = await t.snapshot(); t.assertSynced(s); assert.equal(s.live.loadout.bag.items.length, 2); assert.equal((await t.inputWrites()).length, 1);
    assert.equal(s.live.loadout.bag.items.find(i => i.uid === uid).qty, 1);
    await t.resetAudit(); assert.equal(await t.drag('bag', uid, 'bag', 0, 3), 'true'); s = await t.snapshot(); t.assertSynced(s);
    assert.equal((await t.inputWrites()).length, 1); assert.equal(s.live.loadout.bag.items.find(i => i.uid === uid).y, 3);
    assert.equal(await t.page.locator('.cs-ghost,.drop-preview').count(), 0);
    return { mode: await t.panel(), rotate: true, wholeQuickBothWays: true, split: true, sameBagDrag: true };
  }],
  ['carried-inventory-quota-rollback', async t => {
    const gun = item('own-gun', 'pistol');
    gun.gun.parts = [{ uid: 'own-base', id: 'A01', slot: 'base', relief: false, children: [{ uid: 'own-dot', id: 'O01', slot: 'micro', relief: true, children: [] }] }];
    await t.fixture({ bag: [gun] }); await running(t.page); await t.page.keyboard.press('Tab'); await t.waitPanel('inventory');
    await t.page.locator(t.selector('bag', gun.uid)).click(); const before = t.participants(await t.snapshot()); await t.resetAudit();
    await t.armFault('click', '[data-do="inv-quick"]'); await t.button('quick').click(); await t.waitPanel('pause');
    const failed = await t.snapshot(); assert.deepEqual(t.participants(failed), before);
    assert.equal(failed.bytes, await t.page.evaluate(() => window.__issue26BytesAtFault));
    assert.ok((await t.audit()).some(w => !w.ok)); await t.screenshot('carried-save-rejected');
    await t.recover(); assert.deepEqual(t.participants(await t.snapshot()), before, 'save retry does not replay the item action');
    await t.page.keyboard.press('Tab'); await t.waitPanel('inventory'); await t.page.locator(t.selector('bag', gun.uid)).click(); await t.resetAudit();
    await t.button('quick').click(); await frames(t.page); const after = await t.snapshot(); t.assertSynced(after);
    assert.equal((await t.inputWrites()).length, 1); assert.deepEqual(after.live.loadout.safe.items[0].gun, gun.gun);
    assert.equal(after.live.loadout.safe.items[0].uid, gun.uid); assert.equal(after.live.loadout.bag.items.length, 0);
    return { rollbackBytes: true, nestedGunPreserved: true, explicitActionRetryWrites: 1 };
  }],
  ['pickup-once', async t => {
    const crate = await t.fixture({ items: [item('double-pickup', 'bandage', 2), item('button-pickup', 'pistol', 1, 1)] }); await t.open(crate);
    await t.page.locator(t.selector('container', 'double-pickup')).dblclick(); await frames(t.page);
    let s = await t.snapshot(); assert.equal(s.live.loadout.bag.items.find(i => i.uid === 'double-pickup')?.qty, 2);
    assert.equal(s.live.containers.find(c => c.id === crate.id).inventory.items.some(i => i.uid === 'double-pickup'), false);
    assert.equal((await t.inputWrites()).length, 1, 'one trusted double click persists exactly once'); t.assertSynced(s);
    await t.page.locator(t.selector('container', 'button-pickup')).click();
    assert.match(await t.button('equip').textContent(), /装备主武器/, 'a container gun can be equipped directly (#26 F15)');
    assert.equal(await t.page.locator('[data-do="inv-use"]').count(), 0);
    assert.match(await t.button('quick').textContent(), /拿到背包/); await t.resetAudit(); await t.button('quick').click(); await frames(t.page);
    s = await t.snapshot(); assert.equal(s.live.loadout.bag.items.filter(i => i.uid === 'button-pickup').length, 1);
    assert.equal((await t.inputWrites()).length, 1, 'explicit pickup button persists exactly once'); t.assertSynced(s);
    await t.screenshot('picked-up'); const before = t.participants(s);
    await t.page.reload(); await action(t.page, 'enter').click();
    await t.page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
    await t.waitPanel('pause'); const restored = await t.snapshot();
    assert.deepEqual(t.participants(restored), before, 'refresh restores both sides without duplicating either pickup');
    return { doubleClickWrites: 1, buttonWrites: 1, restoredBag: restored.live.loadout.bag.items };
  }],
  ['partial-stack-and-full-bag', async t => {
    const bag = fullBag(); bag[0] = item('nearly-full-ammo', 'ammo9', 38);
    const crate = await t.fixture({ bag, items: [item('partial-ammo', 'ammo9', 8), item('no-space', 'sample', 1, 1)] }); await t.open(crate);
    await t.page.locator(t.selector('container', 'partial-ammo')).dblclick(); await frames(t.page);
    let s = await t.snapshot(); assert.equal(s.live.loadout.bag.items.find(i => i.uid === 'nearly-full-ammo').qty, 40);
    assert.equal(s.live.containers.find(c => c.id === crate.id).inventory.items.find(i => i.uid === 'partial-ammo').qty, 6);
    assert.equal((await t.inputWrites()).length, 1); t.assertSynced(s);
    const before = t.participants(s); await t.resetAudit();
    await t.page.locator(t.selector('container', 'no-space')).dblclick(); await frames(t.page);
    s = await t.snapshot(); assert.deepEqual(t.participants(s), before, 'quick pickup never swaps out existing full-bag loot');
    assert.match(s.toast, /背包空间不足/); assert.equal((await t.inputWrites()).length, 0);
    await t.page.locator(t.selector('container', 'no-space')).click(); await t.button('quick').click(); await frames(t.page);
    assert.deepEqual(t.participants(await t.snapshot()), before); return { merged: 2, remaining: 6, refused: '背包空间不足' };
  }],
  ['equip-gun-and-specific-rejection', async t => {
    const crate = await t.fixture({ items: [item('new-gun', 'carbine')], ammo: 8 }); await t.open(crate);
    await t.page.locator(t.selector('container', 'new-gun')).click(); await t.button('quick').click(); await frames(t.page);
    await t.page.locator(t.selector('bag', 'new-gun')).click(); assert.match(await t.button('equip').textContent(), /装备主武器/);
    await t.button('equip').click(); await frames(t.page); let s = await t.snapshot();
    assert.equal(s.live.loadout.weapon, 'carbine'); assert.equal(s.live.loadout.bag.items.filter(i => i.id === 'pistol').length, 1);
    assert.equal(s.live.loadout.bag.items.filter(i => i.id === 'ammo9').reduce((n, i) => n + i.qty, 0), 8); t.assertSynced(s);
    await t.screenshot('equipped-picked-gun');
    const bag = fullBag().filter(i => i.y !== 0 || i.x > 1); bag.push(item('cannot-equip', 'pistol'));
    const full = await t.fixture({ bag, weapon: 'carbine', ammo: 12 }); await t.open(full);
    await t.page.locator(t.selector('bag', 'cannot-equip')).click(); const before = t.participants(await t.snapshot()); await t.resetAudit();
    await t.button('equip').click(); await frames(t.page, 5); s = await t.snapshot();
    assert.deepEqual(t.participants(s), before, 'failed equipment change preserves weapon, magazine and inventories');
    assert.match(s.toast, /无法装备.*背包装不下.*武器和弹药/, 'specific equipment-space rejection remains visible after Runtime events');
    assert.equal((await t.inputWrites()).length, 0); return { equipped: 'carbine', recoveredRounds: 8, rejection: s.toast };
  }],
  ['equip-slot-drag-from-container-and-bag', async t => {
    // #26 F15: drag a gun onto the weapon slot, straight from the open container and from the backpack.
    const crate = await t.fixture({ items: [item('crate-gun', 'carbine')], bag: [item('bag-gun', 'shotgun', 1, 0, 0), item('bag-water', 'water', 1, 4, 0)], safe: [item('safe-gun', 'pistol')], ammo: 8 });
    await t.open(crate); await t.screenshot('slot-before');
    assert.match(await t.page.locator('[data-equip-slot]').textContent(), /旧式手枪.*弹匣 8/);
    let hover = await t.dragToSlot('container', 'crate-gun');
    assert.deepEqual(hover, { state: 'over', foot: '松开即装备 半自动卡宾枪' });
    let s = await t.snapshot(); t.assertSynced(s);
    assert.equal(s.live.loadout.weapon, 'carbine'); assert.equal(s.live.loadout.weaponUid, 'crate-gun');
    assert.equal(s.live.containers.find(c => c.id === crate.id).inventory.items.some(i => i.uid === 'crate-gun'), false, 'the gun left the container');
    assert.equal(s.live.loadout.bag.items.filter(i => i.uid === 'fixture-weapon').length, 1, 'the replaced pistol is back in the bag as itself');
    assert.equal(s.live.loadout.bag.items.filter(i => i.id === 'ammo9').reduce((n, i) => n + i.qty, 0), 8, 'its rounds too');
    assert.equal((await t.inputWrites()).length, 1, 'container, bag and slot share one write');
    assert.equal(s.toast, '已装备半自动卡宾枪。', 'one announcement, not the panel and the Runtime event both');
    assert.match(await t.page.locator('[data-equip-slot]').textContent(), /半自动卡宾枪/);
    await t.screenshot('slot-equipped-from-crate');
    await t.resetAudit(); hover = await t.dragToSlot('bag', 'bag-gun');
    assert.equal(hover.state, 'over'); s = await t.snapshot(); t.assertSynced(s);
    assert.equal(s.live.loadout.weapon, 'shotgun'); assert.equal(s.live.loadout.bag.items.filter(i => i.uid === 'crate-gun').length, 1);
    assert.equal((await t.inputWrites()).length, 1);
    const before = t.participants(s); await t.resetAudit();
    for (const [source, uid, reason] of [['bag', 'bag-water', /只有枪械/], ['safe', 'safe-gun', /安全箱里的枪械请先移回背包/]]) {
      hover = await t.dragToSlot(source, uid); assert.equal(hover.state, 'invalid'); assert.match(hover.foot, reason);
      s = await t.snapshot(); assert.deepEqual(t.participants(s), before, `${uid} cannot be equipped`); assert.match(s.toast, reason);
    }
    assert.equal((await t.inputWrites()).length, 0);
    return { fromContainer: 'carbine', fromBag: 'shotgun', refused: ['water', 'safe pistol'] };
  }],
  ['equip-slot-select-then-tap', async t => {
    // Click-to-place and touch: select the gun, then tap the slot; the details button equips from the container too.
    const crate = await t.fixture({ items: [item('tap-gun', 'carbine'), item('button-gun', 'shotgun', 1, 0, 2)] }); await t.open(crate);
    await t.page.evaluate(() => { window.__bincovSample.host.input.touch = true; window.__bincovSample.host.inv.render(); });
    await t.page.locator('[data-equip-slot]').click(); assert.match(await t.page.locator('.cs-inv-foot').textContent(), /先选中.*枪/);
    await t.page.locator(t.selector('container', 'tap-gun')).click();
    assert.equal(await t.page.locator('[data-equip-slot].ready').count(), 1, 'the slot lights up for a selected gun');
    await t.screenshot('slot-ready-touch'); await t.resetAudit();
    await t.page.locator('[data-equip-slot]').click(); await frames(t.page); let s = await t.snapshot(); t.assertSynced(s);
    assert.equal(s.live.loadout.weaponUid, 'tap-gun'); assert.equal((await t.inputWrites()).length, 1);
    await t.page.locator(t.selector('container', 'button-gun')).click(); await t.resetAudit();
    await t.button('equip').click(); await frames(t.page); s = await t.snapshot(); t.assertSynced(s);
    assert.equal(s.live.loadout.weaponUid, 'button-gun'); assert.equal(s.live.loadout.bag.items.filter(i => i.uid === 'tap-gun').length, 1);
    assert.equal((await t.inputWrites()).length, 1);
    return { tapped: 'carbine', button: 'shotgun' };
  }],
  ['equip-slot-full-bag-and-quota-rollback', async t => {
    // No room for the replaced pistol: the whole swap is refused and nothing moves. Then a failed write rolls back.
    const crate = await t.fixture({ items: [item('crate-gun', 'carbine')], bag: fullBag(), ammo: 8 }); await t.open(crate);
    let before = t.participants(await t.snapshot()); await t.resetAudit();
    await t.dragToSlot('container', 'crate-gun'); await frames(t.page, 5); let s = await t.snapshot();
    assert.deepEqual(t.participants(s), before, 'refused swap keeps weapon, magazine, bag and container');
    assert.match(s.toast, /无法装备.*背包装不下.*武器和弹药/); assert.equal((await t.inputWrites()).length, 0);
    const room = await t.fixture({ items: [item('crate-gun', 'carbine')], ammo: 8 }); await t.open(room);
    before = t.participants(await t.snapshot()); await t.resetAudit();
    await t.armFault('pointerup', '[data-equip-slot]'); await t.dragToSlot('container', 'crate-gun'); await t.waitPanel('pause');
    const failed = await t.snapshot();
    assert.deepEqual(t.participants(failed), before, 'failed write rolls back the slot, bag and the container');
    assert.equal(failed.bytes, await t.page.evaluate(() => window.__issue26BytesAtFault));
    assert.ok((await t.audit()).some(w => !w.ok)); await t.screenshot('slot-save-rejected');
    await t.recover(); await t.open(room);
    assert.deepEqual(t.participants(await t.snapshot()), before, 'retry saves the rolled-back state, not the equip');
    await t.resetAudit(); await t.dragToSlot('container', 'crate-gun'); s = await t.snapshot(); t.assertSynced(s);
    assert.equal(s.live.loadout.weaponUid, 'crate-gun'); assert.equal((await t.inputWrites()).length, 1, 'explicit retry writes once');
    return { fullBagRefused: true, rollback: true, retryWrites: 1 };
  }],
  ['drag-swaps-and-invalid-overlap', async t => {
    const crate = await t.fixture({ items: [item('swap-source', 'fuse')], bag: [item('swap-gun', 'pistol', 1, 2, 2), item('block-a', 'sample', 1, 0, 4), item('block-b', 'wire', 1, 1, 4)] }); await t.open(crate);
    assert.equal(await t.drag('container', 'swap-source', 'bag', 2, 2), 'true');
    let s = await t.snapshot(), box = s.live.containers.find(c => c.id === crate.id).inventory;
    assert.deepEqual(s.live.loadout.bag.items.find(i => i.uid === 'swap-source'), item('swap-source', 'fuse', 1, 2, 2));
    assert.deepEqual(box.items.find(i => i.uid === 'swap-gun'), item('swap-gun', 'pistol'));
    assert.equal((await t.inputWrites()).length, 1, 'both sides of swap share one write'); t.assertSynced(s);
    const before = t.participants(s); await t.resetAudit();
    assert.equal(await t.drag('container', 'swap-gun', 'bag', 0, 4), 'false');
    assert.deepEqual(t.participants(await t.snapshot()), before, 'multiple overlapping targets cannot be exchanged');
    assert.equal((await t.inputWrites()).length, 0);
    await t.drag('bag', 'block-a', 'bag', 1, 4); s = await t.snapshot();
    assert.deepEqual(s.live.loadout.bag.items.find(i => i.uid === 'block-a'), item('block-a', 'sample', 1, 1, 4));
    assert.deepEqual(s.live.loadout.bag.items.find(i => i.uid === 'block-b'), item('block-b', 'wire', 1, 0, 4)); t.assertSynced(s);
    return { crossContainerSwap: true, sameBagSwap: true, multipleOverlapRejected: true };
  }],
  ...['quick', 'swap'].map(operation => [`${operation}-quota-joint-rollback`, async t => {
    const crate = await t.fixture({ items: [item('rollback-source', 'sample')], bag: operation === 'swap' ? [item('rollback-target', 'wire')] : [], safe: [item('safe-sentinel', 'pearl')] }); await t.open(crate);
    if (operation === 'quick') await t.page.locator(t.selector('container', 'rollback-source')).click();
    const before = t.participants(await t.snapshot()); await t.resetAudit();
    await t.armFault(operation === 'quick' ? 'click' : 'pointerup', operation === 'quick' ? '[data-do="inv-quick"]' : '[data-grid]');
    if (operation === 'quick') await t.button('quick').click(); else await t.drag('container', 'rollback-source', 'bag', 0, 0);
    await t.waitPanel('pause'); const failed = await t.snapshot();
    assert.deepEqual(t.participants(failed), before, 'failed write rolls back profile, carried inventory and every world container');
    assert.equal(failed.bytes, await t.page.evaluate(() => window.__issue26BytesAtFault), 'exact pre-action saved bytes survive quota failure');
    assert.ok((await t.audit()).some(w => !w.ok), 'the real storage write failed'); assert.equal(failed.context, null);
    await t.screenshot('save-rejected'); await t.recover(); await t.open(crate);
    assert.deepEqual(t.participants(await t.snapshot()), before, 'retry saves rolled-back state, never the rejected item operation');
    await t.resetAudit();
    if (operation === 'quick') { await t.page.locator(t.selector('container', 'rollback-source')).click(); await t.button('quick').click(); }
    else await t.drag('container', 'rollback-source', 'bag', 0, 0);
    await frames(t.page); const accepted = await t.snapshot(); t.assertSynced(accepted);
    assert.equal(accepted.live.loadout.bag.items.filter(i => i.uid === 'rollback-source').length, 1);
    assert.equal((await t.inputWrites()).length, 1, 'explicit retry of the action persists once');
    if (operation === 'swap') assert.equal(accepted.live.containers.find(c => c.id === crate.id).inventory.items.filter(i => i.uid === 'rollback-target').length, 1);
    return { operation, rollback: true, retryWrites: 1 };
  }]),
  ['real-window-conflict-cancels-held-swap', async t => {
    const crate = await t.fixture({ items: [item('conflict-source', 'sample')], bag: [item('conflict-target', 'wire')] }); await t.open(crate);
    const other = await t.context.newPage();
    try {
      await other.goto(url + t.query); await other.waitForFunction(() => window.__bincov);
      assert.equal(await other.evaluate(() => window.__bincov.app.storageOK), false, 'second page cannot claim the existing writer lock');
      await t.page.bringToFront();
      // Loading the other page can starve this one past 2 s on a slow runner: the stall pause closes the loot panel.
      if (await t.panel() !== 'loot') await t.open(crate);
      const before = t.participants(await t.snapshot());
      assert.equal(await t.drag('container', 'conflict-source', 'bag', 0, 0, { release: false }), 'true');
      // Stop only the view's ticker (not a pause), after establishing the real drag,
      // so the simulation cannot change the snapshot during this storage event.
      // Open the other page first: focus changes must not cancel the gesture before the conflict does.
      await t.page.evaluate(() => window.__bincovSample.host.app.ticker.stop());
      assert.equal(await t.page.locator('.drop-preview').count(), 1, 'swap is still held immediately before the competing write');
      const winner = await other.evaluate(key => {
        const saved = JSON.parse(localStorage.getItem(key)); saved.revision++;
        const bytes = JSON.stringify(saved); localStorage.setItem(key, bytes); return bytes;
      }, SAVE_KEY);
      await t.page.waitForFunction(() => window.__bincov.app.conflict); await t.page.mouse.up();
      await t.page.evaluate(() => window.__bincovSample.host.app.ticker.start());
      await frames(t.page); const s = await t.snapshot(); assert.equal(s.context, null); assert.equal(s.bytes, winner);
      assert.deepEqual(t.participants(s), before, 'held swap cannot mutate either participant after a real window conflict');
      assert.equal(await t.page.locator('[data-grid="container"]').count(), 0); return { conflict: s.conflict, newerRecordPreserved: true };
    } finally { await other.close(); }
  }],
];

try {
  for (const entry of ['village']) for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    for (const [name, test] of cases) {
      if (viewport.width === 1920 && !['carried-inventory-commands', 'pickup-once', 'equip-gun-and-specific-rejection', 'equip-slot-drag-from-container-and-bag', 'equip-slot-select-then-tap', 'drag-swaps-and-invalid-overlap'].includes(name)) continue;
      if (only && !only.test(`${entry}-${viewport.width}x${viewport.height}-${name}`)) continue;
      await runCase(entry, viewport, name, test);
    }
  }
} finally {
  report.finishedAt = new Date().toISOString(); report.passed = report.cases.filter(c => c.status === 'passed').length;
  report.failed = report.cases.filter(c => c.status !== 'passed').length; report.status = report.failed || !report.cases.length ? 'failed' : 'passed';
  await browser.close(); await writeReport();
}
console.log(`${report.status.toUpperCase()} ${report.passed}/${report.cases.length}; report ${resolve(out, 'report.json')}`);
if (report.status !== 'passed') process.exitCode = 1;
