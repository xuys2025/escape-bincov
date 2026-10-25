# Agent 开发与交接手册

本手册说明如何接手、验证和交付；强制约束以 [AGENTS.md](../AGENTS.md) 为准。按任务阅读相关小节，无需每次重读全部历史。

## 1. 用最少上下文接手

1. 读 [AGENTS.md](../AGENTS.md)，确认本次授权范围与不可破坏的约束。
2. 在 [CODEMAP](CODEMAP.md) 找到任务对应的路径、符号、起读位置和测试入口，再读本手册相关小节；涉及状态与事务时查 [当前架构](ARCHITECTURE.md)。
3. 核对 [WORK-QUEUE 的当前入口](WORK-QUEUE.md)及相关 issue/PR 的实时正文、head、讨论与检查，确认承接目标。
4. 查看工作区改动并更新远端信息，记录已接受基线和本次工作 head，然后只读相关源码与测试。

```bash
git status --short
git remote -v
git fetch origin
git rev-parse origin/main
git rev-parse HEAD
```

权威仓库为 [xuys2025/escape-bincov](https://github.com/xuys2025/escape-bincov)，已接受代码是最新 `origin/main`。既有任务仍在原分支/PR续作；先确认其 head 仓库、分支和写权限。没有承接 PR 且目标独立可验收时，才从最新主线建立任务分支。不要覆盖他人的未提交内容；多人并行先约定文件边界。

[handoff.md](../handoff.md)及历轮报告用于追溯，**只按本次任务需要读取被引用的历史段落，不把全篇历史列为必读**。旧 ZIP、截图、待审字样和历史测试结果不代表当前实现；以源码、提交和 GitHub 实时状态核实。当前用户需求决定范围，候选方向不自动授权开工。

## 2. 实现与续作

- 同一交付目标的澄清、修复、验证和审阅反馈更新原 PR。阶段完成不自动拆 PR；范围变动先明确验收与剩余归属。无原 head 写权限时保留可移交补丁并报告，不能另开同目标 PR 绕过。
- 模块定位由 [CODEMAP](CODEMAP.md)维护，状态所有权与调用边界由 [ARCHITECTURE](ARCHITECTURE.md)维护；本手册不再复制源码职责表。新规则沿现有纯领域/Runtime边界实现，视图调用服务，不另造交易或结算路径。
- 涉及存档、结算、迁移或库存时，先核对 [AGENTS 的存档约束](../AGENTS.md)：共同提交角色与世界、成功写入后发布、失败回滚/候选保留、重复重试与多窗口保护都须保住；不能通过换键、强制覆盖或忽略异常绕过。
- 添加能捕捉实际风险的断言；修复保留有效反例。画面改动提供真实截图并标明测试夹具；文档默认中文，文案遵循 [COPY-GUIDE](COPY-GUIDE.md)，不因措辞调整改变存档 ID。
- 保持单文件离线运行及原授权范围。HTML、ZIP 和发布清单是本地打包的生成物，不提交（[CI 说明](CI.md#构建与离线包发布)）；新增依赖说明必要性和许可，不提交凭据或真实玩家个人存档。

## 3. 环境与运行前提

- Node.js 24；pnpm 版本以 [package.json](../package.json) 的 `packageManager` 为准，当前为11.19.0。`pnpm install --frozen-lockfile`；源不可达时可显式使用 `--registry=https://registry.npmjs.org`，无需重写锁文件。
- `pnpm dev` 在 `http://127.0.0.1:4173` 提供刷新后重建；`pnpm package` 执行类型检查、构建，并在 `release/` 写出两种 ZIP 和 SHA-256 清单。浏览器脚本读取打包 HTML，新检出或源码改动后先打包，避免测试旧制品或找不到文件。游戏脚本的 esbuild 配置（loader、target、define）只在 [game-bundle.mjs](../scripts/game-bundle.mjs) 维护，正式构建与诊断共用：新资源类型的 loader 改这一处，诊断只在调用处覆盖压缩、探针等差异。
- Playwright 用 `pnpm exec playwright install chromium`；Linux 缺系统库时用 `pnpm exec playwright install --with-deps chromium`。浏览器选择统一见 [browser-options.mjs](../scripts/browser-options.mjs)：可设置 `BINCOV_CHROME`，`BINCOV_CHROME_ARGS` 为 JSON 字符串数组。
- `test:portable` 在 Windows 用 .NET 解压，在 Linux/macOS 需要 Python 3。证据默认写入忽略的 `test-results/`；只将经过审核、具有长期价值的报告和截图提升到 `docs/`。
- `test:expansion` 需要四份真实固定旧客户端：扩展前的 `test-results/pre-m0.html`、session v5 之前最后的 v4 客户端 `test-results/pre-perk.html`、session v6/v7（敌人规则）之前最后的 v5 客户端 `test-results/pre-enemy.html`（main `30781f4`），以及 session v8（枪械实例）之前最后的 v7 客户端 `test-results/pre-gunsmith.html`（main `67a7468`），准备方式见 [CI 工作流](../.github/workflows/ci-pages.yml)，脚本会核对哈希；本地可用 `git show <提交>:dist/index.html` 取同一文件。`test:mobile-ux` 的另一项旧客户端检查仅在提供 `BINCOV_LEGACY_HTML` 时执行；不能拿当前 HTML 或不匹配旧包替代。

安装或浏览器失败时记录具体命令和错误。未运行成功不能记为通过，不得修改断言来掩盖环境故障。

## 4. 按风险验证

所有源码改动至少运行 `pnpm test` 和 `pnpm package`。用[检查导航](CHECKS.md)叠加实际风险，例如 `pnpm checks --risk=save,input`；输出包含基线、相关命令、前置与人工证据要求。定向单测不能替代交付基线。命令以 [package.json](../package.json) 为准，具体风险选择只在[检查元数据](../scripts/check-catalog.mjs)维护。

| 改动范围 | 导航风险（可组合） |
| --- | --- |
| 纯文字/文档 | `docs`；核对链接、命令、事实和图片，无需为文字新增代码测试 |
| 领域规则、数据 / 地图 | `rules` / `world` |
| UI、操作、场景 | `ui`；保留两档桌面真实截图 |
| 主界面、全局输入、缩放、暂停 | `input` |
| 交易、库存、结算、备份 / 迁移 | `save` / `migration`；事务回滚同时选择 `input`，界面改动选择 `ui` |
| 背包搜刮 / 商店 / 据点成长 | `inventory` / `shop` / `base` |
| 美术、渲染与生命周期 | `render`；独立诊断不计为回归通过 |
| 打包、依赖或发布 | `packaging` |
| 战斗、AI、潮汐、持续负载 / 分层自然行动 | `combat` / `layered`；真人平衡单独记录 |
| 测试工具与 CI | `ci`；实际受影响套件另跑 |

按任务补足实际入口，避免只凭命令名判断覆盖：

- 行动只有 Pixi 宿主一种画面。`test:desktop-input`、`test:mobile`、`test:mobile-ux` 在 2.5D 宿主上用真实键鼠/触屏；`test:coast-animation` 只跑样板动画子集，不能替输入签收。改宿主时验证实际入口及对应反例。
- 交易/库存先区分院子、旧页签和行动。现有 `test:issue26-station` 对应院子库存，`test:issue26-inventory` 覆盖行动内搜刮；新增规则还要验证正式服务，不能只测旧helper。
- 持久字段需验证初始化、严格解码、capture/restore和备份的完整往返；涉及扩展、容器或商场时覆盖对应历史格式与布局，保留未知/损坏数据拒绝和原始备份字节。

`test:play` 默认约10分钟真实计时；训练检查保留真实120秒要求，不能缩短后冒充原验收。长行动、F20堆、性能与历史诊断按对应风险执行，不因整理入口放宽条件。部分诊断的 `exit 0` 只表示采样完成，仍须读其签收结论；带固定基线/归档附件的工具不能当通用回归自动执行。

浏览器夹具、自动瞄准和触屏视口仿真不等于真人手感、真机或网络体验。报告区分本次通过、失败、未运行和环境阻塞，写明提交、制品哈希、平台/浏览器及测试方式。

## 5. CI、提交与交付

CI的分组、前置和制品位置查 [CI.md](CI.md) 与 [实际工作流](../.github/workflows/ci-pages.yml)。新增检查按[检查导航的维护规则](CHECKS.md#唯一维护位置)更新元数据：新的 `test:*` 要么排进 CI，要么登记为手动套件，否则 CI 策略测试失败；风险、诊断与非 package 脚本也有覆盖检查。导航不改变现行 CI 执行策略。

文档快速通道只在相同非文档内容已有成功主线完整回归证据时复用浏览器结果；本次单测和打包仍运行。策略不足回退全量，手动工作流始终全量。`Build and test` 接受的按策略跳过与异常跳过不同；只有主线验证成功后才能更新Pages和离线包，PR不发布，镜像所用检查名和发布契约保留。

提交前完成对应检查、`git diff --check`和最终文件审阅。生成物不提交，同步 main 时遇到生成物冲突按 [CI 说明](CI.md#构建与离线包发布) 保留删除；遵守本地密钥检查和正常Git钩子，不用绕过参数。只暂存本任务文件，推到任务分支/原PR head；不直接推main、不强推、不自行合并，具体维护者授权除外。

PR正文使用[仓库模板](../.github/pull_request_template.md)：说明问题、最终行为、实际验证、兼容边界和遗留，必要时附真实截图。长正文用文件配合`--body-file`，实现范围变化后更新原正文和标题。提交后核对准确head的CI并处理本任务引入的失败；“已提交”“已合并”“已上线”分别凭对应证据说明。

## 6. 留下可直接接手的摘要

使用 [TASK-HANDOFF-TEMPLATE](TASK-HANDOFF-TEMPLATE.md) **更新原PR正文或该任务已有摘要**，不为同一阶段无限追加新的进度文档。保留首败、关键决定和必要证据链接；历史明细按需查阅，不再次复制到当前入口。

交接必须能回答：准确基线和PR head、当前目标与边界、修改/阅读的关键符号、实际已验与未验、下一步。任务归属变动更新WORK-QUEUE的当前入口；下一位只需3–5个直接入口即可定位剩余工作。

最终向维护者报告PR链接与提交号、已完成行为、实际验证、剩余问题和发布状态；缺少PR或部署证据时明确说明，不以历史通过记录代替本次结果。
