# 应用状态、执行器与存档边界

本页说明当前责任与兼容约束；任务到符号/测试的路径见 [CODEMAP](CODEMAP.md)，实际任务状态见 [WORK-QUEUE](WORK-QUEUE.md)及对应 PR。阶段交付文档中的“尚未接线”“待审”须按其日期和提交理解，不能替代当前实现。

## 当前结构

技术栈为 TypeScript 与 PixiJS，保持单文件离线；游戏不再使用 Phaser。标题页由 [title/scene.ts](../src/title/scene.ts) 在自己的 Pixi 渲染器上绘制，旧页签与结算页是 HTML 界面，背景为 [title-art.ts](../src/title-art.ts) 的静态站外画，由 [screen.ts](../src/screen.ts) 按状态挂到 `#game`。普通据点入口为水产站院子，旧页签保留；普通玩家新行动仅可选择街区和商场，默认街区；所有行动都由 Pixi 宿主运行真实 `CoastRaidRuntime`，新商场行动使用布局三版。`?sample=village` / `?sample=mall` 继续用于预选区域和样板试玩。

入口判断以 [station-view/route.ts](../src/station-view/route.ts) 与 [coast-view/sample.ts](../src/coast-view/sample.ts) 为准：`raidWorlds` / `defaultWorld` 选择可出击区域和默认值，`sampleSupports` 把存档里的任何行动交给 Pixi 宿主，包括切换前开始的旧沿海检查点行动（`coast-v2`）和商场一版。`?test=1` 页面仍可出击已关闭的沿海封锁区，用来制造这类旧行动；这不等于普通入口可新开沿海行动。

| 边界 | 当前责任 | 调用约束 |
| --- | --- | --- |
| 纯规则与世界定义 | 库存/交易、生存/成长、空间、追击、生产及世界解析 | 不导入 DOM、Pixi 等渲染库或全局 `app`；不负责显示或写浏览器存储 |
| `SaveSession` / `RecoveryStore` | 会话、候选与回滚、完整记录校验、所有权和原子写入 | 通过注入的存储/时钟/世界解析器运行；不负责场景切换 |
| `RealHideoutRuntime` | 在同一会话上提供据点动作、购物车、训练、导入确认及只读快照 | `snapshot()` 不成为第二份存档；观察者不能参与提交决定 |
| `CoastRaidRuntime` | 唯一的行动执行器，负责模拟、捕获/恢复和调用持久化 | 同一次行动只挂一个所有者；视图只读它发布的帧 |
| `station-view` / `coast-view` / `title` / 旧 `ui` | 画面、设备输入、反馈与生命周期接线 | 成功反馈在实际提交之后；普通入口不得依赖测试驱动 |
| `app` / `main` / 路由 | 组装实例，注入浏览器能力，协调输入、宿主和窗口事件 | 使用唯一会话；不新增另一份 profile 或玩法结算 |

[app.ts](../src/app.ts) 组装 `saveSession`、`hideoutRuntime`、音效和宿主引用（`coastSample`、`station`）。`SessionState` 是共享数据，调用者应在事务后重新读取 `save` / `loadout`，不要长期缓存可能被回滚或恢复替换的对象。

新行动的公开端口和画面服务类型 `CoastHandle` / `CoastServices` 在 [raid-runtime/contract.ts](../src/raid-runtime/contract.ts)，[host.ts](../src/raid-runtime/host.ts) 绑定 Runtime 和事务服务并在工厂检查类型；据点端口在 [hideout-runtime/contract.ts](../src/hideout-runtime/contract.ts)。行动背包面板只收到有限服务：按需读取 detached 库存/装备投影，随身整理发三个值/UID 命令，适配器保留原 `SaveSession.mutate`；搜刮模式仍走容器事务，连 bag/safe 内整理也不绕过它。面板不持有 Session/SaveSession，不维护库存副本。尚非所有视图完全隔离：宿主与旧 UI 仍协调会话/路由。场景无关的 DOM 资源作用域与唯一计数在 [view-lifecycle/scope.ts](../src/view-lifecycle/scope.ts)，页面级 Pixi 注册与渲染缓存在 [view-lifecycle/renderer-lifetime.ts](../src/view-lifecycle/renderer-lifetime.ts)；两者不导入场景或玩法，调用者直接导入，避免仅使用 `Scope` 时触发 Pixi 注册。

