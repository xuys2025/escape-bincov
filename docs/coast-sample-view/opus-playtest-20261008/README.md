> 合并整理说明：本文结论与历史失败保留，17 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 城中村样板第五轮：真人试玩整改（Opus）

2026-10-08（UTC+8）。原分支 `docs/coast-2-5d-art-design`，从 `05aaee6`（Sol 签收 OPUS-DEATH-01）接手。

**试玩入口：** 双击仓库根目录的 **`城中村试玩.html`**。它会跳转到同目录的离线单文件 `start the game.html?sample=village`。

1. 点「进入水产站」；
2. 种子留空，点「出击」。

出生点固定在已制作的城中村街口，两个撤离点中一定有北线检查口。

## 本轮做了什么

以截图里暴露的四个问题为起点：物品难辨认、人物与武器衔接差、占位画面混杂、试玩入口进不到已制作区域。按「普通菜单进入 → 移动战斗 → 搜刮整理 → 撤离结算」整条流程逐段检查和整改。玩法、Runtime 规则、存档语义和单文件离线均未改动。没有扩展全沿海，没有推送、合并或发布。

| 问题 | 原因 | 整改 |
| --- | --- | --- |
| 入口进不到已制作区域 | 3 个出生点里只有 1 个在样板范围内，所以 2/3 的局从占位区开始；而且必须手动在网址后面加参数 | 新增 `城中村试玩.html` 跳转页。样板模式下种子留空时，从时钟往后取第一个满足条件的种子：出生点在城中村街口，且两个撤离点含北线检查口。这等同于玩家手动填了这个种子，生成规则和存档语义都不变；手动填写的种子照常使用。普通入口（不带 `sample`）完全不变 |
| 地面物品难辨认 | 地面物品只按大类画一个 16 px 方块，手枪、弹药、零件看起来差不多 | 改用游戏自带的 24 px 物品图标，与背包、基地、商店同一套画法，加 1 px 浅色描边和接地阴影。地上的手枪、怀表、9mm、线圈一眼可辨 |
| 人物与武器脱节 | 身体图去掉了手（R07），武器悬在胸前，和身体之间没有连接 | 运行时为人形角色画两条袖管，从肩点连到武器图上的手套：扳机手连握把，长枪的前手连护木，手枪双手握。袖管随瞄准、换弹、挥击旋转，按身体前后关系排序；颜色取 Sol 夹克的实际色。近战武器单手，另一臂下垂 |
| 墙和地面分不清 | Sol 的墙顶平均亮度 124，比沥青（60）、院地（90）、地砖（109）都亮，1 格厚的墙看起来像可以走的平台；无屋顶建筑因此像一堆灰块 | 合成时墙顶乘以 `#8a8780`，亮度降到约 66。保留 Sol 的纹理，边缘条变成亮轮廓。房间、门洞和废墟布局都能一眼看清 |
| 无顶废墟的地面像未完成 | 混凝土地面是一整片平灰 | 程序纹理加上 2×2 格的浇筑缝、砂粒、油渍、细裂缝和碎屑 |
| 玩家在暗沥青上难找 | 玩家穿深橄榄色，背景是深色沥青 | 只给玩家加 1 px 暖色淡描边（透明度 0.38），不同于被遮挡时的实心轮廓 |
| HUD 难读 | 白字直接压在地面上，字号 12–16，没有底板 | 左上状态卡：生命、体力条加粗，带数值；精神、水分、饱食、负重和位置。右下武器卡：真实武器图标、32 px 弹匣数（空弹匣变红，换弹时变色）、备用弹药、医疗数和 Q 键。中上计时。左下按键条。所有卡片都有深色半透明底板。触屏和短屏另有布局 |
| 搜刮时看不见周围 | 搜刮和背包面板居中显示，正好盖住玩家，而面板上写着「世界仍在运行」 | 两个面板贴底停靠，镜头把玩家抬到面板上方的可见带里。搜刮时仍能看到走过来的敌人 |
| 撤离计时多出一条线 | Pixi 8 的 `arc()` 会从当前画笔位置（世界原点）连一条线过来，按住 E 时屏幕左上会拉出一道绿线 | 圆弧前先 `moveTo` 到起点 |

