/** EN-01 design requirements and delivery status. Runtime rules live in src/enemy-archetypes.ts. */
export const ENEMY_FACTIONS = Object.freeze({
    raiders: '拾荒者团伙', tidalFauna: '潮蚀生物', saltAffected: '盐蚀者',
    mercenaries: '雇佣兵', coastalBlockade: '沿海封锁队',
} as const);
export type EnemyFactionId = keyof typeof ENEMY_FACTIONS;

export interface EnemyArchetype {
    readonly id: string;
    readonly designNumber: string;
    readonly name: string;
    readonly faction: EnemyFactionId;
    readonly implementation: 'design-only' | 'street-prototype';
    readonly defaultStance: 'hostile' | 'territorial' | 'conditional';
    readonly engagementRule: string;
    readonly disengageRule: string;
    readonly behavior: Readonly<{ idle: string; alert: string; combat: string; search: string }>;
    readonly weaponCategories: readonly ('tool-melee' | 'pistol' | 'shotgun' | 'rifle' | 'natural-melee' | 'acid-spit' | 'polearm')[];
    readonly assets: Readonly<{ status: 'not-produced' | 'body-and-corpse'; silhouette: string; equipment: string; animations: readonly string[] }>;
}

// Freeze nested planning data too: a caller must not turn a content edit into live mutable state.
function entry<const T extends EnemyArchetype>(value: T): Readonly<T> {
    Object.freeze(value.behavior); Object.freeze(value.weaponCategories);
    Object.freeze(value.assets.animations); Object.freeze(value.assets);
    return Object.freeze(value);
}

