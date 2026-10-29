# Sol 任务书：改枪第一波素材（M3-03）

日期：2026-10-28。需求方：Opus（改枪实现）。由维护者转交 Sol。

- 分支 `feat/gunsmith-m3`，也就是改枪 M3 的草稿 PR（PR ③）。图直接提交到这个分支。
- 规格以仓库 [ART-SPEC.md](../../ART-SPEC.md) 为准。本书摘出了这批要用的全部内容，不读规格全文也能开工。

M2 的 115 张图（G17、M4A1、20 件配件、三张手套）已在 10-28 随 #106 合入并上线。这批照它们的画法和比例继续画。

**做法**：先交 **P0**（第 9 节，AK-74 全套加它两套配装用到的件），推到分支后在 PR 里汇报，然后停下。维护者看图、Opus 拼进游戏看过，确认后再做 **P1**（其余）。

## 0. 怎么开工

在你的机器上：

```text
git fetch origin
git switch feat/gunsmith-m3        （第一次：git switch -c feat/gunsmith-m3 origin/feat/gunsmith-m3）
```

- **只写两个目录**：`assets/gunsmith/incoming/m3-w1/`（运行图和本批清单）和 `docs/gunsmith/art/m3-w1/`（说明、预览、原图、脚本）。其他文件都不改，包括 `assets/gunsmith/v1/`、`assets/gunsmith/manifest.json`、`src/`、`tests/`、`scripts/`。图搬进正式目录、生成代码、接进游戏由 Opus 做（M3-04）。
- Opus 会在同一分支上写代码，但不碰这两个目录。每次推送前先 `git pull --rebase`；不要强推，不要合并 PR。
- 提交信息写成 `art(gunsmith): …（#28 M3-03）`。
- 推送后在 PR 里留言汇报（第 10 节）。疑问也写在 PR 里。
- 不要提交、复制、输出任何密钥（包括 SSH 私钥）。

## 1. 先读

| 资料 | 用途 |
| --- | --- |
| `assets/gunsmith/v1/*.png`、`assets/gunsmith/manifest.json` | M2 已上线的 115 张图（你画的）。比例、色板、墨线、锚点写法都照它们；清单字段照抄这份的格式 |
| `tests/fixtures/gunsmith-assemblies.json` | M2 拼装记录的格式（`virtual` 和 `assemblies`）。本批的拼装记录照这个写 |
| `assets/coast/v1/coast-weapon-*.png` | 七张已验收持握图，H 的画风、长短、手套照它们；旧手枪、双管霰弹枪的 H 原图也在这里 |
| `assets/coast/v1/coast-player-body-e-f0-v1.png` | 主角朝东的身体帧，做持枪预览用 |
| `src/art/inventory.ts`、`src/art/items.ts` | 旧三枪格子图（I）的程序画法和色板 `C` |
| [ART-SPEC.md](../../ART-SPEC.md) §2–§3 | 三种图、锚点和挂点的完整规则 |
| [ATTACHMENTS.md](../../ATTACHMENTS.md)、[WEAPONS.md](../../WEAPONS.md) | 每件配件是什么、每把枪的特点 |

想在游戏里看 M2 的样子：`pnpm install`、`pnpm package` 后打开 `start the game.html`，到院子工作台（整备 → 主武器槽「改装」）；试枪场（`?range=1`）有「M4A1 轻快」「M4A1 稳定」两套。

## 2. 这批是什么

| 类别 | 内容 | 文件数（约） |
| --- | --- | --- |
| 七把新枪 | P226、MP5、Vector 9mm、M870、M1014、AK-74、AK-103：机匣 H/I/W、方图 Q24/Q32 | 35 |
| 新枪的原厂件 | 能换的部位单独画（第 4 节），各 H/I/W | 72 |
| 40 件配件 | 第 5 节，各 I、W、Q24；H 除了四件后握把都画 | 156 |
| 旧枪补挂点 | 旧手枪、双管霰弹枪的 H 机匣；卡宾枪拆出原厂枪管（H、W）（第 6 节） | 6 |
| 合计 | | 约 269 |

