# 源码与测量边界

固定产品 `68daab4639dcd35eea4001e5de21bc1d5db33c88`，父提交 `7a4dc75606b10512defe10b3ee8df0067eb5fab9`。本次只修改验收脚本、文档和证据，产品源码、素材、依赖锁文件及构建字节保持固定。源文件变更集合与原断言核查见 [source-contracts.json](evidence/source-contracts.json)、[original-r-k-contracts.json](evidence/original-r-k-contracts.json)。

## 产品修复审阅

- `src/coast-view/host.ts` 在首次 Application 初始化前副作用导入 `renderer-lifetime.ts`。后者用 Pixi 公开的 extensions.remove/add 替换同名同类型 GlGraphicsAdaptor，不修改 node_modules 或混淆 HTML。
- `graphicsProgram` 按 maxBatchableTextures 的数值缓存 GlProgram，使用 Pixi 原来的 graphics 名称和 color/textureBatch/localUniform/roundPixels bits。contextChange 每次创建新 Shader 与 localUniforms，旧 Shader destroy(false)；适配器 destroy 同样不销毁页级共享程序。没有清空 createIdFromString、重置 UID 或重建 Application 掩盖增长。GL programData 与 uniform location 仍由当前 renderer 的上下文系统重建。
- `src/station-view/scene.ts` 的 releaseTargets 在销毁前取得 world/light/glow 三个 TextureSource uid，destroy(true) 后调用 releaseManagedSlots。该函数只删指定 glTexture 表、指定 uid、且值严格为 null 的槽；保留 live、其他空槽与其他表，GC `_running` 时跳过。`gc!._running` 中 `!` 是 TypeScript 非空断言，不是逻辑取反。模块级 sharedQuad 不在本次三个 uid 内。
- 单测覆盖 live/其他槽/其他表/GC 遍历边界；浏览器检查另核对旧 uid 完全离开表（不能仍为 live），旧 Texture/TextureSource 的弱身份，以及每次恢复恰好三个键出入。

## 三组资源与总堆

每组新 Node 进程、浏览器串行，离线 routed HTML，1280×720 DPR1，repaired 夹具，village seed42。每次完整遍历30个合法相机点、194墙格，预热玩家8方向×5帧的 body/rim、开关门和当前 NPC 有限姿势。三次同动作预热不计入60轮；采样回 (17.5,18.6) 等1500ms，三次 CDP GC 间隔200ms，读 CDP Performance.JSHeapUsedSize，0/30/60堆快照。

重挂、共享往返、上下文恢复三组独立报告，不相减、不与历史 G6/R/K/R7/F20 合并。计数平稳、资源销毁、旧对象收集、总堆趋势分别判断。快照排除 weak 边，图 dominator 的重叠 retained bytes 不可相加，也不是 GPU/驱动分配字节；编译代码、浏览器 Performance 记录及未归因部分不得直接归为许可缓存。

原 R 和 K3/K4 代码段保持逐字节一致。只有已有 uid/弱身份/强持有链的门3纹理与72 frame、玩家8动作变体、模块级 sharedQuad/3缓冲可单列有限缓存说明。首次冷路径与完整预热后的60轮口径不同，不用后者抹掉前者严格失败。

旧 HTML 通过 Node execFileSync('git',['show','7a4dc75:dist/index.html']) 的原始 Buffer 保存并校验 SHA，未经过 PowerShell 文本重定向。混淆别名由 HTML 唯一标记推导后与 VERIFIED SHA 表核对；未知构建、错配 report/build 和重复标记负对照均须拒绝。快照只在本地保留，提交脱敏统计、路径和散列，不提交存档字符串或原始堆。

## 生命周期与输入

coast-lifecycle 的前四项原断言保留，入口改为真实院子“出击”→城中村 seed42。普通入口要求测试全局不存在；另加显式 test=1 的只读探针，观察 host.lastBatch.stamp.simulationTime、player、hp 与 phase。源码 publish 直接把 core.elapsed 写入 simulationTime；没有修改时钟、推进 Runtime、冻结 AI 或模拟结算。生产 Runtime port 隐藏可变 core 字段，不从不存在的 port.elapsed/port.player 推断结果。结算后用 Runtime port.current 的“Runtime disposed.”拒绝、弱对象、RT销毁、停放 stage/ticker/canvas/events 与计数交叉核对释放。

J1 可选 `--input-trace` 记录 DOM 节点弱身份、MutationObserver 替换、动画和真实可信 pointer/touch/click；不参与三组堆采样。先保留相同脚本在新旧构建上的首轮与重复结果，再判断取坐标前的测试竞态或输入过程中的产品问题，不通过重复点击、减少50ms按住时间或放宽原断言隐藏失败。

能力对照只垫片 MAX_TEXTURE_IMAGE_UNITS 的查询值为8，实际 WEBGL_lose_context/restore 与像素读回仍来自当前 WebGL 上下文。模拟8/16切换不是物理GPU/驱动迁移验收；报告同时记录实际 renderer/version。同能力恢复、跨能力的 graphics 程序身份、源码、每个 sampler group 的监听持有者分别记录。
