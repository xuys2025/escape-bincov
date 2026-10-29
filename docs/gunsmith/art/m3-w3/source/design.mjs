// Native pixel profiles in final I and W coordinates. No runtime image resampling.
export const specs = {
 'mb4a1-mag-factory': { i:[10,16,[[0,0,8],[5,0,8],[10,1,9],[15,2,10]]], w:[20,32,[[0,0,16],[10,0,16],[20,2,18],[31,4,20]]], style:'steel' },
 'akb74-mag-factory': { i:[13,17,[[0,0,6],[4,0,7],[9,2,9],[13,4,12],[16,6,13]]], w:[26,34,[[0,0,12],[8,0,14],[18,4,18],[26,8,24],[33,12,26]]], style:'olive' },
 'akb103-mag-factory': { i:[16,18,[[0,0,8],[4,0,9],[9,2,11],[14,5,14],[17,8,16]]], w:[32,36,[[0,0,16],[8,0,18],[18,4,22],[28,10,28],[35,16,32]]], style:'black' },
 'mpb5-mag-factory': { i:[12,14,[[0,0,6],[4,0,6],[8,2,8],[11,4,11],[13,5,12]]], w:[24,28,[[0,0,12],[8,0,12],[16,4,16],[22,8,22],[27,10,24]]], style:'steel', openTop:true },
 'umpb45-mag-factory': { i:[8,15,[[0,0,8],[14,0,8]]], w:[16,30,[[0,0,16],[29,0,16]]], style:'black', openTop:true },
 'augb-mag-factory': { i:[10,16,[[0,0,7],[6,0,7],[11,1,8],[15,3,10]]], w:[20,32,[[0,0,14],[12,0,14],[22,2,16],[31,6,20]]], style:'olive', graftTop:[4,8], witness:true },
 'mb14-mag-factory': { i:[9,11,[[0,0,9],[10,0,9]]], w:[18,22,[[0,0,18],[21,0,18]]], style:'steel', lipRow:[2,4] },
 'rpkb-mag-factory': { i:[14,22,[[0,0,7],[5,0,8],[11,1,9],[17,3,12],[21,6,14]]], w:[28,44,[[0,0,14],[10,0,16],[22,2,18],[34,6,24],[43,12,28]]], style:'bakelite' },
 'g01': { i:[7,13,[[0,0,5],[3,0,5],[11,0,5],[12,0,7]]], w:[14,26,[[0,0,10],[6,0,10],[22,0,10],[23,0,14],[25,0,14]]], style:'black', graftTop:[3,6], witness:true },
 'g02': { i:[7,5,[[0,0,7],[4,0,7]]], w:[14,10,[[0,0,14],[9,0,14]]], style:'steel', graftTop:[1,2], floorplate:true },
 'g03': { i:[13,14,[[0,0,6],[4,0,6],[8,2,8],[11,4,11],[13,5,13]]], w:[26,28,[[0,0,12],[8,0,12],[16,4,16],[22,8,22],[27,10,26]]], style:'steel', openTop:true, pullTab:true },
 'g04': { i:[9,19,[[0,0,9],[18,0,9]]], w:[18,38,[[0,0,18],[37,0,18]]], style:'black', openTop:true, witness:true },
 'g08': { i:[16,23,[[0,0,6],[5,0,7],[11,2,9],[17,5,12],[22,9,16]]], w:[32,46,[[0,0,12],[10,0,14],[22,4,18],[34,10,24],[45,18,32]]], style:'olive' },
 'g09': { i:[20,20], w:[40,40], style:'steel', drum:true },
 'g10': { i:[10,16,[[0,0,9],[5,0,9],[10,0,9],[15,1,10]]], w:[20,32,[[0,0,18],[10,0,18],[20,0,18],[31,2,20]]], style:'black', pullTab:true },
 'g11': { i:[10,15,[[0,0,10],[14,0,10]]], w:[20,30,[[0,0,20],[29,0,20]]], style:'steel', witness:true, lipRow:[2,4] },
 'g12': { i:[15,19,[[0,0,10],[4,0,10],[9,1,11],[14,3,13],[18,5,15]]], w:[30,38,[[0,0,20],[8,0,20],[18,2,22],[28,6,26],[37,10,30]]], style:'black', witness:true },
};
// Shared feed lips belong to the receiver. Embedded magazines start immediately below them.
export const embedded = {
 'svdb-receiver': { i:{mask:[37,11,15,7],box:[39,11,11,7],lip:10}, w:{mask:[74,22,30,14],box:[78,22,22,14],lip:21}, style:'steel' },
 'vb9-receiver': { i:{mask:[30,10,12,8],box:[31,10,9,8],lip:9}, w:{mask:[60,20,24,16],box:[62,20,18,16],lip:19}, style:'black' },
};
// Each BRIEF section 3 row. A slash in the brief expands into two real configurations.
export const rows = [
 {gun:'mb4a1',label:'M4A1 FACTORY / G10',variants:[null,'G10'],size:[4,2],target:14,lip:7},
 {gun:'akb74',label:'AK74 FACTORY',variants:[null],size:[4,2],target:16,lip:6},
 {gun:'akb74',label:'AK74 G08 45',variants:['G08'],size:[4,3],target:22,lip:6},
 {gun:'akb103',label:'AK103 FACTORY',variants:[null],size:[4,2],target:17,lip:6},
 {gun:'akb103',label:'AK103 G09 DRUM',variants:['G09'],size:[4,3],target:19,lip:6},
 {gun:'mpb5',label:'MP5 FACTORY / G03',variants:[null,'G03'],size:[3,2],target:14,lip:6},
 {gun:'umpb45',label:'UMP45 FACTORY',variants:[null],size:[3,2],target:15,lip:6},
 {gun:'umpb45',label:'UMP45 G04',variants:['G04'],size:[3,3],target:19,lip:6},
 {gun:'augb',label:'AUG FACTORY / G10',variants:[null,'G10'],size:[3,2],target:12,lip:12},
 {gun:'mb14',label:'M14 FACTORY',variants:[null],size:[5,2],target:9,lip:8},
 {gun:'mb14',label:'M14 G11',variants:['G11'],size:[5,2],target:13,lip:8},
 {gun:'svdb',label:'SVD FACTORY',variants:[null],size:[5,2],target:7,lip:10},
 {gun:'rpkb',label:'RPK FACTORY 40',variants:[null],size:[5,2],target:21,lip:6},
 {gun:'rpkb',label:'RPK G12',variants:['G12'],size:[5,2],target:18,lip:6},
 {gun:'rpkb',label:'RPK G09 DRUM',variants:['G09'],size:[5,3],target:20,lip:6},
 {gun:'vb9',label:'VECTOR FACTORY',variants:[null],size:[2,2],target:8,lip:9},
 {gun:'gb17',label:'G17 G01',variants:['G01'],size:[2,2],target:10,lip:16},
 {gun:'mb1911',label:'M1911 G02',variants:['G02'],size:[2,2],target:4,lip:16},
];
