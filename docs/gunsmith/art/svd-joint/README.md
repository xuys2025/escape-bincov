# SVD 接缝修图交付

2026-10-29，按 [BRIEF](BRIEF.md) 交付 **3 张透明 PNG，共 1,079 字节**。基线为 main `d60e7c0db6e2783244422736656bc571edc0d879`，分支 `art/svd-joints`。说明 PR [#147](https://github.com/xuys2025/escape-bincov/pull/147) 已合并；本次是 [#80](https://github.com/xuys2025/escape-bincov/issues/80) 的新图交付，独立承接，不续写已合并的分支。

只交暂存图和本目录的原稿、预览与自查。正式清单及 636 张正式 PNG 均未改；新图尚未接入游戏。

## 成品

| 文件 | 尺寸 | 色数 | 字节 | 改动像素 |
| --- | --- | --- | --- | --- |
| [I v3](../../../../assets/gunsmith/incoming/svd-joint/gs-svdb-receiver-i-v3.png) | 92×18 | 8 | 330 | 12 |
| [W v3](../../../../assets/gunsmith/incoming/svd-joint/gs-svdb-receiver-w-v3.png) | 184×36 | 9 | 560 | 51 |
| [H v2](../../../../assets/gunsmith/incoming/svd-joint/gs-svdb-receiver-h-v2.png) | 37×10 | 6 | 189 | 7 |

[本批清单](../../../../assets/gunsmith/incoming/svd-joint/manifest.json) 逐张记录 `replacesSha256`：I/W 替换正式 v2，H 替换正式 v1。全部颜色来自各自原图，没有新增颜色。

I/W 用原有木色、金属色填实枪托—机匣、机匣—护木、护木—枪管之间的内部墨线，外轮廓不动。H 的枪托及枪管也存在同类断接，因此补 7 个像素；H 的机匣与护木原本已有实色通路，护木上方的通风孔保留。

地面和 HUD 武器卡通过 `src/art/gunsmith-compose.ts` 的 `side()` 使用去手套的 H 原厂组合；SVD 共用这张 H 机匣，无须另画 bare 图。这里交付 H v2 后，由实现方接入时同时修正三处用途。

## 视觉自查

- [深色底前后对照](preview/before-after-dark.png)：W/I 6 倍，H 8 倍。
- [深／中／浅三底色](preview/contact-three-backgrounds.png)：原生 1 倍及整数 3 倍。
- [H 在地面／HUD 底色上的前后对照](preview/held-ground-hud.png)：无手套侧视图。

以上是直接按原生 PNG 生成的素材预览，**不是游戏截图**。成品 PNG 不包含底色、文字或放大采样。

## 坐标与像素保留

| 输出 | top | bipod | muzzle | tip |
| --- | --- | --- | --- | --- |
| I | [36,0] | [73,7] | [91,5] | [92,6] |
| W | [72,0] | [146,14] | [183,10] | [184,12] |
| H | [15,0] | [29,4] | [36,2] | [37,3] |

H 的 `grip [13,5]`、`hand [24,5]`、`bore 3`、`forward 0` 保留。三张图的 Alpha 逐像素相同；只把 70 个原有墨色像素换成原色板里的实色。I 的弹匣及供弹口保留区为 `[37,10,18,8]`，W 为 `[74,20,36,16]`，H 为 `[14,6,6,4]`（x、y、宽、高），与旧图逐像素一致。

[40 项自查](validation.json) 包括清单、尺寸、哈希、色数、二值透明、全部坐标、未编辑像素、弹匣和枪口列、I/W 外轮廓、636 张正式图锁定，以及排除墨色后的四邻域实色连通检查。旧版 I/W 三处连接均不通，新版全通；旧版 H 的枪托和枪管不通，护木已通，新版三处全通。

## 原稿与复现

[内置 image_gen 的完整提示词与调用记录](source/generation.json)，调用 1 次并成功，得到[连接效果参考](source/joint-treatment-reference.png)。工具输出改变了栅格尺寸和色阶，因此没有直接拿生成图替换运行图；按参考的连接效果在原生网格收尾，所有改色位置可在 [edits.json](source/edits.json) 逐像素核对。未使用 CLI/API 回退。

在仓库根目录用 Node 运行：

```text
node docs/gunsmith/art/svd-joint/source/finish.mjs
node docs/gunsmith/art/svd-joint/validate.mjs
```

`finish.mjs` 从正式旧图导出暂存图和预览，`validate.mjs` 独立检查实际 PNG 与基线。正式接入由实现方按 `replacesSha256` 搬到 `v1/`、更新正式清单和导入模块，再验收游戏内画面；本交付不改变存档、规则、离线依赖或发布版本。

## 实际验证与交接

| 检查 | 结果 |
| --- | --- |
| `node docs/gunsmith/art/svd-joint/validate.mjs` | 40/40 |
| `pnpm test` | 1082/1082 |
| `pnpm check:ci` | 139/139 |
| `pnpm package` | 通过；类型检查、离线构建与两种 ZIP；便携包 6,101,796 字节 |

使用 Node 24.22.1、pnpm 11.25.0（本机现有版本），复用本机已有依赖；只给检查进程设置 `pnpm_config_verify_deps_before_run=warn`，没有安装依赖或改项目配置。生成物未提交。命令记录、日志哈希与构建产物哈希见 [repository-checks.json](source/repository-checks.json)。远端 CI 以本 PR 准确 head 的实际状态为准。

新图未被正式构建消费，游戏内的 1280×720、1920×1080 截图及视觉签收留待接入后完成。本次未运行浏览器游戏验收、未合并、未发布。
