# #75 PR ② 的证据：受击档位、按开火合并、墙门反馈与镜头推动

分支 `feat/hit-feel-visuals`，基于 main `8c5df6b`，2026-10-26 本地实测（Windows，本机 Chrome 156.0.8078.48）。对照的 main 构建为 blob `ba521f8`。

| 文件 | 内容 |
| --- | --- |
| [check-i-main.json](check-i-main.json) | 新增的 `test:shooting` 检查 i 在 main 构建上的报告：失败 |
| [check-i-fix.json](check-i-fix.json) | 同一检查在本分支构建上的报告：通过 |
| [blow-tiers-60hz.png](blow-tiers-60hz.png) | 同一敌人分别挨普通一发、暴击、旧版设置下的暴击，60 帧/秒逐帧裁图 |
| [impacts.png](impacts.png) | 打墙、打门和旧版设置下的弹着点特效，每 4 帧一格 |

## 检查 i 的结果

在当前批次的副本上合成事件，停住 ticker，按 1/60 秒调用 `present()`。

| 情形 | 本分支 | main |
| --- | --- | --- |
| 暴击一发 | 1 档：闪白 5 帧，后退 3 像素，受击 7 帧、恢复 3 帧，血 6 滴 | 闪白 4 帧，后退 2 像素，受击 5 帧，血 6 滴 |
| 同一枪四颗弹丸同时打中 | 1 档，同上；血一次 12 滴 | 0 档；每颗各喷 6 滴，共 24 滴 |
| 同一枪六颗弹丸分两批打中 | 一次受击（闪白 5 帧不重来）；血 10 滴，第二批只补 6 滴 | 第二批重新闪白、受击；两批各 18 滴 |
| 旧版设置下暴击一发 | 和 main 相同 | — |
| 玩家被向东的子弹打中 | 镜头当帧向西偏约 1.9 像素（推 2.5 像素，当帧的镜头回正已经收回一部分） | 不动 |

## 撞击声响度

离线渲染（48 kHz，不经过限幅器，3 次平均），前 80 ms 的 RMS：原来共用的撞击声 0.012，打墙 0.013，打门 0.013。打门最初是 0.020，调低后与原来相当。

## 其他检查

`test:shooting` 全部步骤、`test:browser`、`test:coast-animation` 8/8、`coast-render-target-test` 5/5、`test:asset-load`、`test:ui`、`test:range`、`test:art`、`node scripts/coast-audio-test.mjs` 14/14 都通过。单测见 `tests/blow-feel.test.ts`，以及 `tests/coast-sound.test.ts` 的墙门一例。

裁图和测量脚本是一次性的，没有提交。没有做真人试玩或真机测试；致死档（2 档）只有单测覆盖，因为敌人被打死后身体立刻换成倒地动画，画面上看不到这一档的后退。
