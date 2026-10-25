import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { choosePlan } from './policy.mjs';
import { checkDocumentation } from './check-docs.mjs';

function gitTree(ref) {
  if (ref !== 'HEAD' && !/^[a-f0-9]{40}$/.test(ref)) throw Error('Invalid Git revision');
  return execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', ref], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\0').filter(Boolean).map(record => {
      const tab = record.indexOf('\t'), [mode, type, sha] = record.slice(0, tab).split(' ');
      return { path: record.slice(tab + 1), mode, type, sha };
    });
}

const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw Error('Missing repository context');
const eventName = process.env.GITHUB_EVENT_NAME;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const current = gitTree('HEAD');
async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`GitHub history request returned ${response.status}`);
  return response.json();
}
let base, baseSha;
if (eventName === 'pull_request') {
  baseSha = event.pull_request?.base?.sha;
  try { base = gitTree(baseSha); } catch { /* shallow/missing base => full regression */ }
} else if (eventName === 'push') {
  // A changed push can opt into full testing immediately. An unchanged push
  // still needs matching successful history; before never authorizes skipping.
  try { base = gitTree(event.before); } catch { /* still check validated history */ }
}
const plan = await choosePlan({ eventName, repository, current, base,
  runs: async () => (await api('actions/workflows/ci-pages.yml/runs?branch=main&status=success&per_page=20')).workflow_runs,
  tree: async sha => {
    const response = await api(`git/trees/${sha}?recursive=1`);
    if (response.truncated || !Array.isArray(response.tree)) throw Error('Incomplete Git tree');
    return response.tree;
  },
  jobs: async id => {
    const response = await api(`actions/runs/${id}/jobs?per_page=100&filter=latest`);
    if (!Array.isArray(response.jobs) || response.total_count !== response.jobs.length) throw Error('Incomplete job list');
    return response.jobs;
  },
});
if (!plan.browserRequired) {
  // The runner may have a shallow checkout. Fetch only this trusted fixed commit
  // to compare added documentation links; no credentials persist in checkout.
  const compareSha = baseSha ?? plan.validatedSha;
  try { gitTree(compareSha); } catch {
    execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', compareSha], { stdio: 'pipe' });
  }
  checkDocumentation(plan.changed, compareSha);
}
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/ci-plan.json', JSON.stringify(plan, null, 2) + '\n');
const summary = `### Browser regression decision\n\n${plan.reason}\n\n` +
  (plan.browserRequired ? 'All browser groups are required.\n' :
    `Reused full browser evidence: [run ${plan.validatedRun}](https://github.com/${repository}/actions/runs/${plan.validatedRun})\n\n` +
    `Validated commit: \`${plan.validatedSha}\`\n\nNon-documentation fingerprint: \`${plan.fingerprint}\`\n\n` +
    'Unit tests, packaging, and on main the Pages deployment and offline release still run.\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `browser_required=${plan.browserRequired}\n`);
