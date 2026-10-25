# 便携包与网页包验证

## 0.2.0 发布检查

2026-10-04，以 `ba2d3cd`（前五个 PR 全部合入后的 main）为基线准备 v0.2.0。重新执行 `pnpm package` 与 `pnpm test:portable`，6 项检查通过；ZIP CRC、内部入口、两个 HTML 的逐字节一致性及发布清单哈希全部通过。环境为 Linux / Chromium 138.0.7204.0；实际解压后通过普通入口离线操作，没有运行时外部请求。

当前 `main` 构建的文件校验值见 [`main-latest` 发布页](https://github.com/xuys2025/escape-bincov/releases/tag/main-latest)的 `release-manifest.json`（v0.2.0 自己的清单附在其发布页），下载与升级说明见 [v0.2.0 发版公告](releases/v0.2.0.md)。本轮诊断报告在忽略的 `test-results/portable-report.json`，远端完整报告由对应 CI 的 `browser-evidence` 提供。

## 0.1.1 历史验证

2026-10-04，Linux 上的 Chromium 138.0.7204.0 完成 6 项便携检查，全部通过。

- `release/Escape-Bincov-portable.zip`：内含完整游戏 `start the game.html` 和中文游玩说明。
- `release/Escape-Bincov-web.zip`：根目录只有 `index.html`，可直接交给静态网站托管平台。
- 两个 ZIP 均通过 CRC 完整性检查，内部 HTML 与主目录入口及 `dist/index.html` 逐字节一致。
- 便携测试实际解压到新建的中文与空格目录，通过正常入口离线启动；无测试接口、外部网络请求或其他本地资源请求。
- 验证进入水产站、真实倒计时、真实射击弹药 8→7、Tab 背包、Esc 暂停；暂停时 HUD 保持真实剩余时间。
- 当前构建大小与 SHA-256 见 `release-manifest.json`；测试详情见 `portable-report.json`。

执行 `pnpm package` 会同步两个启动 HTML，并在 `release/` 生成两个 ZIP 和清单（均不入库）。`pnpm test:portable` 使用独立浏览器上下文；Windows 使用 .NET ZIP API，Linux/macOS 使用 Python 3。可通过 `BINCOV_CHROME` 指定浏览器。
