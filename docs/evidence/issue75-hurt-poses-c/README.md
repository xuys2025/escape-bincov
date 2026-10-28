# #75 受击姿态接入（C 组）的证据

分支 `feat/hurt-poses-c`，基于 main `7d1827c`（#122 已合入），2026-10-25 本地实测（Windows，本机 Chrome 156.0.8078.48）。本分支构建为 `dist/index.html` blob `8fad0cb`；对照的 main 构建为 blob `0fa9c73`。

| 文件 | 内容 |
| --- | --- |
| [check-g-main.json](check-g-main.json) | 加了 C 组断言的 `test:shooting` 检查 g，在 main 构建上的报告：闪白、后退、血迹，以及 A、B 组的姿态都通过；只有盐枭头目、突击兵、盐壳重躯、盐背犬四类的姿态失败，身体全程是普通帧 |
| [check-g-fix.json](check-g-fix.json) | 同一检查在本分支构建上的报告，通过 |
| [c-frames-west.png](c-frames-west.png)、[c-frames-south.png](c-frames-south.png) | 游戏渲染结果（`worldRT`）裁图：盐背犬、囊腹喷吐兽、潮蚀蟹、突击兵、盐壳重躯、巡逻队员同时中弹，朝西（东向帧镜像）和朝南各一张，60 帧/秒下命中当帧到 +8 帧 |
| [c-hurt-1280x720.png](c-hurt-1280x720.png)、[c-hurt-1920x1080.png](c-hurt-1920x1080.png) | 两档分辨率的游戏实景，朝南，停在 +4 帧：受击帧、闪白刚结束 |

命中后的身体帧序列，60 帧/秒，从命中当帧算起（H 受击，R 恢复，- 普通帧）：

| 原型 | 本分支 | main |
| --- | --- | --- |
| 盐枭头目、突击兵、盐壳重躯、盐背犬（检查 g） | `HHHHHRRR-------` | 全部 `-` |
| B 组三类、A 组各帧率 | 与 #99、#103 相同 | 与 #99、#103 相同 |

裁图里的六类也都是受击 5 帧、恢复 3 帧。

## 做法

和 A、B 组相同：种子 42，冻结 AI，在当前批次的副本里取活着的敌人，按原型的基础种类和武器画成对应原型，排在玩家一侧，其他角色移到画面外；送一次合成的 `blow` 命中，停住 ticker，按 1/60 秒调用 `present()`。实景在 +4 帧调用 `app.render()` 后截取整页。脚本是一次性的，没有提交。

## 图集验收

图集的程序检查、首轮验收（犬和喷吐兽整只缩小，返工）和复验记录在 #122 的两条评论里：[首轮](https://github.com/xuys2025/escape-bincov/pull/122#issuecomment-6398466408)、[复验](https://github.com/xuys2025/escape-bincov/pull/122#issuecomment-6398909150)。

只验证了帧序列和观感截图，没有做真人试玩或真机测试。
