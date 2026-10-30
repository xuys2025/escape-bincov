import { gunsmithArt } from './gunsmith-hooks';
import { brush, C, type PixelContext } from './pixel';

/**
 * Gunsmith items with placeholder art (#28 M2-01, M2-02): the two catalog guns and the 20 sample attachments. Sol's
 * PNG art (docs/gunsmith/ART-SPEC.md, M2-09) replaces every one of these drawings in M2-10.
 */
const PART_ART_IDS = ['O01', 'O03', 'O08', 'M03', 'M06', 'B01', 'B08', 'H01', 'H05', 'S01', 'S02', 'P01', 'P02', 'F01', 'F03', 'G01', 'G10', 'T01', 'T05', 'A07'] as const;
/**
 * The #28 M3 guns, parts and wave two's rounds: Sol's art only (M3-03, M3-07), decoded before the first frame. Their
 * placeholders, for unit tests and a failed decode, are one generic gun, one generic part and one generic pair of rounds.
 */
const WAVE_GUNS = ['pb226', 'mpb5', 'vb9', 'mb870', 'mb1014', 'akb74', 'akb103', 'augb', 'mb1911', 'umpb45', 'pb90', 'svdb', 'mb14', 'mb700', 'rpkb'] as const;
const WAVE_PARTS = ['A01', 'A02', 'A04', 'A05', 'A06', 'A08', 'B03', 'B05', 'B06', 'B07', 'B09', 'H02', 'H03', 'H04', 'H06', 'H07', 'H08', 'H09', 'S03', 'S04', 'S05', 'S07', 'S08', 'P03', 'P04', 'P06', 'P07', 'G03', 'G06', 'G07', 'G08', 'G09', 'M01', 'M02', 'M05', 'M07', 'M10', 'M11', 'T04', 'T08',
  'O05', 'O10', 'F04', 'F07', 'T02', 'T10',
  'O02', 'O04', 'O06', 'O07', 'O09', 'O11', 'O12', 'M04', 'M08', 'M09', 'M12', 'B02', 'B04', 'B10', 'H10', 'S06', 'S09', 'S10', 'P05', 'P08',
  'F02', 'F05', 'F06', 'F08', 'G02', 'G04', 'G05', 'G11', 'G12', 'T03', 'T06', 'T07', 'T09', 'A03'] as const;
const WAVE_AMMO = ['ammo45', 'ammoPDW', 'ammoHeavy'] as const;
/**
 * The factory magazines taken out at the workbench (#28 M4-07, catalog FACTORY_MAGS): their gun's magazine image as the
 * icon (gunsmith-compose.ts), the generic part until it is decoded.
 */
