// Auxiliary strong root-path inspection; excludes weak snapshot edges and omits string content.
import { readFile, writeFile } from 'node:fs/promises';

// Check only the flat-table columns used by this report; extra V8 metadata/columns stay unconstrained.
function validateSnapshot(s, file) {
  const fail = (path, expected) => { throw Error(`Invalid heap snapshot ${file}.${path}: expected ${expected}`); };
  const array = (value, path) => { if (!Array.isArray(value)) fail(path, 'an array'); return value; };
  const integer = (value, path) => { if (!Number.isSafeInteger(value) || value < 0) fail(path, 'a nonnegative safe integer'); };
  const fields = (value, path, required) => {
    array(value, path);
    for (const name of required) if (value.filter(x => x === name).length !== 1) fail(path, `one ${name} field`);
    return value;
  };
  const index = (value, table, path) => {
    integer(value, path);
    if (value >= table.length) fail(path, 'an in-range table index');
  };
  const typeTable = (value, path) => {
    array(value, path);
    if (value.some(x => typeof x !== 'string')) fail(path, 'string type names');
    return value;
  };
  const f = fields(s?.snapshot?.meta?.node_fields, 'snapshot.meta.node_fields', ['type', 'name', 'id', 'edge_count']);
  const ef = fields(s.snapshot.meta.edge_fields, 'snapshot.meta.edge_fields', ['type', 'name_or_index', 'to_node']);
  const n = f.length, en = ef.length;
  const T = f.indexOf('type'), N = f.indexOf('name'), ID = f.indexOf('id'), EC = f.indexOf('edge_count');
  const ET = ef.indexOf('type'), EN = ef.indexOf('name_or_index'), TO = ef.indexOf('to_node');
  const types = typeTable(s.snapshot.meta.node_types?.[T], 'snapshot.meta.node_types[type]');
  const ets = typeTable(s.snapshot.meta.edge_types?.[ET], 'snapshot.meta.edge_types[type]');
  const strings = array(s.strings, 'strings'), nodes = array(s.nodes, 'nodes'), edges = array(s.edges, 'edges');
  if (nodes.length % n) fail('nodes', `rows of ${n} fields`);
  let edgeCount = 0;
  for (let i = 0; i < nodes.length; i += n) {
    index(nodes[i + T], types, `nodes[${i}].type`);
    integer(nodes[i + ID], `nodes[${i}].id`);
    // String-node names are deliberately omitted and never dereferenced.
    if (!types[nodes[i + T]].includes('string')) {
      index(nodes[i + N], strings, `nodes[${i}].name`);
      if (typeof strings[nodes[i + N]] !== 'string') fail(`nodes[${i}].name`, 'a string-table entry');
    }
    integer(nodes[i + EC], `nodes[${i}].edge_count`);
    edgeCount += nodes[i + EC];
    integer(edgeCount, 'edge_count total');
  }
  if (edges.length % en || edges.length / en !== edgeCount) fail('edges', 'complete rows matching node edge_count total');
  for (let e = 0; e < edges.length; e += en) {
    index(edges[e + ET], ets, `edges[${e}].type`);
    if (ets[edges[e + ET]] === 'weak') continue;
    const to = edges[e + TO];
    integer(to, `edges[${e}].to_node`);
    if (to >= nodes.length || to % n) fail(`edges[${e}].to_node`, 'an aligned in-range node offset');
    const name = edges[e + EN];
    if (['element', 'hidden'].includes(ets[edges[e + ET]])) integer(name, `edges[${e}].name_or_index`);
    else {
      index(name, strings, `edges[${e}].name_or_index`);
      if (typeof strings[name] !== 'string') fail(`edges[${e}].name_or_index`, 'a string-table entry');
    }
  }
  return { n, en, T, N, ID, EC, ET, EN, TO, types, ets };
}

const [out, ...files] = process.argv.slice(2);
if (!out || !files.length) throw Error('output snapshot...');
const rows = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  let s;
  try { s = JSON.parse(text); }
  catch { throw Error(`Invalid heap snapshot ${file}.JSON: expected valid JSON`); }
  const { n, en, T, N, ID, EC, ET, EN, TO, types, ets } = validateSnapshot(s, file);
  const count = s.nodes.length / n, starts = new Uint32Array(count + 1);
  for (let i = 0, e = 0; i < count; i++) { starts[i] = e; e += s.nodes[i * n + EC] * en; }
  starts[count] = s.edges.length;
  const desc = i => ({ id: s.nodes[i * n + ID], type: types[s.nodes[i * n + T]],
    name: types[s.nodes[i * n + T]].includes('string') ? '(omitted)' : s.strings[s.nodes[i * n + N]].slice(0, 250) });
  const parent = new Int32Array(count).fill(-1), via = new Uint32Array(count), q = new Uint32Array(count);
  let tail = 1; parent[0] = 0;
  for (let h = 0; h < tail; h++) {
    const i = q[h];
    for (let e = starts[i]; e < starts[i + 1]; e += en) {
      if (ets[s.edges[e + ET]] === 'weak') continue;
      const to = s.edges[e + TO] / n;
      if (parent[to] < 0) { parent[to] = i; via[to] = e; q[tail++] = to; }
    }
  }
  const hud = [];
  for (let i = 0; i < count; i++) if (desc(i).type === 'native' && /cs-hud/.test(desc(i).name)) {
    const path = [];
    if (parent[i] >= 0) {
      for (let j = i, steps = 0; steps < 80; steps++) {
        const e = via[j], type = ets[s.edges[e + ET]], v = s.edges[e + EN];
        path.push({ ...desc(j), ...(j ? { via: type + ':' + (['element', 'hidden'].includes(type) ? v : s.strings[v]) } : {}) });
        if (!j) break;
        j = parent[j];
      }
      path.reverse();
    }
    hud.push({ node: desc(i), reachable: parent[i] >= 0, path });
  }
  rows.push({ file, hud });
}
// No report is created or overwritten until every input has passed validation and traversal.
await writeFile(out, JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify(rows));
