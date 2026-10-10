> 合并整理说明：本文结论与历史失败保留，24 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# systems / QOL 测试稳定性与正式触屏回归

2026-10-09（UTC+8）。原工作树 D:\bincov\shop-drag-fix、原分支 fix/shop-drag，从 **31a0aef40672ed0f83a9cb21817816745e3d83de** 续作；fetch 后 main 仍为 **43a342ce434c101e4b7058a54f6f29ede9482223**，无同目标 PR。[基线](evidence/baseline.json)。

**自动化结论：PASS。真人／真机验收仍为 NOT RUN，完整商店验收仍为 PARTIAL。** 本轮定位并修正两处测试时序，没有确认需要改动产品的缺陷；src、存档实现、规则、依赖、CI 配置及正式 HTML/ZIP/发布清单均未改。上一轮 [首次失败与未归因记录](../sol-20261009/README.md)保持原样，本报告以新证据承接，不覆盖首败。

## 1. QOL：按键完成不等于游戏帧已处理

src/main.ts 的 E keydown 仅将 interact 加入 PlayerInput；src/game.ts 在后续 update/step 才消费 actions 并调用 openLoot。旧测试在 page.keyboard.press('e') 返回后立即解引用 lootContext.containerId，偶尔早于该帧。

[隔离轨迹1](evidence/runs/qol-trace-1/direct/qol-expansion-report.json)显示：keydown 后 frame 87，overlay 为空、lootContext=null、queuedActions=[interact]；两个渲染帧后 frame 89，正常打开 crate-5，队列清空。旧精确断言在此之间失败。[轨迹2](evidence/runs/qol-trace-2/direct/qol-expansion-report.json)也失败，[轨迹3](evidence/runs/qol-trace-3/direct/qol-expansion-report.json)通过，全部使用未改产品、原断言，说明读取时机竞争。原始第一次共用输出目录的3个探针日志也保留；其中前两次 JSON 被后续探针覆盖，仅第三次 JSON 可用，已明确放在 evidence/initial-probe，随后改独立目录收齐上述3次轨迹，未补造缺失报告。

正式 scripts/qol-expansion-test.mjs 现在只等待 overlay=loot 且上下文非空，再执行**原来的精确 containerId 断言**；等待不要求特定 ID，所以选错容器仍会立即失败。没有延长超时、固定睡眠、重试按键或忽略异常。

## 2. systems：冻结采样和刷新前重存的时间窗口

旧 scripts/systems-browser-test.mjs:97 分别调用 checkpoint、读取活动玩家、reload。src/game.ts 的鼠标朝向随游戏帧与跟随相机更新；src/main.ts 的 beforeunload 再次 checkpoint，pagehide 还会暂停并存档。活动对象在这些时刻可能不同，不能把较早读到的朝向当作退出时最终存档。上一轮实败 x/y 不变、朝向差 0.00192967rad，读档对象与当时可见 durable raw 相同；该现场并没有记录更早的退出前 raw，故不能只据它断定持久化缺陷。

[受控诊断v3](evidence/runs/sampling-proof-v3/direct/report.json)沿用注册楼层入口和露台摆位夹具、原生窗口尺寸切换及真实帧，展示相机收敛时 live 朝向改变而早期 raw 不变。先用 Esc 暂停后，再同一浏览器任务 checkpoint + 读 live/raw：**live、durable、beforeunload 后记录与读档对象四者完全相同**。旧跨时刻比较会报错，新暂停采样通过。该诊断是时序机制对照，不能称为自然游玩的新产品缺陷。

诊断过程中的失败也保留：[第一版](evidence/runs/sampling-proof/direct/report.json)忘记恢复尺寸变化引起的暂停，预期 live 会改变的诊断断言失败；[第二版](evidence/runs/sampling-proof-v2/direct/report.json)恢复了运行，但仍把较早 checkpoint 当作 reload 最终值，暴露 beforeunload 正常重存的遗漏。两者是诊断假设失败，未作为产品缺陷或稳定性样本。

正式修正：在原露台截图之后用原生 Esc 暂停，等待 overlay=pause 且 raid.paused，然后在同一 page.evaluate 中 checkpoint 并读取 live/raw。**原完整 player 深比较（包括 rotation）和 currentMap 断言均保留**；新增检查 checkpoint 成功、live 与 durable 完全相等，写入报告 terraceCheckpointSample。没有舍弃朝向、改近似阈值或屏蔽生命周期存档。

## 3. 触屏补验进入 CI 正式命令

新增 scripts/shop-touch-cases.mjs，由 scripts/shop-drag-test.mjs 直接导入调用；CI 已有 input 组的 pnpm test:shop-drag 会执行，因此不用新增工作流或修改依赖。保留原15项，原触屏标题去掉未覆盖的“and back”，增加两家商店各3项，共 **21项**：

