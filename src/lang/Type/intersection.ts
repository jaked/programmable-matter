import { Type } from './types';
import { isSubtype, equiv } from './isSubtype';
import { unknown, never } from './constructors';
import { union } from './union';

function isNoisyIntersection(a: Type, b: Type) {
  // avoid e.g. `string & not('a')` which arise from narrowing
  return (b.kind === 'Not' && b.type.kind === 'Singleton' && b.type.base.kind === a.kind);
}

function collapseIntersectionSubtype(xs: Array<Type>): Array<Type> {
  let accum: Array<Type> = [];
  xs.forEach(x => {
    if (accum.some(y => isSubtype(y, x) || isNoisyIntersection(y, x))) { /* skip it */ }
    else {
      accum = accum.filter(y => !isSubtype(x, y) && !isNoisyIntersection(x, y));
      accum.push(x);
    }
  });
  return accum;
}

export function uninhabitedIntersection(x: Type, y: Type): boolean {
  if (x.kind === 'Not' && y.kind !== 'Not') return equiv(x.type, y);
  if (y.kind === 'Not' && x.kind !== 'Not') return equiv(y.type, x);

  if (x.kind === 'Singleton' && x.base.kind === y.kind) return false;
  if (y.kind === 'Singleton' && y.base.kind === x.kind) return false;
  if (x.kind === 'Singleton' && y.kind === 'Singleton')
    return x.value != y.value;

  if (x.kind !== y.kind) return true;
  if (x.kind === 'never') return true;

  if (x.kind === 'Object' && y.kind === 'Object') {
    return x.fields.some(xFieldType => {
      const yFieldType = y.fields.find(yFieldType => yFieldType.field === xFieldType.field);
      if (yFieldType) {
        return uninhabitedIntersection(xFieldType.type, yFieldType.type);
      } else {
        return false;
      }
    });
  }

  return false;
}

function flattenIntersection(types: Array<Type>): Array<Type> {
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
  types = flattenIntersection(types);
  if (types.some(t => t.kind === 'Union'))
    return distributeUnion(types);
  if (types.some(t => types.some(u => uninhabitedIntersection(t, u))))
    return never;
  types = collapseIntersectionSubtype(types);

  if (types.length === 0) return unknown;
  if (types.length === 1) return types[0];
  return { kind: 'Intersection', types }
}
