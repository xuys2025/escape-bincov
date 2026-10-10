> 合并整理说明：本文结论与历史失败保留，15 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# OPUS-DEATH-01 · Sol 定向签收 · 2026-10-08

从原分支 `docs/coast-2-5d-art-design` 的 `bf099cc9a2f3aef86c7b45feea357d8ce940cbbb` 接手，初始工作区干净。已阅读 [Opus 修复与复验说明](../opus-death-20261008/README.md)及 [Astra 生命周期标准](../astra-lifecycle-20261008/README.md)。

**OPUS-DEATH-01 在本机敌人路径范围内签收 PASS；生命周期保护 PASS。玩家完整倒地不在本次签收范围，OPUS-DEATH-02 继续待排期。F20 PARTIAL、ASTRA-SAVE-01 UNCONFIRMED 均保留。**

[机器登记与证据哈希（已归档）](../../IMPLEMENTATION-ARCHIVE.md)记录 63 份交付证据、即时退出码与运行时间。没有修改生产源码、前端方案、原测试断言、运行素材或正式制品。

## 基线与执行方法

- fetch 后 `origin/main=841e8bbdfb070eada82537563dd1ab1b4801aea3`，原 PR #22 仍 OPEN、未合并，fork 头 `878f5633316a824960091f8f924c0ddd8dd78078`；已读取最新正文、评论、review 与检查记录。[实时核对](evidence/baseline.json)
- 核对时 Pages 逐字节等于最新 main，SHA-256 `3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754`，仍不含本地样板；本轮签收的是正式本地 `dist/index.html?sample=village`。
- Node **24.19.0**、pnpm **11.19.0**（Corepack）、Chrome headless **154.0.8037.98**，Windows 10.0.19045，i5-12400F、12逻辑线程、约32GiB内存。
- `pnpm package` 重建的两份 HTML 均为 **3,146,669 字节**，SHA-256 **`6828628e28c006da2c466243e5b9d0c85aa751ed5dc814b0ea658a116eb2e82e`**；HTML、两个 ZIP、release-manifest 均与 bf099cc 逐字节一致。[制品及脚本核对](evidence/artifacts.json)
- 原 `sol-round4-visual.mjs`、36项 `coast-sample-test.mjs`、加强版生命周期脚本均未改。真实死亡检查先单独完成，再并行运行既有回归；并行结果只用于功能检查，不作帧率或内存性能结论。[可复跑执行器（已归档）](../../IMPLEMENTATION-ARCHIVE.md)
- 死亡检查固定 seed42，使用既有摆位/冻结AI夹具，由 `driver.kill(uid)` 调用 Runtime 自身的 `damageEnemy`，观察在原 `present` 执行后进行。没有预置 deathT、注入/重排死亡事件或删除尸体。敌人身体/尸体在两种素材模式中都为程序绘制；两模式分别实际执行，不据此签收 Sol 玩家帧。

## 实际执行结果

