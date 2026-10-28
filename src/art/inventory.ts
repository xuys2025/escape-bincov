import { brush, C, type PixelContext } from './pixel';
import { paintItem, type ItemArtId } from './items';
import { gunsmithArt } from './gunsmith-hooks';

/** Inventory views have room for the object's proportions; world icons stay compact. */
export const inventoryArtSize = (id: string): readonly [number, number] => {
  switch (id) {
    case 'shotgun': case 'carbine': return [78, 17];
    case 'pistol': case 'gb17': return [38, 17];
    case 'mb4a1': return [80, 17];
    // #28 M3-01: Sol's factory inventory pictures (M3-03).
    case 'pb226': return [40, 17];
    case 'vb9': return [55, 17];
    case 'mpb5': return [65, 17];
    case 'mb870': return [88, 16];
    case 'mb1014': return [86, 16];
    case 'akb74': case 'akb103': return [87, 16];
    case 'augb': return [65, 18];
    case 'medkit': case 'ledger': return [48, 16];
    case 'water': return [12, 32];
    case 'battery': return [22, 32];
    case 'knife': return [14, 32];
    default: return [24, 24];
  }
};

export function paintInventoryItem(c: PixelContext, id: ItemArtId): void {
  // The gunsmith guns' factory pictures and the parts' icons from Sol's art (#28 M2-10), once decoded. The old three
  // keep their painted pictures here: gunsmith-compose.ts cuts these into layers for configured old guns (#28 M3-03).
  const sol = id === 'pistol' || id === 'shotgun' || id === 'carbine' ? null : gunsmithArt?.inventory(id);
  if (sol) { c.drawImage(sol, 0, 0); return; }
  const { r, p } = brush(c), S = C;
  switch (id) {
    case 'shotgun':
      p(S.ink, [[0,9],[18,8],[23,5],[33,5],[35,3],[78,3],[78,9],[39,9],[36,12],[28,12],[23,15],[3,17],[0,15]]);
      p(S.woodDark, [[1,10],[19,9],[25,7],[32,7],[28,11],[21,14],[3,15]]);
      p(S.wood, [[2,10],[18,10],[23,8],[27,8],[21,12],[5,14],[2,14]]);
      r(S.woodLight,3,10,11,1); r(S.ink,1,11,2,4); r(S.woodDark,9,12,7,1);
      r(S.steelDark,30,6,12,4); r(S.steel,33,4,44,2); r(S.steelLight,35,4,40,1);
      r(S.ink,39,6,39,1); r(S.steel,40,7,37,1); r(S.steelDark,76,4,2,4);
      r(S.wood,42,9,17,2); r(S.woodLight,43,9,15,1); r(S.ink,69,2,2,1);
      p(S.steel,[[30,10],[31,10],[31,13],[35,13],[36,10],[37,10],[36,14],[30,14]]);
      r(S.ink,33,10,1,2); r(S.steelLight,30,6,4,1); break;
    case 'carbine':
      p(S.ink,[[0,10],[17,8],[21,7],[22,4],[43,4],[44,3],[48,3],[48,4],[78,4],[78,8],[57,8],[55,11],[40,11],[42,16],[35,17],[32,11],[27,11],[22,13],[2,17],[0,16]]);
      p(S.woodDark,[[1,11],[18,9],[26,9],[23,12],[4,15],[1,15]]);
      p(S.wood,[[2,11],[17,10],[22,10],[16,12],[4,14],[2,14]]); r(S.woodLight,3,11,9,1);
      r(S.steelDark,23,5,29,5); r(S.steel,24,5,22,2); r(S.steelLight,25,5,15,1);
      r(S.ink,29,6,5,1); r(S.steelLight,35,6,5,1); r(S.ink,38,7,2,2);
      r(S.steel,47,5,30,2); r(S.steelLight,51,5,25,1); r(S.steelDark,76,5,2,3);
      r(S.ink,66,3,2,2); r(S.steel,67,2,1,1); r(S.wood,44,8,15,2); r(S.woodLight,45,8,12,1);
      p(S.steelDark,[[33,10],[39,10],[41,15],[36,16]]); p(S.steel,[[34,11],[36,11],[38,15],[36,15]]);
      p(S.steel,[[26,10],[27,10],[27,13],[30,13],[31,10],[32,10],[31,14],[26,14]]); r(S.ink,29,10,1,2); break;
    case 'pistol':
      p(S.ink,[[1,1],[36,1],[36,3],[38,3],[38,8],[23,8],[23,12],[18,13],[16,17],[4,17],[8,9],[1,9]]);
      r(S.steelDark,2,3,34,5); r(S.steel,3,2,32,4); r(S.steelLight,4,2,28,1);
      r(S.ink,6,3,1,2); r(S.ink,9,3,1,2); r(S.ink,25,3,5,1); r(S.ink,36,4,2,2);
      p(S.woodDark,[[10,8],[18,9],[15,16],[5,16]]); p(S.wood,[[10,9],[16,10],[13,15],[7,15]]);
      p(S.woodLight,[[10,10],[12,10],[10,14],[8,14]]); r(S.brass,12,12,1,1);
      p(S.steel,[[18,8],[22,8],[22,11],[20,12],[17,12],[17,11],[20,11],[21,10],[21,9],[18,9]]);
      r(S.ink,19,9,1,2); break;
    case 'medkit':
      r(S.ink,19,0,11,4); r(S.paperShade,20,1,9,1); r(S.ink,0,3,48,13);
      r(S.redDark,1,4,46,11); r(S.red,2,4,42,9); r(S.redLight,3,4,40,1);
      r(S.woodDark,5,5,3,10); r(S.woodDark,39,5,3,10); r(S.paperShade,5,8,3,3); r(S.paperShade,39,8,3,3);
      r(S.redDark,9,7,28,1); r(S.paper,20,8,10,6); r(S.red,24,9,2,4); r(S.red,22,10,6,2);
      r(S.redLight,11,12,5,1); r(S.ink,45,7,2,6); break;
    case 'water':
      r(S.ink,3,0,6,4); r(S.paperShade,4,1,4,2);
      p(S.ink,[[3,4],[9,4],[12,9],[12,29],[9,32],[3,32],[0,29],[0,9]]);
      p(S.tealDark,[[4,5],[8,5],[10,10],[10,28],[8,30],[3,30],[2,28],[2,10]]);
      p(S.teal,[[4,6],[7,6],[9,11],[9,27],[7,29],[4,29],[3,27],[3,11]]);
      r(S.tealLight,3,10,2,14); r(S.paperShade,5,15,5,9); r(S.paper,5,15,4,2); r(S.tealDark,6,19,3,1);
      r(S.tealDark,3,26,6,1); r(S.steel,4,29,4,1); break;
    case 'battery':
      r(S.ink,3,0,6,5); r(S.ink,14,1,6,4); r(S.steelLight,4,1,4,2); r(S.woodLight,15,2,4,2);
      r(S.ink,0,5,22,27); r(S.clothDark,1,6,20,25); r(S.brass,2,6,18,4); r(S.brassLight,2,6,17,1);
      r(S.steelDark,2,11,18,18); r(S.teal,2,12,2,15); r(S.paperShade,6,14,12,9); r(S.paper,7,15,10,7);
      r(S.ink,9,16,1,5); r(S.ink,8,18,3,1); r(S.ink,13,18,3,1); r(S.steel,4,28,13,1); break;
    case 'knife':
      p(S.ink,[[6,0],[10,0],[12,6],[10,20],[14,20],[14,23],[9,24],[9,31],[2,32],[2,24],[0,24],[0,21],[4,20],[4,6]]);
      p(S.steel,[[7,1],[9,2],[10,7],[8,20],[5,20],[5,7]]); p(S.paper,[[7,2],[8,3],[7,18],[5,19],[6,7]]);
      r(S.steelDark,1,21,12,2); r(S.woodDark,3,24,5,7); r(S.wood,3,24,2,6); r(S.paperShade,3,25,4,1); r(S.paperShade,3,28,4,1); break;
    case 'ledger':
      p(S.ink,[[1,1],[22,0],[25,1],[46,0],[48,2],[48,14],[25,16],[22,15],[0,16],[0,3]]);
      r(S.tealDark,1,3,46,12); r(S.teal,2,3,44,10); r(S.paperShade,4,3,18,10); r(S.paper,5,3,16,8);
      r(S.paperShade,25,2,19,10); r(S.paper,26,2,17,8); r(S.wood,22,2,3,12);
      for(const x of [7,28]) { r(S.steelDark,x,5,12,1); r(S.steelDark,x,7,10,1); r(S.steel,x,9,6,1); }
      r(S.red,38,10,3,6); r(S.redLight,38,10,1,5); break;
    // Placeholders until Sol's inventory art (ART-SPEC I, M2-10): the G17's squared slide and polymer frame.
    case 'gb17':
      p(S.ink,[[1,1],[36,1],[37,2],[37,8],[34,8],[34,10],[24,10],[24,14],[17,14],[16,17],[5,17],[8,10],[1,9]]);
      r(S.edge,2,2,35,6); r(S.steelDark,2,2,35,2); r(S.steel,3,2,32,1); r(S.steelDark,36,3,1,4);
      for (const x of [3,5,7]) r(S.ink,x,4,1,3); r(S.ink,21,3,7,2);
      r(S.clothDark,8,8,26,2); r(S.cloth,27,8,6,1); for (const x of [28,30,32]) r(S.ink,x,8,1,1);
      r(S.clothDark,18,12,6,2); r(S.clothDark,22,10,2,3); r(S.steel,19,10,1,2);
      p(S.clothDark,[[9,10],[17,10],[16,16],[6,16]]); for (const [x,y] of [[10,11],[13,11],[9,13],[12,13],[8,15],[11,15],[14,15]]) r(S.cloth,x,y,1,1); break;
    // The M4A1: sliding stock and buffer tube, railed receiver, slotted handguard, front sight, barrel, grip, magazine.
    case 'mb4a1':
      p(S.ink,[[0,3],[13,4],[13,11],[0,14]]); r(S.ink,12,5,9,4); r(S.ink,20,1,22,10); r(S.ink,41,3,21,7); r(S.ink,56,0,4,4); r(S.ink,61,5,15,3); r(S.ink,74,4,6,5);
      p(S.ink,[[25,10],[30,10],[27,17],[22,17]]); p(S.ink,[[32,10],[39,10],[40,17],[33,17]]);
      p(S.steelDark,[[1,4],[12,5],[12,10],[1,13]]); r(S.steel,2,5,9,1); r(S.edge,4,9,6,2);
      r(S.steel,13,6,7,2); r(S.steelDark,21,3,20,7); r(S.steel,21,3,20,1); r(S.ink,27,5,6,2); r(S.brass,28,5,2,1);
      for (let x = 21; x < 41; x += 2) r(S.steel,x,2,1,1);
      r(S.edge,42,4,19,5); for (let x = 44; x < 60; x += 4) r(S.ink,x,5,2,2); r(S.steelDark,57,1,2,3);
      r(S.steel,62,6,13,1); r(S.steelDark,75,5,4,3); r(S.ink,77,5,1,3);
      p(S.steelDark,[[26,11],[29,11],[26,16],[23,16]]); r(S.ink,30,10,2,3);
      p(S.steel,[[33,11],[38,11],[39,16],[34,16]]); r(S.steelLight,34,11,1,5); r(S.steelDark,37,12,1,4); break;
    default: paintItem(c, id, 24);
  }
}
