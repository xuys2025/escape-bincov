import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { browserGroups, choosePlan, fingerprint, fullyTested, isDocumentation } from './policy.mjs';
import { checkDocumentation, localLinks } from './check-docs.mjs';
import { allSuiteIds, manualSuites, oldClientGroup, suitesForGroup } from './browser-suites.mjs';

const entry = (path, sha = 'a'.repeat(40), mode = '100644', type = 'blob') => ({ path, sha, mode, type });
const source = entry('src/session.ts'), doc = entry('docs/MAIN-STORY.md');
const repository = 'xuys2025/escape-bincov';
const run = { id: 123, repository: { full_name: repository }, head_branch: 'main', event: 'push',
  status: 'completed', conclusion: 'success', path: '.github/workflows/ci-pages.yml', head_sha: 'a'.repeat(40) };
const allJobs = ['Build shared game', 'Build and test', 'Deploy Pages', ...browserGroups.map(g => `Browser / ${g}`)]
  .map(name => ({ name, status: 'completed', conclusion: 'success' }));
const fixture = (extra = {}) => ({ eventName: 'pull_request', repository, current: [source, doc], base: [source],
  runs: async () => [run], tree: async () => [source], jobs: async () => allJobs, ...extra });

test('documentation allowlist excludes build inputs, arbitrary files, symlinks and submodules', () => {
  for (const path of ['README.md', 'handoff.md', 'AGENTS.md', 'docs/story/CH01-MARKET-SLICE.md',
    'docs/story/GEMINI-RETURN-MANIFEST-20261014.json', '.github/pull_request_template.md']) assert.ok(isDocumentation(entry(path)), path);
  for (const path of ['THIRD_PARTY_NOTICES.md', 'README-游玩说明.txt', 'docs/release-manifest.json',
    'docs/runtime.json', 'assets/license.md', 'scripts/test.mjs', 'tests/save.test.ts',
    '.github/workflows/ci-pages.yml', '.github/PULL_REQUEST_TEMPLATE.md', 'package.json', 'pnpm-lock.yaml', 'docs/new.png', 'new.md']) {
    assert.ok(!isDocumentation(entry(path)), path);
    assert.notEqual(fingerprint([source]), fingerprint([source, entry(path)]));
  }
  assert.ok(!isDocumentation(entry('docs/link.md', 'b'.repeat(40), '120000')));
  assert.ok(!isDocumentation(entry('docs/submodule.md', 'b'.repeat(40), '160000', 'commit')));
});

test('fingerprint detects file deletion, rename, permission change, tests, lockfile and generated artifacts', () => {
  assert.equal(fingerprint([source, doc]), fingerprint([entry('docs/a.md'), source]));
  for (const after of [[], [entry('src/renamed.ts')], [entry(source.path, source.sha, '100755')],
    [source, entry('tests/save.test.ts')], [source, entry('pnpm-lock.yaml')], [source, entry('dist/index.html')]]) {
    assert.notEqual(fingerprint([source]), fingerprint(after));
  }
});

test('docs PR and docs main reuse only the same fully validated content', async () => {
  for (const eventName of ['pull_request', 'push']) {
    const plan = await choosePlan(fixture({ eventName }));
    assert.equal(plan.browserRequired, false); assert.equal(plan.validatedRun, run.id);
    assert.deepEqual(plan.changed, ['docs/MAIN-STORY.md']);
  }
});

test('the tracked PR template can reuse only matching fully tested main content', async () => {
  const path = '.github/pull_request_template.md';
  readFileSync(resolve(path), 'utf8'); // Check the actual case-sensitive repository path before planning a change.
  const original = entry(path), edited = entry(path, 'b'.repeat(40));
  for (const eventName of ['pull_request', 'push']) {
    const inputs = fixture({ eventName, base: [source, original], current: [source, edited], tree: async () => [source, original] });
    const plan = await choosePlan(inputs);
    assert.equal(plan.browserRequired, false);
    assert.equal(plan.validatedRun, run.id);
    assert.deepEqual(plan.changed, [path]);
    assert.equal((await choosePlan({ ...inputs, runs: async () => [] })).browserRequired, true);
    assert.equal((await choosePlan({ ...inputs, current: [entry(source.path, 'c'.repeat(40)), edited] })).browserRequired, true);
    assert.equal((await choosePlan({ ...inputs, current: [source, entry(path, edited.sha, '100755')] })).browserRequired, true);
  }
});

