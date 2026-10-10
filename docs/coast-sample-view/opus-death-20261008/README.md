> 合并整理说明：本文结论与历史失败保留，14 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# OPUS-DEATH-01：真实敌人死亡跳过倾倒 · 修复与复验说明（Opus）

2026-10-08（UTC+8）。原分支 `docs/coast-2-5d-art-design`，从 Sol 提交 `81e1bd0` 接手，承接 [Sol 第四轮遗留清单](../sol-round4-20261008/defects.md) 的 OPUS-DEATH-01。

**本轮只修这一项。** 真实敌人被打死时，倾倒动画现在会播放：在视野内的击杀，Sol 与 placeholder 两种素材模式都会先倾倒，再换成尸体；隐藏房间内的击杀不倾倒，也不改变任何像素；楼层切换或读档重建出的旧尸体不会重播倾倒。玩家自身死亡的验证边界见第四节。OPUS-MEM-01、ASTRA-SAVE-01 及其他遗留未处理。没有新增素材，没有推送、合并或发布。

## 基线

| 对象 | 状态 |
| --- | --- |
| main | `841e8bb`，已包含在本分支 |
| PR #22 | OPEN，远端头仍为原 fork 的 `878f563`；本轮只做本地提交 |
| 工作区 | 接手时干净，HEAD 为 `81e1bd0` |
| 环境 | Node 24.19.0、pnpm 11.19.0（Corepack）、Chrome headless 154，Windows 10 |

## 一、原因与修改

**原因（与 Sol 的诊断一致）：** `present()` 先对所有演员调用 `syncActor`，之后才处理事件。死亡帧里演员已是 `alive=false`、`deathT=0`，`syncActor` 因此直接建了尸体；随后 `onEvent(death)` 的「没有尸体才开始倾倒」条件不再成立。第四轮的倒地裁图是手动设置 `deathT` 得到的，没有经过这条真实事件路径。

**修改（`src/coast-view/scene.ts`）：**

- **事件先于同步：** `present()` 在同步演员之前，先从本批事件中取出属于当前地图和当前 epoch 的 `death`，传给 `syncActor`。`onEvent` 中原来那条无效的 `death` 分支已删除。
- **只在可见时倾倒：** 倾倒只在三个条件同时满足时开始：
  1. 该演员上一帧已经以站立状态画出；
  2. 还没有尸体；
  3. 本帧可见。

  不满足时直接换尸体，包括：未揭示房间里的死亡、重建时第一次见到的尸体、旧 epoch 或旧地图的事件。所以倾倒不会泄露隐藏房间，读档或换层也不会重播。
- **展示调整：** 倾倒过程中，脚底向倒地反方向滑移最多 18 世界像素（同时下移 4 像素），使倒下后身体的中心落在尸体图的位置。原先倒地过程从未真正播放过，所以这一跳变一直没有暴露出来，见[第四轮裁图（已归档）](../../IMPLEMENTATION-ARCHIVE.md)：最后一帧尸体相对倒下的身体偏移。时长 0.16 秒、倾角约 72°、倒地时隐藏武器、受击闪白，均保持第四轮的设计。
- 模拟、存档、Runtime 事件、尸体容器位置及拾取逻辑均未改动。敌人身体和尸体在两种素材模式下都是程序绘制（Sol 素材只替换玩家帧和环境），因此两种模式下的敌人走的是同一条路径，差别只在周围的地面与建筑。

## 二、新增门禁（`scripts/coast-sample-test.mjs`，样板从 32 项增至 36 项）

所有死亡都通过 `driver.kill(uid)` 调用 Runtime 自身的 `damageEnemy`。观察方式是：先正常执行 `present`，再读取视图状态。测试不预置 `deathT`，不注入或调整事件顺序，不删除尸体。V03 和 V04 分别在 Sol 与 placeholder 两种模式的独立浏览器上下文中运行，并先断言 `counts().art` 与当前模式一致。站立的固定位置先用一次真实 checkpoint 验证可以存档。

