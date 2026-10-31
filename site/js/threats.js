// Encounter records: five enemy kinds shown with the game's walking sprites (5 south-facing frames), enlarged.
// Kinds and names come from docs/ENEMY-DESIGN.md and src/enemy-archetypes.ts.
import { strip, enemyFrames } from './strip.js';
const FACTIONS = [
  {
    id: 'raiders', name: '拾荒者团伙', en: 'SCAVENGER GANGS',
    desc: '失业工人、搬运工、滞留旅客……拾荒的人很多，只有靠抢夺、勒索占着资源的团伙才会对你开枪。“盐枭”是他们里头掌握运输和物资的头目。',
    members: ['近身掠夺者', '拾荒枪手', '望风者', '盐枭头目'], sprites: ['raider-gunner', 'raider-boss'], portrait: ['raider-boss', '盐枭头目'],
  },
  {
    id: 'fauna', name: '潮蚀生物', en: 'TIDE-EATEN FAUNA',
    desc: '被异常潮水泡过的动物：壳质增生、盐晶沉积。骨架和习性还认得出来，扑人、钳人、隔着老远喷吐的本事是新长的。',
    members: ['潮蚀蟹', '盐背犬', '囊腹喷吐兽'], sprites: ['saltback-dog', 'tidal-crab'], portrait: ['saltback-dog', '盐背犬', true],
  },
  {
    id: 'affected', name: '盐蚀者', en: 'THE SALT-TOUCHED',
    desc: '在潮水里待太久的人。普通患者还能求助、交涉；敌对的是感知失常的、护巢的，和主动动手的激进守潮人——他们相信受盐能适应新世界。',
    members: ['失神盐蚀者', '追潮者', '守潮执仪者', '盐壳重躯'], sprites: ['tide-ritualist', 'salt-hulk'], portrait: ['tide-ritualist', '守潮执仪者'],
  },
  {
    id: 'mercenaries', name: '雇佣兵', en: 'RECOVERY TEAMS',
    desc: '受某个委托机构派遣，来县里回收样本、资料和设备。灰绿作战服、成套携具、封闭运输箱，不为追人放弃回收目标。',
    members: ['侦察兵', '突击兵', '支援枪手', '回收队长'], sprites: ['mercenary-assault', 'recovery-leader'], portrait: ['recovery-leader', '回收队长'],
  },
  {
    id: 'blockade', name: '沿海封锁队', en: 'COASTAL BLOCKADE',
    desc: '控制退潮通道，组织有限撤离，限制污染外扩。褪色蓝灰制服、臂章清楚；先履行岗位职责，按名单放行，高盐度人员不予通行。',
    members: ['检查哨兵', '巡逻队员', '检查站班长'], sprites: ['blockade-sentry', 'blockade-sergeant'], portrait: ['blockade-sergeant', '检查站班长'],
  },
];

export function createThreats(root) {
  const tabs = root.querySelector('#threatTabs');
  const stage = root.querySelector('#threatStage');
  const kicker = root.querySelector('#threatKicker');
  const name = root.querySelector('#threatName');
  const desc = root.querySelector('#threatDesc');
  const roster = root.querySelector('#threatRoster');
  const buttons = FACTIONS.map((f, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'threat-tab'; b.role = 'tab';
    b.id = 'tab-' + f.id;
    b.setAttribute('aria-controls', 'threatCard');
    b.innerHTML = `${f.name}<small>${f.members.length} 种</small>`;
    b.addEventListener('click', () => show(i));
    b.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const n = (i + (e.key === 'ArrowRight' ? 1 : FACTIONS.length - 1)) % FACTIONS.length;
        show(n); buttons[n].focus(); e.preventDefault();
      }
    });
    tabs.append(b);
    return b;
  });
  let cur = -1;
  function show(i) {
    if (i === cur) return;
    cur = i;
    const f = FACTIONS[i];
    buttons.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    kicker.textContent = `${String(i + 1).padStart(2, '0')} · ${f.en}`;
    name.textContent = f.name;
    desc.textContent = f.desc;
    roster.innerHTML = f.members.map(m => `<li>${m}</li>`).join('');
    stage.innerHTML = '';
    const [file, who, wide] = f.portrait;
    const fig = document.createElement('figure');
    fig.className = 'dossier in' + (wide ? ' wide' : '');
    fig.innerHTML = `<img src="assets/art/enemy-${file}.png" alt="" width="${wide ? 128 : 96}" height="${wide ? 96 : 128}"><figcaption class="px">${who}</figcaption>`;
    stage.append(fig);
    const ingame = document.createElement('div');
    ingame.className = 'ingame';
    ingame.innerHTML = '<small class="px">局内</small>';
    f.sprites.forEach((s, k) => {
      const d = document.createElement('div');
      d.className = 'sprite in';
      strip(enemyFrames(s)).then(url => { d.style.backgroundImage = `url(${url})`; }).catch(console.error);
      d.style.animationDelay = `${-k * 0.23}s, ${k * 0.08}s`;
      ingame.append(d);
    });
    stage.append(ingame);
  }
  show(0);
  return { show };
}
