> 合并整理说明：本文结论与历史失败保留，2 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 第四轮后续：Astra 生命周期修复与签收交接

2026-10-08。按用户指定从 `bcf7304595e6a01b406189e899dff35b9e929f8d`、原分支 `docs/coast-2-5d-art-design` 接手。目录 `D:\bincov\pr22-runtime`，接手时干净。已读[第四轮交接](../round4/README.md)及 Sol 的[问题清单](../sol-round3-20261008/defects.md)。

远端核对：`origin/main = 841e8bbdfb070eada82537563dd1ab1b4801aea3`，已包含在本分支；[PR #22](https://github.com/xuys2025/escape-bincov/pull/22) 仍 OPEN，head 为 `LMX-323/escape-bincov:docs/coast-2-5d-art-design` 的 `878f5633316a824960091f8f924c0ddd8dd78078`。本轮依用户要求只做本地提交，不更新远端 PR，不推送、合并、发布。

## 已确认并修复

| 项目 | bcf7304 实测 | 本轮结果 |
| --- | --- | --- |
| 普通入口上下文丢失 | 真正 `WEBGL_lose_context.loseContext()` 后，Esc 可恢复 Runtime；2.3 秒后存档行动时间前进 | 丢失期间继续按钮禁用，Esc/DOM click 同样被宿主挡住；跳过失效画布渲染，Runtime 保持暂停；原扩展 `restoreContext()` 后同一画布恢复，仍需主动继续 |
| 素材解码失败 | 再次点击进入报 `This session already has a Runtime` | 先加载素材再取得 Runtime 所有权；失败的素材 Promise 不缓存；同页重试恢复原行动 |
| 视图构造/挂载后段失败 | 留下一层 `.coast-sample` 画布遮挡菜单，无法再次进入 | 构造中断释放已有视图资源，部分挂载也能幂等 unmount；DOM、监听、ticker、observer 按已取得资源清理；同页重试成功 |
| 结算后测试引用 | 第四轮堆报告的 Runtime、Host、View、Atlas 等在第 10、30 轮均为 **1**，只能证明不累积 | 删除测试钩子的强持有；结算成功时清空 driver，`initial` 改为当前 host 的动态别名。两种入口快照第 6、20 轮这些对象均为 **0** |

复现原始包和修复包的同一测试分别见 [baseline.json](baseline.json)、[1280 结果](lifecycle-1280.json)、[1920 结果](lifecycle-1920.json)。原画布恢复截图：[1280×720（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[1920×1080（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。测试通过浏览器 API 注入故障，URL 始终为 `?sample=village`，确认没有 `__bincov` / `__bincovSample` 产品测试接口。

**释放边界：** `services.cancelStart()` 仅供宿主启动失败回滚，在第一次 `advance` 前且没有结束/待结算事务时才可调用。它只解除 SaveSession adapter 和所有权，不写档、不结算。第一次 advance 后调用会抛错；原 `runtime.dispose()` 的“结算成功才能释放”限制保留。v1 Runtime 端口方法未变，services 新增一个启动清理方法。普通入口已覆盖：结算写入失败保留现场与旧存档 → 恢复存储后重试 → 显示结果 → 下一局能取得所有权。

资源池仍按第四轮方案保留整页一个 Pixi Application；场景结束释放 View/RT/纹理，停止其 ticker、移除 canvas、清空 stage。没有改为每局重建渲染器。初始化失败清理仅清理 Application 已取得的资源；本轮三种注入故障不等于覆盖所有 GPU 驱动初始化失败。

## ASTRA-SAVE-01：仍未确认历史根因

历史截图没有原始候选、写入返回和异常堆栈，且产生截图时没有调用后来修正的武器/击杀测试驱动。因此不能把驱动修复当成历史异常修复。本轮没有放宽解码校验、吞掉存档异常或自动覆盖档案。

[定向诊断](save-diagnostic.json)实测区分三条通路：

| 注入条件 | setItem 尝试次数 | 失败来源 | 保存结果 |
| --- | --- | --- | --- |
| 配额写入失败 | 1 | `Storage.setItem → RecoveryStore.commit` | 原字节保留、暂停 |
| 超过合法弹匣容量的候选 | 0 | `validateExpansion → decodeSession → commit` | 校验先拒绝、原字节保留、暂停 |
| 存储版本被其他写入改变 | 0 | `RecoveryStore.commit` 的 expected 比较 | 不覆盖外部新字节、暂停 |

这是合成诊断，用于识别失败发生在哪一层，不是历史根因证据。报告含错误文本/堆栈、写入次数，不含完整存档正文。

另在**普通入口**、seed 42、沿海外部通用画面，通过真实移动与三次超过 2 秒的检查点/暂停保存，全部可解码，零保存异常、零远端请求；坐标与 elapsed 已记入报告。Sol 已修正的 carbine、shotgun、击杀三组驱动检查点亦 3/3 通过，见[驱动诊断](driver-save-diagnostic.json)。这些通过不排除尚未复现的合法路径。

下次若再现，请 Sol 保留：精确提交/HTML SHA-256、普通还是 test 入口、seed/地图/操作顺序、异常全文与栈、该次是否进入 setItem 及返回/错误类型、最后成功 revision、检查点/物品事务/结算中的哪一阶段。需要存档时仅在本地保留原字节与候选副本，未经检查不要上传；不要为继续截图而重置或覆盖异常存档。前端泛化错误说明的改文案/布局需求交 Opus，底层校验保持。

## F20 审查：资源释放可签，总堆仍 partial

第四轮消除 Pixi 着色器名称增长的结果得到复验，字符串 81→81。其“Compiled code / Other”是 **self_size 启发式分组**，不是 dominator retained size；WeakArrayList、Map 等不能全归为 JIT；对象数量持平也不代表已经释放最后一局对象。

本轮用修正后脚本实际运行两组 20 轮，第 6、20 轮取堆快照；每次返回基地、CDP 三次 GC，等待只返回 boolean。此辅助脚本在基地采样、连续三次 GC；Sol 原严格脚本在结果页采样、一次 CDP GC 加 window.gc，两组口径不可混合或直接与第四轮绝对数相减。原始 `.heapsnapshot` 留在忽略的 `test-results/astra-lifecycle/heap-{full,ordinary}`，不提交庞大快照或存档正文。

| 指标 | 完整楼层/撤离/放弃循环 | 普通入口出击/放弃对照 |
| --- | ---: | ---: |
| 第 6–10 轮 usedJSHeapSize 均值 | 32,360,895.6 B | 32,159,341.6 B |
| 最后 5 轮均值 | 32,673,130.0 B | 32,477,654.4 B |
| 增量 | **+312,234.4 B** | **+318,312.8 B** |
| 快照 self size 增量/轮 | +33,429 B | +45,908 B |
| code/VM 启发式分组/轮 | +30,629 B | +37,246 B |
| 其余 self size/轮 | +2,801 B | +8,662 B |
| 第 6、20 轮 Runtime/Host/View 等 | 均 0 | 均 0 |
| 着色器字符串 | 81→81 | 81→81 |

详见[完整循环](heap-full.json)、[普通对照](heap-ordinary.json)。普通对照没有楼层与撤离，不能替代完整 F20。两者均为本机单次运行，不能作为跨机器噪声上界。另实际运行了未修改阈值的 [Sol 原严格脚本](sol-boundaries.json)：7 项 passed、F20 partial，exit 1；结果页口径第 6–10 轮均值 24,216,148.6 B，最后 5 轮 24,596,284.6 B，增长 **380,136 B**。资源计数每轮归零，页面异常与远端请求均为零。exit 1 来自保留的严格总堆条件，不是测试崩溃。

[强引用路径报告](retainers.json)对新增 LargestContentfulPaint、LayoutShift、PerformanceLongAnimationFrameTiming 节点取样，路径经 `DevTools console → UtilityScript.builtins → Performance → 浏览器记录集合`。这支持部分增长属于浏览器性能记录及测试环境的判断；路径是排除 weak edge 后的最短强路径，不是独占 dominator，也不能证明缓冲有界或全部差额已解释。普通对照还出现 DOM/动画节点增量，未完成归因。GPU/驱动内存不在 JS 堆结论内。

### 给 Sol 的可复验签收标准

分开填写 **生命周期 PASS/FAIL** 与 **F20 内存 PASS/PARTIAL/FAIL**，不要把脚本 exit 0 当成 F20 全签。

1. 固定本地提交、制品哈希、Node/Chrome、机器、分辨率与入口。先验证打包普通入口在上述两尺寸的四项故障检查全通过；确认恢复的是同一 canvas，丢失期间不能输入/计时，恢复后仍暂停。结算写入失败不得卸载，成功重试之后必须能开始新一局。
2. 完整 F20 按 seed 42、二楼/地下交替、回沿海、撤离/放弃交替执行 20 轮。原严格脚本保持在结果页移除样板 DOM 后采样；另用本轮辅助脚本在基地记录三次 GC 后的值与第 6、20 轮快照，两套值分别保存。`apps/views/listeners/tickers/observers/timers/renderTextures/liveViews/sampleRoots/atlasPages/largeTextures = 0`，`parked = 1`、GPU 管理纹理不高于首轮（本机 2）。在快照检查旧 Runtime/Host/View/InventoryPanel/Textures/Atlas/Fx/Lighting/Scope **为零**；不能接受“1→1”。保留的 Application 应只属于页面池，stage 清空、ticker 停止、canvas 脱离 DOM；若发现旧对象，追强引用到根，记录对象 ID 和路径。
3. 新浏览器上下文独立重复完整 20 轮一次，并运行无 test 接口的普通对照。三个报告都保存 warmup=第 1–5 轮、6–10 与 16–20 均值和逐轮值；快照与 GC 方法不能中途更改。测试不得持有旧 host/frame 的 JSHandle，不得用 fixture 冻结掩盖生命周期问题。
4. 原严格总堆条件保持：Sol 原脚本结果页口径的完整循环最后 5 轮均值 **不高于第 6–10 轮均值**，并通过资源/实例检查，才满足当前数值项。任一次正增长就记 **partial 待归因**；已定位的应用所有者/资源跨局残留则记 **fail**。不得设置一个未经测量的“允许若干 KB/轮”把结果变绿。
5. 如需重新解释正增长，交付额外固定时长空闲对照、继续至 40/60 轮的分窗趋势与相应强引用/dominator 证据，区分应用持有、浏览器记录、JIT、session 字符串和驱动资源。只有明确的有界性/归属证据且验收方批准新标准，才可替代严格总堆条件；本轮没有批准或声称完成这一步。普通对照的 DOM/动画节点亦须解释。

## 本轮实际验证

[验证清单](verification.json)：完整单测 **224/224**（含 Runtime 27 项）；样板浏览器 **32/32**；普通入口生命周期 **两尺寸各 4/4**；ASTRA 定向分类及普通样板外保存通过；旧驱动诊断 **3/3**。原入口 browser、UI、desktop-input、mobile、mobile-ux、save-browser、portable 全部退出码 0。

最终 `pnpm package` 通过，重新生成 HTML 与已验证版本逐字节一致，SHA-256：`88ca4cf44377533c385284994f41a837aa0004fd3e8d3614d11276a689a1684d`。两份 HTML、两个 ZIP 与 release-manifest 均由打包脚本更新。原始日志保留在忽略目录 `test-results/astra-lifecycle`。本轮未重跑无改动战斗的十分钟计时；本机自动触控/可视检查不等于真机或真人测试。

## 复验命令

在仓库根目录使用 Node 24.19.0 / pnpm 11.19.0。浏览器实测 Chrome 154.0.8037.98。普通故障测试没有更改发布入口。

```powershell
pnpm test
pnpm package
node --import tsx scripts/coast-lifecycle-test.mjs
$env:BINCOV_LIFECYCLE_WIDE='1'
$env:BINCOV_LIFECYCLE_OUT='test-results/coast-lifecycle-wide'
node --import tsx scripts/coast-lifecycle-test.mjs
Remove-Item Env:BINCOV_LIFECYCLE_WIDE
node --import tsx scripts/astra-save-diagnostic.mjs
node --import tsx scripts/sol-save-diagnostic-probe.mjs
node scripts/coast-sample-test.mjs
$env:BINCOV_SOL_OUT='test-results/sol-boundaries'
node --import tsx scripts/sol-sample-boundaries.mjs # F20 partial 时 exit 1，须读 JSON 区分断言失败
$env:BINCOV_HEAP_KEEP='1'
$env:BINCOV_HEAP_OUT='test-results/heap-full'
Remove-Item Env:BINCOV_HEAP_ENTRY -ErrorAction SilentlyContinue
node scripts/coast-sample-heap.mjs
node scripts/coast-heap-retainers.mjs test-results/heap-full/cycle-6.heapsnapshot test-results/heap-full/cycle-20.heapsnapshot test-results/heap-full/retainers.json
$env:BINCOV_HEAP_ENTRY='ordinary'
$env:BINCOV_HEAP_OUT='test-results/heap-ordinary'
node scripts/coast-sample-heap.mjs
Remove-Item Env:BINCOV_HEAP_ENTRY
```

## 交接清单与停止点

- **Opus：** 使用本轮原分支继续接入；捕获启动异常时 unmount 后调用仅启动阶段可用的 `services.cancelStart()`；运行中的 Runtime 仍由成功结算释放。不要直接修改底层存档、rng 或 elapsed。测试 `driver`/`initial` 在结算后为空是刻意释放，测试流程应重新获取当前 host。上下文异常状态的版式、文案精修及其他前端展示需求归 Opus，本轮只做与暂停/恢复必要的按钮和提示逻辑。
- **Sol：** 复跑上述签收标准，生命周期已具备本机通过证据；F20 总堆继续 partial。ASTRA-SAVE-01 保持未确认；若再现带回完整诊断，勿以修复驱动或此轮未复现关闭历史问题。第四轮记录的 `qol-expansion` 间歇失败仍属既有待复核项，本轮未改脚本或相关玩法。
- **Astra/后续维护者：** 本轮没有改战斗、地图生成、存档格式、随机调用、ActiveClock 或事务顺序；仅启动失败解除未运行实例、宿主资源释放及图形中断保护。无需迁移存档；未知/坏数据仍拒绝覆盖，结算与导入/冲突保护保持。
- 完成本地提交和交接后停止。未扩展全沿海、未制作/修改素材、未推送/合并/发布。真机 GPU 驱动故障、真人平衡、远端 CI/线上 Pages 未验证；本轮不以本地包冒充线上版本。
