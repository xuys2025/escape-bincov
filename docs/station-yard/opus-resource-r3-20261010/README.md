> 合并整理说明：本文结论与历史失败保留，8 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Opus 第三轮 · 上下文恢复的两项资源问题

日期：2026-10-10（UTC+8）。工作树 `D:/bincov/hideout-runtime`，原分支 `agent/hideout-runtime`，从 Astra 资源归因提交 `7a4dc75` 继续（产品构建 `dist/index.html` sha256 `ce732ff6…`，与 `c24d32b`/`5075ed6` 相同）。开工时工作区干净，origin/main 仍为 `43a342c`。本轮只修 Astra [资源报告](../astra-resource-r3-20261010/README.md)里已确认的两项上下文恢复问题，按他给出的[对象身份和持有链](../astra-resource-r3-20261010/OWNERSHIP.md)处理生命周期；没有改 Runtime、存档、接口、素材和画面方案。只在本地提交，不推送、不合并、不发布、不更新试玩站。

给 Sol 的独立复验步骤见 [复验清单](SOL-RECHECK.md)。

## 结论

两项修复分别签，和总堆分开：

1. **旧 worldRT/lightRT/glowRT 的管理表空槽：已修复。** 固定口径连续恢复 60 轮，`glTexture` 空槽全程 0；同会话修复前对照 9→99→189（每轮 +3，与 Astra 原值相同）。每轮恰好 3 个旧 RT 的键离开表、3 个新键进入，旧 RT 的 Texture/TextureSource 已销毁或已回收。改窗口尺寸换 RT 时原来也每次留 3 个空槽，同样修好。
2. **ASTRA-R3-PIXI-01（恢复时重编 graphics 程序、源码被全局缓存永久持有）：已修复。** 恢复 60 轮的快照里同一个 `createIdFromString` 缓存对象 0/30/60 轮都是 3 个 shader 键、9,228 B；同会话修复前对照 6/36/66 个、22,236→282,396 B（与 Astra 原值相同）。程序仍在每个新上下文里重新链接并重新取 uniform 位置；恢复到不同纹理单元数时换成对应程序，回到原能力时回到原程序。同一路径上还有一处随恢复增长：每次新建的 Shader 都给页面共享的 batch-sampler 组挂一个监听且旧的从不摘除（修复前每次 +1），现在替换时释放旧 Shader，监听数不变。
3. **总堆仍 PARTIAL。** 三组 60 轮的 CDP 堆、快照分类和斜率见下文；恢复组快照字符串已不再增长（30→60 为 −16 B；修复前 Astra +130,124 B、本轮同会话 +65,216 B），但重挂/共享组的编译代码、浏览器性能记录和原生部分仍有增长，没有逐字节归因，不据此签收长期内存。
4. 原 Sol R 的四个严格失败照旧保留（都不是这两项，见下文）；ASTRA-SAVE-01 仍 UNCONFIRMED；F20 / ASTRA-STATION-HEAP-01 / SOL-R2-RESOURCE-01 整体、ART/COPY/API/RELIEF 状态不变。

## 问题一：旧 RT 留下的管理表空槽

**原因。** Pixi 8.22 把每个上传过的 GPU 纹理按 TextureSource uid 记在 `glTexture` 管理表里；资源卸载时只把值置为 null，键留着，要攒到 10,000 个才重建表。上下文恢复时 `GlTextureSystem.contextChange` 先把全表置 null，活的纹理下次绘制时用原 uid 重新登记。院子的 `webglcontextrestored` 处理随后调用 `HideoutScene.resize()`，销毁旧的三张 RT 并新建三张：旧 source 已销毁，永远不会再登记，它们的 null 就一直留着。平时改窗口尺寸、缩放、通电取景也走 `resize()`，销毁时 Pixi 自己把槽置 null，同样留下 3 个。停放共享渲染器时 `parkApp` 会整体压缩，所以以前只在院子一直挂着时累积。

