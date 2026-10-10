> 合并整理说明：本文结论与历史失败保留，8 个原始证据链接转至[归档说明](../../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 实际绘制与截图检视

产品均为固定68daab4。PNG原样复制，未修图、调暗或拼接；SHA与尺寸见证据索引。图像是本机Chrome/ANGLE自动化实景，不能代替真人、显示帧率或原生GPU内存验证。

## 院子当前GL恢复

逐张查看程序脚本的同位置前后图：

| 尺寸/负载 | 恢复前 | 恢复后 | 检视 |
| --- | --- | --- | --- |
| 1280×720，包含反复模拟8/16能力切换 | [before（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [after（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | 玩家/相机/建筑位置相同，墙面、屋顶、人物、地面及院门完整，无空白绘制；雨、火光、提示与NPC相位有变化 |
| 1920×1080，原恢复/resize能力用例 | [before（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [after（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | 同位置结构与遮挡连续，宽屏上方行走NPC相位不同；不宣称逐像素相等 |

另有当前上下文isProgram/LINK_STATUS、uniform位置、uTextures与实际scratch RGB读回断言。上述实景检视与数值绘制证据相互补充。旧版与新版原R1-after图尺寸不同（旧1100、新1280），只作各自绘制记录，不作配对差分。

## 城中村恢复后继续

最终生命周期脚本两组前后图均已独立查看：

| 尺寸 | 丢失前 | 恢复并显式继续后 | 检视 |
| --- | --- | --- | --- |
| 1280×720 | [before（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [running（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | 玩家原位、生命100，墙、屋顶、物件、武器与HUD恢复；钟9:57→9:54、雨相位变化 |
| 1920×1080 | [before（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | [running（已归档）](../../IMPLEMENTATION-ARCHIVE.md) | 结构与玩家位置恢复，右下人物仍绘制、相位变化；钟9:57→9:54 |

图只能证明恢复后有正常实景；冻结与继续语义以HUD正对照、保存字节及直接发布的simulationTime断言为准。院子/Host帧继续增加不作为局内逻辑推进的替代证据。

首次资产故障失败截图中raid仍运行、武器图标缺失，支持故障注入目标过期的诊断；最终资产子项明确为预载PNG复制失败，冷PNG解码未测。J1首次失败截图与DOM/动画/输入时间线一并保留，不以截图单独认定产品丢点击。
