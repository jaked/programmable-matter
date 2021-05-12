import * as Immutable from 'immutable';
import Try from '../../util/Try';
import { Interface } from '../../model';
import Type from '../Type';
import { parseType } from '../Parse';

export type Env = Immutable.Map<string, Interface>;

export function env(bindings?: { [s: string]: string | Type | Try<{ type: Type, dynamic: boolean }> }): Env {
  if (bindings)
    return Immutable.Map(bindings).map(type => {
      if (typeof type === 'string')
        return Try.ok({ type: parseType(type), dynamic: false });
      else if ('kind' in type) // TODO(jaked) Type.isType
        return Try.ok({ type, dynamic: false });
      else
        return type;
    });
  else
    return Immutable.Map();
}
