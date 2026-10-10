# 给 Sol 的独立复验清单 · 上下文恢复的两项资源问题

只复验本轮两项修复及它们碰到的地方：旧 worldRT/lightRT/glowRT 的管理表空槽，ASTRA-R3-PIXI-01（恢复时重编 graphics 程序、源码被全局缓存永久持有）。修复说明与实际结果见 [README](README.md)。两项分别签收，与总堆结论分开；总堆未归因部分仍按 PARTIAL，ASTRA-SAVE-01 仍 UNCONFIRMED。请记录实际提交号、Node/pnpm/Chrome 版本、HTML/ZIP 哈希，每组独立新进程、浏览器串行。

## 0. 基线

- [ ] `git log --oneline -3`：最新是本轮修复提交，父提交 `7a4dc75`；`git status` 干净。
- [ ] Node 24.19.0 + pnpm 11.19.0：`pnpm install --frozen-lockfile`、`pnpm test`（含新增 `tests/renderer-lifetime.test.ts`）、`pnpm package` 通过，打包后工作区仍干净；`dist/index.html` 与 `start the game.html` 字节相同，sha256 与 README 一致。
- [ ] 另存修复前构建作对照：`git show 7a4dc75:dist/index.html > <目录外>/prefix-ce732ff6.html`，sha256 应为 `ce732ff66cc80c5da1b5a041eec16d16438ad977f3f52c706a18a771159a6a62`。

## 1. 代码边界（读源码核对）

- [ ] 改动只在 `src/coast-view/renderer-lifetime.ts`（新）、`src/coast-view/host.ts`（一行副作用导入）、`src/station-view/scene.ts`（`releaseTargets`）。没有改 Runtime、SaveSession、接口、素材、院子画面方案；没有改 `node_modules` 里的 Pixi，也没有在打包 HTML 里按混淆名打补丁。
- [ ] graphics 适配器经 Pixi 公开的 `extensions.remove(GlGraphicsAdaptor)` / `extensions.add(...)` 替换，名字和类型与原适配器相同，在第一次 `Application.init` 之前注册。程序按 `renderer.limits.maxBatchableTextures` 每种取值编译一次，用的是与 Pixi 原适配器相同的 bits 和名字；Shader 与 localUniforms 仍每次 contextChange 新建，被替换的 Shader `destroy(false)`（不销毁共享程序）；适配器 `destroy()` 同样不销毁程序。
- [ ] 没有清空 `createIdFromString` 的 idHash、没有重置 uid/名字计数，也没有重建 Application 来掩盖增长。
- [ ] `releaseManagedSlots` 只删除指定表（`glTexture`）里、指定 uid、且值为 `null` 的键；活条目、其他空槽、其他表不动；GC 正在遍历（`_running`）时跳过。只在院子 `resize()`/`destroy()` 销毁旧三张 RT 之后调用，uid 在销毁前取得。模块级 sharedQuad（几何 uid0、缓冲 uid0/1/2）不经过这里。

## 2. 旧 RT 空槽（单独签收）

- [ ] `node scripts/station-context-program.mjs --out=<新目录>`：S1（4 次丢失/恢复）每轮旧三张 RT 的 uid 不在 `glTexture` 表中（既不是 live 也不是 null），新三张 uid 不同；旧 RT 的 Texture/TextureSource 三次 CDP GC 后为 collected 或 destroyed，不能是 alive；S2 改窗口尺寸（1100×700、1920×1080、1280×720）同样不留旧 RT 空槽。
- [ ] 同一脚本跑修复前构建 `--html=<prefix-ce732ff6.html>`：S1、S2 失败（旧 RT uid 以 null 留在表中）。
- [ ] 60 轮恢复（见第 4 节）后 `node scripts/station-resource-target-slots.mjs <long-context/report.json> <out.json>`：每轮恰好 3 个键离开表、3 个新键进入（都是非 `scene.textures` 的 source），`newNulls` 0，`glTexture` empty 全程 0。修复前同一口径为每轮 3 个新 null、9→189。
- [ ] 原 Sol R（`station-round2-recheck.mjs --only=R`，断言不改）：本轮修复后仍是同样四个严格失败（village-1 GPU 增长、context-1 `glBuffer` 空槽即 sharedQuad、context-2/3 GPU 增长），与 Astra 修复前结果逐项相同，没有一项是旧 RT 空槽；请确认这一归类，并保留原失败。K3/K4 两个构建都先在 `glBuffer`（sharedQuad）上失败；K4 恢复后 `glTexture` 空槽修复前 19、修复后 15（未预热人物/NPC 变体的活 source 等待重传），请看 report 的 `coverage.strictContext`。

## 3. ASTRA-R3-PIXI-01（单独签收）

