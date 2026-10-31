# #83 市场剧情底层与 Opus 接入说明

2026-11-01，维护者指定当前 agent 做非前端表现，前端由 Opus 专家负责。[PR #168](https://github.com/xuys2025/escape-bincov/pull/168)，分支 `feat/story-market-83`，基线 main `8a28da9873e5188e13053f894e5b6bbb0ae10dc8`。#45 是已关闭的准备文档 PR；当前实现重新从最新主线建立分支。整个 #83 继续由同一实施 PR 承接，保持 Draft，直到表现与完整验收完成。未合并、未部署。

内容来自已接受的 [市场片段](../story/CH01-MARKET-SLICE.md)，范围为 `ch01-n01`、`ch01-n02` 和可选市场见闻。#164 的 G01–G04 扩充文稿与 #161 的任务节奏仍有各自 PR；这里不提前接入后续章节或其未合并规则。

## 已实现与边界

- `story.ts` 管永久见闻、小蔡已知事实、喊声选择、本局声音记录以及只读回顾。维修完成节点和供电由原 `repair` 派生。原交付仍扣 3/2/1、奖 420 一次；扩建仍扣 600，样本和船册不变。
- `story-dialogue.ts` 是批准的 18 个固定话题及条件，复用已接受文字；没有新增通用脚本解释器。关闭不等于暂不说；暂不说可改告诉，已告诉不可反悔。未检查总闸只能使用 unchecked 分支，不宣称找到父亲。
- `market-world.ts` 注册 `coast-story-v1 / market-layout-1`，沿用现有居民楼与市场碰撞。只有显式新出击启用；恢复原行动使用原世界/物资/计时。工具柜固定在 (28,37)，不被市场敌人或回收队搬走，43px 内初始普通掉落、箱子、敌人迁到同图合法位置。
- 确定补给在 `D.beginRun` 转移背包之前，统计仓库、背包、安全箱；按缺额占用原始 60 条来源中最先出现的 n 条普通非浅水记录，再归箱。专用柜始终存在；普通箱最多 `min(9, floor((20-n)/2))`，归箱来源≤20，地面来源≥40。样本/船册记录不变。原枪械材料转换、普通物资幸运增减产、敌人携带物规则保留；固定缺额柜本身不掷幸运，保证缺额为零时为空。
- 开柜、冷柜近距触发、总闸主动观察走实际 Runtime 的距离/视线/世界身份检查；线索、本局 cue、活动世界在一笔记录中提交。只有写入成功后产生 `story-cue`。回站前不能向小蔡报告，失败行动保留知识，实物仍按原安全箱/失败规则结算。

一项明确的语义决定：玩家选择“告诉喊声”且确实观察过总闸时，批准对白会亲口说“总闸拉下来了”。因此该明确选择同笔记录 `told` 和 `breakerReported`。这不是把观察自动当报告；unchecked 分支不记录总闸。之后小蔡的知情分支只读确实说过的事实。

## 存档契约

`escape-bincov.session.v2` 键保持不变，外层版本升到 **10**，新增必需 `story` 和 `storyBackup`。profile 仍为 v3，扩展和敌人版本各自保持原规则。没有新增剧情 localStorage 键。

v2–v9 先按各自原规则严格解码，再补空见闻与选择；只有已经完成 repair 才补两完成节点。真实 v9 原始字节保留一次到 `storyBackup`；v2–v8 的原字节已在原迁移备份中，避免再次嵌套。后续保存不重复嵌套，仍受原 2 MiB 上限约束。当前完整导出/导入包含剧情，未知字段、非法枚举、重复见闻、报告无观察、告诉无喊声、错 run/map/cue 均拒绝。

剧情随 `ExpansionDraft` 进入原候选事务；结算失败留 `pendingStory`，导出包含同一个待保存候选。写前失败可重试；已写入但发布失败必须导出/刷新，不能重跑奖励。真实 v9 客户端拒绝 v10，不能静默抹去剧情。单 profile 旧式备份不能抹掉已有见闻；原扩展降级保护仍在。

源码旁的类型与契约为唯一接口定义：[站内 contract](../../src/hideout-runtime/contract.ts)、[行动 contract](../../src/raid-runtime/contract.ts)、[SaveSession](../../src/session.ts)、[严格存档](../../src/recovery-store.ts)。

## 给 Opus 的接入任务

接续同一分支/PR。可以修改 `station-view`、`coast-view`、`ui.ts`、样式和必要的呈现适配；不要另建任务状态、发奖逻辑、剧情保存键或重写已验事务。

1. 新出击接线：调用原 `HideoutRuntime.deploy({world:'buildings', seed, marketStory:true})`。当前生产界面尚未传这个选项，因此不会提前把未完成的表现放给玩家；经典旧世界和商场不接受该选项。新世界的地图 ID 仍是 `coast`。
2. 小蔡入口：站内 `runtime.story()` 提供供电、缺额、可交付、已报告、选择和见闻；`runtime.openStory(entry)` 返回临时会话，`view()` 给当前文本/按钮，`choose(option.id)` 返回原 Result，`close()` 只关会话。entry 为 start/location/radio/father/breaker/call；内部稳定 ID 不显示给玩家。成功才读下一段，保存失败保留原话题并走现有错误保护；重试保存后用户再点原选择。会话不负责新增暂停豁免。
3. 场景锚点：位置/半径见 `MARKET_ANCHORS`，不增加碰撞。呈现冷柜、配电箱、蔡建平备用柜，第二层指柜内架层；保留原告示原文位置。总闸只观察，不做重新拉闸开关。告示、briefing、powered、report 沿原站内/阅读/供电入口，不虚构为已调查。
4. 行动服务：`CoastServices.story()` 与 `storySources()` 只读；后者给 world/run/map 绑定的 ref、位置、标题与当下可用性。实际 E/触控确认总闸时调用 `observeStory(ref)`，不得因绘制提示/打开回顾就调用。冷柜 72px 近距由 Runtime 自动处理，开柜喊声由原 `activate(containerRef)` 自动处理，无需前端再观察或保存。
5. 声音/字幕：消费带 `durability:'committed'` 的 `story-cue`，按事件 seq 去重。事件给 source/clue/text/sound；文本与只读回顾包含全部线索，静音不丢信息。危险信息优先，剧情最多一条，丢弃过时字幕，不排长队。恢复检查点不会重播；同一新局允许再次听到，但永久见闻不重复追加。
6. 输入/生命周期：Esc、触控关闭、失焦、死亡、超时、换页、冲突均关闭相应面板、释放输入和会话引用；保持现有世界时钟规则。读回顾不生成证据、不扣物、不默认选择。柜子取物继续原 transferLoot，禁止前端直接改两端库存。
7. 前端完成后再启用默认市场出击入口并做 1280×720、1920×1080、手机横屏、音量零、遮挡/危险消息、刷新恢复、两条自然路线和真人理解验收。不要仅凭本页底层测试把 #83 关闭。

## 验证及未验

自动回归入口：[领域/事务测试](../../tests/market-story.test.ts)、[真实浏览器接口测试](../../tests/market-story-browser.mjs)。浏览器测试使用单独生成的测试专用 harness 调用正式 Runtime，真实 localStorage/Web Locks 与真实旧/新网页；没有将测试入口加入生产包。

真实 v9 基线与存档来源、SHA-256 记录在 [provenance](../../tests/fixtures/market-v9-provenance.json)，旧档原字节在 [fixture](../../tests/fixtures/market-v9.json)。复现先在该基线提交、固定 lockfile 上构建 v9 HTML，设置 `BINCOV_STORY_V9_HTML` 指向它；脚本核对哈希，不允许用当前构建代替。

```powershell
pnpm test
pnpm package
pnpm check:ci
node tests/market-story-browser.mjs
pnpm test:save-browser
```

本地证据存放 `test-results/market-story/`（不提交生成物）；最终提交及 CI 以承接 PR 为准。真实浏览器专项已通过六组流程：v9 迁移、第二窗口锁、开柜失败/重试/刷新、失败后选择、维修/完整导入、旧客户端拒绝新档。领域测试覆盖 300 组初始补给组合、30 个新世界种子、两条路线在高低潮可达，以及错误状态反例。

本地完整单测 **1126/1126**、工程守卫 **139/139**、TypeScript/package、通用 `test:save-browser`、四份固定旧客户端的 `test:expansion` 通过。环境为 Windows、Node 24、pnpm 11.19.0、Chrome 156.0.8078.74。首轮 package 因新对白缺字失败，按固定上游哈希与 fonttools 4.61.1 / brotli 1.2.0 重新生成子集后通过；当前便携 ZIP **6,128,719 bytes**，网页 ZIP **6,124,210 bytes**。前端相关验收边界不因这些接口回归通过而改变。

补充本地检查：`test:buildings`、`test:raid-default`（11/11）、`test:station-reset`、`test:portable` 通过。首轮远端 CI `41225343943` 的 batch-3 在标题保存验收 helper 命中旧断言 `10 !== 9`，补齐 `station-acceptance-gates.mjs` 和普通入口检查的当前版本断言；未放宽字段相等、时钟、存档或失败断言，未改前端源码。修复后验证与最终 CI 链接在 PR 保持更新。

复测普通入口的既有 review 工具时，旧夹具还遗漏了新档及重开序幕，并把迁移前不存在的随机装备 UID 当作应保留字段：首轮 0/3。改为真实 Esc 跳过序幕，并按既有迁移契约期待 `gun-v6`，其余 profile 仍逐字段相等；最终 **3/3 通过**，`test:title` 完整复测也通过。该工具继续保留 review 分类，不据此提升为正式门禁。

原 [mk-a01–30](../story/CH01-MARKET-SLICE.md#7-验收矩阵未来实施门槛) 继续是完整验收入口。物资、路线与事务已有自动证据；mk-a13 音画、mk-a27 前端释放/计时、mk-a28 各屏幕、mk-a29 自然行动、mk-a30 真人理解仍待 Opus/实际试玩，不能以接口夹具签收。字体只按既定来源补离线字符子集，没有改变字形风格。完整 UI、真机和发布均未做。
