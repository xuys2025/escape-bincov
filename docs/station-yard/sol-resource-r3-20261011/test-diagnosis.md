> 合并整理说明：本文结论与历史失败保留，1 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 首败与测试修正

## J1：先取证再改采样

原坐标 helper 加可选被动 trace，在新旧构建交错串行各跑3次，全部使用真实 CDP 触摸、50ms按住。原采样结果：旧版5/6供电步骤通过（首轮恢复供电失败），新版4/6通过（首轮应急、第三轮恢复供电失败）。原报告、失败截图、脚本版本和命令保留在独立证据中，[精简时间线（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

- 旧版首败并非设施，而是 body 面板：21,320.6ms 测量关闭节点78，矩形正常；21,332.6ms DOM刷新换成节点79；随后 boundingBox 返回 null。测量之后只有 mutation，没有关闭 pointerdown/touchstart。
- 新版首败为 facility：18,609.8ms 测量节点68，矩形正常；18,614.8ms 换成节点69；同样未发送关闭触摸。失败时 blink 是背景动画，坐标测量本身没有等待运行中的祖先动画。
- 新版第三次同类失败仍在发送关闭触摸之前。故这三次具体首败可以归为跨协议调用持有旧节点的采样竞态，不是已经证实的产品丢点击。
- 源码 `StationHost` 每30帧刷新设施面板；Runtime committed 事件在面板打开时也刷新。因此不能把所有现象只解释为设施的30帧刷新。

修正只在 helper：保留原动画等待，之后在同一次 page.evaluate 内从当前 shadowRoot 重新查询已连接、可见的按钮并读取矩形。保留原 `assert.ok(b,sel)`、J1所有产品状态/显示/不移动断言、真实50ms触摸，没有动作重试或 DOM click 替代输入。R/K代码段保持原样。修正后新旧三组配对各6/6，另新版无trace 2/2，未遇到已发送关闭输入后的关闭失败。见 [最终重复](evidence/j1-final-summary.json)。若后续有按下后节点替换导致关闭失效，须作为另一项产品问题交 Opus，不能用本次采样诊断一概关闭。

## lifecycle：当前真实院门入口

原脚本在1280和1920各0/4，均在旧页签 `#seed` 入口失败，保留原始结果和脚本。入口更新后，两种尺寸首次各4/5：原 view/observer 清理重试、普通上下文恢复与结算、新增直接逻辑时间/释放检查通过，asset项未触发预期启动失败。这些首次失败未覆盖。

院子已预载 coast PNG。旧的“下一个任意 data:image/png 的 Image.src”故障不再证明 raid 的冷解码边界：该次故障被消费，但无启动错误、raid仍运行，截图武器图标缺失，结合 HUD 的 weaponIcon 设置路径可判断原注入目标不可靠。修正后仅在 raid 复制已由 PNG 解码而来的 source canvas 时注入 asset-copy 错误；解码 canvas 用 WeakSet 标记，不存PNG字符串，不改产品资产缓存。排除 HUD 图标 src。另断言故障恰好消费一次且种类正确。

保留原17个断言（含同 runId 重试、零重复 Runtime、存档失败结算保持现场、随后正确返回与再出击）。这个资产子项现在验证**当前预载资产的复制失败/清理/重试**；不冒称冷解码失败已重测，冷解码故障仍 NOT RUN。

普通上下文案例读取真实HUD逻辑钟并保留完整存档字节冻结断言；另加显式 test=1 只读探针读取 Runtime 发布的精确 simulationTime（publish直接赋 core.elapsed），不是院子的 frame/time。三个阶段分别取证：运行正对照、丢失期间冻结、恢复后仍暂停直到用户继续；持有移动键不能穿过暂停恢复。真实放弃结算后，检查 Runtime disposed 拒绝、旧host/view与RT弱身份、停放 stage/ticker/canvas/Pixi事件和apps/views计数。未修改计时、AI、结算或产品暂停方案。

## 保留的额外失败

首次K补验误用 `--only=K3,K4`，跳过K1创建page/ctx，两个构建均为null入口错误（0/2）。这是本轮驱动命令错误，保留原记录但**不计作产品/资源复现**。随后改用完整 `--only=K` 串行跑K1→K4，原K3/K4代码与断言逐字节保留：旧/新均K1/K2通过、K3 glBuffer live28→31失败、K4 glBuffer empty0→3失败，原K4首败后半段未执行。glTexture本次旧18/新15，保留与清单历史旧19的差别，不反向调采样去凑数。有效结果另见 [完整K记录](evidence/k-final-summary.json)。

8／16能力模拟反复切换 C5 的原失败保留。新版程序身份稳定且同能力监听计数稳定，跨能力循环监听仍增长。`samplerListeners` 在 scratch像素绘制后读取；`samplerGroups` 的持有者明细在该次scratch绘制前读取，不能把这两个不同采样点的数值强行相等或逐字节合并。增长属于包含实际scratch绘制的该模拟工作负载；DefaultBatcher更换 DefaultShader 的源码路径是调查线索，未匹配的旧BindGroup尚未逐项完全归因，不许可为有限缓存，也不声称真实硬件切换已复现。