**改法。** `HideoutScene.releaseTargets()`（`resize()` 和 `destroy()` 共用）：先记下三张旧 RT 的 `source.uid`，`destroy(true)` 之后调用新的 `releaseManagedSlots(app, 'glTexture', uids)`，只删除这三个 uid 中值为 null 的键。活条目、其他空槽（例如等待重新上传的活 source、sharedQuad 的缓冲槽）、其他表一概不动；Pixi GC 正在遍历表时跳过。已销毁的 RT 不会被重复处理。

**验证。**

| 检查 | 修复前（`ce732ff6`） | 修复后 |
| --- | --- | --- |
| 固定口径恢复 60 轮，`glTexture` live/empty | 661/9 → 661/99 → 661/189，严格与归属失败各 60 | 661/0 全程，严格/归属失败 0 |
| 逐轮键审计（`station-resource-target-slots.mjs`） | 每轮 3 个新 null，全是上一轮的活 source；离开表 0 | 每轮 3 个键离开、3 个新键进入（均为非 `scene.textures` 的 source），新 null 0 |
| `station-context-program.mjs` S1：4 次丢失/恢复，旧 RT uid 是否还在表中；旧对象三次 CDP GC 后状态 | **FAIL**：旧 uid 以 null 留在表中 | PASS：旧 uid 不在表中；旧 Texture/TextureSource 均为 collected |
| S2：改窗口 1100×700 → 1920×1080 → 1280×720 | **FAIL** | PASS |
| 丢失期间（S1 同时检查） | S1 在第 1 轮旧槽断言处已失败；60 轮恢复组每轮丢失期间帧继续推进 | 每轮 0.8 s 丢失期间推进 84–85 帧、计时 +0.51 s，`active` 为 false（练习暂停），恢复后为 true |

## 问题二：ASTRA-R3-PIXI-01

**原因。** `GraphicsPipe` 在每次 contextChange（渲染器启动和每次上下文恢复）调用 `GlGraphicsAdaptor.contextChange`，后者用 `compileHighShaderGlProgram` → `new GlProgram` 重新生成 graphics 程序。`GlProgram` 构造时 `setProgramName` 给名字加页面级递增编号（graphics-fragment、-2、-3…），再以整段源码为键调用 `createIdFromString`，其模块级缓存从不删除键，于是每次恢复多持有一段约 4.3 KB 的源码。这是 Pixi 渲染层的生命周期问题，与 Runtime、存档无关。Pixi 自己的 batch、mesh、tiling 程序都是建一次、跨上下文复用的，只有 graphics 每次重编（因为它依赖当前上下文的可批纹理数）。另外，每次新建的 Shader 会让页面共享的 batch-sampler UniformGroup 多挂一个 change 监听（属于新 Shader 的 BindGroup），旧 Shader 不销毁，监听从不摘除。

**改法。** 新模块 `src/coast-view/renderer-lifetime.ts`：

- `KeptProgramGraphicsAdaptor` 继承 Pixi 的 `GlGraphicsAdaptor`，同类型、同名字 `graphics`，通过 Pixi 公开的 `extensions.remove(GlGraphicsAdaptor)` / `extensions.add(...)` 在第一次 `Application.init` 之前替换（由 `coast-view/host.ts` 导入，院子和城中村共用）。不改 `node_modules`，不碰打包 HTML。
- 程序按 `renderer.limits.maxBatchableTextures` 每种取值编译一次，bits 和名字与 Pixi 原适配器相同，整页复用。可批纹理数是这段源码唯一的变量，所以每种能力一份即可，数量有上限。
- GL 侧不缓存任何东西：`GlShaderSystem.contextChange` 本来就清空 programData 与同步函数，下一次绑定时在新上下文里重新编译链接这段源码、读取 attribute/uniform 位置；uniform 组的脏标记挂在新 programData 上，新上下文第一次绑定会全部上传。Shader 与 localUniforms 仍在每次 contextChange 新建（与 Pixi 一致），被替换的旧 Shader `destroy(false)`：释放它的 BindGroup 和监听，但不销毁共享程序。适配器 `destroy()` 也只释放 Shader。
- 没有清空 idHash、没有重置名字/uid 计数、没有重建 Application。

