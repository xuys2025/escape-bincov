# Sol 第六轮独立验收与资源复验

2026-10-09（UTC+8）。在 D:\bincov\pr22-runtime 原分支 `docs/coast-2-5d-art-design` 从 `14abea379d8f70d98d92178b614cd7361462c6ae` 接手。已读 Opus 第六轮及补充修复报告、gpt-tasks.md、Astra 生命周期签收标准。**本轮总体 PARTIAL；不得描述为全部稳定通过。**

| 项目 | 签收结论 | 当前证据 |
| --- | --- | --- |
| R6-V1 | PARTIAL，工程及顺序功能复跑通过，保留稳定性缺口 | 233/233 单测；package 与14abea3六项制品逐字节一致；样板首轮46/48、顺序48/48；20套回归 exit0；68张截图0异常；真实输入三条件均extract；跳转3/3；生命周期两尺寸各4/4；原visual exit0 |
| R6-V2 | 本机自动证据 PASS | 音频3×14/14；原Phaser恢复当前0.16337/旧0.05603；四种原Phaser真实动作输出对照；共享服务与main四种音色；死亡静音负对照13/14且只E2失败；恢复调度有界 |
| R6-V3 / OPUS-DEATH-02 | 本机自动证据 PASS | 两种素材均真实敌火死亡，已提交后完整倾倒→0.16秒后尸体；结算落幕无host frame推进，结束画布filter为空；换层、重建、读档不重播 |
| R6-V4 | 摆位因果链 PASS；历史归因未确认 | 两包×两坐标×五次自动检查点；旧点10/10在写入前拒绝，原字节不变；只改坐标的候选可解码，新点10/10正常写入。历史当次候选/栈缺失，ASTRA-SAVE-01不关闭 |
| 生命周期 | PASS | 普通入口两尺寸各4/4；旧所有者为0；新增缓存/落幕资源20/20（有明确基地恢复夹具） |
| F20 总堆 | PARTIAL | 原严格结果页+368,605 B；基地三次GC完整+360,368 B、重复+380,943 B、普通对照+317,474 B；仍有未归因增长 |
| R6-V5 / G12 | 未运行，等待设备及人员 | 手机与桌面真人完整流程、卡顿/辨认/减少动态/耳机声像；不以无头Chrome替代 |

## 基线与最终提交对应关系

接手时工作区干净。main为 `841e8bbdfb070eada82537563dd1ab1b4801aea3` 且已包含在本分支；PR22仍OPEN、未合并，远端头878f563。Pages与main逐字节一致（SHA256 3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754），没有本轮样板。当前签收的是本地包。

Node24.19.0、pnpm11.19.0、Chrome154.0.8037.98、Windows10.0.19045、i5-12400F、32GiB。桌面DPR1，触屏仿真DPR3；生命周期1280×720/1920×1080；标签/截图另含844×390和640×300。

正式HTML 3204789 B，SHA256 `2114270ecccfd2c186f6f2d2462814ddf6d2732546003d2af0995a12b0399f9e`。HTML、启动页、跳转页、两ZIP及release-manifest与14abea3一致。最终本地提交只加验收工具/文档/证据：其源代码、tests、运行素材及制品沿用上述已验证Git blob；见 [制品身份](evidence/package-identity.json)、[验证清单](verification.json)、[证据manifest](manifest.json)。提交号由包含本报告的本地提交确定；提交后在忽略目录生成final-commit.json，重新核对最终Git树及证据manifest。避免在提交内部嵌入自引用SHA。

## 物品名与拖动：已看实际PNG

四尺寸“保险管、除藻剂、卡宾弹、力量针”均显示全名。桌面像素字体，触屏小号系统字体；未只凭textContent判定。桌面两尺寸背包与搜刮中拖动影子在指针附近、位于面板之上，关闭/blur后消失。U12边缘拖动故意放到无效区域，“拖放未完成”不等于转移成功；原U01的真实跨格转移/旋转/写入回滚仍通过。短屏面板自身需滚动，当前结论不包含“任何尺寸绝不滚动”。见 [桌面标签](evidence/focus/check-labels-1280x720.png)、[短屏标签](evidence/focus/check-labels-640x300.png)、[拖动显示](evidence/focus/check-drag-mid-loot-1920x1080.png)。