test('whole PR comparison catches code followed by a final documentation commit', async () => {
  assert.equal((await choosePlan(fixture({ current: [entry(source.path, 'b'.repeat(40)), doc] }))).browserRequired, true);
  assert.equal((await choosePlan(fixture({ base: undefined }))).browserRequired, true);
});

test('main docs after a cancelled/untested code push cannot reuse the last release', async () => {
  const changed = [entry(source.path, 'b'.repeat(40)), doc];
  assert.equal((await choosePlan(fixture({ eventName: 'push', current: changed }))).browserRequired, true);
  // Even a docs-only PR on an unvalidated main must run full regression.
  assert.equal((await choosePlan(fixture({ current: changed, base: changed.slice(0, 1) }))).browserRequired, true);
});

test('manual runs always perform full regression', async () => {
  for (const eventName of ['workflow_dispatch', 'unknown']) {
    assert.equal((await choosePlan(fixture({ eventName }))).browserRequired, true);
  }
});

test('missing, failed, cancelled, duplicate and skipped groups cannot authorize reuse', async () => {
  assert.ok(fullyTested(allJobs));
  for (const bad of [allJobs.slice(1), [...allJobs, allJobs[0]],
    ...['failure', 'cancelled', 'skipped'].map(conclusion => allJobs.map(j => j.name === `Browser / ${browserGroups[0]}` ? { ...j, conclusion } : j))]) {
    assert.ok(!fullyTested(bad));
    assert.equal((await choosePlan(fixture({ jobs: async () => bad }))).browserRequired, true);
  }
});

test('previous eight-group job names cannot authorize the new schedule', () => {
  const previousGroups = ['visual', 'title', 'inventory', 'station-inventory', 'raid-inventory', 'input', 'world', 'training'];
  const previousJobs = allJobs.filter(j => !j.name.startsWith('Browser /')).concat(
    previousGroups.map(group => ({ name: `Browser / ${group}`, status: 'completed', conclusion: 'success' })));
  assert.equal(fullyTested(previousJobs), false);
});

test('PR, different repository/workflow and unsuccessful main runs are not evidence', async () => {
  for (const patch of [{ event: 'pull_request' }, { head_branch: 'feature' }, { conclusion: 'failure' },
    { status: 'in_progress' }, { path: '.github/workflows/other.yml' }, { repository: { full_name: 'other/repo' } }]) {
    assert.equal((await choosePlan(fixture({ runs: async () => [{ ...run, ...patch }] }))).browserRequired, true);
  }
});

test('API failures and missing history fall back to full regression', async () => {
  for (const field of ['runs', 'tree', 'jobs']) {
    assert.equal((await choosePlan(fixture({ [field]: async () => { throw Error('unavailable/truncated'); } }))).browserRequired, true);
  }
  assert.equal((await choosePlan(fixture({ runs: async () => [] }))).browserRequired, true);
});

test('docs runs are never transitive evidence; find an earlier full run', async () => {
  const docsRun = { ...run, id: 124 };
  const plan = await choosePlan(fixture({ runs: async () => [docsRun, run],
    jobs: async id => id === docsRun.id ? allJobs.map(j => j.name.startsWith('Browser /') ? { ...j, conclusion: 'skipped' } : j) : allJobs }));
  assert.equal(plan.validatedRun, 123);
});

