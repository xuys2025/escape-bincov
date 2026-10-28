/**
 * Gun sound families (#75 H-02): every gun of the gunsmith catalog sounds like one of these. SynthAudio.shot synthesizes
 * each family (audio.ts REPORTS). The view picks the family by the gun the shot event names (timbreOfGun, #28 M2-11)
 * and falls back to the held look for older events (timbreOfLook); a suppressor muffles it on top (audio.ts SUPPRESSED).
 */
import type { GunId } from './gunsmith/catalog';
import type { WeaponLook } from './raid-runtime/contract';

export const GUN_TIMBRES = ['pistol9', 'pistol45', 'smg', 'carbine', 'rifle', 'lmg', 'dmr', 'bolt', 'shotgun-double', 'shotgun-pump', 'shotgun-semi'] as const;
export type GunTimbre = typeof GUN_TIMBRES[number];

/** By calibre and action: 9 mm and .45 pistols, submachine guns, the semi-automatic carbine, assault rifles, the
 *  support gun, marksman and bolt-action rifles, and the three shotgun actions. */
export const TIMBRE_OF_GUN: Readonly<Record<GunId, GunTimbre>> = Object.freeze({
  pistol: 'pistol9', gb17: 'pistol9', pb226: 'pistol9', mb1911: 'pistol45',
  mpb5: 'smg', umpb45: 'smg', pb90: 'smg', vb9: 'smg',
  shotgun: 'shotgun-double', mb870: 'shotgun-pump', mb1014: 'shotgun-semi',
  carbine: 'carbine', akb74: 'rifle', akb103: 'rifle', mb4a1: 'rifle', augb: 'rifle',
  svdb: 'dmr', mb14: 'dmr', mb700: 'bolt', rpkb: 'lmg',
});

/** The family of a held look: the old pistol, the carbine, the double-barrel and the M4A1 sample. Melee looks have none. */
export function timbreOfLook(look: WeaponLook): GunTimbre | null {
  return look === 'pistol' ? 'pistol9' : look === 'carbine' ? 'carbine' : look === 'rifle' ? 'rifle' : look === 'shotgun' ? 'shotgun-double' : null;
}

/** The family of a catalog gun by id (#28 M2-11); null for ids outside the catalog, such as melee or enemy looks. */
export function timbreOfGun(id: string | undefined): GunTimbre | null {
  return id !== undefined && Object.hasOwn(TIMBRE_OF_GUN, id) ? TIMBRE_OF_GUN[id as GunId] : null;
}
