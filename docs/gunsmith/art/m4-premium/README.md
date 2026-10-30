# 老栓精工配件美术交付

2026-10-30，按 [BRIEF](BRIEF.md) 完成 **78 张主体图＋1 张必要的卡宾 H 变体，共 79 张 PNG、11,880 字节（11.60 KiB）**。承接 [PR #150](https://github.com/xuys2025/escape-bincov/pull/150)、[#155](https://github.com/xuys2025/escape-bincov/issues/155)。绘图起点 M4 `40d43c102fbaa12a671f635736c98ea154d473a3`，检查时合入 main `e5c660ea076abfec4fde01616251915ffb2852eb` 的商场测试修复。绘图期间 #150 已合并，按 [#155 最新交接](https://github.com/xuys2025/escape-bincov/issues/155#issuecomment-6522262734) 改由后续 PR 承接；交付前已快进至 main `7d982a6fc5b4c849d9a3dc576074a01e17c2d052`，没有重写公共历史。

本批只交 `assets/gunsmith/incoming/m4-premium/` 和本目录的美术、预览与验证。正式清单及 652 张正式 PNG 保留，精品件的功能和正式导入仍由实现方接入。

## 交付与审图

- [本批清单](incoming-manifest.json)（接入后从 `assets/gunsmith/incoming/m4-premium/manifest.json` 移来）：20 件 J01–J20，17 张通用 H、20 张 I、20 张 W、20 张 Q24；另有 J07 卡宾 H 与精工件坯 Q24。
- [图标总览](preview/icons-overview.png)：1 倍、3 倍及灰度 1 倍；[三底色图标](preview/icons-three-backgrounds.png)。
- 和普通参照件并排：[H 持枪](preview/h-reference-comparison.png)、[I 背包](preview/i-reference-comparison.png)、[W 工作台](preview/w-reference-comparison.png)、[Q24 图标](preview/q24-reference-comparison.png)。每格左边是参照件，右边是精品。
- [二十把枪的代表组合](preview/representative-assemblies.png)：每行 H／I／W；[配置树](representative-configurations.json)。

预览直接由交付 PNG 按整数坐标拼成，是**素材预览，不是游戏截图**。成品 PNG 透明底，不含文字、底板、阴影、光晕或抗锯齿。

## 数量与接口

任务书的 78 张主体包括 20×4−3 张配件图和 1 张件坯图。J11、J14、J18 按约定不画 H。

额外的 `gs-j07-h-carbine-v1.png` 是任务书允许的适配变体：普通 M07 在卡宾上已有专用 H 图，`anchor [0,1]`、`tip [8,1.5]`；通用 M07 的 H 为 `anchor [0,0]`、`tip [8,1]`。两个版本分别照各自参照件保留，否则卡宾的枪口对齐会改变。这是一个精品件的两种接口图，不是新增配件。

所有参照件的画布大小、`anchor`、`mounts`、`tip`、`hand`、`beam` 和层序均逐项保留，没有需要实现方调整尺寸的例外。J12、J15 的 `under`、`side1`、`side2` 全部保留，装上 J04 前握把、J05 组合器时，手位和出光点随原接口走。图上的接口像素也保留原值，包括发光口和部分浅色挂点；其余 UI 外轮廓使用单像素墨线。

## 精工系列画法

整套采用同一个小黄铜铆点，位于零件左上方的非接口材质面：H／I／Q24 为 1×1，W 为 2×2。H 用世界色板的 `#ab9370`，UI 用 `#c09a55`。它是材质铆点，不是字标或徽章。每张图的准确位置记录在 [设计记录](design-records.json) 的 `mark` 字段。

每件重新描形，不只换颜色。**78 张配件图（含卡宾变体）的透明轮廓都与其普通参照件不同**，并保留了窗口、支撑框、冷却槽或握持面的结构差异：

| 配件 | 结构特征 |
| --- | --- |
| J01–J03 瞄具 | 加强的阶梯护罩、开放视窗、双鞍座或微型保护框 |
| J04 前握把、J11／J14 后握把、J18 握片 | 斜面掌托、内嵌包胶、防滑纹、分开的握片结构 |
| J05 组合器 | 双开口外壳、切面与内嵌开关区；不画实际光束 |
| J06–J09 枪口件 | 肩部接环、分级端盖、不同数量的冷却槽或侧向收束口 |
| J10／J13／J16／J17／J19／J20 枪托 | 镂空撑架、阶梯肩垫、伸缩双杆、下部让位切口或可调托腮架 |
| J12／J15 护木 | 长散热窗、前端加强筋、规整导轨齿；所有子挂点保留 |

W 在自己的原生尺寸上单独绘制端盖、螺丝／铆点、导轨和握持纹理，20 张均与 I 最近邻放大结果不同。全部单件最多 7 色。21 张 Q24 的彩色、透明轮廓和灰度结果各自互不相同。

精工件坯是有阶梯毛面、局部铣槽和定位销的金属半成品，`gs-premiumblank-q24-v1.png`，`item: premiumBlank`、`role: icon`；不会看成已经完成的瞄具、枪托或握把。

## 实际验证

| 检查 | 结果与范围 |
| --- | --- |
| [独立美术检查](validation.json) | **615/615**：数量、文件、SHA、字节、尺寸、原稿重放、二值 Alpha、色板／色数、参照接口、结构差异、统一铆点、轮廓与无孤立像素、Q24 唯一／灰度、W 独立细化、正式 652 图锁定 |
| [真实拼装器演练](runtime-layout-check.json) | **87 组适配、261 份布局**；每件至少有合法适配；尺寸、枪口、手位、出光点与参照件拼装一致，组合限色及接缝检查通过 |
| J12／J15 子挂点 | **9 份 H/I/W 组合**：M4A1、AK-74、AK-103，护木同时装 J04 和 J05，位置／手位／出光点正确 |
| 二十枪代表组合 | **20 把 × H/I/W**，合法配置、尺寸和组合限色通过；素材预览已输出 |
| `pnpm test` | **1113/1113** |
| `pnpm check:ci` | **139/139** |
| `pnpm package` | **通过**；便携 ZIP 6,111,771 字节，仅记录实际大小 |
| `pnpm test:gunsmith-bench` | **20/20**；验证既有正式素材，精品图接入后的游戏验收仍待实现方补齐 |

拼装演练只在单个进程中注入本批元数据，调用实际 `validateBuild`、`gunSize`、`gunArtLayout`；原有虚拟 I 图使用未改动的既有原稿。它验证素材接口和组合，不代替正式导入、游戏 UI 或真人视觉签收。

首轮检查曾发现瞄具底座、细斜撑和肩托切口留下孤立像素，已修正；发光口和挂点保留参照件原色，外轮廓校验明确列出这些接口例外。[首轮记录](source/first-validation-failure.json)保留，没有降低限色、连接或尺寸要求来放行绘图缺陷。

仓库检查使用 Windows、Node 24.22.1、pnpm 11.25.0，复用已有依赖，只在检查进程设置 `pnpm_config_verify_deps_before_run=warn`；未安装依赖、未改项目配置，构建产物未提交。准确日志／产物哈希见 [repository-checks.json](source/repository-checks.json)；浏览器回归与远端 CI 以本次 PR 的准确 head 记录为准。

## 原稿与复现

- [逐件设计](source/design.mjs)、[原生绘图与导出](source/draw.mjs)、[完整 RGBA 原稿](source/pixel-artwork.json)、[正式图基线锁定](source/baseline-lock.json)。
- [内置 image_gen 提示词与调用记录](source/generation.json)：8 次调用、8 次成功，生成七类结构参考和一张件坯参考。源图保存在本目录的 source 下，最终 H/I/W/Q24 在原生整数网格分别制作，未将高分辨率参考图缩小当作运行图；未使用 CLI/API 回退。

在仓库根目录用 Node 24 运行：

```text
node docs/gunsmith/art/m4-premium/source/draw.mjs
node docs/gunsmith/art/m4-premium/validate.mjs
node --import tsx docs/gunsmith/art/m4-premium/source/check-runtime.mjs
```

## 交接

实现方在本批后续 PR 内审图并续作，导入这 79 张 PNG，更新正式清单／导入模块和对应素材数量，移除精品件占位图与 `ART_PENDING` 例外，再补工作台、背包、持枪和图标在两档桌面下的游戏截图。原 PR #150 已合并；本批没有向已结束的 PR 继续推送。J07 卡宾 H 变体和 J12／J15 子挂点应随主体一起接入。

本次不修改正式运行图、游戏规则、存档、精工定制成本或经济平衡；没有合并或部署。维护者视觉签收与正式接入后的游戏验收仍待完成。

## 接入（`feat/gunsmith-premium-art`）

2026-10-30 实现方另开接入 PR（本批 #157 按维护者分工只交素材）：79 张图进正式目录，正式清单第 9 版，731 张、112,401 字节；本批清单移到 [incoming-manifest.json](incoming-manifest.json)。精品件在持枪、背包、工作台和图标里都画这批图，J07 装在卡宾上用卡宾专用图；占位画法和目录门禁的例外已删。规则见 [CONTRACTS「老栓精工（M4-09）」](../../CONTRACTS.md#老栓精工m4-09) 的「美术」，游戏截图见 [evidence/m4-premium](../../evidence/m4-premium/)。