参考体积：本批 ≤ 88 KiB。整包已不设硬上限（维护者 10-24），构建只报数，超出时在汇报里写原因就行。M2 实际每张约 212 字节。

手套不用重画，用 M2 的三张。

## 3. 三种图（摘自 ART-SPEC §2）

| 图 | 比例 | 尺寸 | 色板与轮廓 |
| --- | --- | --- | --- |
| H 持枪 | 1 图像像素 = 1 世界像素 | 手枪长 15–18，冲锋枪 22–27，霰弹枪 30–34，步枪 28–34；原厂配置高 ≤ 11（含手套）；组合后 ≤ 48×16 | 世界色板，外沿 `#242321` 收边 |
| I 格子图 | 约 H 的 2.5 倍 | 宽 ≤ 占格列数 × 36，高 ≤ 占格行数 × 26（见第 4 节每把枪的上限） | UI 色板 `C`，整圈 1 像素墨线 `#122027` |
| Q 方图 | 24×24、32×32 | 固定，不随配置 | 同 I |
| W 工作台 | I 的 2 倍，**单独重画** | 组合后 ≤ I 上限的 2 倍 | 同 I，可多几档中间色 |

- 透明底，Alpha 只有 0/255；不抗锯齿，不画影子、光晕、底板；左上来光。
- 单件颜色：H、I ≤ 8 色，W ≤ 12 色；组合后 H、I ≤ 16 色，W ≤ 24 色。
- 不画字母、数字、型号、刻字、厂标、商标形状，也不画虚构品牌的标志；原创像素画，不描照片，不用别的游戏的素材。
- **地上的枪和 HUD 武器卡现在用 H 原厂配置去掉手套的侧面图**（维护者 10-27：方图是局部特写，在地上认不出）。所以每把新枪的 H 原厂配置要能单独认出是哪把枪，不靠手套撑轮廓。
- Q 方图仍用在列表和详情：新枪像 G17、M4A1 那样画局部特写，配件画整件。两种方图都要在 1 倍、灰度下靠形状分得开。
- W 按 I 的轮廓在 2 倍上重画，加螺丝、导轨齿、纹理；不能把 I 放大充数。W 的挂点约等于 I 的 2 倍（差 2 像素以内）。

## 4. 七把新枪

先写清单字段：

- 机匣 H 要写 `grip`、`bore`、`forward`（手枪 8，其余 0）。
- 原厂枪管写 `muzzle` 和 `tip`。没有单独枪管图的枪，由机匣写 `muzzle` 和 `tip`（G17 的先例）。
- 前手 `hand`：有原厂护木的写在护木上；没有护木位的写在机匣上。手枪的 `hand` 和 `grip` 是同一点。

| 枪 | id | 占格 | I 上限 | 机匣要给的挂点 | 单独画的原厂件 | 要点 |
| --- | --- | --- | --- | --- | --- | --- |
| P226 稳定手枪 | `pb226` | 2×1 | 72×26 | `mount`、`barrel`、`muzzle`、`rearGrip`、`pistolSide` | 无（枪管藏在套筒里，同 G17） | 比 G17 略大、略方；B01 是 M2 的件，挂上要对得上 |
| MP5 近战冲锋枪 | `mpb5` | 3×1 | 108×26 | `barrel`、`handguard`、`stock`、`mag`、`mount` | 枪管、护木、枪托、弹匣 | 弯弹匣、圆护木 |
| Vector 9mm 高速冲锋枪 | `vb9` | 2×1 | 72×26 | `top`、`under`、`side1`、`muzzle` | 无（导轨都在机匣上） | 方正、有折角的短机身；前手 `hand` 写在机匣上 |
| M870 泵动霰弹枪 | `mb870` | 4×1 | 144×26 | `barrel`、`handguard`、`stock`、`rearGrip`、`mag`、`mount` | 枪管、护木（泵动）、枪托、握把、弹匣（管状弹仓） | 前手在泵动护木上 |
| M1014 半自动霰弹枪 | `mb1014` | 4×1 | 144×26 | `top`、`barrel`、`handguard`、`stock`、`rearGrip`、`mag` | 枪管、护木、枪托、握把、弹匣 | 和 M870 在 1 倍下分得开（例如枪托、顶部导轨） |
| AK-74 稳定步枪 | `akb74` | 4×1 | 144×26 | `barrel`、`handguard`、`stock`、`rearGrip`、`mag`、`mount` | 枪管、护木、枪托、握把、弹匣 | 弯弹匣 |
| AK-103 重型步枪 | `akb103` | 4×1 | 144×26 | 同 AK-74 | 同 AK-74 | 和 AK-74 在 1 倍下分得开（弹匣更弯更粗、颜色不同） |

