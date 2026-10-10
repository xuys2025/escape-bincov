# 给 Opus：真实会话接线

导入正式 [contract.ts](../../src/hideout-runtime/contract.ts) 与 `src/app.ts` 导出的 **hideoutRuntime**，不要在院子新建 SaveSession、独立 profile、MockHideoutRuntime 或第二个 WebGL Application。纯逻辑 `RealHideoutRuntime` 不依赖 DOM/Phaser/Pixi；app 中的实例另注入浏览器可见性/焦点/旧行走宿主/面板门控。

## 入口、快捷页签和退出

1. 标题首次进入：完成现有 ownSession / initialize，再调用 `hideoutRuntime.enter()`；仅在 ok 后显示院子。若有活动旧行动，使用现有标题恢复入口，不能重开行动或先强转版本。
2. 旧快捷页签与院子都使用同一个实例。旧页签当前仍可走 SaveSession 的既有调用；`snapshot()` / `tick()` 会观察其真实 revision 并发 external 提交事件。页面只订阅一次；卸载时调用订阅返回的取消函数，丢掉购物车和快照引用。
3. 院子宿主每帧调用 `tick(Date.now())`，内部每五秒才提交；恢复/生产只有这一个现实时钟。旧 BaseScene 与新院子不可同时挂为存档所有者：交接前 `flush()` 成功，再停止旧宿主/解除它的 expansion attachment。挂院子时不要启动旧 BaseScene。
4. blur、visibilitychange、面板/脚本动画开始：`setActivity(false)`；真正恢复可交互走动时再 true。app 已额外检查 document.hidden、hasFocus、app.overlay、baseWalking；院子自有面板仍须明确 false。
5. 换宿主、返回快捷入口、pagehide 前先 `flush()`；失败保留院子及失败面板供重试/备份，不要丢弃 Runtime。返回标题用 `backToMenu()` 成功后停宿主、显示现有菜单。常规视图卸载只取消订阅；同一页面会再使用 singleton，不要每次调用永久 `dispose()`。dispose 用于真正结束该 Runtime 所有权。
6. `storage.ok=false` 停止动作，提供 `retrySave()` 与 `exportBackup()`；conflict 仅导出/刷新。导出返回 JSON 文本，复用已有 Blob 下载逻辑；音量写入 ok 后用已保存值更新 SynthAudio。

## 与原型契约的差异

| 接口 | 接法 |
| --- | --- |
| snapshot | 原字段保留；新增 phase、arrival、storage.pendingBase/upgradeRequired。所有对象均为副本，改副本不会提交。rev 是全局存档版本，不是院子独立计数。 |
| move / split | move 追加可选 quantity；split 指定目标空格。安全箱用 secure；补给、护符用 useSupply/equipCharm/unequipCharm。移入格位先调 placementError 预览。 |
| openShop | view 为副本；place 仅改临时车；settle 才扣钱。任务物资返回 `ok:false, reason:'rule', confirmation:{kind:'quest-sale',token,warnings}`，确认弹层后 settle(token)。编辑车、任务/需求变化会使旧确认失效。失败时保持车；stale 须让玩家明确 reset 后重新选择。 |
| CartView.placement | 恒为 automatic-stash。待买区不是仓库预留格；本轮没有批准手动指定成交落点的新规则。 |
| practice | 删除不可信 moved/inZone，改 `from/to` 世界像素、seconds、epoch now。每次 0<seconds≤0.25，实际速度≤168px/s、位移≥0.01；时间不能重用/超前，位置需连续；帧秒数允许整数毫秒量化误差，但累计计时仍受活动墙钟约束。 |
| flush / retrySave | 五秒失败保留完整候选，重试同一票据，不重抽、不重复训练。inventory 操作失败仍是回滚，该购买需玩家重按；retrySave 不替玩家重新下单。 |
| previewImport / importBackup | 先预览获取 token，再让用户确认覆盖后传原始全文和 token。文本或期间 revision 变化须重新确认。保留 v4 对无扩展旧备份的降级保护；勿加“忽略校验”。成功导入活动行动后回标题走恢复入口。 |
| mockSettle | 正式契约删除。用现有真实 Raid Runtime/SaveSession 的结算服务，不允许画面构造胜负。 |

训练常量 `STATION_TRAINING / STATION_POOLS` 可直接导入给前端画调试区域：tile 32，训练矩形 x10–21/y9–16，四个育苗池排除，身体半径10。逻辑对整条短位移插值检查，不能跨池抄近路。移动/碰撞/寻路仍由你实现；坐标布局改动先对齐常量与测试。训练输入还没提交时 snapshot 不冒充已经得到成长；动画不要消费尚未出现的 practice-credited。

## 出击与真实回站

```ts
import { hideoutRuntime } from './app';
import { startPreparedHideoutRaid } from './ui';

const prepared = hideoutRuntime.deploy({ world: 'buildings', seed: chosenSeed });
if (!prepared.ok) return showFailure(prepared);
// 行动已写入，院门动画由 Opus 播放；此时所有据点写操作已锁住。
await playDeparture();
await unmountStationView(); // 取消监听、归还停放 Application；不再写据点存档。
await startPreparedHideoutRaid(prepared.runId!);
```

`startPreparedHideoutRaid` 内部只调用一次 `startRaid(runId)`，再启动现有宿主；**不能再调用 ui 的旧 deploy 或 SaveSession.beginRun**。`?sample=village` 且 buildings 时连接已验收 Pixi 城中村；其他入口仍用现有 Phaser。空 seed 的真实 Runtime 沿用 generateRun 的时钟种子；如果你要沿用样板“空种子优先落在装饰村角”的选择，宿主先用现有 villageSeed() 取候选，再把该值作为 seed 传入。不能在动画后重新选种子。

动画中刷新：保存的活动行动直接走标题 resumeRun 路径，不重播假结算。城市宿主启动失败仍保留其检查点，由现有失败清理/刷新恢复路径处理。

结算顺序保持现有 `prepareSettlement → retrySettlement → result`。pendingSettlement 未持久化时不允许走回动画。原城市 finish 会释放 Raid Runtime、unmount 视图，才进入结果页；不要抢先 mount 院子。真实结果页返回时调用 `returnToBase()`，ok 后读 `consumeArrival()`，仅用这份一次性标记播放院门走入和报告。消费后/刷新后为 null；普通读档不重播上一局报告。

院子与沿海共用 Application 的停放/接管由你完成，本轮没有建立第二个 Pixi 实例。后续仍须真实验证 20 次挂载循环、图形上下文丢失/恢复与失败清理；本轮旧样板 51 项通过不算院子宿主验收。

## 事件使用

committed 后重新取 snapshot；power-restored 只对真实 repair 假→真转移出现；首次加载/完整导入只刷新状态，不把旧档设施当成刚建成来播动画。facility-built、production-complete、practice-credited 均在成功提交后。save-failed 是失败通知，不得播放通电/奖励音效。渲染回调只读取，不要在事件回调中同步发动下一笔交易（重入返回 locked）。

前端布局、默认院子路由、光照/雨夜/镜头/屋顶、NPC、声音、拖动方案、字库与素材均由 Opus 决定。本轮没有扩展这些方案。
