# 待办：将 SAMPLE_AREA 移到共享数据层，去除选区对视图的反向依赖

状态：**待维护者指派；未实施**。本次只建立任务书和草稿 PR。实施者继续本分支与本 PR，完成验收后再转 Ready；不要另建同目标 PR。

- 分支：`refactor/sample-area-boundary`
- 建档基线：`03cfb775fbef07c711fe789e9f6e886460261a91`（2026-10-29；#111 已合并）。开工前重新 fetch 并核对原 PR。
- 任务归属：[#60](https://github.com/xuys2025/escape-bincov/issues/60)。负责人由维护者指定。

## 问题与目标

src/raid-areas.ts 为 villageSeed 读取 SAMPLE_AREA，运行时导入 coast-view/appearance；同一常量也被 scene 用于样板着色和范围提示，选区因此依赖显示规则模块。

交付目标：一个纯数据来源同时供选区和视图使用，保持所有样板入口、选种和画面范围不变。

## 原子范围

只移动这一个区域定义并更新直接引用和必要导航；采用无 DOM/Pixi/视图运行时依赖的共享模块。不顺手重构 mapId、region、楼梯方向或区域注册表。

不改变世界/布局/存档版本、RNG、生成规则、区域坐标或素材。#117 居民楼 ID、#115 背包服务、#136 生命周期已完成；本 PR 只核销 #60 Q-E02 的 SAMPLE_AREA 余项。

## 接手入口

- [选区与 villageSeed](../../src/raid-areas.ts)
- [现有定义](../../src/coast-view/appearance.ts)
- [画面消费者](../../src/coast-view/scene.ts)
- [依赖图与守卫](../../scripts/ci/source-graph.test.mjs)
- [导航](../CODEMAP.md)

## 完成条件

- [ ] SAMPLE_AREA 保持世界像素值 x=96、y=32、w=1088、h=832，定义唯一；选区与视图直接读同一纯数据来源，appearance 不再持有或转发该定义。
- [ ] 固定 from 输入的 villageSeed 与旧版完全一致，仍优先满足样板范围与 north 出口，400 次搜索和 fallback 原样；显式输入种子保持原有路径。
- [ ] 普通入口仅 buildings/mall，显式 ?test=1 的 coast、?sample=village/mall 和商场布局 4 的行为保持。
- [ ] 用现有依赖图确认 raid-areas 不再借用 coast-view/appearance，并添加针对这一依赖方向的有效反例；保留实际行为对照，不用只比较新常量自己的测试冒充兼容验证。
- [ ] 完成 pnpm test、pnpm check:ci、pnpm package；以 pnpm checks --risk=world 选择受影响入口，核对 village 样板两档桌面、普通出击与显式种子。

## 本次建档验证

已核对最新 main、任务清单、对应源码和开放 PR，无同目标开放 PR。仅文档，不宣称上述实现和测试已完成；本次文档检查与实际结果见 PR 正文。源码、存档、生成物和部署均未改。

实施完成后在本文件或原 PR 更新实际结果、首败、截图/报告和未验证边界；同步相关 issue 与 WORK-QUEUE 的这一项即可，不扩大为清理整个历史任务表。
