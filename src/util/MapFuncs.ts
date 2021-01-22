// TODO(jaked) this stuff must exist somewhere already

export function every<K, V>(
  map: Map<K, V>,
  p: (v: V, k: K) => boolean
): boolean {
  for (const [k, v] of map)
    if (!p(v, k)) return false;
  return true;
}

export function map<K, V, U>(
  vmap: Map<K, V>,
  f: (v: V) => U
): Map<K, U> {
  const umap = new Map<K, U>();
  vmap.forEach((v, k) => {
    umap.set(k, f(v));
  });
  return umap;
}

export function filter<K, V>(
  map: Map<K, V>,
  p: (v: V, k: K) => boolean
): Map<K, V> {
  const fmap = new Map<K, V>();
  map.forEach((v, k) => {
    if (p(v, k))
      fmap.set(k, v);
  });
  return fmap;
}