- 商人→待买→商人；指定落格、无拖动虚影、完整 save 与 durable 字节不变。
- 原生购买后仓库→待卖→仓库；暂存与取消不改变已存档进度。
- 混合买卖写入失败，整份 save/cart/durable 字节回滚、提示保存失败，恢复后一次重试正确结算，旧 UID 消失、新 UID 仅一份，其他库存不变，清单清空且按钮禁用。

844×390 仿真触屏，两家商店分别新档普通入口；初始急救包及24发9mm保留。只有存储写入失败夹具，不生成物品或资金。[首次21项报告](evidence/runs/shop-official/direct/report.json)。这仍不等于实际手机验收。

## 4. 验证和负对照

环境：Windows 10.0.19045，Node **24.19.0**、pnpm 11.19.0、Chrome154.0.8037.98，无头、file:// 离线，顺序运行。单测 **197/197**，pnpm package 通过；五份正式产物与31a0aef保持相同，HTML SHA-256 **a9a07a960049d6dc17e54b9fb7c765c99a72041c48e111c9b73b2ae2fa8d852f**。

定向次数在运行前固定：QOL正常5次 + 主页面4倍CPU节流5次；systems正常3次 + 主页面4倍CPU节流2次，共 **15/15** 通过，逐次日志与源哈希均保留。节流副本只调整 import/输出路径并添加 CDP 节流，不改断言；新开的系统触屏和普通入口子页没有节流，不将其称为全页面压力验收。不是失败后重跑直到通过，也不从这些次数推断零失败概率。

[断言审计](evidence/assertion-audit.json)用 TypeScript AST 规范化原 assert 调用，保留调用次数和完整参数：systems 原107项全部保留并新增2项；QOL原26项全部保留；shop原54项全部保留，触屏补验的原34个静态assert调用也全部保留在正式helper中。负对照仍能检出错误：

| 对照 | 结果与含义 | 证据 |
| --- | --- | --- |
| QOL 原生打开另一个容器，保留原期待 ID | exit1，原 exact-ID 断言失败；新等待未掩盖选错 | [JSON](evidence/runs/qol-negative-v2/direct/qol-expansion-report.json) |
| systems 读档后注入朝向 +0.1，保留原完整深比较 | exit1，rotation 差被检出 | [JSON（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 新21项商店测试运行 main 43a342c 正式包 | exit1，11/21；10个旧拖放检查失败，新6项触屏正常 | [JSON](evidence/runs/shop-main-new/direct/report.json) |

QOL首版负对照因关闭面板后指针仍在按钮上，滚轮未切换目标而超时，记录在 qol-negative；这次不算有效负对照。副本v2补回原生 mouse.move(640,350)，原精确ID断言成功拒绝错误目标，没有修改正式测试。

完整回归：原20套 + shop-drag，**21/21 套通过**，全部为修后第一次完整批次，无 ABORTED 或覆盖首败。旧客户端夹具在运行前由 CI 固定 Git blob 07b1414 导出。原套件的资金、摆位、时钟、终局等夹具不变，不能签收自然平衡或新设备表现。

| 套件 | 实跑 / 退出码 | 证据 |
| --- | --- | --- |
| browser | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| desktop-input | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| shop-drag | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| ui | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| tactical | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| art | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| title | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| title-water | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| save-browser | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| expansion | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| buildings | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-expansion | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| systems | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mall-passages | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mall-landing | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| loot | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| loot-target | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mobile | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mobile-ux | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| portable | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |

verification 中 expected=true 只代表退出码符合该对照预设，负对照的 exit1 不代表断言通过。诊断、修后定向、完整回归分别列账，不把预期失败凑入通过数。全部记录见 [run-index](run-index.json)、[完整原始元数据（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。原探针独立输出修正前的归档限制如第1节说明，正式回归均逐例保留。

## 5. 签收边界与交接

REG-QOL-01、REG-SYSTEMS-01 在本分支确认为测试时序问题并完成定向与完整回归；SHOP-TEST-01 正式集成。没有确认需要交回 Opus/Astra 修改的产品缺陷；Astra 原三点规则观察保持待取舍，见[历史归属清单](../sol-20261009/issues.md)。这不关闭不相关的历史存档异常或 PR22 的验收事项。

真人真鼠标双商店四向、Esc、实际切窗、真手机点选及取消均 **NOT RUN**。远端 CI 与线上部署 **NOT RUN**。本轮不推送、不更新试玩站、不发布；本地提交后停止。

归档文本仅规范化换行，原字节与归档字节哈希见 [evidence-index（已归档）](../../IMPLEMENTATION-ARCHIVE.md)，本目录文件清单见 [manifest](manifest.json)。其他完整 CI 截图保留在忽略的 test-results/shop-drag-stability-20261009；旧 HTML 由 Git blob 重建，未另行提交生成物。本提交的父提交必须为31a0aef，实际最终身份由包含本报告和4个测试文件的 Git 提交确定。
