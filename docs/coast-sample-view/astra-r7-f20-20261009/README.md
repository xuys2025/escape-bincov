# Astra R7：F20 长循环、引用链与水下拾取规则

2026-10-09，从 `e209ed09f71b9a9305dc357ae4b46adb1f073a17` 在原分支 `docs/coast-2-5d-art-design` 续作。[Sol 第七轮](../sol-r7-20261009/README.md)原报告和失败证据保留。**F20 继续 PARTIAL；资源计数通过，部分增长已有引用链依据，总堆未满足原验收标准。未确认新的 Runtime/存档底层缺陷，没有修改游戏源码、素材或生成物。**

接手 fetch 后 main 为 `8355b857736df7fe471301d61208c25e2b7f9d61`，已在分支历史中，无须同步合并；PR22 OPEN、未合并，远端 head `878f5633316a824960091f8f924c0ddd8dd78078`。本轮只本地提交，不推送、合并或发布；[末次只读基线核对](evidence/baseline.json)。

## 严格长循环：原标准不变

[工具](../../../scripts/astra-r7-f20.mjs)沿用 `sol-sample-boundaries.mjs` 的F20：正式单文件、1280×720、离线、种子42、冻结AI；交替二楼/地下后回沿海，交替放弃/原生E撤离；结果页且样板DOM移除后，一次CDP GC，再在原资源读数评价中执行 `window.gc`。随后回基地，单页连续60轮，不刷新、不清档、不补健康、不另加GC、不保留游戏对象句柄。逐轮报告存Node端。

保持第6–10轮基线，分别比较16–20、36–40、56–60，不换基线抹掉前段增长。正增长仍exit1/PARTIAL，无KB容差。命名包/堆快照/高潮场景均单独列出，不能替代本表。

| 正式60轮 | 第6–10轮均值 B | 后段均值 B | 增长 B |
| --- | ---: | ---: | ---: |
| 第16–20轮 | 25,049,583.0 | 25,424,995.8 | +375,412.8 |
| 第36–40轮 | 25,049,583.0 | 25,735,614.2 | +686,031.2 |
| 第56–60轮 | 25,049,583.0 | 25,991,574.2 | +941,991.2 |

[逐轮报告](evidence/strict60.json)、[日志](evidence/strict60.txt)。60/60的 apps/views/listeners/tickers/timers/renderTextures/liveViews/observers/sampleRoots/atlasPages/largeTextures 均0，parked=1，GPU管理纹理不超过首轮，页面错误和外部请求0。**这只证明所测所有者释放，不能证明总堆不增长，也不计量驱动原生显存。**

## 三种留存来源

另运行同源码未压缩命名包60轮，在第6/20/40/60轮采样后取快照。加载字节与正式包不同，快照可能额外GC，因此只作归因辅助。命名包均值增长 +372,547.2 / +681,554.4 / +928,466.4 B，不能与正式包直接相减。

[分析器](../../../scripts/astra-r7-heap-graph.mjs)排除weak边，对记录图求即时支配节点及树上self_size总和，同时给最短强引用根路径。用菱形/环/共享/不可达图，以及100个确定性随机图的独立删除节点可达性判定验证算法，2/2通过。图retained不是原生/GPU实际占用；ephemeron/shortcut只按记录图处理，示例互相重叠，**不得相加当作归因分摊**。分类使用互斥self_size；长内部名称截断不是唯一对象身份，逐对象使用快照ID。

[6→60图及引用链](evidence/graph-6-60.json)self_size净增1,138,352 B：

| 分类 | 净变化 B | 能支持的结论 |
| --- | ---: | --- |
| compiled-code | +826,924 | 编译/反馈结构占主要部分，不证明预热完成 |
| VM-shape | +8,296 | VM形状元数据增长 |
| browser-performance-records | +76,792 | 性能条目，尚不含所有子对象 |
| other-native | +152,608 | 含VM WeakArrayList、DOMRect等，不全是应用资源 |
| other-JS-and-metadata | +73,728 | 含下述管理表，不能全部归给测试或预热 |
| strings / named-render-runtime-objects | +4 / 0 | 仅在此包、采样点、枚举类别成立 |

