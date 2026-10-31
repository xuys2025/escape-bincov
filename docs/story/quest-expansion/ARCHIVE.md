# 文稿归档清单

2026-11-01。合审稿与原稿的用途见[literary入口](literary/README.md)；原稿只留证，不作为现行显示条件。原稿指收到的对应批次版本，G01/G02是Gemini定点返修后的输入，G03/G04是Codex校订前保存的Gemini回稿。

仓库统一LF换行，下面主表SHA-256按UTF-8、LF计算；另记收到时原始字节哈希。除换行规范化，originals不改正文、条件或旧自检。版本：原设计`7edc174fc8c81e89b2965927e514c64299215cf5`，合审main`8a28da9873e5188e13053f894e5b6bbb0ae10dc8`。

| 批次 | 槽位 | 正文字符 | 文件 | SHA-256（UTF-8/LF） |
| --- | --- | --- | --- | --- |
| G01合审 | 57 | 5659 | [G01-两图委托.md](literary/G01-两图委托.md) | `9ad7e988288bffebda71d2572a44ed2e9e899d80b2e7a08a9a7665433ce7f30c` |
| G01原稿 | 历史输入 | 不作现行预算 | [G01-两图委托.md](literary/originals/G01-两图委托.md) | `e9b9834a14d18d93455f8bbc25a1b9ae83dad0261b5efca7a9cfa2e14bf3944b` |
| G02合审 | 81 | 7910 | [G02-联系找路医疗.md](literary/G02-联系找路医疗.md) | `651d609c5816a6ad913aae060402d5b115c96ceade7652da4962bd5aec72ac02` |
| G02原稿 | 历史输入 | 不作现行预算 | [G02-联系找路医疗.md](literary/originals/G02-联系找路医疗.md) | `a17d36f3e6a7e97f02005f0b06808e47c73538bf1bdf455327bb4b64c8a1d8a2` |
| G03合审 | 103 | 7993 | [G03-运输调查准备.md](literary/G03-运输调查准备.md) | `3e2f3f516746103f82047a6c0c3dcdfb99b3d7aa56e3f92df2adc733c5e7726f` |
| G03原稿 | 历史输入 | 不作现行预算 | [G03-运输调查准备.md](literary/originals/G03-运输调查准备.md) | `0b9b32cf23fcf724380b527f63a8ac1c3798d721c2fab9acd22f7ca3ac4c123e` |
| G04合审 | 45 | 6966 | [G04-路线与人物结果.md](literary/G04-路线与人物结果.md) | `7e0493aa5800b5a1a419ebf9db0c1b118d3c427a7b7e39705e6b3807f4ed88f4` |
| G04原稿 | 历史输入 | 不作现行预算 | [G04-路线与人物结果.md](literary/originals/G04-路线与人物结果.md) | `27634f9d9935a3189e0d3fe38a053ea414f1dfd64b354a93c93e5f04e31f4fdb` |

## 原始输入字节与合审前版本

| 批次 | 原始字节SHA-256 | 合审开始时文稿字节SHA-256 |
| --- | --- | --- |
| G01 | `e9b9834a14d18d93455f8bbc25a1b9ae83dad0261b5efca7a9cfa2e14bf3944b` | `e9b9834a14d18d93455f8bbc25a1b9ae83dad0261b5efca7a9cfa2e14bf3944b` |
| G02 | `a17d36f3e6a7e97f02005f0b06808e47c73538bf1bdf455327bb4b64c8a1d8a2` | `a17d36f3e6a7e97f02005f0b06808e47c73538bf1bdf455327bb4b64c8a1d8a2` |
| G03 | `0b9b32cf23fcf724380b527f63a8ac1c3798d721c2fab9acd22f7ca3ac4c123e` | `a1327589bad49686974f01d0b4297098c6b97f2e7470bbb0bffc654055ac6cb1` |
| G04 | `27634f9d9935a3189e0d3fe38a053ea414f1dfd64b354a93c93e5f04e31f4fdb` | `63ce6541d2c1a7c1ef1866a4ab7ddd934300991eae61cb0fb0ba977591a35b08` |