test('new documentation links are checked with real Git history, including encoded Chinese names', t => {
  const root = mkdtempSync(join(tmpdir(), 'bincov-ci-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'README.md'), '[historical](missing.md)\n');
  writeFileSync(join(root, 'docs', '指南.md'), 'fixture\n');
  git('add', '.'); git('commit', '-m', 'fixture base'); const base = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(root, 'README.md'), '[historical](missing.md)\n[new](docs/%E6%8C%87%E5%8D%97.md#heading)\n');
  git('add', '.'); git('commit', '-m', 'valid link'); checkDocumentation(['README.md'], base, root);
  writeFileSync(join(root, 'README.md'), '[new](docs/absent.md)\n');
  git('add', '.'); git('commit', '-m', 'bad link'); assert.throws(() => checkDocumentation(['README.md'], base, root), /Broken/);
  assert.deepEqual(localLinks('```md\n[x](missing)\n```\n[a](https://example.com) [b](#x) [c](<docs/a b.md>)'), ['docs/a b.md']);
});

test('schedule preserves every baseline browser command exactly once and runs the full groups', () => {
  const yaml = readFileSync(resolve('.github/workflows/ci-pages.yml'), 'utf8');
  const browser = yaml.split('\n  browser:')[1].split('\n  verify:')[0];
  const expected = ['browser', 'desktop-input', 'shop-drag', 'asset-load', 'hud-release', 'coast-render-targets', 'shop-feedback',
    'issue26-station', 'issue26-inventory', 'issue26-spatial', 'ui', 'coast-animation', 'tactical', 'art', 'opening',
    'title', 'title-water', 'save-browser', 'expansion', 'buildings', 'qol-expansion', 'systems', 'station-tier1', 'station-tier2',
    'station-relief', 'station-reset', 'mall-passages', 'mall-landing', 'mall-sample', 'loot', 'loot-target', 'qol', 'mobile', 'mobile-ux', 'portable', 'raid-default', 'hideout',
    'range', 'shooting', 'enemy-720', 'enemy-1080', 'enemy-touch', 'gunsmith-bench', 'gunsmith-flow'];
  assert.deepEqual([...allSuiteIds].sort(), expected.sort());
  assert.equal(new Set(allSuiteIds).size, expected.length);
  const scripts = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts;
  for (const group of browserGroups) for (const { id, command } of suitesForGroup(group)) {
    assert.equal(command, `test:${id}`);
    assert.ok(scripts[command], `Missing package script: ${command}`);
  }
  assert.match(scripts['test:coast-animation'], / --group=animation$/);
  assert.throws(() => suitesForGroup('unknown'));
  assert.throws(() => suitesForGroup('__proto__'));
  assert.equal(suitesForGroup('batch-2')[0].id, 'save-browser', 'Storage failures must not wait for long presentation suites');
  assert.deepEqual(browser.match(/group: \[([^\]]+)\]/)[1].split(',').map(s => s.trim()), browserGroups);
  for (const m of browser.matchAll(/matrix.group == '([^']+)'/g)) assert.ok(browserGroups.includes(m[1]));
  assert.match(browser, /max-parallel: 8/);
  // The old-client fixture must travel with its consumer after regrouping.
  assert.match(browser, new RegExp(`name: Obtain actual pre-expansion client\\s+if: matrix.group == '${oldClientGroup}'`));
  assert.equal(suitesForGroup(oldClientGroup).filter(s => s.id === 'expansion').length, 1);
  assert.match(browser, /BROWSER_GROUP: \$\{\{ matrix.group \}\}/);
  assert.match(browser, /run: node scripts\/ci\/run-browser\.mjs "\$BROWSER_GROUP"\n/);
  assert.match(browser, /name: browser-timing-\$\{\{ matrix.group \}\}-attempt-\$\{\{ github.run_attempt \}\}/);
  assert.match(browser, /path: test-results\/ci-timing\/\$\{\{ matrix.group \}\}-attempt-\$\{\{ github.run_attempt \}\}\.json/);
  assert.match(yaml, /name: Require every scheduled suite to have passed\s+if: needs.build.outputs.browser_required == 'true'\s+run: node scripts\/ci\/verify-timings\.mjs/);
});

