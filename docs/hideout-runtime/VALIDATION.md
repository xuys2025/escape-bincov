> 合并整理说明：本文结论与历史失败保留，6 个原始证据链接转至[归档说明](../IMPLEMENTATION-ARCHIVE.md)；完整原文与文件见固定 c565d97 归档。

# 实际验证与 Sol 复验清单

环境：Windows，本地 Node 24.19.0、pnpm 11.19.0、Chrome 154.0.8037.98。浏览器测试运行打包 HTML，离线或通过保留 `.test` 域本地 fulfill，无公网游戏资源请求。pnpm 从固定版本入口运行；依赖按仓库 frozen lock 安装，无新增依赖。未运行 GitHub CI（本轮不推送）。

## 实际结果

| 检查 | 结果 / 证据 |
| --- | --- |
| `pnpm test` | **273/273 PASS**，其中新增水产站 30 项；[完整日志（已归档）](../IMPLEMENTATION-ARCHIVE.md) |
| `pnpm package` | **PASS**，严格 TypeScript、字体/素材 manifest、两个单文件 HTML、两个 ZIP 与 release manifest；[日志（已归档）](../IMPLEMENTATION-ARCHIVE.md) |
| `pnpm test:hideout` | **8/8 PASS**；新 Runtime 在真实浏览器中交易、故障保留、五秒训练、动画中刷新、实际城中村结算释放/回站、动画结束桥接、跨窗口；[报告](evidence/hideout-browser.json) |
| `pnpm test:save-browser` | **9/9 PASS**；[报告](evidence/save-browser.json) |
| `pnpm test:shop-drag` | **21/21 PASS**，保留已验收鼠标/触屏原操作；[报告](evidence/shop-drag.json) |
| `node scripts/coast-sample-test.mjs` | **51/51 PASS**，普通入口与真实 Runtime、图形/生命周期现有门禁；[报告（已归档）](../IMPLEMENTATION-ARCHIVE.md) |
| `pnpm test:expansion` | **5/5 PASS**，真实固定旧 HTML、所有权、升级失败回滚、原始字节、旧客户端拒绝 v4、完整备份、旧沿海终局；[报告](evidence/expansion-browser.json) |
| `pnpm test:browser` / `test:desktop-input` | **PASS**，两个尺寸操作、结算/恢复及原输入/暂停/治疗失败；[浏览器](evidence/browser.json)、[桌面输入](evidence/desktop-input.json) |
| `pnpm test:mobile` / `test:mobile-ux` | **10/10、11/11 PASS**；模拟触控，不等同真机；[移动](evidence/mobile.json)、[移动 UX](evidence/mobile-ux.json) |
| `pnpm test:systems` / `test:qol-expansion` | **PASS**，原设施、生产、治疗/护符、商场、终局，以及 RPG 商店/分层库存；[系统](evidence/systems.json)、[QOL](evidence/qol-expansion.json) |
| `pnpm test:ui` | **PASS**；1280×720 和 1920×1080，已查看旧整备截图，未见文字截断/控件越界。它们是旧备用入口截图，非水产站院子画面；[报告](evidence/ui.json)、[1280（已归档）](../IMPLEMENTATION-ARCHIVE.md)、[1920（已归档）](../IMPLEMENTATION-ARCHIVE.md) |
| `pnpm test:portable` | **6/6 PASS**；最终包真实解压、离线普通入口、无测试接口、输入/暂停；[报告](evidence/portable.json) |
| `git diff --check` / 提交前密钥检查 | 交付前执行；精确结果见本地提交记录与最终交接。未绕过 hooks。 |

执行分为集成轮与收尾轮：集成轮覆盖以上旧路径；收尾只改 Runtime 的非法输入/旋转默认值/阶段判定、训练帧时取整容差和测试断言，完整单测、package、新 Runtime 浏览器与便携测试重跑。未把早先旧路径的测试时间伪装成最终提交后的 CI。来源、最终制品 SHA 和报告摘要见 [baseline](evidence/source-baseline.json)。

训练 120 秒/十分钟上限单测使用注入的真实语义时钟，不实际等待十分钟；新浏览器保存故障案例实际等待五秒。旧客户端兼容专项只固定 SaveSession 的测试时钟，精确核对身体/成长原子快照，不声称真实计时覆盖。RNG/地图/计时仍由原测试验证，未加速正式入口。

