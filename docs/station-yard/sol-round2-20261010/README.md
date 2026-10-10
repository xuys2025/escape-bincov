> 合并整理说明：本文结论与历史失败保留，17 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Sol 定向独立复验 · 水产站第二轮

固定产品基线 c24d32b7984fb0b0b62eeb9bc100e349fccdb166，原分支 agent/hideout-runtime，本地验收提交后停止。产品文件、素材和生成物未改；新增独立补验脚本、报告、证据及交接索引。报告所在提交的父提交应为上述基线，实际交付 SHA 由该提交的 Git 历史及交付消息标识。

| 缺陷 | 签收结论 | 限定 |
| --- | --- | --- |
| OPUS-STATION-INPUT-01 | **PASS** | 原 H17 及 H16 直接入口、两种供电的实际 CDP 触摸、桌面 Playwright mouse 均通过；原生手机和真人未测。 |
| OPUS-STATION-LIGHT-01 | **PASS（画面与裁剪范围）；关联资源仍单独记 PARTIAL** | L1 八视角、独立同视角目视、非墙面照明对照、移动边界及漏墙负对照通过。绘制成本增加，不签真实 GPU 帧率或总堆无增长。 |

资源签收必须拆开：旧墙格/来源纹理与三个 RT 的销毁、场景输入停放、充分访问后的 20 次重挂通过；共享宿主往返/上下文恢复的严格管理表观察含失败，详见下表，**整体资源仍 PARTIAL**。F20 / ASTRA-STATION-HEAP-01 保持 PARTIAL；ASTRA-SAVE-01 保持 UNCONFIRMED。本轮没有借资源计数较低关闭历史问题。

## 基线与工程证据

开工工作区干净，分支/父提交核对为 c24d32b ← 0abe402 ← ee09381。fetch 后 origin/main 为 43a342ce434c101e4b7058a54f6f29ede9482223；只读核对 PR #22 仍 OPEN、head 878f5633316a824960091f8f924c0ddd8dd78078，公开 PR 的旧设计正文不代表本地院子代码已上线。阅读原指南、Opus 报告及 SOL-RECHECK 清单。[基线记录](evidence/baseline.json)包含旧构建哈希、实际 Node 路径及开工状态。

Node **24.19.0**，pnpm **11.19.0**，Chrome **154.0.8037.99**。WebGL 报告为 ANGLE / NVIDIA GeForce RTX 3070 / D3D11 / WebGL2；实际使用此后端不等于完成显示帧率或 GPU 计时验收。所有浏览器检查顺序运行，不与性能对照或其他浏览器并行。手机是 viewport / DPR / CDP 输入模拟；没有声称为真人硬件触摸。