行动期间区分三种状态：Runtime 的实时模拟、Session 最近提交后的检查点、失败后保留的候选。`captureExpansion()` 取得实时状态的独立副本；`session.expansion` 本身不随每个模拟子步更新。负重及上限由 Runtime 的只读服务提供，视图不能从最近检查点重新计算临时效果。编译期类型只约束调用端；外部 JSON 仍须严格运行时校验，字符串 ID 通过 `hasOwnStringKey` 拒绝原型键与数组隐式转换。

## 写入、回滚与发布

`SaveSession.persist` 是完整写入流程的一部分：可能捕获当前世界、推进适用的基地时间/训练、同步安全箱，再调用 `RecoveryStore.commit`；成功后更新会话检查点并恢复挂接状态。它不是无副作用的序列化工具，也不能替代上层候选/回滚协议。

| 操作 | 现有提交入口 | 失败后的约束 |
| --- | --- | --- |
| 初始化/升级 | `initialize`、`ensureRpg` / `enableRpg`，经 `persist` 写入 | 未知/损坏数据不覆盖；旧原始字节保留；活动旧行动先恢复 |
| 据点/扩展动作 | `prepareExpansionMutation` 生成私有票据，`commitExpansionMutation` 校验基线并提交 | 拒绝不发布；写入失败不发成功事件；已保留票据只能按原候选重试 |
| 旧页签库存/医疗 | `mutate` 捕获参与状态，同步执行规则，再持久化 | 规则拒绝、异常和写入失败恢复库存、身体及参与世界 |
| 行动随身整理（非搜刮） | 有限 carried 命令调用同一 `mutate`，事务内重取当前 loadout | 保留原接受集合和一笔完整记录；拒绝/失败后重读投影，不缓存被恢复替换的对象 |
| 出击 | `beginRun` 生成装备和完整初始世界，一次写入后才启动宿主 | 不先扣账再另存世界；出击动画之后不能重复 `beginRun` |
| 箱子/尸体转移 | `transferLoot` 将候选容器与角色库存放入同一完整记录 | 来源、负载、世界一并回滚；重新取得恢复后的容器引用 |
| 从箱子/尸体装备（#26 F15） | `equipLoot` 在行动事务内从活容器取枪换枪，换下的枪弹回背包 | 容器、装备、背包随世界快照一并回滚；放不下整笔拒绝；安全箱不是来源 |
| 结算 | `prepareSettlement` 冻结结果；`retrySettlement` 写入后发布 `result` | 保留 `pendingSettlement` / `pendingExpansion`，重试不重新发奖；未成功不得卸载唯一候选 |
| 完整导入 | 严格解码和确认后调用 `importRecord`，经 `persist` 原子替换 | 写入失败保留旧记录；活动导入回菜单恢复，不重新出击 |

事务回调为同步规则操作；不得在其中发网络请求、换场景或修改未参与回滚的外部对象。`MutationResult` 区分 `committed`、`rejected`、`blocked`、`save-failed`。UI 只在 `committed` 后发成功反馈，冲突与待结算状态不能当一般失败强行重试。

现有商店有两条适配路径，但共用 `Shop.settleCartResult`：水产站 `RealHideoutRuntime.openShop` → `transaction`，旧页签 `checkout` → `SaveSession.mutate`。购物车 `place` 只改临时清单，`settle` 才提交；新增交易规则应放纯规则层，并检查两个调用端。领域层没有绕过购物车的单件买卖函数，新交易也不要另开结算路径。

`RealHideoutRuntime.retrySave` 对保留的基地检查点重试原票据；普通库存/购物失败已回滚，不会因点击“重试保存”自动重做购买。`backupRecord` 和据点 `exportBackup` 保留完整待保存状态，而非只导出库存。

