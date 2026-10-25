// Classification is evidence about intended use, not a claim that a script passed.
// Package entries and CI infrastructure are derived; unregistered legacy tools
// are explicitly held for review, never silently deleted or promoted to gates.
const groups = [
  { kind: 'diagnostic', reason: 'EN-04 当前正式街区 AI/寻路与三尺寸真实帧时、纹理、包体预算。先 pnpm package，再 node --import tsx scripts/enemy-performance.mjs；独占测量，预算未过返回非零，不代表真机或自然游玩。', files: ['enemy-performance.mjs'] },
  { kind: 'diagnostic', reason: '单次浏览器同比出现噪声后的固定五组交错A/B；显式提供基线HTML、严格输入和原预算报告。每样本保持绝对门槛，五个p95的中位值仍限20%，保留原失败，不替代完整矩阵/Node/真机。', files: ['enemy-performance-paired.mjs'] },
  { kind: 'check', reason: '敌人存档交给固定历史源码客户端验证拒绝和零写入；需显式 --candidate 与匹配的旧源码检出。详见 enemy-save-contract，不用当前客户端替代。', files: ['enemy-old-client-probe.ts'] },
  { kind: 'support', reason: '被现役构建或测试导入的共用模块，不是独立验收命令。', files: [
    'browser-options.mjs', 'canvas-click.mjs', 'font-characters.mjs', 'game-bundle.mjs', 'inventory-actions.mjs',
    'pixi-managed-gate.mjs', 'stall-resume.mjs', 'step-filter.mjs', 'storage-fault.mjs', 'title-edge-check.mjs', 'yard-entry.mjs',
    'check-catalog.mjs', 'script-inventory.mjs', 'enemy-catalog-data.ts', 'natural-play-state.mjs', 'station-resource-args.mjs',
    'shop-touch-cases.mjs', 'station-acceptance-gates.mjs', 'enemy-mall-browser.mjs', 'enemy-browser-plan.mjs',
  ] },
  { kind: 'support', reason: '由 scripts/ci/resource-helpers.test.mjs 导入的四项纯 Node 回归：合成图支配关系的独立 oracle、缺表和未释放对象负对照；不运行浏览器/堆采样，不代表资源或 F20 签收。', files: [
    'astra-r7-heap-graph.test.mjs', 'station-resource-probe.test.mjs',
  ] },
  { kind: 'tool', reason: '素材生成、导入或交付工具；会写源码或资产，不能当作只读测试执行。开工前检查输入清单、哈希、字体环境和输出。', files: [
    'coast-import-assets.mjs', 'mall-assets.mjs', 'opening-assets.mjs', 'station-assets.mjs', 'subset-font.py', 'build-coast-runtime.mjs',
    'format.mjs', 'enemy-export-art.mjs', 'prepare-county-map.mjs', 'pack-coast-art.py',
  ] },
  { kind: 'diagnostic', reason: '帧时、标题性能或确定性射击测量；参数见源码头部，独立运行并记录环境。本轮未重测这些性能工具，不把输出数值当作真人手感或 GPU 完成时间。', files: [
    'coast-sample-measure.mjs', 'title-performance.mjs', 'shooting-bench.ts',
  ] },
  { kind: 'diagnostic', reason: '读取已有 V8 快照的分析工具；先看各脚本参数。强路径/支配关系是记录图内的证据，不自动证明原生内存归属或泄漏。', files: [
    'astra-r7-heap-graph.mjs', 'astra-r7-cache-graph.mjs', 'coast-heap-retainers.mjs',
  ] },
  { kind: 'tool', reason: '把 #96 的受击/恢复图集切成运行帧，写 assets/coast/poses 与 src/coast-view/pose-assets.ts（node --import tsx 运行）；--check 只核对、不写入。', files: ['export-hurt-poses.ts'] },
  { kind: 'archive', reason: 'R6 历史音频对照；写死旧工作目录，main 与工作区同源码也会越过 ±20% 门槛（#60 / #90 实测）。保留原证据和负对照制作代码，不能用作当前回归门禁。', files: ['sol-r6-audio-controls.mjs'] },
  { kind: 'archive', reason: '旧商场兼容实验要求 main 新建一版商场；当前 main 已改变新局布局。只在明确历史基线复放，现役兼容入口为 test:expansion / test:mall-sample。', files: ['mall-runtime-compat.mjs'] },
  { kind: 'archive', reason: 'R3 固定构建的压缩名/哈希分析链，build-map 只登记两个历史 HTML；需要对应旧 HTML 和快照，不能直接分析新构建。', files: [
    'station-resource-build-map.mjs', 'station-resource-heap.mjs', 'station-resource-shaders.mjs',
  ] },
  { kind: 'review', reason: '未登记为现役 package 检查或 CI 工具；保留待核对夹具、基线、参数及调用点。未运行，不据文件名推定已退役或当前可用。', files: [
    // Explicitly held for review on 2026-10-23; adding another file requires a classification.
    'astra-save-diagnostic.mjs',
    'coast-audio-test.mjs',
    'coast-launcher-check.mjs',
    'coast-lifecycle-test.mjs',
    'coast-playtest.mjs',
    'coast-sample-art.mjs',
    'coast-sample-shots.mjs',
    'legacy-compat-test.mjs',
    'opus-player-death-probe.mjs',
    'preview.mjs',
    'raid-view.mjs',
    'sol-export-evidence.mjs',
    'sol-f20-gates.mjs',
    'sol-f20-hud-control.mjs',
    'sol-f20-hud-paths.mjs',
    'sol-f20-snapshot.mjs',
    'sol-heap-cache-inspect.mjs',
    'sol-occlusion-probe.mjs',
    'sol-r6-audio-bounds.mjs',
    'sol-r6-export.mjs',
    'sol-r6-hidden-feedback.mjs',
    'sol-r6-resources.mjs',
    'sol-r6-save-test.mjs',
    'sol-r6-visibility.mjs',
    'sol-r7-audio-isolated.mjs',
    'sol-r7-drains.mjs',
    'sol-r7-export.mjs',
    'sol-r7-fixture-state.mjs',
    'sol-r7-hidden.mjs',
    'sol-r7-settlement.mjs',
    'sol-r7-tide.mjs',
    'sol-round3-assets.mjs',
    'sol-round3-export.mjs',
    'sol-round3-preview.mjs',
    'sol-round3-verify-assets.mjs',
    'sol-round4-export.mjs',
    'sol-round4-visual.mjs',
    'sol-runtime-boundaries.mjs',
    'sol-sample-assets.mjs',
    'sol-sample-boundaries.mjs',
    'sol-save-diagnostic-probe.mjs',
    'sol-target-loot-probe.mjs',
    'sol-verify-assets.mjs',
    'sol-visibility-probe.mjs',
    'station-acceptance-negative.mjs',
    'station-context-program.mjs',
    'station-ordinary-acceptance.mjs',
    'station-original-target-control.mjs',
    'station-resource-probe.mjs',
    'station-resource-summarize.mjs',
    'station-resource-target-slots.mjs',
    'station-resource-trend.mjs',
    'station-round2-recheck.mjs',
    'title-depth-review.mjs',
  ] },
];