首轮样板与其他功能回归同时运行，V07在行713的Fx.live=6断言失败；**不是室内雨滴断言失败**，后者当次尚未执行。V07抛错后未执行resume，V08随后等loot超时；读代码支持前项暂停残留的解释，但首轮没有逐帧因果日志，不能把成因写成已证实。原脚本未自动为这两项留失败截图，完整错误栈及日志已保留。无并发浏览器的第二次原脚本48/48：同时间天气像素一致、室内溅点0、楼层天气关闭、箱盖open/full、半开18帧。[首次失败](evidence/sample-first.json)、[顺序复跑](evidence/sample-repeat.json)。本轮不改原48项断言或前端。

## 声音恢复与阈值

三个新上下文E2的cue/ambience峰值分别0.1280/0.0491、0.1486/0.0504、0.1312/0.0556（2.61、2.95、2.36倍）；全部符合既有1.6倍且>0.09，保留原阈值。E2 cueOnsets=0是恢复首块即开始、没有前段样本供起音检测，不以调用数代替输出电平。

在离线副本中**只将death()静音**，原14项音频门禁13/14，E2真实失败：0.0535/0.0560≈0.96倍、无起音。与原Phaser旧版恢复缺陷对照一致；正式包没有这个改动。原缺陷repro当前/1c1c935的开枪峰值0.23065/0.21797，暂停均suspended，放弃后running，死亡提示峰值0.16337/0.05603。[负对照失败](evidence/audio-negative.json)、[main共享服务对照](evidence/audio-shared-levels.json)。

另实际运行原Phaser（coast-v1）四种动作：原生鼠标开枪、E拾取保证样本、真实邻近scav伤害、E完整撤离。旧/新输出窗口峰值比：shot 1.0000；hit 1.0000；pickup 1.0000；extract 1.0673。窗口含海声，不能把pickup峰值当成单独提示音响度；补充共享SynthAudio与main的同噪声声学对照（shot/hit/pickup/extract比 1.0461/1.0000/1.0000/1.0873），及原14项输出检查共同支持音量回归。见 [原Phaser四动作](evidence/original-cues.json)。没有做真人主观响度或耳机方位验收。

未完成resume的模拟服务保持16个待恢复声音，1001ms后不再新增；running预算96；stop/ended清零。模拟仅验证界限，不作为真实音频输出证据。见 [调度界限](evidence/audio-bounds.json)。

## 玩家倒地与隐藏边界

[Sol玩家逐帧PNG](evidence/resources-repeat/player-fall-sol.png)、[占位玩家逐帧PNG](evidence/resources-repeat/player-fall-placeholder.png)已目视检查：武器隐藏，身体倾倒，尸体随后接手。原真实死亡探针两模式39/41个死后present；更强的新资源观察在已提交落幕中同时验证phase=ending、settlement存在、host帧计数恒定与filter清理。源码exiting分支先返回outro，未走runtime.advance；没有换成空桩来假装模拟冻结。画面淡出/灰化及视图时间继续不等于Runtime继续。

V01真实Runtime隐藏尸体、关门再开关、重建、换层四种负对照全部0像素差；去屋顶控制有84差异像素，揭示后可见。V04两模式读档/换层/epoch尸体不重播；V06隐藏命中标记为0。额外两模式克隆批次控制，隐藏射手标记/边缘箭头0，揭示后标记与1个箭头出现；这份为合成契约证据，区别于原V01真实死亡。

原Sol可见性工具整页像素比较首次失败，921600像素变化；对象标记均未泄露。两PNG可见全屏入场淡入差异。新增兼容副本**只等待真实入场CSS动画结束**，保留像素/对象原断言，随后0差异，15个隐藏血迹都被扣留、跨层旧事件被丢弃。[原工具失败](evidence/hidden-original-failed.json)、[等待后复验](evidence/hidden-settled.json)。未覆盖的隐藏通路不写成全局信息绝对零泄露。

## 新缓存、落幕与F20

