import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results'); await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), methodology: 'Offline built HTML; native region selector, keyboard/touch actions, storage fault and reload. Explicit fixtures position the player at named anchors, register one validated pursuit with a real map route and normal frame progression, set indoor clock boundaries and extend enemy cooldowns to isolate the indoor warning/tide/terminal transaction; this does not claim natural travel, another unaccelerated 600-second run or human balance.', htmlSha256: createHash('sha256').update(await readFile(resolve('dist/index.html'))).digest('hex'), steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
const action = name => page.locator(`[data-action="${name}"]`);
const info = () => page.evaluate(() => { const a = window.__bincov.app, s = a.raid.snapshotExpansion(); return { map: s.raid.currentMap, player: s.raid.player, elapsed: s.raid.elapsed, doors: s.raid.maps.coast.doors, raw: localStorage.getItem('escape-bincov.session.v2'), overlay: a.overlay, storageOK: a.storageOK }; });
const stand = (x, y) => page.evaluate(({ x, y }) => { const r = window.__bincov.app.raid; r.player.setPosition(x, y); if (!r.checkpoint()) throw new Error('Fixture checkpoint failed'); }, { x, y });
async function step(name, task) { const entry = { name, status: 'running' }; report.steps.push(entry); try { await task(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); entry.status = 'passed'; console.log('PASS', name); } catch (e) { entry.status = 'failed'; entry.error = e.stack; throw e; } }
try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs'); await action('enter').click();
    await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42'); await action('deploy').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
    await step('native deployment saves all three maps with one global roster and body', async () => {
        const state = await info(), record = JSON.parse(state.raw);
        assert.equal(record.version, 4); assert.equal(record.raid, null); assert.equal(record.expansion.raid.roster.length, 25);
        assert.deepEqual(Object.keys(record.expansion.raid.maps).sort(), ['coast', 'resident-b1', 'resident-f2']);
        assert.equal(state.map, 'coast');
    });
    await step('failed door write leaves the closed door and original bytes; retry opens exactly once', async () => {
        await stand(464, 432); const before = await info();
        await page.evaluate(() => { window.__buildingSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === 'escape-bincov.session.v2') throw new DOMException('Door fault', 'QuotaExceededError'); return window.__buildingSet.call(this, k, v); }; });
        await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincov.app.overlay === 'checkpoint-error');
        const failed = await info(); assert.equal(failed.doors['resident-front'], false); assert.equal(failed.raw, before.raw);
        await page.evaluate(() => { Storage.prototype.setItem = window.__buildingSet; });
        await action('retry-checkpoint').click(); assert.equal((await info()).doors['resident-front'], true);
        await action('close').click();
        await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w');
        assert.ok((await info()).player.y < 400, 'Open doorway accepts real movement');
    });
    await step('one held E switches once, releases held movement, and keeps global time and saved doors', async () => {
        await stand(560, 272); const before = await info();
        await page.keyboard.down('w'); await page.keyboard.down('e');
        await page.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'resident-f2');
        await page.waitForTimeout(250); const after = await info();
        assert.equal(after.map, 'resident-f2'); assert.equal(after.player.x, 304); assert.equal(after.player.y, 80);
        assert.ok(after.elapsed >= before.elapsed); assert.equal(after.doors['resident-front'], true);
        await page.keyboard.up('e'); await page.keyboard.up('w');
        assert.match(await page.locator('#zone').innerText(), /褪色居民楼|储藏室/);
        await page.screenshot({ path: resolve(out, 'building-f2-1280x720.png') });
        await page.setViewportSize({ width: 1920, height: 1080 }); await page.screenshot({ path: resolve(out, 'building-f2-1920x1080.png') });
        if (await action('close').count()) await action('close').click();
    });
    await step('refresh restores upstairs and all maps; reverse and basement entries return to paired anchors', async () => {
        await page.evaluate(() => { if (!window.__bincov.app.raid.checkpoint()) throw new Error('Checkpoint failed'); });
        const before = await info(); await page.reload(); await action('enter').click();
        await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
        assert.equal((await info()).map, 'resident-f2'); assert.deepEqual((await info()).player, before.player);
        await action('close').click(); await page.keyboard.press('e');
        await page.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'coast');
        assert.equal((await info()).doors['resident-front'], true);
        await stand(496, 272); await page.keyboard.press('e');
        await page.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'resident-b1');
        await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'coast');
        assert.ok((await info()).elapsed >= before.elapsed);
    });
    await step('native E closes a passed pursuit door; subsequent frames and reload keep it closed', async () => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (await action('close').count()) await action('close').click();
        const fixture = await page.evaluate(() => {
            const { app, saveSession } = window.__bincov, r = app.raid;
            const start = { x: 464, y: 464 }, entry = r.space.definition.entries.find(e => e.id === 'resident-up');
            const path = [start, ...r.path(start, entry.at, r.highTide), { ...entry.at }];
            if (!path.some(p => Math.floor(p.x / 32) === 14 && Math.floor(p.y / 32) === 12)) throw new Error('Fixture route misses the doorway');
            const distance = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
            let id, uid;
            const ticket = saveSession.prepareExpansionMutation(d => {
                const raid = d.expansion.raid, source = raid.maps.coast;
                for (const m of Object.values(raid.maps)) for (const e of m.enemies) e.cooldown = 1000;
                for (const p of raid.pursuits) p.enemy.cooldown = 1000;
                const index = source.enemies.findIndex(e => e.hp > 0), enemy = source.enemies.splice(index, 1)[0];
                Object.assign(enemy, start, { target: { ...start }, home: { ...start }, path: [], repath: 0 });
                id = `pursuit-${raid.nextEntity++}`; uid = enemy.uid;
                source.doors['resident-front'] = false;
                raid.player = { x: 464, y: 432, rotation: 0 };
                raid.pursuits.push({ id, enemy, sourceMap: 'coast', targetMap: entry.targetMap, entry: entry.id,
                    path, distance, speed: 32, registeredAt: raid.elapsed, arrivalAt: raid.elapsed + distance / 32 + 1, waiting: false });
            });
            if (!ticket || saveSession.commitExpansionMutation(ticket) !== 'committed') throw new Error('Pursuit fixture rejected');
            return { id, uid, path, distance };
        });
        await page.waitForFunction(id => {
            const s = window.__bincov.app.raid.snapshotExpansion().raid;
            return s.maps.coast.doors['resident-front'] && s.pursuits.find(p => p.id === id)?.enemy.y < 364;
        }, fixture.id);
        const before = await info(); await page.keyboard.press('e');
        await page.waitForFunction(() => !window.__bincov.app.raid.space.doors['resident-front']);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal((await info()).doors['resident-front'], false, 'The next rendered frames must not reopen the door');
        await page.waitForTimeout(200); assert.equal((await info()).doors['resident-front'], false);
        await page.evaluate(() => { if (!window.__bincov.app.raid.checkpoint()) throw new Error('Closed door checkpoint failed'); });
        const closed = await info();
        assert.equal(JSON.parse(closed.raw).expansion.raid.maps.coast.doors['resident-front'], false);
        const readout = await page.evaluate(() => {
            const status = document.getElementById('status').getBoundingClientRect(), weight = document.getElementById('weight').getBoundingClientRect();
            return { statusBottom: status.bottom, weightTop: weight.top, weightHeight: weight.height, lineHeight: parseFloat(getComputedStyle(document.getElementById('weight')).lineHeight) };
        });
        assert.ok(readout.statusBottom <= readout.weightTop, 'Body status and weight must not share overlapping columns');
        assert.ok(readout.weightHeight <= readout.lineHeight + 1, 'The weight and its unit fit on one line');
        await page.screenshot({ path: resolve(out, 'building-pursuit-door-closed-1280x720.png') });
        await page.reload(); await action('enter').click();
        await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
        assert.equal((await info()).doors['resident-front'], false);
        await action('close').click(); await page.waitForTimeout(200);
        assert.equal((await info()).doors['resident-front'], false);
        const restored = await page.evaluate(id => window.__bincov.app.raid.snapshotExpansion().raid.pursuits.find(p => p.id === id), fixture.id);
        assert.equal(restored.enemy.uid, fixture.uid);
        report.pursuitDoor = { fixture, elapsedBeforeClose: before.elapsed, elapsedSaved: closed.elapsed, restoredArrivalAt: restored.arrivalAt };
    });
    await step('indoor warning and tide use the global clock; failed upstairs timeout retains its candidate and retries once', async () => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (await action('close').count()) await action('close').click();
        await stand(560, 272); await page.keyboard.press('e');
        await page.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'resident-f2');
        const boundary = elapsed => page.evaluate(elapsed => {
            const s = window.__bincov.saveSession, ticket = s.prepareExpansionMutation(d => {
                const r = d.expansion.raid;
                Object.assign(r, { elapsed, initialHigh: false, highTide: false, warned: elapsed >= 270, tideChanged: false });
                for (const m of Object.values(r.maps)) for (const e of m.enemies) e.cooldown = 1000;
                for (const p of r.pursuits) p.enemy.cooldown = 1000;
            });
            if (!ticket || s.commitExpansionMutation(ticket) !== 'committed') throw new Error('Indoor boundary fixture rejected');
        }, elapsed);
        const indoor = () => page.evaluate(() => {
            const a = window.__bincov.app, s = a.raid.snapshotExpansion();
            return { map: s.raid.currentMap, elapsed: s.raid.elapsed, warned: s.raid.warned, tideChanged: s.raid.tideChanged, high: s.raid.highTide, pollution: s.body.pollution, hp: s.body.hp, frozenCoastTime: s.raid.maps.coast.localTime };
        });
        await boundary(269.95); const before = await indoor();
        await page.waitForFunction(() => window.__bincov.app.raid.warned && window.__bincov.app.raid.elapsed >= 270);
        const warning = await indoor(); assert.equal(warning.map, 'resident-f2'); assert.equal(warning.high, false);
        assert.equal(warning.pollution, before.pollution); assert.equal(warning.frozenCoastTime, before.frozenCoastTime);
        await boundary(299.95);
        await page.waitForFunction(() => window.__bincov.app.raid.tideChanged && window.__bincov.app.raid.elapsed >= 300);
        const tide = await indoor(); assert.equal(tide.map, 'resident-f2'); assert.equal(tide.high, true);
        assert.equal(tide.pollution, before.pollution); assert.equal(tide.frozenCoastTime, before.frozenCoastTime);
        const runId = await page.evaluate(() => window.__bincov.app.save.activeRun.runId);
        await page.evaluate(() => {
            window.__buildingTerminalSet = Storage.prototype.setItem;
            Storage.prototype.setItem = function(k, v) {
                if (k === 'escape-bincov.session.v2' && JSON.parse(v).terminal) { window.__buildingTerminalRaw = localStorage.getItem(k); throw new DOMException('Indoor terminal fault', 'QuotaExceededError'); }
                return window.__buildingTerminalSet.call(this, k, v);
            };
            window.__bincov.app.raid.elapsed = 599.95;
        });
        await page.waitForFunction(() => window.__bincov.app.pendingSettlement);
        assert.equal(await page.evaluate(() => localStorage.getItem('escape-bincov.session.v2')), await page.evaluate(() => window.__buildingTerminalRaw));
        assert.equal(await page.evaluate(() => window.__bincov.app.expansion.raid.currentMap), 'resident-f2');
        assert.equal(await page.evaluate(() => window.__bincov.app.pendingExpansion.base.location), 'settlement');
        assert.ok(await page.evaluate(() => !!window.__bincov.app.save.activeRun));
        await page.screenshot({ path: resolve(out, 'building-indoor-timeout-error-1280x720.png') });
        await page.evaluate(() => { Storage.prototype.setItem = window.__buildingTerminalSet; });
        await action('retry-save').click(); await page.waitForFunction(() => window.__bincov.app.state === 'result');
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
            const p = await mobile.newPage(); p.setDefaultTimeout(10000); p.on('pageerror', e => report.errors.push(e.stack ?? e.message));
            mobile.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
            try {
                const act = name => p.locator(`[data-action="${name}"]`);
                await p.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs'); await act('enter').tap();
                await p.locator('#run-world').selectOption('buildings'); await p.locator('#seed').fill('42'); await act('deploy').tap();
                await p.waitForFunction(() => window.__bincov.app.raid?.player?.active);
                assert.equal(await p.evaluate(() => window.__bincov.playerInput.touch), true);
                await p.evaluate(() => { const r = window.__bincov.app.raid; r.player.setPosition(464, 432); if (!r.checkpoint()) throw new Error('Touch fixture save failed'); });
                await p.waitForFunction(() => document.getElementById('touch-interact').textContent === '开门');
                await p.locator('#touch-interact').tap(); await p.waitForFunction(() => window.__bincov.app.raid.space.doors['resident-front']);
                await p.evaluate(() => { const r = window.__bincov.app.raid; r.player.setPosition(560, 272); if (!r.checkpoint()) throw new Error('Touch fixture save failed'); });
                await p.waitForFunction(() => document.getElementById('touch-interact').textContent === '上楼');
                assert.equal(await p.locator('#touch-interact').getAttribute('aria-label'), '上楼 · 二楼');
                await p.locator('#touch-interact').tap(); await p.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'resident-f2');
                await p.locator('[data-panel="map"]').tap(); assert.match(await p.locator('.map-modal').innerText(), /二楼/);
                assert.equal(await p.evaluate(() => window.__bincov.app.raid.space.definition.id), 'resident-f2');
                await act('close').tap(); await p.screenshot({ path: resolve(out, `building-touch-${viewport.width}x${viewport.height}.png`) });
                await p.locator('#touch-interact').tap(); await p.waitForFunction(() => window.__bincov.app.raid.space.definition.id === 'coast');
            } catch (error) {
                report.mobileDiagnostic = await p.evaluate(() => { const a = window.__bincov.app; return { save: a.save, expansion: a.raid.snapshotExpansion(), overlay: a.overlay, storageError: a.storageError }; }).catch(() => null);
                throw error;
            } finally { await mobile.close(); }
        });
    }
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; report.diagnostic = await info().catch(() => null); console.error(error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'building-browser-report.json'), JSON.stringify(report, null, 2)); await context.close(); await browser.close(); }
