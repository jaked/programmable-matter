import * as Immutable from 'immutable';
import Type from '../Type';

export type Env = Immutable.Map<string, Type>;

export function env(bindings?: { [s: string]: Type }): Env {
  if (bindings) return Immutable.Map(bindings);
  else return Immutable.Map();
}
