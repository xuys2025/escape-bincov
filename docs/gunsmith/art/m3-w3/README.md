# 弹匣实长重画 · M3-W3

2026-10-29，按 [BRIEF](BRIEF.md) 完成 **19 件、38 张 I/W 新版 PNG，共 6,448 字节（6.30 KiB）**。承接 [PR #132](https://github.com/xuys2025/escape-bincov/pull/132)，分支 `feat/gunsmith-m3`；工作起点 `ec1b39b42b200b6865dc0a3e4c0b48bd290a25f2`，本次 fetch / ls-remote 核实的 main 为 `275fafd77b1574938ecc0409ab405b77850359c1`。

推送前按 brief 再次 `git pull --rebase`，同步到 `94b7e5cf5f776e34908425a528d6156fdfba5d86`（原分支合入室内墙显示改动）。下表单测、CI 脚本和打包均在这个同步后的代码基线上重新运行。

只交付 `assets/gunsmith/incoming/m3-w3/` 和本目录。正式清单、636 张正式 PNG、全部 H/Q、枪身长度、锚点、挂点和枪口坐标保留。素材尚未接进游戏；维护者与 Opus 先审预览，再由 Opus 接入并验收游戏画面。

## 审图入口

- [同枪弹匣并排总览](preview/magazine-overview.png)：I 2 倍、W 1 倍，同一枪的各套配置按同一机匣原点对齐。
- [逐件三底色](preview/contact-color.png) · [灰度](preview/contact-gray.png)。运行 PNG 透明底，底色和文字只存在于预览。
- 下表 18 张对照逐一对应任务书第 3 节；每张含原图、新图和实际 36×26 的占格线，I 用 2 倍、W 用 1 倍。含斜线的三行各展开两套，共 **21 套配置、42 份 I/W 拼装记录**。所有预览都是按清单锚点拼装的素材预览，**不是游戏截图**。

| 枪与弹匣 | I 露出高度（目标） | 前后对照 |
| --- | --- | --- |
| M4A1 原厂 / G10 | 14 / 14（14） | [第 1 行](preview/01-mb4a1-g10.png) |
| AK-74 原厂 | 16（16） | [第 2 行](preview/02-akb74-factory.png) |
| AK-74 G08，45 发 | 22（22） | [第 3 行](preview/03-akb74-g08.png) |
| AK-103 原厂 | 17（17） | [第 4 行](preview/04-akb103-factory.png) |
| AK-103 G09，弹鼓 | 19（19） | [第 5 行](preview/05-akb103-g09.png) |
| MP5 原厂 / G03 | 14 / 14（14） | [第 6 行](preview/06-mpb5-g03.png) |
| UMP45 原厂 | 15（15） | [第 7 行](preview/07-umpb45-factory.png) |
| UMP45 G04 | 19（19） | [第 8 行](preview/08-umpb45-g04.png) |
| AUG 原厂 / G10 | 12 / 12（12） | [第 9 行](preview/09-augb-g10.png) |
| M14 原厂 | 9（9） | [第 10 行](preview/10-mb14-factory.png) |
| M14 G11 | 13（13） | [第 11 行](preview/11-mb14-g11.png) |
| SVD | 7（7） | [第 12 行](preview/12-svdb-factory.png) |
| RPK 原厂，40 发 | 21（21） | [第 13 行](preview/13-rpkb-factory.png) |
| RPK G12，轻匣 | 18（18） | [第 14 行](preview/14-rpkb-g12.png) |
| RPK G09，弹鼓 | 19（20） | [第 15 行](preview/15-rpkb-g09.png) |
| Vector | 8（8） | [第 16 行](preview/16-vb9-factory.png) |
| G17 G01 | 10（10） | [第 17 行](preview/17-gb17-g01.png) |
| M1911 G02 | 4（4） | [第 18 行](preview/18-mb1911-g02.png) |

RPK 与 AK-103 共用 G09，所以 RPK 的露出高度比参考少 1 个 I 像素，W 少 2 个；均在任务书允许的 ±2 I 像素内。无缺件、无新增枪型变体、无挂点调整。

## 画法与接入

八件原厂弹匣和 G01、G02、G03、G04、G08、G09、G10、G11、G12 均出 `-v2`，每条记录 `replacesSha256`。AK/RPK/MP5 明显向前弯，M4A1/AUG 微弯，UMP/M14/手枪加长匣保持直匣；G09 是圆鼓加短颈。G02 按握把底露出 4 像素重新画短，没有为了占两行而把它硬拉长。

SVD 和 Vector 的弹匣在机匣图里：仅修改 [design.mjs](source/design.mjs) 中的 `mask` 区域，其余原像素逐一保留，画布只向下增加。SVD I/W 的改动范围分别为 `[37,11,15,7]` / `[74,22,30,14]`，Vector 为 `[30,10,12,8]` / `[60,20,24,16]`（x、y、宽、高）；所有挂点和 `tip` 不动。

W 在自己的最终分辨率上收 1 像素边，另画压筋、观察孔、底板和金属高光。19 件逐一排除了 I 的最近邻放大。M14 的旧机匣木护面底沿没有墨线，首轮检查发现接口不清楚，已在新弹匣的第一条露出行补单条墨线；MP5/UMP 顶部连接区共用机匣原有墨线，避免出现双线。G01 和 AUG 保留进入握把/机匣部分的旧像素，向下续画。

暂存清单是 [manifest.json](../../../../assets/gunsmith/incoming/m3-w3/manifest.json)。Opus 接入时按 `replacesSha256` 替换对应 I/W，保留 H/Q 与坐标。正式 98,932 字节加本批为 105,380 字节，这是两个图包同时存在的总数；接入替换后需要重算正式体积。

## 原稿与复现

- [逐输出造型和尺寸](source/design.mjs)、[绘图导出](source/draw.mjs)、[完整 RGBA 画稿](source/pixel-artwork.json)；像素工具沿用第二波的本地实现。
- [锚点拼装器](source/assemble.mjs)、[拼装记录](assembly-records.json)、[正式图锁定](source/baseline-lock.json)。
- [工具调用记录与完整提示词](source/generation.json)：内置 image_gen **调用 1 次、成功 0 次**，参考图请求被工具以 `moderation_blocked` 拒绝；没有生成参考图，也没有切到 CLI/API。38 张运行图全部来自原生整数像素画稿。

在仓库根目录运行（Node 24）：

```text
node docs/gunsmith/art/m3-w3/source/draw.mjs
node docs/gunsmith/art/m3-w3/source/assemble.mjs
node docs/gunsmith/art/m3-w3/validate.mjs
node --import tsx docs/gunsmith/art/m3-w3/source/check-runtime.mjs
```

## 实际验证与交接

| 检查 | 本次结果 |
| --- | --- |
| [独立美术校验](validation.json) | **103/103**：38 图与清单、字节、哈希、宽高、二值 Alpha、单件/组合限色、坐标、原稿重放、全部组合尺寸和露出高度、连接与单线接口、636 张正式图锁定 |
| [项目实际拼装器](source/runtime-layout-check.json) | **21 套合法配置、42/42 I/W 布局与独立记录一致**；实际 `gunSize` 符合 brief 占格；20 把枪的 H 布局保留 |
| `pnpm test` | **1076/1076** |
| `pnpm check:ci` | **110/110** |
| `pnpm package` | **通过**；类型检查、构建、离线打包；便携 ZIP 6,100,696 字节，只报实际大小，不提交产物 |

本机使用 Node **24.19.0**、pnpm **11.25.0**（现有运行时，和仓库标注的 11.19.0 不同）。共享 `node_modules` junction 导致 pnpm 首次想自动安装并报 `ERR_PNPM_UNSAFE_MODULES_DIR`，未安装/删除依赖；按上一波已有方式，仅对检查进程设置 `pnpm_config_verify_deps_before_run=warn` 后重跑通过。项目配置未改。[命令与日志摘要](source/repository-checks.json)记录准确环境和产物哈希；[环境首败](source/pnpm-environment-first-failure.txt)、[美术首败](source/first-validation-failure.json)保留。

待验：维护者/Opus 的视觉签收；正式接入后仓库、背包、交易区和工作台在 1280×720、1920×1080 下的游戏截图。此次没有把暂存图写进正式游戏，浏览器游戏验收不在本批运行。GitHub CI 以本 PR 准确新 head 的实际状态为准，本地通过不代表远端通过。PR 保持 Draft，未合并、未上线。