- 两把 AK 的机匣请用**同一套挂点坐标**（三种图各自一致），AK 共用的配件才能一张图两把枪都对得上。做不到时，给某把枪单画变体（第 8 节命名）。
- 顶上有机械照门、装瞄具时应该拿掉的，可以单独画 `top` 原厂件（M4A1 折叠照门的先例）。不是必交，画了在清单里写。
- 原厂件的锚点照 ART-SPEC §3.3（例如枪托在最右一列和机匣对接的像素，弹匣在顶行最左的像素）。

## 5. 四十件配件

每件交 I、W、Q24。H 除了 P03、P04、P06、P07 都交（后握把被后手手套挡住，H 沿用原厂握把）。锚点照 ART-SPEC §3.3。

| 编号 | 名称 | 挂点 | 适配 | 还要写的字段 |
| --- | --- | --- | --- | --- |
| A01 | 旧手枪微型基座 | `mount` | 旧手枪 | 提供 `micro` |
| A02 | P226 微型基座 | `mount` | P226 | 提供 `micro` |
| A04 | MP 顶部基座 | `mount` | MP5 | 提供 `top` |
| A05 | 双管顶部基座 | `mount` | 双管霰弹枪 | 提供 `top` |
| A06 | 泵动顶部基座 | `mount` | M870 | 提供 `top` |
| A08 | AK 侧置基座 | `mount` | AK-74、AK-103（RPK 第二波） | 提供 `top` |
| B03 | MP 短枪管组 | `barrel` | MP5 | `muzzle`、`tip`（枪口后退） |
| B05 | 泵动短枪管组 | `barrel` | M870 | `muzzle`、`tip`（枪口后退） |
| B06 | 半自动收束枪管组 | `barrel` | M1014 | `muzzle`、`tip`（枪口前移） |
| B07 | AK 紧凑枪管组 | `barrel` | AK-74、AK-103 | `muzzle`、`tip`（枪口后退） |
| B09 | 卡宾精确枪管组 | `barrel` | 卡宾枪 | `muzzle`、`tip`（枪口前移）；见第 6 节 |
| H02 | AR 长导轨护木 | `handguard` | M4A1 | `under`、`side1`、`side2`、`hand` |
| H03 | AK 轻木护木 | `handguard` | AK-74、AK-103 | `hand`（没有导轨） |
| H04 | AK 导轨护木 | `handguard` | AK-74、AK-103 | `under`、`side1`、`side2`、`hand` |
| H06 | MP 紧凑护木 | `handguard` | MP5 | `side1`、`hand` |
| H07 | MP 扩展护木 | `handguard` | MP5 | `under`、`side1`、`side2`、`hand` |
| H08 | 泵动导轨护木 | `handguard` | M870 | `under`、`side1`、`hand` |
| H09 | 半自动稳固护木 | `handguard` | M1014 | `under`、`side1`、`hand` |
| S03 | AK 紧凑托 | `stock` | AK-74、AK-103 | |
| S04 | AK 实心托 | `stock` | AK-74、AK-103（RPK 第二波） | |
| S05 | MP 伸缩托 | `stock` | MP5 | |
| S07 | 泵动缓冲托 | `stock` | M870 | |
| S08 | 半自动控制托 | `stock` | M1014 | |
| P03 | AK 防滑握把 | `rearGrip` | AK-74、AK-103（RPK） | 不画 H |
| P04 | AK 轻木握把 | `rearGrip` | AK-74、AK-103（RPK） | 不画 H |
| P06 | 霰弹控制握把 | `rearGrip` | M870、M1014 | 不画 H |
| P07 | 九系防滑握片 | `rearGrip` | G17、P226 | 不画 H；握片盖在握把上，I、W 里画在机匣上面，清单写 `"layer": "aboveReceiver"`（同 M2 的 G01） |
| G03 | MP 快换匣 | `mag` | MP5 | |
| G06 | 泵动扩展供弹组 | `mag` | M870 | |
| G07 | 半自动扩展供弹组 | `mag` | M1014 | |
| G08 | AK-74 扩容匣 | `mag` | AK-74 | |
| G09 | AK 重弹鼓组 | `mag` | AK-103（RPK） | 弹鼓，比弹匣宽；注意 I 的高度上限 |
| M01 | 轻型消焰器 | `muzzle` | 旧手枪、G17、P226、MP5、Vector | `tip` |
| M02 | 近战补偿器 | `muzzle` | G17、P226、MP5、Vector | `tip` |
| M05 | 步枪消焰器 | `muzzle` | 卡宾、AK-74、AK-103、M4A1（AUG、RPK 第二波） | `tip` |
| M07 | 步枪紧凑消音器 | `muzzle` | 同 M05 | `tip`；H 里把枪口推出约 6–8 像素 |
| M10 | 通用霰弹收束器 | `muzzle` | M870、M1014 | `tip` |
| M11 | 双管收束组 | `muzzle` | 双管霰弹枪 | `tip` |
| T04 | 微型激光器 | `pistolSide` | G17、P226（M1911 第二波） | `beam` |
| T08 | 微型组合器 | `pistolSide` | 同 T04 | `beam` |

