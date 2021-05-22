import * as Types from './types';

export function toString(t: Types.Type): string {
  switch (t.kind) {
    case 'never': return 'never';
    case 'unknown': return 'unknown';
    case 'undefined': return 'undefined';
    case 'null': return 'null';
    case 'boolean': return 'boolean';
    case 'number': return 'number';
    case 'string': return 'string';
    case 'Tuple': return `[${t.elems.map(toString).join(', ')}]`;
    case 'Array': return `Array<${toString(t.elem)}>`;
    case 'Set': return `Set<${toString(t.elem)}>`;
    case 'Map': return `Map<${toString(t.key)}, ${toString(t.value)}>`;
    case 'Abstract':
      if (t.params.length === 0)
        return t.label;
      else
        return `${t.label}<${t.params.map(toString).join(', ')}>`;
    case 'Function':
      return `(${t.args.map(toString).join(', ')}) => ${toString(t.ret)}`;
    case 'Object': {
      const fields = t.fields.map(({ name, type }) => `${name}: ${toString(type)}`);
      return `{ ${fields.join(', ')} }`;
    }
    case 'Module': {
      const fields = t.fields.map(({ name, type }) => `${name}: ${toString(type)}`);
      return `{ ${fields.join(', ')} }`;
    }
    case 'Union':
      return t.types.map(toString).join(' | ');
    case 'Intersection':
      return t.types.map(toString).join(' & ');
    case 'Singleton':
      if (typeof t.value === 'string')
        return `'${t.value}'`;
      else
        return `${t.value}`;
    case 'Not': return `not(${toString(t.type)})`;
    case 'Error': return `error(${t.err.message})`;
    default:
      throw new Error(`unexpected type ${(t as Types.Type).kind}`);
  }
}
