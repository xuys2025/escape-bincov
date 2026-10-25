import { createHash } from 'node:crypto';
import { browserGroups } from './browser-suites.mjs';

export { browserGroups };
const rootDocs = new Set(['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'handoff.md', '.github/PULL_REQUEST_TEMPLATE.md']);

// This is an allowlist, not an extension-based exclusion of build inputs.
// In particular THIRD_PARTY_NOTICES.md and the portable readme are packaged, so they
// participate in the fingerprint. New/unclassified files require full regression.
export function isDocumentation(entry) {
  return entry.type === 'blob' && entry.mode === '100644' && (
    rootDocs.has(entry.path) || /^docs\/.+\.md$/.test(entry.path) ||
    entry.path === 'docs/story/GEMINI-RETURN-MANIFEST-20261014.json'
  );
}

export function fingerprint(entries) {
  const records = entries.filter(e => e.type !== 'tree' && !isDocumentation(e))
    .map(({ path, mode, type, sha }) => [path, mode, type, sha])
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

export function changedPaths(before, after) {
  const old = new Map(before.filter(e => e.type !== 'tree').map(e => [e.path, e]));
  const next = new Map(after.filter(e => e.type !== 'tree').map(e => [e.path, e]));
  return [...new Set([...old.keys(), ...next.keys()])].filter(path => {
    const a = old.get(path), b = next.get(path);
    return !a || !b || a.sha !== b.sha || a.mode !== b.mode || a.type !== b.type;
  }).sort();
}

export function successfulMainRun(run, repository) {
  return run.repository?.full_name === repository && run.head_branch === 'main' &&
    ['push', 'workflow_dispatch'].includes(run.event) && run.status === 'completed' &&
    run.conclusion === 'success' && run.path === '.github/workflows/ci-pages.yml' &&
    /^[a-f0-9]{40}$/.test(run.head_sha) && Number.isSafeInteger(run.id);
}

export function fullyTested(jobs) {
  const required = ['Build shared game', 'Build and test', 'Deploy Pages', ...browserGroups.map(g => `Browser / ${g}`)];
  return required.every(name => {
    const matches = jobs.filter(j => j.name === name);
    return matches.length === 1 && matches[0].status === 'completed' && matches[0].conclusion === 'success';
  });
}

// compare with an actually tested main tree, never just push.before or the last
// commit in a PR. An API failure, missing history or skipped browser group falls
// back to a complete run. No PR-result reuse or transitive docs-result reuse.
export async function choosePlan({ eventName, repository, current, base, runs, tree, jobs }) {
  const full = reason => ({ browserRequired: true, reason });
  if (!['push', 'pull_request'].includes(eventName)) return full('Manual/unknown event: run every browser group.');
  if (eventName === 'pull_request' && (!base || fingerprint(base) !== fingerprint(current))) {
    return full('The complete PR changes executable, test, build or unclassified inputs.');
  }
  if (eventName === 'push' && base && fingerprint(base) !== fingerprint(current)) {
    return full('This push changes non-documentation inputs: run every browser group.');
  }
  try {
    const currentFingerprint = fingerprint(current);
    for (const run of await runs()) {
      if (!successfulMainRun(run, repository)) continue;
      const previous = await tree(run.head_sha);
      if (fingerprint(previous) !== currentFingerprint || !fullyTested(await jobs(run.id))) continue;
      return { browserRequired: false, reason: 'Only allowlisted documentation differs from a fully tested main release.',
        validatedRun: run.id, validatedSha: run.head_sha, fingerprint: currentFingerprint,
        changed: changedPaths(eventName === 'pull_request' ? base : previous, current) };
    }
    return full('No matching fully tested main release in the recent history.');
  } catch {
    return full('Validation history unavailable or incomplete: run every browser group.');
  }
}
