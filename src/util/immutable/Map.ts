import * as Immutable from 'immutable';

type DiffMap<K, V> = {
  added: Immutable.Map<K, V>,
  changed: Immutable.Map<K, [V, V]>,
  deleted: Immutable.Set<K>
}

export function diffMap<K, V>(
  a: Immutable.Map<K, V>,
  b: Immutable.Map<K, V>
): DiffMap<K, V> {
  // TODO(jaked) see https://github.com/immutable-js/immutable-js/pull/953
  let added = Immutable.Map<K, V>();
  let changed = Immutable.Map<K, [V, V]>();
  let deleted = Immutable.Set<K>();

  b.forEach((v, k) => {
    const oldV = a.get(k, undefined);
    if (!oldV)
      added = added.set(k, v);
    else if (!Immutable.is(v, oldV))
      changed = changed.set(k, [oldV, v])
  });

  a.forEach((v, k) => {
    if (!b.has(k))
      deleted = deleted.add(k);
  });

  return { added, changed, deleted }
}