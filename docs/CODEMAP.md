# 代码任务导航

本页定位当前代码，不记录逐轮进度。工作约束见 [AGENTS](../AGENTS.md)，职责与兼容见 [ARCHITECTURE](ARCHITECTURE.md)，任务归属见 [WORK-QUEUE](WORK-QUEUE.md)及原 PR 最新状态。

先读任务对应的卡片，再定位所列符号和测试；发现新的调用者或兼容路径时扩展阅读。这里不是允许改动的文件白名单，也不要求把链接文件全部读完。

| 要做什么 | 首读卡片 | 扩展条件 |
| --- | --- | --- |
| 交易、库存操作、拒绝原因 | [交易](#交易) | 新物品再看领域数据；交互变更再看视图 |
| 行动命令、输入、暂停或恢复 | [行动输入](#行动输入) | 触屏按钮、DOM 绑定、持久字段分别扩展 |
| 新持久字段、迁移、导入、恢复 | [存档](#存档) | 活动行动字段必须核对两端捕获/恢复 |

地图/碰撞从 [expansion-worlds.ts](../src/expansion-worlds.ts) 的 `resolveExpansionWorld` 和 [spatial.ts](../src/spatial.ts) 进入；画面/资源从 [station-view/route.ts](../src/station-view/route.ts)、[coast-view/sample.ts](../src/coast-view/sample.ts) 追宿主。只改素材时无需先读交易和迁移实现。

## 交易

**职责与所有者。** 商店规则生成结果；唯一 `SaveSession` 提交；水产站和旧页签负责输入与反馈。购物车是临时状态，不能冒充已保存的库存。

**首读路径：新增购买限制或一类库存操作。**

1. [hideout-runtime/contract.ts](../src/hideout-runtime/contract.ts)：`Result`、`CartView`、`ShopSession`，确认调用端能区分拒绝、确认和完成。
2. [shop.ts](../src/shop.ts)：`settleCartResult`、`CartRejection`、`cartRejectionMessage`；改变供货范围再读 `merchantStock`。
3. [hideout-runtime/runtime.ts](../src/hideout-runtime/runtime.ts)：`RealHideoutRuntime.openShop` → `transaction`。新增据点操作沿用候选事务入口。
4. [session.ts](../src/session.ts)：`prepareExpansionMutation` / `commitExpansionMutation`；旧页签适配还走 `mutate`，需要同时核对。
5. [station-view/ui.ts](../src/station-view/ui.ts) 的 `settle` 与 [ui.ts](../src/ui.ts) 的 `checkout`：只检查该操作的结果呈现和后续副作用。

**调用契约的维护位置。** `ShopSession` 方法旁写调用方需要知道的临时车、确认票据、失败与重置语义；事务回调限制放在 `SaveSession` 入口。价格、资格算法、物品清单以规则代码为准，不抄到卡片。

**验证入口。**

- [shop.test.ts](../tests/shop.test.ts)：购物车守恒、净额交易、拒绝时整笔不变。
- [hideout-runtime.test.ts](../tests/hideout-runtime.test.ts)：`shop retains disposable cart on quota failure`、`shop reasons distinguish`、`quest sale requires confirmation`。
- [save-flow.test.ts](../tests/save-flow.test.ts)：`merchant purchases and quest submission roll back`，保住旧 UI 调用链。

这些是定位相关断言的入口；修改后仍按[验证矩阵](AGENT-HANDBOOK.md#4-按风险验证)执行必要检查，不把测试文件存在当作已验证。

**按需继续。**

- 物品或商人定义：[domain.ts](../src/domain.ts) 的 `ITEMS`、`MERCHANTS`、`buyQuantity`；格位/转移规则：[loot.ts](../src/loot.ts)。
- 拖放、局部反馈：[station-view/panels.ts](../src/station-view/panels.ts)、[shop-feedback-test.mjs](../scripts/shop-feedback-test.mjs)。
- 新增需要保存的购买记录：继续[存档卡](#存档)，不能只改商店类型。

**结束定位的判据。** 能说清规则在哪执行、哪个入口提交、失败时哪些对象保留/回滚、两个 UI 如何得知结果；与本任务无关的世界和素材不继续展开。

## 行动输入

**职责与所有者。** 输入适配器产生意图，行动执行器消费意图。所有行动都走 Pixi 宿主 + `CoastRaidRuntime`（含切换前开始的旧沿海检查点和商场一版行动）；同一次行动只交给一个执行器和宿主。

**首读路径：增加一种命令或修改按下/按住语义。**

1. [raid-runtime/contract.ts](../src/raid-runtime/contract.ts)：`RaidIntent`、`RaidRuntime`，先区分边沿、持续输入、暂停与屏蔽。
2. [coast-view/input.ts](../src/coast-view/input.ts)：`Action`、`ACTION_KEYS`、`InputState.read` / `suppressHeld`。
3. [input.ts](../src/input.ts)：`PlayerInput.read` / `suppressHeld` 与 `ActiveClock`，Runtime 内部把意图转成逐子步输入时使用。
4. [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts)：`CoastRaidRuntime.advance` 中的转换与子步消费，再看 `step`。
5. [coast-view/host.ts](../src/coast-view/host.ts)：键鼠/触屏事件、面板与 `layer` 事件后的按键释放（`suppressHeld`）。

**调用契约的维护位置。** `RaidIntent` 旁说明坐标/时间单位和边沿消费；输入类说明释放及面板抑制；`RaidRuntime` 旁说明暂停、屏蔽和销毁。不在每个按钮复制这些规定。

宿主挂载/换层烘焙后的重新对时见 `RaidRuntime.resetClock` 契约；按编号拾取看 `CoastRaidRuntime.activate` 的 ground 引用路径及 `nearbyLoot`。拒绝事件的文案/门原因码见 `ViewEventBody`，原子性与重对时回归见 [runtime-gaps.test.ts](../tests/runtime-gaps.test.ts)，旧世界恢复与六种夹具严格校验见 [runtime-closeout.test.ts](../tests/runtime-closeout.test.ts)。

**验证入口。**

- [input.test.ts](../tests/input.test.ts)：单次按下、取消、held-input 释放和面板切换。
- [coast-input.test.ts](../tests/coast-input.test.ts)：触屏朝向、摇杆优先级和禁用读取。
- [raid-runtime.test.ts](../tests/raid-runtime.test.ts)：`commands and fireHeld only reach first substep`、`blocked panels advance the world`。
- [coast-sample-test.mjs](../scripts/coast-sample-test.mjs)、[desktop-input-test.mjs](../scripts/desktop-input-test.mjs)、[mobile-test.mjs](../scripts/mobile-test.mjs)：真实输入在 2.5D 宿主上的浏览器断言。

**按需继续。**

- 新触屏按钮：[coast-view/host.ts](../src/coast-view/host.ts) 的 `.cs-touch` 按钮绑定。
- 浏览器事件归属/失焦：[main.ts](../src/main.ts)、宿主事件处理；不要把 DOM 引入纯规则。
- 选择区域/布局：[coast-view/sample.ts](../src/coast-view/sample.ts) 的 `raidWorlds`、`defaultWorld`、`sampleSupports`、`sampleMallLayout`；`sampleEnabled` 只识别显式样板标记。
- 显示新动作：[raid-runtime/presentation.ts](../src/raid-runtime/presentation.ts) 的 `frameView` 与渲染端；这是展示投影。
- 动作新增可恢复计时器/状态：继续[存档卡](#存档)，检查点投影与展示投影不是同一契约。

**结束定位的判据。** 能跟踪一次输入到实际动作，并指出重复消费、失焦/面板释放的断言。资源生命周期只有在本次改变宿主归属时才展开。

## 存档

**职责与所有者。** `SaveSession` 协调唯一会话和完整候选；`RecoveryStore` 比对旧记录、验证并单次写入。场景通过捕获/恢复端口提供活动世界，UI 不自行组装另一套提交过程。

**首读路径：增加持久字段或修改恢复行为。**

1. [expansion-state.ts](../src/expansion-state.ts)：字段所属类型、`newExpansion`、`validateExpansion` / `exactKeys`。纯派生显示值无需自动入档。
2. [session.ts](../src/session.ts)：`ensureRpg` / `enableRpg`、`enableExpansion`、`beginRun` → [building-world.ts](../src/building-world.ts) 的 `initializeBuildingRaid` / [mall-world.ts](../src/mall-world.ts) 的 `initializeMallRaid`；读取 `persist` 的完整写入链，而非只搜字段名。
3. 同文件继续按操作读：`prepareExpansionMutation` / `commitExpansionMutation`、`prepareSettlement` / `retrySettlement`、`backupRecord`、`importRecord`。
4. [recovery-store.ts](../src/recovery-store.ts)：`SessionRecord`、`decodeSession`、`RecoveryStore.commit`；[save-backup.ts](../src/save-backup.ts)：`encodeRecoveryBackup` / `decodePortableBackup`。
5. [hideout-runtime/runtime.ts](../src/hideout-runtime/runtime.ts)：`previewImport` / `importBackup` 的确认与升级；[fresh-start.ts](../src/fresh-start.ts)：`freshStartRecord` / `startOver` 的完整新档路径。
6. 当前层与完整记录的共享映射：[raid-state-projection.ts](../src/raid-state-projection.ts) 的 `applyActiveRaidSnapshot` / `activeRaidCheckpoint`；这里不克隆、不提交。
7. 执行器端核对 [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts) 的 `snapshot` / `restore`、`snapshotExpansion` / `restoreExpansion`；旧检查点还读 [checkpoint.ts](../src/checkpoint.ts) 的 `RaidCheckpoint` / `initialCheckpoint` / `validateCheckpoint`。

**调用契约的维护位置。** 字段单位和合法范围归类型/校验器；`persist` 写入时的捕获与发布归会话入口；兼容策略归 [ARCHITECTURE](ARCHITECTURE.md#格式与恢复兼容)。卡片只维护路径，不再复制 schema。

**验证入口。**

- [expansion-recovery.test.ts](../tests/expansion-recovery.test.ts)：原子升级、严格导入拒绝、完整备份与待保存候选。
- [systems-session.test.ts](../tests/systems-session.test.ts)、[recovery.test.ts](../tests/recovery.test.ts)：重试不重复奖励、未知字段、原字节保留、修订栅栏。
- [save-flow.test.ts](../tests/save-flow.test.ts)、[hideout-runtime.test.ts](../tests/hideout-runtime.test.ts)：结算保存失败、导入确认、升级和旧入口。
- [fresh-start.test.ts](../tests/fresh-start.test.ts)：重开和恢复备份；活动世界再看 [raid-runtime.test.ts](../tests/raid-runtime.test.ts) 的回滚/恢复断言。
- [raid-state-projection.test.ts](../tests/raid-state-projection.test.ts)：当前层/追击归属、非当前层保留、建筑及商场捕获恢复。

**按需继续。** profile 字段进入 [domain.ts](../src/domain.ts) 的迁移与 [save-backup.ts](../src/save-backup.ts) 的校验；数据夹具进入 [tests/fixtures/layered.ts](../tests/fixtures/layered.ts)；真实文件导入和多窗口见 [save-browser-test.mjs](../scripts/save-browser-test.mjs)。

**结束定位的判据。** 新建、旧档升级、活动恢复、失败重试、完整导入/导出和重开都能说明字段来源；不能只补一个类型和默认值就结束。

## 维护本页

公开端口、提交边界或文件归属改变时，在同一个 PR 更新对应卡片；内部算法变化无需重抄实现。路径/符号改名同步修链接，当前行为与计划分开写。先查符号和调用点，再扩大阅读；不按固定行数拆源码，不生成手工全量符号表，也不为每目录增加重复 AGENTS。