| 门禁 | 断言 |
| --- | --- |
| V03 可见击杀倾倒（城中村街口，持步枪敌人） | 第一个死亡帧必须带有真实 `death` 事件，此时 `deathT>0`，站立身体可见，武器隐藏，没有尸体。随后多帧倾角单调增大，方向与尸体朝向一致，最大倾角≥0.9 rad；`deathT≥0.16` 后只显示尸体。合成画面裁图在倾倒中与死亡帧不同。结束后 checkpoint 仍然成功 |
| V04 隐藏房间 | 门关闭、房间未揭示时击杀：真实 `death` 事件已到达视图，但每一帧都是 `deathT=0`、旋转为 0、身体和尸体都不可见。暂停后的房间区域像素与击杀前相比变化为 **0** |
| V04 揭示（epoch 重建） | 进入房间后看到的尸体直接躺着，不倾倒 |
| V04 楼梯换层 | 楼梯旁可见击杀会倾倒。之后用真实 E 键上楼再下楼：重建后的旧尸体立即显示，`deathT` 始终为 0，批次中也没有 `death` 事件 |
| V04 读档 | 先写 checkpoint，再刷新并进入：事件日志中没有 `death`。三具尸体的 `deathT` 都是 0（`deathT` 一旦开始就不会归零，所以 0 表示从未倾倒），楼梯旁的尸体在屏幕上可见；继续游戏后 15 帧仍无倾倒；checkpoint 成功 |

**阳性对照：** 用 `81e1bd0` 的 `scene.ts` 重建，得到的 HTML 与 `81e1bd0` 已提交的 dist 逐字节相同（SHA-256 `88ca4cf4…`，与 Sol 登记的一致）。在这个构建上运行新门禁，结果为 **0/4**。V03 两种模式都报出与 Sol 相同的诊断：「死亡帧已是尸体，`deathT=0`」。V04 两种模式都在「楼梯旁可见击杀会倾倒」处失败。[旧构建结果](evidence/old-build-gates.json)

## 三、实际结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm test` | 224/224 | [test.log（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| `pnpm package` | 通过；HTML 3,146,669 字节，SHA-256 `6828628e28c006da2c466243e5b9d0c85aa751ed5dc814b0ea658a116eb2e82e`，ZIP 与 release-manifest 一并更新 | [package.log（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 样板全套（正式 dist） | **36/36**，0 页面错误，0 外部请求 | [sample-report.json](evidence/sample-report.json) |
| V03 Sol / placeholder | 倾倒 21 / 25 帧（headless 帧率），尸体交接时 `deathT` 为 0.160 / 0.161 秒，末帧倾角 −1.203 / −1.209 rad | 同上 |
| V04 Sol / placeholder | 隐藏房间 14 帧无倾倒且像素变化 0；揭示、楼梯、读档均无倾倒 | 同上 |
| Sol 自己的 `sol-round4-visual.mjs`（未改） | exit 0；R09 镜像、R10-real-death-sol、R10-real-death-placeholder 全部 passed | [sol-visual.json](evidence/sol-visual.json) |
| 旧构建阳性对照 | 0/4，按预期失败 | [old-build-gates.json](evidence/old-build-gates.json) |
| 普通入口生命周期 1280 / 1920 | 各 4/4（启动三类失败的清理与重试、真实上下文丢失后原 canvas 恢复、结算） | [1280](evidence/lifecycle-1280.json)、[1920](evidence/lifecycle-1920.json) |
| `test:browser` / `test:portable` | 两种尺寸共 24 项通过 / 通过 | [exits.json](evidence/exits.json) |

运行器第一次启动生命周期测试时漏了 `--import tsx`，两次都在加载 TS 源码时以 exit 1 退出，还没有打开浏览器。这是我的执行器问题，不是产品失败。按 [Astra 的命令](../astra-lifecycle-20261008/README.md) 重跑的结果如上表。所有退出码与时间记录在 [exits.json](evidence/exits.json)。

**过程截图（正式 dist、真实击杀）：**

