import { Type } from './types';
import { isPrimitiveSubtype, equiv } from './isSubtype';
import * as Constructors from './constructors';
import { union } from './union';

function collapseRedundant(xs: Array<Type>): Array<Type> {
  let accum: Array<Type> = [];
  xs.forEach(x => {
    if (accum.some(y => isPrimitiveSubtype(y, x) || equiv(x, y))) { /* skip it */ }
    else {
      accum = accum.filter(y => !isPrimitiveSubtype(x, y));
      accum.push(x);
    }
  });
  return accum;
}

function isPrimitive(type: Type) {
  return type.kind === 'boolean' ||
    type.kind == 'number' ||
    type.kind === 'string';
}

// only for primitives / singletons
export function emptyIntersection(x: Type, y: Type): boolean {
  if (x.kind === 'never' || y.kind === 'never') return true;
  if (isPrimitive(x) && isPrimitive(y) && x.kind !== y.kind) return true;
  if (x.kind === 'Singleton' && y.kind === 'Singleton') return x.value != y.value;
  if (x.kind === 'Singleton' && x.base.kind !== y.kind) return true;
  if (y.kind === 'Singleton' && y.base.kind !== x.kind) return true;
  return false;
}

function flatten(types: Array<Type>): Array<Type> {
  const accum: Array<Type> = [];
  types.forEach(t => {
    if (t.kind === 'unknown') { /* skip it */ }
    else if (t.kind === 'Intersection') accum.push(...t.types) // t already flattened
    else accum.push(t);
  });
  return accum;
}

function distributeUnion(xs: Array<Type>): Type {
  function dist(prefix: Array<Type>, suffix: Array<Type>, accum: Array<Type>) {
    if (suffix.length === 0) {
      accum.push(intersection(...prefix));
    } else switch (suffix[0].kind) {
      case 'Union': {
        const suffix2 = suffix.slice(1);
        return suffix[0].types.forEach(y => dist([...prefix, y], suffix2, accum))
      }

      default:
        dist([...prefix, suffix[0]], suffix.slice(1), accum);
    }
  }

  const accum: Array<Type> = [];
  dist([], xs, accum);
  return union(...accum);
}

export function intersection(...types: Array<Type>): Type {
  types = flatten(types);
  if (types.some(t => t.kind === 'Union'))
    return distributeUnion(types);
  if (types.some(t => types.some(u => emptyIntersection(t, u))))
    return Constructors.never;
  types = collapseRedundant(types);

  if (types.length === 0) return Constructors.unknown;
  if (types.length === 1) return types[0];
  return Constructors.intersection(...types);
}