/** All eighteen cards from ENEMY-DESIGN. No entry grants runtime support or numeric combat balance. */
export const ENEMY_CATALOG = Object.freeze([
    entry({ id: 'raider-melee', designNumber: '01', name: '近身掠夺者', faction: 'raiders', implementation: 'street-prototype',
        defaultStance: 'hostile', engagementRule: '仅暴力抢夺团伙成员；确认目标后喊话或借遮挡接近。', disengageRule: '失去目标后检查近处拐角，受伤退向同伴。',
        behavior: { idle: '翻废料、撬箱与搬运', alert: '喊话并寻找接近路线', combat: '试探后挥击，打空恢复站姿', search: '搜索最近拐角，不沿未知路线追踪' },
        weaponCategories: ['tool-melee'], assets: { status: 'body-and-corpse', silhouette: '前倾的旧连帽外套与单肩编织袋', equipment: '可辨的铁棍、短工具或砍刀', animations: ['搬运', '喊话', '试探', '抬肩挥击', '挥空恢复'] } }),
    entry({ id: 'raider-gunner', designNumber: '02', name: '拾荒枪手', faction: 'raiders', implementation: 'street-prototype',
        defaultStance: 'hostile', engagementRule: '守住抢夺物资的武装团伙成员，确认威胁后射击。', disengageRule: '遭侧击转移，缺少支援时退守。',
        behavior: { idle: '清点弹药、守货堆', alert: '从固定掩体观察', combat: '单发射击后缩回遮挡，换弹依赖同伴', search: '在据点掩体间重新观察' },
        weaponCategories: ['pistol', 'shotgun', 'rifle'], assets: { status: 'body-and-corpse', silhouette: '褐夹克、弹袋和高耸包口', equipment: '短枪、霰弹枪和长枪需分别可辨', animations: ['清点弹药', '举枪', '单发射击', '翻找弹药换弹', '退守'] } }),
    entry({ id: 'raider-lookout', designNumber: '03', name: '望风者', faction: 'raiders', implementation: 'street-prototype',
        defaultStance: 'hostile', engagementRule: '为暴力团伙望风，先确认再通知附近同伴。', disengageRule: '失联或近身受威胁时后撤。',
        behavior: { idle: '观察门窗与路口、记录人数', alert: '确认动静后发出有限范围信号', combat: '侧面牵制，不持续正面交火', search: '带同伴检查最后目击位置' },
        weaponCategories: ['pistol', 'tool-melee'], assets: { status: 'body-and-corpse', silhouette: '轻瘦、贴身小包和频繁转头', equipment: '望远镜、对讲机或哨子及短武器', animations: ['侧身观察', '发信号', '转头确认', '后撤'] } }),
    entry({ id: 'raider-boss', designNumber: '04', name: '盐枭头目', faction: 'raiders', implementation: 'street-prototype',
        defaultStance: 'hostile', engagementRule: '仅暴力控制局部设施的匿名头目；具名船主与掮客另走剧情。', disengageRule: '护卫损失后换位，有退路时携贵重物撤离。',
        behavior: { idle: '查账与分配物资', alert: '调护卫守入口和侧路', combat: '依托预设射位与护卫', search: '保住据点和退路，不跨图追击' },
        weaponCategories: ['shotgun', 'rifle'], assets: { status: 'body-and-corpse', silhouette: '防水外套、防护背心和钥匙束', equipment: '较好长枪、褪色橙布条和账本', animations: ['查账', '指挥', '射击', '换位撤离'] } }),
    entry({ id: 'tidal-crab', designNumber: '05', name: '潮蚀蟹', faction: 'tidalFauna', implementation: 'street-prototype',
        defaultStance: 'territorial', engagementRule: '接近食源先张钳示威，侵入护食范围或受到攻击才追击。', disengageRule: '离开食源较远后返回。',
        behavior: { idle: '拖鱼骨、争食与清壳', alert: '张钳示威', combat: '抬重钳后夹击，短距离前冲', search: '守住食源，不跨图追赶' },
        weaponCategories: ['natural-melee'], assets: { status: 'body-and-corpse', silhouette: '低矮宽扁盐壳与不对称钳足', equipment: '暗褐关节与护食残骸', animations: ['横移', '触肢活动', '张钳', '抬钳夹落', '调整支撑足'] } }),
    entry({ id: 'saltback-dog', designNumber: '06', name: '盐背犬', faction: 'tidalFauna', implementation: 'street-prototype',
        defaultStance: 'territorial', engagementRule: '围绕食源与领地捕食，对近处威胁扑咬；不接受人类战术指挥。', disengageRule: '重创退开，脱离领地逐渐放弃。',
        behavior: { idle: '闻地、争食和绕尸徘徊', alert: '压低身体、收紧后腿', combat: '短冲扑咬，扑空后落地转向', search: '依靠可感知线索在领地内寻找' },
        weaponCategories: ['natural-melee'], assets: { status: 'body-and-corpse', silhouette: '显肋犬形与断续背部盐结', equipment: '破项圈与脏黄或灰黑毛', animations: ['闻地', '冲刺蓄势', '扑咬', '扑空落地', '转向退开'] } }),
    entry({ id: 'sac-spitter', designNumber: '07', name: '囊腹喷吐兽', faction: 'tidalFauna', implementation: 'street-prototype',
        defaultStance: 'territorial', engagementRule: '固定污染食源受刺激后面向目标，保留完整喷吐前兆。', disengageRule: '喷吐后喘息，活动围绕食源。',
        behavior: { idle: '趴伏消化与舔食渗漏物', alert: '寻找面向目标的位置', combat: '鼓囊仰头后喷吐，近身啃咬', search: '重新观察后再攻击，不连续追踪喷射' },
        weaponCategories: ['natural-melee', 'acid-spit'], assets: { status: 'body-and-corpse', silhouette: '犬形四足、下垂腹部与浑黄喉囊', equipment: '喷吐器官、短暂酸液落地痕迹', animations: ['消化', '鼓囊湿咳', '仰头锁定', '喷吐', '低头喘息'] } }),
    entry({ id: 'salt-dazed', designNumber: '08', name: '失神盐蚀者', faction: 'saltAffected', implementation: 'street-prototype',
        defaultStance: 'territorial', engagementRule: '仅已确认失控危险者；声光与靠近引发躁动，不混入患者队列。', disengageRule: '刺激消失后搜索一阵，再回原处。',
        behavior: { idle: '听墙、搬物与重复短路线', alert: '转头接近并明显躁动', combat: '伸手后抓击，连续动作后停顿', search: '检查刺激附近再返回' },
        weaponCategories: ['natural-melee', 'tool-melee'], assets: { status: 'body-and-corpse', silhouette: '消瘦日常衣物与局部盐痂', equipment: '工牌、旧钥匙和残留短工具', animations: ['摇晃', '重复劳动', '躁动伸手', '抓击', '停顿'] } }),
    entry({ id: 'tide-chaser', designNumber: '09', name: '追潮者', faction: 'saltAffected', implementation: 'street-prototype',
        defaultStance: 'territorial', engagementRule: '在污染维护区对确认的近处刺激爆发接近。', disengageRule: '到最后目击点重找，失去目标后返回活动区。',
        behavior: { idle: '沿管线、泵机和海风通道停驻', alert: '急吸气并蹬地', combat: '直冲后抓击，冲后弯腰喘息', search: '只搜索最后已知位置与可感知线索' },
        weaponCategories: ['natural-melee'], assets: { status: 'body-and-corpse', silhouette: '前倾、不对称高肩与盐结手臂', equipment: '原职业衣物与破耳罩', animations: ['拖步', '吸气蹬地', '直线冲撞', '抓击', '弯腰喘息'] } }),
    entry({ id: 'tide-ritualist', designNumber: '10', name: '守潮执仪者', faction: 'saltAffected', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '仅主动施暴的激进分支；先驱赶，明确冲突后守通道，保留交涉。', disengageRule: '退出争议设施可脱离接触，具体交涉由事件决定。',
        behavior: { idle: '守入口、照料水池与引导仪式', alert: '驱赶并呼叫能理解语言的同伴', combat: '长柄刺击或正常枪械射击与换弹', search: '守局部设施，不命令动物或失控者' },
        weaponCategories: ['polearm', 'rifle'], assets: { status: 'body-and-corpse', silhouette: '深蓝雨衣、粗绳与外露手臂盐斑', equipment: '鱼叉或长工具；少数旧枪需独立辨识', animations: ['照料水池', '驱赶', '收肩刺击', '长柄恢复', '持枪换弹'] } }),
    entry({ id: 'salt-hulk', designNumber: '11', name: '盐壳重躯', faction: 'saltAffected', implementation: 'street-prototype',
        defaultStance: 'territorial', engagementRule: '靠近污染依附物触发强烈护卫，先转向再接近。', disengageRule: '远离依附点会犹豫返回，失去视线只检查附近。',
        behavior: { idle: '倚墙与缓慢调整姿态', alert: '调整支撑并转向', combat: '抬臂或转肩后重击，结束后起身', search: '局部检查，不跨复杂楼层追击' },
        weaponCategories: ['natural-melee'], assets: { status: 'body-and-corpse', silhouette: '宽厚盐壳、旧防护服和拖行腿', equipment: '暴露关节与被包覆工牌', animations: ['倚墙', '调整重心', '转肩横扫', '抬臂下砸', '支撑起身'] } }),
    entry({ id: 'mercenary-scout', designNumber: '12', name: '侦察兵', faction: 'mercenaries', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '只在回收任务边界内警告或攻击，不为无关战斗追人。', disengageRule: '丢失观察后报告最后位置，搜索限任务通路。',
        behavior: { idle: '查门窗、标箱与记路线', alert: '找遮挡并报告实际观察', combat: '精确单发或短点射掩护撤退', search: '依最后位置搜索，不由通信获得未知坐标' },
        weaponCategories: ['rifle'], assets: { status: 'body-and-corpse', silhouette: '轻盔、短包与贴身护具', equipment: '紧凑长枪、观察设备和标记胶带', animations: ['侧身观察', '标记箱体', '报告', '短点射', '掩护撤退'] } }),
    entry({ id: 'mercenary-assault', designNumber: '13', name: '突击兵', faction: 'mercenaries', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '围绕受控设施、回收人员和任务通路接敌，不占领正常住民区。', disengageRule: '同伴受损或任务完成撤回集合点。',
        behavior: { idle: '守入口、检查房间与护箱', alert: '确认任务通路威胁', combat: '同伴交替观察射击与短距换位', search: '保护回收目标，不为追击弃任务' },
        weaponCategories: ['rifle'], assets: { status: 'body-and-corpse', silhouette: '中型背心、完整头盔与紧凑携具', equipment: '肩前长枪与运输箱', animations: ['护箱', '确认房间', '短连射', '换弹', '换位撤回'] } }),
    entry({ id: 'mercenary-support', designNumber: '14', name: '支援枪手', faction: 'mercenaries', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '保护回收运输路线的明确扇面，依任务冲突接敌。', disengageRule: '失去视线仅短压最后位置，随后重新观察。',
        behavior: { idle: '看守装箱现场与运输路', alert: '放低身体寻找支撑', combat: '分段短串压制，转向与换弹明显暴露', search: '守分配扇面，重新观察而非无限盲射' },
        weaponCategories: ['rifle'], assets: { status: 'body-and-corpse', silhouette: '较长武器、突出弹包与负重姿态', equipment: '长枪、支撑位与预放弹药袋', animations: ['调整负重', '寻找支撑', '短串压制', '收枪转向', '换弹'] } }),
    entry({ id: 'recovery-leader', designNumber: '15', name: '回收队长', faction: 'mercenaries', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '优先回收目标与队员生还，互不妨碍时允许交涉。', disengageRule: '损失过大护箱撤退，不见玩家就灭口。',
        behavior: { idle: '核编号、确认封装与分派人员', alert: '确认任务目标和队员位置', combat: '调配守门、掩护与后撤', search: '目标失守争取取回，必要时放弃外围' },
        weaponCategories: ['rifle'], assets: { status: 'body-and-corpse', silhouette: '完整防护、防水任务袋与耳机连线', equipment: '可靠长枪、浅色封签和编号箱', animations: ['核对清单', '分派', '确认队员', '掩护射击', '护箱撤离'] } }),
    entry({ id: 'blockade-sentry', designNumber: '16', name: '检查哨兵', faction: 'coastalBlockade', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '正常可问询检查；越线先提醒与指路，持续强闯明确警戒，直接攻击立即自卫。', disengageRule: '未伤人未开火时退回可逐步解除警告；交火后须先脱离接触。',
        behavior: { idle: '查证登记、换班与观察道路', alert: '停登记，手势警告、指路与逐级抬枪', combat: '依沙袋或岗亭防御', search: '保住检查线，不把问询或持枪本身当敌对' },
        weaponCategories: ['rifle'], assets: { status: 'body-and-corpse', silhouette: '蓝灰制服、旧盔与防水护肩', equipment: '臂章、登记板、路障和制式枪', animations: ['低枪接待', '登记', '伸手指路', '警戒抬枪', '岗亭自卫'] } }),
    entry({ id: 'blockade-patrol', designNumber: '17', name: '巡逻队员', faction: 'coastalBlockade', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '沿实际巡检点行动，遇人可询问；受攻击报告并掩护，禁止无端攻击住民。', disengageRule: '未开火警告可随退回解除；交火后先脱离，处理归事件。',
        behavior: { idle: '查门锁、封条与管线，记录异常', alert: '停步询问与通报可靠观察', combat: '找遮挡并互相掩护，保护队友', search: '仅搜索目击或可靠报告范围' },
        weaponCategories: ['rifle', 'shotgun'], assets: { status: 'body-and-corpse', silhouette: '蓝灰制服与轻包，膝肘磨损', equipment: '电台、手电和检查工具', animations: ['核对路牌', '检查封条', '询问', '报告位置', '互相掩护'] } }),
    entry({ id: 'blockade-sergeant', designNumber: '18', name: '检查站班长', faction: 'coastalBlockade', implementation: 'street-prototype',
        defaultStance: 'conditional', engagementRule: '解释岗位规则；哨兵警告后出面明确边界，直接袭击时组织防御。', disengageRule: '未交火退回可逐步解除；守岗位与人员，不为追离开者放空检查站。',
        behavior: { idle: '清点人数、查名单与处理争议', alert: '说明最后边界并调配队员', combat: '保护通道、隔离车辆与民众', search: '守住设施，后续交涉由具体事件决定' },
        weaponCategories: ['rifle'], assets: { status: 'body-and-corpse', silhouette: '蓝灰制服、防护背心与磨损袖标', equipment: '制式长枪、硬壳记录本和电台', animations: ['清点名单', '解释规则', '明确边界', '调配防御', '安置民众'] } }),
]);
export type EnemyArchetypeId = typeof ENEMY_CATALOG[number]['id'];
