# SOL-R2-RESOURCE-01 资源归属与释放边界

固定 `5075ed6` 的产品，先原样运行 Sol R。原四项失败保留；以下按身份与源代码解释，不能用计数平稳替代对象释放证据。最终轮数、趋势、状态见 [README](README.md)。

## 首次往返的集合变化

| 对象 | 创建与强引用持有链 | 数量边界 | 应释放时间 / 断言 |
| --- | --- | --- | --- |
| 三张开门墙纹理 | `HideoutScene.setGate(true)` → `t()` → `scene.textures[wall:26,21:1 / 27,21:1 / 28,21:1]` → Texture → CanvasSource → canvas | 三个固定门格各一个开启变体；关闭变体原来已有。不是每次开门新增键 | Scene.destroy 对 textures 每项 `destroy(true)` 后 clear；旧 source 与 Texture 的 WeakRef 必须已收集或已 destroyed |
| 对应墙格 Texture frame | `dressWall` → `wallCells(base)` → `scene.wallCellTextures[base]` → Texture[]，各 frame 共享 base.source；墙 Sprite.texture 也引用 frame | 墙组 194→197；每门 16 顶面格+8立面列，共新增72 frame；4064→4136。frame 不是72张新增GPU纹理 | Scene.destroy 先 frame.destroy(false)，再 base.destroy(true)，wallCellTextures.clear；严格检查旧 frame 不得仍未销毁 |
| 八张玩家动作纹理 | `render` → `playerTex(6,1..4)` 与 `t(sol:6:1..4\|edge)`；同一 Map 按键复用 | 此次北向归来新增4 body +4 edge；全部可用域8方向×5帧×2=80键 | 与 Scene 同寿命。换 Scene 重建不是累积；必须区分相同语义键的新对象与旧对象残留 |
| NPC纹理/画布 | `StationHost.updateActors` 的有限方向、姿势、帧 → `actorTex/rimTex` → textures；`npcCanvas` → npcCanvases | 固定设施下：NPC原地姿势或四向idle/talk；行人四向idle/walk；坐客固定姿势。冷采样时帧/靠近姿势不同，会发生键的加入与替换，净值不能当完整身份清单 | 随 Scene 释放 texture/source；npcCanvases.clear。完整预热按这组源代码域枚举，不增加产品姿势或接口 |
| 三个缓冲 uid 0/1/2 | Pixi `TilingSpritePipe.mjs` 模块级 `sharedQuad` → `QuadGeometry` / `MeshGeometry` → positions、uvs、index Buffer；非batch `execute` 首次 `renderer.encoder.draw` 注册到 glBuffer | 一个 sharedQuad；positions32B、uvs32B、indices24B，合88B JS typed-array数据，不等于实际GPU分配字节；不随Scene重建 | CPU几何与缓冲为模块级复用，页生命周期驻留；GPU数据在contextChange/removeAll或renderer销毁卸载，后续使用同uid重建。不能在院子销毁时破坏模块共享几何 |
| 几何 uid 0 | 同上；compiled build 的 `wp`，类型 `Ep`，`execute` 明确以 `geometry:wp` 绘制 | 一个；首次 glGeometry 14→15，glBuffer28→31。其它scene batch geometry更新uid属新Scene，须与旧Scene释放配对 | context恢复后院子未用该非batch分支，旧管理键变null，CPU对象仍由模块持有；再次村落使用应登记同一对象而非新建第二份 |
| Scene batch缓冲/几何 | renderer.renderPipes.batch._batchersByInstructionSet[instructionSet.uid].default.geometry → buffers/indexBuffer；Graphics自身gpuData另有几何 | 按当前渲染根/Graphics集合决定；不是共享quad的三缓冲。身份表记录每项uid、label、bytes、registration stack与可达ownerPath | RenderGroup/InstructionSet.destroy → BatcherPipe.destroyInstructionSet → batcher.destroy；卸载旧场景必须消失，不能把不断增加的instructionSet许可为缓存 |
| 三张渲染目标 | scene.worldRT/lightRT/glowRT → TextureSource；renderer的RT/texture管理器也引用 | 每个存活Scene三张；resize先destroy(true)旧目标，再创建三张 | contextrestored事件调用scene.resize，旧source必须已释放，新source正常存活；旧uid的null管理槽不是旧GPU对象 |
| Lighting / Atmosphere | scene.light.baked[]，scene.atmos.dropT/splashT/ringT/blobT/mistT/waveT | 布局ALL_LIGHTS、固定雨滴/波浪/光斑纹理集合；GPU上传只包括已用者，未用对象可由Pixi自动卸载 | Lighting.destroy / Atmosphere.destroy 明确destroy(true)；不是scene.textures Map的元素，不可只凭该Map数量解释GPU总数 |
| masonry | scene.masonry 数值Map，由lightWall → masonryAt写入 | 当前帧采样点，render每帧clear；不持有Texture/GPU对象 | Scene.destroy再次clear；这不是wallCellTextures缓存 |
| **恢复生成的shader源码键（确认持续强留存）** | GraphicsPipe注册contextChange runner → GlGraphicsAdaptor每次重新compileHighShaderGlProgram → new GlProgram → setProgramName给graphics加递增后缀 → createIdFromString的模块级idHash（本build变量XT）以整段源码为key | **没有已实现的数量上限/逐项释放**。同一cache在0/30/60轮为6/36/66个shader key，22,236/152,316/282,396B；60轮+260,160B；不是GPU Texture/Geometry计数 | idHash页生命周期保留，GlProgram.destroy也不删idHash；这是已确认的Pixi渲染层持有缺陷ASTRA-R3-PIXI-01，交Opus，不许可为有限缓存。按固定恢复条件应复用稳定shader定义或有正确释放机制，不能靠整体堆下降忽略 |

