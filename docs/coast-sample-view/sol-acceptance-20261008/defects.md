# 按 Astra / Opus 归属整理的缺陷与未决项

范围：游戏源码 `cdfc965`。区分确认缺功能、未复现异常、渲染风险和正常待接入；测试工具问题单独记录。未将未知根因或内部贴花数量冒充已确认玩法/画面故障。

## Astra

| ID | 优先级 / 状态 | 证据与承接条件 |
| --- | --- | --- |
| ASTRA-SAVE-01 | P2，历史异常，**未复现/未修复** | 原 Opus 1280×720「样板外」曾显示存档失败；本轮五次 240 张全正常。见五份 `evidence/shots-N/index.json`。没有当时写盘/Console 数据，不能下根因结论。复现后先区分 setItem 抛错、快照解码校验失败和修订冲突，再查 Runtime/SaveSession；Opus 同步交回宿主拒绝事件和面板状态。 |

本轮实际执行的旧档恢复、事务回滚、楼层提交、来源子弹结算及终局重试没有确认新的逻辑故障。F12 目的层全面无落点采用 headless fixture；不扩大解释为所有世界/真实设备均已验收。

Astra 协助 OPUS-MEM-01 核对会话与 Runtime 的残留引用；当前没有证据把GC后增长归因到逻辑层。

## Opus

| ID | 优先级 / 状态 | 现状、证据与完成条件 |
| --- | --- | --- |
| OPUS-UI-01 | P1，前端待补齐 | 样板搜刮为自动选位的列表，原型/原游戏的数量、拆分、旋转和格位预览未完成；安全箱/背包互转缺少相应入口。Runtime 部分转移已通过实际写入失败回滚与 1/2 数量验证，[target-loot-probe.json](evidence/target-loot-probe.json)、[partial-save-fault.png](evidence/partial-save-fault.png)。沿既定方案补 UI 后用原生操作重测，不能把服务测试当作数量控件已完成。 |
| OPUS-UI-02 | P2，前端待补齐 | `M` 仅提示样板未包含地图；阅读面板尚未提供。原 Opus handoff 已登记。按原方案补齐并检查读图、暂停/输入抑制与样板/经典入口，不新增逻辑规则。 |
| OPUS-VIS-01 | P2，**风险，尚未证实可见泄露** | 未揭示尸体的 `syncActor` 仍创建 14 个血迹贴花；当前屋顶下开/关这些贴花的实际画面差分为 0。见 [visibility-probe.json](evidence/visibility-probe.json)、[hidden-room-probe.png](evidence/hidden-room-probe.png)。Opus 决定是否显式按 region/revealed 管理贴花，并补屋顶淡化/切层/重建后的隐藏与再揭示签收；Sol 未改视图实现。 |
| OPUS-ART-01 | 首批试样，待接入/反馈 | 43 PNG 和 manifest 已交付，运行画面仍使用程序占位。机械尺寸/Alpha/基线/锚点校验通过；角色步行/镜像、墙段构图、平铺密度、武器握持需原型实测。只反馈这一批，不批量扩量。 |
| OPUS-VIS-02 | 视觉签收未完成 | 前方墙体对子弹像素遮罩、提示/枪线、安全区和所有屋顶信息边界的人工签收未完成。当前有射线、stamp、DPR 数值与截图证据，不能据此宣称整套画面验收通过。 |
| OPUS-MEM-01 | P2，F20堆趋势未签收；Astra协助 | 两轮20次完整循环的显式资源计数全归零，但GC后第6–10轮与末5轮平均堆增加约0.91/0.85 MiB；CDP collectGarbage 后趋势仍存在。见 [lifecycle-gc.json](evidence/lifecycle-gc.json)。Opus 先核对 Pixi/DOM/Phaser 基地与测试暴露对象的持有关系，Astra 协助核对会话/Runtime 引用；尚未确认增长来源或定性泄漏。不得用8 MiB容差签收“不持续增长”。 |

同名箱编号不是缺陷：Runtime 已加名称后缀 1/2，原生滚轮和 E 的提示、选中 ID、实际搜刮容器一致，[duplicate-targets.png](evidence/duplicate-targets.png)。

## Sol 已修复的验证工具问题

| ID | 结果 | 证据 |
| --- | --- | --- |
| SOL-CLICK-01 | 已修复：视口内瞄准点可能被 HUD 遮住，原生点击误开地图。`canvas-click.mjs` 检查实际命中元素，只在画布上点击。 | 原点击点回放、三局实时时钟自动点击完成，首局 600.406 s；[mall-click-guard.png](evidence/mall-click-guard.png)、[layered-play-report.json](evidence/layered-play-report.json)。保留原 600 秒和三局条件，没有修改导航/AI/时钟。 |
| SOL-DIAG-01 | 截图诊断已补：独立五轮输出、Console、拒绝事件、真实写入异常和退出码；偶发存档根因仍未知。 | 五份索引保留，异常数 0。只记录键对应的写入大小/结果，无存档正文。 |
| SOL-HARNESS-01 | 初版补充测试的等待、ZIP 重载和满包堆叠 fixture 已修正并重跑。 | [初版记录](evidence/sample-boundaries-first.json)、最终 8/8 与窄视口 DPR 复核。不是产品缺陷。 |

真机、真人 G12、PNG 接入和视觉签收不在本轮通过范围。本轮只提交本地验证与试样，未修改任何 Astra/Opus 的游戏源码，未合并或发布。
