# 首批素材返修 · revision 2 · 43 PNG

只返修Opus [ART-R01–R10](../../round3/README.md)。[manifest.json](manifest.json)记录每件SHA-256、旧SHA、来源、裁切、尺寸、锚点与返修归属；[validation.json](validation.json)为实际机械校验。旧版与正式接入文件均保留。

| 类别 | 数量 | 契约 |
| --- | --- | --- |
| 玩家 | 25 | E/SE/S/NE/N × idle+walk1..4，32×48，anchor(16,48)，脚底y47/baselineY48 |
| 墙 | 11 | core1、边条4、外墙2、内墙1、窗1、门关/开2，沿用32+48合成契约 |
| 地面 | 6 | 沥青/院地/瓷砖各a/b，32×32 |
| 卡宾枪 | 1 | 31×10，grip(8,4)、muzzle(28,4)，原字节不改 |

34件更新：玩家25、墙5（core/外墙a/b/内墙/窗）、地面4（院地/瓷砖a/b）。原4边条、2门、2沥青、1卡宾枪共9件逐字节不变。没有第三外墙、W/SW/NW原画或额外下蹲帧。原v1文件名/ID刻意保留，以匹配Opus当前导入表；用revision2与哈希区分替换内容。

- R01–R06：去框、去竖缝和箭头标记、窗带灰绿、院地降噪、瓷砖压暗。core对边及外墙a/b共享边校验通过，6地面均不透明。
- R07：25体图只保留上袖，不烘焙手与下垂前臂。独立枪图仍提供手套；手部合成的最后效果由Opus接入签收。
- **R08仍待前端接入：** manifest中 `weaponPresentationProposal` 允许N/NE/NW隐藏视觉枪；不是已生效运行规则，不改变模拟。当前验图副本只替换PNG，背向枪管仍有问题。
- R09保留既有镜像，采用弱方向性环境明暗；Opus最终确认光照偏好，未扩方向。
- **R10仍无下蹲帧：** 固定25帧/43件不能同时追加下蹲并保留原帧契约，idle代替下蹲未签收。等待维护者下一步范围决定。

全部最终Alpha只为0/255、最近邻缩放，阴影、轮廓、闪白与特效仍由运行时生成。开门22×44透明洞、地面接缝、脚底、枪口轴及25独立玩家哈希均通过。院地亮像素归零且对比降低；瓷砖a/b平均明度差0.92。

本轮内置 `image_gen` 对原玩家、墙、地面源板做3次编辑，原图与完整提示词在 [source/prompts.json](source/prompts.json)。原4边条/门/沥青/枪仍引用上一轮源板；这些引用已检查存在。没有外部API工作流或新运行依赖。

复建（必须先选择Node24；`node --version`应为v24）：

```text
node scripts/sol-round3-assets.mjs
node scripts/sol-round3-verify-assets.mjs
node scripts/sol-round3-preview.mjs
```

脚本使用已有bundled sharp；其他环境可设置 `BINCOV_SHARP_MODULE`。预览副本只在 `test-results/sol-round3/art-revised/preview.html` 替换34个data URL，不写 `src/`、`assets/coast/v1` 或 `dist/`。Opus下一轮再按原方案接入正式资源与锚点/背向策略。尺寸机械通过不等于视觉最终通过。

预览：[玩家](preview/player-5x5.png)、[墙部件](preview/wall-parts.png)、[墙帽重复](preview/wall-core-repeat.png)、[外墙a/b连续](preview/exterior-a-b-run.png)、[地面3×3](preview/ground-repeat-3x3.png)、[卡宾枪](preview/carbine.png)。真实运行裁图与截图见 [验收报告](../README.md)。
