# 生成提示词与来源

日期：2026-10-07。使用内置 `image_gen`，未使用 CLI/API 备选路径。

## 电台面板

最终选用第一版电台结果。输入为母版裁切 `(1040,470,250,130)` 与完整母版。

```text
Use case: precise-object-edit.
Asset type: transparent replacement game-art crop, radio-panel.png.
Input image 1 is the EXACT target crop of a fixed 1672x941 master scene: global x=[1040,1290), y=[470,600). Its 250x130 bounds and object coordinates MUST stay registered; do not center, fit, enlarge, rotate, complete cropped parts, or change perspective. Input image 2 is the full master for warm lamp lighting and cool night palette context ONLY.
Primary request: redraw ONLY the radio itself inside image 1, simplify its front face into readable broad shapes and remove the table, map, bag, cords outside the radio, and other surroundings to actual transparent alpha. Retain original dark charcoal/olive metal body contour, top plane and visible right side, with warm upper-right rim light and dark lower/right plane shadows. The radio remains cropped by the supplied top/left/bottom bounds where appropriate; don't turn this into an isolated centered product shot.
Canvas requirement: 250x130 output, corresponding exactly to the supplied reference crop. If generation resolution must be larger, use an exact integer enlargement 1000x520 and maintain these coordinates scaled 4x.
Panel organization in BASE 250x130 coordinates: left clear horizontal speaker slats in the left-front region; ONE warm ivory rectangular analogue level meter near local x=72..132,y=35..70 (global x=1112..1172,y=505..540), with ONE simple muted red needle and a few organized short dash marks, no numbers. Right region 3-4 substantial round knobs, each at least 14 BASE pixels diameter, with one warm lit side and one deep shaded side. Include one orderly row of short toggle switches; every visual detail must occupy at least 3 BASE pixels. Keep top unit fragments where visible within this crop; keep top and right planes explicit so it has thickness.
Style: refined hand-painted pixel-inspired game prop, larger clean connected color masses, no surface speckles, no fine line hatching, no distress grains, no photoreal texture. Final art will be area-averaged to a 640x360 scene grid later, so shapes must be bold at the source scale. Lighting, scale and camera angle exactly match the full master.
Transparency: ONLY radio body opaque, surrounding regions completely transparent. Clean sharp alpha edges, no translucent lighting halo or cast shadow on an invisible table. Do not paint a checkerboard or any opaque background.
Avoid: any text, numbers, glyphs, labels, logos, watermarks, tiny markings, decorative noise, changes to source contour or position.
```

## 步枪

最终选用裁切构图修订版。输入为母版裁切 `(1150,600,380,260)`、第一版简化图和完整母版。另试过整幅母版透明提取，其位置不合适，未交付该版本。

```text
Use case: precise-object-edit.
Input 1 is the AUTHORITATIVE ORIGINAL fixed 380x260 crop (x=1150,y=600 of the 1672x941 scene). Input 2 is a previous simplification draft; use it ONLY for clean large wood/steel color-block rendering. Input 3 is full master context.
Correct the draft's COMPOSITION to match INPUT 1 exactly: it currently makes the stock too large and too low/right. Redraw the SAME original rifle and original canvas sling as a transparent replacement. DO NOT change the original rifle contour, axis, angle, scale, length or any crop registration.
Output framing is exactly input 1's fixed 380x260 field, with the same empty margins left untouched/transparent. Reference features in BASE coordinates: visible barrel at x=0,y=0, fore-end center around (103,57), trigger guard center around (186,113), stock neck around (224,123), butt/stock end around (343,193), lowest stock pixels around y=213. There MUST be transparent space below the stock, down to canvas y=260. Rifle's main silhouette must NOT extend to rightmost edge x=380 or bottom edge y=260. Original sling attachment near (116,72), follows broad curved route below rifle, bottom of strap about y=243. Keep its exact original curved silhouette and uniform strap width rather than a long straight diagonal strap. The muzzle is cropped by the LEFT edge; do not invent a complete muzzle.
Exact output canvas 380x260, or proportional integer enlargement 1520x1040 if required. Preserve composition by mapping the entire output field to the entire original crop, not by fitting the object inside a new frame.
Keep draft simplification: 2-3 large muted brown wood tones; 2 main steel blue-grey tones with overhead warm light; uniform olive canvas sling. No screws, timber grain, scratches, engraving, stitches, stray single pixels, extra hardware or fine detail thinner than 3 BASE pixels. Match original perspective and warm lamp/cold shadows. No text.
Remove EVERY non-rifle/non-sling object from input 1: tabletop/map/mug/ammunition/papers/bag must all be fully transparent. Crisp alpha edges, no semitransparent fringe, no fake checkerboard, no table shadow. This is a production registered sprite replacement, not a catalog drawing or fresh scene.
```

## 中文字标

最终选用字形参考修订版。辅助参考为本机 Microsoft YaHei Bold 排版的“逃离／滨科夫”像素字形图，用于约束汉字结构；最终图案由 image_gen 重绘。此前两版字标因小尺寸粘连未选用。

```text
Use case: precise-object-edit. Production Chinese pixel logo.
The attached bitmap is a CLEAN TYPOGRAPHIC GLYPH AND LAYOUT GUIDE. Use its correctly formed five simplified Chinese characters as the authoritative structure. Text is exactly "逃离" on upper row, "滨科夫" on lower row. Preserve EVERY distinguishing component and internal open counter. Improve the block-letter style into industrial stencil/painted dock lettering, not a noisy generated distressed logo. Do not replace glyphs with lookalike symbols.
The artwork is a logical 144x72 sprite and must stay aligned to that exact grid (reference is its exact 8x enlargement). Return the same 1152x576 8x representation of the 144x72 grid if needed. Make each logical pixel a solid 8x8 square, not a high-resolution smooth logo; 144x72 downsample must keep all character counters open. Top row smaller and centered. Bottom row larger, evenly spaced, with ALL strokes inside a 3-logical-pixel transparent margin; slightly shorten its height relative to the guide so bottoms do not touch the canvas edge.
Strokes at least 3 logical pixels thick; clean corners and coherent stair-step diagonals. Retain the top small dot and all parts of 辶+兆 in 逃, full structure of 离; 氵+宾 in 滨, 禾+斗 in 科, and two horizontals plus legs of 夫. Negative spaces between neighboring strokes large and regular; do not plug counters or fuse unrelated strokes. Use subtle consistent stencil breaks only if they aid legibility. No distressed particles, no tiny accidental holes.
Ink ONE single uniform warm ivory #e5d9ac, alpha only 255 on strokes and 0 background, no grey or semi-transparent pixels. GENUINELY TRANSPARENT background. No gradients, extruded edge, outline, shadows, halo, noise, flecks, scattered pixels, textures, fake checkerboard, additional text or watermark. Clean geometric flat pixel artwork only.
```

## 输出整理

生成工具输出较大的 PNG 后，以整个生成画布缩到需求指定大小，没有对生成物另行自动紧裁切或居中。System.Drawing 仅用于需求中的参考裁切、输出尺寸整理、alpha 二值化、字标统一颜色和最近邻放大预览；没有将概念图接入游戏。

最终统一 alpha 阈值为 128，小于阈值全透明，否则全不透明。字标所有可见像素统一为 `#e5d9ac`。道具图保留生成的受光颜色，尚未套用共享色板，供 Claude 接入现有面积采样与色板流程。

