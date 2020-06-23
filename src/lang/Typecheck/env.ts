import * as Immutable from 'immutable';
import Type from '../Type';
import { parseType } from '../Parse';

export type Env = Immutable.Map<string, Type>;

export function env(bindings?: { [s: string]: string | Type }): Env {
  if (bindings)
    return Immutable.Map(bindings).map(type => {
      if (typeof type === 'string') return parseType(type);
      else return type;
    });
  else
    return Immutable.Map();
}
