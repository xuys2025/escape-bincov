// Shape checks for the fields the two review tools actually consume. No resource thresholds or status decisions.
const requireField = (ok, path, expected) => { if (!ok) throw Error(`Invalid resource report ${path}: expected ${expected}`); };
const record = (value, path) => { requireField(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'an object'); return value; };
const array = (value, path) => { requireField(Array.isArray(value), path, 'an array'); return value; };
const count = (value, path) => requireField(Number.isSafeInteger(value) && value >= 0, path, 'a nonnegative safe integer');
const identity = (value, path) => requireField(Number.isSafeInteger(value) && value > 0, path, 'a positive safe integer identity');
const boolean = (value, path) => requireField(typeof value === 'boolean', path, 'a boolean');
function keys(rows, path) {
  const seen = new Set();
  for (const [index, row] of array(rows, path).entries()) {
    record(row, `${path}[${index}]`);
    requireField(typeof row.key === 'string' && !seen.has(row.key), `${path}[${index}].key`, 'a unique string key');
    seen.add(row.key);
  }
  return rows;
}
function textures(sample, path) {
  record(sample, path); record(sample.objects, `${path}.objects`);
  keys(sample.objects.textures, `${path}.objects.textures`);
}
function managedRows(sample, path, selectedTable) {
  const rows = array(sample.objects.rows, path), seen = new Set(), selected = [];
  for (const [index, row] of rows.entries()) {
    const p = `${path}[${index}]`; record(row, p);
    // table selects the population being audited; an absent table must not silently disappear in filter().
    requireField(typeof row.table === 'string' && row.table.length > 0, `${p}.table`, 'a nonempty table name');
    if (selectedTable && row.table !== selectedTable) continue;
    selected.push(row);
    requireField(typeof row.key === 'string', `${p}.key`, 'a string key');
    const key = JSON.stringify([row.table, row.key]);
    requireField(!seen.has(key), `${p}.key`, 'a unique key within its table'); seen.add(key);
    boolean(row.live, `${p}.live`);
  }
  return selected;
}
function roundRows(report, path, complete) {
  const rows = array(report.rows, `${path}.rows`);
  requireField(complete ? rows.length === 60 : rows.length > 0, `${path}.rows`, complete ? 'exactly 60 rounds' : 'at least one round');
  for (const [index, row] of rows.entries()) {
    record(row, `${path}.rows[${index}]`);
    requireField(row.label === `round-${index + 1}`, `${path}.rows[${index}].label`, `round-${index + 1} (ordered, without missing or duplicate rounds)`);
  }
  return rows;
}
function counts(sample, path) {
  const c = record(sample.counts, `${path}.counts`);
  // CDP JSHeapUsedSize is a byte count: require exact Number representation, not a project memory budget.
  count(c.heap, `${path}.counts.heap`);
  for (const key of ['scene', 'wallFrameGroups', 'wallFrames', 'gpuTextures']) count(c[key], `${path}.counts.${key}`);
  record(c.tables, `${path}.counts.tables`);
  const tables = array(c.tables.tables, `${path}.counts.tables.tables`), names = new Set();
  for (const [index, table] of tables.entries()) {
    const p = `${path}.counts.tables.tables[${index}]`; record(table, p);
    requireField(typeof table.name === 'string' && !names.has(table.name), `${p}.name`, 'a unique table name'); names.add(table.name);
    count(table.live, `${p}.live`); count(table.empty, `${p}.empty`);
  }
  return names;
}
function release(value, path) {
  record(value, path); boolean(value.hostAlive, `${path}.hostAlive`); boolean(value.sceneAlive, `${path}.sceneAlive`);
  count(value.tracked, `${path}.tracked`); count(value.collected, `${path}.collected`);
  requireField(value.collected <= value.tracked, `${path}.collected`, 'no more collected objects than tracked objects');
}
function quad(rows, key, path) {
  const found = array(rows, path).filter(row => row?.key === key);
  requireField(found.length === 1, `${path}[key=${key}]`, 'exactly one identity record'); identity(found[0].id, `${path}[key=${key}].id`);
}

export function validateResourceSummaryReport(report, mode) {
  const path = mode; record(report, path);
  requireField(report.mode === mode, `${path}.mode`, mode);
  requireField(!report.fatal, `${path}.fatal`, 'a report without a fatal error');
  const rows = roundRows(report, path, true);
  textures(report.baseline, `${path}.baseline`); identity(report.baseline.objects.rendererId, `${path}.baseline.objects.rendererId`);
  const names = counts(report.baseline, `${path}.baseline`);
  for (const [index, row] of rows.entries()) {
    const p = `${path}.rows[${index}]`; textures(row, p); identity(row.objects.rendererId, `${p}.objects.rendererId`);
    const current = counts(row, p);
    for (const name of names) requireField(current.has(name), `${p}.counts.tables.tables`, `baseline table ${name}`);
    managedRows(row, `${p}.objects.rows`);
    if (mode !== 'context') release(row.release, `${p}.release`);
    if (mode === 'shared') { quad(row.objects.geometries, '0', `${p}.objects.geometries`); for (const key of ['0', '1', '2']) quad(row.objects.buffers, key, `${p}.objects.buffers`); }
    if (row.action?.freed) {
      record(row.action.freed, `${p}.action.freed`);
      // These observations are copied unchanged, not interpreted as a release verdict or validated recursively.
      requireField(Object.hasOwn(row.action.freed, 'scene'), `${p}.action.freed.scene`, 'a recorded scene observation (null is allowed)');
      requireField(Object.hasOwn(row.action, 'parked'), `${p}.action.parked`, 'a recorded parked observation');
      for (const key of ['frames', 'sources']) for (const [i, value] of array(row.action.freed[key], `${p}.action.freed.${key}`).entries()) boolean(value, `${p}.action.freed.${key}[${i}]`);
    }
  }
  for (const key of ['errors', 'frameAudit', 'external', 'strictFailures', 'ownershipFailures']) array(report[key], `${path}.${key}`);
  return report;
}

export function validateResourceIdentityProbe(probe) {
  record(probe, 'identity-probe');
  for (const key of ['initial', 'firstReturn']) textures(probe[key], `identity-probe.${key}`);
  return probe;
}

export function validateResourceSlotReport(report) {
  record(report, 'context'); requireField(report.mode === 'context', 'context.mode', 'context');
  const rows = roundRows(report, 'context', false);
  for (const [index, sample] of [report.baseline, ...rows].entries()) {
    const path = index === 0 ? 'context.baseline' : `context.rows[${index - 1}]`; record(sample, path); record(sample.objects, `${path}.objects`);
    const slots = managedRows(sample, `${path}.objects.rows`, 'glTexture');
    for (const [i, slot] of slots.entries()) {
      boolean(slot.live, `${path}.objects.rows.glTexture[${i}].live`);
      // inventory() deliberately omits identity metadata on null placeholders; it is read only for live slots.
      if (slot.live) {
        const p = `${path}.objects.rows.glTexture[${i}]`;
        requireField(slot.textureKey === null || typeof slot.textureKey === 'string', `${p}.textureKey`, 'a scene texture key or null');
        requireField(typeof slot.type === 'string', `${p}.type`, 'a constructor name');
        requireField(slot.label === null || typeof slot.label === 'string', `${p}.label`, 'a resource label or null');
      }
    }
  }
  return report;
}