**验证（`scripts/station-context-program.mjs`，院子保持挂载、真实渲染器）。** 绘制检查用 `batchMode:'no-batch'` 的 Graphics（带平移和 50% tint，确保走 graphics 适配器并用到 uColor/uTransformMatrix）画到临时 RT 再读回像素。能力差异用测试浏览器里的 `getParameter` 垫片：只在 `window.__units` 设置时把 MAX_TEXTURE_IMAGE_UNITS 报为 8，不改游戏代码；恢复后的上下文由此得到 `maxBatchableTextures = 8`。

| 检查 | 修复前 | 修复后 |
| --- | --- | --- |
| P1 启动 + 3 次恢复：是否同一 GlProgram（WeakRef 判定）；当前上下文 programData 已链接、uniform 位置无 GL 错误、`uTextures[i]=i`；像素红/绿/蓝 128 且位置正确；batch-sampler 监听数 | **FAIL**：每次新程序（graphics-fragment-2…-5），监听 3→4→5→6；绘制正确 | PASS：同一程序，名字不再递增，监听 2 不变；绘制和绑定全部正确 |
| C1 恢复成 8 个纹理单元 | PASS（新编 8 槽程序） | PASS：换成 8 槽程序，`uTextures`=0..7，绘制正确 |
| C2 再以 8 恢复 | **FAIL**：又编一份 | PASS：同一个 8 槽程序 |
| C3 回到原能力（16） | **FAIL**：又编一份 | PASS：回到最初的 16 槽程序；全程只有 2 个程序 |
| C4 每种能力的源码（只归一编号后缀）与修复前 Pixi 自己编出的源码比较 | — | PASS：16 与 8 两份都与修复前完全相同 |
| R1 恢复后院子世界 RT 非空、键盘行走有位移 | PASS | PASS |

修复前构建 3/8、修复后 8/8（[修复前报告](evidence/program-prefix.json)、[修复后报告](evidence/program-fixed.json)）。C3 回到 16 后共享 sampler 组的监听由 2 变 3：多出的一个来自 Pixi 批处理器在能力变化时新建 DefaultShader（`DefaultBatcher._updateMaxTextures`），只在能力真的改变时出现，同能力的恢复不会增加；不属于本轮两项，未改。

快照里的 shader 源码键（`station-resource-shaders.mjs`，同一 idHash 对象，0/30/60 轮）：

| 序列 | 修复前 | 修复后 |
| --- | --- | --- |
| 恢复 60 | 6/36/66 键，22,236/152,316/282,396 B（本轮同会话对照，与 Astra 相同） | **3/3/3 键，9,228 B 不变** |
| 重挂 60 | 3/3/3（Astra） | 3/3/3 |
| 共享往返 60 | 4/4/4（Astra） | 4/4/4 |

短循环（6 次恢复）先行确认：修复前 6→12 键（+26,016 B），修复后 3→3（+0 B）；`glTexture` 空槽修复前 9→27、修复后 0→0。

## 三组 60 轮（固定口径）

