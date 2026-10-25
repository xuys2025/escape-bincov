# 改枪实现契约

本页记录改枪各任务必须共用的数据形状和规则，按任务分节。玩法依据是[总体计划](PLAN.md)、[枪械目录](WEAPONS.md)和[配件目录](ATTACHMENTS.md)；任务和日期见[任务与排期](TASKS.md)，进度只在 [#80](https://github.com/xuys2025/escape-bincov/issues/80) 更新。

## M0 评审决定（2026-10-24）

维护者 2026-10-24 评审 M0：全部按建议执行；包体上限放宽，只要能正常运行就行。下面各节的「待维护者定」都按此结论办，原文留作依据。

**M1 开工前**

1. 首版三项：完整原厂枪加可拆配件；六种虚构弹药组；拆装只在基地做。
2. 存档按「存档与迁移（M0-06）」一节的方案：
   - profile 2→3，会话记录和恢复备份统一升到 v6，原字节存进 `gunsBackup`，行动中读档时也存（#81 先合入用了 6、7，按「先合入者优先」改为 v8，见[记录版本 v8 与敌人规则](#记录版本-v8-与敌人规则与-81-合并)）；
   - 行动中的档在读档时就地迁移；
   - 装备的枪用 `gun-v6` 加序号作 UID；
   - 配件树嵌套存；
   - 拆掉设备时开关跟着关；
   - 带 `gun` 字段的 v1/v2 profile 一律拒绝；经典检查点要求地上物品和背包物品的 UID 不同。
3. 护栏：
   - 逐项护栏之外，腰射锥（spread × hip）和精瞄锥（spread × hip × precise）各自不低于原厂的 0.6；
   - 配件的代价不设上限，M4 实测再定；
   - 现在碰不到的五条护栏保留。
4. 包体：不设整包硬上限，以能正常运行为准，由 M5-02 的性能与资源验收把关。#81 EN-04 的 HTML ≤ 8 MiB、ZIP ≤ 5 MiB 不约束改枪；改枪图的 224 KiB 只作预算目标，构建只报告、不拦截。
5. 入口：院子工作台和物品详情都能打开改枪界面，不要求先建工作台。

**M2 之前**

6. 工作台：
   - 点配件直接进预览；没有的配件可以进预览和预设，但不能确认；
   - 卸出的子弹先放仓库，仓库满整次不提交；
   - 有未确认改动时换枪，弹窗确认；
   - 每种枪最多 10 套预设，只用空闲配件和这把枪上的配件，默认名可改；
   - 属性保持 7 项，声音暴露的半径、弹量和换弹时间写在详情里；
   - 1280×720 下属性对比挪到枪身下面。
7. 瞄具：
   - 总上限 ×2（横 163、竖 116 世界像素）；
   - 近距 O01–O05、O12 为 ×1，不加前移；中距 O06 ×1.25；中远 O07 ×1.5；远距 O08/O09 ×2；双档 O10/O11 近档 1.5、远档 2；
   - 触屏只加多出原厂的部分，随内圈举枪展开；画面高度不到 480 像素时竖向最多 ×1.5；
   - 精确步枪、栓动步枪不另开上限；
   - ×2 的镜头起步速度先试玩，觉得跳再加加速度上限。
8. 美术：
   - 工作台大图单独画，旧手枪、双管也在 M2 画；
   - 地上的枪和 HUD 武器卡按枪型出图；小格子放不下时用枪型图加「已改装」角标；
   - 持枪图不画后握把；激光、灯光束和展开的脚架不画贴图；
   - 第一波按建议的 40 件；
   - Sol 做完 #96 后先做改枪样板，再做 #47。
9. 配件细节：
   - 设备开关按件；多个设备的暴露相乘；
   - 腰射握把（F06）和激光只帮腰射，随举枪淡出（M2-03）；
   - B01/B02 作为前置件；各枪原生侧导轨 1 个；
   - 消焰器折算成枪声半径 ×0.9；
   - S05 不改格数；散件占格在 M2-02 定；
   - M870 的逐发补弹暂不做；
   - `bloom`、`kick` 连同上限一起缩放。

**另外**

10. 地图边瞄准偏转是现有问题，单独小修复：前移碰到地图边就停，补一条地图边浏览器检查，不等 M2。

## 目录与插槽（M0-01/02/03）

**状态：** 2026-10-24 在分支 `wip/gunsmith-catalog` 完成，基线 main `4141503`。未合入，未接入游戏。本节的决定和提案数值在 M0 评审（10-27）时由维护者确认。

### 模块

- [src/gunsmith/catalog.ts](../../src/gunsmith/catalog.ts)：类型和数据。20 把枪、100 件配件、插槽分类、修正字段。
- [src/gunsmith/compat.ts](../../src/gunsmith/compat.ts)：兼容判定。`checkInstall` 判一次安装，`validateBuild` 判一整棵配件树，`removalCascade` 列出随父件进待卸的件。
- 两个文件都是纯规则，已加入 `scripts/ci/source-health.test.mjs` 的 `PURE`。运行时只互相引用，对 `domain.ts` 只有 `import type`。以后由 domain 单向引用它们，不会成环。
- 不引用 `shooting.ts`。`GunHandling` 和 `Handling` 字段一一对应，测试里两种类型互相赋值，一边改了字段另一边就编译不过。
- M0 时只有测试读它们，`ITEMS`、`WEAPONS`、存档、Runtime、界面和生成物都没改。M0-04 在它们上面算有效属性；M1-05 起游戏经 `domain.ts` 读它们，见[有效属性](#有效属性m0-04)的「Runtime 怎么接（M1-05）」。
- 测试：[gunsmith-catalog.test.ts](../../tests/gunsmith-catalog.test.ts)、[gunsmith-compat.test.ts](../../tests/gunsmith-compat.test.ts)。两份测试经 [fixtures/gunsmith-docs.ts](../../tests/fixtures/gunsmith-docs.ts) 自己解析 WEAPONS.md、ATTACHMENTS.md 和 PLAN 第 4 节，再和模块比对，不借用模块的数据。

### 内部 ID

- 20 把枪用 WEAPONS.md 的 id。旧三枪 `pistol`、`shotgun`、`carbine` 不变；新枪是 `gb17`、`mb1911`、`pb226`、`mpb5`、`umpb45`、`pb90`、`vb9`、`mb870`、`mb1014`、`akb74`、`akb103`、`mb4a1`、`augb`、`svdb`、`mb14`、`mb700`、`rpkb`。
- 配件用 ATTACHMENTS.md 的编号 `O01`…`A08`。
- 枪类、弹药组、品牌、类别、插槽用英文内部 id。界面只显示中文名：`GUN_CLASS_NAMES`、`BRAND_NAMES`、`CATEGORY_NAMES`、`SLOT_NAMES`。
- 新弹药组 `ammo45`、`ammoPDW`、`ammoHeavy` 按 PLAN 第 4 节命名，M3-05 才成为物品。
- #39 的测试样本步枪 id 是 `m4a1`，不是物品，不进存档。正式枪是 `mb4a1`，M2-01 时换过去。`mb4a1` 的原厂数值和手感与样本完全相同（测试锁定），换枪不会改变已试玩认可的手感。

### 枪的定义

- `GunDef`：id、枪类、获取档次、原厂 `stats`、原厂 `handling`、占格、重量、买卖价、原生插槽、原生资格。
- `stats` 就是一份 `WeaponDef`：显示名在 `stats.name`，弹药组在 `stats.ammo`。`handling` 带开火方式（单发或自动）。
- 旧三枪逐项等于今天的 `WEAPONS`、`ITEMS`（尺寸、重量、价格）和手感表，测试直接对比。
- 新枪的类型、弹药组、原厂弹量、获取档次来自 WEAPONS.md，其余是提案。

### 插槽

一件配件坐在一个插槽里。插槽是枪原生的，或由已装的父件打开。

| 插槽 | 显示名 | 从哪来 | 放什么 |
| --- | --- | --- | --- |
| `micro` | 微型瞄具位 | G17 原生；A01、A02、A03 打开 | O01、O02 |
| `top` | 顶部导轨 | UMP45、P90、Vector、M1014、M4A1、AUG、SVD、M14、M700 原生；A04–A08 打开 | O03–O12 |
| `under` | 下导轨 | UMP45、Vector、AUG 原生；护木打开 | F01–F07 |
| `side` | 侧导轨 | UMP45、P90、Vector、AUG 原生；护木打开 | T01–T03、T05–T07、T09、T10 |
| `pistolSide` | 手枪侧挂位 | 只有 G17、M1911、P226 原生 | T04、T08 |
| `bipod` | 支撑脚架位 | 只有 SVD、M14、M700、RPK 原生 | F08 |
| `muzzle` `barrel` `handguard` `stock` `grip` `mag` `base` | 枪口位、枪管位、护木位、枪托位、握把位、供弹位、基座位 | 配件表列了这把枪就原生 | 对应类别 |

- 原生插槽各装 1 件。护木打开的数量照抄配件表：H01、H05、H08、H09 开 1 下导轨 1 侧导轨；H02、H04、H07、H10 开 1 下导轨 2 侧导轨；H06 只开 1 侧导轨；H03 不开。
- 原生侧导轨各 1 个（提案）。UMP45、P90、Vector、AUG 想同时要激光和灯光，就用组合器；装长护木的枪可以分开装两件。
- 远距瞄具资格：AK-74、AK-103、M4A1、AUG、SVD、M14、M700、RPK 原生有；卡宾枪由 A07 授予。O08–O11 需要它。
- 微型基座只开微型瞄具位，不开手枪侧挂位。
- 现有数据里配件树最深 2 层（枪 → 基座或护木 → 瞄具、前握把、战术设备），最多 11 件（AK-74、AK-103、RPK 装满）。12 件、3 层的上限现在碰不到，留给以后。

### 前置件

- M03 装在 G17、P226 上要先装 B01；M04 装在 M1911 上要先装 B02。数据写成 `needs: [{ part: 'B01', on: ['gb17', 'pb226'] }]`。
- 配件表说 B01、B02「提供消音接口」。这里不另设消音插槽，而是写成前置件：M03、M04 仍坐在枪口位，G17 上的 M01、M02 不受影响；拆 B01 时 M03 照样进待卸。
- MP5、Vector 装 M03，UMP45 装 M04，都不需要枪管。
- 枪口位只有一个，同一时间只装一个枪口件，例如 M02 和 M03 不能同装。

### 配额

- 每把枪最多一个激光效果、一个灯光效果。组合器两样都占。
- 标签在 `AttachmentDef.quota`：激光 T01–T04，灯光 T05–T07，组合器 T08–T10。
- 配额按整把枪算，不分导轨。导轨上的件数另按插槽算：两个侧导轨都装满时，第三件先报「侧导轨已被占用」。

### 判定顺序

`checkInstall(build, id, at?)` 先用 `validateBuild` 确认现有配置合法，再按顺序判：

1. 枪型：配件表列了这把枪；远距瞄具只上能有资格的枪。
2. 插槽：原生或由已装父件打开，而且还有空位。不给 `at` 时取第一个有空的位置，枪自己的插槽优先。
3. 前置：前置件已装，远距资格已有。
4. 冲突：每把枪最多一个激光效果、一个灯光效果，组合器两样都占。物理侧位按插槽数量另算。
5. 上限：最多 12 件，最多 3 层。

- 配置是枪 id 加一张平铺的件表，每件写明父件 uid（`null` 是枪本身）和插槽。M0-05 的枪械实例存成嵌套的树，判定时用 `buildOf` 转成这个形状（见[枪械实例](#枪械实例m0-05)）。
- 成功时返回放置位置 `at`。按 `at` 加进去，`validateBuild` 一定通过；测试用固定种子随机走了几千步核对两者一致。
- `validateBuild` 与顺序无关，可以直接校验读档得到的树：未知 id、重复或空 uid、父件不存在、成环、超层、超件数都拒绝，原型键（`__proto__`、`toString`）当未知处理。

### 拒绝原因

| code | 玩家看到 | 什么时候 |
| --- | --- | --- |
| `gun` | 不适配这把枪 | 配件表没列这把枪 |
| `scope` | 这把枪不能装远距瞄具 | 远距瞄具装到不可能有资格的枪上 |
| `slot` | 这把枪没有{插槽} | 装什么都不会有这个插槽，例如「这把枪没有支撑脚架位」 |
| `opener` | 需要{配件} | 装上某个基座或护木就有，例如「需要卡宾顶部基座」「需要 AR 短导轨护木或 AR 长导轨护木」 |
| `blocked` | 与当前{类别}不兼容 | 能开这个插槽的件和已装的件抢同一个位置，例如 MP5 装了 H06 再装前握把：「与当前护木不兼容」 |
| `full` | {插槽}已被占用 | 插槽满了，例如「顶部导轨已被占用」 |
| `needs` | 需要{配件} | 前置件没装，例如「需要九系精瞄枪管组」 |
| `laser`、`light` | 一把枪只能装一个激光；一把枪只能装一个灯光 | 配额已用 |
| `place` | 不能装在这个位置 | 指定的位置不是这种插槽，或没有这个父件 |
| `count` | 最多装 12 个配件 | 超过件数 |
| `depth` | 配件最多装三层 | 超过层数 |
| `structure` | 配件结构无效 | 存档里的树坏了 |
| `unknown` | 无法识别这把枪；无法识别这个配件 | 未知 id |

- 玩家只看 `reason`，`code` 给调用方和测试用。原因里只出现配件名和插槽名，不出现内部 id。
- 后四行只在读档或数据坏掉时出现，正常操作碰不到。

### 拆卸

`removalCascade(build, uid)` 返回拆下 `uid` 时一起进待卸的件：它的子件，加上因此失去前置件或资格的件（G17 拆 B01 带走 M03），反复算到不再变化。剩下的配置一定合法。这里只列清单，放不放得下由 M2-04 的改装事务判断。

### 修正字段

`AttachmentDef.mods` 是装上后对枪本身的修正，缺省就是不变。

| 字段 | 含义 |
| --- | --- |
| `hip` `precise` `raise` `sway` `bloom` `kick` `settle` `recover` | 乘在原厂手感上。越小越好，只有 `recover` 越大越好 |
| `spread` `range` `reload` | 乘在原厂 `WeaponDef` 上。`range` 越大越好，其余越小越好 |
| `magazine` | 供弹模块装上后的弹量，取代原厂弹量 |
| `weight` | 装上后给枪加的 kg；比原厂件轻时为负 |
| `noise` | 乘在枪声吸引半径上（现在所有枪共用 `SURVIVAL.gunNoiseRange`） |
| `grow` | 装上后成枪多占的格子 |
| `laser` | 激光开着时，`range` 像素内腰射锥乘 `hip` |
| `light` | 灯开着时，`radius` 像素、`arc` 弧度内提示可交互物 |
| `spot` | 设备开着时，敌人发现射手的距离倍率，都大于 1 |
| `view` | 精瞄镜头前探的倍率，每个档位一个数 |
| `braced` | 只在站定时生效的系数（支撑脚架），一走动就没有 |

- `bloom` 同时缩放每发增量和上限，`kick` 同时缩放每发偏移和上限，改的是整把枪的后坐。#92 的控枪 Perk 只缩放每发增量，两者不重复。
- 没有伤害、射速字段：普通配件不加伤害和射速。
- RPG 倍率和 #92 的 Perk 不在这里，也不在有效属性里。Runtime 照旧各乘一次，见下面“有效属性”。
- 单件护栏（PLAN 第 6 节）：散布、后坐类系数不低于 0.6，`recover` 不超过 1.4；`raise`、`reload` 不低于 0.65；`range` 不超过 1.25；`noise` 不低于 0.4；激光的 `hip` 不低于 0.6。多件叠加后的夹紧见“有效属性”。
- 每件的增减方向跟配件表的收益、代价一致。测试按关键词读这两列（举枪、换弹、枪声、有效距离、重量、恢复、腰射等）逐件核对，也核对「比微型点瞄重」「价格高于短垂直型」这类行与行的比较。
- 配件有两个重量：`weight` 是散件重量，`mods.weight` 是装上后的增减。替换原厂件的类别（枪管、护木、枪托、后握把、供弹）可以为负。
- `view`、`light.arc`、`spot`、`braced` 是任务书没列、但配件表的收益和代价需要的字段（观察距离、灯的宽窄、开设备的暴露、脚架只在站定时有效）。接入时由 M0-07、M2-03 定具体用法。
- 枪口消焰器（M01、M05）「减少枪口暴露」折算成枪声半径乘 0.9，因为游戏里暴露只有枪声这一种。

### 哪些是提案

文档定下的：id、名称、品牌、类别、枪类、弹药组、原厂弹量、获取档次、适配枪、前置件、护木开的导轨数量、远距资格、手枪侧挂位和支撑脚架位。旧三枪的全部数值来自现有代码，`mb4a1` 的数值来自 #39 样本。

其余都是提案，M4 实测再调：

- 17 把新枪的伤害、射程、射速、换弹、弹丸、散布、暴击、手感、开火方式、占格、重量和价格。沿用 #39 的“稳定”思路：站定瞄好才准，配件有提升空间。冲锋枪、AK、M4A1、AUG、RPK 是自动，其余单发。
- 100 件配件的全部系数、弹量、重量、价格（卖价是买价的 45%）和设备数值。
- 原生插槽各 1 个，原生侧导轨也是 1 个。
- 消音器加 1 格宽，AK 重弹鼓组加 1 格高。最大的合法成枪是 RPK 加消音器加鼓组，6×2，放得进 6×5 背包。

### 待维护者定

2026-10-24 已评审，结论见本页开头「M0 评审决定」。

- `bloom`、`kick` 系数连上限一起缩放（见“修正字段”），还是只缩放每发增量。
- B01、B02 写成前置件而不是消音插槽。
- 原生侧导轨数量 1，以及上面新增的四个字段。
- S05「库存轮廓紧凑」：首版没有折叠状态，提案不改格数（与 S03 一样）。要兑现的话，可以让 MP5 装 S05 后少占 1 格宽。
- 配件当散件时的占格还没定，M2-02 把样板配件做成物品时再定。
- M870「补弹可中断」的逐发装填没有建模，现在只是一次较长的换弹。
- 字体：新名称和原因里有 25 个字不在当前字体子集（九偿块垂型座托折挂援撑术构棱滑激焰紧缓脚腰轨锋镜鼓）。重做子集之前 `pnpm build` 和 `pnpm package` 会报错，集成时按 M2-12 的流程重做。

## 有效属性（M0-04）

**状态：** 2026-10-24 在分支 `wip/gunsmith-stats` 完成，基线 `feat/gunsmith` `c343692`。护栏数值是 PLAN 第 6 节的初值，M0 评审确认，M4 按实测再调。M1-05 在分支 `wip/gunsmith-m1runtime` 按评审决定 3 加上[锥级护栏](#锥级护栏)，并让游戏读它（见 [Runtime 怎么接](#runtime-怎么接m1-05)）。

### 模块

- [src/gunsmith/stats.ts](../../src/gunsmith/stats.ts)：纯规则，已加入 `PURE`。运行时只引用 catalog 和 compat，对 `domain.ts` 只有 `import type`。不读角色、行动和存档。
- `effectiveStats(build, on)`：一种枪加一套配置在战斗里的数值。`on` 是开着的设备的 uid。
- `effectiveWeapon(build)`、`effectiveHandling(build)`：替换 `WEAPONS[id]` 和 `handlingOf(id)` 的入口。M1-05 里 domain 的 `equippedWeapon` 用 `effectiveWeapon`；Runtime 从 `effectiveStats` 一次取 `weapon` 和 `handling` 并缓存。
- `combineFactors(list)` 是第 3、4 步，`GUARDRAILS` 是逐项护栏表，`CONE_FLOOR` 是锥级护栏。三者都导出，以后工作台界面比较数值可以直接用。
- 测试：[gunsmith-stats.test.ts](../../tests/gunsmith-stats.test.ts)。覆盖 20 把枪的原厂值、每条护栏（含锥级护栏）、安装顺序、设备开关、弹量替换、枪声下限、角色状态无关，以及固定种子经 compat 生成的 2560 个合法配置。

### 输出

| 字段 | 内容 |
| --- | --- |
| `weapon` | 完整的 `WeaponDef`。散布、射程、换弹时间和弹量可能变，其余照原厂 |
| `handling` | 完整的手感。除开火方式外都可能变 |
| `braced` | 装了脚架、站定时用的手感；没有脚架是 `null` |
| `noise` | 枪声吸引半径的倍率。现在的半径是所有枪共用的 `SURVIVAL.gunNoiseRange`（510） |
| `view` | 每个瞄具档位的精瞄前探倍率。没有瞄具，或瞄具不改前探，是 `[1]`。上限由 M0-07 定 |
| `laser` | 激光开着时：`range` 像素内腰射改用这里的 `hip`，已含护栏。关着是 `null` |
| `light` | 灯开着时：提示可交互物的半径和角度。关着是 `null` |
| `spot` | 敌人发现射手的距离倍率。开着的设备相乘，都关着是 1 |

### 顺序

1. 原厂值：目录里这种枪的 `WeaponDef` 和手感。
2. 互斥替换：一个位置只装一件，由 `validateBuild` 保证。供弹模块的弹量取代原厂弹量，瞄具的档位取代原厂前探。
3. 同维度汇总：同一维度的系数相乘。
4. 护栏：每个维度乘出的结果夹紧一次；再把腰射锥、精瞄锥托到原厂的 0.6（[锥级护栏](#锥级护栏)）；最后乘到原厂值上。
5. 输出。

配置不合法时直接报错，不出数值。匕首和 #39 的样本 `m4a1` 不在目录里，也报错；M1-05 让它们照旧读 `WEAPONS` 和 `handlingOf`。

### 汇总规则

- 相乘。配件的系数都相对原厂件，所以替换件和加装件一样算。
- 从小到大排好再乘。浮点乘法的结果和先后有关，排好以后安装顺序一点都不影响结果，测试逐位比较。
- `bloom` 同时缩放每发增量和上限，`kick` 同时缩放每发偏移和上限，同“修正字段”。
- 弹量是取代，不相乘。一把枪只有一个供弹位。
- 设备只在开着时有效：激光、灯光和暴露倍率。设备本身带来的代价一直有效，例如 T03、T10 让举枪变慢，关着也一样。
- 一个设备一个开关。组合器开着时激光和灯都有效。`on` 里不是这把枪已装设备的 uid 不起作用。
- 几个设备都开着时暴露倍率相乘，例如 T03 和 T05 都开是 1.2 × 1.2 = 1.44。
- 脚架的系数只在站定时有效。站定时它们和其他配件的系数一起相乘、一起过护栏，结果是 `braced`。

### 护栏

| 维度 | 护栏 | 意思 |
| --- | --- | --- |
| `spread` `hip` `precise` `sway` | 不低于 0.6 | 散布改善不超过 40% |
| `bloom` `kick` `settle` | 不低于 0.6 | 后坐改善不超过 40% |
| `recover` | 不高于 1.4 | 恢复加快不超过 40% |
| `raise` `reload` | 不低于 0.65 | 举枪、换弹时间不短于原厂的 65% |
| `range` | 不高于 1.25 | 射程增加不超过 25% |
| `noise` | 不低于 0.4 | 枪声范围不低于原厂的 40% |

- 按维度夹紧。夹紧后正好是原厂值乘界限，测试逐位核对。
- 只限制收益，不限制代价。
- 激光开着时，它的 `hip` 和配件的 `hip` 过同一条护栏。例如 M4A1 的腰射前握把（0.8）加近距激光器（0.7）是 0.56，有效距离内按 0.6 算。
- 站定时脚架的系数也一起过护栏。例如 SVD 装稳定远距镜和脚架，精瞄 0.65 × 0.75 按 0.6 算；再装精确枪制退器，恢复 1.3 × 1.35 按 1.4 算。
- `recover` 的 1.4 和 `reload` 的 0.65 沿用单件护栏（见“修正字段”），PLAN 第 6 节没有单独写这两项。
- 现有配件能碰到的护栏：后坐（M4A1 装 H02、F07、M06、S02，`bloom` 0.41、`kick` 0.46）、精瞄（M4A1 装 O09、B08，0.55）、举枪（M4A1 装 H01、F04、O03、S01、P01，0.59）、晃动（AK-74 装 A08、O05、H04、F03、S03、B07，0.53）、恢复（SVD 装 M09、O04，1.43），以及上面的脚架和激光；两个锥的例子见下节。
- 现在碰不到的：射程（只有枪管改射程，最多 1.15）、枪声（只有枪口改枪声，最低 0.5）、换弹（最低 0.75）、`spread`（最低是 M1014 的 0.64）、`settle`（最低 0.85）。改这些维度的配件只在一两个位置上，一个位置只装一件。测试用人造系数核对这几条。

### 锥级护栏

M0 评审决定 3：逐项护栏之外，腰射锥和精瞄锥各自不低于原厂的 0.6（`CONE_FLOOR`）。M1-05 实现。

- 腰射锥是 `spread × hip`，精瞄锥是 `spread × hip × precise`，就是 `coneOf` 在站稳、没有累积散布时举枪前后的两端。晃动和累积散布只按各自维度夹紧。
- 先逐项夹紧，再看两个锥。哪个锥低于 0.6，就由它最后乘上的那一项让回，正好让到 0.6：
  - `spread` 不动。它同时乘在两个锥上，逐项护栏已经管住它。
  - 腰射锥不够时抬高 `hip`。
  - 精瞄锥还不够时抬高 `precise`。
- 所以腰射前握把在腰射锥里的收益保住，瞄具和精确枪管的收益只剩精瞄锥到 0.6 为止的部分。
- 只往上抬，抬后不超过 1：`spread`、`hip`、`precise` 各自的下限都不低于 0.6（测试核对），收益不会变成代价。只读合并后的系数，安装顺序照样一位都不影响。
- 除法有舍入。按 Runtime 的乘法顺序（先 `spread × hip`，再乘 `precise`）算，乘积差一个最小单位到 0.6 时再抬一个最小单位，锥不会因为舍入低于 0.6。0.6 时用不到这一步；M4 若把下限调到 0.5 或更低才会用到。
- 激光开着时，有效距离内的腰射锥 `spread × 激光 hip` 也守 0.6。精瞄锥不算激光：按评审决定 9，激光和腰射握把随举枪淡出（M2-03）。M2-03 做淡出时，精瞄锥里的 `hip` 改成不含它们的那部分。
- 现有配件碰得到的例子：

| 配置 | 原来 | 现在 |
| --- | --- | --- |
| M4A1 装 H01、腰射前握把（F06）、稳定远距镜（O09）、精确枪管（B08） | 精瞄锥 0.8 × 0.6 = 0.48 | `precise` 抬到 0.6 / 0.8 = 0.75，精瞄锥 0.6，腰射锥仍是 0.8 |
| RPK 装 H10、F06、脚架、A08、O09 | 精瞄锥 0.8 × 0.65 = 0.52；站定时加脚架 0.8 × 0.6 = 0.48 | 两种都是 `precise` 抬到 0.75、精瞄锥 0.6：站定时脚架不再多收紧 |
| 双管装双管收束组（M11）、A05、中远距棱镜（O07） | 精瞄锥 0.72 × 0.75 = 0.54 | `precise` 抬到 0.6 / 0.72，`spread` 仍是 0.72 |
| M1014 装收束器（M10）、收束枪管（B06）、H09、F06 | 腰射锥 0.6396 × 0.8 = 0.51 | `hip` 抬到 0.6 / 0.6396；两个锥都是 0.6，再装瞄具也不再变小 |
| M870 装收束器（0.78）、H08、近距激光器（T01）开着 | 有效距离内腰射锥 0.78 × 0.7 = 0.55 | 激光 `hip` 抬到 0.6 / 0.78；再装 F06 也一样 |

- 测试：上表逐位核对；固定种子 2 万组随机系数逐位检查两个锥不低于 0.6、只动 `hip` 和 `precise`、动了就落在 0.6 上、换顺序结果不变；2560 个随机合法配置的两个锥（含站定和激光）都不低于 0.6。

### 留给 Runtime 的

- 角色修正不在这里。RPG 的身体倍率（技巧、精神、疼痛）照旧作为 `coneOf`、`driftOf` 的 `body`，乘整个散布锥和偏移。
- #92 的控枪 Perk 照旧作为 `recoil(aim, h, scale)` 的 `scale`，只缩放每发增量。
- #92 的换弹 Perk 照旧乘在 `reloadTime` 上。
- 它们各乘一次，乘在有效属性上。配件护栏不管它们，它们有各自的界限。例如 M4A1 装快换匣（0.8），再有两个换弹 Perk（0.68），换弹时间是原厂的 0.544。
- 所以 PLAN 第 6 节“护栏之后一次角色状态修正”的顺序不变，只是这一步留在 Runtime 原来的位置。TASKS 里 M0-04 一行把这一步写在 M0-04 里，以本节为准。
- 测试检查本模块只引用目录、兼容判定和一个类型，并照 Runtime 的算法核对配件和 Perk 各乘一次。

### 不在这里

- 重量、占格和售价属于枪械实例（M0-05）。
- 举枪进度、晃动、累积后坐这些运行状态仍由 `shooting.ts` 和 Runtime 管。

### Runtime 怎么接（M1-05）

**状态：** 2026-10-24 在分支 `wip/gunsmith-m1runtime` 完成，基线 `feat/gunsmith` `e19cf00`；同日在 `feat/gunsmith` 与 M1-01～04、06（`wip/gunsmith-m1core`）合并，读装备栏里真实的枪械实例。旧三枪的手感、弹量、换弹和重量一位不变。

- 入口是 [domain.ts](../../src/domain.ts) 的 `equippedGun(slot)`：装备栏（profile 的 `equipment` 或行动的 `loadout`）里那把枪的实例，即 UID、枪型、枪身救济、配件树和开关；没枪或匕首是 `null`。两半合并前各有一个同名函数（M1-05 的只返回原厂配置，M1-01 的返回实例），现在只有这一个。读装备枪的地方都从这里走，数值经 `buildOf` 取实例的配件：
  - `equippedWeapon(slot)`：经 `effectiveWeapon` 的有效 `WeaponDef`；没枪时是匕首那一行。
  - `equippedWeight(slot)`：枪加配件的重量（`gunWeight`）；没枪是 0。
  - 结算估值（`settleRun` 的装备枪价值）也读它（M1-06）。
  - 装备栏写了枪却没有 `weaponUid` 或 `gun` 是程序错误（存档校验不会放进来），`equippedGun` 直接抛错，不把它当原厂枪去算数值、重量或价钱。
- Runtime：
  - `currentWeapon`、`grip` 读装备枪的有效属性。按实例缓存：以 `equippedGun` 返回的实例的 JSON 为键（UID、配置、开关），实例变了才重算；缓存的对象冻结，所有读者共用。匕首照旧读 `WEAPONS.knife` 和 `handlingOf`；#39 的样本 `m4a1` 照旧读 `SAMPLE_GUNS` 和 `handlingOf`，M2-01 退役。
  - `reloadTime` 是有效换弹时间，再乘 #92 的换弹 Perk 一次。`shoot` 用有效的 `WeaponDef` 和手感，RPG 身体倍率和控枪 Perk 仍在原处各乘一次。
  - `startReload`、`loadMagazine` 按有效弹量。domain 的 `reloadMagazine` 接收装备栏，部署时的装填（`initialCheckpoint`、`SaveSession.beginRun`）也传装备栏。
  - `carriedWeight` 里枪的重量来自 `gunWeight`。
  - 画面的 `hud.weapon`（含 `magSize`）、准星锥和 HUD 武器卡读的就是 `currentWeapon` 和 `grip`，不另查表。
- 弹匣：
  - `cleanMagazine(slot, …)` 接收装备栏，按那把枪实例的有效弹量夹紧，普通弹里的救济弹不超过装弹数。调用方是 `migrateSave`（v3 按保留下来的实例；v0–v2 旧档只有原厂枪、还没有 UID，按原厂弹量，即旧规则）、`beginRun`、`settleRun`。
  - 卸枪退弹（`equip`、`unequip`、`equipRun` 里的 `unloadMagazine`）不夹紧，按装备栏存的弹数原样退回，普通弹、救济弹分开：以后配置改了、弹量变小，退弹也不能吞子弹。
  - 存档校验的弹匣上限：profile-codec 的 `validEquipment` 和 `validateExpansion` 在 `validateGun` 通过后用 `equippedWeapon(slot).magazine`；没枪时只能是 0。旧格式（profile v1/v2）仍按枪型的原厂弹量。经典检查点的携带物经 `decodeStoredProfile` 走同一条。
- 试枪场 `arm()` 和测试驱动的 `weapon()`：换成另一种枪时给一把新的原厂实例（新的物品 UID），再按有效弹量装满；同一把枪不换实例。`magazine()` 按装备实例的有效弹量校验。
- 院子和旧页签：出发负重（`RealHideoutRuntime.departure`、旧页签的 `preparedWeight`）里枪的重量用 `equippedWeight`；院子装备卡、旧页签装备区和行动背包面板显示的弹量用 `equippedWeapon`。只读名称、弹药种类或暴击的地方（出发检查、Perk 文案、救济规则等）照旧查 `WEAPONS`，配件不改这些。
- 测试：[gunsmith-readers.test.ts](../../tests/gunsmith-readers.test.ts) 对旧三枪逐项比对新旧读法：`equippedWeapon`、`equippedWeight` 等于 `WEAPONS`、`ITEMS`；`reloadMagazine` 在 1200 组弹匣与背包组合下，结果和背包都与旧实现相同；Runtime 的 `currentWeapon`、`grip`、`reloadTime`（含换弹 Perk）、`carriedWeight`、HUD、换弹，试枪场装弹，以及院子的出发负重。源码检查确认 Runtime、画面、测试驱动和试枪场不再按 id 查 `WEAPONS` 或枪的 `ITEMS` 重量。射击实验台的数字不变；旧读法和新读法各回放 40 段脚本（243 发、6328 帧），射击角度、准星、弹匣和负重逐位相同。合并后加测：读者读的是实例自己的配件（以装了 G01 加长匣的 G17 为例，弹量 17→24、重量、换弹装填、出击和结算的弹匣都随实例），装备栏缺实例时抛错，卸枪按存的弹数原样退回，profile 的弹匣上限按实例。合并前后 `scripts/shooting-bench.ts` 的报告逐字节相同。
- 还没接的：
  - 站定和激光距离由 Runtime 判断：站定时用 `braced`，激光开着且目标在 `range` 内时腰射用 `laser.hip`。具体规则 M2-03 定；开关已在缓存键里，M2-03 把开着的设备传给 `effectiveStats`。
  - 枪声半径是 `SURVIVAL.gunNoiseRange × noise`，M2-11 接入敌人听觉。
  - 「是不是枪」有两种判断：读装备枪的地方（`equippedGun`、`cleanMagazine`、`reloadMagazine`、结算的弹种）看目录（`isGunId`）；装卸搬运（`heldItem`、`unloadMagazine`）、救济规则（`ownedGuns`）和存档校验的装备栏看 `WEAPONS`（旧三枪）。现在两者对能存进档的枪完全一致；M2-01 把 G17、M4A1 做成物品时要统一。

### 待维护者定

2026-10-24 已评审，结论见本页开头「M0 评审决定」。

- 护栏按维度，还是按最终的散布锥。精瞄锥是 `spread × hip × precise`，按维度夹紧时几项可以叠起来。例如 M4A1 装腰射前握把、稳定远距镜和精确枪管，精瞄锥是原厂的 0.8 × 0.6 = 0.48，改善超过 40%。要严格守住 40%，可以按锥依次夹紧：先 `spread`，再 `spread × hip`，再乘 `precise`。
- 代价不设上限。最慢的配置是 M4A1 装 O09、M07、B08、H02、S02、F07、T10，举枪时间是原厂的 2.36 倍；M870 装 G06、H08，换弹是 1.40 倍。
- 设备开关按设备（现在的做法），还是按效果（激光、灯光各一个开关）。按设备时组合器只能两样一起开。
- 几个设备的暴露倍率相乘（现在的做法），还是取最大。
- `hip` 乘在整个锥上，所以腰射前握把和激光也会收紧精瞄锥。如果它们只该改腰射，M2-03 可以让效果随举枪进度减弱。
- 现在碰不到的五条护栏要不要留着。

## 枪械实例（M0-05）

**状态：** 2026-10-24 在分支 `wip/gunsmith-instance` 完成，基线 `feat/gunsmith` `c343692`。M1-01 起接入存档、校验、装卸、转移和估值（分支 `wip/gunsmith-m1core`）；各存档位置怎么放、旧档怎么迁移见[存档与迁移](#存档与迁移m0-06)。

### 模块

- [src/gunsmith/instance.ts](../../src/gunsmith/instance.ts)：纯规则，已加入 `PURE`，运行时只引用 catalog.ts 和 compat.ts。测试：[gunsmith-instance.test.ts](../../tests/gunsmith-instance.test.ts)。
- 战斗数值（有效手感、射程、弹量等）是 M0-04 的，这里不算。

### 形状

| 字段 | 含义 |
| --- | --- |
| `uid` | 枪的 UID，就是它作为物品时的 UID |
| `id` | 枪型，`GUNS` 的 id |
| `relief` | 枪身是不是救济来的 |
| `parts` | 装在枪上的配件树，每个节点是 `{ uid, id, slot, relief, children }` |
| `devices` | 设备开关 `{ laser, light }` |

- 树按嵌套存（`children`），不存父件指针。一件配件只有一个父件，嵌套写法天然保证；JSON 写不出环，也不会有指向不存在父件的件；拆一件时它的子件跟着走。compat.ts 用的平铺配置由 `buildOf` 转出（深度优先，父件在前），判定结果和平铺写法一样。
- 配件的 UID 就是它当散件时的物品 UID，一直不变（PLAN 第 8 节）：装上进树，拆下回库存还是这个 UID。所以枪和配件的 UID 都用物品 UID 的格式（profile-codec 的 `identity`，测试核对两者一致），并且全档唯一。
- `relief` 逐件记：救济枪上后装的正常配件可以拆下来卖，救济配件装在哪里都不能卖。枪身的救济标记就是承载它的物品的 `relief`。
- 设备开关按枪存（PLAN 第 7 节「设备有开关并保存状态」）。枪上装着有这种效果的件时，开关才能开着，组合器两种都算；拆掉设备时一起关掉开关，由 M2-04 的改装事务负责。
- 弹匣不进实例。卸枪照旧把子弹退回库存（普通弹、救济弹分开），所以库存和地上的枪总是空的；弹匣数仍是装备栏的 `ammo`、`ammoRelief`。

### 校验

`validateGun(id, uid, state)` 校验存档里的一把枪，`id`、`uid` 来自承载它的物品、地上物品或装备栏，`state` 是它存的枪械数据。只拒绝，不修复：

1. 枪型未知，包括原型键和数组 → `unknown`。
2. state、节点、设备开关多键、少键或类型不对，同一个节点对象出现两次（成环或共用）→ `structure`。
3. 枪或配件的 UID 不是物品 UID 格式，或在同一把枪里出现两次（包括和枪本身相同）→ `uid`。
4. 超过 12 件或 3 层 → `count`、`depth`。遍历到上限就停，再大的数据、成环的数据最多走 13 个节点。
5. 转成平铺配置交给 `validateBuild`：未知配件、插槽、前置件、配额等，code 和中文原因都与 compat.ts 相同。
6. 设备开着却没有对应的件 → `devices`。

- `uid`、`devices` 是新增的 code，原因都写「配件结构无效」，只有存档坏了才会出现。
- 全档 UID 唯一由调用方负责：同一个 UID 可能还在仓库物品、另一把枪的配件或地上物品里，一把枪自己看不到。`gunUids` 列出一把枪的全部 UID（枪本身加每件配件），调用方放进全档集合；`repeatedUids` 对全档全部 UID 找出重复的。读档怎么接见下一节的 M1-01 清单。

### 库存用到的物理属性

| 函数 | 结果 |
| --- | --- |
| `gunSize(gun, rotated)` | 枪型的格子加每件配件的 `grow`；旋转时宽高互换，和现有物品一样 |
| `gunWeight(gun)` | 枪本身的重量加每件装上后的 `mods.weight`，每件只算一次，比原厂件轻的件是负数；四舍五入到克 |
| `gunSale(gun)` | 不是救济的组成的售价之和，枪身按枪的卖价、配件按散件卖价；有救济组成时 `restricted` 为真，出售要整件拒绝并说明原因，不自动拆、不销毁 |

- 这三个函数只读校验通过的枪。
- 最大的合法成枪：测试把能改变占格的件（带 `grow` 的，加上它们的前置件、能开出它们插槽的件）在 20 把枪上的所有组合都走了一遍，最大是 RPK 加步枪紧凑消音器加重弹鼓组，6×2；平放进得了 6×5 背包，竖放 2×6 进不了。没有任何组合宽过 6 或高过 5。
- 旧三枪的出厂实例和现在的物品一样大、一样重、一样价钱，测试直接对比 `ITEMS` 和 `itemSize`。

### 没做的

- 安装、拆卸、换件（M2-04 改装事务）和散件配件的占格（M2-02）。
- 战斗数值（M0-04）。

## 存档与迁移（M0-06）

**状态：** 2026-10-24 在分支 `wip/gunsmith-instance` 完成设计和纯函数；同日 M1-01、M1-02 在分支 `wip/gunsmith-m1core`（基线 `feat/gunsmith` `e19cf00`）按本节末尾的清单接入，随后在 `feat/gunsmith` 合并 main `67a7468`（#81 敌人系统）：游戏只写 profile v3、记录和完整备份 v8，读到 v2–v7 记录和 v1/v2 profile 时先按旧规则校验再迁移。记录原定 v6，#81 先合入用了 6、7，所以改为 v8，见[记录版本 v8 与敌人规则](#记录版本-v8-与敌人规则与-81-合并)。与清单不同或清单没写到的地方见本节末尾「M1 接入的实际做法」。

### 模块

- [src/gunsmith/migrate.ts](../../src/gunsmith/migrate.ts)：`migrateProfile`、`migrateRecord`，纯函数，已加入 `PURE`，对存档模块只有 `import type`。测试：[gunsmith-migrate.test.ts](../../tests/gunsmith-migrate.test.ts)，样本都由真实的存档流程生成。
- M0 时迁移前后的对比、旧客户端拒读都用当时的解码器验证。接入以后，样本是 v5 客户端真实写下的字节，冻结在 [fixtures/gunsmith-v5-saves.json](../../tests/fixtures/gunsmith-v5-saves.json)，经真实的 `decodeSession` 读、写回、重读；v6/v7 记录由 [gunsmith-enemy-records.test.ts](../../tests/gunsmith-enemy-records.test.ts) 用 main 规则写下的记录验证。旧客户端拒读由 `test:expansion` 用真实固定的 v5 客户端（main `30781f4`）和 v7 客户端（main `67a7468`）验证。

### 实例存在哪里

| 位置 | 存法 | 理由 |
| --- | --- | --- |
| 库存里的枪（仓库、背包、安全箱，行动携带的背包和安全箱，箱子和尸体） | 物品原样，枪多一个 `gun: { parts, devices }`；枪的 UID、枪型、枪身救济就是物品的 `uid`、`id`、`relief` | 不重复存 UID 和枪型，两处就不会对不上；枪本来不堆叠，`qty` 恒为 1；转移代码照旧搬整个物品对象。其他物品没有这个键 |
| 装备的枪（profile 的 `equipment`，经典检查点和分层行动的 `loadout`） | 加 `weaponUid` 和 `gun`，没枪时都是 null；`weapon` 仍是枪型 id，弹匣仍是 `ammo`、`ammoRelief` | 读 `weapon` 的几十处不用动；装备、卸下时 `uid`↔`weaponUid`、`gun`↔`gun` 原样搬，和物品对称。一份记录最多一处装备栏有枪：行动中 profile 的装备栏必须是空的 |
| 地上的枪（经典检查点的 `loot`，分层行动各层的 `loot`） | 和物品一样多一个 `gun`；地上枪的 UID 就是地上物品的 UID | 丢下、捡起都是同一把枪（M1-04） |
| 分层行动的携带物 | `raid.loadout` 按装备栏和物品存，各层 `loot`、`containers` 按上两行 | `LayeredRaid.version` 是暴击规则身份，不因枪械格式改变 |
| 经典检查点 | `loadout`、`loot`、`containers` 同上 | 检查点只存在于记录里，格式跟着记录版本走 |
| 两种备份 | 已结算备份 = profile v3 加封套 `formatVersion: 3`；完整备份 = v8 记录加封套 `formatVersion: 8` | 封套版本照旧等于里面的版本 |

- 行动中 profile 的安全箱是 `loadout.safe` 的镜像，两边比对时要包括 `gun`。
- 配件 UID 和物品 UID 是同一空间：全档唯一，也不能和行动里的实体 UID（敌人、弹丸、箱子、追击）相同。
- 不会放枪的地方不变：护符只能是两种护符；生产批次的材料和成品、待领救济（9 毫米弹和绷带）、结算摘要都不是枪。

### 版本

| 组成 | 现在 | 改枪后 | 理由 |
| --- | --- | --- | --- |
| profile（`SaveDataV1.version`，已结算备份的 `formatVersion`） | 2 | **3** | 物品和装备栏多了字段。不升的话，旧客户端读已结算备份文件时不查多余键，再经 `migrateSave` 重建物品，配件会被静默丢掉；升了以后旧客户端按版本拒读 |
| 会话记录 `SessionRecord.version`、完整备份 `formatVersion` | 3/4/5，#81 后 3–7 | **8**（原定 6） | 主档和完整备份的第一道门。v8 就是枪械实例格式，不管带不带扩展、带哪一版、敌人规则开没开；扩展有没有、是哪版由扩展自己的 `version` 说明，敌人规则由 `enemyBackup` 键说明。之后的写入一律是 v8 |
| `ExpansionState.version` | 1/2/3 | 不变 | 它表示 RPG 等级，枪械格式不改变它。若升成 4，进行中的 v2 行动要么被换规则，要么继续用旧物品格式；后者让 M1 每处都写两套 |
| `LayeredRaid.version` | 1/2/3，#81 后 1–5 | 不变 | 暴击和敌人规则身份；出厂枪不改变任何战斗规则，所以进行中的行动可以读档时直接迁移 |
| `RaidCheckpoint.version`、`worldVersion`、`layoutRevision` | 2（旧 1）、`coast-v2` 等 | 不变 | 只在记录里出现，跟着记录版本 |
| 旧键 `escape-bincov.save.v1` | profile 0/1/2 | 只读 | 新代码从不写它 |

- 为什么记录只加一个号，而不是照 3/4/5（以及 #81 的 6/7）再各开一个：读档时迁移要覆盖所有现存状态（新开局还没进站的 v3、带进行中 v2 行动的 v4、v5，以及敌人规则开着的 v6、v7），每种状态都要有枪械格式；照抄要多好几个号，`version >= 4` 这类判断全要改写。v8 下，今天按记录版本做的判断改为看扩展本身和 `enemyBackup` 键（清单见 M1-02，敌人规则见下一节）。
- v8 的键：总有 `format`、`version`、`revision`、`savedAt`、`profile`、`raid`、`terminal`、`legacyBackup`、`migrationBackup`、`gunsBackup`；带扩展时加 `expansion`、`systemsBackup`；扩展是 v3 时再加 `perksBackup`；敌人规则开着时再加 `enemyBackup`。和 v3–v7 的规则一样，只多 `gunsBackup`。

### 记录版本 v8 与敌人规则（与 #81 合并）

2026-10-24 合并 main `67a7468`。#81（敌人系统）先合入，用掉了记录 6、7：4 两样都没有，5 只有 Perk，6 只有敌人规则，7 两样都有；敌人规则一开就一直开着（`recordVersion(expansion, previous)` 看 `previous >= 6`），并多了 `enemyBackup`（第一次开启敌人规则时被替换的记录原文，只存一次）和 LayeredRaid 4/5（`enemyRules`、`perkRaidRules`）。维护者的规则是先合入者优先，所以枪械实例格式改为 **v8**：

- **一个号。** v8 只表示有枪械实例，不管有没有 Perk、敌人规则开没开。之后的写入一律 v8；v2–v7 只读，各按自己的规则校验后迁移。
- **Perk 规则照旧看扩展版本。** 扩展是 v3 时带 `perksBackup`，取值规则同 main（上一份记录是 Perk 格式就沿用它的，上一份带 v1/v2 扩展就存那份原文，否则 null）。
- **敌人规则看 `enemyBackup` 这个键。** v8 记录有这个键（值是文本或 null），敌人规则就开着；没有这个键就没开。
  - 只能和扩展一起出现；进行中的分层行动是敌人版（LayeredRaid 4/5）时必须有；值只能是文本或 null。解码器逐条检查，读档时不猜、不补。
  - 写入照 main 的 `recordUpgradeFields`：上一份记录有这个键就原样带上，所以一直开着；没有时，第一次写进敌人行动就开启，值是被替换那份记录的原文。只有明确导入另起一轮：导入的和本地的都带 v3 扩展时，保留本地的 `gunsBackup`、`perksBackup`，本地敌人规则开着就保留本地的 `enemyBackup`（导入后仍开着），否则用导入记录的；其他情况一律用导入记录自己的三份备份。`gunsBackup` 原来导入时一律保留本地的，M1-07 改成和另两份同一条规则，见下面「原字节」。
  - 普通写入不能去掉这个键（`RecoveryStore.commit` 有一道检查，对应 main 的「7 不能写回别的号」）。
- **为什么用这个键，不另加字段。** main 的 6/7 恰好就是带 `enemyBackup` 的记录，键在和规则开本来一一对应。迁移时原样留下这个键，开关就留下了，不用新造字段；另加一个布尔值会和这个键各说各的，还得规定对不上时听谁的。内存里的记录可能有值为 `undefined` 的键，所以代码一律用 `enemyRecord(record)`（值不是 `undefined`）判断，存下来的 JSON 里这和「有这个键」是一回事。
- **迁移。** v6、v7 迁移后保留 `enemyBackup`，敌人规则仍开着，之后结算、进站升级、下一局不带敌人的行动都保持；v4、v5 迁移后没有这个键，直到第一次出击带敌人的街区才开启，`enemyBackup` 存那次写入前的原文（写入失败就不开）。`gunsBackup` 存被替换的 v3–v7 原文；`enemyBackup`、`perksBackup`、`systemsBackup`、`migrationBackup` 原样不动。
- **旧客户端。** main `67a7468` 只认 2–7，读到 v8 报「无法读取这份存档……」，不写入，原字节不变；formatVersion 8 的完整备份报「此备份来自不兼容的版本」。`test:expansion` 加了它作第四个固定旧包 `pre-gunsmith.html`，原来的 `30781f4` 改叫 `pre-enemy.html`：四个旧包有锁无锁都拒读 v8；另有一步让 `67a7468` 自己出击带敌人的街区写下 v7，当前客户端打开后写成 v8（`gunsBackup` 是那份 v7 原文，`enemyBackup`、`perksBackup` 不变），`67a7468` 再打开时拒读、不改字节。
- **测试。** [gunsmith-enemy-records.test.ts](../../tests/gunsmith-enemy-records.test.ts)：v6/v7 迁移后保持开启，经过结算、进站、下一局不带敌人的行动；v4/v5 迁移后没有，第一次敌人行动才开启；坏的 v8 记录（敌人行动没有这个键、值不是文本或 null、没有扩展却有这个键、v8 标成 6 或 7）拒读且原字节不变；两条导入规则。#81 原有的组合存档测试改为断言 v8 加这个键，造历史记录时用 `oldRecord` 一并去掉枪械字段。
- 装备的枪迁移时新发的 UID 仍是 `gun-v6`、`gun-v6-2`……这是评审定下的名字，只是标识，不随记录版本改。

### 各旧版本怎么升

| 读到的 | 走法 | `gunsBackup` |
| --- | --- | --- |
| 旧键 profile v0/1/2 | `migrateSave`（旧规则，可修复）后 `migrateProfile` | null；原字节照旧在 `legacyBackup` |
| 会话 v2（profile v1） | `decodeSession` 照旧转成 v3（`migrationBackup` 存原文），再 `migrateRecord(记录, null)` | null；原文已在 `migrationBackup`，不存第二份 |
| 会话 v3、v4、v5、v6、v7 | 先按各自的旧规则严格校验，再 `migrateRecord(记录, 原文)`，结果按 v8 规则再校验一次；v6/v7 的 `enemyBackup` 原样保留 | 原文 |
| 会话 v8 | 按 v8 规则校验 | 照存 |
| 已结算备份 1、2，或没有封套的 profile | `decodeProfileDocument` 按旧规则，再 `migrateProfile` | 不涉及 |
| 完整备份 2–7 | `decodePortableBackup` → `decodeSession`，同上 | 原文（2 为 null）。导入时和 `perksBackup`、`enemyBackup` 同一条规则（见上一节）：导入的和本地的都带 v3 扩展时保留本地的，否则用导入记录的 |
| 进行中的旧行动（经典，分层 v1–v5） | 读档时迁移，行动继续；`rng`、`nextEntity`、时间、世界都不变，规则版本不变 | 原文 |
| 待保存结算 | 不在主档里；M1 之后导出的完整备份就是 v8 | — |

### 原字节

- `gunsBackup`：第一次写 v8 时被替换的那份 v3–v7 记录的原文，只存一次，以后不会被 v8 的文本替换。新开局、旧键迁移和 v2 记录为 null（原字节已在 `legacyBackup`、`migrationBackup`）。
- 明确导入完整备份时，`gunsBackup` 和 `perksBackup`、`enemyBackup` 走同一条规则（main 在 #81 定的，`recordUpgradeFields` 加 `RecoveryStore.commit` 的导入分支）：
  - 导入的和本地的都带 v3（Perk）扩展：保留本地的。院子导入已结算的备份时会先把它升到 v3，所以在院子里导入已结算的备份、「重新开始」都保留本地的。
  - 其他情况用导入记录的：v3–v7 备份是它自己的原文，v8 备份是它带的那份。本地没有 Perk 扩展时（新开局还没进站，或只有 v1/v2 扩展），本地原有的 `gunsBackup` 也被换掉，和另两份一样；导入扩展较旧的备份（例如带进行中 v2 行动的 v4 备份）另起一轮。
  - 测试：[gunsmith-enemy-records.test.ts](../../tests/gunsmith-enemy-records.test.ts) 的导入两项，覆盖新存档和已有 Perk 存档，v3、v5、v7、v8 备份，旧页签和院子两条路径。
- 在 `decodeSession` 里设，与 `migrationBackup` 相同：它把版本改成 8，存储层只能在这里拿到原文。
- 第一次写 v8 可能发生在行动中，这时 `gunsBackup` 是整份进行中的记录（先例：`systemsBackup` 可能存进行中的经典行动）。实测刚出击的记录约 14–16 KB（海岸、居民楼、商场），写成 v8 后仍远低于 2 MiB 上限；嵌套旧备份很多的大记录见「M1 接入的实际做法」的「风险」。
- 以后第一次写扩展 v3 时，`perksBackup` 存的是那时的 v8 文本；第一次开启敌人规则时，`enemyBackup` 也存那时的 v8 文本。v3–v7 原字节仍在 `gunsBackup`，没有字节丢失。

### 旧客户端怎么拒绝（M0 用当时的代码验证，接入后见 `test:expansion`）

- 主档 v8：main `67a7468` 的 `decodeSession` 只认 2–7（`30781f4` 只认 2–5），报「无法读取这份存档。请导出原始备份后使用兼容版本，当前进度未被覆盖。」，`initialize` 失败，不写入，原字节不变。
- 已经开着的旧页：写前比对失败，标记冲突，不覆盖。
- 完整备份 8：「此备份来自不兼容的版本，请使用兼容版本导入。」已结算备份 3：「此备份来自不兼容的版本，当前进度未改动。」没有封套的 v3 profile：「存档格式不支持或内容不完整，当前进度未改动。」院子的导入预览都拒绝，存档不变。
- 剩下的口子：有人手工把 v3 文件的版本改成 2，旧客户端会读进去并丢掉配件，这一点已经无法在旧客户端上修。新客户端遇到带 `gun` 或 `weaponUid` 的 v1/v2 profile 要拒绝，不能剥掉（M1-01）。

### 迁移函数

- `migrateProfile(profile)`：v2 → v3；v3 原样返回一份校验过的副本。
- `migrateRecord(record, original)`：`decodeSession` 返回的 v3–v7 记录 → v8，`original` 存为 `gunsBackup`；v8 原样返回校验过的副本，不看 `original`。
- 只加东西：库存和地上的旧枪加出厂状态 `{ parts: [], devices: { laser: false, light: false } }`，装备栏加 `weaponUid`、`gun`，profile 改 3，记录改 8，加 `gunsBackup`。测试把这些去掉后与输入逐字段相等：现金、位置、旋转、救济标记、弹匣和救济弹、任务、统计、已结算还是进行中、待保存结算的状态都不变。
- UID：库存和地上的枪沿用原 UID，出厂枪没有配件。唯一要新发的是装备中那把枪的 UID（一份记录最多一把）：取 `gun-v6`，存档里任何键或字符串已经是它就依次试 `gun-v6-2`、`gun-v6-3`……只取决于存档内容。不按修订号派生：已结算备份没有修订号，而这样同一份存档在记录里和在备份文件里迁移出同一个 UID（有测试）。
- 不读时钟、`Math.random`，不动行动的 `rng` 和实体序号 `nextEntity`。测试把 `Date.now`、`Math.random` 换成会抛错的函数，结果不变。
- 幂等：迁移两次等于一次。
- 拒绝（抛出「存档格式不支持或内容不完整，当前进度未改动。」，不修复）：未知版本；profile 版本和记录版本对不上；记录版本和扩展、和 `enemyBackup` 对不上（6/7 必须有，3/4/5 不能有）；旧格式里已经有 `gun`、`weaponUid`；旧存档不可能有的枪（旧三枪以外，包括匕首、样本 `m4a1`、原型键）；坏掉的物品栏、地上物品、箱子、地图；结果里有枪通不过 `validateGun`，或者枪、配件、物品 UID 重复。
- `OLD_GUNS` 是旧存档可能有的枪，就是旧三枪（测试核对等于 `WEAPONS` 去掉匕首）。M2-01 把 G17、M4A1 做成物品后它也不变：新枪只会出现在 v8 之后的存档里。

### 测过的样本

| 样本 | 来源 |
| --- | --- |
| 新存档 | `newSave` 的 profile；新开局还没进站的会话 v3；第一次进站后的 v5；`freshStartRecord` |
| 已结算旧档 | 仓库有旋转的卡宾枪和救济手枪，背包有霰弹枪和含救济弹的步枪弹，安全箱有手枪，装备卡宾枪；出击居民楼后撤离结算 |
| 已结算旧备份 | 同一存档的已结算备份文件（v2）和完整备份文件；两者迁移出同样的枪 |
| 活动分层行动 | 上面的存档在居民楼行动中（v5、行动 v3），地上丢一把霰弹枪、箱子里放一把救济手枪；同一行动改写成上一版客户端的 v4（扩展和行动 v2）；M0 原型世界的 v4（扩展和行动 v1） |
| 活动经典行动 | 海岸检查点，地上一把救济卡宾枪，箱子里一把霰弹枪 |
| 待保存结算 | 撤离时写入失败，导出完整备份 |
| 内含迁移备份 | 旧键 → 会话 v2 → v3 → v4 → v5，带 `legacyBackup`、`migrationBackup`、`systemsBackup`、`perksBackup`；另外直接迁移那份 v2 记录和旧键 profile |

### M1-01 要改的（实例字段与严格校验）

这两张清单按合并 #81 之前的编号写成：其中的 v6 现在都是 v8，v3–v5 是 v3–v7，敌人规则见[记录版本 v8 与敌人规则](#记录版本-v8-与敌人规则与-81-合并)。

- `src/domain.ts`
  - `Item` 加 `gun?: GunState`；`Equipment` 加 `weaponUid: string | null`、`gun: GunState | null`；`SaveDataV1.version` 改为 3。`migrate.ts` 里临时的 `StoredItem`、`StoredEquipment`、`StoredLoot`、`ProfileV3`、`RecordV6` 改用这些类型。
  - 所有产生枪的地方同一次改好，否则之后第一次保存就校验失败：`newSave`（起始手枪用 `uid()` 发 `weaponUid`）、`emptyEquipment`、`grantRelief`（救济手枪）、`addItem` 新建枪物品时给出厂状态、`equip`/`equipRun` 取物品的 `uid` 和 `gun`、`settleRun`/`beginRun` 带上 `weaponUid` 和 `gun`。卸枪仍走 `addItem` 时会换 UID，M1-03 再改成搬同一个实例；那之前只有出厂枪，不会丢配件。
  - `cleanInventory` 保留通过校验的 `gun`；`migrateSave` 接受并输出 3，v0–2 规整后交给 `migrateProfile`；`checkpointSafe` 复制安全箱时带上 `gun`。
- `src/profile-codec.ts`
  - `validInventory`：枪物品必须有 `gun` 且 `validateGun` 通过，其他物品不能有；`exact` 时枪多一个 `gun` 键；`gunUids` 里的配件 UID 也查 `seen` 再放进去。
  - `validEquipment`：要求 `weaponUid`、`gun` 两个键，没枪时都为 null，否则 `validateGun(weapon, weaponUid, gun)`，UID 进同一个 `seen`。弹匣上限在 M1-05 之前仍用 `WEAPONS[weapon].magazine`。
  - `decodeProfileDocument`：profile 和封套接受 1、2、3；3 按新规则；1、2 带 `gun` 或 `weaponUid` 就拒绝，否则按旧规则校验，经 `migrateSave` 后 `migrateProfile`。
- `src/save-backup.ts`：`encodeBackup` 写 `formatVersion: save.version`（今天写死 2）；`decodePortableBackup` 接受完整备份 2–6。
- `src/checkpoint.ts` 的 `validateCheckpoint`：携带物合成 profile 时带上 `weaponUid`、`gun`；地上的枪要有合法 `gun`，其他地上物品不能有；物品 UID、装备的枪和全部配件 UID 用同一个集合，并且不能和地上物品 UID 相同（今天经典检查点不查这一条，真实存档不会冲突）；`inventoryIdentity` 包括 `gun`。经典检查点的地上 UID 只能是 `(enemy|loot|entity)-N`，M1-04 让丢下的枪保留物品 UID 时要放宽。
- `src/expansion-state.ts` 的 `validateExpansion`：`loadout` 的精确键加 `weaponUid`、`gun`，装备的枪校验后 UID 进 `invIds`；地上物品是枪时精确键加 `gun`，`validateGun`，配件 UID 进 `invIds`（现有“`invIds` 与实体 UID 不相交”的检查就覆盖到）；箱子走带枪规则的 `validInventory`；`inventoryIdentity` 包括 `gun`。
- `src/fresh-start.ts` 的 `freshStartRecord`：`version: 6`、`gunsBackup: null`、profile v3。

### M1-02 要改的（旧档迁移接入读档）

- `src/recovery-store.ts`
  - `SessionRecord.version` 为 6，加 `gunsBackup: string | null`；`recordVersion` 恒返回 6（或删掉）。
  - `decodeSession` 接受 2–6。v6：精确键按上面的 v6 规则，`profile.version === 3`；今天的 `r.version >= 4` 改成“带扩展”，`r.version === 5` 改成“带 v3 扩展”，规范化比较按 v3 profile。v2–v5：照今天的规则校验，再 `migrateRecord(记录, r.version >= 3 ? text : null)`，结果按 v6 校验；迁移抛出的错误统一转成 `failure()`。
  - `RecoveryStore.load` 记住 `this.guns = record.gunsBackup`（旧键路径为 null），旧键 profile 走 `migrateProfile`。
  - `commit` 写 `gunsBackup: this.guns`，从不替换。按记录版本做的判断改看已存记录的扩展：`had = this.record?.expansion?.version ?? 0`；`had > 0` 而新写入没有扩展时拒绝；`had === 3` 而新写入的扩展低于 3、又不是确认过的导入时拒绝；`systemsBackup = this.systems ?? (expansion && had === 0 ? this.expected : null)`；扩展是 v3 时 `perksBackup = this.perks ?? (had === 1 || had === 2 ? this.expected : null)`，否则不写这个键。
- `src/session.ts` 的 `prepareExpansionMutation`：试算记录用 v6，带上 `gunsBackup`，扩展是 v3 时才带 `perksBackup`。
- `src/save-backup.ts` 的 `encodeRecoveryBackup`：`formatVersion` 跟记录一样是 6。
- 院子的 `previewImport`、`importBackup` 和旧页签导入不用改：解码器已经迁移，“当前成长存档不接受降级覆盖”的判断照旧。
- 要跟着改的测试：`perk-save`、`perk-base`、`expansion-recovery`、`hideout-runtime`、`fresh-start`、`recovery`、`profile-codec`、`save-validation-audit` 等断言 v3/v4/v5 写入或 `formatVersion` 的地方；CP-23 里“未知记录版本”的 6 要改成 7；`test:save-browser` 的导出断言。

### M1 接入的实际做法

2026-10-24 在分支 `wip/gunsmith-m1core` 按上面两张清单做完（M1-01、M1-02，以及 M1-03、M1-04、M1-06）。与清单不同或清单没写到的地方：

- **格式由 profile 版本决定。** 新旧两种格式共用一套校验函数：profile v3（记录 v8）按枪械实例规则，v1/v2（记录 v2–v7）按今天的规则，并且不许出现 `gun`、`weaponUid`。`validInventory` 的 `guns` 规则、`validateCheckpoint`、`validateExpansion` 都按传入 profile 的版本选格式，不另加参数。旧格式的 profile 由新增的 `decodeOldStoredProfile` 按旧规则校验和规整（不迁移），`decodeSession` 拿它和存的 profile 比对，再整份记录一起迁移。
- **`migrateSave` 只输出 v3。** v3 按新规则规整，保留通过校验的枪状态；v0–v2 先按旧规则规整（`cleanOldSave`），再 `migrateProfile`。
- **读档。** v2–v7 先按旧规则校验，再迁移；迁移结果做一次 JSON 往返后按 v8 校验。迁移和这次 v8 校验里的任何错误都统一成 `failure()`（清单只写了迁移）。迁移只在内存里做，打开页面时那次写入才把 v8 和 `gunsBackup` 写进去；写入失败时原字节不动，重试照常。main 的 `recordVersion` 已删除，`recordUpgradeFields` 改为恒写 v8、按扩展和 `enemyBackup` 决定两份备份。v8 记录不论有没有扩展都按精确键校验。
- **占格读枪的状态。** `itemSize`、`fits` 对带 `gun` 的物品用 `gunSize`，装了延伸件的枪在校验和摆放里都按实际大小算；出厂枪和以前一样大。界面格子的绘制和预览仍按物品表，M2 有了可装的配件再改。
- **搬同一把枪（M1-03、M1-04）。** `D.placeItem` 把已有物品原样放进第一个空位；装备、卸下、行动内换枪时离开装备栏的枪保持 UID 和状态，快速移动、安全箱、丢下和拾取都不再重建枪。放不下时整次不变。
- **地上的枪。** 丢下的枪保留物品 UID；经典检查点的地上 UID 对枪放宽为任意物品 UID（清单已预告）。另外，经典行动和 v1 分层行动地上生出的枪带的是行动内计数的 UID（`loot-3`、`entity-12`），下一局会再发同样的号，所以拾取时换成新的物品 UID（`D.placeGroundGun`）；v2/v3 分层行动的 `entity-<runId>-n` 照旧保留。
- **UID 不相交。** 经典检查点新加：所有物品、装备的枪和配件的 UID 不能和地上物品、敌人、弹丸、箱子的 UID 相同（分层行动原来就查）。
- **真实旧客户端。** `test:expansion` 有四个固定旧包：扩展前的 `pre-m0.html`、v4 客户端 `pre-perk.html`、v5 客户端 `pre-enemy.html`（main `30781f4`）和 v7 客户端 `pre-gunsmith.html`（main `67a7468`）。它们有锁无锁都拒读 v8、不改任何字节；v4、v5、v7 客户端都拒绝 v8 完整备份文件；v7 客户端自己写下的带敌人规则的 v7 记录被当前客户端写成 v8 后，它也拒读。
- **容器里的枪的重量（M1-08 评审）。** `D.weight` 原来每件物品都按 `ITEMS` 的重量乘数量，装了配件的枪放在背包、安全箱或仓库时只算原厂重量，装备上才算配件（`equippedWeight`），同一套东西换个位置负重就变。现在物品重量只有一个读法 `D.itemWeight`：带 `gun` 的枪用 `gunWeight`，和装备时一样；出厂枪和其他物品逐位等于原来的值。行动负重（`carriedWeight`）、院子出发负重（`departure`）和旧页签的 `preparedWeight` 经 `D.weight` 用它，行动背包、院子详情和旧页签的重量显示也改用它；同一处的售价显示留给 M2-08。测试见 [gunsmith-readers.test.ts](../../tests/gunsmith-readers.test.ts) 的重量两项。
- **守恒与往返（M1-07）。** [fixtures/conservation.ts](../../tests/fixtures/conservation.ts) 用 200 个固定种子各走 30 步合法操作，全部经真实接口；[gunsmith-conservation.test.ts](../../tests/gunsmith-conservation.test.ts) 跑种子 1–100，[gunsmith-conservation-2.test.ts](../../tests/gunsmith-conservation-2.test.ts) 跑 101–200，单元测试并行跑两半：
  - 院子：移动、快速移动、安全箱、装备和卸下、整理、商店买卖（带救济配件的枪整枪拒卖）、出击海岸、居民楼和商场，导出再导入（本页院子、新页院子、新页旧页签）。
  - 行动：换枪、背包与安全箱之间移动、丢下和拾取、箱子和尸体的转移、击杀、跨层、检查点、把进行中的行动导出到新页继续、撤离和死亡结算。
  - 约十分之一的写入被强制失败，再照玩家的做法重试。
  - 每步后解码存档并检查：全档 UID 唯一；每把枪的 UID、枪型、救济标记和整棵配件树不变，只按上面的规则出现或消失；普通弹和救济弹分开守恒；现金只按报价变；写入失败时存档字节和内存都不变，重试只生效一次；会话等于已提交的存档；院子出发负重和行动负重等于逐件独立相加，同一把枪在哪里都一样重。
  - 每半约 11 秒，并行时墙钟约 12 秒（一个文件跑完 200 个种子约 19 秒）。失败时打印种子和步骤，用 `GUNSMITH_SEEDS` 跑第一个文件可单独重放（第二个文件跳过），单跑和接在别的种子后面走的步骤相同。故意注入的几种缺陷（拾取时换 UID、退弹把救济弹算成普通弹、死亡保留背包、写入失败不回滚、商店多扣钱、结算重试后仍挂起、容器里的枪不算配件重量）都在前 40 个种子内被发现。
- **M1-08 存档复核补的三条校验。** 只有改过的存档才会碰到；修好后这样的记录读档时就拒绝，原字节不动：
  - 经典检查点：地上物品的 UID 不能等于箱子或尸体的 ID。丢下的枪在地上保留物品 UID（M1-04），地上 UID 不再只是行动内的计数；原来没查这一条，这样的记录能读进来，之后每次捡起都写入失败。
  - 护符的 UID 也不能和经典行动携带的物品、枪和配件相同（分层行动原来就查）。背包物品这一条 main 上原来也漏了，旧格式的规则一起补上。
  - 旧键里的 v0/v1 profile 带 `gun` 或 `weaponUid` 就拒读，不再经宽松修复悄悄去掉（v2 原来就拒绝），即 M0 评审决定 2。
  - 测试在 [gunsmith-migrate.test.ts](../../tests/gunsmith-migrate.test.ts)。
- **估值与售价（M1-06）。** `D.itemSale` 按组成算，救济组成值 0；有救济组成时商店拒绝整件出售，原因是「这把枪装有救济配件，不能整枪出售。」，结算时混进待卖区的也整笔拒绝；救济判定 `liquidValue` 把这样的枪算 0（商店现在不收）。
- **提交顺序。** M1-01 的提交单独看时只读写 v6，旧记录一律拒读（原字节不变）；M1-02 的提交接上迁移后全部测试通过。
- **弹匣上限（与 M1-05 合并时接上）。** 存档校验和 `cleanMagazine` 按装备实例的有效弹量，卸枪按存的弹数原样退回，见上面[Runtime 怎么接](#runtime-怎么接m1-05)的「弹匣」。
- **导入时的 `gunsBackup`（M1-07）。** 清单写的是 `commit` 写 `this.guns`、从不替换，导入时就一律保留本地的。M1-07 删掉 `this.guns`：`gunsBackup` 由 `recordUpgradeFields` 取上一份记录的（普通写入是本地的，导入是导入记录的），导入分支和 `perksBackup`、`enemyBackup` 同一条规则，见上面「原字节」。
- **风险。** `gunsBackup` 把被替换的整份记录作为文本再存一份。记录里已经嵌着的旧备份每多嵌一层，转义字符就多一倍，所以第一次写 v8 不只是翻倍：M1-08 评审按最深的备份链（旧键 → v2 → v3 → v4 → v5 → v7）实测，v7 记录 627.6 KiB 写成 v8 是 1686.3 KiB，约 2.7 倍；照这个比例，约 760 KiB 的记录写成 v8 就超过 2 MiB 上限而写入失败。读档仍不覆盖原字节，可导出原始备份。实测刚出击的记录约 16 KB，带全部旧备份的约 25 KB，离这个大小很远。

### 待维护者定

2026-10-24 已评审，结论见本页开头「M0 评审决定」。

- 记录只加 v6 一个号，不按扩展分成 6/7/8；`ExpansionState.version` 不升。
- 进行中的旧行动读档时就迁移，不等结算。
- `gunsBackup` 在解码时取原文；第一次写 v6 若在行动中，记录大约翻倍。
- 装备的枪用 `gun-v6` 加序号，而不是按修订号派生。
- 配件树按嵌套存（本页目录一节原写“沿用平铺形状”，已改）。
- 拆掉设备时开关必须一起关，而不是记住玩家的偏好。
- 经典检查点从此要求地上物品 UID 和物品 UID 不同；带 `gun` 字段的 v1/v2 profile 一律拒绝。
