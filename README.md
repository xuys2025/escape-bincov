<div align="center">

# 🌊 逃离滨科夫

**E S C A P E  B I N C O V**

**台风过后，海没有退去。带上最后一匣子弹，活着回到水产站。**

[![CI & Pages](https://github.com/xuys2025/escape-bincov/actions/workflows/ci-pages.yml/badge.svg)](https://github.com/xuys2025/escape-bincov/actions/workflows/ci-pages.yml)
![Version](https://img.shields.io/badge/version-0.2.0-c9d58c?style=flat-square&labelColor=142323)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-77a79d?style=flat-square&labelColor=142323)
![Phaser](https://img.shields.io/badge/Phaser-3.90.0-cb906b?style=flat-square&labelColor=142323)

### [▶️ 在线试玩](https://xuys2025.github.io/escape-bincov/) · [📦 下载离线版](https://github.com/xuys2025/escape-bincov/raw/refs/heads/main/release/Escape-Bincov-portable.zip) · [🤖 Agent 开发入口](AGENTS.md)

<a href="https://xuys2025.github.io/escape-bincov/">
  <img src="docs/title-parallax/menu-v4/centre.png" alt="逃离滨科夫实际主界面：从水产站值守室的灯下望向雨夜港口与系泊渔船" width="100%">
</a>

<sub>真实游戏画面 · 桌面键鼠 · 单人撤离生存 · 无账号 · 可离线运行</sub>

</div>

---

## 🎒 回来，才算带走

超强台风与异常赤潮封锁了虚构的滨科夫县。你从滨科夫水产站出发，穿过城中村、水产市场与旧渔港，在 **10 分钟内撤离**，把搜到的物资带回来。

这是一款 **2D 俯视角像素撤离生存原型**：整理装备、搜集物资、应对交战，在限时内撤离。带回的物资可以出售、交付任务，也可以留作下次出击使用。当前提供一张手工地图与完整的单人循环，仍处于早期开发阶段。

> 🌊 **v0.2.0「夜港归来」**：汇集前五个 PR，带来更清楚的整备界面、全新夜港主菜单、手机触控尝鲜与行动中断恢复。[阅读完整发版公告](docs/releases/v0.2.0.md)。手机真机验收仍待完成。

| 🔫 搜刮与交战 | 🌊 会改变路线的潮汐 | 🏚️ 持续发展的水产站 |
| :--- | :--- | :--- |
| 枪械、弹药、匕首与医疗物资；枪声会吸引附近敌人。 | 第 4 分 30 秒预警，第 5 分钟潮位变化；涉水积累污染。 | 商人交易、3 项任务、仓库扩建，以及本地进度保存。 |
| 背包空间与 24 kg 负重上限，需要做取舍。 | 浅滩捷径与部分物资随潮位变化，永久通路始终保留。 | 成功撤离保留战利品；失败丢失背包物资与主武器，安全箱内的物品和水手匕首保留。 |

本分支已接入战术整备、双侧搜刮、商人仓库与字体 B；[查看实施、逐图审查和真实截图](docs/tactical-ui/README.txt)。

## 📸 封锁区现场

![低潮时的沿海封锁区、道路与行动 HUD](docs/tactical-ui/raid-1280.png)

<table>
  <tr>
    <td width="50%"><img src="docs/tactical-ui/after-1280x720.png" alt="水产站整备：仓库、背包和安全箱"><br><b>整备与取舍</b> · 格子背包、装备与安全箱（全物品展示夹具）</td>
    <td width="50%"><img src="docs/tactical-ui/map-1280.png" alt="滨科夫县沿海管制图与当局撤离点"><br><b>路线与撤离</b> · 每局启用两个撤离点</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/tactical-ui/high-tide-1280.png" alt="涨潮后的行动画面"><br><b>潮汐与风险</b> · 留意电台预警和污染积累</td>
    <td width="50%"><img src="docs/tactical-ui/home-1280.png" alt="水产站任务进度与存档导入导出功能"><br><b>带着进度继续</b> · 本地保存与 JSON 备份迁移</td>
  </tr>
</table>

<sub>截图来自 0.1.1 界面精修后的实际运行与自动验收场景。查看 [界面精修记录与前后对照](docs/UI-POLISH.md)。</sub>

[美术研究与前后证据归档](docs/ART-REDRAW.md)保留 #11 的历史成果；核心美术及后续战术界面已由 #20 合入，当前实现见[战术界面记录](docs/tactical-ui/README.txt)。

## 📱 手机触控尝鲜

左盘移动与冲刺，右盘瞄准与持续开火；整备支持点选物品和格位，旋转或切到后台会暂停。刷新后从最近检查点继续。

![手机横屏的双摇杆与战斗按钮](docs/tactical-ui/combat-844.png)

PR #7 候选修复增加药品与附近物品入口、可取消的格位整理和旋转收纳，并修复提示遮挡与短屏反馈；[查看实际画面和验证](docs/MOBILE-EXPERIENCE-FIXES.md)。等待审阅，正式试玩仍以 main 为准。

手机触控已随 **v0.2.0** 提供，目前为尝鲜功能：通过 Chromium 触控仿真，尚未完成 iPhone/Android 真机验收。玩法、恢复协议、竖屏/短屏截图及测试结果见 [移动适配实现记录](docs/MOBILE-IMPLEMENTATION.md)。

## ▶️ 开始你的第一局

**在线：** 用电脑端 Chrome 或 Edge 打开 **[GitHub Pages 试玩](https://xuys2025.github.io/escape-bincov/)**。无需注册账号；网页首次加载需要网络，游戏资源已全部内联。

**离线：** 下载 [便携 ZIP](https://github.com/xuys2025/escape-bincov/raw/refs/heads/main/release/Escape-Bincov-portable.zip)，解压到固定目录，双击 `start the game.html`。游玩无需 Node.js、服务器或联网。

1. **整备**：进入水产站，检查主武器，把备用弹药和药品放进背包。购买物资会先进入仓库。
2. **探索**：点击「出击」，按 `M` 查看绿色撤离点，散落物按 `E` 拾取；箱子和尸体按 `E` 打开双栏，拖入背包或安全箱。
3. **取舍**：按 `Tab` 整理背包；重要小件可放进安全箱。打开背包和地图时，行动继续。
4. **撤离**：到达本局启用的绿色撤离区，停稳并按住 `E` 满 **3 秒**，带着物资回家。

> 💾 **存档在你的浏览器里。** 新版行动在刷新或页面回收后可恢复最近成功检查点，少量未保存进度可能回退；无快照的旧版行动仍按失败处理。换浏览器、文件路径或网站前，在「水产站」页导出存档，再在新入口导入。导入会覆盖该入口的进度，两个存档不会合并；这不是云存档。

<details>
<summary><b>⌨️ 查看完整操作表</b></summary>

| 输入 | 动作 |
| --- | --- |
| `W A S D` | 移动 |
| 鼠标 / 左键 / 右键 | 瞄准 / 攻击 / 精瞄 |
| `Shift` / `R` | 冲刺 / 行动中换弹；拖动物品时 R 旋转预览 |
| `1` / `2` | 主武器 / 水手匕首 |
| `E` | 拾取散落物、打开高亮箱子／尸体、阅读；撤离区内按住 3 秒撤离 |
| 鼠标滚轮 | 在行动画面的附近箱子／尸体列表中切换目标 |
| `Q` | 使用背包中的绷带或急救包 |
| `Tab` / `M` | 背包 / 地图，均不暂停 |
| `Esc` | 取消正在拖动的物品；关闭面板或暂停；指南返回原面板 |

本 PR 的 QOL 候选支持手机点名称搜刮、危险栏、手动拆分与旋转、商店统一结算、出击缺项和局内信息提示。[决议落实](docs/QOL-DECISIONS.md) · [主线整合、最新验证与真机清单](docs/QOL-INTEGRATION.md)。

推荐窗口：1280×720 或 1920×1080。已加入手机触控候选：横屏战斗、左盘移动／冲刺、右盘瞄准／按住连发，按钮完成拾取与撤离；整备支持横竖屏。iPhone/Safari 与 Android 真机验收仍待完成，手柄未适配。

</details>

主界面是一间可以看见港口的像素值守室：移动鼠标时前后景物产生不同幅度的视差，吊灯、渔船、水面、雾、尘埃与雨各自缓慢变化。支持桌面、宽屏和手机横竖屏排布，提供「动态景物」开关，并遵循系统减少动态效果设置。手机触控已开放尝鲜，真机验收待补；实现与验收见 [像素主界面记录](docs/title-parallax/README.md)，旧版夜港主界面见 [历史记录](docs/TITLE-SCREEN.md)。

大陆网络下 GitHub Pages 的访问体验需以实际网络为准；遇到加载问题可使用离线版。备用静态托管方案与存档迁移说明见 [大陆在线游玩指南](docs/ONLINE-CHINA.md)。

## 🛠️ 本地开发

需要 **Node.js 24** 与 **pnpm 11.19.0**。请从这个仓库的最新 `main` 开始，不要以旧 ZIP 或聊天记录覆盖现有代码。

```bash
git clone https://github.com/xuys2025/escape-bincov.git
cd escape-bincov
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:4173`。修改源码后刷新页面会重新构建。

| 命令 | 用途 |
| --- | --- |
| `pnpm test` | 领域规则、地图、存档异常与备份测试 |
| `pnpm build` | 严格类型检查，生成两个独立 HTML 入口 |
| `pnpm package` | 构建游戏，生成离线包、网页包与制品清单 |
| `pnpm test:browser` | 两种分辨率的浏览器回归 |
| `pnpm test:desktop-input` | 触屏电脑键鼠、Esc 音频恢复、无效治疗与输入释放回归 |
| `pnpm test:ui` | 界面布局检查与双分辨率截图 |
| `pnpm test:tactical` | 战术布局、字体 B、20 种物品、旋转裁切、商人买卖与搜刮拖放 |
| `pnpm test:art` | 原生/灰度纹理图集、角色朝向、六区场景及美术恢复检查 |
| `pnpm test:title` | 13 种主界面视口、点阵字体、键盘/点击、分层视差与环境动态、动态开关和 20 次场景往返检查 |
| `pnpm title:art` | 安全派生主菜单视差边缘和字标并更新 manifest；原始生成图不覆盖（`-- --check` 只核对） |
| `pnpm title:evidence` | 生成主菜单截图、录屏、60 秒连续性审计与性能证据（不在 CI 中） |
| `pnpm test:save-browser` | 保存失败、导入导出、任务和升级回归 |
| `pnpm test:loot` | 双栏拖放、指定格、保存回滚、箱子／尸体恢复与三局结算 |
| `pnpm test:loot-target` | 桌面滚轮/手机点选目标、危险栏、指南返回与可访问性 |
| `pnpm test:qol` | 商店结算、任务误售、旋转拆分、出击与局内信息回归 |
| `pnpm test:portable` | 实际解压 ZIP，验证离线启动与操作 |
| `pnpm test:mobile` | 手机视口、多指输入、检查点恢复与故障回滚 |
| `pnpm test:mobile-ux` | 背包出口、附近物品、药品来源、旋转与提示避让回归 |
| `pnpm test:play` | 约 10 分钟真实计时自动玩家，适用于玩法改动 |

浏览器测试前执行 `pnpm exec playwright install chromium`；Linux CI 使用 `--with-deps`。已有 Chrome 可通过 `BINCOV_CHROME` 指定路径。Linux/macOS 的便携包检查还需要 Python 3；更多说明见 [开发手册](docs/AGENT-HANDBOOK.md)。

## 🤖 与其他 agents 协作

**本仓库是项目唯一权威来源，`main` 是已接受版本。所有后续改动通过 PR 交付。**

先读 [AGENTS.md](AGENTS.md)，再读 [Agent 开发与交接手册](docs/AGENT-HANDBOOK.md) 和 [贡献指南](CONTRIBUTING.md)。从[统一任务清单](docs/WORK-QUEUE.md)查找当前任务及承接 PR，同一目标继续原分支；新增想法先登记，独立可验收的交付才新开 PR。当前需求暂停约定、已有 PR 归属和收尾安排也在清单中。

PR 会运行 **CI & Pages / Build and test**；合并至 `main` 并验证通过后，自动将 `dist/` 发布到 GitHub Pages。PR 本身不会覆盖正式试玩。首次公开建仓为初始化导入，后续开发遵循上述流程。

可以把这句话直接交给另一个 agent：

> 请以 https://github.com/xuys2025/escape-bincov 的最新 main 为已接受基线，先读 AGENTS.md、开发手册和 docs/WORK-QUEUE.md，核对相关开放 PR；同一目标继续原分支和 PR，只有独立交付才新建。遵守当前需求冻结范围，完成验证与交接，不直接推送或自行合并 main，最后汇报 PR 链接、测试结果及剩余问题。

## ✅ 当前进度与下一步

**当前版本为 v0.2.0**：前五个 PR 已全部合入，包含界面精修、夜港主菜单、手机触控尝鲜、完整行动恢复、存档基础整理与玩家文案校对。升级步骤和已知限制见 [发版公告](docs/releases/v0.2.0.md)，最新验证以对应提交的 Actions 为准。

**0.1.1 已具备完整单人循环**：整备 → 出击 → 搜集物资/交战 → 撤离或失败 → 结算 → 回站整备。此版本修复了结算保存失败、库存操作回滚与暂停 HUD，并增加备份导入导出。

| 验证 | 已记录结果 |
| --- | --- |
| 代码测试 | 47 项通过 |
| 双分辨率浏览器回归 | 24 步通过 |
| 存档专项 / 离线便携检查 | 7 项 / 6 项通过 |
| 真实计时自动流程 | 约 10 分 19 秒，两次成功撤离 |

上表保留 0.1.1 的完整循环验收记录；本轮界面改动的复测见 [界面精修记录](docs/UI-POLISH.md)，新提交状态以顶部 CI 标识为准。自动玩家可读取场景状态进行寻路和瞄准，不能替代真人手感与平衡性评价。完整方法及边界见 [验收记录](docs/ACCEPTANCE.md)。

下一轮优先关注真人试玩反馈、战斗反馈、局内后半段的目标与威胁，以及存档兼容性。**移动触控与检查点恢复已实现候选版，真机验收待补；多人联机、云存档和手柄尚未实现**，也不属于当前在线托管的能力。

## 📚 文档导航

| 想了解什么 | 从这里开始 |
| --- | --- |
| 潮水与盐度、十二区域势力分布、六阶段主线（新增内容待实现） | [世界观与地图主线](docs/WORLD-REGIONS-STORY.md) |
| v0.2.0 更新亮点、下载与升级 | [完整发版公告](docs/releases/v0.2.0.md) · [更新记录](CHANGELOG.md) |
| 箱子与尸体搜刮、操作与验收 | [搜刮说明](docs/LOOTING.md) |
| 游戏规则、任务、物品与旧存档迁移 | [完整游玩手册](docs/PLAYING.md) |
| RPG 状态、成长、随机爆头、声望、幸运与基地规范 | [系统逻辑与首版数值](docs/RPG-SYSTEM-DESIGN.md) |
| 建筑、RPG 与商场实施任务与验收 | [总实施计划](docs/IMPLEMENTATION-PLAN.md) |
| PR16实施候选、详细计划与73项验收状态 | [实施记录](docs/PR16-IMPLEMENTATION.md) · [详细计划](docs/PR16-DEVELOPMENT-PLAN.md) · [逐项登记](docs/PR16-ACCEPTANCE-REGISTER.md) |
| 当前任务、需求登记与 PR 归属 | [统一任务清单](docs/WORK-QUEUE.md) |
| PR22 完成后的改枪规划：20 枪与 100 配件 | [改枪计划与前置条件](docs/gunsmith/README.md) |
| Agent 必须遵守的规则 | [AGENTS.md](AGENTS.md) |
| 架构、开发流程、验证与交接 | [Agent 开发手册](docs/AGENT-HANDBOOK.md) |
| 应用状态、存档事务与后续扩展 | [架构说明](docs/ARCHITECTURE.md) |
| 建筑布局、互动门窗与跨层追击设计 | [建筑逻辑设计](docs/BUILDING-LOGIC.md)（候选实现与证据见PR16记录） |
| 滨湾商场室内外、两层地图与验收场景 | [商场验证地图](docs/MALL-VALIDATION-MAP.md)（候选实现与证据见PR16记录） |
| 如何贡献、提交 PR | [CONTRIBUTING.md](CONTRIBUTING.md) |
| GitHub Pages 发布、更新与回退 | [部署手册](docs/DEPLOYMENT.md) |
| 大陆网络下的托管选择 | [大陆在线游玩指南](docs/ONLINE-CHINA.md) |
| 界面设计、前后对照与本轮验证 | [界面精修记录](docs/UI-POLISH.md) |
| 手机目标、触控方案、实施阶段与验收门槛 | [2026 移动端适配计划](docs/MOBILE-ADAPTATION-PLAN.md) |
| 移动端操作、完整恢复协议与验证边界 | [移动适配实现](docs/MOBILE-IMPLEMENTATION.md) |
| PR #2 桌面回归修复与前后对照 | [桌面回归修复](docs/DESKTOP-REGRESSION-FIXES.md) |
| 移动体验：背包、搜刮、用药和战斗提示 | [修复记录](docs/MOBILE-EXPERIENCE-FIXES.md)（PR #7 待审） · [基线排查与原计划](docs/PLAYER-FEEDBACK-PLAN.md) |
| 像素值守室主界面、视差、素材与验收 | [像素主界面记录](docs/title-parallax/README.md)、[素材说明](assets/title/README.md) |
| 旧版夜港主界面（历史） | [主界面重制记录](docs/TITLE-SCREEN.md) |
| 玩家文案、统一术语与校对规则 | [文案约定](docs/COPY-GUIDE.md) · [校对记录](docs/COPY-REVIEW.md) |
| 上一轮实现、验证与遗留事项 | [handoff.md](handoff.md) |
| 离线分享及验收证据 | [便携包说明](docs/PORTABLE.md) · [验收记录](docs/ACCEPTANCE.md) |

## 🎨 素材与许可

人物、建筑、物品与环境由项目代码绘制，声音通过 Web Audio 合成；游戏运行不依赖外部素材或 CDN。地名、组织、商人与叙事均为虚构。

Phaser 与 EventEmitter3 的 MIT 声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，也已内联到游戏 HTML。**公开仓库不等于已授予开源许可证**；原创源码目前未另行附加许可证，贡献者不要擅自更改许可或引入来源不明的素材。

<div align="center">

**整理装备，准备出发。**

[🌊 进入滨科夫](https://xuys2025.github.io/escape-bincov/) · [🐛 反馈问题](https://github.com/xuys2025/escape-bincov/issues) · [🔧 提交 PR](https://github.com/xuys2025/escape-bincov/pulls)

</div>
