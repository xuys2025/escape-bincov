/** The approved 18-topic market conversation. Finite rules, not a script interpreter. */
import * as D from './domain';
import { repairDeficit, type StoryState } from './story';

export const STORY_ENTRIES = ['start', 'location', 'radio', 'father', 'breaker', 'call'] as const;
export type StoryEntry = typeof STORY_ENTRIES[number];
export type StoryTopic = StoryEntry | 'shortage' | 'submit' | 'complete' | 'unknown' | 'report' | 'thanks' | 'tell' | 'tell-unchecked' | 'defer' | 'reported' | 'told' | 'exit';
export interface StoryDialogue { id: `ch01-dlg-${StoryTopic}`; lines: string[]; options: { id: string; text: string }[] }
const option = (id: string, text: string) => ({ id, text });
const exit = (text = '先走了。') => option('exit', text);
/** Read-only current topic projection. Success topics are entered by the Runtime only AFTER their write succeeds. */
export function storyDialogue(s: StoryState, p: D.SaveDataV1, requested: StoryTopic): StoryDialogue | null {
    const breaker = s.clues.includes('breaker-down'), heard = s.clues.includes('heard-call'), reported = s.memory.xiaocai.breakerReported, told = s.choices.call === 'told';
    const topic = requested === 'start' && p.quests.repair ? 'complete' : requested === 'breaker' && reported ? 'reported' : requested === 'call' && told ? 'told' : requested;
    const show = (lines: string[], options: StoryDialogue['options']): StoryDialogue => ({ id: `ch01-dlg-${topic}`, lines, options });
    switch (topic) {
        case 'start': return show(['小蔡：“泵机零件修净水泵，线圈换进发电机，保险管装配电箱。缺多少，单子上都记着。”'], [option('location', '工具柜在哪？'), option('father', '你父亲？'), option('submit', '交付物资'), exit('先去整备。')]);
        case 'location': return show(['小蔡：“旧交易厅后头的配电区，我爸留下的工具柜。你找第二层，拿旧报纸包着的就是。手里现成有的也能顶上，凑够数就往回走。”'], [option('radio', '知道了。'), option('start', '回到刚才的话题。')]);
        case 'radio': return show(['小蔡：“在里头我喊你，听见了就按两下通话键，不用出声。我爸以前教的，杂音大的地方，电工都这么回话。”'], [exit('我记住了。')]);
        case 'father': return show(['小蔡：“他叫蔡建平，管市场线路的。台风那晚他说去拉总闸，怕海水漫进来带电伤人，出了门就再没信儿。食堂门口寻人板第三排写着他。”'], [exit('我会留意。'), option('location', '工具柜在哪？')]);
        case 'shortage': return !p.quests.repair ? show(['小蔡：“数还没凑齐，差哪样单子上都标着。已经带回来的先收好，下回再补，别为赶这一趟硬撑。”'], [option('start', '回到刚才的话题。'), exit()]) : null;
        case 'submit': return p.quests.repair ? show([D.QUESTS.repair.radio, '老栓：“后头那间旧冻库也送了电，能腾出来放东西。扩建的事，你去仓库看。”'], [exit('先去整备。')]) : null;
        case 'complete': return p.quests.repair ? show(['小蔡：“新线圈绕组稳住了，保险管也没再烧。净水泵已经抽上水了。”'], [option('breaker', '市场的事。'), exit()]) : null;
        case 'breaker': return show(['小蔡：“旧交易厅后头那个总闸，你看见了吗？闸刀是拉下来的，还是推上去的？”'], [breaker ? option('report', '拉下来的。') : option('unknown', '我没确认闸位。'), exit('下回再说。')]);
        case 'unknown': return !breaker ? show(['小蔡：“知道了。下回路过配电箱顺眼看一下就行，人先平平安安回来，别专门为这个往深水里绕。”'], [exit('好。')]) : null;
        case 'report': return reported ? show(['小蔡：“……好。”', '他低头翻开值班册，在上面记下一笔：“市场总闸已拉下。”'], [heard && !told ? option('call', '还有件事。') : option('thanks', '继续。')]) : null;
        case 'thanks': return reported ? show(['小蔡：“我爸那晚出门，就是奔着拉这道闸去的。能确定闸拉下来了，也好。”'], [exit('先去整备。')]) : null;
        case 'call': return heard ? show(['小蔡：“还有什么事？”'], [option('tell', '配电区里有喊声，喊着拉闸，水上来了。'), option('defer', '没什么，先不说了。'), exit('关闭')]) : null;
        case 'tell': return told && breaker ? show(['小蔡：“你在那儿看见人了吗？”', '玩家：“没有。总闸拉下来了，周围没人。”', '小蔡：“……我知道了。你人平安回来就好。”'], [exit('知道了。')]) : null;
        case 'tell-unchecked': return told ? show(['小蔡：“你在那儿看见人了吗？”', '玩家：“没有，只听见喊声。”', '小蔡：“我记下了。至于总闸到底拉没拉下来，下回路过再确认吧。”'], [exit('知道了。')]) : null;
        case 'defer': return s.choices.call === 'defer' ? show(['小蔡：“行，你先忙。有什么话等回来再说。”'], [exit()]) : null;
        case 'reported': return reported ? show(['小蔡：“总闸拉下来这事，我已经记在册子上了。”'], [heard && !told ? option('call', '还有件事。') : exit()]) : null;
        case 'told': return told ? show(['小蔡：“配电区那声喊我也记下了。既然没见着人影，先别一口咬定是谁。”'], [exit('好。')]) : null;
        case 'exit': return null;
    }
}
export interface StoryStep { topic: StoryTopic; changed: boolean }
/** Mutates only a private transaction draft. A valid explicit choice is rechecked against current facts. */
export function chooseStory(s: StoryState, p: D.SaveDataV1, topic: StoryTopic, choice: string): StoryStep | null {
    if (p.activeRun || !storyDialogue(s, p, topic)?.options.some(o => o.id === choice)) return null;
    if (choice === 'submit') {
        if (Object.values(repairDeficit(p)).some(n => n > 0)) return { topic: 'shortage', changed: false };
        return D.submitQuest(p, 'repair') ? { topic: 'submit', changed: true } : null;
    }
    if (choice === 'report') { s.memory.xiaocai.breakerReported = true; return { topic: 'report', changed: true }; }
    if (choice === 'tell') {
        s.choices.call = 'told';
        // This explicit utterance includes the observed breaker position; Xiao Cai now actually knows it.
        // The unchecked branch never creates either an observation or a report.
        if (s.clues.includes('breaker-down')) s.memory.xiaocai.breakerReported = true;
        return { topic: s.clues.includes('breaker-down') ? 'tell' : 'tell-unchecked', changed: true };
    }
    if (choice === 'defer') { const changed = s.choices.call !== 'defer'; s.choices.call = 'defer'; return { topic: 'defer', changed }; }
    return { topic: choice as StoryTopic, changed: false };
}
