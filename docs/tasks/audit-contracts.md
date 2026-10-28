# 2026-10-22 · 代码审计与调用契约补强

任务归属：[质量与减熵 #60](https://github.com/xuys2025/escape-bincov/issues/60)，承接 [PR #79](https://github.com/xuys2025/escape-bincov/pull/79)，分支 `agent/audit-contracts`。起点为已合入 #65 的 `a6954e5e07faf935e36c8ee02083a1d6c94fc229`；首轮验证前快进到 `8ef783f`（#73 合入，仅更改瞄准测试）。首轮提交 `c781b1f` 后，主线刚合入射击 #39，本分支正常合并 `2bac4fb`，保留射击帧末触发与审计逐子步计时。#68/#69/#71/#72 已合并，本次作为新的缺陷修复批次；不重复旧交付。准确 head 与 CI 以 PR 为准。

## 本轮确认与修复

| 优先级 / 问题 | 触发与后果 | 修复和回归入口 |
| --- | --- | --- |
| P2 · 非字符串 ID 被校验接受（新发现） | 备份里物品 ID 写成 `["bandage"]` 或武器写成 `["pistol"]`，`Object.hasOwn` 会转换为字符串。已结算备份随后迁移丢弃相应物品/武器；经典和分层行动的包内、地面、容器及当前地图也有漏检 | `profile-codec.hasOwnStringKey` 同时检查字符串与自身键；各格式复用。`save-validation-audit.test.ts` 覆盖公共解码、加载拒绝及原字节保留 |
| P2 · 原型键被当成分层武器（#60 已登记，重新实测） | 武器为 `constructor` / `toString` / `hasOwnProperty` / `__proto__` 且弹匣为 0 时通过，恢复后武器属性不是有效定义 | 同一 ID 守卫；上述测试含四个反例 |
| P2 · 负重上限读旧检查点（#60 已登记，重新实测） | 力量效果在两次保存之间到期：Runtime 限重 24 kg，背包打开后仍显示 27 kg；开着背包时数值也不自动刷新 | `CoastServices.carryLimit` 读取实时 Runtime；`InventoryPanel.refreshWeight` 仅更新文本，不重建拖动网格。`carried-weight.test.ts` 覆盖过期、护符和放置状态 |
| P2 · 院子自动拆分反而合堆（新发现） | 4 件绷带先拆为 2+2，再拆选中堆时得到 1+3，虽然还有空格；满格也会假装拆分成功 | `UI.split` 先用 `D.fits` 筛真正空格，再检查可接受操作；保留手动合堆。`station-split.test.ts` 覆盖空格、满格、写失败和重新操作 |
| P2 · 长帧让追兵提前抵达并攻击（新发现） | `advance` 在所有子步之前写入整帧结束时间，追击抵达判定提前发生；合法追击夹具在 1.92 秒帧中受两次近战，同样总时间小步推进没有受击 | 按模拟子步推进时间；正式反例与边界验证见 `raid-clock.test.ts`，超时优先与停顿保护保留 |
| P2 · 持续射击的新弹丸提前飞行（同步 #39 后新发现） | 手枪持续射击的第二发恰在 0.29 秒到期，发布时却已经飞行 27.55 px；晚出生子弹可提前撞墙或命中敌人，受帧切分影响 | 本子步临时记录新生弹的剩余飞行秒数，经典与分层弹道共用，旧弹仍推进整步；不增加存档字段或改变遍历顺序。`bullet-time.test.ts` 覆盖两路径各 5 项：出生、不同切分、撞墙、死亡与恢复 |

基线上的 479 项单测与 52 项工程守卫全部通过，仍漏过上述边界。新增非法数据测试在基线为 **1 通过 / 15 失败**（正常记录对照通过，非法记录未拒绝）；负重到期反例在旧显示路径明确得到 27.0 而非 24.0。不能把既有测试全绿当成没有遗漏。

## 让后续修改更容易核对

- 将 `CoastHandle` / `CoastServices` 移到 Runtime 契约；工厂用 `satisfies` 检查接线，删除普通行动及试枪场组装处的 `as unknown as CoastHandle`。合并 #39 时补入 `sampleGun` 服务，新增服务缺接会在类型检查暴露。
- 在校验、放置和会话接口旁解释容易误读的行为：字符串 ID 与原型键、可接受落点与空位、实时捕获与最近检查点、WeakMap 票据的所有权。
- 在弹道调用旁标明子步内新生弹的有效飞行时长只是本步临时数据，避免把它加入持久化格式；同样保留帧末新输入与既有持续射击的边界。
- CODEMAP 增加派生读数路径、自动拆分和严格校验的回归入口。ARCHITECTURE 纠正“两执行器”旧说法，区分同一 Runtime 的两种存档路径；README 只链接权威入口，不再复制模块目录和测试清单。
- 历史样板报告继续保存，但明确“没有负重/格子背包”等旧缺项不能当现状。WORK-QUEUE 当前入口按实时状态修正，历史段落不重写。

## 审计覆盖与未修范围

本轮实际阅读并追踪了存档解码/写入/备份、交易与失败候选、旧页签与院子调用、库存守恒、行动子步与追击、宿主输入和生命周期。另做固定种子 20,000 步库存探针（实际 19,458 次操作），未发现数量、救济来源、UID 或格位守恒失败；它不证明所有操作组合都正确。

存档专项六组 94 项验证通过，未确认新的重复发奖或回滚漏项。旧评论所称“未释放票据必定泄漏”不能成立：`SaveSession.prepared` 是 WeakMap，无外部引用的票据与候选可被回收，只有主动保留的 deferred 票据需要继续存在。源码旁已说明，未为这个未经证实的泄漏新增清理协议。

仍有值得后续单独处理的结构风险，归属继续在 #60：

| 剩余项 | 接手入口与验收边界 |
| --- | --- |
| 背包有限服务未完成（Q-E02 B） | `coast-view/inventory.ts` 仍直接持有 Session/SaveSession 整理背包；本轮只收敛类型和读数。迁移必须覆盖库存/世界同事务、失败引用替换及旧行动兼容 |
| 实时状态与最近检查点混用（本分支已修） | 精神/水分/饱食改走 `HudView.needs`，见[实时投影](#精神水分饱食-hud-的实时投影)；本表保留首轮审计范围，其余状态收敛仍归 #60 |
| 事务错误分类（Q-E04） | `persist` 的 catch 同时接收校验和存储异常；后续分开诊断时不能改变候选保留或把写入后的恢复异常当成可安全重做 |
| 失焦后首按被抑制（已知 D8） | `InputState.suppressHeld` 和宿主 blur/pause；要区分失焦丢失释放事件与面板切换保护，保住 E 关闭搜刮不重开的断言 |
| 内容身份依赖文案（Q-E06） | `fix/content-identity` 只把居民楼 8 个既有完整 region ID 放回定义，投影不再按中文名称补身份；楼梯中文前缀仍待处理。世界/布局不改号，不表示 Q-E06 全部完成 |
| 单测通过不等于真机/完整资源签收 | 帧率、真实输入、WebGL 上下文恢复、F20 总堆与真人手感仍按原任务验收，不把本轮结果替代这些结论 |
| 自然游玩探针的击杀采样（独立修复） | 原[真实报告](audit-contracts/natural-play-report.json)同一 run 的 kills 在 332 秒为 25、363 秒为 0；只有至多 1000 条事件的采样失真，Runtime 和最终结算未丢击杀。[PR #109](https://github.com/xuys2025/escape-bincov/pull/109) 将实时采样改读显式 `?test=1` driver 的 `killCount()`，终态继续读已提交结算。采样与 Runtime 反例覆盖日志淘汰、视图重挂、经典/分层检查点恢复、零写入与结算对账；[打包页控制探针](audit-contracts/natural-kills-browser-probe.json)实测 1→1→1→1。[默认十分钟原脚本](audit-contracts/natural-kills-buildings-report.json)实际 622.217 秒，同 run 样本无下降，但失败于 0 次容器拖放，**不能记整套 PASS**；原始失败与真人/真机、#32 边界保持 |

### 自然准备与首搜候选（未并入 #109）

`research/natural-play-preparation` 从 #109 的 `6629ab1` 续同一工具可靠性目标，不另开 PR，不改 #109 受检 head。候选仅改测试控制器/只读报告：70HP、无流血、医疗至少1份、现有枪匹配总弹至少12发为 bot 政策；通过 `currentRecord()` 核对发布状态，每次真实 UI 动作后确认 revision 与实际身体/库存/现金变化，失败或不足明确 blocked。两药报价只在官方 RPG 克隆中搜索最多6次治疗加1份储备；首搜按动态路径与原220px/LOS危险门槛选择，原生拖放须同 run/map/context 且源减、背包等量增。原60HP关闭条件、native/windup断言和默认600秒未放宽，游戏源码及HTML不变。

| 证据 | 实际结果 |
| --- | --- |
| Node / guards / package | 876/876、75/75、打包通过；HTML仍 `31ca729a4a900a327160f7a2e46add41267e2aada3d215b7b32ca4e66dc7c251` |
| [真实 UI / quota](audit-contracts/natural-preparation/ui-control.json) | 33.638秒：真实死亡HP1后，quota不改原字节/revision/药/HP、不出击；实际UI恢复后HP72.065、医疗1、匹配弹24、cash290 |
| [医疗 oracle](audit-contracts/natural-preparation/medical-oracle.json) | 756状态0差异、原record不变；[中间版6个错价](audit-contracts/natural-preparation/medical-oracle-before.json)保留，正式反例含HP40/150→预算135及HP1/绷带2/160→预算160 |
| [短首搜 / windup](audit-contracts/natural-preparation/coverage-probe.json) | 65.405秒：19.4704模拟秒原生拖 cloth×2，随后真实 raider-melee/windup，错误/请求0；`coverage-probe-passed` **不是十分钟验收** |

短 UI 正向路径在最终报价收束前完成，最后只改医疗报价；该UI状态报价仍为90，最终函数由正式领域反例与756 oracle验证，未重复UI。方法保留为 [UI source](audit-contracts/natural-preparation/ui-probe.source.txt)、[coverage source](audit-contracts/natural-preparation/coverage-probe.source.txt)、[oracle source](audit-contracts/natural-preparation/medical-oracle.source.txt)；前两份复放时复制为 `.drafts/natural-play-preparation/*.mjs`，使用 `node --import tsx` 和独占浏览器锁，异地检出调整本轮 `/workspace/natural-play-preparation` 入口/输出/import前缀。coverage只给同源副本增加停止条件/诊断标签，正式 `test:play` 没有缩时入口。

按维护者本轮额度收尾指令，候选最终完整默认十分钟 **未运行**。下一次从原#109接手评论的固定候选commit/compare续作，先跑原十分钟并读run/base计时、blocked原因、原生拖放、windup和结算；不覆盖原622秒失败，不替真人/真机或#32 F20签收。

## 首轮验证（同步射击主线之前）

Windows，Node 24.21.0、pnpm 11.19.0、本地 Chrome 155.0.8059.85。下列结果对应 HTML SHA-256 `5ce124f9ab9585f29e30e29df5892f0492115ce04dbf9fdba51fb82aa9c64b5c`；完整日志位于工作区忽略目录 `test-results/audit-*.log`，CI 和准确 head 的长期入口为关联 PR。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm test` | 503 / 503；本轮新增 24 项测试并增强原负重读数测试 |
| `node --test scripts/ci/*.test.mjs` | 52 / 52 工程守卫 |
| `pnpm package` | 严格类型检查、构建、两份 HTML、两份 ZIP 与清单生成通过 |
| 浏览器回归 | 12 / 12：`save-browser`、`issue26-station`、`issue26-inventory`、`buildings`、`desktop-input`、`mobile`、`mobile-ux`、`browser`、`ui`、`portable`、`raid-default`、`loot` |
| 实际打开的背包读数 | 1280×720 与 1920×1080 均通过：用显式夹具写入 0.8 秒力量效果并冻结 AI，真实菜单/Tab 打开背包，读数从 27.0 变成 24.0 时持久化效果仍为 0.8，网格 DOM 未替换；没有页面异常或网络请求 |
| `pnpm test:play` | 10 分钟真实键鼠测试通过，等待最后一局结束共约 10 分 20 秒；两局均撤离，结算累计 32 击杀，32 次原生容器拖动转移，0 页面错误、0 外部请求。未改时钟、生命、敌人或 RNG；不等于真人手感验收 |
| 独立边界复核 | 经典/分层行动跨过 600 秒时优先超时；写失败保留旧字节与可解码待结算备份，恢复后只结算一次 |

上述真实背包截图已经检查，文字与网格没有裁切或重叠：[1280×720](audit-contracts/1280x720-inventory.png)、[1920×1080](audit-contracts/1920x1080-inventory.png)。[读数探针报告](audit-contracts/live-weight-report.json)记录制品哈希、夹具与读数；可复用的回归断言在 `tests/carried-weight.test.ts`。

[浏览器套件退出码](audit-contracts/browser-results.json)和[自然游玩完整记录](audit-contracts/natural-play-report.json)保留本地执行证据。CI 的完整八组和最终必需检查另以 PR 的实际运行结果为准。

合法存档格式、存档键、世界/布局编号与单文件离线能力保持不变；故意收紧非法 ID 的接受范围，不自动修复或覆盖损坏数据。存档浏览器检查包括失败重试、备份导入导出与多窗口冲突。`test:loot` 的实际旧 HTML 兼容分支在本地未配置，完整 CI 另以固定旧客户端执行 `test:expansion`；不能把本地成功写成该兼容分支已执行。

没有真实手机、真人平衡或原生 GPU 长循环结论。本任务不合并或部署，等待维护者审阅。

## 精神/水分/饱食 HUD 的实时投影

2026-10-28 续作 [PR #110](https://github.com/xuys2025/escape-bincov/pull/110)，沿原分支 `fix/live-vitals-hud` 正常合入 main `03ea26198259fa66ee7a39c32c06466a1545e76f`；受检源码 head `19dea0bfa59042281b4c7ec1f085aa3e8587e3b8`。保留 M2、商场四版、背包服务与双方交接，随后仅补本轮证据和文字，准确最终 head / CI 见原 PR。#60 总单保持开放。

**最新共同基线同步（同日）。** 随后正常合入 main `630e68f517edea34bfbcc548473897bd36bdfa08`（#134 架构查询与门禁），只解决 WORK-QUEUE / handoff 的追加记录冲突，双方入口和新 source-graph / architecture 均保留。相对已验 `d0ebc57`，src、tests、assets、浏览器脚本、构建/打包输入和依赖完全未变，package.json 仅增加只读 architecture 命令；实际重跑当前 `check:ci` **85/85** 与 `package` 均通过，HTML 仍精确为下述 `f61862ed…`。因此复用下方 1025 单测、QoL 5/5、raid-default 11/11 和原双尺寸截图，本地未重复游戏回归或负对照。[同份报告](audit-contracts/live-needs/report.json) 的 `main630Integration` 保存输入一致性和重跑结果；`d0ebc57` 的成功 [CI 40624184384](https://github.com/xuys2025/escape-bincov/actions/runs/40624184384) 仅为历史，新准确 head 全量 CI 另见原 PR。

**修复边界。** 实时身体是 `CoastRaidRuntime.layered.body`，`SessionState.expansion.body` 是最近成功检查点。`frameView` 将三个数复制到只读 `HudView.needs`；宿主只按原来每八帧的刷新节奏舍入与排版。没有复制生理公式，也没有把实时对象直接放进帧；禁用测试帧冻结时同样不共享引用。经典旧行动即使会话含扩展身体，也保持 `needs: null`，状态行不显示这三项。不改存档格式、检查点、规则或事务。

**本轮实际验证。** Windows，Node 24.22.1、pnpm 11.19.0、Chrome 156.0.8078.49。完整 `pnpm test` **1025/1025**、`pnpm check:ci` **77/77**、正式 `pnpm package`、完整 `test:qol-expansion` **5/5**、`test:raid-default` **11/11** 均首次通过。后者包含经典行动无身体读数、商场一版恢复、商场四版出击、选图和触屏。日志在 `test-results/pr110-20261028/`；[同一份对照记录](audit-contracts/live-needs/report.json) 的 `integration20261028` 留存新基线、制品、环境、两尺寸读数与完整套件结果。

新基线负对照将三个产品文件还原为准确 main `03ea261` 后构建（HTML SHA-256 `f3b7c3e1f19bcc8bc22a517856c0fdf4301ff2ad16d8a0d9269304d1a626a9cb`，本次主线只增加文档、产品未变）：两尺寸均有效失败，普通暂停 elapsed 为 0、保存值未变，实时值分别 71.2/62.2/53.2 和 48.2/37.2/26.2，旧 HUD 两次仍显示 100/100/100。main 投影单独代入时新增单测 0/3；恢复修复后 3/3，覆盖自然衰减跨整数、暂停、旧帧不变、双向引用隔离与经典空投影。源文件恢复原字节后才打包修复版；没有更改时钟、自动保存或生理规则。

修复版两尺寸保存值仍未变，实时/帧/DOM 一致、文本 fits 为 true，页面异常与外网请求均为 0。正式 HTML SHA-256：`f61862ed972f8efaab0c8abf7c9360ab2aebbd751d943dfa77ad8211c5568b72`。已逐张查看真实截图：[1280×720](audit-contracts/live-needs/1280x720.png)、[1920×1080](audit-contracts/live-needs/1920x1080.png)。没有真机、真人手感或性能验收；不合并或发布。

**历史首败保留。** 10-25 原 head `1ba5a79` 基于 `974a3a8`，当时 877 单测、64 守卫和 HUD 步通过，但完整 QoL 在容器关闭按钮 detach 后超时；通用 browser 中断，UI / 完整 raid-default 未运行。随后该 head [CI 40161314063](https://github.com/xuys2025/escape-bincov/actions/runs/40161314063) 全部成功。本轮没有更改容器断言，完整 QoL 实际通过；原始前后读数与超时仍保留在上述报告，旧截图可从[原 head 目录](https://github.com/xuys2025/escape-bincov/tree/1ba5a7940fffcb434c6b6ff51e071b5d757b69d4/docs/tasks/audit-contracts/live-needs)读取，当前同名截图已替换为本轮实际构建。初次运行中八帧探针因跨 autosave 而无效，未计为产品反例；有效浏览器对照采用普通暂停，正常衰减和无写入另由单测验证。

## 同步 #39 后的复核

交付时另同步纯文档主线 `b475b1b`（#40），保留设计排期与双方交接；此次不改变源码或制品，下面的验证仍对应同一游戏字节。

合并后的第一次完整单测 539 / 539、工程守卫 53 / 53 通过；首次打包指出试枪场仍从旧宿主路径导入 `CoastHandle`，已改为使用工厂的结构类型并移除断言。完成子弹修复后再跑完整单测 **549 / 549**、工程守卫 **53 / 53**，正式 `pnpm package` 通过；HTML SHA-256 为 `0c2a9059703b33f677dc206646c7c5889aaad63d7912e8dc6449ab6f8b0a6e23`。

新增弹丸时长的 10 个反例修复前全部失败、修复后全部通过；复核确认 `pull` 继续在子步循环之后，`runTrigger` 消耗既有扳机状态，超时优先和失败后停止输入不变。

最终制品的两分辨率实时负重检查重新通过，网格节点保持原对象，0 页面异常、0 外部请求；已逐张检查：[1280×720](audit-contracts/final-1280x720-inventory.png)、[1920×1080](audit-contracts/final-1920x1080-inventory.png)、[记录](audit-contracts/final-live-weight-report.json)。

最终制品另外运行 14 套浏览器回归（首轮 12 套加 `shooting`、`range`）和完整 10 分钟 `test:play`。它们的最终结论、准确 head 和 CI 运行链接统一维护在 [PR #79 验证表](https://github.com/xuys2025/escape-bincov/pull/79)，本地日志为 `test-results/audit-integrated-*.log`；上节首轮记录不能替代这些结果。


## D8 失焦后第一次按键恢复

2026-10-28（+08:00）续作 [PR #107](https://github.com/xuys2025/escape-bincov/pull/107)，保留原分支 `fix/first-key-after-blur` 和原 head `a169e7a5d5c984a74fb94291c4bbfa10d444fcfa` 的历史；正常合入已接受 main `efe2bede6af0ed33fec065a26755e1f8ff7d0256`（含改枪 M2、#114、#131）。独立承接 [#60](https://github.com/xuys2025/escape-bincov/issues/60) 的 D8，其他余项仍由总单跟踪。

**问题与修复。** 按住按键切出窗口、在别处松开，浏览器可能不向游戏发送 `keyup`；旧的 `suppressedKeys` 因而吞掉回焦后的第一次新按。`InputState.key` 接收 `repeat`，新的独立按下只解除当前键的抑制，旧 held 与连发继续受抑制。宿主仍在面板操作前拦连发，E 关闭搜刮仍直接返回；WASD 离开搜刮时根据 `shiftKey` 补的 Shift 明确作为 held 状态观察，避免恢复进入窗口前已被抑制的冲刺。

**有效反例。** 本轮以 main `b5bd63b7896b3b0697d4ba38d02d000e78903047` 的原输入/宿主代码运行同一新增单测：12 通过 / 1 预期失败，首按 W 为 `0` 而非 `-1`；同一基线离线 HTML 的两档桌面检查均在首次新按 D 等待移动时达到原 20 秒超时，页面仍正常运行，异常/外部请求均为 0。浏览器只用合成 blur 和捕获阶段丢弃一次 D 松键事件模拟丢失 `keyup`，随后用可信键鼠事件恢复；没有改变游戏时钟、生命或移动规则。

**9389ff9 构建验证。** Windows、Node 24.22.1、pnpm 11.19.0、Chrome 156.0.8078.48：输入单测 13/13，全量单测 1022/1022，CI 工程守卫 77/77，`pnpm package` 严格类型检查和打包通过；`test:desktop-input` 12/12，两档首按 D 均移动超过 15 px，松开后位置稳定，页面异常/外部请求为 0。新按恢复单测包含 M2 的 F/G 命令；搜刮 F13 增加旧 Shift 不复活的断言，保留窗口内新按 Shift 可冲刺的原检查。完整搜刮、触屏和准确 head CI 的最终结果统一维护在原 PR 验证表。

已检查真实截图：[1280×720](audit-contracts/d8-first-key-1280x720.png)、[1920×1080](audit-contracts/d8-first-key-1920x1080.png)，HUD 与操作提示无裁切；截图为松键后的静止帧，行为结论来自[制品哈希、负对照与坐标断言](audit-contracts/d8-first-key-validation.json)。本地完整日志在忽略目录 `test-results/pr107/`。HTML SHA-256：`e8018ec5b33679d81a5616286261ecf3dd117c59e32aed8f7726b3a06eacf3a1`。

仅修改输入适配、回归与说明；存档版本、规则、鼠标按钮和触屏逻辑不变。浏览器失焦/松键丢失为事件夹具，触屏为仿真，不替代真实系统切窗、真机或真人手感验收。合并与发布分别以原 PR 和主线 CI 的实际状态为准。

**授权合并前同步 #130。** 维护者要求自行复查、无问题后合并。再次 fetch 后发现主线已到 `3b61d52e898459f3e197584ae202285e7ade65e2`，正常合入且无冲突；输入、宿主及回归源码哈希与上述证据一致。新组合实际通过全量单测 1022/1022、工程守卫 77/77、严格打包与键鼠 12/12，HTML SHA-256 为 `f3b7c3e1f19bcc8bc22a517856c0fdf4301ff2ad16d8a0d9269304d1a626a9cb`；相应两档坐标断言补入原验证 JSON 的 `mergeCandidate`。完整搜刮复核、准确 head CI 和自动合并结果见原 PR。维护者允许的平台自动合并方式已记入 `AGENTS.md`，仍保留必需检查与分支保护。
