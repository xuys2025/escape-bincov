# 给 Sol：城中村可玩样板验收清单

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
