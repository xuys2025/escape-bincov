// Local risk selection only. CI execution still comes from ci/browser-suites.mjs;
// command bodies stay in package.json. Importing this module runs no checks.
import { browserGroups, manualSuites, suitesForGroup } from './ci/browser-suites.mjs';

const descriptions = {
  enemy: '新敌人保存场景、攻击阶段、素材和条件交涉', browser: '普通行动入口与基本操作', 'desktop-input': '真实键鼠、组合输入与释放', shooting: '射击、镜头、弹道与慢帧反馈',
  'enemy-720': '完整敌人验收的 1280×720 视口链（街区与商场）',
  'enemy-1080': '完整敌人验收的 1920×1080 视口链（街区与商场）',
  'enemy-touch': '完整敌人验收的 844×390 原生触控视口链（街区与商场）',
  'save-browser': '保存失败、重试、导入导出与多窗口', play: '约十分钟真实计时行动', portable: '解压两种 ZIP、离线入口与操作',
  ui: '桌面界面布局', mobile: '触屏行动与按钮', 'mobile-ux': '手机横竖屏、短屏与操作边界', title: '标题页与输入',
  opening: '序幕播放、跳过与持久化', loot: '搜刮、物品转移与退出输入', 'loot-target': '附近搜刮目标与选择',
  qol: '行动信息与便捷操作', hideout: '旧页签据点与 Runtime 接线', station: '完整院子交互验收',
  'station-tier1': '院子计数、护符与等级展示', 'station-tier2': '生产、领取与真实训练', 'station-relief': '进站救济与重复领取边界',
  'station-reset': '清空前备份、新开局与恢复', 'station-capability': '真实 GPU 能力变化与监听释放',
  'shop-drag': '商店拖动与触控', 'shop-feedback': '商店拒绝原因和清单刷新', 'asset-load': '冷 PNG 加载',
  'hud-release': 'HUD 与页面资源释放', 'coast-render-targets': '行动渲染目标与生命周期',
  'coast-animation': '城中村动画子集，不替代输入回归', 'coast-sample': '完整城中村视图与宿主验收',
  'qol-expansion': '分层行动信息', expansion: '真实旧客户端兼容与存档往返', 'expansion-benchmark': '存档体积与时间测量',
  buildings: '建筑、门与分层世界', systems: 'RPG 与据点系统', 'layered-play': '商场分层真实计时行动',
  'mall-passages': '商场通道与连通', 'mall-landing': '商场落点与切层', 'mall-sample': '商场样板与旧布局兼容',
  'raid-default': '默认行动、旧检查点与不支持 WebGL 的入口', range: '隔离试枪场', art: '物品与程序美术',
  tactical: '战术界面与字体', 'title-water': '标题水面表现', 'issue26-station': '院子库存操作与失败回滚',
  'issue26-inventory': '行动背包、搜刮与失败回滚', 'issue26-spatial': '门、楼梯和隐藏内容权限',
};

// IDs are also package script names. Diagnostics are never included as required
// regression gates; their successful process exit is not a gameplay/memory signoff.
export const diagnosticChecks = {
  'diagnose:coast-heap': { purpose: '行动对象、渲染资源与堆趋势', output: 'test-results/coast-sample/heap',
    evidence: 'exit 0 只表示生命周期断言通过；必须另读 memorySignoff，正增长仍为 PARTIAL。' },
  'diagnose:coast-owners': { purpose: '同一行动负载，增加 Weather / SampleSound / SynthAudio 跟踪', output: 'test-results/sol-r6/heap',
    evidence: 'exit 0 不等于 F20 通过；与 coast-heap 的采样、断言保留原差异。' },
  'diagnose:f20': { purpose: 'F20 默认六十轮、正式包的独立测量', output: 'test-results/astra-r7/strict60',
    evidence: '读取 resourceStatus、memoryStatus 和 status；named/高水位/缩短轮数均须单独登记，不能代替 strict60。' },
};

