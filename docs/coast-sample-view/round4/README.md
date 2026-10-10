> 合并整理说明：本文结论与历史失败保留，8 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 城中村样板第四轮：返修素材接入与剩余问题（Opus）

2026-10-08（UTC+8）。原分支 `docs/coast-2-5d-art-design`，从 Sol 提交 `87b879b` 接手，承接 [Sol 第三轮复验](../sol-round3-20261008/README.md) 与 [问题清单](../sol-round3-20261008/defects.md)。

**本轮停止点：** Sol 第二版素材已正式接入。已处理：背向武器（R08）、镜像光照（R09）、下蹲（R10）、短屏地图标注重叠（UI-03）、F20 的 Pixi 着色器名缓存增长（MEM-01）。相应回归已补。没有扩展全沿海，没有新增素材，没有推送、合并或发布。

## 基线

| 对象 | 状态 |
| --- | --- |
| main | `841e8bb`，已包含在本分支，无需再合并 |
| PR #22 | OPEN，远端头仍为原 fork 的 `878f563`。没有写权限，本轮提交只在本地 |
| 工作区 | 接手时干净，HEAD `87b879b` |

## 预览入口

| 入口 | 说明 |
| --- | --- |
| `dist/index.html?sample=village`（或 `start the game.html?sample=village`） | 离线单文件，默认使用 Sol 第二版素材 |
| `…?sample=village&art=placeholder` | 同一画面改用程序占位素材，供对比 |
| `…&test=1` | 另外暴露测试接口，只用于检查与截图 |

## 一、返修素材正式接入（OPUS-ART-REVIEW）

