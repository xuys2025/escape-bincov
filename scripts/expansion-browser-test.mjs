import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const root = resolve('test-results'); await mkdir(root, { recursive: true });
const oldPath = resolve(process.argv[2] ?? 'test-results/pre-m0.html');
const [legacy, current] = await Promise.all([readFile(oldPath, 'utf8'), readFile(resolve('dist/index.html'), 'utf8')]);
const hash = text => createHash('sha256').update(text).digest('hex');
const legacyClients = {
    '2984e201d2b33c0f242e2c290f01425652463ef20b25df47b528471b4be5e731': '49738b89cc8556a0b39d339239bf09945e44ab9e',
    'e748efcbad1bb2cde79e3898d9faafc62085e9dee51411df64b2c2cd2d708efc': '07b1414da9f1ac4c3ad13a23ec914630ccbd7fbb',
};
assert.ok(Object.hasOwn(legacyClients, hash(legacy)), 'Use an actual pinned pre-expansion main HTML, not a simulated old decoder');
const report = { startedAt: new Date().toISOString(), baseline: legacyClients[hash(legacy)],
    legacySha256: hash(legacy), currentSha256: hash(current), steps: [], errors: [], unexpectedRequests: [],
    methodology: 'Injected session clock for exact persistence snapshots (not a timing test). Real pinned main HTML and current bundle on one locally fulfilled HTTPS origin, offline; explicit test-only extension fixture. No new map/gameplay/UI acceptance is claimed.' };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, acceptDownloads: true });
await context.route('https://bincov-expansion.test/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
    body: new URL(route.request().url()).pathname.startsWith('/legacy') ? legacy : current }));