const browserPrerequisites = ['先运行 pnpm package；安装 Playwright Chromium 或设置 BINCOV_CHROME。'];
const extraPrerequisites = {
  'test:portable': ['Windows 使用 .NET 解压；Linux/macOS 需要 Python 3。'],
  'test:expansion': ['按 .github/workflows/ci-pages.yml 准备 test-results/pre-m0.html、test-results/pre-perk.html、test-results/pre-enemy.html 和 test-results/pre-gunsmith.html；脚本核对固定旧客户端哈希，不能用当前包代替。'],
  'test:mobile-ux': ['BINCOV_LEGACY_HTML 未设置时不会运行其中的真实旧客户端迁移检查；如验证迁移，必须提供对应旧 HTML 并记录实际覆盖。'],
  'test:station-tier2': ['保留真实 120 秒训练；固定时钟的拒绝/回滚用例不能代替计时验收。'],
  'test:station-capability': ['需要真实 GPU 及 16 个原生 batchable textures；CI 软件渲染不能签收此项。'],
  'test:play': ['完整真实行动约十分钟；不要缩短计时作为验收。'],
  'test:layered-play': ['真实计时的分层行动；不要与性能采样并行。'],
};

export const risks = {
  rules: { title: '领域规则与数据', checks: ['test', 'package'], evidence: ['补与本次边界对应的单元测试和有效反例。'] },
  ui: { title: '界面与场景', extends: ['rules'], checks: ['test:browser', 'test:ui'], evidence: ['1280×720、1920×1080 真实截图；说明测试夹具。'] },
  input: { title: '输入、暂停、主界面或缩放', extends: ['ui'], checks: ['test:title', 'test:desktop-input', 'test:mobile', 'test:mobile-ux'], evidence: ['真实键鼠与触控仿真分别记录；仿真不能代替真机。'] },
  save: { title: '交易、库存、结算或备份', extends: ['rules'], checks: ['test:save-browser'], evidence: ['覆盖写失败、重复重试、旧档、覆盖确认、多窗口和精确候选备份；事务回滚需叠加 input，界面改动需叠加 ui。'] },
  migration: { title: '持久字段、格式或迁移', extends: ['save'], checks: ['test:expansion', 'test:raid-default', 'test:station-reset'], evidence: ['新建/重开/旧在途行动/导入导出完整往返，拒绝未知数据并保留原字节。'] },
  inventory: { title: '背包与搜刮操作', extends: ['ui', 'save', 'input'], checks: ['test:loot', 'test:loot-target', 'test:issue26-inventory', 'test:issue26-station'], evidence: ['角色和世界同笔提交；取消、双端守恒与下次操作正常。'] },
  shop: { title: '商店与据点交易', extends: ['ui', 'save', 'input'], checks: ['test:shop-drag', 'test:shop-feedback', 'test:hideout', 'test:station'], evidence: ['院子与旧页签都检查；救济品、净额交易与确认取消不退化。'] },
  world: { title: '地图、建筑与分层', extends: ['rules'], checks: ['test:buildings', 'test:mall-passages', 'test:mall-landing', 'test:mall-sample', 'test:raid-default'], evidence: ['检查旧布局身份、可达性、门/楼梯和隐藏内容；改画面/输入再叠加对应风险。'] },
  combat: { title: '战斗、AI、潮汐或持续负载', extends: ['rules'], checks: ['test:shooting', 'test:range', 'test:enemy', 'test:play'], evidence: ['真人手感和平衡另验；改分层战斗再叠加 layered，改输入再叠加 input。'] },
  layered: { title: '分层自然行动', extends: ['world', 'combat'], checks: ['test:layered-play'], evidence: [] },
  base: { title: 'RPG 与据点成长', extends: ['ui', 'save'], checks: ['test:systems', 'test:station', 'test:station-tier1', 'test:station-tier2', 'test:station-relief', 'check:perk-ui'], evidence: ['训练保留真实计时；Perk 自动化不代表首次解锁、选择率或重置成本的真人平衡。'] },
  opening: { title: '序幕播放与状态', extends: ['ui', 'input', 'save'], checks: ['test:opening'], evidence: ['检查跳过、首次播放标记和静音；保存失败不假成功。'] },
  render: { title: '美术、渲染与生命周期', extends: ['ui'], checks: ['test:art', 'test:tactical', 'test:title-water', 'test:asset-load', 'test:hud-release', 'test:coast-animation', 'test:coast-render-targets', 'test:station-capability'], diagnostics: Object.keys(diagnosticChecks), evidence: ['断言通过、堆趋势、GPU 与真人观感分开记录；改宿主应补完整 station/coast-sample。'] },
  packaging: { title: '构建、依赖与发布', extends: ['rules'], checks: ['test:portable'], evidence: ['核对 HTML、ZIP 与清单哈希；普通入口单文件断网游玩无新增必需请求。'] },
  ci: { title: '测试工具、CI 与检查清单', extends: ['rules'], checks: ['check:ci'], evidence: ['保留有效负对照和失败/取消/意外跳过门禁；按变更另跑实际受影响套件。'] },
  docs: { title: '纯文档', checks: [], evidence: ['核对链接、命令、事实及历史日期；不为纯文字增加代码测试。CI 仍按既有策略运行。'] },
};

