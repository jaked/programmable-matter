import deepEqual from 'deep-equal';

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
export type AbstractType = { kind: 'Abstract', label: string, params: Array<Type> };

export type FunctionType = {
  kind: 'Function',
  args: Array<Type>,
  ret: Type
};

// invariant: no duplicate fields
export type ObjectType = {
  kind: 'Object',
  fields: Array<{ field: string, type: Type }>
};

// invariant: no duplicate fields
export type ModuleType = {
  kind: 'Module',
  fields: Array<{ field: string, type: Type, atom: boolean }>
};

// invariant: no nested unions, > 1 element
export type UnionType = { kind: 'Union', types: Array<Type> };

// invariant: no nested intersections, > 1 element
export type IntersectionType = { kind: 'Intersection', types: Array<Type> };

// invariant: `value` is a valid (JS-level) element of base type
export type SingletonType = { kind: 'Singleton', base: Type, value: any };

// invariant: `type` is not a `Not`
export type NotType = { kind: 'Not', type: Type }

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
  AbstractType |
  ObjectType |
  ModuleType |
  FunctionType |
  UnionType |
  IntersectionType |
  SingletonType |
  NotType;

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

export function abstract(label: string, ...params: Array<Type>): AbstractType {
  return { kind: 'Abstract', label, params };
}

export function functionType(
  args: Array<Type>,
  ret: Type
): FunctionType {
  return { kind: 'Function', args, ret };
}
export { functionType as function };

export function object(obj: { [f: string]: Type }): ObjectType {
  const fields =
    Object.entries(obj).map(([ field, type]) => ({ field, type }));
  return { kind: 'Object', fields };
}

export function module(obj: { [f: string]: { type: Type, atom: boolean } }): ModuleType {
  const fields =
    Object.entries(obj).map(([ field, { type, atom }]) => ({ field, type, atom }));
  return { kind: 'Module', fields };
}

export function singleton(value: any): Type {
  const type = typeof value;
  switch (type) {
    case 'boolean': return { kind: 'Singleton', base: booleanType, value };
    case 'number': return { kind: 'Singleton', base: numberType, value };
    case 'string': return { kind: 'Singleton', base: stringType, value };
    case 'undefined': return undefinedType;
    case 'object':
      if (value === null) return nullType;
      else throw new Error('expected null object');
    default:
      // TODO(jaked) handle bigint, symbol, function ?
      throw new Error(`unexpected type ${type}`);
  }
}

export function not(type: Type): Type {
  if (type.kind === 'Not') return type.type;
  else return { kind: 'Not', type };
}

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

function collapseIntersectionSubtype(xs: Array<Type>): Array<Type> {
  let accum: Array<Type> = [];
  xs.forEach(x => {
    if (accum.some(y => isSubtype(y, x))) { /* skip it */ }
    else {
      accum = accum.filter(y => !isSubtype(x, y));
      accum.push(x);
    }
  });
  return accum;
}

function uninhabitedIntersection(x: Type, y: Type): boolean {
  if (x.kind === 'Not' && y.kind !== 'Not') return equiv(x.type, y);
  if (y.kind === 'Not' && x.kind !== 'Not') return equiv(y.type, x);

  if (x.kind !== y.kind) return true;
  if (x.kind === 'never') return true;
  if (x.kind === 'Singleton' && y.kind === 'Singleton' && x.value != y.value)
    return true;

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

export function optional(type: Type): Type {
  return union(type, undefinedType);
}

export function equiv(a: Type, b: Type): boolean {
  return isSubtype(a, b) && isSubtype(b, a);
}

export function isSubtype(a: Type, b: Type): boolean {
  if (deepEqual(a, b)) return true;
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
    return a.elems.length === b.elems.length &&
      a.elems.every((t, i) => isSubtype(t, b.elems[i]));
  else if (a.kind === 'Object' && b.kind === 'Object') {
    const fieldTypes = new Map(a.fields.map(({ field, type }) => [field, type]));
    return b.fields.every((ft) => {
      const a = fieldTypes.get(ft.field) || undefinedType;
      return isSubtype(a, ft.type);
    });
  }
  else if (a.kind === 'Function' && b.kind === 'Function') {
    return a.args.length === b.args.length &&
      a.args.every((a, i) => isSubtype(b.args[i], a)) &&
      isSubtype(a.ret, b.ret);
  }
  else if (a.kind !== 'Not' && b.kind === 'Not') {
    // TODO(jaked) incomplete
    return uninhabitedIntersection(a, b.type);
  }
  else return false;
}

export function undefinedOr(t: Type) {
  return union(undefinedType, t);
}

export const undefinedOrString = undefinedOr(stringType);
export const undefinedOrNumber = undefinedOr(numberType);

export const numberOrString = union(numberType, stringType);

export function enumerate(...values: any[]): Type {
  return union(
    ...values.map(v => {
      if (typeof v === 'object' && v !== null) {
        // TODO(jaked) could support compound values here
        throw new Error('expected null object')
      } else {
        return singleton(v);
      }
    })
  );
}

export const reactElementType = abstract('React.Element');
// TODO(jaked)
// fragments are also permitted here (see ReactNode in React typing)
// but we need recursive types to express it (ReactFragment = Array<ReactNode>)
// in the meantime we'll permit top-level fragments only
const reactNodeType_ =
  union(reactElementType, booleanType, numberType, stringType, nullType, undefinedType);
export const reactNodeType =
  union(reactNodeType_, array(reactNodeType_));
