> 合并整理说明：本文结论与历史失败保留，42 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 基地商店拖放：Sol 独立验收

2026-10-09（UTC+8），原工作树 D:\bincov\shop-drag-fix，原分支 fix/shop-drag。被验实现为 **4fc30234d1d686a6cb68007f923aff6d7fbd7bdc**，main 对照为 **43a342ce434c101e4b7058a54f6f29ede9482223**。

**签收：商店自动化范围 PASS；完整验收 PARTIAL。** 两家商店四向鼠标拖放、拖回取消、拒绝提示、Esc、注入 blur 后重新拖动、点选放置、失败回滚及单次重试均通过。真鼠标真人操作、实际窗口切换和真手机仍为 NOT RUN。20 套回归首次完整顺序批次有 1 套 systems 失败，未用后续通过覆盖首次结果，也不宣称完整 CI 已绿。遗留归属见 [问题清单](issues.md)。

## 1. 基线和方法

开工工作树干净，HEAD 正好为 4fc3023；fetch 后 origin/main 为 43a342c，无同目标开放 PR。相关 #22、#28、#30 与本任务分开。[基线记录](evidence/baseline.json)含完整 SHA、环境、开放 PR 和 Pages 内容哈希。GitHub Pages 当时逐字节等于 main 包，仍包含旧拖放问题；本轮没有更新 Pages 或 preview.bincov.me，也没有核验后者的新部署。

Windows 10.0.19045 / i5-12400F，**Node 24.19.0、pnpm 11.19.0、Chrome 154.0.8037.98**。Playwright 驱动本机 Chrome 无头模式，file:// 离线打开正式包，输入为浏览器可信 mouse / keyboard / tap 自动化事件。它们不等于真人或实体触屏。原 shop 测试从正常入口开始，?test=1 只读状态；唯一状态故障夹具是主档 setItem 写入失败。其他 CI 套件保留原有世界、资金、时钟等夹具，不能据此签收自然游戏平衡。

源码核对：4fc3023 的产品改动只在 src/ui.ts；购物车 moveShopItem、settleCart 和存档事务实现未改。本次独立验收也没有修改 src、scripts、tests、依赖或 CI。[交付前审计](evidence/product-audit.json)确认这些路径无差异，五份正式产物与 4fc3023 相同。两份 HTML 均为 2,416,251 字节，SHA-256 **a9a07a960049d6dc17e54b9fb7c765c99a72041c48e111c9b73b2ae2fa8d852f**。

## 2. 商店检查和旧版本负对照

| 检查 | 实跑结论 | 证据 |
| --- | --- | --- |
| 原版 test:shop-drag，1280×720，两家商店 | 15/15，页面错误 0、外部请求 0 | [首次 JSON](evidence/runs/shop-fixed-first/direct/report.json) |
| 1920×1080，两家商店 | 15/15；只改测试视口、截图名与诊断目录的 import，保留原断言与等待 | [JSON](evidence/runs/shop-wide-first/direct/report.json)、[变体身份](evidence/wide-variant-identity.json) |
| 844×390 触屏补验，两家商店 | 6/6，页面错误 0、外部请求 0；四向点选、取消、混合买卖回滚与重试 | [完整状态摘要](evidence/runs/supplement-first/direct/report.json) |
| 完全相同的新测试跑 main 正式包，首次 | **5/15，exit 1**，页面错误 0、外部请求 0 | [首次 JSON](evidence/runs/shop-main-control-first/direct/report.json) |
| main 同口径顺序复跑 | **5/15，exit 1** | [复跑 JSON](evidence/runs/shop-main-control-serial/direct/report.json) |

四向为商人→待买、待买→商人、仓库→待卖、待卖→仓库。修理铺手枪与卫生所绷带均验证：松手落在指定 (1,1)；虚影和有效预览出现，松手后清除；未结算现金、仓库与已存档字节不动；拒绝商人→待卖会说明原因；商人→商人静默取消。拖动时注入 window blur 或按 Esc 后不落入待买，再拖可用；R 不改变预览宽度（手枪 108px，绷带 54px）。**blur 是合成事件，实际切窗失焦尚未验收。**

