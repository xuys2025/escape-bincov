# 水产站院子 · 正式整合与接线说明

日期：2026-10-10（UTC+8）。工作树 `D:/bincov/hideout-runtime`，分支 `agent/hideout-runtime`，基线 `81fbb8a`（Astra 的真实 Runtime 交付，已含城中村与商店修复）。本轮把原型 `D:/bincov/前端原型-水产站-20261009` 的院子迁进游戏，接上真实 Runtime，换上 Sol 的正式图片。只在本地提交，不推送、不合并、不更新试玩站。

验收：[Sol 独立验收清单](SOL-ACCEPTANCE.md)。实际运行结果：[验证记录](VALIDATION.md)。第二轮（手机菜单遮挡、墙面逐格明暗）的修复与 Sol 定向复验清单见 [opus-round2-20261010](opus-round2-20261010/README.md)。第三轮（上下文恢复后旧 RT 的管理表空槽、ASTRA-R3-PIXI-01 graphics 程序重编）的修复与 Sol 独立复验清单见 [opus-resource-r3-20261010](opus-resource-r3-20261010/README.md)。

## 玩家看到的变化

| 场景 | 现在 |
| --- | --- |
| 标题“进入” | 直接进院子（雨夜，院门前）。进入时 Runtime 受控升级存档、启用成长系统，旧档的钱、物品、任务、统计、设置都保留。有进行中的行动时仍走原来的恢复入口。 |
| 院子里 | 走动、点地寻路、点房顶进屋；老栓（修理铺）、许医生（卫生所）、小蔡（电台任务）、炊事员、发电机、五种设施、寻人板、院门（出击）。快捷栏 1–7 / Tab / J / C / G 任何地方直接开面板。 |
| 旧页签 | 作为快捷备用入口保留：院子快捷栏“页签”或按 0、菜单“切换到旧版页签”；页签界面原来的“走进水产站”改为“回到院子”。院子画面启动失败（例如没有 WebGL）时也自动落到页签界面。 |
| 出击 | 院门“出击”面板选区域和种子，Runtime 先写入行动，院门动画后进局内：普通入口是原 Phaser 局内；`?sample=village` 且选沿海街区时进 Pixi 城中村样板。 |
| 回站 | 结算写入后在结果页点“返回”：从院门外走进来，自动打开行动报告；报告只播一次。 |
| 存档失败 | 交易被撤销，弹“存档没有写入”对话框（重试保存 / 导出存档）；另一个窗口接管时只能导出和刷新。 |
| 画面 | 固定雨夜；设施沿用原型布局；昼夜变化留下一轮。 |

## 代码在哪里

| 文件 | 作用 |
| --- | --- |
| `src/station-view/route.ts` | 院子与游戏其余部分的接口：进入、回站、出击后交棒、切旧页签、回标题、导出、导入后去向、Pixi 应用的接管与停放、失败回退。只有它在应用的静态引用图里，院子画面、图片和样式按需加载，Node 单测不会碰到它们。 |
| `src/station-view/host.ts` | 院子运行循环：输入、移动与碰撞、NPC、交互、镜头、通电 / 出门 / 回站三段动画；每帧 `tick`、活动开关、位置训练采样；订阅 Runtime 事件。 |
| `src/station-view/ui.ts`、`panels.ts`、`grid.ts` | 面板（整备、两家商店、任务、发电机、设施、身体、出击、菜单、报告）和存档 / 出售确认 / 导入对话框；网格拖放。全部在 Shadow DOM 里，和游戏原样式互不影响。 |
| `src/station-view/scene.ts`、`lighting.ts`、`atmos.ts`、`art/*` | 原型的 Pixi 场景：程序画地面墙屋顶、雨、光照、Sol 图片接入。 |
| `src/station-view/assets.ts` | 由 `node scripts/station-assets.mjs` 按 `assets/station/manifest.json` 生成；`scripts/build.mjs` 每次构建核对 33 张 PNG 的哈希、尺寸和引用清单。 |
| `src/ui.ts`、`src/main.ts`、`src/app.ts` | 标题“进入”、结果页“返回”、页签“回到院子”改走院子；`app.station` 存在时旧界面清空、Phaser 循环休眠、键盘交给院子；隐藏 / 离开页面时先写入。 |
| `src/coast-view/host.ts` | `takeApp` / `parkApp` 导出，院子与城中村轮流用同一个 Pixi 应用。 |
| `src/audio.ts` | 新增 `bus()`，院子的雨声、发电机、电台、脚步走游戏原有的音频上下文和总音量。 |