- [ ] `station-context-program.mjs` P1：3 次恢复后 graphics 适配器仍是同一个 GlProgram 对象（WeakRef 判定，页面不强持有），名字不再带递增编号；每次恢复后当前上下文里都有自己的 programData：`gl.isProgram` 与 LINK_STATUS 为真、所有 uniform location 在当前上下文 `getUniform` 无 GL 错误、`uTextures[i]` 依次为 0..n−1；用 `batchMode:'no-batch'` 的 Graphics（带平移和 tint）画到临时 RT，读回像素红/绿/蓝为 128（±2），位置正确。共享 batchSamplers 组的 change 监听数不随恢复增加。
- [ ] 能力差异 C1–C3（测试浏览器 `getParameter` 垫片只把 MAX_TEXTURE_IMAGE_UNITS 报为 8，不改游戏代码）：降到 8 时换成 8 槽的新程序并正确绘制；再恢复一次仍用同一个 8 槽程序；回到原能力时回到最初的 16 槽程序；全程只见到 2 个程序。C4 带 `--reference=<修复前同脚本 report.json>`：每种能力的源码（只归一化 `graphics-vertex/fragment-N` 的编号后缀）与修复前 Pixi 自己编出的相同。
- [ ] 修复前构建跑同一脚本：P1、C2、C3 失败（每次恢复新程序、编号递增，监听数每次 +1）。
- [ ] 60 轮恢复快照：`node scripts/station-resource-shaders.mjs <long-context目录> <out.json>`，同一个 idHash 对象 0/30/60 的 shader 源码键数和字节不增长（本轮 3/3/3）；修复前同一口径 6/36/66、+260,160 B（Astra 证据及本轮同会话对照）。重挂、共享两组的同名统计也不增长。
- [ ] 不接受用删快照、清 Performance 记录、少跑恢复、改过滤器名或扩大字节门槛签收。

## 4. 固定口径三组 60 轮

按 [Astra 口径](../astra-resource-r3-20261010/README.md#固定口径)：离线 1280×720 DPR1、repaired 夹具、village seed 42、三轮同动作预热、每轮完整预热、回 (17.5,18.6) 等 1500 ms、三次 CDP GC 间隔 200 ms、JSHeapUsedSize、0/30/60 快照。三组互不相减，不与历史 G6/20 轮/R/R7/F20 混算。

```powershell
node --import tsx scripts/station-resource-trend.mjs --mode=remount --rounds=60 --snapshots --out=<新目录>/long-remount
node --import tsx scripts/station-resource-trend.mjs --mode=shared --rounds=60 --snapshots --out=<新目录>/long-shared
node --import tsx scripts/station-resource-trend.mjs --mode=context --rounds=60 --snapshots --out=<新目录>/long-context
```

- [ ] 重挂、共享：状态 `BOUNDED_CHECKS_PASS_HEAP_PENDING`，严格/归属失败 0；每轮 5,317 个标记资源收集；sharedQuad 同一几何 uid0、缓冲 uid0/1/2 的同一弱身份；停放无 stage 子项、ticker 停、canvas 脱离、Pixi 事件为空、空槽 0。不应回归出每次新 renderer 的 shader 增长。
- [ ] 恢复：严格/归属失败 0（修复前 60/60），每轮丢失期间帧继续推进，live 723 / GPU 661 稳定；最终重挂后释放检查通过。
- [ ] 堆按 README 方式另报：6–10 与 56–60 均值、端点、全段与后 30 斜率；它们是观察值，不是放行门槛。

## 5. 堆诊断映射与 SHA 保护

- [ ] `scripts/station-resource-build-map.mjs` 从 HTML 标记推出构造器名和 idHash 变量（每个标记必须唯一），再要求 build SHA 在 `VERIFIED` 表中且推导结果完全一致。对修复前构建推导结果应与 Astra 手工别名相同（XT、Ep、Fi、xe、gb、ft、c、rm）；对新构建核对每个名字在 HTML 中的声明（README 列出）。
- [ ] `station-resource-heap.mjs`、`station-resource-shaders.mjs` 用 `--html=<产生快照的构建>`；快照目录的 report.json 记录的 build 不同或构建不在表中时报错。用新脚本对 Astra 原 long-context 快照（`--html=<prefix>`）应复现 6/36/66、同一 cache id。
- [ ] 反例：拿一个不在表中的构建（例如改一字节的副本）跑这两个脚本，应拒绝。

## 6. 回归

- [ ] 恢复后的画面与输入：`station-context-program.mjs` R1（世界 RT 不是空白、键盘行走有位移）；`pnpm test:station` 的 G7（丢失期间计时/帧推进、恢复后继续）。
- [ ] 院子与城中村共享宿主、停放与重挂：`pnpm test:station` 的 G5/G6、`station-round2-recheck.mjs` 的 K3、`coast-sample-test`、`coast-lifecycle-test`。
- [ ] `pnpm test:station` 全部通过（本轮 76/76）；受影响回归：hideout、mobile、mobile-ux、desktop-input、shop-drag、portable、title、save-browser、systems，城中村 `coast-sample-test` 51 项、`station-ordinary-acceptance` 3 项。
- [ ] J1（`--only=J1`）间歇失败：设施面板打开后取不到 `.phead` 关闭按钮。本轮修复后 3 次中 2 次失败，修复前构建 5 次中 1 次失败，失败点相同；请多跑几次两个构建，判断是否为脚本与设施面板每 30 帧刷新的时机冲突，断言未改。
- [ ] `coast-lifecycle-test` 在两个构建上都是 0/4（进入后找旧页签的 `#seed`），是院子成为默认入口后的过期脚本，本轮未改；城中村“丢失期间冻结时间”因此没有直接覆盖，请决定由谁更新入口。
- [ ] 目视：恢复上下文后院子灯光、墙面、人物、雨与城中村画面与恢复前一致；1280×720 与 1920×1080 各看一次。

## 7. 不在本轮

总堆未归因增长（F20 / ASTRA-STATION-HEAP-01 / SOL-R2-RESOURCE-01 整体）仍 PARTIAL；ASTRA-SAVE-01 仍 UNCONFIRMED；ART/COPY/API/RELIEF 状态不变。真机、真实 GPU/驱动内存、人手体验、远端 CI 未测。
