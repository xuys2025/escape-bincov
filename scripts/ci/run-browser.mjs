/** Sequential browser suites with durable timing evidence, including interrupted runs. */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, constants, cpus } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { enemyReportPath, enemyShardIds, validateEnemyCoverage } from '../enemy-browser-plan.mjs';

const require = createRequire(import.meta.url);
const signalCode = signal => 128 + (constants.signals[signal] ?? 1);

export function runtimeMetadata(env = process.env) {
  const playwrightPackage = require.resolve('playwright/package.json');
  const playwright = JSON.parse(readFileSync(playwrightPackage, 'utf8')).version;
  const fromPlaywright = createRequire(playwrightPackage);
  const core = dirname(fromPlaywright.resolve('playwright-core/package.json'));
  const chromium = JSON.parse(readFileSync(join(core, 'browsers.json'), 'utf8')).browsers.find(b => b.name === 'chromium');
  // Runner CPUs differ about 2.5x in speed, so timings are only comparable alongside the CPU and WebGL renderer
  // (BINCOV_RENDERER is set by scripts/ci/check-renderer.mjs).
  return { runId: env.GITHUB_RUN_ID == null ? null : String(env.GITHUB_RUN_ID), runAttempt: env.GITHUB_RUN_ATTEMPT == null ? null : String(env.GITHUB_RUN_ATTEMPT),
    commit: env.GITHUB_SHA ?? null, node: process.version, playwright,
    chromium: chromium ? { revision: chromium.revision, browserVersion: chromium.browserVersion } : null,
    cpu: { model: cpus()[0]?.model ?? null, count: availableParallelism() }, renderer: env.BINCOV_RENDERER ?? null };
}

// npm's Windows shim cannot be spawned without a shell. Resolve its Node CLI instead;
// suite arguments never pass through cmd.exe or a shell command string.
export function pnpmInvocation(command, { platform = process.platform, env = process.env } = {}) {
  if (!/^test:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(command)) throw new Error(`Invalid browser command: ${command}`);
  if (platform !== 'win32') return { file: 'pnpm', args: [command] };
  const npmCli = env.npm_execpath;
  if (npmCli && /[/\\]pnpm\.(?:c?js)$/.test(npmCli) && existsSync(npmCli)) return { file: process.execPath, args: [npmCli, command] };
  for (const directory of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    const executable = join(directory, 'pnpm.exe');
    if (existsSync(executable)) return { file: executable, args: [command] };
    for (const cli of [join(directory, 'node_modules/pnpm/bin/pnpm.cjs'), join(directory, '../pnpm/bin/pnpm.cjs'), join(directory, 'pnpm.cjs')]) {
      if (existsSync(cli)) return { file: process.execPath, args: [cli, command] };
    }
  }
  throw new Error('Cannot locate the pnpm Node CLI on PATH; install the pinned pnpm before running browser suites.');
}

/** Execute one process. A timeout/abort kills its process tree and can never return success. */
export function runCommand(file, args, { signal, timeoutMs, cwd = process.cwd(), stdio = 'inherit' } = {}) {
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new Error('timeoutMs must be positive.');
  if (signal?.aborted) return Promise.resolve({ exitCode: null, signal: signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM', interrupted: true });
  return new Promise(resolveResult => {
    let child, timeout, forceTimer, settled = false, interrupted = false, timedOut = false, requestedSignal = null;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timeout); clearTimeout(forceTimer); signal?.removeEventListener('abort', abort);
      resolveResult({ ...result, interrupted, timedOut });
    };
    const kill = value => {
      if (!child?.pid) return;
      try {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          const fallback = () => { try { child.kill(value); } catch {} };
          killer.on('error', fallback);
          killer.on('close', code => { if (code !== 0) fallback(); });
        } else process.kill(-child.pid, value);
      } catch (error) { if (error.code !== 'ESRCH') { try { child.kill(value); } catch {} } }
    };
    const stop = value => {
      if (requestedSignal) return;
      requestedSignal = value; kill(value);
      forceTimer = setTimeout(() => kill('SIGKILL'), 5000);
      forceTimer.unref();
    };
    const abort = () => { interrupted = true; stop(signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM'); };
    try {
      child = spawn(file, args, { cwd, stdio, shell: false, detached: process.platform !== 'win32', windowsHide: true });
      child.once('error', error => finish({ exitCode: null, signal: requestedSignal, error: error.message }));
      child.once('close', (exitCode, childSignal) => finish({ exitCode, signal: childSignal ?? requestedSignal }));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      if (timeoutMs !== undefined) {
        timeout = setTimeout(() => { timedOut = true; stop('SIGTERM'); }, timeoutMs);
        timeout.unref();
      }
    } catch (error) { finish({ exitCode: null, signal: requestedSignal, error: error.message }); }
  });
}

const executeSuite = (suite, options) => {
  const invocation = pnpmInvocation(suite.command);
  return runCommand(invocation.file, invocation.args, options);
};

const readEnemyCoverage = suite => JSON.parse(readFileSync(resolve(enemyReportPath(suite.id)), 'utf8')).coverage;

function writeReport(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporary, path);
}

