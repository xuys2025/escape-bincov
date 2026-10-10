> 合并整理说明：本文结论与历史失败保留，3 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Sol 第四轮遗留归属 · 97c0b44

[真实验收](README.md) · [机器登记（已归档）](../../IMPLEMENTATION-ARCHIVE.md) · [素材需求](material-requirements.md)。生命周期PASS、F20 PARTIAL和倒地FAIL分别保留。

## Opus

| ID | 状态 / 优先级 | 事实、证据与交接 |
| --- | --- | --- |
| OPUS-DEATH-01 | **确认，P2，待修** | 共用演员管线在真实敌人死亡批次先syncActor创建corpse，再处理death；deathT启动条件被corpse挡住。Sol/placeholder两模式各经两轮检查，0～0.2秒直接尸体，无倾倒。[真实时间线（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[逐帧标量](evidence/visual/visual.json)、[首轮](evidence/visual-first.json)。请按第四轮原方案修事件时序，增加真实伤害事件门禁。玩家自身终局动画未同法覆盖，不作扩大结论。不是补下蹲图片能解决的问题。Sol未代改前端。 |
| OPUS-MEM-01 | **F20 PARTIAL，P2，标准未签** | 严格结果页+379,727.2B；完整A/B+317,704.0/+332,122.4B；普通对照+328,469.6B。资源/旧对象释放通过、shader81→81；不能把所有差额归JIT或浏览器有界缓存。各方法保留，未改生命周期方案/库或阈值。[完整统计（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。Opus与维护者承接渲染方案决定，Astra协助归因。 |
| OPUS-ART-SCOPE | **已同步，后续批次未启动** | R08背向、R09镜像及短屏地图在本轮代表条件通过；43件、25玩家帧不变。无需西向或下蹲补图。其他占位部件仍为后续候选，须用户另行指令。[素材需求](material-requirements.md) |

本轮限定关闭：OPUS-ART-R08（正式V02头顶0，阳性对照12）、R09（15组镜像零差，沿用Opus光照决定）、OPUS-UI-03（短屏U10及实图无标注重叠）。R10的**补图需求**关闭为不需要，**倒地展示**仍由OPUS-DEATH-01承接，不能混成“动作全部通过”。

## Astra

| ID | 状态 / 优先级 | 事实、证据与交接 |
| --- | --- | --- |
| ASTRA-SAVE-01 | **UNCONFIRMED，P2** | 历史原始候选、写入返回与栈缺失；本轮三类注入、普通样板外、驱动检查点与68图无异常不构成历史根因证明。[分类诊断](evidence/save-diagnostic.json)、[驱动](evidence/driver-save.json)。下次保留提交/HTML SHA、入口、seed/地图/操作、异常栈、setItem尝试及结果、最后revision和事务阶段。原字节/候选只留本地，检查后再决定是否外传；不要重置掩盖现场。 |
| ASTRA-MEM-ATTRIBUTION | **未穷尽，P2，协助** | 3组快照旧Runtime/Host/View等为0，资源释放PASS；Performance强路径只支持部分归属，不是dominator。普通DOM/动画、VM/code与session字符串差额未穷尽，不证明总体有界。原严格条件继续partial；若要改标准，须额外空闲/40–60轮及归因证据并获维护者批准。本轮不自行扩大实验或改阈值。 |
| ASTRA-LIFECYCLE | **本机限定PASS** | 两尺寸各4/4：启动失败清理重试、真实上下文丢失/原canvas恢复、恢复前冻结、结算失败保留及成功重试后下一局。辅助快照旧所有者0、页面池空stage/停ticker/脱DOM。未等同于所有GPU初始化故障、真机驱动或VRAM验收。[1280](evidence/lifecycle-1280/lifecycle.json)、[1920](evidence/lifecycle-1920/lifecycle.json) |

## Sol工具与停止点

- SOL-QOL-WAIT已修：原生E后等待真实lootContext/overlay，再保留精确ID断言；原26条assert未改，20次新浏览器＋完整回归1次通过。
- 严格F20仅补parked=1、GPU纹理不增断言，没有改采样点、GC或总堆门槛；辅助脚本补逐轮值、warmup、原始值只读页面池状态及制品哈希。
- 新倒地检查故意保持exit1并交接，不用手动deathT/预先删除corpse让它“通过”。测试等待不持有旧host/frame句柄。
- 初版证据收集文件名错误已修正并从剩余步骤续跑，记录为工具问题；没有把它归给产品。
- 原20项浏览器回归全部通过，224单测、正式打包及32项样板通过。没有改生产源码/PNG或扩量；本地提交后停止，不推送、合并、发布。
