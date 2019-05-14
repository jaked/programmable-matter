import * as Equals from '../util/equals';

export type NeverType = { kind: 'never' };
export type UnknownType = { kind: 'unknown' };
export type UndefinedType = { kind: 'undefined' };
export type NullType = { kind: 'null' };
export type BooleanType = { kind: 'boolean' };
export type NumberType = { kind: 'number' };
export type StringType = { kind: 'string' };
export type TupleType = { kind: 'Tuple', elems: Array<Type> };
export type ArrayType = { kind: 'Array', elem: Type };
export type SetType = { kind: 'Set', elem: Type };
export type MapType = { kind: 'Map', key: Type, value: Type };

// invariant: no duplicate fields
export type ObjectType = { kind: 'Object', fields: Array<{ field: string, type: Type }> };

// invariant: no nested unions, > 1 element
export type UnionType = { kind: 'Union', types: Array<Type> };

// invariant: no nested intersections, > 1 element
export type IntersectionType = { kind: 'Intersection', types: Array<Type> };

// invariant: `value` is a valid (JS-level) element of base type
export type SingletonType = { kind: 'Singleton', base: Type, value: any };

export type Type =
  NeverType |
  UnknownType |
  UndefinedType |
  NullType |
  BooleanType |
  NumberType |
  StringType |
  TupleType |
  ArrayType |
  SetType |
  MapType |
  ObjectType |
  UnionType |
  IntersectionType |
  SingletonType;

export const never: NeverType = { kind: 'never' };
export const unknown: UnknownType = { kind: 'unknown' };
export const undefinedType: UndefinedType = { kind: 'undefined' };
export { undefinedType as undefined };
export const nullType: NullType = { kind: 'null' };
export { nullType as null };
export const booleanType: BooleanType = { kind: 'boolean' };
export { booleanType as boolean };
export const numberType: NumberType = { kind: 'number' };
export { numberType as number };
export const stringType: StringType = { kind: 'string' };
export { stringType as string };

export function tuple(...elems: Array<Type>): TupleType {
  return { kind: 'Tuple', elems };
}

export function array(elem: Type): ArrayType {
  return { kind: 'Array', elem };
}

export function set(elem: Type): SetType {
  return { kind: 'Set', elem };
}

export function map(key: Type, value: Type): MapType {
  return { kind: 'Map', key, value };
}

export function object(obj: { [f: string]: Type }): ObjectType {
  const fields =
    Object.entries(obj).map(([ field, type]) => ({ field, type }));
  return { kind: 'Object', fields };
}

export function union(...types: Array<Type>): UnionType {
  // TODO(jaked) find a library for these
  function flatten(types: Array<Type>, accum: Array<Type> = []): Array<Type> {
    types.forEach(t => {
      if (t.kind === 'Union') return flatten(t.types, accum);
      else accum.push(t);
    });
    return accum;
  }

  function uniq<T>(xs: Array<T>): Array<T> {
    const accum: Array<T> = [];
    xs.forEach(x => {
      if (accum.every(y => !Equals.equals(x, y)))
        accum.push(x)
    });
    return accum;
  }

  return { kind: 'Union', types: uniq(flatten(types)) }
}

export function isSubtype(a: Type, b: Type): boolean {
  if (Equals.equals(a, b)) return true;
  else if (a.kind === 'never') return true;
  else if (b.kind === 'unknown') return true;
  else if (a.kind === 'Union') return a.types.every(t => isSubtype(t, b));
  else if (b.kind === 'Union') return b.types.some(t => isSubtype(a, t));
  else if (a.kind === 'Array' && b.kind === 'Array')
    return isSubtype(a.elem, b.elem);
  else if (a.kind === 'Set' && b.kind === 'Set')
    return isSubtype(a.elem, b.elem);
  else if (a.kind === 'Map' && b.kind === 'Map')
    return isSubtype(b.key, a.key) && isSubtype(a.value, b.value);
  else if (a.kind === 'Tuple' && b.kind === 'Tuple')
    return a.elems.length === b.elems.length &&
      a.elems.every((t, i) => isSubtype(t, b.elems[i]));
  else if (a.kind === 'Object' && b.kind === 'Object') {
    const fieldTypes = new Map(a.fields.map(({ field, type }) => [field, type]));
    return b.fields.every((ft) => {
      const a = fieldTypes.get(ft.field);
      if (a) return isSubtype(a, ft.type);
      else return false;
    });
  }
  else return false;
}
