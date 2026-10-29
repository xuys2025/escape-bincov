import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls } from './stall-resume.mjs';
import { raidReady, waitPanel } from './raid-view.mjs';

const out = resolve('test-results'); await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), methodology: 'Offline built HTML on the 2.5D raid host; native region selector, keyboard/touch actions, storage fault and reload. Explicit fixtures position the player at named anchors through the ?test=1 driver, register one validated pursuit with a real map route and normal frame progression, set indoor clock boundaries and freeze enemy AI (pursuits still advance) to isolate the indoor warning/tide/terminal transaction; this does not claim natural travel, another unaccelerated 600-second run or human balance.', htmlSha256: createHash('sha256').update(await readFile(resolve('dist/index.html'))).digest('hex'), steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
await resumeStalls(context);
context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
const action = name => page.locator(`[data-action="${name}"]`);
const doButton = (p, name) => p.locator(`.coast-sample [data-do="${name}"]`);
// Live raid state (the Runtime's own capture), the stored record and the raid host's open panel.
const info = (p = page) => p.evaluate(() => { const a = window.__bincov.app, s = window.__bincov.saveSession.captureExpansion(); return { map: s.raid.currentMap, player: s.raid.player, elapsed: s.raid.elapsed, doors: s.raid.maps.coast.doors, pursuits: s.raid.pursuits, raw: localStorage.getItem('escape-bincov.session.v2'), panel: window.__bincovSample.host.panel, storageOK: a.storageOK }; });
const mapId = (p = page) => p.evaluate(() => window.__bincovSample.host.lastBatch.stamp.world.mapId);
/**
 * Draw a few frames and resume a stall pause that appeared meanwhile: on a slow machine (CI draws this scene a few times
 * a second) the first frames after a placement, a floor change or a reload can take over two seconds, which pauses the
 * raid, and the next real input would meet the pause panel instead of the world.
 */
