# 首批试样 · 43 PNG

仅供 Opus 按原型接入与反馈；未接入本轮 HTML。规格来源为 [03 图片清单](../evidence/specification/03-给Sol-图片规格清单.md) 和优先级更高的 [07 素材需求变更](../evidence/specification/07-给Sol-素材需求变更.md) 第 4/5 节。对应原图、提示词、裁切矩形、slot、图层、锚点和哈希见 [manifest.json](manifest.json)。

| 类别 | 数量 | 尺寸 / 锚点 | 检查 |
| --- | --- | --- | --- |
| player | 25 | 32×48，(16,48) | E/SE/S/NE/N × idle/walk1..4；实际不透明脚底结束于 y47，边界 baselineY=48；头顶 y9，跨步 walk1/3 为 y10；25 文件互异 |
| 墙芯 | 1 | 32×32，(0,32) | 独立顶面部件 |
| 压顶四边 | 4 | N/S 32×3；E/W 3×32 | 按邻接关系组装；不是单独游戏实体 |
| 立面 / 窗 / 门 | 6 | 32×48，(0,48) | 外墙2、内墙1、window-ew1、door-ew关/开2；开门 x5..26、y4..47 的 22×44 门洞完全透明 |
| 地面 | 6 | 32×32，(0,0) | 柏油/院落/瓷砖各2，全不透明；柏油/院落对边连续；瓷砖15/31行列为接缝 |
| carbine | 1 | 31×10，grip(8,4)、muzzle(28,4) | axisRow=4，水平向右，包含两处中性深色手套 |

所有最终素材 Alpha 仅 0/255，按最近邻缩放。原图的透明边缘已按阈值整理，源图保留供追溯。阴影、轮廓、闪白、粒子与光照仍由 Opus 运行时生成，不在 PNG 中烘焙。asset `id` 与存档实体 ID 分开；`slot` 对应 Opus 原型资源前缀，文件命名包含方向/帧/版本。`frame` 为 idle/walk1..4，另保留 frameIndex。

墙体部件用于原规格的 32×80 墙段：上 32 行顶面、下 48 行立面；组合墙的边界锚点是 (0,80)。PNG 是独立部件，不是已拼好的 32×80 游戏墙，接入沿用 Opus 方案。

目录：`png/` 只有43个最终独立素材；`source/` 为四张 image_gen 原图及完整提示词；`preview/` 为人工复核拼板和地面3×3平铺展示，不能作为运行图集。`validation.json` 登记机械校验；不代表已在引擎验证方向切换、握持、墙段拼接或整体风格。

预览：[玩家25帧](preview/player-5x5.png)、[墙体部件](preview/wall-parts.png)、[地面3×3重复](preview/ground-repeat-3x3.png)、[卡宾枪](preview/carbine.png)。

复建不调用图片服务：用已有原图执行 `node scripts/sol-sample-assets.mjs`，再执行 `node scripts/sol-verify-assets.mjs`。脚本使用本机工作区 bundled sharp；其他环境设置 `BINCOV_SHARP_MODULE` 指向已安装的 sharp 模块。不修改锁文件、不新增运行依赖。

等待 Opus 在街口全景、门口、贴窗射击场景反馈；不制作其余角色、死亡帧或第二批素材。