## 上下文空槽

`GCManagedHash.remove` 先调用 onUnload、解除 unload listener、销毁 `_gpuData[renderer.uid]` 并置null，最后把 `items[uid]` 置null。`GlBufferSystem.contextChange`、`GlGeometrySystem.contextChange`、`GlTextureSystem.contextChange` 调用 removeAll(true)。所以“管理表键仍在”与“WebGL对象仍在”是两件事。

具体对照须用同一table/key查找恢复前的资源身份：

- buffer 0/1/2、geometry0：sharedQuad没有在院子重绘，空槽可驻留到重新使用或宿主停放。
- wall/player/NPC source：恢复时按需重新上传，未再使用的同一source仍是Scene合法缓存；完整预热应让固定工作负载的键重新登记。
- 旧world/light/glow source：resize已销毁，旧对象无合法继续驻留理由；空槽是Pixi表的簿记，须与WeakRef/堆路径分开签收。

Pixi GC.runOnHash 达10,000个null时重建表；这一清理发生在GC扫描，不是“任意时刻最多10,000”的硬实时保证。应用 `parkApp` 另行压缩所有null，保留全部live条目。现有代码 `gc!._running` 是TypeScript非空断言加属性访问，含义为GC运行时跳过压缩，不是逻辑取反。

本轮60次恢复每轮新空槽都能在前一采样找到同uid的glTexture / TextureSource（type gb，非scene.textures条目），每轮恰好3个；堆中RenderTexture始终3个且归当前scene三个RT。最终重挂空槽0，旧scene及5,317个标记资源全部收集。见 `evidence/context-null-source-audit.json`。

不把Pixi阈值当本轮绿色门槛，也不要求每次恢复销毁合法共享quad。**空槽持续增加已实测，原严格零增长失败继续保留**，由Opus决定在视图恢复/目标重建边界安全处理；Astra不代改院子的resize或渲染策略。与此不同，shader字符串仍是强持有活对象，并非null簿记；这两个问题须分别复验。

## 证据层级

- `evidence/identity-*.json`：实际对象uid、弱身份编号、缓存语义键、frame所属source、初次GPU登记调用栈；GPU登记栈与CPU构造来源分列解释，不能互称。
- `evidence/long-*.json`：每轮原计数、释放结果、原严格断言与新增精确集合断言。完整raw报告/堆快照在本地test-results，散列见证据索引。
- 堆分析排除weak边，提供强根路径和图dominator。保留字节是V8快照图的计算值，不是GPU/驱动内存；重叠路径不能相加归因。
- 测试仅WeakMap/WeakRef跟踪资源；统计对象在Node端。没有把每轮旧Scene、Runtime、DOM或纹理存成浏览器端数组。历史测试引用留存不能据此自动归零，仍要检查本轮堆路径。
