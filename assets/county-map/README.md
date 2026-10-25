# 县域选图底图

由内置 OpenAI `image_gen` 生成，经过三轮编辑压低碎纹理、简化森林与建筑、去掉文字；完整提示词序列见 [prompt-final.txt](prompt-final.txt)。维护者要求减少首稿的噪点与 AI 概念图感，本次采用统一平涂地图。

- `county-terrain-source.png`：最终源图，1536×1024；地景为选图示意，不是可游玩地形或关卡平面。
- `county-terrain.webp`：相同尺寸的 WebP，质量 0.88，250,704 字节。由 `node scripts/prepare-county-map.mjs` 转码，无裁切、拼接或重新绘制。
- `manifest.json`：源图和运行时图的 SHA-256、尺寸与转码环境；构建检查哈希。

地图标签、开发状态、路线、选中光照与点击区都由代码绘制。WebP 经 esbuild 内联为 data URL，游玩无需外部请求；界面按 3:2 原比例显示底图，不再拉伸。源图只用于维护，不重复塞入 HTML。未采用的草稿保留在本地忽略的 `test-results/county-art-drafts/`。

## 区域情报插图

[briefing-concepts/](briefing-concepts/README.md) 提供十二地区的情报插图、三张原始图集、逐图裁切/哈希清单与完整提示词。2026-10-24 起十二张 WebP 全部由 `src/station-view/county-art.ts` 导入，作为出击面板的区域情报插图（界面标注「情报示意图」）；`scripts/build.mjs` 检查导入与两份清单一致、哈希一致。概念插图不表示实际关卡已经实现。接入方式与验证见 [Opus 视觉深化](../../docs/tasks/county-map-select.md#opus-视觉深化2026-10-24)。
