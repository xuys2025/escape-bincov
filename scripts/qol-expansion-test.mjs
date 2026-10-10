/** Cross-PR regression: explicit map/inventory fixtures, native UI and normal frames. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { placeAt, clickSlot } from './inventory-actions.mjs';
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const report = { htmlSha256: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), methodology: 'Offline exact bundle; explicit funded base, original mall container relocation, item and long-cooldown fixtures. Native buttons, wheel, keyboard and emulated touch; actual bullet flight. Not natural balance or physical-device acceptance.', steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(12000);
page.on('pageerror', e => report.errors.push(e.message)); context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const overlay = () => page.evaluate(() => window.__bincov.app.overlay);
async function step(name, fn) { const row = { name, status: 'running' }; report.steps.push(row); try { await fn(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); row.status = 'passed'; console.log('PASS', name); } catch (e) { row.status = 'failed'; row.error = e.stack; await page.screenshot({ path: resolve(out, 'qol-expansion-failed.png') }); throw e; } }
try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs'); await action('enter').click(); await action('base-enter').click();
    await page.waitForFunction(() => window.__bincov.app.base?.player?.active);
    await page.evaluate(() => { const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => { d.profile.cash = 10000; }); if (!t || s.commitExpansionMutation(t) !== 'committed') throw Error('Funding fixture'); });
    await action('base-menu').click(); await action('tab', 'med').click();
    await step('RPG medicine cart survives cancelled base return and commits through the ordinary checkout', async () => {
        await placeAt(page, 'merchant', 'focus', 'buy');
        const before = await page.evaluate(() => structuredClone(window.__bincov.app.save));
        await page.keyboard.press('Escape'); assert.equal(await overlay(), 'shop-leave');
        await action('close').click(); assert.equal(await overlay(), 'base-menu');
        assert.equal(await page.locator('[data-source="buy"][data-item-id="focus"]').count(), 1);
        assert.deepEqual(await page.evaluate(() => window.__bincov.app.save), before);
        await action('checkout').click(); assert.equal(await overlay(), 'base-menu');
        const after = await page.evaluate(() => structuredClone(window.__bincov.app.save));
        assert.equal(after.stash.items.filter(i => i.id === 'focus').reduce((n,i) => n+i.qty,0), 1); assert.ok(after.cash < before.cash);
        await placeAt(page, 'merchant', 'analgesic', 'buy'); await action('base-return').click(); assert.equal(await overlay(), 'shop-leave');
        await action('shop-leave-confirm').click(); assert.equal(await overlay(), '');
        assert.deepEqual(await page.evaluate(() => window.__bincov.app.save), after);
    });
    await action('base-menu').click(); await action('tab', 'gear').click(); await page.locator('#run-world').selectOption('mall'); await page.locator('#seed').fill('42'); await action('deploy').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
    const fixture = await page.evaluate(() => {
        const s = window.__bincov.saveSession; let ids;
        const t = s.prepareExpansionMutation(d => {
            const raid = d.expansion.raid, map = raid.maps['mall-f1'], boxes = map.containers.slice(0, 2);
            raid.player = { x: boxes[0].x, y: boxes[0].y, rotation: 0 };
            boxes[1].x = boxes[0].x; boxes[1].y = boxes[0].y; ids = boxes.map(c => c.id);
            boxes[0].inventory.items = [{ uid: 'qol-layered-water', id: 'water', qty: 2, x: 0, y: 0 }];
            boxes[1].inventory.items = [];
            raid.loadout.bag.items = []; raid.loadout.safe.items = [];
            for (const layer of Object.values(raid.maps)) for (const e of layer.enemies) e.cooldown = 1000;
        });
        if (!t || s.commitExpansionMutation(t) !== 'committed') throw Error('Container fixture'); return { ids };
    });
    await step('mall containers keep wheel-selected identity and touch-open the exact empty source', async () => {
        await page.waitForFunction(() => document.querySelectorAll('#interaction [data-loot-target]').length === 2);
        await page.mouse.move(640, 350); await page.mouse.wheel(0, 100);
        await page.waitForFunction(id => document.querySelector('#interaction [aria-current]')?.getAttribute('data-loot-target') === id, fixture.ids[1]);
        await page.keyboard.press('e');
        // E queues an intention; the next game frame opens loot. Wait for readiness, then check the exact target below.
        await page.waitForFunction(() => window.__bincov.app.overlay === 'loot' && window.__bincov.app.lootContext !== null);
        assert.equal(await page.evaluate(() => window.__bincov.app.lootContext.containerId), fixture.ids[1]);
        await action('close').click();
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => document.documentElement.classList.contains('mobile') && window.__bincov.app.overlay === 'pause');
        await action('close').tap();
        await page.locator(`[data-loot-target="${fixture.ids[1]}"] button`).tap();
        assert.equal(await page.evaluate(() => window.__bincov.app.lootContext.containerId), fixture.ids[1]);
        await action('close').tap();
        await page.locator(`[data-loot-target="${fixture.ids[0]}"] button`).tap();
        assert.equal(await page.evaluate(() => window.__bincov.app.lootContext.containerId), fixture.ids[0]);
        await action('close').tap();
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForFunction(() => !document.documentElement.classList.contains('mobile') && window.__bincov.app.overlay === 'pause');
        await action('close').click(); await page.mouse.move(660, 350);
        await page.waitForFunction(() => document.querySelectorAll('#interaction [data-loot-target]').length === 2);
        if (await page.locator('#interaction [aria-current]').getAttribute('data-loot-target') !== fixture.ids[0]) await page.mouse.wheel(0, -100);
        await page.waitForFunction(id => document.querySelector('#interaction [aria-current]')?.getAttribute('data-loot-target') === id, fixture.ids[0]);
        await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincov.app.overlay === 'loot');
        assert.equal(await page.evaluate(() => window.__bincov.app.lootContext.containerId), fixture.ids[0]);
    });
    await step('native layered split and rotation persist one part and retain the original remainder after reload', async () => {
        await page.locator('[data-source="container"][data-item-id="water"]').click();
        await page.locator('#split-quantity').fill('1'); await action('split-item').click(); await action('rotate-preview').click(); await clickSlot(page, 'bag');
        const split = await page.evaluate(() => ({ bag: window.__bincov.app.loadout.bag, box: window.__bincov.app.raid.getLootContainer(window.__bincov.app.lootContext.containerId) }));
        assert.equal(split.bag.items[0].qty, 1); assert.equal(split.bag.items[0].rotated, true); assert.equal(split.box.inventory.items[0].qty, 1);
        await page.reload(); await action('enter').click(); await page.waitForFunction(() => window.__bincov.app.raid?.player?.active); await action('close').click();
        assert.deepEqual(await page.evaluate(() => window.__bincov.app.loadout.bag), split.bag);
        assert.deepEqual(await page.evaluate(id => window.__bincov.app.raid.getLootContainer(id).inventory, fixture.ids[0]), split.box.inventory);
    });
    await step('actual layered enemy projectile displays its direction without closing loot; floor map keeps connector controls', async () => {
        await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincov.app.overlay === 'loot');
        await page.evaluate(() => {
            const { app, saveSession: s } = window.__bincov;
            const t = s.prepareExpansionMutation(d => {
                const raid = d.expansion.raid, layer = raid.maps[raid.currentMap], p = raid.player, owner = layer.enemies[0].uid;
                layer.bullets.push({ uid: `qol-hit-${raid.nextEntity++}`, x: p.x + 20, y: p.y, rotation: Math.PI, vx: -50, vy: 0, left: 40, damage: 1, enemy: true, owner });
            }); if (!t || s.commitExpansionMutation(t) !== 'committed') throw Error('Bullet fixture');
        });
        // Capture the one-second feedback in one browser turn, before the UI naturally expires.
        const hit = await page.waitForFunction(() => document.querySelectorAll('#hit-directions i').length > 0
            ? { overlay: window.__bincov.app.overlay, text: document.querySelector('#loot-hit')?.textContent } : false);
        const feedback = await hit.jsonValue();
        assert.equal(feedback.overlay, 'loot'); assert.match(feedback.text, /攻击/);
        await action('close').click(); await page.keyboard.press('m');
        assert.equal(await action('map-view').count(), 2); assert.equal(await page.locator('#exit-choice option').count(), 3);
        await action('map-view', 'mall-f2').click(); assert.equal(await page.evaluate(() => window.__bincov.app.raid.space.definition.id), 'mall-f1');
        await page.screenshot({ path: resolve(out, 'qol-expansion-map.png') });
    });
} finally { await writeFile(resolve(out, 'qol-expansion-report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
