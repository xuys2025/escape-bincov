# 两份行动报告合一（#163 待定项）

状态：**实现与本地验证完成，待维护者合并**。真人试玩、真机未验；CI 结果以 PR 为准。

- 分支：`fix/one-raid-report`，PR 见 [WORK-QUEUE](../WORK-QUEUE.md) 顶部
- 基线：main `278b7e24`（2026-10-31，#159 已合入）
- 归属：[#163](https://github.com/xuys2025/escape-bincov/issues/163)「待定：两份行动报告合一」。第一批 [PR #165](https://github.com/xuys2025/escape-bincov/pull/165)（含「结算页铺满」）开工时未合并，维护者同意先做，#165 合并后再同步 main。

## 问题

行动结束先出旧结算页，点「返回水产站」后，院子里又弹一次「行动报告」：内容相同，样式不同。

## 调查：两份报告各自负责什么

#163 原写“结算页还负责结算音效、写入失败重试的落点”。核对 main `278b7e24` 后，这些都在两份报告之前的局内结局面板：

| 负责的事 | 局内「正在保存结算」面板 | 旧结算页 | 院子报告 |
| --- | --- | --- | --- |
| 写入结算 | `prepareSettlement` → `retrySettlement`，写入成功才放结局动画 | 写入成功后才出现 | 写入成功后才出现 |
| 写入失败重试 | 「重试保存」，重试不重复发奖 | 只有旧页面自己的「结算尚未保存」弹窗兜底 | — |
| `pendingSettlement` | 保留到写入成功或导出备份 | — | — |
| 结算备份导出 | 「导出备份」 | 兜底弹窗「下载结算备份」 | —（院子菜单有普通导出） |
| 撤离/死亡音效 | `sound.settled`，写入成功那一刻播放 | 自己不放（只有兜底重试成功时放） | 院门声 |
| 显示 | — | 击败敌人、保留物资估值、累计撤离/出击；固定文案 | 同样三项；文案取自结算记录（分阵亡/超时） |
| 去向 | 结局动画 → 页面 | 「返回水产站」→ `returnToBase` → 院子 | 「回到站里」/ Esc 关闭 |

依赖它们的浏览器脚本：院子模式 7 个（station、station-capability、station-resource-trend、station-round2-recheck、coast-render-targets、coast-lifecycle、raid-default）；旧页签模式（`?test=1&entry=tabs`）约 25 个等结算页再点返回，只有 save-browser 核对一处文字。

## 维护者决定

2026-10-31 维护者从对照表里选了 **B 保留院子报告**（[对照表](one-raid-report/compare-options.png)：A 保留旧结算页、B 保留院子报告、C 结算页换成院子样式的合并原型，三列各有 1280×720、1920×1080、手机横竖屏真实截图；A、C 按 #165 之后的结算页截图，C 只是本地原型，未提交）。

## 实现

一局结束后：局内面板写入结算并放结局动画（不变）→ 页面 [`settled`](../../src/ui.ts) 直接调用 [`returnToStation`](../../src/station-view/route.ts) → 院子播放走进院门 → 进门弹院子报告（[`arrive`](../../src/station-view/host.ts)）。中间不再画旧结算页。

旧结算页只作兜底，玩家每局仍只看到一份报告：

- 页签入口（`?test=1&entry=tabs`，测试夹具）照旧进结算页，返回页签界面。
- `returnToBase` 被拒（另一窗口接管存档、写入失败等）：停在结算页，Runtime 的拒绝原因用提示显示；「返回水产站」再试，成功后院子只播放走入、**不再弹第二份报告**（`returnToStation(true)` 把这次到达的 `summary` 置空）。
- 院子画面起不来（如无 WebGL）：路由照旧退回页签界面并提示，报告以对话框（同一张结算卡片，「回到站里」关闭）在页签界面出现一次。
- 旧页面自己的「结算尚未保存」弹窗重试成功：照旧进结算页，返回时同样不再弹院子报告。

存档规则一项不动：先写入成功才显示；`pendingSettlement` 保留到写入成功或导出；重试不重复发奖；阵亡/超时/放弃按失败结算；多窗口冲突保护、导入校验都在局内面板和存档层，本项不改它们。

## 测试改动

- [yard-entry.mjs](../../scripts/yard-entry.mjs) 新增两组公用检查：`watchOldPage` + `yardReport` 断言院子报告出现前**没画过**旧结算页或页签界面；`atRaidRelease` + `releasedState` 在行动视图移除根节点的那一刻读停放状态。原来几项检查在结算页上等着读“行动已释放、Pixi 应用已停放”；现在院子紧接着就接管同一个应用，所以改在释放瞬间读同样的字段，需要垃圾回收的检查（行动宿主、视图、渲染目标被回收）挪到院子起来之后做，判据不放宽。
- 7 个院子模式脚本改为验证新流程：station G3/G4/G5、station-capability、station-resource-trend、station-round2-recheck（J2、K3、R）、coast-render-targets、coast-lifecycle（结算重试后与放弃后两处）、raid-default（R3–R7 的 `abandonPixi`，R5 改查院子报告文字）。
- station 新增三项反例：G8 结局动画中另一窗口写入新记录 → 停在结算页，再点返回仍拒绝，另一窗口的记录不被覆盖；G9 结算后院子启动失败 → 页签界面出现报告对话框一次，关闭后可用；G10 回站被拒一次 → 结算页显示报告，再点返回走进院子，不弹第二份。
- 旧页签模式的脚本不变，它们仍验证结算页这条兜底路径。

## 验证（Windows，Node 24.22.1，系统 Chrome，离线真实构建）

构建 SHA-256 `2e4eb2aaf2bd89fdaffbae433eca64e22d41953a6d6863384d2062d2064682bf`（基线 main `278b7e24` + 本分支）。浏览器套件逐个串行运行，每套单独目录。

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 1113/1113 |
| `pnpm package` | 通过 |
| `pnpm check:ci`（工程守卫） | 139/139 |
| `test:station`（完整院子验收，手动套件，含新 G8/G9/G10） | **84/84**，页面错误 0、外部请求 0 |
| `test:save-browser`（写入失败、重试、多窗口） | 17/17 |
| `test:browser` | 通过（两档桌面四轮出击） |
| `test:ui`（两档桌面；旧页签模式的结算页仍截图核对） | 通过 |
| `test:raid-default`（R3–R7 在院子入口结算，查院子报告） | 11/11 |
| `test:coast-render-targets`（释放瞬间停放状态 + 院子起来后回收） | 5/5 |
| `test:station-capability`（真实 GPU，含出击回院子一轮） | 4/4 |
| `test:systems`、`test:station-relief`、`test:station-tier1`、`test:station-tier2`、`test:hud-release`、`test:desktop-input`、`test:mobile` | 全部通过 |
| `station-resource-trend --mode=shared --rounds=3` | `BOUNDED_CHECKS_PASS_HEAP_PENDING`（三轮停放断言全过；三轮不签收堆趋势） |
| `station-round2-recheck --only=J,K,R` | 4/8；**与 main `278b7e24` 构建的原脚本完全相同**：R `RESOURCE_PARTIAL`（同四条 strict 记录）、J2 竖屏行动被「横过来」暂停导致按 E 等不到结算、K3 `glBuffer live grew`、K4 `glBuffer empty grew`；四轮村庄停放断言两边都通过 |
| `coast-lifecycle-test`（review 类，`node --import tsx`） | 1/5；**与 main 原脚本相同**：前四项都在开头等院子「出击」快捷键超时，到不了改动处；改动过的第五项（放弃 → 院子报告、释放瞬间停放、回收）通过 |

改后真实截图：[改后对照](one-raid-report/after.png)（1280×720 正常流程三步、1920×1080 与手机横竖屏的院子报告、G8/G10/G9 三种兜底，G9 两档桌面）。旧页签模式（`entry=tabs`）的约 25 个脚本未改；其中 CI 内的 browser、ui、save-browser、systems、hud-release、mobile 已在上表重跑。

## 遗留

- 真人试玩、真机（手机）未验；本机桌面 Chrome 与手机视口模拟。
- #165 合并后要同步 main 并重跑；预计只在 handoff.md、WORK-QUEUE.md 顶部冲突。
- 院子报告的文案没有“进度已保存”这句（旧结算页有）；维护者选 B 时未要求改文案，本项不改。
