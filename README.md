<div align="center">

# 🌊 逃离滨科夫

**E S C A P E  B I N C O V**

**台风过后，海没有退去。带上最后一匣子弹，活着回到水产站。**

[![CI & Pages](https://github.com/xuys2025/escape-bincov/actions/workflows/ci-pages.yml/badge.svg)](https://github.com/xuys2025/escape-bincov/actions/workflows/ci-pages.yml)
![Version](https://img.shields.io/badge/package-0.2.0-c9d58c?style=flat-square&labelColor=142323)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-77a79d?style=flat-square&labelColor=142323)
![Phaser](https://img.shields.io/badge/Phaser-3.90.0-cb906b?style=flat-square&labelColor=142323)
![PixiJS](https://img.shields.io/badge/PixiJS-8.22.0-cb906b?style=flat-square&labelColor=142323)

### [▶️ 在线试玩](https://xuys2025.github.io/escape-bincov/) · [🏘️ 城中村样板](https://xuys2025.github.io/escape-bincov/?sample=village) · [📦 下载离线版](https://github.com/xuys2025/escape-bincov/raw/refs/heads/main/release/Escape-Bincov-portable.zip)

<a href="https://xuys2025.github.io/escape-bincov/">
  <img src="docs/station-relief-20261011/evidence/entry-1920x1080.png" alt="水产站雨夜院子：院门、火桶、居民与整备快捷入口" width="100%">
</a>

<sub>实际构建截图 · 单人撤离生存 · 无账号 · 单文件离线运行 · 部分人物与场景仍为占位素材</sub>

</div>

## 🎒 回来，才算带走

超强台风与异常赤潮封锁了虚构的滨科夫县。你从滨科夫水产站出发，在限时行动中搜集物资、应对交战，带着战利品回来交易、交任务、修建设施，再准备下一次出击。

游戏采用俯视角像素画面，**2.5D 水产站院子已成为默认据点入口**，城中村也提供接入真实游戏逻辑与存档的 2.5D 可玩样板。项目仍在开发中，已有完整的「整备 → 出击 → 搜刮与交战 → 撤离或失败 → 回站」单人循环。

> 本页于 **2026-10-12** 按已合并至 `main` 的内容整理，核对基线为 [`1dbacb4`](https://github.com/xuys2025/escape-bincov/commit/1dbacb41eccf5441b5f2e403fe284a6eca9f67f0)。包版本号仍为 `0.2.0`；[v0.2.0 公告](docs/releases/v0.2.0.md)记录的是早期发版，后续已合并功能见下文。最新构建与上线状态以 [Actions](https://github.com/xuys2025/escape-bincov/actions/workflows/ci-pages.yml) 为准。

## 🏚️ 现在可以玩什么

| 内容 | 已接入的玩法 |
| --- | --- |
| 水产站院子 | 雨夜院落、进屋揭顶、人物互动、修复供电；可步行、点击寻路，也可用快捷栏直接打开功能。 |
| 整备与交易 | 仓库、背包、安全箱、武器与护符；拖放、旋转、拆分物品；修理铺和卫生所先加入购物车，再统一结算。 |
| 据点成长 | 电台任务、仓库扩建、身体与成长，以及休息区、医疗区、训练区、工作台、黑市五项设施；支持生产、领取与实际走动训练。 |
| 行动 | 三个区域入口、枪械与近战、箱子和尸体搜刮、地图与撤离指引；每局限时 10 分钟，撤离需要停稳并按住交互键 3 秒。 |
| 潮汐与生存 | 行动第 4 分 30 秒预警、第 5 分钟潮位变化；留意污染、流血、水分、饱食与携行重量。 |
| 存档与恢复 | 浏览器本地保存、检查点续局、JSON 备份迁移；交易与结算写入失败可重试，多窗口冲突有保护。 |

出击面板提供以下区域，**2.5D 样板仅覆盖其中一部分**：

| 区域 | 普通入口 | 带 `?sample=village` 的入口 |
| --- | --- | --- |
| 沿海封锁区 | 经典沿海行动 | 相同 |
| 沿海街区 | 可进入建筑的沿海行动 | 使用 PixiJS 城中村样板；街口以外仍有通用占位画面 |
| 滨湾商场 | 两层与露台的商场行动 | 相同 |

普通局内仍由 Phaser 绘制；院子与城中村样板使用 PixiJS。二者共用正式的会话、存档和交易服务。院子画面启动失败时会回到旧页签界面；玩家也可以主动切换。

![训练区与设施面板：真实训练进度、修建材料与功能页签](docs/station-tier2-20261011/evidence/final/training-panel-1280x720.png)

<sub>本页复用 2026-10-11 的实际构建验收截图，包含测试用进度和物资配置，不代表新档初始资源。截图来源：[进站验收](docs/station-relief-20261011/README.md)、[训练与补给验收](docs/station-tier2-20261011/README.md)。</sub>

## ▶️ 开始第一局

**在线：** 用电脑端 Chrome 或 Edge 打开 [GitHub Pages](https://xuys2025.github.io/escape-bincov/)。页面加载完成后，游戏运行无需外部素材、账号或服务器连接。

**离线：** 下载 [便携 ZIP](https://github.com/xuys2025/escape-bincov/raw/refs/heads/main/release/Escape-Bincov-portable.zip)，解压到固定目录，双击 `start the game.html`。游玩无需 Node.js 或联网；若打开了编辑器，请右键选择 Chrome 或 Edge。

1. **进站整备**：标题页点击「进入」到院子，按 `Tab` 打开整备，检查主武器、备用弹药和药品。购买的物资结算后进入仓库，需要自行整理到背包。
2. **选择区域**：走到院门互动，或按 `G` 打开「出击准备」，选区域后出击。第一次可将行动种子留空。
3. **搜刮与交战**：`M` 看地图与撤离点，`E` 拾取或打开箱子、尸体，`Tab` 整理背包。背包、搜刮和地图打开时，行动仍继续。
4. **及时撤离**：到达本局启用的撤离区，停稳并按住 `E` 满 3 秒。成功保存结算后，在结果页返回水产站。

成功撤离会保留带回的物资；死亡、超时或放弃会失去背包物资与主武器，安全箱物品和水手匕首保留。负重上限会受成长等状态影响，以界面显示为准。

### 试玩城中村 2.5D 样板

打开 [城中村样板入口](https://xuys2025.github.io/escape-bincov/?sample=village)，进院子后在出击面板选择 **「沿海街区」**，种子留空。该入口会选择适合从样板街口开始的种子；手填种子可能出生在尚未精修的区域。普通入口的沿海街区继续使用原局内画面。

本地仓库可双击根目录的 `城中村试玩.html`。使用下载的便携包时，先正常打开游戏，再在**浏览器地址栏**的 `.html` 后追加 `?sample=village`；不要把带问号的字符串当文件名打开。样板和普通入口在同一网站使用同一份存档，换入口前建议先导出备份。

### 保存与迁移

存档保存在当前浏览器中，**没有云存档**。进入院子会受控升级旧存档并启用成长系统，保留原有的钱、物品、任务和统计。有进行中的行动时，从最近成功写入的检查点恢复，少量未保存进度可能回退。

换浏览器、网站或本地文件路径前，在院子按 `Esc` 打开菜单，选择「导出存档」，再到新入口「导入存档」。导入需要确认覆盖，两份进度不会合并。遇到保存失败，请按界面提示重试或先导出备份。

## ⌨️ 操作

### 水产站院子

| 输入 | 动作 |
| --- | --- |
| `W A S D` / 方向键，`Shift` | 移动，按住快走 |
| 左键点地面 / 人物或设施 | 走到目标位置 / 走近并打开对应功能 |
| `E` / 空格 | 与附近人物或设施互动 |
| `1`～`7` | 整备、修理铺、卫生所、任务、设施、身体、出击 |
| `Tab` / `J` / `C` / `G` | 整备 / 电台任务 / 身体与成长 / 出击准备 |
| `0` | 切换到旧页签界面；可从该界面返回院子 |
| 滚轮 / `+` / `-` | 缩放视野 |
| `Esc` | 关闭面板，或打开菜单；通电动画中可跳过 |

### 行动中

| 输入 | 动作 |
| --- | --- |
| `W A S D` / `Shift` | 移动 / 冲刺 |
| 鼠标 / 左键 / 右键 | 瞄准 / 攻击 / 精瞄 |
| `R` / `1` / `2` | 换弹 / 主武器 / 水手匕首 |
| `E` | 拾取、搜刮、开门或阅读；有效撤离区内按住 3 秒撤离 |
| 滚轮 | 切换附近箱子、尸体目标 |
| `Q` | 使用背包中的绷带或急救包 |
| `Tab` / `M` | 背包 / 地图，均不暂停 |
| `Esc` | 关闭面板；没有面板时暂停，点击「继续」恢复 |

整理库存可拖放或点选格位；拖动物品时 `R` 旋转、`Esc` 取消。商店购物车不支持旋转，物品加入待买或待卖后仍需点击「结算」。首次进入请点击游戏以启动声音，音量可在院子菜单或局内暂停面板调整。

### 📱 手机触控

院子支持摇杆移动和点击互动，窄屏通过「功能」按钮打开整备、商店等面板；行动中使用双摇杆与屏幕按钮，推荐横屏。库存支持点选物品与格位。切到后台后，行动会暂停，回来需点击「继续」。

移动端目前通过的主要是 Chromium 视口与触控仿真；iPhone、Android 真机手感和性能仍待验收。没有手柄支持。

## 🚧 当前边界与反馈

- **美术仍在补齐**：院子四位主要人物和关键道具、城中村首批素材已接入；居民、敌人及部分环境仍有占位画面、缺帧或画风差异。全沿海精修、院子昼夜变化尚未完成。
- **长期稳定性仍需验证**：资源释放已有专项修复与回归，总堆增长的归因和长期内存验收仍为 `PARTIAL`；历史偶发存档、音频异常尚未确认根因。
- **自动通过不等于真人验收**：真机、实际 GPU 性能、长时间手感与平衡性仍需试玩反馈。多人联机、云存档未实现。

玩家遇到的问题请补到 [玩家反馈 #26](https://github.com/xuys2025/escape-bincov/issues/26)，写明入口、浏览器/设备、操作步骤和截图；开发与自动验收留下的事项集中在 [AI 遗留清单 #32](https://github.com/xuys2025/escape-bincov/issues/32)。

## 🛠️ 本地开发

需要 **Node.js 24** 与 **pnpm 11.19.0**。从最新 `main` 开始：

```bash
git clone https://github.com/xuys2025/escape-bincov.git
cd escape-bincov
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:4173`；城中村使用 `http://127.0.0.1:4173/?sample=village`，再选沿海街区。修改源码后刷新会重新构建。

| 命令 | 用途 |
| --- | --- |
| `pnpm test` | 领域规则、世界、Runtime、存档与事务单测 |
| `pnpm build` | 严格类型检查，生成 `dist/index.html` 与 `start the game.html` |
| `pnpm package` | 构建并生成离线 ZIP、网页 ZIP 和 `docs/release-manifest.json` |
| `pnpm test:station` / `pnpm test:hideout` | 院子交互与宿主切换 / 据点接口浏览器回归 |
| `pnpm test:station-tier1` / `pnpm test:station-tier2` / `pnpm test:station-relief` | 计数与护符 / 训练与补给 / 进站救济专项 |
| `node scripts/coast-sample-test.mjs` | 真实 Runtime 上的城中村样板门禁 |
| `node scripts/coast-audio-test.mjs` | 样板实际音频输出、暂停与恢复 |
| `pnpm test:shop-drag` / `pnpm test:save-browser` | 商店拖放及触控 / 存档失败、导入导出与回滚 |
| `pnpm test:browser` / `pnpm test:desktop-input` | 基础浏览器流程 / 桌面输入 |
| `pnpm test:mobile` / `pnpm test:mobile-ux` | 手机视口、触控与面板操作 |
| `pnpm test:portable` | 实际解压离线 ZIP 并验证启动与操作 |
| `pnpm test:play` | 约 10 分钟真实计时自动行动，不能替代真人试玩 |

浏览器检查前先执行 `pnpm package` 和 `pnpm exec playwright install chromium`；Linux CI 使用 `--with-deps`。已有 Chrome 可通过环境变量 `BINCOV_CHROME` 指定路径。Linux/macOS 便携包检查还需要 Python 3。完整命令见 [package.json](package.json)，测试选取与环境见 [开发手册](docs/AGENT-HANDBOOK.md)。

## 🤝 协作与发布

本仓库是项目权威来源，`main` 是已接受版本。接手先读 [AGENTS.md](AGENTS.md)、[开发手册](docs/AGENT-HANDBOOK.md)、[任务清单](docs/WORK-QUEUE.md) 和 [handoff.md](handoff.md)，再核对相关 PR 的实时状态；历史报告中的“待审”“未合并”只代表当时记录。

同一交付目标继续原分支与 PR，独立任务才另开分支；不得覆盖他人工作或直接推送 `main`。源码、打包脚本或游玩说明变化后按仓库要求重新打包。存档兼容、写入失败回滚与单文件离线能力必须保留。

PR 经 CI 验证、维护者确认合并后，`main` 的 CI 成功才会更新 GitHub Pages。**PR 提交、PR 合并和试玩上线是三个不同状态**；公开试玩以最后一次成功部署为准。托管与存档迁移见 [部署手册](docs/DEPLOYMENT.md) 和 [大陆在线游玩指南](docs/ONLINE-CHINA.md)。

## 📚 文档导航

| 内容 | 入口 |
| --- | --- |
| 院子与城中村整合范围、发布边界 | [整合说明](docs/IMPLEMENTATION-RELEASE.md) |
| 水产站院子实现、快捷入口与真实接口 | [院子接线说明](docs/station-yard/README.md) · [HideoutRuntime](docs/hideout-runtime/README.md) |
| 城中村逻辑与样板接线历史 | [Coast Runtime](docs/COAST-RUNTIME-SAMPLE.md) · [样板接线](docs/COAST-SAMPLE-VIEW.md) |
| 游戏规则、物品与搜刮 | [游玩手册](docs/PLAYING.md) · [搜刮说明](docs/LOOTING.md) |
| 成长、基地、建筑与商场设计 | [RPG 系统](docs/RPG-SYSTEM-DESIGN.md) · [建筑逻辑](docs/BUILDING-LOGIC.md) · [商场地图](docs/MALL-VALIDATION-MAP.md) |
| 世界观与长线故事，含待实现内容 | [世界与主线](docs/WORLD-REGIONS-STORY.md) · [《等海退去》](docs/MAIN-STORY.md) |
| 改枪系统候选：20 枪、100 配件，先验证射击基础再实施改装 | [改枪计划](docs/gunsmith/README.md) |
| 技术架构与贡献流程 | [架构](docs/ARCHITECTURE.md) · [贡献指南](CONTRIBUTING.md) · [任务清单](docs/WORK-QUEUE.md) |
| 历史版本与验收记录 | [更新记录](CHANGELOG.md) · [历史证据归档](docs/IMPLEMENTATION-ARCHIVE.md) · [交接记录](handoff.md) |

设计文档描述的长期目标不等于当前已实现内容；旧验收报告中的测试数量与结论仅适用于其注明的提交。

## 🎨 素材与许可

画面混合使用程序绘制和已内嵌的 PNG 素材，包含 AI 生成并经整理、校验的角色、道具与场景图片；声音通过 Web Audio 合成。游戏运行不依赖外部素材或 CDN，地名、组织、人物与故事均为虚构。

Phaser、PixiJS 及其依赖的许可，以及内嵌字体的 OFL 声明，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，声明也随 HTML 保留。**公开仓库不等于已授予开源许可证**；原创源码目前未另行附加许可证。

<div align="center">

[🌊 进入滨科夫](https://xuys2025.github.io/escape-bincov/) · [🐛 玩家反馈](https://github.com/xuys2025/escape-bincov/issues/26) · [🔧 开发遗留](https://github.com/xuys2025/escape-bincov/issues/32)

</div>