## 首轮失败及处置

1. 首次新单测有测试夹具错误：仓库/背包尺寸不符合严格存档格式、库存 id 用了不存在的 rifle，后续满仓夹具未按物品堆叠上限填满、快捷转移错误假定 UID 不变。修正夹具以正式容量/商品/堆叠/自动转移规则为准；未放宽验证器或改变玩法。保留首轮日志 [unit-first.log（已归档）](../IMPLEMENTATION-ARCHIVE.md)。
2. 首次严格构建暴露 readonly 数组 map 泛型和测试中的过度类型收窄，已修正类型。运行文案用了四个未收录字符，改用现有字库可表达的提示，没有制作字库或素材。
3. 默认成长启用后，旧 save/mobile 测试仍预期只含 `.save` 的备份或 v3；现在严格检查 v4 envelope、expansion v2 和完整 profile。完整导入原本就回标题，测试补充确认这一状态后点击进入。原回滚、道具保留、冲突与重试断言未删。
4. 新浏览器脚本第一次在异步启动完成前读取 test hook，补上就绪等待；城中村放弃按钮使用原宿主实际 `data-do` 控件。没有绕过结算服务。
5. 旧扩展专项为精确身体快照最初固定全局 Date.now，干扰了 Phaser 浏览器时钟，出现启动等待超时。改为仅注入 SaveSession 时钟，浏览器/Phaser 与输入仍跑原始时钟；随后 5/5 通过。
6. 实现中补上五秒失败候选的会话级保护：旧入口也不能越过待保存训练写入，旧完整备份出口同样带候选；另验证货币上限溢出返回 rule 而非抛出异常，拆分默认保留源方向。

7. 最后复核发现 Date.now 整数毫秒与帧间隔小数的比较会少计正常训练；改为逐帧1ms量化容差及累计活动时长约束，新增60FPS/120秒序列验证，不能累计超额训练时间。

## 给 Sol 的签收标准

- 在本任务分支独立重跑 test、package、test:hideout、save-browser、shop-drag、expansion、mobile 及需要的城中村回归，记录实际 SHA、浏览器、查询参数、错误/请求。旧 HTML 输入须是脚本列出的真版本哈希；不得拿当前包伪装旧客户端。
- 检查四组旧档：旧 profile、v3 会话、v4/扩展 v1、活动旧检查点。升级保留钱/物品/弹药来源/任务/成长/设置及备份字节；活动行动先恢复，不能重抽 RNG 或多记一次出击。损坏/未来版本和未取得锁均不得覆盖。
- 对买/卖/装备/消耗/任务/设施/队列/领取分别注入 setItem 失败：raw、profile、body、queue、rev 不变，无成功事件。解除失败后只产生一次经济变化。自动训练候选失败须能从新旧完整备份入口导出；旧菜单 persist/beginRun/交易要被阻止，重试不重复记时。
- 四种购物拒绝明确：funds、space、stale、rule；任务物资必须确认当前 token。购买格位仍为购物清单，自动入仓是保留规则，不能签成已实现手动指定成交格。
- 在常量区域内实走 120 秒；静止、越界、池内、穿池、超速、重复时间、传送跳点、失焦/隐藏均不计。属性切换与读档共享十分钟1点额度。另做真实前台时长检查，不能仅以注入时钟测试替代手动签收。
- 生产只运行已付费批次、完成位最多3、队首不可取消；满仓领取或退款失败不丢批次。离线可完成有限批次，堵塞后的闲置时间不变成未来未付款批次的收益。
- 出击成功先有可恢复检查点，动画后只启动一次；动画中刷新能恢复。pendingSettlement 写入失败无回站标记；成功后宿主先释放，再回站，只消费一次 arrival。
- 两个真实同源窗口，所有权拒绝与 storage 事件/原始字节比较冲突均不覆盖新值。普通入口无 `__bincov` / 院子测试全局；离线包无必要网络请求。
- Opus 接院子后另验宿主切换、旧快捷页签同会话、两分辨率、20次进出、上下文丢失恢复、失败清理和共享 Application。本轮不替前端签收这些尚未接线的项目。

未运行：完整远端 CI、真人平衡/真机、F20 新长循环或原生内存、院子素材与视觉签收。F20 PARTIAL、ASTRA-SAVE-01 未确认、SOL-F20-HUD-01 保持历史结论，不因本轮接口通过改变状态。