| 检查 | 本轮结果 | 证据 |
| --- | --- | --- |
| 单元与正式打包 | 224/224、package exit0，制品不变 | [执行](evidence/core.json)、[test（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[package（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| Sol 原真实死亡检查 | exit0，R09镜像及R10两模式全部 passed，0页面错误/外部请求 | [visual.json](evidence/visual/visual.json)、[退出码](evidence/target.json) |
| 正式样板门禁 | **36/36**，0页面错误、0外部请求 | [完整结果](evidence/sample/report.json) |
| 普通入口生命周期 | 1280×720、1920×1080，各 **4/4** | [1280](evidence/lifecycle-1280/lifecycle.json)、[1920](evidence/lifecycle-1920/lifecycle.json) |
| 原浏览器回归20套 | 全部即时exit0，原脚本/循环/断言未改 | [visual](evidence/visual.json)、[inventory](evidence/inventory.json)、[world](evidence/world.json)、[input](evidence/input.json) |
| 截图与存档诊断 | 17场景×4尺寸=68张，异常/页面错误/外部请求均0 | [完整索引（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[退出码](evidence/shots.json) |

原20套为 ui、tactical、art、title、title-water、save-browser、expansion、qol-expansion、loot、loot-target、qol、portable、buildings、systems、mall-passages、mall-landing、browser、desktop-input、mobile、mobile-ux。执行日志逐项交付，没有把历史执行当成本轮通过。

## 两模式的倾倒、交接与信息边界

| 当前门禁 | Sol | placeholder |
| --- | --- | --- |
| V03 第一死亡帧 | 真实death事件、deathT=0.0061、身体可见、武器隐藏、无尸体 | 同左 |
| V03 倾倒 | 23帧，倾角单调增加，末帧约−1.243rad | 25帧，末帧约−1.244rad |
| V03 尸体交接 | deathT≈0.16510秒后仅尸体 | deathT≈0.16530秒后仅尸体 |
| V04 未揭示房间 | 14帧不倾倒、身体/尸体不可见，区域变化 **0像素** | 15帧，区域变化 **0像素** |
| V04 揭示 / 原生E上楼下楼 | epoch重建直接尸体；回层13帧deathT=0、无death事件 | 回层12帧，同样不重播 |
| V04 checkpoint刷新读档 | 三具尸体deathT=0、rotation=0、身体隐藏；楼梯旁尸体可见，继续15帧仍不倾倒 | 同左 |

两模式在可见击杀前后、换层/读档后真实 checkpoint 均成功。V04 的零泄露来自暂停后的同区域像素对比及逐帧状态断言，不只凭截图判断；读档不重播同时依靠事件日志为空及 deathT=0。

已目视查看本轮8张原始截图：[倾倒Sol（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[倾倒placeholder（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[中途Sol（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[中途placeholder（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[隐藏Sol（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[隐藏placeholder（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[读档Sol（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[读档placeholder（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。倾倒方向与尸体朝向一致，中途不显示手持武器，所查时间线交接没有明显横向跳变。隐藏截图中街道上的既有尸体来自先前公开击杀，不是隐藏房间目标。[目视记录与限制](evidence/manual-review.json)

实测敌人为 salt / scav，其他敌人共用演员代码但未逐种逐角度审美签收。Sol 原工具的独立时间线也出现倾斜帧后再换尸体：[Sol（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[placeholder（已归档）](../../IMPLEMENTATION-ARCHIVE.md)。没有重新生成图片或扩量。

## 生命周期与保留事项

普通正式入口在两个尺寸均没有产品test接口。素材解码、视图构造、observer挂载三类启动失败清理后可同页恢复同一runId。真实 WEBGL_lose_context 下 Esc/DOM继续无效、持续移动键不能推进存档；恢复原canvas后再持键2.3秒仍暂停，须主动继续。结算写入失败保留场景与原存档，成功重试后卸载、下一局可挂载。故障注入预期异常栈原样保留，正常上下文/结算场景错误为空。生命周期 PASS 不代表 F20 总堆或真机GPU签收。

| 归属 / ID | 本轮状态与边界 |
| --- | --- |
| Opus · OPUS-DEATH-01 | **本机限定PASS，敌人路径签收**：真实可见击杀倾倒、尸体交接、隐藏零泄露、epoch/楼梯/读档不重播，两模式均通过 |
| Opus · OPUS-DEATH-02 | **待排期，未实施，未签收**：玩家自身终局完整倒地不在本次范围。本轮未运行可选玩家探针；Opus前轮“仅呈现首帧便进入结算”的观察仍保留，不改结算/exiting前端方案 |
| Opus / Astra · OPUS-MEM-01、ASTRA-MEM-ATTRIBUTION | **F20 PARTIAL 不变**：本轮未重采样。保留[上一轮](../sol-round4-20261008/README.md)严格结果页+379,727.2B、基地三次GC完整A/B+317,704.0/+332,122.4B、普通对照+328,469.6B各自口径与未归因增长，未改阈值、不宣称总体有界 |
| Astra · ASTRA-SAVE-01 | **UNCONFIRMED 不变**：历史原始候选/写入返回/异常栈缺失。当前checkpoint、原save-browser及截图无异常不能关闭历史问题；原分类诊断档案保留 |

本轮未重跑旧构建阳性对照、完整F20/堆快照、可选玩家探针、十分钟自然战斗、真机、真人或当前本地提交远端CI。没有用未运行替代通过。68张全量截图留本机忽略目录，本次提升死亡相关截图、两尺寸生命周期截图和街口代表图作为交付证据。

一次制品/源码字节检查因Windows生命周期脚本CRLF与Git LF不同而退出1，正式制品当时均已匹配；改用源码LF归一比对后通过，未改脚本或断言。[工具记录](evidence/harness-notes.json) 此为核对工具口径问题，不是产品或测试运行失败。

完成签收报告、证据和本地提交后停止。不扩量、不修改前端方案、不推送、不合并、不发布。
