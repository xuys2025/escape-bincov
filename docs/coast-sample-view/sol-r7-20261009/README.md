> 合并整理说明：本文结论与历史失败保留，30 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Sol 第七轮独立复验

2026-10-09（UTC+8），D:\bincov\pr22-runtime 原分支 docs/coast-2-5d-art-design，从138e8991f5334c95b53801aa3e8b8a05347f9b53续作，其直接父提交为0494b6195cab5c22457f2db9868cdbed8c9f655a。已读工作标准、仓库指南、Astra R6与[Opus第七轮报告](../opus-r7-20261009/README.md)，按顺序独立运行，无浏览器测试并发。**总体 PARTIAL；自动通过的范围、保留失败和未运行项分别如下。**

| 项目 | 本轮结论 | 证据 |
| --- | --- | --- |
| 工程与样板 | PASS，242/242；package通过；首轮51/51；20套回归exit0；68张截图0异常 | [全部真实命令（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[样板（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[截图索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 四种结算及保存失败 | 本机自动PASS，8/8；每种原因正常/写入失败后重试各一次 | [完整过程（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[超时重试PNG（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 真实持续伤害 | 本机自动PASS，6/6；真实Runtime读数与HP损失对照，稀有原因夹具明确 | [逐帧事件/读数/输出（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 音频 A6 | 已确认测试漏检修复；历史安静阶段间歇失败仍未确认 | 原算法10次9通过/1失败；修正3×14/14；真实有声/仅hit静音各3次 |
| 潮位与水下拾取 | 本机自动PASS，10/10；保留首试5/10和状态对照 | [最终10例（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[首次（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[时间序列](evidence/tide-timing-summary.json) |
| 隐藏声画边界 | 已测通路PASS，两模式；原旧工具失败保留 | [实际隐藏击杀与契约对照（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[原工具](evidence/hidden-original.json)、[等待后](evidence/hidden-settled.json) |
| 普通入口生命周期 | PASS，两尺寸各4/4，含预期故障注入及恢复 | [1280](evidence/lifecycle-1280.json)、[1920](evidence/lifecycle-1920.json) |
| 资源与F20 | 资源20/20；总堆仍PARTIAL、未归因 | [补充资源（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[严格F20](evidence/f20-strict.json) |
| 历史存档异常 | ASTRA-SAVE-01继续未确认 | 原历史个案缺候选、实际写入结果、完整栈；不与本轮刻意配额故障混同 |
| 真机真人 | 未运行，等待实际设备及人员 | G12/R6-V5、主观辨识/瞄准干扰/声像/卡顿不以仿真代替 |

## 基线与最终提交

最新复核于2026-10-09T07:32:17.231Z：main为8355b857736df7fe471301d61208c25e2b7f9d61，已包含在接手提交中；PR22 OPEN且未合并，远端头878f563。Pages为2416678B，SHA256 3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754，与main逐字节一致，**不包含本地第七轮**。[初次基线](evidence/baseline.json)、[结束前复核](evidence/baseline-final.json)。

Node24.19.0、pnpm11.19.0、Chrome154.0.8037.98，Windows10.0.19045，i5-12400F，32GiB。桌面DPR1；触屏模拟DPR3，四尺寸1280×720、1920×1080、844×390、640×300。所有浏览器进程被顺序等待。真实输入脚本仅读取发布帧，不调用fixture driver；三个条件（留空种子1280、固定20261008的1280/1920）均撤离成功。跳转页3/3；经典/多层×两个种子各240帧状态差分exit0；原Sol visual exit0。[输入流程](evidence/play-empty.json)、[两种素材真实死亡](evidence/player-death.json)，sol: 39个死后present；placeholder: 36个死后present。

正式HTML为3212805B，SHA256 aad83438f01bf69ec414e386b3d7ab1561ab0c6c94f62696fc751b587c34a702；两HTML、跳转页、两ZIP及release-manifest均与138e899逐字节一致。[制品身份](evidence/package-identity.json)。最终提交只包括测试工具、报告和证据，运行源码/tests/素材/生成物Git blob沿用已测试的138e899。最终提交号由包含本报告的本地提交确定，提交后另在忽略目录生成final-commit.json，核对父提交、最终树、manifest与制品；避免报告内的自引用SHA。

[verification.json（已归档）](../../IMPLEMENTATION-ARCHIVE.md)保存真实起止、参数、环境、退出码及现版本脚本SHA。[manifest.json（已归档）](../../IMPLEMENTATION-ARCHIVE.md)列出交付文件哈希；[复制身份（已归档）](../../IMPLEMENTATION-ARCHIVE.md)同时保留原始和交付哈希。交付文本只统一LF和末尾换行，日志另去行尾空格；原始忽略目录不覆盖。最终测试工具仅做换行规范化，[对应证明](evidence/source-normalization.json)保留执行字节SHA和提交规范化SHA，执行文本未改。

## 四原因、写入失败和生命周期保护

撤离原生E持续交互；战死来自真实AI枪火；放弃由暂停菜单确认；没有注入reason/outcome。每种原因都观察已提交落幕的真实present，文字分别为“撤离成功”“你倒下了”“已放弃行动”“行动超时”，phase=ending、committed=true，Runtime帧计数在落幕中恒定。

故障只针对新terminal.runId的首次真实主档写入：四种失败均保留reason、pending/retryable，committed=false，尚未落幕，原主档SHA不变；备份经decodeSession确认包含对应reason。四种重试面板PNG已目视检查标题与按钮，未只读取textContent。解除故障后点击重试，恰好一次终态写入成功；再调用重复重试返回false且字节不变。保险箱四种都保留；背包仅撤离保留；放弃outcome仍death、主武器清空。

超时失败案例在**进入页面前**安装Playwright时钟，完整runFor600秒，保持真实rAF和Runtime停顿保护；仅该超时工作负载将ticker上限设为10fps。0:00、高潮、精神91/水分76/饱食85等真实变化可见于[超时重试PNG（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。正常超时使用合法elapsed599.5边界夹具后推进真实帧；不写成第二次完整600秒，更不写成真人十分钟。备份只交付解码结果/哈希，不提交存档体。

两个早期结算探针误用字段、保险箱位置及晚装时钟造成失败/中止，全部保留：首试四个存档结果，第二次三个及部分时间进度；未完成的故障案例不计通过。[首试中止](evidence/settlement-first-interruption.json)、[第二次中止](evidence/settlement-second-interruption.json)。最终重跑独立8/8，未放宽产品事务或生命周期保护。

## 伤害读数：真实事件与实际掉血

自然敌人攻击触发流血后移到安全处；种子42低潮泥滩从污染0自然积累到掉血。缺水、饱食不足、混合原因和体质效果到期使用经过SaveSession验证的合法状态；随后仍由真实Runtime产生hurt，未合成hurt。实际PNG已检查：[流血（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[污染（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[混合（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[上限下降（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[饱食不足（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

| 场景 | HP损失/秒 | 末帧显示/秒 | 事件端点与HP损失误差 |
| --- | ---: | --- | ---: |
| bleed | 0.650 | bleed: 0.7 | 0.00e+0 |
| pollution | 1.099 | pollution: 1.2 | 0.00e+0 |
| dehydration | 0.500 | dehydration: 0.5 | 0.00e+0 |
| starvation | 0.250 | starvation: 0.2 | 0.00e+0 |
| mixed | 3.160 | bleed: 0.6；pollution: 1.7；dehydration: 0.5；starvation: 0.2 | 3.55e-15 |

污染速率随污染值增长，整窗口平均与末帧平滑读数并不应完全相等；每种来源显示差值均小于探针0.16/秒容差，数值以JSON为准，不以四舍五入宣传绝对精确。混合事件总和扣掉窗口首帧损失后等于HP损失。生命上限下降真实一次15点，显示“生命上限下降 -15.0”，约3秒后消失。持续窗口hit调用0、flashT=0、受击边缘无脉冲；输出仍含环境声，不能称完全静音。稀有状态未做自然十分钟真人耗尽证明。

## A6首败、修复和对照

原门禁前三次14/14，诊断版随后七次中第5次失败，合计10次9通过/1失败。**这次失败发生在“每次打击可听”断言，安静阶段尚未运行**。最后打击t=21143.7ms，输出t=21153.1ms（+9.4ms），peak0.1547079、hf0.0253801；120ms去重保留的前次起音在-61.2ms，刚好落到未改动[-60,+350]窗口之外，漏计后续真实输出。[首次失败](evidence/audio-5.json)、[完整输出块（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[波形（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

只修测试：A6打击匹配保留所有超过既有阈值的输出块，取消120ms合并；k=2.5、floor=.0003、事件窗口和hurt/fire原断言不变。脚步及站立流血仍用原120ms规则，安静起音0及peak<0.1原断言保留。修正后三个全新上下文完整14/14：[11（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[12（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[13（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

对同一失败数据重放，旧算法漏末次，修正算法能匹配全部；仅数值抹掉末次窗口仍有重叠敌枪声，**负对照不具区分性，保留为限制**。[重放对照](evidence/a6-replay-control.json)。新增实际AI邻近scav隔离对照，只在测试上下文抑制SynthAudio.hit委托，其他真实HP/events和背景输出不变；有声3次heard=true（peak0.162–0.194），静音3次heard=false（背景peak0.053–0.058），未添加自动播放豁免。[六次对照（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。这验证隔离打击检测能力，不把混合音场中每次重叠事件说成已分离独立音轨。

Opus历史“站着流血1个起音”未重现，继续未确认。若干本轮安静窗口HP<30，存在一次heartbeat调用且起音0；不能把起音0等同所有声音不存在，也不能仅凭心跳可能性关闭历史失败。真实波形、事件、HP及调用诊断交接Opus。

## 潮水、拾取与隐藏边界

四尺寸种子3/42初始高潮106格/低潮0格。已目视八张岸边初始PNG：浅潮水、永久深海、泥滩干路可区分；水下物品变暗偏绿。首试直接修改地面UID的5个低潮案例仍显示旧物品/位置，导致E拾取失败；纯SaveSession+Runtime两种子对照均能同步，尚未证明浏览器差异的完整原因。改用原生Tab背包丢弃建立水下物品并核对真实UID/坐标/物品，10/10重新通过；不把首试包装为原生水下拾取缺陷。[首次（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[纯逻辑对照](evidence/fixture-state.json)。

合法elapsed299.7夹具后真实帧跨300秒：普通涨潮实测约0.897秒，退潮约1.394–1.400秒；减少动态两个例在翻转首帧立即为0/1，记录foam端点为0/0.85，源码固定不呼吸。当前碰撞/原生E验证在渐变完成后进行：高潮阻挡且不拾取，退潮可通行可拾取；不声称用这些动作测过翻转同一帧的碰撞延迟。涉水夹具水带显示、阴影隐藏，原生A走出后恢复。高潮检查点刷新立即alpha1，两个室内楼层flooded空、回沿海106格且不补播渐变。[四尺寸/减少动态/换层（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。主观“自然”、手机读字与瞄准干扰仍留真机真人。

隐藏真实enemy-6 Runtime击杀：闭合未揭示房间actor/尸体不可见、hit调用0、命中标记和读数0。随后把脱离原状态的同stamp事件送入真实场景/HUD/声音路径，隐藏hurt/player impact/墙弹着无hit/impact输出和标记，揭示正对照有hit/impact、标记及实际起音；隐藏枪声保持可闻，方向指示0，两种素材模式都通过。合成契约证据与V01真实隐藏击杀/遮盖负对照分开，不宣称所有可能通路绝对零泄露。

首试占位模式任意整窗口峰值比失败，实际枪声存在；修正为已有事件局部起音阈值及前段背景样本，保留失败。原第三轮工具再次整屏921600像素差、对象泄露项空；后继只等真实入场CSS动画结束，原像素/对象断言保留且0差。[原失败](evidence/hidden-original.json)、[后继](evidence/hidden-settled.json)。旧包门禁45/51，正好失败W12/W13/V06/V10/V11/V11b；其余45通过，错误和外部请求0。[旧包对照](evidence/sample-on-0494b61.json)。

## 生命周期、资源与F20分别签收

普通入口无测试接口两尺寸各4/4，涵盖启动素材解码故障清理/重试、blur/pagehide/hidden持键释放、destroy释放及WebGL恢复；注入的素材解码错误是预期证据，不能说全局所有日志错误0。补充20循环，两素材模式各10次、每局二楼/地下/沿海三缓存，真实AI战死/撤离/放弃混合；每次离开所有者apps/views/listeners/tickers/timers/observers/RT/liveViews/roots/atlasPages/largeTextures=0，parked1，GPU管理纹理不增长，ghost0、画布滤镜清空。后续基地使用明确合法健康恢复夹具，避免战死后hp1/pollution50干扰下一局，不清空owner、不刷新页面。[逐循环（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[Sol玩家逐帧（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[占位逐帧（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。已提交死亡倾倒至0.16秒尸体接手，落幕Runtime帧冻结；未提交重试面板画面冻结，不签收新的未提交动画方案。

| 采样口径 | 前段均值 B | 后段均值 B | 增长 B |
| --- | ---: | ---: | ---: |
| 当前严格：结果页，一次CDP GC+window.gc（6–10 vs16–20） | 25,051,193 | 25,434,169 | +382,976 |
| 当前补充：sol，基地一次GC（1–3局 vs8–10局） | 24,293,178 | 25,316,670 | 1,023,492 |
| 当前补充：placeholder，基地一次GC（1–3局 vs8–10局） | 24,250,800 | 25,290,707 | 1,039,907 |
| 历史R6严格结果页（6–10 vs16–20） | 见历史报告 | 见历史报告 | +368,605 |
| 历史R6基地三次GC，完整/重复/普通入口 | 见历史报告 | 见历史报告 | +360,368 / +380,943 / +317,474 |

本轮资源基地均值仅作同模式10局首末三局辅助描述，未做严格F20门禁，不能跨上下文拼成一个20局趋势。历史统计不混入本轮。严格正增长exit1、所有者零同时成立；F20仍PARTIAL，无KB容差放行、无增长归因或40/60局有界性结论。本轮20循环资源负载为低潮，未完成20次高潮缓存循环或原生GPU/驱动/音频内存专项；完整600秒超时仅提供一次高潮翻转路径。ASTRA-SAVE-01历史证据缺口仍保留。

## 交接与停止点

[Opus/Astra问题清单](defects.md)区分已修测试、未确认现象、规则确认、资源增长与待实现建议。未运行真机/真人G12、远端CI/线上R7、原Phaser十分钟test:play/test:layered-play、40/60循环、强引用归因和原生资源专项；不以其他自动检查代填。没有改前端方案、Runtime、存档、素材或发布包，没有启动R7-L/A和扩量。完成本地密钥检查、普通提交hook及最终树审计后停止，不推送、合并或发布。
