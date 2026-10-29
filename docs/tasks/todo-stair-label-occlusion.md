# 修复楼梯标签遮住可见敌人（S03c）

最终组合复核（2026-10-29）：正常同步 main `4fec648c`，含已完成 #144/#145；保留双方清单/交接，scene 的共享范围 import 与本任务身体投影自动合并。Node 24.21.0 / pnpm 11.19.0：单测 **1080/1080**、工程守卫 **125/125**、正式打包通过，便携 ZIP 6,101,351 B、web ZIP 6,096,842 B。最终 HTML SHA-256 `2218052786b341a90f9dd67aaaafcf30da38fd0cfd051368fd42d461445429ed`。

独占锁执行的最终组合浏览器复核：[两桌面报告](stair-label-occlusion/final/report.json) **20/22**，只有既有 S04d 两项首帧断言失败；S03c 两尺寸仍为 **0 遮挡像素**、权限对照通过，正对照数字保持。[触屏报告](stair-label-occlusion/final/touch-report.json) **1/1**，covered 0；两份报告页面错误/外部请求为 0。最终碰撞帧：[1280×720](stair-label-occlusion/final/1280x720-during.png)、[1920×1080](stair-label-occlusion/final/1920x1080-during.png)、[932×430 触屏](stair-label-occlusion/final/932x430-during.png)。前一主线同步 head `051fc393` 的完整 [CI 40824916410](https://github.com/xuys2025/escape-bincov/actions/runs/40824916410) 已通过；最终 head CI 与合并结果见原 PR。本地首帧/遮罩余项集中到 [#61](https://github.com/xuys2025/escape-bincov/issues/61)，本任务未改断言或墙体。

主审同步（2026-10-29）：main 在实施后合入 #132，已正常同步 `e2728e46`，保留双方交接；scene/host 自动合并，复核后的本任务差异与原实现一致。同步后 Node 24.21.0 的单测 1077/1077、工程守卫 113/113、打包通过，便携 ZIP 6,101,358 B。新主线浏览器与准确 head 平台门禁另见原 PR；以下首轮截图和报告对应原记录哈希，保留不覆盖。

状态：**实现与主审完成，S03c 两档桌面及短高触屏验收通过**；准确 head CI 与合并结果以 [PR #146](https://github.com/xuys2025/escape-bincov/pull/146) 实时状态为准。维护者于 2026-10-29 指派 GPT-6.1 Sol 续作，主代理复核并统筹合并；既有墙过渡首败和真人/真机边界保留。

- 分支：`fix/stair-label-occlusion`
- 建档基线：`03cfb775fbef07c711fe789e9f6e886460261a91`（2026-10-29；#111 已合并）。开工前重新 fetch 并核对原 PR。
- 任务归属：[#26](https://github.com/xuys2025/escape-bincov/issues/26)。只签收 S03c 遮敌子项，总单由主代理维护。

## 问题与目标

楼梯目的地采用 .cs-stair HUD 文字，只避让玩家，没有避让可见敌人；issue26-spatial 的 S03c 仍把 stair-label-over-actors 当作已知缺口，当前测试允许它遮住敌人。

交付目标：楼梯信息在可见敌人经过时不遮住身体，敌人离开后恢复正常显示；隐藏敌人不影响标签。

## 原子范围

仅修复楼梯标签的角色避让和相应真实遮挡反例。可采用碰撞时暂隐或有界避让，保持静止时的目的地可读与玩家避让；不重做整体 UI、门指引或墙体规则。

只核销 #26 F07/F11 中 S03c 遮敌子项，不关闭总单。楼梯方向显式化、门/通道整体理解、#47 美术补图和 #141 墙体过渡均不在范围；SAMPLE_AREA 任务只可能触及 scene 顶部 import，需保留双方改动。

## 接手入口

- [标签位置与可见性](../../src/coast-view/scene.ts)
- [HUD 标签呈现](../../src/coast-view/host.ts)
- [S03c / S04b 遮挡回归](../../scripts/issue26-spatial-test.mjs)
- [商场入口检查](../../scripts/mall-sample-test.mjs)
- [反馈总单](https://github.com/xuys2025/escape-bincov/issues/26)

## 完成条件

- [x] 基线 S03c 的真实重叠场景能够检出旧缺陷；修复后两档桌面均不遮住可见敌人，离开重叠区恢复目的地标签。玩家 S04b 现有避让继续通过。
- [x] 用真正可见的角色/已呈现身体判断避让；未揭示、换层或离屏敌人不能让标签变化并泄露信息。补同位置可见/隐藏对照。
- [x] S03c 移出 KNOWN_GAPS，变为必须通过的断言；若采用暂隐，保留无敌人时标签存在、敌人确在原标签范围内、碰撞前/中/后状态的正对照，禁止靠永久隐藏或放松像素门槛过关。
- [x] 居民楼二楼/地下往返及商场既有楼梯/扶梯显示规则保持；不改变交互范围、可达性、揭示和存档。
- [ ] 全部要求命令已运行并归档截图，但空间套件 20/22、商场套件 24/25，范围外墙过渡首帧断言失败；不能记为全绿。真人/真机未验。

## 本次实现与证据（2026-10-29）

- 开工 fetch 核实 `origin/main` 为 `03cfb775fbef07c711fe789e9f6e886460261a91`，原 PR open/draft、原 head `c62a916908ffffb76c251e3cf796bfc7b381d978`，工作区无已有修改。
- `CoastView.enemyBodyViews` 只投影当前层已呈现身体的实际帧边界（anchor、姿态缩放、倾斜、受击位移），裁剪到画布；未揭示和层外角色不提供避让信号。`CoastSampleHost.stairNames` 逐帧用真实 `.cs-stair` DOM 字框与这些边界相交判断暂隐，离开立即恢复。保留玩家原有下移、楼梯可知性、商场距离/扶梯和交互提示规则。
- S03c 删除 `KNOWN_GAPS`，要求实际碰撞帧 `covered === 0`；强制原标签仅用于重叠正对照，保留原 body/guide/overlap 像素门槛。增加碰撞前/中/后与同坐标未揭示、离屏、当前层缺席对照。`--touch=1` 仅跑 932×430 短高触屏 S03c，不改变产品字号。
- Windows / bundled Node 24.19.0、pnpm 11.25.0：`pnpm test` 1056/1056、`pnpm check:ci` 113/113、`pnpm package` 通过。后续统一项目指定 Node 24.21.0 / pnpm 11.19.0 再打包，HTML 同字节。便携 ZIP 6,036,274 B，web ZIP 6,031,765 B；只记录实际大小。
- 原 head 旧版构建 `test-results/stair-label-baseline/index.html`：沿用正式 `buildGameScript` 配置，用 Git 原提交的 scene/host 替换当前仅有的两份产品变更，其余源码/资产/页面模板未变。SHA-256 `a190498102bdf579ed82b70627ea2c1e36ce339ac76881db85e4977a99c21c45`，与另一个工作树独立正式重建的原版一致。当前 HTML SHA-256 `ea9d28f0538f208ce64aec1ed6cd9e377c190d8b62bc89cce57b256d6ecf83f0`。
- 浏览器为 Windows / Chrome 156.0.8078.48，Node 24.21.0，离线真实构建；全部持有 `D:\bincov\browser-validation.lock` 串行运行，外部请求与页面错误为 0。[旧版报告](stair-label-occlusion/baseline/report.json)、[候选首轮报告](stair-label-occlusion/candidate/report.json)、[触屏报告](stair-label-occlusion/touch/report.json)、[商场报告](stair-label-occlusion/mall/report.json) 保留实际首败。

| S03c 像素 / 状态 | 1280×720（缩放 5/3） | 1920×1080（缩放 2） | 932×430 触屏（缩放 1） |
| --- | --- | --- | --- |
| body / guide / overlap 正对照 | 1345 / 2112 / 348 | 1836 / 2112 / 388 | 459 / 1440 / 252 |
| 旧版 covered | **85，硬断言失败** | **74，硬断言失败** | 未跑旧版触屏 |
| 修复 covered | **0** | **0** | **0** |
| DOM 字框 | 96×22 px | 96×22 px | 72×20 px |
| 碰撞前 / 中 / 后 | 显示 / 暂隐 / 恢复 | 显示 / 暂隐 / 恢复 | 显示 / 暂隐 / 恢复 |

三档均通过同坐标可见/未揭示与离屏、当前层缺席对照；隐藏对照仅对视图帧撤回真实 region 的揭示许可，玩家所在建筑仍提供楼梯可知性，不以楼梯自身隐藏冒充无泄露。Runtime 权限字节保持不变，原 body/guide/overlap 阈值未调低。

完整空间套件：候选 **20/22**，仅两尺寸 S04d coming-in 的整像素墙过渡中间帧失败（sunk 约 0.0305/0.031、部分 dy 0）；旧版 **18/22**，除预期 S03c 两项外，同样两尺寸 S04d 失败（sunk 约 0.0345/0.03）。商场候选 **24/25**，M14 楼梯/扶梯规则通过，唯一 M21 失败（sunk 0.97、dy 48 等于 80−32；旧版由并行 #145 在相同原版哈希复现）。本轮 M03c 通过；不声称修复了其在并行原版/候选中的波动。未改墙体源码或这两条断言，交主代理审查。

真实截图（已目视核对）：

| 视口 | 旧版碰撞 | 修复前 / 中 / 后 |
| --- | --- | --- |
| 1280×720 | [旧版](stair-label-occlusion/baseline/1280x720-during.png) | [前](stair-label-occlusion/candidate/1280x720-before.png) / [中](stair-label-occlusion/candidate/1280x720-during.png) / [后](stair-label-occlusion/candidate/1280x720-after.png) |
| 1920×1080 | [旧版](stair-label-occlusion/baseline/1920x1080-during.png) | [前](stair-label-occlusion/candidate/1920x1080-before.png) / [中](stair-label-occlusion/candidate/1920x1080-during.png) / [后](stair-label-occlusion/candidate/1920x1080-after.png) |
| 932×430 触屏 | 未跑 | [前](stair-label-occlusion/touch/932x430-before.png) / [中](stair-label-occlusion/touch/932x430-during.png) / [后](stair-label-occlusion/touch/932x430-after.png) |

真人手感和真机未验；自动化夹具不代替人工验收。当前未合并、未发布；准确最终 head 与 CI 由原 PR 正文维护。

## 建档历史

已核对最新 main、任务清单、对应源码和开放 PR，无同目标开放 PR。仅文档，不宣称上述实现和测试已完成；本次文档检查与实际结果见 PR 正文。源码、存档、生成物和部署均未改。

实施完成后在本文件或原 PR 更新实际结果、首败、截图/报告和未验证边界；同步相关 issue 与 WORK-QUEUE 的这一项即可，不扩大为清理整个历史任务表。