export function checksFrom(scripts) {
  const groups = new Map(browserGroups.flatMap(group => suitesForGroup(group).map(s => [s.command, group])));
  const manual = new Map(manualSuites.map(s => [s.command, s.reason]));
  const checks = [
    { id: 'test', kind: 'regression', purpose: '领域、世界与存档单测', ci: 'build', prerequisites: ['Node.js 24；pnpm install --frozen-lockfile。'] },
    { id: 'package', kind: 'regression', purpose: '类型检查、HTML、ZIP 与发布清单', ci: 'build', prerequisites: ['锁定依赖已安装；生成物不入库，CI 自己构建并在 main 验证后发布。'] },
    { id: 'check:ci', kind: 'regression', purpose: 'CI 策略、清单覆盖与源码守卫', ci: 'build', prerequisites: ['Node.js 24、项目依赖与 Git；完整 CI 守卫在 Windows 还需 Git Bash 可用。'] },
    ...Object.entries(scripts).filter(([id]) => id.startsWith('test:')).map(([id]) => {
      const purpose = descriptions[id.slice(5)];
      if (!purpose) throw Error(`Missing check description: ${id}`);
      if (!groups.has(id) && !manual.has(id)) throw Error(`Unscheduled test: ${id}`);
      return { id, purpose, kind: id === 'test:expansion-benchmark' ? 'diagnostic' : groups.has(id) ? 'regression' : 'manual',
        ci: groups.get(id) ?? null, ...(manual.has(id) ? { manualReason: manual.get(id) } : {}),
        prerequisites: [...browserPrerequisites, ...(extraPrerequisites[id] ?? [])],
        ...(id === 'test:expansion-benchmark' ? { evidence: '数值只供同环境对照，不是性能 PASS 或泄漏结论。' } : {}) };
    }),
    { id: 'check:perk-ui', kind: 'manual', purpose: 'Perk 选择/重置、旧页签和行动 HUD', ci: null,
      manualReason: '#92 已交付的独立专项，未加入当前八组；改 Perk 展示或事务时手动执行。', prerequisites: browserPrerequisites },
    ...Object.entries(diagnosticChecks).map(([id, info]) => ({ id, kind: 'diagnostic', ci: null, ...info,
      prerequisites: [...browserPrerequisites, '独立运行并保留报告；BINCOV_HEAP_OUT / R7_OUT 可显式指定独立目录。'] })),
  ];
  return checks.map(check => {
    if (!Object.hasOwn(scripts, check.id)) throw Error(`Missing package command: ${check.id}`);
    return { ...check, command: `pnpm ${check.id}`, script: scripts[check.id] };
  });
}

export function planFor(selected, checks) {
  if (!selected.length) throw Error('Select at least one risk');
  if (selected.includes('docs') && selected.length > 1) throw Error('docs is only for documentation-only changes');
  const visited = new Set(), active = new Set(), commands = new Set(), diagnostics = new Set(), evidence = new Set();
  const visit = id => {
    if (!Object.hasOwn(risks, id)) throw Error(`Unknown risk: ${id}`);
    if (active.has(id)) throw Error(`Risk dependency cycle: ${id}`);
    if (visited.has(id)) return;
    active.add(id);
    const risk = risks[id];
    for (const parent of risk.extends ?? []) visit(parent);
    for (const check of risk.checks) commands.add(check);
    for (const check of risk.diagnostics ?? []) diagnostics.add(check);
    for (const item of risk.evidence) evidence.add(item);
    active.delete(id); visited.add(id);
  };
  selected.forEach(visit);
  const byId = new Map(checks.map(check => [check.id, check]));
  const lookup = id => { if (!byId.has(id)) throw Error(`Unregistered check: ${id}`); return byId.get(id); };
  const required = [...commands].map(lookup);
  if (required.some(check => check.kind === 'diagnostic')) throw Error('Diagnostics cannot be required regression gates');
  return { risks: [...visited], checks: required, diagnostics: [...diagnostics].map(lookup), evidence: [...evidence] };
}
