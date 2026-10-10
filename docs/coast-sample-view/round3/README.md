> 合并整理说明：本文结论与历史失败保留，1 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 城中村样板第三轮：Sol 验收返修（Opus）

2026-10-08（UTC+8）。原分支 `docs/coast-2-5d-art-design`，从 Sol 提交 `c836737` 接手，承接 [Sol 验收报告](../sol-acceptance-20261008/README.md) 和 [归属清单](../sol-acceptance-20261008/defects.md)。

**本轮停止点：** 已补齐背包与搜刮的拖放、旋转、拆分和安全箱转移，补齐地图、阅读面板和缺失的 HUD。首批 43 张素材已接入，返修项已整理。F20 堆增长已定位，隐藏房间信息边界已收紧，并补了相应回归。没有扩展全沿海，没有新增素材，没有推送、合并或发布。

## 基线

| 对象 | 状态 |
| --- | --- |
| main | `841e8bb`，与上一轮相同，无需再合并 |
| PR #22 | OPEN，远端头仍为 `878f563`。原 fork 无写权限，本轮提交仍只在本地 |
| 工作区 | 接手时干净，HEAD `c836737` |

## 预览入口

| 入口 | 说明 |
| --- | --- |
| `dist/index.html?sample=village`（或 `start the game.html?sample=village`） | 离线单文件，默认使用 Sol 首批素材 |
| `…?sample=village&art=placeholder` | 同一画面改用程序占位素材，供对比 |
| `…&test=1` | 另外暴露测试接口，只用于检查与截图 |

**新增操作：**
- Tab 打开背包；搜刮时按 E 打开搜刮面板。
- 面板里鼠标拖动物品放到格子上，拖动中按 R 旋转。
- 单击物品查看详情，可做这些操作：使用、装备、旋转、移动格位、拆分放置、放入/取出安全箱、丢弃。
- 触屏：选中物品后点「移动格位」，再点目标格。
- M 或「选择撤离点」打开地图：可切换楼层，选择撤离点后 HUD 显示方向和直线距离。
- 站在告示/笔记前按 E 打开阅读面板。

## 一、前端补齐（OPUS-UI-01 / OPUS-UI-02）

| 项目 | 实现 |
| --- | --- |
| 背包 / 搜刮 | `src/coast-view/inventory.ts`：<br>• 沿用原库存的 `.grid/.item/.drop-preview/.placement-cell` 样式与 `itemArtwork` 图标。<br>• 鼠标拖放带实时绿/红预览，R 旋转。<br>• 点选后按格位放置（触屏/键盘）；拆分数量后再放置。<br>• 背包/安全箱可快速互转。 |
| 提交路径 | 与原 UI 一致：<br>• 搜刮面板内的每次移动（容器、背包、安全箱之间）都走 `services.transferLoot`，带精确的 `x/y/rotated/quantity`。<br>• 背包面板内的整理走 `SaveSession.mutate(moveQuantity / rotateItem / transferItem)`，会连同已挂接的 Runtime 世界一起回滚。<br>• 使用/装备/丢弃仍走对应服务。<br>• 面板不改 PublishedView，也不持有库存副本。 |
| 写入失败 | 物品回到原位，提示「保存失败」，进入原有的保存失败重试面板（U05） |
| 地图 | `src/coast-view/map.ts`：<br>• 信息与原 `drawMap` 相同：地形、区/房名、楼梯、门、本层撤离点、玩家点。<br>• 不画敌人、物资或未揭示内容。<br>• 地图打开时世界继续运行，行动输入被挡住。<br>• 楼层页签：地面/二楼/地下。<br>• 选择撤离点后，HUD 显示方向和直线距离。<br>• 画布按显示尺寸 × DPR 重设分辨率，文字和标记在 640×300 下仍可读；短屏改为左右两栏。 |
| 阅读 | 告示/笔记的 `notice` 事件按标题匹配后进入阅读面板；世界继续运行，E/Esc 关闭（U08） |
| HUD | 体力数值、精神/水分/饱食与负重、电台消息（Runtime `say`）、撤离指引、任务清单与键位提示 |

### 修掉的两个宿主问题（由新检查发现）

- **拖放后下一次点击被吞：** 拖放会设置「吞掉随后的 click」标记。如果放下时重绘了格子，浏览器可能根本不发这次 click，标记就一直留着，玩家的下一次点击无效。现在每次新的按下都会先清掉这个标记。
- **阅读面板一打开就关：** 阅读面板是在帧内处理事件时打开的，同一帧稍后的面板同步看到的还是旧的 `running` 阶段，于是立刻关掉。现在面板请求阻塞后，最多等 3 帧让 Runtime 发布 `blocked`；玩家关闭面板时清除等待。