1. **测试显式留存：可逆阳性对照，正式60轮无此句柄。** 刻意 `evaluateHandle(host)` 后结算，根路径为 `(Global handles) → CoastSampleHost (DevTools console) → handle.runtime → bound advance → CoastRaidRuntime`，另一支为 `host.view → Tide`。释放句柄并GC后Host/Runtime/View/Textures/Atlas/Fx/Lighting/Weather/Tide/SampleSound/Scope/InventoryPanel全部消失。所有者计数在释放句柄前已为0，说明destroy不等于JS对象可回收。[最终对照](evidence/pin-final.json)、[释放前路径](evidence/graph-pin-final-owner.json)、[前后数量](evidence/graph-pin-final-release.json)。只证明工具能检测此类留存，不能宣称正式F20增长来自它。首轮对照也保留；最终工具将不足20轮的memoryStatus改为未评估，单轮passed仅代表对照流程完成。
2. **浏览器/编译预热：有分类和路径，没有平台期证明。** 新InstructionStream沿模块上下文可追到应用 `tile`、`paintRoof`，也可追到Playwright `UtilityScript → innerSerialize`。Performance条目从 `UtilityScript.builtins.performance` 可达；这是最短路径，不证明浏览器自身没有其他根。6→20、20→40、40→60编译结构仍增456,092 / 211,320 / 159,512 B。因此只能说编译增长显著且后段减速，不能说余量全是测试噪声或预热已结束。
3. **应用前端资源：发现两种引用，交Opus。** 见下节。全部命名长循环和高潮采样点均无上述样板所有者实例残留。Phaser/停放Pixi/SynthAudio常驻对象计数稳定，不能把非零数量本身当成泄漏。

## 给 Opus：管理表增长与事件引用

**R7-F20-FE-01：确认采样窗口内空槽增长，未证明无限泄漏。** 链路为 `模块 current → _Application2.renderer → renderPipes.graphics → GraphicsPipe._managedGraphics → items → (object elements)`。同一个pipe和items对象ID在6/20/40/60轮保持不变；[逐点表](evidence/cache-timeline.json)：

| 周期 | 索引键数 | 值为null | backing self_size B |
| --- | ---: | ---: | ---: |
| 6 | 144 | 144 | 3,096 |
| 20 | 480 | 480 | 12,312 |
| 40 | 960 | 960 | 24,600 |
| 60 | 1,440 | 1,440 | 49,176 |

净backing增46,080 B可单独确认，不能解释全部F20。Pixi8.22.0 `GCManagedHash.remove` 将槽赋null；`GCSystem.runOnHash` 有累计10,000个null触发clone的路径。60轮未达到该数量，也未证明实际调度到阈值后的回收效果；不能把源码阈值当成实测上界。现有 `gpuTextures()` 只计活项，无法揭示此表增长。请Opus评估停放/管理表清理方式，不能在测试里直接抹空私有表后宣称产品通过。

**R7-F20-FE-02：确认停放事件池可达已移除HUD，窗口内数量稳定。** `EventsTicker → _EventSystem2.events → rootBoundary.eventPool / _rootPointerEvent → FederatedPointerEvent.nativeEvent → PointerEvent → EventPath → 已移除cs-hud`。四采样点均2棵cs-hud、5个原生PointerEvent；事件ID更新，未见HUD按轮堆积。约30KB DOM子树retained示例只用于定位，重叠路径不可累加。请Opus评估park时事件引用生命周期，保持恢复后的鼠标/触屏/拖拽/失焦行为。未报告旧Host/Runtime因此被保留。

本轮只交接证据，未代改前端方案、第三方库或展示，未制作素材。

## 高潮缓存补查

正式包种子3单页20轮，交替二楼/地下后回沿海，原生撤离坐标取当局真实出口；其余结果页/GC边界不变。与seed42严格F20分开签收。每轮实际high=true、flooded=shown=106、alpha=1，11个tide键固定，bakes为沿海加当轮室内的2个地图。**不是Sol每局同时遍历三个地图的补充资源口径。**

[高潮20](evidence/high20.json)的atlas始终1页、largeTextures=10，结算后atlasPages/largeTextures及所有者计数归零，GPU活纹理不增长，错误/外部请求0。图集帧数可受画面细节影响，bytes不能当真实GPU分配。总堆6–10对16–20仍 +379,885.6 B，PARTIAL。

[高潮命名20](evidence/high-named20.json)、[引用链](evidence/graph-high-6-20.json)补充确认结算后Tide/Atlas/Textures/View/Runtime实例无残留；同样存在Graphics空槽增长。没有GPU驱动/进程私有内存/原生音频专项，不签收这些范围。

## R7-L5：确认沿用现有水下拾取规则

Runtime `nearbyLoot()` 与原Phaser一致：距离严格小于43，且按当前潮位通过 `sight(loot,player,highTide, layered ? 10 : 0)`。经典lineOfSight按6px采样，多层corridor按4px采样，包含两端，多层按10px身体半径查通路。高潮tide格不满足通行，所以水下目标不能拾取；玩家在水中或中间通路不通也会拒绝，**不能简化成只看物品中心格**。退潮后仍须满足距离、障碍与背包规则。

