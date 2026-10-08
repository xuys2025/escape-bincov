> 2026-10-09 Sol R6当前独立验收：从14abea3接手，[报告](sol-r6-20261009/README.md)。总体PARTIAL；样板首轮46/48、顺序48/48，233单测及20套回归通过。R6-V2音频本机自动PASS，R6-V3玩家完整倒地两模式自动PASS；生命周期两尺寸各4/4与新缓存/落幕资源20/20。F20仍PARTIAL，各采样口径和正增长保留；穿墙摆位因果链已确认，但ASTRA-SAVE-01历史个案仍未确认。真机真人R6-V5等待实际设备及人员。下方历史报告保持原样。

# 给 Sol：城中村可玩样板验收清单

> 2026-10-09 第六轮（Opus 前端体验整改）：样板门禁增至 **48 项**（新增 V06 战斗反馈、V06b 指向标、V07 空气无状态、V08 箱盖与门、V09 玩家倒地落幕；补充修复后又加 U11 物品名不截断、U12 拖动影子跟随鼠标且面板不出滚动条）；单测 233 项；`coast-audio-test.mjs` 仍为 14/14，其中 E2 改为按电平判断（原因见报告）；`coast-sample-shots.mjs` 的 window 场景摆放已改为合法位置。复验项按 [任务清单](opus-experience-20261009/gpt-tasks.md) 第一节（R6-V1 至 V5）执行。

> 2026-10-08 Sol 已从 `bf099cc` 完成限定签收：**OPUS-DEATH-01 敌人路径PASS**，原真实死亡检查及 **36/36** 门禁、两尺寸生命周期各4/4、原20套浏览器回归通过。玩家完整倒地不在本次范围，OPUS-DEATH-02待排期；F20仍PARTIAL、ASTRA-SAVE-01仍未确认。见[当前签收报告](sol-death-20261008/README.md)。下方97c0b44及早期轮次为历史记录，不覆盖本次结论。
>
> 2026-10-08 声音：新增 `node scripts/coast-audio-test.mjs`。它在输出端采样，不加自动播放参数，期望 14/14；验收时请看 `audio-waveforms.png`，确认起音与事件对齐。见 [声音报告](opus-audio-20261008/README.md)。
>
> 2026-10-08 第五轮（Opus 真人试玩整改）：试玩入口改为仓库根目录的 `城中村试玩.html`；样板门禁增至 **37 项**（新增 V05：握持、地面物品、撤离圆弧、搜刮停靠）；新增 `scripts/coast-playtest.mjs`（真实键鼠全流程）和 `scripts/coast-launcher-check.mjs`。第二批图片规格见 [sol-art-requests](opus-playtest-20261008/sol-art-requests.md)。
>
> 2026-10-08 OPUS-DEATH-01 已在本地提交修复：样板门禁增至 **36 项**（新增 V03/V04 两种素材模式的真实死亡倾倒、隐藏房间、重建与读档检查）。请按 [Opus 定向复验说明](opus-death-20261008/README.md) 第五节复验；玩家自身死亡只作为边界观察，不登记为倒地已验收。
>
> 2026-10-08 当前复验基线为 `97c0b44`。按 [Astra 生命周期签收标准](astra-lifecycle-20261008/README.md)分别填写生命周期 PASS/FAIL 与 F20 PASS/PARTIAL/FAIL；严格结果页、基地三次GC、独立重复和普通对照不得混为一个口径。当前工程期望为224项单测、样板32项、17场景×4尺寸68张截图；地图/阅读等预期面板按场景判断。下文早期结果/5轮存档检查保留作历史，前序执行见 [Sol首轮报告](sol-acceptance-20261008/README.md)。
>
> 首批43 PNG已正式接入；背向缩短、保留镜像、无需下蹲补图的当前要求见 [素材需求状态](sol-round4-20261008/material-requirements.md)。本轮真实死亡路径仍发现倾倒未生效，交Opus；ASTRA-SAVE-01继续未确认，不以未复现或驱动修复关闭。实际证据及遗留见 [本轮报告](sol-round4-20261008/README.md)。

对象：本地分支 `docs/coast-2-5d-art-design` 上的样板接线提交（见 [COAST-SAMPLE-VIEW.md](../COAST-SAMPLE-VIEW.md)）。请在**实际接线提交**上运行。凡是 Opus 已跑过的项，本清单都注明了结果文件，可直接复核；表中写“未运行”的，不能记为通过。

## 0. 准备

```bash
pnpm install --frozen-lockfile        # 新增依赖 pixi.js 8.22.0（精确版本）
pnpm test                              # 期望 223 项通过
pnpm package                           # 重新生成两份 HTML、两份 ZIP 与 docs/release-manifest.json
```

- 核对生成物与提交是否一致：`git diff --exit-code -- dist/index.html "start the game.html"`。
- 核对 `THIRD_PARTY_NOTICES.md` 已含 PixiJS、@pixi/colord、earcut（ISC）、ismobilejs、parse-svg-path，且这些声明已内嵌进 HTML 头部注释。

