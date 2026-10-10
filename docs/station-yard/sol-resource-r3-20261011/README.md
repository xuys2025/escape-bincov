> 合并整理说明：本文结论与历史失败保留，11 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Sol 独立复验：68daab4 资源修复与生命周期

固定产品 **68daab4639dcd35eea4001e5de21bc1d5db33c88**，父提交7a4dc75606b10512defe10b3ee8df0067eb5fab9，原分支 `agent/hideout-runtime`。本轮只改3个验收脚本、报告和证据；产品、素材与构建字节不变。按 [Opus清单](../opus-resource-r3-20261010/SOL-RECHECK.md) 和 [Astra固定口径](../astra-resource-r3-20261010/README.md) 独立执行。历史材料保留，新证据均在本目录。

## 分项结论

| 项目 | 签收 | 证据与边界 |
| --- | --- | --- |
| 旧 world/light/glow RT 空槽清理 | **PASS** | S1四次恢复与S2三种resize后旧uid完全离开glTexture（不是live或null），旧Texture/source收集或destroyed；60恢复每轮3出3入、空槽始终0。旧版同口径9→189 |
| ASTRA-R3-PIXI-01 原缺陷 | **PASS（原同能力graphics程序/源码增长修复）** | 程序弱身份复用、当前GL重链接/uniform/sampler正确、实际RGB像素绘制通过；60恢复同一idHash保持3/3/3。**不包含跨能力反复切换的全部监听释放**，新增C5残留失败交Opus |
| 城中村生命周期 | **PASS（自动化范围）** | 当前真实院门出击；1280与1920各5/5。直接Runtime逻辑时间冻结、恢复后继续暂停、显式继续及结算释放成立。冷PNG解码故障未测，当前资产复制失败单列 |
| J1 | **PASS（采样修正后的自动化范围）** | 先取DOM/动画/输入证据确认三次取坐标前节点替换；修正后旧版6/6、新版6/6，另新版无trace 2/2。保留真实50ms触摸及原断言，不重试动作 |
| 总堆 / F20 | **PARTIAL** | 资源释放通过不等于总堆无增长。三组均值、端点、斜率与强根图分别报告，未归因增长不关闭；ASTRA-SAVE-01仍UNCONFIRMED |

## 基线、环境与最终构建

开工工作区干净。只读fetch后origin/main为43a342ce434c101e4b7058a54f6f29ede9482223；PR22仍OPEN，head878f5633316a824960091f8f924c0ddd8dd78078，未变更PR/远端。固定产品不追随其它分支移动。

Node **24.19.0**，pnpm **11.19.0**，Chrome **154.0.8037.99**。初次pnpm包装器经系统Corepack启动；浏览器脚本使用Node24。复核后把整个Corepack/pnpm启动链固定为Node24，并重新执行 frozen install、275单测、package，最终签收以 `node24-*` 原始记录为准。不是只在报告中写版本号。

| 产物 | SHA256 |
| --- | --- |
| dist/index.html = start the game.html | `112e7c8e37c91a218351b2fee03c008872bee5ca563d4262e431a57a845c5ef1` |
| release/Escape-Bincov-portable.zip | `6e789f4bf0902bbc4897bfde56c01a2a7e66c708661556673b136320e4d1ec54` |
| release/Escape-Bincov-web.zip | `8b75c966f139675b22279c7ad458be9056e368aad5237ac7dffc6057c806b16c` |
| 7a4dc75旧HTML（本地对照） | `ce732ff66cc80c5da1b5a041eec16d16438ad977f3f52c706a18a771159a6a62` |

旧HTML通过 **Node execFileSync git show原始Buffer → writeFile** 保存（maxBuffer10MB），保存后校验3,618,792B及SHA；未用PowerShell文本重定向。源码边界审阅见 [source-review](source-review.md)，原断言数量/内容核对见 [final-assertion-contracts](evidence/final-assertion-contracts.json)。本轮没有改Runtime、SaveSession、Pixi依赖、产品方案或HTML源码。

## 两项修复的对照