const settled = async (p = page) => {
    // Frames until two in a row take under a second (at most 20), then resume if the latest Runtime notice is the stall
    // pause (every caller expects a running raid here).
    await p.evaluate(() => new Promise(r => { let last = performance.now(), quiet = 0, n = 0; const f = now => { quiet = now - last < 1000 ? quiet + 1 : 0; last = now; if (++n >= 20 || quiet >= 2) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    const stalled = await p.evaluate(() => {
        const h = window.__bincovSample.host, n = h.eventLog.filter(e => e.type === 'notice').at(-1);
        return h.panel === 'pause' && /画面暂时停顿/.test(n?.detail?.text ?? '') && !!document.querySelector('.coast-sample [data-panel] [data-do="resume"]:not([disabled])');
    });
    if (stalled) { await doButton(p, 'resume').click(); await waitPanel(p, null); }
};
const onMap = async (id, p = page) => { await p.waitForFunction(id => window.__bincovSample?.host?.lastBatch?.stamp.world.mapId === id, id, { timeout: 15000 }); await settled(p); };
/** Place the player, let the new view settle, then checkpoint (which also restarts the two-second checkpoint clock). */
const stand = async (x, y, p = page) => {
    await p.evaluate(({ x, y }) => { const map = window.__bincovSample.host.lastBatch.stamp.world.mapId; window.__bincovSample.driver.placePlayer({ x, y }, -Math.PI / 2, map); }, { x, y });
    await settled(p);
    await p.evaluate(() => { if (!window.__bincovSample.host.services.checkpoint()) throw new Error('Fixture checkpoint failed'); });
};
const frames = (n = 3) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
/** Wait for `seconds` of published raid time, however long a frame takes on this machine (CI draws a few per second). */
const simFor = async (seconds, p = page) => {
    const t0 = await p.evaluate(() => window.__bincovSample.host.lastBatch.stamp.simulationTime);
    await p.waitForFunction(([t0, s]) => window.__bincovSample.host.lastBatch.stamp.simulationTime - t0 >= s, [t0, seconds], { timeout: 15000 });
};
async function step(name, task) { const entry = { name, status: 'running' }; report.steps.push(entry); try { await task(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); entry.status = 'passed'; console.log('PASS', name); } catch (e) { entry.status = 'failed'; entry.error = e.stack; throw e; } }
try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs'); await action('enter').click();
    await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action('deploy').click();
    await raidReady(page);
    await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
    await step('native deployment saves all three maps with one global roster and body', async () => {
        const state = await info(), record = JSON.parse(state.raw);
        // Record v8 (gun instances) with enemy rules on (it holds enemyBackup) for the combined perk and enemy raid v5.
        assert.equal(record.version, 9); assert.equal(record.raid, null); assert.equal(record.expansion.raid.version, 5); assert.ok('enemyBackup' in record);
        assert.equal(record.expansion.raid.roster.length, 25);
        assert.deepEqual(Object.keys(record.expansion.raid.maps).sort(), ['coast', 'resident-b1', 'resident-f2']);
        assert.equal(state.map, 'coast');
    });
    await step('failed door write leaves the closed door and original bytes; retry opens exactly once', async () => {
        await stand(464, 432); const before = await info();
        await page.evaluate(() => { window.__buildingSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('Door fault', 'QuotaExceededError'); return window.__buildingSet.call(this, k, v); }; });
        await page.keyboard.press('e'); await waitPanel(page, 'pause');
        assert.match(await page.locator('.coast-sample [data-panel] h2').innerText(), /存档保存失败/);
        const failed = await info(); assert.equal(failed.doors['resident-front'], false); assert.equal(failed.raw, before.raw);
        await page.evaluate(() => { Storage.prototype.setItem = window.__buildingSet; });
        // Retry commits the pending door write once and resumes the raid.
        await doButton(page, 'retry-save').click(); await waitPanel(page, null);
        assert.equal((await info()).doors['resident-front'], true);
        await page.keyboard.down('w'); await page.waitForFunction(() => window.__bincov.saveSession.captureExpansion().raid.player.y < 400, null, { timeout: 15000 }); await page.keyboard.up('w');
        assert.ok((await info()).player.y < 400, 'Open doorway accepts real movement');
    });
    await step('closing the door from inside the doorway is refused with 门口有人 and leaves it open', async () => {
        // The player's own body counts as someone in the doorway (toggleDoor); the host names that refusal.
        await stand(464, 400);
        await page.waitForFunction(() => { const i = window.__bincovSample.host.lastBatch.frame.interaction; return i?.kind === 'door' && i.ref.id === 'resident-front'; });
        await page.keyboard.press('e');
        await page.waitForFunction(() => { const t = document.querySelector('.coast-sample [data-toast]'); return t?.classList.contains('on') && t.classList.contains('bad') && t.textContent === '门口有人，暂时不能关门。'; });
        const after = await info();
        assert.equal(after.doors['resident-front'], true);
        assert.equal(JSON.parse(after.raw).expansion.raid.maps.coast.doors['resident-front'], true, 'The stored door stays open');
    });
    await step('one held E switches once, releases held movement, and keeps global time and saved doors', async () => {
        await stand(560, 272); const before = await info();
        await page.keyboard.down('w'); await page.keyboard.down('e');
        await onMap('resident-f2');
        await frames(20); const after = await info();
        assert.equal(after.map, 'resident-f2'); assert.equal(after.player.x, 304); assert.equal(after.player.y, 80);
        assert.ok(after.elapsed >= before.elapsed); assert.equal(after.doors['resident-front'], true);
        await page.keyboard.up('e'); await page.keyboard.up('w');
        await page.waitForFunction(() => /褪色居民楼|储藏室/.test(document.querySelector('.coast-sample [data-where]').textContent));
        await page.screenshot({ path: resolve(out, 'building-f2-1280x720.png') });
        await page.setViewportSize({ width: 1920, height: 1080 }); await frames(10); await page.screenshot({ path: resolve(out, 'building-f2-1920x1080.png') });
    });
    await step('refresh restores upstairs and all maps; reverse and basement entries return to paired anchors', async () => {
        await page.evaluate(() => { if (!window.__bincovSample.host.services.checkpoint()) throw new Error('Checkpoint failed'); });
        const before = await info(); await page.reload(); await action('enter').click();
        await raidReady(page); await waitPanel(page, 'pause');
        assert.equal((await info()).map, 'resident-f2'); assert.deepEqual((await info()).player, before.player);
        await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
        await doButton(page, 'resume').click(); await waitPanel(page, null); await settled(); await page.keyboard.press('e');
        await onMap('coast');
        assert.equal((await info()).doors['resident-front'], true);
        await stand(496, 272); await page.keyboard.press('e');
        await onMap('resident-b1');
        await page.keyboard.press('e'); await onMap('coast');
        assert.ok((await info()).elapsed >= before.elapsed);
    });
    await step('native E closes a passed pursuit door; subsequent frames and reload keep it closed', async () => {
        await page.setViewportSize({ width: 1280, height: 720 }); await frames(2);
        const fixture = await page.evaluate(() => {
            const { saveSession } = window.__bincov, m = window.__bincovSample.host.lastBatch.map;
            const start = { x: 464, y: 464 }, entry = m.entries.find(e => e.id === 'resident-up');
            // The route a pursuer walks: a cardinal tile path through floor cells and doorways (body-only cells block).
            const tile = t => Math.floor(t / 32), door = (x, y) => m.doors.some(d => d.x === x && d.y === y);
            const open = (x, y) => x >= 0 && y >= 0 && x < m.cols && y < m.rows && (door(x, y) || m.cells[y][x] === 'floor' || m.cells[y][x] === 'tide');
            const from = [tile(start.x), tile(start.y)], to = [tile(entry.at.x), tile(entry.at.y)], prev = new Map([[from.join(), null]]), queue = [from];
            while (queue.length && !prev.has(to.join())) {
                const [x, y] = queue.shift();
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [x + dx, y + dy]; if (open(...n) && !prev.has(n.join())) { prev.set(n.join(), [x, y]); queue.push(n); } }
            }
            const cells = []; for (let c = to; c; c = prev.get(c.join())) cells.unshift(c);
            if (!prev.has(to.join())) throw new Error('No route to the stairs');
            const path = [start, ...cells.slice(1).map(([x, y]) => ({ x: (x + .5) * 32, y: (y + .5) * 32 })), { ...entry.at }];
            if (!cells.some(([x, y]) => x === 14 && y === 12)) throw new Error('Fixture route misses the doorway');
            const distance = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
            let id, uid;
            const ticket = saveSession.prepareExpansionMutation(d => {
                const raid = d.expansion.raid, source = raid.maps.coast;
                const index = source.enemies.findIndex(e => e.hp > 0), enemy = source.enemies.splice(index, 1)[0];
                Object.assign(enemy, start, { target: { ...start }, home: { ...start }, path: [], repath: 0 });
                id = `pursuit-${raid.nextEntity++}`; uid = enemy.uid;
                source.doors['resident-front'] = false;
                raid.player = { x: 464, y: 432, rotation: 0 };
                // 12 px/s: the pursuer passes the door after about 11 s and reaches the stairs about 14 s later, so on a slow
                // machine (CI draws a few frames a second) it is still on its way when the step reloads.
                raid.pursuits.push({ id, enemy, sourceMap: 'coast', targetMap: entry.targetMap, entry: entry.id,
                    path, distance, speed: 12, registeredAt: raid.elapsed, arrivalAt: raid.elapsed + distance / 12 + 1, waiting: false });
            });
            if (!ticket || saveSession.commitExpansionMutation(ticket) !== 'committed') throw new Error('Pursuit fixture rejected');
            return { id, uid, path, distance };
        });
        await settled();
        await page.waitForFunction(id => {
            const s = window.__bincov.saveSession.captureExpansion().raid;
            return s.maps.coast.doors['resident-front'] && s.pursuits.find(p => p.id === id)?.enemy.y < 364;
        }, fixture.id, { timeout: 30000 });
        const before = await info(); await page.keyboard.press('e');
        await page.waitForFunction(() => !window.__bincovSample.host.lastBatch.frame.doors['resident-front']);
        // Checkpoint at once, with the pursuer still on its way to the stairs, so the reload below meets the pursuit too.
        await page.evaluate(() => { if (!window.__bincovSample.host.services.checkpoint()) throw new Error('Closed door checkpoint failed'); });
        const closed = await info();
        assert.equal(JSON.parse(closed.raw).expansion.raid.maps.coast.doors['resident-front'], false);
        assert.ok(JSON.parse(closed.raw).expansion.raid.pursuits.some(p => p.id === fixture.id), 'The closed-door checkpoint holds the pursuit');
        await frames(2);
        assert.equal((await info()).doors['resident-front'], false, 'The next rendered frames must not reopen the door');
        // A fifth of a second of raid time, as the original waited.
        await simFor(.2); assert.equal((await info()).doors['resident-front'], false);
        // Body status and carried weight share one HUD line: it must stay inside its card on one line.
        await page.waitForFunction(() => /kg/.test(document.querySelector('.coast-sample [data-state]').textContent));
        const readout = await page.evaluate(() => {
            const el = document.querySelector('.coast-sample [data-state]'), card = el.closest('.cs-status').getBoundingClientRect(), r = el.getBoundingClientRect();
            return { overflow: el.scrollWidth - el.clientWidth, right: r.right, cardRight: card.right, height: r.height, lineHeight: parseFloat(getComputedStyle(el).lineHeight) };
        });
        assert.ok(readout.overflow <= 1 && readout.right <= readout.cardRight + 1, 'Body status and weight stay inside the status card');
        assert.ok(readout.height <= readout.lineHeight * 2 + 1, 'The status and weight fit the HUD line');
        // The weight follows the line's ideographic space; it and its unit render as one rect, on one line.
        const weightRects = await page.evaluate(() => {
            const t = document.querySelector('.coast-sample [data-state]').firstChild, r = document.createRange();
            r.setStart(t, t.textContent.lastIndexOf('\u3000') + 1); r.setEnd(t, t.textContent.length); return r.getClientRects().length;
        });
        assert.equal(weightRects, 1, 'The weight and its unit fit on one line');
        await page.screenshot({ path: resolve(out, 'building-pursuit-door-closed-1280x720.png') });
        await page.reload(); await action('enter').click();
        await raidReady(page); await waitPanel(page, 'pause');
        assert.equal((await info()).doors['resident-front'], false);
        // The reloaded checkpoint holds the pursuit and its pursuer (read before resuming: once it runs, a slow machine's
        // long frames may carry the pursuer the rest of the way to the stairs).
        const restored = (await info()).pursuits.find(p => p.id === fixture.id);
        assert.ok(restored, 'The reload restores the pursuit'); assert.equal(restored.enemy.uid, fixture.uid);
        await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
        await doButton(page, 'resume').click(); await waitPanel(page, null); await settled(); await simFor(.2);
        assert.equal((await info()).doors['resident-front'], false);
        report.pursuitDoor = { fixture, elapsedBeforeClose: before.elapsed, elapsedSaved: closed.elapsed, restoredArrivalAt: restored.arrivalAt };
    });
    await step('indoor warning and tide use the global clock; failed upstairs timeout retains its candidate and retries once', async () => {
        await stand(560, 272); await page.keyboard.press('e');
        await onMap('resident-f2');
        const boundary = elapsed => page.evaluate(elapsed => {
            const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => {
                const r = d.expansion.raid;
                Object.assign(r, { elapsed, initialHigh: false, highTide: false, warned: elapsed >= 270, tideChanged: false });
            });
            if (!ticket || s.commitExpansionMutation(ticket) !== 'committed') throw new Error('Indoor boundary fixture rejected');
        }, elapsed);
        const indoor = () => page.evaluate(() => {
            const s = window.__bincov.saveSession.captureExpansion();
            return { map: s.raid.currentMap, elapsed: s.raid.elapsed, warned: s.raid.warned, tideChanged: s.raid.tideChanged, high: s.raid.highTide, pollution: s.body.pollution, hp: s.body.hp, frozenCoastTime: s.raid.maps.coast.localTime };
        });
        await boundary(269.95); const before = await indoor();
        await page.waitForFunction(() => { const r = window.__bincov.saveSession.captureExpansion().raid; return r.warned && r.elapsed >= 270; });
        const warning = await indoor(); assert.equal(warning.map, 'resident-f2'); assert.equal(warning.high, false);
        assert.equal(warning.pollution, before.pollution); assert.equal(warning.frozenCoastTime, before.frozenCoastTime);
        await boundary(299.95);
        await page.waitForFunction(() => { const r = window.__bincov.saveSession.captureExpansion().raid; return r.tideChanged && r.elapsed >= 300; });
        const tide = await indoor(); assert.equal(tide.map, 'resident-f2'); assert.equal(tide.high, true);
        assert.equal(tide.pollution, before.pollution); assert.equal(tide.frozenCoastTime, before.frozenCoastTime);
        const runId = await page.evaluate(() => window.__bincov.app.save.activeRun.runId);
        await page.evaluate(() => {
            window.__buildingTerminalSet = Storage.prototype.setItem;
            Storage.prototype.setItem = function(k, v) {
                if (k === 'escape-bincov.session.v2' && JSON.parse(v).terminal) { window.__buildingTerminalRaw = localStorage.getItem(k); throw new DOMException('Indoor terminal fault', 'QuotaExceededError'); }
                return window.__buildingTerminalSet.call(this, k, v);
            };
            window.__bincovSample.driver.clock(599.95);
        });
        await page.waitForFunction(() => window.__bincov.app.pendingSettlement, null, { timeout: 15000 });
        assert.equal(await page.evaluate(() => localStorage.getItem('escape-bincov.session.v2')), await page.evaluate(() => window.__buildingTerminalRaw));
        assert.equal(await page.evaluate(() => window.__bincov.app.expansion.raid.currentMap), 'resident-f2');
        assert.equal(await page.evaluate(() => window.__bincov.app.pendingExpansion.base.location), 'settlement');
        assert.ok(await page.evaluate(() => !!window.__bincov.app.save.activeRun));
        await waitPanel(page, 'ending');
        await page.screenshot({ path: resolve(out, 'building-indoor-timeout-error-1280x720.png') });
        await page.evaluate(() => { Storage.prototype.setItem = window.__buildingTerminalSet; });
        await doButton(page, 'retry-settlement').click(); await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'), null, { timeout: 30000 });
        const terminal = await page.evaluate(() => JSON.parse(localStorage.getItem('escape-bincov.session.v2')));
        assert.equal(terminal.terminal.runId, runId); assert.equal(terminal.profile.lastResult.outcome, 'timeout');
        assert.equal(terminal.profile.activeRun, null); assert.equal(terminal.expansion.raid, null);
        assert.equal(await page.evaluate(() => window.__bincov.saveSession.retrySettlement()), false);
        report.indoor = { warning, tide, terminal: { runId, outcome: terminal.profile.lastResult.outcome, body: terminal.expansion.body } };
        await action('return').click();
    });
    for (const viewport of [{ width: 844, height: 390 }, { width: 640, height: 300 }]) {
        await step(`native touch entry and map panel at ${viewport.width}x${viewport.height}`, async () => {
            const mobile = await browser.newContext({ viewport, isMobile: true, hasTouch: true, offline: true });
            const p = await mobile.newPage(); p.setDefaultTimeout(30000); await resumeStalls(mobile); p.on('pageerror', e => report.errors.push(e.stack ?? e.message));
            mobile.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
            try {
                const act = name => p.locator(`[data-action="${name}"]`), touchAct = p.locator('.coast-sample [data-act]');
                await p.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs'); await act('enter').tap();
                await p.locator('#run-world').selectOption('buildings'); await p.locator('#seed').fill('42'); await act('deploy').tap();
                await raidReady(p);
                await p.waitForFunction(() => window.__bincovSample.host.input.touch && !!document.querySelector('.coast-sample.touch'));
                await p.evaluate(() => window.__bincovSample.driver.freezeAI(true));
                await stand(464, 432, p);
                await p.waitForFunction(() => document.querySelector('.coast-sample [data-act]').textContent === '开门');
                await touchAct.tap(); await p.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.doors['resident-front']);
                await stand(560, 272, p);
                await p.waitForFunction(() => document.querySelector('.coast-sample [data-act]').textContent === '上楼');
                assert.equal(await touchAct.getAttribute('aria-label'), '上楼 · 二楼');
                await touchAct.tap(); await onMap('resident-f2', p);
                await p.locator('.coast-sample .cs-touch [data-do="map"]').tap(); await waitPanel(p, 'map');
                assert.match(await p.locator('.coast-sample [data-panel]').innerText(), /二楼/);
                assert.equal(await mapId(p), 'resident-f2');
                await p.locator('.coast-sample [data-panel] [data-do="close"]').tap(); await waitPanel(p, null);
                await p.screenshot({ path: resolve(out, `building-touch-${viewport.width}x${viewport.height}.png`) });
                await touchAct.tap(); await onMap('coast', p);
            } catch (error) {
                report.mobileDiagnostic = await p.evaluate(() => { const a = window.__bincov.app; return { save: a.save, expansion: window.__bincov.saveSession.captureExpansion(), panel: window.__bincovSample?.host?.panel ?? null, storageError: a.storageError }; }).catch(() => null);
                throw error;
            } finally { await mobile.close(); }
        });
    }
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; report.diagnostic = await info().catch(() => null); console.error(error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'building-browser-report.json'), JSON.stringify(report, null, 2)); await context.close(); await browser.close(); }
