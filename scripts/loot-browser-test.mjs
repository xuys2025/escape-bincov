/** Explicit fixtures accelerate setup; interactions use native keyboard/mouse on the 2.5D raid view. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { raidReady, frames, drive, panel, waitPanel, screenOf } from './raid-view.mjs';

const out = resolve('test-results'), SAVE_KEY = 'escape-bincov.session.v2';
const report = { startedAt: new Date().toISOString(), status: 'running', viewports: [], methodology: [
  'Fresh offline file:// contexts at 1280×720 and 1920×1080; browser errors and external requests fail acceptance.',
  'Raids deploy to the default area (沿海街区, three maps) and run on the 2.5D view. Positions, inventories, enemy readiness and elapsed time are controlled fixtures (the ?test=1 driver and session candidates). E opening, closing, transfers, combat and extraction use real browser keys/mouse.',
  'Pointer drags use displayed grid geometry; the panel takes the drop cell from the dragged item\'s top-left corner, so drags grab 6 px inside the item and release 6 px inside the target cell. Stale-drag checks close and replace the source while the mouse is held.',
  'Quota injection starts at capture of the trusted pointerup event, so periodic saves remain writable until the transfer. Failed transfers compare inventories and the exact pre-drop session bytes.',
  'The old-client storage-event fixture stops the raid renderer\'s ticker, preserving the open loot panel while excluding automatic checkpoints; it restarts after conflict detection.',
  'Repeated refreshes restore matching container, corpse and carried inventories. Three consecutive completed runs verify lifecycle isolation. This is not a natural-play balance test.',
] };
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const writeReport = () => writeFile(resolve(out, 'loot-browser-report.json'), JSON.stringify(report, null, 2));
// A gun item carries its factory state (save v6).
const item = (uid, id, qty = 1, x = 0, y = 0) => ({ uid, id, qty, x, y, ...(['pistol', 'shotgun', 'carbine'].includes(id) ? { gun: { parts: [], devices: { laser: false, light: false } } } : {}) });
/** The seed's original records from the game's own generator (tsx in a child process). */
function seedLoot(seed) {
  const code = `import('./src/building-world.ts').then(m => { const c = m.buildingRunConfig(${Number(seed)}), all = [...c.loot, ...c.containers.flatMap(x => x.items)];
    console.log(JSON.stringify({ records: all.length, crates: c.containers.length, units: all.reduce((n, i) => n + i.qty, 0) })); })`;
  return JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: resolve('.'), encoding: 'utf8' }));
}
/** Live state of the raid: the session's live capture (current map containers), the published frame and the stored bytes. */
const snapshotOf = page => page.evaluate(key => {
  const a = window.__bincov.app, h = window.__bincovSample?.host ?? null, b = h?.lastBatch ?? null;
  const raid = a.state === 'run' ? window.__bincov.saveSession.captureExpansion()?.raid ?? null : null, map = raid?.maps[raid.currentMap];
  return { state: a.state, panel: h?.panel ?? null, context: h?.services.lootContext() ?? null, save: a.save, loadout: a.loadout,
    containers: map?.containers.map(c => ({ id: c.id, runId: c.runId, kind: c.kind, name: c.name, x: c.x, y: c.y, inventory: c.inventory })),
    elapsed: b?.stamp.simulationTime, hp: b?.frame.hud.hp, mag: b?.frame.hud.weapon.mag, x: b?.frame.player.x, y: b?.frame.player.y, kills: raid?.kills,
    groundLoot: map?.loot.length, storage: localStorage.getItem(key) };
}, SAVE_KEY);
/**
 * On a slow runner (CI's software GL) the first frames after a mount, or after the camera jumps to a new spot, can be more
 * than 2 s apart, and the Runtime then stall-pauses the raid ("画面暂时停顿…"), as it would for a player; keys and the
 * action button then do nothing. Where a step needs the raid running, resume it through the pause panel (tap on a phone),
 * as a player would, and wait until it has stayed running for a few frames.
 */
async function running(page, touch = false) {
  for (let i = 0; i < 5; i++) {
    const now = await page.evaluate(() => ({ panel: window.__bincovSample.host.panel, phase: window.__bincovSample.host.lastBatch.frame.phase }));
    if (now.phase === 'running' && now.panel === null) {
      await frames(page, 3);
      if (await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.phase === 'running')) return;
      continue;
    }
    assert.equal(now.panel, 'pause', `the raid waits on ${now.panel}`);
    // Only the Runtime's own stall pause is resumed here; any other pause is a failure of the step.
    assert.ok(await page.evaluate(() => { const h = window.__bincovSample.host, seen = h.__stallSeen ?? 0, stalls = h.eventLog.filter(e => e.type === 'notice' && /^画面暂时停顿/.test(e.detail?.text ?? '') && e.seq > seen); if (!stalls.length) return false; h.__stallSeen = Math.max(...stalls.map(e => e.seq)); return true; }), 'the raid paused without the Runtime\'s stall notice');
    report.stallResumes = (report.stallResumes ?? 0) + 1; console.log('STALL: resumed a stall pause');
    const resume = page.locator('.coast-sample [data-do="resume"]');
    if (touch) await resume.tap(); else await resume.click();
    await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.phase === 'running', null, { timeout: 30000 });
  }
  throw new Error('the raid did not stay running');
}
/** Ghost-corner drag between two displayed grids of the raid panel. */
async function dragOn(page, source, uid, target, x, y) {
  const from = await page.locator(`.coast-sample [data-source="${source}"][data-uid="${uid}"]`).boundingBox(); assert.ok(from, `${uid} is on screen`);
  const to = await page.locator(`.coast-sample [data-grid="${target}"]`).evaluate((el, at) => {
    const r = el.getBoundingClientRect(), cell = Number(el.dataset.cell) * r.width / el.offsetWidth;
    return { x: r.left + at.x * cell + 6, y: r.top + at.y * cell + 6 };
  }, { x, y });
  await page.mouse.move(from.x + 6, from.y + 6); await page.mouse.down();
  await page.mouse.move(from.x + 22, from.y + 22, { steps: 3 }); await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up(); await frames(page, 2);
}

