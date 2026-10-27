/** Cross-PR regression: explicit map/inventory fixtures, native UI and normal frames. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls } from './stall-resume.mjs';
import { placeAt, clickSlot } from './inventory-actions.mjs';
import { batch, frames, raidReady, waitPanel } from './raid-view.mjs';
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const report = { htmlSha256: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), methodology: 'Offline exact bundle; explicit funded base, mall container relocation (layout 4, 2.5D raid host), item and frozen-enemy fixtures. Native buttons, wheel, keyboard and emulated touch; actual bullet flight. Not natural balance or physical-device acceptance.', steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, hasTouch: true });
await resumeStalls(context);
const page = await context.newPage(); page.setDefaultTimeout(30000);
page.on('pageerror', e => report.errors.push(e.message)); context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const overlay = () => page.evaluate(() => window.__bincov.app.overlay);
async function step(name, fn) { const row = { name, status: 'running' }; report.steps.push(row); try { await fn(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); row.status = 'passed'; console.log('PASS', name); } catch (e) { row.status = 'failed'; row.error = e.stack; await page.screenshot({ path: resolve(out, 'qol-expansion-failed.png') }); throw e; } }
// Live carried bag and every container, from the raid's own capture (the panel reads the same state).
const live = () => page.evaluate(() => {
    const a = window.__bincov.app, raid = window.__bincov.saveSession.captureExpansion().raid;
    return { bag: a.loadout.bag, containers: Object.fromEntries(Object.values(raid.maps).flatMap(m => m.containers.map(c => [c.id, c.inventory]))) };
});
const context2 = () => page.evaluate(() => window.__bincovSample.host.services.lootContext());
/** A canvas point clear of the HUD, where the host listens for the wheel. */
const canvasPoint = () => page.evaluate(() => {
    for (const [x, y] of [[900, 470], [380, 470], [900, 250], [380, 250], [640, 560]]) if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y };
    throw new Error('No free canvas point for the wheel');
});
try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs'); await action('enter').click();
    await page.locator('#ui .panel.hideout').waitFor();
    await page.evaluate(() => { const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => { d.profile.cash = 10000; }); if (!t || s.commitExpansionMutation(t) !== 'committed') throw Error('Funding fixture'); });
    await action('tab', 'med').click();
    // The walking base is gone: leaving the shop is guarded on the tab page (回到院子, another tab, menu, deploy).
    await step('RPG medicine cart survives a cancelled leave and commits through the ordinary checkout', async () => {
        await placeAt(page, 'merchant', 'focus', 'buy');
        const before = await page.evaluate(() => structuredClone(window.__bincov.app.save));
        await action('base-enter').click(); assert.equal(await overlay(), 'shop-leave');
        await action('close').click(); assert.equal(await overlay(), '');
        assert.equal(await page.locator('[data-source="buy"][data-item-id="focus"]').count(), 1);
        assert.deepEqual(await page.evaluate(() => window.__bincov.app.save), before);
        await action('checkout').click(); assert.equal(await overlay(), '');
        const after = await page.evaluate(() => structuredClone(window.__bincov.app.save));
        assert.equal(after.stash.items.filter(i => i.id === 'focus').reduce((n,i) => n+i.qty,0), 1); assert.ok(after.cash < before.cash);
        await placeAt(page, 'merchant', 'analgesic', 'buy'); await action('tab', 'arms').click(); assert.equal(await overlay(), 'shop-leave');
        await action('shop-leave-confirm').click(); assert.equal(await overlay(), '');
        assert.equal(await page.evaluate(() => window.__bincov.app.tab), 'arms');
        assert.deepEqual(await page.evaluate(() => window.__bincov.app.save), after);
    });
    await action('tab', 'gear').click(); await page.locator('#run-world').selectOption('mall'); await page.locator('#seed').fill('42'); await action('deploy').click();
    await raidReady(page);
    assert.deepEqual((await batch(page)).map.key.worldVersion, 'mall-v4');
    // Two crates of the first floor moved onto the player (a walkable spot by construction); enemies frozen.
    const fixture = await page.evaluate(() => {
        const s = window.__bincov.saveSession; let ids;
        window.__bincovSample.driver.freezeAI(true);
        const t = s.prepareExpansionMutation(d => {
            const raid = d.expansion.raid, map = raid.maps['mall-f1'], boxes = map.containers.filter(c => c.kind === 'crate').slice(0, 2), p = raid.player;
            for (const box of boxes) { box.x = p.x; box.y = p.y; }
            ids = boxes.map(c => c.id);
            boxes[0].inventory.items = [{ uid: 'qol-layered-water', id: 'water', qty: 2, x: 0, y: 0 }];
            boxes[1].inventory.items = [];
            raid.loadout.bag.items = []; raid.loadout.safe.items = [];
        });
        if (!t || s.commitExpansionMutation(t) !== 'committed') throw Error('Container fixture'); return { ids };
    });
    const choice = id => `.coast-sample [data-choices] li[data-id="${id}"]`;
    await step('mall containers keep wheel-selected identity and touch-open the exact empty source', async () => {
        await page.waitForFunction(() => document.querySelectorAll('.coast-sample [data-choices] li[data-id]').length === 2, null, { timeout: 15000 });
        const at = await canvasPoint(); await page.mouse.move(at.x, at.y);
        if (await page.locator('.coast-sample [data-choices] li[aria-current]').getAttribute('data-id') !== fixture.ids[1]) await page.mouse.wheel(0, 100);
        await page.waitForFunction(id => document.querySelector('.coast-sample [data-choices] li[aria-current]')?.getAttribute('data-id') === id, fixture.ids[1], { timeout: 15000 });
        await page.keyboard.press('e');
        await waitPanel(page, 'loot');
        assert.equal((await context2()).containerId, fixture.ids[1]);
        await page.locator('.coast-sample [data-panel] [data-do="close"]').click(); await waitPanel(page, null);
        // Phone layout: a tapped name opens exactly that source (an empty one included).
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => document.documentElement.classList.contains('mobile') && document.querySelector('.coast-sample.touch'), null, { timeout: 15000 });
        await page.locator(choice(fixture.ids[1])).tap(); await waitPanel(page, 'loot');
        assert.equal((await context2()).containerId, fixture.ids[1]);
        await page.locator('.coast-sample [data-panel] [data-do="close"]').tap(); await waitPanel(page, null);
        await page.locator(choice(fixture.ids[0])).tap(); await waitPanel(page, 'loot');
        assert.equal((await context2()).containerId, fixture.ids[0]);
        await page.locator('.coast-sample [data-panel] [data-do="close"]').tap(); await waitPanel(page, null);
        // Back on a desktop: the wheel selection decides again what E opens.
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForFunction(() => !document.documentElement.classList.contains('mobile'), null, { timeout: 15000 });
        const back = await canvasPoint(); await page.mouse.move(back.x, back.y);
        await page.waitForFunction(() => document.querySelectorAll('.coast-sample [data-choices] li[data-id]').length === 2, null, { timeout: 15000 });
        if (await page.locator('.coast-sample [data-choices] li[aria-current]').getAttribute('data-id') !== fixture.ids[0]) await page.mouse.wheel(0, -100);
        await page.waitForFunction(id => document.querySelector('.coast-sample [data-choices] li[aria-current]')?.getAttribute('data-id') === id, fixture.ids[0], { timeout: 15000 });
        await page.keyboard.press('e'); await waitPanel(page, 'loot');
        assert.equal((await context2()).containerId, fixture.ids[0]);
    });
    await step('native layered split and rotation persist one part and retain the original remainder after reload', async () => {
        await page.locator('.coast-sample [data-source="container"][data-uid="qol-layered-water"]').click();
        await page.locator('.coast-sample [data-split]').fill('1'); await page.locator('.coast-sample [data-do="inv-split"]').click();
        await page.locator('.coast-sample [data-do="inv-place-rotate"]').click(); await clickSlot(page, 'bag');
        await frames(page, 2);
        const state = await live(), split = { bag: state.bag, box: state.containers[fixture.ids[0]] };
        assert.equal(split.bag.items[0].qty, 1); assert.equal(split.bag.items[0].rotated, true); assert.equal(split.box.items[0].qty, 1);
        await page.reload(); await action('enter').click(); await raidReady(page); await waitPanel(page, 'pause');
        await page.locator('.coast-sample [data-do="resume"]').click(); await waitPanel(page, null);
        const reloaded = await live();
        assert.deepEqual(reloaded.bag, split.bag);
        assert.deepEqual(reloaded.containers[fixture.ids[0]], split.box);
    });
    await step('actual layered enemy projectile displays its direction without closing loot; floor map keeps connector controls', async () => {
        await page.keyboard.press('e'); await waitPanel(page, 'loot');
        await page.evaluate(() => {
            const { saveSession: s } = window.__bincov;
            const t = s.prepareExpansionMutation(d => {
                const raid = d.expansion.raid, layer = raid.maps[raid.currentMap], p = raid.player, owner = layer.enemies[0].uid;
                layer.bullets.push({ uid: `qol-hit-${raid.nextEntity++}`, x: p.x + 20, y: p.y, rotation: Math.PI, vx: -50, vy: 0, left: 40, damage: 1, enemy: true, owner });
            }); if (!t || s.commitExpansionMutation(t) !== 'committed') throw Error('Bullet fixture');
        });
        // Capture the one-second feedback in one browser turn, before the HUD naturally expires it.
        const hit = await page.waitForFunction(() => document.querySelectorAll('.coast-sample [data-hits] i').length > 0
            ? { panel: window.__bincovSample.host.panel, risk: document.querySelector('.coast-sample [data-panel] [data-risk]')?.textContent ?? '' } : false, null, { timeout: 15000 });
        const feedback = await hit.jsonValue();
        assert.equal(feedback.panel, 'loot');
        assert.match(feedback.risk, /正在遭受攻击/, 'the loot window names the blow without closing');
        await page.locator('.coast-sample [data-panel] [data-do="close"]').click(); await waitPanel(page, null);
        await page.keyboard.press('m'); await waitPanel(page, 'map');
        assert.equal(await page.locator('.coast-sample [data-do="map-floor"]').count(), 2); assert.equal(await page.locator('.coast-sample [data-panel] [data-exit] option').count(), 3);
        await page.locator('.coast-sample [data-do="map-floor"][data-id="mall-f2"]').click();
        assert.equal((await batch(page)).stamp.world.mapId, 'mall-f1');
        await page.screenshot({ path: resolve(out, 'qol-expansion-map.png') });
    });
} finally { await writeFile(resolve(out, 'qol-expansion-report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