## 怎么接的 Runtime

全部调用 `src/app.ts` 导出的那一个 `hideoutRuntime`，没有新建 SaveSession、Mock、第二个 WebGL 应用，也没有自建状态。

| 时机 | 调用 |
| --- | --- |
| 标题“进入”、页签“回到院子” | `enter()`，成功后挂院子；随后 `claimRelief()`（原来进站就会发救济，没变化时 Runtime 不写入）。 |
| 结果页“返回” | `returnToBase()` → `consumeArrival()` 一次，用这份数据播走进院门和报告。失败时提示并退回页签界面。 |
| 每帧 | `tick(Date.now())`（Runtime 自己五秒存一次）；读 `snapshot()`。 |
| 能自由走动时 | `setActivity(true)`；打开面板、动画、页面隐藏、失焦、上下文丢失时 `setActivity(false)`，只在状态变化时调用。 |
| 走动 | `practice({ from, to, seconds, now })`：上一帧和这一帧的世界坐标、帧时长、`Date.now()`。快走 112×1.45 px/s，低于 168 px/s 上限。训练区是否有效由 Runtime 判断，院子只用同一套 `validPractice` 做显示插值，存档前不算成长。 |
| 整备 | `placementError` 预览，`move` / `quickMove` / `split` / `secure` / `equip` / `unequip` / `useSupply` / `equipCharm` / `unequipCharm` / `upgradeStash` / `claimRelief`。 |
| 商店 | `openShop`，拖放用 `place`，结算 `settle()`；返回 `confirmation.kind === 'quest-sale'` 时弹确认，确认后 `settle(token)`。离开有东西的购物车要先结算或清空。 |
| 任务、设施、生产、训练项目 | `submitQuest`、`facility`、`build`、`enqueue`、`cancel`、`claim`、`selectPractice`。 |
| 出击 | `deploy({ world, seed })`；空种子在 `?sample=village` + 沿海街区时用现有 `villageSeed()` 取值后传入。院门动画 2.6 秒后卸载院子，`startPreparedHideoutRaid(runId)`。 |
| 切旧页签 | `flush()` 成功才切；失败留在院子并打开存档对话框。 |
| 回标题 | `backToMenu()` 成功后卸载院子。 |
| 存档对话框 | `retrySave()`、`exportBackup()`（下载文件名与旧页签相同格式）；导入走 `previewImport` → 确认 → `importBackup(text, token)`，备份里有进行中的行动时回标题恢复。 |
| 音量 | `setVolume(v)` 成功后用存档里的值设 SynthAudio。 |
| 事件 | `committed` 刷新面板；`power-restored` 播通电序列；`facility-built` 重建碰撞；`production-complete`、`practice-credited` 提示；`save-failed` 打开存档对话框。回调里只读，不发起新交易。 |
| 离开页面 | `pagehide` / 隐藏 / 失焦 / `beforeunload` 时 `flush()`（出门动画中不写，行动已经在 `deploy` 时写好）。 |

## 宿主切换与资源

- 挂院子：先设 `app.station`，停掉所有 Phaser 场景并让循环休眠，`#frame` 隐藏；Shadow DOM 根节点 `#station-yard` 放画布和界面；从停放处取 Pixi 应用（`takeApp`）。
- 卸院子：取消订阅和所有监听（`Scope`），释放场景的纹理、渲染目标和容器、灯光烘焙图、雨雾纹理、音频循环；清掉画布行内样式后 `parkApp`；唤醒 Phaser 循环。
- 城中村样板拿到的是同一个应用；院子 → 局内 → 结果页 → 院子，应用数、停放数、监听数回到原值。
- 20 次重挂：本轮受跟踪的监听、ticker、视图、应用、GPU 纹理和 Pixi 管理表空槽回到对照值。Opus 验证记录 G6 的强制回收后总堆为 30.1 → 32.5 MB（+2.4 MB）；另一轮 −0.3 MB，不能据此称“堆不增长”。低于 4 MB 只是原短测门槛，资源释放与总堆必须分别报告；历史 F20 仍为 PARTIAL。独立复验见 [Sol 报告](sol-acceptance-20261010/README.md)。
- WebGL 上下文丢失时停止绘制但循环继续，恢复后重设尺寸继续画；启动失败退回页签界面，存档不动。
- 院子只接受 WebGL 渲染器。没有 WebGL 时 Pixi 会自动改用 Canvas 2D，那样发光层的叠加混合失效、人物变成黑色剪影，所以这种情况也按启动失败处理，退回页签界面。

