import * as Immutable from 'immutable';
import { Interface } from '../../model';
import Type from '../Type';
import { parseType } from '../Parse';

export type Env = Immutable.Map<string, Interface>;

export function env(bindings?: { [s: string]: string | Type }): Env {
  if (bindings)
    return Immutable.Map(bindings).map(type => {
      if (typeof type === 'string')
        type = parseType(type);
      return { type };
    });
  else
    return Immutable.Map();
}
