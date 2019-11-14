import * as Types from './types';
import * as Union from './union';

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

export function tuple(...elems: Array<Types.Type>): Types.TupleType {
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

export function abstract(label: string, ...params: Array<Types.Type>): Types.AbstractType {
  return { kind: 'Abstract', label, params };
}

export function functionType(
  args: Array<Types.Type>,
  ret: Types.Type
): Types.FunctionType {
  return { kind: 'Function', args, ret };
}

export function object(obj: { [f: string]: Types.Type }): Types.ObjectType {
  const fields =
    Object.entries(obj).map(([ field, type]) => ({ field, type }));
  return { kind: 'Object', fields };
}

export function module(obj: { [f: string]: Types.Type }): Types.ModuleType {
  const fields =
    Object.entries(obj).map(([ field, type ]) => ({ field, type }));
  return { kind: 'Module', fields };
}

export function singleton(value: any): Types.Type {
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

export function not(type: Types.Type): Types.Type {
  if (type.kind === 'Not') return type.type;
  else return { kind: 'Not', type };
}

// assumes that `types` satisfy the union invariants
function union(...types: Array<Types.Type>): Types.UnionType {
  return { kind: 'Union', types };
}

// these need to be defined directly instead of via `Union.union`
// because they run at module loading time
export const undefinedOrString = union(undefinedType, stringType);
export const undefinedOrNumber = union(undefinedType, numberType);
export const numberOrString = union(numberType, stringType);

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

export const reactElementType = abstract('React.Element');
// TODO(jaked)
// fragments are also permitted here (see ReactNode in React typing)
// but we need recursive types to express it (ReactFragment = Array<ReactNode>)
// in the meantime we'll permit top-level fragments only
const reactNodeType_ =
  union(reactElementType, booleanType, numberType, stringType, nullType, undefinedType);
export const reactNodeType =
  union(reactNodeType_, array(reactNodeType_));
