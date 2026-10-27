# CI 分流与浏览器分组

按改动风险查本地检查、前置与独立诊断，使用[检查导航](CHECKS.md)（`pnpm checks --risk=save,input`）。导航从本页所指的既有分组读取 CI 归属，不改变跳测、分组或发布策略；检查元数据及脚本分类的守卫随现有策略单测运行。

2026-10-15 更新（#61 首批，基线 a2d716d）；2026-10-22 浏览器 job 的主机包改走缓存、WebGL 改用 lavapipe（见“浏览器 job 的主机环境”）。流程入口为 [ci-pages.yml](../.github/workflows/ci-pages.yml)。前次 #54 基线 `5a11e3d`，纯文档 PR #51 的检查为 24 分 40 秒、合并后为 31 分 06 秒；当次构建任务只用 34 秒，主要时间在浏览器组内串行测试。

## 每次仍然执行的检查

PR、main push 和手动运行都执行纯规则/世界/存档单测、CI 策略测试、严格类型检查、构建和打包。只构建一次，浏览器任务下载同一制品并校验 SHA-256；生成物不入库，见[构建与离线包发布](#构建与离线包发布)。

CI 策略测试还守住五件事。[entry-docs.test.mjs](../scripts/ci/entry-docs.test.mjs) 要求 AGENTS、README、CODEMAP、开发手册、架构、本页和任务清单当前入口里的链接、标题锚点与反引号路径都存在；[generated-files.test.mjs](../scripts/ci/generated-files.test.mjs) 拒绝提交生成物；其余三件：[browser-suites.mjs](../scripts/ci/browser-suites.mjs) 里每条 `test:*` 不是排进下面的八组，就是登记在同文件的手动表并写明原因（policy.test.mjs），套件不会悄悄掉出两边；[source-health.test.mjs](../scripts/ci/source-health.test.mjs) 拒绝无使用者的导出、新的运行时 import 环和规则模块的 DOM 依赖；[game-bundle.test.mjs](../scripts/ci/game-bundle.test.mjs) 构建堆诊断换进打包页的未压缩带探针游戏脚本，并拒绝在 [game-bundle.mjs](../scripts/game-bundle.mjs) 之外复制游戏脚本的 esbuild 配置（#60 Q-B06）。它只证明这些诊断能构建，不代表诊断通过。手动套件不在 CI 里跑，改动对应区域时按表中原因自行运行。

`Build and test` 是保持名称不变的必需检查。它在依赖失败或跳过后也运行，只接受：

- 构建成功，策略要求浏览器，全部浏览器任务成功。
- 构建成功，策略证明可复用主线完整浏览器证据，浏览器矩阵按计划跳过。

策略为空、构建失败、测试失败、取消或意外跳过均不能通过。

## 纯文档快速通道

白名单为根目录 `README.md`、`AGENTS.md`、`CONTRIBUTING.md`、`handoff.md`、`.github/pull_request_template.md`、`docs/` 内的 Markdown，以及已确认只作文学交接的 `docs/story/GEMINI-RETURN-MANIFEST-20261014.json`。路径按仓库中的大小写精确匹配；必须是普通非可执行文件，符号链接和未知路径走全量。

`THIRD_PARTY_NOTICES.md` 嵌入 HTML，`README-游玩说明.txt` 进入便携 ZIP，均不属于可跳过输入。代码、素材、测试、脚本、锁文件和配置也全部参与验证指纹。生成物不入库，指纹只看源码：构建可复现，同一份源码和锁文件在本地与 CI 上打出相同字节（移出仓库前，每次 CI 都逐字节核对过提交的生成物与 CI 构建）。

快速通道同时要求：

1. PR 比较本次合成合并树与事件记录的 base 整体，不能只看最后一次文档提交；base 不可读则全量。
2. 从相同仓库、相同工作流最近 20 次成功 main 运行中，找到非文档树完全一致的记录。指纹包含每个文件的路径、类型、权限和 Git blob ID。
3. 该记录的构建、汇总、Pages 部署及当前八个浏览器组必须全部实际成功。此前跳过浏览器的文档运行不能作为下一次复用证据，也不复用 PR 的结果。
4. 新增的 Markdown 行内本地链接、文档 JSON 语法及 Git 空白检查通过。外部网址、标题锚点、引用式链接、事实和命令仍需人工审阅，历史损坏链接不被冒充为本次新问题。

没有匹配记录、API 超时/权限不足、返回截断、测试或工作流变化，均回退完整浏览器回归。手动 `workflow_dispatch` 始终完整运行，可用于环境更新后的主动复验。main 的判断以已完整验证的树为准，不能只比较 push.before；前一次代码运行被取消后追加文档仍须完整验证。

构建任务 Summary 和 `ci-selection` 制品记录决策、复用的 main 提交、运行链接和非文档指纹。记录里明确区分“本次实际执行”与“复用历史完整浏览器证据”。

## 八组分配

各组在独立 Ubuntu runner 上顺序执行，最多同时八组，`fail-fast: false` 保留其他组的失败诊断。当前执行 **44** 条浏览器命令，覆盖 **42** 条完整逻辑套件（仅敌人套件按三个独立视口分片；改枪的 `test:gunsmith-bench`、`test:gunsmith-flow` 由 #106 加入 batch-5、batch-6 末尾），包括 #48 的商场样板、#57 的普通 2.5D 行动检查、#56 的开场动画验收（约 20 秒，排在 batch-3）、2026-10-22 从手动转入 batch-6 的 `test:hideout`（旧页签普通入口、商店门面、写入故障与出发，本地限 2 核软件渲染 14 秒），以及同日射击改造（#39）新增的两条：`test:shooting`（静止指针下瞄准不漂（空地与地图边）、开枪不动瞄准、枪口火光与曳光对齐枪管、贴墙与门角挡弹、隐藏房间不漏曳光、开火方式、受击闪白与抖动从命中当帧画起且慢帧至少一帧、抖动顺着子弹方向而血迹朝射手、暴击与击杀的命中标记和击杀确认音）排在 batch-1 末尾，试枪场 `test:range` 排在 batch-5 末尾。两条起初都放在 batch-2，但 PR 运行里 batch-2 原有五条已要约 22 分钟，加上这两条（CI 上 `test:shooting` 约 8 分钟、`test:range` 约 2.5 分钟）后，遇到安装步骤慢的 runner 就超过 45 分钟被取消；batch-1 与 batch-5 是 2026-10-22 几次运行中耗时最短的两组（套件合计约 8–17 分钟）。其余未排入 CI 的套件见下方“每次仍然执行的检查”提到的手动表。2.5D 收尾移除 Phaser 后，只检查 Phaser 场景的 `test:issue26-phaser-spatial` 退役（空间检查由 `test:issue26-spatial` 在 2.5D 上保留）。完整的 `test:coast-sample` 只在本地运行：CI 的软件渲染下，动画组最后一步 V-CAM 之后再开页面会超时，完整套件要先把 V-CAM 挪到最后并验证计时检查，才能进 CI。除随 Phaser 退役、在 [2.5D 收尾说明](2-5d-closeout/README.md#测试迁移) 中逐项列出的检查外，原回归内容保留；本批仅将敌人套件按完整视口分片，断言、浏览器参数与真实训练计时保持原要求。

[scripts/ci/browser-suites.mjs](../scripts/ci/browser-suites.mjs) 是执行顺序和覆盖核对的清单；[run-browser.mjs](../scripts/ci/run-browser.mjs) 逐条执行原 `pnpm test:<id>`，因此 package.json 中的原参数仍生效。组合命令现在分开计时，存档检查在 batch-2 首个执行。旧客户端固定 HTML 在 batch-8 下载，随后由 expansion 校验并使用。

| 组 | 顺序执行的完整命令 |
| --- | --- |
| batch-1 | `test:browser`、`test:qol-expansion`、`test:station-tier2`、`test:shooting` |
| batch-2 | `test:save-browser`、`test:asset-load`、`test:hud-release`、`test:issue26-inventory`、`test:mall-passages` |
| batch-3 | `test:desktop-input`、`test:portable`、`test:shop-drag`、`test:title`、`test:title-water`、`test:opening` |
| batch-4 | `test:issue26-station`、`test:issue26-spatial`、`test:tactical`、`test:art`、`test:systems`、`test:mobile` |
| batch-5 | `test:buildings`、`test:station-tier1`、`test:shop-feedback`、`test:mobile-ux`、`test:range`、`test:gunsmith-bench` |
| batch-6 | `test:enemy-720`、`test:loot-target`、`test:mall-sample`、`test:qol`、`test:coast-render-targets`、`test:hideout`、`test:gunsmith-flow` |
| batch-7 | `test:enemy-touch`、`test:raid-default`、`test:ui`、`test:mall-landing`、`test:coast-animation`、`test:station-relief`、`test:station-reset` |
| batch-8 | `test:enemy-1080`、`test:expansion`、`test:loot` |

2.5D 收尾（#64）后，CI 没有显卡、2.5D 用软件渲染，迁移到 2.5D 的行动套件变慢：loot 一套约 30 分钟，原 batch-8 超过 45 分钟的 job 上限。因此把 mall-passages 移到 batch-2 末尾、systems 和 mobile 移到 batch-4 末尾，batch-8 只留 expansion（带旧客户端）和 loot。

#61 当时按较慢运行样本重排，并将新增 raid-default 的实测 124 秒纳入负载。此前 35 套件的中位 17:33 和约 13–14 分钟调度回放仅为 #61 的研究输入；当前已经是原 42 套件的 44 条执行命令（#106 加入改枪两套），实际收益必须使用同产品字节的新基线/候选对照，结果见承接 PR，不能把旧回放当成本次 CI 通过。

2026-10-23 的 #78 最初新增 `test:enemy` 到 batch-8。#81 与 #104 随后扩展至十八原型、三视口的街区及商场验收；早期“六组合约 8 秒”不再代表当前套件。

### 敌人套件的完整视口分片（#61）

2026-10-27 续作仍沿 [PR #112](https://github.com/xuys2025/escape-bincov/pull/112)。该 PR 尚未合入，因此主线仍把完整 `enemy` 放在 batch-8。定位用 main `8b59019` 的[完整运行](https://github.com/xuys2025/escape-bincov/actions/runs/40520775653)中，该组套件共 1108.453 秒，其中 `expansion` 35.685 秒、`loot` 238.195 秒、`enemy` 834.570 秒；其他七组为 212.468–473.274 秒。另四轮成功运行的 `enemy` 为 641.85–705.62 秒，说明优先拆完整视口仍针对当前瓶颈。此处是定位样本，候选收益以最新准确 head 的完整 CI 为准。维护者指定合并顺序为 #115 → #129 → #108 → #112；当前在已接受 main `9400cf6`（含前两项）上同步前置 #108 的准确 head `aa68c3b`，提前验证组合。合并前确认前三项都已入 main，并核对最终合成树与已验版本一致，避免在无内容变化时额外重跑同一组合。

2026-10-25 研究最近三个成功 main 完整运行：[40102916226](https://github.com/xuys2025/escape-bincov/actions/runs/40102916226)、[40101157725](https://github.com/xuys2025/escape-bincov/actions/runs/40101157725)、[40099269052](https://github.com/xuys2025/escape-bincov/actions/runs/40099269052)。触发到必需门禁分别为 18:32、21:22、20:43；batch-8 的套件步骤为 15:14、17:45、17:38，第二慢 batch-1 约 7:45。主机缓存全命中、浏览器组排队仅 2–3 秒，瓶颈在套件执行。单 timing artifact 和单 job logs 下载在调研环境返回代理 403，官方整 run logs ZIP 可读，补得完整 enemy 命令分别为 689.25、796.50、792.04 秒；对应 CPU 为 EPYC 9V74、Xeon 8573C、EPYC 7763（均 4 核）。三轮均为 Node 24.21.0、Chromium build 1243、lavapipe（llvmpipe / LLVM 20.1.2，Vulkan 1.4.318）。

[PR #112 首轮 be62a79](https://github.com/xuys2025/escape-bincov/actions/runs/40161563791) 的三片实际为 207.37、265.70、195.42 秒（720、1080、touch），共 165 条原 case 通过，页面错误/外部请求均为零；CPU 分别为 EPYC 9V45、9V45、7763（均 4 核），浏览器/Node/renderer 与基线相同。各片身份、配置和六单元/case 并集也从真实输出独立复核。portable 输出证明候选与最近两轮 main 的实际 HTML SHA-256 均为 `b309e11f248f46e9c10ba08d0056aab8160212adb20ecab35bedf54c1d8bfe7f`；更早 `c587685` 的游戏字节不同，不混入同产品对照。首轮整体因既有 station-reset S6 的精确 toast 等待失败，最终门禁正确阻断，不能把 10:18 到失败门禁算作完整通过或提速验收；CPU 不同的小样本也不是受控三轮性能结论。

[enemy-browser-plan.mjs](../scripts/enemy-browser-plan.mjs) 声明三个互斥视口链：`enemy-720`（1280×720）、`enemy-1080`（1920×1080）、`enemy-touch`（844×390，原生触控仿真）。每片完整执行该视口原有的街区与商场流程：阶段/美术夹具、部署、真实输入、付费攻击、暂停与刷新链均不切断；不共享跨 runner 的页面或存档。三片分别覆盖 67、59、39 条既有 case，共 165 条。较大的 1920 片放在原 batch-8，其余两片分担给历史较短的 batch-6、batch-7，仍最多八台 runner。

`pnpm test:enemy` 保留原全量入口与先全部街区、再全部商场的顺序；本地也可单独运行 `pnpm test:enemy-720`、`pnpm test:enemy-1080`、`pnpm test:enemy-touch`。全量报告仍写 `test-results/enemy-browser/report.json`，三片分别写同目录下各片 ID 的子目录。完整入口登记为手动聚合命令，其全部内容在 CI 由三片精确覆盖；没有将原回归改为可省略诊断。

每条视口链完成全部原断言后才写完成证明。组执行器将通过的证明装入原耗时行，独立门禁再核对六个完整街区/商场单元、全部 case ID、原视口/离线/触控配置，以及 run/SHA/attempt 和当前套件执行时间窗。缺片、零选择、重复/遗漏 case、未完成链、旧报告或配置变化均失败；原退出状态门禁同时保留。覆盖证明不新增每 case 耗时，也不宣称已有性能收益：准确候选 CI、合并后完整 main 及同产品对照仍须实际运行。

同一 PR 的 S6 后续只修观测顺序：确认点击前先断言没有旧的同文案 toast，再预先等待本次精确可见反馈，点击后仍等待原 promise；20 秒、存储对话框、peer 原始字节/副本、写次数及无下载断言保留。该 toast 在 3.1 秒后删除，旧脚本在点击返回后才开始观察。main 旧脚本与候选均在真实 UI 下加入相同 3.5 秒控制端延迟，并记录实际 DOM：旧版只有 S6 失败（其他 13 步通过），候选 14 步全过，两者都实际显示并删除了正确错误反馈。这个负对照证明后置等待的测试缺口，不证明已经还原首轮 CI 的具体时序；正常不加延迟的完整回归也为 14/14，通过时页面错误/外部请求均为零；控制诊断与正常验收分别记录。准确新 head CI 与后续性能结果以 [PR #112](https://github.com/xuys2025/escape-bincov/pull/112) 为准。

2026-10-27 的 #28 M2-05 新增 `test:gunsmith-bench` 到 batch-5：真实院子和旧页签打开改枪工作台，预览不写入、确认写入一次、换护木带走导轨件、换小弹匣卸弹、换枪和关闭先询问，1280×720 与 1920×1080 截图；手机版（M2-06）在 844×390、740×300、640×300、390×844 点按完成；预设（M2-07）；改枪图（M2-10）和 Sol 的预览逐像素相同、进出工作台 20 次缓存不超上限；本地约 1 分钟。命令计数同步为 41。

2026-10-27 的 #28 M2-14 新增 `test:gunsmith-flow` 到 batch-6：旧页签上买 G17 和两件配件、在工作台装上、装备、出击（手里的枪按配置画、弹匣 24 发）、刷新后恢复、撤离带回原样、再出击死亡后枪和配件一起丢失，1280×720 与 1920×1080；手机 740×300 出击、恢复、死亡。本地约 30 秒。命令计数同步为 42。

每组可在依赖和 Chromium 安装后用 `node scripts/ci/run-browser.mjs batch-2` 运行；batch-8 另需按工作流下载真实旧客户端。执行失败会立即停止本组后续套件并标记未运行，其他组照常完成。保留 45 分钟 job 超时，不额外缩短套件预算。

## 浏览器 job 的主机环境：字体、Chromium 与渲染器

2026-10-22 起（#61）。浏览器 job 准备环境时不再经过 apt 镜像：

- **字体**：[fonts-noble.lock](../scripts/ci/fonts-noble.lock) 固定 10 个 Ubuntu 24.04 字体包的版本和 SHA-256，即原来 `playwright install --with-deps chromium` 在 runner 上新装的 9 个（含 Playwright 自带的中日文后备字体 wqy-zenhei、ipafont-gothic），加上截图用的 `fonts-noto-cjk`。截图看到的字体集合与以前相同。
- **lavapipe**：Mesa 的 `mesa-vulkan-drivers`，版本跟随 runner 自己的 Mesa，SHA-256 取自 runner 的 apt 列表，没有时取 Ubuntu 的 HTTPS 包索引。runner 已自带时跳过。
- **缓存**：两者都放在 Actions 缓存里，key 由锁文件、[host-packages.sh](../scripts/ci/host-packages.sh) 和 runner 的 Mesa 版本决定。未命中时才下载，依次尝试 archive.ubuntu.com、kernel.org 镜像、Azure 镜像（lavapipe 最后还有 Launchpad，它保留被取代的旧版本）；低于 300 kB/s 持续 15 秒就换源，校验失败也换源，整步最长 10 分钟。main 的运行写入的缓存所有 PR 都能用。
- **安装**：用 `dpkg -i` 装本地文件。不用 `apt-get install ./x.deb`：同版本时 apt 会改从镜像下载。将来的镜像若缺某个依赖，才由 apt 补装并留警告。装完核对每个字体包的版本，以及 fontconfig 能看到 Noto Sans CJK。
- **Chromium**：`pnpm exec playwright install chromium` 只从 Playwright CDN 下载浏览器（约 2 秒）。Chromium 的运行库已随 runner 预装的 Google Chrome 装好；若 Chromium 起不来，才退回 `--with-deps` 并留警告。

起因：2026-10-22 Azure 的 Ubuntu 镜像只有几十 kB/s（[actions/runner-images#14823](https://github.com/actions/runner-images/issues/14823)、[#15040](https://github.com/actions/runner-images/issues/15040)），apt 的超时只管完全没有数据的情况，单个 job 光安装就花了 15–26 分钟。

**渲染器**：浏览器 job 设置 `BINCOV_CHROME_ARGS`，WebGL 改走 lavapipe（Mesa 在 CPU 上实现的 Vulkan），不再用 Chromium 自带的 SwiftShader。2.5D 画面在 CI 上主要耗在软件渲染上。本地（WSL、Mesa 26、限 4 核）对比：1920×1080 帧时间从约 96 ms 降到约 17 ms；art、coast-animation、mall-sample、title、title-water、opening、coast-render-targets、raid-default、issue26-spatial 全部通过，用时约为原来的一半。

- `--ignore-gpu-blocklist` 必须加，否则 Chromium 把软件驱动列入黑名单、直接关掉 WebGL。
- `--disable-accelerated-2d-canvas --disable-gpu-rasterization --disable-gpu-compositing` 让 2D canvas、页面光栅化和合成仍走以前的 CPU 路径，只换 WebGL：WebGL 渲染完回读给软件合成器，和 SwiftShader 时一样。这样 art 的 Canvas2D 审查图与以前逐像素一致。lavapipe 上的 GPU 合成反而更慢，所以这一组参数也是最快的。
- 2.5D 场景截图的像素会因光栅器不同而变化，现有断言都是阈值或相对比较，本地均通过。
- 本地运行不设这个变量，行为不变。

[check-renderer.mjs](../scripts/ci/check-renderer.mjs) 在套件之前，用与套件完全相同的启动参数打开 Chromium，要求 WebGL 渲染器匹配 `BINCOV_EXPECT_RENDERER`（`Vulkan.*llvmpipe`）。驱动缺失时 Chromium 不会退回 SwiftShader，而是没有 WebGL，所以这一步失败就说明换渲染器没成功，不会悄悄回到旧渲染器。渲染器、Chromium 的 2D/光栅/合成状态和 CPU 型号写进 job Summary；渲染器和 CPU 也写进每组的耗时报告，汇总表多出这两列。runner 的 CPU 快慢相差约 2.5 倍，对比耗时必须带上它们。

升级 Playwright 或 runner 系统时，用 `pnpm exec playwright install-deps --dry-run chromium` 核对它要装的字体，再更新锁文件。

## 耗时与执行证据

每条套件开始和结束时写 JSON，记录组、套件 ID/命令、状态、退出码/信号、单调时钟耗时、run/attempt/SHA 及 Node、Playwright、对应 Chromium 构建元信息。Chromium 元信息来自已安装 Playwright 的浏览器清单，实际浏览器版本仍以原浏览器报告为准。不记录环境变量全集或凭据。

浏览器组 Summary 展示每条套件时长；`Build and test` 在原结果门禁之外下载并核对全部预期组和套件报告，再汇总耗时。缺报告、错误运行/提交、失败/中断、未执行/重复/遗漏套件及无效时长均不能放行。报告代表完整套件或已声明完整视口分片的实际执行，不宣称已经完成每个 case 的新计时；原测试报告仍保留。敌人分片另验上述 case 全集、空选择及分片完整性，其他套件没有自动获得分片能力。

这些耗时表不含 runner 排队、安装、构建或 Pages 等待；评估整条 CI 时用 Actions job/step 时间另行拆分，既报告触发到必需门禁的墙钟等待，也报告累计 runner 分钟。Pages 与镜像激活另计。

诊断制品 `browser-evidence-<group>-attempt-<n>` 和耗时制品 `browser-timing-<group>-attempt-<n>` 保留 14 天；构建制品仍保留 1 天。JSON 文件为 `<group>-attempt-<n>.json`，本地无 Actions 环境时使用 `local` 后缀。仅重跑失败任务时，汇总读取同一 run/SHA 下各组最新报告，允许保留之前成功组；最新失败不能退回旧成功，未知文件或未来 attempt 拒绝通过。原 GitHub job 结果门禁同时生效。失败或取消不能被计成成功，首败与重跑结果分列。八组只限制一次矩阵的并行度，多个 PR 可同时各用八台，记录并发与排队影响。

增加浏览器测试时更新 package.json、套件清单、覆盖测试和本表。工作流矩阵必须与清单一致；修改组名会改变主线证据要求。工作流/清单/测试属于非文档指纹，因此新策略 PR 和首次 main 必须全量执行；完整 main 通过后文档快速通道才能复用新证据。旧客户端下载必须随消费者迁组，新增输出目录不得覆盖其他报告。

## Pages 与镜像

main 即便走文档快速通道，也从本次重新构建并校验的制品正常执行 `Deploy Pages` 和离线包发布。相同游戏字节已有完整 main 回归证据，本次单测与构建仍需通过。

镜像对 `Build and test`、`Deploy Pages` 的成功要求和检查名不变。提交里已经没有 HTML 和发布清单，镜像（服务器脚本不在本仓库）改读 `main-latest` 发布页的清单 `https://github.com/xuys2025/escape-bincov/releases/download/main-latest/release-manifest.json`：

1. 清单的 `commit` 是构建这些文件的 main 提交，`run` 是那次 CI 运行。用 `run` 照旧核对运行（main push、成功、必需 job 齐全），并要求运行的 `head_sha` 等于 `commit`。
2. 要同步的 HTML（Pages 上的，或发布页 `Escape-Bincov-web.zip` 里的 `index.html`）SHA-256 等于 `htmlSha256`。
3. 不一致时本轮不同步，下次再试。Pages 部署和发布是两个并行的 job，期间又有新的 main 合入时会短暂不一致；不要退回去读旧提交里的文件。

PR 不部署，main 新代码必须完整回归；浏览器首次采用本策略的 PR 和合并后主线都需要全量通过。

## 构建与离线包发布

`pnpm build` 和 `pnpm package` 写出的 `dist/index.html`、`start the game.html`、`release/` 下的两个 ZIP 与 `release-manifest.json` 都是生成物：不入库，由 `.gitignore` 忽略，[generated-files.test.mjs](../scripts/ci/generated-files.test.mjs) 拒绝提交。本地浏览器测试、`test:portable` 和根目录的三个试玩跳转页（`试枪场.html`、`城中村试玩.html`、`商场试玩.html`）都读本地生成的文件，所以要先打包。2026-10-24 以前这些文件随源码提交，任意两个改游戏代码的 PR 都会在它们上冲突，只能合并后重新打包、再跑一轮 CI。

- 每次运行由 build job 打包一次，上传为 `built-game` 制品（保留 1 天），浏览器组与发布都用它并先核对 SHA-256。PR 不发布任何东西。
- CI 打包时设置 `BINCOV_BUILD_COMMIT`、`BINCOV_BUILD_RUN`，清单因此多出 `commit` 和 `run` 两项；本地打包没有这两项。发布 job 在清单的 `commit` 不是本次提交时拒绝发布。
- main 的 `Build and test` 通过后，`Deploy Pages` 部署 `dist/`，`Publish offline release` 用 [publish-release.sh](../scripts/ci/publish-release.sh) 更新滚动预发布 [`main-latest`](https://github.com/xuys2025/escape-bincov/releases/tag/main-latest)：标签移到本次提交，两个 ZIP 和清单按同名替换，所以 [README](../README.md) 的下载地址不变；发布说明写明提交和运行。`main-latest` 是预发布，不抢正式版本（v0.2.0）的 Latest 标记。只有这一个 job 有 `contents: write`。
- 发布 job 失败会让这次 main 运行失败，它也就不能作为文档快速通道的复用证据。一天内只重跑失败的 job 即可（`built-game` 只保留 1 天，过期后整体重跑）。较新的 main push 会取消还在跑的旧运行；万一恰好取消在替换文件的几秒里，缺的文件要等较新的运行发布后才补上。
- 旧客户端：batch-8 下载的四份旧 HTML 来自历史提交里的 `dist/index.html`，历史保留，固定链接仍然有效。以后的提交里没有 HTML，新增固定旧客户端时，要么从该提交的源码重新构建（构建可复现，脚本照样核对哈希），要么在 `main-latest` 被替换前保存它的文件；用哪种由新增固定的 PR 一并定下。
- 同步 main 时，若旧分支还改着这些文件，Git 会报“对方删除、我方修改”的冲突：保留删除（`git rm` 这几个路径），不要把它们加回来。

## 本次未改变的验收

真实 120 秒训练、存档写入失败回滚、多窗口冲突、旧档兼容和离线检查保持原样。没有以缩短等待、改阈值或自动重试掩盖失败。2026-10-22 起 CI 换用 lavapipe 渲染 WebGL、主机包改走缓存（见上文“浏览器 job 的主机环境”），套件和断言不变。PR 结果复用、录像优化留待实际耗时和失败证据支持后再做。
