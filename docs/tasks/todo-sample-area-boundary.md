# SAMPLE_AREA 共享数据边界（PR #145）

顺序集成：#144 完整 CI 后合入 `13c9b80c`，本分支已继续正常同步；只解决清单/交接新增记录，产品源码与已验 `362bf3e6` 相同。新主线村庄专项 5/5、页面错误/外部请求 0；HTML `b047c6a07135d1c85f8b811040a62f5aceea2dc8009b3730b1700f90b577c2cf`，两档空字段 Date42→48、显式42保持、普通入口无测试接口均通过，[新报告](sample-area-boundary/main-sync-village.json)。

主审同步（2026-10-29）：main 在实施后合入 #132，已正常同步 `e2728e46`，保留双方交接；scene 与主线的差异仍只有样板范围 import。同步后 Node 24.21.0 的单测 1080/1080、工程守卫 115/115、打包通过，便携 ZIP 6,100,983 B。新主线浏览器与准确 head 平台门禁另见原 PR；以下首轮报告对应原记录哈希，保留不覆盖。

状态：**已完成并合并**。[PR #145](https://github.com/xuys2025/escape-bincov/pull/145) 准确 head `12a89a88` 经主审及完整 [CI 40826870648](https://github.com/xuys2025/escape-bincov/actions/runs/40826870648) 后合入 main `4fec648c`，合入树与受检树相同。只核销 [#60](https://github.com/xuys2025/escape-bincov/issues/60) Q-E02 的 SAMPLE_AREA 余项；商场本地旧版首败保留，总单保持开放。

## 实现与边界

开工重新 fetch，已接受基线为 `03cfb775fbef07c711fe789e9f6e886460261a91`，原草稿 head `393ad5756e147a861c4b70a2aa3c6ac91e4c479d`；原 PR open/draft，无评论。维护者本轮指定 GPT-6.1 Sol 实施，主代理独立审查与决定合并。

- 唯一定义在零依赖纯数据 [sample-area.ts](../../src/sample-area.ts)，世界像素仍为 x=96、y=32、w=1088、h=832。
- [raid-areas.ts](../../src/raid-areas.ts) 与 [scene.ts](../../src/coast-view/scene.ts) 直接读取同源；[appearance.ts](../../src/coast-view/appearance.ts) 不持有、不转发。scene 只改顶部 import，本体留给 #146。
- `villageSeed` 本体、400 次搜索与 fallback 原样。普通入口、显式 test/sample、显式种子、商场布局 4 均不变；未改世界/布局/存档版本、RNG、生成规则、区域注册、楼梯或素材。
- [源码守卫](../../scripts/ci/source-health.test.mjs) 对 sample-area 检查 DOM/Pixi/视图传递依赖，对读取 URL 的 raid-areas 检查模块归属；[反例](../../scripts/ci/source-graph.test.mjs) 即使经纯 helper/re-export 借用 appearance 也会失败。

## 实际验证（2026-10-29，Windows）

工具：`D:\bincov\.bincov-tools\node-v24.21.0-win-x64\node.exe`（Node 24.21.0），`D:\bincov\.bincov-tools\pnpm11.19\node_modules\pnpm\bin\pnpm.cjs`（11.19.0）。首个离线安装因缓存缺 tsx tarball 失败；随后 `install --frozen-lockfile --registry=https://registry.npmjs.org` 成功，锁文件未改。没有绕过测试锁或 Git 钩子。

| 检查 | 结果与证据 |
| --- | --- |
| 旧版选种对照 | 先执行原 head 获取 8 个固定 from 结果：0→5、1→5、3→5、42→48、400→407、999999999→1000000000、1793250000000→原值、4294967295→4294967301；迁移后全部一致，且有样板内出生与 north 出口。永久断言见 [raid-areas.test.ts](../../tests/raid-areas.test.ts) |
| 搜索边界 | 执行真实 selector，仅替换世界生成器：半开边界、无 north 走完400次并返回from、第400次能成功、第401次不检查；普通/test/sample URL与商场layout4断言通过 |
| 依赖方向 | `pnpm architecture src/raid-areas.ts --json` 运行时传递依赖仅 sample-area/world；临时恢复原 selector 与 appearance 定义后，source-health以exit1指出精确反向路径，[负对照记录](sample-area-boundary/direction-negative.txt)；finally恢复源码后同一守卫通过，另有helper转发负例 |
| `pnpm test` | 1059/1059通过；后续只补了第400/401候选断言，定向3/3再通过 |
| `pnpm check:ci` | 115/115通过 |
| `pnpm package` | 通过，单文件离线HTML；便携ZIP 6,035,938字节，web ZIP 6,031,429字节，未提交生成物 |
| 制品 SHA-256 | HTML `32d1ddc92905f5b427d5b23d5e0c7aec71b71f793fafb8575e1945eb2dbf63a1` |
| `pnpm checks --risk=world` | 已读取并执行所列套件，具体结果如下 |
| `pnpm test:buildings` | [9/9通过](sample-area-boundary/buildings.json)，含普通部署、门事务、刷新与触屏 |
| `pnpm test:mall-passages` | [通过](sample-area-boundary/mall-passages.json)，7通道各步行/冲刺10次往返 |
| `pnpm test:mall-landing` | [2/2通过](sample-area-boundary/mall-landing.json)，拥挤落点拒绝、单空位重试及持续输入 |
| `pnpm test:raid-default` | [11/11通过](sample-area-boundary/raid-default.json)，普通出击、旧coast/商场1版、商场4版、显式sample、无WebGL与触屏 |
| `pnpm test:mall-sample` | [当前23/25](sample-area-boundary/mall-sample-current.json)；[原393客户端也23/25](sample-area-boundary/mall-sample-original393.json)，同样M03c/M21失败，不记为通过，详见下面的首败对照 |
| 村庄专项 | [5/5通过](sample-area-boundary/village.json)：两档各空字段固定Date42→seed48（出生仍在样板内）/显式42保持42，样板标志为true；普通sample无test接口。两档真实截图：[1280×720](sample-area-boundary/village-1280x720.png)、[1920×1080](sample-area-boundary/village-1920x1080.png) |
| 最终准确head CI | 推送后更新原PR；本地结果不替代平台CI |

浏览器在主代理协调的串行时段运行（13:10起，UTC+8），使用已打包HTML、Chrome `156.0.8078.48`和离线上下文；全部报告零页面错误、零外部请求。村庄通过真实院子出击；仅显式test入口固定Date.now=42、冻结AI并读取检查点，未改变模拟帧时间。专项脚本第一版误以为院子会预填48，实际字段保持空白、host在提交时调用seedFor；修正测试脚本后验证检查点seed，未修改产品。

## 商场首败与有效旧版对照

没有重跑覆盖首败。相同脚本/Chrome完整执行原393客户端，仍在同两项失败：M03c“hidden again…dt0”当前差异51508、旧版209704，均要求0；M21 x29当前sunk=0.9694999999999981、旧版0.97，clear=0、dy=48、h=32、full=80、bottom=0。这些断言涉及未改动的遮罩/墙过渡，不因本次范围迁移改产品或放宽断言；交由主代理结合准确head CI审查。

旧客户端由共享 `buildGameScript` 的原配置构建，通过onLoad读取 `git show 393ad575:<path>` 恢复本任务改过的3个运行时源码（raid-areas、appearance、scene）；其余源码与原393一致，新sample-area未被旧import引用。保留同一HTML模板与全部原资源，不使用当前selector或替身冒充旧版。旧HTML SHA-256 `a190498102bdf579ed82b70627ea2c1e36ce339ac76881db85e4977a99c21c45`；生成HTML只留忽略目录，未提交。

## 剩余边界

没有改变玩家行为、存档事务或单文件能力。真人手感、真机、长时性能不在本次签收范围；不因本PR关闭 #60/#32/#26，也不部署未经main验证的制品。
