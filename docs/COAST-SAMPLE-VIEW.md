# 城中村可玩样板：Pixi 画面接入真实 Runtime

2026-10-08（UTC+8）。承接 [PR #22](https://github.com/xuys2025/escape-bincov/pull/22) 原分支 `docs/coast-2-5d-art-design`，续作本地提交 `4d89f27`（[Runtime 交付](COAST-RUNTIME-SAMPLE.md)）。

**本轮停止点：** 城中村街口、居民楼二楼和地下层的可玩样板已接到真实 Runtime、原会话、存档与事务服务，使用程序占位素材。没有扩展全沿海外观，没有制作素材，没有推送、合并或发布。等待用户确认画面与交接。

## 基线

| 对象 | 状态 |
| --- | --- |
| main | 开工时远端为 `841e8bb`（#25 CI 并行化）。已正常合并进任务分支，合并提交 `a829e9d`；`handoff.md` 冲突按日期保留双方记录 |
| PR #22 | OPEN；远端头仍为 `878f563`。原 fork 无写权限，本轮提交仅在本地，未另开 PR |
| Runtime | `4d89f27` 的规则、存档协议、事务与随机数未改动；仅把宿主包装函数抽出，供 `?test=1` 测试宿主复用（见下） |

## 预览入口

| 入口 | 说明 |
| --- | --- |
| `dist/index.html?sample=village`（或 `start the game.html?sample=village`） | 离线单文件。进入后行动区域默认为「沿海街区 · 居民楼」，出击即进入 Pixi 样板；刷新后点「进入」从最近检查点恢复到样板，先停在暂停面板 |
| `?sample=village&test=1` | 另外暴露 `window.__bincovSample`（摆位、冻结 AI、计数、视图重挂），只用于检查与截图 |
| 不带 `sample` 参数 | 原游戏完全不变：居民楼行动仍由 Phaser RaidScene 运行（W16 实测） |

**操作：**
- WASD 移动，Shift 疾跑；鼠标瞄准，左键单发（按下沿），右键精确瞄准。
- E 交互；撤离点需站稳按住 E 3 秒。
- R 换弹，Q 治疗，1 切主武器，2 切匕首。
- Tab 背包，Esc 暂停，滚轮切换搜刮目标。
- 触屏：左半屏是移动摇杆，右半屏是瞄准摇杆（推到外圈持续开火）；右下按钮为背包、治疗、换弹、交互（按住撤离）。

## 技术方案

- **渲染：** PixiJS 8.22.0（MIT），用仓库现有的 esbuild 打进同一个离线 HTML，没有引入 Vite，也没有第二条构建链。单文件从 2.42 MB 增至 2.95 MB，增量全部是 Pixi 运行时；第三方声明已补入 `THIRD_PARTY_NOTICES.md`。
- **管线：** 沿用原型：
  - 低分辨率世界画布，整数倍最近邻放大加余数线性缩放。
  - 物体按脚底 y 排序；前墙和雨棚用抖动淡化。
  - 屋顶与房间楼板只按 Runtime 给出的 `revealed` 揭示。
  - 地面层乘光照图，直立对象按接地点取光。
  - 逻辑可见但被遮挡的人物显示轮廓。
- **全图地面：** 2304×1664 的地面切成 512px 独立纹理块。每块多画一格外边距，路缘和墙影跨块时不断开。画面外的墙段不渲染，也不参与淡化计算。
- **样板范围：** 城中村街口（34×26 格）有专门装饰：雨棚、空调、雨水管、电线、灯位。其余沿海区域用同一套通用占位管线照常渲染，因为真实行动的出生点和撤离点在全图随机，必须能玩到那里。范围外的地面略压暗，边界画虚线，HUD 显示「样板外（通用占位画面）」。这部分不算全沿海外观交付。
- **宿主：** `src/coast-view/host.ts`：
  - 每个显示帧只调用一次 `runtime.advance(performance.now(), intent)`，再把同一批次交给视图和 HUD。
  - 视图不推进逻辑；HUD 不注册第二套玩法输入。
  - 输入逐项保留原 `PlayerInput` 语义。
- **生命周期：**
  - 挂载时，原 Phaser 主循环 `sleep()`，`#frame` 隐藏，原全局键盘、失焦、缩放和冲突监听在样板运行期间让出。
  - 结算提交后依次执行 `runtime.dispose()`、宿主卸载、唤醒 Phaser，再由原 `changeState('result')` 进入结算页。
  - 卸载会回收监听、ticker、ResizeObserver、RenderTexture、图集与 WebGL 上下文。
  - 新画面启动失败时，清理并回到主菜单，行动保留在存档里。

## 原代码的改动点

| 文件 | 改动 |
| --- | --- |
| `src/coast-view/*`（新增） | 视图、宿主、启动、输入、外观表、占位素材、样式 |
| `src/raid-runtime/host.ts` | 抽出 `wrapCoastRuntime`，生产工厂行为不变 |
| `src/raid-runtime/test-support.ts` | 新增 `createTestCoastHost`：同一端口与服务加测试驱动，仅 `?test=1` |
| `src/app.ts` | `coastSample` 宿主引用 |
| `src/ui.ts` | 出击与恢复两处在样板开关下改挂样板宿主；`enterExternalRun()`；`render()` 在样板运行时不渲染旧 HUD |
| `src/main.ts` | 样板开关时默认居民楼区域；全局键盘/失焦/缩放/冲突处理在样板运行时让出；`beforeunload` 同时写样板检查点 |
| `scripts/build.mjs` | 样式清单加入 `src/coast-view/coast.css` |
| `package.json` / `pnpm-lock.yaml` | `pixi.js` 8.22.0（精确版本） |

源码注释用英文；玩家可见文字只用内嵌字体子集已有的字，所以没有重新生成字体。

## 事务服务的使用方式

| 玩家操作 | 走的服务 |
| --- | --- |
| 开门、换层、拾取地面物资、打开搜刮 | `RaidIntent.interactPressed` → Runtime 内 `activate` |
| 撤离 | `interactHeld` 满 3 秒 → Runtime `finish('extract')`，宿主读取 `services.settlement()` |
| 搜刮拿取/放回 | `services.transferLoot`。宿主按原 `D.fits` 自动找第一个空位或可合并堆叠；每件单独提交 |
| 背包：使用、装备、丢弃 | `services.useSupply` / `equipItem` / `dropItem` |
| 保存失败后重试 | `services.retrySave()`，提交原候选（门、换层）或当前检查点 |
| 结算失败后重试 | `services.retrySettlement()`；可用原 `exportSave()` 导出备份 |
| 放弃行动 | `services.abandon()`，按原规则以失败结算 |

## 实际验证

环境：Windows 10，Node 24.19.0，pnpm 11.19.0（corepack），本机 Chrome。

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | 223 项通过 |
| `pnpm package` | 通过；`dist/index.html` 与 `start the game.html` 3,088,289 字节，SHA-256 `7b2c950c…436e17` |
| `node scripts/coast-sample-test.mjs` | **17/17 通过**，0 页面错误，0 外部请求（[报告](coast-sample-view/report.json)） |
| `node scripts/coast-sample-shots.mjs` | 12 个场景 × 4 种尺寸 = 48 张，0 异常（[截图](coast-sample-view/shots/)） |
| `node scripts/coast-sample-measure.mjs` | 本机测量，见下 |
| 原回归 | 12 套全部通过（browser、desktop-input、save-browser、buildings、mobile、mobile-ux、portable、ui、loot、expansion、qol-expansion、systems），见 [verification.json](coast-sample-view/verification.json) |
| `git diff --check` | 源码、脚本与文档干净；生成的 HTML 中有 PixiJS 自带 GLSL 着色器字符串的尾随空格，属第三方字符串字面量，未改动。重新构建与打包产物逐字节一致 |

### 接线检查（真实 Runtime，经原菜单 → 基地 → 出击流程）

| 编号 | 内容 |
| --- | --- |
| W00 | 样板出击挂载 Pixi 宿主，RaidScene 不启动，世界为 coast-buildings-v1 |
| W01 | 鼠标按住 1.5 秒只射一发（按下沿） |
| W02 | 霰弹一次扳机 = 1 个 shot 批次、6 颗弹丸 |
| W03 | 按住 E 开门只触发一次，事件为 committed |
| W04 | 注入真实存储写入失败：门状态不变、无成功事件、出现重试；恢复后重试提交一次 |
| W05 | Esc 暂停冻结时间；恢复后仍按住的键需松开重按 |
| W06 | 搜刮面板：phase=blocked、时间继续、移动被忽略、拿取 1 件为一次 committed；Tab 关闭 |
| W07 | 画布偏移 (90, 60)、1190×660 时，指针 → 胸口平面 → 逻辑角与独立复算一致 |
| W08 | 未揭示房间里的敌人不显示；揭示后显示 |
| W09 | 上二楼、回一楼、下地下层：提交后 epoch +1、视图重建 |
| W10 | 刷新后从检查点恢复到样板（暂停），位置与地图一致 |
| W11 | 在同一个活 Runtime 上重挂视图 20 次，监听、ticker、应用、画布、纹理计数不变 |
| W12 | 撤离按住 2.4 秒未完成；松开重置；结算写入失败时保留 pending 并给出重试；重试后进入原结算页，所有宿主资源归零 |
| W13 | 第二局经暂停菜单放弃，按原规则以失败结算 |
| W14 | 触屏瞄准摇杆外圈持续开火 |
| W15 | 不带 `test` 的样板入口没有任何测试接口，仍在真实 Runtime 上运行 |
| W16 | 不带 `sample` 的普通入口不变，居民楼仍用 RaidScene |

### 测量（本机桌面 GPU，1280×720，AI 运行、持续点射，约 800 帧）

帧间隔 p50/p95/p99 为 6.0/7.5/8.9 ms，Runtime advance 为 2.3/3.4/3.8 ms，视图 present 与提交为 1.0/1.5/2.0 ms（[measure.json](coast-sample-view/measure.json)）。帧间隔、Runtime advance、视图提交分开统计；不含 GPU 完成时间，也不是手机数据。真实 Runtime 每帧还要生成冻结的完整帧，所以 advance 比原型的 Mock 高。

## 没有完成 / 已知问题

- **背包面板：** 是列表形式（使用、装备、丢弃），没有移植原库存 UI 的格子拖动、旋转、拆分、安全箱转移。
- **搜刮面板：** 只做自动落格到背包和放回，没有指定落格、旋转、拆分，也不能放入安全箱。这些服务 Runtime 已提供，宿主尚未接。
- **地图面板（M）、阅读面板：** 未做，阅读只显示提示文字。
- **HUD：** 是子集，没有电台消息、任务导航、负重。
- **未复现的异常：** 一次四尺寸截图运行中，1280×720 的「样板外」截图出现过「存档保存失败」暂停面板；随后单尺寸逐场景重放与完整 48 张重跑均未复现（每张记录 phase、面板和存储错误，全部正常）。原因未查明，交 Sol 在长时运行中继续观察。
- **未运行或不适用：**
  - `pnpm test:layered-play`：上一轮已知失败，属于原脚本问题，本轮未重跑。
  - F01–F22 中除上表覆盖的部分外：未运行。
  - WebGL 上下文丢失：未实测。
  - 真机、真人辨识：未运行。
- **素材：** 全部是程序占位；Sol 首批试样尚未接入。
