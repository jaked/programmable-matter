import * as Immutable from 'immutable';
import { bug } from '../../util/bug';
import { Type } from './types';
import { undefined } from './constructors';

export function isSubtype(a: Type, b: Type): boolean {
  if (Immutable.is(a, b)) return true;
  else if (a.kind === 'never') return true;
  else if (b.kind === 'unknown') return true;
  else if (a.kind === 'Union') return a.types.every(t => isSubtype(t, b));
  else if (b.kind === 'Union') return b.types.some(t => isSubtype(a, t));
  else if (a.kind === 'Intersection') return a.types.some(t => isSubtype(t, b));
  else if (b.kind === 'Intersection') return b.types.every(t => isSubtype(a, t));
  else if (a.kind === 'Singleton' && b.kind === 'Singleton')
    return isSubtype(a.base, b.base) && a.value === b.value;
  else if (a.kind === 'Singleton')
    return isSubtype(a.base, b);
  else if (a.kind === 'Array' && b.kind === 'Array')
    return isSubtype(a.elem, b.elem);
  else if (a.kind === 'Set' && b.kind === 'Set')
    return isSubtype(a.elem, b.elem);
  else if (a.kind === 'Map' && b.kind === 'Map')
    return isSubtype(b.key, a.key) && isSubtype(a.value, b.value);
  else if (a.kind === 'Tuple' && b.kind === 'Tuple')
    return a.elems.size === b.elems.size &&
      a.elems.every((t, i) => isSubtype(t, b.elems.get(i) ?? bug()));
  else if (a.kind === 'Object' && b.kind === 'Object') {
    const fieldTypes = new Map(a.fields.map(({ _1, _2 }) => [_1, _2]));
    return b.fields.every((ft) => {
      const a = fieldTypes.get(ft._1) || undefined;
      return isSubtype(a, ft._2);
    });
  }
  else if (a.kind === 'Function' && b.kind === 'Function') {
    return a.args.size === b.args.size &&
      a.args.every((a, i) => isSubtype(b.args.get(i) ?? bug(), a)) &&
      isSubtype(a.ret, b.ret);
  }
  else return false;
}

export function equiv(a: Type, b: Type): boolean {
  return isSubtype(a, b) && isSubtype(b, a);
}

function isPrimitive(type: Type) {
  return type.kind === 'boolean' ||
    type.kind == 'number' ||
    type.kind === 'string';
}

export function isPrimitiveSubtype(a: Type, b: Type): boolean {
  if (isPrimitive(a) && isPrimitive(b) && a.kind === b.kind) return true;
  if (a.kind === 'never') return true;
  if (b.kind === 'unknown') return true;
  if (a.kind === 'Singleton' && b.kind === 'Singleton' && a.value === b.value) return true;
  if (a.kind === 'Singleton' && a.base.kind === b.kind) return true;
  else return false;
}
