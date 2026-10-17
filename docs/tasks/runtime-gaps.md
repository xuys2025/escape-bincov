# Runtime 收尾接口与存档复验

2026-10-17，Astra；分支 `agent/runtime-gaps`。起点为 PR #64 的 `92a0b237b18b2aea36f7c9bfbdb67b0b34346748`，已接受 main 为 `1764874`。本 PR 目标 main，依赖 #64，须等 #64 合并后再合。未修改 Opus 的测试时序加固、宿主、地图、美术或存档格式。

## 固定 head 复验

先在独立 detached 工作树上复验上述 #64 head，未改生产代码；[完整评论](https://github.com/xuys2025/escape-bincov/pull/64#issuecomment-6227000538)。452/452 单测、raid-default 9/9、save-browser 9/9 通过。五条恢复路径的独立探针通过后保存在 [runtime-closeout.test.ts](../../tests/runtime-closeout.test.ts)：coast-v2、coast-v1 迁移、商场 1/2/3，各自暂停/继续、实时备份、四结局失败候选、单次重试、跨会话冲突与可导出备份。

`magazine/vitals/clock/spawnLoot/container/hurt` 均实际运行，捕获的完整记录经 `decodeSession` 严格校验。原工厂 opt-in 单测和普通入口浏览器检查共同覆盖 `?test=1` 门禁。未放宽校验器或把非法输入当可用存档。

环境伤害截零正确：旧世界的流血/污染与 `applyDamage`、分层环境伤害、换层弹道一致；`enemyDamage` 的扣除量不超过剩余生命。没有发现有效游戏路径把负生命写入身体。原流血致死用例和本分支补充的污染/分层致死用例均覆盖成功结算与不重复写入。

## 本次实现

接口的参数与失败契约以 [contract.ts](../../src/raid-runtime/contract.ts)、[runtime.ts](../../src/raid-runtime/runtime.ts) 的源码旁说明为准；回归在 [runtime-gaps.test.ts](../../tests/runtime-gaps.test.ts)。

- **治疗拒绝**：`transaction` 在药品操作返回 rejected 时将该操作的说明放进 `rejected.reason`，仅保留说明，不发布被回滚的成功事件。保存失败仍为 `save-failed`。分层补给使用已有 `useRpgItemResult`，满血无流血有明确中文原因。现有宿主支持中文 reason，未改宿主就能显示原话；desktop-input/mobile/ui-review 三处已恢复 `/生命已满/` 断言。
- **逐件地面拾取**：`services.activate({runId,mapId,kind:'ground',id:uid})` 不受 E 当前优先箱子影响，仍用 `nearbyLoot()` 的 `<43` 距离、视线/通行和潮汐规则。保留 run/map 与暂停/面板/冲突守卫。同一 `SaveSession.mutate` 提交背包和世界；写失败全回滚。`retrySave` 恢复保存能力，不会自动重做拾取，调用方需再发起；成功后同一 UID 不能再领。测试涵盖重叠箱子、过期引用、满包/部分拾取、一次写入和回滚。
- **门失败原因**：不可达为 `rejected{action:'door',reason:'unreachable'}`，门口占用为 `occupied`；不再把这两种情况合为 `unreachable-or-rejected`。楼层入口旧拒绝码暂不改。失败不写存档、不发 door 成功事件；现有写失败重试测试继续保留。
- **重对时**：生产端口增加 `runtime.resetClock()`。宿主须在挂载的首次实际绘制/贴图烘焙完成之后，以及换层重建/首次绘制完成之后调用一次，再进入正常逐帧 advance。它只丢弃下一次 wall-clock 间隔，不走时、不写入、不解除暂停、不改变 epoch/RNG/输入，也不解除时间戳单调性检查。不能每帧调用；真实 >2 秒卡顿仍须暂停。如果烘焙分散在多帧，宿主应先完成明确的准备阶段再重对时，不能只在异步 mount 开始时调用。

## 死亡后 1 血

这是已有明确设计，见 [RPG 设计](../RPG-SYSTEM-DESIGN.md)“基地恢复”与 `SaveSession.prepareSettlement`：新版分层行动死亡后生命 1、耐力 0、精神 20、水分/饱食 40、污染 50 返站，原 debuff 由基地治疗；出击按钮不自动补满。单测固定了同一时间立即再出击仍为 1 血。旧封锁区保留旧行动规则，死亡可留 0，本次不统一或调整数值。是否需要返站提示或降低再次出击的挫败感，应另作产品决定。

## 验证与边界

本地 Windows，先用系统 Node 22.22.2 验证，再用内置 Node 24.19.0 补验完整单测及 package；两次均通过且 HTML 哈希相同。pnpm 11.25.0、Chrome 155.0.8059.80；pnpm 与仓库 CI 的 11.19.0 有版本差异，不能把本地结果冒充 CI。浏览器由系统 Node 启动，为离线自动化；桌面两尺寸 1280×720、1920×1080，移动尺寸按各套件。

本分支 `pnpm test` 468/468（新增 16 项），`pnpm package` 通过。desktop-input 10 项、mobile 11 项、ui 38 个检查点、save-browser 9 项以及 loot-target、mobile-ux 均已通过。后两套保留原前端缺口守卫，不代表附近列表已完成；浏览器后续结果在 PR 验证表更新。日志保留于本地忽略目录和 `*.log`；构建制品及 SHA-256 见 [release-manifest](../release-manifest.json)。没有真机、无 GPU 慢设备端到端、真人平衡性或十分钟真实计时的结果；慢帧方案只验 Runtime 时钟契约，宿主尚未接入。未宣称 #64 红 CI 已修复或全 36 套已通过。

## Opus 接入

1. 按 ground 引用接「附近」逐件列表及触屏入口，再翻转 loot-target/mobile-ux 的旧守卫。本分支按要求保留这两处守卫，接口可用不等于前端已接。
2. 宿主门提示直接映射 `occupied` / `unreachable`，移除按开门状态猜测；当前宿主对新码会落到通用提示，需接完才能宣称门文案完整。
3. 挂载/换层的实际烘焙结束后接 `resetClock()`，在无 GPU 慢设备验证首局、换层不误暂停，真实卡顿仍暂停。
4. 治疗中文 reason 已被当前宿主直接显示；如之后调整呈现，保留上述三处断言。#64 的测试时序加固由 Opus 继续，合入本分支时保留这些已恢复断言。

商场布局四版注册/并存与新沿海封锁区地图数据没有开工。
