## 2026-10-29 · HUD 堆路径消费字段校验（PR #144）

沿 `fix/hud-path-observations` 与 [PR #144](https://github.com/xuys2025/escape-bincov/pull/144) 续作，基线 main `03cfb775`、原 head `4cf4f72c`。输入在 flat-table 算术与 typed array 写入前校验；坏 edge_count/索引/stride 明确报文件与字段，任一输入失败均不创建或覆盖报告。合法输出、weak 排除、80 节点路径与字符串省略保持；只约束消费字段，原工具仍为 review。

[任务与首败](docs/tasks/todo-hud-path-observations.md)、[真实 CLI10项](scripts/ci/hud-paths-input.test.mjs)、[原实现负对照](scripts/ci/fixtures/hud-paths-before-validation.txt) 为接手入口。Windows Node24.21.0/pnpm11.19.0：1056 单测、123工程守卫、package 均通过，便携 ZIP 6,035,864 B、web ZIP 6,031,355 B。首轮专项发现报告末尾换行回归，恢复原字节后10/10；旧CLI null仍错误exit0/不可达，修后exit1且哨兵不变。准确head与CI见原PR；未运行浏览器/真实堆/60轮/真人真机，F20/PARTIAL不变。总单状态与最终审查合并交主代理，未合并/发布。

## 2026-10-28 室内墙体切换过渡：墙下沉／升起

承接 [PR #141](https://github.com/xuys2025/escape-bincov/pull/141)，分支 `feat/indoor-wall-transition`，起点 main `6758d65`（已含 [PR #135](https://github.com/xuys2025/escape-bincov/pull/135) 的两阶段墙体规则）。#135 合并后维护者试玩，反馈切换“没有过渡、不自然”。可选“墙往下沉”和“慢慢变透明”，维护者选了下沉。

已实施：墙在 0.2 秒内整像素沉进占地格（到底等于基础格图），恢复时升起，中途掉头从当时位置返回；门洞裁切原地保持，墙上附着物跟着下移；走出建筑时原建筑的墙先升回再交还淡出。场景首帧和“减少动态效果”直接切换。规则和细节记在[方案 §6 第三阶段](docs/INDOOR-WALL-VISIBILITY-PLAN.md#第三阶段切换过渡已实施待合并)；只改显示，存档、地图、碰撞和房间揭示都不变。

维护者 2026-10-29 在局域网试玩 `1d0bb8a6` 的构建（商场），反馈“手感可以”。未做：真机。准确 head、CI 与已跑检查见承接 PR。

## 2026-10-28 · PR #137 合并前主线复核

原 head `8c68a3f2` 完整 CI 40632571602 已通过（构建、8组浏览器和最终门禁）；合并前 fetch 发现 main 新增 #135/#138 等，正常合入 `681426b022540dc94421ec06505ccf77b11ce470`。冲突仅任务清单与交接，两边全部保留；游戏代码无需人工冲突修正。最新集成验证和合并状态以原 PR #137 为准。

## 2026-10-28 · PR #137 CI S6 补修

同步 main `d27306b4`（保留 #110/#116）。旧 CI 唯一套件失败为 station-reset S6 短暂冲突提示观测超时，本地旧脚本14/14；现恢复前台并在真实点击前记录新出现的可见 DOM 提示，保留拒绝写入/备份/下载及持久弹框断言，测试提示消失后的证据保留。1048单测、99守卫、package、station-reset14/14均通过。准确新head完整CI见原PR；旧失败保留，不声称已合并。详情见原质量摘要Q-E04。

## 2026-10-28 · Q-E04 事务发布失败

最终串联：正常合入 #136 `07babfa8`（含 #117 `4ba5b72`），集成源码 head `a46cfd8798c9b9f3c7c7345a456647956e308793`。1045/1045 单测、86/86 守卫、package、17/17 save-browser 全过；新截图/报告在 `docs/tasks/transaction-phases/integrated/`，旧证据保留原归属。PR base 仍 main，必须按 #117 → #136 → #137 合并，各准确集成 head 完整 CI 通过后由 root 执行；没有改动前两项源码逻辑。

承接 [PR #137](https://github.com/xuys2025/escape-bincov/pull/137)，实现及浏览器证据提交 `e703f14dae521ea91951f61c533581558885f42e`；最终 head/CI 以 PR 为准。任务 `codex/transaction-failure-phases`，基线 `0f73a67386bac196b87c983668295be6d1a99f1e`；本轮交付与证据集中在[原质量摘要 Q-E04](docs/tasks/quality-entropy.md#q-e04-提交后的发布失败)。先读 Session `persist` / `requiresReload`、Store `commit` 及 `tests/session-publication.test.ts`。已确认旧代码写后 restore 失败会使现金磁盘 680 / 内存 700；本轮独立发布失败结果、停写/暂停和精确已提交备份。产品源码 head `cf5e49eb0a940234ea189d2cc534a6bfc6ca2709`（含 main `630e68f`），1041/1041 单测、85/85 工程守卫、package 与两尺寸 17/17 存档浏览器通过；后续只有测试观测/证据归档。截图与准确 CI 状态见上述入口及承接 PR；真机、长时性能未验，不把已提交视为合并。
## 2026-10-28 · CI：文档快速通道的 main 也要部署和发布

分支 `fix/ci-docs-fastpath-deploy`，起点 main `8c6589b`。#133（纯文档）合入后，main 运行 40623228494（`03ea261`）走了快速通道：浏览器组跳过、`Build and test` 成功，但 `Deploy Pages` 和 `Publish offline release` 都被跳过，`main-latest` 和发布清单停在 `0f73a67`。原因是两个 job 的 `if` 没写状态函数，默认 `success()` 连带检查被跳过的浏览器组。现在两个 job 显式写 `!cancelled() && needs.verify.result == 'success'`，`policy.test.mjs` 守住浏览器组之后的 job，详见 [CI 说明](docs/CI.md#pages-与镜像)。

只改工作流、守卫测试和文档，游戏字节不变。真正的证明要等下一次纯文档 PR 合入 main：两个 job 实际执行，`main-latest` 移到那次提交。准确 head 与 CI 见承接 PR。

## 2026-10-28 室内墙体与视野：居民楼与商场

承接 [PR #135](https://github.com/xuys2025/escape-bincov/pull/135)，分支 `feat/indoor-wall-visibility`，实现 [PR #133](https://github.com/xuys2025/escape-bincov/pull/133) 的方案。维护者同意方案后要求合并 #133 并另开 PR 开始实现；#133 的冲突（任务清单、handoff 两处都保留）经维护者同意推到原 fork 分支。之后维护者要求开自动合并：#133 落后 main 一个提交，经维护者同意用 GitHub 的更新分支合入 main，检查通过后自动合并为 `03ea261`；本分支已合入之后的 main（含 #134、#117、#136，冲突只在任务清单和 handoff，两边都保留）。

已实施：第一阶段居民楼一楼、二楼、地下，第二阶段商场两层（新旧布局和程序绘制后备）。墙按[方案](docs/INDOOR-WALL-VISIBILITY-PLAN.md)五项规则显示，商场原来的房间剖切已删除；实施时定下的细节、分类结果和验证记在方案的[实施进度](docs/INDOOR-WALL-VISIBILITY-PLAN.md#6-实施进度)。只改显示，存档、地图、碰撞、子弹和房间揭示都不变。

未做：维护者试玩；真机。准确 head、CI 与已跑检查见 PR。

## 2026-10-28 Q-E02：公共视图生命周期归位

串联集成：本分支按明确授权正常合入 #117 候选 `4ba5b72c70983f3eefe4affdd31e2d674b3223a3`（fetch 后核对 `origin/fix/content-identity` 同一提交），只消除共同文档冲突，不修改其源码。**必须先 #117 合入 main，再合 #136。** 该候选尚非已接受 main；此前浏览器和制品证据仍只归属原 `14df8ce`，候选集成已通过 1026/1026 单测、86/86 守卫及 package；两份 HTML/两份 ZIP 与明确标注的 #117 候选构建逐字节相同（HTML `bdd50dec…7fc25`），没有将其称为已接受 main。最新已接受 `630e68f` 已确认包含在被测集成中；完整 CI 在新 head 推送后核对，详情见原质量摘要。

[PR #136](https://github.com/xuys2025/escape-bincov/pull/136)，实现 `476086d7dc6e4f3821064c0b8d6d3b47f09680c3`，分支 `codex/shared-view-lifecycle`，起点 main `0f73a67386bac196b87c983668295be6d1a99f1e`。将场景无关 `Scope`/唯一 `lifecycle` 和页面级 Pixi 注册/缓存归位到 `src/view-lifecycle/`，保持直接导入和初始化顺序；原生产/测试引用同步，现役脚本不引用旧路径。职责入口见 [CODEMAP](docs/CODEMAP.md)，决定、首败与验证见[原质量摘要](docs/tasks/quality-entropy.md#q-e02-公共视图生命周期归位)。SAMPLE_AREA/raid-areas 身份、Q-E04 和其他在途 PR 均不在本交付。1022 单测、77 守卫、package、render-targets 5/5、两尺寸程序恢复各 8/8、能力四负载 4/4 通过；两份 HTML/两份 ZIP 与真实 main 构建同字节。旧 lifecycle 1/5 的普通入口首败在 main 同样复现，保留原边界。已正常合入 main `630e68f`（#134）并保留双方文档，新目录纯类型依赖正反例已通过；集成后重跑 1022/1022、86/86、package 全过，四份制品仍同基线。准确 head CI 见原 PR，未合并/发布。

## 2026-10-28 · 居民楼 region 身份（PR #117 续作）

`fix/content-identity` 保留原 PR 历史并依次合入 main `03ea261`、`630e68f`（#134）。居民楼 8 个已有完整 region ID 写入世界定义，投影不按中文名补身份；不变更世界/布局编号或存档格式。楼梯方向和内容登记仍属 Q-E06，未在本 PR 实施。

在未改动的 `03ea261` 独立捕获 mall-v4 两层完整静态投影哈希，合成后逐项相等；原九图 / 28 入口基线及改名、重排、缺 ID 反例亦通过（4/4）。Windows / Node 24 / pnpm 11.19：`pnpm test` 1026/1026、`pnpm check:ci` 77/77、`pnpm package` 通过，HTML SHA-256 `bdd50decc7b30d8e857a1e58c8c1834de0761195fa08de64ce8c0df348a7fc25`。同步 `630e68f` 后重跑：专项 4/4、`pnpm test` 1026/1026、`pnpm check:ci` 85/85、`pnpm package` 通过。两次 main 的游戏源码与素材无变化，复用此前打包 HTML 的 `pnpm test:raid-default` 11/11（含居民楼、mall-v4 和旧行动恢复）；准确 head CI 状态见 PR 正文。真人体验不由自动测试替代。

## 2026-10-28 · 新一轮减熵：架构门禁与依赖查询（#60）

- 基线：`3b61d52e898459f3e197584ae202285e7ade65e2`；分支 `codex/entropy-architecture`；[全库扫描/候选清单](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6449666799)。原改枪 M3 检出保留。
- 本批：统一源码 AST 图、动态加载/类型导出/自环检查、沿核心依赖闭包约束 61 个模块，以及只读 `pnpm architecture [src/path.ts] [--json]`。入口：[实现摘要](docs/tasks/quality-entropy.md#2026-10-28-架构门禁与按文件查询)、[代码导航](docs/CODEMAP.md)、[共享分析](scripts/source-graph.mjs)。
- 实测：原始基线 1020/1020 单测、85/85 工程守卫、package，三份制品与该基线字节相同；正常合入 main `0f73a67386bac196b87c983668295be6d1a99f1e` 后重跑 1022/1022、85/85 与 package 均通过。动态反向依赖负对照旧守卫 3/3 放行、新守卫拒绝，已还原。独立源码审阅无阻塞，src/assets/锁文件相对最新 main 无差异；准确 head CI 与合并状态见 [PR #134](https://github.com/xuys2025/escape-bincov/pull/134)。
- 未验：本地浏览器、真机/F20/性能未运行；产品行为未变。准确提交与完整 CI 以本批 PR 为准，未合并/发布；后续候选按 #60 原归属推进，既有修复 PR 保持原承接。

## 2026-10-28 室内墙体与视野设计（功能未实施）

维护者要求只生成文本，核验后提交文档 PR。本轮基于 main `b5bd63b7896b3b0697d4ba38d02d000e78903047`，分支 `docs/indoor-wall-visibility`，新增[室内视野设计](docs/INDOOR-WALL-VISIBILITY-PLAN.md)并同步任务入口。所有室内适用、完整基础格、连续横墙段切换三个选项已由维护者确认；五项显示规则、缓冲、兼容边界和后续验收统一维护在方案内。

已静态核对通用墙体与商场绘制、淡出和揭示路径及现有测试命令。没有同目标开放 PR，#130 仍承接商场家具和地面换图。默认沙箱启动失败后，提权完成 Git 状态检查与 fetch，使用独立工作树验证，保留原工作区已有修改。上游连接无分支写权限，改用已有 fork `LMX-323/escape-bincov` 提交。文档链接、源码事实和差异已核对；纯文档交付未运行游戏测试或打包；准确 head 与 CI 状态见承接 PR。游戏代码及两尺寸、真人、真机验收均未实施，不表示已上线，不自行合并。
## 2026-10-28 #47 M2：家具与地面素材接进布置表（PR #130，`agent/mall-m2-sprites`）

维护者 10-27 说“接着做 #47 M2，把已有的家具和地面素材接进布置表”。基线 main `98968e1`（含 #127、#128、#115、#129、#108、#112），独立工作树开发，不碰 C:\bincov 里其他会话的分支。

- 家具：`mall-dressing.ts` 的 `mallProps` 给 26 种四版家具先选 M2 素材，程序绘制件留作后备。连排件按邻居选端头、中段（a/b 交替）或单件；墙架和柜台按店铺选外观，其他店铺用零食架和普通柜台。玻璃柜台、售货机、配电柜带同名发光遮罩。
- 底座：素材多数填满占地，投影按占地画、由场景按图收窄；人台、衣架、快餐桌凳、滑梯、竹屏风按图量了底座（`DRAWN_BASE`），程序件那套窄底座不再用。
- 地面（只在四版）：水泥（后场、仓库、电房、服务通道）、地毯（办公室、财务室）、橡胶垫（儿童乐园）、小方砖（厕所）、沥青（南街、卸货区）。地面改按最内层房间取区域，二层电房不再铺成儿童乐园的地面。
- 素材问题：快餐柜台 `mid-b`、`end-e` 和洗手台 `mid-b` 有透明竖缝（碰撞连续，看着像能过），仓储货架 `end-e` 有导出花纹。四个模块暂用同类代替（`SAMPLE_STAND_IN`），待 Sol 重新导出，对照图 `docs/mall-2-5d/m2/stand-ins.png`。
- 测试：`tests/mall-dressing.test.ts` 改为检查素材 ID、画布尺寸、连排位置、替代、底座、发光和新地面；`test:mall-sample` 的 M20 改为两层 132/107 件全画素材、程序绘制件 0 件。

存档、布局、碰撞都没改，一至三版画面不变。实测结果和截图见 PR 正文与 `docs/mall-2-5d/screens/22`～`29`。未做：维护者观感、真机、建筑补图、M3。开 PR 后 #106 合入 main，已把 main `02b5e1e` 合进来，只有本文件冲突，保留双方小节。

## 2026-10-28 #26 F16：水产站玩家空手手臂与手

承接 [PR #131](https://github.com/xuys2025/escape-bincov/pull/131)，实现提交 `750d6a9a050495a56e7fe8eaf45d334de3d5069e`，准确 PR head 和 CI 见原 PR。

完整 `test:station` 是手动项；新增的 `test:station-hands` 只运行 H15，在 CI batch-2 执行，同步了检查导航与 CI 清单（现 45 条浏览器命令）。

维护者授权修复并开 PR。基线 main `02b5e1e5c5261f5caea55dccc875c8ae93e3120b`，隔离分支 `codex/f16-station-hands`。`src/station-view/art/player.ts` 的 `paintStationPlayer` 在站内生成完整空手帧，`HideoutScene.playerTex` 沿用原纹理缓存；不改共用身体 PNG 或行动手臂/武器分层，脚底、碰撞、存档与离线能力不变。

源码入口、80帧浏览器检查、修复前负对照和两尺寸真实截图见[本项记录](docs/tasks/station-player-hands/README.md)。当前通过：1020 单测、打包、CI 策略 73/73、H15 两尺寸、行动动画 8/8 与冷素材加载；完整站内 78/79，I3 手机菜单切修理铺在原 main 对照和修复构建中均同样超时，保留失败，不拼为完整通过。准确 head、CI 与审阅状态见本项 PR；尚未合并/发布，真机与真人姿态观感待验。#26 其他反馈保留原归属。

## 2026-10-28 行动精神/水分/饱食 HUD 实时投影（PR #110）

沿原 `fix/live-vitals-hud` 正常合入 main `03ea26198259fa66ee7a39c32c06466a1545e76f`，随后同步共同截止主线 `630e68f517edea34bfbcc548473897bd36bdfa08`（#134），保留商场四版/M2、背包服务和其他任务交接；受检源码 head `19dea0bfa59042281b4c7ec1f085aa3e8587e3b8`，随后只更新证据文档，最终 head / CI 见 [PR #110](https://github.com/xuys2025/escape-bincov/pull/110)。投影从实时身体复制精神/水分/饱食三个标量；宿主沿原八帧节奏舍入显示；经典行动为 null，存档、生理规则及事务不变。

本轮 1025 单测、77 工程守卫、正式打包、完整 QoL 5/5、默认行动 11/11 首次通过。新 main 两尺寸负对照有效失败、修复后实时/帧/DOM 一致，保存值未变；已亲看双尺寸截图，原始失败和本轮结果留在同一[摘要](docs/tasks/audit-contracts.md#精神水分饱食-hud-的实时投影)/[报告](docs/tasks/audit-contracts/live-needs/report.json)，不拿旧 CI 代替新 head。没有真机、真人或性能签收，#60 其余范围继续开放；等待准确 head CI 与维护者审阅，不自行合并发布。

最新同步后实际重跑工程守卫 **85/85** 和 package 通过；src/tests/assets、全部浏览器流程与依赖输入相对已验 `d0ebc57` 未变，正式 HTML SHA-256 仍为 `f61862ed972f8efaab0c8abf7c9360ab2aebbd751d943dfa77ad8211c5568b72`。上段单测/浏览器/截图据此复用，没有重复执行或新拍；旧 head CI 40624184384 已成功但仅作历史，新准确 head 完整 CI 以原 PR 为准。输入一致性和新结果记录在同报告 `main630Integration`。

维护者已明确授权复查后自动合并；本次正常同步 main `f66ee79af6b84ef64319891e82d7dc4e82985350`（含 #117/#136），保留上游身份与共享生命周期归位。本节原验证证据保留历史归属，当前守卫、打包及准确新 head CI / 自动合并状态以原 PR 为准，不绕过检查或保护。

## 2026-10-27 改枪 M2：工作台、预设、美术、详情与商店、全流程检查（#106）

`feat/gunsmith-m2` / [PR #106](https://github.com/xuys2025/escape-bincov/pull/106)（草稿），已同步 main `0d20857`。本日合入暂停的 M2-03/04/11/13 分支，并完成 M2-05～08、M2-10、M2-12、M2-14；M2-15（维护者试玩、合入）待办。

- 工作台（M2-05/06）：院子面板（10-27 晚改为居中固定大小，见本节末条），旧页签同一面板做浮层；三处入口；点配件只改预览，确认一次写入；换枪、关闭先问；手机三页加固定底部条。
- 维护者 10-27 对待定事项「全部按建议」，记为 CONTRACTS 开头的「M2 决定」；O01、G01 上货架。
- 预设（M2-07）：profile 可选字段 `gunPresets`，不升版本；**旧客户端读到带预设的存档会拒绝读取（不覆盖）**，没有预设的存档不受影响，CHANGELOG 已写。
- 美术（M2-10）：Sol 的 115 张图按配置组合三种输出，与 Sol 的 29 组预览逐像素相同；缓存有上限；地上的枪和武器卡用整把枪的侧面图（维护者说方图特写认不出）。
- 详情与商店（M2-08）：三处详情共用文字，售价按组成；出售构成；目录筛选和分页。待买、待卖区仍 4×3，M3 加入 5、6 格长的枪时由单测提醒改成 6×2。
- 检查：`test:gunsmith-bench`（batch-5）、`test:gunsmith-flow`（batch-6），共 42 套。本机射击检查 k（拥挤战斗声音预算）在 main 自己的构建上也失败，属本机环境，以 CI 为准。
- 契约与决定：[CONTRACTS.md](docs/gunsmith/CONTRACTS.md)；进度：[#80](https://github.com/xuys2025/escape-bincov/issues/80)。未做：工作台插槽按钮放到图上的挂点处。
- 10-27 晚维护者试玩反馈两处，都在 #106 修好：院子导入存档时选文件超过 5 秒，菜单重画把选中的文件丢了（main 上原有的问题，`c716003`）；工作台电脑版重排，点配件时只有枪上那一块、位置格、数字和底栏变，其他框都不动（`c503cd6`，CONTRACTS「桌面布局」）。顺带让整备面板在 1280×720 不再多出 9px（station H11）。合并时同步 main `98968e1`（含 #127、#128、#115、#129、#108、#112；CI 共 44 条浏览器命令；#129 的换枪去掉了已退役的样枪调用，局内背包的「是不是枪」改用 `D.isGun`）。合并队列里 #106 排在 #115、#129、#108、#112 之后，它们合入后要再同步一次 main。

## 2026-10-27 #26 F15：局内主武器槽，拖枪即装备（PR #129，`agent/f15-raid-equip-slot`）

维护者 10-27 说“把 #115 合进去，然后把 F15 完善起来”。分支从同步后的 #115 head `a256e3c` 开出，依赖 #115 的有限服务接口；#115 合入前本 PR 的差异里会带上它的提交。10-27 晚 #128（F14）合入 main 后，先同步 #115（`b6bffa4`），再把它合进本分支；只有任务清单冲突，F14 与 F15 两段都保留。

- 面板：随身物资和搜刮面板左侧、安全箱上方加主武器槽（宽度固定三格，换枪不挪列）。背包或来源里的枪拖进去即装备；点选枪后点槽也装备（触屏和点选放置用这条）；详情的「装备主武器」现在也出现在来源里的枪上。槽在拖到上方时变绿或变红，底栏写原因；非枪和安全箱里的枪拒绝，安全箱文案与水产站一致。
- 规则：`D.equipRun` 增加可选来源容器，安全箱永远不是来源；换下的枪和余弹仍只回背包，放不下整笔拒绝，来源和装备不动。
- 事务：新服务 `equipLoot`（`raid-runtime/runtime.ts` 的私有 `equip` 与 `equipItem` 共用），在 Runtime 事务里从活容器取枪；容器是世界状态，经 `snapshot` / `snapshotExpansion` 与装备、背包同一笔写入，拒绝或失败由 `mutate` 回滚。提交后发 `looted`（`to: 'equip'`，契约里早已有这个值），声音和尘土照旧；提示只由面板发一次。
- 测试：领域反例（安全箱、非枪、错容器、满包原子拒绝），正式工厂三种地图的单写、失败回滚和重试、拒绝不写；`test:issue26-inventory` 新增三组（拖箱/拖包/非法、点选/按钮、满包与配额回滚），原“外部枪不能直接装备”断言改为能装备。

存档格式、版本、时钟和其他规则不变。本机结果和截图见 PR 正文与 `docs/tasks/raid-equip-slot/`。未做：真机、真人手感。和 #106（改枪 M2，草稿）在 `inventory.ts` 详情两行、`runtime.ts` 的 `equipItem` 会有文本冲突，谁后合谁解。

## 2026-10-28 资源报告消费校验续作（PR #116）

继续原分支 `fix/resource-report-validation` / [PR #116](https://github.com/xuys2025/escape-bincov/pull/116)，原 head `902a449ccf34d817a41a7260f30eb55bf3779239`，先正常合入 main `03ea26198259fa66ee7a39c32c06466a1545e76f`，本次再正常同步共同截止 main `630e68f517edea34bfbcc548473897bd36bdfa08`。只改两份 review CLI 的输入消费边界与纯 Node 回归，不改游戏、算法、阈值或采样器；#111 的 rounds 与 #118 的堆输入各由原 PR 承接，#32 F20 仍 PARTIAL。

旧 main CLI 实际接受 13 类反例：重复轮次、缺 release/quad 身份、null/巨大 heap、缺 table/type/label、字符串 live、重复槽位键和缺释放观察。原 PR 已拒绝其中七类，本轮补全另六类：在过滤前验证 table；摘要与槽位检查各自消费的键/布尔值并拒绝表内重复身份；live 槽位要求用于身份输出的 type/label，null 占位继续无需这些字段；freed 分支仅要求被复制的 scene/parked 属性存在，保留 null 和原值，不扩展为深层 schema。identity-probe 仅检查用于 added/removed 的纹理键；其他状态与附件原样保留。

本次 Windows / Node 24.22.1 / pnpm 11.19.0：13 项真实 CLI 回归通过（含逐项字段矩阵、晚到的非法 probe 在写任何报告前拒绝、已有输出不被覆盖、合法 1 轮 partial 与 null 占位）。同一输入对比 main 旧 CLI：普通值、MAX_SAFE_INTEGER 和 0/上界交替三组共 39 份摘要输出逐字节一致；两组有/无 null 占位的槽位输出也逐字节一致。13 类反例旧 CLI 均 exit 0，修复后均 exit 1。原始证据保留在忽略的 `test-results/pr116/`。前次集成提交 `04c4218` 的完整 `pnpm test` 1022/1022、`pnpm check:ci` 90/90 与打包均通过。本次同步后实际 `check:ci` 98/98（含重跑 CLI 13 项）、严格打包通过；游戏/测试/依赖与两 CLI/helper/测试/producer 输入逐字节未变，复用该提交的 1022 单测及 41 文件对照，不重跑旧反例。重新生成 HTML/portable/web 的 SHA-256 分别为 `f3b7c3e1...` / `66a0d6f2...` / `cc311e1d...`，均与前次逐字节相同；证明和新日志在原证据目录。相对截止 main 的 `git diff --check` 通过。准确最终 head 与远端完整 CI 在原 PR 更新，不引用 10-25 旧 CI 代替。

本地未运行浏览器、trend、实际 60 轮或堆采样，不宣称资源/F20 签收。代码父审与本机完整验证已通过，继续原 PR 正常提交推送并核对准确 head 完整 CI；仍为 draft，未转 Ready、未合并或发布。

维护者已明确授权复查后自动合并；本次正常同步 main `f66ee79af6b84ef64319891e82d7dc4e82985350`（含 #117/#136），保留上游身份与共享生命周期归位。本节原验证证据保留历史归属，当前守卫、打包及准确新 head CI / 自动合并状态以原 PR 为准，不绕过检查或保护。

## 2026-10-27 #115：行动背包有限服务同步 main（续作）

维护者 10-27 要求查看 #115 去向并合入后再做 #26 F15。#115 自 10-25 起无人续作、无评论，准确 head `3e1047b` 当时 CI 全过。本次在隔离工作树把 main `86add10`（#126、#127 等已合入）合进原分支：源码自动合并，只有本文件冲突，保留双方小节。实现和接口不变；同步后的验证结果见 PR 正文。F15 另由 PR #129 承接（基于本分支）。10-27 晚 #128（F14）合入后，再把 main `8b59019` 合进来一次，同样只有本文件冲突，保留双方小节。

## 2026-10-28 Shader cache 快照消费字段校验（PR #118，`fix/heap-cache-input`）

复用 [PR #118](https://github.com/xuys2025/escape-bincov/pull/118)，续作前 head `039bac0d7e27905857ac989b2f6e9bc061f547dc`。本轮先正常合入 main `03ea26198259fa66ee7a39c32c06466a1545e76f`（`3613b04`），交付 head `bb507f1` 的完整 CI [40624444343](https://github.com/xuys2025/escape-bincov/actions/runs/40624444343) 已通过。main 新进 #134 后，再正常合入共同截止点 `630e68f517edea34bfbcc548473897bd36bdfa08`；只在本文件顶部冲突并保留双方小节，#134 的架构工具、分类与入口完整保留；准确交付 head 与远程检查见原 PR。职责仍是 #32/#60 的 shader-cache review 分析器输入校验，与 #116 station 报告消费字段校验分开。

原脚本把 shader string 的 null `self_size` 加成零：最小图 cycle-30 应有 80 bytes，旧 CLI 仍 exit 0 并写 `newRetainedBytes: 0`。现在 [`validateSnapshot`](scripts/sol-heap-cache-inspect.mjs) 只校验实际消费的 flat-table 字段：缺失/重复字段、类型与表索引、不完整行、非安全整数 id/bytes、重复 id，以及 cycle-30 incoming edge 计数/偏移/命名；`sumBytes` 拒绝不精确求和。只在所有消费校验和报告准备成功后写 `shader-cache.json`，拒绝时保留已有报告字节。未消费的 metadata、额外列/类型允许，cycle-10 不要求未消费的 edge 图。不做完整 V8 schema 或业务内存预算校验。

本轮 [CLI 测试](scripts/ci/heap-cache-input.test.mjs) 从原五组扩成十组：新增已有报告保留、重复字段、坏表/identity、edge_count 求和溢出、未消费 metadata/额外列与类型/空图、稳定 node id、weak/hidden edge、两端 MAX_SAFE_INTEGER 精确字节和、七跳边界与十二样本截断。原五组在当前 main 旧脚本实际为 1 通过/4 失败；候选扩展十组实际 10/10，不把两者写成同一测试集。合法合成图新旧报告除生成时间外所有字段 deepEqual。

Node v24.22.1 本轮实际生成两份 V8 快照（5,210,690 / 5,211,160 bytes），候选 CLI exit 0，新增人工字符串 2 节点/176 bytes、3 owner paths。这只是 Node 人工字符串图的格式兼容证据，不是浏览器/游戏 shader 泄漏或 F20 签收。原始快照、采集脚本和日志只在忽略的 `test-results/pr118/`；首轮未扁平化人工字符串只得到零匹配，已修 fixture 重新捕获并核对非零观察。没有变更分析算法、阈值、游戏、历史证据或测试分类。

此前 `bb507f1` 已实际通过完整 `pnpm test` 1022/1022（63.87 秒）、`pnpm check:ci` 87/87、`pnpm package`、CLI 十组与入口文档三组合跑 13/13，且其完整 CI 已通过。合入 #134 时逐字节核对本任务生产脚本、十组 CLI 测试与锁文件不变，依赖声明和 test/check:ci/package/build 命令不变，游戏 src/assets/tests 不变；1022 单测与真实快照兼容证据按同代码复用，不声称重新采样。当前合成树已重新实际通过 `pnpm check:ci` 95/95（18.56 秒，含 CLI 十组）、`pnpm package` 与 `git diff --check`，三产品 SHA-256/字节数与此前及 main 一致。新日志为 `test-results/pr118/check-ci-630.log`、`package-630.log`，输入核对与三哈希为 `merge-630-inputs.json`、`product-hashes-630.json`；生成物不提交。首次本地输入比对发现测试工作副本 mixed 换行，归一为已提交 LF 后字节一致；冲突解决前误启动的一次守卫日志仅留 before-resolution，不作为当前验证。未另跑本机游戏单测/浏览器、游戏堆采样、trend 或 60 轮/F20，不关闭 #32/#60；新 head 完整 CI 以原 PR 实时链接为准，旧成功不代表新 head。已 Ready，未启用自动合并、未合并或发布。

维护者已明确授权复查后自动合并；本次正常同步 main `f66ee79af6b84ef64319891e82d7dc4e82985350`（含 #117/#136），保留上游身份与共享生命周期归位。本节原验证证据保留历史归属，当前守卫、打包及准确新 head CI / 自动合并状态以原 PR 为准，不绕过检查或保护。

## 2026-10-27 #26 F14：商场里没揭示的房间压暗（PR #128）

维护者 10-27 在局域网试玩商场四版后反馈：“目前可视范围指示不太清晰：有时候敌人看不见，我又不知道他在视野盲区里，会让人感到疑惑。”分支 `claude/issue26-f14-reveal-cue-a98142`，基线 main `0d20857`，#127 合入后正常合并 main `86add10`（无冲突），在四版上复查。

- 复现：一层中央超市西侧走廊，离超市 2 格、中间没有墙，超市里的敌人一个都不显示，往前一格全部出现。原因是商场不画天花板（维护者此前的决定），没揭示的店铺看上去和空房间一样。
- 本地做了三个原型（A 压暗；B 虚线框加“视野外”；C 10 格内看得见房间地面就揭示整间，要改 Runtime 规则），配真实截图请维护者选，维护者选 A。原型只留在本地分支 `proto/f14-options`，未推送。
- 实现：`lighting.ts` 的 `Lighting.setUnseen` / `syncUnseen` / `unseenAt` 和 `UNSEEN_TINT`；地面在光照层乘，立着的图经 `at` 乘同一层；`scene.ts` 的 `rebuild` 只给有素材的商场楼层传房间。压暗跟房间的灯同步（揭示后 0.3 秒退掉，隐藏同一帧回来），重叠房间取最暗一层，只读 `revealed`。揭示规则、存档、遭遇都不变；发光贴图不压暗。
- 检查：`tests/coast-lighting.test.ts` 新增 4 条；`test:mall-sample` 新增 M03c（自动找一个从走廊正对、中间没墙的房间：地面和家具变暗、走廊不变、房间里有没有敌人逐像素相同、揭示后不留、再隐藏同一帧回来）。两者在 main 的源码上都失败。

本机实测（合并后 head `c961d53` 的代码）：单测 925/925，`pnpm package` 通过（HTML SHA-256 `af5e1b5769a56cc2c0440b1359412a96c89f98ad8dc134ac2c777d5399f9cd0f`）；浏览器 16 套全部通过：`test:mall-sample` 24/24（含 M03c）、`test:coast-sample` 53/53、`test:coast-animation` 8/8、`test:coast-render-targets` 5/5、`test:raid-default` 11/11，以及 issue26-spatial、browser、ui、art、tactical、asset-load、hud-release、shooting、enemy、mobile、buildings；工程守卫 63/64（唯一失败是本机便携 Git 路径的已知环境问题）。`test:title-water`（本机缺 Playwright ffmpeg）和 `test:station-capability`（需真实 GPU）未运行。合并前中止的第一轮套件进程没有停下，和重跑重叠了一段并共用日志目录，以上结果按重跑写入的顺序认定。合并前那次 `test:coast-sample` 的 W13 读到空落幕文案失败一次，是 PR #95 在修的已知时序问题，合并后重跑通过。截图（1280×720 前后对比、1920×1080、844×390 触屏仿真）在 `docs/mall-2-5d/screens/19–21`。

未验：真人观感、真机。下一步：等维护者看 PR #128；需要时按 https 在局域网提供本分支构建试玩。F15 未开工。

## 2026-10-27 #47：M2 家具与地面素材四批齐备（续作 PR #127）

按维护者“开始作图”指令，从已接受 main `0d20857`、PR #127 head `60a0d93` 接手，隔离工作树 `C:/bincov/test-results/mall-m2-art`。沿原 PR 完成 P0 → P1 → P2 → P3：26 种家具、105 本体 + 11 emit + 10 地面，共 126 PNG；内置 image_gen 的 40 张原图（含两次修订前图）与完整提示词保留。manifest 修订 5 注册 236 项，原 110 项不变，不改布局或存档。入口：[M2 当前交付摘要及四批预览](docs/mall-2-5d/m2/README.md)、[独立验证](docs/mall-2-5d/m2/m2-validation.json)、[原任务书](docs/mall-2-5d/m2/TASK.md)。

最终实测：921 单测、打包（HTML SHA-256 `224d158dd9c31e05213eb73610f2474cb0543653fde49a00705dd48d44be54fd`）、商场浏览器 23/23（无错误/外部请求）；126 新 PNG 的硬透明/哈希/尺寸/占地/锚点、26 种源码合同、11 遮罩、54 对连排接缝与 20 组地面周期通过。单测首跑沙箱账号 userInfo ENOMEM，正常宿主重跑与最终复跑通过。竹屏风明确遵循任务表中线薄件特例，B 碰撞不改；地面斜拼和砖缝的首败及修订见交付摘要。**布置表尚未选择新素材**；下一步在 `mall-dressing.ts` 接家具/地面/emit ID，保留程序绘制后备，校正实际底座，再做 1280×720 / 1920×1080 游戏内截图与维护者观感验收。建筑缺口与真机未完成，不能签收整个 M2。准确 head 与 CI 见原 PR；原工作树与其他会话未改，已正常合入 `71a7f18` 的试玩反馈。

## 2026-10-27 #47：商场布局四版，其余 29 区一次铺完（`agent/mall-layout-4`）

维护者 10-27 说“做47”，并选定：四版一次铺完其余 29 区（两个封存检修核和潮汐低地不放）；没有素材的新家具先程序绘制，同时给 Sol 写 M2 任务书。基线 main `0d20857`，独立工作树开发，不碰 C:\bincov 里其他会话的分支。

- 数据：`MALL_V4_LAYOUT`（`src/mall-layout-v4.ts`）＝三版全部家具＋29 区新家具，新增 25 种家具类型；四版不再生成一版角标、二层短货架、服装岛、球池墙和竹隔断，改成命名家具。外墙、房间、门洞、连接、锚点、撤离点不变。一至三版哈希不变（三版此次钉住），四版哈希钉住。
- 出击：新出击一律四版（`sampleMallLayout` → 4）；二层拾荒小队在三版或四版新出击时安装；旧 1/2/3 版行动按原布局恢复，版本号配错拒绝。main `0d20857` 源码读到四版行动：初始化失败、提示原始数据已保留、零写入、原始字节不变（本地探针）。存档格式和版本号没有改。
- 画面：`art/mall-furniture.ts` 程序绘制 25 种家具，画布与将来的素材相同；四版补灯管、地面、杂物，不再压暗或标“样板外”；二、三版画面不变。记录与截图见[商场 2.5D 布局四版](docs/mall-2-5d/README.md#布局四版mall-v4--mall-layout-42026-10-27)，素材任务书见 [M2](docs/mall-2-5d/m2/TASK.md)。

本机实测见 [PR #127](https://github.com/xuys2025/escape-bincov/pull/127) 正文（单测、类型检查、打包、`check:ci` 63/64 的已知环境失败、`test:mall-sample` 23/23、落点、同层开口、默认出击、系统、背包扩展、敌人套件）。未做：M2 正式素材、平衡、四版帧时间与纹理内存、真机。`enemy-performance.mjs` 仍按三版测以便对比。

10-27 晚维护者在局域网另一台电脑（192.168.10.84）试玩四版。局域网 http 地址不是安全上下文，没有 `navigator.locks`，普通入口打不开存档（靶场入口不读存档，所以 #126 没遇到），改用 7 天自签证书的 https 服务。维护者没有说通过与否，提出两条反馈，原话和现状登记在 [#26 F14/F15](https://github.com/xuys2025/escape-bincov/issues/26#issuecomment-6440946343)：看不见敌人时不知道他在视野盲区（商场没有天花板，没揭示的店铺只差灯没亮）；局内背包装备武器要选中再点按钮，希望像塔科夫那样拖到人身上就装备。两条都不在本 PR 范围，未排期。

## 2026-10-26 #119：枪身回缩候选同步 main，接入新版/旧版开关

`feat/weapon-retraction-prototype` 同步 main `1a4fe66`（#121、#122、#123、#125 已合入）。只有本文件和任务清单冲突：本文件保留双方开头小节，任务清单取 main。`scene.ts` 自动合并，回缩钩子位于 `landBlows()` 之后，类型检查通过。按 H-01“关掉时回到改动前的画面”，回缩和火光跟随枪口归入 `ViewOptions.feel`：试枪场“打击感：旧版”和减弱动效不回缩，中途切到旧版即清掉脉冲；`weaponRetraction` 只留给证据探针。`test:shooting` 新增 j 项，检查新版四个方向逐帧回缩、第 5 帧回位、火光不离枪口，以及旧版和减弱动效保持不动。

本机 Windows 实测：单测 898/898，类型检查、build、package 通过（worktree 里 pnpm 11 会因 node_modules 是链接而尝试重装，故直接用 node 跑相同脚本），`test:shooting` 12/12，`test:range` 通过，证据探针 12 组 A/B 和边界检查通过。工程守卫 63/64，唯一失败是本机便携 Git 的已知环境问题，CI 上通过。维护者 10-26 在试枪场试玩后认可新版，同意合并，#119 转为 Ready；真机未另行确认。H-09 按枪种调幅度在合入后再做。

## 2026-10-25 #75：枪身回缩私有候选（未视觉签收）

独立 `feat/weapon-retraction-prototype` 从 fetch 后 main `974a3a8d1ad2a7662c3a828226295d6c9b31eb64` 开始，不改 #113/#106 或私有整合树，先本地验证，再由 root 审阅决定公开交付。root 选择纯表现 B 候选：真实 shot 当帧原位置；之后无新 shot 的帧按现有 scene 时间先扣除 80 ms 剩余，再投影最多 3 世界像素轴向回缩。两数是待试玩候选，未改变 Runtime origin、角度、弹道、存档或枪械手感。超过时段直接零，不保证低帧看见运动，不排逐枪补播队列。

袖管和武器描边继续从最终 weapon transform 跟随；短暂火光后续跟当前实际像素枪口，tracer 保留发射时 from/off 快照。隐藏、武器外观切换、死亡、reducedMotion 清脉冲，actor/map/epoch 释放所有短期状态；未知旧弹无 shot 不造动作。Node 时序与投影回归、实际离线同 packet A/B 和 S1 回归的最终结果见[本候选证据目录](docs/evidence/issue75-weapon-retraction/README.md)；首版“下一无 shot 帧强画峰值”已按 root 指正移除，避免长间隔后补播过期动作。

尚未真人试玩、真机或最终视觉签收；本地完整领域 880/880、工程守卫 64/64、12AB、原射击套件 10/10 与最终类型/打包通过；最后注释后实际制品哈希相同，准确制品和起止见证据摘要。root 已审源码与四张截图，授权正常推送并建立独立草稿 PR；仍未动态手感/真机签收，不转 Ready、不自行合并或发布。#75 其余事项和 #106 M2 原归属保持。

## 2026-10-25 #75：双管命中音按开火与目标聚合

独立分支 `fix/shotgun-hit-sounds`，基线 main `974a3a8d1ad2a7662c3a828226295d6c9b31eb64`。真实 Runtime 反例：60 Hz / 靶距 88 px、120 Hz / 76 px、240 Hz / 80 px 的同一枪六弹丸落在相邻两批，旧音效响两次；另一次合法一秒长帧内两枪十二次命中，旧音效反而只响一次。四项新增断言在旧代码全部失败。开枪事件、枪声与枪口原本就是一枪一次，本批没有改它们。

`hurt.bullet` 只增加临时展示关联，经典与分层执行器都从真实弹丸传 UID；`SampleSound` 用已有 `shot.pellets` 按开火与目标去重，后来暴击可补一次提示，不改变击杀标记或声音。缓存仅保留活动弹丸和本批引用的弹丸；末弹的 impact 后仍可处理 hurt，下一无引用帧释放，run/world/layout/map/epoch 切换清空。刷新旧弹和近战没有已见开火来源时继续按批次降级，不猜事件邻接、不加持久字段或版本。

新增回归在 [shotgun-hit-sounds.test.ts](tests/shotgun-hit-sounds.test.ts)，声音规则在 [sound.ts](src/coast-view/sound.ts)，可选字段在 [事件契约](src/raid-runtime/contract.ts)。本地完整单测 884/884（含新增 10 项）、专项与原声音测试 25/25、工程守卫 64/64、类型检查及打包已通过。HTML SHA-256 为 `da677d7e3f8dbdcfc97524383fbf111ee8752abb660b76dd2fee8e61bf8d0979`；独立只读审阅无阻断。共享 node_modules 的 pnpm 依赖预检拒绝工作树链接后，实际验证使用相同 package scripts 的 Node 命令，未安装依赖。浏览器、真机和试听未运行；产品改动已由 root 与独立审阅者复核，获准推送并创建关联 #75 的草稿 PR；不自行合并或发布，最终 head 与 CI 以 PR 正文为准。#106 的改枪 M2 仍走原分支，后续正常处理公共模块冲突。

同步 main `ae2ad6b`（#120、#121 已合入）：唯一冲突在 `sound.ts` 的 `case 'shot'` 开头，按 [PR 评论](https://github.com/xuys2025/escape-bincov/pull/113#issuecomment-6398609630)保留 #121 的音色选择（`timbre`）和本 PR 的弹丸登记，玩家开枪按音色族播放；任务清单 #75 一行改掉“分枪种枪声未排期”的过时说法。合并后单测 887/887（含本 PR 10 项）、`pnpm package` 通过，`check:ci` 63/64（唯一失败是本机 Git 路径的已知环境问题）。之后又同步 main `7d1827c`（#122，C 组姿态图集，只有素材和文档），没有冲突，单测 887/887、`pnpm package` 通过，HTML 与上次逐字节相同。浏览器、试听和真机仍未运行。

## 2026-10-25 改枪 M2 原 PR 仅同步主线（#106）

原 head `9869528` / `feat/gunsmith-m2` 正常合并 main `974a3a8` 为 `03310ba`，只处理 README 与五个生成物的冲突：保留 #105 删除，并保留本地先构建、M4A1/G17 已是正式枪械的说明。其他文件均为两亲自动合并结果；M2 功能、任务完成状态及合同未额外改动，继续原草稿 PR。

本轮 Linux / Node 24.19.0 / pnpm 11.25.0 单测 883/883、CI 守卫 64/64、package 通过，生成物未提交。原 head 的 16 套浏览器属于历史证据；本次同步后的浏览器验证以 [PR #106](https://github.com/xuys2025/escape-bincov/pull/106) 的准确 head 完整 CI 为准，不自行合并或发布。

## 2026-10-25 行动背包有限服务（`refactor/raid-inventory-services`）

#60 Q-E02 B，同一交付完成B1三有限命令+B2 detached窄读投影；起点 main `974a3a8d1ad2a7662c3a828226295d6c9b31eb64`，实现/验证入口见 [摘要](docs/tasks/quality-entropy.md#q-e02-b-行动背包有限服务)、[派生读数](docs/CODEMAP.md#派生读数)和正式工厂单测 `tests/raid-inventory-services.test.ts`。面板不持Session/SaveSession，命令回调内取fresh loadout，保留原 mutate接受集合、世界同事务、失败引用替换和原UI错误反馈；inventory全量quick/loot部分quick分别保持，不改存档/时钟/规则，不搬Scope/renderer。

本地正式工厂10项+原负重11/11，完整884/884、工程守卫64/64、package/最终类型检查通过。浅读投影及错误部分quick两种副本回归均被断言拦下；两尺寸键鼠与保存失败/嵌套枪件的既有issue26定向case 3/3通过，页面异常/外网0，真实截图和[验证记录](docs/tasks/raid-inventory-services/validation.json)已归档；完整其余浏览器风险由准确head CI复核。10-25 已推送并建立 PR #115；不自行合并发布。

## 2026-10-27 #61：PR 模板文档分类精确路径（续作 #108）

沿 [PR #108](https://github.com/xuys2025/escape-bincov/pull/108) 原分支 `fix/ci-template-doc-path`，从原 head `2468d30c9b424a88429f55a47790f0590e75b256` 正常合入已接受 main `86add10b0b7afb96948ac667d176d19badfc406b`，仅任务清单和本交接冲突，保留主线商场及打击感记录。实际文件 `.github/pull_request_template.md` 被大写白名单遗漏；仍只修唯一精确路径及 CI 说明，不扩大白名单。

前一轮 Windows 10 / Node 24.22.1 / pnpm 11.19.0：`pnpm test` 921/921、`pnpm check:ci` 65/65、`pnpm package` 通过。单测首跑受沙箱 `uv_os_get_passwd ENOMEM` 阻塞，正常宿主重跑通过。工程守卫首跑 64/65：测试写死系统级 Git Bash 目录，本机为用户级安装；改从当前 `git --exec-path` 定位 Bash 后，原门禁 75 组成功/失败/跳过组合全部实际执行，全守卫通过。主线策略配相同测试的负对照为 15/17，两处预期失败；候选全部通过。push/PR 仍只在同非文档指纹和完整成功 main 证据下复用，无证据、混入代码、可执行模式和未知大写路径继续全量。

最终合并前按维护者授权，在 #115（`8c27ce2`）及 #129（`9400cf6`）合入后，从 #108 head `c82cc8b` 正常同步 main `9400cf6a4efdea4d8898c4d3adfdf9a61efab899`。仅本交接一处插入冲突，保留双方完整记录；与预演结果一致。同步后 Windows 同环境：939/939 单测、65/65 CI 守卫、打包通过；HTML SHA-256 `d475bb48b8dd0e7b648aae019f473c33e37e1fccf7f0dbdaaf81da5a8b3a8344`。游戏源码/素材与本轮 main 无差异，生成物未提交。本地未重复浏览器游戏流程，准确 head CI、最终合并与部署结果以原 PR 正文为准。继续核对入口为 `scripts/ci/policy.mjs` 的 `isDocumentation` / `choosePlan`、`scripts/ci/policy.test.mjs` 与 [CI 合同](docs/CI.md#纯文档快速通道)。#61 其余耗时与分片、#95 落幕测试保持原归属。

## 2026-10-28 四项纯 Node 资源辅助回归接入 CI（续作 #114）

基线 main `974a3a8d1ad2a7662c3a828226295d6c9b31eb64`，承接 #60 Q-E08。`scripts/ci/resource-helpers.test.mjs` 只导入原 `astra-r7-heap-graph.test.mjs` 与 `station-resource-probe.test.mjs`，让现有 `check:ci` glob 执行四项纯 Node 回归；原文件、算法、阈值与断言不改、不复制。范围是合成有向图的支配关系与独立移点可达性 oracle，以及缺少资源表、故意保留未销毁对象的负对照。两份旧测试从 review 登记为 support，浏览器 probe/trend 等其余 review 工具保持待确认。

10-25 历史验证：直接运行原两文件 4/4 通过，Node 报告 224 ms、进程墙钟 0.302 s；无硬编码环境或输出写入，临时 window fixture 在 finally 恢复。聚合入口单独运行 4/4、168 ms；完整 `pnpm test` 874/874、`pnpm check:ci` 68/68、`pnpm package` 全部通过，入口文档检查与 `git diff --check` 通过，HTML/两个 ZIP 与基线发行哈希一致。没有启动浏览器、trend 或 F20，四项通过不代表资源签收。原复核只移除元数据测试对中文说明文字的无关约束，分类断言保持。

10-27 按维护者“从简单任务继续”的指令，在 [PR #114](https://github.com/xuys2025/escape-bincov/pull/114) 原 head `63dc41d9db0a97c1db468e07ff1fb08fa73058c6` 正常合入 main `98968e1a99f148d6958a54ce2e4629eade8088b7`，两处文档冲突均保留主线和本任务记录；#112 的脚本登记与门禁完整保留。Windows 10 / Node 24.22.1 / pnpm 11.19.0：聚合入口 4/4、完整单测 939/939、CI 守卫 77/77、打包通过。按四个实际用例名运行的入口集合对照：原 main CI 入口匹配 0 项，加入聚合入口后匹配并通过原 4 项；Node 会把无匹配用例的文件计作通过容器，因此不拿总 pass 数冒充匹配数。原测试和三个被调用模块相对 main diff 为零。HTML SHA-256 `d475bb48b8dd0e7b648aae019f473c33e37e1fccf7f0dbdaaf81da5a8b3a8344`，与同步前组合产品相同；生成物不提交。准确 head CI 和待审状态见原 PR，不以旧 head 绿灯代替。没有运行浏览器 probe/trend/F20。

10-28 维护者授权合并时，main 已通过 #106 前进到 `02b5e1e5c5261f5caea55dccc875c8ae93e3120b`。无冲突组合的 77 项 CI 守卫通过，但 GitHub 分支保护拒绝原 head 的合并，明确要求新的 `Build and test`；因此正常合入该主线、保持原 PR 继续检查。同步后完整单测 1020/1020、CI 守卫 77/77、严格打包通过；HTML SHA-256 `cd6aed02e003c2eab97ab2705633476333cd13433f6142a2271fa230e8675708`。相对当前 main 仍只有原 5 个任务文件变化，游戏和原辅助算法没有本 PR 引入的改动。最终准确 head 检查与授权合并状态见原 PR，不绕过保护或自行变更发布规则。

## 2026-10-28 资源趋势工具轮数参数拒绝（续作 #111）

基线 main `974a3a8d1ad2a7662c3a828226295d6c9b31eb64`，承接 #32 的诊断证据边界。`scripts/station-resource-trend.mjs` 原先在创建输出目录、读取 HTML、启动 Chromium 后才解析轮数；`--rounds=NaN`、`0`、空值和负数会跳过循环，却可能写出 `BOUNDED_CHECKS_PASS_HEAP_PENDING`。只修参数入口：`station-resource-args.mjs` 在副作用前校验，默认 60，保留 `--rounds=N` 的正安全整数；拒绝缺值、非整数、非有限、非正和重复选项，不新增空格传值语法。原工具继续归 `review`，没有调整 F20 阈值、采样循环或状态公式。

原实现的 CI Node 测试启动真实 CLI，以不存在的 HTML 为前置哨兵：非法轮数必须先报参数错误且不创建输出目录；默认和合法轮数只走到原 HTML 前置，不启动浏览器。未执行六十轮、缩短轮数浏览器或 F20 签收。10-25 历史验证：`pnpm test` 874/874、`pnpm check:ci` 67/67 与 `pnpm package` 全部通过；任务入口文档与 `git diff --check` 通过。打包 HTML、portable/web ZIP 分别保持主线哈希 `b309e11f…`、`ec356f01…`、`854bc3cd…`。首次受限沙箱的 Git 子进程报 EPERM，按环境允许方式重验通过，不改断言。原交付在 [PR #111](https://github.com/xuys2025/escape-bincov/pull/111) 保持，不另建同目标 PR。

10-28 维护者授权继续找简单任务后，在本聊天管理的隔离工作树续作原 head `a379337fe369b0f0a8b719e23d5adce0ff30b50f`，正常合入 main `b5bd63b7896b3b0697d4ba38d02d000e78903047`。仅任务清单、交接和脚本分类表冲突：保留主线 #112/#114 的登记，新增参数 helper 为 support，trend 继续 review。没有切换主检出的 M3 分支。离线依赖缓存缺包，按 frozen lockfile 从官方 npm 源安装后验证，锁文件和依赖声明未改。Windows 10 / Node 24.22.1 / pnpm 11.19.0：同一真实 CLI 回归在主线为 2/3（一项预期失败，非法轮数仍先读缺失 HTML），候选 3/3；包含 13 组非法参数与 4 组合法/默认 CLI 输入，不启动浏览器。完整单测 1020/1020、CI 守卫 80/80、严格打包通过。HTML SHA-256 `cd6aed02e003c2eab97ab2705633476333cd13433f6142a2271fa230e8675708`，游戏源码、素材和构建输入相对该 main 无差异，生成物不提交。准确 head 与完整 CI 见原 PR；未运行六十轮资源诊断或 F20，不扩大签收，未合并或发布。

10-29 按维护者“检查并完成111”续作原 head `1c613947be40b7fd6ce494b5702fd9cae05a44dc`，正常合入 main `275fafd77b1574938ecc0409ab405b77850359c1`。任务清单、交接、脚本分类三处冲突均保留双方更新，新增的 `source-graph.mjs`、`resource-report-input.mjs` 登记保留；复查原参数修复无需补改。Windows / Node 24.19.0 / pnpm 11.19.0：frozen lockfile 安装、1056/1056 单测、113/113 工程守卫（含3项参数回归）和严格打包全部通过；最新 main 原 CLI 的相同回归为2通过/1预期失败，仍先报缺失HTML，候选覆盖13组非法和4组合法/默认CLI输入。HTML SHA-256 `a190498102bdf579ed82b70627ea2c1e36ce339ac76881db85e4977a99c21c45`，便携ZIP 6,035,864字节；游戏源码、素材、依赖与构建规则相对该main无差异，生成物不提交。准确新head与远端完整CI见原PR；未执行资源采样/F20，仍需维护者明确授权后合并。

## 2026-10-28 #60 D8：失焦后第一次按键恢复（续作 PR #107）

沿原分支 `fix/first-key-after-blur` / [PR #107](https://github.com/xuys2025/escape-bincov/pull/107) 从 head `a169e7a5d5c984a74fb94291c4bbfa10d444fcfa` 续作，正常合入已接受 main `efe2bede6af0ed33fec065a26755e1f8ff7d0256`；保留 M2、#114、#131 与双方交接，没有覆盖其他工作树。`InputState.key` 区分新按与连发，只解除本键抑制；宿主 Shift 状态观察不复活旧冲刺，E 关闭面板仍直接返回。原新按恢复测试扩到 M2 的 F/G 命令。

本轮负对照基线 `b5bd63b`：输入 12 通过 / 1 预期失败（首按 W 为 0）；两档真实键鼠首按 D 均在原 20 秒移动等待处超时，页面正常且无异常/外部请求。最新组合实际通过：输入 13/13、全量单测 1022/1022、工程守卫 77/77、严格打包、键鼠 12/12；两档首按立即移动、松开后停止。双尺寸截图与带制品/源码哈希的断言记录已审阅并保留，入口见 [D8 摘要](docs/tasks/audit-contracts.md#d8-失焦后第一次按键恢复)。搜刮、触屏和准确 head CI 结果以原 PR 验证表为准。生成物不提交。

10-28 维护者授权自行检查、无问题后合并。复查确认没有未解决审阅意见；正常合入最新 main `3b61d52`（#130），无冲突，输入/宿主与回归源码未变。组合实际通过 1022 单测、77 工程守卫、严格打包和键鼠 12/12；HTML SHA-256 `f3b7c3e1f19bcc8bc22a517856c0fdf4301ff2ad16d8a0d9269304d1a626a9cb`，新构建证据补在原 JSON 的 `mergeCandidate`，旧截图仍对应 `9389ff9`。自动合并约定按要求记入 AGENTS；待原 PR 准确 head 必需检查通过后由平台合入，最终合并号和后续状态见原 PR。#60 其他事项开放；真实系统切窗、真机与真人手感未签收，发布仍需主线 CI 通过。

## 2026-10-24 打包产物改由 CI 构建和发布（`ci/no-committed-builds`）

维护者在 #103 因 #102 合入出现生成物冲突时提出：产物应由 CI 编译发布。基线 main `49894e9`，随后同步 `c587685`（#104）与 `5adc64a`（#103），两次的生成物冲突都按本规则保留删除。五个生成物移出仓库并加入 `.gitignore`，`generated-files.test.mjs` 拒绝再提交；发布清单移到 `release/`。CI 删去“提交的产物与源码一致”检查，main 的 `Build and test` 通过后新增 `Publish offline release`，把同一份已验证构建发布到滚动预发布 `main-latest`（标签移到本次提交、文件同名替换），README 下载改指向它；Pages 不变。规则只写在 [CI 说明](docs/CI.md#构建与离线包发布)，AGENTS、手册、模板、README 链接过去。

本地 874 单测（同步 #103 后）、`check:ci` 63/64（唯一失败是本机 Git 路径的已知环境问题）、`pnpm package`、`test:portable` 通过；游戏 HTML 与 main 提交的逐字节相同，便携 ZIP 只因游玩说明一句话变化。发布 job 只能在 main 上运行，本地只用假 gh 走过首次创建与替换两条路径。维护者确认仓库外的服务器镜像会从提交读清单/HTML，合并前要先改：CI 打包时清单加上 `commit`、`run`，镜像改读发布页清单，核对方法见 CI 说明；以后新增固定旧客户端的取法待定。准确 head、CI 与维护者确认见 [PR #105](https://github.com/xuys2025/escape-bincov/pull/105)。

## 2026-10-25 #75：打击感剩余排期与 C 组美术任务书（`docs/hit-feel-schedule`）

维护者要求把 #75 剩下的改进排期、准备制作，美术写任务书交 Sol。基线 main `974a3a8`。[任务与排期](docs/hit-feel/TASKS.md)按改枪任务页的格式列出起点、在途 PR、要维护者定的事、四个实现 PR 和 H-01～H-10，合入即表示已排期；分枪种枪声排最前，因为改枪 M2-11（11-13）要在它上面加消音变体。[C 组任务书](docs/hit-feel-art/TASK-C.md)覆盖 #81 其余 15 类原型（9 类持械人形守肩线，3 类徒手人形和 3 类兽形不画手臂、不受肩线限制），验收条件与 A/B 组单测一致。

15 张模板 `assets/hit-feel/templates/<id>-hurt-template-v1.png` 用 Node 逐像素放大 8 倍生成，不经过浏览器画布，第 0 列回读与运行站立帧逐像素一致；来源帧与哈希在 `sources-c.json`。B 组上次第 0 列有 1 级颜色误差，原因正是当时的模板经过了画布。#113、#119 都改了任务清单 #75 一行和本文件开头，本批另起一行、插在这里，避免冲突。只改文档和不进游戏的模板，没有代码、存档或构建变化。

## 2026-10-25 #75 PR ①：分枪种枪声与试枪场新旧对比（`feat/hit-feel-sounds`）

按[排期](docs/hit-feel/TASKS.md) H-01、H-02，基线 main `dfa1199`（#120 已合入）。`SynthAudio.shot` 新增 11 个音色族的配方（`REPORTS`：起音、主体、低频、尾音、机械声），[gun-timbre.ts](src/gun-timbre.ts) 给改枪目录 20 把枪各定一族，给 M2-11 用；现有开火事件只带外观，所以 `sound.ts` 先按外观取族，手枪、卡宾、双管、M4A1 样本各不相同。他人开枪按 0.55 倍。旧的 `pistol` / `shotgun` / `enemy` 三种保留，试枪场面板“打击感：新版 / 旧版”切换 `ViewOptions.feel`，旧版就是改动前的声音。新音色仍走 `shot()` 这个名字，#113 按调用名统计开枪声的测试不受影响。

离线测得前 150 ms 响度：手枪 −5%、卡宾 −4%、M4A1 −7%、双管 +2%（相对改动前）。单测 877/877、`coast-audio-test` 14/14、`test:range` 2/2（含开关检查）。试听 WAV 在临时分支 `preview/hit-feel-sounds`，听完删除；方法与数据见[证据](docs/evidence/issue75-gun-sounds/README.md)。真机和真人试听未做；准确 head 与 CI 见 PR。

## 2026-10-25 #75 PR ④：C 组受击姿态接入（`feat/hurt-poses-c`）

Sol 在 #122 交付 #81 其余 15 类原型的图集，比排期早三周。首轮验收：150 个姿态的程序检查全部通过，但盐背犬、囊腹喷吐兽的受击帧整只缩小（面积少 18–28%），返工为 v2 后复验通过，15 类签收，#122 合入 `7d1827c`。验收时把任务书第 7 条的中心口径改为“相对同方向站立帧偏移不超过 1 像素”，并删掉了与“最高点下移”矛盾的“盐背犬背弓起”。

接入只改切帧脚本和测试：`POSE_KINDS` 加 15 类并记录各类采用的图集版本（A、B 组 pixel-v2，C 组 v1，犬和喷吐兽 v2）；`ARMLESS` 列出游戏不画手臂的爪击类，肩线检查跳过它们。新增 150 张运行帧，原 70 张不变；`posable` 已按身体所用样式判断，视图代码不用改。检查 g 改为期望盐枭头目和 C 组持械、徒手、兽形各一类的姿态序列，main 构建上只在这 4 类失败。证据见[说明](docs/evidence/issue75-hurt-poses-c/README.md)。工作在独立工作目录完成，没有占用共用的 `C:\bincov`。真人观感未验；准确 head 与 CI 见 PR。

## 2026-10-26 #75 PR ②：受击档位、按开火合并、墙门反馈与镜头推动（`feat/hit-feel-visuals`）

按[排期](docs/hit-feel/TASKS.md) H-03～H-06，基线 main `8c5df6b`，在独立工作目录完成。规则集中在 [blow-feel.ts](src/coast-view/blow-feel.ts)，`CoastView.landBlows` 应用：

- **档位**：按同一枪打中的弹丸数、暴击、致死分三档，不看扣血。0 档就是原来的 2 像素、70/80 ms；1、2 档后退 3、4 像素，闪白和后退更长，受击姿势多停 30/70 ms（重击短停，只作用于挨打的角色）。“减少动态效果”下后退不超过 2 像素。
- **按开火合并**：#113 起中弹事件带弹丸编号。同一枪打中同一身体只算一次受击，血迹一次喷完、随弹丸数加量；分到下一批的同枪弹丸只补少量血。`ShotBlows` 只记住还在飞或本批提到的弹丸，0.3 秒后忘掉身体的标记。
- **墙和门**：墙是火星、石屑和一团灰，声音清脆；门是少量火星和下落的木屑，声音闷。
- **镜头推动**：玩家中弹时镜头顺着打击方向推 2.5/3.5/5 像素，和开枪后坐共用同一个偏移，合计不超过 8 像素；“减少动态效果”下没有。
- 全部读 `ViewOptions.feel`，试枪场“打击感：旧版”保持原来的受击、血迹、弹着点和声音，镜头不动。

检查 i（`test:shooting`）：暴击、四颗弹丸、分两批的六颗弹丸、旧版设置和玩家中弹各一例，main 构建上失败、本分支通过；检查 g 不变。单测新增 `tests/blow-feel.test.ts`。证据见[说明](docs/evidence/issue75-blow-tiers/README.md)。真人手感未验；准确 head 与 CI 见 PR。

## 2026-10-26 #75 PR ③：声音与粒子预算、帧耗时与峰值实测（`feat/hit-feel-budget`）

按[排期](docs/hit-feel/TASKS.md) H-07、H-10，基线 main `1a4fe66`，在独立工作目录完成。H-09（按枪种调枪身回缩）开工时还在等 #119；#119 于 10-26 合入（`34e9ba7`）后，本分支同步 main 并接着做了 H-09，见本节末。

- **规则**：[feedback-budget.ts](src/feedback-budget.ts) 的 `admit` 一处，粒子和声音共用。反馈分核心和装饰；过了软上限不再加装饰，到硬上限时核心反馈顶替最老的装饰，没有装饰可顶才丢。
- **粒子**（fx.ts）：软 220、硬 320，原来没有上限。烟、尘、弹壳、碎屑、木屑是装饰，离玩家 420 像素以外的也算；血、火星、酸液是核心。
- **声音**（audio.ts）：软 64、硬 96（96 是原有上限）。枪声尾音、机械声、脚步和放得很远（音量低于 0.35）的声音是装饰。原来顶到 96 后新的声音一律丢，混战里击杀确认音和玩家中弹声会被挤掉。
- 预算对新版、旧版两种打击感设置都生效：它是混战时的保护，不属于手感对比。

检查 k（`test:shooting`，j 已被 #119 占用）：拥挤街道里粒子和声道不超上限，玩家自己的血迹、枪声、击杀确认和中弹声都还在；main 构建上失败（粒子 732，击杀确认和中弹声 0 个声道），本分支通过。单测新增 `tests/feedback-budget.test.ts`。H-10 实测：真实 23 敌混战没有触发预算，帧耗时两边相同；高密度负载下 main 粒子约 750、声道顶满，本分支稳定在约 220 和 70，丢掉的全是装饰。数据见[证据](docs/evidence/issue75-budget/README.md)。维护者 10-26 试玩本分支构建后认可，手机外放和耳机试听没有单独确认；准确 head 与 CI 见 PR。

H-09：[weapon-retraction.ts](src/coast-view/weapon-retraction.ts) 的 `RETRACTION` 按音色族给回缩幅度和时长，替换原来所有枪一样的 3 像素 / 80 ms。手枪最轻（2 像素 / 60 ms），卡宾枪和步枪保持 #119 认可的 3 像素 / 80 ms，双管最重（5 像素 / 130 ms）。检查 j 扩到手枪、卡宾枪、M4A1、双管四种，main 上手枪和双管失败、本分支通过；#119 的一条单测把“比整段回缩长的一帧”从 0.1 秒改成 0.15 秒（双管回缩 0.13 秒），断言不变。两档分辨率逐帧图见[证据](docs/evidence/issue75-retraction-families/README.md)。维护者 10-26 在局域网另一台电脑上试玩本分支构建（`f356bad`）后认可：“体验不错 通过了”，手枪幅度不改。

## 2026-10-24 EN-19商场二层遭遇续作

原PR104、feat/enemy-mall-r06；维护者已明确“授权104”，检查通过后可正常合并，不反复索取授权。执行合并时#98刚合入，已正常同步main49894e9（含#102），双方源码自动合并，生成物经正式package重建；没有强推、推main或绕过检查。

本批现有mall-v3二层服装区三人及一只既有周转箱，25人口、16/9分层、一层原状态及两精英保持。[商场任务记录](docs/tasks/enemy-mall.md)为范围/空间/兼容入口，[验证摘要](docs/enemy-mall/validation.json)顶层为7d25ceb3制品（8,056,122字节，portable5,266,798），preGunsmithSync保留132c/更早c35原证据，不改写旧通过记录。

873单测、62守卫/package、三尺寸及实际旧端11案例通过：真实649b791/v7原生商场档迁移v8后完整行动一致，gunsBackup保留原文，其他三备份保持；实际49894e9/v8旧端可读取本批新档。actor v1、expansion3 / raid5保持，外层统一遵守#98的session8，不重投活动旧商场。完整敌人、射击、便携、两项自然输入、干净head独占固定退避矩阵及准确CI按原PR104后续实际结果记录，未完成不签通过。自然并行负载不作性能。

EN19～22、R06其余卸货/配给、#47四版/全图、其余地区与真机/真人/整体签收继续开放；Issue78保持18/22和十二地区，开发已排期。只有既定退避路线性能，不签站定/近距极限、同比或真机真人。保留密钥检查及正常hooks；不读私钥、不向其他聊天发消息，不手动服务器部署。准确最终head、合并SHA与主线CI/Pages见原PR，不能用本历史记录代替实时状态。

## 2026-10-24 等候方交付与新主线同步

维护者要求尽快推进#81以解除后续#75 B组姿态/枪声接入等待，并明确取消便携ZIP 5 MiB上限。正常同步main f73e9de（#96/#99）；游戏源码自动合并，生成物由package重建。撤销了仅为卡5 MiB临时加入的40帧图集尝试，原40张PNG/哈希保留。诊断取消ZIP硬门槛，仅报告实际大小；HTML/帧时/纹理门槛未改。源冻结后执行单测/CI守卫/package、shooting、enemy、portable及标准绝对性能，结果以本次后续记录与原PR为准。

本期可审阅交付为EN01～18的街区十八原型闭环，#78剩余EN19～22及地图/真人真机依赖继续开放；不自行合并或部署。待准确组合head完整CI通过后提供review-ready状态和稳定入口，后续任务不必重复等待十个未建地图。此前32cf5f4整轮CI通过属于新主线整合前，不冒领成整合后证据。

## 2026-10-24 CI搜刮夹具收口

游戏提交df30df8已推，HTML仍ac1f62b3...、7993985字节。首轮完整CI40065883806只有batch8搜刮夹具失败，构建与另七浏览器组通过；本地原样复现。quiet中的placeEnemy连带改写seed44检查站home，严格保存拒绝该测试布置；修正为冻结且保留回收/检查站固定岗位，其余断言不改，无产品源码/制品变化。修复后两桌面各22项及触屏4项共48项搜刮、62CI守卫通过，证据见[检查站](docs/tasks/enemy-blockade.md#首轮ci搜刮夹具修复)。正常提交推送后核对新准确head完整CI；原首败保留，成功才在Issue核销18/22，EN19～22仍开放。

## 2026-10-24 十八原型街区阶段收口

原PR81 / Issue78，feat/enemy-foundation，已正常整合main30781f4（#28仅文档，产品基线仍4141503）。十八个不同原型均有普通街区场景，人口25与两剧情守卫保留。EN17三岗位已接实际原子登记/连续可见等待/公共通道/越界解除与交火锁定，严格actor v2 program；外层7/3/5和原双备份不变。七固定旧端154项及结算后1b884f2读写通过。

最终761单测、62CI守卫、package、save-browser/portable/UI、156敌人案例/148截图通过。HTML7,993,985字节/ac1f62b3b8920330e01c0a3e739d14efd7763cbed2366060b28a9ff61a61de9f，portable5,240,246字节。标准和退路两性能组各12Runtime/六浏览器绝对预算通过；五组A/B通过，原单次同比及近距/触屏失败原样保留。[最终自然输入](docs/enemy-street/natural-blockade-final.json)：2026-10-24T05:06:20.218Z～2026-10-24T05:16:26.220Z，606.0秒，3次撤离/25击杀/29次原生物资拖放，零页面错误/外部请求。

入口：[检查站与最终验证](docs/tasks/enemy-blockade.md)、[合同](docs/tasks/enemy-save-contract.md)、[性能含失败](docs/tasks/enemy-performance.md)、[阶段验收表](docs/tasks/enemy-foundation.md#街区阶段验收对照)、[地区依赖](docs/tasks/enemy-regions.md)。源与制品已冻结；下一步正常提交/推原分支并等准确head完整CI，成功后按证据核销EN08/09/10/12/17/18（18/22）。EN19～22因十个未建地区/全图回归、真手机/真人平衡继续开放。不推main、不强推、不自行合并/部署、不读SSH私钥、不绕过钩子；当前无子agent。

## 2026-10-24 回收队本地交付完成

承接PR81 / Issue78，分支feat/enemy-foundation，已接受main4141503。父71cf986盐蚀者完整CI40056388894成功；本批回收队准确head/完整CI以原PR核对，未合并/部署。十五不同原型有普通街区场景，三类封锁队登记、十个未建地图/剧情、真手机与真人平衡仍开放。

EN16：seed%5==3四岗位、一个既有箱体，实际装箱/分段搬运/交付/撤回；范围内静态路段命令和最后收信时间持久，交替掩护、有限压制/弹药、箱空/目击损失/失联撤退，死亡箱体留在原处。新格式严格绑定街区地图/岗位、同队/同图队长及唯一箱体，7/3/5与双备份原字节保留。入口：[回收队](docs/tasks/enemy-recovery.md)、[存档合同](docs/tasks/enemy-save-contract.md)、[性能](docs/tasks/enemy-performance.md)。

最终745单测、62CI守卫、package、save-browser/portable通过。六固定旧端132例与结算后71cf旧端读/初始化/继续保存通过，双备份不变。144敌人案例/136截图、UI与旧行为9/9 A/B为最终固定岗位校验前候选35146fc8...，原失败保留，未冒领最终制品。最终两独占性能组各12Runtime/六浏览器原预算通过；完整自然输入03:37:35.871～03:47:57.886 UTC，10分22秒，两撤离/29击杀/30原生拖放、零错误/请求通过。HTML7,986,545字节、408ae6f97b5e487aa948d0b5cf5fb2db200e88e86eb25ceb77112d5af9e19f42；portable5,237,293字节。

下一步：正常提交/推原PR，核对准确CI再在Issue核销EN16。随后EN17固定三岗位已通过双潮位地图几何，计划/未接入草稿在本地检查记录PR67可行性-20261022/next-program-contract-plan.md及enemy-blockade.draft.ts、blockade-checkpoint.draft.ts。草稿未编译、未计进度；需接严格program、原子登记、可见等待/通行与真实来源交火状态，全部实测后再核销。不推main、不强推、不自行合并/部署、不读取SSH私钥、不绕过密钥钩子；当前无子agent。

## 2026-10-24 盐蚀者能力样板

已整合main4141503；父图集提交ae3caa2已推送，完整CI40055281594运行中。新增普通seed%15==2四类盐蚀者（47枪/62长柄），actor能力v2严格program，原v1不迁移；同一有效规则供控制器/弹丸/装备掉落/投影/校验。10能力回归、734完整单测、62CI守卫、package/portable通过；五固定历史端110例与真实v2结算后旧端读写通过，双备份原字节保留。四千次绕行补角度归一化，防止持续转身超出存档范围。

角度修复前候选1c0ad62d...有132敌人案例/124截图、save-browser/UI通过，两独占性能组各12Runtime/六浏览器通过，完整十分钟自然输入通过，详见能力卡及原哈希记录。最终HTML94d0d453.../7,979,796字节、便携ZIP5,235,421字节，另启自然输入，准确head CI待推送核对。当前11个不同原型普通投放，EN-16回收队、EN-17登记、十个未建区域/真人真机继续开放；下一批具体程序和验收边界保存在本地 next-recovery-program-plan.md。未合并PR/部署。

## 2026-10-24 敌人素材包体收口

本批在main4141503整合提交 `6ac9d02` 上压缩。原621张PNG/原始哈希保留；19无损WebP图集原始RGBA相同，浏览器透明边缘最多一个预乘颜色等级舍入（首败保留，非浏览器RGBA逐像素完全一致）。HTML7,977,494字节/a3cd0046...，便携ZIP5,234,907字节，固定包体门槛恢复通过。724单测、62CI守卫、package、621帧像素与四冷加载故障/重试、117敌人场景/109截图、portable/UI通过；整合前一制品的shooting、14真实音频与11选图入口通过。详见素材记录。EN-15能力和测试在工作区另行开发，尚未包含在本提交；旧端探针110例已本地通过，完整集成与普通出击待验。

## 2026-10-24 敌人分支同步 #97 / #91

动物批已提交 `1d9dfd1`，本轮正常合入 main `4141503`。保留新选图、命中当帧反馈、暴击/击杀声音与全部敌人阶段提示。724 单测、62 CI守卫、package、117敌人案例/109截图、shooting、14项真实音频与portable通过；普通选图出击继续核验。HTML 8,600,598字节（707dc301...），便携ZIP5,655,203字节，超过既定8MiB/5MiB预算，当前不能签收包体；下一步保留原图，制作像素完全一致的无损图集压缩。未合并PR、未部署。EN-15～17持久程序仍未实施。

## 2026-10-24 动物正式食源样板（整合新主线前）

seed%5==1新增蟹/双犬/喷吐兽四人编组，替换旧成员，世界25、与初始三人共七名新原型。三份地面食品由四份携带预算移出，死亡剩一份；真实拾取、重复初始化/刷新、死亡及失败重试守恒。双犬只基于可见同伴接近，失联返巢；发布阶段总时长修为真实0.3秒扑击/0秒瞬时释放。字段/schema不变，详见 docs/tasks/enemy-fauna.md。

718完整单测、62守卫、package、117敌人案例/109截图、portable/browser/ui通过。动物制品a7aa5f6f6afb7a2c56cbc3a62c92c11c66d71456c603f8c4485452fc83d988e4：完整自然输入01:02:35～01:12:42 UTC（10分7秒、41次结果、15次原生拖放、零错误/请求）通过。标准同比/七人配置/近距正常Q三组各12Node＋六browser全过，失败无Q样本保留，预算未调。三组原始报告均在docs/enemy-street/performance-fauna-*。

头目174341b准确CI40046780530已全绿，完整十分钟重跑与三次商场分层都通过，详见原PR/本地协调文件。自然脚本原先未见前摇，已改走正常公共路线并等可见敌人真实准备后再开枪，原时长/拖放/零错误断言保留，新增独立entry/out参数防报告覆盖。

提交前fetch发现main已到1af0fec（#97命中确认等视图/音效）。本批先保存已验源码及制品，接着正常整合新主线、保留双方动作/音效并复验；未整合前不把本轮结果冒记新主线后的制品。十一原型的正式组织/程序及十二地区、真人真机仍开放，EN15～17的v2方案尚未实施。
## 2026-10-24 正式市场头目据点

EN-13 接入每五种子之一的头目＋两护卫，替换已有名册三人，世界人口25、两剧情物资守卫保留，一箱既有补给平移且内容不增殖。固定岗位/两秒短巡查/备用站位使用已有 home/target/path/timer/stance；目击半数损失后撤退，据点护卫不跨层追击。详见 docs/tasks/enemy-market.md。

710 完整单测、更新目录6项复跑、62 CI 守卫、package、108 敌人浏览器场景（100截图）通过。标准seed42对照及seed45正常走位负载各12Node/六浏览器样本通过，报告与原失败边界见 enemy-performance.md。HTML SHA 7ba664aeca05ccfc01a27b85c9dd0739be552880529a23cb44bfd1f9a39766f0，7,297,822字节。完整十分钟街区自然输入、三次实际商场分层游玩及portable/browser/ui正在运行，未计为通过；最终结果放原PR/Issue与本地协调检查点。上一已推送92cff64完整CI40044343195构建和八浏览器组全绿，不能替代本批准确head CI。原PR继续草稿，未合并/部署。
## 2026-10-24 EN-04 正式性能基线

新增独立 `node --import tsx scripts/enemy-performance.mjs`，协议、预算及失败说明见 docs/tasks/enemy-performance.md，原始结果 docs/enemy-street/performance-baseline-92cff64.json。运行的是已推送 92cff64 的最终 HTML，12 Node 样本和六浏览器场景通过，预算在测前固定，未放宽；实际 renderer RTX3070/ANGLE D3D11，rAF 节奏不代表显示器/GPU 完成时间。零页面错误/外部请求，62 CI 守卫通过。普通游戏源码和生成物本批未变。补实际字段归属、修目录历史状态，EN-01～04 可按基础契约范围核销；剩余正式遭遇继续 #78。
## 2026-10-24 敌人续作：同步 #94

敌人分支在动作/音效提交 `2fcad9d` 后正常合入 main `edb02f2`（#94）。保留沿子弹方向的受击退移、返溅与方向合同，保留十八原型动作和声音；生成物重新打包。706/706 单测、62/62 CI 守卫、package 和完整 shooting（含 g 慢帧/方向、鼠标/触摸）通过。此轮没有更改 AI/存档，准确合并提交及远端 CI 见 #81。EN-04 的正式街区性能工具另外开发，未计作已通过。
# 任务交接入口

2026-10-24 · PR #81 正常整合 main `98c69b4`（#93）并补敌人阶段动作与音色：六类无持械身体按真实攻击阶段形变，八类合成音色仅在可见的新阶段播放；减少动态效果保留方向/进度提示。706 单测、62 CI 规则、package、105 敌人浏览器场景（含 32 组 Web Audio 输出）、14 项真实音频、browser/ui/portable 通过，零页面错误/外部请求。HTML 7,296,349 字节，SHA-256 `3f05c772a6900fbd098ffde560712f884b9742573b04cd3ca58bdbc32ee66c05`。未改 AI/伤害/存档；首三类以外正式遭遇及组织/区域余项仍开放。十八类素材提交 `fc575fc` 已推送，但 #93 并入后 PR 冲突导致该提交没有 CI；本轮解决后以新 head 完整 CI 为准。

2026-10-24 · PR #81 十八类身体/尸体完成：468 张图，新增 286 张，原七类 182 张哈希不变；执仪者长柄双手持握和前刺接入。702 单测、56 CI 规则、package、98 敌人浏览器场景、shooting/browser/ui/portable 通过，零页面错误/外部请求。夹具切换前关闭旧宿主，避免自动保存覆盖新场景。HTML 7,293,418 字节，SHA-256 `89ef7a00acbb51d43ad8cb6f588927f1381cffbd81da7c84639f5daddfe1ae97`。首三类仍为唯一正式街区投放，其余十五类是合法存档验图；动作/声音、组织目标/通行场景、区域依赖及真人真机验收继续 #78，见[素材记录](docs/tasks/enemy-street-art.md)。父提交 ae7513e 全量 CI 39982136292 成功；本批准确提交 CI 更新原 PR。未合并、未部署。

2026-10-23 · PR #81 续作喷吐表现与美术测试时序修复：犬形囊腹喷吐兽使用低位酸液弹、湿咳/溅落声和 1.4 秒消退痕迹，停止生成枪口火光、弹壳与金属弹啸；不新增伤害或存档状态。`44f1996` 的 CI 39978503866 在敌人美术场景失败（近身敌人的短前摇在异步冻结前已走完），其余七组成功；现通过显式 `?test=1&freezeAI=1` 在 Runtime 构造时冻结，普通入口不启用。本轮 702 单测、package、43 敌人场景、14 项真实音频输出、browser/ui/portable 通过。HTML 6,287,460 字节，SHA-256 `dd3ddb8dd473c1ca540e13da755e152cd31bec44544f9cbae424fc403cf8e5e5`；日志 `test-results/enemy-spit-*`。准确提交 CI 待推送后核对；盐蚀者后续素材另行验证，不计入本次七类 182 帧交付。

2026-10-23 · 敌人第二批身体/尸体素材继续 PR #81，在 main `04736f7` 的整合提交 `a5f5782` 之上开发；父提交全量 CI 39974169630 已通过。新增盐枭头目、潮蚀蟹、盐背犬、犬形囊腹喷吐兽共 104 帧，总计七类 182 帧，首三类 78 帧字节不变。内置 image_gen 源图、返修提示词、透明通道及哈希保留；切帧按透明间距和方向脚点修复行列漂移，蛙形喷吐兽初稿已拒收。普通街区仍只有首三类，新增四类通过合法 session 7 / raid 5 场景验图。

本批 701 单测、56 CI 规则、package、42 敌人浏览器场景、browser/ui/portable 全过；已审阅 1280×720、1920×1080 与 844×390 触屏实景。HTML 6,286,217 字节，SHA-256 `2b1f896fe37ec63c056e3e48d6bbe7549aa9a83b8f6d7bec271503839e034bb1`；便携 ZIP 3,964,732 字节。详见 [素材记录](docs/tasks/enemy-street-art.md)，日志 `test-results/enemy-art-batch2-*`。本批不改 AI/战斗/存档；历史十分钟游玩保留原制品归属。其余十一类素材、十五类正式场景、专属动作/声音、十二区域依赖和真人平衡仍开放，继续 #78；准确 head CI 更新原 PR。未合并或部署。

2026-10-23 · PR #81 的组合存档整合已提交/推送 `ae55592`，随后正常同步 #90 / main `04736f7`。仅交接记录冲突，双方历史均保留；共享构建器整合后 701 单测、56 CI 规则、package 通过，HTML/ZIP/清单与 `ae55592` 完全一致，下方真实输入与浏览器证据仍对应当前制品。准确 head CI 在原 PR 单独核对。

2026-10-23 · PR #81 正常同步 Perk #92（main `8b6192d`），组合新行动采用 session 7 / expansion 3 / raid 5，历史敌人 6/2/4 与 Perk 5/3/3 按保存规则继续；双备份、严格版本矩阵和失败原子性见[存档合同](docs/tasks/enemy-save-contract.md)。本批 701 项单测、53 项 CI 规则、四固定客户端 80 项正反例、旧世界 9/9 A/B、package、22 个敌人场景、save-browser/buildings/mobile/portable 与 4 个桌面/触屏 Perk HUD 场景通过。HTML SHA-256 `aa2763118603ad38f5a2e60c93751405e4ab33106410265237dfde32266ddaf9` 的真实输入游玩于 14:33:10～14:43:15 UTC 完成 10 分 4 秒，24 撤离/12 死亡、零脚本错误和外部请求；这是自动流程回归，不代表真人平衡。准确提交与 CI 见原 PR。其余原型美术与正式场景继续推进，未合并、未上线。

- 2026-10-24 · [改枪 M0+M1](docs/gunsmith/CONTRACTS.md)（PR #98，分支 `feat/gunsmith`）：20 枪/100 件目录、兼容判定、有效属性（护栏、锥级下限 0.6）、枪械实例；物品与装备栏带实例，会话记录 v8（#81 已用 v6/v7，按先合入者顺延；敌人规则以 `enemyBackup` 键表示），旧档读档时迁移并保留 `gunsBackup`；装备、转移、丢拾、结算保持同一实例，售价按组成计算；Runtime 经 `src/gunsmith/stats.ts` 读数值。守恒属性测试 200 个种子；两个独立复核的 5 个低级问题已修 4 个、1 个（详情售价）归 M2-08。决定与待办见 CONTRACTS.md 开头「M0 评审决定」，进度在 #80。
- 2026-10-24 · [县域选图界面 / #82](docs/tasks/county-map-select.md)：`feat/county-map-select` / PR #91；十二地区战术地图、两处现有入口可出击、十区暂未开发。[Opus 视觉深化](docs/tasks/county-map-select.md#opus-视觉深化2026-10-24)：先正常合并 main（#89、#90、#92、#93、#94）并重建字体子集与生成物；地图固定 3:2（容器查询单位适配，最多裁 6%），标记钉在地标上、标签放一侧；选中时局部点亮、准星滑动锁定（`CSS.registerProperty`）、路线沿公路绘制；十二张插图接入区域情报；出发按钮常驻底部；出击面板由 `morph.ts` 就地更新，焦点、种子与过渡在重绘中保留。`test:raid-default` R10 扩充、新增 R11 与 `tests/deploy-map.test.ts`。真机与真人观感未验，额外训练 E4 记录见任务文档；准确 head / CI 见 PR，新增关卡继续归 #82。

当前任务从 [WORK-QUEUE 顶部](docs/WORK-QUEUE.md) 和相关 PR 的最新 head/检查接手。读代码先用 [CODEMAP](docs/CODEMAP.md)；每个在途交付维护一份[短摘要](docs/TASK-HANDOFF-TEMPLATE.md)，不把本文件全部放入默认上下文。

- 2026-10-29 · [PR #95](https://github.com/xuys2025/escape-bincov/pull/95) 复核：最新 main 的 W12/W13 仍可能在实际落幕前读取文案，修复有必要，维护者已明确授权完成验证后合并。沿原 `fix/coast-outro-checks` 正常同步 main `ae177b4`，保留双方历史及任务登记；正式代码差异仍只有两处等待。首轮完整手动套件 53/53、延迟与两个负对照重新验证，见 [CI 原记录](docs/CI.md#手动落幕检查的时序)；最终组合的复验、准确 head CI 与实际合并状态统一维护在原 PR。游戏、存档、离线及原检查断言不变，不替代 F20 或真机签收。

- 2026-10-28 · [#61 手动落幕检查](docs/CI.md#手动落幕检查的时序)（[原 PR #95](https://github.com/xuys2025/escape-bincov/pull/95)，`fix/coast-outro-checks`）：从原 head `7176bee` 正常合入 main `0f73a67386bac196b87c983668295be6d1a99f1e`，保留双方记录与 #112/#114 检查登记。正式变更仍只有 W12/W13 等实际落幕再读文案，游戏源码/素材/依赖与 main 相同。Windows / Node 24.22.1 / pnpm 11.19.0 / Chrome 156.0.8078.49：1022 单测、77 守卫、严格打包、完整 coast-sample 53/53 通过。600 ms 延迟对照旧等待 25/26（仅 W13 过早读 null）、新等待 26/26；移除标记与错误文案各 25/26，仅原 W13 超时/断言失败，四组均无页面异常或外部请求。HTML SHA-256 `f3b7c3e1f19bcc8bc22a517856c0fdf4301ff2ad16d8a0d9269304d1a626a9cb`，日志在忽略目录 `test-results/pr95/`。旧 Linux 自动暂停首败保留在 CI 说明的历史段；完整套件仍为手动，准确 head CI 和待审状态见原 PR，未获本任务合并授权。

- 2026-10-24 · 地图边瞄准偏转（`fix/aim-map-edge`，起点 main `f73e9de`；改枪 M0-07 原型发现，见 [#80](https://github.com/xuys2025/escape-bincov/issues/80)，M0 评审决定单独修）：
  - **问题**：按住右键精瞄、镜头被地图边挡住时，夹紧只卡住前探的一个轴，另一个轴照常缓动，光标不动瞄准也转约 1 秒。主线上试枪场射击线 1280×720 测得 8.47°，1920×1080 3.6–3.7°；居民楼楼层比画面窄，同样会转。#39 的检查都在空地上。
  - **修法**：`camera.ts` 的 `leadRoom` 给前探长度封顶，到镜头沿光标方向碰边为止；跟随镜头已被地图边挡住时没有前探；离边界不到 27 像素时再按距离的 3 倍收窄（`EDGE_FADE`），走向地图边时前探平滑收完，不会一帧跳回 64 像素。`stepLead` 多一个 `room` 参数，`scene.ts` 的 `camera()` 和 `aimFromClient` 用同一上限。空地上逐位不变，触屏不变。
  - **测试**：`tests/coast-camera.test.ts` 回放镜头和瞄准换算（射击线、离边 24 像素、居民楼楼层、空地，两种尺寸）；`test:shooting` 新增检查 a-edge，主线构建失败（8.47°），修复后 0。走向地图边不跳的检查只在单测回放里。
  - 代价：射击线一带（跟随镜头被挡住的范围）按右键不再前探。真人手感未试；准确 head 与 CI 见承接 PR。

- 2026-10-24 · [#75](https://github.com/xuys2025/escape-bincov/issues/75) 受击姿态接入 A 组（`feat/hurt-poses`，基于 #96 的 `17613b6`）：
  - **切帧**：`scripts/export-hurt-poses.ts` 复用 `title-art/png.ts`，从 pixel-v2 图集切出拾荒者、盐枭、守潮人、潮蚀生物各五朝向的受击帧（帧号 5）和恢复帧（帧号 6），共 40 张、15 KB，放在 `assets/coast/poses`。
  - **加载**：`src/coast-view/pose-assets.ts` 在海岸素材加载后并入同一张素材表。`assets.ts`、`textures.ts` 都没动，因为 #81 已把它们改成打包图集。
  - **播放**：`CoastView.syncActor` 中弹后显示受击帧约 90 ms、恢复帧约 60 ms，命中那一帧至少显示一次受击帧。只在角色用本种类身体图时切换（`posable` 看上一帧贴图），#81 的原型敌人因此不会误用 A 组的帧。
  - **测试**：`build.mjs` 核对哈希；`tests/hurt-poses.test.ts` 守住像素一致和脚底、肩点所在行；`test:shooting` 检查 g 加了逐帧姿态断言，main 构建上只在姿态一项失败。
  - **和 #81 试合并**：只有发布清单冲突；第一次发现与它的局部变量 `pose` 重名，已改名为 `hurtT` / `hurtFrame`；合并结果单测 747/747；在合并构建上实测，原型敌人中弹不换帧、也不出现占位图。
  - 证据见[说明](docs/evidence/issue75-hurt-poses/README.md)。B 组等 #81；真人观感未验。准确 head 与 CI 见本分支 PR。

- 2026-10-24 · [#75](https://github.com/xuys2025/escape-bincov/issues/75) 受击姿态接入 B 组（`feat/hurt-poses-b`，基于 main `67a7468`，#81 已合入）：
  - **切帧**：`export-hurt-poses.ts` 加近身掠夺者、拾荒枪手、望风者（`raider-melee` / `raider-gunner` / `raider-lookout`），按原型样式名切出 30 张帧，约 55 KB；A 组 40 张逐字节不变。
  - **画布取整**：B 组图集的站立列与 #81 的站立帧只差在半透明像素上，单个通道差 1 级。`driftMap` 把这些颜色还原成运行帧的值，其他差异一律报错；A 组没有半透明像素。
  - **播放**：`posable` 改为调用 `Textures.hasBodyFrame`：角色身体所用的样式（原型自己的，否则种类的）有受击帧才换帧，不再比较上一帧贴图。#81 的另外 15 类原型有自己的身体图、没有姿态，中弹照旧。
  - **测试**：`hurt-poses.test.ts` 扩到 70 帧，并补还原规则的正反例；`test:shooting` 检查 g 加三类原型，以及无姿态、须保持自身帧的盐枭头目。main 构建上只有三类原型的姿态序列失败。
  - 证据见[说明](docs/evidence/issue75-hurt-poses-b/README.md)。其余 15 类原型的姿态需新一轮美术；真人观感未验。准确 head 与 CI 见本分支 PR。

- 2026-10-24 · [受击姿态美术 PR #96](https://github.com/xuys2025/escape-bincov/pull/96)：在原分支按维护者评论完成七张 pixel-v2 返工稿，只改人形 S/N 膝部24格及生物 E/SE/NE 缩头6格；35站立格和40个其他动作格不变，v1与生成原图保留。[当前返工摘要](docs/hit-feel-art/README.md#2026-10-24-v2-返工)、[v2检查](docs/hit-feel-art/pixel-audit-v2.json)与[有效v1负对照](docs/hit-feel-art/pixel-v1-rework-negative.json)记录无新增洞、腿部不开缝和原有锚点检查；生物固定足底与整帧最右边界的3条指标冲突待核定，不能记为全部验收通过。653单测、package通过，产物相对main `4141503`不变；游戏接入另PR，保持草稿、未合并，等待独立复验。

- 2026-10-24 · [#75](https://github.com/xuys2025/escape-bincov/issues/75) 命中确认（`feat/hit-confirm`，起点 main `edb02f2`）：
  - **画面**：`CoastView.present()` 在画角色之前先处理本批的受击事件（`blow`），闪白和抖动从命中当帧画起，帧数不变（60/30/15/12/10 帧/秒为 4/2/1/1/1 帧）；本批才第一次出现的身体仍从下一帧开始。
  - **声音**：玩家中弹改播居中的 `pain`，敌人中弹仍播带方位的 `hit`；`SampleSound` 按批次 `revision` 去重，同一批同一目标只响一次，有暴击时另加一次 `crit`。
  - **标记**：宿主收到玩家子弹的暴击时，把刚出的命中标记改成金色；对该目标的击杀保持暴击样式。击杀确认音由 `mark()` 随击杀标记请求，沿用标记自己的归属规则。
  - **测试**：`test:shooting` 检查 g 改为从命中当帧计帧，新增步骤 h；main 构建上 g、h 均失败（负对照）。
  - **与 #81**：只改了 #81 没碰的段落；试合并 #81 的 `2fcad9d` 后，src/tests 无新增冲突，类型检查通过，单测 708/708。
  - 音色只做了离线响度测量，好不好听待维护者试听。证据见[说明](docs/evidence/issue75-hit-confirm/README.md)，准确 head 与 CI 见本分支 PR。
- 2026-10-24 · [#75](https://github.com/xuys2025/escape-bincov/issues/75) 受击抖动方向（`fix/hurt-kick-direction`，起点 main `04736f7`，已同步 #93 `98c69b4`）：维护者决定受击抖动改为顺着子弹方向被打退，血迹返溅和来弹方向提示不变。`hurt` 事件的 `angle` 不变，仍从受击者指回打击来源（逆着子弹、指向近战攻击者），契约里补了这句说明；`CoastView.onEvent` 只把 2 像素抖动取反。血迹仍按 `angle` 朝来源喷，HUD 来弹方向由 Runtime 另算，都没动；玩家自己中弹也改为顺弹道后移。`test:shooting` 检查 g 改为断言东向子弹抖 2,0、南向子弹抖 0,2，且这次命中的血滴全部朝射手；main 构建上实测只在方向一项失败（[报告与裁图](docs/evidence/issue75-kick-direction/README.md)）。命中当帧不闪白（60 帧/秒晚一帧）和 #75 其余 P0–P2 未动。准确 head、验证结果与 CI 见本分支 PR。
- 2026-10-23 · [#60 Q-E08 检查导航](docs/tasks/check-navigation.md)（`agent/quality-checks`，起点 main `04736f7`）：按风险列出最少检查、前置与人工证据；脚本分类明确现役/诊断/历史/待确认，两个行动堆报告默认分目录。单测 647 项、CI 守卫 62 项、Perk 手动入口 14 项通过，打包产物与基线字节一致。原有两个 20 轮堆探针均完成，生命周期通过、堆趋势仍 PARTIAL，未跑 strict60，未替 #32 签收。使用与维护见 [CHECKS](docs/CHECKS.md)，等待承接 PR 的 CI 与维护者审阅。

- 2026-10-23 · PR #81 本批代码/素材已保存为 `fc56573`，随后正常同步已接受 main `160c6f3`（#89 退役旧测试接口）。唯一冲突在本文件，同时保留双方记录；合入后 601 单测及 package 通过，HTML/ZIP/清单与 `fc56573` 逐字节一致，所以下方 22 场景、UI/便携和 10 分 4 秒实际游玩仍对应最终运行制品。当前准确提交和 CI 见原 PR，不自行合并或部署。

- 2026-10-23 · [#78 三类角色与兵种边界](docs/tasks/enemy-street-art.md)：继续 PR #81，基线 main `24c18a6`；上一批 `0ef0323` 全量 CI 39960135214 成功。新增三类独立身体/尸体 78 张小图，原图/提示词/哈希/导出工具入库；其他十五类不冒充正式素材。新增方向壳甲、扑击 90 像素上限及身体/墙阻挡、可信位置两秒有限压制、留守和目击损失撤回，未增持久字段。599 单测、53 CI 规则、目录针对 6 项、package、22 敌人浏览器场景、browser/ui/portable、旧世界 9/9 A/B 均通过。最终 HTML `acec21fe0d82c654e3bce99fdc7af4a733512fe2d73d1d355bf0a2f1ecc63aeb` 的新街区实际输入游玩 13:47:10～13:57:14 UTC（10 分 4 秒）通过，观测前摇/恢复/换弹，零错误/请求。真人/真机未验。[EN-19 台账](docs/tasks/enemy-regions.md) 已核对 #91 只有选图与素材、十区仍无关卡。准确提交与当前 CI 在原 PR，未合并或上线。

- 2026-10-23 · [#78 组织与立场](docs/tasks/enemy-relations.md)：原 PR #81 继续。首批 `16e1e24` 完整 CI 与新街区 10 分 17 秒真实输入游玩通过。本批补同层跨势力目标、NPC 伤害/死亡归属、墙与友方身体阻挡、受伤自卫、两名既有成员沿已见楼梯追击、边界外只读询问及触摸按钮。维持 session v6 / raid v4；旧行动不补字段。普通出击仍只投放三名拾荒者，其他组织的正式场景与资格任务未完成。实际新批验证、截图和准确 head 以原 PR 更新为准，不能沿用上一提交 CI。Claude 的 Perk 实现已成为 #92，仍占 v5 / expansion v3 / raid v3；合入时须同时理解两种合同及各自备份。

- 2026-10-23 · [#78 街区三原型样板](docs/tasks/enemy-street-encounter.md)：继续原 PR #81，正常同步 main `24c18a6`（#87）。普通街区新出击接入近身掠夺者、枪手和望风者，维持 25 人；感知记忆、锁向攻击、有限弹药、尸体守恒与阶段展示已接线。历史行动原规则不变。与 Claude 的 Perk 版本避让后使用 session v6 / LayeredRaid v4，保留首次升级原字节；当前未理解的 Perk v5 明确拒绝。完整范围、实测与尚未完成的十八类/美术/区域见记录，不能沿用下条基础批的 CI 结论。仍不合并、不发布。

- 2026-10-23 · [#78 敌人体系实施 / 草稿 PR #81](docs/tasks/enemy-foundation.md)：`feat/enemy-foundation` 从 `8ef783f` 开始，停电前保存为 `b679737`，恢复后正常同步含 #79/#88 的 main `b38f23d`。十八原型目录仅供制作；旧四类 AI 提取、表现/尸体映射、兼容回归与 A/B 工具已完成，本轮补强全部出生点隔离与解码拒绝对照。新 schema、三人遭遇及正式原型仍按 #78 推进，EN-01～04 未整项核销；准确 head、实际测试与后续边界见摘要及原实施 PR。


- 2026-10-23 · [#60 Q-B06 诊断 bundle 同源](docs/tasks/quality-entropy.md#q-b06-诊断-bundle-同源)（[PR #90](https://github.com/xuys2025/escape-bincov/pull/90)，`agent/diagnostic-bundle`）：游戏脚本的 esbuild 配置抽到导入无副作用的 `scripts/game-bundle.mjs`，正式构建与现役堆/F20 诊断共用 loader、target、define，诊断只在调用处覆盖压缩和探针；`pnpm package` 产物逐字节不变。调用 esbuild 的 8 个脚本已分现役/待确认/归档，CI 新增 `scripts/ci/game-bundle.test.mjs`。三个诊断现在能进入流程，#32 F20 仍 PARTIAL；两个堆诊断间歇出现 canvas 7→8（7 次里 4 次），未归因。
- 2026-10-23 · [暴击与三属性 Perk 实现（#77）](docs/tasks/critical-perk-contract.md)：分支 `agent/critical-perk`，基于 main `44494ea`，已同步 #79（`76adbd6`）与 #88（`b38f23d`）。CP-T01～T09 分阶段实现并逐段合入：共用纯规则 `src/perks.ts`、`src/breath.ts`；存档 session v5 / expansion v3 / raid v3，固定旧客户端拒绝新档；开枪暴击快照与 v3 命中；18 项被动效果与控枪；屏息接入 Runtime；基地选择与 500 现金重置服务；院子与旧页签界面（字体子集重建）。实现取舍见契约第 7 节；真人平衡、真机未验。
- 2026-10-23 · [#60 Q-D02 旧交易与装弹接口退役](docs/tasks/quality-entropy.md#q-d02-旧交易与装弹接口退役)（[PR #89](https://github.com/xuys2025/escape-bincov/pull/89)，`agent/q-d02-legacy-api`，起点 main `44494ea`，交付前已同步最新 main）：删去 `domain.ts` 只被测试使用的 `buy`/`sell`/`reload`，仍有意义的断言迁到正式路径：别家商人的货、硬塞进待卖的救济品由 `settleCartResult` 整单拒绝；站内商店拒绝上架救济品；旧页签「统一结算」写入失败回滚并保留购物车；装弹改测 `reloadMagazine`（补弹药不足、空包、口径不符）。玩法、存档与打包产物不变（HTML/ZIP/清单字节一致）。同步后本地单测全过（比 main 多 2 项）、`test:save-browser` 9/9；准确基线、head 与 CI 见承接 PR。

- 2026-10-23 · [#26 F13 搜刮时按 WASD 离开](https://github.com/xuys2025/escape-bincov/issues/26#issuecomment-6186494212)：分支 `fix/issue26-wasd-leaves-loot`，起点 main `b475b1b`。`coast-view/host.ts` 的 keydown 在搜刮面板打开时把移动键（`input.ts:isMoveKey`，按物理键）当作离开：关面板（拖动随之取消，不落格）后交给 `InputState` 立即移动；连发、Ctrl/Alt/⌘ 组合和输入框打字不算，搜刮时按住的 Shift 直接冲刺；背包、地图、阅读、暂停面板不变。桌面搜刮面板副标题和行动指南写明 WASD，`LOOTING.md`、README、游玩说明同步。`test:loot` 新增一步、改了原“搜刮时按 D 不动”一步，coast-sample W06 改用 Shift；main 构建在新步骤的面板关闭等待处失败（负对照）。
- 2026-10-23 · [#75](https://github.com/xuys2025/escape-bincov/issues/75) 受击闪白与抖动的慢帧时序（`fix/hurt-flash-slow-frames`）：`CoastView.present()` 先画角色、后读本批事件，命中的 70 ms 闪白和 80 ms 抖动从下一帧才开始计时；那一帧的间隔达到 70/80 ms（低于约 14/12.5 帧/秒；Pixi 每帧最多计 100 ms）时会先把它们减完，一帧也画不出。现在 `syncActor` 用 `ActorGfx.hit` 让命中后的第一帧至少画一次，更快的帧率逐帧不变。`test:shooting` 新增检查 g，用固定 dt 驱动视图：60/30/15 帧/秒仍为 4/2/1 帧，12、10 帧/秒由 0 帧变为 1 帧；main 构建上实测失败（[报告与裁图](docs/evidence/issue75-slow-frames/README.md)）。抖动方向（`atan2(-vy,-vx)`，朝射手）未改，是否改为顺弹道由维护者在 #75 决定。准确 head、验证结果与 CI 见本分支 PR。
- 2026-10-23 · README 更新（`docs/readme-20261023`）：按 main `b475b1b76a71af5223dc63971c75074547e390f6` 和开放 PR/issue 核对现状，补序幕、射击规则、独立试枪场、敌人素材、后续剧情/地图入口，区分已合入玩法与开发中的设计；同步任务清单顶部，历史原文保留。Node 24.21.0 / pnpm 11.19.0：515 单测、3 项入口文档检查、47 个 README 本地链接、1 个 HTML 图片路径和 22 个 package 命令均通过；`pnpm package` 通过且 HTML/ZIP/清单与基线字节一致。仅三份 Markdown，未改游戏或存档，未新增浏览器/真机验收结论。维护者已授权推送并在 CI 通过后合并；准确 head、CI 与合并状态见本分支 PR。
- 2026-10-22 · [代码审计与调用契约补强（PR #79）](docs/tasks/audit-contracts.md)：起始 `a6954e5`，已同步 #39 主线 `2bac4fb`，分支 `agent/audit-contracts`。严格拒绝原型键/数组 ID，修正负重上限实时来源、院子自动拆分、追击子步时间和新生弹提前飞行；服务类型移到 Runtime 契约，普通行动与试枪场均移除接线双重断言，补充状态/失败/校验局部注释与任务导航。实际验证、剩余风险和兼容边界统一见该摘要及 PR；本条不代表已合并或上线。
- 2026-10-22 · [改枪任务拆分与排期](docs/gunsmith/TASKS.md)（#28）：维护者要求把改枪规划拆成可执行小任务并排期，#28 合入表示已排期；同步 main（`8ef783f`、`2bac4fb`），按当前代码核对计划（Phaser 已删、射击基础由 #39 完成、物品没有实例数据、商店没有轮换），修正过时描述和失效链接。M0–M5 共 55 项任务、4 个实现 PR，预计 12-15 完成；M0 已由子代理在 `feat/gunsmith` 开工，进度在 [#80](https://github.com/xuys2025/escape-bincov/issues/80)。本 PR 只改文档。
- 2026-10-22 · [PR #40 暴击与 Perk 排期](docs/tasks/critical-perk-plan.md)：初核 main `8ef783f`，交付前同步 #39 已合入的 `2bac4fb`；[Issue #77](https://github.com/xuys2025/escape-bincov/issues/77) 承接 CP-T01～T10。可实施，最高风险为严格迁移、旧行动和弹丸快照；控枪/屏息接口仍待接入。沿用原 fork 分支并正常合入 main，保留双方历史；仅六份文档，功能/迁移/真人平衡待实施。维护者授权检查通过后合并设计稿；准确 head、静态检查及 CI 见 PR，#77 保持开放。
- 2026-10-22 · [PR #39 射击系统改造](docs/SHOOTING-SYSTEM-REWORK.md)：S0–S5 与试枪场都已实现（规则 `src/shooting.ts`，扳机在 `CoastRaidRuntime.pull` / `runTrigger`，表现在 `hud.aim` 与宿主准星，试枪场 `src/range/`）；实验台 `tests/shooting-bench.test.ts`，浏览器 `test:shooting`、`test:range`。维护者的决定（含选定“稳定”参数以突出改枪）、阶段状态、S1 测量与兼容方案见任务页；维护者 2026-10-22 试玩认可。
- 2026-10-22 · [PR #65 Runtime 缺口收尾](docs/tasks/runtime-gaps.md#收尾与同步)：同步 main（`a4f463a`、`c6ad042`），冲突只在生成物和记录。Runtime 接口（`07d3efc`）与前端接入（`a678142`：附近逐件列表、门被占提示、挂载/换层后重对时）均已完成；收尾时修了展开「附近」后来源列表压住 E 提示的问题，给门被占提示补了 buildings 回归，并修了矮屏换尺寸后画面最多 16 帧才再下移一次的旧竞态（首次 CI 里 qol-expansion 失败的根因）。本地 479/479 单测、13 套浏览器检查通过，coast-sample 只剩 #61 登记的 W13。合入后 #60 的 Q-E02 B 段可开工。
- 2026-10-22 · [#61 CI：主机包缓存与 lavapipe](docs/CI.md#浏览器-job-的主机环境字体chromium-与渲染器)：浏览器 job 不再经过 apt 镜像（字体固定版本走缓存），WebGL 改用 lavapipe 并在套件前检查渲染器；只改 CI，游戏、断言与生成物不变。实测结果与对照见承接 PR。
- 2026-10-22 · [#60 Q-E02 路由收敛 A 段](docs/tasks/quality-entropy.md#q-e02-路由收敛)：行动视图和院子经 `src/navigation.ts` 请页面换画面，不再导入 `ui.ts`；`toast`、备份下载、出击区域移成叶子模块；共享 Pixi 应用移到 `src/pixi-app.ts`，院子路由不再依赖行动宿主。`src` 已无运行时 import 环。B 段（行动句柄合同、背包有限服务）登记在 #60，依赖 #65；`coast-sample` W13 的测试时序问题登记在 #61。
- 2026-10-22 · [#60 Q-E05 存档 codec 去环](docs/tasks/quality-entropy.md#q-e05-存档-codec-去环)：严格的 profile/物品栏规则和校验原语抽到 `src/profile-codec.ts`，checkpoint、recovery-store、save-backup 单向调用它；expansion v1→v2 升级合成 `upgradeToRpg`。10 万用例行为对照：接受/拒绝与输出逐例一致，只有分层行动里 `null` 物品的报错从 JS TypeError 改为存档损坏提示。
- 2026-10-22 · [#60 减熵第二批](docs/tasks/quality-entropy.md#第二批)：删死代码与只被测试使用的旧接口、合并重复实现、修好三个失效的 CI 外套件（hideout 进 CI），新增套件登记、源码健康与入口文档三道守卫；健康扫描确认的 10 个缺陷登记在 #60。
- 2026-10-17 · [PR #66 敌人与尸体的 2.5D 角色图](https://github.com/xuys2025/escape-bincov/pull/66)：Sol P0+P1 接入，审阅经过与截图见 [说明](docs/enemy-art/README.md)。
- 2026-10-17 · [地图敌人详细设定](docs/ENEMY-DESIGN.md)：基于 main `345aff4`，分支 `docs/map-enemy-design`；按用户确认整理五大类、18 原型、十二规划区域及条件敌对规则。纯文档提案，源码/存档/素材/制品未改；与 #66 现有四类素材接入分开。链接、原型/字段/区域完整性及差异检查结果、准确 head 与 CI 见承接 PR 正文；本地不运行游戏测试或打包，设计合入不等于已实现。
- 2026-10-16 · [PR #64 2.5D 收尾](https://github.com/xuys2025/escape-bincov/pull/64)：旧行动在 2.5D 上打完，Phaser 删除，旧局内测试迁到 2.5D；剩余美术与 Runtime 缺口见 [收尾说明](docs/2-5d-closeout/README.md)。
- 2026-10-17 · [Runtime 缺口与复验](docs/tasks/runtime-gaps.md)：从 #64 `92a0b23` 独立续作，目标 main、依赖 #64；包含对旧行动/存档的固定 head 复验、四项接口和死亡规则依据，前端接入归 Opus。
- 2026-10-15 · [#60 质量与减熵实施摘要](docs/tasks/quality-entropy.md)：代码导航、局部契约与共享投影。实际测试状态随该摘要及 PR 更新。
- 2026-10-15 · [#61 / PR #62 CI 改造](https://github.com/xuys2025/escape-bincov/pull/62)：完整 36 套件八组重排、存档前置与计时门禁；维护者已授权合并，最新基线与已验/未验结果以 PR 为准。
- 下方保留以往交接全文；其中“当前”“未合并”“已通过”等仅对各自日期/提交有效。按任务索引、标题或符号检索相关段落，需要首败/兼容依据时再展开。

<details>
<summary>历史交接全文（按需查证，保留原文）</summary>

## 2026-10-12 · 暴击与Perk方案落实（仅设计文档）

维护者批准本会话方案：取消暴击与瞄准部位相关性，暴击按1减各来源未暴击概率之积合并，30%与30%得到51%，上限100%；三项永久属性15/20/25/30级各档独立二选一，满级12项；屏息每秒独立10%、3秒30%，开枪清空；基地500现金重置一项属性全部perk。

从最新main `64505046fb737af195bc808d2f8e4274df21cf24` 建隔离分支 `docs/critical-perk-design`。更新[RPG规则](docs/RPG-SYSTEM-DESIGN.md)、新增[24项perk及25项未来验收规格](docs/CRITICAL-PERK-DESIGN.md)，同步README导航与任务清单。原#13/#16历史保留；其旧中心暴击公式已被本次新行动目标取代，但当前代码和旧行动兼容仍有旧规则。本次未实现新玩法。

已核对相关开放PR的实际正文：#39承接射击基础、#28承接改枪目录；本次不改其分支、不派工，控枪perk未来接入独立后坐契约，不能靠缩小霰弹散布冒充后坐减免。新旧行动边界、弹丸快照、付费重置回滚及严格导入均为待实现要求，不代表已通过迁移验收。

本地初次fetch因沙箱权限失败，获准重试后同步成功；GitHub连接器也核对同一主线SHA。原工作目录的handoff及未跟踪文件保留，全部编辑在独立工作树。Windows / Node 24.19.0实际完成58个相对链接与锚点、31张表/273行、24个候选标识/12个节点、25项未来验收编号、26项数值复算和11项源码事实检查，均通过；历史交接原文完整保留，git diff --check与仅五份文档范围检查通过。本地验证脚本与结果保存在忽略的test-results目录。

仅文档导航和设计变化，不改正式游玩说明、源码、测试、版本号、存档协议、HTML/ZIP或发布清单；pnpm test、pnpm package和浏览器测试本地未运行，纯设计无需游戏打包。未来CP验收、真人/真机和平衡均未运行。PR自动CI按对应提交另行核对，不能以文档公式通过代替功能实现；本轮不合并、不发布。

## 2026-10-16 · 2.5D 收尾：旧行动在 2.5D 上打完，去掉 Phaser（`feat/2-5d-closeout`）

起点 main `1764874`。玩家可见变化、逐套测试迁移和剩余工作见 [收尾说明](docs/2-5d-closeout/README.md)；这里只记接手要点。

- 路由：`src/coast-view/sample.ts` 的 `sampleSupports()` 对存档里的任何行动都为真（经典封锁区 `coast-v2` 检查点、`coast-v1`、商场一版也走 Runtime）。`?test=1` 页面的出击下拉仍有已关闭的封锁区，用来制造旧行动；不带 `sample` 的 Phaser 旧夹具已删除。
- 标题：`src/title/scene.ts` 在自己的 Pixi 渲染器上搭分层场景，`mountTitle()` 返回控制器（snapshot、counts、renderInfo、setRain、setMotion、setOverlay、sleep、onFrame）；PNG 只在 `src/title/art.ts` 导入，`scripts/build.mjs` 和 `tests/title.test.ts` 读它。`src/screen.ts` 按状态挂标题或站外画（`stationBackdrop()`）。
- 2.5D 宿主（`src/coast-view/host.ts`、`inventory.ts`、`coast.css`）补的行为：换层松开按键、`entry:*`/门口拒绝的中文提示、触屏点来源名直接打开、搜刮时 M 开地图、手机暂停/竖屏暂停（`.upright` 隐藏触屏按钮）、暂停面板的指南（指南里 Esc 回暂停）与备份、放置条（在面板顶部）、鼠标组合开火、冲突结算只留备份、选择列表只在内容变化时重写（`choicesHtml`）、触屏模式下动鼠标或滚轮回键鼠（非手机布局）、搜刮窗口危险行 `[data-risk]`（`lootRisk`）、同样的好消息提示合并「× n」（坏消息不合并，与旧版一致）、HUD 用 `env(safe-area-inset-*)`、矮屏提示移到触屏按钮上方。
- 测试夹具（只在 `?test=1`）：`src/raid-runtime/test-support.ts` 新增 `magazine`、`vitals`、`clock`、`spawnLoot`、`container`、`hurt`；共用的浏览器辅助在 `scripts/raid-view.mjs`。陷阱：分层存档校验拒绝任一地图 `localTime` 或 `training.motion.windowStarted` 晚于 `elapsed` 的候选（`expansion-state.ts`），倒拨时钟的夹具要同时夹住这两个字段（loot 套件已这样做）。
- 慢机器：CI 没有显卡，2.5D 每帧 0.2–0.5 秒；行动开始、换层、刷新后的头几帧常超过 2 秒，触发 Runtime 的卡顿暂停。行动类套件用 `scripts/stall-resume.mjs`（`resumeStalls`、`running`、`holdKey`、`openPause`）应对。本地复现：进程固定 1–2 个 CPU，并用 SwiftShader（`BINCOV_CHROME_ARGS`）。
- CI：`issue26-phaser-spatial` 退役，仍是 36 条。完整 `test:coast-sample`（本地约 1.5 分钟）只在本地跑：CI 软件渲染下 V-CAM 之后再开页会超时，进 CI 前要把 V-CAM 挪到最后并验证 V07、W12 的计时检查。expansion 本地运行需要 `git show 07b1414:dist/index.html > test-results/pre-m0.html`。
- 评审后补的：Runtime 旧封锁区的流血/污染掉血在 0 截止（否则流血致死的结算被身体校验拒绝，`tests/loot-recovery.test.ts`）；行动中备份走 `saveSession.backupRecord()`（Runtime 的实时快照）；竖屏暂停看 `html.mobile`，输入框聚焦时不算转屏；门口引导在敌人或子弹压上时隐藏（`scene.ts` `updateStructureGuides`）；HUD 在安全区内而按视口坐标定位的标记用 `--cs-ox/--cs-oy` 抵消；电台台词由 `placeRadio()` 放在状态卡与任务卡之间。
- 已知仍是缺口、留在测试里作回归守卫的（`scripts/raid-view.mjs` 的 `gap()` 打印 `GAP` 并断言现状，修好后测试变红、恢复原断言）：治疗被拒时 Runtime 丢掉自己的原因说明（ui、desktop-input、mobile，Astra）；「附近」逐件拾取（loot-target、mobile-ux，Astra）；楼梯名盖住正下方的敌人（issue26-spatial S03c 的 `KNOWN_GAPS`，前端）。
- 刘海安全区可以在 Chromium 里模拟：CDP `Emulation.setSafeAreaInsetsOverride`（mobile-ux 的 `insets()`）。`test:play` 失败时会打印存储错误和最近的拒绝事件。

## 2026-10-25 · #61 敌人套件完整视口分片

10-27 最终组合：main `9400cf6a4efdea4d8898c4d3adfdf9a61efab899` 已按顺序合入 #115、#129；#112 正常同步前置 #108 head `aa68c3b1641b56c7676c0eba84b41c998361aa78`，保留原分支历史并提前验好组合。939 单测、73 CI 守卫、严格类型和正式打包全部通过；游戏源码/素材/领域测试/锁文件与该依赖 head 相同，HTML SHA-256 `d475bb48b8dd0e7b648aae019f473c33e37e1fccf7f0dbdaaf81da5a8b3a8344`。前一同步 head 的本机三片 67/59/39 全过且精确并集通过；本组合浏览器结果以原 PR 最新准确 head 的完整 CI 为准，不能挪用旧字节的浏览器结论。维护者已要求准备好、等 #108 完成即可合并：等 #108 先入 main，确认其准确 head 已在本分支、最终合成树等于已验树、完整 CI 通过后，按顺序正常合并 #112，不重新索要同一授权；合并后 main/发布门禁仍必须实际通过。

10-27 续作原 [PR #112](https://github.com/xuys2025/escape-bincov/pull/112) / `ci/enemy-suite-shards`，在隔离工作树正常合并已接受 main `8b5901931f1ca6b56d5dcb6f246ea94649a9a96b`。维护者指定 #115 → #129 → #108 → #112，后续须在前三项合入后再同步复验。当前瓶颈实测见 [CI 分片说明](docs/CI.md#敌人套件的完整视口分片61)，不重复建 PR。单测 925/925、严格类型与打包通过，HTML SHA-256 `af5e1b5769a56cc2c0440b1359412a96c89f98ad8dc134ac2c777d5399f9cd0f`；游戏源码、素材、领域测试与 main 相同。AST 对照确认两敌人脚本原有的 143/31 个断言、输入、等待、截图与 context 调用完整保留。CI 守卫 71/72，本机唯一失败为写死系统 Git Bash 路径，已有前置 #108 修复；首次沙箱单测因 `uv_os_get_passwd` 的 ENOMEM 失败，正常宿主重跑通过，未改断言。三个真实浏览器分片与最新准确 head CI 结果继续记在原 PR，不把 10-25 的结果当成本轮通过。旧首败及历史证据保留如下。

从 main `974a3a8` 在 `ci/enemy-suite-shards` 续作。三个成功 main 的 batch-8 套件步骤为 15:14–17:45，其余组明显较短；缓存及排队仅秒级。此次保留原敌人断言主体，将相互独立的 1280×720、1920×1080、844×390 完整街区/商场链分给 batch-6、batch-8、batch-7；其他套件和旧客户端消费者不迁组。默认 `pnpm test:enemy` 仍跑完整三视口。

唯一分片计划、165 条 case 清单与证据协议见 [CI 分片说明](docs/CI.md#敌人套件的完整视口分片61)。三片在原 timing 行附加精确单元/case、输入配置、run/SHA/attempt 和时段证明，执行器及独立门禁均拒绝缺片、空选择、重复/遗漏、未完成链及旧报告；保留八 runner、失败/取消门禁和真实 120 秒训练。游戏源码、格式和原断言未改。本地 874 单测、72 CI 守卫及 package 通过，HTML 与 main `974a3a8` 一致。完整 CI 首轮 `40161563791` / `be62a79` 的三片分别 67/59/39 case 实际通过；整体因原 station-reset S6 精确 toast 等待失败，保留首败而未重跑冒充通过。S6 后续预先等待本次新反馈，先排除已有同文案 toast，原 20 秒/错误文字/原始字节/副本/写次数/无下载/存储对话框断言保留；旧 main 与候选真实 UI 的同 3.5 秒控制端延迟对照为 13/14 与 14/14，证明后置观测缺口，尚不声称重建了该次 CI 的具体时序。正常无延迟完整回归 14/14；准确新 head CI 结果见 [PR #112](https://github.com/xuys2025/escape-bincov/pull/112)；没有将失败门禁的等待、不同 CPU 的小样本或控制诊断当作整体性能验收。

## 2026-10-15 · CI 第二阶段：八组均衡与执行耗时（#61）

维护者授权开始推进 [#61](https://github.com/xuys2025/escape-bincov/issues/61)。分支 `ci/balanced-regressions` 从最新 main `a2d716d` 开始，纳入刚合入 #57 的第 36 条 raid-default。首批集中在整套件八组重排、存档检查前置、逐命令耗时与完整执行记录门禁；保留游戏/测试行为、真实训练、单文件离线和发布契约。后续 case 分片与诊断采样优化仍由 #61 承接，见 [CI 说明](docs/CI.md)。同一目标保持一个 PR。

本地 437 单测及 package 已通过，生成物与起点字节一致。CI 规则/执行器验证、固定版本三轮 Linux 对照与准确 head 的实际结果更新承接 PR；本记录不表示已经合并、上线或已达到提速目标。其他 Agent 的产品提交独立推进，提交前再次 fetch 并正常合并必要基线，不覆盖他人工作。

## 2026-10-15 · 行动默认走 2.5D，关闭沿海封锁区，不再支持无 WebGL 设备（`feat/2-5d-default`）

维护者准备全面 2.5D 化：封锁区和街区是同一张图，关掉封锁区以后重做；不再支持没有 WebGL 的设备；能跑 2.5D 的设备都要能完整玩。起点 main `50a05aa`。

- 路由按世界走，不再看网址：`src/coast-view/sample.ts` 的 `sampleSupports()` 接受 `coast-buildings-v1`、`mall-v2`、`mall-v3`；`sampleMallLayout()` 对商场一律给 3；`raidWorlds()` / `defaultWorld()` 给出可选区域和默认区域（沿海街区）。院子（`HostOptions.worlds` → `UI` → `deployHtml`）和旧页签的下拉都用这份列表。
- 测试夹具 `legacyRaid()`：`?test=1` 且不带 `sample` 时保持旧行为（Phaser 局内、三个区域且默认封锁区、商场一版），所以约 20 个旧局内浏览器测试不用改。带 `sample=` 的样板测试走新路由；只要带 `test=1`，`raidWorlds()` 仍包含封锁区，`test:hud-release` 才能在同一页面先打 2.5D 再打旧画面。
- 旧行动：存档里的经典封锁区（`coast-v2` 检查点）和商场一版，`sampleSupports()` 为否，仍从标题页「继续」进 Phaser 打完。
- 商场素材按行动世界加载（以前只在 `?sample=mall` 下加载）。
- 样板标记（街口外压暗、HUD「样板外」）只在 `?sample=` 下画：`ViewOptions.sampleMarks`。
- `src/webgl.ts`：启动第一步按 Pixi 的 `isWebGLSupported` 同样条件检查（`webgl` + stencil），不支持就移除 `#frame`、显示提示并返回，不读写存档。院子“启动失败退回页签”的退路保留，它处理的是启动后才出问题的情况（`station-browser-test` A4）。
- 街区室外地图 `name` 改为“沿海街区”（`building-world.ts`，世界数据不钉哈希）；旧页签底栏“沿海封锁区”改“行动规则”。
- 2.5D 手机操作加 `[data-swap]` 切换武器按钮，文字是要换成的武器。
- 测试：新增 `scripts/raid-default-test.mjs`（`test:raid-default`，CI title 组，第 36 条，R1–R9）；`portable-test` 和 `systems-browser-test` 的普通入口步骤改用 2.5D 画面的界面元素；`mall-sample-test` M12 改名。

验证（本机 Windows，Node 24，离线打包文件）：
- `pnpm test` 435/435；`node --test scripts/ci/*.test.mjs` 13/13；`pnpm package` 通过；
- `test:raid-default` 9/9（截图见 [docs/2-5d-default](docs/2-5d-default/README.md)）；
- `test:portable`、`test:systems`（16 步）、`test:coast-animation` 8/8、`test:mall-sample` 22/22、`test:station-tier1` 10/10、`test:coast-render-targets` 5/5、`test:title` 通过；
- `test:save-browser` 第 9 步“跨窗口冲突时导出备份”当时在所有分支失败，原因是种子超过 10 亿时结算存不下来，已由 #58 修复；合并 main `773dcdf` 后重跑通过；
- 发现并修正：启动检测若像 Pixi 那样主动让探测上下文丢失（`WEBGL_lose_context`），`test:title` 稳定失败（标题场景还没启动菜单就出现了），去掉后连续通过，原因写在 `src/webgl.ts`。

没有做：真机手机试玩；去掉 Phaser（旧行动收尾、约 20 个旧局内测试迁移、标题与结算页）；美术补齐（#47）和敌人素材；新的沿海封锁区。

## 2026-10-15 · 行动种子超过 10 亿时结算存不下来（fix/run-seed-overflow）

做开场动画 PR #56 时，CI 的 `test:save-browser` 在“跨窗口冲突后导出结算备份”一步超时；基线 main `50a05aa` 本地同样失败，昨天的 main CI 却通过。原因：行动种子取 `Date.now() >>> 0`（`normalizeSeed`），是 32 位数；当前行动、检查点和恢复记录都按 `0xffffffff` 校验，唯独 `migrateSave` 把“上次行动结果”的 `seed` 按默认上限 1e9 截断。种子超过 1e9 时，结算写入前的严格复核（`decodeSession` 比对规范化结果）不一致，整次保存被拒，玩家看到“结算尚未保存”；导出备份同样失败。时钟种子每 49.7 天里约 38 天超过 1e9：这一轮从 2026-10-14 18:09 UTC 到 2026-11-21 17:25 UTC。问题从首次导入就存在，之前开发恰好落在种子小于 1e9 的 11.6 天里。

修改：`src/domain.ts` 中 `lastResult.seed` 的上限改为 `0xffffffff`，与 `activeRun.seed` 一致。新增 `tests/save-flow.test.ts` 两例（种子 1039041854、4294967295）：结算写入、严格读取、重新打开、导出普通备份和恢复备份都通过；修改前两例都在“结算已写入”处失败。

验证：`pnpm test` 437；`pnpm package`；`test:save-browser` 本地全过（修改前在冲突导出一步失败）；用真实时钟的浏览器探针：种子 1039439851 出击后放弃，结算正常保存，刷新后存档正常；把时钟固定在 2026-10-14 03:00 UTC（种子 945438653）时基线也正常，固定在 2026-10-14 20:00 UTC、10-27、10-28 时基线都失败。兼容性：新版本写出的种子大于 1e9 的存档，旧版本会拒绝读取（不覆盖，提示无法读取）；旧版本在这段时间本来也存不下这类结算。

## 2026-10-15 · 开场动画 P0 动态分镜（feat/opening-cutscene）

维护者要求开实现 PR（#56）。从 #41 的 `456d96f` 建 `feat/opening-cutscene`，按[制作方案](docs/OPENING-CUTSCENE-PLAN.md)推进，已合入 main `773dcdf`（含 #58 种子修复）。

- `src/opening/`：时间轴（28 镜、139 秒，字幕与[分镜稿](docs/OPENING-CUTSCENE-SCRIPT.md)逐字一致，单测核对）；独立 Canvas 2D 播放器（640×360 整数倍放大、HTML 字幕、跳过/暂停、失焦自动暂停、减少动态效果）；合成音（雨、雨打铁皮、风、浪四条循环和 16 种音效，固定种子，A01 字卡期间生成，跟随游戏音量，舱门几镜加回声）；新存档第一次「进入水产站」自动播放，主菜单「序幕」重看，只记页面内存，不读写存档。
- 正式画面走索引色合成器（`pixel.ts`、`scenes.ts`）：手电光在暗、半明、亮和中心暖光四档之间按点阵逐级变化；闪电按色板提亮并画分叉闪电；两层雨、水花、进光圈的雨点变亮；水面闪光、光束里的盐尘、城市薄雾、横移视差。减少动态时不横移、不闪电、雨静止。
- 素材：Sol 定调三镜 r2（A08、A14、C04，16 张，341,558 字节），维护者已确认画风；第一批因导出时的中值、众数清理过粗而被替换。第二批前半（台风夜和舱门，49 张，1,031,071 字节）已接入：A02～A17 全部是正式画面（手机屏幕内容由程序画在倾斜的玻璃上，雨棚里的人在暗处用 Sol 的人物压暗色调，滩涂、船艏、舱门、抬头特写、满船都在手电光里），A01 是黑场。第二批后半（十六天、第十六天，32 张，927,857 字节）已接入：B02～C06 全部是正式画面（B04 白天的港口和搁浅的船，镜头缓缓移回 A08 的构图；C02 从编织袋缝里看抢东西、扭打倒地、拖东西走远；C04 先爬梯再坐上水箱；C05 远处黄光闪动；C06 蹚水带水纹）。新图共 97 张、2,300,486 字节，图片上限维护者放宽到 2.5 MB，色板 87 色。
- 验收：`pnpm test:opening`（`scripts/opening-test.mjs`，CI visual 组，约 17 秒）按玩家方式走普通入口（新存档自动播、Esc 跳过进院子、页面没有测试接口），并查老存档不自动播、暂停与失焦、「序幕」重看与焦点、减少动态、1920 三倍与手机尺寸、连续重看 20 次监听器和画布不增长、无网络请求。合成器按 4×4 块算光：CPU 降速 4 倍时每帧 8 毫秒以内。点击后播放器立即出现，画面解码、转索引色和声音生成都放在 A01 字卡期间分片做（桌面约 0.5 秒就绪，CPU 降速 4 倍约 2 秒，单次卡顿不超过 0.2 秒），没准备好就停在字卡上。素材模块由 `scripts/opening-assets.mjs` 按清单生成（按去掉版本号的编号索引，位置读清单）。
- 验收：成片按每秒 24 帧逐帧截图做成审核用 MP4（含字幕和声音），维护者审批通过，同意合并。审看用的镜头号改为只在 `?test=1` 测试页显示，`test:opening` 断言普通入口看不到。方案第 9 节 OP-01～OP-13 有自动测试或实测；OP-14 由维护者确认，真机、真人观感未测。
- 测试：`tests/opening.test.ts`、`tests/opening-pixel.test.ts`、`tests/opening-synth.test.ts`；`title-review` 按新菜单顺序更新 Tab 断言；按普通入口用新存档进入的套件（asset-load、portable、station-tier1/tier2 普通路径，以及 `scripts/yard-entry.mjs` 的公共函数）用 `skipOpening` 按 Esc 跳过开场。字体子集新增 70 字；构建校验 `assets/opening/manifest.json`。

## 2026-10-15 · 开场动画定稿（#41）

维护者确认[制作方案](docs/OPENING-CUTSCENE-PLAN.md)第 10 节和[分镜稿](docs/OPENING-CUTSCENE-SCRIPT.md)第 2 节的七项改动（含船艏露出「远汐」）。定稿：新存档第一次点「进入水产站」自动播放，主菜单「序幕」重看；删去 A18、B00 和到站的 D02～D04，第四段只留「第十七天」字卡，没有台词的镜头各缩 1～2 秒，创作者原话全部保留，约 2 分 19 秒；图片体积上限 1.5 MB；素材清单按此更新。先正常合入 main `50a05aa`，交接记录和任务清单按日期保留双方条目。

只改文档。实现另开新 PR（`feat/opening-cutscene`）：Sol 先画 A08、A14、C04 三张定调图，Opus 同时做 P0 动态分镜。以下历史记录保留。

## 2026-10-14 · 商场 2.5D：遗留几项处理（#47 / #48，维护者授权合并）

维护者说“按你的想法改，改完就合并”。先对 5 项分别调查，每项再由一名复核者检查方案（决策记录在会话 scratchpad 的 decisions/*.json）。然后各在独立工作区实现，测试都先在旧代码上确认会失败，最后拣回本分支。

- `5bee2df`：床和长椅的接触暗线只画在图的实际宽度下面（`mall-scene.ts` 的 `sideSpan`、`mall-ground.ts` 的 `band`），M14 检查。
- `161f599`：`structure-guide.ts` 的 `mallCutaway` 永不剖开 sealed 区域（检修核）。二层 F2-01 包着它，原来人在大厅里时 54 块核墙会变成条纹。新增 `mall-view.test.ts` 一项和 M19。
- `f6e0fb2`：新文件 `src/coast-view/view-scale.ts`，默认整数倍缩放只往远拉（floor(fit) ≥ 0.75·fit 时取整数，否则保持小数倍）。`?crisp=1` 为 near，`?crisp=0` 为原规则。1920×1080 下 2 倍、960×540 世界像素；1280×720、1366×768 不变。新增 `coast-view-scale.test.ts`，M08 加断言，新增 M16b。这改动修订了 10-08“保持 24 格宽”的记录：只拉远，所以那条理由仍成立。
- `ec1c792`：`lighting.ts` 的 `revealLevel`，揭示后 0.3 秒升到全亮；隐藏时即使 dt=0 也立刻归零；新建的灯直接取当前状态，闪光不渐变；系统“减少动态效果”时同样渐变。新增 `coast-lighting.test.ts` 和 M17（M17 必须是第一页最后一步）。
- `34e0f3f`、`31c8e9d`：布局三版 `mall-v3` / `mall-layout-3`。
  - `MALL_V3_LAYOUT` 由二版按替换表生成：两张茶几改 2×1 `coffee-table-wide`，放在 (58,19)、(58,33)；四组露台桌椅改 2×1 `bistro-set`。
  - 二版字节钉 SHA-256。`resolveExpansionWorld`、runtime 白名单、presentation、session、hideout、station、sample 都认三版；`sampleMallLayout` 返回 3，`sampleSupports` 同时接受 v2 和 v3。
  - `mallProps` 对所有件居中，投影按图的宽度。
  - 新增 M18 和 `mall-runtime-compat.mjs` 的三版步骤（main 的包遇到三版会拒绝并保留原始字节）。
- `a041898`：新文件 `src/coast-view/camera.ts`。
  - `snapAxis`：从未取整的人物位置取偏移，在 0.75 像素内保持；加在取整后的人物位置上；按取整后的边界夹住；另有一条“不逆着平滑方向走”的规则，防止起步时回退。
  - `host.ts`：镜头跟随改用 Runtime 的 t0 增量，夹在 0.1 秒以内。
  - 前探改为 24×17，右键保持 81.6×57.8；武器和手臂按身体取整后的位置算。
  - 新增 `coast-camera.test.ts`；`coast-sample-test.mjs` 动画组（CI）加 V-CAM，V05 臂差收紧到小于 0.01。
- 不改：商场墙高（保持 48）、天花板（不加），理由见 README。

另并入 main `5a11e3d`（#52）。审查只开两名审查者（存档与世界数据、画面代码），没有另设逐条验证。

验证：在合并 main `5a11e3d` 后的包上测试：
- `pnpm test` 435；
- `test:mall-sample` 22/22；
- 城中村 `coast-sample-test.mjs` 全量 53/53（含 V-CAM）；
- `test:issue26-spatial` 通过，`test:issue26-phaser-spatial` 18/18；
- `test:coast-render-targets` 5/5（`--wide` 也是 5/5）；
- `test:hud-release` 通过，`test:issue26-inventory` 20/20。

各分支实现时另跑过 `mall-runtime-compat`、`mall-passages`、`mall-landing`、`systems`，以及新测试在旧代码上必须失败的对照，结果都已核对。其余几套在合并后的包上复跑的结果、完整 CI 记录在 PR #48。

遗留：
- 水产站院子镜头有同样的取整抖动，没改。
- 帧率低于约 10 帧时，镜头跟随被夹在 0.1 秒，抖动可能回来。
- 检修核顶面仍是平灰。
- 按住右键时画面滑动比原来多约 70%；触屏前探也减半。这几项需要真人试玩确认。

## 2026-10-14 · 开场动画制作准备（#41 续作）

维护者要求完善 [#41](https://github.com/xuys2025/escape-bincov/pull/41)，准备制作开场动画。#41 的分支在创作者 fork `LMX-323/escape-bincov` 的 `docs/opening-cutscene-script`，允许维护者编辑，续作直接推原分支。先正常合入 main `5cfd841`，交接记录按日期保留双方条目。

[分镜稿](docs/OPENING-CUTSCENE-SCRIPT.md)把原稿与已接受主线对不上的七处按主线改：一个月改成十六天；失踪许久的船改成台风夜搁浅的远汐号；不拍怪物涌进县城，“深海的诅咒”改成传言；外地人躲在城中村烂尾楼；夜里看见水产站的光、天亮出发；新闻改成台风；加一段到站衔接游戏。老张、老王的对白和其余原话保留，原稿逐字留在文末，七项待创作者确认。新增[制作方案](docs/OPENING-CUTSCENE-PLAN.md)：像素动态漫画、独立 Canvas 2D 播放器、自动播放与跳过规则、素材与声音清单、体积与字体、P0～P3 分工和 OP-01～OP-14 验收。

只改文档；游戏源码、存档、素材、字体和发布包不变，没有运行 `pnpm test`、`pnpm package` 或浏览器检查。本地核对见 PR 正文。下一步等维护者确认方案第 10 节、创作者确认分镜稿第 2 节，再从 P0 动态分镜开始。以下历史记录保留。

## 2026-10-14 · CI 文档快速通道与八组均衡分配

维护者授权 [#53](https://github.com/xuys2025/escape-bincov/issues/53)，基线 main `5a11e3d`，独立分支 `ci/docs-fast-lanes`。新增保守文档白名单与完整非文档树指纹，只有相同代码/测试/工作流/依赖/制品已有成功 main 八组完整回归时才跳过浏览器；PR 比较整体 base 到合成合并树，main 不依赖最后一次 push 差异，手动运行或 API/证据不足走全量。保留每次单测、打包、所有提交制品一致性校验，保留 `Build and test` 必需检查及主线 Pages 正常发布，镜像同步脚本无需改动。原 34 条浏览器命令均保留，分成八组，旧客户端跟随消费者。详见 [CI 说明](docs/CI.md)。

本地 Node 24.21.0、pnpm 11.19.0：358 项单测通过，13 项 CI 策略测试通过（含真实临时 Git 仓库链接检查、75 种汇总 shell 门禁组合、原浏览器命令覆盖）。打包生成物与基线一致。GitHub 完整回归与实际耗时见本任务 PR；此记录不表示已合并/上线。未改游戏源码、存档、玩法、素材、断言或真实计时要求，未复用 PR 检查或调整服务器。

## 2026-10-14 · 水产站：食堂进不了宿舍（fix/station-dorm-door）

维护者截图问食堂到宿舍的路是不是被挡了。从 main `405d40d` 建 `fix/station-dorm-door`。原因：宿舍只有一扇门，在食堂与宿舍共用的 x=17 墙上 (17,4)；食堂的案台 `pots`（`src/station-view/layout.ts`，1×2，阻挡）放在 (16,4)–(16,5)，正好占住门里侧那格。院子的碰撞（`nav.ts` 的 `Collision`，脚框 12×7）在门这一行只有 26 像素可走，全被案台挡住，人从食堂进不去，休息区（站点在宿舍里，半径 44）走不到。实测：站在 (15.8,4.6) 按住向右 1.2 秒原地不动；从案台上方斜着挤会卡在门框边。原来的 `station-browser-test.mjs` H1 只检查宿舍屋顶掀开（人到门口就会掀开），所以一直通过；E1 直接把人放进宿舍，也没走门。

修改：案台挪到 (16,5)–(16,6)，贴东墙、在门下方，不挡食堂南门 (13,7) 和炊事员；画法不变。新增 `tests/station-layout.test.ts`：所有道具同时立着（任何存档能出现的最多障碍）时，用院子自己的碰撞规则从院子出发做可达性搜索，检查每个房间都走得进、每扇门两侧都到得了、每个交互点在半径内有可站的位置，并检查宿舍门里侧没有阻挡道具；修复前其中四项全部失败（含“休息区走不到”）。H1 的侧门检查增加“脚要过门”，并补一张宿舍截图；用修复前的包对照，H1 失败在“脚停在 x=15.80，应过 18”。玩家在院子里的位置不存档，存档不受影响。

验证：`pnpm test` 358（含新增 4 项）；`pnpm package` 通过；`test:station` 的 E1、H1（走到 x=18.98）和 H10–H16 通过；H1 用修复前的包对照失败（“脚停在 x=15.80，应过 18”）。完整 CI 见 PR。说明与前后截图在 `docs/station-dorm-door-20261014/`。

## 2026-10-14 · 商场 2.5D：家具比例（F-05，#47 / #48）

维护者反馈 F-05：沙发和茶几“还是瘦，比例不对”。三方审计确认错在 10-13 给 Sol 的补充反馈（沙发进深、床长按格子估）。按 24 像素/米（冷柜、隔断正面 48 ≈ 2 米，货架 40 ≈ 1.65 米，人物不透明 39 行）重定尺寸，维护者从对比图选定：沙发 B（60×44，靠背高座面浅，底部透明 0 行）、床 B（56 宽、58 长，0 行）、茶几 30×26 居中（8 行）、长椅 56×27 居中（8 行）、落地灯 14×43 立在格心（13 行，发光图只盖灯罩）。Sol 按 `工作标准` 里的逐行模板交付，`assets/mall/manifest.json` 升到 revision 4，`scripts/mall-assets.mjs` 重新生成导入表；画布、抬高、锚点、碰撞占地和 `mall-layout-2` 都不变。

代码：`mall-dressing.ts` 给落地灯单独一个底座大小的 foot（`x+11, y+12, 10×8, lift 8`）；`mall-scene.ts` 只在 foot 伸到贴图最后一行时才按底部透明行裁短，落地灯灯光移到 `p.z - 16`。`test:mall-sample` 的 M14 从贴图画布量底部透明行，断言每件阴影底边等于 `z - gap`（沙发、床 0，茶几 8），并检查落地灯阴影只有底座大小；`tests/mall-dressing.test.ts` 加了落地灯例外。

同批合并最新 main `405d40d`（#49 #26 快速可修项、#51 故事改稿）：只有 `WORK-QUEUE.md`、`handoff.md` 和生成物冲突，日志按日期保留双方条目，生成物在合并后的树上用 `pnpm package` 重建。两边都改过的源码只有 `coast-view/scene.ts`（#49 的步态，自动合并）。

验证：合并后的最终包上 `pnpm test` 396；`test:mall-sample` 18/18；城中村 `coast-sample-test.mjs` 52/52；`test:issue26-spatial` 通过、`test:issue26-phaser-spatial` 18/18；`test:coast-render-targets` 5/5；`test:mall-landing`、`test:mall-passages`、`test:station-reset` 通过。合并前（只有 F-05）另跑过 `pnpm test` 356、`test:mall-sample` 18/18、城中村 51/51。二层客厅、卧室和楼梯旁长椅的前后截图见 `docs/mall-2-5d/screens/9-f05-furniture-1280.png`。

未改、留给维护者：茶几与沙发隔一整行且偏西 16 像素（要升布局 revision 3，影响二版存档）；床和长椅两侧比画出来的宽 4 像素，接触暗线两端各伸出约 2 像素，近看才看得出。以下历史记录保留。

## 2026-10-14 · 商场 2.5D：试玩反馈修正（#47 / #48）

维护者试玩 `c1b9671` 后报 F-01～F-04。F-01 露台咖啡桌：一格挤一整组桌椅，改为 `art/mall.ts` 的 `paintCafeSet`（按人物和伞的比例，约两格宽，以原来那一格为中心），碰撞仍是一格（改成两格会让旧的二版行动读档失败），伞杆居中。F-02 沙发、床、长椅像浮着：素材底部有 12–18 行透明，`mall-scene.ts` 按素材实际底边裁短投影并加接触暗线。F-03 楼梯标签：改为 HUD 像素字（`host.ts` 的 `stairNames`，世界层小图只保留位置与显示规则，城中村 issue26 空间验收不变）；站在楼梯口时让给头顶提示；商场里已画出的 S-N 不挂名字、地面画黄色箭头，其余楼梯 8 格内才显示。F-04 进门与晕：四个角度取证分析后，`structure-guide.ts` 只剖开所在房间（进出各一格缓冲），走廊里只剖开所在走廊段正前方一两排墙，北面和东西两侧外墙不剖、南面外墙随房间剖开，剖开的墙保留整格实心墙脚；`mall-dressing.ts` 的 `mallOpenings` 识别两个方向和转角上的入口（按最内层房间比较，厚墙门洞算一个；一层 12 个、二层 9 个），画门角标（x-ray 层，9 格内）和地面门槛，门头只放在东西向真入口；侧门南墙压成台阶；孤立单格画成柱子；布局二版出生点改在正门广场（`MALL_V2_SPAWN`，`initializeMallRaid` 用世界出生点，一版逐字节不变），一层楼层名改“一层”；HUD 显示室外地点名，未布置房间稍暗并标“样板外”；室内不飘纸屑；`?crisp=1` 整数倍缩放（默认不变）。

修正后多代理审查（4 个方向，每条发现另有验证者复核）确认的问题已全部修复，包括咖啡桌碰撞回到一格以保住旧存档、城中村楼梯名显示规则恢复原样（`issue26-spatial-test.mjs` 的 S04b 改为检查屏幕上的 HUD 文字）。

验证：`pnpm test` 356；`test:mall-sample` 18/18；城中村 `coast-sample-test.mjs` 51/51、`test:issue26-spatial` 14/14、`test:coast-render-targets` 5/5、`test:mall-landing` 通过、`test:mall-passages` 7/7。留给维护者决定的：默认整数倍缩放、镜头取整、瞄准前探、灯光淡入（都会连带城中村），以及商场墙高和天花板。以下历史记录保留。

## 2026-10-14 · 商场 2.5D：Pixi 画面接入（#47 / #48）

`?sample=mall` 出击用布局二版（标签页、水产站出发和继续行动都按存档里的布局），在 Pixi 2.5D 画面上画：`src/coast-view/mall-scene.ts` 按布置表建墙（同类墙一张图）、门头、家具（可淡出的遮挡物，标牌和发光跟随所属物）、灯光与环境光分区；`art/mall-ground.ts` 画地面块（64 像素图按格子奇偶取块，滩涂仍是泥地，二层临空画街面，贴花与投影烘入）。切墙改为玩家所在房间加楼内正前方几格，广场上看外立面不切。雨只在楼外，海声按楼体判断。素材在 `assets/mall/`，`scripts/mall-assets.mjs` 生成导入表，`mall-art-load.ts` 只按需加载，Node 测试不碰 PNG。没有素材时退回通用占位画面。

共用修正：事件、子弹、粒子、贴花、命中与方向提示、受击声、窗光和 HUD 房间名都改用与 Runtime 一致的重叠房间判断；撤离点在 Runtime 发布它的任何楼层显示；图集页每帧最多上传一次。

共用修正二：命中标记与受击声改为同时看目标本身（弹着点可能落在房间外），隐藏尸体的血迹随尸体房间隐藏；两处在本分支之前就有。多代理审查（5 个方向，每条发现由验证者复核）确认的 6 个问题已全部修复。

验证：`pnpm test` 354 项（新增 `tests/mall-view.test.ts` 7 项）；`test:mall-sample` 15/15（修复前的包对照，新加的三项都失败）；最终包上村庄 `coast-sample-test.mjs` 51/51、`test:coast-render-targets` 5/5、`test:mall-landing` 通过、`test:mall-passages` 7/7。中途一版命中判断把帧里没有的目标也当作不可见，村庄 V06 的契约探针（虚构目标、空地命中应提示一次）因此失败；已改为帧里没有的目标只看弹着点，复跑通过。`coast-launcher-check.mjs` 失败是脚本过时（假定普通入口直接进标签页），不在 CI，未改。已知问题：外立面朝外一面暂用室内立面图；未布置区域只有替身杂物；两层地面块保留约 35 MB 显存。手感、掩体与敌人路线未做真人评估。以下历史记录保留。

## 2026-10-14 · 《等海退去》Gemini 改稿集成

按维护者确认的主线故事与人物对白范围，从最新 main `aec0cbd` 建 `docs/story-gemini-rewrite`，承接任务 [#50](https://github.com/xuys2025/escape-bincov/issues/50)。用户提交十个正文 MD 和十八条对白 JSON；与上传快照比对后组装完整候选稿，修正配给单位、旧病例结局、打捞时间、清路日期及三处对白，并处理封潮正文与设定索引的既有矛盾，保留开放结尾。当前定位表、写作交接和导航同步，旧来源及历史验收不回写。[实际来源、校正与审阅事项](docs/story/GEMINI-REWRITE-20261014.md)。

只改文稿、对白表回应与相关文档，原条件／选项／ID及产品字节不变；本地文档核对与密钥检查后提交一个草稿 PR，CI按最终准确head登记。没有本地运行游戏或剧情测试，文稿内容仍未接入；等待维护者文学审阅，不自行合并或发布，其他实现分支不受影响。以下历史交接保留。

## 2026-10-14 · #26 快速可修项

维护者要求一次修好 #26 里能尽快解决的项，经 PR 自查合并并更新 issue，不打扰商场 2.5D（#47/#48）。从 main `e9cbaa5` 建 `fix/issue26-quick-wins`：院子商店价格按买卖方向、真实拒绝原因、入库提示与窄屏价格（F03 局部）；普通 Phaser 建筑/商场画面不透明屋顶、按朝向的门指引、楼梯三角与标签、「爆头」不再泄露屋内敌人（F07/F11）；2.5D 倒退反向短步与侧移转身、触屏无瞄准时面朝移动方向（F08）；院子菜单「清空存档，重新开始」及恢复（F12）；破产救济按可卖价值放宽两条（F12/F04）。后三项规则由维护者本轮确认；整层揭示本轮不做。只有 F08 改了 `src/coast-view/scene.ts` 的 `ActorGfx`/`syncActor` 与一行 import，避开商场分支已改区域；生成物后合并方需重新打包。范围、验证、首败与剩余项见[本批记录](docs/issue26-20261014/README.md)。F03 整体重做、F06、整层揭示、Phaser 腿部动画、无法读取存档的救援、D01–D06 与真机保持开放。以下历史记录保留。

## 2026-10-13 · 商场 2.5D：布局二版数据（#47）

维护者确认商场 2.5D 化，决定做布局二版、`?sample=mall` 先行、先做正门广场到露台一段。登记 [#47](https://github.com/xuys2025/escape-bincov/issues/47)，分支 `feat/mall-2-5d` 从 main `7df2d22` 开始。本批：`src/mall-layout-v2.ts` 家具登记与 `mallWorldV2()`；`mallWorld()` 拆成共用函数，一版输出 SHA-256 不变；`initializeMallRaid` 增加可选 `world` 参数（默认一版）。二版只改八个切片区域和超市北侧一排，S-N 在两层大堂内东移到 (62,13)。二版未注册到 `resolveExpansionWorld`，普通存档不能创建或恢复它。

`tests/mall.test.ts` 改为一版、二版各跑一遍原有 5 项，新增 `tests/mall-layout-v2.test.ts` 5 项（哈希、骨架不变、家具完整、落点与穿行带、通道宽度）。坐标表、规则与平面示意见[商场 2.5D](docs/mall-2-5d/README.md)。Runtime 接入、二版注册与恢复兼容、34 条商场用例复验交 Astra；渲染等 #43、#44 合并；素材由 Sol 制作。真人手感、掩体与敌人路线未评估。以下历史记录保留。

## 2026-10-13 · PR #43 已合并，#44 组合验收

维护者明确要求检查无问题后合并两PR。#43准确head65e5b36的完整CI38414347980成功、无待处理审阅，已正常合并为1ad9b2d，合并tree与受检head完全一致。#44沿原分支正常同步该主线；CoastView两条import及双方交接均保留，生成物正式重新打包，组合版本314单测、打包、双尺寸资源各5/5、空间14/14、动画6/6已通过；准确head完整CI通过后按本次授权合并。#26/#32总单及原未完成范围保持，主线CI和Pages分别核验。以下历史状态保留。

## 2026-10-13 · PR #44 同步已合并的 #46

最终核对时main已前进到7df2d22（#46）。正常合入该主线，保留双方完整交接，生成物重新打包；#46的商店13项输入门槛随主线保留。之前受检提交的完整CI已成功；同步后的准确head另跑完整CI，最终状态见原PR。未合并本PR、未发布，issue总单及未完成范围保持。

## 2026-10-13 · PR #44 收尾复验

沿原分支正常同步 main 95036af。原CI存在真实安全箱裁切及站内失败；本轮修复工具栏布局、忙帧双击识别、存档失败遗留搜刮目标与楼梯标签遮挡，校正短屏滚动验收及真实多窗口夹具。314单测、打包、站内16/16、局内20/20、空间14/14、旧战术8项、商店11/11及一级10/10通过，双击旧包负对照与首败保留。额外完整院子75/76，唯一短名裁切已通过标题栏工具区和36px格子修复；主线对照4/4、修后相关6/6与站内16/16通过，不拼成一轮76/76。证据和构建边界见[本批记录](docs/issue26-20261013/README.md)，最终head完整CI仍是交付门槛。#26仅更新本批状态，总单及F03/F06/F08/F12、D01–D06、真机/真人保持开放；未合并或上线。以下历史记录保留。
## 2026-10-13 · #26 库存与室内辨识（待最终验收）

从最新 main `3f706b7` 建 `fix/issue26-player-feedback`，落实 F01/F02/F05/F07/F09/F10/F11 的库存及样板空间辨识改动，并独立复验 F04 救济。范围、实际结果、首败及剩余事项见[本批记录](docs/issue26-20261013/README.md)。维护者后续要求额度不足尽快收尾，因此提交草稿 PR，完整 CI 与最终组合验收通过前不合并；#26 保持开放，其他射击/剧情 PR 及 #32 历史未确认项保持原归属。以下历史记录保留。

## 2026-10-13 · PR #43 同步已合并的 #46

最终核对时main已前进到7df2d22（#46）。正常合入该主线，保留双方完整交接，生成物重新打包；#46的商店13项输入门槛随主线保留。之前受检提交的完整CI已成功；同步后的准确head另跑完整CI，最终状态见原PR。未合并本PR、未发布，issue总单及未完成范围保持。

## 2026-10-13 · PR #43 收尾复验

继续原分支，正常合入main 95036af并保留双方文档历史。原e11552c完整CI已成功；本轮295单测、可复现打包、两尺寸资源各5项及动画6项通过，补专项等待正式暂停恢复的时序，产品字节不变。[首败和最终证据](docs/issue32-followup-20261013/README.md)。当前最终提交等待完整CI，完成后更新#32对应子项，总单与历史未确认事项保持开放。

## 2026-10-13 · #32 城中村渲染目标释放与动画验收采样

从最新 main `3f706b77` 建独立分支 `fix/issue32-validation-followup`，承接已合并 #42 后的资源与验收维护。真实调整城中村视口20次，逐uid复现已销毁渲染目标的空槽0→60；复用院子的精确清理函数，仅删除本view刚销毁的三张RT的null槽。两尺寸专项各5/5，覆盖20次resize、12次视野切换、6次原生WebGL恢复、输入/像素、结算及回站再出击；其他活动资源、共享表及测试制造的无关空槽均保留。停放最后一帧仍持有一个已销毁source，下一宿主渲染后回收，该边界如实记录。

同时分离V03的受控动画像素契约与自然帧数据，修正V10事件后延迟采样导致的误判；自然帧率不因此签收，原V09/院子性能门槛保留。新资源与动画专项接入CI。实际原版对照、首败、负对照和最终验收见[本轮报告](docs/issue32-followup-20261013/README.md)。本轮按维护者明确授权完成独立复核、CI及验收后经PR合并，最后更新#32，不直接推送main。F20仍PARTIAL，原R/K不整体改签，SAVE/A6仍UNCONFIRMED；真机、素材、待定规则及其他开放PR保持原归属。以下历史记录保留。

## 2026-10-13 · CI-SHOP-TOUCH-01 输入时序修复（A＋B）

维护者已接受修复决定并要求在新PR做。从已接受 main `95036af9b97ef136c874a650a8176f7fd37d6d52` 创建 `fix/shop-double-touch`，只承接商店双触验收及共享库存格的输入时间判定。窄屏测试在同一CDP会话连续排队四条真实触控事件，再统一等待；四事件顺序/可信touch/目标、取消和未取整时间证据在成功与失败都保留。产品使用`e.timeStamp`，不改变320 ms窗口。新增原生时钟门槛验证80 ms输入经历450 ms长任务仍入车、350 ms输入即使一起处理仍只选择；旧main两项都能准确检出。原11项商店事务检查保留，正式HTML/ZIP/manifest按`pnpm package`更新。[实际验证、负对照、首败与截图](docs/shop-double-touch-20261013/README.md)。

本地295单测与打包已成功，商店专项13/13，24倍降速限定双触/交易阶段的原窄屏拒绝案例2/2；完整CI/相关回归状态以该记录和新PR正文为准。固定时钟会替换Event.timeStamp，因此两项新增输入时间回归保留原生事件/performance时钟，只固定Date.now业务时间，旧事务测试原夹具不变。首轮CI两项最终输入结果正确，但正常5秒自动checkpoint与原档不变断言竞争，已保留报告并作此Date-only夹具修正，产品和字节断言不改。最初全页面24倍降速触发启动超时及固定时钟无效探针均保留，不签双触通过。真机未测，#44相关失败未签收，院子降频另待定。等待维护者审阅，不自行合并/发布/更新镜像；#45已合并的纯文档准备不代表剧情已实现，下面历史记录保留。

## 2026-10-13 · #31/#30 合并后，市场剧情实施准备

维护者本轮明确授权合并 #31 与 #30，并要求判断未实现部分、开草稿准备后续开发。#31准确head e566137完整CI成功后合并为bc04ffa；#30最终head444f1ea经过严格最新main同步，文件树与4f3901c一致，[完整CI](https://github.com/xuys2025/escape-bincov/actions/runs/38391212187)成功后按授权合并为2bc3214；#31[准确head的CI](https://github.com/xuys2025/escape-bincov/actions/runs/38388375349)亦全成功。最终接受基线为 main `2bc321486edc652004ad612d8661f9e5f0ca0a49`。

独立分支 `feat/story-market-slice` 承接[市场剧情任务书](docs/STORY-MARKET-IMPLEMENTATION.md)、导航与任务归属。新增S0～S4范围、当前源码依据、原存档/物资/RPG规则与mk-a01～mk-a30门槛；原维修、奖励与供电已有实现，新的剧情能力尚未实现。后续16节点及区域、人物去向、三结局待所属批次细化，原射击/改枪/Perk/开场动画/资源/玩家反馈PR保持归属，不复制实现线。

本轮只做源码核对和文档准备；本地链接、锚点、命令、ID覆盖、差异范围及密钥钩子按实际记录，未本地运行剧情/游戏/真人/真机测试。产品、素材、存档和HTML/ZIP/manifest不变。草稿保持Draft，完成建档后停止，等待后续实施指令，不自行合并本草稿或手动发布/更新镜像。以下历史记录保留。

## 2026-10-13 · PR #30 同步文学精修与当前主线

依据维护者本轮“合并30与31、判断未实现部分并开草稿”的指令，按已确认依赖先 #31 后 #30。本分支保留 LMX-323 原head 0a3b485，正常同步主线及 #31 e566137，不重写公共历史。README/WORK-QUEUE/handoff三处冲突保留最新首页、任务与双方交接；三份规格补当前文学稿、18条可检索定位与已完成的#22/#33前置说明，原事件ID、知识边界和市场规则保留。产品、素材、存档、HTML/ZIP与发布清单相对新主线一致。

六文档274本地链接、锚点与18节点/12区域/14人物/15线索/8锚点/18对白/30验收覆盖已实际核对；git差异空白通过，原密钥检查和钩子保留。纯文档未本地运行游戏/剧情/真人真机验收；最终准确head完整CI为合并门槛。市场接入准备由后续独立草稿承接，原repair、供电表现已有，剧情状态/迁移、固定补给、见闻/对白/回顾仍缺失，后续16节点和县外结局未实现。以下历史记录完整保留。

## 2026-10-13 · PR #31 主线同步与授权合并准备

维护者明确授权合并 #30 与 #31；依据原 PR 的依赖说明先处理文学精修 #31，再处理转化规格 #30。本分支正常合入 main `3f706b77e9b924b0cee085e79c54479a0c19da65`，交接冲突保留双方全部历史，文学正文不改写。相对最新 main 的产品、素材、存档和发布制品保持一致；等待本次准确 head 的完整 CI 成功后执行已授权合并。剧情游戏接入另由后续草稿承接。

## 2026-10-13 · #32 商店反馈、冷图片恢复与旧 HUD 释放

从最新 main `64505046` 在独立分支 `fix/issue32-shop-recovery` 复现并修复三类可独立确认的缺陷：交易现金/空间拒绝原因及过期清单原地刷新；两套冷 PNG 绘制异常导致加载不结束；SOL-F20-HUD-01 的 Phaser 全局鼠标事件保留旧 HUD。原版有效负对照、实际验证、截图与剩余范围见[验收报告](docs/issue32-20261013/README.md)。295项单测、最终构建17项专项、5项场景往返和5项生命周期通过；产品提交91a38b1完整CI通过。额外旧院子65/76、城中村47/51，其全部失败点已在原main对照复现并保留，未降低断言。最终验收记录与CI见[PR #42](https://github.com/xuys2025/escape-bincov/pull/42)。维护者已明确授权自验通过后经 PR 合并，不直接推送 main。#32/#26总单、F20总堆、原R/K、SAVE/A6历史未确认、真机及产品/素材待定项保持开放；既有射击与剧情 PR 不改。以下原历史记录保留。

## 2026-10-12 · 开场动画剧情稿

基于 main `64505046fb737af195bc808d2f8e4274df21cf24`，在独立文档分支提交用户提供的[简易分镜与完整剧情](docs/OPENING-CUTSCENE-SCRIPT.md)，保留原稿措辞，仅整理 Markdown 段落。此稿尚未接入游戏或制作动画；与已批准主线的船只身份（远汐号／七号）及抵达水产站时间（一个月／第十七天）需要后续创作者确认。本轮仅做文档核对与差异检查，未运行游戏测试或打包。

## 2026-10-12 · 游戏射击系统改造独立建档

按维护者明确要求，从 main `64505046fb737af195bc808d2f8e4274df21cf24` 建立 `feat/shooting-system-rework`，仅交付[任务书](docs/SHOOTING-SYSTEM-REWORK.md)和任务索引，建立名为「游戏射击系统改造」的草稿 PR。射击实现、独立验收、维护者试玩及获准合入构成 #28 改枪实现前置；仅合入文档不解除依赖。#28 保留目录、品牌详情、实例和改装扩量，本 PR 不反向依赖 #28 合并，调研固定引用 a3ff524。

完成建档后停止，等待下一次明确指令再实施。未改产品、依赖、素材或制品，未派发 Astra/Opus/Sol 工作，未合并发布。本轮验证限文档、差异范围及密钥钩子，实际射击验收全部未完成。以下历史交接保留。

## 2026-10-12 · PR #28 品牌详情与射击前置调研

维护者已选择「品牌放详情」，配件目录 100 行拆分功能名称与制造商，去掉重复品牌和 B，编号、兼容、收益、代价不变。核对 main 6450504 的源码、未修改离线包的实际鼠标输入及 Runtime 取样：现有指向、固定散布、右键精瞄有效，但缺少累积武器后坐与动态稳定；当前小散布使一些距离的精瞄收益不明显。

新增 [射击基础调研](docs/gunsmith/SHOOTING-FOUNDATION.md)和[实测摘要](docs/gunsmith/evidence/shooting-20261012/diagnosis.json)，引用开发方一手资料并标明适配本项目的建议。M0-S 放在改装之前：Astra 先定最小逻辑契约，Opus 主导可玩样板与表现，Sol 验证，维护者试玩认可后再扩充。当前只改设计与导航，没有实现新射击、生产素材或改包；纯文档核验与本地诊断不代替游戏新功能验收。#32 原状态保留，未合并发布。以下历史记录保留。

## 2026-10-12 · PR #28 同步主线与配件命名待选

维护者要求先解决 #28 的冲突，并重新讨论配件重复品牌前缀。在原分支 `docs/gunsmith-after-pr22` 正常合入 main `64505046fb737af195bc808d2f8e4274df21cf24`：README 采用已接受的新首页并补回改枪导航；WORK-QUEUE 保留主线验收历史和改枪条目；双方 handoff 历史完整保留。更正 #22 设计和 #33 实现已合并的依赖状态，旧 2026-10-09 核对快照明确标为历史。

20 枪、100 配件目录及功能/兼容关系保留，品牌前缀等待维护者选择；本轮不启动 M0、不改游戏源码或生成物。文档链接、目录数量/唯一编号、相对 main 的纯文档边界与密钥检查按本次提交实际核验，最新 CI 以原 PR 的最终 head 为准。#32 的 PARTIAL/未确认/真机未测项保留，不以总清单清零阻塞后续功能。以下历史交接按原日期保留。

## 2026-10-12 · SOL-R3-CAP-LISTENER-01 能力切换监听

从 main `1dbacb4` 建 `fix/cap-listener-r3`，只处理 #32 三级的 SOL-R3-CAP-LISTENER-01。根因是 Pixi 8.22 `DefaultBatcher._updateMaxTextures`：能力变化后池里复用的 Graphics 渲染数据每次新建 DefaultShader、不销毁旧的，旧 Shader 的 BindGroup 永久挂在模块缓存的 batch-sampler 组上。C5 的增长来自测试 scratch 绘制，真实院子→城中村往返也会触发。`src/coast-view/renderer-lifetime.ts` 改为整页每个纹理数一个 DefaultShader，批处理器的 Shader 与自身纹理数保持一致。

修复前 C5 8/9（监听 3→8 / 4→9）、新归属检查 2/4；修复后 9/9（监听全程 2）、4/4，程序复用、像素、恢复后输入与暂停、院子/城中村往返回归通过。只模拟能力查询，真实 8 槽设备与驱动迁移未测；F20 PARTIAL、ASTRA-SAVE-01 UNCONFIRMED 及原 R/K 失败不变。[报告与复验入口](docs/station-yard/opus-cap-listener-20261012/README.md)。完整 CI 通过后交主调度验收；未合并、未发布、未更新试玩站。以下历史交接原样保留。

## 2026-10-12 · README 对齐当前主线

维护者要求在 Opus 处理监听问题期间更新过时的首页说明。从 main `1dbacb4` 建独立分支 `docs/readme-current`，只调整 README 与交接索引：补齐默认水产站院子、三个行动区域、城中村可选入口、院子/局内按键、成长与存档说明；复用已提交的真实截图，移除已失效的候选状态和旧测试数字，保留素材、真机、内存及历史异常边界。Opus 的 `fix/cap-listener-r3` 工作树和产品源码未改。

本地核对 29 个相对链接、17 个 package 命令及 2 个独立测试脚本，均存在；说明对照当前源码和实时 #26/#32。Node 24 下 `pnpm package` 通过，两个 HTML、两个 ZIP 与发布 manifest 相对基线均无变化，`git diff --check` 通过。纯文档未在本地重跑游戏测试；PR CI 另行执行，最终结果以对应 head 为准。提交独立文档 PR 待审，不自行合并或发布；以下记录保留其当时状态。

## 2026-10-11 · 进站救济归属与药剂名称

从已合并 #35 的 main `21e3796` 建 `fix/station-relief-entry`，落实 #32 的 ASTRA-STATION-RELIEF-01。`enter()` 在进站前保存符合条件的救济，院子重挂不发物品；原页签布尔接口保留。保存失败停在入口，刷新/重试不重复领取，满包只保留剩余队列，已有训练样本先保存。药剂拒绝提示统一为“除藻药剂”。

292项单测、6项真实构建专项通过；旧源码新单测1/5，旧HTML专项1/6，均有效检出旧问题。打包可复现，存档格式及离线能力不变。[报告、实际回归与截图](docs/station-relief-20261011/README.md)。准确head的完整CI通过后交维护者审阅；未合并、未手动发布/更新试玩站，F20/SAVE及真机未测状态保留。以下历史交接原样保留。

## 2026-10-11 · PR #35 第二级 A 批实现与验收

按维护者明确指令在 `D:/bincov/ai-tier2-station` / `fix/ai-tier2-station` 继续原 [PR #35](https://github.com/xuys2025/escape-bincov/pull/35)。fetch 后 main `6494b51`、原head `8c24ac3`，工作区干净；当前 agent 独立完成逻辑、既有界面接线和验证，没有派工。

- API-02：只读、隔离的 `trainingProgress()` 将已提交、真实有效待保存秒数、候选收益、十分钟共享上限及保存/冲突等待状态统一提供给进度环、提示和设施面板；移除前端本地秒数累加及回调。读取不写档/推进计时/发奖，失败候选与样本不重复计入，外部revision不能混入旧样本。原训练规则与 `base.training` 的已提交语义保留。
- API-03：同一 `useRpgItemResult()` 效果判定返回物品不存在、不可用补给、实际无效果原因；原boolean调用者兼容，院子显示原样结果。水/罐头/医疗复合效果与持续效果保留，拒绝不消费，保存成功才生效，失败回滚，冲突/锁定优先。现有toast只修本批长提示的层级及窄屏定位。
- 287单测、必要打包、15项专项通过，真实132.331秒墙钟完成120秒有效训练；三尺寸截图、有效旧构建五项负对照、首败及受影响回归见[本轮报告](docs/station-tier2-20261011/README.md)。新增提示按原固定字体来源补三字，许可不变。存档格式、主档键、人物/场景素材和发布流程不变。
- 原 PR 最终head完整CI全过后才转Ready，只将 #32 两项标为待合并，总单/历史F20/SAVE/真机状态保留；经7897代理推送，原密钥检查/钩子保留。交回主调度审查后停止，不合并、发布、更新试玩站或开始其它二三级事项。当前提交与CI最终状态以PR为准。

## 2026-10-11 · 第二级 A 批开工入口（准备历史）

第一级 #34 已经维护者授权审查并合并为 `6494b51`，#32 对应两项完成。主调度按“推进到下一步”从此 main 建 `fix/ai-tier2-station` / `D:/bincov/ai-tier2-station`，只准备[训练进度与补给反馈](docs/AI-LEFTOVERS-TIER2A.md)的小批次范围。当前是文档准备，产品/测试/素材/生成物不变，没有宣称功能通过。

下一执行者为 Sol，由维护者转交提示词后开工；在本分支的同一草稿 PR 完成 API-02、API-03 的逻辑、现有界面接线、专项与受影响回归，最终 CI 通过后转 Ready，交回主调度审查并停止。本批无需同时派 Astra/Opus，不做救济、素材、内存或新规则；#32 保留其余状态。原一级和下方历轮描述按日期作为历史保存。

## 2026-10-11 · PR #34 第一级实现与验收

按维护者本轮明确指令，在 `D:/bincov/ai-tier1-station` / `fix/ai-tier1-station` 继续原 PR #34。fetch 核对 main fc2a1d3 与 PR head 3c21622，工作区干净；当前 agent 一次完成两项，没有派工。

- T1-01：院子 HUD、电台与旧页签统一显示真实「累计出击 N 次」，保留 day 兼容字段、统计规则与现有画面。
- T1-02：正式快照新增只读可空的 charm 副本，院子桌面/窄屏整备改读同一快照，移除 route/host/UI 专用共享状态回调；存档格式、装备效果及交易规则不变。
- 新增3项领域测试与10步离线真实 UI 专项，专项纳入 CI world 组。实际回归、两尺寸/窄屏截图、首败与原包负对照见[本轮验证](docs/station-tier1-20261011/README.md)。最终 CI、提交和对应子项状态以[原 PR #34](https://github.com/xuys2025/escape-bincov/pull/34)为准。
- 首轮远端CI专项6/10，world与总门禁失败，其他三组通过，完整日志/报告/四张失败截图已保留。修正脚本对220ms面板动画和五秒检查点的竞争：等待真实动画/字体，仅两个故障事务固定Date；产品代码与制品不变。普通与四倍CPU减速复验均10/10，修正后原main负对照仍0/10。重新推送后只认最终head的完整CI结果。
- 第二轮CI专项8/10，故障事务通过，两个桌面文案测量仍被五秒重绘/旧节点影响；其余三个浏览器组通过，world与总门禁失败。日志/报告/两张失败截图保留。几何检查改为当前DOM节点的同帧只读测量，原边界/裁切条件不变；锁定Chromium153普通与四倍CPU减速均10/10。最终状态仍以原PR当前head完整CI为准。
- 经原本地密钥检查提交/推送，使用维护者指定的7897代理；只更新 #32 两个一级子项，总单开放。二三级、真机/真人、历史F20/SAVE/A6状态不变。完成后停止；没有合并、发布或下一轮授权。

## 2026-10-11 · AI 遗留分三级，第一级建立开工入口

维护者明确授权分级并开一级 PR。基于最新 main fc2a1d3 建 `fix/ai-tier1-station`，只提交[计划](docs/AI-LEFTOVERS-TIER1.md)和任务索引；当前产品、素材、存档和生成物未变。一级固定两项：纠正水产站天数误称、护符展示改读正式快照；二级为接口/事务/素材协作，三级为底层归因、偶发异常及设备/新玩法范围。按难度分级不降低存档故障严重性。

已核对源码、Issue #32、开放 PR 及原已合并 #22/#33；纯文档检查链接和范围，不重跑游戏测试或打包。下一步在同一草稿 PR 完成两个小项的逻辑、Opus 接线及 Sol 集中复验；本轮准备结束，不自动派工、不合并、不发布。

## 2026-10-11 · 实现 PR #33 同步已合并设计

设计 #22 已合并为 9e5173b。本提交正常合入 origin/main，解决三个文档冲突并保留双方历史；游戏源码、素材、测试、构建与离线包均未变化。实现 PR [#33](https://github.com/xuys2025/escape-bincov/pull/33) 等待当前 head 的必要 CI，通过后按维护者明确授权合并；后续问题在 #32。

## 2026-10-11 · 设计 PR #22 合并收口

维护者明确要求先合并 #22，再合并本地实现的新 PR。此提交正常合入 main 并保留双方文档记录，仅解决 handoff / WORK-QUEUE 冲突，不修改游戏源码或生成物。实现另行承接；AI 遗留记录在 [#32](https://github.com/xuys2025/escape-bincov/issues/32)，玩家建议仍在 #26。

## 2026-10-11 · 实现合并收口

2026-10-11 合并收口：维护者授权先合并设计 #22，再合并本实现 PR。候选 c565d97 的游戏源码、素材、测试与生成物保持不变；历轮原始附件完整归档。当前范围、证据与延期边界见[实现交付](docs/IMPLEMENTATION-RELEASE.md)，AI 遗留见 [#32](https://github.com/xuys2025/escape-bincov/issues/32)，玩家反馈仍在 #26。以下历轮状态按原日期保留，不代表继续派修或当前远端状态。

> 合并整理说明：本文结论与历史失败保留，4 个原始证据链接转至[归档说明](docs/IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

## 2026-10-11 · Sol 独立资源复验（固定68daab4，本地提交后停止）

原分支 `agent/hideout-runtime` 接手68daab4，固定产品与HTML/ZIP字节；Node24.19.0、pnpm11.19.0。见[分项签收及最终证据](docs/station-yard/sol-resource-r3-20261011/README.md)、[负责人遗留](docs/station-yard/sol-resource-r3-20261011/issues.md)、[实景目视](docs/station-yard/sol-resource-r3-20261011/visual-review.md)。本轮只改3个测试与报告，新旧原始失败/脚本快照保留，历史材料不改。

- 旧RT空槽清理PASS：旧uid全部移出，60恢复180出/180入、null0；原Buffer旧HTML负对照60次失败、empty9→189。原同能力ASTRA-R3-PIXI-01修复PASS：程序弱身份、当前GL重链接/uniform/实际像素与同idHash3/3/3通过；共享组实际4/4/4固定。反复模拟8/16切换另发现监听3→8、4→9，C5失败交Opus；仅查询能力模拟，真实8槽设备未测。
- Astra固定口径三组各60轮独立进程、浏览器串行，精确六表/归属/释放失败0；旧context60对照60/60。总堆另判PARTIAL：重挂端点+2.045MB、共享+0.875MB、恢复−1.006MB，均值/斜率/图路径分别记录，未归因部分不关闭历史F20。原R/K严格失败逐项保留，不用冷路径与预热路径互相覆盖。
- lifecycle真实院门流程最终1280/1920各5/5，原17断言保留；直接simulationTime在lost/restore暂停期间冻结，显式继续才推进、真实结算释放成立。预载PNG复制故障已测，冷PNG解码未测。J1先抓新旧DOM/动画/trusted输入，确认三次发送关闭前旧节点采样失败；修后旧6/6、新6/6、无trace新版2/2，原67断言与50ms触摸不改，无动作重试。
- 最终Node24完整链 frozen install、275单测、package通过；院子76、城中村51、普通3及九套受影响回归通过，额外C5与原R/K失败单列。ASTRA-SAVE-01仍UNCONFIRMED；真机/真人/原生GPU内存/显示帧率/远端CI/更长循环未测。

本地原分支提交后停止，不改产品方案/素材，不扩查历史存档，不推送、合并、发布或更新试玩站。密钥检查与原提交钩子保留。以下历史交接原样保留。

## 2026-10-10 · Opus 水产站第三轮：上下文恢复的两项资源问题（本地提交后停止）

从 Astra 资源归因提交 `7a4dc75` 在原分支 agent/hideout-runtime 继续，开工时工作区干净，origin/main 仍为 43a342c。只修 Astra 已确认的两项，见[修复报告](docs/station-yard/opus-resource-r3-20261010/README.md)和[给 Sol 的独立复验清单](docs/station-yard/opus-resource-r3-20261010/SOL-RECHECK.md)。

- 旧 RT 空槽：`HideoutScene.releaseTargets()` 在 resize/destroy 销毁旧三张 RT 后，用新的 `releaseManagedSlots` 只删除这三个 uid 在 `glTexture` 表里的 null；活条目、sharedQuad 等其他空槽不动。恢复 60 轮空槽全程 0（同会话修复前 9→99→189），每轮 3 个旧键离开、3 个新键进入；改窗口尺寸也不再留空槽。
- ASTRA-R3-PIXI-01：`src/coast-view/renderer-lifetime.ts` 经 Pixi 公开扩展接口把 graphics 适配器换成按 `maxBatchableTextures` 整页复用程序的子类，Shader 每次新建、旧 Shader 释放但不销毁共享程序。恢复 60 轮 shader 源码键 3/3/3、9,228 B 不变（修复前 6/36/66、+260,160 B）；顺带消除每次恢复给共享 batch-sampler 组多挂的一个监听。新上下文里程序重新链接、uniform 位置与 sampler 绑定正确，降到 8 个纹理单元时换对应程序并能回到原程序（`scripts/station-context-program.mjs` 修复后 8/8，修复前 3/8）。
- 固定口径三组 60 轮（Chrome 154.0.8037.99）：重挂、共享、恢复均为 BOUNDED_CHECKS_PASS_HEAP_PENDING，严格/归属失败 0；恢复组修复前同会话 PARTIAL 60/60。堆诊断改为按标记推导混淆名、按构建 SHA 核对（`station-resource-build-map.mjs`），对旧构建复现 Astra 的别名与 6/36/66。总堆仍 PARTIAL（重挂/共享的编译代码、Performance 记录、原生部分未逐字节归因）。
- 回归：275 单测、package、院子门禁 76/76、城中村 51/51、普通入口 3/3、hideout 8/8、mobile 10/10、mobile-ux 11/11、desktop-input 10/10、shop-drag 21/21、portable 6/6、title 27/27、save-browser 9/9、systems 16/16。原 Sol R 四败、K3/K4（sharedQuad）照旧；J1 在两个构建上同一步间歇失败；`coast-lifecycle-test` 在两个构建上都因旧页签入口 0/4，均为既有问题，未改断言。
- 没有改 Runtime、存档、接口、素材和画面方案；ASTRA-SAVE-01 仍 UNCONFIRMED，F20 等状态不变。真机、真实 GPU 内存、远端 CI 未测。

仅本地提交，未推送、未合并、未发布、未更新试玩站。没有读取或上传 SSH 私钥；提交经过本地密钥检查钩子。

## 2026-10-10 · Astra 水产站资源第三轮（固定5075ed6，本地提交后停止）

原分支 agent/hideout-runtime 续作；main仍43a342c，PR #22仍OPEN，未合并/推送/发布。见[完整归因与实际结果](docs/station-yard/astra-resource-r3-20261010/README.md)、[资源所有权](docs/station-yard/astra-resource-r3-20261010/OWNERSHIP.md)、[Opus/Sol复验清单](docs/station-yard/astra-resource-r3-20261010/HANDOFF.md)。

- 原Sol R四个严格失败原样复现。门3纹理/72墙frame、玩家8动作/描边、Pixi sharedQuad及3缓冲有身份与强根路径。完整预热后独立60重挂与60共享往返精确资源/释放检查通过；旧host/scene及每轮5,317个标记资源全部收集。
- 独立60恢复每次新增3个旧RT管理表null，9→189，最终重挂清零；60次严格失败保留。活资源723/GPU纹理661稳定，堆中当前RT始终3个。
- **确认ASTRA-R3-PIXI-01，交Opus**：GraphicsAdaptor.contextChange每次新GlProgram，名称编号导致createIdFromString全局idHash强持有新shader源码。0/30/60为6/36/66键，60轮+260,160B；重挂与共享的同一缓存不增长。修复边界在Pixi渲染层，不代改渲染方案。
- CDP堆6–10与56–60均值差分别+0.636/+0.621/−1.052MB；快照区分测试弱引用容器、V8编译/浏览器性能记录及shader字符串。未逐字节全归因，整体SOL-R2-RESOURCE-01/F20仍PARTIAL；ASTRA-SAVE-01仍UNCONFIRMED，历史SOL-F20-HUD-01不改签。
- 273单测、package、图算法2/2、资源门禁反例2/2通过；产品源码、素材、两HTML/ZIP/manifest与5075ed6完全一致。无确认Runtime/会话服务缺陷，所以仅交诊断/测试/书面交接。真机/GPU原生内存/远端CI未测；未更新试玩站。以下历史记录全部保留。

## 2026-10-10 · Sol 第二轮定向独立复验（固定 c24d32b，本地提交后停止）

在原分支 agent/hideout-runtime 固定 c24d32b7984fb0b0b62eeb9bc100e349fccdb166，Node24.19.0 / pnpm11.19.0。产品源码、素材及构建字节未变。见[两项签收与独立证据](docs/station-yard/sol-round2-20261010/README.md)、[负责人遗留](docs/station-yard/sol-round2-20261010/issues.md)、[八组同视角目视](docs/station-yard/sol-round2-20261010/visual-review.md)。

- INPUT-01 自动化范围 PASS；LIGHT-01 画面/裁剪 PASS，关联资源单独 PARTIAL。完整院子76/76、单测273、package及清单十套受影响回归通过；相同 H17/I/L 检查跑旧0abe402为7/23，有效负对照。H17原段不改、H16四尺寸直接入口通过。补验双供电全部入口中心/四角实际触摸，逐时核对通电/出门/回站UI隐藏；测试选择器、动画坐标和状态等待的问题修正，首败与脚本快照保留。
- 全院194墙访问后，真实WASD横纵相机位移349/408px，4548渲染帧边界检查、同帧全部墙重取光/重绘像素对照无差异；漏墙负对照992像素。八组L1和独立目视通过，地面光照RT/人物/屋顶固定时钟对照一致。ABBA提交耗时增约5%～41%，不等于真实GPU帧率签收。
- 充分访问20重挂显式释放通过，总堆+0.713MB；原G6+0.511MB另列。四次城中村往返首次资源增加后稳定；上下文恢复出现空槽/纹理计数增长，重挂后清理，严格失败保留。该不同口径诊断堆端点+4.631MB，未归因，资源整体与历史F20继续PARTIAL。ASTRA-SAVE-01仍UNCONFIRMED。真机、真人、显示/GPU性能、原生内存和长循环未测。

新增宿主管理表观察交Astra主查、Opus配合墙格生命周期；历史ART/COPY/API/RELIEF状态不变。仅测试/文档/证据本地提交，保留原密钥检查及钩子；未推送、合并、发布或更新试玩站，完成后停止。以下历史材料保留。
## 2026-10-10 · Opus 水产站第二轮：手机菜单遮挡与墙面逐格明暗（本地提交后停止）

从 Sol 验收提交 `0abe402` 在原分支 agent/hideout-runtime 继续，开工时工作区干净，origin/main 仍为 43a342c。只修 Sol 遗留清单中的 OPUS-STATION-INPUT-01 与 OPUS-STATION-LIGHT-01，见[第二轮报告](docs/station-yard/opus-round2-20261010/README.md)和[给 Sol 的定向复验清单](docs/station-yard/opus-round2-20261010/SOL-RECHECK.md)。

- INPUT-01：“交互”按钮只在能自由走动时显示（菜单、面板、对话框、出门/通电动画期间隐藏）；窄屏“功能”菜单改为两列（矮屏三列）卡片、层级最高；菜单开着时点画面只收起不走路，旋转收起、只改高度保持。Sol 的 H17 断言原样通过；新增真实触摸/鼠标检查 I1–I5 共 14 项，覆盖两种供电、横竖屏切换、菜单开关与面板往返。
- LIGHT-01：墙块拆成光照小格（墙顶 4×4、墙面 8 列），在与相邻墙块共用的角点和边上取光后插值；墙顶取光只看位置；窗/门口地面溢光不再照墙；画面外的墙不取光不绘制。新增 L1 在实际渲染帧上测同一墙面接缝跳变：修复前 8 个视角 7 个超标（p90 最高 0.332、最大 0.438），修复后 p90 ≤ 0.033、最大 ≤ 0.060。屋顶本来就是整块单一亮度。
- 最终构建（Node 24.19.0）：273 单测、package、院子门禁 76/76（含 Sol 54 项）、修复前对照 7/23，Astra hideout 8/8、mobile 10/10、mobile-ux 11/11、desktop-input 10/10、shop-drag 21/21、portable 6/6、title 27/27、save-browser 9/9、systems 16/16、城中村 51/51、Sol 普通入口 3/3。院子场景提交耗时约 2.0 → 3.0 ms（无头）。总堆 37.4 → 38.0 MB 仍按 PARTIAL 记。
- 没有改 Runtime、存档、接口和素材，未发现新依赖；ASTRA-SAVE-01、F20、ART-01/02/03、COPY-01、Astra 接口项状态不变。真机、真人、真实 GPU、长循环未测。

仅本地提交，未推送、未合并、未发布、未更新试玩站。没有读取或上传 SSH 私钥；提交经过本地密钥检查钩子。

## 2026-10-10 · Sol 水产站独立验收（固定 ee09381，本地提交后停止）

在 D:/bincov/hideout-runtime 原分支 agent/hideout-runtime 接手 ee093814322a570fdebc73945d5501fee9470639，初始工作区干净，核对 main/PR 实时状态，固定 Node24.19.0 / pnpm11.19.0；产品源码、33张正式素材、两份HTML与ZIP字节未变。见[签收报告与证据索引](docs/station-yard/sol-acceptance-20261010/README.md)、[Opus/Astra遗留](docs/station-yard/sol-acceptance-20261010/issues.md)。

- 原47项、补强中间49项及必要回归均有实际证据；最终54项保留H17竖屏菜单中心被“交互”遮挡的产品失败，不能写全通过。四尺寸交易/刷新使用可见入口通过，竖屏备用路径不关闭遮挡缺陷；交Opus处理。通电墙面格块和老栓待机噪点已确认；转身缺帧及占位角色列后续素材需求，未补图或代改前端。
- 补给成功/拒绝都有断言；训练按实际有效120秒、等级3规则奖励及四种暂停门控核对；绕杆32候选只实际执行15、跳过17并保留方向/原因。检查正常内部帧计数，精确限制无WebGL预期日志，标题完整存档仅排除三处元数据并按规则核对休息计时；首败与有效正/负控制保留。
- 资源释放本机短测PASS（同应用身份、释放/停放、输入、六管理表及缺字段负对照）；总堆仍有未归因正增长，PARTIAL。纠正README“堆不增长”措辞，历史F20 PARTIAL、ASTRA-SAVE-01 UNCONFIRMED、SOL-F20-HUD-01不变。真机/真人、实际GPU性能、系统切窗、原生内存和严格长循环未测。

仅测试、文档与验收证据本地提交；未推送、合并、发布或更新试玩站。原密钥检查及提交钩子保留。完成后停止，后续产品表现交Opus，Runtime/存档及总堆归因交Astra。以下历史交接保留。

## 2026-10-10 · 水产站院子正式整合（Opus），本地提交后停止

基线 `81fbb8a`（Astra 真实 Runtime，已含城中村与商店修复），工作树 D:/bincov/hideout-runtime、分支 agent/hideout-runtime，开工时工作区干净。把原型（含 docs/08 的 F03 寻路卡死与绕杆、F02 窄屏通电、旧页签快捷入口）迁入 `src/station-view/`，接上 `hideoutRuntime`，换上 Sol R1 + R1.1 正式图片（许医生四帧按 R1.1 替换，其余 29 张不变）。

- [接线说明](docs/station-yard/README.md)：默认进入院子、受控启用成长并保留旧档、旧页签作快捷备用入口（院子“页签”/0、菜单、页签界面“回到院子”、启动失败自动回退）、设施沿用原型布局、固定雨夜。交易、存档升级、出击与结算全部走正式接口；院子与城中村共用一个 Pixi 应用，Phaser 循环在院子期间休眠。
- [验证记录](docs/station-yard/VALIDATION.md)：Node 24.19.0 最终构建上 273 单测、package、院子 47/47、Astra hideout 8/8、城中村样板 51/51、商店拖放 21/21，其余 20 套 CI 浏览器回归全部通过；前两轮的失败与处置保留在记录里。
- [Sol 独立验收清单](docs/station-yard/SOL-ACCEPTANCE.md)。本轮新发现并修复：发光盖住人物（深度排序发光层）、1280×720 修理铺溢出、挂院子时旧页签残留、地面贴图未释放、无 WebGL 时 Canvas 渲染人物变黑（改为退回页签）。字库按固定上游重新生成子集（+67 字）。
- 交回 Astra：快照缺护符字段、`useSupply` 拒绝文案、进站发救济是否并入 `enter()`、未保存训练秒数、“第 N 天”文案、旧 BaseScene 去留。交回 Sol：缺侧身/背面待机帧、老栓正面待机噪点偏多、船商与居民仍是程序占位。
- 旧浏览器测试加只在测试接口生效的 `entry=tabs`；检查普通入口的五处改为经过院子。F20 PARTIAL、ASTRA-SAVE-01、SOL-F20-HUD-01 维持原结论；真机、真人、远端 CI 未运行。

仅本地提交，未推送、未合并、未更新试玩站。没有读取或上传 SSH 私钥；提交经过本地密钥检查钩子。

## 2026-10-10 · 水产站 Runtime 逻辑交付（独立工作树、本地提交后停止）

维护者明确授权依据水产站契约/逻辑清单/产品决策实施。工作树 D:/bincov/hideout-runtime，分支 agent/hideout-runtime；从城中村 176ee1d 接入 main 43a342c 与已验收商店 ddba69f，正常本地同步提交 962dbdd、37c7581，双方历史保留。

- [交付入口](docs/hideout-runtime/README.md)：真实单会话、受控旧档升级、库存/购物/任务、设施/生产、真实训练、五秒自动保存候选保护、出击动画后启动桥接与真实结算后回站。
- [Opus 接线](docs/hideout-runtime/OPUS-WIRING.md)：原型新增位置训练、确认票据、重试/备份/导入、宿主切换协议；不新建 WebGL、不重复 beginRun。院子画面及表现仍交 Opus。
- [实际验证与 Sol 清单](docs/hideout-runtime/VALIDATION.md)：273 单测；新 Runtime 浏览器 8/8、存档9/9、商店21/21、城中村51/51、真实旧客户端5/5；原输入/移动/系统/UI/便携均通过。完整备份断言已按默认成长 v4 更新，首轮失败原因保留。
- 保持 F20 PARTIAL、ASTRA-SAVE-01 未确认和 SOL-F20-HUD-01；院子 20 轮宿主/素材/真机未签收。STATION-NEXT-01 仍为下一轮，不扩功能或制作素材。

本轮仅本地提交，未推送、未合并 PR、未发布。完成后停止，等待接线交接。以下双方历史不删改。

## 2026-10-09 · PR #22 Sol：F20 修复独立复验，本地提交后停止

从 `6e34e96` 原分支接手，Node24；末次 main `43a342c`、PR22 OPEN/未合并、远端头 `878f563`、Pages与main一致，未合入新增剧情文档。见[签收报告](docs/coast-sample-view/sol-f20-20261009/README.md)、[Opus/Astra遗留](docs/coast-sample-view/sol-f20-20261009/defects.md)。

- FE-01 PASS：W11/W12直接校验六表必需结构，59个损坏负对照拒绝；20重挂/停放及命名60轮四快照空槽均0，live不变。
- FE-02 Pixi链PASS，旧HUD全量条件PARTIAL：原定四快照HUD/native事件0；显式Host句柄12类owner保留/释放1→0，但放弃结果页另有Phaser mousePointer.event保留1棵HUD；无句柄新页也复现，原生返回基地后0。首失败与强路径保留，SOL-F20-HUD-01交Astra；未改前端方案。
- 正式严格60轮资源通过，总堆+358879.2/+620021.6/+794532.8 B仍PARTIAL。命名快照为独立辅助口径，剩余增长和上界未证均保留。
- 243单测、package、样板51/51、原桌面/移动输入、F14/F16、普通生命周期两尺寸4/4通过。六制品与6e34e96逐字节一致；ASTRA-SAVE-01未确认，真机/真人/原生内存未测。首轮测试误判、真实HUD失败和未运行项均保留。

仅测试工具和报告交接，本地提交后停止；不扩功能、素材，不推送/合并/发布。

## 2026-10-09 · PR #22 Opus：F20 前端两项（管理表空槽、停放事件引用），本地提交后停止

从 `5b09c05` 接手，工作区干净。PR #22 仍为 OPEN，远端头是 `878f563`；本轮只本地提交，不推送、不合并、不发布。详见[报告](docs/coast-sample-view/opus-f20-20261009/README.md)。

- **FE-01：** Pixi 8 释放资源后，在 GC 管理表里留下空槽，只有渲染期间攒满 10,000 个才会清理。停放渲染器时现在按 Pixi 自己的做法重建这些表，只保留存活项。实测基线有六张表在长（graphics、graphicsContext、glBuffer、glTexture、glGeometry、tilingSprite），修复后都是 0。依赖 Pixi 内部字段 `gc._managedResourceHashes`，字段变化时静默不做，由门禁 W11、W12 发现。
- **FE-02：** 样板不用 Pixi 的联邦事件，初始化后用公开接口 `setTargetElement(null)` 把事件系统摘下。不再保留原生事件和旧 HUD。原来事件系统写在画布上的 `touch-action: none` 和 `cursor: inherit` 改由 coast.css 保留，玩家看到的指针不变。
- **长循环：** 同口径严格 60 轮，第 16–20、36–40、56–60 轮的增长：基线 +375,750 / +689,792 / +939,563 B，修复后 +348,086 / +604,729 / +797,456 B。**F20 总堆仍为 PARTIAL**，剩余增长约 77% 是编译代码。
- **回归：** 243 项单测、样板 51/51、Sol 边界 7 项通过（F20 PARTIAL）、生命周期 2×4/4、音频 2×14/14、68 张截图、CI 同款 20/20。1920 真实输入机器人结果不稳定，基线上同样如此。没有读取或上传 SSH 私钥。

## 2026-10-09 · PR #22 Astra R7 F20 诊断，交 Opus / Sol 后停止

从 e209ed0 续作，原分支保留；末次只读核对 main 8355b85、PR22 OPEN/未合并、远端 head 878f563，无合并/推送/发布。[诊断与复验清单](docs/coast-sample-view/astra-r7-f20-20261009/README.md)、[真实验证](docs/coast-sample-view/astra-r7-f20-20261009/verification.json)。

严格正式包60循环全部释放计数通过，但6–10对56–60总堆仍增941,991.2 B，F20继续PARTIAL，不设容差。命名包引用链区分显式测试句柄、编译/浏览器条目及前端管理表增长；Graphics空槽144→1440、backing3096→49176 B，事件池稳定保留2棵已移除HUD，交Opus评估，未宣称无限泄漏。高潮20循环106格、11缓存键、退出归零通过，总堆仍增长。R7-L5确认沿用原玩法：高潮水下不可拾取，退潮仍需距离/通路/背包条件。

243单测、图算法2/2、潮位浏览器10/10及package通过；游戏源码、素材和六个生成物均未变。无新确认底层缺陷，ASTRA-SAVE-01及其他历史未确认结论保留；不扩功能。本地提交后停止等待交接。

## 2026-10-09 · PR #22 Sol 第七轮独立复验，本地提交后停止

从138e899续作，原分支docs/coast-2-5d-art-design，Node24，浏览器全部顺序执行。最新main8355b85已含于本分支，PR22 OPEN头878f563；Pages与main一致，不含R7。 [签收报告](docs/coast-sample-view/sol-r7-20261009/README.md)、[Opus/Astra清单](docs/coast-sample-view/sol-r7-20261009/defects.md)、[真实命令（已归档）](docs/IMPLEMENTATION-ARCHIVE.md)。

总体PARTIAL：242单测、样板首轮51/51、20套回归、68张截图0异常；四种结算正常/保存失败8/8，持续伤害6/6，潮水10/10，隐藏两模式正反对照，普通入口生命周期两尺寸4/4，资源20/20。F20结果页本轮+382,976 B，和历史/基地采样分开保留，未归因。A6第5次打击漏检确属120ms合并测试问题，修正后三次14/14及有声/静音真实敌人3+3对照通过；Opus历史安静起音仍未确认。首试夹具/旧像素工具/负对照/中止均保留，ASTRA-SAVE-01未确认。真机真人G12等待设备人员。运行源码、tests、素材与六项制品沿用138e899；只改测试工具及证据文档。未代改前端、未扩量、不推送/合并/发布。

## 2026-10-09 · PR #22 Opus 第七轮：R6 新接口接线与前端表现，本地提交后停止

从 `0494b61` 接手，工作区干净。PR #22 仍为 OPEN，远端头是 `878f563`；原 fork 没有写权限，本轮只本地提交，不推送、不合并、不发布。详见[第七轮报告](docs/coast-sample-view/opus-r7-20261009/README.md)。

- **结算原因：** 按 `settlement().reason` 决定落幕文字和画面，放弃显示「已放弃行动」。写入失败时，重试面板也写明是哪种结局。结算规则未改。
- **伤害来源：** 受击音、闪白、血雾和红色边缘只对 `blow` 生效，不论伤害大小。流血、污染、缺水、饱食不足在生命条下显示每秒掉血，屏幕边缘按来源着色；生命上限下降显示 3 秒。
- **命中归属：** 命中标记只看 `impact.owner === 'player'`。未揭示房间里的命中声和弹着声也不再播放。
- **涨潮：** 新增 `tide.ts`，只按 `frame.flooded` 画潮水、岸线浪花和渐变；有人站在水里时画水带，水下物品变暗；地图面板按淹没格着色。
- **验证：** 242 项单测；打包；样板 51/51（`0494b61` 包上 45/51，缺的正是新增或扩充的 6 项）；音频 3 次各 14/14；68 张截图；生命周期、跳转页、倒地探针、Runtime 差分；CI 同款 20/20。
- **保留的失败：** 1920 真实输入机器人有 2 次在开局交火中被打死，第 3 次撤离成功；Sol 第三轮旧探针在基线上同样失败；开发期间音频 A6 有 1 次间歇失败。
- **交接：** Sol 复验清单和 GPT 侧新需求（R7-L1～L5、R7-A1～A4）见报告第七、八节。没有读取或上传 SSH 私钥。

## 2026-10-09 · PR #22 Astra R6-L1～L5，交 Opus / Sol 后停止

从 3a4391c 接手；按用户明确授权将 main 8355b85 正常合入任务分支，本地同步提交 8ae7e29，双方历史交接均保留。授权不包含合并 PR。PR22 仍 OPEN、远端头 878f563，本轮不推送、不合并 PR、不发布。

[接口接线、兼容及 Sol 复验清单](docs/coast-sample-view/astra-r6-20261009/README.md)。新增结算 reason、hurt.cause、impact.owner、frame.flooded；测试摆位即时使用检查点 bodyFits。保留结算规则、旧档、事务原子性、行动 RNG/计时和单文件离线。前端只补服务类型，不改展示与素材；Opus 后续接线。射程仅评估，随机天气未实施。修正被新校验拦住的旧测试坐标，保留全部断言与失败证据。

实际验证：241单测、package、样板48/48、音频14/14、68张截图0异常、4×240帧完整状态差分、八套原入口/存档/输入/便携回归及10分钟真实计时均通过；首轮非法夹具失败及一次计时中断证据保留。F20 继续 PARTIAL；历史 ASTRA-SAVE-01 继续未确认。制品身份及未运行项见本轮报告；本地提交后停止等待交接。

## 2026-10-09 · PR #22 Sol R6独立验收（14abea3），本地交付后停止

[签收报告](docs/coast-sample-view/sol-r6-20261009/README.md)、[Opus/Astra问题清单](docs/coast-sample-view/sol-r6-20261009/defects.md)、[真实进程与未运行项（已归档）](docs/IMPLEMENTATION-ARCHIVE.md)。正式源码、原tests、运行素材与制品仍为14abea3，附SHA256/证据manifest。

- 总体PARTIAL：原48项首轮46/48（V07 Fx.live=6、V08等loot超时），顺序复跑48/48；233单测、package、20套回归、68截图0异常、三条件真实输入结算、两尺寸生命周期各4/4通过。失败及未运行项完整保留。
- R6-V2本机自动通过：音频3×14/14，原Phaser恢复旧/新对照及四种真实动作；E2死亡静音负对照仅该项失败，有界恢复调度通过。R6-V3两素材真实玩家完整倒地、尸体接手及已提交落幕不推进Runtime/滤镜清理通过；前轮OPUS-DEATH-02待排期为历史状态。
- 新缓存/落幕资源20/20；首试因战死后的低生命高污染而中断，保留失败，明确重跑使用基地健康恢复夹具。原严格F20仍PARTIAL（+368605B），基地完整/独立重复/普通对照也正增长；旧owner与Weather/SampleSound均0，未归因增长保留，各口径分开。
- R6-V4穿墙摆位→自动检查点校验拒绝、setItem0、原字节保留与坐标单变量反事实已确认；两包×两点各五次，并修正诊断面板范围后重跑。历史原始候选/栈缺失，ASTRA-SAVE-01继续未确认，不能以同面板关闭。
- R6-V5/G12等待真实设备与人员；R6-L/R6-A及素材扩量未开工。未改前端或玩法方案、未推送/合并/发布，本地提交后停止。

## 2026-10-09 · PR #22 Opus 第六轮补充：用户试玩反馈的两处修复

用户试玩 `0a5e3da` 后报告了两个问题，均已修复，仍只在本地提交。见[报告第 8 节](docs/coast-sample-view/opus-experience-20261009/README.md)。

- **物品名被截成「保...」：** 样板面板的格子比基地界面的小。桌面改用基地界面的 54 px；触屏和很矮的窗口里放不下的名称改用小号系统字体显示全名。
- **拖动时面板出现滚动条：** 影子是固定定位，却放在用 transform 居中的面板里，结果相对面板定位、跑到鼠标外，并撑大了面板。现在影子放在样板根节点下；面板关闭、重新打开或开始新的拖动时，都会主动移除残留的影子。
- **新增门禁：** U11 四种尺寸、U12 两种尺寸，在 `0a5e3da` 上 0/6，修复后 6/6。样板门禁共 48 项。

## 2026-10-09 · PR #22 Opus 第六轮：前端体验整改，交 GPT 侧后停止

在原分支从 `1c1c935` 接手，工作区干净；main 仍为 841e8bb，已在分支中；PR #22 OPEN，远端头 878f563。见[报告](docs/coast-sample-view/opus-experience-20261009/README.md)和[给 GPT 的任务清单](docs/coast-sample-view/opus-experience-20261009/gpt-tasks.md)。

- 分工按用户本轮指令：前端界面、渲染、交互、动画、声音接入由 Opus 负责；玩法逻辑、Runtime 接口、存档事务、图片生成和独立复验由 GPT 侧负责。本轮没有改 Runtime、规则、AI、存档协议或事务，也没有生成图片。
- 试玩入口不变：`城中村试玩.html`。默认有细雨，`城中村试玩.html?weather=clear` 关闭（跳转页现在会转发参数）；系统「减少动态效果」下没有雨和镜头后坐。
- 前端整改：
  - 地面和墙重新合成（去掉棋盘和雪花、大尺度磨损、墙脚接触阴影、水洼、抖动投影）；
  - 光照改为每张地图烘焙的光照图，房间灯轻微闪动；
  - 无状态的细雨、海雾、碎屑和水面反光；
  - 命中和击杀标记、镜头与准星后坐、枪口烟、换弹环、受击边缘和低血搏动、画面外射手提示；
  - 撤离指向标、搜刮时箱盖掀开、开门半开帧、每次进入淡入、短屏状态卡精简；
  - 结算后的落幕，玩家倒地完整播放（修复 OPUS-DEATH-02）。
- 声音：
  - 修复已登记缺陷「音频服务恢复期间静默丢弃提示音」（`src/audio.ts`，有界的恢复窗口）；原游戏从暂停菜单放弃时，死亡音也恢复了；
  - 左右声像和距离衰减，掠空声、撞墙声、空响、心跳、物品入包声，室内闷声；
  - 雨声底噪会盖住轻提示音，已撤掉。
- 测试：
  - 样板门禁 42 项（新增 V06、V06b、V07、V08、V09，在 `1c1c935` 上 0/5）；单测 233 项；
  - 音频测试 E2 改为按电平判断；
  - 截图脚本 window 场景改为合法位置。旧位置与墙重叠，是历史截图异常的根因，交 GPT 确认 ASTRA-SAVE-01。
- 实际验证见报告第 4 节。
- 未验证：真机、真人、远端 CI。
- 仅本地提交；未推送、合并或发布，没有扩展到全沿海。

## 2026-10-08 · PR #22 Sol 从 bf099cc 定向签收 OPUS-DEATH-01 后停止

原分支 `docs/coast-2-5d-art-design` 从 `bf099cc9a2f3aef86c7b45feea357d8ce940cbbb` 接手，初始干净。main 仍为841e8bb，PR #22 OPEN/远端头878f563；Pages等于main、不含本地样板。见[本轮签收报告与遗留状态](docs/coast-sample-view/sol-death-20261008/README.md)、[63份证据哈希（已归档）](docs/IMPLEMENTATION-ARCHIVE.md)。

- **OPUS-DEATH-01 敌人路径本机PASS**：Sol原真实死亡工具未改、exit0；正式样板36/36，两模式先倾倒后尸体、武器隐藏，隐藏房间变化0像素，epoch/原生楼梯/读档不重播。目视复核本轮8张死亡过程/隐藏/读档截图。
- Node24.19.0/pnpm11.19.0，224单测、package、原20套浏览器回归全部通过，68场景截图异常/页面错误/外部请求0。正式HTML SHA为6828628e…，所有制品与bf099cc逐字节相同；生产源码、原测试及运行素材不变。
- 生命周期普通入口1280/1920各4/4：三类启动失败清理重试、真实上下文丢失与原canvas恢复后继续暂停、持键保护、结算失败保留及重试后下一局通过。
- **玩家完整倒地不在本次签收范围**，OPUS-DEATH-02仍待排期；本轮未跑可选玩家探针。F20仍PARTIAL，本轮未重采样，前轮不同口径和未归因增长全部保留；ASTRA-SAVE-01仍UNCONFIRMED。
- 仅交付签收文档与证据，本地提交后停止；未扩量、未修改前端方案、未推送/合并/发布。真机、真人、十分钟自然计时、旧构建对照及当前本地提交远端CI未运行。

## 2026-10-08 · PR #22 Opus：样板声音接通，等待用户试玩

接 `717856d`。见[报告](docs/coast-sample-view/opus-audio-20261008/README.md)。

- 新增 `src/coast-view/sound.ts`，按原 RaidScene 的用法驱动已有的 SynthAudio：开枪、近战、受击（伤害 ≥ 1）、脚步（0.42 秒 / 0.25 秒）、拾取、换弹、开门、无线电，以及结算时的撤离或死亡提示音。音频跟随发布的阶段：暂停、失焦、上下文丢失时挂起，继续时重启。暂停面板补上「游戏音量」滑块，与原版共用同一个存档设置。
- 附带修复：流血和污染每帧发出的小额 hurt 不再触发受击音，也不再触发每帧白闪和血雾。
- 实测：`node scripts/coast-audio-test.mjs` 在输出端采样，不加自动播放参数，14/14；打包前另连续 3 次各 14/14；`717856d` 上为 1/14。229 单测、package（`4be14087…`）、样板 37/37、跳转页、全流程、Sol visual、生命周期两尺寸、9 套原回归均通过。真实窗口切换在 headless 下改用游戏监听的 blur 和 visibilitychange 事件代替，需真人确认。
- 交 GPT 侧（Astra 主责，Sol 回归）：SynthAudio 恢复期间提示音被静默丢弃，原游戏从暂停菜单放弃时死亡音也丢失（main 已复现）。样板目前用 150 ms 延迟变通。复现在工作标准的缺陷登记。
- 仅本地提交；未推送、合并或发布。

## 2026-10-08 · PR #22 Opus 第五轮：真人试玩整改，等待用户试玩

在原分支从 `05aaee6` 接手，工作区干净；main 仍为 841e8bb，已在分支中；PR #22 OPEN，头 878f563。见[报告](docs/coast-sample-view/opus-playtest-20261008/README.md)、[整改前后对比（已归档）](docs/IMPLEMENTATION-ARCHIVE.md)、[Sol 第二批图片规格](docs/coast-sample-view/opus-playtest-20261008/sol-art-requests.md)。

- 试玩入口：双击 `城中村试玩.html`，进入水产站，种子留空出击。出生点固定在已制作的城中村街口，撤离点含北线检查口。这只是挑种子，规则和存档不变；普通入口不变。
- 前端整改：
  - 地面物品改用物品图标；
  - 运行时袖管连接武器手套（玩家颜色取自 Sol 夹克）；
  - Sol 墙顶亮度 124 降到约 66；
  - 混凝土地面纹理；
  - 玩家淡描边；
  - 状态卡、武器卡和按键条加底板；
  - 搜刮和背包面板贴底停靠，镜头抬起玩家；
  - 修复撤离圆弧的多余线段。
- 验证：
  - 224 单测、package（HTML `fac0ad28…`）、样板 37/37（新增 V05，对旧构建失败）；
  - 跳转页 3 次无测试接口出击均落在城中村；
  - `coast-playtest.mjs` 真实键鼠全流程到结算页，种子留空、1280、1920 各 1 次；
  - 68 张截图、Sol visual、生命周期两尺寸 4/4；
  - browser、portable、ui、save-browser、desktop-input、mobile、mobile-ux、qol、loot 均通过；
  - 其余 11 套未运行。
- 待办：
  - Sol：P1 敌人身体，P2 持握武器，P3 尸体和南北向门窗，P4 地面；
  - Astra：ASTRA-SPAWN-01（正式出生点是否偏向已制作区域）、ASTRA-RANGE-01（射程超出画面纵向半高）、OPUS-DEATH-02；
  - F20 PARTIAL 和 ASTRA-SAVE-01 不变。
- 仅本地提交；不扩展全沿海，不推送、合并或发布。

## 2026-10-08 · PR #22 Opus 修 OPUS-DEATH-01，交 Sol 定向复验后停止

在原分支 `docs/coast-2-5d-art-design` 从 `81e1bd0` 接手，工作区干净；main 仍为 841e8bb，已包含在分支中；PR #22 OPEN，头 878f563。见[报告与 Sol 定向复验说明](docs/coast-sample-view/opus-death-20261008/README.md)。

- `scene.present` 在 `syncActor` 之前读取当前地图/epoch 的 `death` 事件。只有已站立画出、尚无尸体、本帧可见的演员才倾倒；其余直接换尸体。倾倒时脚底回滑，使倒地位置与尸体图对齐。Runtime、存档、素材均未改动。
- 新门禁 V03/V04（Sol/placeholder 两种模式）使用真实 `damageEnemy`：可见击杀倾倒、隐藏房间像素变化 0、揭示/楼梯/读档不重播。样板 36/36；用 `81e1bd0` 重建（与当时 dist 逐字节相同）运行为 0/4。Sol 原 `sol-round4-visual.mjs` 现为 exit 0。
- 224 单测、package（HTML `6828628e…`）、生命周期 1280/1920 各 4/4、test:browser、test:portable 通过。生命周期首次因执行器漏 `--import tsx` 以 exit 1 退出，已按原命令重跑并记录。
- 玩家自身死亡（真实敌人射击，探针非门禁）：倾倒开始，但结算在同帧提交，宿主进入 exiting 后停止呈现，只看到第一帧。登记为候选 OPUS-DEATH-02，待用户/维护者决定，本轮未改。
- OPUS-MEM-01 F20 PARTIAL、ASTRA-SAVE-01 UNCONFIRMED 不变。仅本地提交，未推送、合并、发布。

## 2026-10-08 · PR #22 Sol 从97c0b44复验，交回后停止

在原分支 `docs/coast-2-5d-art-design` 从 `97c0b44` 接手，初始干净；main仍为841e8bb，原PR #22 OPEN/头878f563，Pages逐字节等于main且不含本地样板。见[本轮真实报告](docs/coast-sample-view/sol-round4-20261008/README.md)、[归属清单](docs/coast-sample-view/sol-round4-20261008/defects.md)、[素材需求](docs/coast-sample-view/sol-round4-20261008/material-requirements.md)。

- qol-expansion原生E之后补lootContext/overlay状态等待，原26条assert保留；20次新浏览器连续通过，完整回归另过1次。224单测、package、样板32项、原20浏览器回归通过，正式生成物与97c0b44逐字节相同。
- 生命周期PASS：普通入口1280/1920各4/4，加强持续移动键、真实原canvas恢复后仍暂停断言；启动故障清理/重试、结算失败保留及成功后下一局通过。
- F20 PARTIAL：严格结果页+379,727.2B（exit1）；基地三次GC完整A/B+317,704.0/+332,122.4B，普通对照+328,469.6B。第6/20轮旧Runtime/Host/View等为0；页面池1、stage空/ticker停/canvas脱DOM、GPU纹理2、shader81→81。不同采样/GC/快照口径保留，self_size启发式和强路径不等于dominator或完整/有界归因。
- 背向持枪、15组镜像与短屏地图代表检查通过；**真实敌人倒地过渡FAIL**：syncActor先创建corpse，随后death事件无法启动deathT，0～0.2秒直接尸体，Sol/placeholder两路径独立复现，交Opus。无需下蹲或西向补图；43 PNG不变，未扩量。
- ASTRA-SAVE-01仍UNCONFIRMED。三类分类故障、普通样板外与驱动检查点、68截图无异常不等于历史已修复；原诊断保留。
- 未修改生产源码、前端方案、运行资产/manifest或正式HTML/ZIP；没有推送、合并、发布。本地提交完成后停止，等待Opus修展示与Astra继续增长/存档归因。

## 2026-10-08 · PR #22 第四轮后续：Astra 生命周期与定向诊断

从原分支 bcf7304 接手；main 841e8bb 已在分支，PR #22 远端仍为 fork 的 878f563。本轮按用户要求仅本地提交。详见[交接与 Sol 签收标准](docs/coast-sample-view/astra-lifecycle-20261008/README.md)。

- 确认并修复普通入口上下文丢失时 Esc 可恢复 invisible simulation、素材/视图/挂载失败后的 Runtime 所有权与资源残留；原画布恢复后仍需主动继续。
- 启动失败使用仅首帧前可调用的 services.cancelStart；原结算成功后才能 dispose 的约束保持。修复测试钩子保留旧 Runtime/Host，普通和测试入口堆快照旧实例均为零。
- ASTRA-SAVE-01 保持历史原因未确认：三类合成失败已分层记录，普通样板外三次保存与修正驱动 3/3 通过，不据此声称历史问题已修复。
- F20 生命周期通过，总堆仍 partial。Sol 原严格脚本 7 passed / 1 partial，增长 380,136 B；辅助完整循环 +312,234 B、普通对照 +318,313 B，采样口径分别保留。Performance 强路径仅支持部分归因，未证明全部差额有界。
- 验证：224 单测、样板 32/32、普通生命周期两尺寸各 4/4；browser/UI/desktop-input/mobile/mobile-ux/save-browser/portable 通过；打包重建 HTML 字节一致。真机、真人、远端 CI 和线上 Pages 未验证。
- 前端展示需求交 Opus；后续严格内存复验与历史存档诊断证据交 Sol。交接后停止；未扩量、未制作素材、未推送/合并/发布，未读取或上传 SSH 私钥。

## 2026-10-08 · PR #22 城中村样板第四轮：返修素材接入（Opus）

从原分支 `87b879b` 接手，工作区干净；main `841e8bb`、PR #22 远端头 `878f563` 均未变化，原 fork 无写权限，本轮提交只在本地。详见[第四轮说明](docs/coast-sample-view/round4/README.md)。

- **素材：** Sol 第二版 43 张按哈希/尺寸/锚点校验后正式接入，34 张替换，9 张不变（`scripts/coast-import-assets.mjs`）。
- **背向持枪：** 持枪按纵深缩短，背向时枪留在躯干轮廓内；新增 V02 像素检查（头顶以上 0 像素，全长阳性对照 12）。
- **镜像光照：** 实测确认保留镜像，不需要西向原画。
- **下蹲：** 现有动作不需要下蹲图；死亡过渡改为倒地倾斜，删除 idle 代下蹲。
- **短屏地图：** 解除 120px 高度限制，标注避让并按优先级舍去；新增 U10（三种尺寸）。
- **F20：** 整页复用一个 Pixi 渲染器，消除着色器名缓存增长（快照 81→81）；同时修掉复用后暴露的 Graphics 上下文残留。Sol 的严格总堆条件仍为 partial（+410,481 B），未签收。
- **验证：** 223 单测、打包（重建一致）、样板 32/32、20 项浏览器回归中 19 项与 layered-play 退出码 0、68 张截图 0 异常、Sol 遮挡 8/8 与可见性通过。`qol-expansion` 间歇失败，基线 `87b879b` 同样出现（本构建 5/10、基线 2/10），交 Sol。
- 未运行真机、真人试玩与远端 CI。未扩量、未推送、未合并或发布。没有读取或上传 SSH 私钥。

## 2026-10-08 · PR #22 Sol 第三轮复验与首批素材返修，交回后停止

在原分支从 `6a7e6b1` 接手，初始干净；最新main `841e8bb`、原PR #22远端头 `878f563` 未变。已读Opus [第三轮交接](docs/coast-sample-view/round3/README.md)，本轮使用Node24.19.0 / Corepack pnpm11.19.0。详见 [真实验收报告](docs/coast-sample-view/sol-round3-20261008/README.md)、[Opus/Astra问题清单](docs/coast-sample-view/sol-round3-20261008/defects.md)、[新版43 PNG manifest](docs/coast-sample-view/sol-round3-20261008/assets/manifest.json)。

223单测、打包/生成物一致、原20项浏览器回归、新版27项功能及返修PNG副本27项、修复商场三局均通过（首局600.427秒）。正式68＋返修68张截图，诊断异常0。V01四隐藏房间条件0像素差、阳性16；代表前墙/关门四淡化档两个版本各8项遮挡通过。更新格子选择器和布尔等待，保留写入/Console/拒绝/校验堆栈诊断。原存档历史根因未确认；修正的测试驱动跨2秒检查点3项通过。

F20受跟踪实例不累积、显式资源归零；总堆严格条件仍partial。最终30轮均值增长697,503B，shader名称字符串新增107,040B/20挂载（约5.35KB/次），与Pixi全局缓存定位一致；不改库或生命周期。首批43件中34返修/9原样；R08背向武器规则待Opus接入、R10下蹲帧与固定数量冲突待决定，R09镜像光照待最终偏好确认。新增短屏地图文字重叠问题交Opus。返修PNG尚未写入正式runtime资源，只在忽略验图副本测试。

未改`src/`、前端方案、正式资源或生成物；未扩量、推送、合并、发布。真机/真人/WebGL丢失与本地提交远端CI未运行。交付后停止，等待交回Opus/Astra；没有读取或上传SSH私钥，提交保留本地密钥检查。

## 2026-10-08 · PR #22 城中村样板第三轮：Sol 验收返修（Opus）

从原分支 `c836737` 接手，工作区干净；main `841e8bb`、PR #22 远端头 `878f563` 均未变化，原 fork 无写权限，本轮提交只在本地。详见[第三轮说明](docs/coast-sample-view/round3/README.md)。

- **前端补齐：** 背包与搜刮改为原库存格子（拖放预览、R 旋转、点选放置、拆分、安全箱互转），提交路径沿用 `transferLoot` 和 `SaveSession.mutate`；另补地图面板（楼层页签、撤离指引）、阅读面板和缺失的 HUD。
- **宿主问题：** 新检查发现两处并已修复：拖放后下一次点击会被吞掉；阅读面板会在同一帧被立即关掉。
- **素材：** 首批 43 张素材按 manifest 校验哈希后内联接入（+31 KB），`?art=placeholder` 可切回占位；返修项 ART-R01–R10 交 Sol，只针对这 43 张。
- **隐藏房间特效：** 粒子与贴花按所在区域的揭示状态绘制。V01 去掉屋顶后，在四种条件下逐像素比较，改变均为 0，阳性对照为正。
- **F20：** 定位为测试等待返回的 JSHandle、JIT 预热，以及 PixiJS 全局着色器名缓存（约 5 KB/次挂载，库内行为，交维护者决定）；回归脚本断言宿主、Runtime、Pixi 及纹理实例不跨局累积。
- **测试驱动：** `?test=1` 驱动造出的非法弹匣和击杀数会触发与 ASTRA-SAVE-01 相同的面板，已修正驱动；历史异常的根因仍未确认，交 Astra。

验证：223/223 单测；打包通过，重新构建逐字节一致；样板接线 27/27；F20 30 轮回归通过；原 12 套浏览器回归全部通过；四种尺寸 68 张截图，0 异常。另有 8 张素材对比裁图和本机测量。未运行：layered-play（已知脚本问题）、Sol 的边界脚本（选择器待 Sol 更新）。截图约 24 MB。

未做：真机与真人试玩、WebGL 上下文丢失、全沿海外观、素材扩量；没有推送、合并或发布。提交保留本地密钥检查，没有读取或上传 SSH 私钥。

## 2026-10-08 · PR #22 Sol 工程验证与首批素材，交回 Opus 后停止

从原分支 `docs/coast-2-5d-art-design` 的 `cdfc965` 接手，初始工作区干净；最新 main `841e8bb` 已包含，PR #22 远端原 fork 仍为文档提交 `878f563`。Pages 逐字节等于当前 main，尚不含本地 Runtime 样板；验收请用本地 HTML 加 `?sample=village`。详见 [Sol 验收报告](docs/coast-sample-view/sol-acceptance-20261008/README.md)、[Astra/Opus 归属清单](docs/coast-sample-view/sol-acceptance-20261008/defects.md) 和 [43 PNG manifest](docs/coast-sample-view/sol-acceptance-20261008/assets/manifest.json)。

实际完成：223/223 单测、打包/生成物一致、样板接线17/17、原20项浏览器回归全部通过；五轮截图240张，存档异常/页面错误/外部请求均0。历史偶发存档面板未复现，根因未查明；补了真实写入、Console与拒绝事件诊断，交 Astra 承接，不能记作已修复。修复既有商场脚本误点HUD的问题，原生命中画布后才点击，保留三局和600秒实时时长断言，重跑首局600.406秒且三局通过。

A01边界包含旧档、原生目标/轮换、事务故障、失焦/后台、换层刷新、DPR和离线ZIP。完整20次循环每轮资源计数归零，但多轮强制GC后堆仍有约0.85–0.91MiB中后段增长，F20内存条件未签收；最终脚本对此返回partial/退出1。隐藏尸体会创建血迹贴花，当前屋顶下实际像素差分为0，登记为Opus防御边界风险而非已确认泄露。前端数量/格位/地图/阅读、素材接入及人工画面签收等待Opus；真机与真人G12未运行。

只制作player25帧、墙体11部件、地面6块、carbine1件，共43张1×PNG，机械规格校验通过。未改`src/`、未扩量、未合并/发布；全部存于原分支本地提交，停在交接状态。没有读取或上传SSH私钥，提交保留本地密钥检查。

## 2026-10-08 · PR #22 城中村可玩样板：Pixi 画面接入真实 Runtime（Opus）

用户要求续作原分支、用真实 Runtime 替换原型 Mock、接好原会话/存档/事务，只做城中村及二楼、地下层，沿用占位素材，交付后停止。开工时 main 为 `841e8bb`（#25），已正常合并进任务分支（`a829e9d`），handoff 冲突按日期保留双方。PR #22 远端头仍为 `878f563`，原 fork 无写权限，本轮提交仅在本地。

新增 `src/coast-view/`：PixiJS 8.22.0（MIT，经现有 esbuild 打进同一离线 HTML，+0.53 MB）、宿主、输入、外观表与程序占位素材。显式 `?sample=village` 时，居民楼行动的出击与恢复改挂样板宿主，RaidScene 不启动、Phaser 循环休眠；不带参数时原游戏不变。所有物品与保存操作走 Runtime 事务服务；结算提交后才卸载并交回原结算页。Runtime 规则与协议未改，仅抽出宿主包装并加 `?test=1` 测试宿主。详见[样板接入说明](docs/COAST-SAMPLE-VIEW.md)与[给 Sol 的验收清单](docs/coast-sample-view/SOL-ACCEPTANCE.md)。

实际运行：`pnpm test` 223 项、`pnpm package`、样板接线 17/17、四尺寸 48 张截图与本机测量；原浏览器回归结果登记在 [verification.json](docs/coast-sample-view/verification.json)。背包/搜刮为简化列表、地图与阅读面板未做；一次截图运行中出现过未复现的保存失败面板，已登记待 Sol 复测。未推送、未开 PR、未合并或发布，等待用户确认画面与交接。

## 2026-10-08 · PR #22 城中村真实样板 Runtime，等待 Opus 接线

维护者在 A01 评估与 Opus v1 清单之后明确授权逻辑源码实现。续作原分支，合入最新 main `f144147`，基线合并提交 `002435e`，保留双方历史。纯数据 Runtime 复用既有 SaveSession、世界/库存/RPG/追击规则，提供 v1 发布、真实地图与揭示、连续输入、旁路战斗事件、原子事务、终局重试以及不暴露内部状态的宿主入口。普通游戏仍走原 RaidScene，作为兼容入口和新旧差分基线；不把逻辑交付标为新画面已接入。

223项单元（新增26项）、打包、无渲染依赖模块与960帧精确状态差分通过；原游戏桌面、存档、输入、移动、建筑和10分钟真实计时回归通过。长时多层、便携、UI及全部证据以[本轮交接说明](docs/COAST-RUNTIME-SAMPLE.md)和[回归登记](docs/coast-runtime-sample/verification.json)为准。新 Pixi 画面、W01–W14 真 Runtime 重跑、四尺寸与资源往返由 Opus/Sol 接线后验证，未冒用原型 Mock 结果。

交付前 main 与 PR #22 远端头仍为 `f144147` / `878f563`。连接器对 `LMX-323/escape-bincov` 返回 `push:false`；依仓库规则保留原分支本地提交和移交文件，远端PR未更新，不另开同目标PR。无素材制作、无全沿海视觉扩展、无CI新提交、无合并或发布。到此等待交接与维护者下一条指令。
## 2026-10-09 · fix/shop-drag：Sol 修正测试时序并正式集成触屏补验

从原分支31a0aef续作，main仍43a342c，无同目标PR。[本轮报告](docs/shop-drag-fix/stability-20261009/README.md)、[签收与遗留](docs/shop-drag-fix/stability-20261009/issues.md)。

- QOL确认E输入排队与立即读取的竞争，等待loot面板就绪后保留原精确容器断言。systems确认活动朝向/跟随相机与reload退出前重存的跨时刻采样；原生Esc暂停后同一调用采集checkpoint/live/durable，保留完整player深比较并新增2项保护。
- 两家商店的6项触屏四向取消及混合买卖回滚纳入正式test:shop-drag，总21项，原15项保留，CI同一input步骤自动执行。产品、存档、规则、依赖、CI配置和生成物未改。
- Node24.19.0，197项单测、打包通过且产物一致。修后QOL正常5+CPU4主页面5、systems正常3+CPU4主页面2共15次定向通过；完整原20套+shop共21套通过。错误目标、+0.1朝向负对照仍在原断言失败；main旧包11/21检出旧拖放问题。
- 首败、诊断假设失败、首个负对照指针位置错误及最初共用JSON归档限制均如实保留。历史31a0aef报告不改写。真人真鼠标、实际切窗、真手机仍NOT RUN，完整商店验收PARTIAL；Astra三点规则观察仍待取舍，无新增已确认产品缺陷交回。
- 仅本地提交后停止，未推送、未开PR、未更新试玩站或Pages、未合并或发布。

## 2026-10-09 · fix/shop-drag：Sol 独立复验，本地提交后停止

在原工作树、原分支核对 4fc3023（main 43a342c）。[验收报告](docs/shop-drag-fix/sol-20261009/README.md)、[遗留归属](docs/shop-drag-fix/sol-20261009/issues.md)、[运行索引](docs/shop-drag-fix/sol-20261009/run-index.json)。

- 商店自动化签收：1280/1920 各15/15，两家商店触屏四向点选与混合买卖回滚补验6/6；同一新测试跑main两次5/15，检出旧拖放问题。真人真鼠标、实际切窗和真手机仍NOT RUN，完整验收PARTIAL。
- Node24.19.0 / pnpm11.19.0 / Chrome154，单测197/197，打包通过且五份正式产物与4fc3023逐字节一致。本次不修改产品、正式测试、依赖或CI。
- 20套完整顺序回归19通过1失败：systems露台刷新朝向深比较首败，读档状态与durable raw一致；有限对照main/修复包各3次通过，仍保留间歇失败及未归因。QOL首轮通过，有限对照main1/3失败、修复包2/3失败，同为空lootContext.containerId；基线已复现，交测试时序排查。
- 原desktop-input的一次主动流程中止标ABORTED并留日志；事后时间戳确认实际无浏览器重叠，完整顺序批次已重跑。Astra三点交易规则观察保留，不代改。
- 仅本地提交，未推送、未开PR、未合并、未更新试玩站或Pages；停止等待后续安排。

## 2026-10-09 · fix/shop-drag：基地商店拖放修复（Opus），本地提交后停止

从最新 main `43a342c` 建独立分支 `fix/shop-drag`，不混入 PR #22；本地提交，未推送、未开 PR，在线试玩站未更新。详见[修复说明](docs/SHOP-DRAG-FIX.md)。

- **复现：** main 包和用户的试玩包（`6e34e96`）上，修理铺、卫生所的鼠标拖放都无效，也没有提示。
- **原因：** 商店仍走浏览器原生拖放，而 `030fa74` 加入的 CSS 和两处全局重置让它失效。
- **修复：** 商店改用背包已有的指针拖动；删除原生拖放路径；商店拖动中 R 不旋转；拖放失效时给出提示。只改 `src/ui.ts`，交易、存档、价格和规则都没动；触屏仍是点选放置。
- **回归：** 新增 `pnpm test:shop-drag`（15 项：买入、卖出、拖回取消、拒绝提示、失焦/Esc/R、点选放置、结算写入失败后重试、触屏），已加入 CI 的 input 组。本分支 15/15，旧构建 5/15。
- **其余验证：** 197 项单测、打包；CI 同款 20 套中 18 套首跑通过，`expansion` 补上旧客户端文件后通过，`qol-expansion` 为基线即有的间歇失败。
- **交接：** Sol 独立复验清单、交给 Astra 的三点规则侧观察，见修复说明第六、七节。没有读取或上传 SSH 私钥。

## 2026-10-10 · 《等海退去》文学去模板化精修

创作者批准样章文风后，按统一标准对主线文学正文 [《等海退去》](docs/MAIN-STORY.md) 进行全文文学润色与去模板化修订。基线为最新上游 main `43a342ce434c101e4b7058a54f6f29ede9482223`（PR #29 已合并）；核对开放 PR 状态，PR #30、PR #28、PR #22 均保持原职责与归属。本轮使用独立任务分支 `docs/story-literary-polish`。

本次只修改文学正文及交接记录，未修改游戏代码、数值、存档或发布制品。保留第二人称、六阶段十八节点、三结局、远汐号与七号区分、实验室放大机制、老蔡经历与位置等全部已批准设定；既定游戏引用（维修单、市场告示、观测站记录、港口笔记、电台三句及 03:17 怀表等）逐项保护。全篇剔除旁白越位总结、去除了人物对白背诵设定的倾向，打破单一节拍，强化沿海生活质感与机械经验。

本地检查通过：`git diff --check` 无空白异常，相对链接有效。本轮交付供创作者审阅，不自行合并或部署。

## 2026-10-09 · 《等海退去》剧情转化内容规格

用户明确要求实施本会话确认的工作方案，本轮范围为三份内容规格：总方案、全篇事件与线索登记、市场与回站样板。技术基线为 main `8355b857736df7fe471301d61208c25e2b7f9d61`；剧情输入为 PR #29 `c940128`。开工核对 #29 最新 `48d7fa5` 只更新批准状态，文学正文未变，PR 仍开放；#22、#28 也仍开放，无同目标内容规格承接。因此建立独立任务分支 `docs/story-adaptation`，不改文学稿与美术方向 PR 的职责。

交付 [总方案](docs/NARRATIVE-ADAPTATION-PLAN.md)、[十八事件与线索登记](docs/story/CONTENT-REGISTER.md)、[市场样板](docs/story/CH01-MARKET-SLICE.md)。内容含十二地区、十四人物的知情与诉求、十五项线索回收、三个结局的条件编写边界；市场样板含格坐标两路线及返站通路、八个叙事锚点、十八个对白节点、固定补给六组算例、状态／事务／旧档处理与三十项未来运行验收。repair 的物品、需求、¥420奖励和¥600扩建规则保留；明确“同60份预算”不代表经济平衡已验证。工具柜补给按真实缺额生成，同run不补货，旧repair不补造闸位或喊声。

本地 Windows、Node 24.19.0 实际进行六份相关文档的相对链接与锚点、表格／围栏、ID／前置引用、字段完整性与源码常量核对；六组补给算例、一百种种子的可预留投放槽、两潮位三出生点到任务与三出口的可达性、三十四段路线检查通过。共同起点的正面路线26.41格、后勤39格；南侧出生时后勤可能更短，已在规格明确，不把设计风险描述冒充必发生的交战。检查脚本与JSON报告保存在忽略的 `test-results/story-doc-validation.*`，属于文档与当前源码几何核对，不是新剧情运行测试。Git差异与生成物范围核对以本轮最终检查为准。

主工作区原有未提交 handoff、商场文档和进度文件完整保留；使用仓库内隔离工作树。终端 `git fetch` 因网络不可达失败，改用认证GitHub只读接口核对并获取真实Git对象，未把失败fetch记成通过。开工主线为8355b85；交付前#29合并，已同步最新main `43a342ce434c101e4b7058a54f6f29ede9482223`，逐项校验新增文件blob、tree与commit哈希及完整父历史，保留主线上新合入的文学稿、导航、任务和交接记录。纯内容文档未运行pnpm test、pnpm package、浏览器或真人测试，无新增实现截图、素材或发布包。后续代码接入仍排在#22后，工厂联系及其余章节逐批细化；未来版本5迁移与地图身份只为规格，未实际修改存档。

已通过认证GitHub连接器提交 [PR #30](https://github.com/xuys2025/escape-bincov/pull/30)。初始远端提交 `076c62d1826ca9ffd882cb635d07ddd777d8d1c6` 与本地 `80b6e7c89f90bd46947ccf58e3c90163e62af7ef` 的完整文件树同为 `acd31d45c5d1a2493deb3f71823227b3c5682acf`；随后仅补记任务归属及交付记录。最终本地核对160个本地链接／锚点、十八节点无环和十五线索登记通过；PR自动CI以[检查页](https://github.com/xuys2025/escape-bincov/pull/30/checks)为准，不将提交表述为合并或上线。

## 2026-10-09 · 潮水、内陆区域与长线主线设计

维护者明确要求落实本次世界观与地图规划。基线为最新上游 main `841e8bbdfb070eada82537563dd1ab1b4801aea3`；已核对任务清单与开放 PR，只有美术方向 #22，无同目标承接。本轮在独立分支 `docs/world-regions-story`、仓库内隔离工作树编写 [世界观与地图主线](docs/WORLD-REGIONS-STORY.md)，同步 README 导航与任务归属。原工作区的未提交 handoff、商场文档和进度文件保留，未纳入本次提交。

设定包含潮水物理隔绝县城、盐度与主动受盐宗教、一据点十二出击区域（七内陆／三沿海陆地／二海运）、五方势力及地方组织、六阶段十八主线节点和逃离／封潮／留守结局。新增县医院、拾荒者掌控的医院旧址、工厂区与隐秘实验室，内陆危险以隔离、废楼、路障、盐尘和人类冲突为主。远汐号与第七艘船分开；异常链串联打捞、运输、试验、旧病例与灯塔，不把实验室设成潮水唯一源头。

当前 main 已含街区、商场和 RPG，文档明确沿用，不称其为尚未实现。十二区域扩展、盐度替换、主线任务接入和结局仍未实现；本轮不改代码、API、存档、素材、版本、HTML、ZIP、发布清单或部署。纯设计文档不运行游戏测试与打包，后续实施需另外明确范围并审阅存档兼容。

本地 Windows / Node 24.19.0 实际检查通过：四文件围栏与新增导航、六个文档相对链接、四张表格共 34 行列数、十二区域的 7／3／2 分类、六阶段与三结局、所需区域及术语覆盖；`git diff --check` 通过。源码核对确认原任务、污染文案和已有区域选择仍保留。本轮游戏测试、浏览器截图与打包未运行；PR 的自动 CI 单独以检查页为准。

已通过认证 GitHub 连接器提交 [PR #27](https://github.com/xuys2025/escape-bincov/pull/27)。初始远端提交 `c1af0ff1fb287349f50afc3c0d9a10052aec9667` 与本地提交 `2c87f8bf02a07a32a1e89682850b348d30a2ec5e` 的完整文件树均为 `9c1bde7d6c217183abddbf218af07636f230df88`；随后仅补记 PR 归属与交付记录。最终 CI 状态见 [PR 检查页](https://github.com/xuys2025/escape-bincov/pull/27/checks)，不将 PR 已提交表述为已合并或已上线。

### 2026-10-09 · 世界观文稿后续：文学性重写草稿

#27 已按维护者授权合入 main，合并提交 `8355b857736df7fe471301d61208c25e2b7f9d61`。维护者随后要求新开 PR，由其稍后交给 Opus 5.5 重写故事，改善现有设定文本的文学性。本轮从该 main 建立独立分支 `docs/story-literary-rewrite` 和隔离工作树，新增 [写作交接](docs/STORY-LITERARY-REWRITE.md)，同步任务归属与 #27 合并状态；原故事正文留给后续作者续写。

本轮仅准备草稿，不修改故事正文、源码、素材、存档或发布包。后续在同一草稿 PR 提交叙事重写，说明设定取舍并由维护者审阅文学效果。相关功能实施仍在 #22 完成后安排；#26 的医院与盐度等缺项继续开放跟踪。现有 #22/#28 的工作区和未提交内容保留。

本轮验证范围为新增文档链接、登记事实、Markdown 结构及 Git 空白检查；本地游戏测试和打包不适用。远端 CI 状态以草稿 PR 检查页为准，不把建立草稿表述为完成重写或可以合并。

### 2026-10-09 · 故事文学性重写获批并合并

创作者批准了第二轮修订后的《等海退去》，维护者授权合并 #29。合并前核对：PR 头 `c940128` 的完整 CI 通过，远端 main 仍为 `8355b85`，分支可干净合并，GitHub 上没有未解决的讨论。

本提交只把故事文稿、设定索引第 6 节、README 导航、任务清单和写作交接里的“待审”状态改为已批准，正文没有改动。随后转 Ready，以合并提交方式合入 main；合并 SHA 和 main 的 CI、Pages 结果以 GitHub 记录为准。文稿里的人物和事件仍未接入游戏，接入排在 #22 之后，#26 继续开放。

### 2026-10-09 · 故事文学性重写第二轮（按六项取舍意见）

LMX-323 在 [#29](https://github.com/xuys2025/escape-bincov/pull/29#issuecomment-6073343679) 回复了初稿列出的六项取舍。开工时 PR 头为 `9ee8be1`，远端 main 仍为 `8355b85`，上一轮 CI 已通过，工作树干净；继续在原分支修订。

许医生的经历、三十多年前的病例和撤离名单原样保留。人物去向不再固定：第六章写明车上的人是逐项换来的；逃离结局改为孔主任把铁盒交给玩家、自己留下，老栓送完车队后掉头回县；设定索引第 6 节改为示例表。水路一段补上了跟船的异变生物，以及潮水对盐度和神智的影响；“神智”只作叙事，是否设独立数值仍按 #26 待定。老蔡的位置定在灯塔岬角地图的角落，文稿中是宿舍楼走廊尽头，封潮结局里会经过他。[写作交接](docs/STORY-LITERARY-REWRITE.md)的取舍表补上了审阅意见和处理方式。

本轮仍然只改文档。六份相关文档共 154 个本地链接有效，表格列数和代码围栏正确，`git diff --check` 通过；游戏测试与打包不适用。整体文学效果仍待审阅，草稿 PR 不转 Ready。

### 2026-10-09 · 故事文学性重写初稿（Opus 5.5）

维护者把 #29 交给 Opus 5.5 续作。开工时远端 main 仍为 `8355b857736df7fe471301d61208c25e2b7f9d61`，PR 头为 `45f14bc`，工作树干净；在原分支 `docs/story-literary-rewrite` 继续，未新开 PR。

新增 [《等海退去》](docs/MAIN-STORY.md)：第二人称，序章、六章与三个结局，依次写到十八个主线节点。五方势力和三个地方组织由具体人物承担选择，现有维修单、告示、记录、值班笔记、任务电台和 03:17 怀表进入故事；“七号”改为不入泊位的秘密驳运船，不再依赖超自然摆渡船。[设定文档](docs/WORLD-REGIONS-STORY.md)新增第 6 节汇总人物与情节，[写作交接](docs/STORY-LITERARY-REWRITE.md)写明保留、深化、需审阅的取舍及校对结果；README 导航与任务清单同步。

本轮只改文档，不改源码、任务、物品、数值、存档、素材或发布包；文稿中的人物和事件均未实现，#26 未决建议未写入。本地检查：六份相关文档 153 个本地链接有效，表格列数与代码围栏正确，`git diff --check` 通过；人名、地名与 `domain.ts`、`world.ts`、`mall-world.ts` 核对一致。游戏测试与打包不适用。文学效果与设定取舍等待维护者审阅，草稿 PR 不转 Ready。

## 2026-10-07 · CI 单次构建与四组并行检查

维护者明确要求立即执行 CI 优化。实时主线 `f14414718f6dd2b9b8d9144b40134b51fcbc8cc9`（#23 已合并），工作区干净；开放 PR 中无同目标，独立承接分支 `ci/parallel-browser-checks`。本轮只改 CI 与交付文档。

单元与打包执行一次，显式上传两份 HTML、两份 ZIP、发布清单及校验文件；浏览器按 visual / inventory / world / input 分四个独立 runner，共享本次构建并逐文件核验。原 20 项完整检查、断言及循环全部保留；旧客户端只由 inventory 获取。附件按组命名，诊断保留 14 天、构建保留 1 天。没有按路径跳过检查、裁剪诊断或修改游戏/存档。

`Build and test` 保留为 always 汇总门禁，构建及全部矩阵成员必须成功，失败/取消/跳过拒绝；`Deploy Pages` 仍仅在 main 门禁成功后发布同一份校验制品。现有服务器公开 Pages 镜像依赖的检查名不变，无需上传或修改服务器文件。

本地 Node 24.19.0 / pnpm 11.19.0：197 项单元测试通过，打包通过且全部 HTML/ZIP/manifest 无差异；官方 actionlint 1.7.12 通过。仓库外验证脚本确认 20 项恰好各执行一次、四组分别 5/7/4/4 项；16 种构建/浏览器结果组合仅双成功放行；显式制品 ZIP 往返哈希一致、篡改被拒；直接调用现有镜像 `verify_run` 原函数验证新 job 列表兼容及失败门禁拒绝（未运行 Linux 文件锁/激活流程）。提交和推送保留本地密钥检查钩子，不读取或上传 SSH 私钥。

精确提交的 Linux 四组实际运行、总时长及附件结果以本 PR 的 GitHub Actions 为准；等待完整 CI 后交付，不自行合并或上线。

## 2026-10-07 · 沿海地图 2.5D 视角与像素材质（仅文档）

维护者确认 A 方案“俯视方格地面＋可见立面”、仅当前沿海地图及其关联室内、低饱和灰褐废土；授权实施的范围只有文档。基线为 main `425f32013bd04da668ca5924f25fa2fef926b2c9`，任务分支 `docs/coast-2-5d-art-design`。开始时没有开放 PR；本次为独立设计交付，不续作已合并的主菜单 #21 或扩大既有商场/RPG任务。

新增 [沿海地图美术设计](docs/COAST-2_5D-ART-DESIGN.md)，明确地面坐标、立面、八方向直立人物、连续瞄准、脚底排序、屋顶与前墙遮挡；列出像素尺寸、13 色基础色板、9 类材质、共用及五个区域的素材清单。提供 4×4／3×3／2×2 拼板规范、三套中文生成提示词与局部返修模板、Alpha/切分/像素整理和资产追溯流程。基线已存在门窗、楼层、屋顶与 PNG 内联能力，本轮只定义视觉衔接，不把这些记作待开发玩法。

README 文档导航和统一任务清单同步。沿海的地形/实体/门窗/房间揭示语义、存档坐标和战斗 RNG 保持约束；商场、基地、库存 UI 与主菜单不在重绘范围。未来 6 项素材和 12 项游戏验收全部待实现，文档完成不表示游戏改造已验收。

本轮未调用图像生成、未消耗绘图额度，未修改代码、素材、存档、版本号、HTML、ZIP 或发布清单；未运行游戏测试或打包，原因是纯设计文档。原工作区的 handoff.md 改动及未跟踪文件保留；通过独立工作树编写，未覆盖或纳入本次提交。已完成新文档及新增导航的相对链接、9 张表格共 99 行的列数、18 个未来验收编号、13 色色板、尺寸算术、7 项源码事实和空白检查。

上游无写权限，已通过 fork `LMX-323/escape-bincov:docs/coast-2-5d-art-design` 提交 [PR #22](https://github.com/xuys2025/escape-bincov/pull/22)。初次远端提交为 `fdf35bef03213e2882bc82fbd03ac26fd540241f`，完整文件树 `cfdfa3c4c7316a95933bffa9e0f7ac32062046a1` 与本地验收内容一致；后续仅补记任务归属和交付。自动 CI 以 [PR 检查页](https://github.com/xuys2025/escape-bincov/pull/22/checks)对应最新提交为准，不将历史测试当作新图像验收；未自行合并或部署。

## 2026-10-07 · PR #23 存档冲突测试时序修复（Refs #24）

直接续作原 `feat/title-pixel-grid`，接手头 `6d6cefe`，已接受 main `425f320`。按维护者本轮“让 PR23 测试变绿”要求，只在既有测试接口中暂停第一窗口场景，保留打开的搜刮上下文；真实第二窗口写入并触发冲突后恢复。全部原断言保留，新增暂停、上下文与计时前置检查。未改存档、游戏或主界面源码，Issue #24 的写入竞态仍保持开放。

本地双方 4 倍 CPU 降速：修复前 1/1 在存档字节断言失败；修复后完整桌面流程连续 5/5 通过。Node24/pnpm11.19 下，197 项单元、打包、44 项搜刮和 9 项存档浏览器检查通过；生成物无差异，临时脚本不提交。详见 [验证与复现记录](docs/LOOT-CONFLICT-TEST-FIX.md)。代码和文档一次推送原 PR，完整 CI 以本次提交检查为准；不合并或部署，PR 继续草稿等待美术验收。

## 2026-10-07 · v7 续：接入 Codex 重绘的电台、步枪与字标（PR #23）

用户转交 Codex 按 `Codex绘图需求.md` 生成的三张图。电台和步枪按母版坐标贴到 desk 源层，再走同一套网格和色板，替代上一版的电台去噪与电表手绘。字标按 144×72 原尺寸取用，并左对齐到菜单列。源图、提示词与校验记录保存在 `assets/title/sources/refine-v5/`。

197 项单元测试、资产校验、打包、`title-review`、`title-water-review`、`browser-test`、`mobile-test`、`portable-test` 均通过；截图已更新。剩余：步枪枪管冷色高光偏蓝，效果精灵仍按逻辑像素绘制，整体美术待用户验收。

## 2026-10-07 · v7 主菜单统一像素网格与共享色板（新 PR，承接已合并的 #21）

用户认为 #21 的画面精美但“AI 味”重。实测运行图层是生成插画直接缩放的结果：room 层 58,391 色，95% 的横向色块只有 1 像素宽，各图层缩放比例也不一致。用户先否决了从零程序重绘的对比稿（不够精美），认可了“保留母版、真像素化、关键处手绘”的混合方案。

本轮只改派生过程，母版与 Codex 分层源图不改：全局 640×360 网格，67 色共享色板（`assets/title/palette.json`），清理孤立像素，手绘替换人像海报（改为潮汐表）、伪文字纸片（改为封锁日历）、电表。网格图层每个逻辑像素存 2 个纹素，坐标、视差和锚点不变；水面改为按逻辑尺寸读取船体像素。PNG 改为索引色，单文件 HTML 从 6.73MB 降到 2.31MB。

验证：197 项单元测试（新增网格与色板约束），打包，`title-review`、`title-water-review`、`browser-test`、`portable-test`、`mobile-test` 全部通过；1280×720、1920×1080、390×844 实际截图见 [docs/title-pixel-grid](docs/title-pixel-grid/README.md)。剩余：效果精灵仍按逻辑像素绘制，电台旋钮和步枪未手绘，字标风格待定，整体美术待用户验收。工作区中他人未提交的 `*-padded.png` 和补边脚本未纳入。

## 2026-10-07 · 沿海地图 2.5D 视角与像素材质（仅文档）

维护者确认 A 方案“俯视方格地面＋可见立面”、仅当前沿海地图及其关联室内、低饱和灰褐废土；授权实施的范围只有文档。基线为 main `425f32013bd04da668ca5924f25fa2fef926b2c9`，任务分支 `docs/coast-2-5d-art-design`。开始时没有开放 PR；本次为独立设计交付，不续作已合并的主菜单 #21 或扩大既有商场/RPG任务。

新增 [沿海地图美术设计](docs/COAST-2_5D-ART-DESIGN.md)，明确地面坐标、立面、八方向直立人物、连续瞄准、脚底排序、屋顶与前墙遮挡；列出像素尺寸、13 色基础色板、9 类材质、共用及五个区域的素材清单。提供 4×4／3×3／2×2 拼板规范、三套中文生成提示词与局部返修模板、Alpha/切分/像素整理和资产追溯流程。基线已存在门窗、楼层、屋顶与 PNG 内联能力，本轮只定义视觉衔接，不把这些记作待开发玩法。

README 文档导航和统一任务清单同步。沿海的地形/实体/门窗/房间揭示语义、存档坐标和战斗 RNG 保持约束；商场、基地、库存 UI 与主菜单不在重绘范围。未来 6 项素材和 12 项游戏验收全部待实现，文档完成不表示游戏改造已验收。

本轮未调用图像生成、未消耗绘图额度，未修改代码、素材、存档、版本号、HTML、ZIP 或发布清单；未运行游戏测试或打包，原因是纯设计文档。原工作区的 handoff.md 改动及未跟踪文件保留；通过独立工作树编写，未覆盖或纳入本次提交。已完成新文档及新增导航的相对链接、9 张表格共 99 行的列数、18 个未来验收编号、13 色色板、尺寸算术、7 项源码事实和空白检查。

上游无写权限，已通过 fork `LMX-323/escape-bincov:docs/coast-2-5d-art-design` 提交 [PR #22](https://github.com/xuys2025/escape-bincov/pull/22)。初次远端提交为 `fdf35bef03213e2882bc82fbd03ac26fd540241f`，完整文件树 `cfdfa3c4c7316a95933bffa9e0f7ac32062046a1` 与本地验收内容一致；后续仅补记任务归属和交付。自动 CI 以 [PR 检查页](https://github.com/xuys2025/escape-bincov/pull/22/checks)对应最新提交为准，不将历史测试当作新图像验收；未自行合并或部署。

## 2026-10-07 · v6 修复移动时的糊边，继续草稿 PR #21

用户确认 v5 已不再卡顿，新增反馈明确为物体边缘发糊、像叠了两层。原因是直接对原始纹理线性采样，再把 960×540 画布放大，混色边缘被一起放大。本轮只改采样：主菜单渲染表面按显示尺寸增加，最高 1080p；八类移动图层的原像素最近邻复制 2 倍后再细边界采样。源素材、构图、跟随参数和位移范围不变。离开菜单恢复 960×540 画布、相机和输入尺度，派生纹理只缓存一套。

新增实际电台纹理的黑底颜色探针：四分之一像素位移后，旧版 RGB 最大通道误差 37，新版为 0，WebGL 与 Canvas 一致；真实地板 0.1 像素位移仍改变画面，避免回退为整像素跳格。截图和性能结果见 [v6 证据](docs/title-parallax/motion-v6/README.md)。196 单元、打包、主菜单及场景往返回归通过，其他本轮验证见原 PR。最高 1080p 画布是成本上限，4K/高 DPR 仍存在放大；CPU 测量不代替用户内置预览体验。上一提交 12b9762 的完整 CI 已通过。慢环境检查已消除固定时长与浏览器回调数的假设：等待缓动真实到位，按 90 次有效场景更新统计相邻姿态变化，保留严格终点、20 秒等待上限和超过 80 次连续变化的断言；强制 SwiftShader 复跑整套主菜单回归通过。本轮以最新 PR head 为准。未合并或发布。

## 2026-10-07 · v5 修复像素跳格与水面开销，继续 PR #21

用户反馈眩晕和低帧观感；缩小范围后实测仍指出整像素移动跳格。本轮取消图层位置取整与标题相机 roundPixels，移动图层采用连续采样，船 ±0.7 像素起伏、灯 ±0.006 弧度微摆均连续；退出时恢复纹理设置。取消纵向视差、自动漂移和回中，前景 ±24→±4 逻辑像素，远港固定；菜单悬停、指针离开、指南与失焦保留姿态。水面由每显示帧约 1.4 万条 Graphics 指令改为两张有界像素缓存，船影／反光底图预绘，资源随退出释放。

196 单元、打包、13 视口主菜单、20 次往返、连续真实鼠标检查、水面可见变化、24 浏览器、38 UI 和 6 步离线 ZIP 均通过。新增实际画面回归：室内层只移动 0.1 逻辑像素时地板截图必须改变；90 帧内船和灯必须产生超过 60 个姿态，避免只检查坐标而漏掉渲染取整。独立 Chrome 4 倍 CPU 降速下更新＋渲染中位数 1.2→0.6 ms、P95 1.8→1.6 ms；Canvas 回退中位数 1.3→0.6 ms。测量未复现用户内置预览掉帧，实际舒适度仍待用户确认。详见 [v5 录屏、测量与限制](docs/title-parallax/motion-v5/README.md)，最新提交 CI 以 PR 检查为准；未合并或发布。

## 2026-10-07 · v4 字标、菜单与左侧暗部，PR #21 保持草稿

续作核实：main 仍为 fc2dccf；原头 91c0817 的完整 CI 已成功，未部署 Pages。本轮观察原概念与实装，修正左侧叠加遮罩过暗、字标比例及磨损、菜单字重和大桌面间距。生成两个字标候选，在真实尺寸比较后保留适量磨损版本，经既有单色／二值透明准备接入；源图和实际提示词已保存。短横屏复拍发现页脚落在亮地图上，已补仅该尺寸的底部遮罩。

场景 PNG、地板分层、透视坐标与运动代码未改。196 单元测试、打包、13 视口、四角、离线 ZIP 通过；24 浏览器和 38 UI 场景也通过，最后短横屏专用遮罩调整后已重跑受影响的主菜单与便携检查。详见 [v4 记录与对照](docs/title-parallax/menu-v4/README.md)。当前提交 CI 需另核对，不以旧 head 的成功替代；整体美术、真机仍未最终验收。

## 2026-10-07 · 同一母版分层返修 v3，原 PR #21 保持草稿

依据原概念生成无 UI 母版，再提取相同坐标的室内、桌台、椅子、前景、船、港口和码头。用户指出首次码头提取把室内地板带入，已拒用重生：室内地板和门槛属于 room，门外湿码头属于 pier。灯和船的提取尺度漂移已在派生和布局中校准；新增地面归属测试及四角视差直接截图。目视复核中心、四角、1280×720、1920×1080 和手机竖屏，未见门槛露底或地面粘连。图形、纹理和菜单排版仍有与概念不同之处，不能据此宣布最终美术验收。

本轮 196 项单元、打包、13 视口主界面、水面实际像素变化、四角空间复核、24 流程浏览器、38 场景 UI 和 6 步 ZIP 离线检查通过。源图及内置 ImageGen 提示词已保存，派生命令只写 11 张运行 PNG 与清单。详细证据、A01–A10 和对照入口见 [v3 审阅记录](docs/title-parallax/master-v3/README.md)。完整 CI 以本轮提交为准，旧 head 的成功不代表新图版本通过；未合并或更新 Pages。以下保留历史修订。

## 2026-10-07 · 主界面空间与光照返修，PR #21 保持草稿

用户明确否定上一轮作为最终美术版本。已把 [PR #21](https://github.com/xuys2025/escape-bincov/pull/21) 改为草稿，依据原概念重做近景椅子、中景桌台与道具、后景船和远港；放大右侧绳索并拉开视差，降低重复 ADD 照明。当前修订截图、同画幅对照和未验收项见 [返修记录](docs/title-parallax/depth-v2/README.md)。195 项单元测试、重新打包、13 视口/20 次菜单往返、实际水面变化和 6 步 ZIP 离线回归通过。整体美术未获用户认可，不能用技术检查替代；未合并或部署。以下第一次精修是历史状态。

## 2026-10-07 · 接手主界面精修：船、水面和工业字标

继续原 `feat/pixel-title-parallax`，重新 fetch 的 main 为 `fc2dccf18c01d424eb0825f39d5a92f7f6eaff35`；查询该 head 无既有 PR。保留此前接力成果，完成新素材的正确接入：港口 y=24、近码头遮挡、视差边缘延展、可见水面和船体倒影、工业像素字标及左上布局。动态关闭冻结当前姿态；shutdown/destroy 成对清理。

资产清单升级为实际导入的 RGBA/索引图完整清单，生成命令只准备派生图，不覆盖源 PNG。当前来源说明、真实截图和逐项检查以 [主界面记录](docs/title-parallax/README.md) 为准；以下早期程序素材、旧尺寸和旧截图属于历史状态。

本地 Node 24.19.0 / pnpm 11.25.0 / Chrome 154：195 项单元测试、打包、13 视口主界面、20 次往返与停止姿态、水面实际像素变化、24 步游戏浏览器及 6 步 ZIP 离线验证通过。新的截图和水面录屏已保存，最终审美、真机及功耗不冒充通过。未改存档/领域/经济/战斗，未合并 main 或部署 Pages。

## 2026-10-06 · 像素值守室主界面与 2.5D 视差（`feat/pixel-title-parallax`）

用户要求按已认可的第二版像素概念，完整执行主界面重做计划，并以独立任务分支和 PR 交付，不自行合并或部署。开始时 fetch 核对，main 仍为 `fc2dccf`，没有开放 PR，于是从最新 main 新建本分支。#10、#18、#20 均已合并，不属于本次承接。

**交付内容**：
- 主菜单改为程序化分层像素场景，景深分组为远景、码头、渔船、室内、吊灯、桌台、椅子和前景。生成器在 `scripts/title-art/`，素材与哈希在 `assets/title/`，构建时内联，保持单文件离线。
- 鼠标视差按景深分组移动，最大幅度 1～12 px，均为整像素。
- 环境动态覆盖灯摆与光池、船体起伏、缆绳、水面反光、岸灯、电台、尘埃、雾和雨。雨改为对象池，新雨线只在门窗开口之外生成，消除了旧版雨层回跳。
- 菜单统一为 Bincov Text 16/32 px，标题是由同一字形派生的像素字标。
- 桌面、宽屏、竖屏与低高度横屏分别取景。
- 动态开关、系统减少动态效果、页面隐藏、失焦和离开菜单统一停止全部动态，恢复时不补算时间。

存档、恢复、经济与玩法语义未改。整备与结算仍使用原夜港背景。

**验证**：`pnpm test`、`pnpm package` 与 CI 列表中的全部浏览器、存档和便携检查都已在 Windows Chrome 154 上运行。`test:title` 已重写为按风险检查。另有 60 秒逐帧连续性审计、20 次场景往返无增长，以及 headless 帧时间与加载测量。截图、录屏、GIF、验收编号和性能数据见 [docs/title-parallax/README.md](docs/title-parallax/README.md)。

**未完成**：没有 iPhone/Android 真机、物理低端设备和功耗验收，手机结果均为 Chromium 仿真；美术审美仍需维护者确认。等待维护者审阅 PR，未合并、未部署。

## 2026-10-06 · #17 采纳收尾与 #10 整合 #16

维护者授权处理关联 #17 后继续 #10。#16 最终头 `c558888` 经复核及完整 CI 后已合并为 `9045139`。#17 原头 `d0b6bd8` 的 M0–M7、68 项任务与 73 条验收已由 #16 保留；仅两段开头改为历史语境，按“内容已采纳”关闭，原分支与交接历史保留。

#10 在原 `a99c661` 之上普通合并 `9045139`，保留完整 QOL 和主线建筑/RPG/基地/商场。修复 RPG 新货品的清单结算、多层数量/方向事务、实际弹丸命中提示、基地购物离开确认、楼层地图与撤离导航组合，以及装备页底栏遮挡。双方全部 CI 回归保留，真实计时脚本接入新交易 UI；详见 [本轮整合记录](docs/QOL-PR16-INTEGRATION.md)。

本地逐例规则 182/182、打包、离线 QOL、建筑、系统事务、便携与双桌面战术检查已通过；新增跨功能 4 流程已通过，长时间游玩继续补验，最终合并须检查原 PR 最新整合头完整 CI。真实手机、真人平衡、原图和独立性能缺口未改为通过。以下各日期段落是历史交付，不应把旧“未合并”状态当成当前状态。

## 2026-10-06 · PR #10 保留商店滚动位置

本轮最终代码证据、截图、报告与未完成真机清单见 [QOL-INTEGRATION.md](docs/QOL-INTEGRATION.md)；任务归属继续 [PR #10](https://github.com/xuys2025/escape-bincov/pull/10)。

主线的商人目录保留滚动位置行为已迁移到 QOL 清单布局，同一商人摆放、取消和结算重新渲染时保留各栏纵向位置，换商人不沿用旧位置。新回归先复现“进入摆放从 70 像素跳回 0”，修复后 844×390、667×375、740×300 均保持位置且不改钱物。

`pnpm test`、`pnpm package` 通过；最终五尺寸 QOL **27/27** HTTP 诊断通过。两份 HTML 字节一致，两个 ZIP 的 CRC 和入口内容核对通过。完整离线 CI 等待本轮最终头；提交仍在原 PR，不合并 main。

## 2026-10-06 · PR #10 落实补充结论与输入验收

按 [LMX 最新补充](https://github.com/xuys2025/escape-bincov/pull/10#issuecomment-6010682822)，任务栏名称改为“仓库／携带”，注明携带含带入物资，保持当前位置计数与回站交付；不新增新拾取量。保留已接受的页面拖动方案。QOL 浏览器回归补充真实鼠标拖出视口后松手、Esc、失焦／后台事件夹具、触屏电脑先触控摆放再鼠标取消，明确仿真边界。游玩说明同步手机选来源、战术布局、商店清单和旋转拆分。

`pnpm test`、逐例 **121/121**、`pnpm package` 通过；五尺寸 QOL **27/27** HTTP 诊断通过，战术界面 **8/8** 与美术 **7/7** 通过。完整离线 CI 随本轮最终头执行；真机和十分钟真人行动仍未验收。

## 2026-10-06 · PR #10 同步战术界面主线

将最新 main `07b1414da9f1ac4c3ad13a23ec914630ccbd7fbb` 正常合并到原 QOL 分支，保留两侧公开历史。保留 #20 的装备／背包／来源布局、库存美术、字体 B、空箱与尸体外观及相关 CI；商店结合新美术与 QOL 待买／待卖清单结算，保留搜刮危险栏、旋转拆分和事务保护。字体按固定上游及既定工具重新生成字符子集。

类型检查、`pnpm test`（逐例 121 项）和 `pnpm package` 通过；本地 HTTP 诊断的战术界面 8 项、五尺寸商店 10 项、目标选择 24 项通过。原离线脚本保留，完整 CI 待本轮最终提交重新执行。后续按 LMX 最新补充落实“仓库／携带”和输入验收；原 PR 标题依用户要求保持，不合并 main。

## 2026-10-05 · PR #10 补齐 740×300 短屏检查

额外短屏复核发现商店摆放提示挤压待买/待卖格，已将摆放操作移入底栏替换结算操作，并限制出击区占宽。保留取消和出击入口；任务栏、电台文字与触控按钮避免重叠。740×300 加入固定 QOL 回归，新增取消按钮可见和电台不重叠断言。

`pnpm test`、逐例规则 **121/121**、`pnpm package` 通过；五尺寸 `test:qol` **27/27** HTTP 诊断通过，生成物与实图已同步。完整离线 CI 仍以 PR #10 最新提交的检查结果为准。原 PR 标题不变，没有向 main 推送或合并。

## 2026-10-05 · PR #10 出击准备与行动信息完成

补齐定稿的出击缺项提醒、敌人命中方向、选定撤离点的方位/直线格距、默认收起的未完成任务栏。任务按站内仓库/本局背包及安全箱分列，避免安全箱重复计数；流血和污染不触发受击方向。手机任务展开时限制滚动区高度，避开操作按钮。地图新增选择器后仍保留可见关闭入口。

`pnpm test` 和逐例规则 **121/121**、`pnpm package` 通过；`test:qol` **22/22** HTTP 诊断通过，覆盖双桌面及 844×390、667×375 手机。代码证据、真实截图、环境限制、兼容说明汇总到 [QOL-DECISIONS.md](docs/QOL-DECISIONS.md)。完整离线 CI 结果以原 PR #10 的最新验证表/交付评论为准。最新 main 再次 fetch 后仍为 `49738b8`，已保留合并父提交；没有改 PR 标题或合并 main。

## 2026-10-05 · PR #10 商店短屏可用性复核

实图复核发现短屏中结算栏挤压待卖区，因此商店三栏、上下缓冲区各自滚动，结算移入固定底栏，手机压缩页头并保留出击入口。待买与待卖的首件物品可同时看清和点选。全部放回原位置后，清单不再因数组顺序变化误判为未结算。

`pnpm test`、`pnpm package` 通过；三尺寸 `test:qol --shop-only` 6 项 HTTP 诊断通过，增加物品中心未被遮挡的实际命中检查。已查看 1280×720 与 844×390 截图，桌面 1920×1080 同时通过。

## 2026-10-05 · PR #10 桌面拖动中 R 旋转

物品使用页面指针拖拽以接收 R，商店仍用原生拖放，二者共用来源校验与事务提交。R 只改拖动预览，Esc、失焦、离开窗口和切面板取消；松开鼠标落在有效格位才保存。预览浮层避开搜刮危险栏，行动 R 仍换弹。手机移动格位时切换背包/安全箱页可继续选择目标。

`pnpm test`、`pnpm package` 通过；`test:qol` 三尺寸 11 项 HTTP 诊断通过，其中双桌面验证拖动 R、取消、提交和行动换弹。使用保持玩法断言的临时 HTTP 入口跑完整 `test:loot`，双桌面与手机 44 项通过，含真实受击、写入失败、跨容器旧拖拽、恢复、多窗口冲突、死亡/超时/撤离。临时入口仅用于系统浏览器不允许 file:// 时的诊断，原离线脚本和 CI 保留。

## 2026-10-05 · PR #10 手动旋转、拆分与部分合并

背包、安全箱、箱子和尸体支持旋转预览及按数量拆分后手动落格；兼容堆叠仅接收剩余容量，来源保留余量、原 UID、方向和位置。拆出新堆使用新 UID。预览/取消不写档，世界容器与角色物品仍由同一会话事务提交，失败恢复两端。商店仍按包购买、整组出售。

`pnpm test`、`pnpm package` 通过；补充拆分旋转与部分合并的守恒/回滚测试；三尺寸 `test:qol` 共 9 项 HTTP 诊断通过。手机短屏取消按钮的样式遮挡已修复。桌面拖动中 R 尚未在本提交实现：实测浏览器原生拖拽吞掉键盘事件，下一提交将用页面指针拖拽落实该交互，参见 [讨论说明](https://github.com/xuys2025/escape-bincov/pull/10#issuecomment-5999993580)。

## 2026-10-05 · PR #10 商店统一结算

商店复用物品格与详情：左侧商人物品，中间上方待买、下方待卖，右侧仓库。桌面拖动/手机点选格位，买按包、卖整组；原侧放回取消，离开或换商人确认放弃清单。统一结算按买卖净额一次保存，支持卖出腾出的格子和资金；现金/容量不足、写入失败整笔撤回。整备出售入口改为引导至商店。

任务确认只针对本次卖出且整笔交易后不足交付的物资，列任务、需求、卖出、剩余数量；取消清单不改现金或物品。6 项交易纯逻辑与会话测试通过；`pnpm test`、`pnpm package` 通过；`test:qol` 在 1280×720、1920×1080、844×390 的 6 项 HTTP 浏览器诊断通过，覆盖失败回滚、重试、刷新、取消和手机确认框。原浏览器/存档脚本已改用清单结算，离线全套待 CI。

## 2026-10-05 · PR #10 QOL 决议第一组

基线同步至 `49738b8`。按 [LMX 定稿](https://github.com/xuys2025/escape-bincov/pull/10#issuecomment-5995536156) 实现手机按名称打开具体箱子/尸体、搜刮固定危险栏（生命、倒计时、流血/污染、敌人受击）、指南关闭返回原面板。搜刮不中断世界；空容器、编号、距离/视线/潮位与撤离优先规则保留。补给无收益时仍可消耗，按决议不改治疗规则。

验证：`pnpm test`、`pnpm package` 通过；系统 Chromium 151 下经 localhost 运行 `test:loot-target`，24 项通过，包含 1280×720、1920×1080、844×390。系统浏览器禁止 file://，此处是 HTTP 诊断，离线验收仍需原 PR CI。后续商店、物品操作和局内信息按同一决议继续。

# 《逃离滨科夫》交接记录

更新：2026-10-06。权威仓库：https://github.com/xuys2025/escape-bincov 。公开发布后以仓库最新 `main` 为基线；所有后续任务先读 `AGENTS.md` 和 `docs/AGENT-HANDBOOK.md`，先核对统一任务清单与相关开放 PR，同一目标继续原任务分支与 PR。

## 2026-10-06 PR #19 同步主线与任务收口

最终整合补记：#18 的整合头 `92437d7` 已通过完整 CI，并合并为 main `912aadcb5eefa35cb8e604f4bcf65e7411cc83ca`。#11 的整合头 `5e5658f` 也已通过完整 CI。因主线更新后的保护规则要求重新验证，本 PR 在原 `724d2cf` 上追加最终整合提交，同时保留当前 main 与 #11 的头提交为父历史，承接 #11 的 63 份美术研究档案及导航/交接。最终范围为美术档案收尾和协作流程，不再另开整合 PR；合并前对完整组合重新运行 CI。

维护者在核对 #20 与前序工作的关系后，授权完成 #11、#18 原 PR 的归档整合及 #19 流程收口。当前已接受基线为 main `9fe189cbb7114a54dbfd7d1670524f0c7b3d2a34`。本 PR 保留原 `f79eb7a` 和主线两条父历史，解决交接记录冲突，并保留 #20 新增的美术模块说明、战术检查命令及全部运行文件。

[统一任务清单](docs/WORK-QUEUE.md)已更新为 2026-10-06 的固定提交快照：#10 已有完整 QOL 候选；#16 已接入 M0–M6，保持 Draft 并登记审阅发现的追击门问题、主线冲突及剩余验收；#17 的计划文件已出现在 #16，具体采纳仍待核对。#20 已合并；#11、#18 正在原 PR 完成档案收尾，当前整合提交分别为 `5e5658f`、`92437d7`，以各自最新 CI 和 GitHub 状态为准。下方 2026-10-05 的记录保留原时点事实，不再作为当前进度依据。

协作规则继续要求同一目标复用原 PR、保留原执行者与分支历史、先核对实际实现再收尾。当前新增需求暂停截至 #19 合并；之后待排期事项也不自动开工。本次七份流程文档经链接、规则一致性和树差异检查；游戏、构建、CI、字体与生成物逐文件等于基线。整合提交重新运行 CI，结果见 [PR #19 检查](https://github.com/xuys2025/escape-bincov/pull/19/checks)。

## 2026-10-05 协作流程整理与在途任务登记

维护者要求统一任务入口、减少重复 PR，暂停补充新需求直到本次流程整理 PR 合并；并确认 #10、#11、#16、#17、#18 均有 agent 正在工作。本轮基于 main `49738b89cc8556a0b39d339239bf09945e44ab9e`，仅在 `docs/pr-workflow-consolidation` 整理协作文档，不接管或改动其他任务分支、PR 状态和合并安排。

新增[统一任务清单](docs/WORK-QUEUE.md)，登记原 PR/分支、核对 SHA、真实范围、收尾边界及待讨论事项。#10 已有 QOL-01 实现，#16 已开始 M0，不能再按旧标题或旧计划认定为纯文档。#17 规划已被 #16 引用，但其完整计划文件不在核对时的 #16 树中；后续由原 agent 核对采纳与差异，再由维护者决定原入口处理。#18 为研究稿，不能算 UI 已接入。

AGENTS、开发手册、贡献指南、README 协作入口及 PR 模板统一为“同一目标继续原分支与 PR”；新想法先登记，只有独立可验收交付才新开 PR。大任务继续分阶段提交/验收，保持 #16 全部已确认范围和 Draft 门槛；最高离层弹丸规则不变。后续并发限制只控制新启动的实现线，不打断当前 agent。

本轮为协作流程文档变更；验证链接目标、已引用 PR/分支事实、规则一致性及差异，不在本地重复游戏测试或打包。创建后的 CI 以本 PR 当前提交的 Actions 为准，不借用其他 PR 的结果。工作区不是完整 Git checkout，采用固定 SHA 的 GitHub 连接器快照与本地差异检查；不修改游戏源码、游玩说明、存档、生成物或部署。

下一步由维护者审阅本整理 PR；各原 agent 继续当前任务并在归属/状态变化时更新清单。正文中的收尾安排是后续工作约定，不表示本轮已关闭、合并或重分配任何在途 PR。

## 2026-10-06 PR16 审阅修复及最新主线整合

- 最新 main 为 `07b1414da9f1ac4c3ad13a23ec914630ccbd7fbb`，已在 `feat/buildings-rpg-mall` 普通合并；保留已公开历史，不强推、不推送或合并 main、不部署 Pages。
- 发布前再同步文档合并 #18/#19，保留研究档案、协作约定与 PR 模板，更新统一任务清单。相比 #20 的游戏/构建/字体/生成物无增量，最终包字节及长测报告哈希不变；实际旧客户端兼容另以最新 main 复跑。
- 新增用例在旧实现实际复现远处追击重开旧门，修复为仅扫描上一帧至本帧路段与身体范围。新增弯道/多门大帧回归，保持存档字段、抵达时间和唯一身份；原生居民楼按 E 关门后的帧/保存/刷新通过。
- 保留 PR #20 战术库存/商店、像素字体 B 与模块美术，接回全部扩展页与入口；30物品各类纹理、动态负重、多层尸体/掉落/空箱恢复验证通过，883字符字体子集按固定来源与工具重建。
- `pnpm test` 167用例、`pnpm package`、最终包8流程建筑/5流程真实最新主线旧客户端/16流程系统/30物品美术/双尺寸战术/7开口/堵塞落点/便携均通过。完整旧浏览器/存档/桌面/标题/移动回归先在整合包通过，最终头 CI 再运行全部检查；最新结果见 [PR #16检查](https://github.com/xuys2025/escape-bincov/pull/16/checks)。
- 最终 HTML SHA-256 `dc9d29e3d3dc6be8a4f85bc1349f8a19b9df6b93bade69cd91e47def77bc751c`。同包正常计时经典十分钟和商场三局通过，首局600秒超时，再死亡与撤离；报告与真实截图归档于 [本轮证据](docs/evidence/pr16-review/README.md)。首次证据另保留历史包身份，未混用旧哈希。
- 并发无头负载下首局长帧已如实记录，未宣称目标设备性能达标。真机、真人平衡、大陆三网、原图对照及独立性能验收仍未完成；本轮修复和整合不改变这些人工边界。

## 2026-10-06 战术像素界面与字体 B 实施

基线为最新 main `49738b89cc8556a0b39d339239bf09945e44ab9e`，独立分支 `feat/tactical-pixel-ui`。维护者已批准总体方向及字体 B，并要求实际代码实施；PR #18 保留为调研/原型。本轮从 main 新建工作树，确认旧候选与 main 的游戏源码共同基线一致后按增量引入重绘，未覆盖其他工作区或已合入的建筑/RPG/商场设计。

整备改为随身装备—背包—仓库，安全箱与固定详情区可见；桌面搜刮为自身在左、来源在右；商人目录、固定用途说明和玩家仓库同屏。格位在 720p/1080p 分别为 54/80 CSS px，战斗保留原整数缩放，手机保留点选/移动格位流程。接入字体 B（寒蝉点阵体 16px Regular 的 OFL 子集，更名 Bincov Text），字集与许可随离线 HTML 内嵌。

逐项重绘并检查 20 种物品的库存比例图、24/32px 紧凑图、20 种地面实体图、角色/尸体、满空箱体、商人头像、统一 SVG 与六区场景。共享材质色阶；原生整数像素绘制，静态场景纹理缓存并释放。修复详情区挤压安全箱、旋转图两像素裁切和目录行收缩导致按钮遮挡；新增回归保留真实点击与拖动。没有变更领域数值、地图格、AI、存档格式、会话事务或依赖锁文件，也未实现设计文档中的新玩法。

本地验证：`pnpm test`（11 个测试文件）、`pnpm package`、浏览器 24 步、桌面/混合输入 10 项、UI 38 场景、主界面 16 组、存档 9 项、搜刮 44 项、手机 10 项、手机体验 11 项、便携入口 6 项、战术布局 8 组及 100 张运行纹理审查全部通过。十分钟真实计时自动操作完成 10 局、5 次撤离、60 次击败、48 次打开容器与 61 次物品转移；无脚本错误或外部请求。后续商人目录/SVG 尺寸修正已复跑相关专项。ABBA 独占浏览器性能对比和制品哈希见[验证记录](docs/tactical-ui/validation.json)；本地 Chromium 为 153.0.8010.12，不能代表真机表现。

[实施与逐图审查说明](docs/tactical-ui/README.txt)标明所有截图夹具和审查边界，包含 main 改造前及真实游戏改造后图片。两个 HTML、两个 ZIP 和发布清单均经 `pnpm package` 生成；新增 `test:tactical` / `test:art` 纳入 CI，验证任务超时上限增加至 20 分钟。GitHub CI 以本实现 PR 的检查结果为准。未做 iOS/Android 真机、玩家识别盲测、真人手感和平衡及大陆三网验证。按 PR 交付，不自行合并 main 或更新正式 Pages。

## 2026-10-06 PR16 服务恢复后的补充回归

- 继续在 `feat/buildings-rpg-mall` 实施；再次 fetch 后最新 main 仍为 `49738b89cc8556a0b39d339239bf09945e44ab9e`。GitHub Actions恢复后重跑原失败执行器，并在补充测试提交后验证最新头；最终状态以 [PR #16检查页](https://github.com/xuys2025/escape-bincov/pull/16/checks) 为准。未推送/合并 main、未部署 Pages。
- 建筑专项由6增至7流程，补居民楼F2预警/翻潮/来源时钟冻结/超时结算写入失败与单次重试；270/300/600秒采用明确边界夹具，与正常600秒报告分别记录。基地/商场由15增至16流程，补楼梯旁地图/背包面板和关闭后的长按抑制，以及成功搜刮后切层失败/重试/刷新保留双端余量。两专项全部通过，0页面错误、0HTTP请求；[报告、截图与夹具说明](docs/evidence/pr16-full/README.md)已更新。
- 修正超时测试的故障选择：只拦截终局候选写入，允许之前的自动检查点；原“拦截全部写入”夹具可能在599.95秒后先触发检查点保存失败、暂停行动，使测试无法到达终局。游戏源码和计时/事务规则未变，新增报告均记录同一HTML SHA-256 `76cc5602c730de38235846e9b6610a103bf004798cdf4626fb4ced1a9dd3122b`。正常三局证据继续对应这个运行包。
- 恢复后的 [原头CI重跑](https://github.com/xuys2025/escape-bincov/actions/runs/37364575310)在北京时间10:06达到验证任务20分钟上限，移动端体验前8流程已通过时被取消，便携检查尚未执行。将验证上限调整为30分钟，保留全部检查、断言和故障报告；Pages部署条件与其10分钟上限不变。最终补充提交必须另跑完整CI，不用被取消的结果记为通过。
- [73项登记](docs/PR16-ACCEPTANCE-REGISTER.md)更新B-11、S-04、S-05的实际证据。全部扩展故障组合、原图、真人经济/成长/拥挤手感、物理手机及目标设备性能仍未完成，Draft状态保留。

## 2026-10-05 PR16 M1–M6 完整玩法候选与 M7 验证

- 继续在最新 main `49738b89cc8556a0b39d339239bf09945e44ab9e` 的独立 `feat/buildings-rpg-mall` 工作；交付前再次 fetch 确认基线未变，未推送/合并 main、未部署。总 [PR #16](https://github.com/xuys2025/escape-bincov/pull/16) 保持 Draft。
- 居民楼互动门窗、多楼层、有限离层弹道和唯一追击；完整身体/成长/爆头/通用声望与隐藏幸运；可行走基地、五设施、三配方有限生产及离线恢复；39区域两层商场、7同层入口、4组楼梯与露台均已接入。入口、兼容和首版取值见 [实施记录](docs/PR16-IMPLEMENTATION.md)。
- 纯规则165实际用例通过，旧海岸断言保留；严格类型与离线打包通过。新增商业入口实际双向身体通道、追击投影占位、同坐标层隔离测试。7开口慢走/冲刺各10次往返、商场堵满落点/清开一个站位、五秒长按抑制均通过；自动图形/事务报告在 [证据目录](docs/evidence/pr16-full)。
- 浏览器回归发现并修复终局写入后场景恢复空行动导致误报失败、商场西/东入口邻店墙、手机基地按钮/楼层地图覆盖、基地退出/缩放时保存失败保护及训练区域边界；追加战利品明确落格后跨同种子/地图出击的6组回归，修复生成物跨局身份冲突及护符返回库存时UID改变。最终包普通商场入口、双固定箱和四终局15流程通过；正常600秒/连续三局实际通过，依次超时600.156秒、死亡109.331秒、撤离57.878秒，0页面错误/0HTTP请求。最终HTML哈希为76cc5602c730de38235846e9b6610a103bf004798cdf4626fb4ced1a9dd3122b；[报告与真实截图](docs/evidence/pr16-full/README.md)已归档，最终CI以PR最新头检查为准。
- 第一局帧p50/p95/p99为33.3/66.7/99.9ms，第二局最长帧550ms；存在并发无头浏览器负载，实际设备性能需复核。有限三局采样未见纹理/节点/粗粒度堆持续增长，不能排除长期泄漏。iPhone/Android物理设备、真人平衡与商场原两张参考图对照未验收。通用阵营/奖励接口完成，具体阵营剧情与黑市货单依原规范留后；完整备份导入是替换而非合并，不能承诺阻止用户恢复任意历史自有备份。逐条现状见 [73项登记](docs/PR16-ACCEPTANCE-REGISTER.md)，本文件历史M0未完成项不代表当前候选仍未实现。

## 2026-10-05 PR16 M0 第一批实施

- 唯一基线 main `49738b89cc8556a0b39d339239bf09945e44ab9e`；独立 `feat/buildings-rpg-mall` 正常合并原 #16 文档历史，未推送/合并 main。按 [规划 PR #17](https://github.com/xuys2025/escape-bincov/pull/17) 顺序推进，总 [PR #16](https://github.com/xuys2025/escape-bincov/pull/16) 保持 Draft。
- 新增 v4 同主档扩展状态、严格多图/身体/成长/队列校验、升级前原字节、完整待结算备份和私有候选票据；原型验证离层弹道、单次尸体/实际枪伤训练量、唯一追击移交、生产游标的原子提交。正常入口仍是海岸，不自动启用未完成功能。
- 结算/待结算导入及启动恢复也采用单调生产游标；追加未来60秒游标的回拨边界，防止直接赋值Date.now降低游标。
- `pnpm test` 122项通过（原109项 + 新13项）；`pnpm package` 类型检查及两HTML/两ZIP通过。browser、desktop-input、ui、title、save-browser、loot、mobile、mobile-ux、portable 全部实际通过；最终包再次通过 save-browser、portable 与扩展专项。
- `pnpm test:expansion` 5个真实新旧HTML/同源所有权/导入/待结算流程通过；`pnpm test:expansion-benchmark` 两负载各60次实测通过。主档约32/129KB；最终常规解码/同步写入p95约2.03/1.00ms。报告和双分辨率实际截图位于 docs/evidence/pr16-m0，细节见 [M0记录](docs/M0-STATE-AND-COMPAT.md)。
- 初次布料目录计数与严格类型空值检查失败已修复；默认沙箱浏览器 crashpad/socket 权限问题通过必要网络权限恢复，浏览器仍离线。无未修复的本地短检查失败；CI以本次提交的PR检查为准，不借用旧头成功结果。
- 原总计划M0部分项目完成；[73项正式验收](docs/PR16-ACCEPTANCE-REGISTER.md)仍未完成，M1–M7待实施。下一批是居民楼布局、门操作、纯交互排序和真实场景/输入接线；随后补追击抵达/投影/潮位改路和换层UI。
- `pnpm test:play` 未运行：新的弹道核仅在纯规则夹具中，尚未接入正常场景；新世界600秒/连续三局留到M2/M7。真机与真人平衡未运行，商场原两张参考图仍缺，完整生产收益重复导入场景待M5-F。不得转Ready、宣称新玩法已上线或自动合并。

更新：2026-10-05。权威仓库：https://github.com/xuys2025/escape-bincov 。公开发布后以仓库最新 `main` 为基线；所有后续任务先读 `AGENTS.md` 和 `docs/AGENT-HANDBOOK.md`，通过独立分支与 PR 交付。

## 2026-10-05 建筑、RPG 与商场总实施 PR（待实现）

维护者确认后续“大 PR”的需求就是 #12–14 全部内容。本轮建立 [总实施计划](docs/IMPLEMENTATION-PLAN.md)，按 M0–M7 八个阶段组织 68 项待办，覆盖建筑/门窗/跨层、离层一次子弹结算、RPG 生存/成长/随机爆头/声望/幸运、基地设施/生产/离线补算、滨湾商场及联合验收。完整规范继续引用三份原设计，不以摘要缩减范围。

最高指示继续为“离层后立刻进行一次子弹结算，随后冻结时间”，按 [整合 PR #15](https://github.com/xuys2025/escape-bincov/pull/15) 的统一说明执行。总 PR 保持 Draft，标题标明“待实现”；68 项实现/验收任务全部未勾选，没有开展游戏功能实现或新玩法运行验收。原设计与本轮文档检查通过不代表功能已完成。

当前仅新增实施计划、README 导航和本交接。文档相对链接、阶段覆盖、未完成标记、代码围栏与空白检查已完成；未本地运行 pnpm test/package/浏览器命令，因为无代码或游玩说明变更。后续先从状态/时间/兼容基础与失败回滚原型开始，按计划分阶段提交到总 PR，完整验收前不转为可合并状态。

## 2026-10-06 PR #18 设计采纳与原型归档

维护者授权在原 PR #18 收尾。同步已合并 #20 的 main `9fe189cbb7114a54dbfd7d1670524f0c7b3d2a34`，保留原研究提交及 34 个独立档案文件，更新使用说明中的采纳状态与历史复现入口。布局和字体 B 已由 [PR #20](https://github.com/xuys2025/escape-bincov/pull/20) 实现；[原型](docs/tarkov-ui/review.html)继续作为设计对照，当前游戏以 [实装记录](docs/tactical-ui/README.txt)为准。原型中引用的 #11 候选图保留原出处，不再宣称是当前主线截图。

三方合并无源码或生成物冲突；游戏源码、字体、构建、CI 和发布制品与上述主线逐文件一致。本地检查相对文件链接和归档边界，原型截图与报告保持原字节。重新采集旧基线须使用历史提交 `baa8335` 的独立工作区，不能覆盖当前游戏包；本轮未重跑历史截图采集。整合后的 CI 以 [PR #18 检查](https://github.com/xuys2025/escape-bincov/pull/18/checks)为准，真人阅读和真机验证继续保留为未验收。

## 2026-10-05 塔科夫界面研究与可切换对照稿

维护者要求先研究塔科夫实际界面、讨论方向，再进入游戏改造；本轮同意继续制作整备/搜刮结构稿与字体、物品比例样张。重新 fetch 后以最新 main `e7252e6a595022212a60bcec22ac75068173e480` 建立独立分支 `docs/tarkov-ui-study`。提交前再次 fetch，已更新到最新 main `49738b89cc8556a0b39d339239bf09945e44ab9e`；其新增建筑/商场设计文档均保留，游戏源码和发布产物与采样基线一致。原 PR #11 仍是独立待审美术候选；上一轮未经讨论的界面试改保留在原工作区，没有纳入本轮。

交付[离线可切换设计稿](docs/tarkov-ui/review.html)和[使用/复现说明](docs/tarkov-ui/README.txt)：固定左侧自己的装备、背包和安全箱，右侧切换仓库/来源容器；可选物品、切换 A/B 字体和 main 原界面对照。参考明确区分 0.12.7 原版截图、0.16 带作者字体标注的搜刮图和 0.13.5 交易改版记录。初稿提供 A/B 同屏比较；维护者随后明确“整体方向通过，字体选 B”。现已将 B（寒蝉 16px 点阵正文/格子标签）设为默认，A 作为历史对照保留；后续页面与逐图精修沿已通过方向推进。物品使用真实占格和经领域规则校验的演示夹具；40 张 24/32px 小图来自 PR #11 `09e0713`，长枪、手枪、净水瓶、急救包另做比例实验。没有加入未实现的护甲/胸挂槽或 RPG 数值。

1280×720、1920×1080 各检查整备/搜刮 × A/B，共 8 组；12 张原型浏览器截图、4 张 main 实际截图分别标记。检查格位完全可见、来源在右、名称/数量不重叠、键盘选择和焦点保留、两套字体实际渲染、原界面对照及空 localStorage，0 页面异常和 0 HTTP 请求。环境 Linux / Chromium 153.0.8010.12，DPR 1；定案文案对应的字体子集 619 字符无缺字。证据见 [原型报告](docs/tarkov-ui/review-report.json)、[基线报告](docs/tarkov-ui/baseline-report.json)及字体 manifest。原型没有出击/交易/拖放/转移/保存能力，底部动作是排版展示，不能把这些检查算成游戏实现验收。

另在 Node 24.19.0、pnpm 11.19.0 下执行 `pnpm test`，109/109 通过；`pnpm package` 的严格类型检查、HTML 与 ZIP 打包通过，正式源码、HTML、ZIP 和发布清单与 main 字节一致。本轮没有在本地重新执行完整游戏浏览器套件，原型检查不能替代游戏交互回归；提交后的 CI 结果以 PR 检查页为准。

已通过整体布局与 B 字体选择，并同步到 [PR #18](https://github.com/xuys2025/escape-bincov/pull/18)。本次定案仅复跑原型检查，包含首次打开默认 B、两套排版与两种分辨率；游戏规则和打包沿用上轮同一源码的结果，当前提交 CI 另以 PR 检查页为准；整体方向的认可不等于全部物品精修验收完成。仍待：真人阅读速度/无标签辨识，移动布局、系统缩放和真机。后续才制作交易、主菜单及 HUD，并在真正接入游戏时执行库存、输入、失败回滚与恢复回归。本轮游戏 src、正式 HTML/ZIP、存档和部署均不变；主线 RPG 文档仍为拟议设计。

## 2026-10-05 QOL-01 / D1：按讨论实施桌面搜刮目标选择

重新 fetch 后，唯一基线仍为 `a34c7a1ba810919fc33d4fce158aba0a028a0f78`。已阅读 [PR #10 决议](https://github.com/xuys2025/escape-bincov/pull/10#issuecomment-5988738899)，只实施 D1，继续使用 `agent/qol-discovery-20261005`，不合并 main。

行动画面在原搜刮提示处显示所有可访问箱子/尸体，滚轮上下循环选择，E 打开高亮来源；空来源仍可选，同名来源有稳定序号。移动、攻击、敌人、计时与潮汐照常运行；搜刮面板内不换来源，关闭后保留选择。复用距离、视线与潮位校验，撤离优先；与容器重叠的散落物通过「附近」取走。手机操作未定，保留原最近目标行为。没有更改存档结构和物品事务。

代码、21 项专项回归与对应游戏包一起原子提交；操作说明、前后截图与交接记录独立提交。Linux / Node 24.19.0 / pnpm 11.19.0 / Chromium 151：`pnpm test` 退出 0，额外逐例核验 109/109；`pnpm package`、HTML/ZIP 校验通过；两桌面尺寸与 844×390 触控的 HTTP 专项 21/21 通过。默认 `test:ui` 被本地浏览器的 `file://` 策略阻塞，不算通过；完整离线、存档、手机回归由 PR 最新 CI 核验。实现边界、截图和结果见 [QOL-IMPLEMENTATION.md](docs/QOL-IMPLEMENTATION.md)。

其他 QOL 项与手机重叠来源选择仍待决定；未做十分钟自然实战或手机真机验证。PR 开放待审，不推送或合并 main。

## 2026-10-05 QOL 专项问题发现与分析

基线 `a34c7a1ba810919fc33d4fce158aba0a028a0f78`，独立分支 `agent/qol-discovery-20261005`。维护者先要求只发现与分析，随后要求通过一个 PR 列出问题和代码证据，并将讨论事项放在最后。本轮仅提交 [QOL 分析](docs/QOL-DISCOVERY.md)、基线观察数据、测试日志及五张已检查的真实截图；没有实现修复，也没有改源码、测试脚本、生成物、存档协议或部署配置。

记录 4 项 P1：重叠尸体目标无法切换、搜刮危险信息与短屏出口遮挡、零收益补给消耗、暂停中关闭指南直接恢复行动；4 项 P2：动态出击提醒、任务物资误售保护、搜刮旋转入口与商店购买前详情。逐项包含复现、玩家影响、固定基线的代码链接和候选验收目标；文末集中讨论交互方案、整堆/部分转移规则及后续真人试玩方向。所有问题仍未修复，建议不等于已实施。

基线 Linux / Node 24.19.0 / pnpm 11.19.0 / Chromium 151.0.7922.173：`pnpm test` 退出 0（本地报告 11 个文件），额外以 Node `--test-isolation=none` 核验具体规则 109/109 通过；严格类型检查通过。HTTP 诊断覆盖两种桌面与四种触控尺寸，四种触控实际转移均成功；`test:ui`、`test:loot` 因浏览器禁止 `file://` 而阻塞，不计通过。文档 PR 不重新打包；提交前检查链接、源码摘录、证据哈希和差异。基线 CI 已成功，本 PR CI 独立核对；手机真机、自然重叠频率和真人手感未验证。PR 等待维护者审阅，不推送或合并 main。

## 2026-10-05 PR #12–14 整合审阅

维护者授权审阅并合并建筑、RPG 与商场设计，并另开涵盖全部需求的“待实现”总 PR。本轮确认三个原 PR 都只改变文档，原提交的 Build and test 均成功；[PR #13](https://github.com/xuys2025/escape-bincov/pull/13) 已先合并为 `e7252e6a595022212a60bcec22ac75068173e480`。下方“未合并”等表述保留为历史交付记录，当前状态以 GitHub 为准。

审阅发现建筑与商场的离层弹丸规则相反。维护者最高指示为“离层后立刻进行一次子弹结算，随后冻结时间”。[建筑设计](docs/BUILDING-LOGIC.md) 与 [商场设计](docs/MALL-VALIDATION-MAP.md) 已统一：离层后一次性结算来源层在途弹丸，再冻结该层本地时间；全局行动时钟、潮汐及追击事件按原设计继续。结算结果、伤害、击杀、掉落、随机状态和追击取消纳入同一次换层事务；失败完整回滚，刷新/重试不得重复结算。商场 L-06 同步改为对应验收。

同时统一商场落点搜索与建筑规则（指定落点优先，64 像素圆内按距离、行、列选择），保留商场至少 3×3 格平台；商场 P 入口明确为固定开放通道；60 份基础物资预算与 RPG 非中性幸运的显式增减产分开验收。新玩法全部仍待实现，未改源码、存档格式、版本号或生成物。

文档相对链接与现有树核对通过，商场 39 个区域及 34 个唯一验收 ID 已核对；更新后另检查链接、差异与规则一致性。没有在本地重跑游戏测试或打包（仅文档）。Git 克隆受本环境代理连接故障阻塞；fork 写入返回 403，故通过主仓库独立整合分支保留 #12/#14 原提交父历史并解决交接记录冲突，经正常 PR/CI 合入。整合 CI 以对应 PR 检查页为准，不用原 PR 的通过结果冒充整合结果。

## 2026-10-05 滨湾商场验证地图设计（仅文档）

以已接受 main `a34c7a1ba810919fc33d4fce158aba0a028a0f78` 为基线，独立远端分支 `docs/mall-validation-map`。用户明确要求仅生成文档，并确认两层商场加地面室外、尽量还原两张参考平面图、可玩的验证地图、各层战斗隔离、敌人沿楼梯/扶梯跨层追击。正式方案见 [docs/MALL-VALIDATION-MAP.md](docs/MALL-VALIDATION-MAP.md)。

文档包含两层及室外编号示意、39个区域的特色装饰和B/M/V碰撞分类、四组双向楼层连接、七个同层出入口、露台双入口、干燥外围环路、三条探索路线与34条验收用例。保留原图药房/快餐店/中央卖场/服装/后勤/儿童乐园/东侧大店关系；地下入口与北侧检修核只作封闭布景，菱形陈列岛不改成中庭。沿用行动时长、初始敌人/物资总量和结算规则；新增楼层身份、跨层寻路和检查点事务仅为拟议要求，未改变接口、存档格式或游戏实现。

实际文档检查：已核对上游源码与恢复协议；区域引用无缺项、验收ID无重复、Markdown表格列数/围栏/行末空格通过，相对链接目标已通过仓库连接器读取确认。商场运行、真实截图、真机、十分钟/三局负载全部待实施；本次不运行游戏测试或打包，也不修改生成物。CI另以文档PR检查页的实际结果为准。

环境限制：本地终端启动持续返回 `helper_unknown_error: setup refresh had errors`，未能运行本地git status/fetch/分支切换或git diff --check；改用已认证GitHub连接器读取上游main并从同一SHA建立已有fork的独立分支，文档与交接通过连接器提交。未覆盖其他本地文件内容、未推送main、未自行合并或更新Pages。后续应先细化两层格坐标与固定锚点，再单独审阅多层存档兼容方案，不能把文档交付视为系统已经稳定。

## 2026-10-05 RPG 系统逻辑与首版数值设计

维护者要求仅生成文档，以最新上游 main `a34c7a1ba810919fc33d4fce158aba0a028a0f78` 为基线，在独立分支 `docs/rpg-system-design` 新增 [docs/RPG-SYSTEM-DESIGN.md](docs/RPG-SYSTEM-DESIGN.md)，README 增加“设计待实现”入口。原有未跟踪文件 `handoff-current-progress.md` 保留，不纳入提交。

设计覆盖生命、耐力、精神、水分、饱食度、污染、状态效果与负重；三项属性初始 10、永久上限 30，正常行动约积累 0.2 点、高强度经递减约 0.4 点，0.4 为软上限，超出显著递减。失败保留已成功保存的成长，临时针剂不变永久属性。声望只设计通用阵营规则，不命名新阵营；幸运默认 1、隐藏数值，仅叙事暗示，明确保护任务必需物资与救济。

维护者补充的暴击规则已写为“枪械随机爆头”：没有手动头部判定，已命中子弹的轨迹越接近敌人中心、有效技巧与相关 buff 越高，暴击概率越高。首版公式为 2% +0.15%×（有效技巧−10）+8%×中心接近度 +直接 buff，最终 0～25%，伤害倍率 1.5；霰弹逐颗判定，幸运不直接影响暴击。使用归一化轨迹距离，避免首次碰撞圆周位置把中心射击算成擦边。

基地为固定建造点的小型地图，提供免费基础恢复和三级休息、医疗、训练、工作台与黑市设施。恢复／治疗只在角色留在基地期间推进，生产在任意位置推进，二者均支持实际时长离线补算；不设统一离线上限，无无限循环生产。材料启动时扣除，成品空间不足时保留，时间游标与状态同事务提交；新增清洁布料及配方只是设计草案。文档还定义分段计时、重复结算、时钟回拨、故障回滚与未来旧档迁移门槛。

所有新增能力均为拟议设计，数值待试玩验证；本轮不修改源码、存档协议、现有游玩说明、版本号、HTML、ZIP、发布清单或部署。文档中的验收表是未来实现门槛，不是已运行的游戏测试；未运行 `pnpm test`、浏览器测试或 `pnpm package`，纯设计文档不需要游戏打包。

Windows、Node 24.19.0 下实际完成 62 个相对链接及锚点检查、30 个公式与示例计算检查、7 行幸运概率计算、18 张表格共 141 行的列数检查及 11 项基线常量核对，均通过；`git diff --check`、`git diff --cached --check` 与三份文档的变更范围检查通过，提交前再次 fetch，main 未变化。未宣称真人平衡性已验证。普通沙箱终端启动失败，错误为 `helper_unknown_error: setup refresh had errors`，Node REPL 也未能启动；改用获批终端完成工作区检查、源码核对和文档验证。期间出现的其他未跟踪文档同样保留，不纳入本轮提交。

终端缺少 GitHub 推送凭据，已用已认证连接器上传 `LMX-323/escape-bincov:docs/rpg-system-design` 并向上游提交 [PR #13](https://github.com/xuys2025/escape-bincov/pull/13)。初始远端提交 `f8f8a6cd910b5f3c7585ae9aebac8640249a0d47` 与本地验收提交 `2fdcffa908fd95fa6860aa57c11cf16170f86a21` 的完整文件树均为 `ba0c421e2cf3f51e46ff639faa53f1e2205c69bf`；随后仅补记本交付记录。创建 PR 后已确认可合并且 CI 已开始运行，最终结果以 [PR 检查页](https://github.com/xuys2025/escape-bincov/pull/13/checks)为准；未自行合并、未更新 Pages，所有 RPG 能力仍待实现与平衡验证。

## 2026-10-05 建筑逻辑设计（仅文档，设计待实现）

维护者确认本轮只生成文档。fetch 后权威 main 基线为 `a34c7a1ba810919fc33d4fce158aba0a028a0f78`，在独立分支 `docs/building-logic` 新增 [建筑逻辑设计](docs/BUILDING-LOGIC.md)，README 增加标注“设计待实现”的导航；保留原有未跟踪文件 `handoff-current-progress.md`，不纳入本次提交。

设计确定：一楼与室外共图，二楼/地下为独立小地图；普通门双向可开关，关闭挡人、视线和子弹；窗户挡人但允许双向观察/射击，不翻窗、不破坏、不隔窗拾取。入口靠近后按 E 或触控按钮确认，明确目的地、反向入口、落点与输入释放。敌人支持“追击事件＋离层冻结”：仅目击入口的敌人按路径/速度加 1 秒延迟追入最后目击地图，抵达未激活地图后冻结；全局计时与潮汐继续，暂停时一起停止。

文档补齐门洞占位、两格落点搜索、连续换层、事件敌人唯一性、物资全局预算、原子提交与失败回滚、各地图恢复和旧世界保留规则，附居民楼示例、字段说明表与后续验收清单。所有新行为都是设计，不代表当前试玩已实现；本轮没有修改源码、存档协议、游玩手册、版本号、构建产物或部署。

本轮核对源码事实与规则一致性；59 个文档相对链接、开发手册验证矩阵锚点和 `git diff --check` 实际检查通过。游戏测试与 `pnpm package` 未运行（纯设计文档，且维护者明确不更新游戏包）。普通沙箱终端启动失败，使用已获审批的终端执行读取和 Git 操作。后续实现需要完整跨层/存档/旧客户端验收与真人手感验证；本轮文档 PR 的 CI 状态以 GitHub 为准，不自行合并或更新 Pages。

已通过个人 fork `LMX-323/escape-bincov:docs/building-logic` 向上游提交 [PR #12](https://github.com/xuys2025/escape-bincov/pull/12)。终端缺少 GitHub 凭据，使用已认证连接器上传三份文档，并逐字核对与本地一致；首个完整远端提交为 `5e991c178262489dd34508311afd4e52a70be8ad`，随后只追加本段交付记录。CI 实际结果见 [PR 检查页](https://github.com/xuys2025/escape-bincov/pull/12/checks)，不以本地文档检查代替 CI。未合并、未部署。

## 2026-10-05 美术重绘实现（PR #11）

维护者明确要求开始执行，并逐图检查精细度、辨识度及统一风格。重新 fetch 后 main 仍为 `a34c7a1ba810919fc33d4fce158aba0a028a0f78`，继续原独立分支和 [PR #11](https://github.com/xuys2025/escape-bincov/pull/11)。[实现记录](docs/ART-REDRAW.md)包含全部 20 件物品、5 类角色、15 栋建筑和剩余范围；下方调研记录是实施前历史。

重绘 24px / 32px 两套共 40 件物品纹理，分开三弹药、两医疗和三瓶；重绘玩家武器姿态、4 敌人/遗体、满空箱、包裹、告示、2 商人和世界材质，统一 6 个 SVG。增加寒蝉 16px 离线子集（更名 Bincov Text、完整 OFL、738 字符 / 30,576 字节），构建校验字符覆盖和哈希。库存短名 16px、格子 54px，桌面整备使用视口空间；战斗保持整数倍 960×540。存档 ID、协议、地图碰撞、随机和经济规则不变；箱子图形仅读取已提交内容，尸体在恢复时选择对应纹理。

Linux / Node 24.19 / pnpm 11.19 / Playwright Chromium 153.0.8010.12：规则 109、浏览器 24、键鼠 10、UI 38、主菜单 16、存档 9、搜刮 44、移动恢复 10、移动体验 11、便携 6 均通过；可选历史 HTML 的两项迁移用例未运行。新增美术专项检查 80 张运行纹理、6 组断言并纳入 CI。真实十分钟自动试玩 14 局（8 次撤离、6 次死亡）、46 个容器、56 次转移；无页面异常/外部请求。独占浏览器 ABBA 性能对比未见明显系统性退化，详细区间和方法见实现记录，不承诺真实设备 60 FPS。类型检查、离线打包及制品清单已更新。

逐图查看原尺寸、放大和灰度资产，以及桌面两尺寸、角色八角度、五区与水产站。修正小号弹药裁边、低能见度整体染色和短屏详情挡头；验证脚本同步新版整备几何并保留战斗画布断言。审查场景显式暂停模拟、定位镜头，截图不作后期编辑；纹理排列与自然游戏截图分开标明。主菜单既有夜港全景检查后复用到整备/结算，未把已有画记为本次重画。

剩余：真人盲测、色觉障碍用户测试、手机真机和主观审美评价未完成；角色仍为静态姿态旋转，矩形房间地图和原有潮水/战斗特效保留。地面包裹须靠近看名称。CI 状态以 PR 最新检查为准；不推送/合并 main、不部署 Pages。

## 2026-10-06 PR #11 美术成果归档与主线整合

维护者授权在原 PR #11 完成收尾。以已合并 #20 的 main `9fe189cbb7114a54dbfd7d1670524f0c7b3d2a34` 为基线，保留原分支全部父历史，追加整合提交。核对后，15 个原变更文件与主线完全一致；其余运行代码、字体、构建、CI、HTML、ZIP 和制品清单采用当前主线。归档 63 个独有研究、字体试排、逐图审查和截图证据文件，四份研究文档补充历史状态说明。旧 `src/art.css` 已由主线 `src/tactical.css` 承接，不重新加入；也不重复添加美术 CI。

本次没有新增或撤销游戏功能。历史原图、报告和未验证事项保持原样；PR #18 的原型及 PR #20 的实装分别保留出处。本地三方差异和相对文件链接已检查；最终树逐文件核对运行文件与基线一致。最新整合提交的 CI 结果见 [PR #11 检查](https://github.com/xuys2025/escape-bincov/pull/11/checks)，旧分支绿色结果不替代本次检查。其他 agent 的 #10、#16、#17 分支不变。

## 2026-10-05 深入美术重绘计划（PR #11 追加）

维护者认为初轮改进不够深入，要求精心重绘 SVG/字符图形，形成统一且有特色的风格，并先制定计划。重新 fetch 确认最新 main 仍为 `a34c7a1ba810919fc33d4fce158aba0a028a0f78`；继续独立分支 `docs/art-direction-research` 和开放的 [PR #11](https://github.com/xuys2025/escape-bincov/pull/11)，未合并 main。

新增[深入重绘计划](docs/ART-REDRAW-PLAN.md)：区分 4 个内联 SVG 定义与 Canvas 像素资产；核对 20 物品、5 类角色（玩家及 4 敌人）、15 建筑、5 区域。发现怀表有腕带、泵机零件缺少泵壳结构、陶瓷保险管偏玻璃质感等具体问题。逐件规定轮廓/结构/材质，逐区规定地标和用途；以沿海县城的盐蚀、修补、值守灯光贯穿角色、世界、菜单和界面。重绘应先做同屏样板，初轮“字体先行”的顺序及 11–19 人日估算被替代为 R1–R5、核心 30–46 人日，样板后修正估算。

新增原样纹理图录与诊断脚本：加载 SHA-256 守卫保护的 main HTML，经显式 `?test=1` 读取 32 张运行纹理，在独立诊断页展示 1×/3×，不是游戏截图或重绘效果。Linux / Chromium 151.0.7922.173 / DPR 1 执行成功，32 张纹理、0 页面异常、0 外部 HTTP 请求；PNG 已人工查看，尺寸与哈希见 `docs/art-research/textures.json`。文档相对链接、数量、脚本语法、图录哈希与 `git diff --check` 已检查；新增内容不改游戏源码、依赖、HTML/ZIP，未重复运行领域测试或打包。较早提交的 109/109 单元及字体试排仍为历史实测，当前 CI 以 PR 最新提交检查为准。

剩余：真实器物参考板、R1 样板和后续重绘均未制作；“没有 AI 味”转化为结构正确、轮廓辨识、有因果的磨损、逐像素修整与跨素材一致性，不声称来源检测或纯手工证明。真人辨识、正式字体集成、性能、跨界面和真机验收待实施阶段。维护者追加强调图标能见度差、意义不明确后，计划将这两项升为第一验收目标；实测 9mm/卡宾弹 PNG 完全相同，三种瓶体有效宽度在 24px 显示框内仅理论 10.5px。首批改为 12 件代表物品（覆盖三弹药、两医疗、三瓶全部混淆组）及真实 48px 格子试排，先辨识再精修，保留名称/用途文字。本轮仍只交付计划，未更新正式试玩。

## 2026-10-05 美术专项调研与计划

唯一基线为最新 main `a34c7a1ba810919fc33d4fce158aba0a028a0f78`，独立分支 `docs/art-direction-research`。按维护者「先调研、列出计划」的要求，本轮新增 [美术专项计划](docs/ART-RESEARCH-PLAN.md)、基线诊断及截图证据，没有实现游戏视觉改动。

调研覆盖字体与缩放、UI 组件、20 种物品图标、HUD/搜刮、地图、角色、场景及结算。确认 720p 物品短名为 9px、任务正文为 10px，1080p 随画框放大两倍；32px 图标在格子中按 24px 显示；DOM/Canvas 字体声明不一致。初轮建议保留暗绿夜港方向，按字体/基础界面 → 图标/HUD/地图 → 角色/场景 → 叙事界面分期；该实施顺序已被上方深入重绘计划替代。初轮核对 Noto CJK 与 Fusion Pixel 官方来源，后续字体专项追加见下段。短屏搜刮详情遮挡头部与待审 QOL PR #10 有交集，后续统一安排实现。

本地 Linux / Node 24.19.0 / pnpm 11.19.0 / Chromium 151.0.7922.173：`pnpm test` 退出 0（环境汇总 11 个文件），同一测试集用 `--test-isolation=none` 明细执行 109/109，通过严格类型检查。通过 HTTP 加载未经修改的 main HTML，采集桌面两尺寸和手机横屏两尺寸共 26 个画面，人工查看并保存 8 张；无页面异常或游戏外部 HTTP 请求。诊断使用新存档、种子 42、显式位置/敌人就绪夹具及触控模拟，不是自然实战或真机验收。

`pnpm test:ui` 被当前浏览器的 `file://` 管理策略阻塞（`ERR_BLOCKED_BY_ADMINISTRATOR`），未修改脚本或断言，不能记为通过；原始错误和 109 项测试日志保留在 `docs/art-research/`。纯调研无需重新打包，游戏源文件、依赖、HTML/ZIP 及制品清单均保持基线。相对链接、源码锚点、命令、JSON、截图哈希及差异检查已核对。PR CI 状态以检查页为准，不能用本轮基线诊断替代。

维护者随后明确要求选出一个兼顾画风和易读性的字体。本轮追加 [字体专项结论](docs/FONT-RESEARCH.md)：推荐寒蝉点阵体 16px Regular，实测与 Noto CJK/缝合像素体的等字号字形、720p/1080p 商店试排、738 字符覆盖及子集大小。候选 30,928 字节 WOFF2，纯字体 CSS 内联增加 41,364 字节；没有字形缺失。试排与字体工具只用于调研，未写入游戏。所有视觉实施、正式字体集成、全界面动态文字、真人辨识和性能/真机验收仍待后续阶段。本轮只提交调研 PR，不直接推送或合并 main，不发布 Pages。

## 2026-10-05 箱子与尸体双栏搜刮

任务分支 `codex/loot-containers`，最初基线 `702692a`；完成原型后重新 fetch，并接入最新 main `0a69908313c483d38f99f9260536055706beea94`。主线已新增行动恢复和旋转库存，维护者明确确认：沿用恢复机制，容器余量随行动保存；手机复用现有“选物品 → 移动格位 → 点目标格”，桌面仍手动拖放。

箱子/尸体按 E 打开，左侧 6×5 来源，右侧背包和安全箱。精确格位、整组转移、双向放回、占格预览、已搜空标识；计时、敌人、潮汐和伤害继续，玩家停止移动和攻击。关闭、死亡、超时、失焦或冲突会清理拖放状态，释放原按键后才可继续操作。散落物仍 E 快捷拾取，撤离保持优先。

原投放随机顺序不变，最多10箱各接收2份原物资，至少40份散落；任务与浅滩物资不搬动。敌人首次死亡把原掉落放进一次生成的尸体，不额外增产。`SaveSession.transferLoot` 将角色与候选容器写入同一次完整检查点，写入成功才发布来源变化；失败回滚、暂停并可重试。新世界标记 `coast-v2`；旧 `coast-v1` 快照仍恢复原地面物资，不补生成箱子。旧 HTML 拒绝新世界标记，防止静默丢失容器；主档键、外层会话/备份版本不变。另修复旋转救济物品安全箱比对受字段顺序影响的问题。

本地 Windows、Node 24.19.0、pnpm 11.19.0、Chrome 154.0.8037.93：规则109/109、严格类型及打包、浏览器24/24、桌面输入10/10、UI38/38、主菜单16/16、存档9/9、手机恢复10/10、手机体验11/11、便携6/6通过。最终搜刮45/45通过（桌面40+触控4+真实旧main迁移1）；包括占格预览、失焦取消和真实跨窗口事件。自动试玩约10分19秒，两局均撤离，打开42个容器、完成35次转移、击败32名敌人，未出现页面错误或外部请求。完整行为与证据见 [docs/LOOTING.md](docs/LOOTING.md)。

已通过 `LMX-323/escape-bincov:codex/loot-containers` 向上游提交 [PR #9](https://github.com/xuys2025/escape-bincov/pull/9)。终端缺少 GitHub 凭据，改用已认证连接器上传；初始远端提交 `25fb59baef221db34b928bfab75e0ab00cb93b53` 的整棵文件树与本地验收提交 `21ae1e2` 完全一致（`d2e81a9016a5389742d4fd8d875c6c858a1c42ee`），随后仅更新交付记录。GitHub CI 因首次外部贡献等待上游维护者批准，状态 `action_required`，尚未执行；最新结果见 [PR 检查页](https://github.com/xuys2025/escape-bincov/pull/9/checks)。未推送或合并 main，未更新 Pages。手机真机和真人手感仍未验证。

## 2026-10-04 PR #7 合并后：移动故障注入测试时序补修

PR #7 已于 `12624b1d14f38b3c2b4221532cb530c168d906c9` 合并。PR CI 通过，但 [main CI #26](https://github.com/xuys2025/escape-bincov/actions/runs/37210621393) 两次分别在医疗按钮和旋转格位点击前超时，Pages 均未部署。失败日志均显示目标被移出 DOM；第一次附件处于存档保护页。本地定向复现确认：提前替换 `Storage.setItem` 后，周期保存先触发 `checkpoint-error`，玩家生命与背包仍完整，测试来不及执行目标点击。

以该 main 为唯一基线，在 `fix/mobile-fault-injection-timing` 补修测试。共用 `scripts/storage-fault.mjs` 在目标可信 click 的捕获阶段启用写入失败；点击前的周期保存保持正常。每次布置后先等待一次真实自动保存，主动覆盖慢输入窗口；恢复存储时断言目标确实发生了失败写入。医疗、丢弃、附近拾取和旋转用例继续使用真实触控和原有完整回滚断言，无强制点击、重试包装或放宽超时。

本地 `pnpm test` 76/76、`pnpm test:mobile` 10/10、携带真实 v0.2.0 HTML 的 `pnpm test:mobile-ux` 12/12 通过；`pnpm package` 通过，游戏 HTML、ZIP 与制品清单无变化。补修仅涉及测试脚本与本交接，不改游戏代码、存档协议、自动保存行为或 CI 门槛。CI 和部署状态以补修 PR 及后续 main 的 Actions 为准；手机真机验收仍待补充。

## 2026-10-04 审阅追加：短屏拾取成功消息遮挡警告（PR #7）

重新 fetch 后 main 仍为 `4d7e6173a0a3a6ee0df3d7e113d4f0a984e364b2`，继续同一独立分支。确认候选 `014579f` 在 640×300、三件物资拾取后显示「附近 2」时，成功消息覆盖止血警告 3840 CSS px²。新增测试在旧构建上失败，原两件物资用例因拾取后不再显示附近按钮而漏测。

手机横屏成功消息改为暂用电台区域，淡出后恢复电台内容；附近面板与警告留出左右按钮及安全区。源码与回归提交 `d8820b9485e910f5c0d9588d0ed72c830ef1c4d6`。新用例包含十种横屏尺寸和三个安全区组合，13 种组合、26 次拾取后测量，检查警告/成功消息不遮挡 HUD 和控件、附近列表实际点按、连续拾取计数以及电台恢复。

本地重新执行单元 76、浏览器流程 24、桌面输入 10、UI 38、主菜单 16、存档专项 9、移动恢复 10、移动体验 12（含实际旧 HTML）、便携 6 项，全部通过；共 201 项。pnpm package 通过并更新两份 HTML、两种 ZIP 与清单。原始失败、最终构建哈希、报告和实际前后截图在 `docs/mobile-experience/short-screen/`；首轮证据仍作为历史保留。两种桌面尺寸和 640×300（含安全区）截图已人工查看。

未追加修改存档协议或战斗规则；未做手机真机、浏览器栏、系统文件操作和十分钟自然实战验证。PR #7 继续等待审阅，不合并、不改正式 Pages；最终 CI 状态以最新提交 Actions 为准。

追加 CI 测试修订：#24 的三件物资遮挡检查通过，但附近面板往返超过 1.5 秒，连续计数「×2」等待超时。附件确认两件物资均已拾取；现将列表点按与快速连续拾取分开，重新放置三件物资后紧接两次可信触控，再检查计数与恢复。保持游戏 1.5 秒显示时间及所有几何断言，本地移动体验再次 12/12 通过。游戏 HTML 和 ZIP 字节未变；最新脚本哈希与报告更新到 short-screen 目录，失败 CI 记录保留。

## 2026-10-04 移动体验修复实现与完整验证（PR #7，追加修复前）

维护者已授权「开始修复，仍放在 PR #7 等待审阅」。以最新 main `4d7e6173a0a3a6ee0df3d7e113d4f0a984e364b2` 为唯一基线，继续独立分支 `docs/mobile-loot-feedback-plan`，没有合并、打标签或改动正式 Pages。下方核实与计划记录均为实现前的历史。

已完成 P0–P2：清理格位摆放残留，固定背包/详情出口和安全箱入口；拾取消息避开附近物品与控件，触控提示使用按钮说明；短屏阅读正文与换弹秒数可读；附近物品逐 UID 选择并校验范围/视线，保留部分拾取；药品面板明确背包/安全箱及救济来源，点选消耗对应物品实例，快捷治疗原来源与优先级不变；长方形物品旋转及自动尝试另一方向，安全箱容量不变。

方向语义提升为 session 3 / profile 2 / raid 2，存档键仍为 `escape-bincov.session.v2`，Web Lock、冲突保护和原子提交不变。保留旧 session 原始字节在 migrationBackup；旧 HTML 拒绝新记录且不覆盖。迁移、碰撞、UID/来源、写入失败、备份及安全箱失败结算均有对应验证，协议已同步 `docs/MOBILE-IMPLEMENTATION.md`。

本地实际执行单元 76 项、浏览器完整流程 24 项、桌面输入 10 项、UI 38 项、主菜单 16 项、存档专项 9 项、移动输入恢复 10 项、新移动体验 11 项（含真实 v0.2.0 HTML 迁移/回退）、便携 6 项，全部通过；共 200 项。pnpm package 严格类型检查、两个 HTML、两个 ZIP 和制品清单通过。新增移动体验脚本纳入 CI，默认 10 项。实现、报告、最终构建哈希与实际截图见 [修复记录](docs/MOBILE-EXPERIENCE-FIXES.md) 和 `docs/mobile-experience/verification.json`。

截图已人工查看：两种桌面尺寸、844×390 和 740×300；新回归还覆盖 340/341px 临界高度及非零安全区。环境 Linux、Node 24.19.0、pnpm 11.25.0、Chromium 138 / SwiftShader；仓库和 CI 仍固定 pnpm 11.19.0。浏览器是仿真，物品/位置/敌人冷却是显式夹具。

剩余：iPhone Safari、Android、QQ 真机、系统文件操作与热稳定性；仅改变视口高度触发暂停的现有策略保留，浏览器栏风险待真机验证。本轮未重跑十分钟自然实战，未改战斗数值、AI、潮位和时钟。PR #7 保持开放待审，CI 以最新提交 Actions 为准。

## 2026-10-04 移动体验反馈核实、关联排查与计划（PR #7）

基线为最新 main `4d7e6173a0a3a6ee0df3d7e113d4f0a984e364b2`（v0.2.0），独立分支 `docs/mobile-loot-feedback-plan`。本轮按维护者最后的具体要求核实截图并给出修改计划，只提交文档、基线诊断脚本和实际截图，没有实现计划中的功能，也不合并或发布。

确认：2×2 安全箱无法同时容纳固定横向急救包和固定竖向净水瓶，两种顺序和全部四种位置组合均失败；最近且放不下的地面物品会挡住其他可叠加物品。手机治疗按钮已存在，在五档横屏中可见且能实际回血；但它只读取背包绷带/急救包，安全箱药品要打开背包选用。不能根据聊天截图判断 QQ 内置浏览器或用户所用版本是否发生额外显示问题。

推荐方案、根因、复现和验收门槛见 [移动体验核实与修改计划](docs/PLAYER-FEEDBACK-PLAN.md)。保持 2×2 容量、治疗数值、背包不暂停及旧快捷治疗来源规则。新增方向不能仅改 CSS，必须同步 `cleanInventory`、`checkpointSafe`、备份和完整行动恢复。

维护者随后补充实际触控游戏截图，指出底部通知挡住附近物品、流血横幅仍提示 Q。两处已在同一基线复现，并追加到本 PR：五档横屏的拾取成功提示完全覆盖附近物品名称文字；绷带详情同样残留「按 Q 使用」。新增 8 项提示/文案观察，报告与独立脚本在同一证据目录。新增截图也清楚显示现有「治疗」按钮。原始截图不进入公开仓库，提交的是本地复现画面。

维护者进一步要求本 PR 重点提升移动游戏体验、从反馈向外排查。本轮扩展 22 项实际观察，新增确认：局内「移动格位」无取消，关闭重开后因残留 placement 状态导致所有物品无法选中；五档横屏的背包关闭按钮和安全箱需要先滚动；740×300 详情关闭入口也在屏外；短屏阅读正文和换弹状态被 CSS 隐藏；667×375 附近面板与战斗按钮边缘相交。保持宽度仅减小高度 10px 会触发暂停，但只能列为浏览器栏相关的模拟风险，未声称真机已复现。地图退出、暂停冻结、注入安全区的按钮命中通过，既有 `pnpm test:mobile` 重新运行 10/10 通过。

更新实施顺序为 P0 操作卡死/固定出口/提示与短屏反馈 → P1 附近物品选择与药品入口 → P2 旋转收纳及存档迁移；旋转工作不阻塞前面的手机修复。触控精瞄差异、控件自定义、振动/全屏/PWA、平板和性能真机评估不顺带实施。证据在 `docs/feedback-20261004/flow-report.json`、`verify-mobile-flow.mjs` 及两张新增截图；脚本仍是记录基线的诊断，不作为未来 CI 的修复成功断言。PR #7 当前依然是核实与计划，游戏功能尚未改动。

本地实际执行 `pnpm test` 71 项、`pnpm package`、`pnpm test:mobile` 10 项，全部通过；12 项专项观察完成，生成物与基线无差异。环境为 Linux、Node 24.19.0、pnpm 11.25.0、Chromium 138.0.7204.0，仓库版本约束未改。可重复的基线诊断、报告和三张真实截图在 `docs/feedback-20261004/`，私人聊天截图没有提交。诊断脚本记录当前限制，不作为未来修复的 CI 成功标准。

剩余工作是实际实现和真机验收；手机 Safari、Android、QQ 内置浏览器均未实测。本地未重跑全套桌面/存档/便携及十分钟自然实战，PR CI 结果以对应 Actions 为准。原有测试通过不表示上述能力缺口已经修复。

## 2026-10-04 v0.2.0 发布准备

维护者要求把前五个 PR 合并为一个版本，并提供全面、面向玩家的发版公告。本轮唯一基线为最新 main `ba2d3cdc28923d09d0e45612ff4098e0aef592fe`；已确认 PR #1–#5 均已合并且在基线历史中，main 的 CI & Pages 运行 `37194627674` 成功。以下关于「PR #2 未合并」的表述均是历史阶段记录。

独立分支 `release/v0.2.0` 将 package、主菜单版本和当前游玩说明统一为 0.2.0；新增 [完整发版公告](docs/releases/v0.2.0.md)，将 CHANGELOG 从移动候选汇总扩展为前五个 PR 的整版记录，修正 README 中已经过时的待合并说明。公告覆盖界面、夜港、手机触控、行动恢复、存档保护、桌面修复、下载升级和已知限制；手机仍明确为尝鲜，未声称真机验收完成。游戏源码仅改版本标签，没有改动玩法、存档格式或依赖。

本轮实际验证：`pnpm test` 71 项、`pnpm test:title` 16 项、`pnpm test:desktop-input` 10 项、`pnpm test:portable` 6 项均通过；`pnpm package` 包含严格类型检查并重新生成两个 HTML、两个 ZIP 及发布清单。ZIP CRC、入口逐字节一致性、文件大小与 SHA-256 全部核对通过，两个桌面尺寸的真实主菜单截图已人工查看，均显示 v0.2.0。环境为 Linux、Node 24.19.0、pnpm 11.25.0、Chromium 138.0.7204.0；仓库和 CI 仍固定 pnpm 11.19.0。本地截图和报告位于忽略的 `test-results/`，PR CI 将重新生成完整可下载证据。

本轮未重跑十分钟自然实战；未改战斗规则，历史 PR #2 已有相关证据。iPhone/Android 真机、系统打断、持续热负载和大陆网络仍待验收。发布准备通过 PR 合入；GitHub Release、标签和 Pages 的实际发布状态应查对应 GitHub 记录，不以本条准备记录代替发布成功证据。

## 2026-10-04 PR #2 桌面回归修复

本轮以最新 main `1930073` 为唯一已接受基线，读取根规范和开发手册，在独立本地分支 `fix/pr2-desktop-regressions` 修复原 PR #2 `585705a`。交付仍追加到 `docs/mobile-adaptation-2026`，不新开重复 PR，不强推、不合并 main。三处核心用例先在 main 通过，再在原 PR #2 全部复现失败，修复后全部通过。

修复触屏电脑被错误切入手机模式并失去键鼠、Esc 恢复行动但没有恢复音频，以及无效治疗触发世界回滚时清空持续按键的问题。手机布局也保留键鼠输入，右键精瞄加左键射击仍按下单发，触摸兼容事件不会伪造鼠标射击。同步回滚不再释放输入；读档、暂停、失焦和保存故障仍清空旧输入，库存与世界回滚不变。

新增 10 项 `test:desktop-input` 并纳入 CI，另补 1 项手机多指无效治疗与 2 项纯输入测试。本轮 187 项短回归全部通过；包括单元 71、桌面 24、UI 38、标题 16、存档 9、移动 10、便携 6、桌面输入 10、真实新旧 HTML 共存 3。约 10 分 23 秒真实计时自动流程通过，两局共一次撤离、一次战斗死亡结算、40 次击杀，无错误或运行时外部请求。严格类型检查、制品哈希/ZIP CRC 与差异检查通过。HTML 为 1,669,035 字节，两个 HTML、两个 ZIP 和发布清单已重新生成。

三项源码修复、回归测试、打包及文档分别提交。前后对照、方法、环境和真实桌面截图见 [桌面回归修复](docs/DESKTOP-REGRESSION-FIXES.md)。当前三处报告问题已关闭，未发现自动检查中的新增阻塞；iPhone Safari / Android 物理设备、音频试听、系统打断和热稳定性等原有移动候选验收仍待完成。CI 结果以 PR #2 最新 Actions 为准，本任务不更新正式 Pages。

## 2026-10-04 移动候选版实现 · PR #2

维护者授权在原 PR #2 实现并保留原子提交。已接入最新 main `1930073`，保留 PR #3 的 SaveSession 边界、PR #4 的海港主菜单及 PR #5 的玩家文案；完成统一输入、双摇杆与手机按钮、横竖屏整备、列表/格位库存、生命周期暂停和完整局内恢复。所有运行资源仍内联，绿色像素画风与桌面单发操作保留。

主档迁至独立 `escape-bincov.session.v2`；旧键与原始字节保留。装备扣账、世界检查点及终局提交均使用同一记录，写入失败回滚库存与世界；刷新从主菜单恢复最近成功检查点。未知/损坏版本不覆盖，第二个新版窗口只读；旧版写入不会覆盖 v2。后续修改必须遵守更新后的 AGENTS 和 [恢复协议](docs/MOBILE-IMPLEMENTATION.md)。

当前本地结果：69 项代码测试、24 步桌面流程、38 个 UI 场景、9 项移动专项、9 项存档专项、6 项便携检查、16 项标题检查全部通过；两份真实新旧 HTML 的 3 项共存验证通过。主菜单接入前还完成约 10 分 23 秒自然计时自动流程，两次撤离、30 击杀；接入后复跑全部短流程。实际截图、原型测量、方法与汇总在 `docs/mobile/`，当前制品哈希见 `docs/release-manifest.json`。最后接入 PR #5 的文案约定，保留移动与恢复语义，复跑全部短流程；最终提交由 CI 完整复验。

CI 首轮移动专项暴露测试夹具竞态：恢复的 0.8 秒换弹会在医疗故障注入前后正常移动弹药，使两次负载快照不同。修正为等待该换弹完成再开始事务测试；恢复换弹计时的精确比较、失败事务的完整回滚断言均保留，不改游戏行为。修正后本地 9 项移动专项通过，远端结果以最新 Actions 为准。

功能、修复、测试、协议文档和打包分别提交；三个同步 main 的合并提交保留父历史，不做 squash。新增 [CHANGELOG.md](CHANGELOG.md) 的 Unreleased 区，供后续按提交整理发布日志；版本号暂留 0.1.1，没有擅自发布标签。

**状态：移动候选版，待真机验收与维护者审阅。** iPhone Safari/Android 的物理多指、系统打断、后台回收、音频、文件与软键盘，以及 20 分钟热稳定性、大陆三网均未实测；鸿蒙/微信后续独立验收。未合并或部署 PR #2，CI 状态以最新 Actions 为准。下文为历史阶段记录，其“计划未实现”或旧版中断规则不再代表本候选版。

## 2026-10-04 移动端适配计划

**本轮审阅修订取代下述初稿方案。** 维护者已确认 D1 手机按住连续开火（原伤害/冷却/耗弹不变）、D2 新格式行动支持检查点恢复（包括手动刷新，可回退少量未提交进度）、D3 iPhone/Android 系统浏览器先发，鸿蒙/微信独立扩展。

自审发现九项问题，已在计划第 0 节登记。主要修正：生命周期前移；完整局内快照和存档版本保护先于正式触控；取消无实测依据的性能硬门槛；补上长帧计时、场景小字、短屏退路和分阶段验证。当前 v1 只有 seed/runId 而无完整快照，未知存档版本会走新档逻辑；新格式上线前必须验证原子提交、旧客户端兼容、迁移与安全回退。所有这些仍是计划，本轮没有改游戏或存档代码。

原 10–14 天初估撤回；新增本局恢复后暂估 13–21 个工作日，M0 的 1–2 天风险原型完成后重新收敛。新顺序：M0 风险原型 → M1 视口/输入/生命周期 → M2 检查点与迁移 → M3 触控战斗 → M4 整备库存 → M5 性能/真机/发布。修改继续放在 PR #2，不新建重复 PR，不自行合并。

以 UI 精修合并后的 `f4c50bdf1ae7cd6a1c1309ea77aa765169ac4b6b` 为基线，在 `docs/mobile-adaptation-2026` 分支编写 [docs/MOBILE-ADAPTATION-PLAN.md](docs/MOBILE-ADAPTATION-PLAN.md)。本轮只有计划、README 文档导航与交接记录，不改变游戏源码、存档、构建产物或当前手机支持声明。

初稿面向 2026 年仍在使用的 iPhone、Android 中端/大屏和鸿蒙手机，提出横屏战斗、横竖屏整备、独立触控层、点击式库存、后台恢复和真机性能验收；初稿的阶段安排与 10–14 天估算已被上方审阅修订取代。来源采用厂商规格、Phaser、MDN 与 WebKit 文档；硬件规格不等于本游戏兼容性。

本轮验证为源码事实、相对链接、资料来源与 Markdown 差异检查；本地未重跑游戏测试或打包，因为只有文档改动。PR 的自动 CI 结果以 Actions 为准。移动端代码、真机多指/音频/文件测试、热衰减和大陆三网测试均尚未开展。下一步从 M0 测量与输入原型开始，按阶段提交独立 PR，不得将本计划标为已实现。
## 2026-10-04 玩家可见文案校对

基线 `702692a0c6d79ea5d51a291eac60f16013ab0688`（已合入主界面 PR #4），独立分支 `agent/player-copy-pass`。检查主菜单、站内五个页签、行动 HUD、背包、地图、指南、结算、存档和错误提示，连同悬浮提示、读屏标签、20 种物品、3 项任务及地图留言一并校对。同步 README、游玩手册与便携包说明；新增 [文案约定](docs/COPY-GUIDE.md)，统一正式名称、短名、按钮与状态用词。

修正指南误称「解毒剂」、音量误称「电台音量」、失败损失描述不完整、导入备份的覆盖范围不清，以及「流血 · 状态稳定」的矛盾提示。无主武器时标为「随身匕首」；交易、任务、扩建、转移、治疗拒绝提示说明具体条件，不再统一要求检查现金和空间。保留海港怪谈氛围，减少抽象抒情句、装饰编号和无用途的坐标。

验证：59 项单元测试、24 步浏览器流程、38 个 UI 场景、16 组主界面检查、9 项存档专项、6 项便携检查均通过；另做 20 种物品的双分辨率文案/按钮检查与三类存档弹窗检查。新增的两处回归断言验证流血状态提示及无效治疗不消耗物品、也不覆盖具体提示。两个 HTML、两个 ZIP 和发布清单已由 `pnpm package` 重新生成。

没有修改存档结构、ID、玩法数值或会话事务；去除文案字面量后，domain/world/art/main/save-backup 与基线完全一致。截图、措辞对照和环境见 [校对记录](docs/COPY-REVIEW.md)。未执行十分钟实战、手机真机、屏幕阅读器和功耗检查。按独立 PR 交付，不自行合并 main。

## 2026-10-04 夜港主界面

起始基线 `f4c50bd`；提交前接入已合并 PR #3 的最新 main `a4de2421115d56d491c7eed34ba1293ba8ceae73`，独立分支 `agent/harbor-title-screen`。重绘暗绿像素夜港，增加月光、云层、远港起重机、水产站暖窗、潮水倒影、码头和归来者；主标题、整备入口与电台短句形成独立构图。新美术由原生像素绘图代码产生，四张纹理缓存复用，三项轻量动画可关闭，并遵循系统减少动态效果。没有新增依赖或运行时网络请求。

主菜单改为视口布局，包含手机横竖屏、安全区和最小 44 CSS px 点击区域；进入水产站后恢复原有 960×540 游戏缩放。修复菜单 Tab/Space 被全局游戏快捷键拦截的问题，指南支持焦点约束和关闭后焦点恢复。主界面适配不代表战斗或库存已经具备手机触控能力。

本地验证：59 项规则测试、24 步浏览器流程、38 个 UI 场景、9 项存档专项、6 项便携检查通过；新增 `pnpm test:title`，覆盖 12 种视口及动态/生命周期/旋转检查，并纳入 PR CI。接入最新共享状态与会话结构后，重新打包并复跑完整验证。最终 HTML 1,626,522 字节，相比基线增加 22,756 字节（1.42%）。代码与旧存档格式、结算规则及离线能力保持兼容。

真实前后截图、执行环境、性能测量边界与报告见 [docs/TITLE-SCREEN.md](docs/TITLE-SCREEN.md)。尚未做 iOS/Android 真机、持续功耗和大陆三网实测，未重跑十分钟真人手感/平衡性评估。当前任务按 PR 交付；不得自行合并或覆盖线上 Pages。相关移动端规划及其他并行分支仍由维护者单独审阅，不作为本次基线。

## 2026-10-04 应用状态与存档会话重构

基线 `f4c50bdf1ae7cd6a1c1309ea77aa765169ac4b6b`，独立分支 `agent/core-foundation-refactor`。抽出 `src/app.ts` 组装共享状态，以及不依赖 DOM/Phaser 的 `src/session.ts`，统一出击、物品事务、结算重试、导入、救济、音量和冲突状态。UI 保留模板、交互、提示及场景切换；出击候选先写入再发布，物品事务在拒绝、异常和存储失败时恢复存档、负载及生命状态。

存档键/格式、备份版本、领域与战斗规则、地图、样式和美术均未改变，没有新增依赖或运行时网络请求。对比基线的 23 个 UI 模板字面量完全一致；HTML 增加 1,318 字节（约 0.08%）。两份 HTML、两个 ZIP 和 `docs/release-manifest.json` 已重新打包，内容、CRC、字节数及 SHA-256 核对通过。后续扩展示例见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，开发手册的源码地图已同步。

本地实际验证（Linux x64、Node 24.19.0、pnpm 11.25.0、Playwright 1.63.0、Chromium 138.0.7204.0 / SwiftShader）：

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 59/59，通过；新增 12 项无 DOM 的会话测试，保留原 UI 流程测试 |
| `pnpm package` | 通过，包含严格 TypeScript 检查 |
| `pnpm test:browser` | 24/24，通过；1280×720 和 1920×1080 |
| `pnpm test:ui` | 38/38，通过；两种分辨率截图，人工抽查整备、站内设置及待保存弹窗 |
| `pnpm test:save-browser` | 9/9，通过；新增失败出击及真实同源双窗口冲突/备份 |
| `pnpm test:portable` | 6/6，通过；解压后普通入口离线操作，无测试接口/外部资源请求 |
| 文档链接、模板对比、制品哈希、`git diff --check` | 通过 |

环境说明：`pnpm exec playwright install chromium` 的 CDN 下载在此环境返回无效 ZIP，改用已可用的 Chromium，通过既有 `BINCOV_CHROME`/`BINCOV_CHROME_ARGS` 配置执行；未修改断言或仓库依赖。项目及 CI 的 pnpm 版本仍固定为 11.19.0。本地诊断和截图在忽略的 `test-results/`；PR 的 CI 会重新生成可下载报告，以对应 Actions 结果为准。

未运行十分钟 `test:play`、手机真机及大陆网络实测；本次没有修改战斗、AI、潮汐、持续负载或输入规则。当前没有发现阻塞回归。输入/战斗/HUD 仍在 `game.ts`，UI 模板与事件仍在 `ui.ts`，后续按具体需求分步拆分。按 PR 交付，未合并或更新正式 Pages。

## 2026-10-04 界面精修

基线 `a0345e8df55c9ea50b2985b0ba549be38bc676c6`，独立分支 `agent/ui-polish`。保留暗绿像素场景与原有玩法，统一整备导航、物品格、详情面板、交易行、任务进度、站内设置、HUD 和弹窗。主要修正物品名称/数量重叠、长内容与出击底栏挤压，以及重复装饰标题占据操作区域的问题。

新增 `pnpm test:ui` 并纳入 CI：两种分辨率共 38 个界面场景；同时验证名称/数量不重叠、扩建仓库末行可操作、工作区与底栏分离、键盘选择及任务进度。47 项基础测试、24 步浏览器流程、7 项存档专项和 6 项离线包检查全部通过。没有改动领域规则、世界、美术、战斗或存档格式，未重跑长时间自动玩家平衡测试。

图文对照、环境与边界见 [docs/UI-POLISH.md](docs/UI-POLISH.md)，本轮报告位于 `docs/ui/`；原 `docs/ACCEPTANCE.md` 保留历史完整循环验收记录。两份 HTML、两个 ZIP 及哈希清单已重新生成。本轮按 PR 交付，需维护者合并后由 CI 更新 Pages。

## 交付

- 根目录 `start the game.html`：完整便携游戏。
- `dist/index.html`：与根目录启动文件一致，可供静态托管。
- `release/Escape-Bincov-portable.zip`：游戏 HTML 与中文说明。
- `release/Escape-Bincov-web.zip`：根目录为 index.html 的网页上传包。
- `docs/ONLINE-CHINA.md`：大陆网络下的托管选择、预览链接限制、域名与存档迁移步骤。

源码包保留完整 Git 历史，不携带 node_modules、包缓存和临时测试输出；用 `pnpm install --frozen-lockfile` 恢复开发依赖。历史源码包顶层目录名为 `Eascape from Bincov`；公开仓库目录为 `escape-bincov`。旧 ZIP 不再作为后续开发基线。

## 本次变更

1. 结算先写入候选存档，成功后才进入结果页。失败时锁定行动，保留 pendingSettlement，提供重试和结算备份。重复结算和另一窗口写入不能覆盖待保存结果。
2. 购买、任务、库存拖放、安全箱、医疗物品使用等保存失败时恢复库存、现金和相应生命状态；物品丢到世界延后至保存成功后执行。
3. 新增严格校验的 JSON 备份，包含完整已结算进度。导入确认并成功写入后才替换本地状态。
4. HUD 在面板重绘后立即恢复实际数值，修复暂停时显示 10:00 的问题。
5. 补齐主目录入口，便携和网页 ZIP 随 pnpm package 一起生成，版本升至 0.1.1。
6. 测试命令使用 node --import tsx，避免部分环境中 tsx CLI 的命名管道限制；浏览器路径支持跨平台，便携 ZIP 检查在非 Windows 使用 Python 3。

## 验证

完整证据见 `docs/ACCEPTANCE.md`：47 项自动测试、24 步双分辨率浏览器回归、7 项存档专项、6 项便携测试、超过 10 分钟真实计时自动流程。最终制品大小与哈希见 `docs/release-manifest.json`。

## 后续

本轮将项目迁入公开 GitHub 仓库，增加真实截图 README、Agent 协作规范、PR 模板、CODEOWNERS、CI 与 GitHub Pages 自动发布；菜单增加仓库跳转，打包改为固定 ZIP 时间戳并自动生成制品哈希。试玩入口：https://xuys2025.github.io/escape-bincov/ 。部署状态以仓库 Actions 为准；大陆三网尚未实测，EdgeOne 镜像尚未部署。当前只支持桌面键鼠单人游戏。下一轮玩法工作应依据真人试玩反馈；自动玩家已能清空本局固定敌人，后半局持续目标与威胁可作为设计讨论项。

## 2026-10-09 改枪计划入库并排在 PR22 之后

维护者要求把本地 20 枪、100 配件计划提交文档 PR，并核对 PR22 重做冲突。基线 main `841e8bbdfb070eada82537563dd1ab1b4801aea3`，独立分支 `docs/gunsmith-after-pr22`。新增 [计划入口](docs/gunsmith/README.md)、完整目录及 [衔接记录](docs/gunsmith/PR22-INTEGRATION.md)，更新 README 与任务清单。

核对 PR22 远端头 `878f563` 仍为早期文档、开放且有合并冲突；本地重做到 `0a5e3da`，另有未提交库存修复，均只读。计划改为承接 Runtime/Pixi 与保留的旧场景、双库存入口、持枪挂点、相机转换、共享音频及最终存档协议。取消预先固定新版封套和独立视野倍率，保留原型号、20/100 数量及原子保存要求。

实现（包括 M0 原型与素材生产）等待 PR22 重做验收并合入 main，再按用户指令开工。本次只改文档；未运行游戏测试或打包，无源码、素材、生成物及部署变更，不代签 PR22 的第六轮复验或真人/真机验收。文档检查与 CI 结果在当前 PR 记录，不自行合并。

</details>