## 捕获、恢复与表现

`SaveSession.attachRaid` / `attachExpansion` 接收捕获与恢复端口。旧海岸使用 `RaidCheckpoint`；多层行动使用包含完整世界的 `ExpansionState`。`CoastRaidRuntime` 的 `snapshot` / `restore`、`snapshotExpansion` / `restoreExpansion` 是持久状态接线。

当前层与完整记录的字段关系集中在 [raid-state-projection.ts](../src/raid-state-projection.ts)：`applyActiveRaidSnapshot` 写入调用者已克隆的候选；`activeRaidCheckpoint` 构造供恢复使用的检查点，其嵌套数据引用传入状态。两者不克隆、不推进时钟/RNG、不校验或提交，调用端仍承担隔离与实体所有权。新增字段先核对这份共享映射，再检查执行器接线。

捕获之前的弹匣同步、世界克隆，以及恢复时的对象和碰撞重建属于执行器的接线责任。`raid-runtime/presentation.ts` 的 `mapView` / `frameView` 是供视图消费的展示投影，不是存档格式；展示事件的序号、epoch 和纹理状态不应直接加入存档。

宿主切换先完成相应检查点/flush，失败则保留当前宿主及重试/备份入口。院子和行动轮用 [pixi-app.ts](../src/pixi-app.ts) 的一个 Pixi 应用（`takeApp` / `parkApp`），这个模块不认识任何场景、页面或玩法；两个视图经 [navigation.ts](../src/navigation.ts) 请页面换画面，不直接导入 `ui.ts`；标题页的渲染器另起一个，离开标题页即停止并移出页面，不会同时推进同一会话。失焦、屏蔽、暂停和释放输入是不同操作，调用语义以端口注释和输入测试为准。

## 格式与恢复兼容

主键仍是 `escape-bincov.session.v2`，旧 `escape-bincov.save.v1` 只作首次迁移来源。单条记录包含 profile 与检查点/扩展状态；`legacyBackup`、`migrationBackup`、`systemsBackup`、`perksBackup`、`enemyBackup`、`gunsBackup` 分别保留相应升级前原字节（`perksBackup` 是第一次写扩展 v3 时被替换的、带扩展 v1/v2 的记录原文；`enemyBackup` 是第一次写进敌人行动时被替换的记录原文；`gunsBackup` 是第一次写 v8 时被替换的 v3–v7 记录原文）。它们不能被反复嵌套的新备份替代。