G03原始副本来自2026-10-31 23:06:07备份，G04来自23:46:58备份；开始合审时的G03/G04已经过单批校订，因此两列不同。原始字节备份继续留在本地交付目录；仓库文本换行服从现有.gitattributes，不新增例外。

## 槽位分组索引

### G01

六标准槽任务：`sq01`、`sq02`、`sq03`、`sq04`、`sq05`、`sq06`。每个均为offer/progress/ready/complete/retry/repeat。

其余槽位：`text-sq01`、`text-sq02`、`text-sq02-02`、`text-sq03`、`text-sq04`、`text-sq05`、`text-sq06`、`br01-01`、`br01-02`、`br01-03`、`br01-04`、`br02-01`、`br02-02`、`br02-03`、`br03-01`、`br03-02`、`br03-03`、`br04-01`、`br04-02`、`br04-03`、`br04-04`。

### G02

六标准槽任务：`ch01-n03`、`ch02-n01`、`ch02-n02`、`ch02-n03`、`ch03-n01`、`ch03-n02`、`ch03-n03`、`sq09`、`sq10`、`sq11`。每个均为offer/progress/ready/complete/retry/repeat。

其余槽位：`text-doc01`、`text-doc02`、`text-doc03`、`text-doc04`、`text-doc05`、`text-doc06`、`text-doc07`、`text-doc08`、`br05-01`、`br05-02`、`br05-03`、`br06-01`、`br06-02`、`br06-03`、`br07-01`、`br07-02`、`br07-03`、`br08-01`、`br08-02`、`br08-03`、`br08-04`。

### G03

六标准槽任务：`ch04-n01`、`ch04-n02`、`ch04-n03`、`ch05-n01`、`ch05-n02`、`ch05-n03`、`ch06-n01`、`sq07`、`sq08`、`sq12`、`sq13`、`sq14`。每个均为offer/progress/ready/complete/retry/repeat。

其余槽位：`text-doc09`、`text-doc10`、`text-doc11`、`text-doc12`、`text-doc13`、`text-doc14`、`text-doc15`、`br09-01`、`br09-02`、`br09-03`、`br10-01`、`br10-02`、`br10-03`、`br11-00`、`br11-01`、`br11-02`、`br11-03`、`br12-01`、`br12-02`、`br12-03`、`br13-01`、`br13-02`、`br13-03`、`br13-04`、`br14-01`、`br14-02`、`br14-03`、`br15-01`、`br15-02`、`br15-03`、`br15-04`。

### G04

其余槽位：`br16-01`、`br16-02`、`br16-03`、`br16-04`、`br16-05`、`br16-06`、`br16-07`、`br16-08`、`br16-09`、`ending-evidence-01`、`ending-evidence-02`、`ending-evidence-03`、`ending-escape`、`ending-seal`、`ending-stay`、`outcome-npc-laoshuan-01`、`outcome-npc-laoshuan-02`、`outcome-npc-xu-01`、`outcome-npc-xu-02`、`outcome-npc-xiaocai-01`、`outcome-npc-xiaocai-02`、`outcome-npc-laocai-01`、`outcome-npc-laocai-02`、`outcome-npc-zhong-01`、`outcome-npc-zhong-02`、`outcome-npc-kong-01`、`outcome-npc-kong-02`、`outcome-npc-kong-03`、`outcome-npc-yan-01`、`outcome-npc-yan-02`、`outcome-npc-song-01`、`outcome-npc-song-02`、`outcome-npc-lin-01`、`outcome-npc-lin-02`、`outcome-npc-bao-01`、`outcome-npc-bao-02`、`outcome-npc-bao-03`、`outcome-npc-fan-01`、`outcome-npc-fan-02`、`outcome-npc-shen-01`、`outcome-npc-shen-02`、`outcome-npc-gu-01`、`outcome-npc-gu-02`、`outcome-npc-haisheng-01`、`outcome-npc-haisheng-02`。