镜头比例保持 24 格宽。盐枭的射程是 270，守潮人 340，而现在画面纵向半高只有 216；再拉近会让更多攻击来自画面外。所以人物比例不变，只靠前视镜头、受击方向和更清楚的画面来改善。

## 整改前后对比

左边是 `05aaee6`，右边是本轮。两边都用同一个种子 `20261008`，由同一个真实输入脚本驱动：

| 对比 | 图 |
| --- | --- |
| 出生画面 1280×720 | [compare/spawn.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 交火 | [compare/combat.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 靠近物资箱 | [compare/crate.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 搜刮面板 | [compare/loot.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 背包 | [compare/inventory.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 撤离按住 | [compare/exit.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 1920×1080 出生 | [compare/spawn-1920.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 1920×1080 交火 | [compare/combat-1920.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 街口全景（固定机位） | [compare/cross.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 居民楼室内揭示 | [compare/reveal.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 手枪八方向（3 倍裁图） | [compare/player-pistol.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 卡宾枪八方向 | [compare/player-carbine.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 地面物品 | [compare/ground-loot.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |

整改后的完整试玩截图：

- 1280×720 全流程 14 张：[playtest-1280](evidence/playtest-1280/)
- 1920×1080 全流程：[playtest-1920](evidence/playtest-1920/)
- 跳转页落点：[launcher-deploy-1280x720.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md)
- 搜刮时停靠的面板：[check-loot-docked-1280x720.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md)

## 实际验证

环境：Node 24.19.0、pnpm 11.19.0、Chrome headless 154、Windows 10。全部基于本轮正式打包结果。每次运行的退出码和时间见 [verification.json](evidence/verification.json)，19 次运行全部 exit 0。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm test` | 224/224 | [test.log（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| `pnpm package` | 通过。HTML 3,153,633 字节，SHA-256 `fac0ad28…`；两个 ZIP 和 release-manifest 一并更新 | [package.log（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 样板门禁 `coast-sample-test.mjs` | **37/37**（原 36 项加新增 V05），0 页面错误，0 外部请求 | [sample-report.json](evidence/sample-report.json) |
| V05 新门禁 | 4 个真实指针方向下，袖管末端离握把 ≤ 0.71 px；地面物品全部是 28×27 图标底板；撤离圆弧包围盒 82 px（只有圆环本身）；搜刮停靠时，玩家在屏幕 y=263，面板顶在 311。用 `05aaee6` 运行 V05 失败（没有袖管），说明门禁有效 | 同上 |
| 跳转页 `coast-launcher-check.mjs`（无测试接口） | 3 次新浏览器：跳转到 `start the game.html?sample=village`，区域默认居民楼，种子留空，3 次都落在城中村内，HUD 不显示「样板外」 | [launcher.json](evidence/launcher.json) |
| 真实输入全流程 `coast-playtest.mjs` | 种子留空 1 次，固定种子 1280 和 1920 各 1 次，全部完成：菜单、基地、出击、WASD 行进、交火（击杀 2）、E 搜刮并拿取、Tab、M、走到北线检查口按住 E、结算写入、结算页。结果都是「成功撤离」，0 错误 | [种子留空](evidence/playtest-empty-seed.json)、[1280](evidence/playtest-1280/playtest.json)、[1920](evidence/playtest-1920/playtest.json) |
| 整改前对照 | 同一脚本在 `05aaee6`（dist `6828628e…`）上用同一种子运行，也能完成全流程，用来生成对比图 | [verification.json](evidence/verification.json) |
| 四尺寸截图 `coast-sample-shots.mjs` | 17 场景 × 4 尺寸 = 68 张，异常、页面错误、外部请求均为 0。人工看过 640×300、844×390、1280×720、1920×1080 下的 HUD 卡片和触屏按钮，没有重叠 | 本机 `test-results/`，未提交 |
| Sol 原工具 `sol-round4-visual.mjs` | exit 0；R09 镜像、两种模式的 R10 真实倒地均通过 | [sol-visual.json](evidence/sol-visual.json) |
| 生命周期 1280 / 1920 | 各 4/4 | [1280](evidence/lifecycle-1280.json)、[1920](evidence/lifecycle-1920.json) |
| 原浏览器回归 9 套 | browser、portable、ui、save-browser、desktop-input、mobile、mobile-ux、qol、loot 全部 exit 0 | [verification.json](evidence/verification.json) |

**未运行：** 其余 11 套原回归（tactical、art、title、title-water、expansion、qol-expansion、loot-target、buildings、systems、mall-passages、mall-landing）。它们走普通入口或其他世界，本轮没有改动这些路径。另外也没有运行：F20 内存采样、真机、真人试玩、远端 CI。

`coast-playtest.mjs` 在 `?test=1` 下运行，只用来**读取**画面数据以便寻路，没有调用任何摆位或冻结驱动；所有操作都是真实键鼠输入。跳转页检查则在没有任何测试接口的普通页面上运行。

## 交接清单

### 给 Sol（图片）

见 [第二批图片规格](sol-art-requests.md)，均未开工，要求如下：

- **P1：** 敌人三类人形各 25 帧，加潮蚀生物。身体不画手，肩点 (16 ± 4, 19)。
- **P2：** 手枪、霰弹枪、步枪、短棍、匕首的持握图。握把和前手位置按卡宾枪的约定。
- **P3：** 四类尸体，南北向门和窗。
- **P4：** 混凝土、木地板、泥地、水面。

新一版 `wall-core` 请直接按平均亮度 60–72 交付；接入时会撤掉运行时的乘法。地面物品**不需要**另出图。

### 给 Astra（逻辑与存档语义）

本轮没有修改 Runtime、存档或规则。以下几项需要逻辑侧判断：

| ID | 事项 | 现状与建议 |
| --- | --- | --- |
| ASTRA-SPAWN-01 | 普通入口是否也要优先在已制作区域出生 | 现在只有试玩入口在种子留空时挑种子。如果正式规则要改出生点表（例如去掉不在样板范围内的出生点，或按区域加权），属于规则和存档语义，需要 Astra 设计并补迁移和测试 |
| ASTRA-RANGE-01 | 敌人射程与画面范围 | 盐枭射程 270、守潮人 340，而 1280×720 下镜头纵向半高 216，可能从画面外开火。前端已有受击方向提示和前视镜头。是否要求「射击者必须在玩家视野内」或缩短纵向交战距离，属于平衡和 AI 规则，请 Astra 评估 |
| OPUS-DEATH-02 | 玩家自身倒地只显示 1 帧就结算 | 继续待排期。需要 Astra 决定结算提交与宿主 `exiting` 的时序（例如延迟 0.4 秒卸载），Opus 负责播放倒地 |
| ASTRA-SAVE-01 / F20 | 历史存档异常、内存 PARTIAL | 不变，本轮没有重新采样 |

### 给 Opus 后续（前端，未做）

- 搜刮和背包格子里，物品名仍沿用原 UI 的截断写法（例如「除…」），详情区有全名。如果要改格子尺寸，需要和基地 UI 一起改。
- 地图面板沿用原画法，标签偏小，没有改。
- 640×300 的短屏上，状态卡约占屏宽的三分之一，没有和其他元素重叠，但偏重，可以再精简。
- 样板范围外（左侧边缘、南部市场）仍是通用占位画面，HUD 会标出。按用户要求没有扩展全沿海。
- 敌人仍是程序画法，等 Sol 的 P1 图到了再接入。

## 停止点

本轮只做了本地提交。没有推送、合并或发布，也没有扩展全沿海。请先用 `城中村试玩.html` 试玩。
