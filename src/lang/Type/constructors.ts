import * as Immutable from 'immutable';
import Record from '../../util/Record';
import * as Types from './types';
import * as Union from './union';

class NeverType extends Record<NeverType> implements Types.NeverType {
  kind: 'never' = 'never';
}
export const never: Types.NeverType = new NeverType();

class UnknownType extends Record<UnknownType> implements Types.UnknownType {
  kind: 'unknown' = 'unknown';
}
export const unknown: Types.UnknownType = new UnknownType();

class UndefinedType extends Record<UndefinedType> implements Types.UndefinedType {
  kind: 'undefined' = 'undefined';
}
export const undefinedType: Types.UndefinedType = new UndefinedType();
export const undefined = undefinedType;

class NullType extends Record<NullType> implements Types.NullType {
  kind: 'null' = 'null';
}
export const nullType: Types.NullType = new NullType();

class BooleanType extends Record<BooleanType> implements Types.BooleanType {
  kind: 'boolean' = 'boolean';
}
export const booleanType: Types.BooleanType = new BooleanType();
export const boolean = booleanType;

class NumberType extends Record<NumberType> implements Types.NumberType {
  kind: 'number' = 'number';
}
export const numberType: Types.NumberType = new NumberType();
export const number = numberType;

class StringType extends Record<StringType> implements Types.StringType {
  kind: 'string' = 'string';
}
export const stringType: Types.StringType = new StringType();
export const string = stringType;

class TupleType extends Record<TupleType> implements Types.TupleType {
  kind: 'Tuple' = 'Tuple';
  elems: Immutable.List<Types.Type> = Immutable.List();
}
export function tuple(...elems: Array<Types.Type>): Types.TupleType {
  return new TupleType({ elems: Immutable.List(elems) });
}

class ArrayType extends Record<ArrayType> implements Types.ArrayType {
  kind: 'Array' = 'Array';
  elem: Types.Type = never;
}
export function array(elem: Types.Type): Types.ArrayType {
  return new ArrayType({ elem });
}

class SetType extends Record<SetType> implements Types.SetType {
  kind: 'Set' = 'Set';
  elem: Types.Type = never;
}
export function set(elem: Types.Type): Types.SetType {
  return new SetType({ elem });
}

class MapType extends Record<MapType> implements Types.MapType {
  kind: 'Map' = 'Map';
  key: Types.Type = never;
  value: Types.Type = never;
}
export function map(key: Types.Type, value: Types.Type): Types.MapType {
  return new MapType({ key, value });
}

class AbstractType extends Record<AbstractType> implements Types.AbstractType {
  kind: 'Abstract' = 'Abstract';
  label: string = '';
  params: Immutable.List<Types.Type> = Immutable.List();
}
export function abstract(label: string, ...params: Array<Types.Type>): Types.AbstractType {
  return new AbstractType({ label, params: Immutable.List(params) });
}

class FunctionType extends Record<FunctionType> implements Types.FunctionType {
  kind: 'Function' = 'Function';
  args: Immutable.List<Types.Type> = Immutable.List();
  ret: Types.Type = never;
}
export function functionType(
  args: Array<Types.Type>,
  ret: Types.Type
): Types.FunctionType {
  return new FunctionType({ args: Immutable.List(args), ret });
}

class ObjectType extends Record<ObjectType> implements Types.ObjectType {
  kind: 'Object' = 'Object';
  fields: Immutable.List<{ field: string, type: Types.Type }> = Immutable.List();

  get(field: string) {
    const ft = this.fields.find(ft => ft.field === field);
    if (ft) return ft.type;
  }
}
export function object(
  fields:
    { [f: string]: Types.Type } |
    Array<{ field: string, type: Types.Type }> |
    Immutable.List<{ field: string, type: Types.Type }>
): Types.ObjectType {
  if (Immutable.List.isList(fields)) {
    return new ObjectType({ fields });
  } else if (Array.isArray(fields)) {
    return object(Immutable.List(fields));
  } else {
    return object(Object.entries(fields).map(([ field, type]) => ({ field, type })));
  }
}

class ModuleType extends Record<ModuleType> implements Types.ModuleType {
  kind: 'Module' = 'Module';
  fields: Immutable.List<{ field: string, type: Types.Type }> = Immutable.List();

  get(field: string) {
    const ft = this.fields.find(ft => ft.field === field);
    if (ft) return ft.type;
  }
}
export function module(obj: { [f: string]: Types.Type }): Types.ModuleType {
  return new ModuleType({
    fields: Immutable.List(Object.entries(obj).map(([ field, type ]) => ({ field, type })))
  });
}

class SingletonType extends Record<SingletonType> implements Types.SingletonType {
  kind: 'Singleton' = 'Singleton';
  base: Types.Type = never;
  value: any = undefined;
}
export function singleton(value: any): Types.Type {
  const type = typeof value;
  switch (type) {
    case 'boolean': return new SingletonType({ base: booleanType, value });
    case 'number': return new SingletonType({ base: numberType, value });
    case 'string': return new SingletonType({ base: stringType, value });
    case 'undefined': return undefinedType;
    case 'object':
      if (value === null) return nullType;
      else throw new Error('expected null object');
    default:
      // TODO(jaked) handle bigint, symbol, function ?
      throw new Error(`unexpected type ${type}`);
  }
}

class NotType extends Record<NotType> implements Types.NotType {
  kind: 'Not' = 'Not';
  type: Types.Type = never;
}
export function not(type: Types.Type): Types.Type {
  if (type.kind === 'Not') return type.type;
  else return new NotType({ type });
}

class UnionType extends Record<UnionType> implements Types.UnionType {
  kind: 'Union' = 'Union';
  types: Immutable.List<Types.Type> = Immutable.List();
}
// assumes that `types` satisfy the union invariants
export function union(...types: Array<Types.Type>): Types.UnionType {
  return new UnionType({ types: Immutable.List(types) });
}

class IntersectionType extends Record<IntersectionType> implements Types.IntersectionType {
  kind: 'Intersection' = 'Intersection';
  types: Immutable.List<Types.Type> = Immutable.List();
}
// assumes that `types` satisfy the intersection invariants
export function intersection(...types: Array<Types.Type>): Types.IntersectionType {
  return new IntersectionType({ types: Immutable.List(types) });
}

export function undefinedOr(t: Types.Type): Types.Type {
  return Union.union(undefinedType, t);
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
