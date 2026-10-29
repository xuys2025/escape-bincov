# Sol 画图：原厂弹匣的图标，SVD 和 Vector 的弹匣单独成层

日期：2026-10-29。需求方：Opus（改枪实现）。由维护者转交 Sol。

## 背景

改枪 M4-07（[#142](https://github.com/xuys2025/escape-bincov/issues/142)）让玩家在工作台拆下原厂弹匣：枪少占一行、不能开火，弹匣变成仓库里的一件物品，只能装回同型号的枪。规则见 [CONTRACTS「拆下弹匣（M4-07）」](../../CONTRACTS.md#拆下弹匣m4-07)。

现在能拆的是弹匣单独成层的八把枪：MP5、UMP45、AK-74、AK-103、M4A1、AUG、M14、RPK。仓库里的原厂弹匣暂时把枪上的弹匣图（I 输出）居中当图标用。SVD 和 Vector 的弹匣画在机匣图里，拆不掉，所以这两把还不能拆。

## 要画的

1. **十个原厂弹匣的物品图标**：上面八把，加上 SVD、Vector。
   - 文件名：`gs-<枪>-mag-q24-v1`，例如 `gs-mb4a1-mag-q24-v1`，24×24。
   - 照 ART-SPEC 第 2 节的图标规格，和已有的 G03、G08 等弹匣图标一致。
   - 物品 id 是枪的 id 加 `-mag`，清单里 `item` 写这个 id、`role` 写 `icon`。
2. **SVD、Vector 的弹匣单独成层**：
   - 机匣图去掉弹匣（I、W 出新版本，H 若弹匣也画在机匣上一起改）。
   - 原厂弹匣各画一层：`gs-svdb-mag-factory-{h,i,w}`、`gs-vb9-mag-factory-{h,i,w}`，挂在机匣新加的 `mag` 挂点上。
   - 画法照其他八把：弹匣在 `REPLACED` 顺序里画在机匣后面，长度沿用 M3-W3 的实长。
   - SVD 的图请在 [svd-joint](../svd-joint/README.md) 修好接缝的 v3 上改。
   - 两把枪都没有可换的扩容弹匣，只画原厂的。

## 不变的

- 画布宽度、其他挂点、枪口 `tip`、H 的握点和手位不变。
- 装着弹匣时，拼起来的样子和现在的图逐像素一致：拆成两层，合起来不变。
- 限色照 ART-SPEC 第 2 节。

## 交付

- 目录：`assets/gunsmith/incoming/m4-mags/`（PNG 和本批清单，替换的图写 `replacesSha256`）。
- 说明放在 `docs/gunsmith/art/m4-mags/`：README、前后对照预览，以及「拆开再合上与原图一致」的自查结果。
- 提交信息写成 `art(gunsmith): factory magazine icons, SVD and Vector magazines (#142)`，在承接 PR 里留言。
- 开工和推送前先 `git pull --rebase`，不强推。