test('browser jobs take host packages from pinned files, not apt mirrors, and check the renderer before any suite', () => {
  const yaml = readFileSync(resolve('.github/workflows/ci-pages.yml'), 'utf8');
  const browser = yaml.split('\n  browser:')[1].split('\n  verify:')[0];
  const steps = browser.split('\n      - ').slice(1);
  const at = pattern => steps.findIndex(step => pattern.test(step));
  // apt only as the fallback when Chromium cannot start at all; never on the normal path.
  assert.equal(steps.filter(step => /apt-get|--with-deps/.test(step)).length, 1);
  assert.match(steps[at(/--with-deps/)], /^name: Check Chromium starts on the expected WebGL renderer\n[\s\S]*"\$status" = 2/);
  assert.match(browser, /run: pnpm exec playwright install chromium\n/);
  const order = [/host-packages\.sh fetch/, /host-packages\.sh install/, /playwright install chromium/,
    /node scripts\/ci\/check-renderer\.mjs/, /node scripts\/ci\/run-browser\.mjs/].map(at);
  assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])), `step order ${order}`);
  assert.match(browser, /hashFiles\('scripts\/ci\/fonts-noble\.lock', 'scripts\/ci\/host-packages\.sh'\)/);

  const env = name => new RegExp(`\\n      ${name}: '([^']+)'\\n`).exec(browser)[1]; // single-quoted YAML, no escapes
  const args = JSON.parse(env('BINCOV_CHROME_ARGS'));
  assert.ok(args.includes('--use-angle=vulkan') && args.includes('--ignore-gpu-blocklist'), 'lavapipe needs both flags');
  const expected = new RegExp(env('BINCOV_EXPECT_RENDERER'));
  assert.match('ANGLE (Mesa, Vulkan 1.4.335 (llvmpipe (LLVM 21.1.8 256 bits) (0x00000000)), llvmpipe)', expected);
  assert.doesNotMatch('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', expected);

  const lock = readFileSync(resolve('scripts/ci/fonts-noble.lock'), 'utf8').split('\n').filter(line => line && !line.startsWith('#'));
  const packages = lock.map(line => {
    const match = /^([0-9a-f]{64}) {2}(pool\/(?:main|universe)\/[a-z0-9]\/[^/\s]+\/([a-z0-9.+-]+)_[^/\s]+\.deb) {2}([a-z0-9.+-]+)=(\S+)$/.exec(line);
    assert.ok(match, `lock line: ${line}`);
    assert.equal(match[3], match[4], `${match[2]} must be the ${match[4]} package`);
    return match[4];
  });
  assert.equal(new Set(packages).size, packages.length);
  // Playwright's own CJK fallbacks stay installed alongside Noto CJK, so screenshots keep the same fonts.
  for (const font of ['fonts-noto-cjk', 'fonts-wqy-zenhei', 'fonts-ipafont-gothic']) assert.ok(packages.includes(font), font);
});

test('every package test script is scheduled in CI or registered as a manual suite with its reason', () => {
  const scripts = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts;
  const packaged = Object.keys(scripts).filter(name => name.startsWith('test:')).map(name => name.slice(5)).sort();
  const manual = manualSuites.map(s => s.id);
  assert.deepEqual([...allSuiteIds, ...manual].sort(), packaged, 'each test:* script is either scheduled or manual');
  assert.equal(new Set([...allSuiteIds, ...manual]).size, allSuiteIds.length + manual.length, 'no suite is both scheduled and manual');
  for (const s of manualSuites) { assert.equal(s.command, `test:${s.id}`); assert.ok(s.reason.length > 30, `${s.id} needs a reason`); }
});

test('actual shell gate rejects missing policy, failed build and unintended skipped/cancelled browsers', () => {
  const yaml = readFileSync(resolve('.github/workflows/ci-pages.yml'), 'utf8');
  const block = yaml.split('name: Require build and the selected browser policy to succeed')[1].split('\n      - ')[0];
  const script = block.split('run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
  // Git for Windows can be installed per-user; use the active Git installation.
  const bash = process.platform === 'win32'
    ? resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe')
    : 'bash';
  for (const build of ['success', 'failure', 'skipped', 'cancelled', '']) for (const required of ['true', 'false', '']) {
    for (const result of ['success', 'failure', 'skipped', 'cancelled', '']) {
      let passed = true;
      try { execFileSync(bash, ['-c', script], { env: { ...process.env, BUILD_RESULT: build, BROWSER_REQUIRED: required, BROWSER_RESULT: result }, stdio: 'pipe' }); }
      catch { passed = false; }
      assert.equal(passed, build === 'success' && ((required === 'true' && result === 'success') || (required === 'false' && result === 'skipped')),
        `${build}/${required}/${result}`);
    }
  }
});