- M2 的件（O01、O03、O08、M03、M06、B01、F01、F03、T01、T05）也会装到新枪上。新枪的挂点要让它们对得上。某件在某把新枪上实在不合适时，给这把枪单画变体；不要改 M2 的原图。
- H 里侧挂设备、前握把、收起的脚架不能伸出枪口 `tip` 那一列。
- 层序（从后往前）：枪托 → 后握把 → 弹匣 → 枪管 → 机匣 → 护木 → 前握把 → 基座 → 瞄具 → 枪口件 → 侧挂设备 → 手套。不按这个顺序的写 `layer`（例如 P07 写 `aboveReceiver`）。

## 6. 旧枪和 M2 枪要补的

| 枪 | 这批新装的件 | 要交的 |
| --- | --- | --- |
| 旧式手枪 `pistol` | A01（再装 O01）、M01 | H 机匣 `gs-pistol-receiver-h`：和已验收的 `coast-weapon-pistol-held-v1.png` 逐像素相同，加 `mount`、`muzzle` 挂点。照 M2 卡宾 H 的写法：`wholeCanvasLayer`、`grip` [6,6]、`bore` 2.5、`tip` [17, 2.5]。I 是程序画的，不交 PNG，在本批清单的 `virtual` 里写挂点和 `tip`。W 已有 `mount`、`muzzle`，核对能装上 A01、M01 |
| 双管霰弹枪 `shotgun` | A05（再装 O03）、M11 | 同上：H 机匣和 `coast-weapon-shotgun-held-v1.png` 逐像素相同（`grip` [11,6]、`bore` 2.5、`tip` [32, 2.5]），加 `mount`、`muzzle`；I 写 `virtual`；W 核对 |
| 半自动卡宾枪 `carbine` | B09（换枪管）、M05、M07 | 枪管要能换，所以 H、W 再拆出原厂枪管：机匣出新版（`-v2`，写 `replacesSha256`）、新增 `gs-carbine-barrel-factory-{h,w}`。原厂枪管写 `muzzle` 和 `tip`；三层叠回必须和原图逐像素相同（H 对 `coast-weapon-carbine-held-v1.png`，W 对 M2 的两层）。I 照样写 `virtual` 的切层矩形 |
| G17 `gb17` | P07、M01、M02、T04、T08 | 挂点都已有，只核对 |
| M4A1 `mb4a1` | H02、M05、M07 | 挂点都已有，只核对 |

