import * as D from './domain';
import { TILE } from './world';

export function departureWarnings(save: D.SaveDataV1): string[] {
    const warnings: string[] = [], weapon = save.equipment.weapon && D.WEAPONS[save.equipment.weapon];
    if (!weapon) warnings.push('未装备主武器');
    else if (weapon.ammo && !D.count(save.bag, weapon.ammo)) warnings.push(`背包缺少备用${D.ITEMS[weapon.ammo].name}`);
    const medicine = (inv: D.Inventory) => D.count(inv, 'bandage') + D.count(inv, 'medkit');
    if (!medicine(save.bag)) warnings.push(medicine(save.safe) ? '止血用品仅在安全箱，快捷治疗不可用' : '未携带止血用品');
    return warnings;
}
export function questProgress(save: D.SaveDataV1, loadout: D.RunLoadout | null) {
    return Object.entries(D.QUESTS).filter(([key]) => !save.quests[key]).map(([key, q]) => ({
        key, name: q.name, requirements: D.questRequirements(save, key), needs: Object.entries(q.needs).map(([id, needed]) => ({
            id, needed,
            stored: loadout ? D.count(save.stash, id) : [save.stash, save.bag, save.safe].reduce((n, inv) => n + D.count(inv, id), 0),
            carried: loadout ? D.count(loadout.bag, id) + D.count(loadout.safe, id) : 0,
        })),
    }));
}
export function exitBearing(player: { x: number; y: number }, exit: { x: number; y: number }) {
    const dx = exit.x - player.x, dy = exit.y - player.y, angle = Math.atan2(dy, dx);
    return { angle, direction: ['东', '东南', '南', '西南', '西', '西北', '北', '东北'][(Math.round(angle / (Math.PI / 4)) + 8) % 8], distance: Math.hypot(dx, dy) / TILE };
}
