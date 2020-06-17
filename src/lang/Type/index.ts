import * as Types from './types';
import * as IsSubtype from './isSubtype';
import * as Constructors from './constructors';
import * as Union from './union';
import * as Intersection from './intersection';
import * as ToString from './toString';
import * as Predef from './predef';
import OfTSType from './ofTSType';
import Expand from './expand';

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
  export type ErrorType = Types.ErrorType;
  export type Type = Types.Type;

  export const isSubtype = IsSubtype.isSubtype;
  export const isPrimitiveSubtype = IsSubtype.isPrimitiveSubtype;
  export const equiv = IsSubtype.equiv;
  export const expand = Expand;

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
  export const error = Constructors.error;

  export function undefinedOr(t: Types.Type): Types.Type {
    return Union.union(undefined, t);
  }

  export const enumerate = Constructors.enumerate;

  export const undefinedOrBoolean = Predef.undefinedOrBoolean;
  export const undefinedOrString = Predef.undefinedOrString;
  export const undefinedOrNumber = Predef.undefinedOrNumber;
  export const numberOrString = Predef.numberOrString;

  export const truthy = Predef.truthy;
  export const notTruthy = Predef.notTruthy;
  export const falsy = Predef.falsy;
  export const notFalsy = Predef.notFalsy;

  export const toString = ToString.toString;
  export const ofTSType = OfTSType;

  // TODO(jaked) move somewhere else
  export const reactElementType = Predef.reactElementType;
  export const reactNodeType = Predef.reactNodeType;
  export const metaType = Predef.metaType;
  export const layoutFunctionType = Predef.layoutFunctionType;
}

type Type = Type.Type;

export default Type;
