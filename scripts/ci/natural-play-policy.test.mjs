import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { assessPreparation, naturalRetreatReason, confirmSupplyUse, chooseSafeContainer, confirmedNativeTransfer } from '../natural-play-policy.mjs';

const ready = () => ({ revision: 4, confirmed: true, storageOK: true, conflict: false, pending: false,
  phase: 'hideout', activeRun: false, hp: 72, hpMax: 100, bleeding: false, cash: 44,
  bagMedical: 1, totalRounds: 12, gunReady: true, spareCells: 3 });
test('natural preparation accepts committed policy facts without editing them', () => {
  const s = ready(), before = structuredClone(s); assert.equal(assessPreparation(s).ready, true); assert.deepEqual(s, before);
});
test('HP1/17 and missing, failed or conflicting preparation cannot silently deploy', () => {
  for (const patch of [{ hp: 1 }, { hp: 17 }, { hp: 69 }, { confirmed: false }, { storageOK: false }, { conflict: true }, { pending: true }, { hp: undefined }])
    assert.equal(assessPreparation({ ...ready(), ...patch }).ready, false);
});
test('carried medicine, matching gun/ammunition and free space are independent requirements', () => {
  for (const patch of [{ bagMedical: 0 }, { gunReady: false }, { totalRounds: 11 }, { spareCells: 0 }])
    assert.equal(assessPreparation({ ...ready(), ...patch }).ready, false);
});
test('natural retreat preserves ammunition for the return route and reacts before critically low health', () => {
  assert.equal(naturalRetreatReason({ hp: 72, mag: 0, ammo: 12 }), null);
  assert.equal(naturalRetreatReason({ hp: 72, mag: 8, ammo: 0 }), 'ammunition-reserve');
  assert.equal(naturalRetreatReason({ hp: 59, mag: 8, ammo: 24 }), 'low-health');
  assert.equal(naturalRetreatReason({ hp: 60, mag: 8, ammo: 1 }), null);
});
test('supply acknowledgement requires a new committed revision, real consumption and observed treatment', () => {
  const before = { revision: 4, hp: 1, bleeding: true, quantities: { med: 2 } };
  const after = { ...ready(), revision: 5, hp: 56, bleeding: false, quantities: { med: 1 } };
  assert.equal(confirmSupplyUse(before, after, 'med').committed, true);
  for (const patch of [{ revision: 4 }, { quantities: { med: 2 } }, { hp: 1, bleeding: true }, { storageOK: false }])
    assert.equal(confirmSupplyUse(before, { ...after, ...patch }, 'med').committed, false);
});
test('first loot rejects empty/unreachable routes and the original 220px LOS danger, including along the path', () => {
  const s = { x: 0, y: 0, containers: [{ id: 'near-danger', x: 10, y: 0, items: 1 }, { id: 'safe', x: 400, y: 0, items: 1 }, { id: 'unreachable', x: 500, y: 0, items: 1 }], enemies: [{ x: 10, y: 0 }] };
  const route = (_s, c) => c.id === 'unreachable' ? [] : [{ x: c.x, y: c.y }];
  assert.equal(chooseSafeContainer(s, new Set(), route, () => true).container.id, 'safe');
  assert.equal(chooseSafeContainer(s, new Set(['400,0']), route, () => true), null);
  assert.equal(chooseSafeContainer({ ...s, containers: [s.containers[1]] }, new Set(), () => [{ x: 5, y: 0 }, { x: 400, y: 0 }], () => true), null);
  assert.equal(chooseSafeContainer(s, new Set(), route, () => false).container.id, 'near-danger', 'a wall blocks the same original LOS danger rule');
});
test('native drag proof rejects death, closed inventory, another run and a source disappearance without bag growth', () => {
  const item = { id: 'cloth', uid: 'cloth-1', qty: 2 }, before = { state: 'run', runId: 'run-1', map: { id: 'coast' }, lootContext: { containerId: 'box' }, bag: { items: [] }, containers: [{ id: 'box', inventory: { items: [item] } }] };
  const after = { state: 'run', runId: 'run-1', map: { id: 'coast' }, lootContext: { containerId: 'box' }, bag: { items: [item] }, containers: [{ id: 'box', inventory: { items: [] } }] };
  assert.equal(confirmedNativeTransfer(before, after, 'box', item), true);
  for (const patch of [{ state: 'result' }, { runId: 'run-2' }, { map: { id: 'flat-1' } }, { lootContext: null }, { bag: { items: [] } }, { containers: [] },
    { containers: [{ id: 'box', inventory: { items: [{ ...item, uid: 'replacement' }] } }] }])
    assert.equal(!!confirmedNativeTransfer(before, { ...after, ...patch }, 'box', item), false);
});
test('preparation funds supplies at official sale prices without selling reserves, relief or safe contents', () => {
  const code = `
    import assert from 'node:assert/strict';
    import {preparationSale} from './scripts/natural-play-preparation.mjs';
    import {itemSale} from './src/domain.ts';
    const item=(id,uid,qty=1,extra={})=>({id,uid,qty,x:0,y:0,...extra});
    const record={profile:{bag:{items:[item('cloth','cloth',2),item('bandage','medicine'),item('ammo9','ammo',40),item('pistol','gun'),item('water','drink')]},
      stash:{items:[item('watch','relief-watch',1,{relief:true})]},safe:{items:[item('watch','safe-watch')]}}};
    const before=structuredClone(record),sale=preparationSale(record);
    assert.equal(sale.uid,'cloth');assert.equal(sale.source,'bag');assert.equal(sale.price,itemSale(record.profile.bag.items[0]).value);
    assert.deepEqual(record,before,'quotes cannot move or sell owned items');
    record.profile.bag.items.shift();assert.equal(preparationSale(record),null,'no reserved or restricted fallback');
    record.profile.stash.items.push(item('watch','ordinary-watch'));assert.equal(preparationSale(record).uid,'ordinary-watch');
    assert.equal(preparationSale(record,'bag'),null,'banking does not repeatedly move goods already at the base');
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
test('native loot destinations respect a long magazine, rotation and relief stack provenance', () => {
  const code = `
    import assert from 'node:assert/strict';
    import {naturalLootDestination} from './scripts/natural-play-preparation.mjs';
    import {createInventory,itemSize} from './src/domain.ts';
    const gun={uid:'long-g17',id:'gb17',qty:1,x:0,y:0,gun:{parts:[{uid:'long-mag',id:'G01',slot:'mag',children:[]}],devices:{laser:false,light:false}}};
    assert.deepEqual(itemSize(gun),{w:2,h:2});
    assert.equal(naturalLootDestination(createInventory(2,1),gun),null,'a factory-sized gap cannot accept the fitted gun');
    const bag=createInventory(4,2);bag.items.push({uid:'blocked-row',id:'watch',qty:1,x:0,y:1});
    const before=structuredClone(bag);assert.deepEqual(naturalLootDestination(bag,gun),{x:1,y:0});assert.deepEqual(bag,before);
    const turned={...gun,gun:{...gun.gun,parts:[]},rotated:true};
    assert.deepEqual(itemSize(turned),{w:1,h:2});assert.deepEqual(naturalLootDestination(createInventory(1,2),turned),{x:0,y:0});
    const relief=createInventory(2,1);relief.items.push({uid:'aid',id:'ammo9',qty:12,x:0,y:0,relief:true});
    assert.deepEqual(naturalLootDestination(relief,{uid:'owned',id:'ammo9',qty:12}),{x:1,y:0},'ordinary rounds cannot merge with relief rounds');
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
test('medical preparation uses real RPG effects and protects a complete medical reserve before ammunition purchases', () => {
  const code = `
    import assert from 'node:assert/strict';
    import {createSessionState,SaveSession} from './src/session.ts';
    import {CoastRaidRuntime} from './src/raid-runtime/runtime.ts';
    import {addItem} from './src/domain.ts';
    import {medicalPreparationPlan,preparationFacts,readCommittedPreparation} from './scripts/natural-play-preparation.mjs';
    import {assessPreparation} from './scripts/natural-play-policy.mjs';
    const s=createSessionState(),data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
    const saves=new SaveSession(s,()=>storage,undefined,()=>1792900000000);assert.ok(saves.initialize());s.state='hideout';assert.ok(saves.ensureRpg());
    const read=()=>({phase:s.state,storageOK:s.storageOK,conflict:s.conflict,pending:!!s.pendingSettlement,confirmed:true,record:saves.currentRecord()});
    assert.equal(assessPreparation(preparationFacts(read())).ready,true);
    globalThis.window={__bincov:{app:s,saveSession:saves}};assert.equal(readCommittedPreparation().confirmed,true);
    s.expansion.body.hp--;assert.equal(readCommittedPreparation().confirmed,false,'unpublished/candidate body cannot pass');s.expansion=structuredClone(saves.currentRecord().expansion);
    assert.ok(saves.beginRun(42,true));s.state='run';const r=new CoastRaidRuntime(s,saves);r.hurt(10000);r.dispose();s.state='hideout';
    const death=saves.currentRecord(),plan=medicalPreparationPlan(death);assert.equal(death.expansion.body.hp,1);assert.equal(plan.cost,90);assert.equal(plan.next.kind,'use');assert.equal(plan.next.id,'medkit');
    assert.equal(assessPreparation(preparationFacts(read())).ready,false);
    const poor=structuredClone(death);poor.profile.cash=44;for(const source of ['bag','stash','safe'])poor.profile[source].items=[];
    const unaffordable=medicalPreparationPlan(poor);assert.equal(unaffordable.cost,250);assert.ok(unaffordable.cost>poor.profile.cash);
    assert.deepEqual(death,saves.currentRecord(),'quotes cannot change committed body, cash or inventory');
    const setBase=(hp,cash,bleeding)=>{const t=saves.prepareExpansionMutation(d=>{d.expansion.body.hp=hp;d.expansion.body.bleeding=bleeding;d.profile.cash=cash;for(const source of ['bag','stash','safe'])d.profile[source].items=[];});assert.ok(t);assert.equal(saves.commitExpansionMutation(t),'committed');return saves.currentRecord();};
    const bandages=setBase(40,150,false),copy=structuredClone(bandages),affordable=medicalPreparationPlan(bandages);
    assert.equal(affordable.cost,135);assert.equal(affordable.next.id,'bandage');assert.ok(affordable.cost<=bandages.profile.cash);assert.deepEqual(saves.currentRecord(),copy);
    const low=setBase(40,134,false),lowCopy=structuredClone(low);assert.equal(medicalPreparationPlan(low).cost,135);assert.ok(medicalPreparationPlan(low).cost>low.profile.cash);assert.deepEqual(saves.currentRecord(),lowCopy);
    const bleeding=setBase(100,44,true),bleedingCopy=structuredClone(bleeding);assert.equal(medicalPreparationPlan(bleeding).cost,90);assert.ok(medicalPreparationPlan(bleeding).cost>bleeding.profile.cash);assert.deepEqual(saves.currentRecord(),bleedingCopy);
    setBase(1,160,false);const reserve=saves.prepareExpansionMutation(d=>{assert.equal(addItem(d.profile.bag,'bandage',2),0);});assert.ok(reserve);assert.equal(saves.commitExpansionMutation(reserve),'committed');
    const reserveRecord=saves.currentRecord(),reserveCopy=structuredClone(reserveRecord);assert.equal(medicalPreparationPlan(reserveRecord).cost,160);assert.deepEqual(saves.currentRecord(),reserveCopy);
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