旧手枪、双管霰弹枪在目录里没有手枪侧挂位，T04、T08 装不上，不用给 `pistolSide`。

## 7. 预览配装（都已用兼容规则验过，可以装）

每套出 H（1 倍、3 倍）、I（1 倍、3 倍）、W（1 倍、2 倍）。新枪和卡宾、旧手枪、双管再加原厂配置。**用脚本按清单锚点拼，不手摆**。

| 枪 | 配装 A | 配装 B |
| --- | --- | --- |
| P226 | 轻巧：P07、M02、T04 | 精确：B01、M03、A02 + O01、T08 |
| MP5 | 近战：S05、B03、H06 + T01、M02 | 稳定：H07 + F01、T05，A04 + O03，G03、M03 |
| Vector | 近战：M02、F03、T05 | 远射：O03、M03、F01、T01 |
| M870 | 短：B05、S07、P06、M10 | 扩展：H08 + F01、T05，G06，A06 + O03 |
| M1014 | 控制：S08、P06、H09 + F01、M10 | 扩展：G07、B06、O03、H09 + T01 |
| AK-74 | 轻快：S03、H03、P04、B07、M05 | 稳定：S04、H04 + F01、T01，P03，A08 + O08，M07，G08 |
| AK-103 | 紧凑：S03、B07、H03、M05 | 重火：S04、H04 + F03、T05，A08 + O03，G09，M06 |
| 旧手枪 | A01 + O01、M01 | |
| 双管霰弹枪 | A05 + O03、M11 | |
| 卡宾枪 | B09、M07 | |
| G17 | P07、M02、T04 | |
| M4A1 | H02 + F01、T01、T05，M07 | |

（「H04 + F01、T01」表示 F01、T01 装在 H04 上。）每把新枪的 A、B 两套在 H 1 倍下轮廓要明显不同（长度、顶上、下面）。

## 8. 交付格式

```text
assets/gunsmith/incoming/m3-w1/
  gs-akb74-receiver-h-v1.png …        运行图，平放，不分子目录
  manifest.json                        本批清单
docs/gunsmith/art/m3-w1/
  README.md                            本批说明和汇报（第 10 节）
  assembly-records.json                拼装记录
  validate.mjs、validation.json        自查脚本和结果
  preview/                             预览图
  source/                              原图、提示词、逐像素记录、导出脚本
```

**命名**（照 M2）：id 全小写加连字符，以输出代号结尾、再加版本后缀；文件名是 `<id>.png`。

- 机匣：`gs-<枪>-receiver-<h|i|w>-v1`；原厂件：`gs-<枪>-<插槽>-factory-<h|i|w>-v1`，插槽写 `stock`、`reargrip`、`mag`、`barrel`、`handguard`、`top`。
- 配件：`gs-<编号>-<h|i|w>-v1`；给某把枪单画的变体在输出代号后加枪 id：`gs-h04-h-akb103-v1`。
- 方图：`gs-<枪>-q24-v1`、`gs-<枪>-q32-v1`、`gs-<编号>-q24-v1`。

**清单** `assets/gunsmith/incoming/m3-w1/manifest.json`：

- 和 `assets/gunsmith/manifest.json` 同一套字段（`schema: 1`、`revision`、`batch: "M3-W1"`、`totals`、`assets`）。
- 每条的 `file` 写 `assets/gunsmith/incoming/m3-w1/<id>.png`；接入时 Opus 搬到 `v1/`，改路径，哈希不变。
- `bytes`、`sha256` 按最终文件算；`colors` 写不透明颜色数。
- 改 M2 已有图（卡宾机匣）时：出 `-v2` 新文件，写 `replacesSha256`，不动 `v1/` 里的旧图。
- 程序画的旧枪 I 写在顶层 `virtual` 数组里，格式同 `tests/fixtures/gunsmith-assemblies.json` 的 `virtual`；切层的件另写 `rect`（在原图上的矩形）。
- 清单里不写玩家看得见的中文。

