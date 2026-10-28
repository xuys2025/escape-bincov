# 当前任务入口

最近核对：2026-10-24，main `f74ff91`（含 #102瞄准相机边界、#81街区敌人阶段、#96/#99受击素材与A组姿态）。本轮[PR #104](https://github.com/xuys2025/escape-bincov/pull/104)已正常同步主线，继续现有商场二层遭遇；下表其他条目的合并状态、head 与检查结果以对应 GitHub 页面实时信息为准，旧快照不作为当前指令。

| 目标 | 承接入口 | 接手提示 |
| --- | --- | --- |
| 行动精神/水分/饱食实时 HUD | [PR #110](https://github.com/xuys2025/escape-bincov/pull/110) · [修复与验证](tasks/audit-contracts.md#精神水分饱食-hud-的实时投影) | 实时身体三标量经只读 HudView.needs 显示；经典为空。已获复查后自动合并授权，最新 head / 检查以原 PR 为准；存档与生理规则不变 |
| 公共视图生命周期归位（Q-E02） | [#60 接手边界](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6459328969) · [PR #136](https://github.com/xuys2025/escape-bincov/pull/136) · [实施与验证](tasks/quality-entropy.md#q-e02-公共视图生命周期归位) | `codex/shared-view-lifecycle`，起点 main `0f73a67`：Scope/唯一计数与页面级 Pixi 工具归位到 `view-lifecycle`，保持注册顺序、释放与恢复；与 #134 工具包独立，SAMPLE_AREA 身份继续候选。当前为串联验证暂含 #117 候选 `4ba5b72`，必须先合 #117、再合 #136；准确 head、验证和 CI 见承接 PR |
| 内容身份：居民楼 region ID（Q-E06） | [PR #117](https://github.com/xuys2025/escape-bincov/pull/117) · [审计边界](tasks/audit-contracts.md) | `fix/content-identity` 续作：居民楼 8 个已有 ID 由定义提供；世界和存档不改号。同步 main 后对照原九图及 mall-v4 两图；楼梯方向和内容登记仍开放，准确 head 与 CI 见原 PR |
| 新一轮减熵：架构门禁与依赖查询 | [#60 扫描与计划](https://github.com/xuys2025/escape-bincov/issues/60#issuecomment-6449666799) · [实施与验证](tasks/quality-entropy.md#2026-10-28-架构门禁与按文件查询) | `codex/entropy-architecture`，起点 main `3b61d52`：统一全源码 AST 图，补动态加载/类型导出边界，核心依赖闭包守卫，提供只读按文件查询；其余候选继续 #60，既有 PR 不重复承接。准确 head 与 CI 见本轮 PR |
| 室内墙体与视野设计（功能未实施） | [设计方案](INDOOR-WALL-VISIBILITY-PLAN.md) · `docs/indoor-wall-visibility` | 2026-10-28 维护者确认：所有室内适用、保留完整基础格、横墙按连续墙段切换；竖墙和顶墙实化、底墙延伸透明、门洞净空。当前仅交付设计文档并核验 main `b5bd63b`，后续代码与两尺寸验收另行安排；与 #130 商场家具及地面换图分开承接，详情见方案。 |
| 水产站玩家空手手臂与手（F16） | [#26 F16 核查](https://github.com/xuys2025/escape-bincov/issues/26#issuecomment-6446761015) · [PR #131](https://github.com/xuys2025/escape-bincov/pull/131) · [实现与验证](tasks/station-player-hands/README.md) | `codex/f16-station-hands`：仅在站内为共用身体补前臂、手套及步行动作，八方向五帧沿用原缓存、描边、光照与遮挡。原行动素材和存档不变；H15 在旧构建失败、修复后两尺寸通过；完整站内 78/79，I3 在原 main 也超时；准确 head、CI 与剩余验收见原 PR |
| 行动背包有限服务（Q-E02 B） | [#60](https://github.com/xuys2025/escape-bincov/issues/60) · `refactor/raid-inventory-services` · [实现与验证](tasks/quality-entropy.md#q-e02-b-行动背包有限服务) | 同一交付完成三有限命令与 detached 窄读投影，面板不再持有 Session/SaveSession；原 mutate/loot 事务、快捷规则和经典兼容保持。本 B 段不含 Scope/renderer，公共生命周期另见本轮条目；#60 总单继续开放 |
| 资源报告消费字段校验 | [PR #116](https://github.com/xuys2025/escape-bincov/pull/116) · [交接](../handoff.md) | 两份 review CLI 写报告前拒绝非法消费字段，保留合法输出、null 占位及源 PARTIAL；CLI13项与41文件对照通过。已获自动合并授权，准确新 head CI 见原 PR，不代表 F20 签收 |
| 按风险选检查与诊断分类 | [#60 Q-E08](https://github.com/xuys2025/escape-bincov/issues/60) · [使用入口](CHECKS.md) · [交付记录](tasks/check-navigation.md) | 已合入（[PR #93](https://github.com/xuys2025/escape-bincov/pull/93)，`98c69b4`）：风险组合列出命令与前置，完整脚本用途盘点、两个堆报告目录分离。#32 F20 仍 PARTIAL；[PR #114](https://github.com/xuys2025/escape-bincov/pull/114)（`ci/resource-helper-tests`）将已核实的两份纯 Node 测试（4 项）接入 `check:ci`，其余 54 个旧工具继续 review，不自动执行或删除；四项通过不代表资源签收 |
| README 当前玩法与开发入口 | [README](../README.md) · [PR #86](https://github.com/xuys2025/escape-bincov/pull/86) | 已合入（`44494ea`）：按 main `b475b1b` 更新序幕、射击与试枪场、敌人素材和开发边界，补齐文档导航 |
| 代码质量与低上下文 AI 接手 | [#60](https://github.com/xuys2025/escape-bincov/issues/60) · [实施摘要](tasks/quality-entropy.md) · [本轮审计 / PR #79](tasks/audit-contracts.md) | #63/#68/#69/#71/#72 已合入；本轮 `agent/audit-contracts` 修复非法 ID 校验、负重上限、自动拆分、子步计时和新生弹飞行时间，补强服务类型和代码注释。Q-D02 剩余旧接口 `buy`/`sell`/`reload` 的退役与测试迁移见 [PR #89](https://github.com/xuys2025/escape-bincov/pull/89) 与摘要 [Q-D02](tasks/quality-entropy.md#q-d02-旧交易与装弹接口退役)。Q-B06 诊断 bundle 同源见 [PR #90](https://github.com/xuys2025/escape-bincov/pull/90) 与摘要 [Q-B06](tasks/quality-entropy.md#q-b06-诊断-bundle-同源)：诊断能构建，#32 F20 仍 PARTIAL。D8 失焦后首按修复由 [PR #107](https://github.com/xuys2025/escape-bincov/pull/107)（`fix/first-key-after-blur`）承接，见[修复与验证](tasks/audit-contracts.md#d8-失焦后第一次按键恢复)；Q-E02 B 段的背包有限服务由 `refactor/raid-inventory-services` 承接，见上表和实现摘要；其他余项及验证边界见审计摘要和 #60 |
| Runtime 缺口：治疗拒绝原因、附近逐件拾取、门拒绝、重对时 | [PR #65](https://github.com/xuys2025/escape-bincov/pull/65) · [任务记录](tasks/runtime-gaps.md#收尾与同步) | 已合入（`a6954e5`）；Runtime 接口与前端接入均完成。后续质量修复由 [#79](https://github.com/xuys2025/escape-bincov/pull/79) 承接，剩余收敛见 #60 |
| 敌人与尸体 2.5D 角色图 | [PR #66](https://github.com/xuys2025/escape-bincov/pull/66) · [说明](enemy-art/README.md) | 已合入（`d62603d`），Sol P0+P1；枪口火光对齐随后由 #39 的 S1 完成。旧报告保留当时的素材审阅与真机未验状态 |
| 地图敌人详细设定与实施 | [设计提案](ENEMY-DESIGN.md) · [#78](https://github.com/xuys2025/escape-bincov/issues/78) · [PR #81](https://github.com/xuys2025/escape-bincov/pull/81) · [街区样板](tasks/enemy-street-encounter.md) | 新街区前三原型＋每五种子之一的[头目护卫据点](tasks/enemy-market.md)及[四只动物的食源](tasks/enemy-fauna.md)、跨势力归属/交涉、两名成员沿已见入口跟随、方向壳甲/有限压制/扑击边界已实现。十八类身体/尸体共 468 张图，头目据点已加入普通出击，动物、[四类盐蚀者/真实武器变体](tasks/enemy-affected.md)、[四人回收运输队](tasks/enemy-recovery.md)与[三类封锁队登记通行](tasks/enemy-blockade.md)已接普通出击；十八类全部有街区样板，见[素材记录](tasks/enemy-street-art.md)。同步 #92 后采用组合行动5；#98合入后外层统一session8，expansion3 / raid5保持，历史敌人和 Perk 行动保留原规则，actor能力v2与旧端拒绝、双备份见[合同](tasks/enemy-save-contract.md)。阶段动作/辨识音效已补齐；十二规划区域及整体验收仍开放；本次已同步#96/#99，便携ZIP 5 MiB上限按维护者指示取消，准确head与CI见原PR。#81已合并上线；本批 `feat/enemy-mall-r06` 继续 EN-19 的[现有商场二层遭遇](tasks/enemy-mall.md)，R06/EN-19～22仍开放 |
| 商场扩量 | [#47](https://github.com/xuys2025/escape-bincov/issues/47) · [布局四版记录](mall-2-5d/README.md#布局四版mall-v4--mall-layout-42026-10-27) · [Sol M2 任务书](mall-2-5d/m2/TASK.md) · [M2 交付](mall-2-5d/m2/README.md) | M1 布局四版与 M2 素材由 [PR #127](https://github.com/xuys2025/escape-bincov/pull/127) 合入（`86add10`），旧 1/2/3 版行动按原布局恢复。10-28 起 [PR #130](https://github.com/xuys2025/escape-bincov/pull/130)（`agent/mall-m2-sprites`）把 M2 家具与地面接进布置表（四版家具全部画素材，程序绘制件留作后备）；四个连排模块有透明缝或导出花纹，暂用同类代替，待 Sol 重新导出。维护者游戏内观感、建筑补图（外立面、检修核顶面、专用楼梯/扶梯）与 M3 全图真人体验、真机仍待做。维护者 10-27 局域网试玩反馈已登记 #26 F14/F15 |
| CI 后续 | [#61](https://github.com/xuys2025/escape-bincov/issues/61) · [PR #112](https://github.com/xuys2025/escape-bincov/pull/112) | 八组均衡 #62、缓存与 lavapipe #74 已合入；[完整视口分片](CI.md#敌人套件的完整视口分片61)继续原 PR #112。10-27 四轮 enemy 单套 641.85–705.62 秒，是 batch-8 主要瓶颈；三片保留全部 165 case 与独立证据门禁。维护者指定合并顺序 #115 → #129 → #108 → #112，已在 main 9400cf6 上同步 #108 准确 head 验证组合；合并前确认前三项均已入 main 并核对最终合成树，模板文档精确路径与 Git Bash 定位仍由前置 [PR #108](https://github.com/xuys2025/escape-bincov/pull/108) 承接；准确 head、CI 与剩余性能验收见原 PR |
| 打包产物改由 CI 构建和发布 | [PR #105](https://github.com/xuys2025/escape-bincov/pull/105) · [CI 说明](CI.md#构建与离线包发布) | 生成物移出仓库，main 验证后发布滚动预发布 `main-latest`，README 下载改指向它。发布方式待维护者在 PR 里确认；在途 PR 同步 main 时保留生成物的删除 |
| 2.5D 收尾后的剩余 | [收尾说明](2-5d-closeout/README.md) | #64、Runtime 缺口 #65 和现有敌人素材 #66 均已合入；地图美术扩量与新封锁区地图仍待完成 |
| Shader 堆快照消费字段校验 | [PR #118](https://github.com/xuys2025/escape-bincov/pull/118) · [交接](../handoff.md) | 只校验实际消费的 V8 node/edge 字段与安全字节和；CLI10项和真实 Node 格式兼容通过，不作游戏堆/F20签收。已获自动合并授权，准确新 head CI 见原 PR |
| 射击与改枪 | [#80 改枪进度](https://github.com/xuys2025/escape-bincov/issues/80) · [任务与排期](gunsmith/TASKS.md) · [射击说明](SHOOTING-SYSTEM-REWORK.md) | #39 射击基础已合入（`2bac4fb`，“稳定”手感）。#28 改枪规划拆成 55 项任务并排期，合入即表示已排期；M0、M1（枪械目录、实例、存档 v8）经 #98 完成；M2（五枪二十件、工作台、预设、正式美术）经 #106 于 10-28 合入（`02b5e1e`）。M3（扩到二十枪一百件）由 `feat/gunsmith-m3` 的草稿 PR ③ 承接，先交 Sol 第一波美术（[任务书](gunsmith/art/m3-w1/BRIEF.md)），预计 12-11 完成，进度只在 #80 更新。M0-07 发现的地图边瞄准偏转已由 #102 单独修复（见[射击说明 S1](SHOOTING-SYSTEM-REWORK.md#s1-对齐测量与修法)） |
| 打击感：枪声、受击与击杀反馈 | [#75](https://github.com/xuys2025/escape-bincov/issues/75) · [PR #88](https://github.com/xuys2025/escape-bincov/pull/88) · [PR #94](https://github.com/xuys2025/escape-bincov/pull/94) · [PR #97](https://github.com/xuys2025/escape-bincov/pull/97) · [受击姿态 PR #96](https://github.com/xuys2025/escape-bincov/pull/96) · [A 组接入 PR #99](https://github.com/xuys2025/escape-bincov/pull/99) | P0 第一项已合入：慢帧时序 #88（`b38f23d`），抖动顺弹道 #94（`edb02f2`）。命中确认经 [PR #97](https://github.com/xuys2025/escape-bincov/pull/97) 合入（`1af0fec`）：闪白和抖动从命中当帧画起；玩家受伤和敌人中弹分成两种声音，同一批同一目标只响一次；暴击有单独的命中标记和声音；击杀确认音跟随击杀标记。敌人受击/恢复姿态的七类 pixel-v2 图集在 #96：膝部不开缝、侧面缩头的返工已通过独立复验（生物缩头按足底以上的头部测区计，见[复验评论](https://github.com/xuys2025/escape-bincov/pull/96#issuecomment-6379336021)）；v1、原图和提示词保留。A 组（拾荒者、盐枭、守潮人、潮蚀生物）经 #99 合入（`f73e9de`）：中弹先显示受击帧约 90 ms，再显示恢复帧约 60 ms。#81 合入（`67a7468`）后，B 组三类原型（近身掠夺者、拾荒枪手、望风者）由 `feat/hurt-poses-b` 的 PR 承接，换帧改按角色身体所用的样式判断；#81 的其余 15 类原型没有姿态图集，要加需新一轮美术。双管命中音按开火与目标聚合由 `fix/shotgun-hit-sounds` 独立承接 #75：临时事件关联、跨批次去重与旧恢复弹降级，不改存档；分枪种枪声已经 [#121](https://github.com/xuys2025/escape-bincov/pull/121) 合入（`ae2ad6b`），其余排期见下方“打击感剩余排期”一行 |
| 暴击与三属性 Perk | [#77](https://github.com/xuys2025/escape-bincov/issues/77) · [实现契约与记录](tasks/critical-perk-contract.md) · 分支 `agent/critical-perk` | 设计 #40 已合入（`b475b1b`）；实现经 [PR #92](https://github.com/xuys2025/escape-bincov/pull/92) 合入（`8b6192d`）：存档 v5/行动 v3、开枪暴击快照、24 项 Perk、屏息、基地选择与 500 重置、院子与旧页签界面和行动 HUD。#77 保持开放，只余 CP-T10 真人平衡与真机 |
| 打击感剩余排期与 C 组姿态美术 | [任务与排期](hit-feel/TASKS.md) · [C 组美术任务书](hit-feel-art/TASK-C.md) · [#75](https://github.com/xuys2025/escape-bincov/issues/75) | B 组姿态已经 [#103](https://github.com/xuys2025/escape-bincov/pull/103) 合入（`5adc64a`），上一行“由 `feat/hurt-poses-b` 承接”已过时。剩余按任务页排期：PR ① 分枪种枪声与试枪场新旧对比开关已经 [#121](https://github.com/xuys2025/escape-bincov/pull/121) 合入（`ae2ad6b`）；C 组（#81 其余 15 类原型）的姿态图集由 Sol 在 [#122](https://github.com/xuys2025/escape-bincov/pull/122) 交付并复验签收（`7d1827c`），接入（PR ④）经 [#123](https://github.com/xuys2025/escape-bincov/pull/123) 合入（`8c5df6b`）。PR ② 强冲击档、闪白血迹按开火合并、墙和门的反馈、镜头脉冲经 [#125](https://github.com/xuys2025/escape-bincov/pull/125) 合入（`1a4fe66`）。PR ③ 的声音与粒子预算（H-07）和帧耗时、峰值实测（H-10 的实现部分）由 `feat/hit-feel-budget` 的 [#126](https://github.com/xuys2025/escape-bincov/pull/126) 承接；#119 枪身回缩经维护者 10-26 试玩认可新版后合入（`34e9ba7`），在它之上按枪种调幅度（H-09）也在 #126；维护者 10-26 在局域网试玩 #126 构建后认可；手机外放、耳机试听没有单独确认。#113（命中音聚合）已合入，#106（改枪 M2）在途，本行不接管 |
| 地图、主线与人物结局 | [地图 #82](https://github.com/xuys2025/escape-bincov/issues/82) · [县域选图实施记录](tasks/county-map-select.md) · [PR #91](https://github.com/xuys2025/escape-bincov/pull/91) · [市场 #83](https://github.com/xuys2025/escape-bincov/issues/83) · [主线 #84](https://github.com/xuys2025/escape-bincov/issues/84) · [人物 #85](https://github.com/xuys2025/escape-bincov/issues/85) | 十二区选图已实现，两处现有入口可出击、十区暂未开发。[Opus 视觉深化](tasks/county-map-select.md#opus-视觉深化2026-10-24)在 #91：固定比例地图、地标标记、选中光照与路线、十二张情报插图、面板就地更新。选图界面 #91 已合入（`4141503`）；真实新增区域/剧情/结局仍由原专题跟踪，不因界面或概念图完成关闭 #82 |
| 玩家反馈与历史 AI 遗留 | [#26](https://github.com/xuys2025/escape-bincov/issues/26) · [#32](https://github.com/xuys2025/escape-bincov/issues/32) | 保留原验收边界，调查登记不代表修复。#26 F13（搜刮时按 WASD 离开）已由 [PR #87](https://github.com/xuys2025/escape-bincov/pull/87) 合入。10-27 [新登记](https://github.com/xuys2025/escape-bincov/issues/26#issuecomment-6440946343) F14 和 F15。F14（看不见敌人时分不清是没人还是房间没揭示，商场最明显）：维护者从三个本地原型里选了“商场里没揭示的房间压暗”，已由 [PR #128](https://github.com/xuys2025/escape-bincov/pull/128) 合入，不改揭示规则。F15（局内面板没有装备槽，不能拖动装备武器）由 [PR #129](https://github.com/xuys2025/escape-bincov/pull/129)（`agent/f15-raid-equip-slot`）承接：左侧主武器槽，背包或来源里的枪拖进去即装备，满包整笔拒绝、与世界快照同一笔写入。它依赖 [PR #115](https://github.com/xuys2025/escape-bincov/pull/115)，先合 #115 |

开始修改前 fetch 并查看本地改动、同目标 PR 最新 head/讨论；多人约定文件所有权。当前需求由维护者明确指令决定，下面历史中的排期、冻结或“未合并”描述只代表记录时点。开发路径见 [CODEMAP](CODEMAP.md)，续作使用[短摘要模板](TASK-HANDOFF-TEMPLATE.md)。敌人接入所需地图身份和安全路线逐区见 [EN-19 台账](tasks/enemy-regions.md)；#91 选图界面/概念素材不等同真实地图交付。

<details>
<summary>历史交接与旧任务快照（按需查证，保留原文）</summary>

## 2026-10-12 · 暴击与三属性Perk修订（独立设计文档）

维护者已批准方案并要求提交设计文档PR，由 `docs/critical-perk-design` 承接：[专项规格](CRITICAL-PERK-DESIGN.md)、[RPG总设计](RPG-SYSTEM-DESIGN.md)。基于main `64505046fb737af195bc808d2f8e4274df21cf24`：取消新行动暴击与命中部位相关性，按未暴击概率乘法合并、上限100%；永久15/20/25/30级独立二选一，24候选/12节点；屏息每秒独立10%、3秒30%，基地500现金重置单属性perk。

本次只交付文档、公式与兼容/验收要求，不启动代码实现或新增派工。[#39](https://github.com/xuys2025/escape-bincov/pull/39)承担射击/真实后坐基础，[#28](https://github.com/xuys2025/escape-bincov/pull/28)承担完整改枪目录，本规格的控枪perk将来接入其正式契约；不改动两者分支或已有范围。原RPG #13/#16已结束，当前没有同目标perk设计承接PR，因此建立独立文档交付。完成条件为规则/链接/公式/范围核对、PR检查及维护者审阅；功能实现、迁移和真人平衡后续另行授权，历史未测状态保留。

## 2026-10-22 · CI：主机包改走缓存，WebGL 改用 lavapipe（#61，`ci/setup-and-renderer`）

用户要求研究并改进 CI。调研结论：2.5D 之后全量门禁中位约 33 分钟（10-15 时约 15 分钟），主要耗在软件渲染上；runner 的 CPU 快慢相差约 2.5 倍；当天 Azure 的 apt 镜像故障，使单个 job 光安装就要 15–26 分钟。本次先做两步，只改 CI，游戏、测试断言和生成物都不变：

- 浏览器 job 不再经过 apt 镜像：10 个字体包固定版本和 SHA-256，lavapipe 跟随 runner 的 Mesa 版本，都走 Actions 缓存；Chromium 只从 Playwright CDN 下载。
- WebGL 改用 lavapipe（`BINCOV_CHROME_ARGS`），套件开始前检查渲染器；耗时报告记录 CPU 与渲染器。

按新耗时重新分组（长套件的安全拆法已调研）仍在 #61。本记录不表示已经合并或达到提速目标。

## 2026-10-16 · 2.5D 收尾：旧行动在 2.5D 上打完，去掉 Phaser（`feat/2-5d-closeout`）

维护者要求对 2.5D 化收尾：能做的做完，需要 Astra（逻辑）和 Sol（美术）的列出来。起点 main `1764874`。

- 存档里的旧行动（已关闭的沿海封锁区、更早的 `coast-v1`、商场一版）从标题页继续后也在 2.5D 上打完。
- 去掉 Phaser：标题页改由 PixiJS 绘制（画面与旧版逐像素对比几乎一致），页签和结算背景改为普通画布；旧局内画面、旧触屏按钮、旧走动据点和只服务它们的界面、样式删除。单文件 6.87 → 5.35 MB。
- 2.5D 画面补上旧画面有、新画面缺的提示和按钮（楼梯被堵、门口有人、手机暂停、竖屏暂停、行动指南、导出备份、取消移动、搜刮窗口的危险提示、提示合并等），手机矮屏和刘海屏布局修正，门口引导给敌人和子弹让开。
- 自动游玩查出旧封锁区流血致死时结算写不进去（生命略低于 0 被存档校验拒绝），Runtime 掉血改为在 0 截止。
- 约 20 个旧局内浏览器测试迁到 2.5D，检查的行为不变；`test:issue26-phaser-spatial` 退役，仍是 36 条；新增本地的完整 `test:coast-sample`。逐套说明见 [收尾说明](2-5d-closeout/README.md)。

剩余工作（同见收尾说明）：Astra——治疗被拒的原因说明、「附近」逐件拾取、本 PR 的独立复验（含 Runtime 掉血截止）、商场布局四版（#47）、新封锁区地图数据；前端——楼梯名盖住正下方敌人的做法待定；Sol——敌人和尸体的 2.5D 角色图与主角持枪图、沿海街区其余约四分之三、商场其余区域、新封锁区美术。新封锁区方向和美术先后由维护者决定。本记录不表示已经合并或上线。

## 2026-10-15 · CI 第二阶段：八组均衡与执行耗时（#61）

维护者授权开始推进 [#61](https://github.com/xuys2025/escape-bincov/issues/61)。分支 `ci/balanced-regressions` 从最新 main `a2d716d` 开始，纳入刚合入 #57 的第 36 条 raid-default。首批集中在整套件八组重排、存档检查前置、逐命令耗时与完整执行记录门禁；保留游戏/测试行为、真实训练、单文件离线和发布契约。后续 case 分片与诊断采样优化仍由 #61 承接，见 [CI 说明](CI.md)。同一目标保持一个 PR。

本地 437 单测及 package 已通过，生成物与起点字节一致。CI 规则/执行器验证、固定版本三轮 Linux 对照与准确 head 的实际结果更新承接 PR；本记录不表示已经合并、上线或已达到提速目标。其他 Agent 的产品提交独立推进，提交前再次 fetch 并正常合并必要基线，不覆盖他人工作。

## 2026-10-15 · 行动默认走 2.5D，关闭沿海封锁区，不再支持无 WebGL 设备

维护者准备全面 2.5D 化，决定：
- 沿海封锁区和沿海街区是同一张地图，关闭封锁区，以后作为新地图重做；
- 不再支持没有 WebGL 的设备（提前执行 10-14 定的规矩）；
- 能跑 2.5D 的设备（电脑、手机、平板）都要能完整玩。

分支 `feat/2-5d-default`，起点 main `50a05aa`：
- 院子和旧页签的出击面板只剩沿海街区（默认）和滨湾商场；
- 街区和商场的行动一律走 2.5D 画面，不再看 `?sample=`；商场新出击用布局三版；
- 之前开始的封锁区行动和商场一版行动，从标题页继续，仍在原 Phaser 画面上打完；
- 没有 WebGL 时只显示“需要支持 WebGL 的浏览器”，不读写存档；
- 普通入口不画样板标记（压暗、「样板外」），`?sample=` 入口保留；街区室外地图改名“沿海街区”；
- 2.5D 手机操作补“切换武器”按钮；
- `?test=1` 不带 `sample` 时保持旧行为（Phaser 局内、三个区域、商场一版），旧测试不用改；新增 `test:raid-default`（CI title 组）。

还没做的：
- 美术：街区约四分之三、商场大部分区域（#47）；敌人和尸体的 2.5D 素材；
- 新的沿海封锁区；
- 去掉 Phaser：旧行动改由 2.5D 画面收尾，约 20 个旧局内测试迁到 2.5D，标题页和结算页换掉 Phaser。

## 2026-10-15 · 行动种子超过 10 亿时结算存不下来（fix/run-seed-overflow）

线上问题：2026-10-14 18:09 UTC 起，用时钟种子出击的行动结算都会保存失败，持续到 2026-11-21 17:25 UTC，之后每 49.7 天里约有 38 天复发。也会让所有 PR 的 CI 在 `test:save-browser` 失败。修复只改“上次行动结果”种子的校验上限，并补回归测试；独立 PR，不混入开场动画 #56。

## 2026-10-15 · 开场动画 P0 动态分镜（feat/opening-cutscene）

实现 PR #56（草稿）。节奏和长度维护者已认可；新存档自动播放已打开，「序幕」可重看；r2 画风维护者已确认。Sol 第二批前后半都已接入，28 镜除三张黑底字卡外全部是正式画面（新图 97 张，2,300,486 字节，上限 2.5 MB）。声音换成了固定种子合成的环境声和音效，待维护者试听；点击后播放器立即出现，画面和声音在 A01 字卡期间准备。成片（审核用 MP4，2:19）经维护者审批通过，可以合并；审看用的镜头号只在 `?test=1` 测试页显示。真机观感未测。#41 合并前，本 PR 的差异包含 #41 的两份文档。

## 2026-10-15 · 开场动画定稿（#41）

维护者确认[分镜稿](OPENING-CUTSCENE-SCRIPT.md)和[制作方案](OPENING-CUTSCENE-PLAN.md)：约 2 分 19 秒，到站只留字卡，图片上限 1.5 MB，七项改动确认。实现另开新 PR，Sol 的定调图与 Opus 的动态分镜同时开始；#41 仍是纯文档。

## 2026-10-14 · 商场 2.5D：遗留几项按 Opus 判断处理后合并（#47 / #48）

维护者授权按 Opus 的判断处理遗留的几项，改完就合并。决定如下：
- 镜头取整：改，走路时人物不再相对背景抖动。
- 瞄准前探：平时减半，右键不变。
- 默认缩放：只往远拉的整数倍，1920×1080 下 2 倍、30 格宽；1280×720 不变。
- 灯光：揭示时 0.3 秒淡入，隐藏立刻熄灭。
- 布局三版：茶几和露台桌椅改两格碰撞，二版行动照常按二版恢复。
- 商场墙：不降低；天花板：不加；检修核永远不剖开。

镜头、缩放、灯光是共用代码，城中村一起变。详情见[商场 2.5D](mall-2-5d/README.md)的“第三次处理”和“布局三版”。以下历史记录保留。

## 2026-10-14 · 开场动画制作准备（#41）

维护者要求完善 [#41](https://github.com/xuys2025/escape-bincov/pull/41)、准备制作开场动画。续作沿用创作者 fork 上的原分支：[分镜稿](OPENING-CUTSCENE-SCRIPT.md)按已接受主线对齐，七项改动待创作者确认；新增[制作方案](OPENING-CUTSCENE-PLAN.md)，含播放规则、素材与声音清单、P0～P3 分工和 OP-01～OP-14 验收。本 PR 仍是纯文档，不启动代码实现线；实现在方案确认后由维护者指定承接 PR，商场 #48 等在途任务保持原归属。

## 2026-10-14 · CI 文档分流与均衡分组

维护者授权实施 [#53](https://github.com/xuys2025/escape-bincov/issues/53)，从 main `5a11e3d` 建独立任务分支 `ci/docs-fast-lanes`。仅调整 CI：普通文档需匹配成功主线的完整非文档指纹才跳过浏览器，单测/打包/发布门禁保留；原 34 条浏览器命令均衡分为八组。见 [CI 说明](CI.md)。与 #48 商场实现及原射击/剧情 PR 无代码依赖，新增用例需同时维护 CI 覆盖清单。实际验证以本任务 PR 的准确提交及 Actions 为准；当前未合并、未上线。

## 2026-10-14 · 水产站：食堂进不了宿舍

维护者截图问食堂到宿舍是不是被挡住了。确认是：宿舍唯一的门在食堂东墙 (17,4)，门里侧那格被食堂的案台（`pots`，1×2）占着，人从食堂挤不进门，休息区因此走不到。原来的 H1 只看宿舍屋顶有没有掀开，人走到门口屋顶就会掀开，所以一直没测出来。案台挪到门下方 (16,5)，H1 改为必须走过门，新增布局可达性测试。单独分支 `fix/station-dorm-door`，与商场 #48 无关。以下历史记录保留。

## 2026-10-14 · 商场 2.5D：家具比例（F-05，#47 / #48）

维护者看了试玩修正后说沙发和桌子“还是瘦，比例不对”。原因是上一轮给 Sol 的尺寸按格子估，没按真实尺寸换算。按 24 像素约 1 米重新核对后，维护者在对比图里选了方案，Sol 重画沙发、茶几、床、长椅和落地灯（素材清单第 4 版）；画布、碰撞和布局版本不变，二版存档不受影响。同时合并了最新 main（#49、#51），冲突只在任务清单、交接和生成物。茶几离沙发一整行、偏在沙发西半边，要改布局，留给维护者决定。详情见[商场 2.5D](mall-2-5d/README.md)的“第二次反馈：家具比例”。以下历史记录保留。

## 2026-10-14 · 商场 2.5D：试玩反馈修正（#47 / #48）

维护者试玩 `c1b9671` 后报了四个问题：露台桌椅太小、沙发和床像浮着、“上楼”标签突兀且糊、不知道哪里能进门且走起来晕。在原分支修正：桌椅组按比例程序绘制（碰撞仍一格，保住旧存档）；阴影贴住素材底边；楼梯名改成 HUD 像素字（城中村规则不变）；只剖开所在房间、入口画门角标和门槛、门头只在真入口、侧门南墙压低、样板改从正门广场出生、HUD 标室外地点和“样板外”，另加可选的 `?crisp=1` 整数倍缩放。会连带改城中村或属于取舍的几项（默认整数倍缩放、镜头取整与前探、灯光淡入、墙高、天花板）留给维护者决定。详情见[商场 2.5D](mall-2-5d/README.md)的“试玩反馈与处理”。以下历史记录保留。

## 2026-10-14 · 商场 2.5D：Pixi 画面接入（#47 / #48）

继续 `feat/mall-2-5d`（#48）。`?sample=mall` 在 Pixi 2.5D 画面上跑布局二版，Sol 第一批 110 个素材入库并受构建哈希检查；双击 `商场试玩.html` 可试玩。普通入口、存档格式和 Runtime 不变。顺带把画面层判断房间可见性的地方统一成与 Runtime 一样的“重叠房间未揭示优先”。做法、检查（`pnpm test` 354 项，`test:mall-sample` 15 项进 CI world 组，村庄样板全量回归）和已知问题见[商场 2.5D](mall-2-5d/README.md)。下一步由维护者看路线效果，再决定铺满两层。以下历史记录保留。

## 2026-10-14 · 《等海退去》文学再修订候选

维护者确认通过在线 Gemini 改写主线与人物对白，由 Codex 集成文件、提交 Git 及 PR。任务登记 [#50](https://github.com/xuys2025/escape-bincov/issues/50)，`docs/story-gemini-rewrite` 从最新 main `aec0cbd` 接手；#29/#31/#30/#45已合并，没有同目标开放文学 PR。已收到完整十段正文与十八条对白，原始稿留存、事实校正与文档核对见[本轮记录](story/GEMINI-REWRITE-20261014.md)。草稿待维护者审阅文学效果；源码、地图、状态、选项和发布包不变，剧情功能与后续十六节点不因此开工，原在途任务及 issue 总单保持归属。以下历史记录保留。

## 2026-10-14 · #26 快速可修项

维护者要求检查 #26 尚未解决但能尽快修好的项，一次修好后经 PR 自查合并，最后更新 issue，并且不打扰商场 2.5D（#47/#48）。从 main `e9cbaa5` 建 `fix/issue26-quick-wins`，承接 F03 院子商店局部清晰度、F07/F11 普通 Phaser 门与楼梯指引及隐藏内容修补、F08 步态与触屏朝向、F12 清空存档与救济放宽。救济放宽、清空存档、触屏朝向由维护者本轮确认；整层揭示本轮不做。[本批记录](issue26-20261014/README.md)。#26 总单及 F03 整体重做、F06、无法读取存档的救援、D01–D06 与真机保持开放；商场 PR #48 继续原分支。以下历史记录保留。

## 2026-10-13 · 商场 2.5D（#47）

维护者确认商场 2.5D 化并授权登记与开工，决定：做布局二版、先做 `?sample=mall` 样板入口、先做正门广场到露台一段路线看效果。登记为 [#47](https://github.com/xuys2025/escape-bincov/issues/47)，承接分支 `feat/mall-2-5d`（起点 main `7df2d22`），范围、分工与布局二版坐标见[商场 2.5D](mall-2-5d/README.md)。本批只交布局二版数据与约束测试：一版逐字节不变，二版不注册到普通存档解析，普通入口和现有区域不变。Runtime 接入与二版注册、恢复兼容由 Astra 承接；渲染在 #43、#44 合并后开始；Sol 第一批素材制作中。其余开放 PR 保持原归属。以下历史记录保留。

## 2026-10-13 · PR #43 已合并，#44 组合验收

维护者明确要求检查无问题后合并两PR。#43准确head65e5b36的完整CI38414347980成功、无待处理审阅，已正常合并为1ad9b2d，合并tree与受检head完全一致。#44沿原分支正常同步该主线；CoastView两条import及双方交接均保留，生成物正式重新打包，组合版本314单测、打包、双尺寸资源各5/5、空间14/14、动画6/6已通过；准确head完整CI通过后按本次授权合并。#26/#32总单及原未完成范围保持，主线CI和Pages分别核验。以下历史状态保留。

## 2026-10-13 · PR #44 同步已合并的 #46

最终核对时main已前进到7df2d22（#46）。正常合入该主线，保留双方完整交接，生成物重新打包；#46的商店13项输入门槛随主线保留。之前受检提交的完整CI已成功；同步后的准确head另跑完整CI，最终状态见原PR。未合并本PR、未发布，issue总单及未完成范围保持。

## 2026-10-13 · PR #44 收尾复验

沿原分支正常同步 main 95036af。原CI存在真实安全箱裁切及站内失败；本轮修复工具栏布局、忙帧双击识别、存档失败遗留搜刮目标与楼梯标签遮挡，校正短屏滚动验收及真实多窗口夹具。314单测、打包、站内16/16、局内20/20、空间14/14、旧战术8项、商店11/11及一级10/10通过，双击旧包负对照与首败保留。额外完整院子75/76，唯一短名裁切已通过标题栏工具区和36px格子修复；主线对照4/4、修后相关6/6与站内16/16通过，不拼成一轮76/76。证据和构建边界见[本批记录](issue26-20261013/README.md)，最终head完整CI仍是交付门槛。#26仅更新本批状态，总单及F03/F06/F08/F12、D01–D06、真机/真人保持开放；未合并或上线。以下历史记录保留。
## 2026-10-13 · #26 库存与室内辨识（待最终验收）

从最新 main `3f706b7` 建 `fix/issue26-player-feedback`，落实 F01/F02/F05/F07/F09/F10/F11 的库存及样板空间辨识改动，并独立复验 F04 救济。范围、实际结果、首败及剩余事项见[本批记录](issue26-20261013/README.md)。维护者后续要求额度不足尽快收尾，因此提交草稿 PR，完整 CI 与最终组合验收通过前不合并；#26 保持开放，其他射击/剧情 PR 及 #32 历史未确认项保持原归属。以下历史记录保留。

## 2026-10-13 · PR #43 同步已合并的 #46

最终核对时main已前进到7df2d22（#46）。正常合入该主线，保留双方完整交接，生成物重新打包；#46的商店13项输入门槛随主线保留。之前受检提交的完整CI已成功；同步后的准确head另跑完整CI，最终状态见原PR。未合并本PR、未发布，issue总单及未完成范围保持。

## 2026-10-13 · PR #43 收尾复验

继续原分支，正常合入main 95036af并保留双方文档历史。原e11552c完整CI已成功；本轮295单测、可复现打包、两尺寸资源各5项及动画6项通过，补专项等待正式暂停恢复的时序，产品字节不变。[首败和最终证据](issue32-followup-20261013/README.md)。当前最终提交等待完整CI，完成后更新#32对应子项，总单与历史未确认事项保持开放。

## 2026-10-13 · #32 城中村渲染目标释放与动画验收采样

从最新 main `3f706b77` 建独立分支 `fix/issue32-validation-followup`，承接已合并 #42 后的资源与验收维护。真实调整城中村视口20次，逐uid复现已销毁渲染目标的空槽0→60；复用院子的精确清理函数，仅删除本view刚销毁的三张RT的null槽。两尺寸专项各5/5，覆盖20次resize、12次视野切换、6次原生WebGL恢复、输入/像素、结算及回站再出击；其他活动资源、共享表及测试制造的无关空槽均保留。停放最后一帧仍持有一个已销毁source，下一宿主渲染后回收，该边界如实记录。

同时分离V03的受控动画像素契约与自然帧数据，修正V10事件后延迟采样导致的误判；自然帧率不因此签收，原V09/院子性能门槛保留。新资源与动画专项接入CI。实际原版对照、首败、负对照和最终验收见[本轮报告](issue32-followup-20261013/README.md)。本轮按维护者明确授权完成独立复核、CI及验收后经PR合并，最后更新#32，不直接推送main。F20仍PARTIAL，原R/K不整体改签，SAVE/A6仍UNCONFIRMED；真机、素材、待定规则及其他开放PR保持原归属。以下历史记录保留。

## 2026-10-13 · CI-SHOP-TOUCH-01 双触时间修复

维护者明确确认 A＋B，并要求新建独立 PR；从最新 main `95036af` 在 `fix/shop-double-touch` 承接 [Issue #32](https://github.com/xuys2025/escape-bincov/issues/32#issuecomment-6145429842)。窄屏商店测试连续排队两次 CDP 原生触控、保留成功/失败时序证据；库存格改用输入 `e.timeStamp`，保留320 ms窗口。新门槛覆盖真实长任务后的快速输入与350 ms输入的两次单选，旧main有效负对照及实际检查见[验证记录](shop-double-touch-20261013/README.md)。等待完整CI和维护者审阅，真机未测；不接管#43/#44，不启动院子降频或剧情实现。#45已接受纯文档准备，下面草稿文字是历史状态；后续剧情需新指令确定承接入口。

## 2026-10-13 · 市场剧情接入草稿准备

维护者要求先合并文学精修 #31 与转化规格 #30，再判断未实现部分、开草稿准备做。已核对当前正式源码及相关开放 PR：原维修交付与供电已实现，剧情状态/迁移、按缺额工具柜、市场见闻、小蔡条件对白与回顾尚未接入；第一批仅承接 ch01-n01/ch01-n02，细项和市场30项门槛见[实施任务书](STORY-MARKET-IMPLEMENTATION.md)。本分支 `feat/story-market-slice` 从最终 main `2bc321486edc652004ad612d8661f9e5f0ca0a49` 接手，只完成准备文档，保持Draft，等待下一次实施指令；不启动第三条同时运行的代码实现线。工厂联系及后续16节点、其余区域、人物去向与三结局保留未实现和待细化归属；#28/#39/#40/#41/#43/#44及#26/#32继续原任务。以下历史记录保留。

## 2026-10-13 · #31→#30 合并与市场实施准备

维护者明确授权先合并文学精修 #31，再合并剧情转化规格 #30。当前分支正常同步最新主线及 #31 远端候选 e566137，保留原 fork head 与双方文档历史；README采用已接受新版，只补剧情导航。三份规格补充当前文学基线与18事件定位，旧 #29 来源/排期保留追溯。#22/#33已完成，原时间前置已满足；市场功能、版本迁移与30项运行验收仍未实现，#30结束后由独立市场实施草稿准备承接，工厂及其余章节待细化排期。原 #28/#39/#40/#41/#43/#44 保持归属；本轮不启动新功能代码。准确head完整CI通过后才执行已授权合并。以下历史快照保留。

## 2026-10-13 · #32 商店反馈、冷图片恢复与旧 HUD 释放

从最新 main `64505046` 在独立分支 `fix/issue32-shop-recovery` 复现并修复三类可独立确认的缺陷：交易现金/空间拒绝原因及过期清单原地刷新；两套冷 PNG 绘制异常导致加载不结束；SOL-F20-HUD-01 的 Phaser 全局鼠标事件保留旧 HUD。原版有效负对照、实际验证、截图与剩余范围见[验收报告](issue32-20261013/README.md)。295项单测、最终构建17项专项、5项场景往返和5项生命周期通过；产品提交91a38b1完整CI通过。额外旧院子65/76、城中村47/51，其全部失败点已在原main对照复现并保留，未降低断言。最终验收记录与CI见[PR #42](https://github.com/xuys2025/escape-bincov/pull/42)。维护者已明确授权自验通过后经 PR 合并，不直接推送 main。#32/#26总单、F20总堆、原R/K、SAVE/A6历史未确认、真机及产品/素材待定项保持开放；既有射击与剧情 PR 不改。以下原历史记录保留。

## 2026-10-12 · 游戏射击系统改造（PR #28 实现前置）

维护者明确要求独立建 PR，由 `feat/shooting-system-rework` 承接原 PR #28 规划的 M0-S 射击基础。见[范围、分工与验收门槛](SHOOTING-SYSTEM-REWORK.md)。射击实现、独立验收和维护者试玩完成并获准合入 main 后，[PR #28](https://github.com/xuys2025/escape-bincov/pull/28) 再同步主线进入改装实现；#28 文档可继续审阅。今天只建档，完成后停止，等下次指令再实施；文档或 CI 通过不等于前置功能完成。以下历史记录保留。

## 2026-10-12 · SOL-R3-CAP-LISTENER-01（AI 遗留三级单项）

#36 已合并，main `1dbacb4`。按维护者指令在独立分支 `fix/cap-listener-r3` 只收口 #32 的 SOL-R3-CAP-LISTENER-01：区分测试 scratch 绘制与产品往返各自触发的 Pixi DefaultShader 替换，渲染层改为每个纹理数一个 DefaultShader，修复前 C5 失败对照保留。见[复现、根因与验证](station-yard/opus-cap-listener-20261012/README.md)。本批为独立小 PR，不改 Runtime/存档/图片；F20 总堆、ASTRA-SAVE-01、原 R/K 及其它二三级保持原状态，不自行合并/发布/更新试玩站。

## 2026-10-12 · README 更新（独立文档交付）

维护者要求更新首页过时内容。基于最新 main `1dbacb4`，由 `docs/readme-current` 承接 README 的玩法、入口、操作、开发命令与进度边界更新，完成条件为说明对齐源码、链接有效、打包制品不变及 PR CI 通过。当前主调度负责本项；Opus 继续独立处理 #32 的 SOL-R3-CAP-LISTENER-01（`fix/cap-listener-r3`），不改其文件或扩展修复范围。#34/#35/#36 已合并；下方待审字样为历史记录，实时状态以 GitHub 为准。

## 2026-10-11 · 水产站进站救济（AI 遗留续作）

#35 已获维护者授权合并，最新 main `21e3796` 的 CI 全部通过。按“继续解决遗留问题”，在独立分支 `fix/station-relief-entry` 承接 #32 的 ASTRA-STATION-RELIEF-01：救济归属正式进站接口，保留资格、满包队列、失败回滚和重复入口保护；同时修正 #35 留下的药剂名称。见[实现与真实验证](station-relief-20261011/README.md)。本批新增独立 PR，完整 CI 通过后交维护者审阅；不自行合并，#32 总单及其余二三级问题保持开放。下方 #35 待审字样为历史快照。

## 2026-10-11 · AI 遗留第二级 A 批实现（PR #35 续作）

维护者明确要求在 `fix/ai-tier2-station` 继续原 [PR #35](https://github.com/xuys2025/escape-bincov/pull/35)。fetch 核对 main `6494b51`，沿用准备提交 `8c24ac3`；当前 agent 独立完成 ASTRA-STATION-API-02 可信训练进度、ASTRA-STATION-API-03 补给拒绝原因及现有界面接线。[范围](AI-LEFTOVERS-TIER2A.md)、[实际验证与首败/截图](station-tier2-20261011/README.md)。287单测和15项专项通过，真实132.331秒墙钟完成120秒有效训练；受影响旧回归、必要打包和最终head完整CI按报告/PR核实。CI全过才转Ready，#32两项标待合并，总单开放；交回主调度审查后停止。救济、人物/场景素材、内存等其它二三级和在途 #28/#30/#31保持原归属，不扩量、不自行合并/发布/更新试玩站。#34已合并及下方记录按历史日期保留。

## 2026-10-11 · AI 遗留第一级实现（PR #34 续作）

#22 与 #33 已合并，fetch 核对 main 仍为 fc2a1d3。维护者本轮明确要求当前 agent 在 `fix/ai-tier1-station` 继续 [PR #34](https://github.com/xuys2025/escape-bincov/pull/34)，一次完成 OPUS-STATION-COPY-01（真实出击计数文案）与 ASTRA-STATION-API-01（护符快照及接线）。两项代码和当前方案内的院子接线已完成，存档格式与交易规则保留；[范围](AI-LEFTOVERS-TIER1.md)、[真实验证/截图/首败](station-tier1-20261011/README.md)。最终 CI 与 Ready 状态以原 PR 最新 head 为准，等待维护者审阅，未合并/发布。仅更新 #32 对应子项，总单及二三级仍开放；#26 和在途 #28/#30/#31 保持原归属，不新增同目标 PR，完成后停止。

> 2026-10-11 合并收口：维护者授权先合并设计 #22，再合并本实现 PR。候选 c565d97 的游戏源码、素材、测试与生成物保持不变；历轮原始附件完整归档。当前范围、证据与延期边界见[实现交付](IMPLEMENTATION-RELEASE.md)，AI 遗留见 [#32](https://github.com/xuys2025/escape-bincov/issues/32)，玩家反馈仍在 #26。以下历轮状态按原日期保留，不代表继续派修或当前远端状态。

# 统一任务清单与 PR 归属

这里统一回答“当前做什么、到哪个 PR 继续、何时算完成”。详细需求、实现和验收仍保留在对应文档与原 PR，不在此复制全部复选框。

## 1. 当前约定

维护者于 2026-10-05 确认：暂时不再补充新需求，先收尾当前任务；并明确现有各 PR 都有 agent 正在工作。

- 原暂停期限为流程整理 PR #19 合并前；#19 已于 2026-10-06 合并。期限结束不等于待排期事项自动获准实施；继续按维护者当前任务收尾，新需求先登记。
- 本次流程整理为维护者明确安排的独立文档交付。流程规则本身不重新分配其他任务。维护者于 2026-10-06 另行授权 #11、#18 的归档整合与本 PR 收口；其余在途任务保持原执行者及分支。
- **现有 agent 继续在各自原 PR 工作。** 下表的收尾安排供原任务执行者推进；“待审”“待核对”描述交付状态，不代表无人工作。不要根据一份快照切换到他人的分支写入、重做其工作，或关闭其 PR。
- 后续默认最多同时启动两条独立实现线；审阅和必要修复继续随原 PR。当前在途任务全部保留，不为满足数量限制中断 agent；先收尾再补位，不增加第三条新实现线。文档和调研跟随所属目标，不能换个名目再开实现线。
- 任务优先级、归属或范围有变化，更新此清单并在原 PR 留下交接依据；不能靠另建 PR 表达一次讨论结论。

## 2. 在途任务快照

2026-10-11 本地独立复验增补：原分支 `agent/hideout-runtime` 固定68daab4，见[Sol资源R3签收](station-yard/sol-resource-r3-20261011/README.md)与[Opus/Astra遗留](station-yard/sol-resource-r3-20261011/issues.md)。旧RT空槽清理、原同能力graphics程序/源码复用分别PASS；反复模拟8/16能力切换监听增长仍OPEN交Opus。三组严格60轮资源释放/六表检查通过，总堆及历史F20仍PARTIAL，原R/K严格失败保留。lifecycle真实院门两尺寸各5/5，J1采样修正后旧6/6、新6/6、无trace新版2/2，首败与有效负对照独立留存。275单测、package、院子76及受影响回归已执行，未改产品/素材；ASTRA-SAVE-01未确认，真机/真人/原生GPU/更长循环等未测。本地提交后停止，不推送、合并、发布或更新试玩站；下面固定历史快照保持原样。

核对日期：2026-10-06。已接受基线 main `90451397c2f21b9907877a5158c51a7cf7b98acc`。维护者本轮明确授权审阅并合并 #16、处理关联 #17 后继续 #10；原 #10 agent 已交付待维护者合并。本表是固定快照，最新状态仍以 GitHub 为准。

| 任务 / 承接入口 | 核对时实际范围 | 下一步与范围边界 |
| --- | --- | --- |
| [#30](https://github.com/xuys2025/escape-bincov/pull/30) · `docs/story-adaptation` · [剧情转化工作方案](NARRATIVE-ADAPTATION-PLAN.md) | 2026-10-09 用户明确批准实施本轮内容规格；开工 main `8355b85`，交付同步至 `43a342c`。剧情输入为 #29 `c940128`；#29 已合并，正文不变。开放 #22／#28 无同目标内容规格承接 | 本轮交付总方案、十八事件与线索登记、市场与回站样板（两路线、固定补给、完整条件对白与状态、30项未来验收），等待维护者审阅。代码接入仍排在 #22 后，工厂及其余章节逐批细化；同一目标在此任务续作，文学稿与游戏实现分别验收 |
| `fix/shop-drag`（尚无 PR）· [修复说明](SHOP-DRAG-FIX.md) | main 上的既有缺陷：修理铺、卫生所购物车鼠标拖放无效（自 `030fa74` 起）。2026-10-09 用户授权从 main `43a342c` 建独立分支修复；本地提交，未推送、未开 PR | [Sol 独立报告](shop-drag-fix/sol-20261009/README.md)：商店自动化通过；[稳定性续作](shop-drag-fix/stability-20261009/README.md)已修正 systems/QOL 测试时序并纳入触屏补验，15次定向及完整21套通过；完整验收仍 PARTIAL（真人/真机未测，历史首败保留）。仅本地提交后停止，推送与开 PR 由维护者另行安排。不混入 PR #22，不改交易与存档规则 |
| [#27](https://github.com/xuys2025/escape-bincov/pull/27) · `docs/world-regions-story` · [世界观与地图主线](WORLD-REGIONS-STORY.md) | 2026-10-09 已合并为 `8355b85`，接受潮水、盐度、一据点十二区域、五方势力及六阶段三结局的设计文档 | 维护者确认先完成 #22，再实施相关功能；[#26](https://github.com/xuys2025/escape-bincov/issues/26) 只部分被覆盖，保持开放。文学重写由下方登记的独立草稿承接，文档合并不代表玩法已实现 |
| `ci/parallel-browser-checks` · [CI 工作流](../.github/workflows/ci-pages.yml) | 2026-10-07 维护者明确授权执行 CI 优化；实时 main 为 `f144147`，无同目标开放 PR。单次构建，20 项浏览器检查分四组独立 runner 并行，保留统一门禁、证据与 Pages/镜像检查名 | 本地语法、覆盖、失败门禁、制品哈希及单元/打包检查后提交独立 PR，等待该提交完整 CI。按路径选择测试、缩短诊断循环及缓存调整留待后续明确范围；等待维护者合并 |
| [#10](https://github.com/xuys2025/escape-bincov/pull/10) · `agent/qol-discovery-20261005` | 原头 `a99c661` 的完整 QOL 与已接受 #16 整合；保留原分支历史，补齐 RPG 商店、多层搜刮/拆分/旋转、真实命中方向和基地离店确认 | [本轮整合记录](QOL-PR16-INTEGRATION.md)；必须在最新组合完整 CI 通过后合并。真机及真人清单继续保留 |
| [#11](https://github.com/xuys2025/escape-bincov/pull/11) · `docs/art-direction-research` | 核心资产已由 #20 采用；63 份来源档案由 #19 保留原头父历史承接 | GitHub 已标记合并，归档来源及历史验收保留；不恢复旧 `art.css` |
| [#16](https://github.com/xuys2025/escape-bincov/pull/16) · `feat/buildings-rpg-mall` | 最终头 `c558888` 已复核，完整 CI 通过，合并为 `9045139`；建筑/RPG/基地/商场进入主线 | [73 项验收登记](PR16-ACCEPTANCE-REGISTER.md)保留原图、真人、真机、独立性能及扩展组合缺口；已合并不代表这些全部通过 |
| [#17](https://github.com/xuys2025/escape-bincov/pull/17) · `docs/pr16-development-plan` · `d0b6bd8` | M0–M7、68 项任务及 16+23+34 条验收已由 #16 完整采纳；逐行比较仅两段开头说明更新为历史事实 | 按“内容已由 #16 采纳”关闭，未再次合并旧说明。保留原分支、提交和[原规划交接](https://github.com/xuys2025/escape-bincov/blob/d0b6bd8259a2b102a565ae1c714c97edebf58bfc/handoff.md) |
| [#18](https://github.com/xuys2025/escape-bincov/pull/18) · `docs/tarkov-ui-study` | 34 份原型、许可和证据已通过完整 CI 并合并为 `912aadc` | 原型仍非游戏；旧截图重采在历史 `baa8335` 工作区，不覆盖当前发布包 |
| [#21 主界面像素重做](https://github.com/xuys2025/escape-bincov/pull/21) · `feat/pixel-title-parallax` | 按用户 2026-10-06 认可的像素概念与本地实施计划，独立重做主菜单：分层像素素材、2.5D 视差、环境动态、统一点阵字体、多端排布与离线打包 | 2026-10-07 用户指出透视、前中后景和光照尚未达标，#21 已转草稿；本轮改为同一概念母版分层，纠正室内地板混入码头的问题，重校桌台、椅座、吊灯、船及前景遮挡；已目视检查四角视差和多尺寸。整体美术仍未验收，继续在原 PR 修改。v3 完整 CI 已通过；继续减弱过重遮罩、精修字标和菜单、补短横屏文字对比度。v4 CI 已通过，但用户实测反馈动态眩晕和掉帧；继续取消位置取整与标题相机取整，图层、船与灯改为连续运动；取消纵向与自动漂移、收窄横向视差并缓存水面。实际截图验证 0.1 像素位移可见，20 次往返无资源增长。v5 完整 CI 已通过，用户确认不再卡顿，但指出边缘发糊；v6 改为更密的主菜单渲染画布和像素复制后细边界采样，保留连续坐标与实际画面回归，退出后恢复局内缩放。见 [当前 v6 糊边修复](title-parallax/motion-v6/README.md)，用户实际边缘体验待确认 |
| [#23 主界面统一像素网格](https://github.com/xuys2025/escape-bincov/pull/23) · `feat/title-pixel-grid` | #21 已合并为 `425f320`；用户反馈画面“AI 味”重，确认采用“母版真像素化加关键处手绘”的方案。独立交付：全局 640×360 网格、共享色板、手绘替换海报与电表，不改源图和场景结构 | 草稿 PR，待用户验收整体美术。后续候选：效果精灵对齐网格、电台旋钮与步枪手绘、字标重绘。本轮按维护者要求在原 PR 修复旧客户端冲突测试时序（Refs #24）；保留全部保护断言，本地 4 倍 CPU 连续 5/5、正常搜刮 44/44、存档专项 9/9 通过，完整 CI 以最新提交为准。见 [测试修复记录](LOOT-CONFLICT-TEST-FIX.md)及 [title-pixel-grid](title-pixel-grid/README.md) |
| [#20](https://github.com/xuys2025/escape-bincov/pull/20) · `feat/tactical-pixel-ui` | 战术界面、字体 B、统一美术已合并为 `9fe189c` | #10 整合继续保留布局、30 件库存美术和回归 |
| [#19 流程整理](https://github.com/xuys2025/escape-bincov/pull/19) · `docs/pr-workflow-consolidation` | 统一任务入口及 #11 来源归档，完整 CI 通过后合并为 `07b1414` | 默认复用原 PR、需求先登记、最多两条新实现线等约定继续生效 |

原 agent 后续推送可能使 SHA 过时；推送和合并前重新核对，不覆盖较新提交。

## 3. 收尾与阶段交接

### 2026-10-10 · Opus 第三轮：上下文恢复的两项资源问题

Opus 从 7a4dc75 在原分支续作，只修 Astra 确认的两项：恢复后旧 worldRT/lightRT/glowRT 留在 `glTexture` 管理表的空槽（院子换 RT 时只删这三个 uid 的 null），ASTRA-R3-PIXI-01（graphics 适配器经 Pixi 扩展接口替换，按可批纹理数整页复用程序，每个新上下文仍重新链接与绑定 uniform）。固定口径三组各 60 轮：恢复组空槽 0（同会话修复前 9→189）、shader 键 3/3/3（修复前 6/36/66），严格/归属失败 0（修复前 60/60）；重挂/共享不回归。总堆仍 PARTIAL，原 Sol R 四败保留，ASTRA-SAVE-01 仍 UNCONFIRMED。见[第三轮修复报告](station-yard/opus-resource-r3-20261010/README.md)与[Sol 独立复验清单](station-yard/opus-resource-r3-20261010/SOL-RECHECK.md)。本地提交后停止，不推送、合并、发布或更新试玩站。

### 2026-10-10 · 水产站资源身份与三组60轮归因

Astra按维护者要求从5075ed6续作，见[第三轮资源报告](station-yard/astra-resource-r3-20261010/README.md)与[Opus/Sol清单](station-yard/astra-resource-r3-20261010/HANDOFF.md)。原R严格四败保留；固定完整预热后三组各60轮分列：重挂/共享资源与旧对象释放通过；恢复每轮3个旧RT空槽，重挂清零。新确认ASTRA-R3-PIXI-01：恢复触发Pixi全局shader源码idHash每次新增4,336B键，60轮+260,160B，交Opus渲染层修复。整体SOL-R2-RESOURCE-01、F20继续PARTIAL，ASTRA-SAVE-01仍UNCONFIRMED；没有确认Runtime/会话底层缺陷，产品源码/素材/制品字节不改。完成本地提交即停止，不推送、合并、发布或更新试玩站。原验收记录保留。

### 2026-10-10 · 水产站院子正式整合

同一工作树 agent/hideout-runtime 在 Astra 交付 81fbb8a 上接入院子：默认进入院子、受控启用成长并保留旧档、旧页签作快捷备用入口、设施沿用原型布局、固定雨夜；交易、出击与结算走正式接口，Sol R1 + R1.1 图片接入。见[接线说明](station-yard/README.md)、[验证记录](station-yard/VALIDATION.md)、[Sol 独立验收清单](station-yard/SOL-ACCEPTANCE.md)。Sol 已按固定 ee09381 完成[独立验收](station-yard/sol-acceptance-20261010/README.md)，整体PARTIAL：竖屏菜单遮挡与通电墙面明暗格块交Opus，Runtime/存档及未归因堆增长交Astra，转身缺帧与老栓待机质量列后续素材需求。首败、正/负对照及未测项保留，见[负责人遗留](station-yard/sol-acceptance-20261010/issues.md)。Opus 第二轮在原分支修复 OPUS-STATION-INPUT-01（竖屏“功能”菜单被“交互”挡住、误开出击）与 OPUS-STATION-LIGHT-01（墙面/屋顶逐格明暗），修复前失败对照与修复后实景见[第二轮报告](station-yard/opus-round2-20261010/README.md)，Sol 已按清单在固定 c24d32b 完成[独立复验](station-yard/sol-round2-20261010/README.md)：INPUT-01 自动化 PASS，LIGHT-01 画面/移动裁剪 PASS；76项、单测、打包及受影响回归通过，旧版7/23负对照保留。充分访问后的显式释放与20重挂通过，共享宿主/恢复管理表严格失败与总堆增长仍 PARTIAL，见[负责人遗留](station-yard/sol-round2-20261010/issues.md)。原验收/首败材料不改，ASTRA-SAVE-01、F20与真机真人未测状态不变。昼夜变化 STATION-NEXT-01 仍为下一轮。本地提交后停止，不推送或发布。

### 2026-10-10 · 水产站真实会话逻辑

维护者本轮明确授权的新阶段，在独立工作树 agent/hideout-runtime 汇入 main 43a342c、城中村176ee1d及商店ddba69f；完成单会话/旧档升级/库存/设施/生产/训练/出击回站接口。见[逻辑交付与范围](hideout-runtime/README.md)、[Opus 接线](hideout-runtime/OPUS-WIRING.md)、[Sol 复验清单及真实结果](hideout-runtime/VALIDATION.md)。院子显示与共享渲染宿主仍待 Opus；本轮本地提交后停止，不推送或发布。F20 PARTIAL及历史未确认结论保持。此记录不宣称远端 #22 已包含本地代码。

### 2026-10-09 · PR22 Astra R7 诊断交接

从 e209ed0 完成严格60循环和高潮20循环，F20继续PARTIAL；引用链证据、前端资源归属及Sol原标准复验条件见[诊断报告](coast-sample-view/astra-r7-f20-20261009/README.md)。R7-L5确认沿用水下拾取规则；未改游戏源码/素材/包，不启动R7-L1～L4或扩量，不推送/合并/发布。以下历史交接保留。

1. 各原 agent 先完成自己当前已确认范围的工作，修复、测试和说明仍放原 PR；范围或状态改变时同步本清单的对应行，无需为清单更新另开 PR。
2. #20 已完成 #11 核心美术与 #18 设计方向的实际接入。#11/#18 在原 PR 保留来源和验证档案后收尾，运行代码以当前主线为准；避免重复测试步骤、旧布局或旧字体回流。#10 继续独立 QOL 交付，新增功能与已接受界面共同验收。
3. #17 的采纳核对已完成；详细计划作为历史规划保留，当前实现与未决项以 #16 实施记录和验收登记为准。
4. #16 已按维护者授权完成技术审阅合并；不得因此勾选尚未完成的原图、真人、真机和独立性能验收。
5. 后续同一交付在同一 PR 内分阶段推进；原 PR 结束后，先核对结果与剩余范围，再由维护者安排下一项交付，不自动拆出一批阶段 PR。
6. 一个任务合并/关闭后，核对实际结果、保留未完事项和证据，再决定下一项独立交付；不把未完成事项随关闭一并消失。同步 main 时保留他人已接受改动，按实际影响复验。

#16 已进入 main 的承接资料：

- [总实施计划](IMPLEMENTATION-PLAN.md)、[详细开发计划](PR16-DEVELOPMENT-PLAN.md)。
- [M0 状态与兼容记录](M0-STATE-AND-COMPAT.md)、[实际实施记录](PR16-IMPLEMENTATION.md)。
- [73 条正式验收登记](PR16-ACCEPTANCE-REGISTER.md)；旧基线规划不作为当前源码事实。

最高玩法指令保持不变：**离层后立刻进行一次子弹结算，随后冻结该层时间。** 完整边界以已合入的[建筑设计](BUILDING-LOGIC.md)和[商场设计](MALL-VALIDATION-MAP.md)为准；全局行动时间、潮汐与追击事件仍按设计推进。协作规则不改写玩法决策。

## 4. 待讨论与阻塞登记

2026-10-07 新增独立文档交付：维护者已确认沿海地图 A 视角与灰褐废土方向，并明确只生成文档。核对 main 为 `425f320`，当时没有开放 PR；#21 已合并，其主菜单成果不属于本次重绘范围。下表新条目不重写上方历史快照，也不启动新的代码实现线。

| 事项 | 来源 / 当前归属 | 当前处理 |
| --- | --- | --- |
| 沿海地图 2.5D 视角与像素材质 | 用户确认；设计 [#22](https://github.com/xuys2025/escape-bincov/pull/22)，实现 [#33](https://github.com/xuys2025/escape-bincov/pull/33)；[设计文档](COAST-2_5D-ART-DESIGN.md) | 2026-10-11 设计已合并（9e5173b）；维护者授权 #33 承接 c565d97 的城中村样板、水产站院子及既有修复，按最终 CI 门禁合并。当前交付、历史证据和范围见[实现交付](IMPLEMENTATION-RELEASE.md)，AI 遗留见 #32。以下按日期保留历史实现与验收记录，不继续扩量。 |
| 故事文学性重写 | 用户 2026-10-09 明确要求；[#29](https://github.com/xuys2025/escape-bincov/pull/29) · `docs/story-literary-rewrite`；[写作交接](STORY-LITERARY-REWRITE.md) | #27 已合并，维护者认为现有故事缺少文学性，交给 Opus 5.5 续写。2026-10-09 已在同一草稿 PR 提交[《等海退去》](MAIN-STORY.md)初稿，设定索引补充第 6 节，取舍列在写作交接的修订说明中。LMX-323 已回复六项取舍（五项接受，人物去向改为随条件变化），同日完成第二轮修订。创作者批准后转 Ready，按维护者授权合并。文稿合并不代表故事已接入游戏：接入仍排在 #22 之后，#26 保持开放。功能实施仍排在 #22 完成后，#26 未决建议保留 |
| QOL 与建筑/RPG 主线整合 | #10 原分支，基线 `9045139` | 本轮修复与验证见 [整合记录](QOL-PR16-INTEGRATION.md)，完整 CI 通过后按维护者授权合并；未完真机验收保留 |
| 美术及界面前序成果收尾 | #11 / #18，承接实现 #20 | 方向与核心资产已采用；原 PR 留档收尾，历史报告不冒充新版本验收 |
| 追击事件重开已经走过的门 | #16，审阅 `7cc9236` 的 `src/pursuit.ts` | 已复现并修复，只处理本帧新路段及身体范围；纯规则、原生关门/刷新与主线整合回归通过，最终 CI 已通过并随 #16 合并 |
| 商场两张原参考图、精确还原依据 | #16 / #17 的既有 M6 条件 | 现有记录称缺失；由原任务持续核实和登记，不虚构已取得，不阻断无依赖的基础工作 |
| 真机、真人平衡等必要证据 | 各任务原验收记录 | 保留未验收/阻塞状态；仿真不替代真机，处理发布条件时明确决定 |

2026-10-08 Sol 在原分支从 `cdfc965` 接手完成本轮工程验证及限定43 PNG试样，详见 [验收报告](coast-sample-view/sol-acceptance-20261008/README.md)、[Astra/Opus归属清单](coast-sample-view/sol-acceptance-20261008/defects.md)及 [manifest](coast-sample-view/sol-acceptance-20261008/assets/manifest.json)。223项单测、样板17项、原20项浏览器回归、五轮240张截图与修复后的商场三局自动点击通过；完整20次进出资源归零，但F20堆增长条件未签收。历史偶发存档异常未复现/未修复；前端数量/格位、地图/阅读、素材接入和视觉签收交回Opus，存档诊断交Astra。未修改游戏源码，未扩量、未合并/发布，本地交付后停止。此记录更新同一PR状态，不新增实现线。

2026-10-08 Opus 第三轮在原分支从 `c836737` 接手，完成 Sol 验收返修：背包/搜刮格子拖放、旋转、拆分与安全箱转移，地图、阅读与缺失 HUD；接入首批43张素材并给出返修项；隐藏房间特效按揭示区域管理；F20 堆增长定位为测试句柄与 JIT，另有 PixiJS 全局着色器名缓存约5KB/次挂载；补了相应回归。见[第三轮说明](coast-sample-view/round3/README.md)。仍为本地提交，未扩量、未合并/发布。

2026-10-08 Sol 从 `6a7e6b1` 续作第三轮工程复验与首批素材返修，见 [新版报告](coast-sample-view/sol-round3-20261008/README.md)、[Opus/Astra问题清单](coast-sample-view/sol-round3-20261008/defects.md) 与 [manifest](coast-sample-view/sol-round3-20261008/assets/manifest.json)。Node24下223单测、20浏览器回归、新功能27项、商场三局及限定遮挡通过；136截图诊断无异常。F20实例不累积，但总堆仍增长、Pixi名称缓存约5.35KB/挂载，严格条件未签收。43件中34返修/9原样；R08待Opus接入、R10下蹲范围待决定、短屏地图标注重叠交Opus；历史存档异常仍交Astra。没有改前端方案或扩量，未推送/合并/发布，交付后停止。沿用原PR，不新增实现线。

2026-10-08 Opus 第四轮在原分支从 `87b879b` 接手：正式接入 Sol 第二版素材（34 替换/9 不变）；背向持枪按纵深缩短、保留镜像、死亡改为倒地倾斜（不需要下蹲图）；短屏地图标注避让；整页复用 Pixi 渲染器消除着色器名缓存增长，Sol 严格总堆条件仍 partial。样板 32/32，20 项回归中 `qol-expansion` 为基线即有的间歇失败。见[第四轮说明](coast-sample-view/round4/README.md)。仍为本地提交，未扩量、未合并/发布。

2026-10-08 Astra 从 bcf7304 续作第四轮生命周期复核：普通上下文丢失/原画布恢复、启动失败资源与所有权清理、结算后测试引用释放已修复并验证。ASTRA-SAVE-01 历史根因仍未确认；F20 实例释放通过、Sol 严格总堆 +380,136 B 仍 partial。224 单测、样板 32/32、普通生命周期两尺寸各 4/4 及风险矩阵浏览器回归通过。见[交接与可复验签收标准](coast-sample-view/astra-lifecycle-20261008/README.md)。前端展示交 Opus，工程复验交 Sol；按用户要求仅本地提交，交接后停止，不扩量、不推送/合并/发布。

2026-10-08 Sol 从 `97c0b44` 在原分支复验：qol-expansion补真实状态等待，原26断言保留，20次新浏览器＋完整回归通过；224单测、package、样板32项和原20套回归通过。生命周期普通两尺寸各4/4及旧对象0可签PASS，F20严格结果页+379,727.2B仍PARTIAL；完整A/B与普通对照分别保留，不宣称差额全部归因。背向、镜像、短屏地图通过，真实敌人倒地直接换尸体已确认，交Opus按原方案修；无需下蹲/西向补图，43件不变。ASTRA-SAVE-01继续未确认。详见[报告](coast-sample-view/sol-round4-20261008/README.md)、[归属清单](coast-sample-view/sol-round4-20261008/defects.md)及[素材需求](coast-sample-view/sol-round4-20261008/material-requirements.md)。仅本地提交，未改前端方案、扩量、推送/合并/发布，交付后停止。

2026-10-08 Opus 从 `81e1bd0` 在原分支只修 OPUS-DEATH-01：视图在同步演员前先读取本批 `death` 事件，真实敌人死亡在视野内先倾倒再换尸体（两种素材模式）；未揭示房间、epoch/楼梯重建与读档不播放倾倒。新增 V03/V04 真实伤害门禁，样板 36/36，`81e1bd0` 重建对照 0/4；224 单测、package、Sol 原 visual 工具、生命周期两尺寸 4/4、browser/portable 通过。玩家自身死亡只呈现第一帧便进入结算，登记为候选 OPUS-DEATH-02，待决定。见[报告与 Sol 复验说明](coast-sample-view/opus-death-20261008/README.md)。仅本地提交，不扩量、推送、合并、发布。

2026-10-08 Sol 从 `bf099cc` 在原分支限定复验 OPUS-DEATH-01：原真实死亡工具exit0、正式样板36/36，两模式敌人倾倒/尸体交接、隐藏房间0像素泄露、epoch/楼梯/读档不重播均通过；生命周期两尺寸各4/4、224单测、package、原20套浏览器回归、68截图诊断通过。见[签收报告与归属状态](coast-sample-view/sol-death-20261008/README.md)。仅敌人路径签收；玩家完整倒地不在范围，OPUS-DEATH-02待排期，F20 PARTIAL与ASTRA-SAVE-01未确认不变。生产源码、原脚本、PNG/manifest及制品均未改；本地提交后停止，不扩量、推送、合并、发布。

2026-10-08 Opus 第五轮从 `05aaee6` 接手，在原分支负责真人试玩的前端整改。改动：

- 新增 `城中村试玩.html` 跳转页；样板模式下种子留空时，出生点固定在城中村街口，撤离点含北线检查口。
- 地面物品改用游戏自带的物品图标。
- 人形角色由运行时绘制袖管，连接武器上的手套。
- 墙顶降亮度，无顶废墟的布局变得清楚；混凝土地面加纹理。
- 玩家加淡描边；HUD 改为带底板的状态卡和武器卡。
- 搜刮和背包面板贴底停靠，镜头让玩家保持可见。
- 修复撤离圆弧从世界原点拉出的线。

样板门禁 37/37（新增 V05），真实输入全流程到结算在三种条件下通过，224 单测、package、生命周期两尺寸及 9 套原回归通过。Sol 第二批图片规格、Astra 出生点和射程待判断事项见[报告](coast-sample-view/opus-playtest-20261008/README.md)。仅本地提交，等待用户试玩；不扩展全沿海，不推送、合并或发布。

2026-10-08 Opus 在样板接通声音：沿用已有 SynthAudio，按原 RaidScene 的用法接通开枪、近战、受击、脚步、拾取、换弹、开门、无线电和结算；音频跟随阶段挂起与恢复，切出切回后能恢复；暂停面板补音量滑块；修复流血每帧刷屏的受击音和闪白。输出端实测 `coast-audio-test.mjs` 14/14（不加自动播放参数），旧构建 1/14；229 单测、样板 37/37 及回归通过。音频服务「恢复期间提示音被静默丢弃」交 GPT 侧（Astra 主责），原游戏暂停后放弃也受影响。见[报告](coast-sample-view/opus-audio-20261008/README.md)。仅本地提交。

2026-10-09 Opus 第六轮从 `1c1c935` 接手，按用户指令自主完成前端体验整改（玩法逻辑、Runtime 接口、存档事务、图片生成和独立复验归 GPT 侧）：

- 画面：地面重新合成，墙脚接触阴影、水洼、抖动投影；光照改为烘焙光照图；无状态的细雨、海雾、碎屑和水面反光。
- 反馈：命中和击杀标记、后坐、换弹环、受击边缘、画面外射手提示、撤离指向标、箱盖和门的动画。
- 结局：结算后的落幕，玩家倒地完整播放（修复 OPUS-DEATH-02）。
- 声音：左右声像和新提示音；修复已登记的「音频服务恢复期丢提示音」，原游戏从暂停菜单放弃时的死亡音也恢复。
- 测试：样板门禁增至 42 项（新增 V06–V09，旧构建 0/5）；找到并修正历史截图异常的摆放根因（交 ASTRA-SAVE-01 确认）。

逐项任务（问题、接口或素材规格、验收、依赖）见[给 GPT 的任务清单](coast-sample-view/opus-experience-20261009/gpt-tasks.md)，实测见[报告](coast-sample-view/opus-experience-20261009/README.md)。仅本地提交，不扩展全沿海，不推送、合并或发布。

同日补充：按用户试玩反馈修复样板背包和搜刮面板的两个问题，并新增门禁 U11、U12，样板门禁共 48 项。见报告第 8 节。
  - 格子里的三字物品名被截断；
  - 拖动时影子偏离鼠标，并让面板出现滚动条。

新增记录沿用这三列，并写清期望行为、来源链接、所属任务/待排期状态及完成条件。有同一 issue/PR 时补充原记录；独立新需求可用 issue 登记，不要求先有代码或新 PR。在下一次相关 PR 中同步本清单索引，不为登记本身另开 PR；已有相关任务则可直接在其分支更新本表。不要为一个想法同时新建计划 PR、实施 PR 和修复 PR。

## 5. 续作还是新建

| 情形 | 做法 |
| --- | --- |
| 同一目标的澄清、范围内补充、修复、测试、文档、审阅意见 | 继续原 head 分支和 PR；更新正文、阶段证据和交接 |
| 换 agent、换会话、改了文件类型、完成一个提交 | 仍是原任务；先核对最新 head 和工作归属 |
| 与当前交付无关的新想法 | 登记待排期，不顺手扩项；当前暂停期限内不启动 |
| 无承接 PR 的独立交付，已有明确范围和验收条件 | 核对依赖与并发安排后才新建，并在 PR 模板说明独立性 |
| 原 PR 已合并/关闭，仍有后续工作 | 核对原结果与剩余范围，登记下一次交付；不复用已结束 PR 冒充仍可审阅 |
| 原 head 无写权限、工作区存在他人改动 | 保留补丁或隔离本地工作并说明阻塞；不强推、不覆盖、不另开同目标 PR 绕过 |

完成条件以明确范围、对应实现、实际验证、必要文档及维护者审阅为准。CI 通过、文档合入和正式玩法完成分别记录，不互相替代。

2026-10-09 Sol R6独立验收（PR22原分支，从14abea3，仅本地）：[报告](coast-sample-view/sol-r6-20261009/README.md)和[Opus/Astra清单](coast-sample-view/sol-r6-20261009/defects.md)。233单测、20回归、生命周期两尺寸4/4；样板首轮46/48、顺序48/48，稳定性缺口保留。音频/玩家完整倒地本机自动通过；新缓存落幕资源20/20（恢复夹具明确）。F20仍PARTIAL、历史ASTRA-SAVE-01未确认；真机真人等设备人员。R6-L/A和扩量未启动，本地提交后停止，不推送/合并/发布。

2026-10-09 Astra R6 从 3a4391c 接手，main 8355b85 经本地同步提交 8ae7e29 合入原任务分支，双方记录保留。用户授权 R6-L1～L5 已实现：结算原因、伤害来源、命中归属、当前潮位淹没格、测试摆位即时校验；R6-L6 射程只评估不改，R6-L7 随机天气未实施。[接口/兼容/真实验证/Opus与Sol交接](coast-sample-view/astra-r6-20261009/README.md)。F20 PARTIAL、历史 ASTRA-SAVE-01 未确认；前端接线与G05绘制交Opus，独立复验交Sol，未代改展示/素材/扩量。仅本地提交后停止，不推送、不合并PR、不发布。

2026-10-09 Opus 第七轮从 `0494b61` 接手，把 R6-L1～L4 接到样板前端：结算原因决定落幕文字；伤害来源决定受击音、闪白和持续伤害读数；命中标记按子弹归属；按淹没格画潮水、岸线、涉水和水下物品。只改 `src/coast-view` 和测试，Runtime、存档与玩法未动。样板 51/51（旧包缺 6 项），音频 3×14/14，68 张截图，CI 同款 20/20。见[第七轮报告](coast-sample-view/opus-r7-20261009/README.md)。仍为本地提交，未扩量、未推送、未合并或发布。

2026-10-09 Sol R7独立复验（PR22原分支，从138e899，仅本地）：[报告](coast-sample-view/sol-r7-20261009/README.md)、[Opus/Astra清单](coast-sample-view/sol-r7-20261009/defects.md)。全部浏览器顺序运行；242单测、首轮51/51、20套回归、68截图；结算8/8、持续伤害6/6、潮水10/10、隐藏两模式对照、生命周期两尺寸4/4、资源20/20。A6测试漏检修正后3×14/14及3+3隔离对照；历史安静起音仍未确认。F20本轮+382,976 B未归因、仍PARTIAL；ASTRA-SAVE-01未确认，真机真人等设备人员。只改测试/报告，未代改前端、扩量、推送、合并或发布，本地提交后停止。

2026-10-09 Opus 从 `5b09c05` 处理 R7-F20-FE-01/02：停放渲染器时重建 Pixi 的 GC 管理表，去掉空槽（实测六张表都在长，不只 Graphics）；初始化后摘下样板不用的 Pixi 事件系统，不再保留旧 HUD，指针和触屏样式由 coast.css 保留。命名快照第 6/20/40/60 轮空槽和旧 HUD 都为 0。同口径严格 60 轮第 56–60 轮 +939,563 B → +797,456 B，F20 仍 PARTIAL。样板 51/51、Sol 边界 7 项通过、生命周期 2×4/4、CI 同款 20/20。见[报告](coast-sample-view/opus-f20-20261009/README.md)。仅本地提交。

2026-10-09 Sol 从 `6e34e96` 独立复验 F20：先补六表原始结构门禁及59个负对照；FE-01 PASS，FE-02 Pixi链PASS但广义HUD释放PARTIAL（Phaser mousePointer事件在放弃结果页保留1棵、原生返回后0，交Astra SOL-F20-HUD-01）。原严格正式包60轮三个窗口+358879.2/+620021.6/+794532.8 B，总堆仍PARTIAL；命名四快照六表空槽/旧HUD/Pixi native均0，宿主12类owner保留/释放1→0。243单测、package、样板51项、桌面/移动输入、F14/F16、普通生命周期两尺寸4/4通过；六制品不变。ASTRA-SAVE-01未确认、真机真人未测。见[签收](coast-sample-view/sol-f20-20261009/README.md)、[分工清单](coast-sample-view/sol-f20-20261009/defects.md)。仅本地测试报告提交后停止，不扩功能/素材、不推送/合并/发布。

## 6. PR22 完成后的改枪计划

2026-10-09 维护者明确要求先检查 PR22 重做冲突、调整计划并提交文档 PR，改枪实施排在 PR22 之后。本次为独立文档交付，承接分支 `docs/gunsmith-after-pr22`，不新增并行代码实现线。

| 事项 | 来源 / 当前归属 | 当前处理 |
| --- | --- | --- |
| 20 枪与 100 配件改枪系统 | 维护者当前指令；[计划入口](gunsmith/README.md)、[PR22 衔接记录](gunsmith/PR22-INTEGRATION.md) | 枪械名称用原型号；#22 设计与 #33 实现已经合入 main，2026-10-12 已同步主线 6450504 并解决本 PR #28 文档冲突。品牌已确定放详情、功能名作主标题；[射击调研](gunsmith/SHOOTING-FOUNDATION.md)已完成，先做 M0-S 射击基础样板再实施改装，代码等待明确开工安排，不以 #32 全部清零为前置 |

上段 2026-10-09 为初始安排；当前主线已包含 #22/#33 及后续修复。#32 未确认、PARTIAL 与真机未测项继续保留；本次仅同步原文档 PR，不启动改枪实现，不合并或发布。

</details>
