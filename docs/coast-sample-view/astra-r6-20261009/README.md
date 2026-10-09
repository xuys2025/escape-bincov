# Astra R6 Runtime 接口与测试摆位交接

2026-10-09（UTC+8）。从原分支 docs/coast-2-5d-art-design 的 3a4391c 接手，初始工作区干净。按用户授权完成 R6-L1～L5；R6-L6 仅评估；R6-L7 未实施。承接 [Opus 第六轮任务](../opus-experience-20261009/gpt-tasks.md)和 [Sol 独立验收](../sol-r6-20261009/README.md)。

## 基线与边界

最新核对 main 为 8355b857736df7fe471301d61208c25e2b7f9d61；本地正常合入任务分支的提交为 8ae7e29，父提交 3a4391c、8355b85。handoff.md 的双方新增段落均保留。用户明确授权的同步仅为将 main 合入任务分支，**不授权合并 PR**。

[PR #22](https://github.com/xuys2025/escape-bincov/pull/22) 核对时 OPEN，远端 head 为 LMX-323/escape-bincov:docs/coast-2-5d-art-design 的 878f5633316a824960091f8f924c0ddd8dd78078。本次只本地提交；未推送、合并 PR、发布或改线上 Pages。生成包是本地交付，不能用线上页面验收本轮接口。

不改前端展示方案、素材、敌人射程、天气、存档格式或随机数算法。不扩展全沿海。src/coast-view/host.ts 只补服务返回类型，展示、声音、命中标记及潮水绘制的接线留给 Opus。

## 给 Opus：接口接线

权威契约：[contract.ts](../../../src/raid-runtime/contract.ts)；服务：[Runtime](../../../src/raid-runtime/runtime.ts)、[host 服务类型](../../../src/coast-view/host.ts)。端口版本仍为 v1，本地生产者与消费者须一同更新；新增字段没有写入存档。

| 项目 | 最终接口 | 接线与边界 |
| --- | --- | --- |
| R6-L1 | services.settlement().reason: extract / death / timeout / abandon / null | 未结束时 null；准备结算成功后有原因，即使落盘失败仍保留同一候选原因。committed 为 true 才能表示成功保存；retryable 沿用原事务判断。abandon 的 outcome 仍为 death，不能按 reason 改发奖/扣除规则 |
| R6-L2 | hurt.cause: blow / bleed / pollution / dehydration / starvation / limit-change | 物理打击统一 blow，低于 1 点仍是打击。持续伤害不用 damage≥1 推断。后面三类对应原有脱水、饥饿、属性效果到期导致生命上限下降；不把它们假标为污染。Opus 自定哪些原因触发声音/闪白/边缘，保留真实伤害提示 |
| R6-L3 | impact.owner: string或null，与 BulletView.owner 一致 | 玩家为 player，敌人为其 UID，旧敌弹未保存 owner 时 null。通过 enemy 标志规范玩家归属，不猜测旧敌弹射手。可移除玩家弹编号追踪，但 owner 不能绕过 region/revealed 及 stamp/epoch 信息隔离 |
| R6-L4 | frame.flooded: readonly number[] | 当前地图的行优先格索引 i=y*map.cols+x；x=i%cols，y=floor(i/cols)。高/低潮、换层及读档后随同一批次发布。低潮为空；只表达潮汐淹没格，永久水体仍读 map.terrain。门格按碰撞优先级排除。不表示所有造成污染的地面 |
| R6-L5 | test driver placePlayer / placeEnemy 即时校验 | 仅显式 ?test=1；失败前不改状态、不增 epoch、不写档；抛错说明地图/坐标。不得捕获后静默挪位。生产入口仍不暴露驱动 |

Opus 接线位置：host.ts 的落幕 refreshEnding、feedback 中 playerBullets 与 hurtPulse，sound.ts 的 damage<1，以及 scene.ts 的小额伤害闪白过滤。请同步其合成测试事件的 cause/owner 字段，继续保留未揭示区域保护；本轮没有替换这些展示判断。

hurt 的持续损失先沿用原 HP 运算，再按各来源贡献分配实际损失；合计等于该帧 HP 下降，致死钳制不会发出超量合计。持续伤害角度为 null，不新增随机抽取，不降低事件频率。混合持续来源现在可产生多个 hurt；现有前端仍用旧数值阈值，跨阈值时的表现可能与合计单事件不同，需由 Opus 按 cause 接线后复验，不能把当前门禁通过当作这项新展示已签收。交易成功/失败事件的 accepted / committed、原 stamp 和回滚机制保持不变。

R6-L1：多层 v4 读取同一 runId 的已提交 terminal.reason；失败时保留 prepareSettlement 的原原因。经典 v3 原协议不允许 reason，保持其原字节结构，只在当前 Runtime 结束阶段保留原因。旧记录缺少 reason 继续可读，不把历史 outcome=death 擅自还原为 death 或 abandon。候选备份、重试和重复重试不改发奖规则。结算后按原流程释放 Runtime，前端需在落幕/释放前读取服务状态。

R6-L4 的数组不可变、按静态 MapDef 使用 WeakMap 缓存，切图使用当前 map；没有新增需要 dispose 的监听器、计时器或强持有世界的全局集合。不可据此宣称 F20 已修复。高水位可阻路；低水位潮地仍可能积累污染，这是原规则，不能由 flooded=[] 推断无伤害。

R6-L5：多层驱动与解码器共用 checkpointBodyFits（半径10，当前门状态，highTide=false）。忽略高水位阻挡是现有检查点允许角色离开刚涨潮区域的语义，永久墙、窗、矮家具、关闭门及地图外仍拒绝。解码器没有放宽。经典驱动用原 isWalkable 半径10 检查，经典旧档解码规则不变。

## 本轮修正的测试夹具

- [首轮单测](evidence/unit-first.log)的区域揭示摆位 (800,700) 不合法，改为已有合法街口 (640,456)。原揭示断言保留。
- V01 隐藏尸体四种条件，原 x=352+i*30、y=336 可碰墙/家具；统一使用同一未揭示房间合法点 (368,336)。四种条件、隐藏像素0、强制显露负对照、揭示后尸体可见等断言不变。
- V04 两素材隐藏倒地摆位 (352,336) 改为 (368,336)，不改倒地/重建/换层/读档断言。
- [第一轮样板44/48](evidence/sample-first.json)、[第二轮46/48](evidence/sample-second.json)原始失败保留。第二轮把整列平移后仍撞到 (428,336)，因此最终使用明确合法的固定点。两次 W09 在此前 V01 异常之后超时；代码支持暂停残留解释，但未采独立因果日志，不写成已证明的根因。

旧 (360,342) 现在立即抛错，新 (368,344) 可以检查点落盘。这个修复针对已确认的非法摆位路径。**历史 ASTRA-SAVE-01 仍未确认**：当次候选字节和异常栈缺失；不因后续相似面板或新测试通过而关闭。

## R6-L6：射程评估，不改变规则

敌人盐枭射程270、视野300，精英守潮人射程340、视野350；敌弹初始剩余距离沿用射程+70。玩家手枪440、霰弹枪290、卡宾枪660。当前1280×720镜头纵向半高约216，所以合法的射手可以在画面外。视野、开火距离和弹丸剩余距离不是同一值，不能把270直接当作最终命中边界。

不按窗口大小裁剪 AI 射程：那会令分辨率/缩放改变同一行动的规则，也影响普通 Phaser 与样板的一致性。本轮保留现有规则与 Opus 已有的可见区域外射手提示。是否增加其他预警或修改平衡是后续产品决定，需另定验收；不以接口需求顺带实施。R6-L7 随机天气没有实现，也没有消耗行动 RNG。

## 给 Sol：复验清单与签收口径

1. 核对原分支最新本地提交、8ae7e29 的父历史、最终 HTML/ZIP 哈希及本报告验证记录。线上 Pages 不是本轮包。
2. L1 四种原因分别在正常保存、配额失败、导出候选、恢复后重试和重复重试检查；失败时原字节不动、未显示已提交；放弃仍按失败结算。检查 v3 不写 reason，旧 v4 无 reason 可解码。
3. L2 分别观察小于1点 blow、流血、污染、饥饿/脱水混合致死、属性效果到期；合计实际 HP 下降相等，非打击无方向，不额外抽 RNG。Opus 接线后复验 A6 和声音阈值替换，不把本轮旧前端通过视为新接线已验收。
4. L3 玩家/敌人真实命中，以及距离终止，frame 和事件 owner 一致；旧无 owner 敌弹保留 null。接线后 V06 隐藏目标标记仍为0，事件 stamp/epoch 过滤保留。
5. L4 高/低潮、299.99秒跨300秒、沿海/二楼/地下、检查点恢复比对格集合；用同批 map.cols 解码，永久水与潮汐水分开。G05 新水面画法尚未实施，后续须证明只有真实淹没格显示该状态。
6. L5 旧 (360,342)、墙/关闭门/越界/非有限值/未知楼层在 place 调用即报错；状态、epoch、持久字节无变化。新 (368,344)、打开门和合法涨潮逃离位置允许。完整48项、14项音频、四尺寸68张不得降断言放行。
7. 复跑存档、便携、普通浏览器及本轮列出的风险门禁；保留任何失败及首轮结果。真人/真机 G12 仍需真实设备人员，不能由这些自动结果代替。

F20 继续 PARTIAL：Sol 原严格结果页+368605B、基地完整+360368B、重复+380943B、普通对照+317474B 是历史证据，不是本轮新测量。旧 owner=0、Weather/SampleSound=0、共享 SynthAudio=1 不能推导总堆无增长。本轮不改渲染资源策略，不以容差或扩大预热窗放行。后续签收仍按 [Astra 生命周期标准](../astra-lifecycle-20261008/README.md) 与 [Sol 第六轮原始口径](../sol-r6-20261009/README.md)：同包、同工作负载、同采样点/GC保留原严格结果；辅助40/60轮与独立重复须分栏，强引用/retained-size dominator 路径说明增长来源及有界性；没有证明前保持 PARTIAL。JS堆结论不包括GPU驱动资源。

## 实际验证

验证环境 Windows、Node24.19.0、pnpm11.19.0、Chrome154.0.8037.98；桌面DPR1、触屏仿真DPR3。详见 [进程/退出码与制品身份](verification.json)、[证据哈希](manifest.json)和 evidence/。失败日志保留，不声称完成完整远端 CI、真人平衡、手机实机、F20长轮或历史存档归因。

最终 HTML 3206648B，SHA256 b46c56ef94cd049b71a285989f97f265cbc68788b0be34e026f2ab486c84eedd；两份 HTML 相同。ZIP 与清单由 pnpm package 生成，未手改。

| 检查 | 实际结果 |
| --- | --- |
| pnpm test / pnpm package | 241/241；严格类型与离线打包通过 |
| 最终包样板 / 音频 | 48/48、14/14，页面异常及外部请求0 |
| 最终包四尺寸截图检查 | 68张，anomalies/errors/requests均0；PNG留在本地 test-results/astra-r6/shots-release，长期证据保存索引 |
| Runtime 对原 Phaser 完整状态差分 | 经典/多层×种子42/20261007，共4组，各240帧；状态、RNG、HP、计时逐帧一致；这是模拟帧时间 |
| 原入口 browser、save-browser、portable、expansion、buildings、desktop-input、mobile、mobile-ux | 八套均 exit0；保存失败重试、多窗口、旧HTML拒绝v4、导入及输入回滚断言保留 |
| 十分钟真实计时 pnpm test:play | exit0；观察10分钟加最后行动收尾，共618秒；2次撤离成功，35次原生拖放，页面异常/外部请求0 |

首次自然计时在会话中断后未完成，最后记录181秒；进程在继续时已不存在，旧的 natural-play-report.json 来自10月7日，未用其冒充本轮结果。[中断日志](evidence/play-interrupted.log)保留，随后从头运行完整十分钟。

本轮没有重跑上下文丢失专项或完整20套CI，也没有重跑F20；历史PASS/保留项与本轮新结果分开。自动触控和脚本真实计时不等于真机/真人验收。测试摆位及模拟时间的门禁也不能替代真实自然操作。

复验时使用 Node24、pnpm11.19.0，按顺序运行，避免浏览器并发影响：

```powershell
pnpm test
pnpm package
node scripts/coast-sample-test.mjs
node scripts/coast-audio-test.mjs
node scripts/coast-sample-shots.mjs
node scripts/runtime-differential.mjs
pnpm test:save-browser
pnpm test:browser
pnpm test:portable
pnpm test:expansion
pnpm test:buildings
pnpm test:desktop-input
pnpm test:mobile
pnpm test:mobile-ux
pnpm test:play
```

本轮提交由包含此报告的本地 Git 提交确定；报告不嵌入自引用 SHA。提交后停止，等待用户交接。
