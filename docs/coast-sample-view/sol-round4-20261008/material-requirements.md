# 首批素材需求状态 · 97c0b44 复验

本说明承接 [Opus第四轮](../round4/README.md)，更新第三轮的待定需求；不修改历史交付PNG或原始提示词。当前正式清单为 [runtime manifest](../../../assets/coast/manifest.json)，来源为 [Sol revision 2](../sol-round3-20261008/assets/manifest.json)。本轮没有生成、修改或追加游戏素材；仅保存验证截图。

| 项 | 当前需求与复验边界 |
| --- | --- |
| 数量 | 玩家25帧、墙11、地面6、卡宾枪1，共43；所有ID、尺寸、脚底/握把/枪口锚点和PNG SHA保持不变 |
| R01–R07 | 第二版返修已经由Opus正式接入；不再使用第三轮只换PNG的预览副本 |
| R08背向持枪 | 当前前端采用纵深缩短并按身体前后排序；不是第三轮manifest的隐藏武器建议。由正式构建V02及八方向实机图复验，不需要追加握姿PNG |
| R09镜像 | W/SW/NW继续镜像E/SE/NE。运行时15组（3方向×5帧）缓存体图与对应水平翻转逐通道相同；光照最终展示沿用Opus第四轮决定，不追加西向原画 |
| R10下蹲 | Runtime没有下蹲状态；无需下蹲图片。死亡约0.16秒过渡应由运行时站立体图倾倒到尸体。**真实击杀路径当前直接换尸体，倾倒未生效**，详见[遗留清单](defects.md)。这是Opus视图事件顺序问题，不能以追加图片关闭 |
| 仍占位的部件 | 敌人四类、尸体、南北向门窗、其他枪/近战武器、混凝土/木地板/泥地/水面。仅登记，不制作、不扩量 |

第三轮原manifest的“R08 requires integration / R09 pending / R10 blocked”和 `pixelPolicy.crouch` 为当时交付快照。本说明是本轮需求状态，历史文件不回写成当时已验收；未来批次manifest应标注 crouch: not required，death transition: runtime fall，并引用最新Opus决定。PNG源图、提示词和哈希仍以原文件追溯。