原8项程序/RT脚本：旧3/8，新8/8；1920新8/8。S1另加强“旧uid不在全部键中”，防止只检查null而漏过旧live条目。旧版S1/S2/P1/C2/C3失败；新版本均通过。P1同能力程序index始终0、sampler change监听2→2；每次当前GL的isProgram、LINK_STATUS为真，uniform读取无错误，uTextures为0..n−1。no-batch Graphics实际绘制带平移、tint，RGB各128±2，位置/背景正确。

C1–C4：MAX_TEXTURE_IMAGE_UNITS查询垫片降为8后用另一程序，重复8复用，恢复16回到第一程序；仅见2个graphics程序。只归一化graphics名字编号后，源码SHA与旧Pixi对应能力完全相同。没有清idHash、重置UID、删除快照、改变筛选或扩大门槛。

**C5额外失败保留**：6×(8,8,16,16)，每次真实lose/restore与像素绘制。新版程序始终2个、同能力两次恢复监听平稳，但8槽监听3→8、16槽4→9；旧版程序增加至31个、监听也增长。新版扩展脚本8/9，旧版3/9。直接sampler group事件持有BindGroup，部分不匹配当前Shader；DefaultBatcher更换DefaultShader是调查线索，尚未逐个完全归因。见 [能力明细（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[采样差别与首败](test-diagnosis.md)。两种监听字段采样在scratch绘制前/后，不能混作同一时刻。该失败不许可为有限缓存。

实际GL报告RTX3070 / ANGLE D3D11 / WebGL2，恢复及像素读回是真实API。8槽是查询模拟，不能声称真实8槽设备或GPU/驱动迁移通过；原生GPU内存、显示帧率和真人体验未测。

## 固定口径三组各60轮

每组独立新Node进程，浏览器串行。离线1280×720 DPR1、repaired夹具、village seed42；三次同动作预热，每轮完整194墙/30相机点、玩家8方向×5帧body/rim、开关门与有限NPC变体；回(17.5,18.6)等1500ms，三次CDP GC间隔200ms，Performance.JSHeapUsedSize，0/30/60快照。旧版恢复组再单独60轮，相同动作与采样；不与历史或其它模式相减。

| 组 | 轮数 | 严格／归属失败 | GPU纹理 | 管理表live/empty | 释放 |
| --- | ---: | ---: | ---: | --- | --- |
| 重挂 | 60 | 0/0 | 661固定 | 723/0固定 | 每轮旧host/scene及5,317标记资源全部收集 |
| 共享往返 | 60 | 0/0 | 661固定 | 727/0固定 | 同上；同一个sharedQuad及buffer0/1/2；停放stage0/ticker停/canvas脱离/events空 |
| 上下文恢复 | 60 | 0/0 | 661固定 | 723/0固定 | 最终重挂后5,317全部收集；每轮丢失期间院子帧仍推进 |
| **旧版恢复负对照** | 60 | **60/60** | 661固定 | live723、empty9→189 | 每轮新增3个旧RT的null，最终重挂清理；不等于189个GPU对象 |

六张表全程精确核对：graphics9、graphicsContext9、glTexture661、tilingSprite2；重挂/恢复glBuffer28、glGeometry14，共享组31/15（模块sharedQuad及3缓冲已使用）。全部empty0。scene纹理589、墙组197/frame4136稳定。快照按构建映射核对：当前host/scene各1，CoastHost/Runtime/View均0，RT形状校验3个，Texture4805、CanvasSource666、Buffer40均不增；数量与逐轮弱身份释放是不同证据。

RT逐键审计：新版60轮旧键移出180、新键移入180、newNulls0；旧版移出0、新null180。见 [新版逐键（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[旧版逐键（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。

| idHash源码键（快照self_size） | 0/30/60键数 | 0/30/60字节 | cache身份 |
| --- | --- | --- | --- |
| 重挂 | 3/3/3 | 9,228固定 | 1193195固定 |
| 共享 | **4/4/4** | **12,520固定** | 1428491固定 |
| 恢复 | 3/3/3 | 9,228固定 | 497839固定 |
| 旧版同会话恢复 | 6/36/66 | 22,236/152,316/282,396 | 1385717固定 |
| Astra原始旧版快照复算 | 6/36/66 | 同上 | **151775**固定 |

别名从HTML唯一标记推导，再与VERIFIED SHA表核对；未知构建、report/build错配和重复标记负对照拒绝。旧别名与Astra记录相同。见 [映射负对照](evidence/build-map-controls.json)、[快照路径摘要](evidence/heap-path-summary.json)。快照字符串预览SHA不是完整shader源文件SHA，图self_size不是GL分配字节。

## 总堆单独判定：PARTIAL

下表MB为十进制1,000,000B，斜率B/轮；完整字节值与60个点见 [summary](evidence/summary.json)。端点为round0→60，均值为6–10→56–60，后30斜率为31–60；这些是观察值，没有“低于4MB即无增长”的签收门槛。

| 组 | 端点MB | 端点差MB | 两段均值MB | 均值差MB | 全段／后30斜率B/轮 |
| --- | --- | ---: | --- | ---: | --- |
| 重挂 | 23.083→25.128 | +2.045 | 24.521→24.429 | −0.092 | +5,139／−3,373 |
| 共享 | 27.272→28.147 | +0.875 | 27.504→27.976 | +0.472 | +14,715／+7,987 |
| 恢复 | 24.848→23.842 | −1.006 | 23.950→23.516 | −0.434 | −12,839／−9,581 |
| 旧版恢复（单独对照） | 23.100→22.828 | −0.272 | 23.350→23.472 | +0.122 | −9,900／−18,878 |

旧版总堆端点下降，但shader字符串仍明确强留存+260,160B，说明下降也不能证明无泄漏。新版重挂/共享快照图self_size分别+1,106,936/+1,782,559B，其中编译代码类+887,164/+1,200,880B、浏览器Performance记录类+60,688/+130,880B；有图强根路径，但不能把类别当排他逐字节归因或自动许可的缓存。其它JS/原生部分、增长边界未完全确认。图retained路径重叠不可求和，也不等于CDP JS堆或GPU内存。恢复组图self_size−264,086B也不改变整体PARTIAL。

原R四个严格失败在新旧版本相同：village-1 GPU增长、context-1 glBuffer空槽、context-2/3 GPU增长。只单列已有身份与持有链的门3source/72frame、玩家8动作变体、sharedQuad/3buffer；其它部分继续未归因。R本次自己的performance.memory短诊断、院子G6的20次重挂，以及上述严格60轮CDP采样全部分开，不替代历史F20。

完整K1→K4旧/新版均2/4：K1遍历/漏墙负对照与K2二十次重挂通过；**K3 glBuffer live28→31**首先超出原+2断言；**K4 glBuffer empty0→3**首先失败，glGeometry同时live15→14/empty0→1。sharedQuad/3buffer已有身份与模块持有链可单列，原断言仍失败。K4 glTexture empty本次旧18、新15（清单历史旧19并非本次值），前置GPU分别407/406、恢复后均408，人物/NPC冷路径相位不完全相同；只有指定三个旧RT键已由逐键/身份对照证明移除，其余空槽不据总数许可或完全归因。见 [有效K明细](evidence/k-final-summary.json)。K4在首个严格失败处中止，原用例后半段重挂释放**未执行**；另由严格60恢复组最终重挂及生命周期结算释放独立覆盖，不能把它们写成K4通过。

完整K2的独立performance.memory短观察：旧34.716→35.760MB（+1.043），新34.097→35.638MB（+1.540）；原院子G6为38.3→38.0MB。均不与CDP三组60轮或彼此相减。首次无初始化K3/K4的0/2保留为INVALID驱动记录，不算资源证据。

## 生命周期与J1

原lifecycle两尺寸各0/4因旧页签入口失败。改真实院门后首次各4/5，资产故障注入目标过期；修正为预载PNG复制边界后，**最终两尺寸各5/5**。原17断言全部保留，新增精确时间/释放与故障消费断言，总50个源码断言。没有用页签测试入口、院子帧循环或修改计时器代替局内暂停。

| 直接Runtime观察 | 1280×720 | 1920×1080 |
| --- | ---: | ---: |
| lost开始/900ms后simulationTime | 0.7461 / 0.7461 | 0.7635 / 0.7635 |
| restored暂停开始/900ms后 | 0.7461 / 0.7461 | 0.7635 / 0.7635 |
| 用户继续约600ms后 | 1.3460，running | 1.3792，running |

player与hp冻结，持有d在恢复/继续后仍被抑制。逻辑时间冻结时Host帧78→228、82→231仍推进，已明确区分循环与逻辑。普通入口另用HUD钟、完整存档字节冻结断言，要求测试全局不存在；结算保存失败保留现场，重试后activeRun=null。真实UI结算释放旧host/Runtime/view及三张RT/source，stage0/ticker停/canvas脱离/Pixi事件空，apps/views0；随后可通过真实院门再出击。资产子项是**预载PNG复制失败**，冷PNG解码故障仍NOT RUN。见 [诊断记录](test-diagnosis.md)。

J1原采样新旧各3次：旧5/6供电步骤通过、新4/6，三次失败均为测量后DOM替换、发送关闭输入之前取不到坐标。保留DOM、动画、trusted触摸和脚本快照后，改为动画等待后同一浏览器执行段重新查询并测量当前节点。设施30帧刷新及其它面板committed刷新均考虑；原67断言、50ms真实触摸与不移动检查保留。最终新旧三组配对均2/2（旧6/6、新6/6），再跑新版不带trace 2/2，未出现已发送真实关闭输入后关闭失败。只签收这次测试采样修正与所执行自动化范围，不宣称消除了所有产品交互风险；首败完整保留。见 [最终重复](evidence/j1-final-summary.json)。

## 回归与交付边界

275单测、frozen install、package、院子76/76、普通入口3/3、城中村51/51通过；hideout8、mobile10、mobile-ux11、desktop-input10、shop-drag21、portable6、title27、save-browser9、systems16均通过。J2/K1/K2 3/3通过（移动边界含漏墙负对照992像素）。原R/K失败与C5残留不藏在“回归全绿”里。真机/真人、真实8槽设备、GPU/驱动原生内存、显示帧率、远端CI、更长循环未测。

见 [按负责人遗留清单](issues.md)、[源码边界](source-review.md)、[首败与修正](test-diagnosis.md)、[独立目视记录](visual-review.md)。原始堆/旧HTML只留本机test-results；提交去字符串的统计、强根路径、原报告/日志、截图与散列。原始输出和Git换行后的字节哈希分列，最终提交绑定由证据索引与父提交固定。

## 复跑与证据绑定

精确命令、执行时段、退出码与每次脚本SHA分别在 [严格60轮（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[回归及首败（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[最终Node24与生命周期/J1（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[完整K顺序（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。预期失败的退出码1保留。最初错误的K3/K4无初始化调用明确标作INVALID，不充当资源失败对照。

执行的临时串行驱动、原脚本及统计脚本原文保存在 [harness（已归档）](../../IMPLEMENTATION-ARCHIVE.md) 和各运行的 `.source.txt`；它们记录执行方法，不改产品。三组60轮用 `node24 --import tsx scripts/station-resource-trend.mjs --mode=<remount|shared|context> --rounds=60 --snapshots --out=<独立目录>`，旧对照另加 `--html=<原Buffer旧HTML>`。J1用 `--only=J1 --input-trace`，K用完整 `--only=K`；lifecycle以BINCOV_LIFECYCLE_OUT分目录、BINCOV_LIFECYCLE_WIDE切换尺寸。所有node24均指本次记录的v24.19.0完整路径。

完整本地原始文件（含12份大堆快照与旧HTML）按 [raw索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md) 核验；提交内复制文件按 [证据索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md) 核验。原始字节与Git文本LF规范化哈希分别列出，PNG始终二进制原样。最终 [构建记录（已归档）](../../IMPLEMENTATION-ARCHIVE.md) 对照基线全哈希相等。

仅在原分支本地提交后停止。未改产品方案或素材，未扩查历史存档异常，未推送、合并、发布或更新试玩站；保留密钥检查和原提交钩子。