profile/已结算备份版本、session/完整备份封套版本、`ExpansionState.version`、`LayeredRaid.version`、`worldVersion` 与 `layoutRevision` 各自保护不同边界。当前 profile 为 v3、会话记录和完整备份为 v8（枪械实例：枪物品、地上的枪和装备栏带枪的状态，见[改枪契约](gunsmith/CONTRACTS.md#存档与迁移m0-06)），带不带扩展、扩展是哪版由扩展自己的 `version` 说明，敌人规则开没开由记录有没有 `enemyBackup` 说明（#81 的记录 6、7 先占了号，见[记录版本 v8 与敌人规则](gunsmith/CONTRACTS.md#记录版本-v8-与敌人规则与-81-合并)）；v2–v7 记录、v1/v2 profile 只读，读档时校验后迁移（进行中的行动也就地迁移），扩展 v1/v2 均有兼容路径。分层行动的版本是规则身份：v1 无暴击、v2 旧暴击、v3 只从扩展 v3 出击，v4 是旧暴击加敌人战术、v5 是 Perk 加敌人战术，各自保持到结算。敌人规则一开就保持，普通提交不会去掉。普通提交不会把扩展 v3 降写为 v1/v2，只有确认导入的旧备份可以，下一次据点边界再升级。不能为了统一命名而合并版本或重写活动行动的世界/布局。

[expansion-worlds.ts](../src/expansion-worlds.ts) 已登记正式建筑和商场布局，M0 两图原型只在测试夹具中。普通据点边界（`ensureRpg`、出击、院子导入、重开）通过唯一的 `upgradeToRpg` 升级到当前扩展版本；活动旧行动不会被强转，结算后的下一次据点边界才升级。多层快照保存每图的门、实体、弹丸、噪声与本地时间，RNG、身体、成长和队列随同一候选提交。

旧 `coast-v1` 检查点继续恢复原地面物资；带容器的 `coast-v2` 保存稳定容器/行动身份，恢复时不重生掉落。没有检查点的历史旧行动仍沿用中断失败规则。新版刷新恢复最近成功检查点，不等于恢复尚未写入的内存进度。

导入先经 `decodePortableBackup` 分流，再由 `decodeSession` / `decodeBackup` 严格校验。备份文件、会话里的 profile、旧键和经典行动的携带物共用 [profile-codec.ts](../src/profile-codec.ts) 的 profile/物品栏规则（1 MiB 上限对嵌入的 profile 按紧凑 JSON 计），`checkpoint`、`recovery-store`、`save-backup` 只单向调用它；`importRecord` 依赖已验证的完整记录，类型断言不能代替解码。水产站 `previewImport` / `importBackup` 的确认绑定原始文本和会话 revision；据点已启用成长时拒绝无扩展的降级覆盖。`fresh-start.ts` 的 `confirmImport` 在玩家实际确认时重新预览，仍受 Runtime 守卫和写前比对约束。

`freshStartRecord` 也是完整 v8 新档构造入口（敌人规则未开），仅保留音量；`startOver` 通过同一确认导入路径替换主档。重开前的本机恢复副本使用单独的 `escape-bincov.reset-copy.v1` 槽位，不是第二个正在运行的会话。新增持久字段必须同时检查新建、升级、导入、重开、结算候选和同一 Runtime 的经典/分层捕获恢复路径。

多窗口保护由 `ownSession` 的页面生命周期锁和 `RecoveryStore.commit` 写前记录比对共同承担。`markConflict` 禁止后续持久化；窗口事件负责锁定画面并提示刷新/导出，不得用强制覆盖或改存档键消除冲突。

## 可执行的依赖边界

[source-graph.mjs](../scripts/source-graph.mjs) 的 `HEADLESS_ROOTS` 从规则、Session、存档编解码和两个 Runtime 入口展开类型与值依赖；[source-health](../scripts/ci/source-health.test.mjs) 阻止闭包引入视图、组装层、资源、外部包和浏览器全局。新 helper 自动跟随依赖进入检查，独立的新核心入口需登记根。既有 TextEncoder 编码与注入的 LockManager 端口允许；存储和页面访问仍由外层注入。

全源码循环检查区分 type-only 与值形式导入，并纳入字面量动态加载和自环；未知目标/非字面量加载直接报告。查询与 CI 使用同一模型（[CODEMAP](CODEMAP.md) 的 `pnpm architecture`）；静态值形式导入保守计入，运行时反射和任意调用不在此模型内。原导出使用检查仍含 tests/scripts 使用者，查询里的消费者只统计 src。

## 维护与历史

调用者必须知道的副作用、单位、提交点、引用失效和兼容条件贴在正式类型/方法旁；本页维护跨模块责任与格式边界，CODEMAP 维护定位路径，验收结果留在对应 PR/报告。价格、字段清单和全部函数签名不在三处重复。

按职责和可验证边界拆分文件；只有代码变短、依赖仍共同写一组状态时，并未降低接手成本。当前只有一个行动 Runtime，存档 codec 与视图路由的已登记运行时 import 环已消除；背包已收敛到有限服务，事务失败分类、内容身份与文案分离等剩余事项继续按 #60 跟踪，不再按旧的“双执行器”计划开发。

PR #2/#3/M0 的原始叙述见[本轮更新前的固定版本](https://github.com/xuys2025/escape-bincov/blob/773dcdf37c69c9441f7687627b89b582087eb021/docs/ARCHITECTURE.md)。历史验收只证明其受检提交；当前修改的验证从 [CODEMAP](CODEMAP.md) 和[开发手册](AGENT-HANDBOOK.md#4-按风险验证)选择。