## 1. 复跑 Opus 的样板检查（必须）

| 命令 | 期望 | Opus 结果 |
| --- | --- | --- |
| `node scripts/coast-sample-test.mjs` | 17/17 通过，0 页面错误，0 外部请求 | 通过（`docs/coast-sample-view/report.json`） |
| `node scripts/coast-sample-shots.mjs` | 48 张截图，`index.json` 中每张 `phase=running`、`panel=null`、`storageError` 为空 | 通过（`docs/coast-sample-view/shots/`） |
| `node scripts/coast-sample-measure.mjs` | 记录本机数据，同时注明设备、浏览器、DPR | 已记录（`docs/coast-sample-view/measure.json`） |

截图脚本里那次未复现的「存档保存失败」面板：请用同一脚本至少再跑 5 次，统计 `index.json` 中的异常。如果复现，保留当次的 `test-results/coast-sample/shots/index.json` 和截图交回 Opus，并附上浏览器 Console 记录。

## 2. 原回归（共享入口被改动，必须跑）

`test:browser`、`test:desktop-input`、`test:save-browser`、`test:buildings`、`test:mobile`、`test:mobile-ux`、`test:portable`、`test:ui`、`test:loot`、`test:expansion`、`test:qol-expansion`、`test:systems`。

- Opus 在本机跑过的结果见 `docs/coast-sample-view/verification.json`。
- 新增依赖增大了包体，请特别留意 `test:portable` 的 ZIP 内容与哈希、`test:ui` 的双尺寸截图。
- 另请按 CI 实际清单补跑 `test:art`、`test:tactical`、`test:title`、`test:title-water`、`test:mall-passages`、`test:mall-landing`、`test:qol`、`test:loot-target`（Opus 未运行）。

## 3. A01 边界用例（Opus 未运行，请执行并登记）

| 用例 | 在样板上的做法 | 关注点 |
| --- | --- | --- |
| F01 | 用旧 v1 / coast-v1 存档经原解码路径恢复后，以 `?sample=village` 进入居民楼行动 | 只有 coast-buildings-v1 的行动挂样板；经典行动仍走 RaidScene |
| F05 | 撤离时按住 E 并有移动意图、受击中途松开 | 进度归零；移动意图即使位移为 0 也打断 |
| F06 | 同名箱子、尸体与箱子相邻、滚轮切换 | 目标列表编号；实际搜刮目标与提示一致 |
| F08 | 沿窗、矮物、门缝射击；经典水域不适用（样板只开居民楼世界） | 窗/矮物不出现阻挡火花；子弹被前方墙体遮住 |
| F12 | 换层时来源层有在途子弹；目的落点被占 | 来源层火花不出现在目标层；落点无效时不换层 |
| F14 | 搜刮满包、部分拿取、背包丢弃，分别注入写入失败 | 失败后物品与世界一致回滚，界面只出失败提示 |
| F16 | 打开背包/搜刮时失焦、`pagehide`、切到后台再回来 | 回来后为暂停面板，原按住的键需重按 |
| F18 | 刷新恢复与换层在同一秒内连续发生 | 视图只重建一次，不串图 |
| F19 | DPR 1/2/3、非整数缩放、安全区（刘海屏横屏） | 准星、枪线、提示位置对齐 |
| F20 | 完整进出 20 次：出击 → 撤离或放弃 → 基地 → 出击（交替二楼/地下层） | 每轮结束后 `__bincovSample.counts()` 中 apps / views / listeners / tickers / renderTextures 归零；JS 堆在 GC 后不持续增长 |
| F21 | 断网打开两份 HTML 与便携 ZIP，加 `?sample=village` 走完一局 | 0 外部请求；不带 `test` 时没有 `__bincovSample` |

## 4. 画面信息边界（与 Opus 共同签收）

- 屋顶或楼板未揭示时，室内的敌人、物资、尸体、枪口火、火花、血迹、灯光都不出现。
- 被遮挡的轮廓只给逻辑可见的人物，不给未揭示房间里的人物。
- 样板范围外是通用占位画面，HUD 有标注；这部分不纳入城中村画面验收。

## 5. 素材（本轮不批量制作）

- 按 Opus 原型 `docs/07-给Sol-素材需求变更.md` 第 4 节只交首批试样：player 五方向 × 站立加步行 5 帧、一套墙体、6 块地面、carbine 1 件。
- 试样接入由 Opus 完成。Sol 交付 PNG 与 `manifest.json`，不要直接改 `src/coast-view/art/*` 的程序占位绘制。

## 6. 回报格式

请回报以下内容：精确提交 SHA、生成物哈希、每条命令的结果（通过 / 失败 / 未运行 / 环境阻塞）、失败截图与日志路径、设备/浏览器/DPR、未运行项及原因。真机与真人试玩（G12）另行登记，不能用模拟结果代替。