**拼装记录** `assembly-records.json`：第 7 节每套配装、每种输出一条，格式同 `tests/fixtures/gunsmith-assemblies.json` 的 `assemblies`，即组合尺寸、`tip`、每层的 key 和放置位置。Opus 接入时会拿游戏的拼装逐像素对比它和你的预览图，M2 也是这样验的。

**预览** `preview/`（都不是游戏截图）：

1. 逐件：按枪拼成总览图（contact sheet），每件 1 倍和 3 倍，放在深色 `#101c22`、沥青 `#4b4842`、浅色 `#c9c0ac` 三种底上，另出灰度版。
2. 拼装：第 7 节每套配装的 H、I、W，文件名带配装名，例如 `akb74-steady-h-3x.png`。
3. 拿在手里：H 拼好的枪放到身体帧上看比例（`bore` 行对齐身体帧第 26 行，`grip` 放在 x = 16 + `forward`），1 倍和 3 倍。
4. 地上和 HUD：每把新枪的 H 原厂配置去掉手套，1 倍、2 倍各一张。
5. 卡宾、旧手枪、双管：叠回原图的差异像素数（都应为 0）。

单个预览 PNG 尽量小于 1 MB。`source/` 里的大图也尽量控制在每张 1 MB 以内。

## 9. 分两段交

**P0（先交，交完停下等确认）**：AK-74 全套，以及它两套配装用到的新件。

- AK-74：机匣 H/I/W，五个原厂件 H/I/W，Q24、Q32，共 20 张。
- 配件：S03、H03、P04、B07、M05、S04、H04、P03、A08、G08、M07，每件 I/W/Q24，H 除了 P03、P04，共 42 张。
- 预览：AK-74 原厂、轻快、稳定，加上 M2 的 O08、F01、T01 装在 AK-74 上的样子。

**P1（P0 确认后）**：其余全部。

## 10. 自查与汇报

推送前自查（写进 `validate.mjs`，不依赖项目代码，`node docs/gunsmith/art/m3-w1/validate.mjs` 能直接跑，结果写 `validation.json`）：

1. 每个文件都在清单里，清单里的每条都有文件；`bytes`、`sha256`、宽高对得上；id 唯一，文件名等于 id。
2. Alpha 只有 0/255；颜色数在上限内；没有空图；Q 方图正好 24×24、32×32。
3. 锚点、挂点都在画布内（`tip` 可以在右沿上）；第 7 节每套配装拼得出来，接缝只有一条墨线、没有缺口；组合尺寸不超过第 3、4 节的上限。
4. 旧枪切层叠回与原图逐像素相同（差异 0）。
5. 本批字节合计，以及加上 M2 的累计字节。

汇报写在 `docs/gunsmith/art/m3-w1/README.md`，同时在 PR 留言：

- 完成了哪些（按 id）、缺哪些、原因；
- 已知问题、和本书不一致的地方；
- 字节合计、实际调用绘图工具的次数；
- 预览图的路径。

PR 留言里可以直接贴预览图。

## 11. 不要做的事

- 不改两个目录以外的任何文件，不改 M2 的图（要改就出 `-v2`，放在本批目录）。
- 不运行 `scripts/gunsmith-assets.mjs`、不改正式清单，这些 Opus 做。
- 不要把一种图放大或缩小来当另一种图。
- 不画字、数字、标志、序列号，不描照片，不用别的游戏的素材。
- 零件上不画手；不画激光束、灯光、枪口火、展开的脚架。
- 不画影子、光晕、底板、抗锯齿边、半透明像素。
- 不在 W 上画插槽标记、框或文字。
- 不强推、不合并 PR、不动别人的分支。
- 规则做不到或觉得不对，写进汇报，不要自己改规矩硬凑。

## 12. 验收

- 维护者和 Opus 先看预览。
- Opus 再接进游戏（M3-04）：行动里八个朝向持枪，火光从组合的枪口出来，前手落在护木或前握把上；仓库、工作台、地上、HUD 里的样子；1280×720、1920×1080 截图。
- 不合格的件单独返修，合格的件保持原样。

第二波（M3-07：M1911、UMP45、P90、SVD、M14、M700、AUG、RPK 和其余 40 件配件）等第一波接入后另出任务书，提交到同一个 PR。
