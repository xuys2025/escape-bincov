// Original icon row profiles, authored at 24x24 (not reduced gun-layer images).
// Each point is [row, inclusive left edge, inclusive right edge].
export const icons = [
  {gun:'mpb5', name:'MP5', h:20, profile:[[0,0,5],[3,0,6],[7,1,7],[11,2,8],[15,4,10],[18,7,13],[19,7,14]], style:'steel', detail:'single-rib'},
  {gun:'umpb45', name:'UMP45', h:20, profile:[[0,1,8],[17,1,8],[18,0,9],[19,0,9]], style:'black', detail:'witness'},
  {gun:'akb74', name:'AK74', h:20, profile:[[0,0,6],[4,0,7],[8,1,8],[12,3,10],[16,6,13],[18,8,15],[19,8,16]], style:'olive', detail:'double-rib'},
  {gun:'akb103', name:'AK103', h:19, profile:[[0,0,8],[3,0,9],[7,1,10],[11,3,12],[15,6,15],[17,8,17],[18,8,18]], style:'black', detail:'double-rib'},
  {gun:'mb4a1', name:'M4A1', h:20, profile:[[0,0,9],[9,0,9],[13,1,10],[17,2,11],[18,2,12],[19,2,12]], style:'steel', detail:'double-rib'},
  {gun:'augb', name:'AUG', h:18, profile:[[0,0,8],[6,0,9],[11,1,10],[15,3,12],[16,3,13],[17,3,13]], style:'olive', detail:'window'},
  {gun:'mb14', name:'M14', h:16, profile:[[0,1,12],[2,0,13],[14,0,13],[15,0,13]], style:'steel', detail:'double-rib'},
  {gun:'rpkb', name:'RPK', h:20, profile:[[0,0,6],[5,0,7],[10,1,8],[14,3,10],[17,5,12],[18,6,14],[19,6,14]], style:'bakelite', detail:'single-rib'},
  {gun:'svdb', name:'SVD', h:13, profile:[[0,0,11],[1,0,12],[7,0,13],[10,0,15],[11,0,16],[12,0,15]], style:'steel', detail:'panel-ribs'},
  {gun:'vb9', name:'VECTOR', h:20, profile:[[0,1,6],[17,1,6],[18,0,7],[19,0,7]], style:'black', detail:'witness'},
];

// The first crop row overlaps the unchanged receiver lip by one pixel.
// Below it the crop's pixels move, with no recoloring, into the magazine layer.
export const splits = [
  {gun:'svdb', code:'h', baseline:'gs-svdb-receiver-h-v2', crop:[14,5,7,5]},
  {gun:'svdb', code:'i', baseline:'gs-svdb-receiver-i-v3', crop:[39,10,11,8]},
  {gun:'svdb', code:'w', baseline:'gs-svdb-receiver-w-v3', crop:[78,21,22,15]},
  {gun:'vb9', code:'h', baseline:'gs-vb9-receiver-h-v1', crop:[13,5,5,5]},
  {gun:'vb9', code:'i', baseline:'gs-vb9-receiver-i-v2', crop:[31,9,9,9]},
  {gun:'vb9', code:'w', baseline:'gs-vb9-receiver-w-v2', crop:[62,19,18,17]},
];
