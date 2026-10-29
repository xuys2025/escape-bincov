# 待办：HUD 堆路径报告拒绝缺失或非法观测字段

状态：**待维护者指派；未实施**。本次只建立任务书和草稿 PR。实施者继续本分支与本 PR，完成验收后再转 Ready；不要另建同目标 PR。

- 分支：`fix/hud-path-observations`
- 建档基线：`03cfb775fbef07c711fe789e9f6e886460261a91`（2026-10-29；#111 已合并）。开工前重新 fetch 并核对原 PR。
- 任务归属：[#32](https://github.com/xuys2025/escape-bincov/issues/32)、[#60](https://github.com/xuys2025/escape-bincov/issues/60)。负责人由维护者指定。

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
- [检查用途登记](../../scripts/check-catalog.mjs)
- [原始反例](https://github.com/xuys2025/escape-bincov/issues/32#issuecomment-6393868461)

## 完成条件

- [ ] 同一两节点强边正例保留 reachable:true 与原路径；真正无强路径/只有 weak 边的合法输入仍返回 false。
- [ ] edge_count 为 null、缺字段/缺槽、负数或非整数时明确拒绝；同时校验本工具实际消费的 stride、数组长度、类型/字符串索引、to_node 对齐及范围，不能通过 Number/typed array 把坏值变成 0。
- [ ] 一次多输入中任意一个非法，非零退出且不创建或覆盖目标报告；输出错误能定位输入文件与消费字段，不打印快照字符串内容。
- [ ] 真实 CLI 合成正反例进入现有 check:ci；对非法输入预放目标文件哨兵，证明保留原文件。合法输出与基线对照，保留旧实现有效失败。
- [ ] 完成 pnpm test、pnpm check:ci、pnpm package；原脚本仍为 review，不把堆快照、60 轮采样或 F20 签收塞入常规 CI。

## 本次建档验证

已核对最新 main、任务清单、对应源码和开放 PR，无同目标开放 PR。仅文档，不宣称上述实现和测试已完成；本次文档检查与实际结果见 PR 正文。源码、存档、生成物和部署均未改。

实施完成后在本文件或原 PR 更新实际结果、首败、截图/报告和未验证边界；同步相关 issue 与 WORK-QUEUE 的这一项即可，不扩大为清理整个历史任务表。
