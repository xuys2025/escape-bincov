# 当前任务入口

最近核对：2026-10-24，main `f74ff91`（含 #102瞄准相机边界、#81街区敌人阶段、#96/#99受击素材与A组姿态）。本轮[PR #104](https://github.com/xuys2025/escape-bincov/pull/104)已正常同步主线，继续现有商场二层遭遇；下表其他条目的合并状态、head 与检查结果以对应 GitHub 页面实时信息为准，旧快照不作为当前指令。

| 目标 | 承接入口 | 接手提示 |
| --- | --- | --- |
| 行动精神/水分/饱食实时 HUD | [#60](https://github.com/xuys2025/escape-bincov/issues/60) · `fix/live-vitals-hud` · [修复记录](tasks/audit-contracts.md#精神水分饱食-hud-的实时投影) | 独立承接 #79 审计保留项：`HudView.needs` 从实时身体复制，宿主只舍入显示；经典行动保持空投影。准确提交、实际验证与未验范围见修复记录；不关闭 #60 总单 |
| 按风险选检查与诊断分类 | [#60 Q-E08](https://github.com/xuys2025/escape-bincov/issues/60) · [使用入口](CHECKS.md) · [交付记录](tasks/check-navigation.md) | 已合入（[PR #93](https://github.com/xuys2025/escape-bincov/pull/93)，`98c69b4`）：风险组合列出命令与前置，完整脚本用途盘点、两个堆报告目录分离。#32 F20 仍 PARTIAL；56 个旧工具保留待确认，不自动执行或删除。资源趋势工具的[轮数参数拒绝](../handoff.md)由 [#32](https://github.com/xuys2025/escape-bincov/issues/32) / #60 跟踪，只拒绝非法输入，不代表 F20 签收 |
