import { bug } from '../../util/bug';
import Type from '../Type';

export default function lensValue(value: any, setValue: (v: any) => void, type: Type) {
  // TODO(jaked) tighten this up, be careful about array / function cases

  const f = function(...v: any[]) {
    // TODO(jaked)
    // is there a better way to distinguish 0-arg and 1-arg invocation?
    // v might legitimately be undefined so checking for that won't work
    switch (v.length) {
      case 0: return value;
      case 1: return setValue(v[0]);
      default: bug(`expected 0- or 1-arg invocation`);
    }
  }

  switch (type.kind) {
    case 'Object':
      // we can't just assign the fields of `value` to `f`
      // because `name` is a read-only property on Function
      return new Proxy(f, { get: (target, key, receiver) => {
        if (typeof key !== 'string') return undefined;
        if (key === 'valueOf' || key === 'equals') return undefined;
        const setFieldValue = (v) => setValue({ ...value, [key]: v });
        const fieldType = type.getFieldType(key) || bug(`expected field type for ${key}`);
        return lensValue(value[key], setFieldValue, fieldType);
      }});

    case 'Map':
      // TODO(jaked) proxy map operations
      break;

    case 'Union':
      // TODO(jaked) handle union of object
      break;

    case 'boolean':
    case 'number':
    case 'string':
    case 'null':
    case 'undefined':
    case 'Singleton':
      break;

    default:
      bug(`unimplemented lensValue(${type.kind})`);
  }

  return f;
}
