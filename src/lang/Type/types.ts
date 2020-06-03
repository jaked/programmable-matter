import * as Immutable from 'immutable';
import { Tuple2 } from '../../util/Tuple';

export type NeverProps = { kind: 'never' };
export type NeverType = Immutable.RecordOf<NeverProps>;
export type UnknownProps = { kind: 'unknown' };
export type UnknownType = Immutable.RecordOf<UnknownProps>;
export type UndefinedProps = { kind: 'undefined' };
export type UndefinedType = Immutable.RecordOf<UndefinedProps>;
export type NullProps = { kind: 'null' };
export type NullType = Immutable.RecordOf<NullProps>;
export type BooleanProps = { kind: 'boolean' };
export type BooleanType = Immutable.RecordOf<BooleanProps>;
export type NumberProps = { kind: 'number' };
export type NumberType = Immutable.RecordOf<NumberProps>;
export type StringProps = { kind: 'string' };
export type StringType = Immutable.RecordOf<StringProps>;
export type TupleProps = { kind: 'Tuple', elems: Immutable.List<Type> };
export type TupleType = Immutable.RecordOf<TupleProps>;
export type ArrayProps = { kind: 'Array', elem: Type };
export type ArrayType = Immutable.RecordOf<ArrayProps>;
export type SetProps = { kind: 'Set', elem: Type };
export type SetType = Immutable.RecordOf<SetProps>;
export type MapProps = { kind: 'Map', key: Type, value: Type };
export type MapType = Immutable.RecordOf<MapProps>;
export type AbstractProps = { kind: 'Abstract', label: string, params: Immutable.List<Type> };
export type AbstractType = Immutable.RecordOf<AbstractProps>;

export type FunctionProps = {
  kind: 'Function',
  args: Immutable.List<Type>,
  ret: Type
};
export type FunctionType = Immutable.RecordOf<FunctionProps>;

// invariant: no duplicate fields
export type ObjectProps = {
  kind: 'Object',
  fields: Immutable.List<Tuple2<string, Type>>,
};
export type ObjectType = Immutable.RecordOf<ObjectProps> & {
  getFieldType(field: string): Type | undefined;
};

// invariant: no duplicate fields
export type ModuleProps = {
  kind: 'Module',
  fields: Immutable.List<Tuple2<string, Type >>,
};
export type ModuleType = Immutable.RecordOf<ModuleProps> & {
  getFieldType(field: string): Type | undefined;
};

// invariant: no nested unions, > 1 element
export type UnionProps = { kind: 'Union', types: Immutable.List<Type> };
export type UnionType = Immutable.RecordOf<UnionProps>;

// invariant: no nested intersections, > 1 element
export type IntersectionProps = { kind: 'Intersection', types: Immutable.List<Type> };
export type IntersectionType = Immutable.RecordOf<IntersectionProps>;

// invariant: `value` is a valid (JS-level) element of base type
export type SingletonProps = { kind: 'Singleton', base: Type, value: any };
export type SingletonType = Immutable.RecordOf<SingletonProps>;

// invariant: `type` is not a `Not`
export type NotProps = { kind: 'Not', type: Type }
export type NotType = Immutable.RecordOf<NotProps>;

export type ErrorProps = { kind: 'Error', err: Error }
export type ErrorType = Immutable.RecordOf<ErrorProps>;

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
