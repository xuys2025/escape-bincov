> 合并整理说明：本文结论与历史失败保留，11 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Sol：F20 两项修复独立复验与签收边界

2026-10-09（UTC+8）。从 `6e34e96edbefd62d57603ffcde6b19eec4bce5a4` 接手，父提交 `5b09c05e93c5fdd6126dd97ebe7575cc4f3dcdef`，原分支 `docs/coast-2-5d-art-design`，接手时工作区干净。按 [Opus 第六节](../opus-f20-20261009/README.md#六给-sol-的复验清单)顺序独立运行，全部工程和浏览器命令使用 Node **24.19.0**、pnpm **11.19.0**，Chrome **154.0.8037.98** 无头；没有并发浏览器。

## 1. 分项签收

| 验收项 | 本轮结论 | 证据与边界 |
| --- | --- | --- |
| R7-F20-FE-01 管理表空槽 | **PASS** | 直接结构门禁与负对照有效；六张表重挂后及停放后空槽为零；命名 60 轮四个快照点均稳定。仅签收本工作负载，不推断无限循环或原生显存 |
| R7-F20-FE-02 Pixi 事件引用 | **Pixi 修复链 PASS；旧 HUD 全量释放 PARTIAL** | Pixi 未挂 DOM，根/池事件无原生引用；四个指定快照旧 HUD 为零。但首次放弃结果页发现另一条 Phaser 引用，见第 4 节，不能声称所有旧 HUD 均已释放 |
| F20 正式包总堆 | **PARTIAL，exit 1** | 严格 60 轮三个窗口仍正增长，不加容差、不换基线、不补 GC |
| 输入 / 生命周期 | **本机自动检查 PASS** | 样板 51/51、原桌面/移动输入、F14/F16、普通入口生命周期两尺寸各 4/4 |
| 真鼠标 / 真手机 / 真人 G12 | **NOT RUN** | 缺实际设备与人员；计算样式、可信自动输入及模拟移动视口不能替代签收 |

没有修改游戏前端方案、Runtime、素材、依赖或制品。新增和修改均为测试工具、报告与交接索引。遗留按 [Opus / Astra 清单](defects.md)归属。本轮本地提交后停止；不推送、合并、发布。

## 2. 基线与最终制品身份

开工及末次只读核对：main `43a342ce434c101e4b7058a54f6f29ede9482223`；PR [#22](https://github.com/xuys2025/escape-bincov/pull/22) OPEN / 未合并，远端头 `878f5633316a824960091f8f924c0ddd8dd78078`，head 仓库 `LMX-323/escape-bincov`。API 未返回 head 写权限，不能推断有权限，本轮也未尝试推送。

最新 main 新增的是剧情文档，尚未包含在指定任务基线内。本轮保留原分支，没有合入 main。Pages 2,416,678 B，SHA-256 `3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754`，与最新 main HTML 逐字节一致，**不是本次验收的样板构建**。[初始核对](evidence/baseline.json)、[末次核对](evidence/remote-final.json)。

`pnpm package` 后六项制品均与 `6e34e96` 逐字节一致：两份 HTML、中文跳转页、便携 ZIP、网页 ZIP、release manifest。两份正式 HTML 各 **3,213,763 B**，SHA-256 **`fe8ee26e6a993d5ed1bf28ab9bc9e88059f73080d6af3ac37aa719a617ea6f62`**。严格 60 轮加载的正是此文件。[制品和工具身份](evidence/final-identity.json)。

本报告所属本地提交为交付提交；其游戏源码、素材、原纯逻辑 tests 和制品仍对应上述基线。测试工具及证据身份见 [manifest](manifest.json)。原 `astra-r7-f20.mjs`、两个 Astra 图工具及行为/生命周期工具均未改逻辑；长循环脚本连字节都未变。原生命周期脚本末尾有一个既有 CRLF，与 Git LF blob 的差异单列保留，未改该脚本。

## 3. 先补门禁，再验证六张表

旧 W11/W12 只读 `counts()`：`_managedResourceHashes` 缺失时回退为空数组，可能把“没观察到”误判成零。本轮新增 `scripts/pixi-managed-gate.mjs`，由 W11/W12 和独立探针共用。直接要求有效的 gc、登记数组、运行标记、descriptor/context/hash/name、六个必需登记、表记录与 numeric uid 键、object/null 项；拒绝重复名称及共享表。零项表仍必须存在并报告，缺字段、错类型、漏表直接抛错，保留原断言。

**59 个损坏结构负对照全部拒绝，合法六表对照通过。** 包括 gc/数组字段缺失或改名、空/错类型数组、运行标记缺失/错类型、descriptor/context/hash/name 缺失、逐张漏登记或漏 items、null/Array/Map/数字表、非法资源值、重复/别名及非 numeric 键。损坏仅作用于独立 facade，不修改实际渲染器。[当前包探针](evidence/gate-fixed-final.json)。另在真实浏览器读取点注入缺失登记字段，**exit 1** 且错误为 `PIXI_MANAGED_CONTRACT`，[负对照](evidence/gate-missing-field-final.json)。

相同探针在 `5b09c05` 正式 HTML 的有效旧包对照中 exit 1，六表空槽增长及事件挂载均被检出。不是把“任何错误退出”都算对照通过；早期测试误判见第 7 节。[旧包有效对照](evidence/gate-old-build-final.json)。

| 表 | 旧包 20 次重挂 / 放弃停放的 null 数 | 当前包 20 次重挂 / 放弃停放的 null 数 | 当前命名快照 6 / 20 / 40 / 60 的 live（每点相同） |
| --- | ---: | ---: | ---: |
| graphics | 161 / 169 | 0 / 0 | 0 |
| graphicsContext | 161 / 169 | 0 / 0 | 0 |
| glBuffer | 280 / 294 | 0 / 0 | 5 |
| glTexture | 224 / 239 | 0 / 0 | 2 |
| glGeometry | 140 / 147 | 0 / 0 | 2 |
| tilingSprite | 40 / 42 | 0 / 0 | 0 |

独立探针挂载/重挂时每表 live 均为 8、8、19、17、9、2，旧/新包相同；停放为 0、0、5、2、2、0。样板 W11 的已执行功能路径有不同纹理使用，live 总数 **59→59**、null **3→0**；不把两种路径的绝对数混用。W12 停放六表均实际存在，live 总数 9、null 0。

原 `astra-r7-cache-graph.mjs` 的 Graphics 路径仍核对为四点零键；新增 `sol-f20-snapshot.mjs` 沿同一快照的 GC 登记描述符读取全部六表，缺登记/字段/形状直接失败，不用缺省零值。四点 keys/live 均稳定、null 均 0。glBuffer / glTexture / glGeometry 的 V8 elements backing self_size 均为 232 / 76 / 76 B；另外三张空表没有该 backing 边，**不将边缺失记作已测分配为 0 B**。[原工具](evidence/cache-original.json)、[六表快照](evidence/six-table-snapshot-first.json)。这是 V8 引用图观测，不是 GPU 内存测量。

## 4. FE-02 与宿主保留/释放对照：新增边界

真实鼠标移动、点击后，当前包 Pixi 事件系统 `domElement` 为 null，三个根事件的 native 引用均为空，池原生引用数为 0；旧包为挂载、rootPointer 有原生事件、池原生引用数 3。挂载画布的计算样式两包均为 cursor `auto`、touch-action `none`。停放后画布已断开 DOM，不以空的计算样式判断产品退化。

命名第 6/20/40/60 轮：旧 `cs-hud` native DOM 节点均为 **0**，FederatedPointerEvent 原生引用均为 **0**；工具同时要求实际观察到 EventSystem、两个指针根与一个滚轮根，避免改名/缺对象导致假阴性。

显式 `R7_PIN=1` 对照：保留宿主句柄时 **Host、View、Runtime、InventoryPanel、Textures、Atlas、Fx、Lighting、Weather、Tide、SampleSound、Scope 各 1**；`dispose()` 后加原对照规定的 GC，12 类均 **0**。[原图工具对照（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。这证明该工具能发现和区分显式测试句柄。

**首轮扩展 HUD 检查 exit 1，原样保留。** 句柄释放前后仍有 1 棵旧 HUD。保留时最短强路径经过 DevTools handle → Host → InventoryPanel；释放后另一条强路径为：

`Window.__bincov.app.game → Phaser InputManager2.mousePointer → Pointer2.event → MouseEvent → EventPath → 已移除结算 panel → cs-hud`

不经过 Pixi EventSystem / FederatedPointerEvent。[失败计数](evidence/pin-six-table.json)、[两阶段强路径](evidence/hud-pin-paths-final.json)。

为排除显式句柄污染，另外开全新页、**不创建任何所有者句柄**，按相同楼层往返和原生放弃操作：结果页依然 **1 棵旧 HUD、12 类所有者为 0、Pixi 原生引用为 0**；原生点击返回基地并 GC 后旧 HUD **0**。两步快照同一棵 HUD 的路径见 [无句柄控制](evidence/hud-no-pin-paths-final.json)、[计数](evidence/hud-no-pin-snapshot.json)。该检查 exit 1 被保留为未通过的旧 HUD 条件，不能因属于预期复现而改判 PASS。

因此 FE-02 的 **Pixi 修复链可签收**，但“所有结果页的旧 HUD 都为零”未全过，广义验收 **PARTIAL**，转 Astra `SOL-F20-HUD-01`。四个原定快照点恰好是撤离轮，不能外推至放弃轮；目前只证明单次放弃后保留 1 棵及返回后的释放，**没有证明无限累积，也没有把它归因为 F20 总堆的全部增长**。未代改产品输入或前端方案。

## 5. 严格 60 轮总堆与辅助口径

严格运行沿用未改的 `astra-r7-f20.mjs`：正式 HTML，1280×720 离线，seed42、冻结 AI、交替二楼/地下层再回沿海，交替放弃/原生按 E 撤离，结果页及样板 DOM 移除后一次 CDP GC，随后在原 counts evaluation 中 `window.gc`。连续单页 60 轮；不恢复健康、不重载、不清缓存、不创建 owner handle，**没有快照**。结束后的 idle GC 仅作单列诊断，不参与以下均值。

| 窗口 | 正式严格均值 B（6–10 基线 24,933,337.0 B） | 正式严格增长 B | 命名快照辅助增长 B |
| --- | ---: | ---: | ---: |
| 16–20 | 25,292,216.2 | **+358,879.2** | +292,321.6 |
| 36–40 | 25,553,358.6 | **+620,021.6** | +545,612.0 |
| 56–60 | 25,727,869.8 | **+794,532.8** | +720,472.8 |

严格、命名各 60/60 完成，11 项样板资源计数逐轮为 0、parked=1、GPU 计数不高于首轮，页面错误和外部请求均为 0。两组均 **PARTIAL / exit 1**。[严格首次完整结果（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[命名首次完整结果（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。命名构建和快照 GC 会扰动采样，不替代严格列，也不相减做因果归因。

历史 Opus 严格列 +348,086.4 / +604,728.8 / +797,456.0 B 仅为历史参考；本轮独立严格三窗口也为正，**总堆不签 PASS**。没有换成基地页、idle、命名包或不同暖机窗口降低门槛。

命名快照 6→60 的互斥 self_size 增量合计 **1,020,044 B**：编译代码 +792,096，其他 native +135,460，性能条目 +79,024，VM shape +8,256，其他 JS/元数据 +5,152，字符串 +24，命名渲染对象 +32。12 类样板所有者四点均为 0。[图分析（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。约 77.7% 来自编译代码，但仍没有平台期或全量增长上界证明；原生、性能等增长保留未归因。最短强路径/图 retained 具有 V8 图模型及弱边限制，重叠的 retained 示例不能相加；不是原生显存、驱动或音频后端的归因结论。

实际顺序为：门禁/负对照 → 工程 → 输入/F14/F16/生命周期 → 命名60 → 离线图分析 → 显式保留对照 → 该失败分析与无句柄控制 → **严格60** → 离线交付检查。所有受记录命令的起止时间无重叠，[真实退出码与参数（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

## 6. 行为、输入与生命周期

| 实际运行 | 结果 |
| --- | --- |
| `pnpm test` / `pnpm package` | 243/243；打包 exit 0，六项制品身份不变 |
| `coast-sample-test.mjs` | 首轮 **51/51**，errors 0、外部请求 0。U01–U06、U11/U12 拖放/旋转/拆分/物品名/拖影；W14 可信触屏摇杆连射；W11b 重挂复用及丢失上下文后换新 renderer 均通过 |
| `pnpm test:desktop-input` / `test:mobile` / `test:mobile-ux` | 各首次 exit 0，保留逐条日志 |
| F14 / F16（分别选前缀运行） | 各 1/1。F14 写入失败包/地面回滚、无成功事件；F16 背包/搜刮 × blur/pagehide/hidden 六组暂停、持键屏蔽并需松开重按 |
| 普通入口生命周期 1280×720 / 1920×1080 | 各 **4/4**：asset、view、observer 启动失败清理/重试；普通上下文恢复、持键保护、结算失败保留并重试、下一局可挂载，无需 test hooks |

[样板（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[桌面（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[移动（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[移动 UX（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[F14](evidence/boundary-F14-first.json)、[F16](evidence/boundary-F16-first.json)、[生命周期1280](evidence/lifecycle-1280-first.json)、[1920](evidence/lifecycle-1920-first.json)。生命周期故意注入的 decode/view/observer 异常及栈完整保留，属于预期故障路径；不谎报所有日志零异常。上述可信输入由浏览器自动化产生，visibility/pagehide 是注入信号。

## 7. 首次失败、工具修正及未运行项

- `gate-fixed-first`：测试错误地要求每个未使用根事件已有 `nativeEvent` 字段；Pixi 8.22.0 构造器并不初始化它，只有 `_bootstrapEvent` / `normalizeWheelEvent` 收到事件才赋值。改为核对事件对象结构、检查实际 native 引用。六表缺字段必须抛错的规则没有放宽。
- `gate-fixed-corrected`：测试对已移除画布的计算样式断言 `auto`，实为 `''`。改为只对仍连接 DOM 的画布检查样式，停放状态仍完整验证六表和事件引用。两个首次失败、早期旧包对照和各自源 SHA / 源文本均保留，只有最后旧包对照用于证明产品差异。
- `pin-six-table`：实际旧 HUD 条件失败，保留并追到 Phaser，**没有改断言绕过**。无句柄控制再次失败，返回后对照通过。
- 交付审计首次错误地要求既有生命周期脚本与 Git blob 字节相同；其唯一既有 CRLF 已确认，改为同时记录原字节 SHA、Git SHA 和 LF 规范化等价，不改该脚本。[审计记录](evidence/audit-first-tool-line-endings.json)。新增测试文本只做末行 CRLF→LF 的交付规范化，实际执行与交付 SHA 差异及原文件均保留，[映射](evidence/test-source-normalization.json)。

**NOT RUN：** 真鼠标可见指针、实体手机浏览器平移/缩放、真人 G12/操作和平衡性、原生 GPU/驱动/音频后端内存、远端 CI、10 分钟真人/真实计时、超出 60 轮的长期上界、种子3高潮诊断、全套20项浏览器回归、历史 A6 音频重测及旧可见性/QOL 间歇问题复跑。它们不计入本轮 PASS。`ASTRA-SAVE-01` 继续**未确认**，不以本轮写入失败夹具关闭历史异常。

原始八份快照和所有截图仍在本地忽略目录 `test-results/sol-f20-20261009`，没有提交 heap dump、可执行命名 HTML 或新素材。[快照身份](evidence/snapshot-identities.json)、[证据提升身份（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。本轮提交前显式 staged 密钥检查 exit 0（[日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md)），并保留正常 Git hook；未读取、展示或上传 SSH 私钥。