## 图片（Sol R1 + R1.1）

`assets/station/v1/` 共 33 张：R1 的 29 张原样，许医生正面待机 / 说话四帧按 `delivery-r1.1` 的 manifest 替换（哈希逐张核对，`release: R1.1`）。按尺寸接入，尺寸不符的会被退回并记录，不拉伸；本轮 0 张退回。

在场景里检查过的结论见 [验证记录](VALIDATION.md#素材检查)：四个角色跨动作一致、脚底在 47 像素基线、柜台和桌子后能正确遮挡、发光随供电变化。发现并修复一处遮挡问题：发光层原来画在所有人物之上，小蔡转身时电台屏幕的绿光会盖在脸上。现在墙、设施和灯的发光与人物剪影按前后顺序画到单独的图层，站在亮处前面的人会挡住光。

## 本轮修复与改动（相对原型第三轮）

- 保留并回归：F03 寻路卡死与绕杆停住、F02 窄屏通电裁切、旧页签快捷入口、F01 侧门、F04 手机面板。
- 新发现并修复：发光遮挡（上一节）；1280×720 下升级后的仓库加说话行会让修理铺面板多出 40 像素，现在桌面面板按实际高度自动缩小格子直到不滚动；进入院子时旧页签界面会在隐藏的 `#ui` 里先画一次，现在挂院子前就清空。没有 WebGL 时 Pixi 自动改用 Canvas 2D，院子人物会变黑影，现在按启动失败退回页签。
- 字库：院子里的“院”“寻”“炊事员”等 67 个字原来不在子集里，按 `assets/fonts/README.md` 用固定上游字体与 fonttools 4.61.1 重新生成子集（上游哈希一致）。子集只按源码收字，旧子集里 3 个源码已不用的字（们、岸、穿）随之移出。
- 旧测试：用 `?test=1` 的旧浏览器测试加 `&entry=tabs`（只在测试接口下生效的夹具，进入时仍是旧页签界面）；不带测试接口、检查普通入口的几处改为像玩家一样经过院子（`scripts/yard-entry.mjs`）。

## 交回 Astra（逻辑）

1. `HideoutSnapshot` 没有已佩戴护符。院子暂时只读 `app.expansion.charm` 显示“护符 · 名称 / 取下”。请在快照里加字段。
2. `useSupply` 被拒时只有通用文案“操作未完成，请检查条件后重试。”（例如吃饱了再吃罐头）。希望区分原因。
3. 进站发救济：原来 `changeState('hideout')` 会调用 `grantRelief`，`enter()` 不会。院子进入后调用 `claimRelief()` 保持原行为，请确认是否并入 `enter()`。
4. 训练显示：快照只给已保存秒数和 `storage.pendingBase` 布尔值，院子用 `validPractice` 在本地插值未保存的秒数。若 Runtime 能给出待保存秒数会更准。
5. `day = runs + 1` 在院子 HUD 显示为“第 N 天”。若这不该叫“天”，请给文案。旧页签“值守记录 · 第 17 天”仍是写死的。
6. 旧 `BaseScene`（原“走进水产站”）在普通入口已不可达，只在 `?test=1&entry=tabs` 夹具里保留。是否删除请决定。

## 交回 Sol（图片）

1. 交付只有正面待机 / 说话、背面工作；角色向左右转身时用正面帧代替，看着一致但从不侧身。若要侧身或背面待机请补帧（命名见规格）。
2. 老栓正面待机两帧的脸和外套噪点明显多于他的说话帧和背面帧，同一人跨动作略不一致。
3. 黑市船商、院里走动和坐着的居民、屋顶、墙、床铺等仍是程序画的占位。

## 已知问题与未测

- 墙面、屋顶按格子取光，通电后 1920×1080 下能看出格子状的明暗块（原型就有，本轮未改）。第二轮已改为墙块内分小格平滑取光，见 [opus-round2-20261010](opus-round2-20261010/README.md)，待 Sol 复验。
- 手机只在 Chromium 模拟视口和触屏下测过，没有真机；没有真人试玩。
- 没有跑远端 CI；F20 长循环与原生内存未重测，历史 PARTIAL 结论不变。
- 昼夜、黑市货单、对白数据化不在本轮。

## 怎么试玩

打开仓库根目录的 `start the game.html`（或解压 `release/Escape-Bincov-portable.zip`），点“进入”。想试城中村样板，在地址后加 `?sample=village`，在院门“出击”面板选“沿海街区”。