## 二、首批 43 张素材接入（OPUS-ART-01）

- **文件：** `assets/coast/v1/*.png` 是 Sol 交付 PNG 的逐字节副本。`assets/coast/manifest.json` 记录尺寸、锚点和 SHA-256。
- **构建检查：** `scripts/build.mjs` 校验两件事：导入清单与 manifest 完全一致；每个文件哈希一致。任一不符即构建失败。
- **体积：** 单文件只增加约 31 KB。
- **加载：** `src/coast-view/assets.ts` 由 esbuild 内联成 data URL，样板启动时用动态 `import()` 加载并解码一次。这样普通模块图和 Node 单测都不会导入 PNG。
- **合成：** `src/coast-view/art/sol.ts` 只负责合成；没有对应试样的部件仍用程序占位。

| 部件 | 接入方式 | 仍用占位 |
| --- | --- | --- |
| 玩家 | E/SE/S/NE/N × idle+4 步；W/SW/NW 按 manifest 镜像 E/SE/NE；下蹲暂用 idle | 敌人四类、尸体 |
| 卡宾枪 | 握把 (8,4) 作旋转轴，枪口 x=28；敌我持卡宾枪均用此图 | 手枪、霰弹枪、匕首、棍 |
| 墙 | 墙帽 core 加四向边条（按相邻墙判断），下接 48px 立面：外立面 a/b 按位置哈希，内墙、东西向窗、东西向门（关/开）。墙端保留 1px 明暗边 | 南北向门、南北向窗、门楣、破损墙的缺口用清除像素处理 |
| 地面 | 沥青/院地/瓷砖 a/b 按位置哈希；保留少量补丁、裂缝、苔藓、排水口等运行时变化，路缘、车道线、墙影不变 | 混凝土、木地板、泥地、水面 |

回归：`?art=placeholder` 仍走原占位路径（`scripts/coast-sample-art.mjs` 的对比图同时验证两条路径）。

