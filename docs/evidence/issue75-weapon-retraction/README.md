# #75 枪身轴向回缩私有候选

本地分支 `feat/weapon-retraction-prototype`，基线为 fetch 后 main `974a3a8d1ad2a7662c3a828226295d6c9b31eb64`。本地验证完成且 root 已审源码与四张代表图，获准推送并建立独立草稿 PR；没有最终视觉签收或合并；#113 的 hit/crit 聚合和 #106 M2 保持各自分支。

本候选只改表现：**真实 shot 所在的发布帧始终保持原握枪位置**；其后的无新 shot 帧沿原枪轴回缩并恢复。统一的最大 3 世界像素和 80 ms 是 root 授权试验的温和参数，不来自角向手感参数，也不代表最终选定。每个后续帧先扣除实际 scene 的表现时间，超过 80 ms 就归零，不把过期脉冲拖到下一可用帧。60 Hz 首个中间帧的标量为 2.375，实际整像素位移约 1–2 像素；10 Hz 可能完全没有可画的中间运动，连射和单发都允许这种退化。多枪同包只保留一个最新短脉冲，不排队补播。

原胸口枪管行补偿、方向、缩短比例和脚点不变；袖管端点和武器描边跟随最终 weapon transform。火光的出生位置不变，存活期间的后续帧跟随同一演员的当前实际枪管尖；演员隐藏、死亡、武器外观切换时清除火光。每颗曳光的出生 `from/off` 仍只由原 shot 路径初始化，随后不跟随武器，Runtime 的 `pellets.origin/angle` 和逻辑弹丸完全未改。显示状态随 ActorGfx 释放，map/epoch 重建清空；隐藏和 reducedMotion 不保留待显示脉冲，旧弹没有新 shot 不造动作。 当前契约的 `ActorView.weapon` 是外观分类：切换不同外观会清状态，但不宣称可区分同外观的两把枪实例，残留脉冲仍以 80 ms 为上限；没有为候选扩充 Runtime 接口或持久协议。

实际制品 SHA-256 为 `e3721554484db962221a03f11a9d7bacf48c7005a82129017ba294f3e73179a7`；最后注释后重新执行类型/build/package，确认与 12AB 和原 S1 受检 HTML **逐字节哈希相同**。浏览器 `153.0.8010.12`，S1 实际起止 2026-10-25T05:05:57.814Z → 2026-10-25T05:17:56.930Z，对应制品、入口和命令见[验证摘要](validation.json)。

## 有效验证与未验

- 完整领域单测 **880/880**，工程守卫 **64/64**，类型检查、正式 build/package 通过。新 [Node 回归](../../../tests/weapon-retraction.test.ts) 6 项涵盖八方向原握枪像素、恢复/外观切换/隐藏、重复事件长间隔、暂停间隔、新鲜长包、真实 10 Hz M4A1 与一包十枪、真实双管六弹丸；包含过期脉冲不补播反例。
- [离线 A/B 原始报告](ab-report.json) **12/12 组合通过**：两档桌面尺寸 × 手枪/双管 × 东/东北/北。每个组合只由真实 Runtime 生成一次 packet 序列，再深冻结交给同一场景重建后的 A（关闭）和 B（开启）重放，保持同一 dt、相机初态和渲染 RNG。shot 当帧的武器矩阵、独立读取纹理不透明像素得到的枪管尖、火光出生点均逐值相同；所有帧的 tracer `born/from/off` 和原始 pellet origin/angle 相同，冻结 packet 未变。B 后续帧有实际回缩，80 ms 后回到 A 的位置，方向不变。
- A/B 每一帧的扳机袖管端点和武器描边连接误差为 **0**；仍活着的火光到“实际枪管尖 + 原 1.5 像素取整偏移”的误差为 **0**。两尺寸分别验证了 1 秒间隔过期、epoch 重建、隐藏房间不出脉冲/火光、稍后显露不重播。
- 原 [test:shooting 报告](shooting-report.json) **10/10 全项通过**，未改脚本或放宽 a/a-edge/b/c 等既有 S1 阈值。四枪八方向的火光到实际枪口最大 2.15 px（原阈值 2.25），tracer 过枪口最大 0.58 px（原阈值 1.5），没有向后起点；同时通过相机/瞄准隔离、慢帧受击、隐藏房间、近墙/门/墙角和双端开火模式。
- **未验证**：真人重量感、疲劳、真机、最终视觉选择、声音试听；没有改声音配方或素材。自动化只证明本候选的对齐、时序与状态边界，不代表手感签收。

## 真实离线截图

以下是同一真实 packet 序列的首个无 shot 帧（约开火后 16.7 ms），A/B 仅切换此候选；使用当前游戏的真实离线 Pixi 场景。为比较视图投影，夹具停止宿主 ticker、冻结 AI、相机平滑与渲染随机初态，直接重放已录 packet。**HUD 保留部署时的文字读数，不用于验弹药或资源；逻辑扣弹只看真实 packet 与 Node 断言。** 没有对截图后期编辑。

| 尺寸 | A 原表现 | B 候选 |
| --- | --- | --- |
| 1280×720 | [A](1280x720-pistol-A-after-shot.png) | [B](1280x720-pistol-B-after-shot.png) |
| 1920×1080 | [A](1920x1080-pistol-A-after-shot.png) | [B](1920x1080-pistol-B-after-shot.png) |

双管截图与其余原始结果仍在忽略目录 `test-results/weapon-retraction/`；长期证据只保留四张代表图，报告含全部枪种/方向逐帧测量。

## 复现

先链接现有依赖并正式构建，不安装依赖。探针使用已有 [browserOptions](../../../scripts/browser-options.mjs)，在本会话可用标准缓存运行：

```sh
env -u BINCOV_CHROME PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
  flock /tmp/bincov-browser-validation.lock node docs/evidence/issue75-weapon-retraction/probe.mjs
```

[探针源码](probe.mjs)只作固定夹具复现，不是玩家 A/B 开关或新增 CI 套件。系统 `/usr/bin/chromium` 的 file 页面首试被企业策略拒绝；改用已安装的标准 Playwright Chromium 后离线复现成功，未修改浏览器策略或安装软件。

## 同步 main 之后（2026-10-26）

上面的截图和报告来自同步前的 head `8cfe4d4`。同步 main `1a4fe66`（#121 枪声与新版/旧版开关、#123 C 组姿态、#125 受击档位与镜头推动）后，回缩改由试枪场“打击感：新版 / 旧版”开关（`ViewOptions.feel`）控制：旧版不回缩，火光留在开枪位置；`weaponRetraction` 只留给本探针。本机 Windows、系统 Chrome 156 上重跑本探针，12 组 A/B 和边界检查全部通过，制品 SHA-256 `63e05f3207e6487985150ff9260cc8a08d0fb56f7466a83d60e3513d765d0035`。场景接入另由 `test:shooting` 的 j 项进 CI：新版四个方向逐帧回缩 2–3 px、第 5 帧回位、火光不离枪口；旧版和减弱动效不动。截图未重拍：新版的画面与同步前相同。维护者 10-26 在试枪场试玩后认可新版，同意合并。