main 首次真正的反证是两家商店商人→待买均得到空清单，仓库→待卖也为空；无环境错误。待买→商人的超时是前一步未生成待买物品的连锁失败，不能算成另外独立定位的取消缺陷。原版同一测试源 SHA 和执行命令见 [verification（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。main HTML 由 git show 43a342c:dist/index.html 逐字节导出，2,416,678 字节，SHA-256 **3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754**；没有为使对照失败修改旧包或 CSS。

原触屏用例标题写了“and back”，实际只断言修理铺商人→待买。本轮不把标题当覆盖，另用补验脚本为两家商店逐一执行全部四向点选。补验还加强为**整份 save 与整份 cart 深比较**：

- 单独买入故障：手枪现金 700→失败 700→重试 380；绷带 700→失败 700→重试 655。
- 混合买卖故障：手枪净付 170，现金 380→失败 380→重试 210；绷带净付 27，655→失败 655→628。
- 写入故障确实命中（计数 >0），持久化字节、全部 save 与 cart 均相同，保存失败提示可见。恢复写入后旧售出 UID 消失，新购入 UID 只一份，其他物品保持，买卖清单清空且结算按钮禁用。

首次可见存档仓库已有急救包和 24 发 9mm，并非修复说明概述中的“空仓库”；本轮采用实际起始状态与前后差值，没有删除初始物品或伪造资金。

截图： [1280 修理铺（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[1920 卫生所（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[触屏绷带待买（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[触屏混合买卖失败（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。短屏截图存在格子内部滚动及边缘裁切；本轮只签收点选路径和回滚，不把这些截图当作短屏画面完善验收。

## 3. 必要回归：保留首败

pnpm test **197/197**；pnpm package 通过，重建产物逐字节一致。expansion 所需旧客户端在首次运行前即按 CI 固定 SHA 07b1414 导出，未因缺夹具制造一次失败。

20 套原有 CI 同款测试**顺序完成，19 PASS / 1 FAIL**；新增 shop 测试另列，未混入这 20 套。

| 套件 | 首次完整顺序批次 / 退出码 | 证据 |
| --- | --- | --- |
| browser | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| desktop-input | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| ui | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| tactical | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| art | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| title | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| title-water | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| save-browser | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| expansion | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| buildings | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-expansion | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| systems | FAIL / 1 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mall-passages | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mall-landing | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| loot | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| loot-target | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mobile | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mobile-ux | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| portable | PASS / 0 | [原始日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |

systems 首败于“mall floor preview … reload restores it”，src 对应未改，测试 scripts/systems-browser-test.mjs:97 深比较仍保留：刷新前另读活动状态朝向 **2.959230255792857**，读档后 **2.9573005838765933**，差约 **0.00192967 rad**；x=2288、y=1136 一致。失败现场 diagnostic 中持久化 raw 的朝向恰为 **2.9573005838765933**，与读档后的状态相等。因此本次证据不支持“读档丢失已保存朝向”；检查点写入与另次读活动对象之间可能有帧更新，但这是待证实推断，**不据此关闭失败或修改产品**。证据为 [首次失败 JSON（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[堆栈日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。该脚本首败后后续步骤本次没有执行；有限复跑是否执行及结果见各份 JSON，不能把首轮写成全量通过。

有限 A/B 预先限定为 main、修复包交替各 3 次，诊断副本仅允许 HTML/输出路径和相对 import 变化，**所有断言与等待不变**。systems：main 3/3 通过，0/3 失败；修复包 3/3 通过，0/3 失败。首次原脚本失败仍保留；当前样本不足以认定是 main 既有问题或本修复引入，状态为**间歇失败、归因未确认**。[副本身份](evidence/systems-variant-identity.json)。

qol-expansion 首次完整顺序批次通过 4/4；继续保留 Opus 已记录的 lootContext 为 null 竞争历史。本轮有限 A/B：main 2/3 通过，1/3 失败；修复包 1/3 通过，2/3 失败。[副本身份](evidence/qol-variant-identity.json)。本轮失败为 qol-fixed-2、qol-main-3、qol-fixed-3，均在副本第57行读取空 lootContext.containerId，错误与历史记录相同；此前卫生所购物车结算步骤各次均通过。main 本轮也复现，说明该竞争在基线已存在；不据这6次推断发生概率或关闭问题。历史 Opus 的次数不计作本轮样本。每次第一失败、余下未执行步骤均见原 JSON。

| 有限对照 | 实跑 / 退出码 | 证据 |
| --- | --- | --- |
| systems-main-1 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| systems-main-2 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| systems-main-3 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| systems-fixed-1 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| systems-fixed-2 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| systems-fixed-3 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-main-1 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-main-2 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-main-3 | FAIL / 1 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-fixed-1 | PASS / 0 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-fixed-2 | FAIL / 1 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| qol-fixed-3 | FAIL / 1 | [日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |

另有一次流程中止必须保留：初始批次父进程完成状态尚未收取就调度 CI，后因担忧重叠主动中止其 desktop-input。事后子进程时间戳显示 main 于 13:27:03.523Z 退出，CI browser 于 13:27:05.707Z 启动，**实际没有浏览器重叠**；该 browser 已通过，desktop-input 标记 ABORTED，不能算产品失败或通过。随后重启完整顺序批次。见 [中止工具记录](evidence/interruption-tool-output.json)、[部分桌面日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

## 4. 未运行和交付界限

| 项目 | 状态与完成条件 |
| --- | --- |
| 真人真鼠标，两家商店四向、Esc、点选、结算一次 | NOT RUN；实际人员操作后填设备、浏览器、日期和结果 |
| 实际切到其他窗口再回来并重拖 | NOT RUN；合成 blur 不能替代 |
| 真手机的两家商店点选放置与取消 | NOT RUN；记录手机/系统/浏览器和实际输入 |
| 远端 CI、真实发布后试玩 | NOT RUN；未推送，未开 PR，未更新站点 |

本轮只新增验收文档、诊断副本和证据，更新任务与交接索引；不改前端方案、产品规则、存档实现或正式生成物。本地提交后停止，等待维护者安排真人验收和后续处理。

完整运行列表见 [run-index.json](run-index.json)，诊断行 expected=true 只表示退出码在预设允许集合内（负对照和间歇诊断允许 exit 1），不表示断言通过；签收以每份 JSON 的 status 和退出码为准。执行命令、退出码、起止时刻、源文件与原始输出哈希见 [verification.json（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。[证据索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md)逐份记录归档证据 SHA-256 及原始文件 SHA-256；[交付 manifest](manifest.json)覆盖本目录文件；文本只规范化 CRLF→LF，截图不改动。间歇失败截图也已归档。间歇失败截图也已归档。间歇失败截图也已归档。其他 CI 全量截图留在忽略的 test-results/shop-drag-sol-20261009，旧 HTML 用确切 Git blob 再生成，不重复提交。

复跑需 Node 24 和现有依赖，在 4fc3023 的干净工作树，将 diagnostics 内 7 个 .mjs 复制到 test-results/shop-drag-sol-20261009 后，先运行 baseline.mjs（准备两个旧包），再顺序运行 run.mjs initial、serial-restart、wide、supplement、systems-control、flaky；每个父进程结束再启动下一阶段。正式用例也可直接 pnpm test:shop-drag，main 负对照用 BINCOV_SHOP_HTML 指向上述导出包，并为 BINCOV_SHOP_OUT 指定独立目录。诊断副本以源码和 JSON 为证，不替代 CI 原脚本。提交身份由包含本报告的 Git 提交及其 4fc3023 父提交确定，避免报告自引用自身提交 SHA。
