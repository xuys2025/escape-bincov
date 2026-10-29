import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import * as D from '../src/domain.ts';
import { initialCheckpoint } from '../src/checkpoint.ts';
import { generateRun } from '../src/world.ts';
import { SESSION_KEY, SESSION_MAX_BYTES, decodeSession } from '../src/recovery-store.ts';
import { encodeRecoveryBackup } from '../src/save-backup.ts';
import { prototypeWorld, prototypeRaid } from '../tests/fixtures/layered.ts';

const world = prototypeWorld(); world.enemyCount = 25;
const geometry = (cols, rows) => Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => !x || !y || x === cols - 1 || y === rows - 1 ? 'wall' : 'floor'));
world.maps.downstairs.cells = geometry(72, 52); world.maps.upstairs.cells = geometry(64, 48);
world.maps.basement = { id: 'basement', name: '容量夹具地下层', floor: 'B1', tile: 32, doors: [], entries: [], cells: geometry(32, 24) };
// This geometry is a capacity fixture; it does not represent finished resident/mall content.
const profile = D.newSave(), state = prototypeRaid(profile, world);
const raid = state.raid, template = raid.maps.downstairs.enemies[1];
raid.roster = []; raid.maps.downstairs.enemies = []; raid.maps.downstairs.bullets = [];
for (let i = 0; i < 25; i++) {
    const layer = raid.maps[Object.keys(world.maps)[i % 3]], enemy = structuredClone(template);
    Object.assign(enemy, { uid: `enemy-${i}`, x: 48 + Math.floor(i / 3) * 32, y: 80 });
    enemy.home = { x: enemy.x, y: enemy.y }; enemy.target = { ...enemy.home };
    layer.enemies.push(enemy); raid.roster.push({ uid: enemy.uid, id: enemy.id });
}
for (let i = 0; i < 40; i++) raid.maps[Object.keys(world.maps)[i % 3]].loot.push({ uid: `loot-${i}`, id: 'food', qty: 1, relief: false, x: 48 + Math.floor(i / 3) * 32, y: 144 });
for (let i = 0; i < 10; i++) {
    const inventory = D.createInventory(6, 5); D.addItem(inventory, 'bandage', 1); D.addItem(inventory, 'water', 1);
    raid.maps[Object.keys(world.maps)[i % 3]].containers.push({ id: `crate-${i}`, name: '容量夹具', kind: 'crate', runId: raid.runId, x: 48 + i * 32, y: 208, inventory });
}
const oldProfile = D.newSave(), oldRaid = initialCheckpoint(generateRun(42), D.beginRun(oldProfile, 42));
const archive = { format: 'escape-bincov-session', version: 9, revision: 5, savedAt: 1000, profile: oldProfile, raid: oldRaid, terminal: null,
    legacyBackup: JSON.stringify({ ...D.newSave(), version: 1 }), migrationBackup: null, gunsBackup: null, layoutBackup: null };
decodeSession(JSON.stringify(archive));
const record = { ...archive, revision: 6, profile, raid: null, expansion: state, systemsBackup: JSON.stringify(archive) };
const resolver = id => id === world.id ? world : undefined;
const bytes = text => new TextEncoder().encode(text).length;
const summary = numbers => { const sorted = numbers.sort((a, b) => a - b); return { samples: sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) }; };
const report = { startedAt: new Date().toISOString(), node: process.version, platform: process.platform, fixture: { maps: Object.fromEntries(Object.entries(world.maps).map(([id, m]) => [id, { cols: m.cells[0].length, rows: m.cells.length }])), enemies: 25, scattered: 40, originalContainerRecords: 20, containers: 10 },
    methodology: 'Synthetic validated three-map snapshot, actual v3 coast checkpoint retained as pre-v4 archive. Repeated JSON encoding, strict decoding and real localStorage writes in headless Chromium. Not a gameplay frame/phone performance claim.', sizes: {}, timings: {} };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
try {
    const context = await browser.newContext({ offline: true }); const page = await context.newPage();
    await page.route('https://bincov-capacity.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage benchmark fixture</title>' }));
    await page.goto('https://bincov-capacity.test/');
    for (const [name, projectiles] of [['budget', 20], ['validatorLimit', 1000]]) {
        raid.maps.downstairs.bullets = Array.from({ length: projectiles }, (_, i) => ({ uid: `shot-${i}`, x: 48, y: 48, rotation: 0, vx: 500, vy: 0, left: 440, damage: 27, enemy: false }));
        const text = JSON.stringify(record); decodeSession(text, resolver); assert.ok(bytes(text) < SESSION_MAX_BYTES);
        const portable = encodeRecoveryBackup(record, resolver);
        report.sizes[name] = { mainBytes: bytes(text), preV4Bytes: bytes(record.systemsBackup), mainWithoutArchivesBytes: bytes(JSON.stringify({ ...record, systemsBackup: null, legacyBackup: null })), portableBytes: bytes(portable), limitBytes: SESSION_MAX_BYTES };
        const encoding = [], decoding = [];
        for (let i = 0; i < 60; i++) {
            let start = performance.now(); JSON.stringify(record); encoding.push(performance.now() - start);
            start = performance.now(); decodeSession(text, resolver); decoding.push(performance.now() - start);
        }
        const writes = await page.evaluate(({ text, key }) => {
            const results = [];
            for (let i = 0; i < 60; i++) {
                const value = JSON.parse(text); value.revision += i;
                const start = performance.now(); localStorage.setItem(key, JSON.stringify(value)); results.push(performance.now() - start);
            }
            if (!localStorage.getItem(key)) throw new Error('Browser did not store the benchmark record');
            return results;
        }, { text, key: SESSION_KEY });
        report.timings[name] = { encodeMilliseconds: summary(encoding), strictDecodeMilliseconds: summary(decoding), encodeAndLocalStorageMilliseconds: summary(writes) };
    }
    assert.throws(() => decodeSession(JSON.stringify({ ...record, systemsBackup: 'x'.repeat(SESSION_MAX_BYTES) }), resolver), /无法读取/);
    await context.close(); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally {
    await browser.close(); report.finishedAt = new Date().toISOString(); await mkdir(resolve('test-results'), { recursive: true });
    await writeFile(resolve('test-results/expansion-benchmark.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, sizes: report.sizes, timings: report.timings }, null, 2));
}
