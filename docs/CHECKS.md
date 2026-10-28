# 检查与诊断入口

按改动的实际风险选择检查，叠加使用；导航只列出命令，**不会运行、跳过测试或改变 CI**。不知道影响面时，先追调用和状态归属，不靠文件名自动缩小验证范围。

```bash
pnpm checks --list
pnpm checks --risk=save,input
pnpm --silent checks --risk=migration --json
pnpm checks --scripts --kind=diagnostic
pnpm checks --scripts --kind=archive
pnpm checks --scripts --kind=review
```

`--help` 列出风险名。规则、界面、输入、保存、迁移、库存、商店、地图、战斗、分层自然行动、据点成长、序幕、渲染、打包和 CI 分别有入口；纯文档使用 `docs`，不能与代码风险混用。未知风险、空参数和未分类的新脚本直接报错。`--kind` 只用于脚本盘点，不能过滤掉风险计划中的必跑检查。

## 怎样使用结果

- 风险计划按依赖展开并去重；代码风险先列单测和打包。组合风险不会删去任一项要求。
- 每条显示实际 package 命令、当前 CI 组或手动原因、前置条件。旧客户端、GPU、解压环境和真实计时要求随命令显示。
- `test:expansion` 必须准备工作流固定的四份旧 HTML；`test:mobile-ux` 未设置 `BINCOV_LEGACY_HTML` 时不执行其中的真实旧客户端检查。不能把当前包当旧包，或把未执行部分记为通过。
- `check:perk-ui` 是 #92 已交付的独立 Perk 界面专项，现在有 package 入口，仍为手动检查。本次没有把它或其他手动工具加入 CI 浏览器组。
- 最少检查不能替代新增反例、真实截图和人工验收。结果按通过、失败、未运行、环境阻塞分别记录。自然游玩、真实 120 秒训练、GPU 与真机要求保持原样。
- `--json` 输出同一元数据；通过 pnpm 调用时加 `--silent`，避免包管理器的命令提示混入 JSON。它不是 CI 跳测名单。分组和发布门禁仍按 [CI.md](CI.md) 执行。

## 诊断与历史工具

堆诊断必须独立运行并读完整报告。`diagnose:coast-heap` 和 `diagnose:coast-owners` 的 exit 0 只代表生命周期断言通过；`memorySignoff` 仍可能为 PARTIAL。`diagnose:f20` 默认正式包六十轮，named、正对照、高水位或缩短轮数必须另记，不能代替严格验收。本次导航不对 #32 F20 作新签收。

两个行动堆探针保留各自范围：owners 额外跟踪 Weather、SampleSound、SynthAudio，零所有者断言也有原有差异。默认目录现在互不覆盖，查询 `pnpm checks --list` 获取准确目录。`BINCOV_HEAP_OUT` / `R7_OUT` 的显式覆盖仍有效；同一探针重复运行时，为每轮指定新目录以保存证据。原采样、断言和判定阈值均未放宽。

| 脚本类别 | 使用规则 |
| --- | --- |
| check | package 检查；CI 与手动归属见检查列表 |
| diagnostic | 采样或快照分析；结合报告边界解释，不自动计为 PASS |
| support / ci | 被导入的辅助模块，或按工作流调用的 CI 工具/单测 |
| tool | 构建、素材生成、导入、交付或导航；部分会写源码和素材 |
| archive | 已确认依赖历史基线/证据，保留源码与历史链接 |
| review | 证据不足以登记为现役入口；保留，使用前核对夹具、参数、调用者和旧对象 |

`sol-r6-audio-controls.mjs` 归历史对照：写死 R6 工作环境，比较分支与 main；#90 曾在相同音频源码下测得 hit 1.227 倍，越过原 ±20% 条件。原脚本、阈值和制作静音负对照页的功能保留，不能当稳定的现役音频门禁。后续研究从 [Q-B06 实测记录](tasks/quality-entropy.md#q-b06-诊断-bundle-同源)接手，不放宽阈值。

R3 压缩名分析链只登记两个历史 HTML 哈希；旧商场兼容实验要求历史 main 新建一版商场。这些同样归 archive。没有充分依据的其他旧工具列为 review；不是删除授权，也不代表已经失效。盘点基于源码与调用关系，本次没有逐个运行全部历史脚本。

## 唯一维护位置

- [package.json](../package.json)：可执行命令和原参数。
- [browser-suites.mjs](../scripts/ci/browser-suites.mjs)：CI 顺序和现有手动原因；导航直接读取，不抄另一张分组表。
- [check-catalog.mjs](../scripts/check-catalog.mjs)：用途、前置、风险关系和诊断结果边界。验证要求在这里改，指南只链接入口。
- [script-inventory.mjs](../scripts/script-inventory.mjs)：非 package 工具的用途；包命令、CI/素材模块目录用途自动派生，旧工具逐项保留分类。
- [check-catalog.test.mjs](../scripts/ci/check-catalog.test.mjs)：随现有 CI 守卫执行，覆盖 package 检查、全部脚本、未知/失效条目、风险组合、必要前置和 CLI 负对照。新增普通脚本需要分类；新增 `test:*` 仍须登记 CI 或手动归属。

完成后将准确 head、命令、首败、报告边界和未验项写进任务交接，不把本页面或 `--list` 输出当作执行证据。