正式包的补充20循环，两模式各10次，每局进二楼和地下后回沿海，并混合真实战死/撤离/放弃；每局烘焙地图3份，观察到atlas约27,934,720B。每次离开apps/views/listeners/tickers/timers/observers/RT/liveViews/roots/atlasPages/largeTextures=0，parked=1、GPU管理纹理2、滤镜清空、无ghost。原最初混合序列因战死后的hp1/pollution50令撤离局再次死亡，4/20中断；失败仍保留。重跑在后续每次基地通过真实SaveSession.mutate恢复合法body健康值，明确标为**测试恢复夹具**，不清空owner、不刷新页面、不改死亡规则；不能作为“真人连续20局无恢复”证据。[首试失败](evidence/resources-first-failed.json)、[补充资源20局](evidence/resources-repeat.json)。

| 采样口径 | 6–10轮均值 B | 16–20轮均值 B | 增长 B |
| --- | ---: | ---: | ---: |
| 原严格：正式包，结果页，一次CDP GC+window.gc | 24,977,980 | 25,346,585 | +368,605 |
| 辅助完整：不压缩副本，基地，三次CDP GC | 33,198,144 | 33,558,512 | +360,368 |
| 辅助完整独立重复，同上 | 33,190,652 | 33,571,596 | +380,943 |
| 普通入口出击/放弃对照，同上；无楼层或撤离 | 33,045,973 | 33,363,447 | +317,474 |

辅助脚本沿用原工作负载、GC、快照6/20与比较，只增加Weather/SampleSound/SynthAudio追踪。Runtime/Host/View/InventoryPanel/Textures/Atlas/Fx/Lighting/Scope及Weather/SampleSound均0；SynthAudio是页面共享服务，1→1并未要求删掉页面服务。着色器字符串83→83，池stage=0/ticker停止/canvas脱离。self_size及code/VM启发式不等于dominator。三次正增长及原严格exit1仍记PARTIAL，未用KB容差放行。没有完成40/60轮、有界性、所有强引用/dominator归因；GPU/驱动内存也不在JS堆结论内。六份堆快照仅本地忽略目录保存。

## 存档异常：摆位证据与历史缺口分开

两包、旧(360,342)/新(368,344)各五次**真实自动检查点**，非手动checkpoint冒充偶发。旧点独立候选decode失败，只修玩家坐标后decode成功；实际setItem=0、字节SHA未变、pause/checkpoint rejected、commit→persist→checkpoint→advance异常栈完整。新点各5次成功写入且可解码。见 [最终20次摆位诊断](evidence/save-placement.json)、[配额/校验/版本三通路及普通入口保存](evidence/astra-save-classification.json)。首版诊断误选全局data-panel所得“地图”字段保留在save-placement-first.json；最终探针将面板范围限定到.coast-sample重新跑20次，未改游戏。

已提交历史round2及round3三个索引都证实使用过旧点，但window均记录running、无存档错、无rejected；历史最初1280样板外异常没有当次候选、写入返回和栈。晚于window的异常面板可由此摆位链产生，但**相同面板不能证明原历史个案就是这一路**。ASTRA-SAVE-01继续未确认；Opus R6报告和R6-L5的“就是历史来源”应按本轮证据收窄，不以修复测试驱动关闭。

## 问题归属与停止点

[Opus/Astra问题清单](defects.md)保留门禁时序、工具淡入等待、F20未归因、存档历史缺口，以及R6-L/R6-A的待安排状态。[verification.json](verification.json)包含每个真实进程的参数、环境、起止和退出码；保留sample/hidden/resources失败、E2负对照失败及F20 partial。交付日志副本仅去除行尾空格/制表符；本地原始日志不变，每个进程记录包含rawLogSHA256以核对原文。

R6-V5等待真实手机、桌面设备及实际玩家。远端CI、线上R6、十分钟旧layered-play、40/60轮与GPU原生资源专项未运行；不会补写为通过。没有代改前端、Runtime、存档协议或素材，没有启动R6-L/A或扩量。完成本地提交、密钥检查和最终树审计后停止，不推送、合并或发布。
