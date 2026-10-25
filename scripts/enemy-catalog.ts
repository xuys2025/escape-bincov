/** Inspect the planning catalog without bundling it into the game or rewriting saved enemy identities. */
import { ENEMY_CATALOG, ENEMY_FACTIONS } from './enemy-catalog-data';
import { LEGACY_ENEMY_PROFILES } from '../src/enemy-profile';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--json' && !arg.startsWith('--id='))) {
    throw Error('Usage: pnpm enemy:catalog [--json] [--id=raider-melee]');
}
const id = args.find(arg => arg.startsWith('--id='))?.slice(5);
const cards = id === undefined ? ENEMY_CATALOG : ENEMY_CATALOG.filter(card => card.id === id);
if (!cards.length) throw Error(`Unknown design archetype: ${id}. Legacy save IDs are not design archetypes.`);
if (args.includes('--json')) {
    console.log(JSON.stringify({ status: 'phased-implementation', factions: ENEMY_FACTIONS, archetypes: cards,
        legacyProfiles: LEGACY_ENEMY_PROFILES }, null, 2));
} else {
    console.log('敌人设计目录（01～03 已接入街区样板；正式素材与其余原型仍在制作）\n');
    console.log('| 编号 | ID | 名称 | 类别 | 立场 | 武器类别 |\n| --- | --- | --- | --- | --- | --- |');
    for (const card of cards) console.log(`| ${card.designNumber} | ${card.id} | ${card.name} | ${ENEMY_FACTIONS[card.faction]} | ${card.defaultStance} | ${card.weaponCategories.join(', ')} |`);
    console.log('\n旧行动继续使用 scav / salt / creature / elite；新街区行动接入三原型。完整交付状态见 docs/tasks/enemy-street-encounter.md。');
}
