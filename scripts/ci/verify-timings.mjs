/** Require complete, current-run browser timing evidence before the release gate passes. */
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserGroups, suitesForGroup } from './browser-suites.mjs';
import { enemyShardIds, validateEnemyCoverage, validateEnemyPartition } from '../enemy-browser-plan.mjs';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function duration(value, label) {
  requireCondition(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${label}: invalid durationMs`);
}

function timestamp(value, label) {
  requireCondition(typeof value === 'string' && Number.isFinite(Date.parse(value)), `${label}: missing or invalid timestamp`);
  const parsed = Date.parse(value);
  requireCondition(new Date(parsed).toISOString() === value, `${label}: timestamp must be an ISO UTC string`);
  return parsed;
}

function completedPeriod(record, label) {
  duration(record.durationMs, label);
  const start = timestamp(record.startedAt, `${label}.startedAt`);
  const finish = timestamp(record.finishedAt, `${label}.finishedAt`);
  requireCondition(finish >= start, `${label}: completion precedes start`);
  return { start, finish };
}

function currentIdentity({ runId, runAttempt, commit } = {}) {
  requireCondition(typeof runId === 'string' && /^[1-9]\d*$/.test(runId), 'Missing or invalid current GITHUB_RUN_ID');
  requireCondition(typeof runAttempt === 'string' && /^[1-9]\d*$/.test(runAttempt), 'Missing or invalid current GITHUB_RUN_ATTEMPT');
  requireCondition(typeof commit === 'string' && /^[a-f0-9]{40}$/.test(commit), 'Missing or invalid current GITHUB_SHA');
  return { runId, runAttempt, commit };
}

function reportIdentity(report, expected, label) {
  for (const key of ['runId', 'commit']) {
    requireCondition(report[key] === expected[key], `${label}: ${key} does not match the current run`);
  }
  requireCondition(typeof report.runAttempt === 'string' && /^[1-9]\d*$/.test(report.runAttempt) &&
    BigInt(report.runAttempt) <= BigInt(expected.runAttempt), `${label}: missing, invalid or future runAttempt`);
}

/** Pure validation: selected records follow group order; successful earlier attempts may be reused. */
export function validateTimingReports(reports, identity) {
  const expectedIdentity = currentIdentity(identity);
  const enemyCoverages = [];
  requireCondition(Array.isArray(reports) && reports.length === browserGroups.length, 'Missing or unexpected browser group reports');
  for (const [index, group] of browserGroups.entries()) {
    const report = reports[index];
    requireCondition(report && typeof report === 'object' && !Array.isArray(report), `${group}: invalid report`);
    requireCondition(report.schemaVersion === 1 && report.group === group, `${group}: wrong schema or group`);
    reportIdentity(report, expectedIdentity, group);
    requireCondition(report.status === 'passed' && report.exitCode === 0 && report.signal === null, `${group}: browser group did not pass`);
    const period = completedPeriod(report, group);
    const expected = suitesForGroup(group);
    requireCondition(Array.isArray(report.suites) && report.suites.length === expected.length && expected.length > 0,
      `${group}: missing or unexpected suites`);
    let previousFinish = period.start;
    for (const [suiteIndex, suite] of expected.entries()) {
      const row = report.suites[suiteIndex], label = `${group}/${suite.id}`;
      requireCondition(row && row.id === suite.id && row.command === suite.command, `${label}: suite order, id or command does not match the manifest`);
      requireCondition(row.status === 'passed' && row.exitCode === 0 && row.signal === null && !row.error && row.timedOut !== true,
        `${label}: suite did not finish successfully`);
      const suitePeriod = completedPeriod(row, label);
      requireCondition(suitePeriod.start >= previousFinish && suitePeriod.finish <= period.finish,
        `${label}: timestamps do not describe sequential execution inside the group`);
      if (enemyShardIds.includes(suite.id)) enemyCoverages.push(validateEnemyCoverage(row.enemyCoverage, suite.id, report, suitePeriod));
      previousFinish = suitePeriod.finish;
    }
  }
  validateEnemyPartition(enemyCoverages);
  return reports;
}

/** Select the newest record per group, never falling back from a newer failure. */
export function selectTimingReports(files, identity) {
  const expectedIdentity = currentIdentity(identity), selected = new Map(), seen = new Set();
  for (const { name, report } of files) {
    const match = /^(batch-[1-8])-attempt-([1-9]\d*)\.json$/.exec(name);
    requireCondition(match && browserGroups.includes(match[1]), `Unexpected timing evidence file: ${name}`);
    const [, group, attempt] = match;
    requireCondition(!seen.has(name), `Duplicate timing evidence for ${group} attempt ${attempt}`);
    seen.add(name);
    requireCondition(report && report.schemaVersion === 1 && report.group === group && report.runAttempt === attempt,
      `${name}: schema, group or attempt does not match the filename`);
    reportIdentity(report, expectedIdentity, name);
    if (!selected.has(group) || BigInt(attempt) > BigInt(selected.get(group).runAttempt)) selected.set(group, report);
  }
  requireCondition(selected.size === browserGroups.length, 'Missing browser group timing evidence');
  return validateTimingReports(browserGroups.map(group => selected.get(group)), expectedIdentity);
}

export function timingSummary(reports) {
  const seconds = ms => `${(ms / 1000).toFixed(3)} s`;
  const cell = value => value == null ? '—' : String(value).replace(/[|\r\n]+/g, ' ');
  const groupRows = reports.map(report => `| ${report.group} | ${report.runAttempt} | ${report.suites.length} | ${seconds(report.durationMs)} | ${cell(report.cpu?.model)} | ${cell(report.renderer)} |`);
  const suiteRows = reports.flatMap(report => report.suites.map(row => `| ${report.group} | \`pnpm ${row.command}\` | ${seconds(row.durationMs)} |`));
  return `\n### Validated browser timing evidence\n\nAll ${reports.length} groups and ${reports.reduce((count, report) => count + report.suites.length, 0)} suites passed for this run and commit. Each group uses its newest recorded attempt; a failed-jobs-only rerun may retain earlier successful groups. The workflow also requires GitHub's browser job result to succeed.\n\n` +
    'Durations cover the browser suite processes and group wrapper only. Runner setup, queue time and Pages deployment are excluded; these tables do not measure total workflow time.\n\n' +
    'Enemy shard evidence also covers every original street/mall viewport chain and case exactly once, with the original offline and touch configuration.\n\n' +
    `| Group | Recorded attempt | Suites | Duration | CPU | WebGL renderer |\n| --- | ---: | ---: | ---: | --- | --- |\n${groupRows.join('\n')}\n\n` +
    `| Group | Suite | Duration |\n| --- | --- | ---: |\n${suiteRows.join('\n')}\n`;
}

export function verifyTimings({ directory = resolve('test-results/ci-timing'), env = process.env,
  summaryPath = env.GITHUB_STEP_SUMMARY } = {}) {
  const entries = readdirSync(directory, { withFileTypes: true });
  requireCondition(entries.every(entry => entry.isFile()), 'Timing evidence entries must be regular JSON files');
  const files = entries.map(({ name }) => {
    try { return { name, report: JSON.parse(readFileSync(join(directory, name), 'utf8')) }; }
    catch (error) { throw new Error(`${name}: cannot read timing report: ${error.message}`); }
  });
  const reports = selectTimingReports(files, { runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, commit: env.GITHUB_SHA });
  const summary = timingSummary(reports);
  if (summaryPath) appendFileSync(summaryPath, summary);
  return { reports, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireCondition(process.argv.length === 2, 'Usage: node scripts/ci/verify-timings.mjs');
    console.log(verifyTimings().summary);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
