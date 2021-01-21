type DiffMap<K, V> = {
  added: Map<K, V>,
  changed: Map<K, [V, V]>,
  deleted: Set<K>
}

export function diffMap<K, V>(
  a: Map<K, V>,
  b: Map<K, V>
): DiffMap<K, V> {
  let added = new Map<K, V>();
  let changed = new Map<K, [V, V]>();
  let deleted = new Set<K>();

  b.forEach((v, k) => {
    if (!a.has(k))
      added.set(k, v);
    else {
      const oldV = a.get(k);
      if (oldV !== v)
        changed.set(k, [oldV as V, v]);
    }
  });

  a.forEach((v, k) => {
    if (!b.has(k))
      deleted.add(k);
  });

  return { added, changed, deleted }
}
