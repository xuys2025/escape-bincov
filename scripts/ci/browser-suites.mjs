// One reviewed schedule for execution, evidence validation and docs-fast-lane jobs.
// Whole suites stay sequential on each runner; no test assertions are removed.
const schedule = {
  'batch-1': ['browser', 'qol-expansion', 'station-tier2', 'shooting'],
  'batch-2': ['save-browser', 'asset-load', 'hud-release', 'issue26-inventory', 'mall-passages'],
  'batch-3': ['desktop-input', 'portable', 'shop-drag', 'title', 'title-water', 'opening'],
  'batch-4': ['issue26-station', 'issue26-spatial', 'tactical', 'art', 'systems', 'mobile'],
  'batch-5': ['buildings', 'station-tier1', 'shop-feedback', 'mobile-ux', 'range'],
  'batch-6': ['loot-target', 'mall-sample', 'qol', 'coast-render-targets', 'hideout'],
  'batch-7': ['raid-default', 'ui', 'mall-landing', 'coast-animation', 'station-relief', 'station-reset'],
  'batch-8': ['expansion', 'loot', 'enemy'],
};

export const browserGroups = Object.freeze(Object.keys(schedule));
export const allSuiteIds = Object.freeze(Object.values(schedule).flat());
export function suitesForGroup(group) {
  if (!Object.hasOwn(schedule, group)) throw new Error(`Unknown browser group: ${group}`);
  return schedule[group].map(id => ({ id, command: `test:${id}` }));
}

export const oldClientGroup = browserGroups.find(group => schedule[group].includes('expansion'));

// Package suites that CI does not run, and why. Every package.json test:* script is scheduled above or listed here
// (policy.test.mjs), so no suite drops out of both unnoticed. Run these by hand when their area changes.
const manual = {
  'coast-sample': 'Whole 2.5D sample suite: on CI software GL the pages opened after V-CAM time out, so CI runs its animation group (coast-animation).',
  'station': 'Original yard acceptance from #33 (76 steps, about 9 minutes locally); not yet hardened for CI software GL.',
  'station-capability': 'Pixi capability-switch listener probe from #38 (about 3 minutes): needs 16 native batchable textures, which CI software GL lacks; run it on a GPU after renderer or shader lifetime changes.',
  'play': 'Natural play on the real clock (about 10 minutes); for combat, AI, tide and sustained-load changes.',
  'layered-play': 'Natural play through the layered mall on the real clock; for mall and layer changes.',
  'expansion-benchmark': 'Save-size and timing benchmark of the expansion worlds; records numbers for comparison.',
};
export const manualSuites = Object.freeze(Object.entries(manual).map(([id, reason]) => Object.freeze({ id, command: `test:${id}`, reason })));
