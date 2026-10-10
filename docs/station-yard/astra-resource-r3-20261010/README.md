> 合并整理说明：本文结论与历史失败保留，6 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Astra · Sol R2 资源归因与三组长循环

基线 `5075ed6ce20bcc6f4637ddea7f2aefaad8a90443`，原工作树 `D:/bincov/hideout-runtime`，原分支 `agent/hideout-runtime`。开工干净，fetch 后 main 为 `43a342ce434c101e4b7058a54f6f29ede9482223`；PR #22 仍 OPEN，head `878f5633316a824960091f8f924c0ddd8dd78078`，归属 `LMX-323/escape-bincov:docs/coast-2-5d-art-design`，讨论未新增实现承接授权。本轮未同步/合并、推送、发布或改试玩站。

导航：[资源归属与释放边界](OWNERSHIP.md) · [Opus / Sol 清单](HANDOFF.md) · [原 Sol R2](../sol-round2-20261010/README.md) · [原缺陷清单](../sol-round2-20261010/issues.md)。

## 结论

**SOL-R2-RESOURCE-01 整体 PARTIAL：有限缓存已归因；上下文恢复存在两种持续增长，其中一项为已确认的 Pixi 字符串强留存。** 原 Sol R 四个严格失败已复现，未改断言。

- 首次往返的三张开门纹理、72个墙格frame、八张玩家动作/描边纹理，以及一个共享quad/三个缓冲均有身份、源码和持有路径证据。固定完整预热后，60重挂与60共享往返没有这些资源的持续累积。
- 连续60恢复：活GPU纹理/缓冲/几何不增长；管理表每次留下3个旧RT空槽，9→189，最终重挂清到0。60个原严格失败及60个新增精确集合失败全部保留。
- **ASTRA-R3-PIXI-01（确认，交Opus）**：恢复时 `GraphicsPipe.contextChange → GlGraphicsAdaptor.contextChange → compileHighShaderGlProgram → new GlProgram → setProgramName → createIdFromString` 每次生成新编号shader源码；全局idHash不清理旧源码键。0/30/60轮该缓存的shader键为6/36/66、字节22,236/152,316/282,396；每轮新增一个4,336B键，60轮 **+260,160B**。这不是允许驻留的有限懒缓存，也不是测试WeakRef持有的旧场景。
- 未确认Runtime或共享会话服务缺陷，未修改游戏源码、接口、素材或渲染方案。F20 / ASTRA-STATION-HEAP-01整体仍PARTIAL；历史ASTRA-SAVE-01仍UNCONFIRMED。归因到Pixi的子项不替历史异常结案。

试玩影响：本机三组自动化共180轮没有页面/绘制错误或外部请求，未见旧院子、已结束Runtime或活渲染资源逐轮堆积。正常短时往返未显示阻断性资源问题；**反复上下文恢复已有确定的字符串持续留存和空槽累积，不能签收长期内存稳定**。不据这些JS观测推断真机GPU/驱动内存或批准发布，试玩站未改。

## 固定口径

1. Node 24.19.0、pnpm 11.19.0，Playwright 使用本机 Chrome；实际版本在各报告的 browser 字段。实际打包 HTML，`https://station.test/` 全由本地 route 提供，context offline，无外部请求。DPR1、1280×720。
2. 先逐字复用原 Sol R 脚本，结果0/1、四个失败保留。随后单独身份诊断，不将改变了采样/预热的数值冒充原R结果。
3. 正式三个进程串行：院子重挂、共享院子→seed42城中村→真实撤离→院子、院子上下文丢失/恢复；各自三轮同动作预热，随后60轮。固定repaired存档夹具，不升级设施；真实菜单输入/真实结算，没有伪造行动结果。测试摆位/AI冻结与原R相同。
4. 每轮完整资源预热：30个合法相机点、194处墙；玩家8方向×idle/4walk及描边；门开/关；StationHost.updateActors 当前设施下的有限NPC/行人/坐客姿势域。预热通过只在测试进程运行的现有render/纹理方法完成，不新增产品接口，不作为游戏逻辑验收。
5. 回到(17.5,18.6)，最后1500ms稳定等待；三次CDP GC间隔200ms；读取CDP Performance.JSHeapUsedSize。快照0/30/60；相同采样点与GC口径。资源domain完整预热不承诺V8 JIT在此后不再编译，后半段趋势和快照另行报告。
6. 浏览器端只保存WeakMap/WeakRef和标量；各轮详细JSON留在Node端，所有wait返回布尔值，不把场景/快照作为JSHandle保存。诊断栈记录的是首次GPU管理登记，CPU创建来源由源码和持有路径补充。

