> 2026-10-09 R6 增量接口：settlement.reason、hurt.cause、impact.owner、frame.flooded；测试摆位与检查点共用 bodyFits。详见 [R6 契约、旧档兼容与接线说明](coast-sample-view/astra-r6-20261009/README.md)。没有修改游戏规则或存档版本；下文为原阶段交付记录。

# 城中村真实样板 Runtime：实现与接入交接

本轮交付是 Opus 首个真实城中村样板需要的纯规则 Runtime。入口为 [`src/raid-runtime/index.ts`](../src/raid-runtime/index.ts)，v1 端口由 [`host.ts`](../src/raid-runtime/host.ts) 创建。保留经典沿海和 `coast-buildings-v1 / resident-layout-1` 的既有玩法；样板使用后者的真实城中村、二楼和地下层。

**本轮停止点：代码和逻辑证据已交付，等待 Opus 接线。** 普通游戏入口仍使用原 `RaidScene`，没有切换到 Pixi，没有生成素材，没有扩大到全沿海视觉改造。原 `RaidScene` 暂时保留为运行中的兼容路径和差分基准；后续替换宿主时再处理重复规则的收口，不能同时启动两套更新循环。

## 基线与承接

- 已接受 main：`f14414718f6dd2b9b8d9144b40134b51fcbc8cc9`，含已合并 #23。
- 承接 [PR #22](https://github.com/xuys2025/escape-bincov/pull/22)：fork `LMX-323/escape-bincov`，分支 `docs/coast-2-5d-art-design`，远端头 `878f5633316a824960091f8f924c0ddd8dd78078`。本地正常合并 main 的提交为 `002435e`，双方 handoff 历史均保留。
- 交付前再次查询，main 与 PR 头未变化，PR 仍开放。当前连接器对原 fork 的权限为 `pull:true / push:false`，因此本轮提交保留在本地，远端 PR 正文和代码尚未更新，未另开 PR。远端仍显示原文档版本及其合并冲突，不代表本地冲突未解决。
- 输入资料：本地原型 `docs/06-给Astra-逻辑实现清单.md`、`src/contract/v1.ts`，以及工作标准内 A01 四份评估。`contract.ts` 的类型和运行表达式与 Opus v1 一致；移除了原中文注释并重新排版，因为原仓库字体字集检查会扫描全部源码注释。原注释以 Opus 原型为准，没有为接口注释生成字体或素材。

## 模块与所有权

| 文件 | 作用 |
| --- | --- |
| `src/raid-runtime/runtime.ts` | 纯实体状态、旧调度/AI/移动/战斗、保存适配、事务与事件 |
| `src/raid-runtime/presentation.ts` | 真实地图和独立帧投影、区域 ID 与揭示缓存 |
| `src/raid-runtime/contract.ts` | Opus v1 类型，不修改协议或存档格式 |
| `src/raid-runtime/host.ts` | 绑定的 v1 端口与事务服务；不暴露可变实体、测试开关或 `step()` |
| `src/raid-runtime/test-support.ts` | 显式 `?test=1` 才能建立的测试驱动；普通入口及生产模块不导出 |
| `src/layer-transition.ts` | 原弹道/切层函数增加可选旁路观察器；不改变命中排序和 RNG 调用 |
| `tests/raid-runtime.test.ts` | 26 项新增 Runtime 回归 |
| `scripts/runtime-differential.mjs` | 对照真实打包 RaidScene，逐帧比较完整检查点/多层状态 |
| `scripts/build-coast-runtime.mjs` | 输出不依赖渲染器或测试驱动的离线 ES 模块，供独立原型接入 |

Runtime 复用 `SaveSession`、`RecoveryStore`、原世界定义、RPG、追击与库存规则。没有新增依赖、存档键、协议版本、地图碰撞、属性数值或随机源。三栋常显建筑保持原语义，regionIds 为空。商场仍由原入口负责；新 Runtime 明确拒绝非沿海多层行动。

## Opus 接入方式

优先在仓库内直接导入：

```ts
import { createCoastRaidHost } from '../raid-runtime';
import type { RaidIntent } from '../raid-runtime';

// 复用已有 SaveSession、会话状态与多窗口写入所有权。
// beginRun(seed, true) 或 resumeRun() 成功，且 state.state === 'run' 后创建。
const host = createCoastRaidHost(session, saveSession);
const runtime = host.runtime; // 可交给接受 RaidRuntime 的 Opus 宿主

function frame(nowMs: number, intent: RaidIntent) {
  const batch = runtime.advance(nowMs, intent); // 每显示帧恰好一次
  view.consume(batch);                       // 显示异常不能进入保存事务
  if (batch.frame.phase === 'ending') {
    const result = host.services.settlement();
    // committed 后才进入结果页并卸载；失败保留重试、备份和当前画面。
  }
}
```

`view.consume` 是接线示意，由 Opus 对应到原型宿主现有方法。传入 `performance.now()`，不要把 Pixi delta 当作时间戳，不要另加固定步长或 clamp。宿主负责屏幕坐标逆变换、DPR/画布偏移、物理按键按下沿及松开重置、blur/pagehide/context-lost 监听。世界角保持连续，`aim:null` 保持朝向；内部保留原 Phaser 的弧度规范化运算，避免 ±π 和浮点规范化差异进入检查点。

独立原型可执行 `node scripts/build-coast-runtime.mjs`，导入生成的 `test-results/coast-runtime/coast-runtime.mjs`。它导出相同宿主、`emptyIntent`、`worldKeyString`、`SaveSession` 与 `createSessionState`。先用独立内存存储搭接真规则样板；正式持久化必须接回原来的写入所有权、冲突处理、导入确认和恢复流程，不能为了原型便利直接对玩家 localStorage 再建一个无锁会话。不要与旧 RaidScene 共用同一个 SaveSession 同时存活；旧场景 shutdown 的 detach 也必须发生在新宿主 attach 之前。

### 事务服务

| 服务 | 使用约束与结果 |
| --- | --- |
| `selectTarget(ref)` / `activate(ref)` | 重新验证 runId、mapId、目标、距离与走廊；异步按钮保留完整 TargetRef，不只保存 ID |
| `lootContext()` / `lootInventory(ref)` | 获取打开的搜刮上下文和独立库存副本；帧中容器仅包含显示摘要 |
| `transferLoot(ref, request)` | 保留精确落格、旋转、拆分和部分合并；返回原 MutationResult，成功事件数量取真实搬运量 |
| `useSupply(id, from, uid)` / `heal()` | 定向使用背包/安全箱，或原快捷医疗选择；保存失败世界与身体一起回滚 |
| `equipItem(uid)` / `dropItem(uid, from)` | 保留卸下武器/弹药容纳检查、救济标记及丢弃的原子世界快照；失败恢复 UID 分配器 |
| `checkpoint()` / `retrySave()` | 重试门/换层保留的原候选；普通失败则保存回滚后的当前状态，不自动重做一次消费操作 |
| `reloadCommitted()` | 从 SaveSession 已校验的最近成功记录重建；不能传入未经校验的 JSON |
| `abandon()` / `settlement()` / `retrySettlement()` / `backup()` | 终局结果通道与原 pending 备份；成功之前禁止 dispose |

这些服务已经包含事务，宿主不要再套一次 `saveSession.mutate`。仅背包/安全箱间的通用库存编辑仍沿原库存 UI 与 SaveSession 事务入口；不要直接修改 PublishedView 或库存副本。旧 `ui.ts` 仍有 `app.raid`/Phaser 类型耦合，本轮没有伪造兼容精灵；接管原 UI 时由宿主改用这些服务与帧字段。

`pause()` 冻结行动并保存检查点；`setBlocked(true)` 用于背包、地图、搜刮、阅读，世界继续推进。开关面板按原规则重置时钟及输入。关闭阅读/搜刮调用 `setBlocked(false)`，暂停恢复调用 `resume()`；宿主仍需等待原物理控制松开，Runtime 的 held 抑制是附加防线。

## 帧、地图与事件约定

- 独立帧对象默认冻结；地图按 map/epoch 缓存；`current()` 不推进时间。地图世界键用整组 `WorldKey`，不能只缓存 `mapId='coast'`。`current()` 返回最近批次，事件按 `seq` 去重，不能把多次读取当作多次动作。服务操作后在下一次发布统一消费事件，避免多处分别调用 `current()` 和 `advance()` 后漏消费。
- 同一实例初始 epoch=1。真实恢复和成功切层递增；事务 rollback、每帧 `restoreExpansion`、开门和拾取不递增。新宿主替代旧实例时必须清空原视图缓存；跨实例不能只比较 epoch 数字。
- 换层批次以目标图发布状态，来源层弹道/伤害/死亡事件保留来源 WorldKey 和旧 epoch。先根据批次 stamp 重建，再过滤事件；来源图火花不能画到目标图。普通事件与帧使用同一 revision。
- `accepted` 是内存已接受的模拟；门、拾取、搜刮、医疗及切层的成功事件只有保存后为 `committed`。失败去掉候选成功事件与受击计时，只发 rejected。终局成功从 settlement 通道取得。
- 一次扳机一个 shot 批次，逐颗保留实际计算的角和 UID；显示采样不调用游戏 RNG。经典采样与多层 DDA 各走原内核，low/window 不挡弹，经典 terrain=2 不映射成墙。经典弹丸显示 rotation 经过旧规范化，shot.angle 保留生成轨迹的实际角。
- 环境伤害 angle=null；经典尸体存档仍按原规则旋转，再换算为显示 corpse.angle。即使丢弃全部瞬时事件，尸体、容器、门与掉落仍可从帧重建。
- 区域 ID 按定义键显式映射。保留半开矩形、near 内缩40、距离严格小于80、原 sight、sealed 与16px缓存。重叠时优先归属未揭示区域，同条件按稳定 ID 排序；室外为 null。未揭示内容和粒子的最终遮罩仍由 Opus 负责。

## L01–L31 实现对应

| 清单 | 本轮实现与证据 |
| --- | --- |
| L01–L06 | 纯实体、ActiveClock、时间先于输入、检查点、只读批次、epoch与生命周期；无 DOM 单元与960帧差分 |
| L07–L11 | 连续世界角、首子步离散输入、pressed/held、完整TargetRef验证、主武器/刀及治疗；输入/撤离/持键测试 |
| L12–L17 | 真地图、稳定区域、16px揭示、实体归属、真实交互和HUD；经典水域、门向、9×6城中村、sealed重叠与边界测试 |
| L18–L23 | 玩家/敌人 shot、两种弹道观测、近战、环境/战斗 hurt、death及持久尸体、容器真实库存摘要 |
| L24–L27 | 原子事务、候选事件隔离、来源层stamp、四终局重试/备份、notice；失败注入与只提交一次的断言 |
| L28–L31 | 测试摆位/敌人/门/武器/冻结驱动须显式test=1；存储适配器注入真实写入失败；生产宿主无测试开关，ES模块依赖清单无渲染器/驱动 |

这表示接口实现已交付，不表示 Opus W01–W14 或 A01 F01–F22 的端到端视觉场景全部验收。原型换成真 Runtime 后仍需执行下面的交接检查。

## 本轮实际验证

环境：Windows，Node 24.19.0，pnpm 11.19.0，Chrome 154.0.8037.98。完整命令、计数、哈希与方法摘要见 [回归证据](coast-runtime-sample/verification.json)；逐帧原始摘要见 [differential.json](coast-runtime-sample/differential.json)。

| 命令 | 结果与含义 |
| --- | --- |
| `pnpm test` | 223项通过，含26项新增Runtime测试；存档迁移和既有领域回归继续运行 |
| `pnpm package` | 严格类型检查、独立HTML、两ZIP和发布清单通过 |
| `node scripts/build-coast-runtime.mjs` | 无渲染器/测试驱动的ES模块可离线导入，依赖清单随模块输出 |
| `node scripts/runtime-differential.mjs` | 经典/多层×种子42/20261007，共960帧；每帧完整检查点/多层状态精确一致，包含RNG与UID；固定Date.now和同一帧时间串，未归一化或剔除持久化字段 |
| `pnpm test:browser` | 1280×720、1920×1080共24项通过；原游戏入口 |
| `pnpm test:save-browser` | 9项通过，包括pending备份、旧记录和真实跨窗口保护 |
| `pnpm test:desktop-input` | 10项通过；原键鼠、暂停、失败医疗与持键 |
| `pnpm test:mobile` / `pnpm test:mobile-ux` | 10项/11项通过；原移动端输入与库存 |
| `pnpm test:buildings` | 8项通过；原建筑切层、保存失败、刷新、追击门和室内潮汐/超时 |
| `pnpm test:play` | 10分钟真实计时通过，两次撤离（25/9击杀），无浏览器错误/外部请求；原游戏入口自动游玩，不代表真人体验 |
| `pnpm test:portable` / `pnpm test:ui` | 通过；两文件ZIP离线流程及原UI双尺寸检查，具体计数见证据 |
| `pnpm test:layered-play` | **失败**：第一局600.461秒真实计时、两次切层与超时成功；第二局自动导航卡住，未完成三局断言。保留原失败结果，不记为通过 |

长时脚本失败现场 `mall-f1 (1316.1396,176.1407)` 的自动射击像素为 `(1028.0445,202.9111)`，命中的是“选择撤离点”按钮，overlay变成map。短程复放该现场，在 main 原HTML（SHA-256 `3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754`）及本轮HTML均得到同样按钮命中，见[基线复现](coast-runtime-sample/navigation-baseline.json)。相关地图、移动、UI及导航脚本与main无源码差异。此证据定位了已有自动输入与HUD冲突，不能冒充完整三局基线重跑，也不取消此次失败；交由Sol修订原脚本后重跑，未在本轮扩大修改商场/UI。

本轮修正了差分实际发现的 ±π/浮点角度规范化差异；同时补齐环境伤害事件、失败候选不泄漏受击计时、测试摆位不夹带容器属性。最初测试中的非法物资UID与打包字体注释扫描问题已修正，没有修改存档校验、删减断言或扩增字体来掩盖它们。

## 给 Opus / Sol 的接力清单

1. Opus 以本轮 `index.ts/host.ts` 替换 Mock，保持其自主选择的前端架构。先接真实城中村及关联两层；不要将新Runtime与旧RaidScene并跑，也不要把完整沿海地图数据当成授权制作全沿海素材。
2. Opus 将既有 W01–W14 改用真Runtime测试驱动/存储故障适配器，核对终局失败保持宿主、换层先重建后过滤事件、seq去重、物理输入松开、窗口事件与完整卸载。
3. Sol 在实际接线提交上运行 A01 F01–F19 必要边界，特别是旧v1/coast-v1经原解码恢复、被阻目的落点、同名目标、窗口/low/水域/角点、部分拾取与满包、原型宿主显示回调异常。当前26项是逻辑子集，不把未跑的组合写成全通过。
4. Opus/Sol 联合完成 F19投影与四尺寸、F20反复进退资源、F21新普通入口离线、F22城中村真实截图和遮挡信息边界；真机、真人平衡、GPU表现另行记录。原型已有Mock截图和W报告不算真Runtime结果。
5. 有原fork写权限的交接者核对远端未更新后，将本地原分支续作提交送回 PR #22，更新原正文/标题并运行CI。没有权限不得另开同目标PR。CI、合并和部署均未由本轮执行。

交接完成后等待维护者下一条指令，本轮不继续替换前端、不制作素材、不合并或发布。