function appendSummary(path, report) {
  if (!path) return;
  const rows = report.suites.map(row => `| \`pnpm ${row.command}\` | ${row.status} | ${row.durationMs === null ? '—' : `${(row.durationMs / 1000).toFixed(2)} s`} | ${row.signal ?? row.exitCode ?? '—'} |`);
  appendFileSync(path, `\n### Browser ${report.group}: ${report.status}\n\n| Suite | Result | Duration | Exit / signal |\n| --- | --- | ---: | --- |\n${rows.join('\n')}\n\nSuite durations use a monotonic clock; they exclude runner setup.\n`);
}

export async function runGroup({ group, suites, reportPath,
  summaryPath, execute = executeSuite, metadata = runtimeMetadata(), signal, timeoutMs, log = console.log,
  readCoverage = readEnemyCoverage }) {
  if (!/^batch-[1-8]$/.test(group)) throw new Error(`Unknown browser group: ${group}`);
  const attempt = metadata.runAttempt ?? 'local';
  if (attempt !== 'local' && !/^[1-9]\d*$/.test(attempt)) throw new Error('Invalid browser run attempt.');
  reportPath ??= resolve('test-results/ci-timing', `${group}-attempt-${attempt}.json`);
  if (!Array.isArray(suites) || !suites.length || new Set(suites.map(s => s.id)).size !== suites.length) throw new Error('Browser group must contain distinct suites.');
  for (const suite of suites) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suite.id) || suite.command !== `test:${suite.id}`) throw new Error(`Invalid browser suite: ${suite.id}`);
  }
  const start = performance.now();
  const report = { ...metadata, schemaVersion: 1, group, startedAt: new Date().toISOString(), finishedAt: null,
    durationMs: null, status: 'running', exitCode: null, signal: null,
    suites: suites.map(({ id, command }) => ({ id, command, startedAt: null, finishedAt: null, durationMs: null,
      status: 'pending', exitCode: null, signal: null })) };
  writeReport(reportPath, report);
  for (let index = 0; index < suites.length; index++) {
    if (signal?.aborted) { report.status = 'interrupted'; report.signal = signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM'; break; }
    const row = report.suites[index], suiteStart = performance.now();
    row.startedAt = new Date().toISOString(); row.status = 'running'; writeReport(reportPath, report);
    log(`\n>>> pnpm ${row.command}`);
    let result;
    try { result = await execute(suites[index], { signal, timeoutMs }); }
    catch (error) { result = { exitCode: null, signal: null, error: error?.message ?? String(error) }; }
    row.finishedAt = new Date().toISOString(); row.durationMs = Math.round(performance.now() - suiteStart);
    row.exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : null;
    row.signal = result?.signal ?? (signal?.aborted ? (signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM') : null);
    if (result?.error) row.error = String(result.error);
    if (result?.timedOut) { row.status = 'failed'; row.timedOut = true; }
    else if (result?.interrupted || signal?.aborted || row.signal) row.status = 'interrupted';
    else row.status = row.exitCode === 0 && !row.error ? 'passed' : 'failed';
    if (!result || (row.exitCode === null && !row.signal && !row.error)) row.error = 'Process produced no exit result.';
    if (row.status === 'passed' && enemyShardIds.includes(row.id)) {
      try {
        const coverage = readCoverage(suites[index], { metadata, row });
        row.enemyCoverage = validateEnemyCoverage(coverage, row.id, metadata,
          { start: Date.parse(row.startedAt), finish: Date.parse(row.finishedAt) });
      } catch (error) {
        row.status = 'failed'; row.exitCode = 1; row.error = `Invalid enemy shard evidence: ${error.message}`;
      }
    }
    log(`<<< ${row.id}: ${row.status} (${(row.durationMs / 1000).toFixed(2)} s)`);
    if (row.status !== 'passed') {
      report.status = row.status; report.signal = row.signal;
      report.exitCode = row.signal ? signalCode(row.signal) : row.exitCode && row.exitCode > 0 ? row.exitCode : 1;
      writeReport(reportPath, report); break;
    }
    writeReport(reportPath, report);
  }
  for (const row of report.suites) if (row.status === 'pending') row.status = 'not_run';
  if (report.status === 'running') report.status = 'passed';
  report.exitCode ??= report.status === 'passed' ? 0 : report.signal ? signalCode(report.signal) : 1;
  report.finishedAt = new Date().toISOString(); report.durationMs = Math.round(performance.now() - start);
  writeReport(reportPath, report); appendSummary(summaryPath, report);
  return report;
}

async function main() {
  const [group, ...extra] = process.argv.slice(2);
  if (extra.length || !/^batch-[1-8]$/.test(group ?? '')) throw new Error('Usage: node scripts/ci/run-browser.mjs batch-1 (through batch-8).');
  const { suitesForGroup } = await import('./browser-suites.mjs');
  const suites = suitesForGroup(group), controller = new AbortController();
  const onInterrupt = () => controller.abort('SIGINT'), onTerminate = () => controller.abort('SIGTERM');
  process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate);
  try {
    const report = await runGroup({ group, suites, summaryPath: process.env.GITHUB_STEP_SUMMARY, signal: controller.signal });
    process.exitCode = report.exitCode;
  } finally {
    process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
    if (controller.signal.aborted && process.platform !== 'win32') process.kill(process.pid, controller.signal.reason);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
