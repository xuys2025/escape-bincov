# PR #23：存档冲突测试时序修复

日期：2026-10-07。已接受基线 main：`425f32013bd04da668ca5924f25fa2fef926b2c9`；接手 PR #23 头：`6d6cefec2c43a028682fa04f38bb51948a48d831`。

## 问题与范围

[PR #23](https://github.com/xuys2025/escape-bincov/pull/23) 的主界面素材优化改变了第二窗口启动时序，使既有搜刮测试稳定触发[Issue #24](https://github.com/xuys2025/escape-bincov/issues/24) 中旧客户端与自动检查点的跨进程竞态。原失败见 [CI run 37624671049](https://github.com/xuys2025/escape-bincov/actions/runs/37624671049)。

本轮直接续作原 PR，只修改 `scripts/loot-browser-test.mjs` 和验证/交接文档；没有修改游戏、存档、恢复或主界面源码。实际运行 `pnpm package` 后，生成物与接手时完全相同。Issue #24 中存档写入本身的竞态仍需另行决定，使用 **Refs #24**，不关闭该 issue。

## 修复方式与保留的断言

通过已有 `?test=1` 下的 `window.__bincov.app.raid.scene.pause()` 暂停第一窗口的 Phaser 场景，随后取得快照。场景暂停只用于此冲突检测夹具，搜刮面板与上下文仍保持打开。

第二窗口仍实际加载游戏、验证无法取得存档所有权，并模拟不遵守锁的旧客户端：读取同源 localStorage、将 revision 加一、写回。第一窗口等待真实 storage 事件产生冲突，再用 `scene.resume()` 恢复场景；冲突锁继续由游戏处理。

保留原有全部保护断言：事件关闭搜刮上下文、角色负载不变、存档字节等于第二窗口写入值，以及刷新后背包/安全箱负载不变。新增断言确认场景确实暂停、初始上下文存在、写入前搜刮仍打开，以及冲突期间行动计时不变，避免预先关掉面板造成虚假通过。

没有增大正式测试等待时间、增加重试、跳过测试、模拟 storage 事件或放宽字节比较。此前“搜刮不中断时钟/AI”的原断言仍保留；本步骤明确只验真实冲突事件保护，不能据此宣称旧客户端同时写入的竞态已修复。

## 实际验证

环境：Windows、Node 24.19.0、pnpm 11.19.0、Chrome 154.0.8037.98；直接断网运行 file:// 构建。浏览器报告与截图为本地忽略的 `test-results/`，CI 会对本次精确提交重新运行全部检查。

| 检查 | 实际结果 |
| --- | --- |
| 修复前，双方 4 倍 CPU 降速，1920×1080 | 1/1 失败，正是第二窗口冲突步骤的存档字节断言 |
| 修复后，同一降速方式及全部桌面流程 | 连续 5/5 通过；每次 20 个流程，没有失败后自动重试 |
| `pnpm test` | 197/197 通过，0 失败、0 跳过 |
| `pnpm package` | 通过；严格类型、双 HTML、两 ZIP 和发布清单；没有生成物差异 |
| `pnpm test:loot` | 44/44 通过；双桌面及手机，原保护断言全部保留 |
| `pnpm test:save-browser` | 9/9 通过，包含真实多窗口待结算和备份保护 |
| `git diff --check` | 通过 |

最终游戏 HTML SHA-256 保持 `3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754`。本轮不新增主界面素材或截图，不改变玩家可见行为、存档格式或离线能力。

## 降速复现方法

仅在不提交的临时副本中，对两个页面施加 CDP `Emulation.setCPUThrottlingRate`、`rate: 4`；第一个页面的临时超时改为 60000，仅运行 1920×1080 的 `suite`。其余流程和断言保持原样：

```js
const throttle = async page => {
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
};
```

在 `context.newPage()` 后分别调用 `throttle(page)`、`throttle(other)`，末尾保留 `await suite({ width: 1920, height: 1080 });`。构建后运行该临时副本，每次独立启动浏览器；修复前失败证据与修复后五次结果分别保存。验证完删除临时副本，正式测试仍使用原超时和全部视口。

## 交付边界

测试与文档一次推送到原 `feat/title-pixel-grid`，保留原 PR 和全部公开历史。完整 CI 以本次精确提交的 PR 检查为准；此前绿色记录不替代本次检查。PR 继续保持草稿，整体美术仍待用户验收；没有合并 main 或部署。
