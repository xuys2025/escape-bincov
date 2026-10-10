/** Acceptance of the shared ZIP through normal, offline player controls. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { executablePath, browserOptions } from './browser-options.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archive = join(root, 'release', 'Escape-Bincov-portable.zip');
const expectedFiles = ['README-游玩说明.txt', 'start the game.html'].sort();
const sourceEntry = join(root, 'start the game.html');
const reportPath = join(root, 'test-results', 'portable-report.json');
const temporaryPrefix = '滨科夫 portable test ';
const report = {
  portable: false,
  status: 'running',
  startedAt: new Date().toISOString(),
  archive,
  browser: executablePath,
  offline: true,
  viewport: { width: 1280, height: 720 },
  steps: [],
  externalRequests: [],
  unexpectedFileRequests: [],
  errors: [],
  methodology: 'Extract the shared ZIP outside the workspace; open its file:// HTML without test hooks; use real buttons and keyboard/mouse input; read the visible HUD. No fixtures, original assets, server, screenshots, or internet access.',
};
let browser;
let temporaryDirectory;
let temporaryRoot;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = error => {
  report.portable = false;
  report.status = 'failed';
  report.errors.push({ type: 'acceptance', message: error.stack || String(error) });
  process.exitCode = 1;
};
async function step(name, work) {
  const item = { name, status: 'running' };
  report.steps.push(item);
  try {
    const detail = await work();
    assert.deepEqual(report.externalRequests, [], 'The portable game attempted HTTP(S) access');
    assert.deepEqual(report.unexpectedFileRequests, [], 'The portable game attempted to load another local file');
    assert.deepEqual(report.errors, [], 'The portable game emitted browser errors');
    item.status = 'passed';
    if (detail !== undefined) item.detail = detail;
  } catch (error) {
    item.status = 'failed';
    throw error;
  }
}

try {
  await Promise.all([access(archive), access(sourceEntry), access(executablePath)]);
  temporaryRoot = await realpath(tmpdir());
  temporaryDirectory = await mkdtemp(join(temporaryRoot, temporaryPrefix));
  report.extractionDirectory = temporaryDirectory;

  await step('extract exactly the two portable files into a fresh Chinese and space path', async () => {
    // Paths are environment values, never interpolated into PowerShell source.
    // Inspect names before extraction, so an unexpected archive path cannot escape.
    if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$expected = ConvertFrom-Json -InputObject $env:BINCOV_PORTABLE_EXPECTED
$zip = [System.IO.Compression.ZipFile]::OpenRead($env:BINCOV_PORTABLE_ARCHIVE)
try {
    if ($zip.Entries.Count -ne $expected.Count) { throw 'Portable ZIP must contain exactly two files.' }
    $seen = @()
    foreach ($entry in $zip.Entries) {
        if ($expected -cnotcontains $entry.FullName -or $seen -ccontains $entry.FullName) {
            throw 'Portable ZIP contains an unexpected or duplicate entry.'
        }
        $seen += $entry.FullName
    }
} finally { $zip.Dispose() }
[System.IO.Compression.ZipFile]::ExtractToDirectory($env:BINCOV_PORTABLE_ARCHIVE, $env:BINCOV_PORTABLE_DESTINATION)
`], {
      env: {
        ...process.env,
        BINCOV_PORTABLE_ARCHIVE: archive,
        BINCOV_PORTABLE_DESTINATION: temporaryDirectory,
        BINCOV_PORTABLE_EXPECTED: JSON.stringify(expectedFiles),
      },
      windowsHide: true,
      stdio: 'pipe',
      timeout: 60000,
    });
    else execFileSync('python3', ['-c', `
import json, os, zipfile
with zipfile.ZipFile(os.environ['BINCOV_PORTABLE_ARCHIVE']) as archive:
    expected = sorted(json.loads(os.environ['BINCOV_PORTABLE_EXPECTED']))
    if sorted(archive.namelist()) != expected:
        raise ValueError('Portable ZIP has unexpected or duplicate entries')
    if archive.testzip() is not None:
        raise ValueError('Portable ZIP checksum failed')
    archive.extractall(os.environ['BINCOV_PORTABLE_DESTINATION'])
`], { env: { ...process.env, BINCOV_PORTABLE_ARCHIVE: archive, BINCOV_PORTABLE_DESTINATION: temporaryDirectory, BINCOV_PORTABLE_EXPECTED: JSON.stringify(expectedFiles) }, timeout: 60000 });
    const entries = await readdir(temporaryDirectory, { withFileTypes: true });
    assert.deepEqual(entries.map(entry => entry.name).sort(), expectedFiles);
    assert.ok(entries.every(entry => entry.isFile()), 'Both archive entries must be regular files');
    const [source, extracted, archiveBytes] = await Promise.all([
      readFile(sourceEntry),
      readFile(join(temporaryDirectory, 'start the game.html')),
      readFile(archive),
    ]);
    assert.ok(source.equals(extracted), 'The extracted HTML must be byte-identical to the shareable entry');
    report.sha256 = sha256(extracted);
    assert.equal(report.sha256, sha256(source));
    report.archiveSha256 = sha256(archiveBytes);
    report.htmlBytes = extracted.length;
    report.archiveBytes = archiveBytes.length;
    report.files = entries.map(entry => entry.name).sort();
    return { files: report.files, htmlBytes: report.htmlBytes, sha256: report.sha256 };
  });

  const entryURL = pathToFileURL(join(temporaryDirectory, 'start the game.html')).href;
  report.entry = entryURL;
  assert.equal(new URL(entryURL).search, '', 'Normal play must not include the test query parameter');
  browser = await chromium.launch(browserOptions);
  report.browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: report.viewport,
    deviceScaleFactor: 1,
    offline: true,
    serviceWorkers: 'block',
  });
  context.on('request', request => {
    const url = request.url();
    if (/^https?:/i.test(url)) report.externalRequests.push(url);
    if (/^file:/i.test(url) && url.split('#')[0] !== entryURL) report.unexpectedFileRequests.push(url);
  });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/i.test(url)) return route.abort('internetdisconnected');
    if (/^file:/i.test(url) && url.split('#')[0] !== entryURL) return route.abort('accessdenied');
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.errors.push({ type: 'pageerror', message: error.stack || error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ type: 'console', message: message.text() });
  });
  const action = name => page.locator(`[data-action="${name}"]`);

  await step('normal offline entry shows the menu without exposing test hooks', async () => {
    await page.goto(entryURL, { waitUntil: 'load' });
    await page.locator('#game canvas').waitFor({ state: 'visible' });
    await action('enter').waitFor({ state: 'visible' });
    assert.match(await page.locator('h1').innerText(), /逃离[\s\S]*滨科夫/);
    assert.equal(await page.evaluate(() => '__bincov' in window), false, 'Normal play must not expose window.__bincov');
    report.testHookAbsent = true;
  });

  await step('enter the safe house and deploy seed 42 using real buttons', async () => {
    await action('enter').click();
    // The ordinary entry is the station yard; its departure panel deploys with the same seed field.
    await page.locator('#station-yard [data-quick="deploy"]').click();
    await page.locator('#station-yard #seed').fill('42');
    assert.equal(await page.locator('#station-yard #seed').inputValue(), '42');
    await page.locator('#station-yard [data-act="deploy"]').click();
    await page.locator('#timer').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /^08\s*\//.test(document.getElementById('ammo')?.textContent || ''));
    const timerAtDeploy = (await page.locator('#timer').innerText()).trim();
    assert.match(timerAtDeploy, /^\d{2}:\d{2}$/);
    await page.waitForFunction(before => {
      const timer = document.getElementById('timer')?.textContent?.trim();
      return /^\d{2}:\d{2}$/.test(timer || '') && timer !== before;
    }, timerAtDeploy, { timeout: 5000 });
    const timerAfter = (await page.locator('#timer').innerText()).trim();
    const seconds = value => value.split(':').reduce((minutes, part) => minutes * 60 + Number(part), 0);
    assert.ok(seconds(timerAfter) < seconds(timerAtDeploy), 'The visible action clock must count down');
    report.seed = 42;
    report.timer = { atDeploy: timerAtDeploy, after: timerAfter, countedDown: true };
    return report.timer;
  });

  await step('one real left click fires one round: 8 to 7', async () => {
    const before = Number.parseInt(await page.locator('#ammo').innerText(), 10);
    assert.equal(before, 8);
    const canvas = await page.locator('#game canvas').boundingBox();
    assert.ok(canvas && canvas.width > 0 && canvas.height > 0, 'A visible game canvas is required');
    const target = { x: canvas.x + canvas.width * 0.58, y: canvas.y + canvas.height * 0.5 };
    await page.mouse.click(target.x, target.y, { button: 'left', delay: 90 });
    await page.waitForFunction(() => /^07\s*\//.test(document.getElementById('ammo')?.textContent || ''));
    const after = Number.parseInt(await page.locator('#ammo').innerText(), 10);
    assert.equal(after, 7);
    report.ammo = { before, after, input: 'real left mouse click', target };
    return report.ammo;
  });

  await step('Tab opens the action inventory and its close button dismisses it', async () => {
    await page.keyboard.press('Tab');
    await page.locator('.inventory-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.inventory-modal .inventory-header strong').innerText(), '随身物资');
    await page.locator('.inventory-modal [data-grid="bag"]').waitFor({ state: 'visible' });
    await page.locator('.inventory-modal [data-grid="safe"]').waitFor({ state: 'visible' });
    await action('close').click();
    await page.locator('.inventory-modal').waitFor({ state: 'detached' });
    report.inventory = { openedWithTab: true, closedWithButton: true };
    return report.inventory;
  });

  await step('Escape pauses play and the visible clock stays unchanged', async () => {
    const running = (await page.locator('#timer').innerText()).trim();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: '行动暂停', exact: true }).waitFor({ state: 'visible' });
    const before = (await page.locator('#timer').innerText()).trim();
    assert.ok(before <= running, 'Opening pause must not reset the visible clock to 10:00');
    await page.waitForTimeout(1500);
    const after = (await page.locator('#timer').innerText()).trim();
    assert.equal(after, before, 'The pause clock must remain unchanged for more than one displayed second');
    assert.equal(await page.evaluate(() => '__bincov' in window), false);
    report.pause = { before, after, observedMs: 1500, unchanged: true };
    return report.pause;
  });
  report.portable = true;
  report.status = 'passed';
} catch (error) {
  fail(error);
} finally {
  try {
    if (browser) await browser.close();
  } catch (error) {
    fail(error);
  }
  try {
    if (temporaryDirectory) {
      // Remove only our freshly created direct child of the canonical OS temp
      // directory. Resolve and verify the exact target before recursive cleanup.
      const target = await realpath(temporaryDirectory);
      const info = await lstat(temporaryDirectory);
      assert.equal(info.isSymbolicLink(), false, 'Refuse cleanup through a symbolic link');
      assert.equal(info.isDirectory(), true, 'Refuse cleanup of a non-directory');
      assert.equal(target, temporaryDirectory, 'Refuse cleanup if the owned temporary path changed');
      assert.equal(dirname(target), temporaryRoot, 'Cleanup must remain directly inside the OS temp directory');
      assert.ok(basename(target).startsWith(temporaryPrefix), 'Cleanup must match the owned temporary prefix');
      await rm(target, { recursive: true, force: false });
      report.temporaryDirectoryRemoved = true;
    }
  } catch (error) {
    fail(error);
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
