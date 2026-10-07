# Sol 工程验证与首批试样交付 · 2026-10-08

既有工程门禁通过；A01 的 F20 堆趋势、前端功能补齐、PNG 接入和画面签收仍待处理。历史偶发「存档保存失败」在本轮五次完整截图中没有复现，不能标为已修复。全部原始命令结果、设备信息及文件哈希见 [verification.json](verification.json)，归属与未决项见 [defects.md](defects.md)。

## 基线与使用入口

- 接手路径：`D:\bincov\pr22-runtime`，原分支 `docs/coast-2-5d-art-design`，初始工作区干净。被测游戏源码提交：`cdfc965f3015bbf562cee63eb241e9fa6bf70753`。
- 最新远端 main：`841e8bbdfb070eada82537563dd1ab1b4801aea3`，已通过 `a829e9d` 合入本地任务历史。交付前再次查询 main 和 [PR #22](https://github.com/xuys2025/escape-bincov/pull/22)：main 未变，PR 开放，远端原 fork `LMX-323/escape-bincov` 仍为 `878f5633316a824960091f8f924c0ddd8dd78078`。
- [主线 CI & Pages](https://github.com/xuys2025/escape-bincov/actions/runs/37650616588) 对 `841e8bb` 成功。公开 Pages 的 HTML SHA-256 为 `3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754`，逐字节等于当前 main 的 HTML；Pages 是最新主线，尚未包含这个本地 Runtime 样板。
- 本轮样板请打开仓库 `dist/index.html?sample=village` 或 `start the game.html?sample=village`。本地 HTML SHA-256：`7b2c950cc22b888eb6ae34ca9d67c81e3de52fa9f8737d74b7cd82ecad436e17`，3,088,289 字节。两份 HTML、两份 ZIP 重新生成后与 `cdfc965` 一致；详见 [发布产物哈希](verification.json)。
- 本轮只改验证脚本、证据、试样和交接文档。`src/` 与游戏生成物没有改动；保留原任务历史，交付本地提交，不推送、合并或发布。

## 工程结果

运行环境：Windows 10 `10.0.19045`，i5-12400F / 12 线程 / 约 32 GiB RAM，RTX 3070（Chrome ANGLE / D3D11），Node 24.19.0，Corepack pnpm 11.19.0，Chrome 154.0.8037.98。手机尺寸属于浏览器模拟，真实设备与真人 G12 未运行。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 通过；锁文件无改动 | [机器登记](verification.json) |
| `pnpm test` | 223/223，0 失败 | [unit.log](evidence/unit.log) |
| `pnpm package` 与生成物 diff | 通过；HTML/ZIP/manifest 未改变 | [package.log](evidence/package.log)、[core.json](evidence/core.json) |
| 第三方声明 | PixiJS、@pixi/colord、earcut 3.2.4 的 ISC、ismobilejs、parse-svg-path 均在 notices 和 HTML 头部 | [机器登记](verification.json) |
| `coast-sample-test.mjs` | 17/17，0 页面错误、0 外部请求 | [sample-wiring.json](evidence/sample-wiring.json) |
| `coast-sample-shots.mjs` 五次 | 每次 48 张，共 240；异常/页面错误/外部请求均为 0 | 五份 `evidence/shots-N/index.json` |
| CI 的 20 项原浏览器回归 | 全部退出码 0 | [逐条命令登记](verification.json)、[regressions.json](evidence/regressions.json)、[日志目录](evidence/regressions/) |
| Runtime 补充边界 | 5/5 | [runtime-boundaries.json](evidence/runtime-boundaries.json) |
| 样板补充边界 | 初跑8组完成；F20资源计数通过，堆趋势专项复查未签收 | [sample-boundaries.json](evidence/sample-boundaries.json)、[lifecycle-gc.json](evidence/lifecycle-gc.json) |
| 同名目标与部分搜刮 | 2/2；真实 ID 与界面编号一致，真实写入失败回滚 | [target-loot-probe.json](evidence/target-loot-probe.json) |
| 商场实时时钟自动点击 | 修复后 3 局通过；首局 600.406 秒 | [layered-play-report.json](evidence/layered-play-report.json) |
| 首批 PNG 机械校验 | 43/43；玩家 25 帧哈希互异 | [assets/validation.json](assets/validation.json) |

20 项原回归为 browser、desktop-input、save-browser、buildings、mobile、mobile-ux、portable、ui、loot、expansion、qol-expansion、systems、art、tactical、title、title-water、mall-passages、mall-landing、qol、loot-target。使用同一已打包 HTML，未放宽既有断言。

## 存档异常与商场脚本

截图脚本增加了 Console、最后五条拒绝事件、`storageOK`、真实 `Storage.setItem` 写入结果、异常数量及独立输出路径。只记录写入大小和错误类型，不保存存档正文，也不改变写入结果。五次重跑中每张均为 `phase=running`、`panel=null`、`storageError=""`、`storageOK=true`，没有失败写入记录。第五轮「样板外」四尺寸截图保存在 [evidence/shots-5](evidence/shots-5/)，全部 240 张仍在本地 `test-results/sol-acceptance/shots-1..5/`。

真实 QuotaExceededError 注入分别验证了门、部分搜刮、丢弃、终局写入失败的回滚/暂停/重试；旧版存档、跨窗口保护的原回归亦通过。此前那一张失败截图没有当时的 Console 或写入异常，现有证据无法确定是浏览器写入异常、候选快照校验、修订冲突还是其他原因。Astra 接手未决诊断，Opus 协助保留宿主状态；不能以“没有复现”替代修复结论。

商场原脚本只检查瞄准点位于窗口内，会在 `(1028.0445, 202.9111)` 点击到 HUD 的“选择撤离点”，打开地图而停住导航。原生点击回放复现了这个问题。现改为 `document.elementFromPoint` 命中画布时才发送原生点击，记录被 HUD 遮住的瞄准次数；没有改地图、AI、行动时钟、导航路径或通过条件。三局结果：超时（600.406 s）、死亡（61.353 s）、撤离（30.435 s）；共发出 33 次画布点击、跳过 38 次遮挡点击，0 页面错误/外部请求。只说明脚本能完成原验收，不作为真人平衡或独立性能结论。

## A01 边界登记

| 用例 | 实际执行与结论 |
| --- | --- |
| F01 | 原解码路径恢复 profile v1 和 coast-v1，带 sample 参数仍走 RaidScene；居民楼样板与普通入口由 W00/W15/W16 验证。通过。 |
| F05 | Runtime 验证无位移的移动意图、受击、松开均归零；W12 原生 E 按住/松开及真实三秒结算通过。零位移情形为无渲染交互边界检查，未冒充真人墙边操作。 |
| F06 | 解码器验证过的同名双箱、相邻尸体 fixture；原生滚轮与 E 逐个命中三个真实容器 ID。同名后缀 1/2 已存在并与提示一致。通过。 |
| F08 | 实际 coast 地图的窗、矮物与开门射线不会产生 blocked；v1 视图的 range 移除不产生火花。前墙逐像素子弹遮罩与贴窗画面人工签收未完成，交回 Opus。 |
| F12 | 来源层在途子弹的提交/失败/重试由已有 Runtime 测试覆盖；无有效落点时状态、RNG、来源子弹不变；Pixi 丢弃来源层/旧 epoch 的火花。目的落点全面封死采用 headless 世界 fixture。 |
| F14 | 满包拒绝操作且不写盘；部分转移及丢弃实际 setItem 失败回滚。样板浏览器的部分拿取再重试为背包 1、箱内 2；部分数量经真实服务传入，界面尚无数量控制。 |
| F16 | 背包/搜刮分别注入 blur、pagehide、hidden，共六组；恢复为暂停，旧按键需释放重按。通过；后台事件为合成事件，非系统杀页真机。 |
| F18 | 换层后立即检查点和刷新；目标层/epoch 正确，换层重建一次，恢复新宿主首次重建一次，无串层。通过。 |
| F19 | DPR 1/2/3；1287×727 和 913×507，非整数 canvas 偏移与缩放；独立计算的瞄准角一致。通过；安全区用 CSS inset 模拟，物理刘海屏和枪线/提示人工签收未做。 |
| F20 | 20 次完整出击→真实楼梯→撤离/放弃→基地，二楼/地下交替；每轮 apps/views/listeners/tickers/observers/renderTextures 等归零。两轮强制 GC 后中后段平均堆增加约0.91/0.85 MiB，“不持续增长”条件未签收；并未确认为泄漏，交回 Opus/Astra 诊断。 |
| F21 | 两份 HTML 及新目录内解压的 portable ZIP，断网且无 test 参数，放弃一局→结算→基地；没有测试全局、外部请求。通过；原 W12 另覆盖成功撤离。 |

画面信息边界探针使用**脱离存档的 PublishedView fixture**。未揭示房间的角色/轮廓/武器/尸体/箱子/散落物/子弹均隐藏，枪口火、火花、受击粒子、灯光未新增；来源 stamp 火花被丢弃。但尸体生成仍创建 14 个血迹贴花。强制实际绘制后，将这些贴花隐藏做像素差分，当前屋顶下差异 **0 像素**。这是 Opus 的防御边界风险，尚未证实画面泄漏，见 [visibility-probe.json](evidence/visibility-probe.json)。屋顶淡化、墙边轮廓及完整视觉签收仍待 Opus。

本轮补充脚本初版有三处工具问题：瞄准相机尚未稳定即取样、结算后仅等 80 ms（宿主正常卸载延迟 400 ms）、Windows ZIP 解压使用了不支持的重载。调整等待/隔离视口/解压调用后重跑通过，913×507 单独复核也通过。原初版记录保存在 [sample-boundaries-first.json](evidence/sample-boundaries-first.json)，没有当作产品缺陷。满包 fixture 亦改用实际堆叠上限，未绕过存档校验。

## 测量与素材

样板性能单独运行，未同时跑其他 Playwright 脚本。1280×720、DPR1、AI 活跃、玩家射击，800 帧约 4.9 s：帧间隔 p50/p95/p99 为 6.1/7.8/9.0 ms；Runtime advance 为 2.3/3.9/4.4 ms；view present 为 1.0/1.5/2.0 ms。present 不含 GPU 完成时间，也不能推断手机表现。完整 [measure.json](evidence/measure.json) 含设备与 renderer。

F20 初轮 GC 后第6–10轮平均26,364,726 B、末5轮27,317,665 B，增加952,939 B。增加 CDP `HeapProfiler.collectGarbage` 后独立重跑20轮：对应均值24,902,247 B、25,794,765 B，增加892,518 B；结束再静置2秒并GC仍为26,067,537 B。两轮所有显式资源计数均归零。初版工具8 MiB的失控增长上限不能证明“不持续增长”，最终工具已移除该通过标准，将正增长登记为 partial 并返回非零。JS编译/缓存、Phaser基地和会话引用的贡献尚未分离，不能据此定性内存泄漏。见 [lifecycle-gc.json](evidence/lifecycle-gc.json) 与 [最终专项](evidence/lifecycle-final.json)。

最终专项第三轮完整20次再次归零，但对应堆均值25,031,833 B→25,972,347 B，增加940,514 B，静置后26,252,957 B；登记 `partial`，退出码1。三轮一致支持保留未签收状态，不声称内存条件通过。

首批交付严格为玩家 25 帧 + 墙体 11 个独立部件 + 地面 6 块 + carbine 1 件，共 **43 张 1× PNG**。目录、锚点、slot 对应、原图、提示词、裁切和 SHA-256 在 [assets/manifest.json](assets/manifest.json)；逐项 [规格说明](assets/README.md)。原图由内置 image_gen 制作，只进行确定性的切分、最近邻缩小、色板归并、Alpha 二值化和规格对齐。未制作敌人、死亡帧、第二批武器或更多环境素材，未接入游戏。

先交回 Opus，在“街口全景 / 门口 / 贴窗射击”实测脚底、五方向切换、镜像、墙段拼接、3×3 平铺、carbine 握持与枪口点。收到反馈前不扩量。

## 交接状态

本轮没有运行真机、真人 G12 或本地未推送提交的远端 CI；没有替 Opus 改前端布局/功能方案，也没有替 Astra 改 Runtime/SaveSession。工程证据和首批试样已经可评审；Opus 的功能、素材接入与视觉签收以及 Astra 的未复现存档诊断按缺陷清单承接。交付后停止，等待维护者安排下一步。
