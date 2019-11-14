import * as Types from './types';
import * as IsSubtype from './isSubtype';
import * as Constructors from './constructors';
import * as Union from './union';
import * as Intersection from './intersection';
import * as ToString from './toString';

module Type {
  // there is syntax to re-export a whole module
  // but it can't be used inside a module
  // see https://github.com/Microsoft/TypeScript/issues/12983

  export type NeverType = Types.NeverType;
  export type UnknownType = Types.UnknownType;
  export type UndefinedType = Types.UndefinedType;
  export type NullType = Types.NullType;
  export type BooleanType = Types.BooleanType;
  export type NumberType = Types.NumberType;
  export type StringType = Types.StringType;
  export type TupleType = Types.TupleType;
  export type ArrayType = Types.ArrayType;
  export type SetType = Types.SetType;
  export type MapType = Types.MapType;
  export type AbstractType = Types.AbstractType;
  export type FunctionType = Types.FunctionType;
  export type ObjectType = Types.ObjectType;
  export type ModuleType = Types.ModuleType;
  export type UnionType = Types.UnionType;
  export type IntersectionType = Types.IntersectionType;
  export type SingletonType = Types.SingletonType;
  export type NotType = Types.NotType;
  export type Type = Types.Type;

  export const never = Constructors.never;
  export const unknown = Constructors.unknown;
  export const undefined = Constructors.undefined;
  export const nullType = Constructors.nullType;
  export const boolean = Constructors.boolean;
  export const number = Constructors.number;
  export const string = Constructors.string;
  export const tuple = Constructors.tuple;
  export const array = Constructors.array;
  export const set = Constructors.set;
  export const map = Constructors.map;
  export const abstract = Constructors.abstract;
  export const functionType = Constructors.functionType;
  export const object = Constructors.object;
  export const module = Constructors.module;
  export const singleton = Constructors.singleton;
  export const union = Union.union;
  export const intersection = Intersection.intersection;
  export const not = Constructors.not;

  export const undefinedOr = Constructors.undefinedOr;
  export const undefinedOrString = Constructors.undefinedOrString;
  export const undefinedOrNumber = Constructors.undefinedOrNumber;
  export const numberOrString = Constructors.numberOrString;
  export const enumerate = Constructors.enumerate;

  export const reactElementType = Constructors.reactElementType;
  export const reactNodeType = Constructors.reactNodeType;

  export const isSubtype = IsSubtype.isSubtype;
  export const equiv = IsSubtype.equiv;

  export const toString = ToString.toString;
}

type Type = Type.Type;

export default Type;
