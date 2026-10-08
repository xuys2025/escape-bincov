// Curated R6 evidence export, no saves, detached HTML, heap dumps or generated game art.
import assert from'node:assert/strict';import{readFile,writeFile,mkdir,readdir,copyFile}from'node:fs/promises';import{resolve,dirname,relative}from'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
const raw=resolve('test-results/sol-r6-20261009'),out=resolve('docs/coast-sample-view/sol-r6-20261009'),e=resolve(out,'evidence');await mkdir(e,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex'),read=async f=>JSON.parse(await readFile(resolve(raw,f),'utf8')),put=async(f,s)=>{await mkdir(dirname(resolve(out,f)),{recursive:true});await writeFile(resolve(out,f),s);},copy=async(f,to=f)=>{await mkdir(dirname(resolve(e,to)),{recursive:true});if(to.endsWith('.log'))await writeFile(resolve(e,to),(await readFile(resolve(raw,f),'utf8')).replace(/[ \t]+$/gm,''));else await copyFile(resolve(raw,f),resolve(e,to));};
const base=await read('baseline.json'),identity=await read('package-identity.json'),first=await read('sample/report.json'),repeat=await read('sample-repeat/report.json'),resource=await read('resources-repeat/resources.json'),save=await read('save-placement.json'),strict=await read('f20/sample-boundaries.json'),heap=await Promise.all(['heap-extended','heap-repeat','heap-ordinary'].map(f=>read(f+'/heap-report.json'))),cues=await read('original-cues/original-cues.json'),levels=await read('audio-controls/shared-levels.json'),audio=await Promise.all([1,2,3].map(i=>read('audio-'+i+'/audio.json'))),negative=await read('audio-negative/audio.json'),shots=await read('shots/index.json');
assert(resource.finishedAt&&resource.cycles.length===20&&resource.cycles.every(r=>r.status==='passed'));assert(save.finishedAt&&save.runs.length===20&&save.runs.every(r=>r.status==='passed'));assert(identity.files.every(r=>r.equals14abea3));assert.equal(repeat.steps.filter(r=>r.status==='passed').length,48);assert.equal(cues.runs.length,2);assert(cues.runs.every(r=>r.status==='passed'));
const groupNames=['core','target','sample-repeat','lifecycle','play','launcher','shots','audio','audio-extra','boundaries','memory','final-functional','resource-repeat','save-recheck','visual','inventory','world','input'];const commands=[];for(const group of groupNames){const rows=await read(group+'.json');await copy(group+'.json','commands/'+group+'.json');for(const row of rows){commands.push({group,...row,rawLogSHA256:hash(await readFile(resolve(raw,row.id+'.log')))});await copy(row.id+'.log','logs/'+row.id+'.log');}}await copy('runner.mjs','runner.mjs');
for(const f of ['baseline.json','package-identity.json','history-summary.json','save-placement.json','save-placement-first.json'])await copy(f);
for(const [src,dst]of [['sample/report.json','sample-first.json'],['sample-repeat/report.json','sample-repeat.json'],['lifecycle-1280/lifecycle.json','lifecycle-1280.json'],['lifecycle-1920/lifecycle.json','lifecycle-1920.json'],['launcher/launcher.json','launcher.json'],['visual/visual.json','visual.json'],['player/player-death.json','player-death.json'],['hidden-contract/visibility-probe.json','hidden-original-failed.json'],['hidden-contract-settled/visibility-probe.json','hidden-settled.json'],['hidden-feedback/hidden-feedback.json','hidden-feedback.json'],['f20/sample-boundaries.json','f20-strict.json'],['resources/resources.json','resources-first-failed.json'],['resources-repeat/resources.json','resources-repeat.json'],['resources/first-run-script.mjs','resources-first-run-source.mjs'],['audio-controls/shared-levels.json','audio-shared-levels.json'],['audio-controls/bounds.json','audio-bounds.json'],['original-cues/original-cues.json','original-cues.json']])await copy(src,dst);
await copyFile(resolve('test-results/astra-lifecycle/save/diagnostic.json'),resolve(e,'astra-save-classification.json'));
for(const f of ['heap-extended','heap-repeat','heap-ordinary'])await copy(f+'/heap-report.json',f+'.json');for(const f of ['play-empty','play-1280','play-1920']){await copy(f+'/playtest.json',f+'.json');await copy(f+'/15-result.png',f+'-result.png');}for(const i of [1,2,3]){await copy('audio-'+i+'/audio.json','audio-'+i+'.json');await copy('audio-'+i+'/audio-waveforms.png','audio-'+i+'-waveforms.png');}await copy('audio-negative/audio.json','audio-negative.json');await copy('audio-negative/audio-waveforms.png','audio-negative-waveforms.png');
for(const f of shots.shots){await copy('shots/'+f.file,'shots/'+f.file);}await copy('shots/index.json','shots/index.json');assert.equal(shots.shots.length,68);
for(const f of await readdir(resolve(raw,'sample')))if(/^check-labels-|^check-drag-|^death-hidden-|^death-fall-|^check-map-|^check-loot-docked-/.test(f)&&f.endsWith('.png'))await copy('sample/'+f,'focus/'+f);
for(const [folder,pattern]of [['resources-repeat',/^player-fall-/],['hidden-contract',/^hidden-room-/],['hidden-contract-settled',/^hidden-room-/],['lifecycle-1280',/^context-restored-/],['lifecycle-1920',/^context-restored-/]])for(const f of await readdir(resolve(raw,folder)))if(pattern.test(f)&&f.endsWith('.png'))await copy(folder+'/'+f,folder+'/'+f);
for(const f of await readdir(raw))if(/^save-(old|current)-.*\.png$/.test(f))await copy(f);
const regressions=commands.filter(r=>r.id.startsWith('regression-'));assert.equal(regressions.length,20);assert(regressions.every(r=>r.exitCode===0));
const f20=strict.steps[0].detail;const ver={at:new Date().toISOString(),testedSource:base.head,branch:base.branch,node:base.node,browser:shots.browser,machine:{platform:base.platform,release:base.release,cpu:base.cpu,totalMemory:base.totalMemory},dpr:[1,3],sampleViewport:['1280x720','1920x1080','844x390','640x300'],ordinaryLifecycleViewport:['1280x720','1920x1080'],formalHTMLSHA256:identity.files[0].sha256,packageIdentity:identity.files,signoff:{overall:'PARTIAL',R6V1:'PARTIAL: first 46/48 then sequential 48/48; original visibility tool failed before entry-animation wait',R6V2:'PASS: native output recovery/threshold and original Phaser four cue controls + shared main levels',R6V3:'PASS: real AI player death, both art modes, committed frozen outro and canvas cleanup',R6V4:'fixture cause confirmed; historical ASTRA-SAVE-01 unconfirmed',lifecycle:'PASS',F20:'PARTIAL: all three base trends and original strict result-page trend positive',R6V5:'NOT RUN: awaiting physical mobile/desktop devices and people'},commands,logNormalization:'Delivery logs remove trailing spaces/tabs only; original ignored logs remain byte-exact and each command includes rawLogSHA256.',expectedNonzero:{sample:'first V07 Fx live 6!=0 and V08 panel wait timeout','hidden-contract':'original whole-page pixel comparison caught entry CSS fade; assertions unchanged, settled copy passed','F20-strict':'PARTIAL positive trend','audio-negative':'intentional death-muted control: only E2 failed','resources':'first mixed workload aborted 4/20; post-death body hp1/pollution50 caused later extract fixture to die'},notRun:['R6-V5/G12 physical devices/human full games/headphone stereo','Remote CI on local verification commit','Deployed R6 Pages (Pages equals main, not this sample)','40/60-cycle windows, fixed idle control and dominator attribution of all growth','R6-L1..L7 and R6-A1..A7, second batch art and frontend changes','Existing test:layered-play script (known click/exit selector issue in Opus report); not substituted by other tests','Independent GPU/driver/native audio heap accounting'],resourceSupplement:{cycles:20,perArt:10,bothFloorsEveryCycle:true,baseRecoveryFixture:true,firstFailureRetained:true,atlasBytes:resource.cycles.map(c=>c.cache.atlas.bytes),maps:3,gpuTextures:resource.cycles.map(c=>c.after.counts.gpuTextures)},heapSampling:[{name:'original strict',phase:'result page; one CDP GC and window.gc',...f20},...heap.map(r=>({entry:r.entry,sampling:r.sampling,trend:r.trend,remainingOwners:r.remainingOwners,accumulated:r.accumulated,selfSize:r.selfSize,shaderSources:r.shaderSources,memorySignoff:r.memorySignoff}))],historicalSave:'Old coordinates + automatic validation failure proven with player-only valid counterfactual and unchanged bytes; actual historical candidate/write/stack missing. No closure.'};await put('verification.json',JSON.stringify(ver,null,2)+'\n');
const n=x=>Math.round(x).toLocaleString('en-US'),ep=(file,title)=>'['+title+'](evidence/'+file+')';
const readme=`# Sol 第六轮独立验收与资源复验

2026-10-09（UTC+8）。在 D:\\bincov\\pr22-runtime 原分支 \`docs/coast-2-5d-art-design\` 从 \`${base.head}\` 接手。已读 Opus 第六轮及补充修复报告、gpt-tasks.md、Astra 生命周期签收标准。**本轮总体 PARTIAL；不得描述为全部稳定通过。**

| 项目 | 签收结论 | 当前证据 |
| --- | --- | --- |
| R6-V1 | PARTIAL，工程及顺序功能复跑通过，保留稳定性缺口 | 233/233 单测；package 与14abea3六项制品逐字节一致；样板首轮46/48、顺序48/48；20套回归 exit0；68张截图0异常；真实输入三条件均extract；跳转3/3；生命周期两尺寸各4/4；原visual exit0 |
| R6-V2 | 本机自动证据 PASS | 音频3×14/14；原Phaser恢复当前0.16337/旧0.05603；四种原Phaser真实动作输出对照；共享服务与main四种音色；死亡静音负对照13/14且只E2失败；恢复调度有界 |
| R6-V3 / OPUS-DEATH-02 | 本机自动证据 PASS | 两种素材均真实敌火死亡，已提交后完整倾倒→0.16秒后尸体；结算落幕无host frame推进，结束画布filter为空；换层、重建、读档不重播 |
| R6-V4 | 摆位因果链 PASS；历史归因未确认 | 两包×两坐标×五次自动检查点；旧点10/10在写入前拒绝，原字节不变；只改坐标的候选可解码，新点10/10正常写入。历史当次候选/栈缺失，ASTRA-SAVE-01不关闭 |
| 生命周期 | PASS | 普通入口两尺寸各4/4；旧所有者为0；新增缓存/落幕资源20/20（有明确基地恢复夹具） |
| F20 总堆 | PARTIAL | 原严格结果页+${n(f20.growthBytes)} B；基地三次GC完整+${n(heap[0].trend.growthBytes)} B、重复+${n(heap[1].trend.growthBytes)} B、普通对照+${n(heap[2].trend.growthBytes)} B；仍有未归因增长 |
| R6-V5 / G12 | 未运行，等待设备及人员 | 手机与桌面真人完整流程、卡顿/辨认/减少动态/耳机声像；不以无头Chrome替代 |

## 基线与最终提交对应关系

接手时工作区干净。main为 \`${base.main}\` 且已包含在本分支；PR22仍OPEN、未合并，远端头878f563。Pages与main逐字节一致（SHA256 3262b648beff16f16c2594d492b90ee079c7724ca2d99ac8254c4ecef7f0d754），没有本轮样板。当前签收的是本地包。

Node24.19.0、pnpm11.19.0、Chrome${shots.browser}、Windows10.0.19045、i5-12400F、32GiB。桌面DPR1，触屏仿真DPR3；生命周期1280×720/1920×1080；标签/截图另含844×390和640×300。

正式HTML ${identity.files[0].bytes} B，SHA256 \`${identity.files[0].sha256}\`。HTML、启动页、跳转页、两ZIP及release-manifest与14abea3一致。最终本地提交只加验收工具/文档/证据：其源代码、tests、运行素材及制品沿用上述已验证Git blob；见 ${ep('package-identity.json','制品身份')}、[验证清单](verification.json)、[证据manifest](manifest.json)。提交号由包含本报告的本地提交确定；提交后在忽略目录生成final-commit.json，重新核对最终Git树及证据manifest。避免在提交内部嵌入自引用SHA。

## 物品名与拖动：已看实际PNG

四尺寸“保险管、除藻剂、卡宾弹、力量针”均显示全名。桌面像素字体，触屏小号系统字体；未只凭textContent判定。桌面两尺寸背包与搜刮中拖动影子在指针附近、位于面板之上，关闭/blur后消失。U12边缘拖动故意放到无效区域，“拖放未完成”不等于转移成功；原U01的真实跨格转移/旋转/写入回滚仍通过。短屏面板自身需滚动，当前结论不包含“任何尺寸绝不滚动”。见 ${ep('focus/check-labels-1280x720.png','桌面标签')}、${ep('focus/check-labels-640x300.png','短屏标签')}、${ep('focus/check-drag-mid-loot-1920x1080.png','拖动显示')}。

首轮样板与其他功能回归同时运行，V07在行713的Fx.live=6断言失败；**不是室内雨滴断言失败**，后者当次尚未执行。V07抛错后未执行resume，V08随后等loot超时；读代码支持前项暂停残留的解释，但首轮没有逐帧因果日志，不能把成因写成已证实。原脚本未自动为这两项留失败截图，完整错误栈及日志已保留。无并发浏览器的第二次原脚本48/48：同时间天气像素一致、室内溅点0、楼层天气关闭、箱盖open/full、半开18帧。${ep('sample-first.json','首次失败')}、${ep('sample-repeat.json','顺序复跑')}。本轮不改原48项断言或前端。

## 声音恢复与阈值

三个新上下文E2的cue/ambience峰值分别0.1280/0.0491、0.1486/0.0504、0.1312/0.0556（2.61、2.95、2.36倍）；全部符合既有1.6倍且>0.09，保留原阈值。E2 cueOnsets=0是恢复首块即开始、没有前段样本供起音检测，不以调用数代替输出电平。

在离线副本中**只将death()静音**，原14项音频门禁13/14，E2真实失败：0.0535/0.0560≈0.96倍、无起音。与原Phaser旧版恢复缺陷对照一致；正式包没有这个改动。原缺陷repro当前/1c1c935的开枪峰值0.23065/0.21797，暂停均suspended，放弃后running，死亡提示峰值0.16337/0.05603。${ep('audio-negative.json','负对照失败')}、${ep('audio-shared-levels.json','main共享服务对照')}。

另实际运行原Phaser（coast-v1）四种动作：原生鼠标开枪、E拾取保证样本、真实邻近scav伤害、E完整撤离。旧/新输出窗口峰值比：${cues.comparison.map(c=>c.cue+' '+c.peakRatio.toFixed(4)).join('；')}。窗口含海声，不能把pickup峰值当成单独提示音响度；补充共享SynthAudio与main的同噪声声学对照（shot/hit/pickup/extract比 ${levels.comparison.map(c=>c.ratio.toFixed(4)).join('/')}），及原14项输出检查共同支持音量回归。见 ${ep('original-cues.json','原Phaser四动作')}。没有做真人主观响度或耳机方位验收。

未完成resume的模拟服务保持16个待恢复声音，1001ms后不再新增；running预算96；stop/ended清零。模拟仅验证界限，不作为真实音频输出证据。见 ${ep('audio-bounds.json','调度界限')}。

## 玩家倒地与隐藏边界

${ep('resources-repeat/player-fall-sol.png','Sol玩家逐帧PNG')}、${ep('resources-repeat/player-fall-placeholder.png','占位玩家逐帧PNG')}已目视检查：武器隐藏，身体倾倒，尸体随后接手。原真实死亡探针两模式39/41个死后present；更强的新资源观察在已提交落幕中同时验证phase=ending、settlement存在、host帧计数恒定与filter清理。源码exiting分支先返回outro，未走runtime.advance；没有换成空桩来假装模拟冻结。画面淡出/灰化及视图时间继续不等于Runtime继续。

V01真实Runtime隐藏尸体、关门再开关、重建、换层四种负对照全部0像素差；去屋顶控制有84差异像素，揭示后可见。V04两模式读档/换层/epoch尸体不重播；V06隐藏命中标记为0。额外两模式克隆批次控制，隐藏射手标记/边缘箭头0，揭示后标记与1个箭头出现；这份为合成契约证据，区别于原V01真实死亡。

原Sol可见性工具整页像素比较首次失败，921600像素变化；对象标记均未泄露。两PNG可见全屏入场淡入差异。新增兼容副本**只等待真实入场CSS动画结束**，保留像素/对象原断言，随后0差异，15个隐藏血迹都被扣留、跨层旧事件被丢弃。${ep('hidden-original-failed.json','原工具失败')}、${ep('hidden-settled.json','等待后复验')}。未覆盖的隐藏通路不写成全局信息绝对零泄露。

## 新缓存、落幕与F20

正式包的补充20循环，两模式各10次，每局进二楼和地下后回沿海，并混合真实战死/撤离/放弃；每局烘焙地图3份，观察到atlas约27,934,720B。每次离开apps/views/listeners/tickers/timers/observers/RT/liveViews/roots/atlasPages/largeTextures=0，parked=1、GPU管理纹理2、滤镜清空、无ghost。原最初混合序列因战死后的hp1/pollution50令撤离局再次死亡，4/20中断；失败仍保留。重跑在后续每次基地通过真实SaveSession.mutate恢复合法body健康值，明确标为**测试恢复夹具**，不清空owner、不刷新页面、不改死亡规则；不能作为“真人连续20局无恢复”证据。${ep('resources-first-failed.json','首试失败')}、${ep('resources-repeat.json','补充资源20局')}。

| 采样口径 | 6–10轮均值 B | 16–20轮均值 B | 增长 B |
| --- | ---: | ---: | ---: |
| 原严格：正式包，结果页，一次CDP GC+window.gc | ${n(f20.afterWarmupMean)} | ${n(f20.lastFiveMean)} | +${n(f20.growthBytes)} |
| 辅助完整：不压缩副本，基地，三次CDP GC | ${n(heap[0].trend.afterWarmupMean)} | ${n(heap[0].trend.lastFiveMean)} | +${n(heap[0].trend.growthBytes)} |
| 辅助完整独立重复，同上 | ${n(heap[1].trend.afterWarmupMean)} | ${n(heap[1].trend.lastFiveMean)} | +${n(heap[1].trend.growthBytes)} |
| 普通入口出击/放弃对照，同上；无楼层或撤离 | ${n(heap[2].trend.afterWarmupMean)} | ${n(heap[2].trend.lastFiveMean)} | +${n(heap[2].trend.growthBytes)} |

辅助脚本沿用原工作负载、GC、快照6/20与比较，只增加Weather/SampleSound/SynthAudio追踪。Runtime/Host/View/InventoryPanel/Textures/Atlas/Fx/Lighting/Scope及Weather/SampleSound均0；SynthAudio是页面共享服务，1→1并未要求删掉页面服务。着色器字符串83→83，池stage=0/ticker停止/canvas脱离。self_size及code/VM启发式不等于dominator。三次正增长及原严格exit1仍记PARTIAL，未用KB容差放行。没有完成40/60轮、有界性、所有强引用/dominator归因；GPU/驱动内存也不在JS堆结论内。六份堆快照仅本地忽略目录保存。

## 存档异常：摆位证据与历史缺口分开

两包、旧(360,342)/新(368,344)各五次**真实自动检查点**，非手动checkpoint冒充偶发。旧点独立候选decode失败，只修玩家坐标后decode成功；实际setItem=0、字节SHA未变、pause/checkpoint rejected、commit→persist→checkpoint→advance异常栈完整。新点各5次成功写入且可解码。见 ${ep('save-placement.json','最终20次摆位诊断')}、${ep('astra-save-classification.json','配额/校验/版本三通路及普通入口保存')}。首版诊断误选全局data-panel所得“地图”字段保留在save-placement-first.json；最终探针将面板范围限定到.coast-sample重新跑20次，未改游戏。

已提交历史round2及round3三个索引都证实使用过旧点，但window均记录running、无存档错、无rejected；历史最初1280样板外异常没有当次候选、写入返回和栈。晚于window的异常面板可由此摆位链产生，但**相同面板不能证明原历史个案就是这一路**。ASTRA-SAVE-01继续未确认；Opus R6报告和R6-L5的“就是历史来源”应按本轮证据收窄，不以修复测试驱动关闭。

## 问题归属与停止点

[Opus/Astra问题清单](defects.md)保留门禁时序、工具淡入等待、F20未归因、存档历史缺口，以及R6-L/R6-A的待安排状态。[verification.json](verification.json)包含每个真实进程的参数、环境、起止和退出码；保留sample/hidden/resources失败、E2负对照失败及F20 partial。交付日志副本仅去除行尾空格/制表符；本地原始日志不变，每个进程记录包含rawLogSHA256以核对原文。

R6-V5等待真实手机、桌面设备及实际玩家。远端CI、线上R6、十分钟旧layered-play、40/60轮与GPU原生资源专项未运行；不会补写为通过。没有代改前端、Runtime、存档协议或素材，没有启动R6-L/A或扩量。完成本地提交、密钥检查和最终树审计后停止，不推送、合并或发布。
`;
await put('README.md',readme.replaceAll('\`','`'));
const defects=`# 第六轮遗留与归属

2026-10-09；基线14abea3；[签收报告](README.md)。本清单是交接，不授权启动实现或素材扩量。

## 给Opus

| 编号 | 状态/优先级 | 证据和后续要求 |
| --- | --- | --- |
| R6-OPUS-01 门禁时序 | P2，未解决 | 首轮V07 Fx.live=6，V08等loot超时；顺序48/48。V07失败后没有resume，V08可能受暂停残留影响；粒子零检查到暂停间也有时间窗。保持原断言，补有界状态等待/失败隔离与重复验证。不能删断言掩盖失败；本轮不代改 |
| R6-TOOL-02 淡入与旧像素工具 | P2，兼容副本已验证，原工具仍会失真 | 原sol-visibility-probe921600像素差，无对象泄露；sol-r6-visibility只等实际动画finished后0差。后续维护原工具应记录动画状态并等待，不改像素阈值；原失败证据保留 |
| ASTRA-SAVE-01历史表述 | 未确认 | 摆位自动检查点因果链已证实，历史原始失败无候选/写入/栈。R6报告及L5“找到历史根因”过强，后续更新为确认fixture来源、历史个案待证据；不能直接关闭 |
| OPUS-DEATH-02 | 本机自动PASS | 两素材真实死亡完整倒地、尸体、落幕冻结/滤镜清空；R6-V5设备/真人尚未签。前轮待排期为历史状态 |
| R6-RESOURCE-03 新循环夹具 | 首试失败保留，资源重跑20/20 | 真实死亡后body hp1/pollution50，下一局计划撤离变死亡是既有规则。后续测试需实际恢复或明确健康夹具；不要改前端或死亡规则迎合测试 |
| G12 / R6-V5 | 未运行，等人员设备 | 手机及桌面各真人一局，卡顿/未烘焙区/雨雾辨认/减少动态/耳机声像。自动触控及PNG不能替代 |

## 给Astra

| 编号 | 状态/优先级 | 证据和后续要求 |
| --- | --- | --- |
| ASTRA-SAVE-01 | 未确认，保持开放 | 两包旧坐标10/10校验拒绝、setItem0、旧字节保留；玩家坐标单变量修复可解码。历史失败尚无对应候选/异常栈，不归因配额或冲突，也不关闭未知合法路径 |
| R6-L5 驱动摆位 | P2，已证实的fixture缺口，未实施 | placePlayer允许墙重叠，后续自动检查点拒绝。未来按同bodyFits拒绝player/enemy非法位置，并保留decoder；与历史未知异常分别登记 |
| F20 / OPUS-MEM-01 | PARTIAL，待归因 | 原严格+368605B；基地完整+360368B、独立重复+380943B、普通+317474B。旧owner、新Weather/SampleSound为0；池1、GPU2。不能用对象持平或code/VM self_size说明全部增长；各口径不得混算；没有完成dominator/40/60轮 |
| R6-L1–L3 | 未开工 | settlement reason、hurt cause、impact owner，见原gpt-tasks；本轮只验收，未代写接口 |
| R6-L4 / L6 / L7 | 未开工或待产品判断 | 潮位淹没格、射程评估、种子天气；不因本次验证自动启动。ASTRA-RANGE-01边缘提示不等于逻辑射程问题已关闭 |

R6-A1–A7及此前P1–P4素材需求继续按Opus规格待安排，本轮没有新增或返修PNG素材。证据PNG是本轮截图。main商店拖动原缺陷不在PR22范围，没有另开实现。所有失败、未运行项和原始进程退出码见[验证清单](verification.json)。
`;
await put('defects.md',defects);
const list=[];async function walk(dir){for(const f of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,f.name);if(p===resolve(out,'manifest.json'))continue;if(f.isDirectory())await walk(p);else{const b=await readFile(p);list.push({path:relative(out,p).replaceAll('\\','/'),bytes:b.length,sha256:hash(b)});}}}await walk(out);
const sourceFiles=(await readdir('scripts')).filter(f=>f.startsWith('sol-r6-'));const sourceIdentity=[];for(const f of sourceFiles){const bytes=await readFile('scripts/'+f);sourceIdentity.push({path:'scripts/'+f,bytes:bytes.length,sha256:hash(bytes)});}const original=['scripts/coast-sample-test.mjs','scripts/coast-audio-test.mjs','scripts/sol-sample-boundaries.mjs','scripts/coast-sample-heap.mjs','scripts/sol-round4-visual.mjs','scripts/sol-visibility-probe.mjs','scripts/opus-player-death-probe.mjs'];for(const f of original){const b=await readFile(f),r=spawnSync('git',['-c','safe.directory=D:/bincov/pr22-runtime','show','14abea3:'+f]);assert.equal(r.status,0);assert(b.equals(r.stdout),f+' must remain unchanged');sourceIdentity.push({path:f,sha256:hash(b),equals14abea3:true});}
await put('manifest.json',JSON.stringify({schema:1,at:new Date().toISOString(),purpose:'Evidence manifest, not art inventory',testedSource:base.head,formalHTMLSHA256:identity.files[0].sha256,files:list.sort((a,b)=>a.path.localeCompare(b.path)),sourceIdentity,rawLocalDirectory:raw,excluded:['session/candidate bodies','private keys','heap snapshots','detached/control HTML'],snapshotSHA256:await Promise.all(heap.flatMap((_,i)=>['6','20'].map(async c=>{const p=resolve(raw,['heap-extended','heap-repeat','heap-ordinary'][i],'cycle-'+c+'.heapsnapshot');const b=await readFile(p);return{localPath:p,sha256:hash(b),bytes:b.length};})))},null,2)+'\n');console.log('Exported',list.length,'evidence files; PNG',list.filter(f=>f.path.endsWith('.png')).length);