context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('https://bincov-expansion.test/')) report.unexpectedRequests.push(request.url()); });
context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
const raw = page => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const action = (page, name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
const ready = async page => {
    await page.waitForFunction(() => !!window.__bincov?.saveSession);
    // Persistence fixture only: leave Phaser's browser clock and real input scheduling intact.
    if (new URL(page.url()).pathname.startsWith('/current')) await page.evaluate(() => { window.__bincov.saveSession.now = () => 1800000000000; });
};
async function failStorage(page, on, terminalOnly = false) {
    await page.evaluate(({ on, terminalOnly }) => {
        window.__m0Write ??= Storage.prototype.setItem;
        Storage.prototype.setItem = on ? function (key, value) {
            if (key === 'escape-bincov.session.v2' && (!terminalOnly || !JSON.parse(value).profile.activeRun)) throw new DOMException('M0 quota fault', 'QuotaExceededError');
            return window.__m0Write.call(this, key, value);
        } : window.__m0Write;
    }, { on, terminalOnly });
}
async function step(name, work) {
    const result = { name, status: 'running' }; report.steps.push(result);
    try { await work(); assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpectedRequests, []); result.status = 'passed'; console.log('PASS', name); }
    catch (error) { result.status = 'failed'; result.error = error.stack; throw error; }
}
let old = await context.newPage(), page = await context.newPage(), preUpgrade;
try {
    await step('the actual v3 main client creates progress; new client respects its lock then takes over', async () => {
        await old.goto('https://bincov-expansion.test/legacy?test=1&entry=tabs'); await ready(old); await action(old, 'enter').click();
        assert.equal(await old.evaluate(() => { window.__bincov.app.save.cash = 1842; return window.__bincov.persist(); }), true);
        const bytes = await raw(old);
        await page.goto('https://bincov-expansion.test/current?test=1&entry=tabs'); await ready(page);
        assert.equal(await page.evaluate(() => window.__bincov.app.storageOK), false); assert.equal(await raw(page), bytes);
        await old.close(); await page.reload(); await ready(page); // Inspect v3 before the mandatory station-boundary upgrade.
        assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 1842);
        preUpgrade = await raw(page); assert.equal(JSON.parse(preUpgrade).version, 3);
    });
    await step('activation quota failure preserves original bytes; retry retains one exact rollback record', async () => {
        await failStorage(page, true);
        assert.equal(await page.evaluate(() => window.__bincov.saveSession.enableExpansion(1000)), false);
        assert.equal(await raw(page), preUpgrade); assert.equal(await page.evaluate(() => window.__bincov.app.expansion), null);
        await failStorage(page, false);
        assert.equal(await page.evaluate(() => window.__bincov.saveSession.enableExpansion(1000)), true);
        assert.equal(JSON.parse(await raw(page)).systemsBackup, preUpgrade);
        assert.equal(await page.evaluate(() => {
            const { saveSession } = window.__bincov;
            const ticket = saveSession.prepareExpansionMutation(d => { d.expansion.body.hp = 37; d.expansion.growth.progress.technique = .2; });
            return saveSession.commitExpansionMutation(ticket);
        }), 'committed');
    });
    await step('the actual old HTML rejects v4 both with and without the writer lock, preserving every byte', async () => {
        const bytes = await raw(page); old = await context.newPage();
        await old.goto('https://bincov-expansion.test/legacy?test=1&entry=tabs'); await ready(old);
        assert.equal(await old.evaluate(() => window.__bincov.app.storageOK), false);
        assert.match(await old.evaluate(() => window.__bincov.app.storageError), /兼容|无法读取/);
        assert.equal(await old.evaluate(() => window.__bincov.persist()), false); assert.equal(await raw(old), bytes);
        await page.close(); await old.reload(); await ready(old);
        assert.equal(await old.evaluate(() => window.__bincov.app.storageOK), false);
        assert.equal(await old.evaluate(() => window.__bincov.persist()), false); assert.equal(await raw(old), bytes);
        await old.close(); page = await context.newPage();
        await page.goto('https://bincov-expansion.test/current?test=1&entry=tabs'); await ready(page); await action(page, 'enter').click();
        assert.equal(JSON.parse(await raw(page)).systemsBackup, preUpgrade);
    });
    await step('settled native export includes the full extension; cancel/failure/confirmation preserve atomic import', async () => {
        await action(page, 'tab', 'home').click();
        const [download] = await Promise.all([page.waitForEvent('download'), action(page, 'export-save').click()]);
        const path = resolve(root, 'expansion-settled.json'); await download.saveAs(path);
        const backup = JSON.parse(await readFile(path, 'utf8')); assert.equal(backup.formatVersion, 4);
        assert.equal(backup.record.expansion.body.hp, 37); assert.equal(backup.record.expansion.growth.progress.technique, .2);
        const changed = structuredClone(backup); changed.record.profile.cash = 2842;
        const changedPath = resolve(root, 'expansion-import-fixture.json'); await writeFile(changedPath, JSON.stringify(changed));
        const before = await raw(page); await page.locator('#backup-file').setInputFiles(changedPath); await action(page, 'close').click(); assert.equal(await raw(page), before);
        await page.locator('#backup-file').setInputFiles(changedPath); await failStorage(page, true); await action(page, 'confirm-import').click();
        assert.equal(await raw(page), before); assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 1842);
        await failStorage(page, false); await action(page, 'confirm-import').click(); await action(page, 'enter').click();
        assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 2842);
        assert.equal(await page.evaluate(() => window.__bincov.app.expansion.growth.progress.technique), .2);
        await page.reload(); await ready(page); await action(page, 'enter').click();
        assert.equal(await page.evaluate(() => window.__bincov.app.save.cash), 2842);
    });
    await step('legacy coast still deploys/resumes; failed abandon exports pending body/growth and retries only once', async () => {
        await action(page, 'tab', 'gear').click(); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
        await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
        await page.keyboard.press('Escape');
        await page.evaluate(() => { const { app } = window.__bincov; app.raid.hp = 37; app.raid.stamina = 15; app.raid.pollution = 63; app.raid.checkpoint(); });
        await page.reload(); await ready(page); await action(page, 'enter').click();
        await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
        assert.equal(await page.evaluate(() => window.__bincov.app.raid.hp), 37);
        await failStorage(page, true, true); await action(page, 'abandon').click();
        const bytes = await raw(page); await action(page, 'confirm-abandon').click();
        await page.getByRole('heading', { name: '结算尚未保存' }).waitFor(); assert.equal(await raw(page), bytes);
        const pending = await page.evaluate(() => window.__bincov.app.pendingExpansion); assert.equal(pending.body.hp, 37);
        const [download] = await Promise.all([page.waitForEvent('download'), action(page, 'export-save').click()]);
        const path = resolve(root, 'expansion-pending.json'); await download.saveAs(path);
        const backup = JSON.parse(await readFile(path, 'utf8'));
        assert.equal(backup.record.expansion.growth.progress.technique, .2); assert.equal(backup.record.expansion.body.hp, 37);
        assert.equal(backup.record.expansion.base.location, 'settlement'); assert.equal(backup.record.terminal.reason, 'abandon');
        assert.equal(backup.record.profile.activeRun, null); assert.equal(backup.record.raid, null);
        await page.screenshot({ path: resolve(root, 'm0-pending-1280x720.png') });
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.screenshot({ path: resolve(root, 'm0-pending-1920x1080.png') });
        await failStorage(page, false); await action(page, 'retry-save').click();
        assert.equal(await page.evaluate(() => window.__bincov.app.state), 'result');
        assert.equal(await page.evaluate(() => window.__bincov.saveSession.retrySettlement()), false);
        assert.equal(JSON.parse(await raw(page)).profile.stats.runs, 1);
        assert.equal(JSON.parse(await raw(page)).expansion.base.location, 'base');
    });
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; report.diagnostic = await page.evaluate(() => ({state:window.__bincov?.app.state, overlay:window.__bincov?.app.overlay, error:window.__bincov?.app.storageError})).catch(()=>null); console.error(error); process.exitCode = 1; }
finally { await context.close(); await browser.close(); report.finishedAt = new Date().toISOString(); await writeFile(resolve(root, 'expansion-browser-report.json'), JSON.stringify(report, null, 2)); }