- **导入：** 新增 `scripts/coast-import-assets.mjs`，按 Sol 交付 manifest 校验每张 PNG 的 SHA-256、尺寸与锚点，再写入 `assets/coast/v1` 和 `assets/coast/manifest.json`（记录 `revision`、`heldGripLocal`）。ID 集合必须与运行时导入表一致，否则拒绝。
- **结果：** 43/43 校验通过，34 张替换，9 张（4 边条、2 门、2 沥青、卡宾枪）逐字节未变。`scripts/build.mjs` 原有的哈希校验在打包时再次通过。
- **画面：** 墙帽不再成格、外立面无竖缝与重复裂纹、窗带转灰绿、院地与瓷砖降噪压暗，见 [实机对比裁图](art/)（`*-sol.png` 与 `*-placeholder.png` 同机位）和 [截图（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。
- Sol 的 `sol-round3-preview.mjs` 验图副本已无需使用：正式构建就是返修版。

## 二、背向持枪（ART-R08）

**问题：** 返修体去手后，N/NE/NW 背向时枪管从头顶伸出，看起来像飘着。

**做法：** 不只隐藏武器，而是按 2.5D 视角做纵深缩短。
- 持枪方向仍是瞄准方向。枪身在画面上的长度乘 `1 − 0.5·|sin(瞄准角)|`：朝东西方向时为全长，朝南北（指向或背离镜头）时为一半。
- 背向时枪本来就画在身体后面。缩短后枪落在躯干和背包的轮廓内：正北完全被身体挡住；NE/NW 只在肩侧露出枪口一小段。
- 侧向和正面照常显示，独立枪图的手套就是手（与 R07 去手的体图配合）。
- 枪口火光按同一缩短后的长度定位，仍在子弹轨迹线上。模拟、命中、枪口距离等逻辑均未改。

**回归 V02（新增）：**
- **方法：** 同一帧呈现两次，一次带武器、一次不带，逐像素比较。用真实指针把瞄准转到各方向，并核对 Runtime 的 `aim`。
- **结果：**

| 方向 | 头顶以上的武器像素 | 武器像素总数 |
| --- | --- | --- |
| N | 0 | 0 |
| NE / NW | 0 / 0 | 24 / 36 |
| E / W | 0 / 0 | 388 / 436 |
| SE / S | 0 / 0 | 248 / 188 |
| 阳性对照：N，恢复全长 | **12** | 12 |

实机八方向见 [player-dirs-sol.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md)（顺序 E、SE、S、SW、W、NW、N、NE）。

## 三、镜像光照（ART-R09）：保留镜像

- **依据：** 返修体只有很弱的环境明暗，场景的方向光来自运行时光照图，不是烘焙在图上的。
- **实测：** 统计每帧躯干左右边缘 3px 的平均亮度差。E/SE/NE 三组 15 帧的差值在 −10.7 到 +0.4（0–255 标度）之间，主要来自正面/背包的内容差异；旧版最大为 −22.8。镜像后没有可见的「光从另一侧来」。
- **结论：** 维持 W/SW/NW 镜像 E/SE/NE，**不需要补西向原画**。`art/sol.ts` 已写明这一点。

## 四、下蹲（ART-R10）：现有动作不需要下蹲图

- **核查：** Runtime 没有下蹲或潜行状态。宿主里的 `crouch` 帧只用在死亡瞬间约 0.16 秒的过渡，之后换成尸体图。
- **改动：** 这段过渡改为站立帧以脚底为轴，向尸体朝向倾倒（0.16 秒内转约 72°），随后尸体替换；倒地时不显示手中武器。占位素材与 Sol 素材都走同一路径。`crouch` 帧及「idle 代替下蹲」的分支已删除。
- **结论：** 现有动作**不需要下蹲图片**，所以不向 Sol 追加补图规格。[倒地过程裁图（已归档）](../../IMPLEMENTATION-ARCHIVE.md)：0 / 0.04 / 0.08 / 0.12 / 0.2 秒（白色为原有的受击闪白）。

## 五、短屏地图标注（OPUS-UI-03）

**原因有两个：**
1. 短屏布局下，地图仍受通用规则 `max-height: calc(100vh - 180px)` 限制，640×300 时只有 120px 高。
2. 标注不做避让。

**改动：**
- **短屏布局：** 标题和关闭按钮并入左栏，地图占满面板高度。640×300 时地图从约 165×120 增到 **342×248**（CSS 像素）。
- **标注避让：** 所有标注最后绘制，互不重叠，也不压撤离点方框、楼梯标记和玩家点。每条标注依次尝试锚点、上、下、左右，找不到空位时：
  - 撤离点仍画在其方框上方（不会丢）；
  - 区名、房名按优先级舍去：选中的撤离点 > 其他撤离点 > 区名 > 房名。
- 宿主保存每次绘制的标注位置，供测试读取。

**回归 U10（新增）：** 640×300、844×390（DPR3、触屏）与 1280×720 三种尺寸，选中一个撤离点后检查：
- 标注两两不相交，且不与任何标记相交；
- 都在画布内；
- 每个撤离点都有标注；
- 两种短屏尺寸下，地图高度 ≥ 视口高度 − 60。

全部通过。640×300 和 844×390 舍去了「褪色居民楼 · 一楼」，其余 7 条全部显示；1280×720 全部 8 条显示。[640×300（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[844×390（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[1280×720（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

## 六、F20 持续缓存增长（OPUS-MEM-01）

**根因（读 PixiJS 8.22.0 源码核实）：**
- 每个新渲染器初始化时都会 `new GlProgram(...)` 编译 graphics 与 back-buffer（big-triangle）程序。
- `setProgramName` 给每次编译的 `SHADER_NAME` 加递增后缀，于是完整源码字符串每次都不同，被全局 `createIdFromString` 缓存永久保留。
- 因此只要每次挂载都新建渲染器，就会增长。上一轮说的「复用 Application」是唯一能在宿主侧解决的办法。

**改动（`host.ts`）：** 整页只保留一个 Pixi Application。
- **卸载时：** 视图照旧销毁自己的容器、RenderTexture 与纹理；宿主再清空舞台、停 ticker、移除画布，并执行 Pixi 的 `GlobalResourceRegistry.release()`（与原先 `destroy` 时 `releaseGlobalResources` 清理的是同一组全局池）。
- **下次挂载：** 复用这个 Application。若它的 WebGL 上下文已丢失，则销毁并新建。

**复用后暴露、并已修掉的问题：**
- **Graphics 上下文残留：** Pixi 的 `Graphics.destroy(options)` 只有在不带参数时才销毁自身的 GraphicsContext。我们的 `destroy({ children: true })` 让这些上下文及其池化批次留在渲染器里（以前随整个渲染器一起销毁，所以看不出来）。现在传 `context: true`。
- **测试计数口径：** `managedTextures` 会把已释放的槽位留为 null，计数改为只算存活项。Pixi 在空槽满 10,000 时自动压缩，所以空槽有上限。

**实际验证：**

| 检查 | 结果 |
| --- | --- |
| `coast-sample-heap.mjs`，30 轮，快照取第 10/30 轮 | 退出 0。着色器源码字符串 **81 → 81**，名称无递增后缀；受跟踪实例无累积；每轮显式资源归零；渲染器停放 1 个；停放时 GPU 纹理每轮均为 2 |
| 保留 self size | **+23,320 B/轮**，其中 V8 编译代码 20,280 B，其他 3,040 B（主要为 Chrome 性能时间线条目 LCP/LayoutShift/LongTask 等，浏览器有缓冲上限；未见本项目对象）。上一轮为 24.1 KB/轮（含约 5.4 KB 着色器缓存） |
| W11 | 20 次视图重挂后，监听、ticker、应用、画布、图集、GPU 纹理（26）全部持平 |
| W11b（新增） | 重挂复用同一渲染器；人为丢失上下文后再重挂，换成新渲染器且未丢失；丢失时 Runtime 按原规则暂停，恢复后继续出帧 |
| Sol `sol-sample-boundaries.mjs` F20（打包版，20 轮） | **仍为 partial，退出码 1**：第 6–10 轮均值对末 5 轮增加 410,481 B（上一轮 547,495 B）。曲线已趋平（末 10 轮在 25.19–25.53 MB 间波动），但按 Sol「总堆不增长」的严格条件**不签收** |

结论：已定位的无界缓存增长（着色器名）已消除，并有快照断言守住。总堆在 30 轮内仍小幅上升，按快照分解主要是 JIT 编译代码与浏览器性能条目，未找到本项目的保留对象；没有把它写成「完全无增长」。

## 实际验证

环境：Windows 10，Node 24.19.0，pnpm 11.19.0（corepack），Chrome 154.0.8037.98（headless），本机 RTX 3070。机器登记见 [verification.json](verification.json)。

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | 223/223 通过 |
| `pnpm package` | 通过。`dist/index.html` 与 `start the game.html` 均为 3,145,136 字节，SHA-256 `f2456655…5f74fb9`；重新构建逐字节一致 |
| `node scripts/coast-sample-test.mjs` | **32/32 通过**（原 27 项 + V02、W11b、U10×3），0 页面错误，0 外部请求（[report.json](report.json)） |
| `node scripts/coast-sample-heap.mjs`（30 轮） | 通过，见上节（[heap-report.json](heap-report.json)） |
| `node scripts/coast-sample-shots.mjs` | 17 场景 × 4 尺寸 = 68 张，0 异常、0 错误、0 外部请求。仓库只提交其中 13 张（[shots/（已归档）](../../IMPLEMENTATION-ARCHIVE.md)），[index.json（已归档）](../../IMPLEMENTATION-ARCHIVE.md) 列出全部 68 张 |
| `node scripts/coast-sample-art.mjs` | Sol 素材与占位素材各 4 组对比裁图（[art/](art/)） |
| `node scripts/coast-sample-measure.mjs` | 1280×720，800 帧。帧间隔 p50/p95/p99 为 6.0/8.4/11.4 ms，Runtime advance 为 2.3/3.1/5.0 ms，视图 present 为 1.6/3.5/7.9 ms（[measure.json](measure.json)）。单次运行，本机桌面 GPU，不作性能结论 |
| Sol `sol-occlusion-probe.mjs` | 8/8 通过 |
| Sol `sol-visibility-probe.mjs` | 通过 |
| Sol `sol-sample-boundaries.mjs` | 7 项通过，F20 partial，退出码 1（见上节） |
| 原浏览器回归 20 项 + `test:layered-play` | 20 项退出码 0；`qol-expansion` 首跑退出码 1，见下 |

**回归逐项（首跑退出码）：** browser、desktop-input、save-browser、buildings、mobile、mobile-ux、portable、ui、loot、expansion、systems、art、tactical、title、title-water、mall-passages、mall-landing、qol、loot-target 均为 0。layered-play 为 0：超时局 600.3 秒、死亡局 65.3 秒、撤离局 28.5 秒。

**`qol-expansion` 间歇失败（既有问题）：**
- **现象：** 在原 Phaser 商场测试中，按 E 后立刻读取 `lootContext.containerId`，偶尔读到 null。该测试不加载任何样板代码。
- **对比：** 本构建 10 次中失败 5 次；在临时工作树里用未改动的 `87b879b` 正式构建（逐字节等于上一轮发布物）运行，10 次中失败 2 次，报错相同。日志见 `test-results/round4/regressions/`（本机，未入库）。
- **处理：** 属于测试脚本的等待竞争，不是本轮改动引入；本轮不改这个与样板无关的测试，交 Sol 修等待条件。

**未运行：** 真机、真人试玩（G12）、本地提交的远端 CI。

## 给 Sol

1. **复验本轮画面：** 背向持枪的纵深缩短（V02）、镜像保留、倒地过渡、短屏地图。用正式 `dist/index.html?sample=village` 即可，不再需要验图副本。
2. **下蹲不再需要补图。** 后续交付的 manifest 可以把 `pixelPolicy.crouch` 改为「不需要：死亡过渡由运行时倾倒处理」。西向原画也不需要（R09 已确认保留镜像）。
3. **`qol-expansion` 间歇失败：** `scripts/qol-expansion-test.mjs` 第 57 行按 E 后立刻读 `lootContext`。请改为先等待 `lootContext` 非空再断言；基线同样会失败（2/10）。
4. **F20 统计口径：** 你的严格条件（第 6–10 轮均值对末 5 轮）仍为正值。建议另报 `coast-sample-heap.mjs` 给出的「编译代码 / 其他」拆分与着色器字符串计数，再决定签收标准；本轮不替你改判。
5. 仍为程序占位、本轮不扩量的部件：敌人四类、尸体、南北向门窗、手枪/霰弹枪/近战武器、混凝土/木地板/泥地/水面。是否进入下一批由维护者决定。

## 给 Astra

1. **ASTRA-SAVE-01（历史存档异常）：** 本轮未涉及，仍由你承接。
2. **渲染器复用的生命周期复核：** 改动只在宿主层，Runtime、存档、事务均未改。请确认：
   - 上下文丢失时宿主调用 `runtime.pause('context-lost')`，玩家恢复前保持暂停。W11b 在同一 Runtime 上重挂验证了这一点。
   - 正常结算/放弃后，Runtime 照旧 `dispose()`，停放的只是渲染器。
3. **地图：** 撤离指引仍是宿主按直线计算，没有路径规划；本轮只改了标注排版，没有新增 Runtime 字段。
