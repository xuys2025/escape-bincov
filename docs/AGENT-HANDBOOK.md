# 🤖 Agent 开发与交接手册

适用于《逃离滨科夫》的代码、测试、文案、文档和视觉改动。维护者：[@xuys2025](https://github.com/xuys2025)。先遵守根目录 [AGENTS.md](../AGENTS.md)，再按本手册工作。

## 1. 先确认你正在正确的项目中

| 项目 | 权威位置 |
| --- | --- |
| 唯一仓库 | https://github.com/xuys2025/escape-bincov |
| 已接受代码 | 仓库最新 `main`，不是旧压缩包或聊天附件 |
| 在线试玩 | https://xuys2025.github.io/escape-bincov/ |
| 当前版本 | `package.json`；页面文案和发布清单应与其一致 |
| 最新验证 | 当前提交的 Actions 结果；`docs/ACCEPTANCE.md` 是注明日期的历史验收 |
| 任务入口与待审工作 | [统一任务清单](WORK-QUEUE.md) → 相关 GitHub PR 的最新正文、提交和讨论；同一目标复用原 PR |
| 本轮历史与遗留 | `handoff.md`、提交记录、相关 issue/PR |

导入来源为此前已验证的 0.1.1 本地项目（修复提交 `ae84993`）。公开仓库建成后，旧 ZIP 只作历史备份，不再作为开发基线。旧包顶层 `Eascape from Bincov` 的拼写仅是历史文件名，不应据此另建工程。

如果聊天描述与当前源码冲突，先定位源码和 Git 历史，说明实际情况后按当前任务实现；不要悄悄把仓库回退到聊天中描述的旧版本。需求变更以维护者当前明确指令为准。

## 2. 一次任务的标准流程

### 接手

1. 阅读 `AGENTS.md` → 本文件 → README → `handoff.md`。
2. 运行 `git status --short`、`git remote -v`，确认没有会被覆盖的他人工作。
3. `git fetch origin`，记录 `origin/main` SHA；核对[统一任务清单](WORK-QUEUE.md)与相关开放 PR 的最新正文、提交、讨论和检查。标题可能仍叫“计划”，实现可能已在原 PR 内推进，不能只按标题判断。
4. 有同一交付目标的开放 PR 时，确认 head 仓库、分支、最新 SHA 和写权限，继续原分支；没有承接 PR 且目标独立可验收时，才从最新 main 新建任务分支。将本次工作映射到已有阶段和验收项。
5. 阅读涉及模块、测试和已知限制，再开始编辑。不要仅靠搜索命中或 README 推断行为。先遵守清单中的需求冻结与在途安排。

```bash
git fetch origin
git rev-parse origin/main
# 已有任务：确认目标分支后切换；本地没有时先取得 PR 的实际 head 分支
git switch <已有任务分支>
# 仅独立新交付使用以下命令，不与上一行连续执行
# git switch -c agent/short-task-name origin/main
```

续作保留原分支提交和他人工作；需要同步 main 时正常合并并解决冲突，不强推或重写公共历史。多人接力须在任务清单/原 PR 留下当前负责环节与交接点；并行时约定文件边界，避免同时修改 `src/ui.ts`、生成物或同一手册段落。无法写入原 head 时报告阻塞并保留可移交补丁，不自动复制出第二个 PR。

### 实现

- 一次 PR 聚焦一个独立交付目标；范围内实现、修复、测试、说明和审阅反馈持续追加原 PR。新想法登记为待排期，不能顺手扩充当前验收范围。保持已验收的存档、离线和输入行为。
- 大任务按已有阶段提交，每阶段记录完成条件、证据和未完成项；下一阶段依赖满足后仍在原 PR 推进。阶段通过不等于总任务完成，拆分合并须先确定独立范围与剩余承接入口。
- 新规则尽量放在纯逻辑模块，由 UI 调用，不把交易/结算规则写进渲染模板。
- 添加能捕捉实际风险的测试；不要为凑数写只重复实现的断言。
- 画面或文案变化提供真实前后截图；说明截图是否使用了测试夹具。
- 文档默认中文，标识符和文件名沿用项目英文；说明玩家能做什么，不把实现细节塞进游戏文案。
- 玩家可见名称、按钮与提示遵循 [文案约定](COPY-GUIDE.md)，同步可见标签、读屏标签和游玩说明；不要为统一措辞修改存档 ID 或回写历史截图。

### 验证与提交

先执行下面的风险验证矩阵，再检查 `git diff --check` 和最终变更列表。源码或便携说明改变时运行 `pnpm package`，提交生成物和制品清单。

```bash
git add <本次任务涉及的文件>
git commit -m "fix: describe the player-visible problem"
git push -u <任务远端> <任务分支>
```

已有 PR 时推送到其 head，并更新原正文的实际范围、阶段、验证和剩余问题；实现从计划推进到代码后，标题也应反映当前交付。只有独立新交付才向 **`xuys2025/escape-bincov:main`** 发起 PR，可用 GitHub 网页或已认证的 `gh pr create`；此类新任务没有本仓库写权限则使用 fork。PR 正文使用模板，写明任务清单入口、关联 PR 及为何需要新 PR；CLI 长正文写入文件再用 `--body-file`。

提交 PR 后等待 CI，修复自己引入的失败。**不得直接推送 `main` 或自行合并**，除非维护者对具体合并有明确授权。交付消息应附 PR 链接，不能只给补丁、ZIP 或一句“改好了”。

## 3. 本地环境与命令

- Node.js 24；pnpm 11.19.0（以 `packageManager` 字段为准）。
- `pnpm install --frozen-lockfile`；CI 显式使用 npm 官方源。项目本地源配置在 `pnpm-workspace.yaml`，源不可达时可加 `--registry=https://registry.npmjs.org`，无需因此重写 lockfile。
- `pnpm dev`：`http://127.0.0.1:4173`，保存源码后刷新重新构建。
- `pnpm package`：类型检查、独立 HTML、两种 ZIP、SHA-256 发布清单。
- Playwright：`pnpm exec playwright install chromium`；Linux 缺系统库时用 `pnpm exec playwright install --with-deps chromium`。
- Windows 测试优先检测标准 Chrome 路径，其他平台使用 Playwright Chromium。可设置 `BINCOV_CHROME`；`BINCOV_CHROME_ARGS` 必须是 JSON 字符串数组。不要提交某台电脑的绝对路径。
- `test:portable` 在 Windows 用 .NET 解压，在 Linux/macOS 需要 Python 3。
- 输出在忽略的 `test-results/`。只把确有长期价值、已审核的报告和截图提升到 `docs/`。

安装或浏览器环境失败时报告具体命令与错误。没有运行成功的测试不算通过，不得修改断言来“解决”环境故障。

## 4. 源码地图

| 位置 | 职责 | 改动时关注 |
| --- | --- | --- |
| `src/main.ts` | Phaser 初始化、缩放、全局输入、窗口切换、存档冲突 | 普通入口无测试接口，画布边界与像素缩放 |
| `src/game.ts` | 场景、移动、射击、敌人、潮汐、撤离与 HUD | 行动锁定、帧更新、计时、生命周期和输入坐标 |
| `src/input.ts` / `src/mobile.ts` | 统一输入快照、指针归属与触控控件 | 暂停/取消/切屏释放，键鼠语义不变 |
| `src/checkpoint.ts` / `src/recovery-store.ts` | 完整快照校验、迁移、单记录提交与写入所有权 | 不拆分档案和世界的提交点；拒绝未知数据 |
| `src/app.ts` | 组装共享状态、音效和存档会话 | 唯一状态来源；Phaser/场景仅类型依赖 |
| `src/session.ts` | 出击提交、事务回滚、结算重试、导入和存储冲突状态 | 无 DOM/Phaser；写入成功后提交；失败回滚 |
| `src/loot.ts` | 局内容器类型、旋转/拆分/部分合并与精确落格校验 | 无 DOM/Phaser；双端守恒、救济标记；`SaveSession.transferLoot` 提交容器 |
| `src/shop.ts` / `src/qol.ts` | 商店清单/结算与行动信息纯规则 | 交易原子性、任务余量、物资来源与方位 |
| `src/ui.ts` | 菜单、整备、交易、任务、背包、导入导出、结算展示 | 调用会话接口；世界副作用放在提交之后 |
| `src/domain.ts` | 物品/武器/敌人、交易、任务、存档和结算 | 保持纯逻辑、物品守恒、旧存档兼容 |
| `src/save-backup.ts` | 备份格式、校验、编码与解码 | 上限、非法物品、堆叠、边界、重叠、UID 与活动行动 |
| `src/balance.ts` | 负重、耐力、污染、治疗等生存数值 | 玩法变化须验证真实计时与失败场景 |
| `src/world.ts` | 地图、种子配置、碰撞、视线和寻路 | 潮位切换前后出生点、物资与撤离可达性 |
| `src/art.ts` / `src/art/` / `src/audio.ts` | 缓存像素素材、独立库存/角色/场景绘制和合成音效 | 不增加离线运行时网络依赖，不消耗游戏 RNG |
| `src/font.ts` / `src/tactical.css` / `assets/fonts/` | 字体 B、战术界面、OFL 子集与许可 | 字集变化运行 subset-font.py；不可直接编辑生成 HTML |
| `src/title-art.ts` / `src/title-screen.ts` / `src/title.css` | 夜港主界面、缓存景物、视口布局 | 动态开关、减少动态效果、安全区；不改变局内缩放 |
| `src/style.css` | 菜单、HUD、背包和对话框样式 | 两种分辨率、文字可读性、点击区域 |
| `tests/` | 纯规则、地图与存档回归 | 风险对应断言，避免仅检查实现细节 |
| `scripts/build.mjs` | esbuild 打包、HTML 内联与开发服务 | 两个 HTML 字节一致，第三方声明保留 |
| `scripts/package.mjs` | 标准 ZIP 和制品清单 | 内部入口名、中文文件名、CRC、可复现打包 |
| `.github/workflows/ci-pages.yml` | CI、报告和 Pages 部署 | PR 仅读取权限，部署只发生在 main 验证之后 |

应用状态与会话接口的职责、提交顺序和扩展示例见 [架构说明](ARCHITECTURE.md)。

主要接口：`ItemDef`、`WeaponDef`、`EnemyDef`、`LootTable`、`RunConfig`、`SaveDataV1`。逻辑画面 960×540，地图 72×52 格，每格 32 像素。当前状态流：菜单、藏身处、行动、结算。

## 5. 必须保住的行为

### 存档与结算

主档为 `escape-bincov.session.v2`；`escape-bincov.save.v1` 只在首次迁移时读取，保留原始备份。出击前将扣账与初始世界一次提交；新版中断行动恢复最近成功检查点，无快照的旧版行动沿用失败规则。成功结算基于候选存档，只有写入成功才能展示完成；失败时保持 `pendingSettlement`、停止行动并允许重试/备份。一次行动只能结算一次。

导入应校验完整数据、提示覆盖并以实际写入成功为提交点。进行中行动导出完整检查点备份（候选格式见 `MOBILE-IMPLEMENTATION.md`），不能伪装成已完成行动；旧 v1 已结算备份继续兼容。多窗口冲突不得覆盖新存档；浏览器存储被禁止时不能继续出击。强制关闭未保存且未备份的页面会丢失内存结果，这个限制必须如实保留。

### 物品与经济

购买物品进入仓库；物品移动、治疗、任务交付和升级的写入失败必须回滚。换枪/卸枪要处理枪内弹药及容纳空间，救济弹药不能变成可出售普通弹药。救济补给不得重复生成；没空间时等待玩家领取。安全箱物品死亡后保留。

### 行动

每局 10 分钟，初始 25 名敌人、60 份物资、两个启用撤离点；其中最多 20 份原物资归入 10 个箱子，其余散落，箱内允许堆叠。第 4 分 30 秒预警，第 5 分钟翻转潮位。搜刮、背包和地图不暂停，Esc 关闭面板后再按才暂停。箱子和尸体按 E 打开双栏拖放，地面物资仍 E 快捷拾取。撤离需在有效范围内停稳并按住 E 3 秒。产品需求可以修改这些数值，但必须同步文档及相关验证。

### 发布

两份 HTML 都需独立离线运行；外链仓库只是可选跳转，不能成为启动依赖。网页包根目录必须是 `index.html`，便携包保留 `start the game.html` 与中文说明。不能通过修改存档键、主机名或协议掩盖旧进度问题。

## 6. 按风险验证

| 改动范围 | 最少验证 |
| --- | --- |
| 纯文字/文档 | 本地及仓库链接、命令、事实、图片路径；无需新增代码测试 |
| 领域规则、数据、地图 | `pnpm test`、`pnpm package`；相应边界/可达性回归 |
| UI、操作、场景 | 上述检查 + `pnpm test:browser`、`pnpm test:ui`；1280×720 与 1920×1080 截图。主界面/全局输入/缩放还需 `pnpm test:title`；输入/暂停/事务回滚还需 `pnpm test:desktop-input` 、`pnpm test:mobile` 和 `pnpm test:mobile-ux` |
| 交易、库存、结算、备份 | 上述检查 + `pnpm test:save-browser`，包括写入失败、重复重试、旧存档、导入覆盖与多窗口影响 |
| 打包、依赖或发布 | `pnpm package`、`pnpm test:portable`、ZIP 内容/哈希与线上普通入口检查 |
| 战斗、AI、潮汐、持续负载 | 对应回归 + `pnpm test:play`；另明确真人平衡性是否验证 |

完整自动检查命令：

```bash
pnpm test
pnpm package
pnpm test:browser
pnpm test:desktop-input
pnpm test:ui
pnpm test:tactical
pnpm test:art
pnpm test:title
pnpm test:title-water
pnpm test:save-browser
pnpm test:expansion
pnpm test:buildings
pnpm test:qol-expansion
pnpm test:systems
pnpm test:mall-passages
pnpm test:mall-landing
pnpm test:loot
pnpm test:loot-target
pnpm test:qol
pnpm test:portable
pnpm test:mobile
pnpm test:mobile-ux
```

CI 对 PR 与 `main` 运行以上完整检查。单元测试及打包只在 `Build shared game` 执行一次，四组浏览器任务在独立 Ubuntu runner 上并行下载同一次运行的 `built-game` 制品，并核对 HTML、ZIP 和发布清单的 SHA-256。分组如下：

| 组 | 完整浏览器命令（均保留现有断言和循环） |
| --- | --- |
| `visual` | `test:ui`、`test:tactical`、`test:art`、`test:title`、`test:title-water` |
| `inventory` | `test:save-browser`、`test:expansion`、`test:qol-expansion`、`test:loot`、`test:loot-target`、`test:qol`、`test:portable` |
| `world` | `test:buildings`、`test:systems`、`test:mall-passages`、`test:mall-landing` |
| `input` | `test:browser`、`test:desktop-input`、`test:mobile`、`test:mobile-ux` |

诊断附件为 `browser-evidence-visual`、`browser-evidence-inventory`、`browser-evidence-world`、`browser-evidence-input`，保留 14 天；临时构建制品仅保留 1 天。失败时其余组继续收集证据，取消旧运行的规则保持不变。

统一检查名仍为 `Build and test`：构建及每组浏览器检查必须全部成功，失败、取消或跳过均不能通过。只有 main 的 push 或手动运行在该门禁成功后，才会校验并上传同一份 `dist/`，随后执行 `Deploy Pages`；PR 不发布，现有公开 Pages 镜像的两个成功检查名保持兼容。当前仓库公开且使用标准 GitHub 托管 runner，计算时间免费；附件仍应控制体积与保留时间。

真实计时脚本约 10 分钟，不在每次 CI 中默认执行。

`test:browser` 使用显式夹具加速移动/计时；`test:play` 仅读状态并发送真实键鼠，但拥有地图信息和自动瞄准。两者都不能证明真人玩起来好玩，也不能替代大陆运营商网络实测。不要把历史“47 项通过”当作新提交已验证。

## 7. PR 与交接应写什么

PR 标题概括具体变化，如 `fix: keep extraction rewards when saving fails`。正文解释：为什么改、怎样改变玩家体验、关键实现选择、实际运行的验证、存档/离线兼容性、截图和未解决问题。

任务归属、范围或状态变化时同步[统一任务清单](WORK-QUEUE.md)；同一阶段的细节和测试结果更新原 PR/验收记录，不另复制一套进度表。修改 `handoff.md` 时保留有价值的历史，更新本轮日期、变化、证据和下一步。测试报告中注明平台、浏览器、版本/提交、测试方式；不要提交凭据或真实玩家个人存档。

结束时提供：

- PR URL 与任务分支/提交号。
- 已完成行为和需要维护者关注的设计选择。
- 实际运行的命令、结果、环境阻塞或未运行部分。
- 剩余问题，以及是否影响试玩、数据兼容或发布。

没有 PR 链接时明确说明为什么还没提交。没有部署成功证据时不得说“已上线”。

## 8. 后续工作候选

0.1.1 已完成存档可靠性和便携发布修复。本轮公开仓库增加图文 README、协作规则、CI 与 GitHub Pages。

后续优先依据真人反馈考虑：战斗命中/受击反馈、初局引导、清空固定敌人后的持续目标、物资与经济节奏，以及更多可复现的存档兼容性场景。这些是讨论项，不是当前任务默认授权。

移动触控和本局恢复已在 PR #2 实现候选版，真机与大陆网络验收见 `MOBILE-IMPLEMENTATION.md`；多人联机、云存档与手柄未实现；不要把静态网站部署误写成已经支持联机。大陆备用部署见 [ONLINE-CHINA.md](ONLINE-CHINA.md)，Pages 维护见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 9. 一句话交接提示词

> 请以 https://github.com/xuys2025/escape-bincov 的最新 main 为已接受基线，先读 AGENTS.md、开发手册和 docs/WORK-QUEUE.md，核对相关开放 PR；同一目标继续原分支和 PR，只有独立交付才新建。遵守当前需求冻结范围，完成验证与交接，不直接推送或自行合并 main，最后汇报 PR 链接、测试结果及剩余问题。
