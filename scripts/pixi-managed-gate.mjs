// Test-side Pixi 8.22.0 contract. Missing internals are unobserved, never zero.
// Self-contained functions can be passed directly to Playwright evaluate.
export function readManagedTables(renderer) {
  const required = ['graphics', 'graphicsContext', 'glBuffer', 'glTexture', 'glGeometry', 'tilingSprite'];
  const fail = message => { throw new Error('PIXI_MANAGED_CONTRACT: ' + message); };
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const plain = x => object(x) && [null, Object.prototype].includes(Object.getPrototypeOf(x));
  if (!object(renderer) || !object(renderer.gc)) fail('renderer.gc missing or changed');
  const gc = renderer.gc, list = gc._managedResourceHashes;
  if (!Array.isArray(list)) fail('_managedResourceHashes must be an array');
  if (!list.length) fail('_managedResourceHashes is empty');
  if (typeof gc._running !== 'boolean') fail('gc._running must be boolean');
  const rows = [], names = new Set(), tables = new Set();
  for (const [index, descriptor] of list.entries()) {
    if (!object(descriptor) || !object(descriptor.context) || typeof descriptor.hash !== 'string' || !descriptor.hash) fail('descriptor ' + index + ' shape changed');
    const {context, hash} = descriptor, name = context.name;
    if (typeof name !== 'string' || !name) fail('descriptor ' + index + ' name missing');
    if (names.has(name)) fail('duplicate table name ' + name);
    names.add(name);
    if (!Object.hasOwn(context, hash)) fail(name + '.' + hash + ' missing');
    const table = context[hash];
    if (!plain(table)) fail(name + '.' + hash + ' must be a plain record');
    if (tables.has(table)) fail('aliased table ' + name);
    tables.add(table);
    if (Reflect.ownKeys(table).some(key => typeof key !== 'string' || !/^\d+$/.test(key))) fail(name + ' keys changed');
    let live = 0, empty = 0;
    for (const [key, value] of Object.entries(table)) {
      if (value === null) empty++;
      else if (object(value)) live++;
      else fail(name + '[' + key + '] is neither resource object nor null');
    }
    rows.push({name, hash, live, empty, keys: live + empty});
  }
  for (const name of required) if (!names.has(name)) fail('required table ' + name + ' missing');
  return {schema:'pixi-8.22.0-managed-hashes', running:gc._running, required, tables:rows, live:rows.reduce((n,x)=>n+x.live,0), empty:rows.reduce((n,x)=>n+x.empty,0)};
}
export function readPixiEvents(renderer) {
  const fail = message => { throw new Error('PIXI_EVENT_CONTRACT: ' + message); };
  const e = renderer?.events;
  if (!e || !('domElement' in e) || !e.rootBoundary || !(e.rootBoundary.eventPool instanceof Map)) fail('event system/pool shape changed');
  const roots = {};
  for (const key of ['_rootPointerEvent','_rootWheelEvent','_rootContextMenuEvent']) {
    const ev = e[key]; if (!ev || typeof ev.composedPath !== 'function' || !ev.page || !ev.layer) fail(key + ' event shape changed');
    // Pixi assigns nativeEvent lazily in _bootstrapEvent/normalizeWheelEvent; an untouched root has no own field.
    roots[key] = ev.nativeEvent != null;
  }
  let pooled = 0, native = 0;
  for (const list of e.rootBoundary.eventPool.values()) {
    if (!Array.isArray(list)) fail('eventPool value must be array');
    for (const ev of list) { if (!ev || typeof ev.composedPath !== 'function' || !ev.page || !ev.layer) fail('pooled event shape changed'); pooled++; if (ev.nativeEvent != null) native++; }
  }
  return {attached:e.domElement != null,roots,pooled,native};
}
