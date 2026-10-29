# 待办：HUD 堆路径报告拒绝缺失或非法观测字段

状态：**已实施，等待准确 head 的 CI 与主代理独立审查**。维护者于 2026-10-29 指派 GPT-6.1 Sol 续作 [PR #144](https://github.com/xuys2025/escape-bincov/pull/144)，保留原分支与原 PR；最终合并交主代理。

- 分支：`fix/hud-path-observations`
- 建档基线：`03cfb775fbef07c711fe789e9f6e886460261a91`（2026-10-29；#111 已合并）。开工前重新 fetch 并核对原 PR。
- 任务归属：[#32](https://github.com/xuys2025/escape-bincov/issues/32)、[#60](https://github.com/xuys2025/escape-bincov/issues/60)。只完成本子项；总单状态由主代理统一更新。

## 问题与目标

HUD 堆路径工具把缺失的边观测当成不可达：两节点强引用图中，只把 root 的 edge_count 从 1 改为 null，当前 CLI 仍 exit 0 并输出 reachable:false。

交付目标：坏的消费字段在写报告前明确失败；合法输入继续给出相同的强引用路径。

## 原子范围

仅修改 sol-f20-hud-paths 的输入校验及其真实 CLI 反例，不扩成完整 V8 schema，也不改变遍历、路径长度上限、字符串省略或 weak 边规则。

#111（轮数校验）、#114/#116/#118 已合并；这些交付无需重做。F20/PARTIAL、堆归因、浏览器与真机结论继续归 #32；#109 的自然游玩采样另行续作。

## 接手入口

- [脚本入口](../../scripts/sol-f20-hud-paths.mjs)
- [已有堆字段校验反例](../../scripts/ci/heap-cache-input.test.mjs)
- [辅助回归聚合](../../scripts/ci/resource-helpers.test.mjs)
- [本次真实 CLI 合成回归](../../scripts/ci/hud-paths-input.test.mjs)与[原实现负对照](../../scripts/ci/fixtures/hud-paths-before-validation.txt)
- [检查用途登记](../../scripts/check-catalog.mjs)
- [原始反例](https://github.com/xuys2025/escape-bincov/issues/32#issuecomment-6393868461)

## 完成条件

- [x] 同一两节点强边正例保留 reachable:true 与原路径；真正无强路径/只有 weak 边的合法输入仍返回 false。
- [x] edge_count 为 null、缺字段/缺槽、负数或非整数时明确拒绝；同时校验本工具实际消费的 stride、数组长度、类型/字符串索引、to_node 对齐及范围，不能通过 Number/typed array 把坏值变成 0。
- [x] 一次多输入中任意一个非法，非零退出且不创建或覆盖目标报告；输出错误能定位输入文件与消费字段，不打印快照字符串内容。
- [x] 真实 CLI 合成正反例进入现有 check:ci；对非法输入预放目标文件哨兵，证明保留原文件。合法输出与基线对照，保留旧实现有效失败。
- [x] 完成 pnpm test、pnpm check:ci、pnpm package；原脚本仍为 review，不把堆快照、60 轮采样或 F20 签收塞入常规 CI。

## 实现与消费边界

校验发生在 flat table 算术与 typed array 写入前，`edge_count` 逐项及其总和必须是非负安全整数，并与完整 edge rows 一致。所需字段必须唯一存在；node/edge 类型表按 `type` 字段位置解析，支持字段重排。ID、非字符串节点名称、强边目标与名称按实际读法检查；报错仅含文件、字段路径和期望值，JSON 语法错误也不回显快照片段。

额外列、未读的声明计数和 metadata 保持不约束；未来类型名仍可用。不读取 string 节点的名称槽、未引用的 strings 槽或 weak 边 payload，因而这些位置不升级为完整 schema 要求。weak 边类型及所属节点的边计数仍参与校验，遍历仍跳过 weak 边。BFS、80 节点路径截断、250 字符名称截断、字符串内容省略和合法输出字节保持原行为。

多输入全部成功后才写目标文件；本次保证输入拒绝不会创建或覆盖报告，不扩展为磁盘写入故障时的原子发布功能。

## 本轮验证与首败（2026-10-29）

- 开工实时核对：原 PR 为 open/draft、head `4cf4f72cda0850fe35b636e84f72d38d9a614007`，无评论/审阅；正常 fetch 后 main 仍为建档基线，#111 已合并。
- 环境：Windows，Node `v24.21.0`、pnpm `11.19.0`；按锁文件安装成功，仅在本次命令调整 PATH。
- 专项 `node --test scripts/ci/hud-paths-input.test.mjs`：10/10 通过。所有消费字段坏值均用无报告与预置报告哨兵两种情况运行真实 CLI；另验两个输入位置、JSON 片段不泄漏、弱边/真实不可达、重排字段、额外列、字符串省略及 79/80/81 hops。
- 原实现负对照来自建档 head 的完整 CLI，文本 fixture 保留原源码：`edge_count=null` 时旧 CLI exit 0 / `reachable:false`，新 CLI exit 1 且原文件字节不变。多组合法输入的 report 与 stdout 均与原 CLI 逐字节一致。
- **首败保留：**专项第一轮 4/10 通过、6/10 失败；改写时把报告结尾换行误写为字面 `\\n`，字节对照明确捕获。恢复原换行后第二轮 10/10 通过；没有放宽对照断言。
- 完整验证：`pnpm test` 1056/1056、`pnpm check:ci` 123/123（包含新增 10 项）、`pnpm package` 全部通过。便携 ZIP 实际 6,035,864 B，web ZIP 6,031,355 B；5 MiB 旧上限已取消，仅记录大小。最终 head/CI 见原 PR 正文；本地日志留在忽略的 `test-results/pr144/`，不提交生成 HTML、ZIP、manifest 或真实 heap。
- 未运行浏览器、60 轮堆采样、真人与真机；未改变 F20/PARTIAL、阈值、归因或游戏/存档/离线行为。原工具仍登记为 review，CI 只执行合成图入口测试。

## 建档时验证（历史）

已核对最新 main、任务清单、对应源码和开放 PR，无同目标开放 PR。仅文档，不宣称上述实现和测试已完成；本次文档检查与实际结果见 PR 正文。源码、存档、生成物和部署均未改。

实施完成后在本文件或原 PR 更新实际结果、首败、截图/报告和未验证边界；同步相关 issue 与 WORK-QUEUE 的这一项即可，不扩大为清理整个历史任务表。
