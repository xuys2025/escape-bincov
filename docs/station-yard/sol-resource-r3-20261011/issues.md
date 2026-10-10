> 合并整理说明：本文结论与历史失败保留，1 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 负责人遗留清单

本轮固定产品68daab4，只补验收脚本/证据。最终签收、回归及具体统计见 [README](README.md)；没有自行修改产品、素材或扩大历史存档调查。

| 归属 | 项目 | 状态与交接边界 |
| --- | --- | --- |
| Opus 渲染层 | SOL-R3-CAP-LISTENER-01：反复模拟8/16能力切换监听增长 | OPEN。6×(8,8,16,16)真实丢失/恢复，graphics程序始终2个且像素/当前GL绑定通过；同能力两次恢复监听平稳，但8槽3→8、16槽4→9。直接sampler group change事件持有BindGroup，部分不属于当前graphics/batcher Shader。DefaultBatcher._updateMaxTextures创建DefaultShader但未销毁旧Shader是调查线索；尚未逐个完成旧BindGroup归因，不得许可为有限缓存。包含scratch实际绘制工作负载，只有能力查询是模拟；真实8槽设备和真实驱动能力迁移未测。详见 [能力明细（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[采样口径](test-diagnosis.md)。不因原ASTRA-R3-PIXI-01的同能力修复通过而关闭此项 |
| Astra 主查，Opus 配合渲染资源归属 | SOL-R2-RESOURCE-01 / ASTRA-STATION-HEAP-01 / F20总堆 | PARTIAL。三组严格60轮独立分列，资源释放通过不等于总堆无增长；V8编译代码、Performance记录、其它JS/原生部分未逐字节归因。堆图retained路径重叠，不可求和“扣除”到零。历史F20与SOL-F20-HUD-01状态不改签 |
| Astra 主查，Opus 配合 | 原R四项、K3/K4严格失败 | 原失败保留。R village-1 GPU增长、context-1 glBuffer空槽、context-2/3 GPU增长逐项记录。完整K旧/新版均2/4：K3 glBuffer live28→31、K4 empty0→3；K4 glTexture本次旧18/新15，不能照抄历史19/15。仅门3source/72frame、玩家8动作纹理、模块级sharedQuad及3缓冲有已知身份与持有链可单列说明；其它冷采样空槽不能只凭“活source等重传”的总数解释为逐项已归因。K4首败后的重挂释放未执行，完整预热60轮另有独立证据。错误的K3/K4无初始化运行为INVALID，不算资源复现。见 [有效K明细](evidence/k-final-summary.json) |
| Astra | ASTRA-SAVE-01 | UNCONFIRMED，本轮不扩查。保存失败结算保持现场与重试通过是单独回归证据，不能据此关闭历史偶发存档异常 |
| Sol 测试 | J1旧节点坐标采样、lifecycle旧页签入口 | 已修并复验：J1新旧各三次均6/6，另新版无trace 2/2；lifecycle1280/1920各5/5。首败/对照/版本保留。J1未观察到按下后丢点击，不能推断所有产品交互风险清零；后续真实输入关闭失败仍交Opus，不自动归为采样问题。预载PNG复制故障已测，冷PNG解码未测 |
| 后续设备／人员验证 | 手机真机、人手体验、真实8槽设备、GPU/驱动原生内存、显示帧率、远端CI | NOT RUN。已执行本机Chrome/RTX3070/ANGLE的headless真实WebGL恢复、读回像素与自动输入，不等于上述目标设备和真人验证。三组60轮已执行，但更长时长/次数未测 |
| 后续按原归属 | ART/COPY/API/RELIEF及其它前端接口需求 | 状态不变，本轮未改产品方案、补图、扩量或扩接口 |

旧RT空槽清理与graphics源码/程序复用应分别看本轮签收证据；任何一个有限修复通过都不等于资源整体/F20关闭。历史失败与原验收材料保持原样，本轮证据独立存放。