此口径的JSHeapUsedSize与Sol旧performance.memory字段不同；本轮三组也互不相减，不与历史G6、20轮、混合R端点或R7/F20数据混算。`PARTIAL`是结果状态；诊断脚本exit0仅表示已采完，不表示原严格门禁通过。

## 实际结果

完整标量序列见 [summary](evidence/summary.json)、[重挂60（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[往返60（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[恢复60（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。实际Chrome版本 **154.0.8037.99**。MB为十进制，仅用于下表可读性。

| 独立序列 | 完整预热后的集合 | 管理表live / empty | CDP堆基线→60 / 端点差MB | 6–10→56–60均值差MB | 全60 / 后30斜率B/轮 |
| --- | --- | --- | --- | --- | --- |
| 院子重挂60 | texture589，墙组197 / frame4136，GPU661，每轮相同 | 723/0，每轮相同 | 22.949→24.408 / +1.460 | +0.636 | +14,020 / −4,103 |
| 共享往返60 | 同上；同一quad及三个buffer身份保持 | 727/0，每轮相同 | 26.968→28.200 / +1.232 | +0.621 | +11,937 / +27,882 |
| 连续恢复60 | 同上，scene不换，当前三RT更新 | 723/9→723/189；最后重挂723/0 | 24.806→23.586 / −1.219 | −1.052 | −10,831 / +5,878 |

斜率不是通过阈值；特别是恢复组总体堆下降仍藏有已确认shader缓存增长。采样在第三次GC后仍等待200ms且游戏继续绘制，包含其间临时分配；快照是另一个强留存观察，不把两个量直接相减归因。

重挂/共享每轮标记的5,317个texture/source/frame/RT全部收集，旧host/scene为0；恢复组最后重挂同样收集5,317个。三组快照0→60一致：StationHost1、HideoutScene1、RenderTexture3、Texture4,805、CanvasSource666、TextureSource8、Buffer40、QuadGeometry1；CoastSampleHost/CoastView/CoastRaidRuntime均0。它们是**CPU实例数**，不是GPU表live数。堆中的三个RT强根路径分别终止于当前scene.worldRT/lightRT/glowRT；sharedQuad路径终止于模块context.wp。原生驱动资源没有由此完成测量。

首次身份诊断冷场景345→356：新增13个语义键、消失2个NPC帧键，净+11；其中固定的11项为门3+玩家8，其余是NPC采样相位差。实际原R复现GPU395→406，身份诊断另一个进程396→406；两次原值分开保留，不以净差假装所有对象一一不变。见[原R失败（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[身份增减](evidence/identity-summary.json)、[每个空槽前驱身份（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

## 堆增长的归属

以下是快照self_size分组，不是独占GPU内存；多条dominator路径有重叠，不能相加。

| 序列 | 快照self总量0→60差B | 编译code差B | 浏览器Performance类差B | 后30快照总差B |
| --- | --- | --- | --- | --- |
| 重挂 | +977,524 | +752,556 | +63,224 | +57,920 |
| 共享 | +1,683,202 | +1,166,324 | +129,504 | +259,360 |
| 恢复 | +102,138 | −315,016 | +63,472 | +180,888 |

- **测试自身**：`Window.__resourceProbe → registrations WeakMap → stack`保留活资源的登记栈；`__resourceReleased`与`__round2Released`保留上一轮的WeakRef容器（不是旧资源本体）。这类容器会出现在“新增对象”榜单，不能把它的retained大小当净增长。每轮旧对象的实际弱引用检查均已收集；没有复现测试强留存旧Scene/Runtime。Node端逐轮JSON不在浏览器快照内。补充反例检查明确区分“已destroy但仍被测试持有”与“已GC”。
- **V8/浏览器**：InstructionStream、TrustedByteArray、WeakArrayList、PerformanceLongAnimationFrameTiming/LongTask/Event/ScriptTiming，以及浏览器StyleResolver路径。重挂/共享较多增长落在这些类；不能笼统全部叫“合法预热”或证明浏览器缓冲永不增长。共享组HTMLCanvasElement包装器2→4，其中新包装器可达当前Phaser canvas；后30数量不变，不是逐轮新增canvas，但原生内存结论仍保留。
- **应用/依赖**：已确认的idHash字符串走 `Window.__bincov → persist闭包 → 模块context.XT → properties → shader字符串`，source对应Pixi createIdFromString.idHash。堆中cache对象id151775在0/30/60相同；旧key不删除，新增60个。字符串节点预览可能被V8截断，因此证据中的previewSHA256不是完整shader源的哈希，字节是该string节点self_size。
- **未确认部分**：其它JS/元数据、CSS/native backing与采样临时分配没有逐字节全部归因；不把总堆差扣去已知项后剩余值强行归某个组件。没有GPU内存、浏览器无探针长循环或真机对照，整体继续PARTIAL。

各组 `evidence/{mode}-heap-0-60.json`、`{mode}-heap-30-60.json`、`{mode}-owners-0-60.json` 提供明细与强根路径；[恢复shader缓存（已归档）](../../IMPLEMENTATION-ARCHIVE.md)与另两组同名文件提供0/30/60同对象id对照。

## 复现命令

在工作树设置Node24/pnpm11.19后执行；每次使用新的out目录，保留失败。

```powershell
node --import tsx scripts/station-round2-recheck.mjs --only=R --out=test-results/astra-resource-r3/sol-r-repro
node --import tsx scripts/station-resource-trend.mjs --mode=probe --out=test-results/astra-resource-r3/identity-probe
node --import tsx scripts/station-resource-trend.mjs --mode=remount --rounds=60 --snapshots --out=test-results/astra-resource-r3/long-remount
node --import tsx scripts/station-resource-trend.mjs --mode=shared --rounds=60 --snapshots --out=test-results/astra-resource-r3/long-shared
node --import tsx scripts/station-resource-trend.mjs --mode=context --rounds=60 --snapshots --out=test-results/astra-resource-r3/long-context
node scripts/astra-r7-heap-graph.mjs <round-0.heapsnapshot> <round-60.heapsnapshot> <heap-0-60.json>
node scripts/station-resource-heap.mjs <round-0.heapsnapshot> <round-60.heapsnapshot> <owners-0-60.json>
node scripts/station-resource-shaders.mjs <long-context目录> <shader-cache.json>
node scripts/station-resource-summarize.mjs
```

堆图同时比较0→60与30→60，禁止将两个区间相加。构造器简名只适用于本次HTML SHA；换build必须重新核对别名。原始堆体积大且包含自动测试夹具字节，只保留本机test-results；提交去字符串内容的统计/路径与散列索引，不提交玩家存档。

## 验证与边界

正式60轮前，试跑暴露预热夹具把行人id传入station focus的问题，导致读取stand异常；已改为按源码域直接预热NPC纹理，不向focus伪造行人。首个pilot的INCOMPLETE保留，修正后2轮pilot完整通过。该夹具失败不是游戏缺陷，也不计入正式60轮。

实际验证：原R **0/1（预期复现四个严格失败）**；资源身份探针PARTIAL；2轮修正夹具pilot通过；正式重挂/共享各60轮的精确资源/释放检查通过；恢复60轮严格失败、最终重挂释放通过；图算法反例2/2、缺失管理表/留存与destroy区分反例2/2；`pnpm test` **273/273**，`pnpm package`通过。日志见evidence中的txt。单测/打包后未改产品；原R脚本未改。完整院子76项等历史套件本轮未重跑，产品字节无变化，不能把历史通过数记成本轮执行。

两份HTML SHA-256仍 `ce732ff66cc80c5da1b5a041eec16d16438ad977f3f52c706a18a771159a6a62`；portable仍 `ca7c9da0efbf4ac548e97464045231591a2f03e86b62cbf857d1b2b1901f8f4f`；web仍 `cc55ef3e890174a9fc1d213645393590b743a0542dc80771eec6ab2f05944f3d`。源文件版本、散列、完整本机raw路径见[evidence索引](evidence-index.json)。

本轮不制作素材、不扩接口、不改变前端方案。未确认Runtime/共享会话服务缺陷，因此没有为了计数变绿而修改产品。历史ASTRA-SAVE-01仍UNCONFIRMED；历史F20与SOL-F20-HUD-01状态保留。真机、真人、真实GPU/原生内存、显示帧率、远端CI与线上试玩未测，不能由自动化60轮替代。
