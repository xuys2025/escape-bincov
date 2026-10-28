# #60 · 代码理解成本与状态投影收敛

- 任务：[质量与减熵计划 #60](https://github.com/xuys2025/escape-bincov/issues/60)。分支 `agent/quality-entropy`；该任务的实施记录链接承接 PR，最新 head/检查以 PR 为准。
- 开始基线：`773dcdf37c69c9441f7687627b89b582087eb021`；2026-10-15 普通合并同步已接受 main `a2d716da774d7c5b17a2bbdf7bef4ee0eecc4742`（#57），保留双方历史。首批实现提交 `e50f49a`，整合与类型补强随本 PR 提交。
- 当前目标：低上下文 AI 按任务定位代码，关键状态约束靠近接口；两套行动宿主共享等价的持久化投影。
- 完成边界：导航/契约与真实调用一致，历史按需可追溯；共享投影通过旧/新宿主、存档和失败恢复验证；必要生成物一致，PR CI 通过。

## 有效决定与协作边界

1. 当前规则由源码和测试说明；导航索引符号、调用关系和条件扩展，不新建全仓符号/命令副本。
2. live、最近提交记录和失败候选分角色保留。先抽纯字段关系，不改变事务发布、时钟/RNG、世界/存档版本或渲染生命周期。
3. #57 默认 2.5D 已合并并纳入本次验证；#56 开场仍由原 PR 承接，本次未纳入。在继续工作前重新核对最新 main，不把在途实现写成已接受事实。更深的 codec/路由/命令登记等阶段继续由 #60 跟踪。

## 修改入口

- [CODEMAP](../CODEMAP.md)：三个任务阅读路径和模块卡；[架构](../ARCHITECTURE.md)：当前状态角色与依赖。
- [Session](../../src/session.ts)：`persist`、候选 prepare/commit 的现行契约。
- [旧行动宿主（#64 已删除，链接为删除前版本）](https://github.com/xuys2025/escape-bincov/blob/225248b1aa21f326b9057dfa393b3eb61f3c9b11/src/game.ts)与 [Runtime](../../src/raid-runtime/runtime.ts)：捕获/恢复接入与表现生命周期。
- [开发手册](../AGENT-HANDBOOK.md)与[短交接模板](../TASK-HANDOFF-TEMPLATE.md)：按风险验证与续作。

## 实际验证

以下为整合 `a2d716d` 后本分支的本地结果；GitHub CI 在提交后运行，以承接 PR 的准确 head 为准。环境为 Windows、Node 24.21.0、pnpm 11.19.0、Chrome/Playwright 离线上下文。

| 检查 | 状态 |
| --- | --- |
| 导航链接、符号、陈述 | 独立接手复核通过；已补初始化/旧检查点入口，按 #57 更新执行器与布局说明 |
| `pnpm test` | 444/444，通过；含新增 7 项追击归属、克隆顺序、隔离与布局回归 |
| `pnpm package` | 通过，包含类型检查；两份 HTML、两份 ZIP 和清单重新生成 |
| `node --test scripts/ci/*.test.mjs` | 13/13，通过 |
| `pnpm test:save-browser` | 9/9，通过；失败回滚/重复重试、备份导入导出、刷新及多窗口 |
| `node scripts/runtime-differential.mjs` | 4/4，通过；Phaser 与 Runtime 每帧比较，沿海/建筑各两种 seed，每例 240 帧模拟时间 |
| `pnpm test:mall-sample` | 22/22，通过；含旧布局 2 刷新恢复、新布局 3 与旧 Phaser 入口 |
| `pnpm test:raid-default` | 9/9，通过；普通街区/商场、旧行动恢复结算、无 WebGL 保档及触屏武器切换 |
| `pnpm test:portable` | 通过；临时目录解压 ZIP，普通 `file://` 入口离线操作、库存和暂停，无外部请求 |

投影和 Session 契约经过独立代码复核；首次整合前另以固定时钟、隔离内存存储对比原 `773dcdf` 与候选，4 种行动的捕获/恢复、写失败及重试记录一致。该对比不是自然游玩或浏览器验收。本批未修改战斗/AI/潮汐规则，未运行 10 分钟真实计时游玩；未做真人平衡性或真机手感验收。

## 下一步

本次为 #60 的首个可验收增量：按任务阅读、局部契约，以及两宿主共用的持久化字段映射。没有完成共享模拟内核、存档 codec 全面收敛或风险命令注册器，也未宣称修复总单全部缺陷。提交后核对 PR head 的全量 CI，等待维护者合并；后续阶段仍在 #60 确认依赖与归属。续作更新本摘要，不逐轮追加同样正文。

## 第二批

2026-10-22，分支 `agent/entropy-batch-2`，起点 main `345aff4`。依据当天的代码健康扫描：类型检查、单测和 CI 都绿，但死代码、只被测试使用的旧接口、重复实现和失效的 CI 外套件会拖慢下一步开发。本批只减熵，不改玩法、存档格式或界面行为。

**有效决定**

- 删掉没有任何使用者的 13 个导出和 6 处未用变量/导入；`tsconfig.json` 打开 `noUnusedLocals`、`noUnusedParameters`、`noImplicitOverride`、`noFallthroughCasesInSwitch`。
- 行动输入只保留一套设备状态 `InputState`：Phaser 时代的 `PlayerInput` 在生产里只用来生成空帧，改为 `idleFrame()`；原输入单测改测 `InputState`。
- 退役只被测试使用的旧接口：`domain.ts` 的 `writeSave`/`readSave`（直接写旧存档键、绕过修订栅栏）和 `shop.ts` 的布尔包装 `settleCart`，测试改用正式入口。`buy`/`sell`/`reload` 仍被多条救济规则测试用来造状态，本批保留。
- 合并重复：`src/html.ts` 的唯一 `esc`（原 5 份，3 份不转义单引号）；`rpg.ts` 的 `SUPPLY_IDS`（原 3 份清单，单测锁定它与 `useRpgItemResult` 一致）；`src/art/item-images.ts` 的物品图缓存（原 2 份）。`coast-view/inventory.ts` 因此不再反向依赖 `ui.ts`，视图层运行时 import 环从 5 个文件缩到 3 个。
- CI 外套件在 main 上已失效，改测试修复，产品未改：`test:station` A1 与 `test:hideout` 没有跳过 #56 的开场；A4 仍期待旧的无 WebGL 报错文本；`test:station-capability` 不认识 #64 常驻标题渲染器的 1 个固定监听（二分确认首败在 #64，关掉 #38 修复的反向对照仍失败）。`test:hideout` 在限 2 核软件渲染下 14 秒通过，转入 CI batch-6；`test:station-capability` 需要 16 个原生纹理单元，CI 软件渲染不满足，留作手动。
- 新守卫：每条 `test:*` 必须排进 CI 或登记为手动并写原因（`scripts/ci/browser-suites.mjs`）；`source-health.test.mjs` 拒绝无使用者的导出、新的运行时 import 环和规则模块的 DOM 依赖；`entry-docs.test.mjs` 要求入口文档的链接、锚点与路径存在。
- 文档：任务清单当前入口更新到 `345aff4`；历史文档 27 处死链改为删除前版本的永久链接或标注未入库，4 个开发手册锚点改到现编号。

**实际验证**（Windows、Node 24.19.0、本机 Chrome；生成物用 `node scripts/build.mjs`、`node scripts/package.mjs` 重建，单文件 5,605,866 → 5,602,342 字节）

| 检查 | 结果 |
| --- | --- |
| 严格类型检查（含新增四项开关） | 通过 |
| `node --import tsx --test tests/*.test.ts` | 453/453 |
| `node --test scripts/ci/*.test.mjs` | 45/45 |
| `test:station` | 76/76（完整一轮，约 8 分钟） |
| `test:hideout` | 8/8；另在限 2 核 SwiftShader 下 8/8、14 秒 |
| `test:station-capability` | 本机 GPU 4/4（199 秒）；另在 `345aff4`+补丁上关闭 #38 修复做反向对照，探针仍报原缺陷 |
| `test:desktop-input`、`test:mobile`、`test:ui`、`test:issue26-station`、`test:shop-drag` | 全部通过 |
| `test:coast-sample` | 53/53 |

**未做 / 下一步**

- 扫描确认的 10 个行为缺陷（含 1 个高：楼宇行动中敌人推门时写入失败后重试保存永远被拒）登记在 #60，修复另行交付。
- 剩余已知 import 环：存档 codec（Q-E05）、`ui.ts` 与 `coast-view/sample.ts`/`station-view/route.ts`（Q-E02），已登记在 `source-health.test.mjs`，只许变小。
- `test:station`、`test:coast-sample`、自然游玩与基准套件仍是手动；是否加固后进 CI 归 #61。

## Q-E05 存档 codec 去环

2026-10-22，[PR #71](https://github.com/xuys2025/escape-bincov/pull/71)，分支 `agent/save-codec-cycle`，起点 main `c8a5ed8`（已含 #68）。承接 #60 的 Q-E05，分工见 [#60 协作说明](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6333683019)。只改结构：存档格式、接受/拒绝集合与迁移结果不变。

**有效决定**

- 新模块 `src/profile-codec.ts`，只依赖 domain：已解析 profile 的严格解码 `decodeProfileDocument`（含导出封套）、放在其他记录里的 profile `decodeStoredProfile`、各格式共用的物品栏检查 `validInventory`（旋转、未知字段按格式显式传入）和校验原语 `finite`/`whole`/`identity`、`COUNT_MAX`/`UINT32_MAX`。检查返回布尔或抛 profile 的错误，各格式保留自己的报错文案。
- 依赖方向：`checkpoint`、`recovery-store`、`save-backup` 单向调用 codec；`recovery-store` 不再引用 `save-backup`，`checkpoint` 不再把拼出的 profile 序列化成 JSON 去借 `decodeBackup`。`source-health.test.mjs` 的 `KNOWN_CYCLES` 删去 Q-E05。
- 实测确认后显式保留的既有边界：旧键 v2 存档、会话里的 profile 和经典行动携带物受 1 MiB 限制，按紧凑 JSON 计、源文本空白不算；这些 profile 里的导出封套字段仍按封套解读；携带物带少量未知字段照旧接受。
- 三处持久物品检查（profile 物品栏、经典检查点容器、分层行动物品栏）合成 `validInventory`。`validateCheckpoint`、`validateExpansion` 的整数上下界全部写明，不再依赖默认的 1e9。`domain.ts` 迁移用的整数强制转换语义不同，保留。
- expansion v1→v2 升级原有 4 份（`enableRpg`、`beginRun`、水产站导入、`freshStartRecord`），合成 `upgradeToRpg`。原来只在 v1 时才读时钟的两处保留判断，时钟调用次数不变。

**行为对照**

改动前用游戏自己的流程造 59 份种子：各代 profile 与备份封套、session v2–v4、coast-v1/v2 检查点（含行动中途）、分层街区、商场三版布局、四种结算与待结算备份、带 legacy/migration/systems 原字节的记录、恢复备份封套。按字段形状逐一变异（删字段、改类型、越界、小数、重复元素、未知键等），另加 21 个大小与封套边界用例，共 100,581 个用例。`decodeBackup`、`decodeSession`、`decodePortableBackup`、`encodeRecoveryBackup`、`RecoveryStore.load` 共 247,627 次调用，逐例记录接受/拒绝、报错类型与文案、规范化输出哈希。工具先在 `c8a5ed8` 自比两次，0 差异。

改动后：接受/拒绝集合与全部被接受用例的输出逐例一致，其余报错文案也一致。130 处差异只有一类：分层行动物品栏里的物品为 `null` 时，以前抛 JS 的 `TypeError: Cannot use 'in' operator…`，现在抛该模块的「建筑、角色或基地存档损坏或版本不兼容。原始数据已保留。」。用改动后的代码重造 59 份种子，与原种子逐字节相同，开启成长、出击和结算的写入流程未变。

**实际验证**（Windows、Node 24.22.1、pnpm 11.19.0、本机 Chrome）

| 检查 | 结果 |
| --- | --- |
| 严格类型检查 | 通过 |
| `pnpm test` | 463/463（新增 4 项：存储 profile 大小规则、解码结果不共享对象、统一物品栏规则、`upgradeToRpg`） |
| `node --test scripts/ci/*.test.mjs` | 48/49；唯一失败的 shell 门禁用例在 Windows 写死 `C:/Program Files/Git/bin/bash.exe`，本机 Git 不在该路径，未改动的 `c8a5ed8` 同样失败，CI 在 Linux 上执行 |
| `pnpm package` | 通过，两份 HTML、两份 ZIP 与清单重新生成 |
| `test:save-browser` | 9/9 |
| `test:expansion` | 5/5，旧客户端取自 `07b1414` 的 `dist/index.html` |
| `test:portable`、`test:systems`、`test:station-reset`、`test:hideout` | 通过（systems 13/13） |
| `test:loot`、`test:qol-expansion`、`test:raid-default`、`test:buildings` | 25/25、4/4、9/9（含旧封锁区与商场一版行动恢复后结算）、8/8 |

**未做 / 下一步**

- Q-E02 路由收敛由同一承接者随后续作：`ui.ts` 与两个视图路由的三角、共享 Pixi 池可以先做；行动句柄合同和背包有限服务与 PR #65 改同一批文件，建议 #65 合入后再做。
- #60 评论登记的 Q-E04 类问题本批未改：`persist` 把校验异常当作存储失败、行动与据点的失败票据处理不一致、被拒票据留在 `SaveSession.prepared`。
- 新发现：`validateExpansion` 的装备检查用 `D.WEAPONS[weapon]`，没有 `Object.hasOwn`。分层行动携带物的 `weapon` 写成 `constructor`、`toString` 等原型键时会被接受，不存在的名字则会被拒绝。修复会改变接受集合，本批不改，已登记在 [#60](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6338855038)。

## Q-E02 路由收敛

2026-10-22，[PR #72](https://github.com/xuys2025/escape-bincov/pull/72)，分支 `agent/route-convergence`，叠在 PR #71 上（起点 main `c8a5ed8`，随 #71 同步到 main `8614c28`）。承接 #60 的 Q-E02，分工同上。本 PR 交付 A 段：拆掉页面与两个视图之间的环，并移出共享 Pixi 应用。B 段（行动句柄合同、背包只走有限服务）与 PR #65 改同一批文件；维护者决定 A 段先合，B 段登记在 [#60](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6338855038)，依赖 #65。只改结构，不改玩法、存档或界面行为。

**有效决定（A 段）**

- `ui.ts` 既是旧页签界面，又是整页的换画面入口。行动视图 `coast-view/sample.ts` 和院子 `station-view/route.ts` 为了换画面反向导入它，形成运行时环。现在两者经 `src/navigation.ts` 的窄接口请求换画面，由 `ui.ts` 在加载时注册。接口只有 `changeState`、`enterExternalRun`、`render`、`hideoutExternal`、`startPreparedHideoutRaid`，方法名与 `ui.ts` 原函数一一对应，不设通用命令总线。
- 视图原来借用 `ui.ts` 的叶子功能，移成独立模块：`src/toast.ts`、`src/save-export.ts`（备份下载）、`src/raid-areas.ts`（可出击区域、默认区域、`?sample=` 标记、village 种子、商场新布局）。只读 `app` 的 `sampleSupports` 留在 `coast-view/sample.ts`。
- 共享 Pixi 应用池（`takeApp`/`parkApp`，样板计数 `gpuTextures`/`managedSlots`）连同它需要的 `renderer-lifetime` 注册，移到 `src/pixi-app.ts`。这个模块不导入场景、页面或玩法，院子路由不再依赖行动宿主。`Scope` 与 `renderer-lifetime.ts` 仍留在 `coast-view/`：A 段开工时 PR #66 正在改 `scene.ts`，搬动随 B 段一起登记。
- 两个堆诊断脚本（`coast-sample-heap.mjs`、`sol-r6-heap.mjs`）原来往 `host.ts` 注入代码读取私有的 `parked`/`current`，改为注入 `pixi-app.ts`。它们受 Q-B06 影响在 main 上本就无法构建，本批未运行。
- `KNOWN_CYCLES` 为空：`src` 里不再有运行时 import 环。

**实际验证**（Windows、Node 24.22.1、本机 Chrome 与 GPU）

| 检查 | 结果 |
| --- | --- |
| 严格类型检查、`pnpm test` | 通过；叠在 #71 上 463/463 |
| `node --test scripts/ci/*.test.mjs` | 48/49；`source-health` 在空 `KNOWN_CYCLES` 下通过；失败的 shell 门禁用例同 Q-E05（本机 Git 路径） |
| `pnpm package` | 通过 |
| 仅 A 段（基于 main），17 个页面相关套件 | 16 套通过：`station`（76 步）、`hideout`、`raid-default`、`browser`、`save-browser`、`desktop-input`、`mobile`、`systems`、`title`、`station-capability`（本机 GPU）、`mall-sample`、`station-tier1`/`tier2`/`relief`/`reset`、`ui`；`coast-sample` 52/53 |
| 叠在 #71 上的合并构建，14 个套件 | 13 套通过：`save-browser`、`expansion`、`loot`、`systems`、`station`（78/78）、`hideout`、`raid-default`（9/9）、`browser`、`station-reset`、`station-tier1`、`desktop-input`、`mobile`、`title`；`coast-sample` 52/53，失败的仍是 W13 |

`coast-sample` 唯一失败的 W13（第二局从暂停菜单放弃，期望落幕显示「已放弃行动」）在未改动的 main `c8a5ed8` 和更早的 `345aff4` 上同样失败，与本批无关。原因是测试时序：Runtime 的 `retrySettlement` 在结算写入成功时同步把 `app.state` 设为 `result`，宿主在下一帧才设置落幕标记；W13 等到“落幕或 result”后立即读取落幕，读在两帧之间。产品照常播放落幕。修法是让 W13 只等落幕标记。已登记在 [#61](https://github.com/xuys2025/escape-bincov/issues/61#issuecomment-6338851506)。

**未做 / 下一步**

- B 段：`CoastServices`/`CoastHandle` 移入 Runtime 合同，工厂显式返回，去掉 `as unknown as CoastHandle`；背包面板的背包/安全箱移动改走有限服务，不再持有 `SaveSession`/`SessionState`；顺带把 `Scope`/`renderer-lifetime.ts` 移出 `coast-view/`。具体位置与验收登记在 [#60](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6338855038)，依赖 PR #65。

## Q-E02 B 行动背包有限服务

2026-10-25（UTC），分支 `refactor/raid-inventory-services`，起点为已接受 main `974a3a8d1ad2a7662c3a828226295d6c9b31eb64`。#65 前置已合入，#79 已完成句柄/工厂合同；本次只承接剩余背包面板边界，不重复这些工作。开放 #106 的改枪展示 hunk 继续原 PR；本轮不接管 M2，也不搬 Scope / renderer 工具。

**当前实现。** InventoryPanel 不再接收 SessionState/SaveSession。三个有限 carried 命令在同步 `saves.mutate` 回调内重取 loadout，验证 endpoint/UID/坐标/数量/方向后复用原 D.rotateItem、D.transferItem、moveQuantity；不接回调或库存对象，不增加 Runtime.transaction 的暂停/生命周期守卫。合法 UI 请求保留原接受集合，包括正常原地放置仍可提交、拒绝/失败仍会替换引用。搜刮模式连 bag/safe 内操作也保持原 transferLoot 和世界候选路径。

`inventoryView` 按需只复制 bag/safe 及显示主武器所需字段，调用后不缓存为第二份游戏状态；装备名仍按主武器而非手中刀具展示。`inventoryReadout` 只返回当前负重/上限或 null，周期刷新不 clone 库存/世界，也不重建拖动网格。面板按 UID 重新查找，失败后沿原 toast、清暂态和 saveFailed 宿主流程。

**规则与存档边界。** inventory 的 quick 仍是整件全量原子 D.transferItem；loot quick 仍可用 firstAvailableSlot + moveQuantity 部分合并/试方向，未统一算法。三命令仍让原 mutate 同时捕获并提交经典或分层世界，未增加成功后的第二次 checkpoint；存档、世界/规则版本、时钟和 UID 分配规则不变。classic-v1 无容器的旧行动也能随身整理。

**本地验证。** 正式工厂路径新增10项测试、加原负重共11/11；完整 `pnpm test` 884/884、`pnpm check:ci` 64/64、`pnpm package` 和最终严格类型检查通过。覆盖三动作×经典/建筑/商场单写实时世界、各自配额失败保留原字节与完整世界、恢复后同 UID 再操作、非法请求不误报存储失败、同容器原地/交换/拆分、nested 枪件/救济、旧 coast-v1 恢复，以及 loot 模式仍走真实容器服务。浅拷贝投影和把 quick 改成部分合并两个源副本反例均被相关断言有效拦下；这些改动只在忽略目录，不进入产品。

共享 flock 串行的原生键鼠定向检查 **3/3 通过**：1280×720 与 1920×1080 均完成原地旋转、整件双向 quick、拆分和同包拖动，每次输入只写一笔；1280 配额失败保留原字节，普通保存重试不重做动作，显式重试后 nested 枪件/UID 保持。页面异常/外网请求均为 0。已目检真实截图：[1280×720](raid-inventory-services/1280x720.png)、[1920×1080](raid-inventory-services/1920x1080.png)、[保存失败](raid-inventory-services/save-failed.png)，原报告与两种播种反例汇总见[验证记录](raid-inventory-services/validation.json)。测试用打包后的未提交工作树，HTML SHA-256 为 `986cb8777270ae92468dbf8fe922da6a9647713a755f5a1f939f39061dab1e85`；完整其余浏览器套件留待准确 head CI。没有真机、真人手感或性能签收；#60 其余事务分类、内容身份及资源工具收敛继续开放。

## Q-D02 旧交易与装弹接口退役

2026-10-23，[PR #89](https://github.com/xuys2025/escape-bincov/pull/89)，分支 `agent/q-d02-legacy-api`，起点 main `44494ea`；之后 #79、#88、#87 先后合入 main，本分支每次都普通合并同步，冲突只在任务清单和 handoff，都是双方各自新增的内容；准确基线以 PR 为准。承接 #60 的 Q-D02 剩余部分：`writeSave`/`readSave` 已在第二批退役，本批删去 `domain.ts` 的 `buy`、`sell`、`reload`，把仍有意义的断言迁到正式路径。玩法、存档格式、界面行为和打包产物都不变。

**有效决定**

- 引用核对：用与 `source-health` 相同的程序范围（src、tests、scripts）做 TypeScript 符号引用分析，三个函数在生产代码里的引用为 0，只有 `tests/domain.test.ts` 和 `tests/save-flow.test.ts` 调用。打包产物本来就不含它们（esbuild 摇树已剔除），删除后 HTML、两个 ZIP 和清单与基线字节一致，无生成物需要提交。
- 正式路径已覆盖、随旧接口删除：旧商店测试里的按包计价、出售付款、仓库满整笔拒绝（`shop.test.ts` 的净额结算与现金/空间拒绝，`hideout-runtime.test.ts` 的配额失败与满仓拒绝）；救济测试里几处 `sell(...) === false`，所在测试已断言救济标记，“救济品不能卖”由下面的新断言负责。
- 迁到正式路径：
  - 修理铺卖急救包（跨商人进货）→ `shop.test.ts`：别家商人的货硬塞进待买，整单按 `rule` 拒绝；同一件在卫生所能买。
  - 救济枪/弹不能卖 → `shop.test.ts`：硬塞进待卖时 `settleCartResult` 整单拒绝（原测试只测了放置提示）；`hideout-runtime.test.ts`：站内商店 `place` 拒绝上架救济品且不写存档。
  - 混装弹匣卸下后的可售性 → 整条移到 `shop.test.ts`，经购物车卖出普通弹，救济弹和救济枪不能上架。
  - S3 卖掉最后一把普通枪到 ¥210 → 出售步骤改走 `settleCartResult`，其余断言不变；集成版本已有站内 S3 测试。
  - 旧页签购买的写入失败回滚 → `save-flow.test.ts` 改为点「统一结算」驱动真实的 `checkout` → `mutate`：失败回滚并保留购物车，重试只写一次。原来调用的 `D.buy` 并不是旧页签的实际调用链。
- 装弹：旧 `reload` 不返回救济弹来源，与正式路径不同；正式路径是 `reloadMagazine`（出击时装满弹匣、行动中 Runtime 换弹）。原“只取缺的发数、不凭空造弹”测试改测 `reloadMagazine`，补上弹药不足、空包、口径不符和匕首四种情况。
- 原样保留：`migrateSave`、旧键 `SAVE_KEY` 读取与各版本迁移有生产调用。
- 历史证据 `docs/issue26-20261014/relief/relief-outcomes.mts` 的 S3 用例调用旧 `sell`：用法改为把“改后”一侧固定到当时的提交 `5cb0597`，重跑输出与已提交的 md/json 一致；拿当前 `src/domain.ts` 跑会报 `d.sell is not a function`。
- 反向验证：临时去掉结算的救济检查、商人货单检查、放置的救济检查、`reloadMagazine` 的口径检查与发数上限、旧页签结算的保留购物车与 `mutate` 回滚，共 7 处，每处都有新/改后的测试变红；还原后全绿。

**实际验证**（Windows、Node 24.22.1、pnpm 11.19.0、本机 Chrome）

| 检查 | 起点 `44494ea` 上 | 每次同步 main 后 |
| --- | --- | --- |
| 严格类型检查（含未用变量/参数） | 通过 | 通过 |
| `pnpm test` | 517/517（main 515；删 1 项旧商店测试，新增 3 项） | 全部通过，比当时的 main 多 2 项（如同步 `24c18a6` 后 552/552，main 550） |
| `node --test scripts/ci/*.test.mjs` | 52/53，`source-health` 3/3 | 52/53 |
| `pnpm package` | 通过；HTML、两个 ZIP、清单与 main 字节一致 | 通过；与当时 main 已提交的产物字节一致 |
| `pnpm test:save-browser` | 9/9 | 9/9 |

CI 自测失败的 1 项是 `policy.test.mjs:199` 写死 `C:/Program Files/Git/bin/bash.exe`，本机 Git 不在该路径；CI 在 Linux 上执行。

**未做 / 下一步**

- Q-D03 的测试入口分层（常规门禁、按风险检查、定期长测）本批未改，仍按 #60/#61 的归属。
- 本批不改 `settleCartResult` 的规则。它在行动中（`activeRun`）拒绝结算的分支，新旧测试都没有断言，本批也未补。

## Q-B06 诊断 bundle 同源

2026-10-23，[PR #90](https://github.com/xuys2025/escape-bincov/pull/90)，分支 `agent/diagnostic-bundle`，起点 main `44494ea`；交付前普通合并 main `76adbd6`（#79），开 PR 后为解决冲突又合并 `b38f23d`（#88）、`24c18a6`（#87）、`160c6f3`（#89）、`8b6192d`（#92）。承接 #60 的 Q-B06，脚本用途沿用 Q-E08 的口径。只改构建工具：`pnpm package` 产物逐字节不变，游戏、存档和测试断言不变。

**问题**：`scripts/build.mjs` 一导入就构建并写 `dist/`，诊断只能复制它的 esbuild 参数，复制品只有 PNG loader。源码导入 `range.css`、`station.css`、`opening.css` 后，`coast-sample-heap.mjs`、`sol-r6-heap.mjs` 在浏览器启动前就构建失败（main `44494ea` 实测 exit 1）。

**有效决定**

- 新模块 `scripts/game-bundle.mjs`，导入时不构建、不写文件。`buildGameScript(overrides)` 用正式构建的入口、loader、target、define、format 和 legalComments 在内存里构建游戏脚本；覆盖项替换整个顶层选项，诊断只在调用处写差异（`minify: false`、探针插件）。`withGameScript`/`inlineScript` 统一把脚本换进打包页时的拼接与转义。两个堆诊断各抄一份的只读页面池探针移到这里（`pagePoolProbe`），它读 `src/pixi-app.ts` 的私有 `parked`、`current` 和 `gpuTextures`，那边改名要同步。
- 页面模板与资源清单校验仍在 `build.mjs`，ZIP 仍在 `package.mjs`；`build.mjs` 改调 `buildGameScript()`。
- 诊断与原复制参数相比只多了正式构建的 `.css` loader 和 `legalComments: 'inline'`：原参数补上这两项后，与新模块的探针版、未压缩版产物逐字节相同。
- CI 新增 `scripts/ci/game-bundle.test.mjs`：构建堆诊断用的未压缩带探针游戏脚本并确认探针注入；`scripts/` 下除共享模块外不许再写 `entryPoints: ['src/main.ts']`（用 main 上的脚本做负对照，正好标出 5 处复制品）；另测换脚本的拼接与转义。它只证明能构建。

**脚本分类**（只含调用 esbuild 的脚本；其余脚本的用途仍归 Q-E08）

| 脚本 | 分类 | 依据 | 本次 |
| --- | --- | --- | --- |
| `build.mjs` | 正式构建 | `pnpm build`、`package`、`dev` 的入口 | 改调共享模块 |
| `coast-sample-heap.mjs` | 现役诊断 | 针对当前打包页的 F20 生命周期/堆诊断；Q-E02 已把它的探针改到 `pixi-app.ts` | 用共享配置，CI 构建其 bundle |
| `sol-r6-heap.mjs` | 现役诊断 | 同一工作负载，另跟踪 `Weather`、`SampleSound`、`SynthAudio`（三者仍在源码）；Q-E02 同样维护过 | 同上 |
| `astra-r7-f20.mjs` | 现役诊断 | F20 严格 60 轮的判定工具；默认直接读正式包，`R7_NAMED=1` 才构建未压缩脚本 | named 分支用共享配置 |
| `sol-r6-audio-controls.mjs` | 待确认 | R6 验收套件：比较 origin/main 与工作区 `SynthAudio` 的四个音效，并生成只静音 death() 的负对照页给 `coast-audio-test.mjs`；输出目录和 `safe.directory` 写死 R6 环境；main 上两侧相同，比较只在改音频的分支有意义 | 不删；负对照的游戏脚本改用共享配置（它要的正是“正式包只去掉 death()”），不进 CI |
| `mall-runtime-compat.mjs` | 归档 | 第一步要求基线 main 新建一版商场行动，只在传入 `7df2d22` 等历史基线时成立；打包的是存档夹具，不是游戏脚本 | 不改 |
| `build-coast-runtime.mjs` | 现役构建工具 | 输出无渲染器的 Runtime ES 模块（见 [COAST-RUNTIME-SAMPLE](../COAST-RUNTIME-SAMPLE.md)），格式、平台和 target 本就不同；main 上 exit 0 | 不改 |
| `art-review.mjs` | 现役 CI 测试（`test:art`） | 只打包绘制函数，不导入 CSS/PNG，不复制游戏脚本配置 | 不改 |

**实际验证**（Windows 10、Node 24.22.1、pnpm 11.19.0、本机 Chrome 156）。先在 `44494ea` 上做完；此后每次合并 main，冲突都只在文档，每次都重跑单测、CI 守卫和打包。四个诊断在 `44494ea` 上、合并 `76adbd6` 后、合并 `8b6192d`（#92 改了存档与出击流程）后各跑一轮，`coast-sample-heap` 在 `44494ea` 上多跑一次核对复现。

| 检查 | 结果 |
| --- | --- |
| 改动前 `coast-sample-heap`、`sol-r6-heap` | 均 exit 1：浏览器启动前三处 CSS 导入报错 |
| `pnpm package` | 产物与改动前逐字节相同：基于 `44494ea` 时 `dist/index.html` SHA-256 改动前后均为 `7daee656…1da0`；每次合并 main 后重新打包，都等于当时 main 已提交的制品（合并 `8b6192d` 后为 `340e6a41…2f28`）；两份 ZIP 与发布清单无差异 |
| `pnpm test` | `44494ea` 上 515/515；五次合并后依次为 549、549、550、552、647 项，全部通过 |
| `node --test scripts/ci/*.test.mjs` | 每次都是 55/56，新增 3 项通过（探针版构建 0.3–0.7 秒）；唯一失败的 shell 门禁用例同 Q-E05（本机 Git 路径） |
| `coast-sample-heap`（默认 20 轮，4 次） | 都能构建并跑完 20 轮；残留所有者 0，着色器源码 11→11，GPU 纹理每轮 2。前 3 次在原断言处 exit 1：第 6→20 轮快照间 `HTMLCanvasElement` 7→8；合并 #92 后的一次是 7→7，exit 0。堆趋势 +316,310 至 +330,840 B |
| `sol-r6-heap`（默认 20 轮，3 次） | 前 2 次 exit 0（`PASS lifecycle ownership checks only`，canvas 7→7）；合并 #92 后的一次 canvas 7→8，exit 1。残留所有者 0；堆趋势 +312,436 至 +322,834 B，签收 partial |
| `astra-r7-f20`（`R7_NAMED=1`，20 轮，不是严格 60 轮，3 次） | 20 轮资源检查全部通过；16–20 轮比 6–10 轮 +330,586 至 +334,542 B，按原条件 PARTIAL、exit 1 |
| `sol-r6-audio-controls`（3 次） | 负对照页每次都生成，未接着跑 `coast-audio-test.mjs`。main 与工作区 `audio.ts` 相同：前 2 次四个音效都在 0.8–1.2 倍内、exit 0；合并 #92 后的一次 `hit` 测得 1.227 倍、exit 1，同一份源码的测量波动就会越过门槛 |

**未做 / 下一步**

- **F20 仍是 PARTIAL**，归 #32。诊断能进入流程，不等于 F20 总堆通过；本次只跑了默认 20 轮，没有跑严格 60 轮。`HTMLCanvasElement` 7→8 是间歇出现的，两个堆诊断都会遇到（7 次里 4 次），原因未归因，交 F20 调查；本 PR 不改断言和判定条件。
- 两个堆诊断工作负载相同，默认输出目录都是 `test-results/coast-sample/heap`，后跑的覆盖先跑的；两者是否合并、`sol-r6-audio-controls` 是否保留（它对同一份源码也会越过 ±20% 门槛），归 Q-E08。全部脚本的用途分类也仍归 Q-E08。

## Q-E02 公共视图生命周期归位

2026-10-28，[PR #136](https://github.com/xuys2025/escape-bincov/pull/136)，分支 `codex/shared-view-lifecycle`，起点已接受 main `0f73a67386bac196b87c983668295be6d1a99f1e`；[接手范围](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6459328969)。这是 #115 背包有限服务之外、#134 架构工具之外的独立生命周期交付；SAMPLE_AREA/raid-areas 内容身份仍留 #60 候选，存档、规则、画面与素材没有改动。

- `view-lifecycle/scope.ts` 统一拥有原 `Scope` 与 `lifecycle` 对象；院子、行动和 `pixi-app.ts` 的所有引用直接指向这一模块。没有兼容转发或第二份计数。
- `view-lifecycle/renderer-lifetime.ts` 保持原页面级 Pixi 程序、着色器缓存和注册副作用；`pixi-app.ts` 仍在初始化前显式导入，两个场景从同一模块取 `releaseManagedSlots`。无 barrel，DOM 作用域不间接引入 Pixi 注册。
- 全部生产和单测引用已迁移；现役脚本没有引用旧路径，页面池探针仍在 `pixi-app.ts`。源码旁保留释放/上下文恢复细节，导航只定位所有者与检查入口。

本地 Windows / Node 24.22.1 / pnpm 11.19.0 / Chrome 156.0.8078.49，AMD Radeon RX 6600 / ANGLE D3D11；浏览器按协调窗口串行运行。[实际证据](shared-view-lifecycle-verification.json)保留原首败、通过项与制品哈希。

| 检查 | 实际结果 |
| --- | --- |
| 全量单测 / 工程守卫 / 严格打包 | 1022/1022、77/77、`pnpm package` 通过（同步 #134 前） |
| `test:coast-render-targets` | 5/5；20 次实际 resize、6 次真实 context restore、像素/键盘、结算及共享 renderer 院子↔行动重挂 |
| `station-context-program` | 1280×720、1920×1080 各 8/8；真实恢复、8/16 能力切换、程序复用及恢复后键盘；原工具仍归用途清单 review，不擅自提升为 CI 门禁 |
| `test:station-capability` | 4/4；probe/idle/remount/trip 各三轮 (8,8,16,16)，真实上下文丢失/恢复与模拟能力查询；原生起点 16，着色器监听/计数稳定 |
| 真实 main 基线构建 | 从最新已接受 `03ea261` 用 git archive 取原源码/脚本/tsconfig，真实路径 build/package；两份 HTML 和两份 ZIP 与本轮逐字节相同，`src` tree 与起点 `0f73a67` 相同 |
| 待 review 的旧 `coast-lifecycle-test` | 本轮完整 1/5；显式 test=1 Runtime 冻结/恢复/释放通过（host/runtime/view/targets 回收、空 stage、停 ticker、唯一计数归零）；普通入口四项等旧按钮超时，未进入故障注入边界 |
| 同一旧工具 main 基线 | 原首项同样在旧院子出击按钮等 20 秒超时；按共享浏览器协调在首败后停止精确进程及子树，其余基线项未运行/中断，未冒领通过 |

通过的渲染/能力专项页面异常和外部请求均为 0。HTML SHA-256 `f3b7c3e1f19bcc8bc22a517856c0fdf4301ff2ad16d8a0d9269304d1a626a9cb`；ZIP 哈希见实际证据。尚待 #134 合入后的新共享目录核心依赖负例和准确 head CI，不修改旧工具断言或接管其修复。

首次 `pnpm test` 因 pnpm 自动安装试图重建共享 node_modules junction，在运行测试前以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 停止。改用现有已装依赖并显式设置 `pnpm_config_verify_deps_before_run=false`，没有允许删除共享目录或改锁文件。

没有真机、真人观感或 F20 新签收；本阶段未合并/发布，#60 其他候选与在途 PR 保持原归属。
