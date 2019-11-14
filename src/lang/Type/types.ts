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
  fields: Array<{ field: string, type: Type }>
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
