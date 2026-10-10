> 合并整理说明：本文结论与历史失败保留，12 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# Sol 第三轮复验与首批素材返修 · 2026-10-08

从原分支 `docs/coast-2-5d-art-design` 的 `6a7e6b194bc3778e7e009eddf671699b112c3cdb` 接手，初始工作区干净。Node **24.19.0** 下的工程回归、修复版商场三局、新版库存/地图/阅读、限定遮挡检查均通过。首批仍为 **43 PNG**，其中 34 张返修、9 张原样保留。**F20 总堆不增长条件、背向武器显示与下蹲帧尚未签收；历史存档异常不能记作已修复。**

机器登记与 88 份证据哈希见 [verification.json（已归档）](../../IMPLEMENTATION-ARCHIVE.md)，归属见 [Opus / Astra 问题清单](defects.md)，素材见 [assets/README.md](assets/README.md) 与 [manifest](assets/manifest.json)。上一轮 Opus 原文为 [round3/README.md](../round3/README.md)。

## 基线、入口与范围

- 再次 fetch 后，main 为 `841e8bbdfb070eada82537563dd1ab1b4801aea3`，已包含在 `6a7e6b1`。原 [PR #22](https://github.com/xuys2025/escape-bincov/pull/22) 仍开放、未合并，head 仍是原 fork `LMX-323/escape-bincov` 的 `878f5633316a824960091f8f924c0ddd8dd78078`。原文与公开讨论已核对；未查询新的凭据写权限，也未尝试推送。详见 [实时基线证据](evidence/remote-baseline.json)。
- 2026-10-08 12:25（UTC+8）公开 Pages 的 HTML 为 2,416,678 字节，SHA-256 `3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754`，逐字节等于最新 main。**Pages 尚不含本地样板**。
- 本轮被测正式游戏是 `dist/index.html?sample=village`。重新打包的两份 HTML 均为 3,144,063 字节，SHA-256 `b3c859899cbd2a6754528c0b50dd05f4e27395803f6c96adec768e40bc0f62a6`；两份 ZIP 与发布清单也逐字节等于 `6a7e6b1`。
- 返修素材另建在本目录，**没有复制到 `assets/coast/v1`，也没有改 `src/`、前端方案、正式 HTML/ZIP**。为实际检查 PNG，`scripts/sol-round3-preview.mjs` 在忽略目录仅替换正式 HTML 中 34 个 PNG data URL，不改 JS/CSS/逻辑；替换清单和前后哈希见 [variant.json](evidence/art-revised/variant.json)。该副本是验图夹具，不能当作正式接入或发布。
- 独立验图副本在本机 `test-results/sol-round3/art-revised/preview.html?sample=village`。普通入口和 `?art=placeholder` 继续保留。

## 实际验证

环境：Windows 10，i5-12400F / 12 逻辑线程，约 32 GiB RAM，Chrome headless 154.0.8037.98；所有本轮游戏命令均使用 Node 24.19.0，Corepack pnpm 11.19.0。沿用已有依赖，没有新增运行依赖。实际命令、路径、即时退出码和起止时间见 [final-gates](evidence/final-gates.json)、[20项回归](evidence/regressions.json) 与机器登记。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| `pnpm test` | 223/223 | [unit.log（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| `pnpm package` | 通过，正式生成物无差异 | [package.log（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[哈希（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 新版样板接线 | 正式 HTML 27/27；返修 PNG 副本亦 27/27 | [wiring.json](evidence/wiring.json)、[wiring-revised.json](evidence/wiring-revised.json) |
| 原20项浏览器回归 | 全部即时退出码0，未删减断言 | [regressions.json](evidence/regressions.json)、[日志目录（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| Sol 边界 | 7通过、F20部分完成；总退出码 **1** | [sample-boundaries.json](evidence/sample-boundaries.json)、[退出码](evidence/boundaries-exit.json) |
| 同名目标与部分搜刮 | 2/2，选择ID正确、双端回滚及重试守恒 | [target-loot.json](evidence/target-loot.json) |
| 存档驱动跟进 | 3/3，真实检查点可解码，非法副本仍被拒绝 | [save-diagnostic.json](evidence/save-diagnostic.json) |
| 截图与异常诊断 | 正式68张＋返修副本68张；异常/页面错误/外部请求/存档错误均0 | [正式索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[返修索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 商场原三局脚本 | 通过，含完整600秒正常行动 | [layered-play-report.json](evidence/layered-play-report.json) |
| 未揭示房间 | V01四条件零像素差，阳性对照16像素 | [wiring.json 的V01](evidence/wiring.json) |
| 前墙/关门遮挡 | 每个版本8/8，实像素遮挡与阳性对照均有效 | [正式](evidence/occlusion.json)、[返修PNG副本](evidence/occlusion-revised.json) |
| F20实例检查 | 30轮，显式资源每轮归零，受跟踪实例不累积；**不等于总堆不增长** | [heap-report.json](evidence/heap-report.json) |
| 素材 | 43/43，25玩家帧互异 | [validation.json](assets/validation.json) |

20项为 browser、desktop-input、save-browser、buildings、mobile、mobile-ux、portable、ui、loot、expansion、qol-expansion、systems、art、tactical、title、title-water、mall-passages、mall-landing、qol、loot-target。新增源码没有由 Sol 代改；本轮测试的是 Opus 的 `6a7e6b1`。

格子库存选择器现为先点选 `[data-panel] [data-grid="bag"] .item[data-uid]`，再点 `inv-drop`。F14 的真实写入失败保留背包、地面和存档原字节；F16 在背包/搜刮两类格子面板上，分别检查 blur、pagehide、hidden，恢复后仍需松开并重按移动键。U01–U06 原生操作覆盖拖放预览、旋转、拆分5/24、安全箱互转、失败回滚和精确落格；U07–U09 覆盖地图楼层/撤离指引、阅读与 HUD。

截图人工复核发现 **640×300 地图文字重叠**：上方房名与撤离点标注挤在一起。U07的功能断言不覆盖文字可读性，因此单列为 Opus 的 UI 问题，未代改布局。[原尺寸证据（已归档）](../../IMPLEMENTATION-ARCHIVE.md)

## 商场脚本与存档诊断

继续使用上一轮修复的 `canvas-click.mjs`：实际 DOM 命中画布后才发原生点击，不改变世界、AI、导航或时钟。仍保留三局与至少一局正常600秒超时断言。结果分别为：超时 **600.427秒**、死亡 **61.472秒**、撤离 **29.555秒**；37次画布点击、44次HUD遮挡跳过，0页面错误/外部请求。不是真人平衡或独立性能证据。

截图脚本继续保留 Console、最后5条拒绝、`storageOK/storageError`、真实 `Storage.setItem` 的大小/结果/异常，以及存档校验 Error 的消息和调用栈。布尔等待修正没有删除这些诊断；不记录存档正文。两套136张均正常，不能由此断言历史偶发问题已修复。

针对 Opus 的新线索，又分别用修正后的 carbine/shotgun 驱动等候超过2秒，真实检查点弹匣为 **12/2**，保存成功且可解码；真实 `kill` 后已死人数与 `kills=1` 一致。只在 Node 内改变副本的容量或击杀数时，解码器正确拒绝。它证明修正后的测试契约成立，**没有证明当时「样板外」异常就是这两个驱动造成**；当时截图未调用它们。Astra仍承接历史根因，Opus保留宿主诊断。

## 遮挡与内存的精确结论

V01使用真实Runtime击杀，冻结模拟时间、相同相机和批次，移除屋顶/天花板。门关闭、开后重关、视图重建、切层返回四条件的改变像素均0，强制显示贴花的阳性对照为16；揭示后尸体显示、被扣留特效数归零。独立的合约探针亦通过隐藏对象、来源stamp拒绝和range无火花检查。[visibility-probe.json](evidence/visibility-probe.json)

前墙探针只使用独立视图批次，不写存档。对正门旁外墙和关闭门分别检查0/1/2/3档淡化，用各自实际纹理Alpha判断：**不透明像素改变数全为0**，抖动空洞可显露；去除同一遮挡物后，子弹阳性对照均12像素，且每档确实覆盖到不透明像素。正式版与返修PNG副本各8项通过。这是代表性墙/关门的检查，未扩大为全部材质、屋顶、窗洞和所有过渡画面已验收。初版选中了画面外的墙，阳性对照正确失败；已改为正门邻墙并补非空覆盖断言，初版记录留作工具诊断。[初版夹具记录](evidence/occlusion-first-fixture.json)

F20所有相关等待现返回原始布尔值，不再把 PublishedView 对象作为未释放的JSHandle保留：

- 正式打包版20次完整出击→换层→返回→撤离/放弃→基地：apps/views/listeners/tickers/timers/observers/renderTextures等每轮为0；第6–10轮均值与末5轮相比仍增加 **547,495字节**，该严格条件保留 `partial` 和退出码1。
- 同源未压缩构建30轮、快照第10/30轮：宿主、Runtime、Pixi应用/渲染器、纹理/精灵/画布等受跟踪构造器无增加，专用脚本退出0。总堆相同统计仍增加 **697,503字节**；保留self size约 **25,377字节/轮**，不能把实例门禁的PASS当作总堆门禁PASS。
- 独立对两快照node id比较，新增并仍存活的shader-name字符串为 **40份/107,040字节**，即 **5,352字节/挂载**；对应 `graphics-vertex-N`、`big-triangle-vertex-N`，与 Opus 的 Pixi全局名称缓存定位一致。详情与快照哈希见 [shader-cache.json](evidence/shader-cache.json)。其余保留量含编译/JIT等，未逐字节穷尽归因。
- 本轮不改Pixi库、不复用Application、不改变卸载即销毁上下文的方案。是否处置这个小而持续的缓存增长交Opus/维护者；Astra协助逻辑引用复核。原始约38MB的两份快照留在本机 `test-results/sol-round3/heap-final/`，未纳入Git。

早期PowerShell包装在读取退出码前执行了版本查询，会覆盖 `LASTEXITCODE`。该初版 `suite-exits.json` 没被用作退出码证据。最终功能/目标/F20门禁用Node `spawnSync.status`，边界已重跑并即时捕获1，20项回归均即时捕获结果；报告没有用包装错误把部分完成写成通过。

## ART-R01–R10返修

详细规格、每件源图/提示词/裁切/锚点/哈希/旧哈希在 [manifest](assets/manifest.json)。仅3次内置image_gen编辑原有板，随后用可复建的最近邻切分、限色与二值Alpha整理，未调用另一个付费API。PNG保留原v1 ID/文件名以匹配Opus导入契约，`revision=2`与SHA区别新版。

| 项 | 交付与实际结论 |
| --- | --- |
| R01 | core去掉烘焙外框/内框，双向对边连续；外缘仍由原4边条提供 |
| R02 | 外墙a/b去掉深竖缝，裂纹改为错位污渍，共享边剖面；没有新增c |
| R03 | 内墙去掉成对箭头状标记，保留18px裙墙 |
| R04 | 窗下带改灰绿低饱和；窗、玻璃和栏杆仍保留 |
| R05 | 院地亮像素（亮度≥120）由15/32降为0/0，对比标准差由10.97/14.14降为7.97/7.80 |
| R06 | 瓷砖a/b平均亮度降为105.18/104.27，差0.92；原15/31行列接缝保留 |
| R07 | 全25帧去掉烘焙手与下垂前臂；仍由独立卡宾枪提供手套。[八方向实机裁图（已归档）](../../IMPLEMENTATION-ARCHIVE.md)已检查 |
| R08 | manifest给出N/NE/NW可隐藏视觉武器的接入建议；**现有宿主未读取，实机背向枪管仍未修复**，交Opus按原方案承接 |
| R09 | 保留既有W/SW/NW镜像，源图改弱方向性环境明暗；未扩方向，最终光照偏好仍交Opus确认 |
| R10 | **仍无下蹲帧**。43件与25帧上限内新增帧会破坏现有idle+4walk契约；不擅自替换步行帧、不用压扁站立帧冒充完成，交维护者决定下一步 |

已查看新版 [立面（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[室内（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[街口（已归档）](../../IMPLEMENTATION-ARCHIVE.md) 与八方向持枪裁图，并保留同机位占位路径对照。新版PNG副本27项功能、68张截图和代表性遮挡通过；这不消除R08/R10，也不等于全部美术最终签收。

## 交接停止点

交付首批返修PNG/manifest、真实报告、归属清单、诊断与可复跑工具后停止。等待Opus接入替换PNG，处理背向武器、下蹲范围决定与短屏地图文字，复核整体画面；Astra继续历史存档线索和必要逻辑审阅。没有扩量、代改前端方案、推送、合并或发布。

未运行真机、真人G12、WebGL上下文丢失、当前本地提交的远端CI；手机截图属于浏览器尺寸/DPR模拟。并行运行的验证不用于发布独立性能结论。
