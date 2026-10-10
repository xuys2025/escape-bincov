> 合并整理说明：本文结论与历史失败保留，2 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 给 Opus / Sol 的复验清单

本轮只诊断 SOL-R2-RESOURCE-01 与关联堆。以 [实际结果](README.md)、[资源归属](OWNERSHIP.md)和 evidence 中的原值为准。历史 ASTRA-SAVE-01 为 UNCONFIRMED；历史 F20、SOL-F20-HUD-01 不由本轮改签。

## Opus：恢复与院子视图边界

1. 从本轮本地提交续作；先保留 Sol R 的原四项失败及本轮上下文序列。`scripts/station-round2-recheck.mjs --only=R` 是原检查，不用新阈值替换。
2. `StationHost.bindInput` 的 contextrestored → `HideoutScene.resize` 每次替换 worldRT/lightRT/glowRT。核对每轮三张旧source destroyed、旧GPU数据已卸载，然后处理管理表残留uid；不要直接删除仍live的对象，也不要销毁模块级sharedQuad。修复若涉及共用宿主，必须回归院子与城中村两条入口、丢失期间计时、停放状态和重新挂载。
3. 静态布局的墙frame上限197组/4136个只适用于本轮固定院子。主门三个open纹理和72个frame允许同Scene缓存，但销毁后必须释放；新增其他门或布局时须重新导出身份域，不能提高一个含糊的GPU阈值。
4. NPC、人物与Lighting/Atmosphere纹理属于院子渲染所有权。需要优化缓存或resize时，由Opus决定展示/渲染策略；本轮未改变他的方案。首次GPU计数增加并非已确认泄漏，必须按语义键、uid、source与堆路径复验。
5. 本轮未测真实GPU/驱动内存、真机显示帧率或人手体验。若试玩出现持续掉帧/设备压力，使用同动作和同温度/功耗条件补设备侧证据；不要用JS堆替代GPU内存。

**优先修复 ASTRA-R3-PIXI-01（已确认）**：院子保持挂载，连续丢失/恢复GL上下文；本轮 `--mode=context --rounds=60 --snapshots` 精确复现。Pixi 8.22.0 `GraphicsPipe.contextChange → GlGraphicsAdaptor.contextChange → compileHighShaderGlProgram(new GlProgram)` 每次新编一个graphics程序；setProgramName加编号，使createIdFromString.idHash永久保存不同源码键。强根 `模块context.XT → properties → graphics-vertex-N...`，同一cache对象id151775，6→36→66条、60轮+260,160B，后30轮+130,080B；见[缓存证据（已归档）](../../IMPLEMENTATION-ARCHIVE.md)和[根路径（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。这是CPU字符串持有增长，不冒称60个GPU程序都泄漏。

修复边界在Pixi graphics adaptor/program复用及其生命周期，或经验证的依赖修复；不在RaidRuntime/SaveSession，不需要改画面方案或素材。避免在打包HTML里按混淆名XT打补丁、全局清空idHash、重置全局id计数，或每次重建Application掩盖问题。若复用program，必须仍重建当前GL上下文的program/uniform绑定，并验证不同能力/maxBatchableTextures条件，不仅检查计数。

修复后独立跑同三组60轮；固定能力下shader源码键0→30→60不应逐恢复增长，旧RT与空槽单独签收，context恢复后绘制及输入正常。新build必须重新映射堆构造器/cache变量并更新诊断SHA保护，不能直接复用本轮minified别名。重挂/共享不应回归出历史每次新renderer的shader增长。

## Sol：可复验的签收标准

先记录 Node、pnpm、Chrome、HEAD、HTML/ZIP SHA；每组独立新进程，离线 1280×720、repaired夹具、village seed42，浏览器串行执行。命令在README。不要把历史G6、20重挂、R混合端点、R7/F20或本轮三组串成一条趋势。

- 原R检查：保留每一项原失败。若首次cold→return因为合法有限缓存不满足原假设，可单独接受已证明的集合迁移；不能删掉cold样本、抬高统一阈值或将原失败改成PASS。
- 完整预热：固定设施/供电，三轮同动作预热；每轮遍历30个合法相机点、194处墙，玩家8向×5帧及描边、主门开/关、NPC当前可达姿势域。枚举调用仅为测试渲染资源预热，不是新游戏动作或逻辑验收。
- 每轮回同一采样点，等待1500ms；三次CDP GC、间隔200ms；读Performance.JSHeapUsedSize。快照在0/30/60；不要与performance.memory.usedJSHeapSize旧值作端点差。不得在页面数组、console参数、JSHandle或测试事件中保留旧Scene/Runtime。
- 60轮重挂 / 60轮共享往返：每轮同一renderer；texture语义键必须与预热基线完全相同；墙组/frame严格不增长；六表字段缺失必须报错。旧宿主/Scene应被收集；已标记texture/source/frame/RT不得有未销毁对象，严格已收集数另外核对。停放必须无stage子项、无运行ticker、canvas脱离DOM、Pixi原生事件/root引用为空、管理表空槽0。
- sharedQuad：只接受一个几何uid0、三个buffer uid0/1/2的同一弱身份；源代码与首次登记栈必须对应TilingSpritePipe模块级共享对象。每轮新建一份不能按“允许驻留”签收。
- 60轮context恢复：单独记录每轮恢复后live及empty、三张RT旧/新uid、恢复后的帧推进。每个新增null必须可追到已卸载的资源；空槽长期持续累积仍保留原严格失败，直到负责人完成明确清理/上限策略及回归。最终重挂应清到0，旧视图源不得继续强存活。
- 堆：报告6–10轮均值与56–60均值、端点、全段及后30轮斜率；这些是观察，不是放行阈值。正增长必须看快照对象身份与根路径，区分测试留存、JIT/浏览器记录和应用对象；未能归因的剩余量继续PARTIAL。构造器数不增不等于所有内部数组/字符串不增长。
- shader缓存：记录同一个idHash对象的源码key身份、计数与string self_size；修复前正对照是恢复6/36/66条，重挂3/3/3、共享4/4/4。不能通过删除快照、清Performance记录、少跑恢复、改名过滤器或扩大可接受字节门槛签收。
- 本地反例：删除/遗漏管理表字段应报错；漏预热门变体应重现首次键集合变化；人为保留旧Scene需使弱释放/堆路径暴露测试持有。不要在正式趋势进程注入反例。

本次是书面交接，没有向其它聊天发送消息。等待维护者分派后续；不得推送、合并、发布或更新试玩站。
