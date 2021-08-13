import { bug } from '../util/bug';
import { Type } from './types';
import { undefined } from './constructors';
import expand from './expand';

export function isSubtype(at: Type, bt: Type): boolean {
  const a = expand(at);
  const b = expand(bt);
  if (a === b) return true;
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
  else if (a.kind === 'Error' && b.kind === 'undefined')
    return true;
  else if (a.kind === 'Array' && b.kind === 'Array')
    return isSubtype(a.elem, b.elem);
  else if (a.kind === 'Set' && b.kind === 'Set')
    return isSubtype(a.elem, b.elem);
  else if (a.kind === 'Map' && b.kind === 'Map')
    return isSubtype(b.key, a.key) && isSubtype(a.value, b.value);
  else if (a.kind === 'Tuple' && b.kind === 'Tuple')
    return a.elems.length === b.elems.length &&
      a.elems.every((t, i) => isSubtype(t, b.elems[i] ?? bug()));
  else if (a.kind === 'Object' && b.kind === 'Object') {
    const fieldTypes = new Map(a.fields.map(({ name, type }) => [name, type]));
    return b.fields.every(({ name, type }) => {
      const a = fieldTypes.get(name) || undefined;
      return isSubtype(a, type);
    });
  }
  else if (a.kind === 'Function' && b.kind === 'Function') {
    return a.args.length <= b.args.length &&
      a.args.every((a, i) => isSubtype(b.args[i] ?? bug(), a)) &&
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
