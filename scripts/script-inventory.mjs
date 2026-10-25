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
