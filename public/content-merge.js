// The common ancestor is the last snapshot of this browser, even if another
// device has since changed the central copy.
const missing = Symbol('missing');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const entries = value => object(value) ? Object.entries(value) : [];
const recordList = value => Array.isArray(value) &&
  value.every(row => object(row) && typeof row.id === 'string') &&
  new Set(value.map(row => row.id)).size === value.length;
const binary = value => ['__kimFloraBackupFile','__kimFloraBackupBytes','__kimFloraBackupImageData']
  .some(key => Object.hasOwn(value,key));
const same = (left, right) => {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => same(item, right[index]));
  }
  if (object(left) && object(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length &&
      keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
  }
  return false;
};

const archivedLists=new Set(['savedProjects','savedColorRecipes','savedRecipes','savedConcepts','productionLog',
  'kim-flora-lab-projects-v1','kim-flora-color-formulas-v1','kim_flora_composition_reports_v1']);
function merge(base, local, remote, conflict, migrating, field) {
  if (same(local, remote) || same(base, remote)) return local;
  if (same(base, local)) return remote;
  if (migrating && local === missing) return remote;
  if (migrating && remote === missing) return local;
  if(archivedLists.has(field)&&Array.isArray(local)&&Array.isArray(remote)&&
      (base===missing||Array.isArray(base))){
    const records=rows=>Object.fromEntries(rows.map(row=>[
      typeof row?.id==='string'?'id:'+row.id:'content:'+JSON.stringify(row),row
    ]));
    const ancestor=base===missing?missing:records(base);
    return Object.values(merge(ancestor,records(local),records(remote),conflict,migrating));
  }
  if (!migrating && recordList(base) && recordList(local) && recordList(remote)) {
    const byId = rows => Object.fromEntries(rows.map(row => [row.id,row]));
    return Object.values(merge(byId(base),byId(local),byId(remote),conflict,false));
  }
  if (object(local) && object(remote) && (object(base) || base === missing) &&
      !binary(local) && !binary(remote)) {
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    const result = [];
    for (const key of keys) {
      const get = row => Object.hasOwn(row, key) ? row[key] : missing;
      const value = merge(get(base), get(local), get(remote), conflict, migrating, key==='json'?field:key);
      if (value !== missing) result.push([key, value]);
    }
    return Object.fromEntries(result);
  }
  conflict();
  return remote;
}

function decodeLocal(snapshot) {
  return Object.fromEntries(entries(snapshot?.local).flatMap(([key, value]) => {
    if (value === null) return [];
    try { return [[key, {json: JSON.parse(value)}]]; }
    catch { return [[key, {raw: value}]]; }
  }));
}

export function mergeContent(base, local, remote) {
  if (!remote) return {snapshot:local, conflicted:false};
  if (!local) return {snapshot:remote, conflicted:false};
  let conflicted = false;
  const conflict = () => { conflicted = true; };
  const localValues = merge(decodeLocal(base), decodeLocal(local), decodeLocal(remote), conflict, !base);
  const stores = {};
  for (const [name, layout] of Object.entries(remote.stores)) {
    stores[name] = {};
    for (const store of Object.keys(layout)) {
      const records = source => Object.fromEntries((source?.stores[name][store] ?? [])
        .map(([key, row]) => [JSON.stringify(key), row]));
      const rows = merge(records(base), records(local), records(remote), conflict, !base);
      stores[name][store] = Object.entries(rows).map(([key, row]) => [JSON.parse(key), row]);
    }
  }
  const snapshot={version:2, stores,
    local:Object.fromEntries(Object.keys(remote.local).map(key => {
      const value = localValues[key];
      return [key, value ? value.raw ?? JSON.stringify(value.json) : null];
    }))};
  return {snapshot:same(snapshot, remote)?remote:same(snapshot, local)?local:snapshot, conflicted};
}

export function sameContent(left, right) {
  if (!same(left.local, right.local)) return false;
  return Object.entries(left.stores).every(([name, layout]) =>
    Object.entries(layout).every(([store, rows]) => {
      const byKey = records => Object.fromEntries(records.map(([key, row]) => [JSON.stringify(key), row]));
      return same(byKey(rows), byKey(right.stores[name][store]));
    }));
}