export function scriptInventory(paths, scripts) {
  const explicit = new Map();
  for (const group of groups) for (const file of group.files) {
    const path = `scripts/${file}`;
    if (explicit.has(path)) throw Error(`Duplicate script classification: ${path}`);
    explicit.set(path, { kind: group.kind, reason: group.reason });
  }
  for (const path of explicit.keys()) if (!paths.includes(path)) throw Error(`Stale script classification: ${path}`);
  const entries = new Map();
  for (const [id, command] of Object.entries(scripts)) {
    for (const match of command.matchAll(/\bscripts\/[\w./-]+\.(?:mjs|js|ts|py|sh)\b/g)) {
      const ids = entries.get(match[0]) ?? []; ids.push(id); entries.set(match[0], ids);
    }
  }
  for (const path of entries.keys()) if (!paths.includes(path)) throw Error(`Missing package entry: ${path}`);
  return [...paths].sort().map(path => {
    let record = explicit.get(path);
    const commands = entries.get(path) ?? [];
    if (!record && commands.length) {
      const kind = commands.some(id => id.startsWith('diagnose:') || id === 'test:expansion-benchmark') ? 'diagnostic'
        : commands.some(id => id.startsWith('test:') || id.startsWith('check:')) ? 'check' : 'tool';
      record = { kind, reason: kind === 'diagnostic' ? 'package 登记的独立诊断；读报告边界，不把退出码等同验收。'
        : kind === 'check' ? 'package 登记的当前检查；CI/手动归属与前置条件见 checks --list。'
          : 'package 登记的开发/构建/素材/导航工具；按实际命令确认写入范围。' };
    }
    if (!record && path.startsWith('scripts/ci/')) record = { kind: 'ci', reason: 'CI 策略/执行/环境工具或其单测；*.test.mjs 由 check:ci 全量执行，其他文件按工作流与导入关系调用。' };
    if (!record && path.startsWith('scripts/title-art/') && path.endsWith('.ts')) record = { kind: 'tool', reason: 'title:art 的素材生成模块；不是回归测试，生成会写素材。' };
    if (!record) throw Error(`Unclassified script: ${path}`);
    return { path, ...record, commands };
  });
}
