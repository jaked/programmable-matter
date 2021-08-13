import * as Types from './types';
import { Interface } from '../model';

export const never: Types.NeverType = { kind: 'never' };

export const unknown: Types.UnknownType = { kind: 'unknown' };

export const undefinedType: Types.UndefinedType = { kind: 'undefined' };
export const undefined = undefinedType;

export const nullType: Types.NullType = { kind: 'null' };

export const booleanType: Types.BooleanType = { kind: 'boolean' };
export const boolean = booleanType;

export const numberType: Types.NumberType = { kind: 'number' };
export const number = numberType;

export const stringType: Types.StringType = { kind: 'string' };
export const string = stringType;

export function tuple(...elems: Types.Type[]): Types.TupleType {
  return { kind: 'Tuple', elems };
}

export function array(elem: Types.Type): Types.ArrayType {
  return { kind: 'Array', elem };
}

export function set(elem: Types.Type): Types.SetType {
  return { kind: 'Set', elem };
}

export function map(key: Types.Type, value: Types.Type): Types.MapType {
  return { kind: 'Map', key, value };
}

export function abstract(label: string, ...params: Types.Type[]): Types.AbstractType {
  return { kind: 'Abstract', label, params };
}

export function functionType(args: Types.Type[], ret: Types.Type): Types.FunctionType {
  return { kind: 'Function', args, ret };
}

export function object(
  fields:
    { [f: string]: Types.Type } |
    { name: string, type: Types.Type }[]
): Types.ObjectType {
  if (Array.isArray(fields)) {
    return { kind: 'Object', fields };
  } else {
    return object(Object.entries(fields).map(([ name, type]) => ({ name, type })));
  }
}

export function module(fields:
    { [f: string]: Interface } |
    { name: string, intf: Interface }[]
): Types.ModuleType {
  if (Array.isArray(fields)) {
    return { kind: 'Module', fields };
  } else {
    return module(Object.entries(fields).map(([ name, intf ]) => ({ name, intf })));
  }
}

export function singleton(value: any): Types.Type {
  const type = typeof value;
  switch (type) {
    case 'boolean': return { kind: 'Singleton', base: booleanType, value };
    case 'number': return { kind: 'Singleton', base: numberType, value };
    case 'string': return { kind: 'Singleton', base: stringType, value };
    // TODO(jaked) not sure we need these cases
    case 'undefined': return undefinedType;
    case 'object':
      if (value === null) return nullType;
      else throw new Error('expected null object');
    default:
      // TODO(jaked) handle bigint, symbol, function ?
      throw new Error(`unexpected type ${type}`);
  }
}

export function not(type: Types.Type): Types.Type {
  if (type.kind === 'Not') return type.type;
  else return { kind: 'Not', type };
}

export function error(err: Error): Types.ErrorType {
  return { kind: 'Error', err };
}

// assumes that `types` satisfy the union invariants
export function union(...types: Types.Type[]): Types.UnionType {
  return { kind: 'Union', types };
}

// assumes that `types` satisfy the intersection invariants
export function intersection(...types: Types.Type[]): Types.IntersectionType {
  return { kind: 'Intersection', types };
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
