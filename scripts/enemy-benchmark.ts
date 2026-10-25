import { execFileSync } from 'node:child_process';
import { cpus, platform, release, arch } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBenchmarkModules, runBenchmarkCase, type BenchmarkCase } from '../tests/fixtures/enemy-benchmark';

const options = new Map(process.argv.slice(2).map(arg => {
  const match = /^--(source-root|out|compare|seconds|seed)=(.+)$/.exec(arg);
  if (!match) throw Error(`Unknown argument: ${arg}. Use --source-root=PATH --out=PATH --compare=PATH --seconds=2..60 --seed=UINT32.`);
  return [match[1], match[2]];
}));
const sourceRoot = resolve(options.get('source-root') ?? fileURLToPath(new URL('..', import.meta.url)));
const seconds = Number(options.get('seconds') ?? 12), seed = Number(options.get('seed') ?? 42);
if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw Error('Expected seed in 1..0xffffffff.');
const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${sourceRoot.replaceAll('\\', '/')}`, '-C', sourceRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const source = { root: sourceRoot, commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) };
const modules = await loadBenchmarkModules(sourceRoot);
const results = [];
for (const world of ['classic', 'building', 'mall'] as const) for (const hz of [20, 60, 5]) {
  const sample: BenchmarkCase = { world, seed, hz, seconds };
  const runs = [runBenchmarkCase(modules, sample), runBenchmarkCase(modules, sample)];
  const stable = runs[0].behaviorHash === runs[1].behaviorHash && runs[0].finalHash === runs[1].finalHash;
  const restored = runs.every(run => run.recovery.length === 1 && run.recovery.every(check => check.restored));
  results.push({ key: `${world}/seed-${seed}/${hz}hz/${seconds}s`, stable, restored, runs });
  console.error(`${world} ${hz}Hz: stable=${stable} restored=${restored} advance=${runs.map(run => run.advanceMs.toFixed(1)).join('/')}ms hash=${runs[0].behaviorHash.slice(0, 16)}`);
}
let comparison: { baselineCommit: string; matches: boolean; cases: { key: string; matches: boolean }[] } | null = null;
if (options.has('compare')) {
  const baseline = JSON.parse(readFileSync(resolve(options.get('compare')!), 'utf8'));
  if (baseline.protocol !== 'enemy-runtime-v1') throw Error('Incompatible benchmark protocol.');
  const cases = results.map(result => {
    const old = baseline.results.find((entry: { key: string }) => entry.key === result.key);
    return { key: result.key, matches: !!old && old.stable && old.restored && result.stable && result.restored
      && old.runs[0].behaviorHash === result.runs[0].behaviorHash && old.runs[0].finalHash === result.runs[0].finalHash };
  });
  comparison = { baselineCommit: baseline.source.commit, matches: cases.every(entry => entry.matches) && baseline.results.length === results.length, cases };
}
const report = { protocol: 'enemy-runtime-v1', generatedAt: new Date().toISOString(),
  scope: 'Bounded headless simulation; no browser rendering, natural play, texture count or real frame rate measured.',
  source,
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  input: { policy: 'square-nearest-aim-v1', saveClockMs: 1800000000000, repeats: 2, hz: [20, 60, 5], seconds, seed,
    note: 'Hz values are supplied advance-call rates. Runtime substeps remain unchanged. Compare determinism only for identical inputs and step schedules.' },
  results, comparison };
const json = JSON.stringify(report, null, 2) + '\n';
if (options.has('out')) { const path = resolve(options.get('out')!); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, json); }
else process.stdout.write(json);
if (results.some(result => !result.stable || !result.restored) || comparison?.matches === false) process.exitCode = 1;