完全按 [Astra 固定口径](../astra-resource-r3-20261010/README.md#固定口径)：Node 24.19.0、pnpm 11.19.0、本机 Chrome 154.0.8037.99；打包 HTML 经 `https://station.test/` 离线路由；DPR1 1280×720；repaired 夹具、village seed 42；各自新进程串行；三轮同动作预热后 60 轮，每轮完整预热（30 个相机点、194 处墙、玩家 8 向×5 帧及描边、门开关、NPC 当前姿势域）；回 (17.5,18.6) 等 1500 ms，三次 CDP GC 间隔 200 ms，读 JSHeapUsedSize；0/30/60 快照。三组互不相减，不与历史 G6/20 轮/R/R7/F20 混算。

| 序列（修复后 `112e7c8e`） | 状态 | 集合与表 | 释放 |
| --- | --- | --- | --- |
| 重挂 60 | BOUNDED_CHECKS_PASS_HEAP_PENDING，严格/归属失败 0 | texture 589、墙组 197 / frame 4136、GPU 661、表 723/0，每轮相同 | 每轮 5,317 个标记资源全部回收，旧 host/scene 0 |
| 共享往返 60 | 同上 | 同上，表 727/0；sharedQuad 同一几何与三缓冲身份 | 每轮 5,317 回收；停放时无 stage 子项、ticker 停、canvas 脱离、事件为空、空槽 0 |
| 恢复 60 | 同上（修复前同会话对照 PARTIAL，失败 60/60） | 表 723/0 全程（修复前 723/9→189）；每轮丢失期间 300 ms 内至少 51 帧、恢复后 300 ms 内至少 50 帧 | 最后重挂 5,317 回收 |

快照 CPU 实例数 0→60 三组都不变：StationHost 1、HideoutScene 1、RenderTexture 3、Texture 4,805、CanvasSource 666、TextureSource 8、Buffer 40、QuadGeometry 1，CoastSampleHost/CoastView/CoastRaidRuntime 0（[重挂（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[共享（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[恢复（已归档）](../../IMPLEMENTATION-ARCHIVE.md)）。

## 总堆（单独报告，仍 PARTIAL）

CDP JSHeapUsedSize（字节，十进制 MB 仅为可读）。斜率不是门槛。

| 序列 | 基线→60 / 端点差 MB | 6–10→56–60 均值差 MB | 全 60 / 后 30 斜率 B/轮 | 修复前 Astra 同项 |
| --- | --- | --- | --- | --- |
| 重挂 | 23.741→24.754 / +1.013 | +0.628 | +16,751 / +17,313 | +1.460；+0.636；+14,020 / −4,103 |
| 共享 | 26.112→28.411 / +2.299 | +0.505 | +8,371 / +10,637 | +1.232；+0.621；+11,937 / +27,882 |
| 恢复 | 24.234→23.331 / −0.902 | −0.488 | −11,456 / −6,591 | −1.219；−1.052；−10,831 / +5,878 |

本轮同会话修复前恢复组：22.888→23.425（+0.537），均值差 −0.689，斜率 −10,620 / −2,647。两次运行之间差异本身就有零点几 MB，单看 JSHeapUsedSize 分不出 4 KB/轮的字符串。

快照 self_size 分组（[恢复 0→60（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[30→60（已归档）](../../IMPLEMENTATION-ARCHIVE.md)，另两组及修复前同会话为同名 `remount-`/`shared-`/`prefix-context-` 文件；dominator 路径有重叠，不能相加；不是 GPU 内存）：

| 序列 | 快照 self 总差 0→60 B | 编译 code | 浏览器 Performance 记录 | 字符串 0→60 / 30→60 | 后 30 快照总差 B |
| --- | --- | --- | --- | --- | --- |
| 重挂 | +1,084,220 | +883,008 | +61,864 | +3,956 / +52 | +231,088 |
| 共享 | +1,751,343 | +1,156,612 | +122,720 | −41,468 / −20 | +369,672 |
| 恢复 | −47,750 | −333,000 | +46,632 | −65,748 / −16 | +108,520 |
| 恢复（修复前，Astra） | +102,138 | −315,016 | +63,472 | +195,404 / +130,124 | +180,888 |
| 恢复（修复前，本轮同会话） | +103,458 | −332,852 | +59,848 | +195,372 / +65,216 | −534,046 |

恢复组字符串 0→60 从约 +195 KB（两次修复前运行一致）变为 −65,748 B，后半段从 +130,124 / +65,216 B 变为 −16 B，与 shader 键 66→3 一致。其余增长主要落在 V8 编译代码（InstructionStream/TrustedByteArray）、浏览器 Performance 记录和原生部分，与 Astra 的归类相同；本轮没有改变这些，也没有逐字节归因。没有 GPU/驱动内存、无探针长循环或真机对照，所以总堆继续 PARTIAL。

## 堆诊断映射与 SHA 保护

新构建的混淆名全部变了（例如 idHash 变量 XT→jT，HideoutScene rm→am），Astra 的手工别名不能复用。新增 `scripts/station-resource-build-map.mjs`：从 HTML 中唯一的标记推出 idHash 变量（`createIdFromString` 的函数体）和 QuadGeometry、Buffer、CanvasSource、TextureSource、Texture、RenderTexture、HideoutScene 的构造器名；构建 SHA 必须在 `VERIFIED` 表中且推导结果完全一致，否则报错。`station-resource-heap.mjs`、`station-resource-shaders.mjs` 改用它（`--html=` 指定产生快照的构建，快照目录的 report.json 记录的构建不同也报错；shader 脚本可用 `--rounds=` 指定快照轮次）。

| 构建 | 推导结果 | 核对 |
| --- | --- | --- |
| `ce732ff6…`（修复前） | XT、Ep、Fi、xe、gb、ft、c、rm | 与 Astra 手工别名完全相同；用新脚本重跑 Astra 原 long-context 快照得到同一 cache id 151775、6/36/66 键，与其证据逐项一致 |
| `112e7c8e…`（本轮） | jT、wp、Di、xe、Tb、ft、f、am | 逐个对照声明：`lr(f,t){let s=jT[f]…}`、wp 的 positions/uvs、Di 的 buffer 构造、xe 的 createCanvas、Tb 的 `$t("textureSource")`、ft、`f extends ft{static create`、am 的 wallCellTextures |

## 原 Sol R / K 检查

- 原 R（`station-round2-recheck.mjs --only=R`，断言未改）：修复后仍是同样的四个严格失败——village-1 GPU 纹理增长（首次往返的合法缓存）、context-1 `glBuffer` 空槽（sharedQuad 三个缓冲在院子不重绘，恢复后留空，Astra 已归为合法）、context-2/3 GPU 纹理增长（恢复后 live GPU 纹理比恢复前多；本轮未逐项归因，修复前后相同）。都不是本轮两项，按要求原样保留。[报告（已归档）](../../IMPLEMENTATION-ARCHIVE.md)
- K3 / K4：两个构建都先在 `glBuffer`（sharedQuad）断言上失败，原样保留。K4 恢复后 `glTexture` 空槽修复前 19、修复后 15：K4 只遍历墙、不预热人物/NPC 变体，恢复后没再绘制的活 source 在重新上传前保持 null。K4 不记录键，差值（4）没有逐键核对；逐键结论以完整预热的 60 轮恢复组为准（旧 RT 槽 0、新 null 0）。
- J1（Sol 的触摸检查）间歇失败：点开设施面板后找不到 `.phead` 的关闭按钮（截图里按钮其实在）。修复后 3 次运行 2 次在“通电”失败、1 次全过；修复前构建 5 次运行 1 次两种供电都在同一步失败、4 次全过。失败点相同，都在设施面板（推测与设施面板每 30 帧刷新一次内容、脚本取按钮位置的时机有关，未证实）；本轮没有改界面，判为脚本既有的不稳定，断言未改，交 Sol 判断是否加固（[运行记录](evidence/regressions.json)）。J2、K1、K2 通过。

## 回归

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 275/275（原 273 + `tests/renderer-lifetime.test.ts` 2 项：只删指定表、指定 uid 的 null；活条目/其他表不动；GC 遍历中或结构变化时不动）（[日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md)） |
| `pnpm package` | PASS，两次打包 SHA 相同（[日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md)） |
| `station-context-program.mjs` | 修复后 8/8；修复前 3/8（S1、S2、P1、C2、C3 失败）（[修复后](evidence/program-fixed.json)、[修复前](evidence/program-prefix.json)） |
| `pnpm test:station` 院子完整门禁 | **76/76**，页面错误 0、外部请求 0。G5 院子 ↔ 城中村共用渲染器计数一致；G6 20 次重挂 GPU 纹理 203→203、托管 269/0→269/0；G7 丢失期间推进 51 帧、恢复后 51 帧、无帧错误 |
| 城中村 `coast-sample-test` | 51/51（含 W11b：丢失上下文后下次挂载换新渲染器并继续运行；该测试不检查程序身份） |
| Sol 普通入口 `station-ordinary-acceptance` | 3/3 |
| 原 R / J,K / 身份探针 | 见上节：R 四败照旧；K3/K4 因 sharedQuad 失败照旧；探针 PARTIAL（首次往返 GPU 增长、恢复后 glBuffer 空槽），与 Astra 修复前结果项目相同 |
| `coast-lifecycle-test` | **0/4，修复前构建同样 0/4**：脚本在“进入”后找旧页签的 `#seed`，院子成为默认入口后就走不到检查本身；属既有过期脚本，未修改。它覆盖的城中村丢失期间冻结时间，本轮只由 coast-sample W11b、院子 G7 和 S1 间接覆盖 |
| Astra `test:hideout` | 8/8 |
| `test:mobile` / `test:mobile-ux` | 10/10、11/11 |
| `test:desktop-input` / `test:shop-drag` | 10/10、21/21 |
| `test:portable` | 6/6 |
| `test:title` / `test:save-browser` / `test:systems` | 27/27、9/9、16/16 |

全部运行在 Node 24.19.0、pnpm 11.19.0、Chrome 154.0.8037.99，浏览器串行；完整结果见 [regressions.json](evidence/regressions.json)。

## 构建

| 文件 | sha256 |
| --- | --- |
| dist/index.html = start the game.html | `112e7c8e37c91a218351b2fee03c008872bee5ca563d4262e431a57a845c5ef1`（3,619,802 B） |
| release/Escape-Bincov-portable.zip | `6e789f4bf0902bbc4897bfde56c01a2a7e66c708661556673b136320e4d1ec54` |
| release/Escape-Bincov-web.zip | `8b75c966f139675b22279c7ad458be9056e368aad5237ac7dffc6057c806b16c` |

`docs/release-manifest.json` 由 `pnpm package` 同步更新。修复前构建 `ce732ff6…` 只作对照，不在仓库里另存。

## 未测与边界

- 真机、真实 GPU/驱动内存、真机帧率、人手体验、远端 CI 未测；JS 堆不能代替 GPU 内存。
- 能力差异用浏览器垫片模拟，没有在真正只有 8 个纹理单元的设备上跑。
- 修复只覆盖院子的三张 RT 与 graphics 程序。城中村视图自己的渲染目标、sharedQuad 的合法空槽、首次往返的缓存迁移不在本轮。
- 原 Sol R 四败、K3/K4 失败保留，没有改断言或阈值。

## 复现命令

在工作树设置 Node 24 / pnpm 11.19 后执行，每次用新的 out 目录。修复前构建：`git show 7a4dc75:dist/index.html > <目录外>/prefix-ce732ff6.html`。

```powershell
node scripts/station-context-program.mjs --html=<prefix-ce732ff6.html> --out=<dir>/program-prefix
node scripts/station-context-program.mjs --reference=<dir>/program-prefix/report.json --out=<dir>/program-fixed
node --import tsx scripts/station-resource-trend.mjs --mode=remount --rounds=60 --snapshots --out=<dir>/long-remount
node --import tsx scripts/station-resource-trend.mjs --mode=shared --rounds=60 --snapshots --out=<dir>/long-shared
node --import tsx scripts/station-resource-trend.mjs --mode=context --rounds=60 --snapshots --out=<dir>/long-context
node --import tsx scripts/station-resource-trend.mjs --mode=context --rounds=60 --snapshots --html=<prefix-ce732ff6.html> --out=<dir>/prefix-long-context
node scripts/station-resource-shaders.mjs <dir>/long-context <dir>/long-context/shader-cache.json
node scripts/station-resource-shaders.mjs <dir>/prefix-long-context <out.json> --html=<prefix-ce732ff6.html>
node scripts/station-resource-target-slots.mjs <dir>/long-context/report.json <out.json>
node scripts/astra-r7-heap-graph.mjs <round-0.heapsnapshot> <round-60.heapsnapshot> <heap-0-60.json>
node scripts/station-resource-heap.mjs <round-0.heapsnapshot> <round-60.heapsnapshot> <owners-0-60.json>
node scripts/station-resource-summarize.mjs <dir> <evidence目录>
```

原始快照体积大，只留在本机 `test-results/opus-r3`；提交的是去掉字符串内容的统计、路径和散列索引（[local-raw-index](evidence/local-raw-index.json)）。