| 内容 | Sol | placeholder |
| --- | --- | --- |
| 倾倒裁图：死亡帧 → 0.04 → 0.08 → 0.12 → 尸体 → 0.3 秒（白色为受击闪白） | [death-fall-sol.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [death-fall-placeholder.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 倾倒中途的整页截图（`deathT≈0.085` 时暂停 ticker 截取） | [death-midfall-sol.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [death-midfall-placeholder.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 隐藏房间击杀后（房间内什么也看不到） | [death-hidden-sol.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [death-hidden-placeholder.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 读档后的暂停画面（旧尸体直接躺着） | [death-reload-sol.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [death-reload-placeholder.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |
| 玩家自身死亡瞬间（第四节） | [player-death-sol.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [player-death-placeholder.png（已归档）](../../IMPLEMENTATION-ARCHIVE.md) |

## 四、敌人与玩家自身死亡的验证边界

- **已验证（敌人）：** 敌人的倾倒与尸体交接、隐藏房间、epoch 重建、楼梯换层、读档，覆盖两种素材模式，全部使用真实 `damageEnemy` 事件，并由门禁 V03/V04 持续守护。敌人四类共用同一套演员代码，本轮实测为持步枪的 `salt`（V03、V04 楼梯旁击杀）和 `scav`（V04 隐藏房间）。
- **观察（玩家），不作为门禁：** 用 [`scripts/opus-player-death-probe.mjs`](../../../scripts/opus-player-death-probe.mjs) 解冻 AI，让 5 名敌人用真实射击打死玩家，不使用伤害驱动。两种模式下，玩家的真实 `death` 事件都启动了同一段倾倒：死亡帧 `deathT>0`，站立身体倾斜约 3°，武器隐藏。但结算在同一帧提交并显示「结算已保存」，宿主随即进入 `exiting`，`frame()` 停止呈现；400 毫秒后切换到结果页。两种模式下，敌人约 1.1 秒打死玩家，之后都**只呈现了 1 帧**（`deathT` 0.0061 / 0.0062）。因此**玩家实际只能看到倾倒的第一帧**，并且被结算面板部分遮挡。[截图（已归档）](../../IMPLEMENTATION-ARCHIVE.md)、[记录](evidence/player-death.json)
- **不扩大结论：** 玩家倒地是否要在结算前完整播放，属于结算与生命周期流程的决定：需要在 `exiting` 期间继续呈现，并保证 Astra 的生命周期与 F20 资源门禁不受影响。这不在 OPUS-DEATH-01 范围内，本轮没有修改，登记为候选 **OPUS-DEATH-02**，待用户或维护者决定是否排期。玩家帧使用 Sol 素材，所以「Sol 玩家帧完整倾倒」目前没有画面验证。

## 五、给 Sol 的定向复验

请在本提交上用正式 `dist/index.html?sample=village` 复验。不需要验图副本，也不需要补图。

1. **基线：** `git status` 干净；`pnpm package` 得到的 HTML SHA-256 应为 `6828628e…`，与 [release-manifest](../../release-manifest.json) 一致。
2. **你自己的工具：** `node scripts/sol-round4-visual.mjs` 应为 exit 0，`R10-real-death-sol` 和 `R10-real-death-placeholder` 均为 passed；时间线中应出现倾斜帧，之后才是尸体。
3. **样板门禁：** `node scripts/coast-sample-test.mjs` 应为 36/36。重点查看 V03/V04 两种模式的 `detail`：
   - `deathFrame.death=true`，`deathFrame.body=true`；
   - 隐藏房间 `changed=0`；
   - `loaded` 中每具尸体 `deathT=0`。
4. **人工查看：** `test-results/coast-sample/death-fall-*.png`、`death-midfall-*.png`。确认：倒下方向与尸体朝向一致；交接时没有明显的横向跳变；倒地时不显示手中武器；`death-hidden-*.png` 的房间内看不到尸体或倒地过程。
5. **阳性对照（可选）：** 把 `81e1bd0` 的 `src/coast-view/scene.ts` 构建到临时 HTML，用 `BINCOV_SAMPLE_HTML` 指向它，V03/V04 应失败。之后恢复源码并重新打包，确认生成物回到 `6828628e…`。
6. **玩家边界（可选，非门禁）：** `node scripts/opus-player-death-probe.mjs`，记录每种模式「死亡后呈现的帧数」。预期为 1 帧（见第四节），不要把它登记为倒地已验收。
7. **回归：** 按你的矩阵复跑原 20 套浏览器回归、生命周期两尺寸和截图。本修改只涉及样板视图，没有改动普通入口、存档或 Runtime。

请按 PASS / FAIL / 未运行 分别登记。OPUS-MEM-01 的 F20 PARTIAL 与 ASTRA-SAVE-01 本轮没有变化，请不要合并进本项结论。

## 停止点

本地提交后停止。没有改动 Runtime、存档格式、素材或 manifest 中的 PNG；没有扩量、推送、合并或发布。没有运行真机、真人试玩或远端 CI。
