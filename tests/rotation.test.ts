import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { decodeBackup, encodeBackup, decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';
import { RecoveryStore, SESSION_KEY, decodeSession } from '../src/recovery-store';
import { initialCheckpoint } from '../src/checkpoint';
import { generateRun } from '../src/world';
import { oldProfile } from './fixtures/old-saves';

test('either insertion order fits medkit and water in four cells, without moving existing items', () => {
  for (const order of [['medkit','water'],['water','medkit']]) {
    const inv = D.createInventory(2,2);
    assert.equal(D.addItem(inv,order[0]),0); const first = structuredClone(inv.items[0]);
    assert.equal(D.addItem(inv,order[1]),0); assert.deepEqual(inv.items[0],first);
    assert.equal(inv.items.length,2); assert.equal(D.weight(inv),1.25);
    const before = structuredClone(inv); assert.equal(D.addItem(inv,'bandage'),1); assert.deepEqual(inv,before);
    for (const i of inv.items) assert.ok(D.fits(inv,i.id,i.x,i.y,i.uid,!!i.rotated));
  }
});
test('manual rotation rejects collisions, preserves UID and relief, and follows rotated bounds when moved', () => {
  const inv = D.createInventory(2,2); D.addItem(inv,'water',1,true); D.addItem(inv,'bandage');
  const water = inv.items[0], before = structuredClone(inv);
  assert.equal(D.rotateItem(inv,water.uid),false); assert.deepEqual(inv,before);
  assert.equal(D.moveItem(inv,water.uid,0,1,true),true);
  assert.equal(water.uid,before.items[0].uid); assert.equal(water.relief,true); assert.deepEqual(D.itemSize(water),{w:2,h:1});
  assert.equal(D.moveItem(inv,water.uid,1,1),false);
});
test('rotated settled backups survive validation and reject malformed or legacy orientation', () => {
  const save = D.newSave(); save.safe.items=[]; D.addItem(save.safe,'medkit'); D.addItem(save.safe,'water');
  assert.deepEqual(decodeBackup(encodeBackup(save)),save);
  for (const change of [(s:any)=>{s.safe.items[1].rotated='yes';},(s:any)=>{s.safe.items[1].x=1;},(s:any)=>{s.version=1;}]) {
    const bad=structuredClone(save); change(bad); assert.throws(()=>decodeBackup(JSON.stringify(bad)));
  }
});
test('v2 session migration keeps exact bytes and a failed commit leaves the original record', () => {
  const profile = { ...oldProfile(D.newSave()), version:1 }, old = JSON.stringify({format:'escape-bincov-session',version:2,revision:4,savedAt:10,profile,raid:null,terminal:null,legacyBackup:null});
  const data = new Map([[SESSION_KEY,old]]); let fail=true;
  const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(fail)throw Error('quota');data.set(k,v);}};
  const store=new RecoveryStore(storage), loaded=store.load();
  assert.equal(loaded.save.version,3); assert.equal(store.record?.migrationBackup,old); assert.equal(store.record?.gunsBackup,null);
  assert.throws(()=>store.commit(loaded.save,null)); assert.equal(data.get(SESSION_KEY),old);
  fail=false; const current=store.commit(loaded.save,null); assert.equal(current.version, 8); assert.equal(current.migrationBackup,old); assert.equal(current.gunsBackup,null);
  const decoded=decodeSession(data.get(SESSION_KEY)!); assert.deepEqual(decoded,current);
  const legacy=decodeBackup(JSON.stringify(profile)); assert.equal(legacy.version,3); assert.deepEqual(legacy.bag,profile.bag);
});
test('rotated safe survives checkpoint, death settlement and recovery backup round trip', () => {
  const save=D.newSave(); save.safe.items=[]; D.addItem(save.safe,'medkit'); D.addItem(save.safe,'water');
  const loadout=D.beginRun(save,42), raid=initialCheckpoint(generateRun(42),loadout);
  D.checkpointSafe(save,loadout.safe,loadout.runId); assert.deepEqual(save.safe,loadout.safe);
  const data=new Map<string,string>(), storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  const store=new RecoveryStore(storage); store.load(); const record=store.commit(save,raid);
  const imported=decodePortableBackup(encodeRecoveryBackup(record)); assert.equal(imported.kind,'session');
  if(imported.kind==='session') assert.deepEqual(imported.record.raid,raid);
  const reopened=new RecoveryStore(storage).load(); assert.deepEqual(reopened.raid?.loadout.safe,loadout.safe);
  D.settleRun(save,loadout,'death',0); assert.deepEqual(decodeBackup(encodeBackup(save)).safe,loadout.safe);
});
