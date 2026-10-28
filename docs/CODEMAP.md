# 代码任务导航

本页定位当前代码，不记录逐轮进度。工作约束见 [AGENTS](../AGENTS.md)，职责与兼容见 [ARCHITECTURE](ARCHITECTURE.md)，任务归属见 [WORK-QUEUE](WORK-QUEUE.md)及原 PR 最新状态。

定位影响面后，用[检查导航](CHECKS.md)选择相关风险、真实旧客户端等前置和诊断；它只列出要求，不能替代下面各卡片的具体反例与调用边界。

需要核对影响面时运行 `pnpm architecture src/session.ts`（替换为目标源码路径）；省略路径可看全库摘要，`--json` 输出同一关系。命令只读当前源码，列出带行号的依赖、源码直接使用者和运行时传递依赖；类型边单列。测试入口和状态责任继续由本页卡片定位，执行策略见 [CHECKS](CHECKS.md)。共享分析与约束在 [source-graph.mjs](../scripts/source-graph.mjs)，由现有 `check:ci` 执行。

先读任务对应的卡片，再定位所列符号和测试；发现新的调用者或兼容路径时扩展阅读。这里不是允许改动的文件白名单，也不要求把链接文件全部读完。

| 要做什么 | 首读卡片 | 扩展条件 |
| --- | --- | --- |
| 交易、库存操作、拒绝原因 | [交易](#交易) | 新物品再看领域数据；交互变更再看视图 |
| 行动命令、输入、暂停或恢复 | [行动输入](#行动输入) | 触屏按钮、DOM 绑定、持久字段分别扩展 |
| 敌人身份、AI、表现或尸体掉落 | [敌人](#敌人) | 新持久状态继续存档卡；玩家射击继续行动输入 |
| 新持久字段、迁移、导入、恢复 | [存档](#存档) | 活动行动字段必须核对两端捕获/恢复 |
| 负重、上限等画面读数不一致 | [派生读数](#派生读数) | 先分清实时模拟、最近检查点与失败候选，再查格式化 |

地图/碰撞从 [expansion-worlds.ts](../src/expansion-worlds.ts) 的 `resolveExpansionWorld` 和 [spatial.ts](../src/spatial.ts) 进入；画面/资源从 [station-view/route.ts](../src/station-view/route.ts)、[coast-view/sample.ts](../src/coast-view/sample.ts) 追宿主；两者经 [navigation.ts](../src/navigation.ts) 请页面（[ui.ts](../src/ui.ts) 注册）换画面，不直接导入页面，轮用 [pixi-app.ts](../src/pixi-app.ts) 的同一个 Pixi 应用。只改素材时无需先读交易和迁移实现。区域身份由世界定义的 `region.id` 提供（[居民楼](../src/building-world.ts)与商场相同）；[投影](../src/raid-runtime/presentation.ts)不按显示名称补身份。楼梯方向的中文前缀依赖仍归 #60 Q-E06。

共享视图生命周期：宿主的 DOM 监听、计时器与清理栈由 [view-lifecycle/scope.ts](../src/view-lifecycle/scope.ts) 的 `Scope` 管理，`lifecycle` 是院子、行动与共享 Pixi 应用共同更新的唯一计数；[view-lifecycle/renderer-lifetime.ts](../src/view-lifecycle/renderer-lifetime.ts) 管理页面级 Pixi 适配器注册、程序/着色器缓存与已释放纹理空槽。`pixi-app.ts` 保留初始化前的显式副作用导入，各视图直接导入所需模块。释放边界见 [renderer-lifetime.test.ts](../tests/renderer-lifetime.test.ts)，实际共享渲染器往返与上下文恢复见 [coast-render-target-test.mjs](../scripts/coast-render-target-test.mjs) 和 [station-context-program.mjs](../scripts/station-context-program.mjs)。

商场布局：骨架与各版本世界在 [mall-world.ts](../src/mall-world.ts)（`mallWorldV2`～`mallWorldV4`），家具类型与二、三版家具表在 [mall-layout-v2.ts](../src/mall-layout-v2.ts)，四版家具表与“哪些区域已布置”在 [mall-layout-v4.ts](../src/mall-layout-v4.ts)；新出击选哪一版看 [raid-areas.ts](../src/raid-areas.ts) 的 `sampleMallLayout`。改碰撞要开新版本（已存行动按原版本恢复），只换图不用。画面按格选素材在 [coast-view/mall-dressing.ts](../src/coast-view/mall-dressing.ts)（四版家具选 Sol 的 M2 素材，暂不用的模块和替代见 `SAMPLE_STAND_IN`），[art/mall-furniture.ts](../src/coast-view/art/mall-furniture.ts) 的程序绘制件是同画布的后备；约束测试 [mall-layout-v2.test.ts](../tests/mall-layout-v2.test.ts)、[mall-layout-v4.test.ts](../tests/mall-layout-v4.test.ts)，记录见[商场 2.5D](mall-2-5d/README.md)。

水产站玩家空手姿态由 [station-view/art/player.ts](../src/station-view/art/player.ts) 的 `paintStationPlayer` 补齐，接入在 `HideoutScene.playerTex`，回归见 [station-browser-test.mjs](../scripts/station-browser-test.mjs) 的 H15（CI 入口 `test:station-hands`）。

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

- [shop.test.ts](../tests/shop.test.ts)：购物车守恒、净额交易、拒绝时整笔不变；救济品或别家商人的货硬塞进清单，结算也整笔拒绝。
- [hideout-runtime.test.ts](../tests/hideout-runtime.test.ts)：`shop retains disposable cart on quota failure`、`shop reasons distinguish`、`quest sale requires confirmation`、`the station shop refuses to list relief`。
- [save-flow.test.ts](../tests/save-flow.test.ts)：`merchant purchases and quest submission roll back`，经旧页签「统一结算」按钮走 `checkout` → `mutate`：写入失败回滚并保留购物车，重试只写一次。

这些是定位相关断言的入口；修改后仍按[验证矩阵](AGENT-HANDBOOK.md#4-按风险验证)执行必要检查，不把测试文件存在当作已验证。

**按需继续。**

- 物品或商人定义：[domain.ts](../src/domain.ts) 的 `ITEMS`、`MERCHANTS`、`buyQuantity`；格位/转移规则：[loot.ts](../src/loot.ts)。改枪样板的获取（货架上的 G17、基础件和 O01、G01，行动里的发现 `D.gunsmithFind`、旧敌人尸体的 `D.corpseLoot`，配件档次 `partTier`）见[改枪契约](gunsmith/CONTRACTS.md#样板获取路径m2-13)。
- 枪的估值与售价按组成算：`D.itemSale`（枪身加每件配件，救济组成不计、有救济组成时整件不可售），商店的报价、待卖区和结算都经 [shop.ts](../src/shop.ts) 的 `saleRefusal`，不自动拆件。
- 物品重量只经 `D.itemWeight`（枪按 `gunWeight` 连配件算，和装备时一样）：`D.weight`、行动负重、出发负重和各面板的重量显示都读它。
- 拖放、局部反馈：[station-view/panels.ts](../src/station-view/panels.ts)、[shop-feedback-test.mjs](../scripts/shop-feedback-test.mjs)。
- 自动拆分：[station-view/ui.ts](../src/station-view/ui.ts) 的 `UI.split` → 据点 Runtime `split` → [loot.ts](../src/loot.ts) 的 `moveQuantity`。`placementError === null` 包含合堆与交换；寻找空格还要检查 `D.fits`，不能把可接受的落点都当成空位。
- Perk 选择与 500 现金重置：据点 Runtime 的 `perkBoard`、`previewPerk` → `choosePerk`、`previewPerkReset` → `resetPerks` → `transaction`，院子与旧页签共用。确认票据绑定的内容和失败重试写在 [contract.ts](../src/hideout-runtime/contract.ts) 方法旁，选择规则在 [perks.ts](../src/perks.ts)；验证见 [perk-base.test.ts](../tests/perk-base.test.ts)。界面入口是院子 [station-view/ui.ts](../src/station-view/ui.ts) 的 `confirmPerk` 和旧页签 [ui.ts](../src/ui.ts) 的 `confirmPerkTab`（写入失败只经 `retrySave` 重试）；Perk 名称、效果文案、预览行和静态暴击显示都在 [perk-copy.ts](../src/perk-copy.ts)，验证见 [perk-copy.test.ts](../tests/perk-copy.test.ts) 与 [perk-ui-browser.mjs](../scripts/perk-ui-browser.mjs)。
- 改枪工作台的改装事务（#28 M2-04）：据点 Runtime 的 `openGunsmith` 给出 `GunsmithSession`，仿照 `ShopSession`：`preview` 只算不写，`confirm` 按 token 经 `transaction` 一次写入，写入失败保留预览、经 `retrySave` 后再确认。规则在 [gunsmith/edit.ts](../src/gunsmith/edit.ts) 的 `planGunEdit`，过期判定和失败语义写在 [contract.ts](../src/hideout-runtime/contract.ts) 方法旁，契约见[改枪契约](gunsmith/CONTRACTS.md#改装事务m2-04)；验证见 [gunsmith-edit.test.ts](../tests/gunsmith-edit.test.ts) 与 [gunsmith-edit-conservation.test.ts](../tests/gunsmith-edit-conservation.test.ts)。
- 改枪预设（#28 M2-07）：形状和校验在 [gunsmith/presets.ts](../src/gunsmith/presets.ts)，存在 profile 的可选字段 `gunPresets`（[profile-codec.ts](../src/profile-codec.ts) 的 `checkProfile` 严格检查），写入是据点 Runtime 的 `savePreset`、`renamePreset`、`deletePreset`，应用时的配件匹配是 [gunsmith/bench.ts](../src/gunsmith/bench.ts) 的 `presetEdits`；契约见[改枪契约](gunsmith/CONTRACTS.md#预设m2-07)，验证见 [gunsmith-presets.test.ts](../tests/gunsmith-presets.test.ts)。
- 改枪的详情与商店（#28 M2-08）：详情文字 [gunsmith/item-facts.ts](../src/gunsmith/item-facts.ts)（`partFits` 在 [gunsmith/bench.ts](../src/gunsmith/bench.ts)），目录筛选和分页是 [shop.ts](../src/shop.ts) 的 `ShopBrowse`、`catalogPage`，商店会话的 `browse`；契约见[改枪契约](gunsmith/CONTRACTS.md#详情商店与售卖预览m2-08)。
- 改枪美术（#28 M2-10）：Sol 的图在 `assets/gunsmith/`，导入脚本 [gunsmith-assets.mjs](../scripts/gunsmith-assets.mjs) 生成 `src/art/gunsmith-art-meta.ts` 和 `gunsmith-assets.ts`；排布 [art/gunsmith-layout.ts](../src/art/gunsmith-layout.ts)，画图与缓存 [art/gunsmith-compose.ts](../src/art/gunsmith-compose.ts)，各处经 [art/gunsmith-hooks.ts](../src/art/gunsmith-hooks.ts) 取图（单测不加载 PNG）；持枪图由 [coast-view/textures.ts](../src/coast-view/textures.ts) 的 `weapon(…, gun)` 按 Runtime 发布的 `gun: { id, sig }` 组合。契约见[改枪契约](gunsmith/CONTRACTS.md#美术接入m2-10)，验证见 [gunsmith-art.test.ts](../tests/gunsmith-art.test.ts) 与 `test:gunsmith-bench` 的 A1、B8。
- 改枪工作台界面（#28 M2-05）：面板 [gunsmith-view/bench.ts](../src/gunsmith-view/bench.ts) 的 `Workbench`，院子 [ui.ts](../src/station-view/ui.ts) 的 `gunsmith` 面板和旧页签 [src/ui.ts](../src/ui.ts) 的浮层共用；列什么、怎么比由纯模型 [gunsmith/bench.ts](../src/gunsmith/bench.ts) 算。契约见[改枪契约](gunsmith/CONTRACTS.md#工作台界面m2-05)；验证见 [gunsmith-bench.test.ts](../tests/gunsmith-bench.test.ts) 与 `test:gunsmith-bench`。
- 新增需要保存的购买记录：继续[存档卡](#存档)，不能只改商店类型。

**结束定位的判据。** 能说清规则在哪执行、哪个入口提交、失败时哪些对象保留/回滚、两个 UI 如何得知结果；与本任务无关的世界和素材不继续展开。

## 行动输入

**职责与所有者。** 输入适配器产生意图，行动执行器消费意图。所有行动都走 Pixi 宿主 + `CoastRaidRuntime`（含切换前开始的旧沿海检查点和商场一版行动）；同一次行动只交给一个执行器和宿主。

**首读路径：增加一种命令或修改按下/按住语义。**

1. [raid-runtime/contract.ts](../src/raid-runtime/contract.ts)：`RaidIntent`、`RaidRuntime`，先区分边沿、持续输入、暂停与屏蔽。
2. [coast-view/input.ts](../src/coast-view/input.ts)：`Action`、`ACTION_KEYS`、`InputState.key` / `read` / `suppressHeld`。`key` 的 `repeat` 区分新的独立按下与旧 held 状态：漏收 `keyup` 后新按只解除该键抑制；根据 WASD 的 `shiftKey` 补齐修饰键状态不算 Shift 新按下。
3. [input.ts](../src/input.ts)：`InputFrame`、`idleFrame` 与 `ActiveClock`，Runtime 内部把意图转成逐子步输入时使用；设备状态只在 `InputState` 一处。
4. [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts)：`CoastRaidRuntime.advance` 中的转换与子步消费，再看 `step`；开火走 `pull`（本帧的点击/按住在帧末生效）→ `runTrigger`（子步内按冷却、换弹到期时刻开火）→ `shoot`。
5. [shooting.ts](../src/shooting.ts)：开火方式、精瞄举枪、晃动、连射散布和后坐的纯规则与参数（维护者选定的“稳定”一套；#39 的样本自动枪已在改枪 M2-01 由正式的 M4A1 接替）；状态只在 Runtime 内存里，不进存档。手中枪的散布、射程、换弹、弹量、手感和重量不按 id 查表：经 [domain.ts](../src/domain.ts) 的 `equippedGun`（装备栏里的枪械实例）和 [gunsmith/stats.ts](../src/gunsmith/stats.ts) 的有效属性得出，Runtime 的 `currentWeapon` / `grip` 按实例缓存，见[改枪契约](gunsmith/CONTRACTS.md)的 M1-05 一节。
6. [coast-view/host.ts](../src/coast-view/host.ts)：键鼠/触屏事件、面板与 `layer` 事件后的按键释放（`suppressHeld`）；搜刮面板里移动键（`isMoveKey`）直接离开并开始移动（#26 F13），回归在 [loot-browser-test.mjs](../scripts/loot-browser-test.mjs)。

画面服务的 `CoastHandle` / `CoastServices` 也在 Runtime 契约中；[raid-runtime/host.ts](../src/raid-runtime/host.ts) 的工厂用 `satisfies CoastHandle` 检查接线。扩展端口时让类型检查发现漏接，不用双重类型断言绕过。

**调用契约的维护位置。** `RaidIntent` 旁说明坐标/时间单位和边沿消费；输入类说明释放及面板抑制；`RaidRuntime` 旁说明暂停、屏蔽和销毁。不在每个按钮复制这些规定。

宿主挂载/换层烘焙后的重新对时见 `RaidRuntime.resetClock` 契约；按编号拾取看 `CoastRaidRuntime.activate` 的 ground 引用路径及 `nearbyLoot`。拒绝事件的文案/门原因码见 `ViewEventBody`，原子性与重对时回归见 [runtime-gaps.test.ts](../tests/runtime-gaps.test.ts)，旧世界恢复与六种夹具严格校验见 [runtime-closeout.test.ts](../tests/runtime-closeout.test.ts)。

**验证入口。**

- #75 的枪身回缩候选（#119）由 [scene.ts](../src/coast-view/scene.ts) 调用 [weapon-retraction.ts](../src/coast-view/weapon-retraction.ts)：shot 当帧保持原握枪位置，之后沿原枪轴恢复，袖管/描边跟随最终 transform；火光跟当前枪口，曳光保留发射快照。幅度和时长按枪声音色族查 `RETRACTION`（H-09：手枪最轻、霰弹最重，卡宾枪和步枪保持维护者试玩认可的 3 世界像素/80 ms），超过可见时段直接归零，低帧可能完全没有回缩，不改变 Runtime 或存档。试枪场“打击感：旧版”（`ViewOptions.feel`）和减弱动效不回缩。时序/投影边界见 [weapon-retraction.test.ts](../tests/weapon-retraction.test.ts)，场景接入见 [shooting-test.mjs](../scripts/shooting-test.mjs) 的 j 项。

- [input.test.ts](../tests/input.test.ts)：`InputState` 的单次按下、取消、held-input 释放和面板切换，以及 `ActiveClock`。
- [coast-input.test.ts](../tests/coast-input.test.ts)：触屏朝向、摇杆优先级和禁用读取。
- [raid-runtime.test.ts](../tests/raid-runtime.test.ts)：`commands reach only the first substep`、`blocked panels advance the world`。
- [shooting.test.ts](../tests/shooting.test.ts)、[shooting-bench.test.ts](../tests/shooting-bench.test.ts)：射击规则的时间切分不变性；固定种子与输入在不同帧率下的弹道、双端开火方式、暂停/面板取消、稳定与后坐。装备枪经改枪有效属性的各处读法与旧查表逐项相同见 [gunsmith-readers.test.ts](../tests/gunsmith-readers.test.ts)。
- [breath-runtime.test.ts](../tests/breath-runtime.test.ts)：屏息 Perk 在真实帧和开枪中的蓄力、各中断清空与弹丸快照（CP-12～18）；纯规则在 [breath.test.ts](../tests/breath.test.ts)。行动 HUD 的暴击投影（静态、屏息目标、旧行动、匕首）与开枪快照一致见 [crit-hud.test.ts](../tests/crit-hud.test.ts)，浏览器中的武器卡与截图见 [perk-ui-browser.mjs](../scripts/perk-ui-browser.mjs) 的 R 步骤。
- [raid-clock.test.ts](../tests/raid-clock.test.ts)、[bullet-time.test.ts](../tests/bullet-time.test.ts)：子步时间跨追击/涨潮/训练边界和写失败，以及本步晚出生弹丸只推进剩余时长；不能为了调整射击而先把整帧时间发布给所有子步。
- [coast-sample-test.mjs](../scripts/coast-sample-test.mjs)、[desktop-input-test.mjs](../scripts/desktop-input-test.mjs)、[mobile-test.mjs](../scripts/mobile-test.mjs)：真实输入在 2.5D 宿主上的浏览器断言。

**按需继续。**

- 枪上的设备与枪声（#28 M2-03、M2-11）：F/G 发 `'light'`/`'laser'` 命令，开关规则在 [gunsmith/devices.ts](../src/gunsmith/devices.ts)；激光和暴露看 [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts) 的 `laserBeam`、`shotGrip`；枪声按 [gun-timbre.ts](../src/gun-timbre.ts) 的 `timbreOfGun` 选枪族，消音见 [audio.ts](../src/audio.ts) 的 `SUPPRESSED`。规则见[改枪实现契约](gunsmith/CONTRACTS.md#激光灯光与枪声m2-03m2-11)。
- 新触屏按钮：[coast-view/host.ts](../src/coast-view/host.ts) 的 `.cs-touch` 按钮绑定。
- 浏览器事件归属/失焦：[main.ts](../src/main.ts)、宿主事件处理；不要把 DOM 引入纯规则。
- 选择区域/布局：[raid-areas.ts](../src/raid-areas.ts) 的 `raidWorlds`、`defaultWorld`、`sampleMallLayout`；`sampleEnabled` 只识别显式样板标记。县域选图展示在 [station-view/deploy-map.ts](../src/station-view/deploy-map.ts)（地标坐标、标签方向、路线与插图焦点，验证见 [deploy-map.test.ts](../tests/deploy-map.test.ts)）；`deploymentWorld` 只允许现有区域白名单，未开发区域的预览只存在于站内 UI，不创建世界或修改存档。地图与插图只由 [county-art.ts](../src/station-view/county-art.ts) 在渲染侧导入（构建按清单核对）；出击面板重绘经 [morph.ts](../src/station-view/morph.ts) 就地更新，换区的滑动与入场动画依赖元素保留，浏览器回归在 `test:raid-default` 的 R10/R11。行动视图能否接管存档里的行动看 [coast-view/sample.ts](../src/coast-view/sample.ts) 的 `sampleSupports`。
- 显示新动作：[raid-runtime/presentation.ts](../src/raid-runtime/presentation.ts) 的 `frameView` 与渲染端；这是展示投影。射击状态在 `hud.aim`，屏息蓄力在 `hud.breath`（规则在 [breath.ts](../src/breath.ts)，Runtime 在 `step` 逐子步取瞄准目标、在 `runTrigger` 推进，清空点列在 `CoastRaidRuntime.breath` 注释）。手中枪械的暴击率在 `hud.crit`，与开枪取同一份 `CoastRaidRuntime.shotCrit` 快照；武器卡底部的文字由 [perk-copy.ts](../src/perk-copy.ts) 的 `critHud` 生成、[coast-view/host.ts](../src/coast-view/host.ts) 的 `critLines` 绘制，界面不再推算概率。
- 鼠标瞄准与镜头：[coast-view/scene.ts](../src/coast-view/scene.ts) 的 `aimFromClient` 经平滑镜头换算瞄准，镜头前探由 [coast-view/camera.ts](../src/coast-view/camera.ts) 的 `pointerLead` / `stepLead`（鼠标，只在精瞄时）或 `aimLead`（触屏）决定；鼠标前探碰到地图边就停，上限由 `leadRoom` 给出（#80）。改前探前先跑 `test:shooting` 的“静止指针不漂”（检查 a 在空地，a-edge 在地图边）和 [coast-camera.test.ts](../tests/coast-camera.test.ts)。
- 受击反馈（#75）：画面从 [coast-view/scene.ts](../src/coast-view/scene.ts) 的 `blow()` 开始，负责闪白、顺弹道后退和受击/恢复姿态；档位、同一枪合并成一次受击和玩家中弹的镜头推动由 `landBlows` 按 [coast-view/blow-feel.ts](../src/coast-view/blow-feel.ts) 的规则（`blowTier`、`ShotBlows`、`pushCamera`）处理，墙和门的弹着点特效在 [coast-view/fx.ts](../src/coast-view/fx.ts) 的 `sparks`；姿态只在角色身体所用的样式（原型自己的，否则种类的）有受击帧时换帧（`posable` 调用 [coast-view/textures.ts](../src/coast-view/textures.ts) 的 `hasBodyFrame`）。姿态帧由 [export-hurt-poses.ts](../scripts/export-hurt-poses.ts) 从 #96、#122 的图集切出（各类采用的图集版本记在 `POSE_KINDS`，不画手臂的爪击类记在 `ARMLESS`），B 组图集的画布取整误差由其中的 `driftMap` 还原；[coast-view/pose-assets.ts](../src/coast-view/pose-assets.ts) 加载。声音在 [coast-view/sound.ts](../src/coast-view/sound.ts) 的 `struck`；枪声按音色族合成（[gun-timbre.ts](../src/gun-timbre.ts) 给出改枪目录每把枪和现有外观的音色族，`SynthAudio.shot` 的 `REPORTS` 是配方），试枪场面板的“打击感：新版 / 旧版”切换 `ViewOptions.feel`，旧版回到改动前的声音。暴击与击杀标记在 [coast-view/host.ts](../src/coast-view/host.ts) 的 `mark` / `critMark`。回归看 `test:shooting` 检查 g、h、i 与 [hurt-poses.test.ts](../tests/hurt-poses.test.ts)、[blow-feel.test.ts](../tests/blow-feel.test.ts)。
- 拥挤时的反馈预算（#75 H-07）：规则只有 [feedback-budget.ts](../src/feedback-budget.ts) 的 `admit` 一处，反馈分核心和装饰两类。粒子在 [coast-view/fx.ts](../src/coast-view/fx.ts) 的 `spawn` 应用（离玩家远的算装饰，玩家位置由 scene 每帧写进 `fx.focus`），声音在 [audio.ts](../src/audio.ts) 的 `SynthAudio.ready` 应用（枪声尾音、机械声、脚步和远处的声音算装饰）；两边都按类计数 `dropped`。回归看 `test:shooting` 检查 k 与 [feedback-budget.test.ts](../tests/feedback-budget.test.ts)。
- 室内墙体显示（[方案](INDOOR-WALL-VISIBILITY-PLAN.md)）：玩家所在建筑（商场为楼体占地）的墙按 [coast-view/wall-display.ts](../src/coast-view/wall-display.ts) 的 `indoorArea` / `underRule` / `wallRule` / `rowModes` / `clearanceCuts` 显示整面、只留占地格或不画，[scene.ts](../src/coast-view/scene.ts) 的 `updateWalls` 应用到带 `cell` 的墙块（`buildGeneric`、[mall-scene.ts](../src/coast-view/mall-scene.ts) 的 `buildMall` 设置），墙上的附着物随整面显示；这些墙不走 `updateFades`，其余结构只有挡住角色时淡出。图由 [textures.ts](../src/coast-view/textures.ts) 的 `wallCut` 生成。只是显示：碰撞、子弹、门和房间揭示都不读它。回归看 [wall-display.test.ts](../tests/wall-display.test.ts)、`test:issue26-spatial` 的 S03、S04、S04c 与 `test:mall-sample` 的 M02、M11、M18、M19、M21。
- 房间揭示在画面上的表现：哪些房间算揭示由 [presentation.ts](../src/raid-runtime/presentation.ts) 的 `Revelation` 决定，这是 Runtime 规则，改它会改变玩家能看到的敌人信息；画面只读 `ViewFrame.revealed`，未揭示房间里的敌人、物资、灯光和特效不画（[structure-guide.ts](../src/coast-view/structure-guide.ts) 的 `shownAt` / `actorShown`）。城中村和居民楼用屋顶、天花板盖住未揭示的房间；商场不画天花板，由 [lighting.ts](../src/coast-view/lighting.ts) 的 `Lighting.setUnseen` / `syncUnseen` 把未揭示的房间压暗（#26 F14），立着的图经 `at` 乘同一层暗色，只有 scene 的 `rebuild` 给商场楼层传房间。回归看 [coast-lighting.test.ts](../tests/coast-lighting.test.ts) 与 `test:mall-sample` 的 M03c。
- 试枪场：[range/](../src/range/index.ts)（`?range=1`，内存存档，不碰正式存档）。
- 动作新增可恢复计时器/状态：继续[存档卡](#存档)，检查点投影与展示投影不是同一契约。

- 开火与命中音关联（#75）：临时 `hurt.bullet` 的来源在 [Runtime](../src/raid-runtime/runtime.ts) 的 `observeShot`、`damageEnemy` / `hurt`；[sound.ts](../src/coast-view/sound.ts) 用已有 `shot.pellets` 关联一次开火与目标，缓存释放和旧恢复弹的降级规则见源码旁契约。跨批霰弹、同批多枪、经典路径与刷新回归见 [shotgun-hit-sounds.test.ts](../tests/shotgun-hit-sounds.test.ts)。弹道与持久弹丸不增加字段。

**结束定位的判据。** 能跟踪一次输入到实际动作，并指出重复消费、失焦/面板释放的断言。资源生命周期只有在本次改变宿主归属时才展开。

## 敌人

组织关系、目标、NPC 伤害与玩家收益归属见 [enemy-relations.ts](../src/enemy-relations.ts) 和[合同](tasks/enemy-relations.md)。条件交涉仍用 `SpatialInteraction` → `targetView/activate` 的单一选择链，询问只发说明事件；跨层新原型职责与两人预算在 `changeLayer`，抵达观察点清理在 `advancePursuits`。对应回归为 `enemy-relations.test.ts`、`enemy-pursuit.test.ts` 和 `test:enemy`，不要给旧四类追加新阵营字段。

**职责与所有者。** [domain.ts](../src/domain.ts) 的 `ENEMIES` 保留旧四类；[enemy-archetypes.ts](../src/enemy-archetypes.ts) 定义新原型与持久战术状态；`actorArchetype/actorDefinition`是已保存武器变体的唯一有效规则来源，控制器、弹丸、投影与校验共同读取。[enemy-encounters.ts](../src/enemy-encounters.ts) 在新街区出击事务中安装三原型、市场头目、动物与[盐蚀者样板](tasks/enemy-affected.md)，旧活动行动不迁移敌人。制作工具的[十八原型目录](../scripts/enemy-catalog-data.ts)保留完整设计需求，不是完成清单；当前接入与验证见[街区样板](tasks/enemy-street-encounter.md)。

**首读路径。** [enemy-profile.ts](../src/enemy-profile.ts) 的 `getLegacyEnemyProfile` 提供旧身体、武器、攻击类型与尸体抽取次数；[enemy-ai.ts](../src/raid-runtime/enemy-ai.ts) 的 `advanceLegacyEnemy` 更新旧敌人的感知、状态、冷却、路径和移动。世界碰撞由 `LegacyEnemyWorld` 提供，随机数、发射/近战/开门副作用经 `LegacyEnemyEffects` 同步返回 [Runtime](../src/raid-runtime/runtime.ts)。敌人状态、RNG、UID、伤害、事务和事件仍由 Runtime 所有，AI 模块不增加持久化入口。

展示看 [presentation.ts](../src/raid-runtime/presentation.ts) 的 `frameView`；经典尸体看 Runtime 的 `damageEnemy`，分层看 [layer-transition.ts](../src/layer-transition.ts) 的 `damageLayerEnemy`。新字段或新原型不能只加入目录，必须继续[存档卡](#存档)，同步严格校验、名册、跨层和捕获/恢复。

新战术由 [tactical-enemy.ts](../src/raid-runtime/tactical-enemy.ts) 的 `advanceTacticalEnemy` 推进，经 `TacticalEffects` 请求 Runtime 副作用。`EnemyState.tactics` 是唯一持久来源，画面只投影其阶段。新街区 `LayeredRaid` v5，同时保留历史敌人 v4 和 Perk v3 的规则；记录层 #81 原用 `SessionRecord` 6/7，改枪后统一为 v8，敌人规则以 `enemyBackup` 键表示（[记录版本 v8 与敌人规则](gunsmith/CONTRACTS.md#记录版本-v8-与敌人规则与-81-合并)）；严格校验和双备份见[存档合同](tasks/enemy-save-contract.md)。旧行为 A/B 夹具明确使用旧敌人部署。

[enemy-mall.ts](../src/enemy-mall.ts)的 `installMallEncounter` 仅在新三版或四版商场部署候选内替换二层三人和移动一只既有箱子，复用 actor v1、expansion 3 / raid 5；#98合入后外层统一写v8，`gunsBackup`与敌人/Perk备份沿原规则保留。活动旧商场不调用该初始化器。岗位、东侧绕行、旧版恢复和原子写失败见[商场记录](tasks/enemy-mall.md)与[测试](../tests/enemy-mall.test.ts)，三尺寸场景随 `test:enemy` 运行。

方向性防护由 [enemy-defense.ts](../src/enemy-defense.ts) 根据实际入射方向处理，再由 `damageLayerEnemy` 结算真实生命差；不能用射手后来的位置。兵种压制、驻守、扑击上限和损失撤退见[组织合同](tasks/enemy-relations.md)。十八类角色已有身体/尸体/轮廓，由 `ActorView.tactics.archetype` 选择 [textures.ts](../src/coast-view/textures.ts)；前三类、市场头目、三种动物、四类盐蚀者、四人回收队与三类封锁队在本分支普通街区出击生成。[enemy-motion.ts](../src/coast-view/enemy-motion.ts) 从真实阶段投影身体姿态与音色，声音的阶段去重和可见性由 [sound.ts](../src/coast-view/sound.ts) 负责，不持有模拟时钟。来源、尺寸、确定性导出及动作覆盖见[美术记录](tasks/enemy-street-art.md)，旧 ID 的素材选择保持不变。

[enemy-posts.ts](../src/enemy-posts.ts) 拥有市场据点的固定岗位、短巡查与备用位置，target/path/timer/stance 保存在既有敌人字段；其近身护卫不跨层追击。布置、经济守恒和绕行证据见[据点记录](tasks/enemy-market.md)。

[enemy-fauna.ts](../src/enemy-fauna.ts) 在新街区一次初始化候选中，从四份动物携带预算分配三处地面食源；字段与UID仍走原严格格式。可见同伴接近、返巢、食品守恒与真实射程/墙挡及恢复见[动物样板](tasks/enemy-fauna.md)。

[enemy-recovery.ts](../src/enemy-recovery.ts) 在同一部署候选中分配四个岗位及一只既有运输箱；[recovery-objective.ts](../src/raid-runtime/recovery-objective.ts) 推进实际回收、装箱、分段搬运与撤回。命令只携带静态阶段，最后接收时间按同队通信范围保存；`syncRecoveryCargo` 在 Runtime 更新后读取当前实体移动唯一容器。角色与货物的严格引用、每阶段恢复和事务失败反例见[回收队样板](tasks/enemy-recovery.md)及[测试](../tests/enemy-recovery.test.ts)。

[enemy-blockade.ts](../src/enemy-blockade.ts) 拥有本局登记候选、等候区与公共通道；[blockade-checkpoint.ts](../src/raid-runtime/blockade-checkpoint.ts) 用真实观察与行动秒推进许可、处理退回/可靠交火来源。登记必须经 Runtime `layerMutation`，不能在视图直接发证。标记投影、军官缺失、空枪报告/换弹退回、真实键鼠/触屏与保存失败反例见[检查站记录](tasks/enemy-blockade.md)和[测试](../tests/enemy-blockade.test.ts)。

**验证入口。** [目录边界](../tests/enemy-catalog.test.ts)、[真实旧档/事务/追击回归](../tests/enemy-compatibility.test.ts)、[固定输入 Runtime 夹具](../tests/fixtures/enemy-benchmark.ts)及其[测量协议](tasks/enemy-foundation-benchmark.md)。A/B 必须使用相同主线机制和输入协议；Node 测量不替代 `test:play`、浏览器和真人验收。当前交付与未来合同边界见[实施摘要](tasks/enemy-foundation.md)。

## 存档

**职责与所有者。** `SaveSession` 协调唯一会话和完整候选；`RecoveryStore` 比对旧记录、验证并单次写入。场景通过捕获/恢复端口提供活动世界，UI 不自行组装另一套提交过程。

**首读路径：增加持久字段或修改恢复行为。**

1. [expansion-state.ts](../src/expansion-state.ts)：字段所属类型、`newExpansion` 与唯一的据点边界升级 `upgradeToRpg`（v1→v2→v3）、`rpgEnabled`、`validateExpansion` / `exactKeys`。纯派生显示值无需自动入档。
2. [session.ts](../src/session.ts)：`ensureRpg` / `enableRpg`、`enableExpansion`、`beginRun` → [building-world.ts](../src/building-world.ts) 的 `initializeBuildingRaid` / [mall-world.ts](../src/mall-world.ts) 的 `initializeMallRaid`；读取 `persist` 的完整写入链，而非只搜字段名。
3. 同文件继续按操作读：`prepareExpansionMutation` / `commitExpansionMutation`、`prepareSettlement` / `retrySettlement`、`backupRecord`、`importRecord`。
4. [profile-codec.ts](../src/profile-codec.ts)：各格式共用的严格 profile 与物品栏规则（`decodeStoredProfile`、`validInventory`）；[recovery-store.ts](../src/recovery-store.ts)：`SessionRecord`、`decodeSession`、`RecoveryStore.commit`；[save-backup.ts](../src/save-backup.ts)：`encodeRecoveryBackup` / `decodePortableBackup`。
5. [hideout-runtime/runtime.ts](../src/hideout-runtime/runtime.ts)：`previewImport` / `importBackup` 的确认与升级；[fresh-start.ts](../src/fresh-start.ts)：`freshStartRecord` / `startOver` 的完整新档路径。
6. 当前层与完整记录的共享映射：[raid-state-projection.ts](../src/raid-state-projection.ts) 的 `applyActiveRaidSnapshot` / `activeRaidCheckpoint`；这里不克隆、不提交。
7. 执行器端核对 [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts) 的 `snapshot` / `restore`、`snapshotExpansion` / `restoreExpansion`；旧检查点还读 [checkpoint.ts](../src/checkpoint.ts) 的 `RaidCheckpoint` / `initialCheckpoint` / `validateCheckpoint`。

**调用契约的维护位置。** 字段单位和合法范围归类型/校验器；`persist` 写入时的捕获与发布归会话入口；兼容策略归 [ARCHITECTURE](ARCHITECTURE.md#格式与恢复兼容)。卡片只维护路径，不再复制 schema。

**验证入口。**

- [expansion-recovery.test.ts](../tests/expansion-recovery.test.ts)：原子升级、严格导入拒绝、完整备份与待保存候选。
- [perk-save.test.ts](../tests/perk-save.test.ts)：扩展 v3/Perk 选择、进行中的旧行动保持扩展 v2 至结算、旧备份导入、降级保护与 `perksBackup`。
- [gunsmith-migrate.test.ts](../tests/gunsmith-migrate.test.ts)：v5 客户端真实写下的 v3–v5 记录和备份（冻结在 [fixtures/gunsmith-v5-saves.json](../tests/fixtures/gunsmith-v5-saves.json)）经真实 `decodeSession` 迁移到 v8、写回、重读和继续行动，`gunsBackup` 与拒读；[gunsmith-enemy-records.test.ts](../tests/gunsmith-enemy-records.test.ts)：v6/v7 迁移后敌人规则（`enemyBackup`）保持，v4/v5 到第一次敌人行动才开启，坏的 v8 记录拒读；旧客户端拒读 v8 用 `test:expansion` 的四个真实固定旧包验证。
- [gunsmith-carry.test.ts](../tests/gunsmith-carry.test.ts)、[gunsmith-value.test.ts](../tests/gunsmith-value.test.ts)：装卸、转移、丢下拾取、跨层、结算时搬的是同一把枪；按组成估值和出售。
- [gunsmith-conservation.test.ts](../tests/gunsmith-conservation.test.ts)、[gunsmith-conservation-2.test.ts](../tests/gunsmith-conservation-2.test.ts)（逻辑在 [fixtures/conservation.ts](../tests/fixtures/conservation.ts)）：固定种子随机走 200 × 30 步合法操作（院子、商店、出击、行动、跨层、结算、导出导入、写入失败后重试），每步解码存档，查 UID 唯一、每把枪连配件不变、两种弹药与现金守恒、负重一致；失败时打印种子和步骤，`GUNSMITH_SEEDS` 在第一个文件里单独重放。
- [systems-session.test.ts](../tests/systems-session.test.ts)、[recovery.test.ts](../tests/recovery.test.ts)：重试不重复奖励、未知字段、原字节保留、修订栅栏。
- [save-flow.test.ts](../tests/save-flow.test.ts)、[hideout-runtime.test.ts](../tests/hideout-runtime.test.ts)：结算保存失败、导入确认、升级和旧入口。
- [fresh-start.test.ts](../tests/fresh-start.test.ts)：重开和恢复备份；活动世界再看 [raid-runtime.test.ts](../tests/raid-runtime.test.ts) 的回滚/恢复断言。
- [raid-state-projection.test.ts](../tests/raid-state-projection.test.ts)：当前层/追击归属、非当前层保留、建筑及商场捕获恢复。
- [save-validation-audit.test.ts](../tests/save-validation-audit.test.ts)：原型键、数组伪装 ID 的拒绝与原字节保留，及正常基地/经典/分层记录对照。外部 ID 必须先用 `hasOwnStringKey` 检查字符串类型和自身键，不能只做真值查表或 `Object.hasOwn`。

**枪械实例（改枪 M1）。** 枪物品和地上的枪带 `gun`（`Item.gun`、`LootState.gun`），装备栏带 `weaponUid`、`gun`，枪的 UID、配件 UID 与物品 UID 同一空间。「是不是枪」只问 `D.isGun`（`WEAPONS` 里除匕首以外的一行，见[改枪契约](gunsmith/CONTRACTS.md#g17m4a1-与样板配件m2-0102)）；配件散件是 `attachment` 类物品（`D.isAttachment`，详情行 `D.attachmentFacts`），只有改装事务（[gunsmith/edit.ts](../src/gunsmith/edit.ts) 的 `planGunEdit`，入口是据点 Runtime 的 `openGunsmith`）把它装到枪上或拆下，UID 和救济标记不变。新枪一律由 `D.factoryGun` / `D.addItem` 生出出厂状态；搬动已有的枪用 `D.placeItem`、`D.placeGroundGun`，不要用 `addItem` 重建（会换 UID、丢配件）。占格读 `D.itemSize`（含配件延伸）。校验按 profile 版本分新旧两种格式（`validInventory` 的 `guns`、`validateCheckpoint`、`validateExpansion`），旧格式的读档经 `decodeOldStoredProfile` 和 [gunsmith/migrate.ts](../src/gunsmith/migrate.ts)；字段规则与迁移见[改枪契约](gunsmith/CONTRACTS.md#存档与迁移m0-06)。

**按需继续。** profile 字段进入 [domain.ts](../src/domain.ts) 的迁移与 [profile-codec.ts](../src/profile-codec.ts) 的校验；数据夹具进入 [tests/fixtures/layered.ts](../tests/fixtures/layered.ts)；真实文件导入和多窗口见 [save-browser-test.mjs](../scripts/save-browser-test.mjs)。

**结束定位的判据。** 新建、旧档升级、活动恢复、失败重试、完整导入/导出和重开都能说明字段来源；不能只补一个类型和默认值就结束。

## 派生读数

**首读路径。** [raid-runtime/contract.ts](../src/raid-runtime/contract.ts) 的 `CoastServices` / `HudView` → [raid-runtime/host.ts](../src/raid-runtime/host.ts) 接线 → [raid-runtime/runtime.ts](../src/raid-runtime/runtime.ts) 的 `carriedWeight` / `carryLimit` → [coast-view/inventory.ts](../src/coast-view/inventory.ts) 的 `render` / `refreshWeight`。

行动中的 `Runtime.layered` 随模拟推进，`SessionState.expansion` 是最近提交后的状态，不能拿它重新计算实时上限。优先复用帧或只读服务里的权威值；显示层只做舍入与排版。背包打开时世界仍推进，更新读数只改对应文本，不能重建网格打断拖放。回归入口：[carried-weight.test.ts](../tests/carried-weight.test.ts)，覆盖护符、弹药、临时力量过期及保持放置状态。

行动背包按需读 `CoastServices.inventoryView` 的 detached bag/safe 与装备字段，周期读数走不克隆世界的 `inventoryReadout`；不从会话拿活对象。包内写入由 `raid-runtime/host.ts` 的三个 carried 命令调用原 `SaveSession.mutate`，搜刮全部移动仍走 `transferLoot`。主武器槽（#26 F15）装备背包里的枪走 `equipItem`、来源里的枪走 `equipLoot`，两者共用 runtime 的 `equip` 与 `D.equipRun`。规则差异、引用恢复和正式工厂断言见 [raid-inventory-services.test.ts](../tests/raid-inventory-services.test.ts)；当前边界与验证见 [Q-E02 B](tasks/quality-entropy.md#q-e02-b-行动背包有限服务)。

**结束定位的判据。** 能指出数值由谁计算、使用哪个时钟、什么时候刷新；修改展示不会写存档，临时效果过期后玩法与显示保持一致。

## 维护本页

公开端口、提交边界或文件归属改变时，在同一个 PR 更新对应卡片；内部算法变化无需重抄实现。路径/符号改名同步修链接，当前行为与计划分开写。先查符号和调用点，再扩大阅读；不按固定行数拆源码，不生成手工全量符号表，也不为每目录增加重复 AGENTS。

CI 的 [source-health.test.mjs](../scripts/ci/source-health.test.mjs) 拦下三类退化：没有任何使用者的导出、新的运行时 import 环（#60 登记过的两个已消除，`KNOWN_CYCLES` 为空）、规则模块（domain/balance/world）引用彼此以外的模块或 DOM；`tsconfig.json` 另禁止未用的局部变量和参数。删掉旧代码时连同只为它存在的测试一起迁移，不要为通过检查而保留空导出。
