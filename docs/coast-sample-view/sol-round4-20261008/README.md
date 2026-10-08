# Sol 第四轮工程复验 · 97c0b44 · 2026-10-08

从原分支 `docs/coast-2-5d-art-design` 的 `97c0b4486b9420a7c02a2a33680fad24fa973a61` 接手，初始工作区干净。**工程回归通过；生命周期 PASS；F20 内存 PARTIAL；真实倒地过渡 FAIL。** 历史存档异常 ASTRA-SAVE-01 仍未确认。没有代改前端方案或扩量。

[机器登记与131份证据哈希](verification.json) · [分属Opus/Astra的遗留清单](defects.md) · [更新后的素材需求](material-requirements.md)。本轮依据 [Astra可复验标准](../astra-lifecycle-20261008/README.md) 和 [Opus第四轮](../round4/README.md)，不把前序结果直接当成本轮通过。

## 基线、环境与正式制品

- fetch后 `origin/main=841e8bbdfb070eada82537563dd1ab1b4801aea3`，已包含在本地分支。原 [PR #22](https://github.com/xuys2025/escape-bincov/pull/22)仍OPEN、未合并，原fork头仍为 `878f5633316a824960091f8f924c0ddd8dd78078`。已读最新正文和1条排期评论；依用户要求只本地交付，不查询/使用新的远端写权限。[实时基线](evidence/baseline.json)
- 核对时公开 Pages 为2,416,678字节，SHA-256 `3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754`，逐字节等于最新main；**不含本地样板**。所有本轮功能验收针对正式本地 `dist/index.html?sample=village`。
- Node **24.19.0**、Corepack pnpm **11.19.0**、Chrome headless **154.0.8037.98**，Windows 10.0.19045，i5-12400F / 12逻辑线程、约32GiB内存。每个子进程即时记录退出码、参数、时间和环境；[执行器](evidence/runner.mjs)保留在证据中，没有版本查询覆盖退出码的问题。
- `pnpm package`通过，两份HTML均为3,146,541字节，SHA-256 `88ca4cf44377533c385284994f41a837aa0004fd3e8d3614d11276a689a1684d`。HTML、两份ZIP、release-manifest全部逐字节等于97c0b44。[制品哈希](evidence/artifacts.json)
- 没有改 `src/`、运行PNG、运行manifest或正式生成物。堆辅助脚本仅在忽略目录重建未压缩副本，并附加返回原始值的只读页面池检查；不返回Application/host，不改变事件顺序、模拟、存档或生命周期。其HTML哈希与采样方法单独登记，不能当成正式包同字节性能证据。

## 修复与实际回归

`qol-expansion-test.mjs`现在在原生E之后等待 `lootContext`非空且overlay为loot，再执行原来的精确containerId断言。没有等待“期望ID”后省略身份检查，没有固定睡眠、重试断言或放宽失败。**原26条assert语句逐条保留**。[修改核对](evidence/qol-edit.json)

| 检查 | 本轮实际结果 | 证据 |
| --- | --- | --- |
| 单元 / 打包 | 224/224，package通过且生成物不变 | [test.log](evidence/test.log)、[package.log](evidence/package.log) |
| qol-expansion稳定性 | 20个独立新浏览器连续通过，另在完整回归中再通过1次 | [20次执行](evidence/stability.json)、[首轮完整断言](evidence/qol-stability-01.json)、[末轮](evidence/qol-stability-20.json) |
| 原浏览器回归20套 | 全部即时exit0，未删循环/断言 | [逐项记录](evidence/regressions.json) |
| 样板新版功能 | 32/32，0页面错误/外部请求 | [sample/report.json](evidence/sample/report.json) |
| 普通入口生命周期 | 1280×720与1920×1080，各4/4 | [1280](evidence/lifecycle-1280/lifecycle.json)、[1920](evidence/lifecycle-1920/lifecycle.json) |
| 存档定向分类 / 普通样板外 | 3种故障分层正确，普通入口三次检查点可解码 | [save-diagnostic.json](evidence/save-diagnostic.json) |
| 修正驱动检查点 | carbine12、shotgun2、真实kill，3/3 | [driver-save.json](evidence/driver-save.json) |
| 截图 | 17场景×4尺寸=68张，异常/页面错误/外部请求均0 | [全索引](evidence/shots/index.json) |
| 镜像 | 3方向×5帧，运行缓存体图水平翻转逐通道零差 | [visual.json](evidence/visual/visual.json) |
| 真实倒地 | 两种素材模式均FAIL；独立复现仍FAIL，exit1如实保留 | [首轮](evidence/visual-first.json)、[带时间线复验](evidence/visual/visual.json) |
| 严格F20边界 | 7 passed / 1 partial，exit1，0断言崩溃 | [strict-full](evidence/strict-full/sample-boundaries.json)、[即时退出码](evidence/memory.json) |

20套为browser、desktop-input、save-browser、buildings、mobile、mobile-ux、portable、ui、loot、expansion、qol-expansion、systems、art、tactical、title、title-water、mall-passages、mall-landing、qol、loot-target。20次稳定性只证明本轮这20次，不宣称以后不会间歇失败。

一次证据收集误用了Astra输出文件名：实际为diagnostic.json。诊断进程当时已exit0，收集器停止；已保留前3项通过结果，修正路径并从诊断续跑，没有把收集错误登记成产品失败。随后为补持键/恢复后仍暂停断言，两尺寸生命周期另行重跑；本目录的生命周期文件为加强版。[工具记录](evidence/harness-notes.json)

## 背向、镜像、地图与倒地

**背向持枪通过本轮代表性检查。** V02的N/NE/NW头顶武器像素均0；可见武器总数0/24/36，E/W为388/436；恢复北向全长的阳性对照有12个头顶像素。实际瞄准由指针驱动且与Runtime aim比对。已查看 [八方向实机裁图](evidence/art/player-dirs-sol.png)，保留同机位占位对照。沿用Opus纵深缩短与排序方案，不执行第三轮manifest中的“隐藏枪”建议。

**镜像继续保留。** 15组实际缓存体图与对应水平翻转完全相同，八方向图未见旧版那种明显翻转的受光面。本轮接受Opus第四轮对现有弱环境明暗素材的决定，不追加W/SW/NW原画；这不是所有灯光条件的人类审美签收。

**短屏地图通过。** 640×300、844×390、1280×720的U10均无标签/标记交叠、标签在画布内且撤离点不漏。两种短屏CSS地图尺寸为342×248、467×338，显示7项，按优先级舍去「褪色居民楼·一楼」；1280显示8项。已人工查看 [640×300](evidence/sample/check-map-640x300.png)和 [844×390](evidence/sample/check-map-844x390.png)，并保留1920截图。没有代改排版。

**倒地不能签收。** 新检查经 `driver.kill(uid)`调用Runtime真实damageEnemy路径，保留合法击杀/尸体状态；只在view.present正常执行后记录标量，没有预置deathT、手动插死亡事件或删除尸体。Sol/placeholder模式均观察到首个死亡批次包含1个death事件，但body/weapon已隐藏、corpse已显示，deathT与旋转均为0；覆盖0～0.2秒仍没有倾倒。[Sol时间线](evidence/visual/death-timeline-sol.png)、[占位时间线](evidence/visual/death-timeline-placeholder.png)

当前scene.present先syncActor，再处理事件；syncActor在deathT=0的首个死亡帧立即建corpse，随后onEvent(death)的“没有corpse才启动deathT”条件不再满足。第四轮手动过程裁图不覆盖这条真实事件路径。**实测角色是敌人，两种素材模式均走共用演员代码；没有把它扩大说成玩家自身终局动画也已同法验证。** 交Opus按原倒地方向修事件时序，本轮不修改前端。Runtime没有下蹲状态，仍不需要新增下蹲图；图片需求和动画缺陷分别登记。

## 生命周期PASS与F20 PARTIAL分别验收

普通**正式包**在两个尺寸的素材解码失败、视图构造失败、observer挂载失败均清掉样板DOM，同页重试恢复同一runId。真实WEBGL_lose_context丢失后，Esc和DOM继续点击不能推进保存时间；持续按住移动键也不能推进；原扩展restoreContext恢复的是同一canvas，随后继续按键等候2.3秒仍保持原存档字节，需松键并主动继续。结算写入失败保留现场及原字节，成功重试后卸载并能开始下一局。两个普通入口均无产品test接口。[恢复后仍暂停](evidence/lifecycle-1920/context-restored-paused.png)

F20严格循环及两个辅助完整循环均使用seed42，二楼/地下交替→回沿海→撤离/放弃交替→基地。仅按既有测试驱动摆位/冻结AI，不冻结Runtime时钟；普通对照无产品test接口，也不使用这些驱动。辅助A/B为独立新浏览器运行；所有内存任务顺序执行，开始前本轮其他浏览器回归已结束。

**usedJSHeapSize，单位B，各口径独立保存：**

| 报告 | 采样点 / GC | 第1–5轮均值（warmup） | 第6–10轮均值 | 第16–20轮均值 | 增量 |
| --- | --- | ---: | ---: | ---: | ---: |
| 严格完整20轮 | 正式压缩包，结果页；1次CDP GC＋window.gc | 23,531,829.4 | 24,222,992.6 | 24,602,719.8 | +379,727.2 |
| 完整20轮 A | 同源未压缩副本，基地；3次CDP GC，快照6/20 | 31,746,135.8 | 32,372,047.6 | 32,689,751.6 | +317,704.0 |
| 完整20轮 B（新浏览器独立重复） | 同源未压缩副本，基地；3次CDP GC，快照6/20 | 31,727,020.6 | 32,359,076.4 | 32,691,198.8 | +332,122.4 |
| 普通入口20轮对照 | 同源未压缩副本，基地；3次CDP GC，快照6/20 | 31,474,265.6 | 32,147,922.0 | 32,476,391.6 | +328,469.6 |

两份完整辅助报告：[A](evidence/heap-full-a/heap-report.json)、[B](evidence/heap-full-b/heap-report.json)；普通对照：[ordinary](evidence/heap-ordinary/heap-report.json)。普通对照没有换层和撤离，不能替代完整F20。没有把不同采样点、GC次数、脚本或前序报告绝对值相减来宣称修复量。

每轮显式apps/views/listeners/tickers/observers/timers/renderTextures/liveViews/sampleRoots/atlasPages/largeTextures为0，parked=1，GPU管理纹理均为2。三个辅助报告的第6/20轮，旧Runtime/Host/View/InventoryPanel/**Textures缓存类**/Atlas/Fx/Lighting/Scope均为0，不是1→1；Pixi Application保留1个，页面池stage为0、ticker停止、canvas脱离DOM。其余基础游戏与库级Texture等长期对象列在tracked中，没有声称所有Pixi纹理/画布对象都必须为0。

快照分组的**self_size增量/轮**（不是dominator retained size）：

| 报告 | 总self_size/轮 | code/VM启发式组/轮 | 其他/轮 | shader源码字符串 |
| --- | ---: | ---: | ---: | --- |
| heap-full-a | 35,720.6 | 31,937.1 | 3,783.4 | 81→81 |
| heap-full-b | 36,879.1 | 32,660.9 | 4,218.3 | 81→81 |
| heap-ordinary | 45,724.0 | 37,528.3 | 8,195.7 | 81→81 |

三个 [strong-path报告](evidence/heap-full-a/retainers.json)（另有 [B](evidence/heap-full-b/retainers.json)、[ordinary](evidence/heap-ordinary/retainers.json)）排除weak edge，给出新增Performance节点的强根路径样例，支持部分增长来自浏览器记录/测试环境；不是独占dominator归因，不能据此证明全部差额或缓存有界。WeakArrayList/Map也不能一概归为JIT。普通对照DOM/动画、VM及session字符串等仍未穷尽归因，GPU/驱动内存不在JS堆结论内。

严格结果页最后5轮高于第6–10轮，保留原partial与exit1。辅助脚本exit0只说明资源/实例门禁通过；两次完整循环与普通对照都正增长，因此**F20 PARTIAL**。没有新增“允许若干KB/轮”的阈值。未做固定时长空闲对照或40/60轮分窗/dominator实验，也没有批准替代标准。6份约38MB快照留本机忽略目录，只交付哈希，不上传完整快照。

## 存档未确认、素材需求与停止点

ASTRA-SAVE-01继续**UNCONFIRMED**。3类合成故障分别为配额setItem尝试1次、非法候选0次、revision冲突0次，均保留应保留的字节并暂停；普通样板外3次检查点、修正驱动和68张截图未再现历史问题。这些不能替代当时原候选/写入返回/异常栈，不能把驱动修复当作历史根因。原Console、Storage写入结果、校验拒绝及堆栈诊断继续保留，不提交存档正文、不覆盖异常档案。

[素材需求](material-requirements.md)已同步：43件全部沿用，背向按Opus方案、保留镜像、不需要下蹲图片；倒地事件顺序另列前端缺陷。历史PNG、manifest、提示词不回写成当时已通过，也没有扩量。

交付报告、131份精简证据、可复跑工具、需求说明及归属清单后停止。本轮没有改前端/逻辑方案、存档格式、运行资产或正式生成物，没有推送、合并、发布。未运行真机、真人G12、当前本地提交远端CI及商场三局600秒自然计时；浏览器DPR/触屏模拟不等于真机，功能回归并行结果不作性能结论。