返修意见见 [给 Sol 的剩余事项](#给-sol)。

## 三、隐藏房间信息边界（OPUS-VIS-01 / VIS-02 相关）

- **问题：** 原实现中，未揭示房间里的尸体会创建 14 个血迹贴花；飞溅的血、火花、弹壳和落地贴花也不看所在区域，只靠屋顶遮住。
- **现在：** `Fx` 中每个粒子和贴花都归属其当前位置所在的区域，只有 Runtime 报告该区域已揭示时才绘制。飞行中的粒子每帧按当前位置重新判断，落地贴花继承落点区域。这样屋顶淡化、切层、重建后都不依赖屋顶遮挡。
- **回归 V01：**
  - **方法：**
    - 敌人经 Runtime 真实伤害路径（新增测试驱动 `kill`）死在未揭示房间里，用原生暂停冻结模拟时间。
    - 从同一批次、同一相机重新呈现，逐像素比较视图自身的合成目标（不含 HTML）。
    - 所有探针都去掉屋顶和天花板（相当于屋顶完全淡出）。
  - **条件：** 门关闭；开过再关；视图重建；去二楼再回来。四种条件下改变像素均为 **0**，被扣留的贴花数逐次 +14。
  - **阳性对照：** 强制显示这些贴花后改变 16 个像素。
  - **揭示后：** 进入房间揭示后，尸体显示，扣留数归零。

## 四、F20 堆增长定位（OPUS-MEM-01）

工具：`scripts/coast-sample-heap.mjs`。

- **方法：**
  - 自动生成未压缩的同源页面，类名可读。
  - 按 Sol 的完整循环跑 N 次。每次循环：出击 → 换层 → 返回 → 撤离或放弃 → 结算 → 基地，之后用 CDP 强制 GC。
  - 在两个循环点各拍一次堆快照，比较按构造器统计的实例数和 self size。
  - 按 heap node id 找出两次快照间新增且仍存活的对象，并给出保留路径。

**结论：**

| 来源 | 份量 | 性质 |
| --- | --- | --- |
| 测试脚本：`waitForFunction(() => …host.lastBatch)` 返回对象，Playwright 以 JSHandle 交回且未释放 | 每轮固定 1 份 PublishedView（含地图），14 轮约 0.9 MB | **测试工具假象**。Sol 的 F20 脚本正是这样等待；改为返回布尔值后消失 |
| V8 编译代码与反馈向量（InstructionStream、TrustedByteArray 等） | 第 10→30 轮约 14 KB/轮，逐渐变平 | JIT 升级，不是泄漏 |
| `?test=1` 的 `window.__bincovSample.initial` | 恒为最近一轮卸载的宿主一份 | 仅测试入口，不累积 |
| **PixiJS 8.22.0 全局着色器名缓存** | 约 5.4 KB/次挂载 | **真实但很小的无界增长**，见下 |
| 存档 | 每轮约 2.76K 字符，不增长 | — |

**PixiJS 着色器名缓存：**
- **成因：** 每次销毁 Application 时，`GlProgram.destroy()` 会清空 `programCache`。下次挂载重新编译 graphics / big-triangle 程序，`setProgramName` 给 `SHADER_NAME` 加递增后缀（如 `graphics-vertex-12`），于是 `createIdFromString` 的全局 `idHash` 里多存一份约 2.6 KB 的源码字符串。这是库内行为，宿主拿不到这些引用。
- **量级：** 约 1000 局累计约 5 MB。
- **处置：** 本轮不改库，也不改「卸载即销毁 WebGL 上下文」的生命周期约定。是否改为全页复用同一个 Pixi Application，交维护者决定。

**F20 回归：** 30 轮，快照取第 10 轮与第 30 轮。

| 指标 | 结果 |
| --- | --- |
| 显式资源计数 | 每轮全部为 0 |
| 宿主 / 视图 / Runtime / Pixi 应用与渲染器 / 纹理 / 精灵 / 画布实例 | 两次快照间无累积 |
| 保留 self size | 约 24.1 KB/轮（含上表 JIT 与 Pixi 部分） |
| Sol 口径（第 6–10 轮均值对末 5 轮） | 0.70 MB，仍为正值。原因是前几轮仍在 JIT 预热，不作为通过门槛 |

详见 [heap-report.json](heap-report.json)。

## 五、存档异常（ASTRA-SAVE-01）的新线索

接素材时复现过一次与历史现象相同的「存档损坏或版本不兼容」暂停面板。用未压缩构建定位到是 `?test=1` 测试驱动造出的非法状态，Runtime 的 2 秒检查点校验正确地拒绝了它：

- `driver.weapon()` 把卡宾枪弹匣设成 24 发（容量 12），把霰弹枪设成 5 发（容量 2）。W02 正是用霰弹枪，2 秒内若遇检查点就会失败。现改为装满对应弹匣。
- 按 hp=0 直接摆放敌人时，`kills` 与已死敌人数不一致。现新增 `driver.kill()`，走 Runtime 自身的伤害路径。

当年「样板外」截图那次没有调用这两个驱动，所以仍不能据此断定历史异常的根因。截图脚本现在会把存档校验错误的消息和调用栈记进 `index.json`，再出现即可直接区分：是 setItem 抛错、快照校验失败，还是修订冲突。

## 实际验证

环境：Windows 10，Node 24.19.0，pnpm 11.19.0（corepack），Chrome 154.0.8037.98（headless），本机 RTX 3070。汇总见 [verification.json](verification.json)。

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | 223/223 通过 |
| `pnpm package` | 通过。`dist/index.html` 与 `start the game.html` 均为 3,144,063 字节，SHA-256 `b3c85989…bc0f62a6`；重新构建逐字节一致 |
| `node scripts/coast-sample-test.mjs` | **27/27 通过**（原 W00–W16，加新增 U01–U09 和 V01），0 页面错误，0 外部请求（[report.json](report.json)） |
| `node scripts/coast-sample-heap.mjs`（30 轮，快照取第 10/30 轮） | 通过：无实例累积，资源计数每轮为 0，保留 24.1 KB/轮（[heap-report.json](heap-report.json)） |
| `node scripts/coast-sample-shots.mjs` | 17 个场景 × 4 种尺寸 = 68 张，0 异常、0 错误、0 外部请求（[shots/（已归档）](../../IMPLEMENTATION-ARCHIVE.md)，共约 24 MB） |
| `node scripts/coast-sample-art.mjs` | Sol 素材与占位素材各 4 组对比裁图（[art/](art/)） |
| `node scripts/coast-sample-measure.mjs` | 1280×720，约 800 帧。帧间隔 p50/p95/p99 为 6.0/7.5/10.8 ms，Runtime advance 为 2.4/3.4/5.4 ms，视图 present 为 1.2/2.3/3.6 ms（[measure.json](measure.json)）。本机桌面 GPU，不代表手机 |
| 原浏览器回归 12 套 | browser、desktop-input、save-browser、buildings、mobile、mobile-ux、portable、ui、loot、expansion、qol-expansion、systems 全部通过（退出码 0） |
| `git diff --check`（源码/脚本/文档） | 干净 |

**新增检查：**

| 编号 | 内容 |
| --- | --- |
| U01 | 鼠标拖放，带实时预览，落到精确格位 |
| U02 | 3×1 物品旋转；原位放不下时进入旋转放置预览 |
| U03 | 拆分 5/24 放进安全箱 |
| U04 | 安全箱快速转回并合并堆叠 |
| U05 | 写入失败时回滚，并进入原重试面板 |
| U06 | 搜刮按格位放置：一次 committed 的 `transferLoot` |
| U07 | 地图：阻塞但时间继续运行、楼层页签、撤离指引驱动 HUD |
| U08 | 阅读面板 |
| U09 | HUD 字段 |
| V01 | 隐藏房间像素零差分，含阳性对照 |

**未运行：**
- `pnpm test:layered-play`：前几轮已知是原脚本问题。
- WebGL 上下文丢失、真机、真人试玩。
- Sol 的 `scripts/sol-sample-boundaries.mjs`：其 F14/F16 仍用旧的列表式背包选择器，需由 Sol 更新。
- 本机系统 Node 已变为 22.22.2；以上结果都用本机另一份 Node 24.19.0 运行（仓库要求 24）。在 Node 22 下，`tests/save-flow.test.ts` 因模块解析差异无法加载（找不到无扩展名的 `src/domain`），其余单测通过；与本轮改动无关。

## 给 Astra

1. **ASTRA-SAVE-01：** 结合上节的测试驱动线索复核历史异常。驱动修改只涉及 `src/raid-runtime/test-support.ts`（`weapon` 弹匣、`kill`），生产路径未改，请确认符合 Runtime 契约。
2. **F20：** 逻辑层未发现保留引用：会话、Runtime、事件队列都不跨局累积。PixiJS 全局缓存是否处理（复用 Application 或保持现状），请与维护者一起确定。
3. **地图：** 撤离指引是宿主按 `frame.player` 与所选撤离点算出的直线方向/距离，没有路径规划。如需寻路指引，需要新的 Runtime 字段。

## 给 Sol

1. **复测：** 用本轮的 `?sample=village` 复测 OPUS-UI-01/02、VIS-01（V01 方法见上）以及人工画面签收。
2. **测试脚本选择器：** `scripts/sol-sample-boundaries.mjs` 里的 F14/F16 还在用旧的列表式背包（`[data-do="drop"]` 等），需要改成格子面板：先点选物品，再点 `inv-drop` 等。
3. **F20 等待写法：** 请把所有 `waitForFunction` 改成返回布尔值，否则 JSHandle 会把被等待的对象一直留在内存里。可直接用 `scripts/coast-sample-heap.mjs`。
4. **首批素材返修**（实机截图见 [art/](art/)，`*-sol.png` 与 `*-placeholder.png` 同机位对比）：

| 编号 | 部件 | 问题 | 建议 |
| --- | --- | --- | --- |
| ART-R01 | wall-core | 32×32 墙帽四周烘焙了深色边框和内框，连续墙体在画面上变成一格一格的方块（`facade`/`interior` 截图最明显） | core 应可无缝平铺，四周外缘只由 edge-n/s/e/w 提供 |
| ART-R02 | wall-exterior-a/b | 左右各有 1px 深色竖缝；对角裂纹在每格同一位置重复，连续立面呈明显周期 | 两侧不留缝；a/b 的裂纹/污渍位置错开，或再给一块无特征的 c |
| ART-R03 | wall-interior | 浅色上墙板中的成对「↑↑」形标记每格重复，像文字或箭头 | 去掉或改为不规则污渍 |
| ART-R04 | wall-window-ew | 窗下的青蓝色带饱和度明显高于全图，远看像一条蓝线 | 降低饱和度，靠近 window 调色板中的灰绿 |
| ART-R05 | ground-yard-a/b | 高亮碎点密度和对比度过高，近景像噪声，盖过沥青与人物 | 降低亮点数量和亮度，拉开与人物的明度层次 |
| ART-R06 | ground-tile-a | 比 tile-b 和周围亮很多，16px 棋盘格加重了「格子感」 | 压暗 a 并缩小与 b 的差异 |
| ART-R07 | player body 全方向 | 两只手臂都下垂且烘焙了手；持枪时武器自带手套，画面上出现第三只手（E/W/SE 最明显） | 出一组「持械」上身：持枪手臂不画，或按 manifest 给出手部锚点，由运行时画手臂 |
| ART-R08 | player N/NE/NW | 背向时枪在身后，枪管从肩膀上方伸出，像飘在头顶 | 背向持械姿势给出握点或允许隐藏武器的规范 |
| ART-R09 | player 镜像 | 镜像本身朝向正确；但镜像会把烘焙的受光面一并翻到另一侧（推论，未做专门光照对比） | 确认可以接受；不能接受就需要补 W/SW/NW 原画 |
| ART-R10 | 下蹲 | 无下蹲帧，暂用 idle | 若保留下蹲状态，需要补帧 |

以上只针对这 43 张，不扩量。脚底基线、锚点、`pixelated` 缩放、尺寸、Alpha 实测无问题；卡宾枪握把和枪口与运行时轴线对齐。