async function suite(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  const record = { viewport, steps: [], screenshots: [], errors: [], externalRequests: [], runIds: [] }; report.viewports.push(record);
  const context = await browser.newContext({ viewport, offline: true });
  context.on('request', r => { if (/^https?:/i.test(r.url())) record.externalRequests.push(r.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => record.errors.push(e.stack || e.message));
  page.on('console', m => { if (m.type() === 'error') record.errors.push(m.text()); });
  const action = name => page.locator(`[data-action="${name}"]`);
  const waitState = (state, timeout = 30000) => page.waitForFunction(s => window.__bincov?.app.state === s, state, { timeout });
  const snapshot = () => snapshotOf(page);
  // Automatic checkpoints legitimately update revision/time; compare the inventory
  // content in those commits rather than failing on unrelated frame progress.
  const participants = s => {
    const saved = JSON.parse(s.storage), raid = saved.expansion?.raid;
    return { loadout: s.loadout, containers: s.containers, save: s.save,
      persisted: { profile: saved.profile, loadout: raid?.loadout, containers: raid?.maps[raid.currentMap]?.containers } };
  };
  const screenshot = async name => {
    const path = resolve(out, `loot-${label}-${name}.png`); await page.screenshot({ path }); record.screenshots.push(path);
  };
  async function step(name, work) {
    const result = { name, status: 'running' }, start = performance.now(); record.steps.push(result);
    try {
      const detail = await work(); assert.deepEqual(record.errors, []); assert.deepEqual(record.externalRequests, []);
      result.status = 'passed'; if (detail !== undefined) result.detail = detail; console.log(`PASS ${label} · ${name}`);
    } catch (error) {
      result.status = 'failed'; result.error = error.stack;
      // Where the page stood when the step failed (a slow runner's timeouts otherwise say little).
      result.failureState = await page.evaluate(() => ({ state: window.__bincov.app.state, overlay: window.__bincov.app.overlay, storageError: window.__bincov.app.storageError,
        panel: window.__bincovSample?.host?.panel ?? null, phase: window.__bincovSample?.host?.lastBatch?.frame.phase ?? null,
        dialog: document.querySelector('.overlay h2, .coast-sample [data-panel] h2')?.textContent ?? null,
        events: window.__bincovSample?.host?.eventLog?.slice(-8).map(e => e.type + (e.detail?.text ? ':' + e.detail.text : e.detail?.reason ? ':' + e.detail.action + ':' + e.detail.reason : '')) ?? [] })).catch(() => null);
      console.log(JSON.stringify(result.failureState)); throw error;
    }
    finally { result.durationMs = Math.round(performance.now() - start); await writeReport(); }
  }
  /** Freeze the loot fixture's enemies. Authored program posts must retain their validated homes. */
  async function quiet() {
    await page.evaluate(() => {
      const { driver, host } = window.__bincovSample; driver.freezeAI(true);
      const raid = window.__bincov.saveSession.captureExpansion().raid;
      // placeEnemy also replaces home. Keep these frozen members at their native posts instead
      // of invalidating the next real SaveSession transaction (seed44 includes a checkpoint).
      const posts = new Set(raid.maps[raid.currentMap].enemies.filter(e => e.tactics?.version === 2
        && ['recovery', 'blockade'].includes(e.tactics.program.kind)).map(e => e.uid));
      for (const e of host.lastBatch.frame.actors) if (e.alive && !posts.has(e.uid)) driver.placeEnemy(e.uid, { x: 208, y: 1456 });
      driver.vitals({ hp: 100, bleeding: false, pollution: 0 });
    });
    await frames(page, 2);
  }
  /**
   * Fixture: a rested body before a deployment. After a death the 2.5D body keeps 1 health (the base heals it over real
   * minutes); on a slow runner the AI acts for a moment before quiet() can freeze it, so one blow would end the run before
   * the step starts. One validated session transaction, as the base's own recovery would write it.
   */
  async function rest() {
    const ok = await page.evaluate(() => {
      const s = window.__bincov.saveSession;
      if (!window.__bincov.app.expansion) return true;
      const ticket = s.prepareExpansionMutation(d => { Object.assign(d.expansion.body, { hp: 100, stamina: 100, pollution: 0, bleeding: false }); });
      return !!ticket && s.commitExpansionMutation(ticket) === 'committed';
    });
    assert.ok(ok, 'rested body fixture committed');
  }
  async function deploy(seed = 42) {
    await rest();
    await page.locator('#seed').fill(String(seed)); await action('deploy').click(); await waitState('run');
    await raidReady(page); await quiet(); await running(page);
    const s = await snapshot(), runId = s.loadout.runId;
    const all = await page.evaluate(() => Object.values(window.__bincov.saveSession.captureExpansion().raid.maps).flatMap(m => m.containers));
    assert.ok(!record.runIds.includes(runId), 'Each new deployment has a distinct run identity'); record.runIds.push(runId);
    assert.equal(all.filter(c => c.kind === 'corpse').length, 0, 'Prior-run corpses never enter a new deployment');
    assert.ok(all.every(c => c.runId === runId), 'All containers belong to the current run');
  }
  async function close() { if (await panel(page)) { await page.keyboard.press('Escape'); await waitPanel(page, null); } }
  /** One street crate holds `items`; bag and safe hold the given items; the clock is back at 10 s on a low tide. */
  async function fixture({ items = [item('crate-fuse', 'fuse')], bag = [], safe = [], x, y, index = 0 } = {}) {
    await close(); await quiet();
    const crate = await page.evaluate(({ items, bag, safe, x, y, index }) => {
      const a = window.__bincov.app, saves = window.__bincov.saveSession;
      const box = window.__bincovSample.host.lastBatch.frame.containers.filter(c => c.kind === 'crate')[index];
      if (!box) throw new Error('Seed did not generate the fixture crate');
      // Stand beside the crate where a body fits (the driver validates; the candidate below must pass the same check).
      if (x === undefined) for (const [dx, dy] of [[0, 12], [0, -12], [12, 0], [-12, 0], [0, 0], [0, 20], [0, -20], [20, 0], [-20, 0]]) {
        try { window.__bincovSample.driver.placePlayer({ x: box.x + dx, y: box.y + dy }, 0, 'coast'); x = box.x + dx; y = box.y + dy; break; } catch { /* blocked */ }
      }
      const ticket = saves.prepareExpansionMutation(draft => {
        const r = draft.expansion.raid, c = r.maps[r.currentMap].containers.find(c => c.id === box.id);
        c.inventory = { w: 6, h: 5, items }; r.loadout.bag.items = bag; r.loadout.safe.items = safe;
        // A pistol in hand is a gun instance (save v6): a factory one under a fixture uid.
        Object.assign(r.loadout, { weapon: 'pistol', weaponUid: 'fixture-pistol', gun: { parts: [], devices: { laser: false, light: false } }, ammo: 8, ammoRelief: 0, relief: false }); r.knife = false; r.reloadLeft = 0;
        r.player = { x: x ?? box.x, y: y ?? box.y + 12, rotation: -Math.PI / 2 };
        // Back before the warning when a step ran the clock to the tide; map clocks and the training window follow it.
        if (r.elapsed > 200) { r.elapsed = 10; for (const m of Object.values(r.maps)) m.localTime = Math.min(m.localTime, 10); r.training.motion.windowStarted = Math.min(r.training.motion.windowStarted, 10); }
        r.warned = false; r.tideChanged = false; r.highTide = r.initialHigh;
        Object.assign(draft.expansion.body, { hp: 100, pollution: 0, bleeding: false });
      });
      if (!ticket || saves.commitExpansionMutation(ticket) !== 'committed') throw new Error(`Fixture does not satisfy strict checkpoint validation: ${a.storageError}`);
      return { id: box.id, runId: a.loadout.runId };
    }, { items, bag, safe, x, y, index });
    await frames(page, 3); await running(page); return crate;
  }
  async function open(id) {
    await page.keyboard.press('e', { delay: 90 }); await waitPanel(page, 'loot');
    assert.equal((await snapshot()).context.containerId, id); await page.locator('.coast-sample [data-grid="container"]').waitFor();
  }
  const drag = (source, uid, target, x, y) => dragOn(page, source, uid, target, x, y);
  /**
   * Hold A, which leaves an open loot window (issue #26 F13), until the player has walked 8 px west of `x` (sprinting if
   * asked; the fixture crate's west side is open), then let go.
   */
  async function walkWest(x, sprint = false) {
    await page.keyboard.down('a');
    try {
      await waitPanel(page, null);
      await page.waitForFunction(([x, sprint]) => { const p = window.__bincovSample.host.lastBatch.frame.player; return p.x < x - 8 && (!sprint || p.state.sprinting); }, [x, sprint], { timeout: 15000 });
      return await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.player.state.sprinting);
    } finally { await page.keyboard.up('a'); }
  }
  async function failStorage(on) {
    await page.evaluate(({ on, key }) => {
      window.__lootRealWrite ??= Storage.prototype.setItem;
      if (window.__lootFaultListener) document.removeEventListener('pointerup', window.__lootFaultListener, true);
      if (!on) { Storage.prototype.setItem = window.__lootRealWrite; return; }
      window.__lootFailedWrites = 0;
      const arm = event => {
        if (!event.isTrusted || !document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-grid]')) return;
        document.removeEventListener('pointerup', arm, true);
        window.__lootStorageAtFault = localStorage.getItem(key);
        Storage.prototype.setItem = function (k, v) {
          if (k === key) { window.__lootFailedWrites++; throw new DOMException('Container quota fixture', 'QuotaExceededError'); }
          return window.__lootRealWrite.call(this, k, v);
        };
      };
      window.__lootFaultListener = arm; document.addEventListener('pointerup', arm, true);
    }, { on, key: SAVE_KEY });
  }
  /**
   * Point at a world spot once the camera has settled: it follows the player over about a second, which on a slow runner
   * is only a few frames, and a pointer placed earlier would aim where the target was on screen.
   */
  async function aim(x, y) {
    let p = await screenOf(page, { x, y });
    for (let i = 0; i < 40; i++) {
      await frames(page, 2);
      const now = await screenOf(page, { x, y });
      if (Math.hypot(now.x - p.x, now.y - p.y) < .5) break;
      p = now;
    }
    await page.mouse.move(p.x, p.y); await frames(page, 3);
  }
  /** Session candidate for state the driver does not set (a container's place or contents, ground loot). */
  const candidate = (fn, arg) => page.evaluate(({ fn, arg }) => {
    const saves = window.__bincov.saveSession, ticket = saves.prepareExpansionMutation(draft => new Function('draft', 'arg', fn)(draft, arg));
    if (!ticket || saves.commitExpansionMutation(ticket) !== 'committed') throw new Error(`Candidate rejected: ${window.__bincov.app.storageError}`);
  }, { fn: `return (${fn.toString()})(draft, arg);`, arg });
  try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs'); await action('enter').click(); await deploy();
    await step('25 enemies and original 60 loot entries remain conserved', async () => {
      const expected = seedLoot(42);
      const c = await page.evaluate(() => {
        const raid = window.__bincov.saveSession.captureExpansion().raid, maps = Object.values(raid.maps), total = items => items.reduce((sum, i) => sum + i.qty, 0);
        const crates = maps.flatMap(m => m.containers).filter(c => c.kind === 'crate'), ground = maps.flatMap(m => m.loot);
        return { enemies: raid.roster.length, ground: ground.length, crates: crates.length, liveUnits: total(ground) + crates.reduce((sum, c) => sum + total(c.inventory.items), 0),
          samples: raid.maps.coast.loot.filter(i => i.id === 'sample').length, ledgers: raid.maps.coast.loot.filter(i => i.id === 'ledger').length };
      });
      assert.equal(c.enemies, 25); assert.equal(expected.records, 60); assert.equal(c.crates, expected.crates); assert.ok(c.crates > 0 && c.crates <= 10);
      assert.equal(c.liveUnits, expected.units); assert.ok(c.samples > 0 && c.ledgers > 0); return { ...c, entries: expected.records, configuredUnits: expected.units };
    });
    await step('pointer crate ↔ bag and crate ↔ safe transfers use exact displayed cells', async () => {
      const c = await fixture({ items: [item('transfer-fuse', 'fuse', 2), item('transfer-pearl', 'pearl', 1, 1)] }); await open(c.id); await screenshot('crate-open');
      await drag('container', 'transfer-fuse', 'bag', 4, 4);
      assert.deepEqual((await snapshot()).loadout.bag.items.find(i => i.uid === 'transfer-fuse'), item('transfer-fuse', 'fuse', 2, 4, 4));
      await drag('bag', 'transfer-fuse', 'container', 3, 2);
      let s = await snapshot(); assert.equal(s.loadout.bag.items.length, 0);
      assert.deepEqual(s.containers.find(x => x.id === c.id).inventory.items.find(i => i.uid === 'transfer-fuse'), item('transfer-fuse', 'fuse', 2, 3, 2));
      await drag('container', 'transfer-pearl', 'safe', 1, 1); s = await snapshot(); assert.equal(s.save.safe.items.find(i => i.uid === 'transfer-pearl').qty, 1);
      await drag('safe', 'transfer-pearl', 'container', 5, 3); assert.equal((await snapshot()).save.safe.items.length, 0);
      await drag('container', 'transfer-fuse', 'container', 0, 3);
      assert.equal((await snapshot()).containers.find(x => x.id === c.id).inventory.items.find(i => i.uid === 'transfer-fuse').y, 3); await screenshot('crate-returned');
    });
    await step('stacks accept partial merges while multiple occupied targets and out-of-bounds shapes preserve items', async () => {
      const c = await fixture({ items: [item('stack-ammo', 'ammo9', 8), item('wide-gun', 'pistol', 1, 1), item('overflow-ammo', 'ammo9', 30, 3)], bag: [item('bag-ammo', 'ammo9', 10), item('overlap-blocker', 'fuse', 4, 1)] });
      await open(c.id); await drag('container', 'stack-ammo', 'bag', 0, 0); assert.equal((await snapshot()).loadout.bag.items.find(i => i.uid === 'bag-ammo').qty, 18);
      await drag('container', 'overflow-ammo', 'bag', 0, 0);
      assert.equal((await snapshot()).loadout.bag.items.find(i => i.uid === 'bag-ammo').qty, 40);
      assert.equal((await snapshot()).containers.find(i => i.id === c.id).inventory.items.find(i => i.uid === 'overflow-ammo').qty, 8);
      for (const [uid, x, y] of [['wide-gun', 0, 0], ['wide-gun', 5, 4]]) {
        const before = participants(await snapshot()); await drag('container', uid, 'bag', x, y); assert.deepEqual(participants(await snapshot()), before);
      }
    });
    await step('full inventory rejects a shape overlapping multiple items atomically', async () => {
      const bag = Array.from({ length: 30 }, (_, i) => item(`full-${i}`, 'fuse', 4, i % 6, Math.floor(i / 6)));
      const c = await fixture({ items: [item('full-incoming', 'pistol')], bag }); await open(c.id);
      const before = participants(await snapshot()); await drag('container', 'full-incoming', 'bag', 4, 4); assert.deepEqual(participants(await snapshot()), before); await screenshot('full-bag');
    });
    await step('swap rejects atomically when the original corner cannot fit the displaced gun in either orientation', async () => {
      const c = await fixture({ items: [item('corner-source', 'sample', 1, 5, 4)], bag: [item('corner-target', 'pistol')] }); await open(c.id);
      const before = participants(await snapshot()); await drag('container', 'corner-source', 'bag', 0, 0); assert.deepEqual(participants(await snapshot()), before);
    });
    await step('external selection exposes no direct use (a gun may be equipped, #26 F15); double-click picks up without using or equipping', async () => {
      const c = await fixture({ items: [item('external-medical', 'bandage'), item('external-gun', 'pistol', 1, 1)] }); await open(c.id);
      for (const uid of ['external-medical', 'external-gun']) {
        const before = await snapshot(), el = page.locator(`.coast-sample [data-source="container"][data-uid="${uid}"]`);
        const sourceItem = before.containers.find(box => box.id === c.id).inventory.items.find(i => i.uid === uid);
        await el.click(); assert.equal(await page.locator('.coast-sample [data-do="inv-use"]').count(), 0);
        assert.equal(await page.locator('.coast-sample [data-do="inv-equip"]').count(), uid === 'external-gun' ? 1 : 0);
        assert.equal(await page.locator('.coast-sample [data-do="inv-quick"]').count(), 1); await el.dblclick(); await frames(page, 2);
        const after = await snapshot(), saved = JSON.parse(after.storage).expansion.raid;
        assert.equal(after.containers.find(box => box.id === c.id).inventory.items.some(i => i.uid === uid), false);
        assert.deepEqual(after.loadout.bag.items.filter(i => i.uid === uid).map(i => ({ id: i.id, qty: i.qty })), [{ id: sourceItem.id, qty: sourceItem.qty }]);
        assert.equal(after.loadout.weapon, before.loadout.weapon, 'Picking up a gun does not equip it');
        assert.equal(after.hp, before.hp, 'Picking up medical loot does not consume it');
        assert.equal(after.mag, before.mag); assert.deepEqual(after.loadout.safe, before.loadout.safe);
        assert.deepEqual(saved.loadout, after.loadout); assert.deepEqual(saved.maps[saved.currentMap].containers, after.containers);
      } await screenshot('external-details');
    });
    await step('reopening preserves remaining loot and permits an empty container', async () => {
      const c = await fixture({ items: [item('remaining-a', 'wire'), item('remaining-b', 'fuse', 1, 1)] }); await open(c.id);
      await drag('container', 'remaining-a', 'bag', 0, 0); await close(); await open(c.id); assert.equal(await page.locator('.coast-sample [data-source="container"][data-uid]').count(), 1);
      await drag('container', 'remaining-b', 'bag', 1, 0); await close(); await open(c.id); assert.equal(await page.locator('.coast-sample [data-source="container"][data-uid]').count(), 0);
      assert.equal((await snapshot()).loadout.bag.items.length, 2); await screenshot('empty-crate');
    });
    await step('Escape, Tab, E, close button and map clear loot context', async () => {
      const c = await fixture();
      for (const key of ['Escape', 'Tab', 'e', 'button', 'm']) {
        await open(c.id); if (key === 'button') await page.locator('.coast-sample .cs-inv-head [data-do="close"]').click(); else await page.keyboard.press(key);
        await waitPanel(page, key === 'm' ? 'map' : null); assert.equal((await snapshot()).context, null);
        if (key === 'm') { await page.keyboard.press('m'); await waitPanel(page, null); }
      }
    });
    await step('pointer drag previews exact legal and illegal shapes; blur cancels the pending transfer', async () => {
      const c = await fixture({ items: [item('preview-gun', 'pistol')] }); await open(c.id);
      const before = participants(await snapshot());
      const source = await page.locator('.coast-sample [data-uid="preview-gun"]').boundingBox();
      const grid = await page.locator('.coast-sample [data-grid="bag"]').boundingBox();
      const cell = grid.width / 6;
      // The preview follows the dragged item's top-left corner: grab 6 px inside it, hover 6 px inside the target cell.
      await page.mouse.move(source.x + 6, source.y + 6); await page.mouse.down();
      await page.mouse.move(source.x + 22, source.y + 22, { steps: 4 });
      await page.mouse.move(grid.x + 6, grid.y + 6, { steps: 8 });
      await page.locator('.coast-sample [data-grid="bag"] .drop-preview:not(.invalid)').waitFor();
      await screenshot('drag-valid');
      await page.mouse.move(grid.x + 5 * cell + 6, grid.y + 4 * cell + 6, { steps: 6 });
      await page.locator('.coast-sample [data-grid="bag"] .drop-preview.invalid').waitFor();
      await screenshot('drag-invalid');
      // A lifecycle fixture exercises the same blur handler as switching windows.
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
      await waitPanel(page, 'pause'); assert.equal((await snapshot()).context, null);
      assert.deepEqual(participants(await snapshot()), before); await close();
    });
    await step('loot suppresses fire, reload, quick-use and sprint while clock and AI continue', async () => {
      const c = await fixture({ bag: [item('input-bandage', 'bandage', 2), item('input-ammo', 'ammo9', 10, 1)] }); await open(c.id);
      // A patrolling club enemy far down the road shows that the AI keeps running behind the panel.
      const scav = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(e => e.alive && e.kind === 'scav').uid);
      // A long patrol leg: at 5 s the setup frames of a slow runner could end it, and the reset (3-7 s) left the timer above
      // the value read below, so the decrease this step waits for never came.
      await candidate((draft, uid) => { const r = draft.expansion.raid, e = r.maps[r.currentMap].enemies.find(e => e.uid === uid); e.timer = 60; e.state = 'patrol'; }, scav);
      await drive(page, 'vitals', { hp: 70 }); await drive(page, 'magazine', 3); await drive(page, 'freezeAI', false); await frames(page, 2);
      const timer = () => page.evaluate(uid => { const r = window.__bincov.saveSession.captureExpansion().raid; return r.maps[r.currentMap].enemies.find(e => e.uid === uid).timer; }, scav);
      const before = await snapshot(), enemyBefore = await timer();
      // A movement key leaves loot (issue #26 F13, next step); Shift, R, Q and the left button stay with the panel.
      await page.keyboard.down('Shift'); await page.keyboard.press('r'); await page.keyboard.press('q'); await page.mouse.down();
      // At least 0.35 s of world time and 0.3 s off the enemy's patrol timer with Shift and the button held. The two were read
      // in separate round trips, and on a slow runner a whole frame can fall between them, so wait on both.
      await page.waitForFunction(([t, uid, timer]) => {
        const r = window.__bincov.saveSession.captureExpansion().raid;
        return window.__bincovSample.host.lastBatch.stamp.simulationTime > t && r.maps[r.currentMap].enemies.find(e => e.uid === uid).timer < timer - .3;
      }, [before.elapsed + .35, scav, enemyBefore], { timeout: 15000, polling: 100 }).catch(() => {});
      const after = await snapshot(); assert.equal(after.x, before.x); assert.equal(after.y, before.y); assert.equal(after.mag, before.mag); assert.equal(after.hp, before.hp);
      assert.equal(after.panel, 'loot'); assert.deepEqual(after.loadout, before.loadout); assert.ok(after.elapsed > before.elapsed + .3);
      assert.ok(await timer() < enemyBefore - .3, 'enemy AI keeps running while the player loots');
      // Six published frames with Shift and the left button still held: closing the panel does not hand them to the raid.
      await page.keyboard.press('Escape'); await waitPanel(page, null); await frames(page, 6);
      const held = await snapshot(); assert.equal(held.x, before.x); assert.equal(held.mag, before.mag);
      await page.mouse.up(); await page.keyboard.up('Shift'); await quiet();
    });
    await step('a movement key leaves loot at once and walks; a key held into the window, typing, drags and other panels keep their rules (issue #26 F13)', async () => {
      const c = await fixture({ items: [item('f13-drag', 'fuse')], bag: [item('f13-ammo', 'ammo9', 10)] });
      // Walking into the crate with W held, E opens it: that W and its repeats (Playwright sends a second down as one)
      // neither leave the window nor walk, and Esc hands no held W to the raid.
      await page.keyboard.down('w');
      try {
        await page.keyboard.press('e', { delay: 30 }); await waitPanel(page, 'loot');
        assert.equal((await snapshot()).context?.containerId, c.id);
        const held = await snapshot();
        for (let i = 0; i < 3; i++) { await page.keyboard.down('w'); await frames(page, 2); }
        let s = await snapshot(); assert.equal(s.panel, 'loot'); assert.deepEqual([s.x, s.y], [held.x, held.y]);
        await page.keyboard.press('Escape'); await waitPanel(page, null); await frames(page, 6);
        s = await snapshot(); assert.deepEqual([s.x, s.y], [held.x, held.y], 'W held into the loot window walked after it closed');
      } finally { await page.keyboard.up('w'); }
      // A fresh press closes the window at once and walks while held; letting go stops the walk.
      await open(c.id);
      const kept = participants(await snapshot()), start = await snapshot();
      await walkWest(start.x);
      assert.equal((await snapshot()).context, null);
      await frames(page, 3); const stopped = await snapshot(); await frames(page, 6);
      assert.equal((await snapshot()).x, stopped.x, 'releasing A stops the walk');
      assert.deepEqual(participants(await snapshot()), kept);
      // A Shift held before entry stays suppressed: the A event's shiftKey is not a new Shift press (#60 D8).
      await fixture({ items: [item('f13-drag', 'fuse')], bag: [item('f13-ammo', 'ammo9', 10)] });
      await page.keyboard.down('Shift');
      try {
        await open(c.id);
        assert.equal(await walkWest((await snapshot()).x), false, 'leaving loot must not revive the old held Shift');
      } finally { await page.keyboard.up('Shift'); }
      // Shift pressed in the window makes the escape a sprint.
      await fixture({ items: [item('f13-drag', 'fuse')], bag: [item('f13-ammo', 'ammo9', 10)] }); await open(c.id);
      await page.keyboard.down('Shift');
      try { await walkWest((await snapshot()).x, true); } finally { await page.keyboard.up('Shift'); }
      // Typing in the split count stays typing; Esc then leaves the field and the window.
      await fixture({ items: [item('f13-drag', 'fuse')], bag: [item('f13-ammo', 'ammo9', 10)] }); await open(c.id);
      assert.match(await page.locator('.coast-sample .cs-inv-head .cs-sub').innerText(), /WASD/, 'the loot window names the quick way out');
      await page.locator('.coast-sample [data-source="bag"][data-uid="f13-ammo"]').click();
      await page.locator('.coast-sample [data-split]').focus();
      const typing = await snapshot(); await page.keyboard.press('w'); await page.keyboard.press('a'); await frames(page, 4);
      let s = await snapshot(); assert.equal(s.panel, 'loot'); assert.deepEqual([s.x, s.y], [typing.x, typing.y]);
      await page.keyboard.press('Escape'); await waitPanel(page, null);
      // Mid-drag the drag is cancelled with the window: nothing moves, and the held button fires no shot afterwards.
      await open(c.id);
      const dragging = await snapshot(), before = participants(dragging), dragFrom = await page.locator('.coast-sample [data-uid="f13-drag"]').boundingBox();
      const bag = await page.locator('.coast-sample [data-grid="bag"]').boundingBox();
      await page.mouse.move(dragFrom.x + 6, dragFrom.y + 6); await page.mouse.down();
      try {
        await page.mouse.move(dragFrom.x + 22, dragFrom.y + 22, { steps: 4 }); await page.mouse.move(bag.x + 6, bag.y + 6, { steps: 6 });
        await page.locator('.coast-sample .cs-ghost').waitFor();
        await walkWest(dragging.x);
        assert.equal(await page.locator('.coast-sample .cs-ghost, .coast-sample .drop-preview').count(), 0, 'no ghost or preview outlives the window');
      } finally { await page.mouse.up(); }
      await frames(page, 3); s = await snapshot();
      assert.deepEqual(participants(s), before, 'a cancelled drag moves nothing'); assert.equal(s.mag, dragging.mag, 'the held button fires no shot');
      // The bag and the map keep their keys: W neither closes them nor walks.
      for (const [key, kind] of [['Tab', 'inventory'], ['m', 'map']]) {
        const at = await snapshot(); await page.keyboard.press(key); await waitPanel(page, kind);
        await page.keyboard.press('w'); await frames(page, 4);
        s = await snapshot(); assert.equal(s.panel, kind); assert.deepEqual([s.x, s.y], [at.x, at.y]);
        await page.keyboard.press('Escape'); await waitPanel(page, null);
      }
    });
    await step('actual enemy damage keeps loot open; a movement key gets the player out (issue #26 F13)', async () => {
      const c = await fixture(); await open(c.id);
      await page.evaluate(() => {
        const { driver, host } = window.__bincovSample, f = host.lastBatch.frame, e = f.actors.find(e => e.alive && e.kind === 'scav');
        driver.placeEnemy(e.uid, { x: f.player.x, y: f.player.y }); driver.freezeAI(false);
      });
      await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.hud.hp < 100); assert.equal((await snapshot()).panel, 'loot'); await screenshot('under-attack');
      await walkWest((await snapshot()).x); assert.equal((await snapshot()).context, null); await quiet();
    });
    await step('invalid range and rising tide close external inventory', async () => {
      const c = await fixture(); await open(c.id);
      // Step 200 px away (the first offset where a body fits): out of reach, the Runtime closes the source.
      await page.evaluate(() => {
        const { driver, host } = window.__bincovSample, p = host.lastBatch.frame.player;
        for (const [dx, dy] of [[200, 0], [-200, 0], [0, 200], [0, -200]]) { try { driver.placePlayer({ x: p.x + dx, y: p.y + dy }, 0, 'coast'); return; } catch { /* blocked */ } }
        throw new Error('No free spot 200 px from the crate');
      });
      await waitPanel(page, null); assert.equal((await snapshot()).context, null);
      await close(); await quiet();
      // A corpse in the red-tide strip: open at low tide, then the tide comes in and floods it.
      const flooded = await page.evaluate(() => {
        const { driver, host } = window.__bincovSample, e = host.lastBatch.frame.actors.find(e => e.alive), at = { x: 63 * 32 + 16, y: 10 * 32 + 16 };
        driver.placeEnemy(e.uid, at); driver.kill(e.uid); driver.placePlayer(at, 0, 'coast');
        return { id: `corpse-${e.uid}` };
      });
      await frames(page, 3); assert.equal((await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.highTide)), false); await open(flooded.id);
      await drive(page, 'clock', 299.9); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.highTide); await waitPanel(page, null); assert.equal((await snapshot()).context, null);
    });
    await step('failed writes roll back both directions and safe checkpoints; retry commits once', async () => {
      for (const destination of ['bag', 'safe']) {
        const uid = `failure-${destination}`, c = await fixture({ items: [item(uid, 'pearl')] }); await open(c.id);
        for (const [source, target] of [['container', destination], [destination, 'container']]) {
          const before = participants(await snapshot()); await failStorage(true); await drag(source, uid, target, 0, 0);
          await waitPanel(page, 'pause'); await page.locator('.coast-sample [data-do="retry-save"]').waitFor();
          // The save-error pause keeps movement keys: W neither resumes the raid nor walks (F13 is for the loot window only).
          const paused = await snapshot(); await page.keyboard.press('w'); await frames(page, 3);
          const still = await snapshot(); assert.equal(still.panel, 'pause'); assert.deepEqual([still.x, still.y], [paused.x, paused.y]);
          assert.ok(await page.evaluate(() => window.__lootFailedWrites) > 0, 'The trusted pointer release reached the failing session write');
          assert.equal((await snapshot()).storage, await page.evaluate(() => window.__lootStorageAtFault), 'Failed transaction leaves exact session bytes untouched');
          assert.deepEqual(participants(await snapshot()), before); assert.equal((await snapshot()).context, null);
          await failStorage(false); await page.locator('.coast-sample [data-do="retry-save"]').click(); await waitPanel(page, null);
          await open(c.id); assert.deepEqual(participants(await snapshot()), before, 'Recovery commits the rolled-back inventory, not the rejected transfer');
          await drag(source, uid, target, 0, 0); const after = await snapshot();
          const all = [...after.loadout.bag.items, ...after.loadout.safe.items, ...after.containers.flatMap(c => c.inventory.items)]; assert.equal(all.filter(i => i.uid === uid).length, 1);
          const targetItems = target === 'container' ? after.containers.find(x => x.id === c.id).inventory.items : after.loadout[target].items;
          assert.ok(targetItems.some(i => i.uid === uid)); assert.deepEqual(after.save.safe, after.loadout.safe);
        }
      }
    });
    await step('a held pointer drag cannot mutate a new source after the old context closes', async () => {
      const c = await fixture({ items: [item('stale-drag', 'sample')] }); await open(c.id);
      const source = await page.locator('.coast-sample [data-uid="stale-drag"]').boundingBox();
      await page.mouse.move(source.x+6, source.y+6); await page.mouse.down(); await page.mouse.move(source.x+30,source.y+20,{steps:4});
      await page.keyboard.press('Tab'); await waitPanel(page, null);
      const other = await fixture({ items: [item('other-container', 'wire')], bag: [item('other-bag-item', 'sample')], index: 1 }); await open(other.id);
      const before = participants(await snapshot()), grid = await page.locator('.coast-sample [data-grid="container"]').boundingBox();
      await page.mouse.move(grid.x+12,grid.y+12); await page.mouse.up(); await frames(page, 2); assert.deepEqual(participants(await snapshot()), before);
    });
    await step('scattered ground loot still uses immediate E pickup', async () => {
      await close(); await quiet();
      const spot = { x: 900, y: 784 };
      assert.ok(!(await page.evaluate(p => window.__bincovSample.host.lastBatch.frame.containers.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 48), spot)), 'no container in reach of the spot');
      await candidate((draft, p) => {
        const r = draft.expansion.raid, l = r.maps[r.currentMap].loot.find(l => l.id === 'sample');
        Object.assign(l, p); r.loadout.bag.items = []; r.player = { ...p, rotation: 0 };
      }, spot);
      await frames(page, 3);
      const before = (await snapshot()).groundLoot;
      await page.keyboard.press('e', { delay: 90 }); await page.waitForFunction(() => window.__bincov.app.loadout.bag.items.some(i => i.id === 'sample'));
      const after = await snapshot(); assert.equal(after.panel, null); assert.equal(after.context, null); assert.equal(after.groundLoot, before - 1);
    });
    await step('real kill produces one searchable corpse; repeated damage never generates another', async () => {
      await quiet();
      await drive(page, 'placePlayer', { x: 700, y: 784 }, 0, 'coast'); await drive(page, 'weapon', 'pistol');
      const scav = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.actors.find(e => e.alive && e.kind === 'scav').uid);
      await drive(page, 'placeEnemy', scav, { x: 820, y: 784 }, 1);
      const before = await page.evaluate(() => { const r = window.__bincov.saveSession.captureExpansion().raid, m = r.maps[r.currentMap];
        return { corpses: m.containers.filter(c => c.kind === 'corpse').length, ground: m.loot.length, kills: r.kills }; });
      await page.waitForTimeout(1200); await running(page); await aim(820, 784); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
      await page.waitForFunction(expected => window.__bincov.saveSession.captureExpansion().raid.kills === expected, before.kills + 1);
      const corpse = await page.evaluate(uid => {
        const { driver } = window.__bincovSample; driver.kill(uid);
        const r = window.__bincov.saveSession.captureExpansion().raid, m = r.maps[r.currentMap], c = m.containers.filter(c => c.kind === 'corpse').at(-1);
        driver.placePlayer({ x: c.x, y: c.y }, 0, 'coast');
        return { id: c.id, count: m.containers.filter(c => c.kind === 'corpse').length, ground: m.loot.length, kills: r.kills, items: c.inventory.items.length };
      }, scav);
      assert.equal(corpse.count, before.corpses + 1); assert.equal(corpse.ground, before.ground); assert.equal(corpse.kills, before.kills + 1); assert.ok(corpse.items > 0);
      await frames(page, 3); await open(corpse.id); await screenshot('corpse'); const uid = await page.locator('.coast-sample [data-source="container"][data-uid]').first().getAttribute('data-uid');
      await drag('container', uid, 'bag', 3, 3); assert.ok((await snapshot()).loadout.bag.items.some(i => i.uid === uid)); return corpse;
    });
    await step('three refreshes restore remaining crate/corpse loot and never duplicate taken items', async () => {
      const c = await fixture({ items: [item('reload-bag', 'watch'), item('reload-safe', 'pearl', 1, 1), item('reload-remaining', 'wire', 1, 2)] });
      const corpseId = await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.containers.find(c => c.kind === 'corpse').id);
      await candidate((draft, id) => {
        const r = draft.expansion.raid, corpse = r.maps[r.currentMap].containers.find(c => c.id === id);
        corpse.x = 900; corpse.y = 784;
        corpse.inventory.items = [{ uid: 'corpse-taken', id: 'fuse', qty: 1, x: 0, y: 0 }, { uid: 'corpse-remaining', id: 'bandage', qty: 1, x: 1, y: 0 }];
        r.player = { x: 900, y: 784, rotation: 0 };
      }, corpseId);
      await frames(page, 3);
      await open(corpseId); await drag('container', 'corpse-taken', 'bag', 2, 0); await close();
      const crate = (await snapshot()).containers.find(x => x.id === c.id);
      await drive(page, 'placePlayer', { x: crate.x, y: crate.y + 12 }, -Math.PI / 2, 'coast'); await frames(page, 3); await open(c.id);
      await drag('container', 'reload-bag', 'bag', 0, 0); await drag('container', 'reload-safe', 'safe', 0, 0);
      const expected = await snapshot(), beforeRuns = expected.save.stats.runs;
      for (let i = 0; i < 3; i++) {
        await page.reload(); await action('enter').waitFor();
        assert.equal((await snapshot()).save.stats.runs, beforeRuns, 'Refresh does not redeploy or settle');
        await action('enter').click(); await waitState('run'); await raidReady(page); await waitPanel(page, 'pause'); await drive(page, 'freezeAI', true);
        const recovered = await snapshot();
        assert.equal(recovered.context, null); assert.equal(recovered.loadout.runId, expected.loadout.runId);
        assert.deepEqual(recovered.containers, expected.containers); assert.deepEqual(recovered.loadout, expected.loadout);
        assert.deepEqual(recovered.save.stats, expected.save.stats);
        const all = [...recovered.loadout.bag.items, ...recovered.loadout.safe.items, ...recovered.containers.flatMap(c => c.inventory.items)];
        for (const uid of ['reload-bag', 'reload-safe', 'reload-remaining', 'corpse-taken', 'corpse-remaining']) assert.equal(all.filter(i => i.uid === uid).length, 1, `${uid} exists exactly once after refresh ${i + 1}`);
        assert.equal(recovered.containers.filter(c => c.id === corpseId).length, 1);
        await close(); await running(page); await open(c.id);
        assert.equal(await page.locator('.coast-sample [data-source="container"][data-uid]').count(), 1);
      }
      await screenshot('restored-crate');
    });
    await step('a real second-window storage event closes loot and protects the newer record', async () => {
      // Isolate storage-event handling from the periodic checkpoint: stop the raid renderer's ticker (no frames, no
      // advances, no checkpoints) and keep loot open, so the real event must clear its context.
      await page.evaluate(() => window.__bincovSample.host.app.ticker.stop());
      const before = await snapshot();
      assert.equal(before.panel, 'loot');
      assert.ok(before.context);
      const other = await context.newPage();
      try {
        await other.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
        await other.waitForFunction(() => window.__bincov);
        assert.equal(await other.evaluate(() => window.__bincov.app.storageOK), false, 'The second game page cannot take ownership');
        assert.deepEqual((await snapshot()).context, before.context, 'Loot stays open until the real storage event');
        const winner = await other.evaluate(key => {
          // Simulate an older client that does not obey the current page lock.
          const value = JSON.parse(localStorage.getItem(key)); value.revision++;
          const bytes = JSON.stringify(value); localStorage.setItem(key, bytes); return bytes;
        }, SAVE_KEY);
        await page.waitForFunction(() => window.__bincov.app.conflict);
        assert.equal((await snapshot()).elapsed, before.elapsed, 'No periodic checkpoint can race the old-client write');
        await page.evaluate(() => window.__bincovSample.host.app.ticker.start());
        await page.waitForFunction(() => window.__bincovSample.host.services.lootContext() === null);
        const after = await snapshot(); assert.equal(after.context, null);
        assert.deepEqual(after.loadout, before.loadout); assert.equal(after.storage, winner);
      } finally { await other.close(); }
      await page.reload(); await action('enter').click();
      await raidReady(page); await waitPanel(page, 'pause');
      assert.deepEqual((await snapshot()).loadout, before.loadout);
    });
    await step('death while looting closes context, loses bag loot and retains safe loot', async () => {
      const c = await fixture({ items: [item('death-bag', 'wire'), item('death-safe', 'sample', 1, 1)] }); await open(c.id);
      await drag('container', 'death-bag', 'bag', 0, 0); await drag('container', 'death-safe', 'safe', 0, 0);
      await page.evaluate(() => {
        const { driver, host } = window.__bincovSample, f = host.lastBatch.frame, e = f.actors.find(e => e.alive && e.kind === 'scav');
        driver.vitals({ hp: 1 }); driver.placeEnemy(e.uid, { x: f.player.x, y: f.player.y }); driver.freezeAI(false);
      });
      await waitState('result', 60000); await page.waitForFunction(() => !document.querySelector('.coast-sample'), null, { timeout: 30000 });
      const s = await snapshot(); assert.equal(s.context, null); assert.equal(s.save.lastResult.outcome, 'death'); assert.equal(s.save.bag.items.length, 0);
      assert.ok(s.save.safe.items.some(i => i.uid === 'death-safe')); await screenshot('death-result');
    });
    await step('real three-second extraction keeps dragged container loot', async () => {
      await action('return').click(); await waitState('hideout'); await deploy(44); const c = await fixture({ items: [item('extract-loot', 'ledger')] }); await open(c.id); await drag('container', 'extract-loot', 'bag', 0, 0); await close();
      const exit = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.exits[0].at);
      await drive(page, 'placePlayer', exit, 0, 'coast'); await page.waitForTimeout(600); await running(page);
      const started = performance.now(); await page.keyboard.down('e'); try { await waitState('result'); } finally { await page.keyboard.up('e'); }
      await page.waitForFunction(() => !document.querySelector('.coast-sample'), null, { timeout: 30000 });
      assert.ok(performance.now() - started >= 2500); const s = await snapshot(); assert.equal(s.context, null); assert.equal(s.save.lastResult.outcome, 'extract'); assert.ok(s.save.bag.items.some(i => i.uid === 'extract-loot'));
    });
    await step('timeout while looting closes context and resolves as failure', async () => {
      await action('return').click(); await waitState('hideout'); await deploy(45); const c = await fixture(); await open(c.id);
      await drive(page, 'clock', 599.99); await waitState('result'); await page.waitForFunction(() => !document.querySelector('.coast-sample'), null, { timeout: 30000 });
      const s = await snapshot(); assert.equal(s.context, null); assert.equal(s.save.lastResult.outcome, 'timeout');
      assert.equal(s.save.stats.runs, 3); assert.equal(s.save.stats.extracts, 1); assert.equal(new Set(record.runIds).size, 3);
      await page.reload(); await action('enter').waitFor(); assert.deepEqual((await snapshot()).save, s.save, 'The three terminal results survive reload without an extra award');
    });
  } finally {
    if (record.steps.some(s => s.status === 'failed')) await screenshot('failure').catch(() => {});
    await failStorage(false).catch(() => {}); await context.close();
  }
}
async function mobileSuite() {
  const viewport = { width: 844, height: 390 }, record = { viewport, mode: 'touch', steps: [], screenshots: [], errors: [], externalRequests: [] };
  report.viewports.push(record);
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, offline: true });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => record.errors.push(error.message));
  context.on('request', request => { if (/^https?:/.test(request.url())) record.externalRequests.push(request.url()); });
  const action = name => page.locator(`[data-action="${name}"]`);
  const state = async () => { const s = await snapshotOf(page); return { panel: s.panel, lootContext: s.context, loadout: s.loadout, containers: s.containers }; };
  const check = async (name, work) => {
    const step = { name, status: 'running' }; record.steps.push(step);
    try { await work(); assert.deepEqual(record.errors, []); assert.deepEqual(record.externalRequests, []); step.status = 'passed'; console.log('PASS touch · ' + name); }
    catch (error) { step.status = 'failed'; step.error = error.stack; throw error; }
    finally { await writeReport(); }
  };
  const shot = async name => { const path = resolve(out, `loot-844x390-${name}.png`); await page.screenshot({ path }); record.screenshots.push(path); };
  // Touch placement: tap the item, tap 移动格位, tap the target cell.
  const move = async (source, uid, target, x, y) => {
    await page.locator(`.coast-sample [data-source="${source}"][data-uid="${uid}"]`).tap();
    await page.locator('.coast-sample [data-do="inv-place"]').tap();
    const grid = page.locator(`.coast-sample [data-grid="${target}"]`), cell = await grid.getAttribute('data-cell');
    await grid.tap({ position: { x: (x + .4) * Number(cell), y: (y + .4) * Number(cell) } }); await frames(page, 2);
  };
  try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
    await action('enter').tap(); await page.locator('#seed').fill('42'); await action('deploy').tap();
    await raidReady(page);
    const id = await page.evaluate(() => {
      const a = window.__bincov.app, saves = window.__bincov.saveSession, { driver, host } = window.__bincovSample, f = host.lastBatch.frame;
      driver.freezeAI(true); for (const e of f.actors) if (e.alive) driver.placeEnemy(e.uid, { x: 208, y: 1456 });
      const box = f.containers.find(c => c.kind === 'crate');
      const ticket = saves.prepareExpansionMutation(draft => {
        const r = draft.expansion.raid, c = r.maps[r.currentMap].containers.find(c => c.id === box.id);
        r.player = { x: box.x, y: box.y + 12, rotation: -Math.PI / 2 }; r.loadout.bag.items = []; r.loadout.safe.items = [];
        c.inventory.items = [{ uid: 'touch-fuse', id: 'fuse', qty: 2, x: 0, y: 0 }];
      });
      if (!ticket || saves.commitExpansionMutation(ticket) !== 'committed') throw new Error(a.storageError);
      return box.id;
    });
    await frames(page, 3); await running(page, true);
    await check('trusted touch interaction opens the same live source and character grids', async () => {
      await page.locator('.coast-sample [data-act]').tap(); await waitPanel(page, 'loot');
      assert.equal((await state()).lootContext.containerId, id);
      assert.doesNotMatch(await page.locator('.coast-sample .cs-inv-head .cs-sub').innerText(), /WASD/, 'the touch loot window names no keys');
      const b = await page.locator('.coast-sample .cs-inv-head [data-do="close"]').boundingBox();
      assert.ok(b && b.x >= 0 && b.x + b.width <= viewport.width && b.y >= 0 && b.y + b.height <= viewport.height);
      await shot('open');
    });
    await check('select and tap transfers only to the chosen backpack cell', async () => {
      await move('container', 'touch-fuse', 'bag', 1, 1);
      assert.deepEqual((await state()).loadout.bag.items, [item('touch-fuse', 'fuse', 2, 1, 1)]);
    });
    await check('touch safe and return operations preserve the whole stack', async () => {
      await move('bag', 'touch-fuse', 'safe', 1, 1);
      assert.deepEqual((await state()).loadout.safe.items, [item('touch-fuse', 'fuse', 2, 1, 1)]);
      await move('safe', 'touch-fuse', 'container', 2, 1);
      const s = await state(); assert.equal(s.loadout.safe.items.length, 0);
      assert.deepEqual(s.containers.find(c => c.id === id).inventory.items, [item('touch-fuse', 'fuse', 2, 2, 1)]);
      await shot('returned');
    });
    await check('touch close and reload retain container contents and clear selection', async () => {
      const before = await state(); await page.locator('.coast-sample .cs-inv-head [data-do="close"]').tap(); await waitPanel(page, null);
      assert.equal((await state()).lootContext, null);
      await page.reload(); await action('enter').tap();
      await raidReady(page); await waitPanel(page, 'pause');
      assert.deepEqual((await state()).containers, before.containers);
    });
  } finally {
    if (record.steps.some(s => s.status === 'failed')) await shot('failure').catch(() => {});
    await context.close();
  }
}
async function legacySuite(file) {
  const record = { mode: 'actual-old-main', steps: [], errors: [] }; report.viewports.push(record);
  let context, page;
  const open = async (path, bytes) => {
    context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
    if (bytes) await context.addInitScript(({ key, bytes }) => { localStorage.setItem(key, bytes); }, { key: SAVE_KEY, bytes });
    page = await context.newPage(); page.on('pageerror', error => record.errors.push(error.message));
    await page.goto(pathToFileURL(resolve(path)).href + '?test=1&entry=tabs');
  };
  const action = name => page.locator('[data-action="' + name + '"]');
  const step = { name: 'actual old main restores loose loot once; old HTML refuses the container world without overwrite', status: 'running' }; record.steps.push(step);
  try {
    // The old main client (its own Phaser raid view) creates a coast-v1 raid.
    await open(file);
    await action('enter').click(); await page.locator('#seed').fill('42'); await action('deploy').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active); await page.keyboard.press('Escape');
    const oldBytes = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), old = JSON.parse(oldBytes);
    assert.equal(old.raid.worldVersion, 'coast-v1'); assert.equal(old.raid.loot.length, 60); await context.close();
    // The current build migrates it and resumes it on the 2.5D view.
    await open('dist/index.html', oldBytes);
    await action('enter').click(); await raidReady(page);
    const nextBytes = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), migrated = JSON.parse(nextBytes);
    assert.equal(migrated.raid.worldVersion, 'coast-v2'); assert.deepEqual(migrated.raid.containers, []);
    // The migration only adds the gun fields (save v6): without them the loose loot and the loadout are the old ones.
    const withoutGuns = value => JSON.parse(JSON.stringify(value), (key, inner) => key === 'gun' || key === 'weaponUid' ? undefined : inner);
    assert.deepEqual(withoutGuns(migrated.raid.loot), old.raid.loot); assert.deepEqual(withoutGuns(migrated.raid.loadout), old.raid.loadout); await context.close();
    await open(file, nextBytes); await page.getByRole('heading', { name: '暂时无法打开存档' }).waitFor();
    const rejected = await page.evaluate(key => ({ ok: window.__bincov.app.storageOK, bytes: localStorage.getItem(key) }), SAVE_KEY);
    assert.equal(rejected.ok, false); assert.equal(rejected.bytes, nextBytes);
    assert.deepEqual(record.errors, []); step.status = 'passed'; console.log('PASS ' + step.name);
  } catch (error) { step.status = 'failed'; step.error = error.stack; throw error; }
  finally { await context?.close(); await writeReport(); }
}
try {
  await suite({ width: 1280, height: 720 }); await suite({ width: 1920, height: 1080 }); await mobileSuite();
  if (process.env.BINCOV_LOOT_LEGACY_HTML) await legacySuite(process.env.BINCOV_LOOT_LEGACY_HTML);
  report.status = 'passed';
}
catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeReport(); await browser.close(); }