`pickupLoot()`在事务前拒绝不可达目标，没有物品写入或成功looted事件。新[定向测试](../../../tests/raid-runtime-r7.test.ts)覆盖经典/多层：真实生成地图选岸边，高潮拒绝时写入次数、主档字节、背包、地面物品不变；退潮成功拾取并得到有效主档。一致潮位快照是显式夹具，不伪称自然五分钟。

重跑Sol原生背包丢弃/E拾取的四尺寸及减少动态10例，10/10通过，[结果](evidence/tide.json)。合法elapsed299.7夹具后由真实帧翻转，原断言保留；碰撞/拾取在渐变后测，不宣称翻转同帧已测。无需修改规则/持久化格式；水下颜色和交互文字归Opus。

## 给 Sol：复验与签收条件

- 在接手正式包上独立跑seed42连续60轮，保留每轮、6–10基线及三个窗口；任何正增长继续PARTIAL，不换基线、不加GC、不改基地采样、不降轮数、不设KB容差。快照另开上下文，不替代正式读数。
- 资源单项每次结算后既有11项均0、parked=1、GPU活纹理不增长；高潮20轮另查106格、11个潮缓存键和退出清空。资源通过与总堆状态分开报告。
- 若Opus改管理表清理，用命名包6/20/40/60快照查原路径，证明空槽/backing不再随循环增加。若声称延迟回收有界，实际观察触发、回落、后续重复周期；不能只引用10,000阈值，不由测试清表/销毁页面帮助通过。
- 若Opus改事件生命周期，证明park后旧HUD不再被nativeEvent/EventPath保留，且重新挂载的鼠标、触屏、拖拽、失焦抑制、图形上下文恢复和结算重试不回退。两个HUD稳定留存与按轮增长是不同命题。
- 重复显式句柄保留/释放对照，确认可发现Host/Runtime/View/Tide；长循环不得保留JSHandle、console对象或PublishedView。出现DevTools根不等于全归测试，还须查后续对象/其他根。
- 总堆签收仍须原F20条件成立，归因报告不能抵扣941,991.2 B后转PASS。原生GPU/驱动/音频须有对应观测才签收。
- R7-L5复验岸边高潮拒绝/退潮接纳和拒绝时零写入，保持旧档与事务原子性；不能为展示需求改变水下拾取底层规则。

复现命令、环境、退出码与脚本版本见 [verification.json](verification.json)。先在PowerShell配置Node24和pnpm11.19.0；严格运行清空R7_NAMED/R7_SNAPS/R7_PIN，R7_SEED=42、R7_CYCLES=60。命名诊断设R7_NAMED=1、R7_SNAPS=6,20,40,60；高潮单独R7_SEED=3、R7_CYCLES=20；显式句柄对照仅R7_CYCLES=1、R7_NAMED=1、R7_PIN=1。每组使用新的R7_OUT目录，顺序等待进程结束。

## 验证与保留项

243/243单测、package、图算法2/2、浏览器潮位10/10通过；四个长循环正增长exit1原样保留。所有浏览器顺序运行；部分离线Node堆图分析与浏览器重叠，可能影响墙钟/调度，不声称专用空载环境。自动审批曾两次因额度不足中断工具调用，未执行的操作未计入验证；续作后完成报告和提交。

[制品身份](evidence/package-identity.json)核对两个HTML、跳转页、两ZIP和release-manifest与e209ed0字节一致。正式HTML3212805 B，SHA256 `aad83438f01bf69ec414e386b3d7ab1561ab0c6c94f62696fc751b587c34a702`（以身份JSON实际哈希为准）。原始快照/命名HTML在忽略目录 `test-results/astra-r7`，未把堆或存档体加入Git；[快照身份](evidence/snapshot-identities.json)保存路径、大小、SHA256，其他机器可重建。交付JSON/日志统一LF，潮位日志另去行尾空格，原始文件保留；[manifest.json](manifest.json)列交付证据哈希。首版执行脚本及后续改动说明保留，不能拿最后编辑SHA冒充历史执行字节。

ASTRA-SAVE-01、R7-TEST-STATE-03草稿状态差异、历史站立流血起音继续未确认。未启动R7-L1～L4、天气、射程变更或全沿海扩量。未重跑20套完整浏览器CI、真人真机G12、十分钟流程及线上Pages；无游戏源码修改，不拿历史结果当本轮运行，不作CI/上线新声明。

完成本地密钥检查、正常commit hook及最终树核对后停止，等待交接。
