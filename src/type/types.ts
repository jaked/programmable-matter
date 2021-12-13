// TODO(jaked) move Interface to Type
import Interface from '../model/interface';

export type NeverType = { readonly kind: 'never' };
export type UnknownType = { readonly kind: 'unknown' };
export type UndefinedType = { readonly kind: 'undefined' };
export type NullType = { readonly kind: 'null' };
export type BooleanType = { readonly kind: 'boolean' };
export type NumberType = { readonly kind: 'number' };
export type StringType = { readonly kind: 'string' };
export type TupleType = { readonly kind: 'Tuple', readonly elems: Type[] };
export type ArrayType = { readonly kind: 'Array', readonly elem: Type };
export type SetType = { readonly kind: 'Set', readonly elem: Type };
export type MapType = { readonly kind: 'Map', readonly key: Type, readonly value: Type };
export type AbstractType = { readonly kind: 'Abstract', readonly label: string, readonly params: Type[] };
export type FunctionType = { readonly kind: 'Function', readonly args: Type[], readonly ret: Type };

// invariant: no duplicate fields
export type ObjectType = {
  readonly kind: 'Object',
  readonly fields: { readonly name: string, readonly type: Type }[],
};

// invariant: no duplicate fields
export type ModuleType = {
  readonly kind: 'Module',
  readonly fields: { readonly name: string, readonly intf: Interface }[],
};

// invariant: no nested unions, > 1 element
export type UnionType = { readonly kind: 'Union', readonly types: Type[] };

// invariant: no nested intersections, > 1 element
export type IntersectionType = { readonly kind: 'Intersection', readonly types: Type[] };

// invariant: `value` is a valid (JS-level) element of base type
export type SingletonType = { readonly kind: 'Singleton', readonly base: Type, readonly value: any };

// invariant: `type` is not a `Not`
export type NotType = { readonly kind: 'Not', readonly type: Type }

export type ErrorType = { readonly kind: 'Error', readonly err: Error }

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
  NotType |
  ErrorType;
