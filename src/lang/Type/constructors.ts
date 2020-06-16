import * as Immutable from 'immutable';
import { Tuple2 } from '../../util/Tuple';
import * as Types from './types';

const NeverType = Immutable.Record<Types.NeverProps>({ kind: 'never' });
export const never = NeverType();

const UnknownType = Immutable.Record<Types.UnknownProps>({ kind: 'unknown' });
export const unknown = UnknownType();

const UndefinedType = Immutable.Record<Types.UndefinedProps>({ kind: 'undefined' });
export const undefinedType = UndefinedType();
export const undefined = undefinedType;

const NullType = Immutable.Record<Types.NullProps>({ kind: 'null' });
export const nullType = NullType();

const BooleanType = Immutable.Record<Types.BooleanProps>({ kind: 'boolean' });
export const booleanType = BooleanType();
export const boolean = booleanType;

const NumberType = Immutable.Record<Types.NumberProps>({ kind: 'number' });
export const numberType = NumberType();
export const number = numberType;

const StringType = Immutable.Record<Types.StringProps>({ kind: 'string' });
export const stringType = StringType();
export const string = stringType;

const TupleType = Immutable.Record<Types.TupleProps>({
  kind: 'Tuple',
  elems: Immutable.List(),
});
export function tuple(...elems: Array<Types.Type>) {
  return TupleType({ elems: Immutable.List(elems) });
}

const ArrayType = Immutable.Record<Types.ArrayProps>({
  kind: 'Array',
  elem: never,
});
export function array(elem: Types.Type) {
  return ArrayType({ elem });
}

const SetType = Immutable.Record<Types.SetProps>({
  kind: 'Set',
  elem: never,
});
export function set(elem: Types.Type) {
  return SetType({ elem });
}

const MapType = Immutable.Record<Types.MapProps>({
  kind: 'Map',
  key: never,
  value: never,
});
export function map(key: Types.Type, value: Types.Type) {
  return MapType({ key, value });
}

const AbstractType = Immutable.Record<Types.AbstractProps>({
  kind: 'Abstract',
  label: '',
  params: Immutable.List(),
})
export function abstract(label: string, ...params: Array<Types.Type>) {
  return new AbstractType({ label, params: Immutable.List(params) });
}

const FunctionType = Immutable.Record<Types.FunctionProps>({
  kind: 'Function',
  args:  Immutable.List(),
  ret: never,
})
export function functionType(
  args: Array<Types.Type>,
  ret: Types.Type
) {
  return new FunctionType({ args: Immutable.List(args), ret });
}

class ObjectType extends Immutable.Record<Types.ObjectProps>({
  kind: 'Object',
  fields: Immutable.List(),
}) {
  getFieldType(field: string) {
    const ft = this.fields.find(ft => ft._1 === field);
    if (ft) return ft._2;
  }
}
export function object(
  fields:
    { [f: string]: Types.Type } |
    Array<Tuple2<string, Types.Type>> |
    Immutable.List<Tuple2<string, Types.Type>>
) {
  if (Immutable.List.isList(fields)) {
    return new ObjectType({ fields });
  } else if (Array.isArray(fields)) {
    return object(Immutable.List(fields));
  } else {
    return object(Object.entries(fields).map(([ field, type]) => Tuple2(field, type)));
  }
}

class ModuleType extends Immutable.Record<Types.ModuleProps>({
  kind: 'Module',
  fields: Immutable.List(),
}) {
  getFieldType(field: string) {
    const ft = this.fields.find(ft => ft._1 === field);
    if (ft) return ft._2;
  }
}
export function module(obj: { [f: string]: Types.Type }) {
  return new ModuleType({
    fields: Immutable.List(Object.entries(obj).map(([ field, type ]) => Tuple2(field, type)))
  });
}

const SingletonType = Immutable.Record<Types.SingletonProps>({
  kind: 'Singleton',
  base: never,
  value: undefined,
});
export function singleton(value: any) {
  const type = typeof value;
  switch (type) {
    case 'boolean': return SingletonType({ base: booleanType, value });
    case 'number': return SingletonType({ base: numberType, value });
    case 'string': return SingletonType({ base: stringType, value });
    case 'undefined': return undefinedType;
    case 'object':
      if (value === null) return nullType;
      else throw new Error('expected null object');
    default:
      // TODO(jaked) handle bigint, symbol, function ?
      throw new Error(`unexpected type ${type}`);
  }
}

const NotType = Immutable.Record<Types.NotProps>({
  kind: 'Not',
  type: never,
});
export function not(type: Types.Type) {
  if (type.kind === 'Not') return type.type;
  else return new NotType({ type });
}

const ErrorType = Immutable.Record<Types.ErrorProps>({
  kind: 'Error',
  err: new Error(),
});
export function error(err: Error) {
  return new ErrorType({ err });
}

const UnionType = Immutable.Record<Types.UnionProps>({
  kind: 'Union',
  types: Immutable.List(),
});
// assumes that `types` satisfy the union invariants
export function union(...types: Array<Types.Type>) {
  return UnionType({ types: Immutable.List(types) });
}

const IntersectionType = Immutable.Record<Types.IntersectionProps>({
  kind: 'Intersection',
  types: Immutable.List(),
});
// assumes that `types` satisfy the intersection invariants
export function intersection(...types: Array<Types.Type>) {
  return IntersectionType({ types: Immutable.List(types) });
}

export function enumerate(...values: any[]): Types.Type {
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
