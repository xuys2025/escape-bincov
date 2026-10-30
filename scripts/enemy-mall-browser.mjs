import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { raidReady, drive, frames } from './raid-view.mjs';
import { resumeStalls } from './stall-resume.mjs';
import { decodeSession, SESSION_KEY } from '../src/recovery-store.ts';
import { MALL_RAIDERS } from '../src/enemy-mall.ts';
import { enemyViewports } from './enemy-browser-plan.mjs';
import { actorArchetype } from '../src/enemy-archetypes.ts';

/** Native deployment, real stair activation and paid phases; only observation positions use test fixtures. */
export async function runMallEnemyCases(browser, report, out, { priorClient, priorClientCommit = '67a7468',
    viewports = enemyViewports, onViewportComplete = () => {} } = {}) {
    const entry = pathToFileURL(resolve('dist/index.html')).href;
    for (const viewport of viewports) {
        const touch = viewport.width < 1000;
        const context = await browser.newContext({ viewport, offline: true, hasTouch: touch, isMobile: touch });
        await resumeStalls(context);
        try {
            const page = await context.newPage(); page.setDefaultTimeout(60000);
            page.on('pageerror', e => report.errors.push(String(e)));
            page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
            await page.goto(entry + '?test=1&entry=tabs');
            await page.locator('[data-action="enter"]').click();
            await page.locator('#run-world').selectOption('mall');
            await page.locator('#seed').fill('42'); await page.locator('[data-action="deploy"]').click();
            await raidReady(page); await drive(page, 'freezeAI', true);
            const raw = await page.evaluate(key => localStorage.getItem(key), SESSION_KEY), original = decodeSession(raw);
            const raid = original.expansion.raid, team = raid.maps['mall-f2'].enemies.filter(e => e.tactics?.squad === MALL_RAIDERS);
            assert.equal(raid.worldVersion, 'mall-v4'); assert.equal(raid.version, 5); assert.equal(team.length, 3);
            assert.equal(raid.roster.length, 25);
            for (const e of team.filter(e => e.tactics.equipment)) {
                const combat = actorArchetype(e);
                assert.equal(e.tactics.ballistics, 1);
                assert.equal(e.tactics.magazine, Math.min(combat.magazine, combat.ballistics.budget));
                assert.equal(e.tactics.magazine + e.tactics.reserve, combat.ballistics.budget);
            }
            const ids = team.map(e => e.uid);
            assert.equal(await page.evaluate(ids => window.__bincovSample.host.lastBatch.frame.actors.some(a => ids.includes(a.uid)), ids), false, 'upstairs actors cannot leak to F1');
            report.cases.push({ viewport, scenario: 'native-mall-deployment', team: 3, population: 25, upstairsHiddenOnF1: true });
            const stair = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.entries.find(e => e.id === 'S-N-up'));
            await drive(page, 'placePlayer', stair.at, 0, 'mall-f1'); await frames(page, 3);
            if (touch) await page.locator('.coast-sample [data-act]').tap(); else await page.keyboard.press('e');
            await page.waitForFunction(() => window.__bincovSample.host.lastBatch.stamp.world.mapId === 'mall-f2');
            assert.equal(await page.evaluate(() => window.__bincovSample.host.lastBatch.stamp.world.worldVersion), 'mall-v4');
            report.cases.push({ viewport, scenario: 'native-mall-real-stair', input: touch ? 'native interaction tap' : 'native E' });
            const gunner = team.find(e => e.id === 'raider-gunner');
            await drive(page, 'placePlayer', { x: gunner.x + 128, y: gunner.y + 96 }, Math.PI, 'mall-f2'); await frames(page, 5);
            await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.coast-sample [data-fade]')).opacity) === 0);
            const art = await page.evaluate(ids => {
                const h = window.__bincovSample.host;
                return h.lastBatch.frame.actors.filter(a => ids.includes(a.uid)).map(a => {
                    const g = h.view.actors.get(a.uid);
                    return { uid: a.uid, role: a.tactics.archetype, style: h.view.tex.actorStyle(a.kind, a.tactics.archetype),
                        bodyArt: Array.from({ length: 5 }, (_, f) => h.view.tex.actor(a.kind, g.dir, f, a.tactics.archetype)).includes(g.body.texture) };
                });
            }, ids);
            assert.equal(art.length, 3); assert.ok(art.every(a => a.style === a.role && a.bodyArt));
            const image = `native-mall-raiders-${viewport.width}.png`;
            await page.screenshot({ path: resolve(out, image) }); report.screenshots.push(image);
            await drive(page, 'freezeAI', false);
            await page.waitForFunction(uid => {
                const a = window.__bincovSample.host.lastBatch.frame.actors.find(a => a.uid === uid);
                return a?.tactics && ['windup', 'release', 'recovery'].includes(a.tactics.phase);
            }, gunner.uid);
            if (touch) await page.locator('.coast-sample [data-pause]').tap(); else await page.keyboard.press('Escape');
            await page.waitForFunction(() => window.__bincovSample.host.panel === 'pause');
            const paidRaw = await page.evaluate(key => localStorage.getItem(key), SESSION_KEY), paid = decodeSession(paidRaw);
            await page.reload(); await page.locator('[data-action="enter"]').click(); await raidReady(page);
            const restored = decodeSession(await page.evaluate(key => localStorage.getItem(key), SESSION_KEY));
            assert.deepEqual(restored.expansion.raid, paid.expansion.raid, 'paid phase, finite ammo, crates and full floors survive real reload');
            for (const key of ['gunsBackup', 'systemsBackup', 'perksBackup', 'enemyBackup']) assert.equal(restored[key], paid[key]);
            report.cases.push({ viewport, scenario: 'native-mall-art-and-paid-restore', screenshot: image, art, exactRaidRestored: true, backupByteIdentity: true });
            if (priorClient && !touch && viewport.width === 1280) {
                // Test the actual accepted previous HTML, never a rewritten copy of its decoder.
                const old = await browser.newContext({ viewport, offline: true });
                try {
                    const p = await old.newPage(); p.on('pageerror', e => report.errors.push(String(e)));
                    await p.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [SESSION_KEY, paidRaw]);
                    await p.goto(pathToFileURL(resolve(priorClient)).href + '?test=1&entry=tabs');
                    await p.locator('[data-action="enter"]').click(); await raidReady(p);
                    const read = decodeSession(await p.evaluate(key => localStorage.getItem(key), SESSION_KEY));
                    assert.deepEqual(read.expansion.raid, paid.expansion.raid);
                    for (const key of ['gunsBackup', 'systemsBackup', 'perksBackup', 'enemyBackup']) assert.equal(read[key], paid[key]);
                    assert.equal(await p.evaluate(() => window.__bincov.app.storageError), '');
                    report.cases.push({ viewport, scenario: `native-mall-prior-${priorClientCommit}-client`, exactRaidRestored: true, backupByteIdentity: true });
                } finally { await old.close(); }
            }
            console.log(`PASS native mall ${viewport.width}: deployment, hidden F1, real stair, own art, paid phase and exact refresh`);
        } finally { await context.close(); }
        onViewportComplete(viewport);
    }
}