export const FACTORY_MAG_ART = ['mpb5-mag', 'umpb45-mag', 'akb74-mag', 'akb103-mag', 'mb4a1-mag', 'augb-mag', 'mb14-mag', 'rpkb-mag', 'svdb-mag', 'vb9-mag'] as const;
export const ITEM_ART_IDS = ['knife', 'pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'bandage', 'medkit', 'antidote', 'water', 'food', 'scrap', 'wire', 'fuse', 'battery', 'watch', 'pearl', 'sample', 'ledger', 'cloth', 'analgesic', 'focus', 'strengthDose', 'constitutionDose', 'techniqueDose', 'luckyCharm', 'unluckyCharm', 'luckySachet', 'unluckySachet', 'gb17', 'mb4a1', ...PART_ART_IDS, ...WAVE_GUNS, ...WAVE_PARTS, ...WAVE_AMMO, ...FACTORY_MAG_ART] as const;
export type ItemArtId = typeof ITEM_ART_IDS[number];
type PartArtId = typeof PART_ART_IDS[number];

/** Authored 32px silhouettes. Texture identity never depends on a runtime tint. */
export function paintItem(c: PixelContext, id: ItemArtId, size: 24 | 32): void {
  // Sol's icons of the gunsmith guns and parts (#28 M2-10) once decoded; the placeholders below until then.
  const sol = gunsmithArt?.icon(id, size);
  if (sol) { c.drawImage(sol.img, sol.x, sol.y); return; }
  if (paintRpgItem(c, id, size)) return;
  if ((PART_ART_IDS as readonly string[]).includes(id)) { paintPartPlaceholder(c, id as PartArtId, size); return; }
  if ([...WAVE_GUNS, ...WAVE_PARTS, ...WAVE_AMMO, ...FACTORY_MAG_ART].includes(id as never)) { paintWavePlaceholder(c, id, size); return; }
  if (size === 24) { paintSmall(c, id); return; }
  const { r, p, e } = brush(c), S = C;
  switch (id) {
    case 'knife':
      p(S.ink, [[2,27],[9,18],[8,16],[11,13],[14,15],[27,2],[30,1],[29,9],[17,22],[19,24],[16,27],[13,25],[6,31]]);
      p(S.steel, [[12,17],[28,3],[27,10],[16,22]]); p(S.paper, [[12,17],[28,3],[24,11],[15,20]]);
      p(S.steelDark, [[8,16],[10,14],[18,24],[16,26]]); p(S.wood, [[3,27],[10,19],[13,23],[6,29]]);
      r(S.paperShade, 5,25,3,2); r(S.woodLight, 8,21,2,3); break;
    case 'pistol':
      p(S.ink, [[3,6],[28,6],[28,8],[31,8],[31,15],[19,15],[19,21],[14,23],[12,30],[3,29],[7,17],[3,16]]);
      r(S.steel,4,8,24,6); r(S.steelLight,5,7,22,2); r(S.steelDark,5,12,21,3); r(S.ink,27,9,3,3);
      p(S.wood,[[8,16],[15,17],[11,28],[4,27]]); p(S.woodLight,[[8,17],[11,18],[7,26],[5,26]]);
      p(S.steel,[[14,16],[18,16],[17,21],[14,22],[14,20],[16,20],[16,18],[13,18]]);
      r(S.ink,6,9,1,3); r(S.ink,9,9,1,3); r(S.paperShade,8,22,2,2); break;
    case 'shotgun':
      p(S.ink,[[1,17],[8,11],[13,11],[14,8],[30,8],[31,10],[31,19],[17,19],[11,24],[2,27]]);
      p(S.wood,[[2,18],[8,13],[14,13],[16,18],[10,22],[3,25]]); p(S.woodLight,[[2,18],[8,13],[12,13],[9,16],[3,20]]);
      r(S.steelDark,13,9,17,10); r(S.steelLight,14,9,16,2); r(S.steel,14,12,15,2);
      r(S.ink,15,14,16,2); r(S.steelLight,16,16,14,2); r(S.wood,14,18,8,3); r(S.woodLight,14,18,8,1);
      r(S.ink,4,20,1,4); r(S.steelDark,11,22,4,2); break;
    case 'carbine':
      p(S.ink,[[1,18],[8,12],[11,13],[13,8],[20,8],[21,10],[31,10],[31,15],[22,15],[21,20],[23,27],[16,29],[13,20],[9,22],[2,25]]);
      p(S.wood,[[2,18],[8,14],[15,14],[16,19],[9,20],[3,23]]); p(S.woodLight,[[3,18],[8,14],[13,14],[10,17]]);
      r(S.steel,12,11,18,3); r(S.steelLight,14,10,15,1); r(S.steelDark,12,14,12,4); r(S.wood,21,14,7,3);
      p(S.steel,[[16,18],[20,18],[22,26],[17,27]]); p(S.steelDark,[[19,19],[20,19],[21,25],[19,26]]);
      r(S.ink,14,9,5,2); r(S.brassLight,14,9,2,1); r(S.ink,28,8,2,3); break;
    case 'ammo9':
      for (const [x,y] of [[4,9],[17,4]]) {
        e(S.ink,x,y,10,11); r(S.ink,x,y+5,10,18); e(S.brassLight,x+1,y+1,8,9);
        r(S.brass,x+1,y+7,8,14); r(S.brassLight,x+2,y+8,2,12); r(S.woodDark,x+7,y+7,2,14);
        r(S.ink,x,y+18,10,1); r(S.paperShade,x+1,y+20,8,2);
      } break;
    case 'shell':
      for (const [x,y] of [[2,5],[18,9]]) {
        r(S.ink,x,y,12,22); r(S.red,x+1,y+2,10,14); r(S.redLight,x+2,y+3,2,12); r(S.redDark,x+9,y+3,2,13);
        r(S.paperShade,x+1,y+1,10,2); r(S.ink,x+4,y+1,3,1); r(S.brass,x+1,y+17,10,3);
        r(S.brassLight,x,y+20,12,2); r(S.woodDark,x+8,y+18,3,2);
      } break;
    case 'ammoR':
      for (const [x,y] of [[4,1],[18,4]]) {
        p(S.ink,[[x+4,y],[x+7,y+5],[x+7,y+10],[x+10,y+13],[x+10,31],[x,31],[x,y+13],[x+3,y+10],[x+3,y+5]]);
        p(S.woodLight,[[x+4,y+2],[x+6,y+6],[x+6,y+11],[x+3,y+11],[x+3,y+6]]);
        p(S.brass,[[x+3,y+11],[x+6,y+11],[x+9,y+14],[x+9,29],[x+1,29],[x+1,y+14]]);
        r(S.brassLight,x+2,y+14,2,14-y); r(S.paperShade,x+1,29,8,1); r(S.woodDark,x+7,y+14,2,14-y);
      } break;
    case 'bandage':
      p(S.ink,[[3,3],[27,3],[27,5],[30,5],[30,28],[27,28],[27,30],[3,30],[3,28],[1,28],[1,5],[3,5]]);
      r(S.paperShade,3,4,24,25); r(S.paper,4,7,24,18); r(S.steel,4,5,22,2); r(S.steel,4,26,22,2);
      e(S.clothDark,7,11,14,11); e(S.paperShade,8,12,12,9); e(S.paper,10,13,8,7); e(S.clothDark,12,14,4,5);
      p(S.paperShade,[[18,15],[23,18],[23,23],[17,23],[17,21],[21,21],[21,19],[18,18]]);
      r(S.red,22,8,4,2); r(S.red,24,8,2,4); r(S.paper,5,8,2,3); break;
    case 'medkit':
      r(S.ink,9,2,14,7); r(S.paperShade,10,3,12,2); r(S.ink,12,5,8,3);
      p(S.ink,[[3,7],[28,7],[31,10],[31,27],[28,30],[3,30],[1,27],[1,10]]);
      r(S.redDark,3,10,26,18); r(S.red,3,8,25,13); r(S.redLight,4,9,23,2); r(S.redDark,3,14,26,2);
      r(S.woodDark,5,17,3,10); r(S.woodDark,24,17,3,10); r(S.brassLight,6,18,2,3); r(S.brassLight,24,18,2,3);
      r(S.paper,12,17,8,8); r(S.red,15,18,2,6); r(S.red,13,20,6,2); r(S.redLight,4,26,5,1); break;
    case 'antidote':
      r(S.ink,7,1,18,8); r(S.paperShade,8,2,16,5); r(S.paper,9,2,14,1); r(S.steelDark,10,5,2,2); r(S.steelDark,15,5,2,2); r(S.steelDark,20,5,2,2);
      p(S.ink,[[7,8],[25,8],[29,12],[29,28],[26,31],[5,31],[2,28],[2,12]]);
      r(S.tealDark,4,12,23,16); r(S.teal,5,10,21,15); r(S.tealLight,5,12,3,11);
      r(S.paperShade,9,14,16,12); r(S.paper,9,14,14,10); p(S.clothDark,[[12,21],[13,18],[17,17],[20,18],[19,21],[15,23]]);
      r(S.cloth,15,18,2,5); r(S.teal,10,28,14,1); break;
    case 'water':
      r(S.ink,10,1,12,7); r(S.teal,11,2,10,4); r(S.tealLight,12,2,8,1);
      p(S.ink,[[10,7],[22,7],[25,12],[25,28],[22,31],[9,31],[6,28],[6,12]]);
      p(S.steel,[[11,8],[21,8],[23,13],[23,28],[21,29],[10,29],[8,27],[8,13]]);
      r(S.teal,9,19,14,8); r(S.tealLight,9,19,14,2); r(S.paper,10,11,2,10); r(S.tealDark,20,13,2,13);
      r(S.paper,12,14,8,5); r(S.tealDark,14,15,4,2); r(S.steelLight,9,25,13,1); r(S.steelLight,11,28,9,1); break;
    case 'food':
      e(S.ink,2,17,28,13); r(S.ink,2,9,28,15); r(S.woodDark,3,10,26,15); r(S.brass,4,11,24,15);
      r(S.red,4,15,24,8); r(S.redLight,5,15,3,8); p(S.paper,[[9,18],[13,16],[19,17],[21,16],[21,22],[18,20],[13,21]]);
      r(S.redDark,13,18,1,1); e(S.ink,2,3,28,13); e(S.steel,3,4,26,10); e(S.paperShade,5,5,22,7);
      e(S.ink,13,5,8,6); e(S.steelLight,14,6,6,3); r(S.steelDark,9,10,7,1); r(S.steelLight,7,26,17,2); break;
    case 'scrap':
      r(S.ink,20,3,10,15); r(S.steel,22,4,7,11); r(S.steelLight,23,4,6,2); r(S.ink,27,7,3,5);
      p(S.ink,[[8,5],[20,5],[27,12],[27,24],[20,31],[8,31],[1,24],[1,12]]);
      p(S.steelDark,[[8,7],[20,7],[25,12],[25,23],[19,29],[8,29],[3,23],[3,13]]);
      p(S.steel,[[8,7],[19,7],[24,12],[21,13],[8,10],[5,15],[3,15],[3,12]]);
      e(S.ink,7,12,15,13); e(S.woodDark,9,14,11,9); e(S.ink,11,15,8,7);
      r(S.paperShade,8,8,3,2); r(S.paperShade,4,21,2,3); r(S.wood,19,25,4,2); r(S.ink,20,10,2,2); r(S.ink,8,26,2,2); break;
    case 'wire':
      e(S.ink,1,2,27,27); e(S.teal,2,3,25,25); e(S.tealLight,3,4,23,22); e(S.tealDark,6,7,17,18);
      e(S.teal,7,8,15,16); e(S.ink,10,10,10,12); r(S.clothDark,1,13,8,4); r(S.clothDark,20,12,8,4);
      p(S.ink,[[20,20],[25,20],[25,25],[30,25],[31,30],[25,31],[20,26]]);
      p(S.teal,[[21,21],[24,21],[24,26],[29,26],[29,29],[25,29],[21,25]]);
      r(S.brassLight,28,25,3,2); r(S.brass,29,28,2,2); r(S.tealLight,5,7,2,4); break;
    case 'fuse':
      p(S.ink,[[1,11],[7,11],[7,8],[25,8],[25,11],[31,11],[31,23],[25,23],[25,26],[7,26],[7,23],[1,23]]);
      r(S.paperShade,7,9,18,16); r(S.paper,8,10,16,12); r(S.steel,2,12,6,10); r(S.steel,24,12,6,10);
      r(S.steelLight,2,12,6,3); r(S.steelLight,24,12,6,3); r(S.steelDark,5,15,3,7); r(S.steelDark,27,15,3,7);
      r(S.clothDark,12,15,8,2); r(S.clothDark,12,18,5,1); r(S.paper,10,23,12,1); break;
    case 'battery':
      r(S.ink,5,1,8,6); r(S.ink,20,2,8,6); r(S.steelLight,6,2,6,3); r(S.woodLight,21,3,6,3);
      r(S.ink,3,6,27,25); r(S.clothDark,4,7,25,22); r(S.brass,5,7,23,5); r(S.brassLight,5,7,23,2);
      r(S.steelDark,5,13,22,14); r(S.teal,6,14,3,13); r(S.paperShade,11,16,13,8); r(S.paper,12,17,11,6);
      r(S.ink,14,18,2,4); r(S.ink,13,19,4,2); r(S.ink,19,19,3,2); r(S.steelLight,6,28,7,1); break;
    case 'watch':
      e(S.ink,11,0,10,9); e(S.brass,12,1,8,7); e(S.ink,14,2,4,4); r(S.brassLight,13,1,5,1);
      e(S.ink,2,6,28,26); e(S.woodDark,3,7,26,24); e(S.brass,4,7,24,23); e(S.brassLight,5,8,22,21);
      e(S.ink,7,10,18,17); e(S.paperShade,8,11,16,15); e(S.paper,9,11,14,13);
      r(S.ink,15,12,2,2); r(S.ink,9,18,2,2); r(S.ink,21,18,2,2); r(S.ink,15,23,2,2);
      r(S.woodDark,15,17,7,2); p(S.ink,[[15,17],[17,17],[20,24],[18,24]]); r(S.brass,15,17,2,2); break;
    case 'pearl':
      e(S.ink,2,26,28,5); e(S.ink,3,2,26,27); e(S.tealDark,4,3,24,25); e(S.teal,5,3,23,23);
      e(S.steelLight,5,3,22,21); e(S.paper,6,4,19,17); e('#faf2d6',8,5,9,6);
      p(S.tealLight,[[5,14],[8,19],[15,23],[23,21],[26,16],[25,22],[19,27],[11,27],[6,22]]);
      r(S.paper,8,12,2,2); r(S.steel,20,22,3,2); break;
    case 'sample':
      r(S.ink,3,2,26,7); r(S.steelDark,4,3,24,5); r(S.steelLight,5,3,22,2); r(S.ink,8,6,2,2); r(S.ink,22,6,2,2);
      p(S.ink,[[5,9],[27,9],[29,12],[29,27],[26,31],[6,31],[3,27],[3,12]]);
      r(S.steel,5,11,22,16); r(S.redDark,6,19,20,9); r(S.red,6,18,20,6); r(S.redLight,6,18,20,2);
      r(S.paper,6,12,2,7); r(S.tealDark,24,11,2,6); r(S.paperShade,11,13,11,10); r(S.paper,12,13,9,8);
      r(S.redDark,17,4,4,13); r(S.redLight,18,5,1,10); r(S.ink,14,18,4,2); r(S.steelLight,9,28,13,1); break;
    case 'ledger':
      p(S.ink,[[3,3],[27,3],[31,7],[31,28],[4,30],[1,27],[1,6]]);
      r(S.woodDark,2,6,27,21); r(S.paperShade,6,24,23,4); r(S.paper,7,24,20,1); r(S.steelDark,8,27,18,1);
      r(S.tealDark,3,4,26,20); r(S.teal,6,4,21,18); r(S.tealLight,6,4,20,2); r(S.wood,3,4,3,22);
      r(S.paperShade,10,8,13,10); r(S.paper,11,9,11,8); p(S.tealDark,[[12,13],[21,13],[19,16],[14,16]]);
      r(S.tealDark,16,10,1,4); r(S.red,23,20,3,10); r(S.redLight,23,20,1,8); break;
    // Placeholders until Sol's PNG art (M2-10): a squared dark slide over a stippled polymer frame.
    case 'gb17':
      p(S.ink,[[2,5],[30,5],[31,6],[31,12],[29,12],[29,16],[22,16],[22,21],[14,21],[13,30],[3,30],[6,17],[2,16]]);
      r(S.edge,3,6,27,6); r(S.steelDark,3,6,27,2); r(S.steel,4,6,24,1); r(S.steelDark,30,7,1,4);
      for (const x of [4,6,8]) r(S.ink,x,8,1,3);
      r(S.ink,16,8,6,2); r(S.clothDark,6,12,23,4); r(S.cloth,22,13,6,1); for (const x of [23,25,27]) r(S.ink,x,13,1,1);
      r(S.clothDark,15,19,7,2); r(S.clothDark,20,16,2,4); r(S.steel,16,16,1,3);
      p(S.clothDark,[[7,16],[14,16],[13,29],[4,29]]); r(S.edge,4,28,9,1);
      for (const [x,y] of [[9,18],[12,18],[8,21],[11,21],[7,24],[10,24],[6,27],[9,27]]) r(S.cloth,x,y,1,1); break;
    // A black modular rifle: sliding stock, railed receiver and handguard, curved magazine.
    case 'mb4a1':
      p(S.ink,[[1,18],[8,13],[12,13],[12,8],[22,8],[22,11],[31,11],[31,16],[23,16],[24,27],[19,28],[18,17],[16,17],[14,25],[9,25],[11,17],[9,18],[3,24]]);
      r(S.ink,27,6,3,5);
      p(S.steelDark,[[2,18],[8,14],[11,14],[11,16],[9,17],[3,22]]); r(S.steel,5,16,3,1);
      r(S.steelDark,13,9,9,7); r(S.steel,13,9,9,1); for (let x = 13; x < 22; x += 2) r(S.steel,x,8,1,1); r(S.ink,15,11,4,2);
      r(S.edge,22,12,9,4); for (const x of [24,26,28]) r(S.ink,x,13,1,2); r(S.steelDark,28,7,1,4);
      p(S.steelDark,[[12,18],[15,18],[13,24],[10,24]]);
      p(S.steel,[[19,17],[22,17],[23,26],[20,27]]); r(S.steelLight,20,18,1,8); break;
  }
}

/** Separate 24px drawings: fewer ribs, wider openings and larger identity marks. */
function paintSmall(c: PixelContext, id: ItemArtId): void {
  const { r, p, e } = brush(c), S = C;
  switch (id) {
    case 'knife':
      p(S.ink,[[1,21],[6,14],[5,12],[8,10],[10,12],[21,1],[23,1],[22,7],[13,17],[15,19],[12,22],[10,20],[5,24]]);
      p(S.steel,[[9,13],[22,2],[21,7],[12,17]]); p(S.paper,[[9,13],[22,2],[18,8],[11,15]]);
      p(S.wood,[[2,21],[7,15],[10,19],[5,22]]); r(S.paperShade,4,18,3,2); p(S.steelDark,[[6,12],[8,11],[14,19],[12,20]]); break;
    case 'pistol':
      p(S.ink,[[1,3],[21,3],[21,5],[23,5],[23,11],[14,11],[14,17],[10,18],[8,23],[1,22],[4,13],[1,12]]);
      r(S.steel,2,5,19,6); r(S.steelLight,3,4,17,2); r(S.steelDark,3,9,17,2); r(S.ink,21,6,2,2);
      p(S.wood,[[5,12],[11,13],[7,21],[2,20]]); r(S.woodLight,5,14,2,5); r(S.steel,11,13,2,3); r(S.ink,4,6,1,2); break;
    case 'shotgun':
      p(S.ink,[[0,13],[6,8],[10,8],[10,5],[23,5],[24,7],[24,14],[14,14],[9,18],[1,22]]);
      p(S.wood,[[1,14],[6,10],[11,10],[13,14],[8,17],[2,20]]); p(S.woodLight,[[1,14],[6,10],[9,10],[6,13],[2,16]]);
      r(S.steelDark,10,6,13,8); r(S.steelLight,11,6,12,2); r(S.ink,11,9,13,2); r(S.steel,11,11,12,2); r(S.woodLight,11,14,6,2); break;
    case 'carbine':
      p(S.ink,[[0,13],[6,9],[9,9],[9,5],[15,5],[16,7],[24,7],[24,11],[17,11],[16,15],[18,22],[12,23],[10,15],[6,18],[1,20]]);
      p(S.wood,[[1,14],[6,11],[11,11],[12,14],[6,16],[2,18]]); r(S.woodLight,3,13,5,2);
      r(S.steel,10,8,13,3); r(S.steelLight,11,7,10,1); r(S.wood,17,11,5,2); p(S.steel,[[12,14],[15,14],[17,21],[13,21]]); r(S.ink,11,6,4,2); break;
    case 'ammo9':
      for (const [x,y] of [[1,5],[13,1]]) { e(S.ink,x,y,9,9); r(S.ink,x,y+5,9,14); e(S.brassLight,x+1,y+1,7,7); r(S.brass,x+1,y+6,7,11); r(S.brassLight,x+2,y+7,2,9); r(S.paperShade,x+1,y+16,7,2); } break;
    case 'shell':
      for (const [x,y] of [[1,2],[13,5]]) { r(S.ink,x,y,10,18); r(S.red,x+1,y+2,8,11); r(S.redLight,x+2,y+3,2,9); r(S.paperShade,x+1,y+1,8,2); r(S.brass,x+1,y+13,8,3); r(S.brassLight,x,y+16,10,1); } break;
    case 'ammoR':
      for (const [x,y] of [[2,0],[14,3]]) { p(S.ink,[[x+3,y],[x+6,y+5],[x+6,y+8],[x+8,y+10],[x+8,24],[x,24],[x,y+10],[x+2,y+8],[x+2,y+4]]); p(S.woodLight,[[x+3,y+2],[x+5,y+5],[x+5,y+9],[x+2,y+9],[x+2,y+5]]); r(S.brass,x+1,y+10,6,12-y); r(S.brassLight,x+2,y+10,2,11-y); r(S.paperShade,x+1,22,6,1); } break;
    case 'bandage':
      r(S.ink,1,1,22,22); r(S.paperShade,2,2,20,20); r(S.paper,3,5,18,14); r(S.steel,3,3,18,2); r(S.steel,3,20,18,1);
      e(S.clothDark,5,8,12,10); e(S.paperShade,6,9,10,8); e(S.paper,8,10,6,6); e(S.clothDark,10,11,3,4);
      r(S.paperShade,15,13,4,5); r(S.red,17,6,3,2); break;
    case 'medkit':
      r(S.ink,7,0,11,5); r(S.paperShade,8,1,9,2); r(S.ink,10,3,5,2); r(S.ink,0,5,24,18);
      r(S.redDark,1,7,22,15); r(S.red,2,6,20,11); r(S.redLight,2,6,20,2); r(S.redDark,2,11,20,2);
      r(S.paper,9,13,7,7); r(S.red,12,14,1,5); r(S.red,10,16,5,1); r(S.brassLight,3,14,2,3); r(S.brassLight,19,14,2,3); break;
    case 'antidote':
      r(S.ink,4,0,16,6); r(S.paperShade,5,1,14,4); r(S.paper,6,1,12,1);
      p(S.ink,[[4,6],[20,6],[23,9],[23,21],[21,24],[2,24],[0,21],[0,9]]);
      r(S.teal,2,9,19,13); r(S.tealLight,3,9,2,9); r(S.paper,7,11,12,9); p(S.clothDark,[[9,16],[11,13],[16,13],[17,15],[13,18],[10,18]]); break;
    case 'water':
      r(S.ink,7,0,10,5); r(S.tealLight,8,1,8,3); p(S.ink,[[7,5],[17,5],[20,10],[20,21],[18,24],[5,24],[3,21],[3,10]]);
      p(S.steel,[[8,6],[16,6],[18,10],[18,21],[16,22],[7,22],[5,20],[5,10]]);
      r(S.teal,6,15,12,5); r(S.tealLight,6,15,12,2); r(S.paper,6,9,2,6); r(S.paperShade,9,10,7,4); r(S.tealDark,10,11,4,1); r(S.steelLight,7,21,9,1); break;
    case 'food':
      e(S.ink,1,15,22,8); r(S.ink,1,7,22,12); r(S.brass,2,8,20,12); r(S.red,2,11,20,7);
      p(S.paper,[[6,14],[10,12],[15,13],[18,12],[18,17],[15,15],[10,17]]); e(S.ink,1,1,22,11); e(S.steel,2,2,20,8); e(S.paperShade,4,3,16,5);
      e(S.ink,10,3,7,4); e(S.steelLight,11,4,5,2); r(S.steelLight,6,21,12,1); break;
    case 'scrap':
      r(S.ink,16,1,8,11); r(S.steel,17,2,6,8); r(S.steelLight,18,2,5,2); r(S.ink,21,5,3,3);
      p(S.ink,[[6,4],[15,4],[21,10],[21,18],[15,24],[6,24],[0,18],[0,10]]);
      p(S.steelDark,[[6,5],[15,5],[20,10],[20,17],[14,22],[6,22],[2,17],[2,10]]);
      p(S.steel,[[6,5],[15,5],[18,8],[7,8],[3,12],[2,10]]); e(S.ink,5,10,12,10); e(S.woodDark,7,12,8,6); e(S.ink,9,13,5,4); r(S.paperShade,5,6,3,2); r(S.wood,15,19,3,2); break;
    case 'wire':
      e(S.ink,0,0,22,22); e(S.tealLight,1,1,20,20); e(S.teal,3,3,16,16); e(S.ink,7,6,9,11);
      r(S.clothDark,0,9,7,3); r(S.clothDark,16,8,6,3); p(S.ink,[[16,16],[20,16],[20,19],[24,19],[24,24],[19,24],[16,21]]);
      p(S.teal,[[17,17],[19,17],[19,21],[23,21],[23,23],[20,23],[17,20]]); r(S.brassLight,22,19,2,2); break;
    case 'fuse':
      r(S.ink,4,5,16,15); r(S.ink,0,8,24,9); r(S.paperShade,5,6,14,13); r(S.paper,6,7,12,9);
      r(S.steel,1,9,5,7); r(S.steel,18,9,5,7); r(S.steelLight,1,9,5,2); r(S.steelLight,18,9,5,2); r(S.clothDark,9,11,6,2); r(S.clothDark,9,14,3,1); break;
    case 'battery':
      r(S.ink,3,0,7,5); r(S.ink,15,1,7,5); r(S.steelLight,4,1,5,3); r(S.woodLight,16,2,5,2); r(S.ink,1,5,22,19);
      r(S.clothDark,2,6,20,17); r(S.brass,2,6,20,4); r(S.brassLight,3,6,18,1); r(S.steelDark,3,11,18,10); r(S.teal,3,12,2,9);
      r(S.paper,8,13,11,7); r(S.ink,10,14,1,5); r(S.ink,9,16,3,1); r(S.ink,15,16,3,1); break;
    case 'watch':
      e(S.ink,8,0,9,7); e(S.brassLight,9,1,7,5); e(S.ink,11,2,3,3); e(S.ink,1,5,22,19);
      e(S.brass,2,6,20,17); e(S.brassLight,3,6,18,16); e(S.ink,5,8,14,13); e(S.paper,6,9,12,11);
      r(S.ink,11,10,1,2); r(S.woodDark,11,14,6,2); p(S.ink,[[11,14],[13,14],[16,19],[14,19]]); r(S.ink,7,14,2,1); break;
    case 'pearl':
      e(S.ink,1,19,22,5); e(S.ink,1,0,22,23); e(S.teal,2,1,20,21); e(S.steelLight,2,1,19,18); e(S.paper,3,2,17,14); e('#faf2d6',5,3,8,5);
      p(S.tealLight,[[3,13],[7,17],[13,19],[20,15],[18,20],[10,22],[5,19]]); break;
    case 'sample':
      r(S.ink,1,1,22,6); r(S.steel,2,2,20,4); r(S.steelLight,3,2,18,1); p(S.ink,[[3,7],[21,7],[23,10],[23,21],[20,24],[3,24],[1,21],[1,10]]);
      r(S.steel,3,9,18,12); r(S.redDark,4,14,16,8); r(S.red,4,14,16,5); r(S.redLight,4,14,16,2);
      r(S.paper,4,9,2,5); r(S.paperShade,8,11,10,8); r(S.paper,9,11,8,6); r(S.redDark,13,3,4,11); r(S.redLight,14,3,1,10); r(S.ink,10,15,3,1); break;
    case 'ledger':
      p(S.ink,[[2,1],[21,1],[24,4],[24,21],[3,24],[0,21],[0,4]]); r(S.woodDark,1,3,22,18); r(S.paperShade,5,19,18,3); r(S.paper,6,19,16,1);
      r(S.tealDark,2,2,20,17); r(S.teal,5,2,16,15); r(S.tealLight,5,2,15,2); r(S.wood,2,2,3,19);
      r(S.paper,8,6,11,8); p(S.tealDark,[[9,10],[18,10],[16,13],[11,13]]); r(S.tealDark,13,7,1,4); r(S.red,18,16,3,8); break;
    // Placeholders until Sol's PNG art (M2-10).
    case 'gb17':
      p(S.ink,[[1,3],[22,3],[23,4],[23,9],[21,9],[21,12],[16,12],[16,16],[11,16],[10,23],[2,23],[5,12],[1,11]]);
      r(S.edge,2,4,20,5); r(S.steelDark,2,4,20,1); r(S.steel,3,4,17,1); for (const x of [3,5]) r(S.ink,x,6,1,2);
      r(S.ink,12,5,4,2); r(S.clothDark,5,9,16,3); r(S.cloth,16,10,4,1);
      r(S.clothDark,11,14,5,1); r(S.clothDark,15,12,1,3); r(S.steel,12,12,1,2);
      p(S.clothDark,[[6,12],[11,12],[10,22],[3,22]]); for (const [x,y] of [[7,14],[9,14],[6,17],[8,17],[5,20],[7,20]]) r(S.cloth,x,y,1,1); break;
    case 'mb4a1':
      p(S.ink,[[1,13],[6,10],[9,10],[9,6],[17,6],[17,8],[24,8],[24,12],[17,12],[18,20],[14,21],[13,13],[12,13],[11,19],[7,19],[8,13],[7,14],[2,18]]);
      r(S.ink,20,4,2,4);
      p(S.steelDark,[[2,13],[6,11],[8,11],[8,12],[7,13],[3,17]]);
      r(S.steelDark,10,7,7,5); for (let x = 10; x < 17; x += 2) r(S.steel,x,6,1,1); r(S.ink,11,8,3,1);
      r(S.edge,17,9,6,2); r(S.ink,19,9,1,1); r(S.ink,21,9,1,1); r(S.steelDark,21,5,1,3);
      p(S.steelDark,[[9,14],[11,14],[10,18],[8,18]]); p(S.steel,[[14,13],[16,13],[17,19],[15,20]]); r(S.steelLight,15,14,1,5); break;
  }
}

/**
 * Placeholder icons of the 20 sample attachments (#28 M2-02) until Sol's PNG art replaces them (M2-10): one 24 px
 * drawing each, centred in the 32 px slot like the RPG supplies (ART-SPEC section 2), every one a different shape.
 */
/** A wave-one gun or part before Sol's art: a gun's side outline, or a part's plain block on a rail clamp. */
function paintWavePlaceholder(c: PixelContext, id: string, size: 24 | 32): void {
  const S = C, { r } = brush(c), o = size === 32 ? 4 : 0;
  if ((WAVE_GUNS as readonly string[]).includes(id)) {
    r(S.ink, o + 1, o + 8, 22, 6); r(S.steelDark, o + 2, o + 9, 20, 4); r(S.steel, o + 2, o + 9, 20, 1);
    r(S.ink, o + 8, o + 13, 5, 8); r(S.edge, o + 9, o + 14, 3, 6); return;
  }
  if ((WAVE_AMMO as readonly string[]).includes(id)) {
    for (const x of [o + 5, o + 13]) { r(S.ink, x, o + 4, 6, 16); r(S.brass, x + 1, o + 8, 4, 11); r(S.brassLight, x + 1, o + 5, 4, 3); }
    return;
  }
  r(S.ink, o + 4, o + 6, 16, 12); r(S.steelDark, o + 5, o + 7, 14, 10); r(S.steel, o + 5, o + 7, 14, 1); r(S.edge, o + 6, o + 17, 12, 2);
}
function paintPartPlaceholder(c: PixelContext, id: PartArtId, size: 24 | 32): void {
  const S = C, base = brush(c), o = size === 32 ? 4 : 0;
  const r = (color: string, x: number, y: number, w: number, h: number) => base.r(color, x + o, y + o, w, h);
  const p = (color: string, points: readonly (readonly [number, number])[]) => base.p(color, points.map(([x, y]) => [x + o, y + o] as const));
  /** A picatinny rail: dark body with light teeth every other pixel. */
  const rail = (x: number, y: number, w: number) => { r(S.ink, x, y, w, 3); for (let i = 1; i < w - 1; i += 2) r(S.steel, x + i, y + 1, 1, 1); };
  switch (id) {
    case 'O01': // micro dot: a low hood with a small window
      r(S.ink,4,14,16,6); r(S.steelDark,5,15,14,4); r(S.steel,5,15,14,1);
      p(S.ink,[[6,5],[16,5],[19,15],[5,15]]); p(S.edge,[[7,6],[15,6],[17,14],[6,14]]); r(S.tealLight,8,8,7,4); r(S.red,11,9,2,2); break;
    case 'O03': // open dot: one tall glass pane on a rail clamp, the emitter behind it
      rail(2,17,20); r(S.ink,12,3,8,15); r(S.steelDark,13,4,6,13); r(S.tealLight,14,5,4,10); r(S.teal,14,12,4,3);
      r(S.ink,4,12,6,6); r(S.steelDark,5,13,4,4); r(S.red,6,14,2,2); break;
    case 'O08': // long scope: eyepiece and objective bells on a tube, a turret, two rings
      r(S.ink,0,7,6,11); r(S.ink,5,9,13,7); r(S.ink,17,5,7,15); r(S.ink,10,5,4,5); r(S.ink,6,15,3,5); r(S.ink,14,15,3,5);
      r(S.edge,1,8,4,9); r(S.steelDark,5,10,12,5); r(S.steel,5,10,12,1); r(S.edge,18,6,5,13); r(S.teal,22,8,1,9); r(S.steelDark,11,6,2,3);
      r(S.steel,7,16,1,3); r(S.steel,15,16,1,3); break;
    case 'M03': // pistol suppressor: a plain can with a threaded collar
      r(S.ink,1,8,22,9); r(S.steelDark,2,9,20,7); r(S.steel,2,9,20,2); r(S.edge,2,14,20,2);
      for (const x of [7,12,17]) r(S.ink,x,9,1,7); r(S.brass,0,11,2,3); r(S.ink,22,11,2,3); break;
    case 'M06': // rifle brake: a short block with three side ports
      r(S.ink,5,7,15,11); r(S.steelDark,6,8,13,9); r(S.steel,6,8,13,1); for (const x of [8,12,16]) r(S.ink,x,10,2,4);
      r(S.ink,1,10,5,5); r(S.brass,2,11,3,3); break;
    case 'B01': // pistol barrel kit: a chamber hood, a short barrel and a threaded tip
      r(S.ink,2,6,9,10); r(S.brass,3,7,7,8); r(S.brassLight,3,7,7,2); r(S.ink,10,8,10,6); r(S.steel,10,9,9,4); r(S.steelLight,10,9,9,1);
      for (const x of [19,21]) r(S.ink,x,9,1,4); r(S.steelDark,20,9,1,4); r(S.ink,22,9,1,4); break;
    case 'B08': // long precision barrel: fluted, with a gas block
      r(S.ink,0,9,24,6); r(S.steel,0,10,24,4); r(S.steelLight,0,10,24,1); for (const x of [3,7]) r(S.steelDark,x,12,3,1);
      r(S.ink,13,6,5,9); r(S.steelDark,14,7,3,7); r(S.ink,21,8,3,8); break;
    case 'H01': // short railed handguard
      r(S.ink,3,8,18,10); r(S.edge,4,9,16,8); for (const x of [6,10,14]) r(S.ink,x,11,2,3); rail(3,5,18); r(S.steelDark,4,16,16,1); break;
    case 'H05': // wooden carbine handguard with rails above and below
      r(S.ink,2,7,20,11); r(S.wood,3,8,18,9); r(S.woodLight,3,8,18,2); r(S.woodDark,3,15,18,2); rail(4,4,16); rail(6,17,12); break;
    case 'S01': // light stock: a skeleton frame
      p(S.ink,[[2,4],[22,8],[22,14],[2,21]]); p(S.steelDark,[[3,6],[21,9],[21,13],[3,19]]); p(S.ink,[[6,9],[17,10],[17,12],[6,15]]); r(S.steel,3,6,4,1); break;
    case 'S02': // steady stock: solid, with a cheek riser and a rubber pad
      p(S.ink,[[3,3],[22,7],[22,16],[3,22]]); p(S.steelDark,[[5,5],[21,8],[21,15],[5,20]]); r(S.steel,6,6,10,2); r(S.ink,0,3,4,20); r(S.clothDark,1,4,2,18); r(S.edge,8,12,10,2); break;
    case 'P01': // light grip: slim and swept back
      p(S.ink,[[7,2],[16,2],[13,22],[5,22]]); p(S.steelDark,[[8,3],[15,3],[12,21],[6,21]]); r(S.steel,9,3,5,1); break;
    case 'P02': // steady grip: wide, finger grooves and a beavertail
      p(S.ink,[[4,1],[20,1],[17,23],[5,23]]); p(S.edge,[[5,2],[19,2],[16,22],[6,22]]); r(S.ink,2,1,4,4); r(S.steel,6,2,12,1);
      for (const y of [9,13,17]) r(S.steelDark,7,y,8,2); break;
    case 'F01': // short vertical foregrip on a rail clamp
      rail(3,3,18); r(S.ink,8,5,8,16); r(S.steelDark,9,6,6,14); r(S.steel,9,6,2,13); r(S.ink,8,19,8,3); break;
    case 'F03': // angled foregrip: a sloped wedge under its clamp
      rail(2,4,20); p(S.ink,[[3,7],[22,7],[22,11],[6,18],[3,18]]); p(S.steelDark,[[4,8],[21,8],[21,10],[6,17],[4,17]]); r(S.steel,4,8,16,1); break;
    case 'G01': // pistol magazine with a long floor plate
      r(S.ink,8,1,8,21); r(S.edge,9,2,6,18); r(S.steel,9,2,6,1); for (const y of [6,10,14]) r(S.brass,13,y,1,2); r(S.ink,6,19,12,5); r(S.clothDark,7,20,10,3); break;
    case 'G10': // short rifle magazine with a pull loop
      p(S.ink,[[6,2],[16,2],[18,19],[8,20]]); p(S.steelDark,[[7,3],[15,3],[17,18],[9,19]]); r(S.steel,8,3,2,15); r(S.ink,9,20,8,3); r(S.red,10,21,6,2); break;
    case 'T01': // laser: a small box with a red emitter and a switch
      r(S.ink,3,7,18,10); r(S.steelDark,4,8,16,8); r(S.steel,4,8,16,1); r(S.ink,17,9,5,6); r(S.red,18,10,3,4); r(S.redLight,18,10,1,1); r(S.ink,7,4,4,4); r(S.brass,8,5,2,2); break;
    case 'T05': // floodlight: a tube with a wide lit head
      r(S.ink,1,9,15,7); r(S.steelDark,2,10,13,5); r(S.steel,2,10,13,1); r(S.ink,14,5,9,15); r(S.edge,15,6,7,13); r(S.paper,20,7,2,11); r(S.brassLight,21,8,1,9); break;
    case 'A07': // carbine top base: a rail on two clamp legs
      rail(1,7,22); r(S.ink,3,9,18,4); r(S.steelDark,4,10,16,2); r(S.ink,4,12,5,8); r(S.ink,15,12,5,8); r(S.steel,5,13,3,6); r(S.steel,16,13,3,6); break;
  }
}

/** New supplies share the material ramps; integer layouts retain crisp compact icons. */
function paintRpgItem(c: PixelContext, id: ItemArtId, size: 24 | 32): boolean {
  if (!['cloth', 'analgesic', 'focus', 'strengthDose', 'constitutionDose', 'techniqueDose', 'luckyCharm', 'unluckyCharm', 'luckySachet', 'unluckySachet'].includes(id)) return false;
  const S = C, base = brush(c).r, offset = size === 32 ? 4 : 0;
  const r = (color: string, x: number, y: number, w: number, h: number) => base(color, x + offset, y + offset, w, h);
  if (id === 'cloth') {
    r(S.ink, 2, 4, 21, 20); r(S.clothDark, 3, 3, 19, 19); r(S.paperShade, 4, 3, 17, 17);
    r(S.paper, 4, 4, 17, 2); r(S.cloth, 4, 17, 16, 3);
    for (const y of [8, 12, 16]) r(S.clothDark, 4, y, 16, 1);
    r(S.paper, 18, 7, 2, 9);
  } else if (id === 'analgesic') {
    r(S.ink, 3, 2, 19, 22); r(S.steel, 4, 3, 17, 19); r(S.steelLight, 5, 3, 15, 2);
    for (const x of [6, 14]) for (const y of [7, 15]) {
      r(S.steelDark, x, y, 6, 5); r(S.paperShade, x + 1, y + 1, 4, 3); r(S.paper, x + 1, y + 1, 4, 1);
    }
    r(S.red, 5, 21, 4, 1);
  } else if (id === 'focus' || id.endsWith('Dose')) {
    const colors = { focus: S.teal, strengthDose: S.red, constitutionDose: S.cloth, techniqueDose: S.brass };
    const color = colors[id as keyof typeof colors];
    r(S.ink, 6, 4, 13, 17); r(S.steelLight, 7, 5, 11, 15); r(color, 8, 12, 9, 7);
    r(S.paper, 8, 6, 2, 10); r(S.steelDark, 10, 1, 5, 4); r(S.paperShade, 9, 2, 7, 2);
    r(S.ink, 11, 20, 3, 4); r(S.steel, 12, 20, 1, 3);
    // Labels differ in shape as well as colour, including in a grayscale view.
    if (id === 'focus') { r(S.ink, 12, 13, 1, 5); r(S.ink, 10, 15, 5, 1); }
    if (id === 'strengthDose') { r(S.ink, 10, 14, 5, 3); r(color, 11, 15, 3, 1); }
    if (id === 'constitutionDose') { r(S.ink, 10, 13, 5, 2); r(S.ink, 11, 15, 3, 3); }
    if (id === 'techniqueDose') { for (const y of [13, 15, 17]) r(S.ink, 10, y, 5, 1); }
  } else if (id.endsWith('Charm')) {
    r(S.wood, 11, 0, 2, 12); r(S.ink, 5, 10, 15, 14);
    r(id === 'luckyCharm' ? S.clothLight : S.wood, 6, 11, 13, 11);
    r(S.clothDark, 9, 13, 7, 7); r(S.brassLight, 11, 12, 3, 3);
    if (id === 'luckyCharm') { r(S.paperShade, 10, 17, 5, 1); r(S.paperShade, 12, 15, 1, 5); }
    else { r(S.ink, 13, 15, 2, 7); r(S.ink, 10, 17, 3, 1); }
  } else {
    r(S.woodDark, 8, 1, 8, 5); r(S.brass, 10, 2, 4, 6); r(S.ink, 3, 8, 19, 16);
    r(id === 'luckySachet' ? S.cloth : S.wood, 4, 9, 17, 13);
    r(S.paperShade, 5, 8, 15, 3); r(S.clothDark, 7, 12, 11, 9);
    r(S.brassLight, 11, 14, 2, 5);
    if (id === 'luckySachet') r(S.brassLight, 9, 16, 6, 1);
    else { r(S.ink, 14, 13, 2, 7); r(S.ink, 9, 14, 2, 2); }
  }
  return true;
}
