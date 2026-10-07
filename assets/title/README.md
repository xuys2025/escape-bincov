# 主菜单像素分层素材

2026-10-07 更新。本目录同时保留早期程序素材和当前导入素材；**运行时以 `src/title/assets.ts` 和 schema 2 的 `manifest.json` 为准**。旧 `title-*.png` 不再自动覆盖新图。

当前室内、桌台、船、港口、灯和绳索采用本任务生成并进行运行检查的像素素材（整体美术尚未获用户认可）；雾、雨、光点及电台精灵沿用程序素材。图层全部内联到离线 HTML，不需要联网。不能再沿用“全部程序绘制、没有生成图”的旧来源说明。

## v7 统一像素网格（2026-10-07）

运行图层不再直接缩放生成插画。`pnpm title:art` 会把每个登记图层采样到同一套 640×360 美术像素网格上，所有图层共用一套色板（`palette.json`，64 色提炼色加 3 个保留色），清理孤立像素，再应用 `scripts/title-art/touch.ts` 的手绘精修（潮汐表、封锁日历、电表）。网格图层（`layout.ts` 中 `res: 2`）每个逻辑像素存 2 个纹素，1 个美术像素正好 3×3 纹素。源图不改。`sources/refine-v5/` 是 Codex 按母版坐标重绘的电台、步枪和字标，生成时贴回 desk 源层或直接作为字标。说明与截图见 [docs/title-pixel-grid](../../docs/title-pixel-grid/README.md)。

## 来源与派生

- 当前使用 `sources/master-v3/`：从原概念生成一张无 UI 母版，再按同一坐标提取室内、桌台、椅子、前景、灯、船、码头和远港。原始 PNG、所有提示词、拒用原因和校准说明见 [prompts.md](sources/master-v3/prompts.md)。派生过程保留 alpha，以最近邻采样、裁切和边缘延展准备运行图；灯的 5 帧以固定悬点逐行偏移，系船绳的 3 帧为原生像素线。
- `sources/*-depth-v2.png` 和对应运行图是上一轮独立物件方案，保留供比较／回退，已不进入运行包。`*-new.png` 中被替换的源素材同样保留。

- `*-new.png`：2026-10-07 第三轮分层交付。原始生成图、提示词和交付清单位于本地 `设计提案/主界面重做-20261006/layers/`；仓库保存实际运行需要的 PNG。
- `sources/wordmark-industrial-v4.png`：本轮通过内置 ImageGen 从已认可概念提取的独立中文工业字标，准确文本为“逃离／滨科夫”。两次生成提示词和实际选择见 [wordmark-v4-prompts.md](sources/wordmark-v4-prompts.md)。运行版为 144×72，最近邻采样后使用单色旧白和二值透明；旧源图和 144×66 版本保留作历史。
- `title-sky-ready.png`、`title-harbor-ready.png`、`title-room-ready.png`：从当前对应源 PNG 延展边缘像素，覆盖视差边界。透明补边不能代替画面延展。
- `title-wordmark-industrial-v4.png`：独立字标的当前运行版。正文继续使用 Bincov Text，字体来源与 OFL 许可见 [字体说明](../fonts/README.md)。
- `title-pier-master-v3.png`：只包含室外湿码头、桩和护栏，位于船与船水关系之上；室内地板和门槛只属于 `title-room-ready.png`。首个错误包含室内地面的码头输出已拒用。
- `src/title/water.ts`：从船体真实轮廓采样，绘制吃水边缘、暗水、受波纹打断的船影和局部反光；不是另一张不透明背景。

## 图层与验证

v6 运行期更新：移动图层采用连续位移；源像素先最近邻复制为 2 倍缓存，再在线性采样时保持块内颜色，避免原生低分辨率混色被放大成糊边。主菜单渲染画布按显示尺寸选择，最高 1920×1080，逻辑坐标仍为 960×540；离开时恢复原画布和相机。原 PNG、原纹理过滤、静态字标与局内整数缩放不变，派生纹理只缓存一套。吊灯使用条带中央帧围绕固定悬点连续微摆；水面有界缓存仍随退出释放。

逻辑坐标为 960×540。位置、景深和帧数见 [layout.ts](../../src/title/layout.ts)，文件尺寸、来源、SHA-256 和 RGBA 像素哈希见 [manifest.json](manifest.json)。

绘制顺序：远背景 → 不透明港口底图 → 水面与船影、雾和远灯 → 船 → 吃水线 → 系船绳 → 近码头遮挡 → 雨 → 室内 → 吊灯 → 桌台与灯光 → 椅子 → 前景。

`pnpm title:art` **只写十一张派生 PNG 和清单**，不会重新绘制或覆盖 `*-new.png` 源图。旧绘制模块保留供历史参考及程序效果复用。

```bash
pnpm title:art
node --import tsx scripts/title-art/generate.ts --check
pnpm test
pnpm package
pnpm test:title
pnpm test:title-water
node scripts/title-depth-review.mjs
```

构建校验所有运行时 PNG 的完整清单、尺寸及哈希。单元测试同时验证真正导入的图片、门窗透明度和不透明视差边缘。修改源图后须先审核差异，再更新派生与清单；不能只改哈希消除失败。

主界面最终审美仍由用户确认；通过像素/运行测试不等于与概念图完全一致。当前实装证据见 [主界面交付记录](../../docs/title-parallax/README.md)。
