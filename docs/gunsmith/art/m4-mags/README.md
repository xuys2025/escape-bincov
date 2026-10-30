# 原厂弹匣图标与 SVD／Vector 分层交付

2026-10-30，按 [BRIEF](BRIEF.md) 交付 **22 张透明 PNG，共 3,833 字节**。承接 [PR #150](https://github.com/xuys2025/escape-bincov/pull/150)（`feat/gunsmith-m4`）及 [#142](https://github.com/xuys2025/escape-bincov/issues/142)。任务起点 `0e9f8b3439166716ae3c8335a4f6fd0cb362b998`；开工 fetch 核实 main 为 `8a4b46e4942402ed83487aa8fa27ee6169a9fc65`，#149 已合并且接缝图已经正式接入。

本次使用独立本地美术工作树，普通合入该 main，保留 M4 与 SVD 双方记录和源码。只新增本批暂存图及美术交付材料；本批图未写进正式目录、正式清单或游戏功能。

## 成品与预览

- [本批清单](incoming-manifest.json)（接入后从 `assets/gunsmith/incoming/m4-mags/manifest.json` 移来）：10 张 24×24 原厂弹匣图标、6 张无弹匣机匣、6 张独立弹匣层。
- [图标总览](preview/icons-contact.png)：原生 1 倍、整数 3 倍、深／中／浅三底色，以及 1 倍灰度。
- [SVD 前后及重合](preview/svdb-split-reassembly.png) · [Vector 前后及重合](preview/vb9-split-reassembly.png)：原图、拆下弹匣、回装，以及独立弹匣层。

预览直接由交付 PNG 拼成，是素材审图，**不是游戏截图**。成品透明底、Alpha 仅 0/255；无文字、阴影、底板、标志或抗锯齿。

### 十张独立图标

均命名为 `gs-<gun>-mag-q24-v1.png`，`item` 为 `<gun>-mag`、`role` 为 `icon`、`output` 为 `icon24`。十张共 **1,449 字节**，每张 4～6 色，四边至少留 2 像素透明区，单像素墨色外轮廓。

| 枪型／gun | 图标的辨识形状 |
| --- | --- |
| MP5／mpb5 | 窄钢匣，下段逐渐弯曲，单条压筋 |
| UMP45／umpb45 | 直身聚合物长匣，厚底板和观察孔 |
| AK-74／akb74 | 窄弯匣，橄榄色双筋 |
| AK-103／akb103 | 更宽、更急的深色弯匣 |
| M4A1／mb4a1 | 上段较直、下段轻弯的钢匣，双筋 |
| AUG／augb | 紧凑浅弯橄榄色匣，观察窗 |
| M14／mb14 | 宽短方形钢匣，平底、双筋 |
| RPK／rpkb | 修长弯匣，棕色胶木与长筋 |
| SVD／svdb | 矮宽钢匣，略斜前缘和面板筋 |
| Vector／vb9 | 更窄的直身深色匣，薄底板和观察孔 |

图标在 24×24 网格独立描形和细化，未将 I 层居中充数。十张透明轮廓与十张灰度图均互不相同。

### 六组分层

每组先画弹匣，再画机匣，沿用 `REPLACED`／`ORDER` 的默认 `mag` 层序，不写 `aboveReceiver`。弹匣 `anchor` 全为 **[0,0]**，顶行与机匣保留的供弹口顶沿重叠一行。机匣的画布宽高和所有原坐标保留，只新增 `mag` 挂点；`replacesSha256` 对应下表的正式原图。

| 枪型／输出 | 正式原图 → 新机匣 | 新增 mag 挂点 | 独立弹匣尺寸 | 露出高度 |
| --- | --- | --- | --- | --- |
| SVD H | h-v2 → h-v3 | [14,5] | 7×5 | 4 |
| SVD I | i-v3 → i-v4 | [39,10] | 11×8 | 7 |
| SVD W | w-v3 → w-v4 | [78,21] | 22×15 | 14 |
| Vector H | h-v1 → h-v2 | [13,5] | 5×5 | 4 |
| Vector I | i-v2 → i-v3 | [31,9] | 9×9 | 8 |
| Vector W | w-v2 → w-v3 | [62,19] | 18×17 | 16 |

表中机匣文件前缀是 `gs-svdb-receiver-`／`gs-vb9-receiver-`；新弹匣为 `gs-svdb-mag-factory-{h,i,w}-v1.png`／`gs-vb9-mag-factory-{h,i,w}-v1.png`。露出高度不含重叠的一行；I/W 延续 M3-W3 实长。

SVD 的基础是已修好接缝的正式 I/W v3、H v2，接缝像素保留。Vector 保留既有正式图。枪口 `tip`、其余挂点，以及 H 的 `grip`、`hand`、`bore`、`forward` 均不改。独立弹匣直接转移原像素，不重画、不缩放；无弹匣机匣保留原画布。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| [独立美术自查](validation.json) | **164/164**：22 图哈希、字节、尺寸、原稿重放、限色、二值 Alpha、锚点；图标轮廓、边距、灰度与单物体；6 组坐标、像素保留与重合；正式 636 图锁定 |
| [六组逐像素重合记录](assembly-records.json) | **6/6，差异 0 像素**；含透明像素的完整 RGBA 相同；去掉弹匣层的负对照均与原图不同 |
| [真实拼装器演练](source/runtime-layout-check.json) | **8 份原厂布局＋8 份无弹匣布局**；涵盖 H 带手套、H 无手套侧视图、I、W；回装均 0 像素差异，默认层序正确，卸匣后无 mag 层 |

真实拼装器演练只在单个检查进程里注入本批元数据，没有修改正式清单或源码。这证明素材能按现有拼装器组合，不表示 SVD／Vector 的拆弹匣领域规则已经接入。

复现（仓库根目录，Node 24）：

```text
node docs/gunsmith/art/m4-mags/source/export.mjs
node docs/gunsmith/art/m4-mags/validate.mjs
node --import tsx docs/gunsmith/art/m4-mags/source/check-runtime.mjs
```

| 仓库检查 | 结果 |
| --- | --- |
| `pnpm test` | **1102/1102** |
| `pnpm check:ci` | **139/139** |
| `pnpm package` | **通过**；便携 ZIP 6,107,313 字节，仅记录实际大小 |
| `pnpm test:gunsmith-bench` | **20/20**；现有正式图组合、两档桌面／手机界面、拆装弹匣回归 |

检查在 Windows、Node 24.22.1、pnpm 11.25.0 上进行，复用现有依赖；只给检查进程设置 `pnpm_config_verify_deps_before_run=warn`，没有安装依赖或改项目配置。生成物未提交。浏览器使用正式运行图，不消费本批 incoming 图；不能以此代替新图接入后的游戏验收。命令、日志哈希和构建产物哈希见 [repository-checks.json](source/repository-checks.json) 与本 PR 留言；远端 CI 以准确 head 的实际状态为准。

## 原稿与图像工具

- [图标原生描形、分层坐标](source/design.mjs) · [导出脚本](source/export.mjs) · [完整 RGBA 原稿](source/pixel-artwork.json)。
- [完整提示词与调用记录](source/generation.json)：内置 image_gen 调用 10 次、成功 9 次。九张参考图保存在同一 source 目录，最终图标按原生 24×24 网格细化并限色。UMP45 参考请求被工具以 `moderation_blocked` 拒绝，未重试、未切换 CLI/API；该件使用仓库已有可编辑原生画稿的绘图方式制作。
- 弹匣分层来自正式原图的精确像素转移，没有对这六组运行生成式重画。

## 交接

实现方签收后，在原 PR #150 内按替换哈希导入，接入十个 `-mag` 物品图标及两把枪的拆弹匣规则，再补工作台、仓库、交易区和行动内的游戏截图。原厂弹匣层用 `anchor [0,0]` 压在机匣新 `mag` 点上，默认在机匣后画；移除时只去掉 mag 层。

本次交图不改领域规则、存档、经济平衡或离线依赖，不合并或部署。维护者视觉签收、正式接入和游戏内验收仍待完成。

## 接入（PR #150）

2026-10-30 实现方接入：22 张图按 `replacesSha256` 进正式目录（六张机匣换掉旧图，16 张新加），正式清单第 8 版，652 张、100,521 字节；本批清单移到 [incoming-manifest.json](incoming-manifest.json)。SVD、Vector 加了弹匣位，十把枪都能拆原厂弹匣；十个 `-mag` 物品用这批图标。规则和测试见 [CONTRACTS「拆下弹匣（M4-07）」](../../CONTRACTS.md#拆下弹匣m4-07) 的「美术接入」，游戏截图见 [evidence/m4-mags](../../evidence/m4-mags/)。