| 检查 | 独立结果 | 证据 |
| --- | --- | --- |
| frozen-lockfile 安装 / 单测 / 打包 | PASS / 273/273 / PASS | [安装（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[单测（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[打包（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 院子完整门禁 | **76/76**，页面错误/外部请求 0，预期注入帧异常单列 | [报告（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 0abe402 旧构建，相同 H17/I1–I5/L1 检查 | **7/23，16 失败，exit 1 为预期负对照** | [旧版完整失败记录（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[日志（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| mobile / mobile-ux | 10/10 / 11/11 | [mobile](evidence/regressions/mobile/mobile/report.json)、[UX](evidence/regressions/mobile-ux/mobile-ux/report.json) |
| desktop-input / shop-drag | 10/10 / 21/21 | [键鼠](evidence/regressions/desktop-input/desktop-input/report.json)、[商店](evidence/regressions/shop-drag/shop-drag/report.json) |
| portable / title | 6/6 / 27/27 | [便携](evidence/regressions/portable/portable-report.json)、[标题](evidence/regressions/title/title/report.json) |
| save-browser / systems | 9/9 / 16/16 | [存档](evidence/regressions/save-browser/save-browser-report.json)、[系统](evidence/regressions/systems/systems-browser-report.json) |
| Astra hideout / 城中村 | 8/8 / 51/51 | [Runtime](evidence/regressions/hideout/hideout-browser/report.json)、[城中村（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 最终触摸与移动补验 | J1/J2 3/3；K1 最终 1/1（分别运行；前序 3/4 原报告保留） | [触摸报告（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[最终移动报告（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[命令与脚本哈希](evidence/supplemental-stable.json) |
| ABBA 性能/照明对照 | 1/1，32 次采样块 | [原始 120 帧数据及照明捕获（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 资源诊断 | {"passed":0,"total":1}；严格失败保留，不写成全绿 | [完整诊断（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |

重打包后与交接相同，最终复核仍相同：

| 制品 | SHA256 |
| --- | --- |
| dist/index.html = start the game.html | ce732ff66cc80c5da1b5a041eec16d16438ad977f3f52c706a18a771159a6a62 |
| portable ZIP | ca7c9da0efbf4ac548e97464045231591a2f03e86b62cbf857d1b2b1901f8f4f |
| web ZIP | cc55ef3e890174a9fc1d213645393590b743a0542dc80771eec6ab2f05944f3d |

原 H17 整段与 0abe402 字节相同，[契约与测试哈希](evidence/test-contract.json)。H16 仅 Opus 基线已移除旧的 390px 卫生所绕道，本轮没有编辑原院子脚本或断言。四尺寸真实拖动、结算及刷新仍通过。

## 输入签收

原 I 组覆盖 390×844 两种供电、844×390 旋转、390×780 地址栏高度模拟、360×740 / 412×915 / 640×360 / 768×1024 / 932×430、桌面 1280×720 / 1920×1080。补充 J1 在两种供电下分别实际触摸 9 个入口的中心与四个内角（45 点），另触摸功能按钮五点并切换开关；不仅做 elementFromPoint 命中检查，还断言实际打开的面板或页签状态。关闭使用真实触摸，未 force、隐藏元素或调用 UI 测试方法打开面板。

同时断言菜单/面板期间交互和提示隐藏、关闭后交互恢复、Esc 收起、场景点击只收起且位移 <1px、旋转收起但保留面板、只改高度保留展开。原 I3 走到老栓旁实际点击交互打开修理铺。J2 经实际任务提交、出击、撤离、回站，逐时采样 power / leave / return：快捷栏、交互、提示没有在动画中露出。真实屏幕旋转、浏览器地址栏和人手触感仍未签收。

## 光照、遮挡与有效负对照

[独立目视记录](visual-review.md)逐一链接新采集的八对同视角原图。墙面/墙顶接缝连续，墙角为自然的面/顶分界，屋顶为整块表面，揭顶、人物前墙透明、家具淡出及深度发光通过 H12/H14 与截图复核。雨点、火焰和 NPC 动作相位不同，不能把所有截图差异都归于修复。

L1 读取实际 world RenderTexture 的接缝两侧亮度/贴图亮度，排除异表面墙角、屋顶覆盖、窗/门和淡出部分；每视角都有 >=8 条有效边，门槛 p90≤0.05、max≤0.10：

| 视角/供电 | 接缝数 | 旧 p90/max | 新 p90/max |
| --- | ---: | ---: | ---: |
| clinic-1920x1080 / emergency | 30 | 0.09 / 0.091 | 0.011 / 0.013 |
| radio-1280x720 / emergency | 21 | 0.219 / 0.22 | 0.028 / 0.03 |
| workshop-1920x1080 / emergency | 28 | 0.061 / 0.122 | 0.011 / 0.013 |
| seawall-1920x1080 / emergency | 38 | 0.004 / 0.057 | 0.003 / 0.008 |
| clinic-1920x1080 / restored | 30 | 0.271 / 0.348 | 0.027 / 0.037 |
| radio-1280x720 / restored | 21 | 0.333 / 0.438 | 0.033 / 0.055 |
| workshop-1920x1080 / restored | 28 | 0.237 / 0.248 | 0.022 / 0.031 |
| seawall-1920x1080 / restored | 38 | 0.118 / 0.234 | 0.026 / 0.06 |

旧版 H17 实际点整备打开出击；I1×2、I2、I2b、I3、360/412/640 的 I4 失败，L1 八视角中七个失败；宽屏 I4、桌面 I5、原本平整的应急南墙为通过对照。未覆盖旧失败或历史验收目录。

P 对照在计时结束后固定照明时钟，八个视角的实际地面光照纹理字节数/FNV32、全院 176 个取光点、玩家 tint、屋顶 tint 和灯光级别均与旧版一致。源码差异也仅将地面溢光从墙体采样中排除；没有调低全局夜景、地面或人物受光来掩盖方块。

K1 先用 30 个合法位置覆盖 **194/194 墙体**；用真实 WASD 使相机横、纵移动，逐渲染帧按墙体真实 local bounds 检查屏内墙没有被裁剪，并定期在同一冻结帧绕过裁剪、重新给所有墙取光再重绘比较实际像素。该对照绕过裁剪分支，光照公式质量另由 L1 独立检验；不能宣称两者完全独立于全部渲染实现。

最终移动数据：{"total":4548,"enters":142,"leaves":150,"cameraSpan":349,"verticalSpan":408,"negativePixels":992}。所有正向像素对照差异 0；故意关闭一段屏内南院墙得到非零差异，为有效漏画负对照。正常帧错误计数及页面错误断言保留。此为本机采样结果，非覆盖所有硬件/缩放/速度的绝对无闪烁承诺。

## 绘制耗时与资源限制

P 在同一浏览器、充分访问全院墙体后按 old → new → new → old 顺序，四视角×两种供电各取 30 帧预热、120 帧原始场景提交耗时。表为两个块均值，不是 GPU 帧时间、显示帧率或统计置信区间。原完整门禁 H13 新版为 2.81ms 均值、p95 3.80ms；它和 P 的状态/样本不同，不混算。

| 视角/供电 | 旧均值 ms | 新均值 ms | 增幅 |
| --- | ---: | ---: | ---: |
| clinic / emergency | 1.812 | 2.302 | +27.0% |
| radio / emergency | 1.798 | 2.540 | +41.3% |
| workshop / emergency | 1.867 | 2.431 | +30.2% |
| seawall / emergency | 1.910 | 1.998 | +4.6% |
| clinic / restored | 2.848 | 3.275 | +15.0% |
| radio / restored | 2.745 | 3.432 | +25.0% |
| workshop / restored | 2.799 | 3.360 | +20.1% |
| seawall / restored | 2.840 | 3.300 | +16.2% |

全院访问每轮均有 194/194 覆盖断言；初始视角的 GPU 203→203 只保留为原 G6 结果，不用来证明优化或无泄漏。充分访问后的独立 20 次重挂：34.133 → 34.846 MB，Δ 0.713 MB；GPU 396 → 394；六表 458/0 → 456/0。194 组、4064 个墙格 Texture frame 随旧 scene 释放，来源纹理也销毁；旧 scene 如仍可由 WeakRef 观察，墙格/取光/画布缓存均清空，三个 RT destroyed=true。全部管理字段严格读取六张表，缺字段不降为零。

原 G6 的强制 GC 总堆约 37.5→38.0MB，Δ+0.511MB；独立充分访问 G6 数据见上一段，Δ约+0.713MB。两种采样状态、纹理集合和进程不同，必须分开；均有未归因正增长，低于 4MB 不能改写成“堆不增长”或关闭 F20。

共享宿主/上下文诊断另起新上下文：四次相同城中村往返、三次上下文丢失恢复，每次返回后重新遍历全院再强制 GC。wall frame/source/RT 销毁、共享 Application 身份、停放 stage=0 / ticker=false / canvas detached / Pixi nativeEvent 释放各自断言。严格表比较失败也保留：

- village-1: fully visited GPU resources grew
- context-1: glBuffer empty grew
- context-2: fully visited GPU resources grew
- context-3: fully visited GPU resources grew

| 采样 | GPU 纹理 | 管理 live/empty | 总堆 MB | 六表 live/empty |
| --- | ---: | ---: | ---: | --- |
| 初始充分访问 | 395 | 457/0 | 34.119 | graphics:9/0, graphicsContext:9/0, glBuffer:28/0, glTexture:395/0, glGeometry:14/0, tilingSprite:2/0 |
| 城中村往返 1 | 406 | 472/0 | 37.552 | graphics:9/0, graphicsContext:9/0, glBuffer:31/0, glTexture:406/0, glGeometry:15/0, tilingSprite:2/0 |
| 城中村往返 2 | 406 | 472/0 | 39.097 | graphics:9/0, graphicsContext:9/0, glBuffer:31/0, glTexture:406/0, glGeometry:15/0, tilingSprite:2/0 |
| 城中村往返 3 | 406 | 472/0 | 38.238 | graphics:9/0, graphicsContext:9/0, glBuffer:31/0, glTexture:406/0, glGeometry:15/0, tilingSprite:2/0 |
| 城中村往返 4 | 406 | 472/0 | 39.737 | graphics:9/0, graphicsContext:9/0, glBuffer:31/0, glTexture:406/0, glGeometry:15/0, tilingSprite:2/0 |
| 上下文恢复 1 | 408 | 470/20 | 39.319 | graphics:9/0, graphicsContext:9/0, glBuffer:28/3, glTexture:408/16, glGeometry:14/1, tilingSprite:2/0 |
| 其后重挂 1 | 396 | 458/0 | 39.909 | graphics:9/0, graphicsContext:9/0, glBuffer:28/0, glTexture:396/0, glGeometry:14/0, tilingSprite:2/0 |
| 上下文恢复 2 | 400 | 462/5 | 38.474 | graphics:9/0, graphicsContext:9/0, glBuffer:28/0, glTexture:400/5, glGeometry:14/0, tilingSprite:2/0 |
| 其后重挂 2 | 396 | 458/0 | 39.803 | graphics:9/0, graphicsContext:9/0, glBuffer:28/0, glTexture:396/0, glGeometry:14/0, tilingSprite:2/0 |
| 上下文恢复 3 | 403 | 465/6 | 38.742 | graphics:9/0, graphicsContext:9/0, glBuffer:28/0, glTexture:403/6, glGeometry:14/0, tilingSprite:2/0 |
| 其后重挂 3 | 396 | 458/0 | 38.797 | graphics:9/0, graphicsContext:9/0, glBuffer:28/0, glTexture:396/0, glGeometry:14/0, tilingSprite:2/0 |

首次往返 GPU 395→406、scene textures 345→356，墙格来源组 194→197、frame 4064→4136；开门变体和走动懒纹理改变了集合，不能把计数相关直接当作逐项归因或泄漏确认。六表首次 glBuffer 28→31、glGeometry 14→15 的驻留仍待负责人解释。恢复期间空槽/纹理计数改变，重挂后回到较小的同口径挂载集合。

诊断结论：{"warmedVillageStable":true,"afterRemountStable":true,"conclusion":"PARTIAL: strict managed-table observations require owner attribution; wall frame/source release and input parking independently passed"}。总堆端点：{"before":34119413,"after":38750494,"deltaBytes":4631081,"conclusion":"PARTIAL: short diagnostic with changed shared-host population, do not combine with G6 or close F20"}。原首轮 K3/K4 严格失败仍在 [extra-first（已归档）](../../IMPLEMENTATION-ARCHIVE.md)，诊断中的预热后稳定或重挂清理不能覆盖它们。共享宿主驻留缓存/空槽增长的归属与真机影响交 Astra 追查，Opus 配合墙格生命周期边界；不自行改产品管理策略。

## 首败、测试修正与未运行

[首轮补验（已归档）](../../IMPLEMENTATION-ARCHIVE.md)保留 2/7、全部失败图和当时脚本；[第二次（已归档）](../../IMPLEMENTATION-ARCHIVE.md)保留 1/4。测试问题逐项纠正而未删原断言：菜单为 modal，关闭选择器原先只匹配 panel；修正后仍在 0.2s pop 动画结束前取坐标而点空，最终等待祖先实际动画 finished 再测量。动画坐标证据示例：[{"selector":":is(.panel,.modal):not([hidden]) .phead [data-act=\"close\"]","before":{"x":307.27264404296875,"y":241.9307861328125,"width":73.734375,"height":29,"top":241.9307861328125,"right":381.00701904296875,"bottom":270.9307861328125,"left":307.27264404296875},"after":{"x":287.265625,"y":217.25,"width":73.734375,"height":29,"top":217.25,"right":361,"bottom":246.25,"left":287.265625},"animations":[{"name":"pop","time":145.4460000016553,"owner":"modal k-menu compact portrait"}]},{"selector":":is(.panel,.modal):not([hidden]) .phead [data-act=\"close\"]","before":{"x":307.26544189453125,"y":241.921875,"width":73.734375,"height":29,"top":241.921875,"right":380.99981689453125,"bottom":270.921875,"left":307.26544189453125},"after":{"x":287.265625,"y":217.25,"width":73.734375,"height":29,"top":217.25,"right":361,"bottom":246.25,"left":287.265625},"animations":[{"name":"pop","time":145.4569999996984,"owner":"modal k-menu compact portrait"}]}]。移动首轮从棚前受阻，相机未越过边界；第二次错误要求全宽直线畅通，院子本来有碰撞物；第三次中央 x17.5 路线虽然横向越过边界，但纵向被育苗池阻挡，实测仅 89px，保留失败；最终改用经 Collision.line 确认的 x14.5 池间通道，原最小位移和逐帧无漏画断言均保留，见 [最终移动（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

[第一次资源诊断](evidence/resource-probe/report.json)在 result 状态刚出现便采样停放，早于 coast view 异步卸载；最终与原 G5 一样等待 coast DOM 卸载且应用确实停放，再保留原 stage/ticker/events 断言。所有版本均保留脚本快照，不把这些测试自身失败冒充产品缺陷，也不把真实管理表失败当作时序问题删除。

完整主门禁及清单列出的十套受影响回归已完成。其他 CI 套件、本轮之外的接口、素材扩量与产品方案均未启动；历史独立验收和 Opus 原材料不改。真机、真人、系统原生切窗、实际 GPU 帧率/原生内存、长循环与远端 CI **NOT RUN**。历史 ART/COPY/API/RELIEF、ASTRA-SAVE-01 和 F20 状态见 [按负责人遗留清单](issues.md)。

[工程命令/退出码](evidence/engineering.json)、[首轮补验命令](evidence/supplemental.json)、[第二轮命令](evidence/supplemental-recheck.json)、[最终命令与脚本哈希](evidence/supplemental-stable.json)、[最终构建/源文件封存](evidence/final-seal.json)、[证据字节索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。采集器保留了相邻任务末尾 1s 窗口内少量重复文件；上表仅引用对应任务的正式报告，不把重复报告重复计数。原始日志中的终端尾空白保留，文本 Git LF 规范化与原工作区哈希在证据索引分别列出。

## 重跑入口

使用 Node24 / pnpm11.19.0，输出到新的 test-results 目录，不覆盖本次或历史证据：

```text
node --import tsx scripts/station-browser-test.mjs --out=test-results/station-r2-fresh
node --import tsx scripts/station-round2-recheck.mjs --only=J,K1 --out=test-results/station-r2-input-motion-fresh
node --import tsx scripts/station-round2-recheck.mjs --only=R --out=test-results/station-r2-resource-fresh
node --import tsx scripts/station-round2-recheck.mjs --only=P --pair-old=test-results/station-round2-old.html --out=test-results/station-r2-paired-fresh
```

旧 HTML 应用 Node execFileSync 读取 git show 0abe402:dist/index.html 的原始 Buffer 再 writeFile；不能用可能转码的文本重定向。其 SHA256 必须为 940a19556bf76ef4d44ed55f76b9f6483d42208f53114d2b090722cd105b7bf3。R 保留严格资源比较失败时会以 exit 1 结束，并完整写出诊断，不允许改为忽略失败。

仅原分支本地提交；未推送、合并、发布或更新试玩站。提交保留并运行原密钥检查与钩子，没有读取或上传 SSH 私钥。到此停止，后续按负责人交回。
