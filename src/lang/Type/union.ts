import deepEqual from 'deep-equal';
import { Type } from './types';
import { never} from './constructors';
import { equiv } from './isSubtype';
import { uninhabitedIntersection } from './intersection';

function isPrimitiveSubtype(a: Type, b: Type): boolean {
  if (deepEqual(a, b)) return true; // TODO(jaked) exclude non-primitive types
  else if (a.kind === 'never') return true;
  else if (b.kind === 'unknown') return true;
  else if (a.kind === 'Union') return a.types.every(t => isPrimitiveSubtype(t, b));
  else if (b.kind === 'Union') return b.types.some(t => isPrimitiveSubtype(a, t));
  else if (a.kind === 'Intersection') return a.types.some(t => isPrimitiveSubtype(t, b));
  else if (b.kind === 'Intersection') return b.types.every(t => isPrimitiveSubtype(a, t));
  else if (a.kind === 'Singleton' && b.kind === 'Singleton')
    return isPrimitiveSubtype(a.base, b.base) && a.value === b.value;
  else if (a.kind === 'Singleton')
    return isPrimitiveSubtype(a.base, b);
  else if (a.kind !== 'Not' && b.kind === 'Not') {
    // TODO(jaked) exclude non-primitive types
    return uninhabitedIntersection(a, b.type);
  }
  else return false;
}

function collapseUnionSubtype(xs: Array<Type>): Array<Type> {
  let accum: Array<Type> = [];
  xs.forEach(x => {
    if (accum.some(y => isPrimitiveSubtype(x, y))) { /* skip it */ }
    else {
      accum = accum.filter(y => !isPrimitiveSubtype(y, x));
      accum.push(x);
    }
  });
  return accum;
}

function collapseEquiv(xs: Array<Type>): Array<Type> {
  const accum: Array<Type> = [];
  xs.forEach(x => {
    if (accum.some(y => equiv(x, y))) { /* skip it */ }
    else accum.push(x)
  });
  return accum;
}

function flattenUnion(types: Array<Type>): Array<Type> {
  const accum: Array<Type> = [];
  types.forEach(t => {
    if (t.kind === 'never') { /* skip it */ }
    else if (t.kind === 'Union') accum.push(...t.types); // t already flattened
    else accum.push(t);
  });
  return accum;
}

export function union(...types: Array<Type>): Type {
  types = flattenUnion(types);
  types = collapseEquiv(types);
  types = collapseUnionSubtype(types);

  if (types.length === 0) return never;
  if (types.length === 1) return types[0];
  return { kind: 'Union', types }
}
