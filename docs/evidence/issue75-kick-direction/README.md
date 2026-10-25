# #75 受击抖动方向的证据

分支 `fix/hurt-kick-direction` 的本地实测（2026-10-24，Windows，本机 Chrome 156.0.8078.48）。修复说明见 [handoff](../../../handoff.md) 当日条目；慢帧时序的旧证据见 [issue75-slow-frames](../issue75-slow-frames/README.md)。

| 文件 | 内容 |
| --- | --- |
| [check-g-main.json](check-g-main.json) | 更新后的 `test:shooting` 检查 g 在 main 构建上的报告（`04736f7` 的 `dist/index.html`，blob `d8ed2b8`）：帧数与血迹通过，只有方向失败：东向子弹抖 -2,0、南向子弹抖 0,-2，都朝射手 |
| [check-g-fix.json](check-g-fix.json) | 同一检查在本分支构建上的报告（blob `7fbc6f5`）：东向 2,0、南向 0,2；60/30/15/12/10 帧/秒的闪白与抖动仍为 4/2/1/1/1 帧；血滴沿子弹方向的速度全部为负（朝射手），且与 main 逐个相同；检查通过 |
| [hurt-kick-crops.png](hurt-kick-crops.png) | 游戏渲染结果（`worldRT`）裁图：main 与本分支在 60 帧/秒下，东向、南向两次命中的当帧及其后五帧，同一个敌人 |

裁图与检查 g 的做法相同：种子 42，冻结 AI；在当前批次的副本里把一个存活敌人放到玩家东侧 64 像素，送一次合成的 `blow` 命中；停住 ticker，按 1/60 秒调用 `present()`。每帧从 `worldRT` 裁出敌人周围 56×64 世界像素，放大 3 倍。南向那次的角度按子弹自北向南给出，只用来检查纵轴，场景里的玩家仍在敌人西侧。东向命中的血滴喷向西侧，两边相同；南向命中的血滴向北飞，很快落到身体后面，裁图里基本看不到，方向由检查 g 读粒子速度确认。裁图脚本是一次性的，没有提交。
