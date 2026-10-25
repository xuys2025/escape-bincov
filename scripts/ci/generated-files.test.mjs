// The game build is not committed: CI builds it once per run, Pages deploys that copy and main publishes it as a
// release (docs/CI.md#构建与离线包发布). Committed copies conflicted between every two game PRs, and a merge that keeps
// "their" side of a deleted generated file would quietly bring them back, so a tracked copy fails here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// What scripts/build.mjs and scripts/package.mjs write.
const outputs = ['dist/index.html', 'start the game.html', 'release/Escape-Bincov-portable.zip',
  'release/Escape-Bincov-web.zip', 'release/release-manifest.json'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

test('generated game files are not committed', () => {
  // docs/release-manifest.json is where the manifest lived until it moved into release/ with the ZIPs.
  assert.equal(git('ls-files', '--', 'dist', 'release', 'start the game.html', 'docs/release-manifest.json'), '');
});

test('local builds stay out of git status', () => {
  for (const path of outputs) assert.doesNotThrow(() => git('check-ignore', '--quiet', '--no-index', '--', path), path);
});